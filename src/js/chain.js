// The chain snapshot: one bounded view of the Bitcoin mempool, blocks and mining, assembled from
// whichever provider answers. The mempool.space websocket in mempool.js stays the live transport for
// transactions and blocks; this module adds the standing numbers the socket never sends (the backlog,
// the fee ladder, difficulty, hashrate, price) by polling REST while the tab is visible.
//
// Two providers, one code path. `/mempool`, `/mempool/recent`, `/blocks` and `/blocks/tip/height`
// return the same shapes from mempool.space and from any Esplora instance, so the fallback is a base
// URL swap; the mempool.space-only endpoints are dropped for ten minutes when they fail and tried
// again after. Every reader tolerates a missing field rather than branching.
//
// Polite by construction: one poll of a kind at a time, each cycle rescheduling from its own
// completion, every failure widening the gap, and Retry-After obeyed when a provider sends one.
//
// Nothing here allocates per frame: the snapshot is one object mutated in place and the fee ladder is
// a fixed typed array. Weather reads the three derived axes at the foot of the snapshot.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const MEMPOOL = "https://mempool.space/api", ESPLORA = "https://blockstream.info/api";
  // The backlog drives the weather, so it is polled hardest; the epoch numbers move once a block at most.
  const BACKLOG_MS = 30000, BLOCKS_MS = 60000, SLOW_MS = 600000;
  const TIMEOUT_MS = 12000, FAIL_LIMIT = 3;
  const BACKOFF_MIN = 15000, BACKOFF_MAX = 300000, EXTENDED_RETRY = 600000, PREFER_RETRY = 900000;
  const LADDER = 24, LADDER_MAX = 200;
  const PACE_BLOCKS = 6, PACE_WARM = 540, PACE_COLD = 240, TARGET_BLOCK = 600;
  const RATE_WINDOW = 20000, RATE_FULL = 12;
  const SUNNY_FEE = 0.1, STORM_FEE = 20, DEEP_FULL = 60;
  const BACKLOG_MIX = 0.6;
  // Price rides its own providers, not the chain's: the Esplora fallback has no prices endpoint, and
  // tying the two would lose the ticker exactly when the chain source degraded. First one to answer wins.
  const PRICE_SOURCES = [
    { name: "coinbase", url: "https://api.coinbase.com/v2/prices/BTC-USD/spot", read: (d) => Number(d && d.data && d.data.amount) },
    { name: "kraken", url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD", read: (d) => Number(d && d.result && d.result.XXBTZUSD && d.result.XXBTZUSD.c && d.result.XXBTZUSD.c[0]) },
    { name: "mempool.space", url: "https://mempool.space/api/v1/prices", read: (d) => Number(d && d.USD) }
  ];

  // The fee ladder, downsampled from an unbounded histogram into fixed rungs: sat/vB on a log scale
  // against the vsize waiting at or above that rate, normalized to the fullest rung.
  const ladder = new Float32Array(LADDER);
  const ladderRate = new Float32Array(LADDER);
  for (let i = 0; i < LADDER; i++) ladderRate[i] = Math.pow(LADDER_MAX, i / (LADDER - 1));

  const snapshot = {
    source: "mempool.space", at: 0, polls: 0, errors: 0, degraded: false, backoff: 0,
    // Mempool backlog
    count: 0, vsize: 0, totalFee: 0, deep: 0, floor: 0, ladder, ladderRate,
    // Fees
    nextFee: 0, fastestFee: 0, halfHourFee: 0, hourFee: 0, economyFee: 0, minimumFee: 0,
    // Chain
    height: 0, lastTxCount: 0, lastWeight: 0, lastSize: 0, lastBlockAt: 0, pace: TARGET_BLOCK,
    // Mining and market
    progressPercent: 0, difficultyChange: 0, remainingBlocks: 0, remainingTime: 0,
    hashrate: 0, difficulty: 0, priceUsd: 0, priceSource: null,
    // Derived weather axes, 0..1
    soak: 0, chill: 0, gale: 0
  };
  // Read, never stored: `derive` only runs after a poll lands, so a stored flag on a feed that has
  // stopped entirely would sit there claiming to be live for the rest of the visit.
  Object.defineProperty(snapshot, "live", {
    enumerable: true,
    get: () => snapshot.at > 0 && Date.now() - snapshot.at < BACKLOG_MS * 3
  });

  const subscribers = new Set();
  let base = MEMPOOL, fails = 0, pinned = false, backoff = 0;
  // mempool.space's own endpoints, dropped for a while by a failure rather than for the session: one
  // transient 500 must not cost the visit its fee tiers, its difficulty and its hashrate. Infinity is
  // the Esplora fallback, which genuinely does not serve them.
  let extendedUntil = 0, preferAt = 0;
  const extended = () => base === MEMPOOL && Date.now() >= extendedUntil;
  const dropExtended = () => {
    extendedUntil = Date.now() + EXTENDED_RETRY;
  };
  const timers = { backlog: 0, blocks: 0, slow: 0, block: 0 };
  let started = false;
  let unsubscribeFeed = null;
  // Transaction arrivals in a rolling window, as a ring of timestamps: fixed size, never grows.
  const arrivals = new Float64Array(256);
  let arrivalHead = 0, arrivalCount = 0;

  // Announces a change. It does not stamp freshness: a failover or a recovery is news, but it is not
  // data, and `snapshot.at` only ever moves when a poll actually lands (see `succeeded`).
  const emit = () => {
    for (const fn of subscribers) fn(snapshot);
  };
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

  const getUrl = async (url) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) {
        // A provider asking us to wait is obeyed, not argued with: 429 and 503 may carry Retry-After.
        const error = new Error(String(res.status));
        error.status = res.status;
        const after = Number(res.headers.get("retry-after"));
        if (after > 0) error.retryAfter = Math.min(BACKOFF_MAX, after * 1000);
        throw error;
      }
      return await res.json();
    } finally {
      window.clearTimeout(timer);
    }
  };
  const get = (path) => getUrl(`${base}${path}`);
  // Three consecutive failures on the preferred provider hand the session to Esplora; a pinned
  // provider never switches, it just keeps failing quietly and the island keeps its last numbers.
  // Every failure pushes the next poll of every kind further out, so a provider that is down or rate
  // limiting is asked less often rather than exactly as often. The first success clears it.
  const failed = (error) => {
    snapshot.errors++;
    const wait = error && error.retryAfter;
    backoff = Math.min(BACKOFF_MAX, wait || (backoff ? backoff * 2 : BACKOFF_MIN));
    snapshot.backoff = backoff;
    // A 429 is an explicit request to stop, so it moves the session at once; anything else has to
    // happen three times running before one bad answer can cost the preferred provider.
    const limited = error && error.status === 429;
    if (pinned || base === ESPLORA || (!limited && ++fails < FAIL_LIMIT)) return;
    base = ESPLORA;
    extendedUntil = Infinity;
    fails = 0;
    preferAt = Date.now() + PREFER_RETRY;
    snapshot.source = "esplora";
    snapshot.degraded = true;
    // The wait was the old provider's request, not the new one's, so the fallback is asked at once.
    // Deferred a tick: this runs inside a poll that still holds its own guard.
    backoff = 0;
    snapshot.backoff = 0;
    emit();
    window.setTimeout(() => {
      pollBacklog();
      pollBlocks();
    }, 0);
  };
  // The fallback is where a session waits, not where it stays. Every so often the preferred provider
  // is probed with its cheapest endpoint, and the moment it answers the session goes home and gets its
  // fee tiers, difficulty and hashrate back. A probe costs one request a quarter hour at most.
  const recover = async () => {
    if (pinned || base !== ESPLORA || Date.now() < preferAt) return;
    preferAt = Date.now() + PREFER_RETRY;
    try {
      const height = await getUrl(`${MEMPOOL}/blocks/tip/height`);
      if (!(Number(height) > 0)) return;
      base = MEMPOOL;
      extendedUntil = 0;
      fails = 0;
      backoff = 0;
      snapshot.backoff = 0;
      snapshot.source = "mempool.space";
      snapshot.degraded = false;
      emit();
      // The fee tiers came back with the provider; fetch them now rather than a cycle from now.
      window.setTimeout(pollBacklog, 0);
    } catch {
      // Still out. The fallback keeps serving and the next window tries again.
    }
  };
  const succeeded = () => {
    fails = 0;
    backoff = 0;
    snapshot.backoff = 0;
    snapshot.polls++;
    snapshot.at = Date.now();
  };

  // vsize at or above each rung, from [feerate, vsize] buckets in descending feerate order.
  const readHistogram = (histogram) => {
    ladder.fill(0);
    if (!Array.isArray(histogram) || !histogram.length) return;
    let lowest = Infinity, peak = 0;
    for (const bucket of histogram) {
      if (!Array.isArray(bucket) || bucket.length < 2) continue;
      const rate = Number(bucket[0]), size = Number(bucket[1]);
      if (!(rate >= 0) || !(size > 0)) continue;
      if (rate < lowest) lowest = rate;
      for (let i = 0; i < LADDER; i++) if (rate >= ladderRate[i]) ladder[i] += size;
    }
    for (let i = 0; i < LADDER; i++) if (ladder[i] > peak) peak = ladder[i];
    if (peak > 0) for (let i = 0; i < LADDER; i++) ladder[i] /= peak;
    snapshot.floor = Number.isFinite(lowest) ? lowest : 0;
  };

  const readBacklog = (data) => {
    if (!data || typeof data !== "object") return false;
    // Shape, never value: a drained mempool really does report zero, so only a missing field is bad.
    if (typeof data.count !== "number" || typeof data.vsize !== "number") return false;
    snapshot.count = data.count | 0;
    snapshot.vsize = Number(data.vsize) || 0;
    snapshot.totalFee = Number(data.total_fee) || 0;
    snapshot.deep = snapshot.vsize / 1e6;
    readHistogram(data.fee_histogram);
    return true;
  };
  // Block pace over the recent tip, the one "temperature" both providers can answer. Poisson spacing
  // swings this around well past the ten-minute target, which is what gives the island its seasons.
  const readBlocks = (blocks) => {
    if (!Array.isArray(blocks) || !blocks.length) return false;
    const tip = blocks[0];
    if (tip && tip.height > 0) {
      snapshot.height = tip.height | 0;
      snapshot.lastTxCount = tip.tx_count | 0;
      snapshot.lastWeight = tip.weight | 0;
      snapshot.lastSize = tip.size | 0;
      snapshot.lastBlockAt = (tip.timestamp | 0) * 1000;
    }
    const span = Math.min(PACE_BLOCKS, blocks.length - 1);
    if (span > 0) {
      const newest = blocks[0].timestamp | 0, oldest = blocks[span].timestamp | 0;
      if (newest > oldest) snapshot.pace = (newest - oldest) / span;
    }
    return true;
  };
  const readFees = (projection) => {
    if (!Array.isArray(projection)) return;
    // An empty projection is an empty mempool, which is free; a missing key holds the last reading.
    const first = projection[0];
    snapshot.nextFee = first && first.medianFee > 0 ? first.medianFee : 0;
  };
  const readRecommended = (fees) => {
    if (!fees || typeof fees !== "object") return;
    snapshot.fastestFee = Number(fees.fastestFee) || 0;
    snapshot.halfHourFee = Number(fees.halfHourFee) || 0;
    snapshot.hourFee = Number(fees.hourFee) || 0;
    snapshot.economyFee = Number(fees.economyFee) || 0;
    snapshot.minimumFee = Number(fees.minimumFee) || 0;
  };
  // Esplora's estimates are a confirmation-target map, not tiers; the same five readings come out of it.
  const readEstimates = (est) => {
    if (!est || typeof est !== "object") return;
    const at = (t) => Number(est[t]) || 0;
    snapshot.fastestFee = at(1);
    snapshot.halfHourFee = at(3);
    snapshot.hourFee = at(6);
    snapshot.economyFee = at(144);
    snapshot.minimumFee = at(1008);
    if (!snapshot.nextFee) snapshot.nextFee = at(1);
  };
  const readDifficulty = (d) => {
    if (!d || typeof d !== "object") return;
    snapshot.progressPercent = Number(d.progressPercent) || 0;
    snapshot.difficultyChange = Number(d.difficultyChange) || 0;
    snapshot.remainingBlocks = d.remainingBlocks | 0;
    snapshot.remainingTime = Number(d.remainingTime) || 0;
  };
  const readHashrate = (h) => {
    if (!h || typeof h !== "object") return;
    snapshot.hashrate = Number(h.currentHashrate) || 0;
    snapshot.difficulty = Number(h.currentDifficulty) || 0;
  };
  // Walk the price providers in order and keep the first sane answer; a total outage holds the last
  // price rather than blanking the tablet, and nothing about the visitor is ever sent.
  const pollPrice = async () => {
    for (const source of PRICE_SOURCES) {
      try {
        const value = source.read(await getUrl(source.url));
        if (!(value > 0)) continue;
        snapshot.priceUsd = value;
        snapshot.priceSource = source.name;
        return true;
      } catch {
        // Try the next one; a dead ticker must never take the chain poll down with it.
      }
    }
    return false;
  };

  // Fee pressure and backlog depth both on log scales, mixed; the backlog leads because a deep pool
  // of cheap transactions is still a storm coming.
  const feePressure = (fee) => clamp(Math.log(Math.max(SUNNY_FEE, fee) / SUNNY_FEE) / Math.log(STORM_FEE / SUNNY_FEE), 0, 1);
  const deepPressure = (deep) => clamp(Math.log(Math.max(1, deep)) / Math.log(DEEP_FULL), 0, 1);
  const arrivalRate = (now) => {
    let n = 0;
    for (let i = 0; i < arrivalCount; i++) if (now - arrivals[i] <= RATE_WINDOW) n++;
    return n / (RATE_WINDOW / 1000);
  };
  const derive = () => {
    const now = Date.now();
    snapshot.soak = clamp(BACKLOG_MIX * deepPressure(snapshot.deep) + (1 - BACKLOG_MIX) * feePressure(snapshot.nextFee), 0, 1);
    // Slow blocks are a cold snap; a negative retarget says the epoch ran slow overall and leans the same way.
    const pace = clamp((snapshot.pace - PACE_WARM) / PACE_COLD, 0, 1);
    const epoch = extended() ? clamp(-snapshot.difficultyChange / 8, -0.2, 0.2) : 0;
    snapshot.chill = clamp(pace + epoch, 0, 1);
    snapshot.gale = clamp(arrivalRate(now) / RATE_FULL, 0, 1);
  };

  // One poll of a kind at a time. Each takes several requests in sequence and the slowest can outrun
  // its own interval, so without this a slow provider would have requests stacked on it exactly when
  // it is least able to answer them — the shape that gets a client rate limited.
  const busy = { backlog: false, blocks: false, slow: false };
  const guard = (key, body) => async () => {
    if (busy[key]) return;
    busy[key] = true;
    try {
      await body();
    } finally {
      busy[key] = false;
    }
  };

  const pollBacklog = guard("backlog", async () => {
    try {
      if (!readBacklog(await get("/mempool"))) throw new Error("no backlog in the response");
      if (extended()) {
        try {
          readFees(await get("/v1/fees/mempool-blocks"));
          readRecommended(await get("/v1/fees/recommended"));
        } catch {
          dropExtended();
        }
      }
      if (!extended()) readEstimates(await get("/fee-estimates"));
      succeeded();
      derive();
      emit();
      save();
    } catch (error) {
      failed(error);
    }
  });
  const pollBlocks = guard("blocks", async () => {
    await recover();
    try {
      if (!readBlocks(await get("/blocks"))) throw new Error("no blocks in the response");
      succeeded();
      derive();
      emit();
      save();
    } catch (error) {
      failed(error);
    }
  });
  const pollSlow = guard("slow", async () => {
    // Price is polled whatever the chain provider is doing, so a fallback session keeps its ticker.
    const priced = await pollPrice();
    if (!extended()) {
      if (priced) {
        emit();
        save();
      }
      return;
    }
    try {
      readDifficulty(await get("/v1/difficulty-adjustment"));
      readHashrate(await get("/v1/mining/hashrate/3d"));
      succeeded();
      derive();
      emit();
      save();
    } catch {
      dropExtended();
      if (priced) emit();
    }
  });

  // Each cycle reschedules from its own completion, not from its start, so a poll can never lap the
  // one before it; `backoff` stretches every gap while a provider is unhappy. The handle is kept so
  // dispose actually stops the cycle instead of clearing an id the last tick already replaced.
  const cycle = (key, poll, ms) => {
    const tick = async () => {
      timers[key] = 0;
      if (visible()) await poll();
      if (started) timers[key] = window.setTimeout(tick, ms + backoff);
    };
    timers[key] = window.setTimeout(tick, ms);
  };

  const onFeedEvent = (event) => {
    if (event.type === "tx") {
      arrivals[arrivalHead] = Date.now();
      arrivalHead = (arrivalHead + 1) % arrivals.length;
      if (arrivalCount < arrivals.length) arrivalCount++;
      return;
    }
    if (event.type === "block") {
      snapshot.height = event.height | 0;
      snapshot.lastTxCount = event.txCount | 0;
      snapshot.lastBlockAt = Date.now();
      // A new block empties part of the pool and replaces the tip, so both are refreshed rather than
      // left to their intervals: the socket gives the height at once, but the size, weight and pace
      // behind it only come from /blocks, and a sign showing a new height beside the last block's
      // size is worse than showing neither.
      // A courtesy, not a right: while we are backing off, the block's news waits for the cycle rather
      // than jumping the queue past a provider that asked us to wait.
      if (backoff) return;
      window.clearTimeout(timers.block);
      timers.block = window.setTimeout(() => {
        timers.block = 0;
        pollBacklog();
        pollBlocks();
      }, 1500);
      return;
    }
    if (event.type === "fees") {
      snapshot.nextFee = Number(event.nextFee) || 0;
      derive();
      emit();
    }
  };

  // Every provider here answers a null origin, so a page opened straight off disk polls like a served
  // one; the suite is held off by `nosim` in director.js, not by the scheme.
  // A reload or a back-navigation repaints from the last snapshot of this session rather than from
  // zeros, and a live poll always follows immediately, so the cache is a first frame and never the
  // answer. `at` comes back with it, which is what keeps `snapshot.live` honest about its age.
  const CACHE_KEY = "oogaboogaland.chain", CACHE_MAX = 600000;
  const CACHED = [
    "count", "vsize", "totalFee", "deep", "floor", "nextFee", "fastestFee", "halfHourFee", "hourFee",
    "economyFee", "minimumFee", "height", "lastTxCount", "lastWeight", "lastSize", "lastBlockAt",
    "pace", "progressPercent", "difficultyChange", "remainingBlocks", "remainingTime", "hashrate",
    "difficulty", "priceUsd"
  ];
  const save = () => {
    try {
      const values = {};
      for (const key of CACHED) values[key] = snapshot[key];
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: snapshot.at, ladder: Array.from(ladder), values }));
    } catch {
      // A private window or a full quota is not a reason to stop reading the chain.
    }
  };
  const restore = () => {
    let held;
    try {
      held = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    } catch {
      return false;
    }
    if (!held || !held.values || !(held.at > 0) || Date.now() - held.at > CACHE_MAX) return false;
    for (const key of CACHED) if (typeof held.values[key] === "number") snapshot[key] = held.values[key];
    if (Array.isArray(held.ladder) && held.ladder.length === LADDER) ladder.set(held.ladder);
    snapshot.at = held.at;
    derive();
    return true;
  };

  const start = (options = {}) => {
    if (started || typeof fetch === "undefined") return;
    started = true;
    if (options.source === "esplora") { base = ESPLORA; extended = false; pinned = true; snapshot.source = "esplora"; }
    else if (typeof options.source === "string" && options.source.startsWith("https://")) { base = options.source; extended = false; pinned = true; snapshot.source = options.source; }
    if (BL.mempool) unsubscribeFeed = BL.mempool.subscribe(onFeedEvent);
    if (restore()) emit();
    pollBacklog();
    pollBlocks();
    pollSlow();
    cycle("backlog", pollBacklog, BACKLOG_MS);
    cycle("blocks", pollBlocks, BLOCKS_MS);
    cycle("slow", pollSlow, SLOW_MS);
  };
  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };
  const dispose = () => {
    started = false;
    for (const key of Object.keys(timers)) {
      window.clearTimeout(timers[key]);
      timers[key] = 0;
    }
    if (unsubscribeFeed) unsubscribeFeed();
    unsubscribeFeed = null;
    subscribers.clear();
  };

  BL.chain = {
    MEMPOOL, ESPLORA, LADDER, TARGET_BLOCK, snapshot, start, subscribe, dispose, derive,
    feePressure, deepPressure, readBacklog, readBlocks, readFees, readEstimates, readDifficulty,
    get extended() { return extended(); }, get backoff() { return backoff; }, get base() { return base; }, recover,
    PRICE_SOURCES, pollPrice, ingest: onFeedEvent
  };
})();
