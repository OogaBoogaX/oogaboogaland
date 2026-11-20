// Ooga Raid's stage 2, The Counting House: its own enemies, the two parts of the Mint Press, registered with
// `BL.raidEnemies` before raid-sim.js loads (and closes the registry). Pure, loadable in Node, with no state of its own:
// each routine reads and writes the sim's `state` through the context raid-enemies.js lists, and allocates nothing but
// what a spawn helper does once an event.
//
// The Mint Press fills the back wall of the stage's boss room: a die either side, its counter between them.
//   PRESS_DIE     an emplacement (tier 1), a machine shut while pressed. attr 0 or 1. It waits DIE_FIRST (attr 1
//                 DIE_STAGGER more), then round and round: raised and open for DIE_RAISED, slamming shut for DIE_SLAM, and
//                 as it stamps it drops three coin shots onto the front line across the lanes, its own lane and DIE_SPREAD
//                 either side (held to the front line), at COIN_Y up, from its face; then pressed, shut, for DIE_PRESSED.
//   MINT_COUNTER  the boss tier (3), a machine and a core, shut while any PRESS_DIE stands, its hit points by the boss
//                 formula (`scaled`). Open, it fires a volley every COUNTER_GAP, its first COUNTER_FIRST after it opens: three
//                 shots at the front line at the nearest Ooga's point height, at that Ooga and COUNTER_SPREAD either side
//                 (held to the front line), and every COUNTER_BARREL_EVERY volleys it rolls a COIN_BARREL down its own lane.
//                 As a core, its fall clears the stage (the sim's core rule in the boss room). On its first step it sets
//                 each die's `eLink` to its own slot, marking the dies as its parts (they neither follow it nor die with it).
// Both tell their attacks (raid-enemies.js's `tell`): a die holds FLAG.WIND from TELL_FOR before its stamp (the end of its
// raised wait and all its slam), the counter FLAG.WIND and FLAG.BIG for the last TELL_FOR_BIG of each gap.
// Neither fires while the sim's `attack` is 0. `BL.raidLegionCounting.TUNE` holds their numbers.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { ENEMY } = BL.raidStages;
  const { FLAG, register, aimShotAt, dieStart, dieFade, release, tell, TELL_FOR, TELL_FOR_BIG } = BL.raidEnemies;

  const TUNE = Object.freeze({
    DIE_FIRST: 1, DIE_STAGGER: 1.5, DIE_RAISED: 1.8, DIE_SLAM: 0.3, DIE_PRESSED: 0.9, DIE_SPREAD: 1.5, COIN_Y: 0.3,
    COUNTER_FIRST: 1, COUNTER_GAP: 1.5, COUNTER_SPREAD: 1.2, COUNTER_BARREL_EVERY: 3
  });
  const next = (s, i) => { s.eRoutine[i]++; };

  // A shot from slot i's face at the front line, k spreads along it from `from` (held to the front line), at height y.
  // It passes numbers to calls, as `aimShotAt` does: event code, run once a shot, never every step.
  const toFront = (ctx, i, from, k, spread, y) => {
    const R = ctx.ROOM, x = from + k * spread;
    aimShotAt(ctx, i, x < R.FRONT_L ? R.FRONT_L : x > R.FRONT_R ? R.FRONT_R : x, y, 0);
  };

  // PRESS_DIE: 0 waits, 1 pressed (shut), 2 raised (open), 3 slamming (shut), then it stamps and is pressed again.
  const PRESSED = 1, DIE_DESTROYED = 4;
  const dieInit = (ctx, i) => { const s = ctx.state; s.eTimer[i] = TUNE.DIE_FIRST + s.eAttr[i] * TUNE.DIE_STAGGER; next(s, i); };
  const diePressed = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] += TUNE.DIE_RAISED; next(s, i);
  };
  const dieRaised = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) { tell(s, i, s.eTimer[i] <= TELL_FOR - TUNE.DIE_SLAM, false); return; }
    s.eFlags[i] |= FLAG.SHUT; s.eTimer[i] += TUNE.DIE_SLAM; next(s, i);
    tell(s, i, true, false);
  };
  const dieSlam = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) return;
    s.eTimer[i] += TUNE.DIE_PRESSED; s.eRoutine[i] = PRESSED;
    tell(s, i, false, false);
    if (s.attack) for (let k = -1; k <= 1; k++) toFront(ctx, i, s.ex[i], k, TUNE.DIE_SPREAD, TUNE.COIN_Y);
  };

  // MINT_COUNTER: 0 links the press's dies to it (each die's `eLink` its slot, so the view knows them for its parts) and
  // steps on, 1 shut while a die stands, 2 open and firing.
  const counterInit = (ctx, i) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.PRESS_DIE && s.eLink[j] < 0) s.eLink[j] = i;
    next(s, i);
  };
  const counterWait = (ctx, i) => {
    const s = ctx.state;
    for (let j = 0; j < ctx.ENEMY_SLOTS; j++) if (s.eType[j] === ENEMY.PRESS_DIE && s.eRoutine[j] < DIE_DESTROYED) return;
    s.eFlags[i] &= ~FLAG.SHUT; s.eTimer[i] = TUNE.COUNTER_FIRST; s.eBurst[i] = 0; next(s, i);
  };
  const counterFire = (ctx, i, dt) => {
    const s = ctx.state;
    s.eTimer[i] -= dt;
    if (s.eTimer[i] > 0) { tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true); return; }
    s.eTimer[i] += TUNE.COUNTER_GAP;
    tell(s, i, s.eTimer[i] <= TELL_FOR_BIG, true);
    const p = ctx.nearest(i);
    if (p < 0 || !s.attack) return;
    const y = s.py[p] + ctx.RULES.PLAYER_POINT[s.pPose[p]];
    for (let k = -1; k <= 1; k++) toFront(ctx, i, s.px[p], k, TUNE.COUNTER_SPREAD, y);
    if (++s.eBurst[i] < TUNE.COUNTER_BARREL_EVERY) return;
    s.eBurst[i] = 0;
    const b = ctx.spawn(ENEMY.COIN_BARREL, s.ex[i], 0, 0);
    if (b >= 0) s.ez[b] = 1;
  };

  register(ENEMY.PRESS_DIE, {
    routines: [dieInit, diePressed, dieRaised, dieSlam, dieStart, dieFade, release], destroyed: DIE_DESTROYED,
    flags: FLAG.MACHINE | FLAG.SHUT, hp: 8, tier: 1, points: 2000, origin: 0, tells: true
  });
  register(ENEMY.MINT_COUNTER, {
    releases: ["COIN_BARREL"],
    routines: [counterInit, counterWait, counterFire, dieStart, dieFade, release], destroyed: 3,
    flags: FLAG.MACHINE | FLAG.SHUT | FLAG.CORE, hp: 32, tier: 3, points: 12000, origin: 0, scaled: true, title: "The Mint Press", tells: true
  });

  BL.raidLegionCounting = { TUNE };
})();
