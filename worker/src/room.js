// The island room: one Durable Object holding every signed-in player's socket. The Worker is its
// only door (`/room`), and it hands over who the player is in x-player-* headers after checking the
// session; nothing a client sends can change its identity. Ported from the OBL-Audio prototype:
// hibernatable sockets with attachments, a snapshot at most 15 times a second while anything moves, an
// alarm sweeping silent sockets once a minute, and one socket per player, where a newer one kicks the older with `replaced`.
// Every claim on an Ooga passes `claimRefusal` against the cast the build writes (characters.gen.json).
// Voice: the room alone talks to the Realtime SFU (the secret stays here), decides who hears whom
// (`voicePeers`: both driving an Ooga in the same place) and re-checks it on every pull, so a page never
// learns another player's session and cannot pull a voice it may not hear.
// NPCs: the room elects one page as host (`electHost`), relays its binary pose frames to every other
// page showing the island, and keeps the latest frame for pages that arrive or come back.
// Cost: the room hibernates whenever nothing is happening, so no timer runs while idle: a snapshot is a
// one-shot flush scheduled by a pose, voice lists are sent when who hears whom can change, and the host
// is told how many pages follow it (`host { id, followers }`) so a lone host sends no frames, and who is
// in voice or muted goes out (`vstate`) only when it changes, as health does (`hp`). The last voice list
// each player was sent lives in its attachment (`sent`), so a woken room still knows what every page holds.

import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, TICK_HZ,
  NPC_FRAME_MAX, NPC_HZ, OUTSIDE, HP_HZ, VOICE_TRACK, castIndex, electHost, npcFollowers, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken, voicePeers,
} from "./protocol.js";
import { sfuClient } from "./sfu.js";
import { STUDIO_ZONE, studioState, studioHostAllowed, studioCanSpeak, studioPosition, studioSeatAllowed } from "./studio-policy.js";
import CAST_ROWS from "./characters.gen.json";

const CAST = castIndex(CAST_ROWS);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.studio = studioState();
    this.cleanupJobs = [];
    this.spawnSlot = 0;
    this.dirty = false;
    this.flushTimer = 0;
    this.sfu = sfuClient(env);
    this.hostId = 0;
    this.followers = 0;
    this.lastNpc = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // The pile's sound loop started once, for good: every page plays it at (now - loopEpoch), so all
    // hear the same crackle at the same moment. Stored, so a woken or redeployed room keeps the phase.
    this.loopEpoch = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.studio = (await ctx.storage.get("studio")) || this.studio;
      this.cleanupJobs = (await ctx.storage.get("voiceCleanup")) || [];
      this.loopEpoch = (await ctx.storage.get("loopEpoch")) || Date.now();
      await ctx.storage.put("loopEpoch", this.loopEpoch);
      if (this.studio.hostId && (!this.players.has(this.studio.hostId) || this.players.get(this.studio.hostId).zone !== STUDIO_ZONE)) this.suspendStudio();
      await this.retryCleanup();
    });
    // A woken room rebuilds its roster from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
    this.hostId = electHost(this.players.values());
    this.followers = npcFollowers(this.players.values(), this.hostId);
  }

  record(ws, a) {
    return { ws, voice: { pub: null, sub: null, track: null, gen: 0, mids: {}, pubMid: null }, muted: false, hp: 100, ko: false, sent: null, zone: OUTSIDE, inHub: false, joinedAt: Date.now(), ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, npcBucket: { tokens: NPC_HZ, at: Date.now() }, hpBucket: { tokens: HP_HZ, at: Date.now() }, seenAt: Date.now() };
  }

  attachment(p) {
    return { id: p.id, login: p.login, display: p.display, contributor: p.contributor, body: p.body, connectionToken: p.connectionToken, studioSeat: p.studioSeat, studioRevoked: !!p.studioRevoked, studioResults: p.studioResults, x: p.x, y: p.y, z: p.z, yaw: p.yaw, voice: p.voice, muted: p.muted, hp: p.hp, ko: p.ko, sent: p.sent, zone: p.zone, inHub: p.inHub, joinedAt: p.joinedAt };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, zone: p.zone, x: p.x, y: p.y, z: p.z, yaw: p.yaw, voice: !!p.voice.track, muted: p.muted, hp: p.hp, ko: p.ko };
  }

  send(ws, msg) {
    try {
      ws.send(typeof msg === "string" || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg));
    } catch {
      // A socket closing under us is dropped by its close event.
    }
  }

  broadcast(msg, except = null) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws !== except) this.send(p.ws, text);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/voice/")) return this.voiceRequest(path.slice("/voice/".length), request);
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who) return new Response("Forbidden", { status: 403 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);

    const older = this.players.get(who.id);
    if (older) this.evict(older, "replaced");
    if (this.players.size >= MAX_PLAYERS) {
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const spawn = spawnPoint(this.spawnSlot++);
    const p = this.record(server, { ...who, connectionToken: crypto.randomUUID(), body: null, x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw });
    server.serializeAttachment(this.attachment(p));
    // An owner arriving takes their Ooga back from whoever holds it.
    const own = CAST.handleOf.get(p.login.toLowerCase());
    if (own) for (const o of this.players.values()) if (o.body && o.body.toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, connectionToken: p.connectionToken, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch, host: this.hostId, followers: this.followers });
    this.broadcast({ t: "join", p: this.view(p) }, server);
    this.sendStudio(p);
    this.updateVoice();
    await this.ensureSweep();
    return new Response(null, { status: 101, webSocket: client });
  }

  byWs(ws) {
    const a = ws.deserializeAttachment();
    const p = a && this.players.get(a.id);
    return p && p.ws === ws ? p : null;
  }

  webSocketMessage(ws, message) {
    const p = this.byWs(ws);
    if (!p) return;
    if (typeof message !== "string") {
      this.npcFrame(p, message);
      return;
    }
    const msg = parseClientMessage(typeof message === "string" ? message : "");
    if (msg === false) {
      this.drop(p, "protocol");
      ws.close(CLOSE_PROTOCOL, "unreadable message");
      return;
    }
    p.seenAt = Date.now();
    if (!msg) return;
    if (msg.t === "studio") {
      this.background(this.checkAccount(p).then(active => { if (active && this.players.get(p.id) === p) this.studioCommand(p, msg); }));
    } else if (msg.t === "pose") {
      if (!takeToken(p.bucket, MOVE_HZ, p.seenAt)) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
      if (Number.isInteger(p.studioSeat) && !studioSeatAllowed(p, p.studioSeat, this.players.values())) { delete p.studioSeat; this.studio.revision++; this.persistStudio(); this.enforceStudio(); }
      this.dirty = true;
      this.scheduleFlush();
    } else if (msg.t === "hub") {
      if (msg.on === p.inHub) return;
      p.inHub = msg.on;
      this.electHost();
      // A page arriving on the island catches up with the NPCs at once rather than at the next frame.
      if (p.inHub && p.id !== this.hostId && this.lastNpc) this.send(p.ws, this.lastNpc);
    } else if (msg.t === "zone") {
      if (msg.name === p.zone) return;
      const leavingStudio = p.zone === STUDIO_ZONE;
      p.zone = msg.name;
      if (leavingStudio) this.leaveStudio(p);
      if (p.zone === STUDIO_ZONE) { this.enforceStudio(); this.sendStudio(p); }
      this.broadcast({ t: "zone", id: p.id, name: p.zone });
      // The page let go of every voice when it moved, so it always hears where it is now, changed list or not.
      p.sent = null;
      this.enforceStudio(); this.updateVoice();
    } else if (msg.t === "hp") {
      if (msg.v === p.hp && msg.ko === p.ko) return;
      if (!takeToken(p.hpBucket, HP_HZ, p.seenAt)) return;
      p.hp = msg.v;
      p.ko = msg.ko;
      this.broadcast({ t: "hp", id: p.id, v: p.hp, ko: p.ko }, p.ws);
    } else if (msg.t === "mute") {
      if (msg.on === p.muted) return;
      p.muted = msg.on;
      this.voiceState(p);
    } else if (msg.t === "body") {
      if (msg.name === p.body) return;
      const refusal = claimRefusal(CAST, p.login, msg.name, this.players.values(), p.contributor);
      if (refusal) {
        this.send(ws, { t: "release", name: msg.name, reason: refusal });
        if (p.body === null) return;
        p.body = null;
      } else {
        p.body = msg.name;
      }
      // Another Ooga, or none: its health is reported afresh.
      p.hp = 100;
      p.ko = false;
      if (!p.body) this.leaveStudio(p);
      this.broadcast({ t: "body", id: p.id, name: p.body });
      this.enforceStudio(); this.updateVoice();
    }
    ws.serializeAttachment(this.attachment(p));
  }

  // The prototype's note stands: on this compatibility date close handlers must not call ws.close().
  webSocketClose(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "closed");
  }

  webSocketError(ws) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "error");
  }

  drop(p, reason) {
    if (this.players.get(p.id) !== p) return;
    this.leaveStudio(p);
    this.background(this.clearVoice(p));
    this.players.delete(p.id);
    this.broadcast({ t: "leave", id: p.id, reason });
    this.electHost();
    this.updateVoice();
    if (!this.players.size && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = 0;
    }
  }

  release(p, reason) {
    this.send(p.ws, { t: "release", name: p.body, reason });
    p.body = null;
    this.leaveStudio(p);
    p.ws.serializeAttachment(this.attachment(p));
    this.broadcast({ t: "body", id: p.id, name: null });
    this.updateVoice();
  }

  // An explicit kick before the close: a server-initiated close alone can leave the client in CLOSING.
  evict(p, reason) {
    this.drop(p, reason);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
  }

  // One snapshot at most every 1/TICK_HZ while poses arrive, and nothing pending once they stop, so the
  // room can hibernate between bursts (a running interval would keep it awake, and billed, for good).
  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = 0;
      this.snapshot();
    }, 1000 / TICK_HZ);
  }

  snapshot() {
    if (!this.dirty) return;
    this.dirty = false;
    const ps = [];
    for (const p of this.players.values()) ps.push(p.id, p.x, p.y, p.z, p.yaw);
    this.broadcast({ t: "state", now: Date.now(), ps });
  }

  // Also after any page's `hub` flag changes: the host sends frames only while someone follows.
  electHost() {
    const id = electHost(this.players.values());
    const followers = npcFollowers(this.players.values(), id);
    if (id === this.hostId && followers === this.followers) return;
    this.hostId = id;
    this.followers = followers;
    if (!id) this.lastNpc = null;
    this.broadcast({ t: "host", id, followers });
  }

  // A binary frame is the NPC host's poses: taken only from the current host, capped in size and rate,
  // and relayed unchanged to every other page showing the island.
  npcFrame(p, data) {
    if (p.id !== this.hostId || !p.inHub) return;
    if (!(data instanceof ArrayBuffer) || data.byteLength > NPC_FRAME_MAX) return;
    if (!takeToken(p.npcBucket, NPC_HZ, Date.now())) return;
    p.seenAt = Date.now();
    this.lastNpc = data;
    for (const q of this.players.values()) if (q !== p && q.inHub) this.send(q.ws, data);
  }

  // Tells each player whom to hear, with each one's publication (`gens`: a microphone published again is
  // pulled again), only when that changed since the list the player last got (`sent`, kept through a
  // hibernation; null sends regardless). Called wherever it can change: a join or leave, a body or zone, a
  // voice session opened, announced or left.
  updateVoice() {
    if (!this.sfu) return;
    const desired = voicePeers([...this.players.values()], this.studio);
    for (const p of this.players.values()) {
      const peers = desired.get(p.id) || [];
      const gens = peers.map((id) => this.players.get(id).voice.gen || 0);
      const sig = peers.map((id, i) => `${id}:${gens[i]}`).join(",");
      if (p.sent === sig) continue;
      p.sent = sig;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "voice", peers, gens });
    }
  }

  // Every other page's roster shows who is in voice (a live microphone) and who muted it: sent on a change only.
  voiceState(p) {
    this.broadcast({ t: "vstate", id: p.id, voice: !!p.voice.track, muted: p.muted }, p.ws);
  }

  // /voice/<op> from the Worker, which checked the session and set x-player-id. Ops: session (a publish
  // or receive session), publish (the mic's offer), live (the publishing connection is up: only now is the
  // mic announced, since pulling a publication before it connects fails), pull (peers the room allows),
  // renegotiate, close (dropped peers' tracks), leave (forget this player's sessions).
  async voiceRequest(op, request) {
    const p = this.players.get(Number(request.headers.get("x-player-id")));
    if (!p) return new Response(JSON.stringify({ error: "join the island first" }), { status: 409, headers: { "content-type": "application/json" } });
    if (!p.connectionToken || request.headers.get("x-room-token") !== p.connectionToken) return new Response(JSON.stringify({ error: "connection replaced" }), { status: 409, headers: { "content-type": "application/json" } });
    const result = (p.voiceQueue || Promise.resolve()).catch(() => {}).then(() => this.voiceOperation(op, request, p));
    p.voiceQueue = result.then(() => {}, () => {});
    return result;
  }

  async voiceOperation(op, request, expected) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (!this.sfu) return json({ error: "voice is not configured" }, 503);
    const p = this.players.get(Number(request.headers.get("x-player-id")));
    if (!p || p !== expected) return json({ error: "connection replaced" }, 409);
    let body = {};
    try {
      body = await request.json();
    } catch {
      // No body.
    }
    if (this.players.get(p.id) !== p || (p.connectionToken && request.headers.get("x-room-token") !== p.connectionToken)) return json({ error: "connection replaced" }, 409);
    if ((this.cleanupJobs || []).length >= 64 && !["leave", "unpublish", "close"].includes(op)) return json({ error: "media cleanup backlog; try later" }, 503);
    const was = !!p.voice.track;
    const voice = p.voice;
    let generation = voice.version || 0;
    const current = () => this.players.get(p.id) === p && p.voice === voice && (voice.version || 0) === generation;
    const mayPublish = () => p.zone !== STUDIO_ZONE || studioCanSpeak(this.studio, p);
    try {
      if (op === "session") {
        const kind = body.kind === "pub" ? "pub" : "sub";
        if (kind === "pub" && !mayPublish()) return json({ error: "Studio speaking is not permitted" }, 403);
        await this.clearVoiceKind(p, kind);
        generation = voice.version || 0;
        const { sessionId } = await this.sfu.newSession();
        if (!current() || (kind === "pub" && !mayPublish())) return json({ error: "connection or permission changed" }, 409);
        p.voice[kind] = sessionId;
        if (kind === "pub") p.voice.track = p.voice.pending = null;
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (was && !p.voice.track) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "publish") {
        if (!mayPublish()) return json({ error: "Studio speaking is not permitted" }, 403);
        if (!p.voice.pub || typeof body.sdp !== "string" || typeof body.mid !== "string") return json({ error: "bad publish" }, 400);
        const publishingSession = p.voice.pub;
        p.voice.pubMid = body.mid;
        p.ws.serializeAttachment(this.attachment(p));
        let res;
        try { res = await this.sfu.newTracks(publishingSession, {
          sessionDescription: { type: "offer", sdp: body.sdp },
          tracks: [{ location: "local", mid: body.mid, trackName: VOICE_TRACK }],
        }); } catch (err) { if (p.voice.pub === publishingSession) { p.voice.pub = p.voice.pubMid = p.voice.track = p.voice.pending = null; p.ws.serializeAttachment(this.attachment(p)); }
          await this.queueClose(publishingSession, [body.mid], true); throw err; }
        const t = res.tracks && res.tracks[0];
        if (!t || t.errorCode) return json({ error: (t && t.errorDescription) || "publish failed" }, 502);
        const mid = t.mid || body.mid;
        if (!current() || !mayPublish()) { await this.queueClose(publishingSession, [mid]); return json({ error: "connection or permission changed" }, 409); }
        p.voice.pubMid = mid;
        p.voice.pending = VOICE_TRACK;
        p.ws.serializeAttachment(this.attachment(p));
        return json({ sessionDescription: res.sessionDescription });
      }
      if (op === "live") {
        if (!mayPublish()) return json({ error: "Studio speaking is not permitted" }, 403);
        if (!p.voice.pub || !p.voice.pending) return json({ error: "nothing published" }, 400);
        p.voice.track = p.voice.pending;
        // A new count for every microphone that goes live, never reused: whoever heard an older one pulls this one.
        p.voice.gen = Math.max(Date.now(), (p.voice.gen || 0) + 1);
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (!was) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "pull") {
        if (!p.voice.sub || !Array.isArray(body.ids)) return json({ error: "bad pull" }, 400);
        const allowed = new Set(voicePeers([...this.players.values()], this.studio).get(p.id) || []);
        if (Object.keys(p.voice.mids || {}).length >= 64) return json({ error: "close old subscriptions first" }, 409);
        const tracks = [], idOf = new Map();
        for (const id of [...new Set(body.ids.slice(0, 64))]) {
          const q = this.players.get(id);
          if (!allowed.has(id) || !q || !q.voice.pub) continue;
          tracks.push({ location: "remote", sessionId: q.voice.pub, trackName: q.voice.track });
          idOf.set(q.voice.pub, id);
        }
        if (!tracks.length) return json({ tracks: [], requiresImmediateRenegotiation: false });
        if (Object.keys(p.voice.mids || {}).length + tracks.length > 64) return json({ error: "close old subscriptions first" }, 409);
        const receivingSession = p.voice.sub;
        let res;
        try { res = await this.sfu.newTracks(receivingSession, { tracks }); } catch (err) {
          // Unknown MIDs after timeout: abandon this receiver and inspect its server allocations.
          if (p.voice.sub === receivingSession) { p.voice.sub = null; p.voice.mids = {}; p.sent = null; p.ws.serializeAttachment(this.attachment(p)); }
          await this.queueClose(receivingSession, [], true); throw err;
        }
        const allowedNow = new Set(voicePeers([...this.players.values()], this.studio).get(p.id) || []);
        const stale = !current() || tracks.some(t => { const q = this.players.get(idOf.get(t.sessionId)); return !q || q.voice.pub !== t.sessionId || !allowedNow.has(q.id); });
        if (stale) { await this.queueClose(receivingSession, (res.tracks || []).filter(t => !t.errorCode).map(t => t.mid)); return json({ error: "connection or permission changed" }, 409); }
        p.voice.mids = p.voice.mids || {};
        for (const t of res.tracks || []) if (!t.errorCode && typeof t.mid === "string") p.voice.mids[t.mid] = idOf.get(t.sessionId);
        p.ws.serializeAttachment(this.attachment(p));
        return json({
          tracks: (res.tracks || []).map((t) => ({ id: idOf.get(t.sessionId) ?? null, mid: t.mid, errorCode: t.errorCode })),
          sessionDescription: res.sessionDescription,
          requiresImmediateRenegotiation: !!res.requiresImmediateRenegotiation,
        });
      }
      if (op === "renegotiate") {
        if (!p.voice.sub || typeof body.sdp !== "string") return json({ error: "bad renegotiate" }, 400);
        await this.sfu.renegotiate(p.voice.sub, body.sdp);
        return json({ ok: true });
      }
      if (op === "close") {
        if (!p.voice.sub || !Array.isArray(body.mids)) return json({ error: "bad close" }, 400);
        const mids = body.mids.filter((m) => typeof m === "string" && Object.hasOwn(p.voice.mids || {}, m)).slice(0, 64);
        if (mids.length) await this.queueClose(p.voice.sub, mids);
        for (const mid of mids) delete p.voice.mids[mid];
        p.ws.serializeAttachment(this.attachment(p));
        return json({ ok: true });
      }
      if (op === "unpublish") {
        await this.clearVoiceKind(p, "pub");
        p.ws.serializeAttachment(this.attachment(p));
        this.enforceStudio(); this.updateVoice();
        if (was) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "leave") {
        await this.clearVoice(p);
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (was) this.voiceState(p);
        return json({ ok: true });
      }
      return json({ error: "unknown voice op" }, 404);
    } catch (err) {
      // Return a bounded public error; SDP and upstream session identifiers never enter logs.
      return json({ error: "the voice service did not answer" }, 502);
    }
  }

  sendStudio(p) {
    if (!this.studio) return;
    const seats = [...this.players.values()].filter(q => q.zone === STUDIO_ZONE && Number.isInteger(q.studioSeat)).map(q => ({ id: q.id, seat: q.studioSeat }));
    this.send(p.ws, { t: "studio-state", state: { ...this.studio, cleanupPending: !!(this.cleanupJobs && this.cleanupJobs.length), seats, allowedHost: studioHostAllowed(this.env, p.id), canSpeak: studioCanSpeak(this.studio, p) } });
  }

  persistStudio() {
    if (this.ctx && this.ctx.storage) this.ctx.waitUntil(this.ctx.storage.put("studio", this.studio));
    for (const p of this.players.values()) this.sendStudio(p);
  }

  suspendStudio() {
    this.studio.position = studioPosition(this.studio, Date.now());
    this.studio.at = Date.now(); this.studio.playing = false;
    this.studio.hostId = 0; this.studio.mode = "suspended";
    this.studio.epoch++; this.studio.revision++;
    this.persistStudio();
    this.enforceStudio();
  }

  leaveStudio(p) {
    if (!this.studio || (!Number.isInteger(p.studioSeat) && !p.studioRevoked && this.studio.hostId !== p.id)) return;
    delete p.studioSeat; p.studioRevoked = false;
    if (this.studio.hostId === p.id) this.suspendStudio();
    else { this.studio.revision++; this.persistStudio(); this.enforceStudio(); }
  }

  studioCommand(p, msg) {
    if (!this.studio) this.studio = studioState();
    const s = this.studio;
    const reply = error => {
      const result = { t: "studio-result", action: msg.action, commandId: msg.commandId, ok: !error, error, revision: s.revision };
      if (msg.commandId) { p.studioResults = (p.studioResults || []).slice(-31); p.studioResults.push(result); p.ws.serializeAttachment(this.attachment(p)); }
      this.send(p.ws, result); this.sendStudio(p);
    };
    const prior = msg.commandId && (p.studioResults || []).find(r => r.commandId === msg.commandId);
    if (prior) { this.send(p.ws, prior); this.sendStudio(p); return; }
    if (!p.studioBucket) p.studioBucket = { tokens: 8, at: Date.now() };
    if (!takeToken(p.studioBucket, 8, Date.now())) return reply("Please wait before another Studio command");
    if (p.zone !== STUDIO_ZONE) return reply("Enter the Studio first");
    if (msg.revision !== undefined && msg.revision !== s.revision) return reply("Studio state changed; try again");
    const host = p.id === s.hostId;
    if (msg.action === "seat") {
      if (!studioSeatAllowed(p, msg.seat, this.players.values())) return reply("Seat unavailable or too far away");
      p.studioSeat = msg.seat;
    } else if (msg.action === "stand") delete p.studioSeat;
    else if (msg.action === "claim") {
      if (!studioHostAllowed(this.env, p.id) || (s.hostId && !host)) return reply("An approved host must claim an available session");
      s.hostId = p.id; s.mode = "discussion"; s.epoch++; s.restrictedIds = []; p.studioRevoked = false;
    } else {
      if (!host) return reply("Only the Studio host may do that");
      s.position = studioPosition(s, Date.now()); s.at = Date.now();
      if (msg.action === "release") { this.suspendStudio(); return reply(); }
      if (msg.action === "mode") s.mode = msg.mode;
      if (msg.action === "play") { s.playing = true; if (s.position >= 12) s.position = 0; }
      if (msg.action === "pause") s.playing = false;
      if (msg.action === "seek") s.position = msg.position;
      if (msg.action === "volume") s.volume = msg.volume;
      if (msg.action === "source") { s.source = "sample"; s.position = 0; s.playing = false; }
      if (msg.action === "transfer") {
        const q = this.players.get(msg.id);
        if (!q || q.zone !== STUDIO_ZONE || !studioHostAllowed(this.env, q.id)) return reply("Choose an approved host inside the Studio");
        this.background(this.clearVoiceKind(p, "pub")); this.background(this.clearVoiceKind(q, "pub"));
        this.send(p.ws, { t: "studio-mic-revoked" }); this.send(q.ws, { t: "studio-mic-revoked" });
        s.hostId = q.id; q.studioRevoked = false; s.epoch++; s.playing = false;
      }
      if (msg.action === "revoke") {
        const q = this.players.get(msg.id);
        if (!q || q === p || q.zone !== STUDIO_ZONE) return reply("Choose an attendee inside the Studio");
        if ((s.restrictedIds || []).length >= 64 && !s.restrictedIds.includes(q.id)) return reply("Session moderation limit reached; release and reclaim to start a new session");
        s.restrictedIds = [...new Set((s.restrictedIds || []).concat(q.id))];
        q.studioRevoked = true; q.ws.serializeAttachment(this.attachment(q));
      }
    }
    s.revision++;
    p.ws.serializeAttachment(this.attachment(p));
    this.persistStudio(); this.enforceStudio(); reply();
  }

  enforceStudio() {
    if (!this.studio || !this.sfu) return;
    for (const p of this.players.values()) {
      if (p.zone === STUDIO_ZONE && !studioCanSpeak(this.studio, p) && (p.voice.pub || p.voice.pending || p.voice.track)) {
        // Invalidate immediately. An in-flight operation rechecks the same voice object and policy.
        const old = p.voice;
        p.voice = { ...old, pub: null, pubMid: null, track: null, pending: null };
        this.background(this.queueClose(old.pub, old.pubMid ? [old.pubMid] : [], !!old.pub && !old.pubMid));
        p.ws.serializeAttachment(this.attachment(p)); this.voiceState(p);
        this.send(p.ws, { t: "studio-mic-revoked" });
      }
    }
    const desired = voicePeers([...this.players.values()], this.studio);
    for (const p of this.players.values()) {
      const allowed = new Set(desired.get(p.id));
      const mids = Object.keys(p.voice.mids || {}).filter(mid => !allowed.has(p.voice.mids[mid]));
      if (mids.length) { this.background(this.queueClose(p.voice.sub, mids)); for (const mid of mids) delete p.voice.mids[mid]; p.ws.serializeAttachment(this.attachment(p)); }
    }
    this.updateVoice();
  }

  background(task) { if (this.ctx && this.ctx.waitUntil) this.ctx.waitUntil(task); else task.catch(() => {}); }

  async clearVoiceKind(p, kind) {
    const v = p.voice;
    v.version = (v.version || 0) + 1;
    const mids = kind === "pub" ? (v.pubMid ? [v.pubMid] : []) : Object.keys(v.mids || {});
    const session = v[kind]; v[kind] = null;
    if (kind === "pub") { v.track = v.pending = v.pubMid = null; } else v.mids = {};
    await this.queueClose(session, mids, !!session && !mids.length);
  }

  async clearVoice(p) {
    const old = p.voice;
    p.voice = { pub: null, sub: null, track: null, pending: null, gen: old.gen || 0, mids: {}, pubMid: null };
    await Promise.all([this.queueClose(old.pub, old.pubMid ? [old.pubMid] : [], !!old.pub && !old.pubMid), this.queueClose(old.sub, Object.keys(old.mids || {}), !!old.sub && !Object.keys(old.mids || {}).length)]);
  }

  async queueClose(session, mids, inspect = false) {
    if (!this.sfu || !session || (!mids.length && !inspect)) return;
    if (!this.cleanupJobs) this.cleanupJobs = [];
    const existing = this.cleanupJobs.find(job => job.session === session);
    if (existing) { existing.revision = (existing.revision || 0) + 1; existing.mids = [...new Set(existing.mids.concat(mids))]; existing.midVersions = existing.midVersions || {}; for (const mid of mids) existing.midVersions[mid] = existing.revision; existing.inspect = existing.inspect || inspect; if (inspect) existing.inspectUntil = Date.now() + 20000; }
    else this.cleanupJobs.push({ session, revision: 0, mids: [...new Set(mids)], midVersions: Object.fromEntries(mids.map(mid => [mid, 0])), inspect, inspectUntil: inspect ? Date.now() + 20000 : 0 });
    if (this.ctx && this.ctx.storage) await this.ctx.storage.put("voiceCleanup", this.cleanupJobs);
    for (const p of this.players.values()) if (p.zone === STUDIO_ZONE) this.sendStudio(p);
    await this.retryCleanup();
  }

  async retryCleanup() {
    if (!this.sfu || !this.cleanupJobs || !this.cleanupJobs.length) return;
    if (this.cleanupRunning) return this.cleanupRunning;
    this.cleanupRunning = (async () => {
      for (const job of [...this.cleanupJobs]) {
        try {
          const revision = job.revision || 0;
          if (job.inspect) {
            const priorVersions = { ...(job.midVersions || {}) };
            const state = await this.sfu.getSession(job.session);
            const inactive = new Set((state.tracks || []).filter(t => t.status === "inactive").map(t => t.mid));
            job.mids = job.mids.filter(mid => !inactive.has(mid) || (job.midVersions || {})[mid] !== priorVersions[mid]);
            job.mids = [...new Set(job.mids.concat((state.tracks || []).filter(t => t.status !== "inactive" && typeof t.mid === "string").map(t => t.mid)))];
          }
          const mids = job.mids.slice();
          const versions = { ...(job.midVersions || {}) };
          const res = mids.length ? await this.sfu.closeTracks(job.session, mids) : { tracks: [] };
          // Only explicit per-track successes relinquish ownership. Missing/malformed rows retry.
          const succeeded = new Set((Array.isArray(res.tracks) ? res.tracks : []).filter(t => t && typeof t.mid === "string" && !t.errorCode).map(t => t.mid));
          job.mids = job.mids.filter(mid => !succeeded.has(mid) || (job.midVersions || {})[mid] !== versions[mid]);
          for (const mid of succeeded) if (!job.mids.includes(mid) && job.midVersions) delete job.midVersions[mid];
          if (job.mids.length) job.inspect = true;
          // A concurrent queue may have appended/reallocated owned MIDs while upstream was pending.
          if ((job.revision || 0) !== revision || job.mids.length || (job.inspect && Date.now() < job.inspectUntil)) continue;
          this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1);
        } catch (err) {
          // A confirmed absent upstream session owns no tracks and needs no further retry.
          if (err.status === 404) this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1);
          // Other failures retain ownership for the existing room alarm.
        }
      }
      if (this.ctx && this.ctx.storage) {
        await this.ctx.storage.put("voiceCleanup", this.cleanupJobs);
        if (this.cleanupJobs.length) await this.ensureSweep();
      }
      for (const p of this.players.values()) if (p.zone === STUDIO_ZONE) this.sendStudio(p);
    })();
    try { await this.cleanupRunning; } finally { this.cleanupRunning = null; }
  }

  async checkAccount(p) {
    if (!this.env || !this.env.DB) return true;
    try {
      const row = await this.env.DB.prepare("SELECT id, banned_at FROM players WHERE id = ?1").bind(p.id).first();
      if (!row || row.banned_at) { if (this.players.get(p.id) === p) this.evict(p, "account-unavailable"); return false; }
      return true;
    } catch { return false; }
  }

  async ensureSweep() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + SWEEP_MS);
  }

  // Sockets silent past STALE_MS, auto-answered pings included, are evicted as stale.
  async alarm() {
    const now = Date.now();
    await this.retryCleanup();
    for (const p of [...this.players.values()]) {
      if (!(await this.checkAccount(p))) continue;
      const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
      const last = Math.max(p.seenAt, pinged ? pinged.getTime() : 0);
      if (now - last > STALE_MS) this.evict(p, "stale");
    }
    if (this.players.size || (this.cleanupJobs && this.cleanupJobs.length)) await this.ctx.storage.setAlarm(now + SWEEP_MS);
  }
}
