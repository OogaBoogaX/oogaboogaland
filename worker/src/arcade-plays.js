// What the island's Arcade cave shows (#554): how often each cabinet has been opened to a run lately, by anyone, signed
// in or not. The count carries no identity; the address only counts against the limiter. Reads are public, shared
// through the edge cache for 30 seconds; a write is one atomic upsert, so simultaneous plays never lose a count.
import "../../src/js/arcade-cabinets.js";
import { allowed, clientIp, fromSite, json } from "./http.js";

const CABINETS = globalThis.BL.arcadeCabinets;
const WINDOW_DAYS = 30, SNAPSHOT_MS = 30000;
const today = () => Math.floor(Date.now() / 86400000);
const closed = () => json({ error: "closed" }, 503, { "retry-after": "60" });

export const countPlay = (db, game, day = today()) => db.batch([
  db.prepare("INSERT INTO cabinet_plays(game, day, plays) VALUES (?1, ?2, 1) ON CONFLICT(game, day) DO UPDATE SET plays = plays + 1").bind(game, day),
  db.prepare("DELETE FROM cabinet_plays WHERE day < ?1").bind(day - WINDOW_DAYS)
]);

export const readPlays = async (db, day = today()) => {
  const { results } = await db.prepare("SELECT game, SUM(plays) AS plays FROM cabinet_plays WHERE day > ?1 GROUP BY game").bind(day - WINDOW_DAYS).all();
  const plays = {};
  for (const row of results) if (CABINETS.get(row.game) && !CABINETS.get(row.game).outdoor) plays[row.game] = row.plays;
  return plays;
};

const snapshot = async (url, db, cache) => {
  const key = new Request(new URL("/__arcade-plays-cache/v1", url.origin));
  if (cache) {
    try {
      const hit = await cache.match(key), saved = hit && await hit.json();
      if (saved && saved.expiresAt > Date.now()) return saved;
    } catch { /* A cache failure still permits a fresh public read. */ }
  }
  const saved = { plays: await readPlays(db), expiresAt: Date.now() + SNAPSHOT_MS };
  if (cache) try { await cache.put(key, json(saved, 200, { "cache-control": "public, max-age=30" })); } catch { /* Serve the fresh read. */ }
  return saved;
};

// Injecting the cache lets the route's actual SQL run against SQLite in its checks.
export const createPlaysHandler = (cacheFor = () => globalThis.caches?.default) => async (request, env) => {
  const url = new URL(request.url), id = url.pathname.slice("/api/arcade-plays".length).replace(/^\//, "");
  if (url.search || (id && (!CABINETS.get(id) || CABINETS.get(id).outdoor))) return json({ error: "not found" }, 404);
  if (request.method !== (id ? "POST" : "GET")) return json({ error: "method not allowed" }, 405, { allow: id ? "POST" : "GET" });
  if (!env.DB) return closed();
  try {
    if (!id) {
      if (!(await allowed(env.HIGHSCORE_LIMITER, "read:" + clientIp(request)))) return json({ error: "too many reads" }, 429, { "retry-after": "60" });
      const saved = await snapshot(url, env.DB, cacheFor());
      return json({ plays: saved.plays, windowDays: WINDOW_DAYS });
    }
    if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
    if (!(await allowed(env.HIGHSCORE_LIMITER, "play:" + clientIp(request)))) return json({ error: "too many plays" }, 429, { "retry-after": "60" });
    await countPlay(env.DB, id);
    return new Response(null, { status: 204 });
  } catch { return closed(); }
};

export const handleArcadePlays = createPlaysHandler();
