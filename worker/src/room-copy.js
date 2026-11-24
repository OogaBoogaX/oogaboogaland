// A hosted chat's copy of its zone (docs/ooga-chat-hosts.md, "Open for the second PR"): the island's own Room class run
// as one object a chat, `chat:<id>`, where the chat's speakers walk their Oogas. Kept out of room.js and reached through
// protocol.js, as room-audience.js is. Pure of the host.
//
// In a copy everything island-only is off: no NPC host, props, chalk, Tess queue, cabinets, doors, games, duels, Studio,
// wallets, voice, text chat, private conversations or voice links, no World Map report and no word to Ooga Chat's
// audience singleton. Its pages hear a `welcome` listing only the copy's kinds (room.js) with `copy: { chat, zone }`, and
// it takes only COPY_MESSAGES, a zone only inside the chat's own (OUTDOOR_ZONES). Who walks it is the chat's word
// (audience.js): `copyMember("gh:<id>")` before each admission, `walking(ids)` on each arrival and each departure for
// good, and `copyCheck(ids)` from the sweep; the chat calls the copy's `copyRevoke`, `copyEnd` and `copyClouds` (room.js),
// and hears the walkers' places for the island view (`walk(seq, ids, p)`), at most every WALK_MS while poses change.
//
// The island's side of a trip: a page about to leave for a copy says `{ t: "travel" }` and closes. Its leave says
// `reason: "travel"` with the Ooga it drove, and its seat is kept (`away`, stored) so it can always come back: until its
// account's next connection to the island (whose `join` says `travel: true`), the chat letting its stage go, or AWAY_MS
// (then `{ t: "away", id, on: false }` tells every page to show that Ooga's NPC again).

import { bridgeFeatures } from "./chat-bridge-protocol.js";
import { COPY_REVISION } from "./cloud-seats.js";
import { OUTDOOR_ZONES } from "./outdoor-policy.js";
import { CLOUDS_V } from "./room-audience.js";

export const COPY_FEATURE = "copy-v1";
export const COPY_PREFIX = "chat:";
// What a copy's page may say; everything else is ignored, never a kick.
export const COPY_MESSAGES = Object.freeze(new Set(["pose", "body", "zone", "hub", "visible", "call", "react", "hand", "back", "mute"]));
// The island view's relay: one call at most every WALK_MS, one in flight.
export const WALK_MS = 500;
// How long the island keeps a traveller's seat with no word from the chat or the traveller.
export const AWAY_MS = 2 * 60 * 60 * 1000;
const CHAT = /^[A-Za-z0-9_-]{1,64}$/;
const REASON = /^[a-z-]{1,24}$/;
const CLOUDS_MAX = 32;
const ZONES = new Set(Object.values(OUTDOOR_ZONES));
const self = (id) => `gh:${id}`;
const characterOf = (p) => (typeof p.body === "string" ? p.body.replace(/^gorilla:/, "") : null);

export const copyRoom = {
  /** The copy an object's name makes it (`chat:<id>`), or null for the island. */
  of(name) {
    const chat = typeof name === "string" && name.startsWith(COPY_PREFIX) ? name.slice(COPY_PREFIX.length) : "";
    return CHAT.test(chat) ? { chat, zone: null, title: null, clouds: null, cloudsRev: 0, walkSig: null, walkSeq: 0, walkAt: 0, walkDirty: false, walkBusy: false,
      walkTimer: 0, walkIds: [], walkP: [], ending: false } : null;
  },

  /** The island's switch for copies (chat-bridge-protocol.js `copies`, which needs `chats`). */
  copies: (env) => bridgeFeatures(env || {}).copies,

  chatOf: (room) => room.env.AUDIENCE.getByName(COPY_PREFIX + room.copy.chat),

  // What a woken copy kept: the chat's zone, title and clouds.
  restore(room, saved) {
    if (!saved || typeof saved !== "object") return;
    if (ZONES.has(saved.zone)) room.copy.zone = saved.zone;
    if (typeof saved.title === "string") room.copy.title = saved.title;
    if (Array.isArray(saved.clouds)) { room.copy.clouds = copyRoom.cleanClouds(saved.clouds); room.copy.cloudsRev = Number.isSafeInteger(saved.cloudsRev) ? saved.cloudsRev : 0; }
  },
  keep: (room) => room.ctx.storage.put("copy", { zone: room.copy.zone, title: room.copy.title, clouds: room.copy.clouds, cloudsRev: room.copy.cloudsRev }),

  /** May GitHub account `id` walk this copy: the chat's answer, `{ ok: true }` or `{ ok: false, reason }`, a kick's. */
  async admit(room, id) {
    if (room.copy.ending || !room.env || !room.env.AUDIENCE) return { ok: false, reason: "chat-ended" };
    let answer;
    try { answer = await copyRoom.chatOf(room).copyMember(self(id)); } catch { return { ok: false, reason: "unavailable" }; }
    if (!answer || answer.ok !== true) {
      const said = answer && answer.reason;
      return { ok: false, reason: said === "ended" ? "chat-ended" : typeof said === "string" && REASON.test(said) ? said : "not-speaker" };
    }
    if (!ZONES.has(answer.zone) || room.copy.zone !== null && answer.zone !== room.copy.zone) return { ok: false, reason: "zone" };
    const first = room.copy.zone === null;
    room.copy.zone = answer.zone;
    if (typeof answer.title === "string") room.copy.title = answer.title;
    if (Array.isArray(answer.clouds) && room.copy.clouds === null) { room.copy.clouds = copyRoom.cleanClouds(answer.clouds); room.copy.cloudsRev++; }
    if (first) await copyRoom.keep(room);
    return { ok: true };
  },

  // What a page says, as a copy takes it: true when the island's handler must not run. A zone outside the chat's own is
  // ignored. `hub` is noted nowhere: a copy hosts no NPCs or props, and a page showing it waits in no Tess queue.
  refuses(room, msg) {
    if (!COPY_MESSAGES.has(msg.t) || msg.t === "hub") return true;
    return msg.t === "zone" && OUTDOOR_ZONES[msg.name] !== room.copy.zone;
  },

  // The chat hears who walks its copy now, on every arrival and departure for good; a call not delivered is sent again
  // from the sweep (`walkSig` null).
  walking(room) {
    if (room.copy.ending || !room.env || !room.env.AUDIENCE) return;
    const ids = [...room.players.keys()].sort((a, b) => a - b).map(self), sig = ids.join(",");
    if (sig === room.copy.walkSig) return;
    room.copy.walkSig = sig;
    let call;
    try { call = Promise.resolve(copyRoom.chatOf(room).walking(ids)); } catch (error) { call = Promise.reject(error); }
    room.background(call.then((answer) => {
      if (!answer || answer.ok !== true) throw new Error("not taken");
    }).catch(() => { if (room.copy.walkSig === sig) room.copy.walkSig = null; }));
  },

  // The island view (audience.js `walk`): after a snapshot, the walkers' places, at most every WALK_MS with one call in
  // flight; a burst's last change goes once, through a one-shot timer that runs only while poses are changing.
  walked(room) {
    room.copy.walkDirty = true;
    copyRoom.sendWalk(room);
  },
  sendWalk(room) {
    const c = room.copy;
    if (!c.walkDirty || c.walkBusy || c.walkTimer || c.ending || !room.env || !room.env.AUDIENCE) return;
    const now = Date.now(), since = now - c.walkAt;
    if (since < WALK_MS) {
      c.walkTimer = setTimeout(() => { c.walkTimer = 0; copyRoom.sendWalk(room); }, WALK_MS - since);
      return;
    }
    c.walkDirty = false;
    c.walkAt = now;
    c.walkBusy = true;
    c.walkSeq = Math.max(now, c.walkSeq + 1);
    // The same two arrays every call: none is touched again until this one has been answered.
    const ids = c.walkIds, p = c.walkP;
    ids.length = 0; p.length = 0;
    for (const q of room.players.values()) { ids.push(q.id); p.push(q.x, q.y, q.z, q.yaw); }
    let call;
    try { call = Promise.resolve(copyRoom.chatOf(room).walk(c.walkSeq, ids, p)); } catch (error) { call = Promise.reject(error); }
    room.background(call.catch(() => {}).then(() => { c.walkBusy = false; copyRoom.sendWalk(room); }));
  },
  stopWalk(room) {
    if (room.copy.walkTimer) { clearTimeout(room.copy.walkTimer); room.copy.walkTimer = 0; }
    room.copy.walkDirty = false;
  },

  // The copy's sweep (only while players are here): the walkers told again if they were not, and those the chat says
  // may no longer walk (a lapsed stage hold sets no alarm there) sent home.
  async sweep(room) {
    copyRoom.walking(room);
    if (!room.players.size || room.copy.ending || !room.env || !room.env.AUDIENCE) return;
    let gone;
    try { gone = await copyRoom.chatOf(room).copyCheck([...room.players.keys()].map(self)); } catch { return; }
    for (const id of Array.isArray(gone) ? gone : []) {
      const p = typeof id === "string" && /^gh:[1-9][0-9]{0,15}$/.test(id) && room.players.get(Number(id.slice(3)));
      if (p) room.evict(p, "stage");
    }
  },

  /** A kick's reason from the chat (`stage`, `removed`), or `stage`. */
  reason: (reason) => (typeof reason === "string" && REASON.test(reason) ? reason : "stage"),

  // The chat's clouds for the copy, kept and sent as the chat gives them: each speaker not walking it, a seat each.
  cleanClouds: (list) => (Array.isArray(list) ? list : []).filter((c) => !!c && typeof c === "object" && !Array.isArray(c)).slice(0, CLOUDS_MAX),
  clouds(room, list) {
    room.copy.clouds = copyRoom.cleanClouds(list);
    room.copy.cloudsRev++;
    room.broadcast(copyRoom.cloudsMessage(room));
    return copyRoom.keep(room);
  },
  cloudsMessage: (room) => ({ t: "clouds", v: CLOUDS_V, revision: room.copy.cloudsRev, clouds: room.copy.clouds || [] }),
  /** The copy's clouds in its welcome's kinds, once the chat has given it a list. */
  cloudFeatures: (room) => (Array.isArray(room.copy.clouds) ? [COPY_REVISION] : []),
  // After a copy's welcome: the clouds standing now.
  welcome(room, p) {
    if (Array.isArray(room.copy.clouds)) room.send(p.ws, copyRoom.cloudsMessage(room));
  },

  // --- the island's side of a trip ---

  restoreAway(room, stored) {
    room.away = new Map((Array.isArray(stored) ? stored : []).filter((e) => Array.isArray(e) && Number.isSafeInteger(e[0]) && !!e[1] && typeof e[1] === "object"
      && Number.isFinite(e[1].at) && (e[1].chat === null || typeof e[1].chat === "string") && (e[1].character === null || typeof e[1].character === "string")));
  },
  keepAway: (room) => room.later(room.ctx.storage.put("away", [...room.away])),

  // A traveller's leave: its seat is kept for the chat whose stage it holds, as far as the island knows.
  depart(room, p) {
    const entry = { chat: (room.chatVoices && room.chatVoices.get(p.id)) || null, at: Date.now(), character: characterOf(p) };
    room.away.set(p.id, entry);
    copyRoom.keepAway(room);
    return entry;
  },
  /**
   * Seats kept for travellers other than account `id`. Seats past their time are let go first: the sweep that otherwise
   * does it runs only while players are here, so an empty island would go on counting them.
   */
  awayOthers(room, id) {
    if (!room.away) return 0;
    copyRoom.sweepAway(room, Date.now());
    return room.away.size - (room.away.has(id) ? 1 : 0);
  },
  // The account is back on the island: its kept seat goes. True when it had one.
  returned(room, id) {
    if (!room.away || !room.away.delete(id)) return false;
    copyRoom.keepAway(room);
    return true;
  },
  // A kept seat let go with nobody back: every page shows that Ooga's NPC again.
  release(room, id) {
    if (!room.away || !room.away.delete(id)) return;
    copyRoom.keepAway(room);
    room.broadcast({ t: "away", id, on: false });
  },
  // The chat let account `id`'s stage go (room.js `chatVoice`).
  stageLeft(room, id, chat) {
    const entry = room.away && room.away.get(id);
    if (entry && (entry.chat === chat || entry.chat === null)) copyRoom.release(room, id);
  },
  sweepAway(room, now) {
    for (const [id, entry] of [...(room.away || [])]) if (now - entry.at > AWAY_MS) copyRoom.release(room, id);
  },
  // In the island's welcome: who is away, so a page keeps those Oogas' NPCs hidden.
  awayWelcome: (room) => (room.away && room.away.size ? { away: [...room.away].map(([id, e]) => ({ id, character: e.character })) } : {}),
};
