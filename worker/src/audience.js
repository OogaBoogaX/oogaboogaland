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
import { appRow, createAudience, DEFAULT_LIMITS, FANOUT_DEFAULT, ID, isZone, ZONES, zoneReactHz } from "./audience-model.js";
import { decideCapability } from "./chat-capability.js";
import { contributorFor } from "./contributor-access.js";
import { readContributorSnapshot } from "./contributor-policy.js";
import { bridgeFeatures } from "./chat-bridge-protocol.js";
import { SEAT_REVISION } from "./cloud-seats.js";
import "../../src/js/emoji-data.js";
import "../../src/js/reaction-policy.js";
import { CLEANUP_BACKLOG_MAX, createMediaBroker, MEDIA_BODY_MAX } from "./audience-media.js";
import { inspectReporter } from "./inspect-report.js";

export const AUDIENCE_NAME = "audience";
export const AUDIENCE_PROTOCOL = 1;
export const AUDIENCE_FEATURES = ["roles-v1", "reactions-v1", "hand-emoji-v1"];
// A transient reaction's life on every client (players.js shows the island's for the same time), and the limits on
// sending them: per identity across its tabs (as the island's room has it) and per zone, which bounds any zone's fanout.
export const REACTION_MS = 2600;
export const REACT_HZ = 3, REACT_BURST = 6;
export const FRAME_MAX = 4096;
export const PENDING_MS = 30 * 1000;
export const REAUTH_MS = 60 * 60 * 1000;
export const CLOSE = { bad: 4400, auth: 4401, protocol: 4426, full: 4429, off: 4503 };
const MSG_HZ = 10, MSG_BURST = 20;
const REPLIES_KEPT = 16;
const CONTRIBUTIONS_MS = 10 * 60 * 1000;
// Readiness (#669): the SFU reads `degraded` after this many failures within the window with no success since, and the
// cleanup queue `backlog` once a job has waited this long.
const SFU_FAILS_KEPT = 16, SFU_WINDOW_MS = 5 * 60 * 1000, SFU_DEGRADED = 3, CLEANUP_STUCK_MS = 10 * 60 * 1000;
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
    // The owner's private Inspector (#669): aggregate counts and this object's state, nothing per person. Off, every call
    // returns at once, unless INSPECTOR_IDS names an account; it rides the calls the object already makes, no timer.
    this.inspect = inspectReporter(ctx, env, "Audience", () => AUDIENCE_NAME, () => this.inspectState());
    this.sfuFails = [];
    this.sfuOkAt = 0;
    this.media = createMediaBroker(this);
    this.sourcesSig = "";
    // #667: retirements the Room waits on, and whether each zone had listeners when the Room was last told.
    this.pendingWas = new Set();
    this.listenersSig = "";
    // #668: reaction buckets by identity and by zone, the event counter, and the clouds the Room was last told.
    this.reactBuckets = new Map();
    this.zoneBuckets = new Map();
    this.reactSeq = 0;
    this.cloudsSig = null;
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
      await this.media.restore();
      // The list the Room was last told, kept: a wake sends only what changed meanwhile (a deployment that dropped every
      // socket empties it), so the Room's own stored copy never stays stale.
      this.sourcesSig = (await ctx.storage.get("sourcesSig")) ?? null;
      // The island's `outdoor` switch off (the kill switch, deployed): no island publication stays pullable.
      if (!bridgeFeatures(env).outdoor && this.island.speakers.length) {
        this.island = { ...this.island, speakers: [] };
        await ctx.storage.put("world", this.island);
        this.model.setWorld([], this.island.active);
        this.model.commit();
        for (const zone of ZONES) this.model.zones[zone].rev = meta.revs && Number.isSafeInteger(meta.revs[zone]) ? meta.revs[zone] : 0;
        await this.media.prune();
      }
      this.pendingWas = this.media.pending();
      // The whole bridge off (the kill switch, deployed): no socket that survived the restart keeps the audience or its
      // media (#669's rollback). Each closes as unavailable and its sessions join the cleanup queue.
      if (!bridgeFeatures(env).bridge && this.sockets.size) {
        for (const connId of [...this.sockets.keys()]) this.close(connId, CLOSE.off, "unavailable");
        await this.flush();
      }
      this.sourcesChanged();
      // The clouds the Room was last told, kept as the sources are: a wake sends only a change. Never told, the Room has
      // none, as an empty list.
      this.cloudsSig = (await ctx.storage.get("cloudsSig")) ?? "[]";
      this.cloudsChanged();
      this.inspect.woke(this.sockets.size);
    });
  }

  /** An SFU call's outcome (sfu.js `measured`): counted by status class, and remembered for `readiness`. */
  sfuMeasured(ms, failed, status) {
    this.inspect.count("sfu");
    this.inspect.count("sfuMs", ms);
    this.inspect.peak("sfuMsMax", ms);
    if (!failed) { this.sfuOkAt = Date.now(); return; }
    this.inspect.count(status === 429 ? "sfu429" : status >= 500 ? "sfu5xx" : status ? "sfu4xx" : "sfuTimeout");
    this.sfuFails.push(Date.now());
    if (this.sfuFails.length > SFU_FAILS_KEPT) this.sfuFails.shift();
  }

  /**
   * What the public health view may say of media (#669), since this object last woke: `sfu` is `degraded` after
   * SFU_DEGRADED failures within SFU_WINDOW_MS with none succeeding since the last, `off` with no SFU configured; `cleanup`
   * is `backlog` while the queue is half full or a job has waited CLEANUP_STUCK_MS. No count, id or setting beyond that.
   */
  readiness(now = Date.now()) {
    const recent = this.sfuFails.filter((at) => now - at < SFU_WINDOW_MS);
    const configured = !!(this.env.REALTIME_APP_ID && this.env.REALTIME_SECRET);
    const sfu = !configured ? "off" : recent.length >= SFU_DEGRADED && recent[recent.length - 1] > this.sfuOkAt ? "degraded" : "ok";
    const { jobs, oldestMs } = this.media.backlog(now);
    return { sfu, cleanup: jobs >= CLEANUP_BACKLOG_MAX / 2 || oldestMs >= CLEANUP_STUCK_MS ? "backlog" : "ok" };
  }

  /** This object's state for the owner's Inspector: counts, caps, flags and the cleanup queue; never a person. */
  inspectState() {
    const zones = {};
    for (const zone of ZONES) {
      const counts = this.model.counts(zone);
      zones[zone] = { listeners: counts.listeners, chatSpeakers: counts.chatSpeakers, worldSpeakers: this.island.speakers.filter((s) => s.zone === zone).length,
        rows: this.model.zones[zone].rows.size, rev: this.model.zones[zone].rev };
    }
    const limits = limitsOf(this.env);
    return { status: this.sockets.size ? "serving" : "idle", sockets: this.sockets.size, connections: this.model.conns.size, zones,
      limits: { listeners: limits.listeners, chatSpeakers: limits.chatSpeakers, connections: limits.connections },
      flags: bridgeFeatures(this.env), cleanup: this.media.backlog(), media: this.readiness(), panels: this.watching.size };
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
        this.inspect.count("deltaFrames");
        if (!own.has(c.id)) { this.send(ws, common); continue; }
        this.send(ws, { type: "delta", zone: delta.zone, epoch: delta.epoch, base: delta.base, revision: delta.rev,
          upsert: delta.upsert.map((row) => appRow(row, c.id)), remove: delta.remove });
      }
      this.listenersChanged();
      this.cloudsChanged();
      if (this.watching.has(delta.zone) && this.env.ROOM) {
        // In order, one at a time: the Room relays each to the island's panels, which apply a delta only on its base.
        this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceDelta(delta)).catch(() => {});
        this.background(this.roomQueue);
      }
    }
    return deltas;
  }

  /** Each zone's listener count for the Room's open grants (#667), sent when a zone gains or loses its last listener. */
  listenersChanged() {
    const counts = { main: this.model.counts("main").listeners, dsb: this.model.counts("dsb").listeners };
    const sig = `${counts.main > 0}|${counts.dsb > 0}`;
    if (sig === this.listenersSig || !this.env.ROOM) return;
    this.listenersSig = sig;
    this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceListeners(counts)).catch(() => {});
    this.background(this.roomQueue);
  }

  /**
   * Ooga Chat speakers on clouds (#668), for the Room's world (`audienceClouds`): one entry an active speaker, its seat
   * from the zone's catalog, its canonical character, mic and hand. Nothing while the island's `cloud` switch is off.
   */
  clouds() {
    if (!bridgeFeatures(this.env).cloud) return [];
    const out = [];
    for (const c of this.model.conns.values()) {
      if (!c.zone || !c.lease || c.lease.state !== "active" || !c.lease.seat || !c.id.startsWith("gh:")) continue;
      const p = this.model.people.get(c.id);
      out.push({ id: c.id, character: c.lease.character || p.info.character || null, zone: c.zone, seat: c.lease.seat, seatRevision: SEAT_REVISION,
        lease: c.lease.generation, mic: c.mic, hand: c.hand || "" });
    }
    return out.sort((a, b) => (a.seat < b.seat ? -1 : 1));
  }

  cloudsChanged() {
    const list = this.clouds(), sig = JSON.stringify(list);
    if (sig === this.cloudsSig || !this.env.ROOM) return;
    this.cloudsSig = sig;
    this.roomQueue = this.roomQueue.then(async () => {
      try {
        await this.env.ROOM.getByName("island").audienceClouds(list);
        await this.ctx.storage.put("cloudsSig", sig);
      } catch {
        // Not delivered: the next check sends it again rather than counting it as told.
        if (this.cloudsSig === sig) this.cloudsSig = null;
      }
    });
    this.background(this.roomQueue);
  }

  /** One reaction event to every Ooga Chat client in its zone, and to the Room when anything there shows it. */
  fanReaction(event) {
    const text = JSON.stringify(event);
    for (const c of this.model.conns.values()) {
      if (c.zone !== event.zone) continue;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, text);
    }
    const shown = this.watching.has(event.zone) || this.island.speakers.some((s) => s.zone === event.zone);
    if (shown && this.env.ROOM) {
      this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceReaction(event)).catch(() => {});
      this.background(this.roomQueue);
    }
  }

  /** A token from the zone's reaction bucket, at the rate its fan-out budget allows for the people in it now. */
  zoneReaction(zone, now) {
    const hz = zoneReactHz(this.model.zones[zone].rows.size, positive(this.env.AUDIENCE_FANOUT, FANOUT_DEFAULT, 50000));
    return this.bucket(this.zoneBuckets, zone, hz, Math.max(2, Math.round(2 * hz)), now);
  }

  bucket(map, key, hz, burst, now) {
    for (const [k, b] of map) if (map.size > 4096 && b.tokens + (now - b.at) * hz / 1000 >= burst) map.delete(k);
    let b = map.get(key);
    if (!b) map.set(key, b = { tokens: burst, at: now });
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * hz / 1000);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** A transient reaction (#668): anyone in a zone, listener or speaker; the native policy's emoji; never kept. */
  react(c, emoji) {
    if (!c.zone) return { ok: false, code: "zone_required" };
    if (!globalThis.BL.reactionPolicy.valid(emoji)) return { ok: false, code: "malformed" };
    const now = Date.now();
    if (!this.bucket(this.reactBuckets, c.id, REACT_HZ, REACT_BURST, now) || !this.zoneReaction(c.zone, now)) {
      this.inspect.count("reactionsLimited");
      return { ok: false, code: "rate_limited", retryable: true };
    }
    this.inspect.count("reactions");
    this.reactSeq = Math.max(now, this.reactSeq + 1);
    this.fanReaction({ type: "reaction", eventId: `r${this.reactSeq}`, participantId: c.id, zone: c.zone, epoch: this.model.epoch, emoji, at: now, expiresAt: now + REACTION_MS });
    return { ok: true };
  }

  /** A speaker's hand (#668): `on` with its pinned emoji, or the hand in its tone; down is always allowed. */
  hand(c, msg) {
    const P = globalThis.BL.reactionPolicy;
    if (msg.on !== true) return this.model.setHand(c.connId, "");
    const tone = msg.tone === undefined ? 0 : msg.tone, emoji = msg.emoji === undefined ? "" : msg.emoji;
    if (!P.tone(tone) || emoji !== "" && !P.valid(emoji)) return { ok: false, code: "malformed" };
    return this.model.setHand(c.connId, emoji || P.toned(P.HAND, tone));
  }

  snapshotFor(c) {
    const snap = this.model.snapshot(c.zone);
    return { type: "snapshot", zone: c.zone, epoch: snap.epoch, revision: snap.rev, participants: snap.rows.map((row) => appRow(row, c.id)),
      you: this.model.youOf(c.connId), connection: c.connId, limits: { listeners: limitsOf(this.env).listeners, chatSpeakers: limitsOf(this.env).chatSpeakers },
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
    // Media cleanup retries even after every client has gone.
    next = Math.min(next, this.media.nextCleanup());
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
    if (this.media.cleanup.length) await this.media.runCleanup();
    this.confirmRetired();
    this.inspect.peak("cleanupJobs", this.media.cleanup.length);
    this.inspect.tick();
    await this.scheduleAlarm();
  }

  /** Tell the Room which speakers' outdoor subscriptions are now confirmed closed, so it can send `closed` (#667). */
  confirmRetired() {
    const now = this.media.pending();
    const done = [...this.pendingWas].filter((id) => !now.has(id));
    this.pendingWas = now;
    if (!done.length || !this.env.ROOM) return;
    this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceConfirmed(done)).catch(() => {
      // Not delivered: kept as pending-then-done, so the next check reports them again (the Room also asks each sweep).
      for (const id of done) if (!this.media.pending().has(id)) this.pendingWas.add(id);
    });
    this.background(this.roomQueue);
  }

  /** A lease ended: its publication leaves the catalog and is closed, with every subscription to it (#666). */
  leaseEnded(connId) { this.background(this.media.retirePublication(connId)); }

  /** Ooga Chat speakers' publications changed: the Room's island players with an open outdoor grant hear them. */
  sourcesChanged() {
    const list = this.media.chatSources(), sig = JSON.stringify(list);
    if (sig === this.sourcesSig || !this.env.ROOM) return;
    this.sourcesSig = sig;
    this.roomQueue = this.roomQueue.then(async () => {
      try {
        await this.env.ROOM.getByName("island").audienceSources(list);
        await this.ctx.storage.put("sourcesSig", sig);
      } catch {
        // Not delivered: the next check sends it again rather than counting it as told.
        if (this.sourcesSig === sig) this.sourcesSig = null;
      }
    });
    this.background(this.roomQueue);
  }

  close(connId, code, reason) {
    const ws = this.sockets.get(connId);
    this.inspect.count(code === CLOSE.auth ? "closeAuth" : code === CLOSE.full ? "closeFull" : code === CLOSE.protocol ? "closeProtocol" : code === CLOSE.off ? "closeOff" : "closeBad");
    this.drop(connId);
    if (ws) { try { ws.serializeAttachment(null); ws.close(code, reason); } catch { /* already closed */ } }
  }

  drop(connId) {
    const c = this.model.disconnect(connId);
    this.sockets.delete(connId);
    this.replies.delete(connId);
    this.buckets.delete(connId);
    // Every session of the connection goes, its publication with every subscription to it.
    if (c) this.background(this.media.releaseAll(connId));
    return c;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/media/")) return this.mediaRequest(url.pathname.slice(7), request);
    if (url.pathname !== "/connect") return new Response("Not found", { status: 404 });
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = readPrincipal(request.headers.get("x-audience-principal"));
    if (!who) { this.inspect.count("refusePrincipal"); return new Response("Forbidden", { status: 403 }); }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const connId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [connId, who.id]);
    const { id, principal, providerUserId, eligible, authUntil, provider, login, display, avatar, character } = who;
    const res = this.model.connect({ connId, id, principal, providerUserId, eligible, authUntil }, { provider, login, display, avatar, character });
    if (!res.ok) {
      this.inspect.count(res.code === "audience_full" ? "refuseFull" : "refuseIdentity");
      this.inspect.tick();
      server.close(CLOSE.full, res.code);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.sockets.set(connId, server);
    this.save(connId);
    this.inspect.count(who.provider === "x" ? "admitX" : "admitGithub");
    this.inspect.peak("connections", this.model.conns.size);
    this.inspect.tick();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** A media call (audience-media.js), only for the caller's own connection: never another's session or track. */
  async mediaRequest(op, request) {
    const json = (code, status) => new Response(JSON.stringify({ error: { code, retryable: status >= 500 } }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    if (request.method !== "POST") return json("method_not_allowed", 405);
    const who = readPrincipal(request.headers.get("x-audience-principal"));
    if (!who) return json("auth_required", 401);
    const text = await request.text();
    if (text.length > MEDIA_BODY_MAX) return json("too_large", 413);
    let body;
    try { body = JSON.parse(text || "{}"); } catch { return json("malformed", 400); }
    const conn = body && typeof body.connection === "string" ? this.model.conns.get(body.connection) : null;
    if (!conn || conn.principal !== who.principal) return json("stale_epoch", 409);
    const res = await this.media.request(op, conn, body);
    this.inspect.count(res.status < 400 ? "media" : res.status === 429 || res.status === 503 ? "mediaBusy" : "mediaRefused");
    this.inspect.tick();
    await this.scheduleAlarm();
    return res;
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
    this.inspect.tick();
    if (!take(bucket, now)) { this.inspect.count("rateLimited"); if (msg.requestId !== undefined) this.result(c.connId, msg.requestId, { ok: false, code: "rate_limited", retryable: true }); return; }
    if (msg.type === "join") return this.onJoin(c, msg);
    // A client that saw a revision gap asks again: counted, the one sign of a gap the server can see.
    if (msg.type === "resync") { if (c.zone && msg.zone === c.zone) { this.inspect.count("resync"); this.sendSnapshot(ws, c); } return; }
    if (msg.type === "setRole" || msg.type === "setMic" || msg.type === "reaction" || msg.type === "hand") return this.onRequest(c, msg);
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
    // The old zone's voices are no longer this connection's to hear: closed now, not at its next sync.
    if (r.changed) await this.media.prune();
    const ws = this.sockets.get(c.connId);
    if (ws) this.sendSnapshot(ws, c);
  }

  /** A zone's snapshot to one connection, its size counted for the owner (the largest frame the audience sends). */
  sendSnapshot(ws, c) {
    const text = JSON.stringify(this.snapshotFor(c));
    this.inspect.count("snapshots");
    this.inspect.count("snapshotBytes", text.length);
    this.inspect.peak("snapshotBytesMax", text.length);
    this.send(ws, text);
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
    else if (msg.type === "reaction") outcome = typeof msg.emoji === "string" && msg.emoji.length <= 32 ? this.react(c, msg.emoji) : { ok: false, code: "malformed" };
    else if (msg.type === "hand") outcome = this.hand(c, msg);
    else if (msg.role === "listener") { const lease = this.model.endLease(c.connId); if (lease) this.leaseEnded(c.connId, lease, "listener"); outcome = { ok: true }; }
    else if (msg.role === "speaker") { outcome = await this.requestSpeaker(c); this.inspect.count(outcome.ok ? "speakerGranted" : "speakerRefused"); }
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
    return this.model.requestSpeaker(c.connId, { eligible: true, generation: this.nextGeneration(), until: Date.now() + PENDING_MS,
      character: typeof answer.character === "string" ? answer.character : null });
  }

  async webSocketClose(ws) { return this.closed(ws); }
  async webSocketError(ws) { return this.closed(ws); }
  async closed(ws) {
    const a = ws.deserializeAttachment();
    const connId = a && a.conn && a.conn.connId;
    if (!connId || this.sockets.get(connId) !== ws) return;
    this.inspect.count("gone");
    this.drop(connId);
    await this.flush();
    this.inspect.tick();
  }

  // --- the Room's and the bridge's calls (RPC) ---

  /** The island's whole word on its players, newest `seq` wins: who publishes outdoors where, who is in its voice. */
  async world(seq, speakers, active) {
    if (!Number.isSafeInteger(seq) || seq <= this.island.seq || !Array.isArray(speakers) || !Array.isArray(active)) return { ok: false };
    // With the island's `outdoor` switch off, no island publication is listed or pullable, whatever the Room sends.
    const allowed = bridgeFeatures(this.env).outdoor ? speakers : [];
    const clean = allowed.slice(0, 64).filter((s) => s && ID.test(s.id) && isZone(s.zone)).map((s) => ({
      id: s.id, zone: s.zone, mic: s.mic === "on" ? "on" : "muted", character: typeof s.character === "string" ? s.character.slice(0, 40) : null,
      hand: typeof s.hand === "string" ? s.hand.slice(0, 32) : "", speaking: s.speaking === true,
      // The publication to pull, by reference: kept here and given to no client.
      pub: s.pub && typeof s.pub.session === "string" && typeof s.pub.track === "string"
        ? { session: s.pub.session.slice(0, 64), track: s.pub.track.slice(0, 64), gen: Number.isSafeInteger(s.pub.gen) ? s.pub.gen : 0 } : null,
      info: { provider: "github", login: String(s.login || "").slice(0, 39), display: String(s.display || s.login || "").slice(0, 50), character: s.character || null,
        contributions: this.contributionOf(s.login) },
    }));
    this.island = { seq, speakers: clean, active: active.slice(0, 64).filter((id) => ID.test(id)) };
    await this.ctx.storage.put("world", this.island);
    const ended = this.model.setWorld(this.island.speakers, this.island.active);
    for (const { connId, lease } of ended) { this.save(connId); this.leaseEnded(connId, lease, "source_in_use"); this.tellYou(connId); }
    await this.flush();
    // A world publication gone or replaced: every subscription to the old one is closed at once. The answer names the
    // speakers whose subscriptions the SFU has not yet confirmed closed: the Room's `closed` for them waits (#667).
    await this.media.prune();
    const pending = this.media.pending();
    // Report every retirement that finished meanwhile, by any path, before the pending list moves on.
    this.confirmRetired();
    await this.scheduleAlarm();
    if (clean.length) this.refreshContributions();
    return { ok: true, pending: [...pending], listeners: { main: this.model.counts("main").listeners, dsb: this.model.counts("dsb").listeners } };
  }

  /** An island world speaker's reaction (the Room's `react`), to Ooga Chat's clients in its zone (#668). */
  islandReaction(event) {
    if (!event || !ID.test(event.participantId) || !isZone(event.zone) || !globalThis.BL.reactionPolicy.valid(event.emoji)) return { ok: false };
    const now = Date.now();
    if (!this.zoneReaction(event.zone, now)) return { ok: false };
    const text = JSON.stringify({ type: "reaction", eventId: String(event.eventId).slice(0, 64), participantId: event.participantId, zone: event.zone,
      epoch: this.model.epoch, emoji: event.emoji, at: now, expiresAt: now + REACTION_MS });
    for (const c of this.model.conns.values()) if (c.zone === event.zone) { const ws = this.sockets.get(c.connId); if (ws) this.send(ws, text); }
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
