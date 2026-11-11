// Candidate acceleration is checked against the previous exhaustive scan,
// retaining the production face certificate in both implementations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../src/js/object-guides.js', import.meta.url), 'utf8');
const functionAt = source.indexOf('    const boundsCameraPropBlocked =');
const start = source.indexOf('        const witness =', functionAt);
const end = source.indexOf('\n      }\n      return false;\n    };', start);
assert.ok(functionAt > 0 && start > functionAt && end > start);
const exhaustive = `        const witness = n < 0 ? cameraCoverFace : e.geometry.triangleCoverFaces[e.hitTriangle / 9];
        for (let scan = -1, end = n < 0 ? 0 : e.geometry.coverFaces.length; scan < end; scan++) {
          const faceIndex = scan < 0 ? witness : scan;
          if (faceIndex < 0 || scan >= 0 && faceIndex === witness) continue;
          if (cameraPropFaceBlocked(e, faceIndex, dx, dy, dz, hx, hy, hz, ex, ey, ez, allProps)) {
            cameraCoverEntry = e; cameraCoverSource = e.source; cameraCoverFace = faceIndex;
            return true;
          }
        }`;

function modules(old) {
  const context = { window: { location: { search: '' } }, URLSearchParams, performance, Object };
  for (const module of ['math', 'scene', 'compact-geometry'])
    runInNewContext(readFileSync(new URL(`../../src/js/${module}.js`, import.meta.url), 'utf8'), context);
  let code = old ? source.slice(0, start) + exhaustive + source.slice(end) : source;
  code = code.replace('    const cameraPropFaceBlocked =', '    let certificateCalls = 0;\n    const cameraPropFaceBlocked =')
    .replace('      const g = e.node.geometry;\n      const cached =', '      certificateCalls++;\n      const g = e.node.geometry;\n      const cached =')
    .replace('return { collect, clear,', 'return { get certificateCalls() { return certificateCalls; }, collect, clear,');
  runInNewContext(code, context);
  return context.window.BL;
}
const fast = modules(false), slow = modules(true);

function fixture(B, { packed = false, cover = false, rotation = 0, scale = 1, clipped = false, near = 0.1, offset = 0, reveal = 0 } = {}) {
  const geometry = { verts: [], faces: [] };
  const quad = (x0, y0, x1, y1, z) => {
    const at = geometry.verts.length / 3;
    geometry.verts.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
    geometry.faces.push({ i: [at, at + 1, at + 2, at + 3], color: [100, 120, 140] });
  };
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) quad(x / 2 - 3, y / 2 - 3, (x + 1) / 2 - 3, (y + 1) / 2 - 3, 0);
  if (cover) quad(-3, -3, 3, 3, -0.5);
  if (clipped) { geometry.clipMinY = -0.4; geometry.clipMaxY = 0.8; }
  if (packed) B.compactGeometry.pack(geometry, { immutable: true, renderOnly: true, precision: 64 });
  const root = B.scene.createNode(), owner = B.scene.createNode({ geometry, position: { x: offset, y: 0, z: 0 }, rotation: { x: 0, y: rotation, z: 0 }, scale: { x: scale, y: 1, z: 1 }, mirror: !!reveal, mirrorReveal: reveal });
  const actor = { root: B.scene.createNode({ position: { x: offset, y: 0, z: -4 } }) };
  B.scene.addChild(root, owner, actor.root); B.scene.updateWorld(root);
  const camera = B.scene.createCamera({ fov: 50, near, far: 100 });
  Object.assign(camera.position, { x: offset + 0.2, y: 0.15, z: 8 });
  Object.assign(camera.target, { x: offset, y: 0, z: -4 });
  const guides = B.objectGuides.create({ roots: root.children, crew: { cavemen: new Map() } });
  guides.collect(actor, offset, 0, -4, camera, 1.6);
  const terrain = () => true;
  terrain.boxClear = () => false; terrain.boxSolid = () => false;
  return {
    query(x, y, z, h, exclude = false) {
      return guides.cameraBoundsState(offset + x - h, y - h, z - h, offset + x + h, y + h, z + h, actor, exclude ? owner : null, terrain, true);
    },
    get calls() { return guides.certificateCalls; },
    dispose: guides.dispose
  };
}

test('BVH prop certificates match the complete face scan across transforms, clips and cached queries', () => {
  let cases = 0, hidden = 0, uncertain = 0;
  for (const packed of [false, true]) for (const options of [
    {}, { cover: true }, { rotation: 0.3 }, { rotation: -0.4, cover: true, clipped: true },
    { scale: 0.6, clipped: true }, { scale: -1, cover: true }, { near: 8.5, cover: true },
    { near: 7.999, cover: true }, { cover: true, reveal: 0.5 },
    { rotation: Math.PI / 2 - 1e-8 }, { rotation: 0.3, cover: true, offset: 1e6 }
  ]) {
    const a = fixture(fast, { ...options, packed }), b = fixture(slow, { ...options, packed });
    for (const z of [-4, -1, 9]) for (const x of [-2, -0.1, 0.2, 1.5]) for (const y of [-0.7, 0.2, 1.2]) for (const h of [0, 0.05, 0.4]) {
      const expected = b.query(x, y, z, h), actual = a.query(x, y, z, h);
      assert.equal(actual, expected, JSON.stringify({ options, packed, x, y, z, h }));
      hidden += actual === 2; uncertain += actual === 0; cases++;
      assert.equal(a.query(x, y, z, h), b.query(x, y, z, h), 'retained certificate is revalidated');
    }
    assert.equal(a.query(0, 0, -4, 0.1, true), 0, 'the target owner is never its own blocker');
    a.dispose(); b.dispose();
  }
  assert.ok(cases >= 1500 && hidden > 0 && uncertain > 0);
});

test('BVH candidates remove unrelated face certificates without dropping the exhaustive result', () => {
  const a = fixture(fast, { packed: true }), b = fixture(slow, { packed: true });
  for (let index = 0; index < 20; index++) {
    const x = (index % 5 - 2) * 0.1, y = (Math.floor(index / 5) - 2) * 0.1;
    assert.equal(a.query(x, y, -4, 0.8), b.query(x, y, -4, 0.8));
  }
  assert.ok(b.calls >= 144 * 20, 'the baseline exercises its exhaustive scan');
  assert.ok(a.calls * 5 < b.calls, `exact face tests: BVH ${a.calls}, exhaustive ${b.calls}`);
  a.dispose(); b.dispose();
});
