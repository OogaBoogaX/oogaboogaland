import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { RESCUE, initialRescue, validateRoutes, validateRescue, advanceRescue, addPile, rescueCommand, reconcileRescue, projectRescue } from '../src/rescue-world.js';
import { HostRescue, RESCUE_KEY, RescueCompanionRelay } from '../src/host-rescue.js';
const shared = globalThis.BL.rescueShared;
const routes = Array.from({ length: 300 }, (_, i) => [[(i % 20) * 800 - 7600, 0, Math.floor(i / 20) * 800 - 5600], [(i % 20) * 800 - 7500, 0, Math.floor(i / 20) * 800 - 5600]]);
const descriptor = (revision = 1) => ({ world: 'fixture-rescue', epoch: 1, revision, at: 100000 + revision });
const who = (accountId = 1, generation = 1) => ({ accountId, generation });
const adopt = (sequence = 1, stray = [0, 1], breed = 0) => ({ kind: 'adopt', sequence, stray, breed, name: 'Rex' });
function memory() {
  let data = new Map(), tail = Promise.resolve(), fail = false;
  const store = { writes: 0, bytes: 0,
    transaction(fn) {
      const next = tail.then(async () => {
        const draft = structuredClone(data); let writes = 0, bytes = 0;
        const out = await fn({ get: async k => structuredClone(draft.get(k)), put: async (k, v) => {
          if (fail) { fail = false; throw Error('storage unavailable'); }
          writes++; bytes += Buffer.byteLength(JSON.stringify(v)); draft.set(k, structuredClone(v));
        } });
        data = draft; store.writes += writes; store.bytes += bytes; return out;
      }); tail = next.catch(() => {}); return next;
    },
    read: key => structuredClone(data.get(key)),
    failNext: () => { fail = true; },
    replace: (key, v) => data.set(key, structuredClone(v)),
  }; return store;
}
async function harness() {
  let now = 100000;
  const storage = memory(), simulation = { version: 'fixture-rescue', checkpointBytes: 4096,
    initial: () => ({ ticks: 0 }), validate: s => Number.isSafeInteger(s.ticks), step: s => { s.ticks++; },
    project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null };
  const make = () => new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now });
  const host = make(), ticket = await host.begin('owner', 120000), rescue = new HostRescue({ host, routes });
  const refs = [];
  const census = () => ({ ready: true, revision: storage.read(HOST.key).revision, tokens: refs.map(r => r.token) });
  const add = async (accountId = 1, zone = 'dsb') => {
    const claim = { protocol: SESSION_PROTOCOL, world: simulation.version, accountId, bodyId: `fixture-${accountId}`, zone,
      body: { kind: 'ooga', motion: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
        equipment: { weapon: null, mode: 'carry', primaryOwned: false, secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } };
    const ref = (await host.connect(ticket, census().tokens, claim)).result.session;
    delete ref.bodyId; refs.push(ref); return ref;
  };
  return { storage, host, ticket, rescue, refs, census, add, make, at: value => { now = value; }, now: () => now };
}

test('rescue model keeps 300 deterministic identities independent of viewer tier and restarts', () => {
  const a = initialRescue(100000, routes), b = structuredClone(a);
  for (const now of [100000, 101000, 103000, 105000]) { advanceRescue(a, routes, now, true); advanceRescue(b, routes, now, true); }
  assert.deepEqual(a, b); validateRescue(a, routes);
  const frame = projectRescue(a, routes, descriptor()), receiver = shared.create('fixture-rescue');
  assert.equal(receiver.accept(frame), true);
  assert.equal(receiver.visibleDogs('high').length, 300); assert.equal(receiver.visibleDogs('medium').length, 150); assert.equal(receiver.visibleDogs('low').length, 60);
  assert.equal(receiver.current.dogs.length, 300); assert.deepEqual(a, b);
  assert.throws(() => { receiver.current.dogs[0][1] = 99; }, TypeError);
});

test('rescue empty-land and unknown outage restore clock/RNG without catch-up piles', () => {
  const s = initialRescue(100000, routes); advanceRescue(s, routes, 100000, true); advanceRescue(s, routes, 101000, true);
  advanceRescue(s, routes, 101250, false); const frozen = structuredClone(s);
  assert.equal(advanceRescue(s, routes, 200000, false), false); assert.deepEqual(s, frozen);
  advanceRescue(s, routes, 100000000, true); assert.equal(s.clock, frozen.clock); assert.deepEqual(s.dogs, frozen.dogs); assert.deepEqual(s.piles, frozen.piles);
  advanceRescue(s, routes, 100001000, true); const before = structuredClone(s);
  advanceRescue(s, routes, 100100000, true); assert.equal(s.clock, before.clock); assert.deepEqual(s.dogs, before.dogs);
});

test('rescue ring replaces exactly oldest at 512 and stale scoop cannot remove its replacement', () => {
  const s = initialRescue(100000, routes);
  for (let i = 0; i < 513; i++) addPile(s, [i, 0, 0]);
  assert.equal(s.piles.length, 512); assert.equal(s.piles[0][0], 2); assert.equal(s.piles.at(-1)[0], 513);
  const stale = rescueCommand(s, who(), { kind: 'scoop', sequence: 1, pile: 1 }, 100000);
  assert.equal(stale.result.ok, false); assert.equal(s.piles.length, 512);
  const clean = rescueCommand(s, who(), { kind: 'scoop', sequence: 2, pile: 2 }, 100250);
  assert.equal(clean.result.ok, true); assert.equal(s.piles.length, 511);
  const duplicate = rescueCommand(s, who(), { kind: 'scoop', sequence: 2, pile: 2 }, 100500);
  assert.equal(duplicate.changed, false); assert.deepEqual(duplicate.result, clean.result); validateRescue(s, routes);
});

test('rescue adoption removes exact generation, retries once and replacement never revives adopted dog', () => {
  const s = initialRescue(100000, routes); advanceRescue(s, routes, 100000, true);
  const first = rescueCommand(s, who(), adopt(), 100000); assert.equal(first.result.ok, true);
  const before = structuredClone(s); assert.deepEqual(rescueCommand(s, who(), adopt(), 100000).result, first.result); assert.deepEqual(s, before);
  assert.throws(() => rescueCommand(s, who(), { ...adopt(), name: 'Other' }, 100250), /changed retry/);
  assert.equal(rescueCommand(s, who(2), adopt(), 100000).result.ok, false);
  assert.equal(projectRescue(s, routes, descriptor()).dogs.some(d => d[0] === 0), false);
  for (let t = 101000; t <= 145000; t += 1000) advanceRescue(s, routes, t, true);
  const d = projectRescue(s, routes, descriptor()).dogs.find(d => d[0] === 0); assert.equal(d[1], 2);
  assert.equal(rescueCommand(s, who(2), adopt(2), 145000).result.ok, false);
  assert.equal(s.owners[0].dog.id, 'stray:0:1'); validateRescue(s, routes);
});

test('rescue owner generation fences old commands and exact release cannot touch a new adoption', () => {
  const s = initialRescue(100000, routes); rescueCommand(s, who(), adopt(), 100000);
  reconcileRescue(s, [who(1, 2)]);
  assert.throws(() => rescueCommand(s, who(), adopt(2), 100250), /generation/);
  assert.equal(rescueCommand(s, who(1, 2), { kind: 'release', sequence: 1, dog: 'stray:0:1' }, 100250).result.ok, true);
  assert.equal(rescueCommand(s, who(1, 2), adopt(2, null, 2), 100500).result.ok, true);
  assert.equal(rescueCommand(s, who(1, 2), { kind: 'release', sequence: 3, dog: 'stray:0:1' }, 100750).result.ok, false);
  reconcileRescue(s, []); assert.equal(s.owners.length, 0); validateRescue(s, routes);
});

test('rescue receiver atomically refuses malformed/stale frames and tombstones are complete snapshots', () => {
  const s = initialRescue(100000, routes), id = addPile(s, [0, 0, 0]), receiver = shared.create('fixture-rescue');
  const first = projectRescue(s, routes, descriptor()); assert.equal(receiver.accept(first), true);
  rescueCommand(s, who(), { kind: 'scoop', sequence: 1, pile: id }, 100000);
  const next = projectRescue(s, routes, descriptor(2)); assert.equal(receiver.accept(next), true);
  assert.equal(receiver.accept(first), false); assert.equal(receiver.current.piles.length, 0);
  const bad = structuredClone(next); bad.dogs[0][4] = NaN; assert.equal(receiver.accept(bad), false);
  assert.equal(receiver.accept({ ...next, owners: [] }), false); assert.equal(receiver.accept({ ...next, world: 'other' }), false);
  assert.equal(receiver.accept({ ...next, piles: [[55, 0, 0, 0]] }), false); assert.deepEqual(receiver.current, next);
  const late = shared.create('fixture-rescue'); assert.equal(late.accept(next), true); assert.deepEqual(late.current, next);
});

test('public rescue projection cannot expose companions, account ids, session tokens or names', () => {
  const s = initialRescue(100000, routes); rescueCommand(s, who(928712), { ...adopt(), name: 'PrivateCompanion' }, 100000);
  const frame = projectRescue(s, routes, descriptor()), text = JSON.stringify(frame);
  assert.equal(text.includes('928712'), false); assert.equal(text.includes('PrivateCompanion'), false);
  assert.equal(frame.dogs.length, 299); assert.equal(shared.validate({ ...frame, companions: s.owners }), false);
});

test('host rescue uses real host fence, sessions and a ready revision-fenced census', async () => {
  const h = await harness(), ref = await h.add(), revision = h.census().revision;
  assert.equal((await h.rescue.tick(h.ticket, { ...h.census(), ready: false })).status, 'blocked');
  const first = await h.rescue.tick(h.ticket, h.census()); assert.equal(first.frame.dogs.length, 300);
  const writes = h.storage.writes; await h.add(2);
  assert.equal((await h.rescue.tick(h.ticket, { ...h.census(), revision })).status, 'superseded');
  assert.equal(h.storage.writes, writes + 1);
  await assert.rejects(h.rescue.command(h.ticket, h.census(), { ...ref, token: '0'.repeat(32) }, adopt()), /current DSB session/);
  const outsider = await h.add(3, 'outside');
  await assert.rejects(h.rescue.command(h.ticket, h.census(), outsider, adopt()), /current DSB session/);
  h.at(110001); const newer = await h.host.claim('newer');
  await assert.rejects(h.rescue.tick(h.ticket, h.census()), /fenced/);
  const recovery = await new HostRescue({ host: h.make(), routes }).tick(newer, h.census());
  assert.equal(recovery.frame.epoch, 2); assert.equal(recovery.frame.dogs.length, 300);
});

test('host rescue concurrent adoption and scooping commit once, lost replies replay and failed storage rolls back', async () => {
  const h = await harness(), a = await h.add(), b = await h.add(2); await h.rescue.tick(h.ticket, h.census());
  const outcomes = await Promise.all([h.rescue.command(h.ticket, h.census(), a, adopt()), h.rescue.command(h.ticket, h.census(), b, adopt())]);
  assert.equal(outcomes.filter(o => o.result.ok).length, 1);
  const writes = h.storage.writes; const retry = await h.rescue.command(h.ticket, h.census(), a, adopt());
  assert.equal(h.storage.writes, writes); assert.deepEqual(retry.result, outcomes[0].result);
  const row = h.storage.read(RESCUE_KEY), pile = addPile(row.state, [100, 0, 200]); h.storage.replace(RESCUE_KEY, row);
  h.at(100250); const before = h.storage.read(RESCUE_KEY); h.storage.failNext();
  await assert.rejects(h.rescue.command(h.ticket, h.census(), a, { kind: 'scoop', sequence: 2, pile }), /storage unavailable/);
  assert.deepEqual(h.storage.read(RESCUE_KEY), before);
  const scoops = await Promise.all([a, b].map(ref => h.rescue.command(h.ticket, h.census(), ref, { kind: 'scoop', sequence: 2, pile })));
  assert.equal(scoops.filter(r => r.result.ok).length, 1); assert.equal(scoops[0].frame.piles.length, 0);
});

test('host rescue empty ticks, duplicate commands and snapshot reads do not write; end of run stays closed', async () => {
  const h = await harness(); await h.rescue.tick(h.ticket, h.census()); const writes = h.storage.writes;
  h.at(105000); assert.equal((await h.rescue.tick(h.ticket, h.census())).changed, false);
  await h.rescue.snapshot(h.ticket, h.census()); await h.rescue.companions(h.ticket, h.census()); assert.equal(h.storage.writes, writes);
  const changedRoutes = structuredClone(routes); changedRoutes[0][0][0]++;
  await assert.rejects(new HostRescue({ host: h.host, routes: changedRoutes }).snapshot(h.ticket, h.census()), /incompatible checkpoint/);
  await h.host.stop(h.ticket, []);
  await assert.rejects(h.rescue.tick(h.ticket, h.census()), /fenced|finite run/);
});

test('host private companion roster and volatile relay clear travel, disconnect, release and old generations', async () => {
  const h = await harness(), ref = await h.add(); await h.rescue.command(h.ticket, h.census(), ref, adopt());
  const relay = new RescueCompanionRelay(), { companionRoster: roster } = await h.rescue.companions(h.ticket, h.census());
  assert.equal(relay.roster(roster), true);
  const c = roster.companions[0], poseRef = { world: roster.world, epoch: roster.epoch, revision: roster.revision, rescueRevision: roster.rescueRevision, bodyId: c.bodyId, accountId: c.accountId, generation: c.generation, dog: c.dog.id, zone: c.zone };
  const pose = { sequence: 1, x: 1, y: 0, z: 1, yaw: 0, activity: 'follow' };
  assert.equal(relay.offer(poseRef, pose, 100000), true); assert.equal(relay.frame('dsb', 100000).length, 1);
  assert.equal(relay.frame('outside', 100000).length, 0); assert.equal(relay.frame('dsb', 102001).length, 0);
  assert.equal(relay.offer(poseRef, { ...pose, sequence: 2 }, 100100), false);
  assert.equal(relay.offer({ ...poseRef, generation: 99 }, { ...pose, sequence: 2 }, 100250), false);
  const travel = { ...roster, revision: roster.revision + 1, companions: [{ ...c, zone: 'outside' }] };
  assert.equal(relay.roster(travel), true); assert.equal(relay.frame('dsb', 100250).length, 0);
  assert.equal(relay.offer(poseRef, { ...pose, sequence: 2 }, 100250), false);
  assert.equal(relay.offer({ ...poseRef, zone: 'outside', revision: travel.revision }, { ...pose, sequence: 2 }, 100250), true);
  assert.equal(relay.roster({ ...travel, revision: travel.revision + 1, companions: [] }), true); assert.equal(relay.frame('outside', 100300).length, 0);
  assert.equal(relay.roster(travel), false);
  assert.equal(relay.roster({ ...roster, epoch: 2 }), true);
  assert.equal(relay.offer(poseRef, pose, 100500), false, 'old epoch sample stays fenced after a takeover');
  const returned = { ...roster, epoch: 2, revision: travel.revision + 2 };
  relay.roster(returned);
  assert.equal(relay.offer({ ...poseRef, epoch: 2 }, pose, 100750), false, 'old scene revision stays fenced on returning to DSB');
  const fresh = new RescueCompanionRelay(); fresh.roster(roster); fresh.offer(poseRef, pose, 100000);
  h.at(100250); await h.rescue.command(h.ticket, h.census(), ref, { kind: 'release', sequence: 2, dog: c.dog.id });
  const released = (await h.rescue.companions(h.ticket, h.census())).companionRoster;
  assert.equal(fresh.roster(released), true); assert.equal(fresh.frame('dsb', 100250).length, 0);
});

test('rescue migration removes only legacy piles/count, preserves adoption/preferences and old-tab writes cannot revive them', () => {
  const entries = new Map(), localStorage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const B = { rescueShared: shared, rescueDogs: { POOP_CAP: 512, BREEDS: Array(6) }, rescueMenu: { NAME_MAX: 16 } };
  runInNewContext(readFileSync(new URL('../../src/js/rescue-dsb.js', import.meta.url), 'utf8'), { window: { BL: B }, localStorage, URLSearchParams, location: { search: '' } });
  const D = B.rescueDsb, legacy = { dogs: { owner: { name: 'Pip', breed: 3, adoptedAt: 10000, hunger: .2 } }, poops: [1, 0, 2], scooped: 33 };
  entries.set(D.KEY, JSON.stringify(legacy)); entries.set('unrelated.preference', 'keep');
  const store = D.load(); assert.equal(store.poops.length, 3);
  const receiver = shared.create('fixture-rescue'); assert.equal(D.retireLegacyPoop(store, receiver), false);
  receiver.accept(projectRescue(initialRescue(100000, routes), routes, descriptor()));
  assert.equal(D.retireLegacyPoop(store, receiver), true);
  const saved = JSON.parse(entries.get(D.KEY)); assert.deepEqual(saved.dogs, legacy.dogs); assert.equal(saved.shared, 1);
  assert.equal(Object.hasOwn(saved, 'poops'), false); assert.equal(Object.hasOwn(saved, 'scooped'), false); assert.equal(entries.get('unrelated.preference'), 'keep');
  // A still-open old build can write only the old key; the separate tombstone wins.
  entries.set(D.KEY, JSON.stringify(legacy)); const reload = D.load(); assert.equal(reload.poops.length, 0); assert.equal(reload.scooped, 0);
  D.save(reload); assert.equal(Object.hasOwn(JSON.parse(entries.get(D.KEY)), 'poops'), false);
});

test('rescue bounds reject invalid routes/checkpoints, full 512-pile frames stay under their byte budget', () => {
  assert.throws(() => validateRoutes(routes.slice(1)), /300/);
  const bad = structuredClone(routes); bad[0][1][0] = NaN; assert.throws(() => validateRoutes(bad), /route point/);
  const s = initialRescue(100000, routes);
  for (let i = 0; i < 512; i++) addPile(s, [-20000, 20000, -20000]);
  const frame = projectRescue(s, routes, descriptor()); assert.equal(shared.validate(frame), true);
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= RESCUE.bytes); validateRescue(s, routes);
  const altered = structuredClone(s); altered.piles.push([999, 0, 0, 0]); assert.throws(() => validateRescue(altered, routes), /checkpoint/);
  const duplicate = structuredClone(frame); duplicate.dogs[1][0] = 0; assert.equal(shared.validate(duplicate), false);
});

test('bounded rescue workload accounts for source bytes and logical writes separately from the host baseline', async t => {
  // Thirty logical seconds, 32 sessions, 300 dogs and an already full ring.
  // No wall-clock waiting, browser, external request, timer or provider account.
  const base = await harness(), h = await harness();
  for (let i = 1; i <= 32; i++) { await base.add(i); await h.add(i); }
  await h.rescue.tick(h.ticket, h.census());
  for (let i = 0; i < 32; i++) await h.rescue.command(h.ticket, h.census(), h.refs[i], adopt(1, null, i % 6));
  const row = h.storage.read(RESCUE_KEY);
  for (let i = 0; i < 512; i++) addPile(row.state, [i * 20 - 5000, 0, i * 15 - 4000]);
  h.storage.replace(RESCUE_KEY, row);
  const bw = base.storage.writes, hw = h.storage.writes, bb = base.storage.bytes, hb = h.storage.bytes;
  let bytes = 0, peak = 0;
  const begin = performance.now();
  for (let i = 1; i <= 30; i++) { base.at(100000 + i * 1000); await base.host.tick(base.ticket, base.census().tokens); }
  const baselineMs = performance.now() - begin, start = performance.now();
  for (let i = 1; i <= 30; i++) {
    h.at(100000 + i * 1000); await h.host.tick(h.ticket, h.census().tokens);
    const out = await h.rescue.tick(h.ticket, h.census()), size = Buffer.byteLength(JSON.stringify(out.frame));
    assert.equal(out.frame.dogs.length, 300); assert.equal(out.frame.piles.length, 512);
    bytes += size; peak = Math.max(peak, size);
  }
  const withRescueMs = performance.now() - start;
  assert.equal(h.storage.writes - hw - (base.storage.writes - bw), 30);
  t.diagnostic(JSON.stringify({ logicalSeconds: 30, sessions: 32, dogs: 300, piles: 512,
    baselineMs, withRescueMs, baselineWrites: base.storage.writes - bw, withRescueWrites: h.storage.writes - hw,
    baselineWriteBytes: base.storage.bytes - bb, withRescueWriteBytes: h.storage.bytes - hb,
    publicFrameBytes: bytes, maxPublicFrameBytes: peak, checkpointBytes: Buffer.byteLength(JSON.stringify(h.storage.read(RESCUE_KEY))),
    hypothetical32RecipientBytes: bytes * 32 }));
});
