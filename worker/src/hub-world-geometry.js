// Private startup assembly of the authored terrain, work interiors and satellite
// islands. This is a construction stage, not a complete simulation factory: the
// caller still owns actor creation, projection, mutable world events and recovery.
import { buildHubTerrainSnapshot, restorePrivateHubTerrain, hubSlots, hubScene,
  hubModels, hubPoolModels, hubPoolLayout, hubWalkRules,
  createHubSolids, createHubHeadquarters, createHubCavePhysics,
  createHubLab, createHubOffice, createHubFactoryMouth, createMempoolSite,
  createMempoolBoards, buildMempoolForest, createMempoolSupport, createMempoolSleep,
  createTimechainSite, createBifrostSite, createHubAltar, hubPileScale,
  hubPileMaximum, hubPileFootprint, hubLibrary, createHubGate,
  createHubStructuralSupport, createHubClankerSupport,
  createHubPileCore, scaleHubPileCore, createHubPileVolume, findHubFireSpot, createHubFireRig, createHubLadder, hubTotemLayout, hubTotemModels,
  createHubJumbotronCabinet, hubJumbotronDrop, hubBoardLayout,
  hubMouthDressing, hubDressing, hubGroundLayout } from './ooga-crew.js';
import { buildHubMainland } from './hub-world-mainland.js';
import { validateHubLayout } from './hub-layout-history.js';

// A single data-only template; each world receives its own mutable terrain/path
// and query scratch state. Never share the browser terrain cache across retries.
let terrainTemplate = null;
const MAX_TARGETS = 8192, MAX_PROPS = 1024;
const POOL_SOLIDS = new Set(['poolbridge', 'poolsign', 'poolrock', 'canopy']);
const fail = message => { throw Error(message); };

export function* buildHubWorldGeometry({ hydrology, layout, getRosterCount }) {
  if (hydrology?.authoritative !== true || typeof hydrology.levelAt !== 'function')
    fail('authoritative Hub hydrology required');
  if (typeof getRosterCount !== 'function') fail('authoritative Hub roster required');
  const checkLevel = value => {
    if (!Number.isFinite(value) || value < 0 || value > hubPileMaximum) fail('invalid Hub pile level');
  };
  validateHubLayout(layout);
  layout = structuredClone(layout);
  const { createNode, addChild, removeChild, updateWorld } = hubScene;
  if (!terrainTemplate) terrainTemplate = yield* buildHubTerrainSnapshot();
  yield;
  const island = restorePrivateHubTerrain(terrainTemplate), root = createNode();
  const solids = createHubSolids(), sleepSolids = createHubSolids();
  const placed = [], props = [], targets = new Map(), fireRigs = [], fireHazards = [];
  const matrixGates = [], sealedCaves = [], closedCaveZones = [], headquartersRimLintels = [], climbMasonry = [];
  const mouths = new Map(), offices = [];
  const claimed = [], pilePosts = [], buildSpots = [];
  const claim = (x, z, r) => {
    const value = { x, z, r, scenery: null };
    claimed.push(value); return value;
  };
  const free = (x, z, radius) => hubGroundLayout.free(claimed, x, z, radius);
  const nearPath = (x, z, distance) => hubGroundLayout.nearPath(island, x, z, distance);
  const movePilePosts = () => {
    if (!pilePosts.length) return;
    const radius = hubGroundLayout.pilePostRadius(island);
    for (const post of pilePosts) {
      const spot = hubGroundLayout.polar(post.degrees, radius);
      post.node.position.x = post.claim.x = spot.x;
      post.node.position.y = island.surfaceAt(spot.x, spot.z);
      post.node.position.z = post.claim.z = spot.z;
      post.node.rotation.y = -Math.atan2(spot.x, -spot.z) - Math.PI / 2;
    }
  };
  let lab = null, factory = null, mirrorMouth = null, mirror = null, complete = false, disposed = false;
  let mainland = null, chalkboardClearance = null;
  const alive = () => { if (disposed) fail('Hub geometry disposed'); };
  const addTarget = (node, owner) => {
    alive();
    if (!node || !owner || !targets.has(node) && targets.size >= MAX_TARGETS) fail('Hub target capacity');
    targets.set(node, owner);
  };
  const attach = node => { addChild(root, node); placed.push(node); return node; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mainland?.dispose();
    solids.dispose(); sleepSolids.dispose(); targets.clear(); mouths.clear();
    // This is a private world's root, including any actor constructor that
    // threw before returning its own disposer.
    for (const node of root.children.slice()) removeChild(root, node);
    placed.length = props.length = fireRigs.length = fireHazards.length = offices.length = 0;
    claimed.length = pilePosts.length = buildSpots.length = 0;
    matrixGates.length = sealedCaves.length = closedCaveZones.length = headquartersRimLintels.length = climbMasonry.length = 0;
  };
  try {
    attach(createNode({ geometry: island.geometry }));
    const pathNode = attach(createNode({ geometry: island.path.geometry,
      instanceData: island.path.instanceData, instanceCount: 0, instanceVersion: 0, depthBias: 0.05 }));
    const altar = createHubAltar({ root, placed });
    const pileCore = createHubPileCore(hubPileScale);
    const pileVolume = createHubPileVolume(pileCore, altar.height + 0.02);
    let pileLevel;
    const setPileLevel = value => {
      alive(); checkLevel(value);
      if (value === pileLevel) return false;
      scaleHubPileCore(pileCore, value, hubPileScale, altar.height + 0.02);
      altar.setRadius(hubPileFootprint(value, hubPileScale));
      const changed = island.path.setRadius(altar.platformRadius);
      island.path.apply(pathNode);
      pileLevel = value;
      if (changed) movePilePosts();
      return changed;
    };
    setPileLevel(layout.level);
    // These are authored solid meshes, not client-only picks or lighting.
    const arch = createHubGate(), gate = attach(createNode({ geometry: arch.stone,
      position: { x: island.gate.x, y: island.surfaceAt(island.gate.x, island.gate.z), z: island.gate.z },
      rotation: { x: 0, y: island.gate.ry, z: 0 } }));
    solids.add(gate);
    claim(gate.position.x, gate.position.z, arch.reach);
    const library = attach(createNode({ geometry: hubModels.libraryNook(),
      position: { x: hubLibrary.x, y: hubLibrary.floor, z: hubLibrary.z },
      rotation: { x: 0, y: hubLibrary.ry, z: 0 } }));
    solids.add(library);
    const headquarters = createHubHeadquarters({ island, root, solids, placed, addTarget,
      fireRigs, fireHazards, fireAvoidRadius: 1.25, sleepMarksVisible: () => false });
    headquarters.sleepAnchors = headquarters.mattresses;
    const cavePhysics = createHubCavePhysics({ getSolids: () => solids,
      getMirrorMouth: () => mirrorMouth, matrixGates, sealedCaves, closedCaveZones,
      headquartersRimLintels, climbMasonry, radius: 0.3, step: hubWalkRules.step });
    yield;
    for (let i = 0; i < hubSlots.length; i++) {
      const slot = hubSlots[i], mouth = island.mouths.find(m => m.id === slot.id);
      if (!mouth) fail('Hub cave layout mismatch');
      const { group, rim } = cavePhysics.buildShell(slot, mouth, i + 1);
      attach(group);
      const options = { slot, mouth, group, opening: rim.geometry.openingBounds, solids, island, addTarget };
      const record = { slot, mouth, group, opening: options.opening };
      if (slot.status === 'open' && slot.scene === 'lab') {
        if (lab) fail('duplicate Hub lab');
        lab = createHubLab(options); record.interior = lab;
      } else if (slot.status === 'open' && slot.place === 'bca') {
        const office = createHubOffice(options);
        offices.push(office); record.interior = office;
      } else if (slot.status === 'open' && slot.scene === 'factory') {
        if (factory) fail('duplicate Hub factory');
        factory = createHubFactoryMouth(options); record.interior = factory;
      } else if (slot.status === 'mirror') {
        mirrorMouth = mouth;
        const node = createNode({ position: { x: 0, y: 1.5, z: 0.5 }, geometry: hubModels.mirrorPanel() });
        addChild(group, node);
        mirror = { mouth, node };
      }
      if (hubMouthDressing.themes[slot.theme]) {
        const baked = hubMouthDressing.bake(island, slot, mouth);
        const solid = createNode({ geometry: baked.solid });
        addChild(group, solid); solids.add(solid);
        const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
        if (slot.theme === 'lab') {
          const board = hubMouthDressing.chalkboard;
          const x = mouth.x + cr * board.x + sr * board.z;
          const z = mouth.z - sr * board.x + cr * board.z;
          const y = island.surfaceAt(x, z) - mouth.floorY;
          if (Math.abs(y) <= 0.9) {
            const set = hubDressing.set(); set.put('chalkboard', 0, 0, 0);
            const node = createNode({ geometry: set.build().solid,
              position: { x: board.x, y, z: board.z }, rotation: { x: 0, y: board.yaw, z: 0 },
              scale: { x: board.scale, y: board.scale, z: board.scale } });
            addChild(group, node); solids.add(node); claim(x, z, 0.8 * board.scale);
            const facing = mouth.ry + board.yaw;
            chalkboardClearance = { x, z, rightX: Math.cos(facing), rightZ: -Math.sin(facing),
              frontX: Math.sin(facing), frontZ: Math.cos(facing) };
          }
        }
        for (let j = 0; j < baked.ground.length; j += 2) {
          const x = baked.ground[j], z = baked.ground[j + 1];
          claim(mouth.x + cr * x + sr * z, mouth.z - sr * x + cr * z, 0.8);
        }
      }
      claim(mouth.x, mouth.z, 3.5);
      mouths.set(slot.id, record);
      yield;
    }
    if (!lab || offices.length !== 1 || !factory || !mirrorMouth) fail('incomplete Hub work interiors');
    headquarters.entropyLab = lab;
    for (const gate of matrixGates) cavePhysics.finishMirror(gate);
    for (const degrees of hubGroundLayout.buildDegrees) {
      const spot = hubGroundLayout.spotAt(island, claimed, degrees, hubGroundLayout.buildRadius, 1);
      if (!spot) continue;
      claim(spot.x, spot.z, 0.9);
      buildSpots.push({ ...spot, ry: Math.atan2(-spot.x, -spot.z) });
    }

    const { place, site } = createMempoolSite(island), P = hubPoolModels, L = hubPoolLayout;
    const cos = Math.cos(place.ry), sin = Math.sin(place.ry);
    const worldX = (x, z) => place.x + x * cos + z * sin;
    const worldZ = (x, z) => place.z - x * sin + z * cos;
    const localX = (x, z) => (x - place.x) * cos - (z - place.z) * sin;
    const localZ = (x, z) => (x - place.x) * sin + (z - place.z) * cos;
    const addProp = (kind, node, x, z, radius) => {
      if (props.length >= MAX_PROPS || ![x, z, radius].every(Number.isFinite) || radius <= 0)
        fail('Hub prop capacity or transform');
      const owner = { kind: 'prop', prop: kind, node, x, z, radius, active: true };
      if (kind === 'tree' || kind === 'palm') node.npcTreeSupport = true;
      if (kind === 'tree' || kind === 'palm' || kind === 'canopy') node.ragePass = true;
      props.push(owner); addTarget(node, owner);
      if (kind === 'tree') solids.add(node);
      if (POOL_SOLIDS.has(kind)) { solids.add(node); sleepSolids.add(node); }
      return owner;
    };
    const atNode = (kind, node, radius) => addProp(kind, node,
      worldX(node.position.x, node.position.z), worldZ(node.position.x, node.position.z), radius);
    attach(site.node);
    const walked = new Set([site.bridge, site.ground, site.floor, site.membrane, ...site.crossings]);
    for (const node of [site.ground, site.floor, site.membrane, ...site.crossings]) {
      solids.add(node); sleepSolids.add(node);
    }
    site.floor.sightHidden = true;
    for (const node of site.crossings) node.sightHidden = true;
    addProp('poolbridge', site.bridge, worldX(0, place.bridgeLocalZ + P.SITE.span / 2),
      worldZ(0, place.bridgeLocalZ + P.SITE.span / 2), P.SITE.width);
    atNode('poolsign', site.sign, site.sign.geometry.signWidth * 0.55);
    const boards = createMempoolBoards(site);
    atNode('chainsign', boards.boardNode, P.CHAIN_BOARD.w * 0.55);
    atNode('weathersign', boards.infoNode, 1);
    for (const torch of site.torches) atNode('torch', torch, 0.5);
    const forest = yield* buildMempoolForest({ site, ...boards, atNode });
    const support = createMempoolSupport({ island, site, place, water: hydrology, step: hubWalkRules.step });
    sleepSolids.sync();
    const mempool = { site, place, layout: L, water: hydrology, walked, forest, boards,
      cos, sin, worldX, worldZ, localX, localZ, ...support,
      sleepClear: (x, y, z) => sleepSolids.segmentClear(x, y, z, x, y, z, 0.15, 1.5) };
    const sleep = createMempoolSleep(mempool);
    yield;
    const timechain = createTimechainSite(island);
    attach(timechain.node);
    for (const node of [timechain.shell, timechain.entrance, timechain.bridge, timechain.plug]) solids.add(node);
    yield;
    const bifrost = createBifrostSite(island);
    for (const node of bifrost.roots) attach(node);
    for (const node of bifrost.solids) { node.sightSolid = true; solids.add(node); }
    updateWorld(root); solids.sync();
    // Ground reservations use the browser's authored order and predicate.
    // Physical placement still independently checks the complete solid graph.
    const ladder = createHubLadder(island);
    attach(ladder.root);
    claim(ladder.x, ladder.z, 1);
    addProp('ladder', ladder.rungs, ladder.x, ladder.z, 1.2).lean = ladder.root;
    updateWorld(root); solids.sync();
    const firePosition = findHubFireSpot(island, free, nearPath);
    const firepit = attach(createNode({ geometry: hubModels.firepit(),
      position: { x: firePosition.x, y: 0, z: firePosition.z } }));
    solids.add(firepit);
    claim(firePosition.x, firePosition.z, 1.4);
    const fireRig = createHubFireRig({ scale: 1, sightHidden: true });
    addChild(firepit, fireRig.root); fireRigs.push(fireRig);
    fireHazards.push({ node: fireRig.root, boxes: fireRig.boxes, pit: firepit,
      x: firePosition.x, y: 0, z: firePosition.z, avoidRadius: 1.25 });
    updateWorld(root); solids.sync();
    // Same authored cabinet and solid totem bodies as the browser, without
    // live board canvases, decorative lights or GitHub feed subscriptions.
    const board = hubBoardLayout;
    const jumbotron = attach(createHubJumbotronCabinet({
      position: { x: board.x, y: island.surfaceAt(board.x, board.z) + (hubJumbotronDrop - board.sink) * board.scale + board.lift, z: board.z },
      ry: Math.atan2(-board.x, -board.z), scale: board.scale, curved: true }));
    solids.add(jumbotron); addProp('jumbotron', jumbotron, board.x, board.z, board.reach);
    claim(board.x, board.z, board.reach);
    const totems = hubTotemLayout.spots.map(([x, z], i) => {
      const node = attach(createNode({ geometry: hubTotemModels.body(i), position: { x, y: island.surfaceAt(x, z), z },
        rotation: { x: 0, y: Math.atan2(-x, -z), z: 0 } }));
      solids.add(node); addProp('totem', node, x, z, hubTotemModels.layout(i).reach);
      claim(x, z, hubTotemModels.layout(i).reach + hubTotemLayout.room);
      return node;
    });
    const postSet = hubDressing.set(); postSet.put('lanternPost', 0, 0, 0);
    const postGeometry = postSet.build().solid;
    for (const degrees of hubGroundLayout.pilePostDegrees) {
      const node = attach(createNode({ geometry: postGeometry }));
      solids.add(node);
      pilePosts.push({ degrees, node, claim: claim(Infinity, Infinity, 0.7) });
    }
    movePilePosts();
    mainland = yield* buildHubMainland({ island, root, solids, placed, targets, props, addProp,
      claimed, claim, free, nearPath, getRosterCount, layout, chalkboardClearance, mempool, timechain, bifrost, firePosition });
    updateWorld(root); solids.sync();
    const structuralSupport = createHubStructuralSupport({ getRoot: () => root, getHeadquarters: () => headquarters,
      disabled: () => false, getDefaultRadius: () => 0.3 });
    const clankerSupport = createHubClankerSupport({ getIsland: () => island, getSolids: () => solids,
      getAltar: () => altar, getMempool: () => mempool, getClimbMasonry: () => climbMasonry, step: hubWalkRules.step,
      abyss: -120, altarHeight: altar.height, draught: 0.9,
      playersSupportAt(entry) {
        // This provider is only for independently simulated passive NPCs. It
        // cannot silently become the collision adapter for a driven player.
        if (!entry?.nonInteractive) fail('passive Hub NPC support required');
        return -Infinity;
      } });
    complete = true;
    return { root, island, solids, placed, targets, props, headquarters, mouths,
      lab, offices, factory, mirror, mempool, timechain, bifrost, sleep, cavePhysics,
      altar, pileCore, pileVolume, pathNode, gate, library, setPileLevel, get pileLevel() { return pileLevel; },
      matrixGates, sealedCaves, closedCaveZones, headquartersRimLintels, climbMasonry,
      fireRigs, fireHazards, firePosition, ladder, jumbotron, totems, pilePosts, buildSpots, claimed, free, structuralSupport, clankerSupport,
      refreshMainland() { alive(); return mainland.refresh(); },
      captureLayout() {
        alive();
        return validateHubLayout({ ...layout, ring: mainland.ringReached });
      },
      sync() { alive(); updateWorld(root); solids.sync(); }, dispose };
  } finally {
    // Cancellation or a failed constructor cannot leave a half-built graph in
    // a later storage retry. No partially assembled world is published.
    if (!complete) dispose();
  }
}
