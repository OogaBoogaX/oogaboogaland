// Room 2, the Low Time Preference Temple: dusk over misty mountains drawn like an ink painting, a full moon rising
// beside the hall with cranes crossing and the first stars, and one quiet line under the moon with the latest block.
// Through a torii and up a stone path lined with lanterns and hedges to the main hall, where Satoshi sits on a Corten
// plinth under a scroll with an ensō: a life-size replica of Valentina Picozzi's statue in Lugano, made with her
// permission, its polished steel panels all but vanishing face on and closing into one seated figure from an angle. A
// tatami deck of cushions before it, incense smoking, a gong; a five-tier pagoda in a bamboo grove; a bell tower over
// an arched bridge across a koi pond with a waterfall; a raked rock garden; cherry and maple trees shedding petals.
// The bell rings once a block, and a tap rings it or the gong.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, CH = BL.timechainCharts, ROOMS = BL.timechainRooms;
  const { face, blank, ballGeo, UP, DOWN } = RM.helpers;
  const { merge, noShadow } = BL.models;
  const DEG = Math.PI / 180, TAU = Math.PI * 2;
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ---------- the statue ----------
  // A hooded figure sitting on the floor at a laptop, at life size in metres, facing -z with its seat on y 0: the trunk
  // slouched in one C-curve from seat to neck, shoulders 0.58 m up and 0.47 m across with the trapezius sloping up to a
  // neck 0.12 m thick, upper arms hanging 0.32 m straight down to elbows at the height of the knee tops, forearms
  // reaching forward to hands on the keys, thighs rising 15 degrees to knees that carry the laptop, shins crossing back
  // under them. The head is bowed 46 degrees over the screen, its face smooth inside a hood that drapes over the nape.
  // It is one smooth surface: every part a signed distance (negative inside), limbs tapering from joint to joint, each
  // part blending into its neighbours over a few centimetres, as a body in a hoodie does.
  const bound = (fn, cx, cy, cz, R) => Object.assign(fn, { cx, cy, cz, R });
  const ell = (cx, cy, cz, rx, ry, rz, p = 0, yw = 0) => {
    const yc = Math.cos(-yw), ys = Math.sin(-yw), pc = Math.cos(p), ps = Math.sin(p);
    return bound((x, y, z) => {
      let dx = x - cx, dy = y - cy, dz = z - cz;
      if (yw) { const nx = dx * yc + dz * ys; dz = -dx * ys + dz * yc; dx = nx; }
      if (p) { const ny = dy * pc - dz * ps; dz = dy * ps + dz * pc; dy = ny; }
      const ax = dx / rx, ay = dy / ry, az = dz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    }, cx, cy, cz, Math.max(rx, ry, rz));
  };
  // A limb: a cone with rounded ends, radius `ra` at a and `rb` at b.
  const limb = (ax, ay, az, ra, bx, by, bz, rb) => {
    const bax = bx - ax, bay = by - ay, baz = bz - az, l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / l2;
    return bound((x, y, z) => {
      const pax = x - ax, pay = y - ay, paz = z - az, yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy, x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2, k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra;
    }, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, Math.sqrt(l2) / 2 + Math.max(ra, rb));
  };
  const PARTS = [
    // The trunk, slouched as a man sits on the floor at a laptop: the pelvis tipped back and the spine one C-curve, its
    // lower back rounded and nearly upright, curving forward over the shoulder blades into the neck.
    ell(0, 0.11, 0.005, 0.18, 0.11, 0.13), ell(0, 0.22, 0, 0.165, 0.15, 0.13, 0.1), ell(0, 0.37, -0.025, 0.17, 0.14, 0.13, 0.2),
    ell(0, 0.47, -0.05, 0.175, 0.12, 0.13, 0.35), ell(0, 0.55, -0.065, 0.17, 0.08, 0.1, 0.6),
    // The shoulders: the deltoids and the trapezius sloping up to the neck.
    ell(0.185, 0.55, -0.14, 0.06, 0.065, 0.065), ell(-0.185, 0.55, -0.14, 0.06, 0.065, 0.065),
    limb(0.03, 0.64, -0.1, 0.05, 0.17, 0.585, -0.14, 0.045), limb(-0.03, 0.64, -0.1, 0.05, -0.17, 0.585, -0.14, 0.045),
    // The neck, head and hood, the hood's back draped over the nape and its collar round the neck.
    limb(0, 0.6, -0.11, 0.06, 0, 0.725, -0.211, 0.052),
    ell(0, 0.752, -0.268, 0.077, 0.1, 0.1, 0.8), ell(0, 0.682, -0.246, 0.056, 0.062, 0.064, 0.8),
    ell(0, 0.784, -0.251, 0.1, 0.125, 0.125, 0.8), limb(0, 0.74, -0.16, 0.055, 0, 0.6, -0.06, 0.06), ell(0, 0.65, -0.14, 0.11, 0.06, 0.09, 0.5),
    // The arms in their sleeves, and the hands flat on the keys.
    limb(0.19, 0.555, -0.14, 0.056, 0.21, 0.27, -0.15, 0.046), limb(-0.19, 0.555, -0.14, 0.056, -0.21, 0.27, -0.15, 0.046),
    limb(0.21, 0.27, -0.15, 0.046, 0.1, 0.29, -0.36, 0.036), limb(-0.21, 0.27, -0.15, 0.046, -0.1, 0.29, -0.36, 0.036),
    ell(0.08, 0.292, -0.41, 0.04, 0.016, 0.07, 0, -0.3), ell(-0.08, 0.292, -0.41, 0.04, 0.016, 0.07, 0, 0.3),
    // The legs: thighs tapering from hip to knee, shins from knee to ankle, crossing; the feet.
    limb(0.09, 0.1, 0, 0.085, 0.27, 0.21, -0.38, 0.06), limb(-0.09, 0.1, 0, 0.085, -0.27, 0.21, -0.38, 0.06),
    limb(0.27, 0.205, -0.38, 0.056, -0.13, 0.06, -0.3, 0.036), limb(-0.27, 0.205, -0.38, 0.056, 0.13, 0.06, -0.44, 0.036),
    ell(-0.22, 0.045, -0.36, 0.045, 0.04, 0.12, 0, 0.8), ell(0.21, 0.045, -0.5, 0.045, 0.04, 0.12, 0, -0.8)
  ];
  const BLEND = 0.045, smin = (a, b) => { const h = Math.max(BLEND - Math.abs(a - b), 0) / BLEND; return Math.min(a, b) - h * h * BLEND * 0.25; };
  // The laptop: its base on the knees and its screen tipped back, each a box (middle, half sizes, tilt about x).
  const LAPTOP = [[0, 0.272, -0.39, 0.22, 0.011, 0.15, 0], [0, 0.44, -0.572, 0.22, 0.16, 0.012, -0.2]].map((b) => [...b, Math.cos(-b[6]), Math.sin(-b[6])]);
  // Whether a point is in the body, given the parts that can reach it (`near`).
  const inside = (x, y, z, parts = PARTS) => {
    for (const [cx, cy, cz, hx, hy, hz, , c, s] of LAPTOP) { const dy = y - cy, dz = z - cz; if (Math.abs(x - cx) < hx && Math.abs(dy * c - dz * s) < hy && Math.abs(dy * s + dz * c) < hz) return true; }
    // Starting a little outside changes no answer, and lets every part farther than that be skipped.
    let d = 0.2;
    for (const f of parts) {
      const ex = x - f.cx, ey = y - f.cy, ez = z - f.cz;
      if (Math.sqrt(ex * ex + ey * ey + ez * ez) - f.R > d + BLEND) continue;
      d = smin(d, f(x, y, z));
      if (d < -BLEND) return true;
    }
    return d < 0;
  };
  // The parts that can reach the line along z through (x, y): any other is farther than `inside` ever looks, so
  // leaving it out changes no answer.
  const near = (x, y) => PARTS.filter((f) => Math.sqrt((x - f.cx) * (x - f.cx) + (y - f.cy) * (y - f.cy)) - f.R <= 0.2 + BLEND);
  // Upright steel panels across the figure's width, each one plate cut to the body's cross-section there, held apart
  // by small spacers in a brick pattern. The gaps are narrow beside the body's depth, so they line up only when looking
  // straight down them: face on the figure is mostly air between thin edges, and a few degrees off it the polished
  // faces overlap into a solid body, stepping in at the contours. The engine has no reflections, so each face carries
  // its look as its colour: how much light reaches it (deep in the gap behind the next panel almost none, beside a step
  // a little less, and under each step the shadow that panel throws from the hall's high lamps) times polished steel
  // reflecting the hall, the sky's cool light higher on the figure and the timber floor's warm dark lower down.
  const S = { N: 48, W: 0.76, thick: 0.0065, rowH: 0.009, dz: 0.005, Z0: -0.66, NZ: 193 };
  const ROWS = Math.ceil(0.9 / S.rowH);
  // The build pauses after every `occRows` rows of a panel's sampling, every panel's outlines and every panel's faces;
  // a step at the doorway runs as many of those pieces as fit in `BUDGET` milliseconds, a step a frame, so the island
  // keeps its frames. `STATUE_STEPS` is how many steps it can take at most.
  const CHUNK = { occRows: 20 }, BUDGET = 8;
  const STATUE_STEPS = S.N * Math.ceil(Math.ceil(0.9 / S.rowH) / CHUNK.occRows) + 2 * S.N + 1;
  // Polished steel and its cut edges (duller and warmer): what each reflects by its height on the figure, from the warm
  // timber floor low down through the paper walls to the cool sky at the hood, lighter on faces that look up at the
  // lamps and darker on those that look down at the floor. The faces glow a little, so the baked light reads however
  // the hall's lamps fall on them.
  const STEEL = { ramp: [[0, [124, 114, 106]], [0.3, [172, 164, 156]], [0.55, [160, 168, 182]], [0.9, [214, 222, 234]]], up: [236, 228, 212], down: [88, 72, 62], glow: 0.42 };
  const CUT = { ramp: [[0, [96, 84, 74]], [0.5, [140, 130, 120]], [0.9, [170, 160, 150]]], up: [196, 182, 164], down: [70, 58, 50], glow: 0.3 };
  const steelColor = (T, light, y, ny) => {
    const R = T.ramp, c = [0, 0, 0];
    let k = 0;
    while (k < R.length - 2 && y > R[k + 1][0]) k++;
    const t = Math.min(1, Math.max(0, (y - R[k][0]) / (R[k + 1][0] - R[k][0]))), a = R[k][1], b = R[k + 1][1];
    for (let n = 0; n < 3; n++) {
      let v = a[n] + (b[n] - a[n]) * t;
      v = ny > 0 ? v + (T.up[n] - v) * ny : v + (T.down[n] - v) * -ny;
      c[n] = Math.round(Math.min(255, v * light));
    }
    return c;
  };
  // The fine streaks of the brushing: each row of each panel a shade apart, the same every build.
  const brush = (i, r) => { let n = Math.imul(i * 977 + r * 131 + 7, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return 0.955 + 0.09 * ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const statueBuild = function* () {
    const { N, W, thick, rowH, dz, Z0, NZ } = S, rows = ROWS;
    const zb = (k) => Z0 - dz / 2 + k * dz, slatX = (i) => -W / 2 + (i + 0.5) * W / N, occ = [];
    for (let i = 0; i < N; i++) {
      const x = slatX(i), g = new Uint8Array(rows * NZ);
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * rowH, parts = near(x, y);
        for (let k = 0; k < NZ; k++) g[r * NZ + k] = inside(x, y, Z0 + k * dz, parts) ? 1 : 0;
        if (r % CHUNK.occRows === CHUNK.occRows - 1) yield;
      }
      occ.push(g);
    }
    const at = (j, r, k) => j >= 0 && j < N && r >= 0 && r < rows && k >= 0 && k < NZ && occ[j][r * NZ + k] === 1;
    const cellOf = (y, z) => [Math.floor(y / rowH + 1e-6), Math.floor((z - zb(0)) / dz + 1e-6)];
    const covered = (j, y, z) => { const [r, k] = cellOf(y, z); return at(j, r, k); };
    // The signed distance from a point to panel j's outline, negative inside it, looked for out to about 3.5 cm.
    const sdist = (j, y, z) => {
      const [r0, k0] = cellOf(y, z), inn = at(j, r0, k0);
      let best = 1;
      for (let r = r0 - 3; r <= r0 + 3; r++) {
        const ey = Math.max(0, Math.abs((r + 0.5) * rowH - y) - rowH / 2);
        if (ey * ey >= best) continue;
        for (let k = k0 - 7; k <= k0 + 7; k++) {
          if (at(j, r, k) === inn) continue;
          const ez = Math.max(0, Math.abs(zb(k) + dz / 2 - z) - dz / 2), d = ey * ey + ez * ez;
          if (d < best) best = d;
        }
      }
      return inn ? -Math.sqrt(best) : Math.sqrt(best);
    };
    // The lamps are above and in front of the figure; a panel 1.6 cm off the face throws its shadow this far down and back.
    const SY = 0.022, SZ = -0.0105;
    const faceLight = (j, y, z) => {
      const sd = sdist(j, y, z);
      if (sd <= 0) return 0.5 - 0.42 * smooth(0, 0.01, -sd);
      let lit = 0.5 + 0.5 * smooth(0, 0.03, sd);
      for (let t = 0.5; t < 1.6; t += 0.5) if (covered(j, y + SY * t, z + SZ * t)) lit *= 0.82;
      return lit;
    };
    const edgeLight = (j, y, z) => 0.45 + 0.55 * smooth(-0.006, 0.004, sdist(j, y, z));
    const runsOf = (test) => { const out = []; for (let k = 0; k < NZ;) { if (!test(k)) { k++; continue; } let e = k; while (e < NZ && test(e)) e++; out.push([k, e]); k = e; } return out; };
    // Each panel's outline follows the body exactly at every row line, so its edge runs as a smooth contour rather
    // than steps: a row's run of steel is a trapezoid between where the outline crosses the row's bottom and top lines.
    const across = (x, y, zc, dir, lim) => {
      const parts = near(x, y);
      let zi = zc, zo, n = 0;
      if (inside(x, y, zi, parts)) { zo = zi + dir * dz; while (inside(x, y, zo, parts)) { if (dir * (zo - lim) >= 0) return lim; if (++n > 16) return null; zi = zo; zo += dir * dz; } }
      else { zo = zi; zi -= dir * dz; while (!inside(x, y, zi, parts)) { if (++n > 16 || -dir * (zi - lim) >= 0) return null; zo = zi; zi -= dir * dz; } }
      for (let b = 0; b < 7; b++) { const zm = (zi + zo) / 2; if (inside(x, y, zm, parts)) zi = zm; else zo = zm; }
      return (zi + zo) / 2;
    };
    const shapes = [];
    for (let i = 0; i < N; i++) {
      const x = slatX(i), list = [];
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH, y1 = y0 + rowH, yc = y0 + rowH / 2, runs = runsOf((m) => at(i, r, m)), row = [];
        runs.forEach(([k, e], n) => {
          const mid = (zb(k) + zb(e)) / 2, fl = n ? (zb(runs[n - 1][1]) + zb(k)) / 2 : zb(0), bl = n < runs.length - 1 ? (zb(e) + zb(runs[n + 1][0])) / 2 : zb(NZ);
          const fc = across(x, yc, zb(k) + dz / 2, -1, fl) ?? zb(k), bc = across(x, yc, zb(e) - dz / 2, 1, bl) ?? zb(e);
          let f0 = across(x, y0, zb(k) + dz / 2, -1, fl) ?? fc, b0 = across(x, y0, zb(e) - dz / 2, 1, bl) ?? bc;
          let f1 = across(x, y1, zb(k) + dz / 2, -1, fl) ?? fc, b1 = across(x, y1, zb(e) - dz / 2, 1, bl) ?? bc;
          if (f0 > mid) f0 = Math.min(fc, mid);
          if (b0 < mid) b0 = Math.max(bc, mid);
          if (f1 > mid) f1 = Math.min(fc, mid);
          if (b1 < mid) b1 = Math.max(bc, mid);
          if (b0 - f0 < 0.002) { f0 = fc; b0 = bc; }
          if (b1 - f1 < 0.002) { f1 = fc; b1 = bc; }
          row.push({ k, e, f0, b0, f1, b1 });
        });
        list.push(row);
      }
      shapes.push(list);
      yield;
    }
    const geo = blank();
    // A quad of steel or cut edge, its colour the mean of the light at its corners.
    const quad = (T, a, b, c, d, n, L, tint) => {
      const light = (L[0] + L[1] + L[2] + L[3]) / 4 * tint, y = (a[1] + b[1] + c[1] + d[1]) / 4;
      face(geo, [a, b, c, d], steelColor(T, light, y, n[1]), T.glow, n);
    };
    // The parts of [a, b] that no interval in the list covers.
    const uncovered = (a, b, spans) => { let out = [[a, b]]; for (const [c, d] of spans) out = out.flatMap(([p, q]) => (d <= p || c >= q) ? [[p, q]] : [[p, Math.min(q, c)], [Math.max(p, d), q]].filter(([u, v]) => v - u > 0.0015)); return out; };
    const slant = (za, zc, s) => { const dzz = zc - za, l = Math.hypot(dzz, rowH); return s < 0 ? [0, dzz / l, -rowH / l] : [0, -dzz / l, rowH / l]; };
    const PX = [1, 0, 0], NX = [-1, 0, 0], PY = [0, 1, 0], NY = [0, -1, 0], PZ = [0, 0, 1], NZv = [0, 0, -1], ONE = [1, 1, 1, 1], jit = RM.paintKit.rng(5);
    for (let i = 0; i < N; i++) {
      const xa = slatX(i) - thick / 2, xb = slatX(i) + thick / 2, tint = 0.93 + 0.07 * jit();
      for (let r = 0; r < rows; r++) {
        const y0 = r * rowH, y1 = y0 + rowH;
        for (const { k, e, f0, b0, f1, b1 } of shapes[i][r]) {
          // The polished faces either side, cut only where the light on them changes; inner cut points stretch with the
          // outline so the faces never fold.
          const pts = [];
          for (let m = k; m < e; m += 2) pts.push(m);
          pts.push(e);
          const span = zb(e) - zb(k), z0 = pts.map((m) => f0 + (zb(m) - zb(k)) / span * (b0 - f0)), z1 = pts.map((m) => f1 + (zb(m) - zb(k)) / span * (b1 - f1));
          const streak = tint * brush(i, r);
          for (const s of [1, -1]) {
            const xf = s > 0 ? xb : xa, lo = z0.map((z) => faceLight(i + s, y0, z)), hi = z1.map((z) => faceLight(i + s, y1, z));
            const same = (m, n) => Math.abs(lo[m] - lo[n]) < 0.015 && Math.abs(hi[m] - hi[n]) < 0.015;
            const emit = (m, n) => quad(STEEL, [xf, y0, z0[m]], [xf, y0, z0[n]], [xf, y1, z1[n]], [xf, y1, z1[m]], s > 0 ? PX : NX, [lo[m], lo[n], hi[n], hi[m]], streak);
            let s0 = 0;
            for (let t = 1; t < pts.length; t++) {
              if (t < pts.length - 1 && same(t, s0)) continue;
              if (same(t, s0)) { emit(s0, t); s0 = t; continue; }
              if (t - 1 > s0) emit(s0, t - 1);
              emit(t - 1, t); s0 = t;
            }
          }
          // The cut edges at either end, darker where the panels beside reach past them.
          quad(CUT, [xa, y0, f0], [xb, y0, f0], [xb, y1, f1], [xa, y1, f1], slant(f0, f1, -1), [edgeLight(i - 1, y0, f0 - 0.006), edgeLight(i + 1, y0, f0 - 0.006), edgeLight(i + 1, y1, f1 - 0.006), edgeLight(i - 1, y1, f1 - 0.006)], 1);
          quad(CUT, [xa, y0, b0], [xb, y0, b0], [xb, y1, b1], [xa, y1, b1], slant(b0, b1, 1), [edgeLight(i - 1, y0, b0 + 0.006), edgeLight(i + 1, y0, b0 + 0.006), edgeLight(i + 1, y1, b1 + 0.006), edgeLight(i - 1, y1, b1 + 0.006)], 1);
          // And along the top and bottom wherever the next row does not carry on.
          const yt = y1 + 0.006, yd = y0 - 0.006;
          for (const [za, zc] of uncovered(f1, b1, (shapes[i][r + 1] || []).map((q) => [q.f0, q.b0])))
            quad(CUT, [xa, y1, za], [xb, y1, za], [xb, y1, zc], [xa, y1, zc], PY, [edgeLight(i - 1, yt, za), edgeLight(i + 1, yt, za), edgeLight(i + 1, yt, zc), edgeLight(i - 1, yt, zc)], 1);
          for (const [za, zc] of uncovered(f0, b0, (shapes[i][r - 1] || []).map((q) => [q.f1, q.b1])))
            quad(CUT, [xa, y0, za], [xb, y0, za], [xb, y0, zc], [xa, y0, zc], NY, [edgeLight(i - 1, yd, za), edgeLight(i + 1, yd, za), edgeLight(i + 1, yd, zc), edgeLight(i - 1, yd, zc)], 1);
        }
      }
      yield;
    }
    // The spacers: a short bar across each gap where both panels reach, every sixth row, offset gap to gap like brickwork.
    const bar = (x0, x1, y0, y1, z0, z1, side, cap) => {
      quad(CUT, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], NZv, ONE, side); quad(CUT, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], PZ, ONE, side);
      quad(CUT, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], PY, ONE, cap); quad(CUT, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], NY, ONE, cap);
    };
    let spacers = 0;
    for (let i = 0; i < N - 1; i++) {
      const x0 = slatX(i) + thick / 2, x1 = slatX(i + 1) - thick / 2;
      for (let r = (i % 2) * 3; r < rows; r += 6) {
        const y0 = r * rowH + 0.002, y1 = (r + 1) * rowH - 0.002;
        for (const [k, e] of runsOf((m) => at(i, r, m) && at(i + 1, r, m))) {
          if (e - k < 4) continue;
          bar(x0, x1, y0, y1, zb(k) + 0.003, zb(k) + 0.008, 0.7, 0.45); bar(x0, x1, y0, y1, zb(e) - 0.008, zb(e) - 0.003, 0.7, 0.45); spacers += 2;
        }
      }
    }
    // The bar the panels hang on, across the figure's lap behind the laptop.
    {
      const [x0, x1, y0, y1, z0, z1] = [-0.22, 0.22, 0.267, 0.277, -0.246, -0.234];
      quad(STEEL, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], PY, ONE, 1); quad(STEEL, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], NY, ONE, 0.6);
      quad(STEEL, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], NZv, ONE, 1); quad(STEEL, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], PZ, ONE, 1);
    }
    geo.slats = N;
    geo.spacers = spacers;
    return geo;
  };
  // Built once per page in steps at the doorway (`steps`), or whole when the plan asks for it first.
  const statueRead = BL.models.cachedSteps(statueBuild);
  const statue = () => BL.models.withScope("timechain", statueRead);
  // Each step false once the statue is built, so the doorway spends no frame on the steps left over.
  const steps = () => {
    let it = null, done = false;
    const advance = () => BL.models.withScope("timechain", () => {
      if (done) return false;
      if (!it) it = statueRead.steps();
      const end = performance.now() + BUDGET;
      let next;
      do next = it.next(); while (!next.done && performance.now() < end);
      if (next.done) { done = true; it = null; }
      return true;
    });
    return Array.from({ length: STATUE_STEPS }, () => advance);
  };

  // ---------- shapes the kit lacks ----------
  // A square-based roof or lamp cap: a frustum `wBot` by `dBot` at its foot, its top `topFrac` of that, about its middle.
  const frustum = (wBot, dBot, topFrac, h, color) => {
    const geo = blank(), a = wBot / 2, b = dBot / 2, c = a * topFrac, d = b * topFrac, y0 = -h / 2, y1 = h / 2;
    const B = [[-a, y0, -b], [a, y0, -b], [a, y0, b], [-a, y0, b]], T = [[-c, y1, -d], [c, y1, -d], [c, y1, d], [-c, y1, d]];
    face(geo, T, color, 0, UP);
    face(geo, B, color, 0, DOWN);
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; face(geo, [B[k], B[n], T[n], T[k]], color, 0, [B[k][0] + B[n][0], 0, B[k][2] + B[n][2]]); }
    return geo;
  };
  // An icosahedron of radius 1, once subdivided when `fine`: rocks, and the blossom clumps of the trees.
  const ICO = (() => {
    const t = (1 + Math.sqrt(5)) / 2, v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return p.map((c) => c / l); });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const coarse = f.map((tri) => tri.map((i) => v[i]));
    const mid = (a, b) => { const p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], l = Math.hypot(...p); return p.map((c) => c / l); };
    const fine = [];
    for (const [a, b, c] of coarse) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); fine.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    return { coarse, fine };
  })();
  const ico = (color, sx, sy, sz, fine = false, ry = 0, emissive = 0) => {
    const geo = blank(), c = Math.cos(ry), s = Math.sin(ry);
    for (const tri of fine ? ICO.fine : ICO.coarse) {
      const pts = tri.map(([x, y, z]) => [(x * c + z * s) * sx, y * sy, (-x * s + z * c) * sz]);
      face(geo, pts, color, emissive, [(pts[0][0] + pts[1][0] + pts[2][0]) / sx, (pts[0][1] + pts[1][1] + pts[2][1]) / sy, (pts[0][2] + pts[1][2] + pts[2][2]) / sz]);
    }
    return geo;
  };
  // A ball squashed to an ellipsoid: hedges, leaves, bonsai pads.
  const blob = (rx, ry, rz, color, segments = 10, emissive = 0) => {
    const geo = ballGeo(1, color, segments, emissive), v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] *= rx; v[i + 1] *= ry; v[i + 2] *= rz; }
    return geo;
  };
  // A flat ellipse of `n` corners as [x, z] points round (x, z).
  const ellipse = (x, z, rx, rz, n) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU; return [x + Math.sin(a) * rx, z + Math.cos(a) * rz]; });
  // A flat ellipse facing up at height `y`, as a fan of `n` triangles, so no face has more corners than Canvas 2D clips.
  const disc = (x, z, rx, rz, n, y, color, emissive = 0) => {
    const geo = blank(), pts = ellipse(x, z, rx, rz, n);
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; face(geo, [[x, y, z], [a[0], y, a[1]], [b[0], y, b[1]]], color, emissive, UP); }
    return geo;
  };
  const headingTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const polar = (r, b) => ({ x: r * Math.sin(b * DEG), z: r * Math.cos(b * DEG) });

  // ---------- the place ----------
  const C = {
    red: "#b8402a", dark: "#2a1a12", stone: "#8a857c", wood: "#5a3a22", pillar: "#7a2a1e", roof: "#2e3440", gold: "#d4a63a", paper: "#e6dfd0",
    plat: "#9a948a", bark: "#4a2e1e", hedge: "#3f6b3a", lamp: "#ffc46b", lampRed: "#e8573a", cushion: "#2b3566", mat: "#1d2447", bronze: "#7a5a2e"
  };
  const HALL_Z = -9.6, DECK_Z = -3.9, STATUE_Z = HALL_Z - 0.7;
  const POND = { x: 7.2, z: -1.8, rx: 3.6, rz: 3.2 }, BELL = { x: 7.6, z: -8.8 }, PAGODA = { x: -8.4, z: -4.6 }, ROCK = { x: -6.6, z: -9.2, r: 2.5 };
  const CHERRY = [[-5.2, 6.2], [5.2, 8.2]], MAPLE = { x: -9.2, z: 3.0 }, GONG = { x: 3.95, z: DECK_Z - 1.2 }, BURNER = { x: 0, z: -0.6 };
  const GARDEN_ROCKS = [[-7.2, -9.6, 0.55], [-5.9, -8.6, 0.38], [-6.2, -10.3, 0.3]];
  const MOON = { az: 22, el: 34 }, LINE = { az0: 10, az1: 34, el0: 25, el1: 29, w: 1200 };
  const SKY = [[90, "#0c0f2c"], [55, "#2a2456"], [28, "#6e4a7a"], [12, "#c9756a"], [3, "#f0b07a"], [-90, "#f0b07a"]];
  // The bridge's arch: its deck's height at `t` of the way across, from the pond's near end (+z) to the bell tower's.
  const BRIDGE = { z0: POND.z + POND.rz + 0.9, z1: POND.z - POND.rz - 0.9, rise: 1.1, base: 0.12, walk: 14 };
  const archY = (t) => BRIDGE.base + BRIDGE.rise * Math.sin(Math.PI * t);
  const KOI_COLORS = ["#f26a1b", "#f4f1e6", "#f2a01b", "#e8501b", "#f4f1e6"];
  const KOI = Array.from({ length: 10 }, (_, i) => ({ r: 0.7 + (i % 4) * 0.55, a: i * 0.9, w: (i % 2 ? 1 : -1) * (0.3 + i * 0.03) }));
  const LAMPS = 9, PETALS = 30, SMOKE = 7, STREAKS = 8;
  // The dome's own picture and its map, kept when painted, so the line under the moon paints the sky behind it.
  let domeCanvas = null, domeMap = null;
  // The latest block the line under the moon has read, and how many new ones it has seen: the bell rings for each.
  const chime = { height: null, count: 0, text: "" };

  // A stone lantern: its base, post, firebox and cap; its windows lit on a node of their own, so they can flicker.
  const lantern = (K, x, z, lit) => {
    K.box(0.6, 0.15, 0.6, C.stone, x, 0.075, z);
    K.box(0.22, 0.85, 0.22, C.stone, x, 0.57, z);
    K.box(0.5, 0.42, 0.5, C.stone, x, 1.2, z);
    K.add(frustum(0.9, 0.9, 0.05, 0.35, "#6e6a63"), x, 1.58, z);
    K.node(`lamp${lit.n++}`, lit.geo, x, 1.2, z, { glow: true });
    K.solid({ x, z, r: 0.34 });
  };
  // A tree: its trunk and two limbs, and clumps of blossom or leaves in its colours.
  const tree = (K, x, z, colors, n, seed) => {
    K.cyl(0.17, 0.27, 2.8, C.bark, x, 1.4, z, { rz: 0.08, seg: 10 });
    K.cyl(0.08, 0.12, 1.7, C.bark, x + 0.6, 2.8, z + 0.1, { rz: -0.9, seg: 8 });
    K.cyl(0.07, 0.11, 1.5, C.bark, x - 0.5, 2.9, z - 0.2, { rz: 0.8, seg: 8 });
    const r = RM.paintKit.rng(seed);
    for (let i = 0; i < n; i++) {
      const s = 0.5 + r() * 0.5, px = x + (r() - 0.45) * 3.0, py = 3.0 + r() * 1.6, pz = z + (r() - 0.5) * 2.6;
      K.add(ico(colors[i % colors.length], s, s * 0.8, s, true, 0, 0.14), px, py, pz);
    }
    K.solid({ x, z, r: 0.32 });
  };

  // The Corten plinth, 1.5 by 1.3 m and 0.85 m tall about its foot's middle: weathered steel in mottled patches of rust.
  const plinth = () => {
    const geo = blank(), r = RM.paintKit.rng(71), W = 0.75, H = 0.85, D = 0.65, n = 0.12;
    const rust = () => { const v = r(); return v < 0.4 ? "#6b3219" : v < 0.65 ? "#76391d" : v < 0.82 ? "#5c2a15" : v < 0.94 ? "#80431f" : "#4c2211"; };
    // A face of the box in patches about `n` across: `o` its corner, `u` and `v` its two sides.
    const side = (o, u, v, normal) => {
      const nu = Math.max(1, Math.round(Math.hypot(...u) / n)), nv = Math.max(1, Math.round(Math.hypot(...v) / n));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const p = (a, b) => [o[0] + u[0] * a / nu + v[0] * b / nv, o[1] + u[1] * a / nu + v[1] * b / nv, o[2] + u[2] * a / nu + v[2] * b / nv];
        face(geo, [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)], rust(), 0, normal);
      }
    };
    for (const s of [-1, 1]) {
      side([-W, 0, s * D], [2 * W, 0, 0], [0, H, 0], [0, 0, s]);
      side([s * W, 0, -D], [0, 0, 2 * D], [0, H, 0], [s, 0, 0]);
    }
    side([-W, H, -D], [2 * W, 0, 0], [0, 0, 2 * D], UP);
    return geo;
  };

  const plan = (K, L) => {
    const r0 = L.r0;
    K.wallColor(C.paper);
    K.render({ sky: [0.62, 0.55, 0.56], ground: [0.3, 0.24, 0.22], ambientFloor: 0.42, bloomStrength: 0.6 });

    // The dome: dusk over misty mountains like an ink painting, the moon rising beside the hall, cranes and the first stars.
    K.dome((ctx, D) => {
      domeCanvas = ctx.canvas; domeMap = D;
      // The mock-up's sky was 1024 pixels from pole to pole; its sizes in those pixels, as metres on this dome.
      const R = D.L.R, m = (px) => px * 180 / 1024 * DEG * R, r = D.rng(61);
      // Something drawn in metres about (az, el), so it is round on the dome.
      const at = (az, el, s, draw) => D.wrap(ctx, () => { ctx.translate(D.x(az), D.y(el)); ctx.scale(D.perX(el) * s, D.perY(el) * s); draw(); });
      D.sky(ctx, SKY);
      D.stars(ctx, 44, 260, 13);
      // Long faint clouds low over the mountains.
      for (let i = 0; i < 14; i++) {
        const az = r() * 360 - 180, el = 16 + r() * 16, rx = m(60 + r() * 80), ry = m(4 + r() * 4);
        at(az, el, 1, () => { ctx.fillStyle = "rgba(255,220,200,.12)"; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); });
      }
      // The full moon in its halo.
      at(MOON.az, MOON.el, 1, () => {
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, m(110));
        halo.addColorStop(0, "rgba(255,240,215,.55)"); halo.addColorStop(1, "rgba(255,240,215,0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, m(110), 0, TAU); ctx.fill();
        ctx.fillStyle = "#f6ecd2"; ctx.beginPath(); ctx.arc(0, 0, m(34), 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(170,160,140,.35)";
        for (const [x, y, rr] of [[-9, -8, 7], [10, 5, 6], [-3, 13, 5], [12, -10, 4]]) { ctx.beginPath(); ctx.arc(m(x), m(y), m(rr), 0, TAU); ctx.fill(); }
      });
      // Four ranges of mountains, paler and lower far off, darker and taller near, misted at their feet. Their shapes
      // blend over the door, where the canvas's two edges meet.
      const e0 = ROOMS.edgeEl(L, 0) / DEG;
      [["rgba(130,115,170,.55)", 17, 0.4, 2.2], ["rgba(95,80,135,.72)", 12.5, 1.9, 3.1], ["rgba(62,52,100,.88)", 8.5, 3.3, 4.3], ["rgba(34,29,58,1)", 5.2, 5.1, 6.7]].forEach(([color, amp, ph, k]) => {
        const peak = (az) => { const a = az * DEG; return e0 + 0.5 + amp * (0.3 + 0.5 * Math.pow(Math.abs(Math.sin(a * k + ph)), 1.6) + 0.2 * Math.abs(Math.sin(a * k * 2.7 + ph * 1.3))); };
        const h = (az) => { const w = smooth(165, 195, Math.abs(az)); return peak(az) * (1 - w) + peak(az - 360 * Math.sign(az)) * w; };
        ctx.beginPath(); ctx.moveTo(0, D.y(e0 - 3));
        for (let az = -180; az <= 180; az += 0.5) ctx.lineTo((az + 180) / 360 * D.W, D.y(h(az)));
        ctx.lineTo(D.W, D.y(e0 - 3)); ctx.closePath();
        const g = ctx.createLinearGradient(0, D.y(e0 + amp), 0, D.y(e0));
        g.addColorStop(0, color); g.addColorStop(1, "rgba(240,190,160,.55)");
        ctx.fillStyle = g; ctx.fill();
      });
      // Cranes crossing: four to the left of the hall, two to the right.
      for (const [az, el, s] of [[-34, 24, 1], [-30, 26, 0.8], [-27, 23.5, 0.9], [-24, 25.5, 0.7], [58, 30, 0.8], [62, 31.5, 0.7]]) at(az, el, m(1) * s * 1.2, () => {
        ctx.strokeStyle = "rgba(255,250,240,.85)"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-12, -2); ctx.quadraticCurveTo(-5, -9, 0, 0); ctx.quadraticCurveTo(5, -9, 12, -2); ctx.stroke();
      });
    });
    // The line under the moon: the latest block, repainted when a new one comes, over the dome's own sky.
    const lineH = Math.round(LINE.w * (LINE.el1 - LINE.el0) / (Math.cos((LINE.el0 + LINE.el1) / 2 * DEG) * (LINE.az1 - LINE.az0)));
    K.live({
      az0: LINE.az0, az1: LINE.az1, el0: LINE.el0, el1: LINE.el1, w: LINE.w, h: lineH, tip: "The latest block · the bell rings once a block",
      key: (f) => {
        const blocks = f.reader.value("recent"), b = blocks && blocks[0], height = b ? b.height : null;
        if (height !== null) { if (chime.height !== null && height > chime.height) chime.count++; chime.height = height; }
        return `${height}|${f.reader.status("recent")}`;
      },
      paint: (ctx, f) => {
        const w = ctx.canvas.width, h = ctx.canvas.height, blocks = f.reader.value("recent"), b = blocks && blocks[0], P = RM.paintKit;
        if (domeCanvas) {
          const x0 = domeMap.x(LINE.az0), y0 = domeMap.y(LINE.el1);
          ctx.drawImage(domeCanvas, x0, y0, domeMap.x(LINE.az1) - x0, domeMap.y(LINE.el0) - y0, 0, 0, w, h);
        } else { ctx.fillStyle = "#6e4a7a"; ctx.fillRect(0, 0, w, h); }
        chime.text = b ? `Block ${CH.format.group(b.height)}` : "";
        P.pix(ctx, b ? CH.format.group(b.height) : "...", w / 2, h * 0.4, h * 0.38, "rgba(52,30,64,.82)");
        ctx.fillStyle = "rgba(52,30,64,.72)"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = P.font(400, h * 0.26, P.HAND);
        ctx.fillText("the bell rings once a block", w / 2, h * 0.84);
      }
    });

    // The floor: raked gravel, moss, stone paths and the rock garden's rings, and petals under the cherries.
    K.floor((ctx, F) => {
      const { N, s, X, Y } = F, r = F.rng(3);
      ctx.fillStyle = "#bdb6a8"; ctx.fillRect(0, 0, N, N);
      ctx.strokeStyle = "rgba(90,84,74,.1)"; ctx.lineWidth = 3;
      for (let z = -r0; z < r0; z += 0.12) { ctx.beginPath(); ctx.moveTo(0, Y(z)); ctx.lineTo(N, Y(z)); ctx.stroke(); }
      const moss = (x, z, rr) => {
        const g = ctx.createRadialGradient(X(x), Y(z), 0, X(x), Y(z), rr * s);
        g.addColorStop(0, "#4f6b34"); g.addColorStop(0.75, "#56723a"); g.addColorStop(1, "rgba(86,114,58,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(x), Y(z), rr * s, 0, TAU); ctx.fill();
      };
      moss(PAGODA.x, PAGODA.z, 3.6); moss(MAPLE.x, MAPLE.z, 2.6);
      for (const [x, z] of CHERRY) moss(x, z, 2.6);
      for (let b = 215; b < 320; b += 12) { const p = polar(r0 - 1.6, b); moss(p.x, p.z, 2.4); }
      moss(BELL.x, BELL.z, 2.6);
      ctx.fillStyle = "#bdb6a8"; ctx.beginPath(); ctx.arc(X(ROCK.x), Y(ROCK.z), ROCK.r * s, 0, TAU); ctx.fill();
      for (const [x, z, rr] of GARDEN_ROCKS) for (let k = 1; k <= 7; k++) { ctx.beginPath(); ctx.arc(X(x), Y(z), (rr + k * 0.13) * s, 0, TAU); ctx.stroke(); }
      const slabs = (x0, z0, x1, z1, w) => {
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), n = Math.round(len / 0.7), a = Math.atan2(-dx, dz);
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          ctx.save(); ctx.translate(X(x0 + dx * t), Y(z0 + dz * t)); ctx.rotate(a);
          ctx.fillStyle = i % 2 ? "#8f8a80" : "#87827a"; ctx.fillRect(-w / 2 * s, -0.33 * s, w * s, 0.64 * s);
          ctx.restore();
        }
      };
      slabs(0, L.doorZ, 0, -1.5, 2.0); slabs(0.8, 3.0, POND.x, 3.0, 1.2); slabs(POND.x, -5.2, BELL.x, BELL.z + 1.6, 1.2); slabs(-0.8, 1.2, PAGODA.x + 1.6, PAGODA.z + 1.0, 1.2);
      ctx.fillStyle = "rgba(242,167,192,.85)";
      for (const [cx, cz] of CHERRY) for (let i = 0; i < 140; i++) { ctx.beginPath(); ctx.arc(X(cx + (r() - 0.5) * 4.5), Y(cz + (r() - 0.5) * 4.5), 0.05 * s, 0, TAU); ctx.fill(); }
    });

    // A plain gravel disc a hair under the painted floor, so the slivers its rings leave between them show gravel, not
    // the dark beneath; Canvas 2D draws it before anything else.
    K.node(null, noShadow(disc(0, 0, r0 - 0.01, r0 - 0.01, 48, 0, "#b3ac9d")), 0, -0.004, 0, { depthBias: 50 });

    // The wall below the dome: paper between dark timber posts, two rails round it and a cap of roof tiles along its
    // top. Each post is two lengths following the sphere's lean, and none stands in the doorway's bay.
    const capY = 3.62, posts = Math.round(TAU * ROOMS.radiusAt(L, 1.8) / 1.6), half = Math.PI / posts;
    K.torus(ROOMS.radiusAt(L, capY) - 0.12, 0.13, C.roof, 0, capY, 0, { seg: 144, sides: 6 });
    for (let i = 0; i < posts; i++) {
      const az = ((i + 0.5) / posts * 360 - 180) * DEG;
      if (Math.abs(az) > 166 * DEG) continue;
      const G = K.group(0, 0, 0, -az);
      for (const [y0, y1] of [[0, 1.8], [1.8, capY - 0.08]]) {
        const ra = ROOMS.radiusAt(L, y0) - 0.06, rb = ROOMS.radiusAt(L, y1) - 0.06;
        G.box(0.14, Math.hypot(y1 - y0, rb - ra), 0.08, C.dark, 0, (y0 + y1) / 2, -(ra + rb) / 2, { rx: -Math.atan2(rb - ra, y1 - y0) });
      }
      // The rails, a length from this post to the next.
      if (Math.abs(az + 2 * half) > 166 * DEG) continue;
      const R2 = K.group(0, 0, 0, -az - half);
      for (const y of [0.32, 2.05]) { const rr = ROOMS.radiusAt(L, y) - 0.07; R2.box(2 * rr * Math.sin(half) + 0.02, 0.1, 0.06, C.dark, 0, y, -rr * Math.cos(half)); }
    }

    // The torii over the path, and the lanterns and hedges lining it to the deck.
    const torZ = L.doorZ - 5.2;
    K.cyl(0.15, 0.17, 3.6, C.red, -1.6, 1.8, torZ, { seg: 14 });
    K.cyl(0.15, 0.17, 3.6, C.red, 1.6, 1.8, torZ, { seg: 14 });
    K.box(3.6, 0.16, 0.16, C.red, 0, 2.85, torZ);
    K.box(4.4, 0.14, 0.3, C.red, 0, 3.5, torZ);
    K.box(4.7, 0.2, 0.36, C.dark, 0, 3.66, torZ);
    for (const x of [-1.6, 1.6]) K.solid({ x, z: torZ, r: 0.2 });
    const lit = { n: 0, geo: noShadow(RM.helpers.slabGeo([[-0.15, -0.26], [0.15, -0.26], [0.15, 0.26], [-0.15, 0.26]], -0.11, 0.11, C.lamp, 0.95)) };
    for (const z of [7.2, 4.0, 0.9]) { lantern(K, -2.0, z, lit); lantern(K, 2.0, z, lit); }
    lantern(K, POND.x - 1.6, 3.6, lit); lantern(K, BELL.x - 2.0, BELL.z + 2.2, lit); lantern(K, PAGODA.x + 2.2, PAGODA.z + 1.8, lit);
    for (let z = 8.2; z > 1.6; z -= 0.75) for (const x of [-1.5, 1.5]) if ([7.2, 4.0].every((lz) => Math.abs(z - lz) > 0.5)) {
      K.add(blob(0.42, 0.34, 0.42, C.hedge, 10), x, 0.3, z, { ry: z });
      K.solid({ x, z, r: 0.4 });
    }

    // The main hall: platform, steps, columns, two roofs, lanterns, the altar and a scroll. The platform and its steps
    // are jumped up onto.
    K.box(8.0, 0.7, 5.4, C.plat, 0, 0.35, HALL_Z);
    K.box(8.1, 0.06, 5.5, C.wood, 0, 0.72, HALL_Z);
    K.solid({ x: 0, z: HALL_Z, hx: 4.05, hz: 2.75, top: 0.75 });
    for (let k = 0; k < 3; k++) {
      const h = 0.23 * (k + 1), z = HALL_Z + 2.7 + 0.96 - k * 0.32;
      K.box(3.0, h, 0.32, C.plat, 0, h / 2, z);
      K.solid({ x: 0, z, hx: 1.5, hz: 0.16, top: h });
    }
    for (const x of [-3.6, -1.2, 1.2, 3.6]) for (const z of [HALL_Z + 2.4, HALL_Z, HALL_Z - 2.4]) if (Math.abs(x) > 2 || z === HALL_Z + 2.4) {
      K.box(0.24, 3.2, 0.24, C.pillar, x, 2.3, z);
      K.solid({ x, z, r: 0.2 });
    }
    K.box(8.2, 0.3, 0.3, C.pillar, 0, 3.95, HALL_Z + 2.4); K.box(8.2, 0.3, 0.3, C.pillar, 0, 3.95, HALL_Z - 2.4);
    K.box(0.3, 0.3, 5.1, C.pillar, -3.6, 3.95, HALL_Z); K.box(0.3, 0.3, 5.1, C.pillar, 3.6, 3.95, HALL_Z);
    K.box(10.4, 0.08, 7.6, C.wood, 0, 4.12, HALL_Z);
    K.add(frustum(10.6, 7.8, 0.55, 1.3, C.roof), 0, 4.8, HALL_Z);
    K.box(5.0, 0.8, 3.4, C.pillar, 0, 5.85, HALL_Z);
    K.box(5.1, 0.12, 3.5, C.paper, 0, 5.55, HALL_Z);
    K.add(frustum(6.8, 5.0, 0.22, 1.5, C.roof), 0, 7.0, HALL_Z);
    K.box(2.4, 0.22, 0.3, C.roof, 0, 7.8, HALL_Z);
    for (const x of [-1.25, 1.25]) K.cyl(0, 0.14, 0.5, C.gold, x, 8.1, HALL_Z, { seg: 8, emissive: 0.15 });
    // Red paper lamps along its front, each swaying on its string.
    const paperLamp = (k) => { k.cyl(0.22, 0.22, 0.46, C.lampRed, 0, -0.67, 0, { emissive: 0.85 }); k.box(0.02, 0.4, 0.02, C.dark, 0, -0.2, 0); };
    [-3.0, -1.5, 0, 1.5, 3.0].forEach((x, i) => K.node(`paper${i}`, paperLamp, x, 3.97, HALL_Z + 3.2));
    // The back wall, and the scroll with its ensō.
    K.box(7.6, 3.2, 0.12, C.paper, 0, 2.3, HALL_Z - 2.6);
    K.box(7.8, 0.14, 0.16, C.dark, 0, 3.86, HALL_Z - 2.56);
    K.solid({ x: 0, z: HALL_Z - 2.6, hx: 3.8, hz: 0.1 });
    K.picture(1.2, 2.4, 400, 800, (sc) => {
      sc.fillStyle = "#f3eee0"; sc.fillRect(0, 0, 400, 800); sc.fillStyle = "#5a3a22"; sc.fillRect(0, 0, 400, 26); sc.fillRect(0, 774, 400, 26);
      sc.strokeStyle = "#151515"; sc.lineCap = "round";
      for (let i = 0; i < 70; i++) { const a = -1.1 + i / 70 * 5.6, w = 30 * (1 - i / 80) + 4; sc.lineWidth = w; sc.beginPath(); sc.arc(200, 330, 120, a, a + 0.09); sc.stroke(); }
      sc.fillStyle = "#151515"; sc.font = RM.paintKit.font(400, 34, RM.paintKit.HAND); sc.textAlign = "center"; sc.fillText("low time preference", 200, 560);
      sc.fillStyle = "#b8402a"; sc.fillRect(260, 600, 44, 44);
    }, 0, 2.5, HALL_Z - 2.53, { emissive: 0.45 });
    // The altar and its candles.
    K.box(2.6, 0.45, 0.7, "#3a2214", 0, 0.975, HALL_Z + 1.0);
    K.solid({ x: 0, z: HALL_Z + 1.0, hx: 1.3, hz: 0.35 });
    for (const x of [-1.0, -0.6, 0.6, 1.0]) {
      K.cyl(0.04, 0.04, 0.22, "#f4efe6", x, 1.31, HALL_Z + 1.1, { seg: 8, emissive: 0.5 });
      K.cyl(0, 0.03, 0.08, "#ffb03a", x, 1.46, HALL_Z + 1.1, { seg: 8, emissive: 1, glow: true });
    }
    // Bonsai flanking the steps.
    for (const x of [-2.7, 2.7]) {
      const z = HALL_Z + 3.4;
      K.box(0.8, 0.45, 0.45, C.wood, x, 0.225, z); K.box(0.55, 0.16, 0.34, "#2a2a2e", x, 0.53, z);
      K.cyl(0.04, 0.07, 0.5, C.bark, x, 0.85, z, { rz: 0.4, seg: 6 });
      for (const [dx, dy, s] of [[-0.18, 1.07, 0.3], [0.16, 0.97, 0.24], [0.02, 1.2, 0.22]]) K.add(blob(s, s * 0.35, s * 0.8, C.hedge, 10), x + dx, dy, z);
      K.solid({ x, z, r: 0.45 });
    }

    // Satoshi on his Corten plinth, facing the deck, at the heart of the hall. The plinth's weathered steel is laid in
    // patches of rust; the figure is its own node, sampled panel by panel (the statue above).
    const P = K.group(0, 0.75, STATUE_Z, Math.PI);
    P.node("plinth", plinth(), 0, 0, 0, { target: { kind: "statue", tip: "Satoshi Nakamoto · after Valentina Picozzi's statue in Lugano, made with her permission", radius: 1.1,
      data: { say: "Walk round him: face on, the steel all but vanishes; from the side it closes into one figure" } } });
    P.node("statue", statue(), 0, 0.85, 0.17);
    K.solid({ x: 0, z: STATUE_Z, hx: 0.75, hz: 0.65 });
    K.picture(0.24, 0.07, 480, 140, (c) => {
      c.fillStyle = "#1b1b1d"; c.fillRect(0, 0, 480, 140);
      c.fillStyle = "#d8d8d8"; c.textAlign = "center"; c.textBaseline = "middle"; c.font = RM.paintKit.font(600, 58); c.fillText("SATOSHI NAKAMOTO", 240, 72);
    }, -0.52, 1.603, STATUE_Z + 0.52, { rx: -Math.PI / 2, emissive: 0.3 });

    // The tatami deck, its cushions (each a seat facing the hall), the gong, the singing bowl and the incense burner.
    K.box(7.0, 0.06, 4.4, C.wood, 0, 0.03, DECK_Z);
    K.picture(6.9, 4.3, 512, 320, (tc) => {
      tc.fillStyle = "#cdbf86"; tc.fillRect(0, 0, 512, 320); tc.strokeStyle = "rgba(120,100,50,.35)"; tc.lineWidth = 1;
      for (let x = 0; x < 512; x += 4) { tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, 320); tc.stroke(); }
      tc.fillStyle = "#2a1f14"; for (const x of [0, 170, 340]) tc.fillRect(x, 0, 6, 320);
      tc.fillRect(0, 0, 512, 6); tc.fillRect(0, 160, 512, 6); tc.fillRect(0, 314, 512, 6);
    }, 0, 0.062, DECK_Z, { rx: -Math.PI / 2, emissive: 0.12 });
    const zafu = merge(RM.helpers.cylinder(0.27, 0.27, 0.12, C.cushion, 16), BL.models.box({ w: 0.62, h: 0.03, d: 0.62, color: C.mat, offset: { y: -0.075 } }));
    for (const z of [DECK_Z - 1.3, DECK_Z, DECK_Z + 1.3]) for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
      const seat = K.seat(x, z, Math.PI, 0.27, 0, 0.65);
      K.node(null, zafu, x, 0.15, z, { target: { kind: "chair", tip: "Meditation cushion", radius: 0.45, index: seat.index } });
    }
    const G = K.group(GONG.x, 0, GONG.z);
    G.box(0.1, 1.6, 0.1, C.dark, -0.55, 0.8, 0); G.box(0.1, 1.6, 0.1, C.dark, 0.55, 0.8, 0); G.box(1.3, 0.1, 0.1, C.dark, 0, 1.6, 0);
    G.node("gong", (k) => {
      k.cyl(0.42, 0.42, 0.04, C.gold, 0, -0.6, 0, { rx: Math.PI / 2, seg: 32, emissive: 0.12 });
      k.cyl(0.36, 0.36, 0.05, "#b88a2a", 0, -0.6, 0, { rx: Math.PI / 2, seg: 32, emissive: 0.12 });
      for (const x of [-0.18, 0.18]) k.box(0.015, 0.22, 0.015, C.dark, x, -0.09, 0);
    }, 0, 1.55, 0, { target: { kind: "gong", tip: "Gong · tap to strike it", radius: 0.6 } });
    G.solid({ x: 0, z: 0, hx: 0.66, hz: 0.1 });
    K.lathe([[0, 0], [0.18, 0.01], [0.24, 0.08], [0.26, 0.16], [0.24, 0.18]], C.gold, -3.2, 0.06, DECK_Z + 1.9, { seg: 20, emissive: 0.1 });
    K.box(0.9, 0.3, 0.9, C.stone, BURNER.x, 0.15, BURNER.z);
    K.lathe([[0, 0], [0.4, 0.02], [0.48, 0.25], [0.46, 0.55], [0.52, 0.6]], "#6e5530", BURNER.x, 0.3, BURNER.z, { seg: 24 });
    K.cyl(0.45, 0.45, 0.02, "#4a4540", BURNER.x, 0.83, BURNER.z, { seg: 24 });
    K.solid({ x: BURNER.x, z: BURNER.z, r: 0.55 });
    // Three sticks of incense, their tips glowing, and the smoke curling up from them.
    [[-0.06, 0.02, 0.1], [0.05, -0.04, -0.08], [0.01, 0.07, 0.04]].forEach(([dx, dz, lean], i) => {
      K.box(0.012, 0.32, 0.012, "#6a3a22", BURNER.x + dx, 0.99, BURNER.z + dz, { rz: lean });
      K.node(`tip${i}`, (k) => k.box(0.02, 0.025, 0.02, "#ff6a2a", 0, 0, 0, { emissive: 1 }), BURNER.x + dx - Math.sin(lean) * 0.16, 1.15, BURNER.z + dz, { glow: true });
    });
    const puff = noShadow(blob(0.03, 0.03, 0.03, "#e4e0da", 6, 0.5));
    for (let i = 0; i < SMOKE; i++) K.node(`smoke${i}`, puff, BURNER.x, 1.2, BURNER.z, { glow: true });

    // The pagoda in its bamboo grove.
    const PG = K.group(PAGODA.x, 0, PAGODA.z);
    PG.box(3.0, 0.4, 3.0, C.stone, 0, 0.2, 0);
    let y = 0.4;
    for (let k = 0; k < 5; k++) {
      const s = 2.0 - 0.28 * k, h = 0.9 - 0.06 * k;
      PG.box(s, h, s, C.pillar, 0, y + h / 2, 0);
      PG.box(s * 0.7, h * 0.5, 0.02, C.paper, 0, y + h / 2, s / 2 + 0.01);
      y += h;
      PG.add(frustum(s + 1.1, s + 1.1, 0.42, 0.45, C.roof), 0, y + 0.22, 0);
      y += 0.45;
    }
    PG.cyl(0.06, 0.06, 1.6, C.gold, 0, y + 0.8, 0, { seg: 8, emissive: 0.15 });
    for (let k = 0; k < 6; k++) PG.torus(0.16 - k * 0.012, 0.03, C.gold, 0, y + 0.3 + k * 0.2, 0, { seg: 16, sides: 5, emissive: 0.15 });
    PG.solid({ x: 0, z: 0, hx: 1.5, hz: 1.5 });
    const br = RM.paintKit.rng(29), stalks = [];
    for (let i = 0; i < 90; i++) {
      const b = (212 + br() * 110) * DEG, rr = r0 - 0.9 - br() * 1.6, x = rr * Math.sin(b), z = rr * Math.cos(b), h = 4 + br() * 3;
      stalks.push([x, z, h]);
      for (let k = 0; k < 2; k++) {
        const lx = x + (br() - 0.5) * 0.6, ly = h * (0.7 + br() * 0.3), lz = z + (br() - 0.5) * 0.6, s = 0.5 + br() * 0.5;
        K.add(blob(s, s * 0.35, s * 0.7, "#4f7d32", 6), lx, ly, lz, { ry: 2 * i + k });
      }
    }
    for (const [x, z, h] of stalks) K.cyl(0.045, 0.055, h, "#6f9a3e", x, h / 2, z, { seg: 6, rx: (br() - 0.5) * 0.08, rz: (br() - 0.5) * 0.08 });

    // Cherry and maple trees, their petals falling.
    for (const [x, z] of CHERRY) tree(K, x, z, ["#f2a7c0", "#e98fb0", "#f7c2d4"], 20, Math.round(x * 10));
    tree(K, MAPLE.x, MAPLE.z, ["#c0392b", "#d9542c", "#a8281e"], 16, 9);
    const petal = blank(), petalPts = [[-0.035, 0, 0], [0, 0, -0.025], [0.035, 0, 0], [0, 0, 0.025]];
    face(petal, petalPts, "#f7b8cc", 0.5, UP); face(petal, petalPts, "#f7b8cc", 0.5, DOWN);
    for (let i = 0; i < PETALS; i++) K.node(`petal${i}`, noShadow(petal), CHERRY[i % 2][0], 2, CHERRY[i % 2][1], { glow: true });

    // The raked rock garden: a stone curb and three rocks in their rings.
    K.torus(ROCK.r, 0.06, "#7a756c", ROCK.x, 0.05, ROCK.z, { seg: 64, sides: 4 });
    for (const [x, z, rr] of GARDEN_ROCKS) { K.add(ico("#55534f", rr, rr * 0.8, rr * 1.1, false, x * 3), x, rr * 0.45, z); K.solid({ x, z, r: rr }); }

    // The koi pond: water, a rim of stones, lotus, the koi, an arched bridge and a waterfall.
    K.add(disc(POND.x, POND.z, POND.rx, POND.rz, 40, 0.03, "#2a6b7a", 0.55));
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU;
      K.add(ico("#6a6862", 0.26, 0.26, 0.26, false, a), POND.x + Math.sin(a) * (POND.rx + 0.1), 0.1, POND.z + Math.cos(a) * (POND.rz + 0.1));
    }
    for (const [dx, dz, rr] of [[-1.6, 1.2, 0.3], [-2.2, -0.6, 0.26], [1.8, 1.4, 0.32], [-0.9, -2.2, 0.24], [2.0, -1.5, 0.28]]) {
      K.cyl(rr, rr, 0.01, "#3f7a3a", POND.x + dx, 0.04, POND.z + dz, { seg: 12 });
      K.cyl(0.1, 0, 0.14, "#f2a7c0", POND.x + dx + 0.08, 0.1, POND.z + dz, { seg: 6, emissive: 0.2 });
    }
    const koiGeo = KOI_COLORS.map((color, n) => {
      const tail = blank();
      face(tail, [[-0.17, 0.02, 0], [-0.3, 0.02, 0.08], [-0.3, 0.02, -0.08]], color, 0.45, UP);
      const spot = n === 1 ? [BL.models.box({ w: 0.12, h: 0.012, d: 0.08, color: "#e8501b", emissive: 0.45, offset: { x: 0.06, y: 0.03 } })] : [];
      return noShadow(merge(BL.models.box({ w: 0.36, h: 0.05, d: 0.12, color, emissive: 0.45 }), ...spot, tail));
    });
    KOI.forEach((k, i) => K.node(`koi${i}`, koiGeo[i % KOI_COLORS.length], POND.x, 0.045, POND.z));
    // The pond keeps walkers out but for the bridge: three stones' worth of solid each side of its middle.
    for (const side of [-1, 1]) for (const [u, v, r] of [[2.3, 0, 1.45], [1.75, 1.9, 1.0], [1.75, -1.9, 1.0]]) K.solid({ x: POND.x + side * u, z: POND.z + v, r });
    // The arched bridge: planks along the arch with red rails and posts, walked on as a run of low steps to jump up.
    const SEG = 26, deck = [];
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG, ya = archY(t0), yb = archY(t1), za = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t0, zb = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t1;
      deck.push({ y: (ya + yb) / 2, z: (za + zb) / 2, ang: Math.atan2(yb - ya, za - zb), len: Math.hypot(yb - ya, zb - za) });
    }
    for (const d of deck) {
      K.box(1.5, 0.1, d.len + 0.02, C.wood, POND.x, d.y, d.z, { rx: d.ang });
      for (const sx of [-0.72, 0.72]) K.box(0.07, 0.07, d.len + 0.02, C.red, POND.x + sx, d.y + 0.72, d.z, { rx: d.ang });
    }
    deck.forEach((d, i) => { if (i % 4 === 0 || i === deck.length - 1) for (const sx of [-0.72, 0.72]) K.box(0.1, 0.75, 0.1, C.red, POND.x + sx, d.y + 0.36, d.z); });
    for (let i = 0; i < BRIDGE.walk; i++) {
      let top = 0;
      for (let n = 0; n <= 4; n++) top += archY((i + n / 4) / BRIDGE.walk) / 5;
      const z = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * (i + 0.5) / BRIDGE.walk;
      K.solid({ x: POND.x, z, hx: 0.72, hz: Math.abs(BRIDGE.z1 - BRIDGE.z0) / BRIDGE.walk / 2, top: top + 0.05 });
    }
    // The waterfall off the rocks at the pond's far side, its streaks running down it.
    const wfX = POND.x + POND.rx + 0.4;
    for (const [dx, dy, dz, s] of [[0.2, 0.5, -0.9, 0.7], [0.3, 0.5, 0.9, 0.65], [0.4, 1.3, -0.6, 0.55], [0.4, 1.3, 0.6, 0.55], [0.5, 2.0, 0, 0.6]]) K.add(ico("#5a5853", s, s * 0.8, s, false, dx * 7), wfX + dx, dy, POND.z + dz);
    K.solid({ x: wfX + 0.35, z: POND.z, r: 0.95 });
    K.box(0.04, 2.0, 1.0, "#78bed7", wfX - 0.05, 1.0, POND.z, { emissive: 0.6, glow: true });
    K.add(blob(0.7, 0.12, 0.8, "#eef8fb", 12, 0.7), wfX - 0.4, 0.05, POND.z, { glow: true });
    const drop = noShadow(BL.models.box({ w: 0.02, h: 0.34, d: 0.035, color: "#eef8fb", emissive: 0.9 }));
    for (let i = 0; i < STREAKS; i++) K.node(`fall${i}`, drop, wfX - 0.08, 1.0, POND.z - 0.42 + i * 0.12, { glow: true });

    // The bell tower, its bell and the log that strikes it.
    const bh = headingTo(BELL.x, BELL.z, 0, 0), BT = K.group(BELL.x, 0, BELL.z, bh);
    BT.box(3.2, 0.5, 3.2, C.stone, 0, 0.25, 0);
    for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { BT.box(0.22, 3.1, 0.22, C.pillar, px, 2.05, pz); BT.solid({ x: px, z: pz, r: 0.16 }); }
    BT.box(2.7, 0.2, 0.2, C.pillar, 0, 3.5, 0);
    BT.add(frustum(4.2, 4.2, 0.22, 1.3, C.roof), 0, 4.2, 0);
    BT.box(1.2, 0.2, 0.3, C.roof, 0, 4.9, 0);
    BT.node("bell", (k) => {
      k.lathe([[0, 0], [0.62, 0], [0.6, 0.1], [0.53, 0.48], [0.46, 0.95], [0.41, 1.2], [0.27, 1.32], [0, 1.35]], C.bronze, 0, -1.35, 0, { seg: 28, emissive: 0.1 });
      k.box(0.08, 0.06, 0.08, C.dark, 0, 0.03, 0);
    }, 0, 3.4, 0, { target: { kind: "bell", tip: "Temple bell · it rings once a block; tap to ring it", radius: 0.8 } });
    BT.node("striker", (k) => {
      k.cyl(0.11, 0.11, 1.4, "#8a6a45", 0, -0.9, 0, { rz: Math.PI / 2, seg: 12 });
      for (const x of [-0.35, 0.35]) k.box(0.02, 0.9, 0.02, C.dark, x, -0.45, 0);
    }, 1.45, 3.5, 0);
    BT.solid({ x: 0, z: 0, hx: 1.6, hz: 1.6, top: 0.5 });
    BT.solid({ x: 0, z: 0, r: 0.66, below: 2.05 });

    // Point lights, the fixed ones first: the hall and its statue, the dusk over the front, then lanterns.
    K.light(0, 2.6, -9.2, 10, 0.7, 0.53, 0.34);
    K.light(0, 2.4, STATUE_Z + 2.2, 4, 0.5, 0.5, 0.5);
    K.light(0, L.c + L.R * 0.45, -L.R * 0.35, 30, 0.8, 0.52, 0.26);
    K.light(0, 6, -8, 22, 0.6, 0.42, 0.3);
    K.light(L.R * 0.3, L.c + L.R * 0.3, L.R * 0.4, 26, 0.75, 0.7, 0.62);
    K.light(0, 3.3, HALL_Z + 3.4, 5, 0.9, 0.35, 0.2);
    K.light(0, 1.4, 5.6, 5, 0.95, 0.7, 0.35);
    K.light(POND.x, 1.6, POND.z + 1.2, 7, 0.55, 0.75, 0.8);
    K.light(BELL.x - 1.2, 2.4, BELL.z + 1.6, 6, 0.9, 0.65, 0.35);
    K.light(PAGODA.x + 1.6, 1.6, PAGODA.z + 1.8, 6, 0.9, 0.65, 0.35);
    K.light(GONG.x - 0.6, 1.8, GONG.z + 1.2, 4, 0.9, 0.7, 0.4);
  };

  // What moves: the koi, the petals, the incense smoke, the lanterns, the paper lamps, the waterfall, and the bell and
  // the gong when struck. Every visit starts the bell's count afresh, so it rings for the blocks found while here.
  const animate = (nodes) => {
    const named = (prefix, n) => Array.from({ length: n }, (_, i) => nodes[`${prefix}${i}`]);
    const koi = named("koi", KOI.length), petals = named("petal", PETALS), smoke = named("smoke", SMOKE), streaks = named("fall", STREAKS);
    const lamps = named("lamp", LAMPS), paper = named("paper", 5), tips = named("tip", 3);
    const bell = nodes.bell, striker = nodes.striker, gong = nodes.gong;
    const rest = { gong: gong.rotation.x, bell: bell.rotation.z, striker: striker.rotation.z };
    // The petals' own drift: where each falls round, how high it is, how fast it falls and its phase.
    const pr = RM.paintKit.rng(44), fall = new Float32Array(PETALS * 5);
    for (let i = 0; i < PETALS; i++) { const [cx, cz] = CHERRY[i % 2]; fall.set([cx + (pr() - 0.5) * 3.2, cz + (pr() - 0.5) * 3.0, pr() * 4.2, 0.25 + pr() * 0.3, pr() * TAU], i * 5); }
    chime.height = null;
    let heard = chime.count;
    // A strike: how long since it began, -1 when still. The log is drawn back, let swing into the bell and rebounds;
    // the bell rocks and glows as it hums.
    const state = { bell: -1, gong: -1 };
    const STRIKE = { back: 0.8, swing: 0.2, pull: 0.5, hit: -0.25 };
    const ring = () => { if (state.bell < 0 || state.bell > STRIKE.back + STRIKE.swing + 0.6) state.bell = 0; };
    return {
      update(dt, t) {
        if (chime.count !== heard) { heard = chime.count; ring(); }
        for (let i = 0; i < koi.length; i++) {
          const k = KOI[i], a = k.a + t * k.w, n = koi[i];
          n.position.x = POND.x + Math.cos(a) * k.r * 0.95; n.position.z = POND.z + Math.sin(a) * k.r * 0.8;
          n.rotation.y = -a - (k.w > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 6 + i) * 0.12;
        }
        for (let i = 0; i < petals.length; i++) {
          const o = i * 5, n = petals[i];
          fall[o + 2] -= fall[o + 3] * dt;
          if (fall[o + 2] < 0.05) fall[o + 2] = 3.6 + ((i * 0.37 + t * 0.13) % 1) * 0.8;
          n.position.x = fall[o] + Math.sin(t * 1.3 + fall[o + 4]) * 0.4; n.position.y = fall[o + 2]; n.position.z = fall[o + 1] + Math.cos(t + fall[o + 4]) * 0.3;
          n.rotation.x = t * 2 + fall[o + 4]; n.rotation.y = t + fall[o + 4];
        }
        for (let i = 0; i < smoke.length; i++) {
          const s = i / smoke.length, k = (s + t * 0.1) % 1, n = smoke[i], size = (0.6 + k * 1.4) * (1 - k);
          n.position.x = BURNER.x + Math.sin(k * 9 + s * 5) * 0.18 * k; n.position.y = 1.18 + k * 1.5; n.position.z = BURNER.z + Math.cos(k * 7) * 0.14 * k;
          n.scale.x = n.scale.y = n.scale.z = size;
        }
        for (let i = 0; i < tips.length; i++) tips[i].glow = 0.75 + 0.25 * Math.sin(t * 2.3 + i * 2.1);
        for (let i = 0; i < lamps.length; i++) lamps[i].glow = 0.88 + 0.07 * Math.sin(t * 7.3 + i * 1.7) + 0.05 * Math.sin(t * 13.1 + i * 2.9);
        for (let i = 0; i < paper.length; i++) { paper[i].rotation.z = 0.035 * Math.sin(t * 0.8 + i * 1.3); paper[i].rotation.x = 0.025 * Math.sin(t * 0.6 + i * 2.1); }
        for (let i = 0; i < streaks.length; i++) streaks[i].position.y = 1.85 - ((t * 1.6 + i * 0.37) % 1) * 1.7;
        if (state.bell >= 0) {
          const s = state.bell += dt, hit = STRIKE.back + STRIKE.swing;
          let a;
          if (s < STRIKE.back) { const u = s / STRIKE.back; a = STRIKE.pull * u * u * (3 - 2 * u); }
          else if (s < hit) { const u = (s - STRIKE.back) / STRIKE.swing; a = STRIKE.pull + (STRIKE.hit - STRIKE.pull) * u * u; }
          else a = STRIKE.hit * Math.exp(-(s - hit) * 2.2) * Math.cos((s - hit) * 5);
          striker.rotation.z = rest.striker + a;
          const hum = s > hit ? Math.exp(-(s - hit) / 2.5) : 0;
          bell.rotation.z = rest.bell - 0.05 * hum * Math.sin((s - hit) * 4.4);
          bell.glow = 1 + 4 * hum;
          if (s > hit + 9) { state.bell = -1; striker.rotation.z = rest.striker; bell.rotation.z = rest.bell; bell.glow = 1; }
        }
        if (state.gong >= 0) {
          const s = state.gong += dt, hum = Math.exp(-s / 2);
          gong.rotation.x = rest.gong + 0.22 * hum * Math.sin(s * 3.6);
          gong.glow = 1 + 5 * hum;
          if (s > 8) { state.gong = -1; gong.rotation.x = rest.gong; gong.glow = 1; }
        }
      },
      tap(owner, hud) {
        if (owner.kind === "gong") { state.gong = 0; hud.toast("Bong. The gong hums a long while"); return true; }
        if (owner.kind === "bell") { ring(); hud.toast("The bell rings once a block, about every ten minutes; this one is for you"); return true; }
        if (owner.kind === "live") { hud.toast(chime.text ? `${chime.text} · the bell rings once a block` : "The bell rings once a block"); return true; }
        return false;
      }
    };
  };
  BL.timechainRoomKinds.temple = { plan, steps, animate, statue, STATUE_STEPS };
})();
