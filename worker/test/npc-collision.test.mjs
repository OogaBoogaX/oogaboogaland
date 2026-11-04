import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { prepareMeshCollision, COLLISION } from "../src/mesh-collision.js";
import { createNpcClearance } from "../src/npc-clearance.js";
import { VirtualHost, HOST } from "../src/virtual-host.js";

// Authored closed cube shells, not an exported production hub or actor rig.
const geometry = () => ({ id: "cube", verts: [-.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5, -.5,.5,-.5,
  -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5],
  faces: [[0,3,2,1], [4,5,6,7], [0,4,7,3], [1,2,6,5], [0,1,5,4], [3,7,6,2]]
    .map(i => ({ i, gorillaStep: false, supportOnly: false, ragePass: false })) });
const node = (id, x, y, z, sx, sy, sz) => ({ id, geometry: "cube", position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0 }, scale: { x: sx, y: sy, z: sz }, visible: true,
  shoulderOnly: false, climbMasonry: false, gorillaStepAll: false, ragePass: false });
const bundle = () => ({ v: 1, world: "collision-fixture-1", geometries: [geometry()],
  nodes: [node("floor", 0, -.5, 0, 10, 1, 10), node("wall", 2, 1.5, 0, 1, 3, 1)] });
const hooks = mesh => ({ PLAYER_RADIUS: .2, walkable: () => true,
  playerSupportAt: (x, z, y) => mesh.supportAt(x, z, y, .5),
  npcRampRoofAt: () => false, npcClosedCaveClear: () => true,
  npcWorkZoneClear: () => true, npcFireClear: () => true, npcPileAt: () => false,
  island: { clearAt: mesh.clearAt, voxelSegmentClearAt: mesh.segmentClear } });

test("headless mesh queries retain closed interiors, swept walls, support, ceiling and moving poses", async () => {
  assert.equal(typeof window, "undefined");
  const source = bundle(), prepared = await prepareMeshCollision(source), mesh = prepared.create();
  source.geometries[0].verts.fill(999); source.nodes[1].position.x = 999;
  assert.equal(mesh.supportAt(0, 0, .1), 0);
  assert.equal(mesh.ceilingAt(0, 0, -2), -1);
  assert.equal(mesh.supportAt(20, 20, 0), -Infinity);
  assert.equal(mesh.ceilingAt(20, 20, 0), Infinity);
  assert.equal(mesh.clearAt(2, .5, 0, .2, 1), false, "closed shell interior blocks even without face intersection");
  assert.equal(mesh.segmentClear(0, 0, 0, 4, 0, 0, .2, 1.8), false);
  assert.equal(mesh.segmentClear(0, 0, 2, 4, 0, 2, .2, 1.8), true);
  const saved = mesh.capture(); saved.poses[1].position.z = 3;
  mesh.restore(saved); saved.poses[1].position.z = 0;
  assert.equal(mesh.segmentClear(0, 0, 0, 4, 0, 0, .2, 1.8), true);
  assert.equal(mesh.segmentClear(0, 0, 3, 4, 0, 3, .2, 1.8), false);
  const moved = mesh.capture(), rebuilt = prepared.create(JSON.parse(JSON.stringify(moved)));
  assert.deepEqual(rebuilt.capture(), moved);
  assert.equal(rebuilt.segmentClear(0, 0, 3, 4, 0, 3, .2, 1.8), false);
  moved.poses[1].visible = false; rebuilt.restore(moved);
  assert.equal(rebuilt.clearAt(2, .5, 3, .2, 1), true);
  moved.poses[1].visible = true; moved.poses[1].rotation.y = Math.PI / 4; rebuilt.restore(moved);
  assert.equal(rebuilt.clearAt(2, .5, 3, .2, 1), false);
});

test("collision checkpoints reject incompatible worlds, missing semantics, malformed data and partial restores", async () => {
  const input = bundle(), prepared = await prepareMeshCollision(input), mesh = prepared.create(), before = mesh.capture();
  const changed = bundle(); changed.geometries[0].verts[0] -= .1;
  assert.notEqual((await prepareMeshCollision(changed)).digest, prepared.digest);
  const reordered = bundle(); reordered.nodes[0].position = { z: 0, y: -.5, x: 0 };
  assert.equal((await prepareMeshCollision(reordered)).digest, prepared.digest, "object key order is not world identity");
  for (const mutate of [s => { s.world = "other"; }, s => { s.digest = "other"; }, s => { s.v = 0; },
    s => { s.poses.reverse(); }, s => { s.poses.pop(); }, s => { s.poses[1].scale.x = 0; },
    s => { s.poses[1].position.x = NaN; }, s => { s.poses[1].quaternion = [0,0,0,1]; }]) {
    const saved = structuredClone(before); saved.poses[0].position.y = 10; mutate(saved);
    assert.throws(() => mesh.restore(saved), /collision/);
    assert.deepEqual(mesh.capture(), before);
    assert.equal(mesh.supportAt(0, 0, .1), 0, "rejected last pose cannot move first support");
  }
  for (const mutate of [b => { b.v = 2; }, b => { b.nodes[1].id = "floor"; }, b => { b.nodes[1].parent = "floor"; },
    b => { b.nodes[1].gorillaSteps = []; }, b => { b.nodes[1].position.w = 1; },
    b => { b.geometries[0].collisionGeometry = {}; }, b => { b.geometries[0].faces[0].i[0] = 8; },
    b => { b.geometries[0].verts[0] = Infinity; }, b => { delete b.geometries[0].verts[0]; b.geometries[0].verts.extra = 0; },
    b => { b.nodes = Array.from({ length: COLLISION.nodes + 1 }, (_, i) => node(`n${i}`, 0, 0, 0, 1, 1, 1)); }]) {
    const b = bundle(); mutate(b); await assert.rejects(prepareMeshCollision(b), /collision/);
  }
  const replicated = bundle();
  replicated.geometries[0].faces = Array.from({ length: 400 }, () => geometry().faces).flat();
  replicated.nodes = Array.from({ length: 8 }, (_, i) => node(`n${i}`, i, 0, 0, 1, 1, 1));
  await assert.rejects(prepareMeshCollision(replicated), /collision/, "placed triangle cost is bounded even when geometry is shared");
  assert.throws(() => mesh.clearAt(0, 0, 0, -1, 1), /collision/);
  assert.throws(() => mesh.supportAt(0, 0, Infinity), /collision/);
});

test("support-only faces retain support without becoming walls or ceilings", async () => {
  const b = bundle(); b.nodes = [node("platform", 0, 1, 0, 2, 1, 2)];
  b.geometries[0].faces = [b.geometries[0].faces[5]];
  b.geometries[0].faces[0].supportOnly = true;
  const mesh = (await prepareMeshCollision(b)).create();
  assert.equal(mesh.supportAt(0, 0, 2), 1.5);
  assert.equal(mesh.ceilingAt(0, 0, 0), Infinity);
  assert.equal(mesh.segmentClear(0, 0, 0, 0, 3, 0, .2, 1), true);
});

test("shared NPC clearance preserves original gate order and decisions", () => {
  const original = JSON.parse(readFileSync(new URL("fixtures/npc-clearance-original.json", import.meta.url)));
  assert.equal(createHash("sha256").update(original.source).digest("hex"), original.sha256);
  const shared = readFileSync(new URL("../../src/js/npc-clearance.js", import.meta.url), "utf8");
  const body = shared.slice(shared.indexOf("    const npcWalkable = ("), shared.indexOf("    return npcWalkable;"));
  assert.equal(body.split("\n").slice(0, -1).map(line => line.slice(2)).join("\n") + "\n", original.source);
  for (let scenario = 0; scenario < 80; scenario++) {
    const traces = [[], []], outputs = [];
    for (let side = 0; side < 2; side++) {
      const trace = traces[side]; let pileCalls = 0;
      const wrap = (name, fn) => (...args) => { trace.push([name, ...args]); return fn(...args); };
      const deps = { PLAYER_RADIUS: .2, lerp: globalThis.BL.math.lerp,
        walkable: wrap("walkable", () => scenario % 11 !== 0),
        playerSupportAt: wrap("support", () => scenario % 3 === 0 ? -.5 : scenario % 3 === 1 ? .5 : 0),
        npcRampRoofAt: wrap("roof", x => scenario % 13 === 0 && x > 0),
        npcClosedCaveClear: wrap("cave", () => scenario % 17 !== 0),
        npcWorkZoneClear: wrap("work", () => scenario % 19 !== 0),
        npcFireClear: wrap("fire", () => scenario % 23 !== 0),
        npcPileAt: wrap("pile", () => ++pileCalls === scenario % 7),
        island: { clearAt: wrap("clear", () => scenario % 29 !== 0),
          voxelSegmentClearAt: wrap("sweep", () => scenario % 31 !== 0) } };
      const walk = side ? createNpcClearance(deps) : runInNewContext(original.source + "\nnpcWalkable;", deps);
      const x = scenario % 4 * .1, z = scenario % 5 * .1;
      outputs.push(walk(x, z, x + (scenario % 3 === 0 ? 3.5 : .5), z + .5, scenario % 5 * .1, .5 + scenario % 5 * .3, "actor"));
    }
    assert.equal(outputs[1], outputs[0], `scenario ${scenario}`);
    assert.deepEqual(traces[1], traces[0], `scenario ${scenario}`);
  }
});

test("NPC mesh adapter permits a supported tread, rejects a low ceiling and bounds pile sampling", async () => {
  const b = bundle(); b.nodes[1] = node("step", 1, .25, 0, 1, .5, 2);
  const prepared = await prepareMeshCollision(b), mesh = prepared.create(), deps = hooks(mesh), walk = createNpcClearance(deps);
  assert.equal(walk(0, 0, 1, 0, 0, 1.8, {}), true, "ascend lifts first instead of sweeping diagonally into riser");
  // A long diagonal begins lowering while the cylinder still overlaps the
  // tread. The original policy refuses it; an edge departure clears the corner.
  assert.equal(walk(1, 0, 0, 0, .5, 1.8, {}), false, "descent cannot cut through the tread corner");
  assert.equal(walk(.7, 0, 0, 0, .5, 1.8, {}), true, "edge descent sweeps to actual lower support");
  const ceiling = bundle(); ceiling.nodes[1] = node("ceiling", 1, 1.7, 0, 1, .1, 2);
  assert.equal(createNpcClearance(hooks((await prepareMeshCollision(ceiling)).create()))(0, 0, 1, 0, 0, 1.8, {}), false);
  let samples = 0;
  deps.npcPileAt = () => { samples++; return false; };
  createNpcClearance(deps)(-4, 0, 0, 0, 0, 1.8, {});
  assert.equal(samples, 28, "one origin plus at most 27 samples for a four-metre step");
  for (const args of [[0,0,4.01,0,0,1.8], [0,0,1,0,NaN,1.8], [0,0,1,0,0,.3]]) {
    assert.throws(() => walk(...args, {}), /step/);
  }
  assert.throws(() => createNpcClearance({ ...deps, npcFireClear: undefined }), /adapters/);
  assert.equal(createNpcClearance({ ...deps, playerSupportAt: () => -Infinity })(0,0,1,0,0,1.8,{}), false, "an unsupported destination refuses movement without aborting a host tick");
  assert.throws(() => createNpcClearance({ ...deps, playerSupportAt: () => NaN })(0,0,1,0,0,1.8,{}), /support/);
  assert.throws(() => createNpcClearance({ ...deps, npcFireClear: async () => true })(0,0,1,0,0,1.8,{}), /result/);
});

test("host retries and takeover rebuild authoritative collision poses without retaining aborted caches", async () => {
  const prepared = await prepareMeshCollision(bundle());
  function harness() {
    let value, fail = false, now = 100000;
    const storage = { async transaction(fn) {
      let next = structuredClone(value);
      const result = await fn({ get: async () => structuredClone(next), put: async (key, v) => { next = structuredClone(v); } });
      if (fail) { fail = false; throw new Error("injected collision write failure"); }
      value = next; return result;
    } };
    const simulation = { checkpointBytes: 30 * 1024, version: "collision-fixture-1",
      initial: () => ({ meshes: prepared.create().capture(), x: -1, steps: 0, blocked: 0 }),
      validate: s => Number.isFinite(s.x) && Number.isInteger(s.steps) && Number.isInteger(s.blocked) && prepared.validate(s.meshes),
      step(s) {
        // Authored movement fixture, not the full crew walker. A runtime belongs
        // to this transaction's state; failed writes never publish its cache.
        const mesh = prepared.create(s.meshes);
        if (++s.steps === 20) { const moved = mesh.capture(); moved.poses[1].position.z = 3; mesh.restore(moved); }
        if (s.x < 4) {
          if (createNpcClearance(hooks(mesh))(s.x, 0, s.x + .125, 0, 0, 1.8, "fixture")) s.x += .125;
          else s.blocked++;
        }
        s.meshes = mesh.capture();
      },
      project: s => ({ npcs: [{ id: "fixture", kind: "ooga", x: s.x, y: 0, z: 0, yaw: 0,
        activity: "working", phase: "outbound", route: "authored", progress: 0, seed: 1 }], hub: { pile: 0 } }),
      npcFor: () => null, handoff: () => false };
    return { make: () => new VirtualHost({ storage, simulation, sessionAdapter: { stepPassive: m => m }, clock: () => now }),
      at: t => { now = t; }, read: () => structuredClone(value), fail: () => { fail = true; } };
  }
  const a = harness(), b = harness(), live = a.make(), old = b.make();
  const ta = await live.begin("a", 60000), tb = await old.begin("b", 60000);
  for (let n = 101000; n <= 104000; n += 1000) { a.at(n); b.at(n); await live.tick(ta); await old.tick(tb); }
  b.at(105000); const before = b.read(); b.fail();
  await assert.rejects(old.tick(tb), /injected collision/);
  assert.deepEqual(b.read(), before, "wall relocation and actor movement both roll back");
  for (let n = 105000; n <= 114000; n += 1000) { a.at(n); await live.tick(ta); }
  b.at(114000); const recovered = b.make(), ticket = await recovered.claim("new");
  for (let i = 0; i < 5; i++) assert.ok((await recovered.tick(ticket)).steps <= HOST.maxSteps);
  assert.deepEqual(b.read().simulation, a.read().simulation);
  assert.ok(b.read().simulation.blocked > 0);
  assert.equal(b.read().simulation.meshes.poses[1].position.z, 3);
  await assert.rejects(old.tick(tb), /owner|lease|fenc/);
});

test("collision fixture exposes bounded catalog, checkpoint and actual query work", async t => {
  const b = bundle(); b.nodes = Array.from({ length: COLLISION.nodes }, (_, i) => node(`n${i}`, (i % 16) * 2, 0, Math.floor(i / 16) * 2, 1, 1, 1));
  const prepared = await prepareMeshCollision(b), mesh = prepared.create();
  for (let i = 0; i < 128; i++) mesh.segmentClear(-1, 0, i % 8 * 2, 33, 0, i % 8 * 2, .2, 1);
  const checkpointBytes = Buffer.byteLength(JSON.stringify(mesh.capture())), stats = mesh.stats();
  assert.ok(checkpointBytes <= COLLISION.checkpointBytes);
  assert.equal(stats.nodes, COLLISION.nodes); assert.equal(stats.queries, 128);
  assert.ok(stats.candidates <= 128 * COLLISION.nodes);
  t.diagnostic(JSON.stringify({ ...prepared.envelope, checkpointBytes, stats,
    scope: "authored mesh fixture; no production world, DO runtime, CPU billing or memory measurement" }));
});
