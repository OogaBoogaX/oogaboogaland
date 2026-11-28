// Ooga Raid's enemies: each type's numbered routines, run by `raid-sim.js` one routine a slot a step. Pure, loadable in
// Node, with no state of its own: everything a routine reads or writes is on the sim's `state`, reached through the
// context the sim builds once in `create` and passes to every call, so a routine allocates nothing.
//
// `register(type, def)` files a type under its ENEMY value in `TYPES`, before `raid-sim.js` loads: the sim calls `close()`
// at its own load, after which a registration throws, and it refuses to load with an ENEMY value no def covers. A
// type that is not an ENEMY value is refused. A def is
//   { routines: [(ctx, slot, dt) => void, ...], destroyed, flags, hp, tier, points, origin, boss, scaled, mounts, swell,
//     main, emplaced, belted, standTouch, solid, releases, title }:
// `routines[eRoutine]` runs each step, index 0 sets the slot up, `destroyed` is the routine a slot goes to at 0 hit
// points (from there nothing hits it again), and `flags` are the FLAG bits a slot starts with, set by the sim's `spawn`
// itself. The rule sheet's types take their hit points, tier, points and box origin from the sim's RULES by their ENEMY
// name and leave those four out (the sim throws at load on a def that gives one RULES names); a type the sheet does not
// name gives all four of its own (the sim throws at load on one left out). Four are for bosses, all optional:
//   boss     true for a boss main: its placed record waits for a free slot rather than being dropped, and its destroyed
//            routine must be `bossBreak`, which clears the stage on any kind (the sim throws at load otherwise)
//   scaled   true for hit points by the boss formula, set as it spawns: `hp` + RULES.BOSS_HP_STRENGTH a point of the
//            strongest weapon the joined players hold + the loops completed, up to RULES.BOSS_HP_LOOPS
//   mounts   `[[dx, dy], ...]` by `eAttr`, for a part that follows its main: while `eLink` names a main, the sim stands
//            the part at the main's x + dx, y + dy each step before it acts, and when the main is destroyed (or gone) the
//            part goes to its own destroyed routine, for no points. `mount(ctx, main, type, attr)` puts one on.
//   swell    a share, 0 or more, for a type with hit points whose boxes grow as it is hit, about its origin, by 1 + swell
//            times the share of its hit points gone, so to 1 + swell * (1 - 1 / its hit points at spawn) times their size
//            at its last hit point: the sim keeps its hit points at spawn in `eBurst`, which its routines then only read
//   main     the ENEMY value of the boss main a boss part belongs to (the sim refuses one that names no boss main). A part
//            always carries `eLink` naming a slot of its main (the view knows parts by it): the sim throws on stepping a
//            part, short of its destroyed routine, whose `eLink` names no such slot, so a main sets it as it spawns the part
//            (`mount` does), and a part is never placed; it dies with its main, for no points, mounted or not
// and one for emplacements:
//   emplaced true for a gun the screen brings in shut, opens and shuts again (`emplaceWait` below): it starts SHUT, its
//            routines open with `emplaceWait` and `emplaceOpen`, keep `emplaceShut` just before its destroyed routine,
//            and its fight routines end in `emplaceLeave` (register throws on one that does not keep that shape)
// and one for walkers:
//   belted   true for a walker a belt carries: standing on a belt's cell, `fall` moves it at the belt's speed along x first,
//            through the same wall test as `walled` (RUNNER is one)
// and one for touch:
//   standTouch  true for a type that meets an Ooga with the standing pose's touch box in every pose, so a prone Ooga
//            under it is touched (through `kill`, so a barrier, invincibility, a drop-in and a clear stage still spare it)
//   solid    true for a type that is a block to the Oogas and never hurts by touch (PRINTER is one): on a side stage or a
//            climb its bullet box about its origin stops a body walking into its sides and a head rising into its
//            underside, and holds up one landing on its top, until it is destroyed (raid-sim.js's `stepPlayer`); its touch
//            is never tested, so only its shots hurt
// and one for the view, metadata the step never reads:
//   releases `["NAME", ...]`, the ENEMY names of the types its routines spawn or mount (absent: none) beyond COMMON, the
//            ones any stage may hold whatever it places: shots, items and lobs (any shooter, carrier or thrower) and the
//            edge spawner's runners. A stage's types are what it places and COMMON, closed over `releases`; the scene
//            builds a look for each as the stage starts, and the unit tier holds every type seen in play to that set.
//   title    a boss's name, a string, which the scene's boss card carves as the boss enters (every boss main has one, and so
//            does a rooms stage's boss-tier core, the Mint Press's counter and the Printer King)
// and three for telling an attack (see `tell` below), which the step never reads either:
//   tells    true for a type that attacks (fires, lobs, launches or charges) and tells every attack beforehand: its routines
//            hold FLAG.WIND on the slot for at least TELL_FOR (FLAG.BIG with it, and TELL_FOR_BIG, before a boss's big one)
//            before each, inside the timers they already keep, so no attack moves. The suite holds every attack in play to it.
//   charge   the routine a charging type attacks in (a drone's dive, an eel's leap, an icicle's fall, a ram's or a press's
//            slam): entering it is the attack its wind-up tells
//   answersHits  true for a type with an attack that answers the hit that lands it (the balloon's ring), told by that hit
//
// Telling an attack. `tell(s, i, on, big)` sets or clears FLAG.WIND (and FLAG.BIG with it when `big`) on slot i. Every
// `tells` type calls it each step from the timers that time its attacks (on within TELL_FOR, or TELL_FOR_BIG for a big
// one, of the next), and it is off as the attack goes; where a type's gap is shorter than its window (a burst, a pair, a
// vent's puffs) the flag stays on through it. Nothing in the step reads the bits: the view glows, poses and sounds them as
// it reads SHUT, and `dieStart` and a shutting emplacement clear them.
//
// The context (`ctx`), one object for a sim's life:
//   state, stage                                   the run's state arrays and scalars, and the stage it plays
//   RULES, TUNE, PHASE, PSTATE, POSE               the sim's tables
//   PLAYERS, ENEMY_SLOTS, HALF_SCREEN              pool sizes, and half the screen's width in metres
//   AIMS, SHOT_X, SHOT_Y, origin                   the enemy aims (count, unit vectors) and each type's box origin height
//   roll(), dice                                   the run's seeded dice, the only dice a routine may use: roll() draws
//                                                  the next into dice[0]
//   ROOM                                           a room's fixed perspective, hit depth and front line (raid-sim.js)
//   cellAt(col, row), colOf(x), wallAt(x, y, h)    the stage grid (a room's floor and side walls), and a solid cell in
//                                                  x's column from y to y + h
//   walled(slot, dt)                               a walker at its evx for dt runs its standing body into a solid cell
//   fall(slot, dt)                                 a walker's feet under gravity, held up as the Ooga's are
//   liftq, liftUnder(col), liftTops                a lift a body in column col crossed down onto this step: write its
//                                                  height at the step's start and end into liftq[0] and [1]; the
//                                                  highest such lift's index, or -1; liftTops[k] its top at the end
//   basinAt(col), tideTops                         the tide basin holding column col, or -1; tideTops[k] basin k's
//                                                  water top in metres this step (its level row + 1, times CELL)
//   spawn(type, x, y, attr), free(slot)            take the first free slot from 15 down (-1 when none), empty a slot
//   spawnFrom(type, slot, attr)                    spawn at the slot's box origin (its x, and y plus origin)
//   at, spawnAt(type, attr)                        spawn at the point written into at[0], at[1] (x, y), for a point
//                                                  worked out in the routine (see below)
//   nearest(slot)                                  the nearest Ooga in play to the slot's x, y, straight-line (ties to
//                                                  player 0)
//   side                                           side[0] 1 when the Ooga `nearest` last found stands left of the slot
//                                                  (its x under the slot's), else 0
//   aimAt(slot, p), shootFrom(slot)                the aim step at Ooga p, a shot along eAim
//   offScreen(slot)                                past ENEMY_MARGIN beyond the screen's sides, or under the screen
//                                                  (ENEMY_MARGIN under it on a climb)
//   bounds                                         the screen's edges in the world, [left, right, bottom, top], for this
//                                                  step
//
// A routine runs every step, so it allocates nothing. That includes boxing: a number handed to or returned from a call the
// compiler leaves out of line becomes a heap object, so a routine asks `nearest(slot)` of a slot rather than of a point
// and reads `bounds` as numbers; `spawnFrom`, `spawnAt` and `roll` exist for the same reason. A call made only when
// an event fires (a puff, a drop) is never inlined, so a point worked out there goes through `at`, not `spawn`'s x and y.
//
// In a room every slot also has a depth, `ez` (0 at the front line, 1 at the back wall), and `evz`, its change a second.
//
// Helpers for any type's routines, exported with the registry (each spawns, so it runs when an event fires, not every
// step): `aimShot(ctx, slot, p)` a shot from the slot's origin at Ooga p's point (in a room, on the front line);
// `aimShotAt(ctx, slot, x, y[, z])` the same at a point, depth z (0 by default, the front line); `lobAt(ctx, slot, attr,
// x, y, flight)` a LOB from the slot's origin that lands on x, y after `flight` seconds, falling at TUNE.LOB_G, its speed
// along x held to TUNE.LOB_VX_MAX, bursting by `attr` as LOB says; `aimShotOff(ctx, slot, dx, dy, p)` a SHOT from the
// slot's x + dx and feet y + dy (a tower's top, a chin gun) along the aim step from there nearest Ooga p's point, and
// `shotAlong(ctx, slot, dx, dy, aim)` one from there along a given aim step (any whole number, taken round the twelve:
// spreads and rings), each its slot or -1; `mount(ctx, main, type, attr)` a part on a main; and
// `bossBreak`, a boss main's destroyed routine. The shared ends every type's routines close on, `dieStart`, `dieFade` and
// `release` (see below), are exported too, for the stages' own enemy files, and so is the GUARD's `guardStand`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY, KIND, CELL } = BL.raidStages;

  // SHUT cannot be hurt; MACHINE ignores barrier and clear-screen; CORE holds a room's barrier shut while it stands; SHIELD
  // spends a player bullet that meets its box flying against its facing (`eAim` 0 right, AIMS / 2 left) flatter than 45
  // degrees, for no damage (the sim's `strike`; the barrier and the clear-screen still destroy it); GHOST is there to see
  // and no more: no bullet meets it (each flies on through), it touches no Ooga, the clear-screen and the autopilot pass it
  // by. WIND marks a slot winding up to attack and BIG a boss's big attack coming (see `tell`): the step never reads them.
  const FLAG = Object.freeze({ SHUT: 1, MACHINE: 2, CORE: 4, SHIELD: 8, GHOST: 16, WIND: 32, BIG: 64 });
  // How long before each attack a `tells` type holds FLAG.WIND at the least, and before a boss's big one with FLAG.BIG.
  const TELL_FOR = 0.4, TELL_FOR_BIG = 0.6, TOLD = FLAG.WIND | FLAG.BIG;
  const tell = (s, i, on, big) => { s.eFlags[i] = s.eFlags[i] & ~TOLD | (on ? (big ? TOLD : FLAG.WIND) : 0); };
  const TYPES = [], VALUES = new Set(Object.values(ENEMY));
  let closed = false;
  const register = (type, def) => {
    if (closed) throw new Error("raid-enemies: register after close; load enemy files before raid-sim.js");
    if (type === ENEMY.FREE || !VALUES.has(type)) throw new Error(`raid enemies: type ${type} is no enemy`);
    if (TYPES[type]) throw new Error(`raid enemies: type ${type} is registered twice`);
    const { routines, destroyed, flags = 0 } = def;
    if (!Array.isArray(routines) || routines.length === 0 || !routines.every((f) => typeof f === "function")) throw new Error(`raid enemies: type ${type} has no routines`);
    if (!Number.isInteger(destroyed) || destroyed < 0 || destroyed >= routines.length) throw new Error(`raid enemies: type ${type}'s destroyed routine ${destroyed} is not one of its ${routines.length}`);
    const { mounts, main, belted } = def;
    if (main !== undefined && !(main !== ENEMY.FREE && VALUES.has(main))) throw new Error(`raid enemies: type ${type}'s main ${main} is no enemy`);
    if (belted !== undefined && typeof belted !== "boolean") throw new Error(`raid enemies: type ${type}'s belted ${belted} is not true or false`);
    if (def.standTouch !== undefined && typeof def.standTouch !== "boolean") throw new Error(`raid enemies: type ${type}'s standTouch ${def.standTouch} is not true or false`);
    if (def.solid !== undefined && typeof def.solid !== "boolean") throw new Error(`raid enemies: type ${type}'s solid ${def.solid} is not true or false`);
    if (def.title !== undefined && !(typeof def.title === "string" && def.title.trim() !== "")) throw new Error(`raid enemies: type ${type}'s title is not a name`);
    for (const key of ["tells", "answersHits"]) if (def[key] !== undefined && typeof def[key] !== "boolean") throw new Error(`raid enemies: type ${type}'s ${key} ${def[key]} is not true or false`);
    if (def.charge !== undefined && !(def.tells === true && Number.isInteger(def.charge) && def.charge > 0 && def.charge < destroyed)) throw new Error(`raid enemies: type ${type}'s charge ${def.charge} is no routine of its fight, or it does not tell`);
    if (def.answersHits !== undefined && def.tells !== true) throw new Error(`raid enemies: type ${type} answers hits but does not tell`);
    if (def.emplaced !== undefined && !(def.emplaced === true && routines[0] === emplaceWait && routines[1] === emplaceOpen && routines[destroyed - 1] === emplaceShut && (flags & FLAG.SHUT))) {
      throw new Error(`raid enemies: type ${type} is emplaced, so it starts SHUT and its routines open with emplaceWait and emplaceOpen and keep emplaceShut before its destroyed routine`);
    }
    const { releases } = def;
    if (releases !== undefined && !(Array.isArray(releases) && releases.length > 0 && releases.every((name) => typeof name === "string" && name !== "FREE" && Object.prototype.hasOwnProperty.call(ENEMY, name)))) {
      throw new Error(`raid enemies: type ${type}'s releases are not a list of ENEMY names`);
    }
    if (mounts !== undefined && !(Array.isArray(mounts) && mounts.length > 0 && mounts.every((m) => Array.isArray(m) && m.length === 2 && m.every(Number.isFinite)))) {
      throw new Error(`raid enemies: type ${type}'s mounts are not [[dx, dy], ...]`);
    }
    const frozen = mounts ? { mounts: Object.freeze(mounts.map((m) => Object.freeze(m.slice()))) } : {};
    if (releases) frozen.releases = Object.freeze(releases.slice());
    TYPES[type] = Object.freeze({ ...def, flags, routines: Object.freeze(routines.slice()), ...frozen });
  };
  // The sim's load: the table is complete, and a registration from here on throws.
  const close = () => { closed = true; Object.freeze(TYPES); };

  // Shared routines: the next routine, the slot emptied, and dying (stopped, then lying TUNE.DYING before the next).
  const next = (s, i) => { s.eRoutine[i]++; };
  const release = (ctx, i) => { ctx.free(i); };
  const dieStart = (ctx, i) => { const s = ctx.state; s.evx[i] = 0; s.evy[i] = 0; s.eTimer[i] = ctx.TUNE.DYING; s.eFlags[i] &= ~TOLD; next(s, i); };
  const dieFade = (ctx, i, dt) => { const s = ctx.state; s.eTimer[i] -= dt; if (s.eTimer[i] <= 0) next(s, i); };

  // SHOT: `attr` is its direction, one of AIM_STEPS. It flies straight until it leaves the screen or meets solid ground;
  // in a room, a shot aimed by `aimShot` flies along its own line toward the front and leaves past the front line. A
  // printer's shot, a dollar bill, carries its aim plus AIM_STEPS in `attr` (`printerShot`): the view draws a shot whose
  // attr is AIM_STEPS or more as a bill, and the step reads it no differently.
  const shotInit = (ctx, i) => {
    const s = ctx.state, k = s.eAttr[i] % ctx.AIMS;
    s.evx[i] = ctx.SHOT_X[k] * ctx.TUNE.ENEMY_SHOT_V; s.evy[i] = ctx.SHOT_Y[k] * ctx.TUNE.ENEMY_SHOT_V; next(s, i);
  };
  const shotFly = (ctx, i, dt) => {
    const s = ctx.state, e = ctx.bounds, x = s.ex[i] + s.evx[i] * dt, y = s.ey[i] + s.evy[i] * dt, z = s.ez[i] + s.evz[i] * dt;
    if (x < e[0] || x >= e[1] || y < e[2] || y >= e[3] || z < -ctx.ROOM.HIT_DEPTH ||
      ctx.cellAt(Math.floor(x / CELL), Math.floor(y / CELL)) === KIND.SOLID) { ctx.free(i); return; }
    s.ex[i] = x; s.ey[i] = y; s.ez[i] = z;
  };
  // A room's shot from slot i's origin at its depth straight at Ooga p's point on the front line, flying from this step.
  const SHOT_FLY = 1;
  const aimShot = (ctx, i, p) => {
    const s = ctx.state, T = ctx.TUNE, k = ctx.spawnFrom(ENEMY.SHOT, i, 0);
    if (k < 0) return;
    s.ez[k] = s.ez[i];
    const dx = s.px[p] - s.ex[k], dy = s.py[p] + ctx.RULES.PLAYER_POINT[s.pPose[p]] - s.ey[k], dz = -s.ez[k] * T.ROOM_DEPTH;
    const v = T.ENEMY_SHOT_V / Math.sqrt(dx * dx + dy * dy + dz * dz);
    s.evx[k] = dx * v; s.evy[k] = dy * v; s.evz[k] = dz * v / T.ROOM_DEPTH; s.eRoutine[k] = SHOT_FLY;
  };
  // A shot from slot i's origin at its depth straight at the point x, y at depth z (the front line by default), flying
  // from this step at the enemy shot speed; its slot, or -1 when none is free. On a side or climb stage z stays 0, so it
  // flies in the screen's plane.
  const aimShotAt = (ctx, i, x, y, z) => {
    const s = ctx.state, T = ctx.TUNE, k = ctx.spawnFrom(ENEMY.SHOT, i, 0);
    if (k < 0) return -1;
    s.ez[k] = s.ez[i];
    const dx = x - s.ex[k], dy = y - s.ey[k], dz = ((z === undefined ? 0 : z) - s.ez[k]) * T.ROOM_DEPTH;
    const v = T.ENEMY_SHOT_V / Math.sqrt(dx * dx + dy * dy + dz * dz);
    s.evx[k] = dx * v; s.evy[k] = dy * v; s.evz[k] = dz * v / T.ROOM_DEPTH; s.eRoutine[k] = SHOT_FLY;
    return k;
  };
  // A SHOT from slot i's x + dx and feet y + dy along aim step `aim`, any whole number taken round the AIMS (so a spread's
  // aim - 1 is the step below 0); and one from there along the aim step nearest Ooga p's point, snapped to the AIMS as
  // `aimAt` snaps one from the slot's origin. Each flies from its first step (shotInit), its slot or -1 when none is free.
  const shotAlong = (ctx, i, dx, dy, aim) => {
    const s = ctx.state, AIMS = ctx.AIMS;
    return ctx.spawn(ENEMY.SHOT, s.ex[i] + dx, s.ey[i] + dy, (aim % AIMS + AIMS) % AIMS);
  };
  const aimShotOff = (ctx, i, dx, dy, p) => {
    const s = ctx.state, AIMS = ctx.AIMS, x = s.ex[i] + dx, y = s.ey[i] + dy;
    const ax = s.px[p] - x, ay = s.py[p] + ctx.RULES.PLAYER_POINT[s.pPose[p]] - y;
    return ctx.spawn(ENEMY.SHOT, x, y, (Math.round(Math.atan2(ay, ax) / (2 * Math.PI / AIMS)) + AIMS) % AIMS);
  };
  // LOB: thrown by `lobAt` from slot i's origin to land on x, y after `flight` seconds, falling at LOB_G, its speed along x
  // held to LOB_VX_MAX (so a point out of range is fallen short of); `attr` its kind, 0 a clipboard, 1 a shell, 2 a shard.
  // It flies from this step, and lands on the top of the first ledge, water or solid cell or lift it falls through, or
  // bursts where it was on flying into a solid cell; past the screen's side margins or under it (`offScreen`, so a thrower
  // standing in the margin still throws and a high lob may rise over the screen's top) it frees with no burst. Landing, a shell sends two SHOTs
  // along aims 1 and 5 (up and out either way) and a shard three along 0, 6 and 3 (along the ground both ways and up), all
  // from LOB_BURST over where it landed; a clipboard just stops. Its slot, or -1 when none is free.
  const LOB_FLY = 1, LOB_BURST = 0.1, LOB_EPS = 1e-4, SHELL_AIMS = [1, 5], SHARD_AIMS = [0, 6, 3];
  const lobAt = (ctx, i, attr, x, y, flight) => {
    const s = ctx.state, T = ctx.TUNE, k = ctx.spawnFrom(ENEMY.LOB, i, attr);
    if (k < 0) return -1;
    const vx = (x - s.ex[k]) / flight;
    s.evx[k] = vx > T.LOB_VX_MAX ? T.LOB_VX_MAX : vx < -T.LOB_VX_MAX ? -T.LOB_VX_MAX : vx;
    s.evy[k] = (y - s.ey[k] + T.LOB_G * flight * flight / 2) / flight;
    s.eRoutine[k] = LOB_FLY;
    return k;
  };
  const burst = (ctx, i, aims) => { for (let a = 0; a < aims.length; a++) ctx.spawnFrom(ENEMY.SHOT, i, aims[a]); };
  const lobFly = (ctx, i, dt) => {
    const s = ctx.state, g = ctx.TUNE.LOB_G, fromX = s.ex[i], from = s.ey[i];
    const x = fromX + s.evx[i] * dt, y = from + s.evy[i] * dt - 0.5 * g * dt * dt;
    s.evy[i] -= g * dt;
    s.ex[i] = x; s.ey[i] = y;
    if (ctx.offScreen(i)) { ctx.free(i); return; }   // past the side margins or under the screen, never over its top
    const col = Math.floor(x / CELL);
    let land = false;
    if (s.evy[i] < 0) {
      // The highest cell top crossed on the way down that is not empty, as a walker's feet find it, or a lift's top over it.
      for (let r = Math.floor(from / CELL + LOB_EPS); r * CELL > y; r--) {
        if (ctx.cellAt(col, r - 1) === KIND.EMPTY) continue;
        s.ey[i] = r * CELL;
        land = true;
        break;
      }
      const q = ctx.liftq;
      q[0] = from; q[1] = y;
      const k = ctx.liftUnder(col);
      if (k >= 0 && (!land || ctx.liftTops[k] > s.ey[i])) { s.ey[i] = ctx.liftTops[k]; land = true; }
    }
    if (!land && ctx.cellAt(col, Math.floor(y / CELL)) === KIND.SOLID) {   // into a wall: it bursts where it was
      s.ex[i] = fromX; s.ey[i] = from; land = true;
    }
    if (!land) return;
    s.ey[i] += LOB_BURST;
    const kind = s.eAttr[i];
    if (kind === 1) burst(ctx, i, SHELL_AIMS);
    else if (kind === 2) burst(ctx, i, SHARD_AIMS);
    ctx.free(i);
  };
  // RUNNER: sets off toward the nearest Ooga and keeps going, off any ledge it runs out of, turning back at a wall; at
  // RUNNER_V running left and RUNNER_RIGHT_V running right, as the reference's soldier.
  const runnerInit = (ctx, i) => {
    const s = ctx.state, p = ctx.nearest(i);
    s.evx[i] = p >= 0 && ctx.side[0] === 1 ? -ctx.TUNE.RUNNER_V : ctx.TUNE.RUNNER_RIGHT_V;
    next(s, i);
  };
  const runnerRun = (ctx, i, dt) => {
    const s = ctx.state;
    if (ctx.walled(i, dt)) s.evx[i] = s.evx[i] > 0 ? -ctx.TUNE.RUNNER_V : ctx.TUNE.RUNNER_RIGHT_V;
    else s.ex[i] = s.ex[i] + s.evx[i] * dt;
    ctx.fall(i, dt);
    if (ctx.offScreen(i)) ctx.free(i);
  };
  // CLERK: stands, turns to face the nearest Ooga, and fires an aimed shot each time its timer runs out, told for the last
  // TELL_FOR of each wait.
  const clerkInit = (ctx, i) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] = ctx.TUNE.CLERK_FIRST;
    next(s, i);
  };
  const clerkStand = (ctx, i, dt) => {
    const s = ctx.state;
    ctx.fall(i, dt);
    const p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      ctx.roll();
      s.eTimer[i] = ctx.TUNE.CLERK_GAP * (0.75 + 0.5 * ctx.dice[0]);
      if (p >= 0 && s.attack) ctx.shootFrom(i);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
    if (ctx.offScreen(i)) ctx.free(i);
  };
  // PRINTER: a fixed machine turret, the reference's rotating gun, an emplacement (see `emplaceWait`), and `solid`: an Ooga
  // stands on it and walks into its sides, and only its dollar bills hurt. Open, starting level to the left, it looks
  // first PRINTER_FIRST[k] after it opens, k the strongest weapon the joined players hold; off the nearest Ooga its aim
  // steps once toward it and it looks again PRINTER_TURN[k] later; on it, it attacks: a shot, or its placed attr's two or
  // three (any other attr one) PRINTER_BURST_GAP apart, each along its aim at PRINTER_SHOT_V, then PRINTER_REST[k] before
  // it looks again. Every attack is told: it winds up (routine PRINTER_WIND, with FLAG.WIND, which the view spins up,
  // shakes, heats, smokes and sounds) for the last TUNE.PRINTER_WINDUP of the wait before it, from the step its aim is on the nearest Ooga and
  // the enemies may fire, and fires at the look only if the Ooga is still on that aim (one that has left it is looked for
  // again, so the wind-up is a warning to move); it stays wound up through a burst.
  // A wait that comes onto its Ooga with less than PRINTER_WINDUP left (the first look at the strongest weapons, a look
  // after a turn at the two strongest, an Ooga stepping into the aim late) stretches to PRINTER_WINDUP, so the wind-up
  // always shows in full; a wait that reaches it in time keeps its length, so every duel's cadence stands.
  const printerInit = (ctx, i) => { const s = ctx.state; s.eAim[i] = ctx.AIMS / 2; s.eTimer[i] = ctx.TUNE.PRINTER_FIRST[strength(ctx)]; next(s, i); };
  const strength = (ctx) => {
    const s = ctx.state, K = ctx.RULES.STRENGTH;
    let k = 0;
    for (let p = 0; p < s.players; p++) if (K[s.pWeapon[p]] > k) k = K[s.pWeapon[p]];
    return k;
  };
  const printerShot = (ctx, i) => {
    const s = ctx.state, k = ctx.shootFrom(i), a = s.eAim[i], v = ctx.TUNE.PRINTER_SHOT_V;
    if (k < 0) return;
    s.evx[k] = ctx.SHOT_X[a] * v; s.evy[k] = ctx.SHOT_Y[a] * v; s.eRoutine[k] = SHOT_FLY; s.eAttr[k] = ctx.AIMS + a;
  };
  // Waiting (routine 3): within PRINTER_WINDUP (half a step's grace, so a wait that crosses it on a step boundary keeps its
  // length) of the look, on its Ooga with the enemies free to fire, it winds up; otherwise, at the look, it steps its aim.
  const PRINTER_WIND = 4;
  const printerSweep = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE, AIMS = ctx.AIMS, was = s.eTimer[i];
    s.eTimer[i] = was - dt;
    if (s.eTimer[i] <= T.PRINTER_WINDUP + dt / 2) {
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack && ctx.aimAt(i, p) === s.eAim[i]) {
        if (was <= T.PRINTER_WINDUP + dt / 2) s.eTimer[i] = T.PRINTER_WINDUP;
        s.eRoutine[i] = PRINTER_WIND;
        tell(s, i, true, false);
      } else if (s.eTimer[i] <= 0) {
        const turn = p < 0 ? 0 : (ctx.aimAt(i, p) - s.eAim[i] + AIMS) % AIMS;
        s.eTimer[i] = T.PRINTER_TURN[strength(ctx)];
        if (turn !== 0) s.eAim[i] = (s.eAim[i] + (turn <= AIMS / 2 ? 1 : AIMS - 1)) % AIMS;
      }
    }
    emplaceLeave(ctx, i);
  };
  // Wound up (routine PRINTER_WIND): at the look, still on its Ooga, it attacks along its aim, the burst's later shots
  // PRINTER_BURST_GAP apart, then rests PRINTER_REST[k] waiting; an Ooga that has left its aim meanwhile (the wind-up
  // warned it) is looked for again as a wait's look does, its aim stepping toward it PRINTER_TURN[k] before the next.
  const printerFire = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE, AIMS = ctx.AIMS;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      const p = ctx.nearest(i);
      if (s.eBurst[i] > 0) {
        if (p >= 0 && s.attack) printerShot(ctx, i);
        s.eBurst[i]--;
        s.eTimer[i] = s.eBurst[i] > 0 ? T.PRINTER_BURST_GAP : T.PRINTER_REST[strength(ctx)];
      } else {
        const turn = p < 0 ? 0 : (ctx.aimAt(i, p) - s.eAim[i] + AIMS) % AIMS;
        if (turn === 0 && p >= 0 && s.attack) {
          printerShot(ctx, i);
          const shots = s.eAttr[i] === 2 || s.eAttr[i] === 3 ? s.eAttr[i] : 1;
          s.eBurst[i] = shots - 1; s.eTimer[i] = shots > 1 ? T.PRINTER_BURST_GAP : T.PRINTER_REST[strength(ctx)];
        } else {
          s.eTimer[i] = T.PRINTER_TURN[strength(ctx)];
          if (turn !== 0) s.eAim[i] = (s.eAim[i] + (turn <= AIMS / 2 ? 1 : AIMS - 1)) % AIMS;
        }
      }
      if (s.eBurst[i] === 0) { s.eRoutine[i] = PRINTER_WIND - 1; tell(s, i, false, false); }
    }
    emplaceLeave(ctx, i);
  };
  // An emplacement's life (a def with `emplaced`: PRINTER, ARC_PYLON, BOND_MORTAR), the reference rotating gun's. Its
  // routines open with `emplaceWait` and `emplaceOpen` and keep `emplaceShut` just before their destroyed routine, and it
  // starts SHUT. Shut, it waits until its middle stands TUNE.EMPLACE_IN inside the screen's right edge (on a climb, its box
  // origin EMPLACE_IN_CLIMB under the top), then opens over EMPLACE_OPEN, still shut, and goes on to its own first routine with the
  // flag cleared. Its fight routines end in `emplaceLeave`, which, on a side stage or a climb, shuts it for good once it is
  // within EMPLACE_OUT of the screen's left edge (a climb's bottom) and sends it to `emplaceShut`, where it waits, shut,
  // until it leaves the screen and frees. Nothing hurts it while shut, so a gun is a beat the screen brings in and takes away.
  const emplaceWait = (ctx, i) => {
    const s = ctx.state, e = ctx.bounds, T = ctx.TUNE;
    const inside = ctx.stage.kind === "climb" ? s.ey[i] + ctx.origin[s.eType[i]] <= e[3] - T.EMPLACE_IN_CLIMB : s.ex[i] <= e[1] - T.EMPLACE_IN;
    if (inside) { s.eTimer[i] = T.EMPLACE_OPEN; next(s, i); return; }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const emplaceOpen = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) { s.eFlags[i] &= ~FLAG.SHUT; next(s, i); return; }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const emplaceLeave = (ctx, i) => {
    const s = ctx.state, e = ctx.bounds, T = ctx.TUNE, kind = ctx.stage.kind;
    if (kind !== "rooms" && (kind === "climb" ? s.ey[i] + ctx.origin[s.eType[i]] < e[2] + T.EMPLACE_OUT : s.ex[i] < e[0] + T.EMPLACE_OUT)) {
      s.eFlags[i] = s.eFlags[i] & ~TOLD | FLAG.SHUT; s.eRoutine[i] = TYPES[s.eType[i]].destroyed - 1;
    }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  const emplaceShut = (ctx, i) => { if (ctx.offScreen(i)) ctx.free(i); };

  // CARRIER: flies across the screen from the side it came in on, swaying CARRIER_SWAY up and down along its height.
  const carrierInit = (ctx, i) => {
    const s = ctx.state;
    s.evx[i] = (s.ex[i] < s.camX + ctx.HALF_SCREEN ? 1 : -1) * ctx.TUNE.CARRIER_V; s.eTimer[i] = 0; next(s, i);
  };
  const carrierFly = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE, w = 2 * Math.PI / T.CARRIER_WAVE, was = s.eTimer[i];
    s.eTimer[i] += dt;
    s.ex[i] += s.evx[i] * dt;
    s.ey[i] += T.CARRIER_SWAY * (Math.sin(s.eTimer[i] * w) - Math.sin(was * w));
    if (ctx.offScreen(i)) ctx.free(i);
  };
  // SENSOR: shut for SENSOR_SHUT, open for SENSOR_OPEN, and round again.
  const sensorInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = ctx.TUNE.SENSOR_SHUT; next(s, i); };
  const sensorCycle = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eFlags[i] ^= FLAG.SHUT;
      s.eTimer[i] += s.eFlags[i] & FLAG.SHUT ? ctx.TUNE.SENSOR_SHUT : ctx.TUNE.SENSOR_OPEN;
    }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  // A destroyed carrier or sensor turns into its item in its own slot, its middle where the box origin was.
  const dropItem = (ctx, i) => {
    const s = ctx.state;
    s.ey[i] += ctx.origin[s.eType[i]] - ctx.origin[ENEMY.ITEM];
    s.eType[i] = ENEMY.ITEM; s.eRoutine[i] = 0; s.eFlags[i] = 0; s.eHp[i] = 0; s.evx[i] = 0; s.evy[i] = 0; s.eTimer[i] = 0;
  };
  // ITEM: pops up and falls to rest ITEM_HALF over what it lands on; `eAttr` is what it gives.
  const itemInit = (ctx, i) => { const s = ctx.state; s.evy[i] = ctx.TUNE.ITEM_POP; next(s, i); };
  // In a room it comes forward from its depth to the front line at ITEM_DRIFT as it falls, and rests there at depth 0.
  const itemRest = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE;
    s.ey[i] -= T.ITEM_HALF; ctx.fall(i, dt); s.ey[i] += T.ITEM_HALF;
    if (s.ez[i] > 0) { const z = s.ez[i] - T.ITEM_DRIFT / T.ROOM_DEPTH * dt; s.ez[i] = z > 0 ? z : 0; }
    if (ctx.offScreen(i)) ctx.free(i);
  };
  // The vault's guns still standing: those linked to slot v and not destroyed.
  const GUN_DESTROYED = 2;
  const gunsOf = (ctx, v) => {
    const s = ctx.state;
    let n = 0;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.VAULT_GUN && s.eLink[j] === v && s.eRoutine[j] < GUN_DESTROYED) n++;
    return n;
  };
  // A part on slot `main`: a `type` with mounts, spawned at the main's x, y plus its mount `attr` (from then on the sim
  // keeps it there), its eLink the main; its slot, or -1 when none is free.
  const mount = (ctx, main, type, attr) => {
    const s = ctx.state, at = TYPES[type].mounts[attr];
    const k = ctx.spawn(type, s.ex[main] + at[0], s.ey[main] + at[1], attr);
    if (k >= 0) s.eLink[k] = main;
    return k;
  };
  // VAULT: `eBurst` counts the guns still to mount. It mounts them as slots allow, puts the run in PHASE.BOSS, opens when
  // both guns are gone, and then fires a spread of three, aimed and a step either side, its big attack, told for the last
  // TELL_FOR_BIG of each gap.
  const vaultInit = (ctx, i) => { const s = ctx.state; s.eBurst[i] = ctx.TUNE.VAULT_GUNS.length; s.eTimer[i] = ctx.TUNE.VAULT_GAP; next(s, i); };
  const vaultFight = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE, AIMS = ctx.AIMS;
    while (s.eBurst[i] > 0) {
      const g = T.VAULT_GUNS.length - s.eBurst[i], at = T.VAULT_GUNS[g];
      const k = ctx.spawn(ENEMY.VAULT_GUN, s.ex[i] + at[0], s.ey[i] + at[1], g);
      if (k < 0) break;
      s.eLink[k] = i; s.eBurst[i]--;
    }
    if (s.phase === ctx.PHASE.PLAY) s.phase = ctx.PHASE.BOSS;
    if (s.eFlags[i] & FLAG.SHUT) {
      if (s.eBurst[i] === 0 && gunsOf(ctx, i) === 0) { s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = T.VAULT_GAP; }
      return;
    }
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] += T.VAULT_GAP;
      const p = ctx.nearest(i);
      if (p >= 0 && s.attack) {
        const aim = ctx.aimAt(i, p);
        for (let k = -1; k <= 1; k++) { s.eAim[i] = (aim + k + AIMS) % AIMS; ctx.shootFrom(i); }
        s.eAim[i] = aim;
      }
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true);
  };
  // A boss main destroyed (the vault's, and every boss main's destroyed routine): the stage is clear, and every other slot
  // empties, while an Ooga plays, drops in or is down with a life in reserve. With none, nothing more: the last death runs
  // on to game over. It does the same on a side stage, a climb and in a room, where the barrier opens with it.
  const bossBreak = (ctx, i) => {
    const s = ctx.state, PS = ctx.PSTATE;
    let on = false;
    for (let p = 0; p < ctx.PLAYERS; p++) {
      const ps = s.pState[p];
      if (ps === PS.NORMAL || ps === PS.DROP || (ps === PS.DEAD && s.pLives[p] > 0)) on = true;
    }
    if (on) {
      s.phase = ctx.PHASE.CLEAR;
      for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (j !== i) ctx.free(j);
    }
    dieStart(ctx, i);
  };
  // VAULT_GUN: `eLink` its vault, `eAttr` which gun. It tracks the nearest Ooga and fires an aimed shot every
  // VAULT_GUN_GAP, the second gun half a gap behind the first; the last one standing fires every half gap; each told for
  // the last TELL_FOR of its gap.
  const gunInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = ctx.TUNE.VAULT_GUN_FIRST + s.eAttr[i] * ctx.TUNE.VAULT_GUN_GAP / 2; next(s, i); };
  const gunFire = (ctx, i, dt) => {
    const s = ctx.state, T = ctx.TUNE, p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eTimer[i] += gunsOf(ctx, s.eLink[i]) > 1 ? T.VAULT_GUN_GAP : T.VAULT_GUN_GAP / 2;
      if (p >= 0 && s.attack) ctx.shootFrom(i);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
  };

  // The rooms' types. A target stands on the back wall at depth 1; a wave comes in at its door there and makes for the
  // front line, where a room's depth is TUNE.ROOM_DEPTH metres. Their numbers are their own, since the rule sheet names
  // none of them: tier 0 fodder, 1 emplacement.
  const begin = (ctx, i) => { next(ctx.state, i); };
  const hold = () => {};
  // LEDGER_CORE: a machine and a core that only stands there; the room's barrier opens when every core in it is destroyed.
  // WALL_TELLER: a hatch shut for TELLER_SHUT and open for TELLER_OPEN, round again, firing at the nearest Ooga as it opens,
  // told for the last TELL_FOR it stands shut.
  const tellerInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = ctx.TUNE.TELLER_SHUT; next(s, i); };
  const tellerCycle = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      s.eFlags[i] ^= FLAG.SHUT;
      const shut = s.eFlags[i] & FLAG.SHUT;
      s.eTimer[i] += shut ? ctx.TUNE.TELLER_SHUT : ctx.TUNE.TELLER_OPEN;
      const p = ctx.nearest(i);
      if (!shut && p >= 0 && s.attack) aimShot(ctx, i, p);
    }
    tell(s, i, (s.eFlags[i] & FLAG.SHUT) !== 0 && s.eTimer[i] <= TELL_FOR, false);
  };
  // COIN_BARREL: rolls along its lane from the back wall to the front line at BARREL_V and on out past it.
  const barrelRoll = (ctx, i, dt) => {
    const s = ctx.state;
    s.ez[i] -= ctx.TUNE.BARREL_V / ctx.TUNE.ROOM_DEPTH * dt;
    if (s.ez[i] < -ctx.ROOM.HIT_DEPTH) ctx.free(i);
  };
  // GUARD: runs from its door to the front line at GUARD_V, then stands there facing the nearest Ooga and fires along the
  // front line, its first shot GUARD_FIRST after it arrives and then every GUARD_GAP, dealt as a clerk's, each told for the
  // last TELL_FOR of its wait.
  const guardInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = ctx.TUNE.GUARD_FIRST; next(s, i); };
  const guardRun = (ctx, i, dt) => {
    const s = ctx.state;
    s.ez[i] -= ctx.TUNE.GUARD_V / ctx.TUNE.ROOM_DEPTH * dt;
    if (s.ez[i] > 0) return;
    s.ez[i] = 0;
    next(s, i);
  };
  const guardStand = (ctx, i, dt) => {
    const s = ctx.state, p = ctx.nearest(i);
    if (p >= 0) s.eAim[i] = ctx.aimAt(i, p);
    s.eTimer[i] -= dt;
    if (s.eTimer[i] <= 0) {
      ctx.roll();
      s.eTimer[i] = ctx.TUNE.GUARD_GAP * (0.75 + 0.5 * ctx.dice[0]);
      if (p >= 0 && s.attack) ctx.shootFrom(i);
    }
    tell(s, i, s.eTimer[i] <= TELL_FOR, false);
  };

  // Every type ends its routines start dying, lie dying, free the slot (a shot's and an item's only free it, and a
  // carrier's and a sensor's turn it into an item), and goes to the first of those at 0 hit points.
  register(ENEMY.SHOT, { routines: [shotInit, shotFly, release], destroyed: 2 });
  register(ENEMY.RUNNER, { routines: [runnerInit, runnerRun, dieStart, dieFade, release], destroyed: 2, belted: true });
  register(ENEMY.CLERK, { routines: [clerkInit, clerkStand, dieStart, dieFade, release], destroyed: 2, tells: true });
  register(ENEMY.PRINTER, { routines: [emplaceWait, emplaceOpen, printerInit, printerSweep, printerFire, emplaceShut, dieStart, dieFade, release], destroyed: 6, flags: FLAG.MACHINE | FLAG.SHUT, emplaced: true, solid: true, tells: true });
  if (TYPES[ENEMY.PRINTER].routines[PRINTER_WIND] !== printerFire) throw new Error("raid enemies: PRINTER_WIND is not the printer's wound-up routine");
  register(ENEMY.CARRIER, { routines: [carrierInit, carrierFly, dropItem], destroyed: 2 });
  register(ENEMY.SENSOR, { routines: [sensorInit, sensorCycle, dropItem], destroyed: 2, flags: FLAG.SHUT });
  register(ENEMY.ITEM, { routines: [itemInit, itemRest, release], destroyed: 2 });
  register(ENEMY.VAULT, { routines: [vaultInit, vaultFight, bossBreak, dieFade, release], destroyed: 2, flags: FLAG.MACHINE | FLAG.SHUT, boss: true, releases: ["VAULT_GUN"], title: "The Bank Vault", tells: true });
  register(ENEMY.VAULT_GUN, { routines: [gunInit, gunFire, dieStart, dieFade, release], destroyed: GUN_DESTROYED, flags: FLAG.MACHINE, tells: true });
  register(ENEMY.LEDGER_CORE, { routines: [begin, hold, dieStart, dieFade, release], destroyed: 2, flags: FLAG.MACHINE | FLAG.CORE, hp: 6, tier: 1, points: 1000, origin: 0 });
  register(ENEMY.WALL_TELLER, { routines: [tellerInit, tellerCycle, dieStart, dieFade, release], destroyed: 2, flags: FLAG.MACHINE | FLAG.SHUT, hp: 4, tier: 1, points: 500, origin: 0, tells: true });
  register(ENEMY.COIN_BARREL, { routines: [begin, barrelRoll, dieStart, dieFade, release], destroyed: 2, hp: 1, tier: 0, points: 100, origin: 0.25 });
  register(ENEMY.GUARD, { routines: [guardInit, guardRun, guardStand, dieStart, dieFade, release], destroyed: 3, hp: 1, tier: 0, points: 300, origin: 0.5, tells: true });
  // LOB: a shot's tier (4) with no hit points; `lobAt` starts it at LOB_FLY, so its first routine only steps on.
  register(ENEMY.LOB, { routines: [begin, lobFly, release], destroyed: 2, hp: 0, tier: 4, points: 0, origin: 0 });

  // The types any stage may hold whatever it places (see `releases`).
  const COMMON = Object.freeze(["SHOT", "ITEM", "LOB", "RUNNER"]);
  BL.raidEnemies = { FLAG, TYPES, COMMON, PRINTER_WIND, TELL_FOR, TELL_FOR_BIG, tell, register, close, emplaceWait, emplaceOpen, emplaceLeave, emplaceShut, aimShot, aimShotAt, aimShotOff, shotAlong, lobAt, mount, bossBreak, dieStart, dieFade, release, guardStand };
})();
