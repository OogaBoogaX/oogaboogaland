import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHubSolids, hubScene, hubModels, hubPoolModels, hubDressing, withHubFoliageDetails } from '../src/ooga-crew.js';

test('host shoulder scratch grows only for queried surfaces and matches eager collision results', () => {
  const geometry = { verts: [], faces: [] };
  // One connected wall exercises growth during collection. Remote faces enlarge
  // the same mesh but must not reserve query scratch until actually encountered.
  for (let i = 0; i < 1000; i++) {
    const x = i < 200 ? -4 + i * .04 : 100 + i, at = geometry.verts.length / 3;
    geometry.verts.push(x, 0, 1, x + .04, 0, 1, x + .04, 2, 1, x, 2, 1);
    geometry.faces.push({ i: [at, at + 1, at + 2, at + 3], color: [0, 0, 0] });
  }
  const node = hubScene.createNode({ geometry }), eager = createHubSolids(), lazy = createHubSolids({ lazyShoulders: true });
  hubScene.updateWorld(node);
  for (const registry of [eager, lazy]) { registry.add(node); registry.sync(); }
  assert.equal(lazy.stats.shoulderBytes, 0);
  assert.equal(eager.stats.shoulderBytes, eager.stats.triangles * 141);
  const sample = (registry, x, reach, bottom) => {
    const out = {};
    const found = registry.shoulderAt(x, .5, 0, 0, 1, .15, 1, reach, out, bottom);
    return { ...out, node: out.node === node, found };
  };
  for (const [x, reach, bottom] of [[0, .5, .5], [0, 2, .5], [0, 5, 0], [3, 2, .5], [1000, 2, .5], [0, 2, .5]])
    assert.deepEqual(sample(lazy, x, reach, bottom), sample(eager, x, reach, bottom));
  assert.ok(lazy.stats.shoulderBytes > 64 * 141, 'connected query must exercise scratch growth');
  assert.ok(lazy.stats.shoulderBytes < eager.stats.shoulderBytes, 'unqueried remote mesh does not allocate scratch');
  for (const registry of [eager, lazy]) registry.dispose();
  assert.throws(() => createHubSolids({ lazyShoulders: 'yes' }), /invalid shoulder scratch/);
});


// A browser build packs its final render mesh compactly (exact Float64 positions,
// a read-only face store); the host's plain build skips that with its render
// alternatives. Compare what each holds, not how it is stored: every vertex as
// stored, every face read back through the compact API, and every other field.
// Only the storage itself and the render alternatives are left out.
const compact = globalThis.BL.compactGeometry;
const STORAGE = new Set(['verts', 'faces', 'compactGeometry', 'foliageLods']);
const canonical = geometry => {
  const fields = {}, faces = [];
  for (const key of Object.keys(geometry)) if (!STORAGE.has(key)) fields[key] = geometry[key];
  const packed = !!compact.storageOf(geometry);
  for (let n = 0; n < geometry.faces.length; n++) faces.push(packed ? compact.copyFace(geometry, n) : geometry.faces[n]);
  return { fields, verts: Array.from(geometry.verts), faces };
};
// The next representable double: the smallest change to a coordinate.
const nextDouble = value => { const f = new Float64Array([value]), bits = new BigInt64Array(f.buffer); bits[0] += 1n; return f[0]; };

test('host foliage omits only render alternatives and keeps browser caches independent', () => {
  const builders = [() => hubModels.tree(0), () => hubModels.bush(1), () => hubDressing.palm(0),
    hubPoolModels.CANOPY[0], hubPoolModels.fern, hubPoolModels.shrub, hubPoolModels.UNDERGROWTH[1]];
  let control = null;
  for (const [index, build] of builders.entries()) {
    // Cover both cache orders: a renderer may already have built a model in
    // the same process, or it may arrive after private host construction.
    let rendered, hosted;
    if (index % 2) rendered = build();
    hosted = withHubFoliageDetails(false, build);
    rendered ||= build();
    assert.ok(rendered.foliageLods, 'ordinary builder retains render alternatives');
    assert.equal(hosted.foliageLods, undefined);
    assert.notStrictEqual(hosted, rendered);
    assert.ok(compact.enabled && compact.storageOf(rendered), 'the browser build is packed, as live');
    const expected = canonical(rendered);
    assert.ok(expected.verts.length > 0 && expected.faces.length > 0);
    assert.deepEqual(canonical(hosted), expected, 'all base geometry and collision/placement metadata stay exact');
    assert.deepEqual(hubScene.boundsOf(hosted), hubScene.boundsOf(rendered));
    assert.strictEqual(build(), rendered);
    assert.strictEqual(withHubFoliageDetails(false, build), hosted);
    if (!control && expected.fields.collisionGeometry && expected.faces.some(f => Object.keys(f).some(k => k !== 'i' && k !== 'color')))
      control = { hosted, expected };
  }
  // Negative control: the comparison catches the smallest coordinate change, a
  // changed face tag, a changed face colour and changed collision metadata.
  assert.ok(control, 'a builder with collision metadata and face tags exercises the control');
  const tagged = control.expected.faces.findIndex(f => Object.keys(f).some(k => k !== 'i' && k !== 'color'));
  const tag = Object.keys(control.expected.faces[tagged]).find(k => k !== 'i' && k !== 'color');
  for (const [name, change] of [
    ['coordinate', c => { c.verts[0] = nextDouble(c.verts[0]); }],
    ['face tag', c => { const v = c.faces[tagged][tag]; c.faces[tagged][tag] = typeof v === 'number' ? nextDouble(v) : typeof v === 'boolean' ? !v : `${v}-changed`; }],
    ['face colour', c => { c.faces[0].color[0] = c.faces[0].color[0] === 0 ? 1 : c.faces[0].color[0] - 1; }],
    ['collision metadata', c => { const g = c.fields.collisionGeometry; g.verts[0] = nextDouble(g.verts[0]); }],
  ]) {
    const changed = structuredClone(control.expected);
    change(changed);
    assert.throws(() => assert.deepEqual(canonical(control.hosted), changed), assert.AssertionError, `${name} change detected`);
  }
});

test('foliage scope skips deferred construction and restores defaults after nesting and exceptions', () => {
  const models = globalThis.BL.models;
  let alternatives = 0;
  const build = models.foliageCached(() => models.foliageLods({ verts: [], faces: [] }, () => {
    alternatives++; return { verts: [], faces: [] };
  }, false));
  const plain = withHubFoliageDetails(false, () => {
    const value = build();
    assert.equal(alternatives, 0);
    assert.ok(withHubFoliageDetails(true, build).foliageLods);
    assert.strictEqual(build(), value, 'nested scope restores host policy');
    return value;
  });
  assert.equal(alternatives, 1);
  assert.notStrictEqual(build(), plain);
  assert.throws(() => withHubFoliageDetails(false, () => { throw Error('cancel construction'); }), /cancel construction/);
  assert.ok(build().foliageLods, 'failed build cannot change the next browser build');
  build.clear();
  assert.ok(build().foliageLods);
  assert.equal(alternatives, 2, 'cache release still rebuilds the selected representation');
  assert.throws(() => withHubFoliageDetails('false', build), /invalid foliage build scope/);
});
