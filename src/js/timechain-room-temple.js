// Room 2, Satoshi's Temple: dusk over misty mountains drawn like an ink painting, a full moon rising beside the hall
// with cranes crossing and the first stars, and one quiet line under the moon with the latest block. Through a torii
// and up a stone path lined with stone lanterns and hedges to the main hall, where Satoshi sits on a Corten plinth
// under a scroll with an ensō: a replica of Valentina Picozzi's statue in Lugano, made with her permission, half as
// large again as life, its polished steel panels all but vanishing face on and closing into one seated figure from an
// angle. A tatami deck of cushions before it, incense smoking, a gong, a singing bowl; a five-tier pagoda hung with
// wind bells in a bamboo grove; a bell tower over an arched bridge across a koi pond with a waterfall; a raked rock
// garden; cherry and maple trees shedding petals. Walkers step up what is low (the hall's steps, the bridge, the
// cushions) and shoulder round the rest. The bell rings once a block; a tap or Space beside it rings the bell, strikes
// the gong, rings the bowl or the pagoda's wind bells (which ring for nothing else), each heard, feeds the koi, shakes a
// tree, puts out or lights a lantern, and wafts the incense.
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
  // A face from corners that may repeat (where a strip of a roof narrows to a point), wound to face `normal`.
  const poly = (geo, pts, color, emissive, normal) => {
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-7) out.push(p); }
    while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1], out[0][2] - out[out.length - 1][2]) <= 1e-7) out.pop();
    if (out.length >= 3) face(geo, out, color, emissive, normal);
  };
  // A hipped roof in the old way, in the frame of its eaves' middle (y 0 there): `w` by `d` at the eaves (w ≥ d), its
  // ridge `h` up and running `w - d` along x, every slope sagging as it falls (steep at the ridge, nearly flat at the
  // eaves) and every corner sweeping up by `lift`. On it: round tiles in rows down each slope, each ending at the eave
  // in its round end tile; a ridge along the top with a tile and a gold ornament at each end; a rounded ridge down each
  // hip (over the crease) to an upturned end; and under the eaves the fascia, the underside and the rafters' ends. With
  // `top`, the slopes stop that far in from the eaves (a roof skirting the storey above, against its wall). Returns
  // where a point (x, z) on it stands, so what hangs from it can find the eave.
  const roof = (k, o) => {
    const { w, d, h, lift = 0, top = Infinity, rows = 0.26, seg = 7, thick = 0.12, under = Infinity, rafters = 0.3 } = o;
    const geo = blank(), tiles = blank(), wood = blank(), a = w / 2, b = d / 2, r = a - b, qTop = Math.min(b, top);
    const f = (m) => 0.35 * m + 0.65 * m * m;
    const Y = (x, z, q) => h * f(Math.min(1, q / b)) + lift * Math.pow(Math.max(0, Math.abs(x) / a + Math.abs(z) / b - 1), 2.2);
    // The four slopes: their eave's half length, where (s along it, q in from it) stands, outward, and along.
    const SIDES = [[a, (s, q) => [s, b - q], [0, 1], [1, 0]], [a, (s, q) => [-s, q - b], [0, -1], [-1, 0]], [b, (s, q) => [a - q, -s], [1, 0], [0, -1]], [b, (s, q) => [q - a, s], [-1, 0], [0, 1]]];
    for (const [E, map, [ox, oz], [ax, az]] of SIDES) {
      const qmax = (s) => Math.max(0, Math.min(qTop, E - Math.abs(s)));
      const P = (s, q, down = 0) => { const [x, z] = map(s, q); return [x, Y(x, z, q) - down, z]; };
      // The strips down the slope: evenly across, with a strip's edge wherever the slope's top edge turns.
      const n = Math.max(2, Math.round(2 * E / rows)), turns = [E - qTop, -(E - qTop)].filter((t) => t > -E + 0.01 && t < E - 0.01);
      const at = [];
      for (let i = 0; i <= n; i++) { const t = -E + 2 * E * i / n; if (turns.every((u) => Math.abs(u - t) > 0.04)) at.push(t); }
      at.push(...turns); at.sort((u, v) => u - v);
      const up = [ox * 0.6, 1, oz * 0.6], downN = [-ox * 0.3, -1, -oz * 0.3];
      for (let i = 0; i + 1 < at.length; i++) {
        const s0 = at[i], s1 = at[i + 1], m0 = qmax(s0), m1 = qmax(s1);
        for (let j = 0; j < seg; j++) {
          poly(geo, [P(s0, m0 * j / seg), P(s1, m1 * j / seg), P(s1, m1 * (j + 1) / seg), P(s0, m0 * (j + 1) / seg)], C.roof, 0, up);
          // The underside, a roof's thickness below, as far in as it shows.
          const u0 = Math.min(m0, under), u1 = Math.min(m1, under);
          if (under > 0) poly(geo, [P(s0, u0 * j / seg, thick), P(s1, u1 * j / seg, thick), P(s1, u1 * (j + 1) / seg, thick), P(s0, u0 * (j + 1) / seg, thick)], C.dark, 0, downN);
        }
        // The fascia along the eave.
        poly(wood, [P(s0, 0), P(s1, 0), P(s1, 0, thick), P(s0, 0, thick)], C.dark, 0, [ox, 0, oz]);
        // A row of round tiles down the strip's middle, to just short of the hip, and its end tile at the eave.
        const sm = (s0 + s1) / 2, qm = qmax(sm) - 0.05, tw = Math.min(0.075, (s1 - s0) * 0.32), th = 0.06;
        if (qm < 0.12 || s1 - s0 < rows * 0.4) continue;
        let L = null, A = null, R = null;
        for (let j = 0; j <= seg; j++) {
          const q = qm * j / seg, c = P(sm, q), l = P(sm - tw, q), rr = P(sm + tw, q), ap = [c[0], c[1] + th, c[2]];
          if (L) {
            poly(tiles, [L, l, ap, A], C.tile, 0, [-ax, 0.8, -az]);
            poly(tiles, [A, ap, rr, R], C.tile, 0, [ax, 0.8, az]);
          }
          L = l; A = ap; R = rr;
        }
        const c0 = P(sm, 0), ring = [];
        for (let k2 = 0; k2 < 8; k2++) { const t = k2 / 8 * TAU; ring.push([c0[0] + ax * Math.cos(t) * tw * 1.15 + ox * 0.01, c0[1] + th * 0.45 + Math.sin(t) * tw * 1.05, c0[2] + az * Math.cos(t) * tw * 1.15 + oz * 0.01]); }
        poly(tiles, ring, C.tileEnd, 0.06, [ox, 0, oz]);
      }
      // The rafters' ends under the eave, square to it, clear of the swept corners.
      const pitch = Math.atan(h * (0.35 + 1.3 * 0.3 / b) / b), ry = Math.atan2(ox, oz);
      for (let t = -E + 0.6; t <= E - 0.6; t += rafters) {
        if (qmax(t) < 0.6) continue;
        const [x, y, z] = P(t, 0.3, thick + 0.04);
        k.group(x, y, z, ry).box(0.065, 0.065, 0.6, C.dark, 0, 0, 0, { rx: pitch });
      }
    }
    k.add(geo); k.add(tiles); k.add(wood);
    // The ridge along the top, its round tile, and at each end the end tile and its gold ornament.
    if (top >= b && r > 0.05) {
      k.box(2 * r + 0.3, 0.2, 0.26, C.roof, 0, h + 0.06, 0);
      k.cyl(0.09, 0.09, 2 * r + 0.27, C.tile, 0, h + 0.18, 0, { rz: Math.PI / 2, seg: 8 });
      for (const sx of [-1, 1]) {
        k.box(0.14, 0.42, 0.34, C.roof, sx * (r + 0.19), h + 0.2, 0);
        k.box(0.09, 0.3, 0.12, C.gold, sx * (r + 0.2), h + 0.55, 0, { rz: sx * 0.25, emissive: 0.15 });
        k.box(0.2, 0.07, 0.1, C.gold, sx * (r + 0.27), h + 0.72, 0, { rz: -sx * 0.6, emissive: 0.15 });
      }
    }
    // Down each hip, from its top to the corner, a rounded ridge, and its end turned up.
    const qh = Math.min(b, qTop);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const hp = (t) => { const q = qh * t, x = sx * (a - q), z = sz * (b - q); return [x, Y(x, z, q) + 0.05, z]; };
      for (let j = 0; j < seg; j++) along(k, ...hp(j / seg), ...hp((j + 1) / seg), 0.075, 0.075, C.tile, 6);
      const c = hp(0);
      along(k, ...c, c[0] + sx * 0.16, c[1] + 0.16, c[2] + sz * 0.16, 0.075, 0.05, C.tile, 6);
      k.ball(0.05, C.gold, c[0] + sx * 0.17, c[1] + 0.17, c[2] + sz * 0.17, { seg: 6, emissive: 0.15 });
    }
    return (x, z) => { const q = Math.min(b - Math.abs(z), a - Math.abs(x)); return Y(x, z, Math.max(0, q)); };
  };
  // Bracket sets under an eave where a post meets its beam: a block on the post, an arm across it with a block at each
  // end, and the block over them, in the frame of the post's top, the arm along x; `sc` scales the whole set (0.46
  // tall at 1).
  const brackets = (k, x, y, z, ry = 0, sc = 1) => {
    const G = k.group(x, y, z, ry), b = (w, h, d, color, bx, by, o) => G.box(w * sc, h * sc, d * sc, color, bx * sc, by * sc, 0, o);
    b(0.3, 0.14, 0.3, C.pillar, 0, 0.07);
    b(0.9, 0.12, 0.16, C.pillar, 0, 0.2);
    for (const sx of [-0.38, 0, 0.38]) b(0.18, 0.1, 0.18, C.pillar, sx, 0.31);
    b(1.3, 0.1, 0.16, C.pillar, 0, 0.41);
    for (const sx of [-0.55, 0.55]) b(0.06, 0.06, 0.17, C.gold, sx, 0.2, { emissive: 0.12 });
  };
  // A cut paving stone, its corners [[x, z], ...] round a convex outline, `h` up with its top edge chamfered.
  const paver = (geo, pts, h, color, dark) => {
    const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cz = pts.reduce((t, p) => t + p[1], 0) / pts.length, ch = Math.min(0.012, h * 0.5);
    const inner = pts.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x - dx / l * 0.022, z - dz / l * 0.022]; });
    face(geo, inner.map(([x, z]) => [x, h, z]), color, 0, UP);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, [x0, z0] = pts[i], [x1, z1] = pts[j], n = [z1 - z0, 0, x0 - x1];
      const out = (n[0] * (x0 - cx) + n[2] * (z0 - cz)) > 0 ? n : [-n[0], 0, -n[2]];
      face(geo, [[x0, -0.01, z0], [x1, -0.01, z1], [x1, h - ch, z1], [x0, h - ch, z0]], dark, 0, out);
      face(geo, [[x0, h - ch, z0], [x1, h - ch, z1], [inner[j][0], h, inner[j][1]], [inner[i][0], h, inner[i][1]]], color, 0, [out[0], 1.4, out[2]]);
    }
  };
  // The paths' stones: the long path from the door paved in rows of cut stones of mixed lengths, the others laid in
  // stepping stones, irregular and rounded, each a little off the line and turned; all a couple of centimetres proud
  // of their gravel and chamfered, in granite of a few tones.
  const pathStones = () => {
    const geo = blank(), r = RM.paintKit.rng(57), TONES = ["#8f8a80", "#86817a", "#9a958b", "#7f7b74", "#948e84", "#8a867c", "#a09a8e"], SIDE = "#5e5a54";
    const tone = () => TONES[Math.floor(r() * TONES.length)];
    for (const [x0, z0, x1, z1, w] of PATHS) {
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
      const at = (u, v) => [x0 + ux * u - uz * v, z0 + uz * u + ux * v];
      if (w >= 1.6) {
        for (let u = 0.04; u < len - 0.2;) {
          const depth = Math.min(len - 0.04 - u, 0.34 + r() * 0.18), j = () => (r() - 0.5) * 0.018;
          for (let v = -w / 2 + 0.04; v < w / 2 - 0.1;) {
            const rest = w / 2 - 0.04 - v;
            let width = 0.45 + r() * 0.55;
            if (rest - width < 0.3) width = rest;
            paver(geo, [at(u + j(), v + j()), at(u + j(), v + width - 0.035 + j()), at(u + depth - 0.035 + j(), v + width - 0.035 + j()), at(u + depth - 0.035 + j(), v + j())], 0.018 + r() * 0.008, tone(), SIDE);
            v += width;
          }
          u += depth;
        }
      } else {
        const n = Math.max(1, Math.round(len / 0.78));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n * len, v = (r() - 0.5) * 0.16, rad = 0.3 + r() * 0.06, corners = 7 + Math.floor(r() * 3), turn = r() * TAU, sq = 0.82 + r() * 0.15, pts = [];
          for (let c = 0; c < corners; c++) { const t = turn + c / corners * TAU, rr = rad * (0.95 + r() * 0.07); pts.push(at(u + Math.cos(t) * rr * sq, v + Math.sin(t) * rr)); }
          const tone1 = tone(), h1 = 0.022 + r() * 0.01, [cx, cz] = at(u, v);
          // Where a stepping path sets out from the paved one, the paving carries it.
          if (offPath(cx, cz, 1.6) < rad) continue;
          paver(geo, pts, h1, tone1, SIDE);
        }
      }
    }
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
    red: "#b8402a", dark: "#2a1a12", stone: "#8a857c", stoneDark: "#6e6a63", wood: "#5a3a22", pillar: "#7a2a1e", roof: "#2e3440", gold: "#d4a63a", paper: "#e6dfd0",
    plat: "#9a948a", bark: "#4a2e1e", hedge: "#3f6b3a", moss: "#55733a", lamp: "#ffc46b", lampRed: "#e8573a", cushion: "#2b3566", mat: "#1d2447", bronze: "#7a5a2e",
    bronzeDark: "#5a4020", rope: "#c9b48a", tile: "#3d4554", tileEnd: "#4d5667"
  };
  const HALL_Z = -9.6, DECK_Z = -3.9, STATUE_Z = HALL_Z - 0.7;
  const POND = { x: 7.2, z: -1.8, rx: 3.6, rz: 3.2 }, BELL = { x: 7.6, z: -8.8 }, PAGODA = { x: -8.4, z: -4.6 }, ROCK = { x: -6.6, z: -9.2, r: 2.5 };
  const CHERRY = [[-5.2, 6.2], [5.2, 8.2]], MAPLE = { x: -9.2, z: 3.0 }, GONG = { x: 3.95, z: DECK_Z - 1.2 }, BURNER = { x: 0, z: -0.95 }, BOWL = { x: -3.2, z: DECK_Z + 1.9 };
  const TREES = [{ x: CHERRY[0][0], z: CHERRY[0][1], name: "Cherry" }, { x: CHERRY[1][0], z: CHERRY[1][1], name: "Cherry" }, { x: MAPLE.x, z: MAPLE.z, name: "Maple" }];
  const GARDEN_ROCKS = [[-7.2, -9.6, 0.55], [-5.9, -8.6, 0.38], [-6.2, -10.3, 0.3]];
  // The stone lanterns: three pairs up the path, one by the pond's path, one by the bell tower and one by the pagoda's
  // path, each clear of every path.
  const LANTERN_AT = [[-2.0, 7.2], [2.0, 7.2], [-2.0, 4.3], [2.0, 4.3], [-2.0, 1.75], [2.0, 1.75], [POND.x - 1.6, 4.5], [BELL.x - 2.4, BELL.z + 2.6], [-6.3, -1.5]];
  // The paper lamps along the hall's front, the pagoda's tiers and the bamboo's clumps.
  const PAPER = [-3.0, -1.5, 0, 1.5, 3.0], TIERS = 5, CLUMPS = 6;
  // The torii's plaque: its size, height, how far out in front of the strut and how far it leans forward.
  const PLAQUE = { w: 0.48, h: 0.62, y: 3.12, z: 0.175, lean: 0.08 };
  // The cranes flying round under the dome, high against its sky near the crown and at about half life size, so they
  // read as far off: how many, the loop's radius, height and pace (radians a second), how much the loop swings in and
  // out, how far apart the V's ranks fly, and their size.
  const BIRDS = 6, FLIGHT = { r: 6.5, y: 14.8, w: 0.14, swing: 0.5, apart: 0.5, scale: 0.55 };
  const MOON = { az: 22, el: 34 }, LINE = { az0: 10, az1: 34, el0: 25, el1: 29, w: 1200 };
  const SKY = [[90, "#0c0f2c"], [55, "#2a2456"], [28, "#6e4a7a"], [12, "#c9756a"], [3, "#f0b07a"], [-90, "#f0b07a"]];
  // The bridge's arch: its deck's height at `t` of the way across, from the pond's near end (+z) to the bell tower's.
  // `half` is half its width between the rails, wide enough that the widest Ooga walks it with room either side; it
  // is walked as `walk` low steps.
  const BRIDGE = { z0: POND.z + POND.rz + 0.9, z1: POND.z - POND.rz - 0.9, rise: 1.1, base: 0.12, walk: 28, half: 1.0 };
  const archY = (t) => BRIDGE.base + BRIDGE.rise * Math.sin(Math.PI * t);
  // The bell tower faces the middle of the room; the foot of the step up onto it.
  const BELL_YAW = headingTo(BELL.x, BELL.z, 0, 0), BELL_STEP = { x: BELL.x - 2.15 * Math.sin(BELL_YAW), z: BELL.z - 2.15 * Math.cos(BELL_YAW) };
  // The stone paths, each [x0, z0, x1, z1, width]: up from the door to the deck, across to the pond's bridge, from the
  // bridge on to the bell tower's step and from the deck to the pagoda. Nothing stands on them but the walkers.
  const PATHS = [[0, 14.0, 0, -0.4, 2.0], [0.8, 3.0, POND.x, 3.0, 1.2], [POND.x, BRIDGE.z1 - 0.45, BELL_STEP.x, BELL_STEP.z, 1.2], [-0.8, 1.2, PAGODA.x + 1.6, PAGODA.z + 1.0, 1.2]];
  // How far (x, z) is from a path's edge (negative on it), of the paths at least `wide` across.
  const offPath = (x, z, wide = 0) => {
    let best = Infinity;
    for (const [x0, z0, x1, z1, w] of PATHS) {
      if (w < wide) continue;
      const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - x0 - dx * t, z - z0 - dz * t) - w / 2);
    }
    return best;
  };
  // The koi's varieties: kohaku (white, red), sanke (white, red, black), ogon (gold), showa (black, red, white) and
  // chagoi (brown): each its body's colour and its patches, [x along it, z across, size, colour].
  const KOI_KINDS = [
    ["#f4f1e6", [[0.09, 0, 0.055, "#d8401b"], [-0.04, 0.01, 0.05, "#d8401b"]]],
    ["#f4f1e6", [[0.07, -0.01, 0.05, "#d8401b"], [-0.06, 0.01, 0.035, "#d8401b"], [0.01, 0.02, 0.022, "#1c1c1c"], [-0.1, -0.015, 0.018, "#1c1c1c"]]],
    ["#f2a01b", [[0.1, 0, 0.04, "#f8d27a"]]],
    ["#262422", [[0.08, 0.01, 0.045, "#d8401b"], [-0.03, -0.015, 0.04, "#f4f1e6"], [-0.09, 0.01, 0.03, "#d8401b"]]],
    ["#a8682e", [[0.11, 0, 0.035, "#c98a4a"]]]
  ];
  // The koi, each with its own ways: where it starts (`r` out from the middle, `a` round), the speed it likes to cruise
  // at (m/s), the two slow rhythms (rad/s) its wandering turns follow and their phase, and how deep it keeps.
  const KOI = Array.from({ length: 10 }, (_, i) => {
    const h = (n) => ((Math.sin((i + 1) * n) * 43758.5453) % 1 + 1) % 1;
    return { r: 0.7 + (i % 4) * 0.55, a: i * 0.9, cruise: 0.08 + 0.13 * h(12.9), f1: 0.15 + 0.2 * h(78.2), f2: 0.4 + 0.3 * h(37.7), p: TAU * h(4.1), depth: 0.035 * h(91.3) };
  });
  const PETALS = 30, SMOKE = 7, STREAKS = 12, RIPPLES = 4, PELLETS = 18;
  // The pond's water stands `WATER` up, deep enough for the koi to swim under it and be seen through it.
  const WATER = 0.08;
  // The statue at half as large again as life, on a plinth grown to carry it: its half sizes and height.
  const STATUE_SCALE = 1.5, PLINTH = { W: 0.95, D: 0.9, H: 0.85 };
  // The dome's own picture and its map, kept when painted, so the line under the moon paints the sky behind it.
  let domeCanvas = null, domeMap = null;
  // The latest block the line under the moon has read, and how many new ones it has seen: the bell rings for each.
  const chime = { height: null, count: 0, text: "" };

  // ---------- the temple's sounds ----------
  // The bell, the gong, the singing bowl and the pagoda's wind bells, synthesized and pooled: every voice is built once,
  // the first time a gesture lets the page make sound, as pairs of partials a hair apart (so they beat as cast bronze
  // does) whose gains a strike schedules, with a burst of filtered noise for the blow itself. Each `f` is a voice's
  // lowest partial in hertz; `parts` are [ratio, level, seconds to die away]; `bloom` slows the higher partials' swell
  // (a gong blooms after the hit); `thud` is the blow's [band in hertz, Q, level, seconds]; `reach` is how far off it
  // sounds half as loud. Everything plays through the page-wide mute (`BL.sound.output`); closed on leaving.
  const VOICES = {
    bell: { f: 73.4, parts: [[0.5, 0.55, 24], [1, 1, 18], [1.183, 0.5, 12], [1.505, 0.32, 9], [2, 0.34, 7], [2.51, 0.2, 5], [2.97, 0.16, 4], [4.07, 0.09, 2.5]], beat: 0.55, bloom: 0, thud: [180, 0.9, 0.9, 0.22], level: 0.2, reach: 16 },
    gong: { f: 98, parts: [[1, 0.75, 7], [1.52, 0.5, 6.5], [2.03, 0.46, 6], [2.48, 0.38, 5], [3.02, 0.32, 4.5], [3.61, 0.24, 3.5], [4.23, 0.18, 3], [5.1, 0.12, 2.4]], beat: 1.3, bloom: 0.5, thud: [140, 0.7, 1.2, 0.12], level: 0.18, reach: 9 },
    bowl: { f: 261.6, parts: [[1, 1, 14], [2.76, 0.42, 8], [5.4, 0.16, 4], [8.93, 0.06, 2]], beat: 1.9, bloom: 0, thud: [2200, 2.5, 0.4, 0.03], level: 0.22, reach: 7 }
  };
  // The wind bells: a pentatonic run of small bells, each struck note ringing with its overtone.
  const CHIME_NOTES = [1568, 1760, 2093, 2349, 2637, 3136], CHIME_OVERTONE = 2.76;
  const sounds = () => {
    let ctx = null, disposed = false, nextChime = 0;
    const voices = {}, chimes = [];
    // A pooled gain taken from wherever it is now to `peak` over `attack`, then let die away over `fade` seconds.
    const envelope = (param, t, peak, attack, fade) => {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else { param.cancelScheduledValues(t); param.setValueAtTime(param.value, t); }
      param.linearRampToValueAtTime(peak, t + attack);
      param.setTargetAtTime(0, t + attack, fade / 4.6);
    };
    const build = () => {
      ctx = new AudioContext();
      const out = ctx.createGain();
      out.connect(BL.sound.output(ctx));
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
      let seed = 2140;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; data[i] = (seed >>> 0) / 2147483648 - 1; }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer; noise.loop = true; noise.start();
      const tone = (hz) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = hz; g.gain.value = 0; o.connect(g); g.connect(out); o.start(); return { o, g }; };
      for (const name in VOICES) {
        const v = VOICES[name], parts = [];
        v.parts.forEach(([ratio, level, fade], i) => { for (const side of [-1, 1]) parts.push({ ...tone(v.f * ratio + side * v.beat / 2), level: level / 2, fade, attack: 0.004 + v.bloom * i / v.parts.length }); });
        const band = ctx.createBiquadFilter(), thud = ctx.createGain();
        band.type = "bandpass"; band.frequency.value = v.thud[0]; band.Q.value = v.thud[1]; thud.gain.value = 0;
        noise.connect(band); band.connect(thud); thud.connect(out);
        voices[name] = { v, parts, thud };
      }
      for (const note of CHIME_NOTES) chimes.push([tone(note), tone(note * CHIME_OVERTONE)]);
    };
    // A context only once the page has had a gesture (a tap or a key in the room makes it), woken if the browser has
    // suspended it.
    const wake = () => {
      if (disposed || typeof AudioContext === "undefined") return false;
      if (!ctx) {
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
        build();
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    };
    // How loud a sound `reach` metres from half as loud is at the ear.
    const near = (ear, at, reach) => { const d = Math.hypot(ear.x - at.x, ear.z - at.z) / reach; return 1 / (1 + d * d); };
    const strike = (name, strength, ear, at) => {
      if (!wake()) return;
      const { v, parts, thud } = voices[name], t = ctx.currentTime, k = v.level * strength * near(ear, at, v.reach);
      for (const p of parts) envelope(p.g.gain, t, p.level * k, p.attack, p.fade);
      envelope(thud.gain, t, v.thud[2] * k, 0.003, v.thud[3]);
    };
    // A breath of wind through the wind bells: a few notes over a second or two, each on the next small bell.
    const ring = (strength, ear, at) => {
      if (!wake()) return;
      const t = ctx.currentTime, k = 0.05 * strength * near(ear, at, 9), n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const [a, b] = chimes[nextChime], when = t + Math.random() * 1.6, note = CHIME_NOTES[Math.floor(Math.random() * CHIME_NOTES.length)];
        nextChime = (nextChime + 1) % chimes.length;
        a.o.frequency.setValueAtTime(note, when); b.o.frequency.setValueAtTime(note * CHIME_OVERTONE, when);
        envelope(a.g.gain, when, k, 0.002, 1.6); envelope(b.g.gain, when, k * 0.35, 0.002, 0.7);
      }
    };
    return {
      wake, strike, ring,
      // How loud each voice is just now (the sum of its partials' gains), for the debug handle.
      get stats() {
        const level = (name) => voices[name] ? +voices[name].parts.reduce((sum, p) => sum + p.g.gain.value, 0).toFixed(4) : 0;
        return { contexts: ctx ? 1 : 0, state: ctx ? ctx.state : "none", voices: Object.keys(voices).length, chimes: chimes.length, levels: { bell: level("bell"), gong: level("gong"), bowl: level("bowl") } };
      },
      dispose() { disposed = true; if (ctx) ctx.close().catch(() => {}); ctx = null; }
    };
  };

  // A stone lantern of the kasuga kind, six-sided as they are: its foot in two tiers, the round post with a band
  // round its middle, the platform flaring up under the firebox, the firebox between six corner posts with a sill and
  // a lintel, two of its sides open as windows and the other four carved panels (a moon, a deer), its light inside on
  // a node of its own (it flickers, and a tap or Space puts it out or lights it), the roof whose six corners curl up
  // like fern fronds, and the jewel on its lotus at the top; moss on the roof and the foot. The kit's hexagons have a
  // corner at +x, so a side's middle looks out at 30 degrees and every 60 after.
  // Its stone is one mesh about its foot, shared by every lantern; a click lands on it or the light inside.
  const lanternStone = (K) => {
    const x = 0, z = 0, six = { seg: 6 }, side = (k) => (30 + 60 * k) * DEG, corner = (k) => 60 * k * DEG;
    K.cyl(0.4, 0.44, 0.12, C.stone, x, 0.06, z, six);
    K.cyl(0.3, 0.36, 0.08, C.stoneDark, x, 0.16, z, six);
    K.cyl(0.11, 0.13, 0.72, C.stone, x, 0.56, z, { seg: 12 });
    K.torus(0.128, 0.022, C.stoneDark, x, 0.56, z, { seg: 12, sides: 4 });
    K.cyl(0.34, 0.15, 0.16, C.stone, x, 1.0, z, six);
    for (let k = 0; k < 6; k++) K.add(blob(0.07, 0.03, 0.045, C.stoneDark, 6), x + Math.cos(side(k)) * 0.22, 0.97, z + Math.sin(side(k)) * 0.22);
    K.cyl(0.36, 0.36, 0.04, C.stone, x, 1.1, z, six);
    K.cyl(0.27, 0.27, 0.05, C.stone, x, 1.145, z, six);
    K.cyl(0.27, 0.27, 0.05, C.stone, x, 1.495, z, six);
    for (let k = 0; k < 6; k++) K.box(0.06, 0.3, 0.06, C.stone, x + Math.cos(corner(k)) * 0.235, 1.32, z + Math.sin(corner(k)) * 0.235, { ry: -corner(k) });
    for (const k of [1, 2, 4, 5]) {
      const a = side(k), px = x + Math.cos(a) * 0.2, pz = z + Math.sin(a) * 0.2, ry = Math.PI / 2 - a;
      K.box(0.18, 0.3, 0.03, C.stone, px, 1.32, pz, { ry });
      const G = K.group(x + Math.cos(a) * 0.217, 1.32, z + Math.sin(a) * 0.217, ry);
      if (k % 3 === 1) G.cyl(0.045, 0.045, 0.004, C.stoneDark, 0, 0.02, 0, { rx: Math.PI / 2, seg: 12 });
      else { G.box(0.09, 0.03, 0.004, C.stoneDark, 0, 0.0, 0); G.box(0.02, 0.06, 0.004, C.stoneDark, 0.035, 0.04, 0); G.box(0.015, 0.05, 0.004, C.stoneDark, -0.03, -0.035, 0); G.box(0.015, 0.05, 0.004, C.stoneDark, 0.03, -0.035, 0); }
    }
    K.cyl(0.52, 0.52, 0.05, C.stoneDark, x, 1.545, z, six);
    K.cyl(0.17, 0.52, 0.2, C.stoneDark, x, 1.67, z, six);
    for (let k = 0; k < 6; k++) {
      const G = K.group(x + Math.cos(corner(k)) * 0.5, 1.56, z + Math.sin(corner(k)) * 0.5, Math.PI / 2 - corner(k));
      G.box(0.08, 0.05, 0.12, C.stoneDark, 0, 0.03, 0.03, { rx: -0.7 });
      G.torus(0.035, 0.016, C.stoneDark, 0, 0.1, 0.07, { ry: Math.PI / 2, rz: Math.PI / 2, seg: 8, sides: 4 });
    }
    for (const [dx, dz, s] of [[0.2, 0.08, 0.13], [-0.12, 0.2, 0.1], [-0.15, -0.16, 0.11]]) K.add(blob(s, 0.035, s * 0.8, C.moss, 7), x + dx, 1.63, z + dz);
    K.add(blob(0.16, 0.04, 0.12, C.moss, 7), x + 0.22, 0.13, z - 0.18);
    K.cyl(0.1, 0.07, 0.05, C.stoneDark, x, 1.795, z, { seg: 8 });
    K.ball(0.08, C.stoneDark, x, 1.88, z, { seg: 8 });
    K.cyl(0, 0.05, 0.1, C.stoneDark, x, 1.99, z, { seg: 6 });
  };
  const lantern = (K, x, z, i, flame, stone) => {
    const spec = K.node(`lantern${i}`, stone || lanternStone, x, 0, z, { target: { kind: "lantern", tip: "Stone lantern · tap to put it out, or light it", radius: 1.2, index: i, pick: [`lantern${i}`, `lamp${i}`] } });
    K.node(`lamp${i}`, flame, x, 1.32, z, { glow: true });
    K.solid({ x, z, r: 0.38 });
    return spec.geometry;
  };
  // A round part from (ax, ay, az) to (bx, by, bz), `r0` thick at its start and `r1` at its end: a trunk's length, a
  // limb, a root, a reed.
  const along = (k, ax, ay, az, bx, by, bz, r0, r1, color, seg = 7) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    k.cyl(r1, r0, len, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, { rz: Math.acos(Math.max(-1, Math.min(1, dy / len))), ry: Math.atan2(dz, -dx), seg });
  };
  // A tree: a trunk that leans and bends as it rises, flaring into its roots, five limbs each forking into two
  // branches, and its crown of blossom or leaves gathered at the branch tips on a node of its own (`name`), pivoting
  // where the limbs leave the trunk, so it sways and shakes. A maple spreads lower and lays its leaves in flat layers.
  const tree = (K, x, z, colors, seed, name, index, tip, maple) => {
    const r = RM.paintKit.rng(seed), trunk = [[x, 0, z]], radius = [0.27, 0.22, 0.18, 0.15, 0.13];
    for (let i = 1; i <= 4; i++) { const p = trunk[i - 1]; trunk.push([p[0] + (maple ? -0.12 : 0.1) * (i % 2 ? 1 : 0.4) + (r() - 0.5) * 0.08, i * 0.62, p[2] + (r() - 0.5) * 0.12]); }
    const top = trunk[3], tips = [];
    // The wood is one mesh about the tree's foot (a click on it shakes the tree, as one on its crown does).
    K.node(`trunk${index}`, (k0) => {
      const K = k0.group(-x, 0, -z);
      for (let i = 1; i <= 4; i++) {
        along(K, ...trunk[i - 1], ...trunk[i], radius[i - 1], radius[i], C.bark, 10);
        if (i < 4) K.ball(radius[i] * 1.02, C.bark, ...trunk[i], { seg: 10 });
      }
      for (let k = 0; k < 5; k++) { const a = (k / 5 + r() * 0.1) * TAU; along(K, x, 0.3, z, x + Math.cos(a) * 0.62, 0.02, z + Math.sin(a) * 0.62, 0.13, 0.03, C.bark, 6); }
      for (let k = 0; k < 5; k++) {
        const a = (k / 5 + r() * 0.12) * TAU, up = maple ? 0.25 + r() * 0.2 : 0.55 + r() * 0.35, len = (maple ? 1.7 : 1.5) + r() * 0.4, from = trunk[k % 2 ? 3 : 4];
        const end = [from[0] + Math.cos(a) * Math.cos(up) * len, from[1] + Math.sin(up) * len, from[2] + Math.sin(a) * Math.cos(up) * len];
        along(K, ...from, ...end, 0.1, 0.05, C.bark, 7);
        const fork = [from[0] + (end[0] - from[0]) * 0.6, from[1] + (end[1] - from[1]) * 0.6, from[2] + (end[2] - from[2]) * 0.6];
        for (const turn of [-0.6, 0.6]) {
          const b = a + turn, l = 0.6 + r() * 0.4, tipAt = [fork[0] + Math.cos(b) * l, fork[1] + (maple ? 0.12 : 0.35) * l, fork[2] + Math.sin(b) * l];
          along(K, ...fork, ...tipAt, 0.05, 0.025, C.bark, 6);
          tips.push(tipAt);
        }
        tips.push(end);
      }
    }, x, 0, z, { target: { kind: "tree", tip, radius: 4.2, index, pick: [`trunk${index}`, name] } });
    K.node(name, (k) => {
      tips.forEach(([tx, ty, tz], i) => {
        for (let c = 0; c < 2; c++) {
          const s = (maple ? 0.42 : 0.38) + r() * 0.24, sy = maple ? 0.45 : 0.8;
          k.add(ico(colors[(i + c) % colors.length], s, s * sy, s, c === 0, r() * TAU, 0.14), tx - top[0] + (r() - 0.5) * 0.4, ty - top[1] + (c ? 0.15 : 0) + (r() - 0.5) * 0.2, tz - top[2] + (r() - 0.5) * 0.4);
        }
      });
    }, top[0], top[1], top[2]);
    K.solid({ x, z, r: 0.3 });
  };

  // The Corten plinth about its foot's middle, `PLINTH` its half sizes and height: weathered steel in mottled patches
  // of rust.
  const plinth = () => {
    const geo = blank(), r = RM.paintKit.rng(71), { W, H, D } = PLINTH, n = 0.12;
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

  // ---------- its door ----------
  // Shōji: paper leaves in a dark timber lattice over a solid wooden foot, a round pull let into each, in a timber
  // frame between round posts under a little tiled roof with curled ends, a red paper lantern hung either side.
  const door = {
    casing: "#e6dfd0", frame: "#2a1a12", header: "#2a1a12", word: "#e8c070", strip: null, chain: false,
    leaf: "#efe7d4", seam: "#2a1a12", plate: "#2a1a12", face: "#b8402a", mark: "#f3eee0",
    leafFace(side, H) {
      const dark = "#3a2616", x0 = -0.75, x1 = 0.75, top = H.D;
      H.rect(x0, 0, x1, 0.55, "#5a3a22");
      for (const [a, b] of [[x0, x0 + 0.06], [x1 - 0.06, x1]]) H.rect(a, 0, b, top, dark, 0, 1);
      for (const y of [0, 0.55, top - 0.06]) H.rect(x0, y, x1, y + 0.06, dark, 0, 1);
      for (let k = 1; k < 3; k++) H.rect(x0 + k * 0.5 - 0.0125, 0.55, x0 + k * 0.5 + 0.0125, top, dark, 0, 1);
      for (let y = 0.99; y < top - 0.1; y += 0.44) H.rect(x0, y - 0.0125, x1, y + 0.0125, dark, 0, 1);
      H.ring(H.inner + side * 0.22, 1.05, 0.06, 0.018, "#1a100a", 0, 12, 2);
    }
  };
  const doorTrim = (K, L) => {
    const d = RM.doorway(L), z = d.Z - 0.3, x = d.W + d.F + 0.1;
    K.box(4.6, 0.1, 0.62, C.roof, 0, d.head + 0.13, z);
    K.box(4.2, 0.14, 0.5, "#3a3f4a", 0, d.head + 0.24, z);
    for (const sx of [-1, 1]) K.box(0.5, 0.1, 0.62, C.roof, sx * 2.45, d.head + 0.2, z, { rz: sx * 0.3 });
    for (const sx of [-1, 1]) K.cyl(0.08, 0.09, d.head + 0.1, C.dark, sx * x, (d.head + 0.1) / 2, d.Z - 0.12, { seg: 10 });
    for (const sx of [-1, 1]) {
      K.box(0.02, 0.4, 0.02, C.dark, sx * 2.32, 3.15, d.Z - 0.35);
      K.cyl(0.17, 0.17, 0.36, C.lampRed, sx * 2.32, 2.75, d.Z - 0.35, { emissive: 0.85, seg: 14, glow: true });
      K.cyl(0.12, 0.12, 0.04, C.dark, sx * 2.32, 2.95, d.Z - 0.35, { seg: 12 });
      K.cyl(0.12, 0.12, 0.04, C.dark, sx * 2.32, 2.55, d.Z - 0.35, { seg: 12 });
    }
  };

  const plan = (K, L) => {
    doorTrim(K, L);
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
      // A soft round puff of colour `c` (an "r,g,b" string) `a` strong, `rr` across, at (x, y) in the frame `at` set.
      const puff = (x, y, rr, c, a) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.55, `rgba(${c},${a * 0.6})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      };
      // Wisps of cirrus high up, catching the last light, kept off the moon and the line under it.
      for (let i = 0; i < 30; i++) {
        const az = r() * 360 - 180, el = 31 + r() * 24, len = m(60 + r() * 140), tilt = (r() - 0.5) * 0.3;
        if (Math.abs(az - MOON.az) < 22 && el < 44) continue;
        // Every random draw is made before `at`, which draws a thing again a canvas either side of the seam.
        const wisps = Array.from({ length: 7 }, () => [(r() - 0.5) * len, (r() - 0.5) * m(5), len * (0.3 + r() * 0.4), m(1.2 + r() * 2.2),
          `rgba(255,${200 + Math.floor(r() * 30)},${190 + Math.floor(r() * 30)},${(0.05 + r() * 0.07).toFixed(3)})`]);
        at(az, el, 1, () => {
          ctx.rotate(tilt);
          for (const [dx, dy, w, h, c] of wisps) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(dx, dy, w, h, 0, 0, TAU); ctx.fill(); }
        });
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
      // Banks of cumulus low over the far hills: shadowed undersides in dusky violet, tops lit warm by the sunset, a
      // bright rim along their crowns.
      for (let i = 0; i < 16; i++) {
        const az = (i + r() * 0.7) / 16 * 360 - 180, el = 13 + r() * 9, W = m(70 + r() * 90), H = m(14 + r() * 12);
        if (Math.abs(az - MOON.az) < 18 && el > 19) continue;
        const n = 14 + Math.floor(r() * 8), puffs = [];
        for (let p = 0; p < n; p++) { const u = (r() - 0.5) * 2, x = u * W * 0.5, top = H * (1 - u * u) * (0.55 + r() * 0.45); puffs.push([x, -top * r(), m(9 + r() * 14) * (1 - 0.4 * Math.abs(u))]); }
        at(az, el, 1, () => {
          for (const [x, y, rr] of puffs) puff(x, y + rr * 0.2, rr * 1.1, "92,70,112", 0.55);
          for (const [x, y, rr] of puffs) puff(x, y - rr * 0.25, rr * 0.85, "236,160,150", 0.42);
          for (const [x, y, rr] of puffs) puff(x - rr * 0.1, y - rr * 0.55, rr * 0.45, "255,214,190", 0.35);
        });
      }
      // Five ranges of hills, far to near: each a ridge of folded peaks (the same all the way round, so none breaks over
      // the door), paler, bluer and lighter far off and darker near, rim-lit along their crests, streaked down their
      // gullies like brushwork, misted at their feet, and pines along the nearest two ridges.
      const e0 = ROOMS.edgeEl(L, 0) / DEG;
      const RANGES = [
        { base: 6.5, amp: 14, k: 3, top: "158,130,178", foot: "214,170,176", mist: 0.42, rim: 0.35 },
        { base: 4.5, amp: 11, k: 4, top: "118,96,150", foot: "190,140,160", mist: 0.38, rim: 0.3 },
        { base: 3.0, amp: 8.5, k: 5, top: "84,68,120", foot: "160,112,140", mist: 0.34, rim: 0.22 },
        { base: 1.6, amp: 6.5, k: 7, top: "54,44,86", foot: "110,80,112", mist: 0.28, rim: 0.14, trees: 0.9 },
        { base: 0.4, amp: 4.6, k: 9, top: "30,25,50", foot: "52,40,66", mist: 0.18, rim: 0.08, trees: 0.6 }
      ];
      RANGES.forEach((R0, j) => {
        const ks = [R0.k, Math.round(R0.k * 2.1), Math.round(R0.k * 4.3), Math.round(R0.k * 8.9), Math.round(R0.k * 17.6), Math.round(R0.k * 35.2)];
        const ph = ks.map(() => r() * TAU), ws = [1, 0.5, 0.28, 0.15, 0.08, 0.04];
        const fold = (az) => {
          const a = az * DEG;
          let v = 0, n = 0;
          for (let o = 0; o < ks.length; o++) { v += ws[o] * Math.pow(1 - Math.abs(Math.sin(ks[o] * a / 2 + ph[o])), 1.6); n += ws[o]; }
          return v / n;
        };
        const ridge = (az) => e0 + R0.base + R0.amp * fold(az);
        ctx.beginPath(); ctx.moveTo(0, D.y(e0 - 3));
        for (let az = -180; az <= 180; az += 0.25) ctx.lineTo((az + 180) / 360 * D.W, D.y(ridge(az)));
        ctx.lineTo(D.W, D.y(e0 - 3)); ctx.closePath();
        const g = ctx.createLinearGradient(0, D.y(e0 + R0.base + R0.amp), 0, D.y(e0 - 1));
        g.addColorStop(0, `rgb(${R0.top})`); g.addColorStop(0.6, `rgb(${R0.top})`); g.addColorStop(1, `rgb(${R0.foot})`);
        ctx.fillStyle = g; ctx.fill();
        // The crest, lit.
        ctx.strokeStyle = `rgba(255,200,175,${R0.rim})`; ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let az = -180; az <= 180; az += 0.25) { const x = (az + 180) / 360 * D.W, y = D.y(ridge(az)) + 1; if (az === -180) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        // Gullies: strokes down from the crest, darker, following the fall.
        ctx.lineCap = "round";
        for (let i = 0; i < 260; i++) {
          const az = r() * 360 - 180, top = ridge(az), len = (0.6 + r() * 2.4) * (1 + j * 0.2), lean = (fold(az + 0.4) - fold(az - 0.4)) * 6;
          ctx.strokeStyle = `rgba(${j > 2 ? "12,8,22" : "60,44,90"},${(0.12 + r() * 0.14).toFixed(3)})`; ctx.lineWidth = 1 + r() * 2;
          ctx.beginPath(); ctx.moveTo(D.x(az), D.y(top - 0.2)); ctx.quadraticCurveTo(D.x(az - lean * 0.5), D.y(top - len * 0.5), D.x(az - lean), D.y(top - len)); ctx.stroke();
        }
        // Mist at its feet, drifting in a band.
        const mg = ctx.createLinearGradient(0, D.y(e0 + R0.base + R0.amp * 0.3), 0, D.y(e0 - 1));
        mg.addColorStop(0, "rgba(245,200,190,0)"); mg.addColorStop(1, `rgba(245,200,190,${R0.mist})`);
        ctx.fillStyle = mg; ctx.fillRect(0, D.y(e0 + R0.base + R0.amp * 0.3), D.W, D.y(e0 - 3) - D.y(e0 + R0.base + R0.amp * 0.3));
        // Pines along the ridge: a trunk and layered, flat-topped pads of needles, leaning a little with the slope.
        if (!R0.trees) return;
        for (let az = -180; az < 180; az += R0.trees * (0.5 + r())) {
          const top = ridge(az), hgt = m(5 + r() * 7) * (j === 4 ? 1.5 : 1);
          if (r() < 0.25) continue;
          const lean = (r() - 0.5) * hgt * 0.2, pads = [0, 1, 2, 3].map((p) => [(r() - 0.5) * hgt * 0.2, -hgt * (0.35 + p * 0.2), hgt * (0.55 - p * 0.1) * (0.8 + r() * 0.4)]);
          at(az, top - 0.15, 1, () => {
            ctx.fillStyle = `rgb(${R0.top})`; ctx.strokeStyle = `rgb(${R0.top})`; ctx.lineWidth = hgt * 0.08;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(lean, -hgt); ctx.stroke();
            for (const [off, y, w] of pads) { ctx.beginPath(); ctx.ellipse(off, y, w * 0.5, hgt * 0.08, 0, 0, TAU); ctx.fill(); }
          });
        }
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
      // The pond's bed under its water: dark silt deepening to the middle, pebbles, and a few sunken leaves.
      const bed = ctx.createRadialGradient(X(POND.x), Y(POND.z), 0, X(POND.x), Y(POND.z), POND.rx * s);
      bed.addColorStop(0, "#1a2622"); bed.addColorStop(0.7, "#2c3a32"); bed.addColorStop(1, "#4a5444");
      ctx.save(); ctx.translate(X(POND.x), Y(POND.z)); ctx.scale(1, POND.rz / POND.rx); ctx.translate(-X(POND.x), -Y(POND.z));
      ctx.fillStyle = bed; ctx.beginPath(); ctx.arc(X(POND.x), Y(POND.z), (POND.rx + 0.05) * s, 0, TAU); ctx.fill(); ctx.restore();
      for (let i = 0; i < 260; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.96, v = 70 + Math.floor(r() * 60);
        ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${(0.35 + r() * 0.4).toFixed(2)})`;
        ctx.beginPath(); ctx.ellipse(X(POND.x + Math.sin(a) * POND.rx * d), Y(POND.z + Math.cos(a) * POND.rz * d), (0.03 + r() * 0.05) * s, (0.02 + r() * 0.04) * s, r() * 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "rgba(120,60,30,.5)";
      for (let i = 0; i < 12; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.85; ctx.beginPath(); ctx.ellipse(X(POND.x + Math.sin(a) * POND.rx * d), Y(POND.z + Math.cos(a) * POND.rz * d), 0.07 * s, 0.035 * s, r() * 3, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#bdb6a8"; ctx.beginPath(); ctx.arc(X(ROCK.x), Y(ROCK.z), ROCK.r * s, 0, TAU); ctx.fill();
      for (const [x, z, rr] of GARDEN_ROCKS) for (let k = 1; k <= 7; k++) { ctx.beginPath(); ctx.arc(X(x), Y(z), (rr + k * 0.13) * s, 0, TAU); ctx.stroke(); }
      // The paths' beds under their stones: fine dark gravel, a little wider than the stones, moss along its edges.
      for (const [x0, z0, x1, z1, w] of PATHS) {
        const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
        ctx.save(); ctx.translate(X(x0), Y(z0)); ctx.rotate(Math.atan2(dz, dx));
        ctx.fillStyle = "#8b857a"; ctx.fillRect(-0.1 * s, -(w / 2 + 0.08) * s, (len + 0.2) * s, (w + 0.16) * s);
        for (let i = 0; i < len * 40; i++) {
          const u = r() * len, side = r() < 0.5 ? -1 : 1, v = side * (w / 2 + (r() - 0.6) * 0.18);
          ctx.fillStyle = r() < 0.6 ? "rgba(79,107,52,.75)" : "rgba(98,90,78,.6)";
          ctx.beginPath(); ctx.ellipse(u * s, v * s, (0.03 + r() * 0.06) * s, (0.02 + r() * 0.03) * s, r() * 3, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.fillStyle = "rgba(242,167,192,.85)";
      for (const [cx, cz] of CHERRY) for (let i = 0; i < 140; i++) { ctx.beginPath(); ctx.arc(X(cx + (r() - 0.5) * 4.5), Y(cz + (r() - 0.5) * 4.5), 0.05 * s, 0, TAU); ctx.fill(); }
    });

    // A plain gravel disc a hair under the painted floor, so the slivers its rings leave between them show gravel, not
    // the dark beneath; Canvas 2D draws it before anything else.
    K.node(null, noShadow(disc(0, 0, r0 - 0.01, r0 - 0.01, 48, 0, "#b3ac9d")), 0, -0.004, 0, { depthBias: 50 });
    K.add(pathStones());

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

    // The torii over the path: two red pillars on black feet, the tie beam through them, the strut between it and the
    // red lintel with the plaque hung on it, and the black top beam whose ends sweep up. The plaque is a board of black
    // lacquer in a raised gold frame, leaning forward over the path as a torii's plaque does, with ₿ in gold on it.
    const torZ = L.doorZ - 5.2;
    K.node("torii", (k) => {
      for (const x of [-1.6, 1.6]) {
        k.cyl(0.15, 0.18, 3.5, C.red, x, 1.97, 0, { seg: 14 });
        k.cyl(0.24, 0.26, 0.24, C.dark, x, 0.12, 0, { seg: 14 });
        k.cyl(0.19, 0.19, 0.06, C.dark, x, 0.27, 0, { seg: 14 });
        k.cyl(0.165, 0.165, 0.08, C.dark, x, 2.55, 0, { seg: 14 });
      }
      k.box(4.0, 0.18, 0.14, C.red, 0, 2.8, 0);
      for (const x of [-1.6, 1.6]) k.box(0.1, 0.22, 0.2, C.red, x * 1.18, 2.8, 0);
      k.box(0.14, 0.5, 0.12, C.red, 0, 3.12, 0);
      k.box(4.5, 0.16, 0.28, C.red, 0, 3.45, 0);
      k.box(3.9, 0.22, 0.36, C.dark, 0, 3.64, 0);
      for (const side of [-1, 1]) k.box(0.72, 0.2, 0.36, C.dark, side * 2.2, 3.7, 0, { rz: side * 0.2 });
      k.box(0.1, 0.1, 0.1, C.dark, 0, 3.12, 0.105);
      const G = k.group(0, PLAQUE.y, PLAQUE.z, 0, PLAQUE.lean);
      G.box(PLAQUE.w, PLAQUE.h, 0.05, "#141210", 0, 0, 0);
      const fw = 0.035, fd = 0.012, fz = 0.025 + fd / 2;
      for (const sy of [-1, 1]) G.box(PLAQUE.w, fw, fd, C.gold, 0, sy * (PLAQUE.h - fw) / 2, fz, { emissive: 0.12 });
      for (const sx of [-1, 1]) G.box(fw, PLAQUE.h - 2 * fw, fd, C.gold, sx * (PLAQUE.w - fw) / 2, 0, fz, { emissive: 0.12 });
    }, 0, 0, torZ, { target: { kind: "torii", tip: "Torii · the gate into the temple's grounds", radius: 3.4, pick: ["torii", "toriiPlaque"] } });
    for (const x of [-1.6, 1.6]) K.solid({ x, z: torZ, r: 0.27 });
    // Its face inside the frame, 3 mm proud of the board: the lacquer's faint grain, and the ₿ drawn as the letter B
    // with its two strokes through the top and the foot (no font is asked for the ₿ itself, which many lack), in gold
    // shaded from the light down, with a dark edge to lift it.
    const faceW = PLAQUE.w - 0.08, faceH = PLAQUE.h - 0.08, out = 0.028;
    K.picture(faceW, faceH, 400, Math.round(400 * faceH / faceW), (c, w, h) => {
      c.fillStyle = "#141210"; c.fillRect(0, 0, w, h);
      const gr = RM.paintKit.rng(17);
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,240,220,${(0.015 + gr() * 0.03).toFixed(3)})`; c.fillRect(0, gr() * h, w, 1 + gr() * 2); }
      const size = h * 0.62, base = h * 0.5 + size * 0.36;
      c.font = RM.paintKit.font(700, size, RM.paintKit.SERIF); c.textAlign = "center"; c.textBaseline = "alphabetic";
      const mt = c.measureText("B"), left = w / 2 - (mt.actualBoundingBoxLeft || mt.width / 2), gw = (mt.actualBoundingBoxLeft || mt.width / 2) + (mt.actualBoundingBoxRight || mt.width / 2);
      const top = base - (mt.actualBoundingBoxAscent || size * 0.7), gh = base - top, bw = gw * 0.085;
      const gold = c.createLinearGradient(0, top - gh * 0.15, 0, base + gh * 0.15);
      gold.addColorStop(0, "#f6dc8c"); gold.addColorStop(0.5, "#d9aa45"); gold.addColorStop(1, "#a8762a");
      const glyph = (dx, dy, style) => {
        c.fillStyle = style;
        c.fillText("B", w / 2 + dx, base + dy);
        for (const fx of [0.3, 0.56]) {
          c.fillRect(left + gw * fx - bw / 2 + dx, top - gh * 0.16 + dy, bw, gh * 0.22);
          c.fillRect(left + gw * fx - bw / 2 + dx, base - gh * 0.06 + dy, bw, gh * 0.22);
        }
      };
      glyph(4, 5, "#3a2610");
      glyph(0, 0, gold);
    }, 0, PLAQUE.y - out * Math.sin(PLAQUE.lean), torZ + PLAQUE.z + out * Math.cos(PLAQUE.lean), { emissive: 0.3, name: "toriiPlaque", rx: PLAQUE.lean });

    // The stone lanterns, and the clipped azaleas lining the path to the deck, low enough to walk through.
    const flame = noShadow(BL.models.box({ w: 0.3, h: 0.26, d: 0.3, color: C.lamp, emissive: 0.95 }));
    let stone = null;
    LANTERN_AT.forEach(([x, z], i) => { stone = lantern(K, x, z, i, flame, stone); });
    for (let z = 8.2; z > 1.6; z -= 0.75) for (const x of [-1.5, 1.5]) if (offPath(x, z) > 0.46 && LANTERN_AT.every(([lx, lz]) => Math.hypot(x - lx, z - lz) > 1.0)) {
      K.add(blob(0.42, 0.32, 0.42, C.hedge, 10), x, 0.28, z, { ry: z });
      K.add(blob(0.3, 0.22, 0.3, "#4a7a40", 8), x + (z % 1.5 > 0.7 ? 0.12 : -0.12), 0.46, z + 0.08, { ry: z * 2 });
      for (let f = 0; f < 3; f++) K.ball(0.035, f % 2 ? "#f2a7c0" : "#f4f1e6", x + Math.sin(z * 5 + f * 2.1) * 0.3, 0.52 + f * 0.03, z + Math.cos(z * 5 + f * 2.1) * 0.3, { seg: 6, emissive: 0.2 });
    }

    // The main hall: its platform and three steps (walked up), columns, two roofs whose corners curl up, the paper
    // lamps, the back wall and its scroll, and bonsai flanking the steps.
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
      K.cyl(0.2, 0.22, 0.12, C.stone, x, 0.81, z, { seg: 8 });
      K.solid({ x, z, r: 0.2 });
    }
    K.box(8.2, 0.3, 0.3, C.pillar, 0, 3.95, HALL_Z + 2.4); K.box(8.2, 0.3, 0.3, C.pillar, 0, 3.95, HALL_Z - 2.4);
    K.box(0.3, 0.3, 5.1, C.pillar, -3.6, 3.95, HALL_Z); K.box(0.3, 0.3, 5.1, C.pillar, 3.6, 3.95, HALL_Z);
    // Bracket sets on every post, carrying the ceiling and the lower roof, whose eaves reach well out past the posts.
    for (const x of [-3.6, -1.2, 1.2, 3.6]) brackets(K, x, 4.1, HALL_Z + 2.4);
    for (const x of [-3.6, 3.6]) { brackets(K, x, 4.1, HALL_Z, Math.PI / 2); brackets(K, x, 4.1, HALL_Z - 2.4); }
    K.box(10.0, 0.08, 7.2, C.wood, 0, 4.6, HALL_Z);
    roof(K.group(0, 4.68, HALL_Z), { w: 10.6, d: 7.8, h: 1.9, lift: 0.45, seg: 8, rows: 0.28, under: 0.7 });
    // The upper storey: white plaster between dark posts and rails, a latticed window in each face, its bracket sets
    // and the upper roof over it.
    const UP_Y0 = 5.35, UP_Y1 = 6.72, UPW = 2.45, UPD = 1.65;
    K.box(2 * UPW, UP_Y1 - UP_Y0, 2 * UPD, C.paper, 0, (UP_Y0 + UP_Y1) / 2, HALL_Z);
    for (const [len, x, z, ry] of [[2 * UPW, 0, UPD, 0], [2 * UPW, 0, -UPD, 0], [2 * UPD, UPW, 0, Math.PI / 2], [2 * UPD, -UPW, 0, Math.PI / 2]]) {
      const F = K.group(x, 0, HALL_Z + z, ry), n = Math.round(len / 1.2);
      for (let i = 0; i <= n; i++) F.box(0.16, UP_Y1 - UP_Y0 - 0.03, 0.1, C.pillar, -len / 2 + len * i / n, (UP_Y0 + UP_Y1) / 2 - 0.005, 0);
      for (const [y, rh] of [[UP_Y0 + 0.07, 0.1], [UP_Y0 + 0.62, 0.1], [UP_Y1 - 0.08, 0.14]]) F.box(len + 0.1, rh, 0.12, C.pillar, 0, y, 0);
      // A window of dark lattice in the middle bay of each long face, in the two of each short face.
      for (let i = 0; i < n; i++) {
        if (n > 2 && Math.abs(i - (n - 1) / 2) > 0.6) continue;
        const cx = -len / 2 + len * (i + 0.5) / n, ww = len / n - 0.36;
        F.box(ww, 0.46, 0.06, "#3a2a1e", cx, UP_Y0 + 0.97, 0);
        for (let g = 1; g < 6; g++) F.box(0.025, 0.448, 0.08, C.dark, cx - ww / 2 + ww * g / 6, UP_Y0 + 0.97, 0);
        F.box(ww - 0.012, 0.025, 0.074, C.dark, cx, UP_Y0 + 0.97, 0);
      }
    }
    K.box(2 * UPW - 0.04, 0.48, 2 * UPD - 0.04, C.pillar, 0, UP_Y1 + 0.24, HALL_Z);
    for (const x of [-UPW, 0, UPW]) for (const z of [-UPD, UPD]) brackets(K, x, UP_Y1, HALL_Z + z);
    roof(K.group(0, UP_Y1 + 0.25, HALL_Z), { w: 7.0, d: 5.2, h: 1.55, lift: 0.4, seg: 7, rows: 0.26, under: 1.2 });
    // Red paper lamps along its front, each swaying on its string; a tap swings one.
    const paperLamp = (k) => {
      k.cyl(0.22, 0.22, 0.46, C.lampRed, 0, -0.67, 0, { emissive: 0.85 });
      k.cyl(0.16, 0.16, 0.04, C.dark, 0, -0.42, 0, { seg: 12 }); k.cyl(0.16, 0.16, 0.04, C.dark, 0, -0.92, 0, { seg: 12 });
      k.box(0.02, 0.4, 0.02, C.dark, 0, -0.2, 0);
    };
    PAPER.forEach((x, i) => K.node(`paper${i}`, paperLamp, x, 3.97, HALL_Z + 3.2, { target: { kind: "paperlamp", tip: "Paper lantern · tap to set it swinging", radius: 0.72, index: i, pick: true } }));
    // The back wall, and the scroll hung on it: its ensō, drawn in one breath, and the red seal, mounted in silk on a
    // roller, hung high enough that seen from the deck the circle stands round Satoshi's head.
    K.box(7.6, 3.2, 0.12, C.paper, 0, 2.3, HALL_Z - 2.6);
    K.box(7.8, 0.14, 0.16, C.dark, 0, 3.86, HALL_Z - 2.56);
    K.solid({ x: 0, z: HALL_Z - 2.6, hx: 3.8, hz: 0.1 });
    const SCROLL = { w: 1.2, h: 2.1, top: 3.78 };
    K.picture(SCROLL.w, SCROLL.h, 480, 840, (sc, w, h) => {
      sc.fillStyle = "#f3eee0"; sc.fillRect(0, 0, w, h);
      sc.fillStyle = "#6b4a2a"; sc.fillRect(0, 0, w, 64); sc.fillRect(0, h - 64, w, 64);
      sc.fillStyle = "#8a6a3a"; sc.fillRect(0, 64, 28, h - 128); sc.fillRect(w - 28, 64, 28, h - 128);
      sc.fillStyle = "#a8875a"; sc.fillRect(0, 60, w, 6); sc.fillRect(0, h - 66, w, 6);
      // One stroke round, heavy where the brush came down and thinning to a dry tail, its ends a little apart.
      sc.strokeStyle = "#151515"; sc.lineCap = "round";
      for (let i = 0; i < 96; i++) { const a = -1.15 + i / 96 * 5.75, wd = 42 * (1 - i / 110) + 4; sc.lineWidth = wd; sc.beginPath(); sc.arc(w / 2, 340, 168, a, a + 0.075); sc.stroke(); }
      sc.fillStyle = "#151515";
      for (let i = 0; i < 14; i++) { const a = 4.5 + i * 0.03, r = 168 + (i % 3 - 1) * 9; sc.fillRect(w / 2 + Math.cos(a) * r, 340 + Math.sin(a) * r, 3, 3); }
      sc.fillStyle = "#b8402a"; sc.fillRect(318, 590, 52, 52);
      sc.fillStyle = "#f3eee0"; sc.fillRect(328, 600, 32, 6); sc.fillRect(328, 626, 32, 6); sc.fillRect(341, 600, 6, 32);
    }, 0, SCROLL.top - SCROLL.h / 2, HALL_Z - 2.53, { emissive: 0.45, target: { kind: "scroll", tip: "Ensō", radius: 1.3, pick: true, data: { say: "An ensō, drawn in one breath: whole, and never quite closed" } } });
    K.cyl(0.03, 0.03, SCROLL.w + 0.14, C.dark, 0, SCROLL.top - SCROLL.h - 0.02, HALL_Z - 2.5, { rz: Math.PI / 2, seg: 8 });
    for (const sx of [-1, 1]) K.cyl(0.045, 0.045, 0.05, C.gold, sx * (SCROLL.w / 2 + 0.09), SCROLL.top - SCROLL.h - 0.02, HALL_Z - 2.5, { rz: Math.PI / 2, seg: 8, emissive: 0.1 });
    K.box(0.6, 0.012, 0.012, C.dark, 0, SCROLL.top + 0.04, HALL_Z - 2.52);
    // Bonsai flanking the steps.
    for (const x of [-2.7, 2.7]) {
      const z = HALL_Z + 3.4;
      K.box(0.8, 0.45, 0.45, C.wood, x, 0.225, z); K.box(0.55, 0.16, 0.34, "#2a2a2e", x, 0.53, z);
      K.cyl(0.04, 0.07, 0.5, C.bark, x, 0.85, z, { rz: 0.4, seg: 6 });
      for (const [dx, dy, s] of [[-0.18, 1.07, 0.3], [0.16, 0.97, 0.24], [0.02, 1.2, 0.22]]) K.add(blob(s, s * 0.35, s * 0.8, C.hedge, 10), x + dx, dy, z);
      K.solid({ x, z, r: 0.45 });
    }

    // Satoshi on his Corten plinth, facing the deck, at the heart of the hall, half as large again as life. The
    // plinth's weathered steel is laid in patches of rust and carries his name in bronze; the figure is its own node,
    // sampled panel by panel (the statue above) and scaled up. A click lands on the plinth, its name or the figure,
    // whose thousands of thin plates are stood in for by two boxes round him: his legs and laptop, his back and head.
    const P = K.group(0, 0.75, STATUE_Z, Math.PI), figure = statue(), v = figure.verts;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < v.length; i += 3) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); z0 = Math.min(z0, v[i + 2]); z1 = Math.max(z1, v[i + 2]); }
    P.node("plinth", plinth(), 0, 0, 0, { target: { kind: "statue", tip: "Satoshi Nakamoto · after Valentina Picozzi's statue in Lugano", radius: 2.4, pick: ["plinth", "nameplate", "figureLow", "figureHigh"],
      data: { say: "Walk round him: face on, the steel all but vanishes; from the side it closes into one figure" } } });
    P.node("statue", figure, 0, PLINTH.H, 0.4, { scale: STATUE_SCALE });
    P.node("figureLow", BL.models.box({ w: x1 - x0, h: 0.47 - y0, d: z1 - z0, color: C.stone, offset: { x: (x0 + x1) / 2, y: (0.47 + y0) / 2, z: (z0 + z1) / 2 } }), 0, PLINTH.H, 0.4, { scale: STATUE_SCALE, proxy: true });
    P.node("figureHigh", BL.models.box({ w: 0.52, h: 0.45, d: 0.56, color: C.stone, offset: { x: 0, y: 0.695, z: -0.12 } }), 0, PLINTH.H, 0.4, { scale: STATUE_SCALE, proxy: true });
    K.solid({ x: 0, z: STATUE_Z, hx: PLINTH.W, hz: PLINTH.D });
    // His name in bronze, halfway up the plinth's face, the letters sized to fit the plate with a margin either side.
    K.picture(1.1, 0.17, 1100, 170, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#8a6a3a"); g.addColorStop(1, "#4e3a1c");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = "#c9a85a"; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
      c.fillStyle = "#f0dca8"; c.textAlign = "center"; c.textBaseline = "middle";
      RM.paintKit.fit(c, "SATOSHI NAKAMOTO", w - 120, 600, 76, RM.paintKit.SERIF);
      c.fillText("SATOSHI NAKAMOTO", w / 2, h / 2 + 3);
    }, 0, 0.75 + PLINTH.H / 2, STATUE_Z + PLINTH.D + 0.012, { emissive: 0.35, name: "nameplate" });

    // The tatami deck, its cushions (each a seat facing the hall, and stepped onto), the gong, the singing bowl and
    // the incense burner.
    K.box(7.0, 0.06, 4.38, C.wood, 0, 0.03, DECK_Z + 0.01);
    K.picture(6.9, 4.3, 512, 320, (tc) => {
      tc.fillStyle = "#cdbf86"; tc.fillRect(0, 0, 512, 320); tc.strokeStyle = "rgba(120,100,50,.35)"; tc.lineWidth = 1;
      for (let x = 0; x < 512; x += 4) { tc.beginPath(); tc.moveTo(x, 0); tc.lineTo(x, 320); tc.stroke(); }
      tc.fillStyle = "#2a1f14"; for (const x of [0, 170, 340]) tc.fillRect(x, 0, 6, 320);
      tc.fillRect(0, 0, 512, 6); tc.fillRect(0, 160, 512, 6); tc.fillRect(0, 314, 512, 6);
    }, 0, 0.062, DECK_Z, { rx: -Math.PI / 2, emissive: 0.12 });
    // Four across and three deep: a plump round zafu, its button on top, on a square mat.
    const button = ballGeo(0.025, C.mat, 8, 0);
    for (let i = 1; i < button.verts.length; i += 3) button.verts[i] += 0.074;
    const zafu = merge(BL.models.lathe({ profile: [[0, -0.075], [0.29, -0.075], [0.325, -0.05], [0.335, -0.01], [0.33, 0.03], [0.3, 0.06], [0.2, 0.075], [0, 0.078]], segments: 20, color: C.cushion }),
      button, BL.models.box({ w: 0.76, h: 0.03, d: 0.76, color: C.mat, offset: { y: -0.08 } }));
    for (const z of [DECK_Z - 1.3, DECK_Z, DECK_Z + 1.3]) for (const x of [-2.1, -0.7, 0.7, 2.1]) {
      const seat = K.seat(x, z, Math.PI, 0.29, 0, 0.7);
      K.node(null, zafu, x, 0.155, z, { target: { kind: "chair", tip: "Meditation cushion", radius: 0.6, index: seat.index, pick: true } });
      K.solid({ x, z, r: 0.32, top: 0.23 });
    }
    // The gong in its frame on feet, its mallet hung on a cord in front of it (it swings into the gong when struck), and
    // a red tassel.
    const G = K.group(GONG.x, 0, GONG.z);
    G.node("gongFrame", (k) => {
      for (const sx of [-1, 1]) {
        k.box(0.1, 1.7, 0.1, C.dark, sx * 0.55, 0.85, 0);
        k.box(0.12, 0.08, 0.5, C.dark, sx * 0.55, 0.04, 0);
        k.box(0.3, 0.08, 0.12, C.dark, sx * 0.82, 1.73, 0, { rz: sx * 0.35 });
      }
      k.box(1.5, 0.1, 0.12, C.dark, 0, 1.7, 0);
      k.cyl(0.03, 0.05, 0.26, C.red, -0.6, 1.42, 0.07, { seg: 8 });
    });
    G.node("gong", (k) => {
      k.cyl(0.42, 0.42, 0.04, C.gold, 0, -0.6, 0, { rx: Math.PI / 2, seg: 32, emissive: 0.12 });
      k.cyl(0.36, 0.36, 0.05, "#b88a2a", 0, -0.6, 0, { rx: Math.PI / 2, seg: 32, emissive: 0.12 });
      k.cyl(0.08, 0.08, 0.06, C.bronzeDark, 0, -0.6, 0, { rx: Math.PI / 2, seg: 16 });
      for (const x of [-0.18, 0.18]) k.box(0.015, 0.22, 0.015, C.dark, x, -0.09, 0);
    }, 0, 1.55, 0, { target: { kind: "gong", tip: "Gong · tap to strike it", radius: 1.5, pick: ["gong", "gongFrame", "mallet"] } });
    G.node("mallet", (k) => {
      k.box(0.008, 0.6, 0.008, C.rope, 0, -0.3, 0);
      k.ball(0.07, C.rope, 0, -0.66, 0, { seg: 10 });
      k.cyl(0.016, 0.016, 0.3, C.wood, 0.17, -0.66, 0, { rz: Math.PI / 2, seg: 6 });
    }, 0, 1.62, 0.25);
    G.solid({ x: 0, z: 0, hx: 0.68, hz: 0.25 });
    // The singing bowl on its red cushion, its wooden striker beside it: hammered bronze with a thick lip, gold outside
    // and darker within, a band incised round it.
    K.node("bowlStand", (k) => {
      k.torus(0.17, 0.05, C.red, 0, 0.11, 0, { seg: 16, sides: 6 });
      k.cyl(0.018, 0.018, 0.3, C.wood, 0.38, 0.08, 0.1, { rz: Math.PI / 2, seg: 6 });
      k.cyl(0.024, 0.024, 0.07, "#3a2a1e", 0.5, 0.08, 0.1, { rz: Math.PI / 2, seg: 8 });
    }, BOWL.x, 0, BOWL.z);
    const BOWL_PROFILE = [[0, 0], [0.17, 0.005], [0.225, 0.05], [0.255, 0.12], [0.262, 0.17], [0.258, 0.186], [0.246, 0.19], [0.238, 0.174], [0.232, 0.126], [0.205, 0.066], [0.155, 0.033], [0, 0.026]];
    K.node("bowl", (k) => {
      k.lathe(BOWL_PROFILE, (t) => t < 0.5 ? C.gold : "#8a6a24", 0, 0, 0, { seg: 24, emissive: 0.1 });
      k.torus(0.258, 0.004, C.bronzeDark, 0, 0.14, 0, { seg: 24, sides: 3 });
    }, BOWL.x, 0.13, BOWL.z, { target: { kind: "bowl", tip: "Singing bowl · tap to ring it", radius: 0.7, pick: ["bowl", "bowlStand"] } });
    K.solid({ x: BOWL.x, z: BOWL.z, r: 0.3 });
    // The incense burner on its stone, three sticks smoking in it; a tap or Space wafts the smoke. Its bronze bowl has a
    // lip turned in over the ash, so it is solid from every side, and a ring handle either side.
    K.node("burnerStone", (k) => {
      k.box(0.9, 0.26, 0.9, C.stone, 0, 0.13, 0);
      k.box(0.96, 0.05, 0.96, C.stoneDark, 0, 0.275, 0);
    }, BURNER.x, 0, BURNER.z);
    K.node("burner", (k) => {
      k.lathe([[0, 0], [0.4, 0.02], [0.48, 0.25], [0.46, 0.55], [0.52, 0.6], [0.5, 0.625], [0.47, 0.62], [0.43, 0.56], [0.42, 0.535], [0, 0.535]], "#6e5530", 0, 0, 0, { seg: 24 });
      k.cyl(0.42, 0.42, 0.01, "#4a4540", 0, 0.54, 0, { seg: 24 });
      for (const a of [0, 2.09, 4.19]) k.box(0.07, 0.1, 0.07, C.bronzeDark, Math.sin(a) * 0.36, -0.03, Math.cos(a) * 0.36);
      for (const sx of [-1, 1]) k.torus(0.07, 0.014, C.bronzeDark, sx * 0.49, 0.42, 0, { rz: Math.PI / 2, ry: Math.PI / 2, seg: 12, sides: 4 });
      [[-0.06, 0.02, 0.1], [0.05, -0.04, -0.08], [0.01, 0.07, 0.04]].forEach(([dx, dz, lean]) => k.box(0.012, 0.32, 0.012, "#6a3a22", dx, 0.69, dz, { rz: lean }));
    }, BURNER.x, 0.3, BURNER.z, { target: { kind: "incense", tip: "Incense burner · tap to waft the smoke", radius: 1.1, pick: ["burner", "burnerStone"] } });
    K.solid({ x: BURNER.x, z: BURNER.z, r: 0.5 });
    [[-0.06, 0.02, 0.1], [0.05, -0.04, -0.08], [0.01, 0.07, 0.04]].forEach(([dx, dz, lean], i) => {
      K.node(`tip${i}`, (k) => k.box(0.02, 0.025, 0.02, "#ff6a2a", 0, 0, 0, { emissive: 1 }), BURNER.x + dx - Math.sin(lean) * 0.16, 1.15, BURNER.z + dz, { glow: true });
    });
    const puff = noShadow(blob(0.03, 0.03, 0.03, "#e4e0da", 6, 0.5));
    for (let i = 0; i < SMOKE; i++) K.node(`smoke${i}`, puff, BURNER.x, 1.2, BURNER.z, { glow: true });

    // The pagoda in its bamboo grove: five tiers with paper doors on every side, tiled roofs whose corners sweep up, a
    // wind bell hung from each corner (they sway in the breeze, and ring only with a tap on the pagoda or Space beside
    // it), and the spire.
    const PG = K.group(PAGODA.x, 0, PAGODA.z), bells = [];
    PG.node("pagoda", (k) => {
      // Its stone base, a step up to it where the path arrives, and the tiers: each a body of red timber between dark corner
      // posts, a paper door in a lattice on each face, a beam round its top and bracket sets under its roof, whose
      // slopes skirt the tier above; the last roof rises to a point under the spire.
      k.box(3.0, 0.4, 3.0, C.stone, 0, 0.2, 0);
      k.box(3.1, 0.06, 3.1, C.stoneDark, 0, 0.43, 0);
      k.box(0.4, 0.2, 1.0, C.stone, 1.7, 0.1, 0.6);
      let y = 0.46;
      for (let t = 0; t < TIERS; t++) {
        const sz = 2.0 - 0.28 * t, h = 0.86 - 0.06 * t, half = sz / 2, last = t === TIERS - 1;
        k.box(sz, h, sz, C.pillar, 0, y + h / 2, 0);
        for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, h - 0.012, 0.1, C.dark, cx * half, y + h / 2 - 0.006, cz * half);
        k.box(sz + 0.06, 0.1, sz + 0.06, C.dark, 0, y + h - 0.056, 0);
        for (const [fx, fz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
          const F = k.group(fx * (half + 0.01), y, fz * (half + 0.01), ry), dw = sz * 0.5, dh = h * 0.6;
          F.box(dw, dh, 0.02, C.paper, 0, h * 0.42, 0);
          F.box(dw + 0.08, 0.05, 0.04, C.dark, 0, h * 0.42 + dh / 2, 0); F.box(dw + 0.08, 0.05, 0.04, C.dark, 0, h * 0.42 - dh / 2, 0);
          for (const sx of [-1, 1]) F.box(0.035, dh + 0.08, 0.036, C.dark, sx * (dw / 2 + 0.02), h * 0.42, 0);
          for (let g = 1; g < 4; g++) F.box(0.025, dh - 0.012, 0.034, C.dark, -dw / 2 + dw * g / 4, h * 0.42, 0);
          F.box(dw - 0.012, 0.02, 0.03, C.dark, 0, h * 0.42, 0);
          brackets(F, 0, h, 0, 0, 0.45);
        }
        const ye = y + h + 0.2, w = sz + 1.3, a = w / 2, next = last ? 0 : (2.0 - 0.28 * (t + 1)) / 2;
        const rh = last ? 1.0 : 1.0, height = roof(k.group(0, ye, 0), { w, d: w, h: rh, lift: 0.22, seg: 6, rows: 0.24, top: last ? Infinity : a - next + 0.03, under: a - next + 0.1, rafters: 0.26 });
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz2], c) => bells.push([t * 4 + c, sx * (a - 0.14), ye + height(sx * (a - 0.14), sz2 * (a - 0.14)) - 0.1, sz2 * (a - 0.14)]));
        y = last ? ye + rh : ye + rh * (0.35 * (a - next) / a + 0.65 * ((a - next) / a) ** 2);
      }
      // The spire: its mast, nine gold rings, the water flame and the jewel.
      k.cyl(0.06, 0.07, 1.7, C.gold, 0, y + 0.85, 0, { seg: 8, emissive: 0.15 });
      k.cyl(0.18, 0.22, 0.14, C.gold, 0, y + 0.12, 0, { seg: 10, emissive: 0.12 });
      for (let r9 = 0; r9 < 9; r9++) k.torus(0.17 - r9 * 0.009, 0.026, C.gold, 0, y + 0.32 + r9 * 0.11, 0, { seg: 16, sides: 5, emissive: 0.15 });
      for (let p = 0; p < 4; p++) k.box(0.02, 0.22, 0.12, C.gold, Math.sin(p * Math.PI / 2) * 0.09, y + 1.42, Math.cos(p * Math.PI / 2) * 0.09, { ry: p * Math.PI / 2, emissive: 0.15 });
      k.ball(0.07, C.gold, 0, y + 1.72, 0, { seg: 8, emissive: 0.2 });
    }, 0, 0, 0, { target: { kind: "chimes", tip: "Pagoda · tap to ring its wind bells", radius: 5.4, pick: ["pagoda", ...Array.from({ length: TIERS * 4 }, (_, i) => `wind${i}`)] } });
    // A wind bell under each corner of each roof: its cord, its bronze bell and its paper tongue in the wind.
    for (const [i, bx, by, bz] of bells) PG.node(`wind${i}`, (n) => {
      n.box(0.004, 0.1, 0.004, C.dark, 0, -0.05, 0);
      n.cyl(0.02, 0.055, 0.1, C.bronze, 0, -0.14, 0, { seg: 8, emissive: 0.1 });
      n.box(0.035, 0.07, 0.003, C.paper, 0, -0.25, 0);
    }, bx, by, bz);
    PG.solid({ x: 0, z: 0, hx: 1.5, hz: 1.5 });
    PG.solid({ x: 1.7, z: 0.6, hx: 0.2, hz: 0.5, top: 0.2 });
    // The bamboo, in clumps that each sway on their own; a tap sets one rustling.
    const br = RM.paintKit.rng(29), clumps = Array.from({ length: CLUMPS }, () => []);
    for (let i = 0; i < 90; i++) {
      const b = 212 + br() * 110, rr = r0 - 0.9 - br() * 1.6, x = rr * Math.sin(b * DEG), z = rr * Math.cos(b * DEG), h = 4 + br() * 3, leaves = [];
      for (let k = 0; k < 2; k++) leaves.push([x + (br() - 0.5) * 0.6, h * (0.7 + br() * 0.3), z + (br() - 0.5) * 0.6, 0.5 + br() * 0.5, 2 * i + k]);
      clumps[Math.min(CLUMPS - 1, Math.floor((b - 212) / 110 * CLUMPS))].push({ x, z, h, leaves, rx: (br() - 0.5) * 0.08, rz: (br() - 0.5) * 0.08 });
    }
    clumps.forEach((list, c) => {
      const cx = list.reduce((s, o) => s + o.x, 0) / list.length, cz = list.reduce((s, o) => s + o.z, 0) / list.length;
      K.node(`bamboo${c}`, (k) => {
        for (const o of list) {
          k.cyl(0.045, 0.055, o.h, "#6f9a3e", o.x - cx, o.h / 2, o.z - cz, { seg: 6, rx: o.rx, rz: o.rz });
          for (const [lx, ly, lz, s, ry] of o.leaves) k.add(blob(s, s * 0.35, s * 0.7, "#4f7d32", 6), lx - cx, ly, lz - cz, { ry });
        }
      }, cx, 0, cz, { target: { kind: "bamboo", tip: "Bamboo · tap to set it rustling", radius: 4.6, index: c, pick: true } });
    });

    // Cherry and maple trees, their crowns swaying, their petals falling.
    TREES.forEach((t, i) => tree(K, t.x, t.z, i < 2 ? ["#f2a7c0", "#e98fb0", "#f7c2d4", "#fbe3ea"] : ["#c0392b", "#d9542c", "#a8281e", "#e06a2a"], i < 2 ? Math.round(t.x * 10) : 9,
      `crown${i}`, i, `${t.name} tree · tap to shake it`, i === 2));
    const petal = blank(), petalPts = [[-0.035, 0, 0], [0, 0, -0.025], [0.035, 0, 0], [0, 0, 0.025]];
    face(petal, petalPts, "#f7b8cc", 0.5, UP); face(petal, petalPts, "#f7b8cc", 0.5, DOWN);
    for (let i = 0; i < PETALS; i++) K.node(`petal${i}`, noShadow(petal), CHERRY[i % 2][0], 2, CHERRY[i % 2][1], { glow: true });

    // Red-crowned cranes in a loose V, circling high over the grounds under the dome, their wings beating and now and
    // then held in a glide. Each is built as the bird is: a streamlined white body tapering to the tail, with the black
    // plumes of the inner wing drooping over it; the neck stretched out ahead, black down the throat with the white
    // of the nape behind it; the head with its black face, the red crown and the long bill; and the legs trailing out
    // behind the tail. Every crane shares one body and one set of wings.
    const WHITE = "#f2efe6", INK = "#1e1d1c", PRIMARY = "#e4e1d8";
    const craneBody = (k) => {
      const body = ballGeo(1, WHITE, 12, 0.15), v = body.verts;
      for (let i = 0; i < v.length; i += 3) { const z = v[i + 2], taper = z < 0 ? 1 + z * 0.45 : 1 - z * z * 0.3; v[i] *= 0.1 * taper; v[i + 1] *= 0.085 * taper; v[i + 2] = z * 0.3; }
      k.add(body, 0, 0, 0);
      k.add(blob(0.075, 0.028, 0.14, INK, 8), 0, 0.032, -0.29, { rx: 0.12 });
      const neck = [[0.02, 0.24], [0.04, 0.42], [0.055, 0.57], [0.064, 0.7]];
      for (let n = 0; n < 3; n++) {
        const [y0, z0] = neck[n], [y1, z1] = neck[n + 1];
        along(k, 0, y0, z0, 0, y1, z1, 0.034 - n * 0.004, 0.03 - n * 0.004, INK, 6);
        along(k, 0, y0 + 0.016, z0 - 0.01, 0, y1 + 0.014, z1 - 0.01, 0.021 - n * 0.003, 0.018 - n * 0.003, WHITE, 6);
      }
      k.ball(0.034, WHITE, 0, 0.07, 0.722, { seg: 8 });
      k.ball(0.028, INK, 0, 0.065, 0.75, { seg: 8 });
      k.ball(0.017, "#c8281e", 0, 0.098, 0.728, { seg: 6, emissive: 0.25 });
      along(k, 0, 0.064, 0.77, 0, 0.055, 0.93, 0.011, 0.002, "#8f8656", 5);
      for (const sx of [-0.03, 0.03]) {
        along(k, sx, -0.05, -0.12, sx, -0.062, -0.56, 0.011, 0.008, "#3b3a38", 4);
        along(k, sx, -0.062, -0.56, sx, -0.066, -0.66, 0.007, 0.003, "#3b3a38", 4);
      }
    };
    // A wing in two parts, the arm and the hand, so the hand bends to the beat a little behind the arm: the arm's white
    // coverts over the black of its secondaries, whose tips scallop its trailing edge; the hand's white coverts and its
    // six primaries spread like fingers. Both faces of each, as a wing is seen from above and below.
    const feathers = (side, part) => {
      const geo = blank(), W = (pts, c, y = 0) => { const P = pts.map(([x, z]) => [x * side, y, z]); face(geo, P, c, 0.15, UP); face(geo, P, c, 0.15, DOWN); };
      if (part === "arm") {
        W([[0.02, 0.12], [0.5, 0.11], [0.5, -0.05], [0.02, -0.06]], WHITE);
        W([[0.02, -0.06], [0.5, -0.05], [0.5, -0.13], [0.02, -0.15]], INK);
        for (let f = 0; f < 6; f++) {
          const xa = 0.02 + f * 0.08, xb = xa + 0.08, za = -0.15 + (xa - 0.02) / 0.48 * 0.02, zb = -0.15 + (xb - 0.02) / 0.48 * 0.02;
          W([[xa, za], [xb, zb], [(xa + xb) / 2 + 0.01, (za + zb) / 2 - 0.045]], INK);
        }
      } else {
        W([[0, 0.11], [0.3, 0.08], [0.3, -0.11], [0, -0.13]], WHITE);
        for (let f = 0; f < 6; f++) {
          const zb = 0.064 - f * 0.032, xt = 0.62 - f * 0.028, zt = zb + 0.01 - f * 0.022;
          W([[0.3, zb + 0.016], [xt, zt + 0.007], [xt + 0.004, zt - 0.008], [0.3, zb - 0.016]], PRIMARY);
        }
      }
      return noShadow(geo);
    };
    const arms = [feathers(1, "arm"), feathers(-1, "arm")], hands = [feathers(1, "hand"), feathers(-1, "hand")];
    let craneGeo = null;
    for (let i = 0; i < BIRDS; i++) {
      craneGeo = noShadow(K.node(`bird${i}`, craneGeo || craneBody, 0, FLIGHT.y, -FLIGHT.r, { glow: true, scale: FLIGHT.scale }).geometry);
      for (const [s, side, j] of [["L", 1, 0], ["R", -1, 1]]) {
        K.node(`wing${s}${i}`, arms[j], side * 0.07, 0.035, 0.04, { parent: `bird${i}`, glow: true });
        K.node(`hand${s}${i}`, hands[j], side * 0.5, 0, 0, { parent: `wing${s}${i}`, glow: true });
      }
    }

    // The raked rock garden: a stone curb, three mossy rocks in their rings, and the rake leaning on the curb.
    // A click lands on the curb, the rocks, the rake or the raked gravel (a disc that stands in for it, never drawn).
    K.node("garden", (k) => {
      k.torus(ROCK.r, 0.06, "#7a756c", 0, 0.05, 0, { seg: 64, sides: 4 });
      for (const [x, z, rr] of GARDEN_ROCKS) {
        k.add(ico("#55534f", rr, rr * 0.8, rr * 1.1, false, x * 3), x - ROCK.x, rr * 0.45, z - ROCK.z);
        k.add(blob(rr * 0.62, rr * 0.16, rr * 0.7, C.moss, 8), x - ROCK.x - rr * 0.1, rr * 1.05, z - ROCK.z + rr * 0.05);
      }
    }, ROCK.x, 0, ROCK.z, { target: { kind: "garden", tip: "Rock garden", radius: 3.4, pick: ["garden", "gardenBed", "rake"],
      data: { say: "Karesansui: the gravel is raked to be water, the rocks to be islands" } } });
    K.node("gardenBed", disc(0, 0, ROCK.r, ROCK.r, 24, 0.01, "#bdb6a8"), ROCK.x, 0, ROCK.z, { proxy: true });
    for (const [x, z, rr] of GARDEN_ROCKS) K.solid({ x, z, r: rr });
    K.node("rake", (k) => {
      k.cyl(0.02, 0.02, 1.6, "#a88a52", 0, 0.8, 0, { seg: 6 });
      k.box(0.5, 0.05, 0.05, "#a88a52", 0, 0.02, 0);
      for (let t = -2; t <= 2; t++) k.box(0.015, 0.1, 0.015, "#a88a52", t * 0.1, -0.04, 0);
    }, ROCK.x + ROCK.r * 0.68, 0.08, ROCK.z + ROCK.r * 0.74, { rx: 0.35, ry: 0.6 });

    // The koi pond: water (a tap feeds the koi), a rim of stones, lotus, the koi, rings spreading where they feed, an
    // arched bridge and a waterfall.
    // The water: see-through, in rings from deep green-blue in the middle to the clear shallows at the edge, so the
    // pond bed, its pebbles and the koi show through it.
    const water = blank(), RINGS = [[0, "#14444c"], [0.35, "#1c5560"], [0.65, "#26666e"], [0.88, "#357b7e"], [1, "#4a8f8c"]];
    for (let k = 0; k < RINGS.length - 1; k++) for (let i = 0; i < 40; i++) {
      const a0 = i / 40 * TAU, a1 = (i + 1) / 40 * TAU, [r0] = RINGS[k], [r1] = RINGS[k + 1], p = (r, a) => [Math.sin(a) * POND.rx * r, 0, Math.cos(a) * POND.rz * r];
      face(water, r0 ? [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)] : [[0, 0, 0], p(r1, a0), p(r1, a1)], RINGS[k][1], 0.3, UP);
    }
    water.glass = 0.34;
    K.node("water", noShadow(water), POND.x, WATER, POND.z, { target: { kind: "pond", tip: "Koi pond · tap where you'd like to throw the koi some food", radius: 3.8, pick: ["water", "pads"] } });
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU;
      const s2 = 0.2 + ((i * 37) % 11) / 11 * 0.14;
      K.add(ico(i % 3 ? "#6a6862" : "#76736b", s2, s2 * 0.85, s2, false, a * 3), POND.x + Math.sin(a) * (POND.rx + 0.08), 0.1, POND.z + Math.cos(a) * (POND.rz + 0.08));
    }
    // Lily pads, each with its notch and its veins, a lotus in bloom on some: its outer petals opening, the inner ones
    // cupped, the seed head in the middle.
    const pad = (rr, color) => {
      const geo = blank(), n = 16;
      for (let i = 1; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; face(geo, [[0, 0, 0], [Math.sin(a0) * rr, 0, Math.cos(a0) * rr], [Math.sin(a1) * rr, 0, Math.cos(a1) * rr]], i % 2 ? color : "#457f3e", 0.1, UP); }
      return geo;
    };
    K.node("pads", (k) => [[-1.6, 1.2, 0.3, 1], [-2.2, -0.6, 0.26, 0], [1.8, 1.4, 0.32, 1], [-0.9, -2.2, 0.24, 0], [2.0, -1.5, 0.28, 1], [-1.9, 0.3, 0.2, 0], [1.2, 2.1, 0.22, 0]].forEach(([dx, dz, rr, bloom], i) => {
      k.add(pad(rr, "#3f7a3a"), dx, WATER + 0.006, dz, { ry: i * 1.7 });
      if (!bloom) return;
      const F = k.group(dx + 0.06, WATER + 0.02, dz - 0.04, i);
      for (let p = 0; p < 8; p++) F.group(0, 0, 0, p / 8 * TAU).add(blob(0.07, 0.016, 0.03, "#f2a7c0", 6, 0.25), 0.06, 0.03, 0, { rz: 0.5 });
      for (let p = 0; p < 5; p++) F.group(0, 0, 0, p / 5 * TAU + 0.3).add(blob(0.05, 0.014, 0.024, "#f7c6d6", 6, 0.25), 0.03, 0.06, 0, { rz: 1.0 });
      F.cyl(0.022, 0.018, 0.03, "#e8c94a", 0, 0.07, 0, { seg: 8, emissive: 0.3 });
    }), POND.x, 0, POND.z);
    // Irises in clumps at the pond's edge: their blades, and a few purple flowers.
    for (const [dx, dz] of [[2.7, 2.3], [-2.9, 2.0], [3.3, -1.2]]) {
      const ir = RM.paintKit.rng(Math.round(dx * 10 + dz));
      for (let b = 0; b < 9; b++) { const a = ir() * TAU, h = 0.5 + ir() * 0.35, lx = Math.cos(a) * 0.12, lz = Math.sin(a) * 0.12; along(K, POND.x + dx + lx * 0.3, 0.02, POND.z + dz + lz * 0.3, POND.x + dx + lx * 1.6, h, POND.z + dz + lz * 1.6, 0.014, 0.004, b % 2 ? "#4f7d32" : "#5c8c3a", 4); }
      for (let f = 0; f < 3; f++) { const a = ir() * TAU; K.add(blob(0.045, 0.035, 0.045, "#5b3a8a", 6, 0.2), POND.x + dx + Math.cos(a) * 0.12, 0.62 + ir() * 0.18, POND.z + dz + Math.sin(a) * 0.12); }
    }
    // Each koi nose to +x, about 0.36 m long: its body tapering to the tail, the dorsal fin, the pectoral fins and its
    // pattern in patches standing a little off its back, lit a little to read under the water; and the forked tail fin
    // on a node of its own, hinged where it meets the body, so it beats as the koi swims.
    const koiGeo = KOI_KINDS.map(([color, patches]) => {
      const body = ballGeo(1, color, 12, 0.45), v = body.verts, fins = blank(), tail = blank(), fin = color === "#262422" ? "#3a3532" : color;
      for (let i = 0; i < v.length; i += 3) { const x = v[i], taper = x < 0 ? 1 + x * 0.6 : 1 - x * x * 0.15; v[i] = x * 0.17; v[i + 1] *= 0.04 * taper; v[i + 2] *= 0.062 * taper; }
      face(tail, [[0, 0.008, 0], [-0.16, 0.008, 0.095], [-0.105, 0.008, 0]], fin, 0.4, UP);
      face(tail, [[0, 0.008, 0], [-0.105, 0.008, 0], [-0.16, 0.008, -0.095]], fin, 0.4, UP);
      for (const s of [1, -1]) {
        face(fins, [[0.06, 0.033, 0], [-0.07, 0.033, 0], [-0.02, 0.07, 0]], fin, 0.4, [0, 0, s]);
        face(fins, [[0.08, 0.002, s * 0.05], [0.0, 0.002, s * 0.05], [0.03, 0.002, s * 0.12]], fin, 0.4, UP);
      }
      const spots = patches.map(([px, pz, ps, pc]) => { const g = blob(ps, 0.012, ps * 0.8, pc, 8, 0.45); for (let i = 1; i < g.verts.length; i += 3) g.verts[i] += 0.036; for (let i = 0; i < g.verts.length; i += 3) { g.verts[i] += px; g.verts[i + 2] += pz; } return g; });
      return { body: noShadow(merge(body, fins, ...spots)), tail: noShadow(tail) };
    });
    KOI.forEach((k, i) => {
      K.node(`koi${i}`, koiGeo[i % KOI_KINDS.length].body, POND.x, WATER - 0.055, POND.z);
      K.node(`koiTail${i}`, koiGeo[i % KOI_KINDS.length].tail, -0.13, 0, 0, { parent: `koi${i}` });
    });
    const ring = noShadow(BL.models.torus(1, 0.012, "#d8f0f6", 0.6, 32, 4));
    for (let i = 0; i < RIPPLES; i++) K.node(`ripple${i}`, ring, POND.x, -5, POND.z, { glow: true });
    // Koi food: little pellets thrown from the visitor's hand, floating where they land until a koi takes them.
    const pellet = noShadow(merge(ballGeo(0.018, "#b8782e", 6, 0.2), BL.models.box({ w: 0.02, h: 0.016, d: 0.02, color: "#a0662a", emissive: 0.2, offset: { x: 0.02, z: 0.01 } })));
    for (let i = 0; i < PELLETS; i++) K.node(`pellet${i}`, pellet, POND.x, -5, POND.z, { glow: true });
    // The pond keeps walkers out but for the bridge: circles of solid either side of it, each reaching in no further
    // than the bridge's rails, so the lane over it is clear for the widest Ooga, and out past the water's edge.
    for (const side of [-1, 1]) for (const [u, v, r] of [[2.45, 0, 1.45], [2.0, 1.9, 1.0], [2.0, -1.9, 1.0], [1.6, 2.75, 0.6], [1.6, -2.75, 0.6]]) K.solid({ x: POND.x + side * u, z: POND.z + v, r });
    // The arched bridge: planks along the arch with red rails and posts, walked over as a run of low steps.
    const SEG = 26, deck = [];
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG, t1 = (i + 1) / SEG, ya = archY(t0), yb = archY(t1), za = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t0, zb = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * t1;
      deck.push({ y: (ya + yb) / 2, z: (za + zb) / 2, ang: Math.atan2(yb - ya, za - zb), len: Math.hypot(yb - ya, zb - za) });
    }
    for (const d of deck) {
      K.box(2 * BRIDGE.half + 0.06, 0.1, d.len + 0.02, C.wood, POND.x, d.y, d.z, { rx: d.ang });
      for (const sx of [-1, 1]) K.box(0.07, 0.07, d.len + 0.02, C.red, POND.x + sx * (BRIDGE.half - 0.03), d.y + 0.72, d.z, { rx: d.ang });
    }
    deck.forEach((d, i) => { if (i % 4 === 0 || i === deck.length - 1) for (const sx of [-1, 1]) K.box(0.1, 0.75, 0.1, C.red, POND.x + sx * (BRIDGE.half - 0.03), d.y + 0.36, d.z); });
    // Walked as a run of low steps, each at the deck's height at its lower end (so a step up is never more than the
    // rise across one), and a stone step at each end halfway up to the deck, so stepping on and off is gentle.
    for (let i = 0; i < BRIDGE.walk; i++) {
      const t0 = i / BRIDGE.walk, t1 = (i + 1) / BRIDGE.walk, top = Math.min(archY(t0), archY(t1));
      const z = BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * (i + 0.5) / BRIDGE.walk;
      K.solid({ x: POND.x, z, hx: BRIDGE.half, hz: Math.abs(BRIDGE.z1 - BRIDGE.z0) / BRIDGE.walk / 2, top: top + 0.05 });
    }
    for (const [z, out] of [[BRIDGE.z0, 1], [BRIDGE.z1, -1]]) {
      K.box(2 * BRIDGE.half + 0.2, 0.085, 0.4, C.stone, POND.x, 0.0425, z + out * 0.2);
      K.solid({ x: POND.x, z: z + out * 0.2, hx: BRIDGE.half + 0.1, hz: 0.2, top: 0.085 });
    }
    // The waterfall at the pond's far side: a cliff of stacked boulders in their own tones, moss on their shoulders and
    // ferns in the cracks, the stream slipping over the top into a first fall onto a ledge and a second down into the
    // pond, each in strands with gaps between, foam where each lands, and streaks running down both.
    const wfX = POND.x + POND.rx + 0.4, wz = POND.z;
    [[0.25, 0.45, -0.95, 0.68, "#5a5853"], [0.3, 0.45, 0.95, 0.64, "#615f59"], [0.1, 0.22, -1.45, 0.42, "#6a6862"], [0.15, 0.22, 1.45, 0.44, "#66645e"],
      [0.5, 1.2, -0.9, 0.56, "#55534e"], [0.5, 1.2, 0.9, 0.55, "#5e5c57"], [0.75, 1.95, -0.85, 0.55, "#585651"], [0.75, 1.95, 0.85, 0.54, "#625f5a"],
      [0.95, 2.5, -0.35, 0.5, "#57554f"], [0.95, 2.5, 0.4, 0.48, "#5c5a55"], [1.1, 1.4, 0, 0.7, "#4f4d49"]].forEach(([dx, dy, dz, s2, c], i) => K.add(ico(c, s2, s2 * 0.8, s2, i % 2 === 0, dx * 7 + i), wfX + dx, dy, wz + dz));
    for (const [dx, dy, dz, s2] of [[0.25, 0.92, -0.95, 0.3], [0.5, 1.62, 0.9, 0.26], [0.75, 2.37, -0.85, 0.24], [0.95, 2.86, 0.35, 0.22], [0.15, 0.48, 1.45, 0.18]]) K.add(blob(s2, 0.05, s2 * 0.8, C.moss, 7), wfX + dx, dy, wz + dz);
    for (const [dx, dy, dz] of [[0.0, 0.8, -1.3], [0.2, 1.55, 1.25], [0.45, 2.3, -1.15]]) for (let f = 0; f < 6; f++) {
      const a = f / 6 * TAU, fx = wfX + dx + Math.cos(a) * 0.32, fz = wz + dz + Math.sin(a) * 0.32;
      along(K, wfX + dx, dy, wz + dz, fx, dy + 0.18, fz, 0.025, 0.006, "#4f8a3a", 4);
    }
    // The ledge the first fall lands on, and the stream at the top.
    K.add(ico("#5a5853", 0.5, 0.13, 0.62, false, 1.3), wfX + 0.05, 1.12, wz);
    K.box(0.6, 0.02, 0.5, "#8ccbe0", wfX + 0.55, 2.42, wz, { emissive: 0.55, glow: true });
    for (const [dz, w, dx, color] of [[-0.14, 0.24, 0.06, "#8ccbe0"], [0.14, 0.22, 0.05, "#a6d8e8"]]) K.box(0.03, 1.16, w, color, wfX + dx, 1.84, wz + dz, { emissive: 0.6, glow: true });
    for (const [dz, w, dx, color] of [[-0.28, 0.24, -0.42, "#78bed7"], [0, 0.27, -0.435, "#a6d8e8"], [0.28, 0.23, -0.425, "#8ccbe0"]]) K.box(0.03, 1.17, w, color, wfX + dx, 0.625, wz + dz, { emissive: 0.6, glow: true });
    for (const [dx, dy, dz, s2] of [[-0.62, WATER + 0.02, -0.25, 0.32], [-0.66, WATER + 0.02, 0.2, 0.36], [-0.85, WATER + 0.01, -0.02, 0.28], [-0.5, WATER + 0.03, 0.45, 0.2], [-0.15, 1.22, -0.1, 0.18], [-0.12, 1.22, 0.15, 0.16]])
      K.add(blob(s2, 0.08, s2 * 0.9, "#eef8fb", 10, 0.7), wfX + dx, dy, wz + dz, { glow: true });
    K.solid({ x: wfX + 0.35, z: POND.z, r: 0.95 });
    const drop = noShadow(BL.models.box({ w: 0.02, h: 0.3, d: 0.035, color: "#eef8fb", emissive: 0.9 }));
    for (let i = 0; i < STREAKS; i++) {
      const lower = i % 2 === 0, k = Math.floor(i / 2);
      K.node(`fall${i}`, drop, wfX + (lower ? -0.47 : 0.005), lower ? 0.8 : 1.9, wz + (lower ? [-0.3, -0.05, 0.22, -0.18, 0.08, 0.32][k] : [-0.18, 0.12, -0.08, 0.2, -0.22, 0.05][k]), { glow: true });
    }

    // The bell tower on its stone base (a step up onto it from the front), its bell and the log that strikes it. The
    // bell is cast with bands round it, rows of bosses on its shoulder, the loop it hangs by and the lotus boss where
    // the log lands.
    const bh = headingTo(BELL.x, BELL.z, 0, 0), BT = K.group(BELL.x, 0, BELL.z, bh);
    BT.node("belfry", (k) => {
      k.box(3.2, 0.5, 3.2, C.stone, 0, 0.25, 0);
      k.box(3.3, 0.06, 3.3, C.stoneDark, 0, 0.53, 0);
      k.box(1.4, 0.25, 0.5, C.stone, 0, 0.125, -1.85);
      for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        k.box(0.22, 3.1, 0.22, C.pillar, px, 2.05, pz);
        k.cyl(0.17, 0.19, 0.1, C.stone, px, 0.55, pz, { seg: 8 });
        brackets(k, px, 3.6, pz, 0, 0.6);
      }
      // Tie beams round the top, and the beam the bell hangs from across the middle.
      for (const sz of [-1.2, 1.2]) k.box(2.62, 0.18, 0.16, C.pillar, 0, 3.5, sz);
      for (const sx of [-1.2, 1.2]) k.box(0.16, 0.18, 2.62, C.pillar, sx, 3.5, 0);
      k.box(2.7, 0.2, 0.2, C.pillar, 0, 3.5, 0);
      roof(k.group(0, 3.98, 0), { w: 4.6, d: 4.0, h: 1.35, lift: 0.35, seg: 7, rows: 0.25 });
    });
    BT.solid({ x: 0, z: -1.85, hx: 0.7, hz: 0.25, top: 0.25 });
    for (const [px, pz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) BT.solid({ x: px, z: pz, r: 0.16 });
    // The bell's radius at height `y` on it (y 0 its crown, -1.35 its lip), from its profile.
    const BELL_PROFILE = [[0, 0], [0.62, 0], [0.6, 0.1], [0.53, 0.48], [0.46, 0.95], [0.41, 1.2], [0.27, 1.32], [0, 1.35]];
    const bellR = (y) => {
      const h = y + 1.35;
      for (let i = 1; i < BELL_PROFILE.length; i++) if (h <= BELL_PROFILE[i][1]) { const [r0b, h0] = BELL_PROFILE[i - 1], [r1, h1] = BELL_PROFILE[i]; return r0b + (r1 - r0b) * (h - h0) / (h1 - h0); }
      return 0;
    };
    BT.node("bell", (k) => {
      k.lathe(BELL_PROFILE, C.bronze, 0, -1.35, 0, { seg: 28, emissive: 0.1 });
      for (const yb of [-0.24, -0.6, -1.18]) k.torus(bellR(yb) + 0.012, 0.022, C.bronzeDark, 0, yb, 0, { seg: 28, sides: 4 });
      for (let p = 0; p < 4; p++) for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        const a = (p + 0.5) / 4 * TAU + (col - 1) * 0.16, yb = -0.3 - row * 0.085, r = bellR(yb) + 0.012;
        k.ball(0.022, C.bronzeDark, Math.sin(a) * r, yb, Math.cos(a) * r, { seg: 6 });
      }
      k.torus(0.1, 0.03, C.bronzeDark, 0, 0.06, 0, { rx: Math.PI / 2, seg: 12, sides: 4 });
      k.ball(0.07, C.bronzeDark, bellR(-0.95) + 0.02, -0.95, 0, { seg: 8 });
      k.box(0.08, 0.06, 0.08, C.dark, 0, 0.03, 0);
    }, 0, 3.4, 0, { target: { kind: "bell", tip: "Temple bell · it rings once a block; tap to ring it", radius: 4.4, pick: ["bell", "striker", "belfry"] } });
    BT.node("striker", (k) => {
      k.cyl(0.11, 0.11, 1.4, "#8a6a45", 0, -0.9, 0, { rz: Math.PI / 2, seg: 12 });
      for (const x of [-0.35, 0.35]) k.box(0.02, 0.9, 0.02, C.dark, x, -0.45, 0);
    }, 1.45, 3.5, 0);
    BT.solid({ x: 0, z: 0, hx: 1.6, hz: 1.6, top: 0.5 });
    BT.solid({ x: 0, z: 0, r: 0.66, below: 2.05 });

    // Point lights, the fixed ones first: the hall and its statue, the dusk over the front, then lanterns.
    K.light(0, 2.6, -9.2, 10, 0.7, 0.53, 0.34);
    K.light(0, 3.1, STATUE_Z + 2.4, 5, 0.55, 0.55, 0.55);
    K.light(0, L.c + L.R * 0.45, -L.R * 0.35, 30, 0.8, 0.52, 0.26);
    K.light(0, 6, -8, 22, 0.6, 0.42, 0.3);
    K.light(L.R * 0.3, L.c + L.R * 0.3, L.R * 0.4, 26, 0.75, 0.7, 0.62);
    K.light(0, 3.3, HALL_Z + 3.4, 5, 0.9, 0.35, 0.2);
    K.light(0, 1.4, 5.6, 5, 0.95, 0.7, 0.35);
    K.light(POND.x, 1.6, POND.z + 1.2, 7, 0.55, 0.75, 0.8);
    K.light(BELL.x - 1.2, 2.4, BELL.z + 1.6, 6, 0.9, 0.65, 0.35);
    K.light(LANTERN_AT[8][0], 1.6, LANTERN_AT[8][1], 6, 0.9, 0.65, 0.35);
    K.light(GONG.x - 0.6, 1.8, GONG.z + 1.2, 4, 0.9, 0.7, 0.4);
  };

  // Space where the Ooga stands and looks (the interior's `near`): the nearest thing within its reach (from its middle,
  // so the widest Ooga reaches it) and, unless it is right there, in front of the view. Kept in these, so asking
  // allocates nothing.
  const pick = { act: null, d: 0, x: 0, z: 0, fx: 0, fz: 0, f: 1 };
  const consider = (act, ax, az, reach, facing = true) => {
    const dx = ax - pick.x, dz = az - pick.z, d = Math.hypot(dx, dz);
    if (d < reach && d < pick.d && (!facing || d < 0.9 || (dx * pick.fx + dz * pick.fz) / (d * pick.f) > 0.2)) { pick.act = act; pick.d = d; }
  };

  // What moves: the koi, the petals, the incense smoke, the lanterns, the paper lamps, the waterfall, the
  // trees, the bamboo and the wind bells in a slow breeze, and whatever the visitor sets going with a tap or Space: the
  // bell, the gong and the bowl, each heard as it is struck; the wind bells; the koi come to be fed; a tree shaken; a
  // lantern put out or lit. Every visit starts the bell's count afresh, so it rings for the blocks
  // found while here.
  const animate = (nodes, built) => {
    const named = (prefix, n) => Array.from({ length: n }, (_, i) => nodes[`${prefix}${i}`]);
    const koi = named("koi", KOI.length), tails = named("koiTail", KOI.length), petals = named("petal", PETALS), smoke = named("smoke", SMOKE), streaks = named("fall", STREAKS);
    const lamps = named("lamp", LANTERN_AT.length), paper = named("paper", PAPER.length), tips = named("tip", 3);
    const crowns = named("crown", TREES.length), bamboo = named("bamboo", CLUMPS), winds = named("wind", TIERS * 4), ripples = named("ripple", RIPPLES), pellets = named("pellet", PELLETS);
    const birds = named("bird", BIRDS), wingsL = named("wingL", BIRDS), wingsR = named("wingR", BIRDS), handsL = named("handL", BIRDS), handsR = named("handR", BIRDS);
    const bell = nodes.bell, striker = nodes.striker, gong = nodes.gong, mallet = nodes.mallet, bowl = nodes.bowl;
    const rest = { gong: gong.rotation.x, bell: bell.rotation.z, striker: striker.rotation.z, mallet: mallet.rotation.x };
    const ear = built.ear, audio = sounds(), wake = () => { audio.wake(); };
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
    // The petals' own drift: where each falls round, how high it is, how fast it falls and its phase.
    const pr = RM.paintKit.rng(44), fall = new Float32Array(PETALS * 5);
    for (let i = 0; i < PETALS; i++) { const [cx, cz] = CHERRY[i % 2]; fall.set([cx + (pr() - 0.5) * 3.2, cz + (pr() - 0.5) * 3.0, pr() * 4.2, 0.25 + pr() * 0.3, pr() * TAU], i * 5); }
    chime.height = null;
    let heard = chime.count;
    // What the visitor has set going: which lanterns burn, a swing on each paper lamp and a
    // shake on each tree, the bamboo's rustle, the wind bells' swing, the koi's feeding (where, and how long left), a
    // fresh waft of smoke and the smoke's own clock, the bowl's shimmer, and the ripples
    // ([x, z, age] each, age -1 when still).
    const lit = new Uint8Array(LANTERN_AT.length).fill(1), swing = new Float32Array(PAPER.length), shake = new Float32Array(TREES.length);
    const rippleAt = new Float32Array(RIPPLES * 3);
    for (let i = 0; i < RIPPLES; i++) rippleAt[i * 3 + 2] = -1;
    const doing = { rustle: 0, winds: 0, feed: 0, waft: 0, smokeT: 0, bowl: -1, ripple: 0, pellet: 0, rise: 3 };
    // The koi: where each is, which way it heads (radians, from +x toward +z), how fast it is turning and swimming, the
    // burst of its tail it is in and the time to its next, its tail's beat, and the rise of a bite.
    const N = KOI.length, kx = new Float32Array(N), kz = new Float32Array(N), kh = new Float32Array(N), kw = new Float32Array(N), kv = new Float32Array(N);
    const kburst = new Float32Array(N), knext = new Float32Array(N), ktail = new Float32Array(N), kb = new Float32Array(N);
    KOI.forEach((k, i) => { kx[i] = POND.x + Math.cos(k.a) * k.r * 0.9; kz[i] = POND.z + Math.sin(k.a) * k.r * 0.75; kh[i] = k.a + Math.PI / 2; kv[i] = k.cruise; knext[i] = Math.random() * 8; ktail[i] = i * 1.3; });
    // The pellets thrown: each [state (0 none, 1 flying, 2 afloat), time, from x, y, z, to x, z, flight seconds], and
    // how long each has left afloat.
    const pel = new Float32Array(PELLETS * 8), afloat = new Float32Array(PELLETS);
    // A strike: how long since it began, -1 when still, and whether its blow has landed. The bell's log is drawn back,
    // let swing into the bell and rebounds; the gong's mallet does the same on its cord; then each hums.
    const state = { bell: -1, gong: -1, bellRang: false, gongRang: false };
    const STRIKE = { back: 0.8, swing: 0.2, pull: 0.5, hit: -0.25 }, MALLET = { back: 0.5, swing: 0.16, pull: -0.5, hit: 0.24 };
    const ringBell = () => { if (state.bell < 0 || state.bell > STRIKE.back + STRIKE.swing + 0.6) { state.bell = 0; state.bellRang = false; } };
    const strikeGong = () => { if (state.gong < 0 || state.gong > MALLET.back + MALLET.swing + 0.4) { state.gong = 0; state.gongRang = false; } };
    const ringBowl = () => { doing.bowl = 0; audio.strike("bowl", 1, ear, BOWL); };
    const ringWinds = (strength) => { doing.winds = Math.max(doing.winds, strength); audio.ring(strength, ear, PAGODA); };
    const ripple = (x, z) => { const i = doing.ripple; doing.ripple = (i + 1) % RIPPLES; rippleAt[i * 3] = x; rippleAt[i * 3 + 1] = z; rippleAt[i * 3 + 2] = 0; };
    // A handful of food thrown from the visitor's hand to (x, z), kept inside the water: the pellets arc out, splash
    // and float there for the koi.
    const throwFood = (x, z) => {
      let ux = (x - POND.x) / POND.rx, uz = (z - POND.z) / POND.rz;
      const n = Math.hypot(ux, uz);
      if (n > 0.86) { ux *= 0.86 / n; uz *= 0.86 / n; }
      x = POND.x + ux * POND.rx; z = POND.z + uz * POND.rz;
      const far = Math.hypot(x - ear.x, z - ear.z);
      for (let k = 0; k < 6; k++) {
        const i = doing.pellet, o = i * 8;
        doing.pellet = (i + 1) % PELLETS;
        pel[o] = 1; pel[o + 1] = -k * 0.03; pel[o + 2] = ear.x; pel[o + 3] = ear.y + 1.15; pel[o + 4] = ear.z;
        pel[o + 5] = x + (Math.random() - 0.5) * 0.5; pel[o + 6] = z + (Math.random() - 0.5) * 0.45; pel[o + 7] = 0.45 + far * 0.06 + Math.random() * 0.12;
      }
      doing.feed = 12;
    };
    // Space throws it a little ahead of the Ooga, where it faces.
    const feedAhead = () => { const f = pick.f || 1; throwFood(ear.x + pick.fx / f * 2.2, ear.z + pick.fz / f * 2.2); };
    // A shaken cherry sends its petals down at once.
    const shakeTree = (i) => {
      shake[i] = 1;
      if (i < 2) for (let p = i; p < PETALS; p += 2) fall[p * 5 + 2] = 2.8 + ((p * 0.37) % 1) * 1.4;
    };
    const toggleLantern = (i) => { lit[i] ^= 1; };
    const waft = () => { doing.waft = 1; };
    // Space's actions, made once; the lantern nearest is kept in `lantern`, the tree nearest in `tree`.
    let lantern = 0, tree = 0;
    const ACT = {
      bell: { key: "bell", label: "RING", hint: "Space · Ring the bell", tap: "Tap RING to ring the bell", run: () => ringBell() },
      gong: { key: "gong", label: "STRIKE", hint: "Space · Strike the gong", tap: "Tap STRIKE to strike the gong", run: () => strikeGong() },
      bowl: { key: "bowl", label: "RING", hint: "Space · Ring the singing bowl", tap: "Tap RING to ring the bowl", run: () => ringBowl() },
      winds: { key: "winds", label: "RING", hint: "Space · Ring the wind bells", tap: "Tap RING to ring the wind bells", run: () => ringWinds(1) },
      feed: { key: "feed", label: "FEED", hint: "Space · Throw the koi some food", tap: "Tap FEED, or tap the water where you'd like to throw it", run: () => feedAhead() },
      shake: { key: "shake", label: "SHAKE", hint: "Space · Shake the tree", tap: "Tap SHAKE to shake the tree", run: () => shakeTree(tree) },
      douse: { key: "douse", label: "DOUSE", hint: "Space · Put the lantern out", tap: "Tap DOUSE to put the lantern out", run: () => toggleLantern(lantern) },
      light: { key: "light", label: "LIGHT", hint: "Space · Light the lantern", tap: "Tap LIGHT to light the lantern", run: () => toggleLantern(lantern) },
      waft: { key: "waft", label: "WAFT", hint: "Space · Waft the incense", tap: "Tap WAFT to waft the incense", run: () => waft() }
    };
    return {
      update(dt, t) {
        if (chime.count !== heard) { heard = chime.count; ringBell(); }
        // The breeze: how hard it blows now. It sways the wind bells, but they ring only when the visitor rings them.
        const breeze = 0.5 + 0.5 * Math.sin(t * 0.23) * Math.sin(t * 0.37 + 1);
        doing.feed = Math.max(0, doing.feed - dt);
        // The food: each pellet arcs from the hand to the water, splashes (the first of a handful rings the water) and
        // floats, bobbing and drifting a little, until a koi takes it or it sinks.
        for (let i = 0; i < PELLETS; i++) {
          const o = i * 8, n = pellets[i];
          if (pel[o] === 1) {
            const u = (pel[o + 1] += dt) / pel[o + 7];
            if (u < 0) continue;
            if (u >= 1) { pel[o] = 2; afloat[i] = 14; if (i % 3 === 0) ripple(pel[o + 5], pel[o + 6]); continue; }
            const lift = Math.min(1.2, 0.35 + Math.hypot(pel[o + 5] - pel[o + 2], pel[o + 6] - pel[o + 4]) * 0.12);
            n.position.x = pel[o + 2] + (pel[o + 5] - pel[o + 2]) * u; n.position.z = pel[o + 4] + (pel[o + 6] - pel[o + 4]) * u;
            n.position.y = pel[o + 3] + (WATER + 0.008 - pel[o + 3]) * u + lift * 4 * u * (1 - u);
            n.rotation.x = u * 9; n.rotation.y = u * 6;
          } else if (pel[o] === 2) {
            if ((afloat[i] -= dt) <= 0) { pel[o] = 0; n.position.y = -5; continue; }
            n.position.x = pel[o + 5] + Math.sin(t * 0.6 + i) * 0.03; n.position.z = pel[o + 6] + Math.cos(t * 0.5 + i * 1.3) * 0.03;
            n.position.y = WATER + 0.006 + 0.003 * Math.sin(t * 2.4 + i) - (afloat[i] < 1.5 ? (1.5 - afloat[i]) * 0.03 : 0);
          }
        }
        // The koi: each wanders as it likes, its turns following two slow rhythms of its own and eased in and out, never
        // snapped; it curves back from the pond's edge before it reaches it, and round a koi close ahead of it. Its speed
        // is its own cruise, waxing and waning, with now and then a flick of the tail that drives it on and lets it glide
        // back down; food afloat within reach draws it over, quicker, rising to take it. Its tail beats faster the faster
        // it swims and swings out of a turn; its body sways only a little against the beat.
        for (let i = 0; i < N; i++) {
          const k = KOI[i], n = koi[i];
          let food = -1, best = 3.5;
          for (let j = 0; j < PELLETS; j++) {
            if (pel[j * 8] !== 2) continue;
            const d = Math.hypot(kx[i] - pellets[j].position.x, kz[i] - pellets[j].position.z);
            if (d < best) { best = d; food = j; }
          }
          let want = 0.55 * Math.sin(t * k.f1 + k.p) + 0.35 * Math.sin(t * k.f2 + k.p * 1.7);
          if (food >= 0) {
            let d = Math.atan2(pellets[food].position.z - kz[i], pellets[food].position.x - kx[i]) - kh[i];
            d -= TAU * Math.round(d / TAU);
            want = d * 2.2;
          }
          const ex = (kx[i] - POND.x) / (POND.rx * 0.8), ez = (kz[i] - POND.z) / (POND.rz * 0.8), e = Math.hypot(ex, ez);
          // (After food it goes right up to the rim, where the pellets may float.)
          const edge = food >= 0 ? 1.08 : 0.6;
          if (e > edge) {
            let d = Math.atan2(POND.z - kz[i], POND.x - kx[i]) - kh[i];
            d -= TAU * Math.round(d / TAU);
            want += d * 2.6 * smooth(edge, edge + 0.4, e);
          }
          const ch = Math.cos(kh[i]), sh = Math.sin(kh[i]);
          for (let j = 0; j < N; j++) {
            if (j === i) continue;
            const dx = kx[j] - kx[i], dz = kz[j] - kz[i], dd = Math.hypot(dx, dz);
            if (dd > 0.3 || dd < 1e-4 || (dx * ch + dz * sh) / dd < 0.3) continue;
            want -= Math.sign(ch * dz - sh * dx || 1) * 1.4 * (1 - dd / 0.3);
          }
          // Closing on food it turns tighter and slows, so it takes the pellet rather than circling it.
          const tight = food >= 0 ? 3 : 1.8;
          want = Math.max(-tight, Math.min(tight, want));
          kw[i] += (want - kw[i]) * (1 - Math.exp(-dt * 2.5));
          kh[i] += kw[i] * dt;
          if ((knext[i] -= dt) <= 0) { knext[i] = 4 + Math.random() * 9; kburst[i] = 0.4 + Math.random() * 0.4; }
          kburst[i] = Math.max(0, kburst[i] - dt);
          const cruise = k.cruise * (0.65 + 0.5 * (0.5 + 0.5 * Math.sin(t * k.f1 * 0.7 + k.p * 2)));
          const goal = food >= 0 ? (0.4 + k.cruise) * Math.min(1, 0.25 + best / 0.6) : kburst[i] > 0 ? k.cruise * 2.6 : cruise;
          kv[i] += (goal - kv[i]) * (1 - Math.exp(-dt * (goal > kv[i] ? 3 : 0.7)));
          kx[i] += Math.cos(kh[i]) * kv[i] * dt; kz[i] += Math.sin(kh[i]) * kv[i] * dt;
          const qx = (kx[i] - POND.x) / (POND.rx * 0.88), qz = (kz[i] - POND.z) / (POND.rz * 0.88), q = Math.hypot(qx, qz);
          if (q > 1) { kx[i] = POND.x + (kx[i] - POND.x) / q; kz[i] = POND.z + (kz[i] - POND.z) / q; }
          if (food >= 0 && best < 0.11) { pel[food * 8] = 0; pellets[food].position.y = -5; kb[i] = 0.6; }
          kb[i] = Math.max(0, kb[i] - dt);
          ktail[i] += dt * (5 + kv[i] * 26);
          const sway = Math.min(1, 0.25 + kv[i] * 3);
          n.position.x = kx[i]; n.position.z = kz[i];
          n.position.y = WATER - 0.055 - k.depth + (food >= 0 && best < 0.5 ? 0.025 + k.depth : 0) + kb[i] * 0.03;
          n.rotation.y = -kh[i] + 0.035 * sway * Math.sin(ktail[i] - 1.2);
          tails[i].rotation.y = 0.38 * sway * Math.sin(ktail[i]) + kw[i] * 0.25;
        }
        if ((doing.rise -= dt) <= 0) { doing.rise = 2.5 + Math.random() * 4; const i = Math.floor(Math.random() * koi.length); ripple(kx[i], kz[i]); }
        for (let i = 0; i < ripples.length; i++) {
          const o = i * 3, n = ripples[i];
          if (rippleAt[o + 2] < 0) continue;
          const age = rippleAt[o + 2] += dt;
          if (age > 2.4) { rippleAt[o + 2] = -1; n.position.y = -5; continue; }
          n.position.x = rippleAt[o]; n.position.y = WATER + 0.004; n.position.z = rippleAt[o + 1];
          n.scale.x = n.scale.y = n.scale.z = 0.1 + age * 0.5;
          n.glow = 1 - age / 2.4;
        }
        for (let i = 0; i < petals.length; i++) {
          const o = i * 5, n = petals[i];
          fall[o + 2] -= fall[o + 3] * dt;
          if (fall[o + 2] < 0.05) fall[o + 2] = 3.6 + ((i * 0.37 + t * 0.13) % 1) * 0.8;
          n.position.x = fall[o] + Math.sin(t * 1.3 + fall[o + 4]) * 0.4; n.position.y = fall[o + 2]; n.position.z = fall[o + 1] + Math.cos(t + fall[o + 4]) * 0.3;
          n.rotation.x = t * 2 + fall[o + 4]; n.rotation.y = t + fall[o + 4];
        }
        // The smoke rises on its own clock, faster and fuller for a while after a waft.
        doing.smokeT += dt * (1 + 2 * doing.waft);
        for (let i = 0; i < smoke.length; i++) {
          const s = i / smoke.length, k = (s + doing.smokeT * 0.1) % 1, n = smoke[i], size = (0.6 + k * 1.4) * (1 - k) * (1 + doing.waft);
          n.position.x = BURNER.x + Math.sin(k * 9 + s * 5) * 0.18 * k; n.position.y = 1.18 + k * 1.5; n.position.z = BURNER.z + Math.cos(k * 7) * 0.14 * k;
          n.scale.x = n.scale.y = n.scale.z = size;
        }
        doing.waft = Math.max(0, doing.waft - dt / 4);
        for (let i = 0; i < tips.length; i++) tips[i].glow = 0.75 + 0.25 * Math.sin(t * 2.3 + i * 2.1);
        for (let i = 0; i < lamps.length; i++) lamps[i].glow = lit[i] ? 0.88 + 0.07 * Math.sin(t * 7.3 + i * 1.7) + 0.05 * Math.sin(t * 13.1 + i * 2.9) : 0.08;
        for (let i = 0; i < paper.length; i++) {
          const kick = swing[i] *= Math.exp(-dt * 0.6);
          paper[i].rotation.z = (0.035 + 0.3 * kick) * Math.sin(t * (kick > 0.02 ? 2.6 : 0.8) + i * 1.3); paper[i].rotation.x = 0.025 * Math.sin(t * 0.6 + i * 2.1);
        }
        // The cranes: the leader goes round its loop, swinging in and out and rising and falling a little, the rest
        // strung behind it to either side in a V, each heading along its path and banked into the turn. Their wings
        // beat as a crane's do, a quick downstroke and an easier upstroke, the hands following the arms a little behind
        // and bending further, the body bobbing against the beat; now and then the flock glides, wings held out flat with
        // the hands a little drooped.
        for (let i = 0; i < BIRDS; i++) {
          const rank = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1, n = birds[i];
          const th = t * FLIGHT.w - rank * 0.09, out = FLIGHT.r + side * rank * FLIGHT.apart, r1 = out + FLIGHT.swing * Math.sin(2 * th), r2 = out + FLIGHT.swing * Math.sin(2 * th + 0.02);
          const x = r1 * Math.cos(th), z = r1 * Math.sin(th), dx = r2 * Math.cos(th + 0.01) - x, dz = r2 * Math.sin(th + 0.01) - z;
          const glide = smooth(0.62, 0.82, 0.5 + 0.5 * Math.sin(t * 0.37 + rank * 0.25)), beat = t * 7.5 + i * 0.7, stroke = Math.sin(beat - 0.35 * Math.sin(beat));
          const arm = (1 - glide) * (0.12 + 0.42 * stroke) + glide * 0.05, hand = (1 - glide) * (0.05 + 0.32 * Math.sin(beat - 0.9)) - glide * 0.06;
          n.position.x = x; n.position.z = z; n.position.y = FLIGHT.y + 0.35 * Math.sin(3 * th) + rank * 0.12 - (1 - glide) * 0.035 * stroke;
          n.rotation.y = Math.atan2(dx, dz); n.rotation.z = 0.16;
          wingsL[i].rotation.z = arm; wingsR[i].rotation.z = -arm; handsL[i].rotation.z = hand; handsR[i].rotation.z = -hand;
        }
        // Streaks run down both falls: the even ones the lower, the odd ones the upper.
        for (let i = 0; i < streaks.length; i++) streaks[i].position.y = i % 2 ? 2.25 - ((t * 1.5 + i * 0.37) % 1) * 0.85 : 1.08 - ((t * 1.7 + i * 0.37) % 1) * 0.92;
        // The trees' crowns in the breeze, shaken hard when struck; the bamboo; the wind bells.
        for (let i = 0; i < crowns.length; i++) {
          const k = shake[i] *= Math.exp(-dt * 1.6), n = crowns[i];
          n.rotation.z = 0.025 * breeze * Math.sin(t * 0.9 + i * 2) + 0.09 * k * Math.sin(t * 15 + i);
          n.rotation.x = 0.02 * breeze * Math.sin(t * 0.7 + i * 1.3) + 0.07 * k * Math.sin(t * 13 + i * 2);
        }
        const rustle = doing.rustle *= Math.exp(-dt * 0.8);
        for (let i = 0; i < bamboo.length; i++) {
          const n = bamboo[i], amp = 0.012 + 0.012 * breeze + 0.05 * rustle;
          n.rotation.z = amp * Math.sin(t * (1.1 + i * 0.13) + i); n.rotation.x = amp * 0.7 * Math.sin(t * (0.9 + i * 0.11) + i * 2);
        }
        const winds2 = doing.winds *= Math.exp(-dt * 0.7);
        for (let i = 0; i < winds.length; i++) {
          const n = winds[i], amp = 0.06 * breeze + 0.5 * winds2;
          n.rotation.x = amp * Math.sin(t * (3 + (i % 3)) + i); n.rotation.z = amp * 0.8 * Math.sin(t * (2.6 + (i % 4) * 0.4) + i * 1.7);
        }
        // The bell: its log drawn back, let swing and landing (heard then), the bell rocking and glowing as it hums.
        if (state.bell >= 0) {
          const s = state.bell += dt, hit = STRIKE.back + STRIKE.swing;
          let a;
          if (s < STRIKE.back) { const u = s / STRIKE.back; a = STRIKE.pull * u * u * (3 - 2 * u); }
          else if (s < hit) { const u = (s - STRIKE.back) / STRIKE.swing; a = STRIKE.pull + (STRIKE.hit - STRIKE.pull) * u * u; }
          else a = STRIKE.hit * Math.exp(-(s - hit) * 2.2) * Math.cos((s - hit) * 5);
          if (!state.bellRang && s >= hit) { state.bellRang = true; audio.strike("bell", 1, ear, BELL); }
          striker.rotation.z = rest.striker + a;
          const hum = s > hit ? Math.exp(-(s - hit) / 2.5) : 0;
          bell.rotation.z = rest.bell - 0.05 * hum * Math.sin((s - hit) * 4.4);
          bell.glow = 1 + 4 * hum;
          if (s > hit + 9) { state.bell = -1; striker.rotation.z = rest.striker; bell.rotation.z = rest.bell; bell.glow = 1; }
        }
        // The gong: its mallet drawn back on its cord, let swing into it (heard then), and the gong swaying as it hums.
        if (state.gong >= 0) {
          const s = state.gong += dt, hit = MALLET.back + MALLET.swing;
          let a;
          if (s < MALLET.back) { const u = s / MALLET.back; a = MALLET.pull * u * u * (3 - 2 * u); }
          else if (s < hit) { const u = (s - MALLET.back) / MALLET.swing; a = MALLET.pull + (MALLET.hit - MALLET.pull) * u * u; }
          else a = MALLET.hit * Math.exp(-(s - hit) * 3) * Math.cos((s - hit) * 6);
          mallet.rotation.x = rest.mallet + a;
          if (!state.gongRang && s >= hit) { state.gongRang = true; audio.strike("gong", 1, ear, GONG); }
          const hum = s > hit ? Math.exp(-(s - hit) / 2) : 0;
          gong.rotation.x = rest.gong + 0.22 * hum * Math.sin((s - hit) * 3.6);
          gong.glow = 1 + 5 * hum;
          if (s > hit + 8) { state.gong = -1; mallet.rotation.x = rest.mallet; gong.rotation.x = rest.gong; gong.glow = 1; }
        }
        if (doing.bowl >= 0) {
          const s = doing.bowl += dt;
          bowl.glow = 1 + 2.5 * Math.exp(-s / 2.5) * (0.8 + 0.2 * Math.sin(s * 11));
          if (s > 12) { doing.bowl = -1; bowl.glow = 1; }
        }
      },
      // Space's action where the Ooga stands: the bell from its base or in front of it, the gong, the bowl, the pagoda's
      // wind bells, a lantern, the incense, a tree, or the koi from the pond's edge or the bridge.
      near(x, z, fx, fz) {
        pick.act = null; pick.d = Infinity; pick.x = x; pick.z = z; pick.fx = fx; pick.fz = fz; pick.f = Math.hypot(fx, fz) || 1;
        consider(ACT.bell, BELL.x, BELL.z, 2.6);
        consider(ACT.gong, GONG.x, GONG.z + 0.35, 1.6);
        consider(ACT.bowl, BOWL.x, BOWL.z, 1.5);
        consider(ACT.winds, PAGODA.x, PAGODA.z, 3.0);
        consider(ACT.waft, BURNER.x, BURNER.z, 1.8);
        for (let i = 0; i < LANTERN_AT.length; i++) {
          const before = pick.act;
          consider(lit[i] ? ACT.douse : ACT.light, LANTERN_AT[i][0], LANTERN_AT[i][1], 1.6);
          if (pick.act !== before) lantern = i;
        }
        for (let i = 0; i < TREES.length; i++) {
          const before = pick.act;
          consider(ACT.shake, TREES[i].x, TREES[i].z, 1.7);
          if (pick.act !== before) tree = i;
        }
        // The pond by how far its edge is, from outside it or on the bridge over it.
        const rim = (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) - 1) * Math.min(POND.rx, POND.rz);
        if (rim < 1.9 && Math.max(0, rim) + 0.3 < pick.d) { pick.act = ACT.feed; pick.d = Math.max(0, rim) + 0.3; }
        return pick.act;
      },
      tap(owner, hud, ray) {
        switch (owner.kind) {
          case "gong": strikeGong(); hud.toast("Bong. The gong hums a long while"); return true;
          case "bell": ringBell(); hud.toast("The bell rings once a block, about every ten minutes; this one is for you"); return true;
          case "bowl": ringBowl(); hud.toast("The bowl sings"); return true;
          case "chimes": ringWinds(1); hud.toast("The wind bells on the pagoda's eaves"); return true;
          case "pond": {
            // Where the tap's ray meets the water, or just ahead of the Ooga if it can't.
            if (ray && ray.dy < -1e-4) { const t = (WATER - ray.oy) / ray.dy; throwFood(ray.ox + ray.dx * t, ray.oz + ray.dz * t); } else feedAhead();
            return true;
          }
          case "tree": shakeTree(owner.index); hud.toast(owner.index < 2 ? "Petals everywhere" : "The maple's leaves shiver"); return true;
          case "bamboo": doing.rustle = 1; hud.toast("The bamboo rustles"); return true;
          case "lantern": toggleLantern(owner.index); hud.toast(lit[owner.index] ? "The lantern is lit" : "The lantern is out"); return true;
          case "incense": waft(); hud.toast("A fresh curl of incense"); return true;
          case "paperlamp": swing[owner.index] = 1; return true;
          case "torii": hud.toast("Torii · the gate between the everyday and the sacred"); return true;
          case "live": hud.toast(chime.text ? `${chime.text} · the bell rings once a block` : "The bell rings once a block"); return true;
        }
        return false;
      },
      get stats() { return { ...audio.stats, bell: state.bell, gong: state.gong, bellRang: state.bellRang, gongRang: state.gongRang, lit: Array.from(lit), feed: doing.feed }; },
      dispose() {
        document.removeEventListener("pointerdown", wake);
        document.removeEventListener("keydown", wake);
        audio.dispose();
      }
    };
  };
  BL.timechainRoomKinds.temple = { plan, steps, animate, door, statue, STATUE_STEPS };
})();
