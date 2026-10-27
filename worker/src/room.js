// The island room: one Durable Object holding every signed-in player's socket. The Worker is its
// only door (`/room`), and it hands over who the player is in x-player-* headers after checking the
// session; nothing a client sends can change its identity. Ported from the OBL-Audio prototype:
// hibernatable sockets with attachments, a snapshot at most 15 times a second while anything moves, an
// alarm sweeping silent sockets once a minute, and one socket per player, where a newer one kicks the older with `replaced`.
// Every claim on an Ooga or gorilla passes `claimRefusal` against the cast the build writes (characters.gen.json).
// Voice: the room alone talks to the Realtime SFU (the secret stays here), decides who hears whom
// (`voicePeers`: both driving a body in the same place) and re-checks it on every pull, so a page never
// learns another player's session and cannot pull a voice it may not hear.
// NPCs: the room elects one page as host (`electHost`), relays its binary pose frames to every other
// page showing the island, and keeps the latest frame for pages that arrive or come back.
// Cost: the room hibernates whenever nothing is happening, so no timer runs while idle: a snapshot is a
// one-shot flush scheduled by a pose, voice lists are sent when who hears whom can change, and the host
// is told how many pages follow it (`host { id, followers }`) so a lone host sends no frames, and who is
// in voice or muted goes out (`vstate`) only when it changes, as health does (`hp`). The last voice list
// each player was sent lives in its attachment (`sent`), so a woken room still knows what every page holds.
// Voice the room closed and the SFU has not confirmed retries from the alarm, after the last player left too,
// until it succeeds or CLEANUP_MS passes; without an SFU, nothing wakes for it.
// Chat: each line is named from the session, rate limited per account across awake-room reconnects, sent to every socket and kept in a
// ring of the last CHAT_KEEP in memory alone, which a joiner gets after `welcome`. No durable chat storage: a room
// that hibernates, restarts or is redeployed wakes with an empty ring, and the lines are gone.

import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, CLEANUP_MS, TICK_HZ,
  NPC_FRAME_MAX, NPC_HZ, OUTSIDE, HP_HZ, VOICE_TRACK, CHAT_HZ, CHAT_BURST, CHAT_BUCKET_KEEP, CHAT_RETRY_KEEP,
  DOOR_ZONE, DOOR_ROOM, DOOR_GRANT_MS, DOOR_TRANSIT_MS, DOOR_PASS_MS, DOOR_HZ, DOOR_BURST, GHOST_HZ, GHOST_BURST,
  chatLog, castIndex, bodyName, ownedBody, electHost, npcFollowers, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken, voicePeers,
} from "./protocol.js";
import { sha256Hex } from "./crypto.js";
import { getPlayer } from "./db.js";
import { sfuClient } from "./sfu.js";
import { STUDIO_TRANSPORT, STUDIO_ZONE, studioState, studioHostAllowed, studioCanSpeak, studioPosition, studioSeatAllowed, studioSource } from "./studio-policy.js";
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
    this.chat = chatLog();
    this.chatId = 0;
    this.chatAccepted = new Map();
    this.chatBuckets = new Map();
    this.doorQueue = [];
    this.doorActive = null;
    this.doorPasses = new Map();
    this.doorId = 0;
    this.sweepAt = 0;
    this.cleanupAt = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // The pile's sound loop started once, for good: every page plays it at (now - loopEpoch), so all
    // hear the same crackle at the same moment. Stored, so a woken or redeployed room keeps the phase.
    this.loopEpoch = 0;
    ctx.blockConcurrencyWhile(async () => {
      this.studio = (await ctx.storage.get("studio")) || this.studio;
      if (!studioSource(this.studio.source)) { this.studio.source = studioState().source; this.studio.position = 0; this.studio.playing = false; this.studio.at = Date.now(); this.studio.revision++; this.studio.playbackRevision = (this.studio.playbackRevision || 0) + 1; await ctx.storage.put("studio", this.studio); }
      this.studio.position = studioPosition(this.studio, this.studio.at);
      const seated = id => { const p = this.players.get(id); return !!p && p.zone === STUDIO_ZONE && !!p.body && Number.isInteger(p.studioSeat) && !p.studioRevoked && !(this.studio.restrictedIds || []).includes(id); };
      this.studio.hands = [...new Set((Array.isArray(this.studio.hands) ? this.studio.hands : []).filter(seated))].slice(0, MAX_PLAYERS);
      this.studio.invited = this.studio.mode === "qa" ? [...new Set((Array.isArray(this.studio.invited) ? this.studio.invited : []).filter(seated))].slice(0, MAX_PLAYERS) : [];
      this.cleanupJobs = (await ctx.storage.get("voiceCleanup")) || [];
      const stored = await ctx.storage.get(["loopEpoch", "sweepAt"]);
      this.loopEpoch = stored.get("loopEpoch") || Date.now();
      this.sweepAt = stored.get("sweepAt") || Date.now() + SWEEP_MS;
      await ctx.storage.put("loopEpoch", this.loopEpoch);
      await ctx.storage.put("sweepAt", this.sweepAt);
      if (this.studio.hostId && (!this.players.has(this.studio.hostId) || this.players.get(this.studio.hostId).zone !== STUDIO_ZONE || !studioHostAllowed(env, this.studio.hostId))) this.suspendStudio();
      // Stored cleanup retries from an alarm due now, never inside this block: each SFU call may take its 10 s, and a
      // block past 30 s resets the island's only room, presence and voice with it.
      if (this.sfu && this.cleanupJobs.length) {
        this.cleanupAt = Date.now();
        const set = await ctx.storage.getAlarm();
        if (set === null || set > this.cleanupAt) await ctx.storage.setAlarm(this.cleanupAt);
      }
    });
    // A woken room rebuilds its roster from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
    // Old guest sockets can survive a deployment in hibernated attachments.
    // Use the ordinary departure path so peers drop their presence and voice.
    for (const p of this.players.values()) if (!ownedBody(CAST, p.login, p.contributor)) this.evict(p, "revoked");
    this.restoreDoor();
    this.hostId = electHost(this.players.values());
    this.followers = npcFollowers(this.players.values(), this.hostId);
  }

  record(ws, a) {
    return { ws, voice: { pub: null, sub: null, track: null, gen: 0, mids: {}, pubMid: null }, muted: false, hp: 100, ko: false, g: null, sent: null, zone: OUTSIDE, pokerVoice: null, inHub: false, joinedAt: Date.now(), door: null, passes: [], ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, npcBucket: { tokens: NPC_HZ, at: Date.now() }, hpBucket: { tokens: HP_HZ, at: Date.now() }, doorBucket: { tokens: DOOR_BURST, at: Date.now() }, ghostBucket: { tokens: GHOST_BURST, at: Date.now() } /* HALLOWEEN */, chatBucket: this.chatBucketFor(a.id, Date.now()), seenAt: Date.now() };
  }

  // Retain account debt across socket records, only while awake. Reclaim fully replenished
  // inactive accounts on demand; at capacity refuse new debt rather than evict depleted buckets.
  chatBucketFor(id, now) {
    for (const [account, bucket] of this.chatBuckets) {
      if (!this.players.has(account) && bucket.tokens + (now - bucket.at) * CHAT_HZ / 1000 >= CHAT_BURST) this.chatBuckets.delete(account);
    }
    let bucket = this.chatBuckets.get(id);
    if (!bucket && this.chatBuckets.size < CHAT_BUCKET_KEEP) {
      bucket = { tokens: CHAT_BURST, at: now };
      this.chatBuckets.set(id, bucket);
    }
    return bucket || null;
  }

  attachment(p) {
    return { id: p.id, login: p.login, display: p.display, contributor: p.contributor, body: p.body, connectionToken: p.connectionToken, studioSeat: p.studioSeat, studioRevoked: !!p.studioRevoked, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, voice: p.voice, muted: p.muted, hp: p.hp, ko: p.ko, sent: p.sent, zone: p.zone, pokerVoice: p.pokerVoice, inHub: p.inHub, joinedAt: p.joinedAt, door: p.door, passes: p.passes };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, zone: p.zone, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, voice: !!p.voice.track, muted: p.muted, hp: p.hp, ko: p.ko };
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

  broadcastZone(zone, msg) {
    const text = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.zone === zone) this.send(p.ws, text);
  }

  restoreDoor() {
    const now = Date.now(), queued = [], active = [];
    for (const p of this.players.values()) {
      if (p.door && p.body && p.zone === DOOR_ZONE && p.door.exp > now) {
        if (p.door.phase === "queued") queued.push(p);
        else if (p.door.phase === "grant" || p.door.phase === "active") active.push(p);
        else p.door = null;
      } else p.door = null;
      p.passes = Array.isArray(p.passes) ? p.passes.filter((x) => x && DOOR_ROOM.test(x.door) && x.exp > now && p.body && p.zone === x.door) : [];
      for (const pass of p.passes) this.doorPasses.set(pass.cycle, { ...pass, id: p.id });
    }
    queued.sort((a, b) => a.door.at - b.door.at || a.id - b.id);
    active.sort((a, b) => a.door.at - b.door.at || a.id - b.id);
    this.doorQueue = queued.map((p) => p.id);
    if (active.length) {
      const p = active.shift();
      this.doorActive = { ...p.door, id: p.id };
      for (const extra of active) {
        extra.door = { phase: "queued", dir: extra.door.dir, room: extra.door.room, at: extra.door.at, exp: Number.MAX_SAFE_INTEGER };
        this.doorQueue.push(extra.id);
      }
    }
    for (const p of this.players.values()) {
      p.ws.serializeAttachment(this.attachment(p));
      this.replayDoor(p);
    }
  }

  doorCycle(p) {
    this.doorId = (this.doorId + 1) % 0x100000;
    return `${Date.now().toString(36)}_${p.id.toString(36)}_${this.doorId.toString(36)}`;
  }

  replayDoor(p) {
    const now = Date.now();
    if (p.zone === DOOR_ZONE && this.doorActive && this.doorActive.phase === "active" && this.doorActive.exp > now && this.doorActive.id !== p.id) {
      const a = this.doorActive;
      this.send(p.ws, { t: "transit", cycle: a.cycle, actor: a.id, door: DOOR_ZONE, dir: a.dir, at: a.startedAt, exp: a.exp });
    }
    if (DOOR_ROOM.test(p.zone)) for (const pass of this.doorPasses.values()) {
      if (pass.door === p.zone && pass.exp > now && pass.id !== p.id) this.send(p.ws, { t: "transit", cycle: pass.cycle, actor: pass.id, door: pass.door, dir: pass.dir, at: pass.at, exp: pass.exp });
    }
  }

  async doorMessage(p, msg) {
    const now = Date.now();
    if (!takeToken(p.doorBucket, DOOR_HZ, now, DOOR_BURST)) {
      this.send(p.ws, { t: "door", op: "denied", reason: "rate" });
      return;
    }
    if (msg.op === "ask") {
      if (!p.body || p.zone !== DOOR_ZONE) { this.send(p.ws, { t: "door", op: "denied", reason: "not-at-door" }); return; }
      if (p.door) { this.send(p.ws, { t: "door", op: "denied", reason: "already-waiting" }); return; }
      if (this.doorQueue.length >= MAX_PLAYERS) { this.send(p.ws, { t: "door", op: "denied", reason: "full" }); return; }
      p.door = { phase: "queued", dir: msg.dir, room: msg.room, at: now, exp: Number.MAX_SAFE_INTEGER };
      this.doorQueue.push(p.id);
      p.ws.serializeAttachment(this.attachment(p));
      if (!this.doorActive) this.grantDoor(now);
      else this.send(p.ws, { t: "door", op: "wait", ahead: Math.max(0, this.doorQueue.indexOf(p.id)) });
    } else if (msg.op === "go") {
      const a = this.doorActive;
      if (!a || a.id !== p.id || a.cycle !== msg.cycle || a.phase !== "grant" || a.exp <= now || !p.body || p.zone !== DOOR_ZONE) {
        this.send(p.ws, { t: "door", op: "denied", reason: "stale-grant" });
        return;
      }
      a.phase = p.door.phase = "active";
      a.startedAt = p.door.startedAt = now;
      a.exp = p.door.exp = now + DOOR_TRANSIT_MS;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "door", op: "started", cycle: a.cycle, exp: a.exp });
      this.broadcastZone(DOOR_ZONE, { t: "transit", cycle: a.cycle, actor: p.id, door: DOOR_ZONE, dir: a.dir, at: now, exp: a.exp });
    } else if (msg.op === "done") {
      if (this.doorActive && this.doorActive.id === p.id && this.doorActive.cycle === msg.cycle) this.finishDoor(now);
    } else if (msg.op === "cancel") {
      this.cancelDoor(p, now);
    } else if (msg.op === "pass") {
      if (!p.body || p.zone !== msg.door) { this.send(p.ws, { t: "door", op: "denied", reason: "wrong-room" }); return; }
      for (const pass of p.passes) this.doorPasses.delete(pass.cycle);
      const pass = { cycle: this.doorCycle(p), door: msg.door, dir: msg.dir, at: now, exp: now + DOOR_PASS_MS };
      p.passes = [pass];
      this.doorPasses.set(pass.cycle, { ...pass, id: p.id });
      p.ws.serializeAttachment(this.attachment(p));
      this.broadcastZone(msg.door, { t: "transit", cycle: pass.cycle, actor: p.id, door: pass.door, dir: pass.dir, at: pass.at, exp: pass.exp });
    }
    await this.scheduleAlarm();
  }

  grantDoor(now = Date.now()) {
    while (!this.doorActive && this.doorQueue.length) {
      const p = this.players.get(this.doorQueue.shift());
      if (!p || !p.body || p.zone !== DOOR_ZONE || !p.door || p.door.phase !== "queued") continue;
      const cycle = this.doorCycle(p), exp = now + DOOR_GRANT_MS;
      p.door = { ...p.door, phase: "grant", cycle, exp };
      this.doorActive = { ...p.door, id: p.id };
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "door", op: "grant", cycle, exp });
    }
    for (let i = 0; i < this.doorQueue.length; i++) {
      const p = this.players.get(this.doorQueue[i]);
      if (p) this.send(p.ws, { t: "door", op: "wait", ahead: i });
    }
  }

  finishDoor(now = Date.now()) {
    const a = this.doorActive;
    if (!a) return;
    if (a.phase === "active") this.broadcastZone(DOOR_ZONE, { t: "transit-end", cycle: a.cycle });
    const p = this.players.get(a.id);
    if (p) { p.door = null; p.ws.serializeAttachment(this.attachment(p)); }
    this.doorActive = null;
    this.grantDoor(now);
  }

  cancelDoor(p, now = Date.now()) {
    if (!p.door) return;
    if (this.doorActive && this.doorActive.id === p.id) this.finishDoor(now);
    else {
      this.doorQueue = this.doorQueue.filter((id) => id !== p.id);
      p.door = null;
      p.ws.serializeAttachment(this.attachment(p));
      this.grantDoor(now);
    }
  }

  clearPasses(p) {
    for (const pass of p.passes || []) {
      this.doorPasses.delete(pass.cycle);
      this.broadcastZone(pass.door, { t: "transit-end", cycle: pass.cycle });
    }
    p.passes = [];
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/voice/")) return this.voiceRequest(path.slice("/voice/".length), request);
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who || !ownedBody(CAST, who.login, who.contributor)) return new Response("Contributors with an Ooga only", { status: 403 });

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
    // An owner arriving takes either body back from whoever holds it.
    const own = ownedBody(CAST, p.login, p.contributor);
    if (own) for (const o of this.players.values()) if (o.body && bodyName(o.body).toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, connectionToken: p.connectionToken, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch, host: this.hostId, followers: this.followers, features: ["door"] });
    // A message of its own after welcome, so a page that does not know chat ignores it; empty after the room slept.
    this.send(server, { t: "chat-history", messages: this.chat.list() });
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
    if (!ownedBody(CAST, p.login, p.contributor)) { this.evict(p, "revoked"); return; }
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
      this.studioMessage(p, msg);
    } else if (msg.t === "pose") {
      if (!takeToken(p.bucket, MOVE_HZ, p.seenAt)) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
      if (msg.g && p.body && p.body.startsWith("gorilla:")) p.g = msg.g;
      if (Number.isInteger(p.studioSeat) && !studioSeatAllowed(p, p.studioSeat, this.players.values())) { delete p.studioSeat; this.removeStudioSpeaker(p.id); this.studio.revision++; this.persistStudio(); this.enforceStudio(); }
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
      if (msg.name !== DOOR_ZONE) this.cancelDoor(p);
      if (msg.name !== p.zone) this.clearPasses(p);
      const leavingStudio = p.zone === STUDIO_ZONE;
      p.zone = msg.name;
      p.pokerVoice = null;
      if (leavingStudio) this.leaveStudio(p);
      if (p.zone === STUDIO_ZONE) { this.enforceStudio(); this.sendStudio(p); }
      this.broadcast({ t: "zone", id: p.id, name: p.zone });
      // The page let go of every voice when it moved, so it always hears where it is now, changed list or not.
      p.sent = null;
      this.enforceStudio(); this.updateVoice();
      this.replayDoor(p);
    } else if (msg.t === "poker-voice") {
      if (p.zone !== "ember-den" || msg.table === p.pokerVoice) return;
      p.pokerVoice = msg.table;
      p.sent = null;
      // Also closes the receiver's tracks for players at the table it left.
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
    } else if (msg.t === "chat") {
      // Nothing in the attachment changes.
      return this.say(p, msg.text, msg.clientId);
    } else if (msg.t === "door") {
      return this.doorMessage(p, msg);
    } else if (msg.t === "ghost") {
      // HALLOWEEN: a follower on the island tells the host of the ghost hunt; nobody else hears it, nothing is kept.
      if (!p.inHub || !p.body || p.id === this.hostId) return;
      if (!p.ghostBucket) p.ghostBucket = { tokens: GHOST_BURST, at: p.seenAt };
      if (!takeToken(p.ghostBucket, GHOST_HZ, p.seenAt, GHOST_BURST)) return;
      const host = this.players.get(this.hostId);
      if (host && host.inHub) this.send(host.ws, { ...msg, from: p.id });
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
      if (!p.body) { this.cancelDoor(p); this.clearPasses(p); }
      // Another body, or none: its normalized health is reported afresh.
      p.hp = 100;
      p.ko = false;
      p.g = null;
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
    this.cancelDoor(p);
    this.clearPasses(p);
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
    this.cancelDoor(p);
    this.clearPasses(p);
    this.send(p.ws, { t: "release", name: p.body, reason });
    p.body = null;
    p.g = null;
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
    const ps = [], gs = [];
    for (const p of this.players.values()) {
      ps.push(p.id, p.x, p.y, p.z, p.yaw);
      if (p.g) gs.push(p.id, ...p.g);
    }
    this.broadcast(gs.length ? { t: "state", now: Date.now(), ps, gs } : { t: "state", now: Date.now(), ps });
  }

  // A line from a player, named by the session's login and display name; over the rate its sender is told.
  async say(p, text, clientId) {
    // Scope retry ids to the authenticated account, never to a socket or client-supplied identity.
    const key = clientId === undefined ? null : `${p.id}:${clientId}`;
    // Only the fingerprint outlives the visible ring. After the async hash, the identity check,
    // dedup lookup and acceptance run synchronously, so simultaneous retries cannot both accept.
    const fingerprint = key ? await sha256Hex(text) : null;
    if (this.players.get(p.id) !== p) return;
    if (key && this.chatAccepted.has(key)) {
      this.send(p.ws, this.chatAccepted.get(key) === fingerprint
        ? { t: "chat-ack", clientId } : { t: "chat-rejected", clientId, reason: "conflict" });
      return;
    }
    if (!p.chatBucket) p.chatBucket = this.chatBucketFor(p.id, p.seenAt);
    if (!p.chatBucket || !takeToken(p.chatBucket, CHAT_HZ, p.seenAt, CHAT_BURST)) {
      this.send(p.ws, { t: "chat-rejected", ...(clientId === undefined ? {} : { clientId }), reason: "rate" });
      return;
    }
    const at = Date.now();
    // Ids follow the clock and only grow, so a restarted room does not reuse one, as voice counts do not.
    this.chatId = Math.max(at, this.chatId + 1);
    const line = { id: this.chatId, at, login: p.login, name: p.display, text };
    if (key) {
      this.chatAccepted.set(key, fingerprint);
      if (this.chatAccepted.size > CHAT_RETRY_KEEP) this.chatAccepted.delete(this.chatAccepted.keys().next().value);
    }
    this.chat.push(line);
    this.broadcast({ t: "chat", ...line });
    if (key) this.send(p.ws, { t: "chat-ack", clientId });
  }

  // Also after any page's `hub` flag changes: the host sends frames only while someone follows.
  electHost() {
    const id = electHost(this.players.values(), this.hostId);
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
      // Receiving attendees do not publish tracks. Their receive sessions, rather
      // than the list of speakers this player hears, keep a Studio microphone live.
      let listeners;
      if (p.zone === STUDIO_ZONE) {
        listeners = 0;
        for (const q of this.players.values()) if (q !== p && q.zone === STUDIO_ZONE && q.voice && q.voice.sub) listeners++;
      }
      const sig = peers.map((id, i) => `${id}:${gens[i]}`).join(",") + (listeners === undefined ? "" : `|${listeners}`);
      if (p.sent === sig) continue;
      p.sent = sig;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "voice", peers, gens, ...(listeners === undefined ? {} : { listeners }) });
    }
  }

  // Every other page's roster shows who is in voice (a live microphone) and who muted it: sent on a change only.
  voiceState(p) {
    this.broadcast({ t: "vstate", id: p.id, voice: !!p.voice.track, muted: p.muted }, p.ws);
  }

  // /voice/<op> from the Worker, which checked the session and set x-player-id. Ops: session (a publish
  // or receive session), publish (the mic's offer), live (the publishing connection is up: only now is the
  // mic announced, since pulling a publication before it connects fails), pull (peers the room allows),
  // renegotiate, close (dropped peers' tracks), unpublish (give up the microphone and keep hearing), leave (forget
  // this player's sessions). Each call carries the socket's `x-room-token`, so a replaced connection's calls are
  // refused, and one player's calls run one at a time.
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
    if (!ownedBody(CAST, p.login, p.contributor)) {
      this.evict(p, "revoked");
      return json({ error: "contributors with an Ooga only" }, 403);
    }
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
    if (this.studio && this.studio.hostId && !studioHostAllowed(this.env, this.studio.hostId)) this.suspendStudio();
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
        // A restarted client cleared its local list, even if the room's list
        // and audience count have not changed since its previous receiver.
        if (kind === "sub") p.sent = null;
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
        const tracks = [], requested = new Map();
        for (const id of [...new Set(body.ids.slice(0, 64))]) {
          const q = this.players.get(id);
          if (!allowed.has(id) || !q || !q.voice.pub || !q.voice.track) continue;
          tracks.push({ location: "remote", sessionId: q.voice.pub, trackName: q.voice.track });
          requested.set(q.voice.pub, { id, track: q.voice.track });
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
        // A zone, body, socket, permission or publication can change while the SFU request is in flight. Keep
        // only the tracks still eligible (same publisher session and track) and close every other one, through
        // the retried cleanup queue, before its descriptor reaches the page.
        const live = current() && p.voice.sub === receivingSession;
        const allowedNow = live ? new Set(voicePeers([...this.players.values()], this.studio).get(p.id) || []) : new Set();
        const kept = [], close = [];
        for (const t of res.tracks || []) {
          const asked = requested.get(t.sessionId), q = asked && this.players.get(asked.id);
          if (live && asked && allowedNow.has(asked.id) && q && q.voice.pub === t.sessionId && q.voice.track === asked.track) {
            kept.push({ id: asked.id, mid: t.mid, errorCode: t.errorCode });
          } else if (typeof t.mid === "string" && !t.errorCode) close.push(t.mid);
        }
        // Kept MIDs take their receiver slots before any await, so a change during cleanup still closes them.
        if (live) {
          p.voice.mids = p.voice.mids || {};
          for (const t of kept) if (!t.errorCode && typeof t.mid === "string") p.voice.mids[t.mid] = t.id;
          p.ws.serializeAttachment(this.attachment(p));
        }
        if (close.length) await this.queueClose(receivingSession, close);
        if (!live) return json({ error: "voice membership changed" }, 409);
        return json({
          tracks: kept,
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
    this.send(p.ws, { t: "studio-state", state: { ...this.studio, duration: (studioSource(this.studio.source) || {}).duration || 0, cleanupPending: !!(this.cleanupJobs && this.cleanupJobs.length), seats, allowedHost: studioHostAllowed(this.env, p.id), canSpeak: studioCanSpeak(this.studio, p) } });
  }

  persistStudio() {
    if (this.ctx && this.ctx.storage) this.ctx.waitUntil(this.ctx.storage.put("studio", this.studio));
    // Only the Studio needs it; entering the zone sends the current state.
    for (const p of this.players.values()) if (p.zone === STUDIO_ZONE) this.sendStudio(p);
  }

  suspendStudio() {
    this.studio.position = studioPosition(this.studio, Date.now());
    this.studio.at = Date.now(); this.studio.playing = false; this.studio.playbackRevision = (this.studio.playbackRevision || 0) + 1;
    this.studio.hostId = 0; this.studio.mode = "suspended";
    this.studio.hands = []; this.studio.invited = [];
    this.studio.epoch++; this.studio.revision++;
    this.persistStudio();
    this.enforceStudio();
  }

  leaveStudio(p) {
    if (!this.studio || (!Number.isInteger(p.studioSeat) && !p.studioRevoked && this.studio.hostId !== p.id && !(this.studio.hands || []).includes(p.id) && !(this.studio.invited || []).includes(p.id))) return;
    delete p.studioSeat; p.studioRevoked = false; this.removeStudioSpeaker(p.id);
    if (this.studio.hostId === p.id) this.suspendStudio();
    else { this.studio.revision++; this.persistStudio(); this.enforceStudio(); }
  }

  removeStudioSpeaker(id) {
    this.studio.hands = (this.studio.hands || []).filter(value => value !== id);
    this.studio.invited = (this.studio.invited || []).filter(value => value !== id);
  }

  // The command's token is taken before its account read, so commands past the limit cost no D1 read.
  studioMessage(p, msg) {
    if (!p.studioBucket) p.studioBucket = { tokens: 8, at: Date.now() };
    if (!takeToken(p.studioBucket, 8, Date.now())) return this.studioCommand(p, msg, "Please wait before another Studio command");
    this.background(this.checkAccount(p).then(active => { if (active && this.players.get(p.id) === p) this.studioCommand(p, msg); }));
  }

  studioCommand(p, msg, refused = "") {
    if (!this.studio) this.studio = studioState();
    const s = this.studio;
    const reply = error => {
      // The id only names the command in its result: nothing resends a command, so none is replayed.
      this.send(p.ws, { t: "studio-result", action: msg.action, commandId: msg.commandId, ok: !error, error, revision: s.revision });
      this.sendStudio(p);
    };
    if (refused) return reply(refused);
    if (p.zone !== STUDIO_ZONE) return reply("Enter the Studio first");
    // Only transport acts on what the program was doing, so only it checks a view, and against the playback's own
    // revision: seats, stands and hands never refuse it, and seat and hand commands keep their own checks.
    const transport = STUDIO_TRANSPORT.includes(msg.action);
    if (transport && msg.playback !== undefined && msg.playback !== (s.playbackRevision || 0)) return reply("The program changed; try again");
    const host = p.id === s.hostId;
    if (host && !studioHostAllowed(this.env, p.id)) { this.suspendStudio(); return reply("Studio hosting is disabled for this account"); }
    if (msg.action === "seat") {
      if (!studioSeatAllowed(p, msg.seat, this.players.values())) return reply("Seat unavailable or too far away");
      p.studioSeat = msg.seat;
    } else if (msg.action === "stand") { delete p.studioSeat; this.removeStudioSpeaker(p.id); }
    else if (msg.action === "raise") {
      if (s.mode !== "qa" || !p.body || !Number.isInteger(p.studioSeat) || p.studioRevoked || (s.restrictedIds || []).includes(p.id) || host) return reply("Only an unrestricted seated attendee may raise a hand during Q&A");
      if (!(s.invited || []).includes(p.id)) s.hands = [...new Set((s.hands || []).concat(p.id))];
    } else if (msg.action === "lower") this.removeStudioSpeaker(p.id);
    else if (msg.action === "claim") {
      if (!studioHostAllowed(this.env, p.id) || (s.hostId && !host)) return reply("An approved host must claim an available session");
      if (host) return reply(); // already the host: a repeated claim (a double click) changes nothing
      s.hostId = p.id; s.mode = "discussion"; s.epoch++; s.restrictedIds = []; s.hands = []; s.invited = []; p.studioRevoked = false;
    } else {
      if (!host) return reply("Only the Studio host may do that");
      s.position = studioPosition(s, Date.now()); s.at = Date.now();
      if (msg.action === "release") { this.suspendStudio(); return reply(); }
      if (msg.action === "mode") { s.mode = msg.mode; s.hands = []; s.invited = []; }
      if (msg.action === "play") { const source = studioSource(s.source); if (!source) return reply("Select a reviewed Studio video first"); s.playing = true; if (s.position >= source.duration) s.position = 0; }
      if (msg.action === "pause") s.playing = false;
      if (msg.action === "seek") { const source = studioSource(s.source); if (!source || msg.position > source.duration) return reply("Position exceeds the selected video"); s.position = msg.position; }
      if (msg.action === "volume") s.volume = msg.volume;
      if (msg.action === "source") { if (!studioSource(msg.source)) return reply("Choose a reviewed Studio video"); s.source = msg.source; s.position = 0; s.playing = false; }
      if (transport) s.playbackRevision = (s.playbackRevision || 0) + 1;
      if (msg.action === "transfer") {
        const q = this.players.get(msg.id);
        if (!q || q.zone !== STUDIO_ZONE || !studioHostAllowed(this.env, q.id) || q.studioRevoked || (s.restrictedIds || []).includes(q.id)) return reply("Choose an unrestricted approved host inside the Studio; restore speaking first if needed");
        this.background(this.clearVoiceKind(p, "pub")); this.background(this.clearVoiceKind(q, "pub"));
        this.send(p.ws, { t: "studio-mic-revoked" }); this.send(q.ws, { t: "studio-mic-revoked" });
        s.hostId = q.id; q.studioRevoked = false; s.epoch++; s.playing = false; s.playbackRevision = (s.playbackRevision || 0) + 1; s.hands = []; s.invited = [];
      }
      if (msg.action === "invite") {
        const q = this.players.get(msg.id);
        if (s.mode !== "qa" || !q || q === p || q.zone !== STUDIO_ZONE || !q.body || !Number.isInteger(q.studioSeat) || q.studioRevoked || (s.restrictedIds || []).includes(q.id) || !(s.hands || []).includes(q.id)) return reply("Invite an unrestricted seated attendee from the Q&A queue");
        s.hands = s.hands.filter(id => id !== q.id); s.invited = [...new Set((s.invited || []).concat(q.id))];
      }
      if (msg.action === "restore") {
        const q = this.players.get(msg.id);
        if (!q || q === p || q.zone !== STUDIO_ZONE) return reply("Choose an attendee inside the Studio");
        s.restrictedIds = (s.restrictedIds || []).filter(id => id !== q.id); q.studioRevoked = false; q.ws.serializeAttachment(this.attachment(q));
      }
      if (msg.action === "revoke") {
        const q = this.players.get(msg.id);
        if (!q || q === p || q.zone !== STUDIO_ZONE) return reply("Choose an attendee inside the Studio");
        if ((s.restrictedIds || []).length >= 64 && !s.restrictedIds.includes(q.id)) return reply("Session moderation limit reached; release and reclaim to start a new session");
        s.restrictedIds = [...new Set((s.restrictedIds || []).concat(q.id))];
        this.removeStudioSpeaker(q.id); q.studioRevoked = true; q.ws.serializeAttachment(this.attachment(q));
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
    if (existing) { existing.at = Date.now(); existing.revision = (existing.revision || 0) + 1; existing.mids = [...new Set(existing.mids.concat(mids))]; existing.midVersions = existing.midVersions || {}; for (const mid of mids) existing.midVersions[mid] = existing.revision; existing.inspect = existing.inspect || inspect; if (inspect) existing.inspectUntil = Date.now() + 20000; }
    else this.cleanupJobs.push({ session, at: Date.now(), revision: 0, mids: [...new Set(mids)], midVersions: Object.fromEntries(mids.map(mid => [mid, 0])), inspect, inspectUntil: inspect ? Date.now() + 20000 : 0 });
    if (this.ctx && this.ctx.storage) await this.ctx.storage.put("voiceCleanup", this.cleanupJobs);
    for (const p of this.players.values()) if (p.zone === STUDIO_ZONE) this.sendStudio(p);
    await this.retryCleanup();
  }

  async retryCleanup() {
    if (!this.sfu || !this.cleanupJobs || !this.cleanupJobs.length) return;
    if (this.cleanupRunning) return this.cleanupRunning;
    this.cleanupRunning = (async () => {
      for (const job of [...this.cleanupJobs]) {
        // A job the SFU has refused for CLEANUP_MS is given up, so a room nobody is in stops waking for it.
        if (Date.now() - (job.at ??= Date.now()) > CLEANUP_MS) { this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1); continue; }
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
      // Remaining jobs retry at the next wake: at most a sweep interval away, and sooner if another wake comes first.
      if (!this.cleanupJobs.length) this.cleanupAt = 0;
      else if (!this.cleanupAt || this.cleanupAt <= Date.now()) this.cleanupAt = Date.now() + SWEEP_MS;
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
      if (!row || row.banned_at) { if (this.players.get(p.id) === p) this.evict(p, "revoked"); return false; }
      return true;
    } catch { return false; }
  }

  async ensureSweep() {
    if (!this.sweepAt) {
      this.sweepAt = Date.now() + SWEEP_MS;
      await this.ctx.storage.put("sweepAt", this.sweepAt);
    }
    await this.scheduleAlarm();
  }

  nextDoorExpiry() {
    let at = this.doorActive ? this.doorActive.exp : Infinity;
    for (const pass of this.doorPasses.values()) at = Math.min(at, pass.exp);
    return at;
  }

  // The earliest wake the room needs: the next sweep and door expiry while anyone is here, and the next
  // retry of pending media cleanup, which still runs after the last player left, but only with an SFU to run
  // it and for at most CLEANUP_MS. null: nothing to wake for.
  nextAlarm(now = Date.now()) {
    const here = this.players.size > 0;
    const cleanup = this.sfu && this.cleanupJobs && this.cleanupJobs.length ? (this.cleanupAt || now + SWEEP_MS) : Infinity;
    const next = Math.min(here ? this.sweepAt || now + SWEEP_MS : Infinity, here ? this.nextDoorExpiry() : Infinity, cleanup);
    return Number.isFinite(next) ? next : null;
  }

  async scheduleAlarm() {
    const next = this.nextAlarm();
    if (next === null) return;
    const set = await this.ctx.storage.getAlarm();
    if (set === null || set > next) await this.ctx.storage.setAlarm(next);
  }

  expireDoors(now) {
    if (this.doorActive && this.doorActive.exp <= now) this.finishDoor(now);
    for (const [cycle, pass] of [...this.doorPasses]) if (pass.exp <= now) {
      this.doorPasses.delete(cycle);
      const p = this.players.get(pass.id);
      if (p) {
        p.passes = p.passes.filter((x) => x.cycle !== cycle);
        p.ws.serializeAttachment(this.attachment(p));
      }
      this.broadcastZone(pass.door, { t: "transit-end", cycle });
    }
  }

  // Sockets silent past STALE_MS, auto-answered pings included, are evicted as stale.
  async alarm() {
    const now = Date.now();
    // Cleanup retries run on every wake, not only at sweep time.
    await this.retryCleanup();
    const sweepDue = !this.sweepAt || now >= this.sweepAt;
    this.expireDoors(now);
    // A cancelled lease can leave its earlier alarm in place. Before the recorded sweep deadline that wake only
    // expires door state and reschedules; it must not turn account reads and stale checks into a high-frequency poll.
    if (sweepDue) {
      for (const p of [...this.players.values()]) {
        if (!ownedBody(CAST, p.login, p.contributor)) { this.evict(p, "revoked"); continue; }
        // The existing operator D1 ban also ends active presence at the next successful sweep.
        // Retry on a later alarm if D1 is unavailable; never infer a ban from a failed read.
        if (this.env.DB) {
          let player;
          try { player = await getPlayer(this.env.DB, p.id); } catch { /* Retry the account check next sweep; stale eviction still applies. */ }
          if (this.players.get(p.id) !== p) continue;
          if (player !== undefined && (!player || player.banned_at)) { this.evict(p, "revoked"); continue; }
        }
        const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
        const last = Math.max(p.seenAt, pinged ? pinged.getTime() : 0);
        if (now - last > STALE_MS) this.evict(p, "stale");
      }
      this.sweepAt = now + SWEEP_MS;
      await this.ctx.storage.put("sweepAt", this.sweepAt);
    }
    const next = this.nextAlarm();
    if (next !== null) await this.ctx.storage.setAlarm(next);
  }
}
