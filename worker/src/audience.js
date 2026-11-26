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
//           { type: "setRole", requestId, role: "speaker" | "listener", takeover?, replaces? }   { type: "setMic", requestId, muted }
//   server: { type: "snapshot", zone, epoch, revision, participants, you, limits, features }
//           { type: "delta", zone, epoch, base, revision, upsert, remove: [{ id, generation }] }
//           { type: "you", zone, you }   { type: "result", requestId, ok, error?, you? }
// Close codes: 4401 the session ended or needs checking again, 4426 another protocol revision, 4429 full or too many
// tabs, 4400 an unreadable frame. The Room relays the same roster to the island's panel in its own shape (room-audience.js).

import { DurableObject } from "cloudflare:workers";
import { appRow, createAudience, DEFAULT_LIMITS, FANOUT_DEFAULT, ID, isZone, ZONES, zoneReactHz } from "./audience-model.js";
import { decideCapability } from "./chat-capability.js";
import { contributorForEnv } from "./contributor-access.js";
import { oogatron, readContributorSnapshot } from "./contributor-policy.js";
import { bridgeFeatures } from "./chat-bridge-protocol.js";
import { COPY_REVISION, freeCopySeat, SEAT_REVISION } from "./cloud-seats.js";
import "../../src/js/emoji-data.js";
import "../../src/js/reaction-policy.js";
import { CLEANUP_BACKLOG_MAX, createMediaBroker, MEDIA_BODY_MAX } from "./audience-media.js";
import { inspectReporter } from "./inspect-report.js";
import { createRoles, HOST_HOLD_MS, STAGE_HOLD_MS } from "./chat-roles.js";
import { PEOPLE_MAX } from "./room-chat-members.js";
// The one directory of live chats (chat-directory.js), named here so neither file imports the other.
export const DIRECTORY_NAME = "chats";
const NO_STANDING = Object.freeze({ rank: "", request: "", askedAt: 0, rankSince: 0 });

export const AUDIENCE_NAME = "audience";
export const AUDIENCE_PROTOCOL = 1;
// A hosted chat (docs/ooga-chat-hosts.md) is this class too, one object a chat, named `chat:<id>`, speaking protocol 2:
// the same roster, leases and media, with roles in place of the capability rule. CHAT_OPS are its host and request
// messages, each with a `requestId`; CHAT_ID is a chat's id.
export const CHAT_PROTOCOL = 2;
export const CHAT_ID = /^[A-Za-z0-9_-]{16}$/;
export const CHAT_TITLE_MAX = 60;
// How soon a word the island room missed (a chat's stage taken or left) is sent again.
export const ISLAND_RETRY_MS = 30 * 1000;
// A chat as the island's Online Oogas shows it (`reportMembers`): its title and counts, reports at least MEMBERS_GAP_MS apart.
export const MEMBERS_GAP_MS = 2000;
// A chat speaker's, host's or co-host's drop shorter than this shows nobody anything; longer, their tile shows them
// reconnecting, in place, while their place is held (audience-model.js, quiet hold).
export const QUIET_MS = 5 * 1000;
// A chat connection that has sent nothing, not even a ping (which the runtime answers without waking the object), for
// SILENT_MS is taken for gone, as its close would have said: a phone put in airplane mode sends no close, and the
// runtime may take minutes to notice. While anyone holds the stage (a lease or a rank) the alarm wakes every SWEEP_MS
// to look. Pages ping every 10 s; SILENT_MS allows for pages from before that still pinging every 30 s, and can come
// down to 25 s once those are gone. A drop noticed later than LATE_MS after the connection was last heard counts from
// then: a host's hold, a held place and the reconnecting mark run from the last ping, not from the moment it was seen.
export const SILENT_MS = 45 * 1000, SWEEP_MS = 15 * 1000, LATE_MS = 20 * 1000;
export const chatName = (id) => `chat:${id}`;
// A chat's land: a zone it is held in (`main`, `dsb`), or `none`, Ooga Chat voice alone, with no copy, clouds or Go
// there. A land-less chat's roster lives in the model's `main` zone, which is what its socket's frames name.
export const CHAT_LANDS = ["main", "dsb", "none"];
export const isChatLand = (land) => CHAT_LANDS.includes(land);
export const rosterZone = (land) => (land === "dsb" ? "dsb" : "main");
export const CHAT_OPS = new Set(["ask", "cancel", "invite", "answer", "decline", "mute", "demote", "cohost", "cohostAnswer", "handover", "remove", "allow", "open", "end"]);
const TARGETED = new Set(["invite", "answer", "mute", "demote", "cohost", "handover", "remove", "allow"]);
export const AUDIENCE_FEATURES = ["roles-v1", "reactions-v1", "hand-emoji-v1", "walk-v1", "handoff-v1"];
// Go there (docs/ooga-chat-hosts.md): a speaker's page asks for a ticket (`handoff`), one a speaker at a time, kept in
// storage HANDOFF_MS with whether their microphone was open; the island's page, opened in the same tab, hands it back
// (`redeem`) on a connection of the same account, once, and so takes the voice straight over with no card. A link
// without one only listens: nobody else can mint one for that account.
export const HANDOFF_MS = 60 * 1000;
const TICKET = /^[A-Za-z0-9_-]{22}$/;
// The island view (docs/ooga-chat-hosts.md): walkers' positions relayed from the chat's copy to the connections that
// asked for them (`{ type: "view", on }`), at most WALK_HZ a second, fewer as subscribers pass WALK_FANOUT frames a
// second in all; a frame arriving sooner is dropped (the copy sends the next within half a second).
export const WALK_HZ = 2;
export const WALK_FANOUT = 2000;
// A viewer whose connection and device can take more asks for up to WALK_HZ_MAX a second (`{ type: "view", on, hz }`,
// one of WALK_RATES); each viewer is sent at its own rate, all of them scaled down together past WALK_FANOUT frames a
// second, and the copy is told how often to report (`walk`'s `ms`) by the fastest viewer it has.
// The faster rates are the 3D view's, which for now only a GitHub contributor is offered (`eligible`): anyone else is
// held to WALK_HZ.
export const WALK_RATES = Object.freeze([2, 4, 6]);
export const WALK_HZ_MAX = 6;
const BOUND_XZ = 400;
// Who sits on the copy's clouds, for the island view (`{ type: "clouds", at, clouds: [{ id, character, seat }] }`): each
// active speaker not walking it, the Ooga they sit as and their seat, with the server's clock (`at`, ms) the view moves
// the clouds by, as the copy does; sent to every connection viewing whenever the list changes, whether or not anyone
// walks, and to a viewer as it starts (`cloudsFrame`).
const cloudsView = (list) => JSON.stringify(list.map((c) => ({ id: c.id, character: c.character, seat: c.seat })));
// How the walkers look (`looks`): an entry each, at most LOOKS_MAX characters of them all.
export const LOOKS_MAX = 64 * 1024;
const lookPlain = (v) => !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
// A look's shape, bounded (the page checks each piece against its own catalog, equipment.js as ever): a hat's
// selection, its size, a wardrobe of a choice a slot, and a hand and a jetpack.
const LOOK_HASH = /^[a-f0-9]{64}$/, LOOK_ITEM = /^[a-z0-9][a-z0-9-]{0,79}$/, LOOK_COLOR = /^#[0-9a-f]{6}$/;
const lookChoice = (v) => lookPlain(v) && Object.keys(v).length <= 3 && Object.entries(v).every(([k, x]) => k === "item" ? typeof x === "string" && (x === "none" || x === "custom" || LOOK_ITEM.test(x))
  : k === "version" ? x === null || typeof x === "string" && LOOK_HASH.test(x) : k === "color" ? typeof x === "string" && LOOK_COLOR.test(x)
  : (k === "size" || k === "height") && Number.isInteger(x) && x >= 0 && x <= 200);
const lookEquipment = (e) => e === null || lookPlain(e) && Object.keys(e).every((k) => k === "selection" || k === "size" || k === "wardrobe")
  && (e.selection === null || e.selection === undefined || lookChoice(e.selection))
  && (e.size === undefined || Number.isInteger(e.size) && e.size >= 80 && e.size <= 120)
  && (e.wardrobe === null || e.wardrobe === undefined || lookPlain(e.wardrobe) && Object.keys(e.wardrobe).length <= 32
    && Object.entries(e.wardrobe).every(([k, x]) => /^[a-zA-Z]{1,16}$/.test(k) && lookChoice(x)));
const validLook = (v) => lookPlain(v) && Object.keys(v).every((k) => k === "e" || k === "w" || k === "j")
  && (v.e === undefined || lookEquipment(v.e)) && (v.w === undefined || v.w === 1 || v.w === 2) && (v.j === undefined || v.j === 1);
// A transient reaction's life on every client (players.js shows the island's for the same time), and the limits on
// sending them: per identity across its tabs (as the island's room has it) and per zone, which bounds any zone's fanout.
export const REACTION_MS = 2600;
export const REACT_HZ = 3, REACT_BURST = 6;
export const FRAME_MAX = 4096;
export const PENDING_MS = 30 * 1000;
// How many of its own earlier connections a page may name in `setRole`'s `replaces`.
export const REPLACES_MAX = 4;
export const REAUTH_MS = 60 * 60 * 1000;
export const CLOSE = { bad: 4400, auth: 4401, removed: 4403, ended: 4404, silent: 4408, replaced: 4409, protocol: 4426, full: 4429, off: 4503 };
const MSG_HZ = 10, MSG_BURST = 20;
const REPLIES_KEPT = 16;
const CONTRIBUTIONS_MS = 10 * 60 * 1000;
// Readiness (#669): the SFU reads `degraded` after this many failures within the window with no success since, and the
// cleanup queue `backlog` once a job has waited this long.
const SFU_FAILS_KEPT = 16, SFU_WINDOW_MS = 5 * 60 * 1000, SFU_DEGRADED = 3, CLEANUP_STUCK_MS = 10 * 60 * 1000;
// An Ooga Chat principal, or an island account joining a chat from the island (`ob_<GitHub id>`, chats.js).
const PRINCIPAL = /^(pr_[A-Za-z0-9_-]{22}|ob_[1-9][0-9]{0,19})$/;
const LOGIN = /^[\w.-]{1,39}$/;
const PATH = /^\/api\/chat\/avatar\/pr_[A-Za-z0-9_-]{22}\/[0-9a-f]{16}$/;

const positive = (value, fallback, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
};
// A hosted chat's speakers are its own setting (`CHAT_SPEAKERS`, at most CHAT_SPEAKERS_DEFAULT, which a copy of a zone and its cloud seats are sized for): none needs one of the zone's
// eight cloud seats, since a chat's clouds are its copy's (docs/ooga-chat-hosts.md).
export const CHAT_SPEAKERS_DEFAULT = 32;
export const limitsOf = (env, chat = false) => ({ ...DEFAULT_LIMITS,
  listeners: positive(env.AUDIENCE_LISTENERS, DEFAULT_LIMITS.listeners, 5000),
  chatSpeakers: chat ? positive(env.CHAT_SPEAKERS, CHAT_SPEAKERS_DEFAULT, CHAT_SPEAKERS_DEFAULT) : positive(env.AUDIENCE_SPEAKERS, DEFAULT_LIMITS.chatSpeakers, 64) });

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
    // When each connection last sent a frame (pings the runtime answers are read from it, `heardOf`); memory only.
    this.heard = new Map();
    this.watching = new Set();
    this.island = { seq: 0, speakers: [], active: [], linked: [] };
    this.roomQueue = Promise.resolve();
    this.genAt = 0;
    this.contributions = { at: 0, map: null, pending: null };
    // The island's contributor lookup (contributor-access.js), on the instance so a check can stand in its own.
    this.contributorFor = contributorForEnv(env);
    // The owner's private Inspector (#669): aggregate counts and this object's state, nothing per person. Off, every call
    // returns at once, unless INSPECTOR_IDS names an account; it rides the calls the object already makes, no timer.
    this.inspect = inspectReporter(ctx, env, "Audience", () => this.chat ? chatName(this.chat.id) : AUDIENCE_NAME, () => this.inspectState());
    // A hosted chat's own word (null for the old public object): its id, title, zone and host, and its roles.
    this.chat = null;
    this.roles = null;
    this.listedSig = "";
    // Words for the island room it has not yet taken (`tellIsland`), account -> { on, chat }: kept past the chat's end, so
    // a word lost as it ended still reaches the Room.
    this.islandWords = new Map();
    // The chat's copy of its zone (room-copy.js): who walks it now, whether it was ever opened, and each speaker's cloud.
    this.walkers = new Set();
    this.copyOpened = false;
    this.copySeats = new Map();
    this.copyGone = null;
    // How each walker looks, as the copy last said (`looks`), kept as the text sent to viewers.
    this.looksText = "";
    this.lookSeq = 0;
    // Who sits on the copy's clouds, as viewers were last told (`clouds`); null: not worked out since a wake.
    this.cloudsText = null;
    // What the island room was last told of this chat's counts (`reportMembers`): its signature, when, the one-shot
    // timer for a burst's last change, the one report in flight, and the chat whose end it has not yet heard (`gone`,
    // stored, so the alarm says it again even after the chat is gone).
    this.members = { sent: "", at: 0, timer: 0, busy: false, due: false, failed: false, queue: Promise.resolve(), gone: null };
    this.sfuFails = [];
    this.sfuOkAt = 0;
    this.media = createMediaBroker(this);
    this.sourcesSig = "";
    // #667: retirements the Room waits on, and whether each zone had listeners when the Room was last told.
    this.pendingWas = new Set();
    this.listenersSig = "";
    // Which connection holds each identity's lease, as its other connections were last told (`tellElsewhere`).
    this.holders = new Map();
    // #668: reaction buckets by identity and by zone, the event counter, and the clouds the Room was last told.
    this.reactBuckets = new Map();
    this.zoneBuckets = new Map();
    this.reactSeq = 0;
    this.cloudsSig = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      let meta = await ctx.storage.get("meta");
      if (!meta) { meta = { epoch: Date.now(), revs: null }; await ctx.storage.put("meta", meta); }
      const chat = await ctx.storage.get("chat");
      if (chat) {
        this.chat = chat;
        this.roles = createRoles({ saved: await ctx.storage.get("roles") });
        const copy = (await ctx.storage.get("copy")) || {};
        this.walkers = new Set(copy.walkers || []);
        this.copyOpened = copy.opened === true;
        this.copySeats = new Map(copy.seats || []);
        const looks = await ctx.storage.get("looks");
        this.looksText = typeof looks === "string" ? looks : "";
      }
      // An older save's words are a bare `on` for the chat it held.
      this.islandWords = new Map(((await ctx.storage.get("islandWords")) || []).map(([id, w]) => [id, typeof w === "boolean" ? { on: w, chat: chat && chat.id } : w])
        .filter(([, w]) => w && CHAT_ID.test(w.chat || "")));
      const gone = await ctx.storage.get("membersGone");
      this.members.gone = typeof gone === "string" && CHAT_ID.test(gone) ? gone : null;
      // A copy whose end it has not yet heard (`copyEnd`), retried from the alarm even after the chat is gone.
      const copyGone = await ctx.storage.get("copyGone");
      this.copyGone = typeof copyGone === "string" && CHAT_ID.test(copyGone) ? copyGone : null;
      // The model reads these limits as it goes: a chat opened later raises them to a chat's own (`open`).
      this.limits = limitsOf(env, !!chat);
      this.model = createAudience({ epoch: meta.epoch, limits: this.limits, revs: meta.revs,
        standing: (id) => this.standingOf(id), may: (c) => this.mayOf(c), seats: () => !this.chat,
        reserved: () => this.roles ? this.roles.held(Date.now()) : [] });
      if (this.chat) this.model.setWalking([...this.walkers]);
      this.island = (await ctx.storage.get("world")) || this.island;
      if (!Array.isArray(this.island.linked)) this.island = { ...this.island, linked: [] };
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
      for (const c of this.model.conns.values()) if (c.lease) this.holders.set(c.id, c.connId);
      // Quiet holds of a chat, as they stood when the object last stopped: their rows are what clients hold.
      if (this.chat) this.model.restoreQuiet((await ctx.storage.get("quiet")) || []);
      this.model.setWorld(this.island.speakers, this.island.active);
      this.model.commit();
      for (const zone of ZONES) this.model.zones[zone].rev = meta.revs && Number.isSafeInteger(meta.revs[zone]) ? meta.revs[zone] : 0;
      await this.media.restore();
      // What the listeners already heard: a word from the Room that changes nothing tells nobody to sync.
      this.media.settle();
      // The list the Room was last told, kept: a wake sends only what changed meanwhile (a deployment that dropped every
      // socket empties it), so the Room's own stored copy never stays stale.
      this.sourcesSig = (await ctx.storage.get("sourcesSig")) ?? null;
      // The island's `outdoor` switch off (the kill switch, deployed): no island publication stays pullable.
      if (!bridgeFeatures(env).outdoor && (this.island.speakers.length || this.island.linked.length)) {
        this.island = { ...this.island, speakers: [], linked: [] };
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
    const limits = this.limits;
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
      mic: c.mic, hand: c.hand, eligible: c.eligible, authUntil: c.authUntil, forced: c.forced, joinedAt: c.joinedAt, viewing: !!c.viewing, viewHz: c.viewHz || WALK_HZ }, info: p.info });
  }

  /** Commit what changed, store the revisions, and send every zone's delta to its clients and to a watching Room. */
  async flush() {
    this.tellElsewhere();
    const deltas = this.model.commit();
    // A quiet hold a return to the stage ended goes from storage too, or a wake would bring the old row back.
    if (this.model.quietChanged()) await this.saveQuiet();
    if (this.chat) this.listed();
    if (this.chat && (deltas.length || this.members.failed)) this.reportMembers();
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

  // Speakers receive too, including while their microphone is opening. The island must not gate its microphone
  // as alone merely because everybody in Ooga Chat pressed Join voice.
  // `ears`: for each island player the Room listed as linked, its partners here now, by name, so the island shows them.
  hearingCounts() {
    const main = this.model.counts("main"), dsb = this.model.counts("dsb"), ears = {};
    for (const l of this.island.linked) {
      const here = [];
      for (const id of l.to) {
        const p = this.model.people.get(id);
        if (p && p.conns.size) here.push({ id, login: p.info.login, display: p.info.display || p.info.login });
      }
      if (here.length) ears[l.id] = here;
    }
    const counts = { main: main.listeners + main.chatSpeakers, dsb: dsb.listeners + dsb.chatSpeakers };
    return Object.keys(ears).length ? { ...counts, ears } : counts;
  }

  /** Each zone's receivers for the Room's open grants (#667), sent when a zone gains or loses its last receiver. */
  listenersChanged() {
    if (this.chat) return;
    const counts = this.hearingCounts();
    const sig = `${counts.main > 0}|${counts.dsb > 0}|${JSON.stringify(counts.ears || {})}`;
    if (sig === this.listenersSig || !this.env.ROOM) return;
    this.listenersSig = sig;
    this.roomQueue = this.roomQueue.then(() => this.env.ROOM.getByName("island").audienceListeners(counts)).catch(() => {
      // Not delivered: the next check sends it again rather than counting it as told. A Room left believing nobody
      // listens tells its outdoor speakers so, and a speaker with no island peers then holds its microphone as alone.
      if (this.listenersSig === sig) this.listenersSig = null;
    });
    this.background(this.roomQueue);
  }

  /**
   * Ooga Chat speakers on clouds (#668), for the Room's world (`audienceClouds`): one entry an active speaker, its seat
   * from the zone's catalog, its canonical character, mic and hand, and the login and display name the island shows
   * over it. Nothing while the island's `cloud` switch is off.
   */
  clouds() {
    if (this.chat) return this.chatClouds();
    if (!bridgeFeatures(this.env).cloud) return [];
    const out = [];
    for (const c of this.model.conns.values()) {
      if (!c.zone || !c.lease || c.lease.state !== "active" || !c.lease.seat || !c.id.startsWith("gh:")) continue;
      const p = this.model.people.get(c.id);
      out.push({ id: c.id, character: c.lease.character || p.info.character || null, zone: c.zone, seat: c.lease.seat, seatRevision: SEAT_REVISION,
        lease: c.lease.generation, mic: c.mic, hand: c.hand || "", login: p.info.login, display: p.info.display || p.info.login });
    }
    return out.sort((a, b) => (a.seat < b.seat ? -1 : 1));
  }

  cloudsChanged() {
    if (this.chat) {
      // A chat's clouds are its copy's: told only while someone walks it (an empty copy is never woken), and
      // `copyMember`'s answer carries them to the first who arrives. Its island view's viewers hear them whenever they
      // change, walked or not.
      const list = this.chatClouds(), sig = JSON.stringify(list);
      this.viewClouds(list);
      if (!this.walkers.size) { this.cloudsSig = null; return; }
      if (sig === this.cloudsSig) return;
      this.cloudsSig = sig;
      this.toCopy((copy) => copy.copyClouds(list));
      return;
    }
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

  /** The `clouds` frame for the island view: the list (worked out now if it has not been since a wake) and the clock. */
  cloudsFrame() {
    if (this.cloudsText === null) this.cloudsText = cloudsView(this.chatClouds());
    return `{"type":"clouds","at":${Date.now()},"clouds":${this.cloudsText}}`;
  }

  /** Who sits on the clouds to every connection viewing a Main Island chat's view, when that changed. */
  viewClouds(list) {
    if (this.chat.zone !== "main") return;
    const text = cloudsView(list);
    if (text === this.cloudsText) return;
    this.cloudsText = text;
    let frame = null;
    for (const c of this.model.conns.values()) {
      if (!c.viewing) continue;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, frame ||= this.cloudsFrame());
    }
  }

  /**
   * A chat's clouds (docs/ooga-chat-hosts.md): every active speaker not walking the copy, a seat each of the copy's
   * thirty-two, kept for the life of their lease (empty while they walk). An account with no Ooga of its own sits there
   * as a default one hashed from its handle, under a name no login can have (`guest/<provider>-<login>`).
   */
  chatClouds() {
    const speakers = new Map();
    for (const c of this.model.conns.values()) if (c.lease && c.lease.state === "active") speakers.set(c.id, c);
    let changed = false;
    for (const id of [...this.copySeats.keys()]) if (!speakers.has(id)) { this.copySeats.delete(id); changed = true; }
    const taken = new Set(this.copySeats.values());
    for (const id of speakers.keys()) {
      if (this.copySeats.has(id)) continue;
      const seat = freeCopySeat(taken);
      if (!seat) continue;
      this.copySeats.set(id, seat); taken.add(seat); changed = true;
    }
    if (changed) this.background(this.keepCopy());
    const out = [];
    for (const [id, c] of speakers) {
      const seat = this.copySeats.get(id);
      if (!seat || this.walkers.has(id)) continue;
      const p = this.model.people.get(id);
      out.push({ id, character: c.lease.character || p.info.character || `guest/${p.info.provider}-${p.info.login}`.toLowerCase(), zone: c.zone, seat,
        seatRevision: COPY_REVISION, lease: c.lease.generation, mic: c.mic, hand: c.hand || "", login: p.info.login, display: p.info.display || p.info.login });
    }
    return out.sort((a, b) => (a.seat < b.seat ? -1 : 1));
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
      ...(this.chat ? { chat: this.chatInfo() } : {}), you: this.youFor(c.connId), connection: c.connId, limits: { listeners: this.limits.listeners, chatSpeakers: this.limits.chatSpeakers },
      features: AUDIENCE_FEATURES };
  }

  /** A connection's own standing; `reason` says why a lease it held ended ("moved": the visitor took voice elsewhere). */
  tellYou(connId, reason = "") {
    const c = this.model.conns.get(connId), ws = this.sockets.get(connId);
    if (c && ws && c.zone) this.send(ws, { type: "you", zone: c.zone, you: this.youFor(connId), ...(reason ? { reason } : {}) });
  }

  /** An identity's other connections hear when one of them takes or gives up the microphone (`you.elsewhere`). */
  tellElsewhere() {
    const now = new Map();
    for (const c of this.model.conns.values()) if (c.lease) now.set(c.id, c.connId);
    for (const id of new Set([...now.keys(), ...this.holders.keys()])) {
      if (now.get(id) === this.holders.get(id)) continue;
      const p = this.model.people.get(id);
      if (p) for (const o of p.conns.values()) if (!o.lease) this.tellYou(o.connId);
    }
    this.holders = now;
  }

  async scheduleAlarm() {
    let next = Infinity;
    for (const c of this.model.conns.values()) {
      if (c.lease && c.lease.state === "pending") next = Math.min(next, c.lease.until);
      next = Math.min(next, c.authUntil);
    }
    // Media cleanup retries even after every client has gone; a chat wakes for a lapsing invite or its held host.
    next = Math.min(next, this.media.nextCleanup());
    if (this.roles) next = Math.min(next, this.roles.nextAt(), this.model.quietUntil());
    // Someone on the stage: look for a silent connection every SWEEP_MS (`sweepSilent`).
    if (this.chat && this.roles && !this.roles.ended && this.stageHeld()) next = Math.min(next, Date.now() + SWEEP_MS);
    if (this.islandWords.size || this.members.gone || this.copyGone) next = Math.min(next, Date.now() + ISLAND_RETRY_MS);
    if (next === Infinity) return;
    const current = await this.ctx.storage.getAlarm();
    if (!current || current > next) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    const now = Date.now();
    this.sweepSilent(now);
    if (this.roles && !this.roles.ended) await this.rolesTick(now);
    if (this.model.expire(now).length) await this.saveQuiet();
    for (const [id, w] of [...this.islandWords]) await this.sendIsland(id, w);
    await this.sendGone();
    await this.sendCopyGone();
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
    // A word the Room missed while it was unreachable goes again (each is sent only when it differs from what was told).
    this.sourcesChanged();
    this.listenersChanged();
    this.cloudsChanged();
    if (this.media.cleanup.length) await this.media.runCleanup();
    this.confirmRetired();
    this.inspect.peak("cleanupJobs", this.media.cleanup.length);
    this.inspect.tick();
    await this.scheduleAlarm();
  }

  /** Tell the Room which speakers' outdoor subscriptions are now confirmed closed, so it can send `closed` (#667). */
  confirmRetired() {
    if (this.chat) return;
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
  leaseEnded(connId, lease = null, reason = "") {
    this.background(this.media.retirePublication(connId));
    // A chat keeps a speaker's place on the stage a while unless they went back to listening themselves.
    const c = this.model.conns.get(connId);
    // Gone to another chat's stage (`moved`) is the speaker's own word too: their place here goes.
    if (!this.roles || !lease || !c) return;
    // The same account taking its own voice to another of its connections in this chat (`handoff`: Switch here, Go there
    // from Ooga Chat): its place, and a co-host's rank, stay with it; the place is held as for a drop until the new
    // lease, granted at once, takes it. Its island and directory words are the new lease's to say.
    if (reason === "handoff") { if (this.roles.leaseEnded(c.id, false, Date.now()).changed) this.background(this.rolesChanged()); return; }
    this.stageLeft(c.id, reason === "listener" || reason === "moved");
  }

  /** Ooga Chat speakers' publications changed: the Room's island players with an open outdoor grant hear them. */
  sourcesChanged() {
    if (this.chat) return;
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

  close(connId, code, reason, since = Date.now()) {
    const ws = this.sockets.get(connId);
    this.inspect.count(code === CLOSE.auth ? "closeAuth" : code === CLOSE.full ? "closeFull" : code === CLOSE.protocol ? "closeProtocol" : code === CLOSE.off ? "closeOff"
      // A connection its own page replaced is a socket that went, not a bad one.
      : code === CLOSE.replaced ? "gone" : code === CLOSE.silent ? "silent" : "closeBad");
    // A page back from a dropped socket replacing its old one: what everyone sees stands while it speaks again.
    this.drop(connId, code === CLOSE.replaced || code === CLOSE.silent, since);
    if (ws) { try { ws.serializeAttachment(null); ws.close(code, reason); } catch { /* already closed */ } }
  }

  /**
   * A connection goes. `quiet`: it dropped rather than left, so a chat speaker's or manager's row stands a while.
   * `since`: when it went (its last frame, for a drop noticed late), which its holds count from.
   */
  drop(connId, quiet = false, since = Date.now()) {
    const was = this.model.conns.get(connId), R = this.roles;
    const hold = quiet && was && R && !R.ended && !R.isRemoved(was.id) && (was.lease && was.lease.state === "active" || !!R.rankOf(was.id));
    // Reconnecting for as long as their place is held: a minute on the stage, the host's role its own hold.
    const now = since, c = this.model.disconnect(connId, hold ? { quietUntil: now + QUIET_MS, until: now + (R.host === was.id ? HOST_HOLD_MS : STAGE_HOLD_MS) } : null);
    if (hold) this.background(this.saveQuiet());
    if (c && this.roles) {
      if (c.lease) this.stageLeft(c.id, false, now);
      if (!this.present(c.id)) {
        // Gone altogether: their request goes (hosts could not answer it), and a host's hold starts.
        const cancelled = this.roles.cancel(c.id).changed, away = this.roles.presence(c.id, false, now).changed;
        // Gone from the chat, an open co-host offer frees its slot.
        const freed = this.roles.dropOffer(c.id).changed;
        if (freed) this.sendChatInfo();
        if (cancelled || away || freed) this.background(this.rolesChanged());
      }
    }
    this.sockets.delete(connId);
    this.heard.delete(connId);
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
    // A chat that has ended, or someone its hosts removed, gets a socket that says so and closes.
    const shut = !this.chat && url.searchParams.get("chat") ? [CLOSE.ended, "ended"] : this.roles && this.roles.ended ? [CLOSE.ended, "ended"]
      : this.roles && this.roles.isRemoved(who.id) ? [CLOSE.removed, "removed"] : null;
    if (shut) { server.accept(); server.close(shut[0], shut[1]); return new Response(null, { status: 101, webSocket: client }); }
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
    this.heard.set(connId, Date.now());
    this.save(connId);
    if (this.roles && this.roles.presence(id, true, Date.now()).changed) await this.rolesChanged();
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
    // The edge read the session and its eligibility again for this call, as strong a check as a reconnect: while it still
    // says eligible, the connection's authorisation runs on from it, so the hourly re-authentication never closes a
    // speaker's socket (and takes its lease) that keeps calling. Not eligible, nothing runs on, and the hourly check
    // stays the backstop for a revocation that was missed.
    if (who.eligible && who.authUntil > conn.authUntil) { conn.authUntil = who.authUntil; this.save(conn.connId); }
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
    this.heard.set(c.connId, Date.now());
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
    // The island view shown (or not): only a connection that asked hears walkers' positions.
    if (msg.type === "view" && this.chat) {
      if (typeof msg.on !== "boolean") return;
      const hz = msg.on && c.eligible && WALK_RATES.includes(msg.hz) ? msg.hz : WALK_HZ;
      const began = msg.on && !c.viewing;
      if (!!c.viewing !== msg.on || (c.viewHz || WALK_HZ) !== hz) { c.viewing = msg.on; c.viewHz = hz; this.save(c.connId); }
      // A viewer starting hears how the walkers look now and who sits on the clouds; a change comes as it happens
      // (`looks`, `clouds`).
      if (began && this.looksText) this.send(ws, `{"type":"looks","looks":${this.looksText}}`);
      if (began && this.chat.zone === "main") this.send(ws, this.cloudsFrame());
      return;
    }
    if (msg.type === "setRole" || msg.type === "setMic" || msg.type === "reaction" || msg.type === "hand" || this.roles && CHAT_OPS.has(msg.type)
      || this.chat && (msg.type === "handoff" || msg.type === "redeem")) return this.onRequest(c, msg);
  }

  async onJoin(c, msg) {
    // A chat speaks protocol 2 and has one zone, its own; the old public object, protocol 1 and either zone.
    const protocol = this.chat ? CHAT_PROTOCOL : AUDIENCE_PROTOCOL;
    if (this.chat ? msg.protocol !== protocol : msg.protocol !== undefined && msg.protocol !== protocol) { this.close(c.connId, CLOSE.protocol, "protocol_unsupported"); return; }
    if (this.chat && msg.zone !== undefined && msg.zone !== this.chat.zone && msg.zone !== this.zoneOf()) { this.send(this.sockets.get(c.connId), { type: "error", code: "zone_unavailable" }); return; }
    const r = this.model.join(c.connId, this.chat ? this.zoneOf() : msg.zone);
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
    if (this.roles && this.roles.manages(c.id)) this.send(ws, { type: "removed", list: this.roles.removedList() });
    this.inspect.count("snapshots");
    this.inspect.count("snapshotBytes", text.length);
    this.inspect.peak("snapshotBytesMax", text.length);
    this.send(ws, text);
  }

  result(connId, requestId, outcome) {
    const reply = { type: "result", requestId, ok: outcome.ok, ...(outcome.ok ? outcome.reply || {} : { error: { code: outcome.code, retryable: !!outcome.retryable, ...(outcome.retryAfter ? { retryAfter: outcome.retryAfter } : {}) } }), you: this.youFor(connId) };
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
    if (msg.type === "setMic") {
      outcome = this.model.setMic(c.connId, msg.muted === true);
      // Unmuting themselves after a host's mute: their voice is pulled again.
      if (outcome.released) this.media.announce();
    } else if (this.roles && CHAT_OPS.has(msg.type)) outcome = await this.chatOp(c, msg);
    else if (msg.type === "reaction") outcome = typeof msg.emoji === "string" && msg.emoji.length <= 32 ? this.react(c, msg.emoji) : { ok: false, code: "malformed" };
    else if (msg.type === "hand") outcome = this.hand(c, msg);
    else if (msg.type === "handoff") outcome = await this.mintHandoff(c);
    else if (msg.type === "redeem") outcome = await this.redeemHandoff(c, msg);
    else if (msg.role === "listener") { const lease = this.model.endLease(c.connId); if (lease) this.leaseEnded(c.connId, lease, "listener"); outcome = { ok: true }; }
    else if (msg.role === "speaker") { outcome = await this.requestSpeaker(c, msg); this.inspect.count(outcome.ok ? "speakerGranted" : "speakerRefused"); }
    else outcome = { ok: false, code: "malformed" };
    if (this.model.conns.get(c.connId) !== c) return;
    this.save(c.connId);
    await this.flush();
    this.result(c.connId, msg.requestId, outcome);
    await this.scheduleAlarm();
  }

  /** Go there's ticket for a speaker on the stage: a fresh one replaces any the account held, and stale ones are dropped. */
  async mintHandoff(c) {
    if (!c.lease || c.lease.state !== "active") return { ok: false, code: "not_speaking" };
    const now = Date.now(), bytes = crypto.getRandomValues(new Uint8Array(16));
    const ticket = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const all = (await this.ctx.storage.get("handoffs")) || {};
    for (const [t, h] of Object.entries(all)) if (h.until <= now || h.id === c.id) delete all[t];
    all[ticket] = { id: c.id, mic: c.mic === "on", until: now + HANDOFF_MS };
    await this.ctx.storage.put("handoffs", all);
    return { ok: true, reply: { ticket } };
  }

  /** A ticket handed back, once, by the same account within its time: whether the microphone was open. */
  async redeemHandoff(c, msg) {
    if (typeof msg.ticket !== "string" || !TICKET.test(msg.ticket)) return { ok: false, code: "malformed" };
    const all = (await this.ctx.storage.get("handoffs")) || {}, h = all[msg.ticket];
    if (!h) return { ok: false, code: "handoff_invalid" };
    delete all[msg.ticket];
    await this.ctx.storage.put("handoffs", all);
    if (h.id !== c.id || h.until <= Date.now()) return { ok: false, code: "handoff_invalid" };
    return { ok: true, reply: { mic: h.mic } };
  }

  /** The island decides afresh, now, whatever the edge's cached answer said; the connection must still be the same. */
  async requestSpeaker(c, msg = {}) {
    // In a chat a host's leave decides (docs/ooga-chat-hosts.md); in the old public object, the island's contributor rule.
    const chat = !!this.roles;
    if (chat ? !this.roles.mayLease(c.id, Date.now()) : !c.eligible) return { ok: false, code: chat ? "not_allowed" : "capability_required" };
    if (!c.zone) return { ok: false, code: "zone_required" };
    const zone = c.zone;
    let answer;
    // A GitHub account is asked about again now, whatever the edge's cached answer said; in a chat only a ban or another
    // account holding its login refuses (anyone signed in may speak there), and an X account is never asked.
    if (chat && !c.id.startsWith("gh:")) answer = { state: "eligible", character: null };
    else {
      try {
        answer = await decideCapability(this.env, { provider: "github", providerUserId: c.providerUserId, login: this.model.people.get(c.id).info.login }, this.contributorFor);
      } catch { answer = { state: "unknown" }; }
    }
    if (this.model.conns.get(c.connId) !== c || c.zone !== zone) return { ok: false, code: "stale_epoch" };
    // In a chat only the contributor rule is waived: a ban, a collision, or a ban that could not be read still refuses.
    if (chat && (answer.state === "unknown" && answer.reason !== "ban-unread" || answer.state === "ineligible" && answer.reason === "not-contributor")) answer = { state: "eligible", character: null };
    if (answer.state !== "eligible") {
      if (answer.state === "ineligible") c.eligible = false;
      return { ok: false, code: answer.state === "unknown" ? "capability_unavailable" : "capability_required", retryable: answer.state === "unknown" };
    }
    // A lease the same identity holds on another connection gives way in two cases only: the visitor's own word to
    // move their voice here (`takeover`), or this page naming the connections it has just come back from (`replaces`,
    // one or up to REPLACES_MAX: a socket that dropped, whose lease the server has not yet seen end), which are closed.
    const takeover = msg.takeover === true;
    const replaces = typeof msg.replaces === "string" ? [msg.replaces]
      : Array.isArray(msg.replaces) ? msg.replaces.filter((id) => typeof id === "string").slice(0, REPLACES_MAX) : [];
    // The island's voice gives way the same way: its page leaves voice, and the island's word comes back without the
    // identity before the Room answers. Unreachable or refused, the model's own refusal stands.
    const held = this.model.people.get(c.id);
    if (takeover && (held.active || held.world) && this.env.ROOM) {
      try { await this.env.ROOM.getByName("island").audienceHandoff(Number(c.providerUserId)); } catch { /* the refusal below says so */ }
      if (this.model.conns.get(c.connId) !== c || c.zone !== zone) return { ok: false, code: "stale_epoch" };
    }
    for (const o of [...this.model.people.get(c.id).conns.values()]) {
      if (o === c || !o.lease || !takeover && !replaces.includes(o.connId)) continue;
      if (!takeover) { this.close(o.connId, CLOSE.replaced, "replaced"); continue; }
      const lease = this.model.endLease(o.connId);
      this.save(o.connId);
      this.leaseEnded(o.connId, lease, "handoff");
      this.tellYou(o.connId, "moved");
    }
    // Leave is asked again after every wait above: an invite may have lapsed, or a host moved them, meanwhile.
    if (chat && !this.roles.mayLease(c.id, Date.now())) return { ok: false, code: "not_allowed" };
    const granted = this.model.requestSpeaker(c.connId, { eligible: true, generation: this.nextGeneration(), until: Date.now() + PENDING_MS,
      character: typeof answer.character === "string" ? answer.character : null });
    if (chat && granted.ok && granted.changed) {
      // An invite becomes a place on the stage; the request on their row goes.
      if (this.roles.granted(c.id, Date.now()).changed) { this.touchId(c.id); await this.rolesChanged(); }
      this.claimVoice(c.id);
    }
    return granted;
  }

  async webSocketClose(ws) { return this.closed(ws); }
  async webSocketError(ws) { return this.closed(ws); }
  async closed(ws) {
    const a = ws.deserializeAttachment();
    const connId = a && a.conn && a.conn.connId;
    if (!connId || this.sockets.get(connId) !== ws) return;
    this.inspect.count("gone");
    // Noticed late (a connection that went without a word): it went when it was last heard.
    const now = Date.now(), heard = this.heardOf(connId);
    this.drop(connId, true, now - heard > LATE_MS ? heard : now);
    await this.flush();
    // A host who left starts the hold, which only the alarm can end.
    await this.scheduleAlarm();
    this.inspect.tick();
  }

  // --- a hosted chat (docs/ooga-chat-hosts.md) ---

  /** A row's rank and request, for the roster's commit; nothing for the old public object. */
  standingOf(id) {
    const R = this.roles;
    if (!R) return NO_STANDING;
    const request = R.requestOf(id, Date.now());
    return { rank: R.rankOf(id), request, askedAt: request === "asked" ? R.askedAt(id) : 0, rankSince: R.rankSince(id) };
  }

  mayOf(c) { return this.roles ? this.roles.mayLease(c.id, Date.now()) : !!c.eligible; }

  /** The visitor's own standing: the roster's, and in a chat their rank, request and an invite's expiry. */
  youFor(connId) {
    const you = this.model.youOf(connId);
    const c = this.model.conns.get(connId);
    if (!this.roles || !c) return you;
    const now = Date.now(), invite = this.roles.inviteUntil(c.id, now);
    return { ...you, rank: this.roles.rankOf(c.id), request: this.roles.requestOf(c.id, now), ...(invite ? { inviteUntil: invite } : {}),
      ...(this.walkers.has(c.id) ? { walking: true } : {}) };
  }

  chatInfo() {
    const { id, title, zone, startedAt } = this.chat;
    return { id, title, zone, startedAt, host: this.roles.host, cohosts: this.roles.cohosts, offers: this.roles.offers, open: this.roles.open };
  }

  /** The chat's own word changed (its host, co-hosts, an open stage): everyone in it hears `{ type: "chat", chat }`. */
  sendChatInfo() {
    const text = JSON.stringify({ type: "chat", chat: this.chatInfo() });
    for (const c of this.model.conns.values()) { const ws = this.sockets.get(c.connId); if (ws && c.zone) this.send(ws, text); }
  }

  /**
   * What the Chats list's preview shows before anyone joins: the chat, its stage (the host, co-hosts and speakers, in the
   * chat's own order) and how many listen and wait. Public to anyone signed in, as the chat itself is; never a socket.
   */
  preview() {
    if (!this.chat || this.roles.ended) return null;
    const snap = this.model.snapshot(this.zoneOf()), stage = [];
    let listeners = 0;
    for (const row of snap.rows) {
      if (row.rank || row.role === "speaker") { const r = appRow(row); delete r.request; delete r.askedAt; stage.push(r); }
      else listeners++;
    }
    return { chat: this.chatInfo(), stage, listeners, requests: this.roles.queue().length };
  }

  present(id) { const p = this.model.people.get(id); return !!p && p.conns.size > 0; }
  /**
   * When a connection was last heard: its last frame here, or the last ping the runtime answered for it, whichever is
   * later. One with no word at all yet (a woken object's socket before its first ping) counts from the first look.
   */
  heardOf(connId) {
    const ws = this.sockets.get(connId), pinged = ws && this.ctx.getWebSocketAutoResponseTimestamp ? this.ctx.getWebSocketAutoResponseTimestamp(ws) : null;
    const at = Math.max(this.heard.get(connId) || 0, pinged ? pinged.getTime() : 0);
    if (at) return at;
    const now = Date.now();
    this.heard.set(connId, now);
    return now;
  }
  /** Whether anyone holds the stage in this chat: a lease, or a host's or co-host's rank. */
  stageHeld() {
    for (const c of this.model.conns.values()) if (c.lease || this.roles.rankOf(c.id)) return true;
    return false;
  }
  /** A chat's connections silent past SILENT_MS go as if they had closed, counted from when they were last heard. */
  sweepSilent(now) {
    if (!this.chat) return;
    for (const c of [...this.model.conns.values()]) {
      const heard = this.heardOf(c.connId);
      if (now - heard < SILENT_MS) continue;
      this.close(c.connId, CLOSE.silent, "silent", heard);
    }
  }
  touchId(id) { if (this.chat && this.model.people.has(id)) this.model.touch(id, this.zoneOf()); }
  /** The model zone a chat's roster lives in (`rosterZone`). */
  zoneOf() { return rosterZone(this.chat.zone); }
  tellYouId(id, reason = "") { const p = this.model.people.get(id); if (p) for (const connId of p.conns.keys()) this.tellYou(connId, reason); }

  async rolesChanged() {
    await this.ctx.storage.put("roles", this.roles.save());
    this.listed();
  }

  /** A lease ended: the speaker's place on the stage goes, or is held, and their voice is free for another chat. */
  stageLeft(id, voluntary, at = Date.now()) {
    // Going back to listening on their own word: a quiet hold of their row ends with the place it stood for.
    if (voluntary) this.unquiet(id);
    // A place held for a drop counts from when it went (`at`, the last ping for a drop noticed late).
    const ended = this.roles.leaseEnded(id, voluntary, at);
    if (ended.changed) this.background(this.rolesChanged());
    // A co-host who left the stage is a listener with the offer back (their slot kept): they and everyone hear so.
    if (ended.reinstated) this.cohostReinstated(id);
    if (this.chat && this.env.CHATS) this.background(this.env.CHATS.getByName(DIRECTORY_NAME).release(id, this.chat.id).catch(() => {}));
    this.tellIsland(id, false);
    this.copyLeft(id);
  }

  /** An account that may no longer walk the chat's copy is sent home from it (the copy's `copyRevoke`). */
  copyLeft(id, reason = "stage") {
    if (!this.walkers.has(id) || this.walksNow(id)) return;
    this.toCopy((copy) => copy.copyRevoke(Number(id.slice(3)), reason));
  }

  /** Whether an identity may walk the copy now: a lease held now, or its place on the stage (chat-roles.js `mayWalk`). */
  walksNow(id) {
    const p = this.model.people.get(id);
    const leased = !!p && [...p.conns.values()].some((c) => !!c.lease);
    return !!this.roles && this.roles.mayWalk(id, Date.now(), leased);
  }

  /** A call on the chat's copy, in order with the others, only once the copy has been opened. */
  toCopy(call) {
    if (!this.chat || !this.env.ROOM || !this.copyOpened) return;
    const copy = this.env.ROOM.getByName(chatName(this.chat.id));
    this.roomQueue = this.roomQueue.then(() => call(copy)).catch(() => {});
    this.background(this.roomQueue);
  }

  /** The chat's copy hears the chat ended (`copyEnd`); any answer settles it, only an unreachable copy is tried again. */
  async sendCopyGone() {
    const chat = this.copyGone;
    if (!chat || !this.env.ROOM) return;
    try { await this.env.ROOM.getByName(chatName(chat)).copyEnd(); } catch { return; }
    if (this.copyGone !== chat) return;
    this.copyGone = null;
    await this.ctx.storage.delete("copyGone");
  }

  async keepCopy() {
    await this.ctx.storage.put("copy", { walkers: [...this.walkers], opened: this.copyOpened, seats: [...this.copySeats] });
  }

  // --- the copy's calls (RPC, room-copy.js) ---

  /**
   * May GitHub account `id` walk this chat's copy of its zone? Speakers alone, Main Island alone for now. The answer
   * carries the chat's zone and title and the clouds the copy shows, so its first page needs no second call.
   */
  async copyMember(id) {
    if (!this.chat || !this.roles || this.roles.ended) return { ok: false, reason: "ended" };
    if (this.chat.zone !== "main") return { ok: false, reason: "zone" };
    if (typeof id !== "string" || !ID.test(id) || !this.walksNow(id)) return { ok: false, reason: "not-speaker" };
    if (!this.copyOpened) { this.copyOpened = true; await this.keepCopy(); }
    return { ok: true, zone: this.chat.zone, title: this.chat.title, clouds: this.clouds() };
  }

  /**
   * Walkers' positions from the copy (`seq` rising, `ids` GitHub ids, `p` x, y, z and heading for each, in order), for the
   * island view: one frame, built once, to each connection that asked for it as often as it asked (`viewHz`), every
   * rate scaled down together past the fan-out budget. A walker the chat does not know, or a value out of bounds, drops
   * the frame. The answer's `ms` is how often the copy should report: as often as the fastest viewer is sent to.
   */
  walk(seq, ids, p) {
    if (!this.chat || !Number.isSafeInteger(seq) || seq <= (this.walkSeq || 0) || !Array.isArray(ids) || !Array.isArray(p) || p.length !== ids.length * 4 || ids.length > 64) return { ok: false };
    let asked = 0, fastest = 0;
    for (const c of this.model.conns.values()) if (c.viewing) { const hz = c.viewHz || WALK_HZ; asked += hz; fastest = Math.max(fastest, hz); }
    const now = Date.now(), scale = Math.min(1, WALK_FANOUT / Math.max(1, asked));
    const ms = fastest ? Math.round(1000 / Math.max(0.2, fastest * scale)) : 1000 / WALK_HZ;
    let due = false;
    for (const c of this.model.conns.values()) if (c.viewing && now - (c.walkSent || 0) >= 1000 / Math.max(0.2, (c.viewHz || WALK_HZ) * scale) - 20) { due = true; break; }
    if (!asked || !due) return { ok: true, sent: false, ms };
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const id = `gh:${ids[i]}`, x = p[i * 4], y = p[i * 4 + 1], z = p[i * 4 + 2], yaw = p[i * 4 + 3];
      if (!Number.isSafeInteger(ids[i]) || !this.walkers.has(id) || ![x, y, z, yaw].every(Number.isFinite) || Math.abs(x) > BOUND_XZ || Math.abs(z) > BOUND_XZ) return { ok: false };
      out.push(id, Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(z * 10) / 10, Math.round(yaw * 100) / 100);
    }
    this.walkSeq = seq;
    const text = JSON.stringify({ type: "walk", seq, p: out });
    for (const c of this.model.conns.values()) {
      if (!c.viewing || now - (c.walkSent || 0) < 1000 / Math.max(0.2, (c.viewHz || WALK_HZ) * scale) - 20) continue;
      c.walkSent = now;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, text);
      this.inspect.count("walkFrames");
    }
    return { ok: true, sent: true, ms };
  }

  /**
   * How each walker looks, from the copy, for the island view: `looks` an entry each (`gh:<id>`), their saved equipment's
   * appearance (`e`: its hat and size and its wardrobe, as the island's room relays them) and what they have out (`w`
   * 1 the primary, 2 the gun; `j` 1 a jetpack worn), sent whole whenever one changes (`seq` rising). Kept, and relayed to
   * every connection viewing now; a viewer starting hears the last (`view`). Malformed, nothing changes.
   */
  async looks(seq, looks) {
    if (!this.chat || !Number.isSafeInteger(seq) || seq <= this.lookSeq || !lookPlain(looks)) return { ok: false };
    const ids = Object.keys(looks);
    if (ids.length > 64 || !ids.every((id) => /^gh:[1-9][0-9]{0,19}$/.test(id) && validLook(looks[id]))) return { ok: false };
    const text = JSON.stringify(looks);
    if (text.length > LOOKS_MAX) return { ok: false };
    this.lookSeq = seq;
    if (text === this.looksText) return { ok: true };
    this.looksText = text;
    await this.ctx.storage.put("looks", text);
    const frame = `{"type":"looks","looks":${text}}`;
    for (const c of this.model.conns.values()) {
      if (!c.viewing) continue;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, frame);
    }
    return { ok: true };
  }

  /** Who walks the copy now (the copy's whole list, `gh:<id>`): their rows say so, and their clouds stand empty. */
  async walking(ids) {
    if (!this.chat || !Array.isArray(ids)) return { ok: false };
    const next = ids.filter((id) => typeof id === "string" && /^gh:[1-9][0-9]{0,19}$/.test(id)).slice(0, 64);
    this.walkers = new Set(next);
    this.model.setWalking(next);
    await this.keepCopy();
    await this.flush();
    this.cloudsChanged();
    return { ok: true };
  }

  /** The copy's sweep: of those walking it, the ids that may no longer (a lapsed hold, a lost lease). */
  copyCheck(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.filter((id) => typeof id === "string" && !this.walksNow(id));
  }


  /**
   * The island room hears a GitHub account took or left this chat's stage, so its island voice gives way (room.js). A
   * word the Room did not take is kept (`islandWords`, stored) and sent again from the alarm until it does.
   */
  tellIsland(id, on) {
    if (!this.chat || !this.env.ROOM || !id.startsWith("gh:")) return;
    const word = { on, chat: this.chat.id };
    this.islandWords.set(id, word);
    this.background(this.sendIsland(id, word));
  }

  async sendIsland(id, word) {
    if (!word || !word.chat || !this.env.ROOM) return;
    let told = false;
    try { told = (await this.env.ROOM.getByName("island").chatVoice(Number(id.slice(3)), word.chat, word.on)).ok === true; } catch { told = false; }
    if (told && this.islandWords.get(id) === word) this.islandWords.delete(id);
    await this.ctx.storage.put("islandWords", [...this.islandWords]);
    if (!told) await this.scheduleAlarm();
  }

  /**
   * This chat for the island's Online Oogas, from everyone with a row here (a quiet hold's too): its title, how many
   * speak and listen, and who of them through Ooga Chat's app (`via`), whom the island's "N online" adds and its Online
   * Oogas names in its Ooga Chat group (`people`: their logins and names, speakers first, at most PEOPLE_MAX).
   */
  summaryOf() {
    const { speakers, listeners } = this.tally(), ids = [], people = [];
    // Every account here through Ooga Chat's app, for the island's "N online" (each once there, players left out); as many
    // as the chat's own limits let in.
    for (const r of this.model.zones[this.zoneOf()].rows.values()) {
      if (r.via !== "app") continue;
      ids.push(r.id);
      people.push({ id: r.id, login: r.login, display: r.display, speaking: !!(r.rank || r.role === "speaker") });
    }
    people.sort((a, b) => b.speaking - a.speaking);
    return { title: this.chat.title, speakers, listeners, ids, people: people.slice(0, PEOPLE_MAX) };
  }

  /**
   * Who speaks and who listens, as everyone sees the chat: its host and co-hosts are speakers whether or not they are on
   * the stage now (as its preview shows them), everyone else by their row.
   */
  tally() {
    let speakers = 0, listeners = 0;
    for (const r of this.model.zones[this.zoneOf()].rows.values()) if (r.rank || r.role === "speaker") speakers++; else listeners++;
    return { speakers, listeners };
  }

  /**
   * The island room hears this chat's title and counts as they change (room-chat-members.js): one report in flight, at
   * least MEMBERS_GAP_MS apart, a one-shot timer sending a burst's last change, and nothing while they are what it was
   * told. A report that fails is sent again with the next change; the end's zeros are `sendGone`'s.
   */
  reportMembers() {
    const M = this.members;
    if (!this.chat || !this.roles || this.roles.ended || !this.env.ROOM) return;
    M.due = true;
    if (M.timer || M.busy) return;
    const wait = M.at + MEMBERS_GAP_MS - Date.now();
    if (wait > 0) { M.timer = setTimeout(() => { M.timer = 0; this.reportMembers(); }, wait); return; }
    M.due = false;
    const report = this.summaryOf(), sig = JSON.stringify(report), id = this.chat.id;
    if (sig === M.sent) { M.failed = false; return; }
    M.at = Date.now(); M.busy = true;
    M.queue = M.queue.then(() => this.env.ROOM.getByName("island").chatMembers(id, report.title, report.speakers, report.listeners, report.ids, report.people))
      .then(() => { M.sent = sig; M.failed = false; }, () => { M.failed = true; })
      .then(() => { M.busy = false; if (M.due) this.reportMembers(); });
    this.background(M.queue);
  }

  /** The chat ended: the island room drops it. Not taken, the word is kept and the alarm sends it again. */
  async sendGone() {
    const chat = this.members.gone;
    if (!chat || !this.env.ROOM) return;
    let told = false;
    try { told = (await this.env.ROOM.getByName("island").chatMembers(chat, "", 0, 0, [], [])).ok === true; } catch { told = false; }
    if (!told || this.members.gone !== chat) return;
    this.members.gone = null;
    await this.ctx.storage.delete("membersGone");
  }

  /** The quiet holds as they stand, stored so a wake keeps the rows clients hold. */
  async saveQuiet() {
    const list = this.model.quietList();
    if (list.length) await this.ctx.storage.put("quiet", list);
    else await this.ctx.storage.delete("quiet");
  }

  /** A speaker publishing again after a failure: their row stands while they do (`publish/close` with `recover`). */
  holdQuiet(connId) {
    // As long as their place on the stage is held: a slow recovery never shows them as a listener or moves their tile.
    if (this.roles && !this.roles.ended && this.model.hold(connId, Date.now() + STAGE_HOLD_MS)) this.background(this.saveQuiet());
  }

  /** Someone held quietly whom a host moved, removed, or another chat took: their row shows what is true now. */
  unquiet(id) {
    if (this.model.expire(0, id).length) this.background(this.saveQuiet());
  }

  /** One voice an account across every chat: taking the stage here ends its lease in the chat it last spoke in. */
  claimVoice(id) {
    this.tellIsland(id, true);
    if (!this.env.CHATS) return;
    const here = this.chat.id;
    this.background((async () => {
      const before = await this.env.CHATS.getByName(DIRECTORY_NAME).claim(id, here);
      if (before && before !== here) await this.env.AUDIENCE.getByName(chatName(before)).yieldVoice(id);
    })().catch(() => {}));
  }

  /** Another chat took this account's voice: its lease here ends, as a move. */
  async yieldVoice(id) {
    this.unquiet(id);
    const p = this.model.people.get(id);
    if (!p) { await this.flush(); return { ok: true }; }
    for (const c of [...p.conns.values()]) {
      if (!c.lease) continue;
      const lease = this.model.endLease(c.connId);
      this.save(c.connId);
      this.leaseEnded(c.connId, lease, "moved");
      this.tellYou(c.connId, "moved");
    }
    await this.flush();
    return { ok: true };
  }

  /** A notice to every connection of `ids` (null: everyone in the chat). */
  notify(ids, notice) {
    const text = JSON.stringify({ type: "notice", ...notice });
    for (const c of this.model.conns.values()) {
      if (ids && !ids.includes(c.id)) continue;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, text);
    }
  }

  managers() { const R = this.roles; return [R.host, ...R.cohosts]; }

  cohostReinstated(id) {
    this.touchId(id);
    this.tellYouId(id);
    if (this.roles.offers.includes(id)) this.notify([id], { kind: "cohost_offer", again: true });
    this.sendChatInfo();
  }

  /**
   * Who is removed, for hosts and co-hosts alone (`{ type: "removed", list: [{ id, at, login, display }] }`, earliest
   * first): the list Allow back works from, since a removed person has no row. `ids`: only these (a new manager).
   */
  sendRemoved(ids = null) {
    if (!this.roles) return;
    const managers = this.managers().filter((id) => !ids || ids.includes(id));
    this.notifyRaw(managers, { type: "removed", list: this.roles.removedList() });
  }

  notifyRaw(ids, msg) {
    const text = JSON.stringify(msg);
    for (const c of this.model.conns.values()) {
      if (!ids.includes(c.id)) continue;
      const ws = this.sockets.get(c.connId);
      if (ws) this.send(ws, text);
    }
  }

  /** A host's or a listener's message in a chat (CHAT_OPS), checked whole: an unknown or malformed one is refused. */
  async chatOp(c, msg) {
    const R = this.roles, me = c.id, now = Date.now();
    const target = typeof msg.id === "string" && ID.test(msg.id) ? msg.id : null;
    if (TARGETED.has(msg.type) && !target) return { ok: false, code: "malformed" };
    if ((msg.type === "answer" || msg.type === "cohost" || msg.type === "open") && typeof (msg.type === "answer" ? msg.approve : msg.on) !== "boolean") return { ok: false, code: "malformed" };
    if (msg.type === "cohostAnswer" && typeof msg.accept !== "boolean") return { ok: false, code: "malformed" };
    const conns = (id) => { const p = this.model.people.get(id); return p ? [...p.conns.values()] : []; };
    const speaking = (id) => conns(id).some((o) => o.lease && o.lease.state === "active");
    let res;
    switch (msg.type) {
      case "ask":
        res = R.ask(me, now, conns(me).some((o) => o.lease));
        // On an open stage an ask is approved at once: the asker is invited, and hosts hear nothing to answer.
        if (res.ok && res.invited) { this.touchId(me); this.notify([me], { kind: "invited", by: R.host, until: R.inviteUntil(me, now), open: true }); this.tellYouId(me); }
        else if (res.ok && res.changed) { this.touchId(me); this.notify(this.managers(), { kind: "asked", id: me }); }
        break;
      case "open":
        res = R.setOpen(me, msg.on, now);
        if (res.ok && res.changed) {
          for (const id of res.invited) { this.touchId(id); this.notify([id], { kind: "invited", by: me, until: R.inviteUntil(id, now), open: true }); this.tellYouId(id); }
          this.sendChatInfo();
        }
        break;
      case "cancel": res = R.cancel(me); if (res.changed) this.touchId(me); break;
      case "decline": res = R.decline(me); if (res.changed) { this.touchId(me); this.notify(this.managers(), { kind: "not_now", id: me }); } break;
      case "invite":
      case "answer":
        res = msg.type === "invite" ? R.invite(me, target, now) : R.answer(me, target, msg.approve, now);
        if (res.ok && res.changed) {
          this.touchId(target);
          const invited = msg.type === "invite" || msg.approve;
          this.notify([target], invited ? { kind: "invited", by: me, until: R.inviteUntil(target, now) } : { kind: "declined", by: me });
          this.tellYouId(target);
        }
        break;
      case "mute":
        res = R.mute(me, target);
        if (res.ok && !speaking(target)) res = { ok: false, code: "not_speaking" };
        if (res.ok) {
          for (const o of conns(target)) if (o.lease && o.lease.state === "active") { this.model.setMic(o.connId, true, true); this.save(o.connId); }
          await this.media.prune();
          this.notify([target], { kind: "muted", by: me });
        }
        break;
      case "demote":
        res = R.demote(me, target);
        if (res.ok) {
          for (const o of conns(target)) {
            const lease = this.model.endLease(o.connId);
            if (!lease) continue;
            this.save(o.connId);
            this.leaseEnded(o.connId, lease, "demoted");
            this.tellYou(o.connId, "demoted");
          }
          this.unquiet(target);
          this.touchId(target);
          this.notify([target], { kind: "demoted", by: me });
          this.copyLeft(target);
        }
        break;
      case "cohost":
        // On: an offer the person answers. Off: an offer withdrawn, or a co-host made a plain speaker.
        res = R.setCohost(me, target, msg.on, now);
        if (res.ok && res.changed) {
          this.touchId(target);
          this.notify([target], { kind: res.offered ? "cohost_offer" : res.retracted ? "cohost_retracted" : "uncohost", by: me });
          this.tellYouId(target);
          this.sendChatInfo();
        }
        break;
      case "cohostAnswer":
        // Accepting makes them a co-host, free to take the stage at once (their page joins voice on that press).
        res = R.answerCohost(me, msg.accept, now);
        if (res.ok) {
          this.touchId(me);
          this.tellYouId(me);
          if (msg.accept) { this.notify(this.managers(), { kind: "cohost", id: me }); this.sendRemoved([me]); }
          else this.notify([R.host], { kind: "cohost_declined", id: me });
          this.sendChatInfo();
        }
        break;
      case "handover":
        res = R.handover(me, target, now);
        if (res.ok) { this.touchId(me); this.touchId(target); this.notify(null, { kind: "host", id: target, by: me }); this.tellYouId(me); this.tellYouId(target); this.sendRemoved([target]); this.sendChatInfo(); }
        break;
      case "remove":
        res = R.remove(me, target, now, this.model.people.get(target)?.info);
        if (res.ok) {
          this.sendRemoved();
          this.notify([target], { kind: "removed", by: me });
          this.copyLeft(target, "removed");
          for (const o of conns(target)) this.close(o.connId, CLOSE.removed, "removed");
          this.unquiet(target);
        }
        break;
      case "allow":
        res = R.allowBack(me, target);
        if (res.ok) this.sendRemoved();
        break;
      case "end":
        res = R.end(me);
        if (res.ok && res.changed) { await this.rolesChanged(); await this.endChat("ended"); return res; }
        break;
      default: res = { ok: false, code: "malformed" };
    }
    if (res.ok && res.changed !== false) await this.rolesChanged();
    return res;
  }

  /** What the clock changed in a chat: lapsed invites, the held host's hold run out (a new host, or the end). */
  async rolesTick(now) {
    const t = this.roles.tick(now, (id) => this.present(id));
    for (const id of t.expired) { this.touchId(id); this.tellYouId(id); this.notify([id], { kind: "expired" }); }
    if (t.host) { this.touchId(t.host); this.notify(null, { kind: "host", id: t.host }); this.tellYouId(t.host); this.sendRemoved([t.host]); this.sendChatInfo(); }
    for (const id of t.reinstated) this.cohostReinstated(id);
    if (t.expired.length || t.host || t.ended || t.reinstated.length) await this.rolesChanged();
    if (t.ended) await this.endChat("host_left");
  }

  /** The chat ends: everyone hears so, every socket closes, and it leaves the directory. */
  async endChat(reason) {
    this.notify(null, { kind: "ended", reason });
    for (const connId of [...this.sockets.keys()]) this.close(connId, CLOSE.ended, "ended");
    this.model.expire(Infinity);
    await this.flush();
    if (this.env.CHATS) await this.env.CHATS.getByName(DIRECTORY_NAME).end(this.chat.id).catch(() => {});
    // Its copy sends everyone home and forgets itself: owed until it answers, kept and retried from the alarm.
    await this.roomQueue;
    if (this.copyOpened && this.env.ROOM) {
      this.copyGone = this.chat.id;
      await this.ctx.storage.put("copyGone", this.copyGone);
      await this.sendCopyGone();
    }
    // The speakers' last words to the island (their island voice free again) go now; any the Room did not take stay,
    // with the chat they name, and the alarm sends them again even after the chat is gone.
    for (const [id, w] of [...this.islandWords]) await this.sendIsland(id, w);
    // The island's Online Oogas drop its members, after any report still on its way; kept until the Room takes it.
    const M = this.members;
    if (M.timer) { clearTimeout(M.timer); M.timer = 0; }
    if (this.env.ROOM) {
      M.gone = this.chat.id;
      await this.ctx.storage.put("membersGone", M.gone);
      await M.queue;
      await this.sendGone();
    }
    // Nothing else of an ended chat is kept: its title, host and every account id its roles named go (media cleanup's own
    // bookkeeping stays until it drains). Woken again, the object has no chat and refuses every socket as ended.
    await this.ctx.storage.delete(["chat", "roles", "meta", "world", "watch", "sourcesSig", "cloudsSig", "copy", "quiet", "handoffs", "looks", ...(this.islandWords.size ? [] : ["islandWords"])]);
    await this.scheduleAlarm();
  }

  /** What the directory lists of this chat, sent whenever it differs from what it was last told. */
  listed() {
    if (!this.chat || !this.env.CHATS || this.roles.ended) return;
    const counts = this.tally(), host = this.model.people.get(this.roles.host);
    if (host) this.chat.hostInfo = { login: host.info.login, display: host.info.display || host.info.login, character: host.info.character || null };
    const entry = { speakers: counts.speakers, listeners: counts.listeners, host: this.chat.hostInfo, hostId: this.roles.host, open: this.roles.open };
    const sig = JSON.stringify(entry);
    if (sig === this.listedSig) return;
    this.listedSig = sig;
    this.roomQueue = this.roomQueue.then(() => this.env.CHATS.getByName(DIRECTORY_NAME).update(this.chat.id, entry)).catch(() => {
      if (this.listedSig === sig) this.listedSig = "";
    });
    this.background(this.roomQueue);
  }

  /**
   * A new chat, from chats.js once the directory has taken it: its id, title, zone and host, the host holding its two
   * minutes to connect. Opening the same chat again changes nothing; a different one is refused.
   */
  async open(meta) {
    if (this.chat) return { ok: !!meta && this.chat.id === meta.id };
    if (!meta || !CHAT_ID.test(meta.id) || typeof meta.title !== "string" || meta.title.length > CHAT_TITLE_MAX || !isChatLand(meta.zone) || !ID.test(meta.host)
      || !meta.hostInfo || typeof meta.hostInfo.login !== "string") return { ok: false };
    const now = Date.now();
    this.chat = { id: meta.id, title: meta.title, zone: meta.zone, startedAt: now,
      hostInfo: { login: meta.hostInfo.login.slice(0, 39), display: String(meta.hostInfo.display || meta.hostInfo.login).slice(0, 50), character: meta.hostInfo.character || null } };
    this.roles = createRoles({ host: meta.host, now });
    Object.assign(this.limits, limitsOf(this.env, true));
    await this.ctx.storage.put({ chat: this.chat, roles: this.roles.save() });
    await this.scheduleAlarm();
    return { ok: true };
  }

  // --- the Room's and the bridge's calls (RPC) ---

  /**
   * The island's whole word on its players, newest `seq` wins: who publishes outdoors where, who is in its voice, and
   * `linked`, the island publications only each one's voice-link partners (`to`) may pull, wherever its player stands.
   */
  async world(seq, speakers, active, linked = []) {
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
    // Linked island players and their partners; a publication by reference too, never listed in a roster and pulled
    // only by a partner's own connections. One in voice without a publication is named so its partners here are told
    // back (`hearingCounts`' `ears`).
    const links = (bridgeFeatures(this.env).outdoor && Array.isArray(linked) ? linked : []).slice(0, 64)
      .filter((l) => l && ID.test(l.id) && Array.isArray(l.to))
      .map((l) => ({ id: l.id, to: l.to.slice(0, 64).filter((to) => typeof to === "string" && /^gh:[1-9][0-9]{0,19}$/.test(to) && to !== l.id),
        pub: l.pub && typeof l.pub.session === "string" && typeof l.pub.track === "string"
          ? { session: l.pub.session.slice(0, 64), track: l.pub.track.slice(0, 64), gen: Number.isSafeInteger(l.pub.gen) ? l.pub.gen : 0 } : null }))
      .filter((l) => l.to.length);
    this.island = { seq, speakers: clean, active: active.slice(0, 64).filter((id) => ID.test(id)), linked: links };
    await this.ctx.storage.put("world", this.island);
    // Whether each identity holds an island source, before and after: one that gained or lost it is `denied` or
    // `eligible` again in every Ooga Chat tab it has open, which hears it now rather than at its next lease change.
    const held = (p) => !!(p.active || p.world), before = new Map();
    for (const p of this.model.people.values()) before.set(p.id, held(p));
    const ended = this.model.setWorld(this.island.speakers, this.island.active);
    const told = new Set();
    // A chat lease the island's own voice ended: the visitor joined voice there, so it moved.
    for (const { connId, lease } of ended) { this.save(connId); this.leaseEnded(connId, lease, "source_in_use"); this.tellYou(connId, "moved"); told.add(connId); }
    for (const p of this.model.people.values()) {
      if ((before.get(p.id) || false) === held(p)) continue;
      for (const connId of p.conns.keys()) if (!told.has(connId)) this.tellYou(connId);
    }
    await this.flush();
    // The Room's own word is when it can hear: anything it was not told before (a lost call) goes again now.
    this.sourcesChanged();
    this.listenersChanged();
    // A world publication gone or replaced: every subscription to the old one is closed at once. The answer names the
    // speakers whose subscriptions the SFU has not yet confirmed closed: the Room's `closed` for them waits (#667).
    await this.media.prune();
    this.media.announce();
    const pending = this.media.pending();
    // Report every retirement that finished meanwhile, by any path, before the pending list moves on.
    this.confirmRetired();
    await this.scheduleAlarm();
    if (clean.length) this.refreshContributions();
    return { ok: true, pending: [...pending], listeners: this.hearingCounts() };
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
  /**
   * An account renamed (renames.js): its rows take the new name in a delta, as any change does, so every roster, tile,
   * cloud and chat card shows it at once, and its sockets keep it through hibernation. `identity` is `gh:<id>`.
   */
  async renamed(identity, display) {
    const p = typeof identity === "string" ? this.model.people.get(identity) : null;
    if (!p || typeof display !== "string" || !display || display.length > 50 || p.info.display === display) return { renamed: 0 };
    this.model.setInfo(identity, { display });
    for (const connId of p.conns.keys()) this.save(connId);
    // A hosted chat's held speaker (disconnected, their place kept) lives in the stored quiet holds: written again, or a
    // wake would bring the old name back at the new revision.
    if (p.held) await this.saveQuiet();
    await this.flush();
    if (this.chat) this.listed();
    return { renamed: 1 };
  }

  async revoke(principal, reason) {
    if (!principal || !PRINCIPAL.test(principal.id)) return { revoked: 0 };
    let revoked = 0;
    for (const c of [...this.model.conns.values()]) {
      if (c.principal !== principal.id) continue;
      revoked++;
      if (reason === "eligibility") {
        c.eligible = false;
        if (c.viewHz) c.viewHz = WALK_HZ;
        const lease = this.model.endLease(c.connId);
        if (lease) this.leaseEnded(c.connId, lease, "revoked");
        this.save(c.connId);
        this.tellYou(c.connId);
      } else this.close(c.connId, CLOSE.auth, reason === "deleted" ? "account_deleted" : "signed_out");
    }
    await this.flush();
    // A host signed out starts the hold, which only the alarm ends.
    if (revoked) await this.scheduleAlarm();
    return { revoked };
  }

  stats() {
    const zones = {};
    for (const zone of ZONES) zones[zone] = { ...this.model.counts(zone), rows: this.model.zones[zone].rows.size, rev: this.model.zones[zone].rev };
    return { epoch: this.model.epoch, connections: this.model.conns.size, zones, watching: [...this.watching] };
  }

  // The Inspector, when a viewer connects: report now, as the Room does.
  inspectWatch(until) {
    this.inspect.watch(until);
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
        const snapshot = await readContributorSnapshot(oogatron(this.env));
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
