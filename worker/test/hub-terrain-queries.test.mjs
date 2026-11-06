import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hubTerrainQueries } from '../src/hub-terrain-queries.js';
import { buildHubTerrainSnapshot, restorePrivateHubTerrain, compilePrivateHubTerrain } from '../src/ooga-crew.js';

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

  // The validated factory owns its template. Mutating the caller's source or
  // any returned world's query buffers, mouths or paths cannot affect a later
  // world. This is required before skipping repeat static-template validation.
  const factory = compilePrivateHubTerrain(reduced), first = factory();
  assert.deepEqual(first.cutawaySource.data, reduced.gridData, 'compiled grid retains every material byte');
  const index = reduced.gridData.findIndex(value => value !== 0), cell = reduced.gridData[index];
  assert.ok(index >= 0);
  const mouthX = reduced.mouths[0].x;
  first.cutawaySource.data[index] = 0;
  first.mouths[0].x += 10;
  reduced.gridData[index] = 0;
  const second = factory();
  reduced.gridData[index] = cell;
  assert.equal(second.cutawaySource.data[index], cell);
  assert.equal(second.mouths[0].x, mouthX);
  const radius = second.path.debug.ringCenterRadius;
  first.path.setRadius(radius + 2);
  assert.equal(second.path.debug.ringCenterRadius, radius);
  assert.notEqual(first.cutawaySource.data.buffer, second.cutawaySource.data.buffer);
  assert.throws(() => compilePrivateHubTerrain({ ...reduced, gridData: new Uint8Array(1) }), /Invalid terrain gridData/);

  // Exercise both an efficiently compressible nonbinary grid and the noisy
  // fallback. Materials must never be reduced to a boolean occupancy mask.
  const grid = new Uint8Array(reduced.gridData.length);
  grid.fill(255, 0, 4097); grid.fill(128, 4097, 8193); grid[grid.length - 1] = 17;
  const materialFactory = compilePrivateHubTerrain({ ...reduced, gridData: grid });
  assert.deepEqual(materialFactory().cutawaySource.data, grid);
  for (let i = 0; i < grid.length; i++) grid[i] = i & 255;
  const noisyFactory = compilePrivateHubTerrain({ ...reduced, gridData: grid });
  const noisy = noisyFactory();
  assert.deepEqual(noisy.cutawaySource.data, grid);
  noisy.cutawaySource.data[1] = 0;
  assert.equal(noisyFactory().cutawaySource.data[1], 1);

  grid.fill(0);
  const mask = new Uint8Array(grid.buffer, 0, reduced.birdseyeWindowMask.length);
  const aliasFactory = compilePrivateHubTerrain({ ...reduced, gridData: grid, birdseyeWindowMask: mask });
  const aliased = aliasFactory().cutawaySource;
  assert.equal(aliased.data.buffer, aliased.birdseyeWindows.mask.buffer, 'unusual shared-buffer snapshots keep native clone aliases');
  aliased.data[0] = 9;
  assert.equal(aliased.birdseyeWindows.mask[0], 9);
  assert.equal(aliasFactory().cutawaySource.data[0], 0, 'aliases never cross private worlds');
});
