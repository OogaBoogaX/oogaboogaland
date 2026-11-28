// Ooga Raid's art for stage 8, The Reserve: the Fiat Legion's printing works in the island's rock, a side stage of
// riveted presses, bill belts, a paper storm over the drying stacks, the Chairman's lift up to the gilt gallery and the
// Chairman's Engine in the far wall. Geometry only: no nodes, no state, nothing per frame (`pick` reads the sim's state
// and returns a constant name, and `shift` returns a number; neither allocates). Every builder is cached once a page.
// It registers into the shared art registry, `BL.raidArt.stages.reserve` and `BL.raidArt.types[NAME]`, which the other
// stages' art files fill too.
//
// Everything is read from the parsed stage, never copied: the cells, `start`, `lockScreen`, `placed` (the RAM and
// CHAIRMAN_ENGINE records, by name through BL.raidStages.ENEMY), and the set pieces `belts` [col0, col1, row, v] (F8),
// `gusts` [from, to, dir] (F9) and `lifts` [col, width, lowRow, highRow, speed, hold] (F10), nested or flat. A field left
// out means the stage has none; a record of the wrong length throws. The solid cells take their look from where they
// stand: under the floor row (the first row over the ground under `start`) they are the hall's floor; above it, inside
// a gust zone they are stacks and bales of banded notes, on a screen that holds a lift the gilt gallery, on the lock
// screen the far wall, and anywhere else the press deck.
//
// `sector(stage, screen)` is one 8 by 7 screen: the solid cells cut from the grid four voxels deep (with the pits'
// backs filled dark), the ledges as iron catwalks in the back voxel, the belts' beds, the lift shafts, and the dressing:
// brick piers and arches far behind, pendant lamps, a riveted press frame over every RAM (its crown above the view),
// drying racks of pegged bills in the storm, the gallery's gilt railing, the Engine's brass wall on the lock screen, and
// the rock under the floor (a phone's tall view shows metres of it). The Engine's wall carries the pod's dock (its
// record plus the pod type's F13 mount, `BL.raidEnemies.TYPES[ENEMY.ENGINE_POD].mounts[0]`) and the muzzle it fires
// from in the pod phase (its record plus the reserve legion's `TUNE.ENGINE_TOP_AT`); either missing throws. Dressing never enters the play band
// (|z| < PLAY_BAND): what stands in front lies on the solid cells' faces under their top edge. Only what can be stood
// on carries the brass walk edge (floor, deck, stacks, bales, gallery steps, catwalks and the lift's deck); nothing
// behind has a lit edge or a flat top within reach, and no ceiling closes over the stage: the vault is backdrop.
//
// Moving pieces, placed by the scene every frame without allocating:
//   belts(stage)  `[{ geometry, x0, x1, top, v, pitch, shift(time) }]`: the belt's moving band with its printed bills
//                 and chevrons pointing the belt's way, and the loose sheets riding it (behind the play band), laid
//                 over [x0 - pitch, x1] in stage metres and clipped to the belt (`clipSlab`); put its node at
//                 x = shift(stageTime), y 0. The rollers and drums are in the sector.
//   lifts(stage)  `[{ geometry, x0, width, lowY, highY }]`: the brass cage with its velvet bench, built at its own
//                 columns with y 0 its walk surface; put its node at (0, the lift's top from `liftTop`).
//   storm(stage)  `{ zones: [{ x0, x1, dir, stir, blizzard(d), period, shift(time, d) }] }`, one a gust zone: `stir`
//                 (bills lifting off the stacks, for the warning and the blow) stands in place; `blizzard(d)` (streaming
//                 bills, behind the play band, clipped to the zone) for the blow's direction d from `gustDir` (-1 or 1;
//                 anything else throws) goes at x = shift(time into the blow, d) while it blows.
//   cylinders(stage)  `[{ geometry, x, y, period, shift(time) }]`, one a CHAIRMAN_ENGINE record: the printing
//                 cylinder's engraved rows, clipped to the open core's port; while the core is open put its node at
//                 (0, shift(time)) and the rows roll down.
//
// `backdrop(stage)` is the vaulted hall, shaped like `BL.raidModels.backdrop()`: `layers` (the far vault and its rib
// arches and lamps at rate 0.25, the near hall of drying racks and press silhouettes at 0.5; a layer node goes at
// x camX * (1 - rate), y its y) and `sky`, a dark backing riding with the camera. Its layers stand nearer than stage 1's
// so the scene's fog does not wash the dark hall.
//
// Types (`BL.raidArt.types`), each with `tier`, `origin` and `box` (the bullet box about its anchor), checked against
// `BL.raidSim.TIER_OF` and `ORIGIN_OF` at load (a type the sim lacks, or a differing tier or origin, throws). A look
// stands on the type's anchor (the sim's x, y) and keeps inside `box`; what reaches outside it is a separate set-back
// geometry the scene places at the same anchor.
// - RAM: the steel block with the fiat seal over its die face, lamps dark (`shut`, the same as `build`: it stays shut)
//   or lit in its warning (`warn`); `screw()` is its ram screw above the box, set back. `pick(state, slot)`.
// - ENGINE_PRESS: a black press head on its die, the foot at origin - 1.0: `shut` (brass shutters closed), `warn` (and
//   its lamps lit), `build` (open while down: the ink core glowing); `screw()` its stem up to the gantry, set back;
//   `zByAttr[attr]`, a depth for each press so the two never draw in one plane where they overlap: place both the
//   press and its stem at that z. `pick`.
// - ENGINE_POD: the Chairman's gold-framed chair-pod in a square armoured frame filling its box: `shut` docked behind
//   brass lids, `build` flying with its jets lit.
// - CHAIRMAN_ENGINE: the core's round shutter in a square brass bezel plate filling its box: `shut`, `heating` (the pod phase: light through the
//   slats), `build` (open, the printing cylinder white-hot). `pick`. Its brass wall and housing are the lock screen's
//   dressing, set back.
// `pick(state, slot)` returns one of the type's own variant names from `state.eRoutine[slot]` and `state.eFlags[slot]`
// (`BL.raidEnemies.FLAG.SHUT`), comparing routines with the reserve legion file's `LOOK` by name
// (`BL.raidLegionReserve.LOOK.RAM.warn`, `.ENGINE_PRESS.warn`, `.CHAIRMAN_ENGINE.pod`), read at load; a missing one
// throws.
//
// Stage-8 re-skins of the shared types live with the stage (`skins`): CLERK a pressroom clerk in shirtsleeves, black
// waistcoat, green eyeshade and red sleeve garters; CARRIER a flying bundle of banded bills; SENSOR an ink-pressure
// gauge (`shut` lidded). Each faces as its raidModels look does and gives `turned` (mirrored in x, faces rewound).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, forwardLathe, along, noShadow, beam } = BL.models;
  const { SIGN_GLYPHS } = BL.hubModels;
  const { KIND, CELL, SCREEN_W, SCREEN_H, cellAt } = BL.raidStages;
  const { RULES } = BL.raidSim;
  const { FLAG } = BL.raidEnemies;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-reserve: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI;
  const SCREEN_X = SCREEN_W * CELL, VIEW_Y = SCREEN_H * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge fills only the back one, its front at LEDGE_Z.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3, ZF = Z1 + 0.004;

  // ---- what the sim says ---------------------------------------------------------------------------------------------
  const SPEC = Object.freeze({
    RAM: [2, 0], ENGINE_PRESS: [2, 0], ENGINE_POD: [3, 0], CHAIRMAN_ENGINE: [3, 1.0],
    CLERK: [0, 0.5], CARRIER: [0, 0], SENSOR: [0, 0.25]
  });
  const boxOf = (name) => { const [tier, o] = SPEC[name], b = RULES.SHOT_BOX[tier]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  const checkSpec = () => {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-reserve: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-reserve: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  };
  checkSpec();
  const RESERVE = BL.raidLegionReserve;
  const routine = (type, state) => {
    const v = RESERVE && RESERVE.LOOK && RESERVE.LOOK[type] && RESERVE.LOOK[type][state];
    if (!Number.isInteger(v)) throw new Error(`raid-art-reserve: BL.raidLegionReserve.LOOK.${type}.${state} is not a routine index`);
    return v;
  };
  const RAM_WARN = routine("RAM", "warn"), PRESS_WARN = routine("ENGINE_PRESS", "warn"), ENGINE_POD_PHASE = routine("CHAIRMAN_ENGINE", "pod");
  // Where the Engine fires from in the pod phase, [dx, dy] from its record: the reserve legion's TUNE.ENGINE_TOP_AT.
  const TOP_AT = RESERVE && RESERVE.TUNE && RESERVE.TUNE.ENGINE_TOP_AT;
  if (!(TOP_AT && TOP_AT.length === 2 && TOP_AT.every(Number.isFinite))) throw new Error("raid-art-reserve: BL.raidLegionReserve.TUNE.ENGINE_TOP_AT is not [dx, dy]");
  // Where the pod docks, [dx, dy] from the Engine's record: the pod type's first F13 mount, read at the build.
  const podMount = () => {
    const def = BL.raidEnemies.TYPES[BL.raidStages.ENEMY.ENGINE_POD], m = def && def.mounts && def.mounts[0];
    if (!(m && m.length === 2 && m.every(Number.isFinite))) throw new Error("raid-art-reserve: ENGINE_POD has no F13 mount (BL.raidEnemies.TYPES[ENEMY.ENGINE_POD].mounts[0])");
    return m;
  };

  // ---- reading the stage ---------------------------------------------------------------------------------------------
  const records = (stage, key, stride) => {
    const src = stage[key], out = [];
    if (src === undefined) return out;
    if (src.length && typeof src[0] === "number") {
      if (src.length % stride) throw new Error(`raid-art-reserve: ${stage.id}.${key} is not records of ${stride}`);
      for (let i = 0; i < src.length; i += stride) out.push(Array.from(src.subarray ? src.subarray(i, i + stride) : src.slice(i, i + stride)));
    } else for (const r of src) {
      if (r.length !== stride) throw new Error(`raid-art-reserve: ${stage.id}.${key} has a record of ${r.length}, not ${stride}`);
      out.push(Array.from(r));
    }
    return out;
  };
  // The placed records of a type by name: `{ col, row, x, y, attr }`, x the middle of its column, y its feet.
  const placedOf = (stage, name) => {
    const t = BL.raidStages.ENEMY[name], P = stage.placed, out = [];
    if (t === undefined) throw new Error(`raid-art-reserve: BL.raidStages.ENEMY has no ${name}`);
    for (let i = 0; i < P.length; i += 4) if (P[i + 2] === t) out.push({ col: P[i], row: P[i + 1], x: (P[i] + 0.5) * CELL, y: P[i + 1] * CELL, attr: P[i + 3] });
    return out;
  };
  const solid = (stage, col, row) => cellAt(stage, col, row) === KIND.SOLID;
  // The floor row: the first row over the ground under the start.
  const floorRowOf = (stage) => {
    let row = 0;
    while (solid(stage, stage.start.col, row)) row++;
    if (!row) throw new Error(`raid-art-reserve: ${stage.id} has no ground under its start (column ${stage.start.col})`);
    return row;
  };
  // What the art needs of a stage, worked out once.
  const plans = new Map();
  const planOf = (stage) => {
    let plan = plans.get(stage.id);
    if (plan) return plan;
    if (stage.kind !== "side") throw new Error(`raid-art-reserve: ${stage.id} is not a side stage`);
    const gusts = records(stage, "gusts", 3), belts = records(stage, "belts", 4), lifts = records(stage, "lifts", 6);
    const gustCols = new Set(), beltCells = new Set(), liftScreens = new Set();
    for (const [from, to] of gusts) for (let c = from; c <= to; c++) gustCols.add(c);
    for (const [c0, c1, row] of belts) for (let c = c0; c <= c1; c++) beltCells.add(row * stage.cols + c);
    for (const [col] of lifts) liftScreens.add(Math.floor(col / SCREEN_W));
    plan = { floorRow: floorRowOf(stage), gusts, belts, lifts, gustCols, beltCells, liftScreens, rams: placedOf(stage, "RAM"), engines: placedOf(stage, "CHAIRMAN_ENGINE") };
    plans.set(stage.id, plan);
    return plan;
  };
  const MAT = { FLOOR: 0, PAPER: 1, GALLERY: 2, WALL: 3, DECK: 4 };
  const materialOf = (stage, plan, col, row) => {
    if (row < plan.floorRow) return MAT.FLOOR;
    const screen = Math.floor(col / SCREEN_W);
    if (screen === stage.lockScreen) return MAT.WALL;
    if (plan.gustCols.has(col)) return MAT.PAPER;
    if (plan.liftScreens.has(screen)) return MAT.GALLERY;
    return MAT.DECK;
  };

  // ---- palette -------------------------------------------------------------------------------------------------------
  const INK = "#15161a", IRON = "#2b2d31", IRON_DK = "#1d1e21", IRON_LT = "#4a4d53", STEEL = "#6b7178", STEEL_DK = "#3d4247", STEEL_LT = "#9aa1a8";
  const BRASS = "#c9a040", BRASS_LT = "#e8c56a", BRASS_DK = "#8a6a26", GOLD = "#d9a63a", GOLD_LT = "#f5c542";
  const NOTE = "#5f8f58", NOTE_DK = "#466e43", NOTE_LT = "#cfe8c0", PAPER = "#f2efe6", PAPER_DK = "#d8d2bf", KRAFT = "#a87a3e";
  const VELVET = "#7a1c28", VELVET_DK = "#561320", RED = "#b8322a", ROCK = "#3a302a", ROCK_DK = "#2c2420", BRICK = "#5a3a2c", BRICK_DK = "#462c22", STONE = "#7a6a58";
  const LAMP = "#ffd27a", LAMP_LT = "#fff0c0", CORE_HOT = "#fff6d8", CORE_GLOW = "#ffb44a", INK_GLOW = "#3fd06a";
  const SKIN = "#e2ab82", SKIN_DK = "#c98e66", HAIR = "#2f241c", EYE = "#1d1d20", MOUTH = "#7a2a22", SHIRT = "#f2efe6", SHOE = "#1d1d20";

  // ---- small builders ------------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z.
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
  // An arc of strips about (cx, cy), radii rx by ry, from angle a0 to a1.
  const arc = (out, cx, cy, rx, ry, a0, a1, n, w, z, color, emissive = 0) => {
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * k / n, b = a0 + (a1 - a0) * (k + 1) / n;
      out.push(strip(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, cx + Math.cos(b) * rx, cy + Math.sin(b) * ry, w, z, color, emissive));
    }
  };
  // A disc of radius r and thickness t facing the camera, centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  // A round bar from a to b, radius r, lying in the xy plane at depth z.
  const rod = (ax, ay, bx, by, r, z, color, emissive = 0) => beam(ax, ay, z, bx, by, z, r * 2, color, emissive);
  // A turned bar from a to b in the xy plane at depth z, round in section (no flat top to read as a step).
  const roundRod = (ax, ay, bx, by, r, z, color, emissive = 0) => {
    const l = Math.hypot(bx - ax, by - ay);
    return along(lathe({ profile: [[0, 0], [r, 0], [r, l], [0, l]], segments: 8, color, emissive }), ax, ay, z, bx - ax, by - ay, 0);
  };
  // A banknote, front-facing, turned by `a` about its middle: a paper border round its green face and a dark seal dot.
  const bill = (out, cx, cy, w, h, a, z, face = NOTE, edge = PAPER, emissive = 0) => {
    const c = Math.cos(a), s = Math.sin(a), at = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
    out.push(fpoly([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], z, edge, emissive));
    out.push(fpoly([at(-w * 0.4, -h * 0.32), at(w * 0.4, -h * 0.32), at(w * 0.4, h * 0.32), at(-w * 0.4, h * 0.32)], z + 0.002, face, emissive));
    out.push(fpoly([at(-w * 0.06, -h * 0.18), at(w * 0.06, -h * 0.18), at(w * 0.06, h * 0.18), at(-w * 0.06, h * 0.18)], z + 0.004, NOTE_DK, emissive));
  };
  // A pixel picture (rows of "#" and ".", top row first) as runs of flat quads `cell` square, its middle at (x, y).
  const pix = (rows, cell, x, y, z, color, emissive = 0) => {
    const parts = [], w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) for (let c = 0; c < w;) {
      if (rows[r][c] !== "#") { c++; continue; }
      let e = c;
      while (e < w && rows[r][e] === "#") e++;
      const x0 = x + (c - w / 2) * cell, y1 = y + (h / 2 - r) * cell;
      parts.push(rect(x0, x0 + (e - c) * cell, y1 - cell, y1, z, color, emissive));
      c = e;
    }
    return parts;
  };
  // A word in the island's carved 3x5 alphabet, centred at (x, y): a space is a gap, any other missing glyph throws.
  const word = (text, cell, x, y, z, color, emissive = 0) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = text[i] === " " ? ["000", "000", "000", "000", "000"] : SIGN_GLYPHS[text[i]];
      if (!glyph) throw new Error(`raid-art-reserve: no glyph for "${text[i]}" in "${text}"`);
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + glyph[r].replace(/1/g, "#").replace(/0/g, ".");
    }
    return pix(rows, cell, x, y, z, color, emissive);
  };
  // The fiat seal, flat: a gold ring on ink and the Legion's barred F.
  const SEAL_GLYPH = [".###.", ".#...", "####.", ".#...", ".#..."];
  const seal = (cx, cy, r, z, emissive = 0.15, ground = INK) => [
    ngon(cx, cy, r, r, z, GOLD, emissive, 16), ngon(cx, cy, r * 0.8, r * 0.8, z + 0.003, ground, 0, 16),
    ...pix(SEAL_GLYPH, r * 0.26, cx + r * 0.05, cy, z + 0.006, GOLD_LT, emissive + 0.15)
  ];
  // The same look facing the other way: mirrored in x with every face rewound.
  const mirrored = (geo) => {
    const out = { verts: Array.from(geo.verts), faces: geo.faces.map((f) => ({ ...f, i: f.i.slice().reverse() })), lines: geo.lines.map((l) => ({ ...l, i: l.i.slice() })) };
    for (let i = 0; i < out.verts.length; i += 3) out.verts[i] = -out.verts[i];
    if (geo.castShadow === false) out.castShadow = false;
    return out;
  };
  const flat = (parts) => noShadow(merge(...parts));
  // A slab clip keeping world x in [x0, x1] (both renderers honour a geometry's `clipSlab`).
  const slabX = (x0, x1) => new Float32Array([2 / (x1 - x0), 0, 0, -(x0 + x1) / (x1 - x0)]);
  const wrap = (v, p) => ((v % p) + p) % p;

  // ---- the solid cells -----------------------------------------------------------------------------------------------
  const V = { FLOOR_CAP: 1, FLOOR: 2, FLOOR_DK: 3, DECK_CAP: 4, DECK: 5, PAPER_CAP: 6, NOTE: 7, NOTE_DK: 8, GAL_CAP: 9, GAL: 10, GAL_DK: 11, WALL: 12, WALL_DK: 13, PIT: 14, PIT_DEEP: 15 };
  const PALETTE = [null, "#3a3836", "#4a4038", "#3e352f", "#34363a", "#232428", "#e9e4d2", NOTE, NOTE_DK, "#2c4a3c", "#1f3a30", "#183026", "#5a4a3e", "#4b3d33", "#141210", "#0c0b0a"].map((c) => c && hexToRgb(c));
  // The height a pit's back is filled dark to: the lower of the solid runs either side of it.
  const pitFill = (stage, col) => {
    if (cellAt(stage, col, 0) !== KIND.EMPTY) return 0;
    let a = col, b = col;
    while (a > 0 && cellAt(stage, a - 1, 0) === KIND.EMPTY) a--;
    while (b < stage.cols - 1 && cellAt(stage, b + 1, 0) === KIND.EMPTY) b++;
    const side = (c) => { let r = 0; while (c >= 0 && c < stage.cols && r < stage.rows && solid(stage, c, r)) r++; return r; };
    return Math.min(side(a - 1), side(b + 1));
  };
  const solidGeometry = (stage, plan, screen) => {
    const grid = terrain.makeGrid(SCREEN_W, stage.rows, DEPTH);
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, fill = pitFill(stage, col);
      for (let row = 0; row < fill; row++) grid.set(c, row, 0, row === fill - 1 ? V.PIT : V.PIT_DEEP);
      for (let row = 0; row < stage.rows; row++) {
        if (!solid(stage, col, row)) continue;
        const open = !solid(stage, col, row + 1), mat = materialOf(stage, plan, col, row), odd = (col * 7 + row * 3) % 5 === 0;
        let value;
        if (mat === MAT.FLOOR) value = open ? V.FLOOR_CAP : odd ? V.FLOOR_DK : V.FLOOR;
        else if (mat === MAT.PAPER) value = open ? V.PAPER_CAP : row & 1 ? V.NOTE_DK : V.NOTE;
        else if (mat === MAT.GALLERY) value = open ? V.GAL_CAP : odd ? V.GAL_DK : V.GAL;
        else if (mat === MAT.WALL) value = odd ? V.WALL_DK : V.WALL;
        else value = open ? V.DECK_CAP : V.DECK;
        for (let z = 0; z < DEPTH; z++) grid.set(c, row, z, value);
      }
    }
    const geo = terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: screen * SCREEN_X, y: 0, z: Z0 } });
    geo.voxel[1] = 0;
    return geo;
  };
  // The solids' fronts (z ZF, a little proud of the face), every piece under its cell's top edge.
  const solidFronts = (stage, plan, screen, flats) => {
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, x0 = col * CELL;
      for (let row = 0; row < stage.rows; row++) {
        if (!solid(stage, col, row)) continue;
        const mat = materialOf(stage, plan, col, row), y0 = row * CELL, top = y0 + CELL, open = !solid(stage, col, row + 1);
        // The walk edge on every top that can be stood on, unless a belt runs there (its band is the edge).
        if (open && !plan.beltCells.has(row * stage.cols + col)) flats.push(rect(x0, x0 + CELL, top - 0.05, top, ZF, BRASS, 0.08));
        if (mat === MAT.FLOOR || mat === MAT.DECK) {
          if (open) for (const x of [x0 + 0.125, x0 + 0.375]) flats.push(ngon(x, top - 0.12, 0.016, 0.016, ZF, mat === MAT.DECK ? STEEL_LT : STEEL, 0, 6));
          if (col % 3 === 0) flats.push(rect(x0 - 0.008, x0 + 0.008, y0, open ? top - 0.07 : top, ZF, IRON_DK));
        } else if (mat === MAT.PAPER) {
          // A bundle a cell: its sheets' edges, a kraft band and its seal dot.
          flats.push(rect(x0 + 0.02, x0 + CELL - 0.02, y0 + 0.02, y0 + 0.035, ZF, PAPER_DK), rect(x0 + 0.02, x0 + CELL - 0.02, top - (open ? 0.08 : 0.035), top - (open ? 0.065 : 0.02), ZF, PAPER));
          const bx = x0 + (row & 1 ? 0.3 : 0.2);
          flats.push(rect(bx - 0.045, bx + 0.045, y0 + 0.01, top - (open ? 0.06 : 0.01), ZF + 0.002, KRAFT), ngon(bx, y0 + 0.25, 0.022, 0.022, ZF + 0.004, RED, 0, 8));
        } else if (mat === MAT.GALLERY) {
          if (col % 2 === 0) flats.push(rect(x0 + 0.02, x0 + 0.05, y0, open ? top - 0.07 : top, ZF, GOLD, 0.12));
        } else if (mat === MAT.WALL) {
          const off = row & 1 ? 0.25 : 0;
          flats.push(rect(x0 + off, x0 + off + 0.015, y0, top, ZF, ROCK_DK), rect(x0, x0 + CELL, y0, y0 + 0.012, ZF, ROCK_DK));
        }
      }
    }
    // The hall's name on the floor's face at the door.
    if (screen === 0) flats.push(...word("THE RESERVE", 0.06, SCREEN_X / 2, plan.floorRow * CELL * 0.45, ZF + 0.002, BRASS, 0.15));
    // The gallery's seal on its highest block, under its top.
    if (plan.liftScreens.has(screen)) {
      // Each column's gallery top (its highest gallery cell's row), then the run of columns at the highest one.
      const tops = [];
      for (let c = 0; c < SCREEN_W; c++) {
        const col = screen * SCREEN_W + c;
        let t = -1;
        for (let row = stage.rows - 1; row >= plan.floorRow; row--) if (solid(stage, col, row)) { if (materialOf(stage, plan, col, row) === MAT.GALLERY) t = row; break; }
        tops.push(t);
      }
      const hi = Math.max(...tops);
      let best = null;
      if (hi >= 0) {
        const c0 = tops.indexOf(hi);
        let c1 = c0;
        while (c1 + 1 < SCREEN_W && tops[c1 + 1] === hi) c1++;
        best = { row: hi, c0: screen * SCREEN_W + c0, c1: screen * SCREEN_W + c1 };
      }
      if (best) flats.push(...seal((best.c0 + best.c1 + 1) / 2 * CELL, (best.row + 1) * CELL - 0.75, 0.32, ZF + 0.006, 0.25));
    }
  };

  // ---- the ledges ----------------------------------------------------------------------------------------------------
  // An iron catwalk in the back voxel: a brass walk edge flush with the cell's top, a channel with grating slots and a
  // truss under it.
  const catwalk = (flats, x0, x1, top) => {
    flats.push(B(x0, x1, top - 0.05, top, Z0, LEDGE_Z + 0.025, BRASS));
    flats.push(B(x0, x1, top - 0.17, top - 0.05, Z0, LEDGE_Z, IRON));
    for (let x = x0 + 0.04; x < x1 - 0.05; x += 0.1) flats.push(rect(x, x + 0.055, top - 0.15, top - 0.07, LEDGE_Z + 0.002, IRON_DK));
    flats.push(B(x0 + 0.03, x1 - 0.03, top - 0.38, top - 0.345, Z0 + 0.1, LEDGE_Z - 0.12, IRON_DK));
    const n = Math.max(1, Math.round((x1 - x0 - 0.06) / 0.25)), step = (x1 - x0 - 0.06) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + 0.03 + k * step, b = a + step;
      flats.push(k & 1 ? beam(a, top - 0.17, -0.8, b, top - 0.36, -0.8, 0.03, IRON_LT) : beam(a, top - 0.36, -0.8, b, top - 0.17, -0.8, 0.03, IRON_LT));
    }
    for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.25) flats.push(ngon(x, top - 0.11, 0.013, 0.013, LEDGE_Z + 0.003, BRASS_LT, 0, 6));
    flats.push(B(x0 - 0.02, x0 + 0.02, top - 0.38, top - 0.05, Z0, LEDGE_Z, IRON_DK), B(x1 - 0.02, x1 + 0.02, top - 0.38, top - 0.05, Z0, LEDGE_Z, IRON_DK));
  };
  const ledgeGeometry = (stage, screen) => {
    const flats = [];
    for (let row = 0; row < stage.rows; row++) for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (cellAt(stage, col, row) !== KIND.LEDGE) { c++; continue; }
      let e = c;
      while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.LEDGE) e++;
      catwalk(flats, col * CELL, (screen * SCREEN_W + e) * CELL, (row + 1) * CELL);
      c = e;
    }
    return flats.length ? flat(flats) : null;
  };

  // ---- the belts -----------------------------------------------------------------------------------------------------
  // A belt's bed on the solid face under its row's top: the housing, rollers, end drums and their brass caps (in the
  // sector, on the screen of its first column). Its moving band comes from `belts(stage)`.
  const BAND_H = 0.13, PITCH = 1.0;
  const beltSpan = ([c0, c1, row, v]) => ({ x0: c0 * CELL, x1: (c1 + 1) * CELL, top: (row + 1) * CELL, v });
  const beltBeds = (plan, screen, flats) => {
    for (const belt of plan.belts) {
      if (Math.floor(belt[0] / SCREEN_W) !== screen) continue;
      const { x0, x1, top } = beltSpan(belt);
      flats.push(rect(x0, x1, top - 0.4, top - BAND_H, ZF, IRON_DK), rect(x0, x1, top - 0.42, top - 0.39, ZF + 0.002, BRASS_DK));
      for (let x = x0 + 0.22; x < x1 - 0.15; x += 0.3) flats.push(ngon(x, top - 0.24, 0.06, 0.06, ZF + 0.004, STEEL_DK, 0, 10), ngon(x, top - 0.24, 0.022, 0.022, ZF + 0.006, BRASS, 0, 6));
      for (const x of [x0 + 0.1, x1 - 0.1]) flats.push(ngon(x, top - 0.2, 0.1, 0.1, ZF + 0.008, STEEL, 0, 12), ngon(x, top - 0.2, 0.04, 0.04, ZF + 0.01, BRASS_LT, 0.1, 8));
    }
  };
  // The moving band: dark rubber with a bill printed every half pitch and a gold chevron the belt's way, and a loose
  // sheet riding on top each pitch in the back half (behind the play band).
  const beltBand = (belt) => {
    const { x0, x1, top, v } = beltSpan(belt), dir = Math.sign(v), parts = [], zb = ZF + 0.03;
    parts.push(rect(x0 - PITCH, x1, top - BAND_H, top, zb, "#24211d"));
    for (let x = x0 - PITCH; x < x1; x += PITCH) {
      bill(parts, x + 0.27, top - 0.065, 0.3, 0.075, 0, zb + 0.002);
      const cx = x + 0.75;
      parts.push(fpoly(dir > 0 ? [[cx - 0.05, top - 0.11], [cx + 0.05, top - 0.065], [cx - 0.05, top - 0.02]] : [[cx + 0.05, top - 0.11], [cx + 0.05, top - 0.02], [cx - 0.05, top - 0.065]], zb + 0.002, GOLD, 0.3));
      // A loose sheet lying a little curled on the band's back half.
      parts.push(fpoly([[x + 0.4, top], [x + 0.62, top], [x + 0.6, top + 0.025], [x + 0.42, top + 0.035]], -0.72, PAPER), fpoly([[x + 0.43, top + 0.005], [x + 0.59, top + 0.005], [x + 0.58, top + 0.022], [x + 0.44, top + 0.03]], -0.718, NOTE));
    }
    const geo = flat(parts);
    geo.clipSlab = slabX(x0, x1);
    return geo;
  };

  // ---- the lifts -----------------------------------------------------------------------------------------------------
  // Each shaft: two brass guide rails and two cables from a sheave on the surface under the low stop up to the pulley
  // head PULLEY_UP over the high stop, behind the ledges (z about -1.06), so the cage rides them wherever it stands.
  const PULLEY_UP = 2.0, RAIL_Z = -1.06, CAGE_H = 1.5;
  const shaftOf = (stage, [col, width, lowRow, highRow]) => {
    const x0 = col * CELL, x1 = (col + width) * CELL, lowTop = (lowRow + 1) * CELL, highTop = (highRow + 1) * CELL;
    let floor = lowTop - 1.0;
    for (let row = lowRow - 1; row >= 0; row--) {
      let hit = false;
      for (let c = col; c < col + width; c++) if (cellAt(stage, c, row) !== KIND.EMPTY) hit = true;
      if (hit) { floor = (row + 1) * CELL; break; }
    }
    return { x0, x1, lowTop, highTop, sheave: floor + 0.16, pulley: highTop + PULLEY_UP, cables: [x0 + 0.28, x1 - 0.28] };
  };
  const shafts = (stage, plan, screen, flats) => {
    for (const lift of plan.lifts) {
      if (Math.floor(lift[0] / SCREEN_W) !== screen) continue;
      const s = shaftOf(stage, lift);
      for (const x of [s.x0 - 0.04, s.x1 + 0.04]) flats.push(B(x - 0.02, x + 0.02, s.sheave - 0.16, s.pulley, RAIL_Z - 0.03, RAIL_Z + 0.03, BRASS_DK));
      for (const cx of s.cables) {
        flats.push(B(cx - 0.011, cx + 0.011, s.sheave, s.pulley, RAIL_Z - 0.011, RAIL_Z + 0.011, INK));
        flats.push(disc(0.1, 0.04, cx, s.sheave, RAIL_Z - 0.04, STEEL, 0, 12), disc(0.03, 0.05, cx, s.sheave, RAIL_Z - 0.03, BRASS));
        flats.push(disc(0.16, 0.05, cx, s.pulley, RAIL_Z - 0.05, BRASS, 0.05, 16), disc(0.1, 0.06, cx, s.pulley, RAIL_Z - 0.045, IRON, 0, 12), disc(0.035, 0.07, cx, s.pulley, RAIL_Z - 0.04, BRASS_LT, 0.15, 8));
      }
      // The pulley head: a black crosshead with a brass crown between the wheels.
      const mid = (s.x0 + s.x1) / 2;
      flats.push(fpoly([[s.x0 - 0.1, s.pulley + 0.16], [s.x1 + 0.1, s.pulley + 0.16], [s.x1 - 0.1, s.pulley + 0.3], [s.x0 + 0.1, s.pulley + 0.3]], -1.1, IRON), fpoly([[mid - 0.3, s.pulley + 0.3], [mid + 0.3, s.pulley + 0.3], [mid, s.pulley + 0.62]], -1.09, BRASS, 0.08));
      flats.push(ngon(mid, s.pulley + 0.4, 0.06, 0.06, -1.085, VELVET, 0, 8));
    }
  };
  // A lift's brass cage, at its own columns with y 0 its walk surface: a deck with the walk edge (in the back voxel), a
  // back of brass bars with an arched crest and no roof, a velvet bench against them and the shackles on its cables.
  const cage = (lift) => {
    const [col, width] = lift, x0 = col * CELL, x1 = (col + width) * CELL, mid = (x0 + x1) / 2, parts = [];
    parts.push(B(x0, x1, -0.05, 0, Z0, LEDGE_Z + 0.025, BRASS), B(x0, x1, -0.16, -0.05, Z0, LEDGE_Z, VELVET_DK), B(x0 + 0.05, x1 - 0.05, -0.22, -0.16, Z0 + 0.05, LEDGE_Z - 0.05, IRON));
    for (let x = x0 + 0.1; x < x1 - 0.05; x += 0.2) parts.push(ngon(x, -0.105, 0.014, 0.014, LEDGE_Z + 0.002, BRASS_LT, 0, 6));
    for (let x = x0 + 0.06; x <= x1 - 0.05; x += 0.12) parts.push(B(x - 0.008, x + 0.008, 0, CAGE_H, -0.97, -0.955, BRASS));
    for (const y of [0.55, 1.05]) parts.push(rod(x0 + 0.03, y, x1 - 0.03, y, 0.01, -0.95, BRASS_DK));
    for (const x of [x0 + 0.03, x1 - 0.03]) parts.push(B(x - 0.025, x + 0.025, -0.02, CAGE_H + 0.05, -0.99, -0.6, BRASS_DK));
    arc(parts, mid, CAGE_H, (x1 - x0) / 2 - 0.05, 0.35, 0, PI, 10, 0.04, -0.95, BRASS, 0.05);
    parts.push(...seal(mid, CAGE_H + 0.16, 0.12, -0.945, 0.2));
    // The bench: a buttoned velvet back over a low seat.
    parts.push(BB(x0 + 0.25, x1 - 0.25, 0, 0.2, -0.95, -0.72, VELVET, 0.03), BB(x0 + 0.25, x1 - 0.25, 0.2, 0.62, -0.95, -0.88, VELVET, 0.03));
    for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.2) parts.push(ngon(x, 0.42, 0.013, 0.013, -0.878, GOLD, 0.2, 6));
    parts.push(B(x0 + 0.22, x0 + 0.27, 0, 0.66, -0.96, -0.86, BRASS_DK), B(x1 - 0.27, x1 - 0.22, 0, 0.66, -0.96, -0.86, BRASS_DK));
    for (const cx of [x0 + 0.28, x1 - 0.28]) parts.push(B(cx - 0.035, cx + 0.035, CAGE_H + 0.3, CAGE_H + 0.42, RAIL_Z - 0.03, RAIL_Z + 0.06, BRASS_LT));
    return flat(parts);
  };

  // ---- the paper storm -----------------------------------------------------------------------------------------------
  // The blizzard's bills fly faster than the gust pushes (art only), in two depth bands behind the play band.
  const STORM_PERIOD = 4, STORM_V = 3.2;
  const stormDepth = (rand) => rand() < 0.3 ? -0.33 - rand() * 0.12 : -1.15 - rand() * 1.05;
  const blizzard = (stage, plan, x0, x1, dir) => {
    const parts = [], rand = mulberry32(fnv1a(`reserve-storm:${stage.id}:${x0}:${dir}`)), y0 = plan.floorRow * CELL;
    for (let x = x0 - STORM_PERIOD; x < x1; x += 0.22) {
      for (let k = 0; k < 2; k++) {
        const bx = x + rand() * 0.22, by = y0 + 0.1 + rand() * (VIEW_Y - y0 - 0.2), z = stormDepth(rand), a = (rand() - 0.5) * 0.9 - dir * 0.25;
        const tail = 0.25 + rand() * 0.4;
        parts.push(strip(bx - dir * 0.08, by, bx - dir * (0.08 + tail), by + (rand() - 0.5) * 0.06, 0.012, z - 0.003, "#dfe2d4", 0.25));
        bill(parts, bx, by, 0.15, 0.07, a, z);
      }
    }
    const geo = flat(parts);
    geo.clipSlab = slabX(x0, x1);
    return geo;
  };
  // Bills lifting off the tops in the zone: a few over each column's highest surface, behind the play band.
  const stir = (stage, plan, x0, x1) => {
    const parts = [], rand = mulberry32(fnv1a(`reserve-stir:${stage.id}:${x0}`));
    for (let col = Math.round(x0 / CELL); col * CELL < x1; col += 2) {
      let top = -1;
      for (let row = stage.rows - 1; row >= 0; row--) if (cellAt(stage, col, row) !== KIND.EMPTY) { top = (row + 1) * CELL; break; }
      if (top < 0) continue;
      for (let k = 0; k < 2; k++) bill(parts, col * CELL + rand() * 0.5, top + 0.08 + rand() * 0.5, 0.15, 0.07, (rand() - 0.5) * 1.6, -1.15 - rand() * 0.4);
    }
    return flat(parts);
  };

  // ---- the dressing --------------------------------------------------------------------------------------------------
  // Depths, all behind the play band: the Engine's housing (-0.35 to -0.55), screws and stems (to -0.75), the press
  // frames (-1.35 to -1.05), lamps and racks (-1.6), the Engine's wall (-1.75) and the hall's piers (-2.7 to -2.4).
  const SUB = 12, PIER_W = 0.7, SPRING = 5.5, FRAME_Z0 = -1.35, FRAME_Z1 = -1.05, FRAME_TOP = 6.2, FRAME_GAP = 0.25;
  const RACK_Z = -1.6, LAMP_Z = -1.6, WALL_Z = -1.75, WALL_SPAN = 7.5;
  const pier = (flats, x, y0) => {
    flats.push(B(x - PIER_W / 2, x + PIER_W / 2, y0, VIEW_Y + 2, -2.7, -2.4, BRICK));
    for (let y = y0 + 0.25; y < VIEW_Y + 2; y += 0.25) flats.push(rect(x - PIER_W / 2, x + PIER_W / 2, y - 0.012, y, -2.398, BRICK_DK));
    for (let y = y0 + 0.5; y < VIEW_Y + 2; y += 1) flats.push(rect(x - PIER_W / 2 - 0.04, x - PIER_W / 2 + 0.2, y - 0.25, y, -2.39, STONE), rect(x + PIER_W / 2 - 0.2, x + PIER_W / 2 + 0.04, y - 0.5, y - 0.25, -2.39, STONE));
  };
  const lamp = (flats, x, y) => {
    flats.push(rect(x - 0.008, x + 0.008, y + 0.18, VIEW_Y + 2, LAMP_Z, INK));
    flats.push(fpoly([[x - 0.06, y + 0.18], [x + 0.06, y + 0.18], [x + 0.22, y], [x - 0.22, y]], LAMP_Z + 0.004, "#1f3a2c"), rect(x - 0.22, x + 0.22, y - 0.02, y, LAMP_Z + 0.006, BRASS));
    flats.push(ngon(x, y - 0.03, 0.08, 0.05, LAMP_Z + 0.008, LAMP_LT, 1.2, 10), ngon(x, y - 0.04, 0.3, 0.12, LAMP_Z - 0.05, LAMP, 0.35, 12));
  };
  // A riveted black press frame over a ram: two columns either side of its box from its floor up past the view, a crown
  // beam with the screw's brass nut at FRAME_TOP over the floor.
  const pressFrame = (flats, ram) => {
    const half = RULES.SHOT_BOX[SPEC.RAM[0]][1] + FRAME_GAP, top = ram.y + FRAME_TOP;
    for (const x of [ram.x - half, ram.x + half]) {
      flats.push(B(x - 0.14, x + 0.14, ram.y - 0.05, top + 0.4, FRAME_Z0, FRAME_Z1, INK));
      flats.push(rect(x - 0.12, x - 0.09, ram.y, top + 0.4, FRAME_Z1 + 0.002, IRON_LT));
      for (let y = ram.y + 0.2; y < top; y += 0.3) flats.push(ngon(x + 0.05, y, 0.016, 0.016, FRAME_Z1 + 0.003, STEEL_LT, 0, 6));
      flats.push(fpoly([[x - 0.24, ram.y - 0.05], [x + 0.24, ram.y - 0.05], [x + 0.14, ram.y + 0.28], [x - 0.14, ram.y + 0.28]], FRAME_Z1 + 0.004, IRON));
    }
    flats.push(B(ram.x - half - 0.25, ram.x + half + 0.25, top, top + 0.5, FRAME_Z0, FRAME_Z1, INK));
    flats.push(B(ram.x - 0.3, ram.x + 0.3, top - 0.25, top + 0.05, -0.85, -0.6, BRASS_DK));
  };
  // Drying racks across a gust zone: posts every RACK_STEP with cords slung between them and bills pegged on the cords.
  const RACK_STEP = 4;
  const racks = (stage, plan, screen, flats, rand) => {
    const sx0 = screen * SCREEN_X, sx1 = sx0 + SCREEN_X;
    for (const [from, to] of plan.gusts) {
      const x0 = from * CELL, x1 = (to + 1) * CELL;
      for (let x = x0 + 1; x < x1 - 0.5; x += RACK_STEP) {
        if (x < sx0 || x >= sx1) continue;
        flats.push(B(x - 0.05, x + 0.05, 0, 5.1, RACK_Z - 0.05, RACK_Z + 0.05, IRON), fpoly([[x - 0.05, 5.1], [x + 0.05, 5.1], [x, 5.3]], RACK_Z + 0.052, IRON));
        const nx = Math.min(x + RACK_STEP, x1 - 0.5);
        if (nx <= x + 0.5) continue;
        for (const [y, sag] of [[4.7, 0.25], [3.9, 0.2]]) {
          let px = x, py = y;
          for (let k = 1; k <= 8; k++) {
            const t = k / 8, cx = x + (nx - x) * t, cy = y - Math.sin(t * PI) * sag;
            flats.push(strip(px, py, cx, cy, 0.012, RACK_Z + 0.01, "#cbbf9e"));
            if (k < 8 && rand() < 0.8) bill(flats, cx, cy - 0.06, 0.08, 0.13, (rand() - 0.5) * 0.15, RACK_Z + 0.012);
            px = cx; py = cy;
          }
        }
      }
    }
  };
  // The gallery's gilt railing along the tops of its blocks: turned balusters and a round handrail, set back.
  const railing = (stage, plan, screen, flats) => {
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c;
      for (let row = stage.rows - 1; row >= plan.floorRow; row--) {
        if (!solid(stage, col, row)) continue;
        if (materialOf(stage, plan, col, row) !== MAT.GALLERY) break;
        const top = (row + 1) * CELL, x0 = col * CELL;
        for (const x of [x0 + 0.125, x0 + 0.375]) flats.push(B(x - 0.02, x + 0.02, top, top + 0.72, -0.92, -0.88, GOLD), ngon(x, top + 0.36, 0.035, 0.05, -0.875, GOLD_LT, 0.1, 8));
        flats.push(roundRod(x0, top + 0.78, x0 + CELL, top + 0.78, 0.03, -0.9, GOLD, 0.1));
        break;
      }
    }
  };
  // The Chairman's Engine: its wall of black enamel and brass from WALL_SPAN short of the far wall's face to it, gauges
  // and pipes, the gantry the presses hang from along the view's top, and the core's housing round its box (set back
  // just outside the play band), read from the CHAIRMAN_ENGINE record.
  const engineWall = (stage, plan, screen, flats) => {
    for (const e of plan.engines) {
      if (Math.floor(e.col / SCREEN_W) !== screen) continue;
      let wc = e.col;
      while (wc < stage.cols && !solid(stage, wc, e.row)) wc++;
      if (wc >= stage.cols) throw new Error(`raid-art-reserve: ${stage.id}'s Engine at column ${e.col} has no wall behind it`);
      const xw = wc * CELL, xl = xw - WALL_SPAN, y0 = e.y - 0.02, y1 = VIEW_Y + 1.5;
      flats.push(rect(xl, xw, y0, y1, WALL_Z, INK));
      for (let x = xl + 0.25; x < xw; x += 1.5) flats.push(rect(x, x + 0.12, y0, y1, WALL_Z + 0.003, BRASS_DK, 0.05), rect(x + 0.02, x + 0.04, y0, y1, WALL_Z + 0.005, BRASS, 0.08));
      for (let x = xl + 1; x < xw - 0.5; x += 1.5) for (let y = e.y + 1.3; y < VIEW_Y; y += 1.6) {
        flats.push(ngon(x, y, 0.2, 0.2, WALL_Z + 0.006, BRASS, 0.05, 14), ngon(x, y, 0.16, 0.16, WALL_Z + 0.009, PAPER_DK, 0.1, 14));
        const a = (x * 1.7 + y) % PI;
        flats.push(strip(x, y, x + Math.cos(a) * 0.13, y + Math.sin(a) * 0.13, 0.018, WALL_Z + 0.012, RED));
      }
      for (const x of [xl + 0.6, xl + 3.6]) flats.push(B(x - 0.06, x + 0.06, y0, y1, WALL_Z + 0.02, WALL_Z + 0.14, "#5a4a2a"));
      // The gantry, a riveted girder along the view's top, and its trusses.
      flats.push(B(xw - WALL_SPAN + 0.5, xw, VIEW_Y - 0.35, VIEW_Y + 0.1, -0.75, -0.48, IRON));
      for (let x = xw - WALL_SPAN + 0.6; x < xw; x += 0.3) flats.push(ngon(x, VIEW_Y - 0.12, 0.018, 0.018, -0.477, BRASS_LT, 0, 6));
      for (let x = xw - WALL_SPAN + 0.5; x < xw - 0.5; x += 1) flats.push(beam(x, VIEW_Y + 0.1, -0.62, x + 0.5, VIEW_Y + 0.9, -0.62, 0.05, IRON_DK), beam(x + 1, VIEW_Y + 0.1, -0.62, x + 0.5, VIEW_Y + 0.9, -0.62, 0.05, IRON_DK));
      // The core's housing: a dark casing from the floor up into the wall past the view (no top within reach), a dark
      // recess round the core's box, and the printing cylinder's ends either side, banded in brass.
      const cy = e.y + SPEC.CHAIRMAN_ENGINE[1];
      flats.push(B(e.x - 1.0, Math.min(xw, e.x + 1.0), e.y, y1, -1.0, -0.6, IRON_DK));
      for (let x = e.x - 0.9; x < Math.min(xw, e.x + 1.0); x += 0.3) flats.push(ngon(x, cy + 1.2, 0.018, 0.018, -0.598, STEEL, 0, 6));
      for (const s of [-1, 1]) {
        const x = e.x + s * 0.85;
        flats.push(B(x - 0.12, x + 0.12, cy - 0.7, cy + 0.7, -0.58, -0.5, STEEL_DK), rect(x - 0.12, x + 0.12, cy - 0.04, cy + 0.04, -0.498, BRASS, 0.1));
      }
      flats.push(disc(0.68, 0.08, e.x, cy, -0.42, INK, 0, 24));
      // The pod's dock: two clamp jaws either side of where the pod docks (the Engine's record plus the pod's F13 mount),
      // each on a diagonal strut from the casing, set back behind the docked pod.
      const [mx, my] = podMount(), dx = e.x + mx, dy = e.y + my;
      for (const s of [-1, 1]) {
        const jx = dx + s * 0.6;
        flats.push(beam(jx, dy - 0.05, -0.62, e.x + s * 0.2 + 0.4, dy - 0.75, -0.62, 0.07, IRON_LT));
        flats.push(fpoly([[jx - 0.08, dy - 0.16], [jx + 0.08, dy - 0.16], [jx + 0.08, dy + 0.12], [jx, dy + 0.2], [jx - 0.08, dy + 0.12]], -0.52, BRASS_DK, 0.05));
        flats.push(ngon(jx, dy, 0.03, 0.03, -0.515, BRASS_LT, 0.1, 6));
      }
      // The muzzle the Engine fires from in the pod phase (its record plus TUNE.ENGINE_TOP_AT): a brass ring with a dark
      // bore on a sloped bracket, set back.
      const tx = e.x + TOP_AT[0], ty = e.y + TOP_AT[1];
      flats.push(fpoly([[tx + 0.08, ty - 0.08], [tx + 0.5, ty - 0.08], [tx + 0.5, ty + 0.25]], -0.5, IRON));
      flats.push(disc(0.13, 0.08, tx, ty, -0.45, BRASS, 0.1, 14), disc(0.07, 0.09, tx, ty, -0.44, INK, 0, 10));
      // In front of the wall's uprights (WALL_Z + 0.14), one of which stands across it.
      flats.push(...word("RESERVE", 0.05, e.x - 2.2, e.y + 0.55, WALL_Z + 0.15, GOLD, 0.25));
    }
  };
  // Under the floor: the island's rock to SUB metres down below every solid column, a dark shaft below every pit; and
  // the rock either side of the stage's ends.
  const underground = (stage, screen, flats) => {
    for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c, pit = cellAt(stage, col, 0) === KIND.EMPTY;
      let e = c;
      while (e < SCREEN_W && (cellAt(stage, screen * SCREEN_W + e, 0) === KIND.EMPTY) === pit) e++;
      const x0 = col * CELL, x1 = (screen * SCREEN_W + e) * CELL;
      flats.push(pit ? rect(x0, x1, -SUB, 0, Z0, "#0c0b0a") : rect(x0, x1, -SUB, 0, Z1, ROCK));
      if (!pit) for (let y = -1.3; y > -SUB; y -= 1.7) flats.push(rect(x0, x1, y - 0.04, y, Z1 + 0.002, ROCK_DK));
      c = e;
    }
    if (screen === 0) {
      flats.push(B(-6, 0, -SUB, VIEW_Y + 2, Z0, Z1, BRICK_DK));
      const fy = (() => { let r = 0; while (solid(stage, 0, r)) r++; return r * CELL; })();
      flats.push(rect(-2.4, -0.4, fy, fy + 3, ZF, IRON), rect(-2.3, -1.42, fy, fy + 2.9, ZF + 0.002, IRON_DK), rect(-1.38, -0.5, fy, fy + 2.9, ZF + 0.002, IRON_DK));
      flats.push(...seal(-1.4, fy + 2.2, 0.3, ZF + 0.004, 0.2));
    }
    if (screen === stage.screens - 1) flats.push(B(stage.cols * CELL, stage.cols * CELL + 6, -SUB, VIEW_Y + 2, Z0, Z1, BRICK_DK));
  };
  const dressingGeometry = (stage, plan, screen, rand) => {
    const flats = [], sx = screen * SCREEN_X, lock = screen === stage.lockScreen;
    // The hall's piers, one at each screen's left edge, and the arch springing from it toward the next.
    pier(flats, sx, 0);
    if (screen === stage.screens - 1) pier(flats, sx + SCREEN_X, 0);
    arc(flats, sx + SCREEN_X / 2, SPRING, SCREEN_X / 2 - PIER_W / 2, 3.2, 0, PI, 14, 0.45, -2.45, BRICK);
    arc(flats, sx + SCREEN_X / 2, SPRING, SCREEN_X / 2 - PIER_W / 2 - 0.22, 2.98, 0.05, PI - 0.05, 14, 0.05, -2.44, STONE);
    if (!lock) for (const lx of [2.2, 5.8]) lamp(flats, sx + lx, 5.7 + rand() * 0.4);
    for (const ram of plan.rams) if (ram.x >= sx && ram.x < sx + SCREEN_X) pressFrame(flats, ram);
    racks(stage, plan, screen, flats, rand);
    railing(stage, plan, screen, flats);
    engineWall(stage, plan, screen, flats);
    shafts(stage, plan, screen, flats);
    beltBeds(plan, screen, flats);
    underground(stage, screen, flats);
    solidFronts(stage, plan, screen, flats);
    return flat(flats);
  };

  // One screen's geometries, cached by stage and screen.
  const sectors = new Map();
  const sector = (stage, screen) => {
    const key = stage.id + ":" + screen;
    let list = sectors.get(key);
    if (list) return list;
    if (!(Number.isInteger(screen) && screen >= 0 && screen < stage.screens)) throw new RangeError(`raid-art-reserve: ${stage.id} has no screen ${screen}`);
    checkSpec();
    const plan = planOf(stage), rand = mulberry32(fnv1a("reserve:" + key));
    list = [solidGeometry(stage, plan, screen), ledgeGeometry(stage, screen), dressingGeometry(stage, plan, screen, rand)].filter(Boolean);
    sectors.set(key, list);
    return list;
  };
  const byStage = (build) => {
    const cache = new Map();
    return (stage) => cache.get(stage.id) || cache.set(stage.id, build(stage)).get(stage.id);
  };
  const belts = byStage((stage) => planOf(stage).belts.map((belt) => {
    const { x0, x1, top, v } = beltSpan(belt);
    return Object.freeze({ geometry: beltBand(belt), x0, x1, top, v, pitch: PITCH, shift: (time) => wrap(v * time, PITCH) });
  }));
  const lifts = byStage((stage) => planOf(stage).lifts.map((lift) => {
    const s = shaftOf(stage, lift);
    return Object.freeze({ geometry: cage(lift), x0: s.x0, width: s.x1 - s.x0, lowY: s.lowTop, highY: s.highTop });
  }));
  const storm = byStage((stage) => {
    const plan = planOf(stage);
    return Object.freeze({
      zones: plan.gusts.map(([from, to, dir]) => {
        const x0 = from * CELL, x1 = (to + 1) * CELL, left = blizzard(stage, plan, x0, x1, -1), right = blizzard(stage, plan, x0, x1, 1);
        const bad = (d) => { throw new RangeError(`raid-art-reserve: a blizzard blows -1 or 1 (gustDir), not ${d}`); };
        return Object.freeze({
          x0, x1, dir, stir: stir(stage, plan, x0, x1), period: STORM_PERIOD,
          blizzard: (d) => d === -1 ? left : d === 1 ? right : bad(d),
          shift: (time, d) => d === -1 || d === 1 ? wrap(d * STORM_V * time, STORM_PERIOD) : bad(d)
        });
      })
    });
  });

  // The printing cylinder seen through the open core: its engraved rows, laid over the port's inner square in stage
  // metres at each CHAIRMAN_ENGINE record and one period below it, clipped to the square's height (`clipSlab`); the
  // scene shows it while the core is open (pick "build") with its node at (0, shift(time)), so the rows roll down.
  const SPIN_V = 0.6, ROW_PITCH = 0.14, CYL_HALF = 0.29;
  const cylinderRows = (e) => {
    const cy = e.y + SPEC.CHAIRMAN_ENGINE[1], parts = [];
    for (let y = cy - CYL_HALF - ROW_PITCH; y < cy + CYL_HALF + ROW_PITCH; y += ROW_PITCH) {
      // Grooves cut dark into the white-hot face, so the roll reads through the glow.
      parts.push(rect(e.x - CYL_HALF, e.x + CYL_HALF, y, y + 0.022, 0.1145, "#a8481a", 0.45), rect(e.x - CYL_HALF * 0.8, e.x + CYL_HALF * 0.8, y + 0.07, y + 0.082, 0.1145, "#c86a26", 0.55));
      for (let k = -2; k <= 2; k++) parts.push(rect(e.x + k * 0.11 - 0.025, e.x + k * 0.11 + 0.025, y + 0.035, y + 0.055, 0.1146, "#8a3612", 0.4));
    }
    const geo = flat(parts);
    geo.clipSlab = new Float32Array([0, 1 / CYL_HALF, 0, -cy / CYL_HALF]);
    return geo;
  };
  const cylinders = byStage((stage) => planOf(stage).engines.map((e) => Object.freeze({
    geometry: cylinderRows(e), x: e.x, y: e.y, period: ROW_PITCH, shift: (time) => wrap(-SPIN_V * time, ROW_PITCH)
  })));

  // ---- the backdrop --------------------------------------------------------------------------------------------------
  const FAR_Z = -10, NEAR_Z = -6, BACK_Z = -14, FAR_RATE = 0.25, NEAR_RATE = 0.5;
  const backdrop = byStage((stage) => {
    const run = stage.lockScreen * SCREEN_X, Y0 = -SUB, Y1 = 11;
    // The far vault: warm rock, rib arches springing from piers into the dark crown, lamps on chains and rows of
    // presses in the haze at the floor.
    const far = [], fRand = mulberry32(83), fTo = run * FAR_RATE + 24;
    far.push(rect(-16, fTo, Y0, Y1, 0, "#2a221d", 0.2));
    for (let x = -16; x < fTo; x += 3.2) {
      far.push(rect(x - 0.22, x + 0.22, Y0, 3.4, 0.02, "#3a2e26", 0.2));
      arc(far, x + 1.6, 3.4, 1.6, 5.2, 0, PI, 12, 0.18, 0.03, "#4a3b2e", 0.25);
      arc(far, x + 1.6, 3.4, 1.4, 4.9, 0.1, PI - 0.1, 12, 0.04, 0.035, "#7a5c2e", 0.35);
      const lx = x + 1.6, ly = 4.6 + fRand() * 1.2;
      far.push(rect(lx - 0.01, lx + 0.01, ly, Y1, 0.04, "#1a1512", 0.2), ngon(lx, ly, 0.07, 0.07, 0.05, LAMP, 1.1, 8), ngon(lx, ly, 0.35, 0.25, 0.045, "#6a4a22", 0.5, 12));
    }
    for (let x = -16; x < fTo; x += 1.6 + fRand() * 1.4) {
      const w = 0.7 + fRand() * 0.6, h = 0.9 + fRand() * 0.8;
      far.push(rect(x, x + w, -0.3, h, 0.06, "#211b17", 0.25), ngon(x + w / 2, h, w * 0.3, w * 0.3, 0.065, "#211b17", 0.25, 12));
    }
    far.push(rect(-16, fTo, Y0, -0.3, 0.07, "#1a1512", 0.2));
    // The near hall: drying racks hung with lines of bills, bale stacks and the warm pools under lamps.
    const near = [], nRand = mulberry32(97), nTo = run * NEAR_RATE + 24;
    for (let x = -16; x < nTo; x += 2.6 + nRand() * 1.8) {
      near.push(ngon(x, 1.2, 1.2, 0.5, -0.05, "#4a3418", 0.45, 14));
      near.push(rect(x - 0.04, x + 0.04, -0.2, 3.2, 0, "#2a211b", 0.3), rect(x + 1.6 - 0.04, x + 1.6 + 0.04, -0.2, 3.2, 0, "#2a211b", 0.3));
      for (const y of [2.9, 2.3]) {
        near.push(strip(x, y, x + 1.6, y, 0.015, 0.01, "#6b5d48", 0.3));
        for (let bx = x + 0.12; bx < x + 1.55; bx += 0.18) near.push(rect(bx - 0.05, bx + 0.05, y - 0.16, y - 0.01, 0.02, nRand() < 0.5 ? "#4e6b45" : "#5c7a50", 0.3));
      }
      if (nRand() < 0.6) {
        const bx = x + 1.9 + nRand() * 0.4;
        for (let k = 0; k < 3; k++) near.push(rect(bx, bx + 0.6, -0.2 + k * 0.35, 0.12 + k * 0.35, 0.03, k & 1 ? "#3e5638" : "#4a6642", 0.3), rect(bx + 0.26, bx + 0.34, -0.2 + k * 0.35, 0.12 + k * 0.35, 0.035, "#6b4f2a", 0.3));
      }
    }
    near.push(rect(-16, nTo, Y0, -0.2, 0.04, "#161210", 0.25));
    const backing = rect(-120, 120, -40, 40, 0, "#120e0b", 0.3);
    return {
      layers: [
        { geometry: flat(far), rate: FAR_RATE, y: 0, z: FAR_Z },
        { geometry: flat(near), rate: NEAR_RATE, y: 0, z: NEAR_Z }
      ],
      sky: [{ geometry: flat([backing]), y: VIEW_Y / 2, z: BACK_Z }]
    };
  });

  // ---- the boss and the rams -----------------------------------------------------------------------------------------
  // RAM: a steel block filling its armour box's width, its die plate under it and the fiat seal on its face, warning
  // lamps at its shoulders. Box: x +-1.344, y -1.156 to +0.969 about its anchor; the die's face is 1.0 under it.
  const ramBlock = (warn) => {
    const p = [
      BB(-1.33, 1.33, -0.8, 0.965, -0.27, 0.27, IRON, 0.012),
      B(-1.335, 1.335, -1.0, -0.8, -0.29, 0.29, STEEL_DK),
      rect(-0.36, 0.36, 0.9, 0.955, 0.272, BRASS, 0.1)
    ];
    for (let x = -1.3; x < 1.22; x += 0.16) p.push(fpoly([[x, -0.8], [x + 0.08, -0.8], [x + 0.13, -0.72], [x + 0.05, -0.72]], 0.276, BRASS_DK));
    for (let x = -1.15; x <= 1.16; x += 0.23) p.push(ngon(x, 0.8, 0.02, 0.02, 0.272, STEEL_LT, 0, 6), ngon(x, -0.62, 0.02, 0.02, 0.272, STEEL_LT, 0, 6));
    for (let y = -0.45; y < 0.7; y += 0.23) for (const x of [-1.18, 1.18]) p.push(ngon(x, y, 0.02, 0.02, 0.272, STEEL_LT, 0, 6));
    p.push(...seal(0, 0.06, 0.42, 0.272, warn ? 0.4 : 0.15));
    for (let x = -1.2; x < 1.25; x += 0.12) p.push(fpoly([[x, -1.0], [x + 0.12, -1.0], [x + 0.06, -0.94]], 0.292, STEEL_LT));
    for (const x of [-1.04, 1.04]) p.push(ngon(x, 0.6, 0.075, 0.075, 0.274, warn ? "#ff3a2a" : "#4a1612", warn ? 1.3 : 0.05, 10));
    return noShadow(merge(...p));
  };
  // The ram's screw: a threaded steel shaft from the block's top up through its frame's nut, set back.
  const ramScrew = () => {
    const top = 0.96 + 6.4, p = [B(-0.15, 0.15, 0.96, top, -0.72, -0.4, STEEL_DK), B(-0.24, 0.24, 0.9, 1.12, -0.76, -0.36, BRASS_DK)];
    for (let y = 1.14; y < top - 0.1; y += 0.14) p.push(fpoly([[-0.15, y], [0.15, y + 0.06], [0.15, y + 0.1], [-0.15, y + 0.04]], -0.395, STEEL_LT));
    return noShadow(merge(...p));
  };
  // ENGINE_PRESS: a black press head on a toothed die, the foot at origin - 1.0; shut behind brass shutters, open
  // (down) on its glowing ink core. Box as the ram's.
  const pressHead = (open, warn) => {
    const p = [
      BB(-1.33, 1.33, -0.62, 0.965, -0.26, 0.26, INK, 0.012),
      B(-1.335, 1.335, -1.0, -0.62, -0.28, 0.28, STEEL),
      rect(-0.3, 0.3, 0.9, 0.955, 0.262, BRASS, 0.1),
      rect(-1.2, -1.12, -0.58, 0.88, 0.262, BRASS_DK, 0.05), rect(1.12, 1.2, -0.58, 0.88, 0.262, BRASS_DK, 0.05), rect(-1.2, 1.2, 0.8, 0.88, 0.262, BRASS_DK, 0.05),
      rect(-0.54, 0.54, -0.44, 0.64, 0.262, IRON_DK)
    ];
    for (let k = 0; k < 20; k++) { const x = -1.335 + k * 0.1335; p.push(fpoly([[x, -1.0], [x + 0.1335, -1.0], [x + 0.1335, -0.92], [x + 0.067, -0.86], [x, -0.92]], 0.282, k & 1 ? STEEL_LT : STEEL)); }
    if (open) {
      p.push(rect(-0.5, 0.5, -0.4, 0.6, 0.266, "#1f5a34", 0.7));
      for (let y = -0.3; y < 0.55; y += 0.17) p.push(rect(-0.48, 0.48, y, y + 0.035, 0.268, INK_GLOW, 1.1));
      p.push(...seal(0, 0.1, 0.2, 0.27, 0.9, "#123a22"));
    } else {
      p.push(rect(-0.5, -0.012, -0.4, 0.6, 0.266, BRASS_DK, 0.05), rect(0.012, 0.5, -0.4, 0.6, 0.266, BRASS_DK, 0.05));
      for (let y = -0.32; y < 0.55; y += 0.12) p.push(rect(-0.48, -0.03, y, y + 0.012, 0.268, "#5e4818"), rect(0.03, 0.48, y, y + 0.012, 0.268, "#5e4818"));
      for (const y of [-0.25, 0.1, 0.45]) p.push(ngon(-0.05, y, 0.022, 0.022, 0.27, BRASS_LT, 0.1, 6), ngon(0.05, y, 0.022, 0.022, 0.27, BRASS_LT, 0.1, 6));
    }
    for (const x of [-0.86, 0.86]) p.push(ngon(x, 0.62, 0.07, 0.07, 0.264, warn ? "#ff3a2a" : "#4a1612", warn ? 1.3 : 0.05, 10));
    for (const x of [-0.86, 0.86]) for (let y = -0.45; y < 0.45; y += 0.18) p.push(ngon(x, y, 0.018, 0.018, 0.263, STEEL_LT, 0, 6));
    return noShadow(merge(...p));
  };
  const pressStem = () => {
    const top = 0.96 + 4.6, p = [B(-0.09, 0.09, 0.96, top, -0.42, -0.32, STEEL_DK)];
    for (let y = 1.3; y < top; y += 0.6) p.push(rect(-0.09, 0.09, y, y + 0.05, -0.318, BRASS, 0.08));
    return noShadow(merge(...p));
  };
  // ENGINE_POD: the Chairman's chair-pod, a gold-framed bubble with the seal on its front; docked behind brass lids,
  // flying with its jets lit. Boss box: +-0.531 about its middle.
  const pod = (flying) => {
    // A square armoured frame fills the box (what looks hittable is hittable), the gold bubble ring set in it, brass
    // corner fins and the docking lugs on its flanks.
    const p = [BB(-0.53, 0.53, -0.53, 0.53, -0.09, 0.06, BRASS_DK, 0.02), disc(0.47, 0.16, 0, 0, 0, GOLD, 0.15, 24), disc(0.42, 0.18, 0, 0.02, 0, "#1f3640", 0.15, 22)];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const fin = [[sx * 0.515, sy * 0.515], [sx * 0.315, sy * 0.515], [sx * 0.515, sy * 0.315]];
      p.push(fpoly(sx * sy > 0 ? fin : fin.reverse(), 0.062, GOLD, 0.2));
      p.push(ngon(sx * 0.46, sy * 0.46, 0.018, 0.018, 0.065, BRASS_LT, 0.1, 6));
    }
    for (const sx of [-1, 1]) p.push(rect(Math.min(sx * 0.475, sx * 0.525), Math.max(sx * 0.475, sx * 0.525), -0.08, 0.08, 0.063, INK), rect(Math.min(sx * 0.485, sx * 0.515), Math.max(sx * 0.485, sx * 0.515), -0.06, 0.06, 0.064, STEEL));
    if (flying) {
      // The Chairman: a black suit, his chain of office, a stern face and a tall hat.
      p.push(fpoly([[-0.3, -0.3], [0.3, -0.3], [0.24, -0.02], [0.1, 0.06], [-0.1, 0.06], [-0.24, -0.02]], 0.095, INK));
      p.push(fpoly([[-0.03, 0.04], [0.03, 0.04], [0.06, -0.2], [-0.06, -0.2]], 0.097, SHIRT), fpoly([[-0.012, 0.03], [0.012, 0.03], [0.02, -0.15], [-0.02, -0.15]], 0.099, RED));
      arc(p, 0, 0.02, 0.15, 0.17, PI * 1.15, PI * 1.85, 8, 0.018, 0.1, GOLD_LT, 0.3);
      p.push(ngon(0, -0.15, 0.03, 0.03, 0.102, GOLD_LT, 0.4, 8));
      p.push(ngon(0, 0.15, 0.09, 0.105, 0.098, SKIN, 0, 12), rect(-0.06, 0.06, 0.155, 0.17, 0.101, EYE), ngon(0.04, 0.162, 0.022, 0.022, 0.103, GOLD_LT, 0.3, 8));
      p.push(rect(-0.035, 0.035, 0.085, 0.097, 0.101, MOUTH), rect(-0.11, 0.11, 0.24, 0.26, 0.1, INK), rect(-0.07, 0.07, 0.26, 0.38, 0.1, INK), rect(-0.07, 0.07, 0.27, 0.29, 0.102, RED));
      p.push(fpoly([[-0.3, 0.2], [-0.24, 0.3], [-0.12, 0.36], [-0.14, 0.32], [-0.24, 0.26]], 0.105, "#cfe6ee", 0.4));
      for (const s of [-1, 1]) p.push(rect(s * 0.33 - 0.07, s * 0.33 + 0.07, -0.5, -0.43, 0.066, STEEL_DK), fpoly([[s * 0.33 - 0.05, -0.5], [s * 0.33, -0.528], [s * 0.33 + 0.05, -0.5]], 0.068, CORE_GLOW, 1.3));
    } else {
      p.push(fpoly([[0, -0.43], [0, 0.45], [-0.22, 0.39], [-0.38, 0.22], [-0.44, 0.0], [-0.38, -0.22], [-0.22, -0.38]], 0.095, BRASS_DK, 0.05));
      p.push(fpoly([[0, -0.43], [0.22, -0.38], [0.38, -0.22], [0.44, 0], [0.38, 0.22], [0.22, 0.39], [0, 0.45]], 0.095, BRASS_DK, 0.05));
      p.push(rect(-0.008, 0.008, -0.42, 0.44, 0.097, INK));
      for (let k = 0; k < 14; k++) { const a = k / 14 * PI * 2; p.push(ngon(Math.cos(a) * 0.37, Math.sin(a) * 0.37 + 0.01, 0.018, 0.018, 0.098, BRASS_LT, 0.1, 6)); }
    }
    p.push(...seal(0, -0.37, 0.11, 0.105, 0.3));
    return noShadow(merge(...p));
  };
  // CHAIRMAN_ENGINE: the core's round port in its brass bezel about origin 1.0: slatted shut, glowing through the slats
  // while it heats, and open on the white-hot printing cylinder. Boss box: +-0.531, 0.469 to 1.531 over its feet.
  const ENGINE_O = SPEC.CHAIRMAN_ENGINE[1];
  const core = (mode) => {
    // A square brass bezel plate fills the box, the round port in it.
    const p = [BB(-0.53, 0.53, ENGINE_O - 0.53, ENGINE_O + 0.53, -0.1, 0.07, BRASS_DK, 0.02), disc(0.48, 0.2, 0, ENGINE_O, 0, BRASS, 0.1, 24), disc(0.43, 0.22, 0, ENGINE_O, 0, INK, 0, 22)];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) p.push(ngon(sx * 0.46, ENGINE_O + sy * 0.46, 0.028, 0.028, 0.072, BRASS_LT, 0.15, 6));
    for (let k = 0; k < 12; k++) { const a = k / 12 * PI * 2 + 0.26; p.push(ngon(Math.cos(a) * 0.455, ENGINE_O + Math.sin(a) * 0.455, 0.018, 0.018, 0.112, BRASS_LT, 0.15, 6)); }
    if (mode === "open") {
      // The cylinder's white-hot face; its engraved rows roll over it as the stage's `cylinders` piece.
      p.push(ngon(0, ENGINE_O, 0.42, 0.42, 0.113, CORE_HOT, 1.4, 22));
      p.push(...seal(0, ENGINE_O, 0.16, 0.117, 1.2, CORE_GLOW));
    } else {
      if (mode === "heating") p.push(ngon(0, ENGINE_O, 0.42, 0.42, 0.112, CORE_GLOW, 1.0, 22));
      for (let k = -3; k <= 3; k++) {
        const y = k * 0.118, w = Math.sqrt(Math.max(0, 0.42 * 0.42 - (Math.abs(y) + 0.05) ** 2));
        p.push(rect(-w, w, ENGINE_O + y - 0.048, ENGINE_O + y + 0.048, 0.116, IRON));
        p.push(ngon(-w + 0.03, ENGINE_O + y, 0.014, 0.014, 0.118, BRASS_LT, 0.1, 6), ngon(w - 0.03, ENGINE_O + y, 0.014, 0.014, 0.118, BRASS_LT, 0.1, 6));
      }
    }
    return noShadow(merge(...p));
  };

  // ---- stage-8 re-skins of the shared types --------------------------------------------------------------------------
  // The figures face -x and are turned LOOK_TURN toward the camera (this file's own figure, not raidModels').
  const LOOK_TURN = 0.5;
  // CLERK: a pressroom clerk in shirtsleeves and a black waistcoat, an ink-stained apron, a green eyeshade and red
  // sleeve garters, levelling a stamp gun at y 0.5 (the clerk's shot origin). Fodder box about origin 0.5.
  const skinClerk = () => {
    const TROUSER = "#2a2a30", VEST = "#1c1c22", APRON = "#2f4a3a", GREEN = "#2a7a46", GREEN_LT = "#4fc06a", p = [];
    for (const z of [0.05, -0.05]) p.push(B(-0.045, 0.045, 0.05, 0.42, z - 0.045, z + 0.045, TROUSER), B(-0.105, 0.045, 0, 0.05, z - 0.045, z + 0.045, SHOE));
    p.push(BB(-0.085, 0.085, 0.4, 0.67, -0.1, 0.1, SHIRT, 0.02), B(-0.092, 0.092, 0.42, 0.655, -0.104, 0.104, VEST));
    for (let y = 0.46; y < 0.64; y += 0.05) p.push(B(-0.098, -0.092, y, y + 0.014, -0.007, 0.007, BRASS));
    p.push(B(-0.1, -0.094, 0.2, 0.52, -0.085, 0.085, APRON), B(-0.103, -0.1, 0.27, 0.31, -0.03, 0.02, INK), B(-0.103, -0.1, 0.36, 0.38, 0.03, 0.06, INK));
    p.push(B(-0.03, 0.03, 0.66, 0.7, -0.035, 0.035, SKIN), BB(-0.075, 0.07, 0.69, 0.85, -0.07, 0.07, SKIN, 0.02), B(-0.058, 0.074, 0.81, 0.86, -0.074, 0.074, HAIR), B(0.03, 0.074, 0.72, 0.84, -0.074, 0.074, HAIR));
    p.push(B(-0.081, -0.074, 0.77, 0.79, 0.016, 0.04, EYE), B(-0.081, -0.074, 0.77, 0.79, -0.04, -0.016, EYE), B(-0.096, -0.074, 0.74, 0.765, -0.011, 0.011, SKIN_DK), B(-0.08, -0.074, 0.71, 0.722, -0.024, 0.024, MOUTH));
    p.push(B(-0.078, 0.076, 0.83, 0.855, -0.078, 0.078, GREEN), moved(turnedZ(B(-0.11, 0, -0.006, 0.006, -0.088, 0.088, GREEN_LT, 0.25), -0.3), -0.072, 0.85, 0));
    // The stamp gun at the hip, its face (the muzzle) on the clerk's shot start, in a shirt sleeve with a red garter.
    const gun = [
      B(-0.22, -0.18, 0.4, 0.49, -0.025, 0.025, "#7a5230"), B(-0.3, -0.16, 0.48, 0.55, -0.035, 0.035, IRON_LT),
      B(-0.315, -0.295, 0.45, 0.59, -0.055, 0.055, "#7a5230"), B(-0.322, -0.315, 0.46, 0.58, -0.048, 0.048, NOTE)
    ];
    p.push(...BL.raidModels.holdGun(p, { type: BL.raidStages.ENEMY.CLERK, yaw: LOOK_TURN, gun, muzzle: [-0.322, 0.52, 0], grip: [-0.2, 0.445, 0],
      shoulder: 0.66, upper: 0.16, lower: 0.15, w: 0.07, sleeve: SHIRT, band: RED, skin: SKIN }));
    return noShadow(BL.raidModels.standTall(turnedY(merge(...p), LOOK_TURN)));
  };
  // CARRIER: a bundle of banded bills flying on two fanned bills for wings, a loose one trailing. Centred, facing +x
  // (its flight). Fodder box about origin 0.
  const skinCarrier = () => {
    const p = [BB(-0.17, 0.17, -0.07, 0.07, -0.1, 0.1, NOTE, 0.012)];
    for (let y = -0.06; y < 0.065; y += 0.02) p.push(rect(-0.165, 0.165, y, y + 0.006, 0.102, PAPER));
    p.push(rect(-0.045, 0.045, -0.075, 0.075, 0.105, KRAFT), ...seal(0, 0, 0.032, 0.108, 0.3));
    for (const [z, k] of [[0.13, 0], [0.135, 1], [-0.13, 0], [-0.135, 1]]) bill(p, -0.06 - k * 0.04, 0.17 + k * 0.03, 0.26, 0.11, 0.55 + k * 0.35, z);
    bill(p, -0.28, -0.08, 0.1, 0.05, -0.3, 0.02);
    return noShadow(turnedY(merge(...p), -0.45));
  };
  // SENSOR: an ink-pressure gauge on an ink tank: open, its dial lit with the needle in the green and the ink showing in
  // its sight glass; shut, an iron lid bolted over the dial. Feet at y 0; fodder box about origin 0.25.
  const skinSensor = (open) => {
    const p = [
      BB(-0.22, 0.22, 0, 0.05, -0.16, 0.16, IRON, 0.012),
      lathe({ profile: [[0, 0.05], [0.14, 0.05], [0.14, 0.34], [0.1, 0.39], [0, 0.4]], segments: 14, color: "#1d2b24" }),
      moved(lathe({ profile: [[0.142, 0], [0.142, 0.025], [0, 0.025]], segments: 14, color: BRASS }), 0, 0.1, 0), moved(lathe({ profile: [[0.142, 0], [0.142, 0.025], [0, 0.025]], segments: 14, color: BRASS }), 0, 0.29, 0),
      B(-0.02, 0.02, 0.38, 0.45, -0.02, 0.02, BRASS_DK),
      disc(0.15, 0.05, 0, 0.5, 0.04, BRASS, 0.05, 18)
    ];
    if (open) {
      p.push(disc(0.122, 0.055, 0, 0.5, 0.045, PAPER, 0.3, 18));
      arc(p, 0, 0.5, 0.095, 0.095, PI * 0.25, PI * 0.75, 4, 0.025, 0.075, INK_GLOW, 0.6);
      arc(p, 0, 0.5, 0.095, 0.095, PI * -0.1, PI * 0.25, 3, 0.025, 0.075, RED, 0.6);
      p.push(strip(0, 0.5, -0.03, 0.59, 0.012, 0.078, INK), ngon(0, 0.5, 0.014, 0.014, 0.08, BRASS_DK, 0, 6));
      p.push(rect(0.1, 0.13, 0.08, 0.3, 0.142, "#123a22"), rect(0.104, 0.126, 0.08, 0.24, 0.144, INK_GLOW, 0.8));
    } else {
      p.push(disc(0.13, 0.07, 0, 0.5, 0.05, IRON, 0, 18), rect(-0.1, 0.1, 0.49, 0.51, 0.087, STEEL_DK), rect(-0.01, 0.01, 0.4, 0.6, 0.087, STEEL_DK));
      for (const [x, y] of [[-0.08, 0.5], [0.08, 0.5], [0, 0.42], [0, 0.58]]) p.push(ngon(x, y, 0.014, 0.014, 0.09, STEEL_LT, 0, 6));
      p.push(rect(0.1, 0.13, 0.08, 0.3, 0.142, IRON_DK));
    }
    return noShadow(turnedY(merge(...p), -0.15));
  };

  // ---- the registry --------------------------------------------------------------------------------------------------
  const specOf = (name) => ({ tier: SPEC[name][0], origin: SPEC[name][1], box: boxOf(name) });
  const turnedPair = (build) => { const look = cached(build); return { build: look, turned: cached(() => mirrored(look())) }; };
  // A look winding up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): `look` with a flare at its muzzle (x, y) in its
  // type's tell colour; `wound` adds a pair's `wind` and its mirrored `turnedWind`. The ram's and the presses' warnings
  // are their own; the Engine's pod-phase gun stands at its top, outside its box, so the scene's ring tells it.
  const windUp = (name, look, x, y, r) => cached(() => BL.raidModels.windOf(look(), x, y, BL.raidModels.FAMILY_OF[name], undefined, r));
  const wound = (name, look, x, y, r) => { const wind = windUp(name, look.build, x, y, r); return Object.assign(look, { wind, turnedWind: cached(() => mirrored(wind())) }); };
  const shut = (flags) => (flags & FLAG.SHUT) !== 0;
  const ramLook = cached(() => ramBlock(false));
  put("types", "RAM", Object.assign(specOf("RAM"), {
    build: ramLook, shut: ramLook, warn: cached(() => ramBlock(true)), screw: cached(ramScrew),
    pick: (state, slot) => state.eRoutine[slot] === RAM_WARN ? "warn" : "shut"
  }));
  put("types", "ENGINE_PRESS", Object.assign(specOf("ENGINE_PRESS"), {
    build: cached(() => pressHead(true, false)), shut: cached(() => pressHead(false, false)), warn: cached(() => pressHead(false, true)), screw: cached(pressStem),
    zByAttr: Object.freeze([0, -0.08]),
    pick: (state, slot) => !shut(state.eFlags[slot]) ? "build" : state.eRoutine[slot] === PRESS_WARN ? "warn" : "shut"
  }));
  const podOpen = cached(() => pod(true)), coreOpen = cached(() => core("open"));
  put("types", "ENGINE_POD", Object.assign(specOf("ENGINE_POD"), { build: podOpen, shut: cached(() => pod(false)), wind: windUp("ENGINE_POD", podOpen, 0, 0, 0.12) }));
  put("types", "CHAIRMAN_ENGINE", Object.assign(specOf("CHAIRMAN_ENGINE"), {
    build: coreOpen, shut: cached(() => core("shut")), heating: cached(() => core("heating")), wind: windUp("CHAIRMAN_ENGINE", coreOpen, 0, SPEC.CHAIRMAN_ENGINE[1], 0.18),
    pick: (state, slot) => !shut(state.eFlags[slot]) ? "build" : state.eRoutine[slot] === ENGINE_POD_PHASE ? "heating" : "shut"
  }));
  const sensorOpen = cached(() => skinSensor(true)), sensorShut = cached(() => skinSensor(false));
  put("stages", "reserve", {
    id: "reserve", PLAY_BAND, DEPTH,
    // The scene's fog and clear colour on this stage: the vault's dark, so the far hall is not greyed.
    fog: "#1e1915",
    sector, backdrop, belts, lifts, storm, cylinders,
    skins: Object.freeze({
      CLERK: Object.freeze(Object.assign(specOf("CLERK"), wound("CLERK", turnedPair(skinClerk), 0, SPEC.CLERK[1]))),
      CARRIER: Object.freeze(Object.assign(specOf("CARRIER"), turnedPair(skinCarrier))),
      SENSOR: Object.freeze(Object.assign(specOf("SENSOR"), { build: sensorOpen, shut: sensorShut, turned: cached(() => mirrored(sensorOpen())), turnedShut: cached(() => mirrored(sensorShut())) }))
    })
  });
})();
