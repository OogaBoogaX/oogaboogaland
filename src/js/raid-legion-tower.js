// Ooga Raid's stage 3, The Hashrate Tower: its own enemies and its boss, the Inflation Balloon and its three tethers,
// registered with `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no
// state of its own: each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and
// allocates nothing but what a spawn helper does once an event.
//
//   COIN_DRONE   fodder, a flier. It hovers DRONE_HOVER where it came in, bobbing DRONE_BOB, then dives at the nearest
//                Ooga's point at DRONE_V on a curve, swooping up as DRONE_LIFT bends its fall; it frees off the screen or
//                DRONE_TOP over its top. While it hovers `evx` holds the height it came in at.
//   LOBBYIST     fodder, a prone sniper (its box low over its feet). LOBBY_FIRST after it appears, and then whenever its
//                timer is out and the nearest Ooga is within LOBBY_RANGE, it fires an aimed pair LOBBY_PAIR apart, then
//                rests LOBBY_GAP.
//   BOND_MORTAR  an emplacement and a machine, `emplaced` (raid-enemies.js's `emplaceWait`: shut until the screen brings
//                it in, then open). Every MORTAR_GAP (its first MORTAR_FIRST after it opens) it lobs a shell, a LOB that
//                bursts into two shots, onto the nearest Ooga's feet when that Ooga is within MORTAR_RANGE along x.
//   VENT         a shot's tier and a machine, with no hit points, so nothing destroys it: a rig's exhaust stack whose
//                mouth kills to stand on, as a shot does. Every VENT_GAP (its first VENT_FIRST in) it puffs VENT_PUFFS
//                shots of steam straight up, VENT_PUFF_GAP apart, which pass through ledges and stop only at solid.
//   TETHER       an emplacement and a machine: a deck winch holding one line of the balloon. It does nothing of its own.
//   BALLOON      the boss main (`boss`, a boss tier machine), its hit points by the boss formula (`scaled`). From its
//                first step the run is in PHASE.BOSS and it mounts its three TETHERs on the deck at TETHERS from its
//                record (`eLink` naming it, tried each step until slots are free, `eAttr` counting those mounted), and
//                stays SHUT while any stands: it sways BALLOON_SWAY (and BALLOON_SWAY_CUT more for each cut) either side
//                of its record's x over BALLOON_SWAY_T, rises BALLOON_RISE for each cut, drops a shot straight down from
//                BALLOON_DROP_Y under its middle every BALLOON_DROP, and every BALLOON_DRONE lets a COIN_DRONE go while
//                fewer than BALLOON_DRONES fly. With the last tether cut it opens and drifts at BALLOON_V between
//                BALLOON_LEFT and BALLOON_RIGHT across the screen (`eAim` its heading, 0 right or 6 left), bobbing
//                BALLOON_BOB about BALLOON_FREE_Y over its record from the middle of its bob (the height it stood at
//                with two tethers cut, where it opens, so it opens without a jump), an aimed shot every BALLOON_SHOT,
//                and a ring of six every BALLOON_RING_EVERY hits it takes (`eAttr` counting the rings); from
//                BALLOON_LATE_HP hit points left it goes at BALLOON_LATE_V and fires every BALLOON_LATE_SHOT. It swells
//                as it is hit (`swell`: the sim grows its box by up to BALLOON_SWELL, keeping its hit points at spawn in
//                `eBurst`, which the rings count by).
//                Its fall clears the stage (`bossBreak`). `evy` holds its record's y; tethered, `evx` holds its record's
//                x and `eTimer` the seconds since it came (its sway and drops), and free, `evx` the seconds to its next
//                shot and `eTimer` the seconds since it opened (its bob).
// Every attack is told (raid-enemies.js's `tell`): FLAG.WIND for the last TELL_FOR of a drone's hover (its dive is its
// `charge`), of the timer before a lobbyist's pair (on through the pair, and while it waits for an Ooga in range), a
// mortar's lob, a vent's puffs (on through them) and the tethered balloon's drop and the free balloon's aimed shot. The
// balloon's ring answers the hit that lands it (`answersHits`), so the hit tells it.
// Nothing fires while the sim's `attack` is 0, but everything moves, and the balloon lets its drones go regardless.
// `BL.raidLegionTower.TUNE` holds their numbers, and `LOOK` the routine index of each state a look depends on.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY } = BL.raidStages;
  const { FLAG, register, lobAt, bossBreak, dieStart, dieFade, release, emplaceWait, emplaceOpen, emplaceLeave, emplaceShut, tell, TELL_FOR } = BL.raidEnemies;

  const TUNE = Object.freeze({
    DRONE_HOVER: 1, DRONE_BOB: 0.15, DRONE_BOB_T: 0.8, DRONE_V: 3.5, DRONE_LIFT: 5, DRONE_TOP: 1,
    LOBBY_FIRST: 1.5, LOBBY_RANGE: 7, LOBBY_PAIR: 0.25, LOBBY_GAP: 2.4,
    MORTAR_FIRST: 1, MORTAR_RANGE: 8, MORTAR_GAP: 2.6, SHELL_FLIGHT: 1.2,
    VENT_FIRST: 1, VENT_PUFFS: 3, VENT_PUFF_GAP: 0.2, VENT_GAP: 2.6, VENT_MOUTH: 0.1,
    // The balloon's tethers, [dx, dy] from its record to each winch's feet on the deck, left to right.
    TETHERS: Object.freeze([Object.freeze([-3, -3.5]), Object.freeze([0, -3.5]), Object.freeze([2.5, -3.5])]),
    BALLOON_SWAY: 0.4, BALLOON_SWAY_CUT: 0.5, BALLOON_SWAY_T: 5, BALLOON_RISE: 0.5,
    BALLOON_DROP: 1.2, BALLOON_DROP_Y: 0.6, BALLOON_DRONE: 6, BALLOON_DRONES: 2,
    BALLOON_V: 1, BALLOON_LEFT: 1, BALLOON_RIGHT: 7, BALLOON_FREE_Y: 1, BALLOON_BOB: 0.4, BALLOON_BOB_T: 3,
    BALLOON_SHOT: 1.4, BALLOON_RING_EVERY: 6, BALLOON_LATE_HP: 8, BALLOON_LATE_V: 1.6, BALLOON_LATE_SHOT: 0.9,
    BALLOON_SWELL: 0.5
  });
  // The shots' aims, of the sim's twelve: straight up, straight down, and the balloon's ring.
  const UP = 3, DOWN = 9, RING = [0, 2, 4, 6, 8, 10];
  // Drones come with every DRONE_EVERY-th drop, BALLOON_DRONE apart.
  const DRONE_EVERY = Math.round(TUNE.BALLOON_DRONE / TUNE.BALLOON_DROP);
  if (Math.abs(DRONE_EVERY * TUNE.BALLOON_DROP - TUNE.BALLOON_DRONE) > 1e-9) throw new Error("raid legion tower: BALLOON_DRONE is no whole number of BALLOON_DROPs");
  // The rings count hits by the hit points the sim keeps only for a swelling type, and the free balloon's bob starts at
  // its middle, the height it stood at before its last cut (it opens on that cut's step, before it would rise again).
  if (!(TUNE.BALLOON_SWELL > 0)) throw new Error("raid legion tower: BALLOON_SWELL must be over 0, since the balloon's rings count its hits by the sim's swell");
  if (Math.abs(TUNE.BALLOON_FREE_Y - TUNE.BALLOON_RISE * (TUNE.TETHERS.length - 1)) > 1e-9) throw new Error("raid legion tower: the free balloon's bob does not start where it stood before its last cut");
  const next = (s, i) => { s.eRoutine[i]++; };
  const TWO_PI = 2 * Math.PI;

  // COIN_DRONE: 0 sets it up, 1 hovers, 2 dives, 3 destroyed. Each routine's index, by the state a look depends on.
  const DRONE_DESTROYED = 3;
  const LOOK = Object.freeze({ COIN_DRONE: Object.freeze({ hover: 1, dive: 2 }) });
  const droneInit = (ctx, i) => { const s = ctx.state; s.evx[i] = s.ey[i]; s.evy[i] = 0; s.eTimer[i] = TUNE.DRONE_HOVER; next(s, i); };
  const droneHover = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    s.ey[i] = s.evx[i] + TUNE.DRONE_BOB * Math.sin(TWO_PI * (TUNE.DRONE_HOVER - s.eTimer[i]) / TUNE.DRONE_BOB_T);
    if (s.eTimer[i] > 0) { tell(s, i, s.eTimer[i] <= TELL_FOR, false); if (ctx.offScreen(i)) ctx.free(i); return; }
    tell(s, i, false, false);
    const p = ctx.nearest(i);
    if (p < 0) { s.evx[i] = 0; s.evy[i] = -TUNE.DRONE_V; }
    else {
      const dx = s.px[p] - s.ex[i], dy = s.py[p] + ctx.RULES.PLAYER_POINT[s.pPose[p]] - s.ey[i], d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0) { s.evx[i] = dx / d * TUNE.DRONE_V; s.evy[i] = dy / d * TUNE.DRONE_V; } else { s.evx[i] = 0; s.evy[i] = -TUNE.DRONE_V; }
    }
    next(s, i);
  };
  const droneDive = (ctx, i, dt) => {
    const s = ctx.state;
    s.ex[i] += s.evx[i] * dt; s.ey[i] += s.evy[i] * dt; s.evy[i] += TUNE.DRONE_LIFT * dt;
    if (ctx.offScreen(i) || s.ey[i] > ctx.bounds[3] + TUNE.DRONE_TOP) ctx.free(i);
  };

  // LOBBYIST: 0 sets it up, 1 lies aiming; `eBurst` 1 while the second of a pair is due.
  const lobbyInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.LOBBY_FIRST; s.eBurst[i] = 0; next(s, i); };
  const lobbyAim = (ctx, i, dt) => {
    const s = ctx.state;
    ctx.fall(i, dt);
    const p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      if (s.eBurst[i] === 1) {
        if (p >= 0 && s.attack) ctx.shootFrom(i);
        s.eBurst[i] = 0; s.eTimer[i] = TUNE.LOBBY_GAP;
      } else if (p >= 0 && s.attack) {
        const dx = s.px[p] - s.ex[i], dy = s.py[p] - s.ey[i];
        if (dx * dx + dy * dy <= TUNE.LOBBY_RANGE * TUNE.LOBBY_RANGE) { ctx.shootFrom(i); s.eBurst[i] = 1; s.eTimer[i] = TUNE.LOBBY_PAIR; }
      }
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // BOND_MORTAR: 0 waits shut, 1 opens, 2 sets it up, 3 lobs, 4 shut for good, 5 destroyed.
  const mortarInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.MORTAR_FIRST; next(s, i); };
  const mortarLob = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] = TUNE.MORTAR_GAP;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack && Math.abs(s.px[p] - s.ex[i]) <= TUNE.MORTAR_RANGE) lobAt(ctx, i, 1, s.px[p], s.py[p], TUNE.SHELL_FLIGHT);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    emplaceLeave(ctx, i);
  };

  // VENT: 0 sets it up, 1 waits, 2 puffs `eBurst` shots of steam up from its mouth.
  const VENT_WAIT = 1;
  const ventInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.VENT_FIRST; next(s, i); };
  const ventWait = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eBurst[i] = TUNE.VENT_PUFFS; s.eTimer[i] = 0; next(s, i); }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const ventPuff = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      if (s.attack) { ctx.at[0] = s.ex[i]; ctx.at[1] = s.ey[i] + TUNE.VENT_MOUTH; ctx.spawnAt(ENEMY.SHOT, UP); }
      s.eBurst[i]--;
      if (s.eBurst[i] > 0) s.eTimer[i] += TUNE.VENT_PUFF_GAP;
      else { s.eTimer[i] = TUNE.VENT_GAP; s.eRoutine[i] = VENT_WAIT; }
    }
    tell(s, i, s.eRoutine[i] !== VENT_WAIT || s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // TETHER: 0 steps on, 1 holds.
  const begin = (ctx, i) => { next(ctx.state, i); };
  const hold = () => {};
  const TETHER_DESTROYED = 2;

  // BALLOON: 0 sets it up, 1 tethered (SHUT), 2 free, 3 destroyed (`bossBreak`).
  // The tethers still standing that slot i mounted.
  const tethersOf = (ctx, i) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.TETHER && s.eLink[j] === i && s.eRoutine[j] < TETHER_DESTROYED) n++;
    return n;
  };
  const dronesFlying = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.COIN_DRONE && s.eRoutine[j] < DRONE_DESTROYED) n++;
    return n;
  };
  const balloonInit = (ctx, i) => {
    const s = ctx.state;
    s.evx[i] = s.ex[i]; s.evy[i] = s.ey[i]; s.eAttr[i] = 0; s.eAim[i] = 0; s.eTimer[i] = 0;
    next(s, i);
  };
  const balloonTethered = (ctx, i, dt) => {
    const s = ctx.state;
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    while (s.eAttr[i] < TUNE.TETHERS.length) {
      const at = TUNE.TETHERS[s.eAttr[i]], k = ctx.spawn(ENEMY.TETHER, s.evx[i] + at[0], s.evy[i] + at[1], s.eAttr[i]);
      if (k < 0) break;
      s.eLink[k] = i; s.eAttr[i]++;
    }
    const cut = s.eAttr[i] - tethersOf(ctx, i);
    if (s.eAttr[i] === TUNE.TETHERS.length && cut === TUNE.TETHERS.length) {
      s.eFlags[i] &= ~FLAG.SHUT; s.eAttr[i] = 0; s.eAim[i] = 0; s.eTimer[i] = 0; s.evx[i] = TUNE.BALLOON_SHOT;
      tell(s, i, false, false);
      next(s, i);
      return;
    }
    const was = s.eTimer[i], t = was + dt;
    s.eTimer[i] = t;
    s.ex[i] = s.evx[i] + (TUNE.BALLOON_SWAY + TUNE.BALLOON_SWAY_CUT * cut) * Math.sin(TWO_PI * t / TUNE.BALLOON_SWAY_T);
    s.ey[i] = s.evy[i] + TUNE.BALLOON_RISE * cut;
    // Told from TELL_FOR before each drop, read off the same unrounded clock the drop keeps.
    tell(s, i, t - Math.floor(t / TUNE.BALLOON_DROP) * TUNE.BALLOON_DROP >= TUNE.BALLOON_DROP - TELL_FOR, false);
    if (Math.floor(t / TUNE.BALLOON_DROP) === Math.floor(was / TUNE.BALLOON_DROP)) return;
    // A drop every BALLOON_DROP (a shot while `attack` holds); `eAim` counts them, and every DRONE_EVERY-th lets a drone go.
    if (s.attack) { ctx.at[0] = s.ex[i]; ctx.at[1] = s.ey[i] - TUNE.BALLOON_DROP_Y; ctx.spawnAt(ENEMY.SHOT, DOWN); }
    if (++s.eAim[i] < DRONE_EVERY) return;
    s.eAim[i] = 0;
    if (dronesFlying(ctx) < TUNE.BALLOON_DRONES) ctx.spawnFrom(ENEMY.COIN_DRONE, i, 0);
  };
  const balloonFree = (ctx, i, dt) => {
    const s = ctx.state, late = s.eHp[i] <= TUNE.BALLOON_LATE_HP, e = ctx.bounds;
    const v = late ? TUNE.BALLOON_LATE_V : TUNE.BALLOON_V, left = e[0] + TUNE.BALLOON_LEFT, right = e[0] + TUNE.BALLOON_RIGHT;
    let x = s.ex[i] + (s.eAim[i] === 0 ? v : -v) * dt;
    if (x >= right) { x = right; s.eAim[i] = 6; } else if (x <= left) { x = left; s.eAim[i] = 0; }
    s.ex[i] = x;
    s.eTimer[i] += dt;
    s.ey[i] = s.evy[i] + TUNE.BALLOON_FREE_Y + TUNE.BALLOON_BOB * Math.sin(TWO_PI * s.eTimer[i] / TUNE.BALLOON_BOB_T);
    const heading = s.eAim[i];
    // A ring of six for every BALLOON_RING_EVERY hits taken (its hit points at spawn, the sim's `eBurst`, less those left).
    while (s.eAttr[i] < Math.floor((s.eBurst[i] - s.eHp[i]) / TUNE.BALLOON_RING_EVERY)) {
      s.eAttr[i]++;
      if (s.attack) for (let k = 0; k < RING.length; k++) { s.eAim[i] = RING[k]; ctx.shootFrom(i); }
    }
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) {
      s.evx[i] += late ? TUNE.BALLOON_LATE_SHOT : TUNE.BALLOON_SHOT;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) { s.eAim[i] = ctx.aimAt(i, p); ctx.shootFrom(i); }
    }
    tell(s, i, s.evx[i] <= TELL_FOR, false);
    s.eAim[i] = heading;
  };

  register(ENEMY.COIN_DRONE, {
    routines: [droneInit, droneHover, droneDive, dieStart, dieFade, release], destroyed: DRONE_DESTROYED,
    hp: 1, tier: 0, points: 200, origin: 0, tells: true, charge: LOOK.COIN_DRONE.dive
  });
  register(ENEMY.LOBBYIST, {
    routines: [lobbyInit, lobbyAim, dieStart, dieFade, release], destroyed: 2,
    hp: 1, tier: 0, points: 400, origin: 0.15, tells: true
  });
  register(ENEMY.BOND_MORTAR, {
    routines: [emplaceWait, emplaceOpen, mortarInit, mortarLob, emplaceShut, dieStart, dieFade, release], destroyed: 5,
    flags: FLAG.MACHINE | FLAG.SHUT, emplaced: true, hp: 6, tier: 1, points: 1000, origin: 0.35, tells: true
  });
  register(ENEMY.VENT, {
    routines: [ventInit, ventWait, ventPuff, release], destroyed: 3, flags: FLAG.MACHINE,
    hp: 0, tier: 4, points: 0, origin: 0, tells: true
  });
  register(ENEMY.TETHER, {
    routines: [begin, hold, dieStart, dieFade, release], destroyed: TETHER_DESTROYED, flags: FLAG.MACHINE,
    hp: 6, tier: 1, points: 1000, origin: 0.35
  });
  register(ENEMY.BALLOON, {
    releases: ["TETHER", "COIN_DRONE"],
    routines: [balloonInit, balloonTethered, balloonFree, bossBreak, dieFade, release], destroyed: 3, flags: FLAG.MACHINE | FLAG.SHUT,
    hp: 36, tier: 3, points: 14000, origin: 0, boss: true, scaled: true, swell: TUNE.BALLOON_SWELL, title: "The Inflation Balloon",
    tells: true, answersHits: true
  });

  BL.raidLegionTower = { TUNE, LOOK };
})();
