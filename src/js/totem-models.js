// The four repository totems on the hub's meadow (`totem-feed.js` says when each repository last changed), each its
// own carving and sized by its repository's `importance`: a carved log on a ring of rough stones, faces carved as
// rounded masks stacked up its front, painted bands between them, a crest over its cap, the repository's word in
// runes down its back and sides, and a small name board in front. Built in the totem's frame: y up from the ground,
// the faces toward +z.
//
// A design (DESIGNS, by the repository's word) names its faces foot to top, its crest, its wings and its wood and
// paint. The faces come from one kit: an Ooga with a toothy grin, a dark-faced gorilla with a pale muzzle, a beaked
// bird (with wings spread when its design has them), a big-eyed owl with ear tufts, a sun with a ring of rays and a
// wide frog with bulging eyes. Crests: Bitcoin Core's coin stamped with ₿ in a halo of feathers, LND's lightning bolt,
// CLN's carved moon orb and BTCPay Server's feather headdress. Bitcoin Core carries five faces, the grandest wings and
// beaded bands; the rest carry three. Each pole is carved at one size and scaled so its crest's tip stands at
// `importance` times CORE_HEIGHT.
//
// `body(i)` is totem i's wood, stone, paint and board, smooth where it is turned, closed for collision by its
// `collisionGeometry`; `glyphs(i)` its runes, the ember in its Ooga's throat and Core's ₿, engraved in dark wood and
// lit through its node's `glow` and `highlight`; `layout(i)` its `eyes` (sockets [x, y, z, flame scale] the hub sets
// a fire in, filled once `body(i)` is built), `rings` (separating band heights), `apex`, `reach` (the footprint's half width) and collision `boxes`;
// `ringSector(i)` a shared painted strip on a separating band; `featureHighlights(i)` its painted face and crest details; `hit(i, …)` a ray against those boxes in the totem's frame, for picking. Loads after bifrost-gate.js, whose runes
// it cuts, and is reached by the hub at run time only.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, hubModels, bifrostGate } = BL, { hexToRgb, mulberry32 } = BL.math;
  const { variants, box, prism, merge, moved, turnedX, turnedY, turnedZ, turn, shaded, along, noShadow, torus } = models;
  const { log, puff, postSign, flatInto } = hubModels;
  // The pole's radius, the tallest totem's crest tip in metres, and where the first face's mask starts.
  const R = 0.38, CORE_HEIGHT = 7, FOOT = 0.65, RING_SEGMENTS = 24;
  const CUT = "#24160c", HOLLOW = "#1c1410", BONE = "#e8dcc0", OCHRE = "#c8782e", RED = "#a8442a", CHAR = "#2a211c";
  const EMBER = "#ff7a1e", BTC = "#f7931a";
  const STONES = ["#5d5650", "#6b625a", "#7a716a", "#8b837b"].map(hexToRgb);
  // Each face kind's slot up the pole (`h`), its mask (an ellipsoid `ax` wide and `ay` tall standing `az` proud of
  // its back at `zc`, 0.22 unless given), and `hx`, the half width its ears, rays or bulges reach for collision.
  const KINDS = {
    ooga: { h: 1.1, ax: 0.46, ay: 0.46, az: 0.28, hx: 0.52 },
    gorilla: { h: 1.05, ax: 0.48, ay: 0.46, az: 0.27, hx: 0.52 },
    bird: { h: 1.15, ax: 0.44, ay: 0.42, az: 0.26, hx: 0.48 },
    owl: { h: 1.1, ax: 0.44, ay: 0.44, az: 0.22, hx: 0.48 },
    sun: { h: 1.15, ax: 0.42, ay: 0.42, az: 0.16, zc: 0.34, hx: 0.68 },
    frog: { h: 0.9, ax: 0.55, ay: 0.36, az: 0.24, hx: 0.6 }
  };
  // The crests: how far each rises over the cap, and the half widths of its collision box.
  const CRESTS = { coin: { h: 1.16, hx: 0.5, hz: 0.14 }, bolt: { h: 1.02, hx: 0.24, hz: 0.06 }, orb: { h: 0.64, hx: 0.3, hz: 0.3 }, headdress: { h: 0.74, hx: 0.6, hz: 0.06 } };
  // Wood (`wood`, `lt`, `dk`) and paint (`paint`, `paint2`) per design; `wings` scales the top bird's spread wings
  // and `studs` beads the bands.
  const DESIGNS = {
    CORE: { faces: ["ooga", "gorilla", "sun", "owl", "bird"], crest: "coin", wings: 1.55, studs: true, wood: "#7a4a2a", lt: "#8e5a34", dk: "#4e2f18", paint: BTC, paint2: RED },
    LND: { faces: ["ooga", "frog", "bird"], crest: "bolt", wings: 1.05, wood: "#6e5a4a", lt: "#86725e", dk: "#463a30", paint: "#7a52b0", paint2: "#f2c230" },
    CLN: { faces: ["gorilla", "ooga", "owl"], crest: "orb", wood: "#a07a50", lt: "#b48c5e", dk: "#6a4e30", paint: "#2f6f9a", paint2: BONE },
    BTCPAY: { faces: ["frog", "gorilla", "ooga"], crest: "headdress", wood: "#9a4e30", lt: "#ae6040", dk: "#5e2e1a", paint: "#4f9a3a", paint2: OCHRE }
  };
  // ₿ in a five by seven grid, row by row from the top.
  const BTC_SIGN = [".#.#.", "####.", ".#..#", ".###.", ".#..#", "####.", ".#.#."];

  // How far forward a face's mask stands at (x, y).
  const surf = (f, x, y) => f.zc + f.az * Math.sqrt(Math.max(0, 1 - (x / f.ax) ** 2 - ((y - f.y) / f.ay) ** 2));
  const ccw = (pts) => {
    let area = 0;
    for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    return area < 0 ? pts.slice().reverse() : pts;
  };
  const oval = (rx, ry, n = 14) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * Math.PI * 2) * rx, Math.sin(k / n * Math.PI * 2) * ry]);

  // Totem i's design laid out at its carved size, and the scale that stands its crest's tip at its importance:
  // each face's centre, the cap, the collision boxes [half x, y0, y1, half z] stacked without overlap, and the
  // eye sockets, all in metres once scaled.
  const layout = variants((i) => {
    const repo = BL.totemFeed.REPOS[i], d = DESIGNS[repo.word];
    let y = FOOT;
    const faces = d.faces.map((kind) => {
      const k = KINDS[kind], f = { kind, zc: 0.22, ...k, y: y + k.h / 2 };
      y += k.h;
      return f;
    });
    const last = faces[faces.length - 1], top = last.y + 0.5, crest = CRESTS[d.crest], apex = top + crest.h;
    const s = repo.importance * CORE_HEIGHT / apex;
    // One box a face's slot, the top bird's split round the band of its wings, then the cap and the crest.
    const boxes = [[0.8, 0, 0.3, 0.8]];
    faces.forEach((f, k) => {
      const y0 = k ? f.y - f.h / 2 : 0.3, y1 = k === faces.length - 1 ? top + 0.15 : f.y + f.h / 2;
      if (f.kind === "bird" && d.wings) {
        const w = d.wings;
        const wy1 = Math.min(y1, f.y + 0.45 * w);
        boxes.push([f.hx, y0, f.y - 0.3 * w, 0.5], [0.25 + 0.8 * w, f.y - 0.3 * w, wy1, 0.5]);
        if (wy1 < y1) boxes.push([f.hx, wy1, y1, 0.5]);
      } else boxes.push([f.hx, y0, y1, 0.5]);
    });
    boxes.push([crest.hx, top + 0.15, apex, crest.hz]);
    const reach = Math.max(...boxes.map((b) => Math.max(b[0], b[3]))) * s;
    return { design: d, faces, top, apex: apex * s, carvedApex: apex, s, reach, rings: faces.slice(1).map((f) => (f.y - f.h / 2) * s), boxes: boxes.map((b) => b.map((v) => v * s)), eyes: [] };
  });

  // A turned dome of radius r and height h facing +z with its base at (x, y, z).
  const dome = (x, y, z, r, h, color, segments = 12) => moved(turnedX(turn([[r, 0], [r, h * 0.35], [r * 0.7, h * 0.8], [0, h]], segments, color), Math.PI / 2), x, y, z);
  // A face's mask: a closed half ellipsoid on the pole's front.
  const mask = (f, color) => {
    const g = turn([[0, 0], ...Array.from({ length: 7 }, (_, k) => [Math.cos(k / 6 * Math.PI / 2), Math.sin(k / 6 * Math.PI / 2)])], 20, color), v = g.verts;
    for (let k = 0; k < v.length; k += 3) { v[k] *= f.ax; v[k + 1] *= f.az; v[k + 2] *= f.ay; }
    return moved(turnedX(g, Math.PI / 2), 0, f.y, f.zc);
  };
  // An ear on the mask's rim, out toward `side`, with a dark hollow.
  const ear = (c, f, side, y, r, color) => {
    const x = side * (f.ax - 0.05), z = f.zc + 0.02;
    c.round.push(moved(turnedY(dome(0, 0, 0, r, r * 0.9, color), side * Math.PI / 2), x, y, z));
    c.round.push(moved(turnedY(dome(0, 0, 0, r * 0.55, r * 0.95, c.d.dk, 10), side * Math.PI / 2), x + side * 0.01, y, z));
  };
  // A brow ridge over both eyes, bent to follow the mask.
  const brow = (c, f, y, half, r) => {
    for (const sx of [-1, 1]) c.round.push(log(0, y, surf(f, 0, y) - r * 0.5, sx * half, y - 0.03, surf(f, sx * half, y - 0.03) - r * 0.5, r, c.d.dk));
  };
  // A bone eye with a dark socket in it, `r` round with its base at z, ringed in `ring` when given, and its socket
  // kept for the hub's fire at `flame` scale.
  const eye = (c, x, y, z, r, flame, ring) => {
    if (ring) c.round.push(dome(x, y, z - 0.01, r * 1.3, r * 0.5, ring));
    c.round.push(dome(x, y, z, r, r * 0.7, BONE), dome(x, y, z + r * 0.5, r * 0.6, r * 0.32, HOLLOW, 10));
    c.eyes.push([x, y, z + r * 0.8, flame]);
  };
  const faceEye = (c, f, x, y, r, flame, ring) => eye(c, x, y, surf(f, x, y) - 0.02, r, flame, ring);
  // A grin `rx` by `ry` at y: dark lips sunk into the mask round the throat, bone teeth from its top and foot; the
  // ember is a glyph.
  const grin = (c, f, y, rx, ry) => {
    const z = surf(f, 0, y) - 0.01, ix = rx * 0.8, iy = ry * 0.68, t = rx * 0.17;
    c.flat.push(moved(prism(oval(rx, ry), 0.12, CUT), 0, y, z - 0.04), moved(prism(oval(ix, iy), 0.01, HOLLOW), 0, y, z + 0.022));
    for (const [sy, n] of [[1, 4], [-1, 3]]) for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * ix * 0.44, ty = sy * (iy * Math.sqrt(1 - (x / ix) ** 2) - 0.004);
      c.flat.push(moved(prism(ccw([[x - t * 0.5, ty], [x + t * 0.5, ty], [x, ty - sy * t * 1.1]]), 0.012, BONE), 0, y, z + 0.03));
    }
  };
  // A pointed feather `len` long and `w` wide along +x from its quill, a blade with a sharp tip painted `tip`.
  const feather = (len, w, color, tip, depth = 0.09) => [
    prism([[0, -w * 0.35], [len * 0.45, -w], [len, w * 0.15], [len * 0.45, w], [0, w * 0.35]], depth, color),
    prism([[len * 0.64, -w * 0.82], [len * 1.01, w * 0.15], [len * 0.64, w * 0.97]], depth + 0.02, tip)
  ];
  // A fan of feathers from (0, y, z), angles measured from straight up, alternating `colors` with `tips`.
  const fan = (c, y, z, spread, lens, colors, tips, w = 0.08) => {
    lens.forEach((len, k) => {
      const a = lens.length > 1 ? (k / (lens.length - 1) - 0.5) * 2 * spread : 0;
      for (const g of feather(len, w, colors[k % 2], tips[k % 2], 0.07)) c.flat.push(moved(turnedZ(g, Math.PI / 2 + a), 0, y, z));
    });
  };
  // One wing, x outward by `side`, `w` its scale: five pointed feathers fanned from the shoulder behind the bird's
  // head, the upper ones tucked behind the lower.
  const wing = (c, f, side, w) => {
    const d = c.d;
    [[-0.4, 0.54], [-0.15, 0.68], [0.1, 0.8], [0.36, 0.78], [0.62, 0.62]].forEach(([a, len], k) => {
      for (const g of feather(len * w, 0.085 * Math.sqrt(w), k % 2 ? d.paint : d.lt, k % 2 ? d.paint2 : d.paint)) {
        if (side < 0) { for (let n = 0; n < g.verts.length; n += 3) g.verts[n] = -g.verts[n]; g.faces.forEach((q) => q.i.reverse()); }
        c.flat.push(moved(turnedZ(g, a * side), side * 0.3, f.y + 0.02, -0.04 - k * 0.022));
      }
    });
  };

  // The faces. Each takes the carving `c` ({ d, round, flat, eyes }) and its slot `f`.
  const FACES = {
    // The Ooga: a heavy brow, a round nose, red cheeks, ears and a toothy grin.
    ooga: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.wood));
      for (const side of [-1, 1]) ear(c, f, side, f.y + 0.04, 0.1, d.wood);
      brow(c, f, f.y + 0.25, 0.3, 0.09);
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.165, f.y + 0.09, 0.11, 0.6);
      c.round.push(dome(0, f.y - 0.05, surf(f, 0, f.y - 0.05) - 0.03, 0.115, 0.17, d.lt));
      for (const sx of [-1, 1]) c.round.push(dome(sx * 0.27, f.y - 0.06, surf(f, sx * 0.27, f.y - 0.06) - 0.04, 0.07, 0.06, RED, 10));
      grin(c, f, f.y - 0.25, 0.25, 0.1);
    },
    // The gorilla: a dark face, a brow ridge over small deep eyes, small ears and a round pale muzzle with two
    // nostrils and a mouth line.
    gorilla: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.dk));
      for (const side of [-1, 1]) ear(c, f, side, f.y + 0.06, 0.08, d.lt);
      brow(c, f, f.y + 0.2, 0.32, 0.11);
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.13, f.y + 0.07, 0.085, 0.5);
      const muzzle = dome(0, 0, 0, 0.26, 0.19, d.lt, 14), mz = surf(f, 0, f.y - 0.16) - 0.08;
      for (let k = 1; k < muzzle.verts.length; k += 3) muzzle.verts[k] *= 0.72;
      c.round.push(moved(muzzle, 0, f.y - 0.16, mz));
      for (const sx of [-1, 1]) c.round.push(dome(sx * 0.065, f.y - 0.1, mz + 0.15, 0.032, 0.025, HOLLOW, 8));
      c.flat.push(box({ w: 0.26, h: 0.034, d: 0.03, color: HOLLOW, offset: { y: f.y - 0.27, z: mz + 0.145 } }));
    },
    // The bird: big ringed eyes, a hooked beak, and wings spread behind when its design has them.
    bird: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.lt));
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.17, f.y + 0.08, 0.12, 0.66, OCHRE);
      c.round.push(along(turn([[0.12, 0], [0.1, 0.12], [0.05, 0.26], [0, 0.34]], 12, OCHRE), 0, f.y - 0.06, surf(f, 0, f.y - 0.06) - 0.06, 0, -0.5, 1));
      c.round.push(along(turn([[0.07, 0], [0.04, 0.1], [0, 0.16]], 10, d.paint2 === BONE ? RED : d.paint2), 0, f.y - 0.16, surf(f, 0, f.y - 0.16) - 0.05, 0, -0.9, 1));
      if (d.wings) for (const side of [-1, 1]) wing(c, f, side, d.wings);
    },
    // The owl: great eyes in painted rings, a small hooked beak, ear tufts and rows of breast feathers.
    owl: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.lt));
      for (const sx of [-1, 1]) {
        const x = sx * 0.18, y = f.y + 0.08, z = surf(f, x, y) - 0.02;
        c.round.push(dome(x, y, z - 0.03, 0.25, 0.06, BONE === d.paint2 ? d.dk : BONE));
        eye(c, x, y, z, 0.14, 0.72, d.paint);
        for (const g of feather(0.36, 0.07, d.dk, d.paint, 0.07)) c.flat.push(moved(turnedZ(g, Math.PI / 2 - sx * 0.45), sx * 0.24, f.y + 0.34, f.zc + 0.04));
      }
      c.round.push(along(turn([[0.06, 0], [0.035, 0.1], [0, 0.17]], 10, OCHRE), 0, f.y - 0.04, surf(f, 0, f.y - 0.04) - 0.03, 0, -0.7, 1));
      for (const [y, xs] of [[f.y - 0.2, [-0.14, 0, 0.14]], [f.y - 0.31, [-0.21, -0.07, 0.07, 0.21]]]) for (const x of xs) {
        const z = surf(f, x, y) - 0.008;
        c.flat.push(moved(prism(ccw([[x - 0.05, y + 0.03], [x + 0.05, y + 0.03], [x, y - 0.05]]), 0.03, xs.length > 3 ? d.paint : d.dk), 0, 0, z));
      }
    },
    // The sun: a flat round face ringed in paint inside a ring of rays, almond eyes, red cheeks and a round mouth.
    sun: (c, f) => {
      const d = c.d;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, tip = k % 2 ? 0.58 : 0.66, x = Math.sin(a), y = Math.cos(a), px = Math.cos(a), py = -Math.sin(a);
        const pts = [[x * 0.36 + px * 0.1, y * 0.36 + py * 0.1], [x * tip, y * tip], [x * 0.36 - px * 0.1, y * 0.36 - py * 0.1]];
        c.flat.push(moved(prism(ccw(pts), 0.07, k % 2 ? OCHRE : d.paint), 0, f.y, R + 0.02));
      }
      c.round.push(mask(f, d.lt), moved(turnedX(torus(f.ax - 0.01, 0.035, d.paint, 0, 24, 6), Math.PI / 2), 0, f.y, R + 0.02));
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.14, f.y + 0.08, 0.09, 0.45, d.paint);
      c.round.push(dome(0, f.y - 0.04, surf(f, 0, f.y - 0.04) - 0.03, 0.07, 0.1, d.wood));
      for (const sx of [-1, 1]) c.round.push(dome(sx * 0.24, f.y - 0.1, surf(f, sx * 0.24, f.y - 0.1) - 0.03, 0.06, 0.05, RED, 10));
      const mz = surf(f, 0, f.y - 0.2);
      c.flat.push(moved(prism(oval(0.08, 0.055), 0.08, CUT), 0, f.y - 0.2, mz - 0.03));
    },
    // The frog: a wide low face, eyes bulging over its brow, a long smile, nostrils and painted spots.
    frog: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.wood));
      for (const sx of [-1, 1]) {
        const x = sx * 0.27, y = f.y + 0.2, z = surf(f, x, y) - 0.06;
        c.round.push(dome(x, y, z, 0.16, 0.13, d.wood));
        eye(c, x, y, z + 0.07, 0.1, 0.55, d.paint);
        c.round.push(dome(sx * 0.05, f.y - 0.01, surf(f, sx * 0.05, f.y - 0.01) - 0.01, 0.025, 0.02, HOLLOW, 8));
      }
      const mouth = (x) => f.y - 0.14 + 0.07 * (x / 0.38) ** 2;
      for (let k = 0; k < 8; k++) {
        const x0 = -0.38 + k * 0.095, x1 = x0 + 0.095, y0 = mouth(x0), y1 = mouth(x1), t = 0.018;
        c.flat.push(moved(prism(ccw([[x0, y0 - t], [x1, y1 - t], [x1, y1 + t], [x0, y0 + t]]), 0.05, CUT), 0, 0, surf(f, (x0 + x1) / 2, (y0 + y1) / 2) - 0.012));
      }
      for (const [x, y, r] of [[0, f.y + 0.13, 0.05], [-0.42, f.y - 0.04, 0.045], [0.42, f.y - 0.04, 0.045], [-0.17, f.y + 0.03, 0.035], [0.17, f.y + 0.03, 0.035]]) {
        c.round.push(dome(x, y, surf(f, x, y) - 0.02, r, r * 0.6, d.paint, 10));
      }
    }
  };

  // The crests over the cap at `top`.
  const CREST = {
    // A coin standing on a collar, its rim proud and its ₿ a glyph, in a halo of seven feathers.
    coin: (c, top) => {
      const d = c.d, cy = top + 0.6;
      c.round.push(moved(turn([[0.14, 0], [0.11, 0.12], [0.16, 0.18], [0.1, 0.2], [0, 0.2]], 12, d.dk), 0, top + 0.12, 0));
      c.round.push(moved(turnedX(turn([[0, -0.05], [0.4, -0.05], [0.4, 0.05], [0, 0.05]], 24, "#d38a22"), Math.PI / 2), 0, cy, 0));
      c.round.push(moved(turnedX(torus(0.41, 0.06, "#a8661a", 0, 28, 6), Math.PI / 2), 0, cy, 0));
      fan(c, cy - 0.1, -0.1, 1.3, [0.46, 0.56, 0.62, 0.66, 0.62, 0.56, 0.46], [d.paint, OCHRE], [RED, d.paint]);
    },
    // A lightning bolt struck up from the cap, its tip down in the wood.
    bolt: (c, top) => {
      const d = c.d, y = top + 0.04;
      for (const pts of [[[0.02, 0], [0.22, 0.5], [-0.04, 0.5]], [[-0.14, 0.44], [0.22, 0.44], [0.22, 0.54], [-0.14, 0.54]], [[-0.14, 0.44], [0, 0.44], [0.14, 0.98], [-0.02, 0.98]]]) {
        c.flat.push(moved(prism(ccw(pts.map(([x, py]) => [x, py + y])), 0.09, d.paint2), 0, 0, 0));
      }
    },
    // A carved moon on a short neck, banded in paint.
    orb: (c, top) => {
      const d = c.d, r = 0.26;
      c.round.push(moved(turn([[0.13, 0], [0.09, 0.08], [0.11, 0.12], [0, 0.12]], 12, d.dk), 0, top + 0.1, 0));
      c.round.push(moved(turn(Array.from({ length: 9 }, (_, k) => [Math.sin(k / 8 * Math.PI) * r, (1 - Math.cos(k / 8 * Math.PI)) * r]), 18, BONE), 0, top + 0.12, 0));
      c.round.push(moved(torus(r + 0.005, 0.03, d.paint, 0, 24, 6), 0, top + 0.12 + r, 0));
    },
    // A headdress of nine feathers over the top face, on a band of beads.
    headdress: (c, top) => {
      const d = c.d;
      fan(c, top + 0.02, -0.02, 1.0, [0.5, 0.58, 0.64, 0.7, 0.72, 0.7, 0.64, 0.58, 0.5], [d.paint, d.paint2], [RED, d.paint]);
      for (let k = 0; k < 9; k++) {
        const a = (k / 8 - 0.5) * 2.4;
        c.round.push(moved(turnedY(dome(0, 0, 0, 0.05, 0.06, k % 2 ? BONE : RED, 8), a), Math.sin(a) * (R - 0.02), top - 0.06, Math.cos(a) * (R - 0.02)));
      }
    }
  };

  // A carved band round the pole at y, painted between dark rims, beaded with bone studs when `studs`.
  const band = (c, y) => {
    const d = c.d;
    c.round.push(moved(turn([[R * 0.98, 0], [R + 0.03, 0.012], [R + 0.03, 0.028], [R + 0.022, 0.03], [R + 0.022, 0.07], [R + 0.03, 0.072], [R + 0.03, 0.088], [R * 0.98, 0.1]], RING_SEGMENTS, (t) => t < 0.3 || t > 0.7 ? d.dk : d.paint), 0, y - 0.05, 0));
    if (d.studs) for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      c.round.push(moved(turnedY(dome(0, 0, 0, 0.026, 0.025, BONE, 8), a), Math.sin(a) * (R + 0.02), y, Math.cos(a) * (R + 0.02)));
    }
  };
  const scaled = (geo, s) => {
    const v = geo.verts;
    for (let k = 0; k < v.length; k++) v[k] *= s;
    return geo;
  };

  // One facet of the painted stripe, just proud of the band. Copies stay aligned with its carved facets,
  // so the traveling light hugs the wood rather than floating as a rotating hoop. All rings on a pole share it.
  const ringSector = variants((i) => {
    const L = layout(i), g = turn([[R + 0.023, -0.019], [R + 0.023, 0.019]], RING_SEGMENTS, L.design.paint, 1);
    const f = g.faces[0];
    return noShadow(scaled({ verts: f.i.flatMap((k) => g.verts.slice(k * 3, k * 3 + 3)), faces: [{ ...f, i: [0, 1, 2, 3] }], lines: [], depthOffset: true }, L.s));
  });

  const body = variants((i) => {
    const L = layout(i), d = L.design, c = { d, round: [], flat: [], eyes: L.eyes };
    c.eyes.length = 0;
    c.round.push(log(0, 0.05, 0, 0, L.top, 0, R, d.wood));
    // The cap over the end grain.
    c.round.push(moved(turn([[R * 1.02, 0], [R * 0.95, 0.08], [R * 0.6, 0.16], [0, 0.2]], 14, d.dk), 0, L.top - 0.02, 0));
    CREST[d.crest](c, L.top);
    L.faces.forEach((f, k) => {
      if (k) band(c, f.y - f.h / 2);
      FACES[f.kind](c, f);
    });
    band(c, FOOT - 0.05);
    const geo = scaled(shaded(c.round, c.flat), L.s);
    // Keep just the face and crest paint for the glow overlay, before adding the board and foot stones.
    // The overlay shares these exact carved surfaces and is drawn only while the repository glows.
    const colors = [d.paint, d.paint2, BONE, OCHRE, RED, "#d38a22", "#a8661a"].map(hexToRgb);
    const highlights = { verts: [], faces: [], lines: [], smooth: true, castShadow: false, depthOffset: true };
    const remap = new Map();
    for (const f of geo.faces) {
      if (!colors.some((c) => c[0] === f.color[0] && c[1] === f.color[1] && c[2] === f.color[2])) continue;
      const y = f.i.reduce((sum, k) => sum + geo.verts[k * 3 + 1], 0) / f.i.length;
      if (Math.abs(y - (FOOT - 0.05) * L.s) < 0.055 * L.s || L.rings.some((at) => Math.abs(y - at) < 0.055 * L.s)) continue;
      const indices = f.i.map((k) => {
        let j = remap.get(k);
        if (j === undefined) {
          j = highlights.verts.length / 3;
          highlights.verts.push(geo.verts[k * 3], geo.verts[k * 3 + 1], geo.verts[k * 3 + 2]);
          remap.set(k, j);
        }
        return j;
      });
      highlights.faces.push({ ...f, i: indices, emissive: 1 });
    }
    geo.featureHighlights = highlights;
    for (const e of c.eyes) { e[0] *= L.s; e[1] *= L.s; e[2] *= L.s; e[3] *= L.s; }
    // The name board, standing on its pegs in front of the stones.
    flatInto(geo, moved(merge(postSign(BL.totemFeed.REPOS[i].word, 0.32, 0.18)), 0, 0, 0.15 + 0.85 * L.s));
    // The ring of rough stones the pole is set in.
    const rand = mulberry32(5150 + i), s = L.s;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + (rand() - 0.5) * 0.3, rr = (R + 0.2 + rand() * 0.08) * s, r = (0.2 + rand() * 0.07) * s;
      puff(geo, Math.sin(a) * rr, 0.1 * s, Math.cos(a) * rr, r, (0.14 + rand() * 0.05) * s, r * 0.9, STONES, rand, 5, 9, Math.floor(rand() * 3) - 1);
    }
    geo.collisionGeometry = merge(...L.boxes.map(([hx, y0, y1, hz]) => box({ w: hx * 2, h: y1 - y0, d: hz * 2, color: CHAR, offset: { y: (y0 + y1) / 2 } })));
    return geo;
  });

  const featureHighlights = (i) => body(i).featureHighlights;

  const glyphs = variants((i) => {
    const L = layout(i), runes = [...BL.totemFeed.REPOS[i].word], parts = [];
    const from = 0.8, to = L.top - 0.95, height = L.faces.length > 3 ? 0.34 : 0.28;
    const step = Math.min(height * 1.35, (to - from) / runes.length), h = Math.min(height, step / 1.25);
    const first = (from + to) / 2 + step * (runes.length - 1) / 2;
    // The runes read down the back and both sides, sunk to stand a few millimetres proud of the round.
    for (const turnY of [Math.PI / 2, Math.PI, -Math.PI / 2]) runes.forEach((ch, k) => {
      parts.push(turnedY(moved(merge(bifrostGate.runeWord(ch, h, CUT)), 0, first - k * step, R - h * 0.08), turnY));
    });
    // An ember in each Ooga's throat.
    for (const f of L.faces) if (f.kind === "ooga") parts.push(moved(prism(oval(0.07, 0.028, 10), 0.006, EMBER, 1), 0, f.y - 0.265, surf(f, 0, f.y - 0.25) + 0.02));
    // Core's coin is stamped ₿ on both faces.
    if (L.design.crest === "coin") {
      const cy = L.top + 0.6, cell = 0.06;
      for (const side of [1, -1]) BTC_SIGN.forEach((row, r) => [...row].forEach((on, col) => {
        if (on === "#") parts.push(box({ w: cell, h: cell, d: 0.02, color: BTC, emissive: 1, offset: { x: (col - 2) * cell * side, y: cy + (3 - r) * cell, z: side * 0.06 } }));
      }));
    }
    return noShadow(scaled(merge(...parts), L.s));
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
  const hit = (i, ox, oy, oz, dx, dy, dz) => {
    let t = Infinity;
    for (const [hx, y0, y1, hz] of layout(i).boxes) t = Math.min(t, slab(ox, oy, oz, dx, dy, dz, hx, y0, y1, hz));
    return t;
  };

  BL.totemModels = { body, glyphs, ringSector, featureHighlights, layout, hit, DESIGNS, CORE_HEIGHT, RING_SEGMENTS };
})();
