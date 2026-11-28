// The Byzantine Keep's interior, built from keep-halls-layout.js: the halls cut as one voxel grid, a voxel an inch over
// seven (the layout's `U`), and the towers' insides as two more (a short tower and a tall one, each drawn wherever one
// stands), every cell decided by the layout's own air (`columns` with `visual`), so walls, floors, stairs, railings,
// window niches and hearths are exactly what is walked; then the furniture, the lamps and the glimpses out of the doors.
//
// The stone takes its room's `style`: dark ashlar coursed in voxels two high and four long (the castle's outside, cut
// finer), damp slate with moss in the undercroft, pale ashlar in the chapel, timber wainscots and ceilings upstairs, and
// soot over the kitchens' hearth. Doorways, windows and the great arches have dressed surrounds; windows stand open
// behind iron bars. Every floor is laid in the yard's flagstones.
(() => {
  "use strict";
  const BL = window.BL;
  if (BL.keepHallsModels) return;
  const { models, math, terrain: T } = BL, HL = BL.keepHallsLayout, KL = BL.keepLayout, KM = BL.keepModels;
  const { geometry, box, bevelBox, lathe, merge, moved, turnedX, turnedY, turnedZ, noShadow, cached, cachedSteps, variants, shaded, turn, beam, torus } = models;
  const { hexToRgb, mulberry32 } = math;
  const { stone } = BL.arcadeModelsSceneKit;
  const pause = function* (slice) { if (slice) yield* BL.buildTasks.pause(slice); };
  const { U, ROOMS, DOORS, WINDOWS, ARCADES, HEARTHS, STONES, SEGS, TOWERS, RI, RO, R_IN, PER, DT, A0, FLOOR_SECTOR, SLAB, RAIL, KC, R, RW } = HL;
  const TAU = Math.PI * 2, IN = HL.T / 2;

  // ---------- the stone ----------
  const HEX = [null,
    "#1a1b1e", "#16171a", "#1f2024", "#121316", "#24252a", // 1-5 ashlar near black, as the castle's outside
    "#18191c", "#141518", "#1c1d21", // 6-8 damp stone
    "#121110", "#2c372c", "#2c2d32", // 9 soot, 10 moss, 11 dressed stone
    "#4a3524", "#3c2a1c", "#55402b", // 12-14 oak boards
    "#2a2b30", "#25262b", // 15-16 the chapel's ashlar, a shade lighter
    "#2a1f17", "#33261b", // 17-18 timber ceilings
    "#3a2e24", "#2f251d", // 19-20 earth
    "#5070c8", "#6a46b8", "#b8323a", "#d69a34", "#3a9a5e", "#2f5ec4", // 21-26 glass: moon, violet, red, gold, green, blue
    "#3d342e", "#2c2622", // 27-28 a step's tread and riser
    "#ff7a2a", "#4a4440", "#1e1b19", // 29 embers, 30 hearthstone, 31 soot-dark stone
    "#1d1a18", "#24201e", "#2b2724", "#171513", // 32-35 the dungeon's dark cobbles
    "#4b4440", "#423c38", "#554d47", // 36-38 the rooftop's flags
    "#1c1815", // 39 the mortar behind the rooms' blocks
    "#2a2c31", "#212226" // 40-41 the keep's stair, in the islet's black slate: tread and riser
  ];
  const RGB = HEX.map((c) => c && hexToRgb(c));
  const GLOWS = new Map([[21, 0.55], [22, 0.6], [23, 0.75], [24, 0.75], [25, 0.7], [26, 0.75], [29, 1]]);
  const EMISSIVE = new Map([...GLOWS].map(([k, e]) => [RGB[k], e]));
  const hash3 = (a, b, c) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const pick = (list, h) => list[Math.min(list.length - 1, Math.floor(h * list.length))];
  const SLATE = [1, 1, 2, 2, 3, 4, 5], COBBLE = [32, 33, 34, 35, 33], DAMP = [6, 6, 7, 8], PALE = [15, 15, 16, 11], OAK = [12, 13, 14], EARTH = [19, 20, 19, 6], TIMBER = [17, 18];
  // Coursed ashlar on cell (ix, iy, iz): courses two cells high of stones four long, each course's joints shifted.
  const ashlar = (ix, iy, iz, tones) => {
    const c = iy >> 1, o = (c & 1) * 2 + Math.floor(hash3(c, 7, 13) * 3);
    return pick(tones, hash3(Math.floor((ix + o) / 4), c, Math.floor((iz + o) / 4)));
  };
  const flags = (ix, iz, size, tones) => pick(tones, hash3(Math.floor(ix / size), 91, Math.floor((iz + (Math.floor(ix / size) & 1) * (size >> 1)) / size)));
  const boards = (along, across, tones) => { const p = Math.floor(across / 2); return pick(tones, hash3(p, Math.floor((along + p * 7) / 16), 5)); };
  // A wall's cell by its room's style, `up` its height over the room's floor and `down` under its ceiling.
  const wallTone = (style, ix, iy, iz, up, down) => {
    if (style === "cobble" || style === "hall" || style === "stone") return 39;
    if (style === "cobble") return up < 0.7 && hash3(ix >> 1, iy, iz >> 1) > 0.55 + up * 0.6 ? 10 : ashlar(ix, iy, iz, COBBLE);
    if (style === "damp") return up < 0.9 && hash3(ix >> 1, iy, iz >> 1) > 0.45 + up * 0.5 ? 10 : ashlar(ix, iy, iz, DAMP);
    if (style === "chapel") return ashlar(ix, iy, iz, PALE);
    if (style === "roots") return ashlar(ix, iy, iz, EARTH);
    if (style === "kitchen" && down < 1.6) return hash3(ix, iy, iz) < 0.6 + (1.6 - down) * 0.2 ? 31 : 9;
    if (style === "wood" && up < 1.3) return up > 1.12 ? 13 : boards(iy, ix + iz, OAK);
    if (style === "hall" && up > 2.8 && up < 3.0) return 11;
    return ashlar(ix, iy, iz, SLATE);
  };
  const ceilTone = (style, ix, iy, iz, axis) => {
    if (style === "wood") return axis === "z" ? boards(iz, ix, TIMBER) : boards(ix, iz, TIMBER);
    if (style === "chapel") return ashlar(ix, iy, iz, PALE);
    if (style === "kitchen") return 31;
    if (style === "damp" || style === "roots") return ashlar(ix, iy, iz, DAMP);
    if (style === "cobble") return ashlar(ix, iy, iz, COBBLE);
    return 2;
  };
  const meshSteps = function* (g, origin, slice) {
    const geo = yield* T.gridGeometrySteps(g, { unit: U, palette: RGB, origin }, slice);
    for (const f of geo.faces) { const e = EMISSIVE.get(f.color); if (e) f.emissive = e; }
    return geo;
  };
  const inRect = (x, z, x0, x1, z0, z1) => x >= x0 && x < x1 && z >= z0 && z < z1;
  // Marks each solid cell with any face open to air with its stone (`tone(ix, iy, iz, ints, n)`); the rest stay plain.
  const SOLID = 255;
  const paint = function* (g, tone, store, counts, slice) {
    const { data: d, sx, sy, sz } = g, open = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && d[(x * sy + y) * sz + z] === 0;
    for (let x = 0; x < sx; x++) {
      if ((x & 3) === 0) yield* pause(slice);
      for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
        const i = (x * sy + y) * sz + z;
        if (d[i] !== SOLID) continue;
        d[i] = open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1) || open(x, y, z - 1) ? tone(x, y, z, store, counts[x * sz + z], x * sz + z) : 1;
      }
    }
  };
  // Air and stone for every cell of a grid from the layout's columns; `outside(x, z)` columns are left empty.
  const carve = function* (g, ox, oy, oz, outside, slice) {
    const { data: d, sx, sy, sz } = g, col = new Float64Array(64), store = new Float32Array(sx * sz * 16), counts = new Uint8Array(sx * sz);
    for (let x = 0; x < sx; x++) {
      if ((x & 3) === 0) yield* pause(slice);
      const wx = ox + (x + 0.5) * U;
      for (let z = 0; z < sz; z++) {
        const wz = oz + (z + 0.5) * U;
        if (outside && outside(wx, wz)) continue;
        const n = Math.min(8, HL.columns(wx, wz, col, true)), c = x * sz + z;
        counts[c] = n;
        for (let k = 0; k < n * 2; k++) store[c * 16 + k] = col[k];
        for (let y = 0; y < sy; y++) {
          const wy = oy + (y + 0.5) * U;
          let air = false;
          for (let k = 0; k < n; k++) if (wy > col[k * 2] && wy < col[k * 2 + 1]) { air = true; break; }
          d[(x * sy + y) * sz + z] = air ? 0 : SOLID;
        }
      }
    }
    return { store, counts };
  };
  // Whether the cell at height y lies just under an open interval (a floor) or just over one (a ceiling); in a slab
  // between two rooms, whichever face it is nearer.
  const kindOf = (y, store, n, c) => {
    let kind = 0, best = Infinity;
    for (let k = 0; k < n; k++) {
      const b = store[c * 16 + k * 2], t = store[c * 16 + k * 2 + 1], under = b - (y + U / 2), over = (y - U / 2) - t;
      if (under > -1e-4 && under < 2 * U + 1e-4 && under < best) { kind = 1; best = under; }
      if (over > -1e-4 && over < 2 * U + 1e-4 && over < best) { kind = 2; best = over; }
    }
    return kind;
  };

  // ---------- the halls ----------
  const H = { x0: KC.x - RW - 0.375, x1: KC.x + RW + 0.375, z0: KC.z - RW - 0.375, z1: KC.z + RW + 0.75, y0: HL.LEVELS.under.floor - 0.375, y1: HL.LEVELS.roof.ceil + 2 * U };
  // The room a cell at height y is part of: the one over (x, z) whose floor is highest at or under it.
  const roomOf = (x, y, z) => {
    let best = null;
    for (let i = 0; i < ROOMS.length; i++) {
      const r = ROOMS[i];
      if (HL.inRoom(r, x, z) && r.floor - 0.5 <= y && (!best || r.floor > best.floor)) best = r;
    }
    return best;
  };
  const hallTone = (ix, iy, iz, store, n, c) => {
    const x = H.x0 + (ix + 0.5) * U, y = H.y0 + (iy + 0.5) * U, z = H.z0 + (iz + 0.5) * U, kind = kindOf(y, store, n, c);
    const part = HL.stairPart(x, y, z);
    if (part === 1) return kind === 1 ? 40 : 41;
    if (part === 2) return kind === 1 ? 40 : 41;
    const dx = x - KC.x, dz = z - KC.z, rr = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    for (const d of DOORS) if (z > d.at - 0.05 && rr < RW + 0.05 && y > d.floor - 0.01 && y - d.floor < HL.archTop(d.half + 0.3, d.spring, x - d.mid)) return 11;
    for (const l of ARCADES) for (const a of l.arches) {
      let da = ang - a; da -= Math.round(da / TAU) * TAU;
      const into = rr - HL.R_EYE, up = y - l.floor, t = da * HL.R_EYE;
      if (into > -1e-4 && into < 3 * U + 1e-4 && up > -0.2 && up < KL.archTop(KL.KEEP.arch.half + 0.3, KL.KEEP.arch.spring + 0.1, t) + 0.15) return 11;
    }
    for (const w of WINDOWS) {
      let da = ang - w.a; da -= Math.round(da / TAU) * TAU;
      const into = rr - HL.R_EYE, up = y - w.floor - w.sill, t = da * HL.R_EYE;
      if (into > -1e-4 && into < 3 * U + 1e-4 && up > -0.2) {
        const inner = up < HL.archTop(w.half, w.spring - w.sill, t), outer = up < HL.archTop(w.half + 0.22, w.spring - w.sill + 0.1, t) + 0.12;
        if (outer) return 11;
      }
    }
    for (const h of HEARTHS) {
      const across = h.axis === "x" ? x : z, along = h.axis === "x" ? z : x, into = (across - h.at) * h.into, up = y - h.floor, t = Math.abs(along - h.along);
      if (into > IN - h.depth - U && into < IN + 1e-4 && t < h.half + 0.35 && up < h.top + 0.45) return t < h.half && up < h.top ? (kind === 1 ? 30 : 9) : 11;
    }
    for (let i = 0; i < STONES.length; i++) { const b = STONES[i]; if (inRect(x, z, b[0], b[1], b[2], b[3]) && y > b[4] - 0.01 && y < b[5] + 0.01) return y > b[5] - 0.4 ? 11 : ashlar(ix, iy, iz, PALE); }
    for (const sg of SEGS) {
      if (sg[7] !== "wall" || y < sg[5] - 0.01 || y > sg[6] + 0.01) continue;
      const ex = sg[2] - sg[0], ez = sg[3] - sg[1], t = Math.max(0, Math.min(1, ((x - sg[0]) * ex + (z - sg[1]) * ez) / (ex * ex + ez * ez)));
      if (Math.hypot(x - sg[0] - ex * t, z - sg[1] - ez * t) < sg[4] + 0.01) return ashlar(ix, iy, iz, COBBLE);
    }
    const r = roomOf(x, y, z);
    if (!r) return ashlar(ix, iy, iz, SLATE);
    const axis = r.vault ? r.vault.axis : "x";
    // Under the flagstones (`floors`), their grout.
    if (kind === 1) return 39;
    if (kind === 2) return r.vault && r.style !== "wood" && r.style !== "chapel" ? ashlar(ix, iy, iz, SLATE) : ceilTone(r.style, ix, iy, iz, axis);
    return wallTone(r.style, ix, iy, iz, y - r.floor, HL.ceilAt(r, x, z) - y);
  };
  // The rooms' walls as the ghost arena lays its wall (arcade-scene-models.js): blocks a metre square of the arena's rock,
  // taken darker, lapping each other, chamfered and bulging, set round each level's round from its floor to its ceiling,
  // a little in and out at random; open where the door, the lancets and the hearth's breast are. The voxels behind them
  // are mortar.
  const LINER = { block: 1.0, lap: 0.12, depth: 0.9, chamfer: 0.18, bulge: 0.1 };
  const liner = cached(() => {
    const rand = mulberry32(8821), crag = geometry(), cols = Math.round(TAU * R / LINER.block), dA = TAU / cols, tones = KM.ARENA, UPV = [0, 1, 0];
    for (const id of ["dungeon", "lounge", "alchemy", "armory"]) {
      const room = HL.ROOM[id], rows = Math.round((room.ceil - room.floor) / 0.95), ch = (room.ceil - room.floor) / rows;
      const open = (a, y) => {
        let d = a - Math.PI / 2; d -= Math.round(d / TAU) * TAU;
        if (id === "lounge" && Math.abs(d) * R < DOORS[0].half + 0.45 && y < DOORS[0].spring + DOORS[0].half * 1.74 + 0.35) return true;
        let b = a - Math.PI * 1.5; b -= Math.round(b / TAU) * TAU;
        if (id === "lounge" && Math.abs(b) * R < 2.5) return true;
        for (const l of ARCADES) {
          if (l.floor !== room.floor) continue;
          for (const b of l.arches) { let e = a - b; e -= Math.round(e / TAU) * TAU; if (Math.abs(e) * R < KL.KEEP.arch.half + 0.4 && y < l.floor + KL.archTop(KL.KEEP.arch.half + 0.4, KL.KEEP.arch.spring + 0.35, Math.abs(e) * R)) return true; }
        }
        for (const w of WINDOWS) {
          if (w.floor !== room.floor) continue;
          let e = a - w.a; e -= Math.round(e / TAU) * TAU;
          if (Math.abs(e) * R < w.half + 0.4 && y > w.floor + w.sill - 0.35 && y < w.floor + w.spring + w.half * 1.74 + 0.4) return true;
        }
        return false;
      };
      KM.layBlocks(cols, rows, KM.BIG_BLOCKS, rand, (i, j) => !open((i + 0.5) * dA, room.floor + (j + 0.5) * ch), (i, j, w, h) => {
        const a = (i + w / 2) * dA, c = Math.cos(a), sn = Math.sin(a), Rr = R - 0.07 - rand() * 0.08;
        stone(crag, [KC.x + c * Rr, room.floor + (j + h / 2) * ch, KC.z + sn * Rr], [-sn, 0, c], UPV, [-c, 0, -sn], w * dA * R + LINER.lap, h * ch + LINER.lap, LINER.depth, LINER.chamfer, Math.min(w, h) > 1 ? LINER.bulge * 1.4 : LINER.bulge, tones[Math.floor(rand() * tones.length)]);
      });
    }
    return shaded([crag]);
  });
  // Every level's floor laid in the yard's own flagstones (keep-models.js `paved`), round to its wall, open where the
  // stair comes up through it.
  const floors = cached(() => {
    const parts = [];
    for (const id of ["dungeon", "lounge", "alchemy", "armory", "roof"]) {
      const room = HL.ROOM[id], hole = HL.HOLES.find((h) => Math.abs(h.to - room.floor) < 1e-6);
      const inside = (x, z) => {
        const dx = x - KC.x, dz = z - KC.z, r = Math.hypot(dx, dz);
        if (r > room.r - 0.15) return false;
        if (hole && r >= HL.STAIR.r0 - 0.2) { const u = HL.aroundK(Math.atan2(dz, dx)); if (u >= hole.u0 - 0.03 && u < hole.u1 + 0.03) return false; }
        return true;
      };
      parts.push(moved(KM.paved(inside, KC.x - room.r, KC.x + room.r, KC.z - room.r, KC.z + room.r, 1.55, 6101 + parts.length * 17), 0, room.floor, 0));
    }
    return merge(...parts);
  });
  // The same blocks round a curtain tower's inside, from its floor up to its dome, open at its door and its windows.
  const towerLiner = variants((tall) => {
    const t = TOWERS.find((k) => k.tall === !!tall), rand = mulberry32(tall ? 8841 : 8833), crag = geometry(), cols = Math.round(TAU * RI / LINER.block), dA = TAU / cols, top = t.top + HL.DOME.wall, rows = Math.round(top / 0.95), ch = top / rows, UPV = [0, 1, 0];
    const open = (a, y) => {
      let d = a - HL.DOOR_ANGLE; d -= Math.round(d / TAU) * TAU;
      if (Math.abs(d) * RI < HL.TOWER_DOOR.half + 0.4 && y < HL.TOWER_DOOR.spring + HL.TOWER_DOOR.half * 1.74 + 0.3) return true;
      for (const [wa, sill, tallW, half] of t.windows) {
        let e = a - wa; e -= Math.round(e / TAU) * TAU;
        if (Math.abs(e) * RI < half + 0.35 && y > sill - 0.3 && y < sill + tallW + half * 1.74 + 0.35) return true;
      }
      return false;
    };
    KM.layBlocks(cols, rows, KM.BIG_BLOCKS, rand, (i, j) => !open((i + 0.5) * dA, (j + 0.5) * ch), (i, j, w, h) => {
      const a = (i + w / 2) * dA, c = Math.cos(a), sn = Math.sin(a), Rr = RI - 0.07 - rand() * 0.06;
      stone(crag, [c * Rr, (j + h / 2) * ch, sn * Rr], [-sn, 0, c], UPV, [-c, 0, -sn], w * dA * RI + LINER.lap, h * ch + LINER.lap, 0.7, 0.14, LINER.bulge, KM.ARENA[Math.floor(rand() * KM.ARENA.length)]);
    });
    return shaded([crag]);
  });
  const halls = cachedSteps(function* (slice = null) {
    const sx = Math.round((H.x1 - H.x0) / U), sy = Math.round((H.y1 - H.y0) / U), sz = Math.round((H.z1 - H.z0) / U), g = T.makeGrid(sx, sy, sz);
    const { store, counts } = yield* carve(g, H.x0, H.y0, H.z0, null, slice);
    yield* paint(g, hallTone, store, counts, slice);
    return yield* meshSteps(g, { x: H.x0, y: H.y0, z: H.z0 }, slice);
  });

  // ---------- the towers ----------
  // A tower's inside about its middle: `tall` the tower whose stair turns four times, else three.
  const towerTone = (t) => (ix, iy, iz, store, n, c) => {
    const half = Math.ceil((RO + 0.4) / U), x = (ix - half + 0.5) * U, y = -2 * U + (iy + 0.5) * U, z = (iz - half + 0.5) * U, r = Math.hypot(x, z), a = Math.atan2(z, x), kind = kindOf(y, store, n, c);
    for (const [wa, sill, tall, wh] of t.windows) {
      let d = a - wa; d -= Math.round(d / TAU) * TAU;
      const along = d * r, up = y - sill;
      if (r > RI - 0.05 && Math.abs(along) < wh + 0.24 && up > -0.2 && up < HL.archTop(wh + 0.24, tall + 0.1, along) + 0.1) return 11;
    }
    if (Math.abs(x) < HL.TOWER_DOOR.half + 0.3 && z > RI - 0.4 && y < HL.archTop(HL.TOWER_DOOR.half + 0.3, HL.TOWER_DOOR.spring, x)) return 11;
    // The doorway at the landing's end, up into the gallery: lit gold at its back, its arch dressed in pale stone.
    if (r < RI && r > R_IN - U && y > t.top - 0.05) {
      const D = HL.LANDING_DOOR, e = (HL.around(a) - FLOOR_SECTOR) * r, tb = r - (R_IN + RI) / 2, up = y - t.top;
      if (e > -0.05 && e < D.thick) {
        const head = HL.archTop(D.half, D.spring, Math.min(Math.abs(tb), D.half - 1e-3));
        if (Math.abs(tb) < D.half && up < head && e >= D.deep - 0.05) return 24;
        if (Math.abs(tb) < D.half + 0.3 && up < head + 0.3) return 11;
      }
    }
    if (r < RI && y > 0) {
      const u = HL.around(a), jb = Math.floor(u / DT) + 1;
      if (r >= R_IN - U) for (let j = jb; j <= t.n; j += PER) {
        const h = j * U;
        if (y > h - SLAB && y < h) return kind === 1 ? 27 : 28;
        if (r < R_IN && y >= h && y < h + RAIL) return 28;
      }
      if (y > t.top - SLAB - 0.01 && y < t.top + RAIL + 0.01) return kind === 1 ? boards(ix, iz, OAK) : y > t.top ? 11 : 13;
      if (kind === 2) return (Math.floor(a / TAU * 16 + 16) & 1) && r > 1 ? 9 : pick(TIMBER, hash3(Math.floor(r / 0.4), 3, 7));
    }
    if (y < 0.01 && kind === 1) return flags(ix, iz, 4, [1, 2, 3, 5]);
    return ashlar(ix, iy, iz, SLATE);
  };
  const towerInside = variants((tall) => cachedSteps(function* (slice = null) {
    const t = TOWERS.find((k) => k.tall === !!tall), half = Math.ceil((RO + 0.4) / U), sx = 2 * half, sy = Math.ceil((t.top + HL.DOME.wall + HL.DOME.rise + 3 * U) / U) + 2, g = T.makeGrid(sx, sy, sx);
    const ox = -half * U, oy = -2 * U;
    const { store, counts } = yield* carve(g, t.x + ox, oy, t.z + ox, (x, z) => Math.hypot(x - t.x, z - t.z) > RO + 0.05 && !(Math.abs(x - t.x) < HL.TOWER_DOOR.half + 0.4 && z - t.z > 0), slice);
    yield* paint(g, towerTone(t), store, counts, slice);
    return yield* meshSteps(g, { x: ox, y: oy, z: ox }, slice);
  }));

  // ---------- the furniture ----------
  const STEEL = "#9aa0a8", STEEL_D = "#6c7178";
  const IRON = "#26282d", OAKC = "#4a3420", OAK_DK = "#33231a", GILT = "#b8902e", RED = "#6e1f24", WHITE = "#e8e2d2", BRASS = "#a8823a";
  const B = (w, h, d, color, x, y, z, e = 0) => box({ w, h, d, color, emissive: e, offset: { x, y, z } });
  const V = (w, h, d, color, x, y, z, bevel = 0.03) => bevelBox({ w, h, d, color, bevel, offset: { x, y, z } });
  const ball = (r, color, segments = 10, e = 0) => lathe({ profile: [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], segments, color, emissive: e });
  const candle = (x, y, z, h = 0.18) => [B(0.05, h, 0.05, WHITE, x, y + h / 2, z), B(0.035, 0.06, 0.035, "#ffd27a", x, y + h + 0.03, z, 1)];
  const flat = (round, flatParts = []) => shaded(round, flatParts);
  const legs = (w, d, h, color, inset = 0.08, t = 0.09) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => B(t, h, t, color, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset))));
  const BUILD = {
    rug: (p) => noShadow(merge(B(p.w, 0.02, p.d, p.color, 0, 0.012, 0), B(p.w - 0.3, 0.022, p.d - 0.3, "#8a6a2e", 0, 0.013, 0), B(p.w - 0.42, 0.024, p.d - 0.42, p.color, 0, 0.014, 0))),
    chandelier: (p) => {
      const parts = [moved(torus(p.r, 0.05, IRON, 0, 24, 6), 0, 0, 0), moved(torus(p.r * 0.5, 0.04, IRON, 0, 16, 6), 0, 0.25, 0), B(0.04, 1.6, 0.04, IRON, 0, 0.9, 0)];
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; parts.push(...candle(Math.cos(a) * p.r, 0.04, Math.sin(a) * p.r, 0.2)); }
      return merge(...parts);
    },
    bench: (p) => { const L = p.len || 13; return merge(V(0.48, 0.07, L, OAKC, 0, 0.43, 0), ...[-1, 0, 1].flatMap((k) => [B(0.4, 0.4, 0.08, OAK_DK, 0, 0.2, k * (L / 2 - 0.5))])); },
    highTable: () => merge(V(6, 0.09, 1.2, OAKC, 0, 0.78, 0), B(5.6, 0.02, 0.5, RED, 0, 0.83, 0), ...legs(6, 1.2, 0.74, OAK_DK), ...candle(-2, 0.83, 0, 0.3), ...candle(2, 0.83, 0, 0.3)),
    throneChair: () => merge(V(1.1, 0.12, 0.9, OAK_DK, 0, 0.5, 0), V(1.1, 1.9, 0.14, OAK_DK, 0, 1.25, -0.4), V(0.9, 0.08, 0.7, RED, 0, 0.6, 0.05), V(0.8, 1.2, 0.04, RED, 0, 1.3, -0.32),
      ...[-1, 1].map((s) => V(0.12, 0.5, 0.8, OAK_DK, s * 0.5, 0.82, 0.0)), ...[-1, 1].map((s) => moved(ball(0.08, GILT), s * 0.5, 2.25, -0.4)), ...legs(1.1, 0.9, 0.45, OAK_DK)),
    banner: (p) => {
      const parts = [B(p.w + 0.3, 0.07, 0.07, IRON, 0, 0, 0.06), B(p.w, p.h * 0.82, 0.03, p.color, 0, -p.h * 0.41, 0.06)], tipZ = 0.06;
      for (let k = 0; k < 5; k++) { const w = p.w * (1 - k / 5); parts.push(B(w, p.h * 0.036, 0.03, p.color, 0, -p.h * 0.82 - (k + 0.5) * p.h * 0.036, tipZ)); }
      parts.push(B(p.w, 0.07, 0.035, GILT, 0, -0.12, 0.065), B(0.07, p.h * 0.6, 0.035, GILT, 0, -p.h * 0.42, 0.065), B(p.w * 0.6, 0.07, 0.035, GILT, 0, -p.h * 0.32, 0.065));
      return merge(...parts);
    },
    beams: (p) => merge(...p.at.map((v) => p.span === "x" ? B(p.to - p.from, 0.34, 0.3, OAK_DK, (p.from + p.to) / 2 - p.x, -0.17, v - p.z) : B(0.3, 0.34, p.to - p.from, OAK_DK, v - p.x, -0.17, (p.from + p.to) / 2 - p.z))),
    cauldron: (p) => {
      // The alchemy room's great one twice as wide (`kw`) as it is tall (`k`), brimming with glowing green brew and
      // bubbles breaking on it.
      const k = p.big ? 1.4 : 1, kw = p.big ? 2.8 : 1, pot = lathe({ profile: [[0, 0.05], [0.4, 0.12], [0.55, 0.35], [0.55, 0.62], [0.5, 0.7], [0, 0.7]].map(([r, y]) => [r * kw, y * k]), segments: p.big ? 28 : 16, color: "#1c1d20" });
      const brew = moved(lathe({ profile: [[0, 0], [0.49 * kw, 0], [0.3 * kw, 0.02 * k], [0, 0.03 * k]], segments: p.big ? 28 : 16, color: p.fire ? "#3cff8a" : "#ffb04a", emissive: 0.95 }), 0, 0.64 * k, 0);
      const parts = [pot, brew];
      if (p.big) { const rand = mulberry32(17); for (let j = 0; j < 9; j++) { const a = rand() * TAU, r = rand() * 0.4 * kw; parts.push(moved(ball(0.05 + rand() * 0.07, "#8affb8", 6, 0.9), Math.cos(a) * r, 0.68 * k, Math.sin(a) * r)); } parts.push(moved(torus(0.52 * kw, 0.05, "#2a2c31", 0, 28, 6), 0, 0.69 * k, 0)); }
      if (p.hung) parts.push(B(0.04, 1.4, 0.04, IRON, 0, 1.4, 0), moved(torus(0.5, 0.025, IRON, 0, 16, 4), 0, 0.7, 0));
      else for (let j = 0; j < 3; j++) { const a = j / 3 * TAU; parts.push(beam(Math.cos(a) * 0.7 * kw, 0, Math.sin(a) * 0.7 * kw, Math.cos(a) * 0.4 * kw, 0.5 * k, Math.sin(a) * 0.4 * kw, 0.05 * k * (p.big ? 1.5 : 1), IRON)); }
      return merge(...parts);
    },
    workTable: () => merge(V(3, 0.1, 1.2, "#5a4028", 0, 0.82, 0), ...legs(3, 1.2, 0.8, OAK_DK), ...[[-1, 0.2], [0.2, -0.3], [0.9, 0.25]].map(([x, z]) => moved(ball(0.14, "#b8863e"), x, 0.94, z)),
      B(0.5, 0.03, 0.3, "#7a5a38", -0.4, 0.88, -0.2), B(0.28, 0.02, 0.05, "#9da0a6", 0.6, 0.88, -0.3)),
    pots: () => { const parts = [B(2.6, 0.08, 0.08, IRON, 0, 0, 0), B(0.04, 2, 0.04, IRON, -1.2, 1, 0), B(0.04, 2, 0.04, IRON, 1.2, 1, 0)];
      for (let k = 0; k < 5; k++) parts.push(moved(lathe({ profile: [[0, 0], [0.18, 0.02], [0.2, 0.18], [0.16, 0.22], [0, 0.22]], segments: 10, color: k % 2 ? "#a85a2e" : "#7a4a2a" }), -1 + k * 0.5, -0.5, 0), B(0.02, 0.28, 0.02, IRON, -1 + k * 0.5, -0.14, 0));
      return merge(...parts); },
    // The kit's barrel and a row of three, as the yard's (keep-models.js `kit`).
    barrel: () => BL.keepModels.kit("barrel").geometry,
    barrels: () => BL.keepModels.kit("barrels").geometry,
    shaft: () => { const parts = []; for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) parts.push(B(0.1, 6.3, 0.1, OAK_DK, x, 3.15, z));
      for (const y of [1.1, 3.2, 5.3]) parts.push(B(1.2, 0.08, 0.08, OAK_DK, 0, y, -0.55), B(1.2, 0.08, 0.08, OAK_DK, 0, y, 0.55), B(0.08, 0.08, 1.2, OAK_DK, -0.55, y, 0), B(0.08, 0.08, 1.2, OAK_DK, 0.55, y, 0));
      parts.push(V(0.9, 0.7, 0.9, "#5c4028", 0, 1.6, 0), B(0.02, 4.2, 0.02, "#8a7350", 0, 4.1, 0)); return merge(...parts); },
    shelf: () => { const parts = [V(3, 2.4, 0.08, OAK_DK, 0, 1.2, -0.18)]; for (const y of [0.05, 0.85, 1.65]) parts.push(V(3, 0.06, 0.44, OAKC, 0, y, 0));
      const rand = mulberry32(77);
      for (const y of [0.08, 0.88, 1.68]) for (let x = -1.3; x < 1.3; x += 0.32 + rand() * 0.2) { const h = 0.18 + rand() * 0.3, c = pick(["#6a4a8a", "#3a7a5a", "#8a4a2a", "#5a5a68", "#b8863e"], rand());
        parts.push(moved(lathe({ profile: [[0, 0], [0.1, 0], [0.11, h * 0.7], [0.05, h], [0, h]], segments: 8, color: c }), x, y, 0)); }
      return merge(...parts); },
    rack: () => { const parts = [V(3, 0.1, 0.4, OAK_DK, 0, 0.05, 0), V(3, 0.1, 0.1, OAK_DK, 0, 1.6, -0.12), B(0.12, 2.1, 0.12, OAK_DK, -1.45, 1.05, -0.12), B(0.12, 2.1, 0.12, OAK_DK, 1.45, 1.05, -0.12)];
      for (let k = 0; k < 8; k++) { const x = -1.2 + k * 0.34; if (k % 3 === 0) parts.push(B(0.04, 2.1, 0.04, OAKC, x, 1.05, 0), B(0.08, 0.26, 0.02, "#9da3ad", x, 2.2, 0));
        else if (k % 3 === 1) parts.push(B(0.06, 1.1, 0.015, "#aab0ba", x, 0.75, 0), B(0.3, 0.05, 0.05, GILT, x, 1.32, 0), B(0.05, 0.25, 0.05, "#3a2a1a", x, 1.46, 0));
        else parts.push(B(0.05, 1.5, 0.05, OAKC, x, 0.85, 0), B(0.3, 0.3, 0.03, "#8d939c", x + 0.12, 1.45, 0)); }
      return merge(...parts); },
    shields: () => { const parts = [], CRESTS = [[RED, GILT], ["#1f3a6e", WHITE], [RED, WHITE], ["#1f3a6e", GILT], ["#2c4a2a", GILT], [RED, "#1f3a6e"]];
      CRESTS.forEach(([a, b], k) => { const z = -1.6 + k * 0.64, s = lathe({ profile: [[0, -0.32], [0.2, -0.22], [0.27, 0.05], [0.27, 0.3], [0, 0.3]], segments: 4, color: a });
        parts.push(moved(turnedX(s, Math.PI / 2), 0.04, 0, z), moved(turnedX(B(0.06, 0.5, 0.012, b, 0, 0, 0), 0), 0.06, 0, z), B(0.012, 0.06, 0.45, b, 0.08, 0.06, z)); });
      return merge(...parts.map((g) => turnedY(g, -Math.PI / 2))); },
    anvil: () => merge(lathe({ profile: [[0, 0], [0.32, 0], [0.3, 0.45], [0, 0.45]], segments: 10, color: "#5a4028" }), V(0.7, 0.18, 0.3, "#2a2c31", 0, 0.62, 0), V(0.4, 0.14, 0.2, "#2a2c31", 0, 0.5, 0), V(0.2, 0.1, 0.2, "#2a2c31", 0.42, 0.66, 0)),
    altar: () => merge(V(1.1, 1.0, 2.6, "#5e5751", 0, 0.5, 0), B(1.15, 0.03, 2.65, WHITE, 0, 1.015, 0), B(1.16, 0.4, 0.05, RED, 0.02, 0.8, 0), B(0.08, 0.9, 0.08, GILT, -0.2, 1.48, 0), B(0.08, 0.08, 0.5, GILT, -0.2, 1.7, 0),
      ...[-0.9, 0.9].flatMap((z) => [moved(lathe({ profile: [[0, 0], [0.08, 0], [0.03, 0.05], [0.03, 0.4], [0, 0.4]], segments: 8, color: GILT }), 0.1, 1.03, z), ...candle(0.1, 1.43, z, 0.22)]),
      moved(lathe({ profile: [[0, 0], [0.06, 0], [0.02, 0.04], [0.02, 0.1], [0.07, 0.14], [0.08, 0.22], [0, 0.2]], segments: 8, color: GILT }), 0.2, 1.03, 0.35)),
    pew: () => merge(V(0.5, 0.07, 3.2, OAKC, 0, 0.45, 0), V(0.08, 0.6, 3.2, OAKC, -0.24, 0.8, 0), ...[-1.5, 1.5].map((z) => V(0.6, 0.95, 0.08, OAK_DK, 0, 0.47, z))),
    bookcase: (p) => {
      const L = p.len || 3.2, parts = [V(L, 3.4, 0.08, OAK_DK, 0, 1.7, -0.21), V(0.1, 3.4, 0.5, OAK_DK, -L / 2 + 0.05, 1.7, 0), V(0.1, 3.4, 0.5, OAK_DK, L / 2 - 0.05, 1.7, 0), V(L, 0.12, 0.52, OAK_DK, 0, 3.4, 0)], rand = mulberry32(Math.round(L * 100));
      const INKS = ["#6e1f24", "#1f3a6e", "#2c4a2a", "#5a3a1a", "#6a4a2a", "#3a2a4a", "#8a6a2e", "#2a2a30"];
      for (let s = 0; s < 5; s++) { const y = 0.1 + s * 0.66; parts.push(V(L - 0.1, 0.05, 0.46, OAKC, 0, y, 0));
        for (let x = -L / 2 + 0.14; x < L / 2 - 0.14;) { const w = 0.05 + rand() * 0.06, h = 0.32 + rand() * 0.22; if (rand() < 0.08) { x += 0.12; continue; }
          parts.push(B(w, h, 0.3 + rand() * 0.08, pick(INKS, rand()), x + w / 2, y + 0.03 + h / 2, 0.02)); x += w + 0.005; } }
      return merge(...parts);
    },
    readingTable: () => merge(V(2.4, 0.08, 1.2, OAKC, 0, 0.78, 0), ...legs(2.4, 1.2, 0.74, OAK_DK), B(0.5, 0.04, 0.36, "#e6dcc0", -0.3, 0.84, 0), B(0.02, 0.05, 0.36, "#8a6a2e", -0.3, 0.86, 0), ...candle(0.7, 0.82, -0.2, 0.2), B(0.3, 0.12, 0.22, "#6e1f24", 0.4, 0.88, 0.25)),
    bed: () => merge(V(2.2, 0.5, 2.8, OAK_DK, 0, 0.25, 0), V(2.0, 0.22, 2.6, "#cfc6b0", 0, 0.6, 0), V(2.04, 0.12, 1.9, "#5a2050", 0, 0.72, 0.35), ...[-0.5, 0.5].map((x) => V(0.7, 0.18, 0.45, WHITE, x, 0.8, -1.0)),
      ...[[-1.05, -1.35], [1.05, -1.35], [-1.05, 1.35], [1.05, 1.35]].map(([x, z]) => B(0.12, 2.6, 0.12, OAK_DK, x, 1.3, z)), V(2.3, 0.12, 2.9, "#5a2050", 0, 2.6, 0), V(2.0, 1.2, 0.05, "#5a2050", 0, 2.0, -1.38),
      V(2.2, 0.9, 0.1, OAK_DK, 0, 1.1, -1.4)),
    chest: () => merge(V(1.2, 0.5, 0.7, "#5a3a20", 0, 0.25, 0), V(1.22, 0.14, 0.72, "#4a301a", 0, 0.56, 0), ...[-0.4, 0.4].map((x) => B(0.06, 0.66, 0.74, IRON, x, 0.32, 0)), B(0.12, 0.14, 0.04, GILT, 0, 0.4, 0.37)),
    desk: () => merge(V(1.8, 0.07, 1.0, OAKC, 0, 0.78, 0), V(0.5, 0.74, 0.9, OAK_DK, -0.6, 0.37, 0), ...legs(1.8, 1.0, 0.74, OAK_DK), B(0.12, 0.12, 0.03, GILT, -0.6, 0.5, 0.46),
      B(0.6, 0.02, 0.45, "#e6dcc0", 0.2, 0.825, 0.05), B(0.02, 0.22, 0.02, WHITE, 0.6, 0.93, -0.25), ...candle(-0.5, 0.82, -0.3, 0.22), V(0.6, 0.06, 0.55, OAK_DK, 0, 0.48, 0.9), V(0.6, 0.8, 0.06, OAK_DK, 0, 0.88, 1.15)),
    portrait: (p) => { const k = p.index || 0, bg = ["#2a3a2a", "#3a2030", "#20283a", "#3a3020"][k % 4], coat = ["#6e1f24", "#1f3a6e", "#2c4a2a", "#4a2a5a"][k % 4];
      return merge(V(1.3, 1.7, 0.08, GILT, 0, 0, 0.04), B(1.1, 1.5, 0.02, bg, 0, 0, 0.085), B(0.8, 0.6, 0.02, coat, 0, -0.45, 0.095), B(0.34, 0.42, 0.02, "#c9a07a", 0, 0.12, 0.096), B(0.4, 0.14, 0.02, "#2a1a10", 0, 0.36, 0.097)); },
    tapestry: (p) => { const parts = [B(p.w + 0.3, 0.07, 0.07, IRON, 0, 0, 0.06)], cols = 8, rows = 12;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) parts.push(B(p.w / cols, p.h / rows, 0.03, ((i + j) & 1) ? "#5a1f2e" : (i % 3 === j % 3 ? GILT : "#2a3a5a"), -p.w / 2 + (i + 0.5) * p.w / cols, -(j + 0.5) * p.h / rows, 0.05));
      return merge(...parts); },
    harp: () => merge(beam(0, 0.05, 0, 0, 1.75, 0, 0.08, GILT), beam(0, 1.75, 0, 0, 1.4, 0.9, 0.08, GILT), beam(0, 0.1, 0.05, 0, 1.4, 0.9, 0.12, "#6a4420"), ...Array.from({ length: 7 }, (_, k) => { const z = 0.1 + k * 0.11; return B(0.012, 1.6 - k * 0.12 - 0.25, 0.012, "#e8dcb0", 0, 0.1 + (1.6 - k * 0.12 - 0.25) / 2 + k * 0.17, z); })),
    labBench: () => { const parts = [V(1.0, 0.08, 4.4, "#4a3420", 0, 0.88, 0), V(0.9, 0.8, 4.3, OAK_DK, 0, 0.42, 0)];
      [["#ff3a3a", -1.4], ["#3a7bff", 0], ["#3aff7a", 1.4]].forEach(([c, z]) => { parts.push(moved(lathe({ profile: [[0, 0], [0.18, 0], [0.22, 0.12], [0.16, 0.3], [0.05, 0.36], [0.05, 0.5], [0, 0.5]], segments: 12, color: "#cfe0ea" }), 0, 0.92, z),
        moved(lathe({ profile: [[0, 0], [0.19, 0], [0.2, 0.12], [0.14, 0.26], [0, 0.26]], segments: 12, color: c, emissive: 0.85 }), 0, 0.93, z)); });
      for (const z of [-2, -0.7, 0.7, 2]) parts.push(moved(lathe({ profile: [[0, 0], [0.05, 0], [0.05, 0.22], [0.02, 0.26], [0, 0.26]], segments: 8, color: pick(["#8a4ac8", "#c8a43a", "#4ac8b8"], (z + 3) / 6) }), -0.25, 0.92, z));
      parts.push(moved(ball(0.13, "#d8cfb8", 10), 0.2, 1.05, -2), B(0.4, 0.14, 0.3, "#3a2030", 0.15, 0.99, 1.95));
      return merge(...parts); },
    mapTable: () => merge(V(1.8, 0.08, 1.4, OAKC, 0, 0.78, 0), ...legs(1.8, 1.4, 0.74, OAK_DK), B(1.5, 0.02, 1.1, "#d8c79a", 0, 0.83, 0), B(0.9, 0.022, 0.02, "#5a3a1a", 0, 0.835, 0.1), B(0.02, 0.022, 0.6, "#5a3a1a", -0.3, 0.835, 0), B(0.3, 0.022, 0.3, "#6e1f24", 0.4, 0.836, -0.25), ...candle(0.75, 0.82, 0.55, 0.2)),
    wineRack: () => { const parts = [V(3.6, 2.2, 0.08, OAK_DK, 0, 1.1, -0.3)]; for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) parts.push(B(0.12, 0.12, 0.5, j % 2 ? "#1f3a2a" : "#2a1a20", -1.6 + i * 0.4, 0.2 + j * 0.34, 0), B(0.05, 0.05, 0.08, "#8a7a5a", -1.6 + i * 0.4, 0.2 + j * 0.34, 0.27));
      for (const x of [-1.8, -0.6, 0.6, 1.8]) parts.push(B(0.08, 2.2, 0.6, OAK_DK, x, 1.1, 0)); return merge(...parts); },
    bars: () => { const parts = []; for (let z = -5.6; z <= 5.6; z += 0.22) parts.push(B(0.05, 4.5, 0.05, IRON, 0, 2.25, z));
      for (const y of [0.4, 2.2, 4.2]) parts.push(B(0.08, 0.08, 11.2, IRON, 0, y, 0));
      for (const z of [-2, 1.6]) parts.push(V(3.2, 4.5, 0.4, "#2e2925", -1.6, 2.25, z));
      return merge(...parts); },
    chains: () => { const parts = []; for (const z of [-1.2, 0, 1.2]) for (let k = 0; k < 8; k++) parts.push(moved(turnedZ(torus(0.05, 0.012, IRON, 0, 8, 4), (k & 1) * Math.PI / 2), 0.05, -k * 0.09, z)); parts.push(...[-1.2, 0, 1.2].map((z) => moved(torus(0.08, 0.02, IRON, 0, 10, 4), 0.05, -0.8, z))); return merge(...parts.map((g) => turnedY(g, -Math.PI / 2))); },
    scratches: () => { const parts = [], rand = mulberry32(13); for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) if (rand() < 0.75) parts.push(B(0.02, 0.18, 0.01, "#0e0e10", -1.2 + c * 0.3 + rand() * 0.05, r * 0.3, 0.01));
      parts.push(B(2.2, 0.02, 0.01, "#0e0e10", 0, 0.75, 0.011), B(0.02, 1.3, 0.01, "#0e0e10", 0.1, 0.6, 0.011)); return merge(...parts); },
    jailTable: () => merge(V(1.2, 0.07, 0.9, OAK_DK, 0, 0.78, 0), ...legs(1.2, 0.9, 0.74, OAK_DK), moved(torus(0.08, 0.015, IRON, 0, 10, 4), 0.3, 0.83, 0.1), V(0.5, 0.45, 0.5, OAK_DK, 0.2, 0.22, 0.75), B(0.18, 0.28, 0.18, IRON, -0.3, 0.96, -0.1), B(0.12, 0.18, 0.12, "#ffb04a", -0.3, 0.96, -0.1, 1)),
    root: () => { const parts = [], rand = mulberry32(7); let x = 0, z = 0;
      for (let k = 0; k < 6; k++) { const nx = x + (rand() - 0.5) * 0.35, nz = z + (rand() - 0.5) * 0.35; parts.push(beam(x, k * 0.78, z, nx, (k + 1) * 0.78, nz, 0.32 - k * 0.025, "#4a3324")); x = nx; z = nz; }
      for (let k = 0; k < 4; k++) { const a = rand() * TAU; parts.push(beam(0, 0.1, 0, Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9, 0.12, "#3e2a1c")); }
      return merge(...parts); },
    cobweb: () => { const parts = [], rand = mulberry32(19); for (let k = 0; k < 40; k++) { const x = -8 + rand() * 16, z = -13.4 + rand() * 5, len = 0.6 + rand() * 2.4; parts.push(beam(x - 0, 4.5, z + 11, x + (rand() - 0.5) * 0.4, 4.5 - len, z + 11 + (rand() - 0.5) * 0.4, 0.05 + rand() * 0.06, "#3e2a1c")); }
      return merge(...parts); },
    tomb: () => merge(V(2.2, 0.85, 1.1, "#5b524b", 0, 0.43, 0), V(2.3, 0.12, 1.2, "#6b7280", 0, 0.9, 0), B(2.0, 0.05, 0.9, "#4a423c", 0, 0.3, 0.56)),
    gold: () => { const parts = [], rand = mulberry32(23); for (let k = 0; k < 40; k++) { const r = rand() * 0.55, a = rand() * TAU, h = (0.55 - r) * 0.7; parts.push(B(0.1, 0.03, 0.1, "#e8b830", Math.cos(a) * r, h, Math.sin(a) * r, 0.25)); }
      parts.push(moved(lathe({ profile: [[0, 0], [0.06, 0], [0.02, 0.05], [0.02, 0.12], [0.08, 0.16], [0.09, 0.26], [0, 0.24]], segments: 8, color: GILT, emissive: 0.15 }), 0.3, 0.2, 0.1)); return merge(...parts); },
    pedestal: () => merge(turn([[0.4, 0], [0.4, 0.12], [0.26, 0.2], [0.22, 0.9], [0.34, 1.0], [0.34, 1.1], [0, 1.1]], 10, "#5b524b"), moved(torus(0.09, 0.025, GILT, 0.6, 12, 5), 0, 1.45, 0),
      B(0.04, 0.32, 0.04, GILT, 0, 1.25, 0, 0.6), B(0.12, 0.04, 0.03, GILT, 0.04, 1.12, 0, 0.6), B(0.08, 0.04, 0.03, GILT, 0.03, 1.18, 0, 0.6)),
    pool: () => { const g = geometry(), half = 3.4, y = 0.32; models.face(g, [models.pushVert(g, -half, y, -half), models.pushVert(g, -half, y, half), models.pushVert(g, half, y, half), models.pushVert(g, half, y, -half)], hexToRgb("#0f2636")); g.faces[0].water = true;
      return merge(g, ...[-1, 1].flatMap((s) => [V(7.3, 0.6, 0.35, "#4a423c", 0, 0.3, s * 3.55), V(0.35, 0.6, 7.3, "#4a423c", s * 3.55, 0.3, 0)])); }
  };
  // The pieces whose parts want room to be written out.
  BUILD.harpsichord = () => merge(V(1.0, 0.25, 2.4, "#3a2012", 0, 0.9, 0), ...[[-0.4, -1.1], [0.4, -1.1], [-0.4, 1.1], [0.4, 1.1]].map(([x, z]) => B(0.08, 0.78, 0.08, OAK_DK, x, 0.39, z)),
    V(0.9, 0.04, 0.3, WHITE, 0, 1.04, 1.05), ...Array.from({ length: 9 }, (_, k) => B(0.05, 0.03, 0.18, "#151515", -0.36 + k * 0.09, 1.07, 1.0)), moved(turnedX(V(1.0, 0.03, 2.0, "#5a3a20", 0, 0, 0), -0.7), 0, 1.6, -0.35));
  BUILD.stand = () => merge(B(0.04, 1.2, 0.04, IRON, 0, 0.6, 0), moved(turnedX(B(0.5, 0.36, 0.02, IRON, 0, 0, 0), -0.4), 0, 1.25, 0), ...[-0.15, 0.15].map((x) => beam(0, 0.02, 0, x * 2, 0, 0.3, 0.025, IRON)));
  BUILD.valve = () => merge(B(0.22, 0.22, 3.6, "#3a3d44", 0, 1.6, -0.1), B(0.18, 1.4, 0.18, "#3a3d44", 0, 0.9, 0.15), moved(turnedX(torus(0.34, 0.04, "#7a2a20", 0, 16, 5), Math.PI / 2), 0, 1.25, 0.42), B(0.04, 0.62, 0.04, "#7a2a20", 0, 1.25, 0.42), B(0.62, 0.04, 0.04, "#7a2a20", 0, 1.25, 0.42));
  BUILD.table = (p) => {
    const L = p.len || 14, parts = [V(1.4, 0.09, L, OAKC, 0, 0.78, 0)], rand = mulberry32(41);
    for (let k = 0; k < 4; k++) { const z = -L / 2 + 1 + k * (L - 2) / 3; parts.push(B(0.16, 0.74, 0.16, OAK_DK, 0, 0.37, z), B(1.1, 0.12, 0.12, OAK_DK, 0, 0.12, z)); }
    for (let z = -L / 2 + 0.7; z < L / 2 - 0.5; z += 0.9) for (const s of [-1, 1]) {
      parts.push(moved(lathe({ profile: [[0, 0], [0.16, 0], [0.17, 0.02], [0, 0.02]], segments: 10, color: "#8d8d92" }), s * 0.42, 0.825, z));
      if (rand() < 0.6) parts.push(moved(lathe({ profile: [[0, 0], [0.04, 0], [0.02, 0.04], [0.02, 0.1], [0.05, 0.13], [0.055, 0.2], [0, 0.2]], segments: 8, color: GILT }), s * 0.42 + 0.22 * s, 0.825, z + 0.2));
    }
    for (let z = -L / 2 + 2.5; z < L / 2; z += 3) parts.push(moved(lathe({ profile: [[0, 0], [0.09, 0], [0.03, 0.06], [0.03, 0.3], [0.06, 0.32], [0, 0.32]], segments: 8, color: BRASS }), 0, 0.825, z), ...candle(0, 1.14, z, 0.16));
    return merge(...parts);
  };
  // The tower rooms' own pieces, in the tower's frame about their own feet.
  Object.assign(BUILD, {
    perch: () => merge(B(0.12, 2.0, 0.12, OAK_DK, 0, 1.0, 0), B(1.4, 0.08, 0.08, OAK_DK, 0, 1.9, 0), B(0.9, 0.08, 0.08, OAK_DK, 0, 1.3, 0), V(0.6, 0.1, 0.6, OAK_DK, 0, 0.05, 0)),
    nest: () => merge(lathe({ profile: [[0, 0], [0.45, 0.02], [0.55, 0.2], [0.42, 0.26], [0.3, 0.12], [0, 0.1]], segments: 12, color: "#6a5432" }), ...[[0.1, 0.05], [-0.1, 0.08]].map(([x, z]) => moved(ball(0.07, "#cfc6b0", 8), x, 0.16, z))),
    bell: () => { const bell = lathe({ profile: [[0, 1.5], [0.38, 1.45], [0.5, 1.1], [0.62, 0.45], [0.95, 0.06], [1.0, 0], [0.82, 0.02], [0.5, 0.42], [0.36, 1.2], [0, 1.3]], segments: 20, color: "#8a6a2e" });
      return merge(moved(bell, 0, 2.75, 0), B(4.6, 0.36, 0.4, OAK_DK, 0, 4.45, 0), B(0.06, 0.9, 0.06, IRON, 0, 3.6, 0), moved(ball(0.14, "#4a3a20"), 0, 2.85, 0), B(0.03, 2.8, 0.03, "#8a7350", 0.7, 1.4, 0.3)); },
    clockFace: () => { const parts = [turnedX(lathe({ profile: [[0, 0], [1.4, 0], [1.45, 0.12], [0, 0.12]], segments: 28, color: "#d8cfb0", emissive: 0.35 }), Math.PI / 2), turnedX(torus(1.45, 0.08, GILT, 0, 28, 6), Math.PI / 2)];
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; parts.push(B(0.08, k % 3 ? 0.18 : 0.32, 0.03, "#1a1a1a", Math.sin(a) * 1.15, Math.cos(a) * 1.15, 0.13)); }
      return merge(...parts.map((g) => moved(g, 0, 2.7, -0.05))); },
    clockHand: (p) => merge(B(0.07, p.len, 0.03, "#141414", 0, p.len / 2 - 0.12, 0), B(0.14, 0.14, 0.04, GILT, 0, 0, 0.01)),
    gears: () => { const parts = [B(0.12, 2.2, 0.12, IRON, -0.6, 1.1, 0), B(0.12, 2.2, 0.12, IRON, 0.6, 1.1, 0), B(1.4, 0.12, 0.12, IRON, 0, 2.2, 0)];
      for (const [x, y, r] of [[-0.2, 1.5, 0.45], [0.35, 0.9, 0.32], [0.1, 0.45, 0.22]]) { parts.push(moved(turnedX(lathe({ profile: [[0, 0], [r, 0], [r, 0.06], [0, 0.06]], segments: 16, color: BRASS }), Math.PI / 2), x, y, 0.08));
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; parts.push(B(0.06, 0.06, 0.06, BRASS, x + Math.cos(a) * (r + 0.04), y + Math.sin(a) * (r + 0.04), 0.11)); } }
      return merge(...parts); },
    pendulum: () => merge(B(0.03, 1.6, 0.03, BRASS, 0, -0.8, 0), moved(turnedX(lathe({ profile: [[0, 0], [0.22, 0], [0.22, 0.05], [0, 0.05]], segments: 14, color: GILT }), Math.PI / 2), 0, -1.65, 0)),
    telescope: () => merge(...[0, 1, 2].map((k) => { const a = k / 3 * TAU; return beam(0, 1.3, 0, Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6, 0.05, OAK_DK); }),
      moved(turnedX(lathe({ profile: [[0, -1.2], [0.12, -1.2], [0.14, -0.4], [0.17, 0.2], [0.2, 1.1], [0.23, 1.2], [0, 1.2]], segments: 14, color: BRASS }), -Math.PI / 2 + 0.55), 0, 1.4, 0),
      moved(torus(0.2, 0.03, GILT, 0, 14, 5), 0, 1.4, 0)),
    starTable: () => merge(V(1.6, 0.08, 1.0, OAKC, 0, 0.78, 0), ...legs(1.6, 1.0, 0.74, OAK_DK), B(1.4, 0.02, 0.8, "#1a2240", 0, 0.83, 0, 0.2),
      ...Array.from({ length: 18 }, (_, k) => B(0.03, 0.022, 0.03, "#f0e6b0", -0.6 + ((k * 0.37) % 1.2), 0.836, -0.35 + ((k * 0.61) % 0.7), 0.9)),
      moved(torus(0.3, 0.02, BRASS, 0, 18, 4), 0.55, 1.25, 0.2), moved(turnedX(torus(0.3, 0.02, BRASS, 0, 18, 4), Math.PI / 2), 0.55, 1.25, 0.2), moved(ball(0.08, GILT), 0.55, 1.25, 0.2), B(0.04, 0.4, 0.04, BRASS, 0.55, 0.98, 0.2)),
    brazier: () => merge(turn([[0.32, 0], [0.32, 0.08], [0.1, 0.12], [0.1, 0.7], [0.5, 0.95], [0.55, 1.05], [0, 1.0]], 12, IRON), moved(lathe({ profile: [[0, 0], [0.45, 0], [0, 0.04]], segments: 12, color: "#ff6a2a", emissive: 1 }), 0, 1.0, 0)),
    guardDoor: () => merge(V(1.6, 2.6, 0.12, OAK_DK, 0, 1.3, -0.04), ...[0.5, 1.3, 2.1].map((y) => B(1.62, 0.08, 0.04, IRON, 0, y, 0.03)), moved(torus(0.09, 0.02, IRON, 0, 10, 4), 0.55, 1.2, 0.06)),
    crown: () => { const parts = [turn([[0.36, 0], [0.36, 0.1], [0.24, 0.18], [0.2, 0.95], [0.3, 1.05], [0.3, 1.15], [0, 1.15]], 10, "#3a3f4b")];
      parts.push(moved(lathe({ profile: [[0.16, 0], [0.18, 0], [0.18, 0.1], [0.16, 0.1]], segments: 16, color: "#ffcf3a", emissive: 0.6 }), 0, 1.3, 0));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; parts.push(B(0.05, 0.12, 0.05, "#ffcf3a", Math.cos(a) * 0.17, 1.45, Math.sin(a) * 0.17, 0.6), B(0.04, 0.04, 0.04, k % 2 ? "#ff3a4a" : "#3a7bff", Math.cos(a) * 0.18, 1.36, Math.sin(a) * 0.18, 0.9)); }
      return merge(...parts); },
    throne: () => merge(V(1.3, 0.5, 1.1, "#3a3f4b", 0, 0.25, 0), V(1.0, 0.12, 0.9, "#5a1f3a", 0, 0.56, 0.05), V(1.3, 2.6, 0.2, "#3a3f4b", 0, 1.6, -0.45), V(1.0, 1.6, 0.04, "#5a1f3a", 0, 1.5, -0.34),
      ...[-1, 1].map((s) => V(0.18, 0.55, 1.0, "#3a3f4b", s * 0.62, 0.78, 0)), ...[-1, 0, 1].map((s) => moved(lathe({ profile: [[0, 0], [0.1, 0], [0, 0.35]], segments: 6, color: GILT }), s * 0.45, 2.9, -0.45)))
  });
  // The keep's own pieces: the lounge's, the alchemy room's, the dungeon's and the rooftop's.
  const CLOTHS = ["#6e1f24", "#1f3a6e", "#2c4a2a", "#4a2a5a"], BONE = "#d8d0bc", GLASS = "#cfe0ea", COPPER = "#b06a3a";
  const flask = (color, x, y, z, h = 0.3, r = 0.11) => [moved(lathe({ profile: [[0, 0], [r, 0], [r * 1.15, h * 0.35], [r * 0.45, h * 0.75], [r * 0.4, h], [0, h]], segments: 10, color: GLASS }), x, y, z),
    moved(lathe({ profile: [[0, 0], [r * 1.05, 0], [r * 1.12, h * 0.3], [0, h * 0.34]], segments: 10, color, emissive: 0.85 }), x, y + 0.005, z)];
  const skull = (x, y, z, turnBy = 0) => [moved(ball(0.12, BONE, 10), x, y + 0.12, z), B(0.15, 0.07, 0.1, BONE, x, y + 0.02, z + Math.cos(turnBy) * 0.05), ...[-1, 1].map((s) => B(0.04, 0.035, 0.02, "#1a1612", x + s * 0.045, y + 0.13, z + 0.11))];
  const STATION = [
    () => [...flask("#ff7a3a", -0.4, 0.92, 0, 0.42, 0.16), beam(-0.38, 1.36, 0, 0.35, 1.1, 0.05, 0.03, COPPER), ...flask("#ffb04a", 0.42, 0.92, 0.05, 0.22, 0.1)],
    () => [...[0, 1, 2].map((j) => { const a = j / 3 * TAU; return beam(Math.cos(a) * 0.2, 0.92, Math.sin(a) * 0.2, 0, 1.22, 0, 0.02, IRON); }), moved(ball(0.13, GLASS, 10), 0, 1.36, 0), moved(ball(0.1, "#c84aff", 10, 0.9), 0, 1.34, 0),
      beam(0.1, 1.42, 0, 0.55, 1.25, 0, 0.03, GLASS), B(0.08, 0.1, 0.08, "#ffb04a", 0, 1.0, 0, 1), ...flask("#c84aff", 0.6, 0.92, 0.1, 0.2, 0.08)],
    () => [moved(turn([[0.16, 0], [0.16, 0.04], [0.07, 0.08], [0.09, 0.16], [0, 0.16]], 10, GILT), 0, 0.92, 0), moved(ball(0.2, "#8a6aff", 14, 0.75), 0, 1.28, 0), ...candle(-0.55, 0.92, 0.2), ...candle(0.55, 0.92, 0.2)],
    () => [B(0.04, 0.5, 0.04, BRASS, 0, 1.17, 0), B(0.7, 0.03, 0.03, BRASS, 0, 1.42, 0), ...[-1, 1].flatMap((s) => [B(0.01, 0.26, 0.01, BRASS, s * 0.33, 1.29, 0), moved(lathe({ profile: [[0, 0], [0.12, 0.02], [0.13, 0.05], [0, 0.05]], segments: 10, color: BRASS }), s * 0.33, 1.13, 0)]),
      moved(ball(0.03, "#ffd23a", 6, 0.6), -0.33, 1.2, 0), B(0.5, 0.04, 0.3, OAK_DK, 0, 0.94, 0)],
    () => [moved(lathe({ profile: [[0, 0], [0.16, 0], [0.18, 0.12], [0.12, 0.15], [0, 0.1]], segments: 10, color: "#6a6e78" }), -0.2, 0.92, 0), beam(-0.2, 1.0, 0, -0.05, 1.22, 0.05, 0.025, "#8a8e98"),
      ...[[0.3, 0.1], [0.45, -0.15], [0.55, 0.15]].map(([x, z]) => B(0.12, 0.05, 0.08, "#3a6a2a", x, 0.95, z)), B(0.04, 0.35, 0.04, "#4a7a2a", 0.4, 1.2, -0.3)],
    () => [B(0.8, 0.06, 0.18, OAK_DK, 0, 1.05, 0), ...["#ff3a3a", "#ffb03a", "#3aff7a", "#3abfff", "#c84aff", "#ff3ad2"].flatMap((c, j) => flask(c, -0.32 + j * 0.13, 0.98, 0, 0.3, 0.035))],
    () => [...[0, 1, 2, 3, 4].map((j) => moved(torus(0.14, 0.025, COPPER, 0, 12, 4), 0.35, 1.0 + j * 0.08, 0)), B(0.05, 0.5, 0.05, COPPER, 0.35, 1.18, 0), ...flask("#3aff7a", -0.25, 0.92, 0, 0.36, 0.14), beam(-0.25, 1.28, 0, 0.35, 1.42, 0, 0.025, COPPER)],
    () => [...skull(0, 0.92, 0.05), ...candle(-0.35, 0.92, -0.1, 0.26), ...candle(0.35, 0.92, -0.05, 0.18), ...candle(0.2, 0.92, 0.25, 0.1), B(0.3, 0.06, 0.22, "#3a2030", -0.4, 0.95, 0.25)],
    () => [moved(turnedX(B(0.5, 0.03, 0.4, OAK_DK, 0, 0, 0), -0.5), 0, 1.12, 0), moved(turnedX(B(0.46, 0.02, 0.36, "#e6dcc0", 0, 0.02, 0), -0.5), 0, 1.13, 0.01), B(0.04, 0.22, 0.04, OAK_DK, 0, 0.98, -0.1),
      beam(0.3, 0.95, 0.2, 0.4, 1.2, 0.15, 0.012, WHITE), moved(lathe({ profile: [[0, 0], [0.04, 0], [0.04, 0.06], [0, 0.06]], segments: 8, color: "#151515" }), 0.32, 0.92, 0.22)],
    () => [V(0.6, 0.4, 0.5, "#3a3d44", 0, 1.12, 0), B(0.3, 0.12, 0.04, "#ff7a2a", 0, 1.02, 0.26, 1), moved(lathe({ profile: [[0, 0], [0.12, 0], [0.15, 0.16], [0, 0.16]], segments: 10, color: "#6a5a4a" }), 0, 1.32, 0),
      moved(lathe({ profile: [[0, 0], [0.13, 0], [0, 0.01]], segments: 10, color: "#ffb030", emissive: 1 }), 0, 1.46, 0), B(0.04, 0.5, 0.04, IRON, 0.25, 1.57, 0)],
    () => [moved(lathe({ profile: [[0, 0.03], [0.2, 0.06], [0.27, 0.18], [0.26, 0.3], [0, 0.3]], segments: 12, color: "#1c1d20" }), 0, 0.92, 0), moved(lathe({ profile: [[0, 0], [0.24, 0], [0, 0.01]], segments: 12, color: "#3cff8a", emissive: 0.9 }), 0, 1.2, 0),
      ...[[0.06, 0.04], [-0.07, -0.05]].map(([x, z]) => moved(ball(0.04, "#8affb8", 6, 0.9), x, 1.24, z))],
    () => [B(0.9, 0.02, 0.6, "#1a2240", 0, 0.93, 0, 0.2), ...Array.from({ length: 12 }, (_, j) => B(0.03, 0.022, 0.03, "#f0e6b0", -0.38 + ((j * 0.37) % 0.76), 0.945, -0.25 + ((j * 0.61) % 0.5), 0.9)),
      moved(torus(0.18, 0.015, BRASS, 0, 16, 4), 0.3, 1.3, 0), moved(turnedX(torus(0.18, 0.015, BRASS, 0, 16, 4), Math.PI / 2), 0.3, 1.3, 0), moved(ball(0.05, GILT), 0.3, 1.3, 0), B(0.03, 0.3, 0.03, BRASS, 0.3, 1.08, 0)]
  ];
  const CELL = [
    () => [V(1.6, 0.18, 0.9, "#a88a4a", -0.2, 0.09, -0.6), B(1.3, 0.04, 0.6, "#c8a85a", -0.2, 0.2, -0.6), moved(lathe({ profile: [[0, 0], [0.16, 0], [0.18, 0.28], [0, 0.28]], segments: 10, color: "#4a3420" }), 0.8, 0, 0.2)],
    () => [...skull(0, 0.9, -1.1), B(0.3, 0.42, 0.14, BONE, 0, 0.6, -1.15), ...[0, 1, 2, 3].map((j) => B(0.34, 0.03, 0.18, BONE, 0, 0.45 + j * 0.08, -1.1)), ...[-1, 1].flatMap((s) => [beam(s * 0.12, 0.35, -1.1, s * 0.3, 0.05, -0.6, 0.04, BONE), beam(s * 0.2, 0.8, -1.15, s * 0.45, 1.5, -1.25, 0.03, BONE), moved(torus(0.06, 0.015, IRON, 0, 8, 4), s * 0.45, 1.52, -1.25), B(0.02, 0.5, 0.02, IRON, s * 0.45, 1.8, -1.28)])],
    () => [V(0.8, 0.4, 1.9, OAK_DK, -0.6, 0.2, -0.3), B(0.7, 0.08, 1.7, "#7a6a4a", -0.6, 0.44, -0.3), V(0.36, 0.42, 0.36, OAK_DK, 0.6, 0.21, 0.3)],
    () => [...skull(0.3, 0, -0.4, 0.5), ...Array.from({ length: 14 }, (_, j) => moved(turnedY(B(0.32 + (j % 3) * 0.08, 0.04, 0.04, BONE, 0, 0, 0), j * 1.3), -0.3 + ((j * 0.37) % 0.8), 0.03 + (j % 3) * 0.03, -0.6 + ((j * 0.53) % 0.7)))],
    () => [V(0.7, 0.6, 0.6, "#5c4028", -0.6, 0.3, -0.7), V(0.6, 0.5, 0.5, "#4a3420", -0.55, 0.85, -0.7), V(0.6, 0.55, 0.6, "#5c4028", 0.5, 0.28, -0.6), ...[[0.1, 0.1], [0.55, 0.35]].map(([x, z]) => moved(lathe({ profile: [[0, 0], [0.22, 0], [0.24, 0.3], [0.12, 0.42], [0, 0.42]], segments: 8, color: "#8a7350" }), x, 0, z))],
    () => [...[-1, 1].flatMap((s) => [B(0.12, 0.1, 0.04, IRON, s * 0.5, 1.6, -1.25), ...[0, 1, 2, 3, 4].map((j) => moved(turnedZ(torus(0.045, 0.012, IRON, 0, 8, 4), (j & 1) * Math.PI / 2), s * 0.5, 1.5 - j * 0.08, -1.22)), moved(torus(0.07, 0.02, IRON, 0, 10, 4), s * 0.5, 1.08, -1.2)]),
      ...Array.from({ length: 18 }, (_, j) => B(0.02, 0.18, 0.01, "#0e0e10", -0.9 + (j % 9) * 0.22, 2.1 + Math.floor(j / 9) * 0.3, -1.3))],
    () => [...Array.from({ length: 10 }, (_, j) => beam(-1.0 + j * 0.22, 4.2, -1.2 + (j % 3) * 0.1, -1.0 + j * 0.22 + 0.1, 3.1 + (j % 4) * 0.2, -1.1 + (j % 3) * 0.1, 0.01, "#9a9890")),
      B(0.16, 0.08, 0.06, "#4a4648", 0.6, 0.04, 0.3), B(0.05, 0.03, 0.12, "#4a4648", 0.6, 0.03, 0.4), moved(lathe({ profile: [[0, 0], [0.12, 0.02], [0.14, 0.07], [0, 0.07]], segments: 10, color: "#6a5a4a" }), -0.4, 0, 0.3)],
    () => [V(0.9, 0.07, 0.6, OAK_DK, 0.2, 0.75, -0.6), ...legs(0.9, 0.6, 0.72, OAK_DK).map((g) => moved(g, 0.2, 0, -0.6)), ...candle(0.45, 0.79, -0.7, 0.2), B(0.3, 0.06, 0.22, "#6e1f24", 0.05, 0.81, -0.55), V(0.36, 0.42, 0.36, OAK_DK, -0.5, 0.21, -0.2)],
    () => [B(0.04, 1.2, 0.04, IRON, 0, 3.6, -0.3), moved(torus(0.42, 0.03, IRON, 0, 14, 4), 0, 1.8, -0.3), moved(torus(0.42, 0.03, IRON, 0, 14, 4), 0, 3.0, -0.3),
      ...Array.from({ length: 10 }, (_, j) => { const a = j / 10 * TAU; return B(0.025, 1.2, 0.025, IRON, Math.cos(a) * 0.42, 2.4, -0.3 + Math.sin(a) * 0.42); }), moved(lathe({ profile: [[0, 0], [0.42, 0], [0.42, 0.03], [0, 0.03]], segments: 14, color: IRON }), 0, 1.78, -0.3), ...skull(0.1, 1.82, -0.25)],
    () => [...[-1, 1].flatMap((s) => [B(0.1, 0.1, 0.04, IRON, s * 0.3, 0.5, -1.25), moved(torus(0.07, 0.02, IRON, 0, 10, 4), s * 0.3, 0.4, -1.2)]), moved(lathe({ profile: [[0, 0], [0.18, 0], [0.2, 0.3], [0, 0.3]], segments: 10, color: "#5a4a3a" }), 0.6, 0, 0.1), B(1.1, 0.06, 0.7, "#a88a4a", -0.4, 0.03, -0.5)],
    () => [moved(turnedZ(V(0.36, 0.06, 0.36, OAK_DK, 0, 0, 0), 1.2), 0.2, 0.15, 0.1), beam(0.0, 0, 0.2, 0.2, 0.3, 0.0, 0.03, OAK_DK), moved(turnedX(lathe({ profile: [[0, 0], [0.12, 0.02], [0.14, 0.07], [0, 0.07]], segments: 10, color: "#6a5a4a" }), 1.3), -0.4, 0.07, 0.2), B(0.6, 0.02, 0.5, "#5a5048", -0.5, 0.01, -0.7)],
    () => [moved(torus(0.65, 0.04, "#3aff7a", 0.9, 24, 4), 0, 0.02, -0.3), ...Array.from({ length: 6 }, (_, j) => { const a = j / 6 * TAU; return B(0.08, 0.02, 0.08, "#3aff7a", Math.cos(a) * 0.45, 0.02, -0.3 + Math.sin(a) * 0.45, 0.9); }),
      ...[0, 1, 2].flatMap((j) => { const a = j / 3 * TAU + 0.5; return candle(Math.cos(a) * 0.85, 0, -0.3 + Math.sin(a) * 0.85, 0.08); })]
  ];
  // A Norse high seat, dark and tall: a blackened oak frame on clawed feet, a wolf pelt over its seat, its back a carved
  // panel between two pillars that rise into dragon heads, gilt bands, and orange gems glowing softly on its crest, its
  // pillars and its arms. Its seat faces +z; the visitor sits at 0.5.
  const DARK = "#1b130e", DARKER = "#120c08", PELT = "#5b5650", PELT2 = "#6c665e", GEM = "#ff7a1e";
  const gem = (x, y, z, r = 0.055) => moved(lathe({ profile: [[0, -r], [r, 0], [0, r * 1.2]], segments: 6, color: GEM, emissive: 0.55 }), x, y, z);
  const highSeat = cached(() => {
    const parts = [V(1.1, 0.18, 0.95, DARK, 0, 0.36, 0), V(1.02, 0.08, 0.9, DARKER, 0, 0.47, 0.02),
      // The pelt over the seat and spilling over its front.
      V(0.94, 0.07, 0.84, PELT, 0, 0.52, 0.04, 0.03), V(0.86, 0.22, 0.06, PELT2, 0, 0.42, 0.47, 0.02),
      // The back: a tall carved panel, a gilt band across it, a crest board over it.
      V(0.96, 2.0, 0.12, DARK, 0, 1.5, -0.4), V(0.7, 1.55, 0.04, DARKER, 0, 1.45, -0.33), B(0.98, 0.06, 0.14, GILT, 0, 0.9, -0.4), B(0.98, 0.06, 0.14, GILT, 0, 2.2, -0.4),
      V(1.0, 0.26, 0.16, DARKER, 0, 2.58, -0.4), B(0.8, 0.04, 0.17, GILT, 0, 2.47, -0.4),
      gem(0, 2.6, -0.31, 0.09), gem(-0.3, 2.58, -0.31), gem(0.3, 2.58, -0.31), gem(0, 1.75, -0.3, 0.07), gem(0, 1.25, -0.3, 0.05)];
    // The panel's knotwork: two strands crossing down it.
    for (let k = 0; k < 6; k++) { const y = 1.0 + k * 0.2; parts.push(B(0.06, 0.06, 0.02, GILT, Math.sin(k * 1.2) * 0.2, y, -0.31), B(0.06, 0.06, 0.02, GILT, -Math.sin(k * 1.2) * 0.2, y, -0.31)); }
    for (const s of [-1, 1]) {
      // A pillar each side up into a dragon's head looking forward, its gem eye glowing.
      parts.push(V(0.16, 2.6, 0.16, DARKER, s * 0.53, 1.3, -0.4), B(0.18, 0.05, 0.18, GILT, s * 0.53, 0.75, -0.4), B(0.18, 0.05, 0.18, GILT, s * 0.53, 2.3, -0.4),
        V(0.14, 0.16, 0.34, DARKER, s * 0.53, 2.68, -0.28), V(0.1, 0.1, 0.16, DARKER, s * 0.53, 2.62, -0.06), B(0.04, 0.12, 0.06, DARKER, s * 0.53, 2.82, -0.44),
        gem(s * 0.61, 2.72, -0.2, 0.035), gem(s * 0.53, 1.95, -0.31, 0.05),
        // The arm, its front post and a gem on its end; a clawed foot under each corner.
        V(0.14, 0.08, 0.92, DARK, s * 0.53, 0.95, 0.02), V(0.12, 0.5, 0.12, DARKER, s * 0.53, 0.68, 0.42), moved(ball(0.08, DARKER, 8), s * 0.53, 1.0, 0.46), gem(s * 0.53, 1.06, 0.5, 0.045),
        V(0.12, 0.27, 0.12, DARKER, s * 0.46, 0.13, 0.38), V(0.12, 0.27, 0.12, DARKER, s * 0.46, 0.13, -0.38), B(0.16, 0.05, 0.18, IRON, s * 0.46, 0.025, 0.42));
    }
    return merge(...parts);
  });
  Object.assign(BUILD, {
    armchair: () => highSeat(),
    levelSign: () => levelSign(),
    sideTable: () => merge(moved(turn([[0.36, 0], [0.36, 0.04], [0, 0.04]], 14, OAKC), 0, 0.62, 0), moved(turn([[0.22, 0], [0.22, 0.05], [0.06, 0.1], [0.07, 0.55], [0.12, 0.62], [0, 0.62]], 10, OAK_DK), 0, 0, 0),
      ...candle(0.1, 0.66, -0.05, 0.22), moved(lathe({ profile: [[0, 0], [0.04, 0], [0.02, 0.04], [0.02, 0.1], [0.05, 0.13], [0.055, 0.2], [0, 0.2]], segments: 8, color: GILT }), -0.14, 0.66, 0.08)),
    // The lounge's fireplace, from the maintainer's art, its foot on the floor at the chimney breast's face and its
    // front toward +z: a wall of coursed dark stone round a pointed arch of three moulded orders stepping in to the
    // hearth, a broad band outside them cut with runes that glow like embers, a cluster of three shafts on a plinth
    // under a stepped capital either side, a cornice over all and a hearthstone before the fire.
    mantel: () => {
      const HALF = 1.5, PEAK = 2.7, C = 0.4, W = 3.75, TOP = 5.6, STEP = 0.2, STONE = ["#3b3631", "#332e2a", "#443e38", "#2e2925"], MOULD = ["#5a4c40", "#4c4037", "#63544a"], BAND = "#231e1b", RUNE = "#ff8a3a";
      // The top of an arch `grow` out from the hearth's own, at `x` across: two arcs struck from past the middle.
      const arch = (x, grow) => { const ax = Math.abs(x), half = HALF + grow, r = half + C; return ax >= half ? 0 : PEAK - Math.sqrt((HALF + C) ** 2 - C * C) + grow * 0.35 + Math.sqrt(Math.max(0, r * r - (ax + C) ** 2)); };
      const rand = mulberry32(2207), parts = [], ORDERS = [0, 0.16, 0.32, 0.48, 0.88];
      for (let x = -W + STEP / 2; x < W; x += STEP) {
        // The mouldings: each order from the arch inside it to its own, further forward the further out; then the
        // rune band; then the wall in courses.
        for (let i = 0; i < 4; i++) {
          const lo = arch(x, ORDERS[i]), hi = arch(x, ORDERS[i + 1]);
          if (hi > lo + 0.01) parts.push(B(STEP, hi - lo, 0.3 + (i + 1) * 0.07, i === 3 ? BAND : MOULD[i], x, (lo + hi) / 2, (0.3 + (i + 1) * 0.07) / 2));
        }
        const foot = arch(x, ORDERS[4]);
        for (let y = Math.floor(foot / 0.45) * 0.45; y < TOP; y += 0.45) {
          const lo = Math.max(foot, y), hi = Math.min(TOP, y + 0.45), course = Math.round(y / 0.45), block = Math.floor((x + W + (course & 1 ? 0.45 : 0)) / 0.9);
          if (hi > lo + 0.01) parts.push(B(STEP, hi - lo - 0.02, 0.3, STONE[Math.floor(hash3(block, course, 5) * STONE.length)], x, (lo + hi) / 2, 0.15));
        }
      }
      // The runes down both jambs and round the arch, each a stave with a stroke or two off it.
      const rune = (x, y) => { const z = 0.3 + 4 * 0.07 + 0.012; parts.push(B(0.035, 0.2, 0.02, RUNE, x, y, z, 0.75)); for (let k = 0; k < 2; k++) if (rand() < 0.75) parts.push(B(0.1, 0.035, 0.02, RUNE, x + (rand() < 0.5 ? -0.05 : 0.05), y + (rand() - 0.5) * 0.14, z, 0.75)); };
      const MID = (ORDERS[3] + ORDERS[4]) / 2;
      for (const sx of [-1, 1]) {
        for (let y = 0.35; y < 0.95; y += 0.3) rune(sx * (HALF + MID), y);
        for (let x = HALF + MID - 0.12; x > 0.05; x -= 0.27) rune(sx * x, (arch(x, ORDERS[3]) + arch(x, ORDERS[4])) / 2);
      }
      // The clustered columns: a plinth, three shafts ringed at foot and head, a stepped capital and the block over it.
      for (const sx of [-1, 1]) {
        const cx = sx * 3.05;
        parts.push(V(1.05, 0.62, 0.8, STONE[2], cx, 0.31, 0.62), V(0.95, 0.12, 0.72, MOULD[0], cx, 0.68, 0.6));
        for (const [dx, dz, r] of [[0, 0.72, 0.16], [-0.24, 0.5, 0.12], [0.24, 0.5, 0.12]]) parts.push(moved(lathe({ profile: [[0, 0], [r + 0.05, 0], [r + 0.05, 0.1], [r, 0.16], [r, 3.5], [r + 0.04, 3.56], [r + 0.04, 3.66], [0, 3.66]], segments: 10, color: STONE[0] }), cx + dx, 0.74, dz));
        parts.push(V(0.95, 0.14, 0.72, MOULD[1], cx, 4.47, 0.6), V(1.08, 0.16, 0.82, MOULD[0], cx, 4.62, 0.62), V(1.2, 0.2, 0.9, STONE[2], cx, 4.8, 0.64), V(1.0, 0.7, 0.7, STONE[1], cx, 5.25, 0.56));
      }
      parts.push(V(7.9, 0.24, 0.95, MOULD[1], 0, TOP + 0.02, 0.5), V(7.6, 0.12, 0.8, STONE[3], 0, TOP + 0.2, 0.45));
      // The wall's returns to the round wall behind, and the hearthstone.
      for (const sx of [-1, 1]) parts.push(B(0.3, TOP, 1.2, STONE[1], sx * (W - 0.15), TOP / 2, -0.6));
      parts.push(V(4.6, 0.08, 1.25, STONE[2], 0, 0.04, 0.95, 0.02), V(4.2, 0.03, 1.0, MOULD[1], 0, 0.095, 0.9, 0.01));
      return merge(...parts);
    },
    // The fire's bed: two tall andirons with ringed finials, a heap of glowing embers, and logs laid across and over
    // one another, charred, their ends aglow.
    logs: () => {
      const rand = mulberry32(977), parts = [], BARK = ["#2a1c12", "#33231a", "#1c130d"], EMBER = ["#ff6a2a", "#ff8a2a", "#ffb04a", "#e0481a"];
      for (const s of [-1, 1]) parts.push(B(0.07, 0.95, 0.07, IRON, s * 1.05, 0.475, 0.3), B(0.07, 0.07, 0.95, IRON, s * 1.05, 0.14, -0.1), B(0.07, 0.14, 0.07, IRON, s * 1.05, 0.07, -0.5),
        moved(torus(0.09, 0.025, IRON, 0, 10, 4), s * 1.05, 0.7, 0.3), moved(ball(0.1, IRON, 8), s * 1.05, 1.0, 0.3), B(0.2, 0.05, 0.05, IRON, s * 1.05, 0.5, 0.3));
      for (let i = 0; i < 26; i++) { const x = (rand() - 0.5) * 1.9, z = (rand() - 0.5) * 0.8, w = 0.1 + rand() * 0.16; parts.push(noShadow(B(w, 0.06 + rand() * 0.08, w, EMBER[i % EMBER.length], x, 0.05 + rand() * 0.05, z, 1))); }
      const log = (x, y, z, len, r, turnY, tilt) => {
        const body = lathe({ profile: [[0, -len / 2], [r, -len / 2], [r * 1.05, 0], [r * 0.95, len / 2], [0, len / 2]], segments: 8, color: BARK[Math.floor(rand() * BARK.length)] });
        const ends = [-1, 1].map((e) => moved(lathe({ profile: [[0, 0], [r * 0.8, 0], [0, 0.01]], segments: 8, color: EMBER[Math.floor(rand() * 2)], emissive: 0.8 }), 0, e * (len / 2 + 0.005), 0));
        parts.push(moved(turnedY(turnedZ(merge(body, ...ends), Math.PI / 2 + tilt), turnY), x, y, z));
      };
      log(-0.35, 0.22, 0.1, 1.5, 0.15, 0.25, 0); log(0.4, 0.2, -0.1, 1.4, 0.14, -0.3, 0); log(0, 0.2, 0.3, 1.3, 0.12, 0.05, 0);
      log(-0.1, 0.46, 0, 1.3, 0.13, 1.2, 0.18); log(0.25, 0.48, 0.05, 1.1, 0.11, -1.0, -0.2); log(-0.3, 0.7, 0.05, 0.9, 0.1, 0.5, 0.35);
      return merge(...parts);
    },
    station: (p) => { const k = (p.index || 0) % STATION.length, jar = mulberry32(k + 3), parts = [V(1.7, 0.08, 1.24, "#18171b", 0, 0.88, 0), V(1.6, 0.8, 1.1, "#0f0e11", 0, 0.42, -0.02), V(1.7, 1.0, 0.12, "#0f0e11", 0, 1.42, -0.56), V(1.7, 0.05, 0.3, "#18171b", 0, 1.55, -0.42),
        B(1.62, 0.03, 0.03, "#5a4a2a", 0, 0.84, 0.6), B(0.03, 0.66, 0.03, "#5a4a2a", -0.78, 0.42, 0.53), B(0.03, 0.66, 0.03, "#5a4a2a", 0.78, 0.42, 0.53)];
      for (let x = -0.7; x < 0.72; x += 0.24) parts.push(moved(lathe({ profile: [[0, 0], [0.06, 0], [0.065, 0.14], [0.03, 0.18], [0, 0.18]], segments: 8, color: pick(["#6a4a8a", "#3a7a5a", "#8a4a2a", "#5a5a68", "#b8863e"], jar()) }), x, 1.58, -0.42));
      parts.push(...STATION[k]());
      return merge(...parts); },
    cellBars: (p) => { const L = p.len || 3, parts = [], H = 4.5;
      for (let x = -L / 2 + 0.09; x < L / 2; x += 0.18) parts.push(B(0.045, H, 0.045, IRON, x, H / 2, 0));
      for (const y of [0.1, 2.2, H - 0.12]) parts.push(B(L, 0.08, 0.08, IRON, 0, y, 0));
      parts.push(B(0.1, 2.3, 0.1, IRON, -0.45, 1.15, 0.02), B(0.1, 2.3, 0.1, IRON, 0.45, 1.15, 0.02), B(1.0, 0.1, 0.1, IRON, 0, 2.3, 0.02), B(0.14, 0.2, 0.1, "#4a4040", 0.32, 1.15, 0.07), moved(torus(0.05, 0.012, IRON, 0, 8, 4), 0.32, 1.0, 0.12));
      return merge(...parts); },
    cell: (p) => merge(...CELL[(p.index || 0) % CELL.length]()),
    // Twice the size it was: a ring of 16 stones round a bed of embers, logs leant together over it.
    firepit: () => { const parts = [], S = 2;
      for (let j = 0; j < 16; j++) { const a = j / 16 * TAU; parts.push(moved(turnedY(V(0.42 * S, (0.36 + (j % 3) * 0.05) * S, 0.3 * S, j % 2 ? "#4a423c" : "#5b524b", 0, 0, 0), a), Math.sin(a) * 0.78 * S, 0.2 * S, Math.cos(a) * 0.78 * S)); }
      parts.push(moved(turn([[0.72 * S, 0], [0.72 * S, 0.1 * S], [0, 0.1 * S]], 18, "#1a1412"), 0, 0, 0), noShadow(moved(lathe({ profile: [[0, 0], [0.6 * S, 0], [0, 0.02 * S]], segments: 18, color: "#ff6a2a", emissive: 1 }), 0, 0.12 * S, 0)));
      for (let j = 0; j < 6; j++) parts.push(moved(turnedY(turnedZ(lathe({ profile: [[0, -0.5 * S], [0.08 * S, -0.5 * S], [0.09 * S, 0.5 * S], [0, 0.5 * S]], segments: 8, color: "#3a2618" }), Math.PI / 2 - 0.5), j * Math.PI / 3), 0, 0.32 * S, 0));
      return merge(...parts); },
    roofChair: () => highSeat(),
    windowBars: (p) => { const half = p.w || 0.6, tall = p.h || 5, parts = [];
      for (let x = -half + 0.12; x < half - 0.05; x += 0.18) { const top = HL.archTop(half + 0.04, tall, x) + 0.05; parts.push(B(0.045, top + 0.1, 0.045, IRON, x, (top - 0.1) / 2, 0)); }
      for (let y = 0.15; y < tall; y += 1.6) parts.push(B(2 * half + 0.1, 0.08, 0.08, IRON, 0, y, 0));
      parts.push(B(2 * half + 0.1, 0.08, 0.08, IRON, 0, tall, 0));
      return merge(...parts); },
    // The armory's: a rack of arms stood upright (swords, axes and a spear by turns), a stand of three round shields in
    // the warship's orange and black, the base a suit of plate stands on (the scene stands the suit), a table laid with
    // helms and blades, an anvil on its block, a grindstone in its trough and a barrel of arrows.
    weaponRack: (p) => { const k = p.index || 0, parts = [V(2.2, 0.1, 0.5, OAK_DK, 0, 0.05, 0), V(2.2, 0.09, 0.12, OAKC, 0, 0.75, -0.12), V(2.2, 0.09, 0.12, OAKC, 0, 1.55, -0.16)];
      for (const sx of [-1, 1]) parts.push(V(0.12, 1.75, 0.14, OAK_DK, sx * 1.05, 0.9, -0.16), beam(sx * 1.05, 0.08, 0.2, sx * 1.05, 1.0, -0.14, 0.05, OAK_DK));
      for (let i = 0; i < 6; i++) { const x = -0.85 + i * 0.34, kind = (i + k) % 3;
        if (kind === 0) parts.push(B(0.07, 1.25, 0.02, STEEL, x, 0.95, -0.02), B(0.3, 0.05, 0.05, GILT, x, 1.6, -0.02), B(0.05, 0.26, 0.05, OAK_DK, x, 1.75, -0.02), moved(ball(0.045, GILT, 6), x, 1.92, -0.02));
        else if (kind === 1) parts.push(B(0.05, 1.9, 0.05, OAKC, x, 1.05, -0.02), B(0.3, 0.3, 0.03, STEEL, x + 0.1, 1.82, -0.02), B(0.08, 0.36, 0.035, STEEL_D, x + 0.24, 1.82, -0.02));
        else parts.push(B(0.045, 2.15, 0.045, OAKC, x, 1.15, -0.02), moved(lathe({ profile: [[0, 0], [0.06, 0.02], [0, 0.3]], segments: 4, color: STEEL }), x, 2.2, -0.02)); }
      return merge(...parts); },
    shieldStand: () => { const parts = [V(2.3, 0.1, 0.5, OAK_DK, 0, 0.05, 0), V(0.12, 2.1, 0.12, OAK_DK, -1.05, 1.05, -0.1), V(0.12, 2.1, 0.12, OAK_DK, 1.05, 1.05, -0.1), V(2.3, 0.1, 0.12, OAKC, 0, 2.05, -0.1), V(2.3, 0.1, 0.12, OAKC, 0, 0.9, -0.1)];
      [[-0.68, 1.5, 0], [0.68, 1.5, 1], [0, 0.62, 2]].forEach(([x, y, k]) => parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.5, 0], [0.5, 0.05], [0, 0.05]], segments: 14, color: "#17130f" }), Math.PI / 2), x, y, -0.02),
        moved(turnedX(lathe({ profile: [[0, 0], [0.43, 0], [0.4, 0.03], [0, 0.03]], segments: 14, color: k === 1 ? "#1c1b1f" : "#d9661c" }), Math.PI / 2), x, y, 0.035),
        moved(turnedX(lathe({ profile: [[0, 0], [0.24, 0], [0.22, 0.02], [0, 0.02]], segments: 12, color: k === 1 ? "#d9661c" : "#1c1b1f" }), Math.PI / 2), x, y, 0.065),
        moved(turnedX(lathe({ profile: [[0, 0], [0.11, 0], [0.07, 0.07], [0, 0.09]], segments: 10, color: "#e6dfd3" }), Math.PI / 2), x, y, 0.085)));
      return merge(...parts); },
    // The merchant's stand (on the Armory & Forge's quay, keep-layout.js `ARMORY.merchant`), its counter toward +z: a timber stall on a plinth, a counter round
    // three sides with a panelled front and a shield on it, four posts under an awning striped in the warship's orange
    // and black with a scalloped valance, a signboard over the counter (WEAPONS, the yard's own carved sign), a plank back hung with
    // swords, axes and a shield, a lantern at each front post, and on the counter a sword and an axe laid out, a stack
    // of coin, a bunch of bananas and a candle. The scene stands the knight inside.
    merchant: () => {
      const OR = "#d9661c", BK = "#1c1b1f", BANANA = "#e8c23a", parts = [V(4.7, 0.14, 3.5, OAK_DK, 0, 0.07, 0, 0.04)];
      // The counter: its top round three sides, panelled below, battens down the front.
      parts.push(V(4.5, 0.12, 0.85, OAKC, 0, 1.08, 1.2), B(4.3, 0.96, 0.1, OAK_DK, 0, 0.6, 1.52), B(4.3, 0.1, 0.14, OAKC, 0, 0.2, 1.56), B(4.3, 0.08, 0.14, OAKC, 0, 0.98, 1.56));
      for (let i = 0; i < 9; i++) parts.push(B(0.07, 0.72, 0.04, i % 2 ? OAKC : "#3d2a1b", -1.92 + i * 0.48, 0.59, 1.585));
      for (const sx of [-1, 1]) parts.push(V(0.8, 0.12, 2.3, OAKC, sx * 1.85, 1.08, -0.3), B(0.1, 0.96, 2.2, OAK_DK, sx * 2.18, 0.6, -0.3), B(0.14, 0.08, 2.2, OAKC, sx * 2.22, 0.98, -0.3), B(0.14, 0.1, 2.2, OAKC, sx * 2.22, 0.2, -0.3));
      // A round shield on the counter's front, in the awning's colours.
      parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.36, 0], [0.36, 0.04], [0, 0.04]], segments: 14, color: BK }), Math.PI / 2), 0, 0.58, 1.6), moved(turnedX(lathe({ profile: [[0, 0], [0.29, 0], [0.27, 0.03], [0, 0.03]], segments: 14, color: OR }), Math.PI / 2), 0, 0.58, 1.64),
        moved(turnedX(lathe({ profile: [[0, 0], [0.09, 0], [0.05, 0.06], [0, 0.08]], segments: 10, color: "#e6dfd3" }), Math.PI / 2), 0, 0.58, 1.67));
      // Posts, the beams that tie them, and braces under the awning.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(V(0.2, 3.3, 0.2, OAK_DK, sx * 2.2, 1.79, sz * 1.6), V(0.3, 0.12, 0.3, OAKC, sx * 2.2, 0.2, sz * 1.6), V(0.3, 0.1, 0.3, OAKC, sx * 2.2, 3.4, sz * 1.6));
      for (const sz of [-1, 1]) parts.push(V(4.6, 0.16, 0.16, OAKC, 0, 3.38, sz * 1.6));
      for (const sx of [-1, 1]) parts.push(V(0.16, 0.16, 3.4, OAKC, sx * 2.2, 3.38, 0), beam(sx * 2.2, 2.75, 1.6, sx * 1.6, 3.32, 1.6, 0.05, OAK_DK), beam(sx * 2.2, 2.75, -1.6, sx * 1.6, 3.32, -1.6, 0.05, OAK_DK));
      // The awning: nine stripes pitched from a ridge, and a scalloped valance front and back and down each side.
      for (let i = 0; i < 9; i++) {
        const x = -2.2 + i * 0.55, c = i % 2 ? BK : OR;
        for (const sz of [-1, 1]) parts.push(moved(turnedX(B(0.55, 0.06, 2.13, c, 0, 0, 0), sz * 0.24), x, 3.78, sz * 1.03));
        for (const sz of [-1, 1]) parts.push(B(0.53, 0.26, 0.04, c, x, 3.38, sz * 2.07), B(0.3, 0.14, 0.04, c, x, 3.18, sz * 2.07));
      }
      for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) { const z = -1.8 + i * 0.6, c = i % 2 ? OR : BK; parts.push(B(0.04, 0.26, 0.58, c, sx * 2.48, 3.4, z), B(0.04, 0.14, 0.32, c, sx * 2.48, 3.2, z)); }
      parts.push(V(5.0, 0.1, 0.12, OAK_DK, 0, 4.06, 0));
      // The irons the signboard over the counter hangs from (the board itself, WEAPONS, scene-keep.js stands there).
      for (const sx of [-1, 1]) parts.push(beam(sx * 0.9, 3.18, 1.72, sx * 0.9, 3.38, 1.62, 0.014, IRON));
      // The back: planks, a rail, and what is for sale hung on it.
      for (let i = 0; i < 8; i++) parts.push(B(0.52, 2.5, 0.07, i % 2 ? OAK_DK : "#3d2a1b", -1.89 + i * 0.54, 1.5, -1.6));
      parts.push(V(4.3, 0.1, 0.14, OAKC, 0, 2.5, -1.53), V(4.3, 0.1, 0.14, OAKC, 0, 1.3, -1.53));
      for (const x of [-1.5, -0.95]) parts.push(B(0.08, 1.2, 0.025, STEEL, x, 1.75, -1.5), B(0.34, 0.05, 0.05, GILT, x, 2.38, -1.5), B(0.05, 0.24, 0.05, OAK_DK, x, 2.52, -1.5), moved(ball(0.045, GILT, 6), x, 2.67, -1.5));
      for (const x of [0.95, 1.5]) parts.push(B(0.055, 1.5, 0.055, OAKC, x, 1.85, -1.5), B(0.36, 0.34, 0.03, STEEL, x + 0.14, 2.42, -1.5), B(0.09, 0.42, 0.035, STEEL_D, x + 0.3, 2.42, -1.5), B(0.12, 0.2, 0.03, STEEL_D, x - 0.08, 2.42, -1.5));
      parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.44, 0], [0.44, 0.05], [0, 0.05]], segments: 14, color: BK }), Math.PI / 2), 0, 1.92, -1.54), moved(turnedX(lathe({ profile: [[0, 0], [0.36, 0], [0.34, 0.03], [0, 0.03]], segments: 14, color: OR }), Math.PI / 2), 0, 1.92, -1.49),
        moved(turnedX(lathe({ profile: [[0, 0], [0.1, 0], [0.06, 0.07], [0, 0.09]], segments: 10, color: "#e6dfd3" }), Math.PI / 2), 0, 1.92, -1.46));
      // A lantern hung from each front post's brace.
      for (const sx of [-1, 1]) parts.push(beam(sx * 1.9, 3.05, 1.6, sx * 1.9, 2.72, 1.6, 0.012, IRON), B(0.2, 0.04, 0.2, IRON, sx * 1.9, 2.72, 1.6), B(0.15, 0.24, 0.15, "#ffc56b", sx * 1.9, 2.58, 1.6, 1), B(0.2, 0.04, 0.2, IRON, sx * 1.9, 2.44, 1.6));
      // On the counter: a sword and an axe laid out, coin, bananas and a candle.
      parts.push(B(1.3, 0.025, 0.09, STEEL, -1.0, 1.155, 1.2), B(0.06, 0.05, 0.34, GILT, -0.32, 1.165, 1.2), B(0.26, 0.05, 0.06, OAK_DK, -0.17, 1.165, 1.2), moved(ball(0.045, GILT, 6), -0.02, 1.17, 1.2));
      parts.push(B(1.3, 0.05, 0.055, OAKC, 1.15, 1.17, 1.25), B(0.34, 0.03, 0.36, STEEL, 1.66, 1.16, 1.11), B(0.42, 0.035, 0.09, STEEL_D, 1.66, 1.16, 0.9));
      for (const [x, z, n] of [[0.22, 1.02, 5], [0.36, 1.1, 3], [0.2, 1.2, 2]]) for (let i = 0; i < n; i++) parts.push(moved(lathe({ profile: [[0, 0], [0.06, 0], [0.06, 0.02], [0, 0.02]], segments: 8, color: i % 2 ? GILT : "#d2a73a" }), x, 1.14 + i * 0.022, z));
      for (let i = 0; i < 4; i++) parts.push(beam(-1.9 + i * 0.07, 1.17, 0.2, -1.74 + i * 0.07, 1.2, -0.12, 0.035, BANANA), beam(-1.74 + i * 0.07, 1.2, -0.12, -1.86 + i * 0.07, 1.26, -0.3, 0.028, BANANA));
      parts.push(...candle(1.85, 1.14, -0.9, 0.26));
      return merge(...parts);
    },
    // The armory's wall shields, from the maintainer's art, its middle at the origin and its face toward +z: a round shield of oak planks in a riveted iron rim, iron bands crossed over it
    // to a diamond boss at each end, a great round boss in the middle, and two axes crossed over the planks, their
    // heads up and outward.
    wallShield: () => {
      const WOOD = "#5c3f29", WOOD_D = "#3a2618", BAND = "#34353b", BAND_L = "#4b4d55", HAFT = "#7a4a2a", R0 = 1.2, parts = [];
      const disc = (r, t, color, z) => moved(turnedX(lathe({ profile: [[0, 0], [r, 0], [r, t], [0, t]], segments: 28, color }), Math.PI / 2), 0, 0, z);
      parts.push(disc(R0, 0.09, WOOD, 0.08));
      // The planks' joints, each as long as the round is across there.
      for (const x of [-0.9, -0.6, -0.3, 0.3, 0.6, 0.9]) { const h = 2 * Math.sqrt(R0 * R0 - x * x) - 0.12; parts.push(B(0.025, h, 0.012, WOOD_D, x, 0, 0.176)); }
      for (const [x, y, w] of [[-0.45, 0.42, 0.28], [0.15, -0.5, 0.28], [0.75, 0.2, 0.28], [-0.75, -0.3, 0.28]]) parts.push(B(w, 0.02, 0.012, WOOD_D, x, y, 0.176));
      // The rim and its rivets.
      parts.push(moved(turnedX(torus(R0, 0.085, BAND, 0, 32, 6), Math.PI / 2), 0, 0, 0.17));
      for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20 * TAU; parts.push(moved(ball(0.035, "#8a8d95", 6), Math.cos(a) * R0, Math.sin(a) * R0, 0.25)); }
      // The crossed bands, their diamond bosses and the boss in the middle.
      parts.push(B(0.22, 2 * R0, 0.05, BAND, 0, 0, 0.2), B(2 * R0, 0.22, 0.05, BAND, 0, 0, 0.2));
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        parts.push(moved(turnedZ(B(0.5, 0.5, 0.08, BAND, 0, 0, 0), Math.PI / 4), dx * R0, dy * R0, 0.22), moved(turnedZ(B(0.3, 0.3, 0.06, BAND_L, 0, 0, 0), Math.PI / 4), dx * R0, dy * R0, 0.28), moved(ball(0.05, "#8a8d95", 6), dx * R0, dy * R0, 0.32));
        for (const k of [0.5, 0.72]) parts.push(moved(ball(0.03, "#8a8d95", 6), dx * R0 * k, dy * R0 * k, 0.235));
      }
      parts.push(disc(0.4, 0.08, BAND, 0.22), moved(turnedX(lathe({ profile: [[0, 0], [0.31, 0], [0.3, 0.07], [0.2, 0.12], [0, 0.13]], segments: 20, color: "#1b1b1f" }), Math.PI / 2), 0, 0, 0.3));
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; parts.push(moved(ball(0.025, "#8a8d95", 6), Math.cos(a) * 0.355, Math.sin(a) * 0.355, 0.31)); }
      // An axe, its haft up along y and its head toward `side`: the bearded blade in three steps, paler at its edge.
      const axe = (side) => merge(B(0.1, 1.95, 0.07, HAFT, 0, -0.05, 0), ...[-0.85, -0.6, -0.35].map((y) => B(0.115, 0.05, 0.085, WOOD_D, 0, y, 0)), B(0.16, 0.34, 0.1, BAND, 0, 0.72, 0), B(0.2, 0.16, 0.09, BAND_L, -side * 0.14, 0.76, 0),
        B(0.2, 0.3, 0.06, STEEL_D, side * 0.17, 0.7, 0), B(0.2, 0.5, 0.055, STEEL_D, side * 0.36, 0.62, 0), B(0.16, 0.74, 0.05, "#7d828a", side * 0.53, 0.54, 0), B(0.07, 0.84, 0.04, STEEL, side * 0.64, 0.5, 0));
      for (const side of [-1, 1]) parts.push(moved(turnedZ(axe(side), -side * 0.72), side * 0.02, 0.02, 0.27 + (side > 0 ? 0.08 : 0)));
      return merge(...parts);
    },
    // The alchemy room's seats' numbers, I to XII in the carved signs' letters (sign-glyphs.js), glowing emerald on the
    // back of each seat's panel, read from behind it.
    numeral: (p) => {
      const text = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"][p.index || 0], c = 0.055, w = text.length * 3 * c + (text.length - 1) * c, parts = [];
      [...text].forEach((ch, i) => {
        const rows = BL.signGlyphs.SIGN_GLYPHS[ch], x0 = w / 2 - i * 4 * c;
        rows.forEach((row, r) => { for (let col = 0; col < 3; col++) if (row[col] === "1") parts.push(B(c, c, 0.025, "#1fe07a", x0 - (col + 0.5) * c, 1.92 - (r + 0.5) * c, -0.475, 1)); });
      });
      return noShadow(merge(...parts));
    },
    armorStand: () => merge(moved(turn([[0.52, 0], [0.52, 0.08], [0.44, 0.12], [0, 0.12]], 12, OAK_DK), 0, 0, 0)),
    armsTable: () => merge(V(2.9, 0.1, 1.5, OAKC, 0, 0.9, 0), ...legs(2.9, 1.5, 0.86, OAK_DK, 0.14, 0.14), V(2.5, 0.08, 0.1, OAK_DK, 0, 0.3, 0.55), V(2.5, 0.08, 0.1, OAK_DK, 0, 0.3, -0.55),
      B(1.5, 0.03, 0.09, STEEL, -0.4, 0.97, 0.3), B(0.06, 0.05, 0.34, GILT, 0.36, 0.975, 0.3), B(0.3, 0.05, 0.06, OAK_DK, 0.52, 0.975, 0.3),
      B(1.2, 0.03, 0.08, STEEL, 0.3, 0.97, -0.35), B(0.06, 0.05, 0.3, GILT, -0.32, 0.975, -0.35),
      moved(lathe({ profile: [[0, 0], [0.2, 0], [0.21, 0.24], [0.15, 0.36], [0, 0.4]], segments: 10, color: "#d8cfc1" }), -1.05, 0.95, -0.25), B(0.2, 0.04, 0.02, "#17130f", -1.05, 1.17, -0.05),
      moved(lathe({ profile: [[0, 0], [0.19, 0], [0.2, 0.2], [0.1, 0.34], [0, 0.36]], segments: 10, color: STEEL_D }), 1.05, 0.95, 0.1), ...candle(-0.2, 0.95, 0, 0.24)),
    anvil: () => merge(moved(lathe({ profile: [[0, 0], [0.34, 0], [0.32, 0.42], [0, 0.42]], segments: 10, color: "#3a2618" }), 0, 0, 0), B(0.5, 0.1, 0.3, "#23252a", 0, 0.47, 0), B(0.3, 0.14, 0.22, "#23252a", 0, 0.59, 0),
      B(0.78, 0.14, 0.3, "#2c2f35", 0.04, 0.73, 0), moved(turnedZ(lathe({ profile: [[0, 0], [0.13, 0], [0, 0.36]], segments: 8, color: "#2c2f35" }), -Math.PI / 2), 0.43, 0.73, 0), B(0.3, 0.05, 0.08, OAKC, -0.1, 0.83, 0.02), B(0.12, 0.1, 0.14, "#23252a", -0.28, 0.85, 0.02)),
    grindstone: () => merge(V(1.0, 0.08, 0.5, OAK_DK, 0, 0.5, 0), ...legs(1.0, 0.5, 0.48, OAK_DK), V(0.9, 0.18, 0.36, "#2a2018", 0, 0.42, 0),
      moved(turnedX(lathe({ profile: [[0, -0.07], [0.42, -0.07], [0.44, 0], [0.42, 0.07], [0, 0.07]], segments: 16, color: "#8d8880" }), Math.PI / 2), 0, 0.72, 0), beam(0, 0.72, -0.3, 0, 0.72, 0.3, 0.035, IRON), beam(0, 0.72, 0.3, 0.18, 0.9, 0.3, 0.025, IRON)),
    arrowBarrel: () => { const rand = mulberry32(41), parts = [lathe({ profile: [[0, 0], [0.3, 0], [0.36, 0.42], [0.3, 0.85], [0.26, 0.85], [0.26, 0.2], [0, 0.2]], segments: 12, color: "#3e2a1a" }), ...[0.12, 0.42, 0.74].map((y) => moved(torus(0.33, 0.02, IRON, 0, 12, 4), 0, y, 0))];
      for (let i = 0; i < 12; i++) { const a = rand() * TAU, r = rand() * 0.18, lean = 0.1 + rand() * 0.12; parts.push(beam(Math.cos(a) * r, 0.3, Math.sin(a) * r, Math.cos(a) * (r + lean), 1.25 + rand() * 0.12, Math.sin(a) * (r + lean), 0.012, "#b89a6a"), B(0.07, 0.12, 0.012, i % 2 ? "#d9661c" : "#e6dfd3", Math.cos(a) * (r + lean), 1.26, Math.sin(a) * (r + lean))); }
      return merge(...parts); },
    keg: () => BL.keepModels.kit("keg").geometry
  });
  // A candle that floats over the lounge, a part about its foot.
  const floatCandle = cached(() => noShadow(merge(B(0.07, 0.34, 0.07, WHITE, 0, 0.17, 0), B(0.08, 0.05, 0.08, "#f4efe0", 0.01, 0.3, 0.01), B(0.04, 0.09, 0.04, "#ffd27a", 0, 0.39, 0, 1))));

  // The keep's wooden sign of its levels (stood in the yard by its door, scene-keep.js): a carved board for each (the island's own, hubModels.caveSign), the
  // highest at the top, on two dark posts with a cap across them. Its foot at the origin, its face toward +z.
  const LEVEL_SIGN = { names: HL.LEVEL_NAMES, scale: 0.3, top: 2.9, gap: 0.08, post: "#2e1f14" };
  const levelSign = () => {
    const H = BL.hubModels, S = LEVEL_SIGN, parts = [], signs = S.names.map((n) => H.caveSign(n, null, false, true));
    const widest = Math.max(...signs.map((s) => s.signWidth)) * S.scale, postX = widest / 2 - 0.12;
    let y = S.top;
    for (const s of signs) {
      const h = s.signHeight * S.scale, lift = y - h / 2, verts = s.verts.slice();
      for (let i = 0; i < verts.length; i += 3) { verts[i] *= S.scale; verts[i + 1] = verts[i + 1] * S.scale + lift; verts[i + 2] = verts[i + 2] * S.scale + 0.1; }
      parts.push({ verts, faces: s.faces, lines: s.lines });
      y -= h + S.gap;
    }
    for (const sx of [-1, 1]) parts.push(bevelBox({ w: 0.16, h: S.top + 0.2, d: 0.16, color: S.post, offset: { x: sx * postX, y: (S.top + 0.2) / 2, z: 0 } }));
    parts.push(bevelBox({ w: widest + 0.3, h: 0.14, d: 0.24, color: S.post, offset: { x: 0, y: S.top + 0.25, z: 0.02 } }));
    return merge(...parts);
  };
  const PROP_GEOMETRY = new Map();
  /** A piece of furniture's geometry, built once for its kind and whatever of its own sizes it carries. */
  const prop = (p) => {
    // Only beams are laid out about where they stand; every other piece of a kind and size shares one geometry.
    const key = `${p.k}|${p.len || ""}|${p.w || ""}|${p.h || ""}|${p.d || ""}|${p.color || ""}|${p.r || ""}|${p.index ?? ""}|${p.hung ? 1 : 0}${p.fire ? 1 : 0}${p.k === "beams" ? `|${p.x}|${p.z}` : ""}`;
    let g = PROP_GEOMETRY.get(key);
    if (!g) { const build = BUILD[p.k]; g = build ? build(p) : null; PROP_GEOMETRY.set(key, g); }
    return g;
  };

  // ---------- the lamps ----------
  // A torch in its iron bracket, a part: the bracket on the wall at the origin, the torch leaning out along +z; its
  // flame (`FLAME`, where the scene stands `BL.blaze.smooth()`) and the light it gives.
  const torch = cached(() => merge(B(0.14, 0.32, 0.04, IRON, 0, -0.06, 0.02), beam(0, -0.1, 0.03, 0, -0.08, 0.26, 0.05, IRON), beam(0, -0.28, 0.2, 0, 0.18, 0.34, 0.06, "#4a3220"), moved(torus(0.075, 0.02, IRON, 0, 10, 4), 0, 0.12, 0.32)));
  const FLAME = { x: 0, y: 0.26, z: 0.35, s: 0.55 };
  // Every lamp: where it burns, how far its light reaches and its colour, and what holds it (a torch on a wall, or a
  // flame already in a piece of furniture), [x, y, z, reach, tint, turn, holder].
  const WARM = [1.75, 0.98, 0.44], CANDLE = [1.5, 1.0, 0.55], EMBER = [1.9, 0.72, 0.28], COLD = [0.35, 0.45, 0.9], GREENISH = [0.3, 1.0, 0.45], GOLDEN = [1.4, 1.0, 0.4];
  const wall = (x, y, z, turnBy, reach = 10.5) => [x, y, z, reach, WARM, turnBy, "torch"];
  const glow = (x, y, z, reach, tint) => [x, y, z, reach, tint, 0, null];
  const E = Math.PI / 2;
  const UPF = HL.ROOM.alchemy.floor, ARF = HL.ROOM.armory.floor, DNF = HL.LEVELS.under.floor, ROOF = HL.ROOF, DEG = Math.PI / 180;
  // A torch on the round wall at `deg` round from +x toward +z, `y` up, turned to face the room's middle.
  const onWall = (deg, y, reach = 10.5) => { const a = deg * DEG, c = Math.cos(a), sn = Math.sin(a); return wall(KC.x + c * (R - 0.12), y, KC.z + sn * (R - 0.12), Math.atan2(-c, -sn), reach); };
  const middle = (y, reach, tint, dx = 0, dz = 0) => glow(KC.x + dx, y, KC.z + dz, reach, tint);
  const HALL_LAMPS = [
    // The lounge: torches round its wall clear of the stair, either side of the hearth and over the stair where it
    // starts up; the hearth's own fire, the candles floating over the middle and the ones on the tables.
    ...[20, 50, 120, 300, 330].map((d) => onWall(d, 3.2, 12)), onWall(165, 3.6, 12), ...[256, 284].map((d) => onWall(d, 3.4, 12)),
    glow(0, 1.0, HL.HEARTH_AT.z + 0.6, 12, EMBER), middle(7.2, 14, CANDLE), glow(0, 1.1, HL.HEARTH_AT.z + 5.5, 5, CANDLE), middle(ROOF + 7.2, 16, CANDLE),
    // The alchemy room: torches on its wall, a green glow between its stations, the cauldron's fire, the chandelier.
    ...[20, 100, 160, 215, 280].map((d) => onWall(d, UPF + 3.0, 12)),
    ...[0, 90, 160, 300].map((d) => middle(UPF + 1.8, 7, GREENISH, Math.cos(d * DEG) * 7.4, Math.sin(d * DEG) * 7.4)),
    middle(UPF + 0.6, 8, EMBER), middle(UPF + 8.2, 16, CANDLE),
    // The dungeon: torches by the stair's foot, a lantern hung over its middle, the jailer's candle and the light in
    // two of the cells.
    onWall(72, DNF + 2.9, 10), onWall(110, DNF + 4.4, 10), middle(DNF + 4.2, 13, [1.2, 0.62, 0.3]),
    ...[HL.CELLS[2], HL.CELLS[8]].map((c) => glow(c.x, DNF + 0.5, c.z, 3, CANDLE)),
    // The training room: torches round its wall and its chandelier.
    ...[30, 90, 150, 205].map((d) => onWall(d, ARF + 3.0, 12)), middle(ARF + 8.2, 16, CANDLE),
    // The top level: its firepit, and a torch on each pier clear of the stair.
    middle(ROOF + 1.4, 17, EMBER), ...[0, 90, 135, 180, 225, 270, 315].map((d) => onWall(d, ROOF + 3.2, 11))
  ];
  // A tower's: a torch every half turn up its stair, two by its door, and its top room's.
  const towerLamps = (t) => {
    const out = [], H = t.top;
    for (let j = 7; j <= t.n - 4; j += PER / 2) { const a = A0 + (j - 0.5) * DT, r = RI - 0.05; out.push([Math.cos(a) * r, j * U + 2.1, Math.sin(a) * r, 8, WARM, Math.atan2(-Math.cos(a), -Math.sin(a)), "torch"]); }
    for (const s of [-1, 1]) { const a = HL.DOOR_ANGLE + s * 0.65, r = RI - 0.05; out.push([Math.cos(a) * r, 2.6, Math.sin(a) * r, 8, WARM, Math.atan2(-Math.cos(a), -Math.sin(a)), "torch"]); }
    // The doorway's light at the landing's end, and a torch either side of the landing.
    { const a = A0 + FLOOR_SECTOR - 0.05, r = (R_IN + RI) / 2; out.push([Math.cos(a) * r, H + 1.4, Math.sin(a) * r, 6, CANDLE, 0, null]); }
    for (const s of [-1, 1]) { const a = A0 + FLOOR_SECTOR / 2 + s * 0.3, r = RI - 0.05; out.push([Math.cos(a) * r, H + 2.4, Math.sin(a) * r, 8, WARM, Math.atan2(-Math.cos(a), -Math.sin(a)), "torch"]); }
    return out.map((l) => [l[0] + t.x, l[1], l[2] + t.z, l[3], l[4], l[5], l[6]]);
  };
  // Shards' caves': a torch on each of its places (keep-halls-layout.js `SHARDS_CAVE.torches`), reaching down the
  // tunnel to the next.
  const lamps = cached(() => [...HALL_LAMPS, ...TOWERS.flatMap(towerLamps), ...HL.SHARDS_CAVE.torches.map(([x, y, z, turnBy]) => wall(x, y, z, turnBy, 8.5))]);

  // ---------- out of the doors ----------
  // What a door shows of the night outside it, a quad facing back in: the yard's flags and the curtain over them with a
  // few lit windows, then the sky; `w` across.
  const glimpse = variants((w) => {
    const parts = [B(w, 1.0, 0.04, "#1a1c20", 0, 0.5, 0, 0.15), B(w, 3.4, 0.04, "#14161c", 0, 2.7, 0, 0.12), B(w, 5, 0.04, "#0c1020", 0, 6.9, 0, 0.25)];
    for (const [x, y] of [[-0.35, 2.4], [0.4, 3.1], [-0.1, 3.6]]) parts.push(B(0.12, 0.26, 0.05, "#ffad4f", x * w, y, -0.01, 1));
    parts.push(B(0.18, 0.18, 0.05, "#ffbe5c", w * 0.32, 1.4, -0.02, 1));
    return noShadow(merge(...parts));
  });

  // Everything heavy, in slices behind the fade.
  // The volcano's cave (keep-halls-layout.js `CAVE`), in the halls' frame: its rock cut in blocks `CAVE.unit` across
  // from the layout's own air, so what is drawn is what is walked: dark basalt banded with rust, a cinder floor, the
  // pool's lava, cracks glowing in the way in's walls, and at each path's rockfall a glow of its own colour.
  const CAVE_RGB = [null, "#0e0d0f", "#1b1a1d", "#232125", "#151417", "#3a221c", "#2a2422", "#ff5a14", "#ff7a22", "#3ad6c0", "#b06aff"].map((c) => c && BL.math.hexToRgb(c));
  // A cave region (keep-halls-layout.js `CAVES`) carved out of solid blocks from the layout's own air: `kindOf` names
  // each column of air from `HL.CAVE_AIR`, `floorOf` and `roofOf` the block under and over it by that, and `wallOf`
  // every block of wall beside another column's air.
  const carveCave = function* (C, palette, kindOf, floorOf, roofOf, wallOf, slice) {
    const G = C.grid, u = C.unit, sx = Math.round((G.x1 - G.x0) / u), sy = Math.round((G.y1 - G.y0) / u), sz = Math.round((G.z1 - G.z0) / u), g = T.makeGrid(sx, sy, sz), d = g.data;
    const lo = new Int16Array(sx * sz), hi = new Int16Array(sx * sz), kind = new Uint8Array(sx * sz);
    d.fill(1);
    for (let x = 0; x < sx; x++) {
      if ((x & 7) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) {
        const c = x * sz + z;
        if (!HL.caveAir(C.x + G.x0 + (x + 0.5) * u, C.z + G.z0 + (z + 0.5) * u)) { lo[c] = hi[c] = 0; continue; }
        const A = HL.CAVE_AIR;
        lo[c] = Math.max(1, Math.round((A.floor - G.y0) / u)); hi[c] = Math.min(sy - 1, Math.round((A.ceil - G.y0) / u)); kind[c] = kindOf(A);
        for (let y = lo[c]; y < hi[c]; y++) d[(x * sy + y) * sz + z] = 0;
      }
    }
    // The stone that shows: under each floor, over each roof, and every wall beside the air.
    for (let x = 0; x < sx; x++) {
      if ((x & 7) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) {
        const c = x * sz + z;
        if (hi[c] > lo[c]) { d[(x * sy + lo[c] - 1) * sz + z] = floorOf(kind[c], x, z); d[(x * sy + hi[c]) * sz + z] = roofOf(x, z); }
        for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax, nz = z + az;
          if (nx < 0 || nx >= sx || nz < 0 || nz >= sz) continue;
          const n = nx * sz + nz;
          for (let y = lo[n]; y < hi[n]; y++) {
            if (y >= lo[c] && y < hi[c]) continue;
            d[(x * sy + y) * sz + z] = wallOf(x, y, z, kind[n], y - lo[n], G.x0 + (x + 0.5) * u);
          }
        }
      }
    }
    return yield* T.gridGeometrySteps(g, { unit: u, palette, origin: { x: C.x + G.x0, y: G.y0, z: C.z + G.z0 } }, slice);
  };
  // The basalt of a cave's walls, banded with rust.
  const basalt = (x, y, z) => (y + (x >> 3) + (z >> 3)) % 9 < 2 ? 5 : 2 + ((y >> 1) + (x >> 2)) % 3;
  const cave = cachedSteps(function* (slice = null) {
    const geo = yield* carveCave(HL.CAVE, CAVE_RGB, (A) => A.lava ? 1 : A.end ? 1 + A.end : 0, (k) => k === 1 ? 7 : 6, () => 4,
      // A path's rockfall glows through its gaps; the way in's walls are cracked with fire low down.
      (x, y, z, k, up, lx) => { const f = hash3(x, y, z); return k > 1 && f < 0.3 ? 6 + k : lx > 5 && lx < 19 && up < 5 && f < 0.07 ? 8 : basalt(x, y, z); }, slice);
    for (const f of geo.faces) {
      if (f.color === CAVE_RGB[7]) { f.water = "lava"; f.emissive = 0.6; }
      else if (f.color === CAVE_RGB[8] || f.color === CAVE_RGB[9] || f.color === CAVE_RGB[10]) f.emissive = 0.85;
    }
    return geo;
  });
  // Shards' caves (keep-halls-layout.js `SHARDS_CAVE`), the same way and in the same dark basalt over a cinder floor.
  const shardsCave = cachedSteps(function* (slice = null) {
    return yield* carveCave(HL.SHARDS_CAVE, CAVE_RGB, () => 0, () => 6, () => 4, basalt, slice);
  });
  // A cluster of Merge Rock's quartz (repo-island-models.js `quartz`) standing in the middle of Shards' chamber and of
  // each of its caves, lit from within, as the island's own are (keep-models.js `shardsCrystals`); WebGL alone.
  const shardsCaveCrystals = cached(() => {
    const RM = BL.repoIslandModels, C = HL.SHARDS_CAVE, H = C.chamber, P = C.tunnel, M = C.room, deep = -C.entry.drop, g = { verts: [], faces: [], lines: [] };
    const light = [RM.CORE[1], RM.CORE[0], RM.CORE[2], RM.CORE[1]], hues = RM.HUES.map((h) => h.map((c, i) => c.map((v, ch) => v + (light[i][ch] - v) * 0.5)));
    const sites = [[C.x + H.at, C.z, 1.6], ...C.tunnels.map((a) => { const d = H.r + P.len + M.r - 1; return [C.x + H.at + Math.cos(a) * d, C.z + Math.sin(a) * d, 1.1]; })];
    sites.forEach(([x, z, size], k) => {
      const rand = BL.math.mulberry32(BL.math.fnv1a(`shards-cave/${k}`)), hue = hues[k % hues.length], len = 1.4 + 2.2 * size, r = 0.18 + 0.2 * size;
      RM.quartz(g, x, deep, z, 0, 1, 0, r, len, hue, rand, 6, 0.45);
      for (let m = 0; m < 7; m++) {
        const turn = m / 7 * TAU + rand() * 0.5, off = r * (1.2 + rand()), ox = Math.cos(turn), oz = Math.sin(turn), tilt = 0.35 + rand() * 0.5;
        RM.quartz(g, x + ox * off, deep, z + oz * off, ox * tilt, 1, oz * tilt, r * (0.4 + rand() * 0.3), len * (0.3 + rand() * 0.4), hue, rand, 6, 0.45);
      }
    });
    g.glass = RM.CRYSTAL.glass;
    return models.noShadow(g);
  });
  const buildSteps = function* () {
    yield* BL.keepModels.buildSteps();
    const slice = { until: 0, budget: BL.buildTasks.SLICE_MS, work: 0 };
    yield* halls.steps(slice);
    yield* pause(slice); liner();
    yield* pause(slice); floors();
    yield* pause(slice); towerLiner(0); towerLiner(1);
    yield* towerInside(0).steps(slice);
    yield* towerInside(1).steps(slice);
    yield* cave.steps(slice);
    yield* shardsCave.steps(slice);
    if (BL.repoIslandModels) { yield* pause(slice); shardsCaveCrystals(); }
    for (const p of HL.PROPS) { yield* pause(slice); prop(p); }
    for (const t of TOWERS) for (const [k, x, z, turnBy] of t.props) { yield* pause(slice); prop({ k, x, z, turn: turnBy }); }
    lamps(); torch(); floatCandle();
  };

  BL.keepHallsModels = { cave, shardsCave, shardsCaveCrystals, HEX, buildSteps, halls, liner, floors, towerLiner, towerInside, prop, torch, FLAME, lamps, glimpse, floatCandle };
})();
