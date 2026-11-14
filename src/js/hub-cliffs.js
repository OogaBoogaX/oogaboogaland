// The hub's rope routes share crew's ladder controls. Geometry is built once per
// visit; their bounded path records need no frame work or room messages.
(() => {
  "use strict";
  const BL = window.BL, { clamp, lerp } = BL.math, { beam, merge, box } = BL.models;
  const ROPE = "#b89a64", KNOT = "#715331", WOOD = "#765334";
  const pointAt = function (feet, out) {
    const t = clamp((feet - this.bottom) / (this.bend - this.bottom), 0, 1);
    const radius = lerp(this.bottomRadius, this.radius, t);
    out.x = this.nx * radius; out.z = this.nz * radius;
    return out;
  };
  const create = (island, landingClear, supportRadius, step) => {
    const layout = BL.terrain.CLIFF_LEDGES, routes = [], upper = layout.levels[0], lower = layout.levels[1];
    const add = (degrees, rope) => {
      let angle = degrees * Math.PI / 180, nx = Math.sin(angle), nz = -Math.cos(angle);
      let radius = layout.landingRadius, top = upper.floor, inset = 1.05;
      if (rope) {
        // Search only inside this rope's rock landing, after seeded scenery. A
        // blocked anchor is skipped, never cleared by moving an existing prop.
        let found = false;
        for (const offset of [0, 2, -2, 4, -4]) {
          angle = (degrees + offset) * Math.PI / 180; nx = Math.sin(angle); nz = -Math.cos(angle);
          let edge = 28;
          for (let r = 28; r <= 30.5; r += 0.125) if (island.surfaceAt(nx * r, nz * r) >= 0) edge = r;
          // The untouched top is stepped. A centre-cell height alone rejects
          // otherwise safe landings beside a quarter-metre step; use the same
          // footprint support as walking, then require full body clearance.
          for (let setback = 0.65; setback <= 1.65; setback += 0.25) {
            const landing = edge - setback, x = nx * landing, z = nz * landing;
            const surface = island.surfaceAt(x, z), y = island.supportAt(x, z, surface, step, -120, supportRadius);
            if (!Number.isFinite(y) || y < 0 || !island.clearAt(x, y + 0.01, z, 0.5, 2.5)
              || landingClear && !landingClear(x, z, 0.6)) continue;
            radius = edge + 0.45; top = y; inset = radius - landing; found = true; break;
          }
          if (found) break;
        }
        if (!found) return;
      }
      if (!rope) {
        // The rope must hang outside the landing, not through its rock pad.
        let edge = upper.outer;
        for (let r = upper.outer; r <= 33; r += 0.125) if (Math.abs(island.supportAt(nx * r, nz * r, upper.floor, 0.05, -120) - upper.floor) < 1e-6) edge = r;
        radius = edge + 0.45; inset = 1.1;
      }
      const bottom = rope ? upper.floor : lower.floor, bottomRadius = rope ? radius : 26.65;
      const route = { kind: rope ? "rope" : "ladder", nx, nz, x: nx * radius, z: nz * radius, radius, bottomRadius,
        bottom, top, bend: rope ? top : top - 3, width: rope ? 1 : 1.2, inset, topAnchor: rope, pathAt: pointAt, pathSpeed: rope ? 1 : 0.45 };
      const parts = [], a = {}, b = {}, width = rope ? 0 : 0.45;
      route.pathAt(bottom, a);
      for (const side of rope ? [0] : [-1, 1]) {
        const dx = nz * width * side, dz = -nx * width * side;
        parts.push(beam(a.x + dx, bottom + 0.1, a.z + dz, a.x + dx, bottom + 0.9, a.z + dz, 0.065, ROPE));
      }
      if (!rope) for (const rise of [0.2, 0.5]) parts.push(beam(a.x - nz * width, bottom + rise, a.z + nx * width, a.x + nz * width, bottom + rise, a.z - nx * width, 0.095, WOOD));
      const count = Math.ceil((top - bottom) / 0.3);
      for (let i = 0; i < count; i++) {
        const y = lerp(bottom, top, i / count), next = lerp(bottom, top, (i + 1) / count);
        route.pathAt(y, a); route.pathAt(next, b);
        for (const side of rope ? [0] : [-1, 1]) {
          const dx = nz * width * side, dz = -nx * width * side;
          parts.push(beam(a.x + dx, y + 0.9, a.z + dz, b.x + dx, next + 0.9, b.z + dz, 0.065, ROPE));
        }
        if (!rope) parts.push(beam(a.x - nz * width, y + 0.9, a.z + nx * width, a.x + nz * width, y + 0.9, a.z - nx * width, 0.095, WOOD));
        else if (!(i % 2)) parts.push(box({ w: 0.12, h: 0.11, d: 0.12, color: KNOT, offset: { x: a.x, y: y + 0.9, z: a.z } }));
      }
      // A short lash reaches a low timber stake on the existing upper landing.
      const anchorX = route.x - nx * inset, anchorZ = route.z - nz * inset;
      parts.push(beam(route.x, top + 0.9, route.z, anchorX, top + 0.45, anchorZ, 0.075, ROPE));
      parts.push(beam(anchorX, top - 0.1, anchorZ, anchorX, top + 0.65, anchorZ, 0.15, WOOD));
      routes.push({ route, geometry: merge(...parts) });
    };
    for (const degrees of layout.ropes) add(degrees, true);
    for (const degrees of layout.ladders) add(degrees, false);
    return routes;
  };
  BL.hubCliffs = { create };
})();
