// Ooga Raid's stage 5, The Lightning Factory Floor: its own enemies and its boss, the Grid Warden and its two
// capacitors, registered with `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in
// Node, with no state of its own: each routine reads and writes the sim's `state` through the context raid-enemies.js
// lists, and allocates nothing but what a spawn helper does once an event. Built from the stage specs' state
// machines (untracked/ooga-raid-stage-specs/README.md, stage-5.md).
//
//   ARC_PYLON    an emplacement and a machine, a copper coil on a ceramic stack, `emplaced` (raid-enemies.js's
//                `emplaceWait`: shut until the screen brings it in, then open). PYLON_FIRST after it opens it starts
//                charging (routine 2, the view's glow) for PYLON_CHARGE, then sends a SPARK along the surface it stands on
//                from its feet toward the nearest Ooga's side (attr 0 right, 1 left; the field troops' SPARK runs it), and
//                rests PYLON_GAP before it charges again.
//   CAPACITOR    an emplacement and a machine, a glass jar of lightning on the Warden's flank: a part (its `main` the
//                GRID_WARDEN, `eLink` the Warden's slot) the sim stands on its mount (`mounts`, by `eAttr`: the upper jar
//                CAP_UPPER, the lower CAP_LOWER) each step. It does nothing of its own: the Warden sets and clears its
//                SHUT, and arms its pair as it discharges (`eBurst` the shots left, `eTimer` the seconds to the next), which
//                it then fires at the nearest Ooga, CAP_GAP apart.
//   GRID_WARDEN  the boss main (`boss`, a boss tier machine), its hit points by the boss formula (`scaled`), an arc tower
//                against the far wall. From its first step the run is in PHASE.BOSS and it mounts its two CAPACITORs
//                (tried each step until slots are free, `eAttr` counting those mounted, each mounted shut while it is
//                shut). Guard (routine 1, WARDEN_GUARD long): it and its jars are shut; every WARDEN_SPARK it sends a SPARK
//                left along the floor from WARDEN_SPARK_FROM while fewer than SPARK_MAX run, and every WARDEN_SHOT an aimed
//                shot from its tower top, WARDEN_MUZZLE (`aimShotOff`). Then charge (routine 2): it and its standing jars
//                open, nothing fires, for WARDEN_CHARGE and WARDEN_CHARGE_CAP more for each jar destroyed; at its end it
//                discharges, each standing jar its pair and the tower a spread of three from its top (aimed, and a step
//                either side, `shotAlong`), and goes back to guard, shut, while a jar stands, or else into overload
//                (routine 3): open for good, a spark every WARDEN_SPARK_LATE and a spread of three every WARDEN_SPREAD.
//                Its fall clears the stage (`bossBreak`, routine 4). `eTimer` counts down the guard and the charge (the
//                art brightens the jars on it), `evx` the next spark and `evy` the next tower shot or spread.
// Every attack is told (raid-enemies.js's `tell`): a pylon holds FLAG.WIND through its charge; the Warden FLAG.WIND for
// the last TELL_FOR of its spark's and its aimed shot's timers, FLAG.WIND and FLAG.BIG through all its charge (the
// discharge, its big attack) and for the last TELL_FOR_BIG before each overload spread; its jars FLAG.WIND and FLAG.BIG
// from the charge's start until their pair is fired.
// Nothing fires while the sim's `attack` is 0, but the timers run. `BL.raidLegionFactory.TUNE` holds their numbers (the
// art reads WARDEN_MUZZLE and WARDEN_SPARK_FROM, [dx, dy] from the Warden's x and feet), and `LOOK[NAME][state]` the
// routine index of each README state (the art reads them by name).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY } = BL.raidStages;
  const { FLAG, register, mount, aimShotOff, shotAlong, bossBreak, dieStart, dieFade, release, emplaceWait, emplaceOpen, emplaceLeave, emplaceShut, tell, TELL_FOR, TELL_FOR_BIG } = BL.raidEnemies;

  const TUNE = Object.freeze({
    PYLON_FIRST: 1.2, PYLON_CHARGE: 0.6, PYLON_GAP: 2.4,
    CAP_PAIR: 2, CAP_GAP: 0.15, CAP_UPPER: 0, CAP_LOWER: 1,
    WARDEN_GUARD: 3.2, WARDEN_CHARGE: 2, WARDEN_CHARGE_CAP: 1, WARDEN_SPARK: 1, WARDEN_SHOT: 1.6,
    WARDEN_SPARK_LATE: 0.8, WARDEN_SPREAD: 1.6, SPARK_MAX: 3,
    // From the Warden's x and feet: its tower top (the aimed shot and the spreads leave there) and where its sparks start.
    WARDEN_MUZZLE: Object.freeze([-0.5, 4]), WARDEN_SPARK_FROM: Object.freeze([-1, 0]),
    // The jars' mounts, [dx, dy] from the Warden's x and feet by `eAttr`: the upper and the lower.
    CAP_MOUNTS: Object.freeze([Object.freeze([-1.4, 3.2]), Object.freeze([-1.4, 2])])
  });
  // The routine index of each README state, by type, for the art.
  const LOOK = Object.freeze({
    ARC_PYLON: Object.freeze({ wait: 0, open: 1, init: 2, idle: 3, charge: 4, shut: 5, destroyed: 6 }),
    CAPACITOR: Object.freeze({ init: 0, hold: 1, destroyed: 2 }),
    GRID_WARDEN: Object.freeze({ init: 0, guard: 1, charge: 2, overload: 3, destroyed: 4 })
  });
  const PYLON = LOOK.ARC_PYLON, CAP = LOOK.CAPACITOR, WARDEN = LOOK.GRID_WARDEN;
  const CAPS = TUNE.CAP_MOUNTS.length, RIGHT = 0, LEFT = 1;
  const MX = TUNE.WARDEN_MUZZLE[0], MY = TUNE.WARDEN_MUZZLE[1], SX = TUNE.WARDEN_SPARK_FROM[0], SY = TUNE.WARDEN_SPARK_FROM[1];
  const next = (s, i) => { s.eRoutine[i]++; };

  // ARC_PYLON: 0 waits shut, 1 opens, 2 sets it up, 3 idle, 4 charging, 5 shut for good, 6 destroyed.
  const pylonInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.PYLON_FIRST; next(s, i); };
  const pylonIdle = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eTimer[i] += TUNE.PYLON_CHARGE; s.eRoutine[i] = PYLON.charge; }
    tell(s, i, s.eRoutine[i] === PYLON.charge, false);
    emplaceLeave(ctx, i);
  };
  const pylonCharge = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) ctx.spawn(ENEMY.SPARK, s.ex[i], s.ey[i], s.px[p] < s.ex[i] ? LEFT : RIGHT);
      s.eTimer[i] += TUNE.PYLON_GAP; s.eRoutine[i] = PYLON.idle;
    }
    tell(s, i, s.eRoutine[i] === PYLON.charge, false);
    emplaceLeave(ctx, i);
  };

  // CAPACITOR: 0 steps on, 1 holds, firing the pair the Warden arms; 2 destroyed. Its SHUT is the Warden's alone.
  const capInit = (ctx, i) => { next(ctx.state, i); };
  const capHold = (ctx, i, dt) => {
    const s = ctx.state;
    if (s.eBurst[i] === 0) return;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eBurst[i]--;
    s.eTimer[i] += TUNE.CAP_GAP;
    const p = ctx.nearest(i);
    if (p >= 0 && s.attack) { s.eAim[i] = ctx.aimAt(i, p); ctx.shootFrom(i); }
    if (s.eBurst[i] === 0) tell(s, i, false, false);
  };

  // GRID_WARDEN: 0 sets it up, 1 guard, 2 charge, 3 overload, 4 destroyed (`bossBreak`).
  // Its jars still standing; and each standing jar opened (`open`) or shut, and armed to fire its pair (`arm`).
  const capsUp = (ctx, i) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.CAPACITOR && s.eLink[j] === i && s.eRoutine[j] < CAP.destroyed) n++;
    return n;
  };
  const setCaps = (ctx, i, open, arm) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) {
      if (s.eType[j] !== ENEMY.CAPACITOR || s.eLink[j] !== i || s.eRoutine[j] >= CAP.destroyed) continue;
      if (open) s.eFlags[j] &= ~FLAG.SHUT; else s.eFlags[j] |= FLAG.SHUT;
      if (arm) { s.eBurst[j] = TUNE.CAP_PAIR; s.eTimer[j] = 0; }
      else if (open) tell(s, j, true, true);   // the charge starts: told until its pair is fired
    }
  };
  // Mounts the jars not yet mounted as slots allow, each shut or open as the Warden is.
  const mountCaps = (ctx, i) => {
    const s = ctx.state;
    while (s.eAttr[i] < CAPS) {
      const k = mount(ctx, i, ENEMY.CAPACITOR, s.eAttr[i]);
      if (k < 0) return;
      if (!(s.eFlags[i] & FLAG.SHUT)) s.eFlags[k] &= ~FLAG.SHUT;
      if (s.eRoutine[i] === WARDEN.charge) tell(s, k, true, true);   // mounted mid-charge: told with its pair
      s.eAttr[i]++;
    }
  };
  // Every live SPARK counts toward SPARK_MAX, a pylon's too: no pylon stands on the Warden's screen. A future stage that puts
  // a pylon near a boss must tie the cap to the Warden's own sparks through `eLink`.
  const sparksRunning = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.SPARK) n++;
    return n;
  };
  const spark = (ctx, i) => {
    const s = ctx.state;
    if (s.attack && sparksRunning(ctx) < TUNE.SPARK_MAX) ctx.spawn(ENEMY.SPARK, s.ex[i] + SX, s.ey[i] + SY, LEFT);
  };
  // A spread of three from the tower top: the aimed shot (`aimShotOff`, whose SHOT holds its snapped aim step in `eAttr`)
  // and one a step either side of it (none when the aimed shot found no slot).
  const spread = (ctx, i) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p < 0 || !s.attack) return;
    const k = aimShotOff(ctx, i, MX, MY, p);
    if (k < 0) return;
    const aim = s.eAttr[k];
    shotAlong(ctx, i, MX, MY, aim - 1); shotAlong(ctx, i, MX, MY, aim + 1);
  };
  const guard = (s, i) => {
    s.eFlags[i] |= FLAG.SHUT; s.eTimer[i] = TUNE.WARDEN_GUARD; s.evx[i] = TUNE.WARDEN_SPARK; s.evy[i] = TUNE.WARDEN_SHOT;
    s.eRoutine[i] = WARDEN.guard;
  };
  const wardenInit = (ctx, i) => {
    const s = ctx.state;
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    s.eAttr[i] = 0;
    guard(s, i);
    mountCaps(ctx, i);
  };
  const wardenGuard = (ctx, i, dt) => {
    const s = ctx.state;
    mountCaps(ctx, i);
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) { s.evx[i] += TUNE.WARDEN_SPARK; spark(ctx, i); }
    s.evy[i] -= dt;
    if (s.evy[i] <= 0) {
      s.evy[i] += TUNE.WARDEN_SHOT;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) aimShotOff(ctx, i, MX, MY, p);
    }
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) { tell(s, i, s.evx[i] <= TELL_FOR || s.evy[i] <= TELL_FOR, false); return; }
    // The charge: longer by a second for each jar destroyed (those mounted, less those standing).
    s.eTimer[i] = TUNE.WARDEN_CHARGE + TUNE.WARDEN_CHARGE_CAP * (s.eAttr[i] - capsUp(ctx, i));
    s.eFlags[i] &= ~FLAG.SHUT;
    setCaps(ctx, i, true, false);
    s.eRoutine[i] = WARDEN.charge;
    tell(s, i, true, true);
  };
  const wardenCharge = (ctx, i, dt) => {
    const s = ctx.state;
    mountCaps(ctx, i);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    // The discharge: each standing jar its pair, the tower its spread; then guard again while a jar stands (or is still to
    // mount), else overload.
    const stays = capsUp(ctx, i) > 0 || s.eAttr[i] < CAPS;
    setCaps(ctx, i, !stays, true);
    spread(ctx, i);
    if (stays) { guard(s, i); tell(s, i, false, false); return; }
    s.evx[i] = TUNE.WARDEN_SPARK_LATE; s.evy[i] = TUNE.WARDEN_SPREAD; s.eTimer[i] = 0;
    s.eRoutine[i] = WARDEN.overload;
    tell(s, i, false, false);
  };
  const wardenOverload = (ctx, i, dt) => {
    const s = ctx.state;
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) { s.evx[i] += TUNE.WARDEN_SPARK_LATE; spark(ctx, i); }
    s.evy[i] -= dt;
    if (s.evy[i] <= 0) { s.evy[i] += TUNE.WARDEN_SPREAD; spread(ctx, i); }
    tell(s, i, s.evx[i] <= TELL_FOR || s.evy[i] <= TELL_FOR_BIG, s.evy[i] <= TELL_FOR_BIG);
  };

  register(ENEMY.ARC_PYLON, {
    releases: ["SPARK"],
    routines: [emplaceWait, emplaceOpen, pylonInit, pylonIdle, pylonCharge, emplaceShut, dieStart, dieFade, release], destroyed: PYLON.destroyed,
    flags: FLAG.MACHINE | FLAG.SHUT, emplaced: true, hp: 6, tier: 1, points: 1000, origin: 0.35, tells: true
  });
  register(ENEMY.CAPACITOR, {
    routines: [capInit, capHold, dieStart, dieFade, release], destroyed: CAP.destroyed, flags: FLAG.MACHINE | FLAG.SHUT,
    hp: 8, tier: 1, points: 1000, origin: 0, mounts: TUNE.CAP_MOUNTS, main: ENEMY.GRID_WARDEN, tells: true
  });
  register(ENEMY.GRID_WARDEN, {
    releases: ["CAPACITOR", "SPARK"],
    routines: [wardenInit, wardenGuard, wardenCharge, wardenOverload, bossBreak, dieFade, release], destroyed: WARDEN.destroyed,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 44, tier: 3, points: 18000, origin: 1, boss: true, scaled: true, title: "The Grid Warden", tells: true
  });

  BL.raidLegionFactory = { TUNE, LOOK };
})();
