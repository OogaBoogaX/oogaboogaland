// Hub props; each builder returns one cached geometry shared by every instance: cave rim, gate, shelves,
// sign, lantern, trees, bushes, grass, rocks, barrels, torches, fire pit, clouds, dock and the critter
// bodies.
//
// `SIGN_GLYPHS` is the blocky 3x5 alphabet every carved sign in the world is cut from, the Mempool cave's
// headlines included. It must stay complete: a missing key is silently skipped and the reading loses a
// letter. `SIGN_ICONS` are the cave emblems dressing.js banners carry; `SIGN_BADGES` the larger outlined ones
// either side of a cave sign's name. `postSign` stands a scaled cave sign on two pegs for the launchers and
// the Mempool island.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb, mulberry32 } = BL.math;
  const { geometry, pushVert, face, box, bevelBox, lathe, ring, merge, cached, variants, makeVox: vox, voxelGeometry: voxGeo, voxCoords } = BL.models;
  const blob = (v, { cx, cy, cz, rx, ry, rz, chip = 0, floor = -Infinity, rand, color }) => {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      for (let y = Math.max(floor, Math.floor(cy - ry)); y <= Math.ceil(cy + ry); y++) {
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > 1 || (d > 0.72 && rand() < chip)) continue;
          v.set(x, y, z, color(x, y, z));
        }
      }
    }
  };
  const CELL = [0, 0, 0];
  const pick = (rand, base, alt, p) => () => rand() < p ? alt : base;
  const foliage = (v, rand, base, lo, hi, berry = 0) => {
    for (const [k, c] of v.map) {
      if (c < base) continue;
      voxCoords(k, CELL);
      const x = CELL[0], y = CELL[1], z = CELL[2];
      let tone;
      if ((y - lo) / (hi - lo) < 0.34) tone = rand() < 0.75 ? 0 : 1;
      else if (!v.has(x, y + 1, z)) tone = rand() < berry ? 4 : rand() < 0.65 ? 3 : 2;
      else tone = rand() < 0.5 ? 1 : 2;
      v.map.set(k, base + tone);
    }
  };
  // Rolls about z first, then yaws about y, mutating geo.verts in place.
  const turn = (geo, yaw, roll = 0) => {
    const p = geo.verts;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] * cr - p[i + 1] * sr, y = p[i] * sr + p[i + 1] * cr, z = p[i + 2];
      p[i] = x * cy + z * sy;
      p[i + 1] = y;
      p[i + 2] = z * cy - x * sy;
    }
    return geo;
  };
  const noShadow = (geo) => {
    geo.castShadow = false;
    return geo;
  };
  const VOX = 0.5;
  // The cell a cloud's flat base sits on, and how many cells it rounds up by at the rim.
  const CLOUD_BASE = -2, CLOUD_ROUND = 2;
  const QUARTER = 0.25;
  const QHALF = { x: -QUARTER / 2, y: 0, z: -QUARTER / 2 };
  const STONE = ["#3a3734", "#2d2b28", "#45413d"];
  const CLIFF = ["#7d6f61", "#5e5449", "#877869"];
  const WOOD = "#8a6236", WOOD_DK = "#5c4425", PLANK = "#a9773f";
  const CAVE_SIGN_WIDTH = 3.78, CAVE_SIGN_HEIGHT = 1.06;
  const SIGN_GLYPHS = {
    E: ["111", "100", "110", "100", "111"],
    n: ["000", "110", "101", "101", "101"],
    t: ["010", "111", "010", "010", "011"],
    r: ["000", "110", "101", "100", "100"],
    O: ["111", "101", "101", "101", "111"],
    o: ["000", "111", "101", "101", "111"],
    p: ["000", "110", "101", "110", "100", "100"],
    y: ["000", "101", "101", "011", "001", "110"],
    g: ["000", "111", "101", "111", "001", "110"],
    q: ["000", "111", "101", "111", "001", "001"],
    j: ["001", "000", "001", "001", "101", "010"],
    B: ["110", "101", "110", "101", "110"],
    L: ["100", "100", "100", "100", "111"],
    a: ["000", "010", "101", "111", "101"],
    b: ["100", "100", "110", "101", "110"],
    d: ["001", "001", "011", "101", "011"],
    c: ["000", "011", "100", "100", "011"],
    e: ["000", "010", "111", "100", "011"],
    f: ["011", "010", "111", "010", "010"],
    h: ["100", "100", "110", "101", "101"],
    i: ["010", "000", "010", "010", "010"],
    k: ["100", "101", "110", "101", "101"],
    l: ["110", "010", "010", "010", "011"],
    m: ["000", "111", "111", "101", "101"],
    s: ["000", "011", "110", "001", "110"],
    u: ["000", "101", "101", "101", "011"],
    v: ["000", "101", "101", "101", "010"],
    w: ["000", "101", "101", "111", "010"],
    x: ["000", "101", "010", "010", "101"],
    z: ["000", "111", "001", "010", "111"],
    A: ["010", "101", "111", "101", "101"],
    C: ["011", "100", "100", "100", "011"],
    D: ["110", "101", "101", "101", "110"],
    F: ["111", "100", "110", "100", "100"],
    H: ["101", "101", "111", "101", "101"],
    M: ["101", "111", "111", "101", "101"],
    P: ["110", "101", "110", "100", "100"],
    R: ["110", "101", "110", "101", "101"],
    S: ["011", "100", "010", "001", "110"],
    T: ["111", "010", "010", "010", "010"],
    W: ["101", "101", "101", "111", "101"],
    X: ["101", "101", "010", "101", "101"],
    G: ["011", "100", "101", "101", "011"],
    I: ["111", "010", "010", "010", "111"],
    J: ["001", "001", "001", "101", "010"],
    K: ["101", "101", "110", "101", "101"],
    N: ["101", "111", "101", "101", "101"],
    Q: ["111", "101", "101", "111", "011"],
    U: ["101", "101", "101", "101", "111"],
    V: ["101", "101", "101", "101", "010"],
    Y: ["101", "101", "010", "010", "010"],
    Z: ["111", "001", "010", "100", "111"],
    "/": ["001", "001", "010", "100", "100"],
    0: ["111", "101", "101", "101", "111"],
    1: ["010", "110", "010", "010", "111"],
    2: ["111", "001", "111", "100", "111"],
    3: ["111", "001", "111", "001", "111"],
    4: ["101", "101", "111", "001", "001"],
    5: ["111", "100", "111", "001", "111"],
    6: ["111", "100", "111", "101", "111"],
    7: ["111", "001", "001", "001", "001"],
    8: ["111", "101", "111", "101", "111"],
    9: ["111", "101", "111", "001", "111"],
    ":": ["000", "010", "000", "010", "000"],
    "!": ["010", "010", "010", "000", "010"],
    "?": ["111", "001", "011", "000", "010"],
    "+": ["000", "010", "111", "010", "000"],
    "-": ["000", "000", "111", "000", "000"],
    ".": ["000", "000", "000", "000", "010"]
  };
  const SIGN_CELL = 0.075, SIGN_PIXEL = 0.061, SIGN_PAD = 0.855, SIGN_FRONT = 0.23;
  const SIGN_CACHE = new Map();
  // The emblem each cave flies, 5 by 7: on its sign either side of the name and on its banners.
  const SIGN_ICONS = {
    bolt: ["...##", "..##.", ".##..", "#####", "..##.", ".##..", "##..."],
    die: ["#####", "#...#", "#.#.#", "#...#", "#.#.#", "#...#", "#####"],
    flag: ["#.#.#", ".#.#.", "#.#.#", ".#.#.", "#....", "#....", "#...."],
    pick: ["####.", "#..##", "...#.", "..#..", ".#...", "#....", "....."],
    glyph: ["#.##.", "##..#", ".#.#.", "#..##", ".##.#", "#.#..", "##.##"],
    banana: ["....#", "...##", "..##.", ".##..", "##...", "#....", "....."]
  };
  // The sign emblems: 7x7 art in named inks, drawn a size up from the banners' SIGN_ICONS and ringed in a dark
  // outline worked out from the art itself, so each reads as an enamel badge proud of the planks.
  const SIGN_BADGES = {
    bolt: { ink: { "#": "#ffcf2e", "+": "#fff1a0" }, rows: ["....+##", "...+##.", "..+##..", ".+#####", "....##.", "...##..", "..##..."] },
    die: { ink: { "#": "#f2efe8", "+": "#ffffff", "*": "#1f6f6a" }, rows: [".+++++.", "+*###*#", "+######", "+##*###", "+######", "+*###*#", ".#####."] },
    flag: { ink: { "#": "#f2efe8", "*": "#1b1b1e", "P": "#a8703e" }, rows: ["P#*#*#.", "P*#*#*#", "P#*#*#*", "P*#*#*.", "P......", "P......", "P......"] },
    pick: { ink: { "I": "#c9ced6", "+": "#eef1f5", "H": "#a8703e" }, rows: ["..+II..", ".I.H.I.", "I..H..I", "...H...", "...H...", "...H...", "...H..."] },
    glyph: { ink: { "#": "#46ff72" }, rows: [".#.##..", ".##..#.", "..#.#..", ".#..##.", "..##.#.", ".#.#...", ".##.##."] },
    banana: { ink: { "#": "#f5d142", "+": "#fff3a0", "S": "#6b4a26" }, rows: [".....S.", ".....##", "....+#.", "...+##.", "..+##..", "#+##...", ".##...."] }
  };
  const BADGE_OUTLINE = "#2a1a0c", BADGE_CELLS = 9;
  // Every art cell plus the ring of cells round it, as [col, row, colour, proud] on a 9x9 grid, top row first.
  const badgeCells = (name) => {
    const { ink, rows } = SIGN_BADGES[name], out = [];
    const art = (c, r) => r >= 0 && r < 7 && c >= 0 && c < 7 && rows[r][c] !== ".";
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      if (art(c, r)) out.push([c + 1, r + 1, ink[rows[r][c]], true]);
      else {
        let near = false;
        for (let dr = -1; dr <= 1 && !near; dr++) for (let dc = -1; dc <= 1; dc++) if (art(c + dc, r + dr)) { near = true; break; }
        if (near) out.push([c + 1, r + 1, BADGE_OUTLINE, false]);
      }
    }
    return out;
  };
  const SIGN_PLANKS = ["#b27a43", "#c08a50", "#a86f3b"], SIGN_INK = "#f6ecd2", SIGN_IRON = "#3b3d42", SIGN_RIVET = "#8a8f98";
  // A cave's name board: three thick bevelled planks with ragged ends on two posts that stand proud above and
  // below, the name raised in faintly glowing cream on one dark stained panel so it reads day and night and
  // from across the island (solid letters and one panel, nothing thin enough to break up at distance), the
  // cave's badge before it (badge and name centred as one group) and iron plates on the corners. The front face sits at SIGN_FRONT and nothing reaches behind
  // z = -0.07, so it hangs where the old board did.
  const caveSign = (text = "EntropyLab", iconName = null) => {
    const key = iconName ? text + "|" + iconName : text;
    const hit = SIGN_CACHE.get(key);
    if (hit) return hit;
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : 4;
    const textW = cells * SIGN_CELL;
    const iconW = iconName ? SIGN_CELL * BADGE_CELLS : 0;
    const width = Math.max(CAVE_SIGN_WIDTH, textW + SIGN_PAD + (iconName ? iconW + SIGN_CELL : 0));
    // The badge leads the name; the pair is centred together, so the name moves right by half the badge and its gap.
    const shift = iconName ? (iconW + SIGN_CELL) * 0.5 : 0;
    const half = CAVE_SIGN_HEIGHT * 0.5, plankH = (CAVE_SIGN_HEIGHT - 0.04) / 3, depth = 0.3, mid = SIGN_FRONT - depth / 2;
    const geos = [];
    // Posts first, so the planks cover them and only their ends show.
    for (const side of [-1, 1]) geos.push(bevelBox({ w: 0.2, h: CAVE_SIGN_HEIGHT + 0.44, d: 0.2, color: "#6b4524", offset: { x: side * (width * 0.5 - 0.42), y: 0.02, z: 0.03 } }));
    [[0.07, 0.03], [-0.05, -0.04], [0.11, 0.02]].forEach(([grow, shift], k) => {
      geos.push(bevelBox({ w: width + grow, h: plankH, d: depth, color: SIGN_PLANKS[k], bevel: 0.05, offset: { x: shift, y: half - plankH * (k + 0.5) - 0.02 * k, z: mid } }));
    });
    // The dark panel the name sits on: one piece, a little proud of the planks, covering descenders too.
    geos.push(bevelBox({ w: textW + 0.14, h: 0.52, d: 0.035, color: "#3f2513", bevel: 0.012, offset: { x: shift, y: -0.035, z: SIGN_FRONT + 0.0125 } }));
    // Letters as solid horizontal runs of whole cells, touching row to row, so a glyph is one clean shape.
    const run = (x0, y, n) => geos.push(box({ w: SIGN_CELL * n, h: SIGN_CELL, d: 0.07, color: SIGN_INK, emissive: 0.25, offset: { x: x0 + SIGN_CELL * (n - 1) * 0.5, y, z: SIGN_FRONT + 0.03 } }));
    let cursor = shift - textW * 0.5;
    for (const ch of text) {
      if (ch === " ") {
        cursor += SIGN_CELL * 2;
        continue;
      }
      const glyph = SIGN_GLYPHS[ch];
      if (!glyph) throw new Error(`No cave-sign glyph for "${ch}"`);
      for (let row = 0; row < glyph.length; row++) {
        const line = glyph[row];
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== "1") continue;
          let n = 1;
          while (line[col + n] === "1") n++;
          run(cursor + col * SIGN_CELL + SIGN_CELL * 0.5, (2 - row) * SIGN_CELL, n);
          col += n - 1;
        }
      }
      cursor += SIGN_CELL * 4;
    }
    if (iconName) {
      const badge = badgeCells(iconName);
      const x0 = shift - textW * 0.5 - SIGN_CELL - iconW + SIGN_CELL * 0.5;
      for (const [col, row, color, proud] of badge) {
        geos.push(box({ w: SIGN_PIXEL + 0.014, h: SIGN_PIXEL + 0.014, d: proud ? 0.07 : 0.045, color, emissive: proud ? 0.35 : 0, offset: { x: x0 + col * SIGN_CELL, y: (4 - row) * SIGN_CELL, z: SIGN_FRONT + (proud ? 0.03 : 0.0175) } }));
      }
    }
    // Iron plates on the four corners, each held by two rivets.
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx * (width * 0.5 - 0.17), y = sy * (half - 0.15);
      geos.push(bevelBox({ w: 0.24, h: 0.22, d: 0.05, color: SIGN_IRON, bevel: 0.015, offset: { x, y, z: SIGN_FRONT + 0.02 } }));
      for (const dx of [-0.06, 0.06]) geos.push(box({ w: 0.045, h: 0.045, d: 0.03, color: SIGN_RIVET, offset: { x: x + dx, y: y + sy * -0.03, z: SIGN_FRONT + 0.055 } }));
    }
    const geo = merge(...geos);
    geo.signWidth = width;
    geo.signHeight = CAVE_SIGN_HEIGHT;
    SIGN_CACHE.set(key, geo);
    return geo;
  };
  // A small name board on two chunky pegs, for the launchers and the Mempool island: the cave sign scaled down,
  // its bottom `peg` above the ground. `signWidth` and `signHeight` are its scaled size.
  const POST_SIGNS = new Map();
  const postSign = (text, scale, peg) => {
    const key = `${text}|${scale}|${peg}`;
    let geo = POST_SIGNS.get(key);
    if (geo) return geo;
    const sign = caveSign(text), board = { verts: sign.verts.slice(), faces: sign.faces, lines: sign.lines };
    const lift = peg + sign.signHeight * scale * 0.5;
    for (let i = 0; i < board.verts.length; i += 3) {
      board.verts[i] *= scale;
      board.verts[i + 1] = board.verts[i + 1] * scale + lift;
      board.verts[i + 2] *= scale;
    }
    const halfW = sign.signWidth * scale * 0.5 - 0.2;
    geo = merge(board, ...[-halfW, halfW].map((x) => bevelBox({ w: 0.17, h: peg + 0.25, d: 0.17, color: WOOD_DK, offset: { x, y: (peg + 0.25) * 0.5 - 0.1 } })));
    geo.signWidth = sign.signWidth * scale;
    geo.signHeight = sign.signHeight * scale;
    POST_SIGNS.set(key, geo);
    return geo;
  };
  // Variant 0 is the full frame, 1 the jambs and 2 the lintel alone.
  const caveMouthRim = variants((part) => {
    const rand = mulberry32(31);
    const v = vox();
    const stone = pick(rand, 0, 1, 0.3);
    const light = pick(rand, 2, 0, 0.5);
    if (part !== 2) {
      v.fill(-6, -6, 0, 5, 0, 1, stone);
      v.fill(5, 5, 0, 5, 0, 1, stone);
    }
    if (part !== 1) v.fill(-5, 4, 6, 6, 0, 1, light);
    const geo = voxGeo(v, { unit: VOX, palette: CLIFF, origin: { x: 0, y: 0, z: -VOX } });
    geo.jambCenterX = 2.75;
    geo.frontZ = 0.5;
    geo.openingBounds = { minX: -2.5, maxX: 2.5, floorY: 0, ceilingY: 3, minZ: -0.5, maxZ: 0.5 };
    return geo;
  });
  const mirrorPanel = cached(() => {
    const geo = {
      verts: [-2.5, -1.75, 0, 2.5, -1.75, 0, 2.5, 1.5, 0, -2.5, 1.5, 0],
      faces: [{ i: [0, 1, 2, 3], color: hexToRgb("#81919c"), emissive: 0 }],
      lines: [],
      castShadow: false
    };
    return geo;
  });
  const matrixPrisonBars = cached(() => {
    const parts = [
      box({ w: 4.9, h: 0.14, d: 0.22, color: "#101813", offset: { y: 0.38 } }),
      box({ w: 4.9, h: 0.14, d: 0.22, color: "#101813", offset: { y: 2.76 } })
    ];
    for (let bar = 0; bar < 7; bar++) {
      const x = -2.25 + bar * 0.75;
      parts.push(box({ w: 0.14, h: 3.15, d: 0.18, color: "#17211b", offset: { x, y: 1.575 } }));
      // Per-bar pixel offsets vary on purpose so each bar reads as a different falling rune.
      for (let row = 0; row < 7; row++) {
        const side = (bar * 3 + row * 5) & 1 ? -1 : 1;
        parts.push(box({ w: 0.035, h: 0.06, d: 0.025, color: row & 1 ? "#46ff70" : "#18dc4a", emissive: 0.7, offset: { x: x + side * 0.03, y: 0.22 + row * 0.44, z: 0.1025 } }));
        if ((bar + row) % 3) parts.push(box({ w: 0.035, h: 0.035, d: 0.025, color: "#18dc4a", emissive: 0.45, offset: { x: x - side * 0.03, y: 0.25 + row * 0.44, z: 0.1025 } }));
      }
    }
    return merge(...parts);
  });
  const sealedCaveFace = variants((variant) => {
    const rand = mulberry32(419), stone = vox(), parts = [];
    const mossColors = ["#6f7d3e", "#7b8945", "#65733a"];
    // Match both rim depth layers with a continuous stone core: merged voxels drop internal faces so the
    // seal cannot open slits where different block depths meet.
    const backZ = -0.52, stoneFront = backZ + VOX * 2;
    let frontZ = stoneFront;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 10; x++) {
      const color = (x + y * 2 + Math.floor(rand() * 2)) % CLIFF.length;
      stone.set(x - 5, y, 0, color); stone.set(x - 5, y, 1, color);
    }
    parts.push(voxGeo(stone, { unit: VOX, palette: CLIFF, origin: { x: 0, y: 0, z: backZ } }));
    // Grass caps continue the hill steps' quarter-voxel growth in connected patches, not flecks.
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
      const top = variant === 0 ? y === 11 && (x < 7 || x > 8 && x < 15 || x > 16) : variant === 1 ? y === 11 && (x < 3 || x > 4 && x < 12 || x > 14) : y === 11 && (x < 5 || x > 7 && x < 11 || x > 13);
      const upper = variant === 0 ? y === 10 && (x < 6 || x > 9 && x < 14 || x > 17) || y === 9 && (x > 0 && x < 5 || x > 10 && x < 13 || x === 18) : variant === 1 ? y === 10 && (x < 2 || x > 5 && x < 11 || x > 15) || y === 9 && (x === 1 || x > 6 && x < 10 || x > 16) : y === 10 && (x < 4 || x > 7 && x < 12 || x > 14) || y === 9 && (x > 1 && x < 4 || x > 8 && x < 11 || x > 15 && x < 19);
      const edge = variant === 0 ? x === 0 && y > 4 && y < 9 || x === 19 && y > 3 && y < 9 : variant === 1 ? x === 0 && y > 2 && y < 7 || x === 19 && y > 6 && y < 10 : x === 0 && y > 6 && y < 11 || x === 19 && y > 1 && y < 7;
      const patch = variant === 0 ? y > 3 && y < 7 && (x > 4 && x < 8 || x > 13 && x < 17) && (x + y) % 3 !== 0 : variant === 1 ? y > 4 && y < 8 && (x > 2 && x < 6 || x > 11 && x < 15) && (x + y) % 3 !== 1 : y > 2 && y < 6 && (x > 8 && x < 14) && (x + y) % 4 !== 2;
      if (!top && !upper && !edge && !patch) continue;
      const mossZ = stoneFront + 0.0125;
      parts.push(box({ w: 0.245, h: 0.245, d: 0.025, color: mossColors[(x * 3 + y * 5 + variant) % mossColors.length], offset: { x: -2.375 + x * 0.25, y: 0.125 + y * 0.25, z: mossZ } }));
      frontZ = Math.max(frontZ, mossZ + 0.0125);
    }
    const geo = merge(...parts);
    geo.frontZ = frontZ;
    geo.sealBounds = { minX: -2.5, maxX: 2.5, minY: 0, maxY: 3, minZ: backZ, maxZ: stoneFront };
    return geo;
  });
  const matrixLeverPlate = cached(() => merge(
    box({ w: 0.92, h: 1.22, d: 0.12, color: "#17201b", offset: { z: 0.06 } }),
    box({ w: 0.76, h: 1.06, d: 0.08, color: "#d69e19", emissive: 0.35, offset: { z: 0.15 } }),
    box({ w: 0.58, h: 0.88, d: 0.06, color: "#29352d", offset: { z: 0.22 } }),
    ...[-1, 1].flatMap((x) => [-1, 1].map((y) => box({ w: 0.1, h: 0.1, d: 0.09, color: "#8c6930", offset: { x: x * 0.33, y: y * 0.48, z: 0.225 } })))
  ));
  const matrixLeverLights = cached(() => merge(
    // Inset into the border: its front is z=0.19, just behind the lit face.
    ...[-1, 1].map((side) => box({ w: 0.09, h: 0.92, d: 0.035, color: "#18dc4a", emissive: 1, offset: { x: side * 0.335, z: 0.1775 } }))
  ));
  const matrixLeverHub = cached(() => lathe({
    profile: [[0, 0], [0.23, 0], [0.25, 0.06], [0.25, 0.15], [0.21, 0.19], [0, 0.19]],
    segments: 12, color: "#f2bd35", emissive: 0.45
  }));
  const matrixLeverArm = cached(() => box({ w: 0.13, h: 0.68, d: 0.13, color: "#d9e2d8", emissive: 0.15, offset: { y: 0.34 } }));
  const matrixLeverGrip = cached(() => merge(
    box({ w: 0.24, h: 0.21, d: 0.21, color: "#18dc4a", emissive: 1, offset: { y: 0.755 } }),
    box({ w: 0.16, h: 0.055, d: 0.225, color: "#46ff70", emissive: 1, offset: { y: 0.846 } })
  ));
  const matrixLeverLabels = cached(() => {
    const parts = [], cell = 0.022;
    for (const [text, y] of [["ON", 0.37], ["OFF", -0.37]]) {
      const width = (text.length * 4 - 1) * cell;
      for (let i = 0; i < text.length; i++) {
        const glyph = SIGN_GLYPHS[text[i]];
        for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) if (glyph[row][col] === "1") {
          parts.push(box({ w: cell * 0.85, h: cell * 0.85, d: 0.006, color: "#e8efdf", emissive: 0.8,
            offset: { x: -width / 2 + (i * 4 + col + 0.5) * cell, y: y + (2 - row) * cell, z: 0.255 } }));
        }
      }
    }
    return merge(...parts);
  });
  const MATRIX_GLYPHS = [
    ["0110", "1001", "1111", "1001", "1001", "0000"],
    ["1110", "1001", "1110", "1001", "1110", "0000"],
    ["1111", "1000", "1110", "1000", "1111", "0000"],
    ["1001", "1001", "1111", "0001", "1110", "0000"],
    ["1111", "0110", "0110", "0110", "1111", "0000"],
    ["1000", "1100", "1010", "0110", "0010", "0000"],
    ["0110", "1111", "0110", "1111", "0110", "0000"],
    ["1001", "0110", "1001", "0110", "1001", "0000"]
  ];
  const matrixGlyph = variants((i) => {
    const rows = MATRIX_GLYPHS[i % MATRIX_GLYPHS.length], pixels = [];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] !== "1") continue;
        pixels.push(box({ w: 0.016, h: 0.016, d: 0.01, color: i & 1 ? "#46ff70" : "#18dc4a", emissive: 1, offset: { x: (x - 1.5) * 0.021, y: (2.5 - y) * 0.021 } }));
      }
    }
    const geo = merge(...pixels);
    geo.castShadow = false;
    geo.matrixGlyph = true;
    return geo;
  });
  // Gateway arch over the pass; the trail runs along z.
  const gate = cached(() => {
    const rand = mulberry32(67);
    const v = vox();
    const stone = pick(rand, 0, 1, 0.3);
    const light = pick(rand, 2, 0, 0.5);
    v.fill(-3, -3, 0, 7, 0, 1, stone);
    v.fill(2, 2, 0, 7, 0, 1, stone);
    v.fill(-3, 2, 8, 8, 0, 1, light);
    v.fill(-1, 0, 9, 9, 0, 1, light);
    return voxGeo(v, { unit: VOX, palette: STONE, origin: { x: 0, y: 0, z: -VOX } });
  });
  const SCREEN = (x, y, color) => [
    box({ w: 0.7, h: 0.5, d: 0.12, color: "#1d2326", offset: { x, y, z: 0 } }),
    box({ w: 0.62, h: 0.42, d: 0.02, color, emissive: 0.9, offset: { x, y, z: 0.07 } })
  ];
  const caveShelves = cached(() => merge(
    box({ w: 2.4, h: 2.2, d: 0.1, color: "#3a3632", emissive: 0.35, offset: { y: 1.1, z: -0.25 } }),
    box({ w: 0.12, h: 2.2, d: 0.6, color: "#6a4f34", emissive: 0.35, offset: { x: -1.14, y: 1.1 } }),
    box({ w: 0.12, h: 2.2, d: 0.6, color: "#6a4f34", emissive: 0.35, offset: { x: 1.14, y: 1.1 } }),
    ...[0.06, 0.78, 1.5].map((y) => box({ w: 2.3, h: 0.08, d: 0.6, color: "#7a5a3a", emissive: 0.35, offset: { y } })),
    ...SCREEN(-0.6, 1.1, "#3fd1c5"),
    ...SCREEN(0.5, 1.82, "#6f9fca"),
    box({ w: 0.4, h: 0.3, d: 0.3, color: "#1d2326", offset: { x: 0.55, y: 0.97, z: 0.05 } }),
    box({ w: 0.3, h: 0.06, d: 0.02, color: "#22c55e", emissive: 0.9, offset: { x: 0.55, y: 1.05, z: 0.21 } }),
    box({ w: 0.44, h: 0.44, d: 0.44, color: WOOD, offset: { x: -0.7, y: 0.32, z: 0.02 } }),
    box({ w: 0.24, h: 0.3, d: 0.24, color: "#d8892b", offset: { x: 0.2, y: 0.25, z: 0.06 } }),
    box({ w: 0.24, h: 0.2, d: 0.24, color: "#6f9fca", offset: { x: 0.65, y: 0.2, z: 0.02 } })
  ));
  const labDesk = cached(() => {
    const parts = [
      box({ w: 1.8, h: 0.12, d: 0.4, color: "#626f70", offset: { y: 1.08 } }),
      box({ w: 1.7, h: 0.1, d: 0.1, color: "#273437", offset: { y: 0.28, z: -0.14 } }),
      box({ w: 0.12, h: 0.35, d: 0.12, color: "#273437", offset: { y: 1.3, z: -0.18 } }),
      box({ w: 1.26, h: 0.78, d: 0.13, color: "#16272b", offset: { y: 1.78, z: -0.2 } }),
      box({ w: 1.12, h: 0.64, d: 0.025, color: "#164751", emissive: 0.5, offset: { y: 1.78, z: -0.12 } }),
      box({ w: 0.85, h: 0.055, d: 0.23, color: "#202c2f", offset: { y: 1.17, z: 0.1 } }),
      box({ w: 0.32, h: 0.68, d: 0.34, color: "#273437", offset: { x: 0.64, y: 0.39 } }),
      box({ w: 0.16, h: 0.035, d: 0.025, color: "#5de7c7", emissive: 1, offset: { x: 0.64, y: 0.62, z: 0.185 } })
    ];
    for (const x of [-0.79, 0.79]) for (const z of [-0.14, 0.14]) parts.push(box({ w: 0.1, h: 1.02, d: 0.1, color: "#344446", offset: { x, y: 0.51, z } }));
    // Display content belongs to createLabScreen. Baked code bars here sat
    // only 0.001 behind that surface and fought its depth at distant views.
    for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) parts.push(box({ w: 0.064, h: 0.012, d: 0.035, color: "#b8c6bd", offset: { x: (col - 4) * 0.083, y: 1.204, z: 0.03 + row * 0.06 } }));
    return merge(...parts);
  });
  const labBench = cached(() => {
    const parts = [box({ w: 2.6, h: 0.14, d: 0.8, color: "#c1c6b7", offset: { y: 1.06 } }),
      box({ w: 2.45, h: 0.9, d: 0.68, color: "#425451", offset: { y: 0.45 } })];
    for (const x of [-0.8, 0, 0.8]) {
      parts.push(box({ w: 0.7, h: 0.67, d: 0.025, color: "#657671", offset: { x, y: 0.47, z: 0.355 } }));
      parts.push(box({ w: 0.19, h: 0.035, d: 0.035, color: "#c7d5cc", offset: { x, y: 0.65, z: 0.387 } }));
    }
    return merge(...parts);
  });
  const labBeaker = cached(() => merge(
    lathe({ profile: [[0, 0], [0.14, 0], [0.15, 0.015], [0.15, 0.345], [0.162, 0.355], [0.17, 0.37],
      [0.165, 0.385], [0.15, 0.39], [0.13, 0.385], [0.12, 0.37], [0.12, 0.1]],
      segments: 32, color: "#efb348", emissive: 0.2 }),
    box({ w: 0.16, h: 0.1, d: 0.015, color: "#e0e6d5", offset: { y: 0.16, z: 0.145 } })
  ));
  const labDie = cached(() => {
    const geometry = BL.models.die({ size: 0.26 });
    // Bench items share a base-at-zero origin and an explicit hand grip.
    for (let i = 1; i < geometry.verts.length; i += 3) geometry.verts[i] += 0.13;
    geometry.labGripY = 0.26;
    return geometry;
  });
  const labTouchscreen = cached(() => {
    const parts = [box({ w: 1.55, h: 0.98, d: 0.12, color: "#283b40", offset: { y: 2.27 } }),
      box({ w: 1.39, h: 0.81, d: 0.025, color: "#255263", emissive: 0.65, offset: { y: 2.27, z: 0.075 } })];
    for (const x of [-0.55, 0.55]) parts.push(box({ w: 0.09, h: 0.1, d: 0.49, color: "#344446", offset: { x, y: 2.26, z: -0.28 } }));
    for (let i = 0; i < 4; i++) {
      parts.push(box({ w: 0.42, h: 0.055, d: 0.012, color: "#93dfdf", emissive: 1, offset: { x: -0.34, y: 2.53 - i * 0.16, z: 0.096 } }));
      parts.push(box({ w: 0.1, h: 0.12 + i * 0.1, d: 0.012, color: i % 2 ? "#efbc64" : "#70e2ac", emissive: 1, offset: { x: 0.07 + i * 0.15, y: 2.02 + i * 0.05, z: 0.096 } }));
    }
    return merge(...parts);
  });
  const LAB_CODE_COLORS = ["#102b33", "#47616a", "#b996eb", "#7ad8ec", "#b3d7cb", "#eac679", "#81d4a1"].map(hexToRgb);
  const LAB_CODE_SIGNS = {
    "=": ["000", "111", "000", "111", "000"], "(": ["010", "100", "100", "100", "010"],
    ")": ["010", "001", "001", "001", "010"], "{": ["011", "010", "100", "010", "011"],
    "}": ["110", "010", "001", "010", "110"], ";": ["000", "010", "000", "010", "100"],
    ",": ["000", "000", "000", "010", "100"], ".": ["000", "000", "000", "000", "010"],
    '"': ["101", "101", "000", "000", "000"]
  };
  const labScreenRect = (geometry, x, y, w, h, z, color, emissive = 0.8) => {
    const i = geometry.verts.length / 3;
    geometry.verts.push(x, y, z, x + w, y, z, x + w, y + h, z, x, y + h, z);
    geometry.faces.push({ i: [i, i + 1, i + 2, i + 3], color: LAB_CODE_COLORS[color], emissive });
  };
  const labScreenText = (geometry, text, x, y, z, cell, color) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], glyph = LAB_CODE_SIGNS[ch] || SIGN_GLYPHS[ch.toUpperCase()];
      if (glyph) for (let row = 0; row < 5; row++) for (let col = 0; col < 3;) {
        if (glyph[row][col] !== "1") { col++; continue; }
        const start = col;
        while (col < 3 && glyph[row][col] === "1") col++;
        labScreenRect(geometry, x + i * cell * 4 + start * cell, y - (row + 1) * cell,
          (col - start) * cell * 0.88, cell * 0.88, z, color);
      }
    }
  };
  // Pixel code is baked once into flat quads. Decorative graphics never join
  // the furniture's collision shell or its object-outline registrations.
  const labScreenContent = variants((kind) => {
    const geometry = { verts: [], faces: [], lines: [], castShadow: false };
    const touch = kind === 1, z = touch ? 0.104 : -0.091;
    labScreenRect(geometry, touch ? -0.69 : -0.55, touch ? 1.87 : 1.47, touch ? 1.38 : 1.1,
      touch ? 0.8 : 0.62, z - 0.001, 0, 0.35);
    if (touch) {
      labScreenText(geometry, "SYS", 0.18, 2.58, z, 0.01, 4);
      labScreenText(geometry, "CPU", 0.17, 1.965, z, 0.007, 1);
      for (let row = 0; row < 4; row++) labScreenRect(geometry, 0.13, 2.0 + row * 0.12, 0.5, 0.006, z, 1, 0.25);
    } else labScreenText(geometry, "ENTROPY LAB", 0.12, 1.51, z, 0.006, 1);
    return geometry;
  });
  const LAB_CODE = ["const lab = {", '  task: "build",', "  ready: true", "};", "if (lab.ready)", "  lab.run();",
    "const seed =", "  dice.roll();", "lab.test(seed);", "lab.sync();", "const stats =", "  lab.read();",
    "if (stats.ok)", '  log("pass");', "lab.save();", "lab.next();"];
  const LAB_SCROLL_SPEED = 0.06;
  const labCodeStrip = variants((kind) => {
    const geometry = { verts: [], faces: [], lines: [], castShadow: false };
    const touch = kind === 1, cell = touch ? 0.0075 : 0.009, left = touch ? -0.63 : -0.49;
    for (let row = 0; row < LAB_CODE.length; row++) {
      const y = -row * 0.088, line = LAB_CODE[row];
      labScreenText(geometry, String(row + 1), left, y, 0, cell * 0.65, 1);
      for (let i = 0; i < line.length; i++) {
        const color = line.startsWith("const") && i < 5 || line.startsWith("if") && i < 2 ? 2
          : line.includes('"') && i >= line.indexOf('"') ? 5 : /[{}();:.=]/.test(line[i]) ? 4 : 3;
        labScreenText(geometry, line[i], left + cell * (7 + i * 4), y, 0, cell, color);
      }
    }
    return geometry;
  });
  const labScreenMarker = variants((color) => {
    const geometry = { verts: [], faces: [], lines: [], castShadow: false };
    labScreenRect(geometry, 0, 0, 1, 1, 0, color, 1);
    return geometry;
  });
  const labIdentityScreen = cached(() => {
    const geometry = { verts: [], faces: [], lines: [], castShadow: false };
    labScreenRect(geometry, -0.55, 1.47, 1.1, 0.62, -0.092, 0, 0.35);
    geometry.faces[0].color = [0, 0, 0];
    // Preserve the supplied JPEG and its aspect ratio; the narrow side bars
    // remain black. Both renderers share one lazily decoded source image.
    const width = 0.62 * BL.labWallpaper.width / BL.labWallpaper.height;
    geometry.imageSurface = { asset: BL.labWallpaper, rect: [-width / 2, 1.47, width, 0.62] };
    return geometry;
  });
  const createLabScreen = (parent, station, kind, codeGeometry) => {
    const { createNode, addChild } = BL.scene;
    const node = createNode({ geometry: codeGeometry ? labScreenContent(kind) : labIdentityScreen(), position: { ...parent.position },
      rotation: { ...parent.rotation }, sightHidden: true, matrixNative: !codeGeometry });
    const markers = [], strips = [], touch = kind === 1, z = touch ? 0.105 : -0.09;
    const span = LAB_CODE.length * 0.088, clock = station * 3.37 * 0.088 / LAB_SCROLL_SPEED;
    if (codeGeometry) for (let i = 0; i < 2; i++) {
      const strip = createNode({ geometry: codeGeometry, position: { x: 0,
        y: (touch ? 2.59 : 2.04) + clock * LAB_SCROLL_SPEED % span - i * span, z } });
      addChild(node, strip); strips.push(strip);
    }
    const marker = (x, y, w, h, color) => {
      const part = createNode({ geometry: labScreenMarker(color), position: { x, y, z }, scale: { x: w, y: h, z: 1 } });
      addChild(node, part); markers.push(part);
    };
    if (codeGeometry) {
      marker(touch ? -0.254 : -0.049, touch ? 2.0 : 1.532, 0.009, touch ? 0.031 : 0.038, 5);
      if (touch) for (let i = 0; i < 3; i++) marker(0.16 + i * 0.165, 2.0, 0.09, 0.15 + i * 0.085, i === 1 ? 5 : 6);
      else marker(-0.49, 1.49, 0.16, 0.008, 6);
    }
    return { station, node, markers, strips, kind, clock, phase: -1 };
  };
  // Cached furniture geometry; each visit owns its graph, solid registrations
  // and local work destinations. The center stays open from the original arch.
  const entropyLab = (room, floorY = 0) => {
    const { createNode, addChild } = BL.scene, node = createNode(), solids = [], stations = [], equipment = [], displays = [];
    const half = room.w / 2, back = -room.to + 0.28, rearWork = back + 1.60;
    // Both renderers already clip geometry by world height. Two shared strips
    // slide through each fixed screen aperture; wrapping never rebuilds text.
    const codeGeometry = [0, 1].map(kind => ({ ...labCodeStrip(kind),
      clipMinY: floorY + (kind ? 2.04 : 1.56), clipMaxY: floorY + (kind ? 2.59 : 2.04) }));
    const place = (geometry, x, z, heading = 0) => {
      const item = createNode({ geometry, position: { x, y: 0, z }, rotation: { x: 0, y: heading, z: 0 } });
      addChild(node, item); solids.push(item); return item;
    };
    for (const x of [-half + 1.17, 0, half - 1.17]) {
      const desk = place(labDesk(), x, back), display = createLabScreen(desk, stations.length, 0, x ? codeGeometry[0] : null);
      addChild(node, display.node); displays.push(display);
      stations.push({ x, y: 0, z: rearWork, heading: Math.PI, kind: "type", enabled: x !== 0 });
    }
    const sideZ = -Math.max(room.from + 1.4, 2.17);
    for (const side of [-1, 1]) {
      const facing = -side * Math.PI / 2;
      const bench = place(labBench(), side * (half - 0.47), sideZ, facing);
      const screen = place(labTouchscreen(), side * (half - 0.56), -3.1, facing), display = createLabScreen(screen, stations.length, 1, codeGeometry[1]);
      addChild(node, display.node); displays.push(display);
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 0.9, front = -0.03;
        const home = { x: bench.position.x + Math.cos(facing) * offset + Math.sin(facing) * front,
          y: 1.14, z: i === 2 ? -1.08 : side < 0 ? -2.3 - i * 0.8 : -2.5 - i * 0.68 };
        const kind = side > 0 && i === 2 ? "die" : i === 1 ? "beaker" : "flask";
        const geometry = kind === "die" ? labDie() : kind === "beaker" ? labBeaker() : BL.agent.labFlaskGeometry();
        if (i === 1) geometry.labGripY = 0.3;
        const item = createNode({ geometry, position: { ...home }, rotation: { x: 0, y: facing, z: 0 } });
        addChild(node, item);
        equipment.push({ node: item, parent: node, bench, home, homeRotation: { x: 0, y: facing, z: 0 }, homeScale: { x: 1, y: 1, z: 1 },
          station: i === 2 ? side < 0 ? 5 : 6 : stations.length, kind, rolling: false,
          roll: { time: 0, age: 0, cx: 0, cy: 0, cz: 0, vx: 0, vy: 0, vz: 0,
            wx: 0, wy: 0, wz: 0, tx: 0, ty: 0, tz: 0, bounces: 0 },
          // Keep every roll in the front play area, away from the glassware
          // and the touchscreen worker farther along this same bench.
          table: { minX: bench.position.x - 0.4, maxX: bench.position.x + 0.4,
            minZ: kind === "die" ? -1.5 : sideZ - 1.3, maxZ: sideZ + 1.3, y: 1.13 },
          pickup: { x: home.x, y: home.y + geometry.labGripY, z: home.z } });
      }
      stations.push({ x: side * (half - 2.06), y: 0, z: -3.1, heading: side * Math.PI / 2, kind: "touch", side });
    }
    for (const side of [-1, 1]) stations.push({ x: side * (half - 0.44 - 1.213094), y: 0, z: -1.08 + side * 0.272893, heading: side * Math.PI / 2, kind: "carry", side });
    const updateScreens = (dt, activeMask) => {
      if (!activeMask || !(dt > 0)) return false;
      let changed = false;
      for (let i = 0; i < displays.length; i++) {
        const display = displays[i];
        if (!display.strips.length || !(activeMask & (1 << display.station))) continue;
        const span = LAB_CODE.length * 0.088;
        display.clock = (display.clock + dt) % (span / LAB_SCROLL_SPEED);
        const top = (display.kind ? 2.59 : 2.04) + display.clock * LAB_SCROLL_SPEED;
        display.strips[0].position.y = top;
        display.strips[1].position.y = top - span;
        changed = true;
        const phase = Math.floor(display.clock * 6) & 7;
        if (phase === display.phase) continue;
        display.phase = phase; changed = true;
        const markers = display.markers;
        markers[0].visible = phase < 4;
        if (display.kind === 1) for (let bar = 1; bar < 4; bar++) {
          markers[bar].scale.y = 0.15 + (bar - 1) * 0.085 + (((phase + bar * 2) & 7) - 3.5) * 0.006;
        } else markers[1].scale.x = 0.16 + (phase & 3) * 0.012;
      }
      return changed;
    };
    return { node, solids, stations, equipment, displays, updateScreens };
  };
  // Jetpack tanks and backplate only; the flame is a separate geometry.
  const JET_UNIT = 0.075;
  const JET_ORIGIN = { x: -3 * JET_UNIT, y: 0, z: -2 * JET_UNIT };
  const jetpack = cached(() => {
    const v = vox();
    for (const x of [0, 4]) {
      v.fill(x, x + 1, 1, 5, 0, 1, 0);
      v.fill(x, x + 1, 6, 6, 0, 1, 1);
      v.fill(x, x + 1, 0, 0, 0, 1, 2);
    }
    v.fill(2, 3, 2, 5, 1, 1, 1);
    v.fill(2, 3, 4, 4, 0, 0, 2);
    return voxGeo(v, { unit: JET_UNIT, palette: ["#c8552f", "#9aa1a8", "#3c3f44"], origin: JET_ORIGIN });
  });
  const jetFlame = cached(() => {
    const v = vox();
    for (const x of [0, 4]) {
      v.fill(x, x + 1, -1, -1, 0, 1, 0);
      v.set(x + (x ? 0 : 1), -2, 1, 1);
      v.set(x + (x ? 1 : 0), -2, 0, 1);
    }
    return voxGeo(v, { unit: JET_UNIT, palette: ["#ffb13b", "#ffe9a8"], origin: JET_ORIGIN, emissive: { 0: 1, 1: 1 } });
  });
  const bedroll = cached(() => merge(box({ w: 1.9, h: 0.09, d: 0.85, color: "#2e2724" }), box({ w: 0.4, h: 0.16, d: 0.6, color: "#40342c", offset: { x: 0.65, y: 0.1 } })));
  // A cartoon puff: a low-poly ellipsoid (five rings of eight) with a seeded wobble on every inner vertex, shaded
  // in four painted bands by how far each facet faces up, so foliage reads as soft round clumps, not voxels.
  const puff = (geo, cx, cy, cz, rx, ry, rz, tones, rand, rings = 5, segs = 8, shift = 0) => {
    const rows = [];
    for (let r = 0; r <= rings; r++) {
      const p = r / rings * Math.PI, row = [];
      for (let e = 0; e < (r === 0 || r === rings ? 1 : segs); e++) {
        const a = (e + (r & 1) * 0.5) / segs * Math.PI * 2, j = r === 0 || r === rings ? 1 : 0.92 + rand() * 0.14;
        geo.verts.push(cx + Math.cos(a) * Math.sin(p) * rx * j, cy - Math.cos(p) * ry * (r === 0 ? 0.8 : 1), cz + Math.sin(a) * Math.sin(p) * rz * j);
        row.push(geo.verts.length / 3 - 1);
      }
      rows.push(row);
    }
    // A geometry carrying explicit normals gets the ellipsoid's own normal at every new vertex.
    if (geo.normals) for (let j = geo.normals.length; j < geo.verts.length; j += 3) {
      const nx = (geo.verts[j] - cx) / (rx * rx), ny = (geo.verts[j + 1] - cy) / (ry * ry), nz = (geo.verts[j + 2] - cz) / (rz * rz), l = Math.hypot(nx, ny, nz) || 1;
      geo.normals.push(nx / l, ny / l, nz / l);
    }
    // Each facet is wound outward (checked against the puff's centre) and painted by how far it faces up.
    const add = (ids) => {
      const v = geo.verts, a = ids[0] * 3, b = ids[1] * 3, c = ids[2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * (v[a] - cx) + ny * (v[a + 1] - cy) + nz * (v[a + 2] - cz) < 0) { ids.reverse(); ny = -ny; }
      // Smooth geometry takes one tone a lobe and lets the light shade it; faceted geometry paints bands by facing.
      const up = ny / (Math.hypot(nx, ny, nz) || 1), band = geo.smooth ? 2 : up > 0.62 ? 3 : up > 0.15 ? 2 : up > -0.35 ? 1 : 0;
      geo.faces.push({ i: ids, color: tones[Math.max(0, Math.min(tones.length - 1, band + shift))], emissive: 0 });
    };
    for (let r = 0; r < rings; r++) for (let e = 0; e < segs; e++) {
      const f = (e + 1) % segs, lo = rows[r], hi = rows[r + 1];
      if (r === 0) add([lo[0], hi[e], hi[f]]);
      else if (r === rings - 1) add([lo[e], lo[f], hi[0]]);
      else { add([lo[e], lo[f], hi[f]]); add([lo[e], hi[f], hi[e]]); }
    }
    return geo;
  };
  // Foliage in the style of hand-painted leaf cards, built as geometry (the renderer has no textures): a dark core
  // puff to close the gaps, then broad oval leaves fanned over the clump's surface, each tilted out from it and
  // gently cupped, two-sided. Every leaf vertex takes the normal pointing out of the clump, so a crown lights as
  // one soft mass while its silhouette stays leafy. Leaves high on the clump take the lighter greens.
  const LEAF = [[0, 0], [0.5, 0.16], [0.92, 0.44], [0.78, 0.76], [0, 1], [-0.78, 0.76], [-0.92, 0.44], [-0.5, 0.16]];
  const card = (geo, outline, ox, oy, oz, ax, ay, az, wx, wy, wz, nx, ny, nz, length, width, cup, color) => {
    const base = geo.verts.length / 3;
    for (const [u, v] of outline) {
      const bulge = cup * (1 - Math.abs(u)) * Math.sin(v * Math.PI);
      geo.verts.push(ox + ax * v * length + wx * u * width + nx * bulge, oy + ay * v * length + wy * u * width + ny * bulge, oz + az * v * length + wz * u * width + nz * bulge);
      geo.normals.push(nx, ny, nz);
    }
    const front = outline.map((_, k) => base + k);
    geo.faces.push({ i: front, color, emissive: 0 }, { i: front.slice().reverse(), color, emissive: 0 });
  };
  // A pointed leaf in two painted halves split down its midrib (the lit half a shade lighter), two-sided.
  const LEAF_HALF = [[0, 0], [0.34, 0.22], [0.4, 0.5], [0.24, 0.8], [0, 1]];
  const pointedLeaf = (geo, ox, oy, oz, ax, ay, az, wx, wy, wz, nx, ny, nz, length, light, dark) => {
    for (const [side, color] of [[1, light], [-1, dark]]) {
      const base = geo.verts.length / 3;
      for (const [u, v] of LEAF_HALF) {
        const lift = (1 - Math.abs(u) * 2) * Math.sin(v * Math.PI) * length * 0.07;
        geo.verts.push(ox + ax * v * length + wx * u * side * length + nx * lift, oy + ay * v * length + wy * u * side * length + ny * lift, oz + az * v * length + wz * u * side * length + nz * lift);
        geo.normals.push(nx, ny, nz);
      }
      const ids = LEAF_HALF.map((_, k) => base + k);
      geo.faces.push({ i: ids, color, emissive: 0 }, { i: ids.slice().reverse(), color, emissive: 0 });
    }
  };
  // Foliage as the hand-painted bushes do it: a dark core dome, then rosettes of five or six pointed leaves
  // shingled over the clump, each rosette radiating from a point on the surface and lifted out of it. Every leaf
  // takes the normal pointing out of the clump, so the mass lights softly while its outline stays leafy; rosettes
  // high on the clump take the light greens and low ones the dark.
  const leafy = (geo, cx, cy, cz, rx, ry, rz, tones, rand, count, size) => {
    puff(geo, cx, cy, cz, rx * 0.84, ry * 0.84, rz * 0.84, [tones[0], tones[0], tones[0], tones[0]], rand, 4, 7);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < count; k++) {
      const y = 1 - (k + 0.5) / count * 1.6, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = k * golden + rand() * 0.5;
      let dx = Math.cos(a) * rr, dy = y, dz = Math.sin(a) * rr;
      const dl = Math.hypot(dx, dy, dz);
      dx /= dl; dy /= dl; dz /= dl;
      const reach = 0.9 + rand() * 0.12, px = cx + dx * rx * reach, py = cy + dy * ry * reach, pz = cz + dz * rz * reach;
      // The rosette's own frame in the surface's tangent plane.
      let tx = -dz, ty = 0, tz = dx;
      if (Math.hypot(tx, tz) < 0.2) { tx = 1; tz = 0; }
      const tl = Math.hypot(tx, ty, tz);
      tx /= tl; ty /= tl; tz /= tl;
      const bx = dy * tz - dz * ty, by = dz * tx - dx * tz, bz = dx * ty - dy * tx;
      const band = Math.min(3, Math.max(1, Math.round(1.7 + dy * 1.5 + (rand() - 0.5) * 0.8))), light = tones[band], dark = tones[band - 1];
      const leaves = 5 + (rand() < 0.4 ? 1 : 0), turn0 = rand() * Math.PI * 2, len = size * (0.85 + rand() * 0.3), rise = 0.35 + rand() * 0.2;
      for (let n = 0; n < leaves; n++) {
        const t = turn0 + n / leaves * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
        const ux = tx * c + bx * sn, uy = ty * c + by * sn, uz = tz * c + bz * sn;
        const axX = ux * Math.cos(rise) + dx * Math.sin(rise), axY = uy * Math.cos(rise) + dy * Math.sin(rise), axZ = uz * Math.cos(rise) + dz * Math.sin(rise);
        const wX = axY * dz - axZ * dy, wY = axZ * dx - axX * dz, wZ = axX * dy - axY * dx, wl = Math.hypot(wX, wY, wZ) || 1;
        pointedLeaf(geo, px, py, pz, axX, axY, axZ, wX / wl, wY / wl, wZ / wl, dx, dy, dz, len, light, dark);
      }
    }
    return geo;
  };
  // A five-petal flower lying on a clump's surface facing out along n, with a round centre.
  const PETAL = [[0, 0], [0.55, 0.3], [0.6, 0.7], [0, 1], [-0.6, 0.7], [-0.55, 0.3]];
  const flower = (geo, px, py, pz, nx, ny, nz, petalRgb, heartRgb, size, rand) => {
    let tx = -nz, ty = 0, tz = nx;
    if (Math.hypot(tx, tz) < 0.2) { tx = 1; tz = 0; }
    const tl = Math.hypot(tx, ty, tz);
    tx /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx, turn0 = rand() * Math.PI;
    for (let k = 0; k < 5; k++) {
      const a = turn0 + k / 5 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const ax = tx * c + bx * sn, ay = ty * c + by * sn, az = tz * c + bz * sn, wx = ny * az - nz * ay, wy = nz * ax - nx * az, wz = nx * ay - ny * ax;
      card(geo, PETAL, px + nx * 0.006, py + ny * 0.006, pz + nz * 0.006, ax, ay, az, wx, wy, wz, nx, ny, nz, size, size * 0.5, size * 0.12, petalRgb);
    }
    const heart = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k / 6 * Math.PI * 2) * 0.5, Math.sin(k / 6 * Math.PI * 2) * 0.5 + 0.5]);
    card(geo, heart, px + nx * 0.012 - tx * size * 0.25, py + ny * 0.012 - ty * size * 0.25, pz + nz * 0.012 - tz * size * 0.25, tx, ty, tz, bx, by, bz, nx, ny, nz, size * 0.5, size * 0.5, 0.01, heartRgb);
  };
  const FLOWER_INKS = [["#f2c29a", "#f0a020"], ["#e0707a", "#f0a020"], ["#f5c830", "#e07a1a"], ["#a07cc8", "#f2d24a"], ["#d8402e", "#b0306a"]].map(([p, h]) => [hexToRgb(p), hexToRgb(h)]);
  const GREENS = ["#3f7a2b", "#4f8f36", "#5fa243", "#74b552"];
  const CANOPIES = [GREENS, ["#2f6b3a", "#3f8248", "#4f9a58", "#66b06a"], ["#5a7d2a", "#6f9436", "#86aa44", "#a2c055"], ["#c47f9d", "#d697b0", "#e8b4c6", "#f2c9d8"]];
  const TREE_HEIGHT = 3;
  // CROWNS entries are [cx, cy, cz, rx, ry, rz] in quarter cells, per variant.
  const CROWNS = [
    [[0, 8.6, 0, 4.6, 3.0, 4.4], [-2.2, 9.6, 1.4, 2.6, 2.4, 2.6], [2.0, 7.4, -1.6, 2.4, 2.0, 2.4]],
    [[0, 8.2, 0, 4.2, 2.6, 4.6], [1.6, 10.0, 0.6, 2.8, 2.2, 2.6], [-2.4, 7.6, -0.8, 2.6, 2.2, 2.4]],
    [[0.4, 8.8, -0.4, 4.4, 3.2, 4.2], [-2.6, 8.0, 1.8, 2.8, 2.2, 2.6]],
    [[0, 8.6, 0, 4.6, 3.0, 4.6], [2.2, 9.6, -1.2, 2.6, 2.2, 2.6], [-2.0, 7.6, 1.6, 2.4, 2.0, 2.4]]
  ];
  const BARK = ["#6b4a2b", "#5a3e24", "#4e361f"].map(hexToRgb);
  // A tapered prism of `sides` from a to b, radius ra to rb, faces wound outward.
  const limb = (geo, ax, ay, az, bx, by, bz, ra, rb, sides, color) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const tx = dx / len, ty = dy / len, tz = dz / len;
    // Any vector off the axis, crossed twice, gives the ring's frame.
    let ux = -tz, uy = 0, uz = tx;
    if (Math.abs(ty) > 0.9) { ux = 1; uy = 0; uz = 0; }
    let vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const ul = Math.hypot(ux, uy, uz), vl = Math.hypot(vx, vy, vz);
    ux /= ul; uy /= ul; uz /= ul; vx /= vl; vy /= vl; vz /= vl;
    const ring = (x, y, z, r) => Array.from({ length: sides }, (_, e) => {
      const a = e / sides * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
      geo.verts.push(x + ux * c + vx * s, y + uy * c + vy * s, z + uz * c + vz * s);
      return geo.verts.length / 3 - 1;
    });
    const lo = ring(ax, ay, az, ra), hi = ring(bx, by, bz, rb);
    for (let e = 0; e < sides; e++) {
      const f = (e + 1) % sides, ids = [lo[e], lo[f], hi[f], hi[e]], v = geo.verts;
      const a = lo[e] * 3, b = lo[f] * 3, c = hi[f] * 3;
      const nx = (v[b + 1] - v[a + 1]) * (v[c + 2] - v[a + 2]) - (v[b + 2] - v[a + 2]) * (v[c + 1] - v[a + 1]);
      const ny = (v[b + 2] - v[a + 2]) * (v[c] - v[a]) - (v[b] - v[a]) * (v[c + 2] - v[a + 2]);
      const nz = (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[c] - v[a]);
      const mx = (v[a] + v[c]) / 2 - (ax + bx) / 2, my = (v[a + 1] + v[c + 1]) / 2 - (ay + by) / 2, mz = (v[a + 2] + v[c + 2]) / 2 - (az + bz) / 2;
      geo.faces.push({ i: nx * mx + ny * my + nz * mz < 0 ? ids.reverse() : ids, color, emissive: 0 });
    }
  };
  // Pads a geometry's explicit normals with zeros ("not set") up to its vertex count; call it after anything
  // that adds vertices without normals (`limb`), before the next `puff` or `leafy` writes its own.
  const padNormals = (geo) => {
    while (geo.normals.length < geo.verts.length) geo.normals.push(0);
    return geo;
  };
  // Appends flat-shaded parts (boxes, bevelled timber, lathes) to a `smooth` geometry: every face gets vertices of
  // its own, so the renderer's per-vertex averaging sees one face and keeps it flat. Costs nothing on the GPU,
  // which draws unshared triangle corners either way.
  const flatInto = (geo, ...parts) => {
    for (const part of parts) {
      const v = part.verts;
      for (const f of part.faces) {
        const base = geo.verts.length / 3;
        for (const idx of f.i) geo.verts.push(v[idx * 3], v[idx * 3 + 1], v[idx * 3 + 2]);
        geo.faces.push({ ...f, i: f.i.map((_, k) => base + k) });
      }
      for (const l of part.lines) {
        const base = geo.verts.length / 3;
        for (const idx of l.i) geo.verts.push(v[idx * 3], v[idx * 3 + 1], v[idx * 3 + 2]);
        geo.lines.push({ ...l, i: l.i.map((_, k) => base + k) });
      }
    }
    if (geo.normals) padNormals(geo);
    return geo;
  };
  const cartoonTree = (i, rand) => {
    const geo = { verts: [], faces: [], lines: [], smooth: true, normals: [] }, tones = CANOPIES[i].map(hexToRgb);
    limb(geo, 0, -0.1, 0, 0.05, 2.1, 0.02, 0.24, 0.14, 8, BARK[0]);
    limb(geo, 0.05, 1.55, 0, 0.62, 1.95, 0.02, 0.09, 0.05, 6, BARK[1]);
    if (i % 2) limb(geo, 0, 1.5, -0.1, -0.7, 1.9, -0.3, 0.08, 0.05, 6, BARK[1]);
    // The bark keeps its smooth normals: zeros mean "not given" to the renderer.
    while (geo.normals.length < geo.verts.length) geo.normals.push(0);
    for (const [cx, cy, cz, rx, ry, rz] of CROWNS[i]) leafy(geo, cx * QUARTER, cy * QUARTER, cz * QUARTER, rx * QUARTER, ry * QUARTER, rz * QUARTER, tones, rand, Math.round(14 + rx * rz * 2.6), 0.3);
    geo.normals = Float32Array.from(geo.normals);
    return geo;
  };
  // Tree is TREE_HEIGHT units tall.
  const tree = variants((i) => {
    const rand = mulberry32(101 + i);
    const v = vox();
    const bark = pick(rand, 0, 1, 0.3);
    v.fill(-1, 0, 0, 7, -1, 0, bark);
    for (const [x, z] of [[-2, -1], [1, 0], [0, 1], [-1, -2]]) if (rand() < 0.85) v.set(x, 0, z, bark());
    let lo = Infinity, hi = 0;
    for (const [cx, cy, cz, rx, ry, rz] of CROWNS[i]) {
      blob(v, { cx, cy, cz, rx, ry, rz, chip: 0.35, rand, color: () => 2 });
      lo = Math.min(lo, cy - ry);
      hi = Math.max(hi, cy + ry);
    }
    v.set(1, 6, 0, 1);
    v.set(2, 7, 0, 1);
    if (i % 2) {
      v.set(-2, 6, -1, 1);
      v.set(-3, 7, -1, 1);
    }
    foliage(v, rand, 2, lo, hi);
    let canopyFloor = Infinity, canopyTop = -Infinity;
    for (const [key, color] of v.map) {
      if (color < 2) continue;
      const y = voxCoords(key, CELL)[1];
      canopyFloor = Math.min(canopyFloor, y); canopyTop = Math.max(canopyTop, y + 1);
    }
    // Keep the upper crown standable; lower leaves and branch tips let
    // walkers through, including tall helmets on quarter-unit uphill ledges.
    // Roots and the main trunk remain solid throughout.
    const solid = vox(), middle = Math.max(11, Math.ceil((canopyFloor + canopyTop) / 2));
    for (const [key, color] of v.map) {
      voxCoords(key, CELL);
      const x = CELL[0], y = CELL[1], z = CELL[2];
      if (y >= middle || color < 2 && (y === 0 || x >= -1 && x <= 0 && z >= -1 && z <= 0)) solid.set(x, y, z, color);
    }
    const palette = ["#6b4a2b", "#4e361f", ...CANOPIES[i]];
    // Drawn as a cartoon tree: a tapered eight-sided trunk with its branch stubs under crowns of low-poly
    // puffs on the voxel crown's own ellipsoids. The voxels still decide collision and every measurement below.
    const geometry = cartoonTree(i, rand);
    geometry.collisionGeometry = voxGeo(solid, { unit: QUARTER, palette });
    // Crowns stir in the wind; the collision shell stays where it stands.
    geometry.sway = 0.003;
    let radius = 0, solidRadius = 0;
    for (let j = 0; j < geometry.verts.length; j += 3) radius = Math.max(radius, Math.hypot(geometry.verts[j], geometry.verts[j + 2]));
    const solidVerts = geometry.collisionGeometry.verts;
    for (let j = 0; j < solidVerts.length; j += 3) solidRadius = Math.max(solidRadius, Math.hypot(solidVerts[j], solidVerts[j + 2]));
    geometry.treeRadius = radius;
    geometry.treeSolidRadius = solidRadius;
    geometry.treeCanopyFloor = canopyFloor * QUARTER;
    geometry.treeSolidCanopyFloor = middle * QUARTER;
    return geometry;
  });
  const CLUMPS = [
    [[0, 1.0, 0, 1.9, 1.8, 1.7], [0.7, 1.4, -0.5, 1.3, 1.3, 1.2]],
    [[0, 1.4, 0, 2.5, 2.2, 2.3], [-1.2, 2.0, 0.8, 1.7, 1.6, 1.6], [1.3, 1.8, -0.9, 1.6, 1.5, 1.5]],
    [[0, 1.4, 0, 3.4, 2.0, 2.9], [-1.5, 2.1, 0.6, 2.0, 1.9, 1.9], [1.7, 2.3, -0.5, 2.0, 2.0, 2.0], [0.3, 2.8, 1.0, 1.6, 1.5, 1.5]]
  ];
  // Bushes: leafy clumps on the voxel bushes' own ellipsoids. The first two flower (peach and pink, then yellow and
  // purple), the third carries round red berries.
  const bush = variants((i) => {
    const rand = mulberry32(7 + i), geo = { verts: [], faces: [], lines: [], normals: [] }, tones = ["#3a6e24", "#56902f", "#6fae3a", "#8ccb4b"].map(hexToRgb);
    for (const [cx, cy, cz, rx, ry, rz] of CLUMPS[i]) leafy(geo, cx * QUARTER, cy * 0.8 * QUARTER, cz * QUARTER, rx * 1.12 * QUARTER, ry * 0.82 * QUARTER, rz * 1.12 * QUARTER, tones, rand, Math.round(10 + rx * rz * 3.2), 0.17);
    const [cx, cy, cz, rx, ry, rz] = CLUMPS[i][0];
    for (let n = 0; n < (i === 2 ? 9 : 6); n++) {
      const a = rand() * Math.PI * 2, up = 0.25 + rand() * 0.6, side = Math.sqrt(1 - up * up);
      const nx = Math.cos(a) * side, ny = up, nz = Math.sin(a) * side;
      const px = (cx + nx * rx * 1.02) * QUARTER, py = (cy + ny * ry * 1.02) * QUARTER, pz = (cz + nz * rz * 1.02) * QUARTER;
      if (i === 2) puff(geo, px, py, pz, 0.05, 0.05, 0.05, [hexToRgb("#a8221f"), hexToRgb("#c8322e"), hexToRgb("#e0473c"), hexToRgb("#ff6a55")], rand, 3, 6);
      else {
        const ink = FLOWER_INKS[(i * 2 + n) % FLOWER_INKS.length];
        flower(geo, px, py, pz, nx, ny, nz, ink[0], ink[1], 0.075, rand);
      }
    }
    geo.normals = Float32Array.from(geo.normals);
    return Object.assign(geo, { sway: 0.03 });
  });
  // The voxel boulder the mine's crack rock is veined for; everywhere else takes the cartoon `rock`.
  const ROCK_SHAPES = [{ rx: 3.2, ry: 3.6, rz: 2.8 }, { rx: 5, ry: 3.8, rz: 4.2 }];
  const voxelRock = variants((i) => {
    const rand = mulberry32(211 + i);
    const v = vox();
    const { rx, ry, rz } = ROCK_SHAPES[i];
    blob(v, { cx: 0.5, cy: 0.4, cz: 0.5, rx, ry, rz, chip: 0.2, floor: 0, rand, color: pick(rand, 0, 1, 0.3) });
    let top = 0;
    for (const k of v.map.keys()) top = Math.max(top, voxCoords(k, CELL)[1]);
    for (const [k, c] of v.map) {
      voxCoords(k, CELL);
      const x = CELL[0], y = CELL[1], z = CELL[2];
      if (y >= top * 2 / 3 && !v.has(x, y + 1, z) && rand() < 0.3) v.map.set(k, 3);
      else if (c === 0 && rand() < 0.15) v.map.set(k, 2);
    }
    return voxGeo(v, { unit: QUARTER, palette: ["#6b625a", "#57504a", "#7a716a", "#5b7f3a"], origin: QHALF });
  });
  // Rocks are rounded cartoon boulders: squat puffs with smooth normals and a gentle seeded wobble, a smaller
  // stone leaning on the larger, and a cushion of moss on top.
  const ROCK_TONES = ["#5d5650", "#6b625a", "#7a716a", "#8b837b"].map(hexToRgb), MOSS = ["#4a6b2c", "#5b7f3a", "#6d9444", "#80a852"].map(hexToRgb);
  // Variant 2 is the Mempool island's jungle rock: low and wide, a second stone tucked under it, a deeper moss cap.
  const ROCK_STONES = [
    [[0, 0.34, 0, 0.5, 0.48, 0.44], [0.4, 0.16, 0.18, 0.28, 0.22, 0.26]],
    [[0, 0.38, 0, 0.72, 0.55, 0.62], [0.62, 0.22, -0.3, 0.42, 0.32, 0.38], [-0.45, 0.18, 0.35, 0.3, 0.22, 0.28]],
    [[0, 0.32, 0, 0.62, 0.4, 0.54], [-0.5, 0.16, -0.22, 0.34, 0.24, 0.3]]
  ];
  const rock = variants((i) => {
    const rand = mulberry32(211 + i), geo = { verts: [], faces: [], lines: [], smooth: true };
    const stones = ROCK_STONES[i];
    for (const [x, y, z, rx, ry, rz] of stones) puff(geo, x, y, z, rx, ry, rz, ROCK_TONES, rand, 5, 9);
    const [x, y, z, rx, ry, rz] = stones[0];
    puff(geo, x - rx * 0.1, y + ry * (i === 2 ? 0.72 : 0.82), z, rx * (i === 2 ? 0.8 : 0.62), ry * (i === 2 ? 0.3 : 0.2), rz * (i === 2 ? 0.78 : 0.6), MOSS, rand, 3, 8);
    return geo;
  });
  // The shootable meadow stone has irregular shoulders and a moss cover that follows the upper facets.
  const breakableRock = cached(() => {
    const geo = geometry(), rand = mulberry32(449), rings = [], sides = 24;
    const levels = [[0.04, 0.48, 0.4], [0.13, 0.66, 0.54], [0.28, 0.74, 0.61], [0.44, 0.76, 0.62],
      [0.6, 0.73, 0.6], [0.76, 0.67, 0.55], [0.9, 0.58, 0.48], [1.02, 0.48, 0.4]];
    const angles = [], wrinkles = [], mossEdge = [];
    for (let s = 0; s < sides; s++) {
      const a = s / sides * Math.PI * 2;
      angles.push(a);
      wrinkles.push(0.95 + 0.05 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 7 - 0.4) + rand() * 0.06);
      mossEdge.push(0.63 + 0.09 * Math.sin(a * 2 + 0.5) + 0.08 * Math.sin(a * 5 - 0.7) + (rand() - 0.5) * 0.07);
    }
    for (let level = 0; level < levels.length; level++) {
      const [y, rx, rz] = levels[level], row = [];
      for (let s = 0; s < sides; s++) {
        const a = angles[s], c = Math.cos(a), d = Math.sin(a), contour = wrinkles[s] * (0.97 + rand() * 0.06);
        row.push(pushVert(geo, Math.sign(c) * Math.abs(c) ** 0.76 * rx * contour,
          y + (level === 0 ? 0 : 0.02 * Math.sin(a * 4 + level) + (rand() - 0.5) * 0.025),
          Math.sign(d) * Math.abs(d) ** 0.76 * rz * contour));
      }
      rings.push(row);
    }
    const stone = ["#363b38", "#414642", "#4c514c", "#595e57", "#656960"].map(hexToRgb);
    const lichen = ["#3d4d38", "#465b38", "#526640", "#596d41"].map(hexToRgb);
    const moss = ["#365824", "#456b2b", "#557d30", "#668b34", "#789b3d"].map(hexToRgb);
    const ink = (y, edge) => y > edge + 0.07 ? moss[Math.floor(rand() * moss.length)]
      : y > edge - 0.07 ? lichen[Math.floor(rand() * lichen.length)]
        : stone[Math.floor(rand() * stone.length)];
    for (let level = 0; level < rings.length - 1; level++) for (let s = 0; s < sides; s++) {
      const next = (s + 1) % sides, lo = rings[level], hi = rings[level + 1];
      const edge = (mossEdge[s] + mossEdge[next]) * 0.5;
      face(geo, [lo[s], hi[s], hi[next]], ink((levels[level][0] + 2 * levels[level + 1][0]) / 3, edge));
      face(geo, [lo[s], hi[next], lo[next]], ink((2 * levels[level][0] + levels[level + 1][0]) / 3, edge));
    }
    const top = pushVert(geo, -0.03, 1.11, 0.02), rim = rings[rings.length - 1];
    for (let s = 0; s < sides; s++) face(geo, [top, rim[(s + 1) % sides], rim[s]], moss[Math.floor(rand() * moss.length)]);
    // Fine, uneven tufts texture the continuous cap without reading as separate round clumps.
    for (let n = 0; n < 190; n++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.94;
      const x = Math.cos(a) * 0.45 * r, z = Math.sin(a) * 0.37 * r;
      const y = 1.11 - 0.08 * r + (rand() - 0.5) * 0.012;
      const spread = 0.012 + rand() * 0.017, height = 0.02 + rand() * 0.045;
      const tip = pushVert(geo, x + (rand() - 0.5) * spread, y + height, z + (rand() - 0.5) * spread);
      const a0 = pushVert(geo, x - spread, y, z - spread);
      const b0 = pushVert(geo, x + spread, y, z - spread);
      const c0 = pushVert(geo, x, y, z + spread);
      face(geo, [a0, b0, tip], moss[Math.floor(rand() * moss.length)]);
      face(geo, [b0, c0, tip], moss[Math.floor(rand() * moss.length)]);
      face(geo, [c0, a0, tip], moss[Math.floor(rand() * moss.length)]);
    }
    return geo;
  });
  const altarSlab = cached(() => lathe({
    profile: [[0, 0], [1, 0], [1, 0.82], [0.96, 1], [0, 1]],
    segments: 32,
    color: (t) => t < 0.5 ? "#57504a" : "#756b62"
  }));
  // Unit block: instanced around the altar edge as it grows.
  const altarBlock = variants((i) => box({ color: STONE[i % STONE.length], offset: { y: 0.5 } }));
  // The meadow's crate and barrel keep their first builds as collision shells; what is drawn adds detail at the
  // same size, so walking, breaking and the reward reveal (which reads the drawn height) are unchanged.
  const crateShell = () => merge(
    box({ w: 0.9, h: 0.9, d: 0.9, color: PLANK, offset: { y: 0.45 } }),
    ...[[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => box({ w: 0.1, h: 0.94, d: 0.1, color: WOOD_DK, offset: { x, y: 0.47, z } })),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: -0.42 } }),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: 0.42 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: -0.42, y: 0.89 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: 0.42, y: 0.89 } })
  );
  const IRON = "#3b3d42", RIVET = "#8a8f98", CRATE_PLANKS = ["#b07a42", "#a06c38", "#bc864c"];
  // The nine-pixel banana from the AK ammo meter's weapon-banana-glyph.
  const AMMO_BANANA = { ink: { D: "#211b14", Y: "#ffd84a", G: "#789a3b" }, rows: [
    "DGD......", "DGD......", "DYYD.....", "DYYD.....", "DYYYD....",
    ".DYYYD...", ".DYYYYD..", "..DDYYYD.", "....DDDD."
  ] };
  const crateBanana = () => {
    const geo = geometry(), cell = 0.045, z = 0.486;
    for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
      const ch = AMMO_BANANA.rows[row][col];
      if (ch === ".") continue;
      const x = (col - 4) * cell, y = 0.47 + (4 - row) * cell;
      const a = pushVert(geo, x - cell / 2, y - cell / 2, z);
      const b = pushVert(geo, x + cell / 2, y - cell / 2, z);
      const c = pushVert(geo, x + cell / 2, y + cell / 2, z);
      const d = pushVert(geo, x - cell / 2, y + cell / 2, z);
      face(geo, [a, b, c, d], hexToRgb(AMMO_BANANA.ink[ch]));
    }
    return geo;
  };
  // Moves a built part by (x, y, z), in place.
  const moved = (geo, x, y, z) => {
    for (let i = 0; i < geo.verts.length; i += 3) { geo.verts[i] += x; geo.verts[i + 1] += y; geo.verts[i + 2] += z; }
    return geo;
  };
  // Separate bevelled planks with thin dark gaps between them, chunky bevelled corner posts and rails, a diagonal
  // brace across the two broad faces, and riveted iron brackets on the top corners. The decorative variant has
  // its lid slid aside; variant 1 is open for coal and dynamite; variant 2 marks the shootable ammo crate.
  const woodCrate = variants((variant) => {
    const open = variant !== 2;
    const parts = variant === 0 ? [
      box({ w: 0.74, h: 0.08, d: 0.74, color: "#302012", offset: { y: 0.1 } }),
      ...[-0.35, 0.35].map((x) => box({ w: 0.06, h: 0.7, d: 0.7, color: "#49301b", offset: { x, y: 0.48 } })),
      ...[-0.35, 0.35].map((z) => box({ w: 0.7, h: 0.7, d: 0.06, color: "#49301b", offset: { y: 0.48, z } }))
    ] : [box({ w: 0.76, h: 0.76, d: 0.76, color: "#3a2616", offset: { y: 0.45 } })];
    // Three planks a side, turned to face out of each of the four sides, and three across the lid.
    for (let side = 0; side < 4; side++) for (let k = 0; k < 3; k++) {
      const plank = bevelBox({ w: 0.78, h: 0.24, d: 0.05, color: CRATE_PLANKS[(k + side) % 3], bevel: 0.02, offset: { y: 0.18 + k * 0.27, z: 0.425 } });
      parts.push(turn(plank, side * Math.PI / 2));
    }
    if (!open || variant === 0) for (let k = 0; k < 3; k++) parts.push(bevelBox({ w: 0.78, h: 0.05, d: 0.24, color: CRATE_PLANKS[(k + 1) % 3], bevel: 0.02, offset: { x: variant === 0 ? 0.34 : 0, y: variant === 0 ? 0.97 : 0.875, z: (k - 1) * 0.27 } }));
    if (variant === 0) for (const z of [-0.27, 0.27]) parts.push(bevelBox({ w: 0.72, h: 0.035, d: 0.08, color: WOOD_DK, bevel: 0.01, offset: { x: 0.34, y: 1.005, z } }));
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) parts.push(bevelBox({ w: 0.12, h: 0.94, d: 0.12, color: WOOD_DK, bevel: 0.03, offset: { x, y: 0.47, z } }));
    for (const y of [0.05, 0.89]) {
      for (const z of [-0.42, 0.42]) parts.push(bevelBox({ w: 0.94, h: 0.1, d: 0.11, color: WOOD_DK, bevel: 0.025, offset: { y, z } }));
      for (const x of [-0.42, 0.42]) parts.push(bevelBox({ w: 0.11, h: 0.1, d: 0.94, color: WOOD_DK, bevel: 0.025, offset: { x, y } }));
    }
    // The brace: one bevelled board corner to corner across each broad face.
    for (const z of [-0.46, 0.46]) parts.push(moved(turn(bevelBox({ w: 1.0, h: 0.1, d: 0.04, color: WOOD, bevel: 0.015 }), 0, Math.atan2(0.72, 0.72)), 0, 0.47, z));
    if (variant === 2) for (let side = 0; side < 4; side++) parts.push(turn(crateBanana(), side * Math.PI / 2));
    // Iron brackets folded over the four top corners, two rivets each.
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
      parts.push(bevelBox({ w: 0.16, h: 0.14, d: 0.16, color: IRON, bevel: 0.02, offset: { x, y: 0.86, z } }));
      for (const [dx, dz] of [[Math.sign(x) * 0.085, 0], [0, Math.sign(z) * 0.085]]) parts.push(box({ w: 0.03, h: 0.03, d: 0.03, color: RIVET, offset: { x: x + dx, y: 0.84, z: z + dz } }));
    }
    const geo = merge(...parts);
    geo.collisionGeometry = crateShell();
    return geo;
  });
  // The first barrel, kept as the drawn barrel's collision shell.
  const barrelShell = () => merge(
    lathe({ profile: [[0.32, 0], [0.4, 0.16], [0.43, 0.45], [0.4, 0.74], [0.32, 0.9], [0, 0.9]], segments: 8, color: "#7a5230" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.24, segments: 8, color: "#3a2a1a" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.66, segments: 8, color: "#3a2a1a" })
  );
  // The same bulge in fourteen staves of alternating wood, a chamfered lip, iron hoops set with rivets, and a
  // spigot near the foot. The decorative head is slid aside; variant 1 marks the shootable ammo barrel.
  const BARREL_PROFILE = [[0.3, 0], [0.33, 0.03], [0.4, 0.16], [0.43, 0.45], [0.4, 0.74], [0.33, 0.87], [0.31, 0.9]];
  const STAVES = ["#7a5230", "#8a5e36", "#6e4a2a"].map(hexToRgb);
  const barrel = variants((ammo) => {
    const segs = 14, geo = { verts: [], faces: [], lines: [] };
    const rings = BARREL_PROFILE.map(([r, y]) => Array.from({ length: segs }, (_, s) => {
      const a = s / segs * Math.PI * 2;
      geo.verts.push(Math.cos(a) * r, y, Math.sin(a) * r);
      return geo.verts.length / 3 - 1;
    }));
    for (let p = 0; p < rings.length - 1; p++) for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      geo.faces.push({ i: [rings[p][s], rings[p + 1][s], rings[p + 1][s2], rings[p][s2]], color: STAVES[s % 3], emissive: 0 });
    }
    const radiusAt = (y) => {
      for (let k = 0; k < BARREL_PROFILE.length - 1; k++) {
        const [r0, y0] = BARREL_PROFILE[k], [r1, y1] = BARREL_PROFILE[k + 1];
        if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
      }
      return BARREL_PROFILE[BARREL_PROFILE.length - 1][0];
    };
    const parts = [geo];
    if (ammo) {
      parts.push(lathe({ profile: [[0.3, 0.875], [0, 0.875]], segments: segs, color: "#5e3f22" }));
      for (const k of [-1, 0, 1]) parts.push(box({ w: 0.012, h: 0.006, d: 0.5, color: "#3e2814", offset: { x: k * 0.1, y: 0.879 } }));
      parts.push(moved(lathe({ profile: [[0.045, 0.875], [0.045, 0.9], [0, 0.9]], segments: 8, color: "#3e2814" }), 0.16, 0, 0.08));
    } else {
      // The inset floor and inner staves show below a head resting partway across the opening.
      parts.push(lathe({ profile: [[0.29, 0.88], [0.27, 0.58], [0, 0.58]], segments: segs, color: "#382514" }));
      parts.push(moved(lathe({ profile: [[0.3, 0.92], [0.3, 0.97], [0, 0.97]], segments: segs, color: "#77502e" }), 0.22, 0, -0.04));
      for (const k of [-1, 0, 1]) parts.push(box({ w: 0.012, h: 0.007, d: 0.48, color: "#4b301a", offset: { x: 0.22 + k * 0.1, y: 0.975, z: -0.04 } }));
    }
    // Hoops: bevelled iron bands at the foot, either side of the belly and the lip, with rivets on the two middle ones.
    for (const [y, h] of [[0.05, 0.05], [0.26, 0.06], [0.64, 0.06], [0.85, 0.05]]) {
      const r = radiusAt(y) + 0.012;
      parts.push(lathe({ profile: [[r - 0.01, y - h / 2], [r + 0.012, y - h / 2 + 0.01], [r + 0.012, y + h / 2 - 0.01], [r - 0.01, y + h / 2]], segments: segs, color: IRON }));
      if (h > 0.055) for (let s = 0; s < 7; s++) {
        const a = (s + 0.5) / 7 * Math.PI * 2;
        parts.push(box({ w: 0.028, h: 0.028, d: 0.028, color: RIVET, offset: { x: Math.cos(a) * (r + 0.014), y, z: Math.sin(a) * (r + 0.014) } }));
      }
    }
    if (ammo) {
      // Three AK ammo meter bananas follow the barrel's curve at even thirds.
      const art = AMMO_BANANA, cell = 0.04;
      for (let mark = 0; mark < 3; mark++) for (let row = 0; row < art.rows.length; row++) for (let col = 0; col < art.rows[row].length; col++) {
        const ch = art.rows[row][col];
        if (ch === ".") continue;
        const y = 0.45 - (row - 4) * cell, a = mark * Math.PI * 2 / 3 + (col - 4) * cell / radiusAt(y), r = radiusAt(y) + 0.004;
        parts.push(turn(box({ w: 0.006, h: cell, d: cell, color: art.ink[ch], offset: { x: r, y } }), a));
      }
    }
    // A wooden spigot near the foot, turned away from the front.
    parts.push(turn(merge(
      box({ w: 0.08, h: 0.05, d: 0.05, color: "#5c4425", offset: { x: radiusAt(0.18) + 0.03, y: 0.18 } }),
      box({ w: 0.03, h: 0.07, d: 0.03, color: IRON, offset: { x: radiusAt(0.18) + 0.06, y: 0.15 } })
    ), Math.PI * 0.75));
    const out = merge(...parts);
    out.collisionGeometry = barrelShell();
    return out;
  });
  // A flower patch: a rosette of leaves on the ground and three stems, each topped with a five-petal flower.
  const flowerTuft = cached(() => {
    const geo = { verts: [], faces: [], lines: [], smooth: true, normals: [] }, rand = mulberry32(61), green = hexToRgb("#4f8f36");
    for (const [x, z, h] of [[-0.12, 0.05, 0.3], [0.03, -0.1, 0.36], [0.13, 0.09, 0.26]]) limb(geo, x, 0, z, x * 1.2, h, z * 1.2, 0.012, 0.009, 5, green);
    while (geo.normals.length < geo.verts.length) geo.normals.push(0);
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + rand() * 0.4, ax = Math.cos(a), az = Math.sin(a), up = 0.35;
      card(geo, LEAF, 0, 0.01, 0, ax * (1 - up), up, az * (1 - up), -az, 0, ax, 0, 1, 0, 0.2, 0.07, 0.015, hexToRgb(k % 2 ? "#5b9a3a" : "#4a8530"));
    }
    [[-0.12, 0.05, 0.3, 4], [0.03, -0.1, 0.36, 2], [0.13, 0.09, 0.26, 0]].forEach(([x, z, h, ink]) => {
      const nx = x * 0.6, nz = z * 0.6, l = Math.hypot(nx, 1, nz);
      flower(geo, x * 1.2, h, z * 1.2, nx / l, 1 / l, nz / l, FLOWER_INKS[ink][0], FLOWER_INKS[ink][1], 0.06, rand);
    });
    geo.normals = Float32Array.from(geo.normals);
    return geo;
  });
  const torch = cached(() => {
    const geo = merge(
      box({ w: 0.14, h: 1.1, d: 0.14, color: WOOD_DK, offset: { y: 0.55 } }),
      box({ w: 0.24, h: 0.16, d: 0.24, color: "#3a2a18", offset: { y: 1.16 } }),
      box({ w: 0.26, h: 0.26, d: 0.26, color: "#ffb13b", emissive: 1, offset: { y: 1.36 } })
    );
    geo.castShadow = false;
    geo.backZ = -0.13;
    geo.flameY = 1.36;
    return geo;
  });
  // A grass tuft, cartoon rather than voxel: seven tapered blades fanning out from one root, each a three-sided
  // blade in three segments bending out along its lean, dark green at the root to yellow-green at the tip. Closed
  // blades read from every side without double-sided faces. `grassTuft` is the lawn's and the scatter's one shape.
  const GRASS_TONES = ["#3f7a2c", "#5c9a3a", "#86c24f", "#b4dc6a"].map(hexToRgb);
  const grassTuft = cached(() => {
    const geo = { verts: [], faces: [], lines: [] }, rand = mulberry32(89);
    for (let n = 0; n < 7; n++) {
      const yaw = n / 7 * Math.PI * 2 + rand() * 0.6, h = (n ? 0.2 + rand() * 0.14 : 0.36), lean = n ? 0.1 + rand() * 0.1 : 0.03, w = 0.035 + rand() * 0.012;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), root = n ? 0.03 : 0;
      // Rings of three points up the blade, then one tip point; faces wind outward.
      const vert = (x, y, z) => (geo.verts.push(x, y, z), geo.verts.length / 3 - 1);
      const rings = [];
      for (let k = 0; k < 3; k++) {
        const t = k / 3, out = root + lean * t * t, half = w * (1 - t * 0.7);
        rings.push([0, 1, 2].map((e) => {
          const a = yaw + e * Math.PI * 2 / 3;
          return vert(cy * out + Math.cos(a) * half, h * t, sy * out + Math.sin(a) * half);
        }));
      }
      const tip = vert(cy * (root + lean), h, sy * (root + lean));
      for (let e = 0; e < 3; e++) {
        const f = (e + 1) % 3;
        for (let k = 0; k < 2; k++) geo.faces.push({ i: [rings[k][e], rings[k + 1][e], rings[k + 1][f], rings[k][f]], color: GRASS_TONES[k], emissive: 0 });
        geo.faces.push({ i: [rings[2][e], tip, rings[2][f]], color: GRASS_TONES[n % 2 ? 2 : 3], emissive: 0 });
      }
    }
    return Object.assign(noShadow(geo), { sway: 0.3 });
  });
  const grass = grassTuft;
  // The lawn's instanced batch takes the same tuft as its own geometry object, so it never shares a GPU record
  // with the scattered tufts.
  const lawnTuft = cached(() => ({ ...grassTuft() }));
  // Lantern hangs below the origin; the origin is its hook.
  const lantern = cached(() => noShadow(merge(
    box({ w: 0.06, h: 0.08, d: 0.06, color: "#3a2a18", offset: { y: -0.04 } }),
    box({ w: 0.24, h: 0.04, d: 0.24, color: "#2b2521", offset: { y: -0.1 } }),
    ...[[-0.105, -0.105], [0.105, -0.105], [-0.105, 0.105], [0.105, 0.105]].map(([x, z]) => box({ w: 0.03, h: 0.3, d: 0.03, color: "#2b2521", offset: { x, y: -0.27, z } })),
    box({ w: 0.24, h: 0.04, d: 0.24, color: "#2b2521", offset: { y: -0.44 } }),
    box({ w: 0.13, h: 0.16, d: 0.13, color: "#ffd27a", emissive: 1, offset: { y: -0.27 } })
  )));
  // Firepit geometry only; the flame is fireFlame.
  const firepit = cached(() => {
    const rand = mulberry32(131);
    return merge(
      box({ w: 1.1, h: 0.04, d: 1.1, color: "#2a2522", offset: { y: 0.02 } }),
      ...Array.from({ length: 8 }, (_, n) => {
        const a = n * Math.PI / 4 + (rand() - 0.5) * 0.3, h = 0.2 + rand() * 0.12;
        return turn(box({ w: 0.28 + rand() * 0.1, h, d: 0.24 + rand() * 0.1, color: STONE[n % 3], offset: { x: 0.7, y: h * 0.5 } }), a, 0);
      }),
      ...Array.from({ length: 3 }, (_, n) => turn(box({ w: 0.9, h: 0.14, d: 0.14, color: WOOD_DK, offset: { y: 0.12 + n * 0.05 } }), n * Math.PI / 3, 0.18))
    );
  });
  const FLAME = [[0.34, 0.3, 0.22, 0, 0, "#ff9a2e"], [0.26, 0.22, 0.44, 0.02, -0.02, "#ffc148"], [0.2, 0.18, 0.6, 0.06, 0.03, "#ffc148"], [0.16, 0.14, 0.72, 0.03, 0.05, "#fff0b0"], [0.12, 0.12, 0.84, -0.01, 0.02, "#fff0b0"], [0.14, 0.16, 0.36, -0.16, 0.04, "#ffc148"], [0.12, 0.14, 0.5, 0.17, 0.1, "#ff9a2e"]];
  const fireFlame = cached(() => noShadow(merge(...FLAME.map(([w, h, y, x, z, color]) => box({ w, h, d: w, color, emissive: 1, offset: { x, y, z } })))));
  const WINGS = [["#f2c94c", "#e04a3a"], ["#f3efe4", "#6f9fca"]];
  const butterfly = variants((i) => {
    const [wing, spot] = WINGS[i];
    return noShadow(merge(
      box({ w: 0.02, h: 0.02, d: 0.08, color: "#2b2521" }),
      ...[-1, 1].flatMap((side) => [
        turn(box({ w: 0.1, h: 0.01, d: 0.07, color: wing, offset: { x: side * 0.05 } }), 0, side * 0.61),
        turn(box({ w: 0.04, h: 0.012, d: 0.03, color: spot, offset: { x: side * 0.065, z: 0.01 } }), 0, side * 0.61)
      ])
    ));
  });
  const firefly = cached(() => noShadow(box({ w: 0.06, h: 0.06, d: 0.06, color: "#d9ff6a", emissive: 1 })));
  const ember = cached(() => noShadow(box({ w: 0.05, h: 0.05, d: 0.05, color: "#ff8a2a", emissive: 1 })));
  const vine = cached(() => {
    const rand = mulberry32(53);
    const leaves = [];
    [[-0.42, 5], [0.02, 4], [0.44, 3]].forEach(([x, count]) => {
      for (let n = 0; n < count; n++) leaves.push(box({ w: 0.26, h: 0.34, d: 0.18, color: n % 2 ? "#3e7a2c" : "#4f8a3d", offset: { x: x + (rand() - 0.5) * 0.08, y: -0.17 - n * 0.34 } }));
    });
    const geo = merge(...leaves);
    geo.castShadow = false;
    return geo;
  });
  const CLOUD_PUFFS = [
    [[0, 3, 2.6], [3, 4.5, 2]],
    [[-2, 3.4, 3], [2.5, 4.4, 2.6], [6, 3, 2.2]],
    [[-4, 3.6, 3.2], [0, 5, 3.6], [4, 4.4, 3], [7.5, 3, 2.4]]
  ];
  const cloud = variants((i) => {
    const rand = mulberry32(307 + i);
    const v = vox();
    const puffs = CLOUD_PUFFS[i];
    const mid = (puffs[0][0] + puffs[puffs.length - 1][0]) / 2;
    for (const [cx, rx, rz] of puffs) blob(v, { cx: cx - mid + 0.5, cy: 1, cz: 0.5, rx, ry: 1.6, rz, chip: 0.3, rand, color: (x, y) => y > 0 ? 0 : 1 });
    // A flat base under the puffs, the way a cumulus sits on the air, grown straight down from the
    // cells already there: every cell added sits under another, so the cloud gains body without a
    // single new top face (the render mesh is the surface an Ooga lands on). The base rounds up toward
    // the rim so the cloud does not end in a slab, and it is set by each puff's ellipse rather than
    // by the column heights, which the chipping makes ragged.
    const lows = new Map();
    for (const [k] of v.map) {
      voxCoords(k, CELL);
      const key = CELL[0] * 4096 + CELL[2], low = lows.get(key);
      if (low === undefined || CELL[1] < low.min) lows.set(key, { x: CELL[0], z: CELL[2], min: CELL[1] });
    }
    for (const { x, z, min } of lows.values()) {
      let inner = 0;
      for (const [cx, rx, rz] of puffs) {
        const dx = (x + 0.5 - (cx - mid + 0.5)) / rx, dz = (z + 0.5 - 0.5) / rz;
        inner = Math.max(inner, 1 - dx * dx - dz * dz);
      }
      const bottom = CLOUD_BASE + Math.round(CLOUD_ROUND * (1 - Math.sqrt(Math.max(0, inner))));
      for (let y = min - 1; y >= bottom; y--) v.set(x, y, z, 1);
    }
    const geo = voxGeo(v, { unit: VOX, palette: ["#f7f9fb", "#dfe6ee"], origin: { x: -VOX / 2, y: -VOX, z: -VOX / 2 } });
    geo.castShadow = false;
    geo.cutawayPreserve = true;
    return geo;
  });
  const ladder = cached(() => merge(
    box({ w: 0.1, h: 4, d: 0.1, color: WOOD, offset: { x: -0.4, y: 2 } }),
    box({ w: 0.1, h: 4, d: 0.1, color: WOOD, offset: { x: 0.4, y: 2 } }),
    ...Array.from({ length: 9 }, (_, n) => box({ w: 0.9, h: 0.08, d: 0.08, color: "#7a5630", offset: { y: 0.35 + n * 0.42 } }))
  ));
  const dock = cached(() => {
    // Two braces carry the outer edge back into the cliff. Keeping their
    // upper ends at the old outer posts preserves the dock's silhouette while
    // removing the redundant pair beside the island.
    const innerX = 0.35, innerY = -2.2, outerX = 3.88, outerY = -0.17;
    const dx = outerX - innerX, dy = outerY - innerY, length = Math.hypot(dx, dy);
    const brace = (z) => {
      const geo = turn(box({ w: 0.2, h: length, d: 0.2, color: "#6b4a2b" }), 0, -Math.atan2(dx, dy));
      for (let i = 0; i < geo.verts.length; i += 3) {
        geo.verts[i] += (innerX + outerX) / 2;
        geo.verts[i + 1] += (innerY + outerY) / 2;
        geo.verts[i + 2] += z;
      }
      return geo;
    };
    return merge(
      ...Array.from({ length: 8 }, (_, n) => bevelBox({ w: 0.46, h: 0.2, d: 2, color: n % 2 ? "#8f6538" : "#9c7040", bevel: 0.045, offset: { x: 0.25 + n * 0.5, y: -0.1 } })),
      bevelBox({ w: 4, h: 0.26, d: 0.26, color: WOOD_DK, offset: { x: 2, y: -0.3, z: -0.86 } }),
      bevelBox({ w: 4, h: 0.26, d: 0.26, color: WOOD_DK, offset: { x: 2, y: -0.3, z: 0.86 } }),
      ...[-0.8, 0.8].map(brace)
    );
  });
  BL.hubModels = { SIGN_GLYPHS, SIGN_ICONS, jetpack, jetFlame, caveMouthRim, mirrorPanel, matrixPrisonBars, sealedCaveFace, matrixLeverPlate, matrixLeverLights, matrixLeverHub, matrixLeverArm, matrixLeverGrip, matrixLeverLabels, matrixGlyph, caveSign, postSign, CAVE_SIGN_WIDTH, CAVE_SIGN_HEIGHT, gate, caveShelves, entropyLab, bedroll, tree, bush, rock, breakableRock, voxelRock, puff, leafy, pointedLeaf, flower, FLOWER_INKS, limb, padNormals, flatInto, altarSlab, altarBlock, woodCrate, barrel, flowerTuft, torch, grass, lawnTuft, lantern, firepit, fireFlame, butterfly, firefly, ember, vine, cloud, ladder, dock, TREE_HEIGHT };
})();
