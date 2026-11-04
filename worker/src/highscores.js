// Shared game records: reads are public; only the current GitHub session may improve one.
// The JSON entry is compared and replaced inside SQL, so concurrent finishes cannot lose a best.
import "../../src/js/highscore-rules.js";
import { readHighscores, readArcade } from "./highscore-store.js";
import { allowed, clientIp, fromSite, getSessionFromRequest, json } from "./http.js";
import { winnerReplay } from "./cloud-hopper-replay-store.js";

const rules = globalThis.BL.highscoreRules;
const BODY_MAX = 512;
const PLAYER_LIMIT = rules.MAX_PLAYERS;
const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const closed = () => json({ error: "closed" }, 503, { "retry-after": "60" });

const readBody = async (request) => {
  if (Number(request.headers.get("content-length") || 0) > BODY_MAX) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), bytes = new Uint8Array(BODY_MAX);
  let used = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (used + value.byteLength > BODY_MAX) { await reader.cancel(); return null; }
      bytes.set(value, used); used += value.byteLength;
    }
    return new TextDecoder().decode(bytes.subarray(0, used));
  } finally { reader.releaseLock(); }
};

export const readScores = async (db, game, rule, replayEnabled = false) => {
  const board = await readHighscores(db, game);
  if (!replayEnabled || !/^cloud-hopper-l[1-4]$/.test(game)) return board;
  let replay = await winnerReplay(db, game);
  if (replay && (board.highscores[replay.username] !== replay.score || board.achieved[replay.username] !== replay.achieved
    || Object.keys(board.highscores).some(key => board.highscores[key] < replay.score
      || board.highscores[key] === replay.score && board.achieved[key] < replay.achieved))) replay = null;
  return { ...board, replay };
};

const SNAPSHOT_MS = 30000;
const snapshots = new WeakMap();
const arcadeSnapshot = async (url, db, cache) => {
  const key = new Request(new URL("/__highscores-cache/v3/arcade", url.origin));
  if (cache) {
    try {
      const hit = await cache.match(key), saved = hit && await hit.json();
      if (saved && saved.expiresAt > Date.now()) return saved;
    } catch { /* A cache failure still permits a fresh public read. */ }
  }
  // Coalesce concurrent misses in this isolate. Other data centers have independent caches.
  let running = snapshots.get(db);
  if (!running) { running = new Map(); snapshots.set(db, running); }
  if (!running.has(url.origin)) running.set(url.origin, (async () => {
    const boards = await readArcade(db), saved = { boards, expiresAt: Date.now() + SNAPSHOT_MS };
    if (cache) try { await cache.put(key, json(saved, 200, { "cache-control": "public, max-age=30" })); } catch { /* Serve the fresh read. */ }
    return saved;
  })());
  const pending = running.get(url.origin);
  try { return await pending; } finally { if (running.get(url.origin) === pending) running.delete(url.origin); }
};

export const improve = async (db, game, rule, machine, score, found, after = [], ticket = null, runId = ticket?.token || null) => {
  const { player, session } = found;
  const attributed = rule.scoreType === "ooga", key = attributed ? player.login.toLowerCase() : machine;
  const path = "$." + JSON.stringify(key), at = Date.now(), level = /^cloud-hopper-l[1-4]$/.test(game);
  const cabinet = rules.cabinets.includes(game), runTable = cabinet ? "cabinet_runs" : "cloud_hopper_runs", distinct = (level || cabinet) && runId;
  const better = rule.direction === "asc" ? "<" : ">", worst = rule.direction === "asc" ? "MAX" : "MIN";
  const change = db.prepare(`UPDATE game_highscores SET
    highscores = json_set(highscores, ?1, ?2),
    owners = CASE WHEN ?3 THEN json_set(owners, ?1, ?4) ELSE owners END,
    achieved = json_set(achieved, ?1, MAX(updated_at + 1, ?5)), revision = revision + 1, updated_at = MAX(updated_at + 1, ?5)
    WHERE game_id = ?6 AND rules_version = ?7
      ${distinct ? `AND NOT EXISTS (SELECT 1 FROM ${runTable} WHERE game = ?6 AND player_id = ?4 AND run_id = ?13)` : ""}
      ${ticket ? `AND EXISTS (SELECT 1 FROM cloud_hopper_replay_tickets WHERE token = ?11 AND hash = ?12
        AND player_id = ?4 AND game = ?6 AND session_hash = ?10 AND expires_at > ?5)` : ""}
      AND EXISTS (SELECT 1 FROM players WHERE id = ?4 AND login = ?8 AND banned_at IS NULL)
      AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?10 AND player_id = ?4 AND expires_at > unixepoch())
      AND (NOT ?3 OR json_extract(owners, ?1) IS NULL OR json_extract(owners, ?1) = ?4)
      AND (json_extract(highscores, ?1) IS NULL OR ?2 ${better} json_extract(highscores, ?1))
      AND (NOT ?3 OR json_extract(highscores, ?1) IS NOT NULL
        OR (SELECT count(*) FROM json_each(highscores)) < ?9
        OR ?2 ${better} (SELECT ${worst}(value) FROM json_each(highscores)))`)
    .bind(path, score, attributed ? 1 : 0, player.id, at, game, rule.version, player.login, PLAYER_LIMIT, session.token_hash, ...(ticket || distinct ? [ticket?.token || null, ticket?.hash || null] : []), ...(distinct ? [runId] : []));
  if (cabinet && runId) {
    // Every distinct eligible finish can enter the top ten, even if it does not beat the machine record.
    // Session checks and insertion share the best-record transaction; retries cannot change either score.
    const run = db.prepare(`INSERT OR IGNORE INTO cabinet_runs(game, run_id, player_id, score, achieved)
      SELECT ?1, ?2, ?3, ?4, CASE WHEN changes() > 0 THEN updated_at ELSE MAX(updated_at + 1, ?5) END
      FROM game_highscores WHERE game_id = ?1 AND rules_version = ?6
        AND EXISTS (SELECT 1 FROM players WHERE id = ?3 AND login = ?7 AND banned_at IS NULL)
        AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?8 AND player_id = ?3 AND expires_at > unixepoch())
        AND ((SELECT count(*) FROM cabinet_runs WHERE game = ?1) < ?9
          OR ?4 > (SELECT MIN(score) FROM cabinet_runs WHERE game = ?1))`)
      .bind(game, runId, player.id, score, at, rule.version, player.login, session.token_hash, PLAYER_LIMIT);
    const result = await db.batch([change, run]);
    return result.some(row => row.meta.changes > 0);
  }
  if (!attributed) return (await change.run()).meta.changes > 0;
  // At most one newcomer entered the bounded board. Drop its worst entry in the same D1
  // transaction, with the latest achievement losing a tie, then the larger stable account id.
  const order = rule.direction === "asc" ? "DESC" : "ASC";
  const last = `(SELECT '$.' || json_quote(h.key) FROM json_each(highscores) h
    CROSS JOIN json_each(achieved, '$.' || json_quote(h.key)) a
    CROSS JOIN json_each(owners, '$.' || json_quote(h.key)) o
    ORDER BY h.value ${order}, a.value DESC, o.value DESC LIMIT 1)`;
  const run = level ? db.prepare(`INSERT OR IGNORE INTO cloud_hopper_runs(game, run_id, player_id, score, achieved)
    SELECT ?6, COALESCE(?13, 'legacy:' || ?4 || ':' || ?2 || ':' || json_extract(achieved, ?1)), ?4, ?2,
      CASE WHEN changes() > 0 THEN json_extract(achieved, ?1) ELSE MAX(updated_at + 1, ?5) END
    FROM game_highscores WHERE game_id = ?6 AND rules_version = ?7
      AND (?13 IS NOT NULL OR changes() > 0)
      AND EXISTS (SELECT 1 FROM players WHERE id = ?4 AND login = ?8 AND banned_at IS NULL)
      AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?10 AND player_id = ?4 AND expires_at > unixepoch())
      ${ticket ? `AND EXISTS (SELECT 1 FROM cloud_hopper_replay_tickets WHERE token = ?11 AND hash = ?12
        AND player_id = ?4 AND game = ?6 AND session_hash = ?10 AND expires_at > ?5)` : ""}
      AND ((SELECT count(*) FROM cloud_hopper_runs WHERE game = ?6) < ?9
        OR ?2 < (SELECT MAX(score) FROM cloud_hopper_runs WHERE game = ?6))`)
    .bind(path, score, attributed ? 1 : 0, player.id, at, game, rule.version, player.login, PLAYER_LIMIT,
      session.token_hash, ticket?.token || null, ticket?.hash || null, runId) : null;
  const result = await db.batch([change, ...(run ? [run] : []), db.prepare(`UPDATE game_highscores SET
    highscores = json_remove(highscores, ${last}), owners = json_remove(owners, ${last}),
    achieved = json_remove(achieved, ${last})
    WHERE game_id = ? AND (SELECT count(*) FROM json_each(highscores)) > ?`).bind(game, PLAYER_LIMIT), ...after]);
  return result[0].meta.changes > 0 || !!run && result[1].meta.changes > 0;
};

// Injecting the session boundary lets the route's actual SQL run against SQLite in its checks.
export const createHighscoreHandler = (sessionFor = getSessionFromRequest, cacheFor = () => globalThis.caches?.default) => async (request, env, ctx) => {
  const url = new URL(request.url), game = url.pathname.slice("/api/highscores/".length), rule = rules.get(game);
  const snapshot = game === "arcade" || game === "arcade-live";
  if (!url.pathname.startsWith("/api/highscores/") || (!rule && !snapshot) || url.search) return json({ error: "not found" }, 404);
  if ((snapshot && request.method !== "GET") || (request.method !== "GET" && request.method !== "POST")) return json({ error: "method not allowed" }, 405, { allow: snapshot ? "GET" : "GET, POST" });
  if (!env.DB) return closed();
  try {
    if (request.method === "POST") {
      if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
      const found = await sessionFor(request, env);
      if (!found || !Number.isSafeInteger(found.player.id) || found.player.id <= 0 || !LOGIN.test(found.player.login) || found.player.login.includes("--")
        || typeof found.session?.token_hash !== "string") return json({ error: "unauthenticated" }, 401);
      if (!(await allowed(env.HIGHSCORE_LIMITER, "write:" + found.player.id))) return json({ error: "too many scores" }, 429, { "retry-after": "60" });
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "expected json" }, 415);
      const raw = await readBody(request);
      if (raw === null) return json({ error: "too large" }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
      if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !["machine", "score", "version", "playerId", ...(/^cloud-hopper-l[1-4]$/.test(game) || rules.cabinets.includes(game) ? ["runId"] : [])].includes(key))
        || (body.runId !== undefined && (typeof body.runId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(body.runId)))
        || body.version !== rule.version || !rules.valid(game, body.machine, body.score)) return json({ error: "invalid score" }, 400);
      if (body.playerId !== found.player.id) return json({ error: "account changed" }, 409);
      const changed = await improve(env.DB, game, rule, body.machine, body.score, found, [], null, body.runId || null);
      if (changed && env.ROOM) {
        // RPC is available only through the Worker binding, never an HTTP or client message route.
        // The room reads authoritative D1; the caller supplies no score. Durable recovery remains on failure.
        const notify = Promise.resolve().then(() => env.ROOM.getByName("island").refreshHighscores(game)).catch(() => {});
        if (ctx) ctx.waitUntil(notify); else await notify;
      }
    } else if (!(await allowed(env.HIGHSCORE_LIMITER, "read:" + clientIp(request)))) {
      return json({ error: "too many reads" }, 429, { "retry-after": "60" });
    }
    if (snapshot) {
      if (game === "arcade-live") return json({ boards: await readArcade(env.DB), refreshAfterMs: 0 });
      const saved = await arcadeSnapshot(url, env.DB, cacheFor());
      return json({ boards: saved.boards, refreshAfterMs: Math.max(0, saved.expiresAt - Date.now()) });
    }
    const scores = await readScores(env.DB, game, rule, !!env.CLOUD_HOPPER_REPLAYS);
    return scores ? json(scores) : closed();
  } catch { return closed(); }
};

export const handleHighscores = createHighscoreHandler();
