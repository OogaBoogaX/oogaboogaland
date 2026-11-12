// The hub catapult: on the B.C.A. hill (10 o'clock, over the office), aimed across the middle of the island at the
// island end of the Mempool Rainforest's vine bridge. Ported from Block Frenzy (`block-sim.js` `nearCatapult`, `launch`
// and its throw and parachute; `scene-block.js`'s arm), for the visitor's own Ooga alone: stood on the stand board
// (`onPad`), Space or the act button launches (`canLaunch`); the arm whips over with the Ooga in its bucket, throws it
// in a high arc over the middle of the island, a parachute opens at the top of the throw, right over the bridge's end,
// and the Ooga comes down there or wherever it steers under the canopy (`STEER`: back onto the island, along the bridge
// or on over the water into the rainforest), landing on whatever holds it underneath (the hub's `probe`); over water it
// turns for the nearest ground that does (`RESCUE`), never landing in the sea, a lake or a wall. The arm winds back.
// Calm (`prefers-reduced-motion`) gets a gentler, shorter throw: a slow eased whip, a lower eased arc and a shorter
// drop. Nothing goes to the room: other pages see the flight through the poses they already get.
//
// `plan` chooses the frame's place once a build, reading the island and the hub's ground claims and never adding one,
// only where it stands clear of every tree, bush, prop and path already there (none moves, none is hidden; where none
// fits there is no catapult); `flight` and `step` are the throw's rules as numbers; `create` builds the nodes and runs
// a visit's flights through the crew's seat contract (`sitPlayer` with `lockMovement`, `standPlayer` at the landing),
// writing the Ooga's place and pose after the crew has moved, allocating nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, lerp } = BL.math;
  const M = BL.hubCatapultModels;
  const { PIVOT, ARM_LEN, PAD, REST, WHIP, FOOTPRINT } = M;
  // Where the hill is: the B.C.A. bluff's crest, then the c9 hill as a fallback (`HILLS`: each a middle and the radius
  // `plan` searches round it, the board's middle on a GRID-metre lattice, nearest the middle first). Every place is
  // tried at each frame size in SCALES (the whole frame, arm and board shrunk together) and turned off the aim by each
  // of TURNS (radians; the throw still flies to the aim from wherever the bucket lets go), largest and straightest first.
  const PREFER = { x: -21.5, z: -13.5, r: 6 }, HILLS = [PREFER, { x: -26.5, z: -1.5, r: 4.5 }], GRID = 0.5;
  const SCALES = [1, 0.85, 0.7, 0.6], TURNS = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6];
  // Each hill's lattice, made once: offsets from its middle in rings outward.
  const lattice = (r) => {
    const out = [], n = Math.floor(r / GRID);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) if (Math.hypot(i, j) * GRID <= r) out.push([i * GRID, j * GRID]);
    const keys = Float64Array.from(out, ([x, z]) => Math.hypot(x, z)), order = Uint32Array.from(out, (_, i) => i);
    BL.math.sortByKey(order, 0, order.length, keys, 1, 0, BL.math.sortScratch(order.length));
    return Array.from(order, (i) => out[i]);
  };
  const LATTICES = new Map();
  // Where it lands: on the Mempool approach's axis this far from the middle (the top treads, just inside the rim head
  // at `POOL_APPROACH.to`), and the checked spots round it, SPOT_STEP apart within SPOT_R, each within SPOT_RISE of
  // the aim's own floor, its body's ring (SPOT_RING round) within SPOT_LEVEL of it, a walker's step at most (the
  // approach is a stair), and the rock clear over it from a step up (SPOT_HEAD) to the canopy's opening.
  const AIM_R = 28.35, SPOT_STEP = 0.4, SPOT_R = 1.4, SPOT_RISE = 0.6, SPOT_RING = 0.45, SPOT_LEVEL = 0.5, SPOT_HEAD = 0.55, SPOT_MIN = 3;
  // The frame's ground: its footprint's floor may step SLOPE at most (the wheel blocks take it up, the high side
  // taking up to SINK of them), the board's BOARD_SLOPE; FOOTPRINT_CLEAR is kept round it from every claim, ROCK
  // under it must be stone, and a cave's mouth stays MOUTH_CLEAR away unless the whole footprint stands MOUTH_HIGH
  // over the mouth's floor.
  const MOUTH_APRON_CLEAR = 7;
  const SLOPE = 0.55, SINK = 0.25, BOARD_SLOPE = 0.3, FOOTPRINT_CLEAR = 0.3, ROCK = 0.6, MOUTH_CLEAR = MOUTH_APRON_CLEAR, MOUTH_HIGH = 5.5;
  // The throw's path keeps CORRIDOR_ROCK over the ground, and CORRIDOR_PROP over any claim within its reach
  // (CORRIDOR_REACH plus the claim's own), so it clears the hill's trees.
  const CORRIDOR_ROCK = 2.2, CORRIDOR_PROP = 6.5, CORRIDOR_REACH = 1.2, CORRIDOR_STEPS = 48;
  // The landing spots are checked rock-free up to the highest canopy any board could open at: MAX_BOARD over the aim.
  const MAX_BOARD = 4;
  // How far past a hill's search a claim may stand and still reach a frame or its throw's low first stretch.
  const NEAR = 12;
  // The coarse ground look's step along the footprint (`fits`).
  const COARSE = 0.6;
  // The farthest a frame's footprint reaches from its board's middle.
  const FOOT_REACH = Math.hypot(FOOTPRINT.half, FOOTPRINT.front - PAD.z, PAD.z - FOOTPRINT.back);
  // The throw, normal and Calm: the whip's and the wind-back's seconds, the arc's apex over the higher of the board
  // and the landing, the arc's seconds (normal: falling freely, so it is set by the height; Calm: fixed and eased), the
  // canopy's opening and its steady fall.
  const THROW = { whip: 0.15, wind: 1.4, apex: 17, gravity: 9.8, open: 0.35, fall: 3.4 };
  const CALM = { whip: 0.5, wind: 2, apex: 8, seconds: 2.4, open: 0.6, fall: 3 };
  // Under the canopy: how fast the stick moves the landing aim (metres a second), how far back from the bridge's
  // island end and on out along it it may take it, how wide the cone is at the bridge's end and how much wider each
  // metre out, and how fast the canopy follows. RESCUE: how high over water it turns for land, how fast it drifts
  // there and how far round it looks. STEP: a walker's step, the most the ground under it may rise in one frame.
  const STEER = { speed: 7, back: 3, forward: 36, side: 2.5, flare: 0.35, follow: 5 }, STEP = 0.6;
  const RESCUE = { height: 3, speed: 6, ring: 0.5, reach: 10, dirs: 16 };
  const IDLE = 0, WHIPPING = 1, THROWN = 2, CHUTE = 3, LANDED = 4;
  const PHASES = ["idle", "whip", "throw", "chute", "landed"];
  const smooth = (t) => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };

  // A frame point in the world: local (lx, lz) through the site's turn (`ry`, local +z toward the aim).
  const worldX = (site, lx, lz) => site.x + (lx * site.cos + lz * site.sin) * site.scale;
  const worldZ = (site, lx, lz) => site.z + (-lx * site.sin + lz * site.cos) * site.scale;
  // The arm's angle `t` seconds after a launch: up over the whip, then back down over the wind.
  const armAngle = (t, calm) => {
    const c = calm ? CALM : THROW;
    const up = t < c.whip ? (calm ? smooth(t / c.whip) : t / c.whip) : calm ? 1 - smooth((t - c.whip) / c.wind) : Math.max(0, 1 - (t - c.whip) / c.wind);
    return REST + (WHIP - REST) * up;
  };
  // Where the feet stand in the bucket at arm angle `a`, in the world, into `out`.
  const bucketAt = (site, a, out) => {
    const lz = PIVOT.z - ARM_LEN * Math.cos(a), ly = PIVOT.y + ARM_LEN * Math.sin(a) + 0.12;
    out.x = worldX(site, 0, lz); out.y = site.y + ly * site.scale; out.z = worldZ(site, 0, lz);
    return out;
  };
  const arcSeconds = (site, calm) => calm ? CALM.seconds : Math.sqrt(2 * (site.apexY - site.releaseY) / THROW.gravity);
  const apexOf = (site, calm) => calm ? site.calmApexY : site.apexY;
  // The thrown body `t` seconds into the arc: straight along the ground from the release to the apex over the aim,
  // and up a parabola whose top is that apex, so it rises all the way and is highest at the canopy's opening.
  const arcAt = (site, t, calm, out) => {
    const T = arcSeconds(site, calm), s = calm ? smooth(t / T) : clamp(t / T, 0, 1), top = apexOf(site, calm);
    out.x = lerp(site.releaseX, site.aimX, s); out.z = lerp(site.releaseZ, site.aimZ, s);
    out.y = site.releaseY + (top - site.releaseY) * (1 - (1 - s) * (1 - s));
    return out;
  };

  // The checked spot nearest (x, z): its index.
  const nearestSpot = (site, x, z) => {
    let best = 0, d2 = Infinity;
    for (let i = 0; i < site.spotCount; i++) {
      const dx = site.spots[i * 3] - x, dz = site.spots[i * 3 + 2] - z, d = dx * dx + dz * dz;
      if (d < d2) { d2 = d; best = i; }
    }
    return best;
  };

  // Whether a body's feet at (x, feet, z) stand on the board: within its square, at its height.
  const onPad = (site, x, feet, z) => {
    const dx = x - site.padX, dz = z - site.padZ, ax = dx * site.cos - dz * site.sin, az = dx * site.sin + dz * site.cos;
    const half = PAD.half * site.scale;
    return Math.abs(ax) <= half && Math.abs(az) <= half && Math.abs(feet - site.padY) <= 0.35;
  };
  // The launch rule: an Ooga on the board, standing on it (not in the air, a seat, a fire or a gorilla's grip), with the
  // catapult idle and its arm wound back, outside GAME MODE.
  const canLaunch = (site, s) => !!site && !s.gameMode && !s.busy && s.grounded && !s.seated && onPad(site, s.x, s.feet, s.z);

  // The checked landing spots round the aim, into a Float64Array of x, floor, z: open ground on the island on the
  // aim's floor, its body's ring within a step of it, and the rock clear over it up to `top`. The hub's claims are left
  // out: the bridge's own walk is claimed (`claimGround`), which only keeps scenery off it. Props and bodies are the
  // crew's to judge as the Ooga stands up there (`standPlayer`, through the hub's `walkable`), the next spot taken
  // when one is in the way.
  const landingSpots = (island, aimX, aimZ, top) => {
    const aimY = island.surfaceAt(aimX, aimZ), list = [];
    const n = Math.ceil(SPOT_R / SPOT_STEP);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const ox = i * SPOT_STEP, oz = j * SPOT_STEP;
      if (ox * ox + oz * oz > SPOT_R * SPOT_R + 1e-9) continue;
      const x = aimX + ox, z = aimZ + oz, y = island.surfaceAt(x, z);
      if (!island.onLand(x, z) || Math.abs(y - aimY) > SPOT_RISE) continue;
      let level = true;
      for (let k = 0; k < 8 && level; k++) {
        const a = k * Math.PI / 4, rx = x + Math.cos(a) * SPOT_RING, rz = z + Math.sin(a) * SPOT_RING;
        level = island.onLand(rx, rz) && Math.abs(island.surfaceAt(rx, rz) - y) <= SPOT_LEVEL;
      }
      if (!level || !island.clearAt(x, y + SPOT_HEAD, z, 0.35, top - y - SPOT_HEAD)) continue;
      list.push(x, y, z);
    }
    return Float64Array.from(list);
  };

  // The frame's place: the first place, hill by hill and ring by ring round each, at the largest size and least turn
  // that fits, whose footprint stands on the island's own rock, level enough, off every path and stair, clear of every
  // claim (each tree, bush, flower, palm and prop the hub placed, the hammock's and the bridges' walks) and cave mouth,
  // with a clear throw over the hill, and enough landing spots at the bridge's end. It reads the island and the claims
  // and nothing else, adds no claim and draws on no seeded stream, so nothing the hub placed moves or is hidden. Null
  // when nothing fits: then there is no catapult. `planSteps` is the same as a build generator, pausing between sizes and turns
  // when handed the hub's `slice`.
  const planSteps = function* ({ island, claims = [], hills = HILLS, aim = null, report = null }, slice = null) {
    const A = BL.terrain.POOL_APPROACH, ax = aim ? aim.x : Math.sin(A.bearing) * AIM_R, az = aim ? aim.z : -Math.cos(A.bearing) * AIM_R;
    const aimY = island.surfaceAt(ax, az);
    const site = { x: 0, y: 0, z: 0, ry: 0, sin: 0, cos: 1, scale: 1, turn: 0, hill: 0, padX: 0, padY: 0, padZ: 0, releaseX: 0, releaseY: 0, releaseZ: 0,
      aimX: ax, aimY, aimZ: az, dirX: Math.sin(A.bearing), dirZ: -Math.cos(A.bearing), apexY: 0, calmApexY: 0, spots: null, spotCount: 0, blocker: null };
    const spots = landingSpots(island, ax, az, aimY + THROW.apex + MAX_BOARD);
    if (spots.length / 3 < SPOT_MIN) return null;
    for (let hill = 0; hill < hills.length; hill++) {
      const h = hills[hill];
      if (!LATTICES.has(h.r)) LATTICES.set(h.r, lattice(h.r));
      // Only the claims near this hill can touch a frame or its throw's low first stretch there; a cave mouth's apron
      // and the dressing on it stand at the mouth's floor, which the frame keeps MOUTH_HIGH over (`fits`).
      const near = claims.filter((c) => Math.hypot(c.x - h.x, c.z - h.z) < c.r + h.r + NEAR && !apron(island, c));
      const foot = near.filter((c) => Math.hypot(c.x - h.x, c.z - h.z) < c.r + h.r + FOOT_REACH + FOOTPRINT_CLEAR);
      if (yield* place(island, foot, near, site, h, LATTICES.get(h.r), slice, report)) { site.spots = spots; site.spotCount = spots.length / 3; site.hill = hill; return site; }
    }
    return null;
  };
  const plan = (options) => { const steps = planSteps(options); let step = steps.next(); while (!step.done) step = steps.next(); return step.value; };
  // A claim the hub lays on a cave mouth's apron (its own, `MOUTH_APRON` round the mouth, or a facade piece's): ground
  // kept at the mouth's floor, not something standing up into the bluff over it.
  const MOUTH_APRON = 6.5;
  const apron = (island, c) => !c.scenery && island.mouths.some((m) => {
    const d = Math.hypot(c.x - m.x, c.z - m.z);
    return d < 1e-6 || d < MOUTH_APRON && island.surfaceAt(c.x, c.z) <= m.floorY + 0.5;
  });
  // The first place round hill `h` that fits, filling `site`; whether there was one. With `report`, each refusal is
  // counted by its reason (`REASONS`) and each claim that blocked a frame is kept with how deep it came in.
  const place = function* (island, foot, near, site, h, offsets, slice, report) {
    for (const scale of SCALES) for (const turn of TURNS) {
      if (slice) yield* BL.buildTasks.pause(slice);
      site.scale = scale; site.turn = turn;
      for (let k = 0; k < offsets.length; k++) {
        const why = fits(island, foot, near, site, h.x + offsets[k][0], h.z + offsets[k][1]);
        if (!why) return true;
        if (report) {
          report[REASONS[why]] = (report[REASONS[why]] || 0) + 1;
          if (why === CLAIM && scale === SCALES[SCALES.length - 1]) {
            const c = site.blocker, key = `${c.scenery ? c.scenery.prop || c.scenery : "claim"} r${c.r} @${c.x.toFixed(2)},${c.z.toFixed(2)}`;
            report.blockers = report.blockers || {};
            report.blockers[key] = (report.blockers[key] || 0) + 1;
          }
        }
      }
    }
    return false;
  };
  const OK = 0, CLAIM = 1, SLOPED = 2, GROUND = 3, MOUTH = 4, HIGH = 5, CORRIDOR = 6;
  const REASONS = ["ok", "claim", "slope", "path, stair or no rock", "cave mouth", "board too high", "throw blocked"];
  // Whether a frame (turned and sized as `site` says) would stand on a claim: the circle against its footprint's box,
  // FOOTPRINT_CLEAR kept between them.
  const overlaps = (site, c) => {
    const cx = c.x - site.x, cz = c.z - site.z, lx = (cx * site.cos - cz * site.sin) / site.scale, lz = (cx * site.sin + cz * site.cos) / site.scale;
    const ox = Math.max(0, Math.abs(lx) - FOOTPRINT.half), oz = Math.max(0, lz - FOOTPRINT.front, FOOTPRINT.back - lz);
    return Math.hypot(ox, oz) * site.scale < c.r + FOOTPRINT_CLEAR;
  };
  // Whether the board centred at (px, pz) fits, filling `site` with the frame's place when it does.
  const fits = (island, foot, claims, site, px, pz) => {
    const ry = Math.atan2(site.aimX - px, site.aimZ - pz) + site.turn, sin = Math.sin(ry), cos = Math.cos(ry);
    site.sin = sin; site.cos = cos; site.ry = ry;
    site.x = px - sin * PAD.z * site.scale; site.z = pz - cos * PAD.z * site.scale;
    for (let i = 0; i < foot.length; i++) if (overlaps(site, foot[i])) { site.blocker = foot[i]; return CLAIM; }
    // The ground first, cheaply: a coarse look at its floor's spread ends most tries; then every sample's floor, then
    // the rest of each sample.
    let coarseLo = Infinity, coarseHi = -Infinity;
    for (let lx = -FOOTPRINT.half; lx <= FOOTPRINT.half + 1e-9; lx += FOOTPRINT.half) for (let lz = FOOTPRINT.back; lz <= FOOTPRINT.front + 1e-9; lz += COARSE) {
      const y = island.surfaceAt(worldX(site, lx, lz), worldZ(site, lx, lz));
      if (y < coarseLo) coarseLo = y;
      if (y > coarseHi) coarseHi = y;
      if (coarseHi - coarseLo > SLOPE) return SLOPED;
    }
    // Low by a mouth already on the coarse look (the floor's true low is no higher), it is refused before the fine one.
    for (let i = 0; i < island.mouths.length; i++) {
      const m = island.mouths[i];
      if (Math.hypot(m.x - site.x, m.z - site.z) < MOUTH_CLEAR && coarseLo < m.floorY + MOUTH_HIGH) return MOUTH;
    }
    let frameLo = Infinity, frameHi = -Infinity, padLo = Infinity, padHi = -Infinity;
    for (let lx = -FOOTPRINT.half; lx <= FOOTPRINT.half + 1e-9; lx += 0.25) for (let lz = FOOTPRINT.back; lz <= FOOTPRINT.front + 1e-9; lz += 0.25) {
      const x = worldX(site, lx, lz), z = worldZ(site, lx, lz), y = island.surfaceAt(x, z);
      if (Math.max(frameHi, padHi, y) - Math.min(frameLo, padLo, y) > SLOPE) return SLOPED;
      const board = Math.abs(lx) <= PAD.half && Math.abs(lz - PAD.z) <= PAD.half;
      if (board) { padLo = Math.min(padLo, y); padHi = Math.max(padHi, y); }
      else { frameLo = Math.min(frameLo, y); frameHi = Math.max(frameHi, y); }
    }
    if (frameHi - frameLo > SLOPE || padHi - padLo > BOARD_SLOPE) return SLOPED;
    // The frame settles into its slope: never more than SINK into the high side, so it stands on its wheel blocks.
    const hi = Math.max(frameHi, padHi), lo = Math.min(frameLo, padLo);
    if (hi - lo > SLOPE) return SLOPED;
    site.y = Math.max(hi - SINK, (hi + lo) / 2);
    // A mouth's facade (its sign, lamps and banners) stands on its apron; a frame on the bluff high over it is clear.
    for (let i = 0; i < island.mouths.length; i++) { const m = island.mouths[i]; if (Math.hypot(m.x - site.x, m.z - site.z) < MOUTH_CLEAR && lo < m.floorY + MOUTH_HIGH) return MOUTH; }
    // The costly look last: land, paths, stairs and the rock under every sample.
    for (let lx = -FOOTPRINT.half; lx <= FOOTPRINT.half + 1e-9; lx += 0.25) for (let lz = FOOTPRINT.back; lz <= FOOTPRINT.front + 1e-9; lz += 0.25) {
      const x = worldX(site, lx, lz), z = worldZ(site, lx, lz);
      if (!island.onLand(x, z) || island.isPath(x, z) || island.overlapsStairs(x, z, 0.3) || !island.solidAt(x, island.surfaceAt(x, z) - ROCK, z)) return GROUND;
    }
    site.padX = px; site.padZ = pz; site.padY = Math.max(site.y + PAD.top * site.scale, padHi);
    if (site.padY - site.aimY > MAX_BOARD) return HIGH;
    const release = bucketAt(site, WHIP, RELEASE);
    site.releaseX = release.x; site.releaseY = release.y; site.releaseZ = release.z;
    site.apexY = Math.max(site.padY, site.aimY) + THROW.apex;
    site.calmApexY = Math.max(site.padY, site.aimY) + CALM.apex;
    for (let pass = 0; pass < 2; pass++) {
      const calm = pass === 1, T = arcSeconds(site, calm);
      for (let i = 1; i <= CORRIDOR_STEPS; i++) {
        const p = arcAt(site, T * i / CORRIDOR_STEPS, calm, ARC), floor = island.surfaceAt(p.x, p.z);
        if (p.y - floor < CORRIDOR_ROCK) return CORRIDOR;
        if (p.y - floor >= CORRIDOR_PROP) continue;
        for (let k = 0; k < claims.length; k++) {
          const c = claims[k];
          if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + CORRIDOR_REACH) { site.blocker = c; return CORRIDOR; }
        }
      }
    }
    return OK;
  };
  const RELEASE = { x: 0, y: 0, z: 0 }, ARC = { x: 0, y: 0, z: 0 };

  // A flight's numbers, made once and reused: its phase, the seconds into it, Calm or not, where the body is and
  // faces, the start's offset from the bucket, the canopy's free place and the stick's aim, and the spot it lands on.
  const flight = () => ({ phase: IDLE, t: 0, arm: Infinity, calm: false, x: 0, y: 0, z: 0, heading: 0, offX: 0, offY: 0, offZ: 0,
    hx: 0, hz: 0, aimX: 0, aimZ: 0, spot: -1, open: 0, rescue: false, rescueX: 0, rescueY: 0, rescueZ: 0, launches: 0, landings: 0 });
  // Starts a flight from feet at (x, y, z).
  const start = (site, f, x, y, z, calm) => {
    f.phase = WHIPPING; f.t = 0; f.arm = 0; f.calm = !!calm; f.spot = -1; f.open = 0; f.rescue = false;
    const rest = bucketAt(site, REST, BUCKET);
    f.offX = x - rest.x; f.offY = y - rest.y; f.offZ = z - rest.z;
    f.x = x; f.y = y; f.z = z; f.heading = site.ry;
    f.aimX = f.hx = site.aimX; f.aimZ = f.hz = site.aimZ;
    f.launches++;
  };
  const BUCKET = { x: 0, y: 0, z: 0 };
  // One step of `dt` seconds with the stick at (steerX, steerZ) in the world (each -1 to 1): the whip carries the feet
  // in the bucket from where they stood, the arc throws them, the canopy lets them down onto the checked spot nearest
  // the steered aim. Returns the phase; LANDED once on the spot, exactly.
  const step = (site, f, dt, steerX, steerZ, probe = null) => {
    if (f.phase === IDLE || f.phase === LANDED) { f.arm += dt; return f.phase; }
    f.t += dt; f.arm += dt;
    const c = f.calm ? CALM : THROW;
    if (f.phase === WHIPPING) {
      const up = f.calm ? smooth(f.t / c.whip) : clamp(f.t / c.whip, 0, 1), b = bucketAt(site, REST + (WHIP - REST) * up, BUCKET), k = 1 - up;
      f.x = b.x + f.offX * k; f.y = b.y + f.offY * k; f.z = b.z + f.offZ * k;
      if (f.t < c.whip) return f.phase;
      f.phase = THROWN; f.t -= c.whip;
    }
    if (f.phase === THROWN) {
      const T = arcSeconds(site, f.calm), p = arcAt(site, Math.min(f.t, T), f.calm, ARC);
      f.x = p.x; f.y = p.y; f.z = p.z;
      if (f.t < T) return f.phase;
      f.phase = CHUTE; f.t -= T; f.hx = site.aimX; f.hz = site.aimZ;
    }
    // Under the canopy: the stick moves the aim inside a cone opening from the bridge's island end out along the bridge
    // and over the water to the rainforest (`STEER`), and the canopy drifts after it, kept out of anything rising
    // higher than a step over its feet. It comes down on whatever `probe` says stands under it: the island's ground,
    // the bridge's deck, the rainforest's floor or a crown. Over water or the sea it finds the nearest ground that will
    // hold it once it is RESCUE.height over the water (or the bridge's end, over the sea) and drifts there instead;
    // the bridge end's checked spots are the last resort.
    f.open = Math.min(1, f.open + dt / c.open);
    const dx = site.dirX, dz = site.dirZ, sx = clamp(steerX, -1, 1), sz = clamp(steerZ, -1, 1);
    let u = (f.aimX - site.aimX) * dx + (f.aimZ - site.aimZ) * dz, v = -(f.aimX - site.aimX) * dz + (f.aimZ - site.aimZ) * dx;
    u = clamp(u + (sx * dx + sz * dz) * STEER.speed * dt, -STEER.back, STEER.forward);
    const side = STEER.side + Math.max(0, u) * STEER.flare;
    v = clamp(v + (-sx * dz + sz * dx) * STEER.speed * dt, -side, side);
    f.aimX = site.aimX + u * dx - v * dz; f.aimZ = site.aimZ + u * dz + v * dx;
    if (sx || sz) f.heading = Math.atan2(sx, sz);
    const top = apexOf(site, f.calm);
    f.y = top - f.t * c.fall;
    if (f.rescue) {
      // Drifting to the ground found: straight there at RESCUE.speed, down no lower than it.
      const rx = f.rescueX - f.hx, rz = f.rescueZ - f.hz, d = Math.hypot(rx, rz), go = Math.min(d, RESCUE.speed * dt);
      if (d > 1e-9) { f.hx += rx / d * go; f.hz += rz / d * go; }
      if (f.y < f.rescueY) f.y = f.rescueY;
      f.x = f.hx; f.z = f.hz;
      if (go < d || f.y > f.rescueY) return f.phase;
      return touch(f, f.rescueX, f.rescueY, f.rescueZ);
    }
    const follow = 1 - Math.exp(-STEER.follow * dt), px = f.hx, pz = f.hz;
    f.hx += (f.aimX - f.hx) * follow; f.hz += (f.aimZ - f.hz) * follow;
    let floor = probe ? probe.ground(f.hx, f.hz, f.y + STEP) : -Infinity;
    if (floor > f.y + STEP) { f.hx = px; f.hz = pz; floor = probe.ground(f.hx, f.hz, f.y + STEP); }
    f.x = f.hx; f.z = f.hz;
    const holds = floor > -Infinity && probe.ok(f.hx, f.hz, floor);
    if (holds) return f.y > floor ? f.phase : touch(f, f.hx, floor, f.hz);
    if (f.y - (floor > -Infinity ? floor : site.aimY) > RESCUE.height) return f.phase;
    rescue(site, f, probe);
    return f.phase;
  };
  // Lands the flight on (x, y, z), exactly.
  const touch = (f, x, y, z) => {
    f.x = x; f.y = y; f.z = z;
    f.phase = LANDED; f.landings++;
    return f.phase;
  };
  // The nearest ground round the canopy that will hold it, ring by ring out to RESCUE.reach, no higher than a step
  // over its feet; else the bridge end's nearest checked spot.
  const rescue = (site, f, probe) => {
    f.rescue = true;
    if (probe) for (let r = RESCUE.ring; r <= RESCUE.reach + 1e-9; r += RESCUE.ring) for (let k = 0; k < RESCUE.dirs; k++) {
      const a = k / RESCUE.dirs * Math.PI * 2, x = f.hx + Math.cos(a) * r, z = f.hz + Math.sin(a) * r, floor = probe.ground(x, z, f.y + STEP);
      if (floor > -Infinity && floor <= f.y + STEP && probe.ok(x, z, floor)) { f.rescueX = x; f.rescueY = floor; f.rescueZ = z; return; }
    }
    const i = nearestSpot(site, f.hx, f.hz);
    f.rescueX = site.spots[i * 3]; f.rescueY = site.spots[i * 3 + 1]; f.rescueZ = site.spots[i * 3 + 2];
  };
  // Whether the arm has wound back down since the last launch.
  const wound = (f) => f.arm >= (f.calm ? CALM.whip + CALM.wind : THROW.whip + THROW.wind);

  // A visit's catapult. parent: the node it joins; site: `plan`'s; crew: the visit's crew (its `sitPlayer` and
  // `standPlayer`); calm(): reduced motion, read at each launch; burst(x, y, z, kind): the hub's dust ("launch",
  // "land"). Returns the frame's nodes (`node`, the whole; `frame`, its solid body) and the visit's controls: `ready`
  // and `launch` (the act), `update` (once a frame after the crew has moved), `setGameMode`, `end` and `dispose`.
  const create = ({ parent, site, crew, probe = null, calm = () => false, burst = null }) => {
    const { createNode, addChild, removeChild } = BL.scene;
    const node = createNode({ position: { x: site.x, y: site.y, z: site.z }, rotation: { x: 0, y: site.ry, z: 0 }, scale: { x: site.scale, y: site.scale, z: site.scale }, sightHidden: true });
    const frame = createNode({ geometry: M.frame(), sightHidden: true });
    const arm = createNode({ geometry: M.arm(), position: { x: 0, y: PIVOT.y, z: PIVOT.z }, rotation: { x: REST, y: 0, z: 0 }, sightHidden: true });
    addChild(node, frame, arm);
    // The painted coconut on the crossbar's front, half proud of it, toward the island.
    addChild(frame, createNode({ geometry: M.emblem(), position: { x: 0, y: M.CROSSBAR.y, z: M.CROSSBAR.z + M.CROSSBAR.d / 2 }, sightHidden: true }));
    const chute = createNode({ geometry: M.chute(), visible: false, sightHidden: true });
    addChild(parent, node);
    addChild(parent, chute);
    const f = flight();
    // The seat the Ooga rides in: held (`lockMovement`), the act taken by the flight itself, its jetpack kept, and
    // stood up at `walkAt` on `floor`, the spot it lands on.
    const seat = { kind: "catapult", x: 0, y: 0, z: 0, ry: site.ry, floor: 0, sitter: null, walkAt: { x: 0, z: 0 }, lockMovement: true, keepEquipment: true, act: () => true };
    const action = { kind: "catapult" }, flightAction = { kind: "catapult-flight" };
    let rider = null, gameMode = false;
    const flying = () => f.phase !== IDLE && f.phase !== LANDED;
    // The launch rule's question, asked of one scratch record (the hub asks it every frame for the act's prompt).
    const READY = { gameMode: false, busy: false, grounded: false, seated: false, x: 0, feet: 0, z: 0 };
    const ready = (cave) => {
      if (!cave || flying() || !wound(f)) return false;
      const p = cave.root.position;
      READY.gameMode = gameMode; READY.grounded = cave.hop < 0.03 && cave.hopV <= 0;
      READY.seated = !!cave.camp.seat || !!cave.camp.burning || !!cave.grabbedBy;
      READY.x = p.x; READY.feet = p.y - cave.baseY; READY.z = p.z;
      return canLaunch(site, READY);
    };
    const launch = (cave) => {
      if (!ready(cave)) return false;
      const p = cave.root.position, x = p.x, feet = p.y - cave.baseY, z = p.z;
      seat.x = x; seat.y = feet; seat.z = z; seat.ry = site.ry;
      seat.walkAt.x = x; seat.walkAt.z = z; seat.floor = feet;
      if (!crew.sitPlayer(seat)) return false;
      rider = cave;
      start(site, f, x, feet, z, calm());
      place(cave);
      if (burst) burst(x, feet, z, "launch");
      return true;
    };
    // The Ooga where the flight has it, and its pose over the crew's seated one: thrown with its arms flung up and its
    // legs apart, under the canopy holding the cords with its legs dangling.
    const place = (cave) => {
      const p = cave.root.position, parts = cave.parts;
      p.x = f.x; p.y = f.y + cave.baseY; p.z = f.z;
      cave.root.rotation.y = f.heading;
      // The seated modelled pose uses shoulder quaternions; release them before the flight's Euler pose.
      parts.armR.quaternion = parts.armL.quaternion = null;
      parts.armR.rotation.y = parts.armL.rotation.y = 0;
      if (cave.modelled) parts.forearmR.rotation.x = parts.forearmL.rotation.x = -cave.elbow.rest;
      const swing = f.calm ? 0 : Math.sin(f.arm * 7) * 0.25;
      if (f.phase === CHUTE) {
        parts.armR.rotation.x = parts.armL.rotation.x = -2.95;
        parts.legR.rotation.x = 0.12 + swing * 0.4; parts.legL.rotation.x = -0.12 - swing * 0.4;
      } else {
        parts.armR.rotation.x = -2.6 + swing; parts.armL.rotation.x = -2.6 - swing;
        parts.legR.rotation.x = -0.55; parts.legL.rotation.x = 0.4;
      }
    };
    // Stands the rider up where it came down, or, if a body stands there, on the nearest free checked spot at the
    // bridge's end; true once up.
    const standAt = (x, y, z) => {
      seat.walkAt.x = x; seat.floor = y; seat.walkAt.z = z;
      if (!crew.standPlayer(rider, false)) return false;
      rider.root.rotation.y = f.heading;
      if (burst) burst(seat.walkAt.x, seat.floor, seat.walkAt.z, "land");
      return true;
    };
    const standOn = (i) => standAt(site.spots[i * 3], site.spots[i * 3 + 1], site.spots[i * 3 + 2]);
    const land = () => {
      if (standAt(f.x, f.y, f.z)) return true;
      const first = nearestSpot(site, f.x, f.z);
      if (standOn(first)) return true;
      for (let i = 0; i < site.spotCount; i++) if (i !== first && standOn(i)) return true;
      return false;
    };
    const finish = () => {
      chute.visible = false;
      if (rider && rider.camp.seat === seat && !land()) return false;
      rider = null;
      return true;
    };
    // steerX, steerZ: the stick in the world, used only under the canopy.
    const update = (dt, steerX = 0, steerZ = 0) => {
      const phase = step(site, f, dt, steerX, steerZ, probe);
      arm.rotation.x = armAngle(Math.min(f.arm, 60), f.calm);
      if (!rider) return;
      // The crew dropped the seat (the Ooga was taken over, removed or released): the flight ends where it is.
      if (rider.camp.seat !== seat) { f.phase = IDLE; chute.visible = false; rider = null; return; }
      if (phase === LANDED) {
        // A spot taken by a body: hold over it under the canopy and try again next frame.
        if (finish()) f.phase = IDLE;
        else place(rider);
        return;
      }
      // Should the crew stand it up meanwhile (a forced release), it stands up at the bridge's end, not back on the hill.
      const i = f.spot >= 0 ? f.spot : nearestSpot(site, f.aimX, f.aimZ);
      seat.walkAt.x = site.spots[i * 3]; seat.floor = site.spots[i * 3 + 1]; seat.walkAt.z = site.spots[i * 3 + 2];
      place(rider);
      chute.visible = phase === CHUTE;
      if (chute.visible) {
        const k = (0.25 + 0.75 * smooth(f.open)) * rider.bodyHeight * 0.95 / 2.04;
        chute.position.x = f.x; chute.position.y = f.y; chute.position.z = f.z;
        chute.rotation.y = f.heading;
        chute.rotation.z = f.calm ? 0 : Math.sin(f.arm * 1.7) * 0.06;
        chute.scale.x = chute.scale.y = chute.scale.z = k;
      }
    };
    // Ends a flight at once (GAME MODE, a suspend): the Ooga comes down on the nearest checked spot (or, should bodies
    // stand on every one, waits over it until one is free, as a landing does).
    const end = () => {
      if (!flying() && f.phase !== LANDED) return;
      if (f.phase !== LANDED) {
        f.spot = nearestSpot(site, f.aimX, f.aimZ);
        f.x = site.spots[f.spot * 3]; f.y = site.spots[f.spot * 3 + 1]; f.z = site.spots[f.spot * 3 + 2];
        f.phase = LANDED;
      }
      if (finish()) f.phase = IDLE;
    };
    // GAME MODE puts the catapult away (hidden, so not solid either) and ends a flight.
    const setGameMode = (on) => {
      gameMode = !!on;
      if (gameMode) end();
      node.visible = !gameMode;
    };
    const dispose = () => {
      end();
      removeChild(parent, node); removeChild(parent, chute);
      rider = null;
    };
    return {
      node, frame, action, flightAction, ready, launch, update, end, setGameMode, dispose,
      get flying() { return flying(); },
      debug: {
        site, flight: f,
        get phase() { return PHASES[f.phase]; },
        get arm() { return arm.rotation.x; },
        get chute() { return chute.visible; },
        get rider() { return rider ? rider.traits.name : null; }
      }
    };
  };
  BL.hubCatapult = { RESCUE, plan, planSteps, overlaps, HILLS, SCALES, TURNS, REASONS, flight, start, step, onPad, canLaunch, armAngle, arcAt, arcSeconds, nearestSpot, wound, create, PREFER, AIM_R, THROW, CALM, STEER, PHASES };
})();
