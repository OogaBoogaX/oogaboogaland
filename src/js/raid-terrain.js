// Ooga Raid's terrain (raid-stages.js: `gusts`, `lifts`, `crumble`, `belts`, `tide`), kept apart from raid-sim.js
// and loaded before it. Pure and loadable in Node, as the sim is: no DOM, no scene.
//
// The readers the view and the pilots use, from the stage clock alone: `gustPhase(time)`, `gustDir(dir, time)` and a
// parsed lift's `liftTop(lift, time)`, with the GUST and CRUMBLE enums and GUST_PERIOD; and the tide's
// `tidePhase(time)`, a TIDE phase, and a parsed basin's `tideLevel(basin, time)`, the row its water stands to (its top
// is that row + 1, times CELL), with TIDE_PERIOD. The terrain's numbers are its own frozen TUNE, which raid-sim.js spreads
// into its TUNE under the same keys, so `BL.raidSim.TUNE.GUST_V` is this file's.
//
// `bind(run)` is called once by the sim's `create`, over that run's own arrays and constants (`s` the state, `st` the
// stage, `grid` the run's copy of the cells and `cols` its width, `LIFTS`, `SPANS`, `BELTS`, `BASINS` and `FLOATS` the
// terrain flattened, `NLIFT`, `NSPAN`, `NBELT` and `NBASIN` their counts, and the sim's PLAYERS, PSTATE, POSE and EPS),
// and returns the run's terrain steps: the lifts' scratch tops `LY0`, `LY1` and query heights `LIFTQ`, `placeLifts`,
// `liftStood`, `liftUnder`, `liftBelow`, `stepCrumble`, `blows` and `turn` (this step's gust: whether it blows, and which
// way a dir 0 zone blows) and `restore` (every span whole again, as `startStage` runs it); the belt a body stands on,
// `beltStood` (its feet in BELTQ); and the tide's `stepTide`, `placeTide`, `tideLift` (its feet in TIDEQ), `basinAt` and
// each basin's water top `TOPS`. As in the sim, no number crosses a call in the step: heights travel through LIFTQ, LY0,
// LY1, BELTQ, TIDEQ and TOPS, and a call returns an index or a flag. The rules themselves are told in raid-sim.js's
// header.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { KIND, CELL } = BL.raidStages;

  // Terrain: a gust cycle's calm, warning and blow in seconds and its speed along x; a crumbling span's fuse once stood on
  // and how long it stays gone; the tide's low water, rise, high water and fall in seconds.
  const TUNE = Object.freeze({
    GUST_CALM: 4, GUST_WARN: 0.8, GUST_BLOW: 2, GUST_V: 0.6, CRUMBLE_FUSE: 0.5, CRUMBLE_GONE: 3,
    TIDE_LOW: 4, TIDE_RISE: 3, TIDE_HIGH: 4, TIDE_FALL: 3
  });

  // Terrain for the view, from the stage clock (the step works the same out in place): the gust cycle's phase at `time`; the
  // way a zone of `dir` blows on the cycle `time` falls in (dir 0 left on even cycles, right on odd); a parsed lift's top
  // surface in metres at `time`. A crumbling span's state is the run's own (`crumblePhase`, CRUMBLE).
  const GUST = Object.freeze({ CALM: 0, WARN: 1, BLOW: 2 });
  const CRUMBLE = Object.freeze({ WHOLE: 0, FUSE: 1, GONE: 2 });
  const GUST_PERIOD = TUNE.GUST_CALM + TUNE.GUST_WARN + TUNE.GUST_BLOW;
  const gustPhase = (time) => {
    const at = time % GUST_PERIOD;
    return at < TUNE.GUST_CALM ? GUST.CALM : at < TUNE.GUST_CALM + TUNE.GUST_WARN ? GUST.WARN : GUST.BLOW;
  };
  const gustDir = (dir, time) => dir !== 0 ? dir : Math.floor(time / GUST_PERIOD) % 2 === 0 ? -1 : 1;
  const liftTop = (lift, time) => {
    const lowRow = lift[2], highRow = lift[3], speed = lift[4], hold = lift[5];
    const travel = (highRow - lowRow) * CELL / speed, at = time % (2 * (hold + travel));
    let row = highRow;
    if (at < hold) row = lowRow;
    else if (at < hold + travel) row = lowRow + (at - hold) * speed / CELL;
    else if (at >= 2 * hold + travel) row = highRow - (at - 2 * hold - travel) * speed / CELL;
    return (row + 1) * CELL;
  };
  // The tide, from the stage clock: low water for TIDE_LOW from time 0, then the rise, high water and the fall,
  // round again. A basin's level is its low row at low water and its high row at high water, stepping one whole row at a
  // time evenly through the rise and the fall (each of its high row - low row steps waits the rise's or the fall's share).
  const TIDE = Object.freeze({ LOW: 0, RISE: 1, HIGH: 2, FALL: 3 });
  const TIDE_PERIOD = TUNE.TIDE_LOW + TUNE.TIDE_RISE + TUNE.TIDE_HIGH + TUNE.TIDE_FALL;
  const tidePhase = (time) => {
    const at = time % TIDE_PERIOD;
    if (at < TUNE.TIDE_LOW) return TIDE.LOW;
    if (at < TUNE.TIDE_LOW + TUNE.TIDE_RISE) return TIDE.RISE;
    return at < TUNE.TIDE_LOW + TUNE.TIDE_RISE + TUNE.TIDE_HIGH ? TIDE.HIGH : TIDE.FALL;
  };
  const tideLevel = (basin, time) => {
    const low = basin[2], high = basin[3], n = high - low, at = time % TIDE_PERIOD;
    if (at < TUNE.TIDE_LOW) return low;
    if (at < TUNE.TIDE_LOW + TUNE.TIDE_RISE) return low + Math.floor((at - TUNE.TIDE_LOW) * n / TUNE.TIDE_RISE);
    if (at < TUNE.TIDE_LOW + TUNE.TIDE_RISE + TUNE.TIDE_HIGH) return high;
    return high - Math.floor((at - TUNE.TIDE_LOW - TUNE.TIDE_RISE - TUNE.TIDE_HIGH) * n / TUNE.TIDE_FALL);
  };

  const bind = (run) => {
    const { s, st, grid, cols, LIFTS, SPANS, BELTS, BASINS, FLOATS, NLIFT, NSPAN, NBELT, NBASIN, PLAYERS, PSTATE, POSE, EPS } = run;
    // Lifts. Each one's top this step, LY0 at the step's start and LY1 at its end, from the stage clock alone (`liftTop`
    // written out, so no number is passed to or returned from a call: see BOUNDS). The queries take their heights in LIFTQ
    // and return a lift's index, or -1: `liftStood`, the lift in column col whose top was at LIFTQ[0] at the step's start;
    // `liftUnder`, the highest lift in col a body crossed down onto, at or over its top at the step's start (LIFTQ[0]) and at
    // or under it at the end (LIFTQ[1]), so one passing up from below is never caught; `liftBelow`, the highest in col
    // whose top is over the screen's bottom and at or under y, ground for a drop-in or a spawner's entry (event code).
    const LY0 = new Float64Array(NLIFT), LY1 = new Float64Array(NLIFT), LIFTQ = new Float64Array(2);
    const placeLifts = (dt) => {
      for (let k = 0; k < NLIFT; k++) {
        const i = k * 6, lowRow = LIFTS[i + 2], highRow = LIFTS[i + 3], speed = LIFTS[i + 4], hold = LIFTS[i + 5];
        const travel = (highRow - lowRow) * CELL / speed, period = 2 * (hold + travel);
        for (let j = 0; j < 2; j++) {
          let at = s.time;
          if (j === 1) at += dt;
          at %= period;
          let row = highRow;
          if (at < hold) row = lowRow;
          else if (at < hold + travel) row = lowRow + (at - hold) * speed / CELL;
          else if (at >= 2 * hold + travel) row = highRow - (at - 2 * hold - travel) * speed / CELL;
          if (j === 0) LY0[k] = (row + 1) * CELL;
          else LY1[k] = (row + 1) * CELL;
        }
      }
    };
    const liftStood = (col) => {
      for (let k = 0, i = 0; k < NLIFT; k++, i += 6) if (col >= LIFTS[i] && col < LIFTS[i] + LIFTS[i + 1] && Math.abs(LIFTQ[0] - LY0[k]) <= EPS) return k;
      return -1;
    };
    const liftUnder = (col) => {
      let best = -1;
      for (let k = 0, i = 0; k < NLIFT; k++, i += 6) {
        if (col < LIFTS[i] || col >= LIFTS[i] + LIFTS[i + 1] || LIFTQ[0] < LY0[k] - EPS || LIFTQ[1] > LY1[k]) continue;
        if (best < 0 || LY1[k] > LY1[best]) best = k;
      }
      return best;
    };
    const liftBelow = (col, y) => {
      let best = -1;
      for (let k = 0, i = 0; k < NLIFT; k++, i += 6) {
        if (col < LIFTS[i] || col >= LIFTS[i] + LIFTS[i + 1] || LY1[k] <= s.camY || LY1[k] > y) continue;
        if (best < 0 || LY1[k] > LY1[best]) best = k;
      }
      return best;
    };
    // A crumbling span stood on while whole starts its fuse; when the fuse is out its cells read empty in the run's grid,
    // and when that time is out they come back as the stage has them.
    const stepCrumble = (dt) => {
      for (let k = 0, i = 0; k < NSPAN; k++, i += 3) {
        const phase = s.crumblePhase[k], row = SPANS[i + 2];
        if (phase === CRUMBLE.WHOLE) {
          for (let p = 0; p < PLAYERS; p++) {
            if (s.pState[p] !== PSTATE.NORMAL || s.pPose[p] === POSE.JUMP || Math.round(s.py[p] / CELL) - 1 !== row) continue;
            const col = Math.floor(s.px[p] / CELL);
            if (col < SPANS[i] || col > SPANS[i + 1]) continue;
            s.crumblePhase[k] = CRUMBLE.FUSE; s.crumbleTimer[k] = TUNE.CRUMBLE_FUSE;
            break;
          }
          continue;
        }
        const left = s.crumbleTimer[k] - dt;   // out under half a step, so Float32's remainder adds no step
        if (left >= dt / 2) { s.crumbleTimer[k] = left; continue; }
        const gone = phase === CRUMBLE.FUSE;
        s.crumblePhase[k] = gone ? CRUMBLE.GONE : CRUMBLE.WHOLE;
        s.crumbleTimer[k] = gone ? TUNE.CRUMBLE_GONE : 0;
        for (let col = SPANS[i], at = row * cols + col; col <= SPANS[i + 1]; col++, at++) grid[at] = gone ? KIND.EMPTY : st.cells[at];
      }
    };
    // This step's gust cycle (`gustPhase` and `gustDir` written out at the step's start, so no number is passed to or
    // returned from a call): whether it blows, and which way a dir 0 zone blows (-1 left, 1 right).
    const blows = () => s.time % GUST_PERIOD >= TUNE.GUST_CALM + TUNE.GUST_WARN;
    const turn = () => Math.floor(s.time / GUST_PERIOD) % 2 === 0 ? -1 : 1;
    // Every span whole again, the run's grid as the stage has it: `startStage` runs it on a stage with spans.
    const restore = () => { s.cells.set(st.cells); s.crumblePhase.fill(CRUMBLE.WHOLE); s.crumbleTimer.fill(0); };
    // Belts. The belt whose cells a body stands on, in column col with its feet (in BELTQ[0]) on the top of the belt's row,
    // or -1; the caller reads its speed from BELTS.
    const BELTQ = new Float64Array(1);
    const beltStood = (col) => {
      for (let k = 0, i = 0; k < NBELT; k++, i += 4) if (col >= BELTS[i] && col <= BELTS[i + 1] && Math.abs(BELTQ[0] - (BELTS[i + 2] + 1) * CELL) <= EPS) return k;
      return -1;
    };
    // The tide. Each column's basin (-1 for none) and whether a float stands in it; each basin's level as last written into
    // the run's grid (-1 before any) and its water top in metres.
    const BASIN_OF = new Int16Array(NBASIN ? cols : 0).fill(-1), FLOAT = new Uint8Array(NBASIN ? cols : 0);
    for (let k = 0, i = 0; k < NBASIN; k++, i += 4) BASIN_OF.fill(k, BASINS[i], BASINS[i + 1] + 1);
    for (let i = 0; i < FLOATS.length; i += 2) FLOAT.fill(1, FLOATS[i], FLOATS[i + 1] + 1);
    const LEVEL = new Int16Array(NBASIN).fill(-1), TOPS = new Float64Array(NBASIN);
    const basinAt = (col) => col >= 0 && col < BASIN_OF.length ? BASIN_OF[col] : -1;
    // Each basin whose level at the step's start (`tideLevel` written out, so no number is passed to or returned from a
    // call) is not the one last written is written again over the stage's cells: an empty cell from the low row up to the
    // level reads water, a float's top water cell reads a ledge (a raft), and every other cell of the basin is the stage's.
    const stepTide = () => {
      const at = s.time % TIDE_PERIOD;
      for (let k = 0, i = 0; k < NBASIN; k++, i += 4) {
        const low = BASINS[i + 2], high = BASINS[i + 3], n = high - low;
        let level = high;
        if (at < TUNE.TIDE_LOW) level = low;
        else if (at < TUNE.TIDE_LOW + TUNE.TIDE_RISE) level = low + Math.floor((at - TUNE.TIDE_LOW) * n / TUNE.TIDE_RISE);
        else if (at >= TUNE.TIDE_LOW + TUNE.TIDE_RISE + TUNE.TIDE_HIGH) level = high - Math.floor((at - TUNE.TIDE_LOW - TUNE.TIDE_RISE - TUNE.TIDE_HIGH) * n / TUNE.TIDE_FALL);
        if (level === LEVEL[k]) continue;
        LEVEL[k] = level; TOPS[k] = (level + 1) * CELL;
        for (let col = BASINS[i]; col <= BASINS[i + 1]; col++) {
          for (let row = low, c = low * cols + col; row <= high; row++, c += cols) {
            const base = st.cells[c];
            let kind = row > low && row <= level && base === KIND.EMPTY ? KIND.WATER : base;
            if (row === level && FLOAT[col] === 1 && kind === KIND.WATER) kind = KIND.LEDGE;
            grid[c] = kind;
          }
        }
      }
    };
    // Every basin written at the clock's level, whatever was last written: `startStage` runs it (after `restore`).
    const placeTide = () => { LEVEL.fill(-1); stepTide(); };
    // A body in column col whose feet (TIDEQ[0]) stand in the water of a basin, over its low row and at or under its level,
    // is set on top of the water there: true, with TIDEQ[0] its new feet. Validation keeps those rows to water and open air
    // in the stage, so this water is the tide's (or its raft), and nothing above the level is ever climbed.
    const TIDEQ = new Float64Array(1);
    const tideLift = (col) => {
      const k = basinAt(col);
      if (k < 0) return false;
      const low = BASINS[k * 4 + 2], level = LEVEL[k];
      let row = Math.floor(TIDEQ[0] / CELL + EPS);
      if (row <= low || row > level || grid[row * cols + col] === KIND.EMPTY) return false;
      while (row <= level && grid[row * cols + col] !== KIND.EMPTY) row++;
      TIDEQ[0] = row * CELL;
      return true;
    };
    return {
      LY0, LY1, LIFTQ, placeLifts, liftStood, liftUnder, liftBelow, stepCrumble, blows, turn, restore,
      BELTQ, beltStood, TIDEQ, TOPS, basinAt, stepTide, placeTide, tideLift
    };
  };

  BL.raidTerrain = { TUNE, GUST, CRUMBLE, TIDE, GUST_PERIOD, TIDE_PERIOD, gustPhase, gustDir, liftTop, tidePhase, tideLevel, bind };
})();
