// The four repository totems on the hub's meadow (`totem-feed.js` says when each repository last changed): a carved
// log on a ring of rough stones, three faces carved as rounded masks stacked up its front (an Ooga with a toothy grin at the foot, a gorilla
// with a heavy brow and muzzle, a beaked bird with wings spread at the top under a crest of feathers), carved bands
// painted red round it between the faces, the repository's word in runes down its back and sides, and a small name board in front.
// Built in the totem's frame: y up from the ground, the faces toward +z.
//
// `body(i)` is totem i's wood, stone, paint and board, smooth where it is turned, closed for collision by its
// `collisionGeometry`; `glyphs(i)` its runes and the ember in the Ooga's throat, engraved in dark wood and lit through
// its node's `glow` and `highlight`; `EYES` the six eye sockets [x, y, z, flame scale] the hub sets a fire in; `hit` a
// ray against the collision boxes in the totem's frame, for picking. Loads after bifrost-gate.js, whose runes it cuts,
// and is reached by the hub at run time only.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, hubModels, bifrostGate } = BL, { hexToRgb, mulberry32 } = BL.math;
  const { variants, box, bevelBox, prism, merge, moved, turnedX, turnedY, turnedZ, turn, shaded, along, noShadow } = models;
  const { log, puff, postSign } = hubModels;
  // The pole's radius and top, the crest's tip, and where each face is centred up the pole.
  const R = 0.38, TOP = 3.95, APEX = 4.65, OOGA = 1.2, GORILLA = 2.25, BIRD = 3.45;
  const WOOD = "#8a5a34", WOOD_LT = "#9a6a40", WOOD_DK = "#5c3b20", CUT = "#24160c", HOLLOW = "#1c1410";
  const BONE = "#e8dcc0", OCHRE = "#c8782e", RED = "#a8442a", CHAR = "#2a211c", EMBER = "#ff7a1e";
  const STONES = ["#5d5650", "#6b625a", "#7a716a", "#8b837b"].map(hexToRgb);
  // Where the runes run down the back and sides, and the tallest a rune stands.
  const RUNES = { from: 0.8, to: 3.0, height: 0.28 };
  // Each face is carved as a rounded mask standing proud of the pole: an ellipsoid `ax` wide and `ay` tall, its back at
  // `zc` and its nose `az` beyond that, so the faces break the pole's outline as stacked heads.
  const OOGA_FACE = { y: OOGA, ax: 0.46, ay: 0.46, az: 0.28, zc: 0.22, color: WOOD };
  const GORILLA_FACE = { y: GORILLA, ax: 0.48, ay: 0.46, az: 0.27, zc: 0.22, color: WOOD_DK };
  const BIRD_FACE = { y: BIRD, ax: 0.44, ay: 0.42, az: 0.26, zc: 0.22, color: WOOD_LT };
  // How far forward a face's mask stands at (x, y).
  const surf = (f, x, y) => f.zc + f.az * Math.sqrt(Math.max(0, 1 - (x / f.ax) ** 2 - ((y - f.y) / f.ay) ** 2));
  // The collision shell as stacked boxes [half x, y0, y1, half z], none overlapping: the stones, the pole and its masks,
  // the band of the wings, the pole's cap.
  const BOXES = [[0.8, 0, 0.3, 0.8], [0.48, 0.3, BIRD - 0.3, 0.5], [1.05, BIRD - 0.3, BIRD + 0.45, 0.5], [R, BIRD + 0.45, TOP + 0.15, R]];
  const ccw = (pts) => {
    let area = 0;
    for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    return area < 0 ? pts.slice().reverse() : pts;
  };
  const oval = (rx, ry, n = 14) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * rx, Math.sin(k / n * Math.PI * 2) * ry]);
  // A turned dome of radius r and height h facing +z with its base at (x, y, z).
  const dome = (x, y, z, r, h, color, segments = 12) => moved(turnedX(turn([[r, 0], [r, h * 0.35], [r * 0.7, h * 0.8], [0, h]], segments, color), Math.PI / 2), x, y, z);
  // A face's mask: a closed half ellipsoid on the pole's front.
  const mask = (f) => {
    const g = turn([[0, 0], ...Array.from({ length: 7 }, (_, k) => [Math.cos(k / 6 * Math.PI / 2), Math.sin(k / 6 * Math.PI / 2)])], 20, f.color), v = g.verts;
    for (let k = 0; k < v.length; k += 3) { v[k] *= f.ax; v[k + 1] *= f.az; v[k + 2] *= f.ay; }
    return moved(turnedX(g, Math.PI / 2), 0, f.y, f.zc);
  };
  // An ear on the mask's rim, out toward `side`, with a dark hollow.
  const ear = (round, f, side, y, r, color) => {
    const x = side * (f.ax - 0.05), z = f.zc + 0.02;
    round.push(moved(turnedY(dome(0, 0, 0, r, r * 0.9, color), side * Math.PI / 2), x, y, z));
    round.push(moved(turnedY(dome(0, 0, 0, r * 0.55, r * 0.95, WOOD_DK, 10), side * Math.PI / 2), x + side * 0.01, y, z));
  };
  // A brow ridge over both eyes, bent to follow the mask.
  const brow = (round, f, y, half, r) => {
    for (const sx of [-1, 1]) round.push(log(0, y, surf(f, 0, y) - r * 0.5, sx * half, y - 0.03, surf(f, sx * half, y - 0.03) - r * 0.5, r, WOOD_DK));
  };
  // [face, x, y, socket radius, flame scale] for each eye; the socket's dome stands from the mask.
  const SOCKETS = [[OOGA_FACE, -0.165, OOGA + 0.09, 0.11, 0.6], [OOGA_FACE, 0.165, OOGA + 0.09, 0.11, 0.6], [GORILLA_FACE, -0.13, GORILLA + 0.07, 0.085, 0.5], [GORILLA_FACE, 0.13, GORILLA + 0.07, 0.085, 0.5], [BIRD_FACE, -0.17, BIRD + 0.08, 0.12, 0.66], [BIRD_FACE, 0.17, BIRD + 0.08, 0.12, 0.66]];
  const EYES = SOCKETS.map(([f, x, y, r, s]) => [x, y, surf(f, x, y) - 0.02 + r * 0.8, s]);

  // A bone eye with a dark socket in it, `r` round, its fire set by the hub at EYES.
  const eye = (round, f, x, y, r, ring) => {
    const z = surf(f, x, y) - 0.02;
    if (ring) round.push(dome(x, y, z - 0.01, r * 1.3, r * 0.5, ring));
    round.push(dome(x, y, z, r, r * 0.7, BONE), dome(x, y, z + r * 0.5, r * 0.6, r * 0.32, HOLLOW, 10));
  };
  // A grin `rx` by `ry` at y: dark lips sunk into the mask round the throat, bone teeth from its top and foot; the
  // ember is a glyph.
  const grin = (flat, f, y, rx, ry) => {
    const z = surf(f, 0, y) - 0.01, ix = rx * 0.8, iy = ry * 0.68, t = rx * 0.17;
    flat.push(moved(prism(oval(rx, ry), 0.12, CUT), 0, y, z - 0.04), moved(prism(oval(ix, iy), 0.01, HOLLOW), 0, y, z + 0.022));
    for (const [sy, n] of [[1, 4], [-1, 3]]) for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * ix * 0.44, ty = sy * (iy * Math.sqrt(1 - (x / ix) ** 2) - 0.004);
      flat.push(moved(prism(ccw([[x - t * 0.5, ty], [x + t * 0.5, ty], [x, ty - sy * t * 1.1]]), 0.012, BONE), 0, y, z + 0.03));
    }
  };
  // A pointed feather `len` long and `w` wide along +x from its quill, a blade with a sharp tip painted `tip`.
  const feather = (len, w, color, tip, depth = 0.09) => [
    prism([[0, -w * 0.35], [len * 0.45, -w], [len, w * 0.15], [len * 0.45, w], [0, w * 0.35]], depth, color),
    prism([[len * 0.64, -w * 0.82], [len * 1.01, w * 0.15], [len * 0.64, w * 0.97]], depth + 0.02, tip)
  ];
  // One wing, x outward by `side`: five pointed feathers fanned from the shoulder behind the bird's head, the upper
  // ones tucked behind the lower.
  const wing = (flat, side) => {
    [[-0.4, 0.54], [-0.15, 0.68], [0.1, 0.8], [0.36, 0.78], [0.62, 0.62]].forEach(([a, len], k) => {
      for (const g of feather(len, 0.085, k % 2 ? OCHRE : WOOD_LT, k % 2 ? RED : OCHRE)) {
        if (side < 0) { for (let n = 0; n < g.verts.length; n += 3) g.verts[n] = -g.verts[n]; g.faces.forEach((f) => f.i.reverse()); }
        flat.push(moved(turnedZ(g, a * side), side * 0.3, BIRD + 0.02, -0.04 - k * 0.022));
      }
    });
  };

  // A carved band round the pole at y, painted red between dark rims.
  const band = (y) => turn([[R * 0.98, 0], [R + 0.03, 0.012], [R + 0.03, 0.028], [R + 0.022, 0.03], [R + 0.022, 0.07], [R + 0.03, 0.072], [R + 0.03, 0.088], [R * 0.98, 0.1]], 24, (t) => t < 0.3 || t > 0.7 ? WOOD_DK : RED);
  const body = variants((i) => {
    const round = [], flat = [], word = BL.totemFeed.REPOS[i].word;
    round.push(log(0, 0.05, 0, 0, TOP, 0, R, WOOD));
    // The cap over the end grain, and the crest's three feathers fanned up from it.
    round.push(moved(turn([[R * 1.02, 0], [R * 0.95, 0.08], [R * 0.6, 0.16], [0, 0.2]], 14, WOOD_DK), 0, TOP - 0.02, 0));
    [[-0.38, RED, 0.5], [0, OCHRE, 0.6], [0.38, RED, 0.5]].forEach(([a, color, len]) => {
      for (const g of feather(len, 0.08, color, color === RED ? OCHRE : RED, 0.07)) flat.push(moved(turnedZ(g, Math.PI / 2 + a), 0, TOP + 0.1, 0));
    });
    for (const y of [0.6, 1.72, 2.82]) round.push(moved(band(y), 0, y - 0.05, 0));
    // The Ooga: a heavy brow, a round nose, red cheeks, ears and a toothy grin.
    const O = OOGA_FACE;
    round.push(mask(O));
    for (const side of [-1, 1]) ear(round, O, side, OOGA + 0.04, 0.1, WOOD);
    brow(round, O, OOGA + 0.25, 0.3, 0.09);
    eye(round, O, -0.165, OOGA + 0.09, 0.11);
    eye(round, O, 0.165, OOGA + 0.09, 0.11);
    round.push(dome(0, OOGA - 0.05, surf(O, 0, OOGA - 0.05) - 0.03, 0.115, 0.17, WOOD_LT));
    for (const sx of [-1, 1]) round.push(dome(sx * 0.27, OOGA - 0.06, surf(O, sx * 0.27, OOGA - 0.06) - 0.04, 0.07, 0.06, RED, 10));
    grin(flat, O, OOGA - 0.25, 0.25, 0.1);
    // The gorilla: a dark face, a brow ridge over small deep eyes, small ears and a round pale muzzle with two
    // nostrils and a mouth line.
    const G = GORILLA_FACE;
    round.push(mask(G));
    for (const side of [-1, 1]) ear(round, G, side, GORILLA + 0.06, 0.08, WOOD_LT);
    brow(round, G, GORILLA + 0.2, 0.32, 0.11);
    eye(round, G, -0.13, GORILLA + 0.07, 0.085);
    eye(round, G, 0.13, GORILLA + 0.07, 0.085);
    const muzzle = dome(0, 0, 0, 0.26, 0.19, WOOD_LT, 14), mz = surf(G, 0, GORILLA - 0.16) - 0.08;
    for (let k = 1; k < muzzle.verts.length; k += 3) muzzle.verts[k] *= 0.72;
    round.push(moved(muzzle, 0, GORILLA - 0.16, mz));
    for (const sx of [-1, 1]) round.push(dome(sx * 0.065, GORILLA - 0.1, mz + 0.15, 0.032, 0.025, HOLLOW, 8));
    flat.push(box({ w: 0.26, h: 0.034, d: 0.03, color: HOLLOW, offset: { y: GORILLA - 0.27, z: mz + 0.145 } }));
    // The bird: big ringed eyes, a hooked beak, wings spread behind.
    const B = BIRD_FACE;
    round.push(mask(B));
    eye(round, B, -0.17, BIRD + 0.08, 0.12, OCHRE);
    eye(round, B, 0.17, BIRD + 0.08, 0.12, OCHRE);
    round.push(along(turn([[0.12, 0], [0.1, 0.12], [0.05, 0.26], [0, 0.34]], 12, OCHRE), 0, BIRD - 0.06, surf(B, 0, BIRD - 0.06) - 0.06, 0, -0.5, 1));
    round.push(along(turn([[0.07, 0], [0.04, 0.1], [0, 0.16]], 10, RED), 0, BIRD - 0.16, surf(B, 0, BIRD - 0.16) - 0.05, 0, -0.9, 1));
    for (const side of [-1, 1]) wing(flat, side);
    // The name board, standing on its pegs in front.
    flat.push(moved(postSign(word, 0.32, 0.18), 0, 0, R + 0.62));
    const geo = shaded(round, flat);
    // The ring of rough stones the pole is set in.
    const rand = mulberry32(5150 + i);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + (rand() - 0.5) * 0.3, d = R + 0.2 + rand() * 0.08, r = 0.2 + rand() * 0.07;
      puff(geo, Math.sin(a) * d, 0.1, Math.cos(a) * d, r, 0.14 + rand() * 0.05, r * 0.9, STONES, rand, 5, 9, Math.floor(rand() * 3) - 1);
    }
    geo.collisionGeometry = merge(...BOXES.map(([hx, y0, y1, hz]) => box({ w: hx * 2, h: y1 - y0, d: hz * 2, color: CHAR, offset: { y: (y0 + y1) / 2 } })));
    return geo;
  });

  const glyphs = variants((i) => {
    const runes = [...BL.totemFeed.REPOS[i].word], parts = [];
    const step = Math.min(RUNES.height * 1.35, (RUNES.to - RUNES.from) / runes.length), h = Math.min(RUNES.height, step / 1.25);
    const first = (RUNES.from + RUNES.to) / 2 + step * (runes.length - 1) / 2;
    // The runes read down the back and both sides, sunk to stand a few millimetres proud of the round.
    for (const turnY of [Math.PI / 2, Math.PI, -Math.PI / 2]) runes.forEach((ch, k) => {
      parts.push(turnedY(moved(merge(bifrostGate.runeWord(ch, h, CUT)), 0, first - k * step, R - h * 0.08), turnY));
    });
    parts.push(moved(prism(oval(0.07, 0.028, 10), 0.006, EMBER, 1), 0, OOGA - 0.265, surf(OOGA_FACE, 0, OOGA - 0.25) + 0.02));
    return noShadow(merge(...parts));
  });

  // The nearest entry along the ray (o, d) into any collision box, in the totem's frame, or Infinity when it misses.
  const slab = (ox, oy, oz, dx, dy, dz, hx, y0, y1, hz) => {
    let near = -Infinity, far = Infinity;
    for (const [o, d, lo, hi] of [[ox, dx, -hx, hx], [oy, dy, y0, y1], [oz, dz, -hz, hz]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) return Infinity;
        continue;
      }
      const a = (lo - o) / d, b = (hi - o) / d;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
    }
    return near <= far && far >= 0 ? near : Infinity;
  };
  const hit = (ox, oy, oz, dx, dy, dz) => {
    let t = Infinity;
    for (const [hx, y0, y1, hz] of BOXES) t = Math.min(t, slab(ox, oy, oz, dx, dy, dz, hx, y0, y1, hz));
    return t;
  };

  BL.totemModels = { body, glyphs, EYES, hit, APEX };
})();
