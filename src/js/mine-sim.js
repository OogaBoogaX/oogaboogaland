// The mining operation as numbers on a fixed step. No DOM, no scene, no geometry: the scene is only
// ever a view of this, and the suite drives it in node with no browser at all.
//
// A run lasts the better part of an hour, so nothing here may grow with time. Every array is a typed
// array sized at creation, the log is a ring of objects written in place, events occupy one slot of a
// fixed table, and the step allocates nothing at all - no literals, no closures, no strings. What the
// player reads is ids and numbers; words are the HUD's job.
//
// Randomness is seeded rather than crypto: a run has to be reproducible for a check to mean anything,
// and nothing here is a fairness question between people. The die in the lab still uses randomInt.
//
// The step is a quarter second. Every unit sits in a spot with its model (`unit`, `dead`, `pad`,
// `power` typed arrays). The coin trades at the real price whenever the scene has one (`setLive`,
// `livePrice`; the price-moving events are skipped then) and otherwise on an island market in bull and
// bear turns, with a tick-by-tick wiggle round its trend and a fixed ring of the last 24 half-minute
// candles (`candleO`, `candleH`, `candleL`, `candleC`). Around it: the grid's moving price, a
// fixed-price contract, model launches at a premium that settle and push older models down, and the
// halving with its used-market flood.
//
// The network and a difficulty that retargets every nine blocks, with blocks coming at `blockRate` (the
// network over the difficulty) between them, so bought hash pays faster until the retarget catches up.
// The share of a block is hash over the whole network (`others + hash`) and `hashprice` carries no
// block-rate factor, so the retarget lag pays only through faster blocks. A real block off the feed pays
// the island's subsidy plus its fees, once; `setFees` takes the live mempool's fee multiplier.
//
// Each chamber's load runs against its circuit (over it for four seconds trips its breaker) and its heat
// against its cooling: the bare rock plus every fan standing in it (`cooler`, `placeCooler`,
// `sellCooler`, `fansIn`, `coolerCostFor`). A chamber starts with no fans, and a cooling failure stops a
// chamber's fans only if it has some. Over the line throttles, far over kills and burns. A fire eats
// along its rack's bays and after `FIRE_JUMP_AFTER` of them jumps to the nearest other rack in the
// chamber; nothing puts one out but someone reaching it. A Cold Pool's pump draws its `pumpKw` on the
// chamber's circuit. A meltdown comes as a warning first: a `melt` fault on a box on air for `MELT_WARN`
// seconds (pulled with `fixFault`, it only dies; left, `meltdown` counts a failure).
//
// Safety gear is bought with `buySafety(k, c)` from the `SAFETY` table. Fire Stoppers (`extinguishers`)
// hang on the wall until someone takes one down (`takeStopper`, `hangStopper`) and carries it to a fire,
// where `fixFault(f, 1)` spends it; `carrying` is the player's stopper in hand, part of the run. A Spare
// Breaker (`spares`) throws a trip back after its `delay` once the chamber's `demandKw`, what it would
// draw with the breaker in, fits the circuit, so a surge clears itself and an overload waits. A Smoke
// Alarm (`alarms`, `alarmOn`) sounds when the heat passes `warn` of the throttle line.
//
// Money: own generation, the grid billed on credit (past about three minutes of bill the cave is cut off
// and comes back by itself once paid; the credit limit is latched at the cut-off, `cutLimit`, and holds
// until the debt is paid), the battery through outages, and curtailment offers paid on `costRate`
// (`curtailPay`); the grid signs no contract during a spike. Expected income and power cost are smoothed
// for the profit bar. Also here: the event table, faults that are places, wear on pushed models, loans,
// crack rocks, trophies, digs, milestones, the three losses and the hour. A seized loan takes racks, then
// generators, then trophies.
//
// 21 coin banks the win (`won`, `goalAt`, the speed bonus from that time) and the hour plays on with the
// score counting; a win stays a win whatever ends the run. `carryOn` marks the run `continued` (no speed
// bonus and no medal), puts out every fire and melt, and for a seized loan sells racks and all in them at
// the used price until it is covered. `snapshot` and `restore` turn the run into plain data and back,
// and `save`, `load` and `clear` keep it under one localStorage key while a run is live, the dice
// included (`randState`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const R = BL.mineRigs;
  const { clamp } = BL.math;

  const FIXED = 0.25, MAX_SUBSTEPS = 8;
  const EVENT_CHECK = 10;           // seconds between rolls, as long as something is running
  const GOOD_CHANCE = 0.05, BAD_CHANCE = 0.08;
  const FAULT_MAX = 12;
  const LOG_MAX = 32;
  const MAX_FAILURES = 3;
  const HEAT_RISE = 0.08, HEAT_FALL = 0.12;
  const FIRE_STEP = 6;              // seconds a fire takes to eat the next unit in its rack
  const MARKET_STEP = 20;           // seconds between moves of the coin and power markets
  const FEE_BASE = 8000000;         // sats of fees in an ordinary block
  const CURTAIL = { offer: 20, seconds: 45, pay: 3 };
  const RATE_TAU = 20;              // seconds the income and cost readouts smooth over
  const CANDLES = 24, CANDLE_SECONDS = 30;  // the trader's chart: the last twelve minutes, a candle a half minute
  const SAMPLES = 36, SAMPLE_SECONDS = 10;  // the pool board's chart: the last six minutes of hash
  const NM = R.MODELS.length, NT = R.TROPHIES.length, NC = R.DIGS.length;
  const [STOPPER, SPARE, ALARM] = BL.mineRigs.SAFETY;
  const T_HOODIE = 0, T_TABLETS = 1, T_DEAL = 2, T_CREW = 3, T_STONE = 4, T_GLOW = 5, T_CHARM = 6, T_HUT = 7;
  // The trades behind the last four: the stone pays every STONE_EVERY blocks, the box holds GLOW_STORE more
  // and draws GLOW_KW to keep it, the charm pays CHARM_PAY back on a bad event (more the deeper the cave),
  // the hut multiplies a clean win by HUT_BONUS.
  const STONE_EVERY = 3, GLOW_STORE = 12000, GLOW_KW = 2, CHARM_PAY = [8000, 40000], HUT_BONUS = 1.2;
  const RESTART_STAKE = 20000;      // what a continued run is topped up to
  const STORAGE_KEY = "oogaboogaland.mine", SAVE_VERSION = 2;
  const MILESTONES = ["asic10", "asic25", "asic50", "asic100", "hall", "bigcave", "block", "empire", "halving"];

  // Flags an event sets and clears, one function per event applied with `on` true and again with `on`
  // false, so a recovery is the same code path and cannot drift. Two leave a job behind on purpose: a
  // surge trips every breaker and a cooling failure stops a fan, and both stay until someone fixes them.
  const EVENTS = [
    { id: "cheap", good: true, seconds: 40, set: (s, on) => { s.cheap = on; } },
    { id: "surplus", good: true, seconds: 4, set: (s, on) => { if (on) s.battery = s.batteryMax; } },
    { id: "windfall", good: true, seconds: 4, set: (s, on) => { if (on) s.bananas += 5000 + s.dug * 60000; } },
    { id: "gift", good: true, seconds: 4, set: (s, on) => { if (on) gift(s); } },
    { id: "poolboost", good: true, seconds: 40, set: (s, on) => { s.poolBonus = on; } },
    { id: "boom", good: true, seconds: 60, set: (s, on) => { s.boom = on; } },
    { id: "curtail", good: true, seconds: 4, set: (s, on) => { if (on && s.kw > 0) s.curtailOffer = s.time + CURTAIL.offer; } },
    { id: "feestorm", good: true, seconds: 60, set: (s, on) => { s.feeStorm = on; } },
    { id: "surge", good: false, seconds: 4, set: (s, on) => { if (on) surge(s); } },
    { id: "spike", good: false, seconds: 30, set: (s, on) => { s.spike = on; } },
    { id: "outage", good: false, seconds: 30, set: (s, on) => { s.gridDown = on; } },
    { id: "shortage", good: false, seconds: 40, set: (s, on) => { s.shortage = on; } },
    { id: "rug", good: false, seconds: 40, set: (s, on) => { s.rug = on; } },
    { id: "coolingfail", good: false, seconds: 4, set: (s, on) => { if (on) coolingFail(s); } },
    { id: "crash", good: false, seconds: 60, set: (s, on) => { s.crash = on; } },
    { id: "burn", good: false, seconds: 4, set: (s, on) => { if (on) killUnit(s, -1, -1, true); } },
    { id: "fire", good: false, seconds: 4, set: (s, on) => { if (on) startFire(s, -1); } },
    { id: "meltdown", good: false, seconds: 20, set: (s, on) => { if (on) meltWarn(s); } }
  ];

  // mulberry32 over a state the run carries, so a saved run resumes on the same dice.
  const nextRand = (s) => {
    s.randState = s.randState + 0x6D2B79F5 | 0;
    let t = Math.imul(s.randState ^ s.randState >>> 15, 1 | s.randState);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // Log entries are reused: the ring never grows and never allocates after creation.
  const makeLog = () => {
    const entries = new Array(LOG_MAX);
    for (let i = 0; i < LOG_MAX; i++) entries[i] = { kind: "", a: 0, b: 0, at: 0, used: false };
    return entries;
  };
  const note = (s, kind, a, b) => {
    const e = s.log[s.logAt];
    e.kind = kind;
    e.a = a;
    e.b = b;
    e.at = s.time;
    e.used = true;
    s.logAt = (s.logAt + 1) % LOG_MAX;
    s.logVersion++;
  };

  // Faults are the places someone has to go: a chamber's breaker, a chamber's cooling plant, a burning
  // unit. `unit` is the chamber for the first two. A dead unit is not a fault slot of its own - it is
  // marked in `dead` where it stands, so a hundred of them cannot overflow anything.
  const fault = (s, kind, unit) => {
    for (let i = 0; i < FAULT_MAX; i++) {
      const f = s.faults[i];
      if (f.active && f.kind === kind && f.unit === unit) return f;
    }
    for (let i = 0; i < FAULT_MAX; i++) {
      const f = s.faults[i];
      if (f.active) continue;
      f.active = true;
      f.kind = kind;
      f.unit = unit;
      f.at = s.time;
      f.spread = 0;
      f.eaten = 0;
      s.faultCount++;
      s.faultVersion++;
      note(s, kind, unit, 0);
      return f;
    }
    return null;
  };
  const clearFault = (s, f) => {
    if (!f.active) return;
    f.active = false;
    f.kind = "";
    f.unit = -1;
    s.faultCount--;
    s.faultVersion++;
  };
  const clearAt = (s, kind, unit) => {
    for (let i = 0; i < FAULT_MAX; i++) {
      const f = s.faults[i];
      if (f.active && f.unit === unit && (!kind || f.kind === kind)) clearFault(s, f);
    }
  };

  const inTank = (s, u) => {
    const p = R.padOfUnit(u);
    return p >= 0 && s.pad[p] === 2;
  };

  // A random live unit, walked from a random start so nothing is filtered into a new list. `model` and
  // `chamber` -1 mean any; `airOnly` skips units under oil, which never burn.
  const pickUnit = (s, model, chamber, airOnly) => {
    const start = Math.floor(s.rand() * R.UNITS);
    for (let n = 0; n < R.UNITS; n++) {
      const u = (start + n) % R.UNITS;
      if (!s.unit[u] || s.dead[u]) continue;
      if (model >= 0 && s.unit[u] - 1 !== model) continue;
      if (chamber >= 0 && R.chamberOfUnit(u) !== chamber) continue;
      if (airOnly && inTank(s, u)) continue;
      return u;
    }
    return -1;
  };
  const killUnit = (s, model, chamber, airOnly) => {
    const u = pickUnit(s, model, chamber, airOnly);
    if (u < 0) return -1;
    s.dead[u] = 1;
    s.broken[s.unit[u] - 1]++;
    s.layoutVersion++;
    note(s, "dead", u, 0);
    return u;
  };

  // A unit gone for good: burned or sold. Its fault and its dead mark go with it.
  const dropUnit = (s, u) => {
    const m = s.unit[u] - 1;
    if (m < 0) return;
    if (s.dead[u]) {
      s.dead[u] = 0;
      s.broken[m]--;
    }
    s.unit[u] = 0;
    s.owned[m]--;
    clearAt(s, "fire", u);
    s.layoutVersion++;
  };

  // Whether a unit of model m may stand in spot u: the right kind of spot, empty, and for a bay, inside
  // a holder with that many bays in a chamber that has been dug.
  const canHold = (s, m, u) => {
    if (u < 0 || u >= R.UNITS || s.unit[u] || R.spotOfUnit(u) !== R.MODELS[m].spot) return false;
    if (u < R.UNIT_BAY) return true;
    const p = R.padOfUnit(u), holder = s.pad[p];
    return holder > 0 && R.bayOfUnit(u) < R.HOLDERS[holder - 1].bays && R.chamberOfPad(p) <= s.dug;
  };
  const firstFree = (s, m) => {
    for (let u = 0; u < R.UNITS; u++) if (canHold(s, m, u)) return u;
    return -1;
  };

  // The newest model on the market: a gift is always worth having.
  const newest = (s) => {
    let best = R.FIRST_ASIC;
    for (let m = R.FIRST_ASIC; m < NM; m++) if (s.launched[m]) best = m;
    return best;
  };
  const gift = (s) => {
    const m = newest(s), u = firstFree(s, m);
    if (u < 0) {
      s.bananas += Math.floor(R.MODELS[m].cost * s.market[m]);
      note(s, "gift", -1, m);
      return;
    }
    s.unit[u] = m + 1;
    s.owned[m]++;
    s.layoutVersion++;
    note(s, "gift", u, m);
  };

  // A surge trips every dug chamber's breaker at once; each has to be thrown back by hand.
  const surge = (s) => {
    for (let c = 0; c <= s.dug; c++) {
      s.tripped[c] = 1;
      fault(s, "breaker", c);
    }
    s.layoutVersion++;
  };
  // The fans in the chamber with the most heat in it stop, and stay stopped until fixed; a chamber
  // with no fans has nothing to stop.
  const coolingFail = (s) => {
    let c = -1;
    for (let i = 0; i <= s.dug; i++) {
      let fans = false;
      for (let k = i * R.COOL_SPOTS; k < (i + 1) * R.COOL_SPOTS; k++) fans ||= s.cooler[k] > 0;
      if (fans && (c < 0 || s.heatLoad[i] > s.heatLoad[c])) c = i;
    }
    if (c < 0) return;
    s.fanDown[c] = 1;
    fault(s, "cooling", c);
  };
  // A fire starts in a live unit on air, in `chamber` if given, and eats its way along the bays.
  const startFire = (s, chamber) => {
    const u = pickUnit(s, -1, chamber, true);
    if (u >= 0) fault(s, "fire", u);
    return u;
  };
  // The one event that can end a run, as a warning first: a box on air glows for MELT_WARN seconds. Pulled
  // in time (`fixFault`) it only dies; left, it melts down and counts a failure. Tanks never melt.
  const meltWarn = (s) => {
    const u = pickUnit(s, -1, -1, true);
    if (u < 0) {
      if (pickUnit(s, -1, -1, false) >= 0) note(s, "nearmiss", 0, 0);
      return;
    }
    fault(s, "melt", u);
  };
  const meltdown = (s, u) => {
    s.failures++;
    s.dead[u] = 1;
    s.broken[s.unit[u] - 1]++;
    s.layoutVersion++;
    note(s, "meltdown", u, s.failures);
  };

  const create = ({ seed = 1 } = {}) => {
    const s = {
      time: 0, acc: 0, paused: false, over: false, won: false, reason: "", score: 0,
      bananas: R.GRUBSTAKE, sats: 0, minedSats: 0, spent: 0, sold: 0, billed: 0,
      // The markets: the coin's price, the grid's price, and each model's price against its list price.
      // `rate` only scales what is shown: fixed by the first live coin price the run sees, so that price
      // reads as the real one and a banana as about a dollar, while the economy keeps its own numbers.
      // `livePrice` is the real coin price in the run's own bananas, set by the scene from the chain feed; while
      // it is there the coin is the real one and nothing here moves it. Offline it stays 0 and the
      // island runs its own market.
      rate: 1, rateLocked: false, livePrice: 0, liveFees: 0, priceMul: 1, regime: 1, regimeT: 360, price: R.COIN, tick: 0, powerMul: 1, powerPrice: R.POWER_PRICE, marketT: 0,
      // The coin's recent candles, a fixed ring: open, high, low and close of each half minute.
      candleO: new Float64Array(CANDLES), candleH: new Float64Array(CANDLES), candleL: new Float64Array(CANDLES), candleC: new Float64Array(CANDLES),
      candleAt: 0, candleCount: 1, candleT: 0, candleVersion: 0,
      // Your hash and the difficulty, sampled into a fixed ring for the pool board; the newest slot is live.
      hashHist: new Float64Array(SAMPLES), diffHist: new Float64Array(SAMPLES), histAt: 0, histCount: 1, histT: 0, histVersion: 0,
      contractPrice: 0, contractUntil: 0,
      market: new Float64Array(NM), launched: new Uint8Array(NM),
      // The network: everyone else, and the difficulty they set at the last retarget. Between retargets
      // blocks come at `blockRate` times the nominal pace: more hash than the difficulty was set for
      // finds them faster, until the next retarget catches up.
      others: R.NET_START, difficulty: R.NET_START, blockRate: 1, epochBlocks: 0, epochs: 0, lastRetarget: 0, halved: false,
      // The cave: what stands where.
      unit: new Uint8Array(R.UNITS), dead: new Uint8Array(R.UNITS),
      pad: new Uint8Array(R.PADS), power: new Uint8Array(R.POWER_SPOTS), dug: 0,
      owned: new Int32Array(NM), broken: new Int32Array(NM), lost: new Int32Array(NM), off: new Uint8Array(NM), push: new Uint8Array(NM), cutMask: new Uint8Array(NM),
      holders: new Int32Array(R.HOLDERS.length), generators: new Int32Array(R.POWER.length), trophy: new Uint8Array(NT),
      // Each chamber's circuit and cooling.
      busbar: new Uint8Array(NC), cooler: new Uint8Array(NC * R.COOL_SPOTS), extinguishers: new Uint8Array(NC), spares: new Uint8Array(NC), alarms: new Uint8Array(NC),
      // What each chamber would draw with its breaker in (`chamberKw` is what it draws now), how long a
      // spare breaker has waited, and whether the smoke alarm is sounding.
      demandKw: new Float64Array(NC), spareT: new Float64Array(NC), alarmOn: new Uint8Array(NC), tripped: new Uint8Array(NC), fanDown: new Uint8Array(NC),
      overloadT: new Float32Array(NC), chamberKw: new Float32Array(NC), heatLoad: new Float32Array(NC), heat: new Float32Array(NC), throttle: new Float32Array(NC),
      // Power: the grid, own generation and the backup battery (kilowatt-seconds).
      gridDown: false, blackout: false, cutOff: false, cutLimit: 0, battery: R.BATTERY.base, batteryMax: R.BATTERY.base, genKw: 0, gridKw: 0,
      curtailOffer: 0, curtailUntil: 0,
      // Events and their flags.
      pool: true, rug: false, poolBonus: false, cheap: false, spike: false, shortage: false, boom: false, crash: false, feeStorm: false,
      loan: 0, loanDue: 0, loanStage: 0, loansRepaid: 0, loansTaken: 0, poolHold: 0, poolHeld: 0,
      crackUsed: 0, crackReset: 0,
      failures: 0, distress: 0, blocks: 0, blockCount: 0, realBlocks: 0, realHits: 0, continued: 0, goalAt: 0, carrying: 0,
      blockT: 0, eventT: 0, event: -1, eventUntil: 0, wearT: 0,
      faults: new Array(FAULT_MAX), faultCount: 0, faultVersion: 0,
      log: makeLog(), logAt: 0, logVersion: 0, layoutVersion: 0,
      milestones: 0, milestone: -1, milestoneVersion: 0, peakHash: 0,
      // Written every step.
      live: new Int32Array(NM), units: 0, hash: 0, kw: 0, share: 0, hashprice: 0,
      income: 0, cost: 0, incomeRate: 0, costRate: 0, luck: 1, randState: seed >>> 0, rand: null, sun: 1
    };
    for (let i = 0; i < FAULT_MAX; i++) s.faults[i] = { active: false, kind: "", unit: -1, at: 0, spread: 0, eaten: 0 };
    s.rand = () => nextRand(s);
    for (let m = 0; m < NM; m++) {
      s.market[m] = 1;
      s.launched[m] = R.MODELS[m].from <= 0 ? 1 : 0;
    }
    for (let c = 0; c < NC; c++) s.throttle[c] = 1;
    s.candleO[0] = s.candleH[0] = s.candleL[0] = s.candleC[0] = R.COIN;
    // The box you found: one CPU on the bench, switched on.
    s.unit[R.UNIT_BENCH] = R.CPU + 1;
    s.owned[R.CPU] = 1;

    const circuitOf = (c) => R.DIGS[c].circuit * Math.pow(2, s.busbar[c]);
    // The bare rock's share of the chamber's cooling scale, and each fan standing on its spots.
    const fansIn = (c) => {
      let n = 0;
      for (let k = c * R.COOL_SPOTS; k < (c + 1) * R.COOL_SPOTS; k++) if (s.cooler[k]) n++;
      return n;
    };
    const coolingOf = (c) => {
      let share = R.COOL_PASSIVE;
      for (let k = c * R.COOL_SPOTS; k < (c + 1) * R.COOL_SPOTS; k++) if (s.cooler[k]) share += R.COOLERS[s.cooler[k] - 1].share;
      return R.DIGS[c].cool * share * (s.fanDown[c] ? 0.3 : 1);
    };
    const coolerCostFor = (t, c) => Math.ceil(R.COOLERS[t].cost[c] * (s.shortage ? 1.5 : 1));
    const creditLimit = () => Math.max(20000, s.costRate * 180);
    const gridPrice = () => (s.contractUntil > s.time ? s.contractPrice : s.powerPrice) * (s.trophy[T_DEAL] ? 0.9 : 1);
    // Hashprice is per second of real time, so the pace blocks actually come at is in it: buying hash
    // speeds the blocks up until the retarget, which is the few good minutes a big purchase buys.
    const costFor = (m) => Math.ceil(R.MODELS[m].cost * Math.pow(R.MODELS[m].growth, s.owned[m]) * s.market[m] * (s.shortage ? 1.5 : 1));
    const resaleOf = (u) => Math.floor(R.MODELS[s.unit[u] - 1].cost * s.market[s.unit[u] - 1] * (s.dead[u] ? 0.15 : R.RESALE));
    const holderCostFor = (h) => Math.ceil(R.HOLDERS[h].cost * Math.pow(R.HOLDERS[h].growth, s.holders[h]) * (s.shortage ? 1.5 : 1));
    const powerCostFor = (i) => Math.ceil(R.POWER[i].cost * Math.pow(1.2, s.generators[i]) * (s.shortage ? 1.5 : 1));
    const pushCost = (m) => Math.ceil(R.MODELS[m].cost * R.PUSH.cost * Math.max(1, s.owned[m]));
    const repairCost = (u) => Math.ceil(R.MODELS[s.unit[u] - 1].cost * s.market[s.unit[u] - 1] * R.REPAIR);
    // The next busbar for chamber c, or 0 when it has them all.
    const chamberCost = (c) => s.busbar[c] >= R.BUSBAR.levels ? 0 : R.BUSBAR.cost[s.busbar[c]];
    const loanOffer = () => {
      let value = 0;
      for (let m = 0; m < NM; m++) value += s.owned[m] * R.MODELS[m].cost * s.market[m];
      return clamp(Math.floor(value * R.LOAN.share / 1000) * 1000, R.LOAN.min, R.LOAN.max);
    };
    // Bananas a TH a second at today's difficulty, reward and price: the number the whole game turns on.
    // Fees: the island's base, four times it in a storm, or the live mempool's own pressure.
    const feeMult = () => s.feeStorm ? 4 : s.liveFees > 1 ? s.liveFees : 1;
    // Per TH per second: the block's value over the blocks a second the difficulty allows. The share of an
    // actual block is hash over the whole network, and blocks come faster than nominal while the network
    // outruns the difficulty, so the two cancel to this.
    const hashpriceNow = () => (R.subsidyAt(s.time) + FEE_BASE * feeMult()) / 1e8 * s.price / R.BLOCK_SECONDS / Math.max(1, s.difficulty) * (s.pool ? 1 - R.POOL_FEE : 1);

    const reach = (bit) => {
      if (s.milestones & (1 << bit)) return;
      s.milestones |= 1 << bit;
      s.milestone = bit;
      s.milestoneVersion++;
      note(s, "milestone", bit, 0);
    };
    const checkMilestones = () => {
      let asics = 0, full = 0;
      for (let m = R.FIRST_ASIC; m < NM; m++) asics += s.owned[m];
      if (asics >= 10) reach(0);
      if (asics >= 25) reach(1);
      if (asics >= 50) reach(2);
      if (asics >= 100) reach(3);
      if (s.dug >= 1) reach(4);
      if (s.dug >= 2) reach(5);
      for (let p = 0; p < R.PADS; p++) if (s.pad[p]) full++;
      if (full === R.PADS) reach(7);
    };

    // `feesOnly` is a real block off the live feed: its fees are on offer, never a second subsidy.
    const payout = (fees, luck, feesOnly) => {
      const share = s.share, value = (feesOnly ? 0 : R.subsidyAt(s.time)) + fees;
      if (s.pool) {
        if (s.rug) {
          note(s, "rugged", 0, 0);
          return 0;
        }
        const won = Math.floor(value * share * (1 - (s.trophy[T_STONE] ? 0 : R.POOL_FEE)) * (s.poolBonus ? 2 : 1));
        // The Cold Stone: no cut, but the pool holds the share and pays every third block.
        if (s.trophy[T_STONE]) {
          s.poolHold += won;
          s.poolHeld++;
          if (s.poolHeld < STONE_EVERY) return 0;
          const held = s.poolHold;
          s.poolHold = 0;
          s.poolHeld = 0;
          s.sats += held;
          s.minedSats += held;
          note(s, "paid", held, Math.round(share * 10000));
          return held;
        }
        s.sats += won;
        s.minedSats += won;
        note(s, "paid", won, Math.round(share * 10000));
        return won;
      }
      if (s.rand() < Math.min(R.SOLO_MAX, share * luck * s.luck)) {
        s.sats += value;
        s.minedSats += value;
        s.blocks++;
        reach(6);
        note(s, "block", value, Math.round(share * 10000));
        return value;
      }
      note(s, "missed", 0, Math.round(share * 10000));
      return 0;
    };

    // The Sky Hut pays on a clean win only: no loan ever taken, never carried on after a loss.
    const finalScore = (seconds, won) => {
      const score = R.scoreOf(s.minedSats, seconds, won);
      return won && s.trophy[T_HUT] && !s.continued && !s.loansTaken ? Math.floor(score * HUT_BONUS) : score;
    };
    const endRun = (won, reason) => {
      if (s.over) return;
      s.over = true;
      // A win already banked stays a win whatever ends the run after it.
      s.won = won || s.won;
      s.reason = reason;
      // A run that came back from a loss keeps what it mined but earns no speed bonus.
      s.score = finalScore(s.won ? s.goalAt : s.time, s.won && !s.continued);
      note(s, s.won ? "ended" : "lost", Math.floor(s.minedSats / 1e6), s.score);
    };

    const applyEvent = (index, on) => {
      const e = EVENTS[index];
      e.set(s, on);
      if (!on) return;
      note(s, "event", index, 0);
      // The Shaman's Charm: a bad event pays something back, more the deeper the cave.
      if (!e.good && s.trophy[T_CHARM]) {
        const paid = CHARM_PAY[0] + CHARM_PAY[1] * s.dug;
        s.bananas += paid;
        note(s, "insured", paid, 0);
      }
    };
    const rollEvent = () => {
      if (s.event >= 0 || s.units <= 0) return;
      const roll = s.rand();
      const good = roll < GOOD_CHANCE, bad = !good && roll < GOOD_CHANCE + BAD_CHANCE;
      if (!good && !bad) return;
      const start = Math.floor(s.rand() * EVENTS.length);
      for (let k = 0; k < EVENTS.length; k++) {
        const i = (start + k) % EVENTS.length;
        if (EVENTS[i].good !== good) continue;
        // Nothing in here moves the real coin.
        if (s.livePrice > 0 && (EVENTS[i].id === "boom" || EVENTS[i].id === "crash")) continue;
        s.event = i;
        // The charm's other edge: the good ones are over twice as fast.
        s.eventUntil = s.time + EVENTS[i].seconds * (good && s.trophy[T_CHARM] ? 0.5 : 1);
        applyEvent(i, true);
        return;
      }
    };

    // The markets move every twenty seconds. The coin walks with a trend that turns every few minutes,
    // bull and bear; the grid's price wanders round its average. Models launch on their minute, arrive
    // dear, settle, and push the older ones down.
    const stepMarkets = (dt) => {
      s.regimeT -= dt;
      if (s.livePrice > 0) {
        // The real coin: its trend is where it stands against the oldest candle on the chart.
        s.price = Math.round(s.livePrice);
        s.regime = s.price >= s.candleO[(s.candleAt - s.candleCount + 1 + CANDLES) % CANDLES] ? 1 : -1;
      } else if (s.regimeT <= 0) {
        // Markets have tended to run up after a halving; before it, a coin toss with a lean.
        s.regime = s.rand() < (s.halved ? 0.7 : 0.55) ? 1 : -1;
        s.regimeT = 300 + s.rand() * 300;
        note(s, "regime", s.regime, 0);
      }
      s.marketT += dt;
      if (s.marketT >= MARKET_STEP) {
        s.marketT -= MARKET_STEP;
        s.priceMul = clamp(s.priceMul * (1 + s.regime * 0.02 + (s.rand() - 0.5) * 0.05), 0.5, 2.2);
        s.powerMul = clamp(s.powerMul + (1 - s.powerMul) * 0.2 + (s.rand() - 0.5) * 0.18, 0.6, 1.6);
      }
      // Between market moves the price wiggles round its trend, tick by tick, pulled back to it, so a
      // candle has a body and wicks and the moment you sell matters.
      s.tick = clamp(s.tick + (s.rand() - 0.5) * 0.008 - s.tick * 0.04, -0.05, 0.05);
      if (!(s.livePrice > 0)) s.price = Math.round(R.COIN * s.priceMul * (1 + s.tick) * (s.boom ? 1.4 : 1) * (s.crash ? 0.65 : 1));
      const at = s.candleAt;
      if (s.price > s.candleH[at]) s.candleH[at] = s.price;
      if (s.price < s.candleL[at]) s.candleL[at] = s.price;
      s.candleC[at] = s.price;
      s.candleT += dt;
      if (s.candleT >= CANDLE_SECONDS) {
        s.candleT -= CANDLE_SECONDS;
        const next = (at + 1) % CANDLES;
        s.candleO[next] = s.candleH[next] = s.candleL[next] = s.candleC[next] = s.price;
        s.candleAt = next;
        if (s.candleCount < CANDLES) s.candleCount++;
      }
      s.candleVersion++;
      s.powerPrice = Math.round(R.POWER_PRICE * s.powerMul * (s.spike ? 4 : 1) * (s.cheap ? 0.5 : 1));
      for (let m = 0; m < NM; m++) {
        if (!s.launched[m] && R.MODELS[m].from <= s.time) {
          s.launched[m] = 1;
          s.market[m] = R.LAUNCH_PREMIUM;
          for (let o = R.FIRST_ASIC; o < m; o++) s.market[o] *= R.OLDER_DROP;
          s.layoutVersion++;
          note(s, "launch", m, 0);
        } else if (s.launched[m] && s.market[m] > 1 && m >= R.FIRST_ASIC && R.MODELS[m].from > 0) {
          s.market[m] = Math.max(1, s.market[m] - (R.LAUNCH_PREMIUM - 1) * dt / R.LAUNCH_SETTLE);
        }
      }
    };

    // Every unit, every step: what is running, where, and what it pulls. 300 spots at four steps a
    // second is nothing, and it is the only way a chamber's heat and circuit can be its own.
    const stepUnits = () => {
      for (let m = 0; m < NM; m++) s.live[m] = 0;
      for (let c = 0; c < NC; c++) {
        s.chamberKw[c] = 0;
        s.demandKw[c] = 0;
        s.heatLoad[c] = 0;
      }
      const curtailed = s.curtailUntil > s.time, bonus = s.trophy[T_TABLETS] ? 1.05 : 1, hotter = s.trophy[T_TABLETS] ? 1.25 : 1;
      let hash = 0, kw = 0, units = 0;
      for (let u = 0; u < R.UNITS; u++) {
        const m = s.unit[u] - 1;
        if (m < 0 || s.dead[u] || s.off[m] || curtailed || s.blackout || s.cutOff) continue;
        const c = R.chamberOfUnit(u);
        const model = R.MODELS[m], pushed = s.push[m] === 1, oil = inTank(s, u);
        const w = model.kw * (pushed ? 1 + R.PUSH.kw : 1);
        s.demandKw[c] += w;
        if (s.tripped[c]) continue;
        hash += model.th * (pushed ? 1 + R.PUSH.th : 1) * (oil ? 1.1 : 1) * bonus * s.throttle[c];
        kw += w;
        s.chamberKw[c] += w;
        if (!oil) s.heatLoad[c] += w * (pushed ? R.PUSH.heat : 1) * hotter;
        s.live[m]++;
        units++;
      }
      // A Cold Pool's pump runs whenever the chamber has power, on its circuit and on the bill.
      if (!curtailed && !s.blackout && !s.cutOff) for (let p = 0; p < R.PADS; p++) {
        if (s.pad[p] !== 2) continue;
        const c = R.chamberOfPad(p);
        if (c > s.dug) continue;
        const w = R.HOLDERS[1].pumpKw;
        s.demandKw[c] += w;
        if (s.tripped[c]) continue;
        kw += w;
        s.chamberKw[c] += w;
      }
      s.hash = hash;
      s.kw = kw;
      s.units = units;
      if (hash > s.peakHash) s.peakHash = hash;
    };

    // Each chamber: a circuit held over its limit trips its breaker; heat rides toward load over
    // cooling and slows the machines above the throttle line.
    const stepChambers = (dt) => {
      for (let c = 0; c <= s.dug; c++) {
        if (!s.tripped[c] && s.chamberKw[c] > circuitOf(c)) {
          s.overloadT[c] += dt;
          if (s.overloadT[c] >= R.OVERLOAD_SECONDS) {
            s.tripped[c] = 1;
            s.overloadT[c] = 0;
            fault(s, "breaker", c);
            s.layoutVersion++;
            note(s, "overload", c, 0);
          }
        } else s.overloadT[c] = 0;
        // A spare breaker throws a trip back once what the chamber would draw fits the circuit.
        if (s.tripped[c] && s.spares[c] > 0 && s.demandKw[c] <= circuitOf(c)) {
          s.spareT[c] += dt;
          if (s.spareT[c] >= SPARE.delay) {
            s.spares[c]--;
            s.spareT[c] = 0;
            s.tripped[c] = 0;
            clearAt(s, "breaker", c);
            s.layoutVersion++;
            note(s, "autoreset", c, 0);
          }
        } else s.spareT[c] = 0;
        const target = clamp(s.heatLoad[c] / coolingOf(c), 0, 1.6);
        s.heat[c] += (target - s.heat[c]) * (target > s.heat[c] ? HEAT_RISE : HEAT_FALL) * dt;
        s.throttle[c] = s.heat[c] <= R.HEAT_THROTTLE ? 1 : clamp(1 - (s.heat[c] - R.HEAT_THROTTLE) / (1 - R.HEAT_THROTTLE) * 0.75, 0.25, 1);
        // The smoke alarm sounds as the heat nears the throttle line, and falls quiet a little below it.
        const warn = R.HEAT_THROTTLE * ALARM.warn;
        if (!s.alarms[c]) s.alarmOn[c] = 0;
        else if (!s.alarmOn[c] && s.heat[c] >= warn) {
          s.alarmOn[c] = 1;
          note(s, "smoke", c, Math.round(s.heat[c] * 100));
        } else if (s.alarmOn[c] && s.heat[c] < warn - 0.08) s.alarmOn[c] = 0;
      }
    };

    // Power: own generation first, the grid for the rest at its price, the battery when the grid is
    // down. An empty battery in an outage, or a bill that cannot be paid, switches everything off.
    const stepPower = (dt) => {
      let gen = 0;
      for (let i = 0; i < R.POWER_SPOTS; i++) {
        const t = s.power[i];
        if (!t || R.chamberOfPower(i) > s.dug) continue;
        const src = R.POWER[t - 1];
        gen += src.kw * (src.solar ? s.sun : 1);
      }
      s.genKw = gen;
      s.batteryMax = R.BATTERY.base + s.generators[3] * R.POWER[3].store + (s.trophy[T_GLOW] ? GLOW_STORE : 0);
      // The Glow Box drinks a little all the time it has a charge to hold.
      const draw = s.kw + (s.trophy[T_GLOW] && s.battery > 0 ? GLOW_KW : 0);
      const need = Math.max(0, draw - gen), spare = Math.max(0, gen - draw);
      let grid = 0;
      if (s.gridDown) {
        s.battery = Math.max(0, s.battery - need * dt + spare * dt);
        if (s.battery <= 0 && need > 0 && !s.blackout) {
          s.blackout = true;
          for (let m = 0; m < NM; m++) s.off[m] = 1;
          s.layoutVersion++;
          note(s, "blackout", 0, 0);
        }
      } else {
        grid = need;
        // The battery tops itself up from spare generation, and from the grid at the grid's price.
        if (s.battery < s.batteryMax) {
          const charge = Math.min(s.batteryMax - s.battery, s.batteryMax * R.BATTERY.recharge / 60 * dt + spare * dt);
          s.battery += charge;
          grid += Math.max(0, charge - spare * dt) / dt;
        }
        s.blackout = false;
      }
      s.gridKw = grid;
      const bill = grid * gridPrice() / 3600 * dt;
      s.bananas -= bill;
      s.billed += bill;
      s.cost = grid * gridPrice() / 3600;
      // The grid bills on credit: a cave can run into the red for about three minutes of its bill, and
      // buys nothing while it does. Past that the power company cuts it off, and it comes back on by
      // itself, as it was, the moment the debt is paid: sell coin or a machine, crack the rock, take a loan.
      // The limit is latched at the cut-off: a shrinking bill after everything is off must not shrink the debt.
      if (s.cutOff ? s.bananas < -s.cutLimit : s.bananas < -creditLimit()) {
        if (!s.cutOff && s.kw > 0) {
          s.cutOff = true;
          s.cutLimit = creditLimit();
          for (let m = 0; m < NM; m++) {
            s.cutMask[m] = s.off[m] ? 0 : 1;
            s.off[m] = 1;
          }
          s.layoutVersion++;
          note(s, "cutoff", 0, 0);
        }
      }
      if (s.cutOff && s.bananas < -s.cutLimit) s.bananas = -s.cutLimit;
      if (s.cutOff && s.bananas >= 0) {
        s.cutOff = false;
        s.cutLimit = 0;
        for (let m = 0; m < NM; m++) if (s.cutMask[m]) s.off[m] = 0;
        s.layoutVersion++;
        note(s, "restored", 0, 0);
      }
    };

    // The chain: a block every twenty seconds, a retarget every nine, the halving at half an hour.
    const stepChain = (dt) => {
      s.others += (R.othersTarget(s.time, s.hash, s.halved) - s.others) * Math.min(1, R.NET_CATCHUP * dt);
      if (!s.halved && s.time >= R.HALVING_AT) {
        s.halved = true;
        // The halving shakes the old models loose: the used market floods.
        for (let m = R.FIRST_ASIC; m < NM; m++) if (R.MODELS[m].from < R.HALVING_AT) s.market[m] *= 0.7;
        reach(8);
        note(s, "halving", 0, 0);
      }
      s.share = Math.min(R.SHARE_MAX, s.hash / Math.max(1, s.others + s.hash));
      s.blockRate = (s.others + s.hash) / Math.max(1, s.difficulty);
      s.luck = s.trophy[T_HOODIE] ? 1.1 : 1;
      s.hashHist[s.histAt] = s.hash;
      s.diffHist[s.histAt] = s.difficulty;
      s.histT += dt;
      if (s.histT >= SAMPLE_SECONDS) {
        s.histT -= SAMPLE_SECONDS;
        s.histAt = (s.histAt + 1) % SAMPLES;
        if (s.histCount < SAMPLES) s.histCount++;
      }
      s.histVersion++;
      s.hashprice = hashpriceNow();
      s.income = s.hash * s.hashprice;
      s.blockT += dt * s.blockRate;
      if (s.blockT >= R.BLOCK_SECONDS) {
        s.blockT -= R.BLOCK_SECONDS;
        s.blockCount++;
        if (s.units > 0) payout(FEE_BASE * feeMult(), 1);
        s.epochBlocks++;
        if (s.epochBlocks >= R.EPOCH_BLOCKS) {
          s.epochBlocks = 0;
          s.epochs++;
          const before = s.difficulty;
          s.difficulty = s.others + s.hash;
          s.lastRetarget = Math.round((s.difficulty / before - 1) * 1000);
          note(s, "retarget", s.lastRetarget, Math.round(s.difficulty - before));
        }
      }
      // Smoothed readouts for the profit bar: expected income and the power bill, a second each.
      const k = Math.min(1, dt / RATE_TAU);
      s.incomeRate += (s.income - s.incomeRate) * k;
      s.costRate += (s.cost - s.costRate) * k;
    };

    // The nearest other rack in the same chamber with something on air to burn, and not already
    // burning: where a fire that has taken hold jumps to. Pads are laid out in rows, so index distance
    // is distance across the floor.
    const burningPad = (p) => {
      for (let i = 0; i < FAULT_MAX; i++) {
        const f = s.faults[i];
        if (f.active && f.kind === "fire" && R.padOfUnit(f.unit) === p) return true;
      }
      return false;
    };
    const jumpTarget = (p) => {
      const c = R.chamberOfPad(p);
      for (let d = 1; d < R.PADS; d++) for (const q of [p - d, p + d]) {
        if (q < 0 || q >= R.PADS || R.chamberOfPad(q) !== c || s.pad[q] !== 1 || burningPad(q)) continue;
        const base = R.UNIT_BAY + q * R.BAYS;
        for (let b = 0; b < R.BAYS; b++) if (s.unit[base + b] && !s.dead[base + b]) return base + b;
      }
      return -1;
    };
    // Fires eat along their bays and, once they have taken hold, jump to the next rack; pushed models
    // wear; a chamber running hot kills units and starts fires. Nothing puts a fire out but someone
    // getting to it: a Fire Stopper in hand, or bare hands and time.
    const stepFaults = (dt) => {
      for (let i = 0; i < FAULT_MAX; i++) {
        const f = s.faults[i];
        if (!f.active) continue;
        if (f.kind === "melt") {
          f.spread += dt;
          if (f.spread >= R.MELT_WARN) {
            const u = f.unit;
            clearFault(s, f);
            if (s.unit[u] && !s.dead[u]) meltdown(s, u);
          }
          continue;
        }
        if (f.kind !== "fire") continue;
        f.spread += dt;
        if (f.spread < FIRE_STEP) continue;
        f.spread -= FIRE_STEP;
        f.eaten++;
        if (f.eaten > 3) s.failures++;
        if (f.eaten >= R.FIRE_JUMP_AFTER && f.unit >= R.UNIT_BAY && s.rand() < R.FIRE_JUMP) {
          const to = jumpTarget(R.padOfUnit(f.unit));
          if (to >= 0) {
            fault(s, "fire", to);
            note(s, "jumped", f.unit, to);
          }
        }
        const from = f.unit, groupStart = from < R.UNIT_SHELF ? R.UNIT_BENCH : from < R.UNIT_BAY ? R.UNIT_SHELF : R.UNIT_BAY + R.padOfUnit(from) * R.BAYS;
        const groupSize = from < R.UNIT_SHELF ? R.BENCH : from < R.UNIT_BAY ? R.SHELF : R.BAYS;
        let next = -1;
        for (let n = 1; n < groupSize; n++) {
          const u = groupStart + (from - groupStart + n) % groupSize;
          if (s.unit[u] && !inTank(s, u)) {
            next = u;
            break;
          }
        }
        const m = s.unit[from] - 1;
        note(s, "burned", from, f.eaten);
        dropUnit(s, from);
        if (m >= 0) s.lost[m]++;
        if (next < 0) continue;
        f.active = true;
        f.kind = "fire";
        f.unit = next;
        s.faultCount++;
        s.faultVersion++;
      }
      s.wearT += dt;
      if (s.wearT < R.WEAR_SECONDS) return;
      s.wearT -= R.WEAR_SECONDS;
      for (let m = 0; m < NM; m++) {
        if (s.push[m] && s.live[m] > 0 && s.rand() < R.PUSH.wear) {
          const u = killUnit(s, m, -1, true);
          if (u >= 0) note(s, "worn", u, 0);
        }
      }
      for (let c = 0; c <= s.dug; c++) {
        if (s.heat[c] <= 1) continue;
        if (s.rand() < 0.35) killUnit(s, -1, c, true);
        if (s.heat[c] > 1.25 && s.rand() < 0.25) startFire(s, c);
      }
    };

    const hasAssets = () => {
      for (let m = 0; m < NM; m++) if (s.owned[m] > 0) return true;
      for (let h = 0; h < R.HOLDERS.length; h++) if (s.holders[h] > 0) return true;
      for (let i = 0; i < R.POWER.length; i++) if (s.generators[i] > 0) return true;
      for (let k = 0; k < s.cooler.length; k++) if (s.cooler[k]) return true;
      for (let i = 0; i < NT; i++) if (s.trophy[i]) return true;
      return false;
    };

    const step = (dt) => {
      s.time += dt;
      if (s.crackReset > 0 && s.time >= s.crackReset) {
        s.crackReset = 0;
        s.crackUsed = 0;
      }
      stepMarkets(dt);
      stepUnits();
      stepChambers(dt);
      stepPower(dt);
      stepChain(dt);

      if (s.bananas < 1 && s.cutOff && s.sats < 1000 && s.crackUsed >= R.CRACK.cap && !hasAssets()) {
        s.distress += dt;
        if (s.distress >= R.BANKRUPT_SECONDS) endRun(false, "broke");
      } else s.distress = 0;

      s.eventT += dt;
      if (s.eventT >= EVENT_CHECK) {
        s.eventT -= EVENT_CHECK;
        rollEvent();
      }
      if (s.event >= 0 && s.time >= s.eventUntil) {
        applyEvent(s.event, false);
        s.event = -1;
      }
      if (s.curtailUntil > 0 && s.time >= s.curtailUntil) {
        s.curtailUntil = 0;
        s.layoutVersion++;
        note(s, "curtailed", 0, 0);
      }

      stepFaults(dt);

      if (s.loan > 0 && s.time >= s.loanDue) {
        if (s.loanStage >= R.LOAN.extensions.length) endRun(false, "seized");
        else {
          const [rise, seconds] = R.LOAN.extensions[s.loanStage];
          s.loanStage++;
          s.loan = Math.ceil(s.loan * (1 + rise));
          s.loanDue = s.time + seconds;
          note(s, "extension", s.loanStage, s.loan);
        }
      }

      if (s.failures >= MAX_FAILURES) endRun(false, "wrecked");
      // 21 coin banks the win and its speed bonus; the hour plays on, and the score keeps counting.
      if (!s.won && s.minedSats >= R.GOAL_SATS) {
        s.won = true;
        s.goalAt = s.time;
        s.score = finalScore(s.goalAt, !s.continued);
        note(s, "won", Math.floor(s.minedSats / 1e6), s.score);
      }
      if (s.time >= R.RUN_SECONDS) endRun(s.won, s.won ? "goal" : "time");
    };

    const spend = (cost) => {
      if (s.over || s.bananas < cost || cost < 0) return false;
      s.bananas -= cost;
      s.spent += cost;
      return true;
    };

    const sim = {
      state: s,
      tick(dt) {
        if (s.paused || s.over) return 0;
        s.acc = Math.min(s.acc + dt, FIXED * MAX_SUBSTEPS);
        let steps = 0;
        while (s.acc >= FIXED) {
          s.acc -= FIXED;
          step(FIXED);
          steps++;
          if (s.over) break;
        }
        return steps;
      },
      // The suite and the debug handle drive time without frames.
      simulate(seconds) {
        let left = seconds;
        while (left > 0 && !s.over) {
          const dt = Math.min(FIXED, left);
          left -= dt;
          step(dt);
        }
      },
      creditLimit, costFor, resaleOf, holderCostFor, powerCostFor, pushCost, repairCost, chamberCost, coolerCostFor, fansIn, loanOffer, circuitOf, coolingOf, gridPrice,
      canHold: (m, u) => canHold(s, m, u), firstFree: (m) => firstFree(s, m),
      digCost: () => s.dug + 1 < R.DIGS.length ? R.DIGS[s.dug + 1].cost : 0,
      // What one machine of a model makes a minute right now, after its power, at today's grid price.
      profitOf: (m) => R.profitPerMinute(R.MODELS[m], s.hashprice || hashpriceNow(), gridPrice()),
      // A unit into a spot; `u` -1 takes the next free spot for that model.
      place(m, u = -1) {
        const at = u < 0 ? firstFree(s, m) : u;
        if (!s.launched[m] || !canHold(s, m, at) || !spend(costFor(m))) return -1;
        s.unit[at] = m + 1;
        s.owned[m]++;
        s.layoutVersion++;
        note(s, "bought", at, m);
        checkMilestones();
        return at;
      },
      sell(u) {
        if (s.over || u < 0 || u >= R.UNITS || !s.unit[u]) return 0;
        const back = resaleOf(u);
        dropUnit(s, u);
        s.bananas += back;
        note(s, "sold-unit", u, back);
        return back;
      },
      // Selling every unit of a model at once: what a miner does when a model stops paying.
      sellModel(m) {
        let back = 0;
        for (let u = 0; u < R.UNITS; u++) if (s.unit[u] === m + 1) back += this.sell(u);
        return back;
      },
      canPad: (p) => p >= 0 && p < R.PADS && !s.pad[p] && R.chamberOfPad(p) <= s.dug,
      placeHolder(h, p = -1) {
        let at = p;
        if (at < 0) for (let i = 0; i < R.PADS && at < 0; i++) if (this.canPad(i)) at = i;
        if (!this.canPad(at) || !spend(holderCostFor(h))) return -1;
        s.pad[at] = h + 1;
        s.holders[h]++;
        s.layoutVersion++;
        note(s, "holder", at, h);
        checkMilestones();
        return at;
      },
      // A rack sells with everything in it, so a pad is never left holding orphaned units.
      sellHolder(p) {
        if (s.over || p < 0 || p >= R.PADS || !s.pad[p]) return 0;
        let back = 0;
        const base = R.UNIT_BAY + p * R.BAYS;
        for (let b = 0; b < R.BAYS; b++) if (s.unit[base + b]) back += this.sell(base + b);
        const h = s.pad[p] - 1;
        s.holders[h]--;
        const own = Math.floor(R.HOLDERS[h].cost * R.RESALE);
        s.pad[p] = 0;
        s.bananas += own;
        s.layoutVersion++;
        return back + own;
      },
      canPower: (i) => i >= 0 && i < R.POWER_SPOTS && !s.power[i] && R.chamberOfPower(i) <= s.dug,
      placePower(t, i = -1) {
        let at = i;
        if (at < 0) for (let n = 0; n < R.POWER_SPOTS && at < 0; n++) if (this.canPower(n)) at = n;
        if (!this.canPower(at) || !spend(powerCostFor(t))) return -1;
        s.power[at] = t + 1;
        s.generators[t]++;
        s.layoutVersion++;
        note(s, "power", at, t);
        return at;
      },
      sellPower(i) {
        if (s.over || i < 0 || i >= R.POWER_SPOTS || !s.power[i]) return 0;
        const t = s.power[i] - 1;
        s.generators[t]--;
        const back = Math.floor(R.POWER[t].cost * R.RESALE);
        s.power[i] = 0;
        s.bananas += back;
        s.layoutVersion++;
        return back;
      },
      dig() {
        if (s.dug + 1 >= R.DIGS.length || !spend(R.DIGS[s.dug + 1].cost)) return false;
        s.dug++;
        s.layoutVersion++;
        note(s, "dug", s.dug, 0);
        checkMilestones();
        return true;
      },
      upgradeChamber(c) {
        const cost = chamberCost(c);
        if (c > s.dug || !cost || !spend(cost)) return false;
        s.busbar[c]++;
        s.layoutVersion++;
        note(s, "busbar", c, s.busbar[c]);
        return true;
      },
      canCool(k) {
        return k >= 0 && k < s.cooler.length && !s.cooler[k] && R.chamberOfCool(k) <= s.dug;
      },
      // A fan of type t onto spot k, or the first free spot when k is -1.
      placeCooler(t, k = -1) {
        let at = k;
        if (at < 0) for (let n = 0; n < s.cooler.length && at < 0; n++) if (this.canCool(n)) at = n;
        if (!R.COOLERS[t] || !this.canCool(at) || !spend(coolerCostFor(t, R.chamberOfCool(at)))) return -1;
        s.cooler[at] = t + 1;
        s.layoutVersion++;
        note(s, "cooler", at, t);
        return at;
      },
      sellCooler(k) {
        if (s.over || k < 0 || k >= s.cooler.length || !s.cooler[k]) return 0;
        const c = R.chamberOfCool(k), back = Math.floor(R.COOLERS[s.cooler[k] - 1].cost[c] * R.RESALE);
        s.cooler[k] = 0;
        // The last fan out takes a stopped fan's fault with it.
        if (!fansIn(c) && s.fanDown[c]) {
          s.fanDown[c] = 0;
          clearAt(s, "cooling", c);
        }
        s.bananas += back;
        s.layoutVersion++;
        return back;
      },
      // A Fire Stopper off chamber c's wall into someone's hands, and back onto its hook.
      // `who` 0 is the player, whose stopper in hand is part of the run (`carrying`) and survives a reload.
      takeStopper(c, who = -1) {
        if (s.over || c < 0 || c > s.dug || s.extinguishers[c] <= 0) return false;
        s.extinguishers[c]--;
        if (who === 0) s.carrying = 1;
        s.layoutVersion++;
        return true;
      },
      hangStopper(c, who = -1) {
        if (s.over || c < 0 || c > s.dug || s.extinguishers[c] >= STOPPER.per) return false;
        s.extinguishers[c]++;
        if (who === 0) s.carrying = 0;
        s.layoutVersion++;
        return true;
      },
      setCarrying(on) {
        s.carrying = on ? 1 : 0;
      },
      // One piece of safety gear `k` (see R.SAFETY) hung in chamber `c`.
      buySafety(k, c) {
        const gear = R.SAFETY[k], held = gear && s[gear.field];
        if (!held || c < 0 || c > s.dug || held[c] >= gear.per || !spend(gear.cost)) return false;
        held[c]++;
        s.layoutVersion++;
        note(s, gear.id, c, held[c]);
        return true;
      },
      // Crystals: panic power straight into the battery.
      buyPack() {
        if (!spend(R.BATTERY.packCost)) return false;
        s.battery = Math.min(s.batteryMax + R.BATTERY.pack, s.battery + R.BATTERY.pack);
        note(s, "pack", R.BATTERY.pack, 0);
        return true;
      },
      // A fixed-price contract: ten minutes at today's average price plus a tenth, whatever the market does.
      // The Power Deal is the grid's own discount, and the grid will not fix a price for anyone on it; nor
      // will it fix one in the middle of a spike.
      canContract: () => !s.trophy[T_DEAL] && !s.spike && s.contractUntil <= s.time,
      signContract() {
        const fee = Math.ceil(R.POWER_PRICE * 2);
        if (s.trophy[T_DEAL] || s.spike || s.contractUntil > s.time || !spend(fee)) return false;
        s.contractPrice = Math.round(R.POWER_PRICE * s.powerMul * 1.1);
        s.contractUntil = s.time + 600;
        note(s, "contract", s.contractPrice, 0);
        return true;
      },
      contractFee: () => Math.ceil(R.POWER_PRICE * 2),
      // Curtailment: the grid pays three times the going rate for the load you drop, if you drop it all.
      // It pays on the bill as it has run these last seconds, not on what was switched on for the offer.
      curtailPay: () => Math.floor(s.costRate * CURTAIL.seconds * CURTAIL.pay),
      acceptCurtail() {
        if (s.over || s.curtailOffer <= s.time || s.kw <= 0) return 0;
        const paid = this.curtailPay();
        s.bananas += paid;
        s.curtailOffer = 0;
        s.curtailUntil = s.time + CURTAIL.seconds;
        s.layoutVersion++;
        note(s, "curtail", paid, 0);
        return paid;
      },
      sellSats(portion = 1) {
        if (s.over || s.sats <= 0) return 0;
        const amount = Math.floor(s.sats * clamp(portion, 0, 1));
        if (amount <= 0) return 0;
        const got = R.bananasForSats(amount, s.price);
        s.sats -= amount;
        s.bananas += got;
        s.sold += amount;
        note(s, "sold", got, amount);
        return got;
      },
      setPool(on) {
        if (s.over) return;
        s.pool = !!on;
        note(s, "mode", s.pool ? 1 : 0, 0);
      },
      // A model switches on only with power to run it; a blackout or a cut-off leaves every model off.
      setOn(m, on) {
        if (s.over || !!s.off[m] === !on) return false;
        if (on && ((s.gridDown && s.battery <= 0) || s.cutOff)) return false;
        s.off[m] = on ? 0 : 1;
        s.layoutVersion++;
        return true;
      },
      allOn() {
        let n = 0;
        for (let m = 0; m < NM; m++) if (s.owned[m] > 0 && this.setOn(m, true)) n++;
        return n;
      },
      setPush(m, on) {
        if (s.over || !!s.push[m] === !!on) return false;
        if (on && !spend(pushCost(m))) return false;
        s.push[m] = on ? 1 : 0;
        s.layoutVersion++;
        return true;
      },
      repair(u) {
        if (s.over || u < 0 || u >= R.UNITS || !s.dead[u] || !spend(repairCost(u))) return false;
        s.dead[u] = 0;
        s.broken[s.unit[u] - 1]--;
        s.layoutVersion++;
        note(s, "repaired", u, 0);
        return true;
      },
      // Every dead machine of a model, as many as can be paid for.
      repairModel(m) {
        let n = 0;
        for (let u = 0; u < R.UNITS; u++) if (s.unit[u] === m + 1 && s.dead[u] && this.repair(u)) n++;
        return n;
      },
      buyTrophy(i) {
        if (s.trophy[i] || !spend(R.TROPHIES[i].cost)) return false;
        s.trophy[i] = 1;
        s.layoutVersion++;
        note(s, "trophy", i, 0);
        return true;
      },
      sellTrophy(i) {
        if (s.over || !s.trophy[i]) return 0;
        s.trophy[i] = 0;
        // Selling the stone hands over whatever the pool was holding.
        if (i === T_STONE && s.poolHold > 0) {
          s.sats += s.poolHold;
          s.minedSats += s.poolHold;
          note(s, "paid", s.poolHold, Math.round(s.share * 10000));
          s.poolHold = 0;
          s.poolHeld = 0;
        }
        const back = Math.floor(R.TROPHIES[i].cost * R.TROPHY_RESALE);
        s.bananas += back;
        s.layoutVersion++;
        return back;
      },
      crack() {
        if (s.over || s.crackUsed >= R.CRACK.cap) return 0;
        s.crackUsed++;
        s.bananas += R.CRACK.bananas;
        if (s.crackUsed >= R.CRACK.cap) s.crackReset = s.time + R.CRACK.rest;
        return R.CRACK.bananas;
      },
      takeLoan() {
        if (s.over || s.loan > 0) return 0;
        const amount = loanOffer();
        s.loan = Math.ceil(amount * (1 + R.LOAN.interest));
        s.loanDue = s.time + R.LOAN.seconds;
        s.loanStage = 0;
        s.loansTaken++;
        s.bananas += amount;
        note(s, "loan", amount, s.loan);
        return amount;
      },
      repayLoan() {
        if (s.loan <= 0 || s.bananas < s.loan) return false;
        s.bananas -= s.loan;
        note(s, "repaid", s.loan, 0);
        s.loan = 0;
        s.loanDue = 0;
        s.loanStage = 0;
        s.loansRepaid++;
        return true;
      },
      // The scene hands faults back when someone reaches them: a breaker thrown back, a fan fixed, a
      // fire put out (`how` 1 with a Fire Stopper, 0 by hand). A breaker thrown on a circuit still over
      // its limit will trip again.
      fixFault(f, how = 0) {
        if (!f || !f.active) return false;
        if (f.kind === "breaker") {
          s.tripped[f.unit] = 0;
          s.overloadT[f.unit] = 0;
          s.layoutVersion++;
        } else if (f.kind === "cooling") s.fanDown[f.unit] = 0;
        else if (f.kind === "melt") {
          // Pulled in time: the box is dead, repairable, and nothing else is lost.
          const u = f.unit;
          if (s.unit[u] && !s.dead[u]) {
            s.dead[u] = 1;
            s.broken[s.unit[u] - 1]++;
          }
          s.layoutVersion++;
        }
        note(s, f.kind === "fire" ? "doused" : f.kind === "melt" ? "pulled" : "fixed", f.unit, how);
        clearFault(s, f);
        return true;
      },
      // A real block off the island's live feed: the pool takes a share of its fees too, and solo gets
      // one extra roll at a friendlier share, which is the whole reason to watch the chain.
      onRealBlock(fees) {
        if (s.over || s.units <= 0) return 0;
        s.realBlocks++;
        const won = payout(Math.max(0, Math.floor(fees) || 0), 1.5, false);
        if (won > 0 && !s.pool) s.realHits++;
        note(s, "realblock", won, s.realBlocks);
        return won;
      },
      // The real coin price, already in the run's own bananas (see `livePrice`).
      setLive(price) {
        s.livePrice = price > 0 ? price : 0;
      },
      // The live mempool's fee pressure as a multiplier on the island's base fees; 0 hands it back to the island.
      setFees(mult) {
        s.liveFees = mult > 1 ? Math.min(4, mult) : 0;
      },
      setSun(v) {
        s.sun = clamp(v, 0, 1);
      },
      pause(on) {
        s.paused = !!on;
      },
      end(reason) {
        endRun(false, reason || "left");
      },
      // After a loss the run can go on, marked: it keeps what it mined but earns no speed bonus and no
      // medal. A seized cave is repossessed first, racks and all that stands in them sold at the used
      // price until the loan is covered; then the debts are cleared, the bananas topped up to a restart
      // stake and every model switched back on.
      carryOn() {
        // Only a loss can be carried on from: a run that ran its hour, was won, or was walked out on is over.
        if (!s.over || s.won || s.reason === "time" || s.reason === "left") return false;
        const seized = s.reason === "seized";
        s.over = false;
        s.reason = "";
        s.continued++;
        // Whatever was burning or melting goes out with the loss; a fresh start does not start on fire.
        for (let i = 0; i < FAULT_MAX; i++) if (s.faults[i].active && (s.faults[i].kind === "fire" || s.faults[i].kind === "melt")) clearFault(s, s.faults[i]);
        if (seized) {
          // Racks and all in them first, then the generators, then the trophies, until the loan is covered.
          let taken = 0;
          for (let p = 0; p < R.PADS && s.bananas < s.loan; p++) if (s.pad[p]) {
            this.sellHolder(p);
            taken++;
          }
          for (let i = 0; i < R.POWER_SPOTS && s.bananas < s.loan; i++) if (s.power[i]) {
            this.sellPower(i);
            taken++;
          }
          for (let i = 0; i < NT && s.bananas < s.loan; i++) if (s.trophy[i]) {
            this.sellTrophy(i);
            taken++;
          }
          s.bananas = Math.max(0, s.bananas - s.loan);
          note(s, "repossessed", taken, s.loan);
        }
        s.failures = 0;
        s.distress = 0;
        s.loan = 0;
        s.loanDue = 0;
        s.loanStage = 0;
        s.cutOff = false;
        s.bananas = Math.max(s.bananas, RESTART_STAKE);
        if (s.event >= 0) {
          applyEvent(s.event, false);
          s.event = -1;
        }
        for (let m = 0; m < NM; m++) s.off[m] = 0;
        s.layoutVersion++;
        note(s, "continued", 0, 0);
        return true;
      },
      // The run as plain data: typed arrays as arrays, the fault and log rings as their fields, and the
      // dice as their state; `rand` itself is left out and rebuilt by `restore`.
      snapshot() {
        const out = {};
        for (const key of Object.keys(s)) {
          const v = s[key];
          if (key === "rand") continue;
          if (ArrayBuffer.isView(v)) out[key] = Array.from(v);
          else if (Array.isArray(v)) out[key] = v.map((e) => ({ ...e }));
          else out[key] = v;
        }
        return out;
      },
      // Fills the run from a snapshot, field by field, taking only what has the shape the run already
      // has: a stored run from another version is dropped rather than half applied.
      restore(data) {
        if (!data || typeof data !== "object") return false;
        for (const key of Object.keys(s)) {
          if (key === "rand" || !(key in data)) continue;
          const v = data[key], cur = s[key];
          if (ArrayBuffer.isView(cur)) {
            if (!Array.isArray(v) || v.length !== cur.length || !v.every(Number.isFinite)) return false;
          } else if (Array.isArray(cur)) {
            if (!Array.isArray(v) || v.length !== cur.length || !v.every((e) => e && typeof e === "object")) return false;
          } else if (typeof v !== typeof cur || (typeof v === "number" && !Number.isFinite(v))) return false;
        }
        for (const key of Object.keys(s)) {
          if (key === "rand" || !(key in data)) continue;
          const v = data[key], cur = s[key];
          if (ArrayBuffer.isView(cur)) cur.set(v);
          else if (Array.isArray(cur)) for (let i = 0; i < cur.length; i++) Object.assign(cur[i], v[i]);
          else s[key] = v;
        }
        s.acc = 0;
        return true;
      },
      dispose() {
        for (let i = 0; i < FAULT_MAX; i++) clearFault(s, s.faults[i]);
      }
    };
    return sim;
  };

  // The saved run: one key in localStorage, written by the scene while a run is live and read back
  // when the cave is next entered, so a reload or a closed tab costs nothing. `lead` is the Ooga who
  // was running it. A save from another version, or one that does not restore whole, is thrown away.
  const save = (sim, lead) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SAVE_VERSION, lead: typeof lead === "string" ? lead : "", at: Date.now(), state: sim.snapshot() }));
      return true;
    } catch {
      return false;
    }
  };
  const load = () => {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== SAVE_VERSION || !parsed.state) return null;
      const sim = create();
      if (!sim.restore(parsed.state) || sim.state.over) return null;
      return { sim, lead: typeof parsed.lead === "string" ? parsed.lead : "" };
    } catch {
      return null;
    }
  };
  const clear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
    }
  };

  BL.mineSim = { create, save, load, clear, STORAGE_KEY, EVENTS, MILESTONES, FIXED, FAULT_MAX, LOG_MAX, MAX_FAILURES, EVENT_CHECK, FIRE_STEP, FEE_BASE, CURTAIL, CANDLES, CANDLE_SECONDS, SAMPLES, SAMPLE_SECONDS, RESTART_STAKE, T_HOODIE, T_TABLETS, T_DEAL, T_CREW, T_STONE, T_GLOW, T_CHARM, T_HUT, STONE_EVERY, GLOW_STORE, GLOW_KW, HUT_BONUS };
})();
