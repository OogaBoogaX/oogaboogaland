import { createNpcRoutineDestinations, hubFireSeatsAt, hubSlots, hubCaveLayout } from './ooga-crew.js';

export function createHubWorldDestinations({ geometry, getCrew, roster, execution, stars, navigation }) {
  if (!geometry?.firePosition || typeof geometry.free !== 'function' || typeof stars !== 'function'
    || roster?.authoritative !== true || execution?.version !== 1 || !navigation?.navigation)
    throw Error('actual Hub routine layout and clock required');
  const island = geometry.island, fireSeats = hubFireSeatsAt(geometry.firePosition, roster.activeRoster.length, []);
  const result = createNpcRoutineDestinations({ getCrew, getIsland: () => island,
    getRosterCount: () => roster.activeRoster.length, slots: hubSlots,
    getStars: () => {
      const value = stars();
      if (!Number.isFinite(value) || value < 0 || value > 1) throw Error('invalid Hub stars');
      return value;
    }, getOutside: () => null, random: execution.random, spots: geometry.ladder ? [{ ...geometry.ladder.spot }] : [], chillSpots: [], fireSeats,
    free: geometry.free, nearMouth: (x, z, distance) => island.mouths.some(m => Math.hypot(x - m.x, z - m.z) < distance),
    mirrorClosed: hubCaveLayout.MIRROR_GATE_CLOSED,
    npcClosedCaveAt: geometry.cavePhysics.npcClosedCaveAt,
    npcRampRoofAt: navigation.navigation.npcRampRoofAt, npcWorkZoneAt: navigation.navigation.npcWorkZoneAt,
    npcFireClear: navigation.navigation.npcFireClear, npcPileAt: navigation.npcPileAt,
    walkable: navigation.ooga.walkable, physicalClearAt: navigation.physicalClearAt,
    propSegmentClear: navigation.propSegmentClear });
  result.buildSpots();
  return { wanderSpot: result.wanderSpot, npcRecoverySpot: result.npcRecoverySpot };
}
