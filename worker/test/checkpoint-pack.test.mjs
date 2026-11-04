import { test } from "node:test";
import assert from "node:assert/strict";
import { createCheckpointPack, PACK } from "../src/checkpoint-pack.js";
import { compactSimulation } from "../src/simulation-checkpoint.js";
import { initial, prepare, capture, restore } from "./fixtures/clanker-flight-fixture.mjs";

test("checkpoint packing preserves JSON values, hostile field names and negative zero across storage", () => {
  const codec = createCheckpointPack(4096), state = JSON.parse('{"__proto__":{"safe":true},"constructor":null,"array":[{},[],false,"🌍",1.2345678901234567]}');
  state.array.push(-0, Number.MIN_VALUE, Number.MAX_VALUE);
  const packed = codec.pack(state), decoded = codec.unpack(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(decoded, state); assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal({}.safe, undefined); assert.ok(Object.is(decoded.array[5], -0));
  decoded.array[0].changed = true; assert.deepEqual(codec.unpack(packed), state);
});

test("packing rejects ambiguous and oversized state; decoding rejects corrupt tags and expansion bombs", () => {
  const codec = createCheckpointPack(96 * 1024), shared = {}, cyclic = {}; cyclic.self = cyclic;
  const sparse = Array(1); sparse.extra = 1;
  let invoked = false;
  const accessor = { get value() { invoked = true; return 1; } }, hidden = Object.defineProperty({}, "hidden", { value: 1 });
  for (const value of [undefined, NaN, Infinity, new Float32Array(1), new Date(), cyclic, [shared, shared], sparse,
    accessor, hidden, { [Symbol("missing")]: 1 }, Symbol("value"),
    "x".repeat(PACK.stringChars + 1), Object.fromEntries(Array.from({ length: 65 }, (_, i) => [i, 1]))]) {
    assert.throws(() => codec.pack(value));
  }
  assert.equal(invoked, false);
  const p = codec.pack({ x: 1 });
  for (const data of [[-2, 0], [-3], [1, 0], [0], [0, 1, 2], {}]) assert.throws(() => codec.unpack({ ...p, data }));
  assert.throws(() => codec.unpack({ ...p, shapes: [["x", "x"]], data: [0, 1, 2] }));
  assert.throws(() => codec.unpack({ ...p, extra: true }));
  assert.throws(() => createCheckpointPack(256).pack("x".repeat(256)));
  // Small wire tree expands beyond 256 KiB through repeated long field names.
  const bomb = { v: 1, shapes: [["x".repeat(128)]], data: [-1, ...Array.from({ length: 2100 }, () => [0, 0])] };
  assert.ok(JSON.stringify(bomb).length < 16 * 1024); assert.throws(() => codec.unpack(bomb));
  let deep = 0; for (let i = 0; i < PACK.depth + 1; i++) deep = [deep];
  assert.throws(() => codec.pack(deep));
  assert.throws(() => codec.pack(Array(PACK.nodes).fill(0)));
});

test("compact simulation follows the original Clanker flight exactly after every durable round trip", async () => {
  const f = await prepare();
  const source = { version: "packed-flight-fixture", initial() { const e = initial(); f.controller.prepareJump(e, 0, 0, -4, 1.5); return capture(e); },
    validate: s => { restore(s); return true; }, step(s, ms) { const e = restore(s); if (e.jump.active) f.controller.updateJump(e, ms / 1000); Object.assign(s, capture(e)); },
    project: s => structuredClone(s.root.position), npcFor: () => null, handoff: () => false };
  const packed = compactSimulation(source, 4096), codec = createCheckpointPack(4096), reference = source.initial();
  let state = packed.initial();
  for (let i = 0; i < 120; i++) {
    source.step(reference, 50); packed.step(state, 50); state = JSON.parse(JSON.stringify(state));
    assert.deepEqual(codec.unpack(state), reference); assert.deepEqual(packed.project(state), source.project(reference));
  }
  const before = structuredClone(state); assert.equal(packed.handoff(state, {}), false); assert.deepEqual(state, before);
  const broken = compactSimulation({ ...source, step(s) { s.root.position.x = 99; throw Error("failed frame"); } }, 4096);
  assert.throws(() => broken.step(state, 50), /failed frame/); assert.deepEqual(state, before);
  assert.throws(() => compactSimulation({ ...source, step: () => Promise.resolve() }, 4096).step(state, 50), /synchronous/);
});

test("ownership queries share an immutable phase snapshot and a new phase observes handoff changes", () => {
  const snapshots = new Set();
  const source = { version: "query-fixture", initial: () => ({ owners: { body: "npc" } }), validate: () => true,
    step() {}, project: () => ({}), npcFor(s, id) {
      snapshots.add(s);
      assert.ok(Object.isFrozen(s) && Object.isFrozen(s.owners));
      if (id === "mutate") s.owners.body = "poisoned";
      return s.owners[id] || null;
    }, handoff(s) { s.owners.body = "replacement"; return true; } };
  const adapter = compactSimulation(source, 4096), state = adapter.initial(), first = adapter.readQueries(state);
  for (let i = 0; i < 64; i++) assert.equal(first.npcFor("body"), "npc");
  assert.equal(snapshots.size, 1, "one decode per read phase, not one per departing body");
  assert.throws(() => first.npcFor("mutate"), TypeError); assert.equal(first.npcFor("body"), "npc");
  adapter.handoff(state, {});
  assert.equal(adapter.readQueries(state).npcFor("body"), "replacement"); assert.equal(snapshots.size, 2);
  assert.equal(createCheckpointPack(4096).unpack(state).owners.body, "replacement");
});
