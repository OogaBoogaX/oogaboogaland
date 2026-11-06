// Finite headless feasibility measurement of the actual outer Clanker controller.
// Authored empty flat meadow and synthetic Ooga owners; no island, account or renderer.
// This inventory is diagnostic data, NOT a checkpoint format or recovery adapter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
const smoke = process.argv.includes("--smoke"), spacious = process.argv.includes("--spacious");
const count = smoke ? 1 : 53, frames = smoke ? 32 : 120;
// A saved local agent.js permits matched comparisons without changing checkout.
const agentSource = process.env.CLANKER_AGENT_SOURCE ? readFileSync(process.env.CLANKER_AGENT_SOURCE, "utf8") : null;
const fixture = clankerController({ count, spacious, checkpointRandom: true, agentSource });
const { context, hashes, bootMs } = fixture;
const initial = context.sim.list.map(e => [e.root.position.x, e.root.position.y, e.root.position.z]);
const goals = context.sim.list.map(e => [e.goalX, e.goalY, e.goalZ]);
const times = [], phases = new Set(), moved = new Set(), plans = new Set(), choices = new Set();
let result;
try {
  for (let frame = 0; frame < frames; frame++) {
    const at = performance.now(); fixture.step(); times.push(performance.now() - at);
    for (const e of context.sim.list) {
      const p = e.root.position;
      assert.ok([p.x, p.y, p.z, e.heading, e.health.value].every(Number.isFinite));
      phases.add(e.phase);
      if (Math.hypot(p.x - initial[e.index][0], p.y - initial[e.index][1], p.z - initial[e.index][2]) > .01) moved.add(e.index);
      if (e.roam.plans) plans.add(e.index);
      if (e.goalX !== goals[e.index][0] || e.goalY !== goals[e.index][1] || e.goalZ !== goals[e.index][2]) choices.add(e.index);
      assert.ok(e.climb.count <= e.climb.lengths.length && e.roam.count * 3 <= e.roam.path.length);
    }
  }
  // Count the exposed controller state, excluding owned geometry and duplicate
  // owner/rig references. Nonfinite sentinels, typed arrays and references are
  // explicit diagnostic tags, not silently changed into JSON nulls.
  const entries = context.sim.list, excluded = new Set(["owner", "cave", "tooltipOwner", "gorilla", "root", "parts"]);
  const references = new Map(entries.map(e => [e, `actor:${e.index}`]));
  const randomStreams = new Set(entries.map(e => e.random));
  const inventory = { values: 0, typedValues: 0, typedBytes: 0, functions: 0, randomWords: 0, nonfinite: 0, references: 0 };
  const seen = new Set();
  const inspect = value => {
    inventory.values++;
    if (typeof value === "function") {
      inventory.functions++;
      if (randomStreams.has(value)) { inventory.randomWords++; return { diagnostic: "random-stream", word: value.capture() }; }
      return { diagnostic: "function" };
    }
    if (typeof value === "number" && !Number.isFinite(value)) { inventory.nonfinite++; return { diagnostic: String(value) }; }
    if (!value || typeof value !== "object") return value;
    if (references.has(value)) { inventory.references++; return { diagnostic: references.get(value) }; }
    if (seen.has(value)) { inventory.references++; return { diagnostic: "shared-object" }; }
    seen.add(value);
    if (ArrayBuffer.isView(value)) {
      inventory.typedValues += value.length; inventory.typedBytes += value.byteLength;
      return { diagnostic: value.constructor.name, values: Array.from(value, inspect) };
    }
    if (Array.isArray(value)) return Array.from(value, inspect);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inspect(v)]));
  };
  const diagnostic = entries.map(e => ({ position: { ...e.root.position },
    controller: Object.fromEntries(Object.entries(e).filter(([key]) => !excluded.has(key)).map(([k, v]) => [k, inspect(v)])) }));
  const sorted = [...times].sort((a, b) => a - b), stats = { ...context.sim.stats() };
  assert.equal(stats.capacity, count); assert.ok(stats.active > 0);
  if (spacious) assert.equal(stats.active, count, "spacious profile must actually exercise the full active roster");
  assert.ok(moved.size > 0 && choices.size > 0, JSON.stringify({ stats, moved: moved.size, choices: choices.size, plans: plans.size }));
  result = { requestedActors: count, spacious, checkpointRandom: true, frames, simulatedSeconds: frames / 4, bootMs, stats,
    movedActors: moved.size, choseDestinationActors: choices.size, pathPlannedActors: plans.size, phases: [...phases], inventory,
    diagnosticStateBytes: Buffer.byteLength(JSON.stringify(diagnostic)),
    updateMs: { p50: sorted[Math.floor(times.length * .5)], p95: sorted[Math.floor(times.length * .95)], max: sorted.at(-1) }, rows: times };
} finally { fixture.dispose(); }
console.log(JSON.stringify({ scope: "actual outer Clanker AI and managed rig, authored flat meadow, no browser or storage",
  measuredAt: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch, hashes, result,
  limitations: ["synthetic owners and empty world; no Ooga AI, caves, lab/office, sleep, rage, moving supports or full island collision",
    "spacious flag changes only this authored meadow to radius 60; it does not represent the production island",
    "rest timers set to zero initially to exercise ordinary planner decisions; gameplay defaults unchanged",
    "diagnostic inventory excludes closure state, geometry and owner references; it cannot restore simulation",
    "VM wall time includes timeout execution overhead; not workerd CPU, rendering, network, storage or billing",
    "no production configuration, network, deployment, API billing or permanent loop"] }, null, 2));
