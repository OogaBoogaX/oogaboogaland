import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clankerController } from './fixtures/clanker-controller-fixture.mjs';
import { createClankerBufferCheckpoint, CLANKER_FIXED_PATH_CAPACITY } from '../src/clanker-buffers.js';
import { createClankerLogicalCheckpoint } from '../src/clanker-roaming.js';
import { createHubRoutinePaths } from '../src/hub-routine-paths.js';
import '../../src/js/npc-paths.js';

const island = { meadowRadius: 22, path: { version: 1, debug: { ringTrafficRadius: 5 }, centerlines: [
  [{ x: 0, z: 4 }, { x: 0, z: 7 }, { x: 0, z: 12 }],
  [{ x: 4, z: 0 }, { x: 7, z: 0 }, { x: 12, z: 0 }],
] } };
const paths = createHubRoutinePaths(island), fixed = globalThis.BL.npcPaths.fixed(island);
const make = () => {
  const f = clankerController({ start: false });
  const owner = f.sim.list[0].owner;
  f.dispose();
  const sim = f.B.clankers.create({ root: f.B.scene.createNode(),
    crew: { list: [owner], authoritative: true, passiveNpcs: true, stateOf: o => o.state },
    sites: [], npcExecution: {}, npcClock: () => 0, npcPlacement: () => true,
    groundAt: () => 0, clear: () => true, npcFixedPaths: fixed, npcPathState: paths.createState });
  sim.list[0].pathing = paths.createState();
  // The fixture runs source controllers in a VM; production controller and
  // codec share one realm. Transfer its plain clock DTO across that boundary.
  const bridge = sim.logicalCheckpoint;
  sim.logicalCheckpoint = { ...bridge, capture: () => structuredClone(bridge.capture()) };
  return { sim, codec: createClankerLogicalCheckpoint(sim, 'fixed-lanes-fixture-1') };
};

test('fixed Clanker lane cursors and buffers survive logical recovery and continue the shared planner', () => {
  const a = make(), b = make();
  try {
    const original = a.sim.list[0];
    Object.assign(original.root.position, { x: 0, y: 0, z: 10 });
    fixed.target(original, 10, 0);
    original.pathing.index = Math.min(2, original.pathing.count);
    original.pathing.laneX[CLANKER_FIXED_PATH_CAPACITY - 1] = -0;
    const saved = JSON.parse(JSON.stringify(a.codec.capture()));
    b.codec.restore(saved); b.codec.finishRecovery();
    const restored = b.sim.list[0];
    assert.deepEqual(restored.pathing, original.pathing);
    assert.notEqual(restored.pathing.laneX, original.pathing.laneX);
    for (const position of [{ x: 0, z: 8 }, { x: 0, z: 5 }, { x: 5, z: 0 }, { x: 8, z: 0 }]) {
      Object.assign(original.root.position, position); Object.assign(restored.root.position, position);
      fixed.target(original, 10, 0); fixed.target(restored, 10, 0);
      assert.deepEqual(restored.pathing, original.pathing);
    }
    restored.pathing.index = restored.pathing.count + 1;
    assert.throws(() => b.codec.capture());
  } finally { a.sim.dispose(); b.sim.dispose(); }
});

test('fixed Clanker buffer profile fences legacy records, lane size and 64-actor capacity', () => {
  const f = clankerController();
  try {
    const ids = Array.from({ length: 64 }, (_, i) => `fixed-${i}`);
    const entries = ids.map(id => ({ ...f.sim.list[0], owner: { id }, pathing: paths.createState() }));
    const codec = createClankerBufferCheckpoint('fixed-capacity-1', ids, e => e.owner.id, true);
    assert.throws(() => createClankerBufferCheckpoint('fixed-capacity-1', [...ids, 'overflow'], e => e.owner.id, true));
    const saved = codec.capture(entries);
    assert.equal(saved.v, 2);
    assert.equal(codec.restore(saved).length, 64);
    assert.throws(() => createClankerBufferCheckpoint('fixed-capacity-1', ids).restore(saved));
    const malformed = structuredClone(saved); malformed.v = 1;
    assert.throws(() => codec.restore(malformed));
    entries[0].pathing.laneX = new Float64Array(513);
    assert.throws(() => codec.capture(entries));
    entries[0].pathing = paths.createState();
    for (const entry of entries) { entry.pathing.laneX.fill(Math.PI); entry.pathing.laneZ.fill(Math.E); }
    assert.throws(() => codec.capture(entries), /capacity/);
  } finally { f.dispose(); }
});
