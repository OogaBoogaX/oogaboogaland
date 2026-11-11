// Coplanar paint seams must disappear identically from plain and packed meshes.
// No Hub boot, browser, storage fixture or frame loop is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const context = { window: { location: { search: '' } }, URLSearchParams, performance, Object };
for (const module of ['math', 'scene', 'compact-geometry', 'object-guides'])
  runInNewContext(readFileSync(new URL(`../../src/js/${module}.js`, import.meta.url), 'utf8'), context);
const B = context.window.BL;

function painted(panels, order, packed) {
  const geometry = { verts: [], faces: [] };
  for (const index of order) {
    const [x0, y0, x1, y1] = panels[index], at = geometry.verts.length / 3;
    geometry.verts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
    geometry.faces.push({ i: [at, at + 1, at + 2, at + 3], color: [index * 50, 100, 150] });
  }
  if (packed) B.compactGeometry.pack(geometry, { immutable: true, renderOnly: true, precision: 64 });
  return geometry;
}

function contours(geometry) {
  const root = B.scene.createNode(), owner = B.scene.createNode({ geometry }), actor = { root: B.scene.createNode() };
  B.scene.addChild(root, owner, actor.root);
  B.scene.updateWorld(root);
  const guides = B.objectGuides.create({ roots: root.children, crew: { list: [], cavemen: new Map() } });
  const result = guides.collect(actor, 0, 0, 0);
  const lines = [];
  for (let index = 0; index < result.count * 6; index += 6) {
    const a = Array.from(result.lines.subarray(index, index + 3));
    const b = Array.from(result.lines.subarray(index + 3, index + 6));
    lines.push([a.join(','), b.join(',')].sort().join('|'));
  }
  guides.dispose();
  return lines.sort();
}

test('packed contour seams use each retained face, independent of final face order', () => {
  // One long edge meets two shorter faces. Their endpoints do not match, so
  // seam removal must examine each adjacent face's actual polygon.
  const small = [[0, 0, 1, 2], [1, 0, 2, 1], [1, 1, 2, 2], [3, 0, 4, 1]];
  // At least 32 coplanar faces also exercises the spatial-bucket seam path.
  const indexed = [];
  for (let index = 0; index < 32; index++) {
    const x0 = index / 8, x1 = (index + 1) / 8;
    if (index & 1) indexed.push([x0, 0, x1, 1], [x0, 1, x1, 2]);
    else indexed.push([x0, 0, x1, 2]);
  }
  indexed.push([5, 0, 6, 1]);
  for (const panels of [small, indexed]) {
    const ids = panels.map((_, index) => index);
    const reference = contours(painted(panels, ids, false));
    assert.equal(reference.length, 8, 'only the two rectangles\' outer boundaries survive');
    for (let shift = 0; shift < 4; shift++) {
      const order = ids.slice(shift).concat(ids.slice(0, shift));
      assert.deepEqual(contours(painted(panels, order, false)), reference, `plain order ${order}`);
      const packed = painted(panels, order, true);
      assert.deepEqual(contours(packed), reference, `packed order ${order}`);
      assert.equal(packed.compactGeometry.legacy.size, 0, 'seam reads do not materialize retained face copies');
    }
  }
});
