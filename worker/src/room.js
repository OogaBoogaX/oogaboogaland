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
// Reactions: an emoji goes to the sender's zone and is never kept; the raised hand lives on the record and its
// attachment, so a woken room still shows it, and goes to everyone on a change. One bucket a record limits both.
// Voice links: each account's asks live in the room's storage, so a link outlives reconnects, sleep and deploys (see
// Voice links in protocol.js). Nothing runs for them while idle.
// The inspector (inspect-report.js): while INSPECTOR_IDS names an account, the room reports joins, drops with what
// caused them, zone and host changes and voice failures as they happen, and its state with the time since its last
// report, riding snapshots and the sweep; it adds no timer. Off, every call returns at once.

import { DurableObject } from "cloudflare:workers";
import {
  CABINETS, hockey, block, BLOCK, CLOSE_KICK, CLOSE_PROTOCOL, MAX_PLAYERS, MOVE_HZ, STALE_MS, SWEEP_MS, CLEANUP_MS, TICK_HZ,
  NPC_FRAME_MAX, NPC_HZ, OUTSIDE, HP_HZ, VOICE_TRACK, CHAT_HZ, CHAT_BURST, CHAT_BUCKET_KEEP, CHAT_RETRY_KEEP, CHAT_FEATURE,
  DOOR_ZONE, DOOR_ROOM, DOOR_GRANT_MS, DOOR_TRANSIT_MS, DOOR_PASS_MS, DOOR_HZ, DOOR_BURST, ROOM_LOCK_FEATURE, PIN_PASS_MS, PIN_TRIES, PIN_WAIT_MS, CONTROL_FRAMES, CONTROL_HZ, CONTROL_BURST, SHOT_HZ, SHOT_BURST, SWING_HZ, SWING_BURST, REACT_FEATURE, HAND_EMOJI_FEATURE, REACT_HZ, REACT_BURST,
  GHOST_MAGIC, inGhostArena, watchesGhost,
  CHALK, CHALK_HZ, CHALK_BURST, CHALK_IDLE_MS, CHALK_SAVE_MS, CHALK_TELL_MS, CHALK_FEATURE,
  WALLET_CAP, WALLET_HZ, WALLET_BURST,
  PM_FEATURE, PM_HZ, PM_BURST, PM_INVITE_HZ, PM_INVITE_BURST, PM_CONTROL_HZ, PM_CONTROL_BURST, PM_INVITES, PM_BLOCKS, PM_ACCOUNT_KEEP,
  LINK_FEATURE, LINK_HZ, LINK_BURST, LINK_WANTS, LINK_ACCOUNTS, voiceLinked, restoreLinks, storedLinks, linkView, inVoice,
  chatLog, castIndex, bodyName, ownedBody, electHost, npcFollowers, claimRefusal, parseClientMessage, playerFromHeaders, spawnPoint, takeToken, voicePeers,
  BLEND, BLEND_HZ, seenTogether, inspectReporter, INSPECT_FEATURE,
} from "./protocol.js";
import { sha256Hex } from "./crypto.js";
import { getPlayer } from "./db.js";
import { deliverHighscores } from "./highscore-store.js";
import { sfuClient, turnCredentials } from "./sfu.js";
import { STUDIO_TRANSPORT, STUDIO_ZONE, studioState, studioHostAllowed, studioCanSpeak, studioPosition, studioSeatAllowed, studioSource } from "./studio-policy.js";
import CAST_ROWS from "./characters.gen.json";

const CAST = castIndex(CAST_ROWS);
// A retired SFU session cannot own usable tracks. Other 410 responses are not proof of session expiry.
const sfuSessionGone = err => err.status === 404 || (err.status === 410 && err.code === "session_error");

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.inspect = inspectReporter(ctx, env, "Room", () => ctx.id.name, (detail) => this.inspectState(detail));
    this.flushDue = 0;
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
    this.sfu = sfuClient(env, (ms, failed) => {
      this.inspect.count("sfu");
      this.inspect.count("sfuMs", ms);
      this.inspect.peak("sfuMax", ms);
      if (failed) this.inspect.count("sfuFail");
    });
    this.hostId = 0;
    this.followers = 0;
    this.lastNpc = null;
    this.chat = chatLog();
    this.chatId = 0;
    this.chatAccepted = new Map();
    this.chatBuckets = new Map();
    this.pmAccounts = new Map();
    this.links = new Map();
    this.doorQueue = [];
    this.doorActive = null;
    this.doorPasses = new Map();
    this.doorId = 0;
    // Locked Sphere rooms by number: { pin, passes: id -> ms the way in stays open }. Every page hears which rooms are
    // locked; only the players inside one hear its PIN. Every occupant's socket attachment carries its room's lock so
    // hibernation keeps it.
    this.roomLocks = new Map();
    this.pinTries = new Map();
    this.sweepAt = 0;
    this.cleanupAt = 0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    // The pile's sound loop started once, for good: every page plays it at (now - loopEpoch), so all
    // hear the same crackle at the same moment. Stored, so a woken or redeployed room keeps the phase.
    this.loopEpoch = 0;
    ctx.blockConcurrencyWhile(async () => {
      await hockey.loadLimits(this);
      hockey.restore(this);
      block.restore(this);
      this.studio = (await ctx.storage.get("studio")) || this.studio;
      if (!studioSource(this.studio.source)) { this.studio.source = studioState().source; this.studio.position = 0; this.studio.playing = false; this.studio.at = Date.now(); this.studio.revision++; this.studio.playbackRevision = (this.studio.playbackRevision || 0) + 1; await ctx.storage.put("studio", this.studio); }
      this.studio.position = studioPosition(this.studio, this.studio.at);
      const seated = id => { const p = this.players.get(id); return !!p && p.zone === STUDIO_ZONE && !!p.body && Number.isInteger(p.studioSeat) && !p.studioRevoked && !(this.studio.restrictedIds || []).includes(id); };
      this.studio.hands = [...new Set((Array.isArray(this.studio.hands) ? this.studio.hands : []).filter(seated))].slice(0, MAX_PLAYERS);
      this.studio.invited = this.studio.mode === "qa" ? [...new Set((Array.isArray(this.studio.invited) ? this.studio.invited : []).filter(seated))].slice(0, MAX_PLAYERS) : [];
      this.cleanupJobs = (await ctx.storage.get("voiceCleanup")) || [];
      this.links = restoreLinks(await ctx.storage.get("voiceLinks"));
      const chalk = await ctx.storage.get("chalk"), marks = chalk && CHALK.restore(chalk.marks);
      // A board stored before the board grew (no `v`) is widened as it loads; the next save stores it widened.
      if (marks) this.chalk = CHALK.board(chalk.v === CHALK.VERSION ? marks : CHALK.widen(marks));
      this.chalkStored = chalk !== undefined;
      // Older versions stored the original drawing too; it can always be rebuilt locally.
      if (this.chalkStored && CHALK.preset(this.chalk) === "original") {
        await ctx.storage.delete("chalk");
        this.chalkStored = false;
      }
      const stored = await ctx.storage.get(["loopEpoch", "sweepAt"]);
      this.loopEpoch = stored.get("loopEpoch") || Date.now();
      this.sweepAt = stored.get("sweepAt") || Date.now() + SWEEP_MS;
      // Restore without rewriting unchanged values on every hibernation wake. The alarm persists
      // a new sweep deadline when it actually advances; the pile loop's phase is initialized once.
      if (!stored.get("loopEpoch")) await ctx.storage.put("loopEpoch", this.loopEpoch);
      if (!stored.get("sweepAt")) await ctx.storage.put("sweepAt", this.sweepAt);
      if (this.studio.hostId && (!this.players.has(this.studio.hostId) || this.players.get(this.studio.hostId).zone !== STUDIO_ZONE || !studioHostAllowed(env, this.studio.hostId))) this.suspendStudio();
      // Stored cleanup retries from an alarm due now, never inside this block: several bounded SFU calls can accumulate, and a
      // block past 30 s resets the island's only room, presence and voice with it.
      if (this.sfu && this.cleanupJobs.length) {
        this.cleanupAt = Date.now();
        await this.scheduleAlarm();
      }
    });
    // A woken room rebuilds its roster from the attachments its sockets carry. The runtime still lists a socket that is
    // closing, newest first, and a half-open one can stay closing for minutes: it must never take a player's record from
    // the socket that replaced it, or bring back a player evicted.
    for (const ws of ctx.getWebSockets()) {
      if (ws.readyState > 1) continue;
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
    this.inspect.woke(this.players.size);
  }

  record(ws, a) {
    return { ws, voice: { pub: null, sub: null, track: null, gen: 0, mids: {}, pubMid: null }, muted: false, hand: false, handTone: 0, handEmoji: "", hp: 100, ko: false, g: null, j: 0, w: 0, v: null, va: 0, sent: null, zone: OUTSIDE, pokerVoice: null, inHub: false, visible: true, joinedAt: Date.now(), door: null, passes: [], roomLock: null, blendTo: null, blendK: 0, pm: { inv: [], open: 0, blocked: [] }, ...a, bucket: { tokens: MOVE_HZ, at: Date.now() }, npcBucket: { tokens: NPC_HZ, at: Date.now() }, hpBucket: { tokens: HP_HZ, at: Date.now() }, blendBucket: { tokens: BLEND_HZ, at: Date.now() }, doorBucket: { tokens: DOOR_BURST, at: Date.now() }, chatBucket: this.chatBucketFor(a.id, Date.now()), seenAt: a.joinedAt || Date.now() };
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
    return { cabinet: p.cabinet || null, cabinetBucket: p.cabinetBucket || null, hockey: p.hockey || null, hockeyBuckets: p.hockeyBuckets || null, block: p.block || null, id: p.id, login: p.login, display: p.display, contributor: p.contributor, body: p.body, connectionToken: p.connectionToken, studioSeat: p.studioSeat, studioRevoked: !!p.studioRevoked, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, j: p.j, w: p.w, v: p.v, va: p.va, r: p.r, voice: p.voice, muted: p.muted, hand: p.hand, handTone: p.handTone, handEmoji: p.handEmoji, hp: p.hp, ko: p.ko, sent: p.sent, zone: p.zone, pokerVoice: p.pokerVoice, inHub: p.inHub, visible: p.visible, joinedAt: p.joinedAt, door: p.door, passes: p.passes, roomLock: p.roomLock, pinTries: this.pinTries.get(p.id) || null, blendTo: p.blendTo, blendK: p.blendK, pm: p.pm };
  }

  view(p) {
    return { id: p.id, login: p.login, display: p.display, body: p.body, zone: p.zone, x: p.x, y: p.y, z: p.z, yaw: p.yaw, g: p.g, j: p.j, w: p.w, v: p.v, va: p.va, r: p.r, voice: inVoice(p), muted: p.muted, hand: p.hand, handTone: p.handTone, handEmoji: p.handEmoji, hp: p.hp, ko: p.ko, blendTo: p.blendTo, blendK: p.blendK };
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
    let sent = 0;
    for (const p of this.players.values()) if (p.ws !== except) { this.send(p.ws, text); sent++; }
    this.inspect.count("out", sent);
    this.inspect.count("outBytes", sent * text.length);
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
      if (p.roomLock && this.roomOf(p.zone) === p.roomLock.room) this.roomLocks.set(p.roomLock.room, { pin: p.roomLock.pin, passes: new Map() });
      else p.roomLock = null;
      if (p.pinTries && (p.pinTries.until > now || now - p.pinTries.at <= PIN_WAIT_MS)) this.pinTries.set(p.id, p.pinTries);
      p.pinTries = undefined;
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
    // A lease that ran out while the room slept has no alarm left to pass the doors on.
    if (!this.doorActive) this.grantDoor(now);
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

  // A numbered room's zone's number (0–9), or -1.
  roomOf(zone) {
    const match = DOOR_ROOM.exec(zone);
    return match ? Number(match[1]) : -1;
  }

  lockedRooms() {
    return [...this.roomLocks.keys()].sort((a, b) => a - b);
  }

  // A locked room lets in whoever is holding a pass; everyone else needs the PIN.
  mayEnter(p, room, now) {
    const lock = this.roomLocks.get(room);
    return !lock || (lock.passes.get(p.id) || 0) > now;
  }

  // Every occupant carries the lock, so whichever socket a hibernated room wakes with still has it.
  shareRoomLock(room, lock) {
    for (const o of this.players.values()) if (this.roomOf(o.zone) === room) {
      o.roomLock = lock ? { room, pin: lock.pin } : null;
      o.ws.serializeAttachment(this.attachment(o));
      if (lock) this.send(o.ws, { t: "door", op: "room-pin", room, pin: lock.pin });
    }
  }

  // Nobody left inside: the room opens by itself.
  freeEmptyRoom(room) {
    if (room < 0 || !this.roomLocks.has(room)) return;
    for (const o of this.players.values()) if (this.roomOf(o.zone) === room) return;
    this.roomLocks.delete(room);
    this.broadcast({ t: "door", op: "locks", rooms: this.lockedRooms() });
  }

  // A pass is spent on walking in; the new occupant holds the lock with everyone else inside.
  roomZoneChanged(p, from) {
    const entered = this.roomOf(p.zone), left = this.roomOf(from), lock = entered >= 0 ? this.roomLocks.get(entered) : null;
    if (lock) {
      lock.passes.delete(p.id); p.roomLock = { room: entered, pin: lock.pin };
      this.send(p.ws, { t: "door", op: "room-pin", room: entered, pin: lock.pin });
    } else p.roomLock = null;
    if (left !== entered) this.freeEmptyRoom(left);
  }

  // Whether this player has run out of tries; a wrong PIN counts one, a right one forgives them. The tally is the
  // player's, not the socket's: it outlives a reconnect, and rides the socket's attachment through hibernation. A tally
  // is forgotten a wait's length after its last wrong try, so the map holds only the players trying lately.
  pinRefused(p, now) {
    const tries = this.pinTries.get(p.id);
    return !!tries && tries.until > now;
  }

  pinWrong(p, now) {
    for (const [id, old] of this.pinTries) if (old.until <= now && now - old.at > PIN_WAIT_MS) this.pinTries.delete(id);
    const tries = this.pinTries.get(p.id) || { count: 0, until: 0, at: 0 };
    tries.count++; tries.at = now;
    if (tries.count >= PIN_TRIES) { tries.count = 0; tries.until = now + PIN_WAIT_MS; }
    this.pinTries.set(p.id, tries);
    p.ws.serializeAttachment(this.attachment(p));
  }

  pinRight(p) {
    if (this.pinTries.delete(p.id)) p.ws.serializeAttachment(this.attachment(p));
  }

  roomLockMessage(p, msg, now) {
    const reply = (ok, reason = "") => this.send(p.ws, { t: "door", op: "lock-result", action: msg.op, room: msg.room, ok, reason });
    const lock = this.roomLocks.get(msg.room);
    if (msg.op === "lock") {
      if (!p.body || this.roomOf(p.zone) !== msg.room) return reply(false, "wrong-room");
      if (lock) return reply(false, "already-locked");
      const made = { pin: msg.pin, passes: new Map() };
      this.roomLocks.set(msg.room, made);
      this.shareRoomLock(msg.room, made);
      this.broadcast({ t: "door", op: "locks", rooms: this.lockedRooms() });
      return reply(true);
    }
    if (msg.op === "unlock") {
      // Anyone inside may open it.
      if (!p.body || this.roomOf(p.zone) !== msg.room) return reply(false, "wrong-room");
      if (!lock) return reply(true);
      this.roomLocks.delete(msg.room);
      this.shareRoomLock(msg.room, null);
      this.broadcast({ t: "door", op: "locks", rooms: this.lockedRooms() });
      return reply(true);
    }
    if (this.pinRefused(p, now)) return reply(false, "wait");
    if (!p.body || p.zone !== DOOR_ZONE) return reply(false, "not-at-door");
    if (!lock) return reply(true);
    if (lock.pin !== msg.pin) { this.pinWrong(p, now); return reply(false, "wrong"); }
    this.pinRight(p);
    lock.passes.set(p.id, now + PIN_PASS_MS);
    return reply(true);
  }

  async doorMessage(p, msg) {
    const now = Date.now();
    if (!takeToken(p.doorBucket, DOOR_HZ, now, DOOR_BURST)) {
      this.send(p.ws, { t: "door", op: "denied", reason: "rate" });
      return;
    }
    if (msg.op === "lock" || msg.op === "unlock" || msg.op === "try") {
      this.roomLockMessage(p, msg, now);
      return;
    }
    if (msg.op === "ask") {
      if (!p.body || p.zone !== DOOR_ZONE) { this.send(p.ws, { t: "door", op: "denied", reason: "not-at-door" }); return; }
      if (msg.dir === "in" && !this.mayEnter(p, msg.room, now)) { this.send(p.ws, { t: "door", op: "denied", reason: "locked" }); return; }
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [String(who.id)]);

    const older = this.players.get(who.id);
    if (older) this.evict(older, "replaced");
    if (this.players.size >= MAX_PLAYERS) {
      this.inspect.event("full", who);
      this.send(server, { t: "kick", reason: "full" });
      server.close(CLOSE_KICK, "full");
      return new Response(null, { status: 101, webSocket: client });
    }

    const spawn = spawnPoint(this.spawnSlot++);
    const p = this.record(server, { ...who, connectionToken: crypto.randomUUID(), body: null, x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw });
    const kept = this.pmAccounts.get(p.id);
    if (kept) p.pm.blocked = kept.blocked.slice();
    server.serializeAttachment(this.attachment(p));
    // An owner arriving takes either body back from whoever holds it.
    const own = ownedBody(CAST, p.login, p.contributor, p.id);
    if (own) for (const o of this.players.values()) if (o.body && bodyName(o.body).toLowerCase() === own) this.release(o, "owner-here");
    this.players.set(p.id, p);
    if (this.inspect.on) this.inspect.event("join", p, { replaced: !!older });

    const others = [];
    for (const o of this.players.values()) if (o !== p) others.push(this.view(o));
    this.send(server, { t: "welcome", you: this.view(p), players: others, connectionToken: p.connectionToken, tickHz: TICK_HZ, now: Date.now(), loopEpoch: this.loopEpoch, host: this.hostId, followers: this.followers, locks: this.lockedRooms(), features: [CABINETS.FEATURE, CABINETS.OUTDOOR_FEATURE, "door", ROOM_LOCK_FEATURE, CHAT_FEATURE, PM_FEATURE, CHALK_FEATURE, "hockey-v4", BLOCK.FEATURE, REACT_FEATURE, HAND_EMOJI_FEATURE, LINK_FEATURE, ...(this.inspect.on ? [INSPECT_FEATURE] : [])] });
    // A message of its own after welcome, so a page that does not know chat ignores it; empty after the room slept.
    this.send(server, { t: "chat-history", messages: this.chat.list() });
    this.sendCabinets(server);
    this.sendLinks(p);
    this.send(server, { t: "chalk-board", marks: this.chalk.marks, editor: this.chalkEditor ? this.chalkEditor.id : 0 });
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
    this.inspect.count("in");
    this.inspect.count("inBytes", typeof message === "string" ? message.length : message.byteLength);
    if (!ownedBody(CAST, p.login, p.contributor, p.id)) { this.evict(p, "revoked"); return; }
    if (typeof message !== "string") {
      if (message instanceof ArrayBuffer && message.byteLength >= 4 && new DataView(message).getUint32(0, true) === BLOCK.MAGIC) block.frame(this, p, message);
      else if (message instanceof ArrayBuffer && message.byteLength >= 4 && new DataView(message).getUint32(0, true) === GHOST_MAGIC) return; // HALLOWEEN: a page from before the hunt ran on the server (game-host.js)
      else this.npcFrame(p, message);
      return;
    }
    const msg = parseClientMessage(typeof message === "string" ? message : "");
    if (msg === false) {
      this.drop(p, "protocol", { code: CLOSE_PROTOCOL });
      ws.close(CLOSE_PROTOCOL, "unreadable message");
      return;
    }
    p.seenAt = Date.now();
    if (!msg) return;
    // Once a connection, after a rejoin: why the page's last socket ended, as the page saw it (net.js).
    if (msg.t === "back") {
      if (!p.backSaid) { p.backSaid = true; this.inspect.event("back", p, { why: msg.why, code: msg.code, clean: msg.clean, down: msg.down }); }
      return;
    }
    if (msg.t === "cabinet") { this.cabinetMessage(p, msg); return; }
    // While playing, the room owns the floor pose and body, regardless of game-scene reports.
    if (p.cabinet && ["pose", "zone", "body", "blend", "hp", "shot", "swing", "hockey", "bf"].includes(msg.t)) return;
    if (msg.t === "bf") { block.message(this, p, msg); return; }
    if (msg.t === "hockey") { hockey.message(this, p, msg); ws.serializeAttachment(this.attachment(p)); return; }
    if (CONTROL_FRAMES.has(msg.t)) {
      if (!p.controlBucket) p.controlBucket = { tokens: CONTROL_BURST, at: p.seenAt };
      if (!takeToken(p.controlBucket, CONTROL_HZ, p.seenAt, CONTROL_BURST)) return;
    }
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
      if (p.inHub && p.id !== this.hostId && this.lastNpc) this.send(p.ws, this.lastNpc);
    } else if (msg.t === "visible") {
      // A page hidden in a Block Frenzy match hands its hosting on; shown again, it comes back a guest (block.js).
      if (msg.on === p.visible) return;
      p.visible = msg.on;
      this.inspect.event("visible", p, { visible: msg.on });
      block.visibility(this, p);
    } else if (msg.t === "zone") {
      if (msg.name === p.zone) return;
      const room = this.roomOf(msg.name);
      if (room >= 0 && !this.mayEnter(p, room, Date.now())) { this.send(p.ws, { t: "door", op: "denied", reason: "locked" }); return; }
      if (msg.name !== DOOR_ZONE) this.cancelDoor(p);
      if (msg.name !== p.zone) this.clearPasses(p);
      const leavingStudio = p.zone === STUDIO_ZONE, from = p.zone;
      if (msg.name !== "arcade.hall") hockey.leave(this, p.id);
      if (msg.name !== BLOCK.ZONE) block.leave(this, p.id);
      p.zone = msg.name;
      this.inspect.event("zone", p, { from, to: p.zone });
      this.roomZoneChanged(p, from);
      hockey.arrive(this, p);
      block.arrive(this, p);
      p.pokerVoice = null;
      if (this.chalkEditor && this.chalkEditor.id === p.id && this.chalkRefusal(p)) this.chalkLetGo(p);
      // A crossing belongs to the zone it started from (everyone resets theirs on this broadcast). A zone that is the
      // place being crossed into turns it round, so the same places stay heard: off a crossing's far end that is none,
      // and across the arcade hallway's midpoint (#422) the same crossing seen from its other end. Else the page reports
      // its next one after its zone.
      // Between two zones of the main world it stands as it is: there a crossing is a level, whatever the zone.
      if (!BLEND.world(from) || !BLEND.world(p.zone)) {
        const across = p.blendTo && BLEND.place(p.zone) === BLEND.place(p.blendTo) && BLEND.STEPS - p.blendK > 0;
        p.blendTo = across ? BLEND.place(from) : null; p.blendK = across ? BLEND.STEPS - p.blendK : 0;
      }
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
      // Only a crossing the player's zone has (#392, `BLEND.crossable`); a step anywhere else is no crossing.
      const to = msg.to && BLEND.crossable(p.zone, msg.to) ? msg.to : null, k = to ? msg.k : 0;
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
    } else if (msg.t === "react") {
      // A reaction over a driven body, for the players who can see it to draw; nothing is kept.
      if (!p.body || !this.reactToken(p)) return;
      const out = JSON.stringify({ t: "react", id: p.id, e: msg.e });
      for (const other of this.players.values()) if (other !== p && seenTogether(other.zone, p.zone)) this.send(other.ws, out);
      return;
    } else if (msg.t === "hand") {
      if (msg.on === p.hand && (!msg.on || msg.tone === p.handTone && msg.e === p.handEmoji)) return;
      // Over the bucket the change is refused, and the sender hears the hand the room still holds, so its page never
      // shows one nobody else sees.
      if (!this.reactToken(p)) {
        this.send(p.ws, { t: "hand", id: p.id, on: p.hand, tone: p.handTone, e: p.handEmoji });
        return;
      }
      p.hand = msg.on;
      p.handTone = msg.tone;
      p.handEmoji = msg.e;
      this.broadcast({ t: "hand", id: p.id, on: p.hand, tone: p.handTone, e: p.handEmoji }, p.ws);
    } else if (msg.t === "link") {
      // Nothing in the attachment changes: asks live in storage, by account.
      return this.linkMessage(p, msg);
    } else if (msg.t === "link-all") {
      return this.linkAllMessage(p);
    } else if (msg.t === "door") {
      return this.doorMessage(p, msg);
    } else if (msg.t === "chalk") {
      return this.chalkMessage(p, msg);
    } else if (msg.t === "wallet") {
      // Nothing in the attachment changes: a room that sleeps forgets the wallets, which end within a minute anyway.
      return this.walletMessage(p, msg);
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
      for (const other of this.players.values()) if (other !== p && (arena ? watchesGhost(other) : seenTogether(other.zone, p.zone))) this.send(other.ws, out);
      return;
    } else if (msg.t === "body") {
      if (msg.name === p.body) return;
      hockey.leave(this, p.id);
      block.leave(this, p.id);
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
  webSocketClose(ws, code, reason, wasClean) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "closed", { code, said: reason, clean: wasClean });
  }

  webSocketError(ws, error) {
    const p = this.byWs(ws);
    if (p) this.drop(p, "error", { error: String((error && error.message) || error || "") });
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
    const seat = CABINETS.get(msg.id);
    if (!p.body || p.zone !== (seat.outdoor ? OUTSIDE : "arcade.hall") || p.ko) { reply("Stand in the arcade with your Ooga first"); return; }
    if (p.cabinet) { reply(p.cabinet.id === msg.id && p.cabinet.q === msg.q ? null : "You already have a cabinet open"); return; }
    for (const other of this.players.values()) if (other.cabinet?.id === msg.id) { reply("This cabinet is occupied"); return; }
    // No await between checking and assigning: concurrent requests have exactly one winner.
    const at = seat.outdoor ? CABINETS.slot(msg.slot) : seat;
    p.cabinet = { id: msg.id, q: msg.q };
    p.x = at.x; p.y = at.y; p.z = at.z; p.yaw = at.yaw; p.g = null; p.j = p.w = 0; p.v = null; p.va = 0; p.r = undefined;
    p.blendTo = null; p.blendK = 0;
    p.ws.serializeAttachment(this.attachment(p));
    this.dirty = true;
    this.scheduleFlush();
    this.sendCabinets();
    reply(null);
  }

  // `detail`: what the close said, for the inspector's line (a close code, its reason, whether it was clean).
  drop(p, reason, detail = null) {
    if (this.players.get(p.id) !== p) return;
    if (this.inspect.on) this.inspect.event("leave", p, { reason, ...detail, zone: p.zone, on: Date.now() - p.joinedAt, heard: Date.now() - this.heardAt(p), voice: inVoice(p) });
    this.releaseCabinet(p);
    hockey.leave(this, p.id);
    block.leave(this, p.id);
    this.cancelDoor(p);
    this.clearPasses(p);
    this.leaveStudio(p);
    this.chalkLetGo(p);
    this.background(this.clearVoice(p));
    this.privateLeave(p);
    this.players.delete(p.id);
    // A dropped socket can come straight back in; the last one out frees the room.
    const lockedIn = this.roomOf(p.zone), held = this.roomLocks.get(lockedIn);
    if (held) held.passes.set(p.id, Date.now() + PIN_PASS_MS);
    this.freeEmptyRoom(lockedIn);
    this.broadcast({ t: "leave", id: p.id, reason });
    this.electHost();
    this.updateVoice();
    if (!this.players.size && this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = 0;
    }
  }

  release(p, reason) {
    this.releaseCabinet(p);
    hockey.leave(this, p.id);
    block.leave(this, p.id);
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
    this.drop(p, reason, { code: CLOSE_KICK });
    this.send(p.ws, { t: "kick", reason });
    try {
      p.ws.serializeAttachment(null);
      p.ws.close(CLOSE_KICK, reason);
    } catch {
      // Already closed.
    }
  }

  // One snapshot at most every 1/TICK_HZ while poses arrive, and nothing pending once they stop, so the
  // room can hibernate between bursts (a running interval would keep it awake, and billed, for good).
  scheduleFlush() {
    if (this.flushTimer) return;
    this.flushDue = Date.now() + 1000 / TICK_HZ;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = 0;
      // How late the timer fired: the room's one sign of being too busy to keep its own pace.
      this.inspect.peak("late", Date.now() - this.flushDue);
      this.snapshot();
      this.inspect.tick();
    }, 1000 / TICK_HZ);
  }

  snapshot() {
    if (!this.dirty) return;
    this.dirty = false;
    this.inspect.count("snapshots");
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
      if (!q) return tell(p, { op: "refused", to, reason: "offline" });
      if (!q.pm.inv.includes(p.id)) return tell(p, { op: "refused", to, reason: "withdrawn" });
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

  // A player leaving ends their conversation and every invite to or from them, each told it was a leave, not a no.
  privateLeave(p) {
    for (const q of this.players.values()) {
      if (q === p) continue;
      let changed = false;
      if (q.pm.open === p.id) { q.pm.open = 0; changed = true; this.send(q.ws, { t: "pm", op: "closed", from: p.id, reason: "left" }); }
      if (q.pm.inv.includes(p.id)) { q.pm.inv = q.pm.inv.filter((id) => id !== p.id); changed = true; this.send(q.ws, { t: "pm", op: "declined", from: p.id, reason: "left" }); }
      if (p.pm.inv.includes(q.id)) this.send(q.ws, { t: "pm", op: "withdrawn", from: p.id, reason: "left" });
      if (changed) this.saveAttachment(q);
    }
  }

  saveAttachment(p) { p.ws.serializeAttachment(this.attachment(p)); }

  sendLinks(p, refused, all, n) { this.send(p.ws, { t: "links", ...linkView(this.links, p.id), ...(refused ? { refused } : {}), ...(all ? { all, n } : {}) }); }

  saveLinks() { if (this.ctx && this.ctx.storage) this.background(this.ctx.storage.put("voiceLinks", storedLinks(this.links))); }

  // One player asking for a voice link or taking their ask back. Only the asker is told, unless that made or broke a
  // link: then the other is told too, and who hears whom changes (`enforceStudio` closes what may no longer be heard).
  linkMessage(p, msg) {
    if (msg.to === p.id) return;
    if (!p.linkBucket) p.linkBucket = { tokens: LINK_BURST, at: p.seenAt };
    if (!takeToken(p.linkBucket, LINK_HZ, p.seenAt, LINK_BURST)) return;
    const wants = this.links.get(p.id);
    if (!!wants?.has(msg.to) === msg.on) return;
    if (msg.on && !this.players.has(msg.to)) return;
    if (msg.on && (wants ? wants.size >= LINK_WANTS : this.links.size >= LINK_ACCOUNTS)) return this.sendLinks(p, "full");
    const was = voiceLinked(this.links, p.id, msg.to);
    if (!msg.on) {
      wants.delete(msg.to);
      if (!wants.size) this.links.delete(p.id);
    } else if (wants) wants.add(msg.to);
    else this.links.set(p.id, new Set([msg.to]));
    this.saveLinks();
    this.sendLinks(p);
    if (was === voiceLinked(this.links, p.id, msg.to)) return;
    const q = this.players.get(msg.to);
    if (q) this.sendLinks(q);
    this.enforceStudio();
  }

  // The L key: link with everyone in the room who has asked this player and has not been asked back, as far as the
  // limits allow, or with nobody waiting take back every ask of this player's. One token, however many it changes; only
  // those whose link was made or broken are told.
  linkAllMessage(p) {
    if (!p.linkBucket) p.linkBucket = { tokens: LINK_BURST, at: p.seenAt };
    if (!takeToken(p.linkBucket, LINK_HZ, p.seenAt, LINK_BURST)) return;
    let wants = this.links.get(p.id);
    const waiting = [];
    for (const id of this.players.keys()) if (id !== p.id && this.links.get(id)?.has(p.id) && !wants?.has(id)) waiting.push(id);
    if (waiting.length) {
      if (!wants && this.links.size >= LINK_ACCOUNTS) return this.sendLinks(p, "full");
      if (!wants) this.links.set(p.id, wants = new Set());
      const fits = waiting.slice(0, LINK_WANTS - wants.size);
      for (const id of fits) wants.add(id);
      if (!fits.length) return this.sendLinks(p, "full");
      this.saveLinks();
      this.sendLinks(p, fits.length < waiting.length ? "full" : undefined, "linked", fits.length);
      for (const id of fits) this.sendLinks(this.players.get(id));
    } else if (wants) {
      const broken = [...wants].filter((id) => voiceLinked(this.links, p.id, id));
      this.links.delete(p.id);
      this.saveLinks();
      this.sendLinks(p, undefined, "unlinked", wants.size);
      for (const id of broken) { const q = this.players.get(id); if (q) this.sendLinks(q); }
    } else return this.sendLinks(p, undefined, "none", 0);
    this.enforceStudio();
  }

  // An account deleted (`DELETE /api/me`, through the Worker's binding alone): its asks, and every ask of it, go.
  async forgetVoiceLinks(id) {
    const told = [];
    let changed = this.links.delete(id);
    for (const [other, wants] of this.links) {
      if (!wants.delete(id)) continue;
      changed = true;
      told.push(other);
      if (!wants.size) this.links.delete(other);
    }
    if (!changed) return;
    await this.ctx.storage.put("voiceLinks", storedLinks(this.links));
    for (const other of told) { const p = this.players.get(other); if (p) this.sendLinks(p); }
    this.enforceStudio();
  }

  // One bucket a record for reactions and the hand, made full on first use.
  reactToken(p) {
    if (!p.reactBucket) p.reactBucket = { tokens: REACT_BURST, at: p.seenAt };
    return takeToken(p.reactBucket, REACT_HZ, p.seenAt, REACT_BURST);
  }

  // Also after any page's `hub` flag changes: the host sends frames only while someone follows.
  electHost() {
    const id = electHost(this.players.values(), this.hostId);
    const followers = npcFollowers(this.players.values(), id);
    if (id === this.hostId && followers === this.followers) return;
    if (this.inspect.on && id !== this.hostId) this.inspect.event("host", null, { login: id ? this.players.get(id).login : "", followers });
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
    const desired = this.voicePlan();
    // Who hears a speaker without publishing is on no list of the speaker's own, so count them for it.
    const quiet = new Map();
    for (const q of this.players.values()) if (q.voice.sub && !q.voice.track) for (const id of desired.get(q.id) || []) quiet.set(id, (quiet.get(id) || 0) + 1);
    for (const p of this.players.values()) {
      const peers = desired.get(p.id) || [];
      const reopened = p.voice.reopened || {}, gens = peers.map((id) => (this.players.get(id).voice.gen || 0) + (reopened[id] || 0));
      // Receiving attendees do not publish tracks. Their receive sessions, rather
      // than the list of speakers this player hears, keep a Studio microphone live.
      // A linked partner's does too, wherever that partner is, since it hears from anywhere.
      let listeners;
      if (p.zone === STUDIO_ZONE) {
        listeners = 0;
        for (const q of this.players.values()) if (q !== p && q.voice && q.voice.sub && (q.zone === STUDIO_ZONE || voiceLinked(this.links, p.id, q.id))) listeners++;
      }
      // Someone back from an earlier session with the microphone closed, or a linked partner in a Studio audience.
      const ears = p.zone === STUDIO_ZONE ? 0 : quiet.get(p.id) || 0;
      const sig = peers.map((id, i) => `${id}:${gens[i]}`).join(",") + (listeners === undefined ? "" : `|${listeners}`) + (ears ? `+${ears}` : "");
      if (p.sent === sig) continue;
      p.sent = sig;
      p.ws.serializeAttachment(this.attachment(p));
      this.send(p.ws, { t: "voice", peers, gens, ...(listeners === undefined ? {} : { listeners }), ...(ears ? { ears } : {}) });
    }
  }

  voicePlan() { return voicePeers([...this.players.values()], this.studio, this.links); }

  // Every other page's roster shows who is in voice (a live microphone) and who muted it: sent on a change only.
  voiceState(p) {
    this.broadcast({ t: "vstate", id: p.id, voice: inVoice(p), muted: p.muted }, p.ws);
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
    if (op === "ice") {
      if (!ownedBody(CAST, p.login, p.contributor, p.id)) {
        this.evict(p, "revoked");
        return new Response(JSON.stringify({ error: "contributors with an Ooga only" }), { status: 403, headers: { "cache-control": "no-store", "content-type": "application/json" } });
      }
      // Authenticated and rate-limited at the Worker, then bound to the current room connection.
      // Keep minting out of the SFU operation queue so a relay outage cannot hold up voice signalling.
      const data = await turnCredentials(this.env).catch(() => null);
      if (this.players.get(p.id) !== p || p.connectionToken !== request.headers.get("x-room-token"))
        return new Response(null, { status: 409, headers: { "cache-control": "no-store" } });
      return new Response(JSON.stringify(data || {}), { headers: {
        "cache-control": "no-store", "content-type": "application/json", "x-content-type-options": "nosniff",
      } });
    }
    const result = (p.voiceQueue || Promise.resolve()).catch(() => {}).then(() => this.voiceOperation(op, request, p));
    if (this.inspect.on) result.then((res) => {
      this.inspect.count("voiceOps");
      // A failed SFU call has its own line (`voice-fail`); refusals by the room are counted and logged here.
      if (res.status >= 400 && res.status !== 502) {
        this.inspect.count("voiceRefused");
        if (res.status !== 409) res.clone().json().then((data) => this.inspect.event("voice-refused", p, { op, status: res.status, error: String(data.error || "") })).catch(() => {});
      }
    }, () => {});
    p.voiceQueue = result.then(() => {}, () => {});
    // A browser timeout must not cancel the work that later requests are queued behind.
    this.background(p.voiceQueue);
    return result;
  }

  async voiceOperation(op, request, expected) {
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    const started = Date.now();
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
    const was = inVoice(p);
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
        if (was !== inVoice(p)) this.voiceState(p);
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
        if (was !== inVoice(p)) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "pull") {
        if (!p.voice.sub || !Array.isArray(body.ids)) return json({ error: "bad pull" }, 400);
        const allowed = new Set(this.voicePlan().get(p.id) || []);
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
        const allowedNow = live ? new Set(this.voicePlan().get(p.id) || []) : new Set();
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
        if (was !== inVoice(p)) this.voiceState(p);
        return json({ ok: true });
      }
      if (op === "leave") {
        // A page restarting its voice says why (voice.js), so a dropped connection is told from someone leaving voice.
        if (body.why === "failed" || body.why === "disconnected") this.inspect.event("voice-restart", p, { why: body.why });
        await this.clearVoice(p);
        p.ws.serializeAttachment(this.attachment(p));
        this.updateVoice();
        if (was !== inVoice(p)) this.voiceState(p);
        return json({ ok: true });
      }
      return json({ error: "unknown voice op" }, 404);
    } catch (err) {
      // Return a bounded public error; SDP and upstream session identifiers never enter logs, nor the inspector's line,
      // which keeps the SFU's status and error code alone.
      if (this.inspect.on) this.inspect.event("voice-fail", p, { op, status: Number.isInteger(err && err.status) ? err.status : 0, code: String((err && err.code) || (err && err.name) || ""), ms: Date.now() - started });
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
      this.background(this.ctx.storage.put("chalk", { marks: this.chalk.marks, v: CHALK.VERSION }));
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
    const desired = this.voicePlan();
    for (const p of this.players.values()) {
      const allowed = new Set(desired.get(p.id));
      const mids = Object.keys(p.voice.mids || {}).filter(mid => !allowed.has(p.voice.mids[mid]));
      if (mids.length) {
        this.background(this.queueClose(p.voice.sub, mids));
        // The page cannot see this close: a speaker back in its list with the same publication must still read as new, or it is never pulled again.
        const reopened = p.voice.reopened ||= {};
        for (const id of Object.keys(reopened)) if (!this.players.has(Number(id))) delete reopened[id];
        for (const mid of mids) { reopened[p.voice.mids[mid]] = (reopened[p.voice.mids[mid]] || 0) + 1; delete p.voice.mids[mid]; }
        p.ws.serializeAttachment(this.attachment(p));
      }
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
    if (deferred) this.background(this.retryCleanup(session, true));
    else await this.retryCleanup(session);
  }

  async retryCleanup(session = null, background = !session) {
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
        this.cleanupAttempt = { at: Date.now(), operation: job.inspect ? "inspect" : "close", finished: 0, status: 0 };
        const attempt = this.cleanupAttempt;
        try {
          const revision = job.revision || 0;
          let inspected = !job.inspect;
          if (job.inspect) {
            const priorVersions = { ...(job.midVersions || {}) };
            try {
              const state = await this.sfu.getSession(job.session, background);
              const inactive = new Set((state.tracks || []).filter(t => t.status === "inactive").map(t => t.mid));
              job.mids = job.mids.filter(mid => !inactive.has(mid) || (job.midVersions || {})[mid] !== priorVersions[mid]);
              // Only a session nobody holds any more is swept for what is left. On a live one that would close every voice
              // it still receives, with no page any the wiser: one listener gone deaf to everybody.
              const held = [...this.players.values()].some(p => p.voice.sub === job.session || p.voice.pub === job.session);
              if (!held) job.mids = [...new Set(job.mids.concat((state.tracks || []).filter(t => t.status !== "inactive" && typeof t.mid === "string").map(t => t.mid)))];
              inspected = true;
            } catch (err) {
              attempt.status = Number(err.status) || 0;
              if (sfuSessionGone(err)) throw err;
              // An inspection timeout must not prevent closing MIDs we already own. Keep the inspection pending,
              // even if those closes succeed: the timed-out allocation may still have left other tracks behind.
            }
          }
          const mids = job.mids.slice();
          const versions = { ...(job.midVersions || {}) };
          if (mids.length) attempt.operation = "close";
          const res = mids.length ? await this.sfu.closeTracks(job.session, mids, background) : { tracks: [] };
          // Cloudflare's close_track_error confirms an absent/already-closed track. Other errors and missing rows retry.
          const succeeded = new Set((Array.isArray(res.tracks) ? res.tracks : []).filter(t => t && typeof t.mid === "string" && (!t.errorCode || t.errorCode === "close_track_error")).map(t => t.mid));
          job.mids = job.mids.filter(mid => !succeeded.has(mid) || (job.midVersions || {})[mid] !== versions[mid]);
          for (const mid of succeeded) if (!job.mids.includes(mid) && job.midVersions) delete job.midVersions[mid];
          // A close this pass sent that the SFU did not confirm; a mid queued while it was on its way is simply next.
          if (mids.some(mid => job.mids.includes(mid))) job.inspect = true;
          // A concurrent queue may have appended/reallocated owned MIDs while upstream was pending.
          if (!inspected || (job.revision || 0) !== revision || job.mids.length || (job.inspect && Date.now() < job.inspectUntil)) continue;
          this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1);
        } catch (err) {
          attempt.status = Number(err.status) || 0;
          // A confirmed absent upstream session owns no tracks and needs no further retry.
          if (sfuSessionGone(err)) this.cleanupJobs.splice(this.cleanupJobs.indexOf(job), 1);
          // Other failures retain ownership for the existing room alarm.
        } finally { attempt.finished = Date.now(); tasks.delete(job.session); finished(); }
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
    this.alarmRegisteredAt = set;
    const now = Date.now();
    // An old registered deadline is not proof that its callback will run: platform retries are finite. A wake or
    // new cleanup job repairs an alarm overdue by a sweep interval instead of preserving that stale deadline forever.
    if (set === null || set > next || set < now - SWEEP_MS) {
      this.alarmRegisteredAt = Math.max(next, now);
      await this.ctx.storage.setAlarm(this.alarmRegisteredAt);
    }
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
    this.alarmStarted = Date.now();
    hockey.sweep(this);
    block.sweep(this);
    // Cleanup retries run on every wake, not only at sweep time.
    await this.retryCleanup();
    // A full retry pass can outlast a sweep interval. Advance from completion, not the old start time.
    const now = Date.now();
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
    if (next !== null) { await this.ctx.storage.setAlarm(next); this.alarmRegisteredAt = next; }
    this.alarmFinished = Date.now();
    this.inspect.tick();
  }

  // When the room last heard from a player: a message, or a ping the runtime answered without waking it.
  heardAt(p) {
    const pinged = this.ctx.getWebSocketAutoResponseTimestamp(p.ws);
    return Math.max(p.seenAt, pinged ? pinged.getTime() : 0);
  }

  // The room as the inspector shows it; `detail` adds a row per player while someone watches. No positions, chat,
  // tokens, session descriptions or SFU ids.
  inspectState(detail) {
    const zones = {}, rows = detail ? [] : undefined;
    let hub = 0, hidden = 0, driving = 0, speaking = 0, listening = 0, pulled = 0, maxPulled = 0, attachMax = 0;
    for (const p of this.players.values()) {
      zones[p.zone] = (zones[p.zone] || 0) + 1;
      if (p.inHub) hub++;
      if (!p.visible) hidden++;
      if (p.body) driving++;
      const hears = Object.keys(p.voice.mids || {}).length, voice = p.voice.track ? "speaking" : p.voice.sub ? "listening" : "off";
      if (voice === "speaking") speaking++; else if (voice === "listening") listening++;
      pulled += hears;
      maxPulled = Math.max(maxPulled, hears);
      if (!detail) continue;
      attachMax = Math.max(attachMax, JSON.stringify(this.attachment(p)).length);
      rows.push({ id: p.id, login: p.login, zone: p.zone, body: p.body || null, hub: p.inHub, visible: p.visible, since: p.joinedAt,
        heard: this.heardAt(p), voice, muted: p.muted, pulled: hears, host: p.id === this.hostId });
    }
    const host = this.players.get(this.hostId);
    return { status: this.players.size ? "live" : "empty", players: this.players.size, maxPlayers: MAX_PLAYERS, sockets: this.ctx.getWebSockets().length,
      zones, hub, hidden, driving, host: host ? host.login : null, followers: this.followers, speaking, listening, pulled, maxPulled, pullCap: 64,
      cleanup: this.cleanupJobs.length, cleanupCap: 64, doors: this.doorQueue.length + (this.doorActive ? 1 : 0), tickHz: TICK_HZ,
      cleanupAttempt: this.cleanupAttempt || null, cleanupBusy: this.cleanupTasks ? this.cleanupTasks.size : 0,
      alarmStarted: this.alarmStarted || 0, alarmFinished: this.alarmFinished || 0,
      alarmRegisteredAt: this.alarmRegisteredAt || 0,
      flushPending: !!this.flushTimer, alarmAt: this.nextAlarm(), attachMax: detail ? attachMax : undefined, rows };
  }

  // The Inspector, when a viewer connects: report now, with the rows.
  inspectWatch(until) {
    this.inspect.watch(until);
  }
}
