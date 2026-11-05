// Finite standard-pose recovery audit. Gameplay and collision are checked;
// saved rig transforms and animation history intentionally do not continue.
import assert from "node:assert/strict";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const world = "body-rebuild-audit-2", pack = createCheckpointPack(8192, { intern: true });
const make = () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-2", start: false });
  return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
};
const physics = f => {
  const e = f.sim.player, d = e.drive;
  return { x: e.root.position.x, y: e.root.position.y, z: e.root.position.z, heading: e.heading,
    vx: d.vx, vy: d.vy, vz: d.vz, jumps: d.jumps, grounded: d.grounded, airborne: d.airborne,
    health: e.health.value, healthDelay: e.health.delay, motionEnvelope: d.motionEnvelope };
};
const a = make(), samples = [];
try {
  a.start(); a.sim.possess(a.sim.list[0]); a.codec.neutralize();
  for (let i = 0; i < 4; i++) a.step();
  a.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true });
  a.step(); a.codec.neutralize();
  for (let i = 0; i < 48; i++) {
    const saved = a.codec.capture(), expanded = pack.unpack(saved), b = make(), c = make();
    try {
      assert.equal(expanded.v, 2); assert.equal(Object.hasOwn(expanded, 'rigs'), false);
      b.codec.restore(saved); c.codec.restore(saved);
      assert.deepEqual(physics(b), physics(a));
      assert.equal(b.sim.player.animation.updates, 0);
      const hull = b.sim.player.gorilla.bodyHull(new Float64Array(24));
      assert.deepEqual(Array.from(hull), Array.from(c.sim.player.gorilla.bodyHull(new Float64Array(24))));
      assert.ok(hull.every(Number.isFinite));
      a.step(); b.step(); a.codec.neutralize(); b.codec.neutralize();
      const expected = physics(a), actual = physics(b);
      assert.deepEqual(actual, expected);
      samples.push({ frame: i, componentBytes: Buffer.byteLength(JSON.stringify(saved)),
        physicalDifferences: Object.keys(expected).filter(k => !Object.is(expected[k], actual[k])),
        expected, rebuilt: actual, standardHull: Array.from(hull) });
    } finally { b.dispose(); c.dispose(); }
  }
} finally { a.dispose(); }
console.log(JSON.stringify({ node: process.version, sourceHashes: a.hashes, samples: samples.length,
  componentBytesMax: Math.max(...samples.map(s => s.componentBytes)),
  physicalMismatchSamples: samples.filter(s => s.physicalDifferences.length).length,
  limitations: ["One controlled Clanker in an authored empty meadow; no full-island support, combat, Ooga equipment or browser reclaim.",
    "Each sample independently restores before one step. Focused tests also exercise repeated replacements through landing.",
    "Standard-pose placement refuses overlap; no automatic relocation or generalized depenetration is implemented.",
    "Component bytes exclude the session envelope; body-storage-audit measures the combined record.",
    "No live capability, storage migration, deployment, paid API or permanent loop."], samples }, null, 2));
