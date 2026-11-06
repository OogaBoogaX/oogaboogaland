// Source Hub locomotion over authored geometry, with no incidental actor
// support or collisions. Routine destination/reservation policy is composed by
// the world factory separately; these queries never read player presence.
import { createHubLocomotion, createHubMirrorClearance, createNpcHubNavigation,
  hubCylinderSegmentClear, hubFlightBound, hubTimechainRadius, hubCaveLayout,
  hubWalkRules, hubModels } from './ooga-crew.js';
import '../../src/js/hub-arrival.js';

export function createHubWorldNavigation({ geometry: g, getCrew }) {
  if (!g?.pileVolume || !g.mirror || !g.structuralSupport || typeof getCrew !== 'function')
    throw Error('complete Hub navigation geometry required');
  const RADIUS = .3, STEP = hubWalkRules.step, ABYSS = -120;
  const { island, solids, altar, cavePhysics } = g;
  const { bedSupportAt, bedCeilingAt, bedSegmentClear, entranceCeilingAt } = g.structuralSupport;
  const { matrixGateSegmentClear, matrixGateCeilingAt, crossesSealedCave,
    npcClosedCaveAt, npcClosedCaveClear } = cavePhysics;
  const openings = island.mouths.map(mouth => ({ mouth, sr: Math.sin(mouth.ry), cr: Math.cos(mouth.ry),
    rim: hubModels.caveMouthRim().openingBounds }));
  const { mirrorActorSegmentClear } = createHubMirrorClearance({ getMirror: () => g.mirror,
    radius: RADIUS, eyeForward: .16, portalZ: hubCaveLayout.PORTAL_Z });
  const passive = actor => {
    if (actor && (!actor.nonInteractive || actor.humanControlled || actor.remoteControlled))
      throw Error('passive Ooga navigation cannot admit a player');
  };
  const treeSupportAllowed = node => !node.npcTreeSupport;
  const propSupportAt = (x, z, y, rise) => Math.max(
    solids.supportAt(x, z, y, rise, RADIUS, null, null, false, treeSupportAllowed, false),
    altar.height <= y + rise + 1e-7 && Math.hypot(x, z) < altar.platformRadius + RADIUS - 1e-7
      ? altar.height : -Infinity);
  const playerSupportAt = (x, z, y = 0, previousY = y, actor = null) => {
    passive(actor);
    const from = Math.max(y, previousY), rise = !actor || actor.hop === 0 && actor.hopV <= 0 ? STEP : 0;
    return Math.max(island.supportAt(x, z, y, STEP, ABYSS, RADIUS),
      bedSupportAt(x, z, from, STEP, RADIUS), propSupportAt(x, z, from, rise));
  };
  const propCeilingAt = (x, z, y, radius) => Math.min(solids.ceilingAt(x, z, y, radius),
    y < altar.height - 1e-7 && Math.hypot(x, z) < altar.platformRadius + radius - 1e-7 ? 0 : Infinity);
  const propSegmentClear = (x, y, z, tx, ty, tz, radius, height) =>
    g.npcLandSegmentClear(x, z, tx, tz, radius)
    && solids.segmentClear(x, y, z, tx, ty, tz, radius, height)
    && hubCylinderSegmentClear(x, y, z, tx, ty, tz, radius, height, 0, 0, 0, altar.height, altar.platformRadius);
  const physicalClearAt = (x, y, z, radius, height) => g.npcLandSegmentClear(x, z, x, z, radius)
    && island.clearAt(x, y, z, radius, height)
    && y + height <= Math.min(entranceCeilingAt(x, z, y, radius), bedCeilingAt(x, z, y, radius),
      propCeilingAt(x, z, y, radius)) + 1e-7
    && solids.segmentClear(x, y, z, x, y, z, radius, height);
  const ceilingAt = (x, z, y, actor = null) => {
    passive(actor);
    let ceiling = Math.min(island.ceilingAt(x, y, z, RADIUS), entranceCeilingAt(x, z, y, RADIUS),
      bedCeilingAt(x, z, y, RADIUS), matrixGateCeilingAt(x, z, y), propCeilingAt(x, z, y, RADIUS));
    for (const { mouth: m, rim, sr, cr } of openings) {
      const dx = x - m.x, dz = z - m.z, along = dx * sr + dz * cr, across = dx * cr - dz * sr;
      if (y < m.floorY - STEP || y > m.floorY + rim.ceilingY
        || along < rim.minZ + hubCaveLayout.PORTAL_Z - RADIUS || along > rim.maxZ + hubCaveLayout.PORTAL_Z + RADIUS
        || across < rim.minX - RADIUS || across > rim.maxX + RADIUS) continue;
      ceiling = Math.min(ceiling, m.floorY + rim.ceilingY);
    }
    return ceiling;
  };
  const locomotion = createHubLocomotion({ worldBound: () => hubFlightBound, crossesSealedCave,
    playerSupportAt, ceilingAt, physicalClearAt, propSegmentClear, matrixGateSegmentClear,
    mirrorActorSegmentClear, bedSegmentClear, radius: RADIUS, step: STEP, getDefaultActor: () => null,
    // Explicit passive policy: no standing on another body, and no driven
    // player's overlap escape exception in autonomous route planning.
    characterClankerSupportAt: () => -Infinity, playerEscapeClear: () => false });
  const npcPileAt = (x, feet, z, height) => feet <= altar.height + STEP && feet + height > 0
    && Math.hypot(x, z) < altar.platformRadius + RADIUS || g.pileVolume.intersectsBody(x, feet, z, height);
  const navigation = createNpcHubNavigation({ getCrew, getIsland: () => island,
    // Passive routines create no combat exclusion zones. Bed/work reservations
    // still belong to their controllers and are recovered independently.
    workZones: [], openings, cavePhysics, npcPileAt, walkable: locomotion.walkable, playerSupportAt,
    fireHazards: g.fireHazards, fireBottom: .12, fireTop: .85, radius: RADIUS, step: STEP,
    destinationFeet: (cave, x, z) => Math.hypot(x - g.timechain.place.x, z - g.timechain.place.z) < hubTimechainRadius - 1
      ? playerSupportAt(x, z, Infinity, Infinity, cave) : island.surfaceAt(x, z) });
  const ooga = {
    groundAt: playerSupportAt, ceilingAt, ...locomotion,
    initialWorkSpot(cave, out) {
      passive(cave);
      const radius = Math.max(RADIUS, cave.bodyRadius), height = cave.bodyHeight;
      return globalThis.BL.hubArrival.find({ platformRadius: altar.platformRadius,
        allowed(x, y, z) {
          return island.surfaceAt(x, z) === 0 && navigation.npcLandingAllowed(x, y, z, height, cave)
            && physicalClearAt(x, y + 1e-5, z, radius, height)
            && propSegmentClear(x, y + 1e-5, z, x, y + 1e-5, z, radius, height)
            && mirrorActorSegmentClear(x, y, z, x, y, z, height, cave);
        } }, out, true);
    },
    npcWalkable: navigation.npcWalkable, npcDestinationBlocked: navigation.npcDestinationBlocked,
    npcLandingAllowed: (x, y, z, height, cave) => g.npcLandSegmentClear(x, z, x, z, cave?.bodyRadius || RADIUS)
      && navigation.npcLandingAllowed(x, y, z, height, cave), npcCaveRoofAt: navigation.npcCaveRoofAt,
    npcDetour: () => false,
    npcRouteBlocked: (cave, x, y, z) => npcClosedCaveAt(x, z, y, cave.bodyHeight)
      || navigation.npcWorkZoneAt(cave, x, y, z) || navigation.npcRampRoofAt(x, y, z)
      || cave.state === 'chilling' && Math.hypot(x, z) < island.path.debug.ringOuterRadius + 1.5,
    npcStrandedAt: (cave, x, y, z) => navigation.npcRampRoofAt(x, y, z),
    npcHazardClear: (x, y, z, tx, ty, tz, height, cave) => g.npcLandSegmentClear(x, z, tx, tz, cave?.bodyRadius || RADIUS)
      && npcClosedCaveClear(x, y, z, tx, ty, tz, height)
      && navigation.npcFireClear(x, y, z, tx, ty, tz, height) && navigation.npcWorkZoneClear(cave, x, y, z, tx, ty, tz),
    inBananas: (cave, x = cave.root.position.x, z = cave.root.position.z) =>
      g.pileVolume.intersectsBody(x, cave.root.position.y - (cave.gorilla ? 0 : cave.baseY), z,
        cave.gorilla ? cave.gorilla.bodyHeight : cave.bodyHeight),
    abyssAt: (x, z, y, actor) => playerSupportAt(x, z, y, y, actor) === ABYSS,
  };
  return { navigation, ooga, physicalClearAt, propSegmentClear, npcPileAt,
    pathPointAllowed: (x, z) => !npcClosedCaveAt(x, z) && !navigation.npcRampRoofAt(x, island.surfaceAt(x, z), z) };
}
