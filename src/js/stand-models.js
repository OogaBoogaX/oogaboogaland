// The firework stand's models and pictures, for the hub's wall at the sealed cave beside the Timechain Sphere's stairs.
// A small attraction, readable from across the island: a timber booth on a deck with a merchant counter and the stand's
// terminal on it, shelves of firework boxes behind, a red and white striped canopy with a scalloped valance and
// bunting, the big gold FIREWORKS sign with LIGHT UP OBL under it and four oversized rockets standing on it, gold
// starbursts round it, and a board either side: BUY A FIREWORK on the left with each firework's icon, name and price,
// and TOP LAUNCHES on the right under a gold crown. It stands on a plinth of two stone courses with a paving of bricks,
// its floor half a metre up. Tall posts at its outer corners fly blue sunburst banners and string lantern ropes to the
// sign. The boards stand in heavy frames, their faces from the counter's height up. Its timber is voxels an eighth of a
// metre across (`PX`) with the grain running along each beam, as the Factory's kiosk and board are built, so the
// renderer's block detail gives it the same pixel texture; the plinth's stones and bricks are voxels too; cloth, rope,
// letters, stars and pictures stay smooth. The lettering and the marquee are meshes of their own, for Canvas 2D's
// `depthBias` (the scene sets it) to sort them in front of the sign's planks.
//
// Everything is in the stand's own frame: x to the visitor's right as they face it, y up from its floor (the plinth's
// top, `LAYOUT.floor` over the ground), +z out of its front. `LAYOUT` places what the scene hangs and uses (where a
// visitor stands to buy, the terminal, the vendor, the lanterns, the stars, the rocket tips the sparks come from, the
// boards' faces). `ground()` (the plinth) and `build()` (all of it, the ground's too) are cached per visit's scope, as
// every builder is. The painters (`menuFace`, `launchesFace`) draw the two boards in the Factory kiosk's letters
// (factory-kiosk.js `kit`), and `pictureFace` lays a canvas on a face the renderer uploads once.
(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry, box, bevelBox, merge, moved, turnedX, turnedY, turnedZ, prism, lathe, noShadow, cached } = BL.models;
  const { mulberry32 } = BL.math;

  const PX = 0.125, FROM = { x: -4.5, y: -0.125, z: -2.5 }, ZERO = { x: 0, y: 0, z: 0 };
  // Timber tones, its grain, dark trim; the rockets' and boxes' paints; gold that glows a little in the day; the
  // plinth's stones and its paving's bricks.
  const PALETTE = [null, "#9a5a28", "#8b5022", "#a6652e", "#7d461e", "#57301a", "#46260f",
    "#d8342c", "#f4eee2", "#2d5bd8", "#ffc21a", "#8a3bd1", "#2fa84a", "#a6ef74", "#b8231d", "#2c2e33", "#1d2f7a",
    "#ff8a1c", "#c83a2a", "#2a4fb8", "#ffd24a", "#16110d", "#ffcf3f", "#5b1f8a", "#1d6e2f",
    "#968b8c", "#857a7c", "#a1979a", "#776d70", "#c07a58", "#b06a4c", "#cc8a66", "#a35f44"];
  const T = { trim: 6, red: 7, white: 8, blue: 9, gold: 10, purple: 11, green: 12, lime: 13, cone: 14, iron: 15, navy: 16,
    orange: 17, boxRed: 18, boxBlue: 19, star: 20, slate: 21, crown: 22, plum: 23, pine: 24,
    stones: [25, 26, 27, 28], bricks: [29, 30, 31, 32] };
  const GLOWS = { [T.gold]: 0.35, [T.star]: 0.55, [T.crown]: 0.7 };
  const TONES = [1, 2, 3, 4], GRAIN = 5;
  const cell = (m, axis) => Math.round((m - FROM[axis]) / PX);
  const voxGeo = (v, from = FROM) => voxelGeometry(v, { unit: PX, palette: PALETTE, origin: from, emissive: GLOWS });
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
    apron: [[-2.75, 4.6, 1.4], [0, 4.8, 1.5], [2.75, 4.6, 1.4]],
    // Where a visitor stands to buy: before the counter, by the terminal; how near counts.
    use: { x: 0.45, z: 1.6, reach: 1.7 },
    screen: { x: 0.8, y: 1.25, z: 0.62, w: 0.46, h: 0.34, tilt: -0.55 },
    // The vendor stands on a step behind the counter, so his head and hat clear its top.
    vendor: { x: -0.55, y: 0.6, z: -0.35 },
    // The lanterns that light it, from the canopy's front corners.
    lamps: [[-1.62, 2.5, 1.0], [1.62, 2.5, 1.0]],
    // The lantern ropes, from the corner posts' tops to the sign's top corners: their ends, their sag, and where along
    // each a lantern hangs; those lanterns only glow.
    ropes: [-1, 1].map((s) => ({ from: [s * CORNER_X, 4.8, 0.25], to: [s * 2.3, 4.1, 1.2], sag: 0.32, lamps: [0.34, 0.68] })),
    // The pictures stand a few centimetres proud of the faces behind them, so Canvas 2D sorts them in front too.
    menu: { x: -BOARD_X, y: 2.0625, z: 0.42, w: 1.42, h: 1.78 },
    launches: { x: BOARD_X, y: 2.0625, z: 0.42, w: 1.42, h: 1.78 },
    cloth: { x: 0, y: 0.72, z: 0.8, w: 1.18, h: 0.58 },
    // The starbursts that twinkle: either end of the sign, and either end of the tagline.
    stars: [[-2.7, 3.98, 1.42, 1], [2.7, 3.98, 1.42, 1], [-2.6, 3.36, 1.42, 0.7], [2.6, 3.36, 1.42, 0.7], [-1.72, 2.82, 1.56, 0.5], [1.72, 2.82, 1.56, 0.5]],
    // The four big rockets on the sign: their feet, their lean, their paint; their tips are where the sparks fly from.
    rockets: [[-1.69, 4.25, 1.25, 0.14, "stripes"], [-0.56, 4.25, 1.25, 0.05, "stars"], [0.56, 4.25, 1.25, -0.05, "plum"], [1.69, 4.25, 1.25, -0.14, "spiral"]],
    rocketH: ROCKET_H,
    // The corner posts' banners: where each hangs from its arm.
    banners: [-1, 1].map((s) => ({ x: s * (CORNER_X + 0.47), y: 4.78, z: 0.25 }))
  };
  LAYOUT.tips = LAYOUT.rockets.map(([x, y, z, lean]) => [x - Math.sin(lean) * ROCKET_H, y + Math.cos(lean) * ROCKET_H, z]);
  LAYOUT.ropeLamps = LAYOUT.ropes.flatMap((r) => r.lamps.map((t) => along(r.from, r.to, r.sag, t)));

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
  // Inks for the sprites: a burst's colour and its bright middle.
  const INKS = {
    gold: { "#": "#ffc21a", "@": "#fff2b0" }
  };
  // One starburst, about half a metre across, that the scene twinkles node by node.
  const star = cached(() => noShadow(sprite(STAR, { "#": "#ffc21a", "@": "#fff2b0" }, 0, 0, 0, 0.075, 0.06, 1)));

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

  // A little rocket for the bundles, one cell square: a body four or five cells tall in its colour and a tip.
  const littleRocket = (v, i, j, k, h, c, tip) => {
    for (let y = 0; y < h; y++) v.set(i, j + y, k, y === h - 2 ? T.star : c);
    v.set(i, j + h, k, tip);
  };
  // A box of fireworks three cells a side, its paint and a gold star on its front.
  const starBox = (v, i, j, k, c) => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let d = 0; d < 3; d++) v.set(i + a, j + b, k + d, c);
    v.set(i + 1, j + 1, k + 2, T.star);
    v.set(i + 1, j + 1, k, T.star);
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

  // ---- the stand -------------------------------------------------------------------------------------------------
  // What stands on the ground round the stand, cached on its own so the hub can build it in a slice of its own before
  // the booth: the plinth.
  const ground = cached(() => {
    // The plinth under it all, in the ground's cells below the floor: two courses of stone blocks four cells long and
    // deep and two tall, each block one stone's tone and each course's joints half a block on from the one below, the
    // upper set back a quarter metre; and in its top, inside a border of the same stone, a paving of bricks two cells
    // long, each row half a brick on from the last.
    const p = makeVox(), rear = Math.round(PLINTH.back / PX);
    const course = (half, front, j0, stagger) => {
      for (let i = -Math.round(half / PX); i < Math.round(half / PX); i++) for (let k = rear; k < Math.round(front / PX); k++) for (let j = j0; j < j0 + 2; j++)
        p.set(i, j, k, T.stones[Math.floor(hash(Math.floor((i + stagger) / 4), Math.floor((k + stagger) / 4), j0) * 4)]);
    };
    course(PLINTH.lower.x, PLINTH.lower.z, -4, 0);
    course(PLINTH.upper.x, PLINTH.upper.z, -2, 2);
    const px = Math.round((PLINTH.upper.x - PLINTH.border) / PX), pz = Math.round((PLINTH.upper.z - PLINTH.border) / PX);
    for (let i = -px; i < px; i++) for (let k = rear; k < pz; k++) p.set(i, -1, k, T.bricks[Math.floor(hash(Math.floor((i + (k & 1)) / 2), k, 9) * 4)]);
    return { plinth: voxGeo(p, ZERO) };
  });
  const build = cached(() => {
    const v = makeVox(), rand = mulberry32(2140), iron = [], cloth = [], swing = [], marks = [], glow = [], dark = [];

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
    // The posts: the front pair runs up behind the sign and holds it, the back pair the canopy's back beam; the beams.
    for (const s of [-1, 1]) {
      timber(v, rand, s > 0 ? 1.5 : -1.75, s > 0 ? 1.75 : -1.5, 0.25, 4.375, 0.875, 1.125, "y");
      timber(v, rand, s > 0 ? 1.5 : -1.75, s > 0 ? 1.75 : -1.5, 0.25, 3.25, -1.75, -1.5, "y");
    }
    timber(v, rand, -1.75, 1.75, 3.0, 3.25, -1.75, -1.5, "x");
    timber(v, rand, -1.5, 1.5, 2.375, 2.5, 0.875, 1.125, "x");
    // The sign: a board of planks with a dark rim, in front of the posts; the tagline's plank under it.
    timber(v, rand, -2.375, 2.375, 3.125, 4.25, 1.125, 1.375, "x");
    fill(v, -2.375, 2.375, 3.125, 3.25, 1.125, 1.375, T.trim);
    fill(v, -2.375, 2.375, 4.125, 4.25, 1.125, 1.375, T.trim);
    fill(v, -2.375, -2.25, 3.125, 4.25, 1.125, 1.375, T.trim);
    fill(v, 2.25, 2.375, 3.125, 4.25, 1.125, 1.375, T.trim);
    timber(v, rand, -1.5, 1.5, 2.625, 3.0, 1.375, 1.5, "x");
    fill(v, -1.5, 1.5, 2.625, 3.0, 1.375, 1.5, (i, j, k) => (i + j) % 7 === 0 ? GRAIN : T.trim);
    // The boards either side, each in a heavy frame with its face from the counter's height up: two posts a quarter
    // metre square, rails above and below the dark face, and a deep cap that runs out over the posts.
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
    // The shelves' goods: boxes of fireworks in their paints with gold stars, and bundles of little rockets.
    const sb = (x, y, z, c) => starBox(v, cell(x, "x"), cell(y, "y"), cell(z, "z"), c);
    sb(-1.375, 1.5, -1.625, T.boxBlue); sb(-1.0, 1.5, -1.625, T.boxRed); sb(0.75, 1.5, -1.625, T.boxBlue);
    sb(-0.375, 2.125, -1.625, T.boxRed); sb(1.0, 2.125, -1.625, T.purple);
    const bundle = (x, y, z, colors) => colors.forEach((c, n) => littleRocket(v, cell(x, "x") + (n % 2), cell(y, "y"), cell(z, "z") + Math.floor(n / 2), 4 + (n % 3), c, n % 2 ? T.cone : T.star));
    bundle(0.125, 1.5, -1.5, [T.red, T.blue, T.green, T.purple]);
    bundle(-1.375, 2.125, -1.5, [T.purple, T.red, T.orange, T.blue]);
    bundle(0.25, 2.125, -1.5, [T.green, T.red]);
    // Down front: a crate of rockets at the left corner, boxes at the right, rockets in a barrel beside them (the
    // barrel the scene's kit lays); and boxes stacked at the counter's left end.
    timber(v, rand, -2.25, -1.75, 0, 0.5, 1.375, 1.875, "x");
    carve(v, -2.125, -1.875, 0.375, 0.5, 1.5, 1.75);
    bundle(-2.125, 0.375, 1.5, [T.red, T.blue, T.purple, T.green]);
    sb(1.875, 0, 1.5, T.boxBlue); sb(2.25, 0, 1.625, T.boxRed); sb(2.0, 0.375, 1.5, T.purple);
    sb(-1.875, 0.25, -0.125, T.boxRed); sb(-1.875, 0.625, -0.125, T.boxBlue);
    bundle(2.5, 0.5, 1.0, [T.red, T.green, T.blue, T.orange]);
    // Iron at the joints: plates where the front posts meet the counter's top, the beam and the sign.
    for (const s of [-1, 1]) for (const y of [1.19, 2.44, 3.4, 4.0]) iron.push(moved(bevelBox({ w: 0.3, h: 0.22, d: 0.05, color: "#2c2e33", bevel: 0.012 }), s * 1.625, y, 1.15));

    // The canopy: red and white stripes from the back beam down to the front, out over the counter, a scalloped
    // valance along its front edge, and a sagging cord of bunting under it that rocks in the wind (`swing`).
    const back = { y: 3.25, z: -1.6 }, front = { y: 2.62, z: 1.32 }, run = Math.hypot(front.z - back.z, back.y - front.y), slope = Math.atan2(back.y - front.y, front.z - back.z);
    const stripes = 10, wide = 3.9 / stripes;
    for (let n = 0; n < stripes; n++) {
      const x = -1.95 + wide * (n + 0.5), color = n % 2 ? "#f4eee2" : "#d8342c";
      cloth.push(moved(turnedX(box({ w: wide + 0.005, h: 0.05, d: run, color }), slope), x, (back.y + front.y) / 2, (back.z + front.z) / 2));
      // A scallop under each stripe's front: a half-round of the same cloth.
      const scallop = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI + (k / 8) * Math.PI; scallop.push([Math.cos(a) * wide / 2, Math.sin(a) * 0.2]); }
      cloth.push(moved(prism(scallop, 0.04, n % 2 ? "#e7dfd0" : "#c22a23"), x, front.y - 0.01, front.z + 0.02));
    }
    const flags = ["#d8342c", "#2d5bd8", "#ffc21a", "#2fa84a", "#8a3bd1"];
    for (let n = 0; n < 13; n++) {
      const t = n / 12, x = -1.5 + 3 * t, y = 2.46 - Math.sin(t * Math.PI) * 0.1;
      swing.push(moved(prism([[-0.11, 0], [0.11, 0], [0, -0.22]], 0.02, flags[n % flags.length]), x, y, 1.22));
    }
    for (let n = 0; n < 12; n++) {
      const t0 = n / 12, t1 = (n + 1) / 12, x0 = -1.5 + 3 * t0, x1 = -1.5 + 3 * t1, y0 = 2.46 - Math.sin(t0 * Math.PI) * 0.1, y1 = 2.46 - Math.sin(t1 * Math.PI) * 0.1;
      swing.push(moved(turnedZ(box({ w: Math.hypot(x1 - x0, y1 - y0), h: 0.015, d: 0.015, color: "#3a2412" }), Math.atan2(y1 - y0, x1 - x0)), (x0 + x1) / 2, (y0 + y1) / 2, 1.22));
    }
    // The ropes: the lantern ropes from the corner posts to the sign.
    for (const r of LAYOUT.ropes) rope(cloth, r.from, r.to, r.sag, 0.045);
    // The corner posts' banners: blue cloth hanging from each arm, its foot cut in four points, a gold sunburst on its
    // front (`marks`, its own mesh so Canvas 2D can sort it before the cloth); they rock in the wind (`swing`).
    for (const B of LAYOUT.banners) {
      swing.push(box({ w: 0.66, h: 1.05, d: 0.03, color: "#2238a8", offset: { x: B.x, y: B.y - 0.6, z: B.z } }));
      for (let k = 0; k < 4; k++) swing.push(moved(prism([[-0.33 + k * 0.165, 0], [-0.165 + k * 0.165, 0], [-0.2475 + k * 0.165, -0.13]], 0.03, "#2238a8"), B.x, B.y - 1.125, B.z));
      marks.push(moved(sprite(STAR, INKS.gold, 0, 0, 0, 0.065, 0.02, 0.8), B.x, B.y - 0.55, B.z + 0.027));
      swing.push(box({ w: 0.03, h: 0.14, d: 0.03, color: "#3a2412", offset: { x: B.x - 0.27, y: B.y + 0.02, z: B.z } }), box({ w: 0.03, h: 0.14, d: 0.03, color: "#3a2412", offset: { x: B.x + 0.27, y: B.y + 0.02, z: B.z } }));
    }

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
    // The counter's lightning bolt beside the cloth, and the terminal's housing on the counter (its glass is a picture).
    const boltAt = [[0.62, 0], [0.04, 0.58], [0.4, 0.58], [0.2, 1], [0.96, 0.36], [0.6, 0.36]].map(([x, y]) => [(x - 0.5) * 0.42, (0.5 - y) * 0.56]);
    glow.push(moved(prism(boltAt, 0.04, "#ffc21a", 0.9), 1.08, 0.72, 0.9));
    const S = LAYOUT.screen;
    iron.push(moved(bevelBox({ w: S.w + 0.12, h: 0.12, d: 0.34, color: "#2c2e33", bevel: 0.02 }), S.x, S.y + 0.06, S.z - 0.02));
    iron.push(moved(turnedX(bevelBox({ w: S.w + 0.1, h: S.h + 0.1, d: 0.06, color: "#1c1e22", bevel: 0.015 }), S.tilt), S.x, S.y + 0.3, S.z - 0.08));
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
    return {
      bulbs: bulbs.map((list) => noShadow(merge(...list))), lettering,
      // Canvas 2D's lettering: [picture, its middle], the scene lays each as a cut-out.
      letterPictures: [[letterPicture("FIREWORKS", 0.118, "#ffc61f", "#a8360a"), [0, 3.69 + 0, 1.42]], [letterPicture("LIGHT UP OBL", 0.056, "#f6ecd2", "#2a1307"), [0, 2.81, 1.53]]],
      ...ground(), timber: voxGeo(v), iron: merge(...iron), cloth: merge(...cloth), dark: merge(...dark),
      swing: Object.assign(noShadow(merge(...swing)), { swing: 1 }), marks: Object.assign(noShadow(merge(...marks)), { swing: 1 }), glow: noShadow(merge(...glow))
    };
  });

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
  // BUY A FIREWORK: each of `items`, `[{ id, name, price }]` (the price in sats, or null while it can't be bought),
  // with its icon and a gold play button, and how to buy under them. `note` replaces that line (SIGN IN TO BUY).
  const MENU_W = 440, MENU_H = 552;
  const menuFace = (canvas, items, note = "") => {
    const g = canvasOf(canvas, MENU_W, MENU_H), { INK, write, writeFit, sats } = K();
    frame(g, MENU_W, MENU_H);
    writeFit(g, "BUY A FIREWORK", MENU_W / 2, 30, 4, INK.gold, MENU_W - 60, "center");
    const rowH = 124;
    for (let n = 0; n < items.length && n < 3; n++) {
      const it = items[n], y = 92 + n * (rowH + 12);
      g.fillStyle = "#211913";
      g.fillRect(28, y, MENU_W - 56, rowH);
      g.strokeStyle = "#4a3824";
      g.lineWidth = 2;
      g.strokeRect(29, y + 1, MENU_W - 58, rowH - 2);
      icon(g, it.id, 40, y + 12, 100);
      writeFit(g, it.name, 156, y + 26, 3, INK.white, 196);
      write(g, it.price === null ? "CLOSED" : `${sats(it.price)} SATS`, 156, y + 72, 3, it.price === null ? INK.dim : INK.gold);
      g.fillStyle = INK.gold;
      g.fillRect(MENU_W - 92, y + 36, 52, 52);
      g.fillStyle = INK.dark;
      g.beginPath();
      g.moveTo(MENU_W - 78, y + 48); g.lineTo(MENU_W - 52, y + 62); g.lineTo(MENU_W - 78, y + 76); g.closePath();
      g.fill();
    }
    writeFit(g, note || "AT THE COUNTER: SPACE OR TAP", MENU_W / 2, MENU_H - 40, 2, note ? INK.amber : INK.dim, MENU_W - 60, "center");
  };
  // TOP LAUNCHES over the last `days` days: each of `rows`, `[{ id, name, count }]`, ranked, with its icon and count.
  const launchesFace = (canvas, rows, days = 7) => {
    const g = canvasOf(canvas, MENU_W, MENU_H), { INK, write, writeFit, sats } = K();
    frame(g, MENU_W, MENU_H);
    writeFit(g, "TOP LAUNCHES", MENU_W / 2, 30, 4, INK.gold, MENU_W - 60, "center");
    write(g, `LAST ${days} DAYS`, MENU_W / 2, 70, 2, INK.dim, "center");
    const rowH = 96;
    for (let n = 0; n < rows.length && n < 4; n++) {
      const r = rows[n], y = 100 + n * (rowH + 12);
      g.fillStyle = n === 0 ? "#2a2014" : "#211913";
      g.fillRect(28, y, MENU_W - 56, rowH);
      write(g, String(n + 1), 50, y + 34, 4, n === 0 ? INK.gold : INK.white);
      icon(g, r.id, 88, y + 12, 72);
      writeFit(g, r.name, 172, y + 40, 2, INK.white, 170);
      write(g, sats(r.count), MENU_W - 40, y + 38, 3, n === 0 ? INK.gold : INK.white, "right");
    }
    if (!rows.some((r) => r.count > 0)) writeFit(g, "BE THE FIRST TO LIGHT ONE UP", MENU_W / 2, MENU_H - 40, 2, INK.amber, MENU_W - 60, "center");
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
    const c = document.createElement("canvas"), W = 120, H = 88, g = canvasOf(c, W, H), { INK, write } = K();
    g.fillStyle = "#0b1016"; g.fillRect(0, 0, W, H);
    pix(g, ["...##", "..##.", ".##..", "#####", "..##.", ".##..", "##..."], { "#": INK.gold }, 14, 18, 46);
    write(g, "BUY", 92, 30, 3, INK.gold, "center");
    write(g, "HERE", 92, 56, 2, INK.white, "center");
    return c;
  });

  BL.standModels = { PX, LAYOUT, ground, build, star, rockets, strawHat, pictureFace, menuFace, launchesFace, clothCanvas, screenCanvas, MENU_W, MENU_H };
})();
