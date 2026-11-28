// The Byzantine Keep's one layout, pure and loadable in Node: every dimension of the land a traveller crosses from
// the arrival islet to the gatehouse, the ground under it (`heightAt`, which the terrain is cut from), where a body may
// stand and fly (`supportAt`, `walkClear`, `flyClear`) and where its lanterns hang (`LANTERNS`). The frame: y 0 is the
// level the court, the decks and the yard are walked at, the castle stands toward -z and the islet toward +z, and +x is
// to the right of someone walking in.
//
// The way in, from +z: the `ISLET` with the ₿IFRÖST `ARCH` on it, its path down to the `DOCK`, where the ferry waits;
// the `FERRY`'s lane over the water to the `QUAY` at the foot of the castle island's sea cliff; the `STAIRS` up from the
// quay to the `COURT` where the two sentinels (`STATUES`) stand; the `ABUTMENT` reaching out into the moat; the
// drawbridge `LEAF`, hinged at the castle's sill; and the `GATE`'s passage, shut by its portcullis. The `CASTLE` stands
// on a battered stone plinth in the middle of the `MOAT`.
//
// A second gate opens through the west curtain (`WEST`) onto a stone bridge (`WEST_BRIDGE`) and its stair
// (`WEST_STAIR`) down to the `SHIPYARD`: a quay, piers, two `HALLS` on stilts, two longships and the `GALLEON` moored.
// A third, its mirror, opens through the east curtain onto the same bridge and stair turned about the castle's middle
// line, down to the `ARMORY`: a quay, two piers and two halls on stilts more, the swordsmith's forge and the alchemist's.
//
// Both islands stand in a sea at `SEA` (`ISLAND`, `coastDist`; `isletDist`). A jetpack flies anywhere over them: the
// castle's walls, towers, gatehouse and keep stand to their tops, and their air is closed to anyone flying in until the
// knights have met (`inWard`, `wardTop`). A full tank does not carry across the water: the ferry does.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};

  // The castle's middle; its curtain's outer faces `half` from it across and `halfZ` along, `wall` thick, their walk
  // `walk` up; the plinth it stands on, battered from `plinthFoot` beyond the curtain on the moat's bed in to
  // `plinthTop` at the walking level; a round tower at each corner and one midway along each side (`towers`, [x, z,
  // tall]); the keep inside, far back across the yard.
  // The castle's middle; its back stands 20 m further from the keep than its front does, room behind the keep before
  // the back gate. Its side towers stand at `midZ`, so the west and east gates stay midway along the front stretch.
  const CZ = -80.5;
  const CASTLE = { x: 0, z: CZ, half: 35, halfZ: 51.5, midZ: -70.5, wall: 2.5, walk: 12, plinthTop: 2.5, plinthFoot: 3.9, tower: 6.76, towerWalk: [21, 28] };
  CASTLE.towers = [[-1, 1, 0], [1, 1, 0], [-1, 0, 0], [1, 0, 0], [-1, -1, 1], [1, -1, 1]].map(([sx, sz, tall]) => [sx * CASTLE.half, sz ? CZ + sz * CASTLE.halfZ : CASTLE.midZ, tall]);
  // The side walls' two stretches, front (between the front and side towers) and back: each's middle and length.
  CASTLE.stretch = [{ mid: (CZ + CASTLE.halfZ + CASTLE.midZ) / 2, len: CZ + CASTLE.halfZ - CASTLE.midZ }, { mid: (CZ - CASTLE.halfZ + CASTLE.midZ) / 2, len: CASTLE.midZ - (CZ - CASTLE.halfZ) }];
  // The keep: one great round tower, `r` to its outer face, its great door in the front of it; a storey a level, its
  // second floor (the alchemy room) `upper` up, its third (the armory) `armory` up, and over them its top level `roof`
  // up: an open arcade `arcade` tall, great pointed arches (`arch`: `half` across, springing `spring` over the floor,
  // open down to it) through its wall at `arches` (none where the stair comes up inside), under one great spire `spire`
  // tall; a spired bartizan out on the wall at each of `bartizans` (angles round from +x toward +z), on the piers
  // between arches, `bartizan` out from its middle and `br` round. Its middle is `z`; keep-halls-layout.js has the same
  // tower from inside, about the point `front - 0.4` behind its door.
  const KEEP = { x: 0, front: -66.8, r: 18.6, wall: 1.8, roof: 36, upper: 12, armory: 24, arcade: 12, spire: 32, arch: { half: 3.4, spring: 3.6 },
    arches: [22.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((d) => d * Math.PI / 180), bartizans: [1, 3, 5, 7].map((k) => k * Math.PI / 4), bartizan: 19.3, br: 2.2 };
  KEEP.z = KEEP.front - KEEP.r;
  // The bartizans are corbelled out from `bartizanFoot` up, over the head of anyone on the top level's balcony, to
  // the tips of their spires at `bartizanTop`.
  KEEP.bartizanFoot = KEEP.roof + 4.1; KEEP.bartizanTop = KEEP.roof + 20.5;
  // The balconies round the outside of the keep's three upper levels, each a ring of stone at its level's floor
  // (`floors`), reaching `out` from the keep's face, its deck `deck` thick on corbels, its parapet `rail` high and
  // `railW` thick at its outer edge; a torch on a pier of the parapet at each of `torches` angles round it (`TORCHES`,
  // where each flame burns, [x, y, z, angle]).
  const BALCONY = { floors: [KEEP.upper, KEEP.armory, KEEP.roof], out: 3, deck: 0.56, rail: 1.12, railW: 0.38, torches: 12, pier: 0.75 };
  BALCONY.outer = KEEP.r + BALCONY.out;
  // A lantern hung on a short chain from under each balcony's deck at its edge, between each two torches (`HUNG`,
  // where each hangs from, [x, y, z]).
  const TORCHES = [], HUNG = [];
  for (const f of BALCONY.floors) for (let k = 0; k < BALCONY.torches; k++) {
    const a = k / BALCONY.torches * 2 * Math.PI, d = BALCONY.outer - 0.45;
    HUNG.push([KEEP.x + Math.cos(a) * d, f - BALCONY.deck, KEEP.z + Math.sin(a) * d]);
  }
  for (const f of BALCONY.floors) for (let k = 0; k < BALCONY.torches; k++) {
    const a = (k + 0.5) / BALCONY.torches * 2 * Math.PI, d = BALCONY.outer - BALCONY.railW / 2;
    TORCHES.push([KEEP.x + Math.cos(a) * d, f + BALCONY.rail + BALCONY.pier, KEEP.z + Math.sin(a) * d, a]);
  }
  /** A pointed opening's top `t` across from its middle: its jambs to the springing, then two arcs struck from the far
   *  jambs; -Infinity outside it. */
  const archTop = (half, spring, t) => { const a = Math.abs(t); return a >= half ? -Infinity : spring + Math.sqrt(4 * half * half - (a + half) * (a + half)); };
  const DEG = Math.PI / 180;
  // The levels open through the wall in the same great arches: the alchemy room's and the armory's wherever the stair
  // does not run up the wall behind them, and the top level's (`arches`), each `floor` up.
  KEEP.arcades = [
    { floor: KEEP.upper, arches: [22.5, 67.5, 112.5, 157.5, 202.5].map((d) => d * DEG) },
    { floor: KEEP.armory, arches: [112.5, 157.5, 202.5, 247.5, 292.5].map((d) => d * DEG) },
    { floor: KEEP.roof, arches: KEEP.arches }
  ];
  /** How high an arch of `arches` stands open over its floor at angle `a` round the keep, `d` out from its middle and
   *  `r` clear of its jambs, or -Infinity in a pier. */
  const arcadeTop = (a, d, r = 0, arches = KEEP.arches) => {
    for (let i = 0; i < arches.length; i++) {
      let da = a - arches[i]; da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
      const top = archTop(KEEP.arch.half - r, KEEP.arch.spring, da * d);
      if (top > 0) return top;
    }
    return -Infinity;
  };
  /** The open level whose storey a body with its feet at `y` is in, or null under the alchemy room. */
  const arcadeAt = (y) => {
    for (let i = KEEP.arcades.length - 1; i >= 0; i--) if (y >= KEEP.arcades[i].floor - 0.45) return y < KEEP.arcades[i].floor + KEEP.upper ? KEEP.arcades[i] : null;
    return null;
  };
  // Its door, `half` across with its arch springing `spring` up, and its lancets, the same from outside and in: each on
  // `floor`'s storey at angle `a`, its sill `sill` over that floor, springing `spring` over it, `half` across. The
  // lounge has six; the levels over it a ring of them where no arch is.
  KEEP.door = { half: 1.5, spring: 2.6 };
  const clearOfArches = (floor, a) => {
    const level = KEEP.arcades.find((l) => l.floor === floor);
    return !level || level.arches.every((b) => { let d = a - b; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; return Math.abs(d) * (KEEP.r - KEEP.wall) > KEEP.arch.half + 1.2; });
  };
  KEEP.windows = [
    ...[12, 36, 60, 300, 324, 348].map((d) => ({ floor: 0, a: d * DEG, sill: 2.4, spring: 7.4, half: 0.75 })),
    ...[KEEP.upper, KEEP.armory].flatMap((floor) => Array.from({ length: 16 }, (_, k) => ({ floor, a: (11.25 + k * 22.5) * DEG, sill: 2.2, spring: 7.0, half: 0.6 })))
  ].filter((w) => clearOfArches(w.floor, w.a));
  /** Whether a body `r` across, its feet at `y`, is in one of the keep's open levels at (x, z): inside its room, or in
   *  one of its arches. */
  const arcadeClear = (x, z, y, r = 0, c = KEEP) => {
    const level = arcadeAt(y);
    if (!level || y < level.floor - 1e-3 || y > level.floor + KEEP.arch.spring) return false;
    // Outpost Island's keep is open at its top level alone.
    if (c !== KEEP && level.floor !== KEEP.roof) return false;
    const d = Math.hypot(x - c.x, z - c.z);
    return d < KEEP.r - KEEP.wall - r || arcadeTop(Math.atan2(z - c.z, x - c.x), d, r, level.arches) > 0;
  };
  /** Whether a body `r` across stands within the keep's round at (x, z). */
  const inKeep = (x, z, r = 0, c = KEEP) => Math.hypot(x - c.x, z - c.z) < KEEP.r + 0.3 + r;
  // The moat: a rounded square round the castle, its bed and its water's level, and how steeply its bank falls.
  const MOAT = { half: 52, halfZ: 68.5, round: 14, bed: -4.5, water: -1.5, bank: 1.5 };
  // The gatehouse: `halfW` either side of the way in, from its `front` face back to `back`, `height` to its walk; its
  // passage `passage` either side, its arch springing at `spring`; the portcullis across it at `portcullis`.
  const GATE = { halfW: 7.5, front: -27.5, back: -37, height: 18, turretHeight: 25, passage: 2.2, spring: 3.2, portcullis: -31, turret: 3.2, turretX: 6.2, turretZ: -30.2 };
  // Each curtain tower's door, on the side of it the yard is: where it opens on the tower's face and the way it looks
  // out, and how wide it is.
  const TOWER_DOORS = CASTLE.towers.map(([x, z], i) => {
    const dz = z > CASTLE.midZ + 1 ? -1 : z < CASTLE.midZ - 1 ? 1 : 0, dx = x > 0 ? -1 : 1, d = Math.hypot(dx, dz);
    return { i, cx: x, cz: z, dx: dx / d, dz: dz / d, half: 1.1, frame: 1.6, front: CASTLE.tower + 0.8 };
  });
  // Each curtain tower's top floor, a cannon gallery: its floor the tower's walk (`floor`), a ring of wall `wall` thick
  // round it `height` tall, open over `open` either side of the way the tower looks out from the castle's middle
  // (`yaw`), a ceiling `ceil` thick over it carrying the spire; a cannon at the opening (`ahead` from the middle,
  // swinging `arc` either side, a quarter turn, its shot passing through its own tower's wall), and the head of the
  // tower's stair coming up through its floor at the back (`well`: `half` either side, `len` from the back wall in
  // toward the middle, rising `depth` in `steps`; walking down into its lowest `foot` goes down the tower's stair, and
  // one coming up it arrives `arrive` along it, looking out of the opening).
  const GALLERY = { wall: 0.75, height: 4.2, ceil: 0.56, open: 0.95, well: { half: 0.85, len: 3.6, depth: 2.7, steps: 6, foot: 0.6, arrive: 3.3, door: 2.4, rail: 0.3, railTall: 0.75 } };
  const GALLERIES = CASTLE.towers.map(([x, z, tall], i) => {
    const inner = CASTLE.tower - GALLERY.wall;
    return { i, x, z, floor: CASTLE.towerWalk[tall], top: CASTLE.towerWalk[tall], r: CASTLE.tower, inner, yaw: Math.atan2(x, z - CZ), ahead: inner - 1.5, arc: Math.PI / 2, gallery: true };
  });
  // The way round from gallery `g`'s opening of the point (x, z), -π to π.
  const galleryAngle = (g, x, z) => { let a = Math.atan2(x - g.x, z - g.z) - g.yaw; return Math.atan2(Math.sin(a), Math.cos(a)); };
  /** The gallery whose tower (x, z), grown by `r`, stands in with feet at `feet` between its floor and its ceiling,
   *  or null. */
  const galleryAt = (x, z, feet, r = 0) => {
    for (let i = 0; i < GALLERIES.length; i++) {
      const g = GALLERIES[i];
      if (feet >= g.floor - 0.6 && feet < g.floor + GALLERY.height - 0.4 && Math.hypot(x - g.x, z - g.z) < g.r + r) return g;
    }
    return null;
  };
  /** Whether a body `r` across, its feet at `feet`, may stand in gallery `g` at (x, z): inside its wall, or out on the
   *  opening's sill. */
  const galleryStand = (g, x, z, r) => {
    const d = Math.hypot(x - g.x, z - g.z);
    if (d + r <= g.inner) return true;
    return d + r * 0.5 <= g.r && Math.abs(galleryAngle(g, x, z)) < GALLERY.open - r / Math.max(d, 1);
  };
  /** Whether (x, y, z) is the open air of a gallery: inside its wall, or in its opening, between its floor and
   *  ceiling. */
  const galleryAir = (x, y, z) => {
    for (let i = 0; i < GALLERIES.length; i++) {
      const g = GALLERIES[i], d = Math.hypot(x - g.x, z - g.z);
      if (y < g.floor - GALLERY.well.depth || y > g.floor + GALLERY.height || d > g.r + 0.8) continue;
      if (y < g.floor) { const w = wellPlace(g, x, z); if (Math.abs(w.side) < GALLERY.well.half && w.s >= 0 && w.s <= GALLERY.well.len) return g; continue; }
      if (d < g.inner || Math.abs(galleryAngle(g, x, z)) < GALLERY.open) return g;
    }
    return null;
  };
  // How far along gallery `g`'s stair head (x, z) lies from its back end, and how far to its side.
  const WELL_AT = { s: 0, side: 0 };
  const wellPlace = (g, x, z) => {
    const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw), dx = x - g.x, dz = z - g.z;
    WELL_AT.s = dx * fx + dz * fz + g.inner; WELL_AT.side = dx * fz - dz * fx;
    return WELL_AT;
  };
  /** The top of the step of a gallery's stair head under (x, z), grown by `r` across it, with feet at `feet` below the
   *  gallery's floor, or null. */
  const wellAt = (x, z, feet, r = 0) => {
    const W = GALLERY.well;
    for (let i = 0; i < GALLERIES.length; i++) {
      const g = GALLERIES[i];
      if (feet < g.floor - W.depth - 0.6 || feet > g.floor + 0.6) continue;
      const w = wellPlace(g, x, z);
      if (Math.abs(w.side) + r > W.half || w.s < 0 || w.s > W.len) continue;
      return g.floor - W.depth + Math.min(W.steps, Math.floor(w.s / W.len * W.steps) + 1) * W.depth / W.steps;
    }
    return null;
  };
  /** The gallery whose stair head's foot, down the tower's stair, a body at (x, z) with its feet at `feet` has walked
   *  into. */
  const galleryExit = (x, z, feet) => {
    const W = GALLERY.well;
    for (let i = 0; i < GALLERIES.length; i++) {
      const g = GALLERIES[i];
      if (feet > g.floor - W.depth + W.depth / W.steps + 0.2 || feet < g.floor - W.depth - 0.4) continue;
      const w = wellPlace(g, x, z);
      if (Math.abs(w.side) < W.half && w.s >= 0 && w.s < W.foot) return g;
    }
    return null;
  };
  // The yard inside the curtain, and the keep's great door.
  const YARD = { half: CASTLE.half - CASTLE.wall - 0.3, halfZ: CASTLE.halfZ - CASTLE.wall - 0.3, door: { x: 0, z: KEEP.front } };
  // The drawbridge: hinged at the plinth's edge, `length` long out to the abutment, `halfW` either side; raised, it
  // stands `raised` radians up from level.
  const LEAF = { hinge: CZ + CASTLE.halfZ + CASTLE.plinthTop, length: 9.5, halfW: 2.2, raised: 1.25, thick: 0.28 };
  const ABUTMENT = { z0: LEAF.hinge + LEAF.length, z1: -11.5, halfW: 2.9, deck: 2.35 };
  const COURT = { x: 0, z: 1, r: 12 };
  // The sea round both islands.
  const SEA = -6;
  // The stair from the court down the sea cliff to the quay at the water's edge, where the ferry berths: `halfW` to its
  // parapets' outer faces, `deck` to their inner ones; two flights of `flight` treads `tread` deep with a landing
  // `landing` long between them, each tread `rise` under the one before, from the court's level at `z0` down to the
  // quay's at `SEA` + 0.7. The quay is `halfW` either side and `len` long.
  const STAIRS = { halfW: 2.35, deck: 1.85, z0: 12.5, tread: 0.55, flight: 13, landing: 2, quayY: SEA + 0.7 };
  STAIRS.rise = -STAIRS.quayY / (2 * STAIRS.flight);
  STAIRS.a1 = STAIRS.z0 + STAIRS.flight * STAIRS.tread;
  STAIRS.b0 = STAIRS.a1 + STAIRS.landing;
  STAIRS.b1 = STAIRS.b0 + STAIRS.flight * STAIRS.tread;
  const QUAY = { halfW: 3.4, z0: STAIRS.b1, z1: STAIRS.b1 + 6.2, y: STAIRS.quayY };
  // The arrival islet, near a minute and a half of rowing over the water from the quay: round about its middle, `r` to its shore, the
  // shore wandering by `wobble`; level for `plateau` round its middle, low hummocks beyond, its beach rising `beach` a
  // metre inland. A path runs down from the plateau to its dock, a timber pier out into the water at `y`.
  const ISLET = { x: 0, z: 308, r: 26, plateau: 12, wobble: 2.5, beach: 0.7 };
  const DOCK = { halfW: 1.3, z0: ISLET.z - 34.5, z1: ISLET.z - 22.5, y: SEA + 1.1 };
  const ISLET_PATH = { halfW: 1.8, z0: DOCK.z1, z1: ISLET.z - ISLET.plateau + 1 };
  // The way home: ₿IFRÖST's arch on the islet, facing the castle across the water, and where a traveller steps out of it.
  const ARCH = { x: 0, z: ISLET.z + 10.4, halfW: 1.8, plane: ISLET.z + 9.8 };
  const ARRIVE = { x: 0, z: ISLET.z + 3.6, yaw: Math.PI };
  // The ferry's lane: its berth beside the islet's dock and beside the quay, each the boat's middle with where its
  // passenger stands up (`walkAt`, on the deck beside the stern) and the deck's height; how fast the ferryman rows it
  // between them (`speed`, metres a second, `ease` seconds getting up to it and down from it), and how long it takes
  // him to turn the boat round at a berth (`turn`) pulling it `out` from the deck to do it.
  const FERRY = {
    islet: { x: DOCK.halfW + 1.0, z: DOCK.z0 + 5, deck: DOCK.y, walkX: DOCK.halfW - 0.65 },
    quay: { x: QUAY.halfW + 0.95, z: 31.6, deck: QUAY.y, walkX: QUAY.halfW - 1.2 },
    speed: 4.8, ease: 1.2, turn: 1.15, stern: -1.45,
    // Free roaming: where the hull meets the water, each point [across, along] in the boat's frame, and the least depth
    // under it.
    hull: [[0, 2.35], [0, -2.3], [0.86, 0], [-0.86, 0], [0.72, 1.3], [-0.72, 1.3], [0.74, -1.3], [-0.74, -1.3]], draft: 0.2
  };
  // The channel between the two docks: `half` either side of the line `x` down the water from the quay's foot (`z0`)
  // to the islet's dock (`z1`), the way the escorts keep pace along. Floating candles mark its edges, one every `every`
  // metres along each (`CANDLES`, [x, z]), from clear of the quay to clear of the dock; the rowboat may leave it, and
  // more candles mark the edge of the water it may not pass (`EDGE`, below).
  const LANE = { x: 3.3, half: 8, z0: QUAY.z0 - 2, z1: DOCK.z1, every: 10, hull: 2.45, steer: 0.9 };
  const inLane = (x, z) => Math.abs(x - LANE.x) <= LANE.half && z >= LANE.z0 && z <= LANE.z1;
  const CANDLES = [];
  {
    const a = QUAY.z1 + 3, b = DOCK.z0 - 2, n = Math.round((b - a) / LANE.every);
    for (let k = 0; k <= n; k++) for (const sx of [-1, 1]) CANDLES.push([LANE.x + sx * LANE.half, a + (b - a) * k / n]);
  }
  // ---------- the west gate, the bridge and the shipyard ----------
  // The west gate: an arch through the curtain's west wall midway between two of its towers (`z`), `half` either side,
  // its head two arcs springing `spring` up, each struck from `centre` past its middle (`westArchTop`); a portcullis
  // across it in the middle of the wall's thickness (`bars`), drawn `lift` up with the main gate's once the knights
  // have met.
  const WEST = { z: CASTLE.stretch[0].mid, half: 5, spring: 1, centre: 1.5, bars: -(CASTLE.half - CASTLE.wall / 2), lift: 4.4 };
  // The east gate is the west's mirror across the castle's middle line, at the same `z`, its portcullis at `-bars`:
  // every way out of it (the bridge, its stair) is answered by folding x onto the west's (`fold`).
  const fold = (x) => -Math.abs(x);
  /** The west gate's opening `t` across from its middle: how high it stands open, -Infinity in its jambs. */
  const westArchTop = (t) => { const a = Math.abs(t), R = WEST.half + WEST.centre; return a >= WEST.half ? -Infinity : WEST.spring + Math.sqrt(R * R - (a + WEST.centre) * (a + WEST.centre)); };
  // The bridge out of it, west along `z` from the curtain's face (`x0`) to its far abutment (`x1`): a walkway `half`
  // either side between parapets `rail` high whose outer faces stand `halfW` out; its deck level with the yard over the
  // plinth's ledge, rising from `ramp0` to `y` up at `ramp1` and level from there on, `thick` over its arches' crowns.
  // It stands on `piers` (their middles, each `pier` either way along it) between two solid `ends`, a pointed arch
  // over every gap between them (`spans`: from `e` to `w`, `half` across about `mid`, springing at `spring`); and at
  // each of `pillars` a pillar either side of the way, `pillarR` square about `pillarZ` out from its middle, rising
  // from the ground to `pillar` over the parapet, a cresset burning on its head (`cressets`, [x, y, z]).
  const WEST_BRIDGE = { z: WEST.z, half: 5, halfW: 5.7, rail: 1.1, thick: 0.9, x0: -CASTLE.half, ramp0: -(CASTLE.half + CASTLE.plinthTop), ramp1: -57.5, y: 5, x1: -110,
    piers: [-49, -61, -73, -85, -97], pier: 1.5, ends: [-40, -107.5], pillar: 5, pillarZ: 6, pillarR: 0.9, spans: [], cressets: [] };
  WEST_BRIDGE.pillars = [-38.75, ...WEST_BRIDGE.piers, -108.75];
  /** The bridge's deck at `x` along it. */
  const bridgeY = (x) => { const B = WEST_BRIDGE; return x >= B.ramp0 ? 0 : x <= B.ramp1 ? B.y : B.y * (B.ramp0 - x) / (B.ramp0 - B.ramp1); };
  {
    const B = WEST_BRIDGE, faces = [B.ends[0], ...B.piers.flatMap((p) => [p + B.pier, p - B.pier]), B.ends[1]];
    for (let i = 0; i < faces.length; i += 2) { const e = faces[i], w = faces[i + 1], half = (e - w) / 2; B.spans.push({ e, w, mid: (e + w) / 2, half, spring: bridgeY(e) - B.thick - half * Math.sqrt(3) }); }
    for (const x of B.pillars) for (const s of [-1, 1]) B.cressets.push([x, bridgeY(x) + B.rail + B.pillar, B.z + s * B.pillarZ]);
  }
  /** The underside of the bridge at `x`: an arch's soffit, or -Infinity in a pier or an end. */
  const bridgeSoffit = (x) => {
    const spans = WEST_BRIDGE.spans;
    for (let i = 0; i < spans.length; i++) { const s = spans[i]; if (x < s.e && x > s.w) return archTop(s.half, s.spring, x - s.mid); }
    return -Infinity;
  };
  // The stair from its west end down to the shipyard's quay: three flights (`flights`, treads each) of treads `tread`
  // deep with a landing `landing` long between them, every tread `rise` under the one before, from `x0` to `x1`.
  const WEST_STAIR = { x0: WEST_BRIDGE.x1, tread: 0.45, flights: [15, 15, 14], landing: 2.4 };
  WEST_STAIR.treads = WEST_STAIR.flights.reduce((a, b) => a + b, 0);
  WEST_STAIR.rise = (WEST_BRIDGE.y - DOCK.y) / WEST_STAIR.treads;
  WEST_STAIR.x1 = WEST_STAIR.x0 - WEST_STAIR.treads * WEST_STAIR.tread - (WEST_STAIR.flights.length - 1) * WEST_STAIR.landing;
  /** The stair's tread at `x` along it. */
  const westStairY = (x) => {
    const S = WEST_STAIR;
    let u = S.x0 - x, k = 0;
    for (let i = 0; i < S.flights.length; i++) {
      const len = S.flights[i] * S.tread;
      if (u < len) return WEST_BRIDGE.y - (k + Math.floor(u / S.tread) + 1) * S.rise;
      k += S.flights[i]; u -= len;
      if (u < S.landing) return WEST_BRIDGE.y - k * S.rise;
      u -= S.landing;
    }
    return DOCK.y;
  };
  /** The way's deck at `x`, from the gate to the stair's foot: the bridge, then the stair. */
  const wayY = (x) => x >= WEST_BRIDGE.x1 ? bridgeY(x) : westStairY(x);
  // ---------- the back gate, the high bridge and the arena ----------
  // A third gate opens through the middle of the back curtain (`BACK`: `half` either side of x 0, its head the west
  // gate's, its portcullis `bars` in the wall's thickness, drawn up with the others). Out of it a way runs north along
  // x 0 (`BACK_BRIDGE`, from the wall's face `z0` to `z1`): level over the plinth's ledge and the moat, climbing over
  // the island's back as a causeway, then the high bridge itself, a hundred metres over the sea from the shore
  // (`shore`) to the arena: its deck (`profile`, [z, y] it runs straight between) rising to `peak` over one great
  // pointed arch broad and tall enough for the galleon's hull to sail through, two lesser arches either side of it,
  // and falling to the arena's floor. Built as the west bridge is: `spans` (from `e`, the end nearer the castle, to
  // `w`), solid between them, a pillar either side at each of `pillars` with a cresset on its head (`cressets`).
  const BACK = { half: WEST.half, bars: CZ - CASTLE.halfZ + CASTLE.wall / 2 };
  // The arena (`ARENA_ISLE`): a round stack of rock `r` across its radius (the arrival islet's), its near edge where the
  // high bridge comes down, its floor `y` up, sheer to the sea all round; `floor` the radius of its sanded ring.
  // Round it stand `columns` stone columns with a bonfire burning on each (`ARENA_COLUMNS`, [x, z, base]), `column` m
  // in from its edge, none where the bridge comes in.
  const ARENA_ISLE = { x: 0, z: -300, r: 26, y: 12, floor: 21, columns: 12, column: 2.4 };
  const BACK_BRIDGE = { x: 0, half: 5, halfW: 5.7, rail: 1.1, thick: 0.9, z0: CZ - CASTLE.halfZ, z1: ARENA_ISLE.z + ARENA_ISLE.r - 3, shore: -178, peak: 24.5,
    profile: [[CZ - CASTLE.halfZ, 0], [-150, 0], [-164, 5.5], [-211, 24.5], [-237, 24.5], [-272, ARENA_ISLE.y], [-290, ARENA_ISLE.y]],
    arches: [[-136, -148], [-178, -191], [-194, -207], [-211, -237], [-241, -254], [-257, -270]],
    pillars: [-134.2, -149.8, -176.5, -192.5, -209, -239, -255.5, -271.5], pillar: 5, pillarZ: 6, pillarR: 0.9, spans: [], cressets: [] };
  // An arched bridge like the back way, `B`, along `z` from `z0` down to `z1`, `x` its middle line: its deck by its
  // `profile` ([z, y] points), pointed `arches` ([e, w] pairs) under it, `pillars` along it either side with a cresset
  // on each, parapets `rail` high whose outer faces stand `halfW` out. The back way is one; Outpost Island's four are
  // another, in their own frames (`OUTPOST.bridge`).
  /** Its deck at `z` along it. */
  const spanY = (B, z) => {
    const P = B.profile;
    if (z >= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (z >= P[i][0]) return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (P[i - 1][0] - z) / (P[i - 1][0] - P[i][0]);
    return P[P.length - 1][1];
  };
  /** Its arches' spans, worked out from its profile, and a cresset on each pillar. */
  const spanInit = (B) => {
    for (const [e, w] of B.arches) { const half = (e - w) / 2; B.spans.push({ e, w, mid: (e + w) / 2, half, spring: Math.min(spanY(B, e), spanY(B, w)) - B.thick - half * Math.sqrt(3) }); }
    for (const z of B.pillars) for (const s of [-1, 1]) B.cressets.push([B.x + s * B.pillarZ, spanY(B, z) + B.rail + B.pillar, z]);
  };
  /** Its underside at `z`: an arch's soffit, or -Infinity where it is solid. */
  const spanSoffit = (B, z) => {
    const spans = B.spans;
    for (let i = 0; i < spans.length; i++) { const s = spans[i]; if (z < s.e && z > s.w) return archTop(s.half, s.spring, z - s.mid); }
    return -Infinity;
  };
  /** Whether (x, z), grown by `pad`, lies on or beside it. */
  const spanAt = (B, x, z, pad = 0) => z <= B.z0 + pad && z >= B.z1 - pad && Math.abs(x - B.x) <= B.pillarZ + B.pillarR + pad;
  /** The top of its parapet at (x, z) grown by `r`, or of a pillar standing there, or null off both. */
  const spanRail = (B, x, z, r = 0) => {
    const dx = Math.abs(x - B.x);
    if (z > B.z0 + r || z < B.z1 - r || dx < B.half - r || dx > B.pillarZ + B.pillarR + r) return null;
    if (dx >= B.pillarZ - B.pillarR - r) for (let i = 0; i < B.pillars.length; i++) if (Math.abs(z - B.pillars[i]) <= B.pillarR + r) return spanY(B, B.pillars[i]) + B.rail + B.pillar;
    return dx <= B.halfW + r ? spanY(B, z) + B.rail : null;
  };
  /** What it gives feet at `feet` to stand on: its deck or a parapet's top from above, null under it or off it. */
  const spanSupport = (B, x, z, feet) => {
    const dx = Math.abs(x - B.x);
    if (z > B.z0 || z < B.z1 || dx > B.pillarZ + B.pillarR) return null;
    const rail = spanRail(B, x, z);
    if (rail !== null && feet >= rail - STEP) return rail;
    if (dx > B.halfW) return null;
    const deck = spanY(B, z);
    return feet >= deck - STEP ? deck : null;
  };
  /** A step on foot to (x, z), as it sees it: 1 along its deck, -1 into its stone, 0 where it has no say. */
  const spanWalk = (B, x, z, feet, r) => {
    const dx = Math.abs(x - B.x);
    if (z > B.z0 + r || z < B.z1 - r || dx > B.pillarZ + B.pillarR + r) return 0;
    const deck = spanY(B, z), rail = spanRail(B, x, z, r);
    if (feet > deck - B.thick) {
      if (rail !== null && rail > feet + STEP) return -1;
      if (dx > B.halfW) return 0;
      const g = rail !== null ? rail : deck;
      return g <= feet + STEP && g >= feet - DROP ? 1 : -1;
    }
    if (rail !== null && rail > deck + B.rail + 1) return -1;
    if (dx > B.halfW + r) return 0;
    return Math.min(spanSoffit(B, z - r), spanSoffit(B, z), spanSoffit(B, z + r)) < feet + 2 ? -1 : 0;
  };
  /** Whether a body in the air at `y` meets it at (x, z). */
  const spanFly = (B, x, z, y, r) => {
    const dx = Math.abs(x - B.x);
    if (z > B.z0 + r || z < B.z1 - r || dx > B.pillarZ + B.pillarR + r) return false;
    const deck = spanY(B, z), rail = spanRail(B, x, z, r);
    if (rail !== null && rail > deck + B.rail + 1) return y < rail - 1e-3;
    if (dx > B.halfW + r) return false;
    if (y >= deck - 1e-3) return rail !== null && y < rail - 1e-3;
    return y + HEAD > Math.min(spanSoffit(B, z - r), spanSoffit(B, z), spanSoffit(B, z + r));
  };
  /** Whether the point (x, y, z) lies in its stone. */
  const spanHit = (B, x, y, z) => z <= B.z0 && z >= B.z1 && Math.abs(x - B.x) <= B.halfW && y <= spanY(B, z) && y >= spanSoffit(B, z);
  /** Whether a hull may not lie at (x, z), grown by `pad`: a pier, a pillar or the solid causeway; its arches are open. */
  const spanFoul = (B, x, z, pad) => spanAt(B, x, z, pad) && Math.min(spanSoffit(B, z - pad), spanSoffit(B, z), spanSoffit(B, z + pad)) === -Infinity;
  // The back way's own.
  const backY = (z) => spanY(BACK_BRIDGE, z);
  spanInit(BACK_BRIDGE);
  const backSoffit = (z) => spanSoffit(BACK_BRIDGE, z);
  const backAt = (x, z, pad = 0) => spanAt(BACK_BRIDGE, x, z, pad);
  const backSupport = (x, z, feet) => spanSupport(BACK_BRIDGE, x, z, feet);
  const backWalk = (x, z, feet, r) => spanWalk(BACK_BRIDGE, x, z, feet, r);
  const backFly = (x, z, y, r) => spanFly(BACK_BRIDGE, x, z, y, r);
  const backHit = (x, y, z) => spanHit(BACK_BRIDGE, x, y, z);
  const backFoul = (x, z, pad) => spanFoul(BACK_BRIDGE, x, z, pad);
  /** The arena's rock at (x, z): its floor, sheer down to the sea bed at its rim. */
  const arenaDist = (x, z) => ARENA_ISLE.r - Math.hypot(x - ARENA_ISLE.x, z - ARENA_ISLE.z);
  const arenaHeight = (x, z) => { const d = arenaDist(x, z); return d < -12 ? -Infinity : d >= 1.5 ? ARENA_ISLE.y : d >= 0 ? SEA + 0.4 + (ARENA_ISLE.y - SEA - 0.4) * d / 1.5 : SEA + 0.4 + d * 1.6; };
  // Who keeps the arena, each a post on its floor facing the bridge: an ogre and a red troll toward its back, two
  // green skeletons in a ring and five white ones round them.
  const ARENA_FOES = { ogres: [], trolls: [], greens: [], skeletons: [] };
  {
    const A = ARENA_ISLE, at = (list, n, r, turn) => { for (let i = 0; i < n; i++) { const a = turn + i / n * Math.PI * 2; list.push({ x: A.x + Math.cos(a) * r, z: A.z + Math.sin(a) * r, y: A.y, yaw: 0 }); } };
    ARENA_FOES.ogres.push({ x: A.x - 6, z: A.z - 12, y: A.y, yaw: 0 }); ARENA_FOES.trolls.push({ x: A.x + 12, z: A.z - 6, y: A.y, yaw: 0 });
    at(ARENA_FOES.greens, 2, 7, Math.PI / 4); at(ARENA_FOES.skeletons, 5, 16, Math.PI / 10);
  }
  // The shipyard at the stair's foot, all of it `y` over the water: a stone `quay` running north and south across the
  // stair's foot; oak `piers` off it (the longships' pier out to the west, a short one at each end to a hall); the
  // `slip`, a timber stage off its east side where a longship's ribs stand half built; a timber `ramp` up along its
  // west edge (from `z0` at the quay's level to `z1` at the galleon's deck) and the `brow` from the ramp's head across
  // to the galleon; a plank from the longships' pier onto each longship (`planks`); and its dressing (`props`: each a
  // kind keep-models.js builds, where it stands, how it is turned and how far it stands in a walker's way).
  const SHIPYARD = { y: DOCK.y, area: -116, quay: { x0: -146, x1: WEST_STAIR.x1, z0: -100, z1: 0 },
    piers: [{ x0: -180, x1: -146, z0: -81.6, z1: -78.4 }, { x0: -142.5, x1: -138.5, z0: 0, z1: 4 }, { x0: -142.5, x1: -138.5, z0: -104, z1: -100 }],
    slip: { x0: WEST_STAIR.x1, x1: -121, z0: -94, z1: -82 },
    ramp: { x0: -146, x1: -144.4, z0: -48.5, z1: -36.5 }, brow: { x0: -148.2, x1: -144.4, z0: -36.5, z1: -34 },
    planks: [{ x0: -166.5, x1: -163.5, z0: -78.4, z1: -77.3 }, { x0: -166.5, x1: -163.5, z0: -82.7, z1: -81.6 }],
    props: [
      { k: "crane", x: -143.4, z: -27, ry: -Math.PI / 2, r: 1.0 }, { k: "lumber", x: -138.4, z: -66, ry: 0, r: 1.4 }, { k: "lumber", x: -138.4, z: -71, ry: 0, r: 1.4 },
      { k: "crates", x: -136.8, z: -9, ry: 0.3, r: 1.2 }, { k: "crates", x: -144.4, z: -93, ry: -0.5, r: 1.2 }, { k: "casks", x: -136.8, z: -15, ry: 0, r: 1.0 }, { k: "casks", x: -144.6, z: -66, ry: 1.2, r: 1.0 },
      { k: "coil", x: -145.2, z: -12, ry: 0, r: 0 }, { k: "coil", x: -145.2, z: -57, ry: 0, r: 0 }, { k: "coil", x: -150, z: -79.2, ry: 0, r: 0 }, { k: "coil", x: -172, z: -80.8, ry: 0, r: 0 },
      { k: "ribs", x: -128, z: -88, ry: Math.PI / 2, r: 0 }
    ] };
  // The two halls on stilts off the quay's ends, the mead hall to the north and the shipwright's to the south: each a
  // timber longhouse from (`x0`, `z0`) to (`x1`, `z1`), its ridge along x, standing on a `deck` wider than itself, its
  // door in the middle of the side toward the quay (`door`: -1 its `z0` side, 1 its `z1`). `HALL`: its walls `wall`
  // thick and `eaves` tall, the ridge `ridge` over them, the roof reaching `over` out past the walls, the door `door`
  // either side of its middle.
  const HALL = { wall: 0.45, eaves: 3.6, ridge: 5.2, over: 0.9, door: 1.2, doorTall: 2.7 };
  const HALLS = [
    { id: "mead", name: "The Mead Hall", x0: -149, x1: -132, z0: 6, z1: 18, door: -1, deck: { x0: -151, x1: -130, z0: 4, z1: 20 } },
    { id: "wright", name: "The Shipwright's Hall", x0: -149, x1: -132, z0: -118, z1: -106, door: 1, deck: { x0: -151, x1: -130, z0: -120, z1: -104 } }
  ];
  // What stands in them (`inside`, as `SHIPYARD.props`) and where a body sits (`SEATS`, as the keep's halls': the
  // seat's place and height, the floor under it, the way its sitter faces and where they stand up).
  const SEATS = [], BLOCKS_WEST = [];
  {
    const y = SHIPYARD.y, seat = (x, z, ry, wx, wz, up = 0.5) => SEATS.push({ x, z, y: y + up, floor: y, ry, walk: { x: wx, z: wz } });
    HALLS[0].inside = [
      { k: "bar", x: -142.5, z: 15.5, ry: 0, r: 0 }, { k: "keg", x: -147.3, z: 17, ry: 0, r: 0 }, { k: "keg", x: -146.3, z: 17, ry: 0, r: 0 }, { k: "keg", x: -145.3, z: 17, ry: 0, r: 0 },
      { k: "barrels", x: -138.6, z: 16.9, ry: Math.PI / 2, r: 0 }, { k: "longTable", x: -145.5, z: 9.5, ry: 0, r: 0 }, { k: "hearth", x: -135.8, z: 12, ry: 0, r: 1.0 },
      { k: "settle", x: -137.7, z: 12, ry: Math.PI / 2, r: 0 }, { k: "chandelier", x: -140.5, z: 12, ry: 0, r: 0, up: 3.3 }
    ];
    for (let x = -147; x <= -138; x += 1) BLOCKS_WEST.push([x, 15.5, 0.55]);
    for (let x = -147; x <= -144; x += 1) BLOCKS_WEST.push([x, 9.5, 0.55]);
    for (const x of [-146.5, -145.3, -144.1]) { seat(x, 14.35, 0, x, 13.45, 0.62); HALLS[0].inside.push({ k: "stool", x, z: 14.35, ry: 0, r: 0 }); }
    for (const x of [-146.7, -145.5, -144.3]) { seat(x, 8.55, 0, x, 7.6); seat(x, 10.45, Math.PI, x, 11.4); }
    for (const z of [11.3, 12.7]) seat(-137.7, z, Math.PI / 2, -138.6, z);
    HALLS[1].inside = [
      { k: "workTable", x: -144, z: -116.6, ry: 0, r: 0 }, { k: "workTable", x: -136.4, z: -112, ry: Math.PI / 2, r: 0 }, { k: "anvil", x: -147.2, z: -112.4, ry: 0, r: 0.6 },
      { k: "grindstone", x: -147.2, z: -109.6, ry: 0, r: 0.6 }, { k: "planks", x: -133.3, z: -116.2, ry: -Math.PI / 2, r: 1.1 }, { k: "half", x: -140.2, z: -112, ry: Math.PI / 2, r: 0, scale: 0.28 },
      { k: "settle", x: -145.6, z: -107.1, ry: Math.PI, r: 0 }, { k: "chandelier", x: -140.5, z: -112, ry: 0, r: 0, up: 3.3 }
    ];
    for (const x of [-145, -144, -143]) BLOCKS_WEST.push([x, -116.6, 0.6]);
    for (const z of [-113, -112, -111]) BLOCKS_WEST.push([-136.4, z, 0.6]);
    for (const x of [-141.4, -140.2, -139]) BLOCKS_WEST.push([x, -112, 0.55]);
    for (const x of [-146.3, -144.9]) seat(x, -107.1, Math.PI, x, -108);
    for (const p of [...SHIPYARD.props, ...HALLS[0].inside, ...HALLS[1].inside]) if (p.r > 0) BLOCKS_WEST.push([p.x, p.z, p.r]);
    for (const x of [-132, -129.6, -127.2, -124.8]) BLOCKS_WEST.push([x, -88, 1.2]);
  }
  // The Armory & Forge at the east stair's foot, the shipyard's counterpart and as high over the water: a stone `quay`
  // running north and south across the stair's foot, a short oak pier off each end to a hall (`piers`), and its
  // dressing on the quay (`props`, as the shipyard's). It is named from `area` out.
  const ARMORY = { y: DOCK.y, area: 116, quay: { x0: -WEST_STAIR.x1, x1: 146, z0: -80, z1: -20 },
    piers: [{ x0: 138.5, x1: 142.5, z0: -20, z1: -16 }, { x0: 138.5, x1: 142.5, z0: -84, z1: -80 }],
    // A plank off the quay's seaward face onto the small longship moored along it (`SHIPS`).
    planks: [{ x0: 146, x1: 147.1, z0: -43.5, z1: -40.5 }],
    props: [
      { k: "weaponRack", index: 0, x: 145.2, z: -60, ry: -Math.PI / 2, r: 0 }, { k: "shieldStand", x: 145.2, z: -66, ry: -Math.PI / 2, r: 0 }, { k: "weaponRack", index: 2, x: 145.2, z: -36, ry: -Math.PI / 2, r: 0 },
      { k: "armour", x: 145.0, z: -52.2, ry: -Math.PI / 2, r: 0.5 }, { k: "armour", x: 145.0, z: -47.3, ry: -Math.PI / 2, r: 0.5 }, { k: "armsTable", x: 144.4, z: -29, ry: Math.PI / 2, r: 0 },
      { k: "crates", x: 136.6, z: -24, ry: 0.4, r: 1.2 }, { k: "crates", x: 144.4, z: -76, ry: -0.3, r: 1.2 }, { k: "casks", x: 136.8, z: -75, ry: 0.6, r: 1.0 }, { k: "casks", x: 144.6, z: -41.5, ry: 0, r: 1.0 },
      { k: "grindstone", x: 137.4, z: -67, ry: 0, r: 0.6 }, { k: "anvil", x: 137.4, z: -33, ry: 0.5, r: 0.6 }, { k: "coal", x: 144.6, z: -71.5, ry: 0, r: 0.8 }
    ] };
  // Aras-Son's stall (keep-halls-models.js `merchant`) on the quay's seaward edge south of the stair's foot, its counter
  // toward the stair: where it stands, which way its counter faces, where a buyer stands before it, how near they must
  // be to trade and how big the knight inside it is.
  // A rowboat's berth along the quay's seaward face south of the stair's foot, clear of the longship moored to the
  // north, its bow to the north.
  FERRY.armory = { x: ARMORY.quay.x1 + 1.15, z: -66, deck: ARMORY.y, walkX: ARMORY.quay.x1 - 1.2, side: 1 };
  // And one along the shipyard's quay's seaward face, south of the great longship's pier, its bow to the north.
  FERRY.shipyard = { x: SHIPYARD.quay.x0 - 1.15, z: -97, deck: SHIPYARD.y, walkX: SHIPYARD.quay.x0 + 1.2, side: -1 };
  ARMORY.merchant = { x: 144.1, z: -56.3, turn: -Math.PI / 2, reach: 2.6, front: 2.6, knight: 0.6 };
  ARMORY.merchant.at = { x: ARMORY.merchant.x + Math.sin(ARMORY.merchant.turn) * ARMORY.merchant.front, z: ARMORY.merchant.z + Math.cos(ARMORY.merchant.turn) * ARMORY.merchant.front };
  ARMORY.props.push({ k: "merchant", x: ARMORY.merchant.x, z: ARMORY.merchant.z, ry: ARMORY.merchant.turn, r: 0 });
  // Its two halls, longhouses as the shipyard's: the swordsmith's forge to the north and the alchemist's to the south,
  // their doors toward the quay; each `sign` the board hung over its door (keep-models.js `yardProp`).
  HALLS[0].sign = "signMead"; HALLS[1].sign = "signWright";
  HALLS.push(
    { id: "forge", name: "The Swordsmith's Forge", sign: "signForge", x0: 132, x1: 149, z0: -14, z1: -2, door: -1, deck: { x0: 130, x1: 151, z0: -16, z1: 0 } },
    { id: "magic", name: "Alchemy & Magic", sign: "signMagic", x0: 132, x1: 149, z0: -98, z1: -86, door: 1, deck: { x0: 130, x1: 151, z0: -100, z1: -84 } });
  for (const h of HALLS) { h.dx = (h.x0 + h.x1) / 2; h.mz = (h.z0 + h.z1) / 2; }
  // What stands in them, kept off each doorway: the forge's furnace against its back wall with its bellows and coal,
  // the anvil before it, a quench trough, a grindstone, racks of swords, a stand of shields and a table of arms; the
  // alchemist's great cauldron of green brew and a smaller one, shelves of bottles, a bookcase, a bench of glassware,
  // a lectern with its spellbook, a cluster of crystals, herbs hung to dry and a stand of candles.
  const BLOCKS_EAST = [];
  {
    HALLS[2].inside = [
      { k: "furnace", x: 144.5, z: -3.25, ry: Math.PI, r: 0 }, { k: "bellows", x: 146.75, z: -3.4, ry: Math.PI, r: 0.5 }, { k: "coal", x: 147.6, z: -6.0, ry: 0.4, r: 0.7 },
      { k: "anvil", x: 143.8, z: -6.4, ry: 0, r: 0.6 }, { k: "quench", x: 147.6, z: -9.6, ry: Math.PI / 2, r: 0 }, { k: "grindstone", x: 134.2, z: -4.0, ry: Math.PI / 2, r: 0.6 },
      { k: "weaponRack", index: 0, x: 133.0, z: -7.8, ry: Math.PI / 2, r: 0 }, { k: "weaponRack", index: 1, x: 133.0, z: -11.2, ry: Math.PI / 2, r: 0 },
      { k: "shieldStand", x: 137.6, z: -2.9, ry: Math.PI, r: 0 }, { k: "armsTable", x: 138.2, z: -7.2, ry: 0, r: 0 }, { k: "chandelier", x: 140.5, z: -8, ry: 0, r: 0, up: 3.3 }
    ];
    for (const x of [143.6, 145.4]) BLOCKS_EAST.push([x, -3.3, 0.95]);
    for (const z of [-10.2, -9.0]) BLOCKS_EAST.push([147.6, z, 0.5]);
    for (const z of [-11.9, -11.2, -10.5, -8.5, -7.8, -7.1]) BLOCKS_EAST.push([133.1, z, 0.45]);
    for (const x of [136.6, 137.6, 138.6]) BLOCKS_EAST.push([x, -2.9, 0.4], [x + 0.6, -7.2, 0.75]);
    HALLS[3].inside = [
      { k: "cauldron", fire: true, x: 140.5, z: -93.6, ry: 0, r: 0.85 }, { k: "cauldron", fire: true, x: 145.6, z: -95.4, ry: 0.6, r: 0.7 },
      { k: "shelf", x: 136.0, z: -97.3, ry: 0, r: 0 }, { k: "shelf", x: 145.4, z: -97.3, ry: 0, r: 0 }, { k: "bookcase", x: 148.1, z: -91.6, ry: -Math.PI / 2, r: 0 },
      { k: "labBench", x: 133.2, z: -92.4, ry: 0, r: 0 }, { k: "lectern", x: 137.2, z: -90.6, ry: 0.5, r: 0.45 }, { k: "crystals", x: 146.4, z: -88.9, ry: 0.3, r: 0.6 },
      { k: "herbs", x: 140.5, z: -96.9, ry: 0, r: 0, up: 2.5 }, { k: "candles", x: 144.0, z: -89.6, ry: 0, r: 0.3 }, { k: "chandelier", x: 140.5, z: -91.2, ry: 0, r: 0, up: 3.3 }
    ];
    for (const x of [135, 136, 137, 144.4, 145.4, 146.4]) BLOCKS_EAST.push([x, -97.25, 0.4]);
    for (const z of [-93.1, -92.1, -91.1, -90.1]) BLOCKS_EAST.push([148.1, z, 0.45]);
    for (const z of [-94.4, -93.2, -92.0, -90.8]) BLOCKS_EAST.push([133.2, z, 0.6]);
    for (const p of [...ARMORY.props, ...HALLS[2].inside, ...HALLS[3].inside]) if (p.r > 0) BLOCKS_EAST.push([p.x, p.z, p.r]);
    // The stall, counter and all.
    for (const dz of [-1.5, 0, 1.5]) BLOCKS_EAST.push([ARMORY.merchant.x + 0.1, ARMORY.merchant.z + dz, 1.45]);
    for (const z of [-61, -60, -59]) BLOCKS_EAST.push([145.3, z, 0.45]);
    for (const z of [-37, -36, -35]) BLOCKS_EAST.push([145.3, z, 0.45]);
    for (const z of [-67, -66, -65]) BLOCKS_EAST.push([145.3, z, 0.45]);
    for (const z of [-30, -29, -28]) BLOCKS_EAST.push([144.4, z, 0.75]);
  }
  // The dragon longship every ship is (keep-models.js `warship`), in the model's own frame: its bow along +z,
  // its hull reaching `bow` either way from its middle, `beam` its half breadth at its widest, its deck `deck` over the
  // waterline amidships, its sheer rising toward both ends (`longshipSheer`), and its deckhouse aft (`house`: from
  // `z0` to `z1`, `half` across, its roof `top` up). Each ship stands it at its own `scale`.
  // Its cannons stand on the deck along both rails, their muzzles out over the water (`guns`: by how many a side, where
  // along the model each pair stands, how many times life size a gun is in the model's frame and how far it is
  // lifted off the deck to clear the rail); its helm, a wheel, stands just forward of the deckhouse (`helm`, along it).
  const LONGSHIP = { bow: 50, beam: 9, deck: 2.6, ends: 36, house: { z0: -34.4, z1: -25.6, half: 4.4, top: 6.9 }, helm: -21.5,
    guns: { 4: { at: [21, 9, -4, -16], size: 2, lift: 0.5 }, 2: { at: [12, -8], size: 3, lift: 0 } } };
  /** The longship's half breadth `a` along it from its middle, in the model's frame, or 0 past its ends. */
  const longshipHalf = (a) => Math.abs(a) >= LONGSHIP.bow ? 0 : LONGSHIP.beam * Math.pow(1 - Math.pow(Math.abs(a) / LONGSHIP.bow, 2.3), 0.55);
  /** How high its rails stand `a` along it, in the model's frame. */
  const longshipSheer = (a) => 4.4 + 12 * Math.pow(Math.max(0, (Math.abs(a) - 28) / 22), 2);
  /** What a body stands on aboard, `a` along it and `c` across, in the model's frame: the deck amidships, the solid
   *  ends up to the sheer, the deckhouse's roof. */
  const longshipTop = (a, c) => {
    const H = LONGSHIP.house;
    if (Math.abs(a) > LONGSHIP.ends) return longshipSheer(a);
    return a > H.z0 && a < H.z1 && Math.abs(c) < H.half ? H.top : LONGSHIP.deck;
  };
  // The galleon moored at the shipyard (keep-models.js `galleon`), in its own frame at its own size, as the longship's:
  // `bow` either way from its middle, `beam` its half breadth, its stern full and its bow fine (`galleonHalf`); its main
  // deck `deck` over the waterline, a forecastle from `fore.z0` forward, a quarterdeck from `quarter.z1` aft and a poop
  // deck over that from `poop.z1` aft, each `top` up, with a stair either side up to each (`stair` long, between
  // `stairs` out from the middle line); its rails `rail` over whatever deck they stand by (`galleonSheer`).
  // Its guns run out of the ports down both sides (`ports`, along it from the bow aft, `portY` over the waterline,
  // each barrel `gun` times life size); its wheel stands on the quarterdeck (`helm`, along it).
  const GALLEON = { bow: 30, beam: 7, deck: 4.2, keel: 3.4, rail: 1.2, stairs: [2.6, 5.4], fore: { z0: 15, top: 6.6, stair: 4 }, quarter: { z1: -9, top: 6.6, stair: 4 }, poop: { z1: -20, top: 9, stair: 4 },
    ports: [12.8, 9, 5.2, 1.4, -2.4, -6.2, -13.8, -17.6], portY: 2.75, gun: 1.5, helm: -11.4,
    // The ship stands the model at `scale`, as a longship does; `afloat` is her main deck over the waterline then.
    scale: 1.25 };
  GALLEON.afloat = GALLEON.deck * GALLEON.scale;
  /** The galleon's half breadth `a` along it from its middle, or 0 past its ends. */
  const galleonHalf = (a) => Math.abs(a) >= GALLEON.bow ? 0 : GALLEON.beam * Math.sqrt(1 - Math.pow(Math.abs(a) / GALLEON.bow, a < 0 ? 5 : 2.4));
  /** What a body stands on aboard it, `a` along and `c` across: a deck, or a stair between two. */
  const galleonTop = (a, c) => {
    const G = GALLEON, ac = Math.abs(c), on = ac >= G.stairs[0] && ac <= G.stairs[1];
    if (a >= G.fore.z0) return G.fore.top;
    if (on && a > G.fore.z0 - G.fore.stair) return G.deck + (G.fore.top - G.deck) * (a - G.fore.z0 + G.fore.stair) / G.fore.stair;
    if (a <= G.poop.z1) return G.poop.top;
    if (on && a < G.poop.z1 + G.poop.stair) return G.quarter.top + (G.poop.top - G.quarter.top) * (G.poop.z1 + G.poop.stair - a) / G.poop.stair;
    if (a <= G.quarter.z1) return G.quarter.top;
    if (on && a < G.quarter.z1 + G.quarter.stair) return G.deck + (G.quarter.top - G.deck) * (G.quarter.z1 + G.quarter.stair - a) / G.quarter.stair;
    return G.deck;
  };
  /** How high its rails stand `a` along it, rising toward the stem. */
  const galleonSheer = (a) => (a >= GALLEON.fore.z0 ? GALLEON.fore.top + 2.2 * Math.pow((a - GALLEON.fore.z0) / (GALLEON.bow - GALLEON.fore.z0), 2) : a <= GALLEON.poop.z1 ? GALLEON.poop.top : a <= GALLEON.quarter.z1 ? GALLEON.quarter.top : GALLEON.deck) + GALLEON.rail;
  // The eight longships on the water, each the longship at its `scale` (keep-models.js `warship`): six great ones off
  // the castle island's front, three a side in two lines either side of the way in (`GUARD_ROWS` apart toward the
  // islet), well clear of its quay, their bows toward it, lying out toward the way in (`fore`, across) until the rowboat
  // comes within its line's `reach` of it, when it backs out to its anchorage (`home`), so each facing pair draws back
  // together, one line after another as it comes; and two smaller ones off the islet (`home`, facing the castle island, either side of the
  // rowboat's berth) that keep pace with the rowboat while someone rows, `ahead` of it and `side` to its `side`, in its
  // own frame, never coming nearer the quay than `stop` up the way in, and goes home once nobody rows.
  // Where each lies now is `x`, `z`, `yaw`, which the scene moves each frame (a body stands on its deck by `shipTop`
  // and the boat keeps off it); `keel` is how deep it draws.
  const SHIP = { ahead: 6, side: 12, stop: 5 }, GUARD_ROWS = [66, 92, 118], GUARD_FORE = 40, GUARD_REACH = [70, 64, 71];
  const SHIPS = [
    ...GUARD_ROWS.flatMap((z, i) => [
      { scale: 0.5, role: "guard", hull: 5, fore: -GUARD_FORE, reach: GUARD_REACH[i], home: { x: -62, z, yaw: Math.PI / 2 } },
      { scale: 0.5, role: "guard", hull: 5, fore: GUARD_FORE, reach: GUARD_REACH[i], home: { x: 62, z, yaw: -Math.PI / 2 } }
    ]),
    { scale: 0.13, role: "escort", hull: 3, side: 1, home: { x: -27, z: DOCK.z0 - 12, yaw: Math.PI } },
    { scale: 0.13, role: "escort", hull: 3, side: -1, home: { x: 27, z: DOCK.z0 - 12, yaw: Math.PI } },
    // Moored at the shipyard (`docked`), the fleet a visitor may sail (`drive`; scene-keep.js `SAIL`): a great
    // longship south of its pier, clear of the galleon's stern, and a small one close along the pier's north side,
    // their dragons out to sea, and the
    // galleon (`kind`) along the quay's west face, its bow to the north. `hull` is how many of the red towers' balls
    // each stands.
    { scale: 0.35, role: "docked", drive: true, hull: 5, cast: -5, home: { x: -165, z: -85.15, yaw: -Math.PI / 2 } },
    { scale: 0.13, role: "docked", drive: true, hull: 3, cast: 3, home: { x: -165, z: SHIPYARD.piers[0].z1 + LONGSHIP.beam * 0.13 + 0.35, yaw: -Math.PI / 2 } },
    // Each lies hard against its pier or the quay (the galleon under its brow, the great longship under its plank), so
    // as its helm is taken there it is first warped off sideways, `cast` m across (port is +), clear of the timber
    // and, for the galleon, of the halls' decks.
    // And a small longship moored along the Armory & Forge's seaward face under its plank, her bow to the north.
    { scale: 0.13, role: "docked", drive: true, hull: 3, cast: 3, home: { x: 147.1 + LONGSHIP.beam * 0.13 + 0.35, z: -42, yaw: 0 } },
    { scale: GALLEON.scale, role: "docked", kind: "galleon", drive: true, hull: 8, cast: -13, home: { x: SHIPYARD.quay.x0 - GALLEON.beam * GALLEON.scale - 0.6, z: -31, yaw: 0 } },
    // CBDC's fleet, raiders under red sails that read CBDC (`cbdc`): great longships that come out for whoever sails
    // near as the raiders do (scene-keep.js `RAID`): two at anchor off the island's north shore and two off its south,
    // bows to the west, and two on patrol, each sailing its `roam` round off one of those shores.
    { scale: 0.5, role: "raider", cbdc: true, hull: 6, home: { x: 915, z: 55, yaw: -Math.PI / 2 } }, { scale: 0.5, role: "raider", cbdc: true, hull: 6, home: { x: 985, z: 55, yaw: -Math.PI / 2 } },
    { scale: 0.5, role: "raider", cbdc: true, hull: 6, home: { x: 915, z: -155, yaw: -Math.PI / 2 } }, { scale: 0.5, role: "raider", cbdc: true, hull: 6, home: { x: 985, z: -155, yaw: -Math.PI / 2 } },
    { scale: 0.5, role: "raider", cbdc: true, hull: 6, roam: [[850, 80], [850, 140], [1000, 140], [1000, 95]] }, { scale: 0.5, role: "raider", cbdc: true, hull: 6, roam: [[850, -180], [850, -240], [1000, -240], [1000, -195]] },
    // The raiders that roam the open water between the castle island and the islands either side of it (`roam`, the
    // round each sails, from its first point): two small ones and a great one to the west, toward Cold Storj, and a
    // small one and a great one to the east, toward CBDC. Each comes for whoever sails within `wake` of where
    // it is.
    { scale: 0.13, role: "raider", hull: 3, roam: [[-400, -150], [-680, -150], [-680, 40], [-400, 40]] },
    { scale: 0.13, role: "raider", hull: 3, roam: [[-420, 150], [-660, 150], [-520, 80]] },
    { scale: 0.35, role: "raider", hull: 5, roam: [[-450, -280], [-720, -220], [-600, -60]] },
    { scale: 0.13, role: "raider", hull: 3, roam: [[360, -150], [780, -160], [780, 60], [380, 80]] },
    { scale: 0.35, role: "raider", hull: 5, roam: [[450, -280], [800, -240], [640, 0], [400, -40]] },
    // And four that wander where they will (`wander`: each a box of open water it picks its next point in at random,
    // scene-keep.js `wanderTo`), behind the castle island either side of the arena and out to either side of the
    // portal's islet, never in the water between the islet and the castle island (`WANDER_OUT`).
    { scale: 0.13, role: "raider", hull: 3, roam: [[-260, -330], [-180, -400]], wander: { x0: -480, x1: -90, z0: -430, z1: -170 } },
    { scale: 0.35, role: "raider", hull: 5, roam: [[260, -330], [180, -400]], wander: { x0: 90, x1: 480, z0: -430, z1: -170 } },
    { scale: 0.13, role: "raider", hull: 3, roam: [[-300, 230], [-200, 250]], wander: { x0: -440, x1: -130, z0: 90, z1: 260 } },
    { scale: 0.13, role: "raider", hull: 3, roam: [[300, 230], [200, 250]], wander: { x0: 130, x1: 460, z0: 90, z1: 260 } },
    // And four more roaming the open water north of the castle island, out past the portal's islet: a great one and a
    // small one to the west, toward Outpost Island, and the same to the east, toward Shards.
    { scale: 0.35, role: "raider", hull: 5, roam: [[-250, 380], [-650, 360], [-600, 520], [-300, 520]] },
    { scale: 0.13, role: "raider", hull: 3, roam: [[-160, 170], [-400, 330], [-200, 470]] },
    { scale: 0.35, role: "raider", hull: 5, roam: [[250, 440], [420, 530], [780, 510], [740, 430]] },
    { scale: 0.13, role: "raider", hull: 3, roam: [[200, 160], [400, 250], [380, 460], [180, 420]] },
    // The three red-sailed raiders Leif's quest sends a visitor out after (`quest`: each on the water only while that
    // quest wants her and until she is sunk), far out to sea west of the shipyard; each fights whoever comes within
    // `wake` of her.
    { scale: 0.13, role: "raider", quest: "sails", wake: 95, hull: 3, home: { x: -335, z: -205, yaw: 0.6 } },
    { scale: 0.13, role: "raider", quest: "sails", wake: 95, hull: 3, home: { x: -290, z: -265, yaw: 1.4 } },
    { scale: 0.13, role: "raider", quest: "sails", wake: 95, hull: 3, home: { x: -400, z: -250, yaw: -0.3 } },
    // Cannon Basics' raiders, by the wave they come for the tower a visitor holds on Outpost Island in (`wave`), one
    // at a time: two small and then a great one, each on the water only while its wave is under way (scene-keep.js
    // `TOWER_QUEST`).
    ...[[0.13, 0], [0.13, 1], [0.35, 2]].map(([scale, wave]) => ({ scale, role: "raider", quest: "cannon", wave, hull: scale < 0.2 ? 3 : 5, home: { x: -846, z: 300, yaw: 0 } }))
  ];
  /** The water between the portal's islet and the castle island, which no wandering raider sails into. */
  const WANDER_OUT = { half: 110, z0: -20, z1: ISLET.z + 50 };
  const wanderOut = (x, z) => Math.abs(x) < WANDER_OUT.half && z > WANDER_OUT.z0 && z < WANDER_OUT.z1;
  // Each ship's own measures from its kind and scale, its guns, helm and mending places (`fitShip`; a ship moored at
  // one of the far islands' docks is added later, once the dock is laid out).
  const fitShip = (ship) => {
    if (ship.roam) ship.home = { x: ship.roam[0][0], z: ship.roam[0][1], yaw: Math.atan2(ship.roam[1][0] - ship.roam[0][0], ship.roam[1][1] - ship.roam[0][1]) };
    const galleon = ship.kind === "galleon";
    ship.bow = (galleon ? GALLEON.bow : LONGSHIP.bow) * ship.scale; ship.beam = (galleon ? GALLEON.beam : LONGSHIP.beam) * ship.scale; ship.keel = (galleon ? GALLEON.keel : 3.2) * ship.scale;
    ship.x = ship.home.x; ship.z = ship.home.z; ship.yaw = ship.home.yaw;
    // Its cannons, in its own frame in metres: each [along it, across it (port is +), its trunnions over the waterline,
    // how many times life size], a side's from the bow aft, port's then starboard's; a small ship has two a side, a
    // great one four, the galleon eight. And its helm: along it, and the deck it stands on over the waterline.
    const G = galleon ? null : LONGSHIP.guns[ship.scale < 0.2 ? 2 : 4], s = ship.scale;
    ship.guns = [1, -1].flatMap((side) => galleon
      ? GALLEON.ports.map((a) => [a * s, side * (galleonHalf(a) - 1.5) * s, GALLEON.portY * s, GALLEON.gun * s])
      : G.at.map((a) => [a * s, side * (longshipHalf(a) - 1.1 * G.size) * s, (LONGSHIP.deck + G.lift + 0.78 * G.size) * s, G.size * s]));
    ship.helm = galleon ? { a: GALLEON.helm * s, y: GALLEON.quarter.top * s } : { a: LONGSHIP.helm * s, y: LONGSHIP.deck * s };
    // Where she is mended when she is hurt (scene-keep.js `REPAIR`): places about her deck, each [along, across, the
    // deck's height over the waterline there], more on a bigger ship.
    ship.mend = (galleon ? [[18, 0], [7, 3.6], [1, -3.8], [-12.5, 3.4], [-16, -3.2], [-23, 0]] : s < 0.2 ? [[16, 3.5], [-10, -3.5]] : [[26, 0], [12, 4.2], [-6, -4.4], [-20, 4]])
      .map(([a, c]) => [a * s, c * s, (galleon ? galleonTop(a, c) : longshipTop(a, c)) * s]);
  };
  for (const ship of SHIPS) fitShip(ship);
  /** A ship's half breadth `a` along it from its middle, or 0 past its ends. */
  const shipHalf = (ship, a) => (ship.kind === "galleon" ? galleonHalf(a / ship.scale) : longshipHalf(a / ship.scale)) * ship.scale;
  // The two knights on their plinths, twice life size: how far either reaches out from its middle, and how high a
  // flier must be to pass over one (`top`, its plume's tip) or comes to stand on its helm.
  const STATUES = [{ x: -5.5, z: -3.5 }, { x: 5.5, z: -3.5 }], KNIGHT = { scale: 2, top: 7.06 }, STATUE_R = 2.4;
  // Eryk, the viking who stands at the top of the sea stair, beside it on the left as you climb, turned to face the
  // stair's head and whoever comes up it (keep-models.js `viking`), `r` across where he stands in a walker's way. He
  // gives the land's first quest (scene-keep.js `BL.keepQuests`), talked to from within `talk`.
  // The shipyard's two stand where they work, `y` up: Inga behind the mead hall's bar, and Bjorn the shipwright at his
  // bench (keep-models.js `barkeep`, `shipwright`).
  const GUARDS = [{ kind: "viking", name: "Eryk", x: -3.6, z: 11.6, yaw: Math.atan2(3.6, 0.9), r: 0.75, talk: 2.2 },
    { kind: "barkeep", name: "Inga", x: -140.8, y: SHIPYARD.y, z: 16.75, yaw: Math.PI, r: 0.5, talk: 2.6 },
    { kind: "shipwright", name: "Bjorn", x: -143.6, y: SHIPYARD.y, z: -114.7, yaw: 0.35, r: 0.6, talk: 2.4 },
    // Leif, the fleet's captain, on the quay by the head of the longships' pier, looking toward the stair's foot: he
    // gives the Red Sails quest (keep-models.js `captain`, scene-keep.js `LEIF`).
    { kind: "captain", name: "Leif", x: -143.2, y: SHIPYARD.y, z: -73.5, yaw: 0.36, r: 0.6, talk: 2.6 },
    // And the Armory & Forge's: Thorvald the swordsmith behind his anvil, facing the door, and Ylva the alchemist beside
    // her great cauldron (keep-models.js `smith`, `alchemist`).
    { kind: "smith", name: "Thorvald", x: 143.6, y: ARMORY.y, z: -5.0, yaw: Math.PI, r: 0.6, talk: 2.7 },
    { kind: "alchemist", name: "Ylva", x: 142.7, y: ARMORY.y, z: -94.1, yaw: -0.5, r: 0.5, talk: 2.6 }];
  // Eryk's crystal, on the small island's far beach behind the arch and off to its side, so nobody walks through the
  // arch reaching it; `take`, how near a walker picks it up.
  const CRYSTAL = { x: 5, z: ISLET.z + 21, take: 1.3, reach: 2.2 };
  // The wooden sign naming the keep's levels (keep-halls-models.js `levelSign`), out in the yard beside the keep's great
  // door, on the left as you come up to it, turned a little toward the way in; `posts` how far either side its posts
  // stand from its middle.
  const LEVEL_SIGN = { x: -(KEEP.door.half + 2.6), z: KEEP.front + 2.2, yaw: 0.35, posts: 0.75 };
  // The castle's island: a rounded oblong about its middle, `a` across and `b` along, its shore wandering by `wobble`;
  // the beach rises `beach` a metre inland from the waterline and the sea bed falls `bed` a metre out from it. Its north
  // end, under the court, is a sea cliff: the beach steepens and the shore wanders less toward it.
  const ISLAND = { z: -75, a: 80, b: 99, p: 4, wobble: 14, beach: 0.42, bed: 0.35 };
  // The four terrain grids, one an island (the castle's, the islet's, the volcano's, Cold Storj's), and how far out a
  // body may go (`BOUNDS`, `roam` in from its edge).
  const TERRAIN = [{ x0: -120, x1: 120, z0: -210, z1: 56 }, { x0: -40, x1: 40, z0: ISLET.z - 40, z1: ISLET.z + 40 }, { x0: 870, x1: 1030, z0: -130, z1: 30 }, { x0: -1252, x1: -772, z0: -286, z1: 186 },
    { x0: ARENA_ISLE.x - 60, x1: ARENA_ISLE.x + 60, z0: ARENA_ISLE.z - 60, z1: ARENA_ISLE.z + 60 }, { x0: 490, x1: 630, z0: 260, z1: 400 }, { x0: -920, x1: -772, z0: 401, z1: 549 }];
  // West and east, past the first grid's edges, the sea is the water's flat sheet alone, out to `x0` beyond the
  // shipyard and Cold Storj and `z0` behind the castle island, open water to sail in, and, past the Armory & Forge
  // and the volcano's island, to `x`.
  const BOUNDS = { x: 1040, x0: -1420, z0: -450, z1: 760, low: SEA - 1, high: 13, roam: 14 };

  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
  const hash2 = (x, z) => {
    let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const noise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  /** The moat's outer edge as a signed distance: negative inside it, the castle's ground included. */
  const moatDist = (x, z) => {
    const qx = Math.abs(x) - (MOAT.half - MOAT.round), qz = Math.abs(z - CZ) - (MOAT.halfZ - MOAT.round);
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - MOAT.round;
  };
  /** The stair's tread under (x, z), anywhere across it from parapet to parapet, the quay's deck past its foot, or null
   *  off both. */
  const stairsAt = (x, z) => {
    const ax = Math.abs(x), S = STAIRS;
    if (z >= QUAY.z0 && z <= QUAY.z1 && ax <= QUAY.halfW) return QUAY.y;
    if (ax > S.halfW || z < S.z0 || z > S.b1) return null;
    const k = z < S.a1 ? Math.floor((z - S.z0) / S.tread) + 1 : z < S.b0 ? S.flight : Math.min(2 * S.flight, S.flight + Math.floor((z - S.b0) / S.tread) + 1);
    return -k * S.rise;
  };
  /** How far (x, z) lies outside the land a traveller crosses on the castle's island, 0 on it. */
  const playDist = (x, z) => {
    const bx = Math.max(Math.abs(x) - STAIRS.halfW, 0), bz = Math.max(STAIRS.z0 - z, z - QUAY.z1, 0);
    return Math.max(0, Math.min(Math.hypot(x - COURT.x, z - COURT.z) - COURT.r, Math.hypot(bx, bz), moatDist(x, z)));
  };
  /** How far (x, z) lies inland of the castle island's shore, negative out at sea. */
  const shoreR = (x, z) => Math.pow(Math.pow(Math.abs(x) / ISLAND.a, ISLAND.p) + Math.pow(Math.abs(z - ISLAND.z) / ISLAND.b, ISLAND.p), 1 / ISLAND.p);
  const cliff = (z) => smooth((z + 30) / 40);
  const coastDist = (x, z) => {
    const r = shoreR(x, z), gx = (shoreR(x + 0.5, z) - shoreR(x - 0.5, z)), gz = (shoreR(x, z + 0.5) - shoreR(x, z - 0.5));
    return (1 - r) / (Math.hypot(gx, gz) || 1e-6) + (noise(x * 0.045 + 31, z * 0.045 + 17) - 0.5) * ISLAND.wobble * (1 - 0.75 * cliff(z));
  };
  /** How far (x, z) lies inland of the islet's shore, negative out at sea. */
  const isletDist = (x, z) => ISLET.r - Math.hypot(x - ISLET.x, z - ISLET.z) + (noise(x * 0.11 + 3, z * 0.11 + 41) - 0.5) * 2 * ISLET.wobble;
  /** Whether (x, z) lies on the islet's path down to its dock, and how much (1 on its middle line, fading off it). */
  const onIsletPath = (x, z) => z < ISLET_PATH.z0 - 0.5 || z > ISLET_PATH.z1 + 2 ? 0 : 1 - smooth((Math.abs(x - ISLET.x) - ISLET_PATH.halfW) / 2.5);
  /** Past the path's foot the beach is cut away under the dock, so its deck runs out from the path's end over sand
   *  falling into the water, banks sloping off either side; the cut runs on past the shore under the sea bed, so the
   *  channel by the dock deepens all the way out and a boat at its berth is never shut in by a lip of shallows. */
  const dockCut = (x, z, h) => {
    if (z >= ISLET_PATH.z0 || z <= DOCK.z0 - 8) return h;
    const v = 1 - smooth((Math.abs(x - ISLET.x) - DOCK.halfW - 0.8) / 5), cut = DOCK.y - 0.7 - (ISLET_PATH.z0 - z) * 0.12;
    return v > 0 && cut < h ? h + (cut - h) * v : h;
  };
  /** The islet's own ground: its plateau, hummocks round it, the path sloping down to the dock, the beach and sea bed. */
  const isletHeight = (x, z) => {
    const c = isletDist(x, z), d = Math.hypot(x - ISLET.x, z - ISLET.z);
    if (c < 0) return dockCut(x, z, SEA + 0.4 + c * ISLAND.bed);
    let h = d < ISLET.plateau ? 0 : smooth((d - ISLET.plateau) / 5) * (1.1 + 1.8 * noise(x * 0.12 + 9, z * 0.12 + 1));
    h = Math.min(h, SEA + 0.4 + c * ISLET.beach * (0.8 + 0.4 * noise(x * 0.1 + 2, z * 0.1 + 7)));
    const w = onIsletPath(x, z);
    if (w > 0) {
      const t = clamp01((z - ISLET_PATH.z0) / (ISLET_PATH.z1 - ISLET_PATH.z0)), path = DOCK.y + 0.15 + (0 - DOCK.y - 0.15) * t;
      h += (path - h) * w;
    }
    return dockCut(x, z, h);
  };
  // ---------- the volcano island ----------
  // CBDC, the volcano's island (`VOLCANO` in the code), due east of the castle's past the Armory & Forge, a third again
  // as far over the water as the islet is: round about its middle, `r` to its shore (wandering by `wobble`, but hardly
  // at all by its dock on the west), a beach rising `beach` a metre inland to a low apron of slate. Its `cone` stands
  // on the island's middle: `foot` across its base, rising to a jagged rim `rim` out from its middle and about `top`
  // high (`jag` either way), a lake of lava `lake` high in the crater inside it (`crater` across). The terrain's
  // blocks carry it up to their cap; above that it is a model of its own in blocks `unit` across, wherever it stands
  // `base` high or more (`grid`, the box of them). A level `court` at `y` runs from before the wall's gate in to the
  // cone's west foot, and in the foot itself is the cave's `mouth`: an open cut `half` either side of the island's
  // middle line from `x0` in to `x1`, under an arch springing `spring` up and `rise` more at its crown wherever the
  // cone stands over it; a walker past `enter` goes underground (`caveAt`). Lava runs down from the rim in thin
  // `streams`, each a bearing round the cone's middle (0 east, toward +z), wandering by `wander` and widening from
  // `wide[0]` at the rim by `wide[1]` a metre out, in a channel `cut` deep, each ending its own share of the way down
  // from the rim to the foot (`reach`).
  const VOLCANO = {
    x: 950, z: -50, r: 62, wobble: 4, beach: 0.7,
    cone: { x: 950, z: -50, foot: 22, rim: 5.5, top: 30, jag: 2, lake: 25.5, crater: 4, base: 13.5, unit: 1, grid: { x0: 926, x1: 974, y0: 5, y1: 38, z0: -74, z1: -26 } },
    court: { x0: 900, x1: 929, half: 5.5, y: 1, fade: 3 },
    mouth: { x0: 928, x1: 940, half: 4.5, spring: 4, rise: 3.5, enter: 937 },
    streams: [2.53, -2.53, 1.05, -1.22], reach: [0.62, 0.45, 0.72, 0.5], wander: 0.1, wide: [0.55, 0.006], cut: 0.25
  };
  // The castle wall round the cone, in the castle island's bridges' make: eight straight `sides` about the cone's
  // middle, each `apothem` out to its middle line and `half` thick either side of it, its walk `walk` over the court
  // between parapets `rail` high and `railW` thick; the first side faces the dock, and the gate goes through its
  // middle (`gate`: `half` either side, a pointed head springing `spring` up, as `archTop` has it). A side is
  // [its outward normal's x and z, its heading's x and z]; a point's place on the wall is the side it lies out from
  // (`wallPlace`: `k`, `u` along it and `v` out from its middle line). Outside every side, `pillars` along it, a
  // pillar `pillarR` square stands against its outer face, `pillar` over the parapet, a cresset on its head
  // (`cressets`, [x, y, z]). A red-roofed turret stands at every corner (`turret`: `r` across, its middle `out` past
  // the corner, `rise` over the walk to its eaves and `roof` more to its roof's tip; `turrets`), each with a cannon
  // out of its drum under the eaves that fires on whoever comes near by boat (scene-keep.js `TOWER`). And a stair climbs
  // the inner face of the side either side of the gate's (`stair`: `treads` of `tread` each, `wide` across, from
  // `from` along the side toward the gate's corner, rising away from the gate to a landing `landing` long, where the
  // inner parapet is left open).
  VOLCANO.wall = { apothem: 38, half: 2.2, walk: 9, rail: 1.1, railW: 0.5, gate: { half: 4, spring: 1 }, pillars: [-8.5, 8.5], pillar: 4, pillarR: 0.9, pillarOut: 1.2,
    turret: { r: 3.6, out: 5.2, rise: 5, roof: 7 }, stair: { treads: 30, tread: 0.5, wide: 2.4, from: -12, landing: 2.4, rail: 0.3 }, sides: [], turrets: [], cressets: [] };
  {
    const W = VOLCANO.wall, C = VOLCANO.cone, y0 = VOLCANO.court.y;
    W.y = y0; W.top = y0 + W.walk; W.len = W.apothem * Math.tan(Math.PI / 8); W.stair.rise = W.walk / W.stair.treads; W.stair.to = W.stair.from + W.stair.treads * W.stair.tread;
    for (let k = 0; k < 8; k++) {
      const a = Math.PI + k * Math.PI / 4, ox = Math.cos(a), oz = Math.sin(a);
      W.sides.push({ ox, oz, ax: -oz, az: ox, yaw: Math.atan2(ox, oz), x: C.x + ox * W.apothem, z: C.z + oz * W.apothem });
      const c = a + Math.PI / 8, d = W.apothem / Math.cos(Math.PI / 8) + W.turret.out;
      W.turrets.push({ x: C.x + Math.cos(c) * d, z: C.z + Math.sin(c) * d, y: y0, r: W.turret.r, top: W.top + W.turret.rise, rise: W.walk + W.turret.rise, roof: W.turret.roof, yaw: Math.atan2(Math.cos(c), Math.sin(c)), ledge: false, roofed: true, red: true });
      for (const u of W.pillars) W.cressets.push([C.x + ox * (W.apothem + W.half + W.pillarOut / 2) - oz * u, W.top + W.rail + W.pillar, C.z + oz * (W.apothem + W.half + W.pillarOut / 2) + ox * u]);
    }
  }
  const WALL_AT = { k: 0, u: 0, v: 0 };
  /** Where (x, z) lies by the wall, into a shared scratch: the side `k` it lies out from, `u` along that side from
   *  its middle and `v` out from its middle line. */
  const wallPlace = (x, z) => {
    const W = VOLCANO.wall, dx = x - VOLCANO.cone.x, dz = z - VOLCANO.cone.z;
    let best = -Infinity, k = 0;
    for (let i = 0; i < 8; i++) { const d = dx * W.sides[i].ox + dz * W.sides[i].oz; if (d > best) { best = d; k = i; } }
    WALL_AT.k = k; WALL_AT.u = dx * W.sides[k].ax + dz * W.sides[k].az; WALL_AT.v = best - W.apothem;
    return WALL_AT;
  };
  /** How much (x, z) is on the levelled ground inside the wall and under it (1 on it, fading off outside it). */
  const onBailey = (x, z) => {
    const W = VOLCANO.wall, dx = x - VOLCANO.cone.x, dz = z - VOLCANO.cone.z, far = W.apothem + W.half + 9;
    if (Math.abs(dx) > far || Math.abs(dz) > far) return 0;
    return 1 - smooth((wallPlace(x, z).v - W.half - 2.5) / 3);
  };
  // Its dock on the west shore, in the shipyard's style: a stone `quay` along the shore and an oak `pier` out to the
  // west from its middle, both at `y`; the rowboat's berth lies along the quay's seaward face north of the pier.
  VOLCANO.dock = { y: SEA + 1.1, quay: { x0: 884, x1: 889, z0: VOLCANO.z - 12, z1: VOLCANO.z + 12 }, pier: { x0: 872, x1: 884, z0: VOLCANO.z - 1.3, z1: VOLCANO.z + 1.3 } };
  FERRY.volcano = { x: VOLCANO.dock.quay.x0 - 1.15, z: VOLCANO.z + 6.6, deck: VOLCANO.dock.y, walkX: VOLCANO.dock.quay.x0 + 1.2, side: -1 };
  /** How far (x, z) lies inland of the volcano island's shore, negative out at sea. */
  const volcanoDist = (x, z) => {
    const dx = x - VOLCANO.x, dz = z - VOLCANO.z, west = dx < 0 ? 1 - smooth((Math.abs(dz) - 14) / 14) : 0;
    return VOLCANO.r - Math.hypot(dx, dz) + (noise(x * 0.07 + 13, z * 0.07 + 29) - 0.5) * 2 * VOLCANO.wobble * (1 - 0.9 * west);
  };
  /** How much (x, z) is on the court before the cave (1 on it, fading off round it). */
  const onVolcanoCourt = (x, z) => {
    const C = VOLCANO.court, out = Math.max(C.x0 - x, x - C.x1, Math.abs(z - VOLCANO.z) - C.half, 0);
    return 1 - smooth(out / C.fade);
  };
  /** Whether (x, z) is in the cave mouth's cut, grown by `r`. */
  const inVolcanoMouth = (x, z, r = 0) => x >= VOLCANO.mouth.x0 - r && x <= VOLCANO.mouth.x1 + r && Math.abs(z - VOLCANO.z) <= VOLCANO.mouth.half + r;
  /** The lava stream (x, z) is in, counted from 1, or 0 off them all; the crater's lake is -1. */
  const lavaStream = (x, z) => {
    const C = VOLCANO.cone, dx = x - C.x, dz = z - C.z, d = Math.hypot(dx, dz);
    if (d < C.crater - 0.5) return -1;
    if (d < C.rim - 2 || d > C.foot) return 0;
    const a = Math.atan2(dz, dx), half = VOLCANO.wide[0] + d * VOLCANO.wide[1];
    for (let i = 0; i < VOLCANO.streams.length; i++) {
      if (d > C.rim + (C.foot - C.rim) * VOLCANO.reach[i]) continue;
      let off = a - VOLCANO.streams[i] - VOLCANO.wander * Math.sin(d * 0.18 + i * 2.1);
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) * d < half) return i + 1;
    }
    return 0;
  };
  /** The cone's height over its foot at (x, z): nothing past the foot, steeper toward the rim, the crater inside. */
  const coneRise = (x, z) => {
    const C = VOLCANO.cone, dx = x - C.x, dz = z - C.z, d0 = Math.hypot(dx, dz);
    if (d0 >= C.foot + 4) return 0;
    const rim = C.top + (noise(dx / (d0 || 1) * 3 + 50, dz / (d0 || 1) * 3 + 50) - 0.5) * 2 * C.jag;
    if (d0 < C.rim) return C.lake + smooth((d0 - C.crater) / (C.rim - C.crater)) * (rim - C.lake);
    const d = d0 + (noise(x * 0.08 + 5, z * 0.08 + 77) - 0.5) * 4 * clamp01((d0 - C.rim) / 8);
    if (d >= C.foot) return 0;
    const k = (C.foot - d) / (C.foot - C.rim);
    return rim * Math.pow(clamp01(k), 1.08) + (noise(x * 0.3 + 1, z * 0.3 + 8) - 0.5) * 1.6 * k;
  };
  /** The volcano island's own ground: the sea bed, the beach, the apron levelled inside the wall and under it, the
   *  cone on it, the court levelled from the gate to the cave and, unless `whole`, the cave mouth cut into the cone's foot; lava's channels cut a little into it. */
  const volcanoHeight = (x, z, whole = false) => {
    if (x < VOLCANO.x - VOLCANO.r - 60) return -Infinity;
    const c = volcanoDist(x, z), Q = VOLCANO.dock.quay;
    // By the dock the bed is cut deep, so a boat at its berth is never shut in by shallows.
    if (c < 0) return x < Q.x1 && Math.abs(z - VOLCANO.z) < 18 ? Math.min(SEA + 0.4 + c * ISLAND.bed, SEA - 1.1) : SEA + 0.4 + c * ISLAND.bed;
    let h = Math.min(SEA + 0.4 + c * VOLCANO.beach * (0.8 + 0.4 * noise(x * 0.1 + 2, z * 0.1 + 7)), 1.4 + 1.4 * noise(x * 0.1 + 21, z * 0.1 + 4));
    if (x < Q.x1 + 0.5 && Math.abs(z - VOLCANO.z) < Q.z1 - VOLCANO.z + 0.5) h = Math.min(h, VOLCANO.dock.y - 0.6);
    const flat = onBailey(x, z);
    if (flat > 0) h += (VOLCANO.court.y - h) * flat;
    h += coneRise(x, z);
    const k = onVolcanoCourt(x, z);
    if (k > 0 && h > VOLCANO.court.y - 4) h += (VOLCANO.court.y - h) * k;
    if (!whole && inVolcanoMouth(x, z)) h = VOLCANO.court.y;
    if (h > SEA + 0.8 && lavaStream(x, z) > 0) h -= VOLCANO.cut;
    return h;
  };

  // ---------- Shards ----------
  // The crystal island out in the water between Portal Island and CBDC, a little further from the castle island than
  // the islet: round about its middle, `r` to its shore (wandering by `wobble`, but hardly at all by its dock on the
  // west), its beach rising `beach` a metre inland to a plateau `plateau` high of the glowing amethyst under Merge Rock
  // (keep-models.js), gently rolling (`roll`) out from `flat` round its middle. Its dock on the west shore is CBDC's:
  // a stone `quay` along the shore and an oak `pier` out to the west from its middle, both at `y`, the water `deep`
  // along the quay for `deepHalf` either side of its middle so a ship comes alongside. A paved `way`
  // `half` either side of the island's middle line climbs from the quay to the plateau by `top` and runs on east to
  // the head of the `trench`, which goes down in `steps` treads `tread` long to its floor `floor` high, opens into a
  // sunken `court` before the cave's mouth and, past it, the `notch` cut into the rock under the mouth's lintel
  // (keep-models.js `storjCave`'s frame, standing at `mouth`); a walker past `enter` goes underground.
  const SHARDS = { x: 560, z: 330, r: 52, wobble: 3, beach: 0.7, plateau: 0.5, flat: 30, roll: 1.6 };
  SHARDS.dock = { y: SEA + 1.1, deep: SEA - 6, deepHalf: 26, quay: { x0: 504, x1: 509, z0: SHARDS.z - 12, z1: SHARDS.z + 12 }, pier: { x0: 492, x1: 504, z0: SHARDS.z - 1.3, z1: SHARDS.z + 1.3 } };
  SHARDS.way = { half: 1.8, x0: SHARDS.dock.quay.x1 - 0.5, top: 523 };
  SHARDS.trench = { x0: 544.5, tread: 1, steps: 11, half: 1.8, floor: SHARDS.plateau - 5.5 };
  SHARDS.trench.court = { x0: SHARDS.trench.x0 + SHARDS.trench.steps * SHARDS.trench.tread, x1: 558.6, half: 3.4 };
  SHARDS.trench.notch = { x0: SHARDS.trench.court.x1, x1: SHARDS.trench.court.x1 + 4.3, half: 2.1 };
  SHARDS.mouth = { x: SHARDS.trench.notch.x0 + 0.3, enter: SHARDS.trench.notch.x0 + 1.6 };
  FERRY.shards = { x: SHARDS.dock.quay.x0 - 1.15, z: SHARDS.z + 6.6, deck: SHARDS.dock.y, walkX: SHARDS.dock.quay.x0 + 1.2, side: -1 };
  /** How far (x, z) lies inland of Shards' shore, negative out at sea. */
  const shardsDist = (x, z) => {
    const dx = x - SHARDS.x, dz = z - SHARDS.z, west = dx < 0 ? 1 - smooth((Math.abs(dz) - 14) / 14) : 0;
    return SHARDS.r - Math.hypot(dx, dz) + (noise(x * 0.06 + 71, z * 0.06 + 23) - 0.5) * 2 * SHARDS.wobble * (1 - 0.9 * west);
  };
  /** How much (x, z) is on the way from the quay to the trench (1 on its middle line, fading off it). */
  const onShardsWay = (x, z) => {
    const W = SHARDS.way;
    return x < W.x0 || x > SHARDS.trench.x0 + 0.5 ? 0 : 1 - smooth((Math.abs(z - SHARDS.z) - W.half) / 2.5);
  };
  /** The floor of the trench at (x, z), down to the cave's mouth, or null outside it. */
  const shardsTrench = (x, z) => {
    const T = SHARDS.trench, dz = Math.abs(z - SHARDS.z);
    if (x >= T.x0 && x < T.court.x0 && dz <= T.half) return SHARDS.plateau - 0.5 * Math.min(T.steps, Math.ceil((x - T.x0) / T.tread));
    if (x >= T.court.x0 && x < T.court.x1 && dz <= T.court.half) return T.floor;
    if (x >= T.notch.x0 && x < T.notch.x1 && dz <= T.notch.half) return T.floor;
    return null;
  };
  /** Whether (x, z) is in the notch under the cave mouth's lintel, grown by `r`. */
  const inShardsNotch = (x, z, r = 0) => { const N = SHARDS.trench.notch; return x >= N.x0 - r && x <= N.x1 + r && Math.abs(z - SHARDS.z) <= N.half + r; };
  /** Shards' own ground: the sea bed (cut deep by the dock), the beach, its rolling plateau, the way levelled and
   *  sloping down to the quay, and the trench stepping down to the cave. */
  const shardsHeight = (x, z) => {
    if (Math.abs(x - SHARDS.x) > SHARDS.r + 60 || Math.abs(z - SHARDS.z) > SHARDS.r + 60) return -Infinity;
    const c = shardsDist(x, z), Q = SHARDS.dock.quay;
    // Along the quay the water is deep enough for a ship to come alongside it.
    if (c < 0) return x < Q.x1 && Math.abs(z - SHARDS.z) < SHARDS.dock.deepHalf ? Math.min(SEA + 0.4 + c * ISLAND.bed, x < Q.x0 ? SHARDS.dock.deep : SEA - 1.1) : SEA + 0.4 + c * ISLAND.bed;
    const d = Math.hypot(x - SHARDS.x, z - SHARDS.z);
    let h = SHARDS.plateau + (d < SHARDS.flat ? 0 : smooth((d - SHARDS.flat) / 6) * SHARDS.roll * noise(x * 0.11 + 4, z * 0.11 + 19));
    h = Math.min(h, SEA + 0.4 + c * SHARDS.beach * (0.8 + 0.4 * noise(x * 0.1 + 12, z * 0.1 + 3)));
    if (x < Q.x1 + 0.5 && Math.abs(z - SHARDS.z) < Q.z1 - SHARDS.z + 0.5) h = Math.min(h, SHARDS.dock.y - 0.6);
    const w = onShardsWay(x, z);
    if (w > 0) { const W = SHARDS.way, t = clamp01((x - W.x0) / (W.top - W.x0)), way = SHARDS.dock.y + 0.15 + (SHARDS.plateau - SHARDS.dock.y - 0.15) * t; h += (way - h) * w; }
    const trench = shardsTrench(x, z);
    return trench === null ? h : trench;
  };

  // ---------- Outpost Island ----------
  // A square island out between Portal Island and Cold Storj, built as the castle island is: about its middle a
  // rounded square `half` to its shore (`p` its squareness, the shore wandering by `wobble`), level at y 0 inside,
  // its beach rising `beach` a metre and the sea bed falling `bed` a metre out. Two square curtains of the castle's
  // own stand on it, `outer` and `inner` (the courtyard's) out from its middle to their outer faces, `CASTLE.wall`
  // thick and `CASTLE.walk` to their walks, a gate through the middle of every side of each as the west gate is
  // (`WEST.half` either side, `westArchTop`); the castle's keep in the middle, its door shut and nothing yet inside;
  // and out of each outer gate an arched bridge as the shipyard's is, half its length (`bridge`, the back way's kind in
  // its own frame: along -z from the wall's face, `x` across), down to a T of a dock at `dock.y`: a stone `cross` quay
  // across the bridge's foot, `at` to `at + w` out from the wall, `half` either side, and a timber `pier` out from its
  // middle `len` long; a curtain tower at each end of every cross (`towers`, the castle's, its stair inside in the
  // halls, its cannon in its gallery looking out to sea, its door toward the bridge). The rowboat berths along the
  // east pier (`FERRY.outpost`).
  const OUTPOST = { x: -846, z: 475, half: 54, p: 4, wobble: 3, beach: 0.7, bed: 0.35, outer: 44, inner: 27,
    dock: { y: DOCK.y, at: 37, w: 6, half: 22, pier: { len: 18, half: 1.3 } } };
  OUTPOST.bridge = { x: 0, half: 5, halfW: 5.7, rail: 1.1, thick: 0.9, z0: 0, z1: -OUTPOST.dock.at, peak: 1.5,
    profile: [[0, 0], [-5, 0], [-14, 1.5], [-22, 1.5], [-OUTPOST.dock.at, OUTPOST.dock.y]],
    arches: [[-7, -13], [-16, -22], [-25, -31]], pillars: [-5.4, -14.5, -23.5, -32.6], pillar: 5, pillarZ: 6, pillarR: 0.9, spans: [], cressets: [] };
  // Its four arms, north, east, south and west: each the way out (`dx`, `dz`), the way across it (`nx`, `nz`) and its
  // gate on the outer wall's face (`gx`, `gz`), and how its bridge is turned (`yaw`, the model's frame onto the land's).
  OUTPOST.arms = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dz], k) => ({ k, dx, dz, nx: dz, nz: -dx, gx: OUTPOST.x + dx * OUTPOST.outer, gz: OUTPOST.z + dz * OUTPOST.outer, yaw: Math.atan2(dz, -dx) }));
  OUTPOST.towers = [];
  OUTPOST.decks = [];
  {
    const O = OUTPOST, D = O.dock, rect = (a, ua, ub, va, vb) => {
      const x0 = a.gx + a.dx * ua + a.nx * va, x1 = a.gx + a.dx * ub + a.nx * vb, z0 = a.gz + a.dz * ua + a.nz * va, z1 = a.gz + a.dz * ub + a.nz * vb;
      return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
    };
    for (const a of O.arms) {
      a.cross = rect(a, D.at, D.at + D.w, -D.half, D.half);
      a.pier = rect(a, D.at + D.w, D.at + D.w + D.pier.len, -D.pier.half, D.pier.half);
      O.decks.push(a.cross, a.pier);
      // A tower at each end of the cross, its gallery looking out along the arm and its door toward the bridge.
      for (const s of [-1, 1]) {
        const out = D.at + D.w / 2, x = a.gx + a.dx * out + a.nx * s * D.half, z = a.gz + a.dz * out + a.nz * s * D.half;
        O.towers.push({ x, z, yaw: Math.atan2(a.dx, a.dz), tall: 0, ground: D.y, door: { dx: -a.nx * s, dz: -a.nz * s } });
      }
    }
  }
  spanInit(OUTPOST.bridge);
  FERRY.outpost = (() => { const a = OUTPOST.arms[1], P = a.pier; return { x: (P.x0 + P.x1) / 2 + 3, z: P.z1 + 1.15, deck: OUTPOST.dock.y, walkZ: P.z1 - 0.6, side: 1, faceZ: 1 }; })();
  // Small longships of the Oogas' moored at the far islands, each along a pier's or quay's side with a plank onto her,
  // as the Armory & Forge's is (`SHIPS`' `drive`, sailed by whoever takes her helm): two at Outpost Island, along the
  // east pier's south side and the north pier's east side, and one along Shards' quay south of its pier.
  const FAR_PLANKS = [];
  {
    const S = 0.13, off = LONGSHIP.beam * S + 0.35, moor = (home, cast, plank) => { const ship = { scale: S, role: "docked", drive: true, hull: 3, cast, home }; fitShip(ship); SHIPS.push(ship); FAR_PLANKS.push(plank); };
    const E = OUTPOST.arms[1].pier, N = OUTPOST.arms[0].pier, ex = (E.x0 + E.x1) / 2, nz = (N.z0 + N.z1) / 2;
    moor({ x: ex, z: E.z0 - off, yaw: Math.PI / 2 }, 3, { x0: ex - 1.5, x1: ex + 1.5, z0: E.z0 - 1.1, z1: E.z0 });
    moor({ x: N.x1 + off, z: nz, yaw: 0 }, 3, { x0: N.x1, x1: N.x1 + 1.1, z0: nz - 1.5, z1: nz + 1.5 });
    const Q = SHARDS.dock.quay, sz = SHARDS.z - 8;
    moor({ x: Q.x0 - off, z: sz, yaw: 0 }, -3, { x0: Q.x0 - 1.1, x1: Q.x0, z0: sz - 1.5, z1: sz + 1.5 });
  }
  // The keep's middle on the island, and the torches on its balconies' piers, as the castle's keep has them.
  const OUTPOST_KEEP = { x: OUTPOST.x, z: OUTPOST.z };
  // The firepit in the middle of its top level (keep-halls-models.js `firepit`, as the castle keep's rooftop has it).
  OUTPOST.fire = { x: OUTPOST_KEEP.x, z: OUTPOST_KEEP.z, r: 2.1 };
  OUTPOST.torches = TORCHES.map(([x, y, z]) => [x - KEEP.x + OUTPOST_KEEP.x, y, z - KEEP.z + OUTPOST_KEEP.z]);
  /** How far (x, z) lies inland of Outpost Island's shore, negative out at sea. */
  const outpostDist = (x, z) => {
    const O = OUTPOST, ax = Math.abs(x - O.x) / O.half, az = Math.abs(z - O.z) / O.half;
    return (1 - Math.pow(Math.pow(ax, O.p) + Math.pow(az, O.p), 1 / O.p)) * O.half + (noise(x * 0.07 + 41, z * 0.07 + 7) - 0.5) * 2 * O.wobble;
  };
  /** Outpost Island's own ground: level inside, its beach and the sea bed. */
  const outpostHeight = (x, z) => {
    const O = OUTPOST;
    if (Math.abs(x - O.x) > O.half + 70 || Math.abs(z - O.z) > O.half + 70) return -Infinity;
    const c = outpostDist(x, z);
    if (c < 0) return SEA + 0.4 + c * O.bed;
    return Math.min(0, SEA + 0.4 + c * O.beach * (0.8 + 0.4 * noise(x * 0.1 + 31, z * 0.1 + 13)));
  };
  /** Which arm of Outpost Island (x, z) lies out along, into `ARM_AT` with its place in the arm's frame: `u` along it
   *  (0 at the gate's face, falling outward, as `OUTPOST.bridge` runs) and `v` across. */
  const ARM_AT = { a: null, u: 0, v: 0 };
  const outpostArm = (x, z) => {
    const O = OUTPOST, dx = x - O.x, dz = z - O.z, a = O.arms[Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2)];
    ARM_AT.a = a; ARM_AT.u = -((x - a.gx) * a.dx + (z - a.gz) * a.dz); ARM_AT.v = (x - a.gx) * a.nx + (z - a.gz) * a.nz;
    return ARM_AT;
  };
  /** Whether (x, z) lies anywhere near Outpost Island's stone. */
  const nearOutpost = (x, z) => Math.abs(x - OUTPOST.x) < OUTPOST.outer + OUTPOST.dock.at + 12 && Math.abs(z - OUTPOST.z) < OUTPOST.outer + OUTPOST.dock.at + 12;
  /** The curtain whose wall (x, z), grown by `r`, stands in, into `OUTPOST_WALL` (its walk's `top`, whether that is
   *  over a gate's passage, and the passage's soffit there), or null. */
  const OUTPOST_WALL = { top: 0, gate: false, soffit: 0 };
  const outpostWall = (x, z, r = 0) => {
    const O = OUTPOST, ax = Math.abs(x - O.x), az = Math.abs(z - O.z), m = Math.max(ax, az), along = Math.min(ax, az);
    for (const W of [O.outer, O.inner]) {
      if (m > W + r || m < W - CASTLE.wall - r) continue;
      OUTPOST_WALL.top = CASTLE.walk; OUTPOST_WALL.gate = along < WEST.half - r; OUTPOST_WALL.soffit = OUTPOST_WALL.gate ? westArchTop(along) : 0;
      return OUTPOST_WALL;
    }
    return null;
  };
  // Its towers' galleries and doors, after the castle's six (their halls' insides are keep-halls-layout.js `TOWERS`
  // 6 on), each standing on the dock at its `ground`, its gallery its walk up from there.
  for (const t of OUTPOST.towers) {
    const i = GALLERIES.length, inner = CASTLE.tower - GALLERY.wall, floor = t.ground + CASTLE.towerWalk[t.tall];
    t.i = i;
    GALLERIES.push({ i, x: t.x, z: t.z, floor, top: floor, r: CASTLE.tower, inner, yaw: t.yaw, ahead: inner - 1.5, arc: Math.PI / 2, gallery: true, defend: true, outpost: true, ground: t.ground, tall: t.tall });
    TOWER_DOORS.push({ i, cx: t.x, cz: t.z, dx: t.door.dx, dz: t.door.dz, half: 1.1, frame: 1.6, front: CASTLE.tower + 0.8, y: t.ground, outpost: true });
  }
  /** The top of Outpost Island's towers and their porches within `r` of (x, z), or -Infinity off them all. */
  const outpostTowerTop = (x, z, r = 0) => {
    let top = -Infinity;
    for (const t of OUTPOST.towers) {
      const ox = x - t.x, oz = z - t.z;
      if (Math.abs(ox) > CASTLE.tower + 9 + r || Math.abs(oz) > CASTLE.tower + 9 + r) continue;
      if (Math.hypot(ox, oz) < CASTLE.tower + 0.45 + r) top = Math.max(top, t.ground + CASTLE.towerWalk[t.tall] + SPIRE);
      const d = t.door, out = ox * d.dx + oz * d.dz;
      if (out > 0 && out < CASTLE.tower + 0.8 + r && Math.abs(ox * d.dz - oz * d.dx) < 1.6 + r) top = Math.max(top, t.ground + 6.3);
    }
    return top;
  };
  /** The top of Outpost Island's keep within `r` of (x, z), tapering to its spire, or -Infinity off it. */
  const outpostKeepTop = (x, z, r = 0) => {
    const d = Math.hypot(x - OUTPOST_KEEP.x, z - OUTPOST_KEEP.z);
    if (d >= KEEP.r + 0.3 + r) return -Infinity;
    return KEEP.roof + KEEP.arcade + KEEP.spire * Math.max(0, 1 - Math.max(0, d - r) / (KEEP.r + 1.2));
  };

  // Outpost Island underfoot and in the air: its bridges (in each arm's frame, `outpostArm`), its walls, towers and
  // keep. Each answers null, 0 or false away from it.
  const outpostBridge = (x, z) => { if (!nearOutpost(x, z)) return null; const A = outpostArm(x, z); return A.u <= OUTPOST.bridge.z0 + 1 && A.u >= OUTPOST.bridge.z1 - 1 ? A : null; };
  const outpostSupport = (x, z, feet) => {
    if (!nearOutpost(x, z)) return null;
    const A = outpostBridge(x, z);
    if (A) { const b = spanSupport(OUTPOST.bridge, A.v, A.u, feet); if (b !== null) return b; }
    const balcony = balconyAt(x, z, feet, OUTPOST_KEEP);
    if (balcony !== null) return balcony;
    const w = outpostWall(x, z);
    if (w && feet >= w.top - STEP) return w.top;
    // The keep's top level, open: its floor, in through its arches from the top balcony.
    if (inKeep(x, z, 0, OUTPOST_KEEP) && feet >= KEEP.roof - STEP && feet < KEEP.roof + KEEP.arch.spring) return KEEP.roof;
    const t = Math.max(outpostTowerTop(x, z), outpostKeepTop(x, z));
    if (t > -Infinity && feet >= t - STEP) return t;
    return null;
  };
  /** A step on foot to (x, z) on Outpost Island: 1 to take it, -1 to refuse it, 0 where it has no say. */
  const outpostWalk = (x, z, feet, r) => {
    if (!nearOutpost(x, z)) return 0;
    const balcony = balconyAt(x, z, feet, OUTPOST_KEEP);
    if (balcony !== null) return balconyClear(x, z, feet, r, balcony, OUTPOST_KEEP) && balcony <= feet + STEP && balcony >= feet - DROP ? 1 : -1;
    const A = outpostBridge(x, z);
    if (A) { const b = spanWalk(OUTPOST.bridge, A.v, A.u, feet, r); if (b !== 0) return b; }
    const w = outpostWall(x, z, r);
    if (w) {
      if (feet >= w.top - STEP) return w.top <= feet + STEP && w.top >= feet - DROP ? 1 : -1;
      if (!(w.gate && feet + 2 < w.soffit)) return -1;
    }
    if (inKeep(x, z, r, OUTPOST_KEEP) && feet > KEEP.roof - 1 && feet < KEEP.roof + KEEP.arch.spring) {
      if (!arcadeClear(x, z, Math.max(feet, KEEP.roof), r, OUTPOST_KEEP) || Math.hypot(x - OUTPOST.fire.x, z - OUTPOST.fire.z) < OUTPOST.fire.r + r) return -1;
      return KEEP.roof <= feet + STEP && KEEP.roof >= feet - DROP ? 1 : -1;
    }
    if (outpostTowerTop(x, z, r) > feet + STEP || outpostKeepTop(x, z, r) > feet + STEP) return -1;
    return 0;
  };
  /** Whether (x, y, z) a body `r` across is in the open air of Outpost Island's keep's top level, in from its room or
   *  through one of its arches, and clear of its firepit. */
  const outpostRoom = (x, z, y, r) => {
    if (y < KEEP.roof - 0.05 || !inKeep(x, z, r, OUTPOST_KEEP)) return false;
    const d = Math.hypot(x - OUTPOST_KEEP.x, z - OUTPOST_KEEP.z);
    if (y < KEEP.roof + 1.2 && Math.hypot(x - OUTPOST.fire.x, z - OUTPOST.fire.z) < OUTPOST.fire.r + r) return false;
    if (d + r < KEEP.r - KEEP.wall) return y < KEEP.roof + KEEP.arcade - HEAD - 0.5;
    return arcadeClear(x, z, y, r, OUTPOST_KEEP);
  };
  /** Whether a body in the air at `y` meets Outpost Island's stone at (x, z). */
  const outpostFly = (x, z, y, r) => {
    if (!nearOutpost(x, z)) return false;
    const A = outpostBridge(x, z);
    if (A && spanFly(OUTPOST.bridge, A.v, A.u, y, r)) return true;
    if (balconyBlocks(x, z, y, r, OUTPOST_KEEP)) return true;
    const w = outpostWall(x, z, r);
    if (w && y < w.top - 1e-3 && !(w.gate && y + HEAD < w.soffit)) return true;
    if (outpostRoom(x, z, y, r)) return false;
    return y < outpostTowerTop(x, z, r) - 1e-3 || y < outpostKeepTop(x, z, r) - 1e-3;
  };
  /** Whether the point (x, y, z) lies in Outpost Island's stone. */
  const outpostHit = (x, y, z) => {
    if (!nearOutpost(x, z)) return false;
    const A = outpostBridge(x, z);
    if (A && spanHit(OUTPOST.bridge, A.v, y, A.u)) return true;
    const w = outpostWall(x, z);
    if (w && y <= w.top && !(w.gate && y < w.soffit)) return true;
    if (y <= outpostKeepTop(x, z) && !outpostRoom(x, z, y, 0)) return true;
    return y <= outpostTowerTop(x, z) && !galleryAir(x, y, z);
  };
  /** Whether a hull may not lie at (x, z), grown by `pad`: a bridge's pier or causeway, or a tower's footing. */
  const outpostFoul = (x, z, pad) => {
    if (!nearOutpost(x, z)) return false;
    const A = outpostBridge(x, z);
    if (A && spanFoul(OUTPOST.bridge, A.v, A.u, pad)) return true;
    for (const t of OUTPOST.towers) if (Math.hypot(x - t.x, z - t.z) < CASTLE.tower + 1.3 + pad) return true;
    return false;
  };

  // ---------- Cold Storj ----------
  // The winter island far to the west of the castle's, past the shipyard, as the volcano's is east: an oblong about its
  // middle, `a` east and west and `b` north and south (its shore wandering by `wobble`), a sea cliff all round (the
  // ground leaps from the water to `cliff` over the sea, so nothing lands on it) up to a rolling plateau of snow and
  // pines (`plain`, wandering by `roll`). Straight through it from its east shore to its west runs the `fjord`, a
  // channel `half` either side of its line, deep (`deep` under the sea) as the sea is right up to every cliff, its two
  // halves mirrored about the island's middle, so the island is two strips of land, north and south. On each strip
  // stands a mountain (`mountains`), a massif `foot` round its middle rising `top` high (a cone whose sides curve by
  // `curve`) with lesser `peaks` and jagged by `jag`; the terrain's blocks carry it up to their cap, a model of its own
  // in blocks `unit` across over that (`grid`). Round each a path climbs from the plateau (`path`: `w` either side of
  // its line, `turns` round the mountain from bearing `from`, `dir` the way round, from `y0` to `y1`), cut into its
  // flank as a ledge, a cave's mouth on its uphill side partway up and at its end (`caves`). Each strip has its dock on
  // the channel at the island's middle, with a short boardwalk, three houses behind it on a level terrace and a way up
  // to its mountain's path (`docks`). Towers stand along both banks (`turrets`), two great stone knights on the
  // headlands either side of each mouth (`statues`), and ogres keep the land at either end of both strips (`ogres`).
  const STORJ = {
    x: -1012, z: -50, a: 232, b: 225, p: 3, wobble: 5, cliff: 7.2, plain: 4.2, roll: 3.2, deep: 5,
    fjord: { half: 50 },
    terrace: { depth: 22, half: 64 },
    mountains: [
      { x: -1012, z: -212, foot: 46, top: 60, curve: 1.3, jag: 3, peaks: [[12, -10, 51, 10], [-11, 9, 47, 9], [3, 13, 43, 8]], from: Math.PI, dir: 1 },
      { x: -1012, z: 112, foot: 46, top: 58, curve: 1.3, jag: 3, peaks: [[12, 10, 50, 10], [-11, -9, 46, 9], [2, -13, 41, 8]], from: Math.PI, dir: -1 }
    ],
    unit: 1, path: { w: 2, turns: 1.25, y0: 6, y1: 30, shoulder: 3, end: 7 }, caves: [0.46, 1]
  };
  STORJ.east = STORJ.x + STORJ.a; STORJ.west = STORJ.x - STORJ.a;
  /** The x mirrored about the island's middle, east half to west. */
  const storjMirror = (x) => 2 * STORJ.x - x;
  {
    const half = [[-740, -50], [-815, -45], [-870, -57], [-925, -46], [-975, -50]];
    STORJ.fjord.pts = [...half, ...half.slice().reverse().map(([x, z]) => [storjMirror(x), z])];
  }
  for (const m of STORJ.mountains) m.grid = { x0: m.x - m.foot - 2, x1: m.x + m.foot + 2, y0: BOUNDS.high - 1, y1: m.top + 8, z0: m.z - m.foot - 2, z1: m.z + m.foot + 2 };
  // The two docks, one on each bank at the island's middle, each in the shipyard's style: a stone `quay` along the bank,
  // an oak `pier` out into the channel from its middle, and a timber `boardwalk` on stilts along the waterfront either
  // side, all at `y`; `face` is the way the bank looks out over the channel (+1, toward +z, from the north strip; the north dock first).
  // Behind each on its terrace stand three of the shipyard's longhouses (`houses`, each `hx` by `hz` about its middle,
  // its door to the channel, a walker's wall up to `top`), and from the terrace's back a way climbs to the foot of that
  // strip's mountain path (`spurs`). The rowboat moors along each quay's face east of the pier (`FERRY.storjN`,
  // `FERRY.storjS`).
  {
    const y = SEA + 1.1, x = STORJ.x, Q = 12;
    STORJ.houses = [];
    STORJ.docks = [1, -1].map((face) => {
      const bank = STORJ.z - face * STORJ.fjord.half, back = bank - face * 5;
      const zs = (a, b) => ({ z0: Math.min(a, b), z1: Math.max(a, b) });
      const d = { face, bank, y, quay: { x0: x - Q, x1: x + Q, ...zs(back, bank) }, pier: { x0: x - 1.3, x1: x + 1.3, ...zs(bank, bank + face * 14) },
        boardwalk: [{ x0: x + Q, x1: x + 52, ...zs(back + face * 1.5, bank) }, { x0: x - 52, x1: x - Q, ...zs(back + face * 1.5, bank) }],
        terrace: zs(bank, bank - face * STORJ.terrace.depth) };
      for (const dx of [-40, -18, 36]) STORJ.houses.push({ x: x + dx, z: bank - face * 13, hx: 8.5, hz: 6, y: y - 0.1, yaw: face > 0 ? 0 : Math.PI, top: y + 6.4 });
      return d;
    });
    FERRY.storjN = { x: x + 6.6, z: STORJ.docks[0].bank + 1.15, deck: y, walkZ: STORJ.docks[0].bank - 1.2, side: 1, faceZ: 1 };
    FERRY.storjS = { x: x + 6.6, z: STORJ.docks[1].bank - 1.15, deck: y, walkZ: STORJ.docks[1].bank + 1.2, side: 1, faceZ: -1 };
  }
  /** The nearest distance from (x, z) to the polyline `pts`. */
  const lineDist = (pts, x, z) => {
    let best = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  /** How far (x, z) lies inland of Cold Storj's sea shore, about, negative out at sea (the channel not counted). */
  const storjCoast = (x, z) => {
    const n = Math.pow(Math.pow(Math.abs(x - STORJ.x) / STORJ.a, STORJ.p) + Math.pow(Math.abs(z - STORJ.z) / STORJ.b, STORJ.p), 1 / STORJ.p);
    return (1 - n) * 228 + (noise(x * 0.06 + 71, z * 0.06 + 3) - 0.5) * 2 * STORJ.wobble;
  };
  /** How far (x, z) lies from the channel's water, negative in it; straight along the docks' banks, so each quay meets it. */
  const storjInlet = (x, z) => {
    const near = Math.abs(x - STORJ.x) < STORJ.terrace.half + 6;
    return lineDist(STORJ.fjord.pts, x, z) - STORJ.fjord.half - (near ? 0 : (noise(x * 0.09 + 5, z * 0.09 + 17) - 0.5) * 4);
  };
  /** Whether (x, z) is Cold Storj's land, and whether it is the water of its channel inside its shore. */
  const storjLand = (x, z) => x < STORJ.east + 12 && x > STORJ.west - 12 && storjCoast(x, z) > 0 && storjInlet(x, z) > 0;
  const storjInner = (x, z) => x < STORJ.east + 30 && x > STORJ.west - 30 && storjInlet(x, z) <= 0;
  /** Mountain `m`'s own height over (x, z), absolute, or -Infinity off its foot: the main cone, its lesser peaks and
   *  their jag. */
  const massif = (m, x, z) => {
    const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d >= m.foot) return -Infinity;
    let h = m.top * Math.pow(1 - d / m.foot, m.curve);
    for (const [px, pz, top, foot] of m.peaks) { const e = Math.hypot(dx - px, dz - pz); if (e < foot) h = Math.max(h, top * Math.pow(1 - e / foot, 1.15)); }
    return h + (noise(x * 0.11 + 33, z * 0.11 + 9) - 0.5) * 2 * m.jag * clamp01(h / 12);
  };
  /** How far out from mountain `m`'s middle its path runs at height `y`: where its main cone stands that high. */
  const pathRadius = (m, y) => m.foot * (1 - Math.pow(clamp01(y / m.top), 1 / m.curve));
  /** Where along its path mountain `m`'s path is at share `t` (0 to 1): its height and bearing, and where it is. */
  const pathPoint = (m, t, out = {}) => {
    const P = STORJ.path, y = P.y0 + (P.y1 - P.y0) * t, a = m.from + m.dir * t * P.turns * Math.PI * 2, d = pathRadius(m, y);
    out.y = y; out.a = a; out.d = d; out.x = m.x + Math.cos(a) * d; out.z = m.z + Math.sin(a) * d; return out;
  };
  /** The path round mountain `m` at (x, z): `{ y, off, t }` for the pass nearest, where `off` is how far out from its
   *  line (positive downhill), or null where no pass runs within reach. `end` pass a little past its far end too. */
  const PASS = { y: 0, off: 0, t: 0 };
  const pathAt = (m, x, z, reach, end = 0) => {
    const P = STORJ.path, dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d > m.foot) return null;
    let a = Math.atan2(dz, dx), best = Infinity;
    const span = P.turns * Math.PI * 2, extra = end / Math.max(8, pathRadius(m, P.y1));
    for (let k = -1; k <= 2; k++) {
      const u = (m.dir * (a + k * Math.PI * 2 - m.from)) / span;
      if (u < 0 || u > 1 + extra) continue;
      const tc = Math.min(u, 1), y = P.y0 + (P.y1 - P.y0) * tc, off = d - pathRadius(m, y);
      if (Math.abs(off) < Math.abs(best) && Math.abs(off) < reach) { best = off; PASS.y = y; PASS.off = off; PASS.t = u; }
    }
    return best === Infinity ? null : PASS;
  };
  /** The floor of a cave's notch at (x, z), or null outside them all: each cut `CAVE.deep` into the mountain behind
   *  its mouth, `CAVE.half` either side, its ice `CAVE.ice` in; behind the ice, to a walker (unless `carve`), a wall. */
  const CAVE = { deep: 3.9, half: 2.1, lip: 0.5, ice: 2.7 };
  const caveNotch = (x, z, carve = false) => {
    for (let i = 0; i < STORJ.caveAt.length; i++) {
      const c = STORJ.caveAt[i], dx = x - c.x, dz = z - c.z, sn = Math.sin(c.yaw), cs = Math.cos(c.yaw), along = dx * sn + dz * cs, side = dx * cs - dz * sn;
      if (along > -CAVE.deep && along < CAVE.lip && Math.abs(side) < CAVE.half) return carve || along > -CAVE.ice ? c.y : c.y + 5;
    }
    return null;
  };
  // From the back of each dock's terrace a graded way runs to the foot of its strip's mountain path (`spurs`: from, to,
  // and the heights at either end), `half` either side of its line, the ground blending into it over `fade`.
  STORJ.spurs = STORJ.mountains.map((m, i) => {
    const p = pathPoint(m, 0), d = STORJ.docks[i];
    return { ax: STORJ.x, az: d.bank - d.face * STORJ.terrace.depth, ay: d.y - 0.1, bx: p.x, bz: p.z, by: STORJ.path.y0, half: 3, fade: 6 };
  });
  const SPUR = { k: 0, y: 0, e: 0 };
  /** How much (x, z) is on a spur (1 on it, fading off), the spur's height there and how far off its line. */
  const onSpur = (x, z) => {
    SPUR.k = 0;
    if (x > STORJ.x + 30 || x < STORJ.x - 80) return SPUR;
    for (const p of STORJ.spurs) {
      const dx = p.bx - p.ax, dz = p.bz - p.az, t = clamp01(((x - p.ax) * dx + (z - p.az) * dz) / (dx * dx + dz * dz)), e = Math.hypot(x - p.ax - dx * t, z - p.az - dz * t);
      const k = 1 - smooth((e - p.half) / p.fade);
      if (k > SPUR.k) { SPUR.k = k; SPUR.y = p.ay + (p.by - p.ay) * t; SPUR.e = e; }
    }
    return SPUR;
  };
  /** The height of a spur's walked surface at (x, z), or null off them all. */
  const storjWay = (x, z) => { const s = onSpur(x, z); return s.k > 0 && s.e < 3 ? s.y : null; };
  /** The path's walked height at (x, z), or null off every path's ribbon: a mountain path, a cave's notch, or a spur. */
  const storjPath = (x, z) => {
    if (x > STORJ.east || x < STORJ.west || !storjLand(x, z)) return null;
    const notch = caveNotch(x, z);
    if (notch !== null) return notch;
    for (const m of STORJ.mountains) { const p = pathAt(m, x, z, STORJ.path.w); if (p && p.t <= 1) return p.y; }
    return storjWay(x, z);
  };
  /** How much (x, z) is on a dock's terrace behind its waterfront (1 on it, fading off behind and at its ends). */
  const onTerrace = (x, z) => {
    if (Math.abs(x - STORJ.x) > STORJ.terrace.half + 4) return 0;
    let k = 0;
    for (const d of STORJ.docks) {
      const into = (d.bank - z) * d.face;
      if (into < -6 || into > STORJ.terrace.depth + 6) continue;
      k = Math.max(k, (1 - smooth((into - STORJ.terrace.depth) / 5)) * (1 - smooth((Math.abs(x - STORJ.x) - STORJ.terrace.half) / 4)));
    }
    return k;
  };
  /** Cold Storj's own ground: the sea bed, deep in the channel and right up to every cliff; the sea cliff up from the
   *  water; the plateau; the mountains on it; each dock's quay and terrace; the paths cut into the mountains as
   *  ledges, and the ways up to them. */
  const storjHeight = (x, z) => {
    if (x > STORJ.east + 40 || x < STORJ.west - 40) return -Infinity;
    const c = storjCoast(x, z), inlet = storjInlet(x, z), wall = Math.min(c, inlet);
    // The quays' stone stands on the bed out from the bank.
    for (const d of STORJ.docks) { const Q = d.quay; if (x > Q.x0 + 0.1 && x < Q.x1 - 0.1 && z > Q.z0 + 0.1 && z < Q.z1 - 0.1) return d.y - 0.6; }
    // Off the cliffs the bed is deep at once, so any ship, the galleon too, can sail along under them.
    if (wall <= 0) return SEA - STORJ.deep - 1;
    let h = SEA + STORJ.cliff + Math.min(wall, 18) * 0.12 + STORJ.plain * smooth((wall - 4) / 30) + (noise(x * 0.05 + 3, z * 0.05 + 61) - 0.5) * 2 * STORJ.roll * smooth(wall / 12);
    for (const m of STORJ.mountains) h = Math.max(h, massif(m, x, z));
    const t = onTerrace(x, z);
    if (t > 0) h += (SEA + 1.1 - 0.15 - h) * t;
    const spur = onSpur(x, z);
    if (spur.k > 0) h += (spur.y - h) * spur.k;
    const way = storjWay(x, z);
    if (way !== null) h = way - 0.3;
    // The mountain paths: the ribbon at the path's height (a little under, for the blocks to round under it), a
    // shoulder outside it cut lower so the ledge reads, and past each path's end the mountain left standing high.
    for (const m of STORJ.mountains) {
      const P = STORJ.path, p = pathAt(m, x, z, P.w + P.shoulder, P.end);
      if (!p) continue;
      if (p.t > 1) { if (Math.abs(p.off) < P.w + 0.5) h = Math.max(h, p.y + 4); continue; }
      if (Math.abs(p.off) <= P.w) h = p.y - 0.3;
      else if (p.off > 0) h = Math.min(h, p.y - 0.3 - (p.off - P.w) * 1.2);
    }
    const notch = caveNotch(x, z, true);
    return notch !== null ? notch - 0.3 : h;
  };
  // The caves along the paths: [x, z, y, yaw] at each one's mouth, on the path's uphill side facing out.
  STORJ.caveAt = [];
  for (const m of STORJ.mountains) for (const t of STORJ.caves) {
    const p = pathPoint(m, t), d = p.d - STORJ.path.w - 0.4;
    STORJ.caveAt.push({ x: m.x + Math.cos(p.a) * d, z: m.z + Math.sin(p.a) * d, y: p.y, yaw: Math.atan2(Math.cos(p.a), Math.sin(p.a)) });
  }
  // The great stone knights on the headlands either side of each mouth, facing out to sea: each `r` round its middle
  // in a flier's way up to `top`.
  STORJ.statues = [[-796, -117], [-799, 17]].flatMap(([x, z]) => [{ x, z, yaw: Math.PI / 2 }, { x: storjMirror(x), z, yaw: -Math.PI / 2 }]).map((st) => ({ ...st, r: 8, scale: 12.5 }));
  // The ogres that keep the land at each end of both strips, three a group.
  STORJ.ogres = [-1, 1].flatMap((s) => [[-852, 98], [-866, 112], [-880, 96]].flatMap(([x, dz]) => [x, storjMirror(x)].map((ox) => ({ x: ox, z: STORJ.z + s * dz, yaw: s > 0 ? Math.PI : 0 }))));
  /** The house (x, z) is in, grown by `r`, or null. */
  const storjHouse = (x, z, r = 0) => {
    if (Math.abs(x - STORJ.x) > STORJ.terrace.half + 2) return null;
    for (const h of STORJ.houses) if (Math.abs(x - h.x) < h.hx + r && Math.abs(z - h.z) < h.hz + r) return h;
    return null;
  };
  /** The ground's height, before the terrain rounds it to its blocks: level where a traveller walks, hills rising away
   *  from it to the castle island's shore and its cliff, cut back under the stair, the moat dug out round the castle;
   *  and the islet across the water. */
  const heightAt = (x, z) => {
    // Far to the west there is Cold Storj alone, and the open sea's bed.
    if (x < STORJ.east + 40) return Math.max(storjHeight(x, z), outpostHeight(x, z), SEA - 30);
    const m = moatDist(x, z);
    if (m < 0) return Math.max(MOAT.bed, m * MOAT.bank);
    const d = playDist(x, z);
    let h = 0;
    if (d > 3) h = smooth((d - 3) / 34) * (5.5 + 5 * noise(x * 0.035, z * 0.035)) + smooth((d - 3) / 7) * (noise(x * 0.13 + 7, z * 0.13 + 3) - 0.35) * 1.4;
    // Down to the shore: a beach rising from the waterline, rocks breaking it here and there, steep as a cliff at the
    // north end; the sea bed beyond.
    const c = coastDist(x, z);
    h = Math.min(h, c >= 0 ? SEA + 0.4 + c * ISLAND.beach * (1 + 5 * cliff(z)) * (0.75 + 0.5 * noise(x * 0.09 + 5, z * 0.09 + 11)) : SEA + 0.4 + c * ISLAND.bed);
    // Under the stair and the quay, the cliff is cut back so the steps stand clear of it.
    const ax = Math.abs(x);
    if (z >= STAIRS.z0 && z < QUAY.z1 + 0.6 && ax < (z > QUAY.z0 - 0.4 ? QUAY.halfW : STAIRS.halfW) + 0.6) h = Math.min(h, stairsAt(Math.min(ax, STAIRS.halfW), Math.min(z, QUAY.z1)) - 0.6);
    return Math.max(h, isletHeight(x, z), volcanoHeight(x, z), storjHeight(x, z), arenaHeight(x, z), shardsHeight(x, z), outpostHeight(x, z));
  };

  // What stands in a walker's way on the level: the sentinels' plinths and the arch's jambs, [x, z, radius].
  const BLOCKS = [
    ...STATUES.map((s) => [s.x, s.z, STATUE_R]), ...GUARDS.map((g) => [g.x, g.z, g.r]),
    [-(ARCH.halfW + 0.75), ARCH.z, 0.85], [ARCH.halfW + 0.75, ARCH.z, 0.85], ...BLOCKS_WEST, ...BLOCKS_EAST
  ];
  /** Whether a body `r` across its middle may stand in the castle's yard at (x, z): inside the curtain, clear of the
   *  gatehouse, the corner towers and the keep. */
  const inYard = (x, z, r) => {
    const ax = Math.abs(x);
    if (ax > YARD.half - r || z < CZ - YARD.halfZ + r || z > CZ + YARD.halfZ - r) return false;
    if (z > GATE.back - r && ax < GATE.halfW + r) return false;
    for (let i = 0; i < CASTLE.towers.length; i++) if (Math.hypot(x - CASTLE.towers[i][0], z - CASTLE.towers[i][1]) < CASTLE.tower + 0.3 + r) return false;
    // A tower door's porch stands out of its tower into the yard.
    for (let i = 0; i < TOWER_DOORS.length; i++) {
      const d = TOWER_DOORS[i], ox = x - d.cx, oz = z - d.cz, out = ox * d.dx + oz * d.dz, side = Math.abs(ox * d.dz - oz * d.dx);
      if (out > 0 && out < d.front + r && side < d.frame + r) return false;
    }
    return !inKeep(x, z, r);
  };
  /** Whether a body `r` across its middle may stand on the castle's low ground at (x, z), all of it at y 0: the court,
   *  the abutment, the drawbridge `down` or raised, the gate's passage with the portcullis up (`gate`) or shut, and the
   *  yard. */
  const standable = (x, z, r, down, gate = false) => {
    for (let i = 0; i < BLOCKS.length; i++) if (Math.hypot(x - BLOCKS[i][0], z - BLOCKS[i][1]) < BLOCKS[i][2] + r) return false;
    const ax = Math.abs(x);
    if (Math.hypot(x - COURT.x, z - COURT.z) <= COURT.r - r) return true;
    if (ax <= ABUTMENT.deck - r && z <= ABUTMENT.z1 + 1.6 && z >= ABUTMENT.z0 + (down ? -0.2 : r + 0.2)) return true;
    if (down && ax <= LEAF.halfW - 0.3 - r && z <= ABUTMENT.z0 + 0.2 && z >= LEAF.hinge - 0.2) return true;
    if (down && ax <= GATE.passage - r && z <= LEAF.hinge + 0.2 && z >= (gate ? GATE.back - 0.6 : GATE.portcullis + 0.4 + r)) return true;
    // The west and east gates' passages through the curtain: all of each with its portcullis up, either side of the
    // bars with it shut.
    if (ax >= YARD.half - r && ax <= CASTLE.half + 1 && Math.abs(z - WEST.z) <= WEST.half - r && (gate || Math.abs(ax + WEST.bars) >= 0.4 + r)) return true;
    // And the back gate's, through the back curtain.
    if (ax <= BACK.half - r && z <= CZ - YARD.halfZ + r && z >= CZ - CASTLE.halfZ - 1 && (gate || Math.abs(z - BACK.bars) >= 0.4 + r)) return true;
    // Once inside, the yard stays underfoot however the gate stands.
    return inYard(x, z, r);
  };

  // The lanterns, in the order they are met from the quay: [x, z, kind, turn, base]. A `pier` stands on a parapet's
  // pier at `base` and a `court` one on a post round the court, its arm reaching `turn`, both always lit. The drawbridge's own hang
  // from its rails (keep-models.js), the ferry's from its bow (scene-keep.js).
  const LANTERNS = [], BANNERS = [], ISLET_TORCHES = [], ARENA_COLUMNS = [], ARENA_COLUMN_R = 1;
  {
    const ground = (x, z) => Math.max(SEA, Math.round(heightAt(x, z) / 0.5) * 0.5);
    // The islet has no lanterns: torches stand round the inside of its plateau's edge, clear of the arch and the
    // path's head, and down both sides of the path to the dock (`ISLET_TORCHES`: [x, z, base]).
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2, x = ISLET.x + Math.sin(a) * (ISLET.plateau - 1.4), z = ISLET.z + Math.cos(a) * (ISLET.plateau - 1.4);
      if (Math.abs(x - ISLET.x) < 4.2 && (z < ISLET.z || z > ARCH.z - 3)) continue;
      ISLET_TORCHES.push([x, z, ground(x, z)]);
    }
    for (let z = ISLET_PATH.z1 - 0.5; z > ISLET_PATH.z0 + 0.5; z -= 3.6) for (const sx of [-1, 1]) ISLET_TORCHES.push([ISLET.x + sx * (ISLET_PATH.halfW + 0.7), z, ground(ISLET.x + sx * (ISLET_PATH.halfW + 0.7), z)]);
    // CBDC's: down both sides of the path from its dock, before the wall's gate, down both sides of the way from the
    // gate to the cave, and either side of the cave's mouth.
    {
      const V = VOLCANO, C = V.court, W = V.wall, gate = V.cone.x - W.apothem, land = (x, z) => Math.max(SEA, Math.round(volcanoHeight(x, z) / 0.5) * 0.5);
      for (let x = V.dock.quay.x1 + 1.5; x < C.x0; x += 3.6) for (const s of [-1, 1]) ISLET_TORCHES.push([x, V.z + s * 3, land(x, V.z + s * 3)]);
      for (let x = gate + W.half + 2.4; x < V.mouth.x0 - 1; x += 3.6) for (const s of [-1, 1]) ISLET_TORCHES.push([x, V.z + s * 3.4, land(x, V.z + s * 3.4)]);
      for (const [x, z] of [[gate - W.half - W.pillarOut - 1.2, W.gate.half + 1.6], [V.mouth.x0 + 1, V.mouth.half + 1.3]]) for (const s of [-1, 1]) ISLET_TORCHES.push([x, V.z + s * z, land(x, V.z + s * z)]);
    }
    // Shards': down both sides of the way from its dock to the trench, along the trench's rim either side, and either
    // side of the cave's mouth on the plateau over it.
    {
      const S = SHARDS, T = S.trench, land = (x, z) => Math.max(SEA, Math.round(shardsHeight(x, z) / 0.5) * 0.5);
      for (let x = S.dock.quay.x1 + 1.5; x < T.x0 - 1; x += 3.6) for (const s of [-1, 1]) ISLET_TORCHES.push([x, S.z + s * 3, land(x, S.z + s * 3)]);
      for (let x = T.x0 + 1; x < T.court.x1; x += 3.6) for (const s of [-1, 1]) { const z = S.z + s * (x < T.court.x0 ? T.half + 0.9 : T.court.half + 0.9); ISLET_TORCHES.push([x, z, land(x, z)]); }
      for (const s of [-1, 1]) ISLET_TORCHES.push([T.notch.x0 + 1.5, S.z + s * (T.notch.half + 1.6), S.plateau]);
      // Its crystal clusters (keep-models.js `shardsCrystals`): on a sunflower's spiral over its dry ground, clear of
      // the way, the trench, the dock and the torches, each `size`, its lead crystal `tall` over its `base`, and in a
      // walker's way.
      const golden = Math.PI * (3 - Math.sqrt(5)), n = 96, torches = ISLET_TORCHES.length;
      S.clusters = [];
      for (let k = 0; k < n; k++) {
        const at = (S.r - 5) * Math.sqrt((k + 0.5) / n), a = k * golden + (hash2(k, 7) - 0.5) * 0.6, x = S.x + Math.sin(a) * at, z = S.z + Math.cos(a) * at;
        if (shardsHeight(x, z) < SEA + 1.4 || (x < T.notch.x1 + 4 && Math.abs(z - S.z) < 6.5) || (x < S.dock.quay.x1 + 4 && Math.abs(z - S.z) < 15)) continue;
        let clear = true;
        for (let i = 0; i < torches; i++) if (Math.hypot(x - ISLET_TORCHES[i][0], z - ISLET_TORCHES[i][1]) < 2.6) { clear = false; break; }
        if (!clear) continue;
        const size = (0.55 + 1.25 * hash2(k, 13)) * (1.15 - 0.45 * at / S.r);
        S.clusters.push({ x, z, size, seed: k, base: land(x, z), tall: 1.6 + 2.6 * size });
        BLOCKS.push([x, z, 0.25 + 0.3 * size]);
      }
    }
    // Cold Storj's: up both sides of each way from a dock to its mountain, and along the downhill edge of each mountain path,
    // with one either side of every cave's mouth.
    {
      const S = STORJ;
      for (const p of S.spurs) { const len = Math.hypot(p.bx - p.ax, p.bz - p.az), n = Math.floor(len / 7); for (let k = 1; k < n; k++) { const t = k / n, nx = -(p.bz - p.az) / len, nz = (p.bx - p.ax) / len; for (const sg of [-1, 1]) ISLET_TORCHES.push([p.ax + (p.bx - p.ax) * t + nx * sg * 3.6, p.az + (p.bz - p.az) * t + nz * sg * 3.6, p.ay + (p.by - p.ay) * t]); } }
      for (const m of S.mountains) {
        const len = S.path.turns * Math.PI * 2 * (pathPoint(m, 0).d + pathPoint(m, 1).d) / 2, n = Math.round(len / 15);
        for (let k = 1; k <= n; k++) { const p = pathPoint(m, k / n), d = p.d + S.path.w - 0.5; ISLET_TORCHES.push([m.x + Math.cos(p.a) * d, m.z + Math.sin(p.a) * d, p.y]); }
      }
      for (const c of S.caveAt) for (const sg of [-1, 1]) { const ax = Math.cos(c.yaw) * sg * 3.1, az = -Math.sin(c.yaw) * sg * 3.1; ISLET_TORCHES.push([c.x + ax + Math.sin(c.yaw) * 0.9, c.z + az + Math.cos(c.yaw) * 0.9, c.y]); }
      // Before each house, between it and the boardwalk.
      for (const h of S.houses) for (const sg of [-1, 1]) ISLET_TORCHES.push([h.x + sg * (h.hx + 1.2), h.z + (h.z > S.z ? -1 : 1) * (h.hz - 0.5), h.y]);
    }
    // The arena's columns, but where the bridge comes in.
    { const A = ARENA_ISLE; for (let i = 0; i < A.columns; i++) { const a = (i + 0.5) / A.columns * Math.PI * 2; if (Math.abs(Math.cos(a)) < 0.3 && Math.sin(a) > 0) continue; ARENA_COLUMNS.push([A.x + Math.cos(a) * (A.r - A.column), A.z + Math.sin(a) * (A.r - A.column), A.y]); } }
    for (const [x, z] of ISLET_TORCHES) BLOCKS.push([x, z, 0.22]);
    for (const [x, z] of ARENA_COLUMNS) BLOCKS.push([x, z, ARENA_COLUMN_R]);
    for (const s of [-1, 1]) LANTERNS.push([s * (QUAY.halfW - 0.3), QUAY.z1 - 0.4, "pier", 0, QUAY.y]);
    for (const z of [STAIRS.b0 - 1, STAIRS.z0 + 0.4]) for (const s of [-1, 1]) LANTERNS.push([s * (STAIRS.halfW - 0.25), z, "pier", 0, stairsAt(0, z)]);
    for (const [x, z] of [[-9.6, 5.5], [9.6, 5.5], [-8.6, -5.6], [8.6, -5.6]]) LANTERNS.push([x, z, "court", x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
    for (const z of [ABUTMENT.z1 - 0.5, ABUTMENT.z0 + 0.5]) for (const s of [-1, 1]) LANTERNS.push([s * (ABUTMENT.halfW - 0.3), z, "pier", 0, 0]);
    // The shipyard's posts: down the quay's east edge either side of the stair's foot, and out along the longships' pier.
    for (const z of [-96, -78, -62, -38, -22, -4]) LANTERNS.push([SHIPYARD.quay.x1 - 0.6, z, "post", -Math.PI / 2, SHIPYARD.y]);
    for (const x of [-156, -173]) LANTERNS.push([x, SHIPYARD.piers[0].z1 - 0.3, "post", Math.PI, SHIPYARD.y]);
    // The Armory & Forge's: down its quay's west edge either side of the stair's foot, their arms out over the quay.
    for (const z of [-76, -64, -36, -24]) LANTERNS.push([ARMORY.quay.x0 + 0.6, z, "post", Math.PI / 2, ARMORY.y]);
    // The volcano island's dock: two posts on its quay's landward edge, their arms out over the quay.
    for (const s of [-1, 1]) LANTERNS.push([VOLCANO.dock.quay.x1 - 0.6, VOLCANO.z + s * 8.5, "post", -Math.PI / 2, VOLCANO.dock.y]);
    // Shards' dock: two posts on its quay's landward edge, their arms out over the quay.
    for (const s of [-1, 1]) LANTERNS.push([SHARDS.dock.quay.x1 - 0.6, SHARDS.z + s * 8.5, "post", -Math.PI / 2, SHARDS.dock.y]);
    // Outpost Island's: either side of each bridge's foot on its cross, their arms over the bridge, and at each pier's end.
    for (const a of OUTPOST.arms) {
      const D = OUTPOST.dock, at = (u, v) => [a.gx + a.dx * u + a.nx * v, a.gz + a.dz * u + a.nz * v], turn = Math.atan2(-a.dx, -a.dz);
      for (const s of [-1, 1]) { const [x, z] = at(D.at + 0.6, s * (OUTPOST.bridge.halfW + 1.2)); LANTERNS.push([x, z, "post", turn, D.y]); }
      for (const s of [-1, 1]) { const [x, z] = at(D.at + D.w + D.pier.len - 0.5, s * (D.pier.half - 0.35)); LANTERNS.push([x, z, "post", turn, D.y]); }
    }
    // And Cold Storj's: two posts on its quay's landward edge, their arms out over the quay.
    for (const d of STORJ.docks) {
      const land = d.face > 0 ? d.quay.z0 + 0.6 : d.quay.z1 - 0.6, turn = d.face > 0 ? 0 : Math.PI;
      for (const s of [-1, 1]) LANTERNS.push([STORJ.x + s * 8.5, land, "post", turn, d.y]);
      for (const b of d.boardwalk) for (const k of [0.3, 0.75]) LANTERNS.push([b.x0 + (b.x1 - b.x0) * k, land, "post", turn, d.y]);
    }
    // A standing banner either side of the top of the islet's path down to the dock, facing the arch, its arm reaching
    // out away from the path.
    for (const sx of [-1, 1]) BANNERS.push({ x: sx * 3.1, z: ISLET_PATH.z1 + 1.2, y: ground(sx * 3.1, ISLET_PATH.z1 + 1.2), yaw: sx < 0 ? Math.PI : 0, phase: sx > 0 ? 1.7 : 0 });
    // And one either side of the gatehouse on the plinth's ledge before the front wall, half again as big, its arm
    // reaching out away from the gate.
    for (const sx of [-1, 1]) BANNERS.push({ x: sx * 17, z: CZ + CASTLE.halfZ + 1.3, y: 0, yaw: sx < 0 ? Math.PI : 0, phase: sx > 0 ? 0.6 : 2.9, scale: 1.5 });
    for (const b of BANNERS) BLOCKS.push([b.x, b.z, 0.3 * (b.scale || 1)]);
    // The level sign: its boards across the middle, and its two posts.
    { const s = LEVEL_SIGN, cx = Math.cos(s.yaw), sz = -Math.sin(s.yaw);
      BLOCKS.push([s.x, s.z, 0.5], [s.x + cx * s.posts, s.z + sz * s.posts, 0.25], [s.x - cx * s.posts, s.z - sz * s.posts, 0.25]); }
    // A post standing on walked ground is in a walker's way, and so is a pier standing on the stair's or the quay's deck.
    for (const [x, z, kind, , base] of LANTERNS) if (kind !== "pier") BLOCKS.push([x, z, 0.24]); else if (base < 0) BLOCKS.push([x, z, 0.4]);
  }

  // ---------- the ground and the air, for a jetpack ----------
  // How high a walker steps up and down on foot, and under what height a body counts as on the ground among the castle's
  // low things (the yard, the gate's passage, the posts by the way); how far under the water a body stands before the
  // shore takes it back.
  const STEP = 0.6, DROP = 1.3, LOW = 3, SINK = 1.4, TERRAIN_UNIT = 0.5;
  // The castle's stone as a flier meets it: each tower to the tip of its spire, the gatehouse's turrets to theirs, the
  // keep to the tip of its spire (its bartizans to theirs) and a porch's roof.
  const SPIRE = GALLERY.height + GALLERY.ceil + 11.7, TURRET_TOP = GATE.turretHeight + 11, BARTIZAN_TOP = KEEP.bartizanTop;
  const RUIN = { half: 6.6, z0: ARCH.z + 0.5, z1: ARCH.z + 1.9 };
  /** Whether the sea stands over the ground at (x, z), out past either island's shore. */
  const seaAt = (x, z) => heightAt(x, z) < SEA + 0.25;
  /** The top of the terrain's blocks at (x, z): the sea's surface where it stands, else the ground a block over it. */
  const terrainTop = (x, z) => {
    const u = TERRAIN_UNIT, n = Math.round((BOUNDS.high - BOUNDS.low) / u), sea = Math.round((SEA - BOUNDS.low) / u);
    if (seaAt(x, z)) return BOUNDS.low + sea * u;
    return BOUNDS.low + Math.max(sea + 1, Math.min(n, Math.round((heightAt(x, z) - BOUNDS.low) / u))) * u;
  };
  /** The top of the land at (x, z): the terrain's blocks, or, where the volcano's cone stands over their cap, the top
   *  of the cone's own block there. */
  const landTop = (x, z) => {
    // Cold Storj's mountain paths: their own smooth height, over the blocks cut under them.
    if (x < STORJ.east) { const path = storjPath(x, z); if (path !== null) return path; }
    const top = terrainTop(x, z);
    if (top < BOUNDS.high) return top;
    // Over the cap on Cold Storj, its mountain's own block there.
    if (x < STORJ.east) {
      const u = STORJ.unit, cx = (Math.floor(x / u) + 0.5) * u, cz = (Math.floor(z / u) + 0.5) * u, h = storjHeight(cx, cz);
      return h >= BOUNDS.high - 1 ? Math.round(h) : top;
    }
    const G = VOLCANO.cone.grid, u = VOLCANO.cone.unit, h = volcanoHeight(G.x0 + (Math.floor((x - G.x0) / u) + 0.5) * u, G.z0 + (Math.floor((z - G.z0) / u) + 0.5) * u);
    return h >= VOLCANO.cone.base ? Math.round(h) : top;
  };
  for (const st of STORJ.statues) { st.y = terrainTop(st.x, st.z) + 1.6; st.top = st.y + 3.2 * st.scale; }
  /** Whether a body with its feet at `feet` stands in lava at (x, z): a stream's channel, or the crater's lake. */
  const lavaAt = (x, z, feet) => {
    if (x < VOLCANO.x - VOLCANO.r - 2) return false;
    const s = lavaStream(x, z);
    return s !== 0 && !seaAt(x, z) && feet < landTop(x, z) + 0.6;
  };
  /** Which cave a walker at (x, z) has gone in under the mouth of far enough to go underground (`cave` under the
   *  volcano, `shards` under Shards' lintel), or null. */
  const caveAt = (x, z) => x > VOLCANO.mouth.enter && inVolcanoMouth(x, z) ? "cave" : x > SHARDS.mouth.enter && inShardsNotch(x, z) ? "shards" : null;
  /** The underside of the cave mouth's arch over (x, z), where the cone stands over it, or Infinity. */
  const mouthArch = (x, z) => {
    if (!inVolcanoMouth(x, z)) return Infinity;
    const M = VOLCANO.mouth, k = (z - VOLCANO.z) / M.half, arch = M.spring + M.rise * Math.sqrt(Math.max(0, 1 - k * k));
    return volcanoHeight(x, z, true) >= arch + 1 ? arch : Infinity;
  };
  /** Whether (x, z), grown by `r`, lies on the castle's own ground: inside its curtain, or in a tower, the gatehouse or
   *  one of its turrets. */
  const inWard = (x, z, r = 0) => {
    const ax = Math.abs(x);
    if (ax <= CASTLE.half + r && Math.abs(z - CZ) <= CASTLE.halfZ + r) return true;
    if (ax <= GATE.halfW + r && z <= GATE.front + r && z >= GATE.back - r) return true;
    if (Math.hypot(ax - GATE.turretX, z - GATE.turretZ) < GATE.turret + r) return true;
    for (let i = 0; i < CASTLE.towers.length; i++) if (Math.hypot(x - CASTLE.towers[i][0], z - CASTLE.towers[i][1]) < CASTLE.tower + 0.45 + r) return true;
    return false;
  };
  /** The top of whatever of the castle's stone stands within `r` of (x, z), 0 over the yard's open floor. */
  const wardTop = (x, z, r = 0, keep = true) => {
    const ax = Math.abs(x), dz = Math.abs(z - CZ);
    let top = 0;
    if (ax <= CASTLE.half + r && dz <= CASTLE.halfZ + r && (ax >= CASTLE.half - CASTLE.wall - r || dz >= CASTLE.halfZ - CASTLE.wall - r)) top = CASTLE.walk;
    if (ax <= GATE.halfW + r && z <= GATE.front + r && z >= GATE.back - r) top = Math.max(top, GATE.height);
    if (Math.hypot(ax - GATE.turretX, z - GATE.turretZ) < GATE.turret + r) top = Math.max(top, TURRET_TOP);
    for (let i = 0; i < CASTLE.towers.length; i++) {
      const t = CASTLE.towers[i];
      if (Math.hypot(x - t[0], z - t[1]) < CASTLE.tower + 0.45 + r) top = Math.max(top, CASTLE.towerWalk[t[2]] + SPIRE);
    }
    // The keep to its spire, tapering to its tip.
    if (keep && inKeep(x, z, r)) top = Math.max(top, KEEP.roof + KEEP.arcade + KEEP.spire * Math.max(0, 1 - Math.max(0, Math.hypot(x - KEEP.x, z - KEEP.z) - r) / (KEEP.r + 1.2)));
    if (keep) for (let i = 0; i < KEEP.bartizans.length; i++) { const a = KEEP.bartizans[i]; if (Math.hypot(x - KEEP.x - Math.cos(a) * KEEP.bartizan, z - KEEP.z - Math.sin(a) * KEEP.bartizan) < KEEP.br + 0.3 + r) top = Math.max(top, BARTIZAN_TOP); }
    for (let i = 0; i < TOWER_DOORS.length; i++) {
      const d = TOWER_DOORS[i], ox = x - d.cx, oz = z - d.cz, out = ox * d.dx + oz * d.dz;
      if (out > 0 && out < d.front + r && Math.abs(ox * d.dz - oz * d.dx) < d.frame + r) top = Math.max(top, 6.3);
    }
    return top;
  };
  /** The floor of the balcony a body with its feet at `feet` stands over at (x, z), its middle out on the ring past
   *  the keep's face, or null off them. */
  // Each of these takes the keep's middle as `c`: the castle's, or Outpost Island's (`OUTPOST_KEEP`), whose arches
  // are shut.
  const balconyAt = (x, z, feet, c = KEEP) => {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < KEEP.r - 0.05 || d > BALCONY.outer) return null;
    for (let i = BALCONY.floors.length - 1; i >= 0; i--) if (feet >= BALCONY.floors[i] - STEP) return BALCONY.floors[i];
    return null;
  };
  /** Whether a body `r` across, its feet at `feet`, may stand at (x, z) on the balcony at `floor`: off its parapet,
   *  and off the keep's face but where one of its level's arches opens. */
  const balconyClear = (x, z, feet, r, floor, c = KEEP) => {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
    if (d + r > BALCONY.outer - BALCONY.railW && feet < floor + BALCONY.rail) return false;
    if (d - r >= KEEP.r) return true;
    if (c !== KEEP && floor !== KEEP.roof) return false;
    const level = arcadeAt(feet);
    return !!level && level.floor === floor && arcadeTop(Math.atan2(dz, dx), d, r, level.arches) > 0;
  };
  /** Whether a body `r` across in the air at `y` meets a balcony at (x, z): the underside of its deck (a body `HEAD`
   *  tall rising into it), its parapet, or a bartizan over the top one. */
  const HEAD = 2.4;
  const balconyBlocks = (x, z, y, r, c = KEEP) => {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz);
    if (d - r > BALCONY.outer || d + r < KEEP.r) return false;
    for (let i = 0; i < BALCONY.floors.length; i++) {
      const f = BALCONY.floors[i];
      if (y > f - BALCONY.deck - HEAD && y < f - 0.02) return true;
      if (y < f + BALCONY.rail && y >= f - 0.02 && d + r > BALCONY.outer - BALCONY.railW) return true;
    }
    if (y + HEAD > KEEP.bartizanFoot) for (let i = 0; i < KEEP.bartizans.length; i++) { const a = KEEP.bartizans[i]; if (Math.hypot(dx - Math.cos(a) * KEEP.bartizan, dz - Math.sin(a) * KEEP.bartizan) < KEEP.br + 0.3 + r) return y < BARTIZAN_TOP; }
    return false;
  };
  // ---------- the west bridge and the shipyard, underfoot and in the air ----------
  /** Whether (x, z), grown by `pad`, lies on or beside the way out of the west gate: the bridge and its stair. */
  // East or west alike, by folding x onto the west's.
  const westAt = (px, z, pad = 0, x = fold(px)) => x <= WEST_BRIDGE.x0 + pad && x >= WEST_STAIR.x1 - pad && Math.abs(z - WEST_BRIDGE.z) <= WEST_BRIDGE.pillarZ + WEST_BRIDGE.pillarR + pad;
  /** The top of the way's parapet at (x, z) grown by `r`, or of a pillar standing there (from the ground up), or
   *  null off both. */
  const bridgeRail = (px, z, r = 0) => {
    const B = WEST_BRIDGE, dz = Math.abs(z - B.z), x = fold(px);
    if (x > B.x0 + r || x < WEST_STAIR.x1 - r || dz < B.half - r || dz > B.pillarZ + B.pillarR + r) return null;
    if (dz >= B.pillarZ - B.pillarR - r) for (let i = 0; i < B.pillars.length; i++) if (Math.abs(x - B.pillars[i]) <= B.pillarR + r) return bridgeY(B.pillars[i]) + B.rail + B.pillar;
    return dz <= B.halfW + r ? wayY(Math.min(x, B.x0)) + B.rail : null;
  };
  /** What the way gives a body's feet at `feet` to stand on at (x, z): its deck or a parapet's top from above, null
   *  from under its arches or off it. */
  const westSupport = (px, z, feet) => {
    const B = WEST_BRIDGE, x = fold(px);
    if (x > B.x0 || x < WEST_STAIR.x1 || Math.abs(z - B.z) > B.pillarZ + B.pillarR) return null;
    const rail = bridgeRail(x, z);
    if (rail !== null && feet >= rail - STEP) return rail;
    if (Math.abs(z - B.z) > B.halfW) return null;
    const deck = wayY(x);
    return feet >= deck - STEP || bridgeSoffit(x) === -Infinity ? deck : null;
  };
  /** A step on foot to (x, z) by a body `r` across with its feet at `feet`, as the way sees it: 1 along its deck, -1
   *  into its parapets, its pillars, a pier or too low an arch, 0 where it has no say. */
  const westWalk = (px, z, feet, r) => {
    const B = WEST_BRIDGE, dz = Math.abs(z - B.z), x = fold(px);
    if (x > B.x0 + r || x < WEST_STAIR.x1 - r || dz > B.pillarZ + B.pillarR + r) return 0;
    const deck = wayY(Math.min(x, B.x0)), rail = bridgeRail(x, z, r);
    if (feet > deck - B.thick) {
      if (rail !== null && rail > feet + STEP) return -1;
      if (dz > B.halfW) return 0;
      const g = rail !== null ? rail : deck;
      return g <= feet + STEP && g >= feet - DROP ? 1 : -1;
    }
    if (rail !== null && rail > deck + B.rail + 1) return -1;
    if (dz > B.halfW + r) return 0;
    return Math.min(bridgeSoffit(x - r), bridgeSoffit(x), bridgeSoffit(x + r)) < feet + 2 ? -1 : 0;
  };
  /** Whether a body `r` across in the air at `y` meets the way at (x, z): a pillar, a parapet, a pier, or the
   *  underside of its deck (a body `HEAD` tall rising into an arch). */
  const westFly = (px, z, y, r) => {
    const B = WEST_BRIDGE, dz = Math.abs(z - B.z), x = fold(px);
    if (x > B.x0 + r || x < WEST_STAIR.x1 - r || dz > B.pillarZ + B.pillarR + r) return false;
    const deck = wayY(Math.min(x, B.x0)), rail = bridgeRail(x, z, r);
    if (rail !== null && rail > deck + B.rail + 1) return y < rail - 1e-3;
    if (dz > B.halfW + r) return false;
    if (y >= deck - 1e-3) return rail !== null && y < rail - 1e-3;
    return y + HEAD > Math.min(bridgeSoffit(x - r), bridgeSoffit(x), bridgeSoffit(x + r));
  };
  // ---------- CBDC's wall, underfoot and in the air ----------
  /** Whether (x, z), grown by `pad`, lies on or beside CBDC's wall, its pillars or its stairs. */
  const cbdcAt = (x, z, pad = 0) => {
    const W = VOLCANO.wall, far = W.apothem / Math.cos(Math.PI / 8) + W.half + W.pillarOut + pad;
    if (Math.abs(x - VOLCANO.cone.x) > far || Math.abs(z - VOLCANO.cone.z) > far) return false;
    const P = wallPlace(x, z);
    return P.v <= W.half + W.pillarOut + pad && P.v >= -W.half - W.stair.wide - pad;
  };
  /** How far along its stair the place `P` is, from the stair's foot at `from` rising away from the gate, on the
   *  sides either side of the gate's; null on any other side. */
  const stairAlong = (P) => P.k === 1 ? P.u : P.k === 7 ? -P.u : null;
  /** The stair's tread under the place `P` (beside the wall's inner face), its landing at the walk's height, or null
   *  off the stair. */
  const stairTread = (P) => {
    const W = VOLCANO.wall, S = W.stair, w = stairAlong(P);
    if (w === null || w < S.from || w > S.to + S.landing || P.v >= -W.half || P.v < -W.half - S.wide) return null;
    return w >= S.to ? W.top : W.y + Math.min(S.treads, Math.floor((w - S.from) / S.tread) + 1) * S.rise;
  };
  /** The top of what stands over the walk at the place `P`, grown by `r`: a pillar, or a parapet (the inner one left
   *  open at each stair's landing); null between the parapets. */
  const wallRail = (P, r = 0) => {
    const W = VOLCANO.wall, S = W.stair;
    if (P.v > W.half - W.railW - r && P.v <= W.half + W.pillarOut + r) for (let i = 0; i < W.pillars.length; i++) if (Math.abs(P.u - W.pillars[i]) <= W.pillarR + r) return W.top + W.rail + W.pillar;
    if (P.v > W.half + r || P.v < -W.half - r) return null;
    if (P.v > W.half - W.railW - r) return W.top + W.rail;
    if (P.v >= -W.half + W.railW + r) return null;
    const w = stairAlong(P);
    return w !== null && w > S.to + r * 0.5 && w < S.to + S.landing - S.rail - r * 0.5 ? null : W.top + W.rail;
  };
  /** How high the gate stands open over the place `P`, a body `r` across: its soffit, or -Infinity in the stone. */
  const gateTop = (P, r = 0) => P.k === 0 && Math.abs(P.v) <= VOLCANO.wall.half + r ? VOLCANO.wall.y + archTop(VOLCANO.wall.gate.half, VOLCANO.wall.gate.spring, Math.abs(P.u) + r) : -Infinity;
  /** What the wall gives a body's feet at `feet` to stand on at (x, z): its walk, a parapet's or a pillar's top, a
   *  stair's tread; null off it and in its gate. */
  const cbdcSupport = (x, z, feet) => {
    if (!cbdcAt(x, z)) return null;
    const W = VOLCANO.wall, P = WALL_AT;
    if (P.v < -W.half) return stairTread(P);
    const rail = wallRail(P);
    if (rail !== null && feet >= rail - STEP) return rail;
    if (P.v > W.half) return null;
    return feet >= W.top - STEP || gateTop(P) === -Infinity ? W.top : null;
  };
  /** A step on foot to (x, z) by a body `r` across with its feet at `feet`, as the wall sees it: 1 along its walk or
   *  up a stair, -1 into its stone, a parapet or a pillar, 0 where it has no say (the gate's passage among them). */
  const cbdcWalk = (x, z, feet, r) => {
    if (!cbdcAt(x, z, r)) return 0;
    const W = VOLCANO.wall, P = WALL_AT, tread = stairTread(P);
    if (tread !== null) {
      // Up the stair a tread at a time, kept on it by the rail along its open edge.
      if (P.v < -W.half - W.stair.wide + W.stair.rail + r * 0.5 && feet > W.y + STEP) return -1;
      return tread <= feet + STEP && tread >= feet - DROP ? 1 : -1;
    }
    if (feet > W.top - 2) {
      if (P.v < -W.half || P.v > W.half + W.pillarOut) return 0;
      const rail = wallRail(P, r);
      if (rail !== null && rail > feet + STEP) return -1;
      if (P.v > W.half) return 0;
      const g = rail !== null ? rail : W.top;
      return g <= feet + STEP && g >= feet - DROP ? 1 : -1;
    }
    const rail = wallRail(P, r);
    if (rail !== null && rail > W.top + W.rail + 1) return -1;
    if (P.v > W.half + r || P.v < -W.half - r) return 0;
    return gateTop(P, r) < feet + 2 ? -1 : 0;
  };
  /** Whether a body `r` across in the air at `y` meets the wall at (x, z): its stone, a parapet, a pillar, a stair, or
   *  the gate's soffit (a body `HEAD` tall rising into it). */
  const cbdcFly = (x, z, y, r) => {
    if (!cbdcAt(x, z, r)) return false;
    const W = VOLCANO.wall, P = WALL_AT, rail = wallRail(P, r);
    if (rail !== null && rail > W.top + W.rail + 1) return y < rail - 1e-3;
    if (P.v > W.half + r) return false;
    if (P.v < -W.half - r) { const tread = stairTread(P); return tread !== null && y < tread - 1e-3; }
    if (y >= W.top - 1e-3) return rail !== null && y < rail - 1e-3;
    return y + HEAD > gateTop(P, r);
  };
  /** Whether the point (x, y, z) lies in the wall's stone or under a stair's treads. */
  const cbdcHit = (x, y, z) => {
    if (!cbdcAt(x, z)) return false;
    const W = VOLCANO.wall, P = WALL_AT;
    if (P.v > W.half) return false;
    if (P.v < -W.half) { const tread = stairTread(P); return tread !== null && y <= tread; }
    return y <= W.top && y >= gateTop(P);
  };
  /** The wall's walk or a stair's tread over (x, z) for the view to keep above, or null off both; and the gate's
   *  soffit there, -Infinity out of its passage. */
  const cbdcWalkY = (x, z) => { if (!cbdcAt(x, z)) return null; return WALL_AT.v > VOLCANO.wall.half ? null : WALL_AT.v < -VOLCANO.wall.half ? stairTread(WALL_AT) : VOLCANO.wall.top; };
  const cbdcSoffit = (x, z) => cbdcAt(x, z) ? gateTop(WALL_AT) : -Infinity;
  /** The hall whose walls, grown by `pad`, (x, z) lies within, or null. */
  const hallAt = (x, z, pad = 0) => {
    for (let i = 0; i < HALLS.length; i++) { const h = HALLS[i]; if (x >= h.x0 - pad && x <= h.x1 + pad && z >= h.z0 - pad && z <= h.z1 + pad) return h; }
    return null;
  };
  /** How high the hall `h`'s roof stands over (x, z): from its eaves up to its ridge along x. */
  const hallRoof = (h, x, z) => SHIPYARD.y + HALL.eaves + HALL.ridge * Math.max(0, 1 - Math.abs(z - h.mz) / ((h.z1 - h.z0) / 2 + HALL.over));
  /** Whether a body `r` across at (x, z) stands in one of the hall `h`'s walls, its doorway left open. */
  const hallWall = (h, x, z, r) => {
    if (x < h.x0 - r || x > h.x1 + r || z < h.z0 - r || z > h.z1 + r) return false;
    const w = HALL.wall + r;
    if (x > h.x0 + w && x < h.x1 - w && z > h.z0 + w && z < h.z1 - w) return false;
    return !(Math.abs(x - h.dx) <= HALL.door - r && (h.door < 0 ? z < h.z0 + w + 0.4 : z > h.z1 - w - 0.4));
  };
  /** Whether a body `r` across in the air at `y` meets a hall at (x, z): its walls, its roof from above the eaves, or
   *  its ceiling from inside. */
  const hallFly = (x, z, y, r) => {
    const h = hallAt(x, z, HALL.over + r);
    if (!h || y >= hallRoof(h, x, z) - 1e-3) return false;
    return hallWall(h, x, z, r) || y + HEAD > SHIPYARD.y + HALL.eaves;
  };
  /** Whether the point (x, y, z) lies in either way's stone or in a hall, for whatever flies into them. */
  const westHit = (x, y, z) => {
    if (backHit(x, y, z) || cbdcHit(x, y, z) || outpostHit(x, y, z)) return true;
    const B = WEST_BRIDGE, fx = fold(x);
    if (fx <= B.x0 && fx >= WEST_STAIR.x1 && Math.abs(z - B.z) <= B.halfW && y <= wayY(fx) && y >= bridgeSoffit(fx)) return true;
    const h = hallAt(x, z, HALL.over);
    return !!h && y <= hallRoof(h, x, z) && y >= SHIPYARD.y;
  };
  // The shipyard's low decks, each a rectangle `y` up (or sloping along z from `y` at `from` to `y1` at `to`): the ramp
  // and the brow first, since they stand on the quay.
  const DECKS = [];
  {
    const Y = SHIPYARD.y, R = SHIPYARD.ramp, top = SEA + GALLEON.afloat;
    DECKS.push({ ...R, y: Y, y1: top, from: R.z0, to: R.z1 }, { ...SHIPYARD.brow, y: top }, { ...SHIPYARD.quay, y: Y }, { ...SHIPYARD.slip, y: Y });
    for (const d of [...SHIPYARD.piers, ...SHIPYARD.planks, ...HALLS.map((h) => h.deck)]) DECKS.push({ ...d, y: Y });
    // And the Armory & Forge's quay and piers, at the same height.
    for (const d of [ARMORY.quay, ...ARMORY.piers, ...ARMORY.planks]) DECKS.push({ ...d, y: ARMORY.y });
    // And the volcano island's quay and pier, and Cold Storj's.
    for (const d of [VOLCANO.dock.quay, VOLCANO.dock.pier]) DECKS.push({ ...d, y: VOLCANO.dock.y });
    for (const d of [SHARDS.dock.quay, SHARDS.dock.pier]) DECKS.push({ ...d, y: SHARDS.dock.y });
    for (const d of OUTPOST.decks) DECKS.push({ ...d, y: OUTPOST.dock.y });
    for (const d of FAR_PLANKS) DECKS.push({ ...d, y: DOCK.y });
    for (const k of STORJ.docks) for (const d of [k.quay, k.pier, ...k.boardwalk]) DECKS.push({ ...d, y: k.y });
  }
  /** The deck of the shipyard or the Armory & Forge under (x, z), each grown by `pad`, or null off them all. */
  const shipyardDeck = (x, z, pad = 0) => {
    if (Math.abs(x) < -SHIPYARD.slip.x1 - pad) return null;
    for (let i = 0; i < DECKS.length; i++) {
      const d = DECKS[i];
      if (x >= d.x0 - pad && x <= d.x1 + pad && z >= d.z0 - pad && z <= d.z1 + pad) return d.y1 === undefined ? d.y : d.y + (d.y1 - d.y) * clamp01((z - d.from) / (d.to - d.from));
    }
    return null;
  };
  /** The top of a ship's deck under (x, z) grown by `r`, over the sea, where each now lies, or null off them all. */
  const shipTop = (x, z, r = 0) => {
    for (let i = 0; i < SHIPS.length; i++) {
      const g = SHIPS[i], dx = x - g.x, dz = z - g.z, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw);
      const a = dx * sn + dz * cs, c = dx * cs - dz * sn, at = Math.min(g.bow - 0.3, Math.max(-g.bow + 0.3, a)), half = shipHalf(g, at);
      if (a > g.bow + r || a < -g.bow - r || Math.abs(c) > half + r) continue;
      return SEA + (g.kind === "galleon" ? galleonTop(at / g.scale, c / g.scale) : longshipTop(at / g.scale, c / g.scale)) * g.scale;
    }
    return null;
  };
  /** Whether the boat may lie at (x, z): deep water off every deck, the stair, the quay, the islet's dock, the west
   *  and east bridges' piers (their arches are open to it) and the ships, inside the land's bounds. */
  const navigable = (x, z) => {
    if (!inBounds(x, z) || heightAt(x, z) > SEA - FERRY.draft) return false;
    const ax = Math.abs(x);
    if (ax <= STAIRS.halfW + 0.15 && z >= STAIRS.z0 - 1 && z <= STAIRS.b1) return false;
    if (ax <= QUAY.halfW + 0.05 && z >= QUAY.z0 - 0.1 && z <= QUAY.z1 + 0.1) return false;
    if (ax <= DOCK.halfW + 0.12 && z >= DOCK.z0 - 0.1 && z <= DOCK.z1 + 0.1) return false;
    const fx = fold(x);
    if (fx < WEST_BRIDGE.x0 && ((westAt(fx, z, 0.2) && (bridgeSoffit(fx) === -Infinity || bridgeRail(fx, z, 0.2) > wayY(fx) + WEST_BRIDGE.rail + 1)) || shipyardDeck(x, z, 0.15) !== null)) return false;
    if (backFoul(x, z, 0.2) || outpostFoul(x, z, 0.2)) return false;
    return shipTop(x, z, 0.3) === null;
  };
  /** Whether a ship's hull may lie over (x, z): inside the land's bounds and off everything built in the water (the
   *  sea stair and its quay, the islet's dock, both bridges and their stairs, every quay, pier and stage). How deep
   *  the water must be is the ship's own affair (scene-keep.js `shipFoul`). */
  const hullClear = (x, z) => {
    if (!inBounds(x, z)) return false;
    const ax = Math.abs(x);
    if (ax <= STAIRS.halfW + 0.3 && z >= STAIRS.z0 - 1 && z <= QUAY.z1 + 0.3) return false;
    if (ax <= QUAY.halfW + 0.3 && z >= QUAY.z0 - 0.3 && z <= QUAY.z1 + 0.3) return false;
    if (ax <= DOCK.halfW + 0.3 && z >= DOCK.z0 - 0.3 && z <= DOCK.z1 + 0.3) return false;
    return !westAt(x, z, 0.5) && !backFoul(x, z, 0.5) && !outpostFoul(x, z, 0.5) && shipyardDeck(x, z, 0.3) === null;
  };
  /** The ruin behind the arch: how high it stands at `x`, or 0 off it. */
  const ruinTop = (x, z, r = 0) => Math.abs(x) < RUIN.half + r && z > RUIN.z0 - r && z < RUIN.z1 + r ? 4 + 6.5 * Math.pow(Math.max(0, Math.cos(x / RUIN.half * Math.PI / 2)), 0.7) : 0;
  /** The plinth's ledge outside the curtain, a walk round the castle's foot. */
  const onLedge = (x, z) => Math.abs(x) <= CASTLE.half + CASTLE.plinthTop && Math.abs(z - CZ) <= CASTLE.halfZ + CASTLE.plinthTop;
  /** The deck a walker stands on at (x, z), its height, or null off them all: the stair's treads between its parapets,
   *  the quay at its foot, the islet's dock, the shipyard's quay, piers, stages, ramp and planks, and the Armory &
   *  Forge's quay and piers. */
  /** How far (x, z) lies from the nearest dock, quay or pier anywhere in the land (the castle island's quay and the
   *  portal islet's dock among them), in metres over the water. */
  const boxDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
  const dockDist = (x, z) => {
    let d = Math.min(boxDist(x, z, -QUAY.halfW, QUAY.halfW, QUAY.z0, QUAY.z1), boxDist(x, z, -DOCK.halfW, DOCK.halfW, DOCK.z0, DOCK.z1));
    for (let i = 0; i < DECKS.length; i++) { const k = DECKS[i]; d = Math.min(d, boxDist(x, z, k.x0, k.x1, k.z0, k.z1)); }
    return d;
  };
  const deckAt = (x, z) => {
    if (Math.abs(x) > -SHIPYARD.slip.x1 - 1) return shipyardDeck(x, z);
    const ax = Math.abs(x);
    if (ax <= STAIRS.deck && z >= STAIRS.z0 && z <= STAIRS.b1) return stairsAt(x, z);
    if (ax <= QUAY.halfW - 0.3 && z >= QUAY.z0 && z <= QUAY.z1 - 0.3) return QUAY.y;
    if (ax <= DOCK.halfW && z >= DOCK.z0 && z <= DOCK.z1) return DOCK.y;
    return null;
  };
  /** The top of the stair's parapet at (x, z), or null off it. */
  const parapetAt = (x, z, r = 0) => {
    const ax = Math.abs(x);
    return ax > STAIRS.deck - r && ax <= STAIRS.halfW + r && z >= STAIRS.z0 && z <= STAIRS.b1 ? stairsAt(STAIRS.deck, z) + 1.1 : null;
  };
  /** Where water stands at (x, z) for a body there, its surface's height, or null on dry ground: the sea and the moat. */
  const waterAt = (x, z, down, gate) => {
    if (inWard(x, z) || shipTop(x, z) !== null) return null;
    if (moatDist(x, z) < 0) return onLedge(x, z) || standable(x, z, 0, down, gate) ? null : MOAT.water;
    if (deckAt(x, z) !== null || parapetAt(x, z) !== null || stairsAt(x, z) !== null) return null;
    return seaAt(x, z) ? SEA : null;
  };
  /** The ground a body's feet at `feet` stand on at (x, z): the castle's stone where it is under them, the walked level
   *  of the yard, the decks and the ledge, the terrain's blocks, or a little under the water's surface. */
  // The cannon turrets on the castle island's front shore (the one facing the islet), two either side of the sea
  // stair: short round towers, each `r` across its middle and `rise` tall from the ground it stands on (`y`) to its deck
  // (`top`), a cannon on it facing out to sea (`yaw`), and a ladder up its landward side to a ledge at the deck's edge
  // (`LADDERS`, climbing planes as crew.js takes them, each standing a little off the drum so a body reaches it).
  const TURRET = { r: 3.2, rise: 8, parapet: 0.45, ledge: 0.75, off: 0.3, arc: Math.PI / 2 };
  const TURRETS = [-46, -24, 24, 46].map((x) => {
    let z = ISLAND.z + ISLAND.b + 10;
    while (z > ISLAND.z && !(coastDist(x, z) >= 7 && terrainTop(x, z) > SEA + 1.4 && moatDist(x, z) > 6)) z -= 0.5;
    const y = terrainTop(x, z);
    return { x, z, y, r: TURRET.r, top: y + TURRET.rise, yaw: 0 };
  });
  // Cold Storj's turrets, down both sides of its fjord on the cliffs' tops, each looking across the water.
  STORJ.turrets = [];
  for (const i of [1, 2, 3, 5, 6, 7]) for (const s of [-1, 1]) {
    const [ax, az] = STORJ.fjord.pts[i], [bx, bz] = STORJ.fjord.pts[i + 1], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    const x = ax + (bx - ax) * 0.5 + nx * s * (STORJ.fjord.half + 10), z = az + (bz - az) * 0.5 + nz * s * (STORJ.fjord.half + 10), y = terrainTop(x, z);
    STORJ.turrets.push({ x, z, y, r: TURRET.r, rise: TURRET.rise * 3, top: y + TURRET.rise * 3, yaw: Math.atan2(-nx * s, -nz * s), ledge: false, red: true, storj: true });
  }
  const DRUMS = [...TURRETS, ...VOLCANO.wall.turrets, ...STORJ.turrets];
  // Each drum's turn, for the tests in its own frame (its ladder on its -z, its open quarter toward its +z).
  for (const t of DRUMS) { t.cy = Math.cos(t.yaw || 0); t.sy = Math.sin(t.yaw || 0); }
  /** (x, z) in the turret `t`'s own frame, into `TURRET_AT`: `x` across it and `z` out toward its open quarter. */
  const TURRET_AT = { x: 0, z: 0 };
  const turretLocal = (t, x, z) => { const dx = x - t.x, dz = z - t.z; TURRET_AT.x = dx * t.cy - dz * t.sy; TURRET_AT.z = dx * t.sy + dz * t.cy; return TURRET_AT; };
  const LADDERS = TURRETS.map((t) => {
    const d = t.r + TURRET.off, x = t.x - t.sy * d, z = t.z - t.cy * d;
    return { x, z, bottom: t.defend ? t.y : terrainTop(x - t.sy * 0.4, z - t.cy * 0.4), top: t.top, nx: -t.sy, nz: -t.cy, width: 1.4, inset: TURRET.off + 1.1 };
  });
  /** The turret whose drum (x, z), grown by `r`, is in, or null. */
  const turretAt = (x, z, r = 0) => {
    for (let i = 0; i < DRUMS.length; i++) { const t = DRUMS[i]; if (Math.hypot(x - t.x, z - t.z) < t.r + r) return t; }
    return null;
  };
  /** The turret whose deck, or the ledge at its ladder's head, is under (x, z), or null. */
  const turretDeck = (x, z) => {
    for (let i = 0; i < DRUMS.length; i++) {
      const t = DRUMS[i], dx = x - t.x, dz = z - t.z;
      // Nothing stands on a roofed turret.
      if (t.roofed) continue;
      if (Math.hypot(dx, dz) < t.r) return t;
      if (t.ledge !== false) { const l = turretLocal(t, x, z); if (Math.abs(l.x) < TURRET.ledge && l.z < 0 && l.z > -(t.r + TURRET.off + 0.25)) return t; }
    }
    return null;
  };
  /** Whether a body `r` across may stand on the turret `t`'s deck at (x, z): inside its parapet, or in the gap at its
   *  ladder's head and out on the ledge there. */
  const turretStand = (t, x, z, r) => {
    const l = turretLocal(t, x, z);
    return Math.hypot(l.x, l.z) + r * 0.5 < t.r - TURRET.parapet || (t.ledge !== false && Math.abs(l.x) < TURRET.ledge - r * 0.4 && l.z < 0 && l.z > -(t.r + TURRET.off + 0.2));
  };
  /** Whether (x, z) is in the way over the turret `t`'s lip at its ladder's head, where a climber comes up onto the
   *  deck: open to a body whose feet are within a body's height of the top. */
  const turretLip = (t, x, z, feet) => { if (t.ledge === false || feet <= t.top - 2.6) return false; const l = turretLocal(t, x, z); return Math.abs(l.x) < TURRET.ledge && l.z < -1.4; };
  const knightAt = (x, z, r) => {
    for (let i = 0; i < STATUES.length; i++) if (Math.hypot(x - STATUES[i].x, z - STATUES[i].z) < STATUE_R * 0.55 + r) return true;
    return false;
  };
  const supportAt = (x, z, feet, down, gate) => {
    const ship = shipTop(x, z);
    if (ship !== null) return feet >= ship - STEP ? ship : SEA - SINK;
    if (knightAt(x, z, 0) && feet >= KNIGHT.top - STEP) return KNIGHT.top;
    const turret = turretDeck(x, z);
    if (turret && feet >= turret.top - STEP) return turret.top;
    const balcony = balconyAt(x, z, feet);
    if (balcony !== null) return balcony;
    const well = wellAt(x, z, feet);
    if (well !== null) return well;
    const gallery = galleryAt(x, z, feet);
    if (gallery) return gallery.floor;
    const outpost = outpostSupport(x, z, feet);
    if (outpost !== null) return outpost;
    if (inWard(x, z)) {
      if (inKeep(x, z)) { const level = arcadeAt(feet); if (level) return level.floor; }
      const top = wardTop(x, z);
      return top > 0 && feet >= top - STEP ? top : 0;
    }
    const west = westSupport(x, z, feet);
    if (west !== null) return west;
    const back = backSupport(x, z, feet);
    if (back !== null) return back;
    const ring = cbdcSupport(x, z, feet);
    if (ring !== null) return ring;
    const hall = hallAt(x, z, HALL.over);
    if (hall && feet >= hallRoof(hall, x, z) - STEP) return hallRoof(hall, x, z);
    const deck = deckAt(x, z);
    if (deck !== null) return deck;
    const house = storjHouse(x, z);
    if (house && feet >= house.top - STEP) return house.top;
    const wall = parapetAt(x, z);
    if (wall !== null) return feet >= wall - STEP ? wall : stairsAt(x, z);
    if (stairsAt(x, z) !== null) return stairsAt(x, z);
    const wet = waterAt(x, z, down, gate);
    if (wet !== null) return wet - SINK;
    if (moatDist(x, z) < 0) return 0;
    const ruin = ruinTop(x, z);
    if (ruin > 0 && feet >= ruin - STEP) return ruin;
    // Over the cave mouth's arch, the cone's own top.
    if (mouthArch(x, z) !== Infinity) { const top = Math.round(volcanoHeight(x, z, true)); if (feet >= top - STEP) return top; }
    // Over Shards' notch, the lintel's top, level with the plateau round it.
    if (inShardsNotch(x, z) && feet >= SHARDS.plateau - STEP) return SHARDS.plateau;
    return landTop(x, z);
  };
  const inBounds = (x, z) => x >= BOUNDS.x0 + BOUNDS.roam && x <= BOUNDS.x - BOUNDS.roam && z >= BOUNDS.z0 + BOUNDS.roam && z <= BOUNDS.z1 - BOUNDS.roam;
  // The edge of the water the rowboat may go on (`inBounds`), marked by floating candles about `every` metres apart
  // all the way round, wherever it lies over open water.
  const EDGE = { every: 16 };
  {
    const x0 = BOUNDS.x0 + BOUNDS.roam, x1 = BOUNDS.x - BOUNDS.roam, z0 = BOUNDS.z0 + BOUNDS.roam, z1 = BOUNDS.z1 - BOUNDS.roam;
    const side = (ax, az, bx, bz) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / EDGE.every));
      for (let k = 0; k < n; k++) {
        const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
        if (heightAt(x, z) <= SEA - FERRY.draft) CANDLES.push([x, z]);
      }
    };
    side(x0, z0, x1, z0); side(x1, z0, x1, z1); side(x1, z1, x0, z1); side(x0, z1, x0, z0);
  }
  /** Whether a body `r` across may walk from (ax, az) to (bx, bz) on foot, its feet at `feet`: on the castle's low
   *  ground as `standable` says, elsewhere up a step or down a short drop, never into the water. */
  const walkClear = (ax, az, bx, bz, feet, r, down, gate) => {
    if (!inBounds(bx, bz)) return false;
    // Out on a balcony: along it, off its parapet and in through its level's arches.
    const balcony = balconyAt(bx, bz, feet);
    if (balcony !== null) return balconyClear(bx, bz, feet, r, balcony) && balcony <= feet + STEP && balcony >= feet - DROP;
    // In a tower's gallery: inside its wall and out onto its opening's sill.
    // Up and down the stair head through a gallery's floor, a step at a time; and on the floor, kept off the stair
    // head's edge where it drops away.
    const well = wellAt(bx, bz, feet, r * 0.5);
    if (well !== null) return well <= feet + STEP && well >= feet - DROP;
    const gallery = galleryAt(bx, bz, feet, r + 0.8);
    if (gallery) {
      // The stair head's rails along its sides.
      const w = wellPlace(gallery, bx, bz), W = GALLERY.well;
      if (w.s > -r && w.s < W.len && Math.abs(w.side) < W.half + W.rail + r && Math.abs(w.side) > W.half - r * 0.5 && feet < gallery.floor + W.railTall) return false;
      return galleryStand(gallery, bx, bz, r) && gallery.floor <= feet + STEP && gallery.floor >= feet - DROP;
    }
    // Outpost Island's bridges, walls, towers and keep.
    const outpost = outpostWalk(bx, bz, feet, r);
    if (outpost !== 0) return outpost > 0;
    // Out of the west or east gate: along the bridge and down its stair between their parapets, or under its arches.
    const west = westWalk(bx, bz, feet, r);
    if (west !== 0) return west > 0;
    const back = backWalk(bx, bz, feet, r);
    if (back !== 0) return back > 0;
    // CBDC's wall: along its walk between the parapets, up its stairs, and through its gate.
    const ring = cbdcWalk(bx, bz, feet, r);
    if (ring !== 0) return ring > 0;
    // A hall's walls, under its eaves.
    const hall = hallAt(bx, bz, r);
    if (hall && feet < SHIPYARD.y + HALL.eaves && hallWall(hall, bx, bz, r)) return false;
    // Cold Storj: its houses' walls, and its ice wall but for the tunnel into it; nothing goes behind the wall.
    if (bx < STORJ.east) {
      const house = storjHouse(bx, bz, r);
      if (house && feet < house.top - STEP) return false;
    }
    if (feet < LOW) {
      if (inWard(bx, bz, r)) return standable(bx, bz, r, down, gate);
      for (let i = 0; i < BLOCKS.length; i++) if (Math.hypot(bx - BLOCKS[i][0], bz - BLOCKS[i][1]) < BLOCKS[i][2] + r) return false;
    } else if (inWard(bx, bz, r) && wardTop(bx, bz, r) > feet + STEP && !(inKeep(bx, bz, r) && arcadeClear(bx, bz, feet, r))) return false;
    if (feet < KNIGHT.top - STEP && feet >= LOW && knightAt(bx, bz, r)) return false;
    // A turret: its drum in the way below its deck; on the deck, kept in by the parapet but at the ladder's head.
    const turret = turretAt(bx, bz, r) || turretDeck(bx, bz);
    if (turret) {
      if (feet >= turret.top - STEP) { if (turretDeck(bx, bz) === turret) return turretStand(turret, bx, bz, r); }
      else if (turretAt(bx, bz, r) && !turretLip(turret, bx, bz, feet)) return false;
    }
    const ruin = ruinTop(bx, bz, r);
    if (ruin > 0 && ruin > feet + STEP) return false;
    const ship = shipTop(bx, bz, r);
    if (ship !== null && ship > feet + STEP) return false;
    const wall = parapetAt(bx, bz, r);
    if (wall !== null && wall > feet + STEP) return false;
    if (waterAt(bx, bz, down, gate) !== null) return false;
    const g = supportAt(bx, bz, feet, down, gate);
    return g <= feet + STEP && g >= feet - DROP;
  };
  /** Whether a body `r` across may fly from (ax, az) to (bx, bz) at `y`: over everything but the castle's stone, which
   *  it clears by going over the top, and into the castle's air only once the knights have opened it (`open`), or
   *  already inside it. */
  const flyClear = (ax, az, bx, bz, y, r, down, gate, open) => {
    if (!inBounds(bx, bz)) return false;
    // In a tower's gallery, or in through its opening from the open air outside, under its ceiling: open whether or
    // not the knights have met, since it is the castle's outside.
    const well = wellAt(bx, bz, y, r);
    if (well !== null) return y >= well - 1e-3;
    const gallery = galleryAt(bx, bz, y, r + 0.8);
    if (gallery && y < gallery.floor + GALLERY.height - HEAD) {
      const d = Math.hypot(bx - gallery.x, bz - gallery.z);
      if (d - r >= gallery.r + 0.45) return true;
      return d + r <= gallery.inner || Math.abs(galleryAngle(gallery, bx, bz)) < GALLERY.open - r / Math.max(d, 1);
    }
    if (westFly(bx, bz, y, r) || backFly(bx, bz, y, r) || hallFly(bx, bz, y, r) || cbdcFly(bx, bz, y, r) || outpostFly(bx, bz, y, r)) return false;
    // Cold Storj is come to by its fjord alone: none flies onto it from the open sea, only from its own land or water.
    if (bx < STORJ.east + 12) {
      if (storjLand(bx, bz) && !storjLand(ax, az) && !storjInner(ax, az)) return false;
      for (const st of STORJ.statues) if (y < st.top && Math.hypot(bx - st.x, bz - st.z) < st.r + r) return false;
      const house = storjHouse(bx, bz, r);
      if (house && y < house.top - 1e-3) return false;
    }
    if (inWard(bx, bz, r)) {
      if (!open && !inWard(ax, az, r)) return false;
      // Round the keep's balconies: under their decks, over their parapets, and on them clear of the keep's face.
      const kd = Math.hypot(bx - KEEP.x, bz - KEEP.z);
      if (y > BALCONY.floors[0] - BALCONY.deck - HEAD && kd - r < BALCONY.outer) {
        if (balconyBlocks(bx, bz, y, r)) return false;
        if (kd - r >= KEEP.r) return y >= wardTop(bx, bz, r, false) - 1e-3;
      }
      // Into one of the keep's open levels through an arch, at its floor's height.
      if (inKeep(bx, bz, r) && arcadeClear(bx, bz, y, r)) return true;
      if (y < LOW) return standable(bx, bz, r, down, gate);
      return y >= wardTop(bx, bz, r) - 1e-3;
    }
    if (y < LOW) for (let i = 0; i < BLOCKS.length; i++) if (Math.hypot(bx - BLOCKS[i][0], bz - BLOCKS[i][1]) < BLOCKS[i][2] + r) return false;
    if (y < KNIGHT.top - 1e-3 && knightAt(bx, bz, r)) return false;
    const turret = turretAt(bx, bz, r);
    if (turret && y < turret.top + (turret.roof || 0) - 1e-3 && !turretLip(turret, bx, bz, y)) return false;
    const wall = parapetAt(bx, bz, r);
    if (wall !== null && y < wall - 1e-3) return false;
    const ship = shipTop(bx, bz, r);
    if (ship !== null && y < ship - 1e-3) return false;
    // Under the cave mouth's arch, in through the cut alone, and never through the cone over it.
    if (y + HEAD > mouthArch(bx, bz) && y < Math.round(volcanoHeight(bx, bz, true)) - 1e-3) return false;
    const ruin = ruinTop(bx, bz, r);
    return ruin <= 0 || y >= ruin - 1e-3;
  };

  BL.keepLayout = { dockDist, GALLERY, GALLERIES, galleryAt, galleryAir, galleryExit, galleryAngle, wellAt, wellPlace, TURRET, TURRETS, LADDERS, turretAt, turretDeck, LANE, CANDLES, inLane, BANNERS, CZ, CASTLE, KEEP, BALCONY, TORCHES, HUNG, balconyAt, balconyClear, balconyBlocks, inKeep, archTop, arcadeTop, arcadeAt, arcadeClear, MOAT, GATE, YARD, TOWER_DOORS, inYard, LEAF, ABUTMENT, COURT, STAIRS, QUAY, ISLET, DOCK, ISLET_PATH, FERRY, LONGSHIP, longshipHalf, longshipSheer, SHIP, SHIPS, shipHalf, shipTop, hullClear, navigable, ARCH, ARRIVE, STATUES, STATUE_R, KNIGHT, GUARDS, CRYSTAL, LEVEL_SIGN, BOUNDS, TERRAIN, BLOCKS, LANTERNS, ISLET_TORCHES, ARENA_COLUMNS,
    SEA, ISLAND, STEP, LOW, TERRAIN_UNIT, RUIN,
    wanderOut, BACK, BACK_BRIDGE, ARENA_ISLE, ARENA_FOES, backY, backSoffit, backAt, arenaDist, WEST, westArchTop, fold, ARMORY, WEST_BRIDGE, WEST_STAIR, bridgeY, bridgeSoffit, westStairY, wayY, westAt, westHit, SHIPYARD, HALL, HALLS, hallAt, hallRoof, SEATS, GALLEON, galleonHalf, galleonTop, galleonSheer, shipyardDeck,
    hash2, noise, smooth, moatDist, playDist, heightAt, standable, coastDist, isletDist, onIsletPath, stairsAt, deckAt, parapetAt, seaAt, terrainTop, landTop, OUTPOST, OUTPOST_KEEP, outpostDist, outpostHeight, outpostArm, nearOutpost, outpostWall, outpostTowerTop, outpostKeepTop, spanY, spanSoffit, SHARDS, shardsDist, shardsHeight, onShardsWay, shardsTrench, inShardsNotch, VOLCANO, volcanoDist, volcanoHeight, onVolcanoCourt, inVolcanoMouth, lavaStream, lavaAt, caveAt, mouthArch, cbdcAt, cbdcHit, cbdcWalkY, cbdcSoffit, wallPlace, STORJ, storjHeight, storjPath, onSpur, onTerrace, storjMirror, storjHouse, storjLand, storjInner, storjCoast, storjInlet, pathPoint, pathAt, massif, inWard, wardTop, ruinTop, waterAt, supportAt, inBounds, walkClear, flyClear };
})();
