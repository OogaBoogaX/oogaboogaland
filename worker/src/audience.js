// Ooga Chat's audience (#665): one Durable Object, `audience`, apart from the island's Room and its 32 players, that
// owns who listens and who speaks in each outdoor zone (`main`, `dsb`). It holds Ooga Chat's sockets, which reach it only
// through the private bridge (ChatBridge.fetch, with the principal the edge wrote from its own session), and hears the
// island's own players from the Room (`world`): who publishes outdoors where, and who is in the island's voice at all.
// The roster itself is audience-model.js; this file is its host: sockets, messages, leases' clocks, persistence, fanout.
//
// One object serves both zones, so one identity's sources and leases are serialized in one place: the island's voice
// always wins over a chat speaker of the same identity, and one identity holds one speaker lease across zones and tabs.
// Sockets hibernate (their state rides their attachments); the epoch, each zone's revision and the island's last word
// are stored, so a woken object carries on from the same revision and clients never resync for a nap. Nothing runs on a
// timer while idle: the alarm is set only for a pending lease's expiry or a connection's re-authentication deadline.
//
// The app's protocol (audience protocol 1, docs/ooga-chat-app.md and docs/ooga-chat-backend.md):
//   page:   { type: "join", zone, protocol: 1 }   { type: "resync", zone }
//           { type: "setRole", requestId, role: "speaker" | "listener" }   { type: "setMic", requestId, muted }
//   server: { type: "snapshot", zone, epoch, revision, participants, you, limits, features }
//           { type: "delta", zone, epoch, base, revision, upsert, remove: [{ id, generation }] }
//           { type: "you", zone, you }   { type: "result", requestId, ok, error?, you? }
// Close codes: 4401 the session ended or needs checking again, 4426 another protocol revision, 4429 full or too many
// tabs, 4400 an unreadable frame. The Room relays the same roster to the island's panel in its own shape (room-audience.js).

import { DurableObject } from "cloudflare:workers";
import { appRow, createAudience, DEFAULT_LIMITS, ID, isZone, ZONES } from "./audience-model.js";
import { decideCapability } from "./chat-capability.js";
import { contributorFor } from "./contributor-access.js";
import { readContributorSnapshot } from "./contributor-policy.js";

export const AUDIENCE_NAME = "audience";
export const AUDIENCE_PROTOCOL = 1;
export const AUDIENCE_FEATURES = ["roles-v1"];
export const FRAME_MAX = 4096;
export const PENDING_MS = 30 * 1000;
export const REAUTH_MS = 60 * 60 * 1000;
export const CLOSE = { bad: 4400, auth: 4401, protocol: 4426, full: 4429 };
const MSG_HZ = 10, MSG_BURST = 20;
const REPLIES_KEPT = 16;
const CONTRIBUTIONS_MS = 10 * 60 * 1000;
const PRINCIPAL = /^pr_[A-Za-z0-9_-]{22}$/;
const LOGIN = /^[\w.-]{1,39}$/;
const PATH = /^\/api\/chat\/avatar\/pr_[A-Za-z0-9_-]{22}\/[0-9a-f]{16}$/;

const positive = (value, fallback, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
};
export const limitsOf = (env) => ({ ...DEFAULT_LIMITS,
  listeners: positive(env.AUDIENCE_LISTENERS, DEFAULT_LIMITS.listeners, 5000),
  chatSpeakers: positive(env.AUDIENCE_SPEAKERS, DEFAULT_LIMITS.chatSpeakers, 64) });

/** The principal ChatBridge handed on, checked again here: anything malformed is no connection. */
export const readPrincipal = (raw, now = Date.now()) => {
  let who;
  try { who = JSON.parse(raw || ""); } catch { return null; }
  if (!who || !PRINCIPAL.test(who.principal) || (who.provider !== "github" && who.provider !== "x")) return null;
  const id = `${who.provider === "github" ? "gh" : "x"}:${who.providerUserId}`;
  if (!ID.test(id) || typeof who.login !== "string" || !LOGIN.test(who.login)) return null;
  if (!Number.isSafeInteger(who.sessionExpiresAt) || who.sessionExpiresAt <= now) return null;
  const display = typeof who.display === "string" && who.display.length <= 50 ? who.display : who.login;
  return {
    id, principal: who.principal, provider: who.provider, providerUserId: who.providerUserId, login: who.login, display,
    avatar: typeof who.avatar === "string" && PATH.test(who.avatar) ? who.avatar : null,
    character: typeof who.character === "string" && /^[\w.-]{1,40}$/.test(who.character) ? who.character : null,
    eligible: who.provider === "github" && who.eligible === true,
    authUntil: Math.min(who.sessionExpiresAt, now + REAUTH_MS),
  };
};

const take = (bucket, now) => {
  bucket.tokens = Math.min(MSG_BURST, bucket.tokens + (now - bucket.at) * MSG_HZ / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
};

export class Audience extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sockets = new Map();
    this.replies = new Map();
    this.buckets = new Map();
    this.watching = new Set();
    this.island = { seq: 0, speakers: [], active: [] };
    this.roomQueue = Promise.resolve();
    this.genAt = 0;
    this.contributions = { at: 0, map: null, pending: null };
    // The island's contributor lookup (contributor-access.js), on the instance so a check can stand in its own.
    this.contributorFor = contributorFor;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      let meta = await ctx.storage.get("meta");
      if (!meta) { meta = { epoch: Date.now(), revs: null }; await ctx.storage.put("meta", meta); }
      this.model = createAudience({ epoch: meta.epoch, limits: limitsOf(env), revs: meta.revs });
      this.island = (await ctx.storage.get("world")) || this.island;
      this.watching = new Set((await ctx.storage.get("watch")) || []);
      // A woken object rebuilds its roster from its sockets' attachments and the island's last word, at the stored
      // revision: what clients already hold is still true, so nothing is sent. A socket already closing is restored too,
      // so the close event that woke the object drops its row with a delta; skipped, its row would vanish here without
      // one and every other client would keep a departed person at an unchanged revision.
      for (const ws of ctx.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (!a || !a.conn) continue;
        if (this.model.connect(a.conn, a.info, true).ok) this.sockets.set(a.conn.connId, ws);
      }
      this.model.setWorld(this.island.speakers, this.island.active);
      this.model.commit();
      for (const zone of ZONES) this.model.zones[zone].rev = meta.revs && Number.isSafeInteger(meta.revs[zone]) ? meta.revs[zone] : 0;
    });
  }

  background(task) { if (this.ctx.waitUntil) this.ctx.waitUntil(task); else task.catch(() => {}); }
  nextGeneration() { this.genAt = Math.max(Date.now(), this.genAt + 1); return this.genAt; }

  send(ws, msg) {
    try { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); } catch { /* closing: its close event drops it */ }
  }

  save(connId) {
    const ws = this.sockets.get(connId), c = this.model.conns.get(connId);
    if (!ws || !c) return;
    const p = this.model.people.get(c.id);
    ws.serializeAttachment({ conn: { connId: c.connId, id: c.id, principal: c.principal, providerUserId: c.providerUserId, zone: c.zone, lease: c.lease,
      mic: c.mic, hand: c.hand, eligible: c.eligible, authUntil: c.authUntil }, info: p.info });
  }

  /** Commit what changed, store the revisions, and send every zone's delta to its clients and to a watching Room. */
  async flush() {
    const deltas = this.model.commit();
    if (!deltas.length) return deltas;
    await this.ctx.storage.put("meta", { epoch: this.model.epoch, revs: this.model.revs() });
    for (const delta of deltas) {
      const upsert = delta.upsert.map((row) => appRow(row));
      const common = JSON.stringify({ type: "delta", zone: delta.zone, epoch: delta.epoch, base: delta.base, revision: delta.rev, upsert, remove: delta.remove });
      const own = new Set(delta.upsert.map((row) => row.id));
      for (const c of this.model.conns.values()) {
        if (c.zone !== delta.zone) continue;
        const ws = this.sockets.get(c.connId);
        if (!ws) continue;
        if (!own.has(c.id)) { this.send(ws, common); continue; }
        this.send(ws, { type: "delta", zone: delta.zone, epoch: delta.epoch, base: delta.base, revision: delta.rev,
          upsert: delta.upsert.map((row) => appRow(row, c.id)), remove: delta.remove });
      }
      if (this.watching.has(delta.zone) && this.env.ROOM) {
        // In order, one at a time: the Room relays each to the island's panels, which apply a delta only on its base.
        this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceDelta(delta)).catch(() => {});
        this.background(this.roomQueue);
      }
    }
    return deltas;
  }

  snapshotFor(c) {
    const snap = this.model.snapshot(c.zone);
    return { type: "snapshot", zone: c.zone, epoch: snap.epoch, revision: snap.rev, participants: snap.rows.map((row) => appRow(row, c.id)),
      you: this.model.youOf(c.connId), limits: { listeners: limitsOf(this.env).listeners, chatSpeakers: limitsOf(this.env).chatSpeakers },
      features: AUDIENCE_FEATURES };
  }

  tellYou(connId) {
    const c = this.model.conns.get(connId), ws = this.sockets.get(connId);
    if (c && ws && c.zone) this.send(ws, { type: "you", zone: c.zone, you: this.model.youOf(connId) });
  }

  async scheduleAlarm() {
    let next = Infinity;
    for (const c of this.model.conns.values()) {
      if (c.lease && c.lease.state === "pending") next = Math.min(next, c.lease.until);
      next = Math.min(next, c.authUntil);
    }
    if (next === Infinity) return;
    const current = await this.ctx.storage.getAlarm();
    if (!current || current > next) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    const now = Date.now();
    for (const c of [...this.model.conns.values()]) {
      if (c.authUntil <= now) { this.close(c.connId, CLOSE.auth, "auth_required"); continue; }
      if (c.lease && c.lease.state === "pending" && c.lease.until <= now) {
        const lease = this.model.endLease(c.connId, c.lease.generation);
        this.save(c.connId);
        this.leaseEnded(c.connId, lease, "media_timeout");
        this.tellYou(c.connId);
      }
    }
    await this.flush();
    await this.scheduleAlarm();
  }

  /** A lease ended: its publication is retired by the media broker (#666); here only the record. */
  leaseEnded(_connId, _lease, _reason) {}

  close(connId, code, reason) {
    const ws = this.sockets.get(connId);
    this.drop(connId);
    if (ws) { try { ws.serializeAttachment(null); ws.close(code, reason); } catch { /* already closed */ } }
  }

  drop(connId) {
    const c = this.model.disconnect(connId);
    this.sockets.delete(connId);
    this.replies.delete(connId);
    this.buckets.delete(connId);
    if (c && c.lease) this.leaseEnded(connId, c.lease, "left");
    return c;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 });
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = readPrincipal(request.headers.get("x-audience-principal"));
    if (!who) return new Response("Forbidden", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [connId, who.id]);
    const { id, principal, providerUserId, eligible, authUntil, provider, login, display, avatar, character } = who;
    const res = this.model.connect({ connId, id, principal, providerUserId, eligible, authUntil }, { provider, login, display, avatar, character });
    if (!res.ok) {
      server.close(CLOSE.full, res.code);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.sockets.set(connId, server);
    this.save(connId);
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const a = ws.deserializeAttachment();
    const c = a && a.conn && this.model.conns.get(a.conn.connId);
    if (!c || this.sockets.get(c.connId) !== ws) return;
    if (typeof message !== "string" || message.length > FRAME_MAX) { this.close(c.connId, CLOSE.bad, "unreadable"); return; }
    let msg;
    try { msg = JSON.parse(message); } catch { this.close(c.connId, CLOSE.bad, "unreadable"); return; }
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
    const now = Date.now();
    if (c.authUntil <= now) { this.close(c.connId, CLOSE.auth, "auth_required"); return; }
    let bucket = this.buckets.get(c.connId);
    if (!bucket) this.buckets.set(c.connId, bucket = { tokens: MSG_BURST, at: now });
    if (!take(bucket, now)) { if (msg.requestId !== undefined) this.result(c.connId, msg.requestId, { ok: false, code: "rate_limited", retryable: true }); return; }
    if (msg.type === "join") return this.onJoin(c, msg);
    if (msg.type === "resync") { if (c.zone && msg.zone === c.zone) this.send(ws, this.snapshotFor(c)); return; }
    if (msg.type === "setRole" || msg.type === "setMic") return this.onRequest(c, msg);
  }

  async onJoin(c, msg) {
    if (msg.protocol !== undefined && msg.protocol !== AUDIENCE_PROTOCOL) { this.close(c.connId, CLOSE.protocol, "protocol_unsupported"); return; }
    const r = this.model.join(c.connId, msg.zone);
    if (!r.ok) {
      if (r.code === "audience_full") this.close(c.connId, CLOSE.full, "audience_full");
      else this.send(this.sockets.get(c.connId), { type: "error", code: r.code });
      return;
    }
    if (r.endedLease) this.leaseEnded(c.connId, r.endedLease, "zone");
    this.save(c.connId);
    await this.flush();
    const ws = this.sockets.get(c.connId);
    if (ws) this.send(ws, this.snapshotFor(c));
  }

  result(connId, requestId, outcome) {
    const reply = { type: "result", requestId, ok: outcome.ok, ...(outcome.ok ? {} : { error: { code: outcome.code, retryable: !!outcome.retryable } }), you: this.model.youOf(connId) };
    let kept = this.replies.get(connId);
    if (!kept) this.replies.set(connId, kept = new Map());
    kept.set(requestId, reply);
    if (kept.size > REPLIES_KEPT) kept.delete(kept.keys().next().value);
    const ws = this.sockets.get(connId);
    if (ws) this.send(ws, reply);
  }

  async onRequest(c, msg) {
    if (!Number.isSafeInteger(msg.requestId) || msg.requestId < 0) return;
    // A retried request gets its first answer again, whatever has happened since.
    const kept = this.replies.get(c.connId);
    if (kept && kept.has(msg.requestId)) { this.send(this.sockets.get(c.connId), kept.get(msg.requestId)); return; }
    let outcome;
    if (msg.type === "setMic") outcome = this.model.setMic(c.connId, msg.muted === true);
    else if (msg.role === "listener") { const lease = this.model.endLease(c.connId); if (lease) this.leaseEnded(c.connId, lease, "listener"); outcome = { ok: true }; }
    else if (msg.role === "speaker") outcome = await this.requestSpeaker(c);
    else outcome = { ok: false, code: "malformed" };
    if (this.model.conns.get(c.connId) !== c) return;
    this.save(c.connId);
    await this.flush();
    this.result(c.connId, msg.requestId, outcome);
    await this.scheduleAlarm();
  }

  /** The island decides afresh, now, whatever the edge's cached answer said; the connection must still be the same. */
  async requestSpeaker(c) {
    if (!c.eligible) return { ok: false, code: "capability_required" };
    if (!c.zone) return { ok: false, code: "zone_required" };
    const zone = c.zone;
    let answer;
    try {
      answer = await decideCapability(this.env, { provider: "github", providerUserId: c.providerUserId, login: this.model.people.get(c.id).info.login }, this.contributorFor);
    } catch { answer = { state: "unknown" }; }
    if (this.model.conns.get(c.connId) !== c || c.zone !== zone) return { ok: false, code: "stale_epoch" };
    if (answer.state !== "eligible") {
      if (answer.state === "ineligible") c.eligible = false;
      return { ok: false, code: answer.state === "unknown" ? "capability_unavailable" : "capability_required", retryable: answer.state === "unknown" };
    }
    return this.model.requestSpeaker(c.connId, { eligible: true, generation: this.nextGeneration(), until: Date.now() + PENDING_MS });
  }

  async webSocketClose(ws) { return this.closed(ws); }
  async webSocketError(ws) { return this.closed(ws); }
  async closed(ws) {
    const a = ws.deserializeAttachment();
    const connId = a && a.conn && a.conn.connId;
    if (!connId || this.sockets.get(connId) !== ws) return;
    this.drop(connId);
    await this.flush();
  }

  // --- the Room's and the bridge's calls (RPC) ---

  /** The island's whole word on its players, newest `seq` wins: who publishes outdoors where, who is in its voice. */
  async world(seq, speakers, active) {
    if (!Number.isSafeInteger(seq) || seq <= this.island.seq || !Array.isArray(speakers) || !Array.isArray(active)) return { ok: false };
    const clean = speakers.slice(0, 64).filter((s) => s && ID.test(s.id) && isZone(s.zone)).map((s) => ({
      id: s.id, zone: s.zone, mic: s.mic === "on" ? "on" : "muted", character: typeof s.character === "string" ? s.character.slice(0, 40) : null,
      hand: typeof s.hand === "string" ? s.hand.slice(0, 32) : "", speaking: s.speaking === true,
      info: { provider: "github", login: String(s.login || "").slice(0, 39), display: String(s.display || s.login || "").slice(0, 50), character: s.character || null,
        contributions: this.contributionOf(s.login) },
    }));
    this.island = { seq, speakers: clean, active: active.slice(0, 64).filter((id) => ID.test(id)) };
    await this.ctx.storage.put("world", this.island);
    const ended = this.model.setWorld(this.island.speakers, this.island.active);
    for (const { connId, lease } of ended) { this.save(connId); this.leaseEnded(connId, lease, "source_in_use"); this.tellYou(connId); }
    await this.flush();
    if (clean.length) this.refreshContributions();
    return { ok: true };
  }

  /** A canonical snapshot of a zone, for the Room's panels. */
  snapshot(zone) {
    if (!isZone(zone)) return null;
    return this.model.snapshot(zone);
  }

  /** Which zones the Room has panels open on; deltas go to it for those alone. */
  async watch(zones) {
    const next = new Set((Array.isArray(zones) ? zones : []).filter(isZone));
    this.watching = next;
    await this.ctx.storage.put("watch", [...next]);
    return { epoch: this.model.epoch };
  }

  /**
   * A principal's access ends (`logout`, `logout-all`, `deleted`) or narrows (`eligibility`): every socket of that
   * principal closes (4401) or, for eligibility, drops its lease and its right to ask again. Safe to repeat.
   */
  async revoke(principal, reason) {
    if (!principal || !PRINCIPAL.test(principal.id)) return { revoked: 0 };
    let revoked = 0;
    for (const c of [...this.model.conns.values()]) {
      if (c.principal !== principal.id) continue;
      revoked++;
      if (reason === "eligibility") {
        c.eligible = false;
        const lease = this.model.endLease(c.connId);
        if (lease) this.leaseEnded(c.connId, lease, "revoked");
        this.save(c.connId);
        this.tellYou(c.connId);
      } else this.close(c.connId, CLOSE.auth, reason === "deleted" ? "account_deleted" : "signed_out");
    }
    await this.flush();
    return { revoked };
  }

  stats() {
    const zones = {};
    for (const zone of ZONES) zones[zone] = { ...this.model.counts(zone), rows: this.model.zones[zone].rows.size, rev: this.model.zones[zone].rev };
    return { epoch: this.model.epoch, connections: this.model.conns.size, zones, watching: [...this.watching] };
  }

  // A world speaker's contribution total, for ordering only: Oogatron's counts, read at most every ten minutes.
  contributionOf(login) {
    const map = this.contributions.map;
    return map && typeof login === "string" ? map.get(login.toLowerCase()) ?? null : null;
  }

  refreshContributions() {
    if (this.contributions.pending || Date.now() - this.contributions.at < CONTRIBUTIONS_MS) return;
    this.contributions.at = Date.now();
    this.contributions.pending = (async () => {
      try {
        const snapshot = await readContributorSnapshot();
        const map = new Map();
        for (const row of Array.isArray(snapshot.contributors) ? snapshot.contributors : []) {
          if (!row || typeof row.login !== "string" || !row.counts) continue;
          let total = 0;
          for (const value of Object.values(row.counts)) if (Number.isSafeInteger(value) && value > 0) total += value;
          map.set(row.login.toLowerCase(), total);
        }
        this.contributions.map = map;
        for (const s of this.island.speakers) this.model.setInfo(s.id, { contributions: this.contributionOf(s.info.login) });
        await this.flush();
      } catch { /* ordering only: unknown totals sort last */ } finally { this.contributions.pending = null; }
    })();
    this.background(this.contributions.pending);
  }
}
