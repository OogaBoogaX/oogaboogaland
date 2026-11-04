// Host-owned session lifecycle (#377, draft foundation; nothing wires it yet). Pure and synchronous: every mutator takes
// the authoritative time in epoch milliseconds, and nothing here runs a timer, stores input, shots or thrust, or keeps
// history. One record per authenticated account binds its one body (an Ooga or a clanker) to a server-made token and a
// generation drawn from a persisted, strictly increasing counter, so a superseded (generation, token) can never match
// again. A confirmed disconnect neutralizes the body's holds (the `neutralize` effect, applied by the host) and keeps it,
// its equipment and mode for GRACE_MS from the confirmed close (or, unknown after a restart, the last confirmed presence);
// the host's passive stepper may move it meanwhile. Strictly before the deadline the account reclaims it; at or after, the
// record becomes a `depart` intent keyed by its generation that carries the body as it was. The host applies the intent
// (`markApplied`, in the same atomic commit as its simulation handback) and it then stays as a tombstone until its visual
// delivery is acknowledged. Sessions and departures share MAX_SESSIONS slots. The parent checkpoints after a mutation and
// before publishing its effects.
export const CHECKPOINT_VERSION = 2, MAX_SESSIONS = 64, GRACE_MS = 60000;
export const PASSIVE_STEP_MS = 50;
export const OCCUPANCY_KINDS = Object.freeze(["hammock", "cabinet"]);
export const BODY_KINDS = Object.freeze(["ooga", "clanker"]);
export const WEAPONS = Object.freeze([null, "primary", "gun"]);
export const MODES = Object.freeze(["carry", "combat"]);
export const LIMITS = Object.freeze({ position: 1e6, velocity: 1e4, yaw: 2 * Math.PI, magazine: 30, spares: 2, fuel: 1 });
const REASONS = ["expired", "release", "revoke"];
const ID = /^[A-Za-z0-9._:/-]{1,64}$/, TOKEN = /^[0-9a-f]{32}$/;
const MOTION = ["x", "y", "z", "yaw", "vx", "vy", "vz", "grounded"];
const EQUIPMENT = ["weapon", "mode", "magazine", "spareAmmo", "primaryOwned", "secondaryOwned", "selectedSlot", "unlimited",
  "jetpack", "jetpackOwned", "fuel"];
const SESSION = ["accountId", "bodyId", "kind", "generation", "token", "zone", "state", "lastSeenAt", "deadline", "stepAt",
  "motion", "equipment", "occupancy"];
const PENDING = ["id", "type", "glyph", "accountId", "bodyId", "generation", "reason", "at", "handback", "zone", "body", "applied"];
const TOP = ["v", "protocol", "world", "clock", "nextGeneration", "sessions", "pending"];

const isId = (v) => typeof v === "string" && ID.test(v);
const isAccount = (v) => Number.isSafeInteger(v) && v > 0;
// Every time can become a grace start, so its deadline must stay a safe integer too.
const isTime = (v) => Number.isSafeInteger(v) && v >= 0 && Number.isSafeInteger(v + GRACE_MS);
const isVersion = (v) => typeof v === "string" ? v.length > 0 && v.length <= 64 : Number.isSafeInteger(v) && v >= 0;
const bounded = (v, max) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max;
const count = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const plain = (o, keys) => o !== null && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

const readMotion = (m) => {
  if (!plain(m, MOTION) || typeof m.grounded !== "boolean" || !bounded(m.yaw, LIMITS.yaw)) return null;
  if (![m.x, m.y, m.z].every((v) => bounded(v, LIMITS.position)) || ![m.vx, m.vy, m.vz].every((v) => bounded(v, LIMITS.velocity))) return null;
  return { x: m.x, y: m.y, z: m.z, yaw: m.yaw, vx: m.vx, vy: m.vy, vz: m.vz, grounded: m.grounded };
};
// Ordered and dense: one entry per spare magazine, in the order the body would load them.
const readSpares = (a) => {
  if (!Array.isArray(a) || a.length > LIMITS.spares || Object.keys(a).length !== a.length) return null;
  for (let i = 0; i < a.length; i++) if (!Object.hasOwn(a, i) || !count(a[i], LIMITS.magazine)) return null;
  return a.slice();
};
const readEquipment = (e) => {
  if (!plain(e, EQUIPMENT) || !WEAPONS.includes(e.weapon) || !MODES.includes(e.mode) || !count(e.magazine, LIMITS.magazine)) return null;
  const spareAmmo = readSpares(e.spareAmmo);
  if (!spareAmmo || (e.selectedSlot !== 1 && e.selectedSlot !== 2)
    || ![e.primaryOwned, e.secondaryOwned, e.unlimited, e.jetpack, e.jetpackOwned].every((b) => typeof b === "boolean")
    || typeof e.fuel !== "number" || !(e.fuel >= 0 && e.fuel <= LIMITS.fuel)) return null;
  return { weapon: e.weapon, mode: e.mode, magazine: e.magazine, spareAmmo, primaryOwned: e.primaryOwned,
    secondaryOwned: e.secondaryOwned, selectedSlot: e.selectedSlot, unlimited: e.unlimited, jetpack: e.jetpack,
    jetpackOwned: e.jetpackOwned, fuel: e.fuel };
};
const copyEquipment = (e) => ({ ...e, spareAmmo: e.spareAmmo.slice() });
const readOccupancy = (o) => plain(o, ["kind", "id"]) && OCCUPANCY_KINDS.includes(o.kind) && isId(o.id) ? { kind: o.kind, id: o.id } : null;
const readBody = (b) => {
  if (!plain(b, ["kind", "motion", "equipment"]) || !BODY_KINDS.includes(b.kind)) return null;
  const motion = readMotion(b.motion), equipment = readEquipment(b.equipment);
  return motion && equipment ? { kind: b.kind, motion, equipment } : null;
};
const readRef = (ref) => plain(ref, ["accountId", "generation", "token"]) && isAccount(ref.accountId)
  && Number.isSafeInteger(ref.generation) && ref.generation >= 1 && typeof ref.token === "string" && TOKEN.test(ref.token);
const refuse = (reason, effects = []) => ({ ok: false, reason, effects });
const fail = (why) => { throw new TypeError(`invalid host-sessions checkpoint: ${why}`); };

export class SessionRegistry {
  #sessions = new Map(); // accountId -> record, every field plain data
  #pending = [];
  #clock = 0;
  #next = 1;
  #ready = true;
  #remaining = Infinity;
  #used = 0;

  // adapter (host-owned, trusted): stepPassive(motion & { bodyId, zone, kind }, dtMs) -> motion (with yaw);
  // npcFor(bodyId) -> existing NPC id or null; validateOccupancy({ bodyId, zone, x, y, z }, { kind, id }) -> true to admit.
  // A passive step requires a real collision adapter. passiveBudget, when supplied,
  // is shared by every call on this registry instance: restore once per host
  // transaction. The standalone default retains the original complete sweep
  // (still bounded by 64 bodies * 1200 substeps). A budget must cover one body's
  // full grace so authenticated reconnect priority cannot starve it.
  constructor({ protocol, world, adapter = {}, passiveBudget, maxSessions = MAX_SESSIONS } = {}) {
    if (!isVersion(protocol) || !isVersion(world)) throw new TypeError("host-sessions needs protocol and world versions");
    if (passiveBudget !== undefined && (!Number.isSafeInteger(passiveBudget) || passiveBudget < GRACE_MS / PASSIVE_STEP_MS
      || passiveBudget > MAX_SESSIONS * GRACE_MS / PASSIVE_STEP_MS)) throw new TypeError("host-sessions: invalid passive budget");
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > MAX_SESSIONS) throw new TypeError("host-sessions: invalid capacity");
    this.maxSessions = maxSessions;
    this.#remaining = passiveBudget ?? Infinity;
    this.protocol = protocol;
    this.world = world;
    this.adapter = adapter;
  }

  // A restored registry refuses every mutation until recover(now, liveTokens, closes) runs. Only CHECKPOINT_VERSION
  // restores: an older draft checkpoint lacks the body's kind, yaw and equipment, and is never migrated.
  static restore(checkpoint, options) {
    const r = new SessionRegistry(options);
    if (!plain(checkpoint, TOP)) fail("shape");
    const { v, protocol, world, clock, nextGeneration, sessions, pending } = checkpoint;
    if (v !== CHECKPOINT_VERSION) fail("version");
    if (protocol !== r.protocol || world !== r.world) fail("protocol or world mismatch");
    if (!isTime(clock) || !Number.isSafeInteger(nextGeneration) || nextGeneration < 1) fail("counters");
    if (!Array.isArray(sessions) || !Array.isArray(pending) || sessions.length + pending.length > r.maxSessions) fail("capacity");
    const bodies = new Set(), tokens = new Set(), generations = new Set(), held = new Set();
    const generation = (g) => {
      if (!Number.isSafeInteger(g) || g < 1 || g >= nextGeneration || generations.has(g)) fail("generation");
      generations.add(g);
    };
    for (const s of sessions) {
      if (!plain(s, SESSION) || !isAccount(s.accountId) || r.#sessions.has(s.accountId)) fail("session account");
      if (!isId(s.bodyId) || bodies.has(s.bodyId) || !isId(s.zone) || !BODY_KINDS.includes(s.kind)) fail("session body");
      if (typeof s.token !== "string" || !TOKEN.test(s.token) || tokens.has(s.token)) fail("session token");
      generation(s.generation);
      if (!isTime(s.lastSeenAt) || !isTime(s.stepAt) || s.lastSeenAt > clock || s.stepAt > clock) fail("session times");
      if (s.state === "live") { if (s.deadline !== null || s.stepAt !== s.lastSeenAt) fail("live deadline"); }
      else if (s.state === "grace") {
        if (s.deadline !== s.lastSeenAt + GRACE_MS || s.stepAt < s.lastSeenAt || s.stepAt >= s.deadline) fail("grace deadline");
      } else fail("session state");
      const motion = readMotion(s.motion), equipment = readEquipment(s.equipment);
      if (!motion || !equipment) fail("session body data");
      let occupancy = null;
      if (s.occupancy !== null) {
        occupancy = readOccupancy(s.occupancy);
        const key = occupancy && `${occupancy.kind}:${occupancy.id}`;
        if (!occupancy || held.has(key)) fail("occupancy");
        held.add(key);
      }
      bodies.add(s.bodyId);
      tokens.add(s.token);
      r.#sessions.set(s.accountId, { accountId: s.accountId, bodyId: s.bodyId, kind: s.kind, generation: s.generation,
        token: s.token, zone: s.zone, state: s.state, lastSeenAt: s.lastSeenAt, deadline: s.deadline, stepAt: s.stepAt,
        motion, equipment, occupancy });
    }
    for (const p of pending) {
      if (!plain(p, PENDING) || p.type !== "depart" || p.glyph !== "green" || !REASONS.includes(p.reason)) fail("pending shape");
      if (!isAccount(p.accountId) || !isId(p.bodyId) || bodies.has(p.bodyId) || !isTime(p.at) || p.at > clock) fail("pending fields");
      if (!isId(p.zone) || typeof p.applied !== "boolean") fail("pending fields");
      generation(p.generation);
      if (p.id !== `depart:${p.generation}`) fail("pending id");
      let handback = null;
      if (p.handback !== null) {
        if (!plain(p.handback, ["npc"]) || !isId(p.handback.npc)) fail("pending handback");
        handback = { npc: p.handback.npc };
      }
      const body = readBody(p.body);
      if (!body) fail("pending body");
      bodies.add(p.bodyId);
      r.#pending.push({ id: p.id, type: "depart", glyph: "green", accountId: p.accountId, bodyId: p.bodyId,
        generation: p.generation, reason: p.reason, at: p.at, handback, zone: p.zone, body, applied: p.applied });
    }
    r.#clock = clock;
    r.#next = nextGeneration;
    r.#ready = false;
    return r;
  }

  // After restore. closes: at most MAX_SESSIONS trusted server observations { ref: { accountId, generation, token }, at }
  // of transport closes the checkpoint may not hold. A close matching a live record enters grace at its own time (the
  // earliest, if repeated), before anything is inferred; a close for a record already in grace, superseded or gone does
  // nothing and never extends a deadline. Then records whose token is in liveTokens keep their transport, every other live
  // record enters grace from its persisted lastSeenAt (never from now), grace deadlines stay as saved, and anything already
  // due departs. Malformed input throws before anything changes; if an adapter throws, discard this instance and restore again.
  recover(now, liveTokens = [], closes = [], priorityAccount = null) {
    if (this.#ready) throw new Error("host-sessions: recover() only follows restore()");
    if (!isTime(now)) throw new TypeError("host-sessions: time must be epoch milliseconds");
    if (priorityAccount !== null && !isAccount(priorityAccount)) throw new TypeError("host-sessions: invalid recovery priority");
    if (!Array.isArray(liveTokens) || liveTokens.length > MAX_SESSIONS || !liveTokens.every((t) => typeof t === "string")) {
      throw new TypeError("host-sessions: liveTokens must be at most MAX_SESSIONS strings");
    }
    if (!Array.isArray(closes) || closes.length > MAX_SESSIONS) throw new TypeError("host-sessions: closes must be at most MAX_SESSIONS observations");
    const closing = new Map(); // live record -> its earliest confirmed close
    for (const c of closes) {
      if (!plain(c, ["ref", "at"]) || !readRef(c.ref)) throw new TypeError("host-sessions: a close is { ref, at }");
      if (!isTime(c.at) || c.at > now) throw new RangeError("host-sessions: a close must be epoch milliseconds no later than now");
      const r = this.#live(c.ref);
      if (!r) continue;
      if (c.at < r.lastSeenAt) throw new RangeError("host-sessions: a close cannot precede its session's last presence");
      const prior = closing.get(r);
      if (prior === undefined || c.at < prior) closing.set(r, c.at);
    }
    const live = new Set(liveTokens), effects = [];
    const t = this.#clock = Math.max(this.#clock, now);
    for (const [r, at] of closing) this.#toGrace(r, at, effects);
    for (const r of this.#sessions.values()) {
      if (r.state !== "live" || live.has(r.token)) continue;
      this.#toGrace(r, r.lastSeenAt, effects);
    }
    this.#sweep(t, effects, priorityAccount);
    this.#ready = true;
    return { effects };
  }

  // Parent-only finite-run shutdown: every still-live record enters grace at the persisted run stop time `at`, existing
  // grace deadlines stay, and the registry advances to now. It admits and reconnects nobody, and repeating it (after a
  // restore and recover too) changes nothing more. The parent blocks every other session operation after its run ends.
  drain(at, now) {
    const t = this.#at(now);
    if (!isTime(at) || at > now) throw new TypeError("host-sessions: drain time must be epoch milliseconds no later than now");
    for (const r of this.#sessions.values()) {
      if (r.state === "live" && r.lastSeenAt > at) throw new RangeError("host-sessions: drain cannot precede a session's last presence");
    }
    const effects = [];
    for (const r of this.#sessions.values()) if (r.state === "live") this.#toGrace(r, at, effects);
    this.#sweep(t, effects);
    this.#clock = t;
    return { effects };
  }

  // claim: { protocol, world, accountId, bodyId, zone, body: { kind, motion, equipment } }. accountId must come from the
  // host's authentication. A new body needs `body` (host world state); a resumed or duplicated one keeps its own body,
  // kind, zone, equipment and mode and ignores the claim's.
  connect(claim, now) {
    if (claim === null || typeof claim !== "object") return refuse("invalid");
    if (claim.protocol !== this.protocol || claim.world !== this.world) return refuse("version");
    const { accountId, bodyId, zone } = claim;
    if (!isAccount(accountId) || !isId(bodyId) || !isId(zone)) return refuse("invalid");
    const body = claim.body === undefined ? null : readBody(claim.body);
    if (claim.body !== undefined && !body) return refuse("invalid");
    const t = this.#at(now), effects = [];
    this.#sweep(t, effects);
    this.#clock = t;
    let r = this.#sessions.get(accountId);
    let resumed = false;
    if (r) {
      if (r.bodyId !== bodyId) return refuse("account-bound", effects);
      // A bounded recovery may still be behind. Never reclaim an old pose or
      // revive an expired body. The host's typed connect prioritizes this account
      // before reaching here, so a timely authenticated reconnect need not wait
      // behind unrelated recovery work.
      if (r.state === "grace" && (r.stepAt < Math.min(t, r.deadline) || t >= r.deadline)) return refuse("recovering", effects);
      resumed = r.state === "grace";
      if (!resumed) {
        r.motion.vx = r.motion.vz = 0;
        effects.push({ type: "replaced", accountId, generation: r.generation });
        effects.push({ type: "neutralize", accountId, bodyId: r.bodyId, generation: r.generation });
      }
    } else {
      if (this.#pending.some((p) => p.bodyId === bodyId)) return refuse("departing", effects);
      for (const o of this.#sessions.values()) if (o.bodyId === bodyId) return refuse("body-owned", effects);
      if (this.#sessions.size + this.#pending.length >= this.maxSessions) return refuse("full", effects);
      if (!body) return refuse("invalid", effects);
      r = { accountId, bodyId, kind: body.kind, generation: 0, token: "", zone, state: "live", lastSeenAt: t, deadline: null,
        stepAt: t, motion: body.motion, equipment: body.equipment, occupancy: null };
    }
    const token = this.#token();
    r.generation = this.#generation();
    r.token = token;
    r.state = "live";
    r.deadline = null;
    r.lastSeenAt = r.stepAt = t;
    this.#sessions.set(accountId, r);
    return { ok: true, resumed, session: { accountId, bodyId, generation: r.generation, token }, view: this.#view(r), effects };
  }

  // Authenticated presence confirmation (the host verifies the socket first). Also the gate for input: false means drop it.
  confirm(ref, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r) return false;
    this.#clock = t;
    r.lastSeenAt = r.stepAt = t;
    return true;
  }

  // The host's authoritative body state while live: { motion?, equipment? }. Also confirms presence.
  update(ref, now, patch) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r || patch === null || typeof patch !== "object") return false;
    const motion = patch.motion === undefined ? r.motion : readMotion(patch.motion);
    const equipment = patch.equipment === undefined ? r.equipment : readEquipment(patch.equipment);
    if (!motion || !equipment) return false;
    this.#clock = t;
    r.motion = motion;
    r.equipment = equipment;
    r.lastSeenAt = r.stepAt = t;
    return true;
  }

  // Zone departure releases any occupancy.
  setZone(ref, zone, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r || !isId(zone)) return refuse(r ? "invalid" : "stale");
    this.#clock = t;
    const effects = [];
    if (zone !== r.zone) this.#vacate(r, effects);
    r.zone = zone;
    return { ok: true, effects };
  }

  // resource: { kind: "hammock" | "cabinet", id }. One per session, never shared, admitted only by the host adapter.
  occupy(ref, resource, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r) return refuse("stale");
    const o = readOccupancy(resource);
    if (!o) return refuse("invalid");
    if (r.occupancy) return r.occupancy.kind === o.kind && r.occupancy.id === o.id ? { ok: true, effects: [] } : refuse("occupied");
    for (const other of this.#sessions.values()) {
      if (other.occupancy && other.occupancy.kind === o.kind && other.occupancy.id === o.id) return refuse("taken");
    }
    const check = this.adapter.validateOccupancy;
    if (typeof check !== "function" || check({ bodyId: r.bodyId, zone: r.zone, x: r.motion.x, y: r.motion.y, z: r.motion.z }, { kind: o.kind, id: o.id }) !== true) {
      return refuse("refused");
    }
    this.#clock = t;
    r.occupancy = o;
    return { ok: true, effects: [] };
  }

  vacate(ref, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r) return refuse("stale");
    this.#clock = t;
    const effects = [];
    this.#vacate(r, effects);
    return { ok: true, effects };
  }

  // A transport close the host has confirmed for this exact session. A superseded socket's close does nothing.
  disconnect(ref, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r) return refuse("stale");
    this.#clock = t;
    const effects = [];
    this.#toGrace(r, t, effects);
    return { ok: true, effects };
  }

  // Explicit release or logout from the live session.
  release(ref, now) {
    const r = this.#live(ref), t = this.#at(now);
    if (!r) return refuse("stale");
    return this.#leave(r, "release", t);
  }

  // Server-side revocation (account deleted, signed out elsewhere), in any state.
  revoke(accountId, now) {
    const t = this.#at(now), r = this.#sessions.get(accountId);
    if (!r) return refuse("unknown");
    return this.#leave(r, "revoke", t);
  }

  // Steps grace bodies through the host's passive stepper and turns due records into departures.
  advance(now) {
    const t = this.#at(now), effects = [];
    this.#sweep(t, effects);
    this.#clock = t;
    return { effects };
  }

  pending() { return this.#pending.map((p) => structuredClone(p)); }

  // The host has applied this departure to its world (in the same atomic commit as its handback); idempotent.
  markApplied(id) {
    if (!this.#ready) throw new Error("host-sessions: recover() first");
    const p = this.#pending.find((q) => q.id === id);
    if (!p) return false;
    p.applied = true;
    return true;
  }

  // Visual delivery of an applied departure; refused (false) while it is unknown or not yet applied.
  acknowledge(id) {
    if (!this.#ready) throw new Error("host-sessions: recover() first");
    const i = this.#pending.findIndex((p) => p.id === id);
    if (i < 0 || !this.#pending[i].applied) return false;
    this.#pending.splice(i, 1);
    return true;
  }

  view(accountId) {
    const r = this.#sessions.get(accountId);
    return r ? this.#view(r) : null;
  }

  occupant(kind, id) {
    for (const r of this.#sessions.values()) if (r.occupancy && r.occupancy.kind === kind && r.occupancy.id === id) return r.accountId;
    return null;
  }

  get size() { return this.#sessions.size; }

  work(now = this.#clock) {
    const t = this.#at(now);
    let pendingBodies = 0, pendingSteps = 0;
    for (const r of this.#sessions.values()) if (r.state === "grace" && r.stepAt < Math.min(t, r.deadline)) {
      pendingBodies++; pendingSteps += Math.ceil((Math.min(t, r.deadline) - r.stepAt) / PASSIVE_STEP_MS);
    }
    return { steps: this.#used, pendingBodies, pendingSteps };
  }

  checkpoint() {
    const sessions = [...this.#sessions.values()].sort((a, b) => a.generation - b.generation).map((r) => structuredClone(r));
    return { v: CHECKPOINT_VERSION, protocol: this.protocol, world: this.world, clock: this.#clock,
      nextGeneration: this.#next, sessions, pending: this.pending() };
  }

  #at(now) {
    if (!this.#ready) throw new Error("host-sessions: recover() first");
    if (!isTime(now)) throw new TypeError("host-sessions: time must be epoch milliseconds");
    return Math.max(this.#clock, now); // a clock stepping back never extends a deadline
  }

  #live(ref) {
    if (ref === null || typeof ref !== "object") return null;
    const r = this.#sessions.get(ref.accountId);
    return r && r.state === "live" && r.generation === ref.generation && same(r.token, ref.token) ? r : null;
  }

  #toGrace(r, at, effects) {
    r.state = "grace";
    r.lastSeenAt = r.stepAt = at;
    r.deadline = at + GRACE_MS;
    r.motion.vx = 0;
    r.motion.vz = 0;
    effects.push({ type: "neutralize", accountId: r.accountId, bodyId: r.bodyId, generation: r.generation });
  }

  #vacate(r, effects) {
    if (!r.occupancy) return;
    effects.push({ type: "vacated", accountId: r.accountId, bodyId: r.bodyId, kind: r.occupancy.kind, id: r.occupancy.id });
    r.occupancy = null;
  }

  #leave(r, reason, t) {
    const handback = this.#handback(r.bodyId), effects = [];
    this.#clock = t;
    this.#depart(r, reason, t, handback, effects);
    return { ok: true, effects };
  }

  #depart(r, reason, at, handback, effects) {
    this.#vacate(r, effects);
    this.#sessions.delete(r.accountId);
    const intent = { id: `depart:${r.generation}`, type: "depart", glyph: "green", accountId: r.accountId, bodyId: r.bodyId,
      generation: r.generation, reason, at, handback, zone: r.zone,
      body: { kind: r.kind, motion: { ...r.motion }, equipment: copyEquipment(r.equipment) }, applied: false };
    this.#pending.push(intent);
    effects.push(structuredClone(intent));
  }

  #handback(bodyId) {
    const find = this.adapter.npcFor;
    const npc = typeof find === "function" ? find(bodyId) : null;
    if (npc === null || npc === undefined) return null;
    if (!isId(npc)) throw new TypeError("host-sessions: npcFor returned an invalid NPC id");
    return { npc };
  }

  // Two phases, so an adapter that throws leaves the registry untouched.
  #sweep(t, effects, priorityAccount = null) {
    const due = [], steps = [], grace = [...this.#sessions.values()].filter(r => r.state === "grace");
    // Persisted cursors make older unfinished work first on the next operation.
    // A reconnect gets up to its whole 60-second interval before other bodies.
    if (this.#remaining !== Infinity) grace.sort((a, b) =>
      Number(b.accountId === priorityAccount) - Number(a.accountId === priorityAccount) || a.stepAt - b.stepAt || a.generation - b.generation);
    let remaining = this.#remaining, used = 0;
    for (const r of grace) {
      const until = Math.min(t, r.deadline, r.stepAt + remaining * PASSIVE_STEP_MS);
      if (until > r.stepAt) {
        steps.push([r, this.#step(r, until - r.stepAt), until]);
        const count = Math.ceil((until - r.stepAt) / PASSIVE_STEP_MS);
        remaining -= count; used += count;
      }
      if (t >= r.deadline && until >= r.deadline) due.push([r, this.#handback(r.bodyId)]);
    }
    this.#remaining = remaining; this.#used += used;
    for (const [r, motion, until] of steps) { r.motion = motion; r.stepAt = until; }
    for (const [r, handback] of due) this.#depart(r, "expired", r.deadline, handback, effects);
  }

  #step(r, dt) {
    const step = this.adapter.stepPassive;
    if (typeof step !== "function") throw new Error("host-sessions: passive collision adapter required");
    // Never hand collision one enormous elapsed time after recovery. The complete grace window
    // bounds this to 1200 calls per body; the adapter must use swept collision for each segment.
    // Production admission still requires measuring this worst case with actual island geometry.
    // Each call gets a fresh copy of plain values: no equipment, identity or deadline, and nothing it can alias.
    let motion = { ...r.motion };
    for (let left = dt; left > 0; left -= PASSIVE_STEP_MS) {
      const out = step({ bodyId: r.bodyId, zone: r.zone, kind: r.kind, ...motion }, Math.min(left, PASSIVE_STEP_MS));
      motion = out !== null && typeof out === "object"
        ? readMotion({ x: out.x, y: out.y, z: out.z, yaw: out.yaw, vx: out.vx, vy: out.vy, vz: out.vz, grounded: out.grounded }) : null;
      if (!motion) throw new TypeError("host-sessions: stepPassive returned invalid motion");
    }
    return motion;
  }

  #token() {
    const bytes = new Uint8Array(16);
    let token;
    do {
      crypto.getRandomValues(bytes);
      token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } while ([...this.#sessions.values()].some((r) => r.token === token));
    return token;
  }

  #generation() {
    if (this.#next >= Number.MAX_SAFE_INTEGER) throw new RangeError("host-sessions: generations exhausted");
    return this.#next++;
  }

  #view(r) {
    return { accountId: r.accountId, bodyId: r.bodyId, kind: r.kind, generation: r.generation, zone: r.zone, state: r.state,
      deadline: r.deadline, presentation: r.state === "grace" ? "open-hand" : null, motion: { ...r.motion },
      equipment: copyEquipment(r.equipment), occupancy: r.occupancy && { ...r.occupancy } };
  }
}
