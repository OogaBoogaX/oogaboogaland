// Geometry-only heap queries, shared by browser presentation and host navigation.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const TAU = Math.PI * 2, EPS = 1e-7;
  const create = (core, floor = core.position.y) => {
    const geometry = core.geometry, verts = geometry.verts;
    const segments = geometry.pileSegments, rings = geometry.pileRings;
    const ringRadius = (ring, sector, ux, uz) => {
      const a = (ring * segments + sector) * 3, b = (ring * segments + (sector + 1) % segments) * 3;
      return (verts[a] * verts[b + 2] - verts[a + 2] * verts[b])
        / (ux * (verts[b + 2] - verts[a + 2]) - uz * (verts[b] - verts[a]));
    };
    const triangleHeight = (a, b, c, x, z) => {
      a *= 3; b *= 3; c *= 3;
      const ax = verts[a], az = verts[a + 2], bx = verts[b] - ax, bz = verts[b + 2] - az;
      const cx = verts[c] - ax, cz = verts[c + 2] - az, dx = x - ax, dz = z - az;
      const det = bx * cz - bz * cx, u = (dx * cz - dz * cx) / det, v = (bx * dz - bz * dx) / det;
      return u >= -EPS && v >= -EPS && u + v <= 1 + EPS ? verts[a + 1] + u * (verts[b + 1] - verts[a + 1]) + v * (verts[c + 1] - verts[a + 1]) : NaN;
    };
    const heightAt = (x, z) => {
      if (!core.visible) return -Infinity;
      x = (x - core.position.x) / core.scale.x; z = (z - core.position.z) / core.scale.z;
      const radius = Math.hypot(x, z);
      if (radius > 1 + EPS) return -Infinity;
      if (radius < EPS) return core.position.y + verts[rings * segments * 3 + 1] * core.scale.y;
      const ux = x / radius, uz = z / radius;
      const sector = Math.min(segments - 1, Math.floor(((Math.atan2(z, x) + TAU) % TAU) / TAU * segments));
      if (radius > ringRadius(0, sector, ux, uz) + EPS) return -Infinity;
      let outer = 0, inner = rings;
      while (inner - outer > 1) {
        const middle = (outer + inner) >>> 1;
        if (radius <= ringRadius(middle, sector, ux, uz)) outer = middle; else inner = middle;
      }
      const next = (sector + 1) % segments, a = outer * segments + sector;
      let y;
      if (inner === rings) y = triangleHeight(a, rings * segments, outer * segments + next, x, z);
      else {
        y = triangleHeight(a, inner * segments + sector, inner * segments + next, x, z);
        if (Number.isNaN(y)) y = triangleHeight(a, inner * segments + next, outer * segments + next, x, z);
      }
      return Number.isNaN(y) ? -Infinity : core.position.y + y * core.scale.y;
    };
    const contains = (x, y, z) => core.visible && y >= floor && y <= heightAt(x, z);
    const intersectsBody = (x, feet, z, height) => {
      if (!core.visible || feet + height <= core.position.y || Math.hypot(x - core.position.x, z - core.position.z) > core.scale.x + 0.34) return false;
      for (let k = 0; k < 9; k++) if (heightAt(x + (k % 3 - 1) * 0.24, z + (Math.floor(k / 3) - 1) * 0.24) > feet + 0.04) return true;
      return false;
    };
    return { heightAt, contains, intersectsBody };
  };
  BL.bananaVolume = { create };
})();
