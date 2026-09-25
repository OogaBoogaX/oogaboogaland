// The one set-dressing kit every scene draws from. `KIT` pieces are voxel functions on a 1/16 grid, each
// writing through `box` and `put` into the three layers: general (`lanternPost`, `crate`, `coalCrate`,
// `barrel`, `cart`, `rails`, `banner`, `gauge`, `rubble`, `sack`, `bracket`, `hanging`, `bulb`), garage
// (`toolWall`, `workbench`, `tireRack`, `oilDrum`, `checkerMat`), lab (`die`, `flaskBench`, `terminal`,
// `chalkboard`), rally (`tireStack`, `flag`, `cone`, `barrier`, `fuelPump`, `startLights`, the `pennant`
// string), mine (`pickRack`, `dynamiteCrate`, `oreHeap`), the mirror (`monolith`, `runeStone`), lightning
// (`coil`, `boards`), plus `bench`, `vine` and `banner(v)` carrying each cave's emblem from
// `hubModels.SIGN_ICONS`.
//
// `set()` places pieces by quarter turns (`put`), strings sagging cables with lamps (`cable`) and `build`s
// everything placed into one `solid`, one `hang` and one emissive `glow` mesh plus the `lights` its lanterns
// cast; lamps hung by `cable` bake into `swing` and `swingGlow`, which the wind rocks. Lantern glass (amber,
// teal, green, red) is the variant and sets the light's colour in `LIGHT_RGB`. `nodes(baked, opts)` makes a
// baked set's nodes. A theme's `inside` list and `ceiling` lamp runs in scene-hub.js furnish the room behind
// a mouth from the garage pieces.
//
// Beyond sets: `palm(v)` three swaying cartoon palm meshes (not voxels) placed as their own nodes, `islet(v)` the terraced sea stacks on the horizon (variant 1 has a sea arch), `motes(opts)` a
// fixed field of glowing dust that wraps round the view (`update(elapsed, x, z)`), `flock(opts)` one
// instanced batch of wheeling gulls and `fleet(opts)` log rafts on the sea, each with `update(elapsed)`.
//
// A dressed area costs three draws: bake it once and memoise it (the hub per island, the caves per page).
// Only `solid` collides.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { voxelFaces, noShadow, merge } = BL.models;
  const { mulberry32, hexToRgb } = BL.math;
  // Set dressing for every scene from one voxel kit. Pieces are authored once as integer voxel lists; a set places
  // them by quarter turns on the kit's grid and bakes every placed voxel into one mesh per layer, so a dressed
  // area of posts, crates, carts, cables and lanterns costs three draws however much stands in it, and faces
  // where two pieces touch are never emitted. Layers: `solid` (stands on the ground, collides), `hang` (cables,
  // arms, cloth, frames: no collision) and `glow` (lantern glass, bolts, ore glints: emissive, no shadow).
  const U = 1 / 16;
  const SOLID = 0, HANG = 1, GLOW = 2;
  const PALETTE = [
    "#8a5a32", "#a8703e", "#5c3a1e", "#43291a", // 0 wood, 1 wood light, 2 wood dark, 3 plank gap
    "#4a4d52", "#2c2e33", "#6f737a", // 4 iron, 5 iron dark, 6 iron light
    "#1d1b1a", "#e8b830", // 7 cable, 8 cable band
    "#ffd66b", "#fff1b0", "#ffcf2e", // 9 glass, 10 flame, 11 bolt
    "#2a2a2e", "#3d3d44", // 12 coal, 13 coal light
    "#1d1d22", "#34343b", // 14 cloth, 15 cloth edge
    "#efe6cc", "#4caf50", "#f2c230", "#d9442b", // 16 cream, 17 green, 18 yellow, 19 red
    "#6d6a66", "#85817b", "#56534f", "#6d8a3a", "#86a24a", // 20 stone, 21 stone light, 22 stone dark, 23 moss, 24 moss light
    "#b89a68", "#9a7f52", // 25 burlap, 26 burlap dark
    "#7fb23d", "#9ccc4a", "#5f9632", // 27 grass, 28 grass tip, 29 grass dark
    "#7ff5e6", "#7dff96", "#ff5a46", "#ffb43a", // 30 teal glass, 31 green glass, 32 red lamp, 33 amber lamp
    "#f2efe8", "#1b1b1e", "#ff7a1f", "#2f4a3a", "#e6eee4", // 34 white paint, 35 rubber, 36 cone orange, 37 chalkboard, 38 chalk
    "#141816", "#46ff72", "#b9bec6", "#c4302b", "#c77a3a", "#ffcf3a", "#c08cff", // 39 obsidian, 40 glyph, 41 chrome, 42 dynamite, 43 copper, 44 gold, 45 violet glass
    "#c8322e", "#3a6fd8", "#1f6f6a", "#6a4424", // 46 red paint, 47 blue paint, 48 teal cloth, 49 brown cloth
    "#9a7148", "#7a5634", "#4fae3a", "#6fcf4a", "#3a8a2c", "#6b4a26", // 50 palm trunk, 51 trunk dark, 52 frond, 53 frond light, 54 frond dark, 55 coconut
    "#f5d142", "#4f9a38", // 56 banana, 57 vine
    "#e9d7a0", "#d8c184", // 58 sand, 59 sand dark
    "#d9a441", "#5a3a1a" // 60 leopard tan, 61 leopard spot
  ];
  const EMISSIVE = { 9: 1, 10: 1, 11: 0.9, 30: 1, 31: 1, 32: 1, 33: 1, 40: 1, 44: 0.8, 45: 1 };
  // Lantern glass by variant (amber, teal, green, red) and the light each casts; the fifth is a bolt's yellow.
  const GLASS = [9, 30, 31, 32];
  const LIGHT_RGB = [[1, 0.7, 0.36], [0.45, 1, 0.92], [0.5, 1, 0.55], [1, 0.38, 0.3], [1, 0.9, 0.35]];
  const ICONS = BL.hubModels.SIGN_ICONS;
  const RGB = PALETTE.map(hexToRgb);
  // A cell packs into one number (12 bits an axis, offset to stay positive): a set's layers are numeric maps,
  // several times cheaper to fill and probe than string-keyed voxel maps.
  const KEY = (x, y, z) => ((x + 2048) * 4096 + (y + 2048)) * 4096 + (z + 2048);
  const BOLT = ["...##", "..##.", ".##..", "#####", "..##.", ".##..", "##..."];
  // A piece is three flat lists of x, y, z, colour per layer, built by its author through `put`.
  const author = (build) => {
    const layers = [[], [], []];
    const put = (layer, x, y, z, c) => layers[layer].push(x, y, z, c);
    const box = (layer, x0, x1, y0, y1, z0, z1, color) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        // Shell only: the interior never shows and would only cost map entries.
        if (x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1) continue;
        put(layer, x, y, z, typeof color === "function" ? color(x, y, z) : color);
      }
    };
    build(put, box);
    return layers.map((list) => Int16Array.from(list));
  };
  const lantern = (put, box, cx, top, cz, glass = 9) => {
    box(HANG, cx - 1, cx, top + 1, top + 2, cz - 1, cz, 5);
    box(HANG, cx - 3, cx + 2, top, top, cz - 3, cz + 2, 5);
    for (const [x, z] of [[cx - 3, cz - 3], [cx + 2, cz - 3], [cx - 3, cz + 2], [cx + 2, cz + 2]]) box(HANG, x, x, top - 7, top - 1, z, z, 5);
    box(GLOW, cx - 2, cx + 1, top - 7, top - 1, cz - 2, cz + 1, (x, y) => y === top - 4 && glass === 9 ? 10 : glass);
    box(HANG, cx - 3, cx + 2, top - 8, top - 8, cz - 3, cz + 2, 5);
    box(HANG, cx - 1, cx, top - 9, top - 9, cz - 1, cz, 4);
  };
  const icon = (put, layer, rows, x0, y0, z, scale, color) => {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== "#") continue;
      for (let i = 0; i < scale; i++) for (let j = 0; j < scale; j++) put(layer, x0 + c * scale + i, y0 + (rows.length - 1 - r) * scale + j, z, color);
    }
  };
  const bolt = (put, layer, x0, y0, z, scale, color) => icon(put, layer, BOLT, x0, y0, z, scale, color);
  const disc = (fn, r, y, cx = 0, cz = 0) => {
    const n = Math.ceil(r);
    for (let x = -n - 1; x <= n; x++) for (let z = -n - 1; z <= n; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d <= r) fn(cx + x, y, cz + z, d);
    }
  };
  // Pip blocks on an eight-cell die face, by value.
  const PIPS = [[], [[-1, -1]], [[-3, -3], [1, 1]], [[-3, -3], [-1, -1], [1, 1]], [[-3, -3], [1, -3], [-3, 1], [1, 1]],
    [[-3, -3], [1, -3], [-3, 1], [1, 1], [-1, -1]], [[-3, -3], [1, -3], [-3, 1], [1, 1], [-3, -1], [1, -1]]];
  const pipAt = (value, a, b) => PIPS[value].some(([p, q]) => a >= p && a <= p + 1 && b >= q && b <= q + 1);
  const plank = (x, y, z, lo, hi, axis) => {
    const t = axis === 0 ? x : axis === 1 ? y : z;
    return (t - lo) % 4 === 3 && t !== hi ? 3 : ((t - lo) >> 2) & 1 ? 1 : 0;
  };
  const crateShell = (box, h, open, seed) => box(SOLID, -6, 5, 0, h - 1, -6, 5, (x, y, z) => {
    const ex = x === -6 || x === 5, ey = y === 0 || y === h - 1, ez = z === -6 || z === 5;
    if (ex + ey + ez >= 2) return (ex && ez && (y < 2 || y > h - 3)) || (ey && (ex || ez) && ((ex ? z : x) < -4 || (ex ? z : x) > 3)) ? 6 : 2;
    if (open && y === h - 1) return 3;
    // Planks run across each side, with a diagonal brace on the two broad faces.
    if (ez && Math.abs((x + 6) * (h - 1) / 11 - y) < 1) return 2;
    return plank(x, y, z, 0, h - 1, 1) === 3 ? 3 : (y >> 2) + seed & 1 ? 1 : 0;
  });
  const KIT = {
    lanternPost: (v) => author((put, box) => {
      box(SOLID, -4, 3, 0, 2, -4, 3, (x, y) => y === 2 ? 4 : 2);
      box(SOLID, -2, 1, 3, 47, -2, 1, (x, y, z) => (x === -2 || x === 1) && (z === -2 || z === 1) ? 2 : y % 9 === 0 ? 3 : 0);
      for (const y of [11, 40]) box(SOLID, -3, 2, y, y + 1, -3, 2, 4);
      box(HANG, 2, 17, 42, 44, -1, 0, (x) => x === 17 ? 2 : 1);
      for (let i = 0; i < 9; i++) box(HANG, 2 + i, 2 + i, 33 + i, 34 + i, -1, 0, 2);
      box(HANG, 15, 15, 39, 41, -1, -1, 5);
      lantern(put, box, 16, 36, 0, GLASS[v]);
    }),
    crate: (v) => author((put, box) => crateShell(box, 12, false, v)),
    coalCrate: (v) => author((put, box) => {
      crateShell(box, 9, true, v);
      const rand = mulberry32(71 + v);
      for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) {
        const h = 9 + Math.floor(rand() * 2.6 * (1 - Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) / 6));
        for (let y = 8; y <= h; y++) {
          const glint = y === h && rand() < 0.07;
          put(glint ? GLOW : SOLID, x, y, z, glint ? 11 : rand() < 0.3 ? 13 : 12);
        }
      }
      bolt(put, GLOW, -3, 1, 6, 1, 11);
    }),
    barrel: (v) => author((put) => {
      for (let y = 0; y < 15; y++) {
        const r = 4.6 + Math.sin(y / 14 * Math.PI) * 0.9;
        for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
          const d = Math.hypot(x + 0.5, z + 0.5);
          if (d > r || (d < r - 1.5 && y > 0 && y < 14)) continue;
          const hoop = y === 2 || y === 12;
          put(SOLID, x, y, z, hoop && d > r - 1 ? 5 : y === 14 ? 2 : (Math.floor(Math.atan2(z + 0.5, x + 0.5) * 3 + v) & 1) ? 1 : 0);
        }
      }
    }),
    cart: () => author((put, box) => {
      box(SOLID, -8, 7, 3, 11, -5, 4, (x, y, z) => {
        const edge = (x === -8 || x === 7) + (z === -5 || z === 4) + (y === 11) >= 2;
        return edge || y === 3 ? 5 : y === 11 ? 4 : plank(x, y, z, 3, 11, 1) === 3 ? 3 : 0;
      });
      const rand = mulberry32(5);
      for (let x = -7; x <= 6; x++) for (let z = -4; z <= 3; z++) {
        const h = 11 + Math.floor(rand() * 3 * (1 - Math.abs(x + 0.5) / 9));
        const glint = rand() < 0.08;
        put(glint ? GLOW : SOLID, x, h, z, glint ? 11 : rand() < 0.35 ? 13 : 12);
        for (let y = 10; y < h; y++) put(SOLID, x, y, z, 12);
      }
      for (const wx of [-5, 4]) for (const wz of [-6, 5]) for (let x = wx - 3; x <= wx + 3; x++) for (let y = 0; y <= 6; y++) {
        const d = Math.hypot(x - wx, y - 3);
        if (d <= 3.2) put(SOLID, x, y, wz, d < 1.2 ? 6 : 5);
      }
    }),
    rails: () => author((put, box) => {
      for (let z = -24; z < 24; z += 6) box(SOLID, -10, 9, 0, 0, z, z + 2, 2);
      box(SOLID, -7, -6, 1, 1, -24, 23, 6);
      box(SOLID, 5, 6, 1, 1, -24, 23, 6);
    }),
    // A cave's standard: 0 bolt, 1 die, 2 chequered, 3 pick, 4 glyph, 5 banana.
    banner: (v) => author((put, box) => {
      const CLOTH = [14, 48, 35, 49, 39, 49][v], EDGE = [15, 34, 34, 2, 40, 18][v];
      const EMBLEM = [["bolt", 18], ["die", 34], null, ["pick", 21], ["glyph", 40], ["banana", 56]][v];
      box(SOLID, -3, 2, 0, 1, -3, 2, 2);
      box(SOLID, -1, 0, 2, 45, -1, 0, 2);
      box(SOLID, -1, 0, 46, 47, -1, 0, v === 4 ? 40 : 6);
      box(HANG, -9, 8, 43, 44, -1, 0, 0);
      for (let x = -8; x <= 7; x++) {
        const bottom = 14 + ((x * 7) % 3 + 3) % 3 * 2;
        for (let y = bottom; y <= 42; y++) put(HANG, x, y, 1, x === -8 || x === 7 ? EDGE : v === 2 ? ((x + 8 >> 2) + (y >> 2) & 1 ? 34 : 35) : CLOTH);
      }
      if (EMBLEM) icon(put, v === 4 ? GLOW : HANG, ICONS[EMBLEM[0]], -5, 22, 2, 2, EMBLEM[1]);
    }),
    // Ooga Rally: a stack of three tyres, the top ring of each striped.
    tireStack: (v) => author((put) => {
      for (let t = 0; t < 3; t++) for (let y = t * 3; y < t * 3 + 3; y++) disc((x, yy, z, d) => {
        if (d < 2.3) return;
        put(SOLID, x + (t & 1), yy, z, yy === t * 3 + 2 && d > 3.6 && d < 4.6 ? (v & 1 ? 46 : 34) : 35);
      }, 5.3, y);
    }),
    flag: (v) => author((put, box) => {
      box(SOLID, -2, 1, 0, 1, -2, 1, 5);
      box(SOLID, -1, 0, 2, 49, -1, 0, 6);
      box(SOLID, -1, 0, 50, 51, -1, 0, 44);
      for (let x = 1; x <= 18; x++) for (let y = 34; y <= 47; y++) {
        const z = Math.round(Math.sin(x * 0.45 + v) * 1.3);
        put(HANG, x, y - Math.floor(x / 6), z, v === 1 ? (y > 40 ? 46 : 18) : ((x >> 1) + (y >> 1)) & 1 ? 34 : 35);
      }
    }),
    cone: () => author((put, box) => {
      box(SOLID, -4, 3, 0, 0, -4, 3, 35);
      for (let y = 1; y <= 11; y++) {
        const h = Math.max(0, Math.round(3 - y * 0.27));
        box(SOLID, -h - 1, h, y, y, -h - 1, h, y >= 5 && y <= 7 ? 34 : 36);
      }
    }),
    barrier: (v) => author((put, box) => box(SOLID, -12, 11, 0, 7, -2, 1, (x, y) => y === 0 ? 5 : ((x + 12 >> 2) + v) & 1 ? 46 : 34)),
    fuelPump: () => author((put, box) => {
      box(SOLID, -5, 4, 0, 1, -4, 3, 5);
      box(SOLID, -4, 3, 2, 19, -3, 2, (x, y) => y === 11 || y === 12 ? 34 : 46);
      box(SOLID, -5, 4, 20, 22, -4, 3, 34);
      box(GLOW, -2, 1, 14, 17, 3, 3, 33);
      box(SOLID, 4, 4, 8, 13, -1, 0, 41);
      box(SOLID, 5, 5, 3, 12, 0, 0, 35);
      box(SOLID, 5, 7, 3, 3, 0, 0, 35);
    }),
    startLights: () => author((put, box) => {
      box(SOLID, -3, 2, 0, 1, -3, 2, 5);
      box(SOLID, -1, 0, 2, 31, -1, 0, 5);
      box(SOLID, -3, 2, 32, 49, -2, 1, 35);
      for (const [y, c] of [[45, 32], [40, 33], [35, 31]]) box(GLOW, -2, 1, y, y + 2, 2, 2, c);
    }),
    // EntropyLab: a big die, a bench of glowing flasks, a terminal, a chalkboard of scribbles.
    die: (v) => author((put) => {
      for (let x = -4; x <= 3; x++) for (let y = 0; y <= 7; y++) for (let z = -4; z <= 3; z++) {
        const ex = x === -4 || x === 3, ey = y === 0 || y === 7, ez = z === -4 || z === 3;
        if (!(ex || ey || ez) || ex + ey + ez === 3) continue;
        const face = ez ? (z > 0 ? v % 6 + 1 : 6 - v % 6) : ex ? (x > 0 ? (v + 1) % 6 + 1 : 6 - (v + 1) % 6) : (y > 0 ? (v + 2) % 6 + 1 : 6 - (v + 2) % 6);
        const a = ex ? z : x, b = ey ? z : y - 4;
        put(SOLID, x, y, z, ex + ey + ez === 1 && pipAt(face, a, b) ? 35 : 34);
      }
    }),
    flaskBench: (v) => author((put, box) => {
      box(SOLID, -10, 9, 11, 12, -5, 4, 0);
      for (const [x, z] of [[-10, -5], [8, -5], [-10, 3], [8, 3]]) box(SOLID, x, x + 1, 0, 10, z, z + 1, 2);
      box(SOLID, -9, 8, 3, 3, -4, 3, 1);
      const COLORS = [30, 31, 45];
      [[-7, -1], [-2, 1], [3, -2]].forEach(([cx, cz], i) => {
        for (let y = 13; y <= 17; y++) disc((x, yy, z) => put(GLOW, x, yy, z, COLORS[(i + v) % 3]), 2.6 - Math.abs(y - 15) * 0.5, y, cx, cz);
        box(SOLID, cx - 1, cx, 18, 20, cz - 1, cz, 34);
        box(SOLID, cx - 1, cx, 21, 21, cz - 1, cz, 0);
      });
      box(SOLID, 5, 9, 13, 14, 1, 3, 2);
      for (let k = 0; k < 4; k++) box(GLOW, 5 + k, 5 + k, 15, 17 + (k & 1) * 2, 2, 2, COLORS[k % 3]);
    }),
    terminal: () => author((put, box) => {
      crateShell(box, 12, false, 1);
      box(SOLID, -6, 5, 12, 23, -5, 4, (x, y) => y === 12 || y === 23 ? 5 : 6);
      for (let y = 14; y <= 21; y++) box(y & 1 ? GLOW : SOLID, -4, 3, y, y, 5, 5, y & 1 ? 31 : 39);
      box(SOLID, -5, 4, 12, 12, 6, 8, 5);
    }),
    chalkboard: (v) => author((put, box) => {
      for (const x of [-9, 8]) for (let y = 0; y <= 28; y++) put(SOLID, x, y, -(y >> 3), 2);
      box(SOLID, -8, 7, 10, 25, -2, -2, (x, y) => x === -8 || x === 7 || y === 10 || y === 25 ? 2 : 37);
      const rand = mulberry32(61 + v);
      for (let y = 12; y <= 23; y += 3) for (let x = -6; x <= 5;) {
        const run = 1 + Math.floor(rand() * 4);
        if (rand() < 0.7) for (let k = 0; k < run && x + k <= 5; k++) put(SOLID, x + k, y, -1, 38);
        x += run + 1;
      }
    }),
    // Ooga Mine: a rack of picks, a crate of dynamite, a heap of ore that glitters.
    pickRack: () => author((put, box) => {
      box(SOLID, -10, -9, 0, 22, -1, 0, 2);
      box(SOLID, 8, 9, 0, 22, -1, 0, 2);
      box(SOLID, -10, 9, 19, 20, -1, 0, 0);
      for (const x0 of [-7, -1, 5]) {
        for (let y = 0; y <= 17; y++) put(SOLID, x0 + (y >> 3), y, 2, 0);
        for (let k = -4; k <= 4; k++) put(SOLID, x0 + 2 + k, 18 - Math.round(k * k * 0.12), 2, 6);
      }
    }),
    dynamiteCrate: () => author((put, box) => {
      crateShell(box, 9, true, 0);
      for (let x = -4; x <= 2; x += 2) for (let z = -4; z <= 2; z += 2) {
        box(SOLID, x, x + 1, 8, 12 + ((x + z) & 2), z, z + 1, 42);
        put(HANG, x, 13 + ((x + z) & 2), z, 7);
      }
    }),
    oreHeap: (v) => author((put) => {
      const rand = mulberry32(333 + v);
      for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5), h = Math.floor(6 - d * 0.75 + rand() * 1.5);
        for (let y = 0; y < h; y++) {
          const top = y === h - 1, gem = top && rand() < 0.12;
          put(gem ? GLOW : SOLID, x, y, z, gem ? (rand() < 0.6 ? 44 : 30) : rand() < 0.3 ? 21 : rand() < 0.3 ? 22 : 20);
        }
      }
    }),
    // The mirror cave: black monoliths running with green glyphs, and rune stones.
    monolith: (v) => author((put, box) => {
      box(SOLID, -4, 3, 0, 44, -2, 1, 39);
      box(SOLID, -3, 2, 45, 47, -1, 0, 39);
      const rand = mulberry32(17 + v);
      for (let y = 3; y <= 42; y++) for (let x = -3; x <= 2; x++) if (y % 7 < 5 && rand() < 0.42) put(GLOW, x, y, 2, 40);
    }),
    runeStone: (v) => author((put, box) => {
      box(SOLID, -6, 5, 0, 10, -4, 3, (x, y) => y === 10 ? 21 : 20);
      icon(put, GLOW, ICONS.glyph, -3, 2, 4, 1, 40);
    }),
    // The Lightning Factory: a coil with a glowing crown and arcs leaping from it.
    coil: () => author((put, box) => {
      box(SOLID, -5, 4, 0, 3, -5, 4, (x, y) => y === 3 ? 6 : 5);
      for (let y = 4; y <= 30; y++) disc((x, yy, z) => put(SOLID, x, yy, z, y % 3 === 0 ? 43 : 5), y % 3 === 0 ? 3.2 : 2.3, y);
      for (let y = 31; y <= 37; y++) disc((x, yy, z) => put(GLOW, x, yy, z, 11), 3.6 - Math.abs(y - 34) * 0.9, y);
      const rand = mulberry32(3);
      for (let arc = 0; arc < 3; arc++) {
        let x = 0, y = 34, z = 0;
        const dx = [1, -1, 0][arc], dz = [0, 1, -1][arc];
        for (let k = 0; k < 9; k++) {
          x += dx * 1; z += dz * 1; y += rand() < 0.5 ? 1 : -1;
          put(GLOW, x + dx * 3, y, z + dz * 3, 11);
        }
      }
    }),
    // Ooga Rally's garage: a pegboard of tools, a workbench with a vice, a tyre rack, an oil drum, a chequered
    // mat for the kart to stand on.
    toolWall: () => author((put, box) => {
      box(SOLID, -16, 15, 0, 40, -1, 0, (x, y) => x === -16 || x === 15 || y === 0 || y === 40 ? 2 : (x + y) % 4 === 0 ? 3 : 1);
      // A wrench, a hammer, a saw and a screwdriver hung in outline.
      const hang = (x0, y0, shape, c) => shape.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] === "#") put(SOLID, x0 + i, y0 - r, 1, c); });
      hang(-13, 34, ["#.#", "###", ".#.", ".#.", ".#.", ".#.", ".#.", ".#.", "###", "#.#"], 41);
      hang(-7, 34, ["#####", "#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."], 5);
      hang(-1, 32, ["########", "#######.", "######..", "#####...", "#.......", "##......"], 6);
      hang(9, 34, [".#.", ".#.", ".#.", ".#.", "###", "###", "###"], 46);
      hang(-12, 18, ["########################"], 2);
      for (let x = -12; x < 12; x += 4) box(SOLID, x, x + 2, 19, 22, 1, 2, [46, 47, 18, 17, 34, 36][((x + 12) >> 2) % 6]);
    }),
    workbench: () => author((put, box) => {
      box(SOLID, -14, 13, 13, 15, -5, 4, (x, y) => y === 15 ? 1 : 0);
      for (const [x, z] of [[-14, -5], [12, -5], [-14, 3], [12, 3]]) box(SOLID, x, x + 1, 0, 12, z, z + 1, 2);
      box(SOLID, -13, 12, 4, 4, -4, 3, 0);
      box(SOLID, 7, 11, 16, 19, -2, 1, 5);
      box(SOLID, 8, 10, 20, 20, -1, 0, 6);
      box(SOLID, -10, -6, 16, 16, -3, -1, 46);
      box(SOLID, -3, 2, 16, 17, 0, 2, 41);
    }),
    tireRack: () => author((put, box) => {
      for (const x of [-12, 11]) box(SOLID, x, x, 0, 38, -4, -3, 5);
      for (const y of [12, 26]) box(SOLID, -12, 11, y, y, -4, 3, 6);
      for (const [y0, n] of [[13, 3], [27, 3], [0, 2]]) for (let t = 0; t < n; t++) {
        const cx = -8 + t * 8;
        for (let x = -4; x <= 3; x++) for (let y = 0; y <= 9; y++) {
          const d = Math.hypot(x + 0.5, y - 4.5);
          if (d > 5 || d < 2.2) continue;
          for (let z = -3; z <= 2; z++) put(SOLID, cx + x, y0 + y, z, z === 2 && d > 4 ? 41 : 35);
        }
      }
    }),
    oilDrum: (v) => author((put) => {
      for (let y = 0; y < 16; y++) disc((x, yy, z, d) => {
        if (d < 3.4 && y > 0 && y < 15) return;
        put(SOLID, x, yy, z, y === 4 || y === 11 ? 5 : y === 15 ? 5 : v ? 47 : 46);
      }, 4.6, y);
      put(SOLID, 1, 16, 1, 41);
    }),
    checkerMat: () => author((put) => {
      for (let x = -24; x < 24; x++) for (let z = -32; z < 32; z++) put(SOLID, x, 0, z, ((x >> 3) + (z >> 3)) & 1 ? 34 : 35);
    }),
    // Planks nailed across a sealed mouth: this one is coming soon.
    boards: () => author((put, box) => {
      for (let k = -40; k <= 40; k++) {
        const y1 = Math.round(24 + k * 0.55), y2 = Math.round(24 - k * 0.55);
        for (let w = 0; w < 4; w++) { put(HANG, k, y1 + w, 0, 1); put(HANG, k, y2 + w, 1, 0); }
      }
      box(HANG, -38, 37, 30, 33, 2, 2, 1);
      for (const x of [-36, 35]) for (const y of [31, 32]) put(HANG, x, y, 3, 6);
    }),
    // Headquarters: a log bench.
    bench: () => author((put, box) => {
      for (const cx of [-8, 7]) for (let y = 0; y <= 5; y++) disc((x, yy, z) => put(SOLID, x, yy, z, y === 5 ? 1 : 2), 2.4, y, cx, 0);
      box(SOLID, -12, 11, 6, 8, -2, 1, (x, y) => y === 8 ? 1 : 2);
    }),
    vine: (v) => author((put) => {
      const rand = mulberry32(800 + v);
      for (let k = 0; k < 3; k++) {
        const x = k * 2 + (v & 1), len = 10 + Math.floor(rand() * 18);
        for (let y = 0; y > -len; y--) {
          put(HANG, x, y, 0, 57);
          if (-y % 3 === 1) put(HANG, x + ((y & 2) ? 1 : -1), y, 0, rand() < 0.5 ? 23 : 24);
        }
      }
    }),
    gauge: () => author((put, box) => {
      box(SOLID, -2, 0, 0, 21, -2, 0, 2);
      box(SOLID, -7, 6, 22, 35, -3, 1, (x, y) => x === -7 || x === 6 || y === 22 || y === 35 ? 5 : 2);
      box(SOLID, 7, 8, 0, 29, -2, -1, 4);
      box(SOLID, 7, 8, 30, 31, -2, -1, 6);
      box(SOLID, -6, 5, 23, 34, 2, 2, 16);
      for (let a = 0; a <= 20; a++) {
        const t = a / 20, ang = Math.PI * (1 - t);
        const x = Math.round(Math.cos(ang) * 4.6 - 0.5), y = Math.round(Math.sin(ang) * 4.6) + 26;
        put(SOLID, x, y, 3, t < 0.45 ? 17 : t < 0.75 ? 18 : 19);
      }
      for (let i = 0; i <= 4; i++) put(SOLID, Math.round(i * 0.8) - 1, 26 + Math.round(i * 0.9), 3, 5);
    }),
    rubble: (v) => author((put, box) => {
      const rand = mulberry32(211 + v * 13);
      for (let n = 0; n < 4 + v % 3; n++) {
        const w = 3 + Math.floor(rand() * 5), h = 2 + Math.floor(rand() * 4), d = 3 + Math.floor(rand() * 5);
        const x0 = Math.floor((rand() - 0.5) * 10), z0 = Math.floor((rand() - 0.5) * 10), y0 = n > 2 ? 2 + Math.floor(rand() * 2) : 0;
        box(SOLID, x0, x0 + w, y0, y0 + h, z0, z0 + d, (x, y) => y === y0 + h && rand() < 0.55 ? (rand() < 0.5 ? 23 : 24) : rand() < 0.25 ? 21 : rand() < 0.2 ? 22 : 20);
      }
    }),
    sack: (v) => author((put) => {
      for (let x = -5; x <= 4; x++) for (let y = 0; y <= 10; y++) for (let z = -4; z <= 3; z++) {
        const e = ((x + 0.5) / 5) ** 2 + ((y - 4.5) / 5.8) ** 2 + ((z + 0.5) / 4) ** 2;
        if (e <= 1 && e > 0.55) put(SOLID, x, y, z, (x + y + v) % 5 === 0 ? 26 : 25);
      }
      for (let y = 10; y <= 12; y++) put(SOLID, -1, y, -1, y === 10 ? 7 : 26);
    }),
    // A plain pole the cables start from on walls; it carries a small lantern of its own.
    bracket: () => author((put, box) => {
      box(HANG, -1, 0, 0, 1, -1, 6, 2);
      box(HANG, -1, 0, -6, 1, 6, 7, 4);
      lantern(put, box, 0, -1, 6);
    })
  };
  // Where a piece's lantern glass sits, in voxel units of the piece: the point its light comes from.
  const LIGHTS = { lanternPost: [16, 32.5, 0], hanging: [1, -7.5, 1], coil: [0, 34, 0] };
  const pieces = new Map();
  const pieceOf = (kind, variant) => {
    const key = kind + ":" + variant;
    let piece = pieces.get(key);
    if (!piece) pieces.set(key, piece = KIT[kind](variant));
    return piece;
  };
  // A piece's pick sphere in voxel units, measured once from its solid and hanging voxels: centre x, y, z and radius.
  const pickOf = (piece) => {
    if (piece.pick) return piece.pick;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let layer = 0; layer < 3; layer++) {
      const list = piece[layer];
      for (let i = 0; i < list.length; i += 4) {
        x0 = Math.min(x0, list[i]); x1 = Math.max(x1, list[i] + 1);
        y0 = Math.min(y0, list[i + 1]); y1 = Math.max(y1, list[i + 1] + 1);
        z0 = Math.min(z0, list[i + 2]); z1 = Math.max(z1, list[i + 2] + 1);
      }
    }
    // Half the larger footprint side: the sphere hugs the piece rather than its tallest diagonal.
    return piece.pick = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0, (y1 - y0) * 0.6) / 2];
  };
  // Pieces drawn as cartoon timber instead of voxels: the hub's crate and barrel, scaled to the piece's voxel
  // footprint and turned with it, baked into the set's solid mesh so they still collide and cost no draw of their
  // own. `keep` names the voxels still written (a coal crate's coal and glints, a dynamite crate's sticks and
  // fuses); the voxel piece still sets the pick sphere.
  const filled = (layer, x, y, z) => layer !== SOLID || (y >= 8 && x > -6 && x < 5 && z > -6 && z < 5);
  const CRATE_SCALE = 0.75 / 0.9, OPEN_SCALE = 0.5625 / 0.9;
  const MESHES = {
    crate: { build: () => BL.hubModels.woodCrate(0), scale: [CRATE_SCALE, CRATE_SCALE, CRATE_SCALE], keep: null },
    coalCrate: { build: () => BL.hubModels.woodCrate(1), scale: [CRATE_SCALE, OPEN_SCALE, CRATE_SCALE], keep: filled },
    dynamiteCrate: { build: () => BL.hubModels.woodCrate(1), scale: [CRATE_SCALE, OPEN_SCALE, CRATE_SCALE], keep: filled },
    barrel: { build: () => BL.hubModels.barrel(), scale: [0.8, 1.04, 0.8], keep: null }
  };
  // A mesh piece's geometry scaled, turned by quarter turns q and moved to (ox, oy, oz) in kit cells.
  const meshAt = (kind, ox, oy, oz, q) => {
    const m = MESHES[kind], src = m.geometry || (m.geometry = m.build()), [sx, sy, sz] = m.scale, v = src.verts, out = new Array(v.length);
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i] * sx, z = v[i + 2] * sz;
      out[i] = ox * U + (q === 0 ? x : q === 1 ? z : q === 2 ? -x : -z);
      out[i + 1] = oy * U + v[i + 1] * sy;
      out[i + 2] = oz * U + (q === 0 ? z : q === 1 ? -x : q === 2 ? -z : x);
    }
    return { verts: out, faces: src.faces, lines: src.lines };
  };
  const set = () => {
    // Mesh pieces placed so far: kind, then the cell origin and quarter turns.
    const meshes = [];
    // Layers 3 and 4 hold what hangs from a cable (lantern bodies and their glass), baked apart so the wind
    // can swing them without swinging the cable or the posts.
    const layers = [new Map(), new Map(), new Map(), new Map(), new Map()], lights = [];
    // What was placed, for poking: kind, variant, then the pick sphere's centre x, y, z and radius in metres.
    const picks = [];
    // Each light is x, y, z and its colour's index in LIGHT_RGB.
    const light = (kind, ox, oy, oz, q, variant) => {
      const p = LIGHTS[kind];
      if (!p) return;
      const x = q === 0 ? p[0] : q === 1 ? p[2] : q === 2 ? -p[0] : -p[2];
      const z = q === 0 ? p[2] : q === 1 ? -p[0] : q === 2 ? -p[2] : p[0];
      lights.push((ox + x) * U, (oy + p[1]) * U, (oz + z) * U, kind === "coil" ? 4 : variant);
    };
    // Later pieces overwrite earlier voxels in the same cell; the hang layer never overwrites a solid one.
    const write = (layer, x, y, z, c) => {
      const k = KEY(x, y, z);
      if (layer !== SOLID && layers[SOLID].has(k)) return;
      layers[layer].set(k, c);
    };
    const put = (kind, x, y, z, turns = 0, variant = 0) => {
      const piece = pieceOf(kind, variant), mesh = MESHES[kind];
      const ox = Math.round(x / U), oy = Math.round(y / U), oz = Math.round(z / U), q = ((turns % 4) + 4) % 4;
      if (mesh) meshes.push(kind, ox, oy, oz, q);
      for (let layer = 0; layer < 3; layer++) {
        const list = piece[layer];
        for (let i = 0; i < list.length; i += 4) {
          const lx = list[i], lz = list[i + 2];
          if (mesh && (!mesh.keep || !mesh.keep(layer, lx, list[i + 1], lz))) continue;
          const rx = q === 0 ? lx : q === 1 ? lz : q === 2 ? -lx - 1 : -lz - 1;
          const rz = q === 0 ? lz : q === 1 ? -lx - 1 : q === 2 ? -lz - 1 : lx;
          write(layer, ox + rx, oy + list[i + 1], oz + rz, list[i + 3]);
        }
      }
      light(kind, ox, oy, oz, q, variant);
      const [px, py, pz, pr] = pickOf(piece);
      picks.push(kind, variant, (ox + (q === 0 ? px : q === 1 ? pz : q === 2 ? -px : -pz)) * U, (oy + py) * U, (oz + (q === 0 ? pz : q === 1 ? -px : q === 2 ? -pz : px)) * U, pr * U);
      return set;
    };
    // A sagging cable of 6-connected voxels between two points, banded every metre, with lanterns hung at `lamps`.
    // Pennants cycle their colours along the cable; lanterns and bulbs all take the one glass `variant`.
    const cable = (ax, ay, az, bx, by, bz, sag, lamps = [], lamp = "hanging", variant = 0) => {
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / U * 2);
      let px = Math.round(ax / U), py = Math.round(ay / U), pz = Math.round(az / U), run = 0;
      const lay = (x, y, z) => {
        write(HANG, x, y, z, (run++ % 16) < 2 ? 8 : 7);
      };
      lay(px, py, pz);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round((ax + (bx - ax) * t) / U), y = Math.round((ay + (by - ay) * t - sag * 4 * t * (1 - t)) / U), z = Math.round((az + (bz - az) * t) / U);
        while (px !== x || py !== y || pz !== z) {
          if (px !== x) px += Math.sign(x - px);
          else if (py !== y) py += Math.sign(y - py);
          else pz += Math.sign(z - pz);
          lay(px, py, pz);
        }
      }
      lamps.forEach((t, n) => {
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t - sag * 4 * t * (1 - t), z = az + (bz - az) * t;
        const v = lamp === "pennant" ? n % 5 : variant;
        const piece = pieceOf(lamp, v);
        const ox = Math.round(x / U), oy = Math.round(y / U), oz = Math.round(z / U);
        for (let layer = 0; layer < 3; layer++) {
          const list = piece[layer], into = layer === GLOW ? 4 : 3;
          for (let i = 0; i < list.length; i += 4) write(into, ox + list[i], oy + list[i + 1], oz + list[i + 2], list[i + 3]);
        }
        light(lamp, ox, oy, oz, 0, v);
      });
      return set;
    };
    const bake = (layer) => {
      const map = layers[layer];
      if (!map.size) return null;
      const geo = { verts: [], faces: [], lines: [], voxel: new Float32Array([U, 0, 0, 0]) };
      const has = (x, y, z) => map.has(KEY(x, y, z));
      const emit = (pts, c) => {
        const b = geo.verts.length / 3;
        for (const [x, y, z] of pts) geo.verts.push(x * U, y * U, z * U);
        geo.faces.push({ i: [b, b + 1, b + 2, b + 3], color: RGB[c], emissive: layer === GLOW || layer === 4 ? EMISSIVE[c] || 0 : 0 });
      };
      voxelFaces((fn) => {
        for (const [k, c] of map) fn(Math.floor(k / 16777216) - 2048, Math.floor(k / 4096) % 4096 - 2048, k % 4096 - 2048, c);
      }, has, emit);
      if (layer >= 3) geo.swing = 1;
      return layer === GLOW || layer === 4 ? noShadow(geo) : geo;
    };
    const build = () => {
      let solid = bake(SOLID);
      if (meshes.length) {
        const parts = solid ? [solid] : [];
        for (let i = 0; i < meshes.length; i += 5) parts.push(meshAt(meshes[i], meshes[i + 1], meshes[i + 2], meshes[i + 3], meshes[i + 4]));
        solid = merge(...parts);
        meshes.length = 0;
      }
      const out = { solid, hang: bake(HANG), glow: bake(GLOW), swing: bake(3), swingGlow: bake(4), lights: Float32Array.from(lights), picks: picks.splice(0) };
      for (const layer of layers) layer.clear();
      lights.length = 0;
      return out;
    };
    const set = { put, cable, build };
    return set;
  };
  KIT.hanging = (v) => author((put, box) => {
    box(HANG, 0, 0, -3, -1, 0, 0, 5);
    lantern(put, box, 1, -4, 1, GLASS[v]);
  });
  // A festoon bulb: small enough to string across a doorway without closing it.
  KIT.bulb = (v) => author((put, box) => {
    box(HANG, 0, 0, -1, -1, 0, 0, 5);
    box(HANG, -1, 1, -2, -2, -1, 1, 4);
    box(GLOW, -1, 1, -5, -3, -1, 1, GLASS[v]);
  });
  // Bunting: a triangle of cloth under the cable.
  KIT.pennant = (v) => author((put) => {
    const color = [46, 18, 47, 17, 34][v];
    [[-2, 2], [-2, 2], [-1, 1], [-1, 1], [0, 0]].forEach(([a, b], row) => {
      for (let x = a; x <= b; x++) put(HANG, x, -1 - row, 0, color);
    });
  });
  // Dust in lamplight: a fixed field of glowing motes that drifts and wraps round a moving centre (the view's
  // target), so there is always air to see near the camera and no mote is ever created or dropped. One draw.
  let moteGeometry = null;
  const motes = ({ count = 220, span = 14, low = 0.4, high = 5 } = {}) => {
    if (!moteGeometry) moteGeometry = noShadow(BL.models.box({ w: 0.035, h: 0.035, d: 0.035, color: "#ffe2a8", emissive: 0.8 }));
    const rand = mulberry32(911), data = new Float32Array(count * 20);
    const bx = new Float32Array(count), by = new Float32Array(count), bz = new Float32Array(count), ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      bx[i] = rand() * span; by[i] = low + rand() * (high - low); bz[i] = rand() * span; ph[i] = rand() * 6.283;
      const o = i * 20, s = 0.5 + rand();
      data[o] = s; data[o + 5] = s; data[o + 10] = s; data[o + 15] = 1;
    }
    const node = BL.scene.createNode({ geometry: moteGeometry, instanceData: data, instanceCount: count, instanceVersion: 0, fixedInstanceCapacity: true, glow: 1 });
    const wrap = (v, c) => c - span * 0.5 + ((v - c + span * 0.5) % span + span) % span;
    const update = (elapsed, cx, cz) => {
      for (let i = 0; i < count; i++) {
        const o = i * 20, t = elapsed * 0.25 + ph[i];
        data[o + 12] = wrap(bx[i] + elapsed * 0.08 + Math.sin(t) * 0.4, cx);
        data[o + 13] = by[i] + Math.sin(t * 1.3) * 0.25;
        data[o + 14] = wrap(bz[i] + Math.cos(t * 0.9) * 0.4, cz);
      }
      node.instanceVersion++;
    };
    return { node, update };
  };
  // Palms stand as their own nodes rather than in a set, so the wind can bend each on its own phase; one
  // geometry per variant, every copy instanced. They are smooth cartoon meshes, not voxels: a leaning trunk of
  // tapered eight-sided segments, each flaring out over the one below like a palm's leaf scars; three round
  // coconuts; and a crown of broad fronds, each a V-folded, closed ribbon that rises, arcs over and droops,
  // its edges notched into leaflets, light on top and dark beneath, with three short fronds standing up.
  const TRUNK = ["#9a7148", "#83603c", "#6f4f30"].map(hexToRgb), NUT = hexToRgb("#6b4a26");
  const FROND = ["#3f9a34", "#5fbf3f", "#86d652", "#2c6e2a"].map(hexToRgb);
  const palms = [];
  const palm = (v) => {
    if (palms[v]) return palms[v];
    const geo = { verts: [], faces: [], lines: [] }, rand = mulberry32(700 + v);
    const vert = (x, y, z) => (geo.verts.push(x, y, z), geo.verts.length / 3 - 1);
    const quad = (a, b, c, d, color) => geo.faces.push({ i: [a, b, c, d], color, emissive: 0 });
    const H = 3.9 + v * 0.45, LEAN = 0.8 + v * 0.3, SEG = 10, SIDES = 8;
    const axis = (t) => LEAN * t * t;
    // Trunk: each segment flares at its foot and narrows to its top; a ledge joins it to the segment below.
    let below = null;
    for (let k = 0; k < SEG; k++) {
      const t0 = k / SEG, t1 = (k + 1) / SEG, base = (t) => 0.2 - 0.07 * t;
      const ring = (t, r) => Array.from({ length: SIDES }, (_, e) => {
        const a = e / SIDES * Math.PI * 2;
        return vert(axis(t) + Math.cos(a) * r, H * t, Math.sin(a) * r);
      });
      const foot = ring(t0, base(t0) * 1.18), top = ring(t1, base(t1) * 0.94), color = TRUNK[k % 2 ? 1 : 0];
      for (let e = 0; e < SIDES; e++) {
        const f = (e + 1) % SIDES;
        quad(foot[e], top[e], top[f], foot[f], color);
        if (below) quad(below[e], below[f], foot[f], foot[e], TRUNK[2]);
      }
      below = top;
    }
    const topX = axis(1);
    // Coconuts: low round nuts tucked under the crown.
    for (let n = 0; n < 3; n++) {
      const a = n * 2.1 + 0.4, cx = topX + Math.cos(a) * 0.17, cz = Math.sin(a) * 0.17, cy = H - 0.16, r = 0.13;
      const rows = [];
      for (let i = 0; i <= 4; i++) {
        const p = i / 4 * Math.PI, rr = Math.sin(p) * r, y = cy - Math.cos(p) * r;
        rows.push(Array.from({ length: 6 }, (_, e) => vert(cx + Math.cos(e / 6 * Math.PI * 2) * rr, y, cz + Math.sin(e / 6 * Math.PI * 2) * rr)));
      }
      for (let i = 0; i < 4; i++) for (let e = 0; e < 6; e++) {
        const f = (e + 1) % 6;
        quad(rows[i][e], rows[i + 1][e], rows[i + 1][f], rows[i][f], NUT);
      }
    }
    // A frond: a closed ribbon along an arc, V-folded across its width, notched by alternating widths.
    const frond = (a, len, rise, droop, broad) => {
      const ca = Math.cos(a), sa = Math.sin(a), STEPS = 11, T = 0.035;
      let prev = null;
      for (let k = 0; k <= STEPS; k++) {
        const s = k / STEPS, d = len * s, y = H + 0.08 + rise * d - droop * d * d;
        const w = broad * Math.pow(Math.sin(Math.PI * Math.min(1, (s + 0.1) / 1.05)), 0.7) * (k % 2 ? 0.78 : 1);
        const cx = topX + ca * d, cz = sa * d, px = -sa, pz = ca, sag = w * 0.38;
        const ring = [
          vert(cx + px * w, y - sag, cz + pz * w), vert(cx, y + 0.03, cz), vert(cx - px * w, y - sag, cz - pz * w),
          vert(cx - px * w, y - sag - T, cz - pz * w), vert(cx, y + 0.03 - T, cz), vert(cx + px * w, y - sag - T, cz + pz * w)
        ];
        if (prev) {
          const tone = s < 0.5 ? 0 : 1;
          quad(prev[0], ring[0], ring[1], prev[1], FROND[tone + 1]);
          quad(prev[1], ring[1], ring[2], prev[2], FROND[tone]);
          quad(prev[3], ring[3], ring[4], prev[4], FROND[3]);
          quad(prev[4], ring[4], ring[5], prev[5], FROND[3]);
          quad(prev[2], ring[2], ring[3], prev[3], FROND[3]);
          quad(prev[5], ring[5], ring[0], prev[0], FROND[3]);
        }
        prev = ring;
      }
    };
    for (let f = 0; f < 8; f++) frond(f / 8 * Math.PI * 2 + rand() * 0.35, 2.0 + rand() * 0.5, 0.6, 0.32, 0.3);
    for (let f = 0; f < 3; f++) frond(f / 3 * Math.PI * 2 + 0.5 + rand() * 0.3, 0.9 + rand() * 0.2, 1.1, 0.45, 0.2);
    geo.sway = 0.0035;
    return palms[v] = geo;
  };
  // The islands on the horizon: terraced sea stacks on the island's own grid mesher, two metres a cell, a sand
  // ring at the waterline, rock cliffs and grass tops; variant 1 has a sea arch through it. Built once a page.
  const islets = [];
  const islet = (v) => {
    if (islets[v]) return islets[v];
    const u = 2, S = 40, H = 16 + v * 5, grid = BL.terrain.makeGrid(S, H, S), rand = mulberry32(1200 + v * 7);
    const bumps = Array.from({ length: 6 }, () => [rand() * S, rand() * S, 4 + rand() * 6]);
    const heightAt = (x, z) => {
      const r = Math.hypot(x - S / 2, z - S / 2) / (S / 2);
      let h = (1 - Math.min(1, r) ** 4) * (H - 4) * (0.75 + 0.25 * Math.cos(x * 0.3 + v) * Math.sin(z * 0.25));
      for (const [bx, bz, br] of bumps) h -= Math.max(0, 1 - Math.hypot(x - bx, z - bz) / br) * 6;
      return r > 1 ? 0 : Math.max(1, Math.round(h / 3) * 3 + 1);
    };
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const h = heightAt(x, z), r = Math.hypot(x - S / 2, z - S / 2) / (S / 2);
      for (let y = 0; y < h; y++) {
        if (v === 1 && Math.abs(x - S / 2) < 4 && y > 2 && y < 11) continue;
        const color = y < 2 && r > 0.55 ? (rand() < 0.3 ? 59 : 58) : y === h - 1 && h > 4 ? (rand() < 0.3 ? 29 : 27) : y >= h - 3 && rand() < 0.35 ? 23 : rand() < 0.3 ? 21 : rand() < 0.3 ? 22 : 20;
        grid.set(x, y, z, color + 1);
      }
    }
    const geo = BL.terrain.gridGeometry(grid, { unit: u, palette: [null, ...RGB], origin: { x: -S * u / 2, y: 0, z: -S * u / 2 } });
    geo.castShadow = false;
    islets[v] = geo;
    return geo;
  };
  // The nodes for a baked set: solid (for the caller's collision), hang, glow and the two swinging layers. All
  // stay out of the sight systems: registering the facades' solids alone cost the hub 140 ms of boot, and dressing
  // needs no outline cue. `glow` sets the lit layers' glow.
  const nodes = (baked, { glow = 0, living = false } = {}) => {
    const out = [];
    const node = (geometry, lit) => geometry && out.push(BL.scene.createNode({ geometry, sightHidden: true, glow: lit ? glow : 0, matrixEmissiveLiving: lit && living }));
    node(baked.solid, false); node(baked.hang, false); node(baked.glow, true); node(baked.swing, false); node(baked.swingGlow, true);
    return out;
  };
  // A gull: a wide shallow V of wings over a white body; flapping is the instance's own vertical scale.
  KIT.gull = () => author((put) => {
    for (let x = -9; x <= 8; x++) {
      const y = Math.round(Math.abs(x + 0.5) * 0.35);
      put(SOLID, x, y, 0, Math.abs(x + 0.5) > 6 ? 5 : 34);
      put(SOLID, x, y, 1, Math.abs(x + 0.5) > 6 ? 5 : 34);
    }
    for (let z = -2; z <= 3; z++) put(SOLID, 0, 0, z, 34);
    put(SOLID, 0, 0, 4, 18);
  });
  // An Ooga raft, bow to +z: five round logs side by side, the middle one longest, lashed by three rope bands, a
  // post mast with a yard across it and a sail hung from the yard. Variant 0 flies a leopard hide stretched to a
  // lower yard, 1 hangs three banana leaves from a trunk-ringed post under a crown with a bunch of bananas, 2 a
  // patched brown hide with a banana on it; 0 and 2 carry a pennant and bananas on deck.
  KIT.boat = (v) => author((put, box) => {
    const BAND = v === 1 ? 57 : 25, BOW = [0, 1, 2, 1, 0], STERN = [1, 0, 2, 0, 1];
    // Each log is a 3x3 section with its corners cut; cut ends show light end grain.
    for (let i = 0; i < 5; i++) {
      const cx = -6 + i * 3, z0 = -16 + STERN[i], z1 = 13 + BOW[i];
      for (let z = z0; z <= z1; z++) for (let x = cx - 1; x <= cx + 1; x++) for (let y = 0; y <= 2; y++) {
        const end = z === z0 || z === z1;
        if ((x !== cx && y !== 1) || (x === cx && y === 1 && !end)) continue;
        put(SOLID, x, y, z, end ? 1 : i & 1 ? 50 : 0);
      }
    }
    // Rope bands follow the logs' tops and wrap down the outer sides.
    for (const z of [-12, -11, -5, -4, 8, 9]) {
      for (let x = -7; x <= 7; x++) put(SOLID, x, (x + 7) % 3 === 1 ? 3 : 2, z, BAND);
      put(SOLID, -8, 1, z, BAND); put(SOLID, 8, 1, z, BAND);
    }
    box(SOLID, -1, 1, 2, 45, -1, 1, (x, y) => v === 1 ? (y % 4 === 0 ? 51 : 50) : 2);
    box(SOLID, -2, 2, 3, 4, -2, 2, BAND);
    box(SOLID, -10, 9, 40, 41, 2, 3, v === 1 ? 51 : 2);
    if (v === 1) {
      // Three banana leaves hang from the yard, the middle one in front; the side ones splay outward as they fall.
      for (const [cx, bot, z] of [[-5, 16, 2], [5, 16, 2], [0, 13, 3]]) for (let y = bot; y <= 39; y++) {
        const t = (39 - y) / (39 - bot), mid = cx + Math.sign(cx) * Math.round(t * 2);
        const hw = Math.max(0, Math.round(2.8 * Math.sin(Math.PI * (0.12 + 0.88 * t)) - 0.2));
        for (let x = mid - hw; x <= mid + hw; x++) put(HANG, x, y, z, x === mid ? 53 : hw > 1 && Math.abs(x - mid) === hw ? 54 : 52);
      }
      // A crown of two short leaves over the post, and a bunch of bananas behind it.
      for (const s of [-1, 1]) for (let k = 0; k < 8; k++) {
        const y = 44 + Math.round(k * 0.6);
        for (const yy of [y, y + 1]) put(HANG, s * (2 + k), yy, 0, yy === y ? 52 : 53);
      }
      box(SOLID, -1, 1, 31, 35, -4, -2, 56);
      box(SOLID, 0, 0, 36, 38, -3, -2, 55);
      return;
    }
    box(SOLID, -9, 8, 13, 14, 2, 3, 2);
    // The hide between the yards: leopard in clean 2x2 spots on a staggered lattice, or patched brown with a banana.
    const BANANA = ["...........s", "..........s.", ".........##.", "#.......###.", "##.....###..", ".#########..", "..#######...", "....###....."];
    for (let y = 15; y <= 39; y++) for (let x = -8; x <= 7; x++) {
      if ((x === -8 || x === 7) && (y === 15 || y === 39)) continue;
      let c;
      if (v === 0) {
        const j = Math.floor((y - 15) / 4), sx = x + 10 + (j & 1) * 2, i = Math.floor(sx / 5), h = (i * 2 + j) % 3;
        const lx = sx - i * 5 - 1 - (h === 1 ? 1 : 0), ly = y - 15 - j * 4 - (h === 2 ? 1 : 0);
        c = lx >= 0 && lx <= 1 && ly >= 0 && ly <= 1 ? 61 : 60;
      } else {
        const ch = y >= 22 && y <= 29 ? BANANA[29 - y][x + 6] : undefined;
        c = ch === "#" ? 56 : ch === "s" ? 55 : (x <= -4 && y >= 33 && y <= 37) || (x >= 3 && y >= 17 && y <= 20) ? 25 : 49;
      }
      put(HANG, x, y, 2, c);
    }
    for (let k = 0; k < 6; k++) for (let y = 42 + Math.floor(k / 3); y <= 45 - Math.floor(k / 3); y++) put(HANG, 0, y, 2 + k, 19);
    box(SOLID, 2, 4, 2, 4, -9, -7, 56);
    put(SOLID, 3, 5, -8, 55);
  });
  // Seagulls wheeling round a centre on their own circles, heights and speeds; one instanced draw.
  const instanceField = (geometry, count) => BL.scene.createNode({ geometry, instanceData: new Float32Array(count * 20), instanceCount: count, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true });
  const writeYaw = (data, o, yaw, sx, sy, sz, x, y, z) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    data[o] = c * sx; data[o + 1] = 0; data[o + 2] = -s * sx; data[o + 3] = 0;
    data[o + 4] = 0; data[o + 5] = sy; data[o + 6] = 0; data[o + 7] = 0;
    data[o + 8] = s * sz; data[o + 9] = 0; data[o + 10] = c * sz; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
  };
  let gullGeometry = null, boatGeometry = [];
  const flock = ({ count = 18, cx = 0, cz = 0, radius = [26, 60], height = [14, 34], seed = 5, scale = 1.6 } = {}) => {
    if (!gullGeometry) gullGeometry = noShadow(set().put("gull", 0, 0, 0).build().solid);
    const node = instanceField(gullGeometry, count), rand = mulberry32(seed), data = node.instanceData;
    const r = new Float32Array(count), h = new Float32Array(count), w = new Float32Array(count), p = new Float32Array(count), f = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      r[i] = radius[0] + rand() * (radius[1] - radius[0]); h[i] = height[0] + rand() * (height[1] - height[0]);
      w[i] = (0.05 + rand() * 0.06) * (rand() < 0.5 ? -1 : 1); p[i] = rand() * 6.283; f[i] = 5 + rand() * 3;
    }
    const update = (elapsed) => {
      for (let i = 0; i < count; i++) {
        const a = p[i] + elapsed * w[i], x = cx + Math.cos(a) * r[i], z = cz + Math.sin(a) * r[i];
        const glide = Math.sin(elapsed * 0.3 + p[i]) > 0.2, flap = glide ? 0.6 : 0.3 + Math.abs(Math.sin(elapsed * f[i] + p[i])) * 1.6;
        writeYaw(data, i * 20, Math.atan2(-Math.sin(a) * w[i], Math.cos(a) * w[i]) + Math.PI, scale, flap * scale, scale, x, h[i] + Math.sin(elapsed * 0.5 + p[i]) * 1.5, z);
      }
      node.instanceVersion++;
    };
    update(0);
    return { node, update };
  };
  // Rafts sailing slowly round the island on the sea, rocking on the swell.
  const fleet = ({ sea = -70, spots = [], seed = 9 } = {}) => {
    const nodes = [], rand = mulberry32(seed);
    // Each variant bakes to a logs-and-mast mesh and its sail: two shared geometries (no glow layer).
    for (let v = 0; v < 3; v++) if (!boatGeometry[v]) {
      const baked = set().put("boat", 0, 0, 0, 0, v).build();
      boatGeometry[v] = [baked.solid, baked.hang, baked.glow].filter(Boolean).map(noShadow);
    }
    const boats = spots.map(([r, a, s], i) => {
      const node = BL.scene.createNode({ scale: { x: s, y: s, z: s }, sightHidden: true });
      for (const geometry of boatGeometry[i % 3]) BL.scene.addChild(node, BL.scene.createNode({ geometry, sightHidden: true }));
      return { node, r, a, w: (0.004 + rand() * 0.004) * (i & 1 ? 1 : -1), ph: rand() * 6.3 };
    });
    for (const b of boats) nodes.push(b.node);
    const update = (elapsed) => {
      for (const b of boats) {
        const a = b.a + elapsed * b.w, n = b.node;
        n.position.x = Math.sin(a) * b.r; n.position.z = -Math.cos(a) * b.r; n.position.y = sea - 0.2 + Math.sin(elapsed * 0.9 + b.ph) * 0.25;
        // Bow (local +z) along the orbit: the position's derivative in a is (cos a, sin a), signed by the heading.
        n.rotation.y = b.w > 0 ? Math.PI / 2 - a : -Math.PI / 2 - a;
        n.rotation.z = Math.sin(elapsed * 0.8 + b.ph) * 0.06;
        n.rotation.x = Math.sin(elapsed * 0.6 + b.ph * 2) * 0.04;
      }
    };
    update(0);
    return { nodes, update };
  };
  BL.dressing = { U, PALETTE, KIT, LIGHT_RGB, set, motes, palm, islet, nodes, flock, fleet };
})();
