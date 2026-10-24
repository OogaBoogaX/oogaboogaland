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
  // Per round: total ghosts, most at once, seconds between spawn events, ghosts per event, speed (m/s).
  const ROUNDS = [
    { ghosts: 20, cap: 6, interval: 2.0, group: 1, speed: 1.8 },
    { ghosts: 40, cap: 12, interval: 1.2, group: 2, speed: 2.3 },
    { ghosts: 60, cap: 16, interval: 0.9, group: 3, speed: 2.8 },
    { ghosts: 80, cap: 20, interval: 0.8, group: 3, speed: 3.2 },
    { ghosts: 100, cap: 24, interval: 0.65, group: 4, speed: 3.6 },
    { ghosts: 120, cap: 28, interval: 0.55, group: 4, speed: 4.0 }
  ];
  // Rounds scale with the players counted as each starts (6+ play like 5).
  const PLAYER_SCALING = [null,
    { ghosts: 1.0, cap: 1.0, interval: 1.0, speed: 1.0 },
    { ghosts: 1.4, cap: 1.3, interval: 0.85, speed: 1.05 },
    { ghosts: 1.8, cap: 1.6, interval: 0.75, speed: 1.1 },
    { ghosts: 2.2, cap: 1.9, interval: 0.68, speed: 1.15 },
    { ghosts: 2.6, cap: 2.2, interval: 0.62, speed: 1.2 }];
  const TIER = { PLAIN: 0, GENERAL: 1, WRAITH: 2 };
  // The drops; "tess" stands in the lab's monkey sidearm: Tess comes down, and whoever takes her has her at their side.
  // "lightning" is never a random drop: one comes over the banana pile in each round (LIGHTNING). "monkeys" is a random
  // drop like the first six, the lab's monkey sidearm: taken, a monkey floats at each of its player's hips and fires a
  // rock with each of their shots (the hunt draws and aims them; the sim only keeps who has them, `monkeys`, until a
  // ghost gets them).
  const DROP = ["bomb", "shield", "ice", "health", "double", "tess", "lightning", "monkeys"], TESS_DROP = 5, LIGHTNING_DROP = 6, MONKEY_DROP = 7;
  const DYING = { SHOT: 1, TAGGED: 2, BURNED: 3, PUMPKIN: 4, ZAPPED: 5 };
  // The debug stand-in a revive can be watched on alone (`debug.revive`): a player id no room hands out.
  const REVIVE_BOT = -7;
  const CONFIG = {
    TICK_MS: 50, MAX_GHOSTS: 32, MAX_DROPS: 12, MAX_PLAYERS: 16, MAX_PENDING: 24,
    // The lobby: how long players have to gather and ready up once the herald is woken.
    GATHER_MS: 30000,
    NIGHT_MS: 3500, COUNTDOWN_MS: 4000, BREAK_MS: 6000, BANNER_MS: 10000, DAWN_MS: 6000, ABANDON_MS: 15000,
    // A lost hunt gives the island back sooner: a short banner and a quick dawn.
    DEFEAT_MS: 3000, DAWN_FAST_MS: 2500,
    // A player whose bar empties is down for the rest of the round (`DOWN_UNTIL`, past any round's end) and comes back
    // whole as it ends (a round cleared, the next one called, the sixth giving way to the boss); in the boss's fight,
    // until the hunt ends.
    DOWN_UNTIL: 1e12, PLAYER_SEGMENTS: 5, IFRAMES_MS: 1000,
    GHOST_RADIUS: 0.42, BIG: 1.5, PLAYER_RADIUS: 0.3, SHIELD_PAD: 0.4, BOUNCE_MS: 450, BOUNCE_SPEED: 2.5,
    KNOCK_MS: 140, KNOCK_SPEED: 8, HOVER: 0.3, CLIMB_RATE: 2,
    WEAVE_AMP: 0.85, WEAVE_HZ: 0.4, SEPARATION_PUSH: 1.7, RETARGET_MS: 500, DYING_MS: 1100,
    ARENA_R: 23, LAND_R: 20.5, DESCEND_MS: 1600, SPAWN_SAFE: 6.5, GOLDEN: 137.508 * Math.PI / 180, JITTER: 10 * Math.PI / 180, SPAWN_TRIES: 5,
    HP: [6, 12, 12], KILLS: [1, 2, 2],
    GENERAL_EVERY: 5, GENERAL_FROM: 2, WRAITH_EVERY: 10, WRAITH_FROM: 3, WRAITH_SPEED: 1,
    BEAM: { range: 6.4, breakRange: 9.4, ms: 3000, windMs: 350, cooldownMs: 4000 },
    SOUL: { range: 8.5, breakRange: 17, ms: 1500, windMs: 300, cooldownMs: 4000 },
    BOSS: { ring: 34, y: 8.5, speed: 8.5, spitEvery: 5000, spit: 3, launchMs: 700, launchSpeed: 4, burnMs: 600, kills: 5, hp: 100, hpPerPlayer: 50, hpMax: 300, radius: 2.4, height: 7.6, generals: 20, generalGroup: 4, generalEvery: 6000, generalFirst: 4000 },
    // Every `MONKEY_EVERY_KILLS` of a player's own kills the monkeys come down on them, as though they had taken the drop.
    FIRST_DROPS: 2, MONKEY_EVERY_KILLS: 40, ROUND_DROP_DELAY_MS: 6000, ROUND_DROP_GAP_MS: 150, FALL_MS: 850, PICKUP_R: 1.0,
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
    // the first zap waits `firstMs`. A ghost that gets her player sends her away, as the lab's monkey went.
    TESS: { range: 8.5, reach: 4, cooldownMs: 2000, firstMs: 600, brute: 12 },
    // The gorillas: green, 80 health, sent when a round is down to its last two ghosts (never in the boss's
    // fight), `perRound[round - 1]` of them. Each is called down by a beam (`beamMs`), drops (`fallMs`) and lands
    // shaking (`shakeMs`), then comes at the nearest player; within `reach` it leaps at them (`leapMs`, `leapH` high),
    // lands `beside` them and slams the ground, every player within `splashR` of the slam losing `damage` segments, then
    // gathers itself (`recoverMs`).
    BRUTE: { max: 10, hp: 80, kills: 3, speed: 6.2, beamMs: 1300, fallMs: 450, fallFrom: 25, shakeMs: 1000, reach: 5, leapMs: 650, leapH: 2.4, beside: 1,
      splashR: 2.6, recoverMs: 1400, damage: 1, perRound: [1, 1, 1, 2, 2, 2], landMin: 4, landMax: 7, landR: 18, radius: 0.7 },
    // The elixirs: one glowing on each totem pole's front (`elixirs` where they hang), set out afresh as each round
    // starts. An active player who comes within `pickR` of one (carrying none) takes it; carrying one, standing within
    // `reviveR` of a player who is down for `reviveMs` brings them back whole (`IFRAMES_MS` twice over to find their
    // feet), and the elixir is spent.
    ELIXIR: { max: 4, pickR: 1.3, reviveR: 1.8, reviveMs: 4000 },
    // The skeletons: a plain ghost's health, each in a gorilla's slot (`kind` 1, so the gorillas' beam, hits, bolts, bomb
    // and Tess all take it). From the second round, `perRound[round - 1]` of them and one more for every `perPlayers`
    // players past the first (`bonesFor`), each called down in a white beam at its own point in the round, spread
    // evenly through its ghosts' coming. One drops (`fallMs`) and crawls at the nearest player at once (only its upper
    // body, pulling itself along by its arms); within `reach` it lunges up at them and bites for `damage` segments (a
    // shield throws it back), then gathers itself (`recoverMs`).
    BONES: { hp: 6, kills: 1, speed: 3.2, beamMs: 1300, fallMs: 450, fallFrom: 25, reach: 1.6, recoverMs: 1000, damage: 1, perRound: [0, 2, 3, 4, 5, 6], perPlayers: 2 }
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
  const isWraith = (n, round) => round >= C.WRAITH_FROM && n % C.WRAITH_EVERY === C.WRAITH_EVERY - 1;
  const ghostTier = (n, round) => isWraith(n, round) ? TIER.WRAITH : round >= C.GENERAL_FROM && n % C.GENERAL_EVERY === C.GENERAL_EVERY - 1 ? TIER.GENERAL : TIER.PLAIN;
  const radiusOf = (tier) => C.GHOST_RADIUS * (tier === TIER.PLAIN ? 1 : C.BIG);
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
  const DROP_FIELDS = ["id", "kind", "x", "z", "at"];
  // A gorilla's phase: 1 called down (the beam), 2 falling, 3 landed and shaking, 4 coming, 5 holding someone, 6 gathering.
  // A skeleton (`kind` 1) skips the shaking and the leap: it strikes from CHASE and gathers itself in RECOVER.
  const BRUTE_PHASE = { BEAM: 1, FALL: 2, SHAKE: 3, CHASE: 4, LEAP: 5, RECOVER: 6 };
  const BRUTE_FIELDS = ["id", "x", "y", "z", "hp", "phase", "phaseAt", "target", "heading", "dying", "dyingAt", "hitAt", "slamAt", "fromX", "fromY", "fromZ", "toX", "toY", "toZ", "struckAt", "kind"];
  const STATE_FIELDS = ["state", "outcome", "round", "endsAt", "spawned", "players", "lapAt", "lapMs", "now", "rng", "seqN", "theta0",
    "lastSpawnAt", "nextId", "emptySince", "shieldUntil", "slowUntil", "kills", "bombAt", "pickAt", "pickKind", "pickBy", "pendingCount", "brutesSent",
    "bossOn", "bossA", "bossTa", "bossX", "bossZ", "bossHp", "bossMax", "bossNextSpit", "bossGenerals", "bossNextGeneral", "bossDyingAt", "bossHitAt", "spitAt", "startedBy", "paused", "pausedFor", "healAt",
    "lightningSent", "boltAt", "boltBy", "bossStruckAt", "bonesSent", "elixirsTaken", "reviveAt", "reviveBy", "reviveOf"];

  const newGhost = () => {
    const g = { on: false };
    for (const f of GHOST_FIELDS) g[f] = 0;
    return g;
  };
  const newPlayer = () => {
    const p = { on: false, here: false };
    for (const f of PLAYER_FIELDS) p[f] = 0;
    return p;
  };
  const newBrute = () => {
    const b = { on: false };
    for (const f of BRUTE_FIELDS) b[f] = 0;
    return b;
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
    for (const f of STATE_FIELDS) s[f] = 0;
    const ghosts = Array.from({ length: C.MAX_GHOSTS }, newGhost);
    const players = Array.from({ length: C.MAX_PLAYERS }, newPlayer);
    const drops = Array.from({ length: C.MAX_DROPS }, newDrop);
    const brutes = Array.from({ length: C.BRUTE.max }, newBrute);
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
      for (const f of STATE_FIELDS) if (f !== "lapMs" && f !== "now") s[f] = 0;
      for (const g of ghosts) g.on = false;
      for (const p of players) p.on = p.here = false;
      for (const d of drops) d.on = false;
      for (const b of brutes) b.on = false;
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
      for (const f of PLAYER_FIELDS) p[f] = 0;
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
      p.tess = 0;
      p.monkeys = 0;
      p.seg = Math.max(0, p.seg - 1);
      p.invulnUntil = s.now + C.IFRAMES_MS;
      p.hitAt = s.now; p.hitX = gx; p.hitZ = gz;
      if (p.seg === 0) p.frozenUntil = C.DOWN_UNTIL;
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
    const queueRoundDrops = () => {
      const n = Math.max(0, 4 * s.round - 2);
      for (let i = 0; i < n && s.pendingCount < C.MAX_PENDING; i++) s.pending[s.pendingCount++] = s.now + C.ROUND_DROP_DELAY_MS + i * C.ROUND_DROP_GAP_MS;
    };
    const addKills = (p, n) => {
      if (n <= 0) return;
      if (p && s.now < p.doubleUntil) n *= 2;
      s.kills += n;
      if (!p) return;
      p.kills += n;
      const earned = Math.floor(p.kills / C.MONKEY_EVERY_KILLS);
      for (; p.dropsGiven < earned; p.dropsGiven++) { p.monkeys = 1; s.pickAt = s.now; s.pickKind = MONKEY_DROP; s.pickBy = p.id; }
    };
    const killValue = (g) => C.KILLS[g.tier];
    const kill = (g, kind) => {
      g.dying = kind;
      g.dyingAt = s.now;
      g.beamTarget = g.soulTarget = 0;
    };
    const take = (d, p) => {
      d.on = false;
      s.pickAt = s.now; s.pickKind = d.kind; s.pickBy = p.id;
      if (d.kind === 0) {
        s.bombAt = s.now;
        let points = 0;
        for (const g of ghosts) if (g.on && !g.dying) { kill(g, DYING.BURNED); points += killValue(g); }
        for (const b of brutes) if (b.on && !b.dying) { killBrute(b, DYING.BURNED); points += bruteKills(b); }
        if (s.bossOn && !s.bossDyingAt) {
          s.bossHp = Math.max(1, s.bossHp - Math.ceil(s.bossMax * C.BOMB_BOSS));
          s.bossHitAt = s.now;
        }
        addKills(p, points);
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
        g.hp = C.HP[tier];
        return g;
      }
      return null;
    };
    // ---------- gorillas ----------
    const killBrute = (b, kind) => { b.dying = kind; b.dyingAt = s.now; };
    // A gorilla's settings, or a skeleton's, and what killing it is worth.
    const kindOf = (b) => b.kind ? C.BONES : C.BRUTE;
    const bruteKills = (b) => kindOf(b).kills;
    // ---------- the lightning drop ----------
    // Every ghost and landed gorilla gets its bolt in turn, the boss his.
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
    };
    // Struck and crackling: held where it is, harmless, and dead once its zap is done (true while held).
    const struck = (e, now) => e.struckAt > 0 && now >= e.struckAt;
    const brutesAlive = () => {
      let n = 0;
      for (const b of brutes) if (b.on && !b.dying) n++;
      return n;
    };
    /** A gorilla (or with `kind` 1 a skeleton) called down beside player `p` (or anywhere when there is none). */
    const addBrute = (p, kind = 0) => {
      for (const b of brutes) {
        if (b.on) continue;
        for (const f of BRUTE_FIELDS) b[f] = 0;
        const a = rand() * TAU, r = C.BRUTE.landMin + rand() * (C.BRUTE.landMax - C.BRUTE.landMin);
        let x = (p ? p.x : 0) + Math.sin(a) * r, z = (p ? p.z : 0) - Math.cos(a) * r;
        const out = Math.hypot(x, z);
        if (out > C.BRUTE.landR) { x *= C.BRUTE.landR / out; z *= C.BRUTE.landR / out; }
        b.on = true; b.id = s.nextId++; b.x = x; b.z = z; b.kind = kind; b.y = kindOf(b).fallFrom; b.hp = kindOf(b).hp;
        b.phase = BRUTE_PHASE.BEAM; b.phaseAt = s.now;
        b.heading = p ? Math.atan2(p.x - x, p.z - z) : 0;
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
    const bossTarget = (from) => from + (Math.PI / 2 + rand() * Math.PI) * (rand() < 0.5 ? 1 : -1);

    // ---------- the machine ----------
    const enter = (state) => {
      const prev = s.state;
      s.state = state;
      const roundOver = state === STATE.COUNTDOWN || state === STATE.BREAK || state === STATE.BOSS && prev === STATE.ACTIVE;
      if (roundOver) {
        // A round over (the sixth goes straight to the boss), or a new one called: everyone down is back, and everyone
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
      if (state === STATE.COUNTDOWN) { s.endsAt = s.now + C.COUNTDOWN_MS; s.spawned = 0; }
      else if (state === STATE.ACTIVE) {
        let n = 0;
        for (const p of players) if (p.on && p.here) n++;
        s.players = Math.max(1, n);
        s.seqN = 0; s.theta0 = rand() * TAU; s.lastSpawnAt = -1e9; s.endsAt = 0; s.brutesSent = 0; s.bonesSent = 0; s.lightningSent = 0;
        if (s.round === 1) for (let i = 0; i < C.FIRST_DROPS; i++) dropRandom();
        if (s.round === 3 && !dropsOf(1)) placeDrop(1);
        if (s.round === 4 && !dropsOf(2)) placeDrop(2);
      } else if (state === STATE.BREAK) s.endsAt = s.now + C.BREAK_MS;
      else if (state === STATE.BOSS) {
        let n = 0;
        for (const p of players) if (p.on && p.here) n++;
        s.bossOn = 1;
        s.bossA = 0; s.bossTa = bossTarget(0);
        s.bossX = 0; s.bossZ = -C.BOSS.ring;
        s.bossMax = s.bossHp = Math.min(C.BOSS.hpMax, C.BOSS.hp + C.BOSS.hpPerPlayer * Math.max(0, n - 1));
        s.bossNextSpit = s.now + 2000; s.bossGenerals = 0; s.bossNextGeneral = s.now + C.BOSS.generalFirst; s.bossDyingAt = 0;
        s.lightningSent = 0; s.bossStruckAt = 0;
      } else if (state === STATE.VICTORY || state === STATE.DEFEAT) {
        s.outcome = state === STATE.VICTORY ? OUTCOME.VICTORY : OUTCOME.DEFEAT;
        s.endsAt = s.now + (state === STATE.DEFEAT ? C.DEFEAT_MS : C.BANNER_MS);
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.SHOT);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.SHOT);
        if (state === STATE.DEFEAT) s.bossOn = 0;
      } else if (state === STATE.DAWN) {
        s.endsAt = s.now + dawnMs();
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.SHOT);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.SHOT);
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
      // Pending round drops, oldest first.
      while (s.pendingCount && now >= s.pending[0]) {
        for (let i = 1; i < s.pendingCount; i++) s.pending[i - 1] = s.pending[i];
        s.pendingCount--;
        dropRandom();
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

      // The boss: dashes between stops round the ring outside the bluff and spits ghosts over it.
      if (s.bossOn && s.state === STATE.BOSS && !s.bossDyingAt) {
        const stepA = C.BOSS.speed * (slowed ? C.ICE_SLOW : 1) * dt / C.BOSS.ring, left = s.bossTa - s.bossA;
        if (Math.abs(left) <= stepA) { s.bossA = s.bossTa; s.bossTa = bossTarget(s.bossA); }
        else s.bossA += Math.sign(left) * stepA;
        s.bossX = Math.sin(s.bossA) * C.BOSS.ring; s.bossZ = -Math.cos(s.bossA) * C.BOSS.ring;
        if (now >= s.bossNextSpit) {
          s.bossNextSpit = now + C.BOSS.spitEvery;
          s.spitAt = now;
          const toward = Math.atan2(-s.bossX, -s.bossZ);
          for (let i = 0; i < C.BOSS.spit; i++) {
            const a = toward + (i - 1) * 0.35, vx = Math.sin(a), vz = Math.cos(a);
            const g = addGhost(TIER.PLAIN, s.bossX + vx * 1.7, C.BOSS.y + 4, s.bossZ + vz * 1.7, 0, 0);
            if (!g) break;
            g.spawnAt = now - C.DESCEND_MS;
            g.bvx = vx; g.bvz = vz; g.bounceUntil = now + C.BOSS.launchMs; g.bounceSpeed = C.BOSS.launchSpeed;
          }
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

      // Drops: the first player to walk into a landed one takes it; the lightning, the first to reach the pile under it.
      if (fighting()) {
        for (const d of drops) {
          if (!d.on || now < d.at + C.FALL_MS) continue;
          const reach = d.kind === LIGHTNING_DROP ? pile.r : C.PICKUP_R + C.PLAYER_RADIUS;
          for (const p of players) {
            if (!active(p) || Math.hypot(p.x - d.x, p.z - d.z) > reach) continue;
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
      const gorillas = C.BRUTE.perRound[s.round - 1] || 0;
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
          if (k >= 1) { b.y = 0; b.phase = b.kind ? BRUTE_PHASE.CHASE : BRUTE_PHASE.SHAKE; b.phaseAt = now; }
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
        // Coming on: at the nearest player, slowed by the ice, kept apart from the others.
        const t = nearestPlayer(b.x, b.z);
        b.target = t ? t.id : 0;
        if (!t || !fighting()) continue;
        let dx = t.x - b.x, dz = t.z - b.z;
        const d = Math.hypot(dx, dz);
        // A skeleton within reach strikes them where they stand (a shield throws it back, a fresh hurt keeps them up).
        if (b.kind && d <= C.BONES.reach && Math.abs(t.y - b.y) < 1.5) {
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
          if (q === p || !q.on || !q.here || !frozen(q)) continue;
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d <= best) { best = d; near = q; }
        }
        if (!near) { p.reviveTarget = 0; continue; }
        if (p.reviveTarget !== near.id) { p.reviveTarget = near.id; p.reviveSince = now; continue; }
        if (now - p.reviveSince < C.ELIXIR.reviveMs) continue;
        near.frozenUntil = 0; near.seg = C.PLAYER_SEGMENTS; near.invulnUntil = now + C.IFRAMES_MS * 2;
        p.elixir = 0; p.reviveTarget = 0;
        s.reviveAt = now; s.reviveBy = p.id; s.reviveOf = near.id;
      }

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
      else if (st === STATE.COUNTDOWN) { if (now >= s.endsAt) enter(STATE.ACTIVE); }
      else if (st === STATE.ACTIVE) {
        if (anyHere && !anyActive) enter(STATE.DEFEAT);
        else if (s.spawned >= r.ghosts && alive() === 0 && brutesAlive() === 0 && s.brutesSent >= gorillas && s.bonesSent >= bones) enter(s.round >= ROUNDS.length ? STATE.BOSS : STATE.BREAK);
      } else if (st === STATE.BOSS) {
        if (anyHere && !anyActive) enter(STATE.DEFEAT);
        else if (s.bossDyingAt && now - s.bossDyingAt >= C.BOSS.burnMs) { s.bossOn = 0; enter(STATE.VICTORY); }
      } else if (st === STATE.BREAK) { if (now >= s.endsAt) { s.round++; enter(STATE.COUNTDOWN); } }
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
     * (debug only skips ahead), follows only once the host has readied up. `by` 0 (debug) opens it with no host.
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
        if (!s.bossOn || s.bossDyingAt) return "";
        s.bossHp = Math.max(0, s.bossHp - damage);
        s.bossHitAt = s.now;
        if (s.bossHp > 0) return "hurt";
        s.bossDyingAt = s.now;
        for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.BURNED);
        for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.BURNED);
        addKills(p, C.BOSS.kills);
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
      let points = 0;
      const strike = (q, direct) => {
        q.hitAt = s.now;
        if (q.hp <= damage) { kill(q, pumpkin ? DYING.PUMPKIN : DYING.SHOT); points += killValue(q); return; }
        q.hp -= damage;
        if (direct && p) {
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
          q.kvx = dx / d * C.KNOCK_SPEED; q.kvz = dz / d * C.KNOCK_SPEED; q.knockUntil = s.now + C.KNOCK_MS;
        }
      };
      strike(g, true);
      if (pumpkin) for (const q of ghosts) if (q.on && !q.dying && q !== g && Math.hypot(q.x - g.x, q.z - g.z) <= C.SPLASH_R) strike(q, false);
      addKills(p, points);
      return g.dying ? "kill" : "hurt";
    };

    // ---------- snapshots ----------
    // A hunt as plain numbers: everything `load` needs to go on from here, timers relative to `epoch`.
    const SNAP = { k: "gh", v: 1, e: 0, s: [], g: [], p: [], d: [], q: [], u: [] };
    const snapshot = () => {
      SNAP.e = s.epoch;
      SNAP.s.length = SNAP.g.length = SNAP.p.length = SNAP.d.length = SNAP.q.length = SNAP.u.length = 0;
      for (const f of STATE_FIELDS) SNAP.s.push(s[f]);
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
        b.kind = b.kind ? 1 : 0;
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
          for (const f of PLAYER_FIELDS) b[f] = 0;
          b.on = true; b.id = REVIVE_BOT; b.inGame = 1;
        }
        b.here = true; b.x = x; b.y = me.y; b.z = z; b.seg = 0; b.frozenUntil = C.DOWN_UNTIL; b.elixir = b.reviveTarget = 0;
        me.elixir = 1; me.reviveTarget = 0;
        return true;
      },
      /** The stand-in hunter gone again. */
      dropBot: () => { const b = playerById(REVIVE_BOT); if (b) b.on = b.here = false; },
      /** The round ends: everything spawned and gone (or the wait cut short). */
      next: () => {
        if (s.state === STATE.ACTIVE) {
          s.spawned = settings().ghosts; s.brutesSent = C.BRUTE.perRound[s.round - 1] || 0; s.bonesSent = bonesFor(s.round, s.players);
          for (const g of ghosts) g.on = false;
          for (const b of brutes) b.on = false;
        }
        else if (s.state !== STATE.IDLE) s.endsAt = s.now;
      },
      /** Every ghost on the field burns, no kills credited. */
      nuke: () => { for (const g of ghosts) if (g.on && !g.dying) kill(g, DYING.BURNED); for (const b of brutes) if (b.on && !b.dying) killBrute(b, DYING.BURNED); },
      /** Player `id` thaws, back to a full bar. */
      unfreeze: (id) => { const p = playerById(id); if (p) { p.frozenUntil = 0; p.seg = C.PLAYER_SEGMENTS; } },
      /** Player `id` is credited `n` kills (drops and pumpkins follow). */
      kills: (id, n) => addKills(playerById(id), n)
    };
    /** Moves straight to a state (debug): `round` sets the round for a countdown. */
    const jump = (state, toRound = s.round) => {
      if (s.state === STATE.IDLE) return false;
      s.round = Math.max(1, Math.min(ROUNDS.length, toRound | 0));
      for (const g of ghosts) g.on = false;
      for (const b of brutes) b.on = false;
      enter(state);
      return true;
    };

    return {
      state: s, ghosts, players, drops, brutes, round, settings, debug, brutesAlive, beginPresence, present, playerById, advance, start, ready, pause, hit, snapshot, load, clear, jump,
      get ticks() { return ticks; }, get presence() { return presence; },
      frozen: (p) => frozen(p), alive, radiusOf, dawnMs
    };
  };

  BL.ghostSim = { create, STATE, OUTCOME, TIER, DROP, TESS_DROP, LIGHTNING_DROP, MONKEY_DROP, DYING, BRUTE_PHASE, ROUNDS, CONFIG, roundSettings, ghostTier, radiusOf, bonesFor, REVIVE_BOT };
})();
