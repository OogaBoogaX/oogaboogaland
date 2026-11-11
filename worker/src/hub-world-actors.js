import { HOST } from './virtual-host.js';
// Construct the actual coupled Hub controllers over one private authored world.
// Movement, placement and routine selection are composed over the real private
// geometry here. There is no flat-ground or permissive-clearance fallback.
import { createOogaCrew, createNpcClankers, createNpcLabEquipment, createNpcWorkSites,
  createNpcClankerLayout, hubSlots, hubModels, hubWalkRules } from './ooga-crew.js';
import { createHubForestBeds } from './hub-forest-beds.js';
import { createHubWorldRecovery } from './hub-world-recovery.js';
import { createHubWorldArrivals } from './hub-world-arrivals.js';
import { createHubWorldClearance } from './hub-world-clearance.js';
import { createHubWorldNavigation } from './hub-world-navigation.js';
import { createHubWorldDestinations } from './hub-world-destinations.js';
import { createHubWorldPlacement } from './hub-world-placement.js';
import { createHubRoutinePaths } from './hub-routine-paths.js';
import { CLANKER_FIXED_PATH_CAPACITY } from './clanker-buffers.js';

const OOGA_QUERIES = ['groundAt', 'ceilingAt', 'walkable', 'npcWalkable', 'flyable',
  'wanderSpot', 'npcDestinationBlocked', 'npcLandingAllowed', 'npcRecoverySpot',
  'initialWorkSpot', 'npcRouteBlocked', 'npcStrandedAt', 'npcCaveRoofAt',
  'npcDetour', 'npcHazardClear', 'inBananas', 'abyssAt'];
const CLANKER_QUERIES = ['groundAt', 'clear', 'supportAt', 'terrainSupportAt',
  'pointSupportAt', 'groundPlaneAt', 'rectangleAt', 'climbAreaAt', 'climbSolidAt',
  'climbSurfaceAt', 'climbTorsoClear', 'climbClear', 'climbOpeningClear',
  'platformEntryAt', 'climbTransitionClear', 'restPoseClear', 'restFootingClear',
  'restSiteClear', 'restSurfaceClear', 'tallObstacleAhead', 'npcPlacement'];
const fail = message => { throw Error(message); };
const selectQueries = (source, keys) => Object.fromEntries(keys.map(key => {
  if (typeof source?.[key] !== 'function') fail(`missing actual Hub movement query: ${key}`);
  return [key, source[key]];
}));

export function createHubWorldActors(options) {
  try { return constructHubWorldActors(options); }
  catch (error) {
    // Navigation/layout may fail before either controller is allocated.
    try { options?.geometry?.dispose(); } catch { /* Keep the original error. */ }
    throw error;
  }
}

function constructHubWorldActors({ geometry, roster, execution, world, clock,
  tintWanted, game, stars, npcIdFor }) {
  if (!geometry?.lab || !geometry?.sleep || roster?.authoritative !== true
    || execution?.version !== 1 || !Array.isArray(roster.activeRoster)
    || roster.activeRoster.length > HOST.maxOogas || typeof clock !== 'function'
    || typeof tintWanted !== 'function' || typeof npcIdFor !== 'function' || !game?.state?.assignments
    || typeof game.itemOf !== 'function' || !world || world.level !== geometry.pileLevel)
    fail('complete authoritative Hub actor inputs required');
  let crew = null, clankers = null, labEquipment = null, disposed = false, initialized = false, recovery = null;
  const worldNavigation = createHubWorldNavigation({ geometry, getCrew: () => crew });
  const destinations = createHubWorldDestinations({ geometry, getCrew: () => crew, roster, execution, stars, navigation: worldNavigation });
  const oogaMovement = selectQueries({ ...destinations, ...worldNavigation.ooga }, OOGA_QUERIES);
  const rigClearance = createHubWorldClearance({ geometry, getClankers: () => clankers,
    navigation: worldNavigation.navigation });
  const clankerMovement = selectQueries({ ...rigClearance,
    groundAt: (x, z, y) => geometry.island.supportAt(x, z, y, 0.52),
    pointSupportAt: (x, z, y) => Math.max(geometry.island.supportAt(x, z, y, 0.02, -Infinity),
      geometry.solids.supportAt(x, z, y, 0.02, 0)),
    supportAt: geometry.clankerSupport?.clankerSupportAt,
    terrainSupportAt: geometry.clankerSupport?.clankerTerrainSupportAt,
    groundPlaneAt: geometry.clankerSupport?.clankerGroundPlaneAt,
    rectangleAt: geometry.clankerSupport?.clankerRectangleAt,
    climbAreaAt: geometry.clankerSupport?.clankerClimbAreaAt,
    climbSolidAt: geometry.clankerSupport?.clankerClimbSolidAt,
    climbSurfaceAt: geometry.clankerSupport?.clankerClimbSurfaceAt,
    climbTorsoClear: geometry.clankerSupport?.clankerClimbTorsoClear,
    platformEntryAt: geometry.clankerSupport?.clankerPlatformEntryAt,
    tallObstacleAhead: geometry.clankerSupport?.clankerTallObstacleAhead }, CLANKER_QUERIES);
  const navigation = createHubWorldPlacement(geometry);
  const { island, root, solids, headquarters, mempool, lab } = geometry;
  const walkIn = { x: 0, z: -(island.meadowRadius + 0.5) };
  const paths = createHubRoutinePaths(island);
  // Use the browser source's trimmed spokes and ring joins for passive work
  // legs, with the host's existing bounded state allocation.
  const fixedPaths = globalThis.BL.npcPaths.fixed(island);
  if (!fixedPaths || paths.capacity !== CLANKER_FIXED_PATH_CAPACITY) fail('unsupported authored mainland fixed routes');
  // Stable bed IDs require the same bounded search order after recovery. Reuse
  // its result only after replaying its clearance decisions in this world.
  const forest = createHubForestBeds(mempool,
    (x, y, z) => island.clearAt(x, y, z, 0.15, 1.5) && mempool.sleepClear(x, y, z), roster.activeRoster.length);
  const beds = new Map(), bedIds = new Map();
  const register = (prefix, entries) => entries.forEach((bed, i) => {
    const id = `${prefix}:${i}`; beds.set(id, bed); bedIds.set(bed, id);
  });
  register('hq', headquarters.mattresses); register('forest', forest.beds);
  const alive = () => { if (disposed) fail('Hub actors disposed'); };
  const validateNpcLand = () => {
    // Final admission covers beams, routine endpoints and rebuilt checkpoints,
    // including movement providers that do not use the ordinary walking sweep.
    for (const cave of crew.list) if (cave.root.visible) {
      const p = cave.root.position;
      if (!geometry.npcLandSegmentClear(p.x, p.z, p.x, p.z, cave.bodyRadius)) fail('Ooga outside NPC land');
    }
    for (const entry of clankers.list) if (entry.active && entry.root.visible) {
      const p = entry.root.position;
      if (!geometry.npcLandSegmentClear(p.x, p.z, p.x, p.z, entry.radius)) fail('Clanker outside NPC land');
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // Reparent held routine objects before disposing their actor's model.
    try {
      if (clankers && labEquipment) for (const entry of clankers.list) labEquipment.release(entry);
    } finally {
      try { clankers?.dispose(); } finally {
        try { crew?.dispose(); } finally { beds.clear(); bedIds.clear(); }
      }
    }
  };
  try {
    const sites = createNpcWorkSites({ slots: hubSlots.filter(slot => slot.repo
      && (slot.status === 'open' || slot.status === 'mirror')), island, solids,
      getCrew: () => crew, shotClear: navigation.shotClear, radius: 0.3, abyssFloor: -120 });
    Object.assign(clankerMovement, createNpcClankerLayout(island, hubSlots, sites));
    labEquipment = createNpcLabEquipment({ getLab: () => lab, getClankers: () => clankers });
    const shared = { ...oogaMovement, root, world, game,
      npcExecution: execution, npcContributors: roster, npcTintWanted: tintWanted,
      npcPassive: true, npcFixedPaths: fixedPaths, npcPaths: paths,
      npcFixedTerrainAt: (x, z, y) => island.supportAt(x, z, y, hubWalkRules.step, -120, 0.3),
      bedrolls: headquarters.mattresses,
      outdoorBedrolls: forest.beds, viewYaw: 0, walkIn, buildSpots: [], workSites: sites,
      weaponsEnabled: true, combatEnabled: false,
      reloadSlotRadius: () => island.path.debug.ringLoadingRadius,
      reloadRadius: () => island.path.debug.ringCenterRadius, reloadHeight: geometry.altar.height,
      deliverySource: geometry.factory.deliverySource,
      workCompanionTarget: (cave, out) => clankers?.companionTarget(cave, out),
      workPlanned: (cave, site) => clankers?.plan(cave, site) };
    crew = createOogaCrew(shared);
    for (const cave of crew.list) crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    const labSite = sites.findIndex(site => site.mouth === lab.mouth);
    if (labSite < 0) fail('Hub lab work site missing');
    clankers = createNpcClankers({ ...clankerMovement, root, crew, sites,
      npcExecution: execution, npcClock: clock, npcPassive: true, combatEnabled: false,
      npcFixedPaths: fixedPaths, npcPathState: paths.createState,
      sleep: geometry.sleep, labSite, labInside: lab.inside, labStations: lab.stations,
      labEquipment: lab.equipment, labPickup: labEquipment.pickup,
      labReturn: labEquipment.release, labRoll: labEquipment.roll,
      offices: geometry.offices.map(({ mouth, office }) => ({ mouth, stations: office.stations,
        waits: office.waits, entry: office.entry, entryAlong: office.entryAlong,
        aisleHalf: office.aisleHalf, walkway: office.walkway })),
      solidAt: island.solidAt, surfaceAt: island.surfaceAt, stairAt: island.stairAt,
      isGrass: island.isGrassAt, onLand: island.onLand,
      roamRadius: island.radius, meadowRadius: island.meadowRadius });
    // Allocate the complete fixed-lane shape before recovery compiles actor
    // defaults. Lazily adding pathing during a trip would escape that schema.
    for (const entry of clankers.list) entry.pathing = paths.createState();
    clankers.sites = sites;
    const arrive = createHubWorldArrivals({ geometry, crew, clankers, npcIdFor,
      placement: navigation.playerPlacement });
    // Ooga and companion bodies are always separate. No online account, session
    // or frozen-player state is consulted to stop, hide or possess either track.
    return {
      crew, clankers, labEquipment, sites, paths, rosterCount: () => roster.activeRoster.length,
      bedId: bed => bedIds.get(bed), bedFor: id => beds.get(id),
      playerSpawn(who, context) {
        alive(); if (!initialized) fail('Hub actors not initialized');
        return arrive(who, context);
      },
      initialize() {
        alive(); if (initialized) fail('Hub actors already initialized');
        crew.applyAllSwag(); crew.refreshStates(true); clankers.sync(); validateNpcLand(); geometry.sync();
        initialized = true;
      },
      composeRecovery(options) {
        alive(); if (recovery || initialized) fail('Hub recovery must be composed before initialization');
        const { disposeWorld } = options;
        if (typeof disposeWorld !== 'function') fail('complete Hub disposal required');
        recovery = createHubWorldRecovery({ ...options, crew, clankers, roster, labEquipment,
          offices: geometry.offices.map(entry => entry.office),
          bedId: bed => bedIds.get(bed), bedFor: id => beds.get(id), placement: navigation.oogaPlacement,
          syncWorld: geometry.sync,
          disposeWorld() { try { dispose(); } finally { disposeWorld(); } } });
        return {
          capture: () => { alive(); if (!initialized) fail('Hub actors not initialized'); return recovery.capture(); },
          restore(saved) {
            alive(); if (initialized) fail('Hub actors already initialized');
            crew.applyAllSwag(); recovery.restore(saved); validateNpcLand(); geometry.sync(); initialized = true;
            return true;
          },
          get usable() { return !disposed && initialized && recovery.usable; },
        };
      },
      refreshActivity() {
        alive(); if (!initialized) fail('Hub actors not initialized');
        crew.refreshStates();
        if (geometry.refreshMainland()) clankers.supportRemoved();
        clankers.sync();
      },
      step(dt, elapsed) {
        alive(); if (!initialized || !Number.isFinite(dt) || dt < 0 || dt > 0.25
          || !Number.isFinite(elapsed) || elapsed < 0) fail('invalid Hub actor step');
        geometry.setPileLevel(world.level);
        if (geometry.refreshMainland()) clankers.supportRemoved();
        crew.updateFan();
        // Preserve the source Hub order: companions and held lab equipment,
        // then the owner Ooga routines. Each advances exactly once per step.
        clankers.update(dt); labEquipment.update(dt); crew.update(dt, elapsed);
        validateNpcLand();
        geometry.sync();
      },
      dispose,
    };
  } catch (error) {
    try { dispose(); } catch { /* Preserve the construction error. */ }
    try { geometry.dispose(); } catch { /* The private graph must not be reused. */ }
    throw error;
  }
}
