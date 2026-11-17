// The island Room's side of Ooga Chat's audience (#665): the panel's messages (`audience-v1`, src/js/audience.js) and
// what the Room tells the Audience object (audience.js) about its own players. Kept out of room.js and reached through
// protocol.js, as hockey and block are, so the Room's checks load it with the rest of the protocol. Pure of the host.
//
// To the Audience: `world(seq, speakers, active)` whenever who publishes outdoors, or who is in the island's voice at
// all, changes (a signature check sends nothing otherwise): `speakers` are the players the outdoor handshake has opened
// (#667 fills `p.outdoor`; until then nobody), `active` every player in voice anywhere, so a chat speaker never doubles
// an island source. `watch(zones)` names the zones the Room has panels open on, so deltas reach it only for those.
// From the Audience: `audienceDelta(delta)` (Room RPC), relayed to each panel on that zone with its own `self`.
// A panel asks with `audience-view` (a zone to see; the same zone again sends nothing new) and `audience-resync` (a
// gap), and gets a snapshot in parts of PART_ROWS rows: `{ t: "audience", v: 1, kind: "snapshot", epoch, rev, zone,
// part, parts, you, rows }`, then `kind: "delta"` messages with `base`. Viewing never moves the visitor's Ooga, voice
// or microphone; the island's own players are listed only while they speak outdoors.

import { islandRow, isZone } from "./audience-model.js";
import { bridgeFeatures } from "./chat-bridge-protocol.js";
import { scopeOf } from "./outdoor-policy.js";

export const AUDIENCE_FEATURE = "audience-v1";
export const OUTDOOR_FEATURE = "outdoor-voice-v1";
export const CLOUDS_FEATURE = "cloud-seats-v1";
export const CLOUDS_V = 1;
export const OUTDOOR_V = 1;
// How long a new connection's welcome waits for the replaced one's grants to be taken back.
export const RETIRE_WAIT_MS = 3000;
export const AUDIENCE_V = 1;
export const PART_ROWS = 100;
const NAME = "audience";

const selfOf = (p) => `gh:${p.id}`;
const enabled = (room) => !!room.env && !!room.env.AUDIENCE && bridgeFeatures(room.env).bridge;
// The outdoor handshake and Ooga Chat speakers heard on the island: the island's `outdoor` switch, which is its kill switch.
const outdoorOn = (room) => enabled(room) && bridgeFeatures(room.env).outdoor;
const isOpen = (p) => !!p.outdoor && p.outdoor.state === "open";
/** Overhearing: a receive session the page opened by itself (`session` with `passive`), with no microphone of its own.
 *  It is in nobody's voice: it hears no place, only the public conversation `addSources` lists for it and a linked
 *  partner. A publishing session ends it. */
export const overhearing = (p) => !!(p.voice && p.voice.passive && p.voice.sub && !p.voice.pub && !p.voice.track);
// In the island's voice at all: a microphone published, or listening with it muted.
const inVoiceOf = (p) => !!(p.voice && (p.voice.track || p.voice.pub || (p.voice.sub && p.muted === true)));
// Ooga Chat speakers drawn on clouds in the world (#668, rendered by #659): the island's `cloud` switch.
const cloudsOn = (room) => enabled(room) && bridgeFeatures(room.env).cloud;
// Which hall cabinets are outdoors (the island's cave apron), from the registry the page and the Room share.
const cabinets = () => (globalThis.BL && globalThis.BL.arcadeCabinets) || null;
const stub = (room) => room.env.AUDIENCE.getByName(NAME);

// The backoff for telling an unreachable Audience the island's word again (`retryLater`).
const RETRY_MIN = 2000, RETRY_MAX = 60000;

export const audienceRoom = {
  enabled,
  features: (room) => (enabled(room) ? [AUDIENCE_FEATURE, ...(outdoorOn(room) ? [OUTDOOR_FEATURE] : []), ...(cloudsOn(room) ? [CLOUDS_FEATURE] : [])] : []),

  parse: (msg) => {
    if (msg.v !== AUDIENCE_V || !isZone(msg.zone)) return null;
    return { t: msg.t, zone: msg.zone };
  },

  // What the panel's footer may offer the visitor: the island's own voice is how an island player speaks, so it is
  // `active` only while in that voice with an open outdoor grant. The grant itself opens outdoors whether or not the
  // player is in voice (outdoor-voice.js), so it alone never says so.
  you: (p) => ({ speak: isOpen(p) && inVoiceOf(p) ? "active" : "eligible" }),

  async view(room, p, zone, again = false) {
    if (!enabled(room)) return;
    if (p.audienceZone === zone && !again) return;
    p.audienceZone = zone;
    room.saveAttachment(p);
    audienceRoom.watch(room);
    await audienceRoom.snapshot(room, p);
  },

  async snapshot(room, p) {
    const zone = p.audienceZone;
    let snap;
    try { snap = await stub(room).snapshot(zone); } catch { snap = null; }
    if (!snap || room.players.get(p.id) !== p || p.audienceZone !== zone) return;
    const rows = snap.rows.map((row) => islandRow(row, selfOf(p)));
    const parts = Math.max(1, Math.ceil(rows.length / PART_ROWS));
    for (let part = 0; part < parts; part++) {
      room.send(p.ws, { t: "audience", v: AUDIENCE_V, kind: "snapshot", epoch: snap.epoch, rev: snap.rev, zone, part, parts,
        you: audienceRoom.you(p), rows: rows.slice(part * PART_ROWS, part * PART_ROWS + PART_ROWS) });
    }
  },

  delta(room, delta) {
    if (!delta || !isZone(delta.zone)) return;
    room.audienceEpoch = delta.epoch;
    const rows = room.audienceRows || (room.audienceRows = new Map());
    for (const r of delta.upsert) rows.set(r.id, { role: r.role });
    for (const r of delta.remove) rows.delete(r.id);
    for (const p of room.players.values()) {
      if (p.audienceZone !== delta.zone) continue;
      room.send(p.ws, { t: "audience", v: AUDIENCE_V, kind: "delta", epoch: delta.epoch, rev: delta.rev, base: delta.base, zone: delta.zone,
        upsert: delta.upsert.map((row) => islandRow(row, selfOf(p))), remove: delta.remove.map((r) => r.id), you: audienceRoom.you(p) });
    }
  },

  // The zones with a panel open, sent only when that set changes.
  watch(room) {
    if (!enabled(room)) return;
    const zones = [...new Set([...room.players.values()].map((p) => p.audienceZone).filter(isZone))].sort();
    const sig = zones.join(",");
    if (room.audienceWatch === sig) return;
    room.audienceWatch = sig;
    room.background(stub(room).watch(zones).catch(() => {}));
  },

  // The island's word on its players, sent only when it changes (or `force`d), newest `seq` winning at the Audience.
  world(room, force = false) {
    if (!enabled(room)) return null;
    const speakers = [], active = [];
    for (const p of room.players.values()) {
      // In the island's voice at all: its source wins.
      const inVoice = inVoiceOf(p);
      if (inVoice) active.push(selfOf(p));
      const o = p.outdoor;
      if (inVoice && isOpen(p) && outdoorOn(room) && isZone(o.scope))
        speakers.push({ id: selfOf(p), zone: o.scope, mic: p.muted ? "muted" : "on", login: p.login, display: p.display || p.login,
          character: typeof p.body === "string" ? p.body.replace(/^gorilla:/, "") : null,
          // The island's raised hand as the roster shows it: its pinned emoji, or the hand in its tone.
          hand: p.hand ? p.handEmoji || globalThis.BL.reactionPolicy.toned(globalThis.BL.reactionPolicy.HAND, p.handTone || 0) : "",
          // The microphone's publication, by reference, for Ooga Chat's listeners to pull (#666); a new one is a new gen.
          pub: p.voice.pub && p.voice.track ? { session: p.voice.pub, track: p.voice.track, gen: p.voice.gen || 0 } : null });
    }
    speakers.sort((a, b) => (a.id < b.id ? -1 : 1));
    active.sort();
    const sig = JSON.stringify([speakers, active]);
    if (room.audienceWorld === sig && !force) return null;
    room.audienceWorld = sig;
    room.audienceSeq = Math.max(Date.now(), (room.audienceSeq || 0) + 1);
    // Its answer says which identities still have subscriptions not yet confirmed closed at the SFU. Not delivered, the
    // island's word is sent again from the Room's alarm (`retry`), so a grant the Room took back never leaves the
    // Audience listing its publication.
    const told = stub(room).world(room.audienceSeq, speakers, active).then((answer) => { room.audienceRetry = null; return answer; },
      () => { audienceRoom.retryLater(room); return null; });
    room.background(told);
    return told;
  },

  // The Audience could not be told: forget what it was last told and wake the Room to tell it again, backing off from
  // RETRY_MIN to RETRY_MAX while it stays unreachable.
  retryLater(room) {
    room.audienceWorld = null;
    const delay = room.audienceRetry ? Math.min(RETRY_MAX, room.audienceRetry.delay * 2) : RETRY_MIN;
    room.audienceRetry = { at: Date.now() + delay, delay };
    room.background(room.scheduleAlarm());
  },
  retryDue: (room) => (room.audienceRetry ? room.audienceRetry.at : Infinity),

  // From the Room's alarm: a due retry tells the Audience again, and every grant still closing asks again whether its
  // retirement is confirmed (a lost confirmation then costs one sweep, never a microphone held for good).
  async retry(room, now = Date.now()) {
    const due = !!room.audienceRetry && room.audienceRetry.at <= now;
    const closing = [...room.players.values()].filter((p) => p.outdoor && p.outdoor.state === "closing");
    if (!due && !closing.length) return;
    if (!enabled(room)) { room.audienceRetry = null; return; }
    if (due) room.audienceRetry = { ...room.audienceRetry, at: Infinity };
    if (closing.length) for (const p of closing) await audienceRoom.retire(room, p, p.outdoor.reason || "left");
    else await audienceRoom.world(room, true);
  },

  // A player gone: out of the island's word. Its answer is what a new connection of the same account waits for.
  leave(room, p = null) {
    audienceRoom.watch(room);
    const told = audienceRoom.world(room, !!(p && p.outdoor && p.outdoor.state !== "none"));
    if (p && told && p.outdoor && p.outdoor.state !== "none") (room.retiring || (room.retiring = new Map())).set(p.id, told);
    return told;
  },

  // Before a connection's welcome: the account's last connection's grants are taken back (bounded wait).
  async settled(room, id) {
    const pending = room.retiring && room.retiring.get(id);
    if (!pending) return;
    room.retiring.delete(id);
    let timer;
    await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(resolve, RETIRE_WAIT_MS); })]);
    clearTimeout(timer);
  },

  // --- Ooga Chat speakers heard on the island (#666) ---
  // The Audience's list of chat speakers' publications (`{ id, zone, session, track, gen }`, id a GitHub account id),
  // replaced whole. An island player with an open outdoor grant in a zone hears that zone's chat speakers as voice peers
  // by those ids. They may also have an island body; only an island microphone supersedes their chat publication.
  cleanSources: (list) => (Array.isArray(list) ? list : []).filter((s) => s && Number.isSafeInteger(s.id) && s.id > 0 && isZone(s.zone)
    && typeof s.session === "string" && typeof s.track === "string").slice(0, 64),
  sources(room, list) {
    const was = new Set((room.chatSources || []).map((s) => s.id));
    room.chatSources = audienceRoom.cleanSources(list);
    // An island page of an account that began or stopped speaking from Ooga Chat hears so (`voice-elsewhere`): its own
    // voice then waits for the visitor's word instead of taking that voice away (voice-handoff.js).
    const now = new Set(room.chatSources.map((s) => s.id));
    for (const id of new Set([...was, ...now])) {
      const p = was.has(id) !== now.has(id) && room.players.get(id);
      if (p) room.send(p.ws, { t: "voice-elsewhere", on: now.has(id) });
    }
    // Who hears whom changed: a source gone is closed for every island listener, one new is offered.
    room.enforceStudio();
    for (const p of room.players.values()) if (isOpen(p)) audienceRoom.tellAudience(room, p);
    // Kept in the Room's storage, so a Room woken from hibernation still has it: the Audience sends only changes.
    return room.ctx.storage.put("chatSources", room.chatSources);
  },
  sourceOf: (room, id) => (room.chatSources || []).find((s) => s.id === id) || null,
  /** Whether account `id` speaks from Ooga Chat now, on some other device: its welcome says so. */
  elsewhere: (room, id) => outdoorOn(room) && (room.chatSources || []).some((s) => s.id === id),
  /**
   * Ooga Chat took account `id`'s voice on the visitor's own word there (audience.js `requestSpeaker` with `takeover`):
   * its island page leaves voice (`voice-moved`), and the Audience has heard the island's word without it before this
   * answers, so the lease it then grants is not ended by an older word.
   */
  async handoff(room, id) {
    if (!enabled(room)) return { ok: false };
    const p = room.players.get(id);
    if (p && inVoiceOf(p)) {
      await room.clearVoice(p);
      p.muted = false;
      room.saveAttachment(p);
      room.send(p.ws, { t: "voice-moved" });
      room.broadcast({ t: "vstate", id: p.id, voice: false, muted: false }, p.ws);
      room.updateVoice();
    }
    const told = await audienceRoom.world(room, true);
    return { ok: !!told && told.ok === true };
  },
  // A player overhearing (a receive session of the page's own, protocol.js `overhearing`) with an open grant on the main
  // island hears that conversation's island speakers too, exactly those Ooga Chat's listeners hear: in the island's
  // voice with a live microphone and an open grant there. Indoors, or anywhere its grant is not open, it hears nobody.
  addSources(room, plan) {
    const sources = room.chatSources || [];
    if (!outdoorOn(room)) return plan;
    for (const p of room.players.values()) {
      const o = p.outdoor;
      if (!isOpen(p) || !isZone(o.scope)) continue;
      const peers = plan.get(p.id) || [];
      if (o.scope === "main" && overhearing(p))
        for (const q of room.players.values()) if (q !== p && q.voice && q.voice.track && isOpen(q) && q.outdoor.scope === o.scope && !peers.includes(q.id)) peers.push(q.id);
      for (const s of sources) {
        const v = room.players.get(s.id)?.voice;
        // During handoff an old chat reference can still be in flight. Never use it to admit an island microphone
        // from another place: that source is governed by voicePeers, and must not inherit a public chat grant.
        if (v && v.pub && v.track) continue;
        if (s.zone === o.scope && s.id !== p.id && !peers.includes(s.id)) peers.push(s.id);
      }
      plan.set(p.id, peers);
    }
    return plan;
  },

  // --- the outdoor handshake (#667; the page's side is src/js/outdoor-voice.js, its wire docs/auth-and-presence.md) ---
  // `p.outdoor` is `{ state, epoch, scope, left }`: `state` `none`, `open` (this connection's publication may be heard by
  // `scope`'s public audience) or `closing` (taken back; `closed` waits for the Audience to confirm, at the SFU, that no
  // outdoor subscription to it is left). `left` is the highest epoch the page gave up: nothing at or below it opens again.
  // Frames are handled one at a time a connection (`p.outdoorChain`), in order.

  parseOutdoor: (msg) => {
    if (msg.v !== OUTDOOR_V || !Number.isSafeInteger(msg.epoch) || msg.epoch < 0) return null;
    if (msg.op === "enter") return isZone(msg.scope) ? { t: "outdoor", op: "enter", epoch: msg.epoch, scope: msg.scope } : null;
    if (msg.op === "leave") return { t: "outdoor", op: "leave", epoch: msg.epoch, reason: typeof msg.reason === "string" ? msg.reason.slice(0, 24) : "" };
    return null;
  },

  outdoor(room, p, msg) {
    const run = () => (msg.op === "enter" ? audienceRoom.enterOutdoor(room, p, msg) : audienceRoom.leaveOutdoor(room, p, msg.epoch, msg.reason));
    p.outdoorChain = (p.outdoorChain || Promise.resolve()).then(run, run);
    return p.outdoorChain;
  },

  state: (p) => p.outdoor || (p.outdoor = { state: "none", epoch: -1, scope: null, left: -1 }),
  sendOutdoor: (room, p, msg) => room.send(p.ws, { t: "outdoor", v: OUTDOOR_V, ...msg }),
  sourcesFor: (room, scope) => (room.chatSources || []).filter((s) => s.zone === scope).map((s) => s.id),
  tellAudience(room, p) {
    const o = p.outdoor;
    audienceRoom.sendOutdoor(room, p, { op: "audience", epoch: o.epoch, listeners: (room.audienceListeners || {})[o.scope] || 0, sources: audienceRoom.sourcesFor(room, o.scope) });
  },

  async enterOutdoor(room, p, msg) {
    const o = audienceRoom.state(p);
    if (room.players.get(p.id) !== p || msg.epoch <= o.left || msg.epoch <= o.epoch && o.state !== "none") return;
    if (!outdoorOn(room)) { audienceRoom.sendOutdoor(room, p, { op: "refused", epoch: msg.epoch, reason: "unavailable" }); return; }
    // The page asked; the Room's own view must agree: its zone, body, crossing and seat.
    const mine = scopeOf(p, cabinets());
    if (mine.scope !== msg.scope) { audienceRoom.sendOutdoor(room, p, { op: "refused", epoch: msg.epoch, reason: mine.scope ? "scope" : mine.reason }); return; }
    if (o.state === "open" && o.scope !== msg.scope || o.state === "closing") {
      // Another scope is still held: the page leaves it before asking again.
      audienceRoom.sendOutdoor(room, p, { op: "refused", epoch: msg.epoch, reason: "pending" });
      return;
    }
    p.outdoor = { state: "open", epoch: msg.epoch, scope: msg.scope, left: o.left };
    room.saveAttachment(p);
    audienceRoom.world(room);
    audienceRoom.sendOutdoor(room, p, { op: "open", epoch: msg.epoch, scope: msg.scope, listeners: (room.audienceListeners || {})[msg.scope] || 0,
      sources: audienceRoom.sourcesFor(room, msg.scope) });
    room.updateVoice();
  },

  async leaveOutdoor(room, p, epoch, reason) {
    const o = audienceRoom.state(p);
    o.left = Math.max(o.left, epoch);
    // Nothing granted at or below this epoch: nothing to take back.
    if (o.state === "none" || o.epoch > epoch) { room.saveAttachment(p); audienceRoom.sendOutdoor(room, p, { op: "closed", epoch }); return; }
    await audienceRoom.retire(room, p, reason || "left");
  },

  // Take a grant back: out of the island's word first, then `closed` once the Audience confirms nothing outdoor still
  // holds this publication. Until then the page keeps its microphone held. Unprompted when the Room revokes it.
  async retire(room, p, reason) {
    const o = p.outdoor;
    if (!o || o.state === "none") return true;
    o.state = "closing";
    o.reason = reason;
    room.saveAttachment(p);
    // No Ooga Chat speaker is heard any more either: those pulls are closed at once.
    room.enforceStudio();
    const told = await audienceRoom.world(room, true);
    if (!told || !told.ok || (Array.isArray(told.pending) && told.pending.includes(selfOf(p)))) return false;
    audienceRoom.closed(room, p);
    return true;
  },

  closed(room, p) {
    const o = p.outdoor;
    if (!o || o.state !== "closing") return;
    const epoch = Math.max(o.epoch, o.left);
    p.outdoor = { state: "none", epoch: o.epoch, scope: null, left: o.left };
    if (room.players.get(p.id) === p) {
      room.saveAttachment(p);
      audienceRoom.sendOutdoor(room, p, { op: "closed", epoch, ...(o.reason ? { reason: o.reason } : {}) });
    }
  },

  // The Room's own view stopped agreeing (a zone, body, crossing or seat changed): take the grant back now.
  check(room, p) {
    if (!isOpen(p)) return;
    if (!outdoorOn(room) || scopeOf(p, cabinets()).scope !== p.outdoor.scope) room.background(audienceRoom.retire(room, p, outdoorOn(room) ? "scope" : "unavailable"));
  },

  // The Audience confirmed, at the SFU, that nothing outdoor holds these identities' publications any more.
  confirmed(room, ids) {
    const done = new Set(Array.isArray(ids) ? ids : []);
    for (const p of room.players.values()) if (p.outdoor && p.outdoor.state === "closing" && done.has(selfOf(p))) audienceRoom.closed(room, p);
  },

  // How many public listeners each zone has, for the open grants' `audience` frames.
  listeners(room, counts) {
    room.audienceListeners = { main: Number.isSafeInteger(counts && counts.main) ? counts.main : 0, dsb: Number.isSafeInteger(counts && counts.dsb) ? counts.dsb : 0 };
    for (const p of room.players.values()) if (isOpen(p)) audienceRoom.tellAudience(room, p);
  },

  // A woken or redeployed Room: a grant the switch no longer allows is taken back, and every grant is checked again.
  restore(room) {
    for (const p of room.players.values()) {
      if (!p.outdoor) continue;
      if (p.outdoor.state === "closing") room.background(audienceRoom.retire(room, p, p.outdoor.reason || "left"));
      else audienceRoom.check(room, p);
    }
    if (enabled(room)) audienceRoom.world(room);
  },

  // --- reactions and clouds (#668) ---

  // An Ooga Chat reaction: to each island panel on its zone (`kind: "react"`) and, from a GitHub account, to each open
  // outdoor grant there (the page's bridge, `op: "react"`), each with the event's own id so a client shows it once.
  reaction(room, event) {
    if (!event || !isZone(event.zone)) return;
    const gh = /^gh:([1-9][0-9]{0,15})$/.exec(event.participantId), account = gh ? Number(gh[1]) : 0;
    const row = room.audienceRows && room.audienceRows.get(event.participantId);
    for (const p of room.players.values()) {
      if (p.audienceZone === event.zone)
        room.send(p.ws, { t: "audience", v: AUDIENCE_V, kind: "react", epoch: event.epoch, zone: event.zone, id: event.participantId, e: event.emoji, rid: event.eventId });
      if (account && Number.isSafeInteger(account) && isOpen(p) && p.outdoor.scope === event.zone && account !== p.id)
        audienceRoom.sendOutdoor(room, p, { op: "react", epoch: p.outdoor.epoch, rid: event.eventId, id: account, e: event.emoji, speaker: !!row && row.role === "speaker" });
    }
  },

  // An island player's own reaction while it speaks outdoors: Ooga Chat's listeners in its zone see it too, as do the
  // island panels on that zone. Rate-limited already by the Room's own bucket.
  islandReaction(room, p, emoji) {
    if (!isOpen(p) || !outdoorOn(room)) return;
    room.reactSeq = Math.max(Date.now(), (room.reactSeq || 0) + 1);
    const event = { eventId: `i${room.reactSeq}`, participantId: selfOf(p), zone: p.outdoor.scope, emoji };
    for (const q of room.players.values()) if (q.audienceZone === event.zone && q !== p)
      room.send(q.ws, { t: "audience", v: AUDIENCE_V, kind: "react", zone: event.zone, id: event.participantId, e: emoji, rid: event.eventId, epoch: room.audienceEpoch || 0 });
    room.background(stub(room).islandReaction(event).catch(() => {}));
  },

  // The clouds Ooga Chat speakers sit on, replaced whole, to every page: each `{ id, character, zone, seat, seatRevision,
  // lease, mic, hand, login, display }`. A page draws a cloud speaker from its seat and ghosts that character's NPC while any source owns
  // it: the island's own drivers (every `body`) and these clouds together are the canonical owners.
  cleanClouds: (room, list) => (cloudsOn(room) ? (Array.isArray(list) ? list : []).filter((c) => c && /^gh:[1-9][0-9]{0,15}$/.test(c.id) && isZone(c.zone) && typeof c.seat === "string").slice(0, 32) : []),
  clouds(room, list) {
    room.clouds = audienceRoom.cleanClouds(room, list);
    room.cloudsRev = (room.cloudsRev || 0) + 1;
    if (cloudsOn(room)) room.broadcast({ t: "clouds", v: CLOUDS_V, revision: room.cloudsRev, clouds: room.clouds });
    // Kept in the Room's storage, as its chat sources are: a Room woken from hibernation still welcomes pages with them.
    return room.ctx.storage.put("clouds", { list: room.clouds, revision: room.cloudsRev });
  },

  // A page's welcome is followed by the clouds standing now (as the chalkboard follows it).
  welcome(room, p) {
    if (cloudsOn(room)) room.send(p.ws, { t: "clouds", v: CLOUDS_V, revision: room.cloudsRev || 0, clouds: room.clouds || [] });
  },
};
