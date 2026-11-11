import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHubWorldClearance } from '../src/hub-world-clearance.js';

test('recovered outdoor walkers retain live core collision while specialized poses keep their own admission', () => {
  let blocker = '', posed = 0, coreQueries = 0;
  const yes = () => true, no = () => false;
  const geometry = {
    island: { onLand: yes, clearAt(x, y, z, radius) {
      if (radius === .34) coreQueries++;
      return blocker !== 'terrain' && !(blocker === 'core' && radius === .34);
    }, voxelSegmentClearAt: () => blocker !== 'sweep' },
    solids: { segmentClear: () => blocker !== 'prop', isActive: () => blocker === 'masonry' },
    npcLandSegmentClear: () => blocker !== 'lake',
    clankerSupport: { clankerGroundPlaneAt: no, clankerRectangleAt: (entry, out) =>
      Object.assign(out, { centerForward: 0, halfForward: .5, halfSide: .5 }), clankerTerraceAt: no },
    timechain: { place: { ry: 0 } }, bifrost: {}, mempool: null,
    lab: { inside: no }, climbMasonry: [], fireHazards: [],
    cavePhysics: { crossesSealedCave: () => blocker === 'sealed', matrixGateSegmentClear: () => blocker !== 'gate' },
  };
  const clearance = createHubWorldClearance({ geometry, getClankers: () => null,
    navigation: { npcFireClear: yes, npcRampRoofAt: no } });
  const entry = { nonInteractive: true, controlled: false, remoteControlled: false,
    root: { position: { x: 0, y: 0, z: 0 }, scale: { x: 1 } }, heading: 0, radius: .3,
    climb: { active: false }, jump: { active: false }, drive: { airborne: false },
    fire: { rolling: false }, rage: { active: false }, motion: { supportOffset: 0 },
    gorilla: { hips: { position: { y: .5 } }, climbPoseClear() { posed++; return false; } } };
  // Regression: a wider idle visual pose can contact a prop beside a legal
  // walking core. It must not replace the outdoor locomotion contract.
  assert.equal(clearance.npcPlacement(entry), true);
  assert.equal(posed, 0);
  assert.ok(coreQueries > 0, 'stationary recovery must query the forward trunk core');
  for (blocker of ['terrain', 'core', 'sweep', 'lake', 'sealed', 'gate'])
    assert.equal(clearance.npcPlacement(entry), false, `${blocker} still blocks recovery`);
  blocker = 'prop';
  assert.equal(clearance.npcPlacement(entry), true, 'passive NPCs ignore props, matching live rock movement');
  const box = new Float64Array(24);
  for (let i = 0; i < 8; i++) {
    box[i * 3] = i & 1 ? 1 : -1;
    box[i * 3 + 1] = i & 2 ? 2 : 0;
    box[i * 3 + 2] = i & 4 ? 1 : -1;
  }
  geometry.climbMasonry.push({ node: {}, minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1, boxes: [box] });
  blocker = 'masonry';
  assert.equal(clearance.npcPlacement(entry), false, 'real cave masonry still blocks the passive core');
  blocker = '';
  for (const [object, key, value] of [[entry, 'biped', true], [entry, 'lounge', 'sit'],
    [entry.motion, 'lab', true], [entry.motion, 'office', true], [entry.climb, 'active', true],
    [entry.jump, 'active', true], [entry.drive, 'airborne', true]]) {
    const before = posed, original = object[key]; object[key] = value;
    assert.equal(clearance.npcPlacement(entry), false);
    assert.equal(posed, before + 1, `${key} keeps exact pose admission`);
    object[key] = original;
  }
  entry.controlled = true;
  assert.throws(() => clearance.npcPlacement(entry), /passive Hub clearance/);
});
