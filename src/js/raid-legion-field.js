// Ooga Raid's field troops, shared by stages 5 to 8: the Auditor, the Tax Collector, the Repo Truck and the Spark,
// registered with `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no
// state of its own: each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and
// allocates nothing but what a spawn helper does once an event.
//
// Built from the stage specs' state machines (untracked/ooga-raid-stage-specs/README.md) for the field troops
// every side stage from 5 to 8 sends. `TUNE` holds their numbers; `LOOK` the routine index of each state a look depends
// on, as `LOOK[NAME][state]` (raid-art-field.js reads it at load).
//
//   AUDITOR        fodder, a clerk behind a door-sized clipboard: a front shield (FLAG.SHIELD) on the side it faces, its
//                  `eAim` 0 (right) or AIMS / 2 (left), turned toward the nearest Ooga every step. AUDITOR_FIRST after it
//                  appears it winds up for AUDITOR_WIND and lobs its clipboard (a LOB, attr 0) to land on the nearest
//                  Ooga's feet after CLIPBOARD_FLIGHT, and again every AUDITOR_GAP (dealt from the dice, three quarters
//                  to five quarters of it). Between throws it walks toward the Ooga at AUDITOR_V, the way it faces; it
//                  stands instead, still facing the Ooga, at a wall, at a ledge's end, within AUDITOR_STOP of the Ooga
//                  along x, and in the air. `evx` is the speed it walked at this step, 0 standing. Belted.
//   TAX_COLLECTOR  fodder, a sprinter: it sets off toward the nearest Ooga at TAX_V and never turns toward it again.
//                  Grounded, it jumps (TUNE.JUMP_V, the Ooga's own arc) when the cell under its feet half a cell ahead
//                  is empty (a hatch, a ledge's end) or when the cell ahead at its feet is solid and the wall there is
//                  no higher than TAX_CLIMB (a step it can climb); it presses on against a wall that low and turns back
//                  only at one higher. It falls and frees as RUNNER does. Belted.
//   REPO_TRUCK     armour and a machine: a tow truck that drives left at TRUCK_V, falling as a walker, and parks as a
//                  gate after TRUCK_RUN, or sooner where TRUCK_LOOK ahead of its front (TRUCK_NOSE ahead of its x, the
//                  front of its box) is a pit or a solid cell at its feet, so its cab never stands in a wall or over a
//                  pit.
//                  Driving or parked, every TRUCK_DROP it lets a RUNNER out at TRUCK_TROOP_X behind it while it has any
//                  of its TRUCK_TROOPS left and `attack` holds (a drop skipped, for no attack, no free slot or a spawn
//                  point inside solid ground, a wall close behind it, keeps its runner for the next). `eTimer` is the seconds since it appeared: driving at a fixed speed, that is
//                  also how far it has driven (TRUCK_V of it a second), so it needs no stored start; `eBurst` the
//                  runners it still holds. TRUCK_NOSE is the armour tier's bullet box's front, -RULES.SHOT_BOX[2][0]
//                  in raid-sim.js (43 of the reference's pixels, 32 to the metre), which loads after this file: a
//                  truck's first routine throws if the two ever part, and the art reads it here.
//   SPARK          a shot's tier: an arc of light that runs along the floor it was put on at SPARK_V (attr 0 right, 1
//                  left), holding its height, and is gone where the cell under it is empty (a hatch, an edge), where a
//                  solid cell stands at its feet (a wall), after SPARK_LIFE, or off the screen. Any jump clears it.
// The Auditor tells its throw (raid-enemies.js's `tell`): FLAG.WIND from TELL_FOR before it, the end of its walk and all its
// wind-up. The truck's runners and the Spark are no attack of their own to tell (a pylon or the Warden tells a Spark).
// Nothing fires while the sim's `attack` is 0, but everything moves.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY, KIND, CELL } = BL.raidStages;
  const { FLAG, register, lobAt, dieStart, dieFade, release, tell, TELL_FOR } = BL.raidEnemies;

  const TUNE = Object.freeze({
    AUDITOR_FIRST: 1.2, AUDITOR_V: 0.9, AUDITOR_STOP: 2.5, AUDITOR_WIND: 0.3, AUDITOR_GAP: 2.2, CLIPBOARD_FLIGHT: 0.9,
    TAX_V: 2.5, TAX_CLIMB: 1,
    TRUCK_V: 1.2, TRUCK_DROP: 1.6, TRUCK_TROOPS: 4, TRUCK_RUN: 3, TRUCK_LOOK: 0.75, TRUCK_TROOP_X: 1.5, TRUCK_NOSE: 43 / 32,
    SPARK_V: 4, SPARK_LIFE: 3
  });
  // Each routine's index, by the state a look depends on.
  const LOOK = Object.freeze({
    SPARK: Object.freeze({ run: 1 }),
    REPO_TRUCK: Object.freeze({ drive: 1, parked: 2 })
  });

  const next = (s, i) => { s.eRoutine[i]++; };
  // A body's feet row (the first cell over what it stands on), a hair over its y so a stored height on a cell's top reads
  // as that cell; the climb in whole rows; the facings (enemy aims) a shield takes.
  const EPS = 1e-4, HALF_CELL = CELL / 2, CLIMB_ROWS = Math.round(TUNE.TAX_CLIMB / CELL);
  if (Math.abs(CLIMB_ROWS * CELL - TUNE.TAX_CLIMB) > 1e-9) throw new Error("raid legion field: TAX_CLIMB is no whole number of cells");
  const RIGHT = 0;
  const feetRow = (y) => Math.floor(y / CELL + EPS);

  // AUDITOR: 0 sets it up, 1 advances, 2 winds up, 3 destroyed.
  const ADVANCE = 1, WINDUP = 2;
  // Turns slot i to face Ooga p (none, or straight over it: as it was).
  const auditorFace = (ctx, i, p) => {
    const s = ctx.state;
    if (p < 0 || s.px[p] === s.ex[i]) return;
    const face = s.px[p] < s.ex[i] ? ctx.AIMS / 2 : RIGHT;
    s.eAim[i] = face;
  };
  const auditorInit = (ctx, i) => {
    const s = ctx.state;
    s.eAim[i] = RIGHT;   // with no Ooga, right
    auditorFace(ctx, i, ctx.nearest(i));
    s.evx[i] = 0; s.eTimer[i] = TUNE.AUDITOR_FIRST;
    next(s, i);
  };
  const auditorAdvance = (ctx, i, dt) => {
    const s = ctx.state, p = ctx.nearest(i);
    auditorFace(ctx, i, p);
    s.evx[i] = 0;
    const near = p >= 0 && Math.abs(s.px[p] - s.ex[i]) <= TUNE.AUDITOR_STOP;
    if (!near && s.evy[i] === 0) {
      s.evx[i] = s.eAim[i] === RIGHT ? TUNE.AUDITOR_V : -TUNE.AUDITOR_V;
      if (ctx.walled(i, dt)) s.evx[i] = 0;   // a wall: it stands, facing the Ooga
      else {
        const x = s.ex[i] + s.evx[i] * dt;
        if (ctx.cellAt(Math.floor(x / CELL), feetRow(s.ey[i]) - 1) === KIND.EMPTY) s.evx[i] = 0;   // a ledge's end: it stands
        else s.ex[i] = x;
      }
    }
    ctx.fall(i, dt);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eTimer[i] = TUNE.AUDITOR_WIND; s.eRoutine[i] = WINDUP; }
    tell(s, i, s.eRoutine[i] === WINDUP || s.eTimer[i] <= TELL_FOR - TUNE.AUDITOR_WIND, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const auditorWindup = (ctx, i, dt) => {
    const s = ctx.state, p = ctx.nearest(i);
    auditorFace(ctx, i, p);
    s.evx[i] = 0;
    ctx.fall(i, dt);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      if (p >= 0 && s.attack) lobAt(ctx, i, 0, s.px[p], s.py[p], TUNE.CLIPBOARD_FLIGHT);
      ctx.roll();
      s.eTimer[i] = TUNE.AUDITOR_GAP * (0.75 + 0.5 * ctx.dice[0]);
      s.eRoutine[i] = ADVANCE;
    }
    tell(s, i, s.eRoutine[i] === WINDUP || s.eTimer[i] <= TELL_FOR - TUNE.AUDITOR_WIND, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // TAX_COLLECTOR: 0 sets it off, 1 runs, 2 destroyed.
  const taxInit = (ctx, i) => {
    const s = ctx.state, p = ctx.nearest(i);
    s.evx[i] = (p >= 0 && s.px[p] < s.ex[i] ? -1 : 1) * TUNE.TAX_V;
    next(s, i);
  };
  const taxRun = (ctx, i, dt) => {
    const s = ctx.state, x = s.ex[i], k = feetRow(s.ey[i]);
    if (s.evy[i] === 0) {
      // Half a cell ahead (x + half or x - half, never a choice between the two: see `walled`).
      const ahead = Math.floor((s.evx[i] > 0 ? x + HALF_CELL : x - HALF_CELL) / CELL);
      if (ctx.cellAt(ahead, k - 1) === KIND.EMPTY ||
        (ctx.cellAt(ahead, k) === KIND.SOLID && ctx.cellAt(ahead, k + CLIMB_ROWS) !== KIND.SOLID)) s.evy[i] = ctx.TUNE.JUMP_V;
    }
    if (ctx.walled(i, dt)) {
      // Against a wall: it turns back only where the wall stands higher than it climbs, else presses on as it rises.
      const half = ctx.RULES.BOX[ctx.POSE.STAND][0], to = x + s.evx[i] * dt, lead = s.evx[i] > 0 ? to + half : to - half;
      if (ctx.cellAt(Math.floor(lead / CELL), k + CLIMB_ROWS) === KIND.SOLID) s.evx[i] = -s.evx[i];
    } else s.ex[i] = x + s.evx[i] * dt;
    ctx.fall(i, dt);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // REPO_TRUCK: 0 sets it up, 1 drives, 2 parked, 3 destroyed.
  const PARKED = 2;
  const truckInit = (ctx, i) => {
    const s = ctx.state, front = -ctx.RULES.SHOT_BOX[ctx.RULES.TIER.ARMOUR][0];
    if (front !== TUNE.TRUCK_NOSE) throw new Error(`raid legion field: TRUCK_NOSE ${TUNE.TRUCK_NOSE} is not the armour box's front, ${front}`);
    s.evx[i] = -TUNE.TRUCK_V; s.eTimer[i] = 0; s.eBurst[i] = TUNE.TRUCK_TROOPS;
    next(s, i);
  };
  // The truck's clock on by dt, and a runner out behind it at each TRUCK_DROP it passes, while it holds one and `attack`.
  const truckDrop = (ctx, i, dt) => {
    const s = ctx.state, was = s.eTimer[i];
    s.eTimer[i] = was + dt;
    if (Math.floor(s.eTimer[i] / TUNE.TRUCK_DROP) === Math.floor(was / TUNE.TRUCK_DROP) || s.eBurst[i] === 0 || !s.attack) return;
    // A runner standing in solid ground (from its feet to its head in that column) would stick there: it waits.
    const x = s.ex[i] + TUNE.TRUCK_TROOP_X;
    if (ctx.wallAt(x, s.ey[i], ctx.RULES.BOX[ctx.POSE.STAND][1])) return;
    if (ctx.spawn(ENEMY.RUNNER, x, s.ey[i], 0) >= 0) s.eBurst[i]--;
  };
  const truckPark = (s, i) => { s.evx[i] = 0; s.eRoutine[i] = PARKED; };
  const truckDrive = (ctx, i, dt) => {
    const s = ctx.state;
    let parked = false;
    if (s.evy[i] === 0) {
      const col = Math.floor((s.ex[i] - TUNE.TRUCK_NOSE - TUNE.TRUCK_LOOK) / CELL), k = feetRow(s.ey[i]);
      if (ctx.cellAt(col, k - 1) === KIND.EMPTY || ctx.cellAt(col, k) === KIND.SOLID) { truckPark(s, i); parked = true; }
    }
    if (!parked) s.ex[i] += s.evx[i] * dt;
    ctx.fall(i, dt);
    truckDrop(ctx, i, dt);
    // Driven TRUCK_RUN (to the nearest step: within half a step's drive of it), it parks.
    if (!parked && TUNE.TRUCK_V * s.eTimer[i] > TUNE.TRUCK_RUN - TUNE.TRUCK_V * dt / 2) truckPark(s, i);
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const truckParked = (ctx, i, dt) => {
    ctx.fall(i, dt);
    truckDrop(ctx, i, dt);
    if (ctx.offScreen(i)) ctx.free(i);
  };

  // SPARK: 0 sets it running, 1 runs, 2 released.
  const sparkInit = (ctx, i) => {
    const s = ctx.state, a = s.eAttr[i];
    if (a > 1) throw new Error(`raid legion field: a SPARK's attr is 0 (right) or 1 (left), not ${a}`);
    s.evx[i] = a === 0 ? TUNE.SPARK_V : -TUNE.SPARK_V; s.evy[i] = 0; s.eTimer[i] = TUNE.SPARK_LIFE;
    next(s, i);
  };
  const sparkRun = (ctx, i, dt) => {
    const s = ctx.state, x = s.ex[i] + s.evx[i] * dt, col = Math.floor(x / CELL), k = feetRow(s.ey[i]);
    s.ex[i] = x;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0 || ctx.cellAt(col, k - 1) === KIND.EMPTY || ctx.cellAt(col, k) === KIND.SOLID || ctx.offScreen(i)) ctx.free(i);
  };

  register(ENEMY.AUDITOR, {
    routines: [auditorInit, auditorAdvance, auditorWindup, dieStart, dieFade, release], destroyed: 3, flags: FLAG.SHIELD,
    hp: 1, tier: 0, points: 300, origin: 0.5, belted: true, tells: true
  });
  register(ENEMY.TAX_COLLECTOR, {
    routines: [taxInit, taxRun, dieStart, dieFade, release], destroyed: 2,
    hp: 1, tier: 0, points: 200, origin: 0.5, belted: true
  });
  register(ENEMY.REPO_TRUCK, {
    routines: [truckInit, truckDrive, truckParked, dieStart, dieFade, release], destroyed: 3, flags: FLAG.MACHINE,
    hp: 12, tier: 2, points: 2000, origin: 1
  });
  register(ENEMY.SPARK, {
    routines: [sparkInit, sparkRun, release], destroyed: 2,
    hp: 0, tier: 4, points: 0, origin: 0.15
  });

  BL.raidLegionField = { TUNE, LOOK };
})();
