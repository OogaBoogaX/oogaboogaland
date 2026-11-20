// Ooga Raid's stage 4, The Treasury Vaults: its own enemies and the Printer King, registered with `BL.raidEnemies` before
// raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no state of its own: each routine reads and
// writes the sim's `state` through the context raid-enemies.js lists, and allocates nothing but what a spawn helper does
// once an event.
//
//   BILL_BAT      fodder, a banknote folded into a bat. From where it is printed it flies to the front line over BAT_IN,
//                 weaving BAT_WEAVE either side of the x it set off from (over BAT_WEAVE_T) and easing from its height to
//                 BAT_Y as it comes; on the front line it flutters toward the nearest Ooga at BAT_V, bobbing BAT_BOB (over
//                 BAT_BOB_T) for BAT_LIFE, then rises away at BAT_LEAVE_V and frees over BAT_GONE. A standing Ooga
//                 touches it, a prone one ducks under it, and a standing forward shot meets it. While it comes in `evx`
//                 and `evy` hold the x and height it set off from; `eTimer` counts its flight, then its life left.
//   DROP_GUARD    fodder, a guard in a vault-blue cap. A wave sends it through the ceiling hatch over its door: it waits
//                 in the hatch for DROP_WARN (routine 1, DROP.WARN, the view's warning lamp), at DROP_START over the
//                 door's x at the front line, then drops under the rooms' gravity (routine 2, killing what it falls on),
//                 and once down stands and fires as a GUARD does. It is a GHOST from the step it comes in (its def's
//                 flags, so before its first routine moves it to the hatch) until its wait ends: drawn, but no bullet
//                 meets it (each flies on), it touches no Ooga, and the clear-screen and the autopilot pass it by.
//   SHUTTER_CORE  an emplacement, a machine and a core behind a roller shutter. attr 0 to 3 is its phase: shut at first
//                 for SHUTTER_SHUT less attr times SHUTTER_STEP (attr 3 opens at once), then open for SHUTTER_OPEN and
//                 shut for SHUTTER_SHUT, round again. Shut, it takes no damage.
//   TWIN_CORE     an emplacement, a machine and a core, one of a pair on one yoke (attr the pair). The lower-x twin of its
//                 pair starts open and the other shut; every TWIN_SWAP both swap, so one is open at a time. With its
//                 partner gone, the last opens for good.
//   SEARCHLIGHT   an emplacement and a machine (no core), a lamp throwing a pool of light along the front line. The
//                 pool's x is `evy` and its heading `eAim` (0 right, 1 left): it sweeps at LIGHT_V between the front
//                 line's ends. An Ooga in play standing within LIGHT_HALF of it for LIGHT_LOCK locks it (`eTimer` counts
//                 that, from 0 each time the Ooga is out of it): the pool holds there, red, for LIGHT_ALARM, then calls
//                 a GUARD in at the door nearest that Ooga (`eBurst` holds the Ooga while it is locked), goes dark for
//                 LIGHT_COOL and sweeps again. Routine 1 is sweeping, 2 locked, 3 dark, for the view (LIGHT).
//   PRINT_HEAD    an emplacement and a machine, one of the Printer King's three heads (attr 0 to 2), `eLink` the King's
//                 slot (set as it starts, so the view hears a head as the King's part). HEAD_FIRST (attr HEAD_STAGGER
//                 more each) and then every HEAD_GAP it prints a BILL_BAT from its face while fewer than BAT_CAP fly.
//   PRINTER_KING  the boss tier (3), a machine and a core, its hit points by the boss formula (`scaled`). Shut while any
//                 PRINT_HEAD stands, it opens KING_OPEN after the last falls; then every KING_GAP (its first KING_FIRST
//                 after it opens) it fires three shots at the front line at the nearest Ooga's point height, at that
//                 Ooga and KING_SPREAD either side (held to the front line), and every KING_PRINT (`evx` counts it down)
//                 prints bats at KING_BATS from its x while fewer than BAT_CAP fly. As a core, its fall clears the stage
//                 (the sim's core rule in the boss room).
// The King's volley is told (raid-enemies.js's `tell`) with FLAG.WIND and FLAG.BIG for the last TELL_FOR_BIG of each gap,
// a drop guard's shots as a guard's; a head's print and a searchlight's call send enemies in, not shots, and the
// searchlight's lock is its own warning.
// Nothing fires, calls or prints while the sim's `attack` is 0, but everything moves. `BL.raidLegionTreasury.TUNE` holds
// their numbers.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY } = BL.raidStages;
  const { FLAG, register, aimShotAt, guardStand, dieStart, dieFade, release, tell, TELL_FOR_BIG } = BL.raidEnemies;

  const TUNE = Object.freeze({
    BAT_IN: 2, BAT_WEAVE: 0.6, BAT_WEAVE_T: 1.2, BAT_Y: 1, BAT_V: 1.2, BAT_BOB: 0.2, BAT_BOB_T: 0.9, BAT_LIFE: 6,
    BAT_LEAVE_V: 2, BAT_GONE: 4.5, BAT_CAP: 4,
    DROP_START: 3.5, DROP_WARN: 0.5,
    SHUTTER_SHUT: 2.4, SHUTTER_OPEN: 1.6, SHUTTER_STEP: 0.8,
    TWIN_SWAP: 2,
    LIGHT_V: 1.4, LIGHT_HALF: 0.6, LIGHT_LOCK: 0.5, LIGHT_ALARM: 0.4, LIGHT_COOL: 1.5,
    HEAD_FIRST: 1, HEAD_STAGGER: 1, HEAD_GAP: 3,
    KING_OPEN: 1, KING_FIRST: 1, KING_GAP: 1.6, KING_SPREAD: 1, KING_PRINT: 5, KING_BATS: Object.freeze([-1, 0, 1])
  });
  const TAU = 2 * Math.PI;
  const next = (s, i) => { s.eRoutine[i]++; };
  const BAT_DESTROYED = 4, HEAD_DESTROYED = 2, TWIN_DESTROYED = 2;

  // The bats flying, not destroyed.
  const bats = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.BILL_BAT && s.eRoutine[j] < BAT_DESTROYED) n++;
    return n;
  };
  // A bat printed at x, y on the back wall, when fewer than BAT_CAP fly. Event code, run once a print.
  const print = (ctx, x, y) => {
    if (bats(ctx) >= TUNE.BAT_CAP) return;
    const k = ctx.spawn(ENEMY.BILL_BAT, x, y, 0);
    if (k >= 0) ctx.state.ez[k] = 1;
  };

  // BILL_BAT: 0 sets off, 1 comes in to the front line, 2 hunts along it, 3 rises away.
  const batInit = (ctx, i) => {
    const s = ctx.state;
    s.evx[i] = s.ex[i]; s.evy[i] = s.ey[i]; s.evz[i] = -1 / TUNE.BAT_IN; s.eTimer[i] = 0; next(s, i);
  };
  const batIn = (ctx, i, dt) => {
    const s = ctx.state, t = s.eTimer[i] + dt;
    s.eTimer[i] = t;
    const z = s.ez[i] + s.evz[i] * dt;
    s.ex[i] = s.evx[i] + TUNE.BAT_WEAVE * Math.sin(TAU * t / TUNE.BAT_WEAVE_T);
    if (z > 0) { s.ez[i] = z; s.ey[i] = TUNE.BAT_Y + (s.evy[i] - TUNE.BAT_Y) * z; return; }
    s.ez[i] = 0; s.evz[i] = 0; s.ey[i] = TUNE.BAT_Y; s.eTimer[i] = TUNE.BAT_LIFE; next(s, i);
  };
  const batHunt = (ctx, i, dt) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p >= 0) {
      const dx = s.px[p] - s.ex[i], step = TUNE.BAT_V * dt;
      s.ex[i] += dx > step ? step : dx < -step ? -step : dx;
    }
    s.eTimer[i] -= dt;
    s.ey[i] = TUNE.BAT_Y + TUNE.BAT_BOB * Math.sin(TAU * (TUNE.BAT_LIFE - s.eTimer[i]) / TUNE.BAT_BOB_T);
    if (s.eTimer[i] <= 0) next(s, i);
  };
  const batLeave = (ctx, i, dt) => {
    const s = ctx.state;
    s.ey[i] += TUNE.BAT_LEAVE_V * dt;
    if (s.ey[i] > TUNE.BAT_GONE) ctx.free(i);
  };

  // DROP_GUARD: 0 to the hatch, 1 waiting in it (a ghost), 2 dropping, 3 standing (a guard's), then dying.
  const DROP = Object.freeze({ WARN: 1, FALL: 2 });
  const dropInit = (ctx, i) => {
    const s = ctx.state;
    s.ey[i] = TUNE.DROP_START; s.ez[i] = 0; s.evy[i] = 0; s.eTimer[i] = TUNE.DROP_WARN; next(s, i);
  };
  const dropWarn = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eFlags[i] &= ~FLAG.GHOST; next(s, i);
  };
  const dropFall = (ctx, i, dt) => {
    const s = ctx.state, vy = s.evy[i] - ctx.TUNE.GRAVITY * dt, y = s.ey[i] + vy * dt;
    if (y > 0) { s.ey[i] = y; s.evy[i] = vy; return; }
    s.ey[i] = 0; s.evy[i] = 0; s.eTimer[i] = ctx.TUNE.GUARD_FIRST; next(s, i);
  };

  // SHUTTER_CORE: 0 sets its phase, 1 shut and open by turns.
  const shutterInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.SHUTTER_SHUT - s.eAttr[i] * TUNE.SHUTTER_STEP; next(s, i); };
  const shutterCycle = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eFlags[i] ^= FLAG.SHUT;
    s.eTimer[i] += s.eFlags[i] & FLAG.SHUT ? TUNE.SHUTTER_SHUT : TUNE.SHUTTER_OPEN;
  };

  // TWIN_CORE: 0 opens the lower-x of its pair and shuts the other, 1 both swap together, the last standing open.
  const partner = (ctx, i) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) {
      if (j !== i && s.eType[j] === ENEMY.TWIN_CORE && s.eAttr[j] === s.eAttr[i] && s.eRoutine[j] < TWIN_DESTROYED) return j;
    }
    return -1;
  };
  const twinInit = (ctx, i) => {
    const s = ctx.state, j = partner(ctx, i);
    if (j >= 0 && s.ex[j] < s.ex[i]) s.eFlags[i] |= FLAG.SHUT;
    s.eTimer[i] = TUNE.TWIN_SWAP; next(s, i);
  };
  const twinSwap = (ctx, i, dt) => {
    const s = ctx.state;
    if (partner(ctx, i) < 0) { s.eFlags[i] &= ~FLAG.SHUT; return; }
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eFlags[i] ^= FLAG.SHUT; s.eTimer[i] += TUNE.TWIN_SWAP;
  };

  // SEARCHLIGHT: 0 lights the pool at its own x, 1 sweeps, 2 locked on an Ooga, 3 dark.
  const SWEEP = 1, LOCKED = 2;
  const lightInit = (ctx, i) => { const s = ctx.state; s.evy[i] = s.ex[i]; s.eAim[i] = 0; s.eTimer[i] = 0; next(s, i); };
  const lightSweep = (ctx, i, dt) => {
    const s = ctx.state, R = ctx.ROOM;
    let x = s.evy[i] + (s.eAim[i] ? -TUNE.LIGHT_V : TUNE.LIGHT_V) * dt;
    if (x > R.FRONT_R) { x = R.FRONT_R + R.FRONT_R - x; s.eAim[i] = 1; } else if (x < R.FRONT_L) { x = R.FRONT_L + R.FRONT_L - x; s.eAim[i] = 0; }
    s.evy[i] = x;
    let seen = -1;
    for (let p = 0; p < ctx.PLAYERS; p++) {
      if (s.pState[p] !== ctx.PSTATE.NORMAL) continue;
      const d = s.px[p] - x;
      if (d < TUNE.LIGHT_HALF && d > -TUNE.LIGHT_HALF) { seen = p; break; }
    }
    if (seen < 0) { s.eTimer[i] = 0; return; }
    s.eTimer[i] += dt;
    if (s.eTimer[i] < TUNE.LIGHT_LOCK || !s.attack) return;
    s.eBurst[i] = seen; s.evy[i] = s.px[seen]; s.eTimer[i] = TUNE.LIGHT_ALARM; next(s, i);
  };
  const lightLocked = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    const p = s.eBurst[i], doors = ctx.stage.rooms[s.room].doors;
    s.eBurst[i] = 0; s.eTimer[i] = TUNE.LIGHT_COOL; next(s, i);   // eBurst means nothing while sweeping or dark
    if (!s.attack || doors.length === 0) return;
    const x = s.pState[p] === ctx.PSTATE.NORMAL ? s.px[p] : s.evy[i];
    let d = 0;
    for (let k = 1; k < doors.length; k++) if (Math.abs(doors[k] - x) < Math.abs(doors[d] - x)) d = k;
    const g = ctx.spawn(ENEMY.GUARD, doors[d], 0, 0);
    if (g >= 0) s.ez[g] = 1;
  };
  const lightDark = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eTimer[i] = 0; s.eRoutine[i] = SWEEP;
  };

  // PRINT_HEAD: 0 sets its stagger, 1 prints a bat every HEAD_GAP.
  const headInit = (ctx, i) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.PRINTER_KING) s.eLink[i] = j;
    s.eTimer[i] = TUNE.HEAD_FIRST + s.eAttr[i] * TUNE.HEAD_STAGGER; next(s, i);
  };
  const headPrint = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eTimer[i] += TUNE.HEAD_GAP;
    if (s.attack) print(ctx, s.ex[i], s.ey[i]);
  };

  // PRINTER_KING: 0 steps on, 1 shut while a head stands, 2 opening, 3 open, firing and printing.
  const kingInit = (ctx, i) => { next(ctx.state, i); };
  const kingWait = (ctx, i) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.PRINT_HEAD && s.eRoutine[j] < HEAD_DESTROYED) return;
    s.eTimer[i] = TUNE.KING_OPEN; next(s, i);
  };
  const kingOpening = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = TUNE.KING_FIRST; s.evx[i] = TUNE.KING_PRINT; next(s, i);
  };
  const kingFight = (ctx, i, dt) => {
    const s = ctx.state;
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) {
      s.evx[i] += TUNE.KING_PRINT;
      if (s.attack) for (let k = 0; k < TUNE.KING_BATS.length; k++) print(ctx, s.ex[i] + TUNE.KING_BATS[k], s.ey[i]);
    }
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) { tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true); return; }
    s.eTimer[i] += TUNE.KING_GAP;
    tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true);
    const p = ctx.nearest(i);
    if (p < 0 || !s.attack) return;
    const R = ctx.ROOM, y = s.py[p] + ctx.RULES.PLAYER_POINT[s.pPose[p]];
    for (let k = -1; k <= 1; k++) {
      const x = s.px[p] + k * TUNE.KING_SPREAD;
      aimShotAt(ctx, i, x < R.FRONT_L ? R.FRONT_L : x > R.FRONT_R ? R.FRONT_R : x, y, 0);
    }
  };

  register(ENEMY.BILL_BAT, {
    routines: [batInit, batIn, batHunt, batLeave, dieStart, dieFade, release], destroyed: BAT_DESTROYED,
    hp: 1, tier: 0, points: 100, origin: 0
  });
  register(ENEMY.DROP_GUARD, {
    routines: [dropInit, dropWarn, dropFall, guardStand, dieStart, dieFade, release], destroyed: 4,
    flags: FLAG.GHOST, hp: 1, tier: 0, points: 300, origin: 0.5, tells: true
  });
  register(ENEMY.SHUTTER_CORE, {
    routines: [shutterInit, shutterCycle, dieStart, dieFade, release], destroyed: 2,
    flags: FLAG.MACHINE | FLAG.SHUT | FLAG.CORE, hp: 6, tier: 1, points: 1000, origin: 0
  });
  register(ENEMY.TWIN_CORE, {
    routines: [twinInit, twinSwap, dieStart, dieFade, release], destroyed: TWIN_DESTROYED,
    flags: FLAG.MACHINE | FLAG.CORE, hp: 6, tier: 1, points: 1000, origin: 0
  });
  register(ENEMY.SEARCHLIGHT, {
    releases: ["GUARD"],
    routines: [lightInit, lightSweep, lightLocked, lightDark, dieStart, dieFade, release], destroyed: 4,
    flags: FLAG.MACHINE, hp: 4, tier: 1, points: 500, origin: 0
  });
  register(ENEMY.PRINT_HEAD, {
    releases: ["BILL_BAT"],
    routines: [headInit, headPrint, dieStart, dieFade, release], destroyed: HEAD_DESTROYED,
    flags: FLAG.MACHINE, hp: 8, tier: 1, points: 1000, origin: 0
  });
  register(ENEMY.PRINTER_KING, {
    releases: ["BILL_BAT"],
    routines: [kingInit, kingWait, kingOpening, kingFight, dieStart, dieFade, release], destroyed: 4,
    flags: FLAG.MACHINE | FLAG.SHUT | FLAG.CORE, hp: 40, tier: 3, points: 16000, origin: 0, scaled: true, title: "The Printer King", tells: true
  });

  BL.raidLegionTreasury = { TUNE, LIGHT: Object.freeze({ SWEEP, LOCKED, DARK: 3 }), DROP };
})();
