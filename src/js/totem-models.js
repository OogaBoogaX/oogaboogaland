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
//
// Repo Island's carvings (`repo-island-models.js`) come from the same kit through `layoutOf(design, importance)`,
// `carve(L, word, seed, opts)` and `glyphsOf(L, word)`, a design spelled out rather than looked up by index. `opts.detail`
// (1 by default, which builds exactly what the four meadow totems have always been) scales every turned part's segments
// down; under 0.45 it also leaves out the small carvings and thins the foot stones, and under 0.2 keeps only the masks,
// eyes, bands and crest, a stand-in for seeing the island from across the water;
// `opts.board` false leaves the name board off (a geometry stands in its place instead), `opts.leanStones` sets
// fewer, plainer foot stones and `opts.highlights` false skips the glow overlay. The island's crests
// add a key, a gear, a pickaxe, a scroll, an eye, a chain, a crescent moon, a shield, a flame, a stepped tower and a star
// to the meadow's four.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, hubModels, bifrostGate } = BL, { hexToRgb, mulberry32 } = BL.math;
  const { variants, box, prism, merge, moved, turnedX, turnedY, turnedZ, turn, shaded, along, noShadow, torus } = models;
  const { log, puff, postSign, flatInto } = hubModels;
  // The pole's radius, the tallest totem's crest tip in metres, and where the first face's mask starts.
  const R = 0.38, CORE_HEIGHT = 7, FOOT = 0.65, RING_SEGMENTS = 24;
  // The detail a carving is being built at (`carve`'s `opts.detail`): every turned part's segments scale by it, never
  // under five. At 1 every count is the literal one, so the meadow's four build exactly as they always have.
  let DETAIL = 1;
  const sg = (n) => DETAIL === 1 ? n : Math.max(5, Math.round(n * DETAIL));
  // Under 0.45 the small carvings go (brows, sockets, teeth, cheeks, spots, every other feather); under 0.2 only each
  // face's mask and eyes, the bands and the crest remain, with no foot stones.
  const lite = () => DETAIL < 0.45, bare = () => DETAIL < 0.2;
  const IRON = "#8f949b", BRASS = "#d3a43a";
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
  const CRESTS = { coin: { h: 1.16, hx: 0.5, hz: 0.14 }, bolt: { h: 1.02, hx: 0.24, hz: 0.06 }, orb: { h: 0.64, hx: 0.3, hz: 0.3 }, headdress: { h: 0.74, hx: 0.6, hz: 0.06 },
    key: { h: 1.12, hx: 0.27, hz: 0.08 }, gear: { h: 1.0, hx: 0.44, hz: 0.09 }, pick: { h: 1.02, hx: 0.48, hz: 0.07 }, scroll: { h: 0.7, hx: 0.44, hz: 0.17 },
    eye: { h: 0.96, hx: 0.37, hz: 0.14 }, chain: { h: 1.1, hx: 0.18, hz: 0.18 }, moon: { h: 0.92, hx: 0.38, hz: 0.07 }, shield: { h: 0.98, hx: 0.35, hz: 0.11 },
    flame: { h: 1.0, hx: 0.32, hz: 0.07 }, tower: { h: 0.96, hx: 0.31, hz: 0.31 }, star: { h: 0.94, hx: 0.42, hz: 0.07 } };
  // Wood (`wood`, `lt`, `dk`) and paint (`paint`, `paint2`) per design; `wings` scales the top bird's spread wings
  // and `studs` beads the bands.
  const DESIGNS = {
    CORE: { faces: ["ooga", "gorilla", "sun", "owl", "bird"], crest: "coin", wings: 1.55, studs: true, wood: "#7a4a2a", lt: "#8e5a34", dk: "#4e2f18", paint: BTC, paint2: RED },
    LND: { faces: ["ooga", "frog", "bird"], crest: "bolt", wings: 1.05, wood: "#6e5a4a", lt: "#86725e", dk: "#463a30", paint: "#7a52b0", paint2: "#f2c230" },
    CLN: { faces: ["gorilla", "ooga", "owl"], crest: "orb", wood: "#a07a50", lt: "#b48c5e", dk: "#6a4e30", paint: "#2f6f9a", paint2: BONE },
    BTCPAY: { faces: ["frog", "gorilla", "ooga"], crest: "headdress", wood: "#9a4e30", lt: "#ae6040", dk: "#5e2e1a", paint: "#4f9a3a", paint2: OCHRE }
  };
  // Each face kind's eyes as its carving places them: [x either side, height over the face's middle, radius, flame,
  // depth off the mask], for the bare detail, which draws only these and the masks.
  const BARE_EYES = { ooga: [0.165, 0.09, 0.11, 0.6, -0.02], gorilla: [0.13, 0.07, 0.085, 0.5, -0.02], bird: [0.17, 0.08, 0.12, 0.66, -0.02],
    owl: [0.18, 0.08, 0.14, 0.72, -0.02], sun: [0.14, 0.08, 0.09, 0.45, -0.02], frog: [0.27, 0.2, 0.1, 0.55, 0.01] };
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
  // `girth`, when given, is the carving's own scale across, kept within 0.8 and 1.3 times its height's (`s`) so no face
  // is squashed or drawn out; without it (the meadow's four) the carving keeps its shape at its height's scale.
  const layoutOf = (d, importance, girth) => {
    let y = FOOT;
    const faces = d.faces.map((kind) => {
      const k = KINDS[kind], f = { kind, zc: 0.22, ...k, y: y + k.h / 2 };
      y += k.h;
      return f;
    });
    const last = faces[faces.length - 1], top = last.y + 0.5, crest = CRESTS[d.crest], apex = top + crest.h;
    const s = importance * CORE_HEIGHT / apex, w = girth === undefined ? s : Math.min(1.3 * s, Math.max(0.8 * s, girth));
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
    const reach = Math.max(...boxes.map((b) => Math.max(b[0], b[3]))) * w;
    return { design: d, faces, top, apex: apex * s, carvedApex: apex, s, w, reach, rings: faces.slice(1).map((f) => (f.y - f.h / 2) * s), boxes: boxes.map(([hx, y0, y1, hz]) => [hx * w, y0 * s, y1 * s, hz * w]), eyes: [] };
  };
  const layout = variants((i) => {
    const repo = BL.totemFeed.REPOS[i];
    return layoutOf(DESIGNS[repo.word], repo.importance);
  });

  // A turned dome of radius r and height h facing +z with its base at (x, y, z).
  const dome = (x, y, z, r, h, color, segments = 12) => moved(turnedX(turn([[r, 0], [r, h * 0.35], [r * 0.7, h * 0.8], [0, h]], sg(segments), color), Math.PI / 2), x, y, z);
  // A face's mask: a closed half ellipsoid on the pole's front.
  const mask = (f, color) => {
    const n = lite() ? 3 : 6, g = turn([[0, 0], ...Array.from({ length: n + 1 }, (_, k) => [Math.cos(k / n * Math.PI / 2), Math.sin(k / n * Math.PI / 2)])], sg(20), color), v = g.verts;
    for (let k = 0; k < v.length; k += 3) { v[k] *= f.ax; v[k + 1] *= f.az; v[k + 2] *= f.ay; }
    return moved(turnedX(g, Math.PI / 2), 0, f.y, f.zc);
  };
  // An ear on the mask's rim, out toward `side`, with a dark hollow.
  const ear = (c, f, side, y, r, color) => {
    const x = side * (f.ax - 0.05), z = f.zc + 0.02;
    c.round.push(moved(turnedY(dome(0, 0, 0, r, r * 0.9, color), side * Math.PI / 2), x, y, z));
    if (!lite()) c.round.push(moved(turnedY(dome(0, 0, 0, r * 0.55, r * 0.95, c.d.dk, 10), side * Math.PI / 2), x + side * 0.01, y, z));
  };
  // A brow ridge over both eyes, bent to follow the mask.
  const brow = (c, f, y, half, r) => {
    if (lite()) return;
    for (const sx of [-1, 1]) c.round.push(log(0, y, surf(f, 0, y) - r * 0.5, sx * half, y - 0.03, surf(f, sx * half, y - 0.03) - r * 0.5, r, c.d.dk));
  };
  // A bone eye with a dark socket in it, `r` round with its base at z, ringed in `ring` when given, and its socket
  // kept for the hub's fire at `flame` scale.
  const eye = (c, x, y, z, r, flame, ring) => {
    if (ring && !lite()) c.round.push(dome(x, y, z - 0.01, r * 1.3, r * 0.5, ring));
    c.round.push(dome(x, y, z, r, r * 0.7, BONE));
    if (!lite()) c.round.push(dome(x, y, z + r * 0.5, r * 0.6, r * 0.32, HOLLOW, 10));
    c.eyes.push([x, y, z + r * 0.8, flame]);
  };
  const faceEye = (c, f, x, y, r, flame, ring) => eye(c, x, y, surf(f, x, y) - 0.02, r, flame, ring);
  // A grin `rx` by `ry` at y: dark lips sunk into the mask round the throat, bone teeth from its top and foot; the
  // ember is a glyph.
  const grin = (c, f, y, rx, ry) => {
    const z = surf(f, 0, y) - 0.01, ix = rx * 0.8, iy = ry * 0.68, t = rx * 0.17;
    c.flat.push(moved(prism(oval(rx, ry, lite() ? 8 : 14), 0.12, CUT), 0, y, z - 0.04), moved(prism(oval(ix, iy, lite() ? 8 : 14), 0.01, HOLLOW), 0, y, z + 0.022));
    if (!lite()) for (const [sy, n] of [[1, 4], [-1, 3]]) for (let k = 0; k < n; k++) {
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
      if (lite() && k % 2) return;
      const a = lens.length > 1 ? (k / (lens.length - 1) - 0.5) * 2 * spread : 0;
      for (const g of feather(len, w, colors[k % 2], tips[k % 2], 0.07)) c.flat.push(moved(turnedZ(g, Math.PI / 2 + a), 0, y, z));
    });
  };
  // One wing, x outward by `side`, `w` its scale: five pointed feathers fanned from the shoulder behind the bird's
  // head, the upper ones tucked behind the lower.
  const wing = (c, f, side, w) => {
    const d = c.d;
    [[-0.4, 0.54], [-0.15, 0.68], [0.1, 0.8], [0.36, 0.78], [0.62, 0.62]].forEach(([a, len], k) => {
      if (lite() && k % 2) return;
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
      if (!lite()) for (const sx of [-1, 1]) c.round.push(dome(sx * 0.27, f.y - 0.06, surf(f, sx * 0.27, f.y - 0.06) - 0.04, 0.07, 0.06, RED, 10));
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
      if (!lite()) for (const sx of [-1, 1]) c.round.push(dome(sx * 0.065, f.y - 0.1, mz + 0.15, 0.032, 0.025, HOLLOW, 8));
      c.flat.push(box({ w: 0.26, h: 0.034, d: 0.03, color: HOLLOW, offset: { y: f.y - 0.27, z: mz + 0.145 } }));
    },
    // The bird: big ringed eyes, a hooked beak, and wings spread behind when its design has them.
    bird: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.lt));
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.17, f.y + 0.08, 0.12, 0.66, OCHRE);
      c.round.push(along(turn([[0.12, 0], [0.1, 0.12], [0.05, 0.26], [0, 0.34]], sg(12), OCHRE), 0, f.y - 0.06, surf(f, 0, f.y - 0.06) - 0.06, 0, -0.5, 1));
      c.round.push(along(turn([[0.07, 0], [0.04, 0.1], [0, 0.16]], sg(10), d.paint2 === BONE ? RED : d.paint2), 0, f.y - 0.16, surf(f, 0, f.y - 0.16) - 0.05, 0, -0.9, 1));
      if (d.wings) for (const side of [-1, 1]) wing(c, f, side, d.wings);
    },
    // The owl: great eyes in painted rings, a small hooked beak, ear tufts and rows of breast feathers.
    owl: (c, f) => {
      const d = c.d;
      c.round.push(mask(f, d.lt));
      for (const sx of [-1, 1]) {
        const x = sx * 0.18, y = f.y + 0.08, z = surf(f, x, y) - 0.02;
        if (!lite()) c.round.push(dome(x, y, z - 0.03, 0.25, 0.06, BONE === d.paint2 ? d.dk : BONE));
        eye(c, x, y, z, 0.14, 0.72, d.paint);
        for (const g of feather(0.36, 0.07, d.dk, d.paint, 0.07)) c.flat.push(moved(turnedZ(g, Math.PI / 2 - sx * 0.45), sx * 0.24, f.y + 0.34, f.zc + 0.04));
      }
      c.round.push(along(turn([[0.06, 0], [0.035, 0.1], [0, 0.17]], sg(10), OCHRE), 0, f.y - 0.04, surf(f, 0, f.y - 0.04) - 0.03, 0, -0.7, 1));
      if (!lite()) for (const [y, xs] of [[f.y - 0.2, [-0.14, 0, 0.14]], [f.y - 0.31, [-0.21, -0.07, 0.07, 0.21]]]) for (const x of xs) {
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
      c.round.push(mask(f, d.lt), moved(turnedX(torus(f.ax - 0.01, 0.035, d.paint, 0, sg(24), lite() ? 4 : 6), Math.PI / 2), 0, f.y, R + 0.02));
      for (const sx of [-1, 1]) faceEye(c, f, sx * 0.14, f.y + 0.08, 0.09, 0.45, d.paint);
      c.round.push(dome(0, f.y - 0.04, surf(f, 0, f.y - 0.04) - 0.03, 0.07, 0.1, d.wood));
      if (!lite()) for (const sx of [-1, 1]) c.round.push(dome(sx * 0.24, f.y - 0.1, surf(f, sx * 0.24, f.y - 0.1) - 0.03, 0.06, 0.05, RED, 10));
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
        if (!lite()) c.round.push(dome(sx * 0.05, f.y - 0.01, surf(f, sx * 0.05, f.y - 0.01) - 0.01, 0.025, 0.02, HOLLOW, 8));
      }
      const mouth = (x) => f.y - 0.14 + 0.07 * (x / 0.38) ** 2;
      const cuts = lite() ? 4 : 8, cw = 0.76 / cuts;
      for (let k = 0; k < cuts; k++) {
        const x0 = -0.38 + k * cw, x1 = x0 + cw, y0 = mouth(x0), y1 = mouth(x1), t = 0.018;
        c.flat.push(moved(prism(ccw([[x0, y0 - t], [x1, y1 - t], [x1, y1 + t], [x0, y0 + t]]), 0.05, CUT), 0, 0, surf(f, (x0 + x1) / 2, (y0 + y1) / 2) - 0.012));
      }
      if (!lite()) for (const [x, y, r] of [[0, f.y + 0.13, 0.05], [-0.42, f.y - 0.04, 0.045], [0.42, f.y - 0.04, 0.045], [-0.17, f.y + 0.03, 0.035], [0.17, f.y + 0.03, 0.035]]) {
        c.round.push(dome(x, y, surf(f, x, y) - 0.02, r, r * 0.6, d.paint, 10));
      }
    }
  };

  // The crests over the cap at `top`.
  const CREST = {
    // A coin standing on a collar, its rim proud and its ₿ a glyph, in a halo of seven feathers.
    coin: (c, top) => {
      const d = c.d, cy = top + 0.6;
      c.round.push(moved(turn([[0.14, 0], [0.11, 0.12], [0.16, 0.18], [0.1, 0.2], [0, 0.2]], sg(12), d.dk), 0, top + 0.12, 0));
      c.round.push(moved(turnedX(turn([[0, -0.05], [0.4, -0.05], [0.4, 0.05], [0, 0.05]], sg(24), "#d38a22"), Math.PI / 2), 0, cy, 0));
      c.round.push(moved(turnedX(torus(0.41, 0.06, "#a8661a", 0, sg(28), lite() ? 4 : 6), Math.PI / 2), 0, cy, 0));
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
      c.round.push(moved(turn([[0.13, 0], [0.09, 0.08], [0.11, 0.12], [0, 0.12]], sg(12), d.dk), 0, top + 0.1, 0));
      c.round.push(moved(turn(Array.from({ length: 9 }, (_, k) => [Math.sin(k / 8 * Math.PI) * r, (1 - Math.cos(k / 8 * Math.PI)) * r]), sg(18), BONE), 0, top + 0.12, 0));
      c.round.push(moved(torus(r + 0.005, 0.03, d.paint, 0, sg(24), lite() ? 4 : 6), 0, top + 0.12 + r, 0));
    },
    // A headdress of nine feathers over the top face, on a band of beads.
    headdress: (c, top) => {
      const d = c.d;
      fan(c, top + 0.02, -0.02, 1.0, [0.5, 0.58, 0.64, 0.7, 0.72, 0.7, 0.64, 0.58, 0.5], [d.paint, d.paint2], [RED, d.paint]);
      if (!lite()) for (let k = 0; k < 9; k++) {
        const a = (k / 8 - 0.5) * 2.4;
        c.round.push(moved(turnedY(dome(0, 0, 0, 0.05, 0.06, k % 2 ? BONE : RED, 8), a), Math.sin(a) * (R - 0.02), top - 0.06, Math.cos(a) * (R - 0.02)));
      }
    },
    // Repo Island's crests. Each stands on a short turned collar over the cap and faces +z, as the meadow's do.
    // An old key on end, its bow a ring and its bit two teeth.
    key: (c, top) => {
      const d = c.d;
      collar(c, top);
      c.round.push(moved(turn([[0.05, 0], [0.05, 0.62], [0, 0.62]], sg(10), BRASS), 0, top + 0.2, 0));
      c.round.push(moved(turnedX(torus(0.19, 0.055, d.paint, 0, sg(20), lite() ? 4 : 6), Math.PI / 2), 0, top + 0.92, 0));
      c.flat.push(box({ w: 0.18, h: 0.07, d: 0.06, color: BRASS, offset: { x: 0.12, y: top + 0.3 } }), box({ w: 0.13, h: 0.07, d: 0.06, color: d.paint2, offset: { x: 0.1, y: top + 0.44 } }));
    },
    // A cog standing on its rim: a turned wheel, ten teeth and a painted hub.
    gear: (c, top) => {
      const d = c.d, cy = top + 0.56;
      collar(c, top);
      c.round.push(moved(turnedX(turn([[0, -0.05], [0.31, -0.05], [0.31, 0.05], [0, 0.05]], sg(20), IRON), Math.PI / 2), 0, cy, 0));
      c.round.push(dome(0, cy, 0.05, 0.11, 0.06, d.paint));
      const teeth = lite() ? 6 : 10;
      for (let k = 0; k < teeth; k++) c.flat.push(moved(turnedZ(box({ w: 0.1, h: 0.13, d: 0.09, color: IRON, offset: { y: 0.33 } }), k / teeth * Math.PI * 2), 0, cy, 0));
    },
    // A pickaxe on its haft, the iron head curved across the top.
    pick: (c, top) => {
      const d = c.d, y = top + 0.86;
      c.round.push(log(0, top + 0.04, 0, 0, top + 0.98, 0, 0.045, d.lt));
      for (const side of [-1, 1]) c.flat.push(prism(ccw([[side * 0.04, y - 0.05], [side * 0.3, y - 0.07], [side * 0.48, y - 0.2], [side * 0.3, y + 0.03], [side * 0.04, y + 0.07]]), 0.08, IRON));
      c.flat.push(box({ w: 0.11, h: 0.15, d: 0.1, color: d.paint, offset: { y } }));
    },
    // A scroll rolled across the top with its sheet hung in front, ruled in dark lines.
    scroll: (c, top) => {
      const d = c.d, y = top + 0.46;
      collar(c, top);
      c.round.push(moved(turnedZ(turn([[0.1, -0.34], [0.1, 0.34], [0, 0.34]], sg(12), BONE), Math.PI / 2), 0, y, 0));
      for (const side of [-1, 1]) c.round.push(moved(turnedY(dome(0, 0, 0, 0.06, 0.07, d.paint), side * Math.PI / 2), side * 0.34, y, 0));
      c.flat.push(box({ w: 0.6, h: 0.34, d: 0.03, color: BONE, offset: { y: y - 0.2, z: 0.1 } }));
      for (let k = 0; k < 3; k++) c.flat.push(box({ w: 0.42 - k * 0.08, h: 0.025, d: 0.01, color: CHAR, offset: { y: y - 0.12 - k * 0.08, z: 0.12 } }));
    },
    // An eye in a painted ring: the almond of bone, a ringed iris and a dark pupil.
    eye: (c, top) => {
      const d = c.d, cy = top + 0.58;
      collar(c, top);
      c.round.push(moved(turnedX(torus(0.3, 0.05, d.paint, 0, sg(20), lite() ? 4 : 6), Math.PI / 2), 0, cy, 0));
      const white = dome(0, 0, 0, 0.24, 0.1, BONE);
      for (let k = 1; k < white.verts.length; k += 3) white.verts[k] *= 0.55;
      c.round.push(moved(white, 0, cy, 0.02), dome(0, cy, 0.09, 0.1, 0.05, d.paint2), dome(0, cy, 0.13, 0.05, 0.03, HOLLOW, 8));
    },
    // Three links of chain hung end to end, every other one turned square to its neighbours.
    chain: (c, top) => {
      const d = c.d;
      collar(c, top);
      [0.36, 0.62, 0.88].forEach((y, k) => {
        const link = torus(0.12, 0.035, k % 2 ? d.paint2 : IRON, 0, sg(14), lite() ? 4 : 5);
        for (let n = 2; n < link.verts.length; n += 3) link.verts[n] *= 1.45;
        c.round.push(moved(turnedY(turnedX(link, Math.PI / 2), k % 2 ? Math.PI / 2 : 0), 0, top + y, 0));
      });
    },
    // A crescent moon with a small star in its arms.
    moon: (c, top) => {
      const d = c.d, cy = top + 0.5, n = 9;
      collar(c, top);
      for (let k = 0; k < n; k++) {
        const a0 = -1.9 + k / n * 3.8, a1 = -1.9 + (k + 1) / n * 3.8, outer = 0.36, inner = 0.27;
        const pt = (a, r, ox) => [ox + Math.sin(a) * r, Math.cos(a) * r];
        c.flat.push(moved(prism(ccw([pt(a0, outer, 0), pt(a1, outer, 0), pt(a1, inner, 0.11), pt(a0, inner, 0.11)].map(([x, y]) => [-x, y])), 0.09, d.paint2), 0.04, cy, 0));
      }
      starPiece(c, 0.1, cy + 0.04, 0.07, 0.1, d.paint);
    },
    // A heater shield with a painted stripe and a boss.
    shield: (c, top) => {
      const d = c.d, y = top + 0.12;
      collar(c, top);
      c.flat.push(prism([[-0.33, y + 0.84], [-0.33, y + 0.45], [-0.18, y + 0.15], [0, y], [0.18, y + 0.15], [0.33, y + 0.45], [0.33, y + 0.84]], 0.1, d.paint));
      c.flat.push(box({ w: 0.12, h: 0.7, d: 0.11, color: d.paint2, offset: { y: y + 0.48, z: 0.01 } }));
      c.round.push(dome(0, y + 0.56, 0.05, 0.1, 0.07, BRASS));
    },
    // A carved flame, three tongues one inside another.
    flame: (c, top) => {
      const d = c.d, y = top + 0.1;
      collar(c, top);
      [[0.3, 0.88, d.paint, 0.06], [0.2, 0.66, d.paint2, 0.1], [0.11, 0.42, BONE, 0.13]].forEach(([w, h, color, z]) => {
        c.flat.push(moved(prism([[-w, y + h * 0.3], [-w * 0.55, y + h * 0.05], [0, y], [w * 0.55, y + h * 0.05], [w, y + h * 0.3], [w * 0.35, y + h * 0.72], [0, y + h], [-w * 0.35, y + h * 0.72]], 0.06, color), 0, 0, z - 0.06));
      });
    },
    // A stepped tower of three courses with a painted cap.
    tower: (c, top) => {
      const d = c.d;
      [[0.6, 0.26, d.dk], [0.46, 0.24, d.paint], [0.32, 0.22, d.dk], [0.16, 0.16, d.paint2]].reduce((y, [w, h, color]) => {
        c.flat.push(box({ w, h, d: w, color, offset: { y: y + h / 2 } }));
        return y + h;
      }, top + 0.08);
    },
    // A five-pointed star on a short neck.
    star: (c, top) => {
      const d = c.d;
      collar(c, top);
      starPiece(c, 0, top + 0.56, 0.17, 0.4, d.paint2);
      c.round.push(dome(0, top + 0.56, 0.045, 0.08, 0.05, d.paint));
    }
  };
  // A short turned collar on the cap for a crest to stand on.
  const collar = (c, top) => c.round.push(moved(turn([[0.13, 0], [0.1, 0.08], [0.12, 0.13], [0, 0.13]], sg(12), c.d.dk), 0, top + 0.08, 0));
  // A five-pointed star `outer` across its points about (x, y), facing +z: a pentagon and a tip on each side, each
  // convex, `inner` the pentagon's radius.
  const starPiece = (c, x, y, inner, outer, color) => {
    const at = (k, r) => [x + Math.sin(k / 5 * Math.PI * 2) * r, y + Math.cos(k / 5 * Math.PI * 2) * r];
    c.flat.push(prism(ccw(Array.from({ length: 5 }, (_, k) => at(k + 0.5, inner))), 0.08, color));
    for (let k = 0; k < 5; k++) c.flat.push(prism(ccw([at(k - 0.5, inner), at(k, outer), at(k + 0.5, inner)]), 0.08, color));
  };

  // A carved band round the pole at y, painted between dark rims, beaded with bone studs when `studs`.
  const band = (c, y) => {
    const d = c.d;
    const profile = bare() ? [[R + 0.03, 0], [R + 0.03, 0.1]] : lite() ? [[R * 0.98, 0], [R + 0.03, 0.012], [R + 0.03, 0.088], [R * 0.98, 0.1]]
      : [[R * 0.98, 0], [R + 0.03, 0.012], [R + 0.03, 0.028], [R + 0.022, 0.03], [R + 0.022, 0.07], [R + 0.03, 0.072], [R + 0.03, 0.088], [R * 0.98, 0.1]];
    c.round.push(moved(turn(profile, sg(RING_SEGMENTS), (t) => lite() ? t < 0.2 || t > 0.8 ? d.dk : d.paint : t < 0.3 || t > 0.7 ? d.dk : d.paint), 0, y - 0.05, 0));
    if (d.studs && !lite()) for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      c.round.push(moved(turnedY(dome(0, 0, 0, 0.026, 0.025, BONE, 8), a), Math.sin(a) * (R + 0.02), y, Math.cos(a) * (R + 0.02)));
    }
  };
  // Scales a carving `w` across and `s` up.
  const scaled = (geo, w, s) => {
    const v = geo.verts;
    for (let k = 0; k < v.length; k++) v[k] *= k % 3 === 1 ? s : w;
    return geo;
  };

  // One facet of the painted stripe, just proud of the band. Copies stay aligned with its carved facets,
  // so the traveling light hugs the wood rather than floating as a rotating hoop. All rings on a pole share it.
  const ringSector = variants((i) => {
    const L = layout(i), g = turn([[R + 0.023, -0.019], [R + 0.023, 0.019]], RING_SEGMENTS, L.design.paint, 1);
    const f = g.faces[0];
    return noShadow(scaled({ verts: f.i.flatMap((k) => g.verts.slice(k * 3, k * 3 + 3)), faces: [{ ...f, i: [0, 1, 2, 3] }], lines: [], depthOffset: true, surfaceOverlay: true }, L.w, L.s));
  });

  // A totem's carving at its layout L: the wood, stone, paint and board of the totem whose name board reads `word`,
  // its foot stones drawn from `seed`. See the header for `opts`.
  const carve = (L, word, seed, opts = {}) => {
    const d = L.design, c = { d, round: [], flat: [], eyes: L.eyes };
    DETAIL = opts.detail || 1;
    try {
      c.eyes.length = 0;
      c.round.push(bare() ? moved(turn([[R, 0], [R, L.top - 0.05], [0, L.top - 0.05]], 6, d.wood), 0, 0.05, 0) : log(0, 0.05, 0, 0, L.top, 0, R, d.wood));
      // The cap over the end grain.
      c.round.push(moved(turn([[R * 1.02, 0], [R * 0.95, 0.08], [R * 0.6, 0.16], [0, 0.2]], sg(14), d.dk), 0, L.top - 0.02, 0));
      CREST[d.crest](c, L.top);
      L.faces.forEach((f, k) => {
        if (k) band(c, f.y - f.h / 2);
        if (!bare()) FACES[f.kind](c, f);
        else {
          c.round.push(mask(f, f.kind === "gorilla" ? d.dk : f.kind === "bird" || f.kind === "owl" || f.kind === "sun" ? d.lt : d.wood));
          // Each kind's eyes where its full carving puts them, so their fires stand in the same sockets at any detail.
          const [ex, dy, r, flame, dz] = BARE_EYES[f.kind];
          for (const sx of [-1, 1]) {
            const x = sx * ex, y = f.y + dy, z = surf(f, x, y) + dz;
            c.flat.push(box({ w: r * 1.5, h: r * 1.1, d: r, color: BONE, offset: { x, y, z: z + r * 0.4 } }));
            c.eyes.push([x, y, z + r * 0.8, flame]);
          }
        }
      });
      band(c, FOOT - 0.05);
      const geo = scaled(shaded(c.round, c.flat), L.w, L.s);
      // Keep just the face and crest paint for the glow overlay, before adding the board and foot stones.
      // The overlay shares these exact carved surfaces and is drawn only while the repository glows.
      if (opts.highlights !== false) {
        const colors = [d.paint, d.paint2, BONE, OCHRE, RED, "#d38a22", "#a8661a"].map(hexToRgb);
        const highlights = { verts: [], faces: [], lines: [], smooth: true, castShadow: false, depthOffset: true, surfaceOverlay: true };
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
      }
      for (const e of c.eyes) { e[0] *= L.w; e[1] *= L.s; e[2] *= L.w; e[3] *= L.w; }
      // The name board, standing on its pegs in front of the stones.
      if (opts.board !== false) flatInto(geo, moved(merge(opts.board || postSign(word, 0.32, 0.18)), 0, 0, 0.15 + 0.85 * L.w));
      // The ring of rough stones the pole is set in, as wide as the pole and as tall as it is scaled.
      const rand = mulberry32(seed), s = L.s, lean = lite() || opts.leanStones, stones = bare() ? 0 : lean ? 6 : 8;
      for (let k = 0; k < stones; k++) {
        const a = k / stones * Math.PI * 2 + (rand() - 0.5) * 0.3, rr = (R + 0.2 + rand() * 0.08) * L.w, r = (0.2 + rand() * 0.07) * L.w;
        puff(geo, Math.sin(a) * rr, 0.1 * s, Math.cos(a) * rr, r, (0.14 + rand() * 0.05) * s, r * 0.9, STONES, rand, lean ? 3 : 5, lean ? 6 : 9, Math.floor(rand() * 3) - 1);
      }
      geo.collisionGeometry = merge(...L.boxes.map(([hx, y0, y1, hz]) => box({ w: hx * 2, h: y1 - y0, d: hz * 2, color: CHAR, offset: { y: (y0 + y1) / 2 } })));
      return geo;
    } finally {
      DETAIL = 1;
    }
  };
  const body = variants((i) => carve(layout(i), BL.totemFeed.REPOS[i].word, 5150 + i));

  const featureHighlights = (i) => body(i).featureHighlights;

  // The runes read the word's letters, X as the KS it sounds, anything without a rune (a digit) left out.
  const glyphsOf = (L, word) => {
    const runes = [...word.toUpperCase().replace(/X/g, "KS").replace(/[^A-Z]/g, "")], parts = [];
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
    return noShadow(scaled(merge(...parts), L.w, L.s));
  };
  const glyphs = variants((i) => glyphsOf(layout(i), BL.totemFeed.REPOS[i].word));

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
  const hitOf = (L, ox, oy, oz, dx, dy, dz) => {
    let t = Infinity;
    for (const [hx, y0, y1, hz] of L.boxes) t = Math.min(t, slab(ox, oy, oz, dx, dy, dz, hx, y0, y1, hz));
    return t;
  };
  const hit = (i, ox, oy, oz, dx, dy, dz) => hitOf(layout(i), ox, oy, oz, dx, dy, dz);

  BL.totemModels = { body, glyphs, ringSector, featureHighlights, layout, hit, layoutOf, carve, glyphsOf, hitOf, DESIGNS, KINDS: Object.keys(KINDS), CRESTS: Object.keys(CRESTS), CORE_HEIGHT, RING_SEGMENTS };
})();
