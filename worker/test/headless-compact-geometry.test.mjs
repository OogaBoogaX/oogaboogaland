// The browser's lossless compact CPU meshes, headless: the actual shared module
// through ooga-crew.js, its unchanged browser opt-out, and exact Float64 packing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import "../src/ooga-crew.js";

const B = globalThis.BL;
const C = B.compactGeometry;
const source = readFileSync(new URL("../../src/js/compact-geometry.js", import.meta.url), "utf8");

test("headless import installs compact geometry before models, on by default", () => {
  assert.equal(typeof globalThis.window, "undefined", "no browser window headless");
  assert.equal(C?.enabled, true);
  // A modelled Ooga keeps an authored voxel head; the plain stock body's modelled parts are not voxel bakes.
  const ooga = B.models.caveman({ name: "compact-fixture", skin: "#b08060", hair: "#38281c", fur: "#846040",
    height: 1.4, belly: 1, rand: B.math.mulberry32(3),
    dress: { skull(k, voxels) { voxels.fill(0, 6, 0, 7, 0, 5, k.skinJ); return true; } } });
  assert.equal(ooga.modelled, true);
  const packed = new Set();
  const visit = (node) => {
    if (node.geometry && C.storageOf(node.geometry)) packed.add(node.geometry);
    for (const child of node.children) visit(child);
  };
  visit(ooga.root);
  assert.ok(packed.size > 0, "caveman bakes are packed headless");
  for (const geometry of packed) {
    assert.ok(geometry.verts instanceof Float64Array, "lossless 64-bit positions");
    assert.equal(geometry.verts, geometry.compactGeometry.positions);
  }
});

test("in a browser context the URL opt-out still disables it, and it stays on otherwise", () => {
  for (const [search, enabled] of [["?compactGeometry=0", false], ["?compactGeometry=1", true], ["", true], ["?x=1&compactGeometry=0", false]]) {
    // Object as run.mjs passes it, so this realm's plain face records count as plain.
    const context = { window: { location: { search } }, URLSearchParams, Object };
    runInNewContext(source, context);
    assert.equal(context.window.BL.compactGeometry.enabled, enabled, search || "no query");
    assert.equal(context.BL, undefined, "a browser installs on window, not the global");
    const geometry = { verts: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces: [{ i: [0, 1, 2], color: [1, 2, 3] }] };
    const verts = geometry.verts, faces = geometry.faces;
    context.window.BL.compactGeometry.pack(geometry, { immutable: true, renderOnly: true, precision: 64 });
    assert.equal(geometry.verts === verts && geometry.faces === faces, !enabled, `${search}: disabled leaves the classic mesh`);
  }
  // A headless VM context (no window) installs on its own global, enabled.
  const headless = { URLSearchParams };
  runInNewContext(source, headless);
  assert.equal(headless.BL.compactGeometry.enabled, true);
});

test("packing keeps exact Float64 positions and every face field, and the cursor reads in place", () => {
  const verts = [0.1, 1 / 3, -0, 1e-300, Math.PI, -2.5e10, 7, 8, 9, 0.30000000000000004, 11, 12];
  const faces = [
    { i: [0, 1, 2], color: [10, 20, 30], road: true, label: "a" },
    { i: [1, 2, 3, 0], color: [1.5, 2, 3, -1], label: "a", offset: -0 },
    { i: [3, 2, 1], color: [255, 0, 0], visibility: false },
  ];
  const expected = structuredClone(faces);
  const geometry = { verts: verts.slice(), faces: faces.map((f) => ({ ...f, i: f.i.slice(), color: f.color.slice() })) };
  C.pack(geometry, { immutable: true, renderOnly: true, precision: 64 });
  assert.ok(C.storageOf(geometry));
  assert.ok(geometry.verts instanceof Float64Array);
  assert.equal(geometry.verts.length, verts.length);
  for (let k = 0; k < verts.length; k++) assert.ok(Object.is(geometry.verts[k], verts[k]), `position ${k} exact`);
  for (let n = 0; n < faces.length; n++) {
    const copy = C.copyFace(geometry, n);
    assert.deepEqual(copy, expected[n], `face ${n} fields`);
    assert.deepEqual({ ...geometry.faces[n], i: [...geometry.faces[n].i], color: [...geometry.faces[n].color] }, expected[n]);
  }
  assert.ok(Object.is(C.copyFace(geometry, 1).offset, -0), "negative zero kept");
  assert.equal(C.pack(geometry, { immutable: true, renderOnly: true, precision: 64 }), geometry, "packing again changes nothing");
  assert.throws(() => { geometry.faces[0] = {}; }, TypeError, "immutable faces");
  // One cursor per reader: each read overwrites it in place, with no copy.
  const cursor = C.createCursor(geometry);
  const first = C.readFace(geometry, 0, cursor);
  assert.equal(first, cursor);
  assert.deepEqual([[...first.i], [...first.color], first.road, first.label, first.visibility], [[0, 1, 2], [10, 20, 30], true, "a", undefined]);
  const second = C.readFace(geometry, 1, cursor);
  assert.equal(second, first, "the same cursor, overwritten");
  assert.deepEqual([[...second.i], [...second.color], second.road, second.label], [[1, 2, 3, 0], [1.5, 2, 3, -1], undefined, "a"]);
  assert.equal(second.i.length, 4);
  assert.equal(C.readFace(geometry, 3, cursor), undefined, "out of range");
  // An unpacked mesh reads its own faces unchanged.
  const plain = { verts: [0, 0, 0, 1, 0, 0, 0, 1, 0], faces: [{ i: [0, 1, 2], color: [1, 2, 3] }] };
  assert.equal(C.readFace(plain, 0, C.createCursor(plain)), plain.faces[0]);
  assert.equal(C.storageOf(plain), null);
});
