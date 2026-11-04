import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createClankerFlight, createFlightCheckpoint, FLIGHT } from "../src/clanker-flight.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";
import { initial, prepare, capture, restore, codec, world } from "./fixtures/clanker-flight-fixture.mjs";
const original = JSON.parse(readFileSync(new URL("fixtures/clanker-flight-original.json", import.meta.url)));
const baseline = hooks => runInNewContext(original.blocks.join("") + "\n({ prepareJump, updateJump });", hooks);

test("shared Clanker flight preserves original preflight, reversal, wall and blocked-arc decisions", async t => {
  const source = readFileSync(new URL("../../src/js/clanker-flight.js", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(original.blocks.join("")).digest("hex"), original.sha256);
  for (const block of original.blocks) assert.ok(source.includes(block));
  let samples = 0;
  for (const scenario of ["land", "reverse", "blocked", "wall", "lost-wall", "rage-blocked", "rage-pose", "fire", "work", "lab"]) {
    const entries = [initial(), initial()], runs = [await prepare(baseline), await prepare()];
    for (let i = 0; i < 2; i++) {
      const e = entries[i], r = runs[i];
      if (scenario.startsWith("rage")) { e.rage.active = true; e.motion.dragging = true; }
      if (scenario === "fire") r.control.fireClear = false;
      if (scenario === "work") e.phase = "work";
      if (scenario === "lab") e.motion.lab = true;
      r.control.attach = scenario === "wall";
      const admitted = r.controller.prepareJump(e, 0, 0, -4, 1.5, false, false, scenario.includes("wall"));
      assert.equal(admitted, !["fire", "work", "lab"].includes(scenario));
    }
    assert.deepEqual(capture(entries[1]), capture(entries[0]), `${scenario} preflight`);
    assert.deepEqual(Array.from(entries[1].jump.points), Array.from(entries[0].jump.points), `${scenario} preflight scratch`);
    for (let frame = 0; frame < 100 && entries[0].jump.active; frame++) {
      for (let i = 0; i < 2; i++) {
        const r = runs[i];
        r.control.blocked = frame >= 4 && ["blocked", "rage-blocked"].includes(scenario);
        r.control.reverseOnly = frame >= 4 && scenario === "reverse";
        r.control.poseClear = !(frame >= 4 && scenario === "rage-pose");
        r.controller.updateJump(entries[i], .05);
      }
      samples++; assert.deepEqual(capture(entries[1]), capture(entries[0]), `${scenario} frame ${frame}`);
    }
    assert.equal(entries[1].jump.active, false);
    if (["blocked", "rage-blocked", "rage-pose"].includes(scenario)) assert.equal(entries[1].drive.airborne, true);
    if (scenario === "rage-blocked") assert.equal(entries[1].climb.airAttachAfter, Infinity);
  }
  t.diagnostic(JSON.stringify({ samples, scope: "actual flight controller over authored mesh; wall/peer/rig adapters are fixtures" }));
});

test("Clanker flight checkpoints reconstruct every sample and reject incompatible or unbounded state", async t => {
  const live = initial(), a = await prepare(), b = await prepare();
  a.controller.prepareJump(live, 0, 0, -4, 1.5);
  let rebuilt = restore(JSON.parse(JSON.stringify(capture(live)))), count = 0, peak = 0;
  while (live.jump.active) {
    a.controller.updateJump(live, .025); b.controller.updateJump(rebuilt, .025);
    assert.deepEqual(capture(rebuilt), capture(live));
    const saved = JSON.parse(JSON.stringify(capture(rebuilt)));
    peak = Math.max(peak, Buffer.byteLength(JSON.stringify(saved.jump)));
    rebuilt = restore(saved); count++;
  }
  assert.ok(count > 40); assert.ok(peak <= FLIGHT.checkpointBytes);
  for (const mutate of [s => { s.v = 2; }, s => { s.world = "other"; }, s => { s.samples++; },
    s => { s.jump.duration = NaN; }, s => { s.jump.progress = 2; }, s => { s.jump.points = []; },
    s => { delete s.jump.fromX; }, s => { s.jump.toX = 1e9; }]) {
    const saved = codec.capture(live.jump); mutate(saved); assert.throws(() => codec.restore(saved), /flight/);
  }
  assert.throws(() => createFlightCheckpoint(world, 100), /flight/);
  assert.throws(() => createClankerFlight({ ...a.adapters, staticClear: null }), /flight/);
  const malformed = createClankerFlight({ ...a.adapters, staticClear: async () => true });
  assert.throws(() => malformed.prepareJump(initial(), 0, 0, -4), /flight/);
  assert.throws(() => a.controller.updateJump(live, .05), /flight/, "inactive arcs cannot replay");
  const e = initial(); a.controller.prepareJump(e, 0, 0, -4);
  assert.throws(() => a.controller.updateJump(e, 1), /flight/);
  assert.throws(() => a.controller.prepareJump(initial(), -4, 0, -4, 0, false, true), /flight/, "zero-duration running arc refused");
  assert.ok(rebuilt.jump.points.every(v => v === 0), "restored scratch is empty");
  for (const mutate of [j => { j.points = []; }, j => { j.points[0] = NaN; }, j => { j.points = new Float64Array(3); }]) {
    const e = initial(); mutate(e.jump); assert.throws(() => codec.capture(e.jump), /flight/);
  }
  // A new preflight overwrites scratch in order, including after a refused
  // partial preflight. It must make the same decisions after reconstruction.
  for (const target of [-4, 0]) {
    a.control.failAt = a.control.calls + 10; b.control.failAt = b.control.calls + 10;
    assert.equal(a.controller.prepareJump(live, target, 0, -4, 1.5), false);
    assert.equal(b.controller.prepareJump(rebuilt, target, 0, -4, 1.5), false);
    rebuilt = restore(capture(rebuilt)); a.control.failAt = b.control.failAt = 0;
    assert.equal(a.controller.prepareJump(live, target, 0, -4, 1.5), b.controller.prepareJump(rebuilt, target, 0, -4, 1.5));
    assert.deepEqual(Array.from(rebuilt.jump.points), Array.from(live.jump.points));
    assert.deepEqual(capture(rebuilt), capture(live));
    while (live.jump.active) {
      a.controller.updateJump(live,.05); b.controller.updateJump(rebuilt,.05);
      assert.deepEqual(capture(rebuilt), capture(live)); rebuilt=restore(capture(rebuilt));
    }
  }
  t.diagnostic(JSON.stringify({ restoredSamples: count, peakFlightBytes: peak }));
});

test("actual Clanker flight and coupled body state recover through failed host writes and a new owner", async () => {
  const f = await prepare();
  function harness() {
    let data, fail = false, now = 100000;
    const storage = { async transaction(fn) {
      let next = structuredClone(data); const result = await fn({ get: async () => structuredClone(next), put: async (_, r) => { next = structuredClone(r); } });
      if (fail) { fail = false; throw Error("flight write failed"); } data = next; return result;
    } };
    const simulation = { version: world,
      initial() { const e = initial(); f.controller.prepareJump(e, 0, 0, -4, 1.5); return capture(e); },
      validate(s) { codec.restore(s.jump); return true; },
      step(s, ms) { const e = restore(s); if (e.jump.active) f.controller.updateJump(e, ms / 1000); Object.assign(s, capture(e)); },
      project: s => ({ npcs: [{ id: "clanker-fixture", kind: "clanker", ...s.root.position, yaw: s.heading,
        activity: "chilling", phase: s.jump.jump.active ? "jump" : "land", route: "fixture-arc", progress: s.jump.jump.progress, seed: 1 }], hub: { pile: 0 } }),
      npcFor: () => null, handoff: () => false };
    return { make: () => new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now }),
      at: n => { now = n; }, read: () => structuredClone(data), fail: () => { fail = true; } };
  }
  const a = harness(), b = harness(), live = a.make(), first = b.make();
  const ta = await live.begin("a", 60000), tb = await first.begin("b", 60000);
  a.at(100500); b.at(100500); const before = b.read(); b.fail();
  await assert.rejects(first.tick(tb), /flight write failed/); assert.deepEqual(b.read(), before);
  await live.tick(ta); await first.tick(tb);
  for (let time = 101000; time <= 111000; time += 1000) { a.at(time); await live.tick(ta); }
  b.at(111000); const recovered = b.make(), ticket = await recovered.claim("new-owner");
  for (let i = 0; i < 6; i++) assert.ok((await recovered.tick(ticket)).steps <= HOST.maxSteps);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  assert.equal(b.read().simulation.jump.jump.active, false);
  await assert.rejects(first.tick(tb), /fenced/);
});
