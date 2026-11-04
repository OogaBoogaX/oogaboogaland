// Explicit, finite local measurement. No network, timers, Cloudflare or accounts.
// The authored rigs exclude AI, geometry construction, rendering and storage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createNpcPose } from "../src/npc-pose.js";
import { rig } from "../test/fixtures/npc-pose-rig.mjs";
const original = JSON.parse(readFileSync(new URL("../test/fixtures/npc-pose-original.json", import.meta.url)));
const samples = 240, rows = [];
for (const actors of [1, 128]) {
  const entries = Array.from({ length: actors }, (_, index) => ({ index, actor: rig(String(index)) }));
  const out = new Float32Array(4 + actors * 112);
  const holderCode = (i, n) => {
    const a = entries[i].actor;
    return n.parent === a.parts.armL ? 0 : n.parent === a.parts.armR ? 1 : n.parent === a.root ? 2 : n.parent === a.sleepWeapons ? 3 : 4;
  };
  const encode = runInNewContext(original.constants + "\n((out, holderCode) => {\n" + original.source + "\nreturn encodeCave; })", {})(out, holderCode);
  const before = () => {
    out.fill(0); new Uint32Array(out.buffer, 0, 4).set([2, 123, actors, 0]);
    for (const { index, actor } of entries) encode(4 + index * 112, index, actor);
    return out.buffer.slice(0);
  };
  const project = createNpcPose(123, actors), after = () => project(entries);
  assert.deepEqual(before(), after());
  for (const [variant, run] of [["original encoder plus frame copy", before], ["shared encoder plus bounded projection", after]]) {
    for (let i = 0; i < 20; i++) run();
    const cpu = process.cpuUsage(), memoryBefore = process.memoryUsage(), timings = [];
    let bytes = 0;
    for (let i = 0; i < samples; i++) {
      entries[0].actor.root.position.x = i / 4;
      const start = performance.now(), frame = run();
      timings.push(performance.now() - start); bytes += frame.byteLength;
    }
    const elapsed = process.cpuUsage(cpu), memoryAfter = process.memoryUsage(); timings.sort((a, b) => a - b);
    rows.push({ actors, variant, samples, payloadBytes: bytes, frameBytes: bytes / samples,
      p50ms: timings[Math.floor(samples * .5)], p95ms: timings[Math.floor(samples * .95)], maxMs: timings.at(-1),
      cpuMs: (elapsed.user + elapsed.system) / 1000,
      heapDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed, rssBytes: memoryAfter.rss });
  }
}
console.log(JSON.stringify({ scope: "local Node, authored rigs, serial warm samples; heap deltas include GC and are not retained-memory bounds",
  baseline: original.baseline, node: process.version, platform: process.platform, arch: process.arch, rows,
  maximumEnvelopeBytes: 32 + 16 + 128 * 112 * 4,
  maximumPayloadBytesPerSecondAt32Followers4Hz: (32 + 16 + 128 * 112 * 4) * 32 * 4,
  excluded: ["full AI", "geometry", "Clankers", "body recovery", "serialization/storage", "DO CPU/duration/billing", "client rendering", "physical phone"] }, null, 2));
