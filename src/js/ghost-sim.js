// HALLOWEEN: the ghost hunt's rules, ported from OBL-Audio-lab (config.js, machine.js, spawn.js, motion.js and the
// room's game tick) into metres on the island. Pure and loadable in Node: no DOM, no clock, no Math.random. Time
// comes in as `now`, milliseconds on the room's clock; every timer is kept relative to `epoch` (the hunt's start),
// so a snapshot moves between pages that share that clock and a new host picks the hunt up where the old one left it.
// The page that runs the hunt (the room's host, or a page alone) calls `present` for each player in the arena, then
// `advance(now)`; a 50 ms fixed tick, at most four a frame. Fixed pools: MAX_GHOSTS ghosts, the boss, MAX_DROPS
// drops, MAX_PLAYERS players. `step` allocates nothing.
//
//   IDLE -> GATHER  the herald is clicked       GATHER -> LAP  the one who woke it (the host) ready, and everyone
//                                                there ready or GATHER_MS gone by
//   GATHER -> IDLE  the host not ready by GATHER_MS, or nobody there ABANDON_MS
//   LAP -> NIGHT -> COUNTDOWN  the walls rise and the dusk runs out
//   COUNTDOWN -> ACTIVE -> BREAK -> COUNTDOWN  a round is cleared; the sixth clears into BOSS
//   BOSS -> VICTORY  he burns                    ACTIVE / BOSS -> DEFEAT  every player in the arena frozen
//   VICTORY / DEFEAT -> DAWN -> IDLE             any hunting state -> DAWN  the arena empty ABANDON_MS
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};

  // GATHER, the lobby before the walls rise, comes last in number so every LAP..DAWN range keeps its meaning.
  const STATE = { IDLE: 0, LAP: 1, NIGHT: 2, COUNTDOWN: 3, ACTIVE: 4, BREAK: 5, BOSS: 6, VICTORY: 7, DEFEAT: 8, DAWN: 9, GATHER: 10 };
  const OUTCOME = { NONE: 0, VICTORY: 1, DEFEAT: 2, ABANDON: 3 };
  // Per round: total ghosts, most at once, seconds between spawn events, ghosts per event, speed (m/s). Seven rounds,
  // then the boss as the eighth. Matched to the rifles (`WEAPON`) and the enemies' toughness (`HP_SCALE`) so the rounds
  // a player must land each second (the ghosts coming times the rounds each takes) climbs with no easy stretch: about
  // 1.5, 7.7, 7.2, 12.7, 13.5, then 8.8 as the green laser comes and 10.3 in the seventh, for one player.
  const ROUNDS = [
    { ghosts: 20, cap: 6, interval: 2.0, group: 1, speed: 1.8 },
    { ghosts: 40, cap: 12, interval: 1.2, group: 2, speed: 2.3 },
    { ghosts: 55, cap: 14, interval: 0.95, group: 2, speed: 2.7 },
    { ghosts: 70, cap: 16, interval: 0.85, group: 3, speed: 3.0 },
    { ghosts: 85, cap: 18, interval: 0.8, group: 3, speed: 3.2 },
    { ghosts: 100, cap: 20, interval: 0.75, group: 3, speed: 3.4 },
    { ghosts: 115, cap: 22, interval: 0.7, group: 3, speed: 3.6 }
  ];
  // Rounds scale with the players counted as each starts (6+ play like 5). Each hunter's share stays near one
  // player's: two face 1.6 times the ghosts coming 1.28 times as fast, five 3.4 times as many twice as fast (`cap`
  // still held to MAX_GHOSTS), since a group also has revives and more drops to share: `drops` times a round's drops.
  const PLAYER_SCALING = [null,
    { ghosts: 1.0, cap: 1.0, interval: 1.0, speed: 1.0, drops: 1.0 },
    { ghosts: 1.6, cap: 1.4, interval: 0.78, speed: 1.05, drops: 1.5 },
    { ghosts: 2.2, cap: 1.8, interval: 0.65, speed: 1.1, drops: 2.0 },
    { ghosts: 2.8, cap: 2.2, interval: 0.56, speed: 1.15, drops: 2.5 },
    { ghosts: 3.4, cap: 2.6, interval: 0.5, speed: 1.2, drops: 3.0 }];
  const TIER = { PLAIN: 0, GENERAL: 1, WRAITH: 2 };
  // The drops; "tess" stands in the lab's monkey sidearm: Tess comes down, and whoever takes her has her at their side.
  // "lightning" is never a random drop: one comes over the banana pile in each round (LIGHTNING). "monkeys" is a random
  // drop like the first six, the lab's monkey sidearm: taken, a monkey floats at each of its player's hips and fires a
  // rock with each of their shots (the hunt draws and aims them; the sim only keeps who has them, `monkeys`, until
  // their player's bar falls below `POWER_KEEP_SEG`).
  const DROP = ["bomb", "shield", "ice", "health", "double", "tess", "lightning", "monkeys"], TESS_DROP = 5, LIGHTNING_DROP = 6, MONKEY_DROP = 7;
  const DYING = { SHOT: 1, TAGGED: 2, BURNED: 3, PUMPKIN: 4, ZAPPED: 5 };
  // The debug stand-in a revive can be watched on alone (`debug.revive`): a player id no room hands out.
  const REVIVE_BOT = -7;
  const CONFIG = {
    // Snapshot v1 readers have twelve drop slots. Extra rewards wait in the shared pending queue.
    TICK_MS: 50, MAX_GHOSTS: 32, MAX_DROPS: 12, MAX_PLAYERS: 16, MAX_PENDING: 24,
    // The lobby: how long players have to gather and ready up once the herald is woken.
    GATHER_MS: 30000,
    // A won hunt holds its banner and podium `VICTORY_MS` (five seconds past the ten it once held) before the dawn.
    NIGHT_MS: 3500, COUNTDOWN_MS: 4000, BREAK_MS: 6000, VICTORY_MS: 15000, DAWN_MS: 6000, ABANDON_MS: 15000,
    // A round that brings in new enemies opens with a card for each in turn, its countdown `INTRO_MS` longer for every
    // card: `INTRO_PAGES[round - 1]` of them, the last the boss's (round 8). Round 1 ghosts and gorillas; round 2
    // generals, skeletons, the spider and the hourglass; round 3 wraiths and the Fiat Rush; then the boss.
    INTRO_MS: 4000, INTRO_PAGES: [2, 4, 2, 0, 0, 0, 0, 1],
    // A lost hunt gives the island back sooner: a short banner and a quick dawn.
    DEFEAT_MS: 3000, DAWN_FAST_MS: 2500,
    // A player whose bar empties is down for the rest of the round (`DOWN_UNTIL`, past any round's end) and comes back
    // whole as it ends (a round cleared, the next one called, the last giving way to the boss); in the boss's fight,
    // until the hunt ends.
    DOWN_UNTIL: 1e12, PLAYER_SEGMENTS: 5, IFRAMES_MS: 1000,
    // Tess and the monkeys stay through the first hits and leave a player once their bar falls below `POWER_KEEP_SEG`.
    POWER_KEEP_SEG: 4,
    // A ghost's body: a plain one `GHOST_RADIUS` round, a general or wraith `BIG` times that, a general `GENERAL` times
    // that again.
    GHOST_RADIUS: 0.42, BIG: 1.5, GENERAL: 1.5, PLAYER_RADIUS: 0.3, SHIELD_PAD: 0.4, BOUNCE_MS: 450, BOUNCE_SPEED: 2.5,
    KNOCK_MS: 140, KNOCK_SPEED: 8, HOVER: 0.3, CLIMB_RATE: 2,
    WEAVE_AMP: 0.85, WEAVE_HZ: 0.4, SEPARATION_PUSH: 1.7, RETARGET_MS: 500, DYING_MS: 1100,
    ARENA_R: 23, LAND_R: 20.5, DESCEND_MS: 1600, SPAWN_SAFE: 6.5, GOLDEN: 137.508 * Math.PI / 180, JITTER: 10 * Math.PI / 180, SPAWN_TRIES: 5,
    // By tier: a plain ghost, a general, a wraith.
    HP: [6, 12, 12], KILLS: [1, 2, 2],
    // Every enemy but the boss grows tougher as the rounds go: `HP_SCALE[round - 1]` times its health (`hpOf`), on the
    // rifles' sawtooth (`WEAPON`). A round that hands out a stronger rifle keeps the round before's toughness, so the
    // upgrade is felt, and the next catches up: a plain ghost takes 3, 4, 3, 3, 3, 2, 2 rifle rounds through rounds 1 to
    // 7, a general or wraith 6, 7, 5, 6, 6, 3, 4, a gorilla 40, 46, 31, 36, 40, 20, 24.
    HP_SCALE: [1, 1.15, 1.15, 1.35, 1.5, 1.5, 1.75],
    GENERAL_EVERY: 5, GENERAL_FROM: 2, WRAITH_EVERY: 10, WRAITH_FROM: 3, WRAITH_SPEED: 1,
    // A general's eye beam and a wraith's soul pull: how near they must be to start one, and how far a player must get
    // to break it (both 40% shorter than the lab's 6.4 and 9.4, 8.5 and 17).
    BEAM: { range: 3.84, breakRange: 5.64, ms: 3000, windMs: 350, cooldownMs: 4000 },
    SOUL: { range: 5.1, breakRange: 10.2, ms: 1500, windMs: 300, cooldownMs: 4000 },
    // The boss: inside the walls, he shows himself for `shownMs` somewhere at least `minR` and at most `maxR` from the
    // middle (clear of every hunter by `clearR`, and `moveR` from where he was), spits `spit` enemies of any kind at
    // `spitAtMs` into it (one more for every `spitPlayers` players past the first; `SPIT` weighs the kinds), vanishes
    // and comes again elsewhere `goneMs` later. Only while he shows can he be shot. His generals still come over the
    // bluff in waves.
    BOSS: { y: 1.5, minR: 6, maxR: 16, clearR: 6, moveR: 8, shownMs: 3000, goneMs: 1500, spitAtMs: 1200, spit: 3, spitPlayers: 2,
      launchMs: 700, launchSpeed: 4, burnMs: 600, kills: 5, hp: 200, hpPerPlayer: 100, hpMax: 600, radius: 2.4, height: 7.6, generals: 20, generalGroup: 4, generalEvery: 6000, generalFirst: 4000 },
    // What the boss spits, weighed: a plain ghost, a general, a wraith, a skeleton, a gorilla (a full pool of the last
    // two gives a plain ghost instead).
    SPIT: [0.45, 0.2, 0.15, 0.12, 0.08],
    // Every `MONKEY_EVERY_KILLS` enemies a player kills themselves (one each, whatever its points: `foes`, never shared
    // and never doubled) the monkeys come down on them, as though they had taken the drop; a gift earned while they
    // still have a pair waits until a hit has taken those away (`giftMonkeys`).
    // Drops: `FIRST_DROPS` as the first round starts, then `ROUND_DROPS[round - 1]` as each round is cleared (the
    // last's as the boss comes), a steady few rather than a flood that grows with the rounds; each times the
    // players' `drops` (`dropsFor`). While a round or the boss is fought, one more falls every `MID_DROP_MS` of it,
    // as often again for each `drops` more the players count (`midDropAt`).
    ROUND_DROPS: [3, 4, 4, 5, 5, 5, 7], MID_DROP_MS: 25000,
    FIRST_DROPS: 3, MONKEY_EVERY_KILLS: 30, ROUND_DROP_DELAY_MS: 6000, ROUND_DROP_GAP_MS: 150, FALL_MS: 850, PICKUP_R: 1.0,
    SHIELD_MS: 10000, ICE_MS: 5000, ICE_SLOW: 0.5, DOUBLE_MS: 10000, BOMB_BOSS: 0.1,
    PUMPKIN_KILLS: 40, SPLASH_R: 1.6,
    // A pause holds the hunt still (P) for `PAUSE_MAX_MS` at most, so one left paused cannot keep the island sealed.
    PAUSE_MAX_MS: 120000,
    // The lightning drop: once a round, when `at` of its ghosts have come (and once in the boss's fight, when he is down
    // to `bossAt` of his health), it hangs over the banana pile until someone reaches the pile. Taken, a bolt strikes
    // every ghost and gorilla in turn (the first `firstMs` on, `gapMs` apart, all within `spreadMs`); each struck one
    // stands crackling for `zapMs` and dies. The boss is not killed: his bolt takes `boss` of his health.
    LIGHTNING: { at: 0.5, bossAt: 0.75, firstMs: 250, gapMs: 140, spreadMs: 1600, zapMs: 2000, boss: 0.25 },
    // Tess at a player's side zaps the nearest ghost within `range` (any but the boss) dead, or a gorilla for `brute` of
    // its health (two zaps), then rests `cooldownMs`;
    // the first zap waits `firstMs`. Her player's bar falling below `POWER_KEEP_SEG` sends her away, as it does the monkeys.
    TESS: { range: 8.5, reach: 4, cooldownMs: 2000, firstMs: 600, brute: 12 },
    // The gorillas: green, 80 health, sent when a round is down to its last two ghosts (never in the boss's fight),
    // `perRound[round - 1]` of them and one more for every `perPlayers` players past the first (`brutesFor`). Each is
    // called down by a beam (`beamMs`), drops (`fallMs`) and lands shaking (`shakeMs`), then comes at the nearest
    // player; within `reach` it leaps at them (`leapMs`, `leapH` high), lands `beside` them and slams the ground, every
    // player within `splashR` of the slam losing `damage` segments, then gathers itself (`recoverMs`).
    BRUTE: { max: 10, hp: 80, kills: 3, speed: 6.2, beamMs: 1300, fallMs: 450, fallFrom: 25, shakeMs: 1000, reach: 5, leapMs: 650, leapH: 2.4, beside: 1,
      splashR: 2.6, recoverMs: 1400, damage: 1, perRound: [1, 1, 1, 2, 2, 2, 3], perPlayers: 2, landMin: 4, landMax: 7, landR: 18, radius: 0.7 },
    // The elixirs: one glowing on each totem pole's front (`elixirs` where they hang), set out afresh as each round
    // starts. An active player who comes within `pickR` of one (carrying none) takes it; carrying one, standing within
    // `reviveR` of where a player went down (their grave, `downX`, `downZ`) for `reviveMs` brings them back whole
    // (`IFRAMES_MS` twice over to find their feet), and the elixir is spent.
    ELIXIR: { max: 4, pickR: 1.3, reviveR: 1.8, reviveMs: 3000 },
    // The skeletons: a plain ghost's health, each in a gorilla's slot (`kind` 1, so the gorillas' beam, hits, bolts, bomb
    // and Tess all take it). From the second round, `perRound[round - 1]` of them and one more for every `perPlayers`
    // players past the first (`bonesFor`), each called down in a white beam at its own point in the round, spread
    // evenly through its ghosts' coming. One drops (`fallMs`) and crawls at the nearest player at once (only its upper
    // body, pulling itself along by its arms); within `reach` it lunges up at them and bites for `damage` segments (a
    // shield throws it back), then gathers itself (`recoverMs`).
    BONES: { hp: 6, kills: 1, speed: 3.2, beamMs: 1300, fallMs: 450, fallFrom: 25, reach: 1.6, recoverMs: 1000, damage: 1, perRound: [0, 2, 3, 4, 5, 6, 7], perPlayers: 2 },
    // The giant striped spiders: each in a gorilla's slot (`kind` 2, so the beam, hits, bolts, bomb and Tess take it),
    // sent once a round's gorillas are down, `perRound[round - 1]` of them. One is called down in a white beam
    // (`beamMs`), drops (`fallMs`) and walks at the nearest player; within `spitRange` it stops, rears (`windMs`) and
    // spits a glob of green venom at where they stand, flying `venomSpeed` m/s, which splashes every player within
    // `venomR` of where it lands (the spider's own width, a pulsing ring shows it) for `damage` segments (the shield and
    // a fresh hurt keep them up); then it gathers itself (`recoverMs`). Its glob rides in the gorilla's leap fields:
    // from (`fromX`, `fromZ`) to (`toX`, `toZ`), thrown at `fromY` and landing at `toY` (hunt times).
    SPIDER: { hp: 120, kills: 2, speed: 7.2, beamMs: 1100, fallMs: 700, fallFrom: 20, spitRange: 7, windMs: 300, venomSpeed: 11, venomR: 2.4,
      recoverMs: 700, damage: 1, perRound: [0, 1, 2, 2, 2, 2, 2] },
    // A giant spider killed in a fight bursts into `count` spiderlings (their own pool of `max`): each flung out from
    // where it died at `scatterSpeed` for `scatterMs`, then crawling at the nearest player; within `reach` it bites for
    // `damage` segments (the shield and a fresh hurt keep them up), hops back and gathers itself (`recoverMs`). The
    // round waits for them all. `hp` as every enemy's, grown with the rounds. In round `swarmRound`, once its ghosts
    // are down to their last two, the Fiat Rush is called (`swarmWarnMs` of warning) and then `swarmCount` more (and
    // `swarmPlayers` for every player past the first, at most `swarmMax`) drop in one at a time, `swarmGapMs` apart and
    // only while fewer than `swarmLive` spiderlings are alive: each `dropMin` to `dropMax` from a hunter (inside
    // `dropR` of the middle), called down in a green beam (`dropBeamMs`) and falling (`dropFallMs`) before it comes on,
    // neither shot nor bombed until it lands.
    LING: { count: 15, max: 96, hp: 4, kills: 1, speed: 4.6, scatterSpeed: 6, scatterMs: 450, reach: 0.9, damage: 1, recoverMs: 900, radius: 0.35,
      swarmRound: 3, swarmCount: 20, swarmPlayers: 10, swarmMax: 60, swarmWarnMs: 2000, swarmGapMs: 700, swarmLive: 10,
      dropMin: 3, dropMax: 7, dropR: 19, dropBeamMs: 700, dropFallMs: 450 },
    // The Halving Hourglass (`kind` 3): called down in a green beam somewhere inside the walls (`minR` to `maxR` from the
    // middle, `clearR` from every hunter) once `at` of a round's ghosts have come, `perRound[round - 1]` of them (first in
    // round 2, again in round 4), and `boss` more as the boss's fight begins. It stands still under its beam; while any
    // stands, every rifle round does half damage (`halving`).
    HOURGLASS: { hp: 50, kills: 4, beamMs: 1500, fallMs: 600, fallFrom: 25, at: 0.1, minR: 6, maxR: 15, clearR: 6, perRound: [0, 1, 0, 1, 0, 0, 0], boss: 1 },
    // The hunters' rifles grow stronger with the rounds: the white rock (rounds 1 and 2), then yellow laser (3 to 5),
    // green (6 and 7) and, for the boss, red, `tiers[round - 1]` naming each round's and `damage` each tier's in OBL
    // points (a plain ghost has 6, a general or wraith 12, before `HP_SCALE`). The boss's health (`BOSS`) was doubled
    // with the red laser, so his fight takes half the rounds it did with the rock rather than a quarter.
    WEAPON: { tiers: [0, 0, 1, 1, 1, 2, 2], damage: [2, 3, 6, 8] }
  };
  const C = CONFIG, TAU = Math.PI * 2;

  const roundSettings = (round, players, out) => {
    const r = ROUNDS[round - 1];
    if (!r) return null;
    const n = Math.min(5, Math.max(1, Math.floor(players) || 1)), k = PLAYER_SCALING[n];
    out.ghosts = n === 1 ? r.ghosts : Math.round(r.ghosts * k.ghosts / 10) * 10;
    out.cap = Math.min(C.MAX_GHOSTS, out.ghosts, Math.round(r.cap * k.cap));
    out.interval = r.interval * k.interval;
    out.group = r.group;
    out.speed = r.speed * k.speed;
    return out;
  };
  /** An enemy's health in `round` (the boss's fight keeps the sixth's) from its `base` (C.HP, BRUTE.hp, BONES.hp). */
  const hpOf = (base, round) => Math.round(base * C.HP_SCALE[Math.min(C.HP_SCALE.length, Math.max(1, round)) - 1]);
  /** The rifles' tier (0 the rock, 1 yellow, 2 green, 3 red) in `round`, or in the boss's fight. */
  const weaponTier = (round, boss) => boss ? C.WEAPON.damage.length - 1
    : C.WEAPON.tiers[Math.min(C.WEAPON.tiers.length, Math.max(1, round)) - 1];
  const isWraith = (n, round) => round >= C.WRAITH_FROM && n % C.WRAITH_EVERY === C.WRAITH_EVERY - 1;
  const ghostTier = (n, round) => isWraith(n, round) ? TIER.WRAITH : round >= C.GENERAL_FROM && n % C.GENERAL_EVERY === C.GENERAL_EVERY - 1 ? TIER.GENERAL : TIER.PLAIN;
  const radiusOf = (tier) => C.GHOST_RADIUS * (tier === TIER.PLAIN ? 1 : tier === TIER.GENERAL ? C.BIG * C.GENERAL : C.BIG);
  /** How many new-enemy cards open `round`'s countdown (the boss's when `boss`), `INTRO_MS` each. */
  const introPages = (round, boss) => C.INTRO_PAGES[boss ? ROUNDS.length : round - 1] || 0;
  /** How long each of `pages` cards stands. */
  const introMs = () => C.INTRO_MS;
  /** How many gorillas a round sends with `players` counted in it. */
  const brutesFor = (round, players) => {
    const base = C.BRUTE.perRound[round - 1] || 0;
    return base ? base + Math.floor((Math.max(1, players) - 1) / C.BRUTE.perPlayers) : 0;
  };
  /** How many hourglasses a round sends. */
  const glassesFor = (round) => C.HOURGLASS.perRound[round - 1] || 0;
  /** How many spiderlings the Fiat Rush sends with `players` counted in its round. */
  const swarmFor = (players) => Math.min(C.LING.swarmMax, C.LING.swarmCount + C.LING.swarmPlayers * (Math.max(1, players) - 1));
  /** How many spiders a round sends. */
  const spidersFor = (round) => C.SPIDER.perRound[round - 1] || 0;
  /** How many skeletons a round sends with `players` counted in it. */
  const bonesFor = (round, players) => {
    const base = C.BONES.perRound[round - 1] || 0;
    return base ? base + Math.floor((Math.max(1, players) - 1) / C.BONES.perPlayers) : 0;
  };

  // The ghost's fields, in the order a snapshot carries them after its slot.
  const GHOST_FIELDS = ["id", "tier", "x", "y", "z", "age", "phase", "hp", "dying", "dyingAt", "target", "retargetAt",
    "spawnAt", "sx", "sy", "sz", "lx", "lz", "bounceUntil", "bvx", "bvz", "bounceSpeed", "knockUntil", "kvx", "kvz",
    "beamTarget", "beamAt", "beamUntil", "beamHit", "beamReady", "soulTarget", "soulAt", "soulUntil", "soulHit", "soulReady", "hitAt", "struckAt"];
  const PLAYER_FIELDS = ["id", "x", "y", "z", "seg", "frozenUntil", "invulnUntil", "doubleUntil", "kills", "dropsGiven", "hitAt", "hitX", "hitZ",
    "tess", "tessReady", "zapAt", "zapX", "zapY", "zapZ", "monkeys", "ready", "inGame", "elixir", "reviveTarget", "reviveSince"];
  // Fields added since that row was fixed, carried in a snapshot's own `x` rows (slot, then these) so pages on either
  // side of a deploy still share a hunt: an older page skips `x`, a newer one reads its absence as zeros.
  const PLAYER_EXTRA = ["foes", "downAt", "downX", "downZ"], PLAYER_ALL = PLAYER_FIELDS.concat(PLAYER_EXTRA);
  const DROP_FIELDS = ["id", "kind", "x", "z", "at"];
  // A gorilla's phase: 1 called down (the beam), 2 falling, 3 landed and shaking, 4 coming, 5 holding someone, 6 gathering.
  // A skeleton (`kind` 1) skips the shaking and the leap: it strikes from CHASE and gathers itself in RECOVER.
  const BRUTE_PHASE = { BEAM: 1, FALL: 2, SHAKE: 3, CHASE: 4, LEAP: 5, RECOVER: 6, SPIT: 7 };
  const BRUTE_FIELDS = ["id", "x", "y", "z", "hp", "phase", "phaseAt", "target", "heading", "dying", "dyingAt", "hitAt", "slamAt", "fromX", "fromY", "fromZ", "toX", "toY", "toZ", "struckAt", "kind"];
  // A spiderling's fields, in the order a snapshot's `l` rows carry them after its slot (older pages skip `l`).
  const LING_PHASE = { SCATTER: 1, CHASE: 2, RECOVER: 3, DROP: 4 };
  const LING_FIELDS = ["id", "x", "z", "hp", "phase", "phaseAt", "heading", "vx", "vz", "dying", "dyingAt", "hitAt", "bitAt"];
  const STATE_FIELDS = ["state", "outcome", "round", "endsAt", "spawned", "players", "lapAt", "lapMs", "now", "rng", "seqN", "theta0",
    "lastSpawnAt", "nextId", "emptySince", "shieldUntil", "slowUntil", "kills", "bombAt", "pickAt", "pickKind", "pickBy", "pendingCount", "brutesSent",
    "bossOn", "bossShownAt", "bossNextAt", "bossX", "bossZ", "bossHp", "bossMax", "bossNextSpit", "bossGenerals", "bossNextGeneral", "bossDyingAt", "bossHitAt", "spitAt", "startedBy", "paused", "pausedFor", "healAt",
    "lightningSent", "boltAt", "boltBy", "bossStruckAt", "bonesSent", "elixirsTaken", "reviveAt", "reviveBy", "reviveOf"];
  // State added since that row was fixed, carried in a snapshot's own `y` (older pages skip it, newer ones read what
  // is missing as zeros): the hourglasses sent this round, how many of this round's Fiat Rush spiderlings have dropped,
  // when it was called (its warning) and when the next may drop, and when the next mid-round drop falls.
  const STATE_EXTRA = ["glassesSent", "swarmSent", "swarmAt", "swarmNext", "midDropAt"], STATE_ALL = STATE_FIELDS.concat(STATE_EXTRA);

  const newGhost = () => {
    const g = { on: false };
    for (const f of GHOST_FIELDS) g[f] = 0;
    return g;
  };
  const newPlayer = () => {
    const p = { on: false, here: false };
    for (const f of PLAYER_ALL) p[f] = 0;
    return p;
  };
  const newBrute = () => {
    const b = { on: false };
    for (const f of BRUTE_FIELDS) b[f] = 0;
    return b;
  };
  const newLing = () => {
    const l = { on: false };
    for (const f of LING_FIELDS) l[f] = 0;
    return l;
  };
  const newDrop = () => {
    const d = { on: false };
    for (const f of DROP_FIELDS) d[f] = 0;
    return d;
  };

  /**
   * One hunt. `seed` seeds its random draws; `spots` is the crest's spawn spots as [x, y, z, bearing] runs (bearing in
   * radians, increasing); `lapMs` how long the herald's lap takes on this island; `pile` where the banana pile stands and
   * how near it a player takes the lightning drop (read as it is at each step, so the caller may grow it); `elixirs`
   * where each elixir hangs on its totem ({ x, z }, at most ELIXIR.max).
   */
  const create = ({ seed = 1, spots, lapMs = 20000, pile = { x: 0, z: 0, r: 3 }, elixirs = [] } = {}) => {
    const s = { epoch: 0, pending: new Float64Array(C.MAX_PENDING) };
    for (const f of STATE_ALL) s[f] = 0;
    const ghosts = Array.from({ length: C.MAX_GHOSTS }, newGhost);
    const players = Array.from({ length: C.MAX_PLAYERS }, newPlayer);
    const drops = Array.from({ length: C.MAX_DROPS }, newDrop);
    const brutes = Array.from({ length: C.BRUTE.max }, newBrute);
    const lings = Array.from({ length: C.LING.max }, newLing);
    const spotCount = Math.floor(spots.length / 4);
    const round = { ghosts: 0, cap: 0, interval: 0, group: 0, speed: 0 };
    let baseSeed = seed >>> 0, ticks = 0;
    s.lapMs = lapMs;

    const rand = () => {
      let t = s.rng = (s.rng + 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    const settings = () => roundSettings(Math.max(1, s.round), s.players, round);

    const reset = () => {
      for (const f of STATE_ALL) if (f !== "lapMs" && f !== "now") s[f] = 0;
      for (const g of ghosts) g.on = false;
      for (const p of players) p.on = p.here = false;
      for (const d of drops) d.on = false;
      for (const b of brutes) b.on = false;
      for (const l of lings) l.on = false;
    };

    // ---------- players ----------
    const playerById = (id) => {
      for (const p of players) if (p.on && p.id === id) return p;
      return null;
    };
    let presence = 0;
    const beginPresence = () => {
      presence = 0;
      for (const p of players) p.here = false;
    };
    /** A player standing in the arena this frame: feet (x, y, z). Unknown ids take a free slot. */
    // A player's slot, found or (while the hunt still takes players) made.
    const slotFor = (id) => {
      let p = playerById(id);
      if (p) return p;
      for (const q of players) if (!q.on) { p = q; break; }
      if (!p) return null;
      for (const f of PLAYER_ALL) p[f] = 0;
      p.on = true;
      p.id = id;
      p.seg = C.PLAYER_SEGMENTS;
      return p;
    };
    // Once the walls rise the roster is fixed: only those who readied up in the lobby (`inGame`) are in the hunt.
    // Anyone else, those who did not ready and those who came later, waits it out.
    const rosterFixed = () => s.state !== STATE.IDLE && s.state !== STATE.GATHER;
    const present = (id, x, y, z) => {
      const p = rosterFixed() ? playerById(id) : slotFor(id);
      if (!p || rosterFixed() && !p.inGame) return null;
      p.here = true;
      p.x = x; p.y = y; p.z = z;
      presence++;
      return p;
    };
    const frozen = (p) => s.now < p.frozenUntil;
    const active = (p) => p.on && p.here && !frozen(p);
    const hurtPlayer = (p, gx, gz) => {
      p.seg = Math.max(0, p.seg - 1);
      if (p.seg < C.POWER_KEEP_SEG) p.tess = p.monkeys = 0;
      p.invulnUntil = s.now + C.IFRAMES_MS;
      p.hitAt = s.now; p.hitX = gx; p.hitZ = gz;
      if (p.seg === 0) goDown(p);
    };
    // Down for the rest of the round where they stand: their grave rises there on every page and an elixir brings them
    // back there, wherever their page reports them meanwhile.
    const goDown = (p) => {
      p.frozenUntil = C.DOWN_UNTIL;
      p.downAt = s.now || 1; p.downX = p.x; p.downZ = p.z;
    };

    // A gorilla's slam: `n` segments at once, and the blink after it.
    const slamPlayer = (p, n, gx, gz) => {
      for (let i = 0; i < n && p.seg > 0; i++) hurtPlayer(p, gx, gz);
    };
    // A gorilla's slam: everyone near where it struck the ground goes down, the shield and a fresh hurt keeping them up.
    const splash = (x, y, z, now) => {
      for (const p of players) {
        if (!active(p) || now < p.invulnUntil || now < s.shieldUntil || Math.abs(p.y - y) > 1.5 || Math.hypot(p.x - x, p.z - z) > C.BRUTE.splashR) continue;
        slamPlayer(p, C.BRUTE.damage, x, z);
      }
    };

    // ---------- drops ----------
    const placeDrop = (kind) => {
      for (const d of drops) {
        if (d.on) continue;
        const a = rand() * TAU, r = kind === 2 ? 7.5 : 5 + rand() * 12;
        d.on = true; d.id = s.nextId++; d.kind = kind; d.x = Math.sin(a) * r; d.z = -Math.cos(a) * r; d.at = s.now;
        if (kind === LIGHTNING_DROP) { d.x = pile.x; d.z = pile.z; }
        return d;
      }
      return null;
    };
    // Tess comes down only while nobody has her and no drop of her lies waiting.
    const tessOut = () => {
      for (const d of drops) if (d.on && d.kind === TESS_DROP) return true;
      for (const p of players) if (p.on && p.tess) return true;
      return false;
    };
    const dropRandom = () => {
      let free = false;
      for (const d of drops) if (!d.on) { free = true; break; }
      if (!free) return null;
      let kind = Math.floor(rand() * (TESS_DROP + 2));
      if (kind === TESS_DROP + 1) kind = MONKEY_DROP;
      if (kind === TESS_DROP && tessOut()) kind = Math.floor(rand() * TESS_DROP);
      return placeDrop(kind);
    };
    const dropsOf = (kind) => {
      let n = 0;
      for (const d of drops) if (d.on && d.kind === kind) n++;
      return n;
    };
    // How many times one player's drops the players counted in the round get, and `n` drops scaled by it.
    const dropShare = () => PLAYER_SCALING[Math.min(5, Math.max(1, Math.floor(s.players) || 1))].drops;
    const dropsFor = (n) => Math.round(n * dropShare());
    const queueRoundDrops = () => {
      const n = dropsFor(C.ROUND_DROPS[s.round - 1] || 0);
      for (let i = 0; i < n && s.pendingCount < C.MAX_PENDING; i++) s.pending[s.pendingCount++] = s.now + C.ROUND_DROP_DELAY_MS + i * C.ROUND_DROP_GAP_MS;
    };
    // `n` kill points for player `p` (or nobody), from `foes` enemies killed.
    const addKills = (p, n, foes = 1) => {
      if (n <= 0) return;
      if (p && s.now < p.doubleUntil) n *= 2;
      s.kills += n;
      if (!p) return;
      p.kills += n;
      p.foes += foes;
      giftMonkeys(p);
    };
    // Player `p`'s next earned monkeys (`dropsGiven` counts those given), only while they have none and stand clear
    // of a hit's blink; the rest wait their turn, one a pair lost.
    const giftMonkeys = (p) => {
      if (p.monkeys || frozen(p) || s.now < p.invulnUntil || p.dropsGiven >= Math.floor(p.foes / C.MONKEY_EVERY_KILLS)) return;
      p.dropsGiven++;
      p.monkeys = 1; s.pickAt = s.now; s.pickKind = MONKEY_DROP; s.pickBy = p.id;
    };
    const killValue = (g) => C.KILLS[g.tier];
    const kill = (g, kind) => {
      g.dying = kind;
      g.dyingAt = s.now;
      g.beamTarget = g.soulTarget = 0;
    };
    // A drop a player walks over waits for someone else while it would do them no good: a health banana on a full bar,
    // or Tess, the monkeys or double points while they already have them.
    const wants = (p, kind) => kind === 3 ? p.seg < C.PLAYER_SEGMENTS
      : kind === TESS_DROP ? !p.tess : kind === MONKEY_DROP ? !p.monkeys : kind === 4 ? s.now >= p.doubleUntil : true;
    const take = (d, p) => {
      d.on = false;
      s.pickAt = s.now; s.pickKind = d.kind; s.pickBy = p.id;
      if (d.kind === 0) {
        s.bombAt = s.now;
        let points = 0, foes = 0;
        for (const g of ghosts) if (g.on && !g.dying) { kill(g, DYING.BURNED); points += killValue(g); foes++; }
        for (const b of brutes) if (b.on && !b.dying) { killBrute(b, DYING.BURNED); points += bruteKills(b); foes++; }
        for (const l of lings) if (l.on && !l.dying && l.phase !== LING_PHASE.SCATTER && l.phase !== LING_PHASE.DROP) { killLing(l, DYING.BURNED); points += C.LING.kills; foes++; }
        if (s.bossOn && !s.bossDyingAt) {
          s.bossHp = Math.max(1, s.bossHp - Math.ceil(s.bossMax * C.BOMB_BOSS));
          s.bossHitAt = s.now;
        }
        addKills(p, points, foes);
      } else if (d.kind === 1) s.shieldUntil = s.now + C.SHIELD_MS;
      else if (d.kind === 2) s.slowUntil = s.now + C.ICE_MS;
      else if (d.kind === 3) { for (const q of players) if (q.on && !frozen(q)) q.seg = C.PLAYER_SEGMENTS; }
      else if (d.kind === TESS_DROP) { p.tess = 1; p.tessReady = s.now + C.TESS.firstMs; }
      else if (d.kind === LIGHTNING_DROP) strikeAll(p);
      else if (d.kind === MONKEY_DROP) p.monkeys = 1;
      else p.doubleUntil = s.now + C.DOUBLE_MS;
    };

    // ---------- ghosts ----------
    const addGhost = (tier, x, y, z, landX, landZ) => {
      for (const g of ghosts) {
        if (g.on) continue;
        for (const f of GHOST_FIELDS) g[f] = 0;
        g.on = true;
        g.id = s.nextId++;
        g.tier = tier;
        g.x = g.sx = x; g.y = g.sy = y; g.z = g.sz = z;
        g.lx = landX; g.lz = landZ;
        g.spawnAt = s.now;
        g.phase = rand() * TAU;
        g.hp = hpOf(C.HP[tier], s.round);
        return g;
      }
      return null;
    };
    // ---------- gorillas ----------
    // A giant spider killed in a fight (not cleared away as the hunt ends) bursts into its brood.
    const killBrute = (b, kind) => { b.dying = kind; b.dyingAt = s.now; if (b.kind === 2 && fighting()) brood(b.x, b.z); };
    // ---------- spiderlings ----------
    // A spiderling at (x, z), flung along bearing `a` before it comes on; null with the pool full.
    const spawnLing = (x, z, a) => {
      const K = C.LING, l = lings.find((q) => !q.on);
      if (!l) return null;
      for (const f of LING_FIELDS) l[f] = 0;
      const v = K.scatterSpeed * (0.7 + 0.6 * rand());
      l.on = true; l.id = s.nextId++; l.x = x; l.z = z; l.hp = hpOf(K.hp, s.round);
      l.vx = Math.sin(a) * v; l.vz = Math.cos(a) * v; l.heading = a;
      l.phase = LING_PHASE.SCATTER; l.phaseAt = s.now;
      return l;
    };
    // A spider's brood, flung out all round where it died.
    const brood = (x, z) => {
      const K = C.LING, a0 = rand() * TAU;
      for (let n = 0; n < K.count; n++) if (!spawnLing(x, z, a0 + n * TAU / K.count + (rand() - 0.5) * 0.4)) return;
    };
    // One of the Fiat Rush's spiderlings called down in its beam near one of the hunters; false with the pool full.
    const dropLing = () => {
      const K = C.LING, a = rand() * TAU, d = K.dropMin + rand() * (K.dropMax - K.dropMin);
      let p = null;
      for (const q of players) if (active(q) && (!p || rand() < 0.5)) p = q;
      let x = (p ? p.x : 0) + Math.sin(a) * d, z = (p ? p.z : 0) + Math.cos(a) * d;
      const out = Math.hypot(x, z);
      if (out > K.dropR) { x *= K.dropR / out; z *= K.dropR / out; }
      const l = spawnLing(x, z, a + Math.PI);
      if (!l) return false;
      l.vx = l.vz = 0;
      l.phase = LING_PHASE.DROP;
      return true;
    };
    const lingsAlive = () => {
      let n = 0;
      for (const l of lings) if (l.on && !l.dying) n++;
      return n;
    };
    const killLing = (l, kind) => { l.dying = kind; l.dyingAt = s.now; };
    // A gorilla's settings, or a skeleton's, and what killing it is worth.
    const KINDS = [C.BRUTE, C.BONES, C.SPIDER, C.HOURGLASS];
    const kindOf = (b) => KINDS[b.kind];
    const bruteKills = (b) => kindOf(b).kills;
    // ---------- the lightning drop ----------
    // Every ghost and landed gorilla gets its bolt in turn, the boss his. Spiderlings have no crackle of their own: every
    // landed one burns at once, credited to whoever called the bolt.
    const strikeAll = (p) => {
      const L = C.LIGHTNING;
      s.boltAt = s.now; s.boltBy = p.id;
      let n = 0;
      for (const g of ghosts) if (g.on && !g.dying && !g.struckAt) n++;
      for (const b of brutes) if (b.on && !b.dying && !b.struckAt && b.phase >= BRUTE_PHASE.FALL) n++;
      if (s.bossOn && !s.bossDyingAt) n++;
      const gap = Math.min(L.gapMs, L.spreadMs / Math.max(1, n));
      let k = 0;
      for (const g of ghosts) if (g.on && !g.dying && !g.struckAt) g.struckAt = s.now + L.firstMs + gap * k++;
      for (const b of brutes) if (b.on && !b.dying && !b.struckAt && b.phase >= BRUTE_PHASE.FALL) b.struckAt = s.now + L.firstMs + gap * k++;
      if (s.bossOn && !s.bossDyingAt) s.bossStruckAt = s.now + L.firstMs + gap * k;
      for (const l of lings) if (l.on && !l.dying && l.phase !== LING_PHASE.DROP) { killLing(l, DYING.ZAPPED); addKills(p, C.LING.kills); }
    };
    // Struck and crackling: held where it is, harmless, and dead once its zap is done (true while held).
    const struck = (e, now) => e.struckAt > 0 && now >= e.struckAt;
    const brutesAlive = () => {
      let n = 0;
      for (const b of brutes) if (b.on && !b.dying) n++;
      return n;
    };
    const gorillasAlive = () => {
      for (const b of brutes) if (b.on && !b.dying && !b.kind) return true;
      return false;
    };
    // A brute of `kind` (0 a gorilla, 1 a skeleton, 2 a spider, 3 an hourglass) called down near player `p` (or anywhere
    // when there is none), or, given `at`, dropped from the boss's mouth there ({ x, z, y }) partway through its fall.
    const addBrute = (p, kind = 0, at = null) => {
      for (const b of brutes) {
        if (b.on) continue;
        for (const f of BRUTE_FIELDS) b[f] = 0;
        const a = rand() * TAU, r = C.BRUTE.landMin + rand() * (C.BRUTE.landMax - C.BRUTE.landMin);
        let x = at ? at.x : (p ? p.x : 0) + Math.sin(a) * r, z = at ? at.z : (p ? p.z : 0) - Math.cos(a) * r;
        const out = Math.hypot(x, z);
        if (out > C.BRUTE.landR) { x *= C.BRUTE.landR / out; z *= C.BRUTE.landR / out; }
        b.on = true; b.id = s.nextId++; b.x = x; b.z = z; b.kind = kind; b.y = kindOf(b).fallFrom; b.hp = hpOf(kindOf(b).hp, s.round);
        b.phase = BRUTE_PHASE.BEAM; b.phaseAt = s.now;
        b.heading = p ? Math.atan2(p.x - x, p.z - z) : 0;
        if (at) {
          // Its fall starts where `at.y` lies on it: y = fallFrom * (1 - k * k).
          const K = kindOf(b), k = Math.sqrt(Math.max(0, 1 - Math.min(at.y, K.fallFrom) / K.fallFrom));
          b.phase = BRUTE_PHASE.FALL; b.phaseAt = s.now - k * K.fallMs;
        }
        return b;
      }
      return null;
    };
    const alive = () => {
      let n = 0;
      for (const g of ghosts) if (g.on && !g.dying) n++;
      return n;
    };
    // The spot nearest a bearing, or -1; spots are sorted by bearing.
    const spotNear = (bearing) => {
      const b = (bearing % TAU + TAU) % TAU;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < spotCount; i++) {
        const d = Math.abs(((spots[i * 4 + 3] - b + Math.PI * 3) % TAU) - Math.PI);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const safe = (i) => {
      const x = spots[i * 4], z = spots[i * 4 + 2];
      for (const p of players) if (active(p) && Math.hypot(p.x - x, p.z - z) < C.SPAWN_SAFE) return false;
      return true;
    };
    const SPAWNED = new Int32Array(8);
    /** One spawn event of k ghosts round the crest, golden-angle spread; false when every try met a player. */
    // Spawns up to `k` ghosts round a fresh bearing, as many as the pool has free slots for (a dying ghost holds its
    // slot until its fade is done); how many it made, 0 when there was no room or no safe spot.
    const spawnGroup = (k, tierOf) => {
      let free = 0;
      for (const g of ghosts) if (!g.on) free++;
      k = Math.min(k, free);
      if (k <= 0) return 0;
      for (let tries = 0; tries < C.SPAWN_TRIES; tries++) {
        const theta = s.theta0 + s.seqN++ * C.GOLDEN + (rand() * 2 - 1) * C.JITTER;
        let ok = true;
        for (let i = 0; i < k; i++) {
          const at = spotNear(theta + i * TAU / k);
          if (at < 0 || !safe(at)) { ok = false; break; }
          SPAWNED[i] = at;
        }
        if (!ok) continue;
        let made = 0;
        for (let i = 0; i < k; i++) {
          const at = SPAWNED[i], x = spots[at * 4], y = spots[at * 4 + 1], z = spots[at * 4 + 2], r = Math.hypot(x, z) || 1;
          if (addGhost(tierOf(i), x, y, z, x / r * C.LAND_R, z / r * C.LAND_R)) made++;
        }
        return made;
      }
      return 0;
    };
    const nearestPlayer = (x, z) => {
      let best = null, bd = Infinity;
      for (const p of players) {
        if (!active(p)) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    };
    const stepGhost = (g, target, dt, speed) => {
      g.age += dt;
      if (!target) return;
      let ux = target.x - g.x, uz = target.z - g.z;
      const d = Math.hypot(ux, uz);
      if (d < 1e-6) return;
      ux /= d; uz /= d;
      const omega = TAU * C.WEAVE_HZ, w = C.WEAVE_AMP * omega * Math.cos(omega * g.age + g.phase);
      let vx = speed * ux - w * uz, vz = speed * uz + w * ux;
      const sep = 2 * radiusOf(g.tier);
      for (const o of ghosts) {
        if (o === g || !o.on || o.dying) continue;
        const dx = g.x - o.x, dz = g.z - o.z, dist = Math.hypot(dx, dz);
        if (dist < sep && dist > 1e-6) {
          const push = C.SEPARATION_PUSH * (1 - dist / sep);
          vx += push * dx / dist; vz += push * dz / dist;
        }
      }
      g.x += vx * dt; g.z += vz * dt;
      g.y += (target.y + C.HOVER - g.y) * Math.min(1, dt * C.CLIMB_RATE);
    };
    const clampArena = (g) => {
      const r = Math.hypot(g.x, g.z);
      if (r > C.ARENA_R) { g.x *= C.ARENA_R / r; g.z *= C.ARENA_R / r; }
    };
    const bounceOff = (g, p, dist) => {
      let dx = g.x - p.x, dz = g.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
      g.x = p.x + dx * dist; g.z = p.z + dz * dist;
      g.bvx = dx; g.bvz = dz;
      g.bounceUntil = s.now + C.BOUNCE_MS;
      g.bounceSpeed = C.BOUNCE_SPEED;
    };
    // A spot inside the walls `minR` to `maxR` from the middle, a few tries for one `clearR` from every hunter and
    // `awayR` from (awayX, awayZ), into `OPEN`.
    const OPEN = { x: 0, z: 0 };
    const openSpot = (minR, maxR, clearR, awayX = 0, awayZ = 0, awayR = 0) => {
      for (let tries = 0; tries < 12; tries++) {
        const a = rand() * TAU, r = minR + rand() * (maxR - minR);
        OPEN.x = Math.sin(a) * r; OPEN.z = -Math.cos(a) * r;
        if (Math.hypot(OPEN.x - awayX, OPEN.z - awayZ) < awayR) continue;
        let clear = true;
        for (const p of players) if (active(p) && Math.hypot(p.x - OPEN.x, p.z - OPEN.z) < clearR) { clear = false; break; }
        if (clear) break;
      }
      return OPEN;
    };
    const placeBoss = () => {
      const B = C.BOSS, at = openSpot(B.minR, B.maxR, B.clearR, s.bossX, s.bossZ, B.moveR);
      s.bossX = at.x; s.bossZ = at.z;
    };
    // An hourglass called down somewhere open inside the walls.
    const sendGlass = () => {
      const b = addBrute(null, 3);
      if (!b) return false;
      const H = C.HOURGLASS, at = openSpot(H.minR, H.maxR, H.clearR);
      b.x = at.x; b.z = at.z; b.heading = 0;
      return true;
    };
    /** While any hourglass stands (landed, not dying), every rifle round does half damage. */
    const halving = () => {
      for (const b of brutes) if (b.on && !b.dying && b.kind === 3 && b.phase >= BRUTE_PHASE.SHAKE) return true;
      return false;
    };
    // The countdown under way, or the break before it, leads to the boss: the last round is over, its ghosts all spent.
    const bossNext = () => s.round >= ROUNDS.length && (s.state === STATE.COUNTDOWN || s.state === STATE.BREAK) && s.spawned >= settings().ghosts;
    // The boss shows himself a while at a time.
    const bossShown = () => s.bossShownAt > 0 && s.now >= s.bossShownAt && s.now < s.bossShownAt + C.BOSS.shownMs;
    const SPIT_AT = { x: 0, y: 0, z: 0 };
    // One enemy out of the boss's mouth, of a kind drawn by `SPIT`, flung out along `a`.
    const spitOne = (a) => {
      const vx = Math.sin(a), vz = Math.cos(a), mouth = C.BOSS.y + C.BOSS.height * 0.6, now = s.now;
      let roll = rand(), kind = 0;
      while (kind < C.SPIT.length - 1 && roll >= C.SPIT[kind]) { roll -= C.SPIT[kind]; kind++; }
      if (kind >= 3) {
        SPIT_AT.x = s.bossX + vx * 2.2; SPIT_AT.z = s.bossZ + vz * 2.2; SPIT_AT.y = mouth;
        let target = null;
        for (const p of players) if (active(p) && (!target || rand() < 0.5)) target = p;
        if (addBrute(target, kind === 3 ? 1 : 0, SPIT_AT)) return true;
        kind = 0;
      }
      const g = addGhost(kind, s.bossX + vx * 1.7, mouth, s.bossZ + vz * 1.7, 0, 0);
      if (!g) return false;
      g.spawnAt = now - C.DESCEND_MS;
      g.bvx = vx; g.bvz = vz; g.bounceUntil = now + C.BOSS.launchMs; g.bounceSpeed = C.BOSS.launchSpeed;
      return true;
    };

    // ---------- the machine ----------
    const enter = (state) => {
      const prev = s.state;
      s.state = state;
      const roundOver = state === STATE.COUNTDOWN || state === STATE.BREAK || state === STATE.BOSS && prev === STATE.ACTIVE;
      if (roundOver) {
        // A round over (the last goes straight to the boss), or a new one called: everyone down is back, and everyone
        // is whole again.
        for (const p of players) {
          if (!p.on) continue;
          if (frozen(p)) { p.frozenUntil = 0; p.invulnUntil = s.now + C.IFRAMES_MS; }
          p.seg = C.PLAYER_SEGMENTS;
          p.reviveTarget = p.reviveSince = 0;
        }
      }
      if (state === STATE.COUNTDOWN || state === STATE.BOSS && prev === STATE.ACTIVE) { s.healAt = s.now; s.elixirsTaken = 0; }
      // A new hunt's first round: nobody carries one over from the last hunt.
      if (state === STATE.COUNTDOWN && prev === STATE.NIGHT) for (const p of players) p.elixir = p.reviveTarget = 0;
      if (state === STATE.COUNTDOWN) {
        const boss = bossNext();
        const pages = introPages(s.round, boss);
        s.endsAt = s.now + C.COUNTDOWN_MS + pages * introMs(pages);
        if (!boss) s.spawned = 0;
      }
      else if (state === STATE.ACTIVE) {
        let n = 0;
        for (const p of players) if (p.on && p.here) n++;
        s.players = Math.max(1, n);
        s.seqN = 0; s.theta0 = rand() * TAU; s.lastSpawnAt = -1e9; s.endsAt = 0; s.brutesSent = 0; s.bonesSent = 0; s.lightningSent = 0;
        s.glassesSent = 0; s.swarmSent = 0; s.swarmAt = 0; s.swarmNext = 0;
        if (s.round === 1) for (let i = 0, n = dropsFor(C.FIRST_DROPS); i < n; i++) dropRandom();
        if (s.round === 3 && !dropsOf(1)) placeDrop(1);
        if (s.round === 4 && !dropsOf(2)) placeDrop(2);
      } else if (state === STATE.BREAK) s.endsAt = s.now + C.BREAK_MS;
      else if (state === STATE.BOSS) {
        let n = 0;
        for (const p of players) if (p.on && p.here) n++;
        s.bossOn = 1;
        s.lightningSent = 0; s.bossStruckAt = 0; s.bossDyingAt = 0; s.bossNextAt = 0; s.glassesSent = 0;
        s.bossX = s.bossZ = 0; placeBoss();
        s.bossShownAt = s.now + 1000;
        s.bossMax = s.bossHp = Math.min(C.BOSS.hpMax, C.BOSS.hp + C.BOSS.hpPerPlayer * Math.max(0, n - 1));
        s.bossNextSpit = s.bossShownAt + C.BOSS.spitAtMs; s.bossGenerals = 0; s.bossNextGeneral = s.now + C.BOSS.generalFirst;
      } else if (state === STATE.VICTORY || state === STATE.DEFEAT) {
        s.outcome = state === STATE.VICTORY ? OUTCOME.VICTORY : OUTCOME.DEFEAT;
        s.endsAt = s.now + (state === STATE.DEFEAT ? C.DEFEAT_MS : C.VICTORY_MS);
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.SHOT);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.SHOT);
        for (const l of lings) if (l.on && !l.dying) killLing(l, DYING.SHOT);
        if (state === STATE.DEFEAT) s.bossOn = 0;
      } else if (state === STATE.DAWN) {
        s.endsAt = s.now + dawnMs();
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.SHOT);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.SHOT);
        for (const l of lings) if (l.on && !l.dying) killLing(l, DYING.SHOT);
        s.bossOn = 0;
        for (const d of drops) d.on = false;
        s.pendingCount = 0;
        s.shieldUntil = s.slowUntil = 0;
      }
      if ((state === STATE.BREAK || state === STATE.BOSS) && prev === STATE.ACTIVE) queueRoundDrops();
    };

    /** How long the dawn takes: quick after a defeat. */
    const dawnMs = () => s.outcome === OUTCOME.DEFEAT ? C.DAWN_FAST_MS : C.DAWN_MS;
    const hunting = () => s.state === STATE.COUNTDOWN || s.state === STATE.ACTIVE || s.state === STATE.BREAK || s.state === STATE.BOSS;
    const fighting = () => s.state === STATE.ACTIVE || s.state === STATE.BOSS;

    const step = () => {
      const dt = C.TICK_MS / 1000;
      s.now += C.TICK_MS;
      const now = s.now;
      // Pending round drops, oldest first; a full pool holds them for the next free slot.
      while (s.pendingCount && now >= s.pending[0]) {
        if (!dropRandom()) break;
        for (let i = 1; i < s.pendingCount; i++) s.pending[i - 1] = s.pending[i];
        s.pendingCount--;
      }
      for (const p of players) if (p.on && p.frozenUntil && now >= p.frozenUntil) { p.frozenUntil = 0; p.seg = C.PLAYER_SEGMENTS; }
      // Dying ghosts leave once their fade is done.
      for (const g of ghosts) if (g.on && g.dying && now - g.dyingAt >= C.DYING_MS) g.on = false;

      let anyHere = false, anyActive = false;
      for (const p of players) if (p.on && p.here) { anyHere = true; if (!frozen(p)) anyActive = true; }
      if (hunting()) {
        if (anyHere) s.emptySince = 0;
        else if (!s.emptySince) s.emptySince = now;
        else if (now - s.emptySince >= C.ABANDON_MS) { s.outcome = OUTCOME.ABANDON; enter(STATE.DAWN); return; }
      }

      const r = settings();
      // Spawning.
      if (s.state === STATE.ACTIVE) {
        const group = Math.max(0, Math.min(r.group, r.ghosts - s.spawned));
        if (group > 0 && alive() + group <= r.cap && now - s.lastSpawnAt >= r.interval * 1000) {
          const n0 = s.spawned, round = s.round;
          // Only the ghosts that got a slot count; the rest come with a later group.
          s.spawned += spawnGroup(group, (i) => ghostTier(n0 + i, round));
          s.lastSpawnAt = now;
        }
      }

      // Ghosts: descend from the crest, then chase, weave and keep apart; slowed by the ice.
      const slowed = now < s.slowUntil;
      const base = s.state === STATE.BOSS ? ROUNDS[ROUNDS.length - 1].speed : r.speed;
      const speed = base * (slowed ? C.ICE_SLOW : 1);
      for (const g of ghosts) {
        if (!g.on || g.dying) continue;
        if (struck(g, now)) {
          g.beamTarget = g.soulTarget = 0;
          if (now >= g.struckAt + C.LIGHTNING.zapMs) { kill(g, DYING.ZAPPED); addKills(playerById(s.boltBy), killValue(g)); }
          continue;
        }
        if (now < g.spawnAt + C.DESCEND_MS && !g.bounceUntil) {
          const k = (now - g.spawnAt) / C.DESCEND_MS, e = k * k * (3 - 2 * k);
          g.x = g.sx + (g.lx - g.sx) * e; g.z = g.sz + (g.lz - g.sz) * e;
          g.y = g.sy + (C.HOVER - g.sy) * e + Math.sin(k * Math.PI) * 1.2;
          g.age += dt;
          continue;
        }
        if (g.beamTarget || g.soulTarget) continue;
        if (now < g.knockUntil) { g.x += g.kvx * dt; g.z += g.kvz * dt; clampArena(g); continue; }
        if (now < g.bounceUntil) {
          g.x += g.bvx * speed * g.bounceSpeed * dt; g.z += g.bvz * speed * g.bounceSpeed * dt; g.age += dt;
          if (g.bounceSpeed === C.BOUNCE_SPEED) clampArena(g);
          else g.y += (C.HOVER + 2 - g.y) * Math.min(1, dt);
          continue;
        }
        if (now >= g.retargetAt) {
          const t = nearestPlayer(g.x, g.z);
          g.target = t ? t.id : 0;
          g.retargetAt = now + C.RETARGET_MS + (g.id % 5) * 20;
        }
        const target = g.target ? playerById(g.target) : null;
        stepGhost(g, target && active(target) ? target : null, dt, fighting() ? speed * (g.tier === TIER.WRAITH ? C.WRAITH_SPEED : 1) : 0);
        clampArena(g);
      }

      // The boss: shows himself inside the walls, spits his enemies, vanishes and comes again somewhere else.
      if (s.bossOn && s.state === STATE.BOSS && !s.bossDyingAt) {
        const B = C.BOSS;
        if (!s.bossNextAt && now >= s.bossShownAt + B.shownMs) s.bossNextAt = now + B.goneMs;
        if (s.bossNextAt && now >= s.bossNextAt) {
          placeBoss();
          s.bossShownAt = now; s.bossNextAt = 0; s.bossNextSpit = now + B.spitAtMs;
        }
        if (s.bossNextSpit && now >= s.bossNextSpit && bossShown()) {
          s.bossNextSpit = 0;
          s.spitAt = now;
          // Fanned out toward the middle of the hunters, else the middle of the island.
          let cx = 0, cz = 0, n = 0;
          for (const p of players) if (active(p)) { cx += p.x; cz += p.z; n++; }
          const toward = Math.atan2((n ? cx / n : 0) - s.bossX, (n ? cz / n : 0) - s.bossZ);
          const count = B.spit + Math.floor((Math.max(1, s.players) - 1) / B.spitPlayers);
          for (let i = 0; i < count; i++) if (!spitOne(toward + (i - (count - 1) / 2) * 0.35)) break;
        }
        if (s.bossGenerals < C.BOSS.generals && now >= s.bossNextGeneral) {
          const n = Math.min(C.BOSS.generalGroup, C.BOSS.generals - s.bossGenerals);
          const made = spawnGroup(n, () => TIER.GENERAL);
          if (made) { s.bossGenerals += made; s.bossNextGeneral = now + C.BOSS.generalEvery; }
          else s.bossNextGeneral = now + 1000;
        }
      }

      if (s.bossStruckAt && now >= s.bossStruckAt + C.LIGHTNING.zapMs) {
        s.bossStruckAt = 0;
        if (s.bossOn && !s.bossDyingAt) { s.bossHp = Math.max(1, s.bossHp - Math.ceil(s.bossMax * C.LIGHTNING.boss)); s.bossHitAt = now; }
      }

      // The lightning drop comes over the pile once a round, part way through it, and once in the boss's fight.
      if (!s.lightningSent && (s.state === STATE.ACTIVE && s.spawned >= r.ghosts * C.LIGHTNING.at
        || s.state === STATE.BOSS && s.bossOn && !s.bossDyingAt && s.bossHp <= s.bossMax * C.LIGHTNING.bossAt)) {
        // Sent once one hangs over the pile: with every drop slot taken, it tries again the next tick.
        if (dropsOf(LIGHTNING_DROP) || placeDrop(LIGHTNING_DROP)) s.lightningSent = 1;
      }

      // A drop every so often while the fighting lasts, its clock starting afresh with each round.
      if (!fighting()) s.midDropAt = 0;
      else if (!s.midDropAt) s.midDropAt = now + C.MID_DROP_MS / dropShare();
      else if (now >= s.midDropAt && dropRandom()) s.midDropAt = now + C.MID_DROP_MS / dropShare();

      // Drops: the first player to walk into a landed one who can use it takes it; the lightning, the first to reach
      // the pile under it.
      if (fighting()) {
        for (const d of drops) {
          if (!d.on || now < d.at + C.FALL_MS) continue;
          const reach = d.kind === LIGHTNING_DROP ? pile.r : C.PICKUP_R + C.PLAYER_RADIUS;
          for (const p of players) {
            if (!active(p) || !wants(p, d.kind) || Math.hypot(p.x - d.x, p.z - d.z) > reach) continue;
            take(d, p);
            break;
          }
        }
      }

      // Contact: a ghost that touches a player takes a segment and bounces off; the hit that empties the bar freezes
      // them and uses the ghost up. Under the shield, or just after a hit, every ghost only bounces.
      const shielded = now < s.shieldUntil;
      if (fighting()) for (const g of ghosts) {
        if (!g.on || g.dying || now < g.spawnAt + C.DESCEND_MS || struck(g, now)) continue;
        const reach = radiusOf(g.tier) + C.PLAYER_RADIUS;
        for (const p of players) {
          if (!active(p) || g.y > p.y + 1.6 || g.y < p.y - 1.2) continue;
          if (shielded) {
            if (Math.hypot(g.x - p.x, g.z - p.z) < reach + C.SHIELD_PAD) { bounceOff(g, p, reach + C.SHIELD_PAD); break; }
            continue;
          }
          if (Math.hypot(g.x - p.x, g.z - p.z) > reach) continue;
          if (now < p.invulnUntil) { bounceOff(g, p, reach + C.SHIELD_PAD); break; }
          hurtPlayer(p, g.x, g.z);
          if (p.seg === 0) kill(g, DYING.TAGGED);
          else bounceOff(g, p, reach + C.SHIELD_PAD);
          break;
        }
      }

      // Generals' eye beams and wraiths' soul pulls: a player in range is caught by one that is ready; it winds up,
      // connects once for a segment (unless shielded or blinking), and lets go when its time is up or they get away.
      if (fighting()) for (const g of ghosts) {
        if (!g.on || g.dying || g.tier === TIER.PLAIN || now < g.spawnAt + C.DESCEND_MS || struck(g, now)) continue;
        const wraith = g.tier === TIER.WRAITH, cfg = wraith ? C.SOUL : C.BEAM;
        const held = wraith ? g.soulTarget : g.beamTarget;
        if (held) {
          const p = playerById(held), at = wraith ? g.soulAt : g.beamAt, until = wraith ? g.soulUntil : g.beamUntil;
          if (!p || !active(p) || now >= until || Math.hypot(p.x - g.x, p.z - g.z) > cfg.breakRange) {
            if (wraith) { g.soulTarget = 0; g.soulReady = now + cfg.cooldownMs; }
            else { g.beamTarget = 0; g.beamReady = now + cfg.cooldownMs; }
            continue;
          }
          const hit = wraith ? g.soulHit : g.beamHit;
          if (!hit && now >= at + cfg.windMs) {
            if (wraith) g.soulHit = 1; else g.beamHit = 1;
            if (!shielded && now >= p.invulnUntil) hurtPlayer(p, g.x, g.z);
          }
          continue;
        }
        if (now < (wraith ? g.soulReady : g.beamReady)) continue;
        let target = null, best = cfg.range;
        for (const p of players) {
          if (!active(p)) continue;
          const d = Math.hypot(p.x - g.x, p.z - g.z);
          if (d <= best) { best = d; target = p; }
        }
        if (!target) continue;
        if (wraith) { g.soulTarget = target.id; g.soulAt = now; g.soulUntil = now + cfg.ms; g.soulHit = 0; }
        else { g.beamTarget = target.id; g.beamAt = now; g.beamUntil = now + cfg.ms; g.beamHit = 0; }
      }

      // The gorillas: when a round is down to its last two ghosts they are called down, one beside each of the nearest
      // players; then each falls, lands shaking, comes on, leaps and slams the ground beside them. Only arrivals with
      // a free slot count: skeletons share the pool, and dying bodies still hold their slots for a moment.
      // The spiders follow them, counted on after them in `brutesSent`, once every gorilla is down.
      const gorillas = brutesFor(s.round, s.players), spiders = spidersFor(s.round);
      if (s.state === STATE.ACTIVE && s.brutesSent >= gorillas && s.brutesSent < gorillas + spiders && !gorillasAlive()) {
        let best = null;
        for (const p of players) if (active(p) && (!best || rand() < 0.5)) best = p;
        if (addBrute(best, 2)) s.brutesSent++;
      }
      if (s.state === STATE.ACTIVE && s.brutesSent < gorillas && s.spawned >= r.ghosts && alive() <= 2) {
        for (let i = s.brutesSent; i < gorillas; i++) {
          let best = null;
          for (const p of players) if (active(p) && (!best || rand() < 0.5)) best = p;
          if (!addBrute(best)) break;
          s.brutesSent++;
        }
      }
      // The skeletons, each at its own share of the round's ghosts having come (the k-th of n at k / (n + 1)), beside
      // one of the players.
      const bones = bonesFor(s.round, s.players);
      if (s.state === STATE.ACTIVE && s.bonesSent < bones && s.spawned >= r.ghosts * (s.bonesSent + 1) / (bones + 1)) {
        let best = null;
        for (const p of players) if (active(p) && (!best || rand() < 0.5)) best = p;
        if (addBrute(best, 1)) s.bonesSent++;
      }
      // The hourglasses, early in their round and as the boss's fight begins (after the gorillas and skeletons, so a
      // freed slot goes to them first).
      if (s.state === STATE.ACTIVE && s.glassesSent < glassesFor(s.round) && s.spawned >= r.ghosts * C.HOURGLASS.at && sendGlass()) s.glassesSent++;
      // The swarm round's spiderlings: the Fiat Rush is called as its ghosts are down to their last two, and once its
      // warning is up they drop one at a time while there is room for them.
      if (s.state === STATE.ACTIVE && s.round === C.LING.swarmRound && !s.swarmAt && s.spawned >= r.ghosts && alive() <= 2) s.swarmAt = now;
      if (s.state === STATE.ACTIVE && s.swarmAt && s.swarmSent < swarmFor(s.players) && now >= s.swarmAt + C.LING.swarmWarnMs && now >= s.swarmNext
        && lingsAlive() < C.LING.swarmLive && dropLing()) { s.swarmSent++; s.swarmNext = now + C.LING.swarmGapMs; }
      if (s.state === STATE.BOSS && s.glassesSent < C.HOURGLASS.boss && sendGlass()) s.glassesSent++;
      for (const b of brutes) {
        if (!b.on) continue;
        if (b.dying) { if (now - b.dyingAt >= C.DYING_MS) b.on = false; continue; }
        if (struck(b, now)) {
          if (now >= b.struckAt + C.LIGHTNING.zapMs) { killBrute(b, DYING.ZAPPED); addKills(playerById(s.boltBy), bruteKills(b)); }
          continue;
        }
        const K = kindOf(b), since = now - b.phaseAt;
        if (b.phase === BRUTE_PHASE.BEAM) { if (since >= K.beamMs) { b.phase = BRUTE_PHASE.FALL; b.phaseAt = now; } continue; }
        if (b.phase === BRUTE_PHASE.FALL) {
          const k = Math.min(1, since / K.fallMs);
          b.y = K.fallFrom * (1 - k * k);
          // Gorillas land heavy and shake; the rest go straight on.
          if (k >= 1) { b.y = 0; b.phase = b.kind === 0 ? BRUTE_PHASE.SHAKE : BRUTE_PHASE.CHASE; b.phaseAt = now; }
          continue;
        }
        if (b.phase === BRUTE_PHASE.SHAKE) { if (since >= C.BRUTE.shakeMs) { b.phase = BRUTE_PHASE.CHASE; b.phaseAt = now; } continue; }
        if (b.phase === BRUTE_PHASE.LEAP) {
          // In the air: along to the spot beside them, up and down an arc, and the slam as it lands.
          const k = Math.min(1, since / C.BRUTE.leapMs);
          b.x = b.fromX + (b.toX - b.fromX) * k; b.z = b.fromZ + (b.toZ - b.fromZ) * k;
          b.y = b.fromY + (b.toY - b.fromY) * k + C.BRUTE.leapH * 4 * k * (1 - k);
          if (k >= 1) {
            b.y = b.toY;
            b.slamAt = now;
            splash(b.x, b.y, b.z, now);
            b.phase = BRUTE_PHASE.RECOVER; b.phaseAt = now;
          }
          continue;
        }
        if (b.phase === BRUTE_PHASE.RECOVER) { if (since >= K.recoverMs) { b.phase = BRUTE_PHASE.CHASE; b.phaseAt = now; } continue; }
        if (b.phase === BRUTE_PHASE.SPIT) {
          // The glob lands: everyone under it is hurt.
          if (now >= b.toY) {
            b.slamAt = now;
            for (const p of players) {
              if (!active(p) || now < p.invulnUntil || now < s.shieldUntil || Math.hypot(p.x - b.toX, p.z - b.toZ) > C.SPIDER.venomR) continue;
              slamPlayer(p, C.SPIDER.damage, b.toX, b.toZ);
            }
            b.phase = BRUTE_PHASE.RECOVER; b.phaseAt = now;
          }
          continue;
        }
        // An hourglass, once down, only stands.
        if (b.kind === 3) continue;
        // Coming on: at the nearest player, slowed by the ice, kept apart from the others.
        const t = nearestPlayer(b.x, b.z);
        b.target = t ? t.id : 0;
        if (!t || !fighting()) continue;
        let dx = t.x - b.x, dz = t.z - b.z;
        const d = Math.hypot(dx, dz);
        // A skeleton within reach strikes them where they stand (a shield throws it back, a fresh hurt keeps them up).
        if (b.kind === 2 && d <= C.SPIDER.spitRange && Math.abs(t.y - b.y) < 2) {
          // A spider in range spits at where they stand.
          const S = C.SPIDER;
          b.fromX = b.x; b.fromZ = b.z; b.toX = t.x; b.toZ = t.z;
          b.fromY = now + S.windMs; b.toY = b.fromY + d / S.venomSpeed * 1000;
          b.heading = Math.atan2(dx, dz);
          b.phase = BRUTE_PHASE.SPIT; b.phaseAt = now;
          continue;
        }
        if (b.kind === 1 && d <= C.BONES.reach && Math.abs(t.y - b.y) < 1.5) {
          if (now < s.shieldUntil) { b.x -= dx / (d || 1) * 2; b.z -= dz / (d || 1) * 2; }
          else {
            b.slamAt = now;
            if (active(t) && now >= t.invulnUntil) slamPlayer(t, C.BONES.damage, b.x, b.z);
          }
          b.heading = Math.atan2(dx, dz);
          b.phase = BRUTE_PHASE.RECOVER; b.phaseAt = now;
          continue;
        }
        if (!b.kind && d <= C.BRUTE.reach && Math.abs(t.y - b.y) < 1.5) {
          if (now < s.shieldUntil) {
            // The shield throws it back.
            b.x -= dx / (d || 1) * 2; b.z -= dz / (d || 1) * 2;
            b.phase = BRUTE_PHASE.RECOVER; b.phaseAt = now;
          } else {
            // It leaps, to land just short of them.
            const short = Math.min(C.BRUTE.beside, d) / (d || 1);
            b.fromX = b.x; b.fromY = b.y; b.fromZ = b.z;
            b.toX = t.x - dx * short; b.toY = t.y; b.toZ = t.z - dz * short;
            b.heading = Math.atan2(dx, dz);
            b.phase = BRUTE_PHASE.LEAP; b.phaseAt = now;
          }
          continue;
        }
        dx /= d || 1; dz /= d || 1;
        let vx = dx * K.speed * (slowed ? C.ICE_SLOW : 1), vz = dz * K.speed * (slowed ? C.ICE_SLOW : 1);
        for (const o of brutes) {
          if (o === b || !o.on || o.dying) continue;
          const ox = b.x - o.x, oz = b.z - o.z, od = Math.hypot(ox, oz);
          if (od < C.BRUTE.radius * 2 && od > 1e-6) { vx += ox / od * 1.5; vz += oz / od * 1.5; }
        }
        b.x += vx * dt; b.z += vz * dt;
        b.y += (t.y - b.y) * Math.min(1, dt * 4);
        b.heading = Math.atan2(dx, dz);
        const out = Math.hypot(b.x, b.z);
        if (out > C.ARENA_R) { b.x *= C.ARENA_R / out; b.z *= C.ARENA_R / out; }
      }

      // The spiderlings: flung out of the spider that bore them, then after the nearest player, biting within reach.
      for (const l of lings) {
        if (!l.on) continue;
        if (l.dying) { if (now - l.dyingAt >= C.DYING_MS) l.on = false; continue; }
        const K = C.LING, since = now - l.phaseAt;
        if (l.phase === LING_PHASE.DROP) {
          if (since >= K.dropBeamMs + K.dropFallMs) { l.phase = LING_PHASE.CHASE; l.phaseAt = now; }
        } else if (l.phase === LING_PHASE.SCATTER) {
          l.x += l.vx * dt; l.z += l.vz * dt;
          if (since >= K.scatterMs) { l.phase = LING_PHASE.CHASE; l.phaseAt = now; }
        } else if (l.phase === LING_PHASE.RECOVER) {
          if (since >= K.recoverMs) { l.phase = LING_PHASE.CHASE; l.phaseAt = now; }
        } else if (fighting()) {
          const t = nearestPlayer(l.x, l.z);
          if (t) {
            let dx = t.x - l.x, dz = t.z - l.z;
            const d = Math.hypot(dx, dz) || 1;
            dx /= d; dz /= d;
            l.heading = Math.atan2(dx, dz);
            if (d <= K.reach && Math.abs(t.y) < 1.5) {
              // It bites, and hops back to gather itself (the shield throws it back without the bite).
              if (now >= s.shieldUntil && active(t) && now >= t.invulnUntil) { slamPlayer(t, K.damage, l.x, l.z); l.bitAt = now; }
              l.x -= dx * 0.8; l.z -= dz * 0.8;
              l.phase = LING_PHASE.RECOVER; l.phaseAt = now;
            } else {
              let vx = dx * K.speed * (slowed ? C.ICE_SLOW : 1), vz = dz * K.speed * (slowed ? C.ICE_SLOW : 1);
              for (const o of lings) {
                if (o === l || !o.on || o.dying) continue;
                const ox = l.x - o.x, oz = l.z - o.z, od = Math.hypot(ox, oz);
                if (od < K.radius * 2 && od > 1e-6) { vx += ox / od * 1.2; vz += oz / od * 1.2; }
              }
              l.x += vx * dt; l.z += vz * dt;
            }
          }
        }
        const out = Math.hypot(l.x, l.z);
        if (out > C.ARENA_R) { l.x *= C.ARENA_R / out; l.z *= C.ARENA_R / out; }
      }

      // The elixirs: taken from the totems by whoever reaches one empty-handed; carried, held beside someone down for
      // ELIXIR.reviveMs, it brings them back.
      for (const p of players) {
        if (!fighting() || !active(p)) { p.reviveTarget = p.reviveSince = 0; continue; }
        if (!p.elixir) {
          for (let i = 0; i < elixirs.length && i < C.ELIXIR.max; i++) {
            if (s.elixirsTaken & (1 << i) || Math.hypot(p.x - elixirs[i].x, p.z - elixirs[i].z) > C.ELIXIR.pickR) continue;
            s.elixirsTaken |= 1 << i; p.elixir = 1;
            break;
          }
          continue;
        }
        let near = null, best = C.ELIXIR.reviveR;
        for (const q of players) {
          if (q === p || !q.on || !frozen(q)) continue;
          const d = q.downAt ? Math.hypot(q.downX - p.x, q.downZ - p.z) : q.here ? Math.hypot(q.x - p.x, q.z - p.z) : Infinity;
          if (d <= best) { best = d; near = q; }
        }
        if (!near) { p.reviveTarget = 0; continue; }
        if (p.reviveTarget !== near.id) { p.reviveTarget = near.id; p.reviveSince = now; continue; }
        if (now - p.reviveSince < C.ELIXIR.reviveMs) continue;
        near.frozenUntil = 0; near.seg = C.PLAYER_SEGMENTS; near.invulnUntil = now + C.IFRAMES_MS * 2;
        p.elixir = 0; p.reviveTarget = 0;
        s.reviveAt = now; s.reviveBy = p.id; s.reviveOf = near.id;
      }

      // Monkeys earned while a player still had a pair come down once those are gone.
      if (fighting()) for (const p of players) if (active(p)) giftMonkeys(p);
      // Tess, at her player's side: the nearest ghost in reach dies on her beam, then she rests.
      if (fighting()) for (const p of players) {
        if (!p.tess || !active(p) || now < p.tessReady) continue;
        let target = null, best = C.TESS.range;
        for (const g of ghosts) {
          if (!g.on || g.dying || Math.abs(g.y - p.y) > C.TESS.reach) continue;
          const d = Math.hypot(g.x - p.x, g.z - p.z);
          if (d <= best) { best = d; target = g; }
        }
        let brute = null;
        for (const b of brutes) {
          if (!b.on || b.dying || b.phase < BRUTE_PHASE.SHAKE || Math.abs(b.y - p.y) > C.TESS.reach) continue;
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d <= best) { best = d; brute = b; target = null; }
        }
        if (!target && !brute) continue;
        if (brute) {
          brute.hitAt = now;
          if (brute.hp > C.TESS.brute) brute.hp -= C.TESS.brute;
          else { brute.hp = 0; killBrute(brute, DYING.SHOT); addKills(p, bruteKills(brute)); }
          p.zapX = brute.x; p.zapY = brute.y; p.zapZ = brute.z;
        }
        else { kill(target, DYING.SHOT); addKills(p, killValue(target)); p.zapX = target.x; p.zapY = target.y; p.zapZ = target.z; }
        p.zapAt = now;
        p.tessReady = now + C.TESS.cooldownMs;
      }

      // The machine.
      const st = s.state;
      if (st === STATE.GATHER) {
        // The lobby: once its host is ready it starts when everyone there is too, or at its end with whoever is. The host
        // not ready by its end, nobody ready, or nobody there a while, and it closes with no hunt.
        const host = s.startedBy ? playerById(s.startedBy) : null, hostReady = !s.startedBy || !!(host && host.ready);
        let here = 0, readyHere = 0, readyAny = 0;
        for (const p of players) {
          if (!p.on) continue;
          if (p.ready) readyAny++;
          if (p.here) { here++; if (p.ready) readyHere++; }
        }
        if (here) s.emptySince = 0;
        else if (!s.emptySince) s.emptySince = now;
        const quiet = !here && now - s.emptySince >= C.ABANDON_MS;
        if (hostReady && here && readyHere === here || now >= s.endsAt || quiet) {
          for (const p of players) { p.inGame = p.on && p.ready ? 1 : 0; if (p.on && !p.inGame) p.on = p.here = false; }
          if (hostReady && readyAny && !quiet) { s.lapAt = now; s.emptySince = 0; enter(STATE.LAP); }
          else { const lap = s.lapMs; reset(); s.lapMs = lap; }
        }
      } else if (st === STATE.LAP) { if (now >= s.lapAt + s.lapMs) { s.endsAt = now + C.NIGHT_MS; enter(STATE.NIGHT); } }
      else if (st === STATE.NIGHT) { if (now >= s.endsAt) { s.round = Math.max(1, s.round); enter(STATE.COUNTDOWN); } }
      else if (st === STATE.COUNTDOWN) { if (now >= s.endsAt) enter(bossNext() ? STATE.BOSS : STATE.ACTIVE); }
      else if (st === STATE.ACTIVE) {
        if (anyHere && !anyActive) enter(STATE.DEFEAT);
        else if (s.spawned >= r.ghosts && alive() === 0 && brutesAlive() === 0 && s.brutesSent >= gorillas + spidersFor(s.round) && s.bonesSent >= bones && lingsAlive() === 0
          && s.glassesSent >= glassesFor(s.round) && (s.round !== C.LING.swarmRound || s.swarmSent >= swarmFor(s.players))) enter(STATE.BREAK);
      } else if (st === STATE.BOSS) {
        if (anyHere && !anyActive) enter(STATE.DEFEAT);
        // The boss's fall is the victory.
        else if (s.bossDyingAt && now - s.bossDyingAt >= C.BOSS.burnMs) { s.bossOn = 0; enter(STATE.VICTORY); }
      } else if (st === STATE.BREAK) {
        // After the last round's break the countdown is the boss's: the round stays, its ghosts all spent (`bossNext`).
        if (now >= s.endsAt) { if (s.round < ROUNDS.length) s.round++; enter(STATE.COUNTDOWN); }
      }
      else if (st === STATE.VICTORY || st === STATE.DEFEAT) { if (now >= s.endsAt) enter(STATE.DAWN); }
      else if (st === STATE.DAWN) { if (now >= s.endsAt) { const lap = s.lapMs; reset(); s.lapMs = lap; } }
      ticks++;
    };

    /** Steps the hunt up to `now` (the room's clock, ms); returns whether anything ran. */
    const advance = (now) => {
      if (s.state === STATE.IDLE) return false;
      if (s.paused) {
        // Held: the hunt's clock stands still (its start moves on with the room's), until resumed or held too long.
        s.pausedFor += Math.max(0, now - s.epoch - s.now);
        s.epoch = now - s.now;
        if (s.pausedFor >= C.PAUSE_MAX_MS) s.paused = 0;
        return false;
      }
      const target = now - s.epoch;
      let n = 0;
      while (s.now + C.TICK_MS <= target && n < 4) { step(); n++; }
      // A long stall (a hidden tab, a debugger) catches the clock up rather than replaying it.
      if (s.now + C.TICK_MS * 4 < target) s.now = target - (target - s.now) % C.TICK_MS;
      return n > 0;
    };

    /** Holds the hunt still or lets it go on (`on`), from the walls' rising to the boss's fight; true when it changed. */
    const pause = (on, now) => {
      if (s.state < STATE.LAP || s.state > STATE.BOSS || !!s.paused === !!on) return false;
      if (on) { s.paused = 1; s.pausedFor = 0; } else { s.paused = 0; s.epoch = now - s.now; }
      return true;
    };
    /** Player `id` is ready to hunt (the lobby's Ready, or clicking the herald again); false outside the lobby. */
    const ready = (id) => {
      if (s.state !== STATE.GATHER) return false;
      const p = slotFor(id);
      if (!p) return false;
      p.ready = 1;
      return true;
    };
    /**
     * The herald was clicked by player `by` (the hunt's host): its lobby opens at `now`, and the hunt, from `round`
     * (debug only skips ahead; past the last round, to the boss's countdown), follows only once the host has readied
     * up. `by` 0 (debug) opens it with no host.
     */
    const start = (now, by = 0, fromRound = 1) => {
      if (s.state !== STATE.IDLE) return false;
      const lap = s.lapMs;
      reset();
      s.lapMs = lap;
      s.epoch = now;
      s.now = 0;
      s.rng = (baseSeed ^ Math.imul(now % 2147483647, 2654435761)) >>> 0;
      baseSeed = (baseSeed + 0x9E3779B9) >>> 0;
      s.nextId = 1;
      s.lapAt = 0;
      s.startedBy = by;
      s.round = Math.min(ROUNDS.length, Math.max(1, fromRound | 0));
      // The boss: the last round with every ghost spent, so its countdown is his (`bossNext`).
      if ((fromRound | 0) > ROUNDS.length) s.spawned = Number.MAX_SAFE_INTEGER;
      s.state = STATE.GATHER;
      s.endsAt = C.GATHER_MS;
      if (by) slotFor(by);
      return true;
    };

    /** A hit on ghost `id` (0 is the boss) for `damage` OBL points by player `by`; returns "kill", "hurt" or "". */
    const hit = (id, damage, by) => {
      if (s.paused || !fighting() || !(damage > 0)) return "";
      const p = playerById(by);
      if (id === 0) {
        if (!s.bossOn || s.bossDyingAt || !bossShown()) return "";
        s.bossHp = Math.max(0, s.bossHp - damage);
        s.bossHitAt = s.now;
        if (s.bossHp > 0) return "hurt";
        s.bossDyingAt = s.now;
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.BURNED);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.BURNED);
        addKills(p, C.BOSS.kills);
        return "kill";
      }
      for (const l of lings) {
        if (!l.on || l.id !== id) continue;
        if (l.dying || l.phase === LING_PHASE.DROP) return "";
        l.hitAt = s.now;
        if (l.hp > damage) { l.hp -= damage; return "hurt"; }
        killLing(l, DYING.SHOT);
        addKills(p, C.LING.kills);
        return "kill";
      }
      for (const b of brutes) {
        if (!b.on || b.id !== id) continue;
        if (b.dying || b.phase < BRUTE_PHASE.FALL) return "";
        b.hitAt = s.now;
        if (b.hp > damage) { b.hp -= damage; return "hurt"; }
        killBrute(b, p && p.kills >= C.PUMPKIN_KILLS ? DYING.PUMPKIN : DYING.SHOT);
        addKills(p, bruteKills(b));
        return "kill";
      }
      let g = null;
      for (const q of ghosts) if (q.on && q.id === id) { g = q; break; }
      if (!g || g.dying) return "";
      const pumpkin = !!p && p.kills >= C.PUMPKIN_KILLS;
      let points = 0, foes = 0;
      const strike = (q, direct) => {
        q.hitAt = s.now;
        if (q.hp <= damage) { kill(q, pumpkin ? DYING.PUMPKIN : DYING.SHOT); points += killValue(q); foes++; return; }
        q.hp -= damage;
        if (direct && p) {
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
          q.kvx = dx / d * C.KNOCK_SPEED; q.kvz = dz / d * C.KNOCK_SPEED; q.knockUntil = s.now + C.KNOCK_MS;
        }
      };
      strike(g, true);
      if (pumpkin) for (const q of ghosts) if (q.on && !q.dying && q !== g && Math.hypot(q.x - g.x, q.z - g.z) <= C.SPLASH_R) strike(q, false);
      addKills(p, points, foes);
      return g.dying ? "kill" : "hurt";
    };

    // ---------- snapshots ----------
    // A hunt as plain numbers: everything `load` needs to go on from here, timers relative to `epoch`.
    const SNAP = { k: "gh", v: 1, e: 0, s: [], g: [], p: [], d: [], q: [], u: [], x: [], l: [], y: [] };
    const snapshot = () => {
      SNAP.e = s.epoch;
      SNAP.s.length = SNAP.g.length = SNAP.p.length = SNAP.d.length = SNAP.q.length = SNAP.u.length = SNAP.x.length = SNAP.l.length = SNAP.y.length = 0;
      for (const f of STATE_FIELDS) SNAP.s.push(s[f]);
      for (const f of STATE_EXTRA) SNAP.y.push(s[f]);
      for (let i = 0; i < ghosts.length; i++) {
        const g = ghosts[i];
        if (!g.on) continue;
        SNAP.g.push(i);
        for (const f of GHOST_FIELDS) SNAP.g.push(g[f]);
      }
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (!p.on) continue;
        SNAP.p.push(i, p.here ? 1 : 0);
        for (const f of PLAYER_FIELDS) SNAP.p.push(p[f]);
        SNAP.x.push(i);
        for (const f of PLAYER_EXTRA) SNAP.x.push(p[f]);
      }
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.on) continue;
        SNAP.d.push(i);
        for (const f of DROP_FIELDS) SNAP.d.push(d[f]);
      }
      for (let i = 0; i < s.pendingCount; i++) SNAP.q.push(s.pending[i]);
      for (let i = 0; i < brutes.length; i++) {
        const b = brutes[i];
        if (!b.on) continue;
        SNAP.u.push(i);
        for (const f of BRUTE_FIELDS) SNAP.u.push(b[f]);
      }
      for (let i = 0; i < lings.length; i++) {
        const l = lings[i];
        if (!l.on) continue;
        SNAP.l.push(i);
        for (const f of LING_FIELDS) SNAP.l.push(l[f]);
      }
      return SNAP;
    };
    const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
    /** Takes a snapshot (another page's, from the network): false, changing nothing, when it is not one. */
    const load = (snap) => {
      if (!snap || snap.v !== 1 || !Array.isArray(snap.s) || snap.s.length !== STATE_FIELDS.length || !Array.isArray(snap.g) || !Array.isArray(snap.p) || !Array.isArray(snap.d)) return false;
      const gw = GHOST_FIELDS.length + 1, pw = PLAYER_FIELDS.length + 2, dw = DROP_FIELDS.length + 1;
      if (snap.g.length % gw || snap.p.length % pw || snap.d.length % dw) return false;
      s.epoch = num(snap.e);
      for (let i = 0; i < STATE_FIELDS.length; i++) s[STATE_FIELDS[i]] = num(snap.s[i]);
      const y = Array.isArray(snap.y) ? snap.y : [];
      for (let i = 0; i < STATE_EXTRA.length; i++) s[STATE_EXTRA[i]] = i < y.length ? num(y[i]) : 0;
      s.state = Math.max(0, Math.min(STATE.GATHER, s.state | 0));
      s.round = Math.max(0, Math.min(ROUNDS.length, s.round | 0));
      s.rng >>>= 0;
      for (const g of ghosts) g.on = false;
      for (let o = 0; o < snap.g.length; o += gw) {
        const g = ghosts[snap.g[o]];
        if (!g) continue;
        g.on = true;
        for (let i = 0; i < GHOST_FIELDS.length; i++) g[GHOST_FIELDS[i]] = num(snap.g[o + 1 + i]);
        g.tier = Math.max(0, Math.min(2, g.tier | 0));
      }
      for (const p of players) p.on = p.here = false;
      for (let o = 0; o < snap.p.length; o += pw) {
        const p = players[snap.p[o]];
        if (!p) continue;
        p.on = true;
        p.here = snap.p[o + 1] === 1;
        for (let i = 0; i < PLAYER_FIELDS.length; i++) p[PLAYER_FIELDS[i]] = num(snap.p[o + 2 + i]);
        for (const f of PLAYER_EXTRA) p[f] = 0;
      }
      const x = Array.isArray(snap.x) ? snap.x : [], xw = PLAYER_EXTRA.length + 1;
      if (x.length % xw === 0) for (let o = 0; o < x.length; o += xw) {
        const p = players[x[o]];
        if (!p || !p.on) continue;
        for (let i = 0; i < PLAYER_EXTRA.length; i++) p[PLAYER_EXTRA[i]] = num(x[o + 1 + i]);
      }
      for (const d of drops) d.on = false;
      for (let o = 0; o < snap.d.length; o += dw) {
        const d = drops[snap.d[o]];
        if (!d) continue;
        d.on = true;
        for (let i = 0; i < DROP_FIELDS.length; i++) d[DROP_FIELDS[i]] = num(snap.d[o + 1 + i]);
        d.kind = Math.max(0, Math.min(DROP.length - 1, d.kind | 0));
      }
      for (const b of brutes) b.on = false;
      const u = Array.isArray(snap.u) ? snap.u : [], bw = BRUTE_FIELDS.length + 1;
      for (let o = 0; o + bw <= u.length; o += bw) {
        const b = brutes[u[o]];
        if (!b) continue;
        b.on = true;
        for (let i = 0; i < BRUTE_FIELDS.length; i++) b[BRUTE_FIELDS[i]] = num(u[o + 1 + i]);
        b.kind = Math.max(0, Math.min(3, b.kind | 0));
      }
      for (const l of lings) l.on = false;
      const ls = Array.isArray(snap.l) ? snap.l : [], lw = LING_FIELDS.length + 1;
      for (let o = 0; o + lw <= ls.length; o += lw) {
        const l = lings[ls[o]];
        if (!l) continue;
        l.on = true;
        for (let i = 0; i < LING_FIELDS.length; i++) l[LING_FIELDS[i]] = num(ls[o + 1 + i]);
      }
      const q = Array.isArray(snap.q) ? snap.q : [];
      s.pendingCount = Math.min(C.MAX_PENDING, q.length);
      for (let i = 0; i < s.pendingCount; i++) s.pending[i] = num(q[i]);
      return true;
    };
    /** Ends the hunt at once, back to IDLE (a follower that lost its host). */
    const clear = () => {
      const lap = s.lapMs;
      reset();
      s.lapMs = lap;
    };
    // ---------- debug (the lab's keys) ----------
    const debug = {
      /** Sends down a drop of `kind` (BL.ghostSim.DROP), as the lab's number keys did. */
      drop: (kind) => s.state !== STATE.IDLE && (kind !== TESS_DROP || !tessOut()) && !!placeDrop(kind),
      /** A ghost of `tier` comes over the crest now. */
      ghost: (tier) => fighting() && spawnGroup(1, () => tier) > 0,
      /** A gorilla is called down beside player `id`. */
      gorilla: (id) => fighting() && !!addBrute(playerById(id) || null),
      /** A skeleton is called down beside player `id`. */
      skeleton: (id) => fighting() && !!addBrute(playerById(id) || null, 1),
      /**
       * A hunt's end to look at (Shift+9): player `id` and each of `rows` ({ id, kills, foes }) seated in the hunt with
       * those points and enemies, the boss gone, and straight to the victory.
       */
      results: (id, mine, rows) => {
        if (s.state === STATE.IDLE) return false;
        const me = slotFor(id);
        if (!me) return false;
        me.inGame = 1; me.kills = mine.kills; me.foes = mine.foes;
        for (const row of rows) {
          const p = slotFor(row.id);
          if (!p) break;
          p.inGame = 1; p.kills = row.kills; p.foes = row.foes;
        }
        s.bossOn = 0; s.kills = 0;
        for (const p of players) if (p.on && p.inGame) s.kills += p.kills;
        return jump(STATE.VICTORY, ROUNDS.length);
      },
      /** An hourglass is called down somewhere open. */
      hourglass: () => fighting() && sendGlass(),
      /** A spider is called down beside player `id`. */
      spider: (id) => fighting() && !!addBrute(playerById(id) || null, 2),
      /**
       * An elixir's revive to watch alone: an elixir for player `id`, and a stand-in hunter (`REVIVE_BOT`, no page behind
       * it, so its caller presents it) down at (x, z). Only while a round runs.
       */
      revive: (id, x, z) => {
        const me = playerById(id);
        if (!fighting() || !me) return false;
        let b = playerById(REVIVE_BOT);
        if (!b) {
          for (const q of players) if (!q.on) { b = q; break; }
          if (!b) return false;
          for (const f of PLAYER_ALL) b[f] = 0;
          b.on = true; b.id = REVIVE_BOT; b.inGame = 1;
        }
        b.here = true; b.x = x; b.y = me.y; b.z = z; b.seg = 0; b.elixir = b.reviveTarget = 0;
        goDown(b);
        me.elixir = 1; me.reviveTarget = 0;
        return true;
      },
      /** The stand-in hunter gone again. */
      dropBot: () => { const b = playerById(REVIVE_BOT); if (b) b.on = b.here = false; },
      /** The round ends: everything spawned and gone (or the wait cut short). */
      next: () => {
        if (s.state === STATE.ACTIVE) {
          s.spawned = settings().ghosts; s.brutesSent = brutesFor(s.round, s.players) + spidersFor(s.round); s.bonesSent = bonesFor(s.round, s.players);
          s.glassesSent = glassesFor(s.round); s.swarmSent = swarmFor(s.players);
          for (const g of ghosts) g.on = false;
          for (const b of brutes) b.on = false;
          for (const l of lings) l.on = false;
        }
        else if (s.state !== STATE.IDLE) s.endsAt = s.now;
      },
      /** Every ghost on the field burns, no kills credited. */
      nuke: () => {
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.BURNED);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.BURNED);
        for (const l of lings) if (l.on && !l.dying) killLing(l, DYING.BURNED);
      },
      /** Player `id` thaws, back to a full bar. */
      unfreeze: (id) => { const p = playerById(id); if (p) { p.frozenUntil = 0; p.seg = C.PLAYER_SEGMENTS; } },
      /** Player `id` is credited `n` kills (drops and pumpkins follow). */
      kills: (id, n) => addKills(playerById(id), n, n)
    };
    /** Moves straight to a state (debug): `round` sets the round for a countdown. */
    const jump = (state, toRound = s.round) => {
      if (s.state === STATE.IDLE) return false;
      s.round = Math.max(1, Math.min(ROUNDS.length, toRound | 0));
      for (const g of ghosts) g.on = false;
      for (const b of brutes) b.on = false;
      for (const l of lings) l.on = false;
      enter(state);
      return true;
    };

    return {
      state: s, ghosts, players, drops, brutes, lings, round, settings, debug, brutesAlive, bossShown, bossNext, halving, beginPresence, present, playerById, advance, start, ready, pause, hit, snapshot, load, clear, jump,
      get ticks() { return ticks; }, get presence() { return presence; },
      frozen: (p) => frozen(p), alive, radiusOf, dawnMs
    };
  };

  BL.ghostSim = { create, STATE, OUTCOME, TIER, LING_PHASE, DROP, TESS_DROP, LIGHTNING_DROP, MONKEY_DROP, DYING, BRUTE_PHASE, ROUNDS, CONFIG, roundSettings, introPages, introMs, weaponTier, hpOf, ghostTier, radiusOf, brutesFor, spidersFor, swarmFor, glassesFor, bonesFor, REVIVE_BOT };
})();
