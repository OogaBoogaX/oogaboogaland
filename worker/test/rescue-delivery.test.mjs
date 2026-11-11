// Real host/sidecar, validated Room handoff rows, private HTTP boundary and
// transactional public cache. In-memory stores only; no browser or local DB.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { HostRescue } from '../src/host-rescue.js';
import { RoomBodyHandoff, ROOM_BODY } from '../src/room-body-handoff.js';
import { observeRoomRescue } from '../src/room-rescue.js';
import { RescueDelivery, RescueGuestCache } from '../src/rescue-delivery.js';
import { createRescueHandler } from '../src/rescue-http.js';
const routes = Array.from({ length: 300 }, (_, i) => [[i % 20 * 500 - 4700, 0, Math.floor(i / 20) * 500 - 3500]]);
const identity = { accountId: 1, connection: 'current-connection' };
const adopt = { kind: 'adopt', sequence: 1, stray: [0, 1], name: 'Pip', breed: 0 };
function memory() {
  let data = new Map(), tail = Promise.resolve(), failure = false, writes = 0;
  const read = key => structuredClone(data.get(key));
  return { get: async key => read(key), read, writes: () => writes, fail: () => { failure = true; },
    transaction(fn) {
      const work = tail.then(async () => {
        const draft = structuredClone(data); let count = 0;
        const out = await fn({ get: async key => structuredClone(draft.get(key)), put: async (key, value) => {
          if (failure) { failure = false; throw Error('injected cache failure'); }
          draft.set(key, structuredClone(value)); count++;
        } }); data = draft; writes += count; return out;
      }); tail = work.catch(() => {}); return work;
    } };
}
async function fixture() {
  let now = 100000; const storage = memory(), roomStorage = memory(), cacheStorage = memory();
  const simulation = { version: 'fixture-rescue-delivery', checkpointBytes: 4096, initial: () => ({ n: 0 }),
    validate: value => Number.isInteger(value.n), step: value => value.n++, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null };
  const host = new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
  const ticket = await host.begin('owner', 120000), roomTicket = { world: ticket.world, epoch: ticket.fence, owner: ticket.owner };
  const ref = (await host.connect(ticket, [], { protocol: SESSION_PROTOCOL, world: ticket.world, accountId: 1, bodyId: 'player:1', zone: 'dsb-outside',
    body: { kind: 'ooga', motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
      equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } })).result.session;
  const players = new Map([[1, { id: 1, connectionToken: identity.connection, body: ref.bodyId, zone: 'dsb-outside', bodyClosing: false, bodyClosedAt: null }]]);
  const box = new RoomBodyHandoff({ storage: roomStorage, clock: () => now, current: who => players.get(who.accountId)?.connectionToken === who.connection, send: () => true });
  const row = { v: 2, revision: 6, ...identity, request: '1'.repeat(32), kind: 'ooga',
    preparation: { v: 1, world: ticket.world, epoch: 1, accountId: 1, bodyId: ref.bodyId, generation: 0, nextGeneration: 1, expiresAt: 110000 },
    claim: null, phase: 'live', at: now, ref, pending: null, closedAt: null, liveSent: true,
    transfer: { v: 1, protocol: SESSION_PROTOCOL, world: ticket.world, epoch: 1, revision: 3, at: now, expiresAt: now + 1000,
      resetResources: 'defaults', view: { accountId: 1, bodyId: ref.bodyId, generation: ref.generation, kind: 'ooga', state: 'starting', deadline: now + 60000, zone: 'dsb-outside' }, checkpoint: { fixture: true } } };
  await roomStorage.transaction(async tx => { await tx.put(ROOM_BODY.key, [1]); await tx.put(ROOM_BODY.prefix + 1, row); });
  const room = { players, ctx: { storage: roomStorage }, bodyHandoffController: () => box,
    checkBodyHandoff: t => { assert.deepEqual(t, roomTicket); }, rescueObservation: (t, who) => observeRoomRescue(room, t, who) };
  const rescue = new HostRescue({ host, routes }), cache = new RescueGuestCache({ storage: cacheStorage, world: ticket.world, clock: () => now });
  const delivery = new RescueDelivery({ host, room, rescue, ticket, roomTicket, cache, clock: () => now });
  await delivery.tick();
  return { storage, roomStorage, cacheStorage, cache, host, room, rescue, delivery, ticket, roomTicket, players, box, row, ref,
    at: value => { now = value; }, clock: () => now };
}

test('rescue commands derive owner from real Room handoff observation and acknowledge the committed result exactly once', async () => {
  const f = await fixture();
  assert.equal((await f.delivery.command({ ...identity, accountId: 2 }, adopt)).status, 'blocked');
  assert.equal((await f.delivery.command({ ...identity, connection: 'old-connection' }, adopt)).status, 'blocked');
  const first = await f.delivery.command(identity, adopt), writes = f.storage.writes();
  assert.equal(first.status, 'ok'); assert.equal(first.result.ok, true); assert.equal(first.frame.dogs.length, 299);
  assert.deepEqual(await f.delivery.command(identity, adopt), first); assert.equal(f.storage.writes(), writes);
  await assert.rejects(f.delivery.command(identity, { ...adopt, name: 'Changed retry' }), /changed retry/);
  const privateView = await f.delivery.read(identity);
  assert.equal(privateView.session.dog.id, 'stray:0:1'); assert.equal(privateView.session.sequence, 1);
  assert.equal(privateView.context.accountId, 1); assert.equal(JSON.stringify(privateView).includes(f.ref.token), false);
  assert.equal(Object.hasOwn(privateView.frame, 'companions'), false);
});

test('rescue observation rejects closing, unsettled and travelling identities; host revision fences a raced observation', async () => {
  const f = await fixture(), p = f.players.get(1);
  p.bodyClosing = true; assert.equal((await f.delivery.command(identity, adopt)).status, 'blocked'); p.bodyClosing = false;
  p.zone = 'outside'; assert.equal((await f.delivery.command(identity, adopt)).status, 'blocked'); p.zone = 'dsb-outside';
  const original = f.room.rescueObservation;
  f.room.rescueObservation = async (...args) => {
    const observed = await original(...args);
    await f.host.connect(f.ticket, [f.ref.token], { protocol: SESSION_PROTOCOL, world: f.ticket.world, accountId: 2, bodyId: 'player:2', zone: 'dsb-outside',
      body: { kind: 'ooga', motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
        equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } });
    return observed;
  };
  assert.equal((await f.delivery.command(identity, adopt)).status, 'superseded');
  f.room.rescueObservation = original;
  assert.equal((await f.delivery.read(identity)).session.dog, null);
});

test('guest cache is public-only, monotonic and cannot wake or mutate the host; cache failure does not lose a committed receipt', async () => {
  const f = await fixture(), old = await f.delivery.public();
  f.cacheStorage.fail(); const out = await f.delivery.command(identity, adopt); assert.equal(out.result.ok, true);
  assert.equal((await f.delivery.public()).dogs.length, 300, 'cache failure is explicit eventual-delivery work, not a replay');
  await f.delivery.tick(); const current = await f.delivery.public(); assert.equal(current.dogs.length, 299);
  assert.equal(await f.cache.publish(old), false); assert.deepEqual(await f.delivery.public(), current);
  await assert.rejects(f.cache.publish({ ...current, companions: [] }), /public frame/);
  const writes = f.storage.writes(); f.host.bodyLifecycleRevision = () => { throw Error('guest must never call host'); };
  f.delivery.close(); assert.deepEqual(await f.delivery.public(), current); assert.equal(f.storage.writes(), writes);
  assert.equal(JSON.stringify(current).includes('Pip'), false); assert.equal(JSON.stringify(current).includes(f.ref.token), false);
  f.at(current.at + 86400001); assert.equal(await f.delivery.public(), null);
});

test('private poses require the authenticated current context and never appear in public guest data', async () => {
  const f = await fixture(); await f.delivery.command(identity, adopt);
  const snapshot = await f.delivery.read(identity), pose = { sequence: 1, x: 1, y: 0, z: 2, yaw: 0, activity: 'follow' };
  const input = { context: snapshot.context, dog: snapshot.session.dog.id, pose };
  assert.equal((await f.delivery.pose(identity, { ...input, context: { ...input.context, accountId: 2 } })).status, 'superseded');
  assert.equal((await f.delivery.pose(identity, input)).status, 'accepted');
  assert.equal((await f.delivery.read(identity)).companions.companions.length, 1);
  assert.equal(Object.hasOwn(await f.delivery.public(), 'companions'), false);
  f.at(102001); assert.equal((await f.delivery.read(identity)).companions.companions.length, 0);
});

test('HTTP boundary enforces same-origin session identity, connection, size and methods without exposing private data publicly', async () => {
  const f = await fixture(); let signedIn = true, permitted = true;
  const handler = createRescueHandler({ delivery: f.delivery, env: { SITE_ORIGIN: 'https://island.test' },
    authenticate: async () => signedIn ? { player: { id: 1 } } : null, admit: async () => permitted });
  const request = (path, { method = 'GET', body, origin = 'https://island.test', connection = identity.connection } = {}) => new Request(`https://island.test/api/rescue/${path}`, {
    method, headers: { origin, 'x-room-token': connection, 'x-player-id': '999', 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  assert.equal((await handler(request('command', { method: 'POST', body: adopt, origin: 'https://evil.test' }))).status, 403);
  signedIn = false; assert.equal((await handler(request('state'))).status, 401);
  const publicResponse = await handler(request('public')); assert.equal(publicResponse.status, 200); assert.equal(publicResponse.headers.get('cache-control'), 'public, max-age=1');
  signedIn = true; permitted = false; assert.equal((await handler(request('state'))).status, 429); permitted = true;
  assert.equal((await handler(request('command', { method: 'POST', body: ' '.repeat(1025) }))).status, 400);
  assert.equal((await handler(request('command'))).status, 405);
  const answer = await handler(request('command', { method: 'POST', body: adopt })); assert.equal(answer.status, 200);
  assert.equal((await answer.json()).result.ok, true);
  const own = await handler(request('state')); assert.equal(own.headers.get('cache-control'), 'no-store');
  const view = await own.json(); assert.equal(view.context.accountId, 1); assert.equal(view.session.dog.name, 'Pip');
  const guest = JSON.stringify(await (await handler(request('public'))).json());
  assert.equal(guest.includes('Pip'), false); assert.equal(guest.includes('accountId'), false);
});

test('private snapshot inherits the dog but never presents an old generation receipt under a new session', async () => {
  const f = await fixture(); await f.delivery.command(identity, adopt);
  const old = f.storage.read(HOST.key).sessions.sessions[0];
  const replacement = (await f.host.connect(f.ticket, [f.ref.token], { protocol: SESSION_PROTOCOL, world: f.ticket.world, accountId: 1,
    bodyId: 'player:1', zone: 'dsb-outside', body: structuredClone(old.body) })).result.session;
  const revision = await f.host.bodyLifecycleRevision(f.ticket);
  const out = await f.rescue.privateSnapshot(f.ticket, { ready: true, revision, tokens: [replacement.token] },
    { accountId: replacement.accountId, generation: replacement.generation, token: replacement.token });
  assert.equal(out.result.dog.id, 'stray:0:1'); assert.equal(out.result.sequence, 1);
  assert.equal(out.result.command, null); assert.equal(out.result.receipt, null);
});

test('closing delivery during a private read cannot repopulate its volatile companion relay', async () => {
  const f = await fixture(); await f.delivery.command(identity, adopt);
  const original = f.rescue.privateSnapshot.bind(f.rescue); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  f.rescue.privateSnapshot = async (...args) => { const out = await original(...args); entered(); await new Promise(resolve => { release = resolve; }); return out; };
  const pending = f.delivery.read(identity); await waiting; f.delivery.close(); release();
  await assert.rejects(pending, /closed/); assert.equal(f.delivery.relay.owners.size, 0); assert.equal(f.delivery.relay.poses.size, 0);
});

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
function clientFor(f, intercept = (_, run) => run()) {
  const frames = [], privates = [], sessions = [], receipts = [], paths = [], errors = [], lost = [];
  const handler = createRescueHandler({ delivery: f.delivery, env: { SITE_ORIGIN: 'https://island.test' },
    authenticate: async () => ({ player: { id: 1 } }), admit: async () => true });
  const fetcher = (path, options) => { paths.push(path); return intercept(path, () => handler(new Request(`https://island.test${path}`,
    { ...options, headers: { ...options.headers, origin: 'https://island.test' } })), options); };
  const context = { window: {}, TextEncoder, AbortController, fetch: fetcher };
  for (const name of ['rescue-shared', 'rescue-client']) runInNewContext(readFileSync(new URL(`../../src/js/${name}.js`, import.meta.url), 'utf8'), context);
  const client = context.window.BL.rescueClient.create({ world: f.ticket.world, fetcher, clock: f.clock,
    onFrame: value => { frames.push(value); return true; }, onPrivate: (value, who) => { privates.push({ value, who }); return true; },
    onSession: value => sessions.push(value), onReceipt: (command, result) => receipts.push({ command, result }), onLost: () => lost.push(true), onError: value => errors.push(value) });
  client.setConnection({ accountId: 1, connection: identity.connection, zone: 'dsb-outside' });
  return { client, frames, privates, sessions, receipts, paths, errors, lost };
}

test('browser rescue client acknowledges through the real HTTP/host path and recovers a lost reply without another mutation', async () => {
  const f = await fixture(); let lose = true;
  const r = clientFor(f, async (path, run) => { const response = await run(); if (path.endsWith('/command') && lose) { lose = false; throw Error('lost reply'); } return response; });
  await r.client.refresh(); assert.equal(r.client.ready, true);
  const { sequence, ...input } = adopt;
  await assert.rejects(r.client.command(input), /lost reply/); const writes = f.storage.writes();
  assert.equal(r.receipts.length, 0, 'no optimistic adoption'); assert.equal(r.client.pending, true);
  await r.client.refresh(); assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].result.dog.id, 'stray:0:1');
  assert.equal(r.client.pending, false); assert.equal(f.storage.writes(), writes);
  assert.equal(r.paths.filter(path => path.endsWith('/command')).length, 1); r.client.dispose();
});

test('browser rescue client retries only an identical pending sequence and coalesces a late acknowledged response', async () => {
  const f = await fixture(); let drop = true; const commands = [];
  const r = clientFor(f, async (path, run, options) => { if (path.endsWith('/command')) { commands.push(options.body); if (drop) { drop = false; throw Error('before send'); } } return run(); });
  await r.client.refresh(); const { sequence, ...input } = adopt;
  await assert.rejects(r.client.command(input), /before send/);
  f.at(101000); await r.client.refresh(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(commands.length, 2); assert.equal(commands[0], commands[1]); assert.equal(r.receipts.length, 1);
  r.client.dispose();
  const g = await fixture(); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const q = clientFor(g, async (path, run) => { const out = await run(); if (path.endsWith('/command')) { entered(); await new Promise(resolve => { release = resolve; }); } return out; });
  await q.client.refresh(); const pending = q.client.command(input); await waiting;
  await q.client.refresh(); assert.equal(q.receipts.length, 1); release(); assert.equal((await pending).ok, true);
  assert.equal(q.receipts.length, 1); q.client.dispose();
});

test('browser rescue client fences late scene/account responses and guest reads never fetch private state', async () => {
  const f = await fixture(); let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const r = clientFor(f, async (_, run) => { const response = await run(); entered(); await new Promise(resolve => { release = resolve; }); return response; });
  const pending = r.client.refresh(); await waiting; r.client.dispose(); release(); await assert.rejects(pending, /visit changed/);
  assert.equal(r.frames.length, 0); assert.equal(r.privates.length, 0); assert.equal(r.sessions.length, 0);
  const guest = clientFor(f); guest.client.setConnection({ accountId: null, connection: '', zone: 'dsb-outside' });
  assert.equal(await guest.client.refresh(), true); assert.deepEqual(guest.paths, ['/api/rescue/public']);
  assert.equal(guest.privates.length, 0); assert.equal(guest.client.ready, false);
  await assert.rejects(guest.client.command({ kind: 'scoop', pile: 1 }), /not ready/); guest.client.dispose();
});

test('a scheduled refresh from an abandoned zone cannot clear a newer private scene after its ignored abort resolves', async () => {
  const f = await fixture(); let first = true, release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const r = clientFor(f, async (_, run) => {
    const response = await run();
    if (first) { first = false; entered(); await new Promise(resolve => { release = resolve; }); return response; }
    // Controlled second-scene response isolates the client's callback race.
    const value = await response.json(); value.context.zone = value.session.zone = value.companions.zone = 'dsb-puppy-rescue';
    return Response.json(value);
  });
  r.client.update(0); await waiting;
  r.client.setConnection({ accountId: 1, connection: identity.connection, zone: 'dsb-puppy-rescue' }); await r.client.refresh();
  assert.equal(r.client.ready, true); const lost = r.lost.length, views = r.privates.length;
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(r.lost.length, lost); assert.equal(r.privates.length, views); assert.equal(r.client.context.zone, 'dsb-puppy-rescue'); r.client.dispose();
});

test('uncertain rescue commands resume after three failures with bounded backoff and the same payload', async () => {
  const f = await fixture(), bodies = []; let failures = 3;
  const r = clientFor(f, async (path, run, options) => {
    if (path.endsWith('/command')) { bodies.push(options.body); if (failures-- > 0) throw Error('offline command'); }
    return run();
  });
  await r.client.refresh(); const { sequence, ...input } = adopt;
  await assert.rejects(r.client.command(input), /offline command/);
  await r.client.refresh(); assert.equal(bodies.length, 1, 'no immediate retry loop');
  for (const at of [101000, 103000, 107000]) { f.at(at); await r.client.refresh(); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(bodies.length, 4); assert.ok(bodies.every(body => body === bodies[0]));
  assert.equal(r.receipts.length, 1); assert.equal(r.client.pending, false); r.client.dispose();
});

test('shared rescue accepts every real DSB scene zone, including outside and the rescue interior', () => {
  const source = readFileSync(new URL('../../src/js/scene-dsb.js', import.meta.url), 'utf8');
  const zones = JSON.parse(source.match(/const VOICE_ZONES=(\{[^;]+\});/)[1]);
  for (const zone of ['dsb-outside', ...Object.values(zones)]) assert.equal(globalThis.BL.rescueShared.zoneId(zone), true, zone);
  for (const zone of ['outside', 'dsbevil', 'dsb:../../private', '', null]) assert.equal(globalThis.BL.rescueShared.zoneId(zone), false);
});
