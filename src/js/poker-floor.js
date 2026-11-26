// Banana Club's floor: a polished marble hall with a dark border, a field of white veined tiles patterned with dark
// diamonds, gold lines, three inlaid medallions, the runner of dark veined marble with its rosette of Bitcoin marks,
// the same dark marble and rosette in an aisle down each side and a framed panel under each lounge (no red or maroon
// anywhere on the floor), all flat and laid side by side (no layer stacked on another where it can be cut instead, for
// the Canvas 2D sort), and on WebGL a gloss sheet over the whole polished floor but the sculpture’s plinth.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble, hexToRgb = BL.math.hexToRgb;
  // The gloss sheet's strength and its height over the marble's top (above every inlay, so its plane clips none into
  // the reflection).
  const GLOSS = 0.45, Y = 0.02;
  // Heights: the marble's top (the tiles' slabs are 0.35 thick, set 0.19 down), the cloth's top, the skirts' foot.
  const TOP = -0.015, CLOTH = 0.006, SKIRT = -0.08, LIFT = 0.004, TILE_H = 0.35, TILE_Y = TOP - TILE_H / 2;
  const WHITE = "#efe6d2", NERO = "#13120f", NERO_SOFT = "#332d25", GOLD = K.GOLD, DARK_GOLD = "#8a6a35", GREY = "#b9b2a6";
  const VEINS = { field: ["#bab3a8", "#c6b28d", "#bab3a8"], border: ["#cfc6b8", "#8f7a55"] };
  // The field is a diamond checker: a nero diamond at every corner where field tiles meet, of half-diagonal REACH, so
  // it reaches the tiles' mid-edges and the field is half dark and half white, cut into triangles where it meets the
  // border, the aisles and the bands. Reflections read over the dark stone.
  const REACH = 2;
  // The runner: inlaid Bitcoin-orange marble, flush with the hall's stone and polished like it, framed each side by a
  // thin gold line and a band of nero, its veins pale cream-gold and burnt sienna, and down its length a "rosette" of
  // Bitcoin marks: square tiles of TILE m, four across the strip, each with four marks turned round its middle (their
  // feet toward it) and small light diamonds at its middle and corners. The marks sit tone-on-tone, darker than the
  // stone, the diamonds lighter.
  const ORANGE = "#d7761c", DARK_VEINS = ["#463e31", "#514637", "#342e26", "#514637", "#463e31", "#645239"], STRIP_HALF = 3, TILE = 1.5, MARK_AT = 0.36;
  const MARK = Object.freeze({ mark: "#483a26", gem: "#987341" });
  // The layout, in room metres. The runner's two lengths run between the medallions; its dark stone is STRIP_HALF
  // either side of x = 0 and its frame reaches RUNNER_HALF. The bronze-edged aisles lie between the tables' chairs and the
  // statues' plinths, the orange panels under the far corners' lounges; each frames one rosette tile across its stone
  // (`AISLE_FRAME`), the panel two by two (`PANEL_FRAME`), whole tiles only.
  const CELL = 4, RUNNER_HALF = 3.65, END = 0.08, RUNS = [[6, 26], [-26, -6]];
  const AISLE = { x0: 18.4, x1: 21.0, z0: -26, z1: 26 }, RUG_AT = { x0: 19.4, x1: 23.2, z0: -33.4, z1: -28.6 }, AISLE_FRAME = 0.55, PANEL_FRAME = 0.3;
  const loungeZ = side => side * (RUG_AT.z0 + RUG_AT.z1) / 2;
  const MEDALLIONS = Object.freeze([
    { x: 0, z: 0, r: 4.6, block: [-6, -6, 6, 6], points: 16, rIn: 2.3, ro: 3.85, tips: [3.85, 2.85, 3.3, 2.85], rings: [[3.85, 3.92, GOLD], [3.92, 4.42, NERO], [4.42, 4.6, GOLD]], seed: 81 },
    { x: 0, z: 29, r: 2.8, block: [-6, 26, 6, 34], points: 8, rIn: 0.32, ro: 2.3, tips: [2.3, 1.45], rings: [[2.3, 2.38, GOLD], [2.38, 2.68, NERO], [2.68, 2.8, GOLD]], seed: 82 },
    { x: 0, z: -30, r: 3.6, block: [-6, -34, 6, -26], points: 8, rIn: 0.4, ro: 3, tips: [3, 1.9], rings: [[3, 3.08, GOLD], [3.08, 3.45, NERO], [3.45, 3.6, GOLD]], seed: 83 }
  ].map(m => Object.freeze(m)));
  // The runner's dark stone, as rectangles [x0, z0, x1, z1] (polished: under the gloss sheet).
  const STRIP = Object.freeze(RUNS.map(([a, b]) => Object.freeze([-STRIP_HALF, a + END, STRIP_HALF, b - END])));
  // The orange aisles and lounge panels, as rectangles [x0, z0, x1, z1] (polished, under the gloss sheet; the gold seam
  // lines stop at them). There is no cloth on the floor.
  const INLAYS = Object.freeze([
    [AISLE.x0, AISLE.z0, AISLE.x1, AISLE.z1], [-AISLE.x1, AISLE.z0, -AISLE.x0, AISLE.z1],
    [RUG_AT.x0, RUG_AT.z0, RUG_AT.x1, RUG_AT.z1], [-RUG_AT.x1, -RUG_AT.z1, -RUG_AT.x0, -RUG_AT.z0]
  ].map(c => Object.freeze(c)));
  const rgbs = new Map(), rgb = hex => { if (!rgbs.has(hex)) rgbs.set(hex, hexToRgb(hex)); return rgbs.get(hex); };
  // A flat polygon of [x, z] points at height y, wound to face up.
  const flat = (geo, pts, y, hex) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const ids = pts.map(p => M.pushVert(geo, p[0], y, p[1]));
    M.face(geo, area > 0 ? ids.reverse() : ids, rgb(hex));
  };
  const rect = (geo, x0, z0, x1, z1, y, hex) => flat(geo, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, hex);
  // Four upright faces round a rectangle from y1 down to y0, facing out, closing the gap to a bevelled neighbour.
  const skirt = (geo, x0, z0, x1, z1, y1, y0, hex) => {
    const c = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4], ids = [M.pushVert(geo, a[0], y1, a[1]), M.pushVert(geo, b[0], y1, b[1]), M.pushVert(geo, b[0], y0, b[1]), M.pushVert(geo, a[0], y0, a[1])];
      // Wind it to face away from the rectangle's middle: its normal is (b - a) x (down), checked against the way out.
      const ex = b[0] - a[0], ez = b[1] - a[1], dy = y0 - y1, nx = -ez * dy, nz = ex * dy;
      const ox = (a[0] + b[0]) / 2 - (x0 + x1) / 2, oz = (a[1] + b[1]) / 2 - (z0 + z1) / 2;
      M.face(geo, nx * ox + nz * oz < 0 ? ids.reverse() : ids, rgb(hex));
    }
  };
  const diamond = (geo, cx, cz, a, y, hex) => flat(geo, [[cx, cz - a], [cx + a, cz], [cx, cz + a], [cx - a, cz]], y, hex);
  // How a vein is drawn: its width (w plus up to span, m), its segments' length (len plus up to step), how far its ends
  // taper (end, a share of its middle's width) and the chance of one branch off it. BOLD is the dark stone's and the
  // medallions' veining; FINE the white field's and the orange runner's: thin, longer, tapering to a hair, often forked.
  const BOLD = { w: 0.04, span: 0.07, len: 0.2, step: 0.35, end: 0.3, branch: 0 };
  const FINE = { w: 0.012, span: 0.026, len: 0.14, step: 0.22, end: 0.08, branch: 0.65 };
  // A tapering strip along pts, width w(j) at point j, flat at y.
  const strip = (geo, pts, width, y, hex) => {
    const last = pts.length - 1, side = [];
    for (let j = 0; j <= last; j++) {
      const p = pts[Math.max(0, j - 1)], q = pts[Math.min(last, j + 1)], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, w = width(j, last) / 2;
      side.push([pts[j][0] + dz / l * w, pts[j][1] - dx / l * w, pts[j][0] - dz / l * w, pts[j][1] + dx / l * w]);
    }
    for (let j = 0; j < last; j++) { const s = side[j], t = side[j + 1]; flat(geo, [[s[0], s[1]], [t[0], t[1]], [t[2], t[3]], [s[2], s[3]]], y, hex); }
  };
  // Marble veins: meandering strips of a few bends each, tapering, inside a flat of half-extents hx by hz round
  // (cx, cz) and where `allowed` says, every turn and length drawn from `rand` in a fixed order (BOLD draws no more
  // than it always did); a fine vein may fork once, the branch leaving at a bend and thinning to nothing.
  const veins = (geo, rand, cx, cz, hx, hz, y, count, tones, allowed = null, look = BOLD) => {
    const base = rand() * Math.PI;
    const inside = (x, z, margin) => Math.abs(x - cx) <= hx - margin && Math.abs(z - cz) <= hz - margin && (!allowed || allowed(x, z));
    for (let v = 0; v < count; v++) {
      const hex = tones[v % tones.length];
      let x = cx + (rand() * 2 - 1) * hx * 0.85, z = cz + (rand() * 2 - 1) * hz * 0.85, a = base + (rand() - 0.5) * 0.9;
      const n = 6 + Math.floor(rand() * 6), w0 = look.w + rand() * look.span, pts = [[x, z]], turns = [a];
      if (allowed && !allowed(x, z)) continue;
      for (let s = 0; s < n; s++) {
        a += (rand() - 0.5) * 0.75;
        const len = look.len + rand() * look.step, nx = x + Math.sin(a) * len, nz = z + Math.cos(a) * len;
        if (!inside(nx, nz, w0)) break;
        x = nx; z = nz; pts.push([x, z]); turns.push(a);
      }
      if (pts.length < 2) continue;
      // Thickest in its middle, fine at its ends.
      const along = (j, last) => w0 * (look.end + (1 - look.end) * Math.sin(Math.PI * (j + 0.5) / (last + 1)));
      strip(geo, pts, along, y, hex);
      if (!look.branch || pts.length < 4 || rand() >= look.branch) continue;
      const at = 1 + Math.floor(rand() * (pts.length - 2)), wb = along(at, pts.length - 1) * 0.7, fork = [pts[at]];
      let b = turns[at] + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.4), bx = pts[at][0], bz = pts[at][1];
      for (let s = 0, m = 2 + Math.floor(rand() * 3); s < m; s++) {
        b += (rand() - 0.5) * 0.6;
        const len = look.len * 0.8 + rand() * look.step * 0.6, nx = bx + Math.sin(b) * len, nz = bz + Math.cos(b) * len;
        if (!inside(nx, nz, wb)) break;
        bx = nx; bz = nz; fork.push([bx, bz]);
      }
      if (fork.length > 1) strip(geo, fork, (j, last) => wb * (1 - 0.9 * j / last), y, hex);
    }
  };
  const cache = M.scopedMap();
  const once = (key, make) => { if (cache.has(key)) return cache.get(key); const g = make(); cache.set(key, g); return g; };
  // A bevelled marble tile (the kit's slab) w by d about its own middle, top at TILE_H / 2, with its veins.
  const tile = (w, d, seed, color, tones, count, look = BOLD) => once(["tile", w, d, seed, color, count, look === FINE ? "fine" : "bold"].join(":"), () => {
    const bevel = Math.min(w, TILE_H, d, 0.3) * 0.2, lines = M.merge();
    veins(lines, BL.math.mulberry32(seed * 7919 + count), 0, 0, w / 2 - bevel, d / 2 - bevel, TILE_H / 2 + LIFT, count, tones, null, look);
    return M.merge(K.slab({ w, h: TILE_H, d, seed, color, veins: 0 }), lines);
  });
  // Canvas 2D's field tile: the pattern cut into its top side by side (a white octagon, or a diamond, and the four dark
  // corner triangles), since its painter's sort cannot draw a flat laid over a larger one; plain sides, no veins.
  const liteTile = (w, d) => once(["lite-tile", w, d, REACH].join(":"), () => {
    const geo = M.merge(), hx = w / 2, hz = d / 2, r = Math.min(REACH, hx, hz), y = TILE_H / 2;
    const ring = [[-hx + r, -hz], [hx - r, -hz], [hx, -hz + r], [hx, hz - r], [hx - r, hz], [-hx + r, hz], [-hx, hz - r], [-hx, -hz + r]];
    flat(geo, ring.filter((p, i) => { const q = ring[(i + 1) % ring.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-9; }), y, WHITE);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) flat(geo, [[sx * hx, sz * hz], [sx * (hx - r), sz * hz], [sx * hx, sz * (hz - r)]], y, NERO);
    skirt(geo, -hx, -hz, hx, hz, y, -y, WHITE);
    return geo;
  });
  // Which part of the floor a 4 m cell is (columns 0 to 12 from x -24, rows 0 to 18 from z -36).
  const kindOf = (col, row) => {
    const edgeCol = col === 0 || col === 12, aisleCol = col === 1 || col === 11;
    const loungeRow = col < 2 ? 18 - row : row;
    if ((edgeCol || aisleCol) && (loungeRow === 1 || loungeRow === 2)) return "lounge";
    if (edgeCol || row === 0 || row === 18) return "border";
    if (col >= 5 && col <= 7) return "band";
    if (aisleCol && row >= 3 && row <= 15) return "aisle";
    return "field";
  };
  const runnerRow = row => row >= 3 && row <= 15 && (row <= 7 || row >= 11);
  // One length of runner from za to zb, all flush at the marble's top: gold end bars; each side a gold line, a nero band
  // and the gold trim; the dark stone between them in 4 m rows, veined. A skirt closes it against the bevelled tiles.
  const runner = (za, zb, lite) => {
    const geo = M.merge(), seams = [za + END], rand = BL.math.mulberry32(901);
    for (let z = za + CELL; z < zb - END; z += CELL) seams.push(z);
    seams.push(zb - END);
    rect(geo, -RUNNER_HALF, za, RUNNER_HALF, za + END, TOP, GOLD); rect(geo, -RUNNER_HALF, zb - END, RUNNER_HALF, zb, TOP, GOLD);
    for (let k = 0; k + 1 < seams.length; k++) {
      const a = seams[k], b = seams[k + 1];
      for (const s of [-1, 1]) for (const [p, q, hex] of [[STRIP_HALF, 3.05, GOLD], [3.05, 3.565, NERO], [3.565, RUNNER_HALF, GOLD]])
        rect(geo, Math.min(s * p, s * q), a, Math.max(s * p, s * q), b, TOP, hex);
      rect(geo, -STRIP_HALF, a, STRIP_HALF, b, TOP, NERO);
      veins(geo, rand, 0, (a + b) / 2, STRIP_HALF - 0.05, (b - a) / 2 - 0.05, TOP + LIFT, lite ? 2 : 9, lite ? DARK_VEINS.slice(0, 1) : DARK_VEINS, null, lite ? BOLD : FINE);
    }
    skirt(geo, -RUNNER_HALF, za, RUNNER_HALF, zb, TOP, SKIRT, GOLD);
    geo.castShadow = false;
    return geo;
  };
  // The Bitcoin mark: a bold B (a stem, three bars and two half rings, the lower one wider) with two short strokes above
  // and two below, 0.5 m tall, in its own xz plane with its top toward -z, centred on its origin. Flat convex pieces,
  // one cached geometry.
  const mark = () => once("mark", () => {
    const geo = M.merge(), y = 0, hex = MARK.mark, dx = 0.01;
    // In the mark's (u, v): u to its right, v up; the room's (x, z) = (u, -v).
    const box = (u0, v0, u1, v1) => flat(geo, [[u0 + dx, -v0], [u1 + dx, -v0], [u1 + dx, -v1], [u0 + dx, -v1]], y, hex);
    box(-0.13, -0.19, -0.06, 0.19);
    box(-0.06, 0.13, 0, 0.19); box(-0.06, -0.03, 0, 0.07); box(-0.06, -0.19, 0, -0.13);
    for (const u of [-0.105, -0.035]) { box(u - 0.0175, 0.19, u + 0.0175, 0.25); box(u - 0.0175, -0.25, u + 0.0175, -0.19); }
    const bowl = (cv, r0, r1, n) => {
      for (let i = 0; i < n; i++) {
        const t0 = -Math.PI / 2 + i * Math.PI / n, t1 = t0 + Math.PI / n, at = (r, t) => [Math.cos(t) * r + dx, -(cv + Math.sin(t) * r)];
        flat(geo, [at(r0, t0), at(r1, t0), at(r1, t1), at(r0, t1)], y, hex);
      }
    };
    bowl(0.1, 0.03, 0.09, 8); bowl(-0.08, 0.05, 0.11, 8);
    geo.castShadow = false;
    return geo;
  });
  // One rosette tile, TILE square about its middle: four marks moved out MARK_AT and turned a quarter at a time, feet
  // in, so a quarter turn of the tile maps it onto itself; a light diamond at its middle and a quarter diamond at each
  // corner, which the neighbouring tiles complete. Laid just over the stone (veins under it) on the full set only.
  const GEM = 0.07;
  const rosette = () => once("rosette", () => {
    const parts = [], m = mark(), h = TILE / 2, y = TOP + 2 * LIFT;
    for (let k = 0; k < 4; k++) {
      const t = k * Math.PI / 2;
      parts.push(M.moved(M.turnedY(M.merge(m), t), -Math.sin(t) * MARK_AT, y, -Math.cos(t) * MARK_AT));
    }
    const gems = M.merge();
    diamond(gems, 0, 0, GEM, y, MARK.gem);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) flat(gems, [[sx * h, sz * h], [sx * (h - GEM), sz * h], [sx * h, sz * (h - GEM)]], y, MARK.gem);
    const g = M.merge(...parts, gems); g.castShadow = false;
    return g;
  });
  // Where the rosette tiles lie along one length of runner: whole tiles only, four across, centred on its middle.
  const tilesAlong = (za, zb) => {
    const n = Math.floor((zb - za - 2 * END) / TILE), z0 = (za + zb) / 2 - n * TILE / 2, out = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < 4; i++) out.push([-STRIP_HALF + TILE / 2 + i * TILE, z0 + TILE / 2 + j * TILE]);
    return out;
  };
  // An orange marble inlay w by d about its middle, flush at the marble's top as the runner is: round its edge a gold
  // line, a nero band and the gold trim, `frame` wide in all; the orange stone inside, veined in 4 m lengths; and a skirt
  // closing it against the bevelled tiles. The rosette tiles laid on it are the runner's own geometry (`inlayTiles`).
  const inlay = (w, d, frame, lite, seed) => {
    const geo = M.merge(), hx = w / 2, hz = d / 2, rand = BL.math.mulberry32(seed);
    const band = (p, q, hex) => {
      rect(geo, -hx + p, -hz + p, hx - p, -hz + q, TOP, hex); rect(geo, -hx + p, hz - q, hx - p, hz - p, TOP, hex);
      rect(geo, -hx + p, -hz + q, -hx + q, hz - q, TOP, hex); rect(geo, hx - q, -hz + q, hx - p, hz - q, TOP, hex);
    };
    band(0, 0.05, GOLD); band(0.05, frame - 0.08, NERO); band(frame - 0.08, frame, GOLD);
    const sx = hx - frame, sz = hz - frame;
    for (let z = -sz; z < sz - 1e-6; z += CELL) {
      const b = Math.min(sz, z + CELL);
      rect(geo, -sx, z, sx, b, TOP, NERO);
      veins(geo, rand, 0, (z + b) / 2, sx - 0.05, (b - z) / 2 - 0.05, TOP + LIFT, lite ? 1 : Math.max(2, Math.round(9 * sx / STRIP_HALF)), lite ? DARK_VEINS.slice(0, 1) : DARK_VEINS, null, lite ? BOLD : FINE);
    }
    skirt(geo, -hx, -hz, hx, hz, TOP, SKIRT, GOLD);
    geo.castShadow = false;
    return geo;
  };
  // The rosette tiles' middles on an inlay w by d with `frame`, about its middle: as many whole tiles as fit each way, centred.
  const inlayTiles = (w, d, frame) => {
    const nx = Math.floor((w - 2 * frame + 1e-9) / TILE), nz = Math.floor((d - 2 * frame + 1e-9) / TILE), out = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out.push([(i - (nx - 1) / 2) * TILE, (j - (nz - 1) / 2) * TILE]);
    return out;
  };
  // A medallion inlaid flush in its block of marble: a star of `points` (tips by turn from `tips`, each split light and
  // dark down its axis) over an orange field (the runner's stone) from rIn to ro, rings out to r, and the block's marble
  // round it to its square edge, every piece beside the next on shared vertices (the rings and the field's rim on one
  // polygon of N sides).
  const medallion = (m, lite) => {
    const geo = M.merge(), P = m.points, h = Math.PI / P, SUB = lite ? 1 : 3, N = 2 * P * SUB, [bx0, bz0, bx1, bz1] = m.block;
    const at = (r, a) => [m.x + r * Math.sin(a), m.z + r * Math.cos(a)];
    // On the orange field: the longest points white, the next dark, any shorter gold.
    const tipOf = k => m.tips[k % m.tips.length], second = Math.max(...m.tips.slice(1));
    const tones = k => tipOf(k) === m.tips[0] ? [WHITE, GREY] : tipOf(k) === second ? [NERO_SOFT, NERO] : [GOLD, DARK_GOLD];
    flat(geo, Array.from({ length: 2 * P }, (_, j) => at(m.rIn, j * h)), TOP, NERO);
    for (let k = 0; k < P; k++) {
      const t = 2 * k * h, T = at(tipOf(k), t), [left, right] = tones(k);
      flat(geo, [at(m.rIn, t - h), at(m.rIn, t), T], TOP, left);
      flat(geo, [at(m.rIn, t), at(m.rIn, t + h), T], TOP, right);
      // The field between this point and the next, fanned from the base corner they share.
      const t1 = t + 2 * h, B = at(m.rIn, t + h), list = [at(tipOf(k + 1), t1)];
      if (tipOf(k + 1) < m.ro - 1e-9) list.push(at(m.ro, t1));
      for (let s = 2 * SUB - 1; s >= 1; s--) list.push(at(m.ro, t + s * h / SUB));
      if (tipOf(k) < m.ro - 1e-9) list.push(at(m.ro, t));
      list.push(T);
      for (let i = 0; i + 1 < list.length; i++) flat(geo, [B, list[i], list[i + 1]], TOP, ORANGE);
    }
    for (const [r0, r1, hex] of m.rings) for (let i = 0; i < N; i++) {
      const a = i * Math.PI * 2 / N, b = (i + 1) * Math.PI * 2 / N;
      flat(geo, [at(r0, a), at(r0, b), at(r1, b), at(r1, a)], TOP, hex);
    }
    // Out to the block's edge: a ray from the middle at each of the N angles meets the square; a segment holding a
    // corner takes it as a fifth point.
    const edge = a => {
      const dx = Math.sin(a), dz = Math.cos(a), tx = dx > 1e-12 ? (bx1 - m.x) / dx : dx < -1e-12 ? (bx0 - m.x) / dx : Infinity, tz = dz > 1e-12 ? (bz1 - m.z) / dz : dz < -1e-12 ? (bz0 - m.z) / dz : Infinity, t = Math.min(tx, tz);
      return [m.x + dx * t, m.z + dz * t];
    };
    const corners = [[bx0, bz0], [bx1, bz0], [bx1, bz1], [bx0, bz1]].map(c => ({ c, a: (Math.atan2(c[0] - m.x, c[1] - m.z) + Math.PI * 2) % (Math.PI * 2) }));
    for (let i = 0; i < N; i++) {
      const a = i * Math.PI * 2 / N, b = (i + 1) * Math.PI * 2 / N, corner = corners.find(c => c.a > a + 1e-9 && c.a < b - 1e-9);
      const pts = [at(m.r, a), edge(a)];
      if (corner) pts.push(corner.c);
      pts.push(edge(b), at(m.r, b));
      flat(geo, pts, TOP, WHITE);
    }
    if (!lite) {
      const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
      veins(geo, BL.math.mulberry32(m.seed), cx, cz, (bx1 - bx0) / 2 - 0.05, (bz1 - bz0) / 2 - 0.05, TOP + LIFT, 18, VEINS.field, (x, z) => Math.hypot(x - m.x, z - m.z) > m.r + 0.15, FINE);
    }
    skirt(geo, bx0, bz0, bx1, bz1, TOP, SKIRT, WHITE);
    return geo;
  };
  // The stone pieces round a lounge's rug (both lounges), each a veined tile of its own size: field white inside the
  // border's line at |x| 22, dark beyond it.
  const lounge = lite => {
    const parts = [], xs = [18, RUG_AT.x0, 22, RUG_AT.x1, 26], zs = [-34, RUG_AT.z0, -30, RUG_AT.z1, -26];
    let seed = 70;
    for (const sx of [-1, 1]) for (let i = 0; i + 1 < xs.length; i++) for (let k = 0; k + 1 < zs.length; k++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[k], z1 = zs[k + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      seed++;
      if (mx > RUG_AT.x0 && mx < RUG_AT.x1 && mz > RUG_AT.z0 && mz < RUG_AT.z1) continue;
      const dark = mx > 22, g = tile(x1 - x0 - 0.02, z1 - z0 - 0.02, seed, dark ? NERO : WHITE, dark ? VEINS.border : VEINS.field, lite ? 1 : 3, dark || lite ? BOLD : FINE);
      parts.push(M.moved(M.merge(g), sx * mx, TILE_Y, sx * mz));
    }
    return M.merge(...parts);
  };
  // Gold lines on the seams: the band's edges, every third seam, and a fillet round the field at the border, broken
  // wherever they would cross an inlay or a medallion's block.
  const LINE_ZONES = [...RUNS.map(([a, b]) => [-RUNNER_HALF, a, RUNNER_HALF, b]), ...MEDALLIONS.map(m => m.block), ...INLAYS];
  const goldLines = () => {
    const parts = [], W = 0.04;
    const run = (along, at, from, to) => {
      const cuts = LINE_ZONES.filter(z => along === "z" ? z[0] < at && at < z[2] : z[1] < at && at < z[3]).map(z => along === "z" ? [z[1], z[3]] : [z[0], z[2]]).sort((p, q) => p[0] - q[0]);
      let a = from;
      for (const [c0, c1] of [...cuts, [to, to]]) {
        const b = Math.min(c0, to);
        if (b - a > 0.05) parts.push(along === "z" ? M.box({ w: W, h: 0.012, d: b - a, color: GOLD, offset: { x: at, y: TOP + 0.006, z: (a + b) / 2 } }) : M.box({ w: b - a, h: 0.012, d: W, color: GOLD, offset: { x: (a + b) / 2, y: TOP + 0.006, z: at } }));
        a = Math.max(a, c1);
      }
    };
    for (const x of [-22, -18, -6, 6, 18, 22]) run("z", x, -34, 34);
    for (const z of [-34, -30, -18, -6, 6, 18, 30, 34]) run("x", z, -22, 22);
    const g = M.merge(...parts); g.castShadow = false;
    return g;
  };
  // The field's dark corner diamonds, full set only: at every corner of a field tile, the quarter of a nero
  // diamond of half-diagonal `reach` that lies on that tile, so a corner shared by four field tiles holds a whole diamond
  // and one on the field's edge a half or a quarter, cut by the seam. Flat on the tiles' tops over their veins and the
  // grooves between them, under the gold lines, with a few cream veins on each whole diamond. Canvas 2D's tiles carry
  // the same pattern in their own tops instead (`liteTile`).
  const corners = () => once("corners", () => {
    const geo = M.merge(), a = REACH, y = TOP + 0.007, rand = BL.math.mulberry32(97);
    const field = (col, row) => col >= 0 && col <= 12 && row >= 0 && row <= 18 && kindOf(col, row) === "field";
    for (let c = 0; c <= 13; c++) for (let r = 0; r <= 19; r++) {
      const cx = (c - 6) * CELL - CELL / 2, cz = (r - 9) * CELL - CELL / 2;
      const quads = [[-1, -1, c - 1, r - 1], [1, -1, c, r - 1], [1, 1, c, r], [-1, 1, c - 1, r]].filter(q => field(q[2], q[3]));
      if (quads.length === 4) {
        flat(geo, [[cx, cz - a], [cx + a, cz], [cx, cz + a], [cx - a, cz]], y, NERO);
        veins(geo, rand, cx, cz, a, a, y + LIFT, 2, VEINS.border, (x, z) => Math.abs(x - cx) + Math.abs(z - cz) < a - 0.08);
      } else for (const [sx, sz] of quads) flat(geo, [[cx, cz], [cx + sx * a, cz], [cx, cz + sz * a]], y, NERO);
    }
    geo.castShadow = false;
    return geo;
  });
  // The gloss sheet: the hall's floor inside its walls less the sculpture’s plinth, in its node's xy plane
  // facing +z (the node lays it face up, so its y runs along the room's -z).
  const glossGeometry = () => once("gloss", () => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false, reflector: true, gloss: GLOSS };
    const add = pts => {
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
      // Up in the room is +z in the sheet: (x, z) becomes (x, -z), so a face up winds clockwise in (x, z).
      const ordered = area > 0 ? pts.slice().reverse() : pts;
      const ids = ordered.map(p => { geo.verts.push(p[0], -p[1], 0); return geo.verts.length / 3 - 1; });
      geo.faces.push({ i: ids, color: [0, 0, 0], emissive: 0 });
    };
    const xs = new Set([-24.25, 24.25, -6, 6]), zs = new Set([-36.4, 36.4, -6, 6]);
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
    const bare = (x, z) => Math.abs(x) < 6 && Math.abs(z) < 6;
    for (let k = 0; k + 1 < Z.length; k++) {
      const z0 = Z[k], z1 = Z[k + 1], mz = (z0 + z1) / 2;
      for (let i = 0; i + 1 < X.length;) {
        if (bare((X[i] + X[i + 1]) / 2, mz)) { i++; continue; }
        let j = i + 1;
        while (j + 1 < X.length && !bare((X[j] + X[j + 1]) / 2, mz)) j++;
        add([[X[i], z0], [X[j], z0], [X[j], z1], [X[i], z1]]);
        i = j;
      }
    }
    // The fountain's square round its basin, cut on 64 rays to the square's edge.
    const R = BL.pokerFountain.RADIUS, F = BL.pokerFountain, n = 64;
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n, b = (i + 1) * Math.PI * 2 / n, ray = t => { const dx = Math.sin(t), dz = Math.cos(t), s = 6 / Math.max(Math.abs(dx), Math.abs(dz)); return [F.X + dx * s, F.Z + dz * s]; };
      const pts = [[F.X + Math.sin(a) * R, F.Z + Math.cos(a) * R], ray(a)];
      for (let c = 1; c < 8; c += 2) { const t = c * Math.PI / 4; if (t > a + 1e-9 && t < b - 1e-9) pts.push([F.X + Math.sign(Math.sin(t)) * 6, F.Z + Math.sign(Math.cos(t)) * 6]); }
      pts.push(ray(b), [F.X + Math.sin(b) * R, F.Z + Math.cos(b) * R]);
      add(pts);
    }
    return geo;
  });
  // Every geometry for one set (lite: Canvas 2D's, with fewer veins in one colour, coarser medallions, no corner decals
  // or rosettes, and the field's pattern cut into one plain tile). `band` is the white tiles beside the runner.
  const parts = lite => once(lite ? "lite" : "full", () => {
    const wl = lite ? BOLD : FINE, nb = lite ? 1 : 4, tf = lite ? VEINS.field.slice(0, 1) : VEINS.field, tb = lite ? VEINS.border.slice(0, 1) : VEINS.border;
    return {
      field: lite ? [liteTile(3.98, 3.98)] : [0, 1, 2, 3, 4, 5].map(i => tile(3.98, 3.98, 11 + i, WHITE, tf, 8, FINE)),
      border: [0, 1].map(i => tile(3.98, 3.98, 21 + i, NERO, tb, nb)),
      band: [0, 1, 2].map(i => tile(6 - RUNNER_HALF - 0.02, 3.98, 51 + i, WHITE, tf, lite ? 1 : 4, wl)),
      narrow: tile(AISLE.x0 - 18 - 0.02, 3.98, 61, WHITE, tf, lite ? 1 : 2, wl),
      wide: [0, 1].map(i => tile(22 - AISLE.x1 - 0.02, 3.98, 62 + i, WHITE, tf, lite ? 1 : 3, wl)),
      lounge: lounge(lite), runner: runner(RUNS[0][0], RUNS[0][1], lite), rosette: lite ? null : rosette(),
      aisle: inlay(AISLE.x1 - AISLE.x0, AISLE.z1 - AISLE.z0, AISLE_FRAME, lite, 903),
      panel: inlay(RUG_AT.x1 - RUG_AT.x0, RUG_AT.z1 - RUG_AT.z0, PANEL_FRAME, lite, 905),
      medallions: MEDALLIONS.map(m => medallion(m, lite)), lines: goldLines(), corners: lite ? null : corners()
    };
  });
  // The tile geometries placed on the open field and the border, for the room's record.
  const tiles = (lite = false) => { const p = parts(lite); return { field: p.field, border: p.border }; };
  const build = (lite = false) => {
    const p = parts(lite), root = S.createNode(), medallions = [];
    const put = (geo, x, y, z, yaw = 0) => { const n = S.createNode({ geometry: geo, position: { x, y, z } }); n.rotation.y = yaw; S.addChild(root, n); return n; };
    for (let row = 0; row < 19; row++) for (let col = 0; col < 13; col++) {
      const x = (col - 6) * CELL, z = (row - 9) * CELL, kind = kindOf(col, row), turn = ((row * 5 + col * 3) & 3) * Math.PI / 2;
      if (kind === "field") put(p.field[(row * 7 + col * 3) % p.field.length], x, TILE_Y, z, turn);
      else if (kind === "border") put(p.border[(row + col) & 1], x, TILE_Y, z, turn);
      else if (kind === "band" && col !== 6 && runnerRow(row)) put(p.band[(row + col) % 3], Math.sign(x) * (RUNNER_HALF + (6 - RUNNER_HALF) / 2), TILE_Y, z, (row & 1) * Math.PI);
      else if (kind === "aisle") {
        const s = Math.sign(x);
        put(p.narrow, s * (18 + AISLE.x0) / 2, TILE_Y, z, (row & 1) * Math.PI);
        put(p.wide[row & 1], s * (22 + AISLE.x1) / 2, TILE_Y, z, (row >> 1 & 1) * Math.PI);
      }
    }
    put(p.lounge, 0, 0, 0);
    put(p.runner, 0, 0, 0); put(p.runner, 0, 0, 0, Math.PI);
    if (p.rosette) for (const [a, b] of RUNS) for (const [x, z] of tilesAlong(a, b)) put(p.rosette, x, 0, z);
    const aisleX = (AISLE.x0 + AISLE.x1) / 2, aisleZ = (AISLE.z0 + AISLE.z1) / 2, panelX = (RUG_AT.x0 + RUG_AT.x1) / 2;
    for (const s of [-1, 1]) {
      put(p.aisle, s * aisleX, 0, aisleZ, s < 0 ? Math.PI : 0); put(p.panel, s * panelX, 0, loungeZ(s), s < 0 ? Math.PI : 0);
      if (!p.rosette) continue;
      for (const [x, z] of inlayTiles(AISLE.x1 - AISLE.x0, AISLE.z1 - AISLE.z0, AISLE_FRAME)) put(p.rosette, s * aisleX + x, 0, aisleZ + z);
      for (const [x, z] of inlayTiles(RUG_AT.x1 - RUG_AT.x0, RUG_AT.z1 - RUG_AT.z0, PANEL_FRAME)) put(p.rosette, s * panelX + x, 0, loungeZ(s) + z);
    }
    for (const g of p.medallions) medallions.push(put(g, 0, 0, 0));
    if (p.corners) put(p.corners, 0, 0, 0);
    put(p.lines, 0, 0, 0);
    const gloss = lite ? null : S.createNode({ geometry: glossGeometry(), position: { x: 0, y: Y, z: 0 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, sightHidden: true });
    const dispose = () => { while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]); };
    return { root, gloss, medallions, dispose };
  };
  BL.pokerFloor = Object.freeze({ GLOSS, Y, TOP, CLOTH, MEDALLIONS, INLAYS, STRIP, ORANGE, TILE, MARK, REACH, loungeZ, build, tiles, mark, rosette });
})();
