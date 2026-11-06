// Finite actual-controller recovery/capacity measurement. No production binding.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
import { createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
const spacious = process.argv.includes("--spacious"), smoke = process.argv.includes("--smoke");
const count = smoke ? 3 : 53, frames = smoke ? 32 : 120, interval = smoke ? 8 : 20;
const world = "clanker-roaming-eval-1", pack = createCheckpointPack(64 * 1024, { intern: true });
const make = (startActors = false) => {
  const start = performance.now();
  const f = clankerController({ count, spacious, checkpointRandom: true, checkpointProfile: "roaming-1", start: false });
  const codec = createClankerRoamingCheckpoint(f.sim, world, f.B.clankerState);
  if (startActors) f.start();
  return { ...f, codec, constructMs: performance.now() - start };
};
const nodes = v => 1 + (v && typeof v === "object" ? Object.values(v).reduce((n, x) => n + nodes(x), 0) : 0);
const original = make(true), rows = [], cycles = []; let recovered = null, result;
try {
  for (let frame = 0; frame <= frames; frame++) {
    if (frame) { original.step(); recovered.step(); }
    if (frame % interval && frame !== frames) continue;
    const start = performance.now(), saved = original.codec.capture(), captureMs = performance.now() - start;
    if (recovered) { assert.deepEqual(recovered.codec.capture(), saved, `continued state at frame ${frame}`); recovered.dispose(); }
    recovered = make();
    const persisted = JSON.parse(JSON.stringify(saved)), restoreAt = performance.now();
    recovered.codec.restore(persisted); const restoreMs = performance.now() - restoreAt;
    assert.deepEqual(recovered.codec.capture(), saved, `restored state at frame ${frame}`);
    const expanded = pack.unpack(saved), memory = process.memoryUsage();
    rows.push({ frame, captureMs, constructMs: recovered.constructMs, restoreMs,
      checkpointBytes: Buffer.byteLength(JSON.stringify(saved)), expandedJSONBytes: Buffer.byteLength(JSON.stringify(expanded)),
      expandedNodes: nodes(expanded), observedHeapBytes: memory.heapUsed, observedRSSBytes: memory.rss });
  }
  // Measure the complete local restore/step/capture operation as one sample,
  // not a sum of unrelated phase percentiles. The input is the previous commit.
  let committed = original.codec.capture();
  recovered.dispose(); recovered = null;
  for (let i = 0; i < 7; i++) {
    original.step();
    const start = performance.now(), fresh = make();
    try {
      fresh.codec.restore(committed); fresh.step(); const next = fresh.codec.capture();
      const totalMs = performance.now() - start;
      assert.deepEqual(next, original.codec.capture(), `complete local cycle ${i}`);
      const expanded = pack.unpack(next);
      cycles.push({ totalMs, checkpointBytes: Buffer.byteLength(JSON.stringify(next)), expandedNodes: nodes(expanded),
        expandedJSONBytes: Buffer.byteLength(JSON.stringify(expanded)) }); committed = next;
    } finally { fresh.dispose(); }
  }
  const stats = { ...original.sim.stats() };
  assert.equal(stats.capacity, count); if (spacious) assert.equal(stats.active, count);
  const timing = key => { const values = rows.map(r => r[key]).sort((a, b) => a - b);
    return { p50: values[Math.floor(values.length * .5)], p95: values[Math.floor(values.length * .95)], max: values.at(-1) }; };
  const cycleTimes = cycles.map(c => c.totalMs).sort((a, b) => a - b);
  result = { requestedActors: count, spacious, frames: frames + cycles.length, simulatedSeconds: (frames + cycles.length) / 4, stats, samples: rows.length,
    maxCheckpointBytes: Math.max(...rows.map(r => r.checkpointBytes), ...cycles.map(c => c.checkpointBytes)),
    maxExpandedNodes: Math.max(...rows.map(r => r.expandedNodes), ...cycles.map(c => c.expandedNodes)),
    maxExpandedJSONBytes: Math.max(...rows.map(r => r.expandedJSONBytes), ...cycles.map(c => c.expandedJSONBytes)), captureMs: timing("captureMs"),
    constructMs: timing("constructMs"), restoreMs: timing("restoreMs"),
    completeLocalCycleMs: { p50: cycleTimes[3], p95: cycleTimes[6], max: cycleTimes[6] }, rows, cycles };
} finally { original.dispose(); recovered?.dispose(); }
const hashes = { ...original.hashes };
for (const name of ["clanker-roaming", "clanker-buffers", "checkpoint-pack"]) hashes[name] = createHash("sha256")
  .update(readFileSync(new URL(`../src/${name}.js`, import.meta.url))).digest("hex");
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
  hashes, result, limitations: ["actual Clanker roaming profile only: static authored meadow, synthetic Ooga owners, no island or browser",
    "no Ooga AI, players, cave/work/sleep/combat/reservations or general world recovery",
    "64 KiB and 13,000-node refusal limits unchanged; unsupported profiles cannot activate",
    "fresh VM construction is included separately; observed process heap/RSS is not a peak or workerd isolate memory measurement",
    "Node wall time, no Room/storage/network/account billing, deployment or permanent loop"] }, null, 2));
