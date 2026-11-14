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
  && a.avatar === b.avatar && a.character === b.character && a.contributions === b.contributions;

export const createAudience = ({ epoch = Date.now(), limits = DEFAULT_LIMITS, revs = null, clock = Date.now } = {}) => {
  const zones = Object.fromEntries(ZONES.map((zone) => [zone, { rev: revs && Number.isSafeInteger(revs[zone]) ? revs[zone] : 0, rows: new Map() }]));
  // id -> { info, world, active, conns: Map<connId, conn>, gen, source: { zone: last visible source key } }
  const people = new Map();
  const conns = new Map();
  const touched = new Set();
  const touch = (id, zone) => touched.add(`${zone}|${id}`);

  const person = (id, info) => {
    let p = people.get(id);
    if (!p) { p = { id, info: { ...info }, world: null, active: false, conns: new Map(), gen: 0, shown: {} }; people.set(id, p); }
    else if (info) Object.assign(p.info, info);
    return p;
  };
  const forget = (p) => { if (!p.world && !p.active && !p.conns.size) people.delete(p.id); };

  // The row a person shows in a zone now, before its generation is decided.
  const visible = (p, zone) => {
    if (p.world && p.world.zone === zone) return { role: "speaker", source: "world", mic: p.world.mic, hand: p.world.hand || "", speaking: !!p.world.speaking, character: p.world.character || null };
    let listener = false;
    for (const c of p.conns.values()) {
      if (c.zone !== zone) continue;
      if (c.lease && c.lease.state === "active") return { role: "speaker", source: "chat", mic: c.mic, hand: c.hand || "", speaking: !!c.speaking, character: c.lease.character || p.info.character || null };
      listener = true;
    }
    return listener ? { role: "listener", source: "chat", mic: "off", hand: "", speaking: false, character: null } : null;
  };

  const rowOf = (p, zone, base, generation) => ({
    id: p.id, generation, provider: p.info.provider, login: p.info.login, display: p.info.display || p.info.login,
    avatar: base.source === "chat" ? p.info.avatar || null : null,
    contributions: base.source === "world" && Number.isSafeInteger(p.info.contributions) ? p.info.contributions : null,
    ...base,
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

  const counts = (zone) => {
    let listeners = 0, chatSpeakers = 0;
    for (const p of people.values()) {
      let here = false, speaking = false;
      for (const c of p.conns.values()) {
        if (c.zone !== zone) continue;
        here = true;
        if (c.lease) speaking = true;
      }
      if (speaking) chatSpeakers++; else if (here) listeners++;
    }
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
    const c = { connId: conn.connId, id: conn.id, zone: null, lease: null, mic: "muted", hand: "", speaking: false, ...conn };
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
    // A real change of zone starts the new one as a listener, muted, with no hand and no lease.
    const lease = c.lease;
    c.lease = null; c.mic = "muted"; c.hand = ""; c.speaking = false;
    touch(c.id, zone);
    return { ok: true, changed: true, endedLease: lease };
  };

  const disconnect = (connId) => {
    const c = conns.get(connId);
    if (!c) return null;
    conns.delete(connId);
    const p = people.get(c.id);
    p.conns.delete(connId);
    if (c.zone) touch(c.id, c.zone);
    return c;
  };

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
    if (counts(c.zone).chatSpeakers >= limits.chatSpeakers) return refuse("speaker_capacity", { retryable: true });
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
    const seat = freeSeat(c.zone, seatsTaken(c.zone));
    if (!seat) return refuse("speaker_capacity", { retryable: true });
    c.lease = { state: "active", generation, seat, character: c.lease.character || null };
    c.mic = "muted";
    touch(c.id, c.zone);
    return { ok: true, changed: true };
  };

  /** Back to listening (Leave Voice, a lost microphone, an expiry, a revocation): the lease, hand and mic go. */
  const endLease = (connId, generation = null) => {
    const c = conns.get(connId);
    if (!c || !c.lease || generation !== null && c.lease.generation !== generation) return null;
    const lease = c.lease;
    c.lease = null; c.mic = "muted"; c.hand = ""; c.speaking = false;
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

  const setMic = (connId, muted) => {
    const c = conns.get(connId);
    if (!c || !c.lease || c.lease.state !== "active") return refuse("capability_required");
    const mic = muted ? "muted" : "on";
    if (c.mic === mic) return { ok: true, changed: false };
    c.mic = mic;
    touch(c.id, c.zone);
    return { ok: true, changed: true };
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
      : c.eligible && !p.active && !p.world ? "eligible" : c.eligible ? "denied" : "none";
    return { id: c.id, speak };
  };

  return {
    get epoch() { return epoch; }, zones, people, conns,
    connect, join, disconnect, requestSpeaker, activate, endLease, setMic, setHand, setWorld, setInfo, seatsTaken,
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
  ...(self === row.id ? { self: true } : {}),
});

/** The island's panel (`audience-v1`, src/js/audience.js): `source` `world` or `chat` for speakers alone. */
export const islandRow = (row, self = null) => {
  const out = { id: row.id, login: row.login, display: row.display, provider: row.provider, role: row.role };
  if (row.role === "speaker") Object.assign(out, { source: row.source, mic: row.mic, speaking: row.speaking, hand: row.hand });
  if (row.character && row.source === "world") out.character = row.character;
  if (row.avatar) out.avatar = row.avatar;
  if (row.contributions !== null) out.contributions = row.contributions;
  if (self === row.id) out.self = true;
  return out;
};
