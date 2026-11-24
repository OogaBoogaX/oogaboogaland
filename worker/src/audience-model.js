// Ooga Chat's audience (#665): who is in each outdoor zone and in what role, as one model the Audience Durable Object
// (audience.js) owns and both clients read. Pure and allocation-light; loaded in Node by the checks.
//
// Identities, not connections, are listed: one row per person per zone (`gh:<github id>` or `x:<x id>`, public
// provider ids, never a login), however many tabs or sources they have. A person's row in a zone is, in precedence:
//   world speaker   the island reports them publishing outdoors in this zone (Room, through `setWorld`)
//   chat speaker    one of their Ooga Chat connections in this zone holds an active speaker lease
//   listener        one of their Ooga Chat connections is in this zone
// and none otherwise. Island players who are not world speakers are not listed: listeners are Ooga Chat's alone, and
// nobody's interior, private room or position reaches a row.
// Every change is staged and `commit` turns it into at most one delta a zone: `{ zone, epoch, base, rev, upsert,
// remove }`, the revision moving once per zone per commit, so a client that applies deltas only on their base never
// skips one. A row's `generation` rises whenever its source changes or it reappears, and a removal names the
// generation it removes, so a late removal never hides a newer row.
// Leases: a chat speaker lease is `pending` (granted, its microphone not yet published, the person still a listener),
// then `active` (a speaker row, starting muted). One lease an identity across both zones and every tab, and none while
// the island reports the identity in its own voice (`active`), whose source always wins: the island's arrival ends a
// chat lease first.
// A quiet hold (a hosted chat's, `disconnect` with `quiet`): a speaker, host or co-host whose last connection in the zone
// drops keeps the row they had, in its place, until the hold ends (`expire`): unchanged for its first moments
// (`quietUntil`), so a drop of a few seconds shows nobody anything, then marked `reconnecting` (shown dimmed) until
// `until`, when the row shows what is true. Back in the zone, the mark goes and the hold stands while their place on the
// stage is held (the caller ends it sooner when they go back to listening on their own word); speaking again, the row carries on where it stood (its `since` kept). A held speaker
// counts against the speaker cap, as does every identity `reserved()` names (a place on the stage a chat holds).

import { freeSeat } from "./cloud-seats.js";

export const ZONES = ["main", "dsb"];
export const DEFAULT_LIMITS = Object.freeze({ listeners: 500, chatSpeakers: 8, connectionsPerIdentity: 3, connections: 1200 });
// A zone's reactions fan out to everyone in it, so its limit shrinks as it fills (#669): at most FANOUT_DEFAULT frames a
// second a zone (`AUDIENCE_FANOUT` sets it), 30 a second up to about 160 people and 10 at 500, never under one; the
// Audience's burst is twice the rate. The figure is the staging matrix's to confirm (docs/ooga-chat-operations.md).
export const ZONE_REACT_HZ = 30;
export const FANOUT_DEFAULT = 5000;
export const zoneReactHz = (people, fanout = FANOUT_DEFAULT) => Math.max(1, Math.min(ZONE_REACT_HZ, fanout / Math.max(1, people)));
export const ID = /^(gh|x):[1-9][0-9]{0,19}$/;
export const isZone = (zone) => ZONES.includes(zone);

const sameRow = (a, b) => a === b || !!a && !!b && a.generation === b.generation && a.role === b.role && a.source === b.source
  && a.mic === b.mic && a.hand === b.hand && a.speaking === b.speaking && a.display === b.display && a.login === b.login
  && a.avatar === b.avatar && a.character === b.character && a.contributions === b.contributions
  && a.rank === b.rank && a.request === b.request && a.askedAt === b.askedAt && a.rankSince === b.rankSince
  && a.since === b.since && a.via === b.via && a.walking === b.walking && !!a.reconnecting === !!b.reconnecting;

// A hosted chat (docs/ooga-chat-hosts.md) hands in its roles: `standing(id)` is a row's `{ rank, request, askedAt }`
// (the host's or a co-host's rank, an open request or invite, when it was asked), and `may(conn)` whether a connection's
// identity may take a speaker lease now, in place of the capability the connection arrived with.
const NO_STANDING = Object.freeze({ rank: "", request: "", askedAt: 0, rankSince: 0 });
// `seats()` false: a speaker takes no cloud seat (a hosted chat, whose clouds are its own copy's, docs/ooga-chat-hosts.md).
export const createAudience = ({ epoch = Date.now(), limits = DEFAULT_LIMITS, revs = null, clock = Date.now, standing = () => NO_STANDING,
  may = (c) => !!c.eligible, seats = () => true, reserved = () => [] } = {}) => {
  const zones = Object.fromEntries(ZONES.map((zone) => [zone, { rev: revs && Number.isSafeInteger(revs[zone]) ? revs[zone] : 0, rows: new Map() }]));
  // id -> { info, world, active, conns: Map<connId, conn>, gen, source: { zone: last visible source key } }
  const people = new Map();
  const conns = new Map();
  // Speakers walking a chat's copy of its zone, as the copy says (docs/ooga-chat-hosts.md): their rows say so.
  const walkers = new Set();
  const touched = new Set();
  // A quiet hold ended by a return to the stage, which the caller's store has yet to forget (`quietChanged`).
  let quietDirty = false;
  const touch = (id, zone) => touched.add(`${zone}|${id}`);

  const person = (id, info) => {
    let p = people.get(id);
    if (!p) { p = { id, info: { ...info }, world: null, active: false, conns: new Map(), gen: 0, shown: {} }; people.set(id, p); }
    else if (info) Object.assign(p.info, info);
    return p;
  };
  const forget = (p) => { if (!p.world && !p.active && !p.conns.size && !p.held) people.delete(p.id); };

  // The row a person shows in a zone now, before its generation is decided: a quiet hold's until they speak again here.
  const visible = (p, zone) => {
    const live = shown(p, zone), h = p.held;
    if (!h || h.zone !== zone || live && live.role === "speaker") return live;
    return !live && clock() >= h.quietUntil ? { ...h.base, reconnecting: true } : h.base;
  };
  const shown = (p, zone) => {
    if (p.world && p.world.zone === zone) return { role: "speaker", source: "world", mic: p.world.mic, hand: p.world.hand || "", speaking: !!p.world.speaking, character: p.world.character || null, since: 0 };
    // `since`: when they took the stage, or for a listener when their earliest connection here joined, so a roster can
    // put the longest-running first; both ride the connections' attachments, so a wake keeps them.
    let listener = 0;
    for (const c of p.conns.values()) {
      if (c.zone !== zone) continue;
      if (c.lease && c.lease.state === "active") return { role: "speaker", source: "chat", mic: c.mic, hand: c.hand || "", speaking: !!c.speaking, character: c.lease.character || p.info.character || null, since: c.lease.since || 0,
        via: typeof c.principal === "string" && c.principal.startsWith("ob_") ? "island" : "app" };
      const at = c.joinedAt || 1;
      listener = listener ? Math.min(listener, at) : at;
    }
    return listener ? { role: "listener", source: "chat", mic: "off", hand: "", speaking: false, character: null, since: listener } : null;
  };

  const rowOf = (p, zone, base, generation) => ({
    id: p.id, generation, provider: p.info.provider, login: p.info.login, display: p.info.display || p.info.login,
    avatar: base.source === "chat" ? p.info.avatar || null : null,
    contributions: base.source === "world" && Number.isSafeInteger(p.info.contributions) ? p.info.contributions : null,
    ...base, ...standing(p.id),
    // Which app an Ooga Chat source listens or speaks from: the island's page (an `ob_` principal) or Ooga Chat's.
    ...(base.role === "speaker" && walkers.has(p.id) ? { walking: true } : {}),
    via: base.via || base.source === "world" ? base.via || "island" : [...p.conns.values()].some((c) => c.zone === zone && typeof c.principal === "string" && c.principal.startsWith("ob_")) ? "island" : "app",
  });

  const commit = () => {
    const deltas = [];
    const byZone = new Map();
    for (const key of touched) {
      const bar = key.indexOf("|"), zone = key.slice(0, bar), id = key.slice(bar + 1);
      const z = zones[zone], p = people.get(id), old = z.rows.get(id);
      const base = p ? visible(p, zone) : null;
      let row = null;
      if (base) {
        const sourceKey = `${base.role}:${base.source}`;
        // A new source, or a return after being gone, is a new generation; anything else keeps it. Generations follow the
        // clock and only rise, so an object woken from hibernation never issues one lower than a client already holds.
        if (!old || p.shown[zone] !== sourceKey) p.gen = Math.max(clock(), p.gen + 1);
        p.shown[zone] = sourceKey;
        row = rowOf(p, zone, base, p.gen);
      } else if (p) delete p.shown[zone];
      if (sameRow(old, row)) continue;
      let change = byZone.get(zone);
      if (!change) { change = { upsert: [], remove: [] }; byZone.set(zone, change); }
      if (row) { z.rows.set(id, row); change.upsert.push(row); }
      else { z.rows.delete(id); change.remove.push({ id, generation: old.generation }); }
    }
    touched.clear();
    for (const [zone, change] of byZone) {
      const z = zones[zone], base = z.rev;
      z.rev++;
      deltas.push({ zone, epoch, base, rev: z.rev, upsert: change.upsert, remove: change.remove });
    }
    for (const p of [...people.values()]) forget(p);
    return deltas;
  };

  const snapshot = (zone) => ({ zone, epoch, rev: zones[zone].rev, rows: [...zones[zone].rows.values()] });

  // `except`: an identity left out of the speakers counted, so one taking back their own held place is not held off by it.
  const counts = (zone, except = null) => {
    let listeners = 0, chatSpeakers = 0;
    const counted = new Set();
    for (const p of people.values()) {
      let here = false, speaking = !!p.held && p.held.zone === zone && p.held.base.role === "speaker";
      for (const c of p.conns.values()) {
        if (c.zone !== zone) continue;
        here = true;
        if (c.lease) speaking = true;
      }
      if (speaking) { if (p.id !== except) { chatSpeakers++; counted.add(p.id); } } else if (here) listeners++;
    }
    for (const id of reserved()) if (id !== except && !counted.has(id)) { counted.add(id); chatSpeakers++; }
    return { listeners, chatSpeakers };
  };

  // --- Ooga Chat connections ---
  const refuse = (code, extra = {}) => ({ ok: false, code, ...extra });

  /** A connection arrives (or is restored after hibernation). `info` is the identity's display data. */
  const connect = (conn, info, restoring = false) => {
    if (!ID.test(conn.id)) return refuse("malformed");
    const p = person(conn.id, info);
    if (!restoring) {
      if (conns.size >= limits.connections) return refuse("audience_full");
      if (p.conns.size >= limits.connectionsPerIdentity) return refuse("too_many_connections");
    }
    const c = { connId: conn.connId, id: conn.id, zone: null, lease: null, mic: "muted", hand: "", speaking: false, forced: false, ...conn };
    p.conns.set(c.connId, c);
    conns.set(c.connId, c);
    if (c.zone) touch(c.id, c.zone);
    return { ok: true, conn: c };
  };

  /** One zone a connection; joining the zone it is in changes nothing (no mute, no lost hand, no new seat). */
  const join = (connId, zone) => {
    const c = conns.get(connId);
    if (!c) return refuse("unknown_connection");
    if (!isZone(zone)) return refuse("zone_unavailable");
    if (c.zone === zone) return { ok: true, changed: false };
    const p = people.get(c.id);
    const elsewhere = [...p.conns.values()].some((o) => o !== c && o.zone === zone);
    if (!elsewhere && counts(zone).listeners >= limits.listeners) return refuse("audience_full");
    if (c.zone) touch(c.id, c.zone);
    c.zone = zone;
    c.joinedAt = clock();
    // A real change of zone starts the new one as a listener, muted, with no hand and no lease.
    const lease = c.lease;
    c.lease = null; c.mic = "muted"; c.hand = ""; c.speaking = false; c.forced = false;
    // Back where a quiet hold stands for them, their row loses its reconnecting mark (`visible`) and stands on.
    touch(c.id, zone);
    return { ok: true, changed: true, endedLease: lease };
  };

  // `quiet` (`{ quietUntil, until }`): a quiet hold for someone whose row should stand meanwhile (a chat's speaker or
  // manager); only their last connection in the zone holds it, and a speaker's row is held over another's listener row.
  const disconnect = (connId, quiet = null) => {
    const c = conns.get(connId);
    if (!c) return null;
    const p = people.get(c.id);
    if (quiet && c.zone) {
      const base = visible(p, c.zone);
      const others = [...p.conns.values()].some((o) => o !== c && o.zone === c.zone && (o.lease || base && base.role !== "speaker"));
      if (base && !others) p.held = { zone: c.zone, quietUntil: quiet.quietUntil, until: quiet.until, marked: false, base: { ...base, speaking: false, reconnecting: false } };
    }
    conns.delete(connId);
    p.conns.delete(connId);
    if (c.zone) touch(c.id, c.zone);
    return c;
  };

  /** A quiet hold for a connection still here whose speaker row should stand while it publishes again. */
  const hold = (connId, until) => {
    const c = conns.get(connId);
    if (!c || !c.zone || !c.lease || c.lease.state !== "active") return false;
    const p = people.get(c.id), base = visible(p, c.zone);
    if (!base || base.role !== "speaker") return false;
    p.held = { zone: c.zone, quietUntil: until, until, marked: false, base: { ...base, speaking: false, reconnecting: false } };
    return true;
  };

  /**
   * Quiet holds whose time has come: past their first moments they show as reconnecting, past their end what is true
   * now. `id` ends that identity's at once. Returns the identities whose rows changed.
   */
  const expire = (now, id = null) => {
    const out = [];
    for (const p of people.values()) {
      const h = p.held;
      if (!h || id && p.id !== id) continue;
      if (id || h.until <= now) { p.held = null; touch(p.id, h.zone); out.push(p.id); }
      else if (!h.marked && h.quietUntil <= now) { h.marked = true; touch(p.id, h.zone); out.push(p.id); }
    }
    return out;
  };
  /** The quiet holds, for storage, and back again on a wake (`restoreQuiet`), before the rows are rebuilt. */
  const quietList = () => [...people.values()].filter((p) => p.held).map((p) => ({ id: p.id, info: p.info, held: p.held }));
  const restoreQuiet = (list) => {
    for (const q of Array.isArray(list) ? list : []) {
      if (!q || !ID.test(q.id) || !q.held || !isZone(q.held.zone) || !q.held.base) continue;
      const p = person(q.id, q.info || {});
      p.held = q.held;
      touch(p.id, q.held.zone);
    }
  };
  /** The earliest quiet hold's end. */
  const quietUntil = () => { let next = Infinity; for (const p of people.values()) if (p.held) next = Math.min(next, p.held.marked ? p.held.until : p.held.quietUntil); return next; };

  /** Ask to speak: `capability` is the island's answer, checked by the caller just before. */
  const requestSpeaker = (connId, { eligible, generation, until, character = null }) => {
    const c = conns.get(connId);
    if (!c) return refuse("unknown_connection");
    if (!c.zone) return refuse("zone_required");
    if (!eligible) return refuse("capability_required");
    if (c.lease) return { ok: true, lease: c.lease, changed: false };
    const p = people.get(c.id);
    if (p.active || p.world) return refuse("source_in_use");
    for (const o of p.conns.values()) if (o !== c && o.lease) return refuse("source_in_use");
    if (counts(c.zone, c.id).chatSpeakers >= limits.chatSpeakers) return refuse("speaker_capacity", { retryable: true });
    c.lease = { state: "pending", generation, until, character };
    c.mic = "muted"; c.hand = "";
    return { ok: true, lease: c.lease, changed: true };
  };

  /** The seats this zone's active speakers hold now. */
  const seatsTaken = (zone) => new Set([...conns.values()].filter((o) => o.zone === zone && o.lease && o.lease.seat).map((o) => o.lease.seat));

  /**
   * The microphone is published (#666): the lease of that generation becomes a muted speaker on a cloud seat of its
   * zone's catalog (#668), the same seat for the life of the lease. A full catalog is no speaker, never a shared seat.
   */
  const activate = (connId, generation) => {
    const c = conns.get(connId);
    if (!c || !c.lease || c.lease.generation !== generation) return refuse("stale_epoch");
    if (c.lease.state === "active") return { ok: true, changed: false };
    const seated = seats();
    const seat = seated ? freeSeat(c.zone, seatsTaken(c.zone)) : null;
    if (seated && !seat) return refuse("speaker_capacity", { retryable: true });
    // Back from a quiet hold: the row carries on where it stood, its place in the order kept.
    const p = people.get(c.id), back = p.held && p.held.zone === c.zone && p.held.base.role === "speaker" ? p.held.base.since : 0;
    const unheld = !!p.held && p.held.zone === c.zone;
    if (unheld) { p.held = null; quietDirty = true; }
    c.lease = { state: "active", generation, seat, character: c.lease.character || null, since: back || clock() };
    c.mic = "muted";
    touch(c.id, c.zone);
    return { ok: true, changed: true, unheld };
  };

  /** Back to listening (Leave Voice, a lost microphone, an expiry, a revocation): the lease, hand and mic go. */
  const endLease = (connId, generation = null) => {
    const c = conns.get(connId);
    if (!c || !c.lease || generation !== null && c.lease.generation !== generation) return null;
    const lease = c.lease;
    c.lease = null; c.mic = "muted"; c.hand = ""; c.speaking = false; c.forced = false;
    if (c.zone) touch(c.id, c.zone);
    return lease;
  };

  /** A speaker's persistent hand: only under an active lease; lowering is always allowed and idempotent. */
  const setHand = (connId, hand) => {
    const c = conns.get(connId);
    if (!c) return refuse("unknown_connection");
    if (hand && (!c.lease || c.lease.state !== "active")) return refuse("capability_required");
    if (c.hand === (hand || "")) return { ok: true, changed: false };
    c.hand = hand || "";
    if (c.zone) touch(c.id, c.zone);
    return { ok: true, changed: true };
  };

  // `forced`: a host muted them (chat-roles.js), and their voice is not pulled until they unmute it themselves.
  const setMic = (connId, muted, forced = false) => {
    const c = conns.get(connId);
    if (!c || !c.lease || c.lease.state !== "active") return refuse("capability_required");
    const mic = muted ? "muted" : "on";
    const wasForced = c.forced;
    c.forced = muted ? wasForced || forced : false;
    if (c.mic === mic) return { ok: true, changed: false, released: wasForced && !c.forced };
    c.mic = mic;
    touch(c.id, c.zone);
    return { ok: true, changed: true, released: wasForced && !c.forced };
  };

  // --- the island's sources ---

  /**
   * The island's whole word on its players: `speakers` publishing outdoors (`{ id, zone, mic, character, info }`) and
   * `active`, every identity in the island's voice anywhere. Replaces the last word; returns the chat leases it ended.
   */
  const setWorld = (speakers, active) => {
    const ended = [];
    const next = new Map(speakers.filter((s) => ID.test(s.id) && isZone(s.zone)).map((s) => [s.id, s]));
    const activeSet = new Set(active.filter((id) => ID.test(id)));
    for (const s of next.values()) activeSet.add(s.id);
    for (const p of people.values()) {
      if (p.world && !next.has(p.id)) { touch(p.id, p.world.zone); p.world = null; }
      p.active = activeSet.has(p.id);
    }
    for (const s of next.values()) {
      const p = person(s.id, s.info);
      const was = p.world;
      if (was && was.zone !== s.zone) touch(p.id, was.zone);
      p.world = { zone: s.zone, mic: s.mic === "on" ? "on" : "muted", character: s.character || null, hand: s.hand || "", speaking: !!s.speaking };
      touch(p.id, s.zone);
    }
    for (const id of activeSet) {
      const p = person(id, null);
      p.active = true;
      // The island's source wins: any chat lease of the same identity ends first.
      for (const c of p.conns.values()) if (c.lease) { ended.push({ connId: c.connId, lease: c.lease }); endLease(c.connId); }
    }
    return ended;
  };

  /** The copy's word on who walks it now: every row whose mark changes is touched. */
  const setWalking = (ids) => {
    const next = new Set(ids.filter((id) => ID.test(id)));
    for (const id of new Set([...walkers, ...next])) {
      if (walkers.has(id) === next.has(id)) continue;
      if (next.has(id)) walkers.add(id); else walkers.delete(id);
      for (const zone of ZONES) if (zones[zone].rows.has(id)) touch(id, zone);
    }
  };

  const setInfo = (id, info) => {
    const p = people.get(id);
    if (!p) return;
    Object.assign(p.info, info);
    for (const zone of ZONES) if (zones[zone].rows.has(id)) touch(id, zone);
  };

  const youOf = (connId) => {
    const c = conns.get(connId);
    if (!c) return { id: null, speak: "none" };
    const p = people.get(c.id);
    const speak = c.lease ? (c.lease.state === "active" ? "active" : "pending")
      : may(c) && !p.active && !p.world ? "eligible" : may(c) ? "denied" : "none";
    // The lease's generation names it in the media calls (#666, #654): only this connection's own page hears it.
    if (c.lease) return { id: c.id, speak, lease: c.lease.generation };
    // Where the identity's voice is while it is not here: the island's, or another of its Ooga Chat connections', which
    // an eligible connection may take on the visitor's word (`setRole` with `takeover`).
    const elsewhere = !may(c) ? "" : p.active || p.world ? "island" : heldElsewhere(c) ? "app" : "";
    return elsewhere ? { id: c.id, speak, elsewhere } : { id: c.id, speak };
  };
  const heldElsewhere = (c) => {
    for (const o of people.get(c.id).conns.values()) if (o !== c && o.lease) return true;
    return false;
  };

  return {
    get epoch() { return epoch; }, zones, people, conns,
    quietChanged: () => { const was = quietDirty; quietDirty = false; return was; },
    connect, join, disconnect, hold, expire, quietUntil, quietList, restoreQuiet, requestSpeaker, activate, endLease, setMic, setHand, setWorld, setInfo, seatsTaken, setWalking, walkers,
    commit, snapshot, counts, youOf, touch,
    revs: () => Object.fromEntries(ZONES.map((zone) => [zone, zones[zone].rev])),
  };
};

// --- the two clients' shapes of one row ---

/** Ooga Chat's audience protocol 1 (docs/ooga-chat-app.md): `source` `world` or `app`, `face`, `muted`. */
export const appRow = (row, self = null) => ({
  id: row.id, generation: row.generation, source: row.source === "world" ? "world" : "app", role: row.role,
  login: row.login, display: row.display, face: row.avatar, contributions: row.contributions, muted: row.mic === "muted",
  provider: row.provider, character: row.character, mic: row.mic, speaking: row.speaking, hand: row.hand,
  ...(row.rank ? { rank: row.rank } : {}), ...(row.request ? { request: row.request, askedAt: row.askedAt } : {}),
  ...(row.walking ? { walking: true } : {}), ...(row.rankSince ? { rankSince: row.rankSince } : {}), ...(row.since ? { since: row.since } : {}), ...(row.via ? { via: row.via } : {}),
  ...(row.reconnecting ? { reconnecting: true } : {}),
  ...(self === row.id ? { self: true } : {}),
});

/** The island's panel (`audience-v1`, src/js/audience.js): `source` `world` or `chat` for speakers alone. */
export const islandRow = (row, self = null) => {
  const out = { id: row.id, login: row.login, display: row.display, provider: row.provider, role: row.role };
  if (row.role === "speaker") Object.assign(out, { source: row.source, mic: row.mic, speaking: row.speaking, hand: row.hand });
  if (row.character && row.source === "world") out.character = row.character;
  if (row.avatar) out.avatar = row.avatar;
  if (row.contributions !== null) out.contributions = row.contributions;
  if (row.rank) out.rank = row.rank;
  if (row.request) { out.request = row.request; out.askedAt = row.askedAt; }
  if (self === row.id) out.self = true;
  return out;
};
