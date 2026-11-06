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


test('host foliage omits only render alternatives and keeps browser caches independent', () => {
  const builders = [() => hubModels.tree(0), () => hubModels.bush(1), () => hubDressing.palm(0),
    hubPoolModels.CANOPY[0], hubPoolModels.fern, hubPoolModels.shrub, hubPoolModels.UNDERGROWTH[1]];
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
    const { foliageLods, ...authored } = rendered;
    assert.deepEqual(hosted, authored, 'all base geometry and collision/placement metadata stay exact');
    assert.deepEqual(hubScene.boundsOf(hosted), hubScene.boundsOf(rendered));
    assert.strictEqual(build(), rendered);
    assert.strictEqual(withHubFoliageDetails(false, build), hosted);
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
