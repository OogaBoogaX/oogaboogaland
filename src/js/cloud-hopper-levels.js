// Cloud Hopper's levels: plain data, loadable in Node (docs/cloud-hopper-levels-plan.md 2.1–2.4).
// A level's `route` is its route distance R in metres: horizontal, along the course axis, from the launch
// cloud's centre to the final cloud's centre 12 m off the coast. Level 1 is 21% shorter than the old course
// (430.5 m) and each level after it 42% longer than the one before. The start stands that far out from the
// final cloud and `slope` × R above it. `layout` and `timing` override cloud-hopper-course.js's LAYOUT and
// TIMING; `sky` names the chosen look; `board` is its shared high-score game and machine (highscore-rules.js).
// `courseVersion` changes whenever a level's challenge does, as does that board's registry version.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const BASE_ROUTE = 430.5 * 0.79, GROWTH = 1.42;
  const level = (id, name, sky, slope, layout, timing) => Object.freeze({ id, name, sky, courseVersion: 1, board: `cloud-hopper-l${id}`,
    route: BASE_ROUTE * GROWTH ** (id - 1), slope, layout: Object.freeze({ sides: 0.55, sideMax: 64, ...layout }), timing: Object.freeze(timing) });
  const LEVELS = Object.freeze([
    // Wider, calmer clouds closer together in drop, gentle turns, more that never fade, longer warnings.
    level(1, "Bluebird Hop", "l1b", 0.5,
      { step: 12, main: [3.1, 1, 2.2, 0.8], side: [3.2, 0.8, 2.4, 0.6], turn: 25, sway: 5, lane: [3, 2], speed: [0.6, 0.4],
        boost: 0.2, bounce: 0.06, bounceMax: 1, twoPacks: 1 },
      { permanent: 0.2, long: 0.3, ordinary: [18, 46], longSlot: [70, 150], warn: 3, hidden: [1.5, 3], spine: 1, pace: 3, airJump: false }),
    // The old course's challenge, made fair.
    level(2, "Amber Spires", "l2a", 0.47, { step: 11.4 }, {}),
    // Smaller clouds, wider turns and lanes, shorter lives and warnings, safe ground further apart.
    level(3, "Aurora Heights", "l3a", 0.42,
      { step: 12.2, main: [2.3, 0.8, 1.6, 0.6], side: [2.4, 0.6, 1.8, 0.4], turn: 50, sway: 8, lane: [6, 3], speed: [1, 0.7],
        boost: 0.18, bounce: 0.18 },
      { permanent: 0.04, long: 0.18, ordinary: [12, 32], longSlot: [50, 110], warn: 2, hidden: [2, 4], spine: 4, pace: 3.2 }),
    // The longest climb down: today's cloud sizes, wide turns, and safe ground as sparse as Level 3's.
    level(4, "Thunderhead", "l4b", 0.38,
      { step: 12.5, turn: 50, sway: 8, twoPacks: 1 },
      { permanent: 0.05, long: 0.2, ordinary: [12, 32], longSlot: [50, 110], warn: 2, hidden: [2, 4], spine: 4, pace: 3.4 })
  ]);
  BL.cloudHopperLevels = { LEVELS, BASE_ROUTE, GROWTH, get: id => LEVELS[id - 1] || null };
})();
