import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hubTerrainQueries } from '../src/hub-terrain-queries.js';
import { buildHubTerrainSnapshot, restorePrivateHubTerrain } from '../src/ooga-crew.js';

test('host terrain keeps exact ramp triangles and shared support/clearance while dropping render-only terrain faces', () => {
  const generator = buildHubTerrainSnapshot();
  let next; do { next = generator.next(); } while (!next.done);
  const original = next.value, sourceFaces = original.geometry.faces, reduced = hubTerrainQueries(original);
  assert.ok(reduced.geometry.faces.length < sourceFaces.length);
  assert.ok(reduced.geometry.verts.byteLength < original.geometry.verts.byteLength);
  assert.equal(original.geometry.faces, sourceFaces, 'conversion cannot mutate browser geometry');
  assert.equal(reduced.rampFaceOffset, 0);
  for (let n = 0; n < reduced.geometry.faces.length; n++) {
    const a = sourceFaces[original.rampFaceOffset + n], b = reduced.geometry.faces[n];
    assert.deepEqual({ ...a, i: null }, { ...b, i: null });
    assert.equal(b.i.length, a.i.length);
    for (let k = 0; k < a.i.length; k++) for (let axis = 0; axis < 3; axis++) {
      assert.ok(Object.is(original.geometry.verts[a.i[k] * 3 + axis], reduced.geometry.verts[b.i[k] * 3 + axis]));
    }
  }
  const full = restorePrivateHubTerrain(original), lean = restorePrivateHubTerrain(reduced);
  const compare = (method, args) => assert.deepEqual(lean[method](...args), full[method](...args), `${method}: ${args}`);
  // Authored ramp-centre contacts, straddling the support surface with both a
  // small foot and a wider standing body. Other query inputs are unchanged.
  const stride = Math.max(1, Math.floor(reduced.geometry.faces.length / 64));
  for (let n = 0; n < reduced.geometry.faces.length; n += stride) {
    const f = reduced.geometry.faces[n], v = reduced.geometry.verts;
    const center = [0, 1, 2].map(axis => f.i.reduce((sum, i) => sum + v[i * 3 + axis], 0) / 3);
    const [x, y, z] = center;
    for (const radius of [.02, .6]) {
      compare('supportAt', [x, z, y + .1, .5, -Infinity, radius]);
      compare('clearAt', [x, y - .05, z, radius, 1.8]);
      compare('clearAt', [x, y + .05, z, radius, 1.8]);
      compare('ceilingAt', [x, y - 2, z, radius]);
    }
    compare('rockMaterialAt', [x, y - .02, z]);
    compare('sightClearAt', [x - .4, y + .1, z, x + .4, y + .1, z]);
  }
  for (const key of ['rampCollision', 'basementCollision', 'gridData', 'windowColumns', 'rampSight', 'rockCaves'])
    assert.equal(reduced[key], original[key], `${key} retained without reinterpretation`);
  const invalid = { ...original, rampFaceOffset: sourceFaces.length };
  assert.throws(() => hubTerrainQueries(invalid), /invalid host terrain/);
});
