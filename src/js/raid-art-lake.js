// Ooga Raid's art for stage 6, Mempool Lake: the Mempool island's rainforest shore cut by tidal pools, the tunnel under
// the ridge with its sump, the mossy basalt cliff steps, and the Backlog Leviathan's lake under the rock wall. Geometry
// only: no nodes, no state, nothing per frame (the exceptions are `bodyAt`, `surfaceAt` and `raftAt`, which write a
// node's fields, and `pick`, which reads the sim's state and returns a constant name; none allocates). Every builder is
// cached once a page. It registers into the shared art registry, `BL.raidArt.stages.mempool` (the spec's id, no alias)
// and `BL.raidArt.types[NAME]`.
//
// `sector(stage, screen)` is one 8 by 7 side screen, cached by stage object and screen: the solid cells cut from the
// grid four voxels deep (rainforest earth with grass and pale sand by the pools, cave rock in the tunnel, mossy basalt
// on the cliff steps and the boss screen's rock wall), each pit's dark back fill, each pool's back wall behind the play
// plane (earth over pale sand, its tide lines), the ledges in the back voxel only (mossy limbs, gnarled roots in the
// tunnel, basalt slabs on the lock screen), any still water the grid draws outside a tide basin, and the dressing:
// buttress-rooted trees, lianas, ferns, bushes and mossy rocks behind the play band, and on the ground's own face grass
// fringe, basalt joints, roots and the tide's stains on the banks by each pool. In the tunnel (`stage.art.tunnel`; the cliff steps are `stage.art.cliff`) a dark
// cave wall stands far behind, and its ceiling rock and stalactites are backdrop in row 13 only (y >= 6.5, set back),
// with no solid cell overhead. Dressing never enters the play band (|z| < PLAY_BAND); nothing behind has a flat lit top.
//
// `water(stage)` is each tide basin (F12, the stage's `tide.basins` and `tide.floats`, nested or flat; none without
// them) as `{ index, col0, col1, lowRow, highRow, x0, x1, bedY, lowY, highY, body, foam, swell, rafts }`: `body` is the
// water's front from local y -1 to 0 in the island's clear lake material (`face.lake`, `glass`, on both renderers);
// `foam` and `swell` the surface's foam line, calm and heaving (show `swell` while the tide rises); `rafts` the basin's
// floats as `{ col0, col1, geometry }`, lashed logs whose top is local y 0. The scene places them every frame from the
// sim's `tideLevel(basin, time)` (the row): `bodyAt(node, basin, level)` stands the body from the bed to the surface
// (DROP under the water cell's top), `surfaceAt(node, basin, level)` puts foam or swell on that surface and
// `raftAt(node, basin, level)` puts a raft's top on the cell top an Ooga stands on. A level outside the basin throws.
//
// `backdrop(stage)` (cached by stage) is the far view laid over the scroll to the lock screen, shaped like
// `BL.raidModels.backdrop()`: `layers` (the island's misty ridge at rate 0.2, the rainforest canopy at 0.5; a layer's
// node x is `camX * (1 - rate)`) and `sky`, riding with the camera.
//
// Types (`BL.raidArt.types`), each with `tier`, `origin` and `box` (its bullet box about its anchor), checked against
// `BL.raidSim.TIER_OF` and `ORIGIN_OF` at load and again at each stage's first sector:
// - FEE_EEL: a green-gold eel whose fins are fee stickers. `build()` leaps (open), `shut()` lurks under the water as a
//   dark shadow; `turned()` and `turnedShut()` face +x. `pick(state, slot)` returns the leap while its routine is
//   `LOOK.FEE_EEL.leap`, the shadow while it is `LOOK.FEE_EEL.lurk` (else by its SHUT flag), turned while `evx` > 0.
// - LEVIATHAN: the Backlog Leviathan's head of stacked transaction blocks stamped with fee rates, amber eyes and a
//   crown of paper slips. `build()` surfaced (jaws open, a ring of foam at the waterline, its local y 0), `rising()`
//   (eyes dim, jaws shut, bubbles), `shut()` submerged (a shadow with faint eyes); each with a `turned` twin facing +x.
//   `pick(state, slot)` reads `LOOK.LEVIATHAN.submerged`, `.rise`, `.surfaced`, and faces by the sim's own facing,
//   `eAim` (0 right, turned; 6 left), which the lake legion keeps along its motion and toward the nearest Ooga.
//   The rest of its vast body is the boss's dressing, set back: `boss.neck[variant]` (any of pick's names), placed at
//   the head's own x and y, every vertex at z -0.46 to -0.31, inside x -0.2 to 0.25.
// Every look stays inside its box. Facing types face -x; a turned look is mirrored in x with its faces rewound.
//
// Stage-6 re-skins of the shared types live with the stage (`skins`): CLERK a customs officer in a rain cape, CARRIER a
// paper boat on the wind, SENSOR a tide gauge (`shut()` shuttered), REPO_TRUCK the field art's truck spattered with
// mud (it reads `BL.raidArt.types.REPO_TRUCK` from raid-art-field.js when first built, and keeps its `pick`).
//
// The routine indices come from the lake legion file's `LOOK` by type and state name (`BL.raidLegionLake.LOOK.FEE_EEL
// .leap`), read at load; a missing one throws.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, prism, forwardLathe, along, noShadow, beam } = BL.models;
  const { puff, leafy, limb, padNormals, flatInto, sprig, liana, SIGN_GLYPHS } = BL.hubModels;
  const { KIND, CELL, SCREEN_W, cellAt } = BL.raidStages;
  const { RULES, FLAG } = BL.raidSim;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-lake: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI, SCREEN_X = SCREEN_W * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge or a raft fills only the back voxel, its front at LEDGE_Z.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3, LEDGE_CLEAR = 0.3;
  // The water's front stands just inside the ground's front plane; its surface DROP under the water cell's top (where a
  // wading Ooga's feet stand), as stage 1's does. The pools' back walls stand just behind the back voxel.
  const WATER_Z = Z1 - 0.012, BACK_Z = Z0 - 0.02, DROP = 0.05, WATER_GLASS = 0.55;
  // The lake material's flow frame on a vertical face: x along the pool, y scaled so its cells stand about 0.3 m tall.
  const WATER_FLOW = Object.freeze([1, 0, 0, 0, 0, 2.5, 0, 0]);
  // The tunnel's ceiling backdrop never comes lower than row 13's floor.
  const CEILING_Y = 13 * CELL;

  // ---- what the sim says ---------------------------------------------------------------------------------------------
  const SPEC = Object.freeze({ FEE_EEL: [0, 0.25], LEVIATHAN: [3, 0.4], CLERK: [0, 0.5], CARRIER: [0, 0], SENSOR: [0, 0.25], REPO_TRUCK: [2, 1] });
  const boxOf = (name) => { const [tier, o] = SPEC[name], b = RULES.SHOT_BOX[tier]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  const specOf = (name) => ({ tier: SPEC[name][0], origin: SPEC[name][1], box: boxOf(name) });
  // SPEC must be the sim's tier and origin for every type it names, which the sim must have, or a look's box drifts from
  // its hit box.
  const checkSpec = () => {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-lake: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-lake: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  };
  checkSpec();
  const LAKE = BL.raidLegionLake;
  const routine = (type, state) => {
    const v = LAKE && LAKE.LOOK && LAKE.LOOK[type] && LAKE.LOOK[type][state];
    if (!Number.isInteger(v)) throw new Error(`raid-art-lake: BL.raidLegionLake.LOOK.${type}.${state} is not a routine index`);
    return v;
  };
  const EEL_LURK = routine("FEE_EEL", "lurk"), EEL_LEAP = routine("FEE_EEL", "leap");
  const LEV_SUBMERGED = routine("LEVIATHAN", "submerged"), LEV_RISE = routine("LEVIATHAN", "rise"), LEV_SURFACED = routine("LEVIATHAN", "surfaced");

  // ---- palette -------------------------------------------------------------------------------------------------------
  const BARK = "#7a6a58", BARK_DK = "#5e5040", BARK_LT = "#948470", MOSS = "#6f9a3a", MOSS_DK = "#4f7a2c", ROOT = "#5a4430", ROOT_DK = "#3e2e20";
  const SAND = "#e2d2a0", WET = "#a8946a", SCUM = "#eee6c8", POOL_WALL = "#5c4632", POOL_LINE = "#3f2f20";
  const BASALT = "#4a4d52", BASALT_DK = "#383b40", BASALT_LT = "#5d6166", CAVE = "#433d37", CAVE_DK = "#2c2723", CAVE_WET = "#25211e";
  const FOAM = "#eef8f6", ROPE = "#b89a5a", ROPE_DK = "#8a7040";
  const TEAL = "#2c6e6a", TEAL_DK = "#1d4d4c", TEAL_LT = "#3d8a82", AMBER = "#ffb21e", STAMP = "#efe6c8", INK = "#b8322a";
  const SKIN = "#e0a982", SKIN_DK = "#c48c64", EYE = "#1d1d20", MOUTH = "#7a2a22", SHOE = "#1c1e22", GOLD = "#d9a63a";
  const rgbs = (list) => list.map(hexToRgb);
  const FERN = rgbs(["#2f6b2c", "#3f8a34", "#56a43f", "#74bd52"]), BUSH = rgbs(["#2f6228", "#447f33", "#5c9a3c", "#79b54c"]);
  const CANOPY = rgbs(["#2a5a2a", "#3a7434", "#4f8e40", "#66a64e"]), ROCK = rgbs(["#5d5650", "#6b625a", "#7a716a", "#8b837b"]);
  const MOSSES = rgbs(["#4a6b2c", "#5b7f3a", "#6d9444", "#80a852"]), STONE = rgbs(["#3e4146", "#4a4d52", "#575b60", "#666a70"]);

  // ---- small builders ------------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel = 0.02) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const F = () => ({ verts: [], faces: [], lines: [] });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z.
  const fpoly = (points, z, color, emissive = 0) => {
    const g = F(), ids = [];
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
  // A disc of radius r and thickness t facing the camera, centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  // Turns parts about z round a pivot: a positive angle leans their top toward -x.
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
  // A pixel picture (rows of "#" and ".", top row first) as runs of thin boxes `cell` square, its middle at (x, y).
  const pix = (rows, cell, x, y, z, color, emissive = 0, depth = 0.004) => {
    const parts = [], w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) for (let c = 0; c < w;) {
      if (rows[r][c] !== "#") { c++; continue; }
      let e = c;
      while (e < w && rows[r][e] === "#") e++;
      const x0 = x + (c - w / 2) * cell, y1 = y + (h / 2 - r) * cell;
      parts.push(B(x0, x0 + (e - c) * cell, y1 - cell, y1, z, z + depth, color, emissive));
      c = e;
    }
    return parts;
  };
  // A word in the island's carved 3x5 alphabet, centred at (x, y): a space is a gap, any other missing glyph throws.
  const word = (text, cell, x, y, z, color, emissive = 0) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = text[i] === " " ? ["000", "000", "000", "000", "000"] : SIGN_GLYPHS[text[i]];
      if (!glyph) throw new Error(`raid-art-lake: the sign alphabet has no "${text[i]}"`);
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + glyph[r].replace(/1/g, "#").replace(/0/g, ".");
    }
    return pix(rows, cell, x, y, z, color, emissive);
  };
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
  // A smooth geometry with explicit normals for the hub kit's foliage, roots and vines, finished with flat parts folded in.
  const smoothGeo = () => ({ verts: [], faces: [], lines: [], smooth: true, normals: [] });
  const finish = (geo, flats) => {
    if (flats.length) flatInto(geo, merge(...flats));
    padNormals(geo);
    geo.normals = Float32Array.from(geo.normals);
    geo.castShadow = false;
    return geo;
  };
  const addRound = (geo, part) => {
    const shift = geo.verts.length / 3;
    for (let i = 0; i < part.verts.length; i++) geo.verts.push(part.verts[i]);
    for (const f of part.faces) geo.faces.push({ ...f, i: f.i.map((i) => i + shift) });
    return padNormals(geo);
  };
  const facing = (parts, yaw) => turnedY(merge(...parts), yaw);
  const byStage = (build) => {
    const cache = new WeakMap();
    return (stage) => { let v = cache.get(stage); if (v === undefined) { v = build(stage); cache.set(stage, v); } return v; };
  };

  // ---- the stage's set pieces ----------------------------------------------------------------------------------------
  // Records of `stride` from a nested list or a flat (typed) array; left out means none; a record of the wrong length throws.
  const records = (src, key, stride, id) => {
    const list = src[key], out = [];
    if (list === undefined) return out;
    if (list.length && typeof list[0] === "number") {
      if (list.length % stride) throw new Error(`raid-art-lake: ${id}.tide.${key} is not records of ${stride}`);
      const flat = Array.from(list);
      for (let i = 0; i < flat.length; i += stride) out.push(flat.slice(i, i + stride));
    } else for (const r of list) {
      if (r.length !== stride) throw new Error(`raid-art-lake: ${id}.tide.${key} has a record of ${r.length}, not ${stride}`);
      out.push(Array.from(r));
    }
    return out;
  };
  // The tide (F12): basins [col0, col1, lowRow, highRow] and floats [col0, col1], with each column's basin (or -1). A
  // float outside every basin throws: it would have no water to ride.
  const tideOf = byStage((stage) => {
    const t = stage.tide, basins = t === undefined ? [] : records(t, "basins", 4, stage.id), floats = t === undefined ? [] : records(t, "floats", 2, stage.id);
    const basinOf = new Int16Array(stage.cols).fill(-1);
    basins.forEach(([c0, c1], i) => { for (let c = c0; c <= c1; c++) basinOf[c] = i; });
    const floatsOf = basins.map(() => []);
    for (const [c0, c1] of floats) {
      const b = basinOf[c0];
      if (b < 0 || basinOf[c1] !== b) throw new Error(`raid-art-lake: ${stage.id}'s float [${c0}, ${c1}] is not inside one basin`);
      floatsOf[b].push([c0, c1]);
    }
    return { basins, floatsOf, basinOf };
  });
  const inBasin = (stage, col) => col >= 0 && col < stage.cols && tideOf(stage).basinOf[col] >= 0;

  // ---- reading the grid ----------------------------------------------------------------------------------------------
  const screenOf = (col) => Math.floor(col / SCREEN_W);
  // The art's places on the stage (`stage.art`, the spec's art notes; the grid carries neither): `tunnel`, the screens
  // under the ridge, and `cliff`, the mossy basalt steps' screens; left out means none, a screen the stage lacks throws.
  // The lock screen's raised rock is basalt too.
  const placesOf = byStage((stage) => {
    const art = stage.art || {}, screens = stage.cols / SCREEN_W, set = (key) => {
      const list = art[key] === undefined ? [] : Array.from(art[key]);
      for (const s of list) if (!(Number.isInteger(s) && s >= 0 && s < screens)) throw new Error(`raid-art-lake: ${stage.id}.art.${key} names screen ${s}, which it does not have`);
      return new Set(list);
    };
    return { tunnel: set("tunnel"), cliff: set("cliff") };
  });
  const tunnelScreen = (stage, screen) => placesOf(stage).tunnel.has(screen);
  const tunnel = (stage, col) => tunnelScreen(stage, screenOf(col));
  const topRow = (stage, col) => { for (let r = stage.rows - 1; r >= 0; r--) if (cellAt(stage, col, r) === KIND.SOLID) return r; return -1; };
  const basalt = (stage, col) => (placesOf(stage).cliff.has(screenOf(col)) || screenOf(col) === stage.lockScreen) && topRow(stage, col) >= 3;
  // A column's ground: the top of its highest solid cell with open air over it, or -1 over a pit, water or a basin.
  const groundRow = (stage, col) => {
    if (col < 0 || col >= stage.cols || inBasin(stage, col)) return -1;
    for (let row = stage.rows - 1; row >= 0; row--) {
      const k = cellAt(stage, col, row);
      if (k === KIND.SOLID) return row + 1;
      if (k === KIND.WATER) return -1;
    }
    return -1;
  };
  const ledgeOver = (stage, col, ground) => {
    for (let row = Math.max(0, ground); row < stage.rows; row++) if (cellAt(stage, col, row) === KIND.LEDGE) return row * CELL;
    return Infinity;
  };
  // A top cell by a pool (within a column of a basin or still water) is laid in pale sand.
  const sandy = (stage, col, row) => {
    for (let c = col - 1; c <= col + 1; c++) {
      if (inBasin(stage, c)) return true;
      for (let r = row - 1; r <= row + 1; r++) if (cellAt(stage, c, r) === KIND.WATER) return true;
    }
    return false;
  };
  // A pit's column (nothing at the bottom row and no basin) with the height its back wall is filled to, in rows.
  const pitFill = (stage, col) => {
    if (col < 0 || col >= stage.cols || cellAt(stage, col, 0) !== KIND.EMPTY || inBasin(stage, col)) return 0;
    let a = col, b = col;
    while (a > 0 && cellAt(stage, a - 1, 0) === KIND.EMPTY && !inBasin(stage, a - 1)) a--;
    while (b < stage.cols - 1 && cellAt(stage, b + 1, 0) === KIND.EMPTY && !inBasin(stage, b + 1)) b++;
    const side = (c) => { let r = 0; while (r < stage.rows && cellAt(stage, c, r) === KIND.SOLID) r++; return r; };
    return Math.min(side(a - 1), side(b + 1));
  };

  // ---- the solid cells -----------------------------------------------------------------------------------------------
  const V = { GRASS: 1, GRASS_DK: 2, DIRT: 3, DIRT_DK: 4, STONE: 5, SAND: 6, SAND_DK: 7, BASALT: 8, BASALT_DK: 9, BASALT_MOSS: 10, CAVE: 11, CAVE_DK: 12, CAVE_TOP: 13, PIT: 14, PIT_DEEP: 15, MUD: 16 };
  const PALETTE = [null, "#5f9a3a", "#548c33", "#7a5634", "#654628", "#6e675c", SAND, "#c4ae7c", BASALT, BASALT_DK, "#5a7838", CAVE, "#38332e", "#534a40", "#2e261d", "#211b15", "#6a5a3c"].map((c) => c && hexToRgb(c));
  const groundGeometry = (stage, screen) => {
    const grid = terrain.makeGrid(SCREEN_W, stage.rows, DEPTH), { basins, basinOf } = tideOf(stage);
    let any = false;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, fill = pitFill(stage, col), cave = tunnel(stage, col), rock = basalt(stage, col), b = basinOf[col];
      for (let row = 0; row < fill; row++) { grid.set(c, row, 0, row === fill - 1 ? V.PIT : V.PIT_DEEP); any = true; }
      for (let row = 0; row < stage.rows; row++) {
        if (cellAt(stage, col, row) !== KIND.SOLID) continue;
        any = true;
        let depth = 0;
        while (depth < 3 && cellAt(stage, col, row + depth + 1) === KIND.SOLID) depth++;
        const odd = (col * 7 + row * 3) % 5 === 0, bed = b >= 0 && row === basins[b][2] - 1, sand = sandy(stage, col, row + depth);
        let value;
        if (cave) value = depth === 0 ? (bed ? V.MUD : V.CAVE_TOP) : odd ? V.CAVE_DK : V.CAVE;
        else if (rock) value = depth === 0 ? V.BASALT_MOSS : (col + (row >> 1)) & 1 ? V.BASALT : V.BASALT_DK;
        else if (depth === 0) value = bed || sand ? V.SAND : odd ? V.GRASS_DK : V.GRASS;
        else if (depth === 1) value = sand ? V.SAND_DK : V.DIRT;
        else value = odd ? V.DIRT_DK : V.STONE;
        for (let z = 0; z < DEPTH; z++) grid.set(c, row, z, value);
      }
    }
    if (!any) return null;
    const geo = terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: screen * SCREEN_X, y: 0, z: Z0 } });
    // Block joints line up across the sectors.
    geo.voxel[1] = 0;
    return geo;
  };

  // The ground's face (z just proud of Z1, below each top edge): grass fringe, basalt joints and moss, cave blotches,
  // and by each pool the tide's wet stain on its banks with a scum line at high water and a line at each level between.
  const groundFace = (stage, screen, geo, flats, rand) => {
    const front = Z1 + 0.004, x0s = screen * SCREEN_X, x1s = x0s + SCREEN_X;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, g = groundRow(stage, col), cx = col * CELL;
      const top = topRow(stage, col);
      if (top < 0) continue;
      if (basalt(stage, col) && !tunnel(stage, col)) {
        // Columnar joints: a dark seam on the column's left edge, cross cracks staggered, moss dripping off the top.
        let foot = top;
        while (foot > 0 && cellAt(stage, col, foot - 1) === KIND.SOLID) foot--;
        const y0 = foot * CELL, y1 = (top + 1) * CELL;
        flats.push(rect(cx, cx + 0.025, y0, y1 - 0.02, front, BASALT_DK));
        for (let y = y0 + 0.35 + (col & 1) * 0.3; y < y1 - 0.25; y += 0.7) flats.push(strip(cx + 0.03, y, cx + CELL - 0.02, y + (rand() - 0.5) * 0.06, 0.02, front, BASALT_DK));
        flats.push(rect(cx + 0.06, cx + 0.1, y0, y1 - 0.04, front + 0.001, BASALT_LT));
        if (cellAt(stage, col, top + 1) !== KIND.SOLID) for (let k = 0; k < 3; k++) {
          const dx = cx + 0.06 + k * 0.15 + rand() * 0.05, len = 0.05 + rand() * 0.12;
          flats.push(fpoly([[dx - 0.035, y1 - 0.004], [dx, y1 - 0.004 - len], [dx + 0.035, y1 - 0.004]], front + 0.002, k & 1 ? MOSS_DK : MOSS));
        }
        continue;
      }
      if (g <= 0) continue;
      const y1 = g * CELL;
      if (tunnel(stage, col)) {
        if (rand() < 0.5) flats.push(ngon(cx + 0.1 + rand() * 0.3, y1 - 0.3 - rand() * 0.6, 0.06 + rand() * 0.05, 0.04, front, CAVE_DK, 0, 7));
        continue;
      }
      if (!sandy(stage, col, g - 1)) for (let k = 0; k < 4; k++) {
        const a = cx + k * 0.125, len = 0.05 + rand() * 0.09;
        flats.push(fpoly([[a, y1 - 0.002], [a + 0.0625 + (rand() - 0.5) * 0.03, y1 - len], [a + 0.125, y1 - 0.002]], front, k & 1 ? "#69a83e" : "#4f8a2e"));
      }
      let face = 0;
      while (face < g && cellAt(stage, col, g - 1 - face) === KIND.SOLID) face++;
      if (face >= 2 && rand() < 0.35) {
        const rx = cx + 0.1 + rand() * 0.3;
        liana(geo, [[rx, y1 - 0.1, Z1 + 0.01], [rx + 0.05, y1 - 0.2, Z1 + 0.02], [rx + 0.02, y1 - 0.32, Z1 + 0.015], [rx + 0.07, y1 - 0.42, Z1 + 0.01]], 0.016, 0.006, ROOT);
      }
    }
    // The tide's stains on the banks either side of each basin.
    for (const [c0, c1, lowRow, highRow] of tideOf(stage).basins) {
      const lowY = (lowRow + 1) * CELL, highY = (highRow + 1) * CELL;
      for (const [from, to] of [[c0 - 2, c0 - 1], [c1 + 1, c1 + 2]]) for (let col = from; col <= to; col++) {
        const x0 = col * CELL, x1 = x0 + CELL;
        if (x1 <= x0s || x0 >= x1s || col < 0 || col >= stage.cols) continue;
        let r = lowRow + 1;
        while (r <= highRow && cellAt(stage, col, r) !== KIND.SOLID) r++;
        if (r > highRow) continue;
        const cave = tunnel(stage, col), far = col === from && from === c0 - 2 || col === to && to === c1 + 2;
        const wet = cave ? CAVE_WET : WET, top = highY - 0.03;
        // A ragged top on the stain, shorter on the outer column.
        const reach = far ? top - 0.18 : top;
        flats.push(fpoly([[x0, Math.max(r * CELL, lowY - 0.02)], [x1, Math.max(r * CELL, lowY - 0.02)], [x1, reach - (col & 1) * 0.04], [x0, reach - 0.02]], Z1 + 0.006, wet));
        if (!far) flats.push(rect(x0, x1, top - 0.012, top + 0.012, Z1 + 0.008, cave ? "#6a6258" : SCUM));
        for (let lv = lowRow + 1; lv < highRow; lv++) { const y = (lv + 1) * CELL - DROP; if (y > r * CELL) flats.push(rect(x0, x1, y - 0.008, y + 0.008, Z1 + 0.008, cave ? CAVE_DK : "#8a7a58")); }
      }
    }
  };

  // ---- the pools' back walls -----------------------------------------------------------------------------------------
  // Behind each basin's columns in this screen, from its bed to its high water: earth (dark rock in the tunnel) over a
  // band of pale sand, with a tide line at each level and the scum line at the top; waterweed on the sand.
  const poolWalls = (stage, screen, geo, flats, rand) => {
    const xs0 = screen * SCREEN_X, xs1 = xs0 + SCREEN_X;
    for (const [c0, c1, lowRow, highRow] of tideOf(stage).basins) {
      const x0 = Math.max(xs0, c0 * CELL), x1 = Math.min(xs1, (c1 + 1) * CELL);
      if (x1 <= x0) continue;
      const cave = tunnel(stage, c0), bed = lowRow * CELL, top = (highRow + 1) * CELL;
      // The wall stops a little under the bank's top along a ragged edge, so the bank's own front reads as the rim.
      flats.push(rect(x0, x1, bed, top - 0.12, BACK_Z, cave ? CAVE_DK : POOL_WALL));
      for (let x = x0; x < x1 - 1e-6; x += 0.25) { const b = Math.min(x1, x + 0.25); flats.push(fpoly([[x, top - 0.12], [b, top - 0.12], [b, top - 0.04 - rand() * 0.05], [x, top - 0.03 - rand() * 0.05]], BACK_Z, cave ? CAVE_DK : POOL_WALL)); }
      flats.push(rect(x0, x1, bed, bed + 0.18, BACK_Z + 0.002, cave ? "#5a5040" : SAND));
      for (let x = x0; x < x1 - 0.05; x += 0.5) flats.push(fpoly([[x, bed + 0.18], [x + 0.5, bed + 0.18], [x + 0.25, bed + 0.24 + rand() * 0.05]], BACK_Z + 0.002, cave ? "#5a5040" : SAND));
      for (let lv = lowRow; lv <= highRow; lv++) {
        const y = Math.min((lv + 1) * CELL - DROP, top - 0.16);
        flats.push(rect(x0, x1, y - 0.01, y + 0.01, BACK_Z + 0.004, lv === highRow ? (cave ? "#5a544c" : "#9a9482") : cave ? "#1e1a17" : POOL_LINE));
      }
      if (!cave) for (let x = x0 + 0.2 + rand() * 0.3; x < x1 - 0.1; x += 0.6 + rand() * 0.5) sprig(geo, x, bed + 0.02, BACK_Z + 0.06, 0.1, 1, 0, 3, 0.16 + rand() * 0.08, rand, rgbs(["#2f5a3a", "#3d7448", "#4f8a58"]));
    }
  };

  // ---- the ledges ----------------------------------------------------------------------------------------------------
  // Each run of ledge cells in the back voxel (z -1 to -0.5), its walk top flush with the cell's top: a mossy limb in
  // the forest, a gnarled root in the tunnel, a basalt slab on the lock screen. Only these walk tops are flat and lit.
  const ledgeGeometry = (stage, screen, rand) => {
    const geo = smoothGeo(), flats = [];
    for (let row = 0; row < stage.rows; row++) for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (cellAt(stage, col, row) !== KIND.LEDGE) { c++; continue; }
      let e = c;
      while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.LEDGE) e++;
      const x0 = col * CELL, x1 = (screen * SCREEN_W + e) * CELL, top = (row + 1) * CELL, under = top - 0.2;
      if (tunnel(stage, col)) {
        // A root: a thin moss top, a knotted body in short lengths, rootlets hanging under it.
        flats.push(B(x0, x1, top - 0.04, top, Z0, LEDGE_Z + 0.02, MOSS_DK));
        for (let x = x0; x < x1 - 0.01; x += 0.25) {
          const y = top - 0.04 - (rand() * 0.03);
          flats.push(BB(x - 0.01, Math.min(x1, x + 0.26), y - 0.14 - rand() * 0.04, y, Z0 + 0.04, LEDGE_Z, (x / 0.25) & 1 ? ROOT : ROOT_DK, 0.025));
        }
        for (let x = x0 + 0.12; x < x1 - 0.08; x += 0.22 + rand() * 0.2) liana(geo, [[x, under, LEDGE_Z - 0.05], [x + 0.03, under - 0.12, LEDGE_Z - 0.04], [x - 0.01, under - 0.22 - rand() * 0.1, LEDGE_Z - 0.05]], 0.014, 0.004, ROOT);
      } else if (screenOf(col) === stage.lockScreen) {
        // A basalt slab: a moss-edged top, the slab, a chipped underside.
        flats.push(B(x0, x1, top - 0.05, top, Z0, LEDGE_Z + 0.02, "#5a7838"));
        flats.push(B(x0, x1, top - 0.24, top - 0.05, Z0 + 0.02, LEDGE_Z, BASALT));
        flats.push(rect(x0 + 0.03, x1 - 0.03, top - 0.2, top - 0.17, LEDGE_Z + 0.002, BASALT_DK));
        for (let x = x0 + 0.08; x < x1 - 0.3; x += 0.34 + rand() * 0.2) flats.push(moved(prism([[0, 0], [0.26, 0], [0.18, -0.035 - rand() * 0.02], [0.05, -0.03]], 0.3, BASALT), x, top - 0.24, -0.75));
      } else {
        // A mossy limb: moss along its top, bark under, its cut ends showing their rings, leaves and vine ends below.
        flats.push(B(x0 - 0.02, x1 + 0.02, top - 0.07, top, Z0 - 0.02, LEDGE_Z + 0.03, MOSS));
        flats.push(BB(x0, x1, top - 0.24, top - 0.06, Z0 + 0.04, LEDGE_Z, BARK, 0.03));
        for (let x = x0 + 0.08; x < x1 - 0.1; x += 0.18 + rand() * 0.15) flats.push(rect(x, x + 0.05 + rand() * 0.06, top - 0.2 + rand() * 0.04, top - 0.185 + rand() * 0.04, LEDGE_Z + 0.002, BARK_DK));
        for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.35 + rand() * 0.3) {
          if (rand() < 0.45) liana(geo, [[x, under, LEDGE_Z - 0.04], [x + 0.04, under - 0.12, LEDGE_Z - 0.03], [x + 0.01, under - 0.24 - rand() * 0.08, LEDGE_Z - 0.04]], 0.013, 0.007);
          else sprig(geo, x, under + 0.02, LEDGE_Z - 0.06, 0.1, -1, 0.15, 3, 0.13, rand, FERN);
        }
      }
      c = e;
    }
    return flats.length ? finish(geo, flats) : null;
  };

  // ---- the water -----------------------------------------------------------------------------------------------------
  // The water's front from x0 to x1, local y -1 to 0, in cells the Canvas 2D renderer can colour one by one.
  const waterBody = (x0, x1, y0 = -1, y1 = 0) => {
    const geo = F(), cols = Math.max(1, Math.round((x1 - x0) / 0.25)), rows = 4, rgb = hexToRgb("#4aa6ff");
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = x0 + (x1 - x0) * i / cols, b = x0 + (x1 - x0) * (i + 1) / cols, c = y0 + (y1 - y0) * j / rows, d = y0 + (y1 - y0) * (j + 1) / rows, n = geo.verts.length / 3;
      geo.verts.push(a, c, WATER_Z, b, c, WATER_Z, b, d, WATER_Z, a, d, WATER_Z);
      geo.faces.push({ i: [n, n + 1, n + 2, n + 3], color: rgb, emissive: 0.9, lake: true });
    }
    geo.glass = WATER_GLASS;
    geo.lakeFlow = Float32Array.from(WATER_FLOW);
    geo.castShadow = false;
    return geo;
  };
  // The foam on the surface (local y 0): a calm line of flecks curling at the banks, or the heaving swell of a rising tide.
  // Nothing of it lies over a raft's columns (`clear`, [x0, x1] spans), so a raft's deck shows over the water.
  const foamLine = (x0, x1, heave, seed, clear) => {
    const rand = mulberry32(seed), parts = [], z = WATER_Z + 0.006;
    const free = (a, b) => clear.every(([c, d]) => b <= c - 0.02 || a >= d + 0.02);
    for (let x = x0 + 0.04; x < x1 - 0.03; x += 0.07 + rand() * 0.05) { const r = 0.04 + rand() * 0.03, y = (rand() - 0.5) * 0.02, ry = heave ? 0.03 + rand() * 0.03 : 0.018; if (free(x - r, x + r)) parts.push(ngon(x, y, r, ry, z + parts.length * 1e-5, FOAM, 0.45, 8)); }
    for (const [x, d] of [[x0, 1], [x1, -1]]) if (free(d > 0 ? x : x - 0.14, d > 0 ? x + 0.14 : x)) parts.push(fpoly(d > 0 ? [[x, -0.03], [x + 0.14, -0.01], [x, 0.06]] : [[x, -0.03], [x, 0.06], [x - 0.14, -0.01]], z + 0.004, FOAM, 0.5));
    if (heave) {
      for (let x = x0 + 0.1; x < x1 - 0.08; x += 0.18 + rand() * 0.12) { const y = 0.05 + rand() * 0.03; if (free(x - 0.05, x + 0.05)) parts.push(ngon(x, y, 0.05, 0.04, z + 0.003 + parts.length * 1e-5, "#ffffff", 0.55, 8)); }
      for (let k = 0; k < (x1 - x0) * 5; k++) { const x = x0 + 0.05 + rand() * (x1 - x0 - 0.1), y = 0.1 + rand() * 0.06; if (free(x - 0.012, x + 0.012)) parts.push(ngon(x, y, 0.012, 0.012, z + 0.005 + parts.length * 1e-5, "#ffffff", 0.6, 6)); }
    }
    return noShadow(merge(...parts));
  };
  // A raft over a float's columns, in the back voxel as every ledge is: a deck of pale split logs riding over the water
  // (its top local y 0, where an Ooga stands), lashed with rope to the dark round logs it floats on, end on to the camera.
  const raft = (c0, c1) => {
    const x0 = c0 * CELL, x1 = (c1 + 1) * CELL, n = Math.round((x1 - x0) / 0.17), r = (x1 - x0) / n / 2, parts = [];
    for (let k = 0; k < n; k++) {
      const x = x0 + r + k * 2 * r, rr = r * (0.88 + (k % 3) * 0.03), y = -0.075 - rr;
      parts.push(rod(x, y, Z0 + 0.02, x, y, LEDGE_Z - 0.01, rr, k & 1 ? "#4e3a26" : "#5a4430", 0, 10));
      parts.push(disc(rr * 0.62, 0.004, x, y, LEDGE_Z - 0.006 + k * 1e-4, "#9a7448", 0, 10));
    }
    // The deck: a pale top band over a dark lashing line, so the strip above the water reads at any size.
    parts.push(B(x0 + 0.01, x1 - 0.01, -0.075, 0, Z0 + 0.02, LEDGE_Z + 0.01, "#8a6a3a"));
    parts.push(rect(x0 + 0.01, x1 - 0.01, -0.03, 0, LEDGE_Z + 0.012, "#ecd29a"), rect(x0 + 0.01, x1 - 0.01, -0.046, -0.03, LEDGE_Z + 0.012, "#2e2014"));
    for (const x of [x0 + 0.08, x1 - 0.08]) parts.push(rect(x - 0.02, x + 0.02, -0.16, -0.046, LEDGE_Z + 0.016, ROPE));
    return noShadow(merge(...parts));
  };

  const water = byStage((stage) => {
    const { basins, floatsOf } = tideOf(stage);
    return Object.freeze(basins.map(([col0, col1, lowRow, highRow], index) => {
      const x0 = col0 * CELL, x1 = (col1 + 1) * CELL, spans = floatsOf[index].map(([c0, c1]) => [c0 * CELL, (c1 + 1) * CELL]);
      return Object.freeze({
        index, col0, col1, lowRow, highRow, x0, x1, bedY: lowRow * CELL, lowY: (lowRow + 1) * CELL, highY: (highRow + 1) * CELL,
        body: waterBody(x0, x1), foam: foamLine(x0, x1, false, 11 + col0, spans), swell: foamLine(x0, x1, true, 29 + col0, spans),
        rafts: Object.freeze(floatsOf[index].map(([c0, c1]) => Object.freeze({ col0: c0, col1: c1, geometry: raft(c0, c1) })))
      });
    }));
  });
  const checkLevel = (basin, level) => {
    if (!(level >= basin.lowRow && level <= basin.highRow)) throw new RangeError(`raid-art-lake: level ${level} is outside basin ${basin.index} (rows ${basin.lowRow} to ${basin.highRow})`);
  };
  // A basin's body node from its bed to the surface at `level` (the sim's tideLevel row).
  const bodyAt = (node, basin, level) => {
    checkLevel(basin, level);
    const top = (level + 1) * CELL - DROP;
    node.position.x = 0; node.position.y = top; node.position.z = 0;
    node.scale.x = 1; node.scale.y = top - basin.bedY; node.scale.z = 1;
  };
  // Foam or swell on the surface at `level`.
  const surfaceAt = (node, basin, level) => {
    checkLevel(basin, level);
    node.position.x = 0; node.position.y = (level + 1) * CELL - DROP; node.position.z = 0;
  };
  // A raft's top on the cell top at `level`, where the sim stands an Ooga on it.
  const raftAt = (node, basin, level) => { checkLevel(basin, level); node.position.x = 0; node.position.y = (level + 1) * CELL; node.position.z = 0; };
  // Still water the grid draws outside every basin (none on stage 6): its runs as fixed bodies.
  const stillWater = (stage, screen) => {
    const parts = [];
    for (let row = 0; row < stage.rows; row++) for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (cellAt(stage, col, row) !== KIND.WATER || inBasin(stage, col)) { c++; continue; }
      let e = c;
      while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.WATER && !inBasin(stage, screen * SCREEN_W + e)) e++;
      parts.push(waterBody(col * CELL, (screen * SCREEN_W + e) * CELL, row * CELL, (row + 1) * CELL - DROP));
      c = e;
    }
    if (!parts.length) return null;
    const geo = merge(...parts);
    for (const f of geo.faces) f.lake = true;
    geo.glass = WATER_GLASS; geo.lakeFlow = Float32Array.from(WATER_FLOW); geo.castShadow = false;
    return geo;
  };

  // ---- dressing pieces -----------------------------------------------------------------------------------------------
  // A buttress-rooted rainforest tree: a pale trunk up out of the view, flared fins at its foot, a crown at the top.
  const buttressTree = (geo, flats, x, y, z, rand) => {
    const r = 0.17 + rand() * 0.08, lean = (rand() - 0.5) * 0.3;
    limb(geo, x, y - 0.1, z, x + lean, 7.9, z, r, r * 0.7, 8, hexToRgb(rand() < 0.5 ? BARK : BARK_LT));
    padNormals(geo);
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const w = 0.45 + rand() * 0.4, h = 0.7 + rand() * 0.6, dz = k ? -0.12 : 0.1, color = k ? BARK_DK : BARK;
      const tri = (pts) => flats.push(moved(prism(side > 0 ? pts : pts.map(([px, py]) => [-px, py]).reverse(), 0.07, color), x, y - 0.02, z + dz));
      tri([[0, 0], [w, 0], [w * 0.3, h * 0.3]]);
      tri([[0, 0], [w * 0.3, h * 0.3], [0, h]]);
    }
    const cx = x + lean;
    leafy(geo, cx, 7.25, z, 1.2, 0.55, 0.6, CANOPY, rand, 14, 0.3);
    leafy(geo, cx - 0.9, 6.95, z + 0.1, 0.7, 0.4, 0.5, CANOPY, rand, 8, 0.24);
  };
  // A liana from out of the view down to a tip, swinging a little, leaves along it.
  const hangingVine = (geo, x, z, tip, rand) => {
    const pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([x + Math.sin(t * 2.4 + x) * 0.12 * t, 7.6 - (7.6 - tip) * t, z]); }
    liana(geo, pts, 0.026, 0.014);
    for (let k = 2; k <= 6; k += 2) sprig(geo, pts[k][0], pts[k][1], z, (k & 2 ? 1 : -1) * 0.8, -0.4, 0.2, 3, 0.16, rand, FERN);
  };
  const fern = (geo, x, y, z, rand, s) => { sprig(geo, x, y, z, 0, 1, 0, 6 + (rand() * 3 | 0), s, rand, FERN); sprig(geo, x + 0.05, y, z + 0.03, 0.3, 1, 0.2, 4, s * 0.7, rand, FERN); };
  const bush = (geo, x, y, z, rand, s) => leafy(geo, x, y + s * 0.62, z, s, s * 0.68, s * 0.8, BUSH, rand, Math.round(7 + s * 16), 0.08 + s * 0.22);
  const rock = (geo, x, y, z, rand, s, dark) => {
    puff(geo, x, y + s * 0.3, z, s, s * 0.55, s * 0.7, dark ? STONE : ROCK, rand, 4, 8);
    puff(geo, x - s * 0.1, y + s * 0.72, z, s * 0.62, s * 0.18, s * 0.5, MOSSES, rand, 3, 7);
  };
  // Reach of each near piece for size s: [half width, height, how far toward the camera past its z].
  const REACH = { fern: (s) => [s * 0.8 + 0.1, s * 1.05, s * 0.8], bush: (s) => [s * 1.15 + 0.15, s * 1.35, s * 0.9 + 0.05], rock: (s) => [s * 1.2, s * 0.85, s * 0.9] };

  // ---- the tunnel ----------------------------------------------------------------------------------------------------
  // A tunnel screen's far wall (z -3.4, dark rock with seeping streaks), and its ceiling rock and stalactites, backdrop
  // in row 13 only (from CEILING_Y up, z about -2.7), and stalagmites standing on the floor behind (pointed, no tops).
  const tunnelDressing = (stage, screen, flats, rand) => {
    const x0 = screen * SCREEN_X, x1 = x0 + SCREEN_X, first = !tunnelScreen(stage, screen - 1), last = !tunnelScreen(stage, screen + 1);
    const a = first ? x0 - 0.6 : x0, b = last ? x1 + 0.6 : x1;
    for (let y = -0.5; y < 7.6; y += 0.9) flats.push(rect(a, b, y, y + 0.9, -3.4, y < 2 ? "#2a2420" : y < 4.5 ? "#2f2925" : "#342d28"));
    for (let k = 0; k < 9; k++) { const x = a + 0.3 + rand() * (b - a - 0.6), y = 0.5 + rand() * 5.5; flats.push(ngon(x, y, 0.3 + rand() * 0.4, 0.15 + rand() * 0.2, -3.38 + k * 1e-3, rand() < 0.5 ? "#3a332d" : "#262019", 0, 8)); }
    // The mouth's rock round the opening at each end of the tunnel.
    if (first) flats.push(fpoly([[a - 0.5, -0.5], [a + 0.3, -0.5], [a + 0.1, 3], [a + 0.4, 7.6], [a - 0.5, 7.6]], -3.2, "#3a332d"));
    if (last) flats.push(fpoly([[b - 0.3, -0.5], [b + 0.5, -0.5], [b + 0.5, 7.6], [b - 0.4, 7.6], [b - 0.1, 3]], -3.2, "#3a332d"));
    // The ceiling band and its stalactites, never under CEILING_Y.
    const pts = [];
    for (let x = a; x <= b + 1e-6; x += 0.4) pts.push([x, CEILING_Y + 0.22 + rand() * 0.12]);
    for (let k = 0; k + 1 < pts.length; k++) flats.push(fpoly([[pts[k][0], pts[k][1]], [pts[k + 1][0], pts[k + 1][1]], [pts[k + 1][0], 7.7], [pts[k][0], 7.7]], -2.7, k & 1 ? "#3b342e" : "#443c35"));
    for (let x = a + 0.15 + rand() * 0.2; x < b - 0.1; x += 0.3 + rand() * 0.45) {
      const w = 0.07 + rand() * 0.08, tip = CEILING_Y + 0.02 + rand() * 0.12;
      flats.push(fpoly([[x - w, CEILING_Y + 0.3], [x, tip], [x + w, CEILING_Y + 0.3]], -2.68 + rand() * 0.04, rand() < 0.5 ? "#4d443c" : "#3a322b"));
    }
    // Stalagmites on the floor behind, where there is floor.
    for (let x = x0 + 0.4 + rand() * 0.4; x < x1 - 0.2; x += 0.7 + rand() * 0.9) {
      const col = Math.floor(x / CELL), g = groundRow(stage, col);
      if (g <= 0 || groundRow(stage, col - 1) !== g || groundRow(stage, col + 1) !== g) continue;
      const w = 0.1 + rand() * 0.1, h = 0.4 + rand() * 0.7, z = -1.3 - rand() * 0.9, y = g * CELL - 0.02;
      if (ledgeOver(stage, col, g) - LEDGE_CLEAR < y + h) continue;
      flats.push(moved(prism([[-w, 0], [w, 0], [w * 0.2, h * 0.6], [0, h]], 0.12, rand() < 0.5 ? "#4d443c" : "#5a5046"), x, y, z));
    }
  };

  // The lock screen's rock wall: the leftmost column of the solid run against its right end that reaches the top row.
  const lockWall = (stage) => {
    let col = (stage.lockScreen + 1) * SCREEN_W - 1;
    if (cellAt(stage, col, stage.rows - 1) !== KIND.SOLID) throw new Error(`raid-art-lake: ${stage.id}'s lock screen has no rock wall at its right end`);
    while (cellAt(stage, col - 1, stage.rows - 1) === KIND.SOLID) col--;
    return col;
  };

  // ---- the dressing --------------------------------------------------------------------------------------------------
  const dressingGeometry = (stage, screen, rand) => {
    const geo = smoothGeo(), flats = [], x0 = screen * SCREEN_X, x1 = x0 + SCREEN_X, colOf = (x) => Math.floor(x / CELL + 1e-6);
    // A near piece fits where its base columns share one ground and it tops out LEDGE_CLEAR under any ledge it reaches.
    const fits = (x, hw, base, top) => {
      if (x - hw < 0 || x + hw > stage.cols * CELL) return null;
      let ground = null;
      for (let c = colOf(x - base); c <= colOf(x + base); c++) {
        const g = groundRow(stage, c);
        if (g < 0 || (ground !== null && g !== ground)) return null;
        ground = g;
      }
      const y = ground * CELL;
      for (let c = colOf(x - hw); c <= colOf(x + hw); c++) if (ledgeOver(stage, c, Math.max(0, groundRow(stage, c))) - LEDGE_CLEAR < y + top) return null;
      return y;
    };
    const near = (kinds, x, z, dark) => {
      for (const [kind, s] of kinds) {
        const [hw, top, ahead] = REACH[kind](s), y = fits(x, hw, Math.min(hw, 0.35), top);
        if (y === null) continue;
        const zz = Math.min(z, -PLAY_BAND - 0.05 - ahead);
        if (kind === "fern") fern(geo, x, y, zz, rand, s); else if (kind === "bush") bush(geo, x, y, zz, rand, s); else rock(geo, x, y, zz, rand, s, dark);
        return;
      }
    };
    if (tunnelScreen(stage, screen)) {
      tunnelDressing(stage, screen, flats, rand);
      for (let x = x0 + 0.3 + rand() * 0.4; x < x1; x += 0.8 + rand()) near([["rock", 0.15 + rand() * 0.12]], x, -0.55 - rand() * 0.35, true);
      return finish(geo, flats);
    }
    const cliff = placesOf(stage).cliff.has(screen), lock = screen === stage.lockScreen;
    // The lock screen's rock wall: a basalt cliff face behind its right part, its left edge ragged, ferns in its seams.
    if (lock) {
      const wallX = lockWall(stage) * CELL - 1.5;
      const edge = [];
      for (let y = -0.5; y <= 7.7; y += 0.6) edge.push([wallX + (rand() - 0.5) * 0.3, y]);
      for (let k = 0; k + 1 < edge.length; k++) flats.push(fpoly([[edge[k][0], edge[k][1]], [x1 + 0.5, edge[k][1]], [x1 + 0.5, edge[k + 1][1]], [edge[k + 1][0], edge[k + 1][1]]], -2.4, k & 1 ? BASALT : "#43464b"));
      for (let x = wallX + 0.25; x < x1 + 0.4; x += 0.32) flats.push(rect(x, x + 0.03, -0.5, 7.7, -2.39, BASALT_DK));
      for (let k = 0; k < 5; k++) sprig(geo, wallX + 0.4 + rand() * (x1 - wallX), 2 + rand() * 4.5, -2.3, -0.6, -0.3, 0.4, 4, 0.22, rand, FERN);
    }
    // The far back: buttress trees, every few metres where their foot has ground.
    for (let x = x0 + 0.6 + rand() * 1.2; x < x1; x += 2.6 + rand() * 1.8) {
      const c = colOf(x), g = groundRow(stage, c);
      if (g < 0 || groundRow(stage, c - 1) !== g || groundRow(stage, c + 1) !== g || (lock && x > lockWall(stage) * CELL - 2)) continue;
      buttressTree(geo, flats, x, g * CELL, -2.0 - rand() * 0.7, rand);
    }
    // Lianas hanging behind the ledges.
    for (let x = x0 + 0.3 + rand() * 0.8; x < x1; x += 1.1 + rand() * 1.4) hangingVine(geo, x, -1.15 - rand() * 0.45, 3.2 + rand() * 2.6, rand);
    // The near back: ferns, bushes and mossy rocks (basalt boulders on the cliff).
    for (let x = x0 + 0.2 + rand() * 0.4; x < x1; x += 0.55 + rand() * 0.8) {
      const p = rand(), z = -0.5 - rand() * 0.45;
      if (cliff && p < 0.4) near([["rock", 0.18 + rand() * 0.14], ["fern", 0.2]], x, z, true);
      else if (p < 0.45) near([["fern", 0.28 + rand() * 0.14], ["fern", 0.18]], x, z, false);
      else if (p < 0.65) near([["bush", 0.22 + rand() * 0.1], ["fern", 0.2]], x, z, false);
      else if (p < 0.8) near([["rock", 0.15 + rand() * 0.12], ["fern", 0.18]], x, z, false);
    }
    return finish(geo, flats);
  };

  // One screen's geometries, cached by stage object and screen. The ground's face, the pools' back walls and the
  // dressing share one smooth geometry.
  const sectors = new WeakMap();
  const sector = (stage, screen) => {
    if (stage.kind !== "side") throw new Error(`raid-art-lake: ${stage.id} is not a side stage`);
    if (!(screen >= 0 && screen < stage.cols / SCREEN_W)) throw new RangeError(`raid-art-lake: ${stage.id} has no screen ${screen}`);
    let byScreen = sectors.get(stage);
    if (!byScreen) { checkSpec(); byScreen = new Map(); sectors.set(stage, byScreen); }
    let list = byScreen.get(screen);
    if (list) return list;
    const rand = mulberry32(fnv1a(`lake:${stage.id}:${screen}`)), face = smoothGeo(), flats = [];
    groundFace(stage, screen, face, flats, rand);
    poolWalls(stage, screen, face, flats, rand);
    list = [groundGeometry(stage, screen), finish(face, flats), ledgeGeometry(stage, screen, rand), stillWater(stage, screen), dressingGeometry(stage, screen, rand)].filter(Boolean);
    byScreen.set(screen, list);
    return list;
  };

  // ---- the backdrop --------------------------------------------------------------------------------------------------
  // Flat painted cut-outs, front faces only: the island's ridge and its misty valleys at 0.2, the rainforest canopy with
  // emergent crowns at 0.5, a humid sky with soft clouds riding with the camera.
  const HILLS_Z = -12, PEAKS_Z = -28, SKY_Z = -34;
  const backdrop = byStage((stage) => {
    const run = stage.lockScreen * SCREEN_X;
    const canopy = [], hRand = mulberry32(41), hFrom = -16, hTo = run * 0.5 + 24;
    // Each puff a hair nearer than the last, so no two faces of different colours share a depth.
    let ramp = 0;
    const lift = () => (ramp += 1e-4);
    const far = (x) => 3.0 + 0.5 * Math.sin(x * 0.29 + 0.4) + 0.3 * Math.sin(x * 0.77);
    const nearH = (x) => 2.2 + 0.4 * Math.sin(x * 0.43 + 1) + 0.25 * Math.sin(x * 1.07) + 0.15 * Math.sin(x * 2.1);
    for (let x = hFrom; x < hTo; x += 0.5) canopy.push(fpoly([[x, -1], [x + 0.5, -1], [x + 0.5, far(x + 0.5)], [x, far(x)]], -0.6, "#5f8a5a"));
    for (let x = hFrom; x < hTo; x += 0.5) canopy.push(fpoly([[x, -1], [x + 0.5, -1], [x + 0.5, nearH(x + 0.5)], [x, nearH(x)]], 0, "#3f6e3c"));
    for (let x = hFrom; x < hTo; x += 0.4 + hRand() * 0.5) {
      const r = 0.28 + hRand() * 0.32, y = nearH(x) - r * 0.2;
      canopy.push(ngon(x + 0.05, y - 0.05, r, r * 0.75, 0.02 + lift(), "#33603a", 0, 10), ngon(x, y, r * 0.86, r * 0.66, 0.06 + lift(), hRand() < 0.5 ? "#4f8048" : "#5c8f50", 0, 10));
    }
    // Emergent trees standing over the canopy.
    for (let x = hFrom + hRand() * 4; x < hTo; x += 4 + hRand() * 5) {
      const h = nearH(x) + 1 + hRand() * 0.9;
      canopy.push(strip(x, nearH(x) - 0.3, x + 0.05, h, 0.09, 0.1 + lift(), "#5a5040"));
      for (let k = 0; k < 3; k++) canopy.push(ngon(x + (k - 1) * 0.42, h + (k & 1) * 0.12, 0.42, 0.24, 0.1 + lift(), k & 1 ? "#4a7a44" : "#3b6838", 0, 10));
    }
    const peaks = [], pRand = mulberry32(19), pFrom = -16, pTo = run * 0.2 + 24;
    for (let x = pFrom; x < pTo; x += 3.2 + pRand() * 3.6) {
      const w = 4 + pRand() * 4.5, h = 3.4 + pRand() * 2.4, tip = x + w * (0.35 + pRand() * 0.3), z = -pRand() * 0.8;
      peaks.push(fpoly([[x, 0], [tip, 0], [tip, h], [tip - w * 0.1, h - 0.3]], z, "#6f8f86"), fpoly([[tip, 0], [x + w, 0], [tip + w * 0.12, h - 0.45], [tip, h]], z, "#5a7a72"));
    }
    for (let x = pFrom; x < pTo; x += 1) peaks.push(fpoly([[x, 0], [x + 1, 0], [x + 1, 2.3 + 0.2 * Math.sin((x + 1) * 0.8)], [x, 2.3 + 0.2 * Math.sin(x * 0.8)]], 0.5, "#cfe0dc"));
    const W = 240, bands = [[-30, 3.2, "#e4f1ea"], [3.2, 4.6, "#c8e4e2"], [4.6, 6.0, "#a6d2d8"], [6.0, 60, "#86bccc"]];
    const sky = bands.map(([lo, hi, color]) => { const mid = (lo + hi) / 2; return { geometry: noShadow(rect(-W / 2, W / 2, lo - mid, hi - mid, 0, color, 0.85)), y: mid, z: SKY_Z }; });
    const clouds = [], cRand = mulberry32(7);
    for (const [cx, cy, s] of [[-7, 0.4, 1.1], [-2, 1.2, 0.8], [3, 0.5, 1.3], [8, 1.3, 0.9], [-11, 1.5, 0.8], [12, 0.3, 1]]) {
      for (let k = 0; k < 5; k++) {
        const r = s * (0.3 + cRand() * 0.2), ox = (k - 2) * s * 0.36, oy = k === 2 ? s * 0.16 : (k & 1) * s * 0.1;
        clouds.push(ngon(cx + ox, cy + oy - 0.04, r, r * 0.6, -0.01, "#d4e8e4", 0.9, 10), ngon(cx + ox, cy + oy, r * 0.92, r * 0.56, 0, "#fbfdfb", 0.9, 10));
      }
    }
    sky.push({ geometry: noShadow(merge(...clouds)), y: 5.6, z: SKY_Z + 0.5 });
    return { layers: [{ geometry: noShadow(merge(...peaks)), rate: 0.2, y: 0, z: PEAKS_Z }, { geometry: noShadow(merge(...canopy)), rate: 0.5, y: 0, z: HILLS_Z }], sky };
  });

  // ---- FEE_EEL -------------------------------------------------------------------------------------------------------
  // Fodder box about origin 0.25: x ±0.344, y -0.313 to 0.813. A green-gold eel arcing out of the water, head first
  // toward -x, jaws open, square fee stickers standing for fins along its back and a bigger one for its tail.
  const EEL_GREEN = "#7da83a", EEL_GOLD = "#d9b84a", EEL_BELLY = "#ece0a0", STICKER = "#f2d04a";
  const sticker = (x, y, a, s, label) => {
    const parts = [B(-s / 2, s / 2, 0, s, -0.004, 0.004, STICKER, 0.15), B(-s / 2 + 0.006, s / 2 - 0.006, s - 0.012, s - 0.006, 0.004, 0.007, INK)];
    parts.push(...word(label, s * 0.11, 0, s * 0.45, 0.004, "#3a2a10"));
    return about(moved(merge(...parts), x, y, 0), x, y, a);
  };
  const eelLeap = (side) => {
    // The spine, head to tail: a quadratic arc from the raised head down behind to the tail.
    const P = (t) => { const u = 1 - t; return [u * u * -0.22 + 2 * u * t * 0.08 + t * t * 0.24, u * u * 0.6 + 2 * u * t * 0.66 + t * t * -0.12]; };
    const parts = [], stickers = [], N = 9;
    for (let k = 0; k < N; k++) {
      const [ax, ay] = P(k / N), [bx, by] = P((k + 1) / N), r = 0.058 - k * 0.0045;
      parts.push(rod(ax, ay, 0, bx, by, 0, r, k & 1 ? EEL_GOLD : EEL_GREEN, 0, 10));
      parts.push(rod(ax, ay - r * 0.45, r * 0.4, bx, by - r * 0.45, r * 0.4, r * 0.55, EEL_BELLY, 0, 8));
      if (k >= 1 && k <= 6 && k % 2 === 1) {
        const ang = Math.atan2(by - ay, bx - ax), nx = -Math.sin(ang), ny = Math.cos(ang);
        stickers.push(sticker(side * ((ax + bx) / 2 + nx * r * 0.9), (ay + by) / 2 + ny * r * 0.9 - 0.01, side * ang, 0.06, ["5", "2", "9"][(k >> 1) % 3]));
      }
    }
    // The tail: a larger sticker.
    const [tx, ty] = P(1);
    stickers.push(sticker(side * tx, ty - 0.03, side * -0.5, 0.08, "1"));
    // The head: jaws open, an amber eye, a gold brow.
    const [hx, hy] = P(0);
    parts.push(about(merge(BB(hx - 0.1, hx + 0.03, hy, hy + 0.06, -0.05, 0.05, EEL_GREEN, 0.015), BB(hx - 0.09, hx + 0.02, hy - 0.07, hy - 0.02, -0.045, 0.045, EEL_BELLY, 0.012)), hx, hy, -0.25));
    parts.push(about(B(hx - 0.085, hx - 0.01, hy - 0.025, hy + 0.005, -0.035, 0.035, "#4a1418"), hx, hy, -0.25));
    parts.push(disc(0.013, 0.006, hx - 0.03, hy + 0.035, 0.052, AMBER, 0.8, 8), disc(0.006, 0.004, hx - 0.033, hy + 0.035, 0.056, "#1a0e04", 0, 6));
    return { body: facing(parts, 0.2), decals: turnedY(merge(...stickers), side * 0.2) };
  };
  // Lurking: a dark shadow lying low under the water (local y about 0 to 0.3, the surface 0.6 over its anchor).
  const eelShadow = () => {
    const parts = [], N = 8;
    for (let k = 0; k < N; k++) {
      const ax = -0.26 + k * 0.065, bx = ax + 0.065, ay = 0.16 + Math.sin(k * 0.9) * 0.04, by = 0.16 + Math.sin((k + 1) * 0.9) * 0.04, r = 0.05 - k * 0.004;
      parts.push(rod(ax, ay, 0, bx, by, 0, r, "#14363a", 0, 8));
    }
    parts.push(B(-0.3, -0.24, 0.13, 0.2, -0.04, 0.04, "#14363a"), disc(0.01, 0.005, -0.27, 0.185, 0.045, AMBER, 0.35, 6));
    return noShadow(merge(...parts));
  };

  // ---- LEVIATHAN -----------------------------------------------------------------------------------------------------
  // Boss box about origin 0.4: x ±0.531, y -0.131 to 0.931. Its anchor (local y 0) rides the water's surface while it
  // is surfaced. A head of stacked transaction blocks, each stamped with a fee rate, toward -x.
  const stamp = (x, y, z, text) => [B(x - 0.065, x + 0.065, y - 0.04, y + 0.04, z, z + 0.004, STAMP), ...word(text, 0.012, x, y, z + 0.004, INK)];
  // The head fills its square, so a shot at any height inside the box meets it: jaw, snout, the fee-rate block of its
  // brow over the snout, the skull with the eye, the back of the head, and a crest across the full width under a crown
  // of paper slips. Each block's front stands at its own depth.
  const leviathan = (mode, side) => {
    const open = mode === "surfaced", lit = open ? 1.3 : 0.25, parts = [];
    parts.push(BB(-0.5, 0.22, -0.12, open ? 0.1 : 0.17, -0.2, 0.2, TEAL_DK));
    parts.push(BB(-0.53, -0.04, open ? 0.2 : 0.17, 0.42, -0.19, 0.19, TEAL));
    parts.push(BB(-0.53, -0.06, 0.42, 0.8, -0.205, 0.205, TEAL_LT));
    parts.push(BB(-0.1, 0.36, 0.16, 0.8, -0.225, 0.225, TEAL));
    parts.push(BB(0.3, 0.53, -0.12, 0.8, -0.195, 0.195, TEAL_DK));
    parts.push(BB(-0.53, 0.53, 0.78, 0.845, -0.17, 0.17, TEAL_DK, 0.015));
    if (open) {
      parts.push(B(-0.48, -0.05, 0.1, 0.2, -0.17, 0.14, "#3a0c10"));
      for (let x = -0.46; x < -0.1; x += 0.07) parts.push(fpoly([[x, 0.1], [x + 0.04, 0.1], [x + 0.02, 0.15]], 0.201, "#f3ecd8"), fpoly([[x + 0.015, 0.2], [x + 0.035, 0.155], [x + 0.055, 0.2]], 0.191, "#f3ecd8"));
    }
    // The eye on the near side under its brow ridge, and the nostrils.
    parts.push(B(-0.04, 0.1, 0.52, 0.64, 0.225, 0.239, AMBER, lit), B(0.015, 0.04, 0.53, 0.63, 0.239, 0.243, "#2a1200"), B(-0.06, 0.12, 0.64, 0.68, 0.225, 0.245, TEAL_DK));
    parts.push(B(-0.52, -0.5, 0.33, 0.37, 0.05, 0.12, "#123634"));
    // Fee rates stamped on its blocks, laid for the side it faces.
    const stamps = [...stamp(side * 0.16, 0.32, 0.227, "12"), ...stamp(side * -0.3, 0.6, 0.207, "45"), ...stamp(side * 0.41, 0.12, 0.197, "8"), ...stamp(side * -0.2, open ? -0.01 : 0.03, 0.202, "3")];
    // The crown: a feeding frenzy of paper slips across the crest, each at its own depth.
    const SLIP = ["#f6f3ea", "#d8ecc8", "#f4d8d0"];
    for (let k = 0; k < 9; k++) {
      const x = -0.44 + k * 0.11, y = 0.785, a = (k & 1 ? -1 : 1) * (0.12 + (k % 3) * 0.06), z = -0.1 + k * 0.025;
      parts.push(about(merge(B(x - 0.03, x + 0.03, y, y + 0.13, z - 0.004, z + 0.004, SLIP[k % 3]), B(x - 0.02, x + 0.02, y + 0.09, y + 0.1, z + 0.004, z + 0.006, "#9fb4d8"), B(x - 0.02, x + 0.01, y + 0.06, y + 0.07, z + 0.004, z + 0.006, "#9fb4d8")), x, y, a));
    }
    if (open) for (let x = -0.46, k = 0; x <= 0.47; x += 0.093, k++) parts.push(ngon(x, 0.01 + (k & 1) * 0.02, 0.05, 0.03, 0.25 + k * 1e-3, FOAM, 0.45, 8));
    if (mode === "rising") for (const [x, y, r] of [[-0.45, 0.5, 0.03], [-0.38, 0.58, 0.02], [-0.47, 0.66, 0.018], [-0.36, 0.72, 0.025]]) parts.push(ngon(x, y, r, r, 0.215 + y * 0.01, "#cfeef8", 0.4, 8));
    return { body: merge(...parts), decals: merge(...stamps) };
  };
  // Submerged: the head's own silhouette as a dark shadow, the crown's slips dark too, its eye faintly lit.
  const leviathanShadow = () => {
    const parts = [B(-0.53, 0.53, -0.12, 0.8, -0.12, 0.12, "#0f2c30"), B(-0.53, 0.53, 0.78, 0.84, -0.13, -0.122, "#0f2c30")];
    for (let k = 0; k < 9; k++) { const x = -0.44 + k * 0.11; parts.push(B(x - 0.03, x + 0.03, 0.78, 0.905, -0.11 + k * 0.004, -0.105 + k * 0.004, "#0f2c30")); }
    parts.push(B(-0.04, 0.1, 0.54, 0.62, 0.12, 0.132, AMBER, 0.4));
    return noShadow(merge(...parts));
  };
  // The rest of the Leviathan, its boss dressing set back: a neck of stacked blocks dropping nearly straight down from
  // behind the head into the lake, placed at the head's own x and y. It keeps within x -0.2 to 0.25 (inside the basin
  // at every spot either way it faces), its first block tops out under local y 0.4 (behind the head above the water),
  // and every vertex lies at z -0.46 to -0.309: behind the play band, in front of the rafts' back voxel.
  const NECK_Z = -0.4;
  const neck = () => {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const cx = 0.03 + (k & 1 ? 0.02 : -0.01), cy = 0.18 - k * 0.32, s = 0.19 - k * 0.01;
      const z = NECK_Z + k * 0.006;
      parts.push(BB(cx - s, cx + s, cy - s, cy + s, z - 0.06, z + 0.06, k & 1 ? TEAL_DK : TEAL, 0.02));
      parts.push(B(cx - 0.05, cx + 0.05, cy - 0.03, cy + 0.03, z + 0.06, z + 0.064, STAMP), B(cx - 0.03, cx + 0.03, cy - 0.006, cy + 0.006, z + 0.064, z + 0.067, INK));
    }
    return noShadow(merge(...parts));
  };

  // ---- stage-6 re-skins of the shared types --------------------------------------------------------------------------
  const head = (y, cap) => {
    const parts = [
      B(-0.03, 0.03, y - 0.03, y + 0.01, -0.035, 0.035, SKIN), BB(-0.072, 0.068, y, y + 0.16, -0.068, 0.068, SKIN, 0.02),
      B(-0.08, -0.071, y + 0.085, y + 0.108, 0.018, 0.042, EYE), B(-0.08, -0.071, y + 0.085, y + 0.108, -0.042, -0.018, EYE),
      B(-0.096, -0.072, y + 0.055, y + 0.085, -0.011, 0.011, SKIN_DK), B(-0.077, -0.071, y + 0.026, y + 0.04, -0.024, 0.024, MOUTH),
      B(-0.01, 0.026, y + 0.05, y + 0.1, 0.068, 0.08, SKIN), B(-0.01, 0.026, y + 0.05, y + 0.1, -0.08, -0.068, SKIN)
    ];
    if (cap) parts.push(
      B(-0.076, 0.072, y + 0.13, y + 0.2, -0.074, 0.074, "#24304f"), B(-0.082, 0.078, y + 0.2, y + 0.22, -0.08, 0.08, "#2c3a5e"),
      B(-0.15, -0.07, y + 0.128, y + 0.142, -0.07, 0.07, "#15181c"), B(-0.08, -0.076, y + 0.15, y + 0.185, -0.018, 0.018, GOLD, 0.25)
    );
    return parts;
  };
  // CLERK: a customs officer in a dark green oilskin rain cape and a peaked cap with a gold badge, rubber boots, the
  // stamp gun levelled at chest height (its rubber stamp toward -x). Feet at y 0; fodder box about origin 0.5.
  const CAPE = "#3f6b4a", CAPE_DK = "#2f5238", CAPE_LT = "#5a8a62";
  const customsOfficer = () => {
    const parts = [];
    for (const z of [0.05, -0.05]) parts.push(B(-0.1, 0.04, 0, 0.08, z - 0.042, z + 0.042, SHOE), B(-0.045, 0.035, 0.08, 0.32, z - 0.038, z + 0.038, "#26314f"));
    parts.push(lathe({ profile: [[0.17, 0.26], [0.14, 0.45], [0.105, 0.64], [0.05, 0.69], [0, 0.69]], segments: 10, color: CAPE }));
    parts.push(B(-0.172, -0.16, 0.27, 0.6, -0.02, 0.02, CAPE_LT), B(0.04, 0.12, 0.6, 0.72, -0.07, 0.07, CAPE_DK));
    for (let k = 0; k < 3; k++) parts.push(disc(0.012, 0.006, -0.135 + k * 0.012, 0.5 - k * 0.09, 0.06, "#c9ccd2", 0.2, 6));
    parts.push(...head(0.69, true));
    // The stamp gun at the hip, its inked face (the muzzle) on the clerk's shot start, in a caped arm.
    const gun = [
      B(-0.2, -0.16, 0.4, 0.5, -0.022, 0.022, "#7a5230"), B(-0.28, -0.14, 0.49, 0.56, -0.034, 0.034, "#3b3f46"),
      B(-0.305, -0.275, 0.45, 0.6, -0.058, 0.058, "#7a5230"), B(-0.318, -0.305, 0.46, 0.59, -0.05, 0.05, INK)
    ];
    parts.push(...BL.raidModels.holdGun(parts, { type: BL.raidStages.ENEMY.CLERK, yaw: 0.5, gun, muzzle: [-0.318, 0.525, 0], grip: [-0.18, 0.45, 0],
      shoulder: 0.6, upper: 0.15, lower: 0.14, w: 0.06, sleeve: CAPE, skin: SKIN }));
    return noShadow(BL.raidModels.standTall(facing(parts, 0.5)));
  };
  // CARRIER: a paper boat on the wind, folded from a fee notice, sailing toward +x with wind streaks behind it.
  // Centred (origin 0); fodder box ±0.344 by ±0.563.
  const paperBoat = (side) => {
    const P = "#f6f3ea", P_DK = "#d8d2c0", parts = [];
    parts.push(moved(prism([[-0.2, -0.1], [0.2, -0.1], [0.28, 0.02], [-0.28, 0.02]], 0.12, P), 0, 0, 0));
    parts.push(fpoly([[-0.28, 0.02], [0.28, 0.02], [0.2, -0.1], [-0.2, -0.1]].reverse(), 0.061, P_DK));
    parts.push(moved(prism([[-0.11, 0.02], [0.11, 0.02], [0, 0.2]], 0.03, P), 0, 0, 0), fpoly([[0, 0.02], [0.11, 0.02], [0, 0.2]], 0.016, P_DK));
    for (const y of [-0.07, -0.04]) parts.push(rect(-0.17, 0.17, y - 0.004, y + 0.004, 0.062, "#9fb4d8"));
    const seal = turnedY(merge(ngon(side * 0.1, -0.035, 0.03, 0.03, 0.064, INK, 0.1, 10), ...word("5", 0.008, side * 0.1, -0.035, 0.065, "#fbe8e0")), side * -0.45);
    for (const [y, l] of [[0.06, 0.12], [-0.02, 0.09], [-0.12, 0.1]]) parts.push(rect(-0.33, -0.33 + l, y - 0.006, y + 0.006, -0.03, "#ffffff", 0.3));
    return { body: facing(parts, -0.45), decals: seal };
  };
  // SENSOR: a tide gauge: a graduated board on a post over a stone footing, a float on a rod, and on top its housing's
  // round dial window: open, the dial glows with its wave and needle; shut, brass shutters close over it. Feet at y 0.
  const tideGauge = (open) => {
    const parts = [
      BB(-0.2, 0.2, 0, 0.07, -0.14, 0.14, BASALT, 0.015), B(-0.05, 0.05, 0.07, 0.5, -0.05, 0.05, "#7a5c3a"),
      B(-0.14, 0.03, 0.09, 0.46, 0.05, 0.062, "#f2efe6")
    ];
    for (let k = 0; k < 9; k++) { const y = 0.11 + k * 0.04; parts.push(B(-0.13, k % 2 ? -0.08 : -0.04, y, y + 0.012, 0.062, 0.066, INK)); }
    parts.push(rod(0.05, 0.25, 0, 0.13, 0.25, 0, 0.008, "#3b3f46"), disc(0.04, 0.05, 0.15, 0.25, 0, "#ff7a2a", 0.15, 10));
    parts.push(BB(-0.17, 0.17, 0.48, 0.68, -0.1, 0.1, "#3d6e6a", 0.02), disc(0.075, 0.02, 0, 0.58, 0.1, "#c9a040", 0.1, 16));
    if (open) {
      parts.push(disc(0.06, 0.006, 0, 0.58, 0.112, "#7ff0e8", 0.9, 16));
      for (let k = 0; k < 4; k++) parts.push(strip(-0.045 + k * 0.022, 0.565 + (k & 1) * 0.015, -0.023 + k * 0.022, 0.565 + ((k + 1) & 1) * 0.015, 0.008, 0.117, "#1f5a5a"));
      parts.push(strip(0, 0.58, 0.035, 0.615, 0.007, 0.119, INK, 0.3));
    } else {
      parts.push(disc(0.064, 0.012, 0, 0.58, 0.112, "#9a7a3a", 0.05, 16));
      for (let k = -1; k <= 1; k++) parts.push(B(-0.058, 0.058, 0.574 + k * 0.03, 0.582 + k * 0.03, 0.118, 0.122, "#6e5426"));
    }
    return noShadow(facing(parts, -0.15));
  };
  // REPO_TRUCK: the field art's truck, spattered with mud on its near side below its belt line (read from
  // raid-art-field.js's type when first built; it keeps that type's `pick`).
  const muddy = (geo, seed) => {
    const v = geo.verts, b = [Infinity, -Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) { b[0] = Math.min(b[0], v[i]); b[1] = Math.max(b[1], v[i]); b[2] = Math.min(b[2], v[i + 1]); b[3] = Math.max(b[3], v[i + 1]); b[4] = Math.max(b[4], v[i + 2]); }
    const rand = mulberry32(seed), parts = [geo], z = b[4] + 0.004;
    for (let k = 0; k < 34; k++) {
      const x = b[0] + 0.12 + rand() * (b[1] - b[0] - 0.24), y = b[2] + 0.05 + Math.pow(rand(), 1.6) * Math.min(0.8, b[3] - b[2] - 0.2), r = 0.02 + rand() * 0.07;
      parts.push(ngon(x, y, r * (1 + rand() * 0.6), r, z + rand() * 0.003, rand() < 0.5 ? "#5a4630" : "#6e5638", 0, 7, rand()));
      if (rand() < 0.4) parts.push(strip(x, y, x + (rand() - 0.5) * 0.12, y - 0.05 - rand() * 0.08, 0.018, z + 0.002, "#5a4630"));
    }
    for (let x = b[0] + 0.05; x < b[1] - 0.05; x += 0.09) parts.push(fpoly([[x, b[2] + 0.03], [x + 0.09, b[2] + 0.03], [x + 0.045, b[2] + 0.06 + rand() * 0.08]], z + 0.001, "#4e3c28"));
    return merge(...parts);
  };
  const truckLook = (variant) => cached(() => {
    const field = ART.types.REPO_TRUCK;
    if (!field || typeof field[variant] !== "function") throw new Error(`raid-art-lake: the mud-spattered truck needs BL.raidArt.types.REPO_TRUCK.${variant} (raid-art-field.js loads first)`);
    return muddy(field[variant](), 61);
  });

  // ---- the registry --------------------------------------------------------------------------------------------------
  const type = (name, looks) => put("types", name, Object.assign(specOf(name), looks));
  const twin = (build) => { const look = cached(build); return [look, cached(() => mirrored(look()))]; };
  // A look winding up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): `look` with a flare at its muzzle (x, y) in its
  // type's tell colour, its twin laid the same on the other look (x = 0 here, so neither needs mirroring).
  const wound = (name, look, x, y, r) => cached(() => BL.raidModels.windOf(look(), x, y, BL.raidModels.FAMILY_OF[name], undefined, r));
  // A look whose words must read the right way round either way: its body mirrored, its decals laid again for the side.
  const lettered = (build) => [cached(() => { const l = build(1); return noShadow(merge(l.body, l.decals)); }), cached(() => { const l = build(-1); return noShadow(merge(mirrored(l.body), l.decals)); })];
  const [eelOpen, eelOpenTurned] = lettered(eelLeap), [eelShut, eelShutTurned] = twin(eelShadow);
  type("FEE_EEL", {
    build: eelOpen, turned: eelOpenTurned, shut: eelShut, turnedShut: eelShutTurned,
    // A ready eel (told while it waits to leap) glows under the water where it lurks.
    shutWind: wound("FEE_EEL", eelShut, 0, SPEC.FEE_EEL[1]), turnedShutWind: wound("FEE_EEL", eelShutTurned, 0, SPEC.FEE_EEL[1]),
    pick: (state, slot) => {
      const r = state.eRoutine[slot], right = state.evx[slot] > 0;
      const open = r === EEL_LEAP ? true : r === EEL_LURK ? false : (state.eFlags[slot] & FLAG.SHUT) === 0;
      return open ? (right ? "turned" : "build") : (right ? "turnedShut" : "shut");
    }
  });
  const [levUp, levUpTurned] = lettered((side) => leviathan("surfaced", side)), [levRise, levRiseTurned] = lettered((side) => leviathan("rising", side)), [levDown, levDownTurned] = twin(leviathanShadow);
  // The Leviathan faces as the sim keeps it, `eAim` (the lake legion's: along its motion while it moves surfaced, else
  // toward the nearest Ooga once it is LEV_FACE to one side): 0 faces right, the turned twin.
  type("LEVIATHAN", {
    build: levUp, turned: levUpTurned, rising: levRise, turnedRising: levRiseTurned, shut: levDown, turnedShut: levDownTurned,
    // Rising and up until its spit and its lunge's time it winds up: its maw flares.
    wind: wound("LEVIATHAN", levUp, 0, SPEC.LEVIATHAN[1], 0.13), turnedWind: wound("LEVIATHAN", levUpTurned, 0, SPEC.LEVIATHAN[1], 0.13),
    risingWind: wound("LEVIATHAN", levRise, 0, SPEC.LEVIATHAN[1], 0.13), turnedRisingWind: wound("LEVIATHAN", levRiseTurned, 0, SPEC.LEVIATHAN[1], 0.13),
    pick: (state, slot) => {
      const r = state.eRoutine[slot], right = state.eAim[slot] === 0;
      if (r === LEV_RISE) return right ? "turnedRising" : "rising";
      if (r === LEV_SURFACED) return right ? "turned" : "build";
      if (r === LEV_SUBMERGED || (state.eFlags[slot] & FLAG.SHUT)) return right ? "turnedShut" : "shut";
      return right ? "turned" : "build";
    }
  });
  const neckLook = cached(neck), neckTurned = cached(() => mirrored(neckLook()));
  const NECK = Object.freeze({ build: neckLook, rising: neckLook, shut: neckLook, turned: neckTurned, turnedRising: neckTurned, turnedShut: neckTurned });
  const [clerk, clerkTurned] = twin(customsOfficer), [boat, boatTurned] = lettered(paperBoat);
  const [gaugeOpen, gaugeOpenTurned] = twin(() => tideGauge(true)), [gaugeShut, gaugeShutTurned] = twin(() => tideGauge(false));
  const truck = truckLook("build"), truckParked = truckLook("parked");
  const skin = (name, looks) => Object.freeze(Object.assign(specOf(name), looks));
  put("stages", "mempool", {
    id: "mempool", PLAY_BAND, DEPTH, DROP, CEILING_Y,
    sector, backdrop, water, bodyAt, surfaceAt, raftAt,
    skins: Object.freeze({
      CLERK: skin("CLERK", { build: clerk, turned: clerkTurned, wind: wound("CLERK", clerk, 0, SPEC.CLERK[1]), turnedWind: wound("CLERK", clerkTurned, 0, SPEC.CLERK[1]) }),
      CARRIER: skin("CARRIER", { build: boat, turned: boatTurned }),
      SENSOR: skin("SENSOR", { build: gaugeOpen, shut: gaugeShut, turned: gaugeOpenTurned, turnedShut: gaugeShutTurned }),
      REPO_TRUCK: skin("REPO_TRUCK", {
        build: truck, parked: truckParked,
        pick: (state, slot) => { const field = ART.types.REPO_TRUCK; if (!field || !field.pick) throw new Error("raid-art-lake: the truck's pick is raid-art-field.js's"); return field.pick(state, slot); }
      })
    }),
    // The Leviathan's dressing, set back: its neck by the head's look variant, placed at the head's x and y.
    boss: Object.freeze({ neck: NECK })
  });
  ART.lake = Object.freeze({ SPEC, boxOf, placesOf, lockWall });
})();
