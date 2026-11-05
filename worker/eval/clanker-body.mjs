// Finite gameplay recovery and component capacity measurement. The
// authored meadow has no other players, jobs, items, reservations or live route.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { HOST, boundedJSON } from "../src/virtual-host.js";
const world = "body-capacity-fixture-1";
const make = () => {
  const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-3", start: false });
  return { ...f, codec: createClankerBodyCheckpoint(f.sim, world, f.B.clankerState) };
};
const original = make(), rows = [];
const nodes = v => 1 + (v && typeof v === "object" ? Object.values(v).reduce((sum, x) => sum + nodes(x), 0) : 0);
const gameplay = f => {
  const e = f.sim.player;
  return JSON.parse(JSON.stringify({ position: e.root.position, heading: e.heading, vx:e.drive.vx, vy:e.drive.vy, vz:e.drive.vz,
    grounded:e.drive.grounded, airborne:e.drive.airborne, jumps:e.drive.jumps,
    biped: e.biped, parked: e.parked, mode: e.mode, controlled: e.controlled }));
};
try {
  original.start(); assert.equal(original.sim.possess(original.sim.list[0]), true);
  original.codec.neutralize();
  for (let i = 0; i < 4; i++) original.step();
  const e = original.sim.player; e.health.value = 137; e.health.delay = .7; e.biped = true;
  original.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true });
  original.step(); original.codec.neutralize();
  assert.equal(e.drive.airborne, true); assert.equal(e.drive.jumps, 1);
  for (let i = 0; i < 48; i++) {
    const saved = original.codec.capture(), checkpointBytes = Buffer.byteLength(JSON.stringify(saved));
    const start = performance.now(), restored = make();
    try {
      restored.codec.restore(JSON.parse(JSON.stringify(saved)));
      assert.equal(restored.sim.player, restored.sim.list[0]);
      // Explicit new input after reconnect, not a replay of the disconnected hold.
      if (i === 0) for (const f of [original, restored]) f.sim.control({ x: 0, z: 0, heading: .7, jumpHeld: true, jumpPressed: true });
      restored.step(); restored.codec.neutralize(); const next = restored.codec.capture();
      const completeColdCycleMs = performance.now() - start;
      original.step(); original.codec.neutralize(); assert.deepEqual(gameplay(restored), gameplay(original));
      assert.ok(next); // Capture still enforces the supported profile after recovery.
      let existingSlotRefusal = null;
      try { boundedJSON(saved, HOST.sessionSlotBytes - 1, HOST.sessionSlotNodes); } catch (error) { existingSlotRefusal = error.message; }
      rows.push({ frame: i, checkpointBytes, packedNodes: nodes(saved), completeColdCycleMs, existingSlotRefusal,
        y: e.root.position.y, vy: e.drive.vy, jumps: e.drive.jumps, grounded: e.drive.grounded });
    } finally { restored.dispose(); }
  }
  assert.equal(e.drive.grounded, true);
} finally { original.dispose(); }
const hashes = { ...original.hashes };
for (const name of ["clanker-roaming", "clanker-buffers", "checkpoint-pack"])
  hashes[name] = createHash("sha256").update(readFileSync(new URL(`../src/${name}.js`, import.meta.url))).digest("hex");
const times = rows.map(r => r.completeColdCycleMs).sort((a, b) => a - b);
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  hashes, samples: rows.length, componentBudgetBytes: 8192, existingSessionSlotBytes: HOST.sessionSlotBytes,
  existingSessionSlotNodes: HOST.sessionSlotNodes, maxCheckpointBytes: Math.max(...rows.map(r => r.checkpointBytes)),
  maxPackedNodes: Math.max(...rows.map(r => r.packedNodes)), refusedByExistingSlot: rows.filter(r => r.existingSlotRefusal).length,
  completeColdCycleMs: { p50: times[Math.floor(times.length * .5)], p95: times[Math.floor(times.length * .95)], max: times.at(-1) }, rows,
  limitations: ["one controlled Clanker in authored empty meadow; no actual browser reconnect, authority/session command or mixed-version migration",
    "no Ooga equipment/ammo/fuel, combat, held bodies, climb, seats, jobs, reservations or shared support references",
    "component limit is not host session admission; world and body reservations must be redesigned and measured before integration",
    "Node VM wall time includes cold module loading; not workerd/SQLite/Room, billed CPU or production memory",
    "no live capability, deployment, provisioning, paid API or permanent loop"] }, null, 2));
