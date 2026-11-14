// Block Frenzy's geometry: Fort Chaos, the two stands, the glowing Bitcoin block each team guards (in its colour), paint balls,
// splats and the team rings under the Oogas' feet. Every builder is cached; the scene places nodes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, merge, moved, turnedX, turnedY, turnedZ, cached, variants, geometry, pushVert, face, tube, lathe } = BL.models;
  const { hexToRgb } = BL.math;
  // Each map's own ground and buildings are `arena(map index)`; its ziplines `zipline(map index * 2 + side)`.
  const SIM = BL.blockSim;
  const TEAM = {
    blue: { paint: "#3a8dff", deep: "#1d4fa8", light: "#9cc8ff" },
    red: { paint: "#ff4a3a", deep: "#a8261d", light: "#ffb0a6" }
  };
  const ORANGE = "#f7931a", CREAM = "#fff3d6", TOP = SIM.CONFIG.TOWER_TOP;
  // The ₿ in a 7 x 9 grid, top row first: the strokes stand proud of the block's faces.
  const GLYPH = [
    "..#.#..",
    "######.",
    ".#....#",
    ".#....#",
    ".#####.",
    ".#....#",
    ".#....#",
    "######.",
    "..#.#.."
  ];

  // The ground: a sandy field with a darker strip down the middle and each half's end tinted to its team, then every
  // wall block in stone with a team-coloured cap near its fort, timber crates for the field's low cover, and the
  // centre tower in dark stone with an orange band.
  // Haunted Hollow's own blocks: the yards' plank floors over the cellars, iron rails, the houses' grey boards with a
  // purple trim, the cellars' mossy stone, headstones, the iron fence, dead trunks and the pale mausoleum. False for
  // anything else (the towers, the junk), which is drawn as on the other maps.
  const hauntedBlock = (parts, b, w, d, h, x, y, z, bottom) => {
    const thin = Math.min(w, d);
    if (b[4] > TOP - 0.5) return false;
    if (bottom > 2.5 && bottom < 2.8 && h <= 0.35) {
      parts.push(bevelBox({ w, h, d, color: "#3e3229", offset: { x, y, z } }));
      for (let k = 1; k < Math.floor(w / 0.9); k++) parts.push(box({ w: 0.05, h: 0.02, d, color: "#2a211b", offset: { x: b[0] + k * 0.9, y: b[4] + 0.005, z } }));
      return true;
    }
    if (bottom >= 2.9 && h <= 0.95 && thin <= 0.25) {
      parts.push(box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: b[4] - 0.03, z } }));
      for (let k = (w > d ? b[0] : b[2]) + 0.25; k < (w > d ? b[1] : b[3]); k += 0.5) parts.push(box({ w: 0.05, h, d: 0.05, color: "#1c1a20", offset: { x: w > d ? k : x, y, z: w > d ? z : k } }));
      return true;
    }
    if (bottom >= 2.9) {
      parts.push(bevelBox({ w, h, d, color: "#5a5258", offset: { x, y, z } }));
      for (let k = bottom + 0.4; k < b[4]; k += 0.4) parts.push(box({ w: w + 0.02, h: 0.03, d: d + 0.02, color: "#463f45", offset: { x, y: k, z } }));
      parts.push(box({ w: w + 0.05, h: 0.14, d: d + 0.05, color: "#6a3fa0", emissive: 0.25, offset: { x, y: b[4] - 0.07, z } }));
      return true;
    }
    if (h >= 4.5 && w <= 0.75 && d <= 0.75) {
      parts.push(bevelBox({ w, h, d, color: "#2e2622", offset: { x, y, z } }));
      return true;
    }
    if (Math.abs(d - 0.6) < 0.05 && Math.abs(Math.abs(z) - 48.8) < 0.05) {
      // The back door's frame (its posts and lintel, 0.6 m deep): dark timber with iron bands on the posts and the
      // house's purple trim under the lintel.
      parts.push(bevelBox({ w, h, d, color: "#3e3229", offset: { x, y, z } }));
      if (bottom > 0) parts.push(box({ w: w - 0.6, h: 0.05, d: d + 0.02, color: "#6a3fa0", emissive: 0.35, offset: { x, y: bottom - 0.01, z } }));
      else for (const by of [0.5, 2]) parts.push(box({ w: w + 0.03, h: 0.08, d: d + 0.03, color: "#1c1a20", offset: { x, y: by, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(h - 2.7) < 0.05 && Math.abs(z) >= 31.9) {
      parts.push(bevelBox({ w, h, d, color: "#6a6670", offset: { x, y, z } }));
      parts.push(box({ w: w + 0.03, h: 0.35, d: d + 0.03, color: "#4f5a3c", offset: { x, y: 0.18, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(h - 1.1) < 0.05 && thin <= 0.4) {
      // A headstone: a grey slab with a rounded top and a darker plinth.
      parts.push(bevelBox({ w, h: h - 0.15, d, color: "#8e8e98", offset: { x, y: (h - 0.15) / 2, z } }));
      parts.push(bevelBox({ w: w * 0.7, h: 0.18, d, color: "#8e8e98", offset: { x, y: h - 0.09, z } }));
      parts.push(box({ w: w + 0.1, h: 0.12, d: d + 0.12, color: "#55555e", offset: { x, y: 0.06, z } }));
      return true;
    }
    // The tall iron gate's collision: the scene draws the gate itself (`hauntModels.ironFence`).
    if (bottom === 0 && Math.abs(h - 3.9) < 0.05 && Math.abs(w - 4.6) < 0.05) return true;
    if (bottom === 0 && Math.abs(h - 1.3) < 0.05 && thin <= 0.35) {
      // The iron fence: rails and spiked bars.
      parts.push(box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: 1.1, z } }), box({ w, h: 0.06, d, color: "#1c1a20", offset: { x, y: 0.3, z } }));
      for (let k = b[0] + 0.15; k < b[1]; k += 0.3) parts.push(box({ w: 0.04, h, d: 0.04, color: "#1c1a20", offset: { x: k, y: h / 2, z } }));
      return true;
    }
    if (bottom === 0 && Math.abs(x) <= 3.1 && Math.abs(z) <= 4.5 && h > 0.4) {
      // The mausoleum and its steps: pale stone, a purple band round the tomb.
      parts.push(bevelBox({ w, h, d, color: "#b4aeb8", offset: { x, y, z } }));
      if (h > 2.5) parts.push(box({ w: w + 0.06, h: 0.25, d: d + 0.06, color: "#6a3fa0", emissive: 0.4, offset: { x, y: b[4] - 0.4, z } }));
      return true;
    }
    return false;
  };
  // The floating island under a map, in the hub's voxel ground (`BL.terrain`'s grid, greedy mesher and palette): a
  // grass top, soil, then banded rock down a cliff all round the field's open edge, the rock deepening toward the
  // middle as the sim's `isleDepth` has it (which holds bodies out of it) with drips hanging under it; and the map's
  // terrain (`rocks`: mounds with grass on top, cave walls and roofs, outcrops) in the same rock. Half-metre cells, so
  // the terrain's boxes, which keep to a half-metre grid, mesh exactly as the sim stands on them.
  const ISLE_CELL = 0.5, KEEL_CELL = 1, RIM_DEPTH = 3;
  const isleHash = (x, y, z) => { let h = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647 | 0, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const ISLE_P = { grass: 1, grassLight: 2, grassDark: 3, stone: 5, stoneDark: 6, dirt: 8 }, ISLE_BANDS = [ISLE_P.dirt, ISLE_P.stoneDark, ISLE_P.dirt, ISLE_P.stone];
  const isleRock = (ix, iy, iz, per) => ISLE_BANDS[((Math.floor((iy + per * 1.5 * Math.sin(ix * 0.21 + iz * 0.13)) / (3 * per)) % 4) + 4) % 4];
  // The hub's ground palette with each theme's grass and two field colours (slots 10 and 11) laid over it.
  const ISLE_THEME = {
    fort: { grass: null, field: ["#c9a96b", "#bda05f"] },
    town: { grass: null, field: ["#b9a77f", "#a89270"] },
    jungle: { grass: ["#3f8a34", "#55a53c", "#2f6f2c"], field: ["#6b8f3a", "#547a30"] },
    haunted: { grass: ["#3f4632", "#4a5138", "#353b2b"], field: ["#54433c", "#3a302a"] }
  };
  const islePalette = (M) => {
    const theme = ISLE_THEME[M.id], palette = BL.terrain.PALETTE.slice();
    if (theme.grass) theme.grass.forEach((hex, i) => { palette[1 + i] = hexToRgb(hex); });
    palette[10] = hexToRgb(theme.field[0]); palette[11] = hexToRgb(theme.field[1]);
    return palette;
  };
  // The top of the island: the rim's first `RIM_DEPTH` metres of cliff and the terrain.
  const isle = variants((mapIndex) => {
    const M = SIM.ARENAS[SIM.MAPS[mapIndex]], T = BL.terrain, P = ISLE_P, C = ISLE_CELL, nx = Math.round(M.W * 2 / C), nz = Math.round(M.L * 2 / C), TOP = Math.round(RIM_DEPTH / C);
    let high = 0;
    for (const b of M.rocks || []) high = Math.max(high, b[4]);
    const grid = T.makeGrid(nx, TOP + Math.ceil(high / C) + 1, nz);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = -M.W + (ix + 0.5) * C, z = -M.L + (iz + 0.5) * C;
      if (!SIM.onIsland(x, z, M)) continue;
      const depth = Math.min(TOP, Math.round(SIM.isleDepth(x, z, M) / C)), patch = Math.sin(x * 0.35) + Math.cos(z * 0.3);
      // The playing field's ground in its theme's colours, its edge wandering so it reads as worn earth, not a carpet;
      // grass round it, and a worn path ringing the island.
      const wobble = 0.05 * Math.sin(x * 0.7 + z * 0.3) + 0.05 * Math.sin(z * 0.53 - x * 0.2), field = Math.max(Math.abs(x) / (M.fieldW + 1.5), Math.abs(z) / (M.fieldL + 1.5)) + wobble < 1;
      const n = Math.hypot(x / M.W, z / M.L), top = field ? (patch > 0.3 ? 10 : 11) : Math.abs(n - 0.82) < 0.018 ? 4 : patch > 0.9 ? P.grassLight : patch < -0.9 ? P.grassDark : P.grass;
      for (let iy = TOP - depth; iy < TOP; iy++) {
        const k = TOP - 1 - iy;
        // Haunted Hollow's field is brick, courses in staggered runs (slots 10 and 11 are its brick and mortar).
        // An open grave's hole (the pit `GRAVE_Y` deep in the sim), down to dirt.
        const pit = SIM.inGraveOf(x, z, M), holeK = Math.round(-SIM.GRAVE_Y / C);
        if (pit && k < holeK) continue;
        const row = Math.floor(iz / 2), brick = M.id === "haunted" && field ? (iz % 2 === 0 || (ix + (row % 2) * 2) % 4 === 0 ? 11 : 10) : top;
        grid.set(ix, iy, iz, k === 0 ? brick : k <= 2 || (pit && k <= holeK + 1) ? P.dirt : isleRock(ix, iy, iz, 1));
      }
    }
    for (const b of M.rocks || []) {
      const grassy = M.rockKind.get(b) !== "outcrop";
      const x0 = Math.round((b[0] + M.W) / C), x1 = Math.round((b[1] + M.W) / C), z0 = Math.round((b[2] + M.L) / C), z1 = Math.round((b[3] + M.L) / C);
      const y0 = TOP + Math.round((b[5] || 0) / C), y1 = TOP + Math.round(b[4] / C);
      for (let ix = Math.max(0, x0); ix < Math.min(nx, x1); ix++) for (let iz = Math.max(0, z0); iz < Math.min(nz, z1); iz++) for (let iy = y0; iy < y1; iy++) {
        grid.set(ix, iy, iz, grassy && iy === y1 - 1 ? P.grass : grassy && iy === y1 - 2 ? P.dirt : isleRock(ix, iy, iz, 1));
      }
    }
    return T.gridGeometry(grid, { unit: C, palette: islePalette(M), origin: { x: -M.W, y: -TOP * C, z: -M.L } });
  });
  // The keel under the rim, metre cells down to the sim's `isleDepth`, with drips hanging from it.
  const keel = variants((mapIndex) => {
    const M = SIM.ARENAS[SIM.MAPS[mapIndex]], T = BL.terrain, C = KEEL_CELL, nx = Math.round(M.W * 2 / C), nz = Math.round(M.L * 2 / C), H = Math.ceil(SIM.CONFIG.ISLE_DEPTH + 5 - RIM_DEPTH);
    const grid = T.makeGrid(nx, H, nz);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = -M.W + (ix + 0.5) * C, z = -M.L + (iz + 0.5) * C;
      if (!SIM.onIsland(x, z, M)) continue;
      const edge = SIM.edgeDist(x, z, M);
      const drip = edge > 3 && isleHash(ix, 7, iz) < 0.07 ? 1 + Math.floor(isleHash(ix, 9, iz) * 4) : 0;
      const depth = Math.round(SIM.isleDepth(x, z, M) - RIM_DEPTH) + drip;
      for (let iy = H - depth; iy < H; iy++) grid.set(ix, iy, iz, isleRock(ix, iy, iz, 0.5));
    }
    return T.gridGeometry(grid, { unit: C, palette: islePalette(M), origin: { x: -M.W, y: -RIM_DEPTH - H * C, z: -M.L } });
  });
  // ---- Gorilla Jungle ----
  // Everything of the map's own goes into its one mesh: the temples, the treetop walkway, the trees and their crowns,
  // the cargo nets, the puddles, the banana hoard and the signs. Nothing here moves and nothing is lit.
  const JUNGLE = {
    bark: "#5e4026", barkPale: "#86603a", plank: "#9a6f44", plankDark: "#5a3a22", rope: "#d9b877", stone: "#8f8c7e", stoneDark: "#66645a",
    moss: "#5f9a3a", leaves: ["#2c8a34", "#43a83a", "#63c244"], bloom: "#ff8a2a", banana: "#ffd23a", bananaDark: "#d9a61f", ink: "#fff3d6", pool: "#3f7fa6"
  };
  const JUNGLE_SIGNS = { gate: ["APES|TOGETHER", "HODL|FOREVER"], alley: "NOT YOUR VINES, NOT YOUR BANANAS", hoard: ["BANANA RESERVE", "21 MILLION. NO MORE."], middle: "MIND THE GORILLAS", home: "DON'T TRUST. PEEL." };
  // Letters in the jumbotron's 5 x 7 alphabet as flat pixels (each row's runs of lit pixels one quad): lines split by
  // "|", centred at (x, y, z) inside `w` by `h`, on a face looking down `nz` (+1 or -1 along z), reading left to right
  // from that side.
  const jungleCarve = (parts, text, x, y, z, w, h, nz, color, emissive = 0) => {
    const glyphOf = BL.jumbotron.text.glyphOf, lines = text.split("|"), cols = Math.max(...lines.map((l) => l.length)) * 6 - 1, rows = lines.length * 9 - 2;
    const px = Math.min(w / cols, h / rows), geo = geometry(), rgb = hexToRgb(color), opts = { emissive }, fz = z + nz * 0.035;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li], lw = line.length * 6 - 1;
      for (let r = 0; r < 7; r++) {
        let run = -1;
        for (let c = 0; c <= lw; c++) {
          const lit = c < lw && c % 6 < 5 && (glyphOf(line[Math.floor(c / 6)])[r] >> (4 - c % 6)) & 1;
          if (lit && run < 0) run = c;
          else if (!lit && run >= 0) {
            const xa = x + nz * (run - lw / 2) * px, xb = x + nz * (c - lw / 2) * px, y1 = y + (rows / 2 - li * 9 - r) * px, y0 = y1 - px;
            face(geo, [pushVert(geo, xa, y0, fz), pushVert(geo, xb, y0, fz), pushVert(geo, xb, y1, fz), pushVert(geo, xa, y1, fz)], rgb, opts);
            run = -1;
          }
        }
      }
    }
    parts.push(geo);
  };
  // A sign board fixed under a floor's edge at (x, z), facing `nz`: a narrow plank (it hangs no lower than 2.25 m, over
  // every head and out of the chase camera's way) and its one line of words.
  const jungleBoard = (parts, text, x, z, nz, w, under) => {
    const y = under - 0.33;
    parts.push(box({ w, h: 0.66, d: 0.08, color: JUNGLE.plankDark, offset: { x, y, z } }));
    jungleCarve(parts, text, x, y, z + nz * 0.04, w - 0.4, 0.5, nz, JUNGLE.ink, 0.3);
  };
  const jungleDress = (M, parts) => {
    const J = JUNGLE, C = SIM.CONFIG;
    // Each tree's crown, three stepped slabs of leaves up to the ledge an Ooga lands on (`LEAF_TOP` over the trunk's
    // top, 1.3 radii across); the big ones carry blossom and trail a few vines.
    for (const d of M.decor) {
      if (d.kind !== "canopy") continue;
      const k = Math.round(Math.abs(d.x * 3 + d.z * 7)), big = d.r >= 4;
      parts.push(bevelBox({ w: d.r * 2.2, h: 0.75, d: d.r * 2.2, color: J.leaves[k % 3], offset: { x: d.x, y: d.y + 0.1, z: d.z } }));
      parts.push(bevelBox({ w: d.r * 1.75, h: 0.7, d: d.r * 1.75, color: J.leaves[(k + 1) % 3], offset: { x: d.x, y: d.y + 0.6, z: d.z } }));
      parts.push(bevelBox({ w: d.r * 1.3, h: 0.5, d: d.r * 1.3, color: J.leaves[(k + 2) % 3], offset: { x: d.x, y: d.y + SIM.LEAF_TOP - 0.25, z: d.z } }));
      for (let n = 0; n < (big ? 4 : 1); n++) {
        const a = n * Math.PI / 2 + k, rr = d.r * (big ? 0.95 : 0.7);
        parts.push(box({ w: 0.35, h: 0.3, d: 0.35, color: J.bloom, emissive: 0.25, offset: { x: d.x + Math.sin(a) * rr, y: d.y + 0.55, z: d.z + Math.cos(a) * rr } }));
        if (big) parts.push(box({ w: 0.07, h: 1.6 + (n % 2) * 0.7, d: 0.07, color: J.leaves[1], offset: { x: d.x + Math.cos(a) * d.r, y: d.y - 0.9 - (n % 2) * 0.35, z: d.z + Math.sin(a) * d.r } }));
      }
    }
    // The cargo nets: uprights and rungs across each climb zone's wider side.
    for (const n of M.nets) {
      const [x0, x1, z0, z1] = n.zone, across = n.dx ? "z" : "x", w = n.dx ? z1 - z0 : x1 - x0, x = n.dx ? (n.dx < 0 ? x0 + 0.08 : x1 - 0.08) : (x0 + x1) / 2, z = n.dx ? (z0 + z1) / 2 : (n.dz < 0 ? z0 + 0.08 : z1 - 0.08);
      for (let k = 0; k < 4; k++) { const o = (k / 3 - 0.5) * w; parts.push(box({ w: 0.05, h: n.top, d: 0.05, color: J.rope, offset: { x: across === "x" ? x + o : x, y: n.top / 2, z: across === "z" ? z + o : z } })); }
      for (let y = 0.3; y < n.top; y += 0.5) parts.push(box({ w: across === "x" ? w : 0.05, h: 0.05, d: across === "z" ? w : 0.05, color: J.rope, offset: { x, y, z } }));
    }
    // Rain puddles, flush with the ground.
    for (const [x, z] of M.puddles) parts.push(box({ w: 1.6, h: 0.02, d: 1.3, color: J.pool, emissive: 0.08, offset: { x, y: 0.045, z } }));
    // The banana hoard between the Great Tree's roots, and its sign under each end of the ring platform.
    const high = M.caches[0][1];
    for (const s of [-1, 1]) {
      parts.push(bevelBox({ w: 1.5, h: 0.6, d: 1.1, color: J.banana, emissive: 0.15, offset: { x: 0, y: 0.3, z: s * 1.4 } }), bevelBox({ w: 0.9, h: 0.45, d: 0.7, color: J.bananaDark, emissive: 0.15, offset: { x: s * 0.15, y: 0.8, z: s * 1.3 } }));
      for (const [bx, bz, turn] of [[-1.1, 1.9, 0.5], [1.2, 2.1, -0.7], [0.3, 2.4, 1.4]]) parts.push(moved(turnedY(box({ w: 0.55, h: 0.12, d: 0.14, color: J.banana, emissive: 0.15 }), turn), s * bx, 0.07, s * bz));
      jungleBoard(parts, JUNGLE_SIGNS.hoard[s > 0 ? 0 : 1], 0, s * 3.44, s, 6, high - 0.3);
      // Each tree house's two signs: one toward the middle, one toward its own temple.
      jungleBoard(parts, JUNGLE_SIGNS.middle, 0, s * 11.06, -s, 5.4, high - 0.3);
      jungleBoard(parts, JUNGLE_SIGNS.home, 0, s * 16.94, s, 5.4, high - 0.3);
      // The slogans carved either side of each temple gate, read from the field.
      jungleCarve(parts, JUNGLE_SIGNS.gate[0], s * 5.8, 1.3, s * 23, 3.8, 1.5, -s, J.banana, 0.35);
      jungleCarve(parts, JUNGLE_SIGNS.gate[1], -s * 5.8, 1.3, s * 23, 3.8, 1.5, -s, J.banana, 0.35);
      // And one along the back wall, for whoever comes round by the alley.
      jungleCarve(parts, JUNGLE_SIGNS.alley, 0, 1.3, s * 33, 15, 0.9, s, J.banana, 0.35);
    }
  };
  // The map's own boxes, by what the map says each is (`kinds`). False for anything else (the towers), which is drawn
  // as on the other maps.
  const jungleBlock = (parts, b, kind, w, d, h, x, y, z, bottom) => {
    const J = JUNGLE, top = b[4], s = Math.sign(z) || 1, team = z > 0 ? "blue" : "red";
    if (kind === "trunk") {
      // Bark, flared into roots at the foot; the Great Tree's roots reach further.
      parts.push(bevelBox({ w, h, d, color: J.bark, offset: { x, y, z } }));
      parts.push(box({ w: w + 0.3, h: 0.35, d: w + 0.3, color: J.barkPale, offset: { x, y: 0.175, z } }));
      if (w > 1.2) for (const [rx, rz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(bevelBox({ w: 0.7, h: 0.7, d: 0.7, color: J.bark, offset: { x: x + rx * (w / 2 + 0.15), y: 0.35, z: z + rz * (w / 2 + 0.15) } }));
    } else if (kind === "floor") {
      parts.push(bevelBox({ w, h, d, color: J.plank, offset: { x, y, z } }));
      for (const e of [-1, 1]) parts.push(box({ w: w + 0.06, h: 0.12, d: 0.18, color: J.plankDark, offset: { x, y: bottom + 0.02, z: z + e * (d / 2 - 0.4) } }));
    } else if (kind === "bridge") {
      // Planks on two ropes: a slat every 0.75 m.
      parts.push(box({ w, h: 0.08, d, color: J.plank, offset: { x, y: top - 0.04, z } }));
      for (let k = b[2] + 0.4; k < b[3]; k += 0.75) parts.push(box({ w: w + 0.04, h: 0.1, d: 0.1, color: J.plankDark, offset: { x, y: top - 0.035, z: k } }));
    } else if (kind === "rope" || kind === "rail") {
      // A rope rail: a hand rope and a lower one.
      parts.push(box({ w, h: 0.07, d, color: J.rope, offset: { x, y: top - 0.05, z } }), box({ w, h: 0.05, d, color: J.rope, offset: { x, y: bottom + 0.38, z } }));
    } else if (kind === "temple" || kind === "pillar") {
      // Old stone on a dark footing, moss along the top and the team's paint under it.
      parts.push(bevelBox({ w, h, d, color: J.stone, offset: { x, y, z } }));
      parts.push(box({ w: w + 0.04, h: 0.16, d: d + 0.04, color: TEAM[team].paint, emissive: 0.2, offset: { x, y: top - 0.2, z } }), box({ w: w + 0.02, h: 0.1, d: d + 0.02, color: J.moss, offset: { x, y: top + 0.04, z } }));
      // A banner in the team's colour down each gate pillar, on the field's side.
      if (kind === "pillar") parts.push(box({ w: 0.6, h: 1.9, d: 0.04, color: TEAM[team].paint, emissive: 0.3, offset: { x, y: 1.75, z: z - s * (d / 2 + 0.03) } }));
    } else if (kind === "head") {
      // The stone gorilla head over the gate, its face to the field: a heavy brow, eyes in the team's colour, a flat
      // nose, and fangs hanging over the doorway (the gate is its mouth). Moss on its crown.
      const f = z - s * d / 2, out = (n) => f - s * n;
      parts.push(bevelBox({ w, h, d, color: J.stone, offset: { x, y, z } }), box({ w: w + 0.02, h: 0.1, d: d + 0.02, color: J.moss, offset: { x, y: top + 0.04, z } }));
      parts.push(bevelBox({ w: w * 0.78, h: 0.4, d: 0.5, color: J.stoneDark, offset: { x, y: top - 0.32, z: out(0.2) } }));
      for (const e of [-1, 1]) {
        parts.push(box({ w: 1.05, h: 0.42, d: 0.1, color: "#1c1a18", offset: { x: x + e * 1.45, y: top - 0.8, z: out(0.04) } }), box({ w: 0.5, h: 0.26, d: 0.06, color: TEAM[team].paint, emissive: 1, offset: { x: x + e * 1.4, y: top - 0.82, z: out(0.1) } }));
        parts.push(box({ w: 0.22, h: 0.16, d: 0.08, color: "#1c1a18", offset: { x: x + e * 0.3, y: bottom + 0.3, z: out(0.2) } }));
        for (const fx of [0.9, 1.9]) parts.push(box({ w: 0.3, h: 0.4, d: 0.3, color: J.ink, offset: { x: x + e * fx, y: bottom - 0.2, z: out(-0.3) } }));
      }
      parts.push(bevelBox({ w: 1.5, h: 0.6, d: 0.35, color: J.stoneDark, offset: { x, y: bottom + 0.4, z: out(0.12) } }));
    } else if (kind === "bush") {
      parts.push(bevelBox({ w, h: h * 0.8, d, color: J.leaves[0], offset: { x, y: h * 0.4, z } }), bevelBox({ w: w * 0.6, h: h * 0.45, d: d * 0.75, color: J.leaves[2], offset: { x: x + w * 0.1, y: h * 0.78, z } }));
      parts.push(box({ w: 0.22, h: 0.2, d: 0.22, color: J.bloom, emissive: 0.25, offset: { x: x - w * 0.3, y: h * 0.85, z: z + d * 0.2 } }));
    } else if (kind === "log") {
      // A fallen trunk, its cut ends pale.
      parts.push(bevelBox({ w, h, d, color: J.bark, offset: { x, y, z } }));
      for (const e of [-1, 1]) parts.push(box({ w: 0.06, h: h * 0.7, d: d * 0.7, color: J.barkPale, offset: { x: x + e * w / 2, y, z } }));
      parts.push(box({ w: w * 0.4, h: 0.08, d: d * 0.6, color: J.moss, offset: { x: x - w * 0.15, y: top + 0.03, z } }));
    } else if (kind === "rock") {
      parts.push(bevelBox({ w, h, d, color: J.stoneDark, offset: { x, y, z } }), box({ w: w * 0.7, h: 0.08, d: d * 0.7, color: J.moss, offset: { x, y: top + 0.03, z } }));
    } else return false;
    return true;
  };
  // The jungle round the field, out on the island's rim (Detail: Full): tall trees and a few bushes in one mesh, on
  // the open ground the terrain leaves [x, z, trunk height, crown radius (0 a bush)], blue's half, turned for red.
  // Scenery only: nothing stands on these.
  const JUNGLE_RING = [[-4.5, 52, 9, 3.2], [4, 52.5, 7.5, 2.6], [0, 54, 0, 0], [13, 47, 10, 3], [-13, 47, 8, 2.6], [27, 21, 9, 3], [27.5, 22.5, 0, 0], [24.5, 33, 8, 2.6], [-24.5, 33, 9.5, 3.2],
    [29.5, 1.5, 10, 3.2], [-28, 3.5, 8, 2.8], [-30.5, 2, 0, 0], [7.5, 40, 0, 0], [-7.5, 40, 0, 0]];
  const jungleRing = cached(() => {
    const J = JUNGLE, parts = [];
    JUNGLE_RING.forEach(([px, pz, top, r], k) => {
      for (const s of [1, -1]) {
        const x = s * px, z = s * pz;
        if (!r) {
          parts.push(bevelBox({ w: 1.8, h: 0.9, d: 1.5, color: J.leaves[k % 3], offset: { x, y: 0.45, z } }), box({ w: 0.25, h: 0.22, d: 0.25, color: J.bloom, emissive: 0.25, offset: { x: x + 0.4, y: 0.95, z: z - 0.3 } }));
          continue;
        }
        parts.push(box({ w: 0.9, h: top, d: 0.9, color: J.bark, offset: { x, y: top / 2, z } }));
        parts.push(bevelBox({ w: r * 2.1, h: 0.9, d: r * 2.1, color: J.leaves[k % 3], offset: { x, y: top + 0.25, z } }), bevelBox({ w: r * 1.4, h: 0.8, d: r * 1.4, color: J.leaves[(k + 1) % 3], offset: { x, y: top + 1, z } }));
      }
    });
    return merge(...parts);
  });
  const arena = variants((mapIndex) => {
    const M = SIM.ARENAS[SIM.MAPS[mapIndex]], town = M.id === "town", jungle = M.id === "jungle", haunted = M.id === "haunted", parts = [], FW = M.fieldW, FL = M.fieldL;
    parts.push(box({ w: FW * 2, h: 0.05, d: 0.6, color: ORANGE, emissive: 0.25, offset: { y: 0.03 } }));
    for (const t of SIM.TEAMS) {
      const s = t === "blue" ? 1 : -1;
      // A ring of team paint round the stand, flush with the ground.
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        parts.push(box({ w: 0.5, h: 0.06, d: 0.18, color: TEAM[t].paint, emissive: 0.3, offset: { x: M.stands[t].x + Math.sin(a) * SIM.CONFIG.STAND_R, y: 0.03, z: M.stands[t].z + Math.cos(a) * SIM.CONFIG.STAND_R } }));
      }
    }
    // A map's own scoring spots: a wide ring of team paint with an orange ₿-coloured centre.
    if (M.goals) for (const t of SIM.TEAMS) {
      const g = M.goals[t], R = SIM.CONFIG.GOAL_R;
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        parts.push(box({ w: 0.6, h: 0.06, d: 0.2, color: TEAM[t].paint, emissive: 0.5, offset: { x: g.x + Math.sin(a) * R, y: 0.04, z: g.z + Math.cos(a) * R } }));
      }
      parts.push(box({ w: 1.2, h: 0.05, d: 1.2, color: ORANGE, emissive: 0.6, offset: { x: g.x, y: 0.035, z: g.z } }));
    }
    if (jungle) jungleDress(M, parts);
    if (haunted) {
      // Haunted Hollow: dead grass over the field, bare patches, and each dead tree's crooked branches.
      const r = (k) => ((Math.sin(k * 7.233) * 43758.5453) % 1 + 1) % 1;
      for (let k = 0; k < 60; k++) parts.push(box({ w: 1 + r(k) * 3, h: 0.05, d: 1 + r(k + 70) * 3, color: k % 3 ? "#3d4430" : "#5a5a44", offset: { x: (r(k + 140) - 0.5) * FW * 1.9, y: 0.035, z: (r(k + 210) - 0.5) * (FL * 2 - 8) } }));
      // Grass: tufts of blades in greens and dry yellows, thicker toward the edges and round the headstones.
      const greens = ["#4f6b34", "#5e7d3a", "#6f8a44", "#7d8a4a", "#8a8a52"];
      for (let k = 0; k < 1100; k++) {
        const gx = (r(k + 400) - 0.5) * FW * 1.94, gz = (r(k + 900) - 0.5) * FL * 1.94;
        if (Math.abs(gz) > 31 && Math.abs(gx) < 14.5) continue;
        const c = greens[k % greens.length], hgt = 0.18 + r(k + 1300) * 0.3;
        for (let j = 0; j < 3; j++) parts.push(box({ w: 0.05, h: hgt * (1 - j * 0.2), d: 0.05, color: c, offset: { x: gx + (j - 1) * 0.07, y: hgt * (1 - j * 0.2) / 2, z: gz + ((j * 37) % 3 - 1) * 0.06 } }));
      }
      // Tall grass in clumps, and grey rocks half sunk in it.
      for (let k = 0; k < 46; k++) {
        const cx = (r(k + 2400) - 0.5) * FW * 1.9, cz = (r(k + 2500) - 0.5) * FL * 1.6;
        if (Math.abs(cx) < 3.5 && Math.abs(cz) < 6) continue;
        for (let j = 0; j < 9; j++) {
          const hgt = 0.5 + r(k * 9 + j + 2600) * 0.45, ox = (r(k * 9 + j + 2700) - 0.5) * 1.1, oz = (r(k * 9 + j + 2800) - 0.5) * 1.1;
          parts.push(box({ w: 0.06, h: hgt, d: 0.06, color: j % 3 ? "#6a7f3e" : "#8f8a50", offset: { x: cx + ox, y: hgt / 2, z: cz + oz } }));
        }
      }
      for (let k = 0; k < 26; k++) {
        const rx = (r(k + 3000) - 0.5) * FW * 1.9, rz = (r(k + 3100) - 0.5) * FL * 1.7, sz = 0.35 + r(k + 3200) * 0.5;
        if (Math.abs(rx) < 3.5 && Math.abs(rz) < 6) continue;
        parts.push(bevelBox({ w: sz * 1.3, h: sz * 0.6, d: sz, color: k % 2 ? "#7a7880" : "#68666e", offset: { x: rx, y: sz * 0.25, z: rz } }));
      }
      // Bushes, dark and lumpy.
      for (let k = 0; k < 28; k++) {
        const bx = (r(k + 1700) - 0.5) * FW * 1.9, bz = (r(k + 1800) - 0.5) * FL * 1.7;
        if (Math.abs(bz) > 30 || (Math.abs(bx) < 4 && Math.abs(bz) < 5)) continue;
        parts.push(bevelBox({ w: 0.9, h: 0.6, d: 0.8, color: "#3c5a2c", offset: { x: bx, y: 0.3, z: bz } }), bevelBox({ w: 0.6, h: 0.45, d: 0.6, color: "#4a6a34", offset: { x: bx + 0.35, y: 0.55, z: bz - 0.2 } }));
      }
      // A worn stone path from each house's stairs to the mausoleum, and little white flowers on the graves.
      for (const s of [-1, 1]) for (let k = 0; k < 14; k++) parts.push(box({ w: 1.1 + r(k + s * 50) * 0.5, h: 0.05, d: 0.8, color: k % 2 ? "#8a8478" : "#77716a", offset: { x: Math.sin(k) * 0.4, y: 0.04, z: s * (27.6 - k * 1.7) } }));
      for (let k = 0; k < 60; k++) parts.push(box({ w: 0.07, h: 0.07, d: 0.07, color: k % 3 ? "#f2eee0" : "#c9a0e8", emissive: 0.2, offset: { x: (r(k + 2100) - 0.5) * 30, y: 0.12, z: (r(k + 2200) - 0.5) * 50 } }));
      // Jack-o'-lanterns, glowing, by the stairs and through the graveyard; lanterns on posts along the path.
      const lantern = (lx, lz) => parts.push(box({ w: 0.1, h: 1.8, d: 0.1, color: "#1c1a20", offset: { x: lx, y: 0.9, z: lz } }), box({ w: 0.28, h: 0.32, d: 0.28, color: "#ffcf7a", emissive: 1, offset: { x: lx, y: 1.95, z: lz } }), box({ w: 0.34, h: 0.06, d: 0.34, color: "#1c1a20", offset: { x: lx, y: 2.14, z: lz } }));
      const pumpkin = (px, pz, sz = 0.5) => {
        parts.push(bevelBox({ w: sz, h: sz * 0.8, d: sz, color: "#e8761c", offset: { x: px, y: sz * 0.4, z: pz } }), box({ w: 0.06, h: 0.14, d: 0.06, color: "#3e5a22", offset: { x: px, y: sz * 0.85, z: pz } }));
        parts.push(box({ w: sz * 0.5, h: sz * 0.12, d: 0.02, color: "#ffd84a", emissive: 1, offset: { x: px, y: sz * 0.32, z: pz + sz / 2 * Math.sign(-pz || 1) } }));
        for (const e of [-1, 1]) parts.push(box({ w: sz * 0.14, h: sz * 0.14, d: 0.02, color: "#ffd84a", emissive: 1, offset: { x: px + e * sz * 0.18, y: sz * 0.55, z: pz + sz / 2 * Math.sign(-pz || 1) } }));
      };
      for (const s of [-1, 1]) {
        pumpkin(-3.6, s * 28.2); pumpkin(3.6, s * 28.2, 0.6); pumpkin(-13, s * 19.5, 0.45); pumpkin(8, s * 12.8); pumpkin(17, s * 8, 0.65); pumpkin(-21, s * 30);
        lantern(-2.4, s * 22); lantern(2.4, s * 16); lantern(-2.4, s * 10); lantern(-15, s * 31.2); lantern(15, s * 31.2);
      }
      for (const d of M.decor) {
        if (d.kind !== "deadtree") continue;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + d.x, len = 1.2 + (k % 2) * 0.6, y = d.y - 0.6 - k * 0.7;
          parts.push(box({ w: 0.2, h: 0.2, d: len, color: "#2e2622", offset: { x: d.x + Math.sin(a) * len / 2, y, z: d.z + Math.cos(a) * len / 2 } }));
          parts.push(box({ w: 0.14, h: 0.6, d: 0.14, color: "#2e2622", offset: { x: d.x + Math.sin(a) * len, y: y + 0.3, z: d.z + Math.cos(a) * len } }));
        }
      }
    }
    if (town) {
      // Cobbled streets: a darker band down the middle and across the square.
      parts.push(box({ w: 18, h: 0.05, d: FL * 2 - 20, color: "#a89270", offset: { y: 0.03 } }));
      parts.push(box({ w: FW * 2, h: 0.05, d: 8, color: "#a89270", offset: { y: 0.035 } }));
    }
    for (const b of M.BLOCKS) {
      // The island's own rock (mounds, caves, outcrops) is the island's mesh (`isle`), not a building.
      if (M.rocks && M.rocks.has(b)) continue;
      const w = b[1] - b[0], d = b[3] - b[2], bottom = b[5] || 0, h = b[4] - bottom, x = (b[0] + b[1]) / 2, z = (b[2] + b[3]) / 2, y = bottom + h / 2;
      if (town && townBlock(parts, b, M.kinds.get(b), w, d, h, x, y, z, bottom)) continue;
      if (M.steps.has(b)) {
        // A stair: stone with a worn lip.
        parts.push(bevelBox({ w, h, d, color: "#8a8178", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.02, h: 0.05, d: 0.12, color: "#b0a698", offset: { x, y: b[4] - 0.02, z: z - d / 2 + 0.06 * Math.sign(z || 1) } }));
        continue;
      }
      if (haunted && hauntedBlock(parts, b, w, d, h, x, y, z, bottom)) continue;
      if (jungle && jungleBlock(parts, b, M.kinds.get(b), w, d, h, x, y, z, bottom)) continue;
      const fort = Math.abs(z) > 22 && Math.abs(z) < 34, team = z > 0 ? "blue" : "red";
      const post = w < 1 && d < 1, deck = b[4] === TOP, rail = bottom === TOP, roof = bottom > 4 && !deck && !rail, floor = bottom > 1.5 && h < 0.5 && !roof, hutWall = bottom > 1.5 && !floor && !roof;
      if (rail) {
        // A sniper tower's parapet: planks with a team-painted cap.
        parts.push(bevelBox({ w, h, d, color: "#8a6440", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.04, h: 0.12, d: d + 0.04, color: TEAM[team].paint, emissive: 0.2, offset: { x, y: b[4] + 0.06, z } }));
      } else if (roof) {
        // Thatch: a straw slab with a darker fringe.
        parts.push(bevelBox({ w, h, d, color: "#b8924a", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.1, h: 0.08, d: d + 0.1, color: "#8a6a32", offset: { x, y: bottom + 0.02, z } }));
      } else if (floor) {
        parts.push(bevelBox({ w, h, d, color: "#7a5232", offset: { x, y, z } }));
        for (let k = 1; k < Math.floor(w / 0.8); k++) parts.push(box({ w: 0.04, h: 0.02, d, color: "#5a3a22", offset: { x: b[0] + k * 0.8, y: b[4] + 0.005, z } }));
      } else if (hutWall) {
        parts.push(bevelBox({ w, h, d, color: "#9a7448", offset: { x, y, z } }));
      } else if (post) {
        parts.push(bevelBox({ w, h, d, color: "#5a3a22", offset: { x, y, z } }));
      } else if (fort) {
        parts.push(bevelBox({ w, h, d, color: "#8a8178", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.04, h: 0.18, d: d + 0.04, color: TEAM[team].paint, emissive: 0.15, offset: { x, y: b[4] + 0.09, z } }));
      } else if (h > 3) {
        // The tall walls that break the sight line, banded in orange.
        parts.push(bevelBox({ w, h, d, color: "#4a4440", offset: { x, y, z } }));
        parts.push(box({ w: w + 0.06, h: 0.3, d: d + 0.06, color: ORANGE, emissive: 0.8, offset: { x, y: b[4] - 0.6, z } }));
      } else {
        parts.push(bevelBox({ w, h, d, color: h > 1.5 ? "#7a6a58" : "#8a5a32", offset: { x, y, z } }));
        parts.push(box({ w: w * 0.7, h: 0.05, d: d + 0.02, color: "#5a3a22", offset: { x, y: bottom + h * 0.55, z } }));
      }
    }
    return merge(...parts);
  });
  // The campfire: a ring of stones, crossed logs and three tongues of flame (the scene flickers their node).
  const firePit = cached(() => {
    const parts = [];
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      parts.push(bevelBox({ w: 0.32, h: 0.24, d: 0.26, color: k % 2 ? "#6e6a66" : "#86817a", offset: { x: Math.sin(a) * 0.85, y: 0.12, z: Math.cos(a) * 0.85 } }));
    }
    for (const a of [0.3, 1.9, 3.5]) parts.push(turnedY(box({ w: 1.2, h: 0.16, d: 0.18, color: "#5a3a22", offset: { y: 0.12 } }), a));
    parts.push(box({ w: 0.9, h: 0.04, d: 0.9, color: "#ff6a1a", emissive: 1, offset: { y: 0.05 } }));
    return merge(...parts);
  });
  const flames = cached(() => {
    const geo = merge(
      lathe({ profile: [[0, 0], [0.42, 0.15], [0.3, 0.6], [0, 1.1]], segments: 7, color: "#ff7a1a", emissive: 1 }),
      moved(lathe({ profile: [[0, 0], [0.26, 0.12], [0.18, 0.45], [0, 0.8]], segments: 6, color: "#ffd24a", emissive: 1 }), 0.12, 0.05, 0.08),
      moved(lathe({ profile: [[0, 0], [0.2, 0.1], [0.12, 0.3], [0, 0.55]], segments: 6, color: "#fff3a0", emissive: 1 }), -0.1, 0.05, -0.06)
    );
    geo.castShadow = false;
    return geo;
  });
  // Ooga Town's own boxes, by what the map says each is (`kinds`): the banks in cream stone banded in their team's
  // colour under a stepped pediment with a clock stopped at noon, the red saloon and the teal general store with a
  // sign board over each front door, plank floors, steps and the footbridge, the market stalls under striped awnings,
  // the cart of banknotes, and the fountain with its gold coin. Plain boxes, a few trims each: nothing here is
  // bevelled, so the town draws in a fraction of the faces. False for anything else (the sniper towers and the wallet
  // machines), which is drawn as on the other maps.
  const TOWN = { stone: "#f1e6cc", plinth: "#6b6259", cream: "#fff3d6", timber: "#8a5a34", plank: "#a9743f", dark: "#3a2418", gold: "#f7b733", board: "#1f4a3a", saloon: "#b5442e", saloonDark: "#7c2c1e", store: "#2f8f83", storeDark: "#1d5f58" };
  const townBlock = (parts, b, kind, w, d, h, x, y, z, bottom) => {
    if (!kind) return false;
    const top = b[4], s = Math.sign(z) || 1, team = TEAM[s > 0 ? "blue" : "red"].paint, out = s > 0 ? b[2] : b[3];
    const put = (color, bw, bh, bd, bx, by, bz, emissive = 0) => parts.push(box({ w: bw, h: bh, d: bd, color, emissive, offset: { x: bx, y: by, z: bz } }));
    if (kind === "bank") {
      put(TOWN.stone, w, h, d, x, y, z);
      if (bottom === 0) put(TOWN.plinth, w + 0.04, 0.5, d + 0.04, x, 0.25, z);
      put(team, w + 0.04, 0.25, d + 0.04, x, top - 0.3, z, 0.15);
      // The front, either side of the doors: two pilasters each, standing a little proud of the wall.
      if (bottom === 0 && d === 1 && Math.abs(z) < 25) for (const px of [b[0] + 0.9, b[1] - 0.9]) put(TOWN.cream, 0.6, h - 0.5, 0.12, px, h / 2 + 0.25, out - s * 0.06);
    } else if (kind === "pediment") {
      put(TOWN.stone, w, h, d, x, y, z);
      put(team, w + 0.3, 0.14, d + 0.2, x, top + 0.07, z, 0.15);
      // The lower tier carries the name board; the upper one the clock, its hands together at noon.
      if (bottom < 3.5) put(TOWN.board, w - 0.5, 0.62, 0.06, x, y, out - s * 0.03);
      else {
        put(TOWN.gold, 0.72, 0.72, 0.06, x, y, out - s * 0.03, 0.2);
        put(TOWN.cream, 0.56, 0.56, 0.06, x, y, out - s * 0.05, 0.3);
        put(TOWN.dark, 0.05, 0.24, 0.06, x, y + 0.1, out - s * 0.07);
      }
    } else if (kind === "saloon" || kind === "store") {
      put(TOWN[kind], w, h, d, x, y, z);
      if (bottom === 0) put(TOWN[kind + "Dark"], w + 0.04, 0.4, d + 0.04, x, 0.2, z);
      put(TOWN.cream, w + 0.04, 0.14, d + 0.04, x, top - 0.07, z);
    } else if (kind === "saloonSign" || kind === "storeSign") {
      // The board over the front door, standing proud of the wall it shares, under a cream cornice.
      put(TOWN.dark, w, h, d + 0.08, x, y, z);
      put(TOWN.cream, w + 0.3, 0.16, d + 0.3, x, top + 0.08, z);
      put(TOWN[kind === "saloonSign" ? "saloon" : "store"], w + 0.1, 0.1, d + 0.12, x, bottom + 0.05, z);
    } else if (kind === "floor" || kind === "bridge") put(TOWN.plank, w, h, d, x, y, z);
    else if (kind === "rail" || kind === "bridgeRail") put(TOWN.cream, w, h, d, x, y, z);
    else if (kind === "step") put(Math.round(top * 7 / 3) % 2 ? TOWN.plank : TOWN.timber, w, h, d, x, y, z);
    else if (kind === "post") put(TOWN.timber, w, h, d, x, y, z);
    else if (kind === "stall") {
      // A counter with a paler top and three heaps of fruit on it.
      put(TOWN.timber, w, h - 0.08, d, x, (h - 0.08) / 2, z);
      put(TOWN.cream, w + 0.1, 0.08, d + 0.1, x, h - 0.04, z);
      ["#f7931a", "#ffd84a", "#d94a3a"].forEach((color, k) => put(color, 0.6, 0.22, 0.5, x + (k - 1) * 0.9, h + 0.11, z));
    } else if (kind === "awning") {
      // Five stripes on four thin posts.
      const stripe = x * s > 0 ? "#2f8f83" : "#f7931a";
      for (let k = 0; k < 5; k++) put(k % 2 ? TOWN.cream : stripe, w / 5, h, d, b[0] + (k + 0.5) * w / 5, y, z);
      for (const px of [b[0] + 0.1, b[1] - 0.1]) for (const pz of [b[2] + 0.1, b[3] - 0.1]) put(TOWN.dark, 0.08, bottom, 0.08, px, bottom / 2, pz);
    } else if (kind === "cart") {
      // A cart: a red bed on four wheels, a shaft, and bales of banknotes heaped to its top.
      put(TOWN.saloon, w, 0.6, d, x, 0.85, z);
      for (const wx of [-0.85, 0.85]) for (const wz of [-1, 1]) put(TOWN.dark, 0.7, 0.7, 0.12, x + wx, 0.35, z + wz * (d / 2 + 0.07));
      put(TOWN.timber, 1.3, 0.1, 0.12, x + Math.sign(x) * (w / 2 + 0.6), 0.6, z);
      put("#5d9a4e", w - 0.3, 0.3, d - 0.3, x, 1.3, z);
      put("#77b866", w - 1.1, 0.16, d - 0.6, x, 1.52, z);
    } else if (kind === "basin") {
      // The fountain's basin, brimming.
      put("#b9b2a6", w, h, d, x, y, z);
      put("#3fb6e0", w - 0.5, 0.04, d - 0.5, x, top + 0.005, z, 0.25);
    } else if (kind === "column") {
      put("#b9b2a6", w, h, d, x, y, z);
      put(TOWN.cream, w + 0.3, 0.2, d + 0.3, x, top - 0.1, z);
    } else if (kind === "coin") {
      // The gold coin: a disc on its edge across the street, a ₿ standing proud on both faces, each row's runs merged.
      const R = w / 2, u = 0.2;
      parts.push(moved(turnedX(lathe({ profile: [[0, -d / 2], [R, -d / 2], [R, d / 2], [0, d / 2]], segments: 16, color: TOWN.gold, emissive: 0.3 }), Math.PI / 2), x, y, z));
      parts.push(moved(turnedX(lathe({ profile: [[R - 0.16, d / 2], [R - 0.16, d / 2 + 0.03], [R - 0.3, d / 2 + 0.03], [R - 0.3, d / 2]], segments: 16, color: "#c9820f" }), Math.PI / 2), x, y, z));
      parts.push(moved(turnedX(lathe({ profile: [[R - 0.3, -d / 2], [R - 0.3, -d / 2 - 0.03], [R - 0.16, -d / 2 - 0.03], [R - 0.16, -d / 2]], segments: 16, color: "#c9820f" }), Math.PI / 2), x, y, z));
      for (const f of [1, -1]) for (let r = 0; r < GLYPH.length; r++) for (let c = 0, run = -1; c <= 7; c++) {
        const lit = GLYPH[r][c] === "#";
        if (lit && run < 0) run = c;
        else if (!lit && run >= 0) { put("#a35c08", (c - run) * u, u, 0.04, x - f * ((run + c) / 2 - 3.5) * u, y + (4 - r) * u, z + f * (d / 2 + 0.02)); run = -1; }
      }
    } else return false;
    return true;
  };
  // Ooga Town's letters, the jumbotron's 5 x 7 alphabet in flat pixels, each line's lit pixels merged into as few
  // rectangles as a greedy pass finds (a stroke is one quad, not seven): lines split by "|", centred at (x, y, z)
  // inside `w` by `h`, on a face looking out along `nx`, `nz` (one of them 1 or -1, the other 0), reading left to
  // right from in front of it.
  const lettering = (geo, text, x, y, z, w, h, nx, nz, color, emissive = 0) => {
    const glyphOf = BL.jumbotron.text.glyphOf, lines = text.split("|"), cols = Math.max(...lines.map((l) => l.length)) * 6 - 1, rows = lines.length * 9 - 2;
    const px = Math.min(w / cols, h / rows), rgb = hexToRgb(color), opts = { emissive }, ux = nz, uz = -nx, fx = x + nx * 0.035, fz = z + nz * 0.035;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li], lw = line.length * 6 - 1, lit = new Uint8Array(lw * 7);
      for (let r = 0; r < 7; r++) for (let c = 0; c < lw; c++) lit[r * lw + c] = c % 6 < 5 && (glyphOf(line[Math.floor(c / 6)])[r] >> (4 - c % 6)) & 1;
      for (let r = 0; r < 7; r++) for (let c = 0; c < lw; c++) {
        if (!lit[r * lw + c]) continue;
        let c1 = c, r1 = r + 1;
        while (c1 < lw && lit[r * lw + c1]) c1++;
        for (; r1 < 7; r1++) { let full = true; for (let k = c; k < c1; k++) if (!lit[r1 * lw + k]) { full = false; break; } if (!full) break; }
        for (let j = r; j < r1; j++) for (let k = c; k < c1; k++) lit[j * lw + k] = 0;
        const a = (c - lw / 2) * px, e = (c1 - lw / 2) * px, y1 = y + (rows / 2 - li * 9 - r) * px, y0 = y1 - (r1 - r) * px;
        face(geo, [pushVert(geo, fx + ux * a, y0, fz + uz * a), pushVert(geo, fx + ux * e, y0, fz + uz * e), pushVert(geo, fx + ux * e, y1, fz + uz * e), pushVert(geo, fx + ux * a, y1, fz + uz * a)], rgb, opts);
      }
    }
  };
  // Ooga Town's dressing, one merged mesh behind the Detail setting: the names and jokes on its boards (the banks, the
  // saloon and the store, both sides of the footbridge, over the hole where each bank's cash machine was, the fountain
  // and the cart), a wanted poster by each shop door, the saloon's swing doors and the store's awning. No lights and
  // nothing that moves.
  const TOWN_SIGNS = { bank: { blue: "BANK OF OOGA", red: "BOOGA RESERVE" }, saloon: "LAST HODL|SALOON", store: "GENERAL STORE|WE TAKE SATS", bridgeOut: "NO FIAT BEYOND THIS POINT", bridgeIn: "TICK TOCK NEXT BLOCK",
    atm: "ATM|OUT OF FIAT", fountain: "IN MATH WE TRUST", cart: "FIAT|1 SAT A TON", wanted: { saloon: "WANTED|PAPER|HANDS", store: "NO SATS|NO|SERVICE" } };
  const townDress = cached(() => {
    const M = SIM.ARENAS.town, parts = [], ink = geometry(), T = TOWN_SIGNS;
    const put = (color, w, h, d, x, y, z, emissive = 0) => parts.push(box({ w, h, d, color, emissive, offset: { x, y, z } }));
    for (const b of M.BLOCKS) {
      const kind = M.kinds.get(b);
      if (!kind) continue;
      const x = (b[0] + b[1]) / 2, z = (b[2] + b[3]) / 2, w = b[1] - b[0], s = Math.sign(z) || 1, out = s > 0 ? b[2] : b[3], bottom = b[5] || 0, y = (b[4] + bottom) / 2;
      if (kind === "pediment" && bottom < 3.5) lettering(ink, T.bank[s > 0 ? "blue" : "red"], x, y, out - s * 0.06, w - 1, 0.5, 0, -s, TOWN.gold, 0.35);
      else if (kind === "saloonSign" || kind === "storeSign") {
        // The door is under the board's street end; a poster on the wall beside it.
        const shop = kind === "saloonSign" ? "saloon" : "store", dir = -Math.sign(x), door = x + dir * 1.3, wall = x - dir * 0.9;
        lettering(ink, T[shop], x, (b[4] + 3) / 2, out - s * 0.04, w - 0.5, b[4] - 3.3, 0, -s, TOWN.gold, 0.35);
        put(TOWN.cream, 0.95, 1.2, 0.04, wall, 1.7, out - s * 0.02);
        lettering(ink, T.wanted[shop], wall, 1.7, out - s * 0.04, 0.8, 1.05, 0, -s, TOWN.dark);
        if (shop === "saloon") for (const e of [-1, 1]) put(TOWN.plank, 0.82, 0.9, 0.06, door + e * 0.46, 1.25, z);
        else for (let k = 0; k < 4; k++) put(k % 2 ? TOWN.cream : "#f7931a", 0.5, 0.08, 0.9, door + (k - 1.5) * 0.5, 2.36, out - s * 0.45);
      } else if (kind === "bridgeRail") {
        const outer = Math.abs(out) < 13;
        lettering(ink, outer ? T.bridgeOut : T.bridgeIn, x, y, outer ? out : (s > 0 ? b[3] : b[2]), w - 2, 0.5, 0, outer ? -s : s, TOWN.dark);
      } else if (kind === "bank" && bottom > 2 && w === 1 && Math.abs(x) > 8) {
        // Over the hole in the bank's side: what used to be there.
        const nx = Math.sign(x);
        put(TOWN.board, 0.05, 1.1, 1.8, x + nx * 0.52, y, z);
        lettering(ink, T.atm, x + nx * 0.53, y, z, 1.6, 0.9, nx, 0, TOWN.gold, 0.35);
      } else if (kind === "basin") for (const f of [1, -1]) lettering(ink, T.fountain, x, 0.42, z + f * 1.5, 2.6, 0.3, 0, f, TOWN.dark);
      else if (kind === "cart") for (const f of [1, -1]) lettering(ink, T.cart, x, 0.87, z + f * 0.7, 2.2, 0.5, 0, f, TOWN.cream);
    }
    return merge(...parts, ink);
  });
  // A potato Ooga that dances round the fire: an egg-shaped tan body speckled darker, a leopard-spot loincloth, two
  // stubby legs, two little arms (separate, so the scene waves them), big dark eyes and brows, and an open mouth.
  const potato = cached(() => {
    const parts = [lathe({ profile: [[0, 0.18], [0.36, 0.26], [0.5, 0.55], [0.52, 0.85], [0.44, 1.15], [0.26, 1.33], [0, 1.38]], segments: 10, color: "#c9a06a" })];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, y = 0.45 + (k % 4) * 0.22;
      parts.push(box({ w: 0.05, h: 0.05, d: 0.05, color: "#9a7448", offset: { x: Math.sin(a) * 0.5, y, z: Math.cos(a) * 0.5 } }));
    }
    parts.push(lathe({ profile: [[0.37, 0.2], [0.47, 0.28], [0.5, 0.42], [0.36, 0.42]], segments: 10, color: "#c8954a" }));
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63 + 0.2;
      parts.push(box({ w: 0.07, h: 0.06, d: 0.04, color: "#3a2614", offset: { x: Math.sin(a) * 0.49, y: 0.3 + (k % 2) * 0.07, z: Math.cos(a) * 0.49 } }));
    }
    for (const x of [-0.17, 0.17]) {
      parts.push(box({ w: 0.15, h: 0.24, d: 0.15, color: "#d8b07a", offset: { x, y: 0.1 } }));
      parts.push(box({ w: 0.1, h: 0.13, d: 0.04, color: "#1a1410", offset: { x, y: 0.95, z: 0.5 } }));
      parts.push(box({ w: 0.14, h: 0.04, d: 0.04, color: "#1a1410", offset: { x: x * 1.1, y: 1.1, z: 0.47 } }));
    }
    parts.push(box({ w: 0.14, h: 0.12, d: 0.04, color: "#5a1a14", offset: { y: 0.72, z: 0.52 } }));
    return merge(...parts);
  });
  const potatoArm = cached(() => merge(box({ w: 0.12, h: 0.32, d: 0.12, color: "#d8b07a", offset: { y: -0.14 } }), box({ w: 0.16, h: 0.12, d: 0.14, color: "#d8b07a", offset: { y: -0.3 } })));
  // A stand: a stepped stone plinth with its team's paint round the top, where the block sits.
  const stand = variants((i) => {
    const t = SIM.TEAMS[i];
    return merge(
      bevelBox({ w: 1.6, h: 0.3, d: 1.6, color: "#6e655c", offset: { y: 0.15 } }),
      bevelBox({ w: 1.1, h: 0.5, d: 1.1, color: "#8a8178", offset: { y: 0.55 } }),
      box({ w: 1.16, h: 0.08, d: 1.16, color: TEAM[t].paint, emissive: 0.5, offset: { y: 0.8 } })
    );
  });
  // The block: an orange cube with darker edges and a cream ₿ standing proud on four faces, lit from inside. It
  // centres on its own origin so it can turn and bob; `trim` is the team colour of the band round its middle.
  const SIZE = 0.62;
  const glyphFace = (parts, turn) => {
    const u = SIZE * 0.07, h = SIZE / 2 + 0.012;
    for (let r = 0; r < GLYPH.length; r++) for (let c = 0; c < GLYPH[r].length; c++) {
      if (GLYPH[r][c] !== "#") continue;
      // Negated so the glyph reads the right way round from outside each face.
      const lx = (3 - c) * u, ly = (4 - r) * u;
      const x = Math.cos(turn) * lx + Math.sin(turn) * h, z = -Math.sin(turn) * lx + Math.cos(turn) * h;
      parts.push(box({ w: Math.abs(Math.cos(turn)) > 0.5 ? u : 0.024, h: u, d: Math.abs(Math.cos(turn)) > 0.5 ? 0.024 : u, color: CREAM, emissive: 1, offset: { x, y: ly, z } }));
    }
  };
  // A team's block: a cube in its team's colour, glowing, with darker edges, a cream ₿ standing proud on four faces and
  // a band of Bitcoin orange round its foot, so the two sides' blocks never look alike.
  // The cube itself in any colours: the teams' blocks, and the trophy's golden one (`goldBlock`).
  const cube = (body, edge) => {
    const parts = [];
    parts.push(box({ w: SIZE, h: SIZE, d: SIZE, color: body, emissive: 0.85 }));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(box({ w: 0.06, h: SIZE + 0.02, d: 0.06, color: edge, emissive: 0.3, offset: { x: sx * SIZE / 2, z: sz * SIZE / 2 } }));
    for (const sy of [1, -1]) {
      parts.push(box({ w: SIZE + 0.02, h: 0.06, d: 0.06, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, z: SIZE / 2 } }));
      parts.push(box({ w: SIZE + 0.02, h: 0.06, d: 0.06, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, z: -SIZE / 2 } }));
      parts.push(box({ w: 0.06, h: 0.06, d: SIZE + 0.02, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, x: SIZE / 2 } }));
      parts.push(box({ w: 0.06, h: 0.06, d: SIZE + 0.02, color: edge, emissive: 0.3, offset: { y: sy * SIZE / 2, x: -SIZE / 2 } }));
    }
    for (let k = 0; k < 4; k++) glyphFace(parts, k * Math.PI / 2);
    parts.push(box({ w: SIZE + 0.05, h: 0.05, d: SIZE + 0.05, color: ORANGE, emissive: 0.8, offset: { y: -SIZE / 2 + 0.06 } }));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  };
  const block = variants((i) => cube(TEAM[SIM.TEAMS[i]].paint, TEAM[SIM.TEAMS[i]].deep));
  const goldBlock = cached(() => cube("#f2c230", "#b8901c"));
  // The trophy's sunburst: wedges round a hole, alternately the winning team's light colour and gold, glowing, in the xy
  // plane and seen from both sides, the scene turning it behind the winners.
  const trophyRays = variants((i) => {
    const geo = geometry(), N = 16, R = 6, IN = 1.1, HALF = Math.PI / N * 0.42, tones = [hexToRgb(TEAM[SIM.TEAMS[i]].light), hexToRgb("#ffe48a")];
    for (let k = 0; k < N; k++) {
      const a = k * Math.PI * 2 / N, rgb = tones[k & 1];
      const p = [pushVert(geo, Math.cos(a - HALF) * IN, Math.sin(a - HALF) * IN, 0), pushVert(geo, Math.cos(a - HALF) * R, Math.sin(a - HALF) * R, 0),
        pushVert(geo, Math.cos(a + HALF) * R, Math.sin(a + HALF) * R, 0), pushVert(geo, Math.cos(a + HALF) * IN, Math.sin(a + HALF) * IN, 0)];
      face(geo, p, rgb, { emissive: 1 });
      face(geo, [p[3], p[2], p[1], p[0]], rgb, { emissive: 1 });
    }
    geo.castShadow = false;
    return geo;
  });
  // The ring of ticks that spins round a dropped block so it is easy to find.
  const tick = cached(() => box({ w: 0.12, h: 0.04, d: 0.3, color: ORANGE, emissive: 1, offset: { z: 1.05 } }));
  // A paint ball, a small chunky cube in its team's colour.
  const ball = variants((i) => {
    const t = SIM.TEAMS[i], geo = merge(bevelBox({ w: 0.2, h: 0.2, d: 0.2, color: TEAM[t].paint, emissive: 0.7 }));
    geo.castShadow = false;
    return geo;
  });
  // A splat: a lumpy flat blot with drips, lying in the xz plane facing up; the scene turns and scales each.
  const splat = variants((i) => {
    const t = SIM.TEAMS[i % 2], geo = geometry(), rgb = hexToRgb(TEAM[t].paint), seed = 1 + i * 7;
    const blot = (cx, cz, r, n, j) => {
      const c = pushVert(geo, cx, 0, cz), ring = [];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, rr = r * (0.75 + 0.35 * Math.abs(Math.sin(a * (3 + j) + seed)));
        ring.push(pushVert(geo, cx + Math.sin(a) * rr, 0, cz + Math.cos(a) * rr));
      }
      for (let k = 0; k < n; k++) face(geo, [c, ring[k], ring[(k + 1) % n]], rgb, { emissive: 0.15 });
    };
    blot(0, 0, 0.45, 12, i % 3);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + seed, d = 0.55 + (k % 2) * 0.15;
      blot(Math.sin(a) * d, Math.cos(a) * d, 0.09 + (k % 3) * 0.03, 6, 0);
    }
    geo.castShadow = false;
    return geo;
  });
  // The ring under each Ooga's feet that says whose side they're on.
  const ring = variants((i) => {
    const t = SIM.TEAMS[i], parts = [];
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2;
      parts.push(moved(box({ w: 0.24, h: 0.03, d: 0.08, color: TEAM[t].paint, emissive: 0.8 }), Math.sin(a) * 0.55, 0.03, Math.cos(a) * 0.55));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A quiz pad: a dark plate with a grid of green Matrix glyph cells and a glowing rim, flush with the ground.
  const GREEN = "#3dff7a";
  const pad = cached(() => {
    const parts = [box({ w: 1.7, h: 0.05, d: 1.7, color: "#0b1a10", offset: { y: 0.03 } })];
    for (const s of [-1, 1]) {
      parts.push(box({ w: 1.8, h: 0.08, d: 0.08, color: GREEN, emissive: 1, offset: { y: 0.05, z: s * 0.86 } }));
      parts.push(box({ w: 0.08, h: 0.08, d: 1.8, color: GREEN, emissive: 1, offset: { y: 0.05, x: s * 0.86 } }));
    }
    // A scatter of lit cells, the same every build.
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      if ((i * 7 + j * 3) % 4 === 0) continue;
      parts.push(box({ w: 0.16, h: 0.02, d: (i + j) % 3 ? 0.16 : 0.08, color: (i + j) % 2 ? GREEN : "#b8ffcf", emissive: 0.9, offset: { x: (i - 2) * 0.3, y: 0.065, z: (j - 2) * 0.3 } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // The quiz bubble round a trapped Ooga: a cage of glowing green bars, eight round and two rings, with a question
  // mark over it.
  const bubble = cached(() => {
    const parts = [], R = 0.85, H = 2.3;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      parts.push(box({ w: 0.05, h: H, d: 0.05, color: GREEN, emissive: 1, offset: { x: Math.sin(a) * R, y: H / 2, z: Math.cos(a) * R } }));
    }
    for (const y of [0.08, H]) for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * Math.PI * 2;
      parts.push(moved(turnedY(box({ w: R * 0.4, h: 0.05, d: 0.05, color: GREEN, emissive: 1 }), a), Math.sin(a) * R * 0.98, y, Math.cos(a) * R * 0.98));
    }
    for (const [x, y] of [[-1, 4], [0, 5], [1, 4], [1, 3], [0, 2], [0, 0]]) parts.push(box({ w: 0.11, h: 0.11, d: 0.11, color: "#b8ffcf", emissive: 1, offset: { x: x * 0.11, y: H + 0.35 + y * 0.11 } }));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A net in flight: a square of green cords.
  const net = cached(() => {
    const parts = [], n = 4, s = 0.9;
    for (let k = 0; k <= n; k++) {
      const o = -s / 2 + k * s / n;
      parts.push(box({ w: s, h: 0.03, d: 0.03, color: "#7fe08a", emissive: 0.5, offset: { z: o } }));
      parts.push(box({ w: 0.03, h: 0.03, d: s, color: "#7fe08a", emissive: 0.5, offset: { x: o } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A net draped over a caught Ooga: cords down its sides and across its top.
  const draped = cached(() => {
    const parts = [], R = 0.5, H = 1.9;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      parts.push(box({ w: 0.03, h: H, d: 0.03, color: "#7fe08a", emissive: 0.4, offset: { x: Math.sin(a) * R, y: H / 2, z: Math.cos(a) * R } }));
    }
    for (const y of [0.5, 1.1, 1.7]) for (let k = 0; k < 10; k++) {
      const a = (k + 0.5) / 10 * Math.PI * 2;
      parts.push(moved(turnedY(box({ w: R * 0.65, h: 0.03, d: 0.03, color: "#7fe08a", emissive: 0.4 }), a), Math.sin(a) * R * 0.95, y, Math.cos(a) * R * 0.95));
    }
    parts.push(moved(merge(net()), 0, H, 0));
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // A rain streak, a thin pale bar.
  const streak = cached(() => {
    const geo = box({ w: 0.025, h: 0.5, d: 0.025, color: "#c8d8ff", emissive: 0.4 });
    geo.castShadow = false;
    return geo;
  });
  // The arsenal: every gun and held tool, the throws in flight, the monkey, the ammo box and the crate, each one merged
  // static mesh a team. The guns share a frame: the grip at the origin, the muzzle along +z, an Ooga's right toward -x.
  // The Ooga AK and the Golden AKs are Block Frenzy's own builds in the island rifle's frame and size (`gunGeometry`).
  const GUNS = ["paint", "grenade", "rocket", "net", "sniper", "gold", "ak", "hook"];
  const { gun, hookHead, rope, rocket, grenade, monkey, cache, crate } = (() => {
    const METAL = "#3f4048", DARK = "#25252b", STEEL = "#7b808c", BRIGHT = "#c9ced8", BORE = "#0c0c10", RUBBER = "#2c2c33";
    const WOOD = "#7d5230", WOOD_DK = "#5a3a20", BRASS = "#d8a838", COPPER = "#b5763a", LENS = "#bfe8ff", OLIVE = "#4b6a40", OLIVE_DK = "#38502f", CORD = "#7fe08a";
    const B = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => box({ w, h, d, color, emissive, offset: { x, y, z } });
    const V = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => bevelBox({ w, h, d, color, emissive, offset: { x, y, z } });
    // A box tipped `a` about x through its own middle (positive leans its top toward the muzzle), then set at (x, y, z).
    const T = (w, h, d, color, a, x = 0, y = 0, z = 0, emissive = 0) => moved(turnedX(box({ w, h, d, color, emissive }), a), x, y, z);
    // A raked pistol grip with a paler panel, and a trigger in its guard just ahead of it.
    const grip = (parts, color = DARK, panel = "#3a3a42", y = 0) => {
      parts.push(T(0.066, 0.2, 0.085, color, 0.24, 0, y - 0.085, -0.03), T(0.076, 0.1, 0.05, panel, 0.24, 0, y - 0.1, -0.034));
    };
    const guard = (parts, color = STEEL, y = 0, z = 0) => {
      parts.push(B(0.036, 0.012, 0.11, color, 0, y - 0.1, z + 0.065), B(0.036, 0.075, 0.012, color, 0, y - 0.065, z + 0.12), B(0.014, 0.045, 0.016, BRIGHT, 0, y - 0.05, z + 0.055));
    };

    // The paintball marker: a striped receiver with a top rail, a stepped barrel to a ported brake with a glowing tip, a
    // loader of paint with a window and a lid, a regulator grip in front and an air bottle canted up as its stock.
    const marker = (c) => {
      const parts = [];
      grip(parts); guard(parts);
      parts.push(V(0.1, 0.12, 0.38, METAL, 0, 0.04, 0.07), B(0.108, 0.034, 0.3, c.paint, 0, 0.05, 0.08, 0.35), B(0.05, 0.022, 0.3, DARK, 0, 0.109, 0.08));
      parts.push(B(0.076, 0.076, 0.05, STEEL, 0, 0.05, -0.14), B(0.032, 0.032, 0.04, CREAM, 0, 0.05, -0.18, 0.3));
      parts.push(B(0.056, 0.14, 0.06, DARK, 0, -0.085, 0.21), B(0.068, 0.03, 0.072, STEEL, 0, -0.16, 0.21));
      parts.push(B(0.068, 0.068, 0.14, DARK, 0, 0.05, 0.32), B(0.044, 0.044, 0.3, "#2e2e35", 0, 0.05, 0.53));
      parts.push(B(0.078, 0.078, 0.1, METAL, 0, 0.05, 0.71), B(0.09, 0.09, 0.026, c.paint, 0, 0.05, 0.768, 0.7), B(0.046, 0.046, 0.012, BORE, 0, 0.05, 0.784));
      for (const z of [0.685, 0.725]) parts.push(B(0.082, 0.02, 0.018, BORE, 0, 0.05, z));
      parts.push(B(0.06, 0.08, 0.06, DARK, 0, 0.14, 0.07), B(0.078, 0.024, 0.078, STEEL, 0, 0.158, 0.07));
      parts.push(V(0.2, 0.18, 0.3, c.paint, 0, 0.275, 0.05, 0.35), B(0.15, 0.12, 0.1, c.paint, 0, 0.26, 0.24, 0.35), B(0.208, 0.05, 0.15, c.light, 0, 0.285, 0.04, 0.3));
      parts.push(B(0.14, 0.03, 0.18, c.deep, 0, 0.378, 0.03), B(0.05, 0.022, 0.04, CREAM, 0, 0.392, -0.07));
      // The bottle: a valve at the grip's foot, the tank and its end cap, canted so its back rises to the shoulder.
      const tank = merge(B(0.06, 0.06, 0.08, STEEL, 0, 0, 0.19), V(0.125, 0.125, 0.3, c.deep, 0, 0, 0), B(0.132, 0.132, 0.035, c.light, 0, 0, -0.09, 0.3), B(0.07, 0.07, 0.03, STEEL, 0, 0, -0.16));
      parts.push(moved(turnedX(tank, 0.2), 0, -0.14, -0.27));
      return parts;
    };

    // Block Frenzy's own rifle in the island AK's frame and size (the hand on its grip, the muzzle where `MUZZLE` puts
    // the flash): a receiver under a paler cover, slotted wooden furniture, a gas tube, a hooded front sight, a stepped
    // brake and a curved magazine in ribbed segments. `p` is its palette.
    const AK = { metal: "#3c3d44", cover: "#565862", barrel: "#2b2b30", trim: "#2b2b30", wood: WOOD, slot: WOOD_DK, butt: "#2b2b30", mag: "#b4552a", rib: "#8a3d1c", glow: 0, rod: STEEL };
    const rifle = (p, band, bandGlow) => {
      const e = p.glow, parts = [];
      parts.push(B(0.1, 0.11, 0.42, p.metal, 0, 0.065, 0.14, e), B(0.086, 0.036, 0.36, p.cover, 0, 0.137, 0.12, e), B(0.104, 0.03, 0.1, BORE, 0, 0.1, 0.2), B(0.03, 0.02, 0.036, p.rod, -0.062, 0.1, 0.17));
      // The stock drops to a plated butt, a darker strut deepening it; the grip rakes back under the receiver.
      parts.push(T(0.074, 0.085, 0.32, p.wood, -0.14, 0, 0.056, -0.225), T(0.064, 0.05, 0.24, p.slot, -0.42, 0, -0.01, -0.27), B(0.082, 0.17, 0.03, p.butt, 0, 0.012, -0.392));
      parts.push(T(0.062, 0.18, 0.072, p.wood, 0.3, 0, -0.075, -0.035), T(0.07, 0.03, 0.08, p.slot, 0.3, 0, -0.158, -0.062));
      parts.push(B(0.036, 0.01, 0.105, p.trim, 0, -0.05, 0.065), B(0.036, 0.056, 0.01, p.trim, 0, -0.022, 0.118), B(0.012, 0.036, 0.014, p.rod, 0, -0.022, 0.05));
      // The handguard and its vents, the band of the team's paint round its front, the tube over the barrel.
      parts.push(B(0.094, 0.086, 0.24, p.wood, 0, 0.052, 0.47), B(0.07, 0.04, 0.2, p.wood, 0, 0.128, 0.455));
      for (let k = 0; k < 3; k++) parts.push(B(0.1, 0.018, 0.038, p.slot, 0, 0.06, 0.4 + k * 0.062));
      parts.push(B(0.104, 0.14, 0.04, band, 0, 0.079, 0.582, bandGlow));
      parts.push(B(0.036, 0.036, 0.36, p.barrel, 0, 0.063, 0.76, e), B(0.028, 0.028, 0.13, p.barrel, 0, 0.118, 0.64, e), B(0.042, 0.082, 0.036, p.trim, 0, 0.088, 0.71, e), B(0.012, 0.012, 0.26, p.rod, 0, 0.034, 0.74));
      parts.push(B(0.044, 0.03, 0.05, p.trim, 0, 0.165, 0.31, e));
      parts.push(B(0.04, 0.062, 0.036, p.trim, 0, 0.1, 0.86, e), B(0.01, 0.046, 0.03, p.trim, -0.02, 0.152, 0.86, e), B(0.01, 0.046, 0.03, p.trim, 0.02, 0.152, 0.86, e), B(0.008, 0.034, 0.012, p.rod, 0, 0.146, 0.86));
      parts.push(B(0.054, 0.054, 0.06, p.trim, 0, 0.063, 0.945, e), B(0.054, 0.022, 0.03, p.trim, 0, 0.047, 0.988, e));
      let y = 0.02, z = 0.2;
      for (let k = 0; k < 4; k++) {
        const a = -(0.1 + k * 0.17), len = 0.074, cy = y - Math.cos(a) * len / 2, cz = z - Math.sin(a) * len / 2;
        parts.push(T(0.06, len + 0.014, 0.09, p.mag, a, 0, cy, cz, e), T(0.066, 0.016, 0.096, p.rib, a, 0, cy - 0.012, cz, e));
        y -= Math.cos(a) * len; z -= Math.sin(a) * len;
      }
      return parts;
    };
    // The Golden AK, engraved: yellow gold over brown wood, a run of raised chasing along the receiver, rings on the
    // barrel and gold bands on the stock.
    const GOLD = "#edbd32", GOLD_DK = "#a87c14", GOLD_LT = "#ffe27a";
    const ENGRAVED = { metal: GOLD, cover: "#f8d458", barrel: "#f0c95a", trim: GOLD_DK, wood: "#4c2e1c", slot: "#2f1c10", butt: GOLD_DK, mag: GOLD, rib: GOLD_DK, glow: 0.12, rod: GOLD_LT };
    const goldRifle = () => {
      const parts = rifle(ENGRAVED, GOLD_LT, 0.8);
      for (const z of [0.655, 0.775, 0.815]) parts.push(B(0.046, 0.046, 0.018, GOLD_DK, 0, 0.063, z, 0.25));
      for (let k = 0; k < 6; k++) parts.push(B(0.106, 0.02, 0.024, GOLD_LT, 0, k % 2 ? 0.05 : 0.076, -0.03 + k * 0.045, 0.7));
      for (const z of [-0.13, -0.3]) parts.push(T(0.08, 0.094, 0.024, GOLD, -0.14, 0, 0.056 + (z + 0.225) * 0.14, z, 0.3));
      parts.push(B(0.098, 0.02, 0.2, GOLD_DK, 0, 0.016, 0.47, 0.25));
      return parts;
    };

    // The sniper rifle: a thumbhole stock with a cheek rest in the team's colour, a bolt with a ball knob, a boxed
    // magazine, a long barrel to a slotted brake, a big scope on rings with turrets and lit lenses, and a bipod down.
    const sniper = (c) => {
      const parts = [];
      grip(parts, DARK, WOOD_DK);
      parts.push(V(0.086, 0.1, 0.44, METAL, 0, 0.045, 0.24));
      parts.push(B(0.07, 0.066, 0.36, WOOD, 0, 0.052, -0.16), T(0.058, 0.042, 0.3, WOOD, 0.1, 0, -0.105, -0.2), B(0.076, 0.21, 0.036, RUBBER, 0, -0.015, -0.356), B(0.075, 0.03, 0.17, c.deep, 0, 0.098, -0.17));
      parts.push(B(0.06, 0.022, 0.024, STEEL, -0.06, 0.07, 0.1), B(0.038, 0.038, 0.038, BRIGHT, -0.1, 0.06, 0.1));
      parts.push(B(0.05, 0.08, 0.1, DARK, 0, -0.04, 0.21), B(0.034, 0.01, 0.1, STEEL, 0, -0.06, 0.07), B(0.012, 0.04, 0.014, BRIGHT, 0, -0.03, 0.06));
      parts.push(B(0.078, 0.06, 0.34, WOOD, 0, 0.02, 0.6), B(0.082, 0.064, 0.03, WOOD_DK, 0, 0.02, 0.775));
      parts.push(B(0.042, 0.042, 0.64, DARK, 0, 0.06, 0.76), B(0.014, 0.01, 0.3, STEEL, 0, 0.084, 0.92));
      parts.push(B(0.07, 0.064, 0.11, METAL, 0, 0.06, 1.13), B(0.076, 0.022, 0.02, BORE, 0, 0.06, 1.105), B(0.076, 0.022, 0.02, BORE, 0, 0.06, 1.15), B(0.03, 0.03, 0.01, BORE, 0, 0.06, 1.187));
      // The scope.
      parts.push(B(0.06, 0.06, 0.3, c.paint, 0, 0.178, 0.24, 0.3), B(0.092, 0.092, 0.12, DARK, 0, 0.178, 0.44), B(0.07, 0.07, 0.012, LENS, 0, 0.178, 0.503, 1));
      parts.push(B(0.078, 0.078, 0.08, DARK, 0, 0.178, 0.06), B(0.054, 0.054, 0.01, LENS, 0, 0.178, 0.017, 0.9));
      parts.push(B(0.04, 0.036, 0.04, STEEL, 0, 0.224, 0.26), B(0.036, 0.04, 0.04, STEEL, -0.046, 0.178, 0.26));
      for (const z of [0.15, 0.34]) parts.push(B(0.07, 0.08, 0.03, METAL, 0, 0.132, z));
      // The bipod: a hinge under the forend and two legs splayed out and forward on rubber feet.
      parts.push(B(0.06, 0.03, 0.04, METAL, 0, -0.022, 0.7));
      for (const s of [-1, 1]) {
        parts.push(moved(turnedX(turnedZ(box({ w: 0.022, h: 0.26, d: 0.022, color: STEEL, offset: { y: -0.13 } }), s * 0.4), -0.3), 0, -0.03, 0.7));
        parts.push(B(0.036, 0.02, 0.046, RUBBER, s * 0.101, -0.26, 0.772));
      }
      return parts;
    };

    // The net launcher: a breech on a gas bottle, a fat canister flaring to a banded mouth with the folded net showing
    // in its bore, a splayed tube at each corner with a weight in it, a carry handle and a gauge on its back.
    const netGun = (c) => {
      const parts = [], Y = 0.08;
      grip(parts); guard(parts);
      parts.push(V(0.16, 0.17, 0.3, METAL, 0, 0.07, -0.02), B(0.07, 0.07, 0.016, DARK, 0, 0.09, -0.174), B(0.046, 0.046, 0.02, CREAM, 0, 0.09, -0.176, 0.2), B(0.01, 0.024, 0.022, "#d8402a", 0.006, 0.096, -0.18, 0.4));
      parts.push(V(0.105, 0.105, 0.24, c.deep, 0, -0.07, -0.25), B(0.05, 0.05, 0.05, STEEL, 0, -0.07, -0.11), B(0.112, 0.112, 0.03, c.light, 0, -0.07, -0.33, 0.3));
      parts.push(V(0.3, 0.3, 0.27, OLIVE, 0, Y, 0.265), B(0.36, 0.36, 0.07, OLIVE_DK, 0, Y, 0.42), B(0.42, 0.42, 0.05, c.paint, 0, Y, 0.475, 0.45), B(0.34, 0.34, 0.02, BORE, 0, Y, 0.495));
      for (const k of [-1, 0, 1]) parts.push(B(0.34, 0.02, 0.014, CORD, 0, Y + k * 0.095, 0.508, 0.6), B(0.02, 0.34, 0.014, CORD, k * 0.095, Y, 0.508, 0.6));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const tube = merge(B(0.08, 0.08, 0.3, METAL), B(0.058, 0.058, 0.06, "#d9c08f", 0, 0, 0.17), B(0.09, 0.09, 0.03, DARK, 0, 0, 0.13));
        parts.push(moved(turnedY(turnedX(tube, -sy * 0.2), sx * 0.2), sx * 0.185, Y + sy * 0.185, 0.4));
      }
      parts.push(B(0.03, 0.07, 0.03, DARK, 0, 0.262, 0.17), B(0.03, 0.07, 0.03, DARK, 0, 0.262, 0.36), B(0.036, 0.03, 0.25, DARK, 0, 0.305, 0.265), B(0.05, 0.045, 0.03, c.paint, 0, 0.175, -0.12, 0.5));
      parts.push(B(0.06, 0.12, 0.07, DARK, 0, -0.125, 0.27));
      return parts;
    };

    // The grenade launcher: a fat drum between a wire stock and a short wide barrel, a ladder sight up on its rail.
    const thumper = (c) => {
      const parts = [];
      grip(parts); guard(parts, STEEL, 0, 0.02);
      parts.push(B(0.07, 0.1, 0.12, METAL, 0, 0.05, -0.08), B(0.03, 0.03, 0.22, METAL, 0, 0.075, -0.24), B(0.03, 0.03, 0.2, METAL, 0, -0.02, -0.25), B(0.064, 0.16, 0.036, RUBBER, 0, 0.03, -0.36));
      parts.push(V(0.21, 0.21, 0.2, c.deep, 0, 0.05, 0.09), B(0.216, 0.216, 0.026, DARK, 0, 0.05, 0.02), B(0.216, 0.216, 0.026, DARK, 0, 0.05, 0.16), B(0.222, 0.05, 0.1, c.paint, 0, 0.05, 0.09, 0.4));
      parts.push(B(0.14, 0.14, 0.3, "#55573f", 0, 0.075, 0.34), B(0.156, 0.156, 0.03, DARK, 0, 0.075, 0.25), B(0.16, 0.16, 0.04, c.paint, 0, 0.075, 0.48, 0.6), B(0.1, 0.1, 0.012, BORE, 0, 0.075, 0.502));
      parts.push(B(0.056, 0.12, 0.062, DARK, 0, -0.05, 0.36), B(0.066, 0.026, 0.072, STEEL, 0, -0.115, 0.36));
      parts.push(B(0.04, 0.02, 0.3, DARK, 0, 0.165, 0.22));
      for (const s of [-1, 1]) parts.push(B(0.008, 0.09, 0.012, CREAM, s * 0.022, 0.22, 0.3, 0.3));
      for (const y of [0.2, 0.232, 0.262]) parts.push(B(0.05, 0.008, 0.012, CREAM, 0, y, 0.3, 0.3));
      return parts;
    };

    // The rocket launcher, on the shoulder: a long tube with hazard bands, a flared mouth with the warhead stepping out
    // of it, a stepped venturi behind, a sight box with a lit lens, two grips on a rail and a shoulder pad.
    const bazooka = (c) => {
      const parts = [], Y = 0.04;
      parts.push(V(0.2, 0.2, 1.0, c.deep, 0, Y, 0.12));
      parts.push(B(0.25, 0.25, 0.1, c.paint, 0, Y, 0.64, 0.4), B(0.285, 0.285, 0.04, METAL, 0, Y, 0.705));
      parts.push(B(0.15, 0.15, 0.1, ORANGE, 0, Y, 0.765, 1), B(0.1, 0.1, 0.07, ORANGE, 0, Y, 0.845, 1), B(0.05, 0.05, 0.05, CREAM, 0, Y, 0.9, 0.8));
      parts.push(B(0.17, 0.17, 0.08, METAL, 0, Y, -0.41), B(0.24, 0.24, 0.07, METAL, 0, Y, -0.48), B(0.3, 0.3, 0.05, DARK, 0, Y, -0.535), B(0.2, 0.2, 0.012, BORE, 0, Y, -0.562));
      for (const z of [-0.3, -0.2]) parts.push(B(0.206, 0.206, 0.04, CREAM, 0, Y, z));
      parts.push(B(0.206, 0.206, 0.03, c.paint, 0, Y, 0.48, 0.4));
      parts.push(B(0.12, 0.05, 0.22, RUBBER, 0, -0.085, -0.2));
      parts.push(B(0.08, 0.04, 0.44, METAL, 0, -0.078, 0.19), T(0.066, 0.17, 0.085, DARK, 0.24, 0, -0.17, 0.03), B(0.056, 0.14, 0.062, DARK, 0, -0.165, 0.34));
      parts.push(B(0.036, 0.012, 0.11, STEEL, 0, -0.19, 0.12), B(0.014, 0.045, 0.016, BRIGHT, 0, -0.125, 0.105));
      parts.push(B(0.05, 0.05, 0.06, METAL, 0.05, 0.16, 0.25), B(0.07, 0.09, 0.17, DARK, 0.05, 0.215, 0.25), B(0.05, 0.06, 0.012, LENS, 0.05, 0.22, 0.34, 1), B(0.05, 0.06, 0.012, LENS, 0.05, 0.22, 0.16, 0.8));
      return parts;
    };

    // The grapple's head in voxels, in the frame of the one it replaces (its point along +z, the rope's eye behind): an
    // iron shaft wrapped in cord, four swept claws with pale barbed tips round a spike, and a ring for the line.
    const hookHead = cached(() => {
      const IRON = "#3d4048", CLAW = "#6f7684", TIP = "#d3d8e2", parts = [];
      parts.push(B(0.07, 0.07, 0.46, IRON, 0, 0, -0.17), B(0.12, 0.12, 0.08, "#2a2c33", 0, 0, 0.1), B(0.054, 0.054, 0.1, CLAW, 0, 0, 0.19), B(0.03, 0.03, 0.08, TIP, 0, 0, 0.27));
      for (const z of [-0.3, -0.22, -0.14]) parts.push(B(0.084, 0.084, 0.04, "#a8854a", 0, 0, z));
      parts.push(B(0.03, 0.12, 0.03, BRASS, 0, 0, -0.5), B(0.03, 0.03, 0.09, BRASS, 0, 0.045, -0.45), B(0.03, 0.03, 0.09, BRASS, 0, -0.045, -0.45));
      for (let k = 0; k < 4; k++) {
        const claw = merge(
          moved(turnedY(box({ w: 0.2, h: 0.056, d: 0.06, color: CLAW }), -0.6), 0.09, 0, 0.16),
          moved(turnedY(box({ w: 0.18, h: 0.05, d: 0.056, color: CLAW }), 0.9), 0.215, 0, 0.165),
          moved(turnedY(box({ w: 0.1, h: 0.034, d: 0.036, color: TIP }), 1.15), 0.285, 0, 0.06)
        );
        parts.push(turnedZ(claw, k * Math.PI / 2));
      }
      const hook = merge(...parts);
      for (const f of hook.faces) f.emissive = Math.max(f.emissive || 0, 0.22);
      hook.castShadow = false;
      return hook;
    });
    // The rope: two strands laid side by side, a unit long along +z for the scene to stretch.
    const rope = cached(() => {
      const line = merge(B(0.052, 0.052, 1, "#b8935a", -0.018, 0.018, 0.5, 0.35), B(0.052, 0.052, 1, "#7a5f38", 0.018, -0.018, 0.5, 0.35));
      line.castShadow = false;
      return line;
    });

    // The hook launcher, the grappling hook's gun in the hand: a stubby harpoon gun with a reel of line
    // under it, two short bow limbs swept back from its mouth and the hook's own head seated in the barrel.
    const hookGun = (c) => {
      const parts = [];
      grip(parts); guard(parts);
      parts.push(V(0.1, 0.12, 0.36, METAL, 0, 0.04, 0.07), B(0.076, 0.076, 0.05, STEEL, 0, 0.05, -0.13), B(0.05, 0.022, 0.26, DARK, 0, 0.109, 0.06), B(0.016, 0.03, 0.02, c.paint, 0, 0.13, -0.05, 0.6));
      parts.push(B(0.12, 0.15, 0.15, "#b8935a", 0, -0.07, 0.22), B(0.02, 0.18, 0.18, DARK, -0.07, -0.07, 0.22), B(0.02, 0.18, 0.18, DARK, 0.07, -0.07, 0.22), B(0.126, 0.03, 0.156, "#8a6c3e", 0, -0.07, 0.22), B(0.17, 0.04, 0.04, STEEL, 0, -0.07, 0.22));
      parts.push(B(0.075, 0.075, 0.2, DARK, 0, 0.05, 0.34), B(0.09, 0.09, 0.035, c.paint, 0, 0.05, 0.43, 0.5));
      for (const s of [-1, 1]) parts.push(moved(turnedY(B(0.22, 0.036, 0.044, STEEL, s * 0.11, 0, 0), s * 0.55), 0, 0.05, 0.41), moved(turnedY(B(0.05, 0.05, 0.056, c.paint, s * 0.235, 0, 0, 0.4), s * 0.55), 0, 0.05, 0.41));
      const head = merge(hookHead());
      for (let i = 0; i < head.verts.length; i++) head.verts[i] *= 0.6;
      parts.push(moved(head, 0, 0.05, 0.56));
      return parts;
    };

    const gunParts = (kind, c) => kind === "paint" ? marker(c) : kind === "grenade" ? thumper(c) : kind === "rocket" ? bazooka(c) : kind === "net" ? netGun(c)
      : kind === "ak" ? rifle(AK, c.paint, 0.4) : kind === "gold" ? goldRifle() : kind === "hook" ? hookGun(c) : sniper(c);
    // `gun(index * 2 + team)`, the index into `GUNS`.
    const gun = variants((i) => merge(...gunParts(GUNS[i >> 1], TEAM[SIM.TEAMS[i & 1]])));

    // Throws in flight. The rocket: a stepped nose, a banded body in team paint, swept fins and a lit exhaust.
    const rocket = variants((i) => {
      const c = TEAM[SIM.TEAMS[i]];
      const geo = merge(
        B(0.2, 0.2, 0.5, c.paint, 0, 0, 0, 0.5), B(0.206, 0.206, 0.06, CREAM, 0, 0, 0.13, 0.5), B(0.206, 0.206, 0.03, c.deep, 0, 0, -0.12),
        B(0.16, 0.16, 0.12, "#f3efe4", 0, 0, 0.31, 0.5), B(0.11, 0.11, 0.1, ORANGE, 0, 0, 0.42, 0.9), B(0.05, 0.05, 0.07, CREAM, 0, 0, 0.5, 0.8),
        B(0.48, 0.036, 0.13, c.deep, 0, 0, -0.27), B(0.32, 0.036, 0.1, c.deep, 0, 0, -0.155), B(0.036, 0.48, 0.13, c.deep, 0, 0, -0.27), B(0.036, 0.32, 0.1, c.deep, 0, 0, -0.155),
        B(0.14, 0.14, 0.08, METAL, 0, 0, -0.29), B(0.12, 0.12, 0.2, ORANGE, 0, 0, -0.43, 1), B(0.06, 0.06, 0.3, "#fff3a0", 0, 0, -0.47, 1)
      );
      geo.castShadow = false;
      return geo;
    });
    // The grenade: a banded ball in team paint under a fuse cap, its lever and a pin ring.
    const grenade = variants((i) => {
      const c = TEAM[SIM.TEAMS[i]];
      const geo = merge(V(0.3, 0.3, 0.3, c.paint, 0, 0, 0, 0.6), B(0.312, 0.06, 0.312, c.light, 0, 0, 0, 0.8), B(0.06, 0.312, 0.312, c.deep, 0, 0, 0, 0.3),
        B(0.12, 0.07, 0.12, METAL, 0, 0.18, 0), B(0.04, 0.03, 0.2, STEEL, 0, 0.225, 0.04), B(0.03, 0.09, 0.09, CREAM, 0.085, 0.2, 0, 0.5));
      geo.castShadow = false;
      return geo;
    });

    // The monkey at an Ooga's hip: a body on two feet, a head with a tan face, a snout, a scowl and round ears, an
    // orange headband with its tails, a curled tail and a little launcher up on its shoulder.
    const monkey = cached(() => {
      const FUR = "#6e4429", FUR_DK = "#523220", TAN = "#d8a878", SNOUT = "#ecc79c", EYE = "#140c08", parts = [];
      for (const s of [-1, 1]) parts.push(B(0.09, 0.11, 0.1, FUR_DK, s * 0.07, 0.055, 0), B(0.09, 0.03, 0.08, TAN, s * 0.07, 0.015, 0.07), B(0.055, 0.1, 0.055, "#a8704a", s * 0.155, 0.45, 0), B(0.042, 0.046, 0.02, EYE, s * 0.052, 0.446, 0.136));
      parts.push(V(0.24, 0.22, 0.2, FUR, 0, 0.2, 0), B(0.14, 0.14, 0.02, TAN, 0, 0.19, 0.102));
      parts.push(V(0.26, 0.22, 0.22, FUR, 0, 0.43, 0.01), B(0.19, 0.14, 0.03, TAN, 0, 0.415, 0.118), B(0.11, 0.075, 0.05, SNOUT, 0, 0.378, 0.15), B(0.034, 0.02, 0.012, EYE, 0, 0.4, 0.178), B(0.17, 0.022, 0.034, FUR_DK, 0, 0.474, 0.128));
      parts.push(B(0.268, 0.034, 0.228, "#e2571c", 0, 0.5, 0.01, 0.1), B(0.04, 0.03, 0.1, "#e2571c", 0.05, 0.49, -0.15, 0.1), B(0.04, 0.03, 0.08, "#e2571c", -0.03, 0.475, -0.15, 0.1));
      parts.push(B(0.046, 0.046, 0.2, FUR, 0, 0.1, -0.19), B(0.046, 0.17, 0.046, FUR, 0, 0.2, -0.3), B(0.046, 0.046, 0.08, FUR, 0, 0.29, -0.27));
      parts.push(B(0.07, 0.17, 0.07, FUR, -0.155, 0.2, 0.02), B(0.07, 0.07, 0.17, FUR, 0.155, 0.27, 0.07));
      parts.push(B(0.085, 0.085, 0.34, "#4a4b54", 0.165, 0.345, 0.06), B(0.1, 0.1, 0.04, ORANGE, 0.165, 0.345, 0.215, 0.3), B(0.05, 0.05, 0.05, ORANGE, 0.165, 0.345, 0.26, 1), B(0.105, 0.105, 0.03, DARK, 0.165, 0.345, -0.115));
      return merge(...parts);
    });

    // The ammo box: the steel can with strapped corners, loop handles, latches and a stencil, its lid up on its hinges
    // with a lit strip inside and rounds standing in it while it's ready; shut and grey while
    // it refills.
    const cache = variants((i) => {
      const ready = i === 0, can = ready ? "#566238" : "#4a4844", edge = ready ? "#3c4627" : "#3a3936", metal = ready ? "#b0ab94" : "#6a6660", mark = ready ? "#e2cd6c" : "#5a5852";
      const parts = [V(0.86, 0.42, 0.5, can, 0, 0.21, 0)];
      for (const x of [-0.41, 0.41]) for (const z of [-0.23, 0.23]) parts.push(B(0.07, 0.43, 0.07, edge, x, 0.215, z));
      for (const z of [-0.255, 0.255]) parts.push(B(0.5, 0.1, 0.02, mark, 0, 0.24, z, ready ? 0.3 : 0));
      for (const x of [-0.1, 0.1]) parts.push(B(0.03, 0.11, 0.03, edge, x, 0.24, 0.258));
      for (const x of [-0.45, 0.45]) parts.push(B(0.03, 0.03, 0.22, metal, x * 1.02, 0.33, 0), B(0.04, 0.07, 0.03, metal, x, 0.3, -0.1), B(0.04, 0.07, 0.03, metal, x, 0.3, 0.1));
      for (const x of [-0.3, 0.3]) parts.push(B(0.08, 0.12, 0.03, metal, x, 0.37, 0.262), B(0.05, 0.03, 0.036, ready ? ORANGE : edge, x, 0.34, 0.264, ready ? 0.9 : 0));
      if (ready) {
        parts.push(B(0.78, 0.03, 0.42, "#20231a", 0, 0.425, 0));
        for (let k = 0; k < 7; k++) {
          const x = (k - 3) * 0.105, up = k % 2 ? 0.02 : 0;
          parts.push(B(0.07, 0.13, 0.07, BRASS, x, 0.5 + up, 0.0, 0.45), B(0.05, 0.05, 0.05, COPPER, x, 0.59 + up, 0.0, 0.3));
        }
        parts.push(V(0.86, 0.36, 0.06, edge, 0, 0.61, -0.26), B(0.6, 0.05, 0.02, ORANGE, 0, 0.66, -0.225, 1), B(0.7, 0.2, 0.014, can, 0, 0.56, -0.228));
        for (const x of [-0.25, 0.25]) parts.push(B(0.1, 0.05, 0.05, metal, x, 0.43, -0.265));
      } else parts.push(V(0.88, 0.07, 0.52, edge, 0, 0.45, 0), B(0.3, 0.03, 0.08, metal, 0, 0.495, 0));
      return merge(...parts);
    });

    // A pushable crate: planks framed by corner posts and rims, a brace across each side and a band and lid in its
    // team's paint, centred on its foot.
    const crate = variants((i) => {
      const c = TEAM[SIM.TEAMS[i]], h = SIM.CONFIG.CRATE_H, w = SIM.CONFIG.CRATE_HALF * 2, r = w / 2 - 0.04, POST = "#5a3a22", RIM = "#6e4a2a";
      const parts = [V(w, h, w, "#a06e3c", 0, h / 2, 0)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(B(0.11, h + 0.01, 0.11, POST, sx * r, h / 2, sz * r));
      for (const y of [0.055, h - 0.055]) for (const s of [-1, 1]) parts.push(B(w - 0.1, 0.1, 0.09, RIM, 0, y, s * r), B(0.09, 0.1, w - 0.1, RIM, s * r, y, 0));
      const run = w - 0.2, rise = h - 0.22, a = Math.atan2(rise, run), len = Math.hypot(run, rise);
      for (const s of [-1, 1]) {
        parts.push(moved(turnedZ(box({ w: len, h: 0.08, d: 0.04, color: RIM }), s * a), 0, h / 2, s * (w / 2 + 0.005)));
        parts.push(moved(turnedX(box({ w: 0.04, h: 0.08, d: len, color: RIM }), s * a), s * (w / 2 + 0.005), h / 2, 0));
      }
      parts.push(B(w + 0.03, 0.1, w + 0.03, c.paint, 0, h - 0.2, 0, 0.2), B(w - 0.24, 0.03, w - 0.24, c.paint, 0, h + 0.005, 0, 0.2));
      return merge(...parts);
    });
    return { gun, hookHead, rope, rocket, grenade, monkey, cache, crate };
  })();
  const GOLD = "#f2c230", METAL = "#3a3a40", DARK = "#24242a";
  // A tower's ladder: two rails and rungs up the gap side to the platform, in the tower's own frame (+x away from it).
  const ladder = cached(() => {
    const parts = [], z0 = -0.5, z1 = 0.5;
    for (const z of [z0, z1]) parts.push(box({ w: 0.08, h: TOP + 0.9, d: 0.08, color: "#5a3a22", offset: { y: (TOP + 0.9) / 2, z } }));
    for (let y = 0.35; y < TOP; y += 0.4) parts.push(box({ w: 0.06, h: 0.06, d: z1 - z0, color: "#8a6440", offset: { y, z: 0 } }));
    return merge(...parts);
  });
  // The rifle rack on a tower's platform: a low crossbar with a rifle on it.
  const rack = variants((i) => merge(
    box({ w: 0.08, h: 0.7, d: 0.08, color: "#5a3a22", offset: { x: -0.35, y: 0.35 } }), box({ w: 0.08, h: 0.7, d: 0.08, color: "#5a3a22", offset: { x: 0.35, y: 0.35 } }),
    box({ w: 0.8, h: 0.06, d: 0.1, color: "#8a6440", offset: { y: 0.6 } }),
    moved(turnedY(merge(gun(8 + i)), Math.PI / 2), 0, 0.7, 0)
  ));
  // A zipline: a cable sagging a little between its anchors, in the team's colour, and a pole at the low end.
  const zipline = variants((k) => {
    // Keyed by map and side: map index times two, plus the side.
    const i = k & 1, z = SIM.ARENAS[SIM.MAPS[k >> 1]].zips[SIM.TEAMS[i]], c = TEAM[SIM.TEAMS[i]];
    const cable = tube({ path: (t) => ({ x: z.ax + (z.bx - z.ax) * t, y: z.ay + (z.by - z.ay) * t + 0.15, z: z.az + (z.bz - z.az) * t }), radius: () => 0.04, rings: 24, segments: 4, colorFn: () => c.light, emissive: 0.5 });
    return merge(cable,
      box({ w: 0.16, h: z.by + 0.4, d: 0.16, color: "#5a3a22", offset: { x: z.bx, y: (z.by + 0.4) / 2, z: z.bz } }),
      box({ w: 0.3, h: 0.3, d: 0.3, color: c.paint, emissive: 0.6, offset: { x: z.ax, y: z.ay + 0.15, z: z.az } }));
  });
  // The lamp on a zipline's handle, from the visitor's side: green (0) when they may ride it, red (1) when grabbing it
  // would spring its trap door (`blockSim.zipSprings`).
  // On a short dark stalk, so it reads apart from the handle's team colour.
  const zipLight = variants((i) => merge(box({ w: 0.06, h: 0.3, d: 0.06, color: DARK, offset: { y: 0.15 } }), box({ w: 0.22, h: 0.22, d: 0.22, color: i ? "#ff3b30" : "#34e05a", emissive: 1, offset: { y: 0.41 } })));
  // A rider's trolley: a pulley block on the cable with a hand bar under it.
  const trolley = cached(() => merge(box({ w: 0.14, h: 0.18, d: 0.3, color: METAL, offset: { y: 0.1 } }), box({ w: 0.6, h: 0.05, d: 0.05, color: DARK, offset: { y: -0.15 } }), box({ w: 0.04, h: 0.3, d: 0.04, color: DARK, offset: { y: 0 } })));
  // A trampoline flush with the ground: a dark frame ring on stubby legs, springs, and an orange-and-black mat.
  const tramp = cached(() => {
    const parts = [], R = SIM.CONFIG.TRAMP_R + 0.15, n = 16;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, x = Math.sin(a), z = Math.cos(a);
      parts.push(box({ w: 0.42, h: 0.14, d: 0.16, color: "#2a2a30", offset: { x: x * R, y: 0.07, z: z * R } }));
      parts.push(box({ w: 0.05, h: 0.05, d: 0.2, color: "#c9ced6", offset: { x: x * (R - 0.15), y: 0.12, z: z * (R - 0.15) } }));
    }
    // The mat: rings of black and orange.
    for (let k = 0; k < 4; k++) {
      const r = SIM.CONFIG.TRAMP_R * (1 - k * 0.24);
      parts.push(box({ w: r * 1.7, h: 0.03, d: r * 1.7, color: k % 2 ? ORANGE : "#18181c", emissive: k % 2 ? 0.5 : 0, offset: { y: 0.1 + k * 0.004 } }));
    }
    return merge(...parts);
  });
  // The power-ups, each a floating glowing token over a little plinth: a lightning bolt (boots), a coin cut in half
  // (the halving), an ice cube (cold storage) and a visor with two red eyes (laser eyes); and the ice over a frozen
  // block.
  const power = variants((i) => {
    const parts = [box({ w: 0.7, h: 0.12, d: 0.7, color: "#3a3430", offset: { y: 0.06 } })], y = 1.1;
    if (i === 0) {
      for (const [x, yy, w, h] of [[0.08, 0.22, 0.14, 0.3], [-0.02, 0.02, 0.26, 0.1], [-0.1, -0.2, 0.14, 0.3]]) parts.push(box({ w, h, d: 0.1, color: "#ffe14a", emissive: 1, offset: { x, y: y + yy } }));
    } else if (i === 1) {
      parts.push(box({ w: 0.24, h: 0.56, d: 0.1, color: ORANGE, emissive: 0.9, offset: { x: -0.16, y } }));
      parts.push(box({ w: 0.24, h: 0.56, d: 0.1, color: "#c9ced6", emissive: 0.5, offset: { x: 0.16, y: y - 0.12 } }));
    } else if (i === 2) {
      parts.push(bevelBox({ w: 0.5, h: 0.5, d: 0.5, color: "#bfe8ff", emissive: 0.7, offset: { y } }));
      parts.push(box({ w: 0.3, h: 0.06, d: 0.52, color: "#ffffff", emissive: 1, offset: { y: y + 0.1 } }));
    } else if (i === 4) {
      parts.push(moved(monkey(), 0, y - 0.35, 0));
    } else {
      parts.push(box({ w: 0.6, h: 0.18, d: 0.14, color: "#24242a", offset: { y } }));
      for (const x of [-0.15, 0.15]) parts.push(box({ w: 0.14, h: 0.1, d: 0.16, color: "#ff2a1a", emissive: 1, offset: { x, y } }));
    }
    return merge(...parts);
  });
  const ice = cached(() => {
    const geo = merge(bevelBox({ w: 1.25, h: 1.25, d: 1.25, color: "#bfe8ff", emissive: 0.35 }), box({ w: 1.27, h: 0.08, d: 1.27, color: "#ffffff", emissive: 0.8, offset: { y: 0.3 } }));
    geo.castShadow = false;
    return geo;
  });
  // Bananas: one to hold (a curved run of yellow segments, a brown tip), a heap of them by the fire, and a peel lying
  // flat, its four flaps splayed.
  const BANANA = "#ffd23a", BANANA_DK = "#e0a81c";
  const banana = cached(() => {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.28;
      parts.push(box({ w: 0.09, h: 0.09, d: 0.1, color: k % 2 ? BANANA : BANANA_DK, offset: { y: Math.cos(a) * 0.32 - 0.32, z: Math.sin(a) * 0.32 } }));
    }
    parts.push(box({ w: 0.05, h: 0.05, d: 0.05, color: "#5a3a22", offset: { y: Math.cos(0.56) * 0.32 - 0.32, z: Math.sin(0.62) * 0.32 + 0.04 } }));
    return merge(...parts);
  });
  const bananaPile = cached(() => {
    const parts = [];
    for (let k = 0; k < 9; k++) {
      const a = k * 2.3, r = k < 5 ? 0.35 : 0.15;
      parts.push(moved(turnedY(banana(), a), Math.sin(a) * r, 0.36 + (k < 5 ? 0 : 0.12), Math.cos(a) * r));
    }
    return merge(...parts);
  });
  // A banana peel: a curved stem and four yellow strips drooping out from it to brown tips.
  const peel = cached(() => {
    const parts = [box({ w: 0.08, h: 0.16, d: 0.08, color: BANANA_DK, offset: { y: 0.3 } }), box({ w: 0.07, h: 0.08, d: 0.07, color: "#5a3a22", offset: { x: 0.04, y: 0.4 } })];
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4;
      for (let s = 0; s < 6; s++) {
        const r = 0.05 + s * 0.085, y = 0.26 - s * 0.05 - s * s * 0.007;
        parts.push(turnedY(box({ w: 0.12 - s * 0.012, h: 0.035, d: 0.11, color: s === 5 ? "#5a3a22" : k % 2 ? BANANA : "#f2c62e", offset: { y: Math.max(0.02, y), z: r } }), a));
      }
    }
    return merge(...parts);
  });
  // An AK's muzzle flash, the island rifle's (crew.js `GUN_FLASH`): a bright cross with a white-hot middle.
  const muzzleFlash = cached(() => { const geo = merge(box({ w: 0.12, h: 0.035, d: 0.07, color: "#ffd94a", emissive: 1 }), box({ w: 0.035, h: 0.12, d: 0.07, color: "#ffd94a", emissive: 1 }), box({ w: 0.05, h: 0.05, d: 0.08, color: "#fff4c4", emissive: 1 })); geo.castShadow = false; return geo; });
  // A ball of gold paint, for the Golden AK.
  const goldBall = cached(() => { const geo = bevelBox({ w: 0.22, h: 0.22, d: 0.22, color: GOLD, emissive: 0.9 }); geo.castShadow = false; return geo; });
  // A catapult in its team's colours, in its own frame throwing toward +z: a timber base on wheels with two uprights
  // and a crossbar (`catapult`), and its throwing arm with a bucket (`catapultArm`), pivoting at its foot so the scene
  // can swing it.
  const catapult = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (const x of [-0.7, 0.7]) {
      parts.push(bevelBox({ w: 0.2, h: 0.24, d: 2.2, color: "#6a4a2a", offset: { x, y: 0.3 } }));
      for (const z of [-0.8, 0.8]) parts.push(bevelBox({ w: 0.14, h: 0.5, d: 0.5, color: "#3a2a1a", offset: { x: x * 1.15, y: 0.25, z } }));
      parts.push(bevelBox({ w: 0.16, h: 1.4, d: 0.16, color: "#6a4a2a", offset: { x, y: 1.0, z: 0.25 } }));
    }
    parts.push(bevelBox({ w: 1.6, h: 0.2, d: 0.2, color: c.deep, offset: { y: 1.6, z: 0.25 } }));
    parts.push(box({ w: 1.6, h: 0.16, d: 0.16, color: "#6a4a2a", offset: { y: 0.35, z: -0.85 } }));
    // A pad to stand on, painted in the team's colour so it reads as the way in.
    parts.push(box({ w: 1.5, h: 0.05, d: 1.5, color: c.paint, emissive: 0.35, offset: { y: 0.03, z: -1.6 } }));
    return merge(...parts);
  });
  const catapultArm = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]];
    return merge(
      bevelBox({ w: 0.16, h: 0.16, d: 2.1, color: "#8a6440", offset: { z: -1.0 } }),
      bevelBox({ w: 0.6, h: 0.18, d: 0.6, color: c.paint, emissive: 0.2, offset: { y: 0.1, z: -2.1 } }),
      box({ w: 0.66, h: 0.2, d: 0.08, color: "#5a3a22", offset: { y: 0.2, z: -2.4 } })
    );
  });
  // A parachute: a domed canopy in panels of the team's colour and cream, and four cords down to the shoulders.
  const chute = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      parts.push(turnedY(box({ w: 0.95, h: 0.12, d: 0.7, color: k % 2 ? c.paint : "#fff3d6", emissive: 0.15, offset: { y: 3.2, z: 0.85 } }), a));
      parts.push(turnedY(box({ w: 0.7, h: 0.1, d: 0.5, color: k % 2 ? c.light : c.paint, offset: { y: 3.45, z: 0.35 } }), a));
    }
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
      const n = 6;
      for (let k = 0; k < n; k++) parts.push(box({ w: 0.03, h: 0.32, d: 0.03, color: "#ddd2b8", offset: { x: x * (0.25 + 0.75 * k / n), y: 1.7 + k * 0.25, z: z * (0.25 + 0.75 * k / n) } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // The jetpack every Ooga wears, in its own frame on the Ooga's back (+z forward): two team-banded tanks with a
  // strap between and a nozzle under each, and the flames that burn under the nozzles while it thrusts.
  const jetpack = variants((i) => {
    const c = TEAM[SIM.TEAMS[i]], parts = [];
    for (const x of [-0.13, 0.13]) {
      parts.push(bevelBox({ w: 0.2, h: 0.5, d: 0.2, color: "#8a8e96", offset: { x, y: 0.25 } }));
      parts.push(box({ w: 0.21, h: 0.08, d: 0.21, color: c.paint, emissive: 0.3, offset: { x, y: 0.36 } }));
      parts.push(box({ w: 0.12, h: 0.1, d: 0.12, color: "#3a3a40", offset: { x, y: -0.04 } }));
    }
    parts.push(box({ w: 0.12, h: 0.32, d: 0.08, color: "#5a3a22", offset: { y: 0.28, z: 0.1 } }));
    return merge(...parts);
  });
  const jetFlames = cached(() => {
    const geo = merge(...[-0.13, 0.13].map((x) => merge(
      moved(lathe({ profile: [[0, 0], [0.1, -0.08], [0.06, -0.3], [0, -0.5]], segments: 6, color: "#ff8a2a", emissive: 1 }), x, -0.08, 0),
      moved(lathe({ profile: [[0, 0], [0.06, -0.06], [0.03, -0.2], [0, -0.3]], segments: 6, color: "#fff3a0", emissive: 1 }), x, -0.08, 0)
    )));
    geo.castShadow = false;
    return geo;
  });
  // A cargo net hung on a climb's face: rope squares from the ground to its top, `w` wide, in its own frame facing +z.
  const net2 = variants((key) => {
    const [w10, top10] = key.split(":").map(Number), w = w10 / 10, top = top10 / 10, parts = [];
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.3) parts.push(box({ w: 0.05, h: top, d: 0.05, color: "#c9a96b", offset: { x, y: top / 2 } }));
    for (let y = 0.15; y <= top; y += 0.3) parts.push(box({ w, h: 0.05, d: 0.05, color: "#b0905a", offset: { y } }));
    return merge(...parts);
  });
  // A rain puddle: a flat dark pool (Gorilla Jungle's).
  const puddle = cached(() => box({ w: 1.6, h: 0.02, d: 1.3, color: "#3a5a78", emissive: 0.05, offset: { y: 0.015 } }));
  // The lightning bolt's column, a tall thin white box with its foot at y 0.
  const bolt = cached(() => box({ w: 0.28, h: 40, d: 0.28, color: "#eaf4ff", emissive: 1, offset: { y: 20 } }));
  // Haunted Hollow's dressing, one merged mesh: lamps along the routes, neon tubes on the cave walls, skeletons in the
  // open graves, and at each cellar's back door its plank door swung open flat against the wall outside, with a lantern
  // on the wall beside it. Glow is emissive faces only, no extra lights.
  const hauntDress = cached(() => {
    const M = SIM.ARENAS.haunted, parts = [];
    for (const [x, z] of [[-9, 2], [9, -2], [-15, 22], [15, -22], [9, 28], [-9, -28], [-24, 12], [24, -12], [0, 19], [0, -19], [18, 30], [-18, -30]]) {
      parts.push(box({ w: 0.14, h: 2.8, d: 0.14, color: "#2a2c30", offset: { x, y: 1.4, z } }), box({ w: 0.42, h: 0.42, d: 0.42, color: "#ffd98a", emissive: 1, offset: { x, y: 2.95, z } }));
    }
    let k = 0;
    for (const b of M.rocks) {
      if (M.rockKind.get(b) !== "cave" || (b[5] || 0) > 0 || b[3] - b[2] < 2 || (k++ % 3)) continue;
      const color = k % 2 ? "#46ff72" : "#ff4fd8";
      parts.push(box({ w: 0.08, h: 0.12, d: b[3] - b[2] - 0.8, color, emissive: 1, offset: { x: b[1] + 0.05, y: 1.5, z: (b[2] + b[3]) / 2 } }));
    }
    for (const [x0, x1, z0, z1] of M.graves) {
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, floor = SIM.GRAVE_Y;
      parts.push(box({ w: 0.28, h: 0.28, d: 0.28, color: "#e0dccf", offset: { x, y: floor + 0.29, z: z1 - 0.45 } }));
      for (let r = 0; r < 4; r++) parts.push(box({ w: 0.42, h: 0.05, d: 0.06, color: "#d4cebd", offset: { x, y: floor + 0.15, z: z1 - 0.8 - r * 0.2 } }));
      parts.push(box({ w: 0.08, h: 0.05, d: 0.9, color: "#d4cebd", offset: { x: x - 0.12, y: floor + 0.13, z: z0 + 0.7 } }), box({ w: 0.08, h: 0.05, d: 0.9, color: "#d4cebd", offset: { x: x + 0.12, y: floor + 0.13, z: z0 + 0.7 } }));
    }
    for (const [x0, x1, z0, z1] of M.backDoors) {
      // `s` is +1 for blue's (the house's back faces +z), -1 for red's turned one. The door hangs off the post on the
      // block's side, swung right back; the lantern is on the other side, over the corner of the wall.
      const s = Math.sign(z0 + z1), face = (s > 0 ? z1 : z0) + s * 0.17, hinge = s > 0 ? x1 + 0.3 : x0 - 0.3, mid = hinge + s * 1.15;
      parts.push(bevelBox({ w: 2.3, h: 2.25, d: 0.08, color: "#4a3a2c", offset: { x: mid, y: 1.15, z: face } }));
      for (let k = 1; k < 5; k++) parts.push(box({ w: 0.03, h: 2.2, d: 0.1, color: "#2a211b", offset: { x: hinge + s * k * 0.46, y: 1.15, z: face } }));
      for (const by of [0.45, 1.85]) parts.push(box({ w: 2.1, h: 0.1, d: 0.11, color: "#1c1a20", offset: { x: mid - s * 0.05, y: by, z: face } }));
      const lx = s > 0 ? x0 - 1.1 : x1 + 1.1;
      parts.push(box({ w: 0.08, h: 0.08, d: 0.4, color: "#1c1a20", offset: { x: lx, y: 2.25, z: face + s * 0.1 } }));
      parts.push(box({ w: 0.3, h: 0.36, d: 0.3, color: "#ffd98a", emissive: 1, offset: { x: lx, y: 2.0, z: face + s * 0.3 } }));
    }
    return merge(...parts);
  });
  // The laser-eyes beam: a white-hot core in a red glow, one metre long along +z from the origin (the scene stretches
  // it to the beam's length), in two strands a hand apart, one from each eye.
  const beam = cached(() => {
    const parts = [];
    for (const x of [-0.07, 0.07]) {
      parts.push(box({ w: 0.035, h: 0.035, d: 1, color: "#fff4f0", emissive: 1, offset: { x, z: 0.5 } }));
      parts.push(box({ w: 0.09, h: 0.09, d: 1, color: "#ff2a1a", emissive: 1, offset: { x, z: 0.5 } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // Laser eyes lit: two glowing red eyes, set over the Ooga's own.
  const laserEyes = cached(() => merge(box({ w: 0.1, h: 0.07, d: 0.06, color: "#ff3a1a", emissive: 1, offset: { x: -0.07 } }), box({ w: 0.1, h: 0.07, d: 0.06, color: "#ff3a1a", emissive: 1, offset: { x: 0.07 } })));
  // A ghost: a pale glowing sheet, round on top and flaring to a ragged hem, two dark eyes and an open mouth, its arms
  // out. Faces +z, its middle at y 0.
  const ghost = cached(() => {
    const sheet = "#e8eefc", parts = [
      lathe({ profile: [[0, 0.75], [0.3, 0.68], [0.45, 0.45], [0.5, 0.1], [0.56, -0.35], [0.66, -0.62], [0, -0.62]], segments: 10, color: sheet, emissive: 0.55 })
    ];
    // The ragged hem: tatters hanging below.
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; parts.push(box({ w: 0.2, h: 0.22, d: 0.2, color: sheet, emissive: 0.5, offset: { x: Math.sin(a) * 0.55, y: -0.72 - (k % 2) * 0.08, z: Math.cos(a) * 0.55 } })); }
    parts.push(box({ w: 0.11, h: 0.17, d: 0.05, color: "#141018", offset: { x: -0.15, y: 0.35, z: 0.46 } }), box({ w: 0.11, h: 0.17, d: 0.05, color: "#141018", offset: { x: 0.15, y: 0.35, z: 0.46 } }));
    parts.push(box({ w: 0.16, h: 0.2, d: 0.05, color: "#141018", offset: { y: 0.08, z: 0.5 } }));
    for (const s of [-1, 1]) parts.push(box({ w: 0.36, h: 0.14, d: 0.16, color: sheet, emissive: 0.5, offset: { x: s * 0.6, y: 0.08, z: 0.12 } }));
    return merge(...parts);
  });
  BL.blockModels = { hookHead, rope, goldBlock, trophyRays, muzzleFlash, isle, keel, puddle, bolt, hauntDress, townDress, jungleRing, beam, laserEyes, ghost, net2, jetpack, jetFlames, monkey, catapult, catapultArm, chute, goldBall, banana, bananaPile, peel, firePit, flames, potato, potatoArm, power, ice, tramp, TEAM, ORANGE, GUNS, arena, stand, block, tick, ball, splat, ring, pad, bubble, crate, grenade, rocket, net, draped, streak, gun, ladder, rack, zipline, zipLight, trolley, cache, SPLATS: 6 };
})();
