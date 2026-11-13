// Narrow, authenticated opt-in diagnostics; never a generic error/log ingestion endpoint.
import { allowed, fromSite, getSessionFromRequest, json, readBody } from "./http.js";

const RETAIN = 7 * 86400, BODY_MAX = 8192;
const kinds = new Set(["room-close", "heartbeat-timeout", "room-kick", "peer-return"]);
const events = new Set(["connect", "open", "welcome", "clear", "retry", "visibility",
  "socket-error", "socket-close", "heartbeat-timeout", "kick", "peer-return"]);
const rooms = new Set(["off", "connecting", "live", "paused", "replaced", "full", "revoked", "protocol", "other"]);
const reasons = new Set(["closed", "error", "stale", "replaced", "full", "revoked", "protocol", "other"]);
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, names) => object(v) && Object.keys(v).every(key => names.includes(key));
const integer = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
const age = v => v === null || integer(v, 120000);

export const validConnectionReport = body => {
  if (!keys(body, ["v", "consent", "kind", "clientBuild", "gapMs", "events"]) ||
      body.v !== 1 || body.consent !== true || !kinds.has(body.kind) ||
      typeof body.clientBuild !== "string" || !/^(?:[a-f0-9]{8,64})?$/.test(body.clientBuild) ||
      !integer(body.gapMs, 10000) || (body.kind !== "peer-return" && body.gapMs !== 0) ||
      !Array.isArray(body.events) || !body.events.length || body.events.length > 16) return false;
  return body.events.every(e => {
    if (!keys(e, ["kind", "ageMs", "room", "hidden", "remotes", "unanswered", "voiceEnabled",
      "voiceMuted", "lastMessageAge", "lastPongAge", "code", "clean", "reason"]) ||
      !events.has(e.kind) || !rooms.has(e.room) || !integer(e.ageMs, 120000) ||
      !integer(e.remotes, 1000) || !integer(e.unanswered, 100) ||
      !["hidden", "voiceEnabled", "voiceMuted"].every(key => typeof e[key] === "boolean") ||
      !age(e.lastMessageAge) || !age(e.lastPongAge)) return false;
    if (e.kind === "socket-close") {
      if (!integer(e.code, 4999) || typeof e.clean !== "boolean") return false;
    } else if ("code" in e || "clean" in e) return false;
    if (e.kind === "kick" || e.kind === "peer-return") return reasons.has(e.reason);
    return !("reason" in e);
  });
};

export const pruneConnectionReports = db => db
  ? db.prepare("DELETE FROM connection_reports WHERE created_at < unixepoch() - ?").bind(RETAIN).run()
  : Promise.resolve();

export const createConnectionReportHandler = (session = getSessionFromRequest) => async (request, env) => {
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "POST" });
  if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
  if (!env.DB || !env.CONNECTION_REPORT_LIMITER) return json({ error: "unavailable" }, 503);
  try {
    const found = await session(request, env, true);
    if (!found) return json({ error: "unauthenticated" }, 401);
    if (!(await allowed(env.CONNECTION_REPORT_LIMITER, String(found.player.id)))) return json({ error: "limited" }, 429);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "bad content type" }, 415);
    const raw = await readBody(request, BODY_MAX);
    if (raw === null) return json({ error: "too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
    if (!validConnectionReport(body)) return json({ error: "bad report" }, 400);
    // Server-owned time/account/version. No client-supplied identity, URLs, error text or user agent.
    const version = env.CF_VERSION_METADATA?.id || "";
    const result = await env.DB.batch([
      env.DB.prepare("DELETE FROM connection_reports WHERE created_at < unixepoch() - ?").bind(RETAIN),
      env.DB.prepare(`INSERT INTO connection_reports (player_id, created_at, kind, client_build, worker_version, payload)
        SELECT ?1, unixepoch(), ?2, ?3, ?4, ?5
        WHERE (SELECT COUNT(*) FROM connection_reports) < 10000
        AND NOT EXISTS (SELECT 1 FROM connection_reports WHERE player_id = ?1 AND created_at > unixepoch() - 60)
        AND (SELECT COUNT(*) FROM connection_reports WHERE player_id = ?1 AND created_at > unixepoch() - 3600) < 6
        AND (SELECT COUNT(*) FROM connection_reports WHERE player_id = ?1 AND created_at > unixepoch() - 86400) < 20`)
        .bind(found.player.id, body.kind, body.clientBuild, version, JSON.stringify(body)),
    ]);
    if (result.some(r => !r.success)) return json({ error: "unavailable" }, 503);
    return result[1].meta.changes ? json({ stored: true }, 201) : json({ error: "limited" }, 429);
  } catch {
    // Do not echo or log payloads/session details; diagnostics failures never affect the room.
    return json({ error: "unavailable" }, 503);
  }
};
export const handleConnectionReports = createConnectionReportHandler();
