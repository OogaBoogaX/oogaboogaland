// The mining catalog and its arithmetic. Pure numbers: no DOM, no scene, no state of its own, so the
// whole economy can be proved in node before a rack is ever drawn.
//
// What this teaches is margin, because margin is what real mining is. A block is worth the subsidy
// times the coin's price; your slice of it is your hash over the difficulty; and against that you pay
// for every kilowatt your machines pull. Difficulty climbs, the halving cuts the reward in half, power
// spikes, and a machine that paid for itself at the start of the run is losing money by the end of it.
// The player's real job is to keep the fleet on the right side of that line.
//
// Hash is in TH, power in kW, money in bananas. The island's own rate (400 sats a banana) sets the coin
// at 250,000 bananas, the scale every price here is tuned against. What the player sees is scaled by the
// run's rate (the live coin price over COIN), so the coin opens at the real price and a banana reads as
// about a dollar.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  const SUBSIDY = 312500000;        // 3.125 BTC a block, the real subsidy, until the halving
  const HALVING_AT = 1800;          // half an hour in, the reward halves, as it does every four years
  const BLOCK_SECONDS = 20;         // the island's own chain, faster than the real one so a run has a pulse
  const EPOCH_BLOCKS = 9;           // difficulty adjusts every nine blocks, three minutes, like a tiny 2016
  const POOL_FEE = 0.02;
  const GOAL_SATS = 2100000000;     // 21 BTC
  const RUN_SECONDS = 3600;
  const COIN = 250000;              // bananas a whole coin at the island's parity
  const GRUBSTAKE = 5000;
  const NET_START = 8000;           // TH the rest of the network brings on day one
  const NET_GROWTH = 0.1;           // the rest of the network grows this much an epoch on its own
  const NET_FOLLOW = 3;             // and this many TH for every TH you run: others copy what pays
  const NET_CATCHUP = 0.004;        // a second; the network closes on its target in a few minutes
  const SHARE_MAX = 0.6;
  const SOLO_MAX = 0.25;            // a solo roll never gets better odds than this: variance is the price of the whole block
  const POWER_PRICE = 30000;        // bananas a kWh on the grid, before the market moves it
  const HEAT_THROTTLE = 0.7;        // a chamber's heat at which its machines start to slow
  const REPAIR = 0.3;               // a dead unit costs this share of its price to bring back
  const RESALE = 0.6;               // what a working used unit fetches against today's price

  // The machines. CPUs and GPUs are honest about being a start; ASICs are the business, and each
  // model does more hash for the same power than the last. Newer models reach the market as the run
  // goes on, arrive dear and get cheaper, and push the older ones down with them.
  const MODELS = [
    { id: "cpu", name: "Pebble Box", real: "CPU", spot: "bench", th: 0.02, kw: 0.12, cost: 300, from: 0, growth: 1.3,
      note: "The box you found. It paid for the lamp oil, once." },
    { id: "gpu", name: "Shiny Rocks", real: "GPU rig", spot: "shelf", th: 1, kw: 0.35, cost: 1200, from: 0, growth: 1.15,
      note: "Six shiny rocks on a plank. A good start, and nothing more." },
    { id: "tb1", name: "Thunder Box", real: "ASIC", spot: "bay", th: 14, kw: 1.4, cost: 8000, from: 0, growth: 1.01,
      note: "Built for one job. Cheap now, and a space heater by the halving." },
    { id: "tb2", name: "Thunder Box II", real: "ASIC", spot: "bay", th: 50, kw: 2.5, cost: 45000, from: 420, growth: 1.01,
      note: "Twice the hash a kilowatt of the first one." },
    { id: "storm", name: "Storm Box", real: "ASIC", spot: "bay", th: 100, kw: 3.2, cost: 90000, from: 1080, growth: 1.01,
      note: "The one everyone wants before the halving." },
    { id: "sky", name: "Sky Splitter", real: "ASIC", spot: "bay", th: 200, kw: 3.5, cost: 170000, from: 1800, growth: 1.01,
      note: "Launched the day the reward halved. The only thing that pays on bad power." },
    { id: "deep", name: "Deep Storm", real: "ASIC", spot: "bay", th: 400, kw: 5.5, cost: 330000, from: 2520, growth: 1.01,
      note: "Runs best in a Cold Pool. The last word in hash a watt." }
  ];
  const CPU = 0, GPU = 1, FIRST_ASIC = 2;
  const LAUNCH_PREMIUM = 1.4, LAUNCH_SETTLE = 300, OLDER_DROP = 0.72;

  // Floor pieces. A rack holds eight ASICs on air and puts their heat in the room; a tank holds
  // twelve under cold oil, takes their heat away and lets them run harder.
  const HOLDERS = [
    { id: "rack", name: "Rack", real: "server rack", cost: 2500, growth: 1.08, bays: 8, oil: false,
      note: "A steel frame with eight bays. Every box in it heats the room." },
    { id: "tank", name: "Cold Pool", real: "immersion tank", cost: 90000, growth: 1.12, bays: 12, oil: true, pumpKw: 2,
      note: "Twelve bays sunk in cold oil. No heat in the room, ten percent more hash, never burns. The pump draws 2 kW on the circuit." }
  ];

  // Generation you build is power you do not buy. It stands in the power nooks; the sun one answers
  // the island's clock, down the shaft over the Den.
  const POWER = [
    { id: "wheel", name: "Water Wheel", real: "hydro", cost: 250000, kw: 25, solar: false, note: "Turns day and night. Never much." },
    { id: "array", name: "Sun Leaves", real: "solar", cost: 420000, kw: 70, solar: true, note: "Nothing at night, plenty at noon." },
    { id: "steam", name: "Steam Vent", real: "geothermal", cost: 1600000, kw: 260, solar: false, note: "The island's own heat. Dear to tap, then it just runs." },
    { id: "bank", name: "Crystal Bank", real: "battery", cost: 120000, kw: 0, store: 40000, solar: false, note: "Stores power for when the grid goes down." }
  ];
  // The backup battery, in kilowatt-seconds: a little comes with the cave, banks add more, crystals
  // fill it in a hurry, and the grid tops it up slowly while it is running.
  const BATTERY = { base: 6000, recharge: 0.15, pack: 6000, packCost: 4000 };

  // The cave, one chamber at a time. Each has its own power circuit (kW) and its own cooling scale
  // (`cool`, kW of heat): the circuit is upgraded with busbars, the cooling is fans bought onto the
  // chamber's fan spots, and both are why where you put a rack matters.
  const DIGS = [
    { name: "Den", cost: 0, pads: 4, power: 2, circuit: 40, cool: 25 },
    { name: "Rack Hall", cost: 150000, pads: 8, power: 3, circuit: 200, cool: 120 },
    { name: "Big Cave", cost: 900000, pads: 14, power: 4, circuit: 700, cool: 450 }
  ];
  // Upgrades per chamber: each busbar doubles the circuit.
  const BUSBAR = { levels: 3, cost: [40000, 250000, 1200000] };
  // Cooling is bought a fan at a time onto a chamber's COOL_SPOTS, and a chamber starts with none: the
  // bare rock carries away `COOL_PASSIVE` of its `cool`, each fan `share` of it more, at the price for
  // that chamber. The Box Fan is the one a new operation can afford; four Fan Walls are the most a
  // chamber can hold.
  const COOL_SPOTS = 4, COOL_PASSIVE = 0.25;
  const COOLERS = [
    { id: "boxfan", name: "Box Fan", real: "floor fan", share: 0.35, cost: [1200, 6000, 24000] },
    { id: "fanwall", name: "Fan Wall", real: "cooling wall", share: 1, cost: [15000, 70000, 260000] }
  ];
  // Safety gear, hung per chamber (`per` at most), each kept in the sim array named by `field`:
  // - a Fire Stopper hangs on the wall until someone takes it to a fire: in hand it puts one out at
  //   once, and is spent. Bare hands smother a fire in `SMOTHER_SECONDS` of standing beside it;
  // - a Spare Breaker throws a tripped breaker back after `delay` seconds once the load fits the
  //   circuit again, so a surge clears itself but an overload waits for the player, and is spent;
  // - a Smoke Alarm warns when the chamber's heat passes `warn` of the throttle line, every time.
  const SAFETY = [
    { id: "stopper", field: "extinguishers", name: "Fire Stopper", real: "extinguisher", cost: 6000, per: 2 },
    { id: "spare", field: "spares", name: "Spare Breaker", real: "auto reset", cost: 5000, per: 1, delay: 2 },
    { id: "alarm", field: "alarms", name: "Smoke Alarm", real: "heat warning", cost: 2500, per: 1, warn: 0.85 }
  ];
  const OVERLOAD_SECONDS = 4;       // a circuit held past its limit this long trips its breaker
  const SMOTHER_SECONDS = 5;        // beating a fire out by hand, while it keeps eating
  const MELT_WARN = 10;             // seconds a box glows before it melts down; pull it in time and it only dies
  const FIRE_JUMP_AFTER = 2;        // bays a fire has eaten before it can jump to the next rack
  const FIRE_JUMP = 0.5;            // and the chance it does, each bay after that

  const PUSH = { th: 0.2, kw: 0.25, heat: 1.4, wear: 0.12, cost: 0.3 };
  const WEAR_SECONDS = 30;

  const BENCH = 4, SHELF = 8, BAYS = 12;
  const PADS = DIGS.reduce((n, d) => n + d.pads, 0);
  const POWER_SPOTS = DIGS.reduce((n, d) => n + d.power, 0);
  // Units are one flat table: bench spots, then shelf spots, then every pad's bays in pad order.
  const UNIT_BENCH = 0, UNIT_SHELF = BENCH, UNIT_BAY = BENCH + SHELF;
  const UNITS = UNIT_BAY + PADS * BAYS;
  const spotOfUnit = (u) => u < UNIT_SHELF ? "bench" : u < UNIT_BAY ? "shelf" : "bay";
  const padOfUnit = (u) => u < UNIT_BAY ? -1 : Math.floor((u - UNIT_BAY) / BAYS);
  const bayOfUnit = (u) => u < UNIT_BAY ? -1 : (u - UNIT_BAY) % BAYS;
  const chamberOfPad = (p) => p < DIGS[0].pads ? 0 : p < DIGS[0].pads + DIGS[1].pads ? 1 : 2;
  const chamberOfCool = (spot) => Math.floor(spot / COOL_SPOTS);
  const chamberOfPower = (p) => p < DIGS[0].power ? 0 : p < DIGS[0].power + DIGS[1].power ? 1 : 2;
  const chamberOfUnit = (u) => u < UNIT_BAY ? 0 : chamberOfPad(padOfUnit(u));

  // Eight, each a trade: none is simply better, and the order is the save's, so new ones go on the end.
  const TROPHIES = [
    { id: "hoodie", name: "Ooga Hoodie", cost: 500, note: "+10% luck on solo rolls. Does nothing in the pool" },
    { id: "tablets", name: "Stone Tablets", cost: 8000, note: "+5% hash, and every rack runs a quarter hotter" },
    { id: "deal", name: "Power Deal", cost: 200000, note: "-10% on every kilowatt from the grid, but no price contracts while you hold it" },
    { id: "crew", name: "Ooga Crew", cost: 800000, note: "Three more operators who walk the cave and fix what breaks" },
    { id: "stone", name: "Cold Stone", cost: 25000, note: "The pool waives its cut, but pays you every third block: fatter, later. Nothing in solo" },
    { id: "glowbox", name: "Glow Box", cost: 60000, note: "+12,000 in the battery for outages, and it drinks 2 kW from the grid to hold the charge" },
    { id: "charm", name: "Shaman's Charm", cost: 120000, note: "Every bad event pays you something back, and good events last half as long" },
    { id: "skyhut", name: "Sky Hut", cost: 600000, note: "x1.2 on the score of a clean win: no loan taken, no carrying on after a loss" }
  ];
  const TROPHY_RESALE = 0.9;

  const CRACK = { bananas: 25, cap: 100, rest: 180 };
  const LOAN = { min: 5000, share: 0.25, max: 3000000, interest: 0.25, seconds: 240, extensions: [[0.1, 60], [0.25, 45]] };
  const BANKRUPT_SECONDS = 30;

  // Score is hundredths of a coin mined, plus a speed bonus for finishing. Gold is a win with time to
  // spare, silver a win at the wire or most of the way there, bronze a real operation that ran out of hour.
  const SPEED = [[1800, 1500], [2400, 1000], [3000, 600], [3600, 300]];
  const MEDALS = { gold: 2700, silver: 1500, bronze: 800 };
  const medalFor = (score) => score >= MEDALS.gold ? "gold" : score >= MEDALS.silver ? "silver" : score >= MEDALS.bronze ? "bronze" : null;
  const scoreOf = (minedSats, seconds, won) => {
    let bonus = 0;
    if (won) for (const [limit, b] of SPEED) if (seconds <= limit) {
      bonus = b;
      break;
    }
    return Math.floor(minedSats / 1e6) + bonus;
  };

  const subsidyAt = (seconds) => seconds >= HALVING_AT ? SUBSIDY / 2 : SUBSIDY;
  // Watts a TH: the one number that decides whether a machine lives.
  const efficiencyOf = (m) => m.kw * 1000 / m.th;
  // What one machine of a model earns less what it costs, a minute, in bananas. `hashprice` is bananas
  // a TH a second; `power` is bananas a kWh. Every tile and card shows it.
  const profitPerMinute = (m, hashprice, power) => (m.th * hashprice - m.kw * power / 3600) * 60;
  // The grid price at which a model stops paying.
  const breakEven = (m, hashprice) => m.th * hashprice * 3600 / m.kw;
  // Minutes until one machine has earned its price back at that profit; Infinity when it never will.
  const paybackMinutes = (cost, profit) => profit > 0 ? cost / profit : Infinity;
  // Sats sell at the floating price; bananas never convert back, so selling is one-way and a decision.
  const bananasForSats = (sats, price) => Math.floor(sats / 1e8 * price);

  // The rest of the network: a floor that climbs every epoch, plus miners who follow what pays and so
  // copy a fraction of what you run. It closes on that target over a few minutes, so a big purchase
  // buys a few good minutes at a high share before the others catch up. The halving shakes out the
  // weakest of them.
  const othersTarget = (seconds, hash, halved) => (NET_START * Math.pow(1 + NET_GROWTH, Math.floor(seconds / (BLOCK_SECONDS * EPOCH_BLOCKS))) + hash * NET_FOLLOW) * (halved ? 0.75 : 1);

  BL.mineRigs = {
    SUBSIDY, HALVING_AT, BLOCK_SECONDS, EPOCH_BLOCKS, POOL_FEE, GOAL_SATS, RUN_SECONDS, COIN, GRUBSTAKE,
    NET_START, NET_GROWTH, NET_FOLLOW, NET_CATCHUP, SHARE_MAX, SOLO_MAX, POWER_PRICE, HEAT_THROTTLE, REPAIR, RESALE,
    MODELS, CPU, GPU, FIRST_ASIC, LAUNCH_PREMIUM, LAUNCH_SETTLE, OLDER_DROP, HOLDERS, POWER, BATTERY, DIGS, BUSBAR, COOL_SPOTS, COOL_PASSIVE, COOLERS, SAFETY, OVERLOAD_SECONDS, SMOTHER_SECONDS, MELT_WARN, FIRE_JUMP_AFTER, FIRE_JUMP,
    PUSH, WEAR_SECONDS, TROPHIES, TROPHY_RESALE, CRACK, LOAN, BANKRUPT_SECONDS, SPEED, MEDALS,
    BENCH, SHELF, BAYS, PADS, POWER_SPOTS, UNITS, UNIT_BENCH, UNIT_SHELF, UNIT_BAY,
    spotOfUnit, padOfUnit, bayOfUnit, chamberOfPad, chamberOfPower, chamberOfCool, chamberOfUnit,
    subsidyAt, efficiencyOf, profitPerMinute, breakEven, paybackMinutes, bananasForSats, othersTarget, medalFor, scoreOf
  };
})();
