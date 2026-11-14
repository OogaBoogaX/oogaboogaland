// The Cloud Archive TV's channel guide: what each channel reads, from which of the page's own live systems, and how
// fresh it is. Plain data and functions over the systems the page already runs; it loads in Node with stand-ins for
// them (the suite's `cloud archive tv` check), and it never fetches, polls or opens a socket.
//
// A channel is { id, category, title, source, status(env), stamp(env), read(env), detail, watch }:
//   status  "live" (its feed answered within its cadence), "stale" (it has a reading, older than that), "held" (a
//           reading kept from a visit elsewhere, or the bake), "demo" (simulated, said so), "waiting" (its feed is on
//           but has not answered yet) or "off" (nothing here can supply it: no island server, a scene not loaded),
//           worked out without allocating;
//   stamp   a number that changes whenever what the channel shows would change (its inputs, its status and the minute
//           of its age), so the TV formats and repaints a channel only when its stamp moves;
//   read    the rows the TV paints and the board's note, made only when the stamp moved;
//   detail  "oogatron" when the hanging board is the channel's own tool, else the TV's board;
//   watch   the arcade's record ids the channel needs, watched (highscores.js) the first time it is shown, as a scene
//           watches them, and released with the guide.
// `env` is { BL, world, now, reader, views }: `reader` a paused reader of the hanging Oogatron (or null), `views` the
// island's pictures from the climb.
// Status is judged from each feed's own record of success, cadence and failure, never from its being enabled: the
// Oogatron's `lastAt` against its minute (its bake is HELD until a read, and after failures with none), the totems'
// successful poll counter as it moves (the feed keeps no success time, so pre-existing readings stay HELD)
// against their 90 s step, Lightning Jet's one read against its 30 min cache, after which it is STALE.
// `stampOf(channel, env)` is the repaint key: the channel's stamp with its status folded in, so a transition alone
// (LIVE to STALE) repaints. `detailFor(channel, reader)` is the board a pick opens: an Oogatron page's own view, the
// Repositories channel's top repository's totals filtered to it, else the TV's board.
// `createSelector(channels, env)` is the guide's state: the tuned channel, manual selection, optional rotation (off
// by default under reduced motion) that skips channels with nothing to show and holds while anyone reads, and a
// subscription to new blocks with its cleanup. `scoresOf(rule, data)` reads a game's records by the game's own score
// type: one record a cabinet for machine games, one a player for player games (Cloud Hopper).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const CATEGORIES = [["bitcoin", "Bitcoin"], ["island", "The island"], ["arcade", "Arcade"], ["github", "GitHub"], ["cams", "Island cam"]];
  const MINUTE = 60e3, ROTATE_SECONDS = 9;
  const WORDS = { live: "LIVE", stale: "STALE", held: "HELD", demo: "DEMO", waiting: "WAITING", off: "OFF" };
  const CODE = { live: 1, stale: 2, held: 3, demo: 4, waiting: 5, off: 6 };
  // A reading is live within STALE_AFTER of its cadence, as the island's own boards judge theirs.
  const STALE_AFTER = 3;
  const fresh = (at, now, every) => !(at > 0) ? "waiting" : now - at > every * STALE_AFTER ? "stale" : "live";
  const minuteOf = (at, now) => at > 0 ? Math.floor((now - at) / MINUTE) : -1;
  const num = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  const ago = (at, now) => {
    if (!(at > 0)) return "never";
    const m = Math.floor((now - at) / MINUTE);
    return m < 1 ? "under a minute ago" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
  };
  const clock = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms / 10) % 100).padStart(2, "0")}`;
  const row = (label, value, tone = "") => [label, value, tone];
  // A record's value in its own unit.
  const scoreText = (rule, v) => rule.unit === "milliseconds" ? clock(v) : num(v);
  const better = (rule, a, b) => rule.direction === "asc" ? a < b : a > b;

  // A game's records by its own score type. Machine games keep one record a cabinet (`machines`); player games keep
  // one a player (`ooga`), keyed by login. Returns the records best first, each { key, score, at }, and `players` for
  // a player game. Pure; never mixes a cabinet's record with a player's.
  const scoresOf = (rule, data) => {
    if (!rule || !data || data.scoreType !== rule.scoreType) return { kind: rule ? rule.scoreType : null, rows: [] };
    const rows = [];
    const keys = rule.scoreType === "ooga" ? Object.keys(data.highscores) : rule.machines;
    for (const key of keys) {
      const score = data.highscores[key];
      if (Number.isSafeInteger(score) && score > 0) rows.push({ key, score, at: data.achieved[key] || 0 });
    }
    rows.sort((a, b) => better(rule, a.score, b.score) ? -1 : better(rule, b.score, a.score) ? 1 : a.key < b.key ? -1 : 1);
    return { kind: rule.scoreType, rows };
  };

  // The island server's shared records: available where it says it keeps them.
  const recordsOn = (B) => !!(B.net.state.backend && B.net.state.highscores === true);
  const recordsRevision = (B, ids) => {
    let n = 0;
    for (const id of ids) { const d = B.highscores.get(id); if (d) n += d.revision + 1; }
    return n;
  };
  const CABINET_GAMES = [["skee", "Thro-ball"], ["hoops", "Hoop Shot"], ["shy", "Coconut Toss"], ["claw", "Claw"], ["hockey", "Air hockey"],
    ["pinball", "Pinball"], ["ride", "Beast Ride"], ["invaders", "Coconut Invaders"], ["snake", "Banana Snake"], ["pong", "Ooga Pong"],
    ["stampede", "Mammoth Stampede"], ["flap", "Flap"], ["breaker", "Breaker"], ["dash", "Dash"], ["stacker", "Stacker"],
    ["drop", "Ooga Drop"], ["orbit", "Ooga Orbit"], ["mine", "Ooga Mine"]];
  const CABINET_IDS = CABINET_GAMES.map((g) => g[0]);
  const TRACKS = [["bay", "Bay"], ["gorge", "Gorge"], ["peak", "Peak"]];

  const OOGATRON_MS = MINUTE, TOTEM_MS = 90e3, JET_MS = 30 * MINUTE;
  // The Oogatron's poller: LIVE within its cadence of a good read, STALE after; before any good read its bake is
  // what shows: WAITING while the first read is due, HELD once one has failed or with the poller off.
  const oogatronStatus = (B, now) => {
    const s = B.oogatronLive.state;
    if (s.lastAt > 0) return fresh(s.lastAt, now, OOGATRON_MS);
    return s.enabled && !s.failures ? "waiting" : "held";
  };
  // A small, allocation-free code for a zone name, so a stamp sees a move between zones.
  const zoneCode = (zone) => {
    let h = 7;
    for (let i = 0; i < zone.length; i++) h = (Math.imul(h, 31) + zone.charCodeAt(i)) | 0;
    return h;
  };
  const channels = (env) => {
    const B = env.BL, list = [];
    // The poller has no success time. Its first observed count is a baseline, not a fresh read.
    // Only a later successful poll starts the age clock; failures cannot refresh old data.
    const totem = { polls: -1, at: 0 };
    const totemStatus = () => {
      const s = B.totemFeed.state, now = env.now();
      if (totem.polls >= 0 && s.polls > totem.polls) totem.at = now;
      else if (s.polls < totem.polls) totem.at = 0;
      totem.polls = s.polls;
      if (!s.enabled) return s.polls ? "stale" : "off";
      if (!s.polls) return s.failures ? "off" : "waiting";
      // The newest attempt failed, or nothing has moved for three steps.
      return s.lastError ? "stale" : !totem.at ? "held" : now - totem.at > TOTEM_MS * STALE_AFTER ? "stale" : "live";
    };
    const jetStatus = () => {
      const J = B.jetFeed;
      if (!J) return "off";
      const f = J.state.fetched;
      // One read a page life, not a cadence: LIVE only within the cache's half hour of it, STALE after.
      return f ? (env.now() - Date.parse(f.at) > JET_MS ? "stale" : "live") : "held";
    };
    const add = (c) => { c.index = list.length; c.detail ||= "board"; c.watch ||= null; list.push(c); };
    // ---- Bitcoin (chain.js, mempool.js; the Sphere's readings when it was visited).
    add({ id: "chain", category: "bitcoin", title: "Chain and mining", get source() { return `chain.js · ${B.chain.snapshot.source}`; },
      status: () => { const s = B.chain.snapshot; return !(s.at > 0) && s.errors ? "off" : fresh(s.at, env.now(), MINUTE); },
      stamp: () => { const s = B.chain.snapshot; return s.at + s.heightAt + s.priceAt + minuteOf(s.at, env.now()); },
      read: () => {
        const s = B.chain.snapshot, now = env.now();
        return { at: s.at, rows: [
          row("Block height", s.height ? num(s.height) : "—", "accent"),
          row("Hashrate", s.hashrate ? `${num(s.hashrate / 1e18)} EH/s` : "—"),
          row("Difficulty", s.remainingBlocks ? `${s.difficultyChange >= 0 ? "+" : ""}${num(s.difficultyChange, 1)}% in ${num(s.remainingBlocks)} blocks` : "—"),
          row("Block pace", s.avgBlockMs ? `${num(s.avgBlockMs / MINUTE, 1)} min a block` : "—"),
          row("Last block", s.lastBlockAt ? ago(s.lastBlockAt, now) : "—"),
          row("Price", s.priceUsd ? `$${num(s.priceUsd)}${s.priceSource ? ` · ${s.priceSource}` : ""}` : "—", s.priceOpenUsd && s.priceUsd < s.priceOpenUsd ? "down" : "up")
        ] };
      } });
    add({ id: "fees", category: "bitcoin", title: "Fees", source: "chain.js · recommended tiers and the next block",
      status: () => fresh(B.chain.snapshot.feesAt, env.now(), MINUTE),
      stamp: () => { const s = B.chain.snapshot; return s.feesAt + s.nextFee + minuteOf(s.feesAt, env.now()); },
      read: () => {
        const s = B.chain.snapshot, f = (v) => v ? `${num(v, v < 10 ? 1 : 0)} sat/vB` : "—";
        return { at: s.feesAt, rows: [row("Next block", f(s.nextFee), "good"), row("Fastest", f(s.fastestFee)), row("Half an hour", f(s.halfHourFee)),
          row("An hour", f(s.hourFee)), row("Economy", f(s.economyFee)), row("Minimum", f(s.minimumFee))] };
      } });
    add({ id: "mempool", category: "bitcoin", title: "Mempool", source: "mempool.js socket · chain.js backlog",
      status: () => B.mempool.state.connected ? "live" : fresh(B.chain.snapshot.backlogAt, env.now(), MINUTE),
      stamp: () => { const s = B.chain.snapshot, m = B.mempool.state; return s.backlogAt + s.socketAt + m.blocks + (m.connected ? 7 : 0) + minuteOf(s.backlogAt, env.now()); },
      read: () => {
        const s = B.chain.snapshot, m = B.mempool.state;
        return { at: Math.max(s.backlogAt, s.socketAt), rows: [row("Waiting", s.count ? `${num(s.count)} tx` : "—", "accent"),
          row("Backlog", s.vsize ? `${num(s.vsize / 1e6, 1)} MvB` : "—"), row("Paying 1 sat/vB or more", s.paying ? `${num(s.paying, 1)} MvB` : "—"),
          row("Arriving", s.inflow ? `${num(s.inflow)} vB/s` : "—"), row("Socket", m.connected ? "open" : "closed", m.connected ? "good" : "dim"),
          row("Blocks found this visit", num(m.blocks), "blue")] };
      } });
    add({ id: "block", category: "bitcoin", title: "Latest block", source: "chain.js · the tip",
      status: () => fresh(B.chain.snapshot.heightAt, env.now(), 10 * MINUTE),
      stamp: () => { const s = B.chain.snapshot; return s.heightAt + s.lastBlockAt + minuteOf(s.lastBlockAt, env.now()); },
      read: () => {
        const s = B.chain.snapshot;
        return { at: s.heightAt, rows: [row("Height", s.height ? num(s.height) : "—", "accent"), row("Found", s.lastBlockAt ? ago(s.lastBlockAt, env.now()) : "—"),
          row("Transactions", s.lastTxCount ? num(s.lastTxCount) : "—"), row("Size", s.lastSize ? `${num(s.lastSize / 1e6, 2)} MB` : "—"),
          row("Weight", s.lastWeight ? `${num(s.lastWeight / 1e6, 2)} MWU` : "—")] };
      } });
    add({ id: "pools", category: "bitcoin", title: "Mining pools · 24 h", source: "timechain-blocks.js · mempool.space, read in the Timechain Sphere",
      status: () => { const T = B.timechainBlocks, set = T && T.cache.sets.pools24h; return set && set.value ? "held" : "off"; },
      stamp: () => { const T = B.timechainBlocks, set = T && T.cache.sets.pools24h; return set ? set.at + minuteOf(set.at, env.now()) : 0; },
      read: () => {
        const set = B.timechainBlocks && B.timechainBlocks.cache.sets.pools24h, v = set && set.value;
        if (!v) return { at: 0, rows: [], empty: "The Timechain Sphere reads the pools. Visit it, and its last reading shows here." };
        return { at: set.at, rows: v.pools.slice(0, 5).map((p, i) => row(`${i + 1}. ${p.name}`, `${num(p.blocks)} of ${num(v.total)} blocks`, i ? "" : "accent")) };
      } });
    // ---- The island (contributors.js, net.js, chain.js's weather axes, the pile, donations.js, the Factory's node).
    add({ id: "activity", category: "island", title: "Who's working", get source() { return B.oogatronLive.state.enabled ? "oogatron-live.js · GitHub activity" : "the baked roster"; },
      status: () => oogatronStatus(B, env.now()),
      stamp: () => Math.floor(env.now() / MINUTE) + B.oogatronLive.state.lastAt,
      read: () => {
        const C = B.contributors, counts = { working: 0, chilling: 0, sleeping: 0, away: 0 }, now = env.now();
        for (const e of C.activeRoster) { const s = C.stateFor(e, now); if (s in counts) counts[s]++; }
        return { at: now, rows: [row("Working", num(counts.working), "good"), row("Chilling", num(counts.chilling), "accent"),
          row("Sleeping", num(counts.sleeping), "dim"), row("Away", num(counts.away), "dim"), row("On the roster", num(C.activeRoster.length))] };
      } });
    add({ id: "online", category: "island", title: "Players online", source: "net.js · the island room (counts only)",
      status: () => !B.net.state.backend ? "off" : B.net.state.room === "live" ? "live" : "waiting",
      // Population alone misses a move between zones: the stamp folds every remote's zone in (bounded by the room).
      stamp: () => {
        let h = (B.net.state.backend ? 1 : 0) + B.net.remotes.size * 3 + (B.net.state.room === "live" ? 11 : 0);
        for (const r of B.net.remotes.values()) h = (Math.imul(h, 33) + zoneCode(r.zone || "outside")) | 0;
        return h;
      },
      read: () => {
        if (!B.net.state.backend) return { at: 0, rows: [], empty: "Who is online shows where the island's own server runs." };
        // Counts by the land each stands in (zone-map.js where the page has it); never names or positions.
        const lands = new Map();
        for (const r of B.net.remotes.values()) {
          const zone = r.zone || "outside", land = B.zoneMap ? B.zoneMap.landOf(zone) : zone === "outside" ? "The island" : "Inside somewhere";
          lands.set(land, (lands.get(land) || 0) + 1);
        }
        const rows = [row("In the room", num(B.net.remotes.size + (B.net.state.me ? 1 : 0)), "accent")];
        for (const [land, n] of [...lands].sort((a, b) => b[1] - a[1]).slice(0, 5)) rows.push(row(land, num(n)));
        return { at: env.now(), rows };
      } });
    add({ id: "weather", category: "island", title: "Mempool island weather", source: "weather.js steps · chain.js arrivals and backlog",
      status: () => { const s = B.chain.snapshot; return s.socketAt > 0 && env.now() - s.socketAt < B.weather.ARRIVALS_FRESH_MS ? "live" : s.socketAt > 0 ? "stale" : "waiting"; },
      stamp: () => { const s = B.chain.snapshot; return Math.round(s.gale * 100) + Math.round(s.soak * 100) * 101 + s.socketAt + minuteOf(s.socketAt, env.now()); },
      read: () => {
        const s = B.chain.snapshot, steps = B.weather.STEPS, live = s.socketAt > 0 && env.now() - s.socketAt < B.weather.ARRIVALS_FRESH_MS;
        let step = steps[0];
        for (const st of steps) if (s.gale >= st.from) step = st;
        return { at: s.socketAt, big: live ? step.name.toUpperCase() : "CALM", meters: [["Storm (arrivals)", live ? s.gale : 0, "blue"], ["Lake (backlog)", s.soak, "accent"]], rows: [] };
      } });
    add({ id: "bananas", category: "island", title: "Bananas and tips", get source() { return B.donations.state.connected ? "donations.js · the island server's tally" : "the island's pile"; },
      status: () => B.donations.state.connected ? "live" : "held",
      stamp: () => { const d = B.donations.state; return Math.floor(env.world.level || 0) + d.donations * 7 + (d.tally ? d.tally.count * 13 : 0) + (d.connected ? 1e9 : 0); },
      read: () => {
        const d = B.donations.state, t = d.tally, top = d.board && d.board[0], last = d.recent && d.recent[0];
        const rows = [row("The island's pile", `${num(Math.floor(env.world.level || 0))} bananas`, "accent")];
        if (!d.connected) return { at: 0, rows, empty: "Tips go live where the island's own server runs." };
        rows.push(row("Tips, all time", t ? `${num(t.count)} · ${num(t.sats)} sats` : "—"), row("Bananas from tips", t ? num(t.bananas) : "—"));
        // Only what the island shows publicly: a handle and an amount, never a message.
        if (last) rows.push(row("Latest tip", `${last.handle || "anon"} · ${num(last.sats)} sats`, "good"));
        if (top) rows.push(row("Top tipper", `${top.handle} · ${num(top.bananas)} bananas`, "accent"));
        if (d.network && d.network !== "mainnet") rows.push(row("Network", `test (${d.network})`, "dim"));
        return { at: env.now(), rows };
      } });
    add({ id: "factory", category: "island", title: "Lightning Factory · demo node", source: "factory-feed.js · the Factory's simulated node",
      status: () => env.world.factoryNode ? "demo" : "off",
      stamp: () => { const n = env.world.factoryNode; return n ? n.version + n.feed.counts.accepted * 3 + n.cooker.tips * 7 : 0; },
      read: () => {
        const n = env.world.factoryNode;
        if (!n) return { at: 0, rows: [], empty: "The Factory's node starts when the island builds its window." };
        const r = n.feed.reading;
        return { at: 0, rows: [row("Channels", r.channels === null ? "—" : num(r.channels), "accent"), row("Peers", r.peers === null ? "—" : num(r.peers)),
          row("Forwards settled", num(r.settled), "good"), row("Forwards failed", num(r.failed), "dim"), row("Rebalances", num(r.rebalances)),
          row("Tips cooked this page", num(n.cooker.tips))], note: "A seeded demo node, not a real one: Lightning Foundry's public feed is not connected here." };
      } });
    // ---- Arcade (highscores.js, by each game's own score type).
    add({ id: "cabinets", category: "arcade", title: "Cabinet records", source: "highscores.js · one record a cabinet", watch: CABINET_IDS,
      status: () => !recordsOn(B) ? "off" : recordsRevision(B, CABINET_IDS) ? "live" : "waiting",
      stamp: () => (recordsOn(B) ? 1 : 0) + recordsRevision(B, CABINET_IDS) * 3,
      read: () => {
        if (!recordsOn(B)) return { at: 0, rows: [], empty: "Shared records show where the island's own server keeps them." };
        const rows = [];
        for (const [id, name] of CABINET_GAMES) {
          const rule = B.highscoreRules.get(id), best = scoresOf(rule, B.highscores.get(id)).rows[0];
          if (best && rows.length < 7) rows.push(row(rule.machines.length > 1 ? `${name} · cabinet ${rule.machines.indexOf(best.key) + 1}` : name, scoreText(rule, best.score), "accent"));
        }
        return rows.length ? { at: env.now(), rows } : { at: env.now(), rows, empty: "No records set yet." };
      } });
    add({ id: "rally", category: "arcade", title: "Ooga Rally records", source: "highscores.js · one record a track and mode", watch: ["race"],
      status: () => !recordsOn(B) ? "off" : B.highscores.get("race") ? "live" : "waiting",
      stamp: () => (recordsOn(B) ? 1 : 0) + recordsRevision(B, ["race"]) * 3,
      read: () => {
        if (!recordsOn(B)) return { at: 0, rows: [], empty: "Shared records show where the island's own server keeps them." };
        const rule = B.highscoreRules.get("race"), data = B.highscores.get("race"), rows = [];
        for (const [track, name] of TRACKS) for (const [mode, label] of [["lap", "best lap"], ["race", "best race"]]) {
          const key = `race-1-${track}-${mode}`, v = data && data.highscores[key];
          rows.push(row(`${name} · ${label}`, v ? scoreText(rule, v) : "—", v ? "accent" : "dim"));
        }
        return { at: env.now(), rows };
      } });
    // Cloud Hopper keeps one player-keyed board a level (cloud-hopper-levels.js `board`); its single board from before
    // the levels is retired (highscore-rules.js): still read, never updated. The channel shows each level's best
    // player and the retired board's best, all by login.
    const HOPPER = [...(B.cloudHopperLevels ? B.cloudHopperLevels.LEVELS.map((l) => [l.board, l.name]) : []), ["cloud-hopper", "Before levels (retired)"]]
      .filter(([id]) => B.highscoreRules.get(id));
    const HOPPER_IDS = HOPPER.map(([id]) => id);
    add({ id: "hopper", category: "arcade", title: "Cloud Hopper players", source: "highscores.js · one record a player, a board a level", watch: HOPPER_IDS,
      status: () => {
        if (!recordsOn(B)) return "off";
        for (const id of HOPPER_IDS) if (B.highscores.get(id)) return "live";
        return "waiting";
      },
      stamp: () => (recordsOn(B) ? 1 : 0) + recordsRevision(B, HOPPER_IDS) * 3,
      read: () => {
        if (!recordsOn(B)) return { at: 0, rows: [], empty: "Shared records show where the island's own server keeps them." };
        const rows = [], players = new Set();
        for (const [id, name] of HOPPER) {
          const rule = B.highscoreRules.get(id), s = scoresOf(rule, B.highscores.get(id)), best = s.rows[0];
          for (const r of s.rows) players.add(r.key);
          rows.push(row(name, best ? `${B.characters.displayOf(best.key)} · ${scoreText(rule, best.score)}` : "no time yet", best ? (rows.length ? "" : "accent") : "dim"));
        }
        if (players.size) rows.push(row("Players with a time", num(players.size), "dim"));
        return players.size ? { at: env.now(), rows } : { at: env.now(), rows, empty: "No descents timed yet." };
      } });
    // ---- GitHub (the hanging Oogatron's reader; totem-feed.js; jet-feed.js once the Hangar has loaded it).
    if (env.reader) for (let i = 0; i < env.reader.count; i++) {
      env.reader.go(i);
      add({ id: `oogatron-${i}`, category: "github", title: `Oogatron · ${env.reader.caption}`, page: i, detail: "oogatron",
        get source() { return B.oogatronLive.state.enabled ? "oogatron-live.js · GitHub" : "the baked Oogatron stats"; },
        status: () => oogatronStatus(B, env.now()),
        stamp: () => env.reader.version + B.oogatronLive.state.lastAt + minuteOf(B.oogatronLive.state.lastAt, env.now()),
        read: () => ({ at: B.oogatronLive.state.lastAt, rows: [], reader: i }) });
    }
    add({ id: "repos", category: "github", title: "Repositories", detail: "oogatron", get source() { return B.oogatronLive.state.enabled ? "oogatron-live.js · GitHub" : "the baked Oogatron stats"; },
      status: () => !env.reader ? "off" : oogatronStatus(B, env.now()),
      stamp: () => (env.reader ? env.reader.repos.length + env.reader.version * 3 : 0) + B.oogatronLive.state.lastAt + minuteOf(B.oogatronLive.state.lastAt, env.now()),
      read: () => {
        const repos = env.reader ? env.reader.repos : [];
        const rows = [...repos].sort((a, b) => b.totals.commits - a.totals.commits).slice(0, 6)
          .map((r, i) => row(r.name, `${num(r.totals.commits)} commits · ${num(r.totals.prs)} PRs · ${num(r.totals.contributors)} people`, i ? "" : "accent"));
        return { at: B.oogatronLive.state.lastAt, rows };
      } });
    add({ id: "totems", category: "github", title: "Bitcoin projects · latest merges", source: "totem-feed.js · GitHub",
      status: totemStatus,
      stamp: () => { const s = B.totemFeed.state; let n = s.polls * 3 + s.failures * 5 + (s.enabled ? 1 : 0); for (const r of s.repos) n += r.changedAt + r.number; return n + Math.floor(env.now() / MINUTE); },
      read: () => {
        const F = B.totemFeed, now = env.now();
        return { at: 0, note: F.state.lastError ? `Its last request failed (${F.state.lastError}).` : "", rows: F.REPOS.map((r, i) => { const m = F.state.repos[i]; return row(r.name, m.number ? `#${m.number} · ${ago(m.changedAt, now)}` : "no merge in the last day", m.number ? "" : "dim"); }),
          links: F.REPOS.map((r, i) => F.state.repos[i]).filter((m) => m.url).map((m) => ({ href: m.url, label: `${m.url.split("/").slice(3, 5).join("/")} #${m.number} (new tab)` })) };
      } });
    add({ id: "jet", category: "github", title: "Lightning Jet", source: "jet-feed.js · read by the Lightning Jet Hangar",
      status: jetStatus,
      stamp: () => { const J = B.jetFeed, f = J && J.state.fetched; return J ? (f ? Date.parse(f.at) : 1) + J.state.failures * 7 + minuteOf(f ? Date.parse(f.at) : 0, env.now()) : 0; },
      read: () => {
        const r = B.jetFeed && B.jetFeed.reading();
        if (!r) return { at: 0, rows: [], empty: "The Lightning Jet Hangar reads this. Visit it, and its reading shows here." };
        return { at: Date.parse(r.at), rows: [row("Stars", num(r.stars), "accent"), row("Forks", num(r.forks)), row("Commits", num(r.commits)),
          row("Commits this week", num(r.commitsWeek), "good"), row("Open issues", num(r.openIssues)), row("Latest release", r.releases[0] ? r.releases[0].tag : "—")],
          note: `drneski/lightning-jet as the Hangar last read it (${r.source === "fetch" ? "this page" : r.source === "cache" ? "cached" : "the build's bake"}).` };
      } });
    // ---- The island's places, drawn by the hub on the climb.
    for (const v of env.views) add({ id: `cam-${list.length}`, category: "cams", title: v.label, cam: v, source: "drawn by the island on your climb",
      status: () => "held", stamp: () => 1, read: () => ({ at: 0, rows: [] }) });
    return list;
  };

  // The repaint key: a channel's stamp with its status folded in, so a status change alone repaints. Stamps stay
  // well under 2^53 with the status as its top digit.
  const stampOf = (c, env) => c.stamp(env) + CODE[c.status(env)] * 1e15;
  // The board a pick opens. An Oogatron page opens the Oogatron's own board on that page's view (not on the page the
  // hanging sign happens to show); Repositories opens it on the top repository's totals, filtered to it (the filter
  // menu reaches the rest); every other channel opens the TV's own board.
  const detailFor = (c, reader) => {
    if (reader && c.page !== undefined) {
      const at = reader.index;
      reader.go(c.page % reader.count);
      const v = reader.view, screen = { name: v.name, params: v.params ? { ...v.params } : undefined };
      reader.go(at);
      return { kind: "oogatron", screen, filters: null };
    }
    if (reader && c.id === "repos") {
      let top = null;
      for (const r of reader.repos) if (!top || r.totals.commits > top.totals.commits) top = r;
      return top ? { kind: "oogatron", screen: { name: "repo", params: { name: top.name } }, filters: { repos: [top.name], users: null, types: null } }
        : { kind: "oogatron", screen: { name: "totals", params: undefined }, filters: null };
    }
    return { kind: "board" };
  };
  // The guide's state. `index` the tuned channel; `auto` rotation on or off (off by default under reduced motion);
  // `hold(reason, on)` keeps the channel still while a reason stands (the guide or a board open); `select(i)` tunes by
  // hand and restarts the wait; `update(dt)` turns the channel when it is due, skipping channels that are "off".
  // `watched` collects the record watches the shown channels asked for; `dispose` releases every subscription.
  const createSelector = (list, env, { reduced = false, onTune = null } = {}) => {
    const B = env.BL, holds = new Set(), watched = new Map();
    const state = { index: 0, auto: !reduced, wait: ROTATE_SECONDS, newBlock: 0 };
    const watchFor = (c) => {
      if (!c.watch) return;
      for (const id of c.watch) if (!watched.has(id)) watched.set(id, B.highscores.watch(id, () => {}));
    };
    const tune = (i, byHand) => {
      state.index = (i + list.length) % list.length;
      state.wait = ROTATE_SECONDS;
      watchFor(list[state.index]);
      if (onTune) onTune(state.index, byHand);
    };
    const next = () => {
      for (let step = 1; step <= list.length; step++) {
        const i = (state.index + step) % list.length;
        if (list[i].status(env) !== "off") return tune(i, false);
      }
    };
    // A block found cuts to the mempool, unless someone holds the channel or rotation is off.
    const mempool = list.findIndex((c) => c.id === "mempool");
    const offBlocks = B.mempool.subscribe((event) => {
      if (event.type !== "block") return;
      state.newBlock = ROTATE_SECONDS;
      if (state.auto && !holds.size && mempool >= 0) tune(mempool, false);
    });
    watchFor(list[0]);
    return {
      state, list,
      get index() { return state.index; }, get auto() { return state.auto; }, get held() { return holds.size > 0; },
      get watching() { return watched.size; },
      select: (i) => tune(i, true),
      setAuto: (on) => { state.auto = !!on; state.wait = ROTATE_SECONDS; },
      hold: (reason, on) => { if (on) holds.add(reason); else holds.delete(reason); },
      // A detail board held open: rotation and block cuts wait while any reader it makes is open, and resume when the
      // last is disposed (a floating board disposes its reader as it closes). `settle` releases the hold when the board
      // never opened a reader (panels hidden). `dispose` releases every hold.
      holdDetail: (make) => {
        const reason = { open: 0 };
        holds.add(reason);
        return {
          createReader: (state) => {
            reason.open++;
            const r = make(state), done = r.dispose;
            let disposed = false;
            r.dispose = () => { done.call(r); if (disposed) return; disposed = true; if (--reason.open <= 0) holds.delete(reason); };
            return r;
          },
          settle: () => { if (reason.open <= 0) holds.delete(reason); }
        };
      },
      update: (dt) => {
        if (state.newBlock > 0) state.newBlock -= dt;
        if (!state.auto || holds.size) return;
        if ((state.wait -= dt) <= 0) next();
      },
      categories: () => CATEGORIES.map(([id, name]) => ({ id, name, channels: list.filter((c) => c.category === id) })).filter((g) => g.channels.length),
      dispose: () => { offBlocks(); for (const off of watched.values()) off(); watched.clear(); holds.clear(); }
    };
  };
  BL.cloudArchiveChannels = { CATEGORIES, WORDS, CODE, ROTATE_SECONDS, STALE_AFTER, JET_MS, TOTEM_MS, channels, createSelector, scoresOf, fresh, ago, stampOf, detailFor };
})();
