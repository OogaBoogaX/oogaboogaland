// Focused, browser-free integration coverage for island-wide DSB wading.
// Runs the actual coast, sampled geography and ocean modules with minimal
// rendering-model stubs; no alternate terrain or movement implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const triangle = () => ({
  verts: [0, 0, 0, 1, 0, 0, 0, 0, 1],
  faces: [{i: [0, 1, 2], color: [255, 255, 255]}]
});
const BL = {
  math: {hexToRgb: () => [255, 255, 255]},
  scene: {createNode: (options = {}) => ({...options}), addChild() {}},
  models: {
    track: () => ({use() {}}),
    box: triangle, bevelBox: triangle, lathe: triangle,
    moved: triangle, shaded: triangle, merge: triangle
  }
};
const sandbox = {window: {BL}};
for (const name of ['dsb-coast.js', 'dsb-geography.js', 'dsb-water.js']) {
  const code = readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
  runInNewContext(code, sandbox, {filename: name, timeout: 30000});
}
const C = BL.dsbCoast;
const land = BL.dsbGeography.build();
const actor = {bodyHeight: 1.370, bodyRadius: .697};
const BLOCKED = new Set([0, 1, 2, 3, 4, 5, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33]);

function sector(index, t = .5) {
  const a = land.coast[index], b = land.coast[(index + 1) % land.coast.length];
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  const near = {};
  C.nearest(land.coast, x, z, near);
  return {
    x, z, near,
    point(d) {return [x + near.nx * d, z + near.nz * d];}
  };
}
const close = (a, b, epsilon = .03) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

test('the 34 authored sectors cover the entire coast; the only excluded stretches are harbor and rear Olympus', () => {
  assert.equal(land.coast.length, 34);
  let allowed = 0, blocked = 0;
  for (let i = 0; i < land.coast.length; i++) {
    const {x, z} = sector(i);
    if (BLOCKED.has(i)) {
      blocked++;
      assert.equal(C.wade(land.coast, x, z), 0, `sector ${i} must be excluded`);
    } else {
      allowed++;
      close(C.wade(land.coast, x, z), 1, 1e-8);
    }
  }
  assert.equal(allowed, 18);
  assert.equal(blocked, 16);
});

test('eligible coasts have a gradual real seabed and allow real body-wide walking into water', () => {
  for (let i = 0; i < land.coast.length; i++) {
    if (BLOCKED.has(i)) continue;
    const s = sector(i), at3 = s.point(3), at7 = s.point(7), at9 = s.point(9);
    assert.ok(land.heightAt(...at3) > C.LEVEL, `dry approach missing at sector ${i}`);
    assert.ok(land.heightAt(...at7) < C.LEVEL, `underwater shelf missing at sector ${i}`);
    assert.ok(land.heightAt(...at9) < land.heightAt(...at7), `shelf not deepening at sector ${i}`);
    // Start on DRY ground and walk the entire approach, not just a spawn
    // already standing in water. The same steps must also permit retreat.
    let a = s.point(-3), y = land.groundAt(...a);
    for (let k = 1; k <= 55; k++) {
      const d = -3 + k * .2, b = s.point(d);
      assert.equal(land.walkable(a[0], a[1], b[0], b[1], y, actor.bodyHeight, actor), true,
        `actor blocked from dry land in sector ${i} at ${d.toFixed(1)}m`);
      a = b; y = land.groundAt(...b);
    }
    const deep = s.point(23);
    assert.equal(land.walkable(a[0], a[1], deep[0], deep[1], y, actor.bodyHeight, actor), false,
      `actor crossed deep-water safety gate in sector ${i}`);
    for (let k = 54; k >= 0; k--) {
      const d = -3 + k * .2, b = s.point(d);
      assert.equal(land.walkable(a[0], a[1], b[0], b[1], y, actor.bodyHeight, actor), true,
        `actor could not retreat to shore in sector ${i} at ${d.toFixed(1)}m`);
      a = b; y = land.groundAt(...b);
    }
  }
});

test('dense quarter-sector paths work throughout the shoreline away from excluded boundaries', () => {
  for (let i = 7; i <= 20; i++) {
    for (const t of [.2, .5, .8]) {
      const s = sector(i, t);
      let a = s.point(-3), y = land.groundAt(...a);
      for (let k = 1; k <= 55; k++) {
        const d = -3 + k * .2, b = s.point(d);
        assert.equal(land.walkable(a[0], a[1], b[0], b[1], y, actor.bodyHeight, actor), true,
          `sector ${i} (${t}) blocked at ${d.toFixed(1)}m`);
        a = b; y = land.groundAt(...b);
      }
    }
  }
});

test('harbor and rear Olympus have no offshore shelf and prohibit walking into deep water', () => {
  for (const i of BLOCKED) {
    const s = sector(i), offshore = s.point(7);
    close(land.heightAt(...offshore), -5);
    assert.equal(land.walkable(...s.point(3), ...offshore, land.heightAt(...s.point(3)),
      actor.bodyHeight, actor), false, `deep-water entry at excluded sector ${i}`);
  }
  for (const [x, z] of [[-43, 49], [-34, 49], [-39, 41.5]]) {
    close(land.groundAt(x, z), 1.35, 1e-8);
  }
});

test('shoreline transitions are tapered without removing the original Chora beach', () => {
  for (const [i, t] of [[6, .01], [21, .99], [29, .01], [30, .99]]) {
    const s = sector(i, t);
    assert.ok(C.wade(land.coast, s.x, s.z) < .05, `hard edge at sector ${i}`);
  }
  assert.ok(C.beach(20, 80) > .99);
  close(C.maxDepth(actor), actor.bodyHeight * .98, 1e-8);
  assert.ok(C.speed(1) < C.speed(.5) && C.speed(.5) < C.speed(0));
});

test('protected original island terrain is byte-for-byte equal at 8,957 authored land samples', () => {
  // FNV-1a fixture from fork rock at c954b946, before any wading expansion.
  const inside = (x, z) => {
    let hit = false;
    for (let i = 0, j = land.coast.length - 1; i < land.coast.length; j = i++) {
      const a = land.coast[i], b = land.coast[j];
      if ((a[1] > z) !== (b[1] > z) &&
        x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  let count = 0, hash = 2166136261;
  for (let z = -99; z <= 99; z += 1.5) for (let x = -99; x <= 99; x += 1.5) {
    if (!inside(x, z)) continue;
    count++;
    const value = `${x},${z}:${land.heightAt(x, z).toFixed(4)}|`;
    for (let i = 0; i < value.length; i++)
      hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  assert.equal(count, 8957);
  assert.equal(hash.toString(16).padStart(8, '0'), 'bc6a1a4f');
});

test('ocean optics extend to rocky shallows without introducing foam in excluded areas', () => {
  const water = BL.dsbWater.create(land), B = 256, SIZE = 650;
  const texel = (x, z) => {
    const ix = Math.round((x / SIZE + .5) * B - .5);
    const iz = Math.round((z / SIZE + .5) * B - .5);
    return Array.from(water.depths.slice((iz * B + ix) * 4, (iz * B + ix) * 4 + 4));
  };
  assert.equal(texel(20, 81)[1], 255, 'original Chora treatment is retained');
  assert.ok(texel(72, 25)[1] > 0, 'newly accessible east coast gets soft shoaling');
  assert.equal(texel(-39, 50)[1], 0, 'harbor remains excluded');
  assert.equal(texel(-54, -93)[1], 0, 'rear Olympus remains excluded');
  assert.ok(water.geometry.faces.length > 4000 && water.geometry.faces.length < 30000,
    'Canvas shoreline subdivision exceeded the intended bounded geometry budget');
  assert.equal(water.depths.length, B * B * 4);
});
