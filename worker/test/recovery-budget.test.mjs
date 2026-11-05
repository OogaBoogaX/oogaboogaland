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

test("maximum grace recovery is budgeted across durable commits, rollback and owner replacement", async t => {
  const h = await harness(9000), original = h.read().sessions; h.at(160000);
  let runner = h.make(), ticket = await runner.claim("restart"), before = h.read(), count = h.calls();
  h.fail(); await assert.rejects(runner.tick(ticket, []), /budget write failed/);
  assert.deepEqual(h.read(), before); assert.ok(h.calls() - count <= HOST.passiveSteps);
  count = h.calls(); h.retry();
  await assert.rejects(runner.tick(ticket, []), /passive operation budget exhausted/);
  assert.equal(h.calls() - count, HOST.passiveSteps, "storage retries cannot multiply the outer operation budget");
  assert.deepEqual(h.read(), before, "retry exhaustion commits no speculative cursor or handback");
  let work = 0, commits = 0, last;
  do {
    count = h.calls(); last = await runner.tick(ticket, []); commits++; work += last.work.steps;
    assert.ok(h.calls() - count <= HOST.passiveSteps); assert.equal(last.work.steps, h.calls() - count);
    assert.equal(last.snapshot, null);
    assert.ok(h.read().sessions.sessions.every(s => s.deadline === 160000));
    if (commits === 3) {
      h.at(170000); const stale = ticket; runner = h.make(); ticket = await runner.claim("replacement");
      await assert.rejects(h.host.tick(stale, []), /fenced/);
    }
    assert.ok(commits <= Math.ceil(76800 / HOST.passiveSteps));
  } while (last.status !== "stopped");
  assert.equal(work, 76800); assert.equal(commits, Math.ceil(76800 / HOST.passiveSteps));
  const saved = h.read(); assert.equal(saved.sessions.pending.length, MAX_SESSIONS);
  assert.ok(saved.sessions.pending.every(p => p.applied && p.at === 160000 && p.body.motion.y > 0 && !p.body.motion.grounded));
  assert.ok(saved.sessions.pending.every(p => JSON.stringify(p.body.equipment) === JSON.stringify(equipment)));
  assert.equal(saved.simulation.handbacks.length, 1); assert.equal(saved.sessions.pending.filter(p => p.handback).length, 1);
  const f = await prepare(), world = { ...f.mesh, radius: 2.25, height: 2.8 };
  const reference = SessionRegistry.restore(original, { protocol: SESSION_PROTOCOL, world: "budget-fixture",
    adapter: { stepPassive: createPassiveBody({ world: () => world, gravity: 9.8 }), npcFor: id => id === "body-0" ? "npc-0" : null } });
  reference.recover(160000, []);
  for (const p of reference.pending()) reference.markApplied(p.id);
  assert.deepEqual(saved.sessions.pending.sort((a,b) => a.generation-b.generation), reference.pending(),
    "budgeted airborne continuation equals the uninterrupted original 50 ms steps exactly");
  t.diagnostic(JSON.stringify({ commits, passiveSteps: work, perOperationLimit: HOST.passiveSteps }));
});

test("a timely reconnect gets its own complete physics continuation ahead of unrelated backlog", async () => {
  const h = await harness(); h.at(159999); const ticket = await h.host.claim("restart");
  let count = h.calls();
  const generic = await h.host.sessions(ticket, [], (r, at) => { r.advance(at); r.advance(at); return r.connect(claim(63), at); });
  assert.equal(generic.result.reason, "recovering"); assert.ok(h.calls() - count <= HOST.passiveSteps, "multiple callbacks cannot replenish the transaction budget");
  count = h.calls(); const resumed = await h.host.connect(ticket, [], claim(63));
  assert.ok(h.calls() - count <= HOST.passiveSteps); assert.equal(resumed.result.resumed, true);
  assert.equal(resumed.result.view.motion.y, 0); assert.equal(resumed.result.view.motion.grounded, true);
  assert.deepEqual(resumed.result.view.equipment, equipment); assert.equal(resumed.result.view.deadline, null);
  assert.ok(resumed.work.pendingSteps > 0, "other bodies remain budgeted");
  assert.notEqual(resumed.result.session.token, h.joined[63].session.token);
  h.at(160000);
  await h.host.disconnect(ticket, [resumed.result.session.token], h.joined[63].session, 160000);
  assert.equal(h.read().sessions.sessions.find(s => s.accountId === 64).state, "live", "superseded close cannot cancel the reclaim");
  const late = await h.host.connect(ticket, [resumed.result.session.token], claim(62));
  assert.equal(late.result.reason, "departing", "priority cannot extend the exact deadline");
});

test("partially recovered state cannot publish poses or advance NPC time, and survives reconstruction", async () => {
  const h = await harness(); h.at(100100); h.retry();
  const retried = await h.host.tick(h.ticket, []);
  assert.equal(retried.work.steps, 128); assert.equal(retried.work.attemptedSteps, 256);
  assert.equal(h.calls(), 256, "successful retry reports all attempted physics work, not just committed progress");
  h.at(125000); const ticket = await h.host.claim("restart");
  let last = await h.host.tick(ticket, []);
  assert.equal(last.recovering, true); assert.equal(last.steps, 0); assert.equal(h.read().simulation.steps, 0);
  await assert.rejects(h.host.poses(ticket), /body recovery pending/);
  await assert.rejects(h.host.confirmPoses(ticket,{sequence:h.read().revision,at:h.read().simulatedAt,runUntil:h.read().runUntil}), /body recovery pending/);
  let commits = 1;
  while (last.work.pendingSteps) {
    last = await h.make().tick(ticket, []); commits++;
    assert.ok(last.work.steps <= HOST.passiveSteps); assert.ok(commits <= 8);
  }
  assert.ok(h.read().simulation.steps > 0); assert.ok((await h.host.poses(ticket)).frame.byteLength > 0);
  assert.ok(h.read().sessions.sessions.every(s => s.stepAt === 125000 && s.deadline === 160000));
  assert.throws(() => new SessionRegistry({ protocol: "x", world: "x", passiveBudget: 1199 }), /budget/);
});
