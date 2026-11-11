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

// A fixed Ooga trip is the source crew's predicate, never a persisted flag.
// Non-fixed routes and independently controlled players keep full admission.
test('fixed Ooga recovery keeps live prop pass-through without bypassing structural admission', async () => {
  const { createHubWorldPlacement } = await import('../src/hub-world-placement.js');
  const { hubScene } = await import('../src/ooga-crew.js');
  let blocker = '', propQueries = 0;
  const shape = { verts: new Float64Array([-.1, 0, -.1, .1, .2, .1]), faces: [] };
  const root = hubScene.createNode({ position: { x: 5, y: 0, z: 5 } }), parts = {};
  for (const name of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) {
    parts[name] = hubScene.createNode({ geometry: shape }); hubScene.addChild(root, parts[name]);
  }
  const geometry = {
    island: { clearAt: () => blocker !== 'terrain' },
    solids: { clearAt() { propQueries++; return blocker !== 'prop'; } },
    structuralSupport: { bedSegmentClear: () => blocker !== 'bed' },
    cavePhysics: { matrixGateSegmentClear: () => blocker !== 'gate' },
    npcLandSegmentClear: () => blocker !== 'lake',
    altar: { height: 1, platformRadius: 1 },
    mirror: { mouth: { x: 100, z: 100, ry: 0, floorY: 0 },
      node: hubScene.createNode({ geometry: shape }) },
  };
  const placement = createHubWorldPlacement(geometry);
  const cave = { nonInteractive: true, root, parts, state: 'working', bodyRadius: .3 };
  assert.equal(placement.oogaPlacement(cave, [cave]), true);
  blocker = 'prop';
  assert.equal(placement.oogaPlacement(cave, [cave]), false);
  const queries = propQueries;
  assert.equal(placement.oogaPlacement(cave, [cave], true), true);
  assert.equal(propQueries, queries, 'fixed movement does not consult incidental props');
  assert.equal(placement.oogaPlacement(cave, [cave], 1), false, 'policy is an exact source boolean');
  for (blocker of ['terrain', 'bed', 'gate', 'lake'])
    assert.equal(placement.oogaPlacement(cave, [cave], true), false, `${blocker} still refuses fixed recovery`);
  blocker = '';
  root.position.x = root.position.z = 0;
  assert.equal(placement.oogaPlacement(cave, [cave], true), false, 'the altar remains solid');
  root.position.x = root.position.z = 5;
  for (const key of ['humanControlled', 'remoteControlled']) {
    cave[key] = true;
    assert.equal(placement.oogaPlacement(cave, [cave], true), false, `${key} cannot borrow passive policy`);
    cave[key] = false;
  }
  cave.nonInteractive = false;
  assert.equal(placement.oogaPlacement(cave, [cave], true), false);
});
