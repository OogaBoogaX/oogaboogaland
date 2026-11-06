import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage } from '../src/host-body-storage.js';
import { createMixedBodySessions } from '../src/mixed-body-sessions.js';
import { createOogaBodySessions } from '../src/ooga-body-sessions.js';
import { createClankerBodySessions } from '../src/clanker-body-sessions.js';
import { fixture, worldId } from './fixtures/clanker-body-world-fixture.mjs';

// Transaction integration only: actual Clanker controller over authored props,
// Ooga record/placement callbacks, no full-world AI, Hub, browser or production.
test('mixed body routing commits both kinds atomically and preserves the other body through movement and restart', async () => {
  const f = fixture(), seed = f.make(); f.seed(seed);
  const initial = seed.codec.capture(), equipment = { weapon: null, mode: 'carry', primaryOwned: false,
    secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false };
  const ooga = globalThis.BL.oogaBody.codec({ world: worldId, profile: 'standing-1', name: 'ooga-owner' });
  let rows = new Map(), now = 100000, fail = false, created = 0, disposed = 0;
  const storage = { transaction: async fn => {
    const next = structuredClone(rows);
    const result = await fn({ get: async k => Array.isArray(k)
      ? new Map(k.filter(key => next.has(key)).map(key => [key, structuredClone(next.get(key))])) : structuredClone(next.get(k)),
    put: async (k, v) => { for (const [key, value] of typeof k === 'string' ? [[k, v]] : Object.entries(k)) next.set(key, structuredClone(value)); },
    delete: async k => { for (const key of Array.isArray(k) ? k : [k]) next.delete(key); } });
    if (fail) { fail = false; throw Error('commit unavailable'); }
    rows = next; return result;
  } };
  const bank = createHostBodyStorage({ storage, profile: 'mixed-fixture-1', capture: () => { throw Error('scoped capture required'); },
    validate: value => { if (value.kind === 'ooga') ooga.read(value); else seed.codec.records.read(value); return true; } });
  const adapter = createMixedBodySessions({
    ooga: createOogaBodySessions({ identityFor: i => {
      assert.equal(i.accountId, 1); return { world: worldId, profile: 'standing-1', name: 'ooga-owner' };
    }, placement: (_, p) => { if (p.y < 0) throw Error('obstructed'); return { grounded: p.y === 0 }; } }),
    clanker: createClankerBodySessions({ browserTransfer: true, recordFor: () => seed.codec.records, admit: () => initial,
      create() { const body = f.make(); created++; return { codec: body.codec, dispose() { disposed++; body.sim.dispose(); } }; } }),
  });
  const simulation = { version: worldId, checkpointBytes: 65536, initial: () => ({ ticks: 0 }),
    validate: s => Number.isSafeInteger(s.ticks), step: s => s.ticks++, project: () => ({ npcs: [], hub: { pile: 0 } }),
    npcFor: () => null, handoff: () => false };
  const make = () => new VirtualHost({ storage: bank, simulation, sessionAdapter: adapter, clock: () => now });
  try {
    const host = make(); let ticket = await host.begin('host-a', 120000); const refs = [], claims = [];
    for (const [index, kind] of ['ooga', 'clanker'].entries()) {
      const accountId = index + 1, bodyId = `player:${accountId}`, motion = kind === 'ooga'
        ? { x: 50, y: 8, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: false } : structuredClone(seed.codec.motion());
      const claim = { protocol: SESSION_PROTOCOL, world: worldId, accountId, bodyId, zone: 'outside', body: { kind, motion, equipment } };
      claims.push(claim);
      const prepare = await host.prepareBody(ticket, accountId, bodyId);
      const offer = await host.offerBody(ticket, refs.map(r => r.token), accountId, claim, prepare), ref = offer.result.session;
      refs.push(ref);
      const active = await host.activateBody(ticket, refs.map(r => r.token), accountId, ref, offer.transfer);
      await host.startedBody(ticket, refs.map(r => r.token), accountId, ref, active.transfer);
    }
    assert.equal(created, disposed); const builds = created;
    const before = await bank.transaction(tx => tx.bodies());
    assert.deepEqual(before.map(r => r.kind), ['ooga', 'clanker']);
    const checkpoint = ooga.encode({ x: 51, y: 9, z: 0, yaw: .5 }, equipment), tokens = refs.map(r => r.token);
    const saved = structuredClone(rows); fail = true;
    await assert.rejects(host.updateObservedBody(ticket, tokens, 1, refs[0], { sequence: 1, checkpoint }, now), /commit unavailable/);
    assert.deepEqual(rows, saved); assert.equal(created, builds, 'Ooga update must not reconstruct the Clanker');
    await host.updateObservedBody(ticket, tokens, 1, refs[0], { sequence: 1, checkpoint }, now);
    const after = await bank.transaction(tx => tx.bodies());
    assert.deepEqual(after[0].checkpoint, checkpoint); assert.deepEqual(after[1], before[1]);
    const clankerWire = structuredClone(seed.codec.records.transfer(initial)); clankerWire.body[1] = 1;
    await host.updateObservedBody(ticket, tokens, 2, refs[1], { sequence: 1, checkpoint: clankerWire }, now);
    assert.deepEqual((await bank.transaction(tx => tx.bodies()))[0], after[0]); assert.equal(created, disposed);
    await host.disconnect(ticket, tokens, refs[0], now);
    await host.disconnect(ticket, [refs[1].token], refs[1], now);
    now = 110001; const restarted = make(); ticket = await restarted.claim('host-b');
    const prepare = await restarted.prepareBody(ticket, 1, 'player:1');
    const resumed = await restarted.offerBody(ticket, [], 1, { ...claims[0], body: undefined }, prepare);
    assert.equal(resumed.transfer.view.deadline, 160000); assert.deepEqual(resumed.transfer.checkpoint, checkpoint);
    assert.equal(rows.get(HOST.key).host.sessions.sessions.length, 2); assert.equal(created, disposed);
  } finally { f.dispose(); }
});

test('mixed adapter cleans up partial startup and refuses missing or cross-kind capture without a partial save', async () => {
  let disposed = 0, capture;
  const child = (kind, bad = false, badRead = false) => ({ async forTransaction(tx) {
    tx.captureBodies(() => bad ? [{ accountId: 1, bodyId: 'player:1', generation: 1, kind: 'clanker', checkpoint: {} }] : []);
    return { stepPassive() {}, readMovement() { if (badRead) throw Error('controller failed'); },
      applyMovement() {}, transfer() {}, dispose() { disposed++; } };
  } });
  const tx = { get: async () => undefined, bodies: async () => [], captureBodies: fn => { capture = fn; } };
  const invalid = createMixedBodySessions({ ooga: child('ooga'), clanker: { forTransaction() { throw Error('startup failed'); } } });
  await assert.rejects(invalid.forTransaction(tx), /startup failed/); assert.equal(disposed, 1);
  const mixed = createMixedBodySessions({ ooga: child('ooga', true), clanker: child('clanker') });
  const scoped = await mixed.forTransaction(tx);
  assert.throws(() => capture({ sessions: { sessions: [{ accountId: 1, bodyId: 'player:1', generation: 1, kind: 'ooga' }], pending: [] } }), /mixed/);
  assert.throws(() => scoped.readMovement({ kind: 'ooga' }, {}), /mixed/, 'poisoned transaction cannot continue');
  scoped.dispose(); scoped.dispose(); assert.equal(disposed, 3);
  const failed = await createMixedBodySessions({ ooga: child('ooga', false, true), clanker: child('clanker') }).forTransaction(tx);
  assert.throws(() => failed.readMovement({ kind: 'ooga' }, {}), /controller failed/);
  assert.throws(() => failed.canStep({ kind: 'clanker' }), /mixed/, 'one child failure poisons the whole attempt');
  failed.dispose(); assert.equal(disposed, 5);
});
