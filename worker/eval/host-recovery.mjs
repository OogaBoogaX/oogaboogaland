// Finite local capacity and transaction-cost experiment. Authored world and
// atomic in-memory storage, no network, production runtime or paid resources.
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createPassiveBody } from "../src/passive-body.js";
import { initial, prepare, capture, restore, codec } from "../test/fixtures/clanker-flight-fixture.mjs";
const f = await prepare(), world = { ...f.mesh, radius: 2.25, height: 2.8 };
const physics = createPassiveBody({ world: () => world, gravity: 9.8 });
const body = { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false },
  equipment: { weapon: "gun", mode: "combat", magazine: 17, spareAmmo: [4, 22], primaryOwned: true,
    secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true, fuel: .37 } };
async function measure(actors) {
  let data, now = 100000, steps = 0, writes = 0, bytesWritten = 0;
  const storage = { async transaction(fn) {
    let next = structuredClone(data), bytes = 0;
    const out = await fn({ get: async () => structuredClone(next), put: async (_, r) => { next = structuredClone(r); bytes = Buffer.byteLength(JSON.stringify(r)); } });
    data = next; if (bytes) { writes++; bytesWritten += bytes; } return out;
  } };
  const simulation = { version: "capacity-fixture", initial() {
    return { actors: Array.from({ length: actors }, () => { const e = initial(); f.controller.prepareJump(e, 0, 0, -4, 1.5); return capture(e); }) };
  }, validate: s => { for (const e of s.actors) codec.restore(e.jump); return true; },
    step(s, ms) { for (let i = 0; i < s.actors.length; i++) { const e = restore(s.actors[i]); if (e.jump.active) f.controller.updateJump(e, ms / 1000); s.actors[i] = capture(e); } },
    project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => null, handoff: () => false };
  const host = new VirtualHost({ storage, simulation, clock: () => now, sessionAdapter: { stepPassive(m, ms) { steps++; return physics(m, ms); } } });
  let ticket = await host.begin("first", 120000);
  const initialBytes = Buffer.byteLength(JSON.stringify(data)), joined = [];
  let refused = null;
  for (let i = 0; i < 64; i++) {
    const previous = structuredClone(data);
    try {
      const r = await host.connect(ticket, joined.map(s => s.token), { protocol: SESSION_PROTOCOL, world: simulation.version,
        accountId: i + 1, bodyId: `body-${i}`, zone: "outside", body });
      assert.equal(r.result.ok, true); joined.push(r.result.session);
    } catch (error) {
      assert.match(error.message, /state size/); assert.deepEqual(data, previous); refused = error.message; break;
    }
  }
  const admissionBytes = Buffer.byteLength(JSON.stringify(data));
  if (joined.length) await host.sessions(ticket, joined.map(s => s.token), (r, at) => joined.forEach(s => r.disconnect(s, at)));
  now = 160000; ticket = await host.claim("restart");
  const beforeWrites = writes, beforeBytes = bytesWritten, cpu = process.cpuUsage(), times = [];
  let last, maxSteps = 0, peakBytes = admissionBytes;
  do {
    const before = steps, start = performance.now(); last = await host.tick(ticket, []); times.push(performance.now() - start);
    maxSteps = Math.max(maxSteps, steps - before); assert.ok(steps - before <= HOST.passiveSteps);
    peakBytes = Math.max(peakBytes, Buffer.byteLength(JSON.stringify(data)));
    assert.ok(times.length <= 19);
  } while (last.status === "running" || last.status === "draining");
  assert.equal(steps, joined.length * 1200);
  assert.equal(data.sessions?.pending.length || 0, joined.length);
  assert.ok((data.sessions?.pending || []).every(p => p.at === 160000 && p.body.motion.grounded));
  const usage = process.cpuUsage(cpu); times.sort((a,b) => a-b);
  return { actors, admittedSessions: joined.length, refused, finalStatus: last.status, initialBytes, admissionBytes, peakBytes,
    headroomBytes: HOST.checkpointBytes - peakBytes, recoveryOperations: times.length, passiveSteps: steps, maxStepsPerOperation: maxSteps,
    p50ms: times[Math.floor(times.length * .5)], p95ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1),
    cpuMs: (usage.user + usage.system) / 1000, recoveryWrites: writes - beforeWrites, recoveryBytesWritten: bytesWritten - beforeBytes };
}
const rows = [];
for (const actors of [1, 32, 64, 96, 128]) rows.push(await measure(actors));
console.log(JSON.stringify({ scope: "local Node, actual host/flight/mesh/passive adapters over authored actors/platform; atomic in-memory storage",
  node: process.version, platform: process.platform, arch: process.arch, checkpointLimitBytes: HOST.checkpointBytes,
  passiveStepLimit: HOST.passiveSteps, rows,
  caveats: ["admission measures these particular records, not a complete actor or worst-case future growth",
    "no full AI/rig/peer/world complexity", "no DO runtime, RPC, storage latency, account costs or client rendering",
    "more commits trade peak work for serialization and write amplification", "one sample sequence per capacity, no production percentile guarantee"] }, null, 2));
