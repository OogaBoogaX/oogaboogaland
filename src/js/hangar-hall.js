// The Lightning Jet Hangar's hall as its pages and the Worker share it: the timings of what happens in the hall that the
// Worker's hangar object schedules for everyone in it (worker/src/games/hangar.js) and each page plays (the systems
// below read theirs from here, so the two never drift apart). Pure and loadable in Node and the Worker, which imports it:
// no DOM, no clock, no Math.random.
//
// The engine anomalies (`hangar-anomaly.js`): each kind's length, s; the wait from the end of one to the start of the
// next, s, at random between; how long after the static fire test hands its controls back before one may start, s; how
// often a lightning ends in the jump to a room (0 to 1) and when the bolt lands there, s from the lightning's start.
// The static fire test (`hangar-fire.js`), s from the press: the result, when the presser's controls come back, and
// ready again. A room's fire (`hangar-room-fire.js`), s from the bolt landing: done, its operator back at his post.
// The film show (`hangar-terminals.js`): how long from its stop (a press, or its film run out) until the screen has
// wound back up and it may start again, s, and the longest the hall lets one run, s. The network
// (`hangar-network.js`): its end, s, how long the hall stays quiet after (`quiet`), how much longer, s, at random
// between, the next anomaly waits past that, and each player's odds at a walk up to the shape (`first` at their first,
// second and later walk ups until it has played for them; `after`, once it has, the showing after it played never
// drawing). The shape (`hangar-shimmer.js`): the longest a showing lasts, its afterimage too, s.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};

  const ANOMALY = Object.freeze({
    length: Object.freeze({ misfire: 14, phantom: 13.6, lightning: 7.2, blackout: 10, lowrider: 10, shuffle: 11 }),
    gap: Object.freeze([60, 300]), afterFire: 10, jump: 0.35, lands: 5.9
  });
  const FIRE = Object.freeze({ result: 10.6, ready: 30.6 });
  const ROOM_FIRE = Object.freeze({ done: 12.6 });
  const FILM = Object.freeze({ wind: 9, most: 1800 });
  const NETWORK = Object.freeze({ end: 14.8, quiet: 15, defer: Object.freeze([10, 40]), first: Object.freeze([0.6, 0.85, 1]), after: 0.3 });
  const SHAPE = Object.freeze({ most: 40 });

  BL.hangarHall = Object.freeze({ ANOMALY, FIRE, ROOM_FIRE, FILM, NETWORK, SHAPE, KINDS: Object.freeze(Object.keys(ANOMALY.length)) });
})();
