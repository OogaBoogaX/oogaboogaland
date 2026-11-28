// Ooga Raid's stage 7, Bifrost Pass: its own enemies and its boss, the Bailout Mech and its two crate pods, registered
// with `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no state of its
// own: each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and allocates nothing
// but what a spawn helper does once an event.
//
// Built from the stage specs' state machines (untracked/ooga-raid-stage-specs/README.md) for stage 7, Bifrost
// Pass (stage-7.md), with the Mech's pods lowered onto its armour and its gun inside it (see MECH below).
//
//   SHARD_THROWER  fodder, a trooper in a parka with a sling of ice. It stands facing the nearest Ooga, and SHARD_FIRST
//                  after it appears and then every SHARD_GAP (dealt from the dice between three quarters and five quarters
//                  of it) throws a shard (a LOB, attr 2) to land at that Ooga's feet after SHARD_FLIGHT, which bursts
//                  along the ground both ways and straight up where it lands. A lob's speed along x is held to the sim's
//                  LOB_VX_MAX, so a shard thrown at an Ooga past about 6.4 m falls short.
//   ICICLE         fodder, a crystal spike hanging under an arch. Placed in the cell it hangs in, it sets its height to
//                  ICICLE_HANG under that cell's top as it starts. When an Ooga in play passes under it within
//                  ICICLE_TRIGGER along x it shivers for ICICLE_SHIVER, then falls at ICICLE_G and, on the first cell top
//                  that is not empty, bursts into two shots skittering along the ground either way from ICICLE_BURST over
//                  it, and is gone. It can be shot down hanging, shivering or falling.
//   DROP_CRATE     fodder, a supply crate under a paper parachute. Launched by a pod or the open Mech (`launch`) toward
//                  the nearest Ooga's x, to reach it in CRATE_REACH (its speed along x held to CRATE_VX), at CRATE_VY up,
//                  it rises under CRATE_G, then opens its chute and drifts down at CHUTE_V keeping its speed along x (a
//                  wall stops that); where it lands on a cell top that is not empty it drops two RUNNERs CRATE_SPREAD
//                  either side and is gone. Shot down first, it drops nobody. At most CRATE_CAP fly, the pods' and the
//                  Mech's together.
//   MECH_POD       an emplacement and a machine: a crate rack on the Mech's shoulders, a part on its MECH_POD_MOUNTS
//                  (attr 0 the front, 1 the rear), which sit on the Mech's armour box. Its first crate MECH_CRATE times
//                  half (the front) or whole (the rear), then every MECH_CRATE.
//   MECH           the Bailout Mech, the boss main: armour tier (its box can be neither walked through nor jumped), a
//                  machine, its hit points by the boss formula (`scaled`), SHUT until both pods fall. From its first step
//                  the run is in PHASE.BOSS and it mounts its two pods (tried each step until slots are free, the vault's
//                  mount-and-wait, `eAttr` counting those mounted). It walks between MECH_LEFT left of its record's x and
//                  MECH_RIGHT right of it at MECH_V (MECH_OPEN_V once open), setting off toward the far end (left), and at
//                  each end stomps a SPARK MECH_STOMP either side of it along the floor, one each way, and pauses
//                  MECH_PAUSE. Its chin gun fires from MECH_MUZZLE, inside its armour: an aimed shot MECH_FIRST after it
//                  comes and every MECH_GUN while shut; once open, a spread of three (the aim and a step either side)
//                  every MECH_GUN_OPEN, and a crate of its own from MECH_HATCH (the top of its armour) every
//                  MECH_CRATE_OPEN. It touches an Ooga in any pose with its standing touch box (`standTouch`), so an Ooga
//                  lying under its feet is crushed, as one standing would be. Its fall clears the stage (`bossBreak`).
//                  `evy` holds the left end of its range, `eAim` its heading (0 right, AIMS / 2 left), `evx` the seconds
//                  its pause has left, and `eTimer` its clock: seconds since it came, from 0 again when it opens, by which
//                  its gun and crates keep time.
//
// Every attack is told (raid-enemies.js's `tell`): FLAG.WIND for the last TELL_FOR of a thrower's and a pod's timers; an
// icicle from its shiver through its fall (its `charge`) to its burst; the Mech for the last TELL_FOR of its gun's gap
// shut, FLAG.WIND and FLAG.BIG for the last TELL_FOR_BIG of it open (the spread, a big attack), FLAG.WIND for the last
// TELL_FOR before an open crate, and FLAG.WIND and FLAG.BIG as it walks the last MECH_OPEN_V * TELL_FOR_BIG metres to a stomp
// (at least TELL_FOR_BIG at either speed).
// In the boss fight the sim keeps TUNE.BOSS_RESERVE slots for shots from everything with hit points that is no boss main or
// part (crates and their runners among them), so the gun's spread and the stomp's two sparks find theirs. The Mech's
// pods wait for slots, as the vault's guns do. Nothing fires, throws, stomps or launches while the sim's `attack` is 0, but
// everything moves; an icicle's burst is its own breaking, as a lob's is, and comes regardless. `BL.raidLegionPass.TUNE`
// holds their numbers and `LOOK` the routine index of each state a look depends on, `LOOK[NAME][state]` by the README's
// state names (the art reads them).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY, KIND, CELL } = BL.raidStages;
  const { FLAG, register, lobAt, aimShotOff, shotAlong, mount, bossBreak, dieStart, dieFade, release, tell, TELL_FOR, TELL_FOR_BIG } = BL.raidEnemies;

  // The Mech's pods sit on its armour box: the armour tier's bullet box tops out 0.96875 m over the Mech's box origin
  // (1.6 m over its feet), 2.56875 m over its feet, and an emplacement's bullet box is 0.34375 m either side of its middle,
  // so a pod's middle at 2.9125 m over the Mech's feet sets its box flush on the Mech's (the suite holds it to the sim's
  // boxes). Its gun's muzzle stands inside the armour box, at the nose of its brow.
  const POD_Y = 2.9125;
  const POD_MOUNTS = Object.freeze([Object.freeze([-0.6, POD_Y]), Object.freeze([0.6, POD_Y])]);
  const TUNE = Object.freeze({
    SHARD_FIRST: 1, SHARD_GAP: 2, SHARD_FLIGHT: 0.8,
    ICICLE_HANG: 0.3, ICICLE_TRIGGER: 1.2, ICICLE_SHIVER: 0.35, ICICLE_G: 18, ICICLE_BURST: 0.1,
    CRATE_REACH: 1.5, CRATE_VX: 3, CRATE_VY: 5, CRATE_G: 9, CHUTE_V: 1, CRATE_SPREAD: 0.3, CRATE_CAP: 2,
    MECH_CRATE: 4,
    MECH_LEFT: 1.75, MECH_RIGHT: 0.35, MECH_V: 0.6, MECH_OPEN_V: 0.9, MECH_STOMP: 1.4, MECH_PAUSE: 1.4,
    MECH_FIRST: 1.5, MECH_GUN: 2, MECH_GUN_OPEN: 1.4, MECH_CRATE_OPEN: 5,
    MECH_POD_MOUNTS: POD_MOUNTS, MECH_MUZZLE: Object.freeze([-1.3, 2.47]), MECH_HATCH: Object.freeze([0, 2.6])
  });
  const next = (s, i) => { s.eRoutine[i]++; };
  const EPS = 1e-4;
  // The shots' aims, of the sim's twelve: along the ground right and left; the sparks' attrs, right and left.
  const RIGHT = 0, LEFT = 6, SPARK_RIGHT = 0, SPARK_LEFT = 1;

  // The highest cell top a body at x crossed going down from `from` to the slot's y this step that is not empty, written
  // into the slot's y; true when there was one. Event code apart from the loop, which reads cells in place.
  const landed = (ctx, i, from) => {
    const s = ctx.state, y = s.ey[i], col = Math.floor(s.ex[i] / CELL);
    for (let r = Math.floor(from / CELL + EPS); r * CELL > y; r--) {
      if (ctx.cellAt(col, r - 1) === KIND.EMPTY) continue;
      s.ey[i] = r * CELL;
      return true;
    }
    return false;
  };
  // The crates flying (not destroyed).
  const CRATE_DESTROYED = 3, POD_DESTROYED = 2;
  const crates = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.DROP_CRATE && s.eRoutine[j] < CRATE_DESTROYED) n++;
    return n;
  };
  // A crate from slot `from`'s x + dx and feet + dy, toward the nearest Ooga's x, while fewer than CRATE_CAP fly (and the
  // sim's boss reserve gives it a slot). Event code, run once a launch.
  const launch = (ctx, from, dx, dy) => {
    if (crates(ctx) >= TUNE.CRATE_CAP) return;
    const s = ctx.state, k = ctx.spawn(ENEMY.DROP_CRATE, s.ex[from] + dx, s.ey[from] + dy, 0);
    if (k < 0) return;
    const p = ctx.nearest(k), vx = p < 0 ? 0 : (s.px[p] - s.ex[k]) / TUNE.CRATE_REACH;
    s.evx[k] = vx > TUNE.CRATE_VX ? TUNE.CRATE_VX : vx < -TUNE.CRATE_VX ? -TUNE.CRATE_VX : vx;
    s.evy[k] = TUNE.CRATE_VY; s.eRoutine[k] = CRATE.RISE;
  };

  // SHARD_THROWER: 0 sets it up, 1 stands and throws.
  const throwerInit = (ctx, i) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] = TUNE.SHARD_FIRST; next(s, i);
  };
  const throwerStand = (ctx, i, dt) => {
    const s = ctx.state;
    ctx.fall(i, dt);
    const p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      ctx.roll();
      s.eTimer[i] = TUNE.SHARD_GAP * (0.75 + 0.5 * ctx.dice[0]);
      if (p >= 0 && s.attack) lobAt(ctx, i, 2, s.px[p], s.py[p], TUNE.SHARD_FLIGHT);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // ICICLE: 0 hangs it under its cell's top, 1 hangs, 2 shivers, 3 falls.
  const ICICLE = Object.freeze({ HANG: 1, SHIVER: 2, FALL: 3 });
  const icicleInit = (ctx, i) => {
    const s = ctx.state;
    s.ey[i] = (Math.floor(s.ey[i] / CELL + EPS) + 1) * CELL - TUNE.ICICLE_HANG; s.evy[i] = 0;
    next(s, i);
  };
  const icicleHang = (ctx, i) => {
    const s = ctx.state, PS = ctx.PSTATE;
    for (let p = 0; p < ctx.PLAYERS; p++) {
      if (s.pState[p] !== PS.NORMAL || s.py[p] >= s.ey[i]) continue;
      const dx = s.px[p] - s.ex[i];
      if (dx <= TUNE.ICICLE_TRIGGER && dx >= -TUNE.ICICLE_TRIGGER) { s.eTimer[i] = TUNE.ICICLE_SHIVER; next(s, i); tell(s, i, true, false); break; }
    }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const icicleShiver = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.evy[i] = 0; next(s, i); }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const icicleFall = (ctx, i, dt) => {
    const s = ctx.state, from = s.ey[i];
    s.ey[i] = from + s.evy[i] * dt - 0.5 * TUNE.ICICLE_G * dt * dt;
    s.evy[i] -= TUNE.ICICLE_G * dt;
    if (ctx.offScreen(i)) { ctx.free(i); return; }
    if (!landed(ctx, i, from)) return;
    shotAlong(ctx, i, 0, TUNE.ICICLE_BURST, RIGHT);
    shotAlong(ctx, i, 0, TUNE.ICICLE_BURST, LEFT);
    ctx.free(i);
  };

  // DROP_CRATE: 0 steps on (`launch` starts it at 1), 1 rises, 2 drifts down under its chute.
  const CRATE = Object.freeze({ RISE: 1, CHUTE: 2 });
  const begin = (ctx, i) => { next(ctx.state, i); };
  // Along x by its speed, unless a solid cell stands there at its height, which stops it along x.
  const drift = (ctx, i, dt) => {
    const s = ctx.state, x = s.ex[i] + s.evx[i] * dt;
    if (ctx.cellAt(Math.floor(x / CELL), Math.floor(s.ey[i] / CELL)) === KIND.SOLID) s.evx[i] = 0;
    else s.ex[i] = x;
  };
  const crateRise = (ctx, i, dt) => {
    const s = ctx.state;
    drift(ctx, i, dt);
    s.ey[i] += s.evy[i] * dt - 0.5 * TUNE.CRATE_G * dt * dt;
    s.evy[i] -= TUNE.CRATE_G * dt;
    if (s.evy[i] <= 0) { s.evy[i] = -TUNE.CHUTE_V; next(s, i); }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const crateChute = (ctx, i, dt) => {
    const s = ctx.state, from = s.ey[i];
    drift(ctx, i, dt);
    s.ey[i] = from - TUNE.CHUTE_V * dt;
    if (ctx.offScreen(i)) { ctx.free(i); return; }
    if (!landed(ctx, i, from)) return;
    // Two runners where it lands (each as the sim's boss reserve allows).
    for (let k = -1; k <= 1; k += 2) ctx.spawn(ENEMY.RUNNER, s.ex[i] + k * TUNE.CRATE_SPREAD, s.ey[i], 0);
    ctx.free(i);
  };

  // MECH_POD: 0 sets its first crate's time, 1 launches.
  const podInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.MECH_CRATE * (0.5 + s.eAttr[i] * 0.5); next(s, i); };
  const podLaunch = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] += TUNE.MECH_CRATE;
      if (s.attack) launch(ctx, i, 0, 0);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
  };

  // MECH: 0 sets it up, 1 walks, 2 pauses, 3 destroyed (`bossBreak`).
  const MECH = Object.freeze({ WALK: 1, PAUSE: 2 });
  // Its pods still standing.
  const podsOf = (ctx, i) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.MECH_POD && s.eLink[j] === i && s.eRoutine[j] < POD_DESTROYED) n++;
    return n;
  };
  const mechInit = (ctx, i) => {
    const s = ctx.state;
    s.evy[i] = s.ex[i] - TUNE.MECH_LEFT; s.evx[i] = 0; s.eAim[i] = ctx.AIMS / 2; s.eAttr[i] = 0;
    s.eTimer[i] = TUNE.MECH_GUN - TUNE.MECH_FIRST;   // the clock the gun keeps, so its first shot comes MECH_FIRST in
    next(s, i);
  };
  // Every step it stands: the phase, its pods mounted as slots allow, opening, and the gun and crates by its clock.
  const mechTend = (ctx, i, dt) => {
    const s = ctx.state;
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    while (s.eAttr[i] < POD_MOUNTS.length) {
      if (mount(ctx, i, ENEMY.MECH_POD, s.eAttr[i]) < 0) break;
      s.eAttr[i]++;
    }
    if (s.eFlags[i] & FLAG.SHUT && s.eAttr[i] === POD_MOUNTS.length && podsOf(ctx, i) === 0) { s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = 0; }
    const shut = (s.eFlags[i] & FLAG.SHUT) !== 0, was = s.eTimer[i], t = was + dt;
    s.eTimer[i] = t;
    const gap = shut ? TUNE.MECH_GUN : TUNE.MECH_GUN_OPEN;
    // Told off the same unrounded clock the gun and the crates keep: the gun's last window of each gap (the open spread a
    // big one), the last TELL_FOR before an open crate.
    const gun = t - Math.floor(t / gap) * gap >= gap - (shut ? TELL_FOR : TELL_FOR_BIG);
    tell(s, i, gun || !shut && t - Math.floor(t / TUNE.MECH_CRATE_OPEN) * TUNE.MECH_CRATE_OPEN >= TUNE.MECH_CRATE_OPEN - TELL_FOR, gun && !shut);
    if (Math.floor(t / gap) !== Math.floor(was / gap) && s.attack) {
      const p = ctx.nearest(i);
      if (p >= 0) {
        const m = TUNE.MECH_MUZZLE, k = aimShotOff(ctx, i, m[0], m[1], p);
        if (!shut && k >= 0) { const aim = s.eAttr[k]; shotAlong(ctx, i, m[0], m[1], aim + 1); shotAlong(ctx, i, m[0], m[1], aim - 1); }
      }
    }
    if (!shut && Math.floor(t / TUNE.MECH_CRATE_OPEN) !== Math.floor(was / TUNE.MECH_CRATE_OPEN) && s.attack) launch(ctx, i, TUNE.MECH_HATCH[0], TUNE.MECH_HATCH[1]);
  };
  const mechWalk = (ctx, i, dt) => {
    const s = ctx.state, left = s.evy[i], right = left + TUNE.MECH_LEFT + TUNE.MECH_RIGHT;
    mechTend(ctx, i, dt);
    const v = (s.eFlags[i] & FLAG.SHUT ? TUNE.MECH_V : TUNE.MECH_OPEN_V) * dt, heading = s.eAim[i];
    let x = s.ex[i] + (heading === 0 ? v : -v);
    const end = heading === 0 ? x >= right : x <= left;
    if (end) x = heading === 0 ? right : left;
    s.ex[i] = x;
    if (!end) {
      // The stomp ahead, told over the last MECH_OPEN_V * TELL_FOR_BIG metres of the walk (TELL_FOR_BIG or more at either pace).
      if ((heading === 0 ? right - x : x - left) <= TUNE.MECH_OPEN_V * TELL_FOR_BIG) s.eFlags[i] |= FLAG.WIND | FLAG.BIG;
      return;
    }
    if (s.attack) {
      ctx.spawn(ENEMY.SPARK, x - TUNE.MECH_STOMP, s.ey[i], SPARK_LEFT);
      ctx.spawn(ENEMY.SPARK, x + TUNE.MECH_STOMP, s.ey[i], SPARK_RIGHT);
    }
    s.eAim[i] = heading === 0 ? ctx.AIMS / 2 : 0; s.evx[i] = TUNE.MECH_PAUSE; next(s, i);
  };
  const mechPause = (ctx, i, dt) => {
    const s = ctx.state;
    mechTend(ctx, i, dt);
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) { s.evx[i] = 0; s.eRoutine[i] = MECH.WALK; }
  };

  register(ENEMY.SHARD_THROWER, {
    routines: [throwerInit, throwerStand, dieStart, dieFade, release], destroyed: 2,
    hp: 1, tier: 0, points: 300, origin: 0.5, tells: true
  });
  register(ENEMY.ICICLE, {
    routines: [icicleInit, icicleHang, icicleShiver, icicleFall, dieStart, dieFade, release], destroyed: 4,
    hp: 1, tier: 0, points: 100, origin: 0, tells: true, charge: ICICLE.FALL
  });
  register(ENEMY.MECH, {
    releases: ["MECH_POD", "SPARK", "DROP_CRATE"],
    routines: [mechInit, mechWalk, mechPause, bossBreak, dieFade, release], destroyed: 3, flags: FLAG.MACHINE | FLAG.SHUT,
    hp: 56, tier: 2, points: 25000, origin: 1.6, boss: true, scaled: true, standTouch: true, title: "The Bailout Mech", tells: true
  });
  register(ENEMY.MECH_POD, {
    releases: ["DROP_CRATE"],
    routines: [podInit, podLaunch, dieStart, dieFade, release], destroyed: POD_DESTROYED, flags: FLAG.MACHINE,
    hp: 8, tier: 1, points: 1000, origin: 0, mounts: POD_MOUNTS, main: ENEMY.MECH, tells: true
  });
  register(ENEMY.DROP_CRATE, {
    routines: [begin, crateRise, crateChute, dieStart, dieFade, release], destroyed: CRATE_DESTROYED,
    hp: 1, tier: 0, points: 100, origin: 0.25
  });

  const LOOK = Object.freeze({
    SHARD_THROWER: Object.freeze({ stand: 1 }),
    ICICLE: Object.freeze({ hang: ICICLE.HANG, shiver: ICICLE.SHIVER, fall: ICICLE.FALL }),
    DROP_CRATE: Object.freeze({ rise: CRATE.RISE, chute: CRATE.CHUTE }),
    MECH: Object.freeze({ walk: MECH.WALK, pause: MECH.PAUSE }),
    MECH_POD: Object.freeze({ launch: 1 })
  });
  BL.raidLegionPass = { TUNE, LOOK };
})();
