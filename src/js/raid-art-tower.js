// Ooga Raid's art for stage 3, The Hashrate Tower: an Ooga Mine rig tower the Fiat Legion has seized, climbed screen by
// screen. Geometry only: no nodes, no state, nothing per frame (the one exception is `boss.cableAt`, which writes a
// node's fields and allocates nothing). Every builder is cached once a page. It registers into the shared art registry,
// `BL.raidArt.stages.tower` and `BL.raidArt.types[NAME]`, which the bank's art fills too.
//
// `sector(stage, screen)` is one climb screen, 8 m wide and `stage.screenRows[screen]` rows tall, `screen` counted
// from the bottom (`screens(stage)` of them): the solid cells cut from the grid four voxels deep (the concrete foot of the tower and the left-wall rig
// racks, their fronts dressed with rigs, fans and LEDs), the ledges as steel catwalks with a safety-yellow walk edge
// (only in the back voxel, behind the play plane, like stage 1's), the lift shafts' guide rails, cables and pulleys,
// and the dressing: the tower's riveted green wall columns, the rig racks behind the play plane, the back lattice of
// cross braces, slung cables, the Legion's seal banners and padlocks, the cooling stacks and, up high in the gale,
// torn paper. Dressing never enters the play band (|z| < PLAY_BAND): the nearest of it, the wall columns, stands at
// -0.55. Only what can be stood on wears the yellow edge (ledges, crumbling planks, lifts, rack and foundation tops);
// nothing behind has a flat lit top, the lattice has no horizontal ties and every rack runs whole screens, so nothing
// reads as a false ledge. The crumbling planks and the lifts move or vanish, so they are left out of the sector and
// come from `planks(stage)` and `lifts(stage)`; the gale's flags from `gale(stage)`. Lifts, crumbling spans and gusts are
// read from the stage's own `lifts`, `crumble` and `gusts` (F10, F11, F9); a stage without one has none. The lock screen
// (`stage.lockScreen`) with a wall-to-wall grating is the deck, dressed with the rig wall the boss flies before.
//
// `backdrop(stage)` (cached by stage) is the climb's far view, laid over its scroll to the lock screen, shaped like `BL.raidModels.backdrop()`: `layers` slide at their rate (a layer's
// node y is `y + camY * (1 - rate)`, its x `camX * (1 - rate)`), so the sky darkens from afternoon at the foot to evening
// blue at the deck as the camera climbs, the valley's peaks sink away and a neighbouring rig tower passes slower;
// `sky` is a deep backing riding with the camera behind them all.
//
// Types (`BL.raidArt.types`): VENT, LOBBYIST, COIN_DRONE, BOND_MORTAR, TETHER and the boss, BALLOON, each with its
// `tier`, `origin` and `box` (the bullet box about its anchor). Each `build()` is cached geometry on the type's anchor:
// y 0 is the record's y (a walker's feet), and the silhouette stays inside `box`, except VENT's, which fills its
// standing touch box (`touch`) so the lethal stack reads. The mortar's shell, the lob whose attr is 1, is built here and
// registered as `BL.raidArt.lobs[1]`, which the scene reads by attr (raid-art-field.js draws 0 and 2). Facing types (LOBBYIST,
// BOND_MORTAR) face the player (toward -x) and give `turned()`, the look mirrored in x with its faces rewound (never a
// turn about y, so the camera still sees its face); BOND_MORTAR also gives `shut()` and `turnedShut()`, its muzzle capped, and `opening(k)` and `turnedOpening(k)`, its `OPENINGS` frames as the cap slides off. BALLOON gives `shut()` (tethered, under its cargo net) and
// `swell(k)` for k in 0..SWELLS-1, the open balloon as it swells with hits; `build()` is swell 0.
//
// Stage-3 re-skins of the shared types live with the stage, not in `types` (they are only this stage's look):
// `skins.RUNNER` and `skins.CLERK` in Legion hard hats, `skins.CARRIER` a flying rig fan, `skins.SENSOR` a rig's control
// box (with `shut()`, padlocked). Each keeps the anchor of its `raidModels` look.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, prism, forwardLathe, along, shaded, noShadow, beam } = BL.models;
  const { padNormals, flatInto, liana, sagPoints, SIGN_GLYPHS } = BL.hubModels;
  const { KIND, CELL, SCREEN_W, SCREEN_H, cellAt } = BL.raidStages;
  const { RULES, POSE } = BL.raidSim;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const ART = BL.raidArt = BL.raidArt || { stages: {}, types: {} };
  // The registry's one rule, kept by every art file: an entry is frozen, and a second registration of its key throws.
  const put = (table, key, entry) => {
    if (ART[table][key] !== undefined) throw new Error(`raid-art-tower: BL.raidArt.${table}.${key} is already registered`);
    return (ART[table][key] = Object.freeze(entry));
  };
  const PI = Math.PI;
  // SCREEN_X by VIEW_Y is the window the scene shows; a climb's own screens take their heights from `stage.screenRows`.
  const SCREEN_X = SCREEN_W * CELL, VIEW_Y = SCREEN_H * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge fills only the back one, its front at LEDGE_Z.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3;
  // The set pieces come from the stage, nested or flat: `lifts` [col, width, lowRow, highRow, speed, hold] (F10),
  // `crumble` [col0, col1, row] (F11), `gusts` [from, to, dir] (F9). A stage without the field has none of them.
  const records = (stage, key, stride) => {
    const src = stage[key], out = [];
    if (src === undefined) return out;
    if (src.length && typeof src[0] === "number") {
      if (src.length % stride) throw new Error(`raid-art-tower: ${stage.id}.${key} is not records of ${stride}`);
      for (let i = 0; i < src.length; i += stride) out.push(Array.from(src.subarray ? src.subarray(i, i + stride) : src.slice(i, i + stride)));
    } else for (const r of src) {
      if (r.length !== stride) throw new Error(`raid-art-tower: ${stage.id}.${key} has a record of ${r.length}, not ${stride}`);
      out.push(Array.from(r));
    }
    return out;
  };
  // A climb's screens, bottom first, each `stage.screenRows[screen]` rows tall from row `rowBase`.
  const screens = (stage) => stage.screenRows.length;
  const rowsOf = (stage, screen) => stage.screenRows[screen];
  const rowBase = (stage, screen) => {
    let row = 0;
    for (let k = 0; k < screen; k++) row += stage.screenRows[k];
    return row;
  };

  // ---- palette -----------------------------------------------------------------------------------------------------
  const GIRDER = "#4f8a45", GIRDER_LT = "#6aa85a", GIRDER_DK = "#3b6b37", GIRDER_FAR = "#2a4630", RIVET = "#8fc27a";
  const RIG = "#1b1e23", RIG_FACE = "#262a31", RIG_DK = "#121418", FAN = "#0c0d10", BLADE = "#3a4048", LED = "#ff8a1f", LED_LT = "#ffc06a";
  const STEEL = "#59616a", STEEL_DK = "#394047", STEEL_LT = "#7d868f", SLOT = "#1c2024", SAFETY = "#f2c230", HAZARD = "#24262a";
  const CONCRETE = "#9a968d", CONCRETE_DK = "#827e76", CAP = "#aaa69c";
  const RED = "#b8322a", RED_DK = "#8a2620", GREY = "#6b6f78", GOLD = "#d9a63a", GOLD_LT = "#f5c542", PAPER = "#f2efe6";
  const WIRE = "#9aa1a8", CABLE = "#17191c", CABLE_OR = "#e07a1f", STEAM = "#eef3f5";
  const SKIN = "#e2ab82", SKIN_DK = "#c98e66", HAIR = "#2f241c", SHIRT = "#f2efe6", SHOE = "#1d1d20", EYE = "#1d1d20", MOUTH = "#7a2a22";

  // ---- small builders ----------------------------------------------------------------------------------------------
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const F = () => ({ verts: [], faces: [], lines: [] });
  // A front-facing convex polygon (counter-clockwise seen from +z) at depth z: one face, nearly free on Canvas 2D.
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
  // A square beam `w` thick from a to b in the xy plane, at the middle of z0..z1.
  const bar = (ax, ay, bx, by, w, z0, z1, color, emissive = 0) => beam(ax, ay, (z0 + z1) / 2, bx, by, (z0 + z1) / 2, w, color, emissive);
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
  const scaled = (geo, sx, sy, sz) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] *= sx; v[i + 1] *= sy; v[i + 2] *= sz; }
    return geo;
  };
  // A pixel picture (rows of "#" and ".", top row first) as runs of flat quads `cell` square, its middle at (x, y).
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
  // A word in the island's carved 3x5 alphabet, centred at (x, y).
  const word = (text, cell, x, y, z, color, emissive = 0) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = SIGN_GLYPHS[text[i]];
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + (glyph ? glyph[r].replace(/1/g, "#").replace(/0/g, ".") : "...");
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
  // A smooth geometry with explicit normals for the hub kit's cables, finished with the flat parts folded in.
  const smoothGeo = () => ({ verts: [], faces: [], lines: [], smooth: true, normals: [] });
  const finish = (geo, flats) => {
    if (flats.length) flatInto(geo, merge(...flats));
    padNormals(geo);
    geo.normals = Float32Array.from(geo.normals);
    geo.castShadow = false;
    return geo;
  };
  const facing = (parts, yaw) => turnedY(merge(...parts), yaw);

  // The Fiat Legion's seal, flat: a gold ring on red and the Legion's barred F. Used on banners, padlocks, the drone,
  // the winches and the balloon.
  const SEAL_GLYPH = [".###.", ".#...", "####.", ".#...", ".#..."];
  const seal = (cx, cy, r, z, emissive = 0.15) => [
    ngon(cx, cy, r, r, z, GOLD, emissive, 16), ngon(cx, cy, r * 0.8, r * 0.8, z + 0.003, RED, 0, 16),
    ...pix(SEAL_GLYPH, r * 0.26, cx + r * 0.05, cy, z + 0.006, GOLD_LT, emissive + 0.15)
  ];
  // A Legion padlock, flat, its body's middle at (x, y): a steel shackle over a red body with the seal's dot.
  const padlock = (x, y, z, s = 1) => [
    rect(x - 0.045 * s, x - 0.028 * s, y + 0.02 * s, y + 0.085 * s, z, STEEL_LT), rect(x + 0.028 * s, x + 0.045 * s, y + 0.02 * s, y + 0.085 * s, z, STEEL_LT),
    rect(x - 0.045 * s, x + 0.045 * s, y + 0.085 * s, y + 0.102 * s, z, STEEL_LT),
    rect(x - 0.06 * s, x + 0.06 * s, y - 0.06 * s, y + 0.03 * s, z + 0.003, RED),
    ngon(x, y - 0.015 * s, 0.02 * s, 0.02 * s, z + 0.006, GOLD, 0.3, 8)
  ];

  // ---- the solid cells ---------------------------------------------------------------------------------------------
  // The concrete foot of the tower (solid columns down to row 0) and the rig racks (any other solid).
  const V = { CAP: 1, CONCRETE: 2, CONCRETE_DK: 3, RACK: 4, RACK_EDGE: 5 };
  const PALETTE = [null, CAP, CONCRETE, CONCRETE_DK, "#23272d", "#30353c"].map((c) => c && hexToRgb(c));
  const foundation = (stage, col, row) => {
    for (let r = 0; r <= row; r++) if (cellAt(stage, col, r) !== KIND.SOLID) return false;
    return true;
  };
  // The top of the deck's grating on the lock screen: its first row that is ledge wall to wall, or null when it has
  // none (then the lock screen is dressed as any other).
  const deckTopOf = (stage, screen) => {
    if (screen !== stage.lockScreen) return null;
    const r0 = rowBase(stage, screen);
    for (let row = r0; row < r0 + rowsOf(stage, screen); row++) {
      let full = true;
      for (let c = 0; c < SCREEN_W; c++) if (cellAt(stage, c, row) !== KIND.LEDGE) full = false;
      if (full) return (row + 1) * CELL;
    }
    return null;
  };
  const solidGeometry = (stage, screen) => {
    const n = rowsOf(stage, screen), grid = terrain.makeGrid(SCREEN_W, n, DEPTH), r0 = rowBase(stage, screen);
    let any = false;
    for (let c = 0; c < SCREEN_W; c++) for (let r = 0; r < n; r++) {
      const row = r0 + r;
      if (cellAt(stage, c, row) !== KIND.SOLID) continue;
      any = true;
      const open = cellAt(stage, c, row + 1) !== KIND.SOLID;
      const value = foundation(stage, c, row) ? (open ? V.CAP : (c * 7 + row * 3) % 5 === 0 ? V.CONCRETE_DK : V.CONCRETE) : open ? V.RACK_EDGE : V.RACK;
      for (let z = 0; z < DEPTH; z++) grid.set(c, r, z, value);
    }
    if (!any) return null;
    return terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: 0, y: r0 * CELL, z: Z0 } });
  };
  // The solids' fronts (z Z1, a little proud): the foot's hazard band, bolts and stencil; each rack block's rig units,
  // fans, LEDs, door and padlock, a yellow walk edge on every top that can be stood on, and knee braces to the wall.
  const solidFronts = (stage, screen, flats) => {
    const r0 = rowBase(stage, screen), n = rowsOf(stage, screen), zf = Z1 + 0.004;
    for (let c = 0; c < SCREEN_W; c++) for (let r = 0; r < n; r++) {
      const row = r0 + r;
      if (cellAt(stage, c, row) !== KIND.SOLID || cellAt(stage, c, row + 1) === KIND.SOLID) continue;
      const x0 = c * CELL, top = (row + 1) * CELL;
      flats.push(rect(x0, x0 + CELL, top - 0.05, top, zf, SAFETY));
      if (foundation(stage, c, row)) for (let k = 0; k < 3; k++) flats.push(fpoly([[x0 + k * 0.17, top - 0.05], [x0 + k * 0.17 + 0.06, top - 0.05], [x0 + k * 0.17 + 0.11, top], [x0 + k * 0.17 + 0.05, top]], zf + 0.003, HAZARD));
    }
    // The foot: a hazard band under the cap, anchor bolts and the tower's stencil.
    if (screen === 0) {
      let footTop = 0;
      for (let r = 0; r < n && foundation(stage, 0, r); r++) footTop = (r + 1) * CELL;
      if (footTop > 0) {
        for (let x = 0.3; x < SCREEN_X; x += 0.62) flats.push(ngon(x, footTop - 0.22, 0.035, 0.035, zf, STEEL_DK, 0, 6), ngon(x, footTop - 0.22, 0.018, 0.018, zf + 0.003, STEEL_LT, 0, 6));
        flats.push(...word("HASH TOWER", 0.05, SCREEN_X / 2, footTop * 0.42, zf, "#5f5b54"));
        flats.push(...word("SEIZED", 0.035, SCREEN_X / 2 + 1.9, footTop * 0.42, zf, RED, 0.1));
      }
    }
    // Each rack: a run of solid cells off the foot, its front stacked with rig units.
    const seen = new Set();
    for (let r = 0; r < n; r++) for (let c = 0; c < SCREEN_W; c++) {
      const row = r0 + r, key = row * SCREEN_W + c;
      if (seen.has(key) || cellAt(stage, c, row) !== KIND.SOLID || foundation(stage, c, row)) continue;
      let c1 = c, r1 = row;
      while (c1 + 1 < SCREEN_W && cellAt(stage, c1 + 1, row) === KIND.SOLID && !foundation(stage, c1 + 1, row)) c1++;
      while (cellAt(stage, c, r1 + 1) === KIND.SOLID && !foundation(stage, c, r1 + 1)) r1++;
      for (let rr = row; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) seen.add(rr * SCREEN_W + cc);
      const x0 = c * CELL, x1 = (c1 + 1) * CELL, y0 = row * CELL, y1 = (r1 + 1) * CELL - 0.05, units = Math.max(1, Math.round((y1 - y0) / 0.32)), uh = (y1 - y0) / units;
      flats.push(rect(x0 + 0.03, x1 - 0.03, y0 + 0.03, y1 - 0.02, zf, RIG_DK));
      for (let u = 0; u < units; u++) {
        const uy = y0 + u * uh;
        flats.push(rect(x0 + 0.06, x1 - 0.06, uy + 0.03, uy + uh - 0.02, zf + 0.003, RIG_FACE));
        for (let f = 0; f < 2; f++) {
          const fx = x0 + 0.24 + f * 0.34;
          if (fx > x1 - 0.32) break;
          flats.push(ngon(fx, uy + uh / 2, 0.11, 0.11, zf + 0.006, FAN, 0, 8, PI / 8));
          for (let b = 0; b < 3; b++) { const a = b * PI * 2 / 3 + u; flats.push(strip(fx, uy + uh / 2, fx + Math.cos(a) * 0.09, uy + uh / 2 + Math.sin(a) * 0.09, 0.035, zf + 0.009, BLADE)); }
          flats.push(ngon(fx, uy + uh / 2, 0.025, 0.025, zf + 0.012, STEEL_LT, 0, 6));
        }
        flats.push(rect(x1 - 0.2, x1 - 0.15, uy + uh - 0.09, uy + uh - 0.06, zf + 0.006, LED, 1), rect(x1 - 0.13, x1 - 0.08, uy + uh - 0.09, uy + uh - 0.06, zf + 0.006, u & 1 ? LED_LT : LED, 1));
      }
      // The rack door's hasp and the Legion's padlock on it.
      flats.push(...padlock(x1 - 0.14, y0 + (y1 - y0) * 0.45, zf + 0.012));
      // Knee braces from the rack's foot back to the wall column below it.
      if (c === 0) flats.push(bar(x1 - 0.1, y0, 0.12, y0 - 0.85, 0.06, -0.95, -0.7, GIRDER_DK), bar(x1 * 0.5, y0, 0.12, y0 - 0.45, 0.05, -0.95, -0.7, GIRDER_DK));
    }
  };

  // ---- the ledges --------------------------------------------------------------------------------------------------
  // A catwalk in the back voxel (z -1 to -0.5): a safety-yellow walk edge flush with the cell's top, a steel channel
  // with grating slots, a green truss under it, gussets where it meets a wall column and hangers rising from a free end.
  const crumbleKeys = (stage) => {
    const keys = new Set();
    for (const [c0, c1, row] of records(stage, "crumble", 3)) for (let c = c0; c <= c1; c++) keys.add(row * SCREEN_W + c);
    return keys;
  };
  const catwalk = (flats, x0, x1, top, leftWall, rightWall) => {
    const zf = LEDGE_Z;
    flats.push(B(x0, x1, top - 0.045, top, Z0, zf + 0.025, SAFETY));
    for (let x = x0 + 0.06; x < x1 - 0.05; x += 0.2) flats.push(fpoly([[x, top - 0.045], [x + 0.05, top - 0.045], [x + 0.09, top], [x + 0.04, top]], zf + 0.027, HAZARD));
    flats.push(B(x0, x1, top - 0.16, top - 0.045, Z0, zf, STEEL));
    for (let x = x0 + 0.04; x < x1 - 0.05; x += 0.1) flats.push(rect(x, x + 0.055, top - 0.14, top - 0.065, zf + 0.002, SLOT));
    flats.push(B(x0 + 0.03, x1 - 0.03, top - 0.38, top - 0.345, Z0 + 0.1, zf - 0.12, GIRDER_DK));
    const n = Math.max(1, Math.round((x1 - x0 - 0.06) / 0.25)), step = (x1 - x0 - 0.06) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + 0.03 + k * step, b = a + step;
      flats.push(k & 1 ? bar(a, top - 0.16, b, top - 0.36, 0.03, Z0 + 0.15, zf - 0.15, GIRDER) : bar(a, top - 0.36, b, top - 0.16, 0.03, Z0 + 0.15, zf - 0.15, GIRDER));
    }
    for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.25) flats.push(ngon(x, top - 0.1, 0.012, 0.012, zf + 0.003, STEEL_LT, 0, 6));
    if (leftWall) flats.push(moved(prism([[0, 0], [0.42, 0], [0, -0.55]], 0.3, GIRDER), x0 + 0.2, top - 0.16, -0.8));
    else flats.push(B(x0 - 0.02, x0 + 0.02, top - 0.38, top - 0.045, Z0, zf, STEEL_DK), bar(x0 + 0.08, top - 0.05, x0 - 0.12, top + 0.85, 0.025, -1.08, -1.04, STEEL_DK));
    if (rightWall) flats.push(moved(prism([[-0.42, 0], [0, 0], [0, -0.55]], 0.3, GIRDER), x1 - 0.2, top - 0.16, -0.8));
    else flats.push(B(x1 - 0.02, x1 + 0.02, top - 0.38, top - 0.045, Z0, zf, STEEL_DK), bar(x1 - 0.08, top - 0.05, x1 + 0.12, top + 0.85, 0.025, -1.08, -1.04, STEEL_DK));
  };
  const ledgeGeometry = (stage, screen) => {
    const flats = [], r0 = rowBase(stage, screen), skip = crumbleKeys(stage);
    for (let row = r0; row < r0 + rowsOf(stage, screen); row++) {
      for (let c = 0; c < SCREEN_W;) {
        if (cellAt(stage, c, row) !== KIND.LEDGE || skip.has(row * SCREEN_W + c)) { c++; continue; }
        let e = c;
        while (e < SCREEN_W && cellAt(stage, e, row) === KIND.LEDGE && !skip.has(row * SCREEN_W + e)) e++;
        catwalk(flats, c * CELL, e * CELL, (row + 1) * CELL, c === 0, e === SCREEN_W);
        c = e;
      }
    }
    return flats.length ? merge(...flats) : null;
  };

  // ---- the lifts ---------------------------------------------------------------------------------------------------
  // Each shaft: two guide rails and two cables from a sheave on the surface under the low stop up to the pulleys
  // PULLEY_UP over the high stop, all behind the ledges (z about -1.05), so the cage rides them wherever it stands.
  const PULLEY_UP = 3.0, RAIL_Z = -1.06;
  const shaftOf = (stage, [col, width, lowRow, highRow]) => {
    const x0 = col * CELL, x1 = (col + width) * CELL, lowTop = (lowRow + 1) * CELL, highTop = (highRow + 1) * CELL;
    let floor = lowTop - 1.0;
    for (let row = lowRow - 1; row >= Math.max(0, lowRow - 6); row--) {
      let hit = false;
      for (let c = col; c < col + width; c++) if (cellAt(stage, c, row) !== KIND.EMPTY) hit = true;
      if (hit) { floor = (row + 1) * CELL; break; }
    }
    return { x0, x1, lowTop, highTop, sheave: floor + 0.16, pulley: highTop + PULLEY_UP, cables: [x0 + 0.28, x1 - 0.28] };
  };
  const shaftGeometry = (stage, screen) => {
    const flats = [], y0 = rowBase(stage, screen) * CELL, y1 = y0 + rowsOf(stage, screen) * CELL;
    const vertical = (x, a, b, w, z0, z1, color) => {
      const lo = Math.max(a, y0), hi = Math.min(b, y1);
      if (hi > lo) flats.push(B(x - w / 2, x + w / 2, lo, hi, z0, z1, color));
    };
    for (const lift of records(stage, "lifts", 6)) {
      const s = shaftOf(stage, lift);
      if (s.pulley + 0.9 < y0 || s.sheave - 0.3 > y1) continue;
      vertical(s.x0 - 0.04, s.sheave - 0.16, s.pulley, 0.035, RAIL_Z - 0.03, RAIL_Z + 0.03, STEEL_DK);
      vertical(s.x1 + 0.04, s.sheave - 0.16, s.pulley, 0.035, RAIL_Z - 0.03, RAIL_Z + 0.03, STEEL_DK);
      for (const cx of s.cables) vertical(cx, s.sheave, s.pulley, 0.022, RAIL_Z - 0.01, RAIL_Z + 0.01, CABLE);
      if (s.sheave >= y0 && s.sheave < y1) for (const cx of s.cables) flats.push(disc(0.1, 0.04, cx, s.sheave, RAIL_Z - 0.04, STEEL, 0, 12), disc(0.03, 0.05, cx, s.sheave, RAIL_Z - 0.03, GOLD), B(cx - 0.12, cx + 0.12, s.sheave - 0.16, s.sheave - 0.08, RAIL_Z - 0.08, RAIL_Z, STEEL_DK));
      if (s.pulley >= y0 - 0.9 && s.pulley < y1) {
        for (const cx of s.cables) {
          flats.push(disc(0.15, 0.05, cx, s.pulley, RAIL_Z - 0.05, STEEL, 0, 14), disc(0.1, 0.06, cx, s.pulley, RAIL_Z - 0.045, STEEL_DK, 0, 12), disc(0.035, 0.07, cx, s.pulley, RAIL_Z - 0.04, GOLD, 0.1, 8));
          flats.push(bar(cx, s.pulley, cx - 0.35, s.pulley + 0.8, 0.045, -1.2, -1.14, GIRDER_DK), bar(cx, s.pulley, cx + 0.35, s.pulley + 0.8, 0.045, -1.2, -1.14, GIRDER_DK));
        }
        flats.push(...padlock((s.cables[0] + s.cables[1]) / 2, s.pulley - 0.05, RAIL_Z, 1.2));
      }
    }
    return flats.length ? merge(...flats) : null;
  };
  // A lift's cage, built at its own columns with y 0 its walk surface (the node goes at x 0, y the surface): a deck
  // with the yellow walk edge, a wire-mesh back no taller than a cell (so it tucks under the ledge over the high stop),
  // corner posts and the shackles that ride the shaft's cables. Everything in the back voxel, behind the play plane.
  const cage = (lift) => {
    const [col, width] = lift, x0 = col * CELL, x1 = (col + width) * CELL, parts = [];
    parts.push(B(x0, x1, -0.045, 0, Z0, LEDGE_Z + 0.025, SAFETY));
    for (let x = x0 + 0.06; x < x1 - 0.05; x += 0.2) parts.push(fpoly([[x, -0.045], [x + 0.05, -0.045], [x + 0.09, 0], [x + 0.04, 0]], LEDGE_Z + 0.027, HAZARD));
    parts.push(B(x0, x1, -0.15, -0.045, Z0, LEDGE_Z, STEEL), B(x0 + 0.05, x1 - 0.05, -0.2, -0.15, Z0 + 0.05, LEDGE_Z - 0.05, STEEL_DK));
    for (let x = x0 + 0.05; x < x1 - 0.05; x += 0.1) parts.push(rect(x, x + 0.05, -0.13, -0.065, LEDGE_Z + 0.002, SLOT));
    parts.push(bar(x0 + 0.05, -0.2, (x0 + x1) / 2, -0.42, 0.04, -0.9, -0.62, GIRDER_DK), bar(x1 - 0.05, -0.2, (x0 + x1) / 2, -0.42, 0.04, -0.9, -0.62, GIRDER_DK));
    parts.push(disc(0.06, 0.06, (x0 + x1) / 2, -0.44, -0.76, RED, 0.05, 10));
    // The mesh: wires every 0.1 m on the back, three rails across.
    for (let x = x0 + 0.04; x <= x1 - 0.03; x += 0.1) parts.push(B(x - 0.006, x + 0.006, 0, 0.42, -0.96, -0.95, WIRE));
    for (const y of [0.14, 0.28, 0.42]) parts.push(B(x0 + 0.03, x1 - 0.03, y - 0.008, y + 0.008, -0.965, -0.945, STEEL_LT));
    for (const x of [x0 + 0.03, x1 - 0.03]) parts.push(B(x - 0.025, x + 0.025, -0.02, 0.45, -0.98, -0.56, STEEL_DK));
    for (const cx of [x0 + 0.28, x1 - 0.28]) parts.push(B(cx - 0.035, cx + 0.035, 0.3, 0.46, RAIL_Z - 0.03, RAIL_Z + 0.06, STEEL_LT), B(cx - 0.012, cx + 0.012, 0.46, 0.52, RAIL_Z - 0.012, RAIL_Z + 0.012, GOLD));
    return merge(...parts);
  };

  // ---- the crumbling planks ----------------------------------------------------------------------------------------
  // Rotten boards lashed with wire across a span, in stage coordinates and the back voxel like a ledge: the whole look,
  // and `split`, the boards sagging apart along their cracks for the fuse's shake.
  const WOOD = ["#7a5c3a", "#6b5032", "#76634a", "#5e4a32"];
  const plank = (span, split) => {
    const [c0, c1, row] = span, x0 = c0 * CELL, x1 = (c1 + 1) * CELL, top = (row + 1) * CELL, parts = [];
    const rand = mulberry32(fnv1a(`plank:${c0}:${row}`)), cuts = [x0];
    for (let x = x0 + 0.45 + rand() * 0.25; x < x1 - 0.35; x += 0.45 + rand() * 0.3) cuts.push(x);
    cuts.push(x1);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k] + (split && k ? 0.02 : 0), b = cuts[k + 1] - (split && k + 2 < cuts.length ? 0.02 : 0), color = WOOD[(rand() * WOOD.length) | 0];
      const board = [B(a, b, top - 0.12, top - 0.004, Z0, LEDGE_Z, color)];
      // Grain, rot and nails on the front.
      for (let g = 0; g < 2; g++) { const gy = top - 0.04 - g * 0.04 - rand() * 0.01; board.push(rect(a + 0.03 + rand() * 0.05, b - 0.03 - rand() * 0.05, gy, gy + 0.008, LEDGE_Z + 0.002, "#4a3a28")); }
      if (rand() < 0.7) { const rx = a + 0.08 + rand() * Math.max(0.01, b - a - 0.2); board.push(ngon(rx, top - 0.07, 0.05 + rand() * 0.03, 0.025, LEDGE_Z + 0.003, "#3f3324", 0, 7)); }
      for (const nx of [a + 0.04, b - 0.04]) board.push(rect(nx - 0.01, nx + 0.01, top - 0.03, top - 0.012, LEDGE_Z + 0.004, "#8a8f96"));
      if (split) {
        board.push(fpoly([[a + (b - a) * 0.45, top - 0.004], [a + (b - a) * 0.5, top - 0.004], [a + (b - a) * 0.53, top - 0.12], [a + (b - a) * 0.47, top - 0.12]], LEDGE_Z + 0.006, "#1c140c"));
        parts.push(about(merge(...board), (a + b) / 2, top, (k & 1 ? 1 : -1) * (0.05 + rand() * 0.04)));
      } else parts.push(about(merge(...board), (a + b) / 2, top, (rand() - 0.5) * 0.025));
    }
    // Wire lashed round each join and the ends, and two sagging wires under the span.
    for (let k = 0; k < cuts.length; k++) {
      const x = Math.min(x1 - 0.02, Math.max(x0 + 0.02, cuts[k]));
      parts.push(B(x - 0.022, x - 0.008, top - 0.135, top - 0.01, Z0 - 0.01, LEDGE_Z + 0.012, WIRE), B(x + 0.008, x + 0.022, top - 0.135, top - 0.01, Z0 - 0.01, LEDGE_Z + 0.012, WIRE));
    }
    const mid = (x0 + x1) / 2, sag = split ? 0.32 : 0.22;
    parts.push(bar(x0 + 0.05, top - 0.12, mid, top - 0.12 - sag, 0.012, -0.8, -0.78, WIRE), bar(mid, top - 0.12 - sag, x1 - 0.05, top - 0.12, 0.012, -0.8, -0.78, WIRE));
    return merge(...parts);
  };

  // ---- the gale ----------------------------------------------------------------------------------------------------
  // Pennants on short staffs set in from the wall columns, behind the play band, on every screen of the gale band at
  // heights clear of the ledges by the walls. `limp` hangs; `taut` streams toward +x and `tautLeft` toward -x (the
  // warning snaps them taut toward the blow); `paper` is a flurry of torn sheets and a loose cable for a gust to carry.
  const FLAG_Z = -1.15;
  const flagPole = cached(() => merge(B(-0.016, 0.016, 0, 0.72, FLAG_Z - 0.016, FLAG_Z + 0.016, STEEL_DK), disc(0.03, 0.03, 0, 0.73, FLAG_Z, GOLD, 0.1, 8), B(-0.06, 0.06, -0.05, 0.02, FLAG_Z - 0.04, FLAG_Z + 0.02, STEEL)));
  const pennant = (dir) => merge(
    fpoly(dir > 0 ? [[0.016, 0.42], [0.44, 0.55], [0.016, 0.7]] : [[-0.016, 0.42], [-0.016, 0.7], [-0.44, 0.55]], FLAG_Z + 0.02, RED),
    fpoly(dir > 0 ? [[0.016, 0.52], [0.24, 0.56], [0.016, 0.6]] : [[-0.016, 0.52], [-0.016, 0.6], [-0.24, 0.56]], FLAG_Z + 0.024, GOLD)
  );
  const flagLimp = cached(() => merge(fpoly([[0.016, 0.7], [0.016, 0.3], [0.1, 0.36], [0.07, 0.68]], FLAG_Z + 0.02, RED), rect(0.03, 0.06, 0.4, 0.62, FLAG_Z + 0.024, GOLD)));
  const flagTaut = cached(() => pennant(1)), flagTautLeft = cached(() => pennant(-1));
  const paper = cached(() => {
    const parts = [];
    for (const [x, y, a, w] of [[0, 0, 0.4, 0.16], [0.24, 0.12, -0.3, 0.12], [-0.2, 0.2, 0.9, 0.1]]) {
      parts.push(about(merge(rect(x - w / 2, x + w / 2, y - w * 0.65, y + w * 0.65, -0.9, PAPER), fpoly([[x - w / 2, y + w * 0.65], [x - w * 0.1, y + w * 0.65], [x - w / 2, y + w * 0.3]], -0.898, "#d8d4c8"), rect(x - w * 0.35, x + w * 0.35, y + w * 0.2, y + w * 0.24, -0.897, "#9fb4d8"), rect(x - w * 0.35, x + w * 0.2, y - w * 0.05, y - w * 0.01, -0.897, "#9fb4d8")), x, y, a));
    }
    parts.push(strip(-0.4, -0.15, -0.1, -0.08, 0.025, -0.92, CABLE), strip(-0.1, -0.08, 0.2, -0.16, 0.025, -0.92, CABLE), strip(0.2, -0.16, 0.42, -0.1, 0.025, -0.92, CABLE));
    return noShadow(merge(...parts));
  });
  const galeSpots = (stage) => {
    const spots = [];
    for (const [from, to] of records(stage, "gusts", 3)) {
      for (let screen = 0; screen < screens(stage); screen++) {
        const r0 = rowBase(stage, screen), n = rowsOf(stage, screen);
        if (r0 + n <= from || r0 > to) continue;
        for (const [col, x] of [[0, 0.5], [SCREEN_W - 1, SCREEN_X - 0.5]]) {
          for (const local of [n >> 1, (n >> 1) - 3, (n >> 1) + 3, 2, n - 2]) {
            const row = r0 + local;
            if (row < from || row > to) continue;
            let clear = true;
            for (let r = row - 1; r <= row + 2; r++) for (let c = col - 1; c <= col + 1; c++) if (c >= 0 && c < SCREEN_W && cellAt(stage, c, r) !== KIND.EMPTY) clear = false;
            if (clear) { spots.push({ x, y: row * CELL, side: col ? 1 : -1 }); break; }
          }
        }
      }
    }
    return spots;
  };

  // ---- the dressing ------------------------------------------------------------------------------------------------
  // Depths, all behind the play band: wall columns (z -1.05 to -0.55), cables (-1.3), rig racks (front -1.45), the
  // cooling stacks (-2.3) and the back lattice (-2.7).
  const WALL_W = 0.22, RACK_Z = -1.45, RACK_BACK = -2.2, LATTICE_Z = -2.7, CABLE_Z = -1.3;
  const RACKS = [[0.42, 1.92], [6.08, 7.58]];
  const UNIT = 0.35;
  const BAY = 3.5, LATTICE_X = [0.11, 2.05, 4.0, 5.95, 7.89];
  // The cooling stacks are fitted to stage 3's rows: their tapered feet come to a point between the ledges at rows 44
  // and 48 (y 23.15 to 24) and their rain caps stand in the open over row 77, so neither end lies flat by a ledge.
  // `coolingFits` checks those cells are open on any stage they reach and throws if a retuned grid has moved a
  // ledge there.
  const COOLING = [3.05, 4.95], COOL_FROM = 24.0, COOL_TIP = 23.15, COOL_TO = 38.5;
  const coolingFits = (stage) => {
    if (stage.rows * CELL <= COOL_TIP) return;
    const open = (x0, x1, y0, y1) => {
      for (let c = Math.floor(x0 / CELL); c <= Math.floor(x1 / CELL); c++) for (let r = Math.floor(y0 / CELL); r <= Math.floor((y1 - 1e-6) / CELL); r++) if (cellAt(stage, c, r) !== KIND.EMPTY) return false;
      return true;
    };
    for (const cx of COOLING) {
      if (!open(cx, cx, COOL_TIP, COOL_FROM) || !open(cx - 0.5, cx + 0.5, COOL_TO, COOL_TO + 0.6)) throw new Error(`raid-art-tower: ${stage.id}'s grid has a ledge where a cooling stack ends (x ${cx}); refit COOL_TIP, COOL_FROM or COOL_TO`);
    }
  };
  const banner = (flats, cx, top, w, h, z, torn) => {
    flats.push(B(cx - w / 2 - 0.08, cx + w / 2 + 0.08, top - 0.03, top + 0.03, z - 0.03, z + 0.01, STEEL_DK));
    const notch = h * 0.18;
    flats.push(fpoly([[cx - w / 2, top - h], [cx, top - h + notch], [cx + w / 2, top - h], [cx + w / 2, top], [cx - w / 2, top]].filter((p, i) => !torn || i !== 2), z + 0.01, RED));
    if (torn) flats.push(fpoly([[cx + w / 2, top], [cx, top - h + notch], [cx + w / 2, top - h * 0.55]], z + 0.01, RED_DK));
    flats.push(rect(cx - w / 2 + 0.04, cx - w / 2 + 0.07, top - h + notch + 0.05, top - 0.04, z + 0.014, GREY), rect(cx + w / 2 - 0.07, cx + w / 2 - 0.04, top - h * (torn ? 0.5 : 1) + 0.05, top - 0.04, z + 0.014, GREY));
    flats.push(...seal(cx, top - h * 0.38, w * 0.3, z + 0.018));
  };
  const dressingGeometry = (stage, screen, rand) => {
    const h = rowsOf(stage, screen) * CELL, geo = smoothGeo(), flats = [], y0 = rowBase(stage, screen) * CELL, y1 = y0 + h;
    const deckTop = deckTopOf(stage, screen), deck = deckTop !== null;
    const gale = records(stage, "gusts", 3).some(([from, to]) => to * CELL >= y0 && from * CELL < y1);
    // The tower's wall columns: riveted green I-beams the wall-side ledges are bolted to.
    for (const [a, b] of [[0, WALL_W], [SCREEN_X - WALL_W, SCREEN_X]]) {
      flats.push(B(a, b, y0, y1, -1.05, -0.55, GIRDER));
      flats.push(rect(a + 0.02, a + 0.05, y0, y1, -0.548, GIRDER_LT), rect(b - 0.05, b - 0.02, y0, y1, -0.548, GIRDER_DK));
      for (let y = y0 + 0.125; y < y1; y += 0.25) flats.push(ngon((a + b) / 2, y, 0.014, 0.014, -0.546, RIVET, 0, 6));
    }
    // The back lattice: columns and cross braces bay by bay, no horizontal ties.
    for (const x of LATTICE_X) flats.push(B(x - 0.08, x + 0.08, y0, y1, LATTICE_Z - 0.08, LATTICE_Z + 0.08, GIRDER_FAR));
    for (let by = y0; by < y1 - 0.01; by += BAY) for (let k = 0; k + 1 < LATTICE_X.length; k++) {
      const a = LATTICE_X[k], b = LATTICE_X[k + 1];
      flats.push(bar(a, by, b, by + BAY, 0.07, LATTICE_Z - 0.05, LATTICE_Z, GIRDER_FAR), bar(b, by, a, by + BAY, 0.07, LATTICE_Z - 0.1, LATTICE_Z - 0.05, GIRDER_FAR));
      flats.push(ngon((a + b) / 2, by + BAY / 2, 0.06, 0.06, LATTICE_Z + 0.002, GIRDER_DK, 0, 6));
    }
    // The rig racks, whole screens tall; on the deck's screen they stop behind the deck's catwalk, where the rig wall
    // stands on it. Units on a fixed pitch so they run on from screen to screen.
    const rackTop = deck ? deckTop - 0.3 : y1;
    for (const [a, b] of RACKS) {
      flats.push(B(a, b, y0, rackTop, RACK_BACK, RACK_Z, RIG_DK));
      for (let u = Math.ceil(y0 / UNIT - 1e-6); u * UNIT < rackTop - 0.01; u++) {
        const uy = u * UNIT, top = Math.min(uy + UNIT, rackTop);
        flats.push(rect(a + 0.05, b - 0.05, uy + 0.03, top - 0.02, RACK_Z + 0.003, RIG_FACE));
        for (const fx of [a + 0.3, a + 0.68]) {
          flats.push(ngon(fx, uy + UNIT / 2, 0.12, 0.12, RACK_Z + 0.006, FAN, 0, 8, PI / 8));
          for (let k = 0; k < 3; k++) { const ang = k * PI * 2 / 3 + u * 0.7; flats.push(strip(fx, uy + UNIT / 2, fx + Math.cos(ang) * 0.1, uy + UNIT / 2 + Math.sin(ang) * 0.1, 0.04, RACK_Z + 0.009, BLADE)); }
          flats.push(ngon(fx, uy + UNIT / 2, 0.028, 0.028, RACK_Z + 0.012, STEEL, 0, 6));
        }
        const lit = (u * 5 + (a > 3 ? 2 : 0)) % 7;
        for (let k = 0; k < 3; k++) flats.push(rect(b - 0.36 + k * 0.08, b - 0.31 + k * 0.08, uy + UNIT - 0.1, uy + UNIT - 0.065, RACK_Z + 0.006, k === lit % 3 ? LED_LT : LED, k === lit % 3 || lit < 3 ? 1.1 : 0.5));
        flats.push(rect(b - 0.36, b - 0.08, uy + 0.07, uy + 0.12, RACK_Z + 0.006, "#30353c"));
      }
      // Legion padlocks on two rack doors.
      if (!deck) for (let k = 0; k < 2; k++) flats.push(...padlock(b - 0.2, y0 + 0.9 + rand() * (h - 1.8), RACK_Z + 0.015));
    }
    // The cooling stacks: two exhaust ducts in the middle of the tower, a bell at the foot and a rain cap up top,
    // steam rising over them.
    for (const cx of COOLING) {
      const lo = Math.max(COOL_FROM, y0), hi = Math.min(COOL_TO, y1);
      if (hi <= lo && !(COOL_TIP < y1 && COOL_FROM >= y0)) continue;
      if (hi > lo) {
        flats.push(B(cx - 0.42, cx + 0.42, lo, hi, -2.5, -2.32, "#5d666e"), rect(cx - 0.42, cx - 0.3, lo, hi, -2.318, "#737c85"), rect(cx + 0.3, cx + 0.42, lo, hi, -2.318, "#4a525a"));
        for (let y = Math.ceil(lo / 0.7 - 1e-6) * 0.7; y < hi; y += 0.7) flats.push(rect(cx - 0.42, cx + 0.42, y - 0.018, y + 0.018, -2.315, "#4a525a"));
      }
      if (COOL_FROM >= y0 && COOL_FROM < y1) flats.push(fpoly([[cx - 0.42, COOL_FROM], [cx, COOL_TIP], [cx + 0.42, COOL_FROM]], -2.41, "#4f575f"), fpoly([[cx - 0.42, COOL_FROM], [cx - 0.12, COOL_TIP + 0.2], [cx, COOL_TIP]], -2.405, "#737c85"));
      if (COOL_TO >= y0 && COOL_TO < y1) {
        flats.push(fpoly([[cx - 0.5, COOL_TO + 0.15], [cx + 0.5, COOL_TO + 0.15], [cx, COOL_TO + 0.6]], -2.31, STEEL_DK), B(cx - 0.05, cx + 0.05, COOL_TO, COOL_TO + 0.16, -2.42, -2.36, STEEL_DK));
        for (let k = 0; k < 3; k++) flats.push(ngon(cx - 0.12 - k * 0.14, COOL_TO + 0.8 + k * 0.32, 0.12 + k * 0.05, 0.09 + k * 0.035, -2.6 + k * 0.01, k ? "#dfe8ee" : STEAM, 0.3, 12));
      }
    }
    // The deck's rig wall: big rigs from below the deck to over the screen's top, and the Legion's great seal banner.
    if (deck) {
      flats.push(B(0.25, SCREEN_X - 0.25, deckTop - 0.35, y1 + 0.6, -2.4, -2.0, RIG_DK));
      for (let uy = deckTop - 0.3; uy < y1; uy += 0.55) for (let ux = 0.4; ux < SCREEN_X - 0.6; ux += 1.25) {
        flats.push(rect(ux, ux + 1.12, uy + 0.04, uy + 0.5, -1.996, RIG_FACE));
        for (let k = 0; k < 3; k++) {
          const fx = ux + 0.2 + k * 0.32;
          flats.push(ngon(fx, uy + 0.27, 0.13, 0.13, -1.993, FAN, 0, 8, PI / 8));
          for (let b = 0; b < 3; b++) { const ang = b * PI * 2 / 3 + k + uy; flats.push(strip(fx, uy + 0.27, fx + Math.cos(ang) * 0.11, uy + 0.27 + Math.sin(ang) * 0.11, 0.045, -1.99, BLADE)); }
        }
        flats.push(rect(ux + 0.9, ux + 1.06, uy + 0.4, uy + 0.45, -1.993, LED, 1));
      }
      // Narrow banners at the corners only: the balloon's flight (x 1 to 7, 67.5 m up) keeps the dark rigs behind it.
      banner(flats, 0.72, y1 + 0.2, 0.48, 1.1, -1.9, false);
      banner(flats, SCREEN_X - 0.72, y1 + 0.2, 0.48, 1.1, -1.9, false);
    } else {
      // Seal banners hung over the racks, one or two a screen; ragged in the gale.
      const n = 1 + (rand() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const side = (screen + k) & 1, [a, b] = RACKS[side], top = y0 + 2.2 + rand() * (h - 2.8);
        banner(flats, (a + b) / 2, top, 0.72, 1.15, RACK_Z + 0.02, gale);
      }
    }
    // Slung cable bundles across the tower and a run down each wall column.
    for (let k = 0; k < 2; k++) {
      const ya = y0 + 1.2 + rand() * (h - 2.4), yb = ya + (rand() - 0.5) * 1.2;
      liana(geo, sagPoints(RACKS[0][1], ya, CABLE_Z, RACKS[1][0], yb, CABLE_Z - 0.05, 0.35 + rand() * 0.3, 10), 0.025, 0.025, k ? CABLE : CABLE_OR);
    }
    for (const x of [WALL_W + 0.08, SCREEN_X - WALL_W - 0.08]) {
      const pts = [];
      for (let k = 0; k <= 7; k++) pts.push([x + Math.sin((y0 + k) * 1.7) * 0.03, y0 + k * h / 7, -1.12]);
      liana(geo, pts, 0.022, 0.022, CABLE);
      const pts2 = pts.map(([px, py, pz]) => [px + 0.045, py, pz - 0.02]);
      liana(geo, pts2, 0.016, 0.016, CABLE_OR);
    }
    // In the gale: torn paper pinned to the lattice and ribbons streaming off the braces.
    if (gale) for (let k = 0; k < 6; k++) {
      const x = 0.6 + rand() * (SCREEN_X - 1.2), y = y0 + 0.4 + rand() * (h - 0.8), w = 0.1 + rand() * 0.08, a = (rand() - 0.5) * 1.4, z = LATTICE_Z + 0.1 + rand() * 0.9;
      flats.push(about(merge(rect(x - w / 2, x + w / 2, y - w * 0.6, y + w * 0.6, z, PAPER), fpoly([[x + w / 2, y + w * 0.6], [x + w * 0.1, y + w * 0.6], [x + w / 2, y + w * 0.2]], z + 0.002, "#cfc9b8")), x, y, a));
      if (k & 1) flats.push(strip(x, y, x + 0.35 + rand() * 0.2, y - 0.08 + rand() * 0.16, 0.03, LATTICE_Z + 0.12, k & 2 ? RED : GREY));
    }
    solidFronts(stage, screen, flats);
    return finish(geo, flats);
  };

  // One climb screen's geometries, cached by stage and screen.
  const sectors = new Map();
  const fitted = new Set();
  const sector = (stage, screen) => {
    if (stage.kind !== "climb") throw new Error(`raid-art-tower: ${stage.id} is not a climb`);
    const key = stage.id + ":" + screen;
    let list = sectors.get(key);
    if (list) return list;
    if (!fitted.has(stage.id)) { coolingFits(stage); fitted.add(stage.id); }
    const rand = mulberry32(fnv1a("tower:" + key));
    list = [solidGeometry(stage, screen), ledgeGeometry(stage, screen), shaftGeometry(stage, screen), dressingGeometry(stage, screen, rand)].filter(Boolean);
    sectors.set(key, list);
    return list;
  };
  const byStage = (build) => {
    const cache = new Map();
    return (stage) => cache.get(stage.id) || cache.set(stage.id, build(stage)).get(stage.id);
  };
  const lifts = byStage((stage) => records(stage, "lifts", 6).map((lift) => {
    const s = shaftOf(stage, lift);
    return Object.freeze({ geometry: cage(lift), x0: s.x0, width: s.x1 - s.x0, lowY: s.lowTop, highY: s.highTop });
  }));
  const planks = byStage((stage) => records(stage, "crumble", 3).map((span) => Object.freeze({ geometry: plank(span, false), split: plank(span, true), col0: span[0], col1: span[1], row: span[2] })));
  const gale = byStage((stage) => Object.freeze({ spots: galeSpots(stage), pole: flagPole(), limp: flagLimp(), taut: flagTaut(), tautLeft: flagTautLeft(), paper: paper() }));

  // ---- the backdrop ------------------------------------------------------------------------------------------------
  // Flat painted cut-outs, front faces only. A layer's geometry is laid in its own metres over the climb's scroll times
  // its rate, with a screen's margin; x covers the 8 m window with room to spare.
  // Nearer than stage 1's (-34 and -28), so the scene's fog (12 to 70 m from the eye, toward its horizon tint) leaves
  // the evening blue its depth: about a quarter fogged at the sky, a fifth at the peaks.
  const SKY_Z = -24, PEAKS_Z = -20, NEAR_Z = -12, SKY_RATE = 0.1, PEAKS_RATE = 0.25, NEAR_RATE = 0.5;
  const mix = (a, b, t) => { const p = hexToRgb(a), q = hexToRgb(b); return "#" + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  const ramp = (stops, y) => {
    if (y <= stops[0][0]) return stops[0][1];
    for (let k = 1; k < stops.length; k++) if (y <= stops[k][0]) return mix(stops[k - 1][1], stops[k][1], (y - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0]));
    return stops[stops.length - 1][1];
  };
  const backdrop = byStage((stage) => {
    const XA = -4, XB = SCREEN_X + 4, CLIMB_TOP = rowBase(stage, stage.lockScreen) * CELL;
    // The sky: afternoon haze at the tower's foot, deepening to evening blue by the deck, the first stars over it.
    const skyTop = CLIMB_TOP * SKY_RATE + VIEW_Y + 3, sky = [];
    const SKY = [[0, "#f3d9a6"], [1.6, "#efdcb6"], [3.0, "#cfe1e4"], [4.6, "#a6cbe5"], [6.4, "#85b0de"], [8.2, "#6a92cf"], [10, "#5675ba"], [11.8, "#42599f"], [13.4, "#324785"], [16, "#263770"]];
    for (let y = -3; y < skyTop; y += 0.4) sky.push(rect(XA, XB, y, y + 0.42, 0, ramp(SKY, y + 0.2), 0.85));
    const sRand = mulberry32(37);
    for (let k = 0; k < 70; k++) {
      const y = 9.6 + sRand() * (skyTop - 9.6), x = XA + 2 + sRand() * (XB - XA - 4), r = 0.015 + sRand() * 0.025;
      sky.push(fpoly([[x - r, y], [x, y - r], [x + r, y], [x, y + r]], 0.01, y > 12 ? "#ffffff" : "#e8eefc", 0.6 + Math.min(0.4, (y - 9.6) * 0.1)));
    }
    // The far view: the mine valley's peaks with mist at their feet, distant rig towers with red tips, and banks of
    // cloud turning lavender as the evening comes on.
    const far = [], pRand = mulberry32(53);
    for (let x = XA - 2; x < XB; x += 2.2 + pRand() * 2.4) {
      const w = 3 + pRand() * 3.5, h = 2.6 + pRand() * 2.4, tip = x + w * (0.35 + pRand() * 0.3), z = -pRand() * 0.6;
      far.push(fpoly([[x, -3], [tip, -3], [tip, h], [tip - w * 0.1, h - 0.3]], z, "#8d8fae"), fpoly([[tip, -3], [x + w, -3], [tip + w * 0.12, h - 0.45], [tip, h]], z, "#71739a"));
      far.push(fpoly([[tip - w * 0.07, h - 0.45], [tip, h - 0.32], [tip, h], [tip - w * 0.1, h - 0.3]], z + 0.01, "#b8b8d0"));
    }
    for (let x = XA; x < XB; x += 1) far.push(fpoly([[x, -3], [x + 1, -3], [x + 1, 1.5 + 0.15 * Math.sin((x + 1) * 1.3)], [x, 1.5 + 0.15 * Math.sin(x * 1.3)]], 0.4, "#c9cfdc"));
    for (const [tx, h] of [[1.2, 6.5], [5.9, 8.2], [10.5, 5.4], [-2.4, 7.4]]) {
      const w = 0.5;
      far.push(strip(tx - w, 0.5, tx - 0.08, h, 0.06, 0.2, "#5d6386"), strip(tx + w, 0.5, tx + 0.08, h, 0.06, 0.2, "#5d6386"));
      for (let y = 1; y < h - 0.6; y += 0.8) { const k = (y - 0.5) / (h - 0.5), wa = w * (1 - k) + 0.08 * k, wb = w * (1 - k - 0.8 / (h - 0.5)) + 0.08 * (k + 0.8 / (h - 0.5)); far.push(strip(tx - wa, y, tx + wb, y + 0.8, 0.035, 0.21, "#5d6386"), strip(tx + wa, y, tx - wb, y + 0.8, 0.035, 0.21, "#5d6386")); }
      far.push(ngon(tx, h + 0.05, 0.06, 0.06, 0.22, "#ff4a3a", 1, 6));
    }
    const cRand = mulberry32(61);
    for (const cy of [6.8, 10.4, 14.2, 17.6, 21.4]) {
      const tint = ramp([[6, "#fbf3ea"], [12, "#e9dff0"], [20, "#c8c4e6"]], cy), shade = ramp([[6, "#e3d9d2"], [12, "#cfc4dc"], [20, "#a9a6cf"]], cy);
      for (let x = XA + cRand() * 2; x < XB; x += 2.2 + cRand() * 3) {
        const s = 0.6 + cRand() * 0.6;
        for (let k = 0; k < 4; k++) {
          const ox = (k - 1.5) * s * 0.45, r = s * (0.35 + cRand() * 0.2);
          far.push(ngon(x + ox, cy - 0.05 + (k & 1) * s * 0.12, r, r * 0.55, 0.5, shade, 0.7, 10), ngon(x + ox, cy + (k & 1) * s * 0.12, r * 0.92, r * 0.5, 0.52, tint, 0.75, 10));
        }
      }
    }
    // The near view: the valley's wooded hills at the foot, a neighbouring rig tower glowing with its own rigs, power
    // lines slung toward it and wisps of cloud.
    const near = [], nRand = mulberry32(71);
    for (let x = XA; x < XB; x += 0.5) {
      const h = (t) => 0.9 + 0.35 * Math.sin(t * 0.9 + 1) + 0.2 * Math.sin(t * 2.3);
      near.push(fpoly([[x, -3], [x + 0.5, -3], [x + 0.5, h(x + 0.5)], [x, h(x)]], 0, "#5f7d5a"));
    }
    for (let x = XA; x < XB; x += 0.4 + nRand() * 0.4) { const r = 0.25 + nRand() * 0.25; near.push(ngon(x, 0.9 + 0.35 * Math.sin(x * 0.9 + 1) + 0.2 * Math.sin(x * 2.3) - 0.05, r, r * 0.75, 0.02, nRand() < 0.5 ? "#4f6e4c" : "#5a7a55", 0, 9)); }
    const TX = 5.0, TW = 0.75, TOP = 27, TOWER = "#3d5048";
    near.push(rect(TX - TW - 0.07, TX - TW + 0.07, -3, TOP, 0.1, TOWER), rect(TX + TW - 0.07, TX + TW + 0.07, -3, TOP, 0.1, TOWER));
    for (let y = 0; y < TOP - 0.1; y += 1.5) {
      near.push(strip(TX - TW, y, TX + TW, y + 1.5, 0.05, 0.11, TOWER), strip(TX + TW, y, TX - TW, y + 1.5, 0.05, 0.12, TOWER));
    }
    near.push(fpoly([[TX - TW - 0.1, TOP], [TX + TW + 0.1, TOP], [TX, TOP + 1.4]], 0.1, TOWER), rect(TX - 0.03, TX + 0.03, TOP + 1.3, TOP + 2.4, 0.1, TOWER), ngon(TX, TOP + 2.45, 0.08, 0.08, 0.12, "#ff4a3a", 1, 6));
    for (const [y, sag] of [[4.5, 0.6], [11, 0.8], [17.5, 0.5], [23, 0.9]]) {
      let px = XA, py = y + 1.5;
      for (let k = 1; k <= 10; k++) { const t = k / 10, x = XA + (TX - TW - XA) * t, yy = y + 1.5 * (1 - t) - Math.sin(t * PI) * sag; near.push(strip(px, py, x, yy, 0.03, 0.14, "#2c3232")); px = x; py = yy; }
    }
    for (const cy of [9, 15.5, 21, 28, 33.5]) for (let x = XA + nRand() * 3; x < XB; x += 3.5 + nRand() * 3) near.push(ngon(x, cy, 0.9 + nRand() * 0.6, 0.12 + nRand() * 0.06, 0.2, ramp([[8, "#f6eee6"], [20, "#ddd4ea"], [34, "#bdb8de"]], cy), 0.7, 12));
    const backing = rect(-120, 120, -40, 40, 0, "#263770", 0.85);
    return {
      layers: [
        { geometry: noShadow(merge(...sky)), rate: SKY_RATE, y: 0, z: SKY_Z },
        { geometry: noShadow(merge(...far)), rate: PEAKS_RATE, y: 0, z: PEAKS_Z },
        { geometry: noShadow(merge(...near)), rate: NEAR_RATE, y: 0, z: NEAR_Z }
      ],
      sky: [{ geometry: noShadow(backing), y: VIEW_Y / 2, z: SKY_Z - 1 }]
    };
  });

  // ---- the Legion's new looks --------------------------------------------------------------------------------------
  const head = (x, y, z, s, hair) => [
    BB(x - 0.07 * s, x + 0.065 * s, y, y + 0.15 * s, z - 0.065 * s, z + 0.065 * s, SKIN, 0.018 * s),
    B(x - 0.058 * s, x + 0.075 * s, y + 0.13 * s, y + 0.175 * s, z - 0.07 * s, z + 0.07 * s, hair),
    B(x + 0.03 * s, x + 0.075 * s, y + 0.04 * s, y + 0.15 * s, z - 0.07 * s, z + 0.07 * s, hair),
    B(x - 0.077 * s, x - 0.068 * s, y + 0.08 * s, y + 0.1 * s, z + 0.016 * s, z + 0.04 * s, EYE), B(x - 0.077 * s, x - 0.068 * s, y + 0.08 * s, y + 0.1 * s, z - 0.04 * s, z - 0.016 * s, EYE),
    B(x - 0.078 * s, x - 0.068 * s, y + 0.108 * s, y + 0.12 * s, z + 0.012 * s, z + 0.046 * s, hair), B(x - 0.078 * s, x - 0.068 * s, y + 0.108 * s, y + 0.12 * s, z - 0.046 * s, z - 0.012 * s, hair),
    B(x - 0.094 * s, x - 0.069 * s, y + 0.055 * s, y + 0.083 * s, z - 0.011 * s, z + 0.011 * s, SKIN_DK),
    B(x - 0.074 * s, x - 0.068 * s, y + 0.026 * s, y + 0.038 * s, z - 0.024 * s, z + 0.024 * s, MOUTH)
  ];

  // VENT: a rig's exhaust stack through the floor, its mouth up, and lethal to stand on, so it shouts: a squat stack
  // banded in safety yellow and black, a glowing hot rim round its dark throat and a wisp of steam over it. It fills
  // the shot tier's standing touch box (±0.156 m, -0.47 to +0.50 about its feet), what an Ooga dies touching; its
  // bullet box (±0.125) only marks where it stands, since it cannot be destroyed.
  const vent = () => {
    const p = [
      rod(0, -0.12, 0, 0, 0, 0, 0.08, STEEL_DK, 0, 10),
      rod(0, -0.015, 0, 0, 0.015, 0, 0.15, STEEL_DK, 0, 14)
    ];
    for (let k = 0; k < 6; k++) p.push(rod(0, 0.015 + k * 0.0475, 0, 0, 0.015 + (k + 1) * 0.0475, 0, 0.095, k & 1 ? HAZARD : SAFETY, k & 1 ? 0 : 0.15, 12));
    p.push(rod(0, 0.3, 0, 0, 0.345, 0, 0.125, LED, 1, 14));
    p.push(moved(lathe({ profile: [[0.07, 0], [0.125, 0], [0.125, 0.004], [0.07, 0.004], [0.07, 0]], segments: 14, color: LED_LT, emissive: 1.2 }), 0, 0.345, 0));
    p.push(moved(lathe({ profile: [[0, 0], [0.072, 0], [0.072, 0.003], [0, 0.003]], segments: 12, color: "#121418" }), 0, 0.344, 0));
    p.push(ngon(0.015, 0.405, 0.08, 0.05, 0.13, STEAM, 0.5, 12), ngon(-0.035, 0.455, 0.06, 0.038, 0.135, STEAM, 0.5, 12), ngon(0.05, 0.47, 0.035, 0.025, 0.14, "#dfe8ee", 0.5, 10));
    return noShadow(merge(...p));
  };

  // LOBBYIST: a sniper lying on his briefcase in a pinstripe suit, propped on his elbows behind a brass-banded rifle with
  // a scope, his ankles crossed in the air. Faces -x. Fodder box about origin 0.15: x ±0.344, y -0.41 to +0.71.
  const lobbyist = () => {
    const SUIT = "#2b3550", SUIT_DK = "#1f2740", STRIPE = "#8f9bb8", TIE = "#c8342a", CASE = "#6b4226", CASE_DK = "#4e2f1a", BRASS = "#c9a040";
    const p = [
      BB(-0.2, 0.06, 0, 0.09, -0.085, 0.085, CASE, 0.015), B(-0.115, -0.025, 0.09, 0.11, -0.015, 0.015, CASE_DK),
      B(-0.17, -0.15, 0.055, 0.075, 0.085, 0.091, BRASS), B(0.01, 0.03, 0.055, 0.075, 0.085, 0.091, BRASS)
    ];
    // The torso on the case, the head end raised; pinstripes run along it.
    const torso = [BB(-0.13, 0.13, -0.06, 0.06, -0.1, 0.1, SUIT, 0.02), B(-0.145, -0.125, -0.045, 0.045, -0.05, 0.05, SHIRT)];
    for (let k = 0; k < 4; k++) torso.push(B(-0.12, 0.12, -0.045 + k * 0.03, -0.041 + k * 0.03, 0.1, 0.104, STRIPE));
    p.push(moved(turnedZ(merge(...torso), -0.28), -0.06, 0.16, 0));
    p.push(B(-0.2, -0.185, 0.07, 0.17, -0.014, 0.014, TIE));
    // Thighs lying back, shins up with the ankles crossed and the shoes in the air.
    for (const [z, a] of [[0.05, 0.55], [-0.05, 0.85]]) {
      p.push(B(0.06, 0.25, 0.04, 0.13, z - 0.045, z + 0.045, z > 0 ? SUIT : SUIT_DK), B(0.07, 0.24, 0.1, 0.104, z + 0.045, z + 0.049, STRIPE));
      p.push(bar(0.24, 0.085, 0.24 - Math.sin(a) * 0.19, 0.085 + Math.cos(a) * 0.19, 0.08, z - 0.04, z + 0.04, z > 0 ? SUIT : SUIT_DK));
      const fx = 0.24 - Math.sin(a) * 0.2, fy = 0.085 + Math.cos(a) * 0.2;
      p.push(B(fx - 0.05, fx + 0.03, fy - 0.02, fy + 0.04, z - 0.04, z + 0.04, SHOE));
    }
    // The head, propped up and sighting.
    p.push(...head(-0.255, 0.215, 0, 0.8, HAIR));
    // Elbows on the case, forearms up to the rifle.
    for (const z of [0.085, -0.085]) {
      p.push(bar(-0.14, 0.21, -0.2, 0.08, 0.06, z - 0.03, z + 0.03, SUIT));
      p.push(bar(-0.2, 0.09, -0.24, 0.2, 0.055, z * 0.6 - 0.028, z * 0.6 + 0.028, SUIT));
    }
    p.push(B(-0.27, -0.23, 0.18, 0.23, -0.035, 0.035, SKIN));
    // The rifle: walnut stock at the shoulder, a dark barrel with brass bands out past the head, a scope on top.
    p.push(B(-0.14, -0.04, 0.19, 0.235, 0.045, 0.085, "#7a5230"));
    p.push(rod(-0.16, 0.215, 0.065, -0.325, 0.215, 0.065, 0.014, "#30343a", 0, 8));
    for (const x of [-0.2, -0.27]) p.push(rod(x, 0.215, 0.065, x - 0.012, 0.215, 0.065, 0.019, BRASS, 0, 8));
    p.push(rod(-0.17, 0.26, 0.065, -0.25, 0.26, 0.065, 0.016, "#22252a", 0, 8), rod(-0.25, 0.26, 0.065, -0.258, 0.26, 0.065, 0.022, BRASS, 0, 8));
    p.push(B(-0.2, -0.19, 0.229, 0.252, 0.06, 0.07, "#22252a"));
    p.push(disc(0.012, 0.004, -0.26, 0.26, 0.088, "#ff5a3c", 0.9, 6));
    return facing(p, 0.4);
  };

  // COIN_DRONE: a minted coin flown by two rotors on a cross arm, stamped with the Legion's seal, a red eye under it.
  // Centred (origin 0), fodder box ±0.344 by ±0.563.
  const coinDrone = () => {
    const p = [
      disc(0.17, 0.06, 0, 0, 0, "#c7922e", 0.25, 18), disc(0.15, 0.064, 0, 0, 0, GOLD_LT, 0.35, 18),
      ...seal(0, 0, 0.11, 0.034, 0.3),
      rod(0, 0.16, 0, 0, 0.245, 0, 0.018, STEEL_DK), rod(-0.25, 0.245, 0, 0.25, 0.245, 0, 0.016, STEEL_DK),
      disc(0.035, 0.02, 0, 0.08, 0.035, GOLD_LT, 0.3, 8)
    ];
    for (const x of [-0.25, 0.25]) {
      p.push(rod(x, 0.235, 0, x, 0.275, 0, 0.022, STEEL));
      p.push(moved(lathe({ profile: [[0, -0.006], [0.085, -0.004], [0.085, 0.004], [0, 0.006]], segments: 14, color: "#aab2ba", emissive: 0.1 }), x, 0.282, 0));
    }
    p.push(rod(0, -0.165, 0, 0, -0.21, 0, 0.03, STEEL_DK), disc(0.022, 0.02, 0, -0.205, 0.022, "#ff3a2a", 1, 8));
    return merge(...p);
  };

  // BOND_MORTAR: a squat brass tube printed with coupon bands on a turntable, on a stencilled Legion crate, aimed up
  // toward -x. Emplacement box about origin 0.35: ±0.344 both ways, so y 0.006 to 0.694 over the feet. Shut (`cover` 1),
  // a steel cap with a red band is clamped over the muzzle; in between (the frames of its opening, `MORTAR_OPENINGS`,
  // played back to shut it), the cap has slid that much of CAP_SLIDE back down the barrel, off the muzzle.
  const MORTAR_OPENINGS = 4, CAP_SLIDE = 0.16;
  const bondMortar = (cover = 0) => {
    const WOODC = "#8a5e34", BRASS = "#c9a040", BRASS_LT = "#e0bb5a", COUPON = "#efe6c8";
    const p = [
      BB(-0.26, 0.26, 0.01, 0.26, -0.17, 0.17, WOODC, 0.02),
      B(-0.25, 0.25, 0.09, 0.1, 0.17, 0.175, "#5e3e20"), B(-0.25, 0.25, 0.17, 0.18, 0.17, 0.175, "#5e3e20"),
      ...seal(0.12, 0.135, 0.07, 0.185),
      rod(0, 0.26, 0, 0, 0.3, 0, 0.15, STEEL_DK, 0, 14),
      moved(prism([[-0.09, 0], [0.1, 0], [0.04, 0.16], [-0.04, 0.16]], 0.03, STEEL), 0, 0.3, 0.11),
      moved(prism([[-0.09, 0], [0.1, 0], [0.04, 0.16], [-0.04, 0.16]], 0.03, STEEL), 0, 0.3, -0.11)
    ];
    const px = 0.03, py = 0.38, dx = -Math.sin(0.88), dy = Math.cos(0.88), len = 0.36, r = 0.085;
    const at = (t) => [px + dx * t, py + dy * t];
    const seg = (t0, t1, rr, color, em = 0) => { const [ax, ay] = at(t0), [bx, by] = at(t1); return rod(ax, ay, 0, bx, by, 0, rr, color, em, 14); };
    p.push(seg(-0.1, 0, r * 0.9, BRASS), seg(0, len, r, BRASS), seg(0.08, 0.12, r + 0.004, COUPON), seg(0.17, 0.21, r + 0.004, COUPON), seg(len - 0.04, len, r + 0.012, BRASS_LT));
    const [mx, my] = at(len + 0.001);
    const slide = CAP_SLIDE * (1 - cover);
    if (cover > 0) p.push(seg(len - 0.06 - slide, len + 0.012 - slide, r + 0.016, STEEL_DK), seg(len - 0.04 - slide, len - 0.025 - slide, r + 0.02, "#c8342a"));
    if (slide > 0.012) p.push(moved(rod(0, 0, 0, dx * 0.004, dy * 0.004, 0, r * 0.75, "#16181b", 0, 12), mx, my, 0));
    for (const t of [0.1, 0.19]) { const [cx, cy] = at(t); for (let k = -1; k <= 1; k++) p.push(B(cx + k * 0.03 - 0.008, cx + k * 0.03 + 0.008, cy - 0.006, cy + 0.006, r + 0.004, r + 0.01, "#9a7a3a")); }
    p.push(rod(px, py, -0.13, px, py, 0.13, 0.03, STEEL_DK, 0, 10), rod(0.12, 0.3, 0, 0.06, 0.37, 0, 0.018, STEEL_LT));
    return facing(p, 0.3);
  };

  // LOB: the mortar's shell (attr 1), flying along +x: a brass body with a coupon band, a nose and tail fins, on the lobs'
  // ember outline (raid-models' FAMILY.LOB) over a dark rim behind it. Inside the shot tier's ±0.125 m box. The scene turns
  // it about z by its heading, as it turns shots.
  const lobShell = () => noShadow(merge(
    B(-0.124, 0.124, -0.062, 0.062, -0.08, -0.077, "#1a1208"), B(-0.112, 0.112, -0.05, 0.05, -0.077, -0.074, BL.raidModels.FAMILY.LOB, 1),
    rod(-0.08, 0, 0, 0.04, 0, 0, 0.042, "#c9a040", 0.2, 10),
    rod(0.04, 0, 0, 0.11, 0, 0, 0.042, "#c9a040", 0.2, 10), rod(0.11, 0, 0, 0.112, 0, 0, 0.01, "#7a5a20", 0, 6),
    along(lathe({ profile: [[0, 0], [0.042, 0], [0.025, 0.045], [0, 0.07]], segments: 10, color: "#e0bb5a", emissive: 0.25 }), 0.04, 0, 0, 1, 0, 0),
    rod(-0.035, 0, 0, -0.005, 0, 0, 0.045, "#efe6c8", 0.2, 10),
    B(-0.12, -0.075, -0.07, 0.07, -0.005, 0.005, STEEL_DK), B(-0.12, -0.075, -0.005, 0.005, -0.07, 0.07, STEEL_DK)
  ));

  // TETHER: the deck winch that holds a line of the balloon: a bolted base plate, red cheeks bearing the seal, a drum
  // wound with cable, a crank, and the fairlead the line leaves upward from at FAIRLEAD over its feet. Emplacement box
  // about origin 0.35: y 0.006 to 0.694.
  const FAIRLEAD = 0.62;
  const tether = () => {
    const p = [BB(-0.3, 0.3, 0.008, 0.06, -0.2, 0.2, STEEL_DK, 0.012)];
    for (const x of [-0.25, 0.25]) for (const z of [-0.15, 0.15]) p.push(rod(x, 0.06, z, x, 0.08, z, 0.022, STEEL_LT, 0, 6));
    // Two red A-frames carry the drum's axle and meet under the fairlead; the seal's badge hangs at the front apex.
    for (const z of [0.13, -0.13]) for (const x of [-0.25, 0.25]) p.push(bar(x, 0.06, 0, 0.5, 0.05, z - 0.018, z + 0.018, RED));
    p.push(...seal(0, 0.44, 0.055, 0.152));
    p.push(rod(0, 0.3, -0.11, 0, 0.3, 0.11, 0.13, STEEL, 0, 14));
    for (let k = 0; k < 5; k++) p.push(rod(0, 0.3, -0.1 + k * 0.045, 0, 0.3, -0.07 + k * 0.045, 0.145, k & 1 ? "#2a2d33" : "#3a3e45", 0, 14));
    p.push(rod(0.13, 0.3, 0.15, 0.13, 0.3, 0.17, 0.02, STEEL_LT), bar(0.0, 0.3, 0.17, 0.22, 0.03, 0.15, 0.18, STEEL_LT), rod(0.17, 0.22, 0.18, 0.17, 0.22, 0.24, 0.02, "#7a5230"));
    p.push(rod(0, 0.3, 0.15, 0, 0.3, 0.17, 0.04, GOLD, 0.1, 10));
    p.push(B(-0.09, 0.09, 0.5, 0.58, -0.06, 0.06, STEEL_DK));
    for (const x of [-0.035, 0.035]) p.push(rod(x, 0.555, -0.055, x, 0.555, 0.055, 0.022, STEEL_LT, 0, 8));
    p.push(B(-0.012, 0.012, 0.43, FAIRLEAD, -0.012, 0.012, CABLE));
    return merge(...p);
  };

  // BALLOON: the Inflation Balloon. A fat green blimp printed with fiat notes and the Legion's grinning seal, gored with
  // seams, slung over a wicker gondola; three rings under the gondola take the tethers' lines (RINGS). It swells with
  // hits (SWELLS sizes, its seams thinning and stitched patches showing); shut, it is held under a cargo net. Every size
  // stays inside the boss tier's box, ±0.531 m about its middle (origin 0).
  const SWELLS = 4, RINGS = Object.freeze([Object.freeze([-0.15, -0.49]), Object.freeze([0, -0.5]), Object.freeze([0.15, -0.49])]);
  const ENV_Y = 0.13;
  const balloon = (k, shut) => {
    const t = k / (SWELLS - 1), L = 0.4 + 0.12 * t, R = 0.26 + 0.1 * t, KZ = 0.8;
    const ENV = mix("#4f9a4a", "#78c06a", t * 0.6), ENV_DK = mix("#2f6a34", "#3f8a44", t * 0.5), NOTE = "#cfe8b8", NOTE_DK = "#5f9e5a";
    // The envelope: an egg of revolution round x, a little flattened toward the camera.
    const N = 9, prof = [];
    for (let s = 0; s <= N; s++) { const a = s / N * PI; prof.push([Math.sin(a) * R, -Math.cos(a) * L]); }
    const env = moved(scaled(turnedZ(lathe({ profile: prof, segments: 18, color: ENV }), -PI / 2), 1, 1, KZ), 0, ENV_Y, 0);
    // A point on its front surface over (x, y) and the frame its decals lie in.
    const surf = (x, y) => {
      const rr = R * Math.sqrt(Math.max(0, 1 - (x / L) ** 2)), dy = y - ENV_Y, zz = KZ * Math.sqrt(Math.max(0, rr * rr - dy * dy));
      let nx = x / (L * L), ny = dy / (R * R), nz = zz / (KZ * KZ * R * R);
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      let ux = nz, uz = -nx; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
      return { p: [x, y, zz], n: [nx, ny, nz], u: [ux, 0, uz], v: [vx, vy, vz] };
    };
    // A flat convex decal on the surface at (x, y), points in its own metres, lifted `lift` off it.
    const decal = (x, y, pts, color, lift, emissive = 0) => {
      const f = surf(x, y), g = F(), ids = [];
      for (let i = 0; i < pts.length; i++) {
        const [a, b] = pts[i];
        g.verts.push(f.p[0] + f.u[0] * a + f.v[0] * b + f.n[0] * lift, f.p[1] + f.u[1] * a + f.v[1] * b + f.n[1] * lift, f.p[2] + f.u[2] * a + f.v[2] * b + f.n[2] * lift);
        ids.push(i);
      }
      g.faces.push({ i: ids, color: hexToRgb(color), emissive });
      return g;
    };
    const quad = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const round = (r, n = 12) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * PI * 2) * r, Math.sin(i / n * PI * 2) * r]);
    const flats = [];
    // Gore seams along the length, thinner as it swells.
    const sw = 0.006 - 0.003 * t, SEAM = mix(ENV, "#e8f6d8", 0.35);
    for (const lat of [-0.62, -0.25, 0.25, 0.62]) {
      for (let s = 0; s < 10; s++) {
        const xa = -L * 0.92 + s * L * 0.184, xb = xa + L * 0.184, ya = ENV_Y + lat * R * Math.sqrt(1 - (xa / L) ** 2), yb = ENV_Y + lat * R * Math.sqrt(1 - (xb / L) ** 2);
        const l = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa), c = Math.cos(ang), si = Math.sin(ang);
        flats.push(decal((xa + xb) / 2, (ya + yb) / 2, [[-l / 2 * c + sw * si, -l / 2 * si - sw * c], [l / 2 * c + sw * si, l / 2 * si - sw * c], [l / 2 * c - sw * si, l / 2 * si + sw * c], [-l / 2 * c - sw * si, -l / 2 * si + sw * c]], SEAM, 0.003));
      }
    }
    // Fiat notes printed round the seal, stretching as it swells.
    for (const [nx, ny, a] of [[-0.6, 0.4, 0.2], [0.6, 0.36, -0.25], [-0.58, -0.3, -0.15], [0.56, -0.34, 0.2], [-0.3, 0.68, 0.05], [0.3, 0.66, -0.05], [-0.28, -0.66, -0.08], [0.3, -0.64, 0.1], [-0.84, 0.05, 0.4], [0.84, 0.02, -0.4]]) {
      const x = nx * L, y = ENV_Y + ny * R, w = 0.14 * (1 + 0.25 * t), h = 0.075 * (1 + 0.25 * t), c = Math.cos(a), s = Math.sin(a);
      const rot = (pts) => pts.map(([p, q]) => [p * c - q * s, p * s + q * c]);
      flats.push(decal(x, y, rot(quad(w, h)), NOTE_DK, 0.005), decal(x, y, rot(quad(w * 0.86, h * 0.72)), NOTE, 0.008), decal(x, y, rot(round(h * 0.24, 8)), NOTE_DK, 0.011));
    }
    // Stitched patches once it has swollen.
    if (k >= 2) for (const [nx, ny] of k === 2 ? [[0.42, -0.1]] : [[0.42, -0.1], [-0.4, 0.08]]) {
      const x = nx * L, y = ENV_Y + ny * R;
      flats.push(decal(x, y, quad(0.07, 0.06), "#a7d48e", 0.006));
      for (let s = -1; s <= 1; s++) flats.push(decal(x, y, [[-0.05, s * 0.022 - 0.003], [0.05, s * 0.022 - 0.003], [0.05, s * 0.022 + 0.003], [-0.05, s * 0.022 + 0.003]], ENV_DK, 0.009));
    }
    // The grinning seal on the front: a gold ring, a red face, two narrow eyes and a wide grin of teeth.
    const sr = 0.13 + 0.03 * t;
    flats.push(decal(0, ENV_Y, round(sr, 16), GOLD, 0.006, 0.25), decal(0, ENV_Y, round(sr * 0.82, 16), RED, 0.009));
    for (const ex of [-0.045, 0.045]) {
      if (shut) flats.push(decal(ex * (sr / 0.13), ENV_Y + 0.03, quad(0.04, 0.008), "#1a1012", 0.012));
      else flats.push(decal(ex * (sr / 0.13), ENV_Y + 0.03, [[-0.022, -0.01], [0.022, -0.01], [0.018, 0.012], [-0.018, 0.012]], "#fff4d0", 0.012, 0.4), decal(ex * (sr / 0.13), ENV_Y + 0.028, quad(0.012, 0.012), "#1a1012", 0.015));
      flats.push(decal(ex * (sr / 0.13), ENV_Y + 0.055, [[-0.026, ex > 0 ? 0.012 : -0.004], [0.026, ex > 0 ? -0.004 : 0.012], [0.026, ex > 0 ? 0.004 : 0.02], [-0.026, ex > 0 ? 0.02 : 0.004]], GOLD_LT, 0.014));
    }
    const grin = [];
    for (let s = 0; s <= 8; s++) { const a = PI * (1.12 + s / 8 * 0.76); grin.push([Math.cos(a) * sr * 0.6, Math.sin(a) * sr * 0.6 + 0.02]); }
    for (let s = 8; s >= 0; s--) { const a = PI * (1.12 + s / 8 * 0.76); grin.push([Math.cos(a) * sr * 0.42, Math.sin(a) * sr * 0.3 - 0.005]); }
    for (let s = 0; s < 8; s++) flats.push(decal(0, ENV_Y, [grin[s], grin[s + 1], grin[16 - s], grin[17 - s]], "#2a0e0c", 0.012));
    for (let s = 0; s < 6; s++) { const a = PI * (1.2 + (s + 0.5) / 6 * 0.6), cx = Math.cos(a) * sr * 0.52, cy = Math.sin(a) * sr * 0.46 + 0.012; flats.push(decal(cx, ENV_Y + cy, quad(0.016, 0.02), "#fff4d0", 0.015, 0.3)); }
    // Shut: the cargo net over the front and a cinch strap round the belly.
    if (shut) {
      for (const lat of [-0.75, -0.4, 0, 0.4, 0.75]) for (let s = 0; s < 8; s++) {
        const xa = -L * 0.85 + s * L * 0.2125, xb = xa + L * 0.2125, ya = ENV_Y + lat * R * Math.sqrt(1 - (xa / L) ** 2), yb = ENV_Y + lat * R * Math.sqrt(1 - (xb / L) ** 2);
        const l = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa), c = Math.cos(ang), si = Math.sin(ang), w = 0.008;
        flats.push(decal((xa + xb) / 2, (ya + yb) / 2, [[-l / 2 * c + w * si, -l / 2 * si - w * c], [l / 2 * c + w * si, l / 2 * si - w * c], [l / 2 * c - w * si, l / 2 * si + w * c], [-l / 2 * c - w * si, -l / 2 * si + w * c]], "#3a2e22", 0.02));
      }
      for (const fx of [-0.7, -0.35, 0, 0.35, 0.7]) for (let s = 0; s < 6; s++) {
        const x = fx * L, rr = R * Math.sqrt(1 - fx * fx), ya = ENV_Y - rr * 0.9 + s * rr * 0.3, yb = ya + rr * 0.3;
        flats.push(decal(x, (ya + yb) / 2, quad(0.016, rr * 0.3), "#3a2e22", 0.02));
      }
    }
    // The gondola: a wicker basket on four ropes, with the tethers' rings under it.
    const gTop = -0.36, gBot = -0.46, gw = 0.15 + 0.02 * t;
    const solids = [
      BB(-gw, gw, gBot, gTop, -0.1, 0.1, "#b88a4a", 0.012), B(-gw - 0.01, gw + 0.01, gTop - 0.02, gTop + 0.005, -0.11, 0.11, "#7a5230")
    ];
    for (let s = 0; s < 3; s++) solids.push(B(-gw, gw, gBot + 0.02 + s * 0.028, gBot + 0.03 + s * 0.028, 0.1, 0.104, "#8a6232"));
    for (let s = -3; s <= 3; s++) solids.push(B(s * gw / 3.5 - 0.005, s * gw / 3.5 + 0.005, gBot, gTop - 0.02, 0.101, 0.106, "#d0a868"));
    const belly = ENV_Y - R + 0.02;
    for (const x of [-gw + 0.01, gw - 0.01]) for (const z of [-0.08, 0.08]) solids.push(rod(x, gTop, z, x * 1.5, belly + 0.03, z * 1.2, 0.006, "#5e4a32", 0, 5));
    for (const [rx, ry] of RINGS) solids.push(rod(rx, gBot, 0, rx, ry + 0.015, 0, 0.007, STEEL_DK, 0, 6), moved(forwardLathe(lathe({ profile: [[0.012, -0.004], [0.022, -0.004], [0.022, 0.004], [0.012, 0.004], [0.012, -0.004]], segments: 8, color: STEEL_LT })), rx, ry, 0));
    if (shut) solids.push(B(-gw * 1.4, gw * 1.4, belly + 0.005, belly + 0.04, -0.15, 0.15, "#3a2e22"));
    return shaded([env], [...flats, ...solids]);
  };
  // A tether's line as a unit: a steel cable from (0, 0) to (0, 1); `cableAt` stretches a node of it between two points.
  const cable = cached(() => merge(B(-0.011, 0.011, 0, 1, -0.011, 0.011, "#2a2d33"), B(-0.004, 0.004, 0, 1, 0.011, 0.014, "#7d868f")));
  const cableAt = (node, ax, ay, bx, by) => {
    node.position.x = ax; node.position.y = ay; node.position.z = 0;
    node.rotation.x = 0; node.rotation.y = 0; node.rotation.z = Math.atan2(-(bx - ax), by - ay);
    node.scale.x = 1; node.scale.z = 1; node.scale.y = Math.hypot(bx - ax, by - ay);
  };

  // ---- stage-3 re-skins of the shared types ------------------------------------------------------------------------
  // A Legion hard hat in red with the seal's sticker, its brim forward (-x), sitting at `base` over a head whose middle
  // is cx (pre-turn coordinates of the raidModels figures, which face -x; `soldier` turns the hat with the figure).
  const RUNNER_HIP = 0.4, RUNNER_LEAN = 0.13;
  const hardHat = (cx, base, r) => merge(
    moved(lathe({ profile: [[0, 0], [r, 0], [r * 0.97, 0.04], [r * 0.85, 0.075], [r * 0.55, 0.1], [0, 0.11]], segments: 12, color: RED }), cx, base, 0),
    B(cx - 0.175, cx + r + 0.01, base - 0.004, base + 0.022, -r - 0.01, r + 0.01, RED_DK),
    B(cx - r * 0.85, cx + r * 0.85, base + 0.088, base + 0.116, -0.018, 0.018, "#d84a3e"),
    B(cx - 0.03, cx + 0.015, base + 0.035, base + 0.07, r * 0.92, r * 0.92 + 0.012, GOLD, 0.2)
  );
  // Each is the raidModels figure under its hat, the two stood tall together (`soldier`).
  const skinClerk = () => BL.raidModels.soldier(BL.raidStages.ENEMY.CLERK, hardHat(-0.003, 0.832, 0.114));
  const skinRunner = () => BL.raidModels.soldier(BL.raidStages.ENEMY.RUNNER, about(hardHat(0.009, 0.848, 0.116), 0, RUNNER_HIP, RUNNER_LEAN));
  // The carrier as a flying rig fan: a square fan face-on, its blades and glowing hub, a rig board under it and the
  // power lead trailing behind. Centred, facing +x (its flight).
  const skinCarrier = () => {
    const p = [
      BB(-0.15, 0.15, -0.15, 0.15, -0.045, 0.045, RIG, 0.02),
      ngon(0, 0, 0.13, 0.13, 0.047, FAN, 0, 12)
    ];
    for (const [x, y] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) p.push(ngon(x, y, 0.014, 0.014, 0.048, STEEL_LT, 0, 6));
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * PI * 2, b = a + 0.55;
      p.push(fpoly([[Math.cos(a) * 0.04, Math.sin(a) * 0.04], [Math.cos(a) * 0.12, Math.sin(a) * 0.12], [Math.cos(b) * 0.12, Math.sin(b) * 0.12], [Math.cos(b - 0.15) * 0.04, Math.sin(b - 0.15) * 0.04]], 0.05, BLADE));
    }
    p.push(ngon(0, 0, 0.045, 0.045, 0.053, STEEL_DK, 0, 10), ngon(0, 0, 0.03, 0.03, 0.056, LED, 1, 10), ngon(0, 0, 0.015, 0.015, 0.059, RIG, 0, 8));
    p.push(B(-0.13, 0.13, -0.2, -0.15, -0.035, 0.035, "#2f6b3a"), B(-0.1, -0.06, -0.19, -0.16, 0.035, 0.04, LED, 1), B(0.04, 0.1, -0.19, -0.16, 0.035, 0.04, GOLD));
    p.push(rod(-0.15, -0.1, 0, -0.24, -0.16, 0, 0.012, CABLE_OR), rod(-0.24, -0.16, 0, -0.3, -0.12, 0, 0.012, CABLE_OR), B(-0.32, -0.29, -0.14, -0.1, -0.015, 0.015, STEEL_LT));
    return turnedY(turnedZ(merge(...p), -0.15), -0.35);
  };
  // The sensor as a rig's control box on a stand: open, its screen glows with the hashrate's bars; shut, its steel door
  // is padlocked by the Legion. Feet at y 0, footprint 0.5 by 0.5.
  const skinSensor = (open) => {
    const p = [
      BB(-0.22, 0.22, 0, 0.05, -0.16, 0.16, STEEL_DK, 0.012), B(-0.04, 0.04, 0.05, 0.1, -0.04, 0.04, STEEL_DK),
      BB(-0.21, 0.21, 0.1, 0.47, -0.15, 0.15, "#2a2f36", 0.02),
      BB(-0.225, 0.225, 0.45, 0.5, -0.14, 0.17, "#3a4047", 0.012), B(-0.17, 0.17, 0.465, 0.48, 0.17, 0.176, LED, 0.8),
      B(0.15, 0.19, 0, 0.12, 0.08, 0.12, CABLE)
    ];
    for (let k = 0; k < 4; k++) p.push(B(-0.15 + k * 0.05, -0.125 + k * 0.05, 0.13, 0.17, 0.15, 0.17, k === 1 ? LED_LT : "#c9ccd2", k === 1 ? 0.6 : 0));
    p.push(disc(0.03, 0.02, 0.13, 0.15, 0.16, "#c9ccd2", 0, 10));
    if (open) {
      p.push(B(-0.16, 0.16, 0.21, 0.43, 0.15, 0.156, "#0d1a12"));
      const bars = [0.35, 0.5, 0.42, 0.66, 0.58, 0.8, 0.72];
      for (let k = 0; k < bars.length; k++) p.push(B(-0.14 + k * 0.04, -0.115 + k * 0.04, 0.23, 0.23 + bars[k] * 0.17, 0.156, 0.16, "#6fe04a", 0.9));
      p.push(B(-0.14, 0.14, 0.405, 0.415, 0.156, 0.16, LED, 0.8));
    } else {
      p.push(B(-0.175, 0.175, 0.2, 0.44, 0.15, 0.172, STEEL));
      for (let k = 0; k < 4; k++) p.push(B(-0.165, 0.165, 0.22 + k * 0.055, 0.226 + k * 0.055, 0.172, 0.176, STEEL_DK));
      p.push(B(-0.19, -0.175, 0.24, 0.29, 0.15, 0.17, STEEL_LT), B(-0.19, -0.175, 0.35, 0.4, 0.15, 0.17, STEEL_LT));
      p.push(...padlock(0.1, 0.3, 0.178, 0.9));
    }
    return facing(p, -0.15);
  };

  // ---- the registry ------------------------------------------------------------------------------------------------
  const pair = (build) => {
    const look = cached(build);
    return { build: look, turned: cached(() => mirrored(look())) };
  };
  // A look's wind-up (raid-enemies.js's FLAG.WIND; raid-models' `windOf`): its `build` with a flare at its muzzle (x, y),
  // in its type's tell colour, and the mirrored twin.
  const wound = (name, look, x, y, r) => {
    const wind = cached(() => BL.raidModels.windOf(look.build(), x, y, BL.raidModels.FAMILY_OF[name], undefined, r));
    return { wind, turnedWind: cached(() => mirrored(wind())) };
  };
  const woundPair = (name, build, x, y, r) => { const look = pair(build); return Object.assign(look, wound(name, look, x, y, r)); };
  // Each type's tier and origin (the stage specs' table) and its bullet box about its anchor, as raid-art-bank.js's
  // entries carry them; VENT also carries `touch`, its standing touch box, which its art fills.
  const TYPE_SPEC = Object.freeze({
    VENT: [4, 0], LOBBYIST: [0, 0.15], COIN_DRONE: [0, 0], BOND_MORTAR: [1, 0.35], LOB: [4, 0], TETHER: [1, 0.35], BALLOON: [3, 0],
    RUNNER: [0, 0.5], CLERK: [0, 0.5], CARRIER: [0, 0], SENSOR: [0, 0.25]
  });
  const boxOf = (name, b = RULES.SHOT_BOX[TYPE_SPEC[name][0]]) => { const o = TYPE_SPEC[name][1]; return Object.freeze([b[0], b[1], o + b[2], o + b[3]]); };
  const specOf = (name) => ({ tier: TYPE_SPEC[name][0], origin: TYPE_SPEC[name][1], box: boxOf(name) });
  const type = (name, looks) => put("types", name, Object.assign(specOf(name), looks));
  // TYPE_SPEC must be the sim's tier and origin, or a look's box drifts from its hit box (as raid-art-bank.js checks).
  {
    const { ENEMY } = BL.raidStages, { TIER_OF, ORIGIN_OF } = BL.raidSim;
    for (const name of Object.keys(TYPE_SPEC)) {
      const t = ENEMY[name];
      if (t === undefined || TIER_OF[t] === undefined) throw new Error(`raid-art-tower: the sim has no ${name}`);
      if (TIER_OF[t] !== TYPE_SPEC[name][0] || Math.abs(ORIGIN_OF[t] - TYPE_SPEC[name][1]) > 1e-9) {
        throw new Error(`raid-art-tower: ${name} is tier ${TIER_OF[t]}, origin ${ORIGIN_OF[t]} in the sim but tier ${TYPE_SPEC[name][0]}, origin ${TYPE_SPEC[name][1]} here`);
      }
    }
  }
  const swells = [], shutBalloon = cached(() => balloon(0, true));
  const swell = (k) => swells[k] || (swells[k] = balloon(k, false));
  const ventLook = { build: cached(vent) };
  type("VENT", { ...ventLook, wind: wound("VENT", ventLook, 0, 0, 0.06).wind, touch: boxOf("VENT", RULES.BOXES[RULES.TIER.SHOT][POSE.STAND]) });
  type("LOBBYIST", woundPair("LOBBYIST", lobbyist, 0, TYPE_SPEC.LOBBYIST[1]));
  const droneLook = { build: cached(coinDrone) };
  type("COIN_DRONE", { ...droneLook, wind: wound("COIN_DRONE", droneLook, 0, 0, 0.09).wind });
  const mortarShut = pair(() => bondMortar(1));
  // The mortar's frames between shut and open, frame k (k + 1) / (MORTAR_OPENINGS + 1) open, and their mirrored twins,
  // each built once.
  const mortarFrames = Array.from({ length: MORTAR_OPENINGS }, (_, k) => pair(() => bondMortar(1 - (k + 1) / (MORTAR_OPENINGS + 1))));
  type("BOND_MORTAR", Object.assign(woundPair("BOND_MORTAR", () => bondMortar(0), 0, TYPE_SPEC.BOND_MORTAR[1], 0.09), { shut: mortarShut.build, turnedShut: mortarShut.turned,
    OPENINGS: MORTAR_OPENINGS, opening: (k) => mortarFrames[k].build(), turnedOpening: (k) => mortarFrames[k].turned() }));
  const shell = cached(lobShell);
  // The mortar's shell, the lob a scene reads by its attr, 1 (raid-art-field.js gives the clipboard, 0, and the shard, 2).
  ART.lobs = ART.lobs || [];
  put("lobs", 1, shell);
  type("TETHER", { build: cached(tether) });
  type("BALLOON", { build: () => swell(0), shut: shutBalloon, swell, SWELLS });
  const sensorOpen = cached(() => skinSensor(true)), sensorShut = cached(() => skinSensor(false));
  const tower = {
    id: "tower", PLAY_BAND, DEPTH,
    screens, sector, backdrop, lifts, planks, gale,
    skins: {
      RUNNER: Object.assign(specOf("RUNNER"), pair(skinRunner)), CLERK: Object.assign(specOf("CLERK"), woundPair("CLERK", skinClerk, 0, TYPE_SPEC.CLERK[1])), CARRIER: Object.assign(specOf("CARRIER"), pair(skinCarrier)),
      SENSOR: Object.assign(specOf("SENSOR"), { build: sensorOpen, shut: sensorShut, turned: cached(() => mirrored(sensorOpen())), turnedShut: cached(() => mirrored(sensorShut())) })
    },
    // Where a line leaves a winch (FAIRLEAD over its feet) and the ring under the gondola it is made fast to (RINGS, by
    // tether, from the balloon's middle).
    boss: Object.freeze({ FAIRLEAD, RINGS, SWELLS, cable, cableAt })
  };
  put("stages", "tower", tower);
})();
