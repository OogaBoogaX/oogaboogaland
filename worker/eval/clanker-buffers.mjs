// Finite, local capacity/cost check for the typed-buffer component only.
// Actual outer controller + rigs, authored meadow; no production resources.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerBufferCheckpoint, CLANKER_BUFFERS } from "../src/clanker-buffers.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const smoke = process.argv.includes("--smoke"), spacious = process.argv.includes("--spacious");
const count = smoke ? 1 : 53, frames = smoke ? 32 : 120;
const fixture = clankerController({ count, spacious, checkpointRandom: true }), entries = fixture.sim.list;
const codec = createClankerBufferCheckpoint("clanker-buffer-eval-1", entries.map(e => e.owner.id));
const pack = createCheckpointPack(CLANKER_BUFFERS.bytes, { intern: true }), rows = [];
const initial = entries.map(e => [e.root.position.x, e.root.position.z]), moved = new Set();
const nodes = v => 1 + (v && typeof v === "object" ? Object.values(v).reduce((n, value) => n + nodes(value), 0) : 0);
let result;
try {
  for (let frame = 0; frame <= frames; frame++) {
    if (frame) fixture.step();
    for (const e of entries) if (Math.hypot(e.root.position.x - initial[e.index][0], e.root.position.z - initial[e.index][1]) > .01) moved.add(e.index);
    if (frame % 10 && frame !== frames) continue;
    const start = performance.now(), saved = codec.capture(entries), captureMs = performance.now() - start;
    const packedAt = performance.now(), packed = JSON.stringify(pack.pack(saved)), packMs = performance.now() - packedAt;
    const restoreAt = performance.now(), state = pack.unpack(JSON.parse(packed)), restored = codec.restore(state);
    const restoreMs = performance.now() - restoreAt;
    let expandedBytes = 0, arrays = 0;
    for (let i = 0; i < restored.length; i++) for (const [group, fields] of Object.entries(restored[i])) {
      for (const [key, value] of Object.entries(fields)) {
        const old = entries[i][group][key];
        if (value === null) assert.equal(old, null);
        else {
          assert.deepEqual(new Uint8Array(value.buffer), new Uint8Array(old.buffer, old.byteOffset, old.byteLength));
          expandedBytes += value.byteLength; arrays++;
        }
        // Exercise the real controller with fresh decoded arrays on its next
        // step. All its scalar/closure/rig state remains live in this measurement.
        entries[i][group][key] = value;
      }
    }
    assert.ok(expandedBytes <= CLANKER_BUFFERS.expandedBytes);
    rows.push({ frame, captureMs, packMs, restoreMs, componentBytes: Buffer.byteLength(JSON.stringify(saved)),
      componentNodes: nodes(saved), packedComponentBytes: Buffer.byteLength(packed), expandedBytes, arrays });
  }
  const stats = { ...fixture.sim.stats() };
  assert.equal(stats.capacity, count); assert.ok(moved.size > 0);
  if (spacious) assert.equal(stats.active, count);
  const timing = key => { const values = rows.map(r => r[key]).sort((a, b) => a - b);
    return { p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) }; };
  result = { requestedActors: count, spacious, frames, simulatedSeconds: frames / 4, stats, movedActors: moved.size,
    samples: rows.length, maxComponentBytes: Math.max(...rows.map(r => r.componentBytes)),
    maxPackedComponentBytes: Math.max(...rows.map(r => r.packedComponentBytes)),
    maxComponentNodes: Math.max(...rows.map(r => r.componentNodes)),
    maxExpandedBytes: Math.max(...rows.map(r => r.expandedBytes)),
    captureMs: timing("captureMs"), packMs: timing("packMs"), restoreMs: timing("restoreMs"), rows };
} finally { fixture.dispose(); }
const hashes = { ...fixture.hashes };
for (const name of ["clanker-buffers", "checkpoint-pack", "checkpoint-binary"]) hashes[name] = createHash("sha256")
  .update(readFileSync(new URL(`../src/${name}.js`, import.meta.url))).digest("hex");
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform,
  arch: process.arch, hashes, limits: CLANKER_BUFFERS, result,
  limitations: ["typed-buffer component only; full controller clocks, scalar state, references and reservations remain live",
    "synthetic Ooga owners, empty meadow; no production island, caves, office/lab, sleep, rage search or browser",
    "fresh buffer restoration between real AI updates is not a host/world restart",
    "Node wall time, not workerd CPU, storage, delivery, memory high-water mark or billing",
    "component budget is a refusal limit, not reserved world capacity; dense paths can exceed it",
    "no activation, production configuration, deployment, network, API billing or permanent loop"] }, null, 2));
