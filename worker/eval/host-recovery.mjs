// Finite local capacity/cost experiment, no network or paid resources.
// Historical unreserved Clanker-only results are documented at cbf6d3e9.
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createPassiveBody } from "../src/passive-body.js";
import { rosterFixture } from "../test/fixtures/host-roster-fixture.mjs";
const stats = values => {
  values.sort((a, b) => a - b);
  return { samples: values.length, p50ms: values[Math.floor(values.length * .5)], p95ms: values[Math.floor(values.length * .95)], maxMs: values.at(-1) };
};
const body = { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false },
  equipment: { weapon: "gun", mode: "combat", magazine: 17, spareAmmo: [4, 22], primaryOwned: true,
    secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true, fuel: .37 } };
async function measure(pairs, budget) {
  const f = await rosterFixture(pairs, budget), world = { ...f.mesh, radius: 2.25, height: 2.8 };
  const passive = createPassiveBody({ world: () => world, gravity: 9.8 });
  let data, now = 100000, steps = 0, writes = 0, bytesWritten = 0, peakBytes = 0, simulationPeakBytes = 0;
  const storage = { async transaction(fn) {
    let next = structuredClone(data), bytes = 0;
    const out = await fn({ get: async () => structuredClone(next), put: async (_, r) => { next = structuredClone(r); bytes = Buffer.byteLength(JSON.stringify(r)); } });
    data = next; if (bytes) { writes++; bytesWritten += bytes; peakBytes = Math.max(peakBytes, bytes);
      simulationPeakBytes = Math.max(simulationPeakBytes, Buffer.byteLength(JSON.stringify(data.simulation))); } return out;
  } };
  const host = new VirtualHost({ storage, simulation: f.simulation, clock: () => now,
    sessionAdapter: { stepPassive(m, ms) { steps++; return passive(m, ms); } } });
  let ticket = await host.begin("first", 120000);
  const initialRawBytes = Buffer.byteLength(JSON.stringify(f.source.initial())), initialPackedBytes = Buffer.byteLength(JSON.stringify(data.simulation));
  const joined = (await host.sessions(ticket, [], (r, at) => Array.from({ length: host.maxSessions }, (_, i) => {
    const j = r.connect({ protocol: SESSION_PROTOCOL, world: f.simulation.version, accountId: i + 1, bodyId: `body-${i}`, zone: "outside", body }, at);
    assert.equal(j.ok, true); return j.session;
  }))).result;
  const tokens = joined.map(s => s.token), activeTimes = [], activeStart = process.cpuUsage(), activeWrites = writes, activeBytes = bytesWritten;
  for (let i = 0; i < 120; i++) {
    now += 250; const start = performance.now(), result = await host.tick(ticket, tokens); activeTimes.push(performance.now() - start);
    assert.equal(result.snapshot.npcs.length, pairs * 2);
  }
  const activeCPU = process.cpuUsage(activeStart);
  const active = { ...stats(activeTimes), cpuMs: (activeCPU.user + activeCPU.system) / 1000,
    writes: writes - activeWrites, bytesWritten: bytesWritten - activeBytes };
  await host.sessions(ticket, tokens, (r, at) => joined.forEach(s => r.disconnect(s, at)));
  now += 60000; ticket = await host.claim("restart");
  const beforeWrites = writes, beforeBytes = bytesWritten, cpu = process.cpuUsage(), times = [];
  let last, maxSteps = 0;
  do {
    const before = steps, start = performance.now(); last = await host.tick(ticket, []); times.push(performance.now() - start);
    maxSteps = Math.max(maxSteps, steps - before); assert.ok(steps - before <= HOST.passiveSteps);
    assert.ok(times.length <= 19);
  } while (last.status === "running" || last.status === "draining");
  assert.equal(steps, joined.length * 1200); assert.equal(data.sessions.pending.length, joined.length);
  assert.ok(data.sessions.pending.every(p => p.at === now && p.body.motion.grounded));
  const usage = process.cpuUsage(cpu);
  return { actors: pairs * 2, pairs, simulationBudgetBytes: budget, admittedSessions: joined.length,
    initialRawBytes, initialPackedBytes, simulationPeakBytes, simulationGrowthReserveBytes: budget - simulationPeakBytes,
    peakBytes, physicalHeadroomBytes: HOST.checkpointBytes - peakBytes,
    reservedBytes: budget + HOST.metadataBytes + joined.length * HOST.sessionSlotBytes,
    active, recovery: { ...stats(times), passiveSteps: steps, maxStepsPerOperation: maxSteps,
      cpuMs: (usage.user + usage.system) / 1000, writes: writes - beforeWrites, bytesWritten: bytesWritten - beforeBytes } };
}
const rows = [];
for (const [pairs, budget] of [[1, 30], [16, 30], [32, 48], [53, 64]]) rows.push(await measure(pairs, budget * 1024));
console.log(JSON.stringify({ scope: "local Node, actual host/work/walker/flight/mesh/passive adapters over authored actors/platform; atomic in-memory storage",
  node: process.version, platform: process.platform, arch: process.arch, checkpointLimitBytes: HOST.checkpointBytes,
  passiveStepLimit: HOST.passiveSteps, rows,
  caveats: ["53 registered characters and one Clanker per Ooga imply 106 potential NPC bodies; fixture count, not full hub state",
    "profiles reserve declared simulation maxima and schema-2 slots; exceeding a profile fails closed and requires a new world",
    "no full AI/rig/crowd/weapon/world complexity; fixture diagnostics retained and mesh stored once",
    "no DO runtime, RPC, storage latency, account costs or client rendering",
    "one serial sequence per profile, 120 active ticks and complete grace; no production percentile guarantee",
    "packing saves space but adds encode/decode work; repeated NPC lookups still unpack the whole world"] }, null, 2));
