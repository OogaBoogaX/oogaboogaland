import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage } from '../src/host-body-storage.js';
import { createOogaBodySessions } from '../src/ooga-body-sessions.js';
const world = 'ooga-session-fixture', profile = 'standing-1';
const mapped = { world, profile, name: 'owner' }, codec = globalThis.BL.oogaBody.codec(mapped);
const equipment = { weapon: null, mode: 'carry', primaryOwned: true, secondaryOwned: true,
  selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: true };
function fixture({ admission = false } = {}) {
  let rows = new Map(), now = 100000, fail = false, blocked = false;
  const memory = { transaction: async fn => {
    const draft = structuredClone(rows);
    const value = await fn({ get: async k => Array.isArray(k) ? new Map(k.filter(x => draft.has(x)).map(x => [x, structuredClone(draft.get(x))])) : structuredClone(draft.get(k)),
      put: async (k, v) => {
        if (fail) { fail = false; throw Error('storage unavailable'); }
        for (const [name, data] of typeof k === 'string' ? [[k, v]] : Object.entries(k)) draft.set(name, structuredClone(data));
      }, delete: async k => { for (const key of Array.isArray(k) ? k : [k]) draft.delete(key); } });
    rows = draft; return value;
  } };
  const storage = () => createHostBodyStorage({ storage: memory, profile: 'ooga-body-1',
    capture: () => { throw Error('transaction adapter must own capture'); },
    validate: v => { codec.read(v); return true; } });
  const simulation = { version: world, checkpointBytes: 65536, initial: () => ({ ticks: 0 }), validate: s => Number.isSafeInteger(s.ticks),
    step: s => s.ticks++, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  let spawnMode = 'valid', spawnCalls = 0;
  if (admission) {
    simulation.project = state => ({ npcs: [{ id: 'npc:owner', kind: 'ooga', x: 1 + state.ticks, y: 9, z: 2, yaw: .5,
      activity: 'working', phase: 'walk', route: 'track-1', progress: 0, seed: 1 }], hub: { pile: 0 } });
    simulation.npcFor = (_, bodyId) => bodyId === 'player:1' ? 'npc:owner' : null;
    simulation.playerSpawn = (state, who) => {
      spawnCalls++; assert.equal(who.handle, 'owner');
      if (spawnMode === 'forbidden') throw Error('spawn should not run on reclaim');
      return { npcId: 'npc:owner', feetOffset: 1, zone: 'outside', body: { kind: 'ooga', equipment,
        motion: { x: state.ticks + (spawnMode === 'misplaced' ? 2 : 1), y: 8, z: 2, yaw: .5, vx: 5, vy: 3, vz: 0, grounded: false } } };
    };
  }
  const make = () => new VirtualHost({ storage: storage(), simulation, clock: () => now,
    sessionAdapter: createOogaBodySessions({ identityFor: i => {
      if (i.accountId !== 1 || i.bodyId !== 'player:1') throw Error('identity unavailable'); return mapped;
    }, placement: (_, p) => { if (blocked || p.y < 0) throw Error('standing shape obstructed'); return { grounded: p.y === 0 }; } }) });
  return { make, storage, at: t => { now = t; }, fail: () => { fail = true; }, block: v => { blocked = v; },
    rows: () => structuredClone(rows), spawnMode: value => { spawnMode = value; }, spawnCalls: () => spawnCalls };
}

test('world admission samples the current NPC at offer without moving its track, and reclaim keeps the frozen body', async () => {
  const candidate = { accountId: 1, bodyId: 'player:1', handle: 'owner', kind: 'ooga' };
  const missing = fixture(), noWorld = missing.make(), missingTicket = await noWorld.begin('missing', 120000);
  const unchanged = missing.rows();
  await assert.rejects(noWorld.prepareWorldBody(missingTicket, candidate), /spawn adapter required/);
  assert.deepEqual(missing.rows(), unchanged);
  const f = fixture({ admission: true }), host = f.make(), ticket = await host.begin('host-a', 120000);
  const before = f.rows(), prepared = await host.prepareWorldBody(ticket, candidate);
  assert.deepEqual(f.rows(), before); assert.equal(f.spawnCalls(), 0);
  assert.equal(prepared.claim.body, undefined); assert.equal(prepared.claim.zone, undefined, 'older hosts cannot mistake source claims for legacy admission');
  f.at(100250); await host.tick(ticket, []);
  const worldBeforeOffer = structuredClone(f.rows().get(HOST.key).host.simulation);
  f.spawnMode('misplaced');
  await assert.rejects(host.offerBody(ticket, [], 1, prepared.claim, prepared.preparation), /start at its NPC/);
  assert.deepEqual(f.rows().get(HOST.key).host.simulation, worldBeforeOffer);
  f.spawnMode('valid');
  await assert.rejects(host.offerBody(ticket, [], 1, { ...prepared.claim, zone: 'outside' }, prepared.preparation), /body source/);
  const offer = await host.offerBody(ticket, [], 1, prepared.claim, prepared.preparation), ref = offer.result.session;
  assert.equal(offer.transfer.view.motion.x, 2, 'NPC moved after preparation');
  assert.equal(offer.transfer.view.motion.y, 8, 'root offset becomes feet position');
  assert.equal(offer.transfer.view.motion.vx, 0); assert.equal(offer.transfer.view.motion.vy, 0);
  assert.deepEqual(f.rows().get(HOST.key).host.simulation, worldBeforeOffer, 'player admission leaves NPC track untouched');
  const active = await host.activateBody(ticket, [ref.token], 1, ref, offer.transfer);
  await host.startedBody(ticket, [ref.token], 1, ref, active.transfer);
  await host.disconnect(ticket, [ref.token], ref, 100250);
  f.at(100500); await host.tick(ticket, []); f.spawnMode('forbidden');
  const reconnect = await host.prepareWorldBody(ticket, { ...candidate, kind: 'clanker' });
  assert.equal(reconnect.kind, 'ooga', 'reconnect preserves the held body kind');
  const resumed = await host.offerBody(ticket, [], 1, reconnect.claim, reconnect.preparation);
  assert.equal(resumed.transfer.view.motion.x, 2); assert.equal(resumed.transfer.view.deadline, 160250);
  assert.equal(f.rows().get(HOST.key).host.simulation.ticks, 2, 'NPC kept advancing independently');
});

test('actual host atomically accepts Ooga movement and owned equipment selection, freezes and reclaims after restart', async t => {
  const f = fixture(), host = f.make(); let ticket = await host.begin('host-a', 120000);
  const claim = { protocol: SESSION_PROTOCOL, world, accountId: 1, bodyId: 'player:1', zone: 'outside', body: {
    kind: 'ooga', motion: { x: 1, y: 8, z: 2, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: false }, equipment } };
  const prepare = await host.prepareBody(ticket, 1, 'player:1');
  const offered = await host.offerBody(ticket, [], 1, claim, prepare), ref = offered.result.session;
  assert.equal(offered.transfer.checkpoint.kind, 'ooga');
  const active = await host.activateBody(ticket, [ref.token], 1, ref, offered.transfer);
  await host.startedBody(ticket, [ref.token], 1, ref, active.transfer);
  const selected = { ...equipment, weapon: 'gun', mode: 'combat', selectedSlot: 2, jetpack: true };
  const checkpoint = codec.encode({ x: 4, y: 12, z: 3, yaw: .5 }, selected);
  await host.updateObservedBody(ticket, [ref.token], 1, ref, { sequence: 1, checkpoint }, 100000);
  const committed = f.rows();
  assert.deepEqual((await host.bodyReferenceState(ticket, 1, ref)).equipment, selected);
  await host.updateObservedBody(ticket, [ref.token], 1, ref, { sequence: 1, checkpoint }, 100000);
  assert.deepEqual(f.rows(), committed, 'exact retry cannot refresh presence or rewrite state');
  for (const flags of [{ unlimited: true }, { primaryOwned: false }, { jetpackOwned: false, jetpack: false }]) {
    await assert.rejects(host.updateObservedBody(ticket, [ref.token], 1, ref, { sequence: 2,
      checkpoint: codec.encode(checkpoint.position, { ...selected, ...flags }) }, 100000), /Ooga/);
    assert.deepEqual(f.rows(), committed, 'selection cannot change entitlements');
  }
  await assert.rejects(host.updateObservedBody(ticket, [ref.token], 1, ref, { sequence: 1,
    checkpoint: codec.encode(checkpoint.position, equipment) }, 100000), /movement/);
  assert.deepEqual(f.rows(), committed, 'same sequence cannot replace the committed selection');
  const bytes = v => Buffer.byteLength(JSON.stringify(v));
  const measure = (phase, rows) => {
    const root = [...rows.values()].find(v => v?.host?.sessions);
    const body = [...rows.values()].find(v => v?.body?.kind === 'ooga');
    t.diagnostic(JSON.stringify({ phase, checkpoint: bytes(body.body.checkpoint),
      session: bytes(root.host.sessions.sessions[0]), bodyRecord: bytes(body),
      sessionPlusBody: bytes(root.host.sessions.sessions[0]) + bytes(body),
      allStoredValues: [...rows.values()].reduce((n, v) => n + bytes(v), 0),
      allStoredKeys: [...rows.keys()].reduce((n, k) => n + Buffer.byteLength(k), 0) }));
  };
  measure('accepted movement', committed); f.fail();
  await assert.rejects(host.updateObservedBody(ticket, [ref.token], 1, ref,
    { sequence: 2, checkpoint: codec.encode({ x: 5, y: 12, z: 3, yaw: .5 }, equipment) }, 100000), /storage unavailable/);
  assert.deepEqual(f.rows(), committed);
  f.block(true);
  await assert.rejects(host.updateObservedBody(ticket, [ref.token], 1, ref,
    { sequence: 2, checkpoint: codec.encode({ x: 5, y: 12, z: 3, yaw: .5 }, equipment) }, 100000), /obstructed/);
  f.block(false); assert.deepEqual(f.rows(), committed);
  await host.disconnect(ticket, [ref.token], ref, 100000);
  f.at(110000); const restarted = f.make(); ticket = await restarted.claim('host-b');
  const preparedAgain = await restarted.prepareBody(ticket, 1, 'player:1');
  const resumed = await restarted.offerBody(ticket, [], 1, { ...claim, body: undefined }, preparedAgain);
  assert.equal(resumed.result.resumed, true); assert.equal(resumed.transfer.view.deadline, 160000);
  assert.deepEqual(resumed.transfer.checkpoint, checkpoint);
  assert.deepEqual(resumed.transfer.view.equipment, selected);
  assert.equal(resumed.transfer.view.motion.vy, 0);
  const stored = await f.storage().transaction(tx => tx.bodies());
  assert.deepEqual(stored[0].checkpoint, checkpoint);
  assert.ok(Buffer.byteLength(JSON.stringify(stored[0])) < 1024, 'body row only; root session metadata measured separately');
  measure('offered after restart', f.rows());
});
