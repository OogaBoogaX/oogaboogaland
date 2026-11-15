import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createNpcWork, createWorkState, createWorkCheckpoint } from "../src/npc-work.js";
import { VirtualHost, LatestHostDelivery, HOST } from "../src/virtual-host.js";
import { codec, scenarios, initial, runtime, encode, decode, record } from "./fixtures/npc-work-fixture.mjs";

const golden = JSON.parse(readFileSync(new URL("fixtures/npc-work-golden.json", import.meta.url)));

test("shared work transitions match original crew traces through complete trips and interruptions", () => {
  assert.equal(typeof window, "undefined");
  for (const scenario of scenarios) {
    const actual = record(scenario);
    assert.deepEqual(actual, golden.scenarios[scenario], scenario);
    assert.deepEqual([...new Set(actual.transitions.map(t => t.phase))], ["outbound", "station", "shoot", "return", "reload"]);
  }
});

test("work checkpoints retain phase/timers across every frame with the enclosing authored actor fixture", t => {
  let maxWorkBytes = 0, maxFixtureBytes = 0;
  for (const scenario of scenarios) {
    const original = initial(scenario), live = runtime(original);
    let restored = decode(JSON.parse(JSON.stringify(encode(original))));
    for (let i = 0; i < 420; i++) {
      live.step(); runtime(restored).step();
      assert.deepEqual(encode(restored), encode(original), `${scenario} frame ${i}`);
      const saved = JSON.parse(JSON.stringify(encode(restored)));
      maxWorkBytes = Math.max(maxWorkBytes, Buffer.byteLength(JSON.stringify(saved.work)));
      maxFixtureBytes = Math.max(maxFixtureBytes, Buffer.byteLength(JSON.stringify(saved)));
      assert.ok(maxWorkBytes <= 2048);
      restored = decode(saved);
    }
  }
  t.diagnostic(JSON.stringify({ samples: scenarios.length * 420, maxWorkBytes, maxFixtureBytes,
    scope: "authored single-actor fixtures; excludes production collision, full actor state and runtime costs" }));
});

test("work codec fences versions, route catalogs, malformed cursors and mutable aliasing", () => {
  const work = createWorkState(0), saved = codec.capture(work), restored = codec.restore(saved);
  saved.work.position.x = 999; saved.work.target.z = 999; saved.routes[0] = 1;
  assert.equal(work.position.x, 0); assert.equal(restored.position.x, 0); assert.equal(restored.target.z, 0);
  for (const patch of [{ phase: "unknown" }, { site: 2 }, { plannedSite: 2 }, { index: 3 }, { index: -2 },
    { phase: "outbound", index: -1 }, { phase: "return", index: 2 },
    { place: 4097 }, { aimSample: 0.5 }, { timer: Infinity }, { rest: NaN }, { blockedTime: -1 },
    { targetReady: 1 }, { position: { x: 0, y: 0, z: 10001 } }, { extra: true }]) {
    assert.throws(() => codec.capture({ ...work, ...patch }), /checkpoint/);
  }
  const valid = codec.capture(work);
  for (const patch of [{ v: 1 }, { v: 3 }, { world: "other" }, { routes: [1, 2] }, { routes: [2] }, { extra: true }]) {
    assert.throws(() => codec.restore({ ...valid, ...patch }), /checkpoint/);
  }
  for (const routes of [[], Array(1), [0], [4097], Array(33).fill(1)]) assert.throws(() => createWorkCheckpoint("test", routes), /checkpoint/);
  assert.throws(() => createWorkCheckpoint("", [1]), /checkpoint/);
  const hooks = runtime(initial()).hooks;
  assert.throws(() => createNpcWork({ ...hooks, fireWeapon: undefined }), /adapters/);
  assert.throws(() => createNpcWork({ ...hooks, workSites: Array(2) }), /route/);
  assert.throws(() => createNpcWork({ ...hooks, workSites: [{ route: Array(2) }] }), /route/);
});

test("a fresh work actor with partial or empty ammo enters reload without a prior site assignment", () => {
  for (const ammo of [0, 17]) {
    const state = initial(); state.actor.weapon.ammo = ammo;
    assert.equal(Object.hasOwn(state.actor.weapon, "workSite"), false);
    runtime(state).step();
    assert.equal(state.actor.work.site, 0); assert.equal(state.actor.work.phase, "reload");
    assert.equal(state.events.reloads, 1);
    codec.capture(state.actor.work);
  }
});

test("station retry keeps its reservation when a position adapter refuses or produces invalid coordinates", () => {
  const state = initial(), a = state.actor;
  Object.assign(a.work, { phase: "station", site: 0, plannedSite: 0, place: 2, blockedTime: 0.7,
    position: { x: 2, y: 0, z: 1 } });
  const hooks = runtime(state).hooks;
  hooks.spotOccupied = () => true; hooks.walkWorkTo = () => false;
  for (const refused of [true, false]) {
    hooks.workSites[0].position = (c, out) => { out.x = Infinity; c.work.place = 33; return !refused; };
    a.work.blockedTime = 0.7;
    createNpcWork(hooks).runWork(a, 0.1);
    assert.deepEqual(a.work.position, { x: 2, y: 0, z: 1 });
    assert.equal(a.work.place, 2); assert.equal(a.work.phase, "station");
    codec.capture(a.work);
  }
});

function hostHarness(seed) {
  let value, now = 100000, fail = false;
  const storage = { async transaction(fn) {
    let next = structuredClone(value);
    const result = await fn({ get: async () => structuredClone(next), put: async (key, v) => { next = structuredClone(v); } });
    if (fail) { fail = false; throw new Error("injected work commit failure"); }
    value = next; return result;
  } };
  const simulation = {
    version: "work-fixture-1", checkpointBytes: 30 * 1024, initial: () => structuredClone(seed),
    validate(s) { decode(s); return true; },
    step(saved, ms) {
      const state = decode(saved);
      runtime(state).step(ms / 1000);
      Object.assign(saved, encode(state));
    },
    project: s => ({ npcs: [{ id: "fixture-ooga", kind: "ooga", ...s.actor.root.position,
      yaw: s.actor.root.rotation.y, activity: "working", phase: s.work.work.phase,
      route: `site:${s.work.work.site}`, progress: 0, seed: s.rng.word }], hub: { pile: 0 } }),
    npcFor: () => null, handoff: () => false,
  };
  return { host: () => new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now }),
    at: n => { now = n; }, read: () => structuredClone(value), fail: () => { fail = true; } };
}

test("VirtualHost recovers actual work phases atomically and bounds delivery to fast, slow and late followers", async () => {
  const state = initial("maintainer"), run = runtime(state), seeds = new Map();
  for (let i = 0; i < 420 && seeds.size < 5; i++) {
    run.step(); const phase = state.actor.work.phase;
    if (phase && !seeds.has(phase)) seeds.set(phase, encode(state));
  }
  assert.equal(seeds.size, 5);
  for (const [phase, seed] of seeds) {
    const a = hostHarness(seed), b = hostHarness(seed), live = a.host(), prior = b.host();
    const ta = await live.begin("a", 60000), tb = await prior.begin("b", 60000);
    const delivery = new LatestHostDelivery("work-fixture-1"), fast = [], slow = [], late = [];
    delivery.join("fast"); delivery.join("slow");
    a.at(101000); b.at(101000); const before = b.read(); b.fail();
    await assert.rejects(prior.tick(tb), /injected work commit failure/);
    assert.deepEqual(b.read(), before, `${phase}: failed write cannot retain fixture ammo, RNG or plan counters`);
    await live.tick(ta); delivery.offer((await prior.tick(tb)).snapshot);
    delivery.flush("fast", 101000, 0, text => { fast.push(JSON.parse(text)); return true; });
    assert.equal(delivery.flush("slow", 101000, HOST.snapshotBytes, () => true), false);
    for (let n = 102000; n <= 111000; n += 1000) { a.at(n); await live.tick(ta); }
    b.at(111000); const recovered = b.host(), ticket = await recovered.claim("recovered");
    for (let i = 0; i < 5; i++) delivery.offer((await recovered.tick(ticket)).snapshot);
    assert.deepEqual(b.read().simulation, a.read().simulation, phase);
    const committed = b.read();
    assert.equal((await recovered.tick(ticket)).steps, 0);
    await assert.rejects(prior.tick(tb), /owner|lease|fenc/);
    assert.deepEqual(b.read(), committed, "duplicate wake and stale owner cannot replay decisions");
    delivery.join("late");
    for (const [id, received] of [["fast", fast], ["slow", slow], ["late", late]]) {
      assert.equal(delivery.flush(id, 111000, 0, text => { received.push(JSON.parse(text)); return true; }), true);
    }
    assert.deepEqual(fast.at(-1), slow[0]); assert.deepEqual(slow[0], late[0]);
    assert.equal(slow.length, 1); assert.equal(late.length, 1);
    assert.equal(slow[0].epoch, ticket.fence);
    assert.equal("events" in slow[0], false, "late join is current state, never a replay of shot/plan effects");
    assert.ok(Buffer.byteLength(JSON.stringify(committed)) < HOST.checkpointBytes);
    assert.ok(delivery.latest.bytes <= HOST.snapshotBytes);
  }
});


test("work reservation timestamps survive JSON recovery and reject invalid values", () => {
  const work = createWorkState(0);
  assert.equal(work.reservedAt, Infinity);
  const empty = codec.capture(work);
  assert.equal(empty.v, 2);
  assert.equal(empty.work.reservedAt, null);
  assert.equal(codec.restore(JSON.parse(JSON.stringify(empty))).reservedAt, Infinity);
  for (const reservedAt of [0, 0.25, 12345]) {
    work.reservedAt = reservedAt;
    assert.equal(codec.restore(JSON.parse(JSON.stringify(codec.capture(work)))).reservedAt, reservedAt);
  }
  for (const reservedAt of [-1, NaN, -Infinity, null, '1'])
    assert.throws(() => codec.capture({ ...work, reservedAt }), /checkpoint/);
  for (const reservedAt of [-1, NaN, Infinity, '1'])
    assert.throws(() => codec.restore({ ...empty, work: { ...empty.work, reservedAt } }), /checkpoint/);
});
