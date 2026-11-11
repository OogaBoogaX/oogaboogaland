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
// Private conversations (#188): who invited whom, who talks to whom and whom each blocked live in the attachments
// (`pm`), so a woken room keeps them, and each account's blocks and rate limits outlive its reconnects while the room is
// awake (`pmAccounts`); the frames pass straight through and are never kept.
// Thumps: a voice participant's reaction, relayed to its voice place alone (`thumpPeers`, with `thumpAudible` marking the
// copies whose recipient would hear it) within a per-account bucket; nothing is kept, timed or answered, and the
// attachment is untouched.

import { observeRoomRescue } from "./room-rescue.js";
import { DurableObject } from "cloudflare:workers";
import {
  CABINETS, hockey, CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, CLEANUP_MS, TICK_HZ,
  NPC_FRAME_MAX, NPC_HZ, OUTSIDE, HP_HZ, VOICE_TRACK, CHAT_HZ, CHAT_BURST, CHAT_BUCKET_KEEP, CHAT_RETRY_KEEP, CHAT_FEATURE,
  DOOR_ZONE, DOOR_ROOM, DOOR_GRANT_MS, DOOR_TRANSIT_MS, DOOR_PASS_MS, DOOR_HZ, DOOR_BURST, GHOST_HZ, GHOST_BURST, SHOT_HZ, SHOT_BURST, SWING_HZ, SWING_BURST, THUMP_HZ, THUMP_BURST,
  GHOST_MAGIC, GHOST_FRAME_MAX, GHOST_FRAME_HZ, GHOST_FRAME_BURST, inGhostArena, ghostCandidate, watchesGhost,
  CHALK, CHALK_HZ, CHALK_BURST, CHALK_IDLE_MS, CHALK_SAVE_MS, CHALK_TELL_MS, CHALK_FEATURE,
  WALLET_CAP, WALLET_HZ, WALLET_BURST,
  PM_FEATURE, PM_HZ, PM_BURST, PM_INVITE_HZ, PM_INVITE_BURST, PM_CONTROL_HZ, PM_CONTROL_BURST, PM_INVITES, PM_BLOCKS, PM_ACCOUNT_KEEP,
  chatLog, castIndex, bodyName, ownedBody, electHost, npcFollowers, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken, voicePeers, thumpPeers, thumpAudible, thumpBucketFor,
  BLEND, BLEND_HZ,
} from "./protocol.js";
import { sha256Hex } from "./crypto.js";
import { getPlayer } from "./db.js";
import { deliverHighscores } from "./highscore-store.js";
import { sfuClient } from "./sfu.js";
import { STUDIO_TRANSPORT, STUDIO_ZONE, studioState, studioHostAllowed, studioCanSpeak, studioPosition, studioSeatAllowed, studioSource } from "./studio-policy.js";
import CAST_ROWS from "./characters.gen.json";
import { RoomNpcAuthority, validateNpcAuthority, npcAuthorityView, npcProtocolSupports, packNpcSnapshot, npcNextPublicationAt, npcCadenceName } from "./room-npc-authority.js";
import { RoomBodyHandoff, ROOM_BODY } from "./room-body-handoff.js";
import { RoomBodyPresence, ROOM_BODY_PRESENCE } from "./room-body-presence.js";
import { ROOM_BODY_RELEASE, validateBodyRelease, validBodyQuiescence } from "./room-body-release.js";
import { HUB_WORLD_OBJECT, createRoomWorldNotifier } from "./room-world-events.js";

const CAST = castIndex(CAST_ROWS);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    this.highscoreRevisions = new Map();
    this.studio = studioState();
    this.cleanupJobs = [];
    // The EntropyLab chalkboard (chalk-board.js), who holds it ({ id, session, at }) and when it last went to storage.
    this.chalk = CHALK.board();
    this.chalkEditor = null;
    this.chalkTimer = 0;
    this.chalkDirty = false;
    this.chalkStored = false;
    this.spawnSlot = 0;
    this.dirty = false;
    this.flushTimer = 0;
    this.sfu = sfuClient(env);
    this.hostId = 0;
    this.followers = 0;
    this.lastNpc = null;
    this.npcAuthority = null;
    this.bodyHandoff = null;
    this.bodyHandoffRequired = false;
    this.bodyPresenceRequired = false;
    this.bodyPresenceCache = null;
    this.worldNotifier = null;
    // The arcade's ghost arena: its own hunt's host, how many follow it, and its last state frame.
    this.ghostHostId = 0;
    this.ghostFollowers = 0;
    this.lastGhost = null;
    this.chat = chatLog();
    this.chatId = 0;
    this.chatAccepted = new Map();
    this.chatBuckets = new Map();
    this.pmAccounts = new Map();
    this.thumpBuckets = new Map();
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
      const recoveredBodies = [];
      // A saved server assignment stays fenced even if preview configuration is
      // removed. Older builds need an explicit release before rollback.
      const authority = await ctx.storage.get("npc-authority-v1");
      if (authority !== undefined) this.applyNpcAuthority(validateNpcAuthority(authority));
      if (authority?.mode === "browser") {
        const released = await ctx.storage.get("room-body-release-v1");
        if (released !== undefined) this.applyBodyRelease(validateBodyRelease(released));
      }
      // Presence storage survives a preview rollback too. Require compatible
      // presentation clients until an explicit migration/drain removes it.
      if (await ctx.storage.get("room-body-presence-v1") !== undefined) this.bodyPresenceRequired = true;
      if ([...this.players.values()].some(p => p.bodyHandoff)) this.bodyHandoffRequired = true;
      // No body preview activation on wake. Retained records fence rollback;
      // missing sockets use the last durable observation, never restart time.
      if (authority?.mode === "server" || env.VIRTUAL_HOST_BODY_PREVIEW === "1"
        || [...this.players.values()].some(p => p.bodyHandoff)) {
        const ids = await ctx.storage.get("room-body-handoff-v1");
        if (ids !== undefined) {
          this.bodyHandoffRequired = true; // empty retained index still fences rollback
          const outbox = this.bodyHandoffController();
          for (const r of await outbox.records()) {
            const p = this.players.get(r.accountId);
            if (p?.connectionToken === r.connection) {
              p.bodyHandoff = true;
              if (r.phase === "closed") {
                p.bodyClosedAt = r.closedAt;
                p.ws.serializeAttachment(this.attachment(p));
              } else if (Number.isSafeInteger(p.bodyClosedAt)) await outbox.close({ accountId: r.accountId, connection: r.connection }, p.bodyClosedAt);
              recoveredBodies.push({ accountId: r.accountId, connection: r.connection });
            } else if (r.phase !== "closed") {
              const identity = { accountId: r.accountId, connection: r.connection }, movement = await outbox.movement(identity);
              await outbox.close(identity, Math.max(r.at, movement?.receivedAt ?? 0));
            }
          }
        }
      }
      await hockey.loadLimits(this);
      hockey.restore(this);
      this.studio = (await ctx.storage.get("studio")) || this.studio;
      if (!studioSource(this.studio.source)) { this.studio.source = studioState().source; this.studio.position = 0; this.studio.playing = false; this.studio.at = Date.now(); this.studio.revision++; this.studio.playbackRevision = (this.studio.playbackRevision || 0) + 1; await ctx.storage.put("studio", this.studio); }
      this.studio.position = studioPosition(this.studio, this.studio.at);
      const seated = id => { const p = this.players.get(id); return !!p && p.zone === STUDIO_ZONE && !!p.body && Number.isInteger(p.studioSeat) && !p.studioRevoked && !(this.studio.restrictedIds || []).includes(id); };
      this.studio.hands = [...new Set((Array.isArray(this.studio.hands) ? this.studio.hands : []).filter(seated))].slice(0, MAX_PLAYERS);
      this.studio.invited = this.studio.mode === "qa" ? [...new Set((Array.isArray(this.studio.invited) ? this.studio.invited : []).filter(seated))].slice(0, MAX_PLAYERS) : [];
      this.cleanupJobs = (await ctx.storage.get("voiceCleanup")) || [];
      const chalk = await ctx.storage.get("chalk"), marks = chalk && CHALK.restore(chalk.marks);
      if (marks) this.chalk = CHALK.board(marks);
      this.chalkStored = chalk !== undefined;
      // Older versions stored the original drawing too; it can always be rebuilt locally.
      if (this.chalkStored && CHALK.preset(this.chalk) === "original") {
        await ctx.storage.delete("chalk");
        this.chalkStored = false;
      }
      const stored = await ctx.storage.get(["loopEpoch", "sweepAt"]);
      this.loopEpoch = stored.get("loopEpoch") || Date.now();
      this.sweepAt = stored.get("sweepAt") || Date.now() + SWEEP_MS;
      await ctx.storage.put("loopEpoch", this.loopEpoch);
      await ctx.storage.put("sweepAt", this.sweepAt);
      if (this.studio.hostId && (!this.players.has(this.studio.hostId) || this.players.get(this.studio.hostId).zone !== STUDIO_ZONE || !studioHostAllowed(env, this.studio.hostId))) this.suspendStudio();
      // Stored cleanup retries from an alarm due now, never inside this block: several bounded SFU calls can accumulate, and a
      // block past 30 s resets the island's only room, presence and voice with it.
      if (this.sfu && this.cleanupJobs.length) {
        this.cleanupAt = Date.now();
        const set = await ctx.storage.getAlarm();
        if (set === null || set > this.cleanupAt) await ctx.storage.setAlarm(this.cleanupAt);
      }
      for (const identity of recoveredBodies) await this.syncCommittedBodyParticipant(identity);
      this.notifyWorld();
    });
    // A woken room rebuilds its roster from the attachments its sockets carry.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a) this.players.set(a.id, this.record(ws, a));
    }
    // Old guest sockets can survive a deployment in hibernated attachments.
    // Use the ordinary departure path so peers drop their presence and voice.
    for (const p of this.players.values()) if (!ownedBody(CAST, p.login, p.contributor, p.id)) this.evict(p, "revoked");
    // A conversation stands only while both ends are here and hold each other; an invite only to someone here.
    for (const p of this.players.values()) {
      const pm = p.pm && typeof p.pm === "object" ? p.pm : {};
      const here = (id) => Number.isSafeInteger(id) && id !== p.id && this.players.has(id);
      p.pm = { inv: Array.isArray(pm.inv) ? pm.inv.filter(here).slice(-PM_INVITES) : [], open: here(pm.open) ? pm.open : 0,
        blocked: Array.isArray(pm.blocked) ? pm.blocked.filter((id) => Number.isSafeInteger(id)).slice(-PM_BLOCKS) : [] };
    }
    for (const p of this.players.values()) if (p.pm.open && this.players.get(p.pm.open).pm.open !== p.id) p.pm.open = 0;
    this.restoreDoor();
    this.hostId = electHost(this.players.values());
    this.followers = npcFollowers(this.players.values(), this.hostId);
    this.ghostHostId = electHost(this.players.values(), 0, ghostCandidate);
    this.ghostFollowers = npcFollowers(this.players.values(), this.ghostHostId, watchesGhost);
  }

  record(ws, a) {
    return { ws, voice: { pub: null, sub: null, track: null, gen: 0, mids: {}, pubMid: null }, muted: false, hp: 100, ko: false, g: null, j: 0, w: 0, v: null, va: 0, sent: null, zone: OUTSIDE, pokerVoice: null, inHub: false, visible: true, joinedAt: Date.now(), door: null, passes: [], blendTo: null, blendK: 0, pm: { inv: [], open: 0, blocked: [] }, ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, npcBucket: { tokens: NPC_HZ, at: Date.now() }, hpBucket: { tokens: HP_HZ, at: Date.now() }, blendBucket: { tokens: BLEND_HZ, at: Date.now() }, doorBucket: { tokens: DOOR_BURST, at: Date.now() }, ghostBucket: { tokens: GHOST_BURST, at: Date.now() }, ghostFrameBucket: { tokens: GHOST_FRAME_BURST, at: Date.now() }, chatBucket: this.chatBucketFor(a.id, Date.now()), seenAt: Date.now() };
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
    return { ...(p.oogaMotionProtocol === 1 ? { oogaMotionProtocol: 1 } : {}), ...(p.bodyPresentedRequest ? { bodyPresentedRequest: p.bodyPresentedRequest } : {}), ...(p.bodyMotionProtocol === 1 ? { bodyMotionProtocol: 1 } : {}), ...(p.bodyQuiescence ? { bodyQuiescence: p.bodyQuiescence } : {}), ...(p.bodyMigrationProtocol === 1 ? { bodyMigrationProtocol: 1, bodyReleasedRevision: p.bodyReleasedRevision || 0 } : {}), ...(p.bodyPresenceProtocol === 1 ? { bodyPresenceProtocol: 1, bodyPresenceSent: p.bodyPresenceSent || null, bodyPresenceAck: p.bodyPresenceAck || null } : {}), ...(p.bodyProtocol === 2 || p.bodyHandoff ? { bodyProtocol: p.bodyProtocol, bodyHandoff: !!p.bodyHandoff, bodyClosedAt: p.bodyClosedAt ?? null } : {}), npcProtocol: p.npcProtocol || 0, npcSent: p.npcSent || null, npcAck: p.npcAck || null, cabinet: p.cabinet || null, cabinetBucket: p.cabinetBucket || null, hockey: p.hockey || null, hockeyBuckets: p.hockeyBuckets || null, id: p.id, login: p.login, display: p.display, contributor: p.contributor, body: p.body, connectionToken: p.connectionToken, studioSeat: p.studioSeat, studioRevoked: !!p.studioRevoked, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, j: p.j, w: p.w, v: p.v, va: p.va, r: p.r, voice: p.voice, muted: p.muted, hp: p.hp, ko: p.ko, sent: p.sent, zone: p.zone, pokerVoice: p.pokerVoice, inHub: p.inHub, visible: p.visible, joinedAt: p.joinedAt, door: p.door, passes: p.passes, blendTo: p.blendTo, blendK: p.blendK, pm: p.pm };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, zone: p.zone, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, j: p.j, w: p.w, v: p.v, va: p.va, r: p.r, voice: !!p.voice.track, muted: p.muted, hp: p.hp, ko: p.ko, blendTo: p.blendTo, blendK: p.blendK };
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

  // Binding-only notification. No new timers, sockets or storage writes in the room.
  async refreshHighscores(game = null) {
    if (!this.env.DB || !this.players.size) return;
    await deliverHighscores(this.env.DB, board => {
      if (!this.players.size) return false;
      if (board.revision > (this.highscoreRevisions.get(board.game) ?? -1)) {
        this.broadcast({ t: "highscore", board });
        this.highscoreRevisions.set(board.game, board.revision);
      }
      return true;
    }, game);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/voice/")) return this.voiceRequest(path.slice("/voice/".length), request);
    if (request.headers.get("upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const who = playerFromHeaders(request.headers);
    if (!who || !ownedBody(CAST, who.login, who.contributor, who.id)) return new Response("Contributors with an Ooga only", { status: 403 });

    const requestedProtocol = new URL(request.url).searchParams.get("npc-authority");
    const npcProtocol = requestedProtocol === "4" ? 4 : requestedProtocol === "3" ? 3 : requestedProtocol === "2" ? 2 : requestedProtocol === "1" ? 1 : 0;
    const bodyMotionProtocol = new URL(request.url).searchParams.get("body-motion") === "1" ? 1 : 0;
    const oogaMotionProtocol = new URL(request.url).searchParams.get("ooga-motion") === "1" ? 1 : 0;
    const bodyProtocol = new URL(request.url).searchParams.get("body-reclaim") === "2" ? 2 : 0;
    const bodyPresenceProtocol = new URL(request.url).searchParams.get("body-presence") === "1" ? 1 : 0;
    const bodyMigrationProtocol = new URL(request.url).searchParams.get("body-migration") === "1" ? 1 : 0;
    if (this.bodyPresenceRequired && (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || bodyPresenceProtocol !== 1))
      return new Response("Body presence requires explicit compatible recovery", { status: 409 });
    if (this.bodyHandoffRequired && (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || bodyProtocol !== 2))
      return new Response("Body handoff requires explicit compatible recovery", { status: 409 });
    if (this.npcAuthority?.mode === "server" && (!npcProtocolSupports(npcProtocol, this.npcAuthority) || !this.players.has(who.id) && this.players.size >= 32)) {
      return new Response("NPC authority requires a compatible client and an available preview slot", { status: 409 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);

    const older = this.players.get(who.id);
    if (older) {
      const closing = this.evict(older, "replaced");
      if (closing) await closing;
    }
    if (this.players.size >= MAX_PLAYERS) {
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const spawn = spawnPoint(this.spawnSlot++);
    const p = this.record(server, { ...who, npcProtocol, bodyProtocol, bodyPresenceProtocol, bodyMigrationProtocol, bodyMotionProtocol, oogaMotionProtocol, ...(this.bodyHandoffRequired ? { bodyHandoff: true } : {}), connectionToken: crypto.randomUUID(), body: null, x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw });
    const kept = this.pmAccounts.get(p.id);
    if (kept) p.pm.blocked = kept.blocked.slice();
    server.serializeAttachment(this.attachment(p));
    // An owner arriving takes either body back from whoever holds it.
    const own = ownedBody(CAST, p.login, p.contributor, p.id);
    if (own) for (const o of this.players.values()) if (o.body && bodyName(o.body).toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);

    // Fence before welcome: ordered delivery prevents a frame of browser AI and
    // keeps feature negotiation independent of this optional preview.
    if (this.npcAuthority) this.send(server, { t: "npc-authority", authority: npcAuthorityView(this.npcAuthority) });

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, connectionToken: p.connectionToken, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch, host: this.hostId, followers: this.followers, ghostHost: this.ghostHostId, ghostFollowers: this.ghostFollowers, features: [CABINETS.FEATURE, "door", CHAT_FEATURE, PM_FEATURE, CHALK_FEATURE, "hockey-v4", ...(bodyPresenceProtocol === 1 ? ["host-body-presence-v1"] : []),
      ...(this.env.VIRTUAL_HOST_BODY_PREVIEW === "1" && this.env.VIRTUAL_HOST_MOVEMENT_PREVIEW === "1" && bodyProtocol === 2 && bodyMotionProtocol === 1
        ? ["host-body-reclaim-v2", "host-body-motion-v1", ...(oogaMotionProtocol === 1 ? ["host-ooga-motion-v1"] : [])] : [])] });
    // A message of its own after welcome, so a page that does not know chat ignores it; empty after the room slept.
    this.send(server, { t: "chat-history", messages: this.chat.list() });
    this.sendCabinets(server);
    this.send(server, { t: "chalk-board", marks: this.chalk.marks, editor: this.chalkEditor ? this.chalkEditor.id : 0 });
    this.broadcast({ t: "join", p: this.view(p) }, server);
    this.sendStudio(p);
    this.updateVoice();
    await this.ensureSweep();
    this.notifyWorld();
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
    if (!ownedBody(CAST, p.login, p.contributor, p.id)) { this.evict(p, "revoked"); return; }
    if (typeof message !== "string") {
      if (message instanceof ArrayBuffer && message.byteLength >= 4 && new DataView(message).getUint32(0, true) === GHOST_MAGIC) this.ghostFrame(p, message);
      else this.npcFrame(p, message);
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
    if (msg.t === "body-quiescent") {
      if (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1") return;
      return this.ctx.blockConcurrencyWhile(() => {
        const q = p.bodyQuiescence;
        if (this.players.get(p.id) !== p || p.bodyMigrationProtocol !== 1 || !p.bodyHandoff || p.bodyClosing
          || this.npcAuthority?.mode !== "server" || !validBodyQuiescence(q)
          || q.revision !== this.npcAuthority.revision || msg.revision !== q.revision || msg.request !== q.request)
          return { status: "refused" };
        if (!q.acknowledged) {
          const next = { ...q, acknowledged: true };
          p.ws.serializeAttachment(this.attachment({ ...p, bodyQuiescence: next }));
          p.bodyQuiescence = next;
        }
        return { status: "acknowledged" };
      });
    }
    if (msg.t === "body-motion-1" || msg.t === "body-motion-ooga-1") {
      if (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || this.env.VIRTUAL_HOST_MOVEMENT_PREVIEW !== "1"
        || p.bodyMotionProtocol !== 1 || msg.t === "body-motion-ooga-1" && p.oogaMotionProtocol !== 1
        || p.bodyProtocol !== 2 || !p.bodyHandoff || p.bodyClosing
        || !takeToken(p.bucket, MOVE_HZ, p.seenAt)) return;
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.players.get(p.id) !== p || p.bodyClosing || p.bodyClosedAt != null || p.bodyQuiescence
          || this.npcAuthority?.mode !== "server") return { status: "refused" };
        const ticket = { ...npcAuthorityView(this.npcAuthority), owner: this.npcAuthority.owner };
        this.checkBodyHandoff(ticket);
        const identity = { accountId: p.id, connection: p.connectionToken }, box = this.bodyHandoffController();
        const result = await box.receiveMovement(identity, msg);
        // Only a retained HOST receipt earns an ACK. A Room inbox write alone
        // never tells the browser its recovery position has been accepted.
        if (result.status === "accepted") {
          await this.syncCommittedBodyParticipant(identity);
          await box.deliverMovement(identity);
        }
        if (result.status === 'pending' || result.status === 'busy') this.notifyWorld();
        return result;
      });
    }
    if (["body-ready", "body-applied", "body-started", "body-decline"].includes(msg.t)) {
      if (!p.bodyHandoff || p.bodyClosing || p.bodyProtocol !== 2) return;
      return this.ctx.blockConcurrencyWhile(async () => {
        const result = await this.bodyHandoffController().receive({ accountId: p.id, connection: p.connectionToken }, msg);
        if (result.status === "closed") {
          p.bodyClosedAt = result.record.closedAt;
          p.ws.serializeAttachment(this.attachment(p));
          await this.syncCommittedBodyParticipant({ accountId: p.id, connection: p.connectionToken });
        }
        if (['dispatch', 'pending', 'closed', 'expired'].includes(result.status)) this.notifyWorld();
        return result;
      });
    }
    if (msg.t === "body-presence-ack") {
      if (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || p.bodyPresenceProtocol !== 1) return;
      return this.ctx.blockConcurrencyWhile(async () => {
        if (this.players.get(p.id) !== p || !this.npcAuthority || this.npcAuthority.mode !== "server") return;
        const sent = p.bodyPresenceSent;
        if (!sent || ["authority", "epoch", "revision"].some(k => msg[k] !== sent[k])) return;
        p.bodyPresenceAck = sent; p.bodyPresenceSent = null;
        p.ws.serializeAttachment(this.attachment(p));
        const ticket = { ...npcAuthorityView(this.npcAuthority), owner: this.npcAuthority.owner };
        const snapshot = await this.#readBodyPresence(ticket);
        if (snapshot) this.sendBodyPresence(p, ticket, snapshot);
      });
    }
    // Negotiated compact movement is the only staged-body ingress. Unsupported
    // actions cannot silently fall back to ordinary body/pose reports.
    if (p.bodyHandoff && ["body", "pose", "zone", "blend", "hp", "shot", "swing", "cabinet", "hockey", "wallet"].includes(msg.t)) return;
    if (msg.t === "npc-ack") {
      if (p.npcSent && msg.revision === p.npcSent.revision && msg.sequence === p.npcSent.sequence) {
        p.npcAck = p.npcSent; p.npcSent = null;
        p.ws.serializeAttachment(this.attachment(p));
        this.sendNpcSnapshot(p);
      }
      return;
    }
    if (msg.t === "cabinet") { this.cabinetMessage(p, msg); return; }
    // While playing, the room owns the floor pose and body, regardless of game-scene reports.
    if (p.cabinet && ["pose", "zone", "body", "blend", "hp", "shot", "swing", "hockey"].includes(msg.t)) return;
    if (msg.t === "hockey") { hockey.message(this, p, msg); ws.serializeAttachment(this.attachment(p)); return; }
    if (msg.t === "studio") {
      this.studioMessage(p, msg);
    } else if (msg.t === "pose") {
      if (!takeToken(p.bucket, MOVE_HZ, p.seenAt)) return;
      p.x = msg.x; p.y = msg.y; p.z = msg.z; p.yaw = msg.yaw;
      if (msg.g && p.body && p.body.startsWith("gorilla:")) p.g = msg.g;
      // Only an Ooga wears a jetpack or holds a weapon; a pose without one says it has none.
      const ooga = !!p.body && !p.body.startsWith("gorilla:");
      p.j = ooga && msg.j ? msg.j : 0;
      p.w = ooga && msg.w ? msg.w : 0;
      p.v = ooga && msg.v ? msg.v : null; p.va = p.v ? p.seenAt : 0;
      p.r = ooga ? msg.r : undefined;
      if (Number.isInteger(p.studioSeat) && !studioSeatAllowed(p, p.studioSeat, this.players.values())) { delete p.studioSeat; this.removeStudioSpeaker(p.id); this.studio.revision++; this.persistStudio(); this.enforceStudio(); }
      if (this.chalkEditor && this.chalkEditor.id === p.id && this.chalkRefusal(p)) this.chalkLetGo(p);
      this.dirty = true;
      this.scheduleFlush();
    } else if (msg.t === "hub") {
      if (msg.on === p.inHub) return;
      p.inHub = msg.on;
      this.electHost();
      // A page arriving on the island catches up with the NPCs at once rather than at the next frame.
      if (this.npcAuthority?.mode === "server") this.sendNpcSnapshot(p);
      else if (p.inHub && p.id !== this.hostId && this.lastNpc) this.send(p.ws, this.lastNpc);
      if (p.inHub && this.bodyPresenceRequired && p.bodyPresenceProtocol === 1 && this.env.VIRTUAL_HOST_BODY_PREVIEW === "1")
        return this.ctx.blockConcurrencyWhile(async () => {
          if (this.players.get(p.id) !== p || !p.inHub || this.npcAuthority?.mode !== "server") return;
          const ticket = { ...npcAuthorityView(this.npcAuthority), owner: this.npcAuthority.owner };
          const snapshot = await this.#readBodyPresence(ticket);
          if (snapshot) this.sendBodyPresence(p, ticket, snapshot);
        });
    } else if (msg.t === "visible") {
      // HALLOWEEN: a page hidden in the ghost arena hands its hosting on; shown again, it comes back a follower.
      if (msg.on === p.visible) return;
      p.visible = msg.on;
      this.electGhostHost();
    } else if (msg.t === "zone") {
      if (msg.name === p.zone) return;
      if (msg.name !== DOOR_ZONE) this.cancelDoor(p);
      if (msg.name !== p.zone) this.clearPasses(p);
      const leavingStudio = p.zone === STUDIO_ZONE, watched = watchesGhost(p), from = p.zone;
      if (msg.name !== "arcade.hall") hockey.leave(this, p.id);
      p.zone = msg.name;
      hockey.arrive(this, p);
      p.pokerVoice = null;
      if (this.chalkEditor && this.chalkEditor.id === p.id && this.chalkRefusal(p)) this.chalkLetGo(p);
      // A crossing belongs to the zone it started from (everyone resets theirs on this broadcast). A zone that is the
      // place being crossed into turns it round, so the same places stay heard: off a crossing's far end that is none,
      // and across the arcade hallway's midpoint (#422) the same crossing seen from its other end. Else the page reports
      // its next one after its zone.
      const across = p.blendTo && BLEND.place(p.zone) === BLEND.place(p.blendTo) && BLEND.STEPS - p.blendK > 0;
      p.blendTo = across ? BLEND.place(from) : null; p.blendK = across ? BLEND.STEPS - p.blendK : 0;
      this.electGhostHost();
      // A page walking into the ghost arena or its hallway catches up with its hunt (a lobby open, a hunt on) at once.
      if (watchesGhost(p) && !watched && p.id !== this.ghostHostId && this.lastGhost) this.send(p.ws, this.lastGhost);
      if (leavingStudio) this.leaveStudio(p);
      this.walletsArrive(p);
      if (p.zone === STUDIO_ZONE) { this.enforceStudio(); this.sendStudio(p); }
      this.broadcast({ t: "zone", id: p.id, name: p.zone });
      if (p.blendTo) this.broadcast({ t: "blend", id: p.id, to: p.blendTo, k: p.blendK }, p.ws);
      // A page that moved groups let go of every voice, so it always hears where it is now, changed list or not.
      p.sent = null;
      this.enforceStudio(); this.updateVoice();
      this.replayDoor(p);
    } else if (msg.t === "blend") {
      // Only toward a group adjacent to the player's own (#392); a step anywhere else is no crossing.
      const to = msg.to && BLEND.adjacent(p.zone, msg.to) ? msg.to : null, k = to ? msg.k : 0;
      if (to === p.blendTo && k === p.blendK) return;
      if (!takeToken(p.blendBucket, BLEND_HZ, p.seenAt)) return;
      // Who may hear whom changes only when a place is gained or lost: starting or ending a crossing, or reaching an end.
      const places = (t, step) => !t ? 0 : step >= BLEND.STEPS ? 1 : 2;
      const replan = to !== p.blendTo || places(to, k) !== places(p.blendTo, p.blendK);
      p.blendTo = to; p.blendK = k;
      this.broadcast({ t: "blend", id: p.id, to, k }, p.ws);
      if (replan) this.updateVoice();
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
    } else if (msg.t === "pm") {
      // Saves each attachment it changes itself.
      return this.privateMessage(p, msg);
    } else if (msg.t === "thump") {
      // Nothing in the attachment changes.
      return this.thump(p);
    } else if (msg.t === "door") {
      return this.doorMessage(p, msg);
    } else if (msg.t === "chalk") {
      return this.chalkMessage(p, msg);
    } else if (msg.t === "wallet") {
      // Nothing in the attachment changes: a room that sleeps forgets the wallets, which end within a minute anyway.
      return this.walletMessage(p, msg);
    } else if (msg.t === "ghost") {
      // HALLOWEEN: a follower in the ghost arena tells its hunt's host; nobody else hears it, nothing is kept.
      if (!inGhostArena(p) || !p.body || p.id === this.ghostHostId) return;
      if (!p.ghostBucket) p.ghostBucket = { tokens: GHOST_BURST, at: p.seenAt };
      if (!takeToken(p.ghostBucket, GHOST_HZ, p.seenAt, GHOST_BURST)) return;
      const host = this.players.get(this.ghostHostId);
      if (host && inGhostArena(host)) this.send(host.ws, { ...msg, from: p.id });
    } else if (msg.t === "shot" || msg.t === "swing") {
      // A driven Ooga's own shot or strike, for the players in its zone to draw; nothing is hit and nothing is kept.
      if (!p.body || p.body.startsWith("gorilla:")) return;
      const shot = msg.t === "shot", burst = shot ? SHOT_BURST : SWING_BURST;
      const bucket = shot ? p.shotBucket || (p.shotBucket = { tokens: burst, at: p.seenAt })
        : p.swingBucket || (p.swingBucket = { tokens: burst, at: p.seenAt });
      if (!takeToken(bucket, shot ? SHOT_HZ : SWING_HZ, p.seenAt, burst)) return;
      const out = JSON.stringify(shot ? { t: "shot", id: p.id, a: msg.a } : { t: "swing", id: p.id });
      // HALLOWEEN (#422): one fired in the ghost arena also reaches its hallway's spectators (`watchesGhost`), who see and
      // hear the hunt; one from the hallway stays there.
      const arena = inGhostArena(p);
      for (const other of this.players.values()) if (other !== p && (arena ? watchesGhost(other) : other.zone === p.zone)) this.send(other.ws, out);
      return;
    } else if (msg.t === "body") {
      if (msg.name === p.body) return;
      hockey.leave(this, p.id);
      const refusal = claimRefusal(CAST, p.login, msg.name, this.players.values(), p.contributor, p.id);
      if (refusal) {
        this.send(ws, { t: "release", name: msg.name, reason: refusal });
        if (p.body === null) return;
        p.body = null;
      } else {
        p.body = msg.name;
      }
      if (!p.body) { this.cancelDoor(p); this.clearPasses(p); }
      this.chalkLetGo(p);
      // Another body, or none: its normalized health is reported afresh.
      p.hp = 100;
      p.ko = false;
      p.g = null;
      p.j = p.w = 0; p.v = null; p.va = 0; p.r = undefined;
      if (!p.body) this.leaveStudio(p);
      this.broadcast({ t: "body", id: p.id, name: p.body });
      this.enforceStudio(); this.updateVoice();
    }
    ws.serializeAttachment(this.attachment(p));
  }

  // The prototype's note stands: on this compatibility date close handlers must not call ws.close().
  webSocketClose(ws) {
    const p = this.byWs(ws);
    if (p) return this.drop(p, "closed");
  }

  webSocketError(ws) {
    const p = this.byWs(ws);
    if (p) return this.drop(p, "error");
  }

  sendCabinets(ws = null) {
    const seats = [];
    for (const p of this.players.values()) if (p.cabinet) seats.push({ id: p.cabinet.id, player: p.id, name: p.display || p.login });
    const message = { t: "cabinets", seats };
    if (ws) this.send(ws, message); else this.broadcast(message);
  }

  releaseCabinet(p) {
    if (!p.cabinet) return;
    p.cabinet = null;
    p.ws.serializeAttachment(this.attachment(p));
    this.sendCabinets();
  }

  cabinetMessage(p, msg) {
    if (msg.op === "leave") {
      if (p.cabinet?.id === msg.id && p.cabinet.q === msg.q) this.releaseCabinet(p);
      return;
    }
    const reply = reason => this.send(p.ws, { t: "cabinet", id: msg.id, q: msg.q, ok: !reason, reason });
    p.cabinetBucket ||= { tokens: 3, at: Date.now() };
    if (!takeToken(p.cabinetBucket, 2, Date.now(), 3)) { reply("Please wait before trying again"); return; }
    if (!p.body || p.zone !== "arcade.hall" || p.ko) { reply("Stand in the arcade with your Ooga first"); return; }
    if (p.cabinet) { reply(p.cabinet.id === msg.id && p.cabinet.q === msg.q ? null : "You already have a cabinet open"); return; }
    for (const other of this.players.values()) if (other.cabinet?.id === msg.id) { reply("This cabinet is occupied"); return; }
    // No await between checking and assigning: concurrent requests have exactly one winner.
    const at = CABINETS.get(msg.id);
    p.cabinet = { id: msg.id, q: msg.q };
    p.x = at.x; p.y = at.y; p.z = at.z; p.yaw = at.yaw; p.g = null; p.j = p.w = 0; p.v = null; p.va = 0; p.r = undefined;
    p.blendTo = null; p.blendK = 0;
    p.ws.serializeAttachment(this.attachment(p));
    this.dirty = true;
    this.scheduleFlush();
    this.sendCabinets();
    reply(null);
  }

  drop(p, reason) {
    if (this.players.get(p.id) !== p) return;
    let closed;
    if (p.bodyHandoff) {
      p.bodyClosing = true; p.bodyClosedAt ??= Date.now();
      p.ws.serializeAttachment(this.attachment(p));
      closed = this.ctx.blockConcurrencyWhile(() => this.bodyHandoffController()
        .close({ accountId: p.id, connection: p.connectionToken }, p.bodyClosedAt));
    }
    this.releaseCabinet(p);
    hockey.leave(this, p.id);
    this.cancelDoor(p);
    this.clearPasses(p);
    this.leaveStudio(p);
    this.chalkLetGo(p);
    this.background(this.clearVoice(p));
    this.privateLeave(p);
    this.players.delete(p.id);
    this.broadcast({ t: "leave", id: p.id, reason });
    this.electHost();
    this.electGhostHost();
    this.updateVoice();
    if (!this.players.size && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = 0;
    }
    return closed?.then(result => { this.notifyWorld(); return result; });
  }

  release(p, reason) {
    this.releaseCabinet(p);
    hockey.leave(this, p.id);
    this.cancelDoor(p);
    this.clearPasses(p);
    this.send(p.ws, { t: "release", name: p.body, reason });
    p.body = null;
    p.g = null;
    p.j = p.w = 0; p.v = null; p.va = 0; p.r = undefined;
    this.leaveStudio(p);
    this.chalkLetGo(p);
    p.ws.serializeAttachment(this.attachment(p));
    this.broadcast({ t: "body", id: p.id, name: null });
    this.updateVoice();
  }

  // An explicit kick before the close: a server-initiated close alone can leave the client in CLOSING.
  evict(p, reason) {
    const closed = this.drop(p, reason);
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
    return closed;
  }

  bodyHandoffController() {
    if (!this.bodyHandoff) this.bodyHandoff = new RoomBodyHandoff({ storage: this.ctx.storage, clock: () => Date.now(),
      current: i => {
        const p = this.players.get(i.accountId);
        return !!p && p.bodyHandoff === true && !p.bodyClosing && p.bodyClosedAt == null && p.connectionToken === i.connection;
      }, send: (i, message) => {
        const p = this.players.get(i.accountId);
        if (!p || p.bodyClosing || p.bodyClosedAt != null || p.connectionToken !== i.connection) return false;
        try { p.ws.send(JSON.stringify(message)); return true; } catch { return false; }
      } });
    return this.bodyHandoff;
  }

  checkBodyHandoff(ticket) {
    const status = this.npcAuthorityStatus(ticket), now = Date.now();
    if (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || !status?.owns || now >= status.leaseUntil || now >= status.runUntil)
      throw Error("body handoff preview disabled or fenced");
  }

  // Explicit finite server hooks; no HTTP route, host loop or welcome feature
  // enables them. Claim/body data comes from the authenticated host runner only.
  // Server-only admission lookup. Account, connection and character mapping
  // come from the authenticated socket; this is not a client message type.
  notifyWorld() {
    // Off by default, with no deployed binding. The notification is never
    // awaited inside a Room concurrency block: its receiver calls back into
    // Room to read durable work and must not deadlock this object's input gate.
    if (this.env.VIRTUAL_HOST_RUNNER_PREVIEW !== '1' || this.env.VIRTUAL_HOST_PREVIEW !== '1'
      || this.env.VIRTUAL_HOST_BODY_PREVIEW !== '1' || this.env.VIRTUAL_HOST_MOVEMENT_PREVIEW !== '1'
      || typeof this.env.VIRTUAL_WORLD?.getByName !== 'function') return false;
    this.worldNotifier ||= createRoomWorldNotifier({
      clock: () => Date.now(),
      current: () => {
        const a = this.npcAuthority;
        return a?.mode === 'server' ? { v: 1, room: HUB_WORLD_OBJECT, world: a.world,
          epoch: a.epoch, revision: a.revision, owner: a.owner, runUntil: a.runUntil } : null;
      },
      send: hint => this.env.VIRTUAL_WORLD.getByName(HUB_WORLD_OBJECT).notifyRoomWorld(hint),
      hold: promise => this.background(promise),
    });
    return this.worldNotifier.notify();
  }

  bodyAdmissionCandidates(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      if (this.players.size > 32 || [...this.players.values()].some(p => p.bodyProtocol !== 2 || p.bodyPresenceProtocol !== 1
        || p.body !== null && !p.bodyHandoff)) throw Error('body admission incompatible occupants');
      const retained = new Set((await this.bodyHandoffController().records()).map(row => row.accountId));
      const candidates = [...this.players.values()].filter(p => !retained.has(p.id) && p.body === null && !p.bodyClosing
        && p.bodyClosedAt == null && !p.bodyQuiescence && p.bodyMotionProtocol === 1 && p.oogaMotionProtocol === 1)
        .sort((a, b) => a.id - b.id);
      return { identities: candidates.slice(0, 4).map(p => ({ accountId: p.id, connection: p.connectionToken })), more: candidates.length > 4 };
    });
  }

  bodyCandidate(ticket, identity, kind = 'ooga') {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const p = this.players.get(identity?.accountId);
      if (!p || p.connectionToken !== identity.connection || p.bodyProtocol !== 2 || p.bodyClosing || p.bodyQuiescence
        || !['ooga', 'clanker'].includes(kind)) throw Error('body candidate connection mismatch');
      const row = await this.bodyHandoffController().read(identity);
      if (row) return { status: row.phase === 'closed' ? 'blocked' : 'retained', kind: row.kind, request: row.request };
      if (p.body !== null || p.bodyMotionProtocol !== 1 || kind === 'ooga' && p.oogaMotionProtocol !== 1
        || this.players.size > 32 || [...this.players.values()].some(o => o.bodyProtocol !== 2 || o.body !== null && !o.bodyHandoff))
        throw Error('body candidate incompatible occupants');
      const handle = ownedBody(CAST, p.login, p.contributor, p.id);
      if (!handle) throw Error('body candidate character unavailable');
      return { status: 'available', candidate: { accountId: p.id, bodyId: `player:${p.id}`, handle, kind } };
    });
  }

  stageBodyHandoff(ticket, identity, preparation, kind, request, claim) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const p = this.players.get(identity?.accountId);
      if (!p || p.connectionToken !== identity.connection || p.bodyProtocol !== 2 || p.bodyClosing || p.bodyQuiescence || p.body !== null
        || preparation?.epoch !== ticket.epoch || preparation.world !== ticket.world
        || preparation.bodyId !== `player:${p.id}` || claim?.accountId !== p.id || claim.bodyId !== preparation.bodyId)
        throw Error("body handoff connection mismatch");
      if (claim?.source && (claim.source.handle !== ownedBody(CAST, p.login, p.contributor, p.id)
        || claim.source.kind !== kind || p.bodyMotionProtocol !== 1 || kind === 'ooga' && p.oogaMotionProtocol !== 1))
        throw Error('body source identity or capability mismatch');
      if (this.players.size > 32 || [...this.players.values()].some(o => o.bodyProtocol !== 2 || o.body !== null && !o.bodyHandoff))
        throw Error("body handoff incompatible occupants");
      const outbox = this.bodyHandoffController();
      if (p.bodyClosedAt != null) {
        // Only explicit server staging after durable cleanup may retry on the
        // same voice connection. A retained close/uncertain operation blocks it.
        // Absence also reconciles a crash after row retirement but before the
        // attachment could be updated. Browser messages cannot clear this gate.
        if (await outbox.read(identity)) throw Error("body handoff connection cleanup pending");
        p.bodyClosedAt = null;
      }
      this.bodyHandoffRequired = true;
      for (const o of this.players.values()) { o.bodyHandoff = true; o.ws.serializeAttachment(this.attachment(o)); }
      const row = await outbox.prepare(identity, preparation, kind, request, claim);
      await outbox.deliver(identity); return row;
    });
  }

  async pendingBodyHandoff(ticket, identity) {
    this.checkBodyHandoff(ticket);
    return this.bodyHandoffController().pending(identity);
  }

  // Server-only census, never a browser-provided token list. Closed or uncertain
  // outbox work must settle before absence may imply a disconnect. An RPC caller
  // must also fence the host revision it read BEFORE requesting this census.
  bodyCensus(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const tokens = [], closed = [], pending = [], unobserved = [];
      for (const row of await this.bodyHandoffController().records()) {
        const identity = { accountId: row.accountId, connection: row.connection };
        const p = this.players.get(row.accountId);
        if (row.phase === "closed") closed.push(identity);
        else if (!p || p.connectionToken !== row.connection || p.bodyClosing || p.bodyClosedAt != null) unobserved.push(identity);
        if (row.pending) pending.push(identity);
        // Keep every known ref protected during explicit close reconciliation;
        // otherwise closing one body could infer early closes for the others.
        if (row.ref) tokens.push(row.ref.token);
      }
      return { ready: !closed.length && !pending.length && !unobserved.length, tokens, closed, pending, unobserved };
    });
  }

  // Server-only public rescue/command observation; no endpoint or binding
  // enables it. The caller fences the host revision read before this snapshot.
  rescueObservation(ticket, identity = null) {
    return this.ctx.blockConcurrencyWhile(() => observeRoomRescue(this, ticket, identity));
  }

  // A finite server work inventory. Expired preparation is closed at its
  // original deadline; wake/retry cannot grant another preparation window.
  // Frozen bodies whose outboxes were retired cause no work or socket writes.
  bodyWork(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const box = this.bodyHandoffController(), tokens = [], events = [];
      let nextDeadline = null;
      for (let row of await box.records()) {
        const identity = { accountId: row.accountId, connection: row.connection }, p = this.players.get(row.accountId);
        const movement = await box.movement(identity, this.ctx.storage, row);
        const deadline = row.transfer?.expiresAt ?? row.preparation.expiresAt;
        if (row.phase !== "closed") {
          const missing = !p || p.connectionToken !== row.connection || p.bodyClosing || p.bodyClosedAt != null;
          const expired = !row.liveSent && Date.now() >= deadline;
          if (missing || expired) {
            // A missing socket uses the last durable observation. A known
            // close attachment has the actual disconnect time instead.
            const closedAt = missing ? p?.connectionToken === row.connection && Number.isSafeInteger(p.bodyClosedAt)
              ? p.bodyClosedAt : Math.max(row.at, movement?.receivedAt ?? 0) : deadline;
            row = await box.close(identity, closedAt);
            await this.syncCommittedBodyParticipant(identity);
          } else if (!row.liveSent) nextDeadline = Math.min(nextDeadline ?? Infinity, deadline);
        }
        if (row.ref) tokens.push(row.ref.token);
        if (row.phase === "closed") events.push({ kind: "close", identity });
        else if (row.pending) events.push({ kind: "handoff", identity });
        else if (movement && !movement.receipt && !movement.fenced) events.push({ kind: "movement", identity });
      }
      const publication = await this.readBodyEventPublication();
      return { tokens, events, nextDeadline, publicationPending: publication.pending ? publication.revision : null };
    });
  }

  async readBodyEventPublication(tx = this.ctx.storage) {
    const row = await tx.get("room-body-events-v1");
    if (row === undefined) return { revision: 0, pending: false };
    if (!row || Object.keys(row).sort().join() !== "pending,revision"
      || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.pending !== "boolean")
      throw Error("invalid body event publication marker");
    return row;
  }

  beginBodyEventBatch(ticket) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyHandoff(ticket);
      return this.ctx.storage.transaction(async tx => {
        const old = await this.readBodyEventPublication(tx);
        if (old.revision === Number.MAX_SAFE_INTEGER) throw Error("body event revision exhausted");
        const revision = old.revision + 1;
        await tx.put("room-body-events-v1", { revision, pending: true }); return revision;
      });
    });
  }

  completeBodyEventBatch(ticket, revision) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyHandoff(ticket);
      if (!Number.isSafeInteger(revision) || revision < 1) throw Error("invalid body event revision");
      return this.ctx.storage.transaction(async tx => {
        const row = await this.readBodyEventPublication(tx);
        if (row.revision !== revision) return false;
        if (row.pending) await tx.put("room-body-events-v1", { revision, pending: false });
        return true;
      });
    });
  }

  completeBodyHandoff(ticket, identity, revision, answer) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const outbox = this.bodyHandoffController(), row = await outbox.complete(identity, revision, answer);
      await this.syncCommittedBodyParticipant(identity);
      return { phase: row.phase, delivered: await outbox.deliver(identity) };
    });
  }

  deliverBodyHandoff(ticket, identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const outbox = this.bodyHandoffController(), row = await outbox.read(identity);
      await this.syncCommittedBodyParticipant(identity);
      return { phase: row?.phase ?? null, delivered: await outbox.deliver(identity) };
    });
  }

  // Explicit migration preparation only. It stops body control through the
  // retained request; voice stays connected and no Room authority is released.
  requestBodyStop(ticket, identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      const p = this.players.get(identity?.accountId);
      if (!p || p.connectionToken !== identity.connection || !p.bodyHandoff || p.bodyProtocol !== 2
        || p.bodyClosing || p.bodyClosedAt != null) throw Error("body stop connection mismatch");
      const box = this.bodyHandoffController(), row = await box.requestStop(identity);
      return { phase: row.phase, requestedAt: row.stopAt, delivered: await box.deliver(identity) };
    });
  }

  // A viewer never offered a body has no handoff request to stop. Its scene
  // must explicitly prove quiescence before a connected mode release instead.
  requestBodyQuiescence(ticket, identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      const p = this.players.get(identity?.accountId);
      if (!p || p.connectionToken !== identity.connection || !p.bodyHandoff || p.bodyMigrationProtocol !== 1
        || p.bodyProtocol !== 2 || p.bodyClosing || p.bodyClosedAt != null || p.body !== null
        || (await this.bodyHandoffController().index(this.ctx.storage)).includes(p.id))
        throw Error("body quiescence requires an untouched current viewer");
      let q = p.bodyQuiescence;
      if (q && !validBodyQuiescence(q)) throw Error("invalid body quiescence attachment");
      if (!q || q.revision !== this.npcAuthority.revision) {
        q = { request: crypto.randomUUID().replaceAll("-", ""), revision: this.npcAuthority.revision, acknowledged: false };
        // Attachment commit precedes notification and the in-memory proof.
        p.ws.serializeAttachment(this.attachment({ ...p, bodyQuiescence: q }));
        p.bodyQuiescence = q;
      }
      this.send(p.ws, { t: "body-quiesce", v: 1, accountId: p.id, connection: p.connectionToken,
        request: q.request, authority: npcAuthorityView(this.npcAuthority) });
      return { acknowledged: q.acknowledged, request: q.request, revision: q.revision };
    });
  }

  // Finite private hooks and explicitly negotiated compact preview ingress.
  // Production routing, cadence and combined costs still require validation.
  stageBodyMovement(ticket, identity, message) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyHandoff(ticket); return this.bodyHandoffController().receiveMovement(identity, message);
    });
  }
  pendingBodyMovement(ticket, identity) {
    this.checkBodyHandoff(ticket); return this.bodyHandoffController().pendingMovement(identity);
  }
  completeBodyMovement(ticket, identity, sequence, answer) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyHandoff(ticket);
      const box = this.bodyHandoffController(); await box.completeMovement(identity, sequence, answer);
      await this.syncCommittedBodyParticipant(identity);
      return { delivered: await box.deliverMovement(identity) };
    });
  }
  fenceBodyMovement(ticket, identity, sequence, proof) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyHandoff(ticket); return this.bodyHandoffController().fenceMovement(identity, sequence, proof);
    });
  }

  async syncCommittedBodyParticipant(identity) {
    const p = this.players.get(identity.accountId);
    if (!p || p.connectionToken !== identity.connection || !p.bodyHandoff) return false;
    const box = this.bodyHandoffController(), row = await box.read(identity);
    if (!row || this.players.get(p.id) !== p || p.connectionToken !== identity.connection) return false;
    const bodyId = `player:${p.id}`;
    if (row.phase === "closed" || p.bodyClosing || p.bodyClosedAt != null) {
      if (p.body !== bodyId) return false;
      p.ws.serializeAttachment(this.attachment({ ...p, body: null })); p.body = null;
      this.broadcast({ t: "body", id: p.id, name: null }); this.updateVoice(); return true;
    }
    if (this.env.VIRTUAL_HOST_MOVEMENT_PREVIEW !== "1" || row.phase !== "live" || !["clanker", "ooga"].includes(row.kind)
      || row.preparation.bodyId !== bodyId) return false;
    const view = row.transfer.view, movement = await box.movement(identity);
    const accepted = movement?.receipt && !movement.fenced;
    // A new pending inbox sample replaces its predecessor. The attachment is
    // the last published position; waking must not roll it back to the grant.
    if (!accepted && p.body === bodyId && p.bodyPresentedRequest === row.request) return false;
    const checkpoint = accepted ? movement.checkpoint : row.transfer.checkpoint;
    const values = row.kind === "clanker" && Array.isArray(checkpoint?.body) && checkpoint.body.length === 10
      ? checkpoint.body.slice(1, 5) : row.kind === "ooga" && checkpoint?.kind === "ooga" && checkpoint.position
        ? [checkpoint.position.x, checkpoint.position.y, checkpoint.position.z, checkpoint.position.yaw] : null;
    if (!values || checkpoint.v !== 1 || checkpoint.world !== row.preparation.world || typeof view.zone !== "string"
      || !ZONE_NAME.test(view.zone)) throw Error("committed body presentation incompatible");
    const position = values.map(v => v === "-0" ? -0 : v);
    if (!position.every(Number.isFinite)) throw Error("committed body presentation invalid");
    if (this.players.get(p.id) !== p || p.bodyClosing || p.bodyClosedAt != null) return false;
    const changed = p.body !== bodyId || p.zone !== view.zone;
    if (!changed && p.bodyPresentedRequest === row.request && p.x === position[0] && p.y === position[1] && p.z === position[2] && p.yaw === position[3]) return false;
    const next = { ...p, body: bodyId, bodyPresentedRequest: row.request, zone: view.zone, x: position[0], y: position[1], z: position[2], yaw: position[3],
      g: null, j: 0, w: 0, v: null, r: undefined, hp: 100, ko: false };
    // A failed attachment write is recoverable from the durable row/host receipt
    // on wake; never publish an uncommitted inbox sample as accepted movement.
    p.ws.serializeAttachment(this.attachment(next)); Object.assign(p, next);
    if (changed) { this.broadcast({ t: "body", id: p.id, name: bodyId }); this.updateVoice(); }
    this.dirty = true; this.scheduleFlush(); return true;
  }

  closedBodyHandoff(ticket, identity) {
    this.checkBodyHandoff(ticket); return this.bodyHandoffController().cleanup(identity);
  }

  resolveBodyHandoff(ticket, identity, revision, proof) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyHandoff(ticket); return this.bodyHandoffController().resolveClosed(identity, revision, proof);
    });
  }

  // Cleanup is fenced by the exact retained Room authority, even after its
  // finite lease/run expires. It never renews either, delivers a grant or opens
  // live commands. A takeover changes revision/owner and fences every old call.
  checkBodyCleanup(ticket) {
    if (this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1" || !this.npcAuthorityStatus(ticket)?.owns)
      throw Error("body cleanup preview disabled or fenced");
  }

  closedBodyRecovery(ticket, identity) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      const box = this.bodyHandoffController(), close = await box.cleanup(identity);
      if (!close) return null;
      return { close, pending: await box.pending(identity), movement: await box.pendingMovement(identity) };
    });
  }

  // Private finite-run retirement. No live grants, voice teardown or new
  // admission. Retry reads the retained closed rows and original run deadline.
  bodyRetirementWork(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      const status = this.npcAuthorityStatus(ticket), now = Date.now();
      if (!Number.isSafeInteger(status.runUntil) || now < status.runUntil)
        throw Error('world run has not ended');
      const box = this.bodyHandoffController(), rows = await box.records();
      if (rows.length > 32) throw Error('body retirement capacity');
      const identities = [];
      for (const row of rows.slice(0, 4)) {
        const identity = { accountId: row.accountId, connection: row.connection };
        if (row.phase !== 'closed') {
          await box.close(identity, status.runUntil);
          await this.syncCommittedBodyParticipant(identity);
        }
        identities.push(identity);
      }
      return { identities, more: rows.length > identities.length };
    });
  }

  completeClosedBodyRecovery(ticket, identity, revision, answer) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      const box = this.bodyHandoffController(), pending = await box.pending(identity);
      if (!pending?.closed) throw Error("closed body recovery required");
      // Recovered/cancelled host receipt only. Never call deliver here.
      return box.complete(identity, revision, answer);
    });
  }

  fenceClosedBodyMovement(ticket, identity, sequence, proof) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyCleanup(ticket);
      return this.bodyHandoffController().fenceMovement(identity, sequence, proof);
    });
  }

  resolveClosedBodyRecovery(ticket, identity, revision, proof) {
    return this.ctx.blockConcurrencyWhile(() => {
      this.checkBodyCleanup(ticket);
      return this.bodyHandoffController().resolveClosed(identity, revision, proof);
    });
  }

  // Durably retain the bounded public presentation before the host frees any
  // departure slots. This is an internal preview RPC, not a browser ACK or a
  // control grant. Expired Room authority may finish cleanup, never renew it.
  retainBodyPresence(ticket, hostTicket, frame) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      if (this.players.size > 32 || [...this.players.values()].some(p => p.bodyPresenceProtocol !== 1))
        throw Error("body presence incompatible occupants");
      const retained = await new RoomBodyPresence(this.ctx.storage, () => Date.now()).retain(ticket, hostTicket, frame);
      this.bodyPresenceRequired = true;
      this.bodyPresenceCache = null;
      return retained;
    });
  }

  // Called only inside a Room concurrency block. One validated latest frame
  // per authority, invalidated after every retained commit; socket ACKs and
  // hub toggles must not multiply durable reads by the number of viewers.
  async #readBodyPresence(ticket) {
    this.checkBodyCleanup(ticket);
    if (!this.bodyPresenceCache || this.bodyPresenceCache.revision !== ticket.revision) {
      const snapshot = await new RoomBodyPresence(this.ctx.storage, () => Date.now()).snapshot(ticket);
      this.bodyPresenceCache = { revision: ticket.revision, snapshot };
    }
    const snapshot = this.bodyPresenceCache.snapshot;
    if (!snapshot) return null;
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now < snapshot.frame.now) throw Error("invalid body presentation clock");
    return { frame: snapshot.frame, stale: now >= snapshot.frame.expiresAt };
  }

  bodyPresenceStatus(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => structuredClone(await this.#readBodyPresence(ticket)));
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
    const ps = [], gs = [], js = [], weapons = [], visuals = [], rests = [];
    for (const p of this.players.values()) {
      ps.push(p.id, p.x, p.y, p.z, p.yaw);
      if (p.g) gs.push(p.id, ...p.g);
      if (p.j) js.push(p.id, p.j);
      if (p.w) weapons.push(p.id, p.w);
      if (p.v) visuals.push([p.id, p.va, ...p.v]);
      if (p.r !== undefined) rests.push(p.r === 0 ? [p.id, 0] : [p.id, ...p.r]);
    }
    const state = { t: "state", now: Date.now(), ps };
    if (gs.length) state.gs = gs;
    if (js.length) state.js = js;
    if (weapons.length) state.ws = weapons;
    if (visuals.length) state.vs = visuals;
    if (rests.length) state.rs = rests;
    this.broadcast(state);
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

  // A private conversation (#188): invites, the conversation itself, and its sealed frames relayed as they come. The
  // room never reads a frame; it checks only that both ends still hold the conversation and the sender's rate.
  privateMessage(p, msg) {
    const now = p.seenAt, q = this.players.get(msg.to), to = msg.to;
    const tell = (x, m) => this.send(x.ws, { t: "pm", ...m });
    const account = this.pmAccount(p);
    if (msg.op === "data") {
      if (!q || p.pm.open !== q.id || q.pm.open !== p.id) return tell(p, { op: "refused", to, n: msg.n, reason: "closed" });
      if (!takeToken(account.data, PM_HZ, now, PM_BURST)) return tell(p, { op: "refused", to, n: msg.n, reason: "rate" });
      tell(q, { op: "data", from: p.id, d: msg.d });
      return tell(p, { op: "ok", to, n: msg.n });
    }
    if (msg.op === "invite") {
      if (!q || q === p) return tell(p, { op: "refused", to, reason: "offline" });
      if (q.pm.blocked.includes(p.id) || p.pm.blocked.includes(q.id)) return tell(p, { op: "refused", to, reason: "unavailable" });
      if (p.pm.open || q.pm.open) return tell(p, { op: "refused", to, reason: "busy" });
      if (!takeToken(account.invite, PM_INVITE_HZ, now, PM_INVITE_BURST)) return tell(p, { op: "refused", to, reason: "rate" });
      // Two who invited each other are talking.
      if (q.pm.inv.includes(p.id)) return this.privateOpen(p, q);
      p.pm.inv = [...p.pm.inv.filter((id) => id !== q.id), q.id].slice(-PM_INVITES);
      this.saveAttachment(p);
      tell(q, { op: "invite", from: p.id });
      return tell(p, { op: "inviting", to });
    }
    // The rest are held to their own rate: past it, an accept is refused and the others do nothing.
    if (!takeToken(account.control, PM_CONTROL_HZ, now, PM_CONTROL_BURST)) return msg.op === "accept" ? tell(p, { op: "refused", to, reason: "rate" }) : undefined;
    if (msg.op === "accept") {
      if (!q || !q.pm.inv.includes(p.id)) return tell(p, { op: "refused", to, reason: "withdrawn" });
      if (p.pm.open || q.pm.open) return tell(p, { op: "refused", to, reason: "busy" });
      return this.privateOpen(q, p);
    }
    if (msg.op === "decline" || msg.op === "block") {
      if (q && q.pm.inv.includes(p.id)) {
        q.pm.inv = q.pm.inv.filter((id) => id !== p.id);
        this.saveAttachment(q);
        tell(q, { op: "declined", from: p.id });
      }
      if (msg.op === "block") {
        if (p.pm.open === to) this.privateClose(p, "ended");
        // Someone blocked already, with no invite out to them, changes nothing, and nothing is written.
        if (p.pm.blocked.includes(to) && !p.pm.inv.includes(to)) return;
        p.pm.inv = p.pm.inv.filter((id) => id !== to);
        p.pm.blocked = [...p.pm.blocked.filter((id) => id !== to), to].slice(-PM_BLOCKS);
        account.blocked = p.pm.blocked.slice();
        this.saveAttachment(p);
      }
      return;
    }
    // end: the conversation, or an invite not yet answered.
    if (p.pm.open === to) return this.privateClose(p, "ended");
    if (p.pm.inv.includes(to)) {
      p.pm.inv = p.pm.inv.filter((id) => id !== to);
      this.saveAttachment(p);
      if (q) tell(q, { op: "withdrawn", from: p.id });
    }
  }

  // An account's blocks and rate limits, kept across its reconnects while the room is awake. At PM_ACCOUNT_KEEP the
  // oldest account no longer here makes room; a woken room starts afresh, with each socket's blocks in its attachment.
  pmAccount(p) {
    let a = this.pmAccounts.get(p.id);
    if (!a) {
      if (this.pmAccounts.size >= PM_ACCOUNT_KEEP) for (const id of this.pmAccounts.keys()) if (!this.players.has(id)) { this.pmAccounts.delete(id); break; }
      a = { blocked: p.pm.blocked.slice(), data: { tokens: PM_BURST, at: p.seenAt }, invite: { tokens: PM_INVITE_BURST, at: p.seenAt },
        control: { tokens: PM_CONTROL_BURST, at: p.seenAt } };
      this.pmAccounts.set(p.id, a);
    }
    return a;
  }

  privateOpen(a, b) {
    a.pm.inv = a.pm.inv.filter((id) => id !== b.id);
    b.pm.inv = b.pm.inv.filter((id) => id !== a.id);
    a.pm.open = b.id; b.pm.open = a.id;
    this.saveAttachment(a); this.saveAttachment(b);
    this.send(a.ws, { t: "pm", op: "open", with: b.id });
    this.send(b.ws, { t: "pm", op: "open", with: a.id });
  }

  // Ends `p`'s conversation at both ends.
  privateClose(p, reason) {
    const q = this.players.get(p.pm.open);
    if (q && q.pm.open === p.id) {
      q.pm.open = 0;
      this.saveAttachment(q);
      this.send(q.ws, { t: "pm", op: "closed", from: p.id, reason });
    }
    this.send(p.ws, { t: "pm", op: "closed", from: p.pm.open, reason });
    p.pm.open = 0;
    this.saveAttachment(p);
  }

  // A player leaving ends their conversation and every invite to or from them.
  privateLeave(p) {
    for (const q of this.players.values()) {
      if (q === p) continue;
      let changed = false;
      if (q.pm.open === p.id) { q.pm.open = 0; changed = true; this.send(q.ws, { t: "pm", op: "closed", from: p.id, reason: "left" }); }
      if (q.pm.inv.includes(p.id)) { q.pm.inv = q.pm.inv.filter((id) => id !== p.id); changed = true; this.send(q.ws, { t: "pm", op: "declined", from: p.id }); }
      if (p.pm.inv.includes(q.id)) this.send(q.ws, { t: "pm", op: "withdrawn", from: p.id });
      if (changed) this.saveAttachment(q);
    }
  }

  saveAttachment(p) { p.ws.serializeAttachment(this.attachment(p)); }

  // A thump from a voice participant goes to everyone in voice in its place as one tiny frame, never back to the sender,
  // marked `a: 1` for those who would hear the sender speak; over the bucket, or with nobody to see it, it is dropped
  // without a word.
  thump(p) {
    const peers = thumpPeers(this.players.values(), p, this.studio);
    if (!peers.length) return;
    if (!p.thumpBucket) p.thumpBucket = thumpBucketFor(this.thumpBuckets, p.id, p.seenAt, this.players);
    if (!p.thumpBucket || !takeToken(p.thumpBucket, THUMP_HZ, p.seenAt, THUMP_BURST)) return;
    const seen = `{"t":"thump","id":${p.id}}`, heard = `{"t":"thump","id":${p.id},"a":1}`;
    for (const q of peers) this.send(q.ws, thumpAudible(q, p, this.studio) ? heard : seen);
  }

  // Internal RPCs, deliberately unavailable unless explicitly enabled in a
  // local preview. No deployed config sets this flag and no HTTP route calls it.
  npcAuthorityStatus(ticket) {
    const r = this.npcAuthority;
    if (!r) return null;
    return { authority: npcAuthorityView(r), sequence: r.sequence, at: r.at,
      ...(r.cadence ? { cadence: npcCadenceName(r), nextPublishAt: npcNextPublicationAt(r) } : {}),
      leaseUntil: r.leaseUntil, runUntil: r.runUntil,
      owns: r.mode === "server" && ticket?.revision === r.revision && ticket.v === r.v && ticket.format === r.format && ticket.world === r.world
        && ticket.epoch === r.epoch && ticket.owner === r.owner };
  }

  async configureNpcAuthority(expectedRevision, next) {
    if (this.env.VIRTUAL_HOST_PREVIEW !== "1") throw new Error("NPC authority preview disabled");
    if (next?.cadence !== undefined && this.env[next.cadence === "rate-4-burst-2-v1"
      ? "VIRTUAL_HOST_BURST_PREVIEW" : "VIRTUAL_HOST_ROLLING_PREVIEW"] !== "1") throw new Error("NPC cadence preview disabled");
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.bodyHandoffRequired && next?.mode === "browser") throw new Error("body handoff drain required before authority release");
      if (this.bodyPresenceRequired && next?.mode === "browser") throw new Error("body presence drain required before authority release");
      // Check occupants while joins are blocked, not before entering the gate.
      // No deployed config or browser advertises the unfinished mixed format.
      if (next?.mode === "server" && ["mixed-1", "mixed-2", "mixed-3"].includes(next.format) && this.env.VIRTUAL_HOST_MIXED_PREVIEW !== "1") throw new Error("NPC mixed preview disabled");
      const requested = { v: next?.format === "mixed-3" ? 4 : next?.format === "mixed-2" ? 3 : next?.format === "mixed-1" ? 2 : 1 };
      if (next?.mode === "server" && (this.players.size > 32 || [...this.players.values()].some(p => !npcProtocolSupports(p.npcProtocol, requested)))) {
        throw new Error("NPC authority incompatible occupants");
      }
      const r = await new RoomNpcAuthority(this.ctx.storage, () => Date.now()).change(expectedRevision, next);
      this.applyNpcAuthority(r);
      return npcAuthorityView(r);
    });
  }

  async publishNpcSnapshot(ticket, sequence, frame) {
    if (this.env.VIRTUAL_HOST_PREVIEW !== "1") throw new Error("NPC authority preview disabled");
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.npcAuthority?.v >= 2 && this.env.VIRTUAL_HOST_MIXED_PREVIEW !== "1") throw new Error("NPC mixed preview disabled");
      if (this.npcAuthority?.cadence && this.env[npcCadenceName(this.npcAuthority) === "rate-4-burst-2-v1"
        ? "VIRTUAL_HOST_BURST_PREVIEW" : "VIRTUAL_HOST_ROLLING_PREVIEW"] !== "1") throw new Error("NPC cadence preview disabled");
      const { record, duplicate } = await new RoomNpcAuthority(this.ctx.storage, () => Date.now()).publish(ticket, sequence, frame);
      this.applyNpcAuthority(record);
      return { revision: record.revision, sequence: record.sequence, publishedAt: record.at, duplicate,
        ...(record.cadence ? { cadence: npcCadenceName(record), nextPublishAt: npcNextPublicationAt(record) } : {}) };
    });
  }

  async fenceNpcAuthority(intent) {
    if (this.env.VIRTUAL_HOST_PREVIEW !== "1") throw new Error("NPC authority preview disabled");
    return this.ctx.blockConcurrencyWhile(async () => {
      // This preserves the negotiated format/cadence and only removes the old
      // publisher. It neither grants a browser body nor restarts a finite run.
      const r = await new RoomNpcAuthority(this.ctx.storage, () => Date.now()).fence(intent);
      this.applyNpcAuthority(r);
      return npcAuthorityView(r);
    });
  }

  // Only explicit trusted recovery may undo an operator's browser release.
  // Preserve every handoff/presence record and retain the negotiated rate policy.
  async reacquireNpcAuthority(expectedRevision, intent, format) {
    if (this.env.VIRTUAL_HOST_PREVIEW !== "1") throw Error("NPC authority preview disabled");
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!["legacy-1", "mixed-1", "mixed-2", "mixed-3"].includes(format)
        || format !== "legacy-1" && this.env.VIRTUAL_HOST_MIXED_PREVIEW !== "1") throw Error("NPC recovery format disabled");
      const cadence = npcCadenceName(this.npcAuthority);
      if (cadence && this.env[cadence === "rate-4-burst-2-v1"
        ? "VIRTUAL_HOST_BURST_PREVIEW" : "VIRTUAL_HOST_ROLLING_PREVIEW"] !== "1") throw Error("NPC cadence preview disabled");
      if ((this.bodyHandoffRequired || this.bodyPresenceRequired) && this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1")
        throw Error("body recovery preview disabled");
      const requested = { v: format === "mixed-3" ? 4 : format === "mixed-2" ? 3 : format === "mixed-1" ? 2 : 1 };
      if (this.players.size > 32 || [...this.players.values()].some(p => !npcProtocolSupports(p.npcProtocol, requested)
        || this.bodyHandoffRequired && p.bodyProtocol !== 2 || this.bodyPresenceRequired && p.bodyPresenceProtocol !== 1))
        throw Error("NPC recovery incompatible occupants");
      const r = await new RoomNpcAuthority(this.ctx.storage, () => Date.now()).reacquire(expectedRevision, intent, format);
      this.applyNpcAuthority(r);
      return npcAuthorityView(r);
    });
  }

  // Default release still requires body-mode viewers to leave. The separate
  // connected operation requires an explicit capability and stopped bodies.
  async releaseDrainedNpcAuthority(expectedRevision, intent) {
    return this.releaseBodyAuthority(expectedRevision, intent, false);
  }

  async releaseConnectedNpcAuthority(expectedRevision, intent) {
    return this.releaseBodyAuthority(expectedRevision, intent, true);
  }

  async releaseBodyAuthority(expectedRevision, intent, connected) {
    if (typeof connected !== "boolean") throw Error("explicit body migration required");
    if (this.env.VIRTUAL_HOST_PREVIEW !== "1") throw Error("NPC authority preview disabled");
    const claim = structuredClone(intent);
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!connected && (this.bodyHandoffRequired || this.bodyPresenceRequired) && this.players.size)
        throw Error("Room occupants must leave before body-mode release");
      if ((connected || this.bodyHandoffRequired || this.bodyPresenceRequired) && this.env.VIRTUAL_HOST_BODY_PREVIEW !== "1")
        throw Error("body recovery preview disabled");
      if (connected && (this.players.size > ROOM_BODY_RELEASE.max || [...this.players.values()].some(p =>
        p.bodyMigrationProtocol !== 1 || p.body !== null || p.bodyClosing
        || p.bodyHandoff && !Number.isSafeInteger(p.bodyClosedAt) && !(validBodyQuiescence(p.bodyQuiescence)
          && p.bodyQuiescence.acknowledged && p.bodyQuiescence.revision === this.npcAuthority?.revision))))
        throw Error("body migration incompatible or unstopped occupants");
      const state = new RoomNpcAuthority(this.ctx.storage, () => Date.now());
      let release = null;
      const r = await this.ctx.storage.transaction(async tx => {
        if ((await this.bodyHandoffController().index(tx)).length) throw Error("body handoff drain required before authority release");
        const next = await state.releaseDrained(tx, expectedRevision, claim);
        if (connected) {
          release = validateBodyRelease(structuredClone({ v: 1, authority: npcAuthorityView(next),
            clients: [...this.players.values()].map(p => ({ accountId: p.id, connection: p.connectionToken })) }));
          await tx.put(ROOM_BODY_RELEASE.key, release);
        } else await tx.delete(ROOM_BODY_RELEASE.key);
        // No host bodies/departures (persisted release intent), no Room outbox.
        // Connected recipients keep the durable receipt until explicit replacement.
        await tx.delete(ROOM_BODY.key); await tx.delete(ROOM_BODY_PRESENCE.key);
        return next;
      });
      this.bodyHandoffRequired = this.bodyPresenceRequired = false;
      this.bodyPresenceCache = null;
      this.applyNpcAuthority(r);
      if (release) this.applyBodyRelease(release);
      return npcAuthorityView(r);
    });
  }

  applyBodyRelease(record) {
    const r = validateBodyRelease(record), a = this.npcAuthority;
    if (!a || r.authority.revision > a.revision) throw Error("body release authority missing");
    if (a.mode !== "browser" || a.revision !== r.authority.revision) return false;
    for (const c of r.clients) {
      const p = this.players.get(c.accountId);
      if (!p || p.connectionToken !== c.connection || p.bodyMigrationProtocol !== 1) continue;
      if (p.bodyReleasedRevision !== a.revision) {
        p.bodyHandoff = false; p.bodyClosedAt = null; p.bodyClosing = false;
        p.bodyQuiescence = null;
        p.bodyPresenceSent = p.bodyPresenceAck = null; p.bodyReleasedRevision = a.revision;
        p.ws.serializeAttachment(this.attachment(p));
      }
      this.send(p.ws, { t: "body-release", v: 1, ...c, authority: r.authority });
    }
    return true;
  }

  deliverBodyRelease(revision) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.npcAuthority?.mode !== "browser" || this.npcAuthority.revision !== revision) throw Error("body release fenced");
      const record = await this.ctx.storage.get(ROOM_BODY_RELEASE.key);
      if (!record || record.authority?.revision !== revision) throw Error("body release receipt missing");
      return this.applyBodyRelease(record);
    });
  }

  applyNpcAuthority(r) {
    const old = this.npcAuthority;
    if (old && (r.revision < old.revision || r.revision === old.revision && r.sequence < old.sequence)) return;
    const changed = !old || old.revision !== r.revision;
    this.npcAuthority = r;
    this.npcPacked = null;
    if (changed) {
      this.worldNotifier?.dispose(); this.worldNotifier = null;
      this.lastNpc = null;
      for (const p of this.players.values()) {
        // Credit survives hibernation too. Repeated wakes cannot enqueue another
        // frame for a socket still holding the previous unacknowledged one.
        if (p.npcSent?.revision !== r.revision) p.npcSent = null;
        if (p.npcAck?.revision !== r.revision) p.npcAck = null;
        p.ws.serializeAttachment(this.attachment(p));
      }
      // Incompatible sockets can survive a deployment in attachments. Their
      // ordinary close path still releases voice and unrelated occupancy now.
      if (r.mode === "server") for (const p of this.players.values()) if (!npcProtocolSupports(p.npcProtocol, r)) this.evict(p, "protocol");
      // Announce the selected browser host before its release descriptor, so
      // clients stay server-fenced until the replacement identity is known.
      this.electHost();
      this.broadcast({ t: "npc-authority", authority: npcAuthorityView(r) });
      this.notifyWorld();
    }
    for (const p of this.players.values()) this.sendNpcSnapshot(p);
  }

  sendNpcSnapshot(p) {
    const r = this.npcAuthority;
    if (r?.mode !== "server" || !r.frame || !p.inHub || !npcProtocolSupports(p.npcProtocol, r) || p.npcSent
      || p.npcAck?.revision === r.revision && p.npcAck.sequence === r.sequence) return;
    // One unacknowledged frame per socket, one latest durable frame for the room.
    // Slow clients skip intermediate states; no per-client frame queue or timer.
    p.npcSent = { revision: r.revision, sequence: r.sequence };
    p.ws.serializeAttachment(this.attachment(p));
    // Validate/decompress and wrap once for the whole fanout, not per viewer.
    // The cache is only this committed latest frame and is cleared on replacement.
    this.send(p.ws, this.npcPacked || (this.npcPacked = packNpcSnapshot(r)));
  }

  // Explicit event delivery, one latest durable frame and one outstanding
  // credit per compatible socket. No automatic cadence, retry timer or queue.
  deliverBodyPresence(ticket) {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkBodyCleanup(ticket);
      if (this.players.size > 32) throw Error("body presence preview capacity");
      const snapshot = await this.#readBodyPresence(ticket);
      if (!snapshot) return { delivered: 0 };
      let delivered = 0;
      for (const p of this.players.values()) if (this.sendBodyPresence(p, ticket, snapshot)) delivered++;
      return { delivered };
    });
  }

  sendBodyPresence(p, ticket, snapshot) {
    if (p.bodyPresenceProtocol !== 1 || !p.inHub) return false;
    const next = { authority: ticket.revision, epoch: snapshot.frame.epoch, revision: snapshot.frame.revision };
    // A Room takeover invalidates the old connection credit. Same-authority
    // updates coalesce while one frame is unacknowledged, even across a restart.
    if (p.bodyPresenceSent?.authority !== ticket.revision) p.bodyPresenceSent = null;
    if (p.bodyPresenceAck?.authority !== ticket.revision) p.bodyPresenceAck = null;
    if (p.bodyPresenceSent || p.bodyPresenceAck && ["authority", "epoch", "revision"].every(k => p.bodyPresenceAck[k] === next[k])) return false;
    const sentAt = Date.now();
    if (!Number.isSafeInteger(sentAt) || sentAt < snapshot.frame.now) return false;
    p.bodyPresenceSent = next;
    p.ws.serializeAttachment(this.attachment(p));
    this.send(p.ws, { t: "body-presence", authority: npcAuthorityView(this.npcAuthority),
      frame: snapshot.frame, stale: sentAt >= snapshot.frame.expiresAt, sentAt });
    return true;
  }

  // Also after any page's `hub` flag changes: the host sends frames only while someone follows.
  electHost() {
    if (this.npcAuthority?.mode === "server") {
      this.hostId = 0; this.followers = 0; this.lastNpc = null;
      return;
    }
    const id = electHost(this.players.values(), this.hostId);
    const followers = npcFollowers(this.players.values(), id);
    if (id === this.hostId && followers === this.followers) return;
    this.hostId = id;
    this.followers = followers;
    if (!id) this.lastNpc = null;
    this.broadcast({ t: "host", id, followers });
  }

  // The ghost arena's host, among the visible pages in it, by the NPC host's rule, followed by every other page in the
  // arena or its hallway; every page hears who it is. The
  // kept frame goes with a change of host, and when nobody follows, since the host then stops sending and the frame
  // would hand the next page in a hunt that has moved on (it sends again within a quarter second of a follower).
  electGhostHost() {
    const id = electHost(this.players.values(), this.ghostHostId, ghostCandidate);
    const followers = npcFollowers(this.players.values(), id, watchesGhost);
    if (id !== this.ghostHostId || !followers) this.lastGhost = null;
    if (id === this.ghostHostId && followers === this.ghostFollowers) return;
    this.ghostHostId = id;
    this.ghostFollowers = followers;
    this.broadcast({ t: "ghost-host", id, followers });
  }

  // A binary frame led by GHOST_MAGIC is the arena hunt's state: taken only from its host while in the arena, capped
  // in size and rate, kept for the next page to walk in, and relayed unchanged to every other page in the arena or its
  // hallway.
  ghostFrame(p, data) {
    if (p.id !== this.ghostHostId || !inGhostArena(p) || data.byteLength > GHOST_FRAME_MAX) return;
    if (!takeToken(p.ghostFrameBucket, GHOST_FRAME_HZ, Date.now(), GHOST_FRAME_BURST)) return;
    if (this.ghostFollowers) this.lastGhost = data;
    for (const q of this.players.values()) if (q !== p && watchesGhost(q)) this.send(q.ws, data);
  }

  // A binary frame is the NPC host's poses: taken only from the current host, capped in size and rate,
  // and relayed unchanged to every other page showing the island.
  npcFrame(p, data) {
    if (this.npcAuthority?.mode === "server" || p.id !== this.hostId || !p.inHub) return;
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
    // A browser timeout must not cancel the work that later requests are queued behind.
    this.background(p.voiceQueue);
    return result;
  }

  async voiceOperation(op, request, expected) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (!this.sfu) return json({ error: "voice is not configured" }, 503);
    const p = this.players.get(Number(request.headers.get("x-player-id")));
    if (!p || p !== expected) return json({ error: "connection replaced" }, 409);
    if (!ownedBody(CAST, p.login, p.contributor, p.id)) {
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
          await this.queueClose(publishingSession, [body.mid], true, true); throw err; }
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
          await this.queueClose(receivingSession, [], true, true); throw err;
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

  // The chalkboard (chalk-board.js, CHALK_HZ in protocol.js): why this player may not write on it now, or null.
  chalkRefusal(p) {
    if (!p.body || p.body.startsWith("gorilla:") || p.zone !== OUTSIDE) return "away";
    return CHALK.near(p.x, p.y, p.z) ? null : "away";
  }

  chalkMessage(p, msg) {
    const C = CHALK, now = p.seenAt, editor = this.chalkEditor, holding = !!editor && editor.id === p.id;
    if (msg.k === "drop") {
      if (holding) this.chalkLetGo(p);
      return;
    }
    if (!p.chalkBucket) p.chalkBucket = { tokens: CHALK_BURST, at: now };
    const paced = takeToken(p.chalkBucket, CHALK_HZ, now, CHALK_BURST), refusal = this.chalkRefusal(p);
    const other = editor && !holding ? this.players.get(editor.id) : null, taken = !!other && now - editor.at < CHALK_IDLE_MS;
    if (msg.k === "take") {
      if (refusal || taken || !paced) return this.send(p.ws, { t: "chalk-refused", why: refusal || (taken ? "busy" : "wait"), ...(taken && !refusal ? { name: other.display || other.login } : {}) });
      if (holding) { editor.at = now; return this.send(p.ws, { t: "chalk-lock", id: p.id }); }
      this.chalkGrant(p, now);
      return;
    }
    // An edit over the rate is dropped unanswered, and a holder's page is then behind the room: its next edit gets the
    // board back instead of being applied.
    if (!paced) {
      if (holding) p.chalkBehind = true;
      return;
    }
    // An edit from a page that does not hold the board: the room slept and forgot the holder, or the page lost it and
    // has not heard yet. A free board goes back to an Ooga still standing at it; otherwise the page gets the board
    // as it is and who holds it.
    if (!holding) {
      if (refusal || taken) return this.chalkTell(p, editor && other ? editor.id : 0, now);
      this.chalkGrant(p, now);
    } else if (refusal) return this.chalkLetGo(p);
    const held = this.chalkEditor;
    held.at = now;
    if (p.chalkBehind) return this.chalkResync(p, now);
    // Older pages may still send repeated wipes. They need no relay, save or timer.
    if (msg.k === "wipe" && C.preset(this.chalk) === msg.to) return;
    if (C.apply(this.chalk, msg, held.session)) return this.chalkResync(p, now);
    this.broadcast({ ...msg, id: p.id }, p.ws);
    this.chalkDirty = true;
    if (msg.k === "wipe") this.chalkSave();
    else if (!this.chalkTimer) this.chalkTimer = setTimeout(() => { this.chalkTimer = 0; this.chalkSave(); }, CHALK_SAVE_MS);
  }

  chalkGrant(p, now) {
    if (this.chalkEditor) this.chalkSave();
    this.chalkEditor = { id: p.id, session: CHALK.session(this.chalk), at: now };
    this.broadcast({ t: "chalk-lock", id: p.id });
  }

  // The board as the room has it, to one page, at most once every CHALK_TELL_MS; whether it went.
  chalkTell(p, editor, now) {
    if (now - (p.chalkToldAt || 0) < CHALK_TELL_MS) return false;
    p.chalkToldAt = now;
    this.send(p.ws, { t: "chalk-board", marks: this.chalk.marks, editor });
    return true;
  }

  // The holder's page and the room disagree: the room's board wins, and the holder starts a fresh line. Until it can
  // be told, the holder stays behind and its edits are not applied.
  chalkResync(p, now) {
    p.chalkBehind = !this.chalkTell(p, p.id, now);
    if (!p.chalkBehind) this.chalkEditor.session = CHALK.session(this.chalk);
  }

  chalkLetGo(p) {
    if (!this.chalkEditor || this.chalkEditor.id !== p.id) return;
    this.chalkEditor = null;
    this.chalkSave();
    this.broadcast({ t: "chalk-lock", id: 0 });
  }

  // At most one write every CHALK_SAVE_MS while someone writes (a short timer after an edit, which also keeps the
  // room awake until its last edit is stored), and one at once on a wipe or when the holder lets go.
  chalkSave() {
    if (this.chalkTimer) { clearTimeout(this.chalkTimer); this.chalkTimer = 0; }
    if (!this.chalkDirty) return;
    this.chalkDirty = false;
    if (!this.ctx || !this.ctx.storage) return;
    if (CHALK.preset(this.chalk) === "original") {
      if (this.chalkStored) this.background(this.ctx.storage.delete("chalk"));
      this.chalkStored = false;
    } else {
      // An empty marks array is the blank marker; absence means the original board.
      this.background(this.ctx.storage.put("chalk", { marks: this.chalk.marks }));
      this.chalkStored = true;
    }
  }

  // DSB Land's free hardware wallets (WALLET_CAP in protocol.js). A player's live ones, a little past their end so a
  // late blast still finds them; where one is (its carrier's zone while carried); and the state other pages draw.
  liveWallets(p, now) { return (p.wallets || []).filter(w => w.end > now - 5000); }
  walletZone(p, w) { return w.s === "c" ? p.zone : w.zone; }
  walletView(p, w) { return [p.id, w.u, w.l, w.s, w.x, w.y, w.z, w.vx, w.vy, w.vz, w.at, w.end]; }
  walletSend(zone, msg, except) {
    const text = JSON.stringify(msg);
    for (const o of this.players.values()) if (o !== except && o.zone === zone) this.send(o.ws, text);
  }

  walletMessage(p, msg) {
    if (!p.body || p.body.startsWith("gorilla:") || !p.zone.startsWith("dsb-")) return;
    if (!p.walletBucket) p.walletBucket = { tokens: WALLET_BURST, at: p.seenAt };
    if (!takeToken(p.walletBucket, WALLET_HZ, p.seenAt, WALLET_BURST)) return;
    const now = p.seenAt, list = this.liveWallets(p, now);
    p.wallets = list;
    if (msg.k === "blast") {
      const gone = list.filter(w => msg.u.includes(w.u));
      if (!gone.length) return;
      p.wallets = list.filter(w => !msg.u.includes(w.u));
      return this.walletSend(this.walletZone(p, gone[0]), { t: "wallet", k: "blast", id: p.id, u: gone.map(w => w.u) }, p);
    }
    let w = list.find(v => v.u === msg.u);
    const carrying = list.some(v => v.s === "c" && v !== w);
    if (msg.k === "take") {
      if (w || carrying || list.length >= WALLET_CAP) return;
      w = { u: msg.u, l: msg.l, s: "c", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, at: now, end: 0, zone: null };
      list.push(w);
    } else if (!w || msg.k === "up" && carrying) return;
    w.at = now;
    w.end = now + msg.f * 1000;
    if (msg.k === "up" || msg.k === "take") { w.s = "c"; w.zone = null; }
    else {
      w.s = msg.k === "down" ? "d" : "f"; w.zone = p.zone;
      w.x = msg.x; w.y = msg.y; w.z = msg.z; w.vx = msg.vx || 0; w.vy = msg.vy || 0; w.vz = msg.vz || 0;
    }
    this.walletSend(this.walletZone(p, w), { t: "wallet", k: msg.k, w: this.walletView(p, w) }, p);
  }

  // A page arriving in a DSB zone gets the live wallets there, and the one it carries in reaches the pages there.
  walletsArrive(p) {
    if (!p.zone.startsWith("dsb-")) return;
    const now = Date.now(), list = [];
    for (const o of this.players.values()) if (o !== p) for (const w of this.liveWallets(o, now)) if (w.end > now && this.walletZone(o, w) === p.zone) list.push(this.walletView(o, w));
    if (list.length) this.send(p.ws, { t: "wallets", list });
    const carried = this.liveWallets(p, now).find(w => w.s === "c" && w.end > now);
    if (carried) this.walletSend(p.zone, { t: "wallet", k: "take", w: this.walletView(p, carried) }, p);
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
    await this.queueClose(session, mids, !!session && !mids.length, true);
  }

  async clearVoice(p) {
    const old = p.voice;
    p.voice = { pub: null, sub: null, track: null, pending: null, gen: old.gen || 0, mids: {}, pubMid: null };
    await Promise.all([this.queueClose(old.pub, old.pubMid ? [old.pubMid] : [], !!old.pub && !old.pubMid, true), this.queueClose(old.sub, Object.keys(old.mids || {}), !!old.sub && !Object.keys(old.mids || {}).length, true)]);
  }

  async queueClose(session, mids, inspect = false, deferred = false) {
    if (!this.sfu || !session || (!mids.length && !inspect)) return;
    if (!this.cleanupJobs) this.cleanupJobs = [];
    const existing = this.cleanupJobs.find(job => job.session === session);
    if (existing) { existing.at = Date.now(); existing.revision = (existing.revision || 0) + 1; existing.mids = [...new Set(existing.mids.concat(mids))]; existing.midVersions = existing.midVersions || {}; for (const mid of mids) existing.midVersions[mid] = existing.revision; existing.inspect = existing.inspect || inspect; if (inspect) existing.inspectUntil = Date.now() + 20000; }
    else this.cleanupJobs.push({ session, at: Date.now(), revision: 0, mids: [...new Set(mids)], midVersions: Object.fromEntries(mids.map(mid => [mid, 0])), inspect, inspectUntil: inspect ? Date.now() + 20000 : 0 });
    if (this.ctx && this.ctx.storage) await this.ctx.storage.put("voiceCleanup", this.cleanupJobs);
    for (const p of this.players.values()) if (p.zone === STUDIO_ZONE) this.sendStudio(p);
    // Persist and arm the retry before upstream I/O. Retired sessions never hold up a new one.
    if (!this.cleanupAt) this.cleanupAt = Date.now() + SWEEP_MS;
    if (this.ctx && this.ctx.storage) await this.ensureSweep();
    if (deferred) this.background(this.retryCleanup(session));
    else await this.retryCleanup(session);
  }

  async retryCleanup(session = null) {
    if (!this.sfu || !this.cleanupJobs || !this.cleanupJobs.length) return;
    if (!session && this.cleanupRunning) return this.cleanupRunning;
    const tasks = this.cleanupTasks ||= new Map();
    const running = (async () => {
      for (const job of [...this.cleanupJobs]) {
        if (!this.cleanupJobs.includes(job) || (session && job.session !== session)) continue;
        // Only the same SFU session waits: another player's cleanup cannot stall this request.
        while (tasks.has(job.session)) await tasks.get(job.session);
        if (!this.cleanupJobs.includes(job)) continue;
        // A job the SFU has refused for CLEANUP_MS is given up, so a room nobody is in stops waking for it.
        if (Date.now() - (job.at ??= Date.now()) > CLEANUP_MS) { this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1); continue; }
        let finished;
        tasks.set(job.session, new Promise(resolve => { finished = resolve; }));
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
        } finally { tasks.delete(job.session); finished(); }
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
    if (!session) this.cleanupRunning = running;
    try { await running; } finally { if (this.cleanupRunning === running) this.cleanupRunning = null; }
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
    hockey.sweep(this);
    const now = Date.now();
    // Cleanup retries run on every wake, not only at sweep time.
    await this.retryCleanup();
    const sweepDue = !this.sweepAt || now >= this.sweepAt;
    this.expireDoors(now);
    // A cancelled lease can leave its earlier alarm in place. Before the recorded sweep deadline that wake only
    // expires door state and reschedules; it must not turn account reads and stale checks into a high-frequency poll.
    if (sweepDue) {
      try { await this.refreshHighscores(); } catch { /* Pending D1 revisions survive until the next sweep. */ }
      for (const p of [...this.players.values()]) {
        if (!ownedBody(CAST, p.login, p.contributor, p.id)) { this.evict(p, "revoked"); continue; }
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
