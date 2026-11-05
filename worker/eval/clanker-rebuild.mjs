// Finite audit of reconstructing a controlled body's rig from its definition.
// Diagnostic only: the size without rigs is not an accepted recovery protocol.
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const world = "body-rebuild-audit-1", pack = createCheckpointPack(8192, { intern: true });
const make = () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-1", start: false });
  return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
};
const physics = f => {
  const e = f.sim.player, d = e.drive;
  return { x: e.root.position.x, y: e.root.position.y, z: e.root.position.z,
    vx: d.vx, vy: d.vy, vz: d.vz, jumps: d.jumps, grounded: d.grounded, airborne: d.airborne,
    health: e.health.value, radius: e.radius, height: e.height, motionEnvelope: d.motionEnvelope };
};
const a = make(), samples = [];
try {
  a.start(); a.sim.possess(a.sim.list[0]); a.codec.neutralize();
  for (let i = 0; i < 4; i++) a.step();
  a.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true });
  a.step(); a.codec.neutralize();
  for (let i = 0; i < 48; i++) {
    const saved = a.codec.capture(), minimal = { ...pack.unpack(saved) };
    delete minimal.rigs;
    const b = make(), c = make();
    try {
      const rig = c.sim.list[0].gorilla.createManagedCheckpoint(world), fresh = rig.capture();
      b.codec.restore(saved); c.codec.restore(saved);
      const e = c.sim.player, pos = { ...e.root.position }, visible = e.root.visible;
      rig.restore(fresh); e.root.visible = visible;
      e.gorilla.poseManaged(0, pos.x, pos.y, pos.z, e.heading, e.speed, e.drive.airborne, e.biped, "", e.motion);
      b.step(); c.step(); b.codec.neutralize(); c.codec.neutralize();
      const expected = physics(b), actual = physics(c);
      const originalHull = b.sim.player.gorilla.bodyHull(new Float64Array(24));
      const rebuiltHull = c.sim.player.gorilla.bodyHull(new Float64Array(24));
      samples.push({ frame: i, fullBytes: JSON.stringify(saved).length,
        withoutRigBytes: JSON.stringify(pack.pack(minimal)).length,
        physicalDifferences: Object.keys(expected).filter(k => !Object.is(expected[k], actual[k])), expected, rebuilt: actual,
        torsoHullMaxDifference: Math.max(...originalHull.map((v, j) => Math.abs(v - rebuiltHull[j]))),
        exactContinuationEqual: JSON.stringify(b.codec.capture()) === JSON.stringify(c.codec.capture()) });
    } finally { b.dispose(); c.dispose(); }
    a.step(); a.codec.neutralize();
  }
} finally { a.dispose(); }
console.log(JSON.stringify({ node: process.version, sourceHashes: a.hashes, samples: samples.length,
  fullBytesMax: Math.max(...samples.map(s => s.fullBytes)), withoutRigBytesMax: Math.max(...samples.map(s => s.withoutRigBytes)),
  physicalMismatchSamples: samples.filter(s => s.physicalDifferences.length).length,
  torsoHullMaxDifference: Math.max(...samples.map(s => s.torsoHullMaxDifference)),
  exactMismatchSamples: samples.filter(s => !s.exactContinuationEqual).length,
  limitations: ["One controlled Clanker in an empty authored meadow, single running jump; no obstacles, support, combat, Ooga equipment or browser login.",
    "Each sample independently resets the rig before one step; this is not sustained reduced-state simulation.",
    "withoutRigBytes is diagnostic representation size, not an accepted restorable codec or full session envelope.",
    "Rig reset preserves outer state, root visibility and position, then asks existing poseManaged to rebuild at zero elapsed time.",
    "No live capability, storage migration, deployment, paid API or permanent loop."], samples }, null, 2));
