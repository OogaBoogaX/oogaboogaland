import "../../src/js/arcade-cabinets.js";
export const CABINETS = globalThis.BL.arcadeCabinets;
export { hockey } from "./hockey.js";
import "../../src/js/hockey-wire.js";
export const HOCKEY = globalThis.BL.hockeyWire;
import { parseStudioCommand, studioCanSpeak, STUDIO_ZONE } from "./studio-policy.js";
import "../../src/js/chat-policy.js";
import "../../src/js/contributor-identities.js";
import "../../src/js/chalk-board.js";
import "../../src/js/voice-blend.js";
// The room's wire format and the limits it enforces, as pure functions the tests can reach.
//
// Client → room:  { t: "pose", x, y, z, yaw }   the driven body's feet and heading, at most MOVE_HZ
//                 { t: "body", name }            Ooga handle, `gorilla:<handle>` for its companion, or null
//                 { t: "zone", name }            where that body is (see Zones below)
//                 { t: "poker-voice", table }   0-9 while watching a table, null for the Ember Den floor
//                 { t: "blend", to, k }          crossing toward voice group `to`, k of BLEND.STEPS along (null, 0: none)
//                 { t: "hub", on }               this page shows the island and is visible (host candidates)
//                 { t: "visible", on }           HALLOWEEN: this page is visible (the ghost arena's host candidates)
//                 { t: "mute", on }              this page muted its own microphone, for everyone's roster
//                 { t: "hp", v, ko }             the driven body's health (normalized 0-100) and knockout flag
//                 pose.g                         optional gorilla locomotion: [flags, speed, stride, climb, side, swim]
//                 pose.j                         optional jetpack, for drawing only: 1 while an Ooga wears one, plus its
//                                                flame's power (0-3) times 2; absent is none
//                 pose.w                         optional weapons, for drawing only: the one in an Ooga's hand (1 its
//                                                primary, 2 the gun), 4 while aiming, plus the gun's rounds (0-31) times 8
//                 { t: "shot", a }               a banana the driven Ooga fired: [from x, y, z, to x, y, z]
//                 { t: "swing" }                 the driven Ooga's melee strike
//                 { t: "chat", text, clientId? }            a line for Ooga Chat (see Chat below)
//                 { t: "studio", action, playback?, commandId?, ... }  a DSB Studio seat or host command; transport
//                                checks `playback` against the state's playbackRevision
//                                (`parseStudioCommand` in studio-policy.js; see docs/dsb-studio-session.md)
//                 { t: "ghost", k, g?, d?, h? }  HALLOWEEN: the ghost hunt's `start`, `ready`, `pause` or `leave`, or `hits` h, for its
//                                host, from a page in the arcade's ghost arena
//                 { t: "thump" }                 a voice participant's Ooga thump (see Thumps below); no other field
//                 { t: "chalk", k, ... }        the EntropyLab chalkboard: `take` or `drop` the board, or an edit by
//                                                whoever holds it (chalk-board.js; see CHALK_HZ below)
//                 { t: "wallet", k, u, ... }   DSB Land: one of the driven Ooga's free hardware wallets taken, set
//                                                down, picked up, thrown or blown (see WALLET_CAP below)
//                 binary                         the NPC host's frame of every Ooga's pose, relayed as is; or,
//                                                led by GHOST_MAGIC, the ghost arena host's hunt state
// Room → client:  welcome { you, players, tickHz, now, loopEpoch, connectionToken }, join { p }, leave { id, reason },
//                 body { id, name }, state { now, ps: [id, x, y, z, yaw, ...], gs?, js? }, kick { reason },
//                 state.gs                       gorilla locomotion in [id, ...g] runs; welcome/join carry g too
//                 state.js                       [id, j] pairs for every player with a jetpack; anyone else in ps has
//                                                none; welcome/join carry j too
//                 state.ws                       [id, w] pairs for every player holding a weapon, the same way
//                 shot { id, a }, swing { id }   another player's shot or strike, to the players in their zone
//                 release { name, reason }   the Ooga this socket claimed is not, or no longer, its to drive
//                 host { id, followers }     who runs the NPCs now (0 for nobody) and how many pages follow
//                                            them (a host with none sends nothing); binary NPC frames from them
//                 vstate { id, voice, muted }  a player's microphone went live or off, or they muted it; welcome
//                                            and join carry the same two fields on every player, and hp and ko
//                 hp { id, v, ko }           a player's driven Ooga's health changed
//                 blend { id, to, k }        a player's crossing changed; welcome and join carry blendTo and blendK
//                 voice { peers, gens }      whom to hear, and each one's publication count (a new count is a
//                                            microphone published again, to be pulled again); in the Studio also
//                                            `listeners`, the other receive sessions there
//                 studio-state { state }     the Studio's host, mode, program anchor, seats and this page's own
//                                            rights; studio-result { action, commandId, ok, error, revision }
//                                            answers a command; studio-mic-revoked: drop the microphone now
//                 chat { id, at, login, name, text }  a line someone said, to everyone, the sender too
//                 chat-ack { clientId }     the sender's line was accepted, including a recognized retry
//                 chat-rejected { clientId?, reason }  refused; rate retries keep the same id
//                 chat-history { messages }  after welcome: the lines the room still holds, oldest first
//                 chalk-board { marks, editor }  after welcome: the chalkboard as the room holds it, and who holds it
//                 chalk-lock { id }          who holds the chalkboard now (0 for nobody), to everyone
//                 chalk { id, k, ... }       the holder's edit, to everyone else; chalk-refused { why, name? } to a
//                                            page whose take was refused (`away`, `busy` with the holder's name)
//                 wallet { k, w }            another player's wallet event, to their zone: `w` is the wallet as
//                                            [id, u, look, state, x, y, z, vx, vy, vz, at, end], state "c" carried,
//                                            "d" set down or "f" thrown, at and end on the room's clock;
//                                            wallet { k: "blast", id, u } their wallets that went off together.
//                                            wallets { list } on entering a DSB zone: the live wallets there, each a w
//                 ghost { k, g, d, from }    HALLOWEEN: a follower's start or hit, relayed to its hunt's host alone
//                 ghost-host { id, followers }  who runs the ghost arena's hunt (0 for nobody) and how many pages in
//                                            the arena follow it; welcome carries ghostHost and ghostFollowers; binary
//                                            frames led by GHOST_MAGIC from it, to pages in the arena
//                 thump { id, a? }           player `id` thumped: sent only to those voice places them with, never the
//                                            sender; `a: 1` when this recipient would hear the sender's voice
// Zones: `<group>` or `<group>.<place>`. Voice is shared within a group; who is shown is matched on the whole
// name, since a place inside a group can have coordinates of its own (the Factory's tunnel on the island and
// its hall). `none` is nowhere: off the island's edge, or between scenes; it shares voice with nobody.
// Chat: one conversation for the whole island. The room names the speaker from the session (`login`, and
// `name`, their display name), never from the frame, keeps the last CHAT_KEEP lines in memory alone (never
// storage: a room that sleeps, restarts or is redeployed has forgotten them) and hands them to each socket
// that joins. A line is CHAT_MAX UTF-16 units at most under the shared chat policy. A chat frame gets its own size
// limit: one that starts with CHAT_PREFIX, as the page sends it, may run to CHAT_FRAME_MAX and is ignored past
// it, so a long line is dropped rather than closing the socket; every other frame keeps MESSAGE_MAX.
// Thumps: a reaction in voice instead of unmuting to say "yes!". Taken only from a current voice participant (a receive
// session, as `voicePeers` counts a listener: talking or listen-only) and relayed as `{"t":"thump","id":N}` to every
// other voice participant who shares a voice place with them either way (`thumpPeers`: the zone group or a crossing's
// share of it, and in the Ember Den the table, by the same predicates as `voicePeers`), so other tables, other places
// and `none` never see it. Each copy also says whether its recipient would hear the sender's voice there (`a: 1`,
// `thumpAudible`): not where the DSB Studio keeps the sender from speaking, as it does its audience. The page shows every
// thump it is sent and sounds only those, within its own hearing range and mutes. A frame with any other field is
// ignored. Each account spends a bucket of THUMP_HZ a second bursting to THUMP_BURST
// (`takeToken`); buckets live in memory alone, at most THUMP_BUCKET_KEEP, and an absent account's full bucket is
// dropped when the next one is made (`thumpBucketFor`). No timer, alarm, storage, reply or history: a dropped thump is
// simply not relayed. The page draws everything.
// "ping" answers "pong" without waking the room (setWebSocketAutoResponse).

export const TICK_HZ = 15;
export const MOVE_HZ = 20;
export const MAX_PLAYERS = 32;
export const MESSAGE_MAX = 256;
// The sweep only catches half-open sockets (a clean disconnect closes at once), and every alarm wakes the
// room, so it runs once a minute; three missed 10 s pings make a socket stale.
export const STALE_MS = 90000;
export const SWEEP_MS = 60000;
// Voice cleanup the SFU keeps refusing is given up after an hour, so a room nobody is in stops waking for it.
export const CLEANUP_MS = 3600000;
// Generous bounds around the hub: jetpack flight reaches about 140 out and 72 up, falls end at -120.
export const BOUND_XZ = 160;
export const BOUND_Y_MIN = -130;
export const BOUND_Y_MAX = 100;
export const BODY_NAME = /^(?:gorilla:)?[A-Za-z0-9_.-]{1,40}$/;
export const bodyName = (body) => typeof body === "string" && body.startsWith("gorilla:") ? body.slice(8) : body;
export const ZONE_NAME = /^[a-z0-9-]{1,24}(\.[a-z0-9-]{1,16})?$/;
export const OUTSIDE = "outside";
export const NOWHERE = "none";
// Health reports: a fight sends a few a second at most; at full health nothing is sent.
export const HP_HZ = 4;
// Voice across a crossing (#392, src/js/voice-blend.js): a page sends its step along one a few times a second at most.
export const BLEND = globalThis.BL.voiceBlend;
export const BLEND_HZ = 8;
// Close codes: 4000 follows a `kick` (replaced, stale, full); 4400 is a message the room cannot read.
export const CLOSE_KICK = 4000;
// NPC frames: the host sends about 4 a second, only while a page follows; a frame of every Ooga's pose is a few kilobytes.
// Up to 128 bundled Oogas (112 floats each), plus the bounded event tail.
// The former 16 KiB cap could not carry the org-wide roster after reconciliation.
export const NPC_FRAME_MAX = 128 * 112 * 4 + 131072;
export const NPC_HZ = 20;
export const CLOSE_PROTOCOL = 4400;
export const CHAT_MAX = globalThis.BL.chatPolicy.MAX;
export const CHAT_FEATURE = globalThis.BL.chatPolicy.FEATURE;
export const CHAT_KEEP = 100;
// Accepted retry ids survive reconnects while this room instance holds them; oldest ids expire at the cap.
export const CHAT_RETRY_KEEP = CHAT_KEEP * MAX_PLAYERS;
// About one line a second per player, three in a burst.
export const CHAT_HZ = 1;
export const CHAT_BURST = 3;
// Active accounts plus bounded reconnect debt, held only while the room is awake.
export const CHAT_BUCKET_KEEP = MAX_PLAYERS * 2;
// Thumps: about two a second per player, three in a burst; active accounts plus bounded reconnect debt.
export const THUMP_HZ = 2;
export const THUMP_BURST = 3;
export const THUMP_BUCKET_KEEP = MAX_PLAYERS * 2;
// The page sends `{"t":"chat","text":…}` with its text already sanitized, under MESSAGE_MAX; the margin is
// for a page that sends it raw (every character escaped as \uXXXX is six).
export const CHAT_PREFIX = '{"t":"chat",';
export const CHAT_FRAME_MAX = 1024;
// The Sphere's one exterior doorway is a short, server-leased FIFO. Room door transits are independent
// announcements inside exactly one numbered room. Alarms, rather than timers, expire both while idle.
export const DOOR_ZONE = "sphere";
export const DOOR_ROOM = /^sphere-([1-9])$/;
export const DOOR_CYCLE = /^[A-Za-z0-9_-]{1,64}$/;
export const DOOR_GRANT_MS = 5000;
export const DOOR_TRANSIT_MS = 12000;
export const DOOR_PASS_MS = 8000;
export const DOOR_HZ = 4;
export const DOOR_BURST = 6;
// HALLOWEEN: the arcade's ghost hunt's reports to its host: a follower's hits, every target's summed damage a tenth of a second
// at a time in one `hits` report (up to 60 a target), so any mix of rifle and monkey fire stays at ten reports a second;
// the rest of the budget is for a start or pause.
// A driven Ooga's own shots and strikes, relayed for drawing only (nothing is hit and nothing is kept): a burst is
// three bananas 0.09 s apart, every 0.44 s at most, and a shot never flies past SHOT_RANGE.
export const SHOT_HZ = 12;
export const SHOT_BURST = 6;
export const SHOT_RANGE = 120;
export const SWING_HZ = 4;
export const SWING_BURST = 4;
export const GHOST_HZ = 20;
export const GHOST_BURST = 24;
// Chalkboard: the EntropyLab board on the island, kept for good. One page at a time holds it, and only while its
// Ooga stands at the board in the island's `outside` zone (chalk-board.js `near`, against the last pose it sent);
// moving off, changing zone or body, or leaving lets it go. A holder silent for CHALK_IDLE_MS can be taken over by the
// next Ooga to ask, so nobody holds it for good, with no timer. Edits arrive batched (a line's points, typed
// characters) at most CHALK_HZ a second. An edit over the rate is dropped unanswered; one that does not apply, or one
// from a holder whose earlier edits were dropped, sends the holder the board as the room has it instead (CHALK_TELL_MS). The board goes to storage at most every CHALK_SAVE_MS while someone writes, at
// once on a wipe, and when the holder lets go, never for each point.
export const CHALK_HZ = 30;
export const CHALK_BURST = 30;
export const CHALK_IDLE_MS = 60000;
export const CHALK_SAVE_MS = 5000;
// A board sent back to correct a page (an edit that did not apply, or one from a page without the board) reaches that
// page at most once every CHALK_TELL_MS, so no stream of edit frames makes the room send a full board for each.
export const CHALK_TELL_MS = 2000;
export const CHALK = globalThis.BL.chalkBoard;
export const CHALK_FEATURE = CHALK.FEATURE;
// DSB Land's free hardware wallets (wallet-bombs.js): every page runs its own visitor's devices, and the room passes
// their events to the pages in the same zone, keeping each player's live ones (WALLET_CAP at most) for whoever joins
// or walks into that zone later. A device is `u` (1-65535, the page's own number for it), its look `l`, and with
// every event the owner's seconds left on its fuse `f`, which the room turns into `end` on its own clock, so every
// page counts it down together. `take` (carried), `down` at x, y, z, `up` (carried again), `throw` from x, y, z at
// vx, vy, vz, and `blast` (the owner's devices that went off together, `u` a list). Nothing is hit or kept past a
// device's end; drawing only.
export const WALLET_CAP = 8;
export const WALLET_HZ = 8;
export const WALLET_BURST = 8;
export const WALLET_FUSE_MAX = 60;
const walletId = (u) => Number.isInteger(u) && u >= 1 && u <= 65535;
// A follower's batch: up to GHOST_BATCH targets, each a ghost id (0 the boss) and its summed damage, as one report.
export const GHOST_BATCH = 16;
// The arcade's ghost arena runs its own hunt: its pages (zone `ghost-arena`, Ghost Hunter's Arena, a voice region of its
// own (#422) whether a hunt runs or not; `arcade-hunt` from a page loaded before #422) elect a ghost host of their own,
// follower reports from the arena go to it, and it sends the hunt's
// state as a binary frame led by GHOST_MAGIC ("GHST"), up to GHOST_FRAME_MAX bytes and GHOST_FRAME_HZ a second, which
// the room hands to every other page in the arena and keeps for the next to walk in. Only a visible page may host
// (`ghostCandidate`): a hidden one runs no frames, so it would send nothing while every follower's hunt froze. The
// arena's hallway watches, both its halves (`arcade.haunt` toward the hall, `ghost-arena.haunt` toward the arena): its
// pages hear the frames and count as followers, so a spectator walked out sees and hears the hunt through the fence,
// but they neither host nor report to the host (`watchesGhost`). `arcade.arena` is the arena's zone before #422, kept
// for a page loaded before it.
export const GHOST_ARENA_ZONES = ["ghost-arena", "arcade-hunt", "arcade.arena"];
export const GHOST_WATCH_ZONES = [...GHOST_ARENA_ZONES, "arcade.haunt", "ghost-arena.haunt"];
export const inGhostArena = (p) => GHOST_ARENA_ZONES.includes(p.zone);
export const watchesGhost = (p) => GHOST_WATCH_ZONES.includes(p.zone);
export const ghostCandidate = (p) => p.visible && inGhostArena(p);
export const GHOST_MAGIC = 0x54534847;
export const GHOST_FRAME_MAX = 65536;
export const GHOST_FRAME_HZ = 5;
export const GHOST_FRAME_BURST = 6;
const ghostHit = (g, d) => Number.isInteger(g) && g >= 0 && g < 65536 && Number.isInteger(d) && d >= 1 && d <= 60;
const ghostHits = (h) => {
  if (!Array.isArray(h) || h.length < 2 || h.length > GHOST_BATCH * 2 || h.length % 2) return null;
  for (let i = 0; i < h.length; i += 2) if (!ghostHit(h[i], h[i + 1])) return null;
  return { t: "ghost", k: "hits", h: h.slice() };
};
// Compatibility name: invalid chat is refused, never stripped or truncated. Same policy as the page.
export const sanitizeChat = (text) => globalThis.BL.chatPolicy.error(text) ? "" : globalThis.BL.chatPolicy.text(text);

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v) => Math.round(v * 1000) / 1000;
// pose.v: centiradian head/aim angles, ownership/action flags and millisecond animation phases.
export const VISUAL_LIMITS = [157, 157, 314, 8191, 240, 1200, 560, 440, 320, 1240, 100, 750, 1300, 280, 2000, 31, 31];
export const validVisual = (v) => Array.isArray(v) && v.length === VISUAL_LIMITS.length
  && v.every((n, i) => Number.isInteger(n) && n >= (i < 3 ? -VISUAL_LIMITS[i] : 0) && n <= VISUAL_LIMITS[i]);

// pose.r: no rest (0), or seat, phase (entry/rest/exit), progress byte and the body's
// signed quaternion xyz at 1/1000; nonnegative w is reconstructed by the renderer.
export const validRest = r => r === 0 || Array.isArray(r) && r.length === 6
  && r.every(Number.isInteger) && r[0] === 0 && r[1] >= 1 && r[1] <= 3 && r[2] >= 0 && r[2] <= 255
  && Math.abs(r[3]) <= 1000 && Math.abs(r[4]) <= 1000 && Math.abs(r[5]) <= 1000
  && r[3] ** 2 + r[4] ** 2 + r[5] ** 2 <= 1002001;

/** A parsed client message, `null` for one to ignore, or `false` for one that should close the socket. */
export const parseClientMessage = (text) => {
  if (typeof text !== "string") return false;
  if (text.length > MESSAGE_MAX) {
    if (!text.startsWith(CHAT_PREFIX)) return false;
    if (text.length > CHAT_FRAME_MAX) return null;
  }
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return false;
  }
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return false;
  // Only chat earns the longer frame: a repeated key could make a chat-prefixed frame parse as anything.
  if (text.length > MESSAGE_MAX && msg.t !== "chat") return false;
  if (msg.t === "cabinet") return CABINETS.get(msg.id) && (msg.op === "take" || msg.op === "leave") && Number.isSafeInteger(msg.q) && msg.q > 0
    ? { t: "cabinet", op: msg.op, id: msg.id, q: msg.q } : null;
  if (msg.t === "hockey") return HOCKEY.parse(msg);
  if (msg.t === "studio") return parseStudioCommand(msg);
  if (msg.t === "pose") {
    const { x, y, z, yaw } = msg;
    if (!finite(x) || !finite(y) || !finite(z) || !finite(yaw)) return null;
    if (Math.abs(x) > BOUND_XZ || Math.abs(z) > BOUND_XZ || y < BOUND_Y_MIN || y > BOUND_Y_MAX) return null;
    const pose = { t: "pose", x: round(x), y: round(y), z: round(z), yaw: round(Math.atan2(Math.sin(yaw), Math.cos(yaw))) };
    if (msg.g !== undefined) {
      const g = msg.g;
      // Bits: airborne, biped, climbing, running, lab stance, office stance, sleeping. These
      // are visual locomotion only; no client may transmit a captive or hit here.
      if (!Array.isArray(g) || g.length !== 6 || !g.every(finite) || !Number.isInteger(g[0]) || g[0] < 0 || g[0] > 127) return null;
      pose.g = [g[0], round(Math.max(-20, Math.min(20, g[1]))), round(Math.max(-1e6, Math.min(1e6, g[2]))),
        round(Math.max(-1, Math.min(1, g[3]))), round(Math.max(-1, Math.min(1, g[4]))), round(Math.max(0, Math.min(1, g[5])))];
    }
    if (msg.j !== undefined) {
      if (!Number.isInteger(msg.j) || msg.j < 0 || msg.j > 7) return null;
      if (msg.j) pose.j = msg.j;
    }
    if (msg.w !== undefined) {
      if (!Number.isInteger(msg.w) || msg.w < 0 || msg.w > 255) return null;
      if (msg.w) pose.w = msg.w;
    }
    if (msg.v !== undefined) {
      if (!validVisual(msg.v)) return null;
      pose.v = msg.v;
    }
    if (msg.r !== undefined) {
      if (!validRest(msg.r)) return null;
      pose.r = msg.r;
    }
    return pose;
  }
  if (msg.t === "body") {
    if (msg.name === null) return { t: "body", name: null };
    return typeof msg.name === "string" && BODY_NAME.test(msg.name) ? { t: "body", name: msg.name } : null;
  }
  if (msg.t === "hub") return typeof msg.on === "boolean" ? { t: "hub", on: msg.on } : null;
  if (msg.t === "visible") return typeof msg.on === "boolean" ? { t: "visible", on: msg.on } : null;
  if (msg.t === "mute") return typeof msg.on === "boolean" ? { t: "mute", on: msg.on } : null;
  if (msg.t === "hp") return finite(msg.v) && typeof msg.ko === "boolean" ? { t: "hp", v: Math.max(0, Math.min(100, Math.round(msg.v))), ko: msg.ko } : null;
  if (msg.t === "zone") return typeof msg.name === "string" && ZONE_NAME.test(msg.name) ? { t: "zone", name: msg.name } : null;
  if (msg.t === "blend") return msg.to === null && msg.k === 0 ? { t: "blend", to: null, k: 0 }
    : typeof msg.to === "string" && ZONE_NAME.test(msg.to) && !msg.to.includes(".") && Number.isInteger(msg.k) && msg.k > 0 && msg.k <= BLEND.STEPS ? { t: "blend", to: msg.to, k: msg.k } : null;
  if (msg.t === "chat") {
    if (typeof msg.text !== "string") return null;
    const line = sanitizeChat(msg.text);
    if (!line || line.length > CHAT_MAX) return null;
    if (msg.clientId === undefined) return { t: "chat", text: line };
    return typeof msg.clientId === "string" && msg.clientId.length > 0 && msg.clientId.length <= 64 && !/[^\w-]/.test(msg.clientId)
      ? { t: "chat", text: line, clientId: msg.clientId } : null;
  }
  if (msg.t === "chalk") {
    if (msg.k === "take" || msg.k === "drop") return { t: "chalk", k: msg.k };
    const op = CHALK.parse(msg);
    return op ? { t: "chalk", ...op } : null;
  }
  if (msg.t === "door") {
    if (msg.op === "ask") return (msg.dir === "in" || msg.dir === "out") && Number.isInteger(msg.room) && msg.room >= 1 && msg.room <= 9
      ? { t: "door", op: "ask", dir: msg.dir, room: msg.room } : null;
    if (msg.op === "go" || msg.op === "done") return typeof msg.cycle === "string" && DOOR_CYCLE.test(msg.cycle)
      ? { t: "door", op: msg.op, cycle: msg.cycle } : null;
    if (msg.op === "cancel") return { t: "door", op: "cancel" };
    if (msg.op === "pass") return typeof msg.door === "string" && DOOR_ROOM.test(msg.door) && (msg.dir === "in" || msg.dir === "out")
      ? { t: "door", op: "pass", door: msg.door, dir: msg.dir } : null;
    return null;
  }
  if (msg.t === "wallet") {
    const { k, u } = msg;
    if (k === "blast") return Array.isArray(u) && u.length >= 1 && u.length <= 16 && u.every(walletId) ? { t: "wallet", k, u: u.slice() } : null;
    if (!walletId(u) || !finite(msg.f) || msg.f < 0 || msg.f > WALLET_FUSE_MAX) return null;
    const f = round(msg.f);
    if (k === "take") return Number.isInteger(msg.l) && msg.l >= 0 && msg.l < 16 ? { t: "wallet", k, u, l: msg.l, f } : null;
    if (k === "up") return { t: "wallet", k, u, f };
    if (k !== "down" && k !== "throw") return null;
    const { x, y, z } = msg;
    if (!finite(x) || !finite(y) || !finite(z) || Math.abs(x) > BOUND_XZ || Math.abs(z) > BOUND_XZ || y < BOUND_Y_MIN || y > BOUND_Y_MAX) return null;
    if (k === "down") return { t: "wallet", k, u, f, x: round(x), y: round(y), z: round(z) };
    const { vx, vy, vz } = msg;
    if (![vx, vy, vz].every(v => finite(v) && Math.abs(v) <= 20)) return null;
    return { t: "wallet", k, u, f, x: round(x), y: round(y), z: round(z), vx: round(vx), vy: round(vy), vz: round(vz) };
  }
  // HALLOWEEN: a follower's word to the ghost hunt's host.
  if (msg.t === "ghost") {
    if (msg.k === "start" || msg.k === "pause" || msg.k === "ready" || msg.k === "leave") return { t: "ghost", k: msg.k };
    if (msg.k === "hits") return ghostHits(msg.h);
    return msg.k === "hit" && ghostHit(msg.g, msg.d) ? { t: "ghost", k: "hit", g: msg.g, d: msg.d } : null;
  }
  if (msg.t === "thump") return Object.keys(msg).length === 1 ? { t: "thump" } : null;
  if (msg.t === "shot") {
    const a = msg.a;
    if (!Array.isArray(a) || a.length !== 6 || !a.every(finite)) return null;
    for (let i = 0; i < 6; i += 3) {
      if (Math.abs(a[i]) > BOUND_XZ || Math.abs(a[i + 2]) > BOUND_XZ || a[i + 1] < BOUND_Y_MIN || a[i + 1] > BOUND_Y_MAX) return null;
    }
    if (Math.hypot(a[3] - a[0], a[4] - a[1], a[5] - a[2]) > SHOT_RANGE) return null;
    return { t: "shot", a: a.map(round) };
  }
  if (msg.t === "swing") return { t: "swing" };
  if (msg.t === "poker-voice") return msg.table === null || Number.isInteger(msg.table) && msg.table >= 0 && msg.table < 10 ? { t: "poker-voice", table: msg.table } : null;
  return null;
};

/** A token bucket per player: `rate` a second, bursting to `burst`. Mutates and answers whether one is spent. */
export const takeToken = (bucket, rate, now, burst = rate) => {
  bucket.tokens = Math.min(burst, bucket.tokens + (now - bucket.at) * rate / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
};

/** A thump bucket for account `id`, made full on first use and kept while the room is awake; on making one, absent
 *  accounts whose bucket has refilled are dropped (lazy expiry), and at THUMP_BUCKET_KEEP none is made (null). */
export const thumpBucketFor = (buckets, id, now, present) => {
  let bucket = buckets.get(id);
  if (bucket) return bucket;
  for (const [account, b] of buckets) if (!present.has(account) && b.tokens + (now - b.at) * THUMP_HZ / 1000 >= THUMP_BURST) buckets.delete(account);
  if (buckets.size >= THUMP_BUCKET_KEEP) return null;
  bucket = { tokens: THUMP_BURST, at: now };
  buckets.set(id, bucket);
  return bucket;
};

/** The chat's last `keep` lines in a fixed ring: `push` is constant time, `list` copies them out oldest first. */
export const chatLog = (keep = CHAT_KEEP) => {
  const slots = new Array(keep);
  let start = 0, size = 0;
  return {
    push(line) {
      slots[(start + size) % keep] = line;
      if (size < keep) size++;
      else start = (start + 1) % keep;
    },
    list() {
      const out = new Array(size);
      for (let i = 0; i < size; i++) out[i] = slots[(start + i) % keep];
      return out;
    },
    get size() { return size; },
  };
};

/** Eight spawn slots on a ring round the pile, so arrivals do not stand in one another. */
export const spawnPoint = (slot) => {
  const a = (slot % 8) * Math.PI / 4;
  return { x: round(Math.sin(a) * 3.5), z: round(Math.cos(a) * 3.5), yaw: round(Math.atan2(-Math.sin(a), -Math.cos(a))) };
};

/** The identity the Worker vouched for, read from its headers; null when any part is missing. */
export const playerFromHeaders = (headers) => {
  const id = Number(headers.get("x-player-id"));
  const login = headers.get("x-player-login");
  if (!Number.isSafeInteger(id) || id <= 0 || !login) return null;
  return { id, login, display: headers.get("x-player-display") || login, contributor: headers.get("x-player-contributor") === "1" };
};

// Who may drive which Ooga or companion. `cast` is the character rows the build writes from src/characters/
// (`npm run characters:json`): every Ooga is a contributor's, keyed by handle, owned by its handle and
// its GitHub login alone: a handle that differs from the login is a name, and some other GitHub account
// may hold it. Only owners join the room, and they drive only their own Ooga or gorilla.
// Signed-out local play never claims a room body.
export const castIndex = (cast) => {
  const owners = new Map(), handleOf = new Map();
  for (const row of cast) {
    const handle = row.handle.toLowerCase();
    const login = String(row.github_login || row.handle).toLowerCase();
    owners.set(handle, login);
    handleOf.set(login, handle);
  }
  return { owners, handleOf };
};

export const ownedBody = (index, login, contributor = false, id) => {
  if (typeof login !== "string") return null;
  const account = globalThis.BL.accountIdentities.accountForId(id);
  if (account) return index.owners.has(account.handle.toLowerCase()) ? account.handle.toLowerCase() : null;
  const me = login.toLowerCase();
  const own = index.handleOf.get(me);
  if (own && globalThis.BL.accountIdentities.accountForHandle(own)) return null;
  // Only the Worker can vouch for this fallback. Never shadow a curated alias,
  // never grant another visitor an unbundled body, and never mutate the shared cast.
  return own || (contributor && !index.owners.has(me) ? me : null);
};

/** null when `login` owns `body`; otherwise the refusal reason. */
export const claimRefusal = (index, login, body, _players, contributor = false, id) => {
  if (body === null) return null;
  const own = ownedBody(index, login, contributor, id);
  return own && own === bodyName(body).toLowerCase() ? null : "not-yours";
};

// Voice: who hears whom. Players driving an Ooga or gorilla hear each other at one volume in the same
// zone group (the island, a bridged land, one cave or portal; see Zones above). A listener with a receiving
// session hears every other player in its group with a published microphone; nobody hears anyone `none`.
// On a crossing between two adjacent groups (#392, `BLEND.PAIRS`) a player is in both, by its step along it
// (`blendTo`, `blendK`), and hears whoever shares a place with it (`BLEND.shares`); the page sets the volumes.
// Ooga Arcade (`arcade`) and Ghost Hunter's Arena (`ghost-arena`) are two groups joined by the haunted hallway, each
// a place as a whole (`BLEND.place`), so its crossing reaches nothing else. The arena is one region with or without a
// hunt; its older names (`arcade-hunt`, `arcade.arena`) are that region (`BLEND.ALIASES`), never the Arcade's.
// The room decides and re-checks it on every pull.
export const VOICE_TRACK = "mic";

/** The voice group of a zone name: its alias's (`BLEND.ALIASES`), else the part before its `.place`. */
export const zoneGroup = (zone) => {
  if (typeof zone === "string" && Object.hasOwn(BLEND.ALIASES, zone)) return BLEND.ALIASES[zone];
  const dot = typeof zone === "string" ? zone.indexOf(".") : -1;
  return dot < 0 ? zone : zone.slice(0, dot);
};

/** Whether listener `p` (in voice group `group`) and speaker `q` share a place. With neither crossing, a group; with
 * either, a zone, so a crossing's far end never reaches into another place of its group (₿IFRÖST's chamber). */
const sharesPlace = (p, group, q) => p.blendTo || q.blendTo
  ? BLEND.shares(p.zone, p.blendTo || null, p.blendK || 0, q.zone, q.blendTo || null, q.blendK || 0)
  : zoneGroup(q.zone) === group;
// The three halves of who hears whom, shared by `voicePeers` and `thumpPeers`. Both restrictions hold together: a
// bodiless listener counts only inside the Studio, a Studio speaker only while permitted, and Ember Den voice only
// between players at the same poker table.
/** Whether `p` is a voice participant who can hear anyone: a receive session, driving (or in the Studio), not `none`. */
export const voiceListener = (p, studio = null) => !!((p.body || (studio && p.zone === STUDIO_ZONE)) && p.voice && p.voice.sub && zoneGroup(p.zone) !== NOWHERE);
/** Whether `q` may be heard where they are, microphone aside. */
export const voiceAudible = (q, studio = null) => !!((q.body || (studio && q.zone === STUDIO_ZONE)) && (!studio || q.zone !== STUDIO_ZONE || studioCanSpeak(studio, q)));
/** Whether listener `p` shares a voice place with `q` (`sharesPlace`, crossings included), and in the Ember Den one
 *  table. Read from the listener's side: a crossing need not share both ways. */
export const voiceTogether = (p, q) => {
  const group = zoneGroup(p.zone);
  return sharesPlace(p, group, q) && (group !== "ember-den" || (p.pokerVoice ?? null) === (q.pokerVoice ?? null));
};

/** Map of player id → sorted ids that player should hear. */
export const voicePeers = (players, studio = null) => {
  const out = new Map();
  for (const p of players) {
    const ids = [];
    if (voiceListener(p, studio)) {
      for (const q of players) if (q !== p && voiceAudible(q, studio) && voiceTogether(p, q) && q.voice && q.voice.track) ids.push(q.id);
      ids.sort((a, b) => a - b);
    }
    out.set(p.id, ids);
  }
  return out;
};

/** The players a thump from `sender` reaches: every other voice participant sharing a voice place with it, from either
 *  side (one may be part of the way across to the other's place). Empty unless the sender is a voice participant. */
export const thumpPeers = (players, sender, studio = null) => {
  const out = [];
  if (!voiceListener(sender, studio)) return out;
  for (const q of players) {
    if (q !== sender && voiceListener(q, studio) && (voiceTogether(q, sender) || voiceTogether(sender, q))) out.push(q);
  }
  return out;
};

/** Whether recipient `q` would hear `sender`'s voice, microphone aside: the sound of its thump, not the sight. */
export const thumpAudible = (q, sender, studio = null) => voiceListener(q, studio) && voiceAudible(sender, studio) && voiceTogether(q, sender);

// NPC host: one page runs the Ooga crew (and the hub's events) for everyone and streams them; the others
// follow. The sitting host (`incumbent`) keeps the role while it still shows the island (`inHub`: in the hub
// scene and visible); otherwise it goes to the page longest in the room among those that do. So a page that
// hides and comes back returns as a follower and catches up from the host's frames, never taking hosting
// back with its own stale state. 0 when no page qualifies. `on` says who qualifies (the arena's ghost hunt elects
// its own host among the visible pages in its arena, `ghostCandidate`).
const showsIsland = (p) => p.inHub;
export const electHost = (players, incumbent = 0, on = showsIsland) => {
  let best = null;
  for (const p of players) {
    if (!on(p)) continue;
    if (p.id === incumbent) return p.id;
    if (!best || p.joinedAt < best.joinedAt || (p.joinedAt === best.joinedAt && p.id < best.id)) best = p;
  }
  return best ? best.id : 0;
};

/** How many pages follow the NPC host: every other page showing the island (or as `on` says). 0 with no host. */
export const npcFollowers = (players, hostId, on = showsIsland) => {
  if (!hostId) return 0;
  let count = 0;
  for (const p of players) if (on(p) && p.id !== hostId) count++;
  return count;
};
