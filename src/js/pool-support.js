// Mempool island footing and rock queries in the authored island frame.
// Browser water comes from its hydrology controller. Explicit land-only hosts
// expose static footing and no water support; they never guess a lake level.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ island, site, place, water, landOnly = false, step: STEP_MAX }) => {
    const L = BL.poolLayout, S = BL.poolModels.SITE;
    if (!place || ![place.x, place.y, place.z, place.ry, STEP_MAX].every(Number.isFinite) || STEP_MAX < 0
      || typeof landOnly !== "boolean" || !landOnly && typeof water?.levelAt !== "function" || typeof island?.onLand !== "function"
      || typeof island?.surfaceAt !== "function" || !site?.ground?.geometry?.cutawaySource)
      throw Error("Mempool island support providers required");
    const waterLevelAt = landOnly ? () => -Infinity : (x, z) => water.levelAt(x, z);
    const cos = Math.cos(place.ry), sin = Math.sin(place.ry);
    const localX = (wx, wz) => (wx - place.x) * cos - (wz - place.z) * sin;
    const localZ = (wx, wz) => (wx - place.x) * sin + (wz - place.z) * cos;
    const groundAt = (gx, gz) => {
      const lx = localX(gx, gz), lz = localZ(gx, gz), r = Math.hypot(lx, lz);
      if (r < S.reach) {
        const ground = r < L.LAKE_R ? L.membraneY(r) : L.groundAt(lx, lz);
        if (ground > -Infinity) return place.y + Math.max(ground, waterLevelAt(lx, lz));
      }
      return island.onLand(gx, gz) ? island.surfaceAt(gx, gz) : -Infinity;
    };
    const overAt = (wx, wz, margin = 0) => {
      const dx = wx - place.x, dz = wz - place.z;
      return dx * dx + dz * dz < S.reach * S.reach && L.onIsland(localX(wx, wz), localZ(wx, wz), margin);
    };
    const coveredAt = (wx, wy, wz) => {
      const dx = wx - place.x, dz = wz - place.z;
      return dx * dx + dz * dz < S.reach * S.reach && L.covered(localX(wx, wz), wy - place.y, localZ(wx, wz));
    };
    // Where the water carries a body whose feet are at `y`: `draught` under the surface, wherever that is clear
    // of the bed. Only for someone in the water itself, so a walker in the chamber under the lake stays on its
    // floor; and never more than `rise` above standing feet in one step, so rising water lifts a body, never throws it.
    const floatAt = (wx, wz, y, rise, draught) => {
      const dx = wx - place.x, dz = wz - place.z;
      if (dx * dx + dz * dz > S.reach * S.reach) return -Infinity;
      const lx = localX(wx, wz), lz = localZ(wx, wz), level = waterLevelAt(lx, lz);
      if (level === -Infinity) return -Infinity;
      const r = Math.hypot(lx, lz), feet = y - place.y;
      // A shore cell whose centre lies inside the lake reports the chamber floor. That lower room is
      // not part of the water volume: use the shore/channel bed as its minimum outside the curved bowl.
      const bed = r < L.LAKE_R ? L.membraneY(r)
        : Math.max(r < L.RING.shore ? L.LEVEL.shore : L.LEVEL.bed, L.groundAt(lx, lz));
      if (feet < bed - STEP_MAX || level - draught <= bed) return -Infinity;
      // A body standing deeper than a step under where it would float is lifted a step at a time; one falling
      // in lands at its float.
      const up = level - draught;
      return place.y + (rise > 0 && up > feet + rise ? feet + rise : up);
    };
    // Whether a point of the water's surface is over someone: for the pose, not the footing.
    const afloat = (wx, wz, y, draught) => {
      const dx = wx - place.x, dz = wz - place.z;
      if (dx * dx + dz * dz > S.reach * S.reach) return false;
      const level = waterLevelAt(localX(wx, wz), localZ(wx, wz));
      return level > -Infinity && Math.abs(y - place.y - (level - draught)) < 0.12;
    };
    const sightClear = (ax, ay, az, bx, by, bz) => L.sightClear(localX(ax, az), ay - place.y, localZ(ax, az), localX(bx, bz), by - place.y, localZ(bx, bz));
    const solidAt = (wx, wy, wz) => L.solidAt(localX(wx, wz), wy - place.y, localZ(wx, wz));
    // The camera's near-plane rock fill uses the same voxels and palette as the visible island shell.
    const rockSource = site.ground.geometry.cutawaySource;
    const rockMaterialAt = (wx, wy, wz) => {
      const i = Math.floor((localX(wx, wz) - L.ORIGIN.x) / L.UNIT);
      const j = Math.floor((wy - place.y - L.ORIGIN.y) / L.UNIT);
      const k = Math.floor((localZ(wx, wz) - L.ORIGIN.z) / L.UNIT);
      return i < 0 || j < 0 || k < 0 || i >= L.SX || j >= L.SY || k >= L.SZ ? null
        : rockSource.palette[rockSource.data[(i * L.SY + j) * L.SZ + k]] || null;
    };
    const turned = Math.abs(cos), across = Math.abs(sin);
    const boxIn = (test) => (minX, minY, minZ, maxX, maxY, maxZ) => {
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = (maxX - minX) / 2, hz = (maxZ - minZ) / 2;
      const lx = localX(cx, cz), lz = localZ(cx, cz), rx = turned * hx + across * hz, rz = across * hx + turned * hz;
      return test(lx - rx, minY - place.y, lz - rz, lx + rx, maxY - place.y, lz + rz);
    };
    const boxSolid = boxIn(L.boxSolid), boxClear = boxIn(L.boxClear);
    return { groundAt, overAt, coveredAt, floatAt, afloat, sightClear, solidAt, rockMaterialAt, boxSolid, boxClear };
  };
  BL.poolSupport = { create };
})();
