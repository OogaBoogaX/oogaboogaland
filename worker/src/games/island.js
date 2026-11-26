// The island's world as the server runs it, hosted by game-host.js as kind "island" at the venue "main": every Ooga
// nobody drives, on its passive routine (src/js/island-sim.js, imported unchanged), so every signed-in page on the
// island sees the same crew at the same moment. Pages only listen; they send nothing this reads.
//
// The cast is the Worker's own (characters.gen.json, as the room's ownership rules are), in join order. Who works,
// chills, sleeps or is away, and at which caves, comes from Oogatron's stats (contributor-policy.js's reader through
// the OOGATRON binding), read when the world starts and every `REFRESH_MS` while it runs, as a page polls them. Until
// the first reading, the world starts from the snapshot every deploy bakes into the page (jumbotron-data.js), as a
// page does, so a world that cannot reach Oogatron shows what a page would. Each Ooga's state is the windows of
// roster-panel.js (island-sim.js `stateAt`), its caves the ones it was active at within the hour (`sitesFor`).
//
// The banana pile's size (its ring, reload fan and where workers turn up) comes from bananapayserver, read through the
// DONATIONS binding every few minutes while the world runs (`readPile`).
//
// The tick comes as the world finishes its second step since the last (`nextTickIn`), not every 100 ms from whenever
// the last ran: the object's timer runs late, and a tick that came up to a step after the world's last step sent rows
// that stood for an earlier moment than the tick's, by a different amount each time, which a page had to wait out.
//
// Out: every tick, the motion frame of game-wire.js, a row an Ooga (island-sim.js `motion`; nothing when no Ooga has
// moved or changed since the last, but at least every `KEEP_MS`); the state, the cast's names in row order, at once to
// a page joining and every `stateEvery` ticks. The world runs only while a page follows it, and keeps no record: a
// restarted object starts the routine afresh.
import "../../../src/js/math.js";
import "../../../src/js/npc-paths.js";
import "../../../src/js/island-layout.js";
import "../../../src/js/island-sim.js";
import "./lend-window.js";
import "../../../src/js/jumbotron-data.js";
import "./return-window.js";
import { oogatron, readContributorSnapshot } from "../contributor-policy.js";
import CAST_ROWS from "../characters.gen.json" with { type: "json" };

const SIM = globalThis.BL.islandSim, LAYOUT = globalThis.BL.islandLayout, IDENTITIES = globalThis.BL.contributorIdentities;
// Ticks come `TICK_MS` apart, each `TICK_SLACK_MS` after the world finishes a step (`nextTickIn`).
const TICK_MS = 100, TICK_SLACK_MS = 2;
const REFRESH_MS = 60000, RETRY_MS = 15000, KEEP_MS = 2000, STEP_MAX_MS = 1000, ACTIVITY_MS = 1000, MAX_REPOS = 64;
const ENTROPY = "oogaboogax/entropylab";
const PILE_MS = 5 * 60000, PILE_RETRY_MS = 60000, PILE_WAIT_MS = 5000, HOUR_MS = 3600e3;
const finite = (v) => typeof v === "number" && Number.isFinite(v);

/** One reading of the banana pile from bananapayserver, through the DONATIONS binding: a short socket to its
 * /donations/socket (as donations.js passes a page's on), its first `pile` message, then closed. Resolves
 * { bananas, at, eatPerHour } (bananapayserver's docs/protocol.md), or null with no reading within `PILE_WAIT_MS`;
 * `why(reason)` hears why it was null. */
export const readPile = async (donations, origin, why = () => {}) => {
  const key = new Uint8Array(16);
  crypto.getRandomValues(key);
  const res = await donations.fetch(new Request(new URL("/donations/socket", origin), { headers: { upgrade: "websocket", connection: "Upgrade",
    "sec-websocket-version": "13", "sec-websocket-key": btoa(String.fromCharCode(...key)), "x-client": "island-world" } }));
  const ws = res.webSocket;
  if (!ws) { why(`no socket (${res.status})`); return null; }
  ws.accept();
  return new Promise((resolve) => {
    let timer = 0, settled = false;
    const done = (pile) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(1000, "read"); } catch { /* closed */ }
      resolve(pile);
    };
    const fail = (reason) => { if (!settled) { why(reason); done(null); } };
    timer = setTimeout(() => fail("no pile in time"), PILE_WAIT_MS);
    ws.addEventListener("message", (e) => {
      let m = null;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && m.type === "pile" && finite(m.bananas) && finite(m.eatPerHour))
        done({ bananas: Math.max(0, m.bananas), at: finite(m.at) ? m.at : Date.now(), eatPerHour: Math.max(0, m.eatPerHour) });
    });
    ws.addEventListener("close", (e) => fail(`closed (${e.code})`));
    ws.addEventListener("error", () => fail("socket error"));
  });
};
/** The pile a reading gives at `at`: its bananas less what has been eaten since, never below none. */
export const bananasAt = (pile, at) => Math.max(0, pile.bananas - pile.eatPerHour * Math.max(0, at - pile.at) / HOUR_MS);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The cast as the island world runs it, from the Worker's cast rows: join order, each with its owner's login. */
export const castFrom = (rows) => rows
  .map((row) => ({ name: row.handle, login: String(row.github_login || row.handle).toLowerCase(), joined: Date.parse(row.joined_at),
    lastCommitAt: Date.parse(row.last_commit_at) || 0, maintainer: !!(row.look && row.look.maintainer), seen: 0,
    activity: new Map([[ENTROPY, Date.parse(row.last_commit_at) || 0]]) }))
  .sort((a, b) => a.joined - b.joined || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

/** Folds an Oogatron stats snapshot (schema 3) into the cast's activity, as contributors.js `applySnapshot` does: the
 * org's latest sighting (`seen`) and each repository's (`activity`, repository to stamp), by the login that owns the
 * Ooga, never rewinding a newer one; a repository's first reading replaces the bundled stamp for it (`readRepos`
 * remembers which have been read). Returns how many readings it took. */
export const applyStats = (cast, stats, at, readRepos = new Set()) => {
  const snapshot = IDENTITIES.normalizeStats(stats, at);
  if (!snapshot || !snapshot.meta || snapshot.meta.schema_version !== 3 || String(snapshot.meta.org).toLowerCase() !== "oogaboogax") return 0;
  const byLogin = new Map(cast.map((c) => [c.login, c]));
  const stamp = (row) => row && typeof row.login === "string" && typeof row.last_seen_at === "string" && ISO.test(row.last_seen_at)
    ? Date.parse(row.last_seen_at) : NaN;
  let taken = 0;
  for (const row of Array.isArray(snapshot.contributors) ? snapshot.contributors : []) {
    const c = byLogin.get(String(row && row.login).toLowerCase()), seen = stamp(row);
    if (c && seen > 0 && seen <= at) { c.seen = Math.max(c.seen, seen); taken++; }
  }
  for (const repo of Array.isArray(snapshot.repos) ? snapshot.repos : []) {
    if (!repo || typeof repo.name !== "string" || !Array.isArray(repo.contributors)) continue;
    const key = `oogaboogax/${repo.name}`.toLowerCase(), first = !readRepos.has(key);
    for (const row of repo.contributors) {
      const c = byLogin.get(String(row && row.login).toLowerCase()), seen = stamp(row);
      if (!c || !(seen > 0 && seen <= at)) continue;
      if (first) c.activity.delete(key);
      if (!c.activity.has(key) && c.activity.size >= MAX_REPOS || seen <= (c.activity.get(key) || 0)) continue;
      c.activity.set(key, seen);
      taken++;
    }
    readRepos.add(key);
  }
  return taken;
};

/** Hands every cast member's state and caves to the sim, as of `at`. */
export const applyActivity = (sim, cast, at) => {
  for (const c of cast) {
    let latest = c.seen;
    for (const stamp of c.activity.values()) latest = Math.max(latest, stamp);
    const state = SIM.stateAt(latest, at);
    sim.setActivity(c.name, c.maintainer && state !== 3 ? 0 : state, SIM.sitesFor(LAYOUT.sites, c.activity, c.maintainer, at));
  }
};

const parse = (m) => m && typeof m === "object" && !Array.isArray(m) && typeof m.t === "string" ? null : false;

const create = (now, env) => {
  const sim = SIM.create({ seed: now >>> 0 });
  const cast = castFrom(CAST_ROWS);
  sim.setCast(cast);
  const fetcher = oogatron(env);
  const readRepos = new Set();
  applyStats(cast, globalThis.BL.jumbotronData, now, readRepos);
  let pages = 0, last = now, readAt = -Infinity, reading = null, sentAt = -Infinity, sentStir = -1, appliedAt = -Infinity;
  // The pile, read every PILE_MS while the world runs (a minute after a failed read): between donations it only
  // shrinks at its stated rate, so one reading gives its size until the next. Without the binding (donations
  // simulated, the checks) the world keeps island-sim.js's own nominal pile.
  const donations = env && env.DONATIONS && typeof env.DONATIONS.fetch === "function" ? env.DONATIONS : null;
  const origin = env && env.SITE_ORIGIN || "https://oogaboogaland.invalid";
  let pile = null, pileAt = -Infinity, pileReading = null, loggedRing = NaN;
  // To Workers Logs, while we find out why the server's pile differs from the page's: each read that fails, and the
  // pile each time its ring moves (a step of the path, so a pile shrinking by the hour logs rarely), never a read that
  // only confirms what the world has.
  const logPile = (fields) => console.log(JSON.stringify({ event: "island-pile", ...fields }));
  const readPileSoon = (at) => {
    if (!donations || pileReading || at < pileAt) return;
    pileAt = at + PILE_RETRY_MS;
    pileReading = readPile(donations, origin, (reason) => logPile({ ok: false, reason }))
      .then((reading) => { if (reading) { pile = reading; pileAt = at + PILE_MS; } })
      .catch((e) => logPile({ ok: false, reason: String(e && e.message || e).slice(0, 160) }))
      .finally(() => { pileReading = null; });
  };
  // Without the binding (a local Worker, the checks) the bundled stamps stand.
  const read = (at) => {
    if (!fetcher || reading || at < readAt) return;
    readAt = at + RETRY_MS;
    reading = readContributorSnapshot(fetcher)
      .then((stats) => { if (applyStats(cast, stats, Date.now(), readRepos)) readAt = Date.now() + REFRESH_MS; })
      .catch(() => {})
      .finally(() => { reading = null; });
  };
  applyActivity(sim, cast, now);
  return {
    join() { pages++; },
    leave() { pages = Math.max(0, pages - 1); },
    message() { return false; },
    running() { return pages > 0; },
    step(at) {
      read(at);
      readPileSoon(at);
      if (at - appliedAt >= ACTIVITY_MS) {
        appliedAt = at;
        applyActivity(sim, cast, at);
        if (pile) {
          sim.setBananas(bananasAt(pile, at));
          if (sim.ring.inner !== loggedRing) {
            loggedRing = sim.ring.inner;
            logPile({ ok: true, bananas: Math.round(bananasAt(pile, at)), platform: Math.round(sim.platform * 100) / 100 });
          }
        }
      }
      sim.step(Math.min(STEP_MAX_MS, Math.max(0, at - last)) / 1000);
      last = at;
      return false;
    },
    nextTickIn: () => TICK_MS - (sim.clock - sim.t) * 1000 + TICK_SLACK_MS,
    state: () => ({ v: 1, cast: sim.oogas.map((o) => o.name) }),
    motion(frame, at) {
      if (sim.stir === sentStir && at - sentAt < KEEP_MS) return false;
      sentStir = sim.stir; sentAt = at;
      return sim.motion(frame, at);
    },
    save: () => null,
    restore() {},
    sim
  };
};

export const island = {
  id: "island", code: SIM.KIND, version: 1, venues: ["main"], tickMs: TICK_MS, stateEvery: 50,
  limits: { sockets: 160, chars: 64 },
  buckets: { any: { rate: 1, burst: 4 } },
  bucketOf: () => "any",
  parse, create
};
