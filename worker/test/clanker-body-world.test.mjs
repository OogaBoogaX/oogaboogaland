import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VirtualHost, HOST, SESSION_PROTOCOL } from '../src/virtual-host.js';
import { createHostBodyStorage } from '../src/host-body-storage.js';
import { createClankerBodySessions } from '../src/clanker-body-sessions.js';
import { fixture, worldId } from './fixtures/clanker-body-world-fixture.mjs';

test('recovery uses actual mesh support under the footprint when the center ray misses the ledge', () => {
  const f = fixture({ narrow: true });
  try {
    assert.equal(f.queries.pointSupportAt(0, 0, 2), 0, 'authored ledge is beside the center ray');
    const source = f.make(); f.seed(source); const saved = source.codec.capture();
    const recovered = f.make(); recovered.codec.restore(saved);
    assert.deepEqual(structuredClone(recovered.codec.motion()), structuredClone(source.codec.motion()));
    assert.equal(recovered.sim.player.root.position.y, 2); assert.ok(f.counts().supportCalls >= 2);
    const older = f.make({ profile: 'static-body-3' });
    assert.throws(() => older.codec.restore(saved), /profile/);
    assert.equal(older.sim.player, null, 'mixed profiles refuse before taking control');
  } finally { f.dispose(); }
});

test('source collision stops the controlled body at a real wall and removed support falls identically after recovery', () => {
  const f = fixture({ wall: true });
  try {
    const source = f.make(); f.seed(source); source.sim.activate();
    for (let i = 0; i < 16; i++) { source.sim.control({ x: 1, z: 0, heading: Math.PI / 2 }); source.sim.update(.25); }
    source.codec.neutralize();
    assert.ok(source.sim.player.root.position.x > .1); assert.ok(source.sim.player.root.position.x < 7);
    assert.ok(f.counts().blocked > 0, 'actual prop collision has refused a sweep');
    f.removeSupport(); assert.equal(source.sim.supportRemoved(), true);
    assert.equal(source.sim.player.drive.grounded, false);
    const recovered = f.make(); recovered.codec.restore(source.codec.capture());
    for (let i = 0; i < 40; i++) {
      source.codec.stepPassive(source.codec.motion(), 50);
      recovered.codec.stepPassive(recovered.codec.motion(), 50);
      assert.deepEqual(structuredClone(recovered.codec.motion()), structuredClone(source.codec.motion()));
    }
    assert.equal(recovered.sim.player.drive.grounded, true); assert.equal(recovered.sim.player.root.position.y, 0);
  } finally { f.dispose(); }
});

test('terrain revisions, unsupported queries and disappeared grounded support refuse without relocation', () => {
  const f = fixture();
  try {
    for (const terrain of [{ ...f.queries, version: '' }, { ...f.queries, supportAt: null }, { ...f.queries, movingBodies: [] }])
      assert.throws(() => f.make({ terrain }), /unsupported independent/);
    const source = f.make(); f.seed(source); const saved = source.codec.capture();
    const changed = f.make({ terrain: { ...f.queries, version: 'props-fixture-2' } });
    assert.throws(() => changed.codec.restore(saved), /profile/);
    f.removeSupport(); const absent = f.make();
    assert.throws(() => absent.codec.restore(saved), /unsupported/);
    assert.throws(() => absent.codec.capture(), /profile/);
    assert.equal(absent.sim.player.root.position.y, 2, 'failed recovery does not silently move the body');
    const passive = f.make(); passive.codec.restore(saved, { passive: true });
    assert.equal(passive.codec.motion().grounded, true, 'stored input remains comparable to the registry');
    assert.throws(() => passive.codec.capture(), /unsupported/);
    assert.throws(() => passive.sim.activate(), /unsupported/);
    passive.codec.stepPassive(passive.codec.motion(), 50);
    assert.equal(passive.codec.motion().grounded, false); assert.ok(passive.codec.motion().y < 2);
    assert.ok(passive.codec.capture());
  } finally { f.dispose(); }
});

test('host replacement freezes over a vanished prop with atomic rollback and no controller restoration', async () => {
  const f = fixture(), seed = f.make(); f.seed(seed); const initial = seed.codec.capture();
  let data = new Map(), now = 100000, failCommit = false, constructed = 0, disposed = 0;
  const storage = { async transaction(fn) {
    const next = structuredClone(data);
    const result = await fn({
      get: async key => Array.isArray(key) ? new Map(key.filter(k => next.has(k)).map(k => [k, structuredClone(next.get(k))])) : structuredClone(next.get(key)),
      put: async values => { for (const [key, value] of Object.entries(values)) next.set(key, structuredClone(value)); },
      delete: async keys => { for (const key of keys) next.delete(key); },
    });
    if (failCommit) { failCommit = false; throw Error('injected commit failure'); }
    data = next; return result;
  } };
  const bank = createHostBodyStorage({ storage, profile: 'clanker-body-3', capture: () => { throw Error('scoped capture required'); },
    validate: checkpoint => { seed.codec.records.read(checkpoint); return true; } });
  const sessions = createClankerBodySessions({ recordFor: () => seed.codec.records, admit: () => initial,
    create() { const body = f.make(); constructed++; return { codec: body.codec, dispose() { disposed++; body.sim.dispose(); } }; } });
  const simulation = { version: worldId, checkpointBytes: 65536, initial: () => ({ steps: 0 }), validate: s => Number.isSafeInteger(s.steps),
    step: s => { s.steps++; }, project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const makeHost = () => new VirtualHost({ storage: bank, simulation, sessionAdapter: sessions, clock: () => now });
  try {
    const first = makeHost(), oldTicket = await first.begin('first', 60000);
    const joined = await first.connect(oldTicket, [], { protocol: SESSION_PROTOCOL, world: worldId, accountId: 1, bodyId: 'player:1', zone: 'outside',
      body: { kind: 'clanker', motion: structuredClone(seed.codec.motion()), equipment: { weapon: null, mode: 'carry', primaryOwned: false,
        secondaryOwned: false, selectedSlot: 1, unlimited: false, jetpack: false, jetpackOwned: false } } });
    assert.equal(joined.result.ok, true); f.removeSupport(); now += 10001;
    const replacement = makeHost(), ticket = await replacement.claim('replacement');
    await assert.rejects(first.tick(oldTicket, []), /fenced/);
    const before = structuredClone(data), buildsBefore = constructed; failCommit = true;
    await assert.rejects(replacement.tick(ticket, []), /injected commit/);
    assert.deepEqual(data, before); assert.equal(constructed, disposed);
    await replacement.tick(ticket, []);
    const record = data.get(HOST.key).host.sessions.sessions[0];
    assert.equal(record.deadline, 160000); assert.equal(record.motion.y, 2); assert.equal(record.motion.grounded, true);
    const bodies = [...data.values()].filter(v => v?.body?.bodyId === 'player:1');
    assert.equal(bodies.length, 1);
    const state = seed.codec.records.read(bodies[0].body.checkpoint);
    assert.equal(state.body[2], record.motion.y); assert.equal(Boolean(state.body[9] & 1), record.motion.grounded);
    assert.equal(constructed, buildsBefore, 'disconnect/restart never constructs offline physics');
    assert.equal(constructed, disposed);
  } finally { f.dispose(); }
});
