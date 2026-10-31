// Shared game records: reads are public; only the current GitHub session may improve one.
// The JSON entry is compared and replaced inside SQL, so concurrent finishes cannot lose a best.
import "../../src/js/highscore-rules.js";
import { allowed, clientIp, fromSite, getSessionFromRequest, json } from "./http.js";

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

const readScores = async (db, game, rule) => {
  const row = await db.prepare("SELECT highscores, achieved, score_type, direction, unit, rules_version, revision FROM game_highscores WHERE game_id = ?")
    .bind(game).first();
  if (!row || row.rules_version !== rule.version || row.score_type !== rule.scoreType || row.direction !== rule.direction || row.unit !== rule.unit) return null;
  return { game, highscores: JSON.parse(row.highscores), achieved: JSON.parse(row.achieved), version: rule.version,
    scoreType: rule.scoreType, direction: rule.direction, unit: rule.unit, revision: row.revision };
};

const improve = async (db, game, rule, machine, score, found) => {
  const { player, session } = found;
  const attributed = rule.scoreType === "ooga", key = attributed ? player.login.toLowerCase() : machine;
  const path = "$." + JSON.stringify(key), at = Date.now();
  const better = rule.direction === "asc" ? "<" : ">", worst = rule.direction === "asc" ? "MAX" : "MIN";
  const change = db.prepare(`UPDATE game_highscores SET
    highscores = json_set(highscores, ?1, ?2),
    owners = CASE WHEN ?3 THEN json_set(owners, ?1, ?4) ELSE owners END,
    achieved = json_set(achieved, ?1, MAX(updated_at + 1, ?5)), revision = revision + 1, updated_at = MAX(updated_at + 1, ?5)
    WHERE game_id = ?6 AND rules_version = ?7
      AND EXISTS (SELECT 1 FROM players WHERE id = ?4 AND login = ?8 AND banned_at IS NULL)
      AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?10 AND player_id = ?4 AND expires_at > unixepoch())
      AND (NOT ?3 OR json_extract(owners, ?1) IS NULL OR json_extract(owners, ?1) = ?4)
      AND (json_extract(highscores, ?1) IS NULL OR ?2 ${better} json_extract(highscores, ?1))
      AND (NOT ?3 OR json_extract(highscores, ?1) IS NOT NULL
        OR (SELECT count(*) FROM json_each(highscores)) < ?9
        OR ?2 ${better} (SELECT ${worst}(value) FROM json_each(highscores)))`)
    .bind(path, score, attributed ? 1 : 0, player.id, at, game, rule.version, player.login, PLAYER_LIMIT, session.token_hash);
  if (!attributed) { await change.run(); return; }
  // At most one newcomer entered the bounded board. Drop its worst entry in the same D1
  // transaction, with the latest achievement losing a tie, then the larger stable account id.
  const order = rule.direction === "asc" ? "DESC" : "ASC";
  const last = `(SELECT '$.' || json_quote(h.key) FROM json_each(highscores) h
    CROSS JOIN json_each(achieved, '$.' || json_quote(h.key)) a
    CROSS JOIN json_each(owners, '$.' || json_quote(h.key)) o
    ORDER BY h.value ${order}, a.value DESC, o.value DESC LIMIT 1)`;
  await db.batch([change, db.prepare(`UPDATE game_highscores SET
    highscores = json_remove(highscores, ${last}), owners = json_remove(owners, ${last}),
    achieved = json_remove(achieved, ${last})
    WHERE game_id = ? AND (SELECT count(*) FROM json_each(highscores)) > ?`).bind(game, PLAYER_LIMIT)]);
};

// Injecting the session boundary lets the route's actual SQL run against SQLite in its checks.
export const createHighscoreHandler = (sessionFor = getSessionFromRequest) => async (request, env) => {
  const url = new URL(request.url), game = url.pathname.slice("/api/highscores/".length), rule = rules.get(game);
  if (!url.pathname.startsWith("/api/highscores/") || !rule || url.search) return json({ error: "not found" }, 404);
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "GET, POST" });
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
      if (!body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).some(key => !["machine", "score", "version", "playerId"].includes(key))
        || body.version !== rule.version || !rules.valid(game, body.machine, body.score)) return json({ error: "invalid score" }, 400);
      if (body.playerId !== found.player.id) return json({ error: "account changed" }, 409);
      await improve(env.DB, game, rule, body.machine, body.score, found);
    } else if (!(await allowed(env.HIGHSCORE_LIMITER, "read:" + clientIp(request)))) {
      return json({ error: "too many reads" }, 429, { "retry-after": "60" });
    }
    const scores = await readScores(env.DB, game, rule);
    return scores ? json(scores) : closed();
  } catch { return closed(); }
};

export const handleHighscores = createHighscoreHandler();
