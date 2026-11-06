// Import the actual Ooga controller and shared Hub rules without importing
// the browser pilot, controls, feeds or scene. Construction still needs the
// complete Hub geometry, coupled-world state and presentation/event adapters.
// These exports are not a VirtualHost simulation or a complete world checkpoint.
import "../../src/js/math.js";
import "../../src/js/scene.js";
import "../../src/js/models.js";
import "../../src/js/lab-wallpaper.js";
import "../../src/js/hub-models.js";
import "../../src/js/characters.js";
import "../../src/js/characters.gen.js";
import "../../src/js/daylight.js";
import "../../src/js/walk-rules.js";
import "../../src/js/activity-repos.js";
import "../../src/js/contributor-identities.js";
import "../../src/js/contributors.js";
import "../../src/js/npc-execution.js";
import "../../src/js/npc-work.js";
import "../../src/js/npc-walker.js";
import "../../src/js/npc-bed-routing.js";
import "../../src/js/npc-work-sites.js";
import "../../src/js/crew.js";

const B = globalThis.BL;
export function createOogaCrew(context) {
  if (!context?.npcExecution || context.npcContributors?.authoritative !== true)
    throw Error('private authoritative Ooga inputs required');
  return B.crew.create(context);
}
export const createNpcExecution = B.npcExecution.create;
export const createContributorRoster = B.contributorRoster.create;
export const createNpcBedRouting = B.npcBedRouting.create;
export const createNpcWorkSites = B.npcWorkSites.create;

// The same real companion controller, with an explicit world clock and no
// browser possession or viewer-dependent simulation pause.
import "../../src/js/agent.js";
import "../../src/js/wall-panels.js";
import "../../src/js/clanker-rage.js";
import "../../src/js/clanker-flight.js";
import "../../src/js/clankers.js";
export function createNpcClankers(context) {
  if (!context?.npcExecution || context.crew?.authoritative !== true || typeof context.npcClock !== "function")
    throw Error('private authoritative Clanker inputs required');
  return B.clankers.create(context);
}

import "../../src/js/npc-lab-equipment.js";
export const createNpcLabEquipment = B.npcLabEquipment.create;

// Actual static construction components; the complete coupled Hub factory must
// supply the same authored options and compose the remaining cave/islet props.
import "../../src/js/convex.js";
import "../../src/js/solid-props.js";
import "../../src/js/terrain.js";
import "../../src/js/lifehash.js";
import "../../src/js/blaze.js";
import "../../src/js/headquarters-models.js";
import "../../src/js/hub-headquarters.js";
export const createHubHeadquarters = B.hubHeadquarters.create;
export const createHubTerrain = B.terrain.island;
export const createHubSolids = B.solidProps.create;

import "../../src/js/bca-models.js";
import "../../src/js/factory-kiosk-core.js";
import "../../src/js/factory-models.js";
import "../../src/js/hub-work-interiors.js";
export const createHubLab = B.hubWorkInteriors.lab;
export const createHubOffice = B.hubWorkInteriors.office;
export const createHubFactoryMouth = B.hubWorkInteriors.factory;
export const hubFactoryRoofTube = B.factoryModels.ROOF_TUBE;

import "../../src/js/hub-cave-physics.js";
export const createHubCavePhysics = B.hubCavePhysics.create;
export const hubCaveLayout = B.hubCavePhysics.layout;

import "../../src/js/npc-clearance.js";
import "../../src/js/npc-hub-navigation.js";
export const createNpcHubNavigation = B.npcHubNavigation.create;

// Authored outlying-island geometry and support. Complete startup must also
// supply forest props, real water/event controllers and peer collision state.
import "../../src/js/pool-layout.js";
import "../../src/js/pool-models.js";
import "../../src/js/pool-site-props.js";
import "../../src/js/pool-support.js";
import "../../src/js/timechain-models.js";
import "../../src/js/bifrost-models.js";
import "../../src/js/bifrost-gate.js";
import "../../src/js/dressing.js";
import "../../src/js/bifrost-isle.js";
export function createMempoolSite(island) {
  const place = B.poolModels.spot(island, {});
  return { place, site: B.poolModels.build(place) };
}
export const createMempoolSupport = B.poolSupport.create;
export const createTimechainSite = B.timechainModels.build;
export const createBifrostSite = island => B.bifrostIsle.site(B.bifrostIsle.spot(island));

export const buildMempoolForest = B.poolSiteProps.forest;
export const createMempoolBoards = B.poolSiteProps.boards;

import "../../src/js/caves.js";
import "../../src/js/hub-layout.js";
import "../../src/js/terrain-snapshot.js";
export const hubSlots = B.caves.slots;
export const hubTerrainOptions = () => B.hubLayout.terrainOptions(B.caves.slots);
export const hubScene = B.scene;
export const hubModels = B.hubModels;
export const hubPoolModels = B.poolModels;
export const hubPoolLayout = B.poolLayout;
export const hubWalkRules = B.walkRules;
export const buildHubTerrainSnapshot = () => B.terrain.islandSnapshotSteps(hubTerrainOptions(), null);
export const restorePrivateHubTerrain = snapshot => B.terrainSnapshot.create(structuredClone(snapshot));

export const createMempoolSleep = B.poolSiteProps.sleep;

import "../../src/js/hub-altar.js";
import "../../src/js/pile.js";
export const createHubAltar = B.hubAltar.create;
export const hubPileScale = B.hubAltar.pileScale;
export const hubPileMaximum = B.pile.MAX_BANANAS;
export const hubPileFootprint = B.pile.visualFootprintFor;
export const hubLibrary = B.hubLayout.library;
export const createHubGate = B.bifrostGate.landmark;

import "../../src/js/npc-paths.js";
import "../../src/js/headquarters-sleep.js";
export const createHubPaths = B.npcPaths.create;
export const createHubSleepNavigation = B.headquartersSleep.create;
export const createHubOutdoorBeds = B.headquartersSleep.outdoor;
export const createHubOutdoorNavigation = B.headquartersSleep.outdoorNavigation;

import "../../src/js/hub-structural-support.js";
import "../../src/js/hub-clanker-support.js";
export const createHubStructuralSupport = B.hubStructuralSupport.create;
export const createHubClankerSupport = B.hubClankerSupport.create;

import "../../src/js/hub-clanker-clearance.js";
export const createHubClankerClearance = B.hubClankerClearance.create;

import "../../src/js/banana-volume.js";
export const createHubPileCore = B.pile.createCore;
export const scaleHubPileCore = B.pile.scaleCore;
export const createHubPileVolume = B.bananaVolume.create;

import "../../src/js/hub-mirror-clearance.js";
import "../../src/js/hub-locomotion.js";
export const createHubMirrorClearance = B.hubMirrorClearance.create;
export const createHubLocomotion = B.hubLocomotion.create;
export const hubFlightBound = 30 + B.crew.JET_SPEED * B.crew.JET_MOVE_SECONDS + 8;
export const hubTimechainRadius = B.timechainModels.SITE.radius;
export const hubCylinderSegmentClear = B.hubLocomotion.cylinderSegmentClear;

import "../../src/js/npc-routine-destinations.js";
import "../../src/js/npc-clanker-layout.js";
export const createNpcRoutineDestinations = B.npcRoutineDestinations.create;
export const createNpcClankerLayout = B.npcClankerLayout.create;
export const findHubFireSpot = B.npcRoutineDestinations.fireSpot;
export const createHubLadder = B.npcRoutineDestinations.ladder;
export const hubFireSeatsAt = B.npcRoutineDestinations.fireSeatsAt;
export const createHubFireRig = B.blaze.createVoxelRig;

export const hubCharacters = B.characters;
export const hubSwag = B.models.SWAG;
export const hubDaylight = B.daylight;
export const hubMath = B.math;
export const hubRepositoryOf = B.activityRepos.keyOf;
export const normalizeHubStats = B.contributorIdentities.normalizeStats;

import "../../src/js/totem-layout.js";
import "../../src/js/totem-models.js";
import "../../src/js/jumbotron.js";
export const hubTotemLayout = B.totemLayout;
export const hubTotemModels = B.totemModels;
export const createHubJumbotronCabinet = B.jumbotron.createCabinet;
export const hubJumbotronDrop = B.jumbotron.DROP;
export const hubBoardLayout = B.hubLayout.jumbotron;

import "../../src/js/hub-mouth-dressing.js";
export const hubMouthDressing = B.hubMouthDressing;
export const hubDressing = B.dressing;
export const hubGroundLayout = B.hubLayout;

import "../../src/js/hub-hammock.js";
import "../../src/js/hub-mainland-planting.js";
export const hubMainlandPlanting = B.hubMainlandPlanting;
export const hubTimechainModels = B.timechainModels;
