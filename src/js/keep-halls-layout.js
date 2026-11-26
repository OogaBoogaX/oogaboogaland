// The Byzantine Keep's interior, pure and loadable in Node: the keep behind its great door, one great round tower of
// four levels a storey each (keep-layout.js `KEEP` is the same tower from outside), and the six curtain towers' insides,
// each a spiral stair up to a room at its top. One frame holds them all: the keep about `KC`, its door at z 0.4 out (y 0
// the lounge's floor, +z out through the door), and each tower `TOWER_SPAN` along x from the last, far past the camera's
// reach, so whoever is in one never sees another.
//
// The keep from the bottom up, every level round: the dungeon of dark cobblestone and its twelve cells round its wall;
// the great lounge, its hearth at the back with four armchairs before it in an arc and candles floating in a ring over
// its middle; the alchemy room and its twelve stations in a ring round its cauldron; the armory, racks of arms, stands
// of shields and suits of plate in a ring round its table; and the top level under the spire, an arcade open to the
// night through great arches with a firepit in the middle and eight high seats round it. The alchemy room and the
// armory open to the night through the same great arches (keep-layout.js `KEEP.arcades`) wherever the stair does not
// climb the wall behind them, and keep lancets there. One long
// stair climbs the inside of the wall from the dungeon to the top level, a quarter turn a storey (`STAIR`).
//
// Everything that is open is said once, as the air over each column of the frame (`columns`): a room's volume, the gap
// the stair cuts through a floor, a door through a wall, less what stands in it (the stair's steps, a railing, a cell's
// walls, the furniture). The scene walks, stands and flies by it (`supportAt`, `clearAt`, `ceilingAt`), the camera
// keeps to it (`airAt`), and keep-halls-models.js cuts the voxels from it, so what is drawn and what is walked never
// disagree. `columns(x, z, out, visual)` writes the column's open intervals into `out` as bottom, top pairs, lowest
// first, and returns how many; `visual` adds what only the eye uses (window niches, the hearth's mouth, the parapet the
// keep's own model draws) and leaves out the furniture, which is drawn apart.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const TAU = Math.PI * 2;
  // A voxel, the walls' thickness, the most a body steps up or down, and a railing's height (five voxels).
  const U = 0.1875, T = 0.8, STEP = 0.45, RAIL = 5 * U;
  const KL = BL.keepLayout, KEEP = KL.KEEP;
  const IN = T / 2;
  // The levels, a storey each: the dungeon under the yard, the lounge on it, the armory over that (level `upper`), the
  // alchemy room over that (level `armory`, the name it was built under), and the top level, an open arcade under the spire (still `roof`); `SKY` is as high as the open air goes.
  const LEVELS = { under: { floor: -64 * U, ceil: -2 * U }, ground: { floor: 0, ceil: 62 * U }, upper: { floor: 64 * U, ceil: 126 * U }, armory: { floor: 128 * U, ceil: 190 * U }, roof: { floor: 192 * U, ceil: 254 * U } };
  const ROOF = LEVELS.roof.floor, SKY = 96;
  // The levels by name, the highest first, as the sign by the keep's door carves them (the rooftop is Founders Hall).
  const LEVEL_NAMES = ["FOUNDERS HALL", "ALCHEMY ROOM", "TRAINING", "GREAT LOUNGE", "DUNGEON"];
  // The keep's round about `KC`: its rooms `R` to their wall's face, the wall `RW` to its outer face (keep-layout.js
  // `KEEP`, whose door is this frame's z 0.4 out).
  const KC = { x: 0, z: -(KEEP.r - 0.4) }, RW = KEEP.r, R = KEEP.r - KEEP.wall;
  const BAL = KL.BALCONY;
  // To the eye the rooms' voxel wall stands `R_EYE` out, behind the blocks laid round it (keep-halls-models.js `liner`).
  const R_EYE = R + 0.3;
  // The rooms' bounds, for whatever reads a rectangle: [x0, x1, z0, z1] round the keep.
  const K = { x0: KC.x - RW, x1: KC.x + RW, z0: KC.z - RW, z1: KC.z + RW };
  const OUT = K;

  // ---------- the rooms ----------
  // A room: its round, its floor and ceiling. `style` dresses its stone.
  const room = (id, name, level, style, r = R) => ({ id, name, level, r, x0: KC.x - r, x1: KC.x + r, z0: KC.z - r, z1: KC.z + r, style, floor: LEVELS[level].floor, ceil: LEVELS[level].ceil, vault: null });
  const ROOMS = [
    room("dungeon", "Dungeon", "under", "cobble"),
    room("lounge", "Great Lounge", "ground", "hall"),
    room("armory", "Training", "upper", "stone"),
    room("alchemy", "Alchemy Room", "armory", "stone"),
    room("roof", "Founders Hall", "roof", "roof")
  ];
  const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
  const ceilAt = (r) => r.ceil;
  const inRoom = (r, x, z) => Math.hypot(x - KC.x, z - KC.z) < r.r;
  // An opening's top `t` across from its middle: its jambs to the springing, then two arcs struck from the far jambs.
  const archTop = (half, spring, t) => {
    const a = Math.abs(t);
    return a >= half ? -Infinity : spring + Math.sqrt(4 * half * half - (a + half) * (a + half));
  };
  // The great door, through the front of the wall to the yard.
  const DOORS = [{ a: "lounge", b: null, axis: "z", at: KC.z + R, from: -KEEP.door.half, to: KEEP.door.half, level: "ground", floor: 0, half: KEEP.door.half, mid: 0, spring: KEEP.door.spring, exit: true }];

  // ---------- the stair ----------
  // One long stair up the inside of the wall from the dungeon's floor to the top level, a band from `r0` out to the wall,
  // `steps` steps a voxel high and a quarter turn (`turn`) each storey, starting `start` round from +x toward +z (in
  // front of the dungeon's cells, so it rises past the door's right, round the lounge's left side clear of its hearth,
  // and comes out on the rooftop at its back). Each step is a stone slab `thick` deep, a parapet `RAIL` high on its
  // inner edge wherever it stands more than `open` over the floor beside it, so it is stepped onto from the side at its foot; and where it rises through a floor, that
  // floor is open over it from `HOLE` of the way up the storey (headroom), railed round the opening.
  const STAIR = { r0: R - 4.4, start: 65 * Math.PI / 180, turn: Math.PI / 2, steps: 64, thick: 0.6, hole: 0.74, open: 2.4, landing: 0.22 };
  const STOREYS = [LEVELS.under, LEVELS.ground, LEVELS.upper, LEVELS.armory, LEVELS.roof];
  // Each storey's flight starts with a flat landing on its floor, `landing` of its quarter turn long, before its steps
  // climb the rest of the way to the floor over it.
  STAIR.dt = STAIR.turn * (1 - STAIR.landing) / STAIR.steps;
  STAIR.end = STAIR.turn * (STOREYS.length - 1);
  const aroundK = (a) => { const u = (a - STAIR.start) % TAU; return u < 0 ? u + TAU : u; };
  const treadOf = (u) => {
    if (u >= STAIR.end) return null;
    const k = Math.floor(u / STAIR.turn), f = u - k * STAIR.turn - STAIR.landing * STAIR.turn, base = STOREYS[k].floor;
    return f < 0 ? base : base + (Math.floor(f / STAIR.dt) + 1) * U;
  };
  const floorUnder = (y) => { let f = LEVELS.under.floor; for (const L of STOREYS) if (L.floor <= y + 1e-6) f = L.floor; return f; };
  // Over a flight's last steps, within `top` of the floor it comes up to, neither the step's parapet nor the railing
  // round the floor's opening stands, so a body steps off the stair onto that floor (or onto the stair from it) from
  // the side as well as along it.
  STAIR.top = 2.4;
  const nearTop = (tread) => { for (const L of STOREYS) if (L.floor > tread + 1e-6) return L.floor - tread < STAIR.top; return false; };
  // A step's stone runs down `thick` under its tread, or to the floor beside it where that is nearer.
  const underOf = (tread) => { const f = floorUnder(tread); return tread - STAIR.thick < f + 0.5 ? f - 0.05 : tread - STAIR.thick; };
  // Which part of the stair (1 a step's stone, 2 a parapet) a point stands in, or 0; and the openings in the floors.
  const HOLES = [1, 2, 3, 4].map((k) => ({ u0: (k - 1 + STAIR.hole) * STAIR.turn, u1: k * STAIR.turn, from: STOREYS[k - 1].ceil, to: STOREYS[k].floor }));
  const stairPart = (x, y, z) => {
    const dx = x - KC.x, dz = z - KC.z, r = Math.hypot(dx, dz);
    if (r < STAIR.r0 - U || r >= R) return 0;
    const u = aroundK(Math.atan2(dz, dx)), tread = treadOf(u);
    if (tread !== null && y < tread && y > underOf(tread) && r >= STAIR.r0) return 1;
    if (tread !== null && r < STAIR.r0 && y > underOf(tread) && y < tread + RAIL && tread - floorUnder(tread) > STAIR.open && !nearTop(tread)) return 2;
    for (const h of HOLES) {
      if (u < h.u0 || u >= h.u1 || y < h.to || y > h.to + RAIL || (tread !== null && h.to - tread < STAIR.top)) continue;
      if (r < STAIR.r0 || (u - h.u0) * r < U) return 2;
    }
    return 0;
  };

  // ---------- the dungeon's cells ----------
  // Twelve cells round the dungeon's wall from just past the stair's foot to just before it, each between two walls of
  // the keep's stone running in from the wall, barred across its front on the chord at `CELL_R`. Their walls stand in
  // the way as segments [x0, z0, x1, z1, half thick, y0, y1]; their bars too, which are furniture.
  const DUNGEON = LEVELS.under, CELL_R = R - 4.6, DEG = Math.PI / 180;
  const CELL_A0 = STAIR.start + STAIR.turn + 10 * DEG, CELL_A1 = STAIR.start + TAU - 10 * DEG, CELL_DA = (CELL_A1 - CELL_A0) / 12;
  const SEGS = [], CELLS = [];
  const polar = (a, r) => [KC.x + Math.cos(a) * r, KC.z + Math.sin(a) * r];
  const inward = (x, z) => Math.atan2(-(x - KC.x), -(z - KC.z));
  for (let k = 0; k <= 12; k++) { const a = CELL_A0 + k * CELL_DA; SEGS.push([...polar(a, CELL_R), ...polar(a, R + 0.3), 0.18, DUNGEON.floor - 0.05, DUNGEON.ceil, "wall"]); }
  for (let k = 0; k < 12; k++) {
    const a = CELL_A0 + (k + 0.5) * CELL_DA, [ax, az] = polar(CELL_A0 + k * CELL_DA, CELL_R), [bx, bz] = polar(CELL_A0 + (k + 1) * CELL_DA, CELL_R), [x, z] = polar(a, (CELL_R + R) / 2);
    SEGS.push([ax, az, bx, bz, 0.07, DUNGEON.floor, DUNGEON.floor + 4.5, "bars"]);
    CELLS.push({ x, z, turn: inward(x, z), mid: [(ax + bx) / 2, (az + bz) / 2], barTurn: Math.atan2(-(bz - az), bx - ax), w: Math.hypot(bx - ax, bz - az) - 0.36 });
  }
  const segDist = (x, z, s) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t);
  };
  // Stone that stands in every column it covers, [x0, x1, z0, z1, y0, y1]: the hearth's chimney breast out of the
  // lounge's back wall, in three pieces either side of the hearth's mouth and over it.
  const BACK = KC.z - R;
  const STONES = [[-2.3, -1.5, BACK - 0.4, BACK + 1.3, 0, LEVELS.ground.ceil], [1.5, 2.3, BACK - 0.4, BACK + 1.3, 0, LEVELS.ground.ceil], [-1.5, 1.5, BACK - 0.4, BACK + 1.3, 2.7, LEVELS.ground.ceil]];
  const BREAST = 0;

  // ---------- windows and the hearth ----------
  // The keep's lancets (keep-layout.js `KEEP.windows`), open through the wall: at `a` round, their sill and springing over the floor, `half` across.
  const WINDOWS = KEEP.windows.map((w) => ({ ...w, room: w.floor === KEEP.armory ? "alchemy" : w.floor > 0 ? "armory" : "lounge" }));
  // The levels under the top one open through the wall in its great arches (keep-layout.js `KEEP.arcades`), each with
  // its room.
  const ARCADES = KEEP.arcades.filter((l) => l.floor < KEEP.roof).map((l) => ({ ...l, room: l.floor === KEEP.armory ? "alchemy" : "armory" }));
  // The lounge's hearth, cut back into the chimney breast: `half` wide, `top` tall, `depth` deep from the breast's face.
  const HEARTHS = [{ room: "lounge", axis: "z", at: BACK + 0.9, into: 1, along: 0, half: 1.5, top: 2.7, depth: 1.25, floor: 0 }];

  // ---------- the furniture ----------
  // Each lancet stands open through the wall behind iron bars, as the cells' are, half way through the wall.
  // A piece of furniture: its kind, where it stands (its room's floor under it), how it turns, and what of it stands in
  // a walker's way, [half across, half along, height] about its middle before it turns.
  const PROPS = [];
  const SIZE = {
    armchair: [0.55, 0.55, 2.6], sideTable: [0.35, 0.35, 0.7], station: [0.85, 0.62, 1.0], cauldron: [1.6, 1.6, 1.3], shelf: [1.5, 0.22, 2.4], cellBars: [0, 0, 0],
    weaponRack: [1.15, 0.42, 2.3], shieldStand: [1.2, 0.4, 2.2], armorStand: [0.6, 0.6, 2.2], armsTable: [1.5, 0.8, 0.95], wallShield: [0, 0, 0], numeral: [0, 0, 0], merchant: [2.35, 1.75, 3.6], anvil: [0.5, 0.35, 0.85], grindstone: [0.55, 0.45, 1.05], arrowBarrel: [0.42, 0.42, 1.3],
    jailTable: [0.6, 0.45, 0.8], barrel: [0.45, 0.45, 1.05], firepit: [1.9, 1.9, 1.1], roofChair: [0.55, 0.55, 2.6], guardian: [0.6, 0.6, 3.2], keg: [0.4, 0.4, 0.9],
    rug: [0, 0, 0], windowBars: [0, 0, 0], banner: [0, 0, 0], mantel: [0, 0, 0], fireJamb: [0.55, 0.42, 4.6], logs: [1.5, 0.5, 2.6], chandelier: [0, 0, 0], cell: [0, 0, 0], chains: [0, 0, 0]
  };
  const put = (k, roomId, x, z, turn = 0, o = {}) => PROPS.push({ k, room: roomId, x, z, turn, y: o.y ?? ROOM[roomId].floor, ...o });
  for (const w of WINDOWS) { const r = R + KEEP.wall * 0.55; put("windowBars", w.room, KC.x + Math.cos(w.a) * r, KC.z + Math.sin(w.a) * r, -(w.a + Math.PI / 2), { y: w.floor + w.sill, w: w.half, h: w.spring - w.sill }); }
  // Seats a visitor sits in (crew.js `sitPlayer`): where, facing which way, the seat's top.
  const SEATS = [];
  // The lounge: the hearth's mantel and its fire, a rug before it, and four armchairs in an arc facing it with a table
  // between each two.
  const HEARTH_AT = { x: 0, z: BACK + 0.4 };
  put("mantel", "lounge", 0, BACK + 1.3);
  // The clustered columns either side of the hearth's arch stand in a walker's way.
  for (const sx of [-1, 1]) put("fireJamb", "lounge", sx * 3.05, BACK + 1.72);
  put("logs", "lounge", 0, BACK + 0.8);
  put("rug", "lounge", 0, HEARTH_AT.z + 5.4, 0, { w: 9, d: 6.4, color: "#5a1f24" });
  [-45, -15, 15, 45].forEach((deg, i) => {
    const a = deg * DEG, x = Math.sin(a) * 5.6, z = HEARTH_AT.z + Math.cos(a) * 5.6;
    put("armchair", "lounge", x, z, a + Math.PI, { index: i });
    SEATS.push({ x, z, y: 0.5, floor: 0, ry: a + Math.PI });
  });
  for (const deg of [-30, 0, 30]) { const a = deg * DEG, r = deg ? 5.4 : 5.5; put("sideTable", "lounge", Math.sin(a) * r, HEARTH_AT.z + Math.cos(a) * r, a + Math.PI); }
  // The alchemy room: twelve stations in a ring round its middle, each worked from the side toward the great cauldron
  // over its fire there, twice a cauldron's width; shelves of jars on the front wall, and a chandelier.
  const UP = ROOM.alchemy.floor;
  // The ring leaves a gap where the stair comes up through the floor and goes on up to the rooftop.
  const STAIR_UP = STAIR.start + 3 * STAIR.turn, GAP = 58 * DEG;
  // Each station a black desk with the lounge's high seat before it on the cauldron's side, sat in facing the desk
  // and stood up from behind it.
  for (let k = 0; k < 12; k++) {
    const [x, z] = polar(STAIR_UP + GAP / 2 + (k + 0.5) * (TAU - GAP) / 12, 9.8), turn = inward(x, z), fx = Math.sin(turn), fz = Math.cos(turn), cx = x + fx * 1.15, cz = z + fz * 1.15;
    put("station", "alchemy", x, z, turn, { index: k });
    put("armchair", "alchemy", cx, cz, turn + Math.PI, { index: k });
    put("numeral", "alchemy", cx, cz, turn + Math.PI, { index: k });
    SEATS.push({ x: cx, z: cz, y: UP + 0.5, floor: UP, ry: turn + Math.PI, walk: { x: cx + fx * 1.05, z: cz + fz * 1.05 } });
  }
  put("cauldron", "alchemy", KC.x, KC.z, 0, { fire: true, big: true });
  put("shelf", "alchemy", 0, KC.z + R - 0.32, Math.PI);
  put("chandelier", "alchemy", KC.x, KC.z, 0, { y: UP + 8.6, r: 1.6 });
  // The armory: racks of arms, stands of shields and suits of the knights' plate by turns in a ring round its middle
  // (a gap where the stair comes up and goes on), and a chandelier.
  const ARM = ROOM.armory.floor, STAIR_ARM = STAIR.start + 2 * STAIR.turn;
  for (let k = 0; k < 12; k++) {
    const [x, z] = polar(STAIR_ARM + GAP / 2 + (k + 0.5) * (TAU - GAP) / 12, 9.8), kind = ["weaponRack", "armorStand", "shieldStand"][k % 3];
    put(kind, "armory", x, z, inward(x, z), { index: k, ...(kind === "armorStand" ? { s: 0.62 } : {}) });
  }
  // Shields with crossed axes high on its wall, one on each pier clear of the stair.
  for (const deg of [0, 45, 90, 135, 180, 225]) { const [x, z] = polar(deg * DEG, R - 0.14); put("wallShield", "armory", x, z, inward(x, z), { y: ARM + 6.4 }); }
  put("chandelier", "armory", KC.x, KC.z, 0, { y: ARM + 8.6, r: 1.6 });
  // The dungeon: each cell's bars and what is left in it, a jailer's table and barrels by the stair's foot.
  CELLS.forEach((c, i) => {
    put("cellBars", "dungeon", c.mid[0], c.mid[1], c.barTurn, { len: c.w });
    put("cell", "dungeon", c.x, c.z, c.turn, { index: i });
  });
  { const [x, z] = polar(200 * DEG, 3.2); put("jailTable", "dungeon", x, z, inward(x, z)); }
  for (const [a, r] of [[214, 4.2], [222, 4.4], [218, 5.3]]) { const [x, z] = polar(a * DEG, r); put("barrel", "dungeon", x, z); }
  // The top level: the great firepit in its middle with eight high seats round it, and kegs by the wall.
  const FIRE_AT = { x: KC.x, z: KC.z };
  put("firepit", "roof", FIRE_AT.x, FIRE_AT.z);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU + TAU / 16, x = FIRE_AT.x + Math.sin(a) * 4.9, z = FIRE_AT.z + Math.cos(a) * 4.9;
    put("roofChair", "roof", x, z, a + Math.PI);
    SEATS.push({ x, z, y: ROOF + 0.5, floor: ROOF, ry: a + Math.PI });
    // A knight stands guard behind each seat, on the deck itself, looking out.
    put("guardian", "roof", FIRE_AT.x + Math.sin(a) * 7.6, FIRE_AT.z + Math.cos(a) * 7.6, a);
  }
  for (const a of [0, 90, 180]) { const [x, z] = polar(a * DEG, R - 1.2); put("keg", "roof", x, z); }
  // What stands in the way, as boxes: [x0, x1, z0, z1, y0, y1]. A piece turned off the quarter turns stands in a square
  // as wide as its widest.
  const BOXES = [];
  for (const p of PROPS) {
    const s = SIZE[p.k];
    if (!s || !s[2]) continue;
    let hx = s[0], hz = s[1];
    if (p.len) hx = p.len / 2;
    const q = p.turn / (Math.PI / 2), quarter = Math.abs(q - Math.round(q)) < 1e-6;
    if (!quarter) hx = hz = Math.max(hx, hz);
    else if (Math.round(q) & 1) { const swap = hx; hx = hz; hz = swap; }
    BOXES.push([p.x - hx, p.x + hx, p.z - hz, p.z + hz, p.y, p.y + s[2]]);
  }

  // ---------- the towers ----------
  // A tower's inside: a round hall `RI` across, its wall `RO` out; a spiral stair hugging the wall from `R_IN` out,
  // `PER` steps a turn each a voxel high, a stone parapet on its inner edge; and over the open well a room on the
  // stair's `n`-th step, its floor round the well and the turn of the stair that reaches it, a hole over the rest of the
  // stair, a dome over it. The door looks out along +z; the stair starts `START` round from it.
  const RI = 5.85, RO = 6.9, R_IN = 1.95, PER = 28, DT = TAU / PER, START = 40 * Math.PI / 180, DOOR_ANGLE = Math.PI / 2, A0 = DOOR_ANGLE + START;
  const FLOOR_SECTOR = 40 * Math.PI / 180, SLAB = 2 * U, DOME = { wall: 26 * U, rise: 12 * U };
  const TOWER_DOOR = { half: 1.15, spring: 2.4 };
  // The wall across the stair's band where its landing ends, `thick`, an arched doorway `half` either side of the
  // band's middle springing `spring` over the landing, `deep` into the wall and lit at its back: up into the gallery.
  const LANDING_DOOR = { thick: 0.55, half: 1.0, spring: 2.2, deep: 0.35 };
  const TOWER_KINDS = [
    { id: "rookery", name: "Rookery", n: 84 }, { id: "bell", name: "Bell tower", n: 84 }, { id: "clock", name: "Clock tower", n: 84 },
    { id: "observatory", name: "Observatory", n: 84 }, { id: "battlements", name: "Battlements", n: 112 }, { id: "crown", name: "Crown chamber", n: 112, hidden: true }
  ];
  const TOWER_SPAN = 160;
  const TOWERS = TOWER_KINDS.map((k, i) => ({ ...k, i, x: 200 + i * TOWER_SPAN, z: 0, top: k.n * U, tall: k.n > 84 }));
  // The angle round from the stair's start, 0 to a turn.
  const around = (a) => { const u = (a - A0) % TAU; return u < 0 ? u + TAU : u; };
  // A window lighting each turn of a tower's stair: [angle, sill, height, half].
  const towerWindows = (t) => {
    const out = [];
    for (let n = 0; n < t.n / PER; n++) out.push([A0 + 16 * DT, (16 + n * PER) * U + 1.3, 1.7, 0.32]);
    return out;
  };
  for (const t of TOWERS) t.windows = towerWindows(t);
  // What stands on each tower's top floor, about its middle: [kind, x, z, turn], and what of it stands in the way, as
  // boxes [x0, x1, z0, z1, height] over the floor.
  const floorAt = (u, r) => [Math.cos(A0 + u) * r, Math.sin(A0 + u) * r];
  const [cx, cz] = floorAt(FLOOR_SECTOR / 2, RI - 0.35), [ox, oz] = floorAt(FLOOR_SECTOR / 2 + Math.PI, 1.7);
  const facing = (x, z) => Math.atan2(-x, -z);
  // The towers' top rooms are gone: each stair ends on a landing at its gallery's doorway, with nothing on it.
  const TOWER_PROPS = Object.fromEntries(TOWER_KINDS.map((k) => [k.id, []]));
  const TOWER_BOXES = Object.fromEntries(TOWER_KINDS.map((k) => [k.id, []]));
  for (const t of TOWERS) { t.props = TOWER_PROPS[t.id]; t.boxes = TOWER_BOXES[t.id]; }
  // The air of tower `t` over the column at (lx, lz) about its middle.
  const towerColumn = (t, lx, lz, visual) => {
    const r = Math.hypot(lx, lz), a = Math.atan2(lz, lx), H = t.top;
    if (r < (visual ? RI + 0.3 : RI)) addAir(0, H + DOME.wall + DOME.rise * (1 - Math.min(1, (r / RI) * (r / RI))));
    if (Math.abs(lx) < TOWER_DOOR.half && lz > RI - 0.3 && lz < RO + 1.4) addAir(0, archTop(TOWER_DOOR.half, TOWER_DOOR.spring, lx));
    if (visual && r >= RI - 0.05 && r < RO + 0.3) for (const [wa, sill, tall, half] of t.windows) {
      let d = a - wa; d -= Math.round(d / TAU) * TAU;
      const along = d * r;
      if (Math.abs(along) < half) addAir(sill, sill + archTop(half, tall, along));
    }
    if (r >= RI) return;
    if (!visual) for (const b of t.boxes) if (lx >= b[0] && lx < b[1] && lz >= b[2] && lz < b[3]) addSolid(H, H + b[4]);
    const u = around(a), jb = Math.floor(u / DT) + 1, floorSide = u < FLOOR_SECTOR;
    if (r < R_IN - U) return;
    const ring = r < R_IN;
    for (let j = jb; j <= t.n; j += PER) addSolid(j * U - SLAB, j * U + (ring ? RAIL : 0));
    // The landing at the stair's head, railed along the well.
    if (floorSide) addSolid(H - SLAB, H + (ring ? RAIL : 0));
    // The wall across the band where the landing ends, its doorway up into the gallery a shallow arch lit at its back.
    const e = (u - FLOOR_SECTOR) * r, tb = r - (R_IN + RI) / 2, D = LANDING_DOOR;
    if (e >= 0 && e < D.thick) {
      const top = H + DOME.wall, arch = Math.abs(tb) < D.half ? H + archTop(D.half, D.spring, tb) : H;
      if (arch > H && e < D.deep) { addSolid(H - SLAB, H); addSolid(arch, top); }
      else addSolid(H - SLAB, top);
    }
  };

  // ---------- the volcano's cave ----------
  // The cave under the volcano (keep-layout.js `VOLCANO.mouth`), far off beyond the last tower's inside so neither
  // sees the other: in from its mouth at `x` (its way in runs toward +x, as the mouth's cut does in the yard), a
  // tunnel `entry.len` long sloping `entry.drop` down, `half` either side and `tall` under its crown; a great chamber
  // `chamber.r` across its middle `chamber.at` in, under a dome `tall` high hung with stalactites, a pool of lava to
  // one side (`lava`); and off its far side three `paths`, each a bearing round the chamber's middle, `path.len` long
  // from `path.from` out, closing in a rockfall: the ways on to caves not yet dug. Its rock is cut in blocks `unit`
  // across (`grid`, the box of them about the mouth), and a body stands and flies in exactly the air those blocks leave.
  const CAVE = { id: "cave", name: "Volcano Cave", cave: true, x: 200 + TOWER_KINDS.length * TOWER_SPAN, z: 0, unit: 2 * U,
    entry: { len: 22, half: 4.5, tall: 6.5, drop: 7.125 }, chamber: { at: 40, r: 18, tall: 12 }, lava: { at: 41, z: 10.5, rx: 7.5, rz: 4.2 },
    paths: [-0.72, 0, 0.72], path: { from: 15.5, len: 14, half: 2.7, tall: 4.6 }, grid: { x0: -4.125, x1: 73.875, z0: -27, z1: 27, y0: -11.25, y1: 8.25 } };
  CAVE.arrive = { x: CAVE.x + 3.6, z: CAVE.z, yaw: Math.PI / 2 };
  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const caveNear = (x, z) => x > CAVE.x + CAVE.grid.x0 - 2 && x < CAVE.x + CAVE.grid.x1 + 2 && Math.abs(z - CAVE.z) < CAVE.grid.z1 + 2;
  // The cave's air over (lx, z) about its mouth, into `CAVE_AIR` (its floor, its roof, whether the floor is lava and
  // which path's end it is by, counted from 1); false in the rock.
  const CAVE_AIR = { floor: 0, ceil: 0, lava: false, end: 0 };
  const caveShape = (lx, z) => {
    const C = CAVE, E = C.entry, H = C.chamber, P = C.path, rough = KL.noise(lx * 0.23 + 91, z * 0.23 + 17) - 0.5, deep = -E.drop;
    let floor = Infinity, ceil = -Infinity, end = 0;
    if (lx > C.grid.x0 + 0.5 && lx < E.len + 2) {
      const u = clamp01(lx / E.len), half = E.half - 0.9 * Math.sin(Math.PI * u) + rough * 0.8, k = z / half;
      if (Math.abs(k) < 1) { floor = deep * KL.smooth(u); ceil = floor + E.tall * Math.pow(1 - k * k, 0.42) + rough * 0.9; }
    }
    const dx = lx - H.at, r = Math.hypot(dx, z), R = H.r + rough * 2.2;
    if (r < R) {
      const k = r / R, drip = KL.hash2(Math.floor(lx / 0.75) + 7, Math.floor(z / 0.75) + 3), spike = k < 0.8 && drip > 0.93 ? (drip - 0.93) / 0.07 * 3.2 : 0;
      floor = Math.min(floor, deep + (KL.noise(lx * 0.12 + 3, z * 0.12 + 5) - 0.5) * 0.5);
      ceil = Math.max(ceil, deep + H.tall * Math.sqrt(1 - k * k) + rough * 1.6 - spike);
    }
    for (let i = 0; i < C.paths.length; i++) {
      const a = C.paths[i], cs = Math.cos(a), sn = Math.sin(a), along = dx * cs + z * sn, across = z * cs - dx * sn, last = P.from + P.len;
      if (along <= P.from - 2 || along >= last) continue;
      const half = P.half + rough * 0.6 - 1.3 * KL.smooth((along - (last - 3.5)) / 3.5), k = across / half;
      if (Math.abs(k) >= 1) continue;
      const f = deep + 1.7 * KL.smooth((along - (last - 4.5)) / 4.5), c = deep + P.tall * Math.pow(1 - k * k, 0.45) + rough * 0.7;
      if (c - f < 0.5) continue;
      floor = Math.min(floor, f); ceil = Math.max(ceil, c);
      if (along > last - 2.6) end = i + 1;
    }
    if (floor === Infinity) return false;
    const V = C.lava, lava = r < R - 1 && ((lx - V.at) / V.rx) ** 2 + ((z - V.z) / V.rz) ** 2 < 1, u = C.unit;
    CAVE_AIR.floor = Math.round(floor / u) * u - (lava ? u : 0); CAVE_AIR.ceil = Math.round(ceil / u) * u; CAVE_AIR.lava = lava; CAVE_AIR.end = end;
    return CAVE_AIR.ceil - CAVE_AIR.floor > 0.6;
  };
  // The same at any (x, z): the block's whose column it is in, so the air is exactly what the blocks leave.
  const caveAir = (x, z) => {
    const G = CAVE.grid, u = CAVE.unit, lx = x - CAVE.x, lz = z - CAVE.z;
    if (lx < G.x0 || lx >= G.x1 || lz < G.z0 || lz >= G.z1) return false;
    return caveShape(G.x0 + (Math.floor((lx - G.x0) / u) + 0.5) * u, G.z0 + (Math.floor((lz - G.z0) / u) + 0.5) * u);
  };
  /** Whether a body with its feet at `feet` stands in the cave's lava at (x, z). */
  const lavaAt = (x, z, feet) => caveNear(x, z) && caveAir(x, z) && CAVE_AIR.lava && feet < CAVE_AIR.floor + 0.6;

  // ---------- the columns ----------
  const MAX = 32, RAW = new Float64Array(MAX * 2), SOL = new Float64Array(MAX * 2), A = new Float64Array(MAX * 2), B = new Float64Array(MAX * 2);
  let nr = 0, ns = 0;
  const addAir = (b, t) => { if (t > b && nr < MAX) { RAW[nr * 2] = b; RAW[nr * 2 + 1] = t; nr++; } };
  const addSolid = (b, t) => { if (t > b && ns < MAX) { SOL[ns * 2] = b; SOL[ns * 2 + 1] = t; ns++; } };
  const finish = (out) => {
    for (let i = 1; i < nr; i++) {
      const b = RAW[i * 2], t = RAW[i * 2 + 1];
      let j = i - 1;
      while (j >= 0 && RAW[j * 2] > b) { RAW[(j + 1) * 2] = RAW[j * 2]; RAW[(j + 1) * 2 + 1] = RAW[j * 2 + 1]; j--; }
      RAW[(j + 1) * 2] = b; RAW[(j + 1) * 2 + 1] = t;
    }
    let n = 0;
    for (let i = 0; i < nr; i++) {
      const b = RAW[i * 2], t = RAW[i * 2 + 1];
      if (n && b <= A[n * 2 - 1] + 1e-6) A[n * 2 - 1] = Math.max(A[n * 2 - 1], t);
      else { A[n * 2] = b; A[n * 2 + 1] = t; n++; }
    }
    let src = A, dst = B;
    for (let s = 0; s < ns; s++) {
      const sb = SOL[s * 2], st = SOL[s * 2 + 1];
      let m = 0;
      for (let i = 0; i < n; i++) {
        const b = src[i * 2], t = src[i * 2 + 1];
        if (st <= b || sb >= t) { dst[m * 2] = b; dst[m * 2 + 1] = t; m++; continue; }
        if (sb > b && m < MAX) { dst[m * 2] = b; dst[m * 2 + 1] = sb; m++; }
        if (st < t && m < MAX) { dst[m * 2] = st; dst[m * 2 + 1] = t; m++; }
      }
      n = m;
      const swap = src; src = dst; dst = swap;
    }
    for (let i = 0; i < n * 2; i++) out[i] = src[i];
    return n;
  };
  const inRect = (x, z, x0, x1, z0, z1) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const towerNear = (x, z) => {
    const i = Math.round((x - 200) / TOWER_SPAN);
    if (i < 0 || i >= TOWERS.length) return null;
    const t = TOWERS[i], dx = x - t.x, dz = z - t.z;
    return dx * dx + dz * dz < (RO + 1.6) * (RO + 1.6) ? t : null;
  };
  const columns = (x, z, out, visual = false) => {
    nr = ns = 0;
    const t = towerNear(x, z);
    if (t) { towerColumn(t, x - t.x, z - t.z, visual); return finish(out); }
    if (caveNear(x, z)) { if (caveAir(x, z)) addAir(CAVE_AIR.floor, CAVE_AIR.ceil); return finish(out); }
    const dx = x - KC.x, dz = z - KC.z, r = Math.hypot(dx, dz);
    if (r < (visual ? R_EYE : R)) for (let i = 0; i < 4; i++) addAir(ROOMS[i].floor, ROOMS[i].ceil);
    // The top level: its room under its ceiling; its wall and its ceiling are the keep's own model (keep-models.js
    // `keep().top`), so to the voxels there are none, and to a body the wall stands but where an arch is open. Outside
    // the keep there is nothing.
    if (r < R) addAir(ROOF, visual ? SKY : LEVELS.roof.ceil);
    else if (r < RW) { if (visual) addAir(ROOF, SKY); else { const top = KL.arcadeTop(Math.atan2(dz, dx), r); if (top > 0) addAir(ROOF, ROOF + top); } }
    else if (visual) addAir(-60, SKY);
    // Outside the keep's wall the air is open all the way down: a body over the parapet falls (the scene hands it to
    // the yard as it drops below the deck).
    else if (x < TOWERS[0].x - TOWER_SPAN / 2) addAir(-60, SKY);
    // The bartizans out on the parapet stand in a flier's way over the top balcony's walkers; the keep's model draws them.
    if (!visual && r > R - 0.5) for (const a of KEEP.bartizans) if (Math.hypot(dx - Math.cos(a) * KEEP.bartizan, dz - Math.sin(a) * KEEP.bartizan) < KEEP.br + 0.2) addSolid(KEEP.bartizanFoot, SKY);
    // The balconies round the upper levels outside the wall, each a deck at its level's floor with its parapet round
    // its outer edge; the yard's model draws them (keep-models.js `balcony`).
    if (!visual && r >= RW && r < BAL.outer) for (let i = 0; i < BAL.floors.length; i++) {
      const f = BAL.floors[i];
      addSolid(f - BAL.deck, r >= BAL.outer - BAL.railW ? f + BAL.rail : f);
    }
    const u = aroundK(Math.atan2(dz, dx));
    // The floors open over the stair where it rises through them.
    if (r >= STAIR.r0 && r < R) for (const h of HOLES) if (u >= h.u0 && u < h.u1) addAir(h.from, h.to);
    // The alchemy room's and the armory's great arches, open through the wall from the room to the night.
    if (r >= R - 0.01 && r < RW) for (let i = 0; i < ARCADES.length; i++) {
      const top = KL.arcadeTop(Math.atan2(dz, dx), r, 0, ARCADES[i].arches);
      if (top > 0) addAir(ARCADES[i].floor, ARCADES[i].floor + top);
    }
    // The great door through the front of the wall.
    for (let i = 0; i < DOORS.length; i++) {
      const d = DOORS[i];
      if (z > d.at - 0.6 && z < KC.z + RW + 1.6) { const top = archTop(d.half, d.spring, x - d.mid); if (top > 0) addAir(d.floor, d.floor + top); }
    }
    if (visual) {
      // The lancets, open through the wall from the room's face to the night.
      if (r >= R - 0.01 && r < RW + 0.4) for (let i = 0; i < WINDOWS.length; i++) {
        const w = WINDOWS[i];
        let da = Math.atan2(dz, dx) - w.a; da -= Math.round(da / TAU) * TAU;
        const top = archTop(w.half, w.spring - w.sill, da * r);
        if (top > 0) addAir(w.floor + w.sill, w.floor + w.sill + top);
      }
      for (let i = 0; i < HEARTHS.length; i++) {
        const h = HEARTHS[i], into = (z - h.at) * h.into;
        if (into < IN && into > IN - h.depth && Math.abs(x - h.along) < h.half) addAir(h.floor, h.floor + h.top);
      }
    }
    // The stair: its steps, the parapet on their inner edge, and the railings round the floors' openings over it.
    if (r >= STAIR.r0 - U && r < R) {
      const tread = treadOf(u);
      if (tread !== null) {
        if (r >= STAIR.r0) addSolid(underOf(tread), tread);
        else if (tread - floorUnder(tread) > STAIR.open && !nearTop(tread)) addSolid(underOf(tread), tread + RAIL);
      }
      // Round an opening, except over its last steps, which come up to the floor.
      for (const h of HOLES) if (u >= h.u0 && u < h.u1 && (r < STAIR.r0 || (u - h.u0) * r < U) && !(tread !== null && h.to - tread < STAIR.top)) addSolid(h.to, h.to + RAIL);
    }
    for (let i = 0; i < STONES.length; i++) { const b = STONES[i]; if (inRect(x, z, b[0], b[1], b[2], b[3])) addSolid(b[4], b[5]); }
    for (let i = 0; i < SEGS.length; i++) { const sg = SEGS[i]; if ((sg[7] === "wall" || !visual) && segDist(x, z, sg) < sg[4]) addSolid(sg[5], sg[6]); }
    if (!visual) for (let i = 0; i < BOXES.length; i++) { const b = BOXES[i]; if (inRect(x, z, b[0], b[1], b[2], b[3])) addSolid(b[4], b[5]); }
    return finish(out);
  };
  // ---------- walking ----------
  const COL = new Float64Array(MAX * 2);
  /** The floor a body whose feet are at `feet` stands on at (x, z): the highest it can step onto, or -Infinity. */
  const supportAt = (x, z, feet) => {
    const n = columns(x, z, COL);
    let best = -Infinity;
    for (let i = 0; i < n; i++) { const b = COL[i * 2]; if (b <= feet + STEP && b > best && COL[i * 2 + 1] > b + 0.5) best = b; }
    return best;
  };
  /** The ceiling over feet at (x, z). */
  const ceilingAt = (x, z, feet) => {
    const n = columns(x, z, COL);
    for (let i = 0; i < n; i++) if (COL[i * 2] <= feet + STEP && COL[i * 2 + 1] > feet) return COL[i * 2 + 1];
    return feet;
  };
  // Whether a column has room for a body from `feet` to `feet + height`, rising no more than `rise` under it (`fly`:
  // wherever it is, not only on a floor). A body's edge stands over the stair ahead of its middle, so it may rise more
  // (`EDGE_RISE`) than the step its middle takes; a table is still in its way.
  const EDGE_RISE = STEP + 0.3;
  const roomFor = (x, z, feet, height, fly, rise) => {
    const n = columns(x, z, COL);
    for (let i = 0; i < n; i++) if (COL[i * 2] <= feet + (fly ? 0.02 : rise) && COL[i * 2 + 1] >= feet + height) return true;
    return false;
  };
  const RING = 8, RING_X = new Float64Array(RING), RING_Z = new Float64Array(RING);
  for (let k = 0; k < RING; k++) { RING_X[k] = Math.cos(k / RING * TAU); RING_Z[k] = Math.sin(k / RING * TAU); }
  /** Whether a body `r` across and `height` tall fits at (x, z) with its feet at `feet`. */
  const clearAt = (x, z, feet, r, height, fly = false) => {
    if (!roomFor(x, z, feet, height, fly, STEP)) return false;
    for (let k = 0; k < RING; k++) if (!roomFor(x + RING_X[k] * r, z + RING_Z[k] * r, feet, height, fly, EDGE_RISE)) return false;
    return true;
  };
  /** Whether (x, y, z) is open air, for the camera. */
  const airAt = (x, y, z) => {
    const n = columns(x, z, COL);
    for (let i = 0; i < n; i++) if (y > COL[i * 2] + 0.05 && y < COL[i * 2 + 1] - 0.05) return true;
    return false;
  };
  /** The room (or tower) a body with its feet at `feet` stands in at (x, z), or null. */
  const placeAt = (x, z, feet) => {
    const t = towerNear(x, z);
    if (t) return t;
    if (caveNear(x, z)) return CAVE;
    let best = null;
    for (let i = 0; i < ROOMS.length; i++) {
      const r = ROOMS[i];
      if (inRoom(r, x, z) && r.floor <= feet + 0.6 && (!best || r.floor > best.floor)) best = r;
    }
    return best;
  };
  // Where a traveller stands on arriving: through the great door, or inside a tower's door; and where each is left by.
  const ARRIVE = { x: 0, z: KC.z + R - 1.4, yaw: Math.PI };
  const towerArrive = (t) => ({ x: t.x, z: t.z + RI - 1.1, yaw: Math.PI });
  // Down from its gallery: on the stair's top step, just short of the landing, facing down the stair.
  const towerTopArrive = (t) => { const a = A0 - 0.6 * DT, r = (R_IN + RI) / 2; return { x: t.x + Math.cos(a) * r, y: t.top, z: t.z + Math.sin(a) * r, yaw: Math.atan2(Math.sin(a), -Math.cos(a)) }; };
  /** Which way out (the great door, a tower's door, `null`) a body at (x, z) has walked into. */
  const exitAt = (x, z, feet) => {
    const t = towerNear(x, z);
    // Into the doorway at the landing's end: on up into the tower's gallery in the yard, its stair coming up through
    // the gallery's floor.
    if (t && Math.abs(feet - t.top) < 0.5) {
      const dx = x - t.x, dz = z - t.z, r = Math.hypot(dx, dz), e = (around(Math.atan2(dz, dx)) - FLOOR_SECTOR) * r, tb = r - (R_IN + RI) / 2;
      if (Math.abs(tb) < LANDING_DOOR.half && e > -0.45 && e < LANDING_DOOR.deep) return `gallery-${t.i}`;
    }
    // Back out of the cave's mouth.
    if (caveNear(x, z)) return x - CAVE.x < 0.9 && feet < 2 ? "cave" : null;
    if (feet > 1) return null;
    if (t) return z - t.z > RO + 0.35 && Math.abs(x - t.x) < TOWER_DOOR.half ? `tower-${t.i}` : null;
    return z > KC.z + RW - 0.35 && Math.abs(x) < KEEP.door.half ? "door" : null;
  };

  BL.keepHallsLayout = { CAVE, caveNear, caveAir, CAVE_AIR, lavaAt, LEVEL_NAMES, TOWER_PROPS, U, T, STEP, RAIL, LEVELS, ROOF, SKY, K, OUT, KC, R, R_EYE, RW, STAIR, HOLES, ROOMS, ROOM, DOORS, STONES, SEGS, CELLS, WINDOWS, ARCADES, HEARTHS, PROPS, SIZE, BOXES, SEATS, FIRE_AT, HEARTH_AT, BREAST, TOWERS, TOWER_SPAN, RI, RO, R_IN, PER, DT, A0, DOOR_ANGLE, FLOOR_SECTOR, SLAB, DOME, TOWER_DOOR,
    ceilAt, inRoom, archTop, aroundK, treadOf, stairPart, around, columns, supportAt, ceilingAt, clearAt, airAt, placeAt, exitAt, ARRIVE, towerArrive, towerTopArrive, LANDING_DOOR };
})();
