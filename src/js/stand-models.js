// The firework stand's models and pictures, for the sealed cave at 9 o'clock beside the Timechain Sphere's stairs, set
// into its mouth. A small attraction, readable from across the island: a timber booth on a deck, its back half inside
// the cave's opening under the rock, with a merchant counter and the stand's point-of-sale terminal on it, its screen
// in a bezel lined in glowing orange, shelves stocked with fireworks behind, a red and white striped canopy hung from
// the rim's lintel with a scalloped valance, the big gold FIREWORKS sign with LIGHT UP OBL under it and four oversized
// rockets standing on it, and a board either side: BUY A FIREWORK on the left with each firework's icon, name and
// price, and TOP LAUNCHES on the right under a gold crown. It stands on a plinth of two courses of chunky stones with
// mortar joints and a paving of bricks in grout, its floor half a metre up. Tall posts at its outer corners fly blue
// sunburst banners and string lantern ropes to the sign. The boards stand in heavy frames, their faces from the
// counter's height up, each a header plaque on a gold rim with brass studs and a raised panel to a row, its icon in a
// raised frame and, on the menu, a raised gold play button, under its lettering, which in WebGL is raised letters like
// the sign's. A rope fence on posts, the two either side of the way in lit, runs round the paving. A starburst stands
// at either end of the shelves, rockets on the counter's ends, and the big rockets stand before a palisade of stakes.
// Painted crates of fireworks stand at the paving's corners. A sparkle hangs over each rocket's tip, gold bursts at the
// sign's top corners and a sparkle at either end of the tagline. Greenery with white flowers grows on the caps, by the
// sign and round the plinth. Its timber is voxels an eighth of a metre across (`PX`) with the grain running along each
// beam, as the Factory's kiosk and board are built, so the renderer's block detail gives it the same pixel texture; the
// plinth's stones and bricks are boxes on a grid a quarter of a voxel across (`MASON`) that the renderer details as
// voxels, the greenery's half that size (`LEAF`); cloth, rope, letters, stars and pictures stay smooth. The lettering
// and the marquee are meshes of their own, for Canvas 2D's `depthBias` (the scene sets it) to sort them in front of the
// sign's planks.
//
// Everything is in the stand's own frame: x to the visitor's right as they face it, y up from its floor (the plinth's
// top, `LAYOUT.floor` over the ground), +z out of its front. `LAYOUT` places what the scene hangs and uses (where a
// visitor stands to buy, the terminal, the vendor, the lanterns, the stars, the rocket tips the sparks come from, the
// boards' faces). `ground()` (the plinth and greenery) and `build()` (all of it, the ground's too) are cached per
// visit's scope, as every builder is. The painters (`menuFace`, `launchesFace`) draw the two boards in the Factory
// kiosk's letters (factory-kiosk.js `kit`), and `pictureFace` lays a canvas on a face the renderer uploads once.
(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry, box, bevelBox, merge, moved, turnedX, turnedY, turnedZ, prism, lathe, noShadow, cached } = BL.models;
  const { mulberry32 } = BL.math;

  const PX = 0.125, LEAF = PX / 2, FROM = { x: -4.5, y: -0.125, z: -2.5 }, ZERO = { x: 0, y: 0, z: 0 };
  // Timber tones, its grain, dark trim; the rockets' and boxes' paints; gold that glows a little in the day; the
  // plinth's stones and its paving's bricks; leaves, petals and their middles.
  const PALETTE = [null, "#9a5a28", "#8b5022", "#a6652e", "#7d461e", "#57301a", "#46260f",
    "#d8342c", "#f4eee2", "#2d5bd8", "#ffc21a", "#8a3bd1", "#2fa84a", "#a6ef74", "#b8231d", "#2c2e33", "#1d2f7a",
    "#ff8a1c", "#c83a2a", "#2a4fb8", "#ffd24a", "#16110d", "#ffcf3f", "#5b1f8a", "#1d6e2f",
    "#a57b72", "#946a63", "#b08a84", "#86625d", "#ad6a4b", "#9a5a40", "#bb7856", "#8c4f39",
    "#3f8f2f", "#2f7426", "#5aae3c", "#f4f1e4", "#ffc93a"];
  const T = { trim: 6, red: 7, white: 8, blue: 9, gold: 10, purple: 11, green: 12, lime: 13, cone: 14, iron: 15, navy: 16,
    orange: 17, boxRed: 18, boxBlue: 19, star: 20, slate: 21, crown: 22, plum: 23, pine: 24,
    stones: [25, 26, 27, 28], bricks: [29, 30, 31, 32], leaves: [33, 34, 35], petal: 36, bloom: 37 };
  const GLOWS = { [T.gold]: 0.35, [T.star]: 0.55, [T.crown]: 0.7 };
  const TONES = [1, 2, 3, 4], GRAIN = 5;
  const cell = (m, axis) => Math.round((m - FROM[axis]) / PX);
  const voxGeo = (v, from = FROM, unit = PX) => voxelGeometry(v, { unit, palette: PALETTE, origin: from, emissive: GLOWS });
  const fill = (v, x0, x1, y0, y1, z0, z1, c) => {
    for (let i = cell(x0, "x"); i < cell(x1, "x"); i++) for (let j = cell(y0, "y"); j < cell(y1, "y"); j++) for (let k = cell(z0, "z"); k < cell(z1, "z"); k++) v.set(i, j, k, typeof c === "function" ? c(i, j, k) : c);
  };
  // Timber over (x0, y0, z0) to (x1, y1, z1) metres, the grain along x, y or z: each line of cells along the grain keeps
  // one tone, a few lines darker, now and then a knot.
  const timber = (v, rand, x0, x1, y0, y1, z0, z1, along) => {
    const tones = new Map();
    fill(v, x0, x1, y0, y1, z0, z1, (i, j, k) => {
      const line = along === "x" ? j * 4096 + k : along === "y" ? i * 4096 + k : i * 4096 + j;
      if (!tones.has(line)) tones.set(line, rand() < 0.12 ? GRAIN : TONES[Math.floor(rand() * 4)]);
      return rand() < 0.015 ? GRAIN : tones.get(line);
    });
  };
  const carve = (v, x0, x1, y0, y1, z0, z1) => {
    for (let i = cell(x0, "x"); i < cell(x1, "x"); i++) for (let j = cell(y0, "y"); j < cell(y1, "y"); j++) for (let k = cell(z0, "z"); k < cell(z1, "z"); k++) v.del(i, j, k);
  };
  // A steady fraction for a cell, so a block or a brick keeps its tone.
  const hash = (a, b, c) => (Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761) >>> 0) / 4294967296;
  // A sagging rope's point t of the way from a to b, `sag` metres down at its middle.
  const along = ([ax, ay, az], [bx, by, bz], sag, t) => [ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t];

  // Where things are, in the stand's frame.
  const FLOOR = 0.5, ROCKET_H = 1.5, BOARD_X = 2.875, CORNER_X = 4.0;
  // The plinth: its lower course's and upper course's half-width and front (both run back to the booth's back), and
  // the border of stone round the paving in the upper course's top.
  const PLINTH = { lower: { x: 4.5, z: 3.625 }, upper: { x: 4.25, z: 3.375 }, back: -1.75, border: 0.5 };
  const LAYOUT = {
    // Its floor, the plinth's top, over the ground the stand stands on.
    floor: FLOOR,
    // The ground the stand takes (its plinth), for its claim and for checks of where it may stand; and the open ground
    // before it, kept clear of palms and scatter so the stand shows from the path and visitors have room to come in.
    footprint: { x0: -PLINTH.lower.x, x1: PLINTH.lower.x, z0: PLINTH.back, z1: PLINTH.lower.z },
    apron: [[-2.75, 4.6, 1.4], [0, 4.8, 1.5], [2.75, 4.6, 1.4], [-2.75, 6.4, 1.4], [0, 6.6, 1.5], [2.75, 6.4, 1.4]],
    // Where a visitor stands to buy: before the counter, by the terminal; how near counts.
    use: { x: 0.45, z: 1.6, reach: 1.7 },
    // The terminal's head: its middle, its lean back toward the buyer, its glass (a picture `w` by `h`) and how far out
    // of the middle the glass lies.
    screen: { x: 0.8, y: 1.62, z: 0.5, w: 0.57, h: 0.38, tilt: -0.32, face: 0.051 },
    // The vendor stands on a step behind the counter, so his head and hat clear its top.
    vendor: { x: -0.55, y: 0.6, z: -0.35 },
    // The lanterns that light it, from the canopy's front corners.
    lamps: [[-1.62, 2.5, 1.0], [1.62, 2.5, 1.0]],
    // The lantern ropes, from the corner posts' tops to the sign's top corners: their ends, their sag, and where along
    // each a lantern hangs; those lanterns only glow.
    ropes: [-1, 1].map((s) => ({ from: [s * CORNER_X, 4.8, 0.25], to: [s * 2.3, 4.1, 1.2], sag: 0.32, lamps: [0.34, 0.68] })),
    // The rope fence's posts on the paving, [x, z, top, lit]: one either side of the way in, lit, and plain ones at the
    // front corners and back along the sides; `fence` pairs the posts its ropes run between.
    posts: [[-1.5, 3.0, 1.25, true], [1.5, 3.0, 1.25, true], [-3.875, 3.0, 1.0, false], [3.875, 3.0, 1.0, false], [-3.875, 1.75, 1.0, false], [3.875, 1.75, 1.0, false]],
    fence: [[0, 2], [1, 3], [2, 4], [3, 5]],
    // The lit posts' lamps, which light the paving at night.
    postLamps: [],
    // The boards' pictures lie just in front of their panels and plaques (`boardGeometry`); the cloth a few centimetres
    // proud of its recess, so Canvas 2D sorts it in front too.
    menu: { x: -BOARD_X, y: 2.0625, z: 0.414, w: 1.42, h: 1.78 },
    launches: { x: BOARD_X, y: 2.0625, z: 0.414, w: 1.42, h: 1.78 },
    cloth: { x: 0, y: 0.72, z: 0.8, w: 1.18, h: 0.58 },
    // The stars that twinkle, [x, y, z, size, paint]: gold bursts in the greenery at the sign's top corners, a sparkle
    // either end of the tagline, and (below) one over each rocket's tip.
    stars: [[-2.55, 4.42, 1.45, 0.75, "gold"], [2.55, 4.42, 1.45, 0.75, "gold"], [-1.72, 2.82, 1.56, 0.5, "sparkle"], [1.72, 2.82, 1.56, 0.5, "sparkle"]],
    // The four big rockets on the sign: their feet, their lean, their paint; their tips are where the sparks fly from.
    rockets: [[-1.69, 4.25, 1.25, 0.14, "stripes"], [-0.56, 4.25, 1.25, 0.05, "stars"], [0.56, 4.25, 1.25, -0.05, "plum"], [1.69, 4.25, 1.25, -0.14, "spiral"]],
    rocketH: ROCKET_H,
    // The corner posts' banners: where each hangs from its arm.
    banners: [-1, 1].map((s) => ({ x: s * (CORNER_X + 0.47), y: 4.78, z: 0.25 }))
  };
  LAYOUT.tips = LAYOUT.rockets.map(([x, y, z, lean]) => [x - Math.sin(lean) * ROCKET_H, y + Math.cos(lean) * ROCKET_H, z]);
  const TIP_PAINT = { stripes: "orange", stars: "gold", plum: "pink", spiral: "lime" };
  LAYOUT.rockets.forEach(([, , , , paint], n) => LAYOUT.stars.push([LAYOUT.tips[n][0], LAYOUT.tips[n][1] + 0.24, LAYOUT.tips[n][2], 0.45, TIP_PAINT[paint]]));
  LAYOUT.ropeLamps = LAYOUT.ropes.flatMap((r) => r.lamps.map((t) => along(r.from, r.to, r.sag, t)));
  for (const [x, z, top, lit] of LAYOUT.posts) if (lit) LAYOUT.postLamps.push([x, top + 0.285, z]);

  // ---- letters ---------------------------------------------------------------------------------------------------
  // `text` in the island's carved sign font (hub-models.js SIGN_GLYPHS), centred on (x, y) with its back at depth z,
  // each glyph cell `size` across: each row's run of cells one block in `color` glowing `glow`, standing well clear
  // of a thin shadow in `shadow` set down and right of it. Runs, and the gap between letter and shadow, keep Canvas
  // 2D's back-to-front sort clean, as the cave signs do; in WebGL the shadow gives the letters their chunky depth.
  const letters = (text, x, y, z, size, color, shadow, glow) => {
    const G = BL.hubModels.SIGN_GLYPHS, face = [], back = [];
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : G[ch][0].length + 1;
    let cursor = x - cells * size / 2;
    const deep = size * 0.42, gap = size * 0.18;
    for (const ch of text) {
      if (ch === " ") { cursor += size * 2; continue; }
      const g = G[ch];
      for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) {
        if (g[r][c] !== "1") continue;
        let n = 1;
        while (g[r][c + n] === "1") n++;
        const cx = cursor + (c + n / 2) * size, cy = y + (2 - r) * size;
        face.push(box({ w: size * n - size * 0.06, h: size * 0.94, d: deep, color, emissive: glow, offset: { x: cx, y: cy, z: z + gap + deep / 2 } }));
        back.push(box({ w: size * n, h: size, d: gap * 0.6, color: shadow, offset: { x: cx + size * 0.22, y: cy - size * 0.22, z: z + gap * 0.3 } }));
        c += n - 1;
      }
      cursor += size * (g[0].length + 1);
    }
    return { face: merge(...face), back: merge(...back) };
  };

  // The same lettering as one cut-out picture, for Canvas 2D: its painter's sort orders whole faces by their middle, so
  // in an oblique view the sign's long plank faces would paint over the far letters; one picture faces it as one face.
  // `{ canvas, w, h }`, w by h metres, centred on the text's middle.
  const letterPicture = (text, size, color, shadow, px = 8) => {
    const G = BL.hubModels.SIGN_GLYPHS;
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : G[ch][0].length + 1;
    const pad = 1, cw = cells + pad * 2, ch5 = 5 + pad * 2, canvas = document.createElement("canvas");
    canvas.width = cw * px; canvas.height = ch5 * px;
    const g = canvas.getContext("2d"), off = Math.max(1, Math.round(px * 0.22));
    for (const [ink, dx] of [[shadow, off], [color, 0]]) {
      g.fillStyle = ink;
      let cursor = pad;
      for (const c of text) {
        if (c === " ") { cursor += 2; continue; }
        const glyph = G[c];
        for (let r = 0; r < glyph.length; r++) for (let q = 0; q < glyph[r].length; q++) if (glyph[r][q] === "1") g.fillRect((cursor + q) * px + dx, (pad + r) * px + dx, px, px);
        cursor += glyph[0].length + 1;
      }
    }
    return { canvas, w: cw * size, h: ch5 * size };
  };

  // ---- pixel pictures as boxes -------------------------------------------------------------------------------------
  // A pixel sprite (rows of characters, "." clear) as boxes `size` across in the xy plane at depth z, centred on (x, y).
  const sprite = (rows, ink, x, y, z, size, depth, glow = 0) => {
    const out = [], h = rows.length, w = rows[0].length;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      out.push(box({ w: size, h: size, d: depth, color: ink[ch], emissive: glow, offset: { x: x + (c - (w - 1) / 2) * size, y: y + ((h - 1) / 2 - r) * size, z } }));
    }
    return merge(...out);
  };
  const STAR = ["...#...", ".#.#.#.", "..###..", "###@###", "..###..", ".#.#.#.", "...#..."];
  const SPARKLE = ["...#...", "...#...", "..###..", "###@###", "..###..", "...#...", "...#..."];
  // Inks for the sprites: a burst's colour and its bright middle.
  const INKS = {
    gold: { "#": "#ffc21a", "@": "#fff2b0" },
    purple: { "#": "#b45cff", "@": "#f3e2ff" },
    red: { "#": "#ff4030", "@": "#ffe0a0" },
    orange: { "#": "#ff8a1c", "@": "#ffe3b0" },
    pink: { "#": "#ff5ad8", "@": "#ffe0f6" },
    lime: { "#": "#8cf04a", "@": "#f0ffd0" }
  };
  // The stars the scene twinkles node by node, each about half a metre across: gold, the tip sparkles' colours, and the
  // tagline's four-pointed sparkle in gold.
  const stars = cached(() => {
    const out = { sparkle: noShadow(sprite(SPARKLE, INKS.gold, 0, 0, 0, 0.075, 0.06, 1)) };
    for (const paint of ["gold", "orange", "pink", "lime"]) out[paint] = noShadow(sprite(STAR, INKS[paint], 0, 0, 0, 0.075, 0.06, 1));
    return out;
  });
  const star = (paint = "gold") => stars()[paint];

  // ---- rockets ---------------------------------------------------------------------------------------------------
  // A big rocket in voxels: a body four cells square and seven tall in its paint, a stepped nose cone to a point of
  // four, and a fin off each face at its foot; its frame's origin at the middle of its foot. Paints: candy stripes
  // winding round, blue with gold stars, plum with gold stars, green with a lime spiral.
  const rocket = (paint) => {
    const v = makeVox();
    // Round the body's rim, so a stripe can wind.
    const ring = [];
    for (let k = 0; k < 4; k++) ring.push([k, 0]);
    for (let k = 1; k < 4; k++) ring.push([3, k]);
    for (let k = 2; k >= 0; k--) ring.push([k, 3]);
    for (let k = 2; k >= 1; k--) ring.push([0, k]);
    const body = { stripes: [T.red, T.white], stars: [T.blue, T.star], plum: [T.plum, T.star], spiral: [T.green, T.lime] }[paint];
    const cone = { stripes: T.cone, stars: T.navy, plum: T.purple, spiral: T.pine }[paint];
    for (let y = 0; y < 7; y++) for (let k = 0; k < ring.length; k++) {
      const [i, j] = ring[k];
      let c = body[0];
      if (paint === "stripes" || paint === "spiral") c = Math.floor((y + k) / 2) % 2 ? body[1] : body[0];
      else if ((y * 5 + k * 3) % 13 === 0 || (y * 2 + k) % 9 === 4 && y % 2 === 1) c = body[1];
      v.set(i + 1, y, j + 1, c);
    }
    for (let i = 2; i <= 3; i++) for (let j = 2; j <= 3; j++) for (let y = 0; y < 7; y++) v.set(i, y, j, body[0]);
    // A gold band under the nose; the nose, its corners cut, then its point.
    for (const [i, j] of ring) v.set(i + 1, 7, j + 1, paint === "stripes" ? T.white : T.star);
    for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) if (!((i === 1 || i === 4) && (j === 1 || j === 4))) v.set(i, 8, j, cone);
    for (let i = 2; i <= 3; i++) for (let j = 2; j <= 3; j++) { v.set(i, 9, j, cone); v.set(i, 10, j, cone); }
    v.set(2, 11, 2, paint === "stripes" ? T.white : T.star);
    // The fins: two cells wide off each face, two tall, in the cone's colour.
    for (const [i, j] of [[0, 2], [0, 3], [5, 2], [5, 3], [2, 0], [3, 0], [2, 5], [3, 5]]) { v.set(i, 0, j, cone); v.set(i, 1, j, cone); }
    // Six cells across with the fins, so the middle of the foot is three cells in.
    return voxGeo(v, { x: -3 * PX, y: 0, z: -3 * PX });
  };
  const rockets = cached(() => ({ stripes: rocket("stripes"), stars: rocket("stars"), plum: rocket("plum"), spiral: rocket("spiral") }));

  // A little rocket for the bundles, twelve centimetres across and a third of a metre or so tall, standing on (x, y, z):
  // a round body of eight sides in its colour, striped in its second colour (`style` 0: candy stripes all the way up,
  // 1: one broad band, 2: two thin ones), a gold collar that steps out and back in, and a nose cone to a point in its
  // cone's colour. Its paint is one of `LITTLE`; its body is one of four heights. One lathe, coloured ring by ring.
  const LITTLE = {
    [T.red]: ["#d8342c", "#f4eee2", "#b8231d"], [T.blue]: ["#2d5bd8", "#ffc21a", "#d8342c"], [T.green]: ["#2fa84a", "#a6ef74", "#ffc21a"],
    [T.purple]: ["#8a3bd1", "#ffc21a", "#d8342c"], [T.orange]: ["#ff8a1c", "#ffd24a", "#2d5bd8"]
  };
  const STRIPES = [[0, 1, 0, 1, 0, 1], [0, 0, 1, 1, 0, 0], [0, 1, 0, 0, 1, 0]];
  const littleRocket = (x, y, z, paint, height, style) => {
    const [body, band, cone] = LITTLE[paint], r = 0.06, h = [0.24, 0.3, 0.36, 0.46][height], bands = STRIPES[style];
    // One ring where a stripe begins, so a run of one colour is one segment; the cone is one segment to its point.
    const rings = [[r, 0]], colors = [];
    bands.forEach((b, k) => {
      if (k && b === bands[k - 1]) rings[rings.length - 1][1] = h * (k + 1) / bands.length;
      else { rings.push([r, h * (k + 1) / bands.length]); colors.push(b ? band : body); }
    });
    rings.push([r * 1.2, h], [r * 1.2, h + 0.03], [r * 0.9, h + 0.03], [0, h + 0.13]);
    colors.push("#e0a81a", "#ffcf3f", "#e0a81a", cone);
    return moved(lathe({ profile: rings, segments: 8, color: (t) => colors[Math.round(t * (rings.length - 1))] }), x, y, z);
  };
  // A box of fireworks three cells a side, its paint and a gold star on its front.
  const starBox = (v, i, j, k, c) => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let d = 0; d < 3; d++) v.set(i + a, j + b, k + d, c);
    v.set(i + 1, j + 1, k + 2, T.star);
    v.set(i + 1, j + 1, k, T.star);
  };
  // A crate `n` cells a side with its near bottom-left corner at (x, y, z) metres: planks running across in the timber's
  // tones, dark edges, iron at its eight corners.
  const crate = (v, x, y, z, n) => {
    const i0 = cell(x, "x"), j0 = cell(y, "y"), k0 = cell(z, "z"), end = (a) => a === 0 || a === n - 1;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let d = 0; d < n; d++) {
      const edges = end(a) + end(b) + end(d);
      v.set(i0 + a, j0 + b, k0 + d, edges === 3 ? T.iron : edges === 2 ? T.trim : TONES[(b + i0) % 4]);
    }
  };

  // ---- greenery --------------------------------------------------------------------------------------------------
  // A clump of leaves in `LEAF` cells, a dome `rx` by `ry` by `rz` metres on (x, y, z), ragged at its rim and lighter to
  // its top in patches a few cells across (so its faces run long), with white flowers with gold middles on its top
  // and front, about one cell in `flowers` of its skin. Cells inside the plinth are left out, as nothing shows them.
  const inPlinth = (x, y, z) => z > PLINTH.back && (y < -FLOOR / 2 ? Math.abs(x) < PLINTH.lower.x && z < PLINTH.lower.z : y < 0 && Math.abs(x) < PLINTH.upper.x && z < PLINTH.upper.z);
  const clump = (g, rand, x, y, z, rx, ry, rz, flowers = 0) => {
    const cx = Math.round(x / LEAF), cy = Math.round(y / LEAF), cz = Math.round(z / LEAF), seed = Math.floor(rand() * 1e6);
    const nx = Math.ceil(rx / LEAF), ny = Math.ceil(ry / LEAF), nz = Math.ceil(rz / LEAF), mine = [];
    for (let i = -nx; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = -nz; k <= nz; k++) {
      const d = (i / nx) ** 2 + (j / ny) ** 2 + (k / nz) ** 2;
      if (d > 1 - hash(i >> 1, j >> 1, (k >> 1) + seed) * 0.34) continue;
      if (inPlinth((cx + i + 0.5) * LEAF, (cy + j + 0.5) * LEAF, (cz + k + 0.5) * LEAF)) continue;
      const shade = j / ny + (hash(i >> 2, j >> 1, (k >> 2) + seed) - 0.5) * 0.55;
      g.set(cx + i, cy + j, cz + k, T.leaves[shade > 0.62 ? 2 : shade > 0.25 ? 0 : 1]);
      mine.push([cx + i, cy + j, cz + k]);
    }
    if (!flowers) return;
    for (const [i, j, k] of mine) {
      if (rand() * flowers > 1) continue;
      if (!g.has(i, j + 1, k)) {
        g.set(i, j + 1, k, T.bloom);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.has(i + a, j + 1, k + b)) g.set(i + a, j + 1, k + b, T.petal);
      } else if (!g.has(i, j, k + 1)) {
        g.set(i, j, k + 1, T.bloom);
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.has(i + a, j + b, k + 1)) g.set(i + a, j + b, k + 1, T.petal);
      }
    }
  };

  // ---- rope ------------------------------------------------------------------------------------------------------
  // A rope sagging `sag` metres from a to b, in twelve-centimetre lengths of alternating twist.
  const rope = (out, a, b, sag, thick = 0.055) => {
    const n = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.12));
    for (let s = 0; s < n; s++) {
      const p = along(a, b, sag, s / n), q = along(a, b, sag, (s + 1) / n), dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
      const length = Math.hypot(dx, dy, dz) + thick * 0.5, flat = Math.hypot(dx, dz);
      const piece = turnedY(turnedZ(box({ w: length, h: thick, d: thick, color: s % 2 ? "#a8803f" : "#c9a063" }), Math.atan2(dy, flat)), Math.atan2(-dz, dx));
      out.push(moved(piece, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2));
    }
  };

  // ---- the plinth ------------------------------------------------------------------------------------------------
  // The plinth as the concept builds it: its stones and bricks as boxes on a grid of `MASON` cells (a thirty-second of
  // a metre), which the geometry names as its voxel grid so the renderer gives them block detail as it does voxels.
  // Two courses of mauve-grey stones half a metre deep, a little under a quarter metre tall and half a metre or so
  // long, with a cell of mortar between them and between their ends, which a dark core behind them shows; the upper
  // course's stones border the paving, whose warm bricks stand a cell proud of a bed of grout. It collides as the two
  // courses' plain boxes (`collisionGeometry`). Canvas 2D's painter's sort can't keep hundreds of small bricks above
  // one bed, so it draws the plinth in the stand's own voxels, in the same tones and without the joints (`plinthFlat`).
  const MASON = 1 / 32;
  const MASONRY = {
    stones: ["#a57b72", "#946a63", "#b08a84", "#86625d"], mortar: "#3b3236",
    bricks: ["#ad6a4b", "#9a5a40", "#bb7856", "#8c4f39"], worn: "#c88b6a", grout: "#4f342a"
  };
  const masonry = () => {
    const parts = [], m = (n) => n * MASON, Lo = PLINTH.lower, Up = PLINTH.upper, back = PLINTH.back, deep = PLINTH.border;
    const slab = (x0, x1, y0, y1, z0, z1, color) => parts.push(box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } }));
    // A stone: its edges cut a cell back and lit a little brighter, so each reads as its own chunky block.
    const stone = (x0, x1, y0, y1, z0, z1, color) => parts.push(bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel: MASON, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } }));
    // Stones laid along x or z from a to b, each 14 to 20 cells long with a cell of mortar after it, across c0 to c1
    // and up y0 to y1; each stone one of the stones' tones.
    const row = (along, a, b, c0, c1, y0, y1, seed) => {
      for (let at = a, n = 0; at < b - MASON; n++) {
        const length = Math.min(m(14 + Math.floor(hash(n, seed, 3) * 7)), b - at), color = MASONRY.stones[Math.floor(hash(n, seed, 5) * 4)];
        if (along === "x") stone(at, at + length, y0, y1, c0, c1, color);
        else stone(c0, c1, y0, y1, at, at + length, color);
        at += length + MASON;
      }
    };
    // The lower course, its top a cell under the upper's foot; the upper, its top the floor.
    for (const [c, y0, y1, seed] of [[Lo, m(-16), m(-9), 1], [Up, m(-8), 0, 2]]) {
      row("x", -c.x, c.x, c.z - deep, c.z, y0, y1, seed);
      for (const s of [-1, 1]) row("z", back, c.z - deep - MASON, s > 0 ? c.x - deep : -c.x, s > 0 ? c.x : -c.x + deep, y0, y1, seed * 10 + s);
    }
    // The cores the mortar shows, a cell in from the stones' faces and tops; the grout bed, and its bricks: ten cells by
    // six, a cell of grout round each, each row half a brick on from the last, cut at the border, none under the deck.
    slab(-Lo.x + MASON, Lo.x - MASON, m(-16), m(-10), back, Lo.z - MASON, MASONRY.mortar);
    slab(-Up.x + MASON, Up.x - MASON, m(-10), m(-2), back, Up.z - MASON, MASONRY.mortar);
    const px = Up.x - deep, pz = Up.z - deep;
    slab(-px, px, m(-2), m(-1), back, pz, MASONRY.grout);
    for (let z1 = pz - MASON, r = 0; z1 - m(6) > back; z1 -= m(7), r++) {
      for (let x0 = -px + MASON - (r & 1 ? m(5) : 0), n = 0; x0 < px - MASON; x0 += m(11), n++) {
        const a = Math.max(x0, -px + MASON), b = Math.min(x0 + m(10), px - MASON), z0 = z1 - m(6);
        if (b - a < m(2) || (z0 < 1.125 && b > -1.875 && a < 1.875)) continue;
        const pick = hash(n, r, 41);
        slab(a, b, m(-1), 0, z0, z1, pick < 0.08 ? MASONRY.worn : MASONRY.bricks[Math.floor(hash(n, r, 43) * 4)]);
      }
    }
    const geo = merge(...parts);
    geo.voxel = new Float32Array([MASON, 0, 0, 0]);
    geo.collisionGeometry = merge(
      box({ w: Lo.x * 2, h: 0.25, d: Lo.z - back, color: MASONRY.mortar, offset: { x: 0, y: -0.375, z: (Lo.z + back) / 2 } }),
      box({ w: Up.x * 2, h: 0.25, d: Up.z - back, color: MASONRY.mortar, offset: { x: 0, y: -0.125, z: (Up.z + back) / 2 } }));
    return geo;
  };
  // Canvas 2D's plinth, in the ground's cells below the floor: two courses of stone blocks four cells long and deep
  // and two tall, each block one stone's tone and each course's joints half a block on from the one below, the upper
  // set back a quarter metre; and in its top, inside a border of the same stone, a paving of bricks two cells long,
  // each row half a brick on from the last.
  const plinthFlat = cached(() => {
    const p = makeVox(), rear = Math.round(PLINTH.back / PX);
    const course = (half, front, j0, stagger) => {
      for (let i = -Math.round(half / PX); i < Math.round(half / PX); i++) for (let k = rear; k < Math.round(front / PX); k++) for (let j = j0; j < j0 + 2; j++)
        p.set(i, j, k, T.stones[Math.floor(hash(Math.floor((i + stagger) / 4), Math.floor((k + stagger) / 4), j0) * 4)]);
    };
    course(PLINTH.lower.x, PLINTH.lower.z, -4, 0);
    course(PLINTH.upper.x, PLINTH.upper.z, -2, 2);
    const px = Math.round((PLINTH.upper.x - PLINTH.border) / PX), pz = Math.round((PLINTH.upper.z - PLINTH.border) / PX);
    for (let i = -px; i < px; i++) for (let k = rear; k < pz; k++) p.set(i, -1, k, T.bricks[Math.floor(hash(Math.floor((i + (k & 1)) / 2), k, 9) * 4)]);
    return voxGeo(p, ZERO);
  });

  // ---- the stand -------------------------------------------------------------------------------------------------
  // What stands on the ground and grows round the stand, cached on its own so the hub can build it in a slice of its
  // own before the booth: the plinth's masonry, and the greenery.
  const ground = cached(() => {
    // The greenery: on the boards' caps (clear of the crown), at the sign's top corners among the rockets and its
    // foot, at the corner posts' tops and up their fronts, on the paving by the crates, and at the plinth's front
    // corners and sides, most of it in flower.
    const g = makeVox(), leafy = mulberry32(77);
    for (const s of [-1, 1]) {
      clump(g, leafy, s * 3.65, 3.5, 0.3, 0.4, 0.32, 0.34, 16);
      clump(g, leafy, s * 2.12, 3.5, 0.3, 0.36, 0.28, 0.3, s < 0 ? 16 : 0);
      if (s < 0) clump(g, leafy, -2.85, 3.5, 0.3, 0.3, 0.2, 0.26, 0);
      clump(g, leafy, s * 2.2, 4.25, 1.18, 0.38, 0.3, 0.22, 16);
      clump(g, leafy, s * 2.42, 3.0, 1.26, 0.22, 0.26, 0.16, 0);
      clump(g, leafy, s * CORNER_X, 5.125, 0.25, 0.24, 0.18, 0.2, 0);
      // Up the corner posts' fronts, a few tufts.
      for (const [y, r] of [[3.6, 0.16], [4.05, 0.13], [4.45, 0.15]]) clump(g, leafy, s * (CORNER_X + 0.03), y, 0.42, r, r * 0.9, 0.1, 0);
      clump(g, leafy, s * 2.75, 0, 2.55, 0.36, 0.3, 0.3, 12);
      clump(g, leafy, s * 4.55, -FLOOR, 3.68, 0.52, 0.48, 0.42, 12);
      clump(g, leafy, s * 4.7, -FLOOR, 1.6, 0.36, 0.4, 0.45, 12);
    }
    return { plinth: masonry(), leaves: voxGeo(g, ZERO, LEAF) };
  });
  const build = cached(() => {
    const v = makeVox(), rand = mulberry32(2140), iron = [], cloth = [], swing = [], marks = [], glow = [], lamps = [], dark = [], bundles = [];

    // The deck the booth stands on, and the merchant counter on it: vertical planks, a top that runs out over them, and
    // a recess in its front for the painted cloth.
    timber(v, rand, -1.875, 1.875, 0, 0.25, -1.75, 1.125, "x");
    timber(v, rand, -1.5, 1.5, 0.25, 1.125, 0.375, 0.875, "y");
    timber(v, rand, -1.625, 1.625, 1.125, 1.25, 0.25, 1.0, "x");
    fill(v, -1.625, 1.625, 1.125, 1.25, 0.875, 1.0, T.trim);
    carve(v, -0.625, 0.625, 0.375, 1.0, 0.75, 0.875);
    // The booth's sides, planked to the counter's height, so it reads as a stall and not a frame.
    for (const sx of [-1, 1]) timber(v, rand, sx > 0 ? 1.5 : -1.625, sx > 0 ? 1.625 : -1.5, 0.25, 1.25, -1.625, 0.875, "z");
    // The back wall, and two shelves on it.
    timber(v, rand, -1.75, 1.75, 0.25, 2.875, -1.75, -1.625, "y");
    for (const y of [1.375, 2.0]) timber(v, rand, -1.5, 1.5, y, y + 0.125, -1.625, -1.25, "x");
    // The front posts run up behind the sign and hold it, with a beam between them; the booth's back stands under the
    // rock inside the cave's opening, so it needs no back posts.
    for (const s of [-1, 1]) timber(v, rand, s > 0 ? 1.5 : -1.75, s > 0 ? 1.75 : -1.5, 0.25, 4.375, 0.875, 1.125, "y");
    timber(v, rand, -1.5, 1.5, 2.375, 2.5, 0.875, 1.125, "x");
    // The sign: a board of planks with a dark rim, in front of the posts; the tagline's plank under it.
    timber(v, rand, -2.375, 2.375, 3.125, 4.25, 1.125, 1.375, "x");
    fill(v, -2.375, 2.375, 3.125, 3.25, 1.125, 1.375, T.trim);
    fill(v, -2.375, 2.375, 4.125, 4.25, 1.125, 1.375, T.trim);
    fill(v, -2.375, -2.25, 3.125, 4.25, 1.125, 1.375, T.trim);
    fill(v, 2.25, 2.375, 3.125, 4.25, 1.125, 1.375, T.trim);
    timber(v, rand, -1.5, 1.5, 2.625, 3.0, 1.375, 1.5, "x");
    fill(v, -1.5, 1.5, 2.625, 3.0, 1.375, 1.5, (i, j, k) => (i + j) % 7 === 0 ? GRAIN : T.trim);
    // The palisade the rockets stand before: three stakes behind the sign, between them, the middle one the tallest.
    for (const x of [-1.125, 0, 1.125]) timber(v, rand, x - 0.125, x + 0.125, 3.125, x ? 4.75 : 5.0, 0.875, 1.125, "y");
    // The boards either side, each in a heavy frame with its face from the counter's height up: two posts a quarter
    // metre square, rails above and below the dark face, and a deep cap that runs out over the posts, which the
    // greenery grows on.
    for (const s of [-1, 1]) {
      const cx = s * BOARD_X;
      for (const px0 of [cx - 1.0, cx + 0.75]) timber(v, rand, px0, px0 + 0.25, 0, 3.375, 0.125, 0.5, "y");
      timber(v, rand, cx - 0.75, cx + 0.75, 0.875, 1.125, 0.25, 0.5, "x");
      timber(v, rand, cx - 0.75, cx + 0.75, 3.0, 3.25, 0.25, 0.5, "x");
      timber(v, rand, cx - 1.125, cx + 1.125, 3.25, 3.5, 0.0, 0.625, "x");
      fill(v, cx - 0.75, cx + 0.75, 1.125, 3.0, 0.25, 0.375, T.slate);
    }
    // The corner posts, past the boards' outer posts, to five metres, each with a finial, a lantern rope's hook at its
    // top and an arm the banner hangs from.
    for (const s of [-1, 1]) {
      timber(v, rand, s * CORNER_X - 0.125, s * CORNER_X + 0.125, 0, 5.0, 0.125, 0.375, "y");
      fill(v, s * CORNER_X - 0.125, s * CORNER_X + 0.125, 5.0, 5.125, 0.125, 0.375, T.trim);
      timber(v, rand, Math.min(s * CORNER_X, s * (CORNER_X + 0.875)), Math.max(s * CORNER_X, s * (CORNER_X + 0.875)), 4.75, 4.875, 0.125, 0.375, "x");
    }
    // The rope fence's posts, each on a stone footing, a dark cap on top.
    for (const [x, z, top] of LAYOUT.posts) {
      fill(v, x - 0.25, x + 0.25, 0, 0.25, z - 0.25, z + 0.25, (i, j, k) => T.stones[(i * 3 + k * 5 + j) & 3]);
      timber(v, rand, x - 0.125, x + 0.125, 0.25, top, z - 0.125, z + 0.125, "y");
      fill(v, x - 0.125, x + 0.125, top, top + 0.125, z - 0.125, z + 0.125, T.trim);
    }
    // The shelves' goods: boxes of fireworks in their paints with gold stars, and bundles of little rockets.
    const sb = (x, y, z, c) => starBox(v, cell(x, "x"), cell(y, "y"), cell(z, "z"), c);
    sb(-1.375, 1.5, -1.625, T.boxBlue); sb(-1.0, 1.5, -1.625, T.boxRed); sb(0.75, 1.5, -1.625, T.boxBlue);
    sb(-0.375, 2.125, -1.625, T.boxRed);
    bundleAt(bundles, 0.125, 1.5, -1.5, [T.red, T.blue, T.green, T.purple]);
    bundleAt(bundles, 0.5, 1.5, -1.5, [T.orange, T.purple, T.red, T.blue]);
    bundleAt(bundles, 1.25, 1.5, -1.5, [T.green, T.red, T.blue, T.orange]);
    bundleAt(bundles, -0.875, 2.125, -1.5, [T.purple, T.red, T.orange, T.blue]);
    bundleAt(bundles, 0.25, 2.125, -1.5, [T.green, T.red, T.purple, T.blue]);
    bundleAt(bundles, 0.625, 2.125, -1.5, [T.red, T.blue, T.orange, T.green]);
    // And on the counter's ends, either side of the vendor and the terminal.
    bundleAt(bundles, -1.5, 1.25, 0.375, [T.blue, T.red, T.purple, T.orange]);
    bundleAt(bundles, -1.25, 1.25, 0.5, [T.green, T.purple]);
    bundleAt(bundles, 1.25, 1.25, 0.375, [T.red, T.orange, T.blue, T.purple]);
    // Down front, on the paving, below the boards' faces: at the left a crate at the corner with a bundle on its outer
    // edge and a smaller one before it; at the right a crate by the counter and another at the corner, bundles on
    // their edges by the boards' posts.
    crate(v, -3.75, 0, 0.625, 5); crate(v, -2.875, 0, 1.375, 4);
    crate(v, 1.875, 0, 1.125, 5); crate(v, 3.25, 0, 0.625, 4);
    bundleAt(bundles, -3.75, 0.625, 0.875, [T.red, T.blue, T.purple, T.green]);
    bundleAt(bundles, 1.875, 0.625, 1.375, [T.red, T.green, T.blue, T.orange]);
    bundleAt(bundles, 3.5, 0.5, 0.75, [T.purple, T.red, T.orange, T.blue]);
    // Iron at the joints: plates where the front posts meet the counter's top, the beam and the sign; collars round the
    // fence posts' feet.
    for (const s of [-1, 1]) for (const y of [1.19, 2.44, 3.4, 4.0]) iron.push(moved(bevelBox({ w: 0.3, h: 0.22, d: 0.05, color: "#2c2e33", bevel: 0.012 }), s * 1.625, y, 1.15));
    for (const [x, z] of LAYOUT.posts) iron.push(moved(bevelBox({ w: 0.3, h: 0.08, d: 0.3, color: "#2c2e33", bevel: 0.01 }), x, 0.36, z));
    // The fence's lit posts: a lamp of glass between two iron plates on each, its own mesh (`lamps`) for the scene to
    // light at night.
    for (const [x, z, top, lit] of LAYOUT.posts) if (lit) {
      iron.push(moved(bevelBox({ w: 0.3, h: 0.05, d: 0.3, color: "#2c2e33", bevel: 0.01 }), x, top + 0.15, z));
      iron.push(moved(bevelBox({ w: 0.3, h: 0.05, d: 0.3, color: "#2c2e33", bevel: 0.01 }), x, top + 0.42, z));
      lamps.push(box({ w: 0.22, h: 0.22, d: 0.22, color: "#ffd66b", emissive: 1, offset: { x, y: top + 0.285, z } }));
    }

    // The canopy: red and white stripes from the cave rim's lintel down and out over the counter, and a scalloped
    // valance along its front edge.
    const back = { y: 2.95, z: -0.08 }, front = { y: 2.62, z: 1.32 }, run = Math.hypot(front.z - back.z, back.y - front.y), slope = Math.atan2(back.y - front.y, front.z - back.z);
    const stripes = 10, wide = 3.9 / stripes;
    for (let n = 0; n < stripes; n++) {
      const x = -1.95 + wide * (n + 0.5), color = n % 2 ? "#f4eee2" : "#d8342c";
      cloth.push(moved(turnedX(box({ w: wide + 0.005, h: 0.05, d: run, color }), slope), x, (back.y + front.y) / 2, (back.z + front.z) / 2));
      // A scallop under each stripe's front: a half-round of the same cloth.
      const scallop = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; scallop.push([Math.cos(a) * wide / 2, Math.sin(a) * 0.2]); }
      cloth.push(moved(prism(scallop, 0.04, n % 2 ? "#e7dfd0" : "#c22a23"), x, front.y - 0.01, front.z + 0.02));
    }
    // The ropes: the fence's between its posts, and the lantern ropes from the corner posts to the sign.
    for (const [a, b] of LAYOUT.fence) {
      const [ax, az, at] = LAYOUT.posts[a], [bx, bz, bt] = LAYOUT.posts[b];
      rope(cloth, [ax, at - 0.2, az], [bx, bt - 0.2, bz], 0.16);
    }
    for (const r of LAYOUT.ropes) rope(cloth, r.from, r.to, r.sag, 0.045);
    // The corner posts' banners: blue cloth hanging from each arm, its foot cut in four points, a gold sunburst on its
    // front (`marks`, its own mesh so Canvas 2D can sort it before the cloth); they rock in the wind (`swing`).
    for (const B of LAYOUT.banners) {
      swing.push(box({ w: 0.66, h: 1.05, d: 0.03, color: "#2238a8", offset: { x: B.x, y: B.y - 0.6, z: B.z } }));
      for (let k = 0; k < 4; k++) swing.push(moved(prism([[-0.33 + k * 0.165, 0], [-0.165 + k * 0.165, 0], [-0.2475 + k * 0.165, -0.13]], 0.03, "#2238a8"), B.x, B.y - 1.125, B.z));
      marks.push(moved(sprite(STAR, INKS.gold, 0, 0, 0, 0.065, 0.02, 0.8), B.x, B.y - 0.55, B.z + 0.027));
      swing.push(box({ w: 0.03, h: 0.14, d: 0.03, color: "#3a2412", offset: { x: B.x - 0.27, y: B.y + 0.02, z: B.z } }), box({ w: 0.03, h: 0.14, d: 0.03, color: "#3a2412", offset: { x: B.x + 0.27, y: B.y + 0.02, z: B.z } }));
    }
    // The shelves' starbursts, purple at the left and red at the right, standing on the lower shelf's ends.
    glow.push(sprite(STAR, INKS.purple, -1.15, 1.8, -1.2, 0.06, 0.03, 0.75), sprite(STAR, INKS.red, 1.15, 1.8, -1.2, 0.06, 0.03, 0.75));
    // The crates' painted bursts, on their fronts: red on the left's corner crate and the right's by the counter, gold
    // on the small one at the left.
    glow.push(sprite(STAR, INKS.red, -3.4375, 0.3125, 1.262, 0.05, 0.02, 0.35), sprite(STAR, INKS.gold, -2.625, 0.25, 1.887, 0.045, 0.02, 0.35), sprite(STAR, INKS.red, 2.1875, 0.3125, 1.762, 0.05, 0.02, 0.35));

    // The sign's letters, gold over a darker orange with a dark rim, and the tagline's in cream.
    // The lettering is its own pair of meshes, so Canvas 2D can sort it in front of the planks it stands on.
    const sign = letters("FIREWORKS", 0, 3.69, 1.375, 0.118, "#ffc61f", "#a8360a", 0.75);
    const tag = letters("LIGHT UP OBL", 0, 2.81, 1.5, 0.056, "#f6ecd2", "#2a1307", 0.6);
    const lettering = { face: noShadow(merge(sign.face, tag.face)), back: noShadow(merge(sign.back, tag.back)) };
    // TOP LAUNCHES' crown on its cap: a gold band, five points, red and blue jewels.
    const crownAt = { x: BOARD_X, y: 3.5, z: 0.31 };
    iron.push(moved(bevelBox({ w: 0.66, h: 0.16, d: 0.14, color: "#e0a81a", bevel: 0.02 }), crownAt.x, crownAt.y + 0.08, crownAt.z));
    for (let k = 0; k < 5; k++) {
      const x = -0.28 + k * 0.14, tall = k === 2 ? 0.3 : k % 2 ? 0.2 : 0.25;
      glow.push(moved(prism([[-0.06, 0], [0.06, 0], [0, tall]], 0.1, "#ffcf3f", 0.35), crownAt.x + x, crownAt.y + 0.16, crownAt.z));
      glow.push(moved(box({ w: 0.05, h: 0.05, d: 0.05, color: "#fff2b0", emissive: 0.6 }), crownAt.x + x, crownAt.y + 0.17 + tall, crownAt.z));
    }
    for (const [x, c] of [[-0.18, "#d8342c"], [0, "#2d5bd8"], [0.18, "#d8342c"]]) iron.push(moved(box({ w: 0.07, h: 0.07, d: 0.03, color: c, emissive: 0.4 }), crownAt.x + x, crownAt.y + 0.08, crownAt.z + 0.075));
    // The terminal on the counter, the stand's point of sale: a graphite base with an orange strip glowing along its
    // front; on it a sloped keypad of grey keys, a red, a yellow and two green down its right, a card slot along its
    // back; and on a neck behind, the head leaning back toward the buyer, its thick bezel lined in glowing orange round
    // the glass (a picture the scene lays), a status light at its corner and a receipt curling from a slot in its top.
    const S = LAYOUT.screen, top = 1.25, pad = { y: top + 0.075, z: 0.74, tilt: -0.22 };
    const onHead = (geo, x, y, z) => moved(turnedX(moved(geo, x, y, z), S.tilt), S.x, S.y, S.z);
    const onPad = (geo, x, y, z) => moved(turnedX(moved(geo, x, y, z), pad.tilt), S.x, pad.y, pad.z);
    iron.push(moved(bevelBox({ w: 0.6, h: 0.05, d: 0.44, color: "#2a2d33", bevel: 0.012 }), S.x, top + 0.025, 0.62));
    glow.push(box({ w: 0.6, h: 0.016, d: 0.008, color: "#f7931a", emissive: 0.6, offset: { x: S.x, y: top + 0.025, z: 0.844 } }));
    iron.push(onPad(bevelBox({ w: 0.44, h: 0.04, d: 0.18, color: "#33363d", bevel: 0.01 }), 0, 0, 0));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const color = c < 3 ? "#cfd3d8" : ["#d8342c", "#ffc21a", "#3fbf5f", "#3fbf5f"][r];
      iron.push(onPad(box({ w: c < 3 ? 0.08 : 0.07, h: 0.016, d: 0.03, color }), -0.155 + c * 0.1, 0.028, -0.06 + r * 0.04));
    }
    iron.push(onPad(box({ w: 0.3, h: 0.01, d: 0.012, color: "#0a0b0d" }), 0, 0.022, -0.078));
    iron.push(moved(bevelBox({ w: 0.14, h: 0.2, d: 0.08, color: "#24272c", bevel: 0.015 }), S.x, top + 0.14, 0.46));
    iron.push(onHead(bevelBox({ w: 0.72, h: 0.52, d: 0.09, color: "#1b1d22", bevel: 0.025 }), 0, 0, 0));
    iron.push(onHead(box({ w: S.w + 0.05, h: S.h + 0.05, d: 0.004, color: "#f7931a", emissive: 0.7 }), 0, 0, S.face - 0.004));
    glow.push(onHead(box({ w: 0.03, h: 0.03, d: 0.01, color: "#3dff6e", emissive: 1 }), 0.3, 0.225, 0.047));
    iron.push(onHead(box({ w: 0.2, h: 0.012, d: 0.024, color: "#0a0b0d" }), 0, 0.262, 0));
    iron.push(onHead(box({ w: 0.14, h: 0.1, d: 0.004, color: "#f4f1e8" }), 0, 0.31, 0.004));
    iron.push(onHead(moved(turnedX(box({ w: 0.14, h: 0.07, d: 0.004, color: "#f4f1e8" }), 0.8), 0, 0.025, 0.012), 0, 0.36, 0.004));
    // The cloth's frame in the counter's recess, dark, so the picture sits in it.
    dark.push(box({ w: LAYOUT.cloth.w + 0.06, h: LAYOUT.cloth.h + 0.06, d: 0.02, color: "#2a1307", offset: { x: 0, y: LAYOUT.cloth.y, z: LAYOUT.cloth.z - 0.012 } }));

    // Marquee bulbs round the sign, every quarter metre, in three groups the scene lights in turn so they chase.
    const bulbs = [[], [], []], rim = [];
    for (let x = -2.25; x <= 2.251; x += 0.25) rim.push([x, 4.19], [x, 3.185]);
    for (let y = 3.435; y <= 3.94; y += 0.25) rim.push([-2.315, y], [2.315, y]);
    rim.sort((a, b) => Math.atan2(a[1] - 3.69, a[0]) - Math.atan2(b[1] - 3.69, b[0]));
    rim.forEach(([x, y], n) => {
      bulbs[n % 3].push(box({ w: 0.075, h: 0.075, d: 0.05, color: "#fff1c2", emissive: 1, offset: { x, y, z: 1.4 } }));
      dark.push(box({ w: 0.1, h: 0.1, d: 0.02, color: "#3a2412", offset: { x, y, z: 1.38 } }));
    });
    const menuBoard = boardGeometry("menu"), launchBoard = boardGeometry("launches");
    return {
      bulbs: bulbs.map((list) => noShadow(merge(...list))), lettering,
      // Canvas 2D's lettering: [picture, its middle], the scene lays each as a cut-out.
      letterPictures: [[letterPicture("FIREWORKS", 0.118, "#ffc61f", "#a8360a"), [0, 3.69 + 0, 1.42]], [letterPicture("LIGHT UP OBL", 0.056, "#f6ecd2", "#2a1307"), [0, 2.81, 1.53]]],
      ...ground(), timber: voxGeo(v), iron: merge(...iron), cloth: merge(...cloth), dark: merge(...dark),
      swing: Object.assign(noShadow(merge(...swing)), { swing: 1 }), marks: Object.assign(noShadow(merge(...marks)), { swing: 1 }), glow: noShadow(merge(...glow)), lamps: noShadow(merge(...lamps)), bundles: merge(...bundles),
      boards: merge(menuBoard.main, launchBoard.main), boardsFourth: launchBoard.fourth
    };
  });
  // A bundle of little rockets two cells square with its near left corner at (x, y, z) metres: standing two by two,
  // their colours in turn, their heights and stripes varied, and a fifth, the tallest, in the middle of four; into
  // `out`, the bundles' one mesh.
  const bundleAt = (out, x, y, z, colors) => {
    colors.forEach((c, n) => out.push(littleRocket(x + PX / 2 + (n % 2) * PX, y, z + PX / 2 + Math.floor(n / 2) * PX, c, n % 3, (n + colors.length) % 3)));
    if (colors.length === 4) out.push(littleRocket(x + PX, y, z + PX, colors[2], 3, 0));
  };

  // The vendor's straw hat, for the hat anchor of an Ooga's head: a wide brim and a crown with a red band.
  const strawHat = cached(() => merge(
    lathe({ profile: [[0.0, 0.0], [0.62, 0.0], [0.66, 0.04], [0.5, 0.06], [0.34, 0.08]], segments: 10, color: "#e2b553" }),
    lathe({ profile: [[0.34, 0.06], [0.33, 0.2], [0.3, 0.34], [0.0, 0.36]], segments: 10, color: "#d9a843" }),
    lathe({ profile: [[0.345, 0.07], [0.345, 0.13], [0.0, 0.13]], segments: 10, color: "#c8342a" })
  ));

  // ---- pictures ----------------------------------------------------------------------------------------------------
  // A canvas on a face `w` by `h` metres about the origin, facing +z, glowing `glow`; a fresh geometry each repaint,
  // since the renderer uploads a picture once per geometry.
  const pictureFace = (canvas, w, h, glow = 0.85, cutout = false) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const face = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: glow }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h] };
    if (cutout) face.imageSurface.cutout = true;
    return face;
  };
  const canvasOf = (canvas, w, h) => {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    return g;
  };
  // Each firework's icon, drawn into a square `s` pixels across at (x, y): the Pop a burst of colour, the Bolt a
  // lightning bolt, the Mega a ₿ coin, the show pack three small bursts.
  const BURST = ["....#....", ".#..#..#.", "..#.#.#..", "...###...", "####@####", "...###...", "..#.#.#..", ".#..#..#.", "....#...."];
  const pix = (g, rows, ink, x, y, s) => {
    const n = rows.length, c = s / n;
    for (let r = 0; r < n; r++) for (let q = 0; q < rows[r].length; q++) {
      const ch = rows[r][q];
      if (ch === ".") continue;
      g.fillStyle = ink[ch];
      g.fillRect(Math.round(x + q * c), Math.round(y + r * c), Math.ceil(c), Math.ceil(c));
    }
  };
  const icon = (g, kind, x, y, s) => {
    g.fillStyle = "#0c0f14";
    g.fillRect(x, y, s, s);
    g.strokeStyle = "#3a2c1a";
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
    const m = s * 0.12, inner = s - 2 * m;
    if (kind === "pop") pix(g, BURST, { "#": "#d65cff", "@": "#ffe9ff" }, x + m, y + m, inner);
    else if (kind === "bolt") pix(g, ["...##", "..##.", ".##..", "#####", "..##.", ".##..", "##..."], { "#": "#57c7ff" }, x + m * 1.4, y + m, inner * 0.8);
    else if (kind === "mega") K().coin(g, x + s / 2, y + s / 2, inner / 2);
    else {
      pix(g, BURST, { "#": "#ffc21a", "@": "#fff2b0" }, x + m, y + m, inner * 0.55);
      pix(g, BURST, { "#": "#57c7ff", "@": "#e8f8ff" }, x + s * 0.45, y + s * 0.2, inner * 0.5);
      pix(g, BURST, { "#": "#d65cff", "@": "#ffe9ff" }, x + s * 0.3, y + s * 0.5, inner * 0.45);
    }
  };
  const K = () => BL.factoryKiosk.kit;
  const frame = (g, W, H) => {
    const { INK } = K();
    g.fillStyle = "#16110d";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "#6e5532";
    g.lineWidth = 4;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.strokeStyle = INK.gold;
    g.lineWidth = 2;
    g.strokeRect(12, 12, W - 24, H - 24);
  };
  // The boards' layout, in their pictures' pixels: the header plaque [x0, y0, x1, y1]; each board's rows (the first's
  // top, the step to the next, a row's height) with its icon's frame [x, y in the row, side] and the menu's play
  // button [x, y in the row, side]. The geometry is placed from it (`boardGeometry`), so the two stay together.
  const MENU_W = 440, MENU_H = 552;
  const BOARD_PX = {
    plaque: [18, 14, 422, 92],
    menu: { y: 108, step: 132, h: 120, rows: 3, icon: [32, 14, 92], button: [340, 26, 68] },
    launches: { y: 104, step: 100, h: 90, rows: 4, icon: [64, 15, 60] }
  };
  const PANEL = "#211913", PANEL_FIRST = "#2a2014";
  // The BUY A FIREWORK row a point on the menu's picture (pixels) lies in, or -1 off the rows.
  const menuRowAt = (px, py) => {
    const R = BOARD_PX.menu, n = Math.floor((py - R.y) / R.step);
    return px >= 22 && px <= MENU_W - 22 && n >= 0 && n < R.rows && py - R.y - n * R.step <= R.h ? n : -1;
  };
  // A play button's triangle in a square `s` across at (x, y).
  const playMark = (g, x, y, s) => {
    g.beginPath();
    g.moveTo(x + s * 0.32, y + s * 0.22); g.lineTo(x + s * 0.74, y + s * 0.5); g.lineTo(x + s * 0.32, y + s * 0.78); g.closePath();
    g.fill();
  };
  // BUY A FIREWORK: each of `items`, `[{ id, name, price }]` (the price in sats, or null while it can't be bought),
  // with its icon and a gold play button, and how to buy under them. `note` replaces that line (SIGN IN TO BUY). With
  // `cutout` it paints only the lettering and icons on a clear ground, for the board, whose plaque, panels and buttons
  // are geometry; without, the whole face. `text: false` leaves the lettering out, for a board whose lettering is
  // raised letters (`boardText`).
  const menuFace = (canvas, items, note = "", cutout = false, text = true) => {
    const g = canvasOf(canvas, MENU_W, MENU_H), { INK, writeFit, sats } = K(), R = BOARD_PX.menu, [ix, iy, is] = R.icon, [bx, by, bs] = R.button;
    if (cutout) g.clearRect(0, 0, MENU_W, MENU_H);
    else frame(g, MENU_W, MENU_H);
    if (text) writeFit(g, "BUY A FIREWORK", MENU_W / 2, 39, 4, INK.gold, MENU_W - 60, "center");
    for (let n = 0; n < items.length && n < R.rows; n++) {
      const it = items[n], top = R.y + n * R.step;
      if (!cutout) {
        g.fillStyle = PANEL; g.fillRect(22, top, MENU_W - 44, R.h);
        g.fillStyle = INK.gold; g.fillRect(bx, top + by, bs, bs);
        g.fillStyle = INK.dark; playMark(g, bx, top + by, bs);
      }
      icon(g, it.id, ix, top + iy, is);
      if (!text) continue;
      writeFit(g, it.name, 136, top + 22, 3, INK.white, 196);
      writeFit(g, it.price === null ? "CLOSED" : `${sats(it.price)} SATS`, 136, top + 66, 4, it.price === null ? INK.dim : INK.gold, 196);
    }
    if (text) writeFit(g, note || "AT THE COUNTER: SPACE OR TAP", MENU_W / 2, MENU_H - 38, 2, note ? INK.amber : INK.dim, MENU_W - 60, "center");
  };
  // TOP LAUNCHES over the last `days` days: each of `rows`, `[{ id, name, count }]`, ranked, with its icon and count.
  // `cutout` and `text` as for the menu.
  const launchesFace = (canvas, rows, days = 7, cutout = false, text = true) => {
    const g = canvasOf(canvas, MENU_W, MENU_H), { INK, write, writeFit, sats } = K(), R = BOARD_PX.launches, [ix, iy, is] = R.icon;
    if (cutout) g.clearRect(0, 0, MENU_W, MENU_H);
    else frame(g, MENU_W, MENU_H);
    if (text) {
      writeFit(g, "TOP LAUNCHES", MENU_W / 2, 26, 4, INK.gold, MENU_W - 60, "center");
      write(g, `LAST ${days} DAYS`, MENU_W / 2, 64, 2, INK.dim, "center");
    }
    for (let n = 0; n < rows.length && n < R.rows; n++) {
      const r = rows[n], top = R.y + n * R.step;
      if (!cutout) { g.fillStyle = n === 0 ? PANEL_FIRST : PANEL; g.fillRect(22, top, MENU_W - 44, R.h); }
      icon(g, r.id, ix, top + iy, is);
      if (!text) continue;
      write(g, String(n + 1), 38, top + 31, 4, n === 0 ? INK.gold : INK.white);
      writeFit(g, r.name, 136, top + 38, 2, INK.white, 170);
      write(g, sats(r.count), MENU_W - 34, top + 35, 3, n === 0 ? INK.gold : INK.white, "right");
    }
    if (text && !rows.some((r) => r.count > 0)) writeFit(g, "BE THE FIRST TO LIGHT ONE UP", MENU_W / 2, MENU_H - 38, 2, INK.amber, MENU_W - 60, "center");
  };
  // A board's lettering as raised letters, as the sign's are, for WebGL: they stay crisp from across the island where
  // a picture's thin lettering blurs. `kind` and the rows as for the painters (`data`: the menu's `{ items, note }`,
  // TOP LAUNCHES' `{ rows, days }`), laid in the same places on the panels and plaque. Each line is as big as its room
  // allows up to its size; the sign's font has no comma or middle dot, so those become a stop and a dash.
  const BOARD_INK = { gold: ["#ffc61f", "#a8360a", 0.75], white: ["#f6ecd2", "#2a1307", 0.55], dim: ["#a99c84", "#2a1307", 0.35], amber: ["#ffb347", "#5a2a08", 0.6] };
  // The board's letters, lighter than the sign's for their number: each glyph's runs of cells, a run the same in rows
  // after it merged into one taller block, each block a box without its hidden back and a shadow of its front alone,
  // set down and right of it as the sign's are. Into `out`.
  const boardLetters = (out, text, x, y, z, size, color, shadow, glow) => {
    const G = BL.hubModels.SIGN_GLYPHS, deep = size * 0.42, gap = size * 0.18;
    const only = (geo, keep) => { const v = geo.verts; geo.faces = geo.faces.filter((f) => keep(f.i.map((i) => v[i * 3 + 2]))); return geo; };
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : G[ch][0].length + 1;
    let cursor = x - cells * size / 2;
    for (const ch of text) {
      if (ch === " ") { cursor += size * 2; continue; }
      const g = G[ch], open = new Map();
      const emit = ({ r0, r1, c, n }) => {
        const cx = cursor + (c + n / 2) * size, cy = y + (2 - (r0 + r1) / 2) * size, h = (r1 - r0 + 1) * size;
        const front = z + gap + deep, back = z + gap;
        out.push(only(box({ w: size * n - size * 0.06, h: h - size * 0.06, d: deep, color, emissive: glow, offset: { x: cx, y: cy, z: (front + back) / 2 } }), (zs) => zs.some((q) => q > back + 1e-9)));
        out.push(only(box({ w: size * n, h, d: gap * 0.6, color: shadow, offset: { x: cx + size * 0.22, y: cy - size * 0.22, z: z + gap * 0.3 } }), (zs) => zs.every((q) => q > z + gap * 0.3)));
      };
      for (let r = 0; r < g.length; r++) {
        const seen = new Set();
        for (let c = 0; c < g[r].length; c++) {
          if (g[r][c] !== "1") continue;
          let n = 1;
          while (g[r][c + n] === "1") n++;
          const key = c * 16 + n, run = open.get(key);
          if (run && run.r1 === r - 1) run.r1 = r;
          else { if (run) emit(run); open.set(key, { r0: r, r1: r, c, n }); }
          seen.add(key);
          c += n - 1;
        }
        for (const [key, run] of open) if (!seen.has(key) && run.r1 === r - 1) { emit(run); open.delete(key); }
      }
      for (const run of open.values()) emit(run);
      cursor += size * (g[0].length + 1);
    }
  };
  const boardText = (kind, data) => {
    const G = BL.hubModels.SIGN_GLYPHS, B = LAYOUT[kind], kx = B.w / MENU_W, ky = B.h / MENU_H, face = [];
    const X = (px) => B.x - B.w / 2 + px * kx, Y = (py) => B.y + B.h / 2 - py * ky;
    const clean = (t) => [...String(t)].map((c) => c === " " || G[c] ? c : c === "," ? "." : c === "·" ? "-" : c === ":" ? " " : " ").join("").replace(/ +/g, " ").trim();
    const cells = (t) => { let n = -1; for (const c of t) n += c === " " ? 2 : G[c][0].length + 1; return n; };
    // `text` at (px, py) in the picture's pixels, its line's middle; `align` left, center or right; the cell size
    // `size` metres at most, less if `room` pixels is too narrow.
    const line = (t, px, py, size, room, ink, align = "left") => {
      t = clean(t);
      if (!t) return;
      const n = cells(t), s = Math.min(size, room * kx / n), w = n * s, [color, shadow, glow] = BOARD_INK[ink];
      const x = align === "left" ? X(px) + w / 2 : align === "right" ? X(px) - w / 2 : X(px);
      boardLetters(face, t, x, Y(py), 0.41, s, color, shadow, glow);
    };
    if (kind === "menu") {
      const R = BOARD_PX.menu;
      line("BUY A FIREWORK", MENU_W / 2, 53, 0.024, 360, "gold", "center");
      data.items.slice(0, R.rows).forEach((it, n) => {
        const top = R.y + n * R.step;
        line(it.name, 136, top + 32, 0.016, 196, "white");
        line(it.price === null ? "CLOSED" : `${it.price.toLocaleString("en-US")} SATS`, 136, top + 82, 0.021, 196, it.price === null ? "dim" : "gold");
      });
      line(data.note || "AT THE COUNTER: SPACE OR TAP", MENU_W / 2, MENU_H - 30, 0.01, 400, data.note ? "amber" : "dim", "center");
    } else {
      const R = BOARD_PX.launches;
      line("TOP LAUNCHES", MENU_W / 2, 44, 0.024, 360, "gold", "center");
      line(`LAST ${data.days} DAYS`, MENU_W / 2, 80, 0.008, 200, "dim", "center");
      data.rows.slice(0, R.rows).forEach((r, n) => {
        const top = R.y + n * R.step;
        line(String(n + 1), 40, top + R.h / 2, 0.022, 30, n === 0 ? "gold" : "white", "center");
        line(r.name, 136, top + R.h / 2, 0.016, 172, "white");
        line(r.count.toLocaleString("en-US"), MENU_W - 32, top + R.h / 2, 0.02, 90, n === 0 ? "gold" : "white", "right");
      });
      if (!data.rows.some((r) => r.count > 0)) line("BE THE FIRST TO LIGHT ONE UP", MENU_W / 2, MENU_H - 30, 0.01, 400, "amber", "center");
    }
    return noShadow(merge(...face));
  };
  // A board's geometry, after the concept: on its dark face a header plaque on a gold rim with a brass stud at each
  // corner, a raised dark panel for each row (TOP LAUNCHES' first a little warmer), a raised frame round each row's
  // icon, and on the menu a raised gold play button with its triangle. The lettering and icons are its picture, laid
  // just in front of the panels and plaque (`LAYOUT.menu.z`), so the frames, studs and buttons stand through it.
  // `kind` is "menu" or "launches"; TOP LAUNCHES' fourth row, which shows only once the show pack has launches, is its
  // own mesh (`fourth`) for the scene to show and hide.
  const boardGeometry = (kind) => {
    const B = LAYOUT[kind], R = BOARD_PX[kind], kx = B.w / MENU_W, ky = B.h / MENU_H, parts = [], fourth = [];
    const X = (px) => B.x - B.w / 2 + px * kx, Y = (py) => B.y + B.h / 2 - py * ky;
    const rect = (x0, y0, x1, y1) => ({ x: (X(x0) + X(x1)) / 2, y: (Y(y0) + Y(y1)) / 2, w: (x1 - x0) * kx, h: (y1 - y0) * ky });
    const block = (out, r, z0, z1, color, bevel, emissive = 0) => out.push(bevelBox({ w: r.w, h: r.h, d: z1 - z0, color, emissive, bevel, offset: { x: r.x, y: r.y, z: (z0 + z1) / 2 } }));
    const plaque = rect(...BOARD_PX.plaque);
    block(parts, { ...plaque, w: plaque.w + 0.04, h: plaque.h + 0.04 }, 0.375, 0.392, "#c9971c", 0.006, 0.3);
    block(parts, plaque, 0.38, 0.41, "#17110c", 0.01);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(bevelBox({ w: 0.035, h: 0.035, d: 0.02, color: "#e0a81a", emissive: 0.25, bevel: 0.008, offset: { x: plaque.x + sx * (plaque.w / 2 - 0.035), y: plaque.y + sy * (plaque.h / 2 - 0.035), z: 0.42 } }));
    const [ix, iy, is] = R.icon, bar = 6;
    for (let n = 0; n < R.rows; n++) {
      const out = n === 3 ? fourth : parts, top = R.y + n * R.step;
      block(out, rect(22, top, MENU_W - 22, top + R.h), 0.378, 0.405, kind === "launches" && n === 0 ? PANEL_FIRST : PANEL, 0.008);
      for (const [a, b, c, d] of [[ix - bar, top + iy - bar, ix + is + bar, top + iy], [ix - bar, top + iy + is, ix + is + bar, top + iy + is + bar], [ix - bar, top + iy, ix, top + iy + is], [ix + is, top + iy, ix + is + bar, top + iy + is]])
        block(out, rect(a, b, c, d), 0.4, 0.425, "#6e5532", 0.004);
      if (R.button) {
        const [bx, by, bs] = R.button, button = rect(bx, top + by, bx + bs, top + by + bs);
        block(out, button, 0.38, 0.432, "#ffc21a", 0.012, 0.35);
        // Wound so its face looks out of the button.
        const tri = [[0.32, 0.78], [0.74, 0.5], [0.32, 0.22]].map(([u, v]) => [(u - 0.5) * button.w, (0.5 - v) * button.h]);
        out.push(moved(prism(tri, 0.012, "#16110d"), button.x, button.y, 0.438));
      }
    }
    return { main: merge(...parts), fourth: fourth.length ? merge(...fourth) : null };
  };
  // The cloth in the counter's front: the island under a burst over the Sphere, on parchment, in big pixels.
  const clothCanvas = cached(() => {
    const c = document.createElement("canvas"), W = 96, H = 48, g = canvasOf(c, W, H);
    g.fillStyle = "#e9dcb8"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#cdbb8e"; for (let x = 0; x < W; x += 2) g.fillRect(x, H - 2 - (x % 4 ? 0 : 1), 1, 1);
    g.fillStyle = "#3d74c4"; g.fillRect(4, 33, W - 8, 9);
    g.fillStyle = "#5f97de"; for (let x = 6; x < W - 6; x += 7) g.fillRect(x, 35 + (x % 3), 4, 1);
    g.fillStyle = "#3e8a3a"; g.fillRect(18, 27, 52, 7); g.fillRect(24, 23, 38, 5); g.fillRect(30, 20, 24, 4);
    g.fillStyle = "#6fbf4a"; g.fillRect(26, 24, 6, 2); g.fillRect(44, 21, 8, 2);
    g.fillStyle = "#f7931a"; g.fillRect(66, 21, 10, 10); g.fillRect(64, 23, 14, 6);
    g.fillStyle = "#ffd24a"; g.fillRect(68, 23, 3, 3);
    pix(g, BURST, { "#": "#d8342c", "@": "#ffc21a" }, 34, 3, 16);
    pix(g, BURST, { "#": "#2d5bd8", "@": "#ffffff" }, 58, 5, 11);
    g.strokeStyle = "#8a6a3a"; g.lineWidth = 1; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    return c;
  });
  // The terminal's glass: a bolt and BUY over the dark, the glow that says where to buy.
  const screenCanvas = cached(() => {
    const c = document.createElement("canvas"), W = 144, H = 96, g = canvasOf(c, W, H), { INK, write } = K();
    g.fillStyle = "#0b1016"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "#2a3440"; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8);
    pix(g, ["...##", "..##.", ".##..", "#####", "..##.", ".##..", "##..."], { "#": INK.gold }, 14, 18, 58);
    write(g, "BUY", 104, 26, 4, INK.gold, "center");
    write(g, "HERE", 104, 60, 3, INK.white, "center");
    return c;
  });

  BL.standModels = { PX, LAYOUT, ground, plinthFlat, build, star, rockets, strawHat, pictureFace, menuFace, launchesFace, boardText, menuRowAt, clothCanvas, screenCanvas, MENU_W, MENU_H };
})();
