// Block Frenzy's rules: capture the flag on Fort Chaos, two Oogas a side, no deaths. The "flag" each team guards is
// its Bitcoin block, a glowing orange cube on a stand; the code calls it a flag, the page calls it a block. Pure state
// and functions, no DOM or scene, so the suite plays whole rounds in Node; `scene-block.js` draws it and feeds the
// player's input.
//
// Each team keeps its flag on the stand inside its fort. Touch the other team's flag (on its stand or where it was
// dropped) to carry it; carry it home and touch your own stand while your own flag is home to capture. Captures
// return both flags. A carrier can drop the flag (`drop`), and a splatted, netted-and-splatted or trapped carrier
// drops it too. A dropped flag stays where it fell, as long as it takes: the carrier's teammates can grab it and run
// on, and its own team has to pick it up and carry it all the way back to its stand. A carrier can't pick the same
// flag up again until they have left its circle, so a drop is never undone by standing still.
//
// Tools (`fire` with a kind): paint balls without end, and a few paint grenades (lobbed, burst on landing), paint
// rockets (straight, burst on impact) and nets (slow a rival and stop their jumps for `NET_S`). A paint hit or a burst
// splats a rival: frozen for `SPLAT_S`, unable to move, throw or carry, and a carrier drops the flag where they stand.
// Then `GUARD_S` of fresh-paint protection. Walking onto your own stand refills grenades, rockets and nets. Nobody
// dies, nobody is removed, nobody has health. First team to the round's `target` captures wins (`CAPTURES` unless the
// player who starts it picks another).
//
// Crates: wooden boxes anyone can push by walking into them and stand on. Each fort starts with a few, each team has
// a stock to place (`build`) on its own half, and a round opens with `PREP_S` of fortifying, each side kept to its
// own half and the flags locked, so the bots plug their gates and the visitor can wall theirs: getting in then takes
// a push or a double jump. A crate never lands on a stand. An Ooga can pick a crate up (`grab`), carry it overhead,
// set it down or stack it up to three high (`grab` again), or throw it (`fire` with "crate"): a crate that hits a
// rival stuns them as a paint hit does, and lands as a crate where it falls.
//
// Quiz traps: glowing Matrix pads on the field (`ARENA.traps`). Step on one and a bubble closes round you: you can't
// move, throw, pick up or score, a carrier drops the block, and nobody can paint you inside it. You get out by
// answering a Bitcoin question (the scene asks it and calls `escape`), or the bubble wears off after `TRAP_MAX_S`.
// Bots "work the question" for a seeded few seconds. A sprung pad goes dark for `TRAP_REARM_S`.
//
// Weather: the sky turns from clear to stormy and back on a seeded schedule; a storm brings rain and lightning.
//
// Every number lives in CONFIG. The arena, its blocks and the stands live in ARENA. Actors, flags, shots, crates and
// the event ring are preallocated in `create`; `step` allocates nothing. Bots and weather draw from the run's seeded
// `rng`, so a seed replays a round.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const CONFIG = {
    JUMP: 6.5, JUMP2: 6.5, FALL: 16, CARRY_JUMP: 1, CROUCH_H: 1.05, CROUCH_SPEED: 0.55,
    CAPTURES: 3, SPLAT_S: 2, GUARD_S: 2.5, PICK_R: 1.3, STAND_R: 1.7, BODY_R: 0.45, HEIGHT: 1.7,
    SPEED: 6.2, SPRINT: 1.55, CARRY: 0.88, SPRINT_S: 4, SPRINT_REST: 0.8, SPRINT_REFILL: 5, SPRINT_MIN: 0.3, BOT_SPEED: 5.5, ACCEL: 30,
    SHOT_Y: 1.3, BOT_COOLDOWN: 1.4, BOT_RANGE: 12, BOT_SPREAD: 0.2, BOT_AIM: 0.6, GUARD_RANGE: 10,
    MAX_SHOTS: 96, MAX_EVENTS: 48, STEP: 1 / 120,
    TRAP_R: 0.95, TRAP_MAX_S: 25, TRAP_REARM_S: 8, BOT_THINK: [3.5, 8], MAX_SIDE: 5,
    PREP_S: 20, CRATE_HALF: 0.6, CRATE_H: 1.1, MAX_CRATES: 32, CRATE_STOCK: 3, PUSH: 0.55, STAND_CLEAR: 2.4,
    NET_S: 4, NET_SLOW: 0.4, PASS_SPEED: 13, PASS_LIFT: 5, PASS_GRAVITY: 13, PASS_SAFE: 0.45, CATCH_R: 1.5,
    WEATHER_S: [24, 42],
    TRAMP_R: 1.0, BOUNCE: 13.5, STEP_UP: 0.45, FIRE_R: 0.95, BURN_HOPS: 3, BURN_SLOW: 0.25,
    JET_FUEL: 2.6, JET_REFILL: 3, JET_ACCEL: 27, JET_RISE: 6, JET_CEILING: 15,
    GORILLA_SPEED: 3.2, GORILLA_CHARGE: 8, GORILLA_SIGHT: 8, GORILLA_LEASH: 11, GORILLA_WANDER: 5, GORILLA_R: 0.75,
    GORILLA_GRAB_R: 1.2, GRAB_NEED: 10, GRAB_DRAIN: 1.4, GRAB_MASH: 5, GRAB_MAX_S: 30, GORILLA_REST: 6, GORILLA_STUN: 1.6,
    // A captive is dragged by the feet to the nearest edge at `GORILLA_DRAG`, swung over the wind-up (`GORILLA_THROW_S`)
    // and thrown off at `GORILLA_THROW`, up at `GORILLA_THROW_UP`, its steering knocked out for `THROWN_S`.
    GORILLA_DRAG: 7.5, GORILLA_DRAG_R: 0.5, GORILLA_THROW_S: 0.45, GORILLA_THROW: 11, GORILLA_THROW_UP: 9, THROWN_S: 0.5, DRAG_BACK: 1.3, DRAG_EDGE: 1.2,
    GOLD_GUNS: 2, AK_MAG: 30, GOLD_SIDE: 0.3, AK_RELOAD: 1.4, MONKEYS_S: 12, MONKEY_SIDE: 0.8, MONKEY_COOL: 1, HOMER_TURN: 3.5, HOMER_SEEK: 20, CATAPULT_R: 1.0, LAUNCH_H: 13, CHUTE_FALL: 2.8, DROP_IN_H: 14, CHUTE_SPEED: 3.4, PEEL_R: 0.55, SLIP_S: 1.5, SLIP_SPIN: 13, PEEL_REARM: 8,
    POWER_R: 1.1, POWER_RESPAWN: 20, BOOTS_S: 6, BOOTS: 1.5, HALVING_S: 12, COLD_S: 12, LASER_S: 25, BEAM_S: 3, BEAM_LEN: 30, BEAM_R: 0.45,
    // Free Hardware Wallets (DSB Land's VAC 2, brought over): a vending machine each side; a device taken goes off when
    // its fuse runs out, and a blast sets off any other within `WALLET_CHAIN`, knocking everyone near it back.
    WALLET_CAP: 12, WALLET_FUSE: 5, WALLET_STICK_R: 0.65, VEND_R: 1.9, VEND_COOL: 5, WALLET_SPEED: 13, WALLET_LIFT: 2, WALLET_GRAVITY: 14,
    WALLET_BLAST: 3.2, WALLET_CHAIN: 2.5, WALLET_PUSH: 9, WALLET_CAP_N: 8, KNOCK_S: 0.55, SOOT_S: 3,
    // Haunted Hollow's ghosts: they drift through walls round their haunt, chase an Ooga that comes within
    // `GHOST_SIGHT`, and a touch (`GHOST_R`) spooks it stiff for `SPOOK_S` (dropping a crate, not a block); then the ghost fades
    // and comes back after `GHOST_BACK`. Paint or a blast pops one sooner.
    GHOST_SPEED: 1.4, GHOST_CHASE: 3, GHOST_SIGHT: 6, GHOST_R: 0.7, SPOOK_S: 1.2, GHOST_BACK: 14, GHOST_POP: 10,
    GOAL_R: 2.4, HOP_R: 1.8, RIDE_UP: 0.55, RIDE_BACK: 0.42, MOUNT_SLOW: 0.85, CALL_S: 6, CALL_R: 12,
    TOWER_TOP: 6.4, CLIMB: 3.6, ZIP_SPEED: 15, ZIP_HANG: 1.9, ZIP_R: 1.6, CACHE_S: 15, CACHE_R: 1.2,
    // The floating island: its edges are open. A body whose feet are more than `RIM` under the top has gone over the
    // edge (it no longer stands on the island and is kept out of its rock); one that falls past `FALL_FLOOR` comes back
    // in its own block zone. A block carried over the edge drops at the edge and goes home after `EDGE_HOME_S`. The
    // rock under the island is `ISLE_EDGE` deep at the edge and deepens toward the middle, `ISLE_DEPTH` at most.
    // Lightning in a storm: every `BOLT_S` or so a spot under a seeded Ooga is warned (`BOLT_WARN`), then struck; anyone
    // still within `BOLT_R` is splatted (no more than once per `BOLT_COOL` each).
    BOLT_S: [7, 13], BOLT_WARN: 1.4, BOLT_R: 1.8, BOLT_COOL: 18, PUDDLE_R: 0.9, PUDDLE_REARM: 6,
    RIM: 0.6, RESPAWN_GUARD: 0.4, ENEMY_CAT_UP: 17, ENEMY_CAT_PAST: 9, FALL_FLOOR: -40, EDGE_HOME_S: 3, ISLE_EDGE: 2.5, ISLE_DEPTH: 14,
    // The grappling hook (Cloud Hopper's, a special weapon here): `HOOKS` a map, hidden at seeded spots from the map's
    // hand-checked `hookSpots`. It flies out at `HOOK_FLY`, up to `HOOK_RANGE`; a bite on rock pulls the Ooga toward it at
    // up to `HOOK_PULL` (`HOOK_ACCEL` to get there), on a rope that only shortens, so it swings under the bite; crouch
    // held stops the pull and leaves the swing. It ends `HOOK_MIN` from the bite or after `HOOK_HOLD_S`, and the Ooga
    // keeps its speed for `HOOK_FLING_S` (the air's usual steering held off). A
    // rival carrying a block has the block yanked out of their hands after `HOOK_WARN`. A gorilla is stunned for
    // `HOOK_STUN_S`, dropping its captive, and can't be hook-stunned again for `HOOK_STUN_COOL`. `HOOK_COOL` between throws.
    HOOKS: 2, HOOK_R: 1.1, HOOK_RANGE: 24, HOOK_FLY: 60, HOOK_MIN: 1.6, HOOK_HOLD_S: 4, HOOK_COOL: 2.5, HOOK_WARN: 0.35,
    HOOK_HIT_R: 0.7, HOOK_STUN_S: 2.5, HOOK_STUN_COOL: 8, HOOK_YANK_LIFT: 6, HOOK_HOP: 4, HOOK_AIR: 0.12, HOOK_PULL: 16, HOOK_ACCEL: 45, HOOK_FLING_S: 0.8, HOOK_YANK_COOL: 12, BLOCK_GRACE_S: 0.7, HOOK_BLOCK_R: 0.9, HOOK_BLOCK_H: 2.2, HOOK_BLOCK_PULL: 30
  };
  // The tools: speed, upward lob, gravity, life in seconds, hit radius, burst radius (0 for none), cooldown, and how
  // many a full refill holds (0 for no limit).
  const TOOLS = {
    paint: { speed: 24, lift: 2.2, gravity: 9, life: 1.1, r: 0.5, blast: 0, cool: 0.32, max: 0 },
    grenade: { speed: 12, lift: 4.5, gravity: 14, life: 2.2, r: 0.45, blast: 2.6, cool: 0.8, max: 3 },
    rocket: { speed: 28, lift: 0, gravity: 0, life: 1.6, r: 0.55, blast: 3.2, cool: 1.2, max: 1 },
    // The net launcher: flat and fast, opening wide in flight.
    net: { speed: 30, lift: 0.3, gravity: 3, life: 1, r: 1.7, blast: 0, cool: 0.8, max: 3 },
    crate: { speed: 12, lift: 2.5, gravity: 14, life: 2.5, r: 0.9, blast: 0, cool: 0.6, max: 0 },
    // The sniper rifle: it stays in the sniper towers, so it fires only from a tower's platform; fast, flat and long.
    sniper: { speed: 60, lift: 0, gravity: 0.6, life: 0.85, r: 0.35, blast: 0, cool: 0.35, max: 0 },
    // The Golden Dual AKs: one in each hand, full auto, both firing every round (two balls `GOLD_SIDE` either side of
    // the Ooga), never empty. There are `GOLD_GUNS` pairs a round: mining a block wins a pair while any are left, and
    // a wallet bomb stuck on whoever holds them takes them when it goes off.
    gold: { speed: 36, lift: 1.2, gravity: 6.5, life: 1.1, r: 0.48, blast: 0, cool: 0.08, max: 0 },
    // The Ooga AK, the island's rifle: a tap fires one round, a held trigger fires on full auto every `cool` (the island
    // AK's 0.09 s), from a `AK_MAG`-round magazine that reloads itself in `AK_RELOAD` when it runs dry.
    ak: { speed: 38, lift: 1.0, gravity: 6, life: 1.0, r: 0.42, blast: 0, cool: 0.09, max: 0 },
    // The monkeys' heat-seekers: a little missile that steers for the nearest rival (`target`), splatting it.
    homer: { speed: 16, lift: 0, gravity: 0, life: 2.8, r: 0.55, blast: 0, cool: 0, max: 0 }
  };
  const KINDS = ["paint", "grenade", "rocket", "net"];
  // The six devices from the wallet store, in its order.
  const WALLETS = ["Rektdger", "ClownCard", "BrickBox02", "Passpoor", "Jaded", "SeedSnitcher"];
  const WALLET_THROW = { speed: CONFIG.WALLET_SPEED, lift: CONFIG.WALLET_LIFT, gravity: CONFIG.WALLET_GRAVITY };
  // The maps. A map is its blocks, each [x0, x1, z0, z1, top, bottom] (bottom 0 unless it floats: a floor, a roof or
  // a wall's upper half), and the places on it. x runs across, z along, the ground is at y 0, blue's end is at +z and
  // red's at -z, and red's half is blue's turned half round (`turned`, `flip`), so neither side is favoured. Anything
  // whose top an Ooga can reach is somewhere to stand; a step no higher than `STEP_UP` is walked up.
  const W = 22, L = 37;
  // A box from its centre and size, for the posts and the crates.
  const at = (x, z, w, d, top, bottom = 0) => [x - w / 2, x + w / 2, z - d / 2, z + d / 2, top, bottom];
  // The standable top of a canopy of radius r on a trunk `y` high: a ledge (one way, like a cloud platform: it holds
  // whoever comes down on it and lets anyone rise through it from below), its top level with the leaves' crown
  // (`y` + LEAF_TOP), LEAF_SPAN times the radius across. A ledge is no block: it stops nothing sideways or overhead,
  // nothing draws it (the leaves are the decor's), and only `groundAt` reads it.
  const LEAF_TOP = 1.45, LEAF_FLOOR = 0.25, LEAF_SPAN = 1.3;
  const leafTop = (x, z, y, r) => at(x, z, r * LEAF_SPAN, r * LEAF_SPAN, y + LEAF_TOP, y + LEAF_TOP - LEAF_FLOOR);
  // Red's half is blue's turned half round: every box, and every spot, mirrored through the centre.
  const turned = (b) => [-b[1], -b[0], -b[3], -b[2], b[4], b[5]];
  const flip = (list) => list.map(([x, z]) => [-x, -z]);
  const TEAMS = ["blue", "red"];
  // A sniper tower beside each end, on every map: four posts, a platform at `TOWER_TOP`, a parapet with a gap over the
  // ladder on the side facing in, and no roof, so the camera sees a sniper. The ladder is a climb zone, not a block (`ladders`); the rifle
  // rack is on the platform; the zipline leaves from the platform's gap side and runs down into the other end (`zips`).
  const TOP = CONFIG.TOWER_TOP, RAIL = TOP + 0.9;
  const TOWER = [-19, -16, 24.5, 27.5], GAP = [25.4, 26.6];
  const towerBlocks = ([x0, x1, z0, z1], GAP = [25.4, 26.6]) => [
    [x0, x0 + 0.4, z0, z0 + 0.4, TOP - 0.3, 0], [x1 - 0.4, x1, z0, z0 + 0.4, TOP - 0.3, 0], [x0, x0 + 0.4, z1 - 0.4, z1, TOP - 0.3, 0], [x1 - 0.4, x1, z1 - 0.4, z1, TOP - 0.3, 0],
    [x0, x1, z0, z1, TOP, TOP - 0.3],
    [x0, x0 + 0.25, z0, z1, RAIL, TOP], [x0, x1, z0, z0 + 0.25, RAIL, TOP], [x0, x1, z1 - 0.25, z1, RAIL, TOP],
    [x1 - 0.25, x1, z0, GAP[0], RAIL, TOP], [x1 - 0.25, x1, GAP[1], z1, RAIL, TOP]
  ];
  // A map from blue's half (`half`, turned for red) and its middle (`middle`, put in once), with the towers added.
  const turnedMap = (half, middle, steps = [], tower = TOWER, gap = GAP) => {
    const BLOCKS = [...middle], stepSet = new Set();
    for (const b of half) { const r = turned(b); BLOCKS.push(b, r); if (steps.includes(b)) stepSet.add(b).add(r); }
    for (const b of towerBlocks(tower, gap)) BLOCKS.push(b, turned(b));
    return { BLOCKS, steps: stepSet };
  };
  const both = (list) => ({ blue: list, red: flip(list) });
  // Hub-style terrain, in the island's own rock: footprints on blue's half on a half-metre grid (so the voxel island
  // meshes them exactly), turned half round for red, so each map stays mirrored and fair. A mound is two grassy tiers
  // (1 m, then 2 m, each a jump up) for high ground; a cave is a walk-through tunnel, 3 m wide, its two walls 1 m thick
  // and its roof from 2.5 m to 3.5 m (cover and a flanking way through, never a dead end); an outcrop is a tall rock
  // breaking a long lane. `along` is "z" for a tunnel running down the field, "x" across it.
  // A footprint's cells rounded to an oval (corners knocked off), merged into boxes.
  const inOval = (x0, x1, z0, z1, i, j) => { const u = (x0 + i + 0.5 - (x0 + x1) / 2) / ((x1 - x0) / 2), v = (z0 + j + 0.5 - (z0 + z1) / 2) / ((z1 - z0) / 2); return Math.abs(u) ** 2.6 + Math.abs(v) ** 2.6 <= 1; };
  const gridBoxes = (x0, z0, nx, nz, cells, kind, top, bottom) => {
    const out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (!cells[i * nz + j]) continue;
      let d = 1;
      while (j + d < nz && cells[i * nz + j + d]) d++;
      let w = 1;
      for (;; w++) { if (i + w >= nx) break; let full = true; for (let k = 0; k < d; k++) if (!cells[(i + w) * nz + j + k]) { full = false; break; } if (!full) break; }
      for (let a = 0; a < w; a++) for (let k = 0; k < d; k++) cells[(i + a) * nz + j + k] = 0;
      out.push([kind, [x0 + i, x0 + i + w, z0 + j, z0 + j + d, top, bottom]]);
    }
    return out;
  };
  const rounded = (x0, x1, z0, z1, kind, top, bottom) => {
    const nx = x1 - x0, nz = z1 - z0;
    if (nx % 1 || nz % 1 || nx < 3 || nz < 3) return [[kind, [x0, x1, z0, z1, top, bottom]]];
    const cells = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) cells[i * nz + j] = inOval(x0, x1, z0, z1, i, j) ? 1 : 0;
    return gridBoxes(x0, z0, nx, nz, cells, kind, top, bottom);
  };
  const mound = (x0, x1, z0, z1) => [...rounded(x0, x1, z0, z1, "mound", 1, 0), ...rounded(x0 + 1, x1 - 1, z0 + 1, z1 - 1, "mound", 2, 1)];
  const cave = (x0, x1, z0, z1, along = "z") => massif(x0, x1, z0, z1, along === "z" ? [[x0 + 1, x1 - 1, z0, z1]] : [[x0, x1, z0 + 1, z1 - 1]]);
  const outcrop = (x0, x1, z0, z1, top = 3) => rounded(x0, x1, z0, z1, "outcrop", top, 0);
  // A rock massif on a metre grid: solid to `top`, its ground floor holed by `tunnels` (walk-through corridors, any that
  // meet joining up). The walls are the footprint less the tunnels, merged into boxes; the roof is one slab to stand on.
  const massif = (x0, x1, z0, z1, tunnels, top = 3.5) => {
    const nx = x1 - x0, nz = z1 - z0, rock = new Uint8Array(nx * nz), roof = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) rock[i * nz + j] = roof[i * nz + j] = inOval(x0, x1, z0, z1, i, j) ? 1 : 0;
    for (const [tx0, tx1, tz0, tz1] of tunnels) for (let i = tx0 - x0; i < tx1 - x0; i++) for (let j = tz0 - z0; j < tz1 - z0; j++) rock[i * nz + j] = 0;
    return [...gridBoxes(x0, z0, nx, nz, rock, "cave", 2.5, 0), ...gridBoxes(x0, z0, nx, nz, roof, "cave", top, 2.5)];
  };
  // A cliff: a 2 m step all round a 4 m block, a double jump and then a jump up.
  const cliff = (x0, x1, z0, z1) => [...rounded(x0, x1, z0, z1, "cliff", 2, 0), ...rounded(x0 + 1, x1 - 1, z0 + 1, z1 - 1, "cliff", 4, 2)];
  // The ring of terrain round every map's field, on blue's half (turned for red): a cave system on each flank, one
  // behind each fort, cliffs by the back corners, a mound and an outcrop at the waist. `spots` are its hook hiding places.
  const ringTerrain = (W, L) => ({
    terrain: [
      ...massif(W + 1, W + 9, 4, 18, [[W + 3, W + 6, 4, 18], [W + 1, W + 3, 9, 12], [W + 6, W + 9, 14, 16]]),
      ...massif(-W - 8, -W - 1, 6, 22, [[-W - 6, -W - 3, 6, 22], [-W - 8, -W - 6, 12, 15], [-W - 3, -W - 1, 16, 19]]),
      ...massif(-12, 12, L + 4, L + 12, [[-12, 12, L + 7, L + 10], [-2, 1, L + 4, L + 7]]),
      ...cliff(14, 20, L + 1, L + 7), ...cliff(-20, -14, L + 1, L + 7),
      ...mound(W + 1, W + 5, 24, 30), ...mound(-W - 5, -W - 1, 24, 30),
      ...outcrop(W + 1, W + 3, -2, 1)
    ],
    spots: [[W + 4.5, 0, 11], [-W - 4.5, 0, 14], [0, 0, L + 8.5]]
  });

  // Fort Chaos: a stone fort at each end, a double jump (`JUMP` then `JUMP2`) clearing its 2.4 m walls, stilt huts
  // and a centre deck for a second storey, and the alley behind each fort as a back way in.
  const fortChaos = () => {
    const half = [
      // A fort: back, sides, the front either side of its gate; a crate in the alley behind to climb from.
      [-8, 8, 32, 33, 2.4, 0], [-8, -7, 23, 32, 2.4, 0], [7, 8, 23, 32, 2.4, 0], [-8, -2.6, 23, 24, 2.4, 0], [2.6, 8, 23, 24, 2.4, 0],
      at(0, 34.6, 2, 1.2, 1.1),
      // Crates before the gate, and two tall walls either side of the approach to break the long sight line.
      at(0, 19, 2.4, 1, 1.1), [-6.5, -3, 13, 14, 3.2, 0], [3, 6.5, 13, 14, 3.2, 0],
      // Low cover across the field and the side rocks.
      [-11, -5, 8.5, 9.5, 1.1, 0], [5, 11, 8.5, 9.5, 1.1, 0], [-20, -18, 4, 7, 1.6, 0], [18, 20, 4, 7, 1.6, 0]
    ];
    // A stilt hut on each side of each half: four posts, a floor at 2 m, walls with a window band at eye height, open
    // to the sky so the camera can see in, and its open side facing the field's edge. `s` is the side, -1 or 1.
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 8 : -14, x1 = s > 0 ? 14 : -8, outer = s > 0 ? x1 : x0, inner = s > 0 ? x0 : x1;
      for (const [px, pz] of [[x0 + 0.3, 11.3], [x1 - 0.3, 11.3], [x0 + 0.3, 15.7], [x1 - 0.3, 15.7]]) half.push(at(px, pz, 0.6, 0.6, 2));
      half.push([x0, x1, 11, 16, 2.3, 2]);
      // The wall facing the middle and the wall toward the fort: a lower band, a window, then an upper band.
      for (const [z0, z1] of [[11, 11.4], [15.6, 16]]) half.push([x0, x1, z0, z1, 3.2, 2.3], [x0, x1, z0, z1, 4.2, 3.85]);
      half.push([Math.min(inner, inner + 0.4 * s), Math.max(inner, inner + 0.4 * s), 11, 16, 4.2, 2.3]);
      // The open side keeps a short rail.
      half.push([Math.min(outer, outer - 0.4 * s), Math.max(outer, outer - 0.4 * s), 11, 12.5, 3.1, 2.3]);
    }
    // The centre deck: four posts, a floor at 2.2 m with gaps in its north and south parapets, open to the sky, and a
    // crate by each gap to jump from. It is symmetric itself, so it goes in once.
    const middle = [];
    for (const [px, pz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]]) middle.push(at(px, pz, 0.8, 0.8, 2.2));
    middle.push([-3.2, 3.2, -3.2, 3.2, 2.5, 2.2]);
    for (const s of [-1, 1]) {
      middle.push([s > 0 ? 2.8 : -3.2, s > 0 ? 3.2 : -2.8, -3.2, 3.2, 3.4, 2.5]);
      for (const [x0, x1] of [[-3.2, -1], [1, 3.2]]) middle.push([x0, x1, s > 0 ? 2.8 : -3.2, s > 0 ? 3.2 : -2.8, 3.4, 2.5]);
    }
    middle.push(at(0, 4.6, 1.6, 1, 1), at(0, -4.6, 1.6, 1, 1));
    // Fort Chaos mirrors its halves end to end rather than turning them; its huts and walls are symmetric across.
    const BLOCKS = [...middle];
    for (const b of half) BLOCKS.push(b, [b[0], b[1], -b[3], -b[2], b[4], b[5]]);
    for (const b of towerBlocks(TOWER)) BLOCKS.push(b, turned(b));
    return {
      id: "fort", name: "Fort Chaos", BLOCKS, steps: new Set(),
      // Hub-style terrain (`mound`, `cave`, `outcrop`) and the grappling hooks' hand-checked hiding spots [x, y, z]:
      // in the cave, on the mound's top, behind the outcrop.
      terrain: [...cave(15.5, 20.5, 13.5, 17.5), ...mound(-21.5, -17.5, 9, 15), ...outcrop(1.5, 3.5, 6, 7.5)],
      hookSpots: [[18, 0, 15.75], [-19.5, 2, 12], [2.5, 0, 8.4]],
      // Where a defender waits: a little in front of its own gate.
      gorillas: [[-14, 1], [14, -1], [17, 10], [-17, -10]],
      guard: { blue: { x: 0, z: 17.2 }, red: { x: 0, z: -17.2 } },
      // The quiz pads.
      traps: [[-10, 13], [10, -13], [10, 13], [-10, -13], [-17, 0], [17, 0], [-4.5, 4.5], [4.5, -4.5]],
      crates: both([[-4.6, 20.6], [4.6, 20.6], [-1.6, 29.6], [1.6, 29.6]]),
      // Where a defender plugs its gate at the start: one in the gate and two behind it, so pushing won't open it.
      plug: both([[0, 21.4], [-1.3, 22.6], [1.3, 22.6]]),
      // Where an attacker bot drops its stock: across the alley behind its fort, to make the back way harder.
      alley: both([[-3, 35.6], [3, 35.6], [0, 31.1]]),
      // Ammo caches: one on each stilt hut's floor and one on the centre deck. A cache refills grenades, rockets and
      // nets like a stand, then goes dark for `CACHE_S`.
      caches: [[12.5, 2.3, 13.5], [-12.5, 2.3, 13.5], [12.5, 2.3, -13.5], [-12.5, 2.3, -13.5], [0, 2.5, 0]],
      // Trampolines flush with the ground: landing on one (or walking onto it) sends an Ooga flying, carrying or not,
      // with the double jump still to come.
      tramps: [[-15, 19], [15, -19], [12, 4], [-12, -4]],
      // Power-up spots, each holding one of `POWERS` until someone runs through it.
      powers: [[-6, 18], [6, -18], [16, 11], [-16, -11], [0, 9.5], [0, -9.5]],
      // The campfire the potato Oogas dance round, out on the halfway line by the field's edge.
      fire: [-20, 0],
      // Each side's catapult, inside its own fort beside the stand.
      catapults: both([[-5, 29.5]])
    };
  };

  // Ooga Town: a two-storey bank at each end with the block's stand in its open hall and a mezzanine over the back,
  // reached by stairs; a pair of two-storey shops in each half, their upper floors joined by a footbridge over the
  // street; market stalls, a fountain in the square and the campfire by the edge.
  const oogaTown = () => {
    const half = [], steps = [];
    // The bank: back wall with a door, side walls rising to the mezzanine, the front either side of its doors.
    half.push([-9, -1.2, 34, 35, 4, 0], [1.2, 9, 34, 35, 4, 0], [-9, -8, 24, 34, 4, 0], [8, 9, 24, 34, 4, 0], [-9, -2.5, 24, 25, 3, 0], [2.5, 9, 24, 25, 3, 0]);
    // The mezzanine over the back of the hall, its parapet open over the stairs and in the middle to jump down.
    half.push([-8, 8, 30.5, 34, 3, 2.7], [-8, -2.2, 30.5, 30.7, 3.9, 3], [2.2, 6, 30.5, 30.7, 3.9, 3]);
    // Seven steps up the inside of the right wall to the mezzanine.
    for (let k = 1; k <= 7; k++) { const b = [6, 8, 25.6 + (k - 1) * 0.7, 25.6 + k * 0.7, k * 3 / 7, 0]; half.push(b); steps.push(b); }
    // The two shops of the half, one either side of the street.
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 9 : -16, x1 = s > 0 ? 16 : -9, xm = (x0 + x1) / 2, outer = s > 0 ? x1 : x0, inner = s > 0 ? x0 : x1;
      const lo = (v) => Math.min(v, v - 0.4 * s), hi = (v) => Math.max(v, v - 0.4 * s), li = (v) => Math.min(v, v + 0.4 * s), hiI = (v) => Math.max(v, v + 0.4 * s);
      half.push([x0, x1, 14.6, 15, 3.9, 0], [x0, xm - 0.9, 8, 8.4, 3, 0], [xm + 0.9, x1, 8, 8.4, 3, 0]);
      half.push([lo(outer), hi(outer), 8, 15, 3.9, 0]);
      // The inner wall, with a door, stops at the upper floor so the footbridge runs straight on.
      half.push([li(inner), hiI(inner), 8, 10.6, 3, 0], [li(inner), hiI(inner), 12.2, 15, 3, 0]);
      // The upper floor over the back half, its parapet open over the stairs.
      const sx0 = s > 0 ? 14.1 : -15.6, sx1 = s > 0 ? 15.6 : -14.1;
      half.push([x0, x1, 11.5, 15, 3, 2.7], s > 0 ? [9.4, 14.1, 11.5, 11.7, 3.9, 3] : [-14.1, -9.4, 11.5, 11.7, 3.9, 3]);
      for (let k = 1; k <= 7; k++) { const b = [sx0, sx1, 8.6 + (k - 1) * 0.414, 8.6 + k * 0.414, k * 3 / 7, 0]; half.push(b); steps.push(b); }
    }
    // The footbridge between the shops' upper floors, its rails and two posts.
    half.push([-9, 9, 12, 14, 3, 2.7], [-9, 9, 12, 12.2, 3.8, 3], [-9, 9, 13.8, 14, 3.8, 3], at(-4, 13, 0.5, 0.5, 2.7), at(4, 13, 0.5, 0.5, 2.7));
    // Market stalls before the bank and a low wall by the tower.
    half.push(at(-4.5, 19, 3, 1, 1.1), at(4.5, 19, 3, 1, 1.1), [-20, -17, 16, 17, 1.4, 0]);
    // The fountain in the square.
    const middle = [[-1.5, 1.5, -1.5, 1.5, 0.8, 0], at(0, 0, 0.6, 0.6, 2.2)];
    const { BLOCKS, steps: stepSet } = turnedMap(half, middle, steps);
    return {
      id: "town", name: "Ooga Town", BLOCKS, steps: stepSet,
      gorillas: [[-12.5, 0.5], [12.5, -0.5], [0, 10], [0, -10]],
      // Hub-style terrain (`mound`, `cave`, `outcrop`) and the grappling hooks' hand-checked hiding spots [x, y, z]:
      // in the cave, on the mound's top, behind the outcrop.
      terrain: [...cave(16.5, 21.5, 17, 21), ...mound(-21.5, -17.5, 10, 15), ...outcrop(2, 4, 9, 10.5)],
      hookSpots: [[19, 0, 19.25], [-19.5, 2, 12.5], [3, 0, 11.4]],
      // The block's stand at the back of the building, under its upper floor, with the board's Ooga out in the yard.
      stands: { blue: { x: 0, z: 32.2 }, red: { x: 0, z: -32.2 } },
      showcase: { blue: { x: 0, z: 25.5 }, red: { x: 0, z: -25.5 } },
      guard: { blue: { x: 0, z: 21.5 }, red: { x: 0, z: -21.5 } },
      traps: [[-12.5, 4], [12.5, -4], [7, 21], [-7, -21], [-19, 8], [19, -8], [0, 6.5], [0, -6.5]],
      crates: both([[-4.6, 22], [4.6, 22], [-3.2, 27.5], [4.5, 27.5]]),
      plug: both([[0, 24.5], [-1.3, 25.8], [1.3, 25.8]]),
      alley: both([[-3, 36], [3, 36], [0, 35.7]]),
      caches: [[12.5, 3, 13.5], [-12.5, 3, 13.5], [12.5, 3, -13.5], [-12.5, 3, -13.5], [0, 3, 32.5], [0, 3, -32.5]],
      tramps: [[-15, 19], [15, -19], [-5, 4], [5, -4]],
      powers: [[-6.5, 17], [6.5, -17], [19, 12], [-19, -12], [0, 4], [0, -4]],
      fire: [-19.5, 0],
      catapults: both([[-6, 29]])
    };
  };
  // Gorilla Jungle: stone forts at the ends as on Fort Chaos, and between them jungle: trees, a two-storey tree fort
  // in each corner of each half (climbed by a cargo net), a rope bridge joining each half's pair across the middle,
  // a giant tree in the centre with a ring platform round its trunk and a net up each side, and angry gorillas.
  const gorillaJungle = () => {
    const half = [], nets = [], decor = [], steps = [];
    // The forts, as Fort Chaos has them, with a crate in the alley behind.
    half.push([-8, 8, 32, 33, 2.4, 0], [-8, -7, 23, 32, 2.4, 0], [7, 8, 23, 32, 2.4, 0], [-8, -2.6, 23, 24, 2.4, 0], [2.6, 8, 23, 24, 2.4, 0], at(0, 34.6, 2, 1.2, 1.1));
    // A tree: a trunk to stand under, solid to its top, and leaves above it (decor, so nothing hides in them), with a
    // ledge at the leaves' top (`leafTop`) to land and stand on.
    const ledges = [];
    const tree = (x, z, top = 6, w = 0.9) => { half.push(at(x, z, w, w, top)); ledges.push(leafTop(x, z, top, 1.6 + w)); decor.push({ kind: "canopy", x, z, y: top, r: 1.6 + w }); };
    // The tree forts: trees at four corners, a floor at 3 m, rails round it with a gap over the net and one where the
    // rope bridge comes in.
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 8.5 : -15.5, x1 = s > 0 ? 15.5 : -8.5, xm = (x0 + x1) / 2, inner = s > 0 ? x0 : x1, outer = s > 0 ? x1 : x0;
      for (const [x, z] of [[x0 + 0.6, 10.1], [x1 - 0.6, 10.1], [x0 + 0.6, 14.9], [x1 - 0.6, 14.9]]) tree(x, z, 6.2, 0.8);
      half.push([x0, x1, 9.5, 15.5, 3, 2.7]);
      half.push([x0, x1, 15.3, 15.5, 3.8, 3]);
      half.push([x0, xm - 0.6, 9.5, 9.7, 3.8, 3], [xm + 0.6, x1, 9.5, 9.7, 3.8, 3]);
      half.push([Math.min(outer, outer - 0.2 * s), Math.max(outer, outer - 0.2 * s), 9.5, 15.5, 3.8, 3]);
      half.push([Math.min(inner, inner + 0.2 * s), Math.max(inner, inner + 0.2 * s), 9.5, 12, 3.8, 3], [Math.min(inner, inner + 0.2 * s), Math.max(inner, inner + 0.2 * s), 13.2, 15.5, 3.8, 3]);
      // The cargo net up its middle-facing side: climb it by pushing into it.
      nets.push({ zone: [xm - 0.6, xm + 0.6, 8.8, 9.5], dx: 0, dz: 1, top: 3 });
    }
    // The rope bridge between the pair, with a rope on each side.
    half.push([-8.5, 8.5, 12, 13.2, 3, 2.85], [-8.5, 8.5, 11.9, 12, 3.7, 3], [-8.5, 8.5, 13.2, 13.3, 3.7, 3]);
    // More trees, bushes for low cover before the gate, and rocks at the side.
    // The two before the sniper tower stand low (3.5 m), their leaves under the scope's line over the field.
    tree(-4.5, 8.5); tree(5, 17); tree(-18, 20, 3.5); tree(14, 4.5, 5.5); tree(-13, 21, 3.5);
    half.push(at(-5, 19.5, 3, 1.2, 1.1), at(5, 19.5, 3, 1.2, 1.1), [-20, -18, 5, 8, 1.6, 0]);
    // The giant tree in the middle and its ring platform, put in once: its rails leave a gap north and south for the nets.
    const middle = [at(0, 0, 1.6, 1.6, 7.5), [-3.5, 3.5, -3.5, 3.5, 3.6, 3.3]];
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? 3.3 : -3.5, z1 = s > 0 ? 3.5 : -3.3;
      middle.push([-3.5, -0.6, z0, z1, 4.4, 3.6], [0.6, 3.5, z0, z1, 4.4, 3.6]);
      middle.push([s > 0 ? 3.3 : -3.5, s > 0 ? 3.5 : -3.3, -3.5, 3.5, 4.4, 3.6]);
    }
    decor.push({ kind: "canopy", x: 0, z: 0, y: 7.5, r: 4.2, middle: true });
    const midNets = [{ zone: [-0.6, 0.6, 3.5, 4.2], dx: 0, dz: -1, top: 3.6 }, { zone: [-0.6, 0.6, -4.2, -3.5], dx: 0, dz: 1, top: 3.6 }];
    const { BLOCKS, steps: stepSet } = turnedMap(half, middle, steps);
    const turnNet = (n) => ({ zone: [-n.zone[1], -n.zone[0], -n.zone[3], -n.zone[2]], dx: -n.dx, dz: -n.dz, top: n.top });
    const allDecor = [];
    for (const d of decor) { allDecor.push(d); if (!d.middle) allDecor.push({ ...d, x: -d.x, z: -d.z }); }
    return {
      id: "jungle", name: "Gorilla Jungle", BLOCKS, steps: stepSet, decor: allDecor,
      // Hub-style terrain (`mound`, `cave`, `outcrop`) and the grappling hooks' hand-checked hiding spots [x, y, z]:
      // in the cave, on the mound's top or up a tree, behind the outcrop.
      terrain: [...cave(16.5, 21.5, 17, 21), ...mound(-21.5, -17.5, 10, 15), ...outcrop(1.5, 3.5, 5, 6.5)],
      hookSpots: [[19, 0, 19.25], [-19.5, 2, 12.5], [5, 7.45, 17]],
      ledges: [...ledges, ...ledges.map(turned), leafTop(0, 0, 7.5, 4.2)],
      nets: [...nets, ...nets.map(turnNet), ...midNets],
      guard: { blue: { x: 0, z: 17.2 }, red: { x: 0, z: -17.2 } },
      traps: [[-12, 4], [12, -4], [12, 19], [-12, -19], [-5, 13], [5, -13], [-15, 6], [15, -6]],
      crates: both([[-4.6, 21], [4.6, 21], [-1.6, 29.6], [1.6, 29.6]]),
      plug: both([[0, 21.4], [-1.3, 22.6], [1.3, 22.6]]),
      alley: both([[-3, 35.6], [3, 35.6], [0, 31.1]]),
      caches: [[-12, 3, 13.5], [12, 3, 13.5], [12, 3, -13.5], [-12, 3, -13.5], [2.4, 3.6, 0]],
      tramps: [[-15, 19], [15, -19], [8, 4], [-8, -4]],
      powers: [[-6, 18], [6, -18], [17, 11], [-17, -11], [0, 7], [0, -7]],
      fire: [-20, 0],
      catapults: both([[-5, 29.5]]),
      // Where the gorillas live: each roams round its home and charges any Ooga that comes close.
      gorillas: [[-6, 5], [6, -5], [10, 6], [-10, -6]],
      puddles: [[-3, 11], [11, 3], [-9, 19], [16, 16], [3, 22]].flatMap(([x, z]) => [[x, z], [-x, -z]])
    };
  };
  // Haunted Hollow: a bigger field (60 x 100 m), a graveyard, and at each end a haunted house up on a raised yard 3 m
  // high, reached by stairs at its front. The block isn't out in the open: it's down in the cellar under the yard, in
  // the back room of a little maze. The cellar has two ways in: the side doors at ground level, through a front
  // passage and a middle one (each wall leaving a gap at the other end), or the stairs down from inside the house,
  // which come out right by the block. `nav` is the cellar's way through, for the bots.
  const hauntedHollow = () => {
    const half = [], steps = [], decor = [];
    const YARD = 3, UNDER = 2.7;
    // The yard over the cellar: a floor with the stairwell's hole in it.
    half.push([-14, 14, 32, 43, YARD, UNDER], [-14, 14, 46.8, 49, YARD, UNDER], [-14, -6, 43, 46.8, YARD, UNDER], [-3, 14, 43, 46.8, YARD, UNDER]);
    // The cellar's outer walls, a side door into its front passage at each side.
    half.push([-14, 14, 32, 32.4, UNDER, 0], [-14, 14, 48.6, 49, UNDER, 0]);
    for (const s of [-1, 1]) {
      const x0 = s > 0 ? 13.6 : -14, x1 = s > 0 ? 14 : -13.6;
      half.push([x0, x1, 32.4, 33, UNDER, 0], [x0, x1, 35.5, 48.6, UNDER, 0]);
    }
    // The maze: the front passage's wall leaves a gap on the right, the middle passage's on the left.
    half.push([-13.6, 8, 38, 38.4, UNDER, 0], [-8, 13.6, 42, 42.4, UNDER, 0]);
    // Junk down there: barrels and boxes to hide behind.
    half.push(at(-3, 35.5, 1, 1, 1.1), at(4, 36.5, 1.2, 0.8, 1.4), at(-9, 41.5, 0.9, 0.9, 1.2), at(5, 39, 1, 1, 1), at(8, 46, 1.4, 1, 1.6), at(-13, 44, 0.8, 0.8, 1.2));
    // Stairs from the field up to the yard, seven steps either side of its middle.
    for (let k = 1; k <= 7; k++) { const b = [-3, 3, 32 - (8 - k) * 0.49, 32 - (7 - k) * 0.49, k * YARD / 7, 0]; half.push(b); steps.push(b); }
    // Stairs from inside the house down to the cellar's back room, along the hole, and a rail round it.
    for (let k = 1; k <= 6; k++) { const b = [-6, -3, 43 + (k - 1) * 0.45, 43 + k * 0.45, YARD - k * YARD / 7, 0]; half.push(b); steps.push(b); }
    half.push([-6.2, -6, 43, 47, YARD + 0.9, YARD], [-3, -2.8, 43, 47, YARD + 0.9, YARD], [-6, -3, 46.8, 47, YARD + 0.9, YARD]);
    // The house on the yard: open to the sky, a front door, a side door to the yard, windows in its sides.
    const H = YARD + 3.2;
    half.push([-8, -1.3, 36, 36.4, H, YARD], [1.3, 8, 36, 36.4, H, YARD], [-8, 8, 46.6, 47, H, YARD]);
    half.push([-8, -7.6, 36.4, 46.6, YARD + 1, YARD], [-8, -7.6, 36.4, 46.6, H, YARD + 2.2]);
    half.push([7.6, 8, 36.4, 40, H, YARD], [7.6, 8, 42, 46.6, H, YARD], [7.6, 8, 40, 42, H, YARD + 2.4]);
    // A rail round the yard's edge, open over the front stairs.
    half.push([-14, -3, 32, 32.2, YARD + 0.7, YARD], [3, 14, 32, 32.2, YARD + 0.7, YARD], [-14, -13.8, 32, 49, YARD + 0.7, YARD], [13.8, 14, 32, 49, YARD + 0.7, YARD]);
    // Inside the house: a table and an old wardrobe.
    half.push(at(3, 40, 2, 1, YARD + 0.8, YARD), at(6.5, 45.5, 1.6, 0.8, YARD + 2.2, YARD));
    // The graveyard: rows of headstones for cover, an iron fence, dead trees, and a crypt at each side.
    for (const [x, z] of [[-9, 12], [-6, 12], [-3, 12], [3, 14], [6, 14], [9, 14], [-12, 18], [-9, 18], [12, 20], [15, 20], [-16, 7], [16, 9]]) half.push(at(x, z, 1, 0.35, 1.1));
    half.push([-20, -12, 25, 25.3, 1.3, 0], [12, 20, 25, 25.3, 1.3, 0]);
    // The tall iron gate before the house, a lone panel (`hauntModels.IRON_FENCE`'s width): solid, the way round either end.
    half.push([-2.3, 2.3, 24.4, 24.6, 3.9, 0]);
    const deadTree = (x, z, top = 5.5) => { half.push(at(x, z, 0.7, 0.7, top)); decor.push({ kind: "deadtree", x, z, y: top, r: 1.8 }); };
    deadTree(-20, 14); deadTree(20, 16, 6); deadTree(-7, 22, 5); deadTree(23, 30, 6.5); deadTree(-24, 34, 6);
    half.push([-25, -19, 4, 8, 2.6, 0]);
    // The mausoleum in the middle, put in once: a stone tomb to climb and fight over, steps at each end.
    const middle = [[-3, 3, -2, 2, 2.6, 0]];
    for (const s of [-1, 1]) for (let k = 1; k <= 5; k++) middle.push([-1.2, 1.2, s > 0 ? 2 + (5 - k) * 0.45 : -2 - (6 - k) * 0.45, s > 0 ? 2 + (6 - k) * 0.45 : -2 - (5 - k) * 0.45, k * 2.6 / 6, 0]);
    const tower = [-27, -24, 36, 39], gap = [37.4, 38.6];
    const { BLOCKS, steps: stepSet } = turnedMap(half, middle, steps, tower, gap);
    const allDecor = [];
    for (const d of decor) allDecor.push(d, { ...d, x: -d.x, z: -d.z });
    const two = (list) => [...list, ...flip(list)];
    // The cellar's way through, blue's (red's turned): each side door outside and in, the gap at each passage's
    // end, and the back room.
    const navHalf = [[-15.4, 34.2], [-12.6, 34.2], [15.4, 34.2], [12.6, 34.2], [11, 36.4], [11, 40.2], [-11, 40.2], [-11, 44], [-10.5, 46], [-4.5, 46.4], [-16.5, 31], [16.5, 31], [-16.5, 49.6], [16.5, 49.6],
      // Across the graveyard to the other half.
      [10, 0], [22, 0], [-10.5, 22], [10.5, 22], [0, 17], [-17, 12],
      // The way up through the house: the foot of the cellar stairs, their top on the house floor, inside the front door,
      // the yard before it, and the foot of the front stairs (indices 20 to 24, joined by `links`).
      // The middle three are up on the yard: a node's third number is its floor, 0 if left out.
      [-4.5, 46.6], [-4.5, 42.3, YARD], [0, 37.6, YARD], [0, 34.2, YARD], [0, 27.8],
      // The scoring ring behind the house.
      [0, 51.5]];
    // Node pairs joined though a straight line between them crosses a step (the stairs are walked, not seen through).
    const linkHalf = [[20, 21], [21, 22], [22, 23], [23, 24], [8, 20]];
    return {
      id: "haunted", name: "Haunted Hollow", BLOCKS, steps: stepSet, decor: allDecor,
      // Open graves: pits too deep for one jump (`GRAVE_Y`), a double jump, the jetpack or the hook out, footprints on blue's side, turned for red.
      graves: [[-19, -17.5, 16.5, 19.5], [24, 25.5, 19, 22], [-22, -20.5, 27, 30]].flatMap((g) => [g, [-g[1], -g[0], -g[3], -g[2]]]),
      gorillas: [[-14, 2], [14, -2], [8, 22], [-8, -22]],
      // Hub-style terrain (`mound`, `cave`, `outcrop`) and the grappling hooks' hand-checked hiding spots [x, y, z]:
      // in the cave, on the mound's top, behind the outcrop.
      terrain: [...cave(23, 28, 8, 13), ...mound(-29, -25, 12, 18), ...outcrop(3, 5, 5, 6.5)],
      hookSpots: [[25.5, 0, 10.5], [-27, 2, 15], [4, 0, 7.4]],
      // The rivals' block isn't marked on the mini-map until it's out of its cellar: it has to be found.
      hidden: true,
      W: 30, L: 50, tower, gap, spawnZ: 26.6,
      // The block's stand, in the cellar's back room.
      stands: { blue: { x: -10.5, z: 46 }, red: { x: 10.5, z: -46 } },
      // Where a stolen block is mined: out behind your own house, at the back of the map, a run round the building.
      goals: { blue: { x: 0, z: 52.5 }, red: { x: 0, z: -52.5 } },
      // Where the visitor's Ooga stands on show on the board: before its house's stairs.
      showcase: { blue: { x: 4, z: 24 }, red: { x: -4, z: -24 } },
      // A catapult drops its Ooga into the other house, right over its stairs down.
      drops: { blue: [4.5, -44], red: [-4.5, 44] },
      zipEnd: [-4, 3.1, -29],
      // Each house's cellar, and where an Ooga up on its yard drops in: the top of the stairs inside the house.
      cellars: [{ box: [-14, 14, 32, 49], entry: [-4.5, 43.4] }, { box: [-14, 14, -49, -32], entry: [4.5, -43.4] }],
      nav: { blue: navHalf, red: navHalf.map(([x, z, y]) => y ? [-x, -z, y] : [-x, -z]), links: [...linkHalf, ...linkHalf.map(([i, j]) => [i + navHalf.length, j + navHalf.length])] },
      guard: { blue: { x: 0, z: 29 }, red: { x: 0, z: -29 } },
      traps: two([[0, 35.4], [10, 40.2], [-12, 15], [16, 2], [-6, 26], [-1, 44]]),
      crates: both([[-6, 23], [6, 23], [-9, 29], [9, 29]]),
      plug: both([[-6, 27], [6, 27], [-3.5, 22]]),
      alley: both([[-17.5, 29.5], [17.5, 29.5]]),
      caches: [[10, YARD, 38], [-10, YARD, -38], [0, 0, 40.2], [0, 0, -40.2], [0, 2.6, 0]],
      tramps: two([[-17, 22], [10, 6]]),
      powers: two([[-12, 34.2], [5, 44.5], [18, 12], [0, 9]]),
      fire: [-24, 0],
      catapults: both([[-9, 27]]),
      // The ghosts' haunts [x, z, reach]: one in each cellar, and two in each half of the graveyard.
      ghosts: two([[0, 40, 6], [-12, 14, 7], [12, 18, 6]])
    };
  };
  const ARENAS = { fort: fortChaos(), town: oogaTown(), jungle: gorillaJungle(), haunted: hauntedHollow() };
  // What every map shares: its size, the stands, the towers with their ladders and ziplines.
  // The banana peels the potato Oogas drop round their fire, offsets from it toward the field.
  const PEELS = [[3, 1.5], [2.2, -2.6], [0.6, 3.2], [0.8, -3.3]];
  for (const A of Object.values(ARENAS)) {
    // A map may be bigger (`W`, `L`, half its width and length) and put its stands, towers, landing spots and starts
    // elsewhere; the rest share Fort Chaos's.
    A.W = A.W || W; A.L = A.L || L;
    // The field keeps those half sizes (`fieldW`, `fieldL`); the island is an oval round it, `W` and `L` its half sizes,
    // reaching well past the field on every side.
    A.fieldW = A.W; A.fieldL = A.L;
    A.W = A.fieldW + 12; A.L = A.fieldL + 20;
    A.peels = PEELS.map(([dx, dz]) => [A.fire[0] + dx, A.fire[1] + dz]);
    // Where a catapult flings its Ooga: over the middle of the other end, a little in front of its stand.
    A.drops = A.drops || { blue: [0, -25], red: [0, 25] };
    A.stands = A.stands || { blue: { x: 0, z: 28 }, red: { x: 0, z: -28 } };
    A.spawnZ = A.spawnZ || 26;
    // Each tower's footprint [x0, x1, z0, z1] and the ladder up its inward side: a zone [x0, x1, z0, z1] to climb in,
    // and the way into the tower (dx, dz) a climber pushes toward.
    const tw = A.tower || TOWER, gp = A.gap || GAP;
    A.towers = { blue: tw, red: turned([...tw, 0, 0]).slice(0, 4) };
    A.ladders = { blue: { zone: [tw[1], tw[1] + 0.8, gp[0], gp[1]], dx: -1, dz: 0, top: TOP }, red: { zone: [-tw[1] - 0.8, -tw[1], -gp[1], -gp[0]], dx: 1, dz: 0, top: TOP } };
    // Everything climbable: the towers' ladders and the map's own nets.
    A.climbs = [A.ladders.blue, A.ladders.red, ...(A.nets || [])];
    A.gorillas = A.gorillas || [];
    // The terrain's boxes join the map's blocks (both halves), remembered as the island's own rock (`rocks`, by kind
    // in `rockKind`) so the models mesh them into the island rather than drawing them as buildings.
    const ring = ringTerrain(A.fieldW, A.fieldL);
    A.terrain = [...(A.terrain || []), ...ring.terrain];
    A.hookSpots = [...(A.hookSpots || []), ...ring.spots];
    A.rocks = new Set(); A.rockKind = new Map();
    for (const [kind, b] of A.terrain || []) for (const r of [b, turned(b)]) { A.BLOCKS.push(r); A.rocks.add(r); A.rockKind.set(r, kind); }
    // The two wallet vending machines, one in each half, solid.
    A.vends = A.vends || [[-9, 5], [9, -5]];
    for (const [x, z] of A.vends) A.BLOCKS.push([x - 0.45, x + 0.45, z - 0.62, z + 0.62, 2.1, 0]);
    A.decor = A.decor || [];
    // A team's zipline: from its tower's gap (where the hands hang, `ZIP_HANG` over the feet) down into the other end.
    const zb = A.zipEnd || [-3.5, 3.1, -28.5], za = [tw[1] - 0.6, (gp[0] + gp[1]) / 2];
    A.zips = {
      blue: { ax: za[0], ay: TOP + CONFIG.ZIP_HANG, az: za[1], bx: zb[0], by: zb[1], bz: zb[2] },
      red: { ax: -za[0], ay: TOP + CONFIG.ZIP_HANG, az: -za[1], bx: -zb[0], by: zb[1], bz: -zb[2] }
    };
    for (const t of TEAMS) { const z = A.zips[t]; z.len = Math.hypot(z.bx - z.ax, z.by - z.ay, z.bz - z.az); }
  }
  // The map being stepped: every world query below reads it (`use` sets it from the sim, as it does the crates).
  let ARENA = ARENAS.fort, BLOCKS = ARENA.BLOCKS, LEDGES = ARENA.ledges || [];
  const MAPS = Object.keys(ARENAS);
  // The power-ups: lightning boots (a burst of speed), the halving (your side's splats last half as long), cold
  // storage (your block can't be lifted off its stand) and laser eyes (one long beam from the eyes, `BEAM_S`).
  // The monkeys (the ghost hunt's drop): one at each hip, firing with every shot you take.
  const POWERS = ["boots", "halving", "cold", "laser", "monkeys"];
  const other = (team) => team === "blue" ? "red" : "blue";
  // The bots' skill: easy bots aim wider, wait longer before throwing, throw less often, run slower and see less far;
  // hard ones the other way. "normal" is the CONFIG values.
  const SKILLS = {
    easy: { spread: 0.36, aim: 1.1, cool: 2.1, speed: 4.8, range: 10, gorilla: { sight: 6, charge: 6.5, reach: 1.05, drag: 6, rest: 9, need: 6, drain: 0.8, mash: 3.5, dodge: 0 } },
    normal: { spread: CONFIG.BOT_SPREAD, aim: CONFIG.BOT_AIM, cool: CONFIG.BOT_COOLDOWN, speed: CONFIG.BOT_SPEED, range: CONFIG.BOT_RANGE, gorilla: { sight: CONFIG.GORILLA_SIGHT, charge: CONFIG.GORILLA_CHARGE, reach: CONFIG.GORILLA_GRAB_R, drag: CONFIG.GORILLA_DRAG, rest: CONFIG.GORILLA_REST, need: CONFIG.GRAB_NEED, drain: CONFIG.GRAB_DRAIN, mash: CONFIG.GRAB_MASH, dodge: 0.15 } },
    hard: { spread: 0.1, aim: 0.35, cool: 0.95, speed: 6, range: 15, gorilla: { sight: 10, charge: 9.5, reach: 1.35, drag: 8.5, rest: 4, need: 15, drain: 2, mash: 6.5, dodge: 0.35 } },
    // Expert bots play the whole game: they ride the catapult and the ziplines, climb ladders and nets, hop walls on the
    // jetpack, stack crates at the gate and throw them, and spray the AK in bursts (`akCool` between rounds).
    expert: { spread: 0.06, aim: 0.22, cool: 0.7, speed: 6.4, range: 18, akCool: 0.16, expert: true, gorilla: { sight: 12, charge: 11, reach: 1.5, drag: 9.5, rest: 2.5, need: 22, drain: 2.4, mash: 9, dodge: 0.55 } }
  };
  // Where the k-th of `size` Oogas a side starts, across the inside of its fort (red's turned half round).
  const startAt = (team, k, size) => {
    const x = (k - (size - 1) / 2) * 2.4, z = ARENA.spawnZ - (k % 2) * 1.2;
    return team === "blue" ? [x, z] : [-x, -z];
  };
  const mulberry32 = (seed) => () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // The crates of the sim being stepped; the world queries below see them as boxes alongside the fixed blocks.
  let CRATES = [];
  const CB = [0, 0, 0, 0, 0, 0];
  // Point the world queries at sim's map and crates.
  const use = (sim) => {
    CRATES = sim.crates;
    if (ARENA.id !== sim.map) { ARENA = ARENAS[sim.map]; BLOCKS = ARENA.BLOCKS; LEDGES = ARENA.ledges || []; }
  };
  // The island is an oval, `W` by `L` its half sizes. `edgeDist` is how far (x, z) is inside its rim, about, and writes
  // the unit way out into EDGE; `isleDepth` is the rock under a spot, deepening toward the middle.
  const EDGE = { x: 0, z: 1 };
  // In an open grave's footprint (Haunted Hollow's): the only ground below the top.
  const GRAVE_Y = -2;
  const inGrave = (x, z) => {
    const list = ARENA.graves;
    if (!list) return false;
    for (let i = 0; i < list.length; i++) { const g = list[i]; if (x > g[0] && x < g[1] && z > g[2] && z < g[3]) return true; }
    return false;
  };
  const inGraveOf = (x, z, A) => { const list = A.graves; if (list) for (let i = 0; i < list.length; i++) { const g = list[i]; if (x > g[0] && x < g[1] && z > g[2] && z < g[3]) return true; } return false; };
  const onIsland = (x, z, A = ARENA) => (x * x) / (A.W * A.W) + (z * z) / (A.L * A.L) < 1;
  const isleIn = (x, z, m) => (x * x) / ((ARENA.W - m) * (ARENA.W - m)) + (z * z) / ((ARENA.L - m) * (ARENA.L - m)) < 1;
  const edgeDist = (x, z, A = ARENA) => {
    const n = Math.sqrt((x * x) / (A.W * A.W) + (z * z) / (A.L * A.L));
    if (n < 1e-6) { EDGE.x = 1; EDGE.z = 0; return A.W; }
    const gx = x / (A.W * A.W * n), gz = z / (A.L * A.L * n), g = Math.hypot(gx, gz);
    EDGE.x = gx / g; EDGE.z = gz / g;
    return (1 - n) / g;
  };
  const isleDepth = (x, z, A = ARENA) => Math.min(CONFIG.ISLE_DEPTH, CONFIG.ISLE_EDGE + 0.9 * Math.max(0, edgeDist(x, z, A)));
  // Bring p (anything with x and z) inside the oval by margin m, along the line to the middle.
  const clampIn = (p, m) => {
    const n = Math.sqrt((p.x * p.x) / ((ARENA.W - m) * (ARENA.W - m)) + (p.z * p.z) / ((ARENA.L - m) * (ARENA.L - m)));
    if (n >= 1) { p.x /= n * 1.0001; p.z /= n * 1.0001; }
  };
  // Where a loose block may come to rest: open ground the bots can walk to. A flood at ground level from the side's
  // start, through the map's fixed blocks (`resolve`, a body's own collision), worked out once a map, on the same
  // half-metre grid as the terrain. `restSpot` writes the nearest such spot to (x, z) into REST.
  const REST_CELL = 0.5, REST = { x: 0, z: 0 }, REST_BODY = { x: 0, y: 0, z: 0, crouch: false }, restCache = {};
  // Graves are widened by a body's radius in `clearLine`, so a block resting nearer than that could never be walked to;
  // half a cell more because `restSpot` keeps the exact point of any cell it accepts.
  const GRAVE_REST_M = CONFIG.BODY_R + REST_CELL * 0.5 + 0.01;
  const nearGrave = (x, z) => {
    const list = ARENA.graves;
    if (list) for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (x > g[0] - GRAVE_REST_M && x < g[1] + GRAVE_REST_M && z > g[2] - GRAVE_REST_M && z < g[3] + GRAVE_REST_M) return true;
    }
    return false;
  };
  const restFor = () => {
    let G = restCache[ARENA.id];
    if (G) return G;
    const nx = Math.round(2 * ARENA.W / REST_CELL) + 1, nz = Math.round(2 * ARENA.L / REST_CELL) + 1, walk = new Uint8Array(nx * nz), keep = CRATES;
    CRATES = [];
    const clear = (i, j) => {
      const x = i * REST_CELL - ARENA.W, z = j * REST_CELL - ARENA.L;
      if (!isleIn(x, z, 1) || nearGrave(x, z)) return false;
      REST_BODY.x = x; REST_BODY.y = 0; REST_BODY.z = z;
      resolve(REST_BODY, CONFIG.BODY_R * 0.95, 0.05);
      return REST_BODY.x === x && REST_BODY.z === z;
    };
    const si = Math.round((0.25 + ARENA.W) / REST_CELL), sj = Math.round((ARENA.spawnZ + 0.25 + ARENA.L) / REST_CELL), stack = [si * nz + sj];
    walk[si * nz + sj] = 1;
    while (stack.length) {
      const k = stack.pop(), i = Math.floor(k / nz), j = k % nz;
      for (let d = 0; d < 4; d++) {
        const ni = i + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz || walk[ni * nz + nj] || !clear(ni, nj)) continue;
        walk[ni * nz + nj] = 1;
        stack.push(ni * nz + nj);
      }
    }
    CRATES = keep;
    G = restCache[ARENA.id] = { walk, nx, nz };
    return G;
  };
  const restSpot = (x, z) => {
    const G = restFor(), { walk, nx, nz } = G;
    const i0 = Math.max(0, Math.min(nx - 1, Math.round((x + ARENA.W) / REST_CELL))), j0 = Math.max(0, Math.min(nz - 1, Math.round((z + ARENA.L) / REST_CELL)));
    if (walk[i0 * nz + j0]) { REST.x = x; REST.z = z; return REST; }
    for (let r = 1, top = Math.max(nx, nz); r < top; r++) {
      let best = -1, bd = Infinity;
      for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
        if ((i !== i0 - r && i !== i0 + r && j !== j0 - r && j !== j0 + r) || i < 0 || j < 0 || i >= nx || j >= nz || !walk[i * nz + j]) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2;
        if (d < bd) { bd = d; best = i * nz + j; }
      }
      if (best >= 0) { REST.x = Math.floor(best / nz) * REST_CELL - ARENA.W; REST.z = (best % nz) * REST_CELL - ARENA.L; return REST; }
    }
    throw new Error(`${ARENA.id}: no walkable ground for a loose block`);
  };
  const crateBox = (c) => { CB[0] = c.x - CONFIG.CRATE_HALF; CB[1] = c.x + CONFIG.CRATE_HALF; CB[2] = c.z - CONFIG.CRATE_HALF; CB[3] = c.z + CONFIG.CRATE_HALF; CB[4] = c.y + CONFIG.CRATE_H; CB[5] = c.y; return CB; };
  const boxCount = () => BLOCKS.length + CRATES.length;
  // The i-th box: a fixed block, then the live crates (a dead crate is an empty box nothing touches).
  const boxAt = (i) => {
    if (i < BLOCKS.length) return BLOCKS[i];
    const c = CRATES[i - BLOCKS.length];
    if (!c.live) { CB[0] = CB[1] = CB[2] = CB[3] = 1e9; CB[4] = CB[5] = 0; return CB; }
    return crateBox(c);
  };
  // A crouching Ooga is shorter: low cover hides it and a ball thrown at chest height sails over.
  const heightOf = (a) => a.crouch ? CONFIG.CROUCH_H : CONFIG.HEIGHT;
  // Push a body of radius r out of every box it overlaps in height, and the arena's edge, sliding along what it hits.
  // A body standing on a box's top, or passing under a floating one, is clear of it.
  // `step` is how far below its top a body's feet may be and still walk onto a box (a stair).
  const resolve = (p, r, step = 0.05) => {
    const feet = p.y || 0, head = feet + heightOf(p);
    // Down in an open grave its earth walls hold a body in until its feet are up over the rim.
    if (feet < 0 && ARENA.graves) for (let i = 0; i < ARENA.graves.length; i++) {
      const g = ARENA.graves[i];
      if (p.x < g[0] - 0.5 || p.x > g[1] + 0.5 || p.z < g[2] - 0.5 || p.z > g[3] + 0.5) continue;
      p.x = Math.max(g[0] + 0.05, Math.min(g[1] - 0.05, p.x)); p.z = Math.max(g[2] + 0.05, Math.min(g[3] - 0.05, p.z));
    }
    for (let i = 0, n = boxCount(); i < n; i++) {
      const b = boxAt(i);
      if (feet >= b[4] - step || head <= b[5]) continue;
      const cx = p.x < b[0] ? b[0] : p.x > b[1] ? b[1] : p.x, cz = p.z < b[2] ? b[2] : p.z > b[3] ? b[3] : p.z;
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2), k = (r - d) / d;
        p.x += dx * k;
        p.z += dz * k;
      } else {
        // Inside the box: out by the nearest face.
        const l = p.x - b[0], rt = b[1] - p.x, nn = p.z - b[2], f = b[3] - p.z, m = Math.min(l, rt, nn, f);
        if (m === l) p.x = b[0] - r; else if (m === rt) p.x = b[1] + r; else if (m === nn) p.z = b[2] - r; else p.z = b[3] + r;
      }
    }
    // The island's edge is open; a body that has gone over it and is down under the top is kept out of the rock, out
    // past the nearest edge, until it climbs back over.
    if (feet < -CONFIG.RIM && head > -isleDepth(p.x, p.z) && onIsland(p.x, p.z) && !inGrave(p.x, p.z)) {
      const n = Math.sqrt((p.x * p.x) / (ARENA.W * ARENA.W) + (p.z * p.z) / (ARENA.L * ARENA.L)), k = n > 1e-6 ? (1 + r / Math.min(ARENA.W, ARENA.L)) / n : 1;
      p.x *= k; p.z *= k;
    }
  };
  // The highest top under a body of radius r that its feet at y are on or above: where it stands.
  // Over the open edge there is nothing (-Infinity), and nor is there for feet already down under the island's top.
  const groundAt = (x, z, y, r = CONFIG.BODY_R * 0.7) => {
    let g = onIsland(x, z) && (y >= -CONFIG.RIM || inGrave(x, z)) ? (inGrave(x, z) ? GRAVE_Y : 0) : -Infinity;
    for (let i = 0, n = boxCount(); i < n; i++) {
      const b = boxAt(i);
      if (b[4] > y + 0.05 || b[4] <= g || x < b[0] - r || x > b[1] + r || z < b[2] - r || z > b[3] + r) continue;
      g = b[4];
    }
    // Ledges hold only what is already at or over their top.
    for (let i = 0; i < LEDGES.length; i++) {
      const b = LEDGES[i];
      if (b[4] > y + 0.05 || b[4] <= g || x < b[0] - r || x > b[1] + r || z < b[2] - r || z > b[3] + r) continue;
      g = b[4];
    }
    return g;
  };
  // The lowest bottom of a floating block over a body, above its feet: what its head would hit.
  const ceilingAt = (x, z, y, r = CONFIG.BODY_R * 0.7) => {
    let c = Infinity;
    for (let i = 0; i < BLOCKS.length; i++) {
      const b = BLOCKS[i];
      if (b[5] <= y + 0.05 || b[5] >= c || x < b[0] - r || x > b[1] + r || z < b[2] - r || z > b[3] + r) continue;
      c = b[5];
    }
    return c;
  };
  // True when a point at height y is inside a box or the island's rock; past the open edge is open air.
  const solidAt = (x, y, z) => {
    if (y <= 0) return y > -isleDepth(x, z) && onIsland(x, z) && !(inGrave(x, z) && y > GRAVE_Y);
    for (let i = 0, n = boxCount(); i < n; i++) {
      const b = boxAt(i);
      if (x > b[0] && x < b[1] && z > b[2] && z < b[3] && y < b[4] && y > b[5]) return true;
    }
    return false;
  };
  // True when the segment from (ax, az) to (bx, bz) crosses the rectangle [x0, x1] by [z0, z1].
  const crossesRect = (ax, az, bx, bz, x0, x1, z0, z1) => {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    if (Math.abs(dx) < 1e-9) { if (ax <= x0 || ax >= x1) return false; } else {
      let a = (x0 - ax) / dx, c = (x1 - ax) / dx;
      if (a > c) { const s = a; a = c; c = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 >= t1) return false;
    }
    if (Math.abs(dz) < 1e-9) { if (az <= z0 || az >= z1) return false; } else {
      let a = (z0 - az) / dz, c = (z1 - az) / dz;
      if (a > c) { const s = a; a = c; c = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 >= t1) return false;
    }
    return true;
  };
  // True when the straight line from (ax, az) to (bx, bz) misses every box, widened by r, that stands on the ground.
  // `over` skips boxes lower than it: a throw at chest height clears crates and low walls, and any open grave.
  const clearLine = (ax, az, bx, bz, r, over = 0) => {
    // Open graves count as in the way of a walk, so bots go round them.
    if (!over && ARENA.graves) for (let i = 0; i < ARENA.graves.length; i++) {
      const g = ARENA.graves[i];
      if (crossesRect(ax, az, bx, bz, g[0] - r, g[1] + r, g[2] - r, g[3] + r)) return false;
    }
    for (let i = 0, n = boxCount(); i < n; i++) {
      const b = boxAt(i);
      if (b[5] > 1.4 || b[4] < over) continue;
      if (crossesRect(ax, az, bx, bz, b[0] - r, b[1] + r, b[2] - r, b[3] + r)) return false;
    }
    return true;
  };

  // A round. `team` is the player's colour; `seed` seeds the bots and the weather; `prep` the fortifying seconds.
  // `names` names the four Oogas: the player first, then their teammate, then the two rivals (only carried for the
  // scene).
  // `size` Oogas a side (1 to `MAX_SIDE`): the player first, then their teammates, then the rivals. `skill` picks the
  // bots' `SKILLS`.
  const create = ({ team = "blue", seed = 1, names = [], prep = CONFIG.PREP_S, target = CONFIG.CAPTURES, size = 2, skill = "normal", map = "fort" } = {}) => {
    map = ARENAS[map] ? map : "fort";
    const A = ARENAS[map];
    const rival = other(team);
    size = Math.max(1, Math.min(CONFIG.MAX_SIDE, size | 0));
    const actors = Array.from({ length: size * 2 }, (_, i) => ({
      id: i, slot: i % size, name: names[i] || null, team: i < size ? team : rival, bot: i > 0, role: i % size % 2 ? "defend" : "attack",
      x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, heading: 0, moving: 0, carrying: null, splat: 0, guard: 0, cooldown: 0,
      blocked: null, stuck: 0, lastX: 0, lastZ: 0, detour: 0, aim: 0, trapped: 0, think: 0, grounded: true, jumps: 0, crouch: false,
      waiting: false, stamina: 4, tired: false, sprinting: false, rest: 0, botJump: false, jump2At: 0, tries: 0, progT: 0, lastD: 0, netted: 0, grenade: 0, rocket: 0, net: 0, sniper: 0, crates: 0, holding: false, bonked: false,
      climbing: false, riding: false, zipT: 0, flight: 0, zipLine: "blue", lastKind: "paint", grabbed: 0, grabFill: 0, flung: false, fuel: 2.6, jetting: false, boots: 0, laser: 0, burnt: 0, slip: 0, gold: false, akMag: 30, akReload: 0, monkeys: 0, monkeyCool: 0,
      wallet: -1, knock: 0, soot: 0, spooked: 0, beam: 0, beamLen: 0, ride: 0, rider: 0, calling: 0, vendGo: 0, vendI: 0, navI: -1, navT: 0, route: "", routeT: 0, botClimb: false, botStop: false, botStraight: false, crateGo: 0, crateX: 0, crateZ: 0, routeBan: 0, jetT: 0, hopT: 0, crateT: 0, stacks: 0,
      detourX: 0, detourZ: 0, painted: 0, captures: 0, splats: 0, hits: 0, longShot: 0, rescues: 0, edgeX: 0, edgeY: 0, edgeZ: 0, falls: 0,
      boltCool: 0, hook: 0, hk: 0, hookT: 0, hookLen: 0, hCool: 0, hookTarget: -1, hookTip: { x: 0, y: 0, z: 0 }, hookEnd: { x: 0, y: 0, z: 0 }, hookHold: false, flingT: 0
    }));
    const flags = {};
    for (const t of TEAMS) flags[t] = { team: t, state: "home", x: ARENA.stands[t].x, y: 0, z: ARENA.stands[t].z, carrier: null, vx: 0, vy: 0, vz: 0, thrower: -1, t: 0, homeT: 0, hookedBy: -1, graceT: 0 };
    const shots = Array.from({ length: CONFIG.MAX_SHOTS }, () => ({ live: false, kind: "paint", team: null, owner: -1, ox: 0, oz: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, target: -1 }));
    const crates = Array.from({ length: CONFIG.MAX_CRATES }, () => ({ live: false, team: null, x: 0, y: 0, z: 0 }));
    const traps = A.traps.map(([x, z]) => ({ x, z, dark: 0 }));
    const caches = A.caches.map(([x, y, z]) => ({ x, y, z, dark: 0 }));
    const powers = A.powers.map(([x, z]) => ({ x, z, kind: 0, dark: 0 }));
    const peels = A.peels.map(([x, z]) => ({ x, z, dark: 0 }));
    const gorillas = A.gorillas.map(([x, z]) => ({ hx: x, hz: z, x, y: 0, z, vx: 0, vz: 0, heading: 0, state: 0, t: 0, holding: -1, held: 0, wx: x, wz: z, hookCool: 0, ex: 0, ez: 0, stall: 0, throwT: 0 }));
    // The ghosts: `state` 0 drifting, 1 chasing, 2 gone (faded or popped) till `t` runs out; each keeps to its haunt.
    const ghosts = (A.ghosts || []).map(([x, z, r]) => ({ hx: x, hz: z, leash: r, x, y: 1, z, heading: 0, state: 0, t: 0, wx: x, wz: z, phase: x * 0.7 + z }));
    // The wallets: `state` 0 is held over its Ooga's head (no fuse yet), 1 thrown, 2 lying on the ground, 3 stuck to
    // the rival it hit (`stuck`, its back); the machines' cool-downs.
    const wallets = Array.from({ length: CONFIG.WALLET_CAP }, () => ({ live: false, state: 0, owner: -1, team: null, look: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, spin: 0, stuck: -1 }));
    const vends = A.vends.map(([x, z]) => ({ x, z, dark: 0 }));
    const hooks = Array.from({ length: CONFIG.HOOKS }, () => ({ state: 0, x: 0, y: 0, z: 0, holder: -1 }));
    const events = Array.from({ length: CONFIG.MAX_EVENTS }, () => ({ type: "", team: null, actor: -1, by: -1, x: 0, y: 0, z: 0 }));
    const weather = { kind: "clear", left: 0, strength: 0, boltT: 0, boltWarn: 0, boltX: 0, boltZ: 0 };
    const puddles = (A.puddles || []).map(([x, z]) => ({ x, z, dark: 0 }));
    const sim = { goldLeft: CONFIG.GOLD_GUNS, map, live: null, team, rival, seed, target, size, skill, bots: SKILLS[skill] || SKILLS.normal, prepS: prep, prep: 0, rng: mulberry32(seed), actors, flags, shots, crates, traps, caches, powers, peels, puddles, gorillas, ghosts, wallets, vends, hooks, halving: { blue: 0, red: 0 }, cold: { blue: 0, red: 0 }, events, weather, eventCount: 0, score: { blue: 0, red: 0 }, time: 0, flip: false, over: false, winner: null, acc: 0 };
    reset(sim);
    return sim;
  };
  // `by` is who caused it, when that is someone else (the thrower whose shot splatted `actor`).
  const emit = (sim, type, team, actor, x, y, z, by = -1) => {
    if (sim.eventCount >= sim.events.length) return;
    const e = sim.events[sim.eventCount++];
    e.type = type; e.team = team; e.actor = actor; e.by = by; e.x = x; e.y = y; e.z = z;
  };
  // A stand or a cache tops up the throwables and the crate stock.
  const refill = (a) => {
    let more = false;
    for (const k of KINDS) if (TOOLS[k].max && a[k] < TOOLS[k].max) { a[k] = TOOLS[k].max; more = true; }
    if (a.crates < CONFIG.CRATE_STOCK) { a.crates = CONFIG.CRATE_STOCK; more = true; }
    return more;
  };
  // True when a crate fits at (x, y, z): inside the arena, off the stands, overlapping no box at that height.
  const freeSpot = (sim, x, z, y = 0) => {
    const h = CONFIG.CRATE_HALF, top = y + CONFIG.CRATE_H;
    if (!isleIn(x, z, h)) return false;
    for (const t of TEAMS) { const s = ARENA.stands[t]; if (Math.hypot(x - s.x, z - s.z) < CONFIG.STAND_CLEAR) return false; }
    for (let i = 0, n = boxCount(); i < n; i++) {
      const b = boxAt(i);
      if (b[5] >= top - 0.01 || b[4] <= y + 0.01) continue;
      if (x + h > b[0] && x - h < b[1] && z + h > b[2] && z - h < b[3]) return false;
    }
    return true;
  };
  const addCrate = (sim, team, x, z, y = 0) => {
    if (!freeSpot(sim, x, z, y)) return null;
    for (const c of sim.crates) if (!c.live) { c.live = true; c.team = team; c.x = x; c.y = y; c.z = z; return c; }
    return null;
  };
  // The crate sitting on crate c, if any.
  const crateOn = (sim, c) => {
    for (const o of sim.crates) if (o.live && o !== c && Math.abs(o.y - c.y - CONFIG.CRATE_H) < 0.05 && Math.abs(o.x - c.x) < CONFIG.CRATE_HALF * 2 - 0.05 && Math.abs(o.z - c.z) < CONFIG.CRATE_HALF * 2 - 0.05) return o;
    return null;
  };
  const MAX_STACK_Y = CONFIG.CRATE_H * 2 + 0.05;
  // Everyone back to their fort, both flags home, the forts' crates back, the score at nil and the clock at zero.
  const reset = (sim, seed = sim.seed) => {
    sim.seed = seed;
    sim.rng = mulberry32(seed);
    use(sim);
    for (const c of sim.crates) c.live = false;
    for (const t of TEAMS) for (const [x, z] of ARENA.crates[t]) addCrate(sim, t, x, z);
    for (const a of sim.actors) {
      const at = startAt(a.team, a.slot, sim.size);
      a.x = a.lastX = a.edgeX = at[0]; a.z = a.lastZ = a.edgeZ = at[1]; a.y = a.vx = a.vz = a.vy = a.edgeY = 0; a.falls = 0;
      a.heading = a.team === "blue" ? Math.PI : 0;
      a.moving = 0; a.grounded = true; a.jumps = 0; a.crouch = a.botJump = false; a.carrying = a.blocked = null;
      a.splat = a.guard = a.cooldown = a.stuck = a.detour = a.aim = a.trapped = a.think = a.painted = a.jump2At = a.tries = a.netted = a.progT = 0;
      a.lastD = Infinity;
      a.stamina = CONFIG.SPRINT_S; a.tired = a.sprinting = a.waiting = a.holding = a.bonked = false; a.rest = 0;
      a.captures = a.splats = a.hits = a.longShot = a.rescues = 0;
      a.fuel = CONFIG.JET_FUEL; a.jetting = false; a.grabbed = a.grabFill = 0; a.flung = false;
      a.sniper = 0; a.climbing = a.riding = false; a.zipT = 0; a.flight = 0; a.boots = a.laser = a.beam = a.burnt = a.slip = 0; a.gold = false; a.akMag = CONFIG.AK_MAG; a.akReload = 0; a.monkeys = 0;
      a.wallet = -1; a.knock = a.soot = a.vendGo = 0; a.ride = a.rider = a.calling = 0;
      a.hook = a.hk = a.hookT = a.hookLen = a.hCool = a.flingT = 0; a.hookTarget = -1; a.hookHold = false;
      a.route = ""; a.routeT = a.jetT = a.hopT = a.crateT = a.stacks = a.crateGo = a.routeBan = 0; a.botClimb = false;
      refill(a);
      a.crates = CONFIG.CRATE_STOCK;
    }
    // The bots fortify at once: each side's defender plugs its gate, a rival attacker blocks its alley. The visitor
    // builds their own with `build`.
    for (const a of sim.actors) {
      if (!a.bot) continue;
      const spots = a.role === "defend" ? ARENA.plug[a.team] : a.team === sim.rival ? ARENA.alley[a.team] : null;
      if (!spots) continue;
      for (const [x, z] of spots) if (a.crates > 0 && addCrate(sim, a.team, x, z)) a.crates--;
    }
    for (const t of TEAMS) homeFlag(sim.flags[t]);
    for (const s of sim.shots) s.live = false;
    for (const t of sim.traps) t.dark = 0;
    for (const c of sim.caches) c.dark = 0;
    for (const p of sim.peels) p.dark = 0;
    for (const p of sim.puddles) p.dark = 0;
    sim.weather.boltT = CONFIG.BOLT_S[0]; sim.weather.boltWarn = 0;
    for (const a of sim.actors) a.boltCool = 0;
    for (const w of sim.wallets) w.live = false;
    for (const g of sim.ghosts) { g.x = g.wx = g.hx; g.z = g.wz = g.hz; g.state = 0; g.t = 0; }
    for (const v of sim.vends) v.dark = 0;
    if (sim.hooks.length && ARENA.hookSpots.length) {
      // One hook hidden in each half, at the same seeded spot turned half round, so neither side is favoured.
      const k = Math.floor(sim.rng() * ARENA.hookSpots.length);
      for (let i = 0; i < sim.hooks.length; i++) placeHook(sim.hooks[i], ARENA.hookSpots[k], i % 2 === 1);
    }
    for (const g of sim.gorillas) { g.x = g.wx = g.hx; g.z = g.wz = g.hz; g.vx = g.vz = 0; g.state = G_ROAM; g.t = 0; g.holding = -1; g.held = 0; g.hookCool = 0; g.ex = g.ez = g.stall = g.throwT = 0; }
    sim.goldLeft = CONFIG.GOLD_GUNS;
    // Each pair of spots starts with the same power (boots, laser eyes, then the halving or cold storage by the seed);
    // after that each draws from the seed, so a seed replays the round's power-ups too.
    for (let i = 0; i < sim.powers.length; i++) { const p = sim.powers[i]; p.dark = 0; p.kind = [0, 3, seed & 1 ? 2 : 1][(i >> 1) % 3]; }
    for (const t of TEAMS) sim.halving[t] = sim.cold[t] = 0;
    const w = sim.weather;
    w.kind = "clear"; w.left = CONFIG.WEATHER_S[0]; w.strength = 0;
    sim.score.blue = sim.score.red = 0;
    sim.time = sim.acc = 0;
    sim.prep = sim.prepS;
    sim.flip = false;
    sim.eventCount = 0;
    sim.over = false;
    sim.winner = null;
    return sim;
  };
  // A grappling hook lying hidden at a spot [x, y, z] (`turnedSpot` turns it half round, into red's half).
  const placeHook = (h, spot, turnedSpot) => { h.state = 0; h.holder = -1; h.x = turnedSpot ? -spot[0] : spot[0]; h.y = spot[1]; h.z = turnedSpot ? -spot[2] : spot[2]; };
  const homeFlag = (f) => {
    f.state = "home";
    f.x = ARENA.stands[f.team].x;
    f.z = ARENA.stands[f.team].z;
    f.y = 0;
    f.carrier = null;
    f.vx = f.vy = f.vz = 0;
    f.thrower = -1;
    f.homeT = 0;
    f.hookedBy = -1;
    f.graceT = 0;
  };
  // A carrier lets go: the flag lies at their feet and counts down home.
  const dropFlag = (sim, a, why) => {
    const f = a.carrying && sim.flags[a.carrying];
    if (!f) return false;
    // It comes to rest on open ground under or nearest the carrier (`restSpot`), never up on a roof the bots can't reach.
    f.state = "dropped";
    f.carrier = null;
    a.blocked = f.team;
    a.carrying = null;
    if (onIsland(a.x, a.z) && (a.y >= -CONFIG.RIM || inGrave(a.x, a.z))) {
      const at = restSpot(a.x, a.z);
      f.x = at.x; f.y = 0; f.z = at.z;
      emit(sim, why, f.team, a.id, f.x, 0, f.z);
      return true;
    }
    // Over the open edge: it drops at the edge, where its carrier last stood on the island, and goes home soon after.
    const at = restSpot(a.edgeX, a.edgeZ);
    f.x = at.x; f.y = 0; f.z = at.z; f.homeT = CONFIG.EDGE_HOME_S;
    emit(sim, "edgedrop", f.team, a.id, f.x, f.y, f.z);
    return true;
  };
  // The player asks to drop what they carry; false when they carry nothing.
  const drop = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    return !sim.over && a.splat <= 0 && dropFlag(sim, a, "drop");
  };
  // Throw the carried block along `yaw` in a long arc (a pass). Anyone who could pick it up can catch it in the air;
  // its thrower only after `PASS_SAFE`. Where it lands it lies as a dropped block.
  const pass = (sim, id = 0, yaw = sim.actors[id].heading) => {
    use(sim);
    const a = sim.actors[id], f = a.carrying && sim.flags[a.carrying];
    if (sim.over || !f || a.splat > 0 || a.trapped > 0) return false;
    f.state = "flying";
    f.carrier = null;
    f.thrower = id;
    f.t = 0;
    f.x = a.x + Math.sin(yaw) * 0.6; f.z = a.z + Math.cos(yaw) * 0.6; f.y = a.y + 1.6;
    f.vx = Math.sin(yaw) * CONFIG.PASS_SPEED + a.vx * 0.5; f.vz = Math.cos(yaw) * CONFIG.PASS_SPEED + a.vz * 0.5; f.vy = CONFIG.PASS_LIFT;
    a.carrying = null;
    a.heading = yaw;
    emit(sim, "pass", f.team, id, f.x, f.y, f.z);
    return true;
  };
  // A block in flight: gravity; it lands on whatever it falls onto, or drops where it struck a wall.
  const flyFlag = (sim, f, dt) => {
    // On a hook's rope it goes where the rope takes it (`stepHook`).
    if (f.hookedBy >= 0) return;
    f.t += dt;
    f.vy -= CONFIG.PASS_GRAVITY * dt;
    const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt, nz = f.z + f.vz * dt;
    const outside = !isleIn(nx, nz, 0.4);
    if (outside || (ny > 0 && solidAt(nx, ny, nz))) { f.vx = f.vz = 0; f.vy = Math.min(f.vy, 0); }
    else { f.x = nx; f.z = nz; }
    f.y = Math.max(ny, -1);
    const ground = groundAt(f.x, f.z, f.y + 0.3, 0.2);
    // Falling below the surface (only an open grave lets it) always ends the flight, whichever way it went in.
    if (f.y <= ground || (f.y < 0 && f.vy <= 0)) {
      // Wherever it fell (a roof, the centre deck), it comes to rest on the nearest ground the bots can reach.
      const at = restSpot(f.x, f.z);
      f.state = "dropped";
      f.x = at.x; f.y = 0; f.z = at.z;
      if (f.thrower >= 0) sim.actors[f.thrower].blocked = f.team;
      emit(sim, "landed", f.team, f.thrower, f.x, f.y, f.z);
    }
  };
  // Place a crate a step from actor `id` along `yaw` (its heading if not given), on their own half, from their stock.
  const build = (sim, id = 0, yaw = sim.actors[id].heading) => {
    use(sim);
    const a = sim.actors[id];
    if (sim.over || a.splat > 0 || a.trapped > 0 || a.crates <= 0 || !a.grounded) return false;
    const x = a.x + Math.sin(yaw) * 1.4, z = a.z + Math.cos(yaw) * 1.4;
    if ((a.team === "blue" ? z : -z) < 2 || !addCrate(sim, a.team, x, z)) return false;
    a.crates--;
    emit(sim, "build", a.team, id, x, 0, z);
    return true;
  };
  // Pick up the nearest top crate in front of actor `id`, or, holding one, set it down a step ahead along `yaw`: on top
  // of a crate there (up to three high) or on whatever ground is there. Hands carrying a block can't take a crate.
  const grab = (sim, id = 0, yaw = sim.actors[id].heading) => {
    use(sim);
    const a = sim.actors[id];
    if (sim.over || a.splat > 0 || a.trapped > 0 || !a.grounded) return false;
    const fx = a.x + Math.sin(yaw) * 1.3, fz = a.z + Math.cos(yaw) * 1.3;
    if (a.holding) {
      let x = fx, z = fz, y = groundAt(fx, fz, a.y + 1.2, 0);
      for (const c of sim.crates) {
        if (!c.live || Math.hypot(c.x - fx, c.z - fz) > 0.8 || crateOn(sim, c)) continue;
        x = c.x; z = c.z; y = c.y + CONFIG.CRATE_H;
      }
      if (y > MAX_STACK_Y || !addCrate(sim, a.team, x, z, y)) return false;
      a.holding = false;
      emit(sim, "set", a.team, id, x, y, z);
      return true;
    }
    if (a.carrying) return false;
    let best = null, bd = 1.1;
    for (const c of sim.crates) {
      if (!c.live || crateOn(sim, c) || c.y > a.y + 1.6) continue;
      const d = Math.hypot(c.x - fx, c.z - fz);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return false;
    best.live = false;
    a.holding = true;
    emit(sim, "lift", a.team, id, best.x, best.y, best.z);
    return true;
  };
  // A thrown crate comes to rest where it fell, or as near as there's room; with no room it breaks.
  const landCrate = (sim, s) => {
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = s.x + dx * 1.25, z = s.z + dz * 1.25, y = groundAt(x, z, Math.max(0, s.y) + 0.5, 0);
      if (y <= MAX_STACK_Y && addCrate(sim, s.team, x, z, y)) { emit(sim, "set", s.team, s.owner, x, y, z); return; }
    }
    emit(sim, "smash", s.team, s.owner, s.x, Math.max(0, s.y), s.z);
  };
  // Crates with nothing under them fall to whatever is below.
  const settleCrates = (sim, dt) => {
    for (const c of sim.crates) {
      if (!c.live || c.y <= 0) continue;
      c.live = false;
      const below = groundAt(c.x, c.z, c.y, -0.05);
      c.live = true;
      if (below < c.y) c.y = Math.max(below, c.y - 7 * dt);
    }
  };
  // Out of a quiz bubble (a right answer, or the bot's think time up): fresh-paint protection follows, as after a splat.
  // ---- Piggyback ----
  // Actor `id` climbs onto the back of the nearest teammate within `HOP_R`: carried along on their shoulders, free to
  // turn and shoot (or throw a block on), until a jump puts them down. Splats, nets, quiz traps and blasts don't: the
  // rider stays on through them; only what can't be ridden through (a gorilla's grab, a catapult's throw, a zipline,
  // a ladder) does. The one carrying runs a little slower (`MOUNT_SLOW`). A rider may carry a block; the one under it may not
  // climb on someone else.
  const canRide = (a) => a.splat <= 0 && a.trapped <= 0 && !a.grabbed && !a.riding && !a.flight && !a.climbing && !a.holding && a.knock <= 0;
  // Still able to ride on (or carry): only a grab, a throw, a zipline or a ladder ends it.
  const canStay = (a) => !a.grabbed && !a.riding && !a.flight && !a.climbing;
  const hopOn = (sim, id = 0, onto = -1) => {
    use(sim);
    const a = sim.actors[id];
    if (sim.over || a.ride || a.rider || !canRide(a)) return false;
    let best = null, bd = CONFIG.HOP_R * CONFIG.HOP_R;
    for (const m of sim.actors) {
      if (m === a || m.team !== a.team || (onto >= 0 && m.id !== onto) || m.ride || m.rider || !canRide(m) || Math.abs(m.y - a.y) > 0.6) continue;
      const d = (m.x - a.x) ** 2 + (m.z - a.z) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) return false;
    a.ride = best.id + 1; best.rider = a.id + 1; a.calling = 0;
    const at = rideAt(best);
    a.x = at.x; a.z = at.z; a.y = at.y; a.vx = a.vz = a.vy = 0;
    emit(sim, "hopon", a.team, a.id, best.x, best.y + 1.5, best.z, best.id);
    return true;
  };
  // Where a rider sits on `m`'s back: `RIDE_BACK` behind, or nearer its middle where a wall or a post would be in the
  // way (the carrier itself is clear, so straight over its middle always fits). Writes RIDE_AT.
  const RIDE_AT = { x: 0, y: 0, z: 0, crouch: false };
  const RIDE_PROBE = { x: 0, y: 0, z: 0, crouch: false };
  const rideAt = (m) => {
    const sh = Math.sin(m.heading), ch = Math.cos(m.heading), y = m.y + CONFIG.RIDE_UP;
    for (const k of [1, 0.66, 0.33, 0]) {
      const x = m.x - sh * CONFIG.RIDE_BACK * k, z = m.z - ch * CONFIG.RIDE_BACK * k;
      RIDE_PROBE.x = x; RIDE_PROBE.z = z; RIDE_PROBE.y = y;
      resolve(RIDE_PROBE, CONFIG.BODY_R * 0.9, 0.05);
      if (k === 0 || (Math.abs(RIDE_PROBE.x - x) < 1e-6 && Math.abs(RIDE_PROBE.z - z) < 1e-6)) { RIDE_AT.x = x; RIDE_AT.z = z; RIDE_AT.y = y; return RIDE_AT; }
    }
    return RIDE_AT;
  };
  const hopOff = (sim, a, jump = true) => {
    if (!a.ride) return;
    const m = sim.actors[a.ride - 1];
    a.ride = 0; if (m) m.rider = 0;
    a.vy = jump ? 4.5 : 0; a.grounded = false; a.jumps = 0;
    if (m) { a.vx = -Math.sin(m.heading) * 2.5 + m.vx * 0.5; a.vz = -Math.cos(m.heading) * 2.5 + m.vz * 0.5; }
    emit(sim, "hopoff", a.team, a.id, a.x, a.y, a.z);
  };
  // The visitor (or anyone) asks for a rider: for `CALL_S` the nearest free bot teammate within `CALL_R` comes and
  // climbs on.
  const callRide = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    if (sim.over || a.ride || a.rider) return false;
    a.calling = CONFIG.CALL_S;
    emit(sim, "callride", a.team, a.id, a.x, a.y + 2, a.z);
    return true;
  };
  const escape = (sim, id = 0, why = "escape") => {
    const a = sim.actors[id];
    if (a.trapped <= 0) return false;
    a.trapped = a.think = 0;
    a.guard = CONFIG.GUARD_S;
    emit(sim, why, a.team, id, a.x, 1, a.z);
    return true;
  };
  const spring = (sim, a, t) => {
    a.trapped = CONFIG.TRAP_MAX_S;
    a.think = a.bot ? CONFIG.BOT_THINK[0] + sim.rng() * (CONFIG.BOT_THINK[1] - CONFIG.BOT_THINK[0]) : 0;
    a.vx = a.vz = 0;
    a.x = t.x; a.z = t.z;
    t.dark = CONFIG.TRAP_REARM_S;
    emit(sim, "trap", a.team, a.id, t.x, 0, t.z);
    dropFlag(sim, a, "knock");
  };
  // On either tower's platform by the gap, take that tower's zipline down into the other fort: from your own tower
  // into theirs to raid, or, with their block in hand, from their tower home. Not while fortifying, nor holding a
  // crate. Returns the line's team, or null.
  const nearZip = (sim, a) => {
    use(sim);
    if (sim.prep > 0 || a.holding || a.y < CONFIG.TOWER_TOP - 0.1) return null;
    for (const t of TEAMS) { const z = ARENA.zips[t]; if (Math.hypot(a.x - z.ax, a.z - z.az) < CONFIG.ZIP_R) return t; }
    return null;
  };
  const zip = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    const line = sim.over || a.riding || a.splat > 0 || a.trapped > 0 ? null : nearZip(sim, a);
    if (!line) return false;
    a.zipLine = line;
    a.riding = true;
    a.zipT = 0;
    a.climbing = false;
    a.route = "";
    emit(sim, "zip", a.team, id, a.x, a.y, a.z);
    return true;
  };
  // A rider slides along their line at `ZIP_SPEED`, hands on the cable; at its end (or on a jump) they let go and fall.
  const ride = (sim, a, dt, letGo) => {
    const z = ARENA.zips[a.zipLine];
    a.zipT = Math.min(1, a.zipT + CONFIG.ZIP_SPEED * dt / z.len);
    a.x = z.ax + (z.bx - z.ax) * a.zipT;
    a.z = z.az + (z.bz - z.az) * a.zipT;
    a.y = z.ay + (z.by - z.ay) * a.zipT - CONFIG.ZIP_HANG;
    a.vx = (z.bx - z.ax) / z.len * CONFIG.ZIP_SPEED;
    a.vz = (z.bz - z.az) / z.len * CONFIG.ZIP_SPEED;
    a.vy = 0;
    a.grounded = false;
    a.heading = Math.atan2(a.vx, a.vz);
    if (a.zipT >= 1 || letGo) {
      a.riding = false;
      a.vx *= 0.3; a.vz *= 0.3;
      emit(sim, "unzip", a.team, a.id, a.x, a.y, a.z);
    }
  };
  const trampAt = (a) => {
    for (const [x, z] of ARENA.tramps) if ((a.x - x) ** 2 + (a.z - z) ** 2 < CONFIG.TRAMP_R * CONFIG.TRAMP_R) return true;
    return false;
  };
  // A catapult: standing on your own side's, after fortifying and with no crate in your arms, it flings you high over
  // the field; at the top of the throw a parachute opens (`flight` 1 is the throw, 2 the parachute) and you drift down
  // into the other end, steering as you go.
  const nearCatapult = (sim, a) => {
    if (sim.prep > 0 || a.holding || a.flight || a.riding || !a.grounded || a.y > 0.2) return false;
    const [x, z] = ARENA.catapults[a.team][0];
    return (a.x - x) ** 2 + (a.z - z) ** 2 < CONFIG.CATAPULT_R * CONFIG.CATAPULT_R;
  };
  // The other side's catapult: a visitor only (bots know better).
  const nearEnemyCatapult = (sim, a) => {
    if (sim.prep > 0 || a.bot || a.holding || a.flight || a.riding || !a.grounded || a.y > 0.2) return false;
    const [x, z] = ARENA.catapults[other(a.team)][0];
    return (a.x - x) ** 2 + (a.z - z) ** 2 < CONFIG.CATAPULT_R * CONFIG.CATAPULT_R;
  };
  // It throws you backward, off the back of the island past the rim, no parachute: jetpack or hook back, or fall. A
  // block in hand stays there for the whole flight (`flung`): landed back on the island it's still yours; fallen all
  // the way, it falls with you and goes home (`respawn`).
  const flingOff = (sim, a) => {
    const [x, z] = ARENA.catapults[other(a.team)][0], len = Math.hypot(x, z) || 1, ox = x / len, oz = z / len;
    let edge = 0;
    while (onIsland(x + ox * edge, z + oz * edge) && edge < 200) edge += 2;
    a.vy = CONFIG.ENEMY_CAT_UP;
    const t = 2 * a.vy / CONFIG.FALL, speed = (edge + CONFIG.ENEMY_CAT_PAST) / t;
    a.vx = ox * speed; a.vz = oz * speed;
    a.grounded = false; a.jumps = 0; a.crouch = false; a.route = ""; a.heading = Math.atan2(ox, oz); a.knock = t * 0.85; a.flung = !!a.carrying;
    emit(sim, "enemycat", other(a.team), a.id, x, a.y, z);
  };
  const launch = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    if (!sim.over && a.splat <= 0 && a.trapped <= 0 && a.burnt <= 0 && a.slip <= 0 && nearEnemyCatapult(sim, a)) { flingOff(sim, a); return true; }
    if (sim.over || a.splat > 0 || a.trapped > 0 || a.burnt > 0 || a.slip > 0 || !nearCatapult(sim, a)) return false;
    const [tx, tz] = ARENA.drops[a.team], dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    // Straight up to `LAUNCH_H` and over the drop spot at the top of the arc.
    a.vy = Math.sqrt(2 * CONFIG.FALL * CONFIG.LAUNCH_H);
    const t = a.vy / CONFIG.FALL;
    a.vx = dx / d * (d / t); a.vz = dz / d * (d / t);
    a.flight = 1; a.grounded = false; a.jumps = 0; a.crouch = false; a.route = "";
    a.heading = Math.atan2(dx, dz);
    emit(sim, "launch", a.team, id, a.x, a.y, a.z);
    return true;
  };
  // True when actor `a` stands on either sniper tower's platform.
  const onTower = (a) => {
    if (a.y < CONFIG.TOWER_TOP - 0.3 || a.riding) return false;
    for (const t of TEAMS) {
      const [x0, x1, z0, z1] = ARENA.towers[t];
      if (a.x > x0 && a.x < x1 && a.z > z0 && a.z < z1) return true;
    }
    return false;
  };
  // The climb (a tower's ladder, a jungle net) actor `a` stands at and is still below the top of, or null.
  const ladderAt = (a) => {
    for (const l of ARENA.climbs) {
      const [x0, x1, z0, z1] = l.zone;
      if (a.y < l.top && a.x >= x0 - 0.1 && a.x <= x1 + 0.1 && a.z >= z0 - 0.1 && a.z <= z1 + 0.1) return l;
    }
    return null;
  };
  // The rival a heat-seeker goes after: the nearest open one within `HOMER_SEEK`, or -1.
  const seekTarget = (sim, s) => {
    let best = -1, bd = CONFIG.HOMER_SEEK * CONFIG.HOMER_SEEK;
    for (const b of sim.actors) {
      if (b.team === s.team || !open(b)) continue;
      const d = (b.x - s.x) ** 2 + (b.z - s.z) ** 2;
      if (d < bd) { bd = d; best = b.id; }
    }
    return best;
  };
  // Throw tool `kind` from actor `id` along `yaw` (radians, 0 toward +z) with an upward `pitch` added to the lob.
  const fire = (sim, id, yaw, pitch = 0, kind = "paint") => {
    use(sim);
    // Laser eyes ready: the trigger fires them instead, one long beam (`stepBeam`).
    const la = sim.actors[id];
    if (la.laser > 0 && la.beam <= 0 && (kind === "paint" || kind === "ak" || kind === "gold") && !sim.over && la.splat <= 0 && la.trapped <= 0 && !la.grabbed) {
      la.laser = 0; la.beam = CONFIG.BEAM_S; la.heading = yaw; la.beamLen = 0;
      emit(sim, "laseron", la.team, id, la.x, la.y + 1.5, la.z);
      return true;
    }
    if (la.beam > 0) return false;
    const a = la, tool = TOOLS[kind];
    if (sim.over || !tool || a.splat > 0 || a.trapped > 0 || a.cooldown > 0 || (tool.max && a[kind] <= 0) || (kind === "crate") !== a.holding || (kind === "sniper" && !onTower(a)) || a.burnt > 0 || a.slip > 0 || a.grabbed || (kind === "gold" && !a.gold) || (kind === "ak" && (a.akMag <= 0 || a.akReload > 0))) return false;
    let s = null;
    for (let i = 0; i < sim.shots.length && !s; i++) if (!sim.shots[i].live) s = sim.shots[i];
    if (!s) return false;
    const c = Math.cos(pitch), sx = Math.sin(yaw) * c, sz = Math.cos(yaw) * c;
    s.live = true; s.kind = kind; s.team = a.team; s.owner = id; s.t = 0; s.ox = a.x; s.oz = a.z;
    s.x = a.x + sx * 0.5; s.z = a.z + sz * 0.5; s.y = a.y + (a.crouch ? CONFIG.CROUCH_H - 0.25 : CONFIG.SHOT_Y);
    s.vx = sx * tool.speed; s.vz = sz * tool.speed; s.vy = tool.lift + Math.sin(pitch) * tool.speed;
    if (tool.max) a[kind]--;
    if (kind === "crate") { a.holding = false; s.y = a.y + 1.7; }
    a.cooldown = a.bot ? (sim.bots.akCool && (kind === "ak" || kind === "gold") ? sim.bots.akCool : Math.max(tool.cool, sim.bots.cool)) : tool.cool;
    a.heading = yaw;
    if (kind !== "crate") a.lastKind = kind;
    emit(sim, kind === "paint" || kind === "gold" || kind === "ak" ? "fire" : "throw", a.team, id, s.x, s.y, s.z);
    // The golden pair: one AK in each hand, both firing every round, so a second shot goes out from the left.
    if (kind === "gold") {
      const ox = Math.cos(yaw) * CONFIG.GOLD_SIDE, oz = -Math.sin(yaw) * CONFIG.GOLD_SIDE;
      s.x += ox; s.z += oz;
      let t = null;
      for (let i = 0; i < sim.shots.length && !t; i++) if (!sim.shots[i].live) t = sim.shots[i];
      if (t) {
        t.live = true; t.kind = kind; t.team = a.team; t.owner = id; t.t = 0; t.ox = a.x; t.oz = a.z;
        t.x = s.x - 2 * ox; t.y = s.y; t.z = s.z - 2 * oz; t.vx = s.vx; t.vy = s.vy; t.vz = s.vz;
      }
    }
    // A round from the AK; an empty magazine starts its reload.
    if (kind === "ak" && --a.akMag <= 0) { a.akReload = CONFIG.AK_RELOAD; emit(sim, "reload", a.team, id, a.x, a.y, a.z); }
    // The monkeys fire with you: each launches a heat-seeking missile (once a second) that hunts the nearest rival.
    if (a.monkeys > 0 && a.monkeyCool <= 0 && (kind === "paint" || kind === "ak" || kind === "gold")) {
      a.monkeyCool = CONFIG.MONKEY_COOL;
      for (const side of [-1, 1]) {
        let m = null;
        for (let i = 0; i < sim.shots.length && !m; i++) if (!sim.shots[i].live) m = sim.shots[i];
        if (!m) break;
        const ox = Math.cos(yaw) * side * CONFIG.MONKEY_SIDE, oz = -Math.sin(yaw) * side * CONFIG.MONKEY_SIDE, sp = TOOLS.homer.speed;
        m.live = true; m.kind = "homer"; m.team = a.team; m.owner = id; m.t = 0; m.ox = a.x; m.oz = a.z;
        m.x = a.x + ox; m.y = a.y + 1.1; m.z = a.z + oz;
        // Up and out first, then it turns for its prey.
        m.vx = Math.sin(yaw) * sp * 0.6 + ox * 3; m.vy = sp * 0.5; m.vz = Math.cos(yaw) * sp * 0.6 + oz * 3;
        m.target = seekTarget(sim, m);
      }
      emit(sim, "homers", a.team, id, a.x, a.y + 1.1, a.z);
    }
    return true;
  };
  // `s` is the shot that did it, if any: its thrower is credited with the hit, and a sniper's range is kept.
  const splat = (sim, a, bonk = false, s = null) => {
    const by = s ? s.owner : -1;
    if (s && by >= 0) {
      const o = sim.actors[by];
      o.hits++;
      if (s.kind === "sniper") o.longShot = Math.max(o.longShot, Math.hypot(a.x - s.ox, a.z - s.oz));
    }
    a.splat = CONFIG.SPLAT_S * (sim.halving[a.team] > 0 ? 0.5 : 1);
    a.bonked = bonk;
    a.guard = a.netted = 0;
    a.vx = a.vz = 0;
    a.splats++;
    a.painted = Math.min(1, a.painted + 0.34);
    emit(sim, bonk ? "bonk" : "splat", a.team, a.id, a.x, a.y + 1, a.z, by);
    if (a.holding) { a.holding = false; emit(sim, "smash", a.team, a.id, a.x, a.y + 2, a.z); }
    if (a.riding) { a.riding = false; a.vy = 0; emit(sim, "unzip", a.team, a.id, a.x, a.y, a.z); }
    dropFlag(sim, a, "knock");
  };
  const open = (a) => a.splat <= 0 && a.guard <= 0 && a.trapped <= 0;
  // A grenade or rocket bursts: every open rival within its radius is splatted.
  // The gorillas, wicked's island gorillas in the sim's rules: each roams round its home; an Ooga that comes within
  // `GORILLA_SIGHT` (and not too far from home) is charged and grabbed, any block in its hands dropped where it was
  // grabbed. Then the capture: it drags the Ooga by the feet to the nearest edge (`G_HOLD`), winds up (`G_THROW`) and
  // throws it off, and the Ooga jetpacks back. Each distinct press adds one to the struggle meter (`grabFill`), which
  // drains at the skill's `drain` a second; filling it to the skill's `need` breaks free at any point (a bot presses at
  // the skill's `mash` a second); the hook frees a captive too. Paint and a burst stun a free gorilla but never a grip.
  const G_ROAM = 0, G_CHASE = 1, G_HOLD = 2, G_REST = 3, G_STUN = 4, G_THROW = 5;
  const letGo = (sim, g, a, broke) => {
    if (a && a.grabbed) {
      a.grabbed = 0;
      // Out of the grip backward, away from the edge it was being dragged to.
      a.vx = -Math.sin(g.heading) * 4.5; a.vz = -Math.cos(g.heading) * 4.5; a.vy = 4;
      a.grounded = false; a.guard = Math.max(a.guard, 1.2);
      emit(sim, broke ? "breakfree" : "letgo", a.team, a.id, a.x, a.y, a.z);
    }
    g.holding = -1;
    if (g.state === G_HOLD || g.state === G_THROW) { g.state = G_REST; g.t = sim.bots.gorilla.rest; }
  };
  // Paint and blasts stun a gorilla but never break its grip; only a mash (`grabbed` loop) or the hook (`hook`) frees a captive.
  const stunGorilla = (sim, g, by, hook = false) => {
    if (g.state === G_HOLD || g.state === G_THROW) {
      if (!hook) return;
      letGo(sim, g, sim.actors[g.holding], false);
    }
    g.state = G_STUN; g.t = CONFIG.GORILLA_STUN; g.vx = g.vz = 0;
    emit(sim, "gorillahit", null, by, g.x, 1.6, g.z);
  };
  // The way to the edge, worked out once a map: every open cell a gorilla fits in, and how many cells it is from the
  // nearest stance (a cell by the edge with a clear throw out over it), so a route round the mounds, caves and walls is
  // simply downhill. `stance` is how far in a stance may stand.
  const dragCache = {}, DRAG_STANCE = [0.9, 1.5], DRAG_N = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const dragFor = () => {
    let D = dragCache[ARENA.id];
    if (D) return D;
    const nx = Math.round(2 * ARENA.W / REST_CELL) + 1, nz = Math.round(2 * ARENA.L / REST_CELL) + 1, dist = new Int32Array(nx * nz).fill(-1), queue = new Int32Array(nx * nz), keep = CRATES;
    CRATES = [];
    const open = new Uint8Array(nx * nz);
    let tail = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = i * REST_CELL - ARENA.W, z = j * REST_CELL - ARENA.L, e = edgeDist(x, z);
      if (e < 0.8) continue;
      REST_BODY.x = x; REST_BODY.y = 0; REST_BODY.z = z;
      if (inGrave(x, z)) continue;
      resolve(REST_BODY, CONFIG.GORILLA_DRAG_R, 0.05);
      if (REST_BODY.x !== x || REST_BODY.z !== z) continue;
      open[i * nz + j] = 1;
      if (e < DRAG_STANCE[0] || e > DRAG_STANCE[1]) continue;
      if (!clearLine(x, z, x + EDGE.x * (e + 2), z + EDGE.z * (e + 2), 0.4)) continue;
      dist[i * nz + j] = 0;
      queue[tail++] = i * nz + j;
    }
    for (let head = 0; head < tail; head++) {
      const k = queue[head], i = Math.floor(k / nz), j = k % nz;
      for (let n = 0; n < DRAG_N.length; n++) {
        const ni = i + DRAG_N[n][0], nj = j + DRAG_N[n][1];
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const m = ni * nz + nj;
        if (dist[m] >= 0 || !open[m]) continue;
        dist[m] = dist[k] + 1;
        queue[tail++] = m;
      }
    }
    CRATES = keep;
    D = dragCache[ARENA.id] = { dist, nx, nz };
    return D;
  };
  // The cell a gorilla at (x, z) is on: its own, or the nearest on the route (it can be pressed against a wall).
  const dragCell = (D, x, z) => {
    const i0 = Math.max(0, Math.min(D.nx - 1, Math.round((x + ARENA.W) / REST_CELL))), j0 = Math.max(0, Math.min(D.nz - 1, Math.round((z + ARENA.L) / REST_CELL)));
    if (D.dist[i0 * D.nz + j0] >= 0) return i0 * D.nz + j0;
    for (let r = 1, top = Math.max(D.nx, D.nz); r < top; r++) {
      let best = -1, bd = Infinity;
      for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
        if ((i !== i0 - r && i !== i0 + r && j !== j0 - r && j !== j0 + r) || i < 0 || j < 0 || i >= D.nx || j >= D.nz || D.dist[i * D.nz + j] < 0) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2;
        if (d < bd) { bd = d; best = i * D.nz + j; }
      }
      if (best >= 0) return best;
    }
    throw new Error(`${ARENA.id}: no way to the edge`);
  };
  // `steps` cells down the route from cell k.
  const dragStep = (D, k, steps) => {
    for (let s = 0; s < steps && D.dist[k] > 0; s++) {
      const i = Math.floor(k / D.nz), j = k % D.nz;
      let best = k;
      for (let n = 0; n < DRAG_N.length; n++) {
        const ni = i + DRAG_N[n][0], nj = j + DRAG_N[n][1];
        if (ni < 0 || nj < 0 || ni >= D.nx || nj >= D.nz) continue;
        const m = ni * D.nz + nj;
        if (D.dist[m] >= 0 && D.dist[m] < D.dist[best]) best = m;
      }
      if (best === k) break;
      k = best;
    }
    return k;
  };
  // Where the route from a gorilla at (x, z) ends, kept on it for the scene and the checks.
  const pickEdge = (g) => {
    const D = dragFor(), end = dragStep(D, dragCell(D, g.x, g.z), 1 << 20);
    g.ex = Math.floor(end / D.nz) * REST_CELL - ARENA.W; g.ez = (end % D.nz) * REST_CELL - ARENA.L;
  };
  // The captive trails behind the gorilla by the feet, lying along the ground.
  const placeCaptive = (g, a) => {
    a.x = g.x - Math.sin(g.heading) * CONFIG.DRAG_BACK; a.z = g.z - Math.cos(g.heading) * CONFIG.DRAG_BACK;
    a.y = 0.15;
    a.vx = a.vz = a.vy = 0; a.grounded = false;
  };
  const stepGorillas = (sim, dt) => {
    const gb = sim.bots.gorilla;
    for (let i = 0; i < sim.gorillas.length; i++) {
      const g = sim.gorillas[i];
      if (g.t > 0) g.t -= dt;
      if (g.hookCool > 0) g.hookCool -= dt;
      if (g.state === G_HOLD || g.state === G_THROW) {
        const a = sim.actors[g.holding];
        if (!a || a.grabbed !== i + 1) { g.holding = -1; g.state = G_REST; g.t = gb.rest; continue; }
        g.held += dt;
        if (g.held > CONFIG.GRAB_MAX_S) { letGo(sim, g, a, false); continue; }
        if (g.state === G_THROW) {
          // Winding up at the edge, facing out over it: the captive swings round the gorilla, up and over the rim.
          const ox = Math.sin(g.heading), oz = Math.cos(g.heading), edge = Math.max(0.5, edgeDist(g.x, g.z));
          g.throwT = Math.min(1, 1 - Math.max(0, g.t) / CONFIG.GORILLA_THROW_S);
          const along = -CONFIG.DRAG_BACK + (edge + 0.8 + CONFIG.DRAG_BACK) * g.throwT;
          a.x = g.x + ox * along; a.z = g.z + oz * along; a.y = 0.15 + 3 * Math.sin(Math.PI * g.throwT);
          a.vx = a.vz = a.vy = 0; a.grounded = false;
          if (g.t > 0) continue;
          // Released past the rim, in the air and flying outward: nothing on the island can stop it now.
          a.grabbed = 0;
          a.x = g.x + ox * (edge + 0.8); a.z = g.z + oz * (edge + 0.8); a.y = 1.2;
          for (let tries = 0; tries < 8 && onIsland(a.x, a.z); tries++) { a.x += ox * 0.5; a.z += oz * 0.5; }
          a.vx = ox * CONFIG.GORILLA_THROW; a.vz = oz * CONFIG.GORILLA_THROW; a.vy = CONFIG.GORILLA_THROW_UP;
          a.grounded = false; a.jumps = 0; a.fuel = CONFIG.JET_FUEL; a.knock = CONFIG.THROWN_S; a.guard = Math.max(a.guard, 1.5);
          emit(sim, "thrown", a.team, a.id, a.x, a.y, a.z);
          g.holding = -1; g.state = G_REST; g.t = gb.rest; g.throwT = 0;
          continue;
        }
        // Dragging: down the route to the nearest edge it can throw from.
        const D = dragFor(), here = dragCell(D, g.x, g.z);
        if (D.dist[here] === 0) {
          g.state = G_THROW; g.t = CONFIG.GORILLA_THROW_S; g.throwT = 0; g.vx = g.vz = 0;
          edgeDist(g.x, g.z);
          g.heading = Math.atan2(EDGE.x, EDGE.z);
          placeCaptive(g, a);
          emit(sim, "windup", a.team, a.id, g.x, 1.4, g.z);
          continue;
        }
        const next = dragStep(D, here, 1), tx = Math.floor(next / D.nz) * REST_CELL - ARENA.W, tz = (next % D.nz) * REST_CELL - ARENA.L;
        const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz) || 1;
        g.vx = dx / d * gb.drag; g.vz = dz / d * gb.drag;
        const ox = g.x, oz = g.z;
        g.x += g.vx * dt; g.z += g.vz * dt;
        // Squeezing a captive through a narrow gap: a tighter body than it charges with.
        resolve(g, CONFIG.GORILLA_DRAG_R);
        clampIn(g, 0.8);
        // Turning smoothly, so the captive swings along behind it.
        const turn = Math.atan2(Math.sin(Math.atan2(g.vx, g.vz) - g.heading), Math.cos(Math.atan2(g.vx, g.vz) - g.heading));
        g.heading += Math.max(-7 * dt, Math.min(7 * dt, turn));
        placeCaptive(g, a);
        g.stall = Math.hypot(g.x - ox, g.z - oz) < gb.drag * dt * 0.3 ? g.stall + dt : 0;
        // Only a crate can be in the way of the route: it goes.
        if (g.stall > 0.6) {
          g.stall = 0;
          for (const c of sim.crates) if (c.live && (c.x - g.x) ** 2 + (c.z - g.z) ** 2 < 4) { c.live = false; emit(sim, "smash", a.team, a.id, c.x, c.y, c.z); }
        }
        continue;
      }
      if (g.state === G_REST || g.state === G_STUN) {
        if (g.t > 0) { g.vx = g.vz = 0; continue; }
        g.state = G_ROAM;
      }
      // The nearest Ooga in reach on the ground, not too far from home.
      let best = null, bd = gb.sight * gb.sight;
      for (const a of sim.actors) {
        if (a.splat > 0 || a.trapped > 0 || a.grabbed || a.guard > 0 || a.y > 1.4 || a.y < -0.5 || a.riding || a.flight || a.climbing) continue;
        if ((a.x - g.hx) ** 2 + (a.z - g.hz) ** 2 > CONFIG.GORILLA_LEASH * CONFIG.GORILLA_LEASH) continue;
        const d = (a.x - g.x) ** 2 + (a.z - g.z) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
      let tx, tz, speed;
      if (best) {
        g.state = G_CHASE; tx = best.x; tz = best.z; speed = gb.charge;
        if (bd < gb.reach * gb.reach) {
          // Grabbed: down by the feet, block and crate let fall where it was grabbed, and off to the edge.
          g.state = G_HOLD; g.holding = best.id; g.held = 0; g.vx = g.vz = 0; g.stall = 0;
          best.grabbed = i + 1; best.grabFill = 0;
          best.climbing = best.jetting = false;
          if (best.holding) { best.holding = false; emit(sim, "smash", best.team, best.id, best.x, best.y + 2, best.z); }
          emit(sim, "grab", best.team, best.id, best.x, 1.4, best.z);
          dropFlag(sim, best, "knock");
          pickEdge(g);
          continue;
        }
      } else {
        g.state = G_ROAM; speed = CONFIG.GORILLA_SPEED;
        if ((g.wx - g.x) ** 2 + (g.wz - g.z) ** 2 < 0.5) {
          const ang = sim.rng() * Math.PI * 2, r = sim.rng() * CONFIG.GORILLA_WANDER;
          g.wx = g.hx + Math.sin(ang) * r; g.wz = g.hz + Math.cos(ang) * r;
        }
        tx = g.wx; tz = g.wz;
      }
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz) || 1;
      g.vx = dx / d * speed; g.vz = dz / d * speed;
      const ox = g.x, oz = g.z;
      g.x += g.vx * dt; g.z += g.vz * dt;
      resolve(g, CONFIG.GORILLA_R);
      clampIn(g, 1);
      // Stuck on something while wandering: pick somewhere else.
      if (g.state === G_ROAM && Math.hypot(g.x - ox, g.z - oz) < speed * dt * 0.3) { g.wx = g.x; g.wz = g.z; }
      g.heading = Math.atan2(g.vx, g.vz);
    }
  };
  // ---- The grappling hook ----
  // Cloud Hopper's hook as a special weapon: its head and rope models, its flight (`BL.grapple.toward`), plus a rope that
  // swings (`BL.grapple.tether`). `hk` is what the actor's hook is doing: 0 in the hand, 1 flying out, 2 bitten into
  // something and reeling the Ooga in, 3 latched on a block carrier, 4 coming back, 5 pulling a block in along the rope.
  const H_OUT = 1, H_BIT = 2, H_YANK = 3, H_BACK = 4, H_REEL = 5;
  const chestY = (a) => a.y + (a.crouch ? CONFIG.CROUCH_H - 0.25 : CONFIG.SHOT_Y);
  // Throw `id`'s hook along `yaw` and `pitch`; thrown already and bitten, the same press lets go. False when there is
  // no hook, it is recharging or the Ooga can't.
  const grapple = (sim, id = 0, yaw = sim.actors[id].heading, pitch = 0.2) => {
    use(sim);
    const a = sim.actors[id];
    if (sim.over || !a.hook) return false;
    if (a.hk === H_BIT || a.hk === H_YANK) { hookBack(sim, a, "hookrelease"); return true; }
    if (a.hk || a.hCool > 0 || sim.prep > 0 || a.splat > 0 || a.trapped > 0 || a.grabbed || a.riding || a.flight === 1 || a.climbing || a.holding) return false;
    if (a.flight === 2) cutChute(sim, id);
    const c = Math.cos(pitch), dx = Math.sin(yaw) * c, dy = Math.sin(pitch), dz = Math.cos(yaw) * c, oy = chestY(a);
    a.hk = H_OUT; a.heading = yaw; a.hookT = 0;
    a.hookTip.x = a.x + dx * 0.5; a.hookTip.y = oy + dy * 0.5; a.hookTip.z = a.z + dz * 0.5;
    a.hookEnd.x = a.x + dx * CONFIG.HOOK_RANGE; a.hookEnd.y = oy + dy * CONFIG.HOOK_RANGE; a.hookEnd.z = a.z + dz * CONFIG.HOOK_RANGE;
    emit(sim, "hookthrow", a.team, id, a.x, oy, a.z);
    return true;
  };
  // Let go, or a miss: the head flies back to the hand and the hook recharges.
  // A block on the rope comes to an end: into the hooker's hands, or, if they can't take it, on reachable ground beside
  // them. The rules are touching's: the rival block is carried, your own loose block goes home.
  const reelEnd = (sim, a, f, reached) => {
    f.hookedBy = -1;
    const can = reached && !a.carrying && !a.holding && a.splat <= 0 && a.trapped <= 0 && !a.grabbed;
    if (can && f.team === a.team) {
      a.rescues++;
      emit(sim, "rescue", f.team, a.id, f.x, 0, f.z);
      homeFlag(f);
      f.graceT = CONFIG.BLOCK_GRACE_S;
      emit(sim, "return", f.team, a.id, f.x, 0, f.z);
    } else if (can) {
      f.state = "carried"; f.carrier = a.id; f.homeT = 0; f.x = a.x; f.y = a.y; f.z = a.z;
      a.carrying = f.team; a.blocked = null;
      emit(sim, "pickup", f.team, a.id, f.x, 0, f.z);
    } else {
      const at = restSpot(reached ? a.x + Math.sin(a.heading) * 1.2 : f.x, reached ? a.z + Math.cos(a.heading) * 1.2 : f.z);
      f.state = "dropped"; f.x = at.x; f.y = 0; f.z = at.z; f.thrower = -1;
      emit(sim, "landed", f.team, a.id, f.x, f.y, f.z);
    }
  };
  // Pull block `f` onto the rope: the block leaves wherever it was and comes in to the hooker.
  const reelIn = (sim, a, f) => {
    f.state = "flying"; f.carrier = null; f.thrower = -1; f.t = 0; f.homeT = 0; f.hookedBy = a.id; f.vx = f.vy = f.vz = 0;
    a.hk = H_REEL; a.hookT = 0; a.hookTarget = TEAMS.indexOf(f.team);
    if (f.y < 1) f.y = 1;
  };
  // The visitor's Ooga opens a round under its parachute, dropped in over its own start: bots start where they stand.
  const parachuteIn = (sim, id = 0, height = CONFIG.DROP_IN_H) => {
    const a = sim.actors[id];
    a.y += height; a.vx = a.vz = 0; a.vy = -CONFIG.CHUTE_FALL; a.grounded = false; a.flight = 2;
    emit(sim, "chute", a.team, id, a.x, a.y, a.z);
  };
  // Out of the parachute in the air: a fall from here, the jetpack free again.
  const cutChute = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    if (a.flight !== 2) return false;
    a.flight = 0; a.jumps = 1;
    emit(sim, "chuteoff", a.team, id, a.x, a.y, a.z);
    return true;
  };
  // A page taking over as a live round's host holds what frames carry, and frames carry no hook's target: a hook
  // reeling or yanking a target nobody can name comes home instead.
  const settleHooks = (sim) => {
    for (const a of sim.actors) if (a.hk === H_YANK || a.hk === H_REEL) { a.hk = H_BACK; a.hookTarget = -1; }
  };
  const hookBack = (sim, a, why) => {
    // Let go of a block still on the rope, and it lands where it is.
    if (a.hk === H_REEL) { const f = sim.flags[TEAMS[a.hookTarget]]; if (f.hookedBy === a.id) reelEnd(sim, a, f, false); }
    if (a.hk === H_BIT && !a.grounded) a.flingT = CONFIG.HOOK_FLING_S;
    a.hk = H_BACK; a.hookTarget = -1; a.hCool = CONFIG.HOOK_COOL;
    emit(sim, why, a.team, a.id, a.hookTip.x, a.hookTip.y, a.hookTip.z);
  };
  // What a hook bites: anything solid, and what the boxes leave out: the canopies, the stands, the catapults.
  const hookSolid = (x, y, z) => {
    if (solidAt(x, y, z)) return true;
    for (let i = 0; i < LEDGES.length; i++) { const b = LEDGES[i]; if (x > b[0] && x < b[1] && z > b[2] && z < b[3] && y > b[5] - 1.5 && y < b[4] + 0.6) return true; }
    for (let i = 0; i < ARENA.decor.length; i++) { const d = ARENA.decor[i]; if (d.kind === "canopy" && (x - d.x) ** 2 + (z - d.z) ** 2 < d.r * d.r && y > d.y - 0.5 && y < d.y + LEAF_TOP) return true; }
    for (const t of TEAMS) {
      const st = ARENA.stands[t], ca = ARENA.catapults[t][0];
      if ((y < 1.1 && (x - st.x) ** 2 + (z - st.z) ** 2 < 1.2) || (y < 1.5 && (x - ca[0]) ** 2 + (z - ca[1]) ** 2 < 1.6)) return true;
    }
    return false;
  };
  const hookBite = (sim, a) => {
    const tip = a.hookTip;
    a.hk = H_BIT; a.hookT = 0; a.hookLen = Math.hypot(tip.x - a.x, tip.y - chestY(a), tip.z - a.z);
    if (a.grounded) { a.vy = CONFIG.HOOK_HOP; a.grounded = false; a.jumps = 1; }
    emit(sim, "hookbite", a.team, a.id, tip.x, tip.y, tip.z);
  };
  const LOS_OUT = { x: 0, y: 0, z: 0 };
  const stepHook = (sim, a, dt) => {
    const tip = a.hookTip, G = BL.grapple;
    if (a.hk === H_BACK) { if (G.toward(tip, a.x, chestY(a), a.z, CONFIG.HOOK_FLY * dt)) a.hk = 0; return; }
    if (a.splat > 0 || a.trapped > 0 || a.grabbed || a.riding || a.flight || a.climbing) { hookBack(sim, a, "hookrelease"); return; }
    if (a.hk === H_REEL) {
      const f = sim.flags[TEAMS[a.hookTarget]];
      if (f.hookedBy !== a.id) { hookBack(sim, a, "hookrelease"); return; }
      const arrived = G.toward(f, a.x, chestY(a), a.z, CONFIG.HOOK_BLOCK_PULL * dt);
      tip.x = f.x; tip.y = f.y; tip.z = f.z;
      if (!arrived) return;
      reelEnd(sim, a, f, true);
      a.hk = H_BACK; a.hookTarget = -1; a.hCool = CONFIG.HOOK_YANK_COOL;
      emit(sim, "hookrelease", a.team, a.id, tip.x, tip.y, tip.z);
      return;
    }
    if (a.hk === H_OUT) {
      // In short steps, so a thin rail or post can't be flown through.
      for (let sub = 0; sub < 4; sub++) {
      const done = G.toward(tip, a.hookEnd.x, a.hookEnd.y, a.hookEnd.z, CONFIG.HOOK_FLY * dt / 4);
      // The first thing along the rope wins: solid rock or a wall bites before anything behind it can be reached.
      if (solidAt(tip.x, tip.y, tip.z)) { hookBite(sim, a); return; }
      // A rival carrying a block: latched, a moment's warning, then the block is yanked out of their hands.
      for (const b of sim.actors) {
        if (b.team === a.team || !b.carrying || b.trapped > 0) continue;
        const dy = tip.y - b.y;
        if (dy > -0.2 && dy < heightOf(b) + 0.3 && (tip.x - b.x) ** 2 + (tip.z - b.z) ** 2 < CONFIG.HOOK_HIT_R * CONFIG.HOOK_HIT_R) {
          a.hk = H_YANK; a.hookTarget = b.id; a.hookT = 0;
          emit(sim, "hookwarn", b.team, b.id, b.x, b.y + 1.2, b.z, a.id);
          return;
        }
      }
      // A block on its stand or loose on the ground: only one that could be touched up (not your own at home, not one in
      // cold storage, not one this Ooga just let go of).
      for (let t = 0; t < TEAMS.length; t++) {
        const f = sim.flags[TEAMS[t]];
        if ((f.state !== "home" && f.state !== "dropped") || (f.state === "home" && (f.team === a.team || sim.cold[f.team] > 0)) || a.blocked === f.team) continue;
        const dy = tip.y - f.y;
        if (dy < -0.3 || dy > CONFIG.HOOK_BLOCK_H || (tip.x - f.x) ** 2 + (tip.z - f.z) ** 2 > CONFIG.HOOK_BLOCK_R * CONFIG.HOOK_BLOCK_R) continue;
        reelIn(sim, a, f);
        emit(sim, "yank", f.team, a.id, f.x, f.y, f.z, -1);
        return;
      }
      for (let i = 0; i < sim.gorillas.length; i++) {
        const g = sim.gorillas[i];
        if (tip.y > 2.5 || (tip.x - g.x) ** 2 + (tip.z - g.z) ** 2 > 1) continue;
        // A hooked gorilla is stunned and drops its captive, with a cooldown before the hook can do that again.
        if (g.hookCool > 0) emit(sim, "hookbounce", a.team, a.id, g.x, 1.6, g.z);
        else if ((g.state === G_ROAM || g.state === G_CHASE) && sim.rng() < sim.bots.gorilla.dodge) emit(sim, "hookbounce", a.team, a.id, g.x, 1.6, g.z);
        else { stunGorilla(sim, g, a.id, true); g.t = CONFIG.HOOK_STUN_S; g.hookCool = CONFIG.HOOK_STUN_COOL; emit(sim, "gorillahooked", a.team, a.id, g.x, 1.6, g.z); }
        hookBack(sim, a, "hookrelease");
        return;
      }
      if (hookSolid(tip.x, tip.y, tip.z)) { hookBite(sim, a); return; }
      if (done) { hookBack(sim, a, "hookmiss"); return; }
      }
      return;
    }
    if (a.hk === H_YANK) {
      const b = sim.actors[a.hookTarget];
      tip.x = b.x; tip.y = b.y + 1.2; tip.z = b.z;
      if (!b.carrying || Math.hypot(b.x - a.x, b.z - a.z) > CONFIG.HOOK_RANGE + 2) { hookBack(sim, a, "hookrelease"); return; }
      if ((a.hookT += dt) < CONFIG.HOOK_WARN) return;
      // The warning is up: if the carrier reached cover, the yank fails.
      {
        const dx = b.x - a.x, dy = b.y + 1.2 - chestY(a), dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
        if (G.march(a.x, chestY(a), a.z, dx / d, dy / d, dz / d, d - 0.3, 0.125, solidAt, LOS_OUT) >= 0) { hookBack(sim, a, "hookmiss"); return; }
      }
      const f = sim.flags[b.carrying];
      f.x = b.x; f.y = b.y + 1.4; f.z = b.z;
      b.carrying = null;
      reelIn(sim, a, f);
      emit(sim, "yank", f.team, a.id, b.x, b.y + 1.4, b.z, b.id);
      return;
    }
    // Bitten: pulled toward the bite (Cloud Hopper's pull speed) until there, or too long has passed. The rope only ever
    // shortens, and `tether` holds the Ooga to it, so whatever speed it has across the rope swings it.
    const dx = tip.x - a.x, dy = tip.y - chestY(a), dz = tip.z - a.z, d = Math.hypot(dx, dy, dz);
    if ((a.hookT += dt) > CONFIG.HOOK_HOLD_S || d < CONFIG.HOOK_MIN + 0.4) { hookBack(sim, a, "hookrelease"); return; }
    a.hookLen = Math.min(a.hookLen, d);
    if (a.hookHold) return;
    const want = d * G.pullSpeed(d, CONFIG.HOOK_PULL), closing = (a.vx * dx + a.vy * dy + a.vz * dz) / d;
    if (closing < want) { const add = Math.min(want - closing, CONFIG.HOOK_ACCEL * dt) / d; a.vx += dx * add; a.vy += dy * add; a.vz += dz * add; }
  };
  // Back into hiding, at a seeded spot from the map's list in either half (not the one the other hook holds).
  const hideHook = (sim, h) => {
    const n = ARENA.hookSpots.length * 2;
    for (let tries = 0; tries < 8; tries++) {
      const k = Math.floor(sim.rng() * n), spot = ARENA.hookSpots[k >> 1], turnedSpot = (k & 1) === 1;
      const sx = turnedSpot ? -spot[0] : spot[0], sz = turnedSpot ? -spot[2] : spot[2];
      let free = true;
      for (const o of sim.hooks) if (o !== h && o.state === 0 && o.x === sx && o.z === sz) free = false;
      if (free || tries === 7) { placeHook(h, spot, turnedSpot); break; }
    }
    emit(sim, "hookhide", null, -1, h.x, h.y, h.z);
  };
  // Picking up a hidden hook: walk over it.
  const touchHooks = (sim, a) => {
    if (a.hook || sim.prep > 0) return;
    for (let i = 0; i < sim.hooks.length; i++) {
      const h = sim.hooks[i];
      if (h.state !== 0 || Math.abs(a.y - h.y) > 0.8 || (a.x - h.x) ** 2 + (a.z - h.z) ** 2 > CONFIG.HOOK_R * CONFIG.HOOK_R) continue;
      h.state = 1; h.holder = a.id; a.hook = i + 1; a.hk = 0; a.hCool = 0;
      emit(sim, "hookget", a.team, a.id, h.x, h.y, h.z);
      return;
    }
  };
  // ---- Free Hardware Wallets ----
  // The machine actor `a` stands at with one ready, or null.
  const nearVend = (sim, a) => {
    if (sim.prep > 0 || a.wallet >= 0 || a.carrying || a.holding || a.riding || a.flight || a.y > 0.5) return null;
    for (const v of sim.vends) if (v.dark <= 0 && (a.x - v.x) ** 2 + (a.z - v.z) ** 2 < CONFIG.VEND_R * CONFIG.VEND_R) return v;
    return null;
  };
  // Take a device from the machine: it goes over the Ooga's head, safe until it's thrown. `look` is the one picked
  // at the machine (an index into WALLETS); bots, and any pick out of range, get one at random.
  const takeWallet = (sim, id = 0, look = -1) => {
    use(sim);
    const a = sim.actors[id], v = sim.over || a.splat > 0 || a.trapped > 0 || a.grabbed ? null : nearVend(sim, a);
    if (!v) return false;
    const k = sim.wallets.findIndex((w) => !w.live);
    if (k < 0) return false;
    const w = sim.wallets[k];
    w.live = true; w.state = 0; w.owner = id; w.team = a.team; w.look = Number.isInteger(look) && look >= 0 && look < WALLETS.length ? look : Math.floor(sim.rng() * WALLETS.length);
    w.fuse = CONFIG.WALLET_FUSE; w.stuck = -1; w.x = a.x; w.y = a.y + 2.2; w.z = a.z; w.vx = w.vy = w.vz = 0; w.spin = 0;
    a.wallet = k; v.dark = CONFIG.VEND_COOL;
    emit(sim, "wallet", a.team, id, a.x, w.look, a.z);
    return true;
  };
  // Lob the held device along `yaw` with `pitch`: its fuse starts. A rival it reaches gets it stuck on their back,
  // unknowing, till it goes off; missing, it bounces off walls and the ground and lies there ticking.
  const throwWallet = (sim, id = 0, yaw = sim.actors[id].heading, pitch = 0.25) => {
    use(sim);
    const a = sim.actors[id];
    if (a.wallet < 0 || sim.over || a.splat > 0 || a.trapped > 0 || a.grabbed) return false;
    const w = sim.wallets[a.wallet], c = Math.cos(pitch);
    w.state = 1; w.fuse = CONFIG.WALLET_FUSE;
    w.x = a.x + Math.sin(yaw) * 0.5; w.z = a.z + Math.cos(yaw) * 0.5; w.y = a.y + 1.9;
    w.vx = Math.sin(yaw) * c * CONFIG.WALLET_SPEED + a.vx * 0.3; w.vz = Math.cos(yaw) * c * CONFIG.WALLET_SPEED + a.vz * 0.3;
    w.vy = CONFIG.WALLET_LIFT + Math.sin(pitch) * CONFIG.WALLET_SPEED;
    a.wallet = -1; a.heading = yaw;
    emit(sim, "wthrow", a.team, id, w.x, w.y, w.z);
    return true;
  };
  // Set the held device down at the feet, ticking: a trap for whoever comes by.
  const dropWallet = (sim, id = 0) => {
    use(sim);
    const a = sim.actors[id];
    if (a.wallet < 0 || sim.over) return false;
    const w = sim.wallets[a.wallet];
    w.state = 2; w.fuse = CONFIG.WALLET_FUSE; w.x = a.x - Math.sin(a.heading) * 0.6; w.z = a.z - Math.cos(a.heading) * 0.6;
    w.y = groundAt(w.x, w.z, a.y + 0.3, 0.1); w.vx = w.vy = w.vz = 0;
    // Let go of over the open edge, it falls ticking.
    if (w.y === -Infinity) { w.y = a.y + 1; w.state = 1; }
    a.wallet = -1;
    emit(sim, "wdrop", a.team, id, w.x, w.y, w.z);
    return true;
  };
  // A blast: it sets off every live device within `WALLET_CHAIN` of one going off, chained, as one blast that widens
  // with the square root of how many and pushes harder with their count. Everyone in reach, either side, is knocked
  // back and sooted, dropping any block and crate. Nobody is splatted: it's harmless, as in the store.
  const chain = [];
  const blowWallet = (sim, first) => {
    chain.length = 0;
    chain.push(first); first.live = false;
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      for (const w of sim.wallets) {
        if (!w.live || (w.x - c.x) ** 2 + (w.y - c.y) ** 2 + (w.z - c.z) ** 2 > CONFIG.WALLET_CHAIN * CONFIG.WALLET_CHAIN) continue;
        w.live = false; chain.push(w);
      }
    }
    let x = 0, y = 0, z = 0;
    for (const w of chain) {
      x += w.x; y += w.y; z += w.z;
      if (w.state === 0 && w.owner >= 0 && sim.actors[w.owner].wallet >= 0 && sim.wallets[sim.actors[w.owner].wallet] === w) sim.actors[w.owner].wallet = -1;
    }
    const n = chain.length, k = Math.min(n, CONFIG.WALLET_CAP_N);
    x /= n; y /= n; z /= n;
    const r = CONFIG.WALLET_BLAST * Math.sqrt(k), by = first.owner;
    emit(sim, "blast", first.team, by, x, Math.max(0.1, y), z, n);
    // The Golden Dual AKs go to whoever stuck a wallet on their holder, when it goes off (unless they have a pair).
    for (const w of chain) {
      if (w.state !== 3 || w.stuck < 0 || w.owner < 0) continue;
      const holder = sim.actors[w.stuck], thief = sim.actors[w.owner];
      if (!holder.gold || thief.gold || thief.team === holder.team) continue;
      holder.gold = false; thief.gold = true;
      emit(sim, "goldsteal", thief.team, thief.id, holder.x, holder.y + 1, holder.z, holder.id);
    }
    // So does a grappling hook: the same rule as the golden pair.
    for (const w of chain) {
      if (w.state !== 3 || w.stuck < 0 || w.owner < 0) continue;
      const holder = sim.actors[w.stuck], thief = sim.actors[w.owner];
      if (!holder.hook || thief.hook || thief.team === holder.team) continue;
      if (holder.hk) hookBack(sim, holder, "hookrelease");
      holder.hk = 0;
      thief.hook = holder.hook; holder.hook = 0;
      sim.hooks[thief.hook - 1].holder = thief.id;
      emit(sim, "hooksteal", thief.team, thief.id, holder.x, holder.y + 1, holder.z, holder.id);
    }
    for (const g of sim.gorillas) if (g.state !== G_STUN && (g.x - x) ** 2 + (g.z - z) ** 2 < r * r) stunGorilla(sim, g, by);
    for (const g of sim.ghosts) if (g.state !== 2 && (g.x - x) ** 2 + (g.z - z) ** 2 < r * r) popGhost(sim, g, by);
    for (const a of sim.actors) {
      const dx = a.x - x, dz = a.z - z, dy = a.y + 0.9 - y, d = Math.hypot(dx, dy, dz);
      if (d > r || a.trapped > 0) continue;
      const f = (CONFIG.WALLET_PUSH * (1 - d / r) + 3) * (1 + (k - 1) * 0.15), flat = Math.hypot(dx, dz) || 1;
      if (a.grabbed) continue;
      if (a.riding) a.riding = false;
      a.climbing = false;
      a.vx = dx / flat * f; a.vz = dz / flat * f; a.vy = Math.max(a.vy, 4 + f * 0.35);
      a.grounded = false; a.jumps = 0; a.knock = CONFIG.KNOCK_S; a.soot = CONFIG.SOOT_S;
      if (a.holding) { a.holding = false; emit(sim, "smash", a.team, a.id, a.x, a.y + 2, a.z); }
      emit(sim, "rekt", a.team, a.id, a.x, a.y + 1, a.z, by);
      dropFlag(sim, a, "knock");
    }
  };
  const stepWallets = (sim, dt) => {
    for (const v of sim.vends) if (v.dark > 0) v.dark = Math.max(0, v.dark - dt);
    for (const w of sim.wallets) {
      if (!w.live) continue;
      // Held, it waits: the fuse only burns once it has been thrown.
      if (w.state === 0) {
        // Up in the left hand, beside the head.
        const a = sim.actors[w.owner];
        w.x = a.x + Math.cos(a.heading) * 0.45; w.y = a.y + 1.95; w.z = a.z - Math.sin(a.heading) * 0.45;
        continue;
      }
      w.fuse -= dt;
      if (w.state === 3) {
        // On the back of the rival it hit, riding along wherever they go.
        const v = sim.actors[w.stuck], h = v.heading;
        w.x = v.x - Math.sin(h) * 0.38; w.y = v.y + 1.15; w.z = v.z - Math.cos(h) * 0.38;
      } else if (w.state === 1) {
        // A rival in its path: it sticks to their back, and nobody tells them.
        let hit = null;
        for (const v of sim.actors) {
          if (v.team === w.team || v.trapped > 0) continue;
          const dy = w.y - v.y;
          if (dy > -0.2 && dy < heightOf(v) + 0.4 && (w.x - v.x) ** 2 + (w.z - v.z) ** 2 < CONFIG.WALLET_STICK_R * CONFIG.WALLET_STICK_R) { hit = v; break; }
        }
        if (hit) {
          w.state = 3; w.stuck = hit.id; w.vx = w.vy = w.vz = 0;
          emit(sim, "stuck", hit.team, hit.id, hit.x, hit.y + 1.2, hit.z, w.owner);
          continue;
        }
        w.vy -= CONFIG.WALLET_GRAVITY * dt;
        const nx = w.x + w.vx * dt, nz = w.z + w.vz * dt;
        // A wall turns it back; the ground bounces it a little lower each time, until it lies still.
        if (solidAt(nx, w.y, nz)) { w.vx *= -0.45; w.vz *= -0.45; } else { w.x = nx; w.z = nz; }
        w.y += w.vy * dt;
        w.spin += dt * 9;
        const ground = groundAt(w.x, w.z, w.y + 0.3, 0.1);
        if (w.y <= ground) {
          w.y = ground;
          if (w.vy < -2.5) { w.vy *= -0.35; w.vx *= 0.6; w.vz *= 0.6; emit(sim, "wbounce", w.team, w.owner, w.x, w.y, w.z); }
          else { w.vy = w.vx = w.vz = 0; w.state = 2; }
        }
      }
      if (w.fuse <= 0) blowWallet(sim, w);
    }
  };
  // ---- Laser eyes ----
  // The beam: from the eyes straight along the Ooga's heading, as far as the first solid thing (`BEAM_LEN` at most);
  // every rival it touches is splatted, every gorilla stunned, every ghost popped. It lasts `BEAM_S`.
  const BEAM_SHOT = { kind: "laser", owner: -1, team: null, ox: 0, oz: 0 };
  const stepBeam = (sim, a, dt) => {
    if ((a.beam -= dt) <= 0 || a.splat > 0 || a.trapped > 0 || a.grabbed) {
      a.beam = 0; a.beamLen = 0;
      emit(sim, "laseroff", a.team, a.id, a.x, a.y + 1.5, a.z);
      return;
    }
    const ey = a.y + (a.crouch ? CONFIG.CROUCH_H - 0.15 : 1.5), dx = Math.sin(a.heading), dz = Math.cos(a.heading);
    let len = 0.4;
    for (; len < CONFIG.BEAM_LEN; len += 0.25) if (solidAt(a.x + dx * len, ey, a.z + dz * len)) break;
    a.beamLen = len;
    const R = CONFIG.BEAM_R;
    for (const b of sim.actors) {
      if (b.team === a.team || !open(b)) continue;
      const rx = b.x - a.x, rz = b.z - a.z, along = rx * dx + rz * dz;
      if (along < 0 || along > len) continue;
      const side = Math.abs(rx * dz - rz * dx);
      if (side < R + CONFIG.BODY_R * 0.5 && ey > b.y - 0.1 && ey < b.y + heightOf(b) + 0.2) {
        BEAM_SHOT.owner = a.id; BEAM_SHOT.team = a.team; BEAM_SHOT.ox = a.x; BEAM_SHOT.oz = a.z;
        splat(sim, b, false, BEAM_SHOT);
      }
    }
    for (const g of sim.gorillas) {
      const rx = g.x - a.x, rz = g.z - a.z, along = rx * dx + rz * dz;
      if (g.state !== G_STUN && along > 0 && along < len && Math.abs(rx * dz - rz * dx) < 1) stunGorilla(sim, g, a.id);
    }
    for (const g of sim.ghosts) {
      const rx = g.x - a.x, rz = g.z - a.z, along = rx * dx + rz * dz;
      if (g.state !== 2 && along > 0 && along < len && Math.abs(rx * dz - rz * dx) < 0.8 && Math.abs(g.y - ey) < 1.2) popGhost(sim, g, a.id);
    }
  };
  // ---- Ghosts ----
  const popGhost = (sim, g, by) => {
    g.state = 2; g.t = CONFIG.GHOST_POP;
    emit(sim, "ghostpop", null, by, g.x, g.y + 0.6, g.z);
  };
  const stepGhosts = (sim, dt) => {
    for (const g of sim.ghosts) {
      g.phase += dt;
      if (g.state === 2) {
        if ((g.t -= dt) > 0) continue;
        // Back at its haunt, out of a grave.
        g.state = 0; g.x = g.wx = g.hx; g.z = g.wz = g.hz;
        emit(sim, "ghostback", null, -1, g.x, 1, g.z);
      }
      // The nearest Ooga it can reach from its haunt, on the ground floor (ghosts keep low).
      let best = null, bd = CONFIG.GHOST_SIGHT * CONFIG.GHOST_SIGHT;
      for (const a of sim.actors) {
        if (a.splat > 0 || a.trapped > 0 || a.guard > 0 || a.knock > 0 || a.y > 2.4 || a.riding || a.flight) continue;
        if ((a.x - g.hx) ** 2 + (a.z - g.hz) ** 2 > (g.leash + 3) ** 2) continue;
        const d = (a.x - g.x) ** 2 + (a.z - g.z) ** 2;
        if (d < bd) { bd = d; best = a; }
      }
      let tx, tz, speed;
      if (best) {
        g.state = 1; tx = best.x; tz = best.z; speed = CONFIG.GHOST_CHASE;
        if (bd < CONFIG.GHOST_R * CONFIG.GHOST_R && Math.abs(best.y + 1 - g.y) < 1.4) {
          // Boo: the Ooga freezes stiff (a carrier keeps its block, but the chasers catch up), and the ghost fades away.
          best.vx = best.vz = 0; best.knock = CONFIG.SPOOK_S; best.spooked = CONFIG.SPOOK_S;
          if (best.holding) { best.holding = false; emit(sim, "smash", best.team, best.id, best.x, best.y + 2, best.z); }
          emit(sim, "boo", best.team, best.id, best.x, best.y + 1.2, best.z);
          g.state = 2; g.t = CONFIG.GHOST_BACK;
          continue;
        }
      } else {
        g.state = 0; speed = CONFIG.GHOST_SPEED;
        if ((g.wx - g.x) ** 2 + (g.wz - g.z) ** 2 < 0.4) {
          const ang = sim.rng() * Math.PI * 2, rr = sim.rng() * g.leash;
          g.wx = g.hx + Math.sin(ang) * rr; g.wz = g.hz + Math.cos(ang) * rr;
        }
        tx = g.wx; tz = g.wz;
      }
      // Through walls: no collision at all.
      const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz) || 1, step = Math.min(d, speed * dt);
      g.x += dx / d * step; g.z += dz / d * step;
      g.heading = Math.atan2(dx, dz);
      g.y = (best ? best.y : 0) + 1 + Math.sin(g.phase * 2.2) * 0.25;
    }
  };
  const burst = (sim, s) => {
    const r = TOOLS[s.kind].blast;
    emit(sim, s.kind === "rocket" ? "boom" : "pop", s.team, s.owner, s.x, Math.max(0.05, s.y), s.z);
    for (const g of sim.gorillas) if (g.state !== G_STUN && (g.x - s.x) ** 2 + (g.z - s.z) ** 2 < r * r) stunGorilla(sim, g, s.owner);
    for (const g of sim.ghosts) if (g.state !== 2 && (g.x - s.x) ** 2 + (g.z - s.z) ** 2 < r * r) popGhost(sim, g, s.owner);
    for (const a of sim.actors) {
      if (a.team === s.team || !open(a)) continue;
      const dy = s.y - (a.y + 0.9);
      if ((a.x - s.x) ** 2 + (a.z - s.z) ** 2 + dy * dy < r * r) splat(sim, a, false, s);
    }
  };

  // The bots: an attacker goes for the flag and a defender waits at its gate, both breaking off to send a dropped
  // flag of theirs home or to chase the Ooga carrying it, and both throw at the nearest rival in range.
  const goal = { x: 0, z: 0 };
  // Defenders stand side by side before the gate: the first in the middle, the next either side of it.
  const guardSpread = (a) => { const k = a.slot >> 1; return k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 2.2; };
  // Of a side's attackers, the one nearest (x, z): the one that breaks off to deal with something, the rest carry on.
  const nearestAttacker = (sim, team, x, z) => {
    let best = null, bd = Infinity;
    for (const b of sim.actors) {
      if (b.team !== team || b.role !== "attack" || b.carrying || b.splat > 0) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  const botGoal = (sim, a) => {
    const own = sim.flags[a.team], theirs = sim.flags[other(a.team)], stand = ARENA.stands[a.team];
    if (sim.prep > 0) {
      // Fortifying: defenders at the gate, attackers at the halfway line.
      if (a.role === "defend") { goal.x = ARENA.guard[a.team].x + guardSpread(a); goal.z = ARENA.guard[a.team].z; }
      else { goal.x = [6, -6, 0][(a.slot >> 1) % 3]; goal.z = a.team === "blue" ? 2.5 : -2.5; }
      return;
    }
    if (a.carrying) { const gl = ARENA.goals ? ARENA.goals[a.team] : stand; goal.x = gl.x; goal.z = gl.z; return; }
    // Our block out of its stand: the defenders go for it, and so does whoever is near it or the nearest attacker; the
    // other attackers keep going for theirs, so a side doesn't all pile onto one spot.
    const ownOut = own.state === "dropped" || own.state === "flying" || (own.state === "carried" && sim.actors[own.carrier].team !== a.team);
    if (ownOut) {
      const c = own.state === "carried" ? sim.actors[own.carrier] : own;
      const near = (c.x - a.x) ** 2 + (c.z - a.z) ** 2 < 14 * 14;
      if (a.role === "defend" || near || nearestAttacker(sim, a.team, c.x, c.z) === a) { goal.x = c.x; goal.z = c.z; return; }
    }
    if (a.role === "defend") {
      let near = null, best = CONFIG.GUARD_RANGE * CONFIG.GUARD_RANGE;
      for (const b of sim.actors) {
        if (b.team === a.team || b.splat > 0) continue;
        const d = (b.x - stand.x) ** 2 + (b.z - stand.z) ** 2;
        if (d < best) { best = d; near = b; }
      }
      if (near) { goal.x = near.x; goal.z = near.z; return; }
      goal.x = ARENA.guard[a.team].x + guardSpread(a); goal.z = ARENA.guard[a.team].z;
      return;
    }
    if (theirs.state === "carried" && sim.actors[theirs.carrier].team === a.team) {
      const c = sim.actors[theirs.carrier];
      // A teammate has it but can't score till ours is home: go and get ours back.
      if (ownOut) { const o = own.state === "carried" ? sim.actors[own.carrier] : own; goal.x = o.x; goal.z = o.z; return; }
      // Otherwise one attacker walks alongside them home; the rest hold the middle for the next run.
      if (nearestAttacker(sim, a.team, c.x, c.z) === a) { goal.x = c.x + (a.x < c.x ? -2 : 2); goal.z = c.z; return; }
      goal.x = [5, -5, 0][(a.slot >> 1) % 3]; goal.z = a.team === "blue" ? 4 : -4;
      return;
    }
    // Their block lying out in the open: the nearest attacker and anyone close go for it; the rest cover from a
    // distance rather than all piling onto it.
    if (theirs.state === "dropped" && nearestAttacker(sim, a.team, theirs.x, theirs.z) !== a && (theirs.x - a.x) ** 2 + (theirs.z - a.z) ** 2 > 10 * 10) {
      const k = (a.slot >> 1) % 3, side = k === 0 ? 0 : k === 1 ? 6 : -6;
      goal.x = theirs.x + side; goal.z = theirs.z + (a.team === "blue" ? 7 : -7);
      return;
    }
    goal.x = theirs.x; goal.z = theirs.z;
  };

  // Eight headings round the wanted one, nearest first; the first that walks clear for a probe's length wins.
  const PROBE = 2.6, FANS = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI];
  const steer = (sim, a, wantX, wantZ) => {
    const dx = wantX - a.x, dz = wantZ - a.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return 0;
    if (a.y > 0.2 || clearLine(a.x, a.z, wantX, wantZ, CONFIG.BODY_R * 0.9)) return Math.atan2(dx, dz);
    // The two sides fan opposite ways, as the field is turned half round between them, so neither steers better.
    const base = Math.atan2(dx, dz), probe = Math.min(PROBE, d), hand = (a.slot % 2 ? 1 : -1) * (a.team === "blue" ? 1 : -1);
    for (let i = 0; i < FANS.length; i++) {
      const h = base + FANS[i] * hand;
      if (clearLine(a.x, a.z, a.x + Math.sin(h) * probe, a.z + Math.cos(h) * probe, CONFIG.BODY_R)) return h;
    }
    return base;
  };
  // A grenade's pitch to land about `range` metres off: the closest of a few tries by its own ballistics.
  const lobPitch = (range, kind = "grenade") => {
    const g = typeof kind === "string" ? TOOLS[kind] : kind;
    let best = 0.3, err = Infinity;
    for (let p = -0.2; p <= 0.9; p += 0.05) {
      const vy = g.lift + Math.sin(p) * g.speed, t = (vy + Math.sqrt(vy * vy + 2 * g.gravity * CONFIG.SHOT_Y)) / g.gravity;
      const e = Math.abs(Math.cos(p) * g.speed * t - range);
      if (e < err) { err = e; best = p; }
    }
    return best;
  };
  // A bot carrying a block passes it when a rival is closing in and a free teammate stands nearer home.
  const botPass = (sim, a) => {
    let near = false;
    for (const b of sim.actors) if (b.team !== a.team && open(b) && (b.x - a.x) ** 2 + (b.z - a.z) ** 2 < 16) near = true;
    if (!near) return;
    const stand = ARENA.stands[a.team], mine = Math.hypot(a.x - stand.x, a.z - stand.z);
    for (const b of sim.actors) {
      if (b === a || b.team !== a.team || !open(b)) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > 5 && d < 15 && Math.hypot(b.x - stand.x, b.z - stand.z) < mine - 3 && clearLine(a.x, a.z, b.x, b.z, 0.1, CONFIG.SHOT_Y)) {
        pass(sim, a.id, Math.atan2(b.x - a.x, b.z - a.z));
        return;
      }
    }
  };
  // ---- Finding the way (maps with a `nav`: Haunted Hollow's cellars) ----
  // The nodes of both halves, and which pairs see each other past the fixed blocks, worked out once a map.
  const navCache = {};
  const navFor = () => {
    let N = navCache[ARENA.id];
    if (N) return N;
    const pts = [...ARENA.nav.blue, ...ARENA.nav.red], n = pts.length, keep = CRATES;
    CRATES = [];
    const lvl = (p) => p[2] || 0;
    const see = Array.from({ length: n }, (_, i) => pts.map((q, j) => i !== j && lvl(pts[i]) === lvl(q) && clearLine(pts[i][0], pts[i][1], q[0], q[1], CONFIG.BODY_R * 0.8)));
    const linked = new Set();
    for (const [i, j] of ARENA.nav.links || []) { see[i][j] = see[j][i] = true; linked.add(i).add(j); }
    CRATES = keep;
    N = navCache[ARENA.id] = { pts, see, linked, dist: new Float64Array(n + 1), prev: new Int16Array(n + 1), done: new Uint8Array(n + 1), seeEnd: new Uint8Array(n) };
    return N;
  };
  // When the bot can't run straight at its goal (or is up on a yard), the next node on the shortest way there through
  // the nodes on its own floor, every half second.
  const navigate = (sim, a, dt) => {
    if (!ARENA.nav || a.riding || a.flight || a.climbing) return;
    if (a.y < 1.5 && clearLine(a.x, a.z, goal.x, goal.z, CONFIG.BODY_R * 0.9)) { a.navI = -1; return; }
    const N = navFor(), pts = N.pts, n = pts.length;
    // Heading for a stairs node, run straight at it: the steps are walked up, not steered round.
    const onStairs = (i) => N.linked.has(i) && Math.hypot(pts[i][0] - a.x, pts[i][1] - a.z) < 7;
    if (a.navI >= 0 && (a.navT -= dt) > 0 && Math.hypot(pts[a.navI][0] - a.x, pts[a.navI][1] - a.z) > 0.7) { goal.x = pts[a.navI][0]; goal.z = pts[a.navI][1]; a.botStraight = onStairs(a.navI); return; }
    a.navT = 0.5;
    // Dijkstra from the bot: node i's distance, the goal as node n.
    const { dist, prev, done, seeEnd } = N;
    // The bot is on the floor it stands on; goals are on the ground.
    const level = a.y > 1.5 ? 3 : 0;
    for (let i = 0; i < n; i++) {
      const pl = pts[i][2] || 0;
      seeEnd[i] = pl === 0 && clearLine(pts[i][0], pts[i][1], goal.x, goal.z, CONFIG.BODY_R * 0.8) ? 1 : 0;
      dist[i] = pl === level && clearLine(a.x, a.z, pts[i][0], pts[i][1], CONFIG.BODY_R * 0.8) ? Math.hypot(pts[i][0] - a.x, pts[i][1] - a.z) : Infinity;
      prev[i] = -1; done[i] = 0;
    }
    dist[n] = Infinity; prev[n] = -1; done[n] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i <= n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === n) break;
      done[u] = 1;
      const [ux, uz] = pts[u];
      if (seeEnd[u]) { const d = best + Math.hypot(goal.x - ux, goal.z - uz); if (d < dist[n]) { dist[n] = d; prev[n] = u; } }
      for (let v = 0; v < n; v++) {
        if (done[v] || !N.see[u][v]) continue;
        const d = best + Math.hypot(pts[v][0] - ux, pts[v][1] - uz);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      }
    }
    if (prev[n] < 0) {
      // No way through from here: the nearest node in sight, to get somewhere that has one.
      let near = -1, nd = Infinity;
      for (let i = 0; i < n; i++) if (dist[i] < nd) { nd = dist[i]; near = i; }
      a.navI = near;
      if (near >= 0) { goal.x = pts[near][0]; goal.z = pts[near][1]; }
      return;
    }
    // Back from the goal to the first node not already reached (one underfoot is passed on from).
    let k = prev[n], next = -1;
    while (k >= 0) { if (Math.hypot(pts[k][0] - a.x, pts[k][1] - a.z) > 0.7) next = k; k = prev[k]; }
    a.navI = next;
    if (next >= 0) { goal.x = pts[next][0]; goal.z = pts[next][1]; a.botStraight = onStairs(next); }
  };
  // ---- The expert bot's extra moves ----
  // A free crate: live, nothing on it, low enough to lift.
  const freeCrate = (sim, c, a) => c.live && !crateOn(sim, c) && c.y <= a.y + 1.2;
  const isPlug = (c, team) => { for (const [x, z] of ARENA.plug[team]) if (Math.abs(c.x - x) < 0.3 && Math.abs(c.z - z) < 0.3) return true; return false; };
  // Walk to (x, z) and, once there, lift (or set down on) the crate there.
  const crateAt = (sim, a, x, z) => {
    const d = Math.hypot(x - a.x, z - a.z);
    goal.x = x; goal.z = z;
    if (d < 2) { a.vx = a.vz = 0; grab(sim, a.id, Math.atan2(x - a.x, z - a.z)); a.botStop = true; }
  };
  // Fortifying: a defender lifts a loose crate on its own half and stacks it on the gate's plug, two stacks a round.
  const expertFortify = (sim, a) => {
    if (a.role !== "defend" || a.stacks >= 2 || a.carrying) return false;
    if (a.holding) {
      let best = null, bd = Infinity;
      for (const c of sim.crates) {
        if (!c.live || c.y > 0.1 || crateOn(sim, c) || !isPlug(c, a.team)) continue;
        const d = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      if (!best) { grab(sim, a.id, a.heading); a.stacks = 9; return true; }
      // Come at the plug from the fort side, so the stack goes on the crate, not beside it.
      const side = a.team === "blue" ? 1 : -1;
      if (Math.hypot(best.x - a.x, best.z + side * 1.4 - a.z) > 0.6 && Math.hypot(best.x - a.x, best.z - a.z) > 2) { goal.x = best.x; goal.z = best.z + side * 1.4; return true; }
      crateAt(sim, a, best.x, best.z);
      if (!a.holding) a.stacks++;
      return true;
    }
    let best = null, bd = 14 * 14;
    for (const c of sim.crates) {
      if (!freeCrate(sim, c, a) || c.y > 0.1 || isPlug(c, a.team) || (a.team === "blue" ? c.z : -c.z) < 3) continue;
      const d = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) { a.stacks = 9; return false; }
    crateAt(sim, a, best.x, best.z);
    return true;
  };
  // Climb `team`'s tower ladder and take its zipline.
  const climbAndZip = (sim, a, team) => {
    const L = ARENA.ladders[team], Z = ARENA.zips[team];
    if (a.y >= CONFIG.TOWER_TOP - 0.15 && onTower(a)) {
      goal.x = Z.ax; goal.z = Z.az;
      if (nearZip(sim, a)) zip(sim, a.id);
      return;
    }
    const mx = (L.zone[0] + L.zone[1]) / 2, mz = (L.zone[2] + L.zone[3]) / 2, foot = 0.75;
    const px = mx - L.dx * foot, pz = mz - L.dz * foot;
    if (a.climbing || Math.hypot(px - a.x, pz - a.z) < 0.6 || ladderAt(a)) {
      // At the foot: push into the ladder and climb.
      a.botClimb = true;
      goal.x = mx + L.dx; goal.z = mz + L.dz;
      a.botStraight = true;
    } else { goal.x = px; goal.z = pz; }
  };
  // The route an expert takes: the catapult or a zipline to raid, the rivals' zipline home with their block.
  const expertRoute = (sim, a, dt) => {
    a.botClimb = false;
    if (a.riding || a.flight) return false;
    const own = sim.flags[a.team], theirs = sim.flags[other(a.team)], rival = other(a.team);
    const mine = a.team === "blue" ? a.z : -a.z;
    // A route that hasn't worked out in time is dropped, and no new one is tried for a while.
    if (a.routeBan > 0) a.routeBan -= dt;
    if (a.route && (a.routeT -= dt) <= 0) { a.route = ""; a.routeBan = 20; }
    if (a.carrying) {
      // Their block in hand, deep in their end: their tower's zipline drops it in our fort, if that's much quicker.
      if (!a.route && a.routeBan <= 0 && mine < -8) {
        const L = ARENA.ladders[rival], stand = ARENA.stands[a.team];
        const fx = (L.zone[0] + L.zone[1]) / 2 - L.dx * 0.75, fz = (L.zone[2] + L.zone[3]) / 2 - L.dz * 0.75;
        const viaZip = Math.hypot(fx - a.x, fz - a.z) + 6;
        // Only with a clear run to the ladder's foot.
        if (viaZip < Math.hypot(stand.x - a.x, stand.z - a.z) * 0.6 && clearLine(a.x, a.z, fx, fz, CONFIG.BODY_R)) { a.route = "zipHome"; a.routeT = 10; }
      }
      if (a.route === "zipHome") { climbAndZip(sim, a, rival); return true; }
      return false;
    }
    if (a.route === "zipHome") a.route = "";
    if (a.role !== "attack" || own.state !== "home" || theirs.state !== "home") { a.route = ""; return false; }
    // A fresh raid from our own end picks its way in: the catapult, our zipline, or on foot.
    if (!a.route && a.routeBan <= 0 && mine > 12) {
      const roll = sim.rng();
      a.route = roll < 0.4 ? "cat" : roll < 0.75 ? "zip" : "walk"; a.routeT = 16;
    }
    if (a.route === "cat") {
      const [x, z] = ARENA.catapults[a.team][0];
      goal.x = x; goal.z = z;
      if (nearCatapult(sim, a)) launch(sim, a.id);
      return true;
    }
    if (a.route === "zip") { climbAndZip(sim, a, a.team); return true; }
    return false;
  };
  // Crates as weapons: a rival close by and a free crate at hand, lift it; holding one, throw it at them.
  const expertCrates = (sim, a, dt) => {
    if (a.carrying || a.riding || a.flight || a.climbing || !a.grounded) return;
    if (a.crateT > 0 && !a.holding) { a.crateT -= dt; return; }
    let t = null, best = 11 * 11;
    for (const b of sim.actors) {
      if (b.team === a.team || !open(b)) continue;
      const dd = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      if (dd < best && clearLine(a.x, a.z, b.x, b.z, 0.05, 1.8)) { best = dd; t = b; }
    }
    if (a.holding) {
      if (t) {
        a.crateT = 0;
        if (a.cooldown <= 0) {
          const dist = Math.sqrt(best);
          fire(sim, a.id, Math.atan2(t.x + t.vx * 0.3 - a.x, t.z + t.vz * 0.3 - a.z), lobPitch(dist, "crate"), "crate");
        }
      } else {
        // Three seconds without a target frees the hands for blocks and travel. If there is no room to set the
        // crate down yet, keep trying rather than restarting the delay.
        a.crateT -= dt;
        if (a.crateT <= -3) grab(sim, a.id, a.heading);
      }
      return;
    }
    if (!t || best > 9 * 9 || a.role === "attack" && a.route) return;
    let near = null, nd = 4.5;
    for (const c of sim.crates) {
      if (!freeCrate(sim, c, a) || isPlug(c, a.team)) continue;
      const cd = Math.hypot(c.x - a.x, c.z - a.z);
      if (cd < 2 && grab(sim, a.id, Math.atan2(c.x - a.x, c.z - a.z))) { a.crateGo = 0; a.crateT = 0; return; }
      if (cd < nd) { nd = cd; near = c; }
    }
    // One a few steps off: go and get it.
    if (near && a.crateGo <= 0) { a.crateGo = 1.5; a.crateX = near.x; a.crateZ = near.z; }
    else if (!near) a.crateT = 1;
  };
  // Wallets: an expert now and then fetches one from a machine nearby, carries it till a rival is in reach, and throws
  // it straight at them to stick it on their back.
  const expertWallets = (sim, a, dt) => {
    if (a.wallet >= 0) {
      let t = null, best = 10 * 10;
      for (const b of sim.actors) {
        if (b.team === a.team || !open(b)) continue;
        // A Golden AK holder counts as nearer: stick it on them to take the pair.
        const dd = ((b.x - a.x) ** 2 + (b.z - a.z) ** 2) * ((b.gold && !a.gold) || (b.hook && !a.hook) ? 0.4 : 1);
        if (dd < best && dd > 1 && clearLine(a.x, a.z, b.x, b.z, 0.05, 2)) { best = dd; t = b; }
      }
      if (t && a.cooldown <= 0) {
        const dist = Math.hypot(t.x - a.x, t.z - a.z), lead = dist / CONFIG.WALLET_SPEED + 0.15;
        throwWallet(sim, a.id, Math.atan2(t.x + t.vx * lead - a.x, t.z + t.vz * lead - a.z), lobPitch(dist, WALLET_THROW) - 0.08);
      }
      return;
    }
    if (a.carrying || a.holding || sim.prep > 0) return;
    if (nearVend(sim, a) && (a.vendGo > 0 || sim.rng() < 0.3)) { takeWallet(sim, a.id); a.vendGo = 0; return; }
    const goldOut = sim.actors.some((b) => b.team !== a.team && ((b.gold && !a.gold) || (b.hook && !a.hook)));
    if (a.vendGo <= 0 && sim.rng() < dt * (goldOut ? 0.3 : 0.05)) {
      for (let i = 0; i < sim.vends.length; i++) {
        const v = sim.vends[i];
        if (v.dark <= 0 && Math.hypot(v.x - a.x, v.z - a.z) < (goldOut ? 22 : 10)) { a.vendGo = goldOut ? 6 : 3; a.vendI = i; break; }
      }
    }
  };
  // A bot's hook: at a rival carrying a block, or a gorilla holding a teammate, in reach and in sight.
  const botHook = (sim, a) => {
    const range = CONFIG.HOOK_RANGE * 0.6;
    for (const b of sim.actors) {
      if (b.team === a.team || !b.carrying || b.trapped > 0 || sim.rng() > 0.02) continue;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > range || !clearLine(a.x, a.z, b.x, b.z, 0.05, 1.8)) continue;
      const lead = dist / CONFIG.HOOK_FLY;
      grapple(sim, a.id, Math.atan2(b.x + b.vx * lead - a.x, b.z + b.vz * lead - a.z), Math.atan2(b.y + 1 - chestY(a), dist));
      return;
    }
    // A loose block in reach and in sight, now and then.
    for (const f of [sim.flags.blue, sim.flags.red]) {
      if (f.state !== "dropped" || a.blocked === f.team || a.carrying || a.holding || sim.rng() > 0.02) continue;
      const dist = Math.hypot(f.x - a.x, f.z - a.z);
      if (dist > range || dist < 2 || !clearLine(a.x, a.z, f.x, f.z, 0.05, 1.8)) continue;
      grapple(sim, a.id, Math.atan2(f.x - a.x, f.z - a.z), Math.atan2(f.y + 0.8 - chestY(a), dist));
      return;
    }
    for (const g of sim.gorillas) {
      if (g.holding < 0 || g.hookCool > 0 || sim.actors[g.holding].team !== a.team) continue;
      const dist = Math.hypot(g.x - a.x, g.z - a.z);
      if (dist > range || !clearLine(a.x, a.z, g.x, g.z, 0.05, 1.8)) continue;
      grapple(sim, a.id, Math.atan2(g.x - a.x, g.z - a.z), Math.atan2(1.2 - chestY(a), dist));
      return;
    }
  };
  const thinkBot = (sim, a, dt) => {
    if (a.splat > 0 || a.trapped > 0) { a.botClimb = false; return; }
    // On its own rope a bot goes where the rope takes it.
    if (a.hk === H_BIT) { a.botClimb = false; return; }
    // Riding: no running of its own, only turning to aim and shooting (below).
    if (a.ride) {
      let t = null, best = sim.bots.range * sim.bots.range;
      for (const b of sim.actors) {
        if (b.team === a.team || !open(b)) continue;
        const dd = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
        if (dd < best) { best = dd; t = b; }
      }
      if (t) a.heading = Math.atan2(t.x - a.x, t.z - a.z);
      if (a.cooldown <= 0 && t && sim.prep <= 0) {
        a.aim += dt;
        if (a.aim >= sim.bots.aim) {
          a.aim = 0;
          const dist = Math.sqrt(best), yaw = a.heading + (sim.rng() - 0.5) * 2 * sim.bots.spread;
          fire(sim, a.id, yaw, Math.min(0.12, Math.max(-0.2, (dist - 8) * -0.006 - 0.05)), a.gold ? "gold" : "paint");
        }
      }
      return;
    }
    // A teammate calling for a rider: the nearest free bot goes and climbs on.
    for (const c of sim.actors) {
      if (c === a || c.team !== a.team || c.calling <= 0 || c.rider || a.carrying || a.rider) continue;
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > CONFIG.CALL_R) continue;
      let nearer = false;
      // Only a teammate that could actually come counts as nearer (not one splatted, trapped, riding or carrying).
      for (const b of sim.actors) if (b !== a && b !== c && b.bot && b.team === a.team && !b.ride && !b.rider && !b.carrying && canRide(b) && Math.hypot(c.x - b.x, c.z - b.z) < d) nearer = true;
      if (nearer) continue;
      if (d < CONFIG.HOP_R && hopOn(sim, a.id, c.id)) return;
      const h = steer(sim, a, c.x, c.z), sp = sim.bots.speed * 1.2;
      a.vx = Math.sin(h) * sp; a.vz = Math.cos(h) * sp;
      return;
    }
    // Over the edge: back over the nearest edge on the jetpack, steering in as soon as the feet are over the rim.
    if (!a.grabbed && (a.y < -CONFIG.RIM || !onIsland(a.x, a.z) || (a.y < 0 && inGrave(a.x, a.z)))) {
      // On the floor of an open grave: a jump first, and the jetpack lifts it the rest of the way out.
      if (a.grounded && inGrave(a.x, a.z)) a.botJump = true;
      goal.x = a.x; goal.z = a.z; clampIn(goal, 2.5);
      const h = Math.atan2(goal.x - a.x, goal.z - a.z), sp = sim.bots.speed;
      a.vx = Math.sin(h) * sp; a.vz = Math.cos(h) * sp;
      a.jetT = 0.25; a.botClimb = a.botStop = false;
      // With a hook in hand, bite the rock at the rim and be reeled back in.
      if (a.hook && !a.hk && a.hCool <= 0) { const flat = Math.hypot(goal.x - a.x, goal.z - a.z) || 1; grapple(sim, a.id, h, Math.atan2(-1.5 - chestY(a), flat)); }
      return;
    }
    const ex = sim.bots.expert;
    if (a.carrying && a.cooldown <= 0 && sim.rng() < dt * 2) botPass(sim, a);
    a.botStop = a.botStraight = false;
    if (a.detour > 0) {
      a.detour -= dt;
      goal.x = a.detourX; goal.z = a.detourZ;
      a.botClimb = false;
    } else {
      botGoal(sim, a);
      if (ex) {
        if (sim.prep > 0) { a.botClimb = false; expertFortify(sim, a); }
        else if (!expertRoute(sim, a, dt)) {
          if (a.vendGo > 0 && !a.carrying && a.wallet < 0) { a.vendGo -= dt; const v = sim.vends[a.vendI]; goal.x = v.x + (a.x > v.x ? 1 : -1); goal.z = v.z + (a.z > v.z ? 0.9 : -0.9); }
          else if (a.crateGo > 0 && !a.carrying) { a.crateGo -= dt; goal.x = a.crateX; goal.z = a.crateZ; }
        }
      }
    }
    if (ex && a.hopT > 0) a.hopT -= dt;
    // A hidden hook in easy reach on the ground: go and get it.
    if (a.detour <= 0 && !a.hook && !a.carrying && !a.botClimb && sim.prep <= 0) {
      let best = null, bd = 16 * 16;
      for (const h of sim.hooks) {
        if (h.state !== 0 || h.y > 0.5) continue;
        const dd = (h.x - a.x) ** 2 + (h.z - a.z) ** 2;
        if (dd < bd) { bd = dd; best = h; }
      }
      if (best) { goal.x = best.x; goal.z = best.z; }
    }
    // Standing on a block it can't lift yet: out of its circle first, or it would wait there for ever.
    if (a.blocked && a.detour <= 0) {
      const f = sim.flags[a.blocked];
      if (f.state === "dropped" && (f.x - a.x) ** 2 + (f.z - a.z) ** 2 < (CONFIG.PICK_R + 0.3) ** 2) { goal.x = f.x + (a.x > f.x ? 2.5 : -2.5); goal.z = f.z + (a.z > f.z ? 2.5 : -2.5); }
    }
    if (a.detour <= 0 && !a.botClimb) navigate(sim, a, dt);
    const d = Math.hypot(goal.x - a.x, goal.z - a.z);
    // An autopiloted player (`auto`, the suite's and the debug handle's) runs at the player's sprint.
    // A bot with the rivals' block sprints for home, as a visitor would.
    const speed = (a.bot === "auto" ? CONFIG.SPEED * CONFIG.SPRINT : sim.bots.speed * (a.carrying && a.carrying !== a.team ? 1.3 : 1)) * (a.rider ? CONFIG.MOUNT_SLOW : 1) * (a.carrying ? CONFIG.CARRY : 1) * (a.netted > 0 ? CONFIG.NET_SLOW : 1) * (a.boots > 0 ? CONFIG.BOOTS : 1) * (a.burnt > 0 ? CONFIG.BURN_SLOW : 1);
    // Burnt feet: a bot hops until they cool.
    if (a.burnt > 0 && a.grounded) a.botJump = true;
    if (a.botStop) a.vx = a.vz = 0;
    else if (d > 0.4) {
      const h = a.botStraight ? Math.atan2(goal.x - a.x, goal.z - a.z) : steer(sim, a, goal.x, goal.z);
      a.vx = Math.sin(h) * speed; a.vz = Math.cos(h) * speed;
      // An expert hops a wall or a crate in its way on the jetpack rather than walking round it.
      if (ex && a.grounded && a.y < 0.3 && !a.botClimb && a.hopT <= 0 && d > 3 && a.netted <= 0 && a.burnt <= 0) {
        const bh = Math.atan2(goal.x - a.x, goal.z - a.z);
        const px = a.x + Math.sin(bh) * 1.8, pz = a.z + Math.cos(bh) * 1.8;
        // Only something low enough to clear (a crate, a wall), not a building or a tower.
        if (!clearLine(a.x, a.z, px, pz, CONFIG.BODY_R) && groundAt(px, pz, 9) < 4.5) {
          a.botJump = true; a.jetT = 1.1; a.hopT = 2.2;
          a.vx = Math.sin(bh) * speed; a.vz = Math.cos(bh) * speed;
        }
      }
    } else a.vx = a.vz = 0;
    // Stuck, judged by progress toward the goal over each second: first a double jump over whatever is in the way
    // (twice), then a random spot nearby for a moment.
    a.progT += dt;
    if (a.progT >= 1) {
      a.progT = 0;
      const stalled = d > 1.5 && d > a.lastD - 0.4 && a.detour <= 0;
      a.lastD = d;
      if (stalled && a.grounded && a.tries < 2 && a.netted <= 0 && !a.botClimb && !a.botStop) {
        a.tries++;
        a.botJump = true;
        // An expert fires the jetpack on top of the jump.
        if (ex) a.jetT = 1.2; else a.jump2At = sim.time + 0.28;
      } else if (stalled) {
        a.tries = 0;
        a.detour = 1.2;
        const ang = sim.rng() * Math.PI * 2;
        goal.x = a.x + Math.sin(ang) * 5; goal.z = a.z + Math.cos(ang) * 5; clampIn(goal, 1.5);
        a.detourX = goal.x; a.detourZ = goal.z;
      } else if (!stalled) a.tries = 0;
    }
    if (a.jump2At && sim.time >= a.jump2At) { a.jump2At = 0; a.botJump = true; }
    // Throw at the nearest open rival in range, after holding them in sight for `BOT_AIM` (so a rival who runs past
    // gets a moment, and a bot just back from a splat can't throw at once): a net at a carrier, now and then a grenade
    // or a rocket, otherwise paint, leading the run a little with a seeded wobble.
    // Beaming: swing the laser toward the nearest rival in sight, at a turn a visitor could match.
    if (a.beam > 0) {
      let t = null, best = CONFIG.BEAM_LEN * CONFIG.BEAM_LEN;
      for (const b of sim.actors) {
        if (b.team === a.team || !open(b)) continue;
        const dd = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
        if (dd < best && clearLine(a.x, a.z, b.x, b.z, 0.05, 1.5)) { best = dd; t = b; }
      }
      if (t) {
        const want = Math.atan2(t.x - a.x, t.z - a.z), diff = Math.atan2(Math.sin(want - a.heading), Math.cos(want - a.heading));
        a.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      }
      return;
    }
    if (a.hook && !a.hk && a.hCool <= 0 && sim.prep <= 0) botHook(sim, a);
    // A gorilla charging this Ooga: a splat of paint stuns it (the hook, above, frees a teammate from one).
    if (a.cooldown <= 0 && sim.prep <= 0 && !a.holding && sim.rng() < dt * 1.2) {
      for (const g of sim.gorillas) {
        if (g.state !== G_CHASE) continue;
        const dd = (g.x - a.x) ** 2 + (g.z - a.z) ** 2;
        if (dd > 49 || dd < 1 || !clearLine(a.x, a.z, g.x, g.z, 0.05, CONFIG.SHOT_Y)) continue;
        fire(sim, a.id, Math.atan2(g.x - a.x, g.z - a.z), 0, "paint");
        break;
      }
    }
    if (ex && sim.prep <= 0) { expertWallets(sim, a, dt); expertCrates(sim, a, dt); }
    if (a.cooldown <= 0 && sim.prep <= 0 && !a.holding) {
      let t = null, best = sim.bots.range * sim.bots.range;
      for (const b of sim.actors) {
        if (b.team === a.team || !open(b)) continue;
        const dd = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
        if (dd < best && clearLine(a.x, a.z, b.x, b.z, 0.05, CONFIG.SHOT_Y)) { best = dd; t = b; }
      }
      a.aim = t ? a.aim + dt : 0;
      if (t && a.aim >= sim.bots.aim) {
        const dist = Math.sqrt(best), roll = sim.rng();
        // A net at a carrier, now and then a grenade or a rocket, otherwise paint (or the
        // Golden AK, if this bot holds one).
        // An expert sprays the AK instead of plain paint while its magazine lasts, holding the target between rounds.
        const kind = t.carrying && a.net > 0 ? "net" : dist > 6 && a.grenade > 0 && roll < 0.25 ? "grenade" : dist < 14 && a.rocket > 0 && roll > 0.88 ? "rocket" : a.gold ? "gold" : ex && dist < 16 && a.akMag > 0 && a.akReload <= 0 ? "ak" : "paint";
        a.aim = ex && (kind === "ak" || kind === "gold") ? sim.bots.aim : 0;
        const lead = dist / TOOLS[kind].speed;
        const yaw = Math.atan2(t.x + t.vx * lead - a.x, t.z + t.vz * lead - a.z) + (sim.rng() - 0.5) * 2 * sim.bots.spread;
        // Paint lobs flatter at range so the ball arrives near chest height; a grenade arcs to its range.
        const pitch = kind === "grenade" ? lobPitch(dist) : kind === "rocket" ? -0.03 : Math.min(0.12, Math.max(-0.12, (dist - 8) * -0.006));
        fire(sim, a.id, yaw, pitch, kind);
      }
    }
  };

  // Flags: pickups, returns and captures for one actor, and its refill at home.
  const touchFlags = (sim, a) => {
    if (a.splat > 0 || a.trapped > 0 || a.grabbed) return;
    touchHooks(sim, a);
    if (a.guard <= 0 && a.y < 0.3) {
      for (const t of sim.traps) {
        if (t.dark <= 0 && (a.x - t.x) ** 2 + (a.z - t.z) ** 2 < CONFIG.TRAP_R * CONFIG.TRAP_R) { spring(sim, a, t); return; }
      }
    }
    const stand = ARENA.stands[a.team], home = a.y < 1.4 && (a.x - stand.x) ** 2 + (a.z - stand.z) ** 2 < CONFIG.STAND_R * CONFIG.STAND_R;
    // Where a stolen block is mined: the stand, or a map's own scoring spot (`goals`) where it has one.
    const gl = ARENA.goals ? ARENA.goals[a.team] : stand, gr = ARENA.goals ? CONFIG.GOAL_R : CONFIG.STAND_R;
    // A map with its own spot scores there and at the stand both.
    const atGoal = home || (a.y < 1.4 && (a.x - gl.x) ** 2 + (a.z - gl.z) ** 2 < gr * gr);
    if (home && refill(a)) emit(sim, "refill", a.team, a.id, a.x, a.y, a.z);
    // Up a tower the rifle is in hand (`sniper` 1); stepping off leaves it on the rack.
    const up = onTower(a) ? 1 : 0;
    if (up !== a.sniper) { a.sniper = up; emit(sim, up ? "rifle" : "unrifle", a.team, a.id, a.x, a.y, a.z); }
    for (const c of sim.caches) {
      if (c.dark > 0 || Math.abs(a.y - c.y) > 0.5 || (a.x - c.x) ** 2 + (a.z - c.z) ** 2 > CONFIG.CACHE_R * CONFIG.CACHE_R) continue;
      if (refill(a)) { c.dark = CONFIG.CACHE_S; emit(sim, "cache", a.team, a.id, c.x, c.y, c.z); }
    }
    if (sim.prep > 0) return;
    // A rival tangled in a net can be robbed of the block it carries, by a touch.
    if (!a.carrying && !a.holding) for (const b of sim.actors) {
      if (b.team === a.team || !b.carrying || b.netted <= 0 || Math.abs(a.y - b.y) > 1.4 || (a.x - b.x) ** 2 + (a.z - b.z) ** 2 > 1.21) continue;
      const f = sim.flags[b.carrying];
      if (f.graceT > 0) continue;
      b.carrying = null;
      if (f.team === a.team) { a.rescues++; emit(sim, "rescue", f.team, a.id, b.x, 0, b.z); homeFlag(f); f.graceT = CONFIG.BLOCK_GRACE_S; emit(sim, "return", f.team, a.id, f.x, 0, f.z); }
      else { f.state = "carried"; f.carrier = a.id; f.homeT = 0; a.carrying = f.team; emit(sim, "pickup", f.team, a.id, b.x, 0, b.z); }
      emit(sim, "netsteal", a.team, a.id, b.x, b.y + 1, b.z, b.id);
      break;
    }
    // Running through a power-up takes it; the spot draws its next one and rests.
    for (const p of sim.powers) {
      if (p.dark > 0 || a.y > 1.2 || (a.x - p.x) ** 2 + (a.z - p.z) ** 2 > CONFIG.POWER_R * CONFIG.POWER_R) continue;
      const kind = POWERS[p.kind];
      if (kind === "boots") a.boots = CONFIG.BOOTS_S;
      else if (kind === "laser") a.laser = CONFIG.LASER_S;
      else if (kind === "monkeys") a.monkeys = CONFIG.MONKEYS_S;
      else if (kind === "halving") sim.halving[a.team] = CONFIG.HALVING_S;
      else sim.cold[a.team] = CONFIG.COLD_S;
      p.dark = CONFIG.POWER_RESPAWN;
      p.kind = Math.floor(sim.rng() * POWERS.length);
      emit(sim, "power", a.team, a.id, p.x, POWERS.indexOf(kind), p.z);
    }
    const r2 = CONFIG.PICK_R * CONFIG.PICK_R;
    if (a.blocked) {
      const f = sim.flags[a.blocked];
      if (f.state !== "dropped" || (a.x - f.x) ** 2 + (a.z - f.z) ** 2 > r2) a.blocked = null;
    }
    const own = sim.flags[a.team], theirs = sim.flags[other(a.team)];
    // Picking up: the rivals' flag from its stand or the ground, or your own team's flag where it was dropped.
    for (const f of [theirs, own]) {
      if (a.carrying || a.holding || f.state === "carried" || (f === own && f.state === "home")) continue;
      // Cold storage: a block on its own stand can't be lifted while its side's freeze lasts.
      if (f.state === "home" && sim.cold[f.team] > 0) continue;
      // Just returned: it can't change hands again for a moment (no take-and-return loop on a stand).
      if (f.graceT > 0) continue;
      if (f.state === "flying") {
        if (f.hookedBy >= 0) continue;
        // A catch: the block within reach of the body's middle, its thrower kept off it for a moment.
        if (f.thrower === a.id && f.t < CONFIG.PASS_SAFE) continue;
        const dy = f.y - (a.y + 1);
        if (dy * dy + (a.x - f.x) ** 2 + (a.z - f.z) ** 2 >= CONFIG.CATCH_R * CONFIG.CATCH_R) continue;
      } else {
        if (a.blocked === f.team) continue;
        const fy = f.state === "dropped" ? f.y : 0;
        if (a.y > fy + 1.4 || a.y < fy - 0.5 || (a.x - f.x) ** 2 + (a.z - f.z) ** 2 >= r2) continue;
      }
      // Your own block, dropped: a touch sends it straight home, as capture the flag has it.
      if (f === own) {
        a.rescues++;
        emit(sim, "rescue", f.team, a.id, f.x, 0, f.z);
        homeFlag(own);
        own.graceT = CONFIG.BLOCK_GRACE_S;
        emit(sim, "return", own.team, a.id, own.x, 0, own.z);
        continue;
      }
      f.state = "carried";
      f.carrier = a.id;
      f.homeT = 0;
      a.carrying = f.team;
      emit(sim, "pickup", f.team, a.id, f.x, 0, f.z);
    }
    // Your own flag carried back onto your stand is home again.
    if (a.carrying === a.team && home) {
      a.carrying = null;
      homeFlag(own);
      emit(sim, "return", own.team, a.id, own.x, 0, own.z);
    }
    // At home with their block while your own is away: no score yet, said once a visit to the stand.
    if (a.carrying === theirs.team && atGoal && own.state !== "home" && !a.waiting) {
      a.waiting = true;
      emit(sim, "waiting", a.team, a.id, gl.x, 0, gl.z);
    } else if (!atGoal) a.waiting = false;
    if (a.carrying === theirs.team && atGoal && own.state === "home") {
      const f = sim.flags[a.carrying];
      a.carrying = null;
      homeFlag(f);
      homeFlag(own);
      a.captures++;
      sim.score[a.team]++;
      emit(sim, "capture", a.team, a.id, a.x, 0, a.z);
      // A Golden AK for the miner while any are left.
      if (sim.goldLeft > 0 && !a.gold) {
        sim.goldLeft--;
        a.gold = true;
        emit(sim, "gold", a.team, a.id, a.x, a.y, a.z);
      }
      if (sim.score[a.team] >= sim.target) {
        sim.over = true;
        sim.winner = a.team;
        emit(sim, "win", a.team, a.id, stand.x, 0, stand.z);
      }
    }
  };

  // A grounded Ooga walking into a crate shoves it along the side it pushed, at `PUSH` of its own step; the crate
  // stops at anything else, and then the Ooga stops too.
  const pushCrates = (sim, a) => {
    if (a.y > 0.05) return;
    const r = CONFIG.BODY_R, h = CONFIG.CRATE_HALF;
    for (const c of sim.crates) {
      if (!c.live || c.y > 0.05 || crateOn(sim, c)) continue;
      const cx = Math.max(c.x - h, Math.min(a.x, c.x + h)), cz = Math.max(c.z - h, Math.min(a.z, c.z + h));
      const dx = a.x - cx, dz = a.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r || d2 < 1e-9) continue;
      const d = Math.sqrt(d2), pen = (r - d) * CONFIG.PUSH;
      const ox = c.x, oz = c.z;
      if (Math.abs(dx) > Math.abs(dz)) c.x -= Math.sign(dx) * pen; else c.z -= Math.sign(dz) * pen;
      // Back to where it was if the new spot overlaps a block, another crate or a stand.
      c.live = false;
      const ok = freeSpot(sim, c.x, c.z);
      c.live = true;
      if (!ok) { c.x = ox; c.z = oz; } else if (Math.abs(c.x - ox) + Math.abs(c.z - oz) > 1e-6) a.pushing = true;
    }
  };
  // The weather: a seeded run of clear and stormy spells, `strength` easing in and out of a storm (0 to 1).
  // Each map's chance of a stormy spell.
  const MAP_WEATHER = { fort: 0.2, town: 0.15, jungle: 0.4, haunted: 0.3 };
  const stepBolt = (sim, w, dt) => {
    if (w.boltWarn > 0) {
      if ((w.boltWarn -= dt) > 0) return;
      w.boltWarn = 0;
      emit(sim, "bolt", null, -1, w.boltX, 0, w.boltZ);
      for (const a of sim.actors) {
        if (!open(a) || a.boltCool > 0 || a.grabbed || (a.x - w.boltX) ** 2 + (a.z - w.boltZ) ** 2 > CONFIG.BOLT_R * CONFIG.BOLT_R) continue;
        a.boltCool = CONFIG.BOLT_COOL;
        splat(sim, a, false, null);
      }
      return;
    }
    if (w.kind !== "storm" || (w.boltT -= dt) > 0) return;
    let n = 0;
    for (const a of sim.actors) if (open(a) && a.boltCool <= 0 && !a.grabbed && onIsland(a.x, a.z) && a.y > -0.5) n++;
    if (!n) { w.boltT = 2; return; }
    let k = Math.floor(sim.rng() * n);
    for (const a of sim.actors) {
      if (!open(a) || a.boltCool > 0 || a.grabbed || !onIsland(a.x, a.z) || a.y <= -0.5 || k--) continue;
      w.boltX = a.x; w.boltZ = a.z;
      emit(sim, "boltwarn", a.team, a.id, a.x, 0, a.z);
      break;
    }
    w.boltWarn = CONFIG.BOLT_WARN;
    w.boltT = CONFIG.BOLT_S[0] + sim.rng() * (CONFIG.BOLT_S[1] - CONFIG.BOLT_S[0]);
  };
  const stepWeather = (sim, dt) => {
    const w = sim.weather;
    w.left -= dt;
    if (w.left <= 0) {
      // Live weather (`setLive`) holds its kind; otherwise each spell is a seeded draw.
      // Its own mix on each map; a busy network still makes a storm.
      const r = sim.rng();
      w.kind = sim.live === "storm" || r < MAP_WEATHER[sim.map] ? "storm" : "clear";
      w.left = CONFIG.WEATHER_S[0] + sim.rng() * (CONFIG.WEATHER_S[1] - CONFIG.WEATHER_S[0]);
      emit(sim, "weather", null, -1, 0, 0, 0);
    }
    w.strength += ((w.kind === "storm" ? 1 : 0) - w.strength) * Math.min(1, dt * 0.4);
    stepBolt(sim, w, dt);
  };

  // A busy Bitcoin network (`kind` "storm") brings a storm over a map's own seeded weather at once; anything else leaves
  // that weather alone.
  const setLive = (sim, kind) => {
    // Only a busy network (storm) overrides a map's own weather; calmer fees say nothing.
    kind = kind === "storm" ? "storm" : null;
    if (kind === sim.live) return false;
    sim.live = kind;
    if (kind && kind !== sim.weather.kind) sim.weather.left = 0;
    return true;
  };
  // A real Bitcoin block was just found: every quiz pad and ammo cache is ready again.
  const newBlock = (sim, height = 0) => {
    for (const t of sim.traps) t.dark = 0;
    for (const c of sim.caches) c.dark = 0;
    emit(sim, "mined", null, -1, height, 0, 0);
  };
  // Fallen all the way past the island: back in its own block zone (where its side starts, in its own fort), with a
  // full tank and a moment's fresh-paint protection. A block still in hand drops at the edge it went over, or, after
  // a wrong catapult's fling, has fallen too and goes straight home.
  const respawn = (sim, a) => {
    if (a.carrying && a.flung) { const f = sim.flags[a.carrying]; a.carrying = null; homeFlag(f); emit(sim, "return", f.team, -1, f.x, 0, f.z); }
    else if (a.carrying) dropFlag(sim, a, "edgedrop");
    a.flung = false;
    if (a.wallet >= 0) dropWallet(sim, a.id);
    // A grappling hook lost over the edge goes back into hiding.
    if (a.hook) { if (a.hk === H_REEL) hookBack(sim, a, "hookrelease"); hideHook(sim, sim.hooks[a.hook - 1]); a.hook = 0; a.hk = 0; a.hCool = 0; }
    const at = startAt(a.team, a.slot, sim.size);
    a.x = a.lastX = a.edgeX = at[0]; a.z = a.lastZ = a.edgeZ = at[1]; a.y = a.edgeY = 0;
    a.vx = a.vy = a.vz = 0; a.grounded = true; a.jumps = 0; a.flight = 0; a.riding = a.climbing = a.holding = a.jetting = false;
    a.knock = a.slip = 0; a.fuel = CONFIG.JET_FUEL; a.guard = CONFIG.RESPAWN_GUARD; a.navI = -1; a.route = ""; a.detour = 0;
    a.heading = a.team === "blue" ? Math.PI : 0;
    a.falls++;
    emit(sim, "respawn", a.team, a.id, a.x, 0, a.z);
  };
  // One fixed step. `input` is the player's: `x`, `z` a world-space move direction of length up to 1, `sprint`,
  // `jump` (a press), `crouch` (held), and optionally `face`, the yaw the player looks along. The scene throws, drops and builds through `fire`, `drop` and `build`.
  // `given` is the visitor's input. A live round's host sets `sim.inputs[id]` for each other live Ooga.
  const tick = (sim, dt, given) => {
    use(sim);
    sim.time += dt;
    const prepWas = sim.prep;
    if (sim.prep > 0) {
      sim.prep = Math.max(0, sim.prep - dt);
      if (prepWas > 0 && sim.prep === 0) emit(sim, "go", null, -1, 0, 0, 0);
    }
    stepWeather(sim, dt);
    // Each step takes the four in the other order from the last, so neither side always moves, picks up or reaches a
    // dropped block first.
    sim.flip = !sim.flip;
    const N = sim.actors.length;
    for (let n = 0; n < N; n++) {
      const a = sim.actors[sim.flip ? N - 1 - n : n];
      const input = (sim.inputs && sim.inputs[a.id]) || given;
      if (a.cooldown > 0) a.cooldown -= dt;
      if (a.monkeyCool > 0) a.monkeyCool -= dt;
      if (a.boltCool > 0) a.boltCool -= dt;
      if (a.hCool > 0) a.hCool -= dt;
      if (a.flingT > 0) a.flingT = a.grounded ? 0 : a.flingT - dt;
      if (a.hk) { a.hookHold = !a.bot && !!input.crouch; stepHook(sim, a, dt); }
      // Status clocks belong to every actor, including mounted riders and grabbed actors that return early.
      if (a.knock > 0) a.knock = Math.max(0, a.knock - dt);
      if (a.soot > 0) a.soot = Math.max(0, a.soot - dt);
      if (a.boots > 0) a.boots = Math.max(0, a.boots - dt);
      if (a.laser > 0) a.laser = Math.max(0, a.laser - dt);
      if (a.beam > 0) stepBeam(sim, a, dt);
      if (a.monkeys > 0) a.monkeys = Math.max(0, a.monkeys - dt);
      if (a.akReload > 0 && (a.akReload -= dt) <= 0) { a.akReload = 0; a.akMag = CONFIG.AK_MAG; emit(sim, "reloaded", a.team, a.id, a.x, a.y, a.z); }
      if (a.netted > 0) { a.netted -= dt; if (a.netted <= 0) { a.netted = 0; emit(sim, "unnet", a.team, a.id, a.x, a.y, a.z); } }
      if (a.splat > 0) {
        a.splat -= dt;
        a.vx = a.vz = 0;
        if (a.splat <= 0) { a.splat = 0; a.guard = CONFIG.GUARD_S; emit(sim, "clean", a.team, a.id, a.x, 1, a.z); }
      } else if (a.trapped > 0) {
        a.trapped -= dt;
        a.vx = a.vz = 0;
        if (a.bot && a.think > 0 && (a.think -= dt) <= 0) escape(sim, a.id);
        else if (a.trapped <= 0) { a.trapped = 0.001; escape(sim, a.id, "timeout"); }
      } else if (a.guard > 0) a.guard = Math.max(0, a.guard - dt);
      a.painted = Math.max(0, a.painted - dt * 0.05);
      // Slipping on a peel: the Ooga spins and slides, out of control, until it finds its feet.
      if (a.slip > 0) {
        a.slip = Math.max(0, a.slip - dt);
        a.heading += CONFIG.SLIP_SPIN * dt * (a.slip / CONFIG.SLIP_S + 0.2);
        const k = Math.max(0, 1 - 2.2 * dt);
        a.vx *= k; a.vz *= k;
        if (a.slip === 0) emit(sim, "steady", a.team, a.id, a.x, a.y, a.z);
      }
      // On a teammate's back: carried along, facing where it likes; a jump (or trouble below) puts it down.
      if (a.ride) {
        const m = sim.actors[a.ride - 1];
        let off = !m || m.rider !== a.id + 1 || !canStay(a) || !canStay(m);
        // A jump gets down, unless the rider is splatted or stuck in a quiz.
        if (!a.bot && input.jump) { if (a.splat <= 0 && a.trapped <= 0) off = true; input.jump = 0; }
        if (off) hopOff(sim, a, !!m && canStay(a));
        else {
          if (a.bot) thinkBot(sim, a, dt);
          else if (input.face !== undefined) a.heading = input.face;
          const at = rideAt(m);
          a.x = at.x; a.z = at.z; a.y = at.y;
          a.vx = m.vx; a.vz = m.vz; a.vy = 0; a.grounded = false; a.jumps = 0; a.moving = 0;
          if (a.carrying) { const f = sim.flags[a.carrying]; f.x = a.x; f.z = a.z; }
          continue;
        }
      }
      if (a.calling > 0) a.calling -= dt;
      // Held by a gorilla: no moving or throwing, only struggling. The meter drains; each distinct press (the scene
      // arms `jump` once per key-down, and it's spent here) adds one, and full is free.
      if (a.grabbed) {
        const gb = sim.bots.gorilla;
        let push = false;
        if (a.bot) push = sim.rng() < dt * gb.mash;
        else { push = !!input.jump; input.jump = 0; }
        a.grabFill = Math.max(0, a.grabFill - gb.drain * dt);
        if (push) {
          if (++a.grabFill >= gb.need) letGo(sim, sim.gorillas[a.grabbed - 1], a, true);
          else emit(sim, "struggle", a.team, a.id, a.x, a.y, a.z);
        }
        a.moving = 0;
        if (a.grabbed) continue;
      }
      const free = a.splat <= 0 && a.trapped <= 0;
      let jump = false;
      if (a.spooked > 0) { a.spooked -= dt; a.vx = a.vz = 0; }
      if (a.slip > 0 || a.flight === 1 || a.knock > 0) {
        // No steering, no jumping: the slide (or the catapult's throw) carries on.
        if (!a.bot) input.jump = 0;
        a.botJump = false;
      } else if (a.bot) {
        thinkBot(sim, a, dt);
        jump = a.botJump;
        a.botJump = false;
      } else if (free) {
        a.crouch = !!input.crouch && a.grounded;
        // Sprint: Shift held, moving, not crouched or netted, while there's stamina. It runs out after `SPRINT_S`, then
        // refills after a short rest; run it dry and it must refill to `SPRINT_MIN` before it works again.
        const wants = !!input.sprint && !a.crouch && a.netted <= 0 && (input.x !== 0 || input.z !== 0);
        a.sprinting = wants && !a.tired && a.stamina > 0;
        if (a.sprinting) {
          a.stamina = Math.max(0, a.stamina - dt);
          a.rest = CONFIG.SPRINT_REST;
          if (a.stamina === 0) { a.tired = true; emit(sim, "winded", a.team, a.id, a.x, a.y, a.z); }
        } else if (a.rest > 0) a.rest -= dt;
        else {
          a.stamina = Math.min(CONFIG.SPRINT_S, a.stamina + dt * CONFIG.SPRINT_S / CONFIG.SPRINT_REFILL);
          if (a.tired && a.stamina >= CONFIG.SPRINT_S * CONFIG.SPRINT_MIN) a.tired = false;
        }
        const speed = CONFIG.SPEED * (a.rider ? CONFIG.MOUNT_SLOW : 1) * (a.crouch ? CONFIG.CROUCH_SPEED : 1) * (a.sprinting ? CONFIG.SPRINT : 1) * (a.carrying ? CONFIG.CARRY : 1) * (a.netted > 0 ? CONFIG.NET_SLOW : 1) * (a.boots > 0 ? CONFIG.BOOTS : 1) * (a.burnt > 0 ? CONFIG.BURN_SLOW : 1) * (a.flight === 2 ? CONFIG.CHUTE_SPEED / CONFIG.SPEED : 1);
        // On a rope the Ooga swings: the air gives it only a nudge.
        const tx = input.x * speed, tz = input.z * speed, k = Math.min(1, CONFIG.ACCEL * dt) * (!a.grounded && (a.hk === H_BIT || a.flingT > 0) ? (input.x || input.z ? CONFIG.HOOK_AIR : 0) : 1);
        a.vx += (tx - a.vx) * k;
        a.vz += (tz - a.vz) * k;
        // A press is used once: the first substep that sees it takes it, so one press is one jump, and the second
        // press in the air is the double jump.
        jump = !!input.jump;
        input.jump = 0;
      }
      // Flung by a catapult: no steering, nothing in the way, until the top of the arc opens the parachute.
      if (a.flight === 1) {
        a.vy -= CONFIG.FALL * dt;
        a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
        a.moving = 0;
        if (a.vy <= 0) {
          a.flight = 2;
          a.vx *= 0.08; a.vz *= 0.08; a.vy = -CONFIG.CHUTE_FALL;
          emit(sim, "chute", a.team, a.id, a.x, a.y, a.z);
        }
        if (a.carrying) { const f = sim.flags[a.carrying]; f.x = a.x; f.z = a.z; }
        continue;
      }
      // On a zipline the cable carries you; a jump lets go.
      if (a.riding) {
        ride(sim, a, dt, jump && free);
        a.moving = CONFIG.ZIP_SPEED;
        if (a.carrying) { const f = sim.flags[a.carrying]; f.x = a.x; f.z = a.z; }
        continue;
      }
      // A jump lets go of a bitten hook, with a little hop for the way off it.
      // A jump in the air drops the parachute.
      if (jump && a.flight === 2) { cutChute(sim, a.id); jump = false; }
      if (jump && a.hk === H_BIT) { hookBack(sim, a, "hookrelease"); a.vy = Math.max(a.vy, CONFIG.HOOK_HOP); jump = false; }
      // A jump from the ground, and one more in the air, carrying or not; a net stops both.
      if (jump && free && a.netted <= 0 && !a.flight) {
        const k = a.carrying ? CONFIG.CARRY_JUMP : 1;
        if (a.grounded) {
          a.vy = CONFIG.JUMP * k; a.grounded = false; a.jumps = 1;
          emit(sim, "jump", a.team, a.id, a.x, a.y, a.z);
          // Each hop cools burnt feet a little; enough of them and the Ooga can run again.
          if (a.burnt > 0 && --a.burnt === 0) emit(sim, "cooled", a.team, a.id, a.x, a.y, a.z);
        }
        else if (a.jumps > 0) { a.vy = CONFIG.JUMP2 * k; a.jumps = 0; emit(sim, "jump2", a.team, a.id, a.x, a.y, a.z); }
      }
      a.x += a.vx * dt;
      a.z += a.vz * dt;
      // Fortifying keeps each side to its own half.
      if (sim.prep > 0) {
        if (a.team === "blue" && a.z < 1) a.z = 1;
        else if (a.team === "red" && a.z > -1) a.z = -1;
      }
      a.pushing = false;
      pushCrates(sim, a);
      // On foot, a stair (a box no higher than `STEP_UP`) is walked up rather than walked into.
      const stepUp = a.grounded ? CONFIG.STEP_UP : 0.05;
      resolve(a, CONFIG.BODY_R, stepUp);
      // The jetpack, every Ooga's as on the island: Space held in the air, once the jump has lost its lift, thrusts up on
      // the fuel; standing, the tank refills.
      if (a.jetT > 0) a.jetT -= dt;
      a.jetting = free && (a.bot ? a.jetT > 0 : !!input.jet) && !a.grounded && !a.flight && !a.riding && a.netted <= 0 && a.burnt <= 0 && a.slip <= 0
        && a.fuel > 0 && a.vy < 1.5 && a.y < CONFIG.JET_CEILING;
      if (a.jetting) a.fuel = Math.max(0, a.fuel - dt);
      else if (a.grounded && a.fuel < CONFIG.JET_FUEL) a.fuel = Math.min(CONFIG.JET_FUEL, a.fuel + dt * CONFIG.JET_FUEL / CONFIG.JET_REFILL);
      // A ladder: pushing into a tower's ladder climbs it, and at the top steps onto the platform.
      const ladder = (!a.bot || a.botClimb) && free && a.netted <= 0 && !a.holding && !a.grabbed ? ladderAt(a) : null;
      a.climbing = !!ladder && (a.bot ? a.botClimb : input.x * ladder.dx + input.z * ladder.dz > 0.3);
      // Height: fall onto whatever is underneath, and stop at a floor overhead.
      const ground = groundAt(a.x, a.z, a.y + (stepUp > 0.05 ? stepUp : 0));
      if (a.climbing) {
        // Held to the climb's line across, free along it.
        if (ladder.dx) a.x = (ladder.zone[0] + ladder.zone[1]) / 2; else a.z = (ladder.zone[2] + ladder.zone[3]) / 2;
        a.vx = a.vz = a.vy = 0;
        a.y = Math.min(ladder.top, a.y + CONFIG.CLIMB * dt);
        a.grounded = false;
        a.jumps = 0;
        if (a.y >= ladder.top) {
          a.x += ladder.dx * 0.9; a.z += ladder.dz * 0.9;
          a.grounded = true; a.climbing = false;
          emit(sim, "climbed", a.team, a.id, a.x, a.y, a.z);
        }
      } else if (a.vy !== 0 || a.y > ground) {
        // Under a parachute the fall is a steady drift.
        if (a.flight === 2) a.vy = -CONFIG.CHUTE_FALL; else a.vy -= CONFIG.FALL * dt;
        if (a.jetting) a.vy = Math.min(CONFIG.JET_RISE, a.vy + CONFIG.JET_ACCEL * dt);
        a.y += a.vy * dt;
        const ceiling = ceilingAt(a.x, a.z, a.y - a.vy * dt);
        if (a.vy > 0 && a.y + heightOf(a) > ceiling) { a.y = ceiling - heightOf(a); a.vy = 0; }
        if (a.y <= ground) {
          if (!a.grounded && a.vy < -1) emit(sim, "land", a.team, a.id, a.x, ground, a.z);
          if (a.flight) { a.flight = 0; emit(sim, "touchdown", a.team, a.id, a.x, ground, a.z); }
          a.y = ground; a.vy = 0; a.grounded = true; a.jumps = 0;
        } else a.grounded = false;
      } else { a.y = ground; a.grounded = true; }
      // A bitten hook holds the Ooga to the rope; never through the floor.
      if (a.hk === H_BIT && BL.grapple.tether(a, CONFIG.SHOT_Y, a.hookTip.x, a.hookTip.y, a.hookTip.z, a.hookLen)) {
        const below = groundAt(a.x, a.z, a.y + 0.1);
        if (a.y <= below) { a.y = below; a.vy = Math.max(a.vy, 0); a.grounded = true; } else a.grounded = false;
      }
      // The open edge: where an Ooga last stood on the island is where a block it carries over the edge drops; one gone
      // down under the top lets go of it, and one fallen all the way comes back home.
      if (a.grounded && a.y > -CONFIG.RIM && onIsland(a.x, a.z)) { a.edgeX = a.x; a.edgeY = a.y; a.edgeZ = a.z; a.flung = false; }
      else if (a.carrying && !a.flung && a.y < -CONFIG.RIM && !inGrave(a.x, a.z)) dropFlag(sim, a, "edgedrop");
      if (a.y < CONFIG.FALL_FLOOR) { respawn(sim, a); continue; }
      // The campfire: feet in it burn, and burnt feet take `BURN_HOPS` jumps to cool.
      if (a.grounded && a.y < 0.05 && free && a.burnt <= 0 && (a.x - ARENA.fire[0]) ** 2 + (a.z - ARENA.fire[1]) ** 2 < CONFIG.FIRE_R * CONFIG.FIRE_R) {
        a.burnt = CONFIG.BURN_HOPS;
        a.vy = 4.5; a.grounded = false; a.jumps = 0;
        emit(sim, "burn", a.team, a.id, a.x, 0, a.z);
      }
      // A banana peel underfoot: a slide and a spin, and whatever block was in hand goes flying out of it.
      if (a.grounded && a.y < 0.1 && free && a.slip <= 0) {
        for (const p of sim.peels) {
          if (p.dark > 0 || (a.x - p.x) ** 2 + (a.z - p.z) ** 2 > CONFIG.PEEL_R * CONFIG.PEEL_R) continue;
          a.slip = CONFIG.SLIP_S;
          a.vx *= 1.3; a.vz *= 1.3;
          p.dark = CONFIG.PEEL_REARM;
          if (a.holding) { a.holding = false; emit(sim, "smash", a.team, a.id, a.x, a.y + 2, a.z); }
          emit(sim, "slip", a.team, a.id, a.x, 0, a.z);
          dropFlag(sim, a, "knock");
          break;
        }
      }
      // A jungle puddle underfoot: a short slide, the block kept.
      if (a.grounded && a.y < 0.1 && free && a.slip <= 0) for (const p of sim.puddles) {
        if (p.dark > 0 || (a.x - p.x) ** 2 + (a.z - p.z) ** 2 > CONFIG.PUDDLE_R * CONFIG.PUDDLE_R) continue;
        a.slip = 0.8; p.dark = CONFIG.PUDDLE_REARM;
        emit(sim, "puddle", a.team, a.id, a.x, 0, a.z);
        break;
      }
      if (a.grounded && a.y < 0.05 && free && a.netted <= 0 && trampAt(a)) {
        a.vy = CONFIG.BOUNCE; a.grounded = false; a.jumps = 1;
        emit(sim, "boing", a.team, a.id, a.x, 0, a.z);
      }
      const sp = Math.hypot(a.vx, a.vz);
      a.moving = sp;
      // The player faces where they aim (`input.face`, the camera's yaw) when the scene gives it; everyone else faces
      // where they run, unless they just threw.
      if (a.slip > 0) { /* spinning: the heading turns by itself */ }
      else if (!a.bot && free && input.face !== undefined) a.heading = input.face;
      else if (sp > 0.5 && a.beam <= 0 && a.cooldown <= (a.bot ? sim.bots.cool : TOOLS.paint.cool) - 0.25) a.heading = Math.atan2(a.vx, a.vz);
      if (a.carrying) { const f = sim.flags[a.carrying]; f.x = a.x; f.z = a.z; }
    }
    for (let n = 0; n < N; n++) touchFlags(sim, sim.actors[sim.flip ? N - 1 - n : n]);
    for (const t of sim.traps) if (t.dark > 0) t.dark -= dt;
    if (sim.gorillas.length) stepGorillas(sim, dt);
    if (sim.ghosts.length) stepGhosts(sim, dt);
    stepWallets(sim, dt);
    for (const c of sim.caches) if (c.dark > 0) c.dark = Math.max(0, c.dark - dt);
    for (const p of sim.powers) if (p.dark > 0) p.dark = Math.max(0, p.dark - dt);
    for (const p of sim.peels) if (p.dark > 0) p.dark = Math.max(0, p.dark - dt);
    for (const p of sim.puddles) if (p.dark > 0) p.dark -= dt;
    for (const t of TEAMS) {
      if (sim.halving[t] > 0) sim.halving[t] = Math.max(0, sim.halving[t] - dt);
      if (sim.cold[t] > 0) sim.cold[t] = Math.max(0, sim.cold[t] - dt);
    }
    for (const t of TEAMS) {
      const f = sim.flags[t];
      if (f.graceT > 0) f.graceT -= dt;
      if (f.state === "flying") flyFlag(sim, f, dt);
      // A block dropped at the edge goes home by itself.
      else if (f.state === "dropped" && f.homeT > 0 && (f.homeT -= dt) <= 0) { homeFlag(f); emit(sim, "return", f.team, -1, f.x, 0, f.z); }
    }
    settleCrates(sim, dt);
    // Throws in flight: gravity, then a rival in the way or anything solid.
    for (const s of sim.shots) {
      if (!s.live) continue;
      const tool = TOOLS[s.kind];
      s.t += dt;
      if (s.kind === "homer") {
        // A heat-seeker steers for its rival's chest, finding another if that one is splatted or trapped.
        let t = s.target >= 0 ? sim.actors[s.target] : null;
        if (!t || !open(t)) { s.target = seekTarget(sim, s); t = s.target >= 0 ? sim.actors[s.target] : null; }
        if (t && s.t > 0.15) {
          const dx = t.x - s.x, dy = t.y + 1 - s.y, dz = t.z - s.z, d = Math.hypot(dx, dy, dz) || 1, sp = tool.speed, k = Math.min(1, CONFIG.HOMER_TURN * dt);
          s.vx += (dx / d * sp - s.vx) * k; s.vy += (dy / d * sp - s.vy) * k; s.vz += (dz / d * sp - s.vz) * k;
          const v = Math.hypot(s.vx, s.vy, s.vz) || 1;
          s.vx *= sp / v; s.vy *= sp / v; s.vz *= sp / v;
        }
      }
      s.vy -= tool.gravity * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      let hit = null;
      for (const a of sim.actors) {
        if (a.team === s.team || !open(a)) continue;
        // A crate is big: it counts a little over the head and under the feet.
        const dy = s.y - a.y, slack = s.kind === "crate" ? 0.45 : s.kind === "net" ? 0.9 : 0.15;
        if (dy > -slack && dy < heightOf(a) + slack && (s.x - a.x) ** 2 + (s.z - a.z) ** 2 < tool.r * tool.r) { hit = a; break; }
      }
      // A gorilla in the way takes it, stunned.
      // A ghost in the way pops.
      if (!hit && sim.ghosts.length) {
        let gh = null;
        for (const g of sim.ghosts) if (g.state !== 2 && Math.abs(s.y - g.y) < 0.9 && (s.x - g.x) ** 2 + (s.z - g.z) ** 2 < 0.8) { gh = g; break; }
        if (gh) { s.live = false; if (tool.blast) burst(sim, s); popGhost(sim, gh, s.owner); continue; }
      }
      if (!hit && s.kind !== "net" && s.kind !== "crate") {
        let gHit = null;
        for (const g of sim.gorillas) if (g.state !== G_STUN && s.y < 2.3 && (s.x - g.x) ** 2 + (s.z - g.z) ** 2 < 0.95) { gHit = g; break; }
        if (gHit) {
          s.live = false;
          if (tool.blast) burst(sim, s);
          // A sharp gorilla dodges paint (the bots' skill sets how sharp).
          else if ((gHit.state !== G_ROAM && gHit.state !== G_CHASE) || sim.rng() >= sim.bots.gorilla.dodge) stunGorilla(sim, gHit, s.owner);
          continue;
        }
      }
      const solid = !hit && solidAt(s.x, s.y, s.z), spent = s.t > tool.life;
      if (!hit && !solid && !spent) continue;
      s.live = false;
      if (tool.blast) burst(sim, s);
      else if (hit && s.kind === "net") {
        hit.netted = CONFIG.NET_S;
        emit(sim, "net", hit.team, hit.id, hit.x, hit.y + 1, hit.z);
      } else if (hit) splat(sim, hit, s.kind === "crate", s);
      if (s.kind === "crate") landCrate(sim, s);
      else if (!hit) emit(sim, s.kind === "net" ? "netmiss" : "miss", s.team, s.owner, s.x, Math.max(0.02, s.y), s.z);
    }
  };
  // Advance by any frame time in fixed substeps (at most four a call, as the other games do). Stops when the round is
  // decided.
  const step = (sim, dt, input) => {
    sim.acc = Math.min(sim.acc + dt, CONFIG.STEP * 4);
    while (sim.acc >= CONFIG.STEP && !sim.over) {
      sim.acc -= CONFIG.STEP;
      tick(sim, CONFIG.STEP, input);
    }
  };
  // What the scene's play strip shows, kept as plain values in a `view` made once a visit (`stripView`): both scores,
  // both blocks' states, whether the visitor's Ooga carries, holds or is splatted, the whole seconds of the round's
  // clock the strip prints, and the whole seconds left on each power-up it lists. `stripChanged` reads them from the
  // sim and returns true, keeping the new values, only when one differs from the last call, so the scene touches the
  // strip only then; clearing `view.shown` makes the next call true (a new round, a new visit). Allocates nothing.
  const stripView = () => ({ shown: false, blue: 0, red: 0, own: "", theirs: "", carrying: false, holding: false, splat: false, second: 0, boots: 0, laser: 0, monkeys: 0, halving: 0, cold: 0 });
  const left = (s) => s > 0 ? Math.ceil(s) : 0;
  const stripChanged = (sim, v) => {
    const me = sim.actors[0], own = sim.flags[sim.team].state, theirs = sim.flags[sim.rival].state;
    const blue = sim.score.blue, red = sim.score.red, carrying = !!me.carrying, holding = !!me.holding, splatted = me.splat > 0;
    const second = Math.floor(sim.time), boots = left(me.boots), laser = left(me.laser), monkeys = left(me.monkeys);
    const halving = left(sim.halving[sim.team]), cold = left(sim.cold[sim.team]);
    if (v.shown && v.blue === blue && v.red === red && v.own === own && v.theirs === theirs && v.carrying === carrying && v.holding === holding
      && v.splat === splatted && v.second === second && v.boots === boots && v.laser === laser && v.monkeys === monkeys && v.halving === halving && v.cold === cold) return false;
    v.shown = true; v.blue = blue; v.red = red; v.own = own; v.theirs = theirs; v.carrying = carrying; v.holding = holding; v.splat = splatted;
    v.second = second; v.boots = boots; v.laser = laser; v.monkeys = monkeys; v.halving = halving; v.cold = cold;
    return true;
  };
  BL.blockSim = { settleHooks, parachuteIn, LEAF_TOP, stripView, stripChanged, hopOn, callRide, WALLETS, takeWallet, throwWallet, dropWallet, nearVend, CONFIG, TOOLS, KINDS, SKILLS, POWERS, ARENAS, MAPS, TEAMS, other, create, reset, step, tick, setLive, newBlock, launch, nearCatapult, nearEnemyCatapult, fire, drop, pass, build, grab, zip, nearZip, onTower, escape, clearLine, solidAt, resolve, groundAt, onIsland, isleDepth, grapple, restSpot, edgeDist, cutChute, inGrave, inGraveOf, GRAVE_Y };
  // The map last stepped (or reset), for the scene's and models' reads.
  Object.defineProperty(BL.blockSim, "ARENA", { get: () => ARENA, enumerable: true });
})();
