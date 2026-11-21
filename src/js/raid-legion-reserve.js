// Ooga Raid's stage 8, The Reserve: its own enemy and its boss, the Chairman's Engine with its two presses and its pod,
// registered with `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no
// state of its own: each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and
// allocates nothing but what a spawn helper does once an event. Built from the stage specs' state machines
// (untracked/ooga-raid-stage-specs/README.md, stage-8.md).
//
//   RAM              armour and a machine, shut for life: a printing press's ram on a ceiling screw. It is a steel block,
//                    so it spends every player shot that meets it and takes no damage (its one hit point is never
//                    spent), and the barrier and the clear-screen leave it alone; it is worth no points. Its record's row
//                    is the floor it slams (`evy` keeps that floor): it waits RAM_WAIT at RAM_UP over it, shakes RAM_WARN,
//                    slams at RAM_SLAM_V to RAM_DOWN over it, holds RAM_HOLD, rises at RAM_RISE_V, and round again,
//                    whatever `attack` is. Its slot frees once its middle is RAM_LEAVE behind the screen's left edge, past the
//                    widest of its tier's boxes (1.594 m either side, the touch box against a prone Ooga), so none is left
//                    on the screen.
//   ENGINE_PRESS     armour and a machine, shut but while down: a ram on the Engine's gantry, a part of the Engine (`eLink`
//                    its slot, `eAttr` 0 for press A, 1 for B). It hangs PRESS_HOME over the Engine's feet, PRESS_X and then
//                    PRESS_STEP more left of it for B (`evy` keeps that height, `evx` the Engine's x it was mounted
//                    from). It tracks the nearest Ooga's x at PRESS_TRACK, held between PRESS_LEFT and PRESS_RIGHT left of
//                    the Engine's x, for PRESS_GAP (its first PRESS_FIRST, B PRESS_STAGGER behind A), shakes PRESS_WARN
//                    where it is, slams at PRESS_SLAM_V until its foot (PRESS_FOOT under its middle) meets the first cell
//                    top that is not empty under its middle (the floor or a perch), opens there for PRESS_HOLD, shuts and
//                    rises at PRESS_RISE_V back to its height.
//   ENGINE_POD       boss tier and a machine, shut, its 40 hit points fixed: the Chairman's chair-pod, docked on the
//                    Engine's mount (POD_DOCK, the sim's F13), not a boss main. When the Engine reaches its pod phase (both
//                    presses gone) it undocks, setting `eAttr` past its one mount so the sim no longer stands it there
//                    (it still dies with the Engine), opens, flies at POD_UNDOCK_V to the right end of its figure of
//                    eight (`evx`, `evy` its speed and `eTimer` the time left) and flies the figure: about POD_AT from the
//                    Engine's x and feet, POD_AX either way along x and POD_AY up and down, POD_T a loop, starting a
//                    quarter loop in (`eTimer` the time along it). It fires an aimed shot every POD_SHOT (`evx` the time
//                    to the next) and lobs a shell at the nearest Ooga's feet every POD_SHELL over SHELL_FLIGHT (`evy`).
//   CHAIRMAN_ENGINE  the boss main (`boss`, a boss tier machine), its hit points by the boss formula (`scaled`). From its
//                    first step the run is in PHASE.BOSS, and it mounts its two presses and its pod as the vault mounts its
//                    guns (`eBurst` the parts still to mount, tried each step until slots are free). Presses: shut and
//                    silent while either press stands. Pod: shut, an aimed shot from ENGINE_TOP_AT every ENGINE_TOP_SHOT
//                    while the pod stands. Core: open, a spread of five (aims ENGINE_SPREAD steps either side of the
//                    aimed one) from its origin every ENGINE_SPREAD_GAP, and a RUNNER in at the screen's left edge, on the
//                    ground standing there, every ENGINE_RUNNER (`evx`) while fewer than ENGINE_RUNNERS runners are alive (the
//                    sim's TUNE.BOSS_RESERVE keeps its shots' slots). Its fall clears the stage (`bossBreak`).
// Every attack is told (raid-enemies.js's `tell`): a ram FLAG.WIND from its warning through its slam (its `charge`), a
// press FLAG.WIND and FLAG.BIG the same; the pod FLAG.WIND for the last TELL_FOR of its shot's and its shell's timers; the
// Engine FLAG.WIND for the last TELL_FOR of its pod-phase gap and FLAG.WIND and FLAG.BIG for the last TELL_FOR_BIG before
// each spread of five, its big attack. Its runners are sent in, not fired.
// Nothing fires while the sim's `attack` is 0, but everything moves, and the Engine sends its runners regardless.
// `BL.raidLegionReserve.TUNE` holds their numbers and `LOOK` the routine index of each state a look depends on, as
// `LOOK[NAME][state]`, by the stage specs' state names (the art reads RAM.warn, ENGINE_PRESS.warn and
// CHAIRMAN_ENGINE.pod).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY, KIND, CELL } = BL.raidStages;
  const { FLAG, register, mount, lobAt, aimShotOff, shotAlong, bossBreak, dieStart, dieFade, release, tell, TELL_FOR, TELL_FOR_BIG } = BL.raidEnemies;

  const TUNE = Object.freeze({
    RAM_UP: 3.5, RAM_DOWN: 1, RAM_WAIT: 2.2, RAM_WARN: 0.5, RAM_SLAM_V: 8, RAM_HOLD: 0.8, RAM_RISE_V: 2.5, RAM_LEAVE: 1.6,
    PRESS_HOME: 4, PRESS_X: 2.5, PRESS_STEP: 2, PRESS_LEFT: 5, PRESS_RIGHT: 1.8, PRESS_TRACK: 1.5, PRESS_FIRST: 1.5,
    PRESS_STAGGER: 2.4, PRESS_WARN: 0.7, PRESS_SLAM_V: 8, PRESS_FOOT: 1, PRESS_HOLD: 1.2, PRESS_RISE_V: 2.5, PRESS_GAP: 2.4,
    // The pod's dock on the Engine, [dx, dy] from its x and feet (its F13 mount), right of the presses' reach so the docked
    // pod's box is clear of either press's sweep; the middle of its figure of eight, [dx, dy] from the same.
    POD_DOCK: Object.freeze([0.4, 3.2]), POD_AT: Object.freeze([-2.95, 3.6]), POD_AX: 1.75, POD_AY: 0.9, POD_T: 6,
    POD_UNDOCK_V: 2, POD_SHOT: 1, POD_SHELL: 3, SHELL_FLIGHT: 1.2,
    // Where the Engine fires from in the pod phase, [dx, dy] from its x and feet (the art puts its muzzle there).
    ENGINE_TOP_AT: Object.freeze([-0.5, 4.5]), ENGINE_TOP_SHOT: 2.5,
    ENGINE_SPREAD: 2, ENGINE_SPREAD_GAP: 1.8, ENGINE_RUNNER: 4, ENGINE_RUNNERS: 3
  });
  const LOOK = Object.freeze({
    RAM: Object.freeze({ up: 1, warn: 2, slam: 3, down: 4, rise: 5 }),
    ENGINE_PRESS: Object.freeze({ track: 1, warn: 2, slam: 3, down: 4, rise: 5 }),
    ENGINE_POD: Object.freeze({ docked: 1, undock: 2, fly: 3 }),
    CHAIRMAN_ENGINE: Object.freeze({ presses: 1, pod: 2, core: 3 })
  });
  const next = (s, i) => { s.eRoutine[i]++; };
  const TWO_PI = 2 * Math.PI, POD_W = TWO_PI / TUNE.POD_T, EPS = 1e-4;
  // The Engine's origin over its feet (its core, which a standing forward shot meets), and its parts: two presses, a pod;
  // its routine from which the pod undocks, and the pod's mounts (one: an undocked pod's `eAttr` is past it).
  const ENGINE_ORIGIN = 1, PRESSES = 2, PARTS = PRESSES + 1, ENGINE_POD_PHASE = LOOK.CHAIRMAN_ENGINE.pod, POD_MOUNTS = [TUNE.POD_DOCK];

  // RAM: 0 sets it up, 1 up, 2 warns, 3 slams, 4 down, 5 rises; 6 destroyed, which a ram shut for life never reaches.
  const RAM_UP = LOOK.RAM.up;
  const ramGone = (ctx, i) => { if (ctx.state.ex[i] < ctx.bounds[0] - TUNE.RAM_LEAVE) ctx.free(i); };
  const ramInit = (ctx, i) => { const s = ctx.state; s.evy[i] = s.ey[i]; s.ey[i] = s.evy[i] + TUNE.RAM_UP; s.eTimer[i] = TUNE.RAM_WAIT; next(s, i); };
  const ramUp = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eTimer[i] = TUNE.RAM_WARN; next(s, i); tell(s, i, true, false); }
    ramGone(ctx, i);
  };
  const ramWarn = (ctx, i, dt) => { const s = ctx.state; s.eTimer[i] -= dt; if (s.eTimer[i] <= 0) next(s, i); ramGone(ctx, i); };
  const ramSlam = (ctx, i, dt) => {
    const s = ctx.state, down = s.evy[i] + TUNE.RAM_DOWN, y = s.ey[i] - TUNE.RAM_SLAM_V * dt;
    if (y <= down) { s.ey[i] = down; s.eTimer[i] = TUNE.RAM_HOLD; next(s, i); tell(s, i, false, false); } else s.ey[i] = y;
    ramGone(ctx, i);
  };
  const ramDown = ramWarn;
  const ramRise = (ctx, i, dt) => {
    const s = ctx.state, home = s.evy[i] + TUNE.RAM_UP, y = s.ey[i] + TUNE.RAM_RISE_V * dt;
    if (y >= home) { s.ey[i] = home; s.eTimer[i] = TUNE.RAM_WAIT; s.eRoutine[i] = RAM_UP; } else s.ey[i] = y;
    ramGone(ctx, i);
  };

  // ENGINE_PRESS: 0 sets it up, 1 tracks, 2 warns, 3 slams, 4 down (open), 5 rises; 6 destroyed.
  const PRESS_TRACK = LOOK.ENGINE_PRESS.track, PRESS_DESTROYED = 6;
  const pressInit = (ctx, i) => {
    const s = ctx.state;
    s.evx[i] = s.ex[s.eLink[i]]; s.evy[i] = s.ey[i]; s.eTimer[i] = TUNE.PRESS_FIRST + s.eAttr[i] * TUNE.PRESS_STAGGER;
    next(s, i);
  };
  const pressTrack = (ctx, i, dt) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p >= 0) {
      const lo = s.evx[i] - TUNE.PRESS_LEFT, hi = s.evx[i] - TUNE.PRESS_RIGHT, reach = TUNE.PRESS_TRACK * dt, dx = s.px[p] - s.ex[i];
      let x = s.ex[i] + (dx > reach ? reach : dx < -reach ? -reach : dx);
      if (x < lo) x = lo; else if (x > hi) x = hi;
      s.ex[i] = x;
    }
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eTimer[i] = TUNE.PRESS_WARN; next(s, i); tell(s, i, true, true); }
  };
  const pressWarn = (ctx, i, dt) => { const s = ctx.state; s.eTimer[i] -= dt; if (s.eTimer[i] <= 0) next(s, i); };
  // Down until its foot meets the highest cell top that is not empty crossed under its middle this step.
  const pressSlam = (ctx, i, dt) => {
    const s = ctx.state, col = Math.floor(s.ex[i] / CELL), foot = s.ey[i] - TUNE.PRESS_FOOT, to = foot - TUNE.PRESS_SLAM_V * dt;
    for (let r = Math.floor(foot / CELL + EPS); r * CELL > to; r--) {
      if (ctx.cellAt(col, r - 1) === KIND.EMPTY) continue;
      s.ey[i] = r * CELL + TUNE.PRESS_FOOT; s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = TUNE.PRESS_HOLD;
      tell(s, i, false, false);
      next(s, i);
      return;
    }
    s.ey[i] = to + TUNE.PRESS_FOOT;
  };
  const pressDown = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eFlags[i] |= FLAG.SHUT; next(s, i); }
  };
  const pressRise = (ctx, i, dt) => {
    const s = ctx.state, y = s.ey[i] + TUNE.PRESS_RISE_V * dt;
    if (y >= s.evy[i]) { s.ey[i] = s.evy[i]; s.eTimer[i] = TUNE.PRESS_GAP; s.eRoutine[i] = PRESS_TRACK; } else s.ey[i] = y;
  };

  // ENGINE_POD: 0 steps on, 1 docked (shut), 2 undocks, 3 flies; 4 destroyed.
  const POD_DESTROYED = 4;
  const podInit = (ctx, i) => { next(ctx.state, i); };
  const podDocked = (ctx, i) => {
    const s = ctx.state;
    if (s.eRoutine[s.eLink[i]] < ENGINE_POD_PHASE) return;
    s.eAttr[i] = POD_MOUNTS.length; s.eFlags[i] &= ~FLAG.SHUT;
    // The flight to the figure's right end, its point a quarter loop in: its speed along x and y, and its time.
    const m = s.eLink[i], dx = s.ex[m] + TUNE.POD_AT[0] + TUNE.POD_AX - s.ex[i], dy = s.ey[m] + TUNE.POD_AT[1] - s.ey[i];
    const t = Math.sqrt(dx * dx + dy * dy) / TUNE.POD_UNDOCK_V;
    s.evx[i] = dx / t; s.evy[i] = dy / t; s.eTimer[i] = t;
    next(s, i);
  };
  // At its speed for its time to the figure's right end, its point a quarter loop in; there it starts the figure.
  const podUndock = (ctx, i, dt) => {
    const s = ctx.state, t = s.eTimer[i] - dt;
    if (t > 0) { s.ex[i] += s.evx[i] * dt; s.ey[i] += s.evy[i] * dt; s.eTimer[i] = t; return; }
    const m = s.eLink[i];
    s.ex[i] = s.ex[m] + TUNE.POD_AT[0] + TUNE.POD_AX; s.ey[i] = s.ey[m] + TUNE.POD_AT[1];
    s.eTimer[i] = TUNE.POD_T / 4; s.evx[i] = TUNE.POD_SHOT; s.evy[i] = TUNE.POD_SHELL;
    next(s, i);
  };
  const podFly = (ctx, i, dt) => {
    const s = ctx.state, m = s.eLink[i];
    let t = s.eTimer[i] + dt;
    if (t >= TUNE.POD_T) t -= TUNE.POD_T;
    s.eTimer[i] = t;
    s.ex[i] = s.ex[m] + TUNE.POD_AT[0] + TUNE.POD_AX * Math.sin(POD_W * t);
    s.ey[i] = s.ey[m] + TUNE.POD_AT[1] + TUNE.POD_AY * Math.sin(2 * POD_W * t);
    const p = ctx.nearest(i);
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) {
      s.evx[i] += TUNE.POD_SHOT;
      if (p >= 0 && s.attack) { s.eAim[i] = ctx.aimAt(i, p); ctx.shootFrom(i); }
    }
    s.evy[i] -= dt;
    if (s.evy[i] <= 0) {
      s.evy[i] += TUNE.POD_SHELL;
      if (p >= 0 && s.attack) lobAt(ctx, i, 1, s.px[p], s.py[p], TUNE.SHELL_FLIGHT);
    }
    tell(s, i, s.evx[i] <= TELL_FOR || s.evy[i] <= TELL_FOR, false);
  };

  // CHAIRMAN_ENGINE: 0 sets it up, 1 presses, 2 pod (both shut), 3 core (open); 4 destroyed (`bossBreak`).
  const RUNNER_DESTROYED = 2;
  // The parts still standing of `type` that slot i mounted, short of `destroyed`, its destroyed routine.
  const standing = (ctx, i, type, destroyed) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === type && s.eLink[j] === i && s.eRoutine[j] < destroyed) n++;
    return n;
  };
  const runners = (ctx) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.RUNNER && s.eRoutine[j] < RUNNER_DESTROYED) n++;
    return n;
  };
  // A RUNNER in at the screen's left edge, in the column just outside it, standing on the highest ground there (on the
  // lock screen the gallery's last step, whose top it runs off onto the Engine's floor); none over a pit.
  const edgeRunner = (ctx) => {
    const x = ctx.bounds[0] - CELL / 2, col = Math.floor(x / CELL);
    for (let r = ctx.stage.rows - 1; r >= 0; r--) {
      if (ctx.cellAt(col, r) === KIND.EMPTY) continue;
      ctx.spawn(ENEMY.RUNNER, x, (r + 1) * CELL, 0);
      return;
    }
  };
  // Press A, press B, then the pod, as slots allow (`eBurst` counting those still to mount), each linked to slot i.
  const mountParts = (ctx, i) => {
    const s = ctx.state;
    while (s.eBurst[i] > 0) {
      const k = PARTS - s.eBurst[i];
      let j;
      if (k < PRESSES) {
        j = ctx.spawn(ENEMY.ENGINE_PRESS, s.ex[i] - TUNE.PRESS_X - k * TUNE.PRESS_STEP, s.ey[i] + TUNE.PRESS_HOME, k);
        if (j >= 0) s.eLink[j] = i;
      } else j = mount(ctx, i, ENEMY.ENGINE_POD, 0);
      if (j < 0) return;
      s.eBurst[i]--;
    }
  };
  const engineInit = (ctx, i) => {
    const s = ctx.state;
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    s.eBurst[i] = PARTS; s.eTimer[i] = 0; s.evx[i] = 0;
    mountParts(ctx, i);
    next(s, i);
  };
  const enginePresses = (ctx, i) => {
    const s = ctx.state;
    mountParts(ctx, i);
    if (s.eBurst[i] > 0 || standing(ctx, i, ENEMY.ENGINE_PRESS, PRESS_DESTROYED) > 0) return;
    s.eTimer[i] = TUNE.ENGINE_TOP_SHOT;
    next(s, i);
  };
  const enginePod = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] += TUNE.ENGINE_TOP_SHOT;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) aimShotOff(ctx, i, TUNE.ENGINE_TOP_AT[0], TUNE.ENGINE_TOP_AT[1], p);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (standing(ctx, i, ENEMY.ENGINE_POD, POD_DESTROYED) > 0) return;
    s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = TUNE.ENGINE_SPREAD_GAP; s.evx[i] = TUNE.ENGINE_RUNNER;
    tell(s, i, false, false);
    next(s, i);
  };
  const engineCore = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] += TUNE.ENGINE_SPREAD_GAP;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) {
        const aim = ctx.aimAt(i, p);
        for (let k = -TUNE.ENGINE_SPREAD; k <= TUNE.ENGINE_SPREAD; k++) shotAlong(ctx, i, 0, ENGINE_ORIGIN, aim + k);
      }
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true);
    s.evx[i] -= dt;
    if (s.evx[i] <= 0) {
      s.evx[i] += TUNE.ENGINE_RUNNER;
      if (runners(ctx) < TUNE.ENGINE_RUNNERS) edgeRunner(ctx);
    }
  };

  register(ENEMY.RAM, {
    routines: [ramInit, ramUp, ramWarn, ramSlam, ramDown, ramRise, dieStart, dieFade, release], destroyed: 6,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 1, tier: 2, points: 0, origin: 0, tells: true, charge: LOOK.RAM.slam
  });
  register(ENEMY.ENGINE_PRESS, {
    routines: [pressInit, pressTrack, pressWarn, pressSlam, pressDown, pressRise, dieStart, dieFade, release], destroyed: PRESS_DESTROYED,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 12, tier: 2, points: 2000, origin: 0, main: ENEMY.CHAIRMAN_ENGINE, tells: true, charge: LOOK.ENGINE_PRESS.slam
  });
  register(ENEMY.ENGINE_POD, {
    routines: [podInit, podDocked, podUndock, podFly, dieStart, dieFade, release], destroyed: POD_DESTROYED,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 40, tier: 3, points: 6000, origin: 0, mounts: POD_MOUNTS, main: ENEMY.CHAIRMAN_ENGINE, tells: true
  });
  register(ENEMY.CHAIRMAN_ENGINE, {
    releases: ["ENGINE_PRESS", "ENGINE_POD"],
    routines: [engineInit, enginePresses, enginePod, engineCore, bossBreak, dieFade, release], destroyed: 4,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 64, tier: 3, points: 30000, origin: ENGINE_ORIGIN, boss: true, scaled: true, title: "The Chairman's Engine", tells: true
  });

  BL.raidLegionReserve = { TUNE, LOOK };
})();
