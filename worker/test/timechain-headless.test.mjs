import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../../src/js/math.js';
import '../../src/js/scene.js';
import '../../src/js/compact-geometry.js';
import '../../src/js/models.js';
import '../../src/js/lab-wallpaper.js';
import '../../src/js/hub-models.js';
import '../../src/js/terrain.js';
import '../../src/js/timechain-models.js';

test('Timechain headless construction preserves physical keypad without DOM', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  const island = { surfaceAt: (x, z) => Math.hypot(x, z) <= 28 ? 4 : 0 };
  const site = globalThis.BL.timechainModels.build(island, { presentation: false });
  for (const node of [site.shell, site.entrance, site.bridge, site.plug, site.keypad, ...site.doors]) {
    assert.ok(node.geometry.verts.length > 0);
    assert.equal(node.parent, site.node);
  }
  assert.equal(site.doors.length, 2);
  assert.equal(site.keys.length, 12);
  for (const key of site.keys) {
    assert.equal(key.node.parent, site.keypad);
    assert.ok(key.node.geometry.verts.length > 0);
  }
  assert.equal(site.readout.parent, site.keypad);
  assert.equal(site.readout.geometry.verts.length, 12);
  assert.equal(site.readout.geometry.imageSurface, undefined);
  site.choose(3);
  assert.equal(site.readout.room, 3);
  site.lock(2, true);
  site.say('HEADLESS');
  site.tick(1);
  site.setDoors(1);
  assert.notEqual(site.doors[0].rotation.y, 0);
  // Browser construction remains opt-out, not silently disabled by a missing DOM.
  assert.throws(() => globalThis.BL.timechainModels.padRig(), /document is not defined/);
  const host = readFileSync(new URL('../src/hub-world-geometry.js', import.meta.url), 'utf8');
  assert.match(host, /createTimechainSite\(island,\s*\{\s*presentation:\s*false\s*\}\)/);
});
