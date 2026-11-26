// The Ember Den's cast-metal Charging Bull, after Arturo Di Modica's Wall Street sculpture.
// Model space faces +x. The weight is on the planted foreleg, with the opposite hoof drawn back.
(() => {
  "use strict";
  const BL = window.BL,
    M = BL.models,
    rgb = BL.math.hexToRgb;
  const ORANGE = rgb("#f7931a"),
    COPPER = rgb("#d16a17"),
    POLISH = rgb("#ffa849"),
    CREASE = rgb("#74340f");

  // Sculpt the barrel, brisket, bent legs and muscles as a single skin. Each ellipsoid touches only its
  // own grid bounds. The zero crossing of an edge is shared by its four neighbouring surface cells.
  const casting = lite => {
    const step = lite ? 0.088 : 0.052,
      ox = -2.4,
      oy = -0.15,
      oz = -1.4;
    const nx = Math.ceil(4.9 / step),
      ny = Math.ceil(3.4 / step),
      nz = Math.ceil(2.8 / step),
      plane = nx * ny;
    const field = new Float32Array(plane * nz).fill(1);
    // rx follows the long axis in the xy plane, tilted by 'a' about z.
    const clay = (cx, cy, cz, rx, ry, rz, a = 0, blend = 0.115, hollow = false) => {
      const c = Math.cos(a),
        s = Math.sin(a),
        scale = Math.min(rx, ry, rz);
      const pad = 1 + (blend + step * 2) / scale;
      const ex = Math.hypot(c * rx, s * ry) * pad,
        ey = Math.hypot(s * rx, c * ry) * pad,
        ez = rz * pad;
      const bounds = (mid, ext, origin, size) => [
        Math.max(0, Math.floor((mid - ext - origin) / step)),
        Math.min(size - 1, Math.ceil((mid + ext - origin) / step))
      ];
      const [xl, xh] = bounds(cx, ex, ox, nx),
        [yl, yh] = bounds(cy, ey, oy, ny),
        [zl, zh] = bounds(cz, ez, oz, nz);
      for (let z = zl; z <= zh; z++)
        for (let y = yl; y <= yh; y++) {
          const dz = (oz + z * step - cz) / rz,
            dy = oy + y * step - cy;
          for (let x = xl; x <= xh; x++) {
            const dx = ox + x * step - cx,
              u = (dx * c + dy * s) / rx,
              v = (dy * c - dx * s) / ry;
            const d = (Math.sqrt(u * u + v * v + dz * dz) - 1) * scale,
              i = x + y * nx + z * plane;
            const prev = hollow ? -field[i] : field[i],
              h = Math.max(blend - Math.abs(d - prev), 0);
            const joined = Math.min(prev, d) - (h * h) / (4 * blend);
            field[i] = hollow ? -joined : joined;
          }
        }
    };
    clay(-0.25, 1.5, -0.04, 1.32, 0.61, 0.5, -0.04);
    clay(-1.04, 1.53, -0.13, 0.74, 0.71, 0.56, 0.14);
    clay(0.49, 1.62, 0.065, 0.78, 0.91, 0.65, -0.2);
    clay(0.99, 1.45, 0.09, 0.74, 0.57, 0.48, -0.71);
    clay(1.45, 1.13, 0.13, 0.5, 0.45, 0.41, -0.71);
    clay(1.71, 0.91, 0.14, 0.47, 0.265, 0.3, -0.66);
    clay(1.93, 0.76, 0.145, 0.26, 0.2, 0.315, -0.32, 0.065);
    clay(1.77, 0.69, 0.14, 0.3, 0.14, 0.25, -0.38, 0.06);
    clay(0.92, 1.04, 0.07, 0.49, 0.18, 0.16, -0.8);
    for (const side of [-1, 1]) {
      const f = side > 0 ? 0.2 : -0.37,
        h = side > 0 ? -0.2 : 0.18;
      clay(0.82, 1.68, 0.07 + side * 0.46, 0.52, 0.15, 0.18, -0.63, 0.055);
      clay(-0.79, 1.62, -0.09 + side * 0.45, 0.49, 0.19, 0.14, 1.05, 0.065);
      clay(1.44, 1.01, 0.14 + side * 0.31, 0.28, 0.16, 0.14, -0.64, 0.06);
      clay(1.95, 0.76, 0.145 + side * 0.19, 0.223, 0.17, 0.161, -0.34, 0.04);
      // Scapula, triceps, and the taut extensor above the split hoof.
      clay(0.48, 1.7, 0.075 + side * 0.4, 0.74, 0.31, 0.29, -0.91);
      clay(0.48, 1.14, side * 0.44, 0.52, 0.235, 0.215, 1.23);
      clay(0.54 + f * 0.43, 0.74, side * 0.48, 0.44, 0.148, 0.142, 1.36 - f * 1.4);
      clay(0.6 + f * 0.7, 0.5, side * 0.5, 0.165, 0.16, 0.15);
      clay(0.64 + f, 0.3, side * 0.52, 0.28, 0.092, 0.105, 1.69 + f);
      // The thigh sweeps forward to the stifle, back to the hock, then down onto the pastern.
      clay(-1.03, 1.52, -0.1 + side * 0.36, 0.69, 0.37, 0.3, 1.28);
      clay(-1.0 + h * 0.4, 1.08, -0.1 + side * 0.39, 0.55, 0.255, 0.21, 1.93);
      clay(-1.14 + h, 0.74, -0.1 + side * 0.43, 0.45, 0.145, 0.15, 0.87);
      clay(-1.41 + h, 0.49, -0.1 + side * 0.45, 0.17, 0.115, 0.13, 1.18);
      clay(-1.4 + h, 0.29, -0.1 + side * 0.46, 0.26, 0.086, 0.1, 1.49);
      clay(1.51, 1.17, 0.13 + side * 0.3, 0.245, 0.116, 0.135, -0.44, 0.055);
      clay(2.12, 0.82, 0.145 + side * 0.17, 0.11, 0.069, 0.073, -0.43, 0.024, true);
    }
    const g = M.geometry(),
      // A quad reads back at most one z plane and one row from its current surface cell.
      cells = new Int32Array(plane + nx + 1),
      strides = [1, nx, plane];
    const corners = [0, 1, nx, nx + 1, plane, plane + 1, plane + nx, plane + nx + 1];
    for (let z = 0; z < nz - 1; z++)
      for (let y = 0; y < ny - 1; y++)
        for (let x = 0; x < nx - 1; x++) {
          const i = x + y * nx + z * plane,
            inside = field[i] < 0;
          let corner = 1;
          while (corner < 8 && (field[i + corners[corner]] < 0) === inside) corner++;
          if (corner === 8) continue;
          let px = 0,
            py = 0,
            pz = 0,
            hits = 0;
          for (let k = 0; k < 8; k++)
            for (let a = 0; a < 3; a++) {
              if (k & (1 << a)) continue;
              const d = field[i + corners[k]],
                next = field[i + corners[k] + strides[a]];
              if (d < 0 === next < 0) continue;
              const t = d / (d - next);
              px += (k & 1) + (a === 0 ? t : 0);
              py += ((k >> 1) & 1) + (a === 1 ? t : 0);
              pz += (k >> 2) + (a === 2 ? t : 0);
              hits++;
            }
          cells[i % cells.length] = M.pushVert(g, ox + (x + px / hits) * step, oy + (y + py / hits) * step, oz + (z + pz / hits) * step);
          for (let a = 0; a < 3; a++) {
            if (field[i + strides[a]] < 0 === inside) continue;
            const u = strides[(a + 1) % 3],
              v = strides[(a + 2) % 3];
            const quad = [cells[i % cells.length], cells[(i - u) % cells.length], cells[(i - u - v) % cells.length], cells[(i - v) % cells.length]];
            M.face(g, inside ? quad : quad.reverse(), ORANGE);
          }
        }
    return g;
  };

  // A taper swept along a cubic centreline gives the horns their continuous change in curvature,
  // and the lashed tail, ears and brow folds a silhouette even across the room.
  const detail = (g, knots, color, axis, steps, sides) => {
    const rings = [];
    const point = (i, t) => {
      const a = knots[Math.max(0, i - 1)],
        b = knots[i],
        c = knots[i + 1],
        d = knots[Math.min(knots.length - 1, i + 2)];
      return b.map((v, j) => v + 0.5 * t * (c[j] - a[j] + t * (2 * a[j] - 5 * v + 4 * c[j] - d[j] + t * (3 * v - 3 * c[j] + d[j] - a[j]))));
    };
    for (let k = 0; k <= (knots.length - 1) * steps; k++) {
      const i = Math.min(knots.length - 2, Math.floor(k / steps)),
        t = k / steps - i;
      const p = point(i, t),
        prev = point(i, t - 0.002),
        next = point(i, t + 0.002);
      const tangent = next.slice(0, 3).map((v, j) => v - prev[j]),
        len = Math.hypot(...tangent);
      const [tx, ty, tz] = tangent.map(v => v / len);
      let ax = axis[0],
        ay = axis[1],
        az = axis[2],
        dot = ax * tx + ay * ty + az * tz;
      ax -= dot * tx;
      ay -= dot * ty;
      az -= dot * tz;
      const mag = Math.hypot(ax, ay, az);
      ax /= mag;
      ay /= mag;
      az /= mag;
      const bx = ty * az - tz * ay,
        by = tz * ax - tx * az,
        bz = tx * ay - ty * ax,
        row = [];
      for (let j = 0; j < sides; j++) {
        const angle = (j * 2 * Math.PI) / sides,
          a = Math.cos(angle) * Math.max(0.001, p[3]),
          b = Math.sin(angle) * Math.max(0.001, p[4]);
        row.push(M.pushVert(g, p[0] + a * ax + b * bx, p[1] + a * ay + b * by, p[2] + a * az + b * bz));
      }
      const last = rings[rings.length - 1];
      if (last)
        for (let j = 0; j < sides; j++) {
          const n = (j + 1) % sides;
          M.face(g, [last[j], last[n], row[n], row[j]], color);
        }
      rings.push(row);
    }
    M.face(g, rings[0].slice().reverse(), color);
    M.face(g, rings[rings.length - 1], color);
  };

  const build = lite => {
    const g = casting(lite),
      steps = lite ? 2 : 4,
      sides = lite ? 8 : 14;
    const along = (knots, color, axis) => detail(g, knots, color, axis, steps, sides);
    for (const side of [-1, 1]) {
      // Curl outward from the poll, up and forward, with the polished tips above the forehead.
      const paired = (rows, color, axis) => along(rows.map(([x, y, z, a, b]) => [x, y, 0.14 + side * z, a, b]), color, axis);
      paired(
        [
          [1.38, 1.44, 0.2, 0.19, 0.18],
          [1.42, 1.45, 0.43, 0.16, 0.15],
          [1.47, 1.49, 0.65, 0.119, 0.117],
          [1.55, 1.63, 0.87, 0.081, 0.083],
          [1.67, 1.83, 0.96, 0.039, 0.04],
          [1.79, 1.99, 0.94, 0.002, 0.002]
        ],
        POLISH,
        [1, 0, 0]
      );
      paired(
        [[1.24, 1.36, 0.27, 0.07, 0.07], [1.18, 1.33, 0.46, 0.16, 0.066], [1.1, 1.32, 0.62, 0.13, 0.054], [1.02, 1.36, 0.7, 0.008, 0.008]],
        COPPER,
        [1, 0, 0]
      );
      paired(
        [[1.48, 1.25, 0.331, 0.018, 0.019], [1.56, 1.23, 0.356, 0.065, 0.035], [1.64, 1.18, 0.351, 0.03, 0.027], [1.69, 1.15, 0.322, 0.005, 0.008]],
        CREASE,
        [0, 1, 0]
      );
      paired(
        [[1.45, 1.26, 0.331, 0.009, 0.01], [1.53, 1.285, 0.362, 0.035, 0.034], [1.64, 1.227, 0.358, 0.03, 0.027], [1.7, 1.174, 0.322, 0.005, 0.008]],
        COPPER,
        [0, 1, 0]
      );
      paired([[1.76,0.745,0.256,0.006,0.005],[1.90,0.672,0.302,0.014,0.012],[2.038,0.647,0.269,0.014,0.011],[2.14,0.668,0.185,0.003,0.005]],CREASE,[0,1,0]);
      // Cloven hooves: two separately cast toes, flattened at the bottom against the marble.
      for (const [x, z] of [[0.64 + (side > 0 ? 0.2 : -0.37), side * 0.52], [-1.4 + (side > 0 ? -0.2 : 0.18), -0.1 + side * 0.46]]) {
        for (const toe of [-1, 1]) {
          const zz = z + toe * 0.058;
          along(
            [
              [x - 0.08, 0.08, zz, 0.049, 0.063],
              [x, 0.098, zz, 0.064, 0.097],
              [x + 0.105, 0.078, zz + toe * 0.009, 0.064, 0.077],
              [x + 0.17, 0.046, zz + toe * 0.011, 0.043, 0.045]
            ],
            COPPER,
            [0, 0, 1]
          );
        }
      }
    }
    along(
      [
        [-1.48, 1.9, -0.15, 0.13, 0.12],
        [-1.72, 2.01, -0.19, 0.091, 0.086],
        [-1.9, 2.26, -0.17, 0.073, 0.07],
        [-1.97, 2.57, -0.07, 0.061, 0.058],
        [-1.86, 2.8, 0.06, 0.055, 0.05],
        [-1.64, 2.86, 0.13, 0.06, 0.053],
        [-1.49, 2.72, 0.17, 0.096, 0.072],
        [-1.46, 2.55, 0.17, 0.076, 0.054],
        [-1.38, 2.44, 0.15, 0.005, 0.006]
      ],
      ORANGE,
      [0, 0, 1]
    );
    g.smooth = true;
    g.tintedMetal = 0.8;
    return g;
  };
  BL.pokerBull = { build };
})();
