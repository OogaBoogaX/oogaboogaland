// Host authority and recovery, deliberately not imported by the deployed Worker yet (#377).
// The simulation adapter must be deterministic, synchronous, data-only, and side-effect free:
// storage transactions may retry. #379 owns independent NPC tracks; live movement and voice stay separate.
import { SessionRegistry } from "./host-sessions.js";
import "../../src/js/npc-authority.js";
export const SESSION_PROTOCOL = "host-session-v2";
export const HOST = Object.freeze({
  schema: 2, key: "virtual-host-v1", stepMs: 250, maxSteps: 8, maxLagMs: 30000,
  leaseMs: 10000, maxRunMs: 15 * 60000, checkpointBytes: 96 * 1024,
  snapshotBytes: 32 * 1024, maxNpcs: 128, maxFollowers: 32, deliveryMs: 250,
});
const encoder = new TextEncoder();
const id = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const fail = reason => { throw new Error(reason); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Reject non-JSON state instead of silently losing NaN, undefined, sparse arrays, or prototypes.
// Limits bound validation work as well as encoded size. Checkpoints contain no executable objects.
export function boundedJSON(value, maxBytes) {
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 20000 || depth > 24) fail("state complexity");
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") { if (!Number.isFinite(v)) fail("nonfinite state"); return; }
    if (typeof v === "string") { if (v.length > maxBytes) fail("state size"); return; }
    if (!v || typeof v !== "object") fail("non-JSON state");
    if (Array.isArray(v)) {
      if (v.length > 20000 || Object.keys(v).length !== v.length) fail("state array");
      for (let i = 0; i < v.length; i++) visit(v[i], depth + 1);
    } else {
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) fail("state prototype");
      for (const [key, item] of Object.entries(v)) {
        if (key.length > 128) fail("state key");
        visit(item, depth + 1);
      }
    }
  };
  visit(value, 0);
  const text = JSON.stringify(value);
  if (encoder.encode(text).byteLength > maxBytes) fail("state size");
  return text;
}

// An allowlist, not a serialization of the private checkpoint. No live bodies, equipment,
// session ids, voice or action history can enter the guest contract (#378).
export function publicSnapshot(record, projected) {
  if (!exact(projected, ["npcs", "hub"]) || !Array.isArray(projected.npcs)
    || projected.npcs.length > HOST.maxNpcs || !exact(projected.hub, ["pile"])
    || !Number.isFinite(projected.hub.pile) || projected.hub.pile < 0 || projected.hub.pile > 10000000) fail("public state");
  const seen = new Set();
  for (const npc of projected.npcs) {
    if (!exact(npc, ["id", "kind", "x", "y", "z", "yaw", "activity", "phase", "route", "progress", "seed"])
      || !id(npc.id) || seen.has(npc.id) || !["ooga", "clanker"].includes(npc.kind)
      || !["working", "chilling", "sleeping", "away"].includes(npc.activity)
      || typeof npc.phase !== "string" || npc.phase.length > 32 || !id(npc.route)
      || !Number.isInteger(npc.seed) || npc.seed < 0 || npc.seed > 0xffffffff
      || ![npc.x, npc.y, npc.z, npc.yaw, npc.progress].every(Number.isFinite)
      || Math.abs(npc.x) > 10000 || Math.abs(npc.y) > 10000 || Math.abs(npc.z) > 10000
      || Math.abs(npc.yaw) > Math.PI * 2 || npc.progress < 0 || npc.progress > 1) fail("public NPC");
    seen.add(npc.id);
  }
  const value = { v: HOST.schema, world: record.world, epoch: record.fence,
    sequence: record.revision, at: record.simulatedAt, npcs: projected.npcs, hub: projected.hub };
  return JSON.parse(boundedJSON(value, HOST.snapshotBytes));
}

export class VirtualHost {
  constructor({ storage, simulation, sessionAdapter = {}, clock = Date.now }) {
    if (!storage?.transaction || !id(simulation?.version)
      || !["initial", "validate", "step", "project", "npcFor", "handoff"].every(k => typeof simulation[k] === "function")
      || typeof sessionAdapter.stepPassive !== "function") fail("host adapters");
    this.storage = storage;
    this.simulation = simulation;
    this.sessionAdapter = sessionAdapter;
    this.clock = clock;
  }

  now() { const now = this.clock(); if (!time(now)) fail("host clock"); return now; }

  validate(r) {
    if (!exact(r, ["schema", "world", "fence", "revision", "owner", "leaseUntil", "runUntil", "wallAt", "wallCursor", "simulatedAt", "pausedMs", "status", "simulation", "sessions"])
      || r.schema !== HOST.schema || r.world !== this.simulation.version) fail("incompatible checkpoint");
    if (![r.fence, r.revision, r.leaseUntil, r.runUntil, r.wallAt, r.wallCursor, r.simulatedAt, r.pausedMs].every(time)
      || r.simulatedAt + r.pausedMs !== r.wallCursor || r.wallCursor > r.wallAt || !id(r.owner)
      || r.runUntil - r.wallAt > HOST.maxRunMs || r.leaseUntil - r.wallAt > HOST.leaseMs
      || r.fence < 1 || r.revision < 1
      || !["running", "draining", "stopped", "backlog"].includes(r.status)) fail("invalid checkpoint");
    boundedJSON(r, HOST.checkpointBytes);
    if (this.simulation.validate(r.simulation) !== true) fail("invalid simulation");
    if (r.sessions !== null) {
      SessionRegistry.restore(r.sessions, { protocol: SESSION_PROTOCOL, world: r.world });
      if (r.sessions.clock > r.wallAt) fail("invalid session clock");
    }
    return r;
  }

  async read(tx) {
    const r = await tx.get(HOST.key);
    return r === undefined ? null : this.validate(r);
  }

  async save(tx, r) {
    r.revision++;
    this.validate(r);
    await tx.put(HOST.key, r);
  }

  ticket(r) { return { owner: r.owner, fence: r.fence, world: r.world }; }
  owns(r, ticket, now) {
    if (!r || !["running", "draining"].includes(r.status) || now >= r.leaseUntil
      || ticket?.world !== r.world || ticket.owner !== r.owner || ticket.fence !== r.fence) fail("host fenced");
    if (now < r.wallAt) fail("clock moved backwards");
  }

  // Explicit, finite operator action. Never called by a browser join or auto-renewed by tick.
  async begin(owner, durationMs, { resumePaused = false } = {}) {
    if (!id(owner) || !Number.isSafeInteger(durationMs) || durationMs < HOST.stepMs || durationMs > HOST.maxRunMs) fail("bounded run required");
    return this.storage.transaction(async tx => {
      const now = this.now();
      let r = await this.read(tx);
      if (r && now < r.wallAt) fail("clock moved backwards");
      if (r && r.status === "running" && now < r.runUntil) fail("run already active");
      if (r?.sessions?.sessions.length) fail("session drain required");
      if (!r) r = { schema: HOST.schema, world: this.simulation.version, fence: 0, revision: 0,
        owner, leaseUntil: now, runUntil: now, wallAt: now, wallCursor: now, simulatedAt: now, pausedMs: 0, status: "stopped",
        simulation: this.simulation.initial(now), sessions: null };
      if (now - r.wallCursor > HOST.maxLagMs) {
        if (resumePaused !== true) fail("explicit recovery required");
        // Explicit outage policy: keep the last committed NPC state, timers and RNG, record the
        // unsimulated interval and resume there. Session wall-clock deadlines are never rebased.
        r.pausedMs += now - r.wallCursor; r.wallCursor = now;
      }
      r.owner = owner; r.fence++; r.runUntil = now + durationMs;
      r.leaseUntil = now + HOST.leaseMs; r.wallAt = now; r.status = "running";
      await this.save(tx, r);
      return this.ticket(r);
    });
  }

  // A restarted runner obtains a new durable fence; an old runner can never overwrite it.
  async claim(owner) {
    if (!id(owner)) fail("host owner");
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx);
      if (!r || !["running", "draining"].includes(r.status) || now < r.leaseUntil
        || now >= r.runUntil && !r.sessions?.sessions.length) fail("host unavailable");
      if (now < r.wallAt) fail("clock moved backwards");
      r.owner = owner; r.fence++; r.leaseUntil = now + HOST.leaseMs; r.wallAt = now;
      await this.save(tx, r);
      return this.ticket(r);
    });
  }

  // The same durable transaction advances grace even when there are no clients or NPC steps.
  // Once session state exists, callers must provide the authenticated transport census explicitly.
  async tick(ticket, liveTokens) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      const { registry, recovery } = this.registry(r, now, liveTokens);
      if (now >= r.runUntil || r.status === "draining") {
        const effects = registry ? registry.drain(r.runUntil, now).effects : [];
        if (registry) this.settle(r, registry);
        r.status = registry?.size ? "draining" : "stopped";
        r.wallAt = now; r.leaseUntil = r.status === "draining" ? now + HOST.leaseMs : now;
        await this.save(tx, r);
        return { status: r.status, steps: 0, snapshot: null, recovery, effects };
      }
      const lag = now - r.wallCursor;
      if (lag > HOST.maxLagMs) {
        // Never pretend a long outage was simulated, or reset NPC positions/decisions.
        const effects = registry ? registry.drain(now, now).effects : [];
        if (registry) this.settle(r, registry);
        r.status = registry?.size ? "draining" : "backlog"; r.runUntil = now;
        r.leaseUntil = registry?.size ? now + HOST.leaseMs : now; r.wallAt = now;
        await this.save(tx, r);
        return { status: r.status, lagMs: lag, steps: 0, snapshot: null, recovery, effects };
      }
      const steps = Math.min(HOST.maxSteps, Math.floor(lag / HOST.stepMs));
      if (!steps && !registry) return { status: r.status, lagMs: lag, steps, snapshot: null, recovery };
      if (registry) this.settle(r, registry);
      for (let i = 0; i < steps; i++) {
        r.simulatedAt += HOST.stepMs;
        r.wallCursor += HOST.stepMs;
        const result = this.simulation.step(r.simulation, HOST.stepMs, r.simulatedAt);
        if (result?.then) fail("simulation step must be synchronous");
      }
      r.wallAt = now; r.leaseUntil = now + HOST.leaseMs;
      await this.save(tx, r);
      const snapshot = publicSnapshot(r, this.simulation.project(r.simulation));
      return { status: r.status, lagMs: now - r.wallCursor, steps, snapshot, recovery };
    });
  }

  // liveTokens must come from the authenticated Room's surviving transports, never client input.
  // Recover + operation + the registry's bounded departure outbox share one commit. Publish the
  // returned effects only after this resolves; read/ack pending departures via the same method.
  async sessions(ticket, liveTokens, apply, closes = []) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (now >= r.runUntil || r.status !== "running") fail("run closed to session operations");
      const { registry, recovery } = this.registry(r, now, liveTokens, closes, true);
      this.settle(r, registry);
      const result = apply(registry, now);
      if (result?.then) fail("session operation must be synchronous");
      this.settle(r, registry); r.wallAt = now;
      await this.save(tx, r);
      return structuredClone({ recovery, result });
    });
  }

  // A close is an explicit server observation, not an inferred missing transport. Retrying a
  // stale/already-grace generation cannot move its deadline. Never use a browser-supplied timestamp.
  async disconnect(ticket, liveTokens, ref, closedAt) {
    const closeRef = { accountId: ref?.accountId, generation: ref?.generation, token: ref?.token };
    return this.sessions(ticket, liveTokens, registry => registry.view(closeRef.accountId), [{ ref: closeRef, at: closedAt }]);
  }

  // Project only a committed checkpoint, without stepping, renewing or writing it.
  // The optional full-rig adapter must be pure and deterministic. Public x/y/z
  // snapshots cannot substitute for it. A caller cannot publish uncommitted work.
  async poses(ticket) {
    if (typeof this.simulation.poses !== "function") fail("NPC pose adapter required");
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil) fail("run closed to pose publication");
      const frame = this.simulation.poses(structuredClone(r.simulation));
      if (!globalThis.BL.npcAuthority.poses(frame)) fail("invalid host poses");
      return { ticket: this.ticket(r), sequence: r.revision, at: r.simulatedAt,
        runUntil: r.runUntil, frame: frame.slice(0) };
    });
  }

  registry(r, now, liveTokens, closes = [], create = false) {
    if (!r.sessions && !create) return { registry: null, recovery: { effects: [] } };
    if (!Array.isArray(liveTokens)) fail("authenticated transport census required");
    const options = { protocol: SESSION_PROTOCOL, world: r.world, adapter: {
      stepPassive: (motion, ms) => this.sessionAdapter.stepPassive(motion, ms, r.simulation),
      validateOccupancy: (body, resource) => this.sessionAdapter.validateOccupancy?.(body, resource, r.simulation) === true,
      npcFor: bodyId => this.simulation.npcFor(r.simulation, bodyId),
    } };
    // Validate census/close bounds on first admission too, not only once a checkpoint exists.
    const registry = SessionRegistry.restore(r.sessions || new SessionRegistry(options).checkpoint(), options);
    const recovery = registry.recover(now, liveTokens, closes);
    return { registry, recovery };
  }

  settle(r, registry) {
    for (const intent of registry.pending()) {
      if (intent.applied) continue;
      if (intent.handback) {
        if (this.simulation.npcFor(r.simulation, intent.bodyId) !== intent.handback.npc) fail("handoff world changed");
        if (this.simulation.handoff(r.simulation, intent) !== true) fail("handoff refused");
      }
      registry.markApplied(intent.id);
    }
    r.sessions = registry.checkpoint();
  }

  async stop(ticket, liveTokens) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      const { registry, recovery } = this.registry(r, now, liveTokens);
      const effects = registry ? registry.drain(Math.min(now, r.runUntil), now).effects : [];
      if (registry) this.settle(r, registry);
      r.runUntil = Math.min(now, r.runUntil); r.status = registry?.size ? "draining" : "stopped";
      r.wallAt = now; r.leaseUntil = registry?.size ? now + HOST.leaseMs : now;
      await this.save(tx, r);
      return { status: r.status, recovery, effects };
    });
  }
}

// Latest-only delivery with a byte cap and explicit backpressure. The eventual Room adapter must
// provide a real transport pending-byte measurement or acknowledgements; it must not pass zero
// blindly. No event/history queue, socket creation, timer, or guest subscription here.
export class LatestHostDelivery {
  constructor(world) {
    if (!id(world)) fail("delivery world");
    this.world = world; this.latest = null; this.followers = new Map();
    this.stats = { bytes: 0, messages: 0, skipped: 0 };
  }
  join(id) {
    if (!(typeof id === "string" && id.length <= 80 || Number.isSafeInteger(id) && id >= 0)) return false;
    if (this.followers.has(id)) return true;
    if (!this.followers.has(id) && this.followers.size >= HOST.maxFollowers) return false;
    this.followers.set(id, { epoch: -1, sequence: -1, at: -Infinity }); return true;
  }
  leave(id) { this.followers.delete(id); }
  offer(snapshot) {
    if (!snapshot || snapshot.world !== this.world || snapshot.v !== HOST.schema
      || !time(snapshot.epoch) || !time(snapshot.sequence) || !time(snapshot.at)) fail("delivery version");
    publicSnapshot({ world: snapshot.world, fence: snapshot.epoch, revision: snapshot.sequence, simulatedAt: snapshot.at },
      { npcs: snapshot.npcs, hub: snapshot.hub });
    if (!exact(snapshot, ["v", "world", "epoch", "sequence", "at", "npcs", "hub"])) fail("delivery fields");
    if (this.latest && (snapshot.epoch < this.latest.epoch
      || snapshot.epoch === this.latest.epoch && snapshot.sequence <= this.latest.sequence)) return false;
    const text = boundedJSON(snapshot, HOST.snapshotBytes);
    this.latest = { epoch: snapshot.epoch, sequence: snapshot.sequence, text, bytes: encoder.encode(text).byteLength };
    return true;
  }
  flush(id, now, pendingBytes, send) {
    const f = this.followers.get(id), s = this.latest;
    if (!f || !s || !time(now) || !Number.isSafeInteger(pendingBytes) || pendingBytes < 0
      || now - f.at < HOST.deliveryMs || f.epoch === s.epoch && f.sequence === s.sequence) return false;
    if (pendingBytes + s.bytes > HOST.snapshotBytes) { this.stats.skipped++; return false; }
    if (send(s.text) !== true) { this.stats.skipped++; return false; }
    f.epoch = s.epoch; f.sequence = s.sequence; f.at = now;
    this.stats.bytes += s.bytes; this.stats.messages++; return true;
  }
}
