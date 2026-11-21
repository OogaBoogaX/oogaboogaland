import "../../src/js/cloud-hopper-replay-codec.js";
import "../../src/js/highscore-rules.js";
import { allowed, clientIp, fromSite, getSessionFromRequest, json } from "./http.js";
import { improve, readScores } from "./highscores.js";
import { liveSQL, winnerSQL, winnerReplay } from "./cloud-hopper-replay-store.js";

const codec = globalThis.BL.cloudHopperReplayCodec, rules = globalThis.BL.highscoreRules;
const RETAIN = 86400000, TICKET_LIFE = 3900000;
const closed = () => json({ error: "winning replay unavailable" }, 503, { "retry-after": "60" });
const readBinary = async request => {
  if (!request.body || Number(request.headers.get("content-length") || 0) > codec.MAX_BYTES) return null;
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > codec.MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const out = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out.buffer;
  } finally { reader.releaseLock(); }
};
const hashOf = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
export const createReplayHandler = (sessionFor = getSessionFromRequest) => async (request, env, ctx) => {
  const url = new URL(request.url), match = /^\/api\/cloud-hopper-replays\/(cloud-hopper-l[1-4])\/(ticket|finish|[a-f0-9]{64}\.bin)$/.exec(url.pathname);
  if (!match || url.search) return json({ error: "not found" }, 404);
  const [, game, action] = match, binary = action.endsWith(".bin"), method = binary ? "GET" : "POST";
  if (request.method !== method) return json({ error: "method not allowed" }, 405, { allow: method });
  if (!env.DB || !env.CLOUD_HOPPER_REPLAYS) return closed();
  const db = env.DB;
  try {
    if (binary) {
      if (!(await allowed(env.HIGHSCORE_LIMITER, "replay-read:" + clientIp(request)))) return json({ error: "too many reads" }, 429);
      const hash = action.slice(0, -4);
      const row = await db.prepare(`SELECT hash FROM cloud_hopper_replay_objects WHERE hash = ? AND game = ?
        AND state = 'ready' AND (expires_at > ? OR hash IN (${liveSQL}))`).bind(hash, game, Date.now()).first();
      if (!row) return json({ error: "replay not found" }, 404);
      const object = await env.CLOUD_HOPPER_REPLAYS.get(`v1/${game}/${action}`);
      if (!object) return json({ error: "replay not found" }, 404);
      return new Response(object.body, { headers: { "content-type": "application/octet-stream", "x-content-type-options": "nosniff",
        "cache-control": "public, max-age=3600, immutable", etag: `"${hash}"` } });
    }
    if (!fromSite(request, env.SITE_ORIGIN)) return json({ error: "forbidden" }, 403);
    const found = await sessionFor(request, env);
    if (!found?.player || !Number.isSafeInteger(found.player.id) || !found.session?.token_hash) return json({ error: "unauthenticated" }, 401);
    if (!(await allowed(env.HIGHSCORE_LIMITER, "write:" + found.player.id))) return json({ error: "too many writes" }, 429);
    const now = Date.now(), id = found.player.id, session = found.session.token_hash;
    if (action === "ticket") {
      // One current ticket per account/level; a global cap also bounds abandoned runs.
      const token = crypto.randomUUID();
      await db.prepare("DELETE FROM cloud_hopper_replay_tickets WHERE expires_at < ?").bind(now).run();
      await db.prepare(`INSERT INTO cloud_hopper_replay_tickets(token, player_id, game, session_hash, created_at, expires_at)
        SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT count(*) FROM cloud_hopper_replay_tickets) < 256
          OR EXISTS (SELECT 1 FROM cloud_hopper_replay_tickets WHERE player_id = ? AND game = ?)
        ON CONFLICT(player_id, game) DO UPDATE SET token = excluded.token, session_hash = excluded.session_hash,
          created_at = excluded.created_at, expires_at = excluded.expires_at, hash = NULL`)
        .bind(token, id, game, session, now, now + TICKET_LIFE, id, game).run();
      const stored = await db.prepare("SELECT token FROM cloud_hopper_replay_tickets WHERE token = ?").bind(token).first();
      return stored ? json({ token }) : closed();
    }
    if (request.headers.get("content-type") !== "application/octet-stream") return json({ error: "expected binary" }, 415);
    const token = request.headers.get("x-cloud-hopper-ticket");
    const ticket = await db.prepare(`SELECT created_at, hash FROM cloud_hopper_replay_tickets
      WHERE token = ? AND player_id = ? AND game = ? AND session_hash = ? AND expires_at > ?`).bind(token, id, game, session, now).first();
    if (!ticket) return json({ error: "run expired or account changed" }, 409);
    const bytes = await readBinary(request);
    if (!bytes) return json({ error: "too large" }, 413);
    const recording = codec.decode(bytes), rule = rules.get(game), score = Math.round(recording?.duration * 1000);
    if (!recording || recording.game !== game || recording.playerId !== id || recording.username.toLowerCase() !== found.player.login.toLowerCase()
      || recording.courseVersion !== rule.version || !rules.valid(game, game, score)
      || (found.character?.handle && recording.name.toLowerCase() !== found.character.handle.toLowerCase())
      || score > now - ticket.created_at + 2000) return json({ error: "invalid recording" }, 400);
    const hash = await hashOf(bytes);
    if (ticket.hash && ticket.hash !== hash) return json({ error: "run already submitted" }, 409);
    // Reserve before touching R2: every possible orphan has a bounded, expiring registry entry.
    await db.prepare(`UPDATE cloud_hopper_replay_tickets SET hash = ? WHERE token = ? AND (hash IS NULL OR hash = ?)`)
      .bind(hash, token, hash).run();
    const claimed = await db.prepare("SELECT hash FROM cloud_hopper_replay_tickets WHERE token = ?").bind(token).first();
    if (claimed?.hash !== hash) return json({ error: "run already submitted" }, 409);
    const winner = await db.prepare(winnerSQL).bind(game).first();
    // Slower finishes still improve their personal shared score without spending R2 storage.
    const previous = winner && await winnerReplay(db, game);
    const candidate = !winner || score < winner.score || (score === winner.score && id === winner.player_id
      && (!previous || previous.hash === hash));
    let changed = false;
    if (candidate) {
      await db.prepare(`INSERT OR IGNORE INTO cloud_hopper_replay_objects(hash, game, player_id, score, bytes, course_version, expires_at, state)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'staged' WHERE (SELECT count(*) FROM cloud_hopper_replay_objects) < 128`)
        .bind(hash, game, id, score, bytes.byteLength, recording.courseVersion, now + RETAIN).run();
      // Renew the reservation before any write, so cleanup cannot reclaim a retried orphan mid-upload.
      await db.prepare("UPDATE cloud_hopper_replay_objects SET expires_at = MAX(expires_at, ?) WHERE hash = ? AND state <> 'deleting'")
        .bind(Date.now() + RETAIN, hash).run();
      const object = await db.prepare("SELECT state FROM cloud_hopper_replay_objects WHERE hash = ?").bind(hash).first();
      if (!object || object.state === "deleting") return closed();
      if (object.state !== "ready" || !await env.CLOUD_HOPPER_REPLAYS.head(`v1/${game}/${hash}.bin`)) await env.CLOUD_HOPPER_REPLAYS.put(`v1/${game}/${hash}.bin`, bytes,
        { httpMetadata: { contentType: "application/octet-stream", cacheControl: "public, max-age=3600, immutable" } });
      // D1's batch commits the accepted score and matching pointer together. R2 failure happened before this.
      // Re-check identity/ticket inside SQL: signing out/deletion during an upload cannot publish a replay.
      const valid = `EXISTS (SELECT 1 FROM sessions WHERE token_hash = ? AND player_id = ? AND expires_at > unixepoch())
        AND EXISTS (SELECT 1 FROM cloud_hopper_replay_tickets WHERE token = ? AND hash = ? AND expires_at > ?)
        AND EXISTS (SELECT 1 FROM players WHERE id = ? AND login = ? AND banned_at IS NULL)`;
      const args = [session, id, token, hash, Date.now(), id, found.player.login];
      changed = await improve(db, game, rule, game, score, found, [
        db.prepare(`UPDATE cloud_hopper_replay_objects SET state = 'ready' WHERE hash = ? AND state <> 'deleting' AND ${valid}`).bind(hash, ...args),
        db.prepare(`INSERT INTO cloud_hopper_replay_winners(game, player_id, score, achieved, hash)
          SELECT ?, w.player_id, w.score, w.achieved, ? FROM (${winnerSQL}) w
          WHERE w.player_id = ? AND w.score = ? AND ${valid}
            AND EXISTS (SELECT 1 FROM cloud_hopper_replay_objects WHERE hash = ? AND state = 'ready')
          ON CONFLICT(game) DO UPDATE SET player_id = excluded.player_id, score = excluded.score,
            achieved = excluded.achieved, hash = excluded.hash
          WHERE cloud_hopper_replay_winners.player_id <> excluded.player_id
            OR cloud_hopper_replay_winners.score <> excluded.score OR cloud_hopper_replay_winners.achieved <> excluded.achieved`)
          .bind(game, hash, game, id, score, ...args, hash),
      ], { token, hash });
    } else changed = await improve(db, game, rule, game, score, found, [], { token, hash });
    if (env.ROOM && (changed || candidate)) {
      // Preserve the score notification/recovery path used by ordinary score writes.
      const notify = Promise.resolve().then(() => env.ROOM.getByName("island").refreshHighscores(game)).catch(() => {});
      if (ctx) ctx.waitUntil(notify); else await notify;
    }
    return json(await readScores(db, game, rule, true));
  } catch { return closed(); }
};
export const handleCloudHopperReplays = createReplayHandler();
