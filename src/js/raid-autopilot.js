// Ooga Raid's autopilot, loaded right after raid-sim.js. It reads a sim's `state` and `stage` and the sim's exported
// tables, and `BL.raidSim.autopilot` forwards here at call time, so the scene, the campaign and the suite call it through
// the sim. Pure and loadable in Node.
//
// `autopilot(sim)` reads the state and returns player 0's buttons. On a side stage it follows the stage's route,
// planned once a stage on the climb's planner (`stageRoute`: runs, lifts and tide basins, every jump flown before it is
// kept), walking, jumping, riding lifts, waiting out the tide and timing calm-only jumps against the gusts, firing at the
// nearest threat on its way (up when it is above); for a boss, or a machine in the way, it fights from a spot on the
// route's nodes on the screen with a pose and aim whose line meets the part's box with nothing in the way, and holds
// where it stands while every part of the boss is shut.
// In a room it stands under an item coming forward until it takes it, turns and fires along the front line at a guard
// standing there within reach, and otherwise walks under the nearest live back-wall target (a shut one counts as further
// off, one never yet seen open further still, and an open one counts as shut once the pilot has timed its window and
// cannot walk under it and land a shot before it shuts) and fires up at it, standing where a standing shot meets its box, else jumping and firing while
// the muzzle is in it, each shot only when it lands inside the target's open window; once the barrier opens it holds up
// alone and walks on. On a climb it follows the stage's route, planned once a stage over its runs and lifts (a metre up at
// most a jump, landing where the next jump is made from, so a crumbling plank is left at once): it rides each lift from
// its low end's wait to its high end's, shelters mid-run in a gust zone until a jump is over before the blow, and fires
// at the nearest threat (up when it is above); once the boss is in play and the screen has locked it shoots each open
// boss part, level from a metre off it when a standing shot meets it, from under it when it is above, and drops to it
// when it is below. On a side stage or a climb it never fires a shot whose line meets a shut enemy first (`shotWasted`):
// an emplacement the screen has not yet opened or has shut, or a boss's shut hull.
//
// What it remembers between steps (the move a climb is making in the air, the boss fight's last target, the plan's index,
// what it has seen of each back-wall target opening and shutting, the side fight's target and spot) lives in the sim's own
// `pilot` scratch, which raid-sim.js makes with the sim, off `state`, so the hash never reads it. A stage's plan (a climb's
// or a side stage's) is built on the pilot's first call on that stage and kept for the page, and a side run's spot cache
// on its first fight: the only times the pilot allocates. Every other call allocates nothing.
//
// What it reads that a player sees only in part: each enemy's hit points (`eHp`, for the fight's progress) and the boss
// part a slot belongs to (`eLink`), a lift's wait left at either end (from the stage clock, the climb's BOARD_LEFT and
// ALIGHT_LEFT), the gust cycle's clock (a calm-only jump waits from GUST_LEAD, 0.9 s, before the blow, a little before the
// 0.8 s warning the view shows), the tide's level from the run's cells, and the crumbling spans' phases. Its fight tries
// six shots of the sixteen the controls give (standing forward, up, up-forward and down-forward, prone forward, and
// forward from a jump in place): no jump's diagonal or down shot, and none from the water.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { KIND, CELL, SCREEN_W, SCREEN_H, cellAt } = BL.raidStages;
  const { FIXED, ENEMY_SLOTS, IN, WEAPON, PSTATE, POSE, PHASE, ENEMY, FLAG, RULES, TUNE, ROOM, ROOM_PHASE, CRUMBLE, HP_OF, TIER_OF, ORIGIN_OF, DESTROYED, BOSS_MAIN, EPS, poseOf, aimOf } = BL.raidSim;
  const { GUST_PERIOD } = BL.raidTerrain;
  const SCREEN_X = SCREEN_W * CELL, HALF_SCREEN = SCREEN_X / 2, SCREEN_Y = SCREEN_H * CELL;
  // A sim's `pilot` scratch (raid-sim.js makes it with the sim, PILOT_MEMO numbers each -1 to start, off `state`), slot by
  // slot: a climb's NODE, AIM, LAST_X, LAST and PLAN (see the climb's pilot), and a room's: the ROOM it has seen and that
  // room's clock at its last call (ROOM_TIME: a clock gone back, as on a continue, is a room started again), then from
  // SLOTS two numbers an enemy slot for the back-wall target there: the room's clock when it was last seen opening (SEEN_SHUT
  // while seen shut, -1 before it has been seen shut), and how long its last whole open window lasted (-1 until one has).
  const MEMO = Object.freeze({ NODE: 0, AIM: 1, LAST_X: 2, LAST: 3, PLAN: 4, ROOM: 5, ROOM_TIME: 6, SLOTS: 7 }), SEEN_SHUT = -2;
  if (BL.raidSim.PILOT_MEMO < MEMO.SLOTS + 2 * ENEMY_SLOTS) throw new Error(`raid autopilot: the sim keeps ${BL.raidSim.PILOT_MEMO} pilot numbers, fewer than its ${MEMO.SLOTS + 2 * ENEMY_SLOTS}`);

  // Rooms. ROOM_EDGE is how far inside a target's bullet box it stands to shoot straight up, ROOM_MARGIN how far inside its
  // box the muzzle must be to fire, SHUT_COST the metres a shut target counts as further off (so one it stands under but
  // shut for a moment keeps it, but an open one near enough wins), ITEM_NEAR how near an item's x it stands, and
  // GUARD_REACH and GUARD_NEAR how far along the front line a guard is fired at, and how near is too near (the muzzle is
  // past it). A target that opens and shuts is timed from what the pilot has seen of it (MEMO): once it has watched one
  // whole open window, a shot is fired, and a jump made for one, only when it lands (its flight from the muzzle to the
  // target's depth, the middle of the shot, as the weapon flies it) before the window ends, and for a jump's shot the time
  // its rise takes to carry the muzzle into the target's box more (`riseTime`; one that stays open past that window, as the
  // last of a pair of twins does, is untimed again). An open target
  // the pilot cannot walk under and shoot before it shuts counts as shut, so it keeps to the one it stands under rather
  // than chase each that opens; and a shut one it has never seen open for a whole window counts SHUT_COST further again,
  // so one shut until others fall (a core behind its dies) never holds it from those that open and shut.
  const ROOM_EDGE = 0.15, ROOM_MARGIN = 0.05, SHUT_COST = 2.5, ITEM_NEAR = 0.05, GUARD_REACH = 2.5, GUARD_NEAR = 0.1;
  // The seconds a jump from the floor takes to lift a shot into the room `h` metres over the floor (0 when a standing shot
  // already flies that high or higher; NaN, which no window passes for, over the jump's reach), written into RISE_T, so no
  // number is returned from a call.
  const RISE_T = new Float64Array(1);
  const riseTime = (h) => {
    const v = TUNE.JUMP_V, g = TUNE.GRAVITY, need = h - TUNE.MUZZLE[POSE.JUMP][0][1];
    RISE_T[0] = h <= TUNE.MUZZLE[POSE.STAND][0][1] || need <= 0 ? 0 : (v - Math.sqrt(v * v - 2 * g * need)) / g;
  };
  // The height over the feet a shot into a room flies at: the forward point's of the pose (TUNE.MUZZLE), standing and in
  // the air; and a standing forward shot's on a side stage or a climb.
  const INTO_STAND = TUNE.MUZZLE[POSE.STAND][0][1], INTO_JUMP = TUNE.MUZZLE[POSE.JUMP][0][1], FORWARD = INTO_STAND;
  const roomPilot = (s, memo) => {
    const stand = s.pPose[0] === POSE.STAND, air = s.pPose[0] === POSE.JUMP;
    if (s.roomPhase !== ROOM_PHASE.FIGHT) return s.roomPhase === ROOM_PHASE.OPEN && stand ? IN.UP : 0;
    const x = s.px[0], fire = s.prevInput & IN.FIRE ? 0 : IN.FIRE, now = s.roomTime;
    if (memo[MEMO.ROOM] !== s.room || now < memo[MEMO.ROOM_TIME]) { memo.fill(-1, MEMO.SLOTS); memo[MEMO.ROOM] = s.room; }
    memo[MEMO.ROOM_TIME] = now;
    // A shot's flight into the room, from the muzzle (standing or now in the air: the pose's forward point's reach, which a
    // shot straight up into the room starts at) to where it meets the back wall's depth.
    const pose = air ? POSE.JUMP : POSE.STAND, speed = s.pWeapon[0] === WEAPON.BEAM ? TUNE.BEAM_V : s.pRapid[0] ? TUNE.RAPID_V : TUNE.SHOT_V;
    const flight = ((1 - ROOM.HIT_DEPTH) * TUNE.ROOM_DEPTH - TUNE.MUZZLE[pose][0][0]) / speed;
    let item = -1, guard = -1, goal = -1, near = 0, best = 0;   // each distance counts once its slot is set
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const t = s.eType[i];
      if (t === ENEMY.ITEM || HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & FLAG.GHOST) {
        memo[MEMO.SLOTS + 2 * i] = -1; memo[MEMO.SLOTS + 2 * i + 1] = -1;   // a slot freed or dead forgets what it saw
        if (t === ENEMY.ITEM && (item < 0 || Math.abs(s.ex[i] - x) < Math.abs(s.ex[item] - x))) item = i;
        continue;
      }
      const dx = Math.abs(s.ex[i] - x);
      if (s.ez[i] === 0 && !(s.eFlags[i] & (FLAG.MACHINE | FLAG.SHUT))) {
        if (dx > GUARD_NEAR && dx < GUARD_REACH && (guard < 0 || dx < near)) { guard = i; near = dx; }
      } else if (s.ez[i] >= 1 - ROOM.HIT_DEPTH) {
        // What it has seen of this target opening and shutting, and whether it can be walked under and shot while open.
        const k = MEMO.SLOTS + 2 * i, shutNow = (s.eFlags[i] & FLAG.SHUT) !== 0;
        if (shutNow) { if (memo[k] >= 0) memo[k + 1] = now - memo[k]; memo[k] = SEEN_SHUT; }
        else if (memo[k] === SEEN_SHUT) memo[k] = now;
        else if (memo[k] >= 0 && memo[k + 1] > 0 && now - memo[k] > memo[k + 1] + 2 * FIXED) memo[k + 1] = -1;   // open past its window: untimed
        riseTime(s.ey[i] + ORIGIN_OF[t] + RULES.SHOT_BOX[TIER_OF[t]][2] + ROOM_MARGIN);
        const late = !shutNow && memo[k] >= 0 && memo[k + 1] > 0 && memo[k] + memo[k + 1] - now < dx / TUNE.RUN + flight + RISE_T[0];
        const score = shutNow && memo[k + 1] < 0 ? dx + 2 * SHUT_COST : shutNow || late ? dx + SHUT_COST : dx;
        if (goal < 0 || score < best) { goal = i; best = score; }
      }
    }
    // A target overhead: the muzzle's height in its box (a standing shot's, or now in the air), and where to stand.
    // `left` is the seconds its open window has left, once the pilot has timed one (`timed`).
    let off = 0, lo = 0, hi = 0, shut = false, b = RULES.SHOT_BOX[0], timed = false, left = 0;
    if (goal >= 0) {
      const t = s.eType[goal], oy = s.ey[goal] + ORIGIN_OF[t], k = MEMO.SLOTS + 2 * goal;
      b = RULES.SHOT_BOX[TIER_OF[t]]; off = x - s.ex[goal]; lo = oy + b[2] + ROOM_MARGIN; hi = oy + b[3] - ROOM_MARGIN;
      shut = (s.eFlags[goal] & FLAG.SHUT) !== 0;
      timed = !shut && memo[k] >= 0 && memo[k + 1] > 0;
      if (timed) left = memo[k] + memo[k + 1] - now;
    }
    if (air) {
      const muzzle = s.py[0] + INTO_JUMP;
      return IN.UP | (goal >= 0 && !shut && !(timed && left < flight) && muzzle > lo && muzzle < hi ? fire : 0);
    }
    if (item >= 0) {
      const dx = s.ex[item] - x;
      return dx > ITEM_NEAR ? IN.RIGHT : dx < -ITEM_NEAR ? IN.LEFT : 0;
    }
    if (guard >= 0) {
      const ahead = s.ex[guard] > x ? 1 : -1;
      return ahead === s.pFace[0] ? fire : ahead > 0 ? IN.RIGHT : IN.LEFT;   // face it first
    }
    if (goal < 0) return 0;
    if (off < b[0] + ROOM_EDGE) return IN.RIGHT;
    if (off > b[1] - ROOM_EDGE) return IN.LEFT;
    const muzzle = s.py[0] + INTO_STAND;
    if (shut) return IN.UP;
    if (muzzle > lo && muzzle < hi) return timed && left < flight ? IN.UP : IN.UP | fire;
    riseTime(lo);
    return s.prevInput & IN.JUMP || timed && left < flight + RISE_T[0] ? IN.UP : IN.UP | IN.JUMP;
  };
  // Climbs. A stage's route is planned once (`climbPlan`, kept by stage) over its standing places: each run of cells in a
  // row that can be stood on (a ledge, or solid with room over it) is a node, as is each lift, and an edge is a move the
  // Ooga's own run and jump make from one to another: a jump up at most CLIMB_RISE, or level or down, landing within its
  // reach (`jumpReach`, less JUMP_SAFE) with no solid over its path; down and jump through a ledge, or a walk off an end,
  // onto what lies at most CLIMB_FALL below; onto a lift waiting at its low end, and off it at its high end. The goal is the
  // highest place the start reaches, and each node keeps the move it makes on the cheapest way there (a fall costs more
  // than a climb). Worked out from the goal down, each move is made from anywhere on its node within reach of where it
  // lands (`tx0` to `tx1`), and lands (`ax`) where the next move can be made from, so a crumbling plank is left at once.
  // CLIMB_RISE is the jump's top less a fifth of a metre, in whole cells (2 m under the 2.25 m jump; it was 1 m under the
  // 1.5 m one), so a jump up through a ledge it does not aim for, which lands on that ledge, is a move the plan knows; and
  // HEAD_ROWS the rows over the takeoff's that the head passes through at the jump's top (at least five).
  const JUMP_TOP = TUNE.JUMP_V * TUNE.JUMP_V / (2 * TUNE.GRAVITY);
  const CLIMB_RISE = Math.floor((JUMP_TOP - 0.2) / CELL) * CELL, CLIMB_FALL = 3, JUMP_SAFE = 0.12, TAKE_IN = 0.03, TAKE_W = 0.25, TAKE_SPAN = 0.05, LAND_IN = 0.15, OVER_IN = 0.15;
  const HEAD_ROWS = Math.max(5, Math.ceil((JUMP_TOP + RULES.BOX[POSE.JUMP][1]) / CELL));
  const MOVE = Object.freeze({ JUMP: 0, DROP: 1, WALK_OFF: 2, BOARD: 3, ALIGHT: 4, WALK: 5 });   // WALK: side stages only
  const COST = [1, 6, 6, 2, 1];
  // The horizontal run a jump carries before it lands on a surface `rise` metres up (or down), on its way down.
  const jumpReach = (rise) => {
    const v = TUNE.JUMP_V, g = TUNE.GRAVITY, d = v * v - 2 * g * rise;
    return d < 0 ? -1 : TUNE.RUN * (v + Math.sqrt(d)) / g;
  };
  // PLANS holds every plan built, PLAN_OF each stage's index in it. `climbPlan(st)` returns a stage's plan, building it on
  // its first call (`buildPlan`, or `buildSide` for a side stage), the pilot's first step on that stage. A sim's pilot
  // keeps its plan's index in its `pilot` scratch, so a later step asks neither.
  const PLANS = [], PLAN_OF = new WeakMap();
  const planIndex = (st) => {
    let k = PLAN_OF.get(st);
    if (k === undefined) { k = PLANS.length; PLANS.push(st.kind === "side" ? buildSide(st) : buildPlan(st)); PLAN_OF.set(st, k); }
    return k;
  };
  const climbPlan = (st) => PLANS[planIndex(st)];
  const buildPlan = (st) => {
    const cols = st.cols, rows = st.rows, at = (c, r) => cellAt(st, c, r), colOf = (x) => Math.floor(x / CELL);
    const standable = (c, r) => at(c, r) !== KIND.EMPTY && at(c, r + 1) !== KIND.SOLID && at(c, r + 2) !== KIND.SOLID;
    // Nodes: the runs, then the lifts, each `x0` to `x1` metres wide with its feet at `feet` (a lift's at its low end; `top`
    // at its high end), its ground row `row` (-1 for a lift) and the crumbling span it is (`span`, -1 for none).
    const x0 = [], x1 = [], feet = [], top = [], row = [], span = [], segAt = new Int16Array(rows * cols).fill(-1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        if (!standable(c, r)) { c++; continue; }
        let e = c;
        while (e + 1 < cols && standable(e + 1, r)) e++;
        const n = feet.length;
        for (let k = c; k <= e; k++) segAt[r * cols + k] = n;
        x0.push(c * CELL); x1.push((e + 1) * CELL); feet.push((r + 1) * CELL); top.push((r + 1) * CELL); row.push(r);
        span.push(st.crumble.findIndex(([a, b, sr]) => sr === r && a <= e && b >= c));
        c = e + 1;
      }
    }
    const nSeg = feet.length;
    for (const [col, width, low, high] of st.lifts) { x0.push(col * CELL); x1.push((col + width) * CELL); feet.push((low + 1) * CELL); top.push((high + 1) * CELL); row.push(-1); span.push(-1); }
    const N = feet.length;
    // No solid over a jump's path, columns c0 to c1, from the row its feet leave up HEAD_ROWS.
    const clear = (c0, c1, r) => {
      for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let k = r + 1; k <= r + HEAD_ROWS; k++) if (at(c, k) === KIND.SOLID) return false;
      return true;
    };
    // The run a body falling in column c from over ground row r lands on, within CLIMB_FALL; -1 when none.
    const landOn = (c, r) => {
      for (let k = r - 1; k >= 0 && (r - k) * CELL <= CLIMB_FALL; k--) if (at(c, k) !== KIND.EMPTY) return segAt[k * cols + c];
      return -1;
    };
    // A jump from a to b: from a's top when a is a lift left at its high end, onto b's feet (a lift boarded at its low end).
    const fromOf = (a) => a < nSeg ? feet[a] : top[a], reachOf = (a, b) => jumpReach(feet[b] - fromOf(a)) - JUMP_SAFE;
    const edges = [];   // [from, to, move]
    const jumpEdge = (a, b, move) => {
      const rise = feet[b] - fromOf(a), reach = reachOf(a, b), r = Math.round(fromOf(a) / CELL) - 1;
      if (rise > CLIMB_RISE + 1e-9 || rise < -CLIMB_FALL || reach < 0) return;
      // Some takeoff on a and landing on b within reach, over columns clear of solid.
      const a0 = x0[a] + TAKE_IN, a1 = x1[a] - TAKE_IN, b0 = x0[b] + LAND_IN, b1 = x1[b] - LAND_IN;
      const gap = Math.max(0, b0 - a1, a0 - b1);
      if (gap > reach) return;
      const p = Math.min(a1, Math.max(a0, (b0 + b1) / 2)), q = Math.min(b1, Math.max(b0, p));
      if (clear(colOf(p), colOf(q), r) || clear(colOf(Math.min(a1, Math.max(a0, q))), colOf(q), r)) edges.push([a, b, move]);
    };
    for (let a = 0; a < nSeg; a++) {
      for (let b = 0; b < nSeg; b++) if (b !== a) jumpEdge(a, b, MOVE.JUMP);
      for (let n = nSeg; n < N; n++) jumpEdge(a, n, MOVE.BOARD);
      const seen = new Set();
      for (let c = colOf(x0[a]); c < colOf(x1[a] - TAKE_IN); c++) {
        if (at(c, row[a]) !== KIND.LEDGE) continue;
        const b = landOn(c, row[a]);
        if (b >= 0 && !seen.has(b)) { seen.add(b); edges.push([a, b, MOVE.DROP]); }
      }
      for (const c of [colOf(x0[a]) - 1, colOf(x1[a] - TAKE_IN) + 1]) {
        if (c < 0 || c >= cols || at(c, row[a] + 1) === KIND.SOLID || at(c, row[a] + 2) === KIND.SOLID) continue;
        const b = landOn(c, row[a] + 1);
        if (b >= 0) edges.push([a, b, MOVE.WALK_OFF]);
      }
    }
    for (let n = nSeg; n < N; n++) for (let b = 0; b < nSeg; b++) jumpEdge(n, b, MOVE.ALIGHT);
    // The goal: the highest run the start reaches, from the ground under the start cell.
    let start = -1;
    for (let r = st.start.row - 1; r >= 0 && start < 0; r--) if (at(st.start.col, r) !== KIND.EMPTY) start = segAt[r * cols + st.start.col];
    const reached = new Uint8Array(N), queue = [start];
    reached[start] = 1;
    while (queue.length) { const a = queue.shift(); for (const [f, t] of edges) if (f === a && !reached[t]) { reached[t] = 1; queue.push(t); } }
    let goal = start;
    for (let n = 0; n < nSeg; n++) if (reached[n] && feet[n] > feet[goal]) goal = n;
    // The cheapest way to the goal from every node, and each node's move on it.
    const dist = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1);
    dist[goal] = 0;
    for (let changed = true; changed;) {
      changed = false;
      edges.forEach(([f, t, m], k) => { const d = dist[t] + COST[m]; if (d < dist[f]) { dist[f] = d; via[f] = k; changed = true; } });
    }
    // From the goal down: where on each node its move is made from (`tx0` to `tx1`) and where it aims to land (`ax`), the
    // point of the next node's own takeoff nearest its middle.
    const next = new Int16Array(N).fill(-1), move = new Uint8Array(N), tx0 = new Float64Array(N), tx1 = new Float64Array(N), ax = new Float64Array(N);
    const order = Array.from({ length: N }, (_, n) => n).filter((n) => dist[n] < Infinity).sort((p, q) => dist[p] - dist[q]);
    tx0[goal] = x0[goal] + LAND_IN; tx1[goal] = x1[goal] - LAND_IN;
    for (const a of order) {
      if (a === goal) continue;
      const [, b, m] = edges[via[a]];
      next[a] = b; move[a] = m;
      // Where on b to land: inside it, and where b's own move is made from when it can.
      const b0 = Math.max(x0[b] + LAND_IN, Math.min(tx0[b], x1[b] - LAND_IN)), b1 = Math.min(x1[b] - LAND_IN, Math.max(tx1[b], x0[b] + LAND_IN));
      if (m === MOVE.DROP) {
        // The column of a over b nearest b's takeoff.
        const want = (b0 + b1) / 2;
        let best = -1;
        for (let c = colOf(x0[a]); c < colOf(x1[a] - TAKE_IN) + 1; c++) {
          if (at(c, row[a]) === KIND.LEDGE && landOn(c, row[a]) === b && (best < 0 || Math.abs((c + 0.5) * CELL - want) < Math.abs((best + 0.5) * CELL - want))) best = c;
        }
        tx0[a] = best * CELL + OVER_IN; tx1[a] = (best + 1) * CELL - OVER_IN; ax[a] = (best + 0.5) * CELL;
      } else if (m === MOVE.WALK_OFF) {
        const c = landOn(colOf(x0[a]) - 1, row[a] + 1) === b && colOf(x0[a]) > 0 ? colOf(x0[a]) - 1 : colOf(x1[a] - TAKE_IN) + 1;
        tx0[a] = tx1[a] = ax[a] = (c + 0.5) * CELL;
      } else {
        // A jump: aimed at the point of b's landing nearest a's middle (or, out of a's reach, at the nearest point of b
        // TAKE_W inside it, so the takeoff is no single point; only TAKE_SPAN onto a crumbling plank, which must be left
        // before its fuse is out), made from where on a it is within reach, over columns clear of solid, the run of them
        // nearest the aim.
        const a0 = x0[a] + TAKE_IN, a1 = x1[a] - TAKE_IN, reach = reachOf(a, b), r = Math.round(fromOf(a) / CELL) - 1;
        const inside = Math.max(0, reach - (span[b] >= 0 ? TAKE_SPAN : TAKE_W));
        const reached = Math.min(a1 + inside, Math.max(a0 - inside, Math.min(b1, Math.max(b0, (a0 + a1) / 2))));
        const x = Math.min(x1[b] - LAND_IN, Math.max(x0[b] + LAND_IN, reached)), lo = Math.max(a0, x - reach), hi = Math.min(a1, x + reach);
        const near = Math.min(hi, Math.max(lo, x)), c = colOf(near), aim = colOf(x);
        let cl = c, ch = c;
        while (cl - 1 >= colOf(lo) && clear(cl - 1, aim, r)) cl--;
        while (ch + 1 <= colOf(hi) && clear(ch + 1, aim, r)) ch++;
        ax[a] = x; tx0[a] = Math.max(lo, cl * CELL); tx1[a] = Math.max(tx0[a], Math.min(hi, (ch + 1) * CELL));
        if (!clear(c, aim, r) || lo > hi + 1e-9) throw new Error(`raid sim: ${st.id}: no clear takeoff from place ${a} to place ${b}`);
      }
    }
    return Object.freeze({
      nSeg, N, goal, segAt, x0: Float64Array.from(x0), x1: Float64Array.from(x1), feet: Float64Array.from(feet), top: Float64Array.from(top),
      span: Int16Array.from(span), next, move, tx0, tx1, ax, lifts: Object.freeze(st.lifts.map((lift) => Float64Array.from(lift)))
    });
  };
  // The climb's pilot keeps its memory in the sim's own `pilot` scratch (raid-sim.js makes it with the sim, PILOT_MEMO
  // numbers, each -1 to start; off `state`, so the hash never reads it), slot by MEMO: the node a move in the air is making
  // for and the x it aims at there (-1 when none: it falls straight), the boss fight's last target's x and its slot, for
  // its lead, and the index of the stage's plan in PLANS. LIFT_AT is a lift's top now, and the seconds left in its wait at
  // the low end and at the high end (-1 when not waiting there): `liftNow` reads the stage clock from the state itself, so
  // no number is passed to a call (a number passed to a call the compiler leaves out of line is boxed), and a lift from
  // its plan's `lifts`, a Float64Array a lift, since a number read from the stage's frozen record is a tagged one, and a
  // height that may be either is boxed.
  const LIFT_AT = new Float64Array(3);
  const liftNow = (lift, s) => {
    const lowRow = lift[2], highRow = lift[3], speed = lift[4], hold = lift[5];
    const travel = (highRow - lowRow) * CELL / speed, t = s.time % (2 * (hold + travel));
    let r = highRow;
    LIFT_AT[1] = -1; LIFT_AT[2] = -1;
    if (t < hold) { r = lowRow; LIFT_AT[1] = hold - t; }
    else if (t < hold + travel) r = lowRow + (t - hold) * speed / CELL;
    else if (t < 2 * hold + travel) LIFT_AT[2] = 2 * hold + travel - t;
    else r = highRow - (t - 2 * hold - travel) * speed / CELL;
    LIFT_AT[0] = (r + 1) * CELL;
  };
  // STEER is how near its aim it steers in the air; BOARD_LEFT and ALIGHT_LEFT the least a lift's wait must have left to
  // jump on or off it; GUST_LEAD the time a jump in a gust zone needs before the blow (a jump onto a crumbling plank twice
  // that, to be off it again), the gust's warning included; STAND_OFF how far off a boss part level with its muzzle it
  // stands to shoot it, AT_SPOT how near a spot counts as on it, and AIM_IN how far inside a box a muzzle must be.
  // In the air the Ooga drifts the way it last pressed (the sim's latched drift), so steering in the air keeps pressing
  // toward the aim from STEER off it and, inside STEER, presses nothing and drifts on through, to turn back once past: it
  // weaves about the aim within STEER and a step. UP_OUT is how far forward of the feet a standing shot straight up leaves.
  const STEER = 0.04, BOARD_LEFT = 0.7, ALIGHT_LEFT = 0.6, GUST_LEAD = 0.9, STAND_OFF = 1, AT_SPOT = 0.1, AIM_IN = 0.02, UP_OUT = TUNE.MUZZLE[POSE.STAND][2][0];
  // Right or left toward TO[0] from player 0's x, or neither within `near`: the x comes from the state and the aim through
  // TO, so no computed number is passed to a call (see LIFT_AT).
  const TO = new Float64Array(1);
  const towards = (s, near) => TO[0] - s.px[0] > near ? IN.RIGHT : TO[0] - s.px[0] < -near ? IN.LEFT : 0;
  const climbPilot = (sim) => {
    const s = sim.state, st = sim.stage, memo = sim.pilot;
    if (memo[MEMO.PLAN] < 0) memo[MEMO.PLAN] = planIndex(st);
    const plan = PLANS[memo[MEMO.PLAN]];
    const fire = s.prevInput & IN.FIRE ? 0 : IN.FIRE, jump = s.prevInput & IN.JUMP ? 0 : IN.JUMP;
    const x = s.px[0], y = s.py[0], air = s.pPose[0] === POSE.JUMP, muzzle = y + FORWARD;
    const bottom = s.camY, top = s.camY + SCREEN_Y, boss = s.phase === PHASE.BOSS;
    // The threat it fires at: the nearest live enemy on the screen, up when it is above; in the boss fight the nearest
    // open machine.
    let threat = -1, far = 0;
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const t = s.eType[i];
      if (HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & (FLAG.SHUT | FLAG.GHOST) || s.ey[i] < bottom || s.ey[i] > top) continue;
      if (boss && !(s.eFlags[i] & FLAG.MACHINE)) continue;
      const d = Math.abs(s.ex[i] - x) + Math.abs(s.ey[i] + ORIGIN_OF[t] - muzzle);
      if (threat < 0 || d < far) { threat = i; far = d; }
    }
    let up = 0;
    if (threat >= 0) { const dy = s.ey[threat] + ORIGIN_OF[s.eType[threat]] - muzzle; if (dy > 0.5 && Math.abs(s.ex[threat] - x) < dy) up = IN.UP; }
    if (air) {
      const n = memo[MEMO.NODE];
      // No move to make: weave about the x a missed landing was given up at (MEMO.AIM), as near as the drift lets it fall
      // straight; with none (a jump in place), press nothing, so a drift of none stays none. (Written in place: this runs
      // seldom, in the engine's slow tiers, where a number handed to a call is boxed.)
      if (n < 0) { TO[0] = memo[MEMO.AIM]; return (TO[0] < 0 ? 0 : towards(s, STEER)) | up | fire; }
      let land = n < plan.nSeg ? plan.feet[n] : 0;
      if (n >= plan.nSeg) { liftNow(plan.lifts[n - plan.nSeg], s); land = LIFT_AT[0]; }
      if (s.pvy[0] < 0 && y < land - 0.02) { memo[MEMO.NODE] = -1; memo[MEMO.AIM] = x; return up | fire; }   // missed it: fall straight
      TO[0] = memo[MEMO.AIM]; return towards(s, STEER) | up | fire;
    }
    memo[MEMO.NODE] = -1; memo[MEMO.AIM] = -1;
    // Where it stands: on a lift (in its columns, its feet on its top), or on a run.
    const col = Math.floor(x / CELL);
    let node = -1;
    for (let k = 0; k < st.lifts.length && node < 0; k++) {
      const L = plan.lifts[k];
      liftNow(L, s);
      if (col >= L[0] && col < L[0] + L[1] && Math.abs(y - LIFT_AT[0]) < 1e-3) node = plan.nSeg + k;
    }
    if (node < 0) { const r = Math.round(y / CELL) - 1; if (r >= 0 && r < st.rows) node = plan.segAt[r * st.cols + col]; }
    if (boss && threat >= 0 && (s.camY >= s.lockY || node === plan.goal)) {
      // The boss fight, once the screen has locked (or the goal is reached): a part level with a standing shot is shot from
      // STAND_OFF off it toward the screen's middle, facing it; one above, from under it (led by its last step's move over
      // the shot's climb); from above it, down.
      const t = s.eType[threat], ex = s.ex[threat], oy = s.ey[threat] + ORIGIN_OF[t], b = RULES.SHOT_BOX[TIER_OF[t]];
      const lead = memo[MEMO.LAST] === threat ? (ex - memo[MEMO.LAST_X]) / FIXED * Math.max(0, oy - muzzle) / TUNE.SHOT_V : 0;
      memo[MEMO.LAST_X] = ex; memo[MEMO.LAST] = threat;
      if (muzzle > oy + b[2] + AIM_IN && muzzle < oy + b[3] - AIM_IN) {
        const sx = ex < s.camX + HALF_SCREEN ? ex + STAND_OFF : ex - STAND_OFF, face = ex > sx ? 1 : -1;
        if (Math.abs(x - sx) > AT_SPOT) { TO[0] = sx; return towards(s, 0); }
        if (s.pFace[0] !== face) return face > 0 ? IN.RIGHT : IN.LEFT;
        return fire;
      }
      if (muzzle <= oy + b[2] + AIM_IN) { TO[0] = ex + lead - s.pFace[0] * UP_OUT; return towards(s, AT_SPOT) | IN.UP | fire; }
      const r = Math.round(y / CELL) - 1;
      if (cellAt(st, col, r) === KIND.LEDGE) return IN.DOWN | jump;
    }
    if (node < 0 || plan.next[node] < 0) return up | fire;
    // The move this node makes on the way to the goal: walk to where it is made from, wait while it cannot be made (the
    // run it lands on crumbled, or a lift not waiting at the end it is boarded or left at), then make it. In a gust zone
    // it shelters in the middle of its run (off a crumbling plank, where it cannot wait) unless the jump is over before
    // the blow.
    const nxt = plan.next[node], move = plan.move[node], ax = plan.ax[node];
    memo[MEMO.NODE] = nxt; memo[MEMO.AIM] = ax;
    let wait = plan.span[nxt] >= 0 && s.crumblePhase[plan.span[nxt]] !== CRUMBLE.WHOLE;
    if (move === MOVE.BOARD) { liftNow(plan.lifts[nxt - plan.nSeg], s); wait = wait || LIFT_AT[1] < BOARD_LEFT; }
    if (move === MOVE.ALIGHT) { liftNow(plan.lifts[node - plan.nSeg], s); wait = wait || LIFT_AT[2] < ALIGHT_LEFT; }
    if (node < plan.nSeg && plan.span[node] < 0) {
      const feetRow = Math.floor(y / CELL + EPS), lead = plan.span[nxt] >= 0 ? 2 * GUST_LEAD : GUST_LEAD;
      for (let k = 0; k < st.gusts.length; k++) {
        if (feetRow < st.gusts[k][0] || feetRow > st.gusts[k][1] || s.time % GUST_PERIOD <= TUNE.GUST_CALM + TUNE.GUST_WARN - lead) continue;
        TO[0] = (plan.x0[node] + plan.x1[node]) / 2; return towards(s, AT_SPOT) | up | fire;
      }
    }
    if (x < plan.tx0[node]) return IN.RIGHT | up | fire;
    if (x > plan.tx1[node]) return IN.LEFT | up | fire;
    if (wait) return up | fire;
    if (move === MOVE.DROP) return IN.DOWN | jump;
    TO[0] = ax; return towards(s, STEER) | (move === MOVE.WALK_OFF ? 0 : jump) | up | fire;
  };
  // Side stages. A side stage's route is planned once a stage (`stagePlan`, kept in PLANS as a climb's is) on the
  // climb's planner, generalised: its nodes are runs of standable cells (split where water starts or stops, since water
  // cannot be jumped from, and at a belt's or a crumbling span's ends), its lifts, and its tide basins (`st.tide`: a basin
  // is one node, a moving surface like a lift whose top is the water's, rafts standing on it); its edges are the climb's
  // MOVEs plus WALK, a walk on from one run onto the next in the same row (or out of a basin onto a bank flush with the
  // water). Every jump is flown before it is kept (`fly`: the Ooga's own run, jump, head and wall rules over the stage's
  // cells, steering as the pilot steers), from every takeoff point along the run SAMPLE apart, so an edge's takeoff span
  // and aim are ones that land; inside a gust zone it is flown under each push the zone gives too, and one that lands only
  // in the calm is kept as such, to be made only GUST_LEAD before a blow (the climb's timing). A raft's jump and a walk out
  // of a basin are flown at each of the basin's levels and kept with the levels they land from (`eMask`). A walk's cost is
  // its time, a belt's speed with or against it included. The goal is the lock screen's floor: the lowest run reached on
  // the lock screen, walked along to where the screen locks.
  //
  // Each node's move on the cheapest way to the goal is kept as a climb's is (`next`, `move`, `tx0`, `tx1`, `ax`, and
  // `via`, its edge), and every edge keeps its own takeoff span and aim, so the fight can walk to a spot off the route.
  const SIDE_COST = [1, 1.5, 1, 2, 1, 0], SPOT_CACHE = 64, BASIN_WAIT = 4, SAMPLE = 0.025, TAKE_TRIM = 0.015, TAKE_MIN = 0.02, TAKE_RUN = 0.4, FLY_STEPS = 480;
  // The steps after a walk off's first in which its coyote time runs, before its lock starts (raid-sim.js's COYOTE).
  const COYOTE_STEPS = Math.round(TUNE.COYOTE / FIXED);
  const K_RUN = 0, K_LIFT = 1, K_BASIN = 2;
  const stagePlan = (st) => PLANS[planIndex(st)];
  const buildSide = (st) => {
    const cols = st.cols, rows = st.rows, colOf = (x) => Math.floor(x / CELL);
    const tide = st.tide, basins = tide ? tide.basins : [], floats = tide ? tide.floats : [], belts = st.belts || [], NB = basins.length;
    const basinCol = new Int16Array(cols).fill(-1), raft = new Uint8Array(cols);
    basins.forEach(([c0, c1], k) => basinCol.fill(k, c0, c1 + 1));
    for (const [c0, c1] of floats) raft.fill(1, c0, c1 + 1);
    // The cells as the run writes them with each basin's water at LEVEL (a raft's top cell a ledge), the frozen stage's
    // elsewhere; the build sets LEVEL for the edge it flies.
    // `setLevel(k, L)` writes basin k's water at level L into G, the stage's cells copied, as the tide writes the run's.
    const LEVEL = Int16Array.from(basins, (b) => b[2]), G = Uint8Array.from(st.cells);
    const setLevel = (k, L) => {
      const [c0, c1, low, high] = basins[k];
      LEVEL[k] = L;
      for (let c = c0; c <= c1; c++) {
        for (let r = low; r <= high; r++) {
          const base = st.cells[r * cols + c], cell = r > low && r <= L && base === KIND.EMPTY ? KIND.WATER : base;
          G[r * cols + c] = r === L && raft[c] && cell === KIND.WATER ? KIND.LEDGE : cell;
        }
      }
    };
    for (let k = 0; k < NB; k++) setLevel(k, basins[k][2]);
    const at = (c, r) => c < 0 || c >= cols ? KIND.SOLID : r < 0 || r >= rows ? KIND.EMPTY : G[r * cols + c];
    const inBasin = (c, r) => basinCol[c] >= 0 && r >= basins[basinCol[c]][2] && r <= basins[basinCol[c]][3];
    const beltOf = (c, r) => belts.findIndex(([c0, c1, br]) => br === r && c >= c0 && c <= c1);
    const spanOf = (c, r) => st.crumble.findIndex(([c0, c1, sr]) => sr === r && c >= c0 && c <= c1);
    const standable = (c, r) => !inBasin(c, r) && at(c, r) !== KIND.EMPTY && at(c, r + 1) !== KIND.SOLID && at(c, r + 2) !== KIND.SOLID;
    const keyOf = (c, r) => (at(c, r) === KIND.WATER ? 1 : 0) + 2 * (beltOf(c, r) + 1) + 512 * (spanOf(c, r) + 1);
    // Nodes: runs, then lifts, then basins. `water` 1 for a run that cannot be jumped from; `belt` a run's belt speed.
    const x0 = [], x1 = [], feet = [], top = [], row = [], span = [], kind = [], water = [], belt = [], segAt = new Int16Array(rows * cols).fill(-1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        if (!standable(c, r)) { c++; continue; }
        let e = c;
        const key = keyOf(c, r);
        while (e + 1 < cols && standable(e + 1, r) && keyOf(e + 1, r) === key) e++;
        const n = feet.length, b = beltOf(c, r);
        segAt.fill(n, r * cols + c, r * cols + e + 1);
        x0.push(c * CELL); x1.push((e + 1) * CELL); feet.push((r + 1) * CELL); top.push((r + 1) * CELL); row.push(r);
        span.push(spanOf(c, r)); kind.push(K_RUN); water.push(at(c, r) === KIND.WATER ? 1 : 0); belt.push(b < 0 ? 0 : belts[b][3]);
        c = e + 1;
      }
    }
    const nSeg = feet.length;
    for (const [col, width, low, high] of st.lifts) { x0.push(col * CELL); x1.push((col + width) * CELL); feet.push((low + 1) * CELL); top.push((high + 1) * CELL); row.push(-1); span.push(-1); kind.push(K_LIFT); water.push(0); belt.push(0); }
    const basin0 = feet.length;
    for (const [c0, c1, low, high] of basins) { x0.push(c0 * CELL); x1.push((c1 + 1) * CELL); feet.push((low + 1) * CELL); top.push((high + 1) * CELL); row.push(-1); span.push(-1); kind.push(K_BASIN); water.push(1); belt.push(0); }
    const N = feet.length;
    // Where on each node the Ooga's standing body can be: TAKE_IN inside its ends, or its half width off a wall there (a
    // solid cell beside an end at the body's height, which the run stops it at).
    const half = RULES.BOX[POSE.STAND][0], sx0 = new Float64Array(N), sx1 = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      const c0 = Math.floor(x0[n] / CELL) - 1, c1 = Math.round(x1[n] / CELL), r = kind[n] === K_RUN ? row[n] : -2;
      const wall = (c) => r > -2 && (at(c, r + 1) === KIND.SOLID || at(c, r + 2) === KIND.SOLID);
      sx0[n] = x0[n] + (wall(c0) ? half + 0.01 : TAKE_IN); sx1[n] = x1[n] - (wall(c1) ? half + 0.01 : TAKE_IN);
    }
    // The node a body landing on the top of cell (c, r) stands on, with each basin at LEVEL; -1 for none.
    const nodeAt = (c, r) => {
      const k = c >= 0 && c < cols ? basinCol[c] : -1;
      if (k >= 0 && r === LEVEL[k]) return basin0 + k;
      return r >= 0 && r < rows && c >= 0 && c < cols ? segAt[r * cols + c] : -1;
    };
    // A lift a jump is flown onto, at its low end (`SURF`: its node, columns and top); -1 for none.
    const SURF = [-1, 0, 0, 0];
    const solidRows = (c, lo, hi) => { for (let r = lo; r <= hi; r++) if (at(c, r) === KIND.SOLID) return true; return false; };
    // The node a jump from feet (x, y), steered to `aim` as the pilot steers in the air, lands on (-1: none, or a fall past
    // `floor`), FLOWN[0] its landing x. `mode` 0 flies it calm, 1 and 2 under each gust zone's push (a dir 0 zone left,
    // then right).
    const FLOWN = [0];
    const mfloor = Math.floor;   // read once: a global read in the step is slow in a Node vm context
    // `walk` 0 for a jump; -1 or 1 for a walk off an end that way, which falls from rest keeping the way it walked, with no
    // steering, until it has fallen LOCK_FALL from where its coyote time ran out, COYOTE_STEPS steps after the one it left
    // on (the sim's latched drift and its lock: a jump drifts the way pressed last).
    const fly = (x, y, aim, mode, floor, walk = 0) => {
      let vy = walk === 0 ? TUNE.JUMP_V : 0, drift = walk, lockY = y - TUNE.LOCK_FALL;
      const half = RULES.BOX[POSE.STAND][0], stand = RULES.BOX[POSE.STAND][1], jumpH = RULES.BOX[POSE.JUMP][1], g = TUNE.GRAVITY, dt = FIXED;
      for (let n = 0; n < FLY_STEPS; n++) {
        if (walk !== 0 && n === COYOTE_STEPS) lockY = y - TUNE.LOCK_FALL;
        let push = 0;
        if (mode !== 0) {
          const c = mfloor(x / CELL);
          for (let z = 0; z < st.gusts.length; z++) { const gz = st.gusts[z]; if (c >= gz[0] && c <= gz[1]) { push = gz[2] !== 0 ? gz[2] : mode === 1 ? -1 : 1; break; } }
        }
        const lr = aim - x > STEER ? 1 : aim - x < -STEER ? -1 : 0;
        if (lr !== 0 && (walk === 0 || (n > 0 && y <= lockY))) drift = lr;
        const move = drift * TUNE.RUN + push * TUNE.GUST_V;
        const lo = mfloor((y + EPS) / CELL), hi = mfloor((y + (n === 0 ? stand : jumpH) - EPS) / CELL);
        x += move * dt;
        if (move > 0) { const c = mfloor((x + half) / CELL); if (solidRows(c, lo, hi)) x = c * CELL - half; }
        else if (move < 0) { const c = mfloor((x - half) / CELL); if (solidRows(c, lo, hi)) x = (c + 1) * CELL + half; }
        const from = y;
        y += vy * dt - 0.5 * g * dt * dt;
        vy -= g * dt;
        if (vy > 0) {
          const head = y + jumpH;
          if (at(mfloor(x / CELL), mfloor(head / CELL)) === KIND.SOLID) { y = mfloor(head / CELL) * CELL - jumpH; vy = 0; }
          continue;
        }
        const c = mfloor(x / CELL);
        let land = -1, ly = -1;
        for (let k = mfloor(from / CELL + EPS); k * CELL > y; k--) if (at(c, k - 1) !== KIND.EMPTY) { land = nodeAt(c, k - 1); ly = k * CELL; break; }
        if (SURF[0] >= 0 && c >= SURF[1] && c < SURF[2] && from >= SURF[3] - EPS && y <= SURF[3] && SURF[3] > ly) { land = SURF[0]; ly = SURF[3]; }
        if (ly >= 0) { FLOWN[0] = x; return land; }
        if (y < floor) return -1;
      }
      return -1;
    };
    // A gust zone over any column from c0 to c1.
    const gusty = (c0, c1) => st.gusts.some(([g0, g1]) => g1 >= Math.min(c0, c1) && g0 <= Math.max(c0, c1));
    // A jump from a (its feet at `y`, its takeoff from ta0 to ta1) onto b: the span of takeoff points nearest the aim from
    // which it lands on b, flown at each takeoff SAMPLE apart, for each aim in turn (`prefer` first when given, then b's
    // landing point nearest the takeoff, then its middle). JUMP_AT holds the result (tx0, tx1, ax, calm); false for none.
    const JUMP_AT = [0, 0, 0, 0];
    const jumpFrom = (a, b, y, ta0, ta1, prefer) => {
      const b0 = x0[b] + LAND_IN, b1 = x1[b] - LAND_IN;
      if (b0 > b1 || ta0 > ta1) return false;
      const reach = jumpReach(feet[b] - y);
      if (reach < 0 || feet[b] - y > CLIMB_RISE + 1e-9 || Math.max(0, b0 - ta1, ta0 - b1) > reach + 0.3) return false;
      const windy = gusty(colOf(Math.min(ta0, b0)), colOf(Math.max(ta1, b1)));
      const near = Math.min(b1, Math.max(b0, (ta0 + ta1) / 2));
      const floor = feet[b] - CELL;
      // Whether the takeoff at sample k lands on b: 2 under every push the gust zones give (or calm, with none), 1 in the
      // calm alone, 0 not at all.
      let lo = 0, aim = 0;
      const lands = (k) => {
        const x = lo + k * SAMPLE;
        if (fly(x, y, aim, 0, floor) !== b) return 0;
        return !windy || (fly(x, y, aim, 1, floor) === b && fly(x, y, aim, 2, floor) === b) ? 2 : 1;
      };
      for (const target of prefer === undefined ? [near, (b0 + b1) / 2] : [prefer, near, (b0 + b1) / 2]) {
        // The samples SAMPLE apart from lo to hi; searched outward from the one nearest the aim for the nearest that lands
        // under every push (then, failing that, in the calm), and that run of them grown either way to TAKE_RUN at most.
        aim = target; lo = Math.max(ta0, aim - reach - 0.3);
        const hi = Math.min(ta1, aim + reach + 0.3), n = Math.floor((hi - lo) / SAMPLE + 1e-9);
        if (n < 0) continue;
        const k0 = Math.min(n, Math.max(0, Math.round((aim - lo) / SAMPLE)));
        let k = -1, want = 2;
        for (; want >= 1 && k < 0; want--) {
          for (let j = 0; j <= n && k < 0; j++) {
            if (k0 + j <= n && lands(k0 + j) >= want) k = k0 + j;
            else if (j > 0 && k0 - j >= 0 && lands(k0 - j) >= want) k = k0 - j;
          }
        }
        if (k < 0) continue;
        const cls = lands(k), most = Math.round(TAKE_RUN / SAMPLE);
        let kl = k, kh = k;
        while (kl > 0 && k - kl < most && lands(kl - 1) === cls) kl--;
        while (kh < n && kh - k < most && lands(kh + 1) === cls) kh++;
        const p = lo + kl * SAMPLE + TAKE_TRIM, q = lo + kh * SAMPLE - TAKE_TRIM;
        if (q - p < TAKE_MIN) continue;
        JUMP_AT[0] = p; JUMP_AT[1] = q; JUMP_AT[2] = aim; JUMP_AT[3] = cls === 2 ? 0 : 1;
        return true;
      }
      return false;
    };
    // Edges: [from, to, move, tx0, tx1, ax, calm, mask, cost]; mask the basin levels (bit level - low) the move is made at.
    const edges = [];
    const edge = (a, b, move, tx0, tx1, ax, calm, mask, cost) => edges.push([a, b, move, tx0, tx1, ax, calm, mask, cost]);
    // The node a body falling in column c from over ground row r lands on (the basins at their low water), or -1.
    const landOn = (c, r) => {
      for (let k = r - 1; k >= 0; k--) if (at(c, k) !== KIND.EMPTY) return nodeAt(c, k);
      return -1;
    };
    const walkCost = (b, dir) => (x1[b] - x0[b]) / Math.max(0.1, TUNE.RUN + dir * belt[b]);
    // Every takeoff a run gives (its cells, TAKE_IN inside its ends), a lift's at its high end, a basin's on its rafts.
    for (let a = 0; a < nSeg; a++) {
      const a0 = sx0[a], a1 = sx1[a], r = row[a];
      if (!water[a]) {
        for (let b = 0; b < N; b++) {
          if (b === a || Math.max(0, x0[b] - x1[a], x0[a] - x1[b]) > 2) continue;
          if (kind[b] === K_LIFT) {
            const L = st.lifts[b - nSeg];
            SURF[0] = b; SURF[1] = L[0]; SURF[2] = L[0] + L[1]; SURF[3] = feet[b];
            if (jumpFrom(a, b, feet[a], a0, a1)) edge(a, b, MOVE.BOARD, JUMP_AT[0], JUMP_AT[1], JUMP_AT[2], JUMP_AT[3], 0, SIDE_COST[MOVE.BOARD]);
            SURF[0] = -1;
          } else if (kind[b] === K_BASIN) {
            // Into the water, landing in the basin at its low water and at its high.
            const k = b - basin0;
            setLevel(k, basins[k][3]);
            const high = jumpFrom(a, b, feet[a], a0, a1) ? JUMP_AT.slice() : null;
            setLevel(k, basins[k][2]);
            if (high && feet[b] - feet[a] <= 0 && jumpFrom(a, b, feet[a], Math.max(a0, high[0]), Math.min(a1, high[1]), high[2])) edge(a, b, MOVE.JUMP, JUMP_AT[0], JUMP_AT[1], JUMP_AT[2], JUMP_AT[3], 0, SIDE_COST[MOVE.JUMP]);
          } else if (jumpFrom(a, b, feet[a], a0, a1)) edge(a, b, MOVE.JUMP, JUMP_AT[0], JUMP_AT[1], JUMP_AT[2], JUMP_AT[3], 0, SIDE_COST[MOVE.JUMP] + Math.max(0, feet[a] - feet[b]));
        }
        // Down and jump through a ledge, onto what lies under it.
        const seen = new Set();
        for (let c = colOf(x0[a]); c < colOf(x1[a] - TAKE_IN) + 1; c++) {
          if (at(c, r) !== KIND.LEDGE) continue;
          let g = false;
          for (let k = r - 1; k >= 0 && !g; k--) if (at(c, k) !== KIND.EMPTY) g = true;
          const b = g ? landOn(c, r) : -1;
          if (b >= 0 && b !== a && !seen.has(b)) { seen.add(b); edge(a, b, MOVE.DROP, c * CELL + OVER_IN, (c + 1) * CELL - OVER_IN, (c + 0.5) * CELL, 0, 0, SIDE_COST[MOVE.DROP]); }
        }
      }
      // Off either end: on into the next run in the row or into a basin's water, or off into a fall.
      for (const dir of [-1, 1]) {
        const c = dir < 0 ? colOf(x0[a]) - 1 : colOf(x1[a] - TAKE_IN) + 1;
        if (c < 0 || c >= cols || at(c, r + 1) === KIND.SOLID || at(c, r + 2) === KIND.SOLID) continue;
        const edgeX = dir < 0 ? x0[a] : x1[a], ax = edgeX + dir * LAND_IN;
        const n = segAt[r * cols + c];
        if (n >= 0) { edge(a, n, MOVE.WALK, ax, ax, ax, 0, 0, walkCost(n, dir)); continue; }
        if (basinCol[c] >= 0 && inBasin(c, r)) { edge(a, basin0 + basinCol[c], MOVE.WALK, ax, ax, ax, 0, 0, SIDE_COST[MOVE.WALK_OFF]); continue; }
        if (at(c, r) !== KIND.EMPTY) continue;
        // Off the end into a fall, flown from the edge: it keeps the way it walked until it has fallen LOCK_FALL, then
        // steers back over the column past the end, and lands where it lands (in a gust zone, under every push or in the
        // calm alone, as a jump).
        const mid = (c + 0.5) * CELL, b = fly(edgeX, feet[a], mid, 0, 0, dir);
        if (b < 0 || b === a) continue;
        const windy = gusty(c - 2, c + 2), calm = windy && (fly(edgeX, feet[a], mid, 1, 0, dir) !== b || fly(edgeX, feet[a], mid, 2, 0, dir) !== b) ? 1 : 0;
        edge(a, b, MOVE.WALK_OFF, mid, mid, mid, calm, 0, SIDE_COST[MOVE.WALK_OFF]);
      }
    }
    // Off a lift at its high end.
    for (let n = nSeg; n < basin0; n++) {
      const a0 = x0[n] + TAKE_IN, a1 = x1[n] - TAKE_IN;
      for (let b = 0; b < nSeg; b++) if (Math.max(0, x0[b] - x1[n], x0[n] - x1[b]) <= 2 && jumpFrom(n, b, top[n], a0, a1)) edge(n, b, MOVE.ALIGHT, JUMP_AT[0], JUMP_AT[1], JUMP_AT[2], JUMP_AT[3], 0, SIDE_COST[MOVE.ALIGHT]);
    }
    // Out of a basin: a raft's jump at each level it lands from, and a walk onto a bank flush with the water.
    for (let k = 0; k < NB; k++) {
      const [c0, c1, low, high] = basins[k], n = basin0 + k;
      for (const [f0, f1] of floats) {
        if (f1 < c0 || f0 > c1) continue;
        const ta0 = Math.max(f0, c0) * CELL + TAKE_IN, ta1 = (Math.min(f1, c1) + 1) * CELL - TAKE_IN;
        for (let b = 0; b < nSeg; b++) {
          if (Math.max(0, x0[b] - ta1, ta0 - x1[b]) > 2) continue;
          let mask = 0, span0 = 0, span1 = 0, aim = 0, calm = 0;
          for (let L = low; L <= high; L++) {
            setLevel(k, L);
            if (!jumpFrom(n, b, (L + 1) * CELL, mask ? span0 : ta0, mask ? span1 : ta1, mask ? aim : undefined)) continue;
            if (!mask) { span0 = JUMP_AT[0]; span1 = JUMP_AT[1]; aim = JUMP_AT[2]; }
            else { span0 = Math.max(span0, JUMP_AT[0]); span1 = Math.min(span1, JUMP_AT[1]); }
            calm = Math.max(calm, JUMP_AT[3]); mask |= 1 << (L - low);
          }
          setLevel(k, low);
          if (mask) edge(n, b, MOVE.JUMP, span0, span1, aim, calm, mask, SIDE_COST[MOVE.JUMP] + BASIN_WAIT);
        }
      }
      for (const dir of [-1, 1]) {
        const c = dir < 0 ? c0 - 1 : c1 + 1;
        for (let r = low; r <= high && c >= 0 && c < cols; r++) {
          const b = segAt[r * cols + c];
          if (b < 0) continue;
          const edgeX = dir < 0 ? c0 * CELL : (c1 + 1) * CELL;
          edge(n, b, MOVE.WALK, edgeX - dir * 0.4, edgeX - dir * LAND_IN, edgeX + dir * LAND_IN, 0, 1 << (r - low), walkCost(b, dir) + BASIN_WAIT);
        }
      }
    }
    // The goal: the lowest run the start reaches on the lock screen (the widest there of those), walked along to where the
    // screen locks.
    let start = -1;
    for (let r = st.start.row - 1; r >= 0 && start < 0; r--) if (at(st.start.col, r) !== KIND.EMPTY) start = nodeAt(st.start.col, r);
    const reached = new Uint8Array(N), queue = [start];
    reached[start] = 1;
    for (let q = 0; q < queue.length; q++) for (const [f, t] of edges) if (f === queue[q] && !reached[t]) { reached[t] = 1; queue.push(t); }
    const lockX = st.lockScreen * SCREEN_X, overlap = (n) => Math.min(x1[n], lockX + SCREEN_X) - Math.max(x0[n], lockX);
    let goal = -1;
    for (let n = 0; n < nSeg; n++) {
      if (!reached[n] || overlap(n) <= 0) continue;
      if (goal < 0 || feet[n] < feet[goal] || (feet[n] === feet[goal] && overlap(n) > overlap(goal))) goal = n;
    }
    if (goal < 0) throw new Error(`raid autopilot: ${st.id}: no run on the lock screen is reached from the start`);
    // The cheapest way to the goal from every node, and each node's edge on it.
    const dist = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1);
    dist[goal] = 0;
    for (let changed = true; changed;) {
      changed = false;
      for (let k = 0; k < edges.length; k++) { const [f, t, , , , , , , cost] = edges[k], d = dist[t] + cost; if (d < dist[f]) { dist[f] = d; via[f] = k; changed = true; } }
    }
    // From the goal down, each node's move as its edge has it, but for a jump aimed again where the node it lands on makes
    // its own move from, when a takeoff lands there (so a crumbling plank is left at once).
    const next = new Int16Array(N).fill(-1), move = new Uint8Array(N), tx0 = new Float64Array(N), tx1 = new Float64Array(N), ax = new Float64Array(N);
    const order = Array.from({ length: N }, (_, n) => n).filter((n) => dist[n] < Infinity).sort((p, q) => dist[p] - dist[q]);
    const hold = Math.min(x1[goal] - LAND_IN, Math.max(x0[goal] + LAND_IN, lockX + HALF_SCREEN + LAND_IN));
    tx0[goal] = hold - AT_SPOT; tx1[goal] = hold + AT_SPOT; ax[goal] = hold;
    for (const a of order) {
      if (a === goal) continue;
      const [, b, m, e0, e1, eax, , mask] = edges[via[a]];
      next[a] = b; move[a] = m; tx0[a] = e0; tx1[a] = e1; ax[a] = eax;
      if ((m !== MOVE.JUMP && m !== MOVE.ALIGHT) || mask || kind[b] !== K_RUN || next[b] < 0) continue;
      const want = Math.min(x1[b] - LAND_IN, Math.max(x0[b] + LAND_IN, (tx0[b] + tx1[b]) / 2));
      const y = kind[a] === K_LIFT ? top[a] : feet[a], aimed = jumpFrom(a, b, y, sx0[a], sx1[a], want);
      if (aimed && JUMP_AT[2] === want && JUMP_AT[3] <= edges[via[a]][6]) { tx0[a] = JUMP_AT[0]; tx1[a] = JUMP_AT[1]; ax[a] = want; }
    }
    // The edges by the node they leave, for the fight's search: eStart[n] to eStart[n + 1].
    const byFrom = edges.map((_, k) => k).sort((p, q) => edges[p][0] - edges[q][0] || p - q), E = edges.length;
    const eStart = new Int32Array(N + 1), col = (j) => Float64Array.from(byFrom, (k) => edges[k][j]);
    for (const [f] of edges) eStart[f + 1]++;
    for (let n = 0; n < N; n++) eStart[n + 1] += eStart[n];
    const renumber = new Int32Array(E);
    byFrom.forEach((k, i) => { renumber[k] = i; });
    return Object.freeze({
      side: true, nSeg, N, goal, segAt, basin0, NB, x0: Float64Array.from(x0), x1: Float64Array.from(x1), feet: Float64Array.from(feet), top: Float64Array.from(top),
      span: Int16Array.from(span), kind: Uint8Array.from(kind), water: Uint8Array.from(water), belt: Float64Array.from(belt), sx0, sx1,
      next, move, tx0, tx1, ax, via: Int32Array.from(via, (k) => k < 0 ? -1 : renumber[k]),
      lifts: Object.freeze(st.lifts.map((lift) => Float64Array.from(lift))),
      basins: Int16Array.from(basins.flat()), basinCol, raft,
      eStart, eFrom: Int16Array.from(byFrom, (k) => edges[k][0]), eTo: Int16Array.from(byFrom, (k) => edges[k][1]), eMove: Uint8Array.from(byFrom, (k) => edges[k][2]),
      eTx0: col(3), eTx1: col(4), eAx: col(5), eCalm: Uint8Array.from(byFrom, (k) => edges[k][6]), eMask: Uint16Array.from(byFrom, (k) => edges[k][7]),
      // The pilot's scratch: each basin's level this step, and the fight's search (queue, the edge each node was reached
      // by, its hops).
      level: new Int16Array(NB), queue: new Int16Array(N), prev: new Int32Array(N), hops: new Int16Array(N),
      // Whether the fight keeps its spots for each sim (see `cacheOf`): not where the cells change in play.
      cachable: st.crumble.length === 0 && NB === 0
    });
  };

  // The side pilot, on the climb's pilot: the climb's memory (NODE, AIM, PLAN) and, in the slots a room's pilot uses there,
  // the fight's: the target's slot, where it stood last step (TX, TY), the spot (its node, its x, the shot's KIND and FACE),
  // the first edge on the way there (EDGE) and the node that was worked out from (FROM), when the target last lost a hit
  // point (SINCE, HP) and when it came to its spot (ARRIVED, -1 on the way; in the slot a room's pilot keeps its ROOM, which
  // a side stage never uses), from IGNORE one number an enemy slot: until when that slot is passed by (a target no spot
  // reaches, or one that stood GIVE_UP seconds at a spot without losing a hit point); then the slot the spot was worked out
  // for and where that target stood (SOLVED, SOLVED_X, SOLVED_Y: taken up again after a death, the spot is only walked
  // to again), and where the pilot holds while the boss's parts are all shut (HOLD_NODE, HOLD_X).
  const SIDE = Object.freeze({ ARRIVED: MEMO.ROOM, TGT: 7, TX: 8, TY: 9, SPOT_NODE: 10, SPOT_X: 11, KIND: 12, FACE: 13, EDGE: 14, FROM: 15, SINCE: 16, HP: 17, IGNORE: 18,
    SOLVED: 18 + ENEMY_SLOTS, SOLVED_X: 19 + ENEMY_SLOTS, SOLVED_Y: 20 + ENEMY_SLOTS, HOLD_NODE: 21 + ENEMY_SLOTS, HOLD_X: 22 + ENEMY_SLOTS });
  if (BL.raidSim.PILOT_MEMO <= SIDE.HOLD_X) throw new Error(`raid autopilot: the sim keeps ${BL.raidSim.PILOT_MEMO} pilot numbers, fewer than the side pilot's ${SIDE.HOLD_X + 1}`);
  // The fight's shots, by pose and aim: standing forward, straight up, up-forward and down-forward (on the ground those two
  // aims need left or right held, so the pilot steps toward the target and back a step at a time, firing on the step
  // toward), prone forward, and forward from a jump in place (fired while the muzzle passes through the box). FIGHT_IN is
  // how far inside a run's ends a spot stands (BELT_IN more at the end a belt carries toward), HOP_COST what a move to
  // another node counts against metres walked, GIVE_UP and IGNORE_FOR how long a target may stand unhurt at a spot and how
  // long it is then passed by (GIVE_UP_WALK, how long the way to its spot may take without a hit), SPOT_NEAR how near an up shot's or a diagonal's spot the pilot stands (a forward shot's,
  // AT_SPOT), and LINE_STEP how finely a shot's line is walked for solid cells.
  const SHOT = Object.freeze({ STAND: 0, UP: 1, DIAG_UP: 2, DIAG_DOWN: 3, PRONE: 4, JUMP: 5 });
  const FIGHT_IN = 0.12, BELT_IN = 0.4, SPOT_NEAR = 0.05, HOP_COST = 2, GIVE_UP = 6, GIVE_UP_WALK = 20, IGNORE_FOR = 12, LINE_STEP = 0.04;
  const PEAK = TUNE.JUMP_V * TUNE.JUMP_V / (2 * TUNE.GRAVITY);
  // The run's cell at (c, r): its own copy where it keeps one (crumbled spans, the tide), else the stage's.
  const cellRun = (s, st, c, r) => s.cells.length === 0 ? cellAt(st, c, r) : c < 0 || c >= st.cols ? KIND.SOLID : r < 0 || r >= st.rows ? KIND.EMPTY : s.cells[r * st.cols + c];
  // Scratch, so no number is passed to or returned from a call (see LIFT_AT): LN a shot line (muzzle x, y, direction x, y,
  // and how far along it the box starts), BOX the target's box in the world (x from, x to, y from, y to: its bullet box
  // about its origin, and in BOX[4] the seconds its origin is led by), FS a spot (x, feet, a jump's rise over the feet, and
  // the span a spot is sought in, from and to), MV a move (next node, move, takeoff from and to, aim, edge).
  const LN = new Float64Array(5), BOX = new Float64Array(5), FS = new Float64Array(5), MV = new Float64Array(6), MEET = new Float64Array(1);
  // The shot line LN, from its muzzle to where it enters BOX (slot i's), crosses no solid cell, stays on the screen and
  // meets no other machine's or shut enemy's bullet box first (one that spends the shot: a boss's shut hull before its
  // part); fodder in the way is left to die. Counted in whole steps, so no number is a phi of an integer and a fraction.
  const lineClear = (s, st, i) => {
    const left = s.camX, right = s.camX + SCREEN_X, bottom = s.camY, topY = st.kind === "climb" ? s.camY + SCREEN_Y : st.rows * CELL;
    for (let k = 0, n = Math.floor(LN[4] / LINE_STEP); k <= n; k++) {
      const x = LN[0] + LN[2] * k * LINE_STEP, y = LN[1] + LN[3] * k * LINE_STEP;
      if (x < left || x >= right || y < bottom || y >= topY || cellRun(s, st, Math.floor(x / CELL), Math.floor(y / CELL)) === KIND.SOLID) return false;
    }
    for (let j = 0; j < ENEMY_SLOTS; j++) {
      const t = s.eType[j];
      if (j === i || HP_OF[t] === 0 || s.eRoutine[j] >= DESTROYED[t] || s.eFlags[j] & FLAG.GHOST || !(s.eFlags[j] & (FLAG.SHUT | FLAG.MACHINE))) continue;
      const b = RULES.SHOT_BOX[TIER_OF[t]], ox = s.ex[j], oy = s.ey[j] + ORIGIN_OF[t];
      // The line's span inside this box (as `lineMeets`), against where it enters the target's.
      let lo = 0 * LN[4], hi = LN[4];   // 0 as a fraction would be, so lo is never an integer and a fraction by turns
      if (LN[2] === 0) { if (LN[0] < ox + b[0] || LN[0] >= ox + b[1]) continue; }
      else { const p = (ox + b[0] - LN[0]) / LN[2], q = (ox + b[1] - LN[0]) / LN[2], near = p < q ? p : q, far = p < q ? q : p; if (near > lo) lo = near; if (far < hi) hi = far; }
      if (LN[3] === 0) { if (LN[1] <= oy + b[2] || LN[1] > oy + b[3]) continue; }
      else { const p = (oy + b[2] - LN[1]) / LN[3], q = (oy + b[3] - LN[1]) / LN[3], near = p < q ? p : q, far = p < q ? q : p; if (near > lo) lo = near; if (far < hi) hi = far; }
      if (lo < hi) return false;
    }
    return true;
  };
  // A muzzle at LN[0], LN[1] along LN[2], LN[3] meets BOX at least AIM_IN inside it: LN[4] becomes how far along the line
  // it enters. The box is x from <= x < x to and y from < y <= y to, as the sim's.
  // The fight's helpers below run seldom (on a new target or node) and so long in the engine's middle tier, which boxes
  // what Math.min, max and abs return: they compare in place instead.
  const lineMeets = () => {
    // The line's span inside the box along x, then along y: from LN[4] to MEET[0] (kept in scratch, see RUN_AT).
    LN[4] = 0; MEET[0] = 1e9;
    if (LN[2] === 0) { if (LN[0] < BOX[0] + AIM_IN || LN[0] > BOX[1] - AIM_IN) return false; }
    else {
      const p = (BOX[0] - LN[0]) / LN[2], q = (BOX[1] - LN[0]) / LN[2], near = p < q ? p : q, far = p < q ? q : p;
      if (near > LN[4]) LN[4] = near;
      if (far < MEET[0]) MEET[0] = far;
    }
    if (LN[3] === 0) { if (LN[1] < BOX[2] + AIM_IN || LN[1] > BOX[3] - AIM_IN) return false; }
    else {
      const p = (BOX[2] - LN[1]) / LN[3], q = (BOX[3] - LN[1]) / LN[3], near = p < q ? p : q, far = p < q ? q : p;
      if (near > LN[4]) LN[4] = near;
      if (far < MEET[0]) MEET[0] = far;
    }
    // The span along the line, at least 2 AIM_IN across the box along its longer axis (a diagonal's is H of the line).
    return MEET[0] - LN[4] >= (LN[2] !== 0 && LN[3] !== 0 ? 2 * AIM_IN / H : 2 * AIM_IN);
  };
  // The muzzle and direction of a fight shot `kind` facing `face` from feet FS[0], FS[1] into LN; a jump's FS[2] over the
  // feet. The muzzles are the sim's (TUNE.MUZZLE by pose and aim).
  // SHOT_DX and SHOT_DY are each shot's direction facing right, by SHOT, and SHOT_MX and SHOT_MY its muzzle forward of and
  // over the feet (typed arrays, so a number read is never an integer in one shot and a fraction in another, which would
  // box it).
  const H = Math.SQRT1_2, SHOT_DX = Float64Array.of(1, 0, H, H, 1, 1), SHOT_DY = Float64Array.of(0, 1, H, -H, 0, 0);
  const SHOT_AT = [[POSE.STAND, 0], [POSE.STAND, 2], [POSE.STAND, 1], [POSE.STAND, 7], [POSE.PRONE, 0], [POSE.JUMP, 0]];
  const SHOT_MX = Float64Array.from(SHOT_AT, ([pose, k]) => TUNE.MUZZLE[pose][k][0]), SHOT_MY = Float64Array.from(SHOT_AT, ([pose, k]) => TUNE.MUZZLE[pose][k][1]);
  const aimLine = (kind, face) => {
    const dx = face * SHOT_DX[kind], dy = SHOT_DY[kind];
    LN[0] = FS[0] + face * SHOT_MX[kind]; LN[1] = FS[1] + (kind === SHOT.JUMP ? FS[2] : 0) + SHOT_MY[kind]; LN[2] = dx; LN[3] = dy;
  };
  // Slot i's bullet box in the world into BOX, its origin moved on by BOX[4] seconds of the move the pilot saw last step.
  const boxOf = (s, memo, i) => {
    const t = s.eType[i], b = RULES.SHOT_BOX[TIER_OF[t]], lead = BOX[4];
    let ox = s.ex[i], oy = s.ey[i] + ORIGIN_OF[t];   // never a fraction or an integer by turns (see SHOT_DX)
    if (memo[SIDE.TGT] === i && lead > 0) { ox += (s.ex[i] - memo[SIDE.TX]) / FIXED * lead; oy += (s.ey[i] - memo[SIDE.TY]) / FIXED * lead; }
    BOX[0] = ox + b[0]; BOX[1] = ox + b[1]; BOX[2] = oy + b[2]; BOX[3] = oy + b[3];
  };
  // A spot on node n (its feet FS[1], standing from FS[3] to FS[4]) from which shot `kind` facing `face` meets slot i's
  // box with nothing in the way, and no touch of the slot there: FS[0] becomes its x. A forward shot tries STAND_OFF off the box
  // first (or the nearest point of the span to it), then out from there SPOT_STEP at a time; an up shot or a diagonal
  // takes the middle of the span of spots whose line crosses the box (at least 3 SPOT_FINE wide, so the diagonals' step
  // toward the target and back still works).
  const SPOT_STEP = 0.2, SPOT_FINE = 0.02, RUN_AT = new Float64Array(4);
  const spotWorks = (s, st, i, kind, face) => {
    const t = s.eType[i], ox = s.ex[i], oy = s.ey[i] + ORIGIN_OF[t], touch = RULES.BOXES[TIER_OF[t]][POSE.STAND];
    const dx = FS[0] - ox, dy = FS[1] + RULES.PLAYER_POINT[POSE.STAND] - oy;
    if (dx >= touch[0] - 0.1 && dx < touch[1] + 0.1 && dy > touch[2] - 0.1 && dy <= touch[3] + 0.1) return false;
    if (kind === SHOT.JUMP) {
      // The muzzle passes the box's middle height on the way up, so the line is tried there.
      FS[2] = (BOX[2] + BOX[3]) / 2 - FS[1] - SHOT_MY[SHOT.JUMP];
      if (FS[2] < 0 || FS[2] > PEAK - 0.05) return false;
      // Headroom: no solid cell over the body's width from the feet to the head at that height, or the jump bumps its
      // head and the muzzle never gets there.
      const half = RULES.BOX[POSE.STAND][0], r1 = Math.floor((FS[1] + FS[2] + RULES.BOX[POSE.JUMP][1]) / CELL);
      for (let c = Math.floor((FS[0] - half) / CELL), c1 = Math.floor((FS[0] + half) / CELL); c <= c1; c++) {
        for (let r = Math.floor(FS[1] / CELL + EPS); r <= r1; r++) if (cellRun(s, st, c, r) === KIND.SOLID) return false;
      }
    }
    aimLine(kind, face);
    if ((kind === SHOT.STAND || kind === SHOT.PRONE || kind === SHOT.JUMP) && face * (LN[0] - ox) > 0) return false;   // past it
    return lineMeets() && lineClear(s, st, i);
  };
  const spotOn = (s, st, i, kind, face) => {
    const lo = FS[3], hi = FS[4];
    if (lo > hi) return false;
    if (kind === SHOT.STAND || kind === SHOT.PRONE || kind === SHOT.JUMP) {
      // None at all when the muzzle never stands at the box's height (a jump's passes its middle), or the span holds no
      // point on the side of the box the shot faces from.
      const my = SHOT_MY[kind], mx = SHOT_MX[kind];
      if (kind === SHOT.JUMP ? FS[1] + my > (BOX[2] + BOX[3]) / 2 || FS[1] + my + PEAK - 0.05 < (BOX[2] + BOX[3]) / 2
        : FS[1] + my <= BOX[2] + AIM_IN || FS[1] + my > BOX[3] - AIM_IN) return false;
      if (face > 0 ? lo + mx > BOX[1] - AIM_IN : hi - mx < BOX[0] + AIM_IN) return false;
      const pref = s.ex[i] - face * STAND_OFF;
      for (let k = 0; k < 12; k++) {
        FS[0] = pref + (k % 2 === 0 ? 1 : -1) * ((k + 1) >> 1) * SPOT_STEP;
        if (FS[0] < lo) FS[0] = lo;
        if (FS[0] > hi) FS[0] = hi;
        if (spotWorks(s, st, i, kind, face)) return true;
      }
      return false;
    }
    // An up shot or a diagonal: the muzzles whose line crosses the box's x span within its y span (the line's x at a height
    // moves with the muzzle, so these make one span of x), worked out from the muzzle's height on node n; tried at its
    // middle, then a quarter of the way in from either end. RUN_AT holds the span (see the comment on it).
    const my = FS[1] + SHOT_MY[kind], off = face * SHOT_MX[kind];
    if (kind === SHOT.UP) { if (BOX[3] - AIM_IN <= my) return false; RUN_AT[0] = BOX[0] + AIM_IN; RUN_AT[1] = BOX[1] - AIM_IN; }
    else {
      // How far up (or down, for the down diagonal) the line runs to the near and the far edge of the box's height.
      // (RUN_AT[2] and [3], none under 0.)
      const up = kind === SHOT.DIAG_UP;
      RUN_AT[2] = up ? BOX[2] - my : my - BOX[3]; RUN_AT[3] = up ? BOX[3] - my : my - BOX[2];
      if (RUN_AT[2] < 0) RUN_AT[2] = 0;
      if (RUN_AT[3] - RUN_AT[2] <= 2 * AIM_IN) return false;
      RUN_AT[0] = face > 0 ? BOX[0] + AIM_IN - RUN_AT[3] : BOX[0] + AIM_IN + RUN_AT[2]; RUN_AT[1] = face > 0 ? BOX[1] - AIM_IN - RUN_AT[2] : BOX[1] - AIM_IN + RUN_AT[3];
    }
    RUN_AT[0] -= off; RUN_AT[1] -= off;   // the feet's span, from the muzzle's
    if (RUN_AT[0] < lo) RUN_AT[0] = lo;
    if (RUN_AT[1] > hi) RUN_AT[1] = hi;
    if (RUN_AT[1] - RUN_AT[0] < 3 * SPOT_FINE) return false;
    for (let k = 0; k < 3; k++) {
      FS[0] = RUN_AT[0] + (RUN_AT[1] - RUN_AT[0]) * (k === 0 ? 0.5 : k === 1 ? 0.25 : 0.75);
      if (spotWorks(s, st, i, kind, face)) return true;
    }
    return false;
  };
  // The fight's search from node `from` (feet `y` there now): breadth first over the plan's edges through the nodes on
  // the screen, a spot on each run reached (or the node it stands on) for each shot in turn, and the cheapest kept in the
  // memo (SPOT_NODE, SPOT_X, KIND, FACE, and EDGE, the first move toward it, -1 when it is on `from`). False for none.
  // The search runs only when the target or the node changes, too seldom for the engine to compile it, so every number
  // with a fraction in it is worked in `consider` and `expand`, which run once a node and are compiled soon: BEST holds the
  // best spot's node, shot and face (-1 for none yet), BEST_AT its cost and x.
  const BEST = new Int32Array(3), BEST_AT = new Float64Array(2);
  // Node n, `hops` moves from `from`: each shot in turn for a spot on it, the first that works kept when cheaper than the
  // best yet. True when no node this far or further can beat the best found. Before the boss is in play only spots on the
  // pilot's side of the target are tried (a machine in the way is shot from where the pilot comes from, never walked past).
  const consider = (s, st, plan, i, n, from, hops) => {
    if (BEST[0] >= 0 && hops * HOP_COST > BEST_AT[0]) return true;
    const here = n === from, x = s.px[0];
    if (!(here || (plan.kind[n] === K_RUN && plan.span[n] < 0)) || (plan.kind[n] === K_RUN && plan.water[n] && !here)) return false;
    FS[1] = here ? s.py[0] : plan.feet[n];
    // On a belt, BELT_IN further in at the end it carries toward, so holding a spot against it never reaches that end.
    FS[3] = (plan.sx0[n] > plan.x0[n] + FIGHT_IN ? plan.sx0[n] : plan.x0[n] + FIGHT_IN) + (plan.belt[n] < 0 ? BELT_IN : 0);
    FS[4] = (plan.sx1[n] < plan.x1[n] - FIGHT_IN ? plan.sx1[n] : plan.x1[n] - FIGHT_IN) - (plan.belt[n] > 0 ? BELT_IN : 0);
    if (FS[3] < s.camX + 0.3) FS[3] = s.camX + 0.3;
    if (FS[4] > s.camX + SCREEN_X - 0.3) FS[4] = s.camX + SCREEN_X - 0.3;
    const toward = s.ex[i] >= x ? 1 : -1, faces = s.phase === PHASE.BOSS ? 2 : 1;
    for (let kind = 0; kind <= SHOT.JUMP; kind++) {
      if (kind === SHOT.JUMP && plan.water[n]) break;
      for (let f = 0; f < faces; f++) {
        const face = f === 0 ? toward : -toward;
        if (kind === SHOT.UP && f > 0) break;
        if (!spotOn(s, st, i, kind, face)) continue;
        const cost = hops * HOP_COST + (FS[0] > x ? FS[0] - x : x - FS[0]) * 0.5 + kind * 0.6;
        if (BEST[0] < 0 || cost < BEST_AT[0]) { BEST[0] = n; BEST[1] = kind; BEST[2] = face; BEST_AT[0] = cost; BEST_AT[1] = FS[0]; }
        return false;   // the first shot that works on a node is its best (they come in order)
      }
    }
    return false;
  };
  // The nodes on the screen node n's edges reach that the search has not, queued from `tail`; the queue's new end.
  const expand = (s, plan, n, hops, tail) => {
    const left = s.camX + 0.3, right = s.camX + SCREEN_X - 0.3;
    for (let e = plan.eStart[n]; e < plan.eStart[n + 1]; e++) {
      const b = plan.eTo[e];
      if (plan.hops[b] >= 0 || plan.x1[b] < left || plan.x0[b] > right) continue;
      plan.hops[b] = hops + 1; plan.prev[b] = e; plan.queue[tail++] = b;
    }
    return tail;
  };
  // The first move from node `from` to the spot's node (SPOT_NODE) through the nodes on the screen, into EDGE (-1 on it);
  // false when the spot cannot be reached from there.
  const routeTo = (plan, memo, s, from) => {
    const spot = memo[SIDE.SPOT_NODE];
    plan.hops.fill(-1);
    plan.queue[0] = from; plan.hops[from] = 0; plan.prev[from] = -1;
    for (let head = 0, tail = 1; head < tail && plan.hops[spot] < 0;) { const n = plan.queue[head++]; tail = expand(s, plan, n, plan.hops[n], tail); }
    if (plan.hops[spot] < 0) return false;
    let e = -1;
    for (let n = spot; n !== from; n = plan.eFrom[e]) e = plan.prev[n];
    memo[SIDE.EDGE] = e; memo[SIDE.FROM] = from;
    return true;
  };
  // Spots found, kept for each sim in SPOT_CACHE entries (the target's type and where it stood, the node searched from; the
  // spot's node, x, shot and face) and used again when the same target stands in the same place and the pilot searches
  // from the same node: a run meets the same printers life after life, and the search, run that seldom, would run in the
  // engine's slow tiers each time, boxing its numbers. Each sim's own (made on its first search, the one other time the
  // pilot allocates), so a run never steers by what another found; none on a stage whose cells change in play (crumbling
  // spans, the tide), where a spot found once may not hold.
  const CACHES = new WeakMap();
  const cacheOf = (sim, plan) => {
    if (!plan.cachable) return null;
    let c = CACHES.get(sim);
    if (c === undefined) {
      c = Object.freeze({
        type: new Int16Array(SPOT_CACHE).fill(-1), from: new Int16Array(SPOT_CACHE), x: new Float64Array(SPOT_CACHE), y: new Float64Array(SPOT_CACHE),
        node: new Int16Array(SPOT_CACHE), kind: new Int8Array(SPOT_CACHE), face: new Int8Array(SPOT_CACHE), sx: new Float64Array(SPOT_CACHE), next: new Int32Array(1)
      });
      CACHES.set(sim, c);
    }
    return c;
  };
  const cacheFind = (s, c, i, from) => {
    const t = s.eType[i];
    for (let k = 0; k < SPOT_CACHE; k++) {
      if (c.type[k] !== t || c.from[k] !== from || c.x[k] !== s.ex[i] || c.y[k] !== s.ey[i]) continue;
      return k;
    }
    return -1;
  };
  const cacheKeep = (s, c, i, from) => {
    const found = cacheFind(s, c, i, from), k = found >= 0 ? found : c.next[0];   // an entry for the same search is overwritten
    c.type[k] = s.eType[i]; c.from[k] = from; c.x[k] = s.ex[i]; c.y[k] = s.ey[i];
    c.node[k] = BEST[0]; c.kind[k] = BEST[1]; c.face[k] = BEST[2]; c.sx[k] = BEST_AT[1];
    if (found < 0) c.next[0] = (k + 1) % SPOT_CACHE;
  };
  // Every entry for slot i's target where it stands, forgotten.
  const cacheDrop = (sim, plan, i) => {
    const c = cacheOf(sim, plan), s = sim.state;
    if (c === null) return;
    for (let k = 0; k < SPOT_CACHE; k++) if (c.type[k] === s.eType[i] && c.x[k] === s.ex[i] && c.y[k] === s.ey[i]) c.type[k] = -1;
  };
  const solveFight = (sim, plan, i, from) => {
    const s = sim.state, st = sim.stage, memo = sim.pilot, c = cacheOf(sim, plan);
    const cached = c !== null ? cacheFind(s, c, i, from) : -1;
    if (cached >= 0) {
      // The spot found before (the cells never change on a stage that keeps a cache, and the target and the node are the
      // same), if the way there is on the screen. It is not checked again here (that check, run this seldom, would run in
      // the engine's slow tiers each time); a shot is fired from it only when its line is clear (`aimed`), and a spot that
      // fails in play (its target unhurt GIVE_UP seconds there) is forgotten (`cacheDrop`).
      const n = c.node[cached];
      memo[SIDE.SPOT_NODE] = n; memo[SIDE.SPOT_X] = c.sx[cached]; memo[SIDE.KIND] = c.kind[cached]; memo[SIDE.FACE] = c.face[cached];
      memo[SIDE.SOLVED] = i; memo[SIDE.SOLVED_X] = s.ex[i]; memo[SIDE.SOLVED_Y] = s.ey[i];
      if (n === from) { memo[SIDE.EDGE] = -1; memo[SIDE.FROM] = from; return true; }
      if (routeTo(plan, memo, s, from)) return true;
    }
    return search(s, st, plan, memo, c, i, from);
  };
  // The search itself, kept in the cache `c` (null for none) when it finds a spot.
  const search = (s, st, plan, memo, c, i, from) => {
    plan.hops.fill(-1);
    plan.queue[0] = from; plan.hops[from] = 0; plan.prev[from] = -1;
    BEST[0] = -1; BOX[4] = 0; boxOf(s, memo, i);
    for (let head = 0, tail = 1; head < tail;) {
      const n = plan.queue[head++], hops = plan.hops[n];
      if (consider(s, st, plan, i, n, from, hops)) break;
      tail = expand(s, plan, n, hops, tail);
    }
    const best = BEST[0];
    if (best < 0) return false;
    let e = -1;
    for (let n = best; n !== from; n = plan.eFrom[e]) e = plan.prev[n];
    memo[SIDE.SPOT_NODE] = best; memo[SIDE.SPOT_X] = BEST_AT[1]; memo[SIDE.KIND] = BEST[1]; memo[SIDE.FACE] = BEST[2]; memo[SIDE.EDGE] = e; memo[SIDE.FROM] = from;
    memo[SIDE.SOLVED] = i; memo[SIDE.SOLVED_X] = s.ex[i]; memo[SIDE.SOLVED_Y] = s.ey[i];
    if (c !== null) cacheKeep(s, c, i, from);
    return true;
  };
  // Each basin's level this step, read from the run's cells (the tide writes its water there): the highest row over the
  // basin's low row in its first column that is not empty.
  const readLevels = (s, st, plan) => {
    for (let k = 0, i = 0; k < plan.NB; k++, i += 4) {
      const c = plan.basins[i], low = plan.basins[i + 2], high = plan.basins[i + 3];
      let level = low;
      for (let r = low + 1; r <= high; r++) if (cellRun(s, st, c, r) !== KIND.EMPTY) level = r;
      plan.level[k] = level;
    }
  };
  // The node player 0 stands on: a lift (in its columns, its feet on its top), a basin (its feet on the water's top), or a
  // run; -1 for none.
  const nodeNow = (s, st, plan) => {
    const x = s.px[0], y = s.py[0], col = Math.floor(x / CELL);
    for (let k = 0; k < plan.lifts.length; k++) {
      const L = plan.lifts[k];
      liftNow(L, s);
      if (col >= L[0] && col < L[0] + L[1] && Math.abs(y - LIFT_AT[0]) < 1e-3) return plan.nSeg + k;
    }
    if (col < 0 || col >= st.cols) return -1;
    const k = plan.NB ? plan.basinCol[col] : -1;
    if (k >= 0 && Math.abs(y - (plan.level[k] + 1) * CELL) < 1e-3) return plan.basin0 + k;
    const r = Math.round(y / CELL) - 1;
    return r >= 0 && r < st.rows ? plan.segAt[r * st.cols + col] : -1;
  };
  // A move from `node` (MV: the node it makes for, the move, the takeoff span, the aim, and its edge), as the climb makes
  // one: walk to where it is made from, wait while it cannot be made (the run it lands on crumbled, a lift not waiting at
  // the end it is boarded or left at, a basin's water not at a level the move is made from), then make it; one that lands
  // only in the calm shelters in the middle of its node from GUST_LEAD before a blow until the blow is over. `extra` (up
  // and fire) goes with every move but a drop.
  const make = (s, plan, memo, node, extra) => {
    const nxt = MV[0], move = MV[1], e = MV[5], x = s.px[0];
    memo[MEMO.NODE] = nxt; memo[MEMO.AIM] = MV[4];
    let wait = plan.span[nxt] >= 0 && s.crumblePhase[plan.span[nxt]] !== CRUMBLE.WHOLE;
    if (move === MOVE.BOARD) { liftNow(plan.lifts[nxt - plan.nSeg], s); wait = wait || LIFT_AT[1] < BOARD_LEFT; }
    if (move === MOVE.ALIGHT) { liftNow(plan.lifts[node - plan.nSeg], s); wait = wait || LIFT_AT[2] < ALIGHT_LEFT; }
    if (e >= 0 && plan.eMask[e] !== 0 && plan.kind[node] === K_BASIN) {
      const k = node - plan.basin0;
      wait = wait || (plan.eMask[e] & 1 << plan.level[k] - plan.basins[k * 4 + 2]) === 0;
    }
    if (e >= 0 && plan.eCalm[e] !== 0 && s.time % GUST_PERIOD > TUNE.GUST_CALM + TUNE.GUST_WARN - GUST_LEAD) {
      TO[0] = (plan.x0[node] + plan.x1[node]) / 2; return towards(s, AT_SPOT) | extra;
    }
    if (x < MV[2]) return IN.RIGHT | extra;
    if (x > MV[3]) return IN.LEFT | extra;
    if (wait) return extra;
    if (move === MOVE.DROP) return IN.DOWN | (s.prevInput & IN.JUMP ? 0 : IN.JUMP);
    TO[0] = MV[4];
    return towards(s, STEER) | (move === MOVE.WALK_OFF || move === MOVE.WALK ? 0 : s.prevInput & IN.JUMP ? 0 : IN.JUMP) | extra;
  };
  // The fight's target: the nearest open machine or boss part (a boss main, or a part linked to one) with hit points on the
  // screen, ahead of player 0 (or anywhere once the boss is in play), and not passed by: IGNORE holds until when a slot
  // is passed by, or, as -(node + 2), the node no spot for it was found from, where it is passed by while the pilot stands
  // there (so a target out of reach is not searched for again every step). HELD[0] becomes 1 when the boss is in play and
  // its parts on the screen are all shut.
  const HELD = new Uint8Array(1), PICK_AT = new Float64Array(1);
  const pickTarget = (s, memo, boss, node) => {
    const x = s.px[0], y = s.py[0], left = s.camX, right = s.camX + SCREEN_X;
    let best = -1;   // PICK_AT[0]: the best's distance (see RUN_AT)
    HELD[0] = 0;
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const t = s.eType[i];
      if (t === ENEMY.FREE) { memo[SIDE.IGNORE + i] = -1; continue; }
      if (HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & FLAG.GHOST || s.ex[i] < left || s.ex[i] > right) continue;
      const link = s.eLink[i], part = BOSS_MAIN[t] === 1 || (link >= 0 && BOSS_MAIN[s.eType[link]] === 1);
      if (!(s.eFlags[i] & FLAG.MACHINE) && !part) continue;
      if (!boss && s.ex[i] < x - 0.5) continue;
      if (s.eFlags[i] & FLAG.SHUT) { if (boss && part) HELD[0] = 1; continue; }
      if (memo[SIDE.IGNORE + i] > s.time || (node >= 0 && memo[SIDE.IGNORE + i] === -(node + 2))) continue;   // in the air, no node
      const dx = s.ex[i] - x, dy = s.ey[i] + ORIGIN_OF[t] - y, d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
      if (best < 0 || d < PICK_AT[0]) { best = i; PICK_AT[0] = d; }
    }
    if (best >= 0) HELD[0] = 0;
    return best;
  };
  // At the fight's spot: face the way the shot goes, then fire whenever the shot from where the muzzle is now (led by the
  // target's last step's move over the shot's flight) meets its box with nothing in the way. The diagonals step toward
  // the target from the spot's near side and back from its far side; a jump's shot jumps in place.
  const fightAt = (s, st, memo, i, fire) => {
    const kind = memo[SIDE.KIND], face = memo[SIDE.FACE], x = s.px[0];
    if ((kind === SHOT.STAND || kind === SHOT.PRONE || kind === SHOT.JUMP) && s.pFace[0] !== face) return face > 0 ? IN.RIGHT : IN.LEFT;
    const dir = face > 0 ? IN.RIGHT : IN.LEFT, back = face > 0 ? IN.LEFT : IN.RIGHT, diag = kind === SHOT.DIAG_UP || kind === SHOT.DIAG_DOWN;
    if (diag && face * (x - memo[SIDE.SPOT_X]) > 0) return back;   // past the spot: the step back
    if (kind === SHOT.JUMP) { memo[MEMO.NODE] = -1; return s.prevInput & IN.JUMP ? 0 : IN.JUMP; }
    FS[0] = diag ? x + face * TUNE.RUN * FIXED : x; FS[1] = s.py[0];
    // Aimed every step at the spot, not only on a step that can fire, which changes no button: asked that often, the aim
    // and its helpers reach the engine's optimizing tier within a fight's first seconds instead of running long in its
    // slower tiers, where every fraction they work out is a new heap number (the campaign's heap check counts them).
    const hit = aimed(s, st, memo, i, kind, face) && fire !== 0;
    const bits = kind === SHOT.PRONE ? IN.DOWN : kind === SHOT.UP ? IN.UP : kind === SHOT.DIAG_UP ? dir | IN.UP : kind === SHOT.DIAG_DOWN ? dir | IN.DOWN : 0;
    return bits | (hit ? fire : 0);
  };
  // Whether a shot `kind` facing `face` from feet FS (a jump's from where its muzzle is now) meets slot i's box, led.
  const aimed = (s, st, memo, i, kind, face) => {
    BOX[4] = 0; boxOf(s, memo, i);
    if (kind === SHOT.JUMP) FS[2] = 0;
    aimLine(kind, face);
    if (!lineMeets()) return false;
    if (memo[SIDE.TGT] === i && (s.ex[i] !== memo[SIDE.TX] || s.ey[i] !== memo[SIDE.TY])) {   // led only when it moves
      const speed = s.pWeapon[0] === WEAPON.BEAM ? TUNE.BEAM_V : s.pRapid[0] ? TUNE.RAPID_V : TUNE.SHOT_V;
      BOX[4] = LN[4] / speed; boxOf(s, memo, i);
      if (!lineMeets()) return false;
    }
    return lineClear(s, st, i);
  };
  // The shots taken facing the target where they stand (the diagonals step to and fro instead).
  const backTurn = (kind) => kind === SHOT.STAND || kind === SHOT.PRONE || kind === SHOT.JUMP;
  const sidePilot = (sim) => {
    const s = sim.state, st = sim.stage, memo = sim.pilot;
    if (memo[MEMO.PLAN] < 0) memo[MEMO.PLAN] = planIndex(st);
    const plan = PLANS[memo[MEMO.PLAN]];
    if (plan.NB) readLevels(s, st, plan);
    const fire = s.prevInput & IN.FIRE ? 0 : IN.FIRE, x = s.px[0], y = s.py[0], air = s.pPose[0] === POSE.JUMP;
    const muzzle = y + FORWARD, boss = s.phase === PHASE.BOSS;
    // The threat it fires at on its way: the nearest live enemy on the screen, up when it is above (as the climb's).
    let threat = -1, far = 0;
    for (let i = 0; i < ENEMY_SLOTS; i++) {
      const t = s.eType[i];
      if (HP_OF[t] === 0 || s.eRoutine[i] >= DESTROYED[t] || s.eFlags[i] & (FLAG.SHUT | FLAG.GHOST) || s.ex[i] < s.camX || s.ex[i] > s.camX + SCREEN_X) continue;
      const d = Math.abs(s.ex[i] - x) + Math.abs(s.ey[i] + ORIGIN_OF[t] - muzzle);
      if (threat < 0 || d < far) { threat = i; far = d; }
    }
    let up = 0;
    if (threat >= 0) { const dy = s.ey[threat] + ORIGIN_OF[s.eType[threat]] - muzzle; if (dy > 0.5 && Math.abs(s.ex[threat] - x) < dy) up = IN.UP; }
    const node = air ? -1 : nodeNow(s, st, plan), tgt = pickTarget(s, memo, boss, node);
    if (air) {
      const n = memo[MEMO.NODE];
      if (n < 0) {
        // A jump's shot in place: fire while the muzzle's line meets the box, from where the step the shot is fired in
        // carries the feet (the sim moves the Ooga before it fires).
        const i = memo[SIDE.TGT];
        if (i >= 0 && i === tgt && memo[SIDE.KIND] === SHOT.JUMP) {
          FS[0] = x; FS[1] = y + s.pvy[0] * FIXED - 0.5 * TUNE.GRAVITY * FIXED * FIXED;
          return fire !== 0 && aimed(s, st, memo, i, SHOT.JUMP, memo[SIDE.FACE]) ? fire : 0;
        }
        TO[0] = memo[MEMO.AIM]; return (TO[0] < 0 ? 0 : towards(s, STEER)) | up | fire;   // as the climb's: fall straight
      }
      let land = plan.feet[n];
      if (plan.kind[n] === K_LIFT) { liftNow(plan.lifts[n - plan.nSeg], s); land = LIFT_AT[0]; }
      else if (plan.kind[n] === K_BASIN) land = (plan.level[n - plan.basin0] + 1) * CELL;
      if (s.pvy[0] < 0 && y < land - 0.02) { memo[MEMO.NODE] = -1; memo[MEMO.AIM] = x; return up | fire; }   // missed it: fall straight
      TO[0] = memo[MEMO.AIM]; return towards(s, STEER) | up | fire;
    }
    memo[MEMO.NODE] = -1; memo[MEMO.AIM] = -1;
    if (tgt >= 0 && node >= 0) {
      // The fight: the spot worked out again when the target is new, has moved, or the pilot stands on another node; a
      // target no spot reaches, or one unhurt for GIVE_UP seconds at its spot, is passed by for a while.
      let fight = true;
      if (memo[SIDE.TGT] !== tgt) {
        memo[SIDE.TGT] = tgt; memo[SIDE.SINCE] = s.time; memo[SIDE.ARRIVED] = -1; memo[SIDE.HP] = s.eHp[tgt]; memo[SIDE.TX] = s.ex[tgt]; memo[SIDE.TY] = s.ey[tgt];
        const same = memo[SIDE.SOLVED] === tgt && s.ex[tgt] === memo[SIDE.SOLVED_X] && s.ey[tgt] === memo[SIDE.SOLVED_Y] && memo[SIDE.SPOT_NODE] >= 0 && plan.kind[memo[SIDE.SPOT_NODE]] === K_RUN;
        if (same) memo[SIDE.FROM] = -1;   // the spot it worked out for this target before: only the way there again
        else memo[SIDE.SPOT_NODE] = -1;
      }
      if (s.eHp[tgt] < memo[SIDE.HP]) { memo[SIDE.HP] = s.eHp[tgt]; memo[SIDE.SINCE] = s.time; }
      // Unhurt GIVE_UP seconds at the spot (from the later of its arrival and its last hit), or GIVE_UP_WALK on the way.
      const at = memo[SIDE.ARRIVED] >= 0, since = at && memo[SIDE.ARRIVED] > memo[SIDE.SINCE] ? memo[SIDE.ARRIVED] : memo[SIDE.SINCE];
      if (s.time - since > (at ? GIVE_UP : GIVE_UP_WALK)) { memo[SIDE.IGNORE + tgt] = s.time + IGNORE_FOR; fight = false; cacheDrop(sim, plan, tgt); }
      const moved = Math.abs(s.ex[tgt] - memo[SIDE.TX]) > 1e-5 || Math.abs(s.ey[tgt] - memo[SIDE.TY]) > 1e-5;
      // On another node with the target where it was and a spot on a run, only the way there is found again.
      const spot = memo[SIDE.SPOT_NODE], rerouted = fight && spot >= 0 && !moved && memo[SIDE.FROM] !== node && plan.kind[spot] === K_RUN && routeTo(plan, memo, s, node);
      if (fight && !rerouted && (spot < 0 || moved || memo[SIDE.FROM] !== node) && !solveFight(sim, plan, tgt, node)) {
        memo[SIDE.IGNORE + tgt] = -(node + 2); fight = false;
      }
      let bits = -1;
      if (fight) {
        if (memo[SIDE.SPOT_NODE] !== node) {
          const e = memo[SIDE.EDGE];
          MV[0] = plan.eTo[e]; MV[1] = plan.eMove[e]; MV[2] = plan.eTx0[e]; MV[3] = plan.eTx1[e]; MV[4] = plan.eAx[e]; MV[5] = e;
          memo[SIDE.ARRIVED] = -1;
          // Aimed on the way too, its answer unused, which changes no button (as `fightAt`'s every step): the aim's
          // helpers stay in the optimizing tier however few steps the pilot spends at its spots.
          FS[0] = x; FS[1] = y; aimed(s, st, memo, tgt, memo[SIDE.KIND], memo[SIDE.FACE]);
          bits = make(s, plan, memo, node, up | fire);
        } else if (Math.abs(x - memo[SIDE.SPOT_X]) > (memo[SIDE.KIND] === SHOT.UP || memo[SIDE.KIND] === SHOT.DIAG_UP || memo[SIDE.KIND] === SHOT.DIAG_DOWN ? SPOT_NEAR : AT_SPOT) ||
          (backTurn(memo[SIDE.KIND]) && s.pFace[0] !== memo[SIDE.FACE] && memo[SIDE.FACE] * (x - memo[SIDE.SPOT_X]) > -AT_SPOT / 2)) {
          // Walking back to the spot from the target's side, facing away, it goes on to half AT_SPOT past the spot, so the
          // step that turns it to the target (and a belt carrying it that way) leaves it at the spot still.
          memo[SIDE.ARRIVED] = -1;
          FS[0] = x; FS[1] = y; aimed(s, st, memo, tgt, memo[SIDE.KIND], memo[SIDE.FACE]);
          TO[0] = memo[SIDE.SPOT_X] - (s.pFace[0] !== memo[SIDE.FACE] ? memo[SIDE.FACE] * AT_SPOT / 2 : 0); bits = towards(s, 0) | up | fire;   // firing on the way, as the route does
        } else {
          if (memo[SIDE.ARRIVED] < 0) memo[SIDE.ARRIVED] = s.time;
          bits = fightAt(s, st, memo, tgt, fire);
        }
      }
      memo[SIDE.TX] = s.ex[tgt]; memo[SIDE.TY] = s.ey[tgt];
      if (bits >= 0) return bits;
      memo[SIDE.TGT] = -1;
    } else memo[SIDE.TGT] = -1;
    if (HELD[0] === 1 && node >= 0) {
      // The boss's parts on the screen all shut: it holds where it stands (against a belt, too).
      if (memo[SIDE.HOLD_NODE] !== node) { memo[SIDE.HOLD_NODE] = node; memo[SIDE.HOLD_X] = x; }
      TO[0] = memo[SIDE.HOLD_X]; return towards(s, AT_SPOT) | up | fire;
    }
    if (node < 0) return IN.RIGHT | up | fire;
    if (node === plan.goal) { TO[0] = plan.ax[node]; return towards(s, AT_SPOT) | up | fire; }
    if (plan.next[node] < 0) return IN.RIGHT | up | fire;
    MV[0] = plan.next[node]; MV[1] = plan.move[node]; MV[2] = plan.tx0[node]; MV[3] = plan.tx1[node]; MV[4] = plan.ax[node]; MV[5] = plan.via[node];
    return make(s, plan, memo, node, up | fire);
  };
  // A shot the side or climb pilot is about to fire whose line, from the muzzle the sim will fire it from with these
  // buttons (the pose and aim the sim's `poseOf` and `aimOf` give for them, as `stepPlayer` takes them, the ground under
  // the feet guessed from the pose it stands in, and TUNE.MUZZLE), meets a shut enemy's bullet box before any other
  // live one's: wasted (an emplacement not yet open or shut for good, a boss's shut hull), so the pilot holds that shot.
  // Walked LINE_STEP at a time to the screen's edge or a solid cell, unled; the fan's spread and the corkscrew's circle
  // are taken as their line. Looked at only while a shut enemy stands on the screen.
  const UNIT_X = [1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2, 0, Math.SQRT1_2], UNIT_Y = [0, Math.SQRT1_2, 1, Math.SQRT1_2, 0, -Math.SQRT1_2, -1, -Math.SQRT1_2];
  const shotWasted = (s, st, bits) => {
    const left = s.camX, right = s.camX + SCREEN_X, bottom = s.camY, top = st.kind === "climb" ? s.camY + SCREEN_Y : st.rows * CELL;
    let any = false;
    for (let j = 0; j < ENEMY_SLOTS && !any; j++) {
      const t = s.eType[j];
      if (HP_OF[t] > 0 && s.eRoutine[j] < DESTROYED[t] && s.eFlags[j] & FLAG.SHUT && s.ex[j] >= left - 1 && s.ex[j] <= right + 1) any = true;
    }
    if (!any) return false;
    const lr = (bits & IN.RIGHT ? 1 : 0) - (bits & IN.LEFT ? 1 : 0), ud = (bits & IN.UP ? 1 : 0) - (bits & IN.DOWN ? 1 : 0);
    const was = s.pPose[0], face = lr !== 0 ? lr : s.pFace[0], right1 = face > 0;
    if (was === POSE.WATER && ud < 0) return false;   // ducked: nothing fires
    const pose = poseOf(was === POSE.JUMP ? KIND.EMPTY : was === POSE.WATER ? KIND.WATER : KIND.LEDGE, lr, ud, false), aim = aimOf(right1, lr, ud, pose);
    const m = TUNE.MUZZLE[pose][right1 ? aim : (12 - aim) & 7], x0 = s.px[0] + face * m[0], y0 = s.py[0] + m[1], ux = UNIT_X[aim], uy = UNIT_Y[aim];
    for (let k = 0; k < 400; k++) {
      const x = x0 + ux * k * LINE_STEP, y = y0 + uy * k * LINE_STEP;
      if (x < left || x >= right || y < bottom || y >= top || cellRun(s, st, Math.floor(x / CELL), Math.floor(y / CELL)) === KIND.SOLID) return false;
      for (let j = 0; j < ENEMY_SLOTS; j++) {
        const t = s.eType[j];
        if (HP_OF[t] === 0 || s.eRoutine[j] >= DESTROYED[t] || s.eFlags[j] & FLAG.GHOST) continue;
        const b = RULES.SHOT_BOX[TIER_OF[t]], dx = x - s.ex[j], dy = y - s.ey[j] - ORIGIN_OF[t];
        if (dx >= b[0] && dx < b[1] && dy > b[2] && dy <= b[3]) return (s.eFlags[j] & FLAG.SHUT) !== 0;
      }
    }
    return false;
  };
  const autopilot = (sim) => {
    const s = sim.state, st = sim.stage;
    if (s.pState[0] !== PSTATE.NORMAL) return 0;
    if (st.kind === "rooms") return roomPilot(s, sim.pilot);
    const bits = st.kind === "climb" ? climbPilot(sim) : sidePilot(sim);
    return bits & IN.FIRE && shotWasted(s, st, bits) ? bits & ~IN.FIRE : bits;
  };

  BL.raidAutopilot = { autopilot, stageRoute: stagePlan };
})();
