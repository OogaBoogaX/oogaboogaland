import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST, SESSION_PROTOCOL, VirtualHost, LatestHostDelivery, boundedJSON, publicSnapshot } from "../src/virtual-host.js";
import { createNpcPose } from "../src/npc-pose.js";
import { rig } from "./fixtures/npc-pose-rig.mjs";

// A serial, rollback-capable storage fixture. It models transaction atomicity, not Cloudflare
// scheduling, CPU billing, alarm precision or the production scene's collision geometry.
function storage() {
  let data = new Map(), tail = Promise.resolve(), failWrite = false;
  const store = {
    writes: 0, bytes: 0,
    transaction(fn) {
      const work = tail.then(async () => {
        const pending = structuredClone(data);
        let writes = 0, bytes = 0;
        const result = await fn({
          get: async key => structuredClone(pending.get(key)),
          put: async (key, value) => {
            if (failWrite) { failWrite = false; throw new Error("storage unavailable"); }
            pending.set(key, structuredClone(value)); writes++; bytes += Buffer.byteLength(JSON.stringify(value));
          },
        });
        data = pending; store.writes += writes; store.bytes += bytes; return result;
      });
      tail = work.catch(() => {}); return work;
    },
    read: () => structuredClone(data.get(HOST.key)),
    corrupt: value => data.set(HOST.key, structuredClone(value)),
    failNext: () => { failWrite = true; },
  };
  return store;
}

// A deterministic data-only fixture, explicitly NOT the existing Ooga/Clanker simulation.
// Random state, a travel phase and a timer must survive a new host object without reseeding.
const simulation = {
  version: "fixture-world-1", checkpointBytes: 30 * 1024,
  initial: () => ({ seed: 17, steps: 0, x: 0, phase: "outbound", timer: 0 }),
  validate: s => s && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 0xffffffff
    && Number.isSafeInteger(s.steps) && Number.isFinite(s.x) && Number.isFinite(s.timer)
    && ["outbound", "return"].includes(s.phase),
  step(s, ms) {
    s.steps++; s.timer += ms; s.x += s.phase === "outbound" ? 0.25 : -0.25;
    if (s.timer >= 1000) { s.timer -= 1000; s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; s.phase = s.seed % 2 ? "return" : "outbound"; }
  },
  project: s => ({ npcs: [{ id: "fixture", kind: "ooga", x: s.x, y: 0, z: 0, yaw: 0,
    activity: "working", phase: s.phase, route: "fixture-route", progress: s.timer / 1000, seed: s.seed }], hub: { pile: 12 } }),
  npcFor: () => null,
  handoff: () => { throw new Error("no NPC exists in this fixture"); },
};
function harness(adapter = simulation, passive = m => m) {
  const store = storage(); let now = 100000;
  const make = () => new VirtualHost({ storage: store, simulation: adapter, sessionAdapter: { stepPassive: passive }, clock: () => now });
  return { store, host: make(), make, at: t => { now = t; }, now: () => now };
}

const bodyClaim = () => ({ protocol: SESSION_PROTOCOL, world: simulation.version, accountId: 1, bodyId: "resident", zone: "outside",
  body: { kind: "ooga", motion: { x: 1, y: 10, z: 2, yaw: 0.7, vx: 3, vy: -1, vz: 2, grounded: false },
    equipment: { weapon: "gun", mode: "combat", magazine: 17, spareAmmo: [5, 22], jetpack: true, fuel: 0.4,
      primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpackOwned: true } } });

test("pose publication requires a valid adapter, cannot mutate saved state, and fences closed runs", async () => {
  const missing = harness(), ticket = await missing.host.begin("a", 60000);
  await assert.rejects(missing.host.poses(ticket), /adapter required/);
  const actor = rig(), project = createNpcPose(123, 1);
  const adapter = { ...simulation, poses(s) { s.x = 999; return project([{ index: 0, actor }]); } };
  const h = harness(adapter), t = await h.host.begin("a", 1000), before = h.store.read();
  const first = await h.host.poses(t); new Float32Array(first.frame, 16)[2] = 99;
  assert.deepEqual(h.store.read(), before);
  assert.equal(new Float32Array((await h.host.poses(t)).frame, 16)[2], 0);
  adapter.poses = () => new ArrayBuffer(0);
  await assert.rejects(h.host.poses(t), /invalid host poses/);
  adapter.poses = () => project([{ index: 0, actor }]);
  h.at(101000);
  await assert.rejects(h.host.poses(t), /closed/);
  assert.equal(h.store.writes, 1);
});

test("host progresses with zero players and persists simulation before returning snapshots", async () => {
  const h = harness(), ticket = await h.host.begin("runner-a", 60000);
  for (let i = 1; i <= 5; i++) {
    h.at(100000 + i * 1000);
    const result = await h.host.tick(ticket), saved = h.store.read();
    assert.equal(result.steps, 4); assert.equal(result.lagMs, 0);
    assert.equal(saved.simulation.steps, i * 4);
    assert.equal(result.snapshot.sequence, saved.revision);
    assert.equal(result.snapshot.npcs[0].seed, saved.simulation.seed);
    assert.equal(saved.sessions, null);
  }
  assert.equal(h.store.writes, 6);
});

test("competing hosts serialize acquisition; stale epochs cannot write after restart", async () => {
  const h = harness();
  const starts = await Promise.allSettled([h.host.begin("a", 60000), h.make().begin("b", 60000)]);
  assert.deepEqual(starts.map(r => r.status), ["fulfilled", "rejected"]);
  const old = starts[0].value;
  await assert.rejects(h.make().claim("b"), /unavailable/);
  h.at(110000); const current = await h.make().claim("b");
  assert.ok(current.fence > old.fence);
  const before = h.store.read();
  await assert.rejects(h.host.tick(old), /fenced/);
  await assert.rejects(h.host.sessions(old, [], () => { throw new Error("must not run"); }), /fenced/);
  await assert.rejects(h.host.stop(old), /fenced/);
  assert.deepEqual(h.store.read(), before);
  const tick = await h.make().tick(current);
  assert.equal(tick.steps, HOST.maxSteps); assert.equal(tick.lagMs, 8000);
});

test("restart preserves random decisions, routes and timers, matching uninterrupted fixed steps", async () => {
  const a = harness(), b = harness();
  const ta = await a.host.begin("uninterrupted", 60000), tb = await b.host.begin("before-restart", 60000);
  for (let i = 1; i <= 2; i++) { a.at(100000 + i * 1000); b.at(a.now()); await a.host.tick(ta); await b.host.tick(tb); }
  for (let i = 3; i <= 12; i++) { a.at(100000 + i * 1000); await a.host.tick(ta); }
  b.at(112000); const restarted = b.make(), fresh = await restarted.claim("after-restart");
  for (let i = 0; i < 5; i++) await restarted.tick(fresh);
  assert.deepEqual(b.store.read().simulation, a.store.read().simulation);
  assert.equal(b.store.read().simulatedAt, a.store.read().simulatedAt);
});

test("failed commits publish nothing, retain the previous world, and allow deterministic recovery", async () => {
  const h = harness(), ticket = await h.host.begin("a", 60000), before = h.store.read();
  h.at(101000); h.store.failNext();
  await assert.rejects(h.host.tick(ticket), /storage unavailable/);
  assert.deepEqual(h.store.read(), before);
  const result = await h.host.tick(ticket);
  assert.equal(result.snapshot.sequence, before.revision + 1);
  assert.equal(h.store.read().simulation.steps, 4);
});

test("duplicate wakes do not step twice; permanent running and unbounded catch-up are refused", async () => {
  const h = harness();
  await assert.rejects(h.host.begin("a", Infinity), /bounded/);
  await assert.rejects(h.host.begin("a", HOST.maxRunMs + 1), /bounded/);
  const ticket = await h.host.begin("a", 1000);
  h.at(100500); await h.host.tick(ticket);
  const before = h.store.read(), writes = h.store.writes;
  assert.equal((await h.host.tick(ticket)).steps, 0);
  assert.equal(h.store.writes, writes); assert.deepEqual(h.store.read(), before);
  h.at(101000); assert.equal((await h.host.tick(ticket)).status, "stopped");
  const stopped = h.store.read();
  await assert.rejects(h.host.claim("b"), /unavailable/);
  h.at(200000); await assert.rejects(h.host.begin("b", 60000), /explicit recovery/);
  assert.deepEqual(h.store.read(), stopped, "a stale world is never silently reset");
  const resumed = await h.host.begin("b", 60000, { resumePaused: true });
  assert.equal(h.store.read().pausedMs, 99500);
  assert.deepEqual(h.store.read().simulation, before.simulation, "operator resume preserves RNG, routes and timers");
  assert.ok(resumed.fence > ticket.fence);
});

test("long outages record a recovery gate instead of skipping world time", async () => {
  const h = harness(); await h.host.begin("a", 120000);
  h.at(140000); const ticket = await h.host.claim("b");
  const result = await h.host.tick(ticket);
  assert.equal(result.status, "backlog"); assert.equal(result.snapshot, null);
  assert.equal(h.store.read().simulatedAt, 100000);
  assert.equal(h.store.read().simulation.steps, 0);
});

test("unknown schema/world and invalid or oversized state fail closed without resetting storage", async () => {
  const h = harness(), ticket = await h.host.begin("a", 60000), saved = h.store.read();
  for (const patch of [{ schema: 1 }, { schema: 2 }, { schema: 3 }, { schema: 5 }, { world: "future-world" }, { runUntil: saved.wallAt + HOST.maxRunMs + 1 },
    { leaseUntil: saved.wallAt + HOST.leaseMs + 1 }, { simulation: { ...saved.simulation, seed: NaN } },
    { simulation: { ...saved.simulation, padding: "x".repeat(HOST.checkpointBytes) } }]) {
    const damaged = { ...saved, ...patch }; h.store.corrupt(damaged);
    await assert.rejects(h.host.tick(ticket)); assert.deepEqual(h.store.read(), damaged);
  }
  h.store.corrupt(saved); h.at(99999);
  await assert.rejects(h.host.tick(ticket), /clock moved backwards/);
  assert.deepEqual(h.store.read(), saved);
});

test("public snapshots exclude session/equipment data and enforce item and UTF-8 byte limits", () => {
  const record = { world: simulation.version, fence: 1, revision: 1, simulatedAt: 100000, sessions: { token: "private" } };
  const valid = simulation.project(simulation.initial());
  const result = publicSnapshot(record, valid);
  assert.equal(JSON.stringify(result).includes("private"), false);
  for (const projected of [{ ...valid, sessions: [] }, { ...valid, hub: { pile: 1, player: "private" } },
    { ...valid, npcs: [{ ...valid.npcs[0], equipment: { ammo: 30 } }] },
    { ...valid, npcs: [valid.npcs[0], valid.npcs[0]] },
    { ...valid, npcs: Array.from({ length: HOST.maxNpcs + 1 }, (_, i) => ({ ...valid.npcs[0], id: `npc-${i}` })) }]) {
    assert.throws(() => publicSnapshot(record, projected));
  }
  assert.throws(() => boundedJSON({ text: "💚".repeat(100) }, 200), /size/);
  for (const bad of [{ x: NaN }, { x: undefined }, { x: new Set() }, { x: Array(2) }]) assert.throws(() => boundedJSON(bad, 1000));
});

test("latest delivery bounds fanout, rate and backlog; a slow follower converges without history replay", () => {
  const delivery = new LatestHostDelivery(simulation.version);
  for (let i = 0; i < HOST.maxFollowers; i++) assert.equal(delivery.join(i), true);
  assert.equal(delivery.join("overflow"), false);
  const frame = sequence => publicSnapshot({ world: simulation.version, fence: 1, revision: sequence, simulatedAt: 100000 + sequence }, simulation.project(simulation.initial()));
  delivery.offer(frame(1)); const received = [];
  assert.equal(delivery.flush(0, 100000, HOST.snapshotBytes, text => { received.push(text); return true; }), false);
  for (let i = 2; i <= 20; i++) delivery.offer(frame(i));
  assert.equal(delivery.offer(frame(3)), false);
  assert.equal(delivery.flush(0, 100000, 0, text => { received.push(text); return true; }), true);
  assert.equal(received.length, 1); assert.equal(JSON.parse(received[0]).sequence, 20);
  delivery.offer(frame(21));
  delivery.join(0);
  assert.equal(delivery.flush(0, 100100, 0, () => true), false);
  assert.equal(delivery.flush(0, 100250, 0, () => false), false);
  assert.equal(delivery.flush(0, 100250, 0, () => true), true);
  assert.equal(delivery.stats.messages, 2); assert.equal(delivery.stats.skipped, 2);
  delivery.leave(0); assert.equal(delivery.flush(0, 100500, 0, () => true), false);
  assert.equal(delivery.join("replacement"), true);
  assert.throws(() => delivery.offer({ ...frame(22), world: "old-build" }), /version/);
  const newEpoch = { ...frame(1), epoch: 2 }; assert.equal(delivery.offer(newEpoch), true);
  assert.equal(delivery.offer(frame(99)), false);
});

test("session ownership, deadlines and departure intents commit atomically with host fencing", async () => {
  const h = harness(), old = await h.host.begin("a", 120000);
  const empty = h.store.read();
  await assert.rejects(h.host.sessions(old, Array(65).fill("unexpected"), () => null), /MAX_SESSIONS/);
  await assert.rejects(h.host.disconnect(old, [], { accountId: 1, generation: 1, token: "0".repeat(32) }, 100001), /no later/);
  assert.deepEqual(h.store.read(), empty, "first admission validates the same input bounds as restore");
  h.store.failNext();
  const claim = { protocol: SESSION_PROTOCOL, world: simulation.version, accountId: 1, bodyId: "same-body", zone: "outside",
    body: { kind: "ooga", motion: { x: 1, y: 2, z: 3, yaw: 0, vx: 0, vy: 0, vz: 0, grounded: true },
      equipment: { weapon: "gun", mode: "carry", magazine: 12, spareAmmo: [11, 19], jetpack: true, fuel: 0.4,
        primaryOwned: true, secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpackOwned: true } } };
  const connect = (registry, now) => registry.connect(claim, now);
  await assert.rejects(h.host.sessions(old, [], connect), /storage unavailable/);
  assert.equal(h.store.read().sessions, null);
  const first = (await h.host.sessions(old, [], connect)).result;
  assert.equal(first.ok, true);
  h.at(110000); const fresh = await h.make().claim("b");
  const recovered = await h.host.sessions(fresh, [], registry => registry.view(1));
  assert.equal(recovered.result.state, "grace"); assert.equal(recovered.result.deadline, 160000);
  assert.equal(recovered.result.presentation, "open-hand");
  assert.deepEqual(recovered.result.equipment, claim.body.equipment);
  await assert.rejects(h.host.sessions(old, [], connect), /fenced/);
  const back = (await h.host.sessions(fresh, [], connect)).result;
  assert.equal(back.resumed, true); assert.equal(back.view.bodyId, "same-body");
  assert.equal(back.view.presentation, null); assert.notEqual(back.session.token, first.session.token);
  assert.equal((await h.host.sessions(fresh, [back.session.token], (registry, now) => registry.confirm(first.session, now))).result, false);
  await h.host.sessions(fresh, [back.session.token], (registry, now) => registry.disconnect(back.session, now));
  h.at(170000); const expiryHost = await h.host.claim("c");
  const gone = (await h.host.sessions(expiryHost, [], registry => registry.pending())).result;
  assert.equal(gone.length, 1); assert.equal(gone[0].at, 170000);
  assert.equal(gone[0].glyph, "green"); assert.equal(gone[0].handback, null);
  h.store.failNext();
  await assert.rejects(h.host.sessions(expiryHost, [], registry => registry.acknowledge(gone[0].id)), /storage unavailable/);
  assert.deepEqual((await h.host.sessions(expiryHost, [], registry => registry.pending())).result, gone);
  await h.host.sessions(expiryHost, [], registry => registry.acknowledge(gone[0].id));
  assert.deepEqual((await h.host.sessions(expiryHost, [], registry => registry.pending())).result, []);
});

test("confirmed close after socket removal gets a full grace and ticks advance it with zero viewers", async () => {
  const h = harness(simulation, (m, ms) => ({ ...m, y: Math.max(0, m.y - ms / 1000) }));
  const ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  h.at(105000);
  const closed = await h.host.disconnect(ticket, [], first.session, 105000);
  assert.equal(closed.result.deadline, 165000);
  h.at(106000); await h.host.tick(ticket, []);
  let body = h.store.read().sessions.sessions[0];
  assert.equal(body.stepAt, 106000); assert.ok(body.motion.y < 10);
  assert.deepEqual(body.equipment, claim.body.equipment);
  await h.host.disconnect(ticket, [], first.session, 106000);
  assert.equal(h.store.read().sessions.sessions[0].deadline, 165000, "duplicate close cannot extend grace");
  for (let at = 107000; at < 165000; at += 1000) { h.at(at); await h.host.tick(ticket, []); }
  h.at(165000); await h.host.tick(ticket, []);
  const saved = h.store.read();
  assert.equal(saved.sessions.sessions.length, 0);
  assert.equal(saved.sessions.pending.length, 1);
  assert.equal(saved.sessions.pending[0].at, 165000);
  assert.equal(saved.sessions.pending[0].body.motion.y, 0);
  assert.equal(saved.sessions.pending[0].zone, "outside");
  assert.deepEqual(saved.sessions.pending[0].body.equipment, claim.body.equipment);
  assert.equal(saved.sessions.pending[0].applied, true);
  await assert.rejects(h.host.tick(ticket), /census/);
});

test("run deadline drains existing bodies for at most their remaining grace without accepting new claims", async () => {
  const h = harness(), ticket = await h.host.begin("a", 1000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  h.at(101000);
  await assert.rejects(h.host.sessions(ticket, [first.session.token], (r, now) => r.connect(claim, now)), /run closed/);
  const result = await h.host.tick(ticket, [first.session.token]);
  assert.equal(result.status, "draining");
  assert.equal(h.store.read().sessions.sessions[0].deadline, 161000);
  await assert.rejects(h.host.begin("another", 60000), /drain/);
  const steps = h.store.read().simulation.steps;
  for (let at = 102000; at < 161000; at += 1000) { h.at(at); await h.host.tick(ticket, []); }
  h.at(161000); assert.equal((await h.host.tick(ticket, [])).status, "stopped");
  assert.equal(h.store.read().simulation.steps, steps, "drain cannot keep NPC simulation running");
  assert.equal(h.store.read().sessions.sessions.length, 0);
  await assert.rejects(h.host.tick(ticket, []), /fenced/);

  // A late restart completes the persisted expiry; it never grants another 60 seconds.
  const late = harness(), old = await late.host.begin("a", 1000);
  const live = (await late.host.sessions(old, [], (r, now) => r.connect(bodyClaim(), now))).result;
  late.at(200000); const fresh = await late.make().claim("recovered");
  await late.make().tick(fresh, [live.session.token]);
  assert.equal(late.store.read().status, "stopped");
  assert.equal(late.store.read().sessions.pending[0].at, 161000);
});

test("explicit stop preserves earlier disconnect deadlines while draining a still-live body", async () => {
  const h = harness(), ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  const secondClaim = { ...bodyClaim(), accountId: 2, bodyId: "second" };
  const second = (await h.host.sessions(ticket, [first.session.token], (r, now) => r.connect(secondClaim, now))).result;
  h.at(101000); await h.host.disconnect(ticket, [second.session.token], first.session, 101000);
  h.at(102000); assert.equal((await h.host.stop(ticket, [second.session.token])).status, "draining");
  assert.deepEqual(h.store.read().sessions.sessions.map(s => s.deadline), [161000, 162000]);
  h.at(170000); const fresh = await h.host.claim("restart");
  assert.equal((await h.host.tick(fresh, [])).status, "stopped");
  assert.deepEqual(h.store.read().sessions.pending.map(s => s.at), [161000, 162000]);
});

test("paused resume preserves absolute logical AI deadlines while wall-clock grace still expires", async () => {
  const adapter = { ...simulation,
    initial: now => ({ ...simulation.initial(), deadline: now + 20000, completed: false }),
    step(s, ms, now) { simulation.step(s, ms); s.completed ||= now >= s.deadline; },
  };
  const h = harness(adapter), old = await h.host.begin("a", 60000);
  h.at(101000); await h.host.tick(old); await h.host.stop(old);
  h.at(200000); const fresh = await h.host.begin("b", 60000, { resumePaused: true });
  assert.equal(h.store.read().simulatedAt, 101000);
  assert.equal(h.store.read().wallCursor, 200000);
  h.at(200250); await h.host.tick(fresh);
  assert.equal(h.store.read().simulation.completed, false);
  for (let i = 1; i <= 19; i++) { h.at(200250 + i * 1000); await h.host.tick(fresh); }
  assert.equal(h.store.read().simulation.completed, true, "logical time reaches its original deadline");
});

test("NPC handback and body tombstone application share a transaction, survive restart and never spawn absent NPCs", async () => {
  const adapter = { ...simulation,
    initial: () => ({ ...simulation.initial(), npcs: [{ id: "existing", bodyId: "resident", owner: "player", handedBack: 0 }] }),
    npcFor: (s, bodyId) => s.npcs.find(n => n.bodyId === bodyId)?.id ?? null,
    handoff(s, intent) {
      const npc = s.npcs.find(n => n.id === intent.handback.npc);
      npc.owner = "npc"; npc.handedBack++; npc.body = intent.body;
      return true;
    },
  };
  const h = harness(adapter), ticket = await h.host.begin("a", 120000), claim = bodyClaim();
  const first = (await h.host.sessions(ticket, [], (r, now) => r.connect(claim, now))).result;
  const absent = (await h.host.sessions(ticket, [first.session.token], (r, now) => r.connect({ ...bodyClaim(), accountId: 2, bodyId: "absent" }, now))).result;
  await h.host.disconnect(ticket, [absent.session.token], first.session, 100000);
  await h.host.disconnect(ticket, [], absent.session, 100000);
  h.at(160000); const fresh = await h.host.claim("b"), before = h.store.read();
  h.store.failNext(); await assert.rejects(h.host.tick(fresh, []), /storage unavailable/);
  assert.deepEqual(h.store.read(), before, "neither ownership nor tombstone applies on a failed commit");
  await h.host.tick(fresh, []);
  let saved = h.store.read();
  assert.equal(saved.simulation.npcs.length, 1);
  assert.equal(saved.simulation.npcs[0].handedBack, 1);
  assert.equal(saved.simulation.npcs[0].owner, "npc");
  assert.deepEqual(saved.simulation.npcs[0].body.equipment, claim.body.equipment);
  assert.ok(saved.sessions.pending.every(p => p.applied));
  h.at(200000);
  const resumed = await h.host.begin("c", 60000, { resumePaused: true });
  await h.make().tick(resumed, []);
  saved = h.store.read();
  assert.equal(saved.simulation.npcs[0].handedBack, 1, "applied tombstone does not replay handback");
  assert.equal(saved.sessions.pending[1].handback, null);
});
