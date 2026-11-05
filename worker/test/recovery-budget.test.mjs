import { test } from "node:test";
import assert from "node:assert/strict";
import { VirtualHost, HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { SessionRegistry, MAX_SESSIONS } from "../src/host-sessions.js";
import { createPassiveBody } from "../src/passive-body.js";
import { createNpcPose } from "../src/npc-pose.js";
import { prepare } from "./fixtures/clanker-flight-fixture.mjs";

const equipment = { weapon: "gun", mode: "combat", primaryOwned: true,
  secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true };
const claim = i => ({ protocol: SESSION_PROTOCOL, world: "budget-fixture", accountId: i + 1, bodyId: `body-${i}`, zone: "outside",
  body: { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false }, equipment } });

async function harness(height = 4) {
  const f = await prepare(), world = { ...f.mesh, radius: 2.25, height: 2.8 }, passive = createPassiveBody({ world: () => world, gravity: 9.8 });
  let data, now = 100000, calls = 0, fail = false, retry = false;
  const storage = { async transaction(fn) {
    let next = structuredClone(data);
    const attempt = () => fn({ get: async () => structuredClone(next), put: async (_, value) => { next = structuredClone(value); } });
    let result = await attempt();
    if (retry) { retry = false; next = structuredClone(data); result = await attempt(); }
    if (fail) { fail = false; throw Error("budget write failed"); } data = next; return result;
  } };
  const project = createNpcPose(123, 1);
  // Fixture ownership/rig only; the 64 passive bodies use actual mesh physics.
  const simulation = { checkpointBytes: 30 * 1024, version: "budget-fixture", initial: () => ({ steps: 0, handbacks: [] }),
    validate: s => Number.isSafeInteger(s.steps) && Array.isArray(s.handbacks),
    step(s) { s.steps++; }, project: () => ({ npcs: [], hub: { pile: 0 } }), poses: () => project([]),
    npcFor: (_, id) => id === "body-0" ? "npc-0" : null,
    handoff(s, intent) { s.handbacks.push(structuredClone(intent)); return true; } };
  const make = () => new VirtualHost({ storage, simulation, clock: () => now,
    sessionAdapter: { stepPassive(m, ms) { calls++; return passive(m, ms); } } });
  const host = make(), ticket = await host.begin("first", 120000);
  const joined = (await host.sessions(ticket, [], (r, at) => Array.from({ length: MAX_SESSIONS }, (_, i) => {
    const c = claim(i); c.body.motion.y = height; return r.connect(c, at);
  }))).result;
  assert.ok(joined.every(r => r.ok));
  await host.sessions(ticket, joined.map(r => r.session.token), (r, at) => joined.forEach(j => r.disconnect(j.session, at)));
  return { host, ticket, joined, make, at: value => { now = value; }, calls: () => calls,
    read: () => structuredClone(data), fail: () => { fail = true; }, retry: () => { retry = true; } };
}

test("maximum simultaneous expiry needs zero body physics across rollback and transaction retries", async t => {
  const h = await harness(9000); h.at(160000);
  const runner = h.make(), ticket = await runner.claim("restart"), before = h.read();
  h.fail(); await assert.rejects(runner.tick(ticket, []), /budget write failed/);
  assert.deepEqual(h.read(), before); assert.equal(h.calls(), 0);
  h.retry(); const result = await runner.tick(ticket, []);
  assert.equal(result.work.steps, 0); assert.equal(result.work.attemptedSteps, 0);
  assert.equal(result.work.pendingSteps, 0); assert.equal(h.calls(), 0);
  const saved = h.read(); assert.equal(saved.sessions.pending.length, MAX_SESSIONS);
  assert.ok(saved.sessions.pending.every(p => p.applied && p.at === 160000 && p.body.motion.y === 9000
    && !p.body.motion.grounded && p.body.motion.vx === 0 && p.body.motion.vy === 0 && p.body.motion.vz === 0));
  assert.ok(saved.sessions.pending.every(p => JSON.stringify(p.body.equipment) === JSON.stringify(equipment)));
  assert.equal(saved.simulation.handbacks.length, 1); assert.equal(saved.sessions.pending.filter(p => p.handback).length, 1);
  h.at(170000); const replacement = h.make(), fresh = await replacement.begin("replacement", 60000, { resumePaused: true });
  await assert.rejects(runner.tick(ticket, []), /fenced/);
  await replacement.tick(fresh, []);
  assert.equal(h.read().simulation.handbacks.length, 1);
  t.diagnostic(JSON.stringify({ frozenBodies: MAX_SESSIONS, physicsSteps: h.calls(), expiryCommits: 1 }));
});

test("timely reconnect reclaims the frozen body without waiting for unrelated bodies", async () => {
  const h = await harness(); h.at(159999); const ticket = await h.host.claim("restart");
  const resumed = await h.host.connect(ticket, [], claim(63));
  assert.equal(h.calls(), 0); assert.equal(resumed.result.resumed, true);
  assert.equal(resumed.result.view.motion.y, 4); assert.equal(resumed.result.view.motion.grounded, false);
  assert.equal(resumed.result.view.motion.vy, 0);
  assert.deepEqual(resumed.result.view.equipment, equipment); assert.equal(resumed.result.view.deadline, null);
  assert.equal(resumed.work.pendingSteps, 0);
  assert.notEqual(resumed.result.session.token, h.joined[63].session.token);
  h.at(160000);
  await h.host.disconnect(ticket, [resumed.result.session.token], h.joined[63].session, 160000);
  assert.equal(h.read().sessions.sessions.find(s => s.accountId === 64).state, "live");
  const late = await h.host.connect(ticket, [resumed.result.session.token], claim(62));
  assert.equal(late.result.reason, "departing");
});

test("frozen records survive reconstruction without cursor churn or blocking shared NPC progress", async () => {
  const h = await harness(), original = h.read().sessions.sessions;
  h.at(100100); h.retry(); const retried = await h.host.tick(h.ticket, []);
  assert.equal(retried.work.steps, 0); assert.equal(retried.work.attemptedSteps, 0); assert.equal(h.calls(), 0);
  assert.deepEqual(h.read().sessions.sessions, original);
  h.at(125000); const ticket = await h.host.claim("restart"), last = await h.host.tick(ticket, []);
  assert.ok(last.steps > 0); assert.ok(h.read().simulation.steps > 0);
  assert.ok((await h.host.poses(ticket)).frame.byteLength > 0);
  assert.deepEqual(h.read().sessions.sessions, original);
});
