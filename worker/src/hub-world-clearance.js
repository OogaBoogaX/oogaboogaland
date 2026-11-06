// Compose source rig collision over a private Hub. Only passive NPCs use this
// peer policy; independently driven player bodies have their own admission.
import { createHubClankerClearance, hubWalkRules } from './ooga-crew.js';

export function createHubWorldClearance({ geometry, getClankers, navigation }) {
  const fail = () => { throw Error('complete passive Hub clearance required'); };
  if (typeof getClankers !== 'function' || !geometry?.clankerSupport
    || typeof navigation?.npcFireClear !== 'function' || typeof navigation?.npcRampRoofAt !== 'function') fail();
  const g = geometry, support = g.clankerSupport;
  const timechain = { place: g.timechain.place,
    cos: Math.cos(g.timechain.place.ry), sin: Math.sin(g.timechain.place.ry) };
  const bifrost = { site: g.bifrost };
  let passing = null;
  const passive = entry => {
    if (entry && (!entry.nonInteractive || entry.controlled || entry.remoteControlled)) fail();
    return true;
  };
  const entering = entry => !!entry && !entry.rage.active && (entry.planningEntry || !entry.controlled && entry.mode === 'working'
    && entry.phase === 'travel' && (entry.route === 'apron' || entry.route === 'enter'));
  const labWorker = entry => !!entry && !entry.rage.active && !entry.controlled && entry.mode === 'working'
    && (entry.route === 'exit' && getClankers()?.sites[entry.fromSite]?.mouth === g.lab.mouth
      || getClankers()?.sites[entry.site]?.mouth === g.lab.mouth && (entry.motion.lab || entry.planningLab));
  const clear = createHubClankerClearance({ getIsland: () => g.island, getSolids: () => g.solids,
    getMempool: () => g.mempool, getTimechain: () => timechain, getBifrost: () => bifrost,
    getClankers, getLab: () => g.lab, getClimbMasonry: () => g.climbMasonry,
    getPassingEntry: () => passing, setPassingEntry: value => { passing = value; },
    labInside: g.lab.inside, crossesSealedCave: g.cavePhysics.crossesSealedCave,
    matrixGateSegmentClear: g.cavePhysics.matrixGateSegmentClear,
    npcFireClear: navigation.npcFireClear, npcRampRoofAt: navigation.npcRampRoofAt,
    // No peer avoidance. These hooks enforce only the fixed NPC land boundary.
    clankerPlayersClear: (entry, x, y, z, tx, ty, tz) => passive(entry)
      && g.npcLandSegmentClear(x, z, tx, tz, entry?.radius || .3),
    clankerPeersClear: passive,
    clankerBedPlayersClear: (entry, bed) => passive(entry)
      && g.npcLandSegmentClear(bed.x, bed.z, bed.x, bed.z, entry?.radius || .3),
    clankerPassingPeer: (entry, other) => passive(entry) && passive(other),
    clankerBodySegmentClear: passive, clankerEntering: entering, clankerLabWorker: labWorker,
    clankerGroundPlaneAt: support.clankerGroundPlaneAt,
    clankerRectangleAt: support.clankerRectangleAt, clankerTerraceAt: support.clankerTerraceAt,
    fireHazards: g.fireHazards, step: hubWalkRules.step, abyss: -120, fireBottom: .12, fireTop: .85 });
  return {
    clear(...args) { passive(args[8]); return clear.clankerClear(...args); },
    climbClear(entry, x, y, z, nx, ny, nz, radius, ...rest) {
      return passive(entry) && g.npcLandSegmentClear(x, z, nx, nz, radius)
        && clear.clankerClimbClear(entry, x, y, z, nx, ny, nz, radius, ...rest);
    },
    climbOpeningClear: clear.clankerOpeningClear,
    climbTransitionClear(entry, x, y, z, nx, ny, nz, radius, ...rest) {
      return passive(entry) && g.npcLandSegmentClear(x, z, nx, nz, radius)
        && clear.clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz, radius, ...rest);
    },
    restPoseClear: clear.clankerRestPoseClear,
    restFootingClear: clear.clankerRestFootingClear,
    restSiteClear(entry, x, y, z, heading) {
      return passive(entry) && g.npcLandSegmentClear(x, z, x, z, entry.radius)
        && clear.clankerRestSiteClear(entry, x, y, z, heading);
    },
    restSurfaceClear: clear.clankerRestSurfaceClear,
    npcPlacement(entry) {
      passive(entry);
      const p = entry.root.position;
      if (![p.x, p.y, p.z, entry.heading].every(n => Number.isFinite(n) && Math.abs(n) < 10000)
        || !g.npcLandSegmentClear(p.x, p.z, p.x, p.z, entry.radius)) return false;
      // Recovery already rebuilt this rig from the logical snapshot. Prove the
      // complete static pose against the real terrain and per-part prop sweeps,
      // including the assigned screen/held-equipment contact exceptions. Do
      // not move an obstructed actor, discard its reservation or advance AI.
      return entry.gorilla.climbPoseClear(2, p.x, p.y, p.z, entry.heading, entry.motion,
        g.island.solidAt, clear.clankerClimbTransitionClear, entry, 0, true,
        entry.lounge, null, 0, g.island.hullClearAt, null, null, entry.biped,
        entry.jump.active || entry.drive.airborne && !entry.drive.passiveFall);
    },
  };
}
