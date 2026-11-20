// Ooga Raid's stage 6, Mempool Lake: its own enemy and its boss, the fee eel and the Backlog Leviathan, registered with
// `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no state of its own:
// each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and allocates nothing but
// what a spawn does once an event. Both live in a tide basin (raid-terrain.js, the stage's `tide`), whose water top this
// step is `ctx.tideTops[basin]` (`ctx.basinAt(col)` names the basin), and both ride it. Each starts a GHOST (FLAG.GHOST,
// in its def's flags, so from the step its slot comes in no shot is spent on it and it touches no one) and SHUT.
//
//   FEE_EEL    fodder, a GHOST and SHUT while it lurks: it lies EEL_DEPTH under its column's water top (never under its
//              basin's bed, the bottom of its low water cell), so no shot meets it and it touches no one. EEL_WAIT after it
//              comes, and EEL_REST after each landing, the first Ooga in play within EEL_RANGE of it along x sets it
//              leaping: open, at EEL_VY up and toward that Ooga's x held EEL_INSET inside its basin's ends, reached after
//              EEL_FLIGHT at most EEL_VX_MAX, falling at EEL_G; its x never leaves those bounds, and it lands back in its
//              own basin as it falls to its lurking depth, a GHOST and SHUT again. `eBurst` holds its basin.
//   LEVIATHAN  the boss main (`boss`, a boss tier machine), its hit points by the boss formula (`scaled`). From its first
//              step the run is in PHASE.BOSS. It surfaces at its spots, LEV_SPOTS metres along x from its record, inside
//              its record's basin, in the order LEV_PATTERN (A, C, B, A, B, C), round again. Submerged it is a GHOST and
//              SHUT, LEV_DEPTH under the water top, for LEV_FIRST at first and LEV_DOWN after each sinking; then it moves
//              under the next spot and rises over LEV_RISE (SHUT, seen and touching), surfaces open with its box's origin
//              ORIGIN over the water top for LEV_UP, and LEV_SPIT after surfacing spits a spread of three aimed shots.
//              From half its hit points at spawn (kept in `eBurst`) it is in phase 2: up LEV_UP_LATE, down LEV_DOWN_LATE,
//              and on a surfacing it is in phase 2 by its spit, LEV_LUNGE_AT after surfacing it lunges at LEV_LUNGE_V for LEV_LUNGE_T toward the nearest Ooga's side, held
//              LEV_INSET inside its basin's ends (its way held, as its facing, to the lunge's end), then goes back to its
//              spot by the time it sinks; and each time it moves to its next spot it lets a FEE_EEL go in a water column of
//              its basin the dice pick (not a raft's), while fewer than LEV_EELS live. `eAim` is its facing (0 right,
//              AIMS / 2 left): the lunge's way while it lunges, along its motion while it otherwise moves, else toward the
//              nearest Ooga in play once that Ooga is more than LEV_FACE past its middle; `evx` is its speed along x, 0
//              whenever it is not moving. `evy` holds its record's x, `evz` 1 while this surfacing lunges (phase 2 by its
//              spit; a side stage keeps no depth), `eAttr` its place in the pattern and `eTimer` the seconds left in its
//              routine (the seconds since it surfaced while it is up). Its fall clears the stage (`bossBreak`).
// Both tell (raid-enemies.js's `tell`): an eel holds FLAG.WIND from TELL_FOR before its wait ends until it leaps (its
// `charge`), so a ready eel is told while it waits for an Ooga to come in range; the Leviathan FLAG.WIND and FLAG.BIG
// from its rise until its spit, and on to its lunge's time on a surfacing that lunges. Phase 2 reached after the spit
// waits for the next surfacing to lunge, so no lunge comes untold and no wind-up shows without one.
// Nothing fires while the sim's `attack` is 0, but everything moves: the eels leap and the Leviathan lets them go
// regardless. `BL.raidLegionLake.TUNE` holds their numbers and `LOOK` the routine index of each state a look depends on,
// `LOOK[NAME][state]`, which the art reads (`raid-art-lake.js`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY, CELL } = BL.raidStages;
  const { FLAG, register, bossBreak, dieStart, dieFade, release, tell, TELL_FOR } = BL.raidEnemies;

  const TUNE = Object.freeze({
    EEL_DEPTH: 0.6, EEL_WAIT: 0.8, EEL_RANGE: 3, EEL_INSET: 0.25, EEL_FLIGHT: 1, EEL_VX_MAX: 2.5, EEL_VY: 6.5, EEL_G: 13, EEL_REST: 1.6,
    // The Leviathan's spots A, B and C, metres along x from its record, and the order it surfaces at them.
    LEV_SPOTS: Object.freeze([-1, 0.5, 1.5]), LEV_PATTERN: Object.freeze([0, 2, 1, 0, 1, 2]),
    LEV_FIRST: 2, LEV_DEPTH: 1.2, LEV_RISE: 0.5, LEV_UP: 2.4, LEV_UP_LATE: 2, LEV_DOWN: 1.6, LEV_DOWN_LATE: 1.2,
    LEV_SPIT: 0.6, LEV_LUNGE_AT: 1, LEV_LUNGE_V: 3, LEV_LUNGE_T: 0.8, LEV_INSET: 0.25, LEV_EELS: 2, LEV_FACE: 0.5
  });
  // The lunge and the way back fit inside the shorter surfacing, and the spit comes before the lunge.
  if (!(TUNE.LEV_LUNGE_AT + TUNE.LEV_LUNGE_T < TUNE.LEV_UP_LATE && TUNE.LEV_SPIT < TUNE.LEV_LUNGE_AT)) throw new Error("raid legion lake: the Leviathan's spit, lunge and way back do not fit in its phase 2 surfacing");
  if (!TUNE.LEV_PATTERN.every((k) => Number.isInteger(k) && k >= 0 && k < TUNE.LEV_SPOTS.length)) throw new Error("raid legion lake: LEV_PATTERN names a spot LEV_SPOTS does not have");
  const next = (s, i) => { s.eRoutine[i]++; };
  const RIGHT = 0, LEFT = 6;   // `eAim` facing: the sim's aim steps 0 and AIMS / 2

  // FEE_EEL: 0 sets it up, 1 lurks, 2 leaps, 3 destroyed.
  const EEL_LURK = 1, EEL_DESTROYED = 3;
  const eelInit = (ctx, i) => {
    const s = ctx.state, b = ctx.basinAt(Math.floor(s.ex[i] / CELL));
    if (b < 0) throw new Error(`raid legion lake: a FEE_EEL at x ${s.ex[i]} m stands in no tide basin`);
    const low = ctx.stage.tide.basins[b][2] * CELL, y = ctx.tideTops[b] - TUNE.EEL_DEPTH;
    s.eBurst[i] = b; s.ey[i] = y > low ? y : low; s.evx[i] = 0; s.evy[i] = 0;
    s.eTimer[i] = TUNE.EEL_WAIT;
    next(s, i);
  };
  const eelLurk = (ctx, i, dt) => {
    const s = ctx.state, b = s.eBurst[i], basin = ctx.stage.tide.basins[b], low = basin[2] * CELL, y = ctx.tideTops[b] - TUNE.EEL_DEPTH;
    s.ey[i] = y > low ? y : low;
    s.eTimer[i] -= dt;
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) { ctx.free(i); return; }
    if (s.eTimer[i] > 0) return;
    // The nearest Ooga in play along x, within EEL_RANGE.
    let best = -1, far = 0;
    for (let p = 0; p < ctx.PLAYERS; p++) {
      if (s.pState[p] !== ctx.PSTATE.NORMAL) continue;
      const d = Math.abs(s.px[p] - s.ex[i]);
      if (d <= TUNE.EEL_RANGE && (best < 0 || d < far)) { best = p; far = d; }
    }
    if (best < 0) return;
    const lo = basin[0] * CELL + TUNE.EEL_INSET, hi = (basin[1] + 1) * CELL - TUNE.EEL_INSET, px = s.px[best];
    const to = px < lo ? lo : px > hi ? hi : px, vx = (to - s.ex[i]) / TUNE.EEL_FLIGHT;
    s.evx[i] = vx > TUNE.EEL_VX_MAX ? TUNE.EEL_VX_MAX : vx < -TUNE.EEL_VX_MAX ? -TUNE.EEL_VX_MAX : vx;
    s.evy[i] = TUNE.EEL_VY;
    s.eFlags[i] &= ~(FLAG.SHUT | FLAG.GHOST);
    tell(s, i, false, false);
    next(s, i);
  };
  const eelLeap = (ctx, i, dt) => {
    const s = ctx.state, b = s.eBurst[i], basin = ctx.stage.tide.basins[b];
    const lo = basin[0] * CELL + TUNE.EEL_INSET, hi = (basin[1] + 1) * CELL - TUNE.EEL_INSET;
    let x = s.ex[i] + s.evx[i] * dt;
    if (x < lo) { x = lo; s.evx[i] = 0; } else if (x > hi) { x = hi; s.evx[i] = 0; }
    s.ex[i] = x;
    s.ey[i] += s.evy[i] * dt - 0.5 * TUNE.EEL_G * dt * dt;
    s.evy[i] -= TUNE.EEL_G * dt;
    const low = basin[2] * CELL, under = ctx.tideTops[b] - TUNE.EEL_DEPTH, rest = under > low ? under : low;
    if (s.evy[i] < 0 && s.ey[i] <= rest) {
      s.ey[i] = rest; s.evx[i] = 0; s.evy[i] = 0;
      s.eFlags[i] |= FLAG.SHUT | FLAG.GHOST; s.eTimer[i] = TUNE.EEL_REST; s.eRoutine[i] = EEL_LURK;
    }
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // LEVIATHAN: 0 sets it up, 1 submerged, 2 rises, 3 surfaced, 4 destroyed (`bossBreak`).
  const LEV_SUBMERGED = 1;
  // Its basin, by its record's x (`evy`).
  const basinOf = (ctx, i) => ctx.basinAt(Math.floor(ctx.state.evy[i] / CELL));
  // Its facing: along its motion while it moves, else toward the nearest Ooga in play once more than LEV_FACE off its
  // middle along x (hysteresis, so an Ooga over it does not flip it every step).
  const face = (ctx, i) => {
    const s = ctx.state;
    if (s.evx[i] > 0) { s.eAim[i] = RIGHT; return; }
    if (s.evx[i] < 0) { s.eAim[i] = LEFT; return; }
    const p = ctx.nearest(i);
    if (p < 0) return;
    const dx = s.px[p] - s.ex[i];
    if (dx > TUNE.LEV_FACE) s.eAim[i] = RIGHT;
    else if (dx < -TUNE.LEV_FACE) s.eAim[i] = LEFT;
  };
  // Phase 2: at or under half its hit points at spawn.
  const late = (s, i) => s.eHp[i] * 2 <= s.eBurst[i];
  // The FEE_EELs still alive, wherever they are.
  const eelsAlive = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.FEE_EEL && s.eRoutine[j] < EEL_DESTROYED) n++;
    return n;
  };
  // A FEE_EEL let go in a column of basin b the dice pick from those under no raft (event code: it spawns).
  const letEelGo = (ctx, b) => {
    const basin = ctx.stage.tide.basins[b], floats = ctx.stage.tide.floats;
    let open = 0;
    for (let col = basin[0]; col <= basin[1]; col++) if (!rafted(floats, col)) open++;
    if (open === 0) throw new Error(`raid legion lake: the Leviathan's basin ${b} has no column free of a raft for its eels`);
    ctx.roll();
    let k = Math.floor(ctx.dice[0] * open);
    for (let col = basin[0]; col <= basin[1]; col++) {
      if (rafted(floats, col)) continue;
      if (k-- === 0) { ctx.spawn(ENEMY.FEE_EEL, (col + 0.5) * CELL, ctx.tideTops[b], 0); return; }
    }
  };
  const rafted = (floats, col) => {
    for (let f = 0; f < floats.length; f++) if (col >= floats[f][0] && col <= floats[f][1]) return true;
    return false;
  };
  const levInit = (ctx, i) => {
    const s = ctx.state;
    s.evy[i] = s.ex[i];
    const b = basinOf(ctx, i);
    if (b < 0) throw new Error(`raid legion lake: the LEVIATHAN's record at x ${s.ex[i]} m stands in no tide basin`);
    const basin = ctx.stage.tide.basins[b];
    for (let k = 0; k < TUNE.LEV_SPOTS.length; k++) {
      const x = s.ex[i] + TUNE.LEV_SPOTS[k];
      if (x < basin[0] * CELL + TUNE.LEV_INSET - 1e-9 || x > (basin[1] + 1) * CELL - TUNE.LEV_INSET + 1e-9) throw new Error(`raid legion lake: the LEVIATHAN's spot ${k} at x ${x} m lies outside its basin's water`);
    }
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    s.eBurst[i] = s.eHp[i]; s.eAttr[i] = TUNE.LEV_PATTERN.length - 1; s.evx[i] = 0;
    s.ey[i] = ctx.tideTops[b] - TUNE.LEV_DEPTH; s.eTimer[i] = TUNE.LEV_FIRST;
    face(ctx, i);
    next(s, i);
  };
  const levSubmerged = (ctx, i, dt) => {
    const s = ctx.state, b = basinOf(ctx, i);
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    s.ey[i] = ctx.tideTops[b] - TUNE.LEV_DEPTH;
    face(ctx, i);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    // Under the next spot, and an eel let go in phase 2; it rises, seen and still shut.
    s.eAttr[i] = (s.eAttr[i] + 1) % TUNE.LEV_PATTERN.length;
    s.ex[i] = s.evy[i] + TUNE.LEV_SPOTS[TUNE.LEV_PATTERN[s.eAttr[i]]];
    if (late(s, i) && eelsAlive(ctx) < TUNE.LEV_EELS) letEelGo(ctx, b);
    s.eFlags[i] &= ~FLAG.GHOST;
    s.eTimer[i] = TUNE.LEV_RISE;
    tell(s, i, true, true);
    face(ctx, i);
    next(s, i);
  };
  const levRise = (ctx, i, dt) => {
    const s = ctx.state, b = basinOf(ctx, i);
    s.eTimer[i] -= dt;
    face(ctx, i);
    if (s.eTimer[i] > 0) {
      const k = s.eTimer[i] / TUNE.LEV_RISE;   // eased: quick at first, slowing to the top
      s.ey[i] = ctx.tideTops[b] - TUNE.LEV_DEPTH * k * k;
      return;
    }
    s.ey[i] = ctx.tideTops[b];
    s.eFlags[i] &= ~FLAG.SHUT;
    s.eTimer[i] = 0;
    next(s, i);
  };
  const levSurfaced = (ctx, i, dt) => {
    const s = ctx.state, b = basinOf(ctx, i), basin = ctx.stage.tide.basins[b], phase2 = late(s, i);
    const was = s.eTimer[i], t = was + dt, up = phase2 ? TUNE.LEV_UP_LATE : TUNE.LEV_UP;
    const spot = s.evy[i] + TUNE.LEV_SPOTS[TUNE.LEV_PATTERN[s.eAttr[i]]];
    s.eTimer[i] = t;
    s.ey[i] = ctx.tideTops[b];
    if (was < TUNE.LEV_SPIT && t >= TUNE.LEV_SPIT) {
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) {
        const aim = ctx.aimAt(i, p), AIMS = ctx.AIMS;
        for (let k = -1; k <= 1; k++) ctx.spawnFrom(ENEMY.SHOT, i, (aim + k + AIMS) % AIMS);
      }
      s.evz[i] = phase2 ? 1 : 0;
    }
    // Told up to the spit, and past it to the lunge's time only on a surfacing that lunges (phase 2 by the spit).
    const lunges = s.evz[i] !== 0;
    tell(s, i, t < TUNE.LEV_SPIT || lunges && t <= TUNE.LEV_LUNGE_AT, true);
    if (t >= up) {
      // It sinks where it stands: shut and a ghost again, its spot taken up anew when it rises.
      s.evx[i] = 0; s.evz[i] = 0; s.ey[i] = ctx.tideTops[b] - TUNE.LEV_DEPTH;
      s.eFlags[i] = s.eFlags[i] & ~(FLAG.WIND | FLAG.BIG) | FLAG.SHUT | FLAG.GHOST;
      s.eTimer[i] = phase2 ? TUNE.LEV_DOWN_LATE : TUNE.LEV_DOWN;
      s.eRoutine[i] = LEV_SUBMERGED;
      face(ctx, i);
      return;
    }
    const lo = basin[0] * CELL + TUNE.LEV_INSET, hi = (basin[1] + 1) * CELL - TUNE.LEV_INSET, end = TUNE.LEV_LUNGE_AT + TUNE.LEV_LUNGE_T;
    let vx = 0, lunging = false, back = false;
    if (lunges && t > TUNE.LEV_LUNGE_AT && was < end) {
      // The lunge: its way is chosen as it starts, toward the nearest Ooga's side, and held in `eAim` (its facing, which
      // the lunge alone sets meanwhile), so it never turns about at a basin's end, even if the Ooga crosses under it.
      if (was <= TUNE.LEV_LUNGE_AT) {
        const p = ctx.nearest(i);
        if (p >= 0) s.eAim[i] = s.px[p] >= s.ex[i] ? RIGHT : LEFT;
      }
      vx = s.eAim[i] === RIGHT ? TUNE.LEV_LUNGE_V : -TUNE.LEV_LUNGE_V;
      lunging = true;
    } else if (t >= end && s.ex[i] !== spot) {
      // Back to its spot by the time it sinks, at whatever speed that takes, never past it.
      vx = (spot - s.ex[i]) / Math.max(dt, up - was);
      back = true;
    }
    let x = s.ex[i] + vx * dt;
    if (back && (vx > 0 ? x > spot : x < spot)) x = spot;
    if (x < lo) x = lo; else if (x > hi) x = hi;
    s.evx[i] = x === s.ex[i] ? 0 : vx;
    s.ex[i] = x;
    if (!lunging) face(ctx, i);
  };

  register(ENEMY.FEE_EEL, {
    routines: [eelInit, eelLurk, eelLeap, dieStart, dieFade, release], destroyed: EEL_DESTROYED, flags: FLAG.SHUT | FLAG.GHOST,
    hp: 1, tier: 0, points: 300, origin: 0.25, tells: true, charge: EEL_LURK + 1
  });
  register(ENEMY.LEVIATHAN, {
    releases: ["FEE_EEL"],
    routines: [levInit, levSubmerged, levRise, levSurfaced, bossBreak, dieFade, release], destroyed: 4, flags: FLAG.MACHINE | FLAG.SHUT | FLAG.GHOST,
    hp: 48, tier: 3, points: 20000, origin: 0.4, boss: true, scaled: true, title: "The Backlog Leviathan", tells: true
  });

  const LOOK = Object.freeze({
    FEE_EEL: Object.freeze({ lurk: EEL_LURK, leap: 2 }),
    LEVIATHAN: Object.freeze({ submerged: LEV_SUBMERGED, rise: 2, surfaced: 3 })
  });
  BL.raidLegionLake = { TUNE, LOOK };
})();
