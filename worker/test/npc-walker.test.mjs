import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createNpcWalker, createWalkerState, createWalkerCheckpoint, WALKER } from "../src/npc-walker.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";
import { prepare, codec, world } from "./fixtures/npc-walker-fixture.mjs";

const original = JSON.parse(readFileSync(new URL("fixtures/npc-walker-original.json", import.meta.url)));
const baseline = hooks => runInNewContext(original.constants + original.source
  + "\n({ recoverWalker, walkToward, walkWorkTo });", { ...hooks });

test("shared walker packaging matches original decisions across authored work trips and traffic", async () => {
  assert.equal(typeof window, "undefined");
  assert.equal(createHash("sha256").update(original.source).digest("hex"), original.sha256);
  const shared = readFileSync(new URL("../../src/js/npc-walker.js", import.meta.url), "utf8");
  assert.equal(shared.slice(shared.indexOf("    const recoverWalker = ("), shared.indexOf("    return { recoverWalker,")), original.source);
  const f = await prepare(), states = [f.initial(), f.initial()], runs = [f.runtime(states[0], baseline), f.runtime(states[1])];
  const phases = new Set();
  for (let frame = 0; frame < 500; frame++) {
    for (let i = 0; i < 2; i++) {
      const a = states[i].actor;
      a.traffic.waiting = frame >= 15 && frame < 20; a.traffic.yielding = frame >= 40 && frame < 45;
      if (frame === 60) Object.assign(a.progress, { backoff: .3, backX: -1, backZ: 0 });
      runs[i].step(.1);
    }
    assert.deepEqual(f.encode(states[1]), f.encode(states[0]), `frame ${frame}`);
    phases.add(states[1].actor.work.phase);
  }
  assert.ok(phases.has("outbound") && phases.has("station") && phases.has("shoot") && phases.has("return") && phases.has("reload"));
  assert.ok(states[1].actor.pathing.plans > 0, "work trips actually use the existing route planner");
  assert.ok(states[1].events.shots > 0, "actual movement reaches a station; weapon effects remain fixture-owned");
});

test("incremental recovery search and route traversal survive every-frame reconstruction", async t => {
  const f = await prepare(), live = f.initial(true); live.actor.pathing = null;
  Object.assign(live.actor.root.position, { x: 0, y: 0, z: -1.2 });
  const run = f.runtime(live);
  // The real recovery trigger starts a search after stalled progress. Freeze
  // the body for those trigger frames; do not synthesize a route or search tree.
  for (let i = 0; i < 12; i++) run.controller.recoverWalker(live.actor, 0, 4, .1);
  assert.equal(live.actor.avoidance.navigation.mode, 1);
  let restored = f.decode(JSON.parse(JSON.stringify(f.encode(live)))), maxBytes = 0;
  const modes = new Set([1]);
  for (let i = 0; i < 240; i++) {
    for (const [state, controller] of [[live, run.controller], [restored, f.runtime(restored).controller]]) {
      controller.recoverWalker(state.actor, 0, 4, .1);
      controller.walkToward(state.actor, 0, 4, .125);
      modes.add(state.actor.avoidance.navigation.mode);
    }
    assert.deepEqual(f.encode(restored), f.encode(live), `search/movement frame ${i}`);
    const saved = JSON.parse(JSON.stringify(f.encode(restored)));
    maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(saved.actor.avoidance)));
    restored = f.decode(saved);
    assert.equal(run.mesh.clearAt(live.actor.root.position.x, .01, live.actor.root.position.z, .2, 1.79), true);
  }
  assert.ok(modes.has(2), "actual local search finds and follows a detour");
  assert.ok(live.actor.root.position.z > 2, "walker gets around the blocker");
  assert.ok(maxBytes <= WALKER.checkpointBytes);
  t.diagnostic(JSON.stringify({ samples: 240, maxWalkerBytes: maxBytes, modes: [...modes],
    scope: "single authored mesh world, actual walker/search; no full crowd or airborne integration" }));
});

test("walker codec fences world and search corruption without cyclic parent reconstruction", async () => {
  const f = await prepare(), state = f.initial(true), run = f.runtime(state);
  state.actor.pathing = null; state.actor.root.position.z = -1.2;
  for (let i = 0; i < 12; i++) run.controller.recoverWalker(state.actor, 0, 4, .1);
  run.controller.walkToward(state.actor, 0, 4, .125);
  const saved = codec.capture(state.actor.avoidance);
  assert.ok(saved.avoidance.navigation.entries.length > 1);
  for (const mutate of [s => { s.world = "other"; }, s => { s.v = 2; }, s => { s.avoidance.tx = NaN; },
    s => { s.avoidance.best = Infinity; }, s => { s.avoidance.side = 0; },
    s => { s.avoidance.navigation.entries[0][2] = s.avoidance.navigation.entries[0][0]; },
    s => { s.avoidance.navigation.entries.reverse(); }, s => { s.avoidance.navigation.mode = 2; s.avoidance.navigation.count = 0; },
    s => { s.avoidance.navigation.entries[0][4] = 2; }, s => { delete s.avoidance.navigation.entries[0]; }]) {
    const corrupt = structuredClone(saved); mutate(corrupt);
    assert.throws(() => codec.restore(corrupt), /checkpoint/);
  }
  const index = saved.avoidance.navigation.entries[0][0], cost = saved.avoidance.navigation.entries[0][1];
  const rebuilt = codec.restore(saved); saved.avoidance.navigation.entries[0][1] = 999;
  assert.equal(rebuilt.navigation.costs[index], cost);
  assert.throws(() => createWalkerCheckpoint(""), /checkpoint/);
  assert.throws(() => createNpcWalker({ ...run.hooks, walkerClear: undefined }), /adapters/);
  assert.throws(() => run.controller.walkWorkTo(state.actor, { x: 100, z: 0 }, .1), /goal/);
  assert.throws(() => run.controller.walkToward(state.actor, 0, 4, 2), /distance/);
  assert.throws(() => run.controller.recoverWalker(state.actor, 0, 4, 1), /step/);
  assert.throws(() => createNpcWalker({ ...run.hooks, PLAYER_STEP: Number.MIN_VALUE }), /adapters/);
  const fresh = f.initial().actor;
  assert.throws(() => createNpcWalker({ ...run.hooks, shoulderStep: () => 1e-300 }).walkToward(fresh, 2, 0, .125), /progress/);
  assert.throws(() => createNpcWalker({ ...run.hooks, walkerClear: async () => true }).walkToward(fresh, 2, 0, .125), /decision/);
  fresh.avoidance.navigation.mode = 1; fresh.avoidance.tx = NaN;
  assert.doesNotThrow(() => run.controller.walkWorkTo(fresh, { x: 2, z: 0 }, .1), "work invalidates the previous search before resetting it for the new goal");
  fresh.avoidance.navigation.mode = 3; fresh.avoidance.tx = 9000; fresh.avoidance.tz = 0;
  assert.throws(() => run.controller.walkToward(fresh, 2, 0, .125), /continuation/, "a close argument cannot disguise a distant saved jump target");
  const idle = codec.restore(codec.capture(createWalkerState(0)));
  assert.ok(Number.isNaN(idle.tx)); assert.equal(idle.best, Infinity);
});

test("failed-search jump selection preserves its decision without replaying airborne integration", async () => {
  const f = await prepare(), a = f.initial(), b = f.initial();
  a.actor.pathing = b.actor.pathing = null;
  const runs = [f.runtime(a, baseline), f.runtime(b)];
  for (let i = 0; i < 2; i++) {
    const state = [a, b][i];
    Object.assign(state.actor.avoidance, { tx: 2, tz: 0, goalX: 2, goalZ: 0, best: 2, stalled: 1 });
    state.actor.avoidance.navigation.mode = 3;
    runs[i].hooks.npcWalkable = () => false;
    // Recreate with a blocked supported route so the ORIGINAL jump planner is
    // actually exercised; vertical clearance still queries the real floor mesh.
    const controller = (i ? createNpcWalker : baseline)(runs[i].hooks);
    controller.walkToward(state.actor, 2, 0, .125);
  }
  assert.equal(b.actor.avoidance.navigation.mode, 4);
  assert.equal(b.actor.hopV, 4.8);
  assert.deepEqual(f.encode(b), f.encode(a));
  const restored = f.decode(JSON.parse(JSON.stringify(f.encode(b)))), before = f.encode(restored);
  assert.equal(f.runtime(restored).controller.walkToward(restored.actor, 2, 0, .125), 0);
  assert.deepEqual(f.encode(restored), before, "mode 4 waits for the caller's airborne integrator");
});

test("host commits combined work, real movement, routes and search state before recovery", async () => {
  const f = await prepare();
  function harness() {
    let value, fail = false, now = 100000;
    const storage = { async transaction(fn) {
      let next = structuredClone(value);
      const result = await fn({ get: async () => structuredClone(next), put: async (key, v) => { next = structuredClone(v); } });
      if (fail) { fail = false; throw new Error("injected walker commit failure"); }
      value = next; return result;
    } };
    const simulation = { version: world, initial: () => f.encode(f.initial()),
      validate(s) { f.decode(s); return true; },
      step(s, ms) { const state = f.decode(s); f.runtime(state).step(ms / 1000); Object.assign(s, f.encode(state)); },
      project: s => ({ npcs: [{ id: "walker", kind: "ooga", ...s.actor.root.position, yaw: s.actor.root.rotation.y,
        activity: "working", phase: s.work.work.phase, route: "authored", progress: 0, seed: s.rng.word }], hub: { pile: 0 } }),
      npcFor: () => null, handoff: () => false };
    return { make: () => new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now }),
      at: t => { now = t; }, read: () => structuredClone(value), fail: () => { fail = true; } };
  }
  const a = harness(), b = harness(), live = a.make(), old = b.make();
  const ta = await live.begin("a", 60000), tb = await old.begin("b", 60000);
  a.at(101000); b.at(101000); const before = b.read(); b.fail();
  await assert.rejects(old.tick(tb), /injected walker/);
  assert.deepEqual(b.read(), before);
  await live.tick(ta); await old.tick(tb);
  for (let at = 102000; at <= 111000; at += 1000) { a.at(at); await live.tick(ta); }
  b.at(111000); const recovered = b.make(), ticket = await recovered.claim("recovered");
  for (let i = 0; i < 5; i++) assert.ok((await recovered.tick(ticket)).steps <= HOST.maxSteps);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  await assert.rejects(old.tick(tb), /owner|lease|fenc/);
  assert.ok(Buffer.byteLength(JSON.stringify(b.read())) <= HOST.checkpointBytes);
  assert.ok(b.read().simulation.actor.pathing.plans > 0);
});
