// Source Hub walking and flight rules; the world and actor policy are explicit.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const cylinderSegmentClear = (x, y, z, toX, toY, toZ, radius, height, cx, cz, bottom, top, solidRadius) => {
    const dy = toY - y;
    let lo = 0, hi = 1;
    if (dy) {
      const a = (bottom - height + 1e-7 - y) / dy, b = (top - 1e-7 - y) / dy;
      lo = Math.max(0, Math.min(a, b)); hi = Math.min(1, Math.max(a, b));
      if (hi < lo) return true;
    } else if (y >= top - 1e-7 || y + height <= bottom + 1e-7) return true;
    const dx = toX - x, dz = toZ - z, length = dx * dx + dz * dz;
    // Actors can arrive at a shared spawn or be placed by a pointer.
    // Let an existing overlap separate, while still rejecting any move farther in.
    const startDistance = (x - cx) ** 2 + (z - cz) ** 2, endDistance = (toX - cx) ** 2 + (toZ - cz) ** 2;
    if (y < top - 1e-7 && y + height > bottom + 1e-7
      && startDistance < (radius + solidRadius) ** 2 && endDistance > startDistance + 1e-9 && (x - cx) * dx + (z - cz) * dz >= 0) return true;
    const t = length ? Math.max(lo, Math.min(hi, ((cx - x) * dx + (cz - z) * dz) / length)) : lo;
    const ox = x + dx * t - cx, oz = z + dz * t - cz, reach = radius + solidRadius;
    return ox * ox + oz * oz >= reach * reach - 1e-8;
  };
  const create = ({ worldBound, crossesSealedCave, playerSupportAt, characterClankerSupportAt,
    ceilingAt, physicalClearAt, propSegmentClear, matrixGateSegmentClear,
    mirrorActorSegmentClear, playerEscapeClear, bedSegmentClear, getDefaultActor,
    radius: PLAYER_RADIUS, step: STEP_MAX }) => {
    if (![worldBound, crossesSealedCave, playerSupportAt, characterClankerSupportAt,
      ceilingAt, physicalClearAt, propSegmentClear, matrixGateSegmentClear,
      mirrorActorSegmentClear, playerEscapeClear, bedSegmentClear, getDefaultActor].every(fn => typeof fn === "function")
      || !Number.isFinite(PLAYER_RADIUS) || PLAYER_RADIUS <= 0 || !Number.isFinite(STEP_MAX) || STEP_MAX < 0)
      throw Error("complete Hub locomotion providers required");
  const walkable = (fromX, fromZ, toX, toZ, y, height = 1.5, actor = getDefaultActor()) => {
    if (Math.hypot(toX, toZ) > worldBound() || crossesSealedCave(fromX, fromZ, toX, toZ, y)) return false;
    const floor = playerSupportAt(toX, toZ, y, y, actor), feet = Math.max(y, floor);
    if (floor - y > STEP_MAX && floor !== characterClankerSupportAt(toX, toZ, y, STEP_MAX, actor)) return false;
    // Feet may mount ordinary steps, including the banana platform's low rim.
    // Torso and head must fit across their whole footprint at the destination's actual elevation.
    return feet + height <= ceilingAt(toX, toZ, feet, actor) + 1e-7 && physicalClearAt(toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && propSegmentClear(fromX, feet + STEP_MAX, fromZ, toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && matrixGateSegmentClear(fromX, y, fromZ, toX, feet, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, feet, toZ, height, actor)
      || feet === y && playerEscapeClear(fromX, fromZ, toX, toZ, y, height, actor, STEP_MAX);
  };
  const flyable = (fromX, fromZ, toX, toZ, y = 0, height = 1.5, actor = getDefaultActor()) => (Math.hypot(toX, toZ) <= worldBound() || actor?.leap?.thrown) && !crossesSealedCave(fromX, fromZ, toX, toZ, y)
    && (y + height <= ceilingAt(toX, toZ, y, actor) + 1e-7 && physicalClearAt(toX, y, toZ, PLAYER_RADIUS, height, actor) && propSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height, actor) && bedSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && matrixGateSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, y, toZ, height, actor)
      || playerEscapeClear(fromX, fromZ, toX, toZ, y, height, actor, 0));
    return { walkable, flyable };
  };
  BL.hubLocomotion = { create, cylinderSegmentClear };
})();
