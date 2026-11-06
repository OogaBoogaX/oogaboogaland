import { test } from "node:test";
import assert from "node:assert/strict";
import { createClankerBufferCheckpoint } from "../src/clanker-buffers.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { clankerController } from "./fixtures/clanker-controller-fixture.mjs";

const codecFor = fixture => createClankerBufferCheckpoint("buffer-fixture-1", fixture.sim.list.map(e => e.owner.id));
const bytes = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const install = (entries, restored) => entries.forEach((e, i) => {
  for (const [group, fields] of Object.entries(restored[i])) Object.assign(e[group], fields);
});
const compare = (entries, restored) => entries.forEach((e, i) => {
  for (const [group, fields] of Object.entries(restored[i])) for (const [name, a] of Object.entries(fields)) {
    const actual = e[group][name];
    if (a === null) assert.equal(actual, null);
    else assert.deepEqual(bytes(a), bytes(actual), `${i}.${group}.${name}`);
  }
});
const view = e => ({ x: e.root.position.x, y: e.root.position.y, z: e.root.position.z, heading: e.heading,
  phase: e.phase, route: e.route, rest: e.rest, goal: [e.goalX, e.goalY, e.goalZ], random: e.random.capture(),
  roam: { count: e.roam.count, index: e.roam.index, plans: e.roam.plans, path: Array.from(e.roam.path) },
  rig: e.gorilla.createManagedCheckpoint("buffers-parity").capture() });

test("Clanker typed paths survive repeated persisted replacement without changing actual AI or rig continuation", () => {
  const original = clankerController({ count: 3, checkpointRandom: true });
  const restored = clankerController({ count: 3, checkpointRandom: true });
  try {
    const codec = codecFor(restored), pack = createCheckpointPack(32 * 1024, { intern: true });
    for (let i = 0; i < 3; i++) restored.sim.list[i].gorilla.createManagedCheckpoint("buffers-parity")
      .restore(original.sim.list[i].gorilla.createManagedCheckpoint("buffers-parity").capture());
    for (let frame = 0; frame < 32; frame++) {
      const saved = codec.capture(restored.sim.list), copy = JSON.parse(JSON.stringify(pack.pack(saved)));
      const buffers = codec.restore(pack.unpack(copy));
      compare(restored.sim.list, buffers);
      install(restored.sim.list, buffers);
      original.step(); restored.step();
      assert.deepEqual(structuredClone(restored.sim.list.map(view)), structuredClone(original.sim.list.map(view)));
    }
  } finally { original.dispose(); restored.dispose(); }
});

test("fixed buffer schema covers the actual layout and retains raw bits, inactive tails and fresh identities", () => {
  const f = clankerController();
  try {
    const e = f.sim.list[0], codec = codecFor(f);
    // Exercise the optional roster-sized rage arrays, without claiming rage AI
    // recovery (its closure and search workspace are outside this component).
    e.rage.rejectedTargets = new Uint8Array([1]); e.rage.agitators = new Uint8Array([255]);
    // Distinct typed view offset; preserve a NaN payload, -0, Infinity, a subnormal
    // and stale data outside count=0 instead of truncating by active path count.
    e.roam.path = new Float64Array(new ArrayBuffer(128), 16, 12);
    const data = new DataView(e.roam.path.buffer, e.roam.path.byteOffset, e.roam.path.byteLength);
    data.setBigUint64(0, 0x7ff8000000000042n, true);
    e.roam.path[1] = -0; e.roam.path[2] = Infinity; e.roam.path[3] = Number.MIN_VALUE;
    e.roam.path[11] = -Math.PI; e.roam.count = 0;
    e.rage.hitters[41] = 65535; e.climb.points[383] = -Number.MAX_VALUE;
    const saved = codec.capture(f.sim.list), restored = codec.restore(JSON.parse(JSON.stringify(saved)));
    compare(f.sim.list, restored);
    const fields = new Set(Object.entries(restored[0]).flatMap(([g, fields]) => Object.keys(fields).map(k => `${g}.${k}`)));
    // Fail on newly added outer-controller typed fields: they require deliberate
    // schema work, not silent omission. Scene/owner/rig references are excluded.
    const excluded = new Set(["owner", "cave", "tooltipOwner", "gorilla", "root", "parts"]), seen = new Set([e]);
    const visit = (v, path) => {
      if (!v || typeof v !== "object" || seen.has(v)) return;
      seen.add(v);
      if (ArrayBuffer.isView(v)) { assert.ok(fields.delete(path), path); return; }
      for (const [key, value] of Object.entries(v)) visit(value, path ? `${path}.${key}` : key);
    };
    for (const [key, value] of Object.entries(e)) if (!excluded.has(key)) visit(value, key);
    assert.equal(fields.size, 0);
    restored[0].roam.path.fill(0);
    assert.equal(e.roam.path[11], -Math.PI, "restoring never aliases live buffers");
    compare(f.sim.list, codec.restore(saved));
  } finally { f.dispose(); }
});

test("buffer admission rejects incompatible bindings, malformed blocks and unsupported or oversized profiles", () => {
  const f = clankerController({ count: 2 });
  try {
    const codec = codecFor(f), saved = codec.capture(f.sim.list), before = JSON.stringify(saved);
    const corruptions = [
      s => { s.v++; }, s => { s.world = "another-world"; }, s => { s.endian = "unknown"; },
      s => { s.ids.reverse(); }, s => { s.buffers.pop(); }, s => { s.buffers[0].pop(); },
      s => { s.buffers[0].extra = 1; },
      ...[null, [], [4], [-0], [0, 0, 0], [0, 0, 0, "00"], [0, 0, 0, "0100"],
        [0, 0, 0, "ab", 0, 0, "cd"], [0, 0, 1, "ab", 0, 0, "cd"], [0, 1, 0, "ab", 0, 0, "cd"],
        [0, 0, 0, "FF"], [0, 0, 0, "a"], [0, 0, -0, "ab"], [0, -0, 0, "ab"],
        [0, -1, 0, "ab"], [0, 20, 0, "ab"], [0, 0, -1, "ab"], [0, 0, 6, "ab"],
        [0, 5, 0, "ab"], [0, 0, 5, "ab".repeat(17)], [0, 0, 0, "ab".repeat(65)], Array(1000000)]
        .map(row => s => { s.buffers[0] = row; }),
    ];
    for (const corrupt of corruptions) { const s = structuredClone(saved); corrupt(s); assert.throws(() => codec.restore(s)); }
    assert.equal(JSON.stringify(codec.capture(f.sim.list)), before, "bad restoration cannot mutate live entries");
    const e = f.sim.list[0], old = e.climb.points;
    e.climb.points = new Float64Array(512 * 3); assert.throws(() => codec.capture(f.sim.list)); e.climb.points = old;
    e.rage.search = {}; assert.throws(() => codec.capture(f.sim.list)); e.rage.search = null;
    e.climb.points = new Float64Array(new SharedArrayBuffer(old.byteLength)); assert.throws(() => codec.capture(f.sim.list)); e.climb.points = old;
    const many = createClankerBufferCheckpoint("dense-profile", Array.from({ length: 53 }, (_, i) => `a-${i}`));
    const dense = Array.from({ length: 53 }, (_, i) => ({ ...e, owner: { id: `a-${i}` } }));
    const oversized = many.capture(dense);
    // All individual triples are valid, but the complete encoded payload is
    // over budget. The reader must refuse it too, before expanded allocation.
    for (let i = 0; i < 3; i++) {
      oversized.buffers[i] = [0];
      for (let block = 0; block < 96; block++) oversized.buffers[i].push(3, block, "ab".repeat(64));
    }
    assert.throws(() => many.restore(oversized), /state size/);
    e.rage.path.fill(Math.PI);
    assert.throws(() => many.capture(dense), /capacity/);
    assert.throws(() => createClankerBufferCheckpoint("world", Array(54).fill("a")));
    assert.throws(() => createClankerBufferCheckpoint("world", ["a", "a"]));
  } finally { f.dispose(); }
});
