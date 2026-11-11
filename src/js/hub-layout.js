// Authored terrain options shared by the browser and private host startup.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const PILE_POST_DEGREES = [315, 78, 195];
  const BUILD_DEGREES = [12, 40, 66, 80, 110, 165, 195, 212, 282, 297, 312, 340];
  const NUDGES = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const DEG = Math.PI / 180;
  const polar = (deg, r) => ({ x: Math.sin(deg * DEG) * r, z: -Math.cos(deg * DEG) * r });
  const free = (claimed, x, z, r) => {
    for (const c of claimed) {
      const dx = c.x - x, dz = c.z - z, reach = c.r + r;
      if (Number.isFinite(reach) && reach >= 0
        && (Math.abs(dx) > reach + 1e-12 || Math.abs(dz) > reach + 1e-12)) continue;
      if (Math.hypot(dx, dz) < reach) return false;
    }
    return true;
  };
  const nearPath = (island, x, z, d) => {
    if (island.isPath(x, z)) return true;
    for (let i = 0; i < 16; i++) {
      const c = Math.cos(i / 16 * Math.PI * 2), s = Math.sin(i / 16 * Math.PI * 2);
      if (island.isPath(x + c * d, z + s * d) || island.isPath(x + c * d / 2, z + s * d / 2)) return true;
    }
    return false;
  };
  const pilePostCorridorClear = (x, z, radius) => {
    for (const degrees of PILE_POST_DEGREES) {
      const s = Math.sin(degrees * DEG), c = Math.cos(degrees * DEG);
      if (x * s - z * c > 0 && Math.abs(x * c + z * s) < radius + 0.7) return false;
    }
    return true;
  };
  const spotAt = (island, claimed, deg, r, margin) => {
    for (const off of NUDGES) {
      const p = polar(deg + off, r);
      if (!nearPath(island, p.x, p.z, margin) && island.surfaceAt(p.x, p.z) === 0
        && pilePostCorridorClear(p.x, p.z, margin) && free(claimed, p.x, p.z, margin)) return p;
    }
    return null;
  };
  const pilePostRadius = island => {
    let radius = island.path.debug.ringOuterRadius + 0.8;
    for (; radius < 22 - 0.7; radius += island.pathUnit) {
      let clear = true;
      for (const degrees of PILE_POST_DEGREES) {
        const p = polar(degrees, radius);
        if (!island.isGrassAt(p.x, p.z) || island.path.overlaps(p.x, p.z, 0.36)) { clear = false; break; }
      }
      if (clear) break;
    }
    return radius;
  };
  const entranceClear = (zones, x, z, radius) => {
    for (const zone of zones) {
      const dx = x - zone.x, dz = z - zone.z;
      if (Math.abs(dx * zone.cr - dz * zone.sr) < 4 + radius
        && dx * zone.sr + dz * zone.cr < 7 + radius) return false;
    }
    return true;
  };
  const workSceneryClear = (zones, count, x, z, radius) => {
    const row = Math.max(0, Math.min(2, Math.ceil(count / 4)) - 1);
    const front = 4.8 + row * 1.35 + 4.15 * 0.32, margin = radius + 0.3;
    for (const zone of zones) {
      const dx = x - zone.x, dz = z - zone.z;
      const across = Math.abs(dx * zone.cr - dz * zone.sr), along = dx * zone.sr + dz * zone.cr;
      if (across < 4.15 + margin && along > 2.8 - margin && along < front + margin) return false;
    }
    return true;
  };
  const LIBRARY = (() => {
    const bearing = 227 * Math.PI / 180, radius = 20.75;
    // Match the side of the Headquarters bluff, parallel to its 10:15 tunnel axis, rather than aiming at the pile.
    // The terrain cut, shelving and picks all share this frame.
    const ry = Math.PI / 2 - 10.25 / 12 * Math.PI * 2;
    return {
      x: Math.sin(bearing) * radius, z: -Math.cos(bearing) * radius, ry,
      floor: 0.25, width: 5.4, depth: 0.78, height: 3.3, entry: 1.1, reach: 3.25
    };
  })();
  BL.hubLayout = {
    buildDegrees: BUILD_DEGREES, buildRadius: 13, pilePostDegrees: PILE_POST_DEGREES,
    free, nearPath, pilePostCorridorClear, spotAt, pilePostRadius, polar, entranceClear, workSceneryClear,
    library: LIBRARY,
    jumbotron: { x: 0, z: 28.5, scale: 2.6, sink: 0.06, lift: 1.62, reach: 3.8 },
    terrainOptions(slots) {
      const factory = slots.find(slot => slot.status === "open" && slot.scene === "factory");
      return { seed: 1, roofHole: factory ? { id: factory.id, ...BL.factoryModels.ROOF_TUBE } : null, nook: LIBRARY };
    }
  };
})();
