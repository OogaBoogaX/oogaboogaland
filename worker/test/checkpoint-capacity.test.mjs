import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL, boundedJSON } from "../src/virtual-host.js";

const equipment = { weapon: "primary", mode: "combat", primaryOwned: false,
  secondaryOwned: false, selectedSlot: 2, unlimited: false, jetpack: false, jetpackOwned: false };
const motion = { x: -.0000012345678901234567, y: -.0000012345678901234567, z: -.0000012345678901234567,
  yaw: -.0000012345678901234567, vx: -.0000012345678901234567, vy: -.0000012345678901234567, vz: -.0000012345678901234567, grounded: false };
const claim = i => ({ protocol: SESSION_PROTOCOL, world: "reserved-fixture", accountId: Number.MAX_SAFE_INTEGER - i,
  bodyId: String(i).padStart(64, "b"), zone: "z".repeat(64), body: { kind: "clanker", motion, equipment } });
function harness(budget = 30 * 1024) {
  let data, now = 100000, fail = false, grow = false;
  const storage = { async transaction(fn) {
    let next = structuredClone(data);
    const out = await fn({ get: async () => structuredClone(next), put: async (_, r) => { next = structuredClone(r); } });
    if (fail) { fail = false; throw Error("capacity write failed"); } data = next; return out;
  } };
  const simulation = { version: "reserved-fixture", checkpointBytes: budget, initial: () => ({ padding: "" }), validate: () => true,
    step(s) { if (grow) s.padding = "x".repeat(budget - 14); },
    project: () => ({ npcs: [], hub: { pile: 0 } }), npcFor: () => "n".repeat(64), handoff: () => true };
  const make = sim => new VirtualHost({ storage, simulation: sim || simulation, clock: () => now,
    sessionAdapter: { stepPassive: m => m, validateOccupancy: () => true } });
  return { host: make(), make, simulation, read: () => structuredClone(data), corrupt: v => { data = v; },
    at: t => { now = t; }, fail: () => { fail = true; }, grow: () => { grow = true; } };
}

test("admission reserves world growth and every retained body's occupancy, grace and departure", async t => {
  const h = harness(), ticket = await h.host.begin("owner", 120000);
  const joined = (await h.host.sessions(ticket, [], (r, at) => Array.from({ length: 64 }, (_, i) => {
    const c = r.connect(claim(i), at); assert.equal(c.ok, true);
    assert.equal(r.occupy(c.session, { kind: "hammock", id: String(i).padStart(64, "s") }, at).ok, true); return c.session;
  }))).result;
  h.grow(); h.at(100250); await h.host.tick(ticket, joined.map(s => s.token));
  assert.equal(Buffer.byteLength(JSON.stringify(h.read().simulation)), h.simulation.checkpointBytes);
  assert.equal((await h.host.connect(ticket, joined.map(s => s.token), claim(64))).result.reason, "full");
  await h.host.sessions(ticket, joined.map(s => s.token), (r, at) => joined.forEach(s => r.disconnect(s, at)));
  const grace = h.read(); assert.ok(grace.sessions.sessions.every(s => s.deadline === 160250));
  // Deliberately overestimate every possible finite number with 25 ASCII digits
  // PLUS JSON string quotes; actual schema-2 float encodings are no longer.
  const padded = v => typeof v === "number" ? "9".repeat(25) : Array.isArray(v) ? v.map(padded)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, padded(x)])) : v;
  // Only floating fields need 25 digits; integral account/counter/time fields are <=16.
  const envelope = item => { const v = structuredClone(item), b = v.body || v;
    for (const key of ["accountId", "generation", "lastSeenAt", "deadline", "stepAt", "at"]) {
      if (Object.hasOwn(v, key)) v[key] = Number.MAX_SAFE_INTEGER;
    }
    if (v.type === "depart") { v.id = `depart:${Number.MAX_SAFE_INTEGER}`; v.applied = false; }
    b.motion = padded(b.motion); return v; };
  let maxPendingSlot = 0;
  for (const s of grace.sessions.sessions) for (const state of ["grace", "offered", "starting"])
    maxPendingSlot = Math.max(maxPendingSlot, Buffer.byteLength(boundedJSON(envelope({ ...s, state }), HOST.sessionSlotBytes - 1, HOST.sessionSlotNodes)));
  t.diagnostic(`Conservatively padded pending-session JSON: ${maxPendingSlot} B, plus one array separator; reservation ${HOST.sessionSlotBytes} B.`);
  h.at(160250); const restart = await h.make().claim("restart"), before = h.read();
  h.fail(); await assert.rejects(h.host.tick(restart, []), /capacity write failed/); assert.deepEqual(h.read(), before);
  let result, count = 0;
  do { result = await h.make().tick(restart, []); assert.ok(++count <= 19); } while (result.status === "draining");
  assert.equal(h.read().sessions.pending.length, 64);
  assert.ok(h.read().sessions.pending.every(p => p.applied && p.at === 160250 && p.handback === null));
  for (const p of h.read().sessions.pending) boundedJSON(envelope(p), HOST.sessionSlotBytes - 1, HOST.sessionSlotNodes);
  assert.ok(Buffer.byteLength(JSON.stringify(h.read())) <= HOST.checkpointBytes);
});

test("larger worlds reduce admission before allocation and preserve reserved departure slots after restart", async () => {
  const h = harness(64 * 1024), ticket = await h.host.begin("owner", 120000);
  assert.equal(h.host.maxSessions, 30);
  const joins = (await h.host.sessions(ticket, [], (r, at) => Array.from({ length: 31 }, (_, i) => r.connect(claim(i), at)))).result;
  assert.ok(joins.slice(0, 30).every(x => x.ok)); assert.equal(joins[30].reason, "full");
  const refs = joins.slice(0, 30).map(j => j.session);
  await h.host.sessions(ticket, refs.map(r => r.token), (r, at) => r.release(refs[0], at));
  assert.equal((await h.make().connect(ticket, refs.slice(1).map(r => r.token), claim(31))).result.reason, "full");
  await h.host.sessions(ticket, refs.slice(1).map(r => r.token), r => r.acknowledge(h.read().sessions.pending[0].id));
  assert.equal((await h.make().connect(ticket, refs.slice(1).map(r => r.token), claim(31))).result.ok, true);
  const saved = h.read();
  await assert.rejects(h.make({ ...h.simulation, checkpointBytes: 30 * 1024 }).tick(ticket, []), /incompatible/);
  assert.deepEqual(h.read(), saved);
  h.corrupt({ ...saved, schema: 3 }); await assert.rejects(h.make().tick(ticket, []), /incompatible/);
  assert.equal(h.read().schema, 3);
  for (const checkpointBytes of [undefined, 0, 96 * 1024]) assert.throws(() => h.make({ ...h.simulation, checkpointBytes }), /adapters/);
});

test("world size or complexity overrun rolls back rather than consuming reserved session space", async () => {
  const h = harness(256), oversized = h.make({ ...h.simulation, step(s) { s.padding = "x".repeat(256); } });
  const ticket = await oversized.begin("owner", 60000), saved = h.read(); h.at(100250);
  await assert.rejects(oversized.tick(ticket), /state size/); assert.deepEqual(h.read(), saved);
  const complex = h.make({ ...h.simulation, checkpointBytes: 64 * 1024, initial: () => Array(HOST.simulationNodes).fill(0) });
  h.corrupt(undefined); await assert.rejects(complex.begin("owner", 60000), /state complexity/); assert.equal(h.read(), undefined);
  assert.ok(HOST.simulationNodes + 64 * HOST.sessionSlotNodes + HOST.metadataNodes < 20000);
});
