// Ooga Raid's art for the field troops, the Fiat Legion's foot soldiers and vehicles that several side stages share
// (stages 5 to 8): the Auditor, the Tax Collector, the Repo Truck and the Spark, plus the clipboard and the shard that
// lobs carry. Geometry only: no nodes, no state, nothing per frame (`pick` reads the sim's state and returns a constant
// name, allocating nothing). Every builder is cached once a page. It registers into the shared art registry,
// `BL.raidArt.types[NAME]` and `BL.raidArt.lobs[attr]`, which the bank's and the stages' art files fill too. These troops
// have no stage of their own, so this file registers no `stages` entry; a stage that re-dresses one does so in its own
// `skins`.
//
// Each type entry carries its `tier`, `origin` and `box` (the bullet box about its anchor, [x0, x1, y0, y1]), checked
// against `BL.raidSim.TIER_OF` and `ORIGIN_OF` at load: a type the sim lacks, or one whose tier or origin differs, throws.
// A look stands on the type's anchor (the sim's x, y: a walker's feet, y 0) in stage metres, facing the camera, and its
// silhouette stays inside `box`, except the Spark's, which fills its standing touch box (`touch`), since touching it
// kills and nothing shoots it (the VENT ruling).
//
// - AUDITOR: a clerk in a grey suit and spectacles behind a clipboard the size of a door, held on the side it faces,
//   which is its front shield (F5): `build()` faces -x (the sim's `eAim` 6), `turned()` faces +x (`eAim` 0), the shield
//   always on the facing side. `pick(state, slot)` chooses by `eAim` (F5's facing), never by motion: the Auditor faces
//   the Ooga while it walks away from a wall.
// - TAX_COLLECTOR: a sprinter in a bowler hat and a tweed waistcoat with a stamped satchel. `build()` runs toward -x,
//   `turned()` toward +x: `pick(state, slot)` returns "turned" while its `evx` is over 0 (it runs at its speed either
//   way, and keeps its look through its fall, where its speed is 0).
// - REPO_TRUCK: an armoured tow truck with a vault door in its flank, driving toward -x (it never turns). `pick(state,
//   slot)` returns "build" while it drives (its routine is `LOOK.REPO_TRUCK.drive` and it moves) and "parked" once it
//   stands: the vault door swung open on a lit hold, its beacons lit, its headlamps dark.
// - SPARK: an arc of light crawling along the floor: a white core, cyan bolts to the floor and a trail behind it.
//   `pick(state, slot)` returns "build" or "flicker" (two bolt patterns, swapped FLICKER times a second while it runs,
//   `LOOK.SPARK.run`), or "turned" or "turnedFlicker" when it runs toward +x (`evx` over 0).
//
// `BL.raidArt.lobs[0]` (the Auditor's clipboard) and `lobs[2]` (the Shard Thrower's ice shard) are cached builders
// returning the lob's geometry for that attr, centred on the lob (LOB's origin 0) and inside a circle of the shot tier's
// half box (0.125 m), so they stay inside the box at any heading the scene turns them to. The tower's art draws attr 1,
// the shell.
//
// The routine indices `pick` compares against come from the field legion file's `LOOK` by type and state name
// (`BL.raidLegionField.LOOK.SPARK.run`, `.REPO_TRUCK.drive`), read at load; a missing one throws. A turned look is its
// look mirrored in x with its faces rewound (never a turn about y, so the camera still sees its face); words on a turned
// look are laid mirrored first, so they read the right way round.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, forwardLathe, along, noShadow, beam } = BL.models;
  const { SIGN_GLYPHS } = BL.hubModels;
  const { RULES, POSE } = BL.raidSim;
  const { hexToRgb } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-field: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI;

  // ---- what the sim says ---------------------------------------------------------------------------------------------
  // Each type's tier and origin (the stage specs' table); LOB is here for the lobs this file draws.
  const SPEC = Object.freeze({ AUDITOR: [0, 0.5], TAX_COLLECTOR: [0, 0.5], REPO_TRUCK: [2, 1], SPARK: [4, 0.15], LOB: [4, 0] });
  const boxOf = (name, b = RULES.SHOT_BOX[SPEC[name][0]]) => { const o = SPEC[name][1]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  const specOf = (name) => ({ tier: SPEC[name][0], origin: SPEC[name][1], box: boxOf(name) });
  {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-field: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-field: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  }
  // The routines a look depends on, by name from the field legion file.
  const FIELD = BL.raidLegionField;
  const routine = (type, state) => {
    const v = FIELD && FIELD.LOOK && FIELD.LOOK[type] && FIELD.LOOK[type][state];
    if (!Number.isInteger(v)) throw new Error(`raid-art-field: BL.raidLegionField.LOOK.${type}.${state} is not a routine index`);
    return v;
  };
  const SPARK_RUN = routine("SPARK", "run"), TRUCK_DRIVE = routine("REPO_TRUCK", "drive");
  // The Spark swaps its two bolt patterns this many times a second while it runs.
  const FLICKER = 15;

  // ---- palette -------------------------------------------------------------------------------------------------------
  const SKIN = "#e0a982", SKIN_DK = "#c48c64", EYE = "#1d1d20", MOUTH = "#7a2a22", SHIRT = "#f1eee6", SHOE = "#1c1c1f";
  const TIE = "#c8342a", GOLD = "#d9a63a", GOLD_LT = "#f2c450", STEEL = "#8d969e", STEEL_DK = "#3a4148", STEEL_LT = "#b9c1c8";
  const RED = "#b8322a";

  // ---- small builders ------------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z: one face.
  const fpoly = (points, z, color, emissive = 0) => {
    const g = { verts: [], faces: [], lines: [] }, ids = [];
    for (let k = 0; k < points.length; k++) { g.verts.push(points[k][0], points[k][1], z); ids.push(k); }
    g.faces.push({ i: ids, color: hexToRgb(color), emissive });
    return g;
  };
  const rect = (x0, x1, y0, y1, z, color, emissive = 0) => fpoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z, color, emissive);
  const ngon = (cx, cy, rx, ry, z, color, emissive = 0, n = 10, rot = 0) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = rot + k / n * PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return fpoly(pts, z, color, emissive);
  };
  // A flat strip `w` wide from a to b, facing the camera.
  const strip = (ax, ay, bx, by, w, z, color, emissive = 0) => {
    const l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l * w / 2, ny = (bx - ax) / l * w / 2;
    return fpoly([[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny]], z, color, emissive);
  };
  // A round bar from a to b, radius r.
  const rod = (ax, ay, az, bx, by, bz, r, color, emissive = 0, segments = 8) => {
    const l = Math.hypot(bx - ax, by - ay, bz - az);
    return along(lathe({ profile: [[0, 0], [r, 0], [r, l], [0, l]], segments, color, emissive }), ax, ay, az, bx - ax, by - ay, bz - az);
  };
  // A disc of radius r and thickness t facing the camera (its axis along z), centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  // A flat ring from radius r0 to r1 facing the camera at depth z.
  const annulus = (r0, r1, t, x, y, z, color, emissive = 0, segments = 16) =>
    moved(forwardLathe(lathe({ profile: [[r0, -t / 2], [r1, -t / 2], [r1, t / 2], [r0, t / 2], [r0, -t / 2]], segments, color, emissive })), x, y, z);
  // A limb hanging from (px, py, pz), `len` long, swung by `a` (positive swings its foot toward +x), and where it ends.
  const hang = (px, py, pz, len, w, d, a, color) => moved(turnedZ(B(-w / 2, w / 2, -len, 0, -d / 2, d / 2, color), a), px, py, pz);
  const endOf = (px, py, len, a) => [px + len * Math.sin(a), py - len * Math.cos(a)];
  // Turns parts about z round a pivot: a positive angle leans their top toward -x.
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
  // A look turned toward the camera by `yaw` (a positive one swings a -x front toward +z).
  const facing = (parts, yaw) => turnedY(merge(...parts), yaw);
  // The same look facing the other way: mirrored in x with every face rewound, so it still shows the camera its face.
  const mirrored = (geo) => {
    const out = { verts: Array.from(geo.verts), faces: geo.faces.map((f) => ({ ...f, i: f.i.slice().reverse() })), lines: geo.lines.map((l) => ({ ...l, i: l.i.slice() })) };
    for (let i = 0; i < out.verts.length; i += 3) out.verts[i] = -out.verts[i];
    if (geo.smooth) out.smooth = true;
    if (geo.normals) {
      out.normals = Float32Array.from(geo.normals);
      for (let i = 0; i < out.normals.length; i += 3) out.normals[i] = -out.normals[i];
    }
    if (geo.castShadow === false) out.castShadow = false;
    return out;
  };
  // A pixel picture (rows of "#" and ".", top row first) as runs of flat quads `cell` square, its middle at (x, y),
  // facing +z at depth z.
  const pix = (rows, cell, x, y, z, color, emissive = 0) => {
    const parts = [], w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w;) {
        if (rows[r][c] !== "#") { c++; continue; }
        let e = c;
        while (e < w && rows[r][e] === "#") e++;
        const x0 = x + (c - w / 2) * cell, y1 = y + (h / 2 - r) * cell;
        parts.push(rect(x0, x0 + (e - c) * cell, y1 - cell, y1, z, color, emissive));
        c = e;
      }
    }
    return parts;
  };
  // A word in the island's carved 3x5 alphabet as picture rows: a space is a gap, any other missing glyph throws. With
  // `flip` the rows are laid mirrored, for a look that is mirrored afterwards.
  const wordRows = (text, flip) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = text[i] === " " ? ["000", "000", "000", "000", "000"] : SIGN_GLYPHS[text[i]];
      if (!glyph) throw new Error(`raid-art-field: the sign alphabet has no "${text[i]}"`);
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + glyph[r].replace(/1/g, "#").replace(/0/g, ".");
    }
    return flip ? rows.map((row) => row.split("").reverse().join("")) : rows;
  };
  // Picture parts laid on a plane facing -x at x, their picture's +x running along +z.
  const facingLeft = (parts, x) => moved(turnedY(merge(...parts), -PI / 2), x, 0, 0);

  // This file's Legion rig, standing on its feet at y 0 and facing -x: the hip the legs hang from, the shoulder the arms
  // hang from, the neck the head sits on, the head's height.
  const HIP = 0.43, SHOULDER = 0.64, NECK = 0.7, HEAD = 0.16;
  // A Legion head on the rig's neck: neck, face, eyes, brows, nose, mouth and ears, plus the caller's hair and hat.
  const head = (brow, extra) => [
    B(-0.028, 0.028, NECK - 0.035, NECK + 0.01, -0.032, 0.032, SKIN),
    BB(-0.072, 0.068, NECK, NECK + HEAD, -0.068, 0.068, SKIN, 0.022),
    B(-0.079, -0.071, NECK + 0.082, NECK + 0.104, 0.017, 0.041, EYE), B(-0.079, -0.071, NECK + 0.082, NECK + 0.104, -0.041, -0.017, EYE),
    B(-0.08, -0.071, NECK + 0.112, NECK + 0.123, 0.013, 0.048, brow), B(-0.08, -0.071, NECK + 0.112, NECK + 0.123, -0.048, -0.013, brow),
    B(-0.094, -0.071, NECK + 0.055, NECK + 0.083, -0.011, 0.011, SKIN_DK),
    B(-0.076, -0.071, NECK + 0.028, NECK + 0.039, -0.022, 0.022, MOUTH),
    B(-0.01, 0.024, NECK + 0.048, NECK + 0.096, 0.068, 0.08, SKIN), B(-0.01, 0.024, NECK + 0.048, NECK + 0.096, -0.08, -0.068, SKIN),
    ...extra
  ];
  // A suit jacket on the rig, from below the hip to over the shoulder: the jacket, its lapels, the shirt and the tie.
  const jacket = (suit, lapel, tie) => [
    BB(-0.088, 0.088, HIP - 0.02, SHOULDER + 0.02, -0.102, 0.102, suit, 0.02),
    B(-0.097, -0.086, SHOULDER - 0.13, SHOULDER + 0.02, 0.036, 0.07, lapel), B(-0.097, -0.086, SHOULDER - 0.13, SHOULDER + 0.02, -0.07, -0.036, lapel),
    B(-0.098, -0.085, SHOULDER - 0.11, SHOULDER + 0.02, -0.036, 0.036, SHIRT),
    B(-0.105, -0.093, HIP + 0.04, SHOULDER - 0.01, -0.017, 0.017, tie)
  ];
  // A flat face from points given counter-clockwise as seen from outside.
  const quad = (pts, color, emissive = 0) => {
    const g = { verts: [], faces: [], lines: [] };
    for (const pt of pts) g.verts.push(pt[0], pt[1], pt[2]);
    g.faces.push({ i: pts.map((_, k) => k), color: hexToRgb(color), emissive });
    return g;
  };

  // ---- AUDITOR -------------------------------------------------------------------------------------------------------
  // A clerk in a grey suit and round spectacles, thin grey hair combed over, standing behind a clipboard the size of a
  // door that he holds out on his facing side by its edges: a hardboard board, an audit form on it ruled with lines and
  // tick boxes under AUDIT in red, a big steel clip at its top. The board covers him from his shoes to his eyes on that
  // side, so a forward shot reads as spent on it, while his back is bare. Faces -x. Fodder box about origin 0.5: x
  // ±0.344, y -0.06 to 1.06 over the feet.
  const AUDITOR_YAW = 0.5;
  // The board and its form, one picture of FORM_CELL squares, BOARD_COLS by BOARD_ROWS, top row first: b board, d its
  // dark foot, p paper, i ink, r red, s the steel clip. Every cell is its own face in one plane, laid a column at a
  // time, so nothing lies over anything: Canvas 2D sorts faces by their middles, and a decal over a bigger sheet would
  // sort behind it as the board turns.
  const FORM_CELL = 0.017, BOARD_COLS = 22, BOARD_ROWS = 56, BOARD_TOP = 0.99, BOARD_T = 0.026;
  const FORM_INKS = { b: "#9a6a3a", d: "#6e4a26", p: "#f4efe0", i: "#4a5a86", r: RED, s: STEEL_LT };
  const formRows = (flip) => {
    const g = [];
    for (let r = 0; r < BOARD_ROWS; r++) g.push(new Array(BOARD_COLS).fill(r === BOARD_ROWS - 1 ? "d" : r >= 6 && r <= 51 ? "p" : "b"));
    for (let r = 6; r <= 51; r++) g[r][0] = g[r][BOARD_COLS - 1] = "b";
    for (let r = 1; r <= 5; r++) for (let c = 6; c <= 15; c++) g[r][c] = "s";
    const word = wordRows("AUDIT", false);
    for (let r = 0; r < 5; r++) for (let c = 0; c < word[r].length; c++) if (word[r][c] === "#") g[8 + r][1 + c] = "r";
    for (let k = 0; k < 7; k++) {
      const row = 17 + k * 5;
      for (let c = 2; c <= 12; c++) g[row][c] = "i";
      for (let r = row - 2; r <= row + 1; r++) for (let c = 15; c <= 18; c++) g[r][c] = r === row - 2 || r === row + 1 || c === 15 || c === 18 ? "i" : "p";
      if (k % 3 === 1) { g[row - 1][16] = g[row - 1][17] = "r"; g[row][16] = g[row][17] = "r"; }
      else { g[row][16] = "r"; g[row - 1][17] = "r"; }
    }
    return g.map((row) => (flip ? row.slice().reverse() : row).join(""));
  };
  // The board as a slab: the picture on its front (facing +z, its middle column at u 0), then its back and edges.
  const boardSlab = (flip) => {
    const rows = formRows(flip), parts = [], u0 = -BOARD_COLS / 2 * FORM_CELL, u1 = -u0, v1 = BOARD_TOP, v0 = BOARD_TOP - BOARD_ROWS * FORM_CELL, T = BOARD_T;
    for (let c = 0; c < BOARD_COLS; c++) {
      for (let r = 0; r < BOARD_ROWS;) {
        let e = r;
        while (e < BOARD_ROWS && rows[e][c] === rows[r][c]) e++;
        const ink = rows[r][c];
        parts.push(rect(u0 + c * FORM_CELL, u0 + (c + 1) * FORM_CELL, v1 - e * FORM_CELL, v1 - r * FORM_CELL, 0, FORM_INKS[ink], ink === "r" ? 0.1 : 0));
        r = e;
      }
    }
    const edge = FORM_INKS.d;
    parts.push(quad([[u0, v0, -T], [u0, v1, -T], [u1, v1, -T], [u1, v0, -T]], edge));
    parts.push(quad([[u0, v0, -T], [u0, v0, 0], [u0, v1, 0], [u0, v1, -T]], edge), quad([[u1, v1, -T], [u1, v1, 0], [u1, v0, 0], [u1, v0, -T]], edge));
    parts.push(quad([[u0, v1, 0], [u1, v1, 0], [u1, v1, -T], [u0, v1, -T]], edge), quad([[u0, v0, -T], [u1, v0, -T], [u1, v0, 0], [u0, v0, 0]], edge));
    return parts;
  };
  const auditor = (flip) => {
    const SUIT = "#62666f", SUIT_DK = "#4b4f57", PANTS = "#474b52", HAIR = "#9a958c";
    const p = [];
    // Legs at an easy stance, shoes squared.
    for (const [z, a] of [[0.05, -0.06], [-0.05, 0.08]]) {
      p.push(hang(0, HIP, z, HIP - 0.04, 0.09, 0.09, a, PANTS));
      const [fx] = endOf(0, HIP, HIP - 0.04, a);
      p.push(B(fx - 0.1, fx + 0.04, 0, 0.05, z - 0.045, z + 0.045, SHOE));
    }
    // The jacket, a pen in the breast pocket.
    p.push(...jacket(SUIT, SUIT_DK, TIE));
    p.push(B(-0.04, 0.0, SHOULDER - 0.06, SHOULDER, 0.102, 0.109, "#2c3550"), B(-0.032, -0.022, SHOULDER - 0.02, SHOULDER + 0.02, 0.109, 0.115, GOLD_LT, 0.2));
    // The head: grey brows, round spectacles catching the light, the hair combed over a bald crown.
    p.push(...head(HAIR, [
      disc(0.023, 0.006, -0.082, NECK + 0.093, 0.03, "#cfe0ea", 0.25, 10), disc(0.023, 0.006, -0.082, NECK + 0.093, -0.03, "#cfe0ea", 0.25, 10),
      B(-0.084, -0.078, NECK + 0.09, NECK + 0.096, -0.008, 0.008, STEEL_DK),
      B(-0.058, 0.072, NECK + HEAD - 0.02, NECK + HEAD - 0.004, -0.07, 0.07, HAIR), B(0.028, 0.072, NECK + 0.04, NECK + HEAD - 0.012, -0.072, 0.072, HAIR)
    ]));
    // Both arms out to the board's edges, the hands gripping round them.
    const half = BOARD_COLS / 2 * FORM_CELL, bx = -0.245;
    for (const z of [0.12, -0.12]) {
      p.push(hang(0, SHOULDER, z, 0.16, 0.066, 0.066, -0.55, SUIT));
      const [ex, ey] = endOf(0, SHOULDER, 0.16, -0.55);
      p.push(beam(ex, ey, z, -0.205, 0.52, z * 1.45, 0.06, SUIT));
    }
    for (const z of [half, -half]) p.push(B(-0.27, -0.21, 0.49, 0.555, z > 0 ? z + 0.001 : z - 0.026, z > 0 ? z + 0.026 : z - 0.001, SKIN));
    // The board on the facing side, its face at bx, and the clip's lever standing over its top.
    p.push(facingLeft(boardSlab(flip), bx));
    p.push(B(bx - 0.012, bx - 0.002, BOARD_TOP, BOARD_TOP + 0.035, -0.045, 0.045, STEEL));
    const look = noShadow(BL.raidModels.standTall(facing(p, AUDITOR_YAW)));
    return flip ? mirrored(look) : look;
  };

  // ---- TAX_COLLECTOR -------------------------------------------------------------------------------------------------
  // A sprinter in a black bowler hat, a mustard tweed waistcoat over a white shirt with its sleeves rolled, a red tie
  // flying over his shoulder, flat out with a leather satchel stamped TAX bouncing at his hip on a strap across his
  // chest. Faces -x. Fodder box about origin 0.5: x ±0.344, y -0.06 to 1.06 over the feet.
  const TAX_YAW = 0.5;
  const taxCollector = (flip) => {
    const VEST = "#a07a2c", VEST_DK = "#7c5c1e", PANTS = "#3e3a36", HAT = "#1e1e22", HAT_BAND = "#5a2a22", HAIR = "#3a2a1e";
    const BAG = "#7a4a22", BAG_DK = "#5a341a", hip = HIP, th = 0.21, sh = 0.21;
    const p = [];
    // The near leg drives forward with its knee high, the far one kicks up behind.
    const [kx, ky] = endOf(0, hip, th, -0.95);
    p.push(hang(0, hip, 0.05, th, 0.09, 0.09, -0.95, PANTS), hang(kx, ky, 0.05, sh, 0.08, 0.08, 0.2, PANTS));
    const [fx, fy] = endOf(kx, ky, sh, 0.2);
    p.push(B(fx - 0.105, fx + 0.035, fy - 0.01, fy + 0.04, 0.005, 0.095, SHOE));
    const [bx, by] = endOf(0, hip, th, 0.6);
    p.push(hang(0, hip, -0.05, th, 0.09, 0.09, 0.6, PANTS), hang(bx, by, -0.05, sh, 0.08, 0.08, 1.75, PANTS));
    const [gx, gy] = endOf(bx, by, sh, 1.75);
    p.push(moved(turnedZ(B(-0.035, 0.03, -0.1, 0.02, -0.045, 0.045, SHOE), 1.75 + PI / 2), gx, gy, -0.05));
    // The body leans into the sprint.
    const body = [
      B(-0.085, 0.085, hip - 0.02, SHOULDER + 0.02, -0.1, 0.1, SHIRT),
      BB(-0.093, 0.093, hip - 0.01, SHOULDER, -0.104, 0.104, VEST, 0.018),
      B(-0.099, -0.092, SHOULDER - 0.14, SHOULDER, -0.03, 0.03, SHIRT),
      B(-0.104, -0.096, SHOULDER - 0.16, SHOULDER - 0.01, -0.016, 0.016, TIE),
      ...[0.47, 0.52, 0.57].map((y) => B(-0.1, -0.094, y, y + 0.014, -0.045, -0.032, GOLD, 0.15)),
      B(-0.096, -0.092, hip + 0.02, hip + 0.04, -0.1, 0.1, VEST_DK),
      // The tie's tail flying back over the shoulder.
      beam(-0.06, SHOULDER, 0.0, 0.07, SHOULDER + 0.05, 0.02, 0.025, TIE)
    ];
    body.push(...head(HAIR, [
      B(0.02, 0.072, NECK + 0.03, NECK + HEAD - 0.01, -0.072, 0.072, HAIR),
      moved(lathe({ profile: [[0, 0], [0.082, 0], [0.082, 0.035], [0.069, 0.075], [0.035, 0.09], [0, 0.092]], segments: 12, color: HAT }), 0.0, NECK + HEAD - 0.01, 0),
      moved(lathe({ profile: [[0, 0], [0.113, 0], [0.113, 0.012], [0, 0.012]], segments: 14, color: HAT }), 0.0, NECK + HEAD - 0.018, 0),
      moved(lathe({ profile: [[0.083, 0], [0.084, 0], [0.084, 0.02], [0.083, 0.02]], segments: 12, color: HAT_BAND }), 0.0, NECK + HEAD - 0.004, 0)
    ]));
    // Arms pumping: the far one forward, the near one back; shirt sleeves rolled to the elbow, bare forearms.
    for (const [z, a, b] of [[-0.12, -0.9, -1.9], [0.12, 0.85, 0.15]]) {
      body.push(hang(0, SHOULDER, z, 0.15, 0.065, 0.065, a, SHIRT));
      const [ex, ey] = endOf(0, SHOULDER, 0.15, a);
      body.push(hang(ex, ey, z, 0.13, 0.055, 0.055, b, SKIN));
      const [hx, hy] = endOf(ex, ey, 0.13, b);
      body.push(B(hx - 0.03, hx + 0.03, hy - 0.03, hy + 0.03, z - 0.03, z + 0.03, SKIN));
    }
    // The strap across the chest from the far shoulder, and the satchel riding behind the near hip.
    body.push(beam(-0.02, SHOULDER, -0.11, 0.07, 0.46, 0.13, 0.022, BAG_DK));
    // The satchel's face is one picture of BAG_CELL squares, top row first (k leather, g its gold buckle under the flap,
    // t the TAX stamp), every cell its own face in one plane, as the Auditor's form is laid: Canvas 2D sorts faces by
    // their middles, and a stamp laid over the face would sort behind it as he turns. Then its back, sides, top and foot.
    const BAG_CELL = 0.015, BX0 = 0.04, BX1 = 0.22, BY0 = 0.32, BY1 = 0.47, BZ0 = 0.11, BZ1 = 0.19, BAG_INKS = { k: BAG, g: GOLD, t: "#e8d9b0" };
    const bag = Array.from({ length: 10 }, () => new Array(12).fill("k")), tax = wordRows("TAX", false);
    for (let r = 2; r <= 4; r++) bag[r][5] = bag[r][6] = "g";
    for (let r = 0; r < 5; r++) for (let c = 0; c < tax[r].length; c++) if (tax[r][c] === "#") bag[5 + r][1 + c] = "t";
    const face = bag.map((row) => (flip ? row.slice().reverse() : row).join(""));
    for (let c = 0; c < 12; c++) {
      for (let r = 0; r < 10;) {
        let e = r;
        while (e < 10 && face[e][c] === face[r][c]) e++;
        const ink = face[r][c];
        body.push(rect(BX0 + c * BAG_CELL, BX0 + (c + 1) * BAG_CELL, BY1 - e * BAG_CELL, BY1 - r * BAG_CELL, BZ1, BAG_INKS[ink], ink === "g" ? 0.2 : ink === "t" ? 0.1 : 0));
        r = e;
      }
    }
    body.push(quad([[BX0, BY0, BZ0], [BX0, BY1, BZ0], [BX1, BY1, BZ0], [BX1, BY0, BZ0]], BAG_DK));
    body.push(quad([[BX0, BY0, BZ0], [BX0, BY0, BZ1], [BX0, BY1, BZ1], [BX0, BY1, BZ0]], BAG), quad([[BX1, BY1, BZ0], [BX1, BY1, BZ1], [BX1, BY0, BZ1], [BX1, BY0, BZ0]], BAG));
    body.push(quad([[BX0, BY1, BZ1], [BX1, BY1, BZ1], [BX1, BY1, BZ0], [BX0, BY1, BZ0]], BAG), quad([[BX0, BY0, BZ0], [BX1, BY0, BZ0], [BX1, BY0, BZ1], [BX0, BY0, BZ1]], BAG_DK));
    body.push(B(0.04, 0.22, 0.43, 0.475, 0.105, 0.195, BAG_DK));
    p.push(about(merge(...body), 0, hip, 0.24));
    // Planted: the whole stride set down so the lowest shoe stands on the ground.
    const planted = facing(p, TAX_YAW);
    let low = Infinity;
    for (let i = 1; i < planted.verts.length; i += 3) low = Math.min(low, planted.verts[i]);
    moved(planted, 0, -low, 0);
    const look = noShadow(BL.raidModels.standTall(planted));
    return flip ? mirrored(look) : look;
  };

  // ---- REPO_TRUCK ----------------------------------------------------------------------------------------------------
  // The Legion's armoured tow truck, driving toward -x: a riveted vault-blue cab built up over the engine with a slit
  // windscreen and a gold seal on its door, a bull bar and headlamps, an armoured hold behind with a gold band, both as
  // tall as the armour box, a tow boom along the roof and its hook over the tail,
  // two amber beacons on the cab, and in the hold's flank, facing the camera, a round vault door with its bolts and
  // spoked wheel. The side-on camera would see a door in the tail edge-on, so the door is in the flank at the tail.
  // Driving, the door is shut and the headlamps burn; parked, the door stands swung open flat against the hold ahead
  // of its doorway, the hold inside lit red, the beacons blazing. It fills its armour box about origin 1.0 (x ±1.344,
  // y -0.16 to 1.97 over its wheels' contact) to 1.84 m or more from x -1.25 to 1.2, so every shot that the box
  // stops lands on the truck, and it is plainly too tall to jump.
  const TRUCK_YAW = 0.08;
  const DOOR_X = 0.7, DOOR_Y = 0.98, DOOR_R = 0.34, HOLD_Z = 0.44;
  const repoTruck = (parked) => {
    const BODY = "#3e4c60", BODY_LT = "#55657c", BODY_DK = "#2a3442", GLASS = "#9cc6d8", TYRE = "#1b1d20", BUMPER = "#232629";
    const AMBER = "#ffb02e", LAMP = "#fff1b8", HOLD = "#3a0d08";
    const p = [];
    // The chassis, wheels with gold hub caps (the far pair dark behind).
    p.push(B(-1.18, 1.2, 0.22, 0.38, -0.25, 0.25, BUMPER));
    for (const x of [-0.78, 0.72]) {
      for (const z of [0.38, -0.38]) p.push(disc(0.27, 0.16, x, 0.27, z, TYRE, 0, 16));
      p.push(disc(0.15, 0.17, x, 0.27, 0.385, STEEL, 0, 14), disc(0.075, 0.18, x, 0.27, 0.39, GOLD, 0.2, 10));
      p.push(B(x - 0.33, x + 0.33, 0.52, 0.56, 0.38, 0.45, BODY_DK));
    }
    // The cab, built up over the engine to the hold's roof (an armour look fills its box's height across its width): a
    // bevelled box with a slit windscreen and a side window up high, the door's seam and seal, the bull bar and
    // headlamps, and two amber beacons and a bar on its roof.
    p.push(BB(-1.25, -0.42, 0.38, 1.84, -0.42, 0.42, BODY, 0.04));
    p.push(B(-1.265, -1.248, 1.34, 1.58, -0.34, 0.34, GLASS, 0.15));
    p.push(B(-1.1, -0.62, 1.32, 1.6, 0.42, 0.428, GLASS, 0.15), B(-1.1, -0.62, 1.3, 1.32, 0.42, 0.43, BODY_DK));
    p.push(B(-0.6, -0.59, 0.42, 1.62, 0.42, 0.428, BODY_DK), B(-1.18, -0.47, 1.68, 1.72, 0.42, 0.428, BODY_DK));
    for (let k = 0; k < 4; k++) p.push(B(-1.12 + k * 0.17, -1.09 + k * 0.17, 1.76, 1.79, 0.42, 0.43, BODY_DK));
    p.push(disc(0.13, 0.01, -0.84, 0.8, 0.43, GOLD, 0.25, 16), disc(0.105, 0.012, -0.84, 0.8, 0.432, RED, 0, 16));
    p.push(...pix([".###.", ".#...", "####.", ".#...", ".#..."], 0.03, -0.835, 0.8, 0.446, GOLD_LT, 0.3));
    p.push(B(-1.295, -1.245, 0.28, 0.5, -0.4, 0.4, BUMPER));
    for (const z of [0.3, 0.0, -0.3]) p.push(B(-1.295, -1.255, 0.5, 0.78, z - 0.02, z + 0.02, BUMPER));
    p.push(B(-1.295, -1.255, 0.76, 0.8, -0.4, 0.4, BUMPER));
    for (const z of [0.32, -0.32]) p.push(B(-1.262, -1.25, 0.58, 0.68, z - 0.06, z + 0.06, parked ? "#6a6450" : LAMP, parked ? 0 : 1.1));
    p.push(B(-1.0, -0.6, 1.84, 1.87, -0.2, 0.2, STEEL_DK));
    for (const z of [0.12, -0.12]) p.push(moved(lathe({ profile: [[0, 0], [0.055, 0], [0.055, 0.06], [0.032, 0.085], [0, 0.09]], segments: 10, color: AMBER, emissive: parked ? 1.3 : 0.1 }), -0.8, 1.87, z));
    // The armoured hold, up to the box's top: its near flank is armour plates over a dark core, small faces so Canvas
    // 2D's depth sort keeps the door and its fittings in front of them; a gold band, rivet rows, roof rails.
    p.push(BB(-0.42, 1.2, 0.38, 1.9, -HOLD_Z, HOLD_Z - 0.12, BODY_DK, 0.035));
    for (let i = 0; i < 4; i++) for (const [y0, y1] of [[0.56, 1.23], [1.23, 1.9]]) p.push(B(-0.4 + i * 0.4 + 0.006, -0.006 + i * 0.4, y0 + 0.006, y1 - 0.006, HOLD_Z - 0.12, HOLD_Z, BODY_LT));
    for (let i = 0; i < 4; i++) p.push(B(-0.39 + i * 0.4, -0.01 + i * 0.4, 1.68, 1.73, HOLD_Z, HOLD_Z + 0.006, GOLD, 0.15));
    for (const y of [0.6, 1.81]) for (let k = 0; k < 9; k++) p.push(B(-0.33 + k * 0.18, -0.3 + k * 0.18, y, y + 0.03, HOLD_Z, HOLD_Z + 0.01, BODY_DK));
    p.push(B(-0.35, 1.15, 1.9, 1.93, -0.36, -0.32, STEEL_DK), B(-0.35, 1.15, 1.9, 1.93, 0.32, 0.36, STEEL_DK));
    // The tow boom along the hold's roof and out over its tail, its cable and hook hanging behind.
    p.push(beam(0.8, 1.91, 0, 1.25, 1.925, 0, 0.04, "#c9a23a"), beam(0.86, 1.89, 0, 0.86, 1.93, 0, 0.06, STEEL_DK));
    p.push(B(1.235, 1.25, 1.5, 1.92, -0.008, 0.008, STEEL_DK), rod(1.24, 1.5, 0, 1.28, 1.44, 0, 0.018, STEEL), rod(1.28, 1.44, 0, 1.27, 1.4, 0, 0.018, STEEL));
    // The vault door in the flank.
    p.push(annulus(DOOR_R, DOOR_R + 0.05, 0.06, DOOR_X, DOOR_Y, HOLD_Z + 0.03, STEEL_DK, 0, 20));
    if (!parked) {
      p.push(disc(DOOR_R, 0.05, DOOR_X, DOOR_Y, HOLD_Z + 0.03, STEEL, 0, 20), disc(DOOR_R - 0.06, 0.02, DOOR_X, DOOR_Y, HOLD_Z + 0.065, STEEL_LT, 0, 20));
      for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; p.push(disc(0.022, 0.06, DOOR_X + Math.cos(a) * (DOOR_R - 0.03), DOOR_Y + Math.sin(a) * (DOOR_R - 0.03), HOLD_Z + 0.04, GOLD, 0.2, 8)); }
      for (let k = 0; k < 3; k++) { const a = k / 3 * PI * 2 + 0.3; p.push(beam(DOOR_X, DOOR_Y, HOLD_Z + 0.08, DOOR_X + Math.cos(a) * 0.17, DOOR_Y + Math.sin(a) * 0.17, HOLD_Z + 0.08, 0.025, STEEL_DK)); }
      p.push(disc(0.045, 0.05, DOOR_X, DOOR_Y, HOLD_Z + 0.08, GOLD, 0.25, 10), annulus(0.15, 0.18, 0.025, DOOR_X, DOOR_Y, HOLD_Z + 0.09, STEEL_DK, 0, 16));
    } else {
      // The doorway: the hold inside lit red, a bench line and the step down; the door swung flat against the hold
      // ahead of it, showing its inner face of bolt bars, its locking bolts out.
      p.push(disc(DOOR_R, 0.01, DOOR_X, DOOR_Y, HOLD_Z + 0.035, HOLD, 0.6, 20));
      p.push(B(DOOR_X - 0.25, DOOR_X + 0.25, DOOR_Y - 0.12, DOOR_Y - 0.09, HOLD_Z + 0.041, HOLD_Z + 0.043, "#7a2a1a", 0.6));
      p.push(B(DOOR_X - 0.22, DOOR_X + 0.22, 0.4, 0.46, HOLD_Z - 0.12, HOLD_Z + 0.1, STEEL_DK));
      const ox = DOOR_X - 2 * DOOR_R - 0.06;
      p.push(disc(DOOR_R, 0.05, ox, DOOR_Y, HOLD_Z + 0.03, STEEL, 0, 20));
      for (const y of [-0.15, 0, 0.15]) p.push(B(ox - 0.26, ox + 0.26, DOOR_Y + y - 0.02, DOOR_Y + y + 0.02, HOLD_Z + 0.055, HOLD_Z + 0.075, STEEL_DK));
      for (const y of [-0.15, 0, 0.15]) p.push(rod(ox - 0.32, DOOR_Y + y, HOLD_Z + 0.065, ox - 0.26, DOOR_Y + y, HOLD_Z + 0.065, 0.016, GOLD, 0.2, 8));
      p.push(disc(0.06, 0.03, ox, DOOR_Y, HOLD_Z + 0.08, GOLD, 0.2, 12));
      p.push(B(ox + DOOR_R - 0.02, DOOR_X - DOOR_R - 0.02, DOOR_Y - 0.04, DOOR_Y + 0.04, HOLD_Z + 0.01, HOLD_Z + 0.04, STEEL_DK));
    }
    return noShadow(facing(p, TRUCK_YAW));
  };

  // ---- SPARK ---------------------------------------------------------------------------------------------------------
  // An arc of light crawling along the floor toward -x: a white-hot core in a deep blue halo (so it reads on a
  // bright sky) over a scorch of orange on the floor, cyan
  // bolts forking up from it and down to the floor, and a trail of sparks behind. It fills the shot tier's standing
  // touch box (x ±0.156 m, -0.32 to 0.65 m over its feet) only as high as 0.44 m, so it reads low enough to jump.
  // `frame` 0 and 1 are the two bolt patterns it flickers between.
  const BOLTS = [
    [[[0, 0.15], [-0.05, 0.22], [-0.02, 0.29], [-0.08, 0.36], [-0.05, 0.43]], [[0, 0.15], [0.05, 0.25], [0.02, 0.31], [0.08, 0.39]],
      [[0, 0.15], [-0.07, 0.11], [-0.1, 0.05], [-0.14, 0.01]], [[0, 0.15], [0.06, 0.09], [0.1, 0.06], [0.13, 0.0]], [[0, 0.15], [-0.11, 0.18], [-0.15, 0.24]]],
    [[[0, 0.15], [0.04, 0.23], [-0.01, 0.3], [0.04, 0.37], [0.0, 0.44]], [[0, 0.15], [-0.06, 0.24], [-0.04, 0.3], [-0.1, 0.36]],
      [[0, 0.15], [-0.05, 0.08], [-0.09, 0.07], [-0.12, 0.0]], [[0, 0.15], [0.08, 0.12], [0.11, 0.05], [0.15, 0.02]], [[0, 0.15], [0.1, 0.2], [0.14, 0.27]]]
  ];
  const spark = (frame) => {
    const CORE = "#ffffff", HALO = "#38c8ff", BOLT = "#4fd2ff", SCORCH = "#ffa030", DEEP = "#164a8c";
    const p = [
      ngon(0, 0.012, 0.15, 0.022, -0.02, SCORCH, 1, 14), ngon(0, 0.012, 0.09, 0.014, -0.015, "#fff0c8", 1.2, 12),
      ngon(0, 0.15, 0.125, 0.125, -0.01, DEEP, 0.25, 14), ngon(0, 0.15, 0.1, 0.1, 0, HALO, 0.7, 14, frame * 0.2), ngon(0, 0.15, 0.06, 0.06, 0.02, CORE, 1.5, 10, frame * 0.3)
    ];
    for (const bolt of BOLTS[frame]) for (let k = 1; k < bolt.length; k++) p.push(strip(bolt[k - 1][0], bolt[k - 1][1], bolt[k][0], bolt[k][1], 0.02 - k * 0.0025, 0.01 + k * 0.002, BOLT, 0.9));
    // The trail behind it: bright chips along the floor, fading.
    for (let k = 0; k < 4; k++) { const x = 0.05 + k * 0.03, s = 0.016 - k * 0.003; p.push(fpoly([[x - s, 0.03 + (k & 1) * 0.02], [x, 0.03 + (k & 1) * 0.02 - s], [x + s, 0.03 + (k & 1) * 0.02], [x, 0.03 + (k & 1) * 0.02 + s]], 0.03, k < 2 ? CORE : BOLT, 1.4 - k * 0.2)); }
    return noShadow(merge(...p));
  };

  // ---- the lobs ------------------------------------------------------------------------------------------------------
  // Every lob glows its family's ember outline behind it (raid-models' FAMILY.LOB) on a dark rim, so a thrown thing reads
  // as thrown against any backdrop: LOB_HALO is that outline, a rounded plate `w` by `h` about (0, 0), set behind at z.
  const LOB_HALO = (w, h, z) => [B(-w - 0.006, w + 0.006, -h - 0.006, h + 0.006, z - 0.006, z - 0.003, "#1a1208"), B(-w, w, -h, h, z - 0.003, z, BL.raidModels.FAMILY.LOB, 1)];
  // The Auditor's clipboard (attr 0): a small hardboard clipboard with its form and clip, tumbling, on its ember outline.
  // Inside 0.125 m of its middle.
  const clipboardLob = () => {
    const p = [
      ...LOB_HALO(0.066, 0.088, -0.012),
      BB(-0.058, 0.058, -0.078, 0.078, -0.008, 0.008, "#9a6a3a", 0.006),
      B(-0.048, 0.048, -0.066, 0.056, 0.008, 0.011, "#f4efe0"),
      rect(-0.035, 0.0, 0.035, 0.044, 0.0115, RED, 0.1)
    ];
    for (let k = 0; k < 4; k++) p.push(rect(-0.035, 0.03, 0.018 - k * 0.022, 0.024 - k * 0.022, 0.0115, "#4a5a86"));
    p.push(B(-0.026, 0.026, 0.05, 0.084, 0.006, 0.017, STEEL_LT), B(-0.014, 0.014, 0.076, 0.09, 0.012, 0.02, STEEL));
    return noShadow(turnedY(turnedZ(merge(...p), 0.42), 0.35));
  };
  // The Shard Thrower's ice shard (attr 2), flying along +x: a long six-sided crystal, pale ice into violet, with a
  // smaller one grown off its side, on its ember outline. Inside 0.125 m of its middle.
  const shardLob = () => noShadow(merge(
    ...LOB_HALO(0.112, 0.045, -0.05),
    along(lathe({ profile: [[0, 0], [0.034, 0.05], [0.044, 0.11], [0.03, 0.18], [0, 0.23]], segments: 6, color: "#d6ecff", emissive: 0.35 }), -0.105, 0, 0, 1, 0, 0),
    along(lathe({ profile: [[0, 0], [0.026, 0.05], [0.02, 0.1], [0, 0.13]], segments: 6, color: "#a98cff", emissive: 0.45 }), -0.04, 0.0, 0.0, 0.55, 0.6, 0.2),
    along(lathe({ profile: [[0, 0], [0.02, 0.03], [0, 0.085]], segments: 5, color: "#b9a4ff", emissive: 0.45 }), -0.06, 0, 0, -0.4, -0.8, -0.1)
  ));

  // ---- the registry --------------------------------------------------------------------------------------------------
  const pair = (build) => {
    const look = cached(() => build(false));
    return { build: look, turned: cached(() => build(true)) };
  };
  const type = (name, looks) => put("types", name, Object.assign(specOf(name), looks));
  // The Auditor's facing is F5's: `eAim` 0 faces right (+x, `turned`), 6 left (`build`), and it holds through death.
  // Winding up its throw (raid-enemies.js's FLAG.WIND), each facing wears a flare at its throw's start (raid-models'
  // `windOf`), as `wind` and `turnedWind`.
  const auditorLooks = pair(auditor), auditorWind = (look) => cached(() => BL.raidModels.windOf(look(), 0, SPEC.AUDITOR[1], BL.raidModels.FAMILY_OF.AUDITOR, undefined, 0.08));
  type("AUDITOR", Object.assign(auditorLooks, { wind: auditorWind(auditorLooks.build), turnedWind: auditorWind(auditorLooks.turned), pick: (state, slot) => state.eAim[slot] === 0 ? "turned" : "build" }));
  // The Tax Collector faces the way it runs, by the sign of its `evx` (never 0 while it runs).
  type("TAX_COLLECTOR", Object.assign(pair(taxCollector), { pick: (state, slot) => state.evx[slot] > 0 ? "turned" : "build" }));
  const truck = cached(() => repoTruck(false)), parked = cached(() => repoTruck(true));
  type("REPO_TRUCK", {
    build: truck, parked,
    pick: (state, slot) => state.eRoutine[slot] === TRUCK_DRIVE && state.evx[slot] !== 0 ? "build" : "parked"
  });
  const sparkA = cached(() => spark(0)), sparkB = cached(() => spark(1));
  type("SPARK", {
    build: sparkA, flicker: sparkB, turned: cached(() => mirrored(sparkA())), turnedFlicker: cached(() => mirrored(sparkB())),
    touch: boxOf("SPARK", RULES.BOXES[RULES.TIER.SHOT][POSE.STAND]),
    pick: (state, slot) => {
      const lit = state.eRoutine[slot] === SPARK_RUN && (Math.floor(state.time * FLICKER) & 1) === 1;
      if (state.evx[slot] > 0) return lit ? "turnedFlicker" : "turned";
      return lit ? "flicker" : "build";
    }
  });
  ART.lobs = ART.lobs || [];
  put("lobs", 0, cached(clipboardLob));
  put("lobs", 2, cached(shardLob));
  // For checks: the table above, each box, and the lobs' box (LOB's, about its origin).
  ART.field = Object.freeze({ SPEC, LOB_BOX: boxOf("LOB"), FLICKER });
})();
