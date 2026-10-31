// The score contract, shared by the page and its Worker. Machine IDs are permanent: a moved cabinet keeps its ID.
// Only completed player games belong here; the jackpot wheel pays tickets but has no high-score record.
// Cloud Hopper keeps one attributed board per level (`cloudHopperLevels`' `board`). Its single board from before the
// levels is `retired`: its records still read, and keep following renames and deletions, but never take a new score.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const games = {
    "cloud-hopper": { scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000, machines: ["cloud-hopper-1"], retired: true },
    "cloud-hopper-l1": { scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000, machines: ["cloud-hopper-l1"] },
    "cloud-hopper-l2": { scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000, machines: ["cloud-hopper-l2"] },
    "cloud-hopper-l3": { scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000, machines: ["cloud-hopper-l3"] },
    "cloud-hopper-l4": { scoreType: "ooga", direction: "asc", unit: "milliseconds", max: 3600000, machines: ["cloud-hopper-l4"] },
    race: { direction: "asc", unit: "milliseconds", max: 3599999, machines: [
      "race-1-bay-lap", "race-1-bay-race", "race-1-bay-m-lap", "race-1-bay-m-race",
      "race-1-gorge-lap", "race-1-gorge-race", "race-1-gorge-m-lap", "race-1-gorge-m-race",
      "race-1-peak-lap", "race-1-peak-race", "race-1-peak-m-lap", "race-1-peak-m-race"
    ] },
    drop: { max: 999999, machines: ["drop-1"] },
    orbit: { max: 999999, machines: ["orbit-1"] },
    mine: { max: 9999999, machines: ["mine-1"] },
    skee: { max: 1800, machines: ["skee-1", "skee-2"] },
    hoops: { max: 9999, machines: ["hoops-1", "hoops-2"] },
    shy: { max: 999, machines: ["shy-1"] },
    claw: { max: 400, machines: ["claw-1", "claw-2", "claw-3"] },
    hockey: { max: 200, machines: ["hockey-1", "hockey-2", "hockey-3"] },
    billiards: { max: 200, machines: ["billiards-1", "billiards-2"] },
    darts: { max: 540, machines: ["darts-1", "darts-2"] },
    pinball: { max: 9999999, machines: ["pinball-1", "pinball-2"] },
    ride: { max: 9999, machines: ["ride-1", "ride-2", "ride-3", "ride-4"] },
    invaders: { max: 50000, machines: ["invaders-1"] },
    snake: { max: 120000, machines: ["snake-1"] },
    pong: { max: 99999, machines: ["pong-1"] },
    stampede: { max: 75000, machines: ["stampede-1"] },
    flap: { max: 20000, machines: ["flap-1"] },
    breaker: { max: 50000, machines: ["breaker-1"] },
    dash: { max: 99999, machines: ["dash-1"] },
    stacker: { max: 999999, machines: ["stacker-1"] }
  };
  for (const game of Object.values(games)) {
    game.scoreType ||= "machine";
    game.direction ||= "desc";
    game.unit ||= "points";
    game.version = 1;
    Object.freeze(game.machines);
    Object.freeze(game);
  }
  Object.freeze(games);
  const get = id => Object.hasOwn(games, id) ? games[id] : null;
  const valid = (id, machine, score) => {
    const game = get(id);
    return !!game && !game.retired && game.machines.includes(machine) && Number.isSafeInteger(score) && score > 0 && score <= game.max;
  };
  BL.highscoreRules = { games, get, valid, MAX_PLAYERS: 1024 };
})();
