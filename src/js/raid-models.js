// Ooga Raid's art: the jungle shore's stage sectors and their dressing, the parallax backdrops, and the looks of the
// Fiat Legion (the paper-pushers, the desk clerk, the money printer, the flying ledger, the teller box and the bank
// vault), the pickups, the shots and the coin the Legion fires. Geometry only: no nodes, no state, nothing per frame.
// Every builder is cached once a page; the scene places the results.
//
// `sector(stage, screen)` is one 8 by 7 screen: the ground cut from the stage grid four voxels deep (the ledges only
// in the back voxel, behind the play plane), the water as its own surface with a sand bank where it meets the shore,
// the ledges' moss tops and hanging leaves, and the dressing. Dressing never enters the play plane's band
// (|z| < PLAY_BAND): behind it stand the bushes, ferns, rocks, logs, bamboo, trees and palms, in front only what lies
// on the ground's face below its top edge (grass fringe, stones, roots). Over a ledge's columns nothing reaches within
// LEDGE_CLEAR of its underside, so the walk line always reads.
//
// `backdrop()` is the two parallax layers (jungle hills at rate 0.5, distant peaks at 0.2; a layer's node x is
// `camX * (1 - rate)`, its geometry laid in stage metres over the whole scroll) and the painted sky, which rides with
// the camera (node x the camera's middle).
//
// `looks()` holds one geometry for every enemy, item and shot, and the printer's wind-up (`winding` frames, `heat`), its
// shot's dollar `bill` and the wind-up's `smoke`; the other shore attackers' `wind` looks (FLAG.WIND, `windOf`) and the
// scene's tell rings by family (`tells`, `bigTells`; see Telling an attack). An enemy look keeps inside its type's bullet box
// (`RULES.SHOT_BOX` for its tier about its `ORIGIN`), but for what stands set back at z -0.3 or further (the vault's
// body): a walker stands on its feet at y 0 (a standing foot soldier TALL, through `standTall`, its gun held by `holdGun`
// with the muzzle on its shot start; `soldier(type, extra)` stands the runner or the clerk tall under a skin's addition),
// the rest are centred on their x, y, as the sim's boxes are. Looks face the player
// (toward -x), the carrier its flight (+x), each turned a little toward the camera; `turned[type]` is the same look
// mirrored to face the other way (mirrored in x, never turned about y, so it still shows the camera its face). Shots
// fly along +x: the scene turns them about z by their heading. The vault's door is exactly `RULES.SHOT_BOX` for the
// vault's tier about `RULES.ORIGIN.VAULT`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, merge, cached, moved, turnedY, turnedZ, prism, forwardLathe, along, torus, tube } = BL.models;
  const { puff, leafy, pointedLeaf, flower, FLOWER_INKS, limb, padNormals, flatInto, sprig, liana, sagPoints, bamboo, log, SIGN_GLYPHS } = BL.hubModels;
  const { KIND, ENEMY, ITEM, CELL, SCREEN_W, STAGES, cellAt } = BL.raidStages;
  const { RULES, WEAPON } = BL.raidSim;
  const { terrain } = BL;
  const { hexToRgb, mulberry32, fnv1a } = BL.math;
  const PI = Math.PI;
  const SCREEN_X = SCREEN_W * CELL;
  // The stage is DEPTH voxels deep (z -1 to 1); a ledge fills only the back one. Dressing keeps out of |z| < PLAY_BAND.
  const DEPTH = 4, Z0 = -DEPTH * CELL / 2, Z1 = DEPTH * CELL / 2, LEDGE_Z = Z0 + CELL, PLAY_BAND = 0.3, LEDGE_CLEAR = 0.3;
  // The water's surface stands this far under its cell's top, so the shore's grass edge shows over it.
  const WATER_DROP = 0.05;

  // Each pickup's colour by ITEM value, as the blockout's.
  const ITEM_COLORS = [];
  ITEM_COLORS[ITEM.AUTO] = "#ff8c1a"; ITEM_COLORS[ITEM.CORK] = "#b05cff"; ITEM_COLORS[ITEM.FAN] = "#38c7ff"; ITEM_COLORS[ITEM.BEAM] = "#ff4fb0";
  ITEM_COLORS[ITEM.RAPID] = "#6fe04a"; ITEM_COLORS[ITEM.BARRIER] = "#ffffff"; ITEM_COLORS[ITEM.CLEAR] = "#3d5cff";

  // ---- small builders ----------------------------------------------------------------------------------------------
  // A box from its extents.
  const B = (x0, x1, y0, y1, z0, z1, color, emissive = 0) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, emissive, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  const BB = (x0, x1, y0, y1, z0, z1, color, bevel) => bevelBox({ w: x1 - x0, h: y1 - y0, d: z1 - z0, color, bevel, offset: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 } });
  // A part `len` long hung down from a pivot, turned by `a` about z (a positive angle swings its end toward +x), and
  // where its end lands.
  const hang = (px, py, pz, len, w, d, a, color) => moved(turnedZ(B(-w / 2, w / 2, -len, 0, -d / 2, d / 2, color), a), px, py, pz);
  const endOf = (px, py, len, a) => [px + len * Math.sin(a), py - len * Math.cos(a)];
  // Turns parts about z round a pivot: a positive angle leans their top toward -x.
  const about = (geo, px, py, a) => moved(turnedZ(moved(geo, -px, -py, 0), a), px, py, 0);
  // A disc of radius r and thickness t facing the camera (+z), centred at (x, y, z).
  const disc = (r, t, x, y, z, color, emissive = 0, segments = 14) =>
    moved(forwardLathe(lathe({ profile: [[0, -t / 2], [r, -t / 2], [r, t / 2], [0, t / 2]], segments, color, emissive })), x, y, z);
  // A round bar from a to b, radius r, built round +y and stood along the line.
  const rod = (ax, ay, az, bx, by, bz, r, color, emissive = 0, segments = 8) =>
    along(lathe({ profile: [[0, 0], [r, 0], [r, Math.hypot(bx - ax, by - ay, bz - az)], [0, Math.hypot(bx - ax, by - ay, bz - az)]], segments, color, emissive }), ax, ay, az, bx - ax, by - ay, bz - az);
  // A pixel picture (rows of "#" and ".", top row first) as runs of boxes `cell` square, its middle at (x, y), standing
  // proud of the plane z.
  const pixels = (rows, cell, x, y, z, color, emissive, depth = 0.012) => {
    const parts = [], w = rows[0].length, h = rows.length;
    for (let r = 0; r < h; r++) {
      const line = rows[r];
      for (let c = 0; c < w;) {
        if (line[c] !== "#") { c++; continue; }
        let e = c;
        while (e < w && line[e] === "#") e++;
        const x0 = x + (c - w / 2) * cell, y1 = y + (h / 2 - r) * cell;
        parts.push(B(x0, x0 + (e - c) * cell, y1 - cell, y1, z, z + depth, color, emissive));
        c = e;
      }
    }
    return parts;
  };
  // A word in the island's carved 3x5 alphabet, centred at (x, y).
  const word = (text, cell, x, y, z, color, emissive) => {
    const rows = ["", "", "", "", ""];
    for (let i = 0; i < text.length; i++) {
      const glyph = SIGN_GLYPHS[text[i]];
      for (let r = 0; r < 5; r++) rows[r] += (i ? "." : "") + (glyph ? glyph[r].replace(/1/g, "#").replace(/0/g, ".") : "...");
    }
    return pixels(rows, cell, x, y, z, color, emissive);
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
  // A cartoon geometry the jungle kit writes into: smooth, with explicit normals (zeros mean "not set").
  const jungle = () => ({ verts: [], faces: [], lines: [], smooth: true, normals: [] });
  // Appends a round part (a lathe: bamboo, a log) keeping its shared vertices, so it shades smooth.
  const addRound = (geo, part) => {
    const shift = geo.verts.length / 3;
    for (let i = 0; i < part.verts.length; i++) geo.verts.push(part.verts[i]);
    for (const f of part.faces) geo.faces.push({ ...f, i: f.i.map((i) => i + shift) });
    return padNormals(geo);
  };
  const finish = (geo) => {
    padNormals(geo);
    geo.normals = Float32Array.from(geo.normals);
    geo.castShadow = false;
    return geo;
  };
  const flat = (geo) => Object.assign(geo, { castShadow: false });
  // A front-facing polygon (counter-clockwise seen from +z, convex) at depth z, written into geo.
  const poly = (geo, points, z, color, emissive = 0) => {
    const base = geo.verts.length / 3, ids = [];
    for (let k = 0; k < points.length; k++) { geo.verts.push(points[k][0], points[k][1], z); ids.push(base + k); }
    geo.faces.push({ i: ids, color: typeof color === "string" ? hexToRgb(color) : color, emissive });
  };
  const blob = (geo, cx, cy, rx, ry, z, color, emissive = 0, n = 12) => {
    const pts = [];
    for (let k = 0; k < n; k++) { const a = k / n * PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    poly(geo, pts, z, color, emissive);
  };
  const rgbs = (list) => list.map(hexToRgb);

  // ---- the stage ---------------------------------------------------------------------------------------------------
  // The grid palette by value.
  const V = { LEDGE: 1, SAND: 2, GRASS: 3, GRASS_DARK: 4, DIRT: 5, STONE: 6, STONE_DARK: 7, SAND_DARK: 8, PIT: 9, PIT_DEEP: 10 };
  const PALETTE = [null, "#6e4c2c", "#dcc68e", "#5f9a3a", "#558a34", "#8a6a44", "#7a6e62", "#655a50", "#a48a5c", "#3e3024", "#2a2119"].map((c) => c && hexToRgb(c));
  const SAND_HEX = "#dcc68e", WET_SAND = "#a48a5c";
  const WATER_BANDS = [["#2f6f9e", 0], ["#3d8fc4", 0], ["#5fb6d8", 0.05], ["#e4f5f7", 0.35]];
  const BEACH = new Set([0]);   // screens of the first stage laid in sand to the top
  // A column's ground: the top of its highest solid cell with open air (or a ledge) over it, or -1 over a pit or water.
  const groundRow = (stage, col) => {
    for (let row = stage.rows - 1; row >= 0; row--) {
      const k = cellAt(stage, col, row);
      if (k === KIND.SOLID) return row + 1;
      if (k === KIND.WATER) return -1;
    }
    return -1;
  };
  // The lowest underside of a ledge over a column's ground in metres, or Infinity.
  const ledgeOver = (stage, col, ground) => {
    for (let row = Math.max(0, ground); row < stage.rows; row++) if (cellAt(stage, col, row) === KIND.LEDGE) return row * CELL;
    return Infinity;
  };
  const nearWater = (stage, col, row) => {
    for (let c = col - 2; c <= col + 2; c++) for (let r = row - 1; r <= row + 1; r++) if (cellAt(stage, c, r) === KIND.WATER) return true;
    return false;
  };
  // The columns of every pit (nothing at the bottom row) with the height its back wall is filled to, in rows.
  const pitFill = (stage, col) => {
    if (col < 0 || col >= stage.cols || cellAt(stage, col, 0) !== KIND.EMPTY) return 0;
    let a = col, b = col;
    while (a > 0 && cellAt(stage, a - 1, 0) === KIND.EMPTY) a--;
    while (b < stage.cols - 1 && cellAt(stage, b + 1, 0) === KIND.EMPTY) b++;
    const side = (c) => { let r = 0; while (r < stage.rows && cellAt(stage, c, r) === KIND.SOLID) r++; return r; };
    return Math.min(side(a - 1), side(b + 1));
  };

  const groundGeometry = (stage, screen) => {
    const grid = terrain.makeGrid(SCREEN_W, stage.rows, DEPTH), beach = BEACH.has(screen);
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, fill = pitFill(stage, col);
      for (let row = 0; row < fill; row++) grid.set(c, row, 0, row === fill - 1 ? V.PIT : V.PIT_DEEP);
      for (let row = 0; row < stage.rows; row++) {
        const kind = cellAt(stage, col, row);
        if (kind === KIND.LEDGE) { grid.set(c, row, 0, V.LEDGE); continue; }
        if (kind !== KIND.SOLID) continue;
        let depth = 0;
        while (depth < 3 && cellAt(stage, col, row + depth + 1) === KIND.SOLID) depth++;
        const odd = (col * 7 + row * 3) % 5 === 0, sandy = beach || nearWater(stage, col, row + depth);
        let value;
        if (depth === 0) value = cellAt(stage, col, row + 1) === KIND.WATER ? V.SAND_DARK : sandy ? V.SAND : odd ? V.GRASS_DARK : V.GRASS;
        else if (depth === 1) value = sandy ? V.SAND_DARK : V.DIRT;
        else value = odd ? V.STONE_DARK : V.STONE;
        for (let z = 0; z < DEPTH; z++) grid.set(c, row, z, value);
      }
    }
    const geo = terrain.gridGeometry(grid, { unit: CELL, palette: PALETTE, origin: { x: screen * SCREEN_X, y: 0, z: Z0 } });
    // Block joints line up across the sectors.
    geo.voxel[1] = 0;
    return geo;
  };

  // The water: each run of water cells a block whose front is painted in bands, deep to foam, its surface WATER_DROP
  // under the cell's top; a sand bank slopes into it from the shore at each end. Null when the screen has none.
  const waterGeometry = (stage, screen) => {
    const parts = [];
    for (let row = 0; row < stage.rows; row++) {
      for (let c = 0; c < SCREEN_W;) {
        const col = screen * SCREEN_W + c;
        if (cellAt(stage, col, row) !== KIND.WATER) { c++; continue; }
        let e = c;
        while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.WATER) e++;
        const x0 = (screen * SCREEN_W + c) * CELL, x1 = (screen * SCREEN_W + e) * CELL, y0 = row * CELL, y1 = (row + 1) * CELL - WATER_DROP;
        const cuts = [y0, y0 + 0.15, y0 + 0.3, y1 - 0.04, y1];
        for (let k = 0; k < 4; k++) parts.push(B(x0, x1, cuts[k], cuts[k + 1], Z0, Z1, WATER_BANDS[k][0], WATER_BANDS[k][1]));
        // Glints on the shallow band.
        for (let x = x0 + 0.3; x < x1 - 0.2; x += 0.9) parts.push(B(x, x + 0.22, y1 - 0.1, y1 - 0.08, Z1, Z1 + 0.01, "#bfe8f2", 0.4));
        // A bank where the shore meets it (a wedge from the shore's top edge down to the bed) and the wet sand under it.
        const bank = (edge, dir) => {
          const top = (row + 1) * CELL, run = 0.55, pts = dir > 0 ? [[edge, y0], [edge + run, y0], [edge, top]] : [[edge - run, y0], [edge, y0], [edge, top]];
          parts.push(prism(pts, Z1 - Z0 + 0.04, SAND_HEX), prism(dir > 0 ? [[edge, y0], [edge + run * 0.9, y0], [edge, y0 + 0.2]] : [[edge - run * 0.9, y0], [edge, y0], [edge, y0 + 0.2]], Z1 - Z0 + 0.06, WET_SAND));
        };
        if (cellAt(stage, screen * SCREEN_W + c - 1, row) === KIND.SOLID) bank(x0, 1);
        if (cellAt(stage, screen * SCREEN_W + e, row) === KIND.SOLID) bank(x1, -1);
        c = e;
      }
    }
    return parts.length ? flat(merge(...parts)) : null;
  };

  // The ledges' trim: a moss top flush with the walk line and a few leaves and vine ends hanging under the front edge.
  const ledgeGeometry = (stage, screen, rand) => {
    const geo = jungle(), moss = [];
    for (let row = 0; row < stage.rows; row++) {
      for (let c = 0; c < SCREEN_W;) {
        if (cellAt(stage, screen * SCREEN_W + c, row) !== KIND.LEDGE) { c++; continue; }
        let e = c;
        while (e < SCREEN_W && cellAt(stage, screen * SCREEN_W + e, row) === KIND.LEDGE) e++;
        const x0 = (screen * SCREEN_W + c) * CELL, x1 = (screen * SCREEN_W + e) * CELL, top = (row + 1) * CELL, under = row * CELL;
        moss.push(B(x0 - 0.02, x1 + 0.02, top - 0.07, top, Z0 - 0.02, LEDGE_Z + 0.03, "#7cb342"));
        moss.push(B(x0 - 0.01, x1 + 0.01, top - 0.12, top - 0.07, LEDGE_Z, LEDGE_Z + 0.025, "#5f9a3a"));
        for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.35 + rand() * 0.3) {
          if (rand() < 0.45) liana(geo, sagPoints(x, under + 0.02, LEDGE_Z + 0.02, x + 0.04, under - 0.16 - rand() * 0.08, LEDGE_Z + 0.03, 0.01, 3), 0.014, 0.008);
          else sprig(geo, x, under + 0.03, LEDGE_Z + 0.02, 0.1, -1, 0.15, 3, 0.13, rand);
        }
        c = e;
      }
    }
    if (!moss.length) return null;
    flatInto(geo, ...moss);
    return finish(geo);
  };

  // ---- dressing pieces ---------------------------------------------------------------------------------------------
  // Each writes into a jungle geometry with its base at (x, y, z) and returns nothing; PIECES gives each kind's reach
  // (half width at the top, height) for the placement rules.
  const BUSH = rgbs(["#3a6e24", "#56902f", "#6fae3a", "#8ccb4b"]);
  const DEEP_BUSH = rgbs(["#2a5a26", "#3b7434", "#4f8e40", "#69a852"]);
  const FERN = rgbs(["#2f6b2c", "#3f8a34", "#56a43f", "#74bd52"]);
  const CANOPY = [rgbs(["#2f6b2a", "#3f8434", "#56a03f", "#74b552"]), rgbs(["#2a5f3a", "#3a7a48", "#4f9658", "#68ae68"])];
  const ROCK = rgbs(["#5d5650", "#6b625a", "#7a716a", "#8b837b"]), MOSS = rgbs(["#4a6b2c", "#5b7f3a", "#6d9444", "#80a852"]);
  const BARK = rgbs(["#6b4a2b", "#5a3e24", "#4e361f"]);
  const PALM_BARK = rgbs(["#8a6a44", "#755a3a"]);
  const FROND = [hexToRgb("#6fae3a"), hexToRgb("#4f8a2a")];
  const COCONUT = rgbs(["#4a3420", "#5c4128", "#6e4e30", "#80603c"]);
  const REED = hexToRgb("#7a8f3a"), CATTAIL = rgbs(["#5a3a1e", "#6b4626", "#7a5230", "#8a5e36"]);

  const fern = (geo, x, y, z, rand, size) => {
    sprig(geo, x, y, z, 0, 1, 0, 6 + (rand() * 3 | 0), size, rand, FERN);
    sprig(geo, x + 0.05, y, z + 0.03, 0.3, 1, 0.2, 4, size * 0.7, rand, FERN);
  };
  const bush = (geo, x, y, z, rand, r) => {
    leafy(geo, x, y + r * 0.62, z, r, r * 0.68, r * 0.8, rand() < 0.5 ? BUSH : DEEP_BUSH, rand, Math.round(7 + r * 16), 0.08 + r * 0.22);
    if (rand() < 0.5) {
      const ink = FLOWER_INKS[(rand() * FLOWER_INKS.length) | 0];
      for (let n = 0; n < 4; n++) {
        const a = rand() * PI, nx = Math.cos(a) * 0.7, ny = 0.5 + rand() * 0.4, nz = Math.abs(Math.sin(a)) * 0.6 + 0.3, l = Math.hypot(nx, ny, nz);
        flower(geo, x + nx / l * r, y + r * 0.62 + ny / l * r * 0.68, z + nz / l * r * 0.8, nx / l, ny / l, nz / l, ink[0], ink[1], 0.06 + r * 0.05, rand);
      }
    }
  };
  const rock = (geo, x, y, z, rand, r) => {
    puff(geo, x, y + r * 0.3, z, r, r * 0.55, r * 0.7, ROCK, rand, 4, 8);
    if (rand() < 0.6) puff(geo, x + r * 0.7, y + r * 0.12, z + r * 0.2, r * 0.45, r * 0.3, r * 0.4, ROCK, rand, 3, 7);
    puff(geo, x - r * 0.1, y + r * 0.72, z, r * 0.62, r * 0.18, r * 0.5, MOSS, rand, 3, 7);
  };
  const lyingLog = (geo, x, y, z, rand, len) => {
    const r = 0.1 + rand() * 0.04;
    addRound(geo, log(x - len / 2, y + r, z, x + len / 2, y + r * 0.9, z + 0.05, r, "#6b4a2b"));
    puff(geo, x - len * 0.15, y + r * 1.75, z, len * 0.22, 0.035, r * 0.6, MOSS, rand, 3, 7);
    sprig(geo, x + len * 0.3, y, z + r, 0.2, 1, 0.3, 4, 0.18, rand, FERN);
  };
  const bambooClump = (geo, x, y, z, rand, h) => {
    const canes = 3 + (rand() * 3 | 0);
    for (let k = 0; k < canes; k++) {
      const dx = (k - canes / 2) * 0.11 + (rand() - 0.5) * 0.05, dz = (rand() - 0.5) * 0.2, tall = h * (0.62 + rand() * 0.38), lean = (rand() - 0.5) * 0.25;
      addRound(geo, bamboo(x + dx, y - 0.05, z + dz, x + dx + lean, y + tall, z + dz, 0.035 + rand() * 0.012, rand() < 0.3 ? "#cdb06a" : "#a8a04a"));
      for (let n = 0; n < 3; n++) {
        const t = 0.55 + n * 0.17 + rand() * 0.08, side = n % 2 ? -1 : 1;
        sprig(geo, x + dx + lean * t, y + tall * t, z + dz, side * 0.9, 0.35, 0.3, 3, 0.22, rand, FERN);
      }
    }
  };
  const jungleTree = (geo, x, y, z, rand, h) => {
    const lean = (rand() - 0.5) * 0.3, tones = CANOPY[(rand() * CANOPY.length) | 0];
    limb(geo, x, y - 0.1, z, x + lean, y + h * 0.72, z, 0.16, 0.09, 8, BARK[0]);
    limb(geo, x + lean * 0.6, y + h * 0.5, z, x + lean + h * 0.2, y + h * 0.66, z + 0.1, 0.06, 0.035, 6, BARK[1]);
    limb(geo, x + lean * 0.5, y + h * 0.45, z, x + lean - h * 0.18, y + h * 0.62, z - 0.1, 0.06, 0.035, 6, BARK[1]);
    // Roots splayed at the foot.
    for (const s of [-1, 1]) limb(geo, x, y + 0.18, z, x + s * 0.3, y - 0.04, z + 0.08, 0.07, 0.03, 5, BARK[2]);
    padNormals(geo);
    const cx = x + lean, cy = y + h * 0.78, r = h * 0.26;
    const d = Math.min(r, 0.55);
    leafy(geo, cx, cy, z, r * 1.25, r * 0.8, d, tones, rand, 16, 0.26);
    leafy(geo, cx - r * 0.9, cy - r * 0.25, z + 0.1, r * 0.75, r * 0.6, d * 0.8, tones, rand, 8, 0.22);
    leafy(geo, cx + r * 0.85, cy + r * 0.1, z - 0.15, r * 0.7, r * 0.55, d * 0.8, tones, rand, 8, 0.22);
  };
  // A palm: a ringed trunk curving in segments, a crown of drooping fronds (each a run of leaves bending down) and a
  // bunch of coconuts.
  const palm = (geo, x, y, z, rand, h) => {
    const bend = (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.3), segs = 6;
    let px = x, py = y - 0.1;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs, nx = x + bend * t * t * h * 0.35, ny = y + t * h * 0.9;
      limb(geo, px, py, z, nx, ny, z, 0.13 - t * 0.05 + 0.02, 0.13 - t * 0.05, 7, PALM_BARK[k & 1]);
      px = nx; py = ny;
    }
    padNormals(geo);
    for (let f = 0; f < 8; f++) {
      const a = f / 8 * PI * 2 + rand() * 0.3, ox = Math.cos(a), oz = Math.sin(a) * 0.55;
      let fx = px, fy = py, fz = z, pitch = 0.5 + rand() * 0.3;
      for (let s = 0; s < 3; s++) {
        const len = 0.38 - s * 0.05, ax = ox * Math.cos(pitch), ay = Math.sin(pitch), az = oz * Math.cos(pitch), al = Math.hypot(ax, ay, az);
        const wx = -oz, wz = ox, wl = Math.hypot(wx, wz) || 1;
        pointedLeaf(geo, fx, fy, fz, ax / al, ay / al, az / al, wx / wl * 0.9, 0, wz / wl * 0.9, 0, 1, 0, len * 1.4, FROND[0], FROND[1]);
        fx += ax / al * len; fy += ay / al * len; fz += az / al * len;
        pitch -= 0.55;
      }
    }
    for (let k = 0; k < 3; k++) puff(geo, px + (k - 1) * 0.09, py - 0.08 - (k & 1) * 0.05, z + 0.08, 0.065, 0.07, 0.065, COCONUT, rand, 3, 6);
  };
  const reeds = (geo, x, y, z, rand) => {
    for (let k = 0; k < 5; k++) {
      const dx = (k - 2) * 0.07 + (rand() - 0.5) * 0.04, tall = 0.35 + rand() * 0.3, lean = (rand() - 0.5) * 0.12;
      limb(geo, x + dx, y - 0.1, z, x + dx + lean, y + tall, z, 0.012, 0.008, 4, REED);
      padNormals(geo);
      if (k & 1) puff(geo, x + dx + lean * 0.85, y + tall * 0.85, z, 0.02, 0.06, 0.02, CATTAIL, rand, 3, 5);
    }
  };
  // Reach of each kind for a size parameter s: [half width at its widest, height, how far it reaches toward the camera
  // past its own z]. The last keeps every piece out of the play band.
  const REACH = {
    fern: (s) => [s * 0.8 + 0.1, s * 1.05, s * 0.8], bush: (s) => [s * 1.15 + 0.15, s * 1.35, s * 0.9 + 0.05], rock: (s) => [s * 1.2, s * 0.85, s * 0.9],
    log: (s) => [s * 0.55 + 0.1, 0.32, 0.4], bamboo: (s) => [0.55, s + 0.25, 0.4], tree: (s) => [s * 0.46 + 0.4, s * 1.02, 0.85], palm: (s) => [1.3, s * 0.9 + 0.35, 0.75],
    reeds: () => [0.25, 0.7, 0.1]
  };
  const BUILD = { fern, bush, rock, log: lyingLog, bamboo: bambooClump, tree: jungleTree, palm, reeds };

  // The dressing of one screen. Three rows of pieces: the far back (trees, palms, bamboo, big bushes, z -1.4 to -2.6),
  // the near back (ferns, rocks, logs, small bushes, reeds at the water, z -0.45 to -0.95), and the ground's own face
  // (grass fringe, stones and roots, below its top edge, z 1 and a little proud).
  const dressingGeometry = (stage, screen, rand) => {
    const geo = jungle(), x0 = screen * SCREEN_X, x1 = x0 + SCREEN_X;
    // Nothing behind the vault, which stands from 1.25 m left of its middle (its guns 1.65 m) to 1.25 m right.
    const keepOut = [];
    for (let i = 0; i < stage.placed.length; i += 4) if (stage.placed[i + 2] === ENEMY.VAULT) {
      const vx = (stage.placed[i] + 0.5) * CELL;
      keepOut.push([vx - 2.2, vx + 1.6]);
    }
    const colOf = (x) => Math.floor(x / CELL + 1e-6);
    // A piece fits where its base columns share one ground, it stays inside the stage, out of the keep-out, and over
    // every column it reaches it tops out LEDGE_CLEAR under any ledge.
    const fits = (x, hw, base, top) => {
      if (x - hw < 0 || x + hw > stage.cols * CELL) return null;
      for (const [a, b] of keepOut) if (x + hw > a && x - hw < b) return null;
      let ground = null;
      for (let c = colOf(x - base); c <= colOf(x + base); c++) {
        const g = groundRow(stage, c);
        if (g < 0 || (ground !== null && g !== ground)) return null;
        ground = g;
      }
      const y = ground * CELL;
      for (let c = colOf(x - hw); c <= colOf(x + hw); c++) {
        const g = Math.max(0, groundRow(stage, c));
        if (ledgeOver(stage, c, g) - LEDGE_CLEAR < y + top) return null;
      }
      return y;
    };
    const place = (kinds, x, z) => {
      for (const [kind, size] of kinds) {
        const [hw, top, ahead] = REACH[kind](size), base = kind === "tree" || kind === "palm" ? 0.2 : Math.min(hw, 0.35);
        const y = fits(x, hw, base, top);
        if (y === null) continue;
        BUILD[kind](geo, x, y, Math.min(z, -PLAY_BAND - 0.05 - ahead), rand, size);
        return true;
      }
      return false;
    };
    const shore = BEACH.has(screen);
    let wet = false;
    for (let c = screen * SCREEN_W - 6; c < screen * SCREEN_W + SCREEN_W + 6 && !wet; c++) for (let r = 0; r < stage.rows; r++) if (cellAt(stage, c, r) === KIND.WATER) { wet = true; break; }
    // The far back.
    for (let x = x0 + 0.3 + rand() * 0.5; x < x1; x += 0.9 + rand() * 1.1) {
      const z = -1.4 - rand() * 1.6, big = rand();
      const kinds = shore || wet ? (big < 0.5 ? [["palm", 3.2 + rand() * 1.2], ["bamboo", 2 + rand()], ["bush", 0.5 + rand() * 0.25], ["fern", 0.35]] : [["bush", 0.5 + rand() * 0.3], ["bamboo", 1.6 + rand()], ["fern", 0.35]])
        : big < 0.45 ? [["tree", 3.6 + rand() * 1.4], ["tree", 2.6], ["bamboo", 2.2 + rand() * 1.2], ["bush", 0.55 + rand() * 0.3], ["fern", 0.4]]
          : big < 0.75 ? [["bamboo", 1.8 + rand() * 1.4], ["bush", 0.5 + rand() * 0.3], ["fern", 0.4]]
            : [["bush", 0.6 + rand() * 0.35], ["bush", 0.4], ["fern", 0.35]];
      place(kinds, x, z);
    }
    // The near back, and reeds standing in the water.
    for (let x = x0 + 0.2 + rand() * 0.4; x < x1; x += 0.55 + rand() * 0.9) {
      const z = -0.5 - rand() * 0.45, col = colOf(x), pick = rand();
      if (groundRow(stage, col) < 0) {
        let row = -1;
        for (let r = stage.rows - 1; r >= 0; r--) if (cellAt(stage, col, r) === KIND.WATER) { row = r; break; }
        if (row >= 0 && rand() < 0.6) {
          const y = (row + 1) * CELL - WATER_DROP;
          let clear = true;
          for (let c = colOf(x - 0.25); c <= colOf(x + 0.25); c++) if (ledgeOver(stage, c, row + 1) - LEDGE_CLEAR < y + 0.7) clear = false;
          if (clear) reeds(geo, x, y, -0.7 - rand() * 0.25, rand);
        }
        continue;
      }
      const kinds = pick < 0.35 ? [["fern", 0.28 + rand() * 0.14], ["fern", 0.18]] : pick < 0.55 ? [["rock", 0.18 + rand() * 0.14], ["fern", 0.18]]
        : pick < 0.68 ? [["log", 0.6 + rand() * 0.4], ["rock", 0.15]] : pick < 0.85 ? [["bush", 0.22 + rand() * 0.1], ["fern", 0.2]] : [];
      if (kinds.length) place(kinds, x, z);
    }
    // The ground's face: a grass fringe hanging from each grass top, stones in the soil and roots under the turf.
    const fringe = { verts: [], faces: [], lines: [] }, FRINGE = ["#4f8a2e", "#69a83e", "#7cb342"].map(hexToRgb), front = Z1 + 0.004;
    for (let c = 0; c < SCREEN_W; c++) {
      const col = screen * SCREEN_W + c, g = groundRow(stage, col);
      if (g <= 0) continue;
      const top = g * CELL, sandy = BEACH.has(screen) || nearWater(stage, col, g - 1), cx = col * CELL;
      if (!sandy) for (let k = 0; k < 4; k++) {
        const a = cx + k * 0.125, len = 0.05 + rand() * 0.09;
        poly(fringe, [[a, top - 0.002], [a + 0.0625 + (rand() - 0.5) * 0.03, top - len], [a + 0.125, top - 0.002]], front, FRINGE[(rand() * 3) | 0]);
      }
      // Solid face under the top: how far down it runs (a step down to the next column's ground cuts it off nowhere).
      let face = 0;
      while (face < g && cellAt(stage, col, g - 1 - face) === KIND.SOLID) face++;
      if (face >= 2 && rand() < 0.45) {
        const sy = top - 0.3 - rand() * Math.min(0.5, (face - 1) * CELL - 0.3), r = 0.05 + rand() * 0.05;
        puff(geo, cx + 0.12 + rand() * 0.26, sy, Z1, r * 1.3, r, 0.05, sandy ? rgbs(["#a89270", "#b8a27e", "#c8b28c", "#d4c098"]) : ROCK, rand, 3, 7);
      }
      if (!sandy && rand() < 0.3) {
        const rx = cx + 0.1 + rand() * 0.3;
        liana(geo, [[rx, top - 0.1, Z1 + 0.01], [rx + 0.05, top - 0.2, Z1 + 0.02], [rx + 0.02, top - 0.3, Z1 + 0.015], [rx + 0.07, top - 0.38, Z1 + 0.01]], 0.016, 0.006, "#5a3e24");
      }
    }
    flatInto(geo, fringe);
    return finish(geo);
  };

  // One screen's geometries, cached by stage and screen.
  const sectors = new Map();
  const sector = (stage, screen) => {
    const key = stage.id + ":" + screen;
    let list = sectors.get(key);
    if (list) return list;
    const rand = mulberry32(fnv1a(key));
    list = [groundGeometry(stage, screen), waterGeometry(stage, screen), ledgeGeometry(stage, screen, rand), dressingGeometry(stage, screen, rand)].filter(Boolean);
    sectors.set(key, list);
    return list;
  };

  // ---- the backdrop ------------------------------------------------------------------------------------------------
  // Flat painted cut-outs, front faces only: under the parallel camera a layer is a picture, so its silhouettes are
  // strips of convex faces and its tree tops discs. Laid over the longest stage's scroll times the layer's rate, with a
  // screen's margin either side.
  const HILLS_Z = -12, PEAKS_Z = -28, SKY_Z = -34;
  const backdrop = cached(() => {
    let run = 0;
    for (const st of STAGES) run = Math.max(run, st.lockScreen * SCREEN_X);
    const strip = (geo, from, to, step, height, z, color, foot = -1) => {
      for (let x = from; x < to; x += step) poly(geo, [[x, foot], [x + step, foot], [x + step, height(x + step)], [x, height(x)]], z, color);
    };
    // The hills: a lighter far ridge and a darker near one crowned with tree tops.
    const hills = { verts: [], faces: [], lines: [] }, hRand = mulberry32(71);
    const hFrom = -16, hTo = run * 0.5 + 24;
    const far = (x) => 3.1 + 0.55 * Math.sin(x * 0.31 + 1.2) + 0.3 * Math.sin(x * 0.83);
    const near = (x) => 2.35 + 0.45 * Math.sin(x * 0.47) + 0.3 * Math.sin(x * 1.13 + 2) + 0.18 * Math.sin(x * 2.3);
    strip(hills, hFrom, hTo, 0.5, far, -0.6, "#7fa86a");
    strip(hills, hFrom, hTo, 0.5, near, 0, "#5d8c47");
    for (let x = hFrom; x < hTo; x += 0.45 + hRand() * 0.5) {
      const r = 0.3 + hRand() * 0.35, y = near(x) - r * 0.25;
      blob(hills, x + 0.06, y - 0.05, r, r * 0.8, 0.02, "#4b7a3a", 0, 10);
      blob(hills, x, y, r * 0.86, r * 0.7, 0.04, hRand() < 0.5 ? "#6a9c4f" : "#77a957", 0, 10);
    }
    // The peaks: lit faces left of the ridge, shaded right, and a band of sea mist at their feet.
    const peaks = { verts: [], faces: [], lines: [] }, pRand = mulberry32(23), pFrom = -16, pTo = run * 0.2 + 24;
    for (let x = pFrom; x < pTo; x += 3.5 + pRand() * 4) {
      const w = 4 + pRand() * 5, h = 3.6 + pRand() * 2.2, tip = x + w * (0.35 + pRand() * 0.3), z = -pRand() * 0.8;
      poly(peaks, [[x, 0], [tip, 0], [tip, h], [tip - w * 0.08, h - 0.25]], z, "#8b8fa6");
      poly(peaks, [[tip, 0], [x + w, 0], [tip + w * 0.1, h - 0.4], [tip, h]], z, "#6f7390");
      poly(peaks, [[tip - w * 0.06, h - 0.5], [tip, h - 0.35], [tip, h], [tip - w * 0.08, h - 0.25]], z + 0.01, "#a9adc0");
    }
    for (let x = pFrom; x < pTo; x += 1) {
      const m = (t) => 2.1 + 0.18 * Math.sin(t * 0.9) + 0.1 * Math.sin(t * 2.1);
      poly(peaks, [[x, 0], [x + 1, 0], [x + 1, m(x + 1)], [x, m(x)]], 0.5, "#c9dbe0");
    }
    // The sky: four painted bands, horizon to zenith, with a few flat clouds, riding with the camera.
    const W = 240, bands = [[-30, 3.4, "#e1f0ee"], [3.4, 4.8, "#c2e1ec"], [4.8, 6.2, "#9dcbe6"], [6.2, 60, "#7ab3df"]];
    const sky = bands.map(([lo, hi, color]) => {
      const g = { verts: [], faces: [], lines: [] }, mid = (lo + hi) / 2;
      poly(g, [[-W / 2, lo - mid], [W / 2, lo - mid], [W / 2, hi - mid], [-W / 2, hi - mid]], 0, color, 0.85);
      return { geometry: flat(g), y: mid, z: SKY_Z };
    });
    const clouds = { verts: [], faces: [], lines: [] }, cRand = mulberry32(5);
    for (const [cx, cy, s] of [[-6.5, 0.3, 1], [-1.2, 1.1, 0.7], [3.4, 0.6, 1.2], [7.8, 1.4, 0.8], [-10, 1.6, 0.9], [11.5, 0.2, 1]]) {
      for (let k = 0; k < 5; k++) {
        const r = s * (0.32 + cRand() * 0.22), ox = (k - 2) * s * 0.36, oy = k === 2 ? s * 0.18 : (k & 1) * s * 0.1;
        blob(clouds, cx + ox, cy + oy - 0.04, r, r * 0.62, -0.01, "#d6e8f0", 0.9, 10);
        blob(clouds, cx + ox, cy + oy, r * 0.92, r * 0.58, 0, "#ffffff", 0.9, 10);
      }
    }
    sky.push({ geometry: flat(clouds), y: 5.6, z: SKY_Z + 0.5 });
    return {
      layers: [
        { geometry: flat(peaks), rate: 0.2, y: 0, z: PEAKS_Z },
        { geometry: flat(hills), rate: 0.5, y: 0, z: HILLS_Z }
      ],
      sky
    };
  });

  // ---- the Fiat Legion ---------------------------------------------------------------------------------------------
  const SKIN = "#e2ab82", SKIN_DK = "#c98e66", HAIR = "#2f241c", SHIRT = "#f2efe6", SHOE = "#1d1d20", EYE = "#1d1d20", MOUTH = "#7a2a22";
  // A Legion head facing -x: face, hair, eyes, brows, nose, mouth and ears, from neck height y.
  const head = (y, hair, extra = []) => [
    B(-0.03, 0.03, y - 0.03, y + 0.01, -0.035, 0.035, SKIN),
    BB(-0.075, 0.07, y, y + 0.165, -0.07, 0.07, SKIN, 0.02),
    B(-0.062, 0.08, y + 0.14, y + 0.19, -0.076, 0.076, hair),
    B(0.035, 0.08, y + 0.04, y + 0.16, -0.076, 0.076, hair),
    B(-0.082, -0.073, y + 0.085, y + 0.11, 0.018, 0.044, EYE), B(-0.082, -0.073, y + 0.085, y + 0.11, -0.044, -0.018, EYE),
    B(-0.083, -0.073, y + 0.118, y + 0.13, 0.014, 0.05, hair), B(-0.083, -0.073, y + 0.118, y + 0.13, -0.05, -0.014, hair),
    B(-0.1, -0.074, y + 0.06, y + 0.09, -0.012, 0.012, SKIN_DK),
    B(-0.079, -0.073, y + 0.028, y + 0.042, -0.026, 0.026, MOUTH),
    B(-0.012, 0.028, y + 0.05, y + 0.1, 0.07, 0.084, SKIN), B(-0.012, 0.028, y + 0.05, y + 0.1, -0.084, -0.07, SKIN),
    ...extra
  ];
  // A suit jacket facing -x from hip y0 to shoulder y1: the jacket, its lapels, the shirt and tie down the front.
  const jacket = (y0, y1, suit, lapel, tie) => [
    BB(-0.09, 0.09, y0, y1, -0.105, 0.105, suit, 0.02),
    B(-0.099, -0.088, y1 - 0.15, y1, 0.038, 0.072, lapel), B(-0.099, -0.088, y1 - 0.15, y1, -0.072, -0.038, lapel),
    B(-0.1, -0.087, y1 - 0.13, y1, -0.038, 0.038, SHIRT),
    B(-0.107, -0.095, y0 + 0.05, y1 - 0.03, -0.018, 0.018, tie),
    B(-0.109, -0.094, y1 - 0.045, y1 - 0.01, -0.026, 0.026, tie),
    B(-0.096, -0.088, y0 + 0.02, y0 + 0.2, -0.004, 0.004, lapel)
  ];
  // The look turned toward the camera by `yaw` (a positive one swings a -x front toward +z).
  const facing = (parts, yaw) => turnedY(merge(...parts), yaw);
  const LOOK_YAW = 0.55;
  // Every standing foot soldier (a fodder walker, its origin 0.5: the shore's two, the bank rooms' guards, stages 5 to
  // 8's troops and every stage's skins of them) stands TALL over its feet. Its bullet box runs from 0.0625 under its feet
  // to 1.0625 over them (36 of the reference's pixels, origin 16 up), so a figure on its feet fills the box at 1.0625 and
  // no taller; TALL keeps a hair under that. The player's Ooga (`raid-crew.js`) stands TALL too, as the reference's
  // player and foot troops stand one size. `standTall(geo)` returns a copy of a built look facing either way, its feet
  // at y 0, scaled about them so its highest point stands at TALL; anything then reaching past WIDE of its middle (a
  // gun, a board's edge) is pressed in from KNEE out, side by side, so the look stays inside the box's ±0.344.
  const TALL = 1.06, WIDE = 0.343, KNEE = 0.24;
  const standTall = (geo) => {
    // Pressing x would bend explicit normals; no standing look carries any.
    if (geo.normals) throw new Error("raidModels.standTall: a look with explicit normals");
    const v = geo.verts, out = new Array(v.length);
    let top = 0, lo = 0, hi = 0;
    for (let i = 1; i < v.length; i += 3) top = Math.max(top, v[i]);
    const k = TALL / top;
    for (let i = 0; i < v.length; i += 3) {
      out[i] = v[i] * k; out[i + 1] = v[i + 1] * k; out[i + 2] = v[i + 2] * k;
      lo = Math.min(lo, out[i]); hi = Math.max(hi, out[i]);
    }
    const press = (x, most) => x <= KNEE || most <= WIDE ? x : KNEE + (x - KNEE) * (WIDE - KNEE) / (most - KNEE);
    for (let i = 0; i < out.length; i += 3) out[i] = out[i] < 0 ? -press(-out[i], -lo) : press(out[i], hi);
    return Object.assign({}, geo, { verts: out });
  };
  // A standing soldier's gun held at the hip so its muzzle sits on the sim's shot start for the type: a foot soldier
  // fires from its box origin (`spawnFrom`: its x, ORIGIN_OF[type] over its feet), the figure's middle as the camera sees
  // it. Built before the figure is turned `yaw` toward the camera and stood tall, so the muzzle is laid out where those
  // carry it onto that point: `z` toward the camera (the gun held on the near side, in front of the body), as far
  // forward (-x) as the turn swings back, and at the origin's height over TALL of the figure's top (`parts`, every part
  // so far, and `extra`, what a skin adds). `o`:
  //   gun       the gun's parts as authored, facing -x, with its muzzle at `muzzle` and its grip at `grip` ([x, y, z])
  //   shoulder  the shoulders' height (at z ±SHOULDER_Z); upper and lower the arm's two lengths, w its thickness
  //   sleeve    the arm's colour, band an optional band at the elbow, skin the hands', round for round sleeves
  // The near arm bends at the elbow to the grip; the far arm hangs, its hand by the hip (none with `farArm: false`).
  // Returns the parts to add.
  const SHOULDER_Z = 0.125, HOLD_Z = 0.2, ELBOW = Object.freeze([0.55, -1, 0.15]);
  const holdGun = (parts, o, extra) => {
    let top = 0;
    for (const g of extra ? [...parts, extra] : parts) for (let i = 1; i < g.verts.length; i += 3) top = Math.max(top, g.verts[i]);
    const my = BL.raidSim.ORIGIN_OF[o.type] * top / TALL, mx = -HOLD_Z * Math.tan(o.yaw), dx = mx - o.muzzle[0], dy = my - o.muzzle[1], dz = HOLD_Z - o.muzzle[2];
    const out = o.gun.map((g) => moved(g, dx, dy, dz));
    const seg = (ax, ay, az, bx, by, bz, w, color) => {
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      return along(o.round ? lathe({ profile: [[0, 0], [w / 2, 0], [w / 2, len], [0, len]], segments: 8, color }) : B(-w / 2, w / 2, 0, len, -w / 2, w / 2, color), ax, ay, az, bx - ax, by - ay, bz - az);
    };
    // A two-part arm from the shoulder (sx, sy, sz) to the hand (hx, hy, hz), the elbow bent toward ELBOW (down, back
    // and out); a hand out of reach is left at full stretch toward it.
    const arm = (sx, sy, sz, hx, hy, hz) => {
      const u = o.upper, l = o.lower;
      let vx = hx - sx, vy = hy - sy, vz = hz - sz, d = Math.hypot(vx, vy, vz);
      vx /= d; vy /= d; vz /= d;
      d = Math.min(Math.max(d, Math.abs(u - l) + 1e-3), u + l - 1e-3);
      hx = sx + vx * d; hy = sy + vy * d; hz = sz + vz * d;
      const a = (u * u - l * l + d * d) / (2 * d), up = Math.sqrt(Math.max(0, u * u - a * a));
      let px = ELBOW[0], py = ELBOW[1], pz = ELBOW[2] * Math.sign(sz);
      const t = px * vx + py * vy + pz * vz;
      px -= t * vx; py -= t * vy; pz -= t * vz;
      const pl = Math.hypot(px, py, pz) || 1;
      const ex = sx + vx * a + px / pl * up, ey = sy + vy * a + py / pl * up, ez = sz + vz * a + pz / pl * up;
      const part = [seg(sx, sy, sz, ex, ey, ez, o.w, o.sleeve), seg(ex, ey, ez, hx, hy, hz, o.w * 0.92, o.sleeve)];
      if (o.band) part.push(seg(sx + (ex - sx) * 0.7, sy + (ey - sy) * 0.7, sz + (ez - sz) * 0.7, sx + (ex - sx) * 0.86, sy + (ey - sy) * 0.86, sz + (ez - sz) * 0.86, o.w * 1.12, o.band));
      part.push(B(hx - 0.032, hx + 0.032, hy - 0.035, hy + 0.035, hz - 0.035, hz + 0.035, o.skin));
      return part;
    };
    out.push(...arm(0, o.shoulder, SHOULDER_Z, o.grip[0] + dx, o.grip[1] + dy, o.grip[2] + dz));
    if (o.farArm !== false) out.push(...arm(0, o.shoulder, -SHOULDER_Z, -0.05, o.shoulder - 0.3, -SHOULDER_Z - 0.01));
    return out;
  };

  // A paper-pusher in a grey suit and red tie, running flat out with a clipboard tucked under the near arm.
  const runner = () => {
    const SUIT = "#6b6f78", SUIT_DK = "#53575f", PANTS = "#4f535b", TIE = "#c8342a", hip = 0.4;
    const parts = [];
    // Legs: the near one reaching forward to the ground, the far one kicked back.
    parts.push(hang(0, hip, 0.05, 0.4, 0.09, 0.09, -0.36, PANTS));
    const [ax, ay] = endOf(0, hip, 0.4, -0.36);
    parts.push(B(ax - 0.1, ax + 0.035, 0, Math.max(0.05, ay + 0.02), 0.005, 0.095, SHOE));
    parts.push(hang(0, hip, -0.05, 0.2, 0.09, 0.09, 0.22, PANTS));
    const [kx, ky] = endOf(0, hip, 0.2, 0.22);
    parts.push(hang(kx, ky, -0.05, 0.18, 0.08, 0.08, 0.85, PANTS));
    const [fx, fy] = endOf(kx, ky, 0.18, 0.85);
    parts.push(moved(turnedZ(B(-0.03, 0.03, -0.1, 0.02, -0.045, 0.045, SHOE), 0.85 + PI / 2), fx, fy, -0.05));
    // The body leans into the run.
    const body = [...jacket(hip - 0.02, 0.66, SUIT, SUIT_DK, TIE), ...head(0.69, HAIR)];
    // The far arm swings back; the near one hugs the clipboard.
    body.push(hang(0, 0.63, -0.125, 0.26, 0.065, 0.065, 0.75, SUIT));
    const [hx, hy] = endOf(0, 0.63, 0.26, 0.75);
    body.push(B(hx - 0.03, hx + 0.03, hy - 0.035, hy + 0.025, -0.155, -0.095, SKIN));
    body.push(hang(0, 0.63, 0.125, 0.16, 0.07, 0.07, 0.18, SUIT));
    const [ex, ey] = endOf(0, 0.63, 0.16, 0.18);
    body.push(hang(ex, ey, 0.13, 0.14, 0.065, 0.065, -1.45, SUIT));
    const [wx, wy] = endOf(ex, ey, 0.14, -1.45);
    body.push(B(wx - 0.035, wx + 0.02, wy - 0.03, wy + 0.03, 0.1, 0.16, SKIN));
    body.push(B(-0.1, 0.07, 0.38, 0.575, 0.165, 0.18, "#8a5a32"), B(-0.088, 0.058, 0.39, 0.55, 0.18, 0.186, "#f6f3ea"));
    for (let k = 0; k < 4; k++) body.push(B(-0.075, 0.03 - (k & 1) * 0.03, 0.51 - k * 0.032, 0.516 - k * 0.032, 0.186, 0.19, "#8a9ac0"));
    body.push(B(-0.04, 0.01, 0.555, 0.59, 0.16, 0.19, "#c9ccd2"));
    parts.push(about(merge(...body), 0, hip, 0.13));
    return facing(parts, LOOK_YAW);
  };

  // A desk clerk in navy with a green eyeshade and spectacles, levelling a stamp gun at chest height in both hands.
  const clerk = (extra) => {
    const NAVY = "#2f3e66", NAVY_DK = "#222d4c", PANTS = "#232c45", TIE = "#d9a63a", GREY = "#9a948a", hip = 0.4;
    const parts = [];
    for (const [z, a] of [[0.05, -0.1], [-0.05, 0.12]]) {
      parts.push(hang(0, hip, z, 0.39, 0.09, 0.09, a, PANTS));
      const [ax] = endOf(0, hip, 0.39, a);
      parts.push(B(ax - 0.1, ax + 0.04, 0, 0.05, z - 0.045, z + 0.045, SHOE));
    }
    parts.push(...jacket(hip - 0.02, 0.66, NAVY, NAVY_DK, TIE));
    // Spectacles, the eyeshade's band and brim, grey hair about the ears.
    parts.push(...head(0.69, GREY, [
      B(-0.087, -0.08, 0.77, 0.81, 0.012, 0.05, "#cfd6dc", 0.15), B(-0.087, -0.08, 0.77, 0.81, -0.05, -0.012, "#cfd6dc", 0.15),
      B(-0.088, -0.08, 0.785, 0.795, -0.012, 0.012, "#3b3f46"),
      B(-0.077, 0.074, 0.835, 0.865, -0.077, 0.077, "#2a7a46"),
      B(-0.17, -0.07, 0.84, 0.852, -0.085, 0.085, "#3fae5a", 0.25)
    ]));
    // The stamp gun held at the hip, its rubber stamp's inked face the muzzle; navy sleeves with red garters.
    const gun = [
      B(-0.2, -0.155, 0.4, 0.5, -0.025, 0.025, "#7a5230"), B(-0.27, -0.13, 0.49, 0.56, -0.035, 0.035, "#3b3f46"),
      B(-0.155, -0.12, 0.555, 0.6, -0.025, 0.025, "#9a6a3a"), B(-0.295, -0.265, 0.45, 0.6, -0.06, 0.06, "#7a5230"),
      B(-0.308, -0.295, 0.46, 0.59, -0.052, 0.052, "#c8342a")
    ];
    parts.push(...holdGun(parts, { type: ENEMY.CLERK, yaw: LOOK_YAW, gun, muzzle: [-0.308, 0.525, 0], grip: [-0.178, 0.45, 0],
      shoulder: 0.63, upper: 0.16, lower: 0.15, w: 0.066, sleeve: NAVY, band: "#c8342a", skin: SKIN }, extra));
    if (extra) parts.push(extra);
    return facing(parts, LOOK_YAW);
  };

  // A money printer on a steel plinth: rollers on top, a hopper of blank paper at the back, a gear and two lamps on
  // its side, and fresh bills curling out of the slot it fires from (y 0.35, toward -x). Turned toward the camera, all of
  // it stays inside the emplacement's bullet box (x within 0.344 of its middle, from 0.006 m up), so what looks hittable
  // is; the plinth stands that hair over the ground. Shut (`cover` 1: not yet opened by the screen, or shut for good), a
  // slatted steel shutter covers the slot, a lid the rollers, no bill shows and both lamps are dark; in between (the
  // frames of its opening, `OPENINGS`, played back to shut it), the shutter has rolled that much of the way down into the
  // plinth and the lid slid back toward the hopper, the lamps lit once it is more open than shut. Before each shot it
  // winds up (raid-enemies.js's PRINTER_WIND): the scene plays its `SPINS` frames faster and faster, frame `spin` the
  // crosses on the rollers' ends turned spin / SPINS of a quarter turn and the side gear's teeth the other way, a
  // whole cycle of each, and lays the heat over it (`printerHeat`).
  const OPENINGS = 4, SPINS = 4;
  const printer = (cover = 0, spin = 0) => {
    const open = cover === 0, lit = cover < 0.5;
    const STEEL = "#44484f", STEEL_DK = "#2e3136", STEEL_LT = "#5a5f68", BILL = "#5f9e5a", BILL_LT = "#cfe8c0";
    const parts = [
      BB(-0.3, 0.3, 0.007, 0.08, -0.2, 0.2, STEEL_DK, 0.02),
      BB(-0.28, 0.28, 0.08, 0.52, -0.22, 0.22, STEEL, 0.03),
      B(-0.22, 0.22, 0.13, 0.47, 0.22, 0.23, STEEL_LT),
      B(-0.29, -0.28, 0.3, 0.4, -0.16, 0.16, "#111214"),
      // The hopper and its stack of paper.
      BB(0.04, 0.3, 0.5, 0.56, -0.18, 0.18, STEEL_DK, 0.015),
      B(0.07, 0.27, 0.56, 0.68, -0.15, 0.15, "#f2efe6"),
      B(0.07, 0.27, 0.6, 0.605, -0.151, 0.151, "#d8d4c8"), B(0.07, 0.27, 0.64, 0.645, -0.151, 0.151, "#d8d4c8"),
      // Lamps.
      B(0.12, 0.17, 0.4, 0.44, 0.23, 0.24, lit ? "#7cff6a" : "#2c4a2a", lit ? 0.9 : 0), B(0.19, 0.24, 0.4, 0.44, 0.23, 0.24, lit ? "#ff5a3c" : "#4a2420", lit ? 0.9 : 0)
    ];
    if (!open) {
      // The shutter over the slot, `drop` of it rolled down into the plinth, with its slats; and the lid over the rollers,
      // `back` of it slid back.
      const drop = 0.36 * (1 - cover), back = 0.3 * (1 - cover);
      if (0.5 - drop - 0.14 > 0.02) parts.push(BB(-0.3, -0.282, 0.14, 0.5 - drop, -0.19, 0.19, STEEL_DK, 0.006));
      for (let k = 0; k < 5; k++) if (0.18 + k * 0.065 - drop >= 0.14) parts.push(B(-0.302, -0.298, 0.18 + k * 0.065 - drop, 0.19 + k * 0.065 - drop, -0.18, 0.18, "#1f2124"));
      if (0.3 - back > 0.045) parts.push(BB(-0.27 + back, 0.03, 0.5, 0.62, -0.21, 0.21, STEEL_DK, 0.02));
    }
    // Rollers along z, a dark cross on each brass end, turned by the spin.
    const turn = spin / SPINS * PI / 2;
    for (const [x, y] of [[-0.2, 0.55], [-0.06, 0.56]]) {
      parts.push(rod(x, y, -0.2, x, y, 0.2, 0.05, "#1f2124"), rod(x, y, 0.2, x, y, 0.21, 0.035, "#c9a040"));
      for (const a of [0, PI / 2]) parts.push(moved(turnedZ(B(-0.031, 0.031, -0.006, 0.006, 0.21, 0.214, "#2a2112"), a + turn), x, y, 0));
    }
    // A gear on the side panel: hub disc and teeth, turned the other way.
    parts.push(disc(0.075, 0.02, -0.08, 0.26, 0.235, "#8a8f98"), disc(0.025, 0.03, -0.08, 0.26, 0.24, "#c9a040"));
    for (let k = 0; k < 8; k++) parts.push(moved(turnedZ(B(-0.015, 0.015, 0.06, 0.1, 0.225, 0.245, "#8a8f98"), k * PI / 4 - turn / 2), -0.08, 0.26, 0));
    // Bills curling out of the slot.
    if (open) for (const [x, y, a] of [[-0.29, 0.37, 0.25], [-0.29, 0.31, -0.2]]) {
      parts.push(moved(turnedZ(merge(B(-0.05, 0.05, -0.03, 0.03, -0.005, 0.005, BILL), B(-0.018, 0.018, -0.016, 0.016, 0.005, 0.009, BILL_LT)), a), x, y, 0.02));
    }
    return facing(parts, 0.2);
  };

  // The printer's heat as it winds up, laid over its open look in the same frame (the scene glows it up): the slot it fires
  // from white-hot, three vents beside the gear and rings round the rollers' ends red-hot, and the red lamp blazing; each
  // a hair proud of the face it heats, inside the look's box.
  const printerHeat = () => {
    const HOT = "#ff6a24", parts = [B(-0.296, -0.291, 0.3, 0.4, -0.16, 0.16, "#ffd27a", 1), B(0.188, 0.242, 0.398, 0.442, 0.24, 0.244, "#ff3a1c", 1)];
    for (const y of [0.17, 0.23, 0.29]) parts.push(B(0.04, 0.19, y, y + 0.025, 0.23, 0.235, HOT, 1));
    for (const [x, y] of [[-0.2, 0.55], [-0.06, 0.56]]) parts.push(moved(forwardLathe(torus(0.041, 0.008, "#ff4a1a", 1, 14, 5)), x, y, 0.212));
    return flat(facing(parts, 0.2));
  };

  // A flying ledger: a green-bound account book with gold corners, wings of ruled paper and loose sheets trailing, a
  // pencil for a beak and its ribbon hanging. Faces +x, its flight.
  const carrier = () => {
    const COVER = "#2f6b4a", GOLD = "#d9a63a", PAPER = "#f6f3ea", RULE = "#9fb4d8", INK = "#2c4a78";
    const parts = [
      BB(-0.06, 0.26, -0.055, 0.055, -0.13, 0.13, COVER, 0.015),
      B(-0.05, 0.25, -0.04, 0.04, 0.12, 0.135, PAPER), B(-0.05, 0.25, -0.012, -0.008, 0.135, 0.137, "#d8d4c8"), B(-0.05, 0.25, 0.012, 0.016, 0.135, 0.137, "#d8d4c8"),
      B(0.215, 0.265, 0.03, 0.06, 0.09, 0.135, GOLD), B(0.215, 0.265, -0.06, -0.03, 0.09, 0.135, GOLD),
      B(-0.065, -0.015, 0.03, 0.06, 0.09, 0.135, GOLD), B(-0.065, -0.015, -0.06, -0.03, 0.09, 0.135, GOLD),
      // The pencil beak.
      B(0.26, 0.36, -0.012, 0.012, -0.012, 0.012, "#f5c542"), B(0.36, 0.4, -0.008, 0.008, -0.008, 0.008, "#e0b080"),
      // The ribbon.
      B(0.02, 0.04, -0.175, -0.05, 0.13, 0.136, "#c8342a")
    ];
    // Each wing three ruled sheets fanned up and back from the spine, the near wing in front of the book. Each sheet's
    // edges are inked, inside its own outline, so the pale paper reads against a pale sky.
    for (const z of [0.15, -0.15]) {
      for (let k = 0; k < 3; k++) {
        const a = 0.22 + k * 0.26, sheet = merge(B(-0.18, 0, -0.04, 0.04, -0.004, 0.004, PAPER), B(-0.16, -0.02, 0.01, 0.015, 0.004, 0.006, RULE), B(-0.16, -0.02, -0.015, -0.01, 0.004, 0.006, RULE),
          B(-0.18, 0, 0.028, 0.04, 0.004, 0.006, INK), B(-0.18, 0, -0.04, -0.03, 0.004, 0.006, INK), B(-0.18, -0.168, -0.03, 0.028, 0.004, 0.006, INK));
        parts.push(moved(turnedZ(sheet, -a), 0.08, 0.03, z + (k - 1) * 0.01));
      }
    }
    // Loose sheets trailing.
    parts.push(moved(turnedZ(merge(B(-0.1, 0.03, -0.035, 0.035, -0.004, 0.004, PAPER), B(-0.1, 0.03, 0.025, 0.035, 0.004, 0.006, INK)), 0.15), -0.27, -0.01, 0.04));
    parts.push(moved(turnedZ(merge(B(-0.08, 0.02, -0.03, 0.03, -0.004, 0.004, "#ece6d4"), B(-0.08, 0.02, 0.021, 0.03, 0.004, 0.006, INK)), -0.25), -0.32, -0.07, -0.03));
    return facing(parts, -0.5);
  };

  // A teller box: a squat steel kiosk under a hood, a screen over a keypad, a card slot and a cash mouth. Open, its
  // screen glows with a watching eye and a bill pokes out of the mouth; shut, a slatted shutter covers the screen.
  const sensor = (open) => {
    const STEEL = open ? "#8f9aa6" : "#7d8792", DARK = "#2a2f36", parts = [
      BB(-0.235, 0.235, 0, 0.05, -0.18, 0.18, "#3b3f46", 0.012),
      BB(-0.21, 0.21, 0.05, 0.46, -0.16, 0.16, STEEL, 0.025),
      BB(-0.225, 0.225, 0.44, 0.5, -0.14, 0.21, "#5d6670", 0.015),
      disc(0.035, 0.012, 0, 0.47, 0.215, "#d9a63a", 0.3),
      B(-0.16, 0.16, 0.26, 0.42, 0.17, 0.182, DARK),
      B(-0.15, 0.15, 0.09, 0.13, 0.17, 0.182, DARK),
      B(0.1, 0.17, 0.2, 0.215, 0.17, 0.185, "#111214")
    ];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) parts.push(B(-0.1 + c * 0.045, -0.068 + c * 0.045, 0.165 + r * 0.03, 0.188 + r * 0.03, 0.17, 0.184, "#c9ccd2"));
    if (open) {
      parts.push(B(-0.135, 0.135, 0.28, 0.4, 0.182, 0.186, "#7fe0ff", 0.9));
      parts.push(disc(0.042, 0.006, 0, 0.34, 0.189, "#f6fbff", 0.9, 12), disc(0.022, 0.006, 0.006, 0.338, 0.193, "#10303a", 0.4, 10), B(0.012, 0.022, 0.348, 0.358, 0.196, 0.198, "#ffffff", 1));
      parts.push(B(-0.06, 0.06, 0.06, 0.11, 0.18, 0.186, "#5f9e5a"), B(-0.02, 0.02, 0.07, 0.1, 0.186, 0.189, "#cfe8c0"));
    } else {
      parts.push(B(-0.14, 0.14, 0.275, 0.405, 0.182, 0.19, "#555c65"));
      for (let k = 0; k < 5; k++) parts.push(B(-0.14, 0.14, 0.29 + k * 0.025, 0.296 + k * 0.025, 0.19, 0.194, "#41474f"));
    }
    return facing(parts, -0.15);
  };

  // The vault's gun: a coin cannon, a steel drum on a bracket (toward +x, the vault's side), brass bands, a hopper of
  // coins on top and the barrel toward -x.
  const vaultGun = () => {
    const STEEL = "#30343a", BRASS = "#c9a040", parts = [
      disc(0.13, 0.26, 0.06, -0.01, 0, STEEL, 0, 16),
      disc(0.135, 0.03, 0.06, -0.01, 0.1, BRASS, 0, 16), disc(0.135, 0.03, 0.06, -0.01, -0.1, BRASS, 0, 16),
      disc(0.04, 0.03, 0.06, -0.01, 0.135, BRASS, 0.2, 10),
      rod(-0.06, 0, 0, -0.27, 0, 0, 0.055, "#3b3f46", 0, 10),
      rod(-0.27, 0, 0, -0.3, 0, 0, 0.075, BRASS, 0, 12),
      rod(-0.301, 0, 0, -0.303, 0, 0, 0.045, "#0d0e10", 0, 10),
      B(0.18, 0.3, -0.13, 0.13, -0.06, 0.06, "#3a3e45"), B(0.27, 0.3, -0.16, 0.16, -0.09, 0.09, "#4a4f57"),
      B(0.02, 0.12, 0.08, 0.135, -0.05, 0.05, "#3a3e45")
    ];
    for (let k = 0; k < 3; k++) parts.push(disc(0.025, 0.01, 0.04 + k * 0.03, 0.14 + (k & 1) * 0.004, 0.03 - k * 0.025, "#f5c542", 0.5, 10));
    return facing(parts, 0.3);
  };

  // The vault: a bank front in stone and riveted steel behind the play plane (z -0.95 to -0.35), steps, two fluted
  // columns, FIAT BANK carved on the attic under a gold coin, a dark recess round the door and two turret sockets up
  // its left side where the guns mount (RULES' VAULT_GUNS spots).
  const VZ0 = -0.95, VZ1 = -0.35;
  const vaultBody = () => {
    const STONE = "#b5ad9d", STONE_DK = "#9c9384", STEEL = "#5d6067", SEAM = "#4a4d53", RIVET = "#80848c", GOLD = "#e0b44a";
    const parts = [
      B(-1.25, 1.25, 0, 0.12, VZ0, VZ1, "#8d8a84"), B(-1.15, 1.15, 0.12, 0.24, VZ0, VZ1 - 0.04, "#9c9890"),
      B(-1.0, 1.0, 0.24, 4.1, VZ0, VZ1 - 0.07, STEEL),
      B(-1.25, 1.25, 4.1, 4.32, VZ0, VZ1, STONE), B(-1.2, 1.2, 4.32, 4.36, VZ0, VZ1 - 0.02, STONE_DK),
      B(-0.98, 1.25, 4.36, 5.0, VZ0, VZ1 - 0.04, STONE),
      B(-0.98, 1.25, 4.94, 5.0, VZ0, VZ1 - 0.02, STONE_DK),
      // The recess the door sits in.
      B(-0.62, 0.62, 0.38, 1.64, VZ1 - 0.08, VZ1 - 0.06, "#1d1f23")
    ];
    // Plate seams and rivets over the steel.
    for (const y of [1.85, 2.95]) {
      parts.push(B(-1.0, 1.0, y - 0.015, y + 0.015, VZ1 - 0.07, VZ1 - 0.06, SEAM));
      for (let x = -0.9; x <= 0.91; x += 0.18) parts.push(B(x - 0.018, x + 0.018, y + 0.03, y + 0.066, VZ1 - 0.07, VZ1 - 0.05, RIVET));
    }
    for (const x of [-0.5, 0.5]) parts.push(B(x - 0.015, x + 0.015, 1.75, 4.1, VZ1 - 0.07, VZ1 - 0.06, SEAM));
    // Two columns, fluted, on a base and under a capital.
    for (const x of [-1.09, 1.09]) {
      parts.push(B(x - 0.15, x + 0.15, 0.24, 0.38, VZ0, VZ1 + 0.02, STONE_DK), B(x - 0.12, x + 0.12, 0.38, 3.92, VZ0, VZ1, STONE), B(x - 0.155, x + 0.155, 3.92, 4.1, VZ0, VZ1 + 0.02, STONE_DK));
      for (const f of [-0.07, 0, 0.07]) parts.push(B(x + f - 0.012, x + f + 0.012, 0.42, 3.88, VZ1, VZ1 + 0.008, STONE_DK));
    }
    // The attic: a carved name and a gold coin.
    parts.push(B(-0.92, 1.19, 4.42, 4.64, VZ1 - 0.04, VZ1 - 0.03, "#4a4038"));
    parts.push(...word("FIAT BANK", 0.034, 0.135, 4.53, VZ1 - 0.03, GOLD, 0.35));
    parts.push(disc(0.17, 0.04, 0.135, 4.8, VZ1 - 0.02, GOLD, 0.25, 18), disc(0.12, 0.05, 0.135, 4.8, VZ1, "#f0c95a", 0.3, 18));
    // The turret rail up the left side and its two sockets.
    parts.push(B(-1.25, -0.98, 2.62, 4.95, VZ0, VZ1 + 0.03, "#3a3e45"));
    // The sockets stand no further forward than z -0.31, as everything of the vault outside its door's box stays set back.
    for (const [, gy] of [[-1.35, 4.5], [-1.35, 3]]) {
      parts.push(disc(0.13, 0.06, -1.115, gy, VZ1 + 0.01, "#2a2d33", 0, 16), disc(0.135, 0.03, -1.115, gy, VZ1 + 0.02, "#c9a040", 0, 16));
    }
    return flat(merge(...parts));
  };
  // The door at exactly the vault's bullet box about its origin: a frame plate filling the box, and in it the round
  // door, shut (riveted steel, a spoked wheel) or swung open on its left hinge on the vault's glowing hoard.
  const DOOR = RULES.SHOT_BOX[RULES.TIERS.VAULT], DOOR_Y = RULES.ORIGIN.VAULT;
  const DX0 = DOOR[0], DX1 = DOOR[1], DY0 = DOOR_Y + DOOR[2], DY1 = DOOR_Y + DOOR[3], DCX = (DX0 + DX1) / 2, DCY = (DY0 + DY1) / 2, DR = (DX1 - DX0) / 2;
  const doorFrame = () => [B(DX0, DX1, DY0, DY1, -0.2, -0.1, "#3b3f46"), B(DX0 + 0.03, DX1 - 0.03, DY0 + 0.03, DY1 - 0.03, -0.1, -0.09, "#2f3238")];
  const doorShut = () => {
    const parts = [...doorFrame(), disc(DR - 0.004, 0.05, DCX, DCY, -0.07, "#3c4047", 0, 24), disc(DR - 0.06, 0.06, DCX, DCY, -0.05, "#565b63", 0, 24)];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * PI * 2;
      parts.push(disc(0.022, 0.02, DCX + Math.cos(a) * (DR - 0.035), DCY + Math.sin(a) * (DR - 0.035), -0.04, "#80848c", 0, 8));
    }
    parts.push(moved(forwardLathe(torus(0.17, 0.02, "#2a2d33", 0, 18, 6)), DCX, DCY, -0.015));
    for (let k = 0; k < 3; k++) parts.push(moved(turnedZ(B(-0.012, 0.012, -0.17, 0.17, -0.012, 0.012, "#2a2d33"), k * PI / 3), DCX, DCY, -0.015));
    parts.push(disc(0.045, 0.04, DCX, DCY, -0.005, "#c9a040", 0.1, 12));
    return flat(merge(...parts));
  };
  const doorOpen = () => {
    const parts = [...doorFrame(), disc(DR - 0.004, 0.04, DCX, DCY, -0.08, "#5a1a10", 0.3, 24), disc(DR - 0.05, 0.02, DCX, DCY, -0.06, "#e0482c", 0.75, 24)];
    // Stacks of gold coins inside.
    for (const [x, n] of [[-0.2, 4], [-0.05, 6], [0.1, 5], [0.24, 3]]) {
      for (let k = 0; k < n; k++) parts.push(moved(lathe({ profile: [[0, 0], [0.065, 0], [0.065, 0.03], [0, 0.03]], segments: 12, color: k & 1 ? "#f5c542" : "#e0b44a", emissive: 0.7 }), DCX + x, DY0 + 0.18 + k * 0.032, -0.045));
    }
    // The door swung toward the camera, seen edge on along the hinge, inside the box.
    parts.push(B(DX0, DX0 + 0.06, DY0 + 0.04, DY1 - 0.04, -0.06, 0.4, "#3c4047"), B(DX0 + 0.06, DX0 + 0.075, DCY - 0.2, DCY + 0.2, 0.1, 0.3, "#2a2d33"));
    return flat(merge(...parts));
  };

  // ---- pickups and shots ------------------------------------------------------------------------------------------
  // Each pickup's emblem, five by five: auto three bananas abreast, corkscrew a spiral, fan five rays, beam a long bolt,
  // rapid a double chevron, barrier a shield, clear a burst.
  const EMBLEMS = [];
  EMBLEMS[ITEM.AUTO] = [".....", "#.#.#", "#.#.#", "#.#.#", "....."];
  EMBLEMS[ITEM.CORK] = ["#####", "....#", ".##.#", ".#..#", ".####"];
  EMBLEMS[ITEM.FAN] = ["#.#.#", "#.#.#", ".###.", "..#..", "..#.."];
  EMBLEMS[ITEM.BEAM] = ["...#.", "#####", "#####", "...#.", "....."];
  EMBLEMS[ITEM.RAPID] = ["#.#..", ".#.#.", "..#.#", ".#.#.", "#.#.."];
  EMBLEMS[ITEM.BARRIER] = ["#####", "#####", "#####", ".###.", "..#.."];
  EMBLEMS[ITEM.CLEAR] = ["#.#.#", ".###.", "#####", ".###.", "#.#.#"];
  // The weapons come in banana crates, the boosts in bamboo drums: slats or rope ends, a band of the pickup's colour,
  // and its emblem glowing on a dark plate on the front. Centred, 0.4 by 0.28.
  const WEAPON_ITEM = new Set([ITEM.AUTO, ITEM.CORK, ITEM.FAN, ITEM.BEAM]);
  const pickup = (item) => {
    const color = ITEM_COLORS[item] || "#f5c542", parts = [];
    if (!item || WEAPON_ITEM.has(item)) {
      parts.push(BB(-0.2, 0.2, -0.14, 0.14, -0.15, 0.15, "#8a5e34", 0.02));
      for (const y of [-0.09, 0.0]) parts.push(B(-0.19, 0.19, y - 0.004, y + 0.004, 0.15, 0.155, "#5e3e20"));
      for (const x of [-0.175, 0.175]) for (const y of [-0.115, 0.115]) parts.push(B(x - 0.025, x + 0.025, y - 0.025, y + 0.025, 0.15, 0.16, "#f5c542"));
      parts.push(B(-0.2, 0.2, 0.075, 0.115, -0.152, 0.157, color, 0.5));
    } else {
      parts.push(rod(-0.19, 0, 0, 0.19, 0, 0, 0.13, "#8f9a4a", 0, 12));
      for (const x of [-0.18, -0.15, 0.15, 0.18]) parts.push(rod(x - 0.012, 0, 0, x + 0.012, 0, 0, 0.133, "#c9a36a", 0, 12));
      parts.push(rod(-0.12, 0, 0, -0.09, 0, 0, 0.134, color, 0.5, 12), rod(0.09, 0, 0, 0.12, 0, 0, 0.134, color, 0.5, 12));
    }
    if (item) {
      const plateZ = WEAPON_ITEM.has(item) ? 0.155 : 0.13;
      parts.push(B(-0.085, 0.085, -0.115, 0.055, plateZ, plateZ + 0.008, "#22180f"));
      parts.push(...pixels(EMBLEMS[item], 0.028, 0, -0.03, plateZ + 0.008, color, 0.95));
    }
    return merge(...parts);
  };
  // A banana `len` long, flying along +x, glowing a little so it reads against the leaves.
  const banana = (len, ripe, emissive) => tube({
    rings: 7, segments: 5,
    path: (t) => { const a = (t - 0.5) * 2; return { x: Math.sin(a) * len * 0.5, y: (1 - Math.cos(a)) * len * 0.5 - len * 0.2, z: 0 }; },
    radius: (t) => len * 0.16 * Math.pow(Math.sin(PI * t), 0.55) + len * 0.02,
    colorFn: (t) => t < 0.1 || t > 0.9 ? "#5a3a1a" : t < 0.22 || t > 0.78 ? ripe[1] : ripe[0], emissive
  });
  const bullets = () => {
    const out = [];
    out[WEAPON.RIFLE] = banana(0.22, ["#f5c542", "#c9b23a"], 0.45);
    out[WEAPON.AUTO] = banana(0.16, ["#ffb13b", "#e08a20"], 0.55);
    // The corkscrew's shot a purple berry with a leaf; the fan's a banana chip; the beam a bar of banana light.
    out[WEAPON.CORK] = merge(lathe({ profile: [[0, -0.06], [0.045, -0.05], [0.062, 0], [0.045, 0.05], [0, 0.06]], segments: 8, color: "#9b4fd9", emissive: 0.55 }), B(-0.005, 0.005, 0.055, 0.08, -0.005, 0.005, "#5a3a1a"), moved(turnedZ(B(0, 0.05, -0.01, 0.01, -0.003, 0.003, "#5fa243", 0.3), 0.5), 0, 0.07, 0));
    out[WEAPON.FAN] = merge(disc(0.055, 0.025, 0, 0, 0, "#f3e6a0", 0.5, 12), disc(0.03, 0.03, 0, 0, 0.001, "#fff6c8", 0.7, 10), disc(0.008, 0.032, 0.015, 0.012, 0.002, "#8a6a3a", 0.2, 6), disc(0.008, 0.032, -0.012, -0.01, 0.002, "#8a6a3a", 0.2, 6));
    out[WEAPON.BEAM] = merge(B(-0.14, 0.14, -0.035, 0.035, -0.035, 0.035, "#ff7ac8", 0.9), B(-0.15, 0.15, -0.015, 0.015, -0.015, 0.015, "#fff4b8", 1), B(0.1, 0.16, -0.05, 0.05, -0.02, 0.02, "#ffd0ea", 1));
    return out;
  };
  // A printer's shot, a paper dollar bill flying along +x, face on to the camera: green paper with a dark border, a pale
  // oval in the middle and a mark in two corners, the same on its back (the scene flips it as it flutters).
  // `mirrored` gives the bill that reads the right way up flying toward -x.
  const bill = () => {
    const GREEN = "#74c95c", DARK = "#24592a", PALE = "#eaf8dc", W = 0.145, H = 0.066, E = 0.008;
    const parts = [B(-W, W, -H, H, -0.005, 0.005, GREEN, 0.45)];
    for (const [z0, z1] of [[0.005, 0.009], [-0.009, -0.005]]) {
      parts.push(B(-W + E, W - E, H - 2 * E, H - E, z0, z1, DARK, 0.2), B(-W + E, W - E, -H + E, -H + 2 * E, z0, z1, DARK, 0.2));
      parts.push(B(-W + E, -W + 2 * E, -H + E, H - E, z0, z1, DARK, 0.2), B(W - 2 * E, W - E, -H + E, H - E, z0, z1, DARK, 0.2));
      parts.push(B(-0.038, 0.038, -0.03, 0.03, z0, z1, PALE, 0.6), B(-0.022, 0.022, -0.04, 0.04, z0, z1, PALE, 0.6));
      parts.push(B(-0.008, 0.008, -0.022, 0.022, z1, z1 + 0.002, DARK, 0.2));
      parts.push(B(-W + 0.022, -W + 0.046, 0.018, 0.04, z0, z1, DARK, 0.2), B(W - 0.046, W - 0.022, -0.04, -0.018, z0, z1, DARK, 0.2));
    }
    return flat(merge(...parts));
  };
  // A printer's wind-up smoke: a dark and a pale puff of soot, and an ember, each centred, which the scene grows, lifts
  // and fades from the printer's top.
  const smoke = () => {
    const puffOf = (tones, seed) => {
      const geo = jungle();
      puff(geo, 0, 0, 0, 0.1, 0.09, 0.09, rgbs(tones), mulberry32(seed), 3, 7);
      return finish(geo);
    };
    return [puffOf(["#2e2c2b", "#3a3735", "#45413e", "#504b47"], 5), puffOf(["#5c5855", "#6b6763", "#7a7671", "#8a8580"], 9), flat(B(-0.025, 0.025, -0.025, 0.025, -0.025, 0.025, "#ff8a2a", 1))];
  };
  // The Legion's shot: a gold coin face on to the camera, a raised rim, a glint and a square hole, bright, on a dark rim a
  // little wider behind it, so it reads as a coin against a pale sky, a jungle or a dark hall alike.
  const coin = () => merge(
    disc(0.088, 0.014, 0, 0, -0.008, "#1c1206", 0, 16),
    disc(0.07, 0.022, 0, 0, 0, "#e8b23a", 0.85, 14), disc(0.055, 0.026, 0, 0, 0, "#ffd84a", 0.95, 14),
    disc(0.018, 0.03, -0.022, 0.022, 0.002, "#fffbe6", 1, 8),
    B(-0.014, 0.014, -0.014, 0.014, 0.013, 0.016, "#6a4a1a", 0.3)
  );

  // ---- telling an attack --------------------------------------------------------------------------------------------
  // raid-enemies.js's FLAG.WIND marks a slot winding up to attack. Each attacking type's family (`FAMILY_OF`, by its ENEMY
  // name; every type that tells has one, which the scene holds at load) gives its tell's colour: a coin's gold, a printer's
  // bill green, a spark's electric cyan, a lob's ember orange, and a slam's or a charge's red. `windOf(geo, x, y, family)`
  // is a look winding up: a copy of `geo` (smooth or flat, its normals kept) with a charge flare at its muzzle (x, y in its
  // own frame) z in front of it (by default just in front of its nearest vertex), a white-hot core in a ring of the family's colour inside a dark rim, so it reads on a pale
  // sky as on a dark hall; its turned twin is `mirrored` as every turned look is. The art files dress their attacking types'
  // `wind` with it. `tells[family]` is the scene's ring, radius 1 (the scene scales it), closing on a winding slot's middle,
  // and `bigTells[family]` a boss's big attack's, thicker and with four spikes.
  const FAMILY = Object.freeze({ COIN: "#ffd23a", BILL: "#6cff5a", SPARK: "#5ff4ff", LOB: "#ff9a2a", SLAM: "#ff4a3a" });
  const FAMILY_OF = Object.freeze({
    CLERK: "COIN", PRINTER: "BILL", VAULT: "COIN", VAULT_GUN: "COIN", WALL_TELLER: "COIN", GUARD: "COIN", DROP_GUARD: "COIN",
    PRESS_DIE: "COIN", MINT_COUNTER: "COIN", PRINTER_KING: "COIN", LOBBYIST: "COIN", BOND_MORTAR: "LOB", VENT: "COIN", BALLOON: "COIN",
    COIN_DRONE: "SLAM", AUDITOR: "LOB", ARC_PYLON: "SPARK", CAPACITOR: "SPARK", GRID_WARDEN: "SPARK", FEE_EEL: "SLAM", LEVIATHAN: "COIN",
    SHARD_THROWER: "LOB", ICICLE: "SLAM", MECH: "COIN", MECH_POD: "LOB", RAM: "SLAM", ENGINE_PRESS: "SLAM", ENGINE_POD: "COIN", CHAIRMAN_ENGINE: "COIN"
  });
  const flare = (x, y, z, r, color) => [disc(r, 0.01, x, y, z, "#1a1208", 0, 16), disc(r * 0.78, 0.012, x, y, z + 0.008, color, 1, 16), disc(r * 0.36, 0.014, x, y, z + 0.016, "#fffbe6", 1, 12)];
  const windOf = (geo, x, y, family, z, r = 0.07) => {
    if (!FAMILY[family]) throw new Error(`raid-models: no tell family ${family}`);
    if (z === undefined) { z = -Infinity; for (let i = 2; i < geo.verts.length; i += 3) if (geo.verts[i] > z) z = geo.verts[i]; z += 0.012; }
    const out = { verts: Array.from(geo.verts), faces: geo.faces.map((f) => ({ ...f, i: f.i.slice() })), lines: geo.lines.map((l) => ({ ...l, i: l.i.slice() })) };
    if (geo.smooth) out.smooth = true;
    if (geo.normals) out.normals = Array.from(geo.normals);
    if (geo.castShadow === false) out.castShadow = false;
    if (geo.voxel) out.voxel = geo.voxel;
    flatInto(out, ...flare(x, y, z, r, FAMILY[family]));
    if (out.normals) out.normals = Float32Array.from(out.normals);
    return out;
  };
  const tellRing = (color, big) => {
    // The dark rim's tube is the thicker, so it stands far enough behind that its front stays behind the coloured ring's.
    const w = big ? 0.13 : 0.09, parts = [moved(forwardLathe(torus(1, w * 1.7, "#140c06", 0, 28, 6)), 0, 0, -w * 2.8), forwardLathe(torus(1, w, color, 1, 28, 6))];
    if (big) for (let k = 0; k < 4; k++) parts.push(turnedZ(merge(B(-0.1, 0.1, 1.08, 1.5, -0.03, -0.01, "#140c06"), B(-0.06, 0.06, 1.1, 1.46, -0.01, 0.01, color, 1)), k * PI / 2 + PI / 4));
    return flat(merge(...parts));
  };

  // The shore's runner or clerk stood tall, with `extra` (a skin's addition in the figure's own frame, facing -x before
  // its turn toward the camera) on it: the clerk's gun laid out for the whole figure's height, so its muzzle still lands
  // on the shot start.
  const soldier = (type, extra) => {
    if (type === ENEMY.CLERK) return standTall(clerk(extra));
    const look = runner();
    return standTall(extra ? merge(look, turnedY(extra, LOOK_YAW)) : look);
  };
  const looks = cached(() => {
    const enemies = [], shut = [], turned = [];
    enemies[ENEMY.SHOT] = coin();
    enemies[ENEMY.RUNNER] = soldier(ENEMY.RUNNER);
    enemies[ENEMY.CLERK] = soldier(ENEMY.CLERK);
    enemies[ENEMY.PRINTER] = printer(0);
    shut[ENEMY.PRINTER] = printer(1);
    // Each emplacement's frames between shut and open, in opening order (frame k is (k + 1) / (OPENINGS + 1) open), and
    // their mirrored twins.
    const opening = [], turnedOpening = [];
    opening[ENEMY.PRINTER] = Array.from({ length: OPENINGS }, (_, k) => printer(1 - (k + 1) / (OPENINGS + 1)));
    // The printer's wind-up: its SPINS frames (the first is its open look) and its heat, and their mirrored twins.
    const winding = [], turnedWinding = [], heat = [], turnedHeat = [];
    winding[ENEMY.PRINTER] = Array.from({ length: SPINS }, (_, k) => k === 0 ? enemies[ENEMY.PRINTER] : printer(0, k));
    heat[ENEMY.PRINTER] = printerHeat();
    enemies[ENEMY.CARRIER] = carrier();
    enemies[ENEMY.SENSOR] = sensor(true);
    shut[ENEMY.SENSOR] = sensor(false);
    const items = [];
    for (let a = 0; a <= ITEM.CLEAR; a++) items[a] = pickup(a);
    enemies[ENEMY.ITEM] = items[0];
    const gun = vaultGun(), body = vaultBody(), door = doorOpen(), shutDoor = doorShut();
    enemies[ENEMY.VAULT_GUN] = gun;
    enemies[ENEMY.VAULT] = merge(body, door);
    shut[ENEMY.VAULT] = merge(body, shutDoor);
    for (const t of [ENEMY.RUNNER, ENEMY.CLERK, ENEMY.PRINTER, ENEMY.CARRIER, ENEMY.SENSOR, ENEMY.VAULT_GUN]) turned[t] = mirrored(enemies[t]);
    const turnedShut = [];
    for (const t of [ENEMY.SENSOR, ENEMY.PRINTER]) turnedShut[t] = mirrored(shut[t]);
    turnedOpening[ENEMY.PRINTER] = opening[ENEMY.PRINTER].map(mirrored);
    turnedWinding[ENEMY.PRINTER] = winding[ENEMY.PRINTER].map((g, k) => k === 0 ? turned[ENEMY.PRINTER] : mirrored(g));
    turnedHeat[ENEMY.PRINTER] = mirrored(heat[ENEMY.PRINTER]);
    // The shore's other attackers winding up (FLAG.WIND), and their mirrored twins: the clerk's muzzle flaring at its shot
    // start, the vault gun's at its barrel's mouth, the open vault's door blazing round its hoard.
    const wind = [], turnedWind = [];
    wind[ENEMY.CLERK] = windOf(enemies[ENEMY.CLERK], 0, RULES.ORIGIN.CLERK, FAMILY_OF.CLERK);
    wind[ENEMY.VAULT_GUN] = windOf(gun, -0.26, 0, FAMILY_OF.VAULT_GUN, undefined, 0.075);
    wind[ENEMY.VAULT] = windOf(enemies[ENEMY.VAULT], DCX, DCY, FAMILY_OF.VAULT, undefined, 0.2);
    for (const t of [ENEMY.CLERK, ENEMY.VAULT_GUN]) turnedWind[t] = mirrored(wind[t]);
    const note = bill();
    return {
      enemies, shut, turned, turnedShut, opening, turnedOpening, winding, turnedWinding, heat, turnedHeat, wind, turnedWind, items, bullets: bullets(), shot: enemies[ENEMY.SHOT],
      bill: note, turnedBill: mirrored(note), smoke: smoke(), vault: { body, door, doorShut: shutDoor, gun },
      tells: Object.fromEntries(Object.keys(FAMILY).map((f) => [f, tellRing(FAMILY[f], false)])),
      bigTells: Object.fromEntries(Object.keys(FAMILY).map((f) => [f, tellRing(FAMILY[f], true)]))
    };
  });

  BL.raidModels = { sector, backdrop, looks, soldier, standTall, holdGun, windOf, mirrored, FAMILY, FAMILY_OF, TALL, ITEM_COLORS, PLAY_BAND, LEDGE_CLEAR, DEPTH };
})();
