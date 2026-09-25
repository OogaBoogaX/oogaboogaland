// Hub props; each builder returns one cached geometry shared by every instance.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { hexToRgb, mulberry32 } = BL.math;
  const { box, lathe, ring, merge, cached, variants, makeVox: vox, voxelGeometry: voxGeo, voxCoords } = BL.models;
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
  const caveSign = (text = "EntropyLab") => {
    const hit = SIGN_CACHE.get(text);
    if (hit) return hit;
    let cells = -1;
    for (const ch of text) cells += ch === " " ? 2 : 4;
    const textW = cells * SIGN_CELL;
    const width = Math.max(CAVE_SIGN_WIDTH, textW + SIGN_PAD);
    const half = CAVE_SIGN_HEIGHT * 0.5;
    // Sign's front face sits at SIGN_FRONT.
    const geos = [
      box({ w: width, h: CAVE_SIGN_HEIGHT, d: 0.14, color: WOOD_DK }),
      box({ w: width - 0.24, h: half, d: 0.16, color: WOOD, offset: { y: half * 0.5, z: 0.15 } }),
      box({ w: width - 0.24, h: half, d: 0.16, color: PLANK, offset: { y: -half * 0.5, z: 0.15 } }),
      ...[-1, 1].flatMap((side) => [half * 0.5, -half * 0.5].map((y) => box({ w: 0.12, h: half, d: 0.16, color: "#4a3319", offset: { x: side * (width * 0.5 - 0.06), y, z: 0.15 } }))),
      box({ w: width + 0.3, h: 0.08, d: 0.34, color: WOOD_DK, offset: { y: half + 0.18, z: 0.08 } }),
      ...[-1, 1].map((side) => box({ w: 0.06, h: 0.2, d: 0.06, color: "#3a2a18", offset: { x: side * (width * 0.5 - 0.3), y: half + 0.07, z: 0.08 } })),
      box({ w: width - 0.2, h: 0.025, d: 0.025, color: "#7a5630", offset: { y: 0.235, z: SIGN_FRONT + 0.0175 } }),
      box({ w: width - 0.2, h: 0.025, d: 0.025, color: "#7a5630", offset: { y: -0.31, z: SIGN_FRONT + 0.0175 } })
    ];
    let cursor = -textW * 0.5;
    for (const ch of text) {
      if (ch === " ") {
        cursor += SIGN_CELL * 2;
        continue;
      }
      const glyph = SIGN_GLYPHS[ch];
      if (!glyph) throw new Error(`No cave-sign glyph for "${ch}"`);
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] !== "1") continue;
          geos.push(box({ w: SIGN_PIXEL, h: SIGN_PIXEL, d: 0.035, color: "#f3efe4", emissive: 0.2, offset: { x: cursor + col * SIGN_CELL + SIGN_CELL * 0.5, y: (2 - row) * SIGN_CELL, z: SIGN_FRONT + 0.0125 } }));
        }
      }
      cursor += SIGN_CELL * 4;
    }
    for (const x of [-width * 0.5 + 0.13, width * 0.5 - 0.13]) {
      for (const y of [-CAVE_SIGN_HEIGHT * 0.5 + 0.13, CAVE_SIGN_HEIGHT * 0.5 - 0.13]) {
        geos.push(box({ w: 0.07, h: 0.07, d: 0.035, color: "#3a2a18", offset: { x, y, z: SIGN_FRONT + 0.0125 } }));
      }
    }
    const geo = merge(...geos);
    geo.signWidth = width;
    geo.signHeight = CAVE_SIGN_HEIGHT;
    SIGN_CACHE.set(text, geo);
    return geo;
  };
  const caveMouthRim = variants((openTop) => {
    const rand = mulberry32(31);
    const v = vox();
    const stone = pick(rand, 0, 1, 0.3);
    const light = pick(rand, 2, 0, 0.5);
    v.fill(-6, -6, 0, 5, 0, 1, stone);
    v.fill(5, 5, 0, 5, 0, 1, stone);
    if (!openTop) v.fill(-5, 4, 6, 6, 0, 1, light);
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
    const geometry = voxGeo(v, { unit: QUARTER, palette });
    geometry.collisionGeometry = voxGeo(solid, { unit: QUARTER, palette });
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
  const bush = variants((i) => {
    const rand = mulberry32(7 + i);
    const v = vox();
    let hi = 0;
    for (const [cx, cy, cz, rx, ry, rz] of CLUMPS[i]) {
      blob(v, { cx, cy, cz, rx, ry, rz, chip: 0.2 + i * 0.05, floor: 0, rand, color: () => 0 });
      hi = Math.max(hi, cy + ry);
    }
    foliage(v, rand, 0, 0, hi, i === 2 ? 0.18 : 0);
    return voxGeo(v, { unit: QUARTER, palette: [...GREENS, "#c8322e"] });
  });
  const ROCK_SHAPES = [{ rx: 3.2, ry: 3.6, rz: 2.8 }, { rx: 5, ry: 3.8, rz: 4.2 }];
  const rock = variants((i) => {
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
  const altarSlab = cached(() => lathe({
    profile: [[0, 0], [1, 0], [1, 0.82], [0.96, 1], [0, 1]],
    segments: 32,
    color: (t) => t < 0.5 ? "#57504a" : "#756b62"
  }));
  // Unit block: instanced around the altar edge as it grows.
  const altarBlock = variants((i) => box({ color: STONE[i % STONE.length], offset: { y: 0.5 } }));
  const woodCrate = cached(() => merge(
    box({ w: 0.9, h: 0.9, d: 0.9, color: PLANK, offset: { y: 0.45 } }),
    ...[[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]].map(([x, z]) => box({ w: 0.1, h: 0.94, d: 0.1, color: WOOD_DK, offset: { x, y: 0.47, z } })),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: -0.42 } }),
    box({ w: 0.94, h: 0.1, d: 0.1, color: WOOD_DK, offset: { y: 0.89, z: 0.42 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: -0.42, y: 0.89 } }),
    box({ w: 0.1, h: 0.1, d: 0.94, color: WOOD_DK, offset: { x: 0.42, y: 0.89 } })
  ));
  const barrel = cached(() => merge(
    lathe({ profile: [[0.32, 0], [0.4, 0.16], [0.43, 0.45], [0.4, 0.74], [0.32, 0.9], [0, 0.9]], segments: 8, color: "#7a5230" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.24, segments: 8, color: "#3a2a1a" }),
    ring({ r: 0.45, thickness: 0.03, y: 0.66, segments: 8, color: "#3a2a1a" })
  ));
  const flowerTuft = cached(() => merge(
    box({ w: 0.44, h: 0.12, d: 0.14, color: "#5b9a3a", offset: { y: 0.06 } }),
    box({ w: 0.14, h: 0.12, d: 0.44, color: "#4a8530", offset: { y: 0.06 } }),
    ...[[-0.14, 0.05, 0.3, "#e04a3a"], [0.02, -0.12, 0.36, "#f2c94c"], [0.15, 0.1, 0.26, "#f3efe4"]].map(([x, z, h, color]) => merge(
      box({ w: 0.04, h, d: 0.04, color: "#4a8530", offset: { x, y: h / 2, z } }),
      box({ w: 0.12, h: 0.1, d: 0.12, color, offset: { x, y: h + 0.03, z } })
    ))
  ));
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
  const grass = cached(() => {
    const rand = mulberry32(89);
    return noShadow(merge(...Array.from({ length: 6 }, (_, n) => {
      const h = 0.28 + rand() * 0.14;
      return turn(box({ w: 0.05, h, d: 0.12, color: n % 2 ? "#74b552" : "#4f8f36", offset: { y: h * 0.5 } }), n * Math.PI / 6 + (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4);
    })));
  });
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
      ...Array.from({ length: 8 }, (_, n) => box({ w: 0.46, h: 0.1, d: 2, color: n % 2 ? "#8f6538" : "#9c7040", offset: { x: 0.25 + n * 0.5, y: -0.05 } })),
      box({ w: 4, h: 0.14, d: 0.16, color: WOOD_DK, offset: { x: 2, y: -0.17, z: -0.92 } }),
      box({ w: 4, h: 0.14, d: 0.16, color: WOOD_DK, offset: { x: 2, y: -0.17, z: 0.92 } }),
      ...[-0.8, 0.8].map(brace)
    );
  });
  BL.hubModels = { SIGN_GLYPHS, jetpack, jetFlame, caveMouthRim, mirrorPanel, matrixPrisonBars, sealedCaveFace, matrixLeverPlate, matrixLeverLights, matrixLeverHub, matrixLeverArm, matrixLeverGrip, matrixLeverLabels, matrixGlyph, caveSign, CAVE_SIGN_WIDTH, CAVE_SIGN_HEIGHT, gate, caveShelves, entropyLab, bedroll, tree, bush, rock, altarSlab, altarBlock, woodCrate, barrel, flowerTuft, torch, grass, lantern, firepit, fireFlame, butterfly, firefly, ember, vine, cloud, ladder, dock, TREE_HEIGHT };
})();
