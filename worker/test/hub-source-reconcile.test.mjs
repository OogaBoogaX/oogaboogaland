// Source-only pile reconciliation through the actual Hub factory: real terrain,
// pile geometry, Ooga and Clanker logical state. Heavy: it builds full worlds.
// Every value is synthetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHubWorld } from '../src/hub-world.js';
import { createHubWorldSimulation } from '../src/hub-world-simulation.js';
import { HUB_WORLD_CHECKPOINT_VERSION } from '../src/hub-world-recovery.js';
import * as M from '../src/ooga-crew.js';
import { HOST } from '../src/virtual-host.js';
import { BODY_STORAGE } from '../src/host-body-storage.js';

const NOW = Date.UTC(2026, 10, 6, 10, 0);
const pile = (fields) => ({ v: 2, type: 'pile', bananas: 0, at: NOW, eatPerHour: 0, revision: 1, basis: 'credits',
  cutover: 'done', reconciliation: 'current', uncertain: { sats: 0, bananas: 0 }, ...fields });

// The trusted first-boot configuration, as the local full-Hub probes build it.
function configuration() {
  const roster = M.createContributorRoster({ registry: M.hubCharacters, clock: () => NOW,
    repositoryOf: M.hubRepositoryOf, normalizeStats: M.normalizeHubStats, slots: M.hubSlots, authoritative: true });
  const activity = roster.capture();
  for (const row of activity.rows) { row[1] = row[2] = NOW; row[3] = []; }
  return { version: 'hub-source-reconcile-test', seed: 1,
    checkpointBytes: HOST.checkpointBytes - HOST.metadataBytes - BODY_STORAGE.maxBodies * HOST.sessionSlotBytes,
    source: { revision: 1, observedAt: NOW }, activity,
    state: { v: 2, at: NOW, elapsed: 0, level: 69, tint: -1, pile: null, inventory: [], assignments: [] } };
}
function construct(config, saved, now) {
  const generator = buildHubWorld(config, saved, now);
  try { let next; do { next = generator.next(); } while (!next.done); return next.value; }
  finally { generator.return(); }
}
const timing = (at) => ({ observedAt: at, acceptedAt: at, effectiveAt: at });
// Everything an actor carries: logical Ooga and Clanker state, held equipment, offices.
const actorState = (saved) => ({ ooga: saved.ooga, clankers: saved.clankers, equipment: saved.equipment, offices: saved.offices });

test('a changed pile applies to real geometry without advancing NPCs, keeps queued activity, survives a cold restore, and later drains normally', () => {
  const config = configuration();
  const world = construct(config, null, NOW);
  let restored = null;
  try {
    assert.ok(world.project().npcs.length > 0, 'real Oogas');
    assert.ok(world.capture().clankers, 'real Clanker logical state');
    // Exercise the actual crew codec directly: a refused live value must not
    // poison the enclosing world's recovery adapter or alter its reservation.
    const { crew, bedId, bedFor } = world.actors, work = crew.list[0].work;
    const logical = crew.createLogicalCheckpoint({ world: config.version, bedId, bedFor,
      placement() { throw Error('capture must not perform restoration'); } });
    const reservedAt = work.reservedAt;
    try {
      for (const invalid of [null, -1, NaN, -Infinity, '0']) {
        work.reservedAt = invalid;
        assert.throws(() => logical.capture(), /invalid logical Ooga checkpoint/);
        assert.ok(Object.is(work.reservedAt, invalid), 'capture never repairs corrupt live state');
      }
      work.reservedAt = Infinity;
      assert.equal(logical.capture().actors[0].work.reservedAt, null, 'only Infinity encodes the unreserved sentinel');
      work.reservedAt = 0;
      assert.equal(logical.capture().actors[0].work.reservedAt, 0, 'a finite reservation retains its timestamp');
    } finally { work.reservedAt = reservedAt; }
    // Queued activity, accepted a second after the world's clock: an absolute
    // input that only a later tick applies.
    const queuedAt = NOW + 1000, initial = world.capture();
    const activity = structuredClone(initial.activity);
    activity.rows[0][1] = activity.rows[0][2] = queuedAt;
    const queued = { v: 1, kind: 'hub-state', observedAt: queuedAt, revision: initial.inputs.revision + 1,
      state: { level: initial.state.level, tint: initial.state.tint, inventory: initial.state.inventory,
        assignments: initial.state.assignments, pile: initial.state.pile }, activity };
    assert.equal(world.enqueueInput(queued, { acceptedAt: queuedAt, effectiveAt: queuedAt }), 'accepted');

    let removed = 0;
    const clankers = world.actors.clankers, supportRemoved = clankers.supportRemoved;
    clankers.supportRemoved = (...args) => { removed++; return supportRemoved.apply(clankers, args); };
    const before = world.capture(), npcs = structuredClone(world.project().npcs);

    // Growth: an accounting time ahead of the world's clock, within the observation.
    const observed = NOW + 1500, grown = pile({ bananas: 5000, at: observed - 200, revision: 1 });
    assert.ok(grown.at > before.state.at, 'the pile is ahead of the NPC clock');
    assert.equal(world.applySource(grown, timing(observed)), 'applied');
    const after = world.capture();
    assert.deepEqual(after.state.pile, grown, 'the whole v2 aggregate is retained');
    assert.deepEqual([after.state.level, world.geometry.pileLevel], [5000, 5000], 'real pile geometry follows');
    // The layout record is the immutable construction recipe (with its irreversible
    // ring), not the current level: it keeps the level the world was built at.
    assert.equal(after.layout.level, before.layout.level, 'the construction recipe is unchanged');
    assert.deepEqual([after.state.at, after.state.elapsed], [before.state.at, before.state.elapsed], 'no clock or elapsed time moves');
    assert.deepEqual(after.activity, before.activity, 'the applied roster is untouched');
    assert.deepEqual(after.inputs.pending.input.activity, activity, 'queued activity stays queued');
    assert.deepEqual(after.inputs.pending.input.state.pile, grown, 'the queue carries the same pile, so its drain cannot regress it');
    if (removed === 0) assert.deepEqual(actorState(after), actorState(before), 'no actor state changes');
    else assert.deepEqual({ ...actorState(after), clankers: null }, { ...actorState(before), clankers: null }, 'only clanker support invalidation');
    assert.deepEqual(world.project().npcs, npcs, 'no NPC position, phase or time advances');

    // A future accounting time is refused before anything changes.
    assert.throws(() => world.applySource(pile({ bananas: 6000, at: observed + 1, revision: 2 }), timing(observed)));
    assert.deepEqual(world.capture(), after, 'a refusal changes nothing');
    // The same snapshot again is a no-op.
    assert.equal(world.applySource(grown, timing(observed)), 'unchanged');
    assert.deepEqual(world.capture(), after);

    // Cold restore from the reconciled checkpoint: no actor may sit inside the
    // newly grown geometry, and the checkpoint round-trips exactly.
    world.dispose();
    restored = construct(config, after, null);
    assert.equal(restored.validate(), true);
    assert.deepEqual(restored.capture(), after, 'the reconciled checkpoint restores exactly');

    // Reversal: a higher revision lowers the level.
    const reversedAt = NOW + 2000, reversed = pile({ bananas: 100, at: reversedAt - 100, revision: 2 });
    const npcsBefore = structuredClone(restored.project().npcs);
    assert.equal(restored.applySource(reversed, timing(reversedAt)), 'applied');
    const lowered = restored.capture();
    assert.deepEqual([lowered.state.level, restored.geometry.pileLevel, lowered.state.pile], [100, 100, reversed]);
    assert.deepEqual(restored.project().npcs, npcsBefore, 'a reversal moves no NPC either');
    assert.deepEqual(lowered.inputs.pending.input.activity, activity, 'queued activity still queued');

    // Normal ticks drain the queue once the wall clock reaches its acceptance.
    let at = lowered.state.at;
    for (let i = 0; i < 16 && restored.capture().inputs.pending; i++) { at += HOST.stepMs; restored.step(HOST.stepMs, at, { wallAt: at }); }
    const drained = restored.capture();
    assert.equal(drained.inputs.pending, null, 'drained by a real tick');
    assert.deepEqual(drained.activity, activity, 'the queued activity is applied, not lost');
    assert.deepEqual([drained.state.pile, drained.state.level], [reversed, 100], 'and the pile does not regress');
  } finally { world.dispose(); restored?.dispose(); }
});

test('the transaction adapter commits a reconciliation atomically and leaves the checkpoint untouched on refusal', () => {
  const simulation = createHubWorldSimulation(configuration());
  const saved = simulation.initial(NOW), untouched = structuredClone(saved);
  const observed = NOW + 1500;
  assert.throws(() => simulation.applySource(saved, pile({ bananas: 5000, at: observed + 1 }), timing(observed)));
  assert.deepEqual(saved, untouched, 'a refused source leaves the committed DTO exactly');
  assert.equal(simulation.applySource(saved, { ...pile({ bananas: 5000, at: observed - 1 }), bananas: null, at: null,
    cutover: 'pending', reconciliation: 'review', uncertain: null }, timing(observed)), 'unknown');
  assert.deepEqual(saved, untouched, 'unknown never applies');
  assert.equal(simulation.applySource(saved, pile({ bananas: 5000, at: observed - 1 }), timing(observed)), 'applied');
  assert.equal(saved.state.level, 5000);
  assert.equal(saved.state.at, untouched.state.at, 'no clock change');
});


test('complete Hub rejects pre-bridge recovery before constructing geometry or controllers', () => {
  assert.equal(HUB_WORLD_CHECKPOINT_VERSION, 8);
  const config = configuration();
  // A stale envelope needs no valid actor payload: its schema is refused first.
  const saved = { v: 7, world: config.version };
  assert.throws(() => construct(config, saved, null), /migration required/);
});
