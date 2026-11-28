// Ooga Raid's art for stage 5, The Lightning Factory Floor: the Factory's brick-and-iron hall, taken by the Fiat Legion
// and run with its belts. Geometry only: no nodes, no state, nothing per frame (the exceptions are `slide`, which writes
// one node's position, and the types' `pick`, which reads the sim's state; neither allocates). Every builder is cached
// once a page. It registers into the shared art registry: `BL.raidArt.stages.factory` and `BL.raidArt.types[NAME]` for
// ARC_PYLON, CAPACITOR and GRID_WARDEN.
//
// `sector(stage, screen)` is one 8 by 7 side screen in stage metres, everything read from the parsed stage: the solid
// cells cut from the grid four voxels deep (the iron floor, the riveted cabinets that stand on it, the brick plinth any
// BOND_MORTAR record stands on, and the brick end wall, a column solid to the top), their front faces dressed below
// each top edge (plates and rivets, cabinet doors, dials and lamps, brick courses, the end wall's sealed door), a bright
// steel lip on every top that can be stood on, the floor hatches (a column empty at row 0) as open shafts glowing blue
// with their grates hung open, the belts' static parts (a slot in the floor's face with rollers, the rubber band and its
// drums), the ledges as safety-yellow gantries in the back voxel on hanger rods, and the dressing behind: riveted iron
// pillars, domed transformers with arcing bushings, glass conduits carrying pulses of light, hung arc lamps, slung
// cables, the Legion's seal banners and, behind each BOND_MORTAR record, the forge's brick furnace mouth. Dressing never
// enters the play band (|z| < PLAY_BAND); nothing behind has a flat lit top (domes, sloped shoulders, rods), and only
// what can be stood on wears a bright edge (the steel lips, the gantries' yellow, the belt band's top).
//
// `belts(stage)` is each of the stage's belts (F8 `[col0, col1, row, v]`) as its moving chevrons, which point the way
// the belt runs, clipped to the band by a `clipSlab`: the scene places the node with `slide(node, belt, time)`, which
// shifts it by `time * v` modulo the chevrons' pitch, so they run the belt's way. `boss(stage)` is the Grid Warden's
// dressing, set back behind the play band at its placed record: the insulator tower with its crackling ball and a
// discharge horn to an electrode on the Warden's muzzle, a floor electrode on its spark origin (both read from
// `BL.raidLegionFactory.TUNE.WARDEN_MUZZLE` and `WARDEN_SPARK_FROM`, [dx, dy] from its x and feet; missing, it throws),
// the arms to the capacitors' mounts (read from the CAPACITOR def's `mounts`) and `blaze`, the white overload halo for
// the scene to show in overload; `muzzle` and `sparkFrom` are those points in the stage. `backdrop(stage)` is the hall's far brick wall with its tall arched windows and Tesla coils (rate
// 0.5) and the stormy night through them (rate 0.2), shaped like `BL.raidModels.backdrop()`, with the sky riding the
// camera.
//
// Types (`BL.raidArt.types`), each with `tier`, `origin` and its bullet `box` about its anchor, checked against the
// sim's TIER_OF and ORIGIN_OF at load and again at a stage's first build. Every look stays inside its box, and a
// machine (the three below, SENSOR and BOND_MORTAR) fills it to within a few centimetres on every side.
//   ARC_PYLON    a copper coil on a white ceramic stack in a riveted frame: `shut` hooded, `build` idle, `charge` glowing, crackling
//                (`opening(k)`, its `OPENINGS` frames as the hood sinks into the plinth)
//   CAPACITOR    a glass jar of lightning in brass: `shut` caged and dark, `build` open, `bright` and `full` as the charge runs out
//   GRID_WARDEN  the tower's core in its riveted shield cage: `shut`, `build` (the cage slid open) and `overload`
// Each gives `pick(state, slot)`, which names one of its own variants from the sim's state, reading the routine
// indices once, at first use, from `BL.raidLegionFactory.LOOK[NAME][state]` by the README's state names
// (ARC_PYLON.charge, GRID_WARDEN.charge and .overload); one not filled with an integer throws.
//
// Stage-5 re-skins of shared types live with the stage (`skins`): CLERK in a rubber apron and welding visor, CARRIER a
// glowing sats packet on two rotors, SENSOR a distribution cabinet of fuses (`shut`, padlocked), BOND_MORTAR the forge's
// crucible of molten sats in its frame on a hearth (`shut`, lidded), and LOB, whose shell (attr 1) is a molten coin here; any other attr
// is the shared `BL.raidArt.lobs[attr]`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedX, turnedY, turnedZ, prism, forwardLathe, along, noShadow, beam, tube, torus, turn, shaded } = BL.models;
  const { padNormals, flatInto, liana, sagPoints, SIGN_GLYPHS } = BL.hubModels;
  const { KIND, CELL, SCREEN_W } = BL.raidStages;
  const { RULES } = BL.raidSim;
  const { FLAG } = BL.raidEnemies;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-factory: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI;
  const SCREEN_X = SCREEN_W * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge fills only the back one, its front at LEDGE_Z. Front-face
  // detail stands just proud of the solids' faces at ZF.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3, ZF = Z1 + 0.004;
  const cellAt = (stage, col, row) => BL.raidStages.cellAt(stage, col, row);

  // ---- the types' boxes --------------------------------------------------------------------------------------------
  // Each type's tier and origin (the stage specs' table); its bullet box about its anchor.
  const SPEC = Object.freeze({
    ARC_PYLON: [1, 0.35], CAPACITOR: [1, 0], GRID_WARDEN: [3, 1.0],
    CLERK: [0, 0.5], CARRIER: [0, 0], SENSOR: [0, 0.25], BOND_MORTAR: [1, 0.35], LOB: [4, 0]
  });
  const boxOf = (name) => { const [tier, o] = SPEC[name], b = RULES.SHOT_BOX[tier]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  // SPEC must match the sim's tier and origin for every type it names, which the sim must have, or a look's box drifts
  // from its hit box. It is checked at load, and again at a stage's first build and at `boss`.
  const checkSpec = () => {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-factory: the sim has no ${name}`);
      if (TIER_OF[t] !== SPEC[name][0] || Math.abs(ORIGIN_OF[t] - SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-factory: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${SPEC[name][0]}, origin ${SPEC[name][1]} here`);
      }
    }
  };
  checkSpec();

  // ---- set pieces from the stage -------------------------------------------------------------------------------------
  // `belts` [col0, col1, row, v] (F8), nested or flat. A stage without the field has none; a record of the wrong length
  // throws.
  const records = (stage, key, stride) => {
    const src = stage[key], out = [];
    if (src === undefined) return out;
    if (src.length && typeof src[0] === "number") {
      if (src.length % stride) throw new Error(`raid-art-factory: ${stage.id}.${key} is not records of ${stride}`);
      for (let i = 0; i < src.length; i += stride) out.push(Array.from(src.subarray ? src.subarray(i, i + stride) : src.slice(i, i + stride)));
    } else for (const r of src) {
      if (r.length !== stride) throw new Error(`raid-art-factory: ${stage.id}.${key} has a record of ${r.length}, not ${stride}`);
      out.push(Array.from(r));
    }
    return out;
  };
  // The placed records of one type, by name, as [col, row, attr].
  const placedOf = (stage, name) => {
    const t = BL.raidStages.ENEMY[name], P = stage.placed, out = [];
    if (t === undefined) return out;
    for (let i = 0; i < P.length; i += 4) if (P[i + 2] === t) out.push([P[i], P[i + 1], P[i + 3]]);
    return out;
  };
  const byStage = (build) => {
    const cache = new WeakMap();
    return (stage) => { let v = cache.get(stage); if (v === undefined) { v = build(stage); cache.set(stage, v); } return v; };
  };

  // What the grid holds, worked out once a stage: the floor's top row (the most common top of the solid run from row
  // 0), the wall columns (solid to the top row), the hatch columns (empty at row 0), and the blocks standing on the
  // floor (runs of columns whose solid cells above the floor share their top), a block a BOND_MORTAR record stands on
  // being the forge's brick plinth.
  const plan = byStage((stage) => {
    checkSpec();
    const tops = new Map();
    for (let c = 0; c < stage.cols; c++) {
      let r = 0;
      while (r < stage.rows && cellAt(stage, c, r) === KIND.SOLID) r++;
      if (r > 0 && r < stage.rows) tops.set(r - 1, (tops.get(r - 1) || 0) + 1);
    }
    let floorRow = 0, most = -1;
    for (const [row, n] of tops) if (n > most || (n === most && row < floorRow)) { floorRow = row; most = n; }
    const wall = new Uint8Array(stage.cols), hatch = new Uint8Array(stage.cols), blockTop = new Int16Array(stage.cols).fill(-1);
    for (let c = 0; c < stage.cols; c++) {
      let full = true;
      for (let r = 0; r < stage.rows; r++) if (cellAt(stage, c, r) !== KIND.SOLID) full = false;
      wall[c] = full ? 1 : 0;
      hatch[c] = cellAt(stage, c, 0) === KIND.EMPTY ? 1 : 0;
      if (!full && cellAt(stage, c, floorRow + 1) === KIND.SOLID && cellAt(stage, c, floorRow) === KIND.SOLID) {
        let r = floorRow + 1;
        while (r + 1 < stage.rows && cellAt(stage, c, r + 1) === KIND.SOLID) r++;
        blockTop[c] = r;
      }
    }
    const mortars = placedOf(stage, "BOND_MORTAR"), blocks = [];
    for (let c = 0; c < stage.cols;) {
      if (blockTop[c] < 0) { c++; continue; }
      let e = c;
      while (e + 1 < stage.cols && blockTop[e + 1] === blockTop[c]) e++;
      const top = blockTop[c], forge = mortars.some(([mc, mr]) => mc >= c && mc <= e && mr === top + 1);
      blocks.push(Object.freeze({ c0: c, c1: e, r0: floorRow + 1, r1: top, forge }));
      c = e + 1;
    }
    const kind = new Uint8Array(stage.cols);   // 0 floor or cabinet, 1 forge brick
    for (const b of blocks) if (b.forge) for (let c = b.c0; c <= b.c1; c++) kind[c] = 1;
    return { floorRow, floorTop: (floorRow + 1) * CELL, wall, hatch, blocks, kind, mortars, belts: records(stage, "belts", 4) };
  });
  const beltAt = (p, col, row) => p.belts.some(([c0, c1, r]) => r === row && col >= c0 && col <= c1);

  // ---- palette -----------------------------------------------------------------------------------------------------
  const IRON = "#454a52", IRON_DK = "#2e3238", IRON_LT = "#666d76", PLATE = "#525860", STEEL_LT = "#a9b1ba", RIVET = "#7d858f";
  const CAB = "#4f6359", CAB_DK = "#3d4e46", CAB_LT = "#64796e";
  const BRICK = "#8a3b2c", BRICK_DK = "#73301f", BRICK_LT = "#9c4834", MORTAR = "#5a2a20";
  const SAFETY = "#f2c230", SAFETY_DK = "#c9971a", HAZARD = "#24262a";
  const FAR_BRICK = "#6e3024", FAR_MORTAR = "#4a2219";
  const ARC = "#d8f4ff", ARC_BLUE = "#7fd4ff", GLOW = "#3fb4ff", GLOW_DK = "#1a5fb8", GLASS = "#9fd8ee";
  const COPPER = "#c0703a", COPPER_LT = "#e09a5a", COPPER_DK = "#7e4220", CERAMIC = "#eef0ec", CERAMIC_DK = "#c9cdc6";
  const RUBBER = "#1d1e21", RUBBER_LT = "#3a3c40", SLOT = "#121417";
  const RED = "#b8322a", RED_DK = "#8a2620", GOLD = "#d9a63a", GOLD_LT = "#f5c542", EMBER = "#ff8a2a", EMBER_LT = "#ffd27a";
  const SKIN = "#e2ab82", SKIN_DK = "#c98e66", HAIR = "#2f241c", SHOE = "#1d1d20", EYE = "#1d1d20", MOUTH = "#7a2a22";

  // ---- small builders ----------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const F = () => ({ verts: [], faces: [], lines: [] });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z: one face.
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
  // A jagged arc of light through `points`, each leg a strip, z rising a hair a leg so no two legs share a plane.
  const zigzag = (points, w, z, color, emissive = 1) => {
    const out = [];
    for (let k = 0; k + 1 < points.length; k++) out.push(strip(points[k][0], points[k][1], points[k + 1][0], points[k + 1][1], w, z + k * 0.0015, color, emissive));
    return out;
  };
  // A square bar `w` thick from a to b in the xy plane at depth z.
  const bar = (ax, ay, bx, by, w, z, color, emissive = 0) => beam(ax, ay, z, bx, by, z, w, color, emissive);
  // A round bar from a to b, radius r.
  const rod = (ax, ay, az, bx, by, bz, r, color, emissive = 0, segments = 8) => {
    const l = Math.hypot(bx - ax, by - ay, bz - az);
    return along(lathe({ profile: [[0, 0], [r, 0], [r, l], [0, l]], segments, color, emissive }), ax, ay, az, bx - ax, by - ay, bz - az);
  };
  // A disc of radius r and thickness t facing the camera, centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  const ball = (r, x, y, z, color, emissive = 0, segments = 12) => moved(lathe({ profile: Array.from({ length: 7 }, (_, k) => [Math.sin(k / 6 * PI) * r, -Math.cos(k / 6 * PI) * r]), segments, color, emissive }), x, y, z);
  // Turns parts about z round a pivot: a positive angle rolls +x toward +y.
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
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
  // A word in the island's 3x5 sign alphabet, centred at (x, y): a space is a gap, any other missing glyph throws.
  const word = (text, cell, x, y, z, color, emissive = 0) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = SIGN_GLYPHS[text[i]];
      if (!glyph && text[i] !== " ") throw new Error(`raid-art-factory: the sign alphabet has no "${text[i]}"`);
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + (glyph ? glyph[r].replace(/1/g, "#").replace(/0/g, ".") : "...");
    }
    return pix(rows, cell, x, y, z, color, emissive);
  };
  const smoothGeo = () => ({ verts: [], faces: [], lines: [], smooth: true, normals: [] });
  // Appends a turned part to a smooth geometry keeping its shared corners, so the renderer averages its normals round.
  const smoothInto = (geo, part) => {
    const base = geo.verts.length / 3, v = part.verts;
    for (let i = 0; i < v.length; i++) geo.verts.push(v[i]);
    for (const f of part.faces) geo.faces.push({ ...f, i: f.i.map((k) => k + base) });
    padNormals(geo);
  };
  const finish = (geo, flats) => {
    if (flats.length) flatInto(geo, merge(...flats));
    padNormals(geo);
    geo.normals = Float32Array.from(geo.normals);
    geo.castShadow = false;
    return geo;
  };

  // The Fiat Legion's seal, flat: a gold ring on red and the Legion's barred F.
  const SEAL_GLYPH = [".###.", ".#...", "####.", ".#...", ".#..."];
  const seal = (cx, cy, r, z, emissive = 0.15) => [
    ngon(cx, cy, r, r, z, GOLD, emissive, 16), ngon(cx, cy, r * 0.8, r * 0.8, z + 0.003, RED, 0, 16),
    ...pix(SEAL_GLYPH, r * 0.26, cx + r * 0.05, cy, z + 0.006, GOLD_LT, emissive + 0.15)
  ];
  const padlock = (x, y, z, s = 1) => [
    rect(x - 0.045 * s, x - 0.028 * s, y + 0.02 * s, y + 0.085 * s, z, STEEL_LT), rect(x + 0.028 * s, x + 0.045 * s, y + 0.02 * s, y + 0.085 * s, z, STEEL_LT),
    rect(x - 0.045 * s, x + 0.045 * s, y + 0.085 * s, y + 0.102 * s, z, STEEL_LT),
    rect(x - 0.06 * s, x + 0.06 * s, y - 0.06 * s, y + 0.03 * s, z + 0.003, RED),
    ngon(x, y - 0.015 * s, 0.02 * s, 0.02 * s, z + 0.006, GOLD, 0.3, 8)
  ];
  // A yellow high-voltage triangle with a black bolt, its middle at (x, y).
  const voltSign = (x, y, s, z) => [
    fpoly([[x - s, y - s * 0.8], [x + s, y - s * 0.8], [x, y + s * 0.95]], z, SAFETY, 0.1),
    fpoly([[x - s * 0.72, y - s * 0.62], [x + s * 0.72, y - s * 0.62], [x, y + s * 0.62]], z + 0.003, SAFETY),
    ...zigzag([[x + s * 0.12, y + s * 0.5], [x - s * 0.14, y], [x + s * 0.12, y - s * 0.05], [x - s * 0.1, y - s * 0.5]], s * 0.13, z + 0.006, HAZARD, 0)
  ];
  // Mortar lines over a brick face: courses `course` tall, joints every `len`, staggered, the joints stopping short of
  // each course line so no two lines overlap.
  const bricks = (flats, x0, x1, y0, y1, z, course, len, color = MORTAR, seed = 0) => {
    const w = 0.014;
    for (let y = y0 + course, k = 0; y < y1 - 0.02; y += course, k++) flats.push(rect(x0, x1, y - w / 2, y + w / 2, z, color));
    for (let ya = y0, k = 0; ya < y1 - 0.02; ya += course, k++) {
      const yb = Math.min(y1, ya + course), off = ((k + seed) & 1) ? len / 2 : 0;
      for (let x = x0 + off + len; x < x1 - 0.03; x += len) flats.push(rect(x - w / 2, x + w / 2, ya + (ya > y0 ? w / 2 : 0), yb - (yb < y1 ? w / 2 : 0), z, color));
    }
  };

  // ---- the solid cells ---------------------------------------------------------------------------------------------
  const V = { PLATE: 1, IRON: 2, IRON_DK: 3, CAB: 4, CAB_TOP: 5, BRICK: 6, BRICK_DK: 7, SHAFT: 8 };
  const PALETTE = [null, PLATE, IRON, "#3f444b", CAB, CAB_LT, BRICK, BRICK_DK, "#0d1a2a"].map((c) => c && hexToRgb(c));
  const solidGeometry = (stage, screen, p) => {
    const grid = terrain.makeGrid(SCREEN_W, stage.rows, DEPTH);
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c;
      // A hatch's shaft: the back voxel filled up to the floor's top, its face glowing (see the hatches).
      if (p.hatch[col]) for (let r = 0; r <= p.floorRow; r++) if (cellAt(stage, col, r) === KIND.EMPTY) grid.set(c, r, 0, V.SHAFT);
      for (let r = 0; r < stage.rows; r++) {
        if (cellAt(stage, col, r) !== KIND.SOLID) continue;
        let value;
        if (p.wall[col]) value = (r & 1) ? V.BRICK_DK : V.BRICK;
        else if (r <= p.floorRow) value = r === p.floorRow ? V.PLATE : (col * 7 + r * 3) % 5 === 0 ? V.IRON_DK : V.IRON;
        else if (p.kind[col] === 1) value = (r & 1) ? V.BRICK_DK : V.BRICK;
        else value = cellAt(stage, col, r + 1) === KIND.SOLID ? V.CAB : V.CAB_TOP;
        for (let z = 0; z < DEPTH; z++) grid.set(c, r, z, value);
      }
    }
    const geo = terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: screen * SCREEN_X, y: 0, z: Z0 } });
    // Block joints line up across the sectors.
    if (geo.voxel) geo.voxel[1] = 0;
    return geo;
  };

  // The solids' fronts, all on the face (ZF) below each top edge: a steel lip on every top that can be stood on (not a
  // belt's, whose band is its edge, nor the end wall's), the floor's plates and rivets, hazard stripes by each hatch,
  // each cabinet's doors, dials, vents and lamps, the forge plinth's and the end wall's brick courses, and the end
  // wall's sealed iron door.
  const solidFronts = (stage, screen, p, flats, rand) => {
    const sx = screen * SCREEN_X;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, x0 = sx + c * CELL;
      if (p.wall[col]) continue;
      for (let r = 0; r < stage.rows; r++) {
        if (cellAt(stage, col, r) !== KIND.SOLID || cellAt(stage, col, r + 1) === KIND.SOLID || beltAt(p, col, r)) continue;
        const top = (r + 1) * CELL;
        flats.push(rect(x0, x0 + CELL, top - 0.05, top, ZF, STEEL_LT), rect(x0, x0 + CELL, top - 0.065, top - 0.05, ZF, IRON_DK));
      }
    }
    // The floor: rivet rows under the lip and near the foot, a plate seam every metre between them.
    const ft = p.floorTop;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, x0 = sx + c * CELL;
      if (p.hatch[col] || p.wall[col] || cellAt(stage, col, p.floorRow) !== KIND.SOLID) continue;
      // Beside a hatch (and not under a belt's slot) the hazard band takes the upper rivets' place and stops the seam, so
      // nothing on the face overlaps.
      const belt = beltAt(p, col, p.floorRow), band = !belt && (p.hatch[col - 1] || p.hatch[col + 1]), under = belt ? ft - 0.36 : ft - 0.14;
      for (const y of band ? [0.12] : [0.12, under]) for (let k = 0; k < 2; k++) flats.push(ngon(x0 + 0.125 + k * 0.25, y, 0.016, 0.016, ZF, RIVET, 0, 6));
      if ((col & 1) === 0) flats.push(rect(x0 - 0.007, x0 + 0.007, 0.16, band ? ft - 0.28 : under - 0.04, ZF, IRON_DK));
      // Hazard stripes on the floor's face beside a hatch.
      if (band) {
        flats.push(rect(x0, x0 + CELL, ft - 0.25, ft - 0.1, ZF, SAFETY));
        for (let k = 0; k < 4; k++) { const a = x0 + k * 0.125; flats.push(fpoly([[a, ft - 0.25], [a + 0.05, ft - 0.25], [a + 0.11, ft - 0.1], [a + 0.06, ft - 0.1]], ZF + 0.002, HAZARD)); }
      }
    }
    if (screen === 0) {
      flats.push(...word("FACTORY FLOOR", 0.045, sx + 3.2, ft * 0.5, ZF + 0.003, "#7d848c"));
      flats.push(...word("SEIZED", 0.035, sx + 6.2, ft * 0.5, ZF + 0.003, RED, 0.1));
    }
    // Each block standing on the floor, the part of it in this screen: a block crossing a screen's edge is dressed a
    // door at a time, each door in the screen its middle is in.
    for (const b of p.blocks) {
      const x0 = b.c0 * CELL, x1 = (b.c1 + 1) * CELL, y0 = p.floorTop, y1 = (b.r1 + 1) * CELL - 0.065;
      const ca = Math.max(x0, sx), cb = Math.min(x1, sx + SCREEN_X);
      if (cb <= ca) continue;
      if (b.forge) {
        bricks(flats, ca, cb, y0, y1, ZF, 0.125, 0.25);
        const mid = (x0 + x1) / 2;
        if (mid >= sx && mid < sx + SCREEN_X) flats.push(rect(x0 + 0.1, x1 - 0.1, y0 + 0.08, y0 + 0.24, ZF + 0.002, "#2a1610"), rect(x0 + 0.16, x1 - 0.16, y0 + 0.11, y0 + 0.21, ZF + 0.004, EMBER, 0.8));
        continue;
      }
      // A riveted cabinet: a door a metre, each with a vent, a dial or two, lamps and rivets at its edges.
      flats.push(rect(ca + (ca === x0 ? 0.03 : 0), cb - (cb === x1 ? 0.03 : 0), y0 + 0.03, y1 - 0.03, ZF, CAB_DK));
      const doors = Math.max(1, Math.round((x1 - x0) / 1.0)), dw = (x1 - x0) / doors;
      for (let d = 0; d < doors; d++) {
        const a = x0 + d * dw + 0.05, e = a + dw - 0.1, cy = (y0 + y1) / 2;
        if ((a + e) / 2 < sx || (a + e) / 2 >= sx + SCREEN_X) continue;
        flats.push(rect(a, e, y0 + 0.06, y1 - 0.06, ZF + 0.002, CAB));
        for (const y of [y0 + 0.1, y1 - 0.1]) for (const x of [a + 0.05, e - 0.05]) flats.push(ngon(x, y, 0.014, 0.014, ZF + 0.004, CAB_LT, 0, 6));
        for (let k = 0; k < 4; k++) flats.push(rect(a + 0.1, a + 0.36, y0 + 0.14 + k * 0.05, y0 + 0.165 + k * 0.05, ZF + 0.004, "#2a352f"));
        const dx = e - 0.2, dy = Math.min(y1 - 0.25, cy + 0.08);
        flats.push(ngon(dx, dy, 0.11, 0.11, ZF + 0.004, IRON_DK, 0, 14), ngon(dx, dy, 0.09, 0.09, ZF + 0.006, "#eae6d6", 0.15, 14));
        flats.push(strip(dx, dy, dx + Math.cos(0.6 + rand() * 1.8) * 0.075, dy + Math.sin(0.6 + rand() * 1.8) * 0.075, 0.012, ZF + 0.008, RED));
        flats.push(rect(a + 0.12, a + 0.17, y1 - 0.18, y1 - 0.13, ZF + 0.004, rand() < 0.5 ? "#6fe04a" : "#ff5a3c", 1), rect(a + 0.2, a + 0.25, y1 - 0.18, y1 - 0.13, ZF + 0.004, "#ffb02a", 0.8));
        if (d === 0 && y1 - y0 > 0.7) flats.push(...voltSign(a + 0.45, y1 - 0.26, 0.07, ZF + 0.004));
      }
    }
    // The end wall: brick courses, an iron frame round a sealed door with the Legion's seal, and the door's padlocks.
    for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (!p.wall[col]) { c++; continue; }
      let e = c;
      while (e + 1 < SCREEN_W && p.wall[screen * SCREEN_W + e + 1]) e++;
      const x0 = sx + c * CELL, x1 = sx + (e + 1) * CELL, top = stage.rows * CELL, dy0 = p.floorTop, dy1 = Math.min(top - 0.6, dy0 + 3.4);
      bricks(flats, x0, x1, 0, dy0 - 0.02, ZF, 0.15, 0.3, MORTAR, 1);
      bricks(flats, x0, x1, dy1 + 0.12, top, ZF, 0.15, 0.3, MORTAR, 1);
      flats.push(rect(x0, x1, dy0 - 0.02, dy1 + 0.12, ZF, IRON_DK));
      flats.push(rect(x0 + 0.1, x1 - 0.1, dy0 + 0.04, dy1, ZF + 0.003, IRON));
      for (let y = dy0 + 0.35; y < dy1 - 0.2; y += 0.6) flats.push(rect(x0 + 0.1, x1 - 0.1, y - 0.03, y + 0.03, ZF + 0.006, IRON_DK));
      for (let y = dy0 + 0.15; y < dy1; y += 0.3) for (const x of [x0 + 0.17, x1 - 0.17]) flats.push(ngon(x, y, 0.018, 0.018, ZF + 0.009, RIVET, 0, 6));
      flats.push(...seal((x0 + x1) / 2, dy0 + (dy1 - dy0) * 0.62, 0.32, ZF + 0.009, 0.2));
      flats.push(...padlock((x0 + x1) / 2 - 0.2, dy0 + 1.0, ZF + 0.009, 1.4), ...padlock((x0 + x1) / 2 + 0.2, dy0 + 1.0, ZF + 0.009, 1.4));
      c = e + 1;
    }
  };

  // ---- the hatches -------------------------------------------------------------------------------------------------
  // Each run of hatch columns: the shaft's back (the SHAFT voxels' face, LEDGE_Z) glowing blue in three bands, brightest
  // at the foot, and the grate swung open, hanging down the shaft from its left rim in front of the glow.
  const hatchFronts = (stage, screen, p, flats) => {
    const sx = screen * SCREEN_X, z = LEDGE_Z + 0.004;
    for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (!p.hatch[col]) { c++; continue; }
      let e = c;
      while (e + 1 < SCREEN_W && p.hatch[screen * SCREEN_W + e + 1]) e++;
      const x0 = sx + c * CELL, x1 = sx + (e + 1) * CELL, ft = p.floorTop;
      // Blue to its foot, never white: a white band at the floor's height would read as ground to stand on.
      flats.push(rect(x0, x1, 0, ft * 0.35, z, GLOW, 0.8), rect(x0, x1, ft * 0.35, ft * 0.68, z, GLOW_DK, 0.6), rect(x0, x1, ft * 0.68, ft - 0.02, z, "#123a78", 0.4));
      // The grate: a frame and bars, hinged at the left rim and hanging into the shaft.
      const gw = Math.min(0.42, (x1 - x0) * 0.45), gh = Math.min(0.9, ft * 0.6), g = [];
      const gz = LEDGE_Z + 0.03;
      g.push(rect(0, 0.03, -gh, 0, gz, IRON_DK), rect(gw - 0.03, gw, -gh, 0, gz, IRON_DK), rect(0.03, gw - 0.03, -0.03, 0, gz, IRON_DK), rect(0.03, gw - 0.03, -gh, -gh + 0.03, gz, IRON_DK));
      for (let x = 0.09; x < gw - 0.05; x += 0.07) g.push(rect(x, x + 0.022, -gh + 0.03, -0.03, gz + 0.002, IRON));
      flats.push(about(moved(merge(...g), x0 + 0.03, ft - 0.03, 0), x0 + 0.03, ft - 0.03, 0.14));
      c = e + 1;
    }
  };

  // ---- the belts ---------------------------------------------------------------------------------------------------
  // Static (in the sector): a dark slot in the face of the belt's cells, rollers in it, the rubber band along the top
  // with its highlight as the walk line, the return run along the slot's foot and the drums at either end. The parts of
  // a belt in this screen only.
  const DRUM_R = 0.15, BAND = 0.1, CHEVRON_PITCH = 0.3;
  const beltFronts = (stage, screen, p, flats) => {
    const sx = screen * SCREEN_X, ex = sx + SCREEN_X;
    for (const [c0, c1, row] of p.belts) {
      const x0 = c0 * CELL, x1 = (c1 + 1) * CELL, top = (row + 1) * CELL;
      const a = Math.max(x0, sx), b = Math.min(x1, ex);
      if (b <= a) continue;
      flats.push(rect(a, b, top - 2 * DRUM_R - 0.03, top, ZF, SLOT));
      for (let x = Math.ceil((x0 + DRUM_R + 0.25) / 0.35) * 0.35; x < x1 - DRUM_R - 0.1; x += 0.35) if (x >= a && x < b) flats.push(ngon(x, top - DRUM_R, 0.06, 0.06, ZF + 0.004, IRON_LT, 0, 10), ngon(x, top - DRUM_R, 0.022, 0.022, ZF + 0.008, IRON_DK, 0, 6));
      const ba = Math.max(a, x0 + DRUM_R), bb = Math.min(b, x1 - DRUM_R);
      if (bb > ba) flats.push(rect(ba, bb, top - BAND, top, ZF + 0.012, RUBBER), rect(ba, bb, top - 0.022, top, ZF + 0.015, RUBBER_LT), rect(ba, bb, top - 2 * DRUM_R, top - 2 * DRUM_R + 0.04, ZF + 0.012, RUBBER));
      for (const dx of [x0 + DRUM_R, x1 - DRUM_R]) if (dx >= a && dx < b) flats.push(ngon(dx, top - DRUM_R, DRUM_R, DRUM_R, ZF + 0.011, RUBBER, 0, 16), ngon(dx, top - DRUM_R, DRUM_R * 0.55, DRUM_R * 0.55, ZF + 0.017, IRON_LT, 0, 12), ngon(dx, top - DRUM_R, 0.025, 0.025, ZF + 0.02, IRON_DK, 0, 6));
    }
  };
  // Moving: the chevrons, pointing the way the belt runs (the sign of v), laid a pitch past either end of the band and
  // clipped to it in the world by a clipSlab, so sliding the node by up to a pitch either way keeps them on the band.
  const chevrons = (belt) => {
    const [c0, c1, row, v] = belt, x0 = c0 * CELL + DRUM_R, x1 = (c1 + 1) * CELL - DRUM_R, top = (row + 1) * CELL;
    const dir = v > 0 ? 1 : -1, y0 = top - BAND + 0.018, y1 = top - 0.03, ym = (y0 + y1) / 2, z = ZF + 0.02, parts = [];
    for (let x = x0 - CHEVRON_PITCH; x < x1 + CHEVRON_PITCH; x += CHEVRON_PITCH) {
      const tip = x + dir * 0.07;
      parts.push(fpoly(dir > 0 ? [[x, y0], [x + 0.035, y0], [tip + 0.035, ym], [tip, ym]] : [[x - 0.035, y0], [x, y0], [tip, ym], [tip - 0.035, ym]], z, SAFETY, 0.25));
      parts.push(fpoly(dir > 0 ? [[tip, ym], [tip + 0.035, ym], [x + 0.035, y1], [x, y1]] : [[tip - 0.035, ym], [tip, ym], [x, y1], [x - 0.035, y1]], z + 0.001, SAFETY, 0.25));
    }
    const geo = noShadow(merge(...parts));
    geo.clipSlab = new Float32Array([2 / (x1 - x0), 0, 0, -(x0 + x1) / (x1 - x0)]);
    return geo;
  };
  const belts = byStage((stage) => Object.freeze(plan(stage).belts.map((belt) => Object.freeze({
    chevrons: chevrons(belt), x0: belt[0] * CELL + DRUM_R, x1: (belt[1] + 1) * CELL - DRUM_R, row: belt[2], top: (belt[2] + 1) * CELL, v: belt[3], pitch: CHEVRON_PITCH
  }))));
  // Places a belt's chevron node at stage time `time`: shifted by time * v, wrapped into one pitch. Allocates nothing.
  const slide = (node, belt, time) => {
    node.position.x = (time * belt.v) % belt.pitch; node.position.y = 0; node.position.z = 0;
  };

  // ---- the gantries ------------------------------------------------------------------------------------------------
  // A ledge run as a safety-yellow steel walkway in the back voxel: a yellow walk edge flush with the cell's top, a
  // channel with grating slots, a truss under it and hanger rods from its ends (and every 1.5 m) up past the screen.
  const HANGER_Z = -1.06;
  const gantry = (flats, x0, x1, top, sky) => {
    const zf = LEDGE_Z;
    flats.push(B(x0, x1, top - 0.05, top, Z0, zf + 0.025, SAFETY));
    flats.push(B(x0, x1, top - 0.17, top - 0.05, Z0, zf, SAFETY_DK));
    for (let x = x0 + 0.04; x < x1 - 0.05; x += 0.1) flats.push(rect(x, x + 0.055, top - 0.15, top - 0.075, zf + 0.002, "#3a2e10"));
    const n = Math.max(1, Math.round((x1 - x0 - 0.06) / 0.25)), step = (x1 - x0 - 0.06) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + 0.03 + k * step, b = a + step;
      flats.push(k & 1 ? bar(a, top - 0.17, b, top - 0.36, 0.03, -0.8, SAFETY_DK) : bar(a, top - 0.36, b, top - 0.17, 0.03, -0.8, SAFETY_DK));
    }
    flats.push(B(x0 + 0.03, x1 - 0.03, top - 0.38, top - 0.345, Z0 + 0.1, zf - 0.12, SAFETY_DK));
    const hangers = [x0 + 0.06, x1 - 0.06];
    for (let x = x0 + 1.5; x < x1 - 0.7; x += 1.5) hangers.push(x);
    for (const x of hangers) flats.push(B(x - 0.012, x + 0.012, top - 0.05, sky, HANGER_Z - 0.012, HANGER_Z + 0.012, IRON_DK));
  };
  const ledgeGeometry = (stage, screen) => {
    const flats = [], sx = screen * SCREEN_X, sky = stage.rows * CELL + 0.6;
    for (let row = 0; row < stage.rows; row++) for (let c = 0; c < SCREEN_W;) {
      const col = screen * SCREEN_W + c;
      if (cellAt(stage, col, row) !== KIND.LEDGE) { c++; continue; }
      let e = c;
      while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.LEDGE) e++;
      gantry(flats, sx + c * CELL, sx + e * CELL, (row + 1) * CELL, sky);
      c = e;
    }
    return flats.length ? merge(...flats) : null;
  };

  // ---- the dressing ------------------------------------------------------------------------------------------------
  // Depths, all behind the play band: hangers -1.06, arc lamps -1.1, pillars (front -1.3), cables -1.5, the forge's
  // furnace (front -1.6), conduits -2.0, transformers (about -2.3).
  const PILLAR_Z0 = -1.7, PILLAR_Z1 = -1.3, PILLARS = [2, 6], LAMPS = [0.9, 4.9], TRANSFORMER_AT = 4, CONDUITS = [6.15, 6.55];
  const CONDUIT_Z = -2.0, LAMP_Z = -1.1, CABLE_Z = -1.5, FURNACE_Z = -1.6, TRANSFORMER_Z = -2.3;
  // The Warden's tower and the furnaces keep pillars and transformers clear of their reach (x either side).
  const FURNACE_HALF = 1.45, TOWER_CLEAR = 1.1;
  const pillar = (flats, x, y0, y1) => {
    flats.push(B(x - 0.16, x + 0.16, y0, y1, PILLAR_Z0, PILLAR_Z1, IRON));
    flats.push(rect(x - 0.16, x - 0.12, y0, y1, PILLAR_Z1 + 0.002, IRON_LT), rect(x + 0.12, x + 0.16, y0, y1, PILLAR_Z1 + 0.002, IRON_DK));
    for (let y = y0 + 0.125; y < y1; y += 0.25) flats.push(ngon(x, y, 0.016, 0.016, PILLAR_Z1 + 0.004, RIVET, 0, 6));
    flats.push(fpoly([[x - 0.26, y0], [x + 0.26, y0], [x + 0.17, y0 + 0.16], [x - 0.17, y0 + 0.16]], PILLAR_Z1 + 0.006, IRON_DK));
    flats.push(bar(x - 0.1, 6.55, x - 0.85, 7.45, 0.07, PILLAR_Z0 + 0.1, IRON_DK), bar(x + 0.1, 6.55, x + 0.85, 7.45, 0.07, PILLAR_Z0 + 0.1, IRON_DK));
  };
  // A domed transformer on the hall floor: a finned drum, a domed lid, three ceramic bushings with copper horns and, on
  // some screens, an arc jumping between two of them.
  const transformer = (round, flats, x, y, arcing) => {
    round.push(moved(turn([[0, 0], [0.55, 0], [0.55, 1.25], [0.5, 1.42], [0.34, 1.6], [0, 1.66]], 16, "#4a5a52"), x, y, TRANSFORMER_Z));
    for (let k = -3; k <= 3; k++) flats.push(B(x + k * 0.12 - 0.018, x + k * 0.12 + 0.018, y + 0.12, y + 1.15, TRANSFORMER_Z + 0.5, TRANSFORMER_Z + 0.58, "#3a4842"));
    flats.push(...voltSign(x, y + 0.75, 0.1, TRANSFORMER_Z + 0.6));
    const tips = [];
    for (const dx of [-0.26, 0, 0.26]) {
      const by = y + (dx ? 1.5 : 1.62);
      round.push(moved(turn([[0, 0], [0.07, 0], [0.07, 0.04], [0.1, 0.06], [0.06, 0.09], [0.06, 0.12], [0.09, 0.14], [0.05, 0.17], [0.05, 0.22], [0, 0.22]], 10, CERAMIC), x + dx, by, TRANSFORMER_Z + 0.1));
      flats.push(bar(x + dx, by + 0.22, x + dx * 1.6, by + 0.5, 0.025, TRANSFORMER_Z + 0.1, COPPER));
      tips.push([x + dx * 1.6, by + 0.5]);
    }
    if (arcing) flats.push(...zigzag([tips[0], [tips[0][0] + 0.08, tips[0][1] + 0.12], [x - 0.1, tips[0][1] + 0.04], [x, tips[1][1]]], 0.022, TRANSFORMER_Z + 0.62, ARC, 1.2));
  };
  const arcLamp = (round, flats, x, sky) => {
    flats.push(B(x - 0.01, x + 0.01, 6.24, sky, LAMP_Z - 0.01, LAMP_Z + 0.01, IRON_DK));
    round.push(moved(turn([[0.24, 0], [0.2, 0.08], [0.12, 0.18], [0.04, 0.24], [0, 0.25]], 14, IRON_DK), x, 6.0, LAMP_Z));
    flats.push(ngon(x, 5.99, 0.17, 0.05, LAMP_Z + 0.25, ARC, 1.3, 12), ngon(x, 5.97, 0.1, 0.03, LAMP_Z + 0.252, "#ffffff", 1.4, 10));
    flats.push(...zigzag([[x - 0.12, 5.94], [x - 0.04, 5.88], [x + 0.03, 5.92], [x + 0.12, 5.86]], 0.012, LAMP_Z + 0.26, ARC_BLUE, 1.2));
  };
  const banner = (flats, cx, top, w, h, z) => {
    flats.push(B(cx - w / 2 - 0.08, cx + w / 2 + 0.08, top - 0.03, top + 0.03, z - 0.03, z + 0.01, IRON_DK));
    flats.push(fpoly([[cx - w / 2, top - h], [cx, top - h + h * 0.16], [cx + w / 2, top - h], [cx + w / 2, top], [cx - w / 2, top]], z + 0.01, RED));
    flats.push(rect(cx - w / 2 + 0.04, cx - w / 2 + 0.07, top - h + h * 0.18, top - 0.04, z + 0.014, RED_DK), rect(cx + w / 2 - 0.07, cx + w / 2 - 0.04, top - h + h * 0.18, top - 0.04, z + 0.014, RED_DK));
    flats.push(...seal(cx, top - h * 0.4, w * 0.3, z + 0.018));
  };
  // The forge behind a BOND_MORTAR record at x: a brick furnace from the hall floor, its arched mouth glowing over the
  // plinth, shoulders sloping in to a chimney that runs up out of the screen.
  const furnace = (flats, x, floorTop, mouthY, sky) => {
    const z = FURNACE_Z, w = FURNACE_HALF, sh = mouthY + 1.6;
    flats.push(B(x - w, x + w, floorTop - 0.1, sh, z - 0.9, z, BRICK_DK));
    flats.push(fpoly([[x - w, sh], [x + w, sh], [x + 0.55, sh + 0.8], [x - 0.55, sh + 0.8]], z + 0.002, BRICK));
    flats.push(B(x - 0.55, x + 0.55, sh + 0.8, sky, z - 0.7, z - 0.1, BRICK_DK));
    bricks(flats, x - w, x + w, floorTop - 0.1, sh, z + 0.002, 0.2, 0.4);
    bricks(flats, x - 0.55, x + 0.55, sh + 0.8, sky, z - 0.098, 0.2, 0.4, MORTAR, 1);
    // The mouth: an iron arch round a glowing fire.
    const mw = 0.75, my0 = mouthY - 0.1, my1 = mouthY + 0.75, arch = [[x - mw, my0], [x + mw, my0]];
    for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; arch.push([x + Math.cos(a) * mw, my1 + Math.sin(a) * mw * 0.6]); }
    const outline = [[x - mw - 0.08, my0], [x + mw + 0.08, my0]];
    for (let k = 0; k <= 8; k++) { const a = k / 8 * PI; outline.push([x + Math.cos(a) * (mw + 0.08), my1 + Math.sin(a) * (mw * 0.6 + 0.08)]); }
    flats.push(fpoly(outline, z + 0.006, IRON_DK), fpoly(arch, z + 0.009, EMBER, 1));
    flats.push(fpoly([[x - mw * 0.7, my0], [x + mw * 0.7, my0], [x + mw * 0.6, my1], [x, my1 + mw * 0.45], [x - mw * 0.6, my1]], z + 0.012, EMBER_LT, 1.2));
    for (let k = 0; k < 5; k++) flats.push(fpoly([[x - 0.5 + k * 0.25, my0], [x - 0.38 + k * 0.25, my0], [x - 0.44 + k * 0.25, my0 + 0.25 + (k & 1) * 0.15]], z + 0.015, "#fff4c8", 1.3));
    flats.push(...word("FORGE", 0.05, x, sh - 0.25, z + 0.006, GOLD, 0.3));
  };
  const dressingGeometry = (stage, screen, p, rand) => {
    const geo = smoothGeo(), round = [], flats = [], sx = screen * SCREEN_X, sky = stage.rows * CELL + 0.6, ft = p.floorTop;
    const towers = placedOf(stage, "GRID_WARDEN").map(([c]) => (c + 0.5) * CELL);
    const furnaces = p.mortars.map(([c, r]) => [(c + 0.5) * CELL, r * CELL]);
    const clear = (x, half) => !towers.some((t) => Math.abs(t - x) < TOWER_CLEAR + half) && !furnaces.some(([f]) => Math.abs(f - x) < FURNACE_HALF + half) && !p.wall[Math.floor(x / CELL)] && !p.wall[Math.floor((x - half) / CELL)] && !p.wall[Math.floor((x + half) / CELL)];
    for (const lx of PILLARS) { const x = sx + lx; if (clear(x, 0.3)) pillar(flats, x, ft - 0.1, sky); }
    if (clear(sx + TRANSFORMER_AT, 0.6)) transformer(round, flats, sx + TRANSFORMER_AT, ft, rand() < 0.6);
    for (const lx of LAMPS) { const x = sx + lx; if (clear(x, 0.3)) arcLamp(round, flats, x, sky); }
    // The glass conduits: pale tubes carrying pulses of light, clamped at each pillar.
    let x0 = sx, x1 = sx + SCREEN_X;
    for (let c = 0; c < SCREEN_W; c++) if (p.wall[screen * SCREEN_W + c]) { x1 = Math.min(x1, sx + c * CELL); }
    for (const y of CONDUITS) {
      if (x1 > x0) round.push(rod(x0, y, CONDUIT_Z, x1, y, CONDUIT_Z, 0.06, GLASS, 0.35, 10));
      for (let k = 0; k < 3; k++) {
        const a = x0 + rand() * Math.max(0, x1 - x0 - 0.5);
        if (x1 - x0 > 0.6) round.push(rod(a, y, CONDUIT_Z, a + 0.18 + rand() * 0.2, y, CONDUIT_Z, 0.066, ARC, 1.1, 10));
      }
      for (const lx of PILLARS) { const x = sx + lx; if (x < x1) flats.push(B(x - 0.04, x + 0.04, y - 0.085, y + 0.085, CONDUIT_Z - 0.09, CONDUIT_Z + 0.09, IRON_DK)); }
    }
    // A conduit drop down the first pillar on even screens into a junction box.
    const drop = sx + PILLARS[0];
    if ((screen & 1) === 0 && clear(drop, 0.3)) {
      round.push(rod(drop, CONDUITS[0], -1.24, drop, ft + 1.0, -1.24, 0.045, GLASS, 0.35, 8), rod(drop, ft + 2.2, -1.24, drop, ft + 2.5, -1.24, 0.05, ARC, 1.1, 8));
      round.push(rod(drop, CONDUITS[0], CONDUIT_Z, drop, CONDUITS[0], -1.24, 0.045, GLASS, 0.35, 8));
      flats.push(B(drop - 0.15, drop + 0.15, ft + 0.7, ft + 1.0, -1.28, -1.18, IRON_DK), rect(drop - 0.1, drop + 0.1, ft + 0.75, ft + 0.95, -1.178, "#1a2a3a"), rect(drop - 0.06, drop + 0.06, ft + 0.8, ft + 0.9, -1.176, GLOW, 0.8));
    }
    // Slung cables between the pillars.
    for (let k = 0; k < 2; k++) {
      const ya = 5.1 + rand() * 1.2, yb = ya + (rand() - 0.5) * 0.8;
      const a = sx + PILLARS[0], b = sx + PILLARS[1];
      if (clear(a, 0.3) && clear(b, 0.3)) liana(geo, sagPoints(a, ya, CABLE_Z - k * 0.05, b, yb, CABLE_Z - k * 0.05, 0.3 + rand() * 0.3, 10), 0.025, 0.025, k ? "#17191c" : COPPER_DK);
    }
    // A seal banner on one pillar every other screen.
    if (screen & 1) { const x = sx + PILLARS[1]; if (clear(x, 0.4)) banner(flats, x, 6.9, 0.62, 1.25, PILLAR_Z1 + 0.05); }
    for (const [fx, fy] of furnaces) if (fx >= sx && fx < sx + SCREEN_X) furnace(flats, fx, ft, fy, sky);
    hatchFronts(stage, screen, p, flats);
    beltFronts(stage, screen, p, flats);
    solidFronts(stage, screen, p, flats, rand);
    for (const part of round) smoothInto(geo, part);
    return finish(geo, flats);
  };

  // One screen's geometries, cached by stage and screen.
  const sectorCache = new WeakMap();
  const sector = (stage, screen) => {
    if (stage.kind !== "side") throw new Error(`raid-art-factory: ${stage.id} is not a side stage`);
    if (!(screen >= 0 && screen < stage.screens)) throw new RangeError(`raid-art-factory: ${stage.id} has no screen ${screen}; its screens are 0 to ${stage.screens - 1}`);
    let byScreen = sectorCache.get(stage);
    if (!byScreen) sectorCache.set(stage, byScreen = []);
    if (byScreen[screen]) return byScreen[screen];
    const p = plan(stage), rand = mulberry32(fnv1a("factory:" + screen));
    return (byScreen[screen] = [solidGeometry(stage, screen, p), ledgeGeometry(stage, screen), dressingGeometry(stage, screen, p, rand)].filter(Boolean));
  };

  // ---- the boss's dressing -----------------------------------------------------------------------------------------
  // The Grid Warden's insulator tower, in stage metres at its record and all behind the play band: a flared pedestal on
  // the floor, a stack of ceramic discs, a corona ring and the crackling ball over it, with arcs; a discharge horn from
  // the ball to an electrode on the Warden's muzzle and a floor electrode on its spark origin, both read from the legion
  // file's TUNE (`WARDEN_MUZZLE` and `WARDEN_SPARK_FROM`, [dx, dy] from its x and feet), so the tower-top shot leaves
  // the electrode and the sparks leave the floor stud; an arm to each of the CAPACITOR def's mounts, ending behind the
  // jar. `blaze` is the white halo and rays round the ball for the overload, behind the tower.
  const TOWER_Z = -1.05, BALL_R = 0.34, STACK_GAP = 0.5, ELECTRODE_R = 0.13, ARM_Z = -0.55, STUD_Z = -0.62;
  const offsetOf = (key) => {
    const tune = BL.raidLegionFactory && BL.raidLegionFactory.TUNE, at = tune && tune[key];
    if (!at || at.length !== 2 || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) throw new Error(`raid-art-factory: BL.raidLegionFactory.TUNE.${key} is not an [dx, dy] offset`);
    return at;
  };
  const boss = byStage((stage) => {
    checkSpec();
    const recs = placedOf(stage, "GRID_WARDEN");
    if (!recs.length) return null;
    if (recs.length > 1) throw new Error(`raid-art-factory: ${stage.id} places ${recs.length} GRID_WARDENs; the art dresses one`);
    const [col, row] = recs[0], x = (col + 0.5) * CELL, y = row * CELL;
    const capacitor = BL.raidEnemies.TYPES[BL.raidStages.ENEMY.CAPACITOR], mounts = capacitor && capacitor.mounts;
    if (!mounts) throw new Error("raid-art-factory: the CAPACITOR def has no mounts for the Warden's arms");
    const [mx, my] = offsetOf("WARDEN_MUZZLE"), [sx, sy] = offsetOf("WARDEN_SPARK_FROM");
    const ballY = my, stackTop = ballY - STACK_GAP, round = [], flats = [];
    round.push(moved(turn([[0, 0], [0.62, 0], [0.62, 0.08], [0.38, 0.3], [0.22, 0.34], [0, 0.34]], 18, IRON_DK), x, y, TOWER_Z));
    const prof = [[0, 0.34], [0.2, 0.34]];
    for (let h = 0.4; h < stackTop - 0.1; h += 0.2) prof.push([0.2, h], [0.4, h + 0.05], [0.4, h + 0.08], [0.2, h + 0.14]);
    prof.push([0.2, stackTop], [0, stackTop]);
    round.push(moved(turn(prof, 16, CERAMIC), x, y, TOWER_Z));
    round.push(moved(turn([[0, stackTop], [0.14, stackTop], [0.12, ballY - BALL_R + 0.05], [0, ballY - BALL_R + 0.05]], 12, COPPER_DK), x, y, TOWER_Z));
    round.push(moved(torus(0.5, 0.055, COPPER, 0.2, 22, 8), x, y + ballY - 0.3, TOWER_Z));
    round.push(ball(BALL_R, x, y + ballY, TOWER_Z, "#c9d6e0", 0.35, 16));
    // The discharge horn and its electrode, centred on the muzzle, a little in front of the ball.
    round.push(rod(x, y + ballY, TOWER_Z + 0.2, x + mx, y + my, TOWER_Z + 0.2, 0.045, COPPER, 0.2, 10));
    round.push(ball(ELECTRODE_R, x + mx, y + my, TOWER_Z + 0.2, "#e8f4ff", 0.6, 14));
    for (const [a, len] of [[0.5, 0.55], [2.2, 0.5], [3.7, 0.6], [5.4, 0.45]]) {
      const pts = [[x + Math.cos(a) * BALL_R, y + ballY + Math.sin(a) * BALL_R]];
      for (let k = 1; k <= 3; k++) { const r = BALL_R + len * k / 3, b = a + (k & 1 ? 0.25 : -0.2); pts.push([x + Math.cos(b) * r, y + ballY + Math.sin(b) * r]); }
      flats.push(...zigzag(pts, 0.025, TOWER_Z + 0.5, ARC, 1.3));
    }
    // The floor electrode at the spark origin: a ceramic stud with a copper dome, its lead run back to the pedestal.
    round.push(moved(turn([[0, 0], [0.14, 0], [0.14, 0.03], [0.09, 0.05], [0.12, 0.07], [0.09, 0.09], [0.1, 0.1], [0.06, 0.14], [0, 0.15]], 14, CERAMIC), x + sx, y + sy, STUD_Z));
    round.push(ball(0.06, x + sx, y + sy + 0.15, STUD_Z, COPPER_LT, 0.5, 10));
    flats.push(bar(x + sx + 0.1, y + sy + 0.02, x - 0.4, y + 0.02, 0.03, STUD_Z - 0.1, "#17191c"));
    for (const [dx, dy] of mounts) {
      const ay = y + dy, ex = x + dx + 0.12;
      flats.push(bar(x - 0.15, ay, ex, ay, 0.08, ARM_Z, IRON));
      flats.push(bar(x - 0.15, ay - 0.07, ex, ay - 0.07, 0.025, ARM_Z, COPPER));
      round.push(moved(turnedZ(turn([[0, 0], [0.08, 0], [0.11, 0.04], [0.08, 0.08], [0.11, 0.12], [0.08, 0.16], [0, 0.16]], 10, CERAMIC), PI / 2), x - 0.12, ay, ARM_Z));
    }
    const tower = shaded(round, flats);
    tower.castShadow = false;
    const halo = [ngon(x, y + ballY, 0.95, 0.95, -1.62, "#cfeeff", 0.9, 20), ngon(x, y + ballY, 0.62, 0.62, -1.6, "#ffffff", 1.3, 18)];
    for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; halo.push(strip(x + Math.cos(a) * 0.6, y + ballY + Math.sin(a) * 0.6, x + Math.cos(a) * 1.35, y + ballY + Math.sin(a) * 1.35, 0.05, -1.58 + k * 0.001, "#ffffff", 1.2)); }
    return Object.freeze({ x, y, tower, blaze: noShadow(merge(...halo)), muzzle: Object.freeze([x + mx, y + my]), sparkFrom: Object.freeze([x + sx, y + sy]) });
  });

  // ---- the backdrop ------------------------------------------------------------------------------------------------
  // Flat painted cut-outs laid over the stage's scroll times each layer's rate, with a margin. The near layer is the
  // hall's far brick wall, its tall arched windows open on the far layer, Tesla coils glowing before it; the far layer
  // is the stormy night through the windows; the sky rides the camera.
  const WALL_Z = -12, STORM_Z = -20, SKY_Z = -25, WALL_RATE = 0.5, STORM_RATE = 0.2, BAY = 3.0, WIN_W = 1.3, WIN_Y0 = 3.4, WIN_Y1 = 6.3;
  const backdrop = byStage((stage) => {
    const run = (stage.lockScreen + 1) * SCREEN_X;
    // The wall: brick piers between windows, mortar courses, iron glazing in each window, Tesla coils every other bay.
    const wall = [], wFrom = -16, wTo = run * WALL_RATE + 24, r = WIN_W / 2, top = 9;
    for (let bx = wFrom; bx < wTo; bx += BAY) {
      const a = bx + (BAY - WIN_W) / 2, b = a + WIN_W, cx = (a + b) / 2;
      wall.push(rect(bx, a, -2, top, 0, FAR_BRICK), rect(b, bx + BAY, -2, top, 0, FAR_BRICK), rect(a, b, -2, WIN_Y0, 0, FAR_BRICK));
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * PI, a1 = (k + 1) / 8 * PI;
        wall.push(fpoly([[cx + Math.cos(a0) * r, WIN_Y1 + Math.sin(a0) * r], [cx + Math.cos(a0) * r, top], [cx + Math.cos(a1) * r, top], [cx + Math.cos(a1) * r, WIN_Y1 + Math.sin(a1) * r]], 0, FAR_BRICK));
      }
      for (let y = -0.4; y < 8.6; y += 0.6) {
        wall.push(rect(bx, a - 0.04, y, y + 0.025, 0.002, FAR_MORTAR), rect(b + 0.04, bx + BAY, y, y + 0.025, 0.002, FAR_MORTAR));
        if (y < WIN_Y0 - 0.1) wall.push(rect(a - 0.04, b + 0.04, y, y + 0.025, 0.002, FAR_MORTAR));
      }
      // The window's iron: jambs, sill, two mullions, three transoms and the arch's rim.
      wall.push(rect(a - 0.06, a, WIN_Y0, WIN_Y1, 0.004, IRON_DK), rect(b, b + 0.06, WIN_Y0, WIN_Y1, 0.004, IRON_DK), rect(a - 0.06, b + 0.06, WIN_Y0 - 0.08, WIN_Y0, 0.004, IRON_DK));
      for (const mx of [a + WIN_W / 3, a + WIN_W * 2 / 3]) wall.push(rect(mx - 0.018, mx + 0.018, WIN_Y0, WIN_Y1 + Math.sqrt(Math.max(0, r * r - (mx - cx) ** 2)), 0.004, IRON_DK));
      for (const ty of [4.2, 5.0, 5.8]) {
        wall.push(rect(a, a + WIN_W / 3 - 0.018, ty - 0.015, ty + 0.015, 0.005, IRON_DK), rect(a + WIN_W / 3 + 0.018, a + WIN_W * 2 / 3 - 0.018, ty - 0.015, ty + 0.015, 0.005, IRON_DK), rect(a + WIN_W * 2 / 3 + 0.018, b, ty - 0.015, ty + 0.015, 0.005, IRON_DK));
      }
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * PI, a1 = (k + 1) / 8 * PI;
        wall.push(strip(cx + Math.cos(a0) * (r + 0.03), WIN_Y1 + Math.sin(a0) * (r + 0.03), cx + Math.cos(a1) * (r + 0.03), WIN_Y1 + Math.sin(a1) * (r + 0.03), 0.06, 0.006, IRON_DK));
      }
      // A Tesla coil before every other pier: a copper column, a toroid crown and arcs.
      if (Math.round((bx - wFrom) / BAY) % 2 === 0) {
        const tx = bx, k0 = 0.3;
        wall.push(fpoly([[tx - 0.35, -2], [tx + 0.35, -2], [tx + 0.25, 0.6], [tx - 0.25, 0.6]], k0, "#3a2a26"));
        wall.push(rect(tx - 0.11, tx + 0.11, 0.6, 3.2, k0, "#3e2a20"));
        for (let y = 0.7; y < 3.15; y += 0.1) wall.push(rect(tx - 0.11, tx + 0.11, y, y + 0.035, k0 + 0.002, "#6a4630"));
        wall.push(ngon(tx, 3.4, 0.42, 0.15, k0 + 0.004, "#3f454c", 0, 16), ngon(tx, 3.43, 0.3, 0.09, k0 + 0.006, "#59616a", 0, 14));
        wall.push(...zigzag([[tx + 0.4, 3.45], [tx + 0.62, 3.68], [tx + 0.55, 3.86], [tx + 0.78, 4.1]], 0.025, k0 + 0.01, ARC_BLUE, 0.8));
      }
    }
    // The storm through the windows: cloud banks over a dark sea of hills, a few bolts and distant pylons.
    const storm = [], sFrom = -16, sTo = run * STORM_RATE + 24, sRand = mulberry32(83);
    for (let x = sFrom; x < sTo; x += 0.5) storm.push(fpoly([[x, -2], [x + 0.5, -2], [x + 0.5, 3.6 + 0.3 * Math.sin((x + 0.5) * 0.7)], [x, 3.6 + 0.3 * Math.sin(x * 0.7)]], 0, "#1b2338"));
    for (let x = sFrom + 1; x < sTo; x += 3.5 + sRand() * 2) {
      const h = 4.6 + sRand() * 0.8;
      storm.push(strip(x - 0.25, 3.6, x, h, 0.04, 0.05, "#2a3450"), strip(x + 0.25, 3.6, x, h, 0.04, 0.05, "#2a3450"), strip(x - 0.35, h - 0.3, x + 0.35, h - 0.3, 0.03, 0.06, "#2a3450"));
    }
    for (const cy of [5.6, 6.6, 7.4]) for (let x = sFrom + sRand() * 2; x < sTo; x += 1.8 + sRand() * 2) {
      const s = 0.6 + sRand() * 0.7;
      for (let k = 0; k < 4; k++) { const ox = (k - 1.5) * s * 0.45, rr = s * (0.35 + sRand() * 0.2); storm.push(ngon(x + ox, cy + (k & 1) * s * 0.1, rr, rr * 0.5, 0.2 + k * 0.002, cy > 7 ? "#3a4566" : "#2f3956", 0.25, 10)); }
    }
    for (let x = sFrom + 2; x < sTo; x += 6 + sRand() * 5) {
      const pts = [[x, 7.6]];
      for (let k = 1; k <= 5; k++) pts.push([x + (sRand() - 0.5) * 0.5, 7.6 - k * 0.8]);
      storm.push(...zigzag(pts, 0.05, 0.3, "#e8f6ff", 1.3));
    }
    const sky = [];
    for (const [lo, hi, color] of [[-30, 4, "#1a2236"], [4, 6, "#222c46"], [6, 60, "#2b3757"]]) {
      const mid = (lo + hi) / 2;
      sky.push({ geometry: noShadow(rect(-120, 120, lo - mid, hi - mid, 0, color, 0.8)), y: mid, z: SKY_Z });
    }
    return Object.freeze({
      layers: Object.freeze([
        Object.freeze({ geometry: noShadow(merge(...storm)), rate: STORM_RATE, y: 0, z: STORM_Z }),
        Object.freeze({ geometry: noShadow(merge(...wall)), rate: WALL_RATE, y: 0, z: WALL_Z })
      ]),
      sky: Object.freeze(sky)
    });
  });

  // ---- the factory's own types ---------------------------------------------------------------------------------------
  // The machines fill their bullet boxes (the rule for anything drawn as a machine): a shot that reaches the box meets
  // the machine's iron, never air in front of it.
  //
  // ARC_PYLON: a copper coil wound on a white ceramic insulator stack, in a riveted iron frame: a bolted plinth cabinet
  // the box's width with a hazard band, two copper-capped posts at its sides and a yoke across the top behind the coil,
  // a ceramic arm from each post toward the coil, and the terminal ball and corona ring under the yoke. Charging, the
  // coil glows, the ball burns blue-white and arcs crackle off it. Shut (`cover` 1: before the screen opens it, and once
  // it has shut for good), a riveted iron hood with a hazard band is lowered over the coil and the ball; in between (the
  // frames of its opening, `PYLON_OPENINGS`, played back to shut it), the hood has sunk that much of the way down into
  // the plinth, its band and rivets with it. Emplacement box about origin 0.35: ±0.344, y 0.006 to 0.694.
  const PYLON_W = 0.335, PYLON_PLINTH = 0.26, PYLON_TOP = 0.69, PYLON_OPENINGS = 4;
  const arcPylon = (charging, cover = 0) => {
    const W = PYLON_W, PL = PYLON_PLINTH, round = [], flats = [BB(-W, W, 0.008, PL, -0.17, 0.17, IRON, 0.015)];
    flats.push(B(-W + 0.02, W - 0.02, PL - 0.075, PL - 0.03, 0.17, 0.176, SAFETY));
    for (let k = 0; k < 6; k++) { const a = -W + 0.03 + k * 0.11; flats.push(fpoly([[a, PL - 0.075], [a + 0.04, PL - 0.075], [a + 0.08, PL - 0.03], [a + 0.04, PL - 0.03]], 0.178, HAZARD)); }
    for (let k = 0; k < 5; k++) flats.push(B(-W + 0.06 + k * 0.137 - 0.012, -W + 0.06 + k * 0.137 + 0.012, 0.03, 0.054, 0.17, 0.178, RIVET));
    flats.push(B(-0.12, 0.12, 0.07, 0.15, 0.17, 0.174, IRON_DK));
    for (let k = 0; k < 3; k++) flats.push(B(-0.1, 0.1, 0.085 + k * 0.022, 0.095 + k * 0.022, 0.174, 0.178, "#1c1f23"));
    for (const s of [-1, 1]) {
      const a = s > 0 ? W - 0.05 : -W, b = a + 0.05;
      flats.push(B(a, b, PL, PYLON_TOP - 0.045, -0.05, 0.05, IRON_DK), B(a - 0.004 * s, b - 0.004 * s, PYLON_TOP - 0.045, PYLON_TOP, -0.06, 0.06, COPPER, charging ? 0.4 : 0.1));
      round.push(moved(turnedZ(turn([[0, 0], [0.03, 0], [0.045, 0.02], [0.03, 0.04], [0.045, 0.06], [0.03, 0.08], [0.02, 0.1], [0, 0.1]], 10, CERAMIC), s > 0 ? PI / 2 : -PI / 2), s * (W - 0.05), 0.5, 0));
    }
    flats.push(B(-W, W, PYLON_TOP - 0.05, PYLON_TOP, -0.15, -0.07, IRON_DK));
    round.push(moved(turn([[0, 0], [0.1, 0], [0.1, 0.03], [0.14, 0.05], [0.09, 0.08], [0.09, 0.1], [0.14, 0.12], [0.09, 0.15], [0.06, 0.17], [0, 0.17]], 14, CERAMIC), 0, PL, 0));
    round.push(turn([[0, PL + 0.17], [0.05, PL + 0.17], [0.05, 0.585], [0, 0.585]], 10, COPPER_DK));
    round.push(tube({ path: (t) => ({ x: Math.cos(t * PI * 2 * 5) * 0.1, y: PL + 0.19 + t * 0.15, z: Math.sin(t * PI * 2 * 5) * 0.1 }), radius: () => 0.02, rings: 60, segments: 5, colorFn: () => charging ? COPPER_LT : COPPER, emissive: charging ? 0.6 : 0 }));
    round.push(moved(torus(0.1, 0.02, charging ? COPPER_LT : COPPER, charging ? 0.5 : 0.1, 18, 6), 0, 0.59, 0));
    round.push(ball(0.05, 0, 0.625, 0, charging ? ARC : "#b8c4cc", charging ? 1.3 : 0.15, 12));
    if (cover > 0) {
      // The hood: a riveted iron box over the coil and the ball, between the posts and under the yoke, a hazard band round
      // it; `sink` of it gone down into the plinth, and the band and rivets with its top, each only while above the plinth.
      const foot = PL + 0.01, top = PYLON_TOP - 0.004, sink = (top - foot) * (1 - cover);
      if (top - sink - foot > 0.045) flats.push(BB(-0.21, 0.21, foot, top - sink, -0.16, 0.16, IRON_DK, 0.02));
      if (0.47 - sink >= foot) {
        flats.push(B(-0.2, 0.2, 0.47 - sink, 0.51 - sink, 0.16, 0.166, SAFETY));
        for (let k = 0; k < 4; k++) { const a = -0.19 + k * 0.1; flats.push(fpoly([[a, 0.47 - sink], [a + 0.04, 0.47 - sink], [a + 0.07, 0.51 - sink], [a + 0.03, 0.51 - sink]], 0.168, HAZARD)); }
      }
      if (0.6 - sink >= foot) for (let k = 0; k < 4; k++) flats.push(B(-0.15 + k * 0.1 - 0.01, -0.15 + k * 0.1 + 0.01, 0.6 - sink, 0.62 - sink, 0.16, 0.166, RIVET));
    }
    if (charging) {
      flats.push(ngon(0, 0.6, 0.2, 0.08, 0.13, ARC_BLUE, 0.7, 14));
      for (const pts of [[[0.05, 0.63], [0.12, 0.62], [0.18, 0.58], [0.27, 0.6]], [[-0.05, 0.63], [-0.13, 0.6], [-0.19, 0.62], [-0.27, 0.57]], [[0.05, 0.57], [0.14, 0.52], [0.2, 0.55], [0.27, 0.48]]]) flats.push(...zigzag(pts, 0.018, 0.14, ARC, 1.4));
    }
    return shaded(round, flats);
  };

  // CAPACITOR: a wide glass jar of lightning between brass uprights at the box's sides, joined to a brass cap and base
  // the box's width, a bolt inside, a clamp on its +x upright toward the tower. Shut, the Warden's cage bars cover it and
  // it is dark; open it glows, brighter as the charge runs out. Box about its middle (origin 0): ±0.344.
  const JAR = { shut: ["#2f4a5a", 0.04, "#4f7a8a", 0.1], build: ["#5fb8e0", 0.35, "#bfeaff", 0.7], bright: ["#8fd8ff", 0.6, "#e8f8ff", 1.0], full: ["#d8f4ff", 0.95, "#ffffff", 1.4] };
  const JAR_W = 0.335, JAR_R = 0.29;
  const capacitor = (level) => {
    const [glass, ge, bolt, be] = JAR[level], W = JAR_W, round = [], flats = [];
    round.push(turn([[0, -0.27], [JAR_R - 0.03, -0.27], [JAR_R, -0.24], [JAR_R, 0.2], [JAR_R - 0.03, 0.24], [0, 0.24]], 18, glass, ge));
    flats.push(BB(-W, W, -0.343, -0.27, -0.31, 0.31, "#b8892e", 0.012), BB(-W, W, 0.24, 0.33, -0.31, 0.31, "#c9a040", 0.012));
    for (const s of [-1, 1]) flats.push(B(s > 0 ? W - 0.035 : -W, s > 0 ? W : -W + 0.035, -0.27, 0.24, -0.04, 0.04, "#c9a040", 0.1));
    round.push(turn([[0, 0.33], [0.03, 0.33], [0.035, 0.337], [0, 0.343]], 8, COPPER, level === "full" ? 0.8 : 0.1));
    flats.push(...zigzag([[0.05, 0.19], [-0.08, 0.05], [0.07, -0.02], [-0.07, -0.18], [0.03, -0.25]], 0.035, JAR_R + 0.006, bolt, be));
    flats.push(B(W - 0.06, W, -0.08, 0.08, -0.12, 0.12, IRON_DK));
    if (level === "shut") {
      for (let k = -2; k <= 2; k++) flats.push(B(k * 0.11 - 0.016, k * 0.11 + 0.016, -0.27, 0.24, JAR_R + 0.005, JAR_R + 0.04, IRON));
      for (const y of [-0.15, 0.08]) flats.push(B(-W + 0.035, W - 0.035, y - 0.02, y + 0.02, JAR_R + 0.04, JAR_R + 0.07, IRON_DK));
    }
    if (level === "full") for (const pts of [[[0.04, 0.3], [0.1, 0.315], [0.16, 0.295], [0.23, 0.31]], [[-0.04, 0.3], [-0.1, 0.317], [-0.16, 0.298], [-0.23, 0.312]]]) flats.push(...zigzag(pts, 0.016, 0.32, ARC, 1.4));
    return shaded(round, flats);
  };

  // GRID_WARDEN: the arc tower's core, a ball of lightning in a riveted iron cage with ceramic studs at its corners.
  // Shut, two riveted shield plates close over it under the Legion's seal, sparking at the seam; open, the plates are
  // slid back into the cage's sides and the core crackles; overloaded, the plates glow white-hot and the core blazes.
  // Boss box about origin 1.0: ±0.531, y 0.469 to 1.531 over its feet.
  // The cage fills the boss box to WARDEN_HALF either way of the core's middle, CORE_Y over the feet (the type's origin).
  const CORE_Y = SPEC.GRID_WARDEN[1], WARDEN_HALF = 0.53;
  const warden = (mode) => {
    const round = [], flats = [], y0 = CORE_Y - WARDEN_HALF, y1 = CORE_Y + WARDEN_HALF, w = 0.07, frame = mode === "overload" ? "#ffb070" : IRON, fe = mode === "overload" ? 0.6 : 0;
    const H = WARDEN_HALF;
    flats.push(B(-H, H, y0, y0 + w, -0.22, 0.22, frame, fe), B(-H, H, y1 - w, y1, -0.22, 0.22, frame, fe), B(-H, -H + w, y0 + w, y1 - w, -0.22, 0.22, frame, fe), B(H - w, H, y0 + w, y1 - w, -0.22, 0.22, frame, fe));
    for (const [x, y] of [[-0.465, y0 + 0.035], [0.465, y0 + 0.035], [-0.465, y1 - 0.045], [0.465, y1 - 0.045]]) round.push(moved(turn([[0, 0], [0.045, 0], [0.05, 0.02], [0.035, 0.035], [0, 0.04]], 10, CERAMIC), x, y, 0.22));
    for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6; flats.push(B(-0.42 + t * 0.84 - 0.012, -0.42 + t * 0.84 + 0.012, y0 + 0.02, y0 + 0.05, 0.22, 0.228, RIVET), B(-0.42 + t * 0.84 - 0.012, -0.42 + t * 0.84 + 0.012, y1 - 0.05, y1 - 0.02, 0.22, 0.228, RIVET)); }
    const core = mode === "overload" ? "#ffffff" : mode === "shut" ? "#3a5a70" : "#9fdcff", ce = mode === "overload" ? 1.5 : mode === "shut" ? 0.2 : 1.0;
    round.push(ball(0.27, 0, CORE_Y, 0, core, ce, 16));
    if (mode === "shut") {
      for (const [a, b] of [[-0.43, -0.004], [0.004, 0.43]]) {
        flats.push(B(a, b, y0 + w, y1 - w, 0.24, 0.27, "#5a3a34"));
        for (let k = 0; k < 4; k++) flats.push(B(a + 0.03, b - 0.03, y0 + 0.14 + k * 0.22, y0 + 0.16 + k * 0.22, 0.27, 0.278, "#47302b"));
        for (const x of [a + 0.04, b - 0.04]) for (let y = y0 + 0.12; y < y1 - 0.1; y += 0.15) flats.push(ngon(x, y, 0.014, 0.014, 0.28, RIVET, 0, 6));
      }
      flats.push(...seal(0, CORE_Y, 0.15, 0.285, 0.2));
      flats.push(...zigzag([[0, y1 - 0.09], [0.03, y1 - 0.15], [-0.02, y1 - 0.2], [0.02, y1 - 0.26]], 0.016, 0.3, ARC, 1.3));
      flats.push(...zigzag([[0, y0 + 0.1], [-0.03, y0 + 0.16], [0.025, y0 + 0.2]], 0.016, 0.3, ARC, 1.3));
    } else {
      const plate = mode === "overload" ? "#fff0d8" : "#5a3a34", pe = mode === "overload" ? 1.1 : 0;
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x = s * (0.36 + k * 0.035); flats.push(B(x - 0.014, x + 0.014, y0 + w, y1 - w, 0.12 + k * 0.03, 0.15 + k * 0.03, plate, pe)); }
      if (mode === "overload") {
        flats.push(ngon(0, CORE_Y, 0.36, 0.36, -0.12, "#e8f8ff", 1.2, 18));
        for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2 + 0.2; flats.push(strip(Math.cos(a) * 0.29, CORE_Y + Math.sin(a) * 0.29, Math.cos(a) * 0.44, CORE_Y + Math.sin(a) * 0.44, 0.035, 0.3 + k * 0.001, "#ffffff", 1.5)); }
      } else {
        for (const [ex, ey] of [[-0.42, y1 - 0.08], [0.42, y0 + 0.08], [-0.4, y0 + 0.1], [0.4, y1 - 0.1]]) {
          const pts = [[ex * 0.6, CORE_Y + (ey - CORE_Y) * 0.6]];
          pts.push([ex * 0.78 + 0.03, CORE_Y + (ey - CORE_Y) * 0.72], [ex * 0.88 - 0.02, CORE_Y + (ey - CORE_Y) * 0.92], [ex, ey]);
          flats.push(...zigzag(pts, 0.018, 0.29, ARC, 1.3));
        }
      }
    }
    return shaded(round, flats);
  };

  // ---- stage-5 re-skins of the shared types ------------------------------------------------------------------------
  // A limb hanging from (x, y), `len` long, swung `a` about z (a positive angle swings its foot toward +x), and its foot.
  const limb = (x, y, z, len, w, d, a, color) => moved(turnedZ(B(-w / 2, w / 2, -len, 0, z - d / 2, z + d / 2, color), a), x, y, 0);
  const endOf = (x, y, len, a) => [x + Math.sin(a) * len, y - Math.cos(a) * len];
  // The welder's own rig: a stocky figure in a wide stance, heights over its feet, turned WELDER.yaw toward the camera.
  const WELDER = Object.freeze({ yaw: 0.42, hip: 0.43, shoulder: 0.68, neck: 0.71, stance: 0.17, leg: 0.37, upper: 0.17, fore: 0.15 });
  // CLERK: the Legion's welder-clerk in a grey work coat and a black rubber apron, a welding visor down over his face
  // under a hard cap, gauntlets and rubber boots, a spot-welder held level in both hands with its copper tip at the
  // clerk's shot height (y 0.5). Faces -x. Fodder box about origin 0.5: ±0.344, y -0.06 to 1.06.
  const skinClerk = () => {
    const R = WELDER, COAT = "#6b6f78", COAT_DK = "#4f535b", APRON = "#2a2622", APRON_LT = "#46403a", BOOT = "#1b1c1e", GLOVE = "#a8763e", VISOR = "#3b4046", LENS = "#1f5a3a";
    const p = [];
    // Legs apart, heavy boots.
    for (const [z, a] of [[0.06, -R.stance], [-0.06, R.stance]]) {
      p.push(limb(0, R.hip, z, R.leg, 0.1, 0.1, a, COAT_DK));
      const [fx] = endOf(0, R.hip, R.leg, a);
      p.push(BB(fx - 0.09, fx + 0.06, 0, 0.13, z - 0.055, z + 0.055, BOOT, 0.015));
    }
    // A stocky coat, the apron's bib and straps, a pocket.
    p.push(BB(-0.1, 0.1, R.hip - 0.04, R.shoulder + 0.02, -0.12, 0.12, COAT, 0.025));
    p.push(B(-0.122, -0.1, 0.17, R.shoulder - 0.06, -0.095, 0.095, APRON), B(-0.126, -0.122, R.shoulder - 0.1, R.shoulder - 0.075, -0.095, 0.095, APRON_LT));
    p.push(B(-0.126, -0.12, 0.3, 0.4, -0.055, 0.055, APRON_LT), B(-0.108, -0.096, R.shoulder - 0.06, R.shoulder + 0.02, 0.055, 0.075, APRON), B(-0.108, -0.096, R.shoulder - 0.06, R.shoulder + 0.02, -0.075, -0.055, APRON));
    // The head under the hard cap, the visor's shell down with its green lens, hinge knobs at the sides.
    const h = R.neck;
    p.push(B(-0.035, 0.035, h - 0.02, h + 0.02, -0.04, 0.04, SKIN), BB(-0.07, 0.075, h, h + 0.155, -0.075, 0.075, SKIN, 0.02));
    p.push(B(-0.01, 0.03, h + 0.045, h + 0.095, 0.075, 0.09, SKIN), B(-0.01, 0.03, h + 0.045, h + 0.095, -0.09, -0.075, SKIN), B(0.04, 0.085, h + 0.03, h + 0.14, -0.08, 0.08, HAIR));
    p.push(B(-0.095, -0.07, h + 0.015, h + 0.16, -0.083, 0.083, VISOR), B(-0.101, -0.095, h + 0.07, h + 0.118, -0.064, 0.064, LENS, 0.25), B(-0.102, -0.097, h + 0.104, h + 0.113, -0.045, 0.045, "#7fe0a8", 0.4));
    p.push(B(-0.025, 0.015, h + 0.095, h + 0.125, 0.083, 0.098, IRON_DK), B(-0.025, 0.015, h + 0.095, h + 0.125, -0.098, -0.083, IRON_DK));
    p.push(BB(-0.08, 0.085, h + 0.15, h + 0.205, -0.088, 0.088, SAFETY, 0.015), B(-0.115, -0.075, h + 0.15, h + 0.165, -0.075, 0.075, SAFETY_DK));
    // The spot-welder at the hip in a gauntleted hand, its glowing tip (the muzzle) on the clerk's shot start: a round iron
    // body, a grip under it, two copper jaws.
    const gun = [
      rod(-0.14, 0.505, 0, -0.27, 0.505, 0, 0.034, IRON, 0, 10), B(-0.19, -0.155, 0.41, 0.49, -0.022, 0.022, "#3a3e45"),
      B(-0.315, -0.265, 0.522, 0.536, -0.014, 0.014, COPPER), B(-0.315, -0.265, 0.474, 0.488, -0.014, 0.014, COPPER), B(-0.33, -0.312, 0.47, 0.54, -0.02, 0.02, ARC_BLUE, 1)
    ];
    p.push(...BL.raidModels.holdGun(p, { type: BL.raidStages.ENEMY.CLERK, yaw: R.yaw, gun, muzzle: [-0.33, 0.505, 0], grip: [-0.172, 0.45, 0],
      shoulder: R.shoulder, upper: R.upper, lower: R.fore, w: 0.072, sleeve: COAT, skin: GLOVE, round: true }));
    return BL.raidModels.standTall(facing(p, R.yaw));
  };
  // CARRIER: a sats packet, a brown-paper parcel glowing at its corded seams and stamped with a bolt, flown by two little
  // rotors, a tail lamp behind. Centred, facing +x (its flight). Fodder box about origin 0: ±0.344 by ±0.563.
  const skinCarrier = () => {
    const KRAFT = "#b5835a", CORD = "#ffb84a", p = [BB(-0.15, 0.15, -0.1, 0.1, -0.11, 0.11, KRAFT, 0.012)];
    p.push(B(-0.155, 0.155, -0.012, 0.012, 0.11, 0.118, CORD, 0.9), B(-0.012, 0.012, -0.105, 0.105, 0.11, 0.118, CORD, 0.9), B(-0.155, 0.155, 0.1, 0.108, -0.012, 0.012, CORD, 0.9));
    p.push(...zigzag([[0.1, 0.075], [0.05, 0.03], [0.09, 0.025], [0.045, -0.04]], 0.02, 0.122, GOLD_LT, 0.6));
    p.push(rect(-0.13, -0.06, 0.03, 0.08, 0.121, "#f2efe6"), rect(-0.12, -0.07, 0.045, 0.05, 0.123, "#8a5a32"), rect(-0.12, -0.08, 0.06, 0.065, 0.123, "#8a5a32"));
    for (const x of [-0.09, 0.09]) {
      p.push(rod(x, 0.1, 0, x, 0.165, 0, 0.012, IRON_DK), moved(lathe({ profile: [[0, -0.005], [0.085, -0.003], [0.085, 0.003], [0, 0.005]], segments: 12, color: "#aab2ba", emissive: 0.1 }), x, 0.17, 0));
    }
    p.push(ngon(-0.155, 0, 0.025, 0.025, 0.0, "#ff5a3c", 1, 8));
    p.push(B(-0.16, -0.152, -0.03, 0.03, -0.03, 0.03, "#ff5a3c", 1));
    return turnedY(turnedZ(merge(...p), -0.12), -0.35);
  };
  // SENSOR: a distribution cabinet, as wide and tall as its box, hung on a bracket frame that runs down under its feet
  // (inside the ground on a floor, under the walkway on a gantry). Open, its door is off and the fuses glow in rows
  // beside a knife switch; shut, the steel door carries the high-voltage sign, louvres and the Legion's padlock. Feet at
  // y 0; it fills its fodder box about origin 0.25: ±0.344, y -0.31 to 0.81.
  const FUSE_W = 0.33;
  const skinSensor = (open) => {
    const W = FUSE_W, BODY = "#5e6a64", p = [
      BB(-W, W, 0, 0.765, -0.14, 0.14, BODY, 0.02), BB(-W - 0.01, W + 0.01, 0.755, 0.811, -0.15, 0.17, "#4a5550", 0.012),
      B(-W, -W + 0.035, -0.31, 0, -0.06, 0.06, IRON_DK), B(W - 0.035, W, -0.31, 0, -0.06, 0.06, IRON_DK), B(-W, W, -0.31, -0.27, -0.06, 0.06, IRON_DK),
      bar(-W + 0.03, -0.27, W - 0.03, -0.02, 0.03, 0, IRON), bar(W - 0.03, -0.27, -W + 0.03, -0.02, 0.03, -0.035, IRON),
      B(0.2, 0.25, -0.3, 0.02, 0.07, 0.11, "#17191c")
    ];
    if (open) {
      p.push(B(-W + 0.04, W - 0.04, 0.05, 0.72, 0.14, 0.145, "#141a18"));
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const x = -0.24 + c * 0.085, y = 0.1 + r * 0.15;
        p.push(B(x - 0.026, x + 0.026, y, y + 0.09, 0.145, 0.162, r === 2 && c === 1 ? "#ff5a3c" : "#ffb02a", 0.9), B(x - 0.03, x + 0.03, y - 0.01, y + 0.006, 0.145, 0.164, CERAMIC), B(x - 0.03, x + 0.03, y + 0.084, y + 0.1, 0.145, 0.164, CERAMIC));
      }
      p.push(B(0.12, 0.24, 0.16, 0.66, 0.145, 0.155, CERAMIC_DK), B(0.17, 0.19, 0.38, 0.66, 0.155, 0.17, COPPER_LT, 0.3), B(0.15, 0.21, 0.64, 0.68, 0.17, 0.18, RED));
    } else {
      p.push(B(-W + 0.03, W - 0.03, 0.04, 0.73, 0.14, 0.16, "#6f7c75"));
      for (let k = 0; k < 5; k++) p.push(B(-0.24, 0.24, 0.08 + k * 0.035, 0.095 + k * 0.035, 0.16, 0.166, "#55605a"));
      p.push(...voltSign(-0.1, 0.55, 0.1, 0.164));
      p.push(B(-W - 0.004, -W + 0.02, 0.2, 0.28, 0.14, 0.16, STEEL_LT), B(-W - 0.004, -W + 0.02, 0.5, 0.58, 0.14, 0.16, STEEL_LT));
      p.push(...padlock(0.18, 0.42, 0.166, 1.2));
    }
    return merge(...p);
  };
  // BOND_MORTAR: the forge's crucible, a round-bottomed iron pot of molten sats hung on trunnions between two riveted
  // uprights at the box's sides, a crossbeam joining them over it, all on a brick hearth block the box's width with a
  // fire glowing in its grate; the pot is tipped toward -x so its glowing lip points up at the Ooga. Emplacement box
  // about origin 0.35: ±0.344, y 0.006 to 0.694. Shut (`shut`), an iron lid is clamped on the pot over the molten face,
  // the lip runs cold and the grate's fire is banked.
  // The pot tips toward -x by CRUCIBLE_TIP and toward the camera by CRUCIBLE_TOWARD, so its molten face shows.
  const CRUCIBLE_TIP = 0.45, CRUCIBLE_TOWARD = 0.75, CRUCIBLE_W = 0.335, HEARTH = 0.2, TRUNNION = 0.42, POT = 1.1;
  const skinCrucible = (shut = false) => {
    const W = CRUCIBLE_W, round = [], flats = [BB(-W, W, 0.008, HEARTH, -0.18, 0.18, BRICK, 0.012)];
    bricks(flats, -W + 0.01, W - 0.01, 0.012, HEARTH - 0.01, 0.181, 0.065, 0.13);
    flats.push(B(-0.18, 0.18, 0.04, 0.13, 0.181, 0.186, "#2a1610"), B(-0.15, 0.15, 0.055, 0.115, 0.186, 0.19, EMBER, shut ? 0.3 : 1));
    for (let k = 0; k < 5; k++) flats.push(B(-0.16 + k * 0.08 - 0.008, -0.16 + k * 0.08 + 0.008, 0.04, 0.13, 0.19, 0.196, IRON_DK));
    flats.push(B(-W, W, HEARTH - 0.025, HEARTH, -0.185, 0.185, IRON_DK));
    for (const s of [-1, 1]) {
      const a = s > 0 ? W - 0.045 : -W, b = a + 0.045;
      flats.push(B(a, b, HEARTH, 0.65, -0.05, 0.05, IRON));
      for (let y = HEARTH + 0.06; y < 0.63; y += 0.09) flats.push(B((a + b) / 2 - 0.009, (a + b) / 2 + 0.009, y - 0.009, y + 0.009, 0.05, 0.056, RIVET));
      flats.push(rod(s * (W - 0.045), TRUNNION, 0, s * 0.2, TRUNNION, 0, 0.022, IRON_LT, 0, 10));
    }
    flats.push(B(-W, W, 0.645, 0.692, -0.16, -0.06, IRON_DK), B(-0.015, 0.015, 0.56, 0.645, -0.12, -0.09, IRON_DK));
    const pot = [
      turn([[0, -0.16], [0.09, -0.155], [0.145, -0.11], [0.165, -0.02], [0.175, 0.1], [0.19, 0.12], [0.19, 0.14], [0.15, 0.14], [0.15, 0.1], [0, 0.1]], 16, "#3a3e45"),
      moved(torus(0.168, 0.012, IRON_DK, 0, 18, 6), 0, -0.02, 0), moved(torus(0.174, 0.012, IRON_DK, 0, 18, 6), 0, 0.06, 0),
      ...(shut ? [moved(turn([[0, 0], [0.185, 0], [0.185, 0.02], [0.06, 0.045], [0.025, 0.07], [0, 0.07]], 16, IRON_DK), 0, 0.125, 0)] : [
        moved(turn([[0, 0], [0.15, 0], [0.15, 0.004], [0, 0.004]], 16, "#ffb02a", 1.1), 0, 0.105, 0),
        moved(turn([[0, 0], [0.09, 0], [0.09, 0.003], [0, 0.003]], 12, "#fff0a8", 1.3), 0, 0.11, 0)
      ])
    ];
    const lip = [prism([[-0.2, 0.1], [-0.15, 0.1], [-0.15, 0.15], [-0.23, 0.155]], 0.1, "#3a3e45"), moved(prism([[-0.21, 0.12], [-0.155, 0.12], [-0.155, 0.135], [-0.225, 0.14]], 0.06, shut ? "#4a3a30" : "#ff8a2a", shut ? 0 : 1.1), 0, 0, 0.002)];
    const scale = (geo) => { const v = geo.verts; for (let i = 0; i < v.length; i++) v[i] *= POT; return geo; };
    const tip = (geo) => about(moved(turnedX(scale(geo), CRUCIBLE_TOWARD), 0, TRUNNION, 0), 0, TRUNNION, CRUCIBLE_TIP);
    round.push(tip(merge(...pot)));
    flats.push(tip(merge(...lip)));
    return shaded(round, flats);
  };
  // LOB attr 1 here: a molten coin, glowing gold with a hot rim, two drops trailing behind (-x). Flies along +x; inside
  // the shot tier's ±0.125.
  const moltenCoin = () => noShadow(merge(
    disc(0.075, 0.02, 0, 0, 0, "#ff7a1a", 0.9, 16), disc(0.06, 0.024, 0, 0, 0, "#ffc040", 1.1, 16), disc(0.025, 0.026, 0.012, 0.012, 0, "#fff0a8", 1.3, 10),
    ngon(-0.095, 0.01, 0.022, 0.018, 0, "#ff8a2a", 1, 8), ngon(-0.075, -0.035, 0.015, 0.013, 0, "#ff8a2a", 1, 8)
  ));

  // ---- the registry ------------------------------------------------------------------------------------------------
  const specOf = (name) => ({ tier: SPEC[name][0], origin: SPEC[name][1], box: boxOf(name) });
  const pair = (build) => { const look = cached(() => noShadow(build())); return { build: look, turned: cached(() => mirrored(look())) }; };
  const shadowless = (build) => cached(() => noShadow(build()));
  // A facing type's shut look and its mirror, as `pair` gives the open ones.
  const shutPair = (build) => { const look = cached(() => noShadow(build())); return { shut: look, turnedShut: cached(() => mirrored(look())) }; };
  // A re-skin's wind-up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): its open look with a flare at its muzzle (x,
  // y) in its type's tell colour, and the mirrored twin. The pylon's charge and the jars' brightening are their own; the
  // Warden fires from its tower top, outside its box, so the scene's ring tells it.
  const wound = (name, look, x, y, r) => {
    const wind = cached(() => BL.raidModels.windOf(look.build(), x, y, BL.raidModels.FAMILY_OF[name], undefined, r));
    return Object.assign(look, { wind, turnedWind: cached(() => mirrored(wind())) });
  };
  // The routine indices the picks compare with, read once at first use from the legion file's LOOK by the README's state
  // names; one not filled with an integer throws.
  let looks = null;
  const lookIndices = () => {
    if (looks) return looks;
    const table = BL.raidLegionFactory && BL.raidLegionFactory.LOOK;
    const at = (name, state) => {
      const r = table && table[name] && table[name][state];
      if (!Number.isInteger(r)) throw new Error(`raid-art-factory: BL.raidLegionFactory.LOOK.${name}.${state} is not filled`);
      return r;
    };
    return (looks = { pylonCharge: at("ARC_PYLON", "charge"), wardenCharge: at("GRID_WARDEN", "charge"), wardenOverload: at("GRID_WARDEN", "overload") });
  };
  // The capacitors brighten over the Warden's last seconds of charge: `bright` from BRIGHT_AT seconds left, `full` from
  // FULL_AT (art's own timings).
  const BRIGHT_AT = 1.2, FULL_AT = 0.5;
  // The pylon's frames between shut and open, frame k (k + 1) / (PYLON_OPENINGS + 1) open, each built once.
  const pylonFrames = [];
  const pylonOpening = (k) => pylonFrames[k] || (pylonFrames[k] = noShadow(arcPylon(false, 1 - (k + 1) / (PYLON_OPENINGS + 1))));
  put("types", "ARC_PYLON", Object.assign(specOf("ARC_PYLON"), {
    build: shadowless(() => arcPylon(false)), charge: shadowless(() => arcPylon(true)), shut: shadowless(() => arcPylon(false, 1)),
    OPENINGS: PYLON_OPENINGS, opening: (k) => pylonOpening(k),
    pick: (state, slot) => (state.eFlags[slot] & FLAG.SHUT) ? "shut" : state.eRoutine[slot] === lookIndices().pylonCharge ? "charge" : "build"
  }));
  put("types", "CAPACITOR", Object.assign(specOf("CAPACITOR"), {
    build: shadowless(() => capacitor("build")), shut: shadowless(() => capacitor("shut")), bright: shadowless(() => capacitor("bright")), full: shadowless(() => capacitor("full")),
    pick: (state, slot) => {
      if (state.eFlags[slot] & FLAG.SHUT) return "shut";
      const main = state.eLink[slot];
      if (main < 0 || state.eRoutine[main] !== lookIndices().wardenCharge) return "build";
      const left = state.eTimer[main];
      return left <= FULL_AT ? "full" : left <= BRIGHT_AT ? "bright" : "build";
    }
  }));
  put("types", "GRID_WARDEN", Object.assign(specOf("GRID_WARDEN"), {
    build: shadowless(() => warden("open")), shut: shadowless(() => warden("shut")), overload: shadowless(() => warden("overload")),
    pick: (state, slot) => state.eRoutine[slot] === lookIndices().wardenOverload ? "overload" : (state.eFlags[slot] & FLAG.SHUT) ? "shut" : "build"
  }));
  const sensorOpen = shadowless(() => skinSensor(true)), sensorShut = shadowless(() => skinSensor(false)), coin = cached(moltenCoin);
  const factory = {
    id: "factory", PLAY_BAND, DEPTH,
    // The scene's fog and clear colour on this stage: the storm night through the windows, so the far wall stays dark.
    fog: "#1b2338",
    sector, backdrop, belts, slide, boss,
    skins: Object.freeze({
      CLERK: Object.assign(specOf("CLERK"), wound("CLERK", pair(skinClerk), 0, SPEC.CLERK[1])),
      CARRIER: Object.assign(specOf("CARRIER"), pair(skinCarrier)),
      SENSOR: Object.assign(specOf("SENSOR"), { build: sensorOpen, shut: sensorShut, turned: cached(() => mirrored(sensorOpen())), turnedShut: cached(() => mirrored(sensorShut())) }),
      BOND_MORTAR: Object.assign(specOf("BOND_MORTAR"), wound("BOND_MORTAR", pair(() => skinCrucible(false)), 0, SPEC.BOND_MORTAR[1], 0.09), shutPair(() => skinCrucible(true))),
      LOB: Object.assign(specOf("LOB"), {
        build: (attr) => {
          if (attr === 1) return coin();
          if (!ART.lobs || !ART.lobs[attr]) throw new Error(`raid-art-factory: no LOB look for attr ${attr} in BL.raidArt.lobs`);
          return ART.lobs[attr]();
        }
      })
    })
  };
  put("stages", "factory", factory);
  // For the checks: the specs' tiers and origins, each box, and what the art read from a stage.
  ART.factory = { SPEC, boxOf, plan };
})();
