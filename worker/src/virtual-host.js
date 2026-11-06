// Host authority and recovery, deliberately not imported by the deployed Worker yet (#377).
// The simulation adapter must be deterministic, synchronous, data-only, and side-effect free:
// storage transactions may retry. #379 owns independent NPC tracks; live movement and voice stay separate.
import { SessionRegistry, GRACE_MS, HANDOFF_MS, PASSIVE_STEP_MS } from "./host-sessions.js";
import { bodyOperationDigest, validateBodyOperation } from "./host-body-operations.js";
import { validateRoomClaim, validateRoomBinding, validateRoomClaimReceipt, validateRoomReleaseReceipt, sameRoomClaim } from "./host-room-claim.js";
import "../../src/js/npc-authority.js";
import "../../src/js/clanker-pose.js";
import "../../src/js/npc-lab-pose.js";
import "../../src/js/npc-world-layout.js";
import "../../src/js/npc-pose-packet.js";
export const SESSION_PROTOCOL = "host-session-v5";
export const HOST = Object.freeze({
  schema: 4, key: "virtual-host-v1", stepMs: 250, maxSteps: 8, maxLagMs: 30000,
  leaseMs: 10000, maxRunMs: 15 * 60000, checkpointBytes: 96 * 1024,
  snapshotBytes: 32 * 1024, maxNpcs: 128, maxFollowers: 32, deliveryMs: 250,
  passiveSteps: 4096, metadataBytes: 2048, sessionSlotBytes: 1024, simulationNodes: 16000, sessionSlotNodes: 48, metadataNodes: 128,
});
// Matches the existing complete-body store's capacity; never truncate a world
// that admitted more records through a different storage profile.
export const BODY_VIEW = Object.freeze({ version: 1, maxBodies: 32, maxBytes: 32 * 1024 });
const encoder = new TextEncoder();
const id = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value);
const time = value => Number.isSafeInteger(value) && value >= 0;
const fail = reason => { throw new Error(reason); };
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Inputs must already have passed their byte/node limits. JSON text equality
// would silently equate -0 and 0; body storage and apply receipts need exact data.
export function sameCheckpointValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), other = Object.keys(b);
  return keys.length === other.length && keys.every((k, i) => k === other[i] && sameCheckpointValue(a[k], b[k]));
}

// Reject non-JSON state instead of silently losing NaN, undefined, sparse arrays, or prototypes.
// Limits bound validation work as well as encoded size. Checkpoints contain no executable objects.
export function boundedJSON(value, maxBytes, maxNodes = 20000) {
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > maxNodes || depth > 24) fail("state complexity");
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

async function readSessionBody(tx, r, now, accountId, ref, maxSessions, pending = false, expired = false, project) {
  if (!r.sessions) return null;
  const registry = SessionRegistry.restore(r.sessions, { protocol: SESSION_PROTOCOL, world: r.world, maxSessions });
  const reference = { accountId, generation: ref?.generation, token: ref?.token };
  const view = pending ? registry.transferView(reference) : registry.authorizedView(reference);
  if (!view) return null;
  const expiresAt = Math.min(r.runUntil, r.leaseUntil, view.deadline ?? Infinity, registry.controlUntil(reference) ?? Infinity);
  if (now >= expiresAt && !expired) return null;
  if (typeof tx.bodies !== "function") fail("complete body storage required");
  const rows = await tx.bodies(), row = rows.find(body => body.bodyId === view.bodyId);
  if (!row || row.accountId !== accountId || row.generation !== view.generation || row.kind !== view.kind)
    fail("body transfer generation mismatch");
  // Optional source-owned public recovery format. Stored components stay exact
  // and internal; every read/ACK comparison uses the same deterministic mapping.
  const checkpoint = project ? project(view, structuredClone(row.checkpoint)) : row.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object" || checkpoint.then) fail("invalid body transfer projection");
  const transfer = { v: 1, protocol: SESSION_PROTOCOL, world: r.world, epoch: r.fence, revision: r.revision,
    at: now, expiresAt, resetResources: "defaults", view, checkpoint };
  boundedJSON(transfer, HOST.snapshotBytes);
  return structuredClone(transfer);
}

// A preparation is an observation, never a reservation or browser capability.
// Existing bodies bind their generation; an absent body binds the admission
// counter too, preventing create/remove/recreate from looking absent again.
function bodyPreparation(r, now, accountId, bodyId) {
  const current = r.sessions?.sessions.find(s => s.accountId === accountId);
  if (current && current.bodyId !== bodyId) fail("body preparation account-bound");
  if (r.sessions?.pending.some(p => p.accountId === accountId || p.bodyId === bodyId)) fail("body preparation departing");
  const expiresAt = Math.min(r.runUntil, r.leaseUntil, current?.deadline ?? Infinity);
  if (now >= expiresAt) fail("body preparation expired");
  return { v: 1, world: r.world, epoch: r.fence, accountId, bodyId, generation: current?.generation ?? 0,
    nextGeneration: current ? 0 : r.sessions?.nextGeneration ?? 1, expiresAt };
}

// An event deadline, not a polling interval. Pending unapplied handbacks require
// immediate reconciliation; an acknowledged/retained visual needs no wakeup.
function bodyWake(r) {
  let at = Infinity;
  for (const s of r.sessions?.sessions || []) {
    if (s.state === "live") at = Math.min(at, r.runUntil);
    else {
      at = Math.min(at, s.deadline);
      if (s.state === "starting") at = Math.min(at, s.stepAt + HANDOFF_MS);
    }
  }
  if (r.sessions?.pending.some(p => !p.applied)) at = Math.min(at, r.sessions.clock);
  return at === Infinity ? null : at;
}

export class VirtualHost {
  constructor({ storage, simulation, sessionAdapter = {}, clock = Date.now }) {
    const passiveSteps = sessionAdapter.passiveSteps ?? HOST.passiveSteps, maxSteps = simulation?.maxSteps ?? HOST.maxSteps;
    if (!storage?.transaction || !id(simulation?.version)
      || !["initial", "validate", "step", "project", "npcFor"].every(k => typeof simulation[k] === "function")
      || typeof sessionAdapter.stepPassive !== "function"
      || !Number.isSafeInteger(maxSteps) || maxSteps < 1 || maxSteps > HOST.maxSteps
      || !Number.isSafeInteger(passiveSteps) || passiveSteps < GRACE_MS / PASSIVE_STEP_MS || passiveSteps > HOST.passiveSteps
      || !Number.isSafeInteger(simulation.checkpointBytes) || simulation.checkpointBytes < 256
      || simulation.checkpointBytes > HOST.checkpointBytes - HOST.metadataBytes - HOST.sessionSlotBytes) fail("host adapters");
    this.storage = storage;
    this.simulation = simulation;
    this.checkpointBytes = simulation.checkpointBytes;
    this.maxSessions = Math.min(64, Math.floor((HOST.checkpointBytes - HOST.metadataBytes - this.checkpointBytes) / HOST.sessionSlotBytes));
    this.sessionAdapter = sessionAdapter;
    this.passiveSteps = passiveSteps;
    this.maxSteps = maxSteps;
    this.clock = clock;
  }

  now() { const now = this.clock(); if (!time(now)) fail("host clock"); return now; }

  async transaction(callback) {
    // Adapter construction work, like passive steps, is shared by every
    // optimistic retry of this operation. It is never persisted or published.
    const operation = {};
    let completed = null;
    try {
    const result = await this.storage.transaction(async tx => {
      // A storage retry invalidates the prior attempt even if its callback
      // returned successfully. Never recycle a world before durable commit.
      if (completed) { completed.dispose(); completed = null; }
      const source = this.simulation, sessions = this.sessionAdapter;
      if (typeof source.forTransaction !== "function" && typeof sessions.forTransaction !== "function") return callback.call(this, tx);
      let simulation = source, sessionAdapter = sessions, succeeded = false;
      try {
        if (typeof source.forTransaction === "function") {
          simulation = source.forTransaction();
          if (!simulation || simulation === source || simulation.then || simulation.version !== source.version
            || simulation.checkpointBytes !== source.checkpointBytes
            || typeof source.poses === "function" && typeof simulation.poses !== "function"
            || typeof source.enqueueInput === "function" && typeof simulation.enqueueInput !== "function"
            || typeof source.applySource === "function" && typeof simulation.applySource !== "function"
            || !["initial", "validate", "step", "project", "npcFor", "dispose"].every(k => typeof simulation[k] === "function")) fail("invalid simulation transaction");
        }
        if (typeof sessions.forTransaction === "function") {
          sessionAdapter = await sessions.forTransaction(tx, operation, simulation);
          if (!sessionAdapter || sessionAdapter === sessions || typeof sessionAdapter.stepPassive !== "function"
            || typeof sessionAdapter.dispose !== "function"
            || (sessionAdapter.passiveSteps ?? this.passiveSteps) !== this.passiveSteps) fail("invalid body transaction");
        }
        const attempt = Object.create(this); attempt.simulation = simulation; attempt.sessionAdapter = sessionAdapter;
        const result = await callback.call(attempt, tx);
        succeeded = true;
        return result;
      } finally {
        try { if (sessionAdapter !== sessions && typeof sessionAdapter?.dispose === "function") sessionAdapter.dispose(); }
        finally {
          if (simulation !== source && !simulation?.then && typeof simulation?.dispose === "function") {
            if (succeeded && typeof simulation.committed === "function") completed = simulation;
            else simulation.dispose();
          }
        }
      }
    });
    completed?.committed();
    return result;
    } finally { completed?.dispose(); }
  }

  validate(r) {
    if (!exact(r, ["schema", "world", "budget", "fence", "revision", "owner", "leaseUntil", "runUntil", "wallAt", "wallCursor", "simulatedAt", "pausedMs", "status", "simulation", "sessions", ...(Object.hasOwn(r || {}, "room") ? ["room"] : [])])
      || r.schema !== HOST.schema || r.world !== this.simulation.version || r.budget !== this.checkpointBytes) fail("incompatible checkpoint");
    if (![r.fence, r.revision, r.leaseUntil, r.runUntil, r.wallAt, r.wallCursor, r.simulatedAt, r.pausedMs].every(time)
      || r.simulatedAt + r.pausedMs !== r.wallCursor || r.wallCursor > r.wallAt || !id(r.owner)
      || r.runUntil - r.wallAt > HOST.maxRunMs || r.leaseUntil - r.wallAt > HOST.leaseMs
      || r.fence < 1 || r.revision < 1
      || !["running", "draining", "stopped", "backlog"].includes(r.status)) fail("invalid checkpoint");
    if (r.room) validateRoomBinding(r.room, r);
    else if (Object.hasOwn(r, "room")) fail("invalid host Room binding");
    boundedJSON(r, HOST.checkpointBytes);
    boundedJSON(r.simulation, this.checkpointBytes, HOST.simulationNodes);
    // Reserve maximum future world growth and one worst-case schema-2 record per
    // retained body/departure, including array separators. Refuse admission before
    // the checkpoint fills; expiration and resource/number growth need this space.
    const slots = (r.sessions?.sessions.length || 0) + (r.sessions?.pending.length || 0);
    if (this.checkpointBytes + HOST.metadataBytes + slots * HOST.sessionSlotBytes > HOST.checkpointBytes) fail("checkpoint capacity");
    boundedJSON({ ...r, simulation: null, sessions: r.sessions && { ...r.sessions, sessions: [], pending: [] } }, HOST.metadataBytes, HOST.metadataNodes);
    for (const item of [...(r.sessions?.sessions || []), ...(r.sessions?.pending || [])]) boundedJSON(item, HOST.sessionSlotBytes - 1, HOST.sessionSlotNodes);
    if (this.simulation.validate(r.simulation) !== true) fail("invalid simulation");
    if (r.sessions !== null) {
      SessionRegistry.restore(r.sessions, { protocol: SESSION_PROTOCOL, world: r.world, maxSessions: this.maxSessions });
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
    if (!r || r.room?.pending || !["running", "draining"].includes(r.status) || now >= r.leaseUntil
      || ticket?.world !== r.world || ticket.owner !== r.owner || ticket.fence !== r.fence) fail("host fenced");
    if (now < r.wallAt) fail("clock moved backwards");
  }

  // Explicit, finite operator action. Never called by a browser join or auto-renewed by tick.
  async begin(owner, durationMs, { resumePaused = false } = {}) {
    if (!id(owner) || !Number.isSafeInteger(durationMs) || durationMs < HOST.stepMs || durationMs > HOST.maxRunMs) fail("bounded run required");
    return this.transaction(async function(tx) {
      const now = this.now();
      let r = await this.read(tx);
      if (r?.room) fail("coordinated Room run transition required");
      if (r && now < r.wallAt) fail("clock moved backwards");
      if (r && r.status === "running" && now < r.runUntil) fail("run already active");
      if (r?.sessions?.sessions.length) fail("session drain required");
      if (!r) r = { schema: HOST.schema, world: this.simulation.version, budget: this.checkpointBytes, fence: 0, revision: 0,
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
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (r?.room) fail("coordinated Room takeover required");
      if (!r || !["running", "draining"].includes(r.status) || now < r.leaseUntil
        || now >= r.runUntil && !r.sessions?.sessions.length) fail("host unavailable");
      if (now < r.wallAt) fail("clock moved backwards");
      r.owner = owner; r.fence++; r.leaseUntil = now + HOST.leaseMs; r.wallAt = now;
      await this.save(tx, r);
      return this.ticket(r);
    });
  }

  // Step 1: persist the replacement intent without granting a new host ticket.
  // Once published through Room, raw claim/begin cannot bypass this barrier.
  async prepareRoomClaim(owner) {
    if (!id(owner)) fail("host owner");
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (!r?.room || now < r.wallAt) fail("Room takeover unavailable");
      if (r.room.pending) {
        if (r.room.claim.v !== 1) fail("Room release pending");
        if (r.room.claim.owner !== owner) fail("Room takeover already pending");
        return structuredClone(r.room.claim);
      }
      const cleanup = now >= r.runUntil && !r.sessions?.sessions.length
        && !!r.sessions?.pending.length && r.sessions.pending.every(p => p.applied);
      if (now < r.leaseUntil || !["running", "draining", ...(cleanup ? ["stopped"] : [])].includes(r.status)
        || now >= r.runUntil && !r.sessions?.sessions.length && !cleanup) fail("host unavailable");
      const claim = validateRoomClaim({ v: 1, world: r.world, previousOwner: r.owner, previousEpoch: r.fence,
        owner, epoch: r.fence + 1, runUntil: r.runUntil, cleanup });
      r.room = { v: 1, pending: true, claim }; r.wallAt = now;
      await this.save(tx, r);
      return structuredClone(claim);
    });
  }

  // Explicit lost-reply recovery names the exact persisted operation, not only
  // an owner string that a second runner might reuse. It cannot renew a lease.
  async resumeRoomClaim(intent) {
    const claim = structuredClone(validateRoomClaim(intent));
    if (claim.v !== 1) fail("Room release pending");
    return this.transaction(async function(tx) {
      const r = await this.read(tx);
      if (!r?.room || !sameRoomClaim(r.room.claim, claim) || r.runUntil !== claim.runUntil) fail("Room takeover fenced");
      return claim;
    });
  }

  // Step 3: trusted coordinator has durably fenced Room and reconciled its
  // exact receipt. No external calls occur in this retryable transaction.
  async completeRoomClaim(intent, receipt) {
    const claim = structuredClone(validateRoomClaim(intent));
    validateRoomClaimReceipt(claim, receipt);
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (!r?.room || !sameRoomClaim(r.room.claim, claim) || now < r.wallAt) fail("Room takeover fenced");
      if (!r.room.pending) return this.ticket(r);
      r.owner = claim.owner; r.fence = claim.epoch; r.wallAt = now;
      r.leaseUntil = now + HOST.leaseMs;
      if (claim.cleanup) r.status = "draining";
      r.room.pending = false;
      await this.save(tx, r);
      return this.ticket(r);
    });
  }

  // Explicit close of a drained run. Persist the stop intent before releasing
  // Room, including when an earlier takeover raced an operator's browser release.
  // Never discard held bodies or unacknowledged departure delivery to unblock it.
  async prepareRoomRelease(owner) {
    if (!id(owner)) fail("host owner");
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (!r?.room || now < r.wallAt || now < r.leaseUntil) fail("Room release unavailable");
      if (r.sessions?.sessions.length || r.sessions?.pending.length) fail("session drain required");
      if (r.room.pending && r.room.claim.owner !== owner) fail("Room transition already pending");
      if (r.room.pending && r.room.claim.v === 2) return structuredClone(r.room.claim);
      const claim = validateRoomClaim({ v: 2, action: "release", world: r.world, previousOwner: r.owner,
        previousEpoch: r.fence, owner, epoch: r.fence + 1, runUntil: r.runUntil, cleanup: false });
      r.room = { v: 1, pending: true, claim }; r.wallAt = now;
      await this.save(tx, r);
      return structuredClone(claim);
    });
  }

  async resumeRoomRelease(intent) {
    const claim = structuredClone(validateRoomClaim(intent));
    if (claim.v !== 2) fail("Room release intent required");
    return this.transaction(async function(tx) {
      const r = await this.read(tx);
      if (!r || (r.room ? !r.room.pending || !sameRoomClaim(r.room.claim, claim)
        : r.status !== "stopped" || r.fence !== claim.epoch || r.owner !== claim.owner || r.world !== claim.world
          || r.runUntil > claim.runUntil)) fail("Room release fenced");
      return claim;
    });
  }

  async completeRoomRelease(intent, receipt) {
    const claim = structuredClone(validateRoomClaim(intent));
    if (claim.v !== 2) fail("Room release intent required");
    validateRoomReleaseReceipt(receipt);
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (!r || now < r.wallAt || r.sessions?.sessions.length || r.sessions?.pending.length) fail("Room release unavailable");
      if (!r.room) {
        if (r.status !== "stopped" || r.fence !== claim.epoch || r.owner !== claim.owner || r.world !== claim.world
          || r.runUntil > claim.runUntil) fail("Room release fenced");
        return { status: "stopped", world: r.world, fence: r.fence };
      }
      if (!r.room.pending || !sameRoomClaim(r.room.claim, claim)) fail("Room release fenced");
      r.owner = claim.owner; r.fence = claim.epoch; r.status = "stopped";
      r.runUntil = Math.min(now, r.runUntil); r.wallAt = now; r.leaseUntil = now;
      delete r.room;
      await this.save(tx, r);
      return { status: "stopped", world: r.world, fence: r.fence };
    });
  }

  // An explicit event-only recovery after the finite run has stopped. Retained
  // applied departures still need durable presentation delivery; starting a new
  // NPC run just to acknowledge them would incorrectly resume simulation. This
  // lease grants no live admission and is never scheduled or renewed here.
  async claimBodyCleanup(owner) {
    if (!id(owner)) fail("host owner");
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      if (r?.room) fail("coordinated Room takeover required");
      if (!r || !["running", "draining", "stopped"].includes(r.status)
        || now < r.runUntil || now < r.leaseUntil || r.sessions?.sessions.length
        || !r.sessions?.pending.length || r.sessions.pending.some(p => !p.applied)) fail("body cleanup unavailable");
      if (now < r.wallAt) fail("clock moved backwards");
      r.owner = owner; r.fence++; r.leaseUntil = now + HOST.leaseMs; r.wallAt = now; r.status = "draining";
      await this.save(tx, r);
      return this.ticket(r);
    });
  }

  // The same durable transaction advances grace even when there are no clients or NPC steps.
  // Once session state exists, callers must provide the authenticated transport census explicitly.
  async tick(ticket, liveTokens, { expectedRevision } = {}) {
    if (expectedRevision !== undefined && (!time(expectedRevision) || expectedRevision < 1)) fail("invalid world census revision");
    if (liveTokens !== undefined && !Array.isArray(liveTokens)) fail('authenticated transport census required');
    const tokens = liveTokens === undefined ? undefined : [...liveTokens];
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      // Room census and host ownership are separate durable reads. Admission,
      // movement or an ACK during that read invalidates the entire tick, before
      // either absence recovery or simulation can mutate the newer checkpoint.
      if (expectedRevision !== undefined && expectedRevision !== r.revision)
        return { status: r.status, superseded: true, steps: 0, snapshot: null, revision: r.revision };
      const { registry, recovery } = this.registry(r, now, tokens, { budget });
      if (now >= r.runUntil || r.status === "draining") {
        const effects = registry ? registry.drain(r.runUntil, now).effects : [];
        if (registry) this.settle(r, registry);
        r.status = registry?.size ? "draining" : "stopped";
        r.wallAt = now; r.leaseUntil = r.status === "draining" ? now + HOST.leaseMs : now;
        await this.save(tx, r);
        return { status: r.status, steps: 0, snapshot: null, recovery, effects, work: this.work(registry, now, budget) };
      }
      const lag = now - r.wallCursor;
      if (lag > HOST.maxLagMs) {
        // Never pretend a long outage was simulated, or reset NPC positions/decisions.
        const effects = registry ? registry.drain(now, now).effects : [];
        if (registry) this.settle(r, registry);
        r.status = registry?.size ? "draining" : "backlog"; r.runUntil = now;
        r.leaseUntil = registry?.size ? now + HOST.leaseMs : now; r.wallAt = now;
        await this.save(tx, r);
        return { status: r.status, lagMs: lag, steps: 0, snapshot: null, recovery, effects, work: this.work(registry, now, budget) };
      }
      if (registry?.work(now).pendingSteps) {
        this.settle(r, registry); r.wallAt = now; r.leaseUntil = now + HOST.leaseMs;
        await this.save(tx, r);
        return { status: r.status, recovering: true, steps: 0, snapshot: null, recovery, work: this.work(registry, now, budget) };
      }
      const steps = Math.min(this.maxSteps, Math.floor(lag / HOST.stepMs));
      if (!steps && !registry) return { status: r.status, lagMs: lag, steps, snapshot: null, recovery };
      if (registry) this.settle(r, registry);
      for (let i = 0; i < steps; i++) {
        r.simulatedAt += HOST.stepMs;
        r.wallCursor += HOST.stepMs;
        const result = this.simulation.step(r.simulation, HOST.stepMs, r.simulatedAt, { wallAt: r.wallCursor });
        if (result?.then) fail("simulation step must be synchronous");
      }
      r.wallAt = now; r.leaseUntil = now + HOST.leaseMs;
      await this.save(tx, r);
      const snapshot = publicSnapshot(r, this.simulation.project(r.simulation));
      return { status: r.status, lagMs: now - r.wallCursor, steps, snapshot, recovery, work: this.work(registry, now, budget) };
    });
  }

  // Private trusted-service input. It only queues into the bounded simulation
  // checkpoint; it never acquires authority, renews a lease or starts a run.
  async worldInput(ticket, input) {
    // Preserve the tiny backlog bound. Complete absolute Hub updates have a
    // separate bounded schema; the concrete simulation validates its contents.
    if (input?.kind === 'backlog') {
      boundedJSON(input, 256, 8);
      if (!exact(input, ["v", "kind", "observedAt", "vsize"]) || input.v !== 1
        || !time(input.observedAt) || input.observedAt === 0 || !time(input.vsize)) fail("invalid world input");
    } else {
      boundedJSON(input, 32 * 1024, 4096);
      if (!exact(input, ['v', 'kind', 'observedAt', 'revision', 'state', 'activity'])
        || input.v !== 1 || input.kind !== 'hub-state' || !time(input.observedAt) || input.observedAt === 0
        || !time(input.revision) || input.revision === 0) fail('invalid world input');
    }
    const value = structuredClone(input);
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil || value.observedAt > now
        || now - r.wallCursor > HOST.maxLagMs || typeof this.simulation.enqueueInput !== "function")
        fail("world input unavailable");
      const result = this.simulation.enqueueInput(r.simulation, value,
        { acceptedAt: now, effectiveAt: now - r.pausedMs });
      if (!["accepted", "retained", "stale"].includes(result)) fail("invalid world input receipt");
      if (result === "accepted") { r.wallAt = now; await this.save(tx, r); }
      return { status: result, revision: r.revision, world: r.world, epoch: r.fence };
    });
  }

  // Source-only reconciliation for an owned, Room-bound running world. One host
  // transaction: the simulation queues the trusted source as a normal input and
  // applies only its absolute source state, observed at trusted host time. No
  // step, census, absence recovery, session, deadline, lease, wallCursor or
  // simulatedAt change. Unchanged or stale source writes nothing.
  async reconcileSource(ticket, source) {
    if (typeof this.simulation.applySource !== "function") fail("source reconciliation adapter required");
    boundedJSON(source, 1024, 32);
    const value = structuredClone(source);
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (!r.room || r.room.pending || r.status !== "running" || now >= r.runUntil || now - r.wallCursor > HOST.maxLagMs)
        fail("source reconciliation requires an acquired running world");
      const result = this.simulation.applySource(r.simulation, value, { acceptedAt: now, effectiveAt: now - r.pausedMs, observedAt: now });
      if (!["applied", "queued", "unchanged", "stale", "unknown"].includes(result)) fail("invalid source reconciliation receipt");
      if (result === "applied" || result === "queued") { r.wallAt = now; await this.save(tx, r); }
      return { status: result, revision: r.revision, world: r.world, epoch: r.fence };
    });
  }

  // liveTokens must come from the authenticated Room's surviving transports, never client input.
  // Recover + operation + the registry's bounded departure outbox share one commit. Publish the
  // returned effects only after this resolves; read/ack pending departures via the same method.
  async sessions(ticket, liveTokens, apply, closes = [], priorityAccount = null, transferAccount = null, admission = null) {
    if (transferAccount !== null && (!Number.isSafeInteger(transferAccount) || transferAccount < 1)) fail("invalid body transfer account");
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (now >= r.runUntil || r.status !== "running") fail("run closed to session operations");
      // Check before recovery: stale reconnect observations must not disconnect
      // a replacement by supplying an older set of live transport tokens.
      if (admission && admission(r, now, this)?.then) fail("session admission must be synchronous");
      const { registry, recovery } = this.registry(r, now, liveTokens, { closes, create: true, priorityAccount, budget });
      this.settle(r, registry);
      const result = apply(registry, now);
      if (result?.then) fail("session operation must be synchronous");
      this.settle(r, registry); r.wallAt = now;
      await this.save(tx, r);
      let transfer;
      if (transferAccount !== null) {
        transfer = result?.ok ? await readSessionBody(tx, r, now, transferAccount, result.session, this.maxSessions, true, false, this.sessionAdapter.transfer) : null;
        if (result?.ok && !transfer) fail("missing committed body transfer");
      }
      return structuredClone({ recovery, result, work: this.work(registry, now, budget),
        ...(transferAccount !== null ? { transfer } : {}) });
    });
  }

  // claim.accountId is supplied by authenticated host code, not a browser id.
  // Budget always covers this body's complete grace before unrelated recovery.
  async connect(ticket, liveTokens, claim) {
    return this.sessions(ticket, liveTokens, (registry, now) => registry.connect(claim, now), [], claim?.accountId);
  }

  // Server-only observation taken before preparing browser assets. No body
  // stops, presence is not confirmed, and no grace deadline or storage changes.
  // Room must retain this against its current authenticated connection/nonce;
  // never accept a browser-invented preparation. Expiry requires a fresh read.
  async prepareBody(ticket, accountId, bodyId) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || typeof bodyId !== "string"
      || !/^[A-Za-z0-9._:/-]{1,64}$/.test(bodyId)) fail("invalid body preparation identity");
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil) fail("run closed to body preparation");
      return bodyPreparation(r, now, accountId, bodyId);
    });
  }

  // Private Room candidate only: no browser-selected pose or world. Resolve
  // retained kind before preparing assets; fresh placement is read at OFFER,
  // not here, since the NPC may move while browser assets are being prepared.
  async prepareWorldBody(ticket, candidate) {
    if (!exact(candidate, ['accountId', 'bodyId', 'handle', 'kind'])
      || !Number.isSafeInteger(candidate.accountId) || candidate.accountId < 1
      || candidate.bodyId !== `player:${candidate.accountId}` || !id(candidate.handle)
      || !['ooga', 'clanker'].includes(candidate.kind)) fail('invalid world body candidate');
    const who = structuredClone(candidate);
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      if (r.status !== 'running' || now >= r.runUntil) fail('run closed to world body preparation');
      const preparation = bodyPreparation(r, now, who.accountId, who.bodyId);
      const retained = r.sessions?.sessions.find(s => s.accountId === who.accountId);
      if (!retained && typeof this.simulation.playerSpawn !== 'function') fail('authoritative world spawn adapter required');
      const kind = retained?.kind ?? who.kind;
      return { preparation, kind, claim: { protocol: SESSION_PROTOCOL, world: r.world,
        accountId: who.accountId, bodyId: who.bodyId, source: { handle: who.handle, kind } } };
    });
  }

  // Legacy foundation admission; not a browser handoff. Browser integration
  // must use offerBody / activateBody / startedBody and its current-socket outbox.
  // The authenticated account is independent of message fields. Claim, neutralized
  // body capture and transfer share one transaction; a failed transfer rolls
  // back ownership too. Room must still bind delivery/ACK to its current socket.
  async connectBody(ticket, liveTokens, accountId, claim, preparation, offered = false) {
    if (typeof offered !== "boolean") fail("invalid body admission mode");
    if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId !== claim?.accountId)
      fail("authenticated body account mismatch");
    if (!exact(preparation, ["v", "world", "epoch", "accountId", "bodyId", "generation", "nextGeneration", "expiresAt"])
      || preparation.v !== 1 || preparation.accountId !== accountId || preparation.bodyId !== claim.bodyId
      || ![preparation.epoch, preparation.generation, preparation.nextGeneration, preparation.expiresAt].every(time)
      || !Array.isArray(liveTokens))
      fail("invalid body preparation");
    const request = structuredClone(claim), observed = structuredClone(preparation), tokens = [...liveTokens];
    const hasSource = Object.hasOwn(request, 'source'), source = hasSource ? structuredClone(request.source) : null;
    if (hasSource && (!exact(request, ['protocol', 'world', 'accountId', 'bodyId', 'source'])
      || !exact(source, ['handle', 'kind']) || !id(source.handle) || !['ooga', 'clanker'].includes(source.kind)
      || request.bodyId !== `player:${accountId}`)) fail('invalid authoritative body source');
    const admission = (r, now, host) => {
      const current = bodyPreparation(r, now, accountId, request.bodyId);
      if (now >= observed.expiresAt || observed.expiresAt > current.expiresAt
        || ["world", "epoch", "generation", "nextGeneration"].some(k => observed[k] !== current[k]))
        fail("stale body preparation");
      if (source) {
        // Recreate this derived claim on every transaction retry. Never retain
        // a speculative NPC position or mutate the committed NPC track.
        delete request.body; delete request.zone;
        // Bind only the canonical identity already vouched for by Room, inside
        // this storage attempt. A failed attempt cannot leave a name mapping.
        if (typeof host.sessionAdapter.bindIdentity === 'function') {
          const bound = host.sessionAdapter.bindIdentity({ accountId, bodyId: request.bodyId,
            handle: source.handle, kind: source.kind });
          if (bound !== true) fail('body identity binding failed');
        }
        const retained = r.sessions?.sessions.find(s => s.accountId === accountId);
        if (retained) {
          if (retained.kind !== source.kind) fail('retained body kind mismatch');
          request.zone = retained.zone;
        } else {
          if (typeof host.simulation.playerSpawn !== 'function') fail('authoritative world spawn adapter required');
          const spawn = host.simulation.playerSpawn(structuredClone(r.simulation),
            { accountId, bodyId: request.bodyId, handle: source.handle, kind: source.kind },
            { occupied: [...(r.sessions?.sessions || []), ...(r.sessions?.pending || [])].map(row => ({
              bodyId: row.bodyId, kind: row.kind || row.body.kind, zone: row.zone,
              motion: structuredClone(row.motion || row.body.motion) })) });
          boundedJSON(spawn, 2048, 128);
          if (!exact(spawn, ['npcId', 'feetOffset', 'zone', 'body']) || !id(spawn.zone) || spawn.body?.kind !== source.kind
            || !Number.isFinite(spawn.feetOffset) || spawn.feetOffset < 0 || spawn.feetOffset > 10
            || spawn.npcId !== null && !id(spawn.npcId)) fail('invalid world body spawn');
          const npcId = host.npcLookup(r)(request.bodyId,
            { accountId, bodyId: request.bodyId, handle: source.handle, kind: source.kind });
          if (spawn.npcId !== npcId) fail('world body NPC mapping mismatch');
          if (npcId !== null) {
            const projected = publicSnapshot(r, host.simulation.project(structuredClone(r.simulation)));
            const npc = projected.npcs.find(n => n.id === npcId);
            // Ooga projection may report the rig root; body continuity uses
            // feet. The source adapter supplies its authored root offset.
            // Away NPCs have no live position to reclaim: their hidden last
            // sleep location must not dictate a new login. The trusted world
            // spawn adapter supplies a checked pile arrival in that case.
            if (!npc || npc.kind !== source.kind || npc.activity !== 'away'
              && (npc.y - spawn.feetOffset !== spawn.body.motion?.y
                || ['x', 'z', 'yaw'].some(k => npc[k] !== spawn.body.motion?.[k]))) fail('world body must start at its NPC');
          }
          request.zone = spawn.zone; request.body = structuredClone(spawn.body);
          if (!request.body.motion) fail('world body motion required');
          request.body.motion.vx = request.body.motion.vy = request.body.motion.vz = 0;
        }
      }
    };
    return this.sessions(ticket, tokens, (registry, now) => {
      // Recovery can infer an old unobserved close and expire the body after
      // the initial check. Never turn that reconnect into a fresh spawn.
      if ((registry.view(accountId)?.generation ?? 0) !== observed.generation) fail("stale body preparation after recovery");
      return offered ? registry.offer(request, now) : registry.connect(request, now);
    }, [], accountId, accountId, admission);
  }

  // Asset preparation has finished, but the host still owns the falling body.
  // The offered snapshot is only a preflight; activation returns a fresh one.
  offerBody(ticket, liveTokens, accountId, claim, preparation) {
    return this.connectBody(ticket, liveTokens, accountId, claim, preparation, true);
  }

  // Trusted Room only. The command is retained by Room before dispatch, never
  // built from a browser-supplied claim/body/token. The current host ticket and
  // transport census are deliberately not part of its stable operation identity.
  async bodyOperation(ticket, liveTokens, command, { recoverOnly = false } = {}) {
    if (!Array.isArray(liveTokens) || typeof recoverOnly !== "boolean") fail("invalid body operation recovery");
    const c = structuredClone(validateBodyOperation(command)), tokens = [...liveTokens], owner = { ...ticket }, digest = await bodyOperationDigest(c);
    const parent = this, scoped = Object.create(this);
    scoped.storage = { transaction: callback => parent.storage.transaction(async tx => {
      const now = parent.now(), r = await parent.read(tx); parent.owns(r, owner, now);
      if (!tx.bodyOperations) fail("atomic body operation storage required");
      return tx.bodyOperations.run(c, digest, now, () => callback(tx), recoverOnly);
    }) };
    if (c.phase === "offering") return scoped.offerBody(owner, tokens, c.accountId, c.input.claim, c.input.preparation);
    return c.phase === "activating"
      ? scoped.activateBody(owner, tokens, c.accountId, c.input.ref, c.input.issued)
      : scoped.startedBody(owner, tokens, c.accountId, c.input.ref, c.input.issued);
  }

  async retireBodyOperation(ticket, accountId, connection, request) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      if (!tx.bodyOperations) fail("atomic body operation storage required");
      return tx.bodyOperations.retire(accountId, connection, request, now);
    });
  }

  activateBody(ticket, liveTokens, accountId, ref, issued) {
    return this.bodyHandoff(ticket, liveTokens, accountId, ref, issued, false);
  }

  startedBody(ticket, liveTokens, accountId, ref, issued) {
    return this.bodyHandoff(ticket, liveTokens, accountId, ref, issued, true);
  }

  // Room-only cleanup for a closed handoff with a durable liveSent=false marker.
  // NEVER use this after a body-live send was attempted (even if its result is
  // uncertain). A caller cannot derive that proof from a browser assertion.
  async abandonBody(ticket, liveTokens, accountId, ref, issued) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId !== ref?.accountId || !Array.isArray(liveTokens))
      fail("authenticated body account mismatch");
    if (!exact(issued, ["v", "protocol", "world", "epoch", "revision", "at", "expiresAt", "resetResources", "view", "checkpoint"]))
      fail("invalid abandoned body receipt");
    boundedJSON(issued, HOST.snapshotBytes);
    const transfer = structuredClone(issued), reference = { accountId, generation: ref.generation, token: ref.token };
    if (liveTokens.length > BODY_VIEW.maxBodies || liveTokens.some(token => typeof token !== "string"))
      fail("invalid body cleanup census");
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      // Closed-only rollback may outlive the finite NPC run. Current host
      // ownership and the exact unchanged issued body are still mandatory;
      // this path grants no control and never renews the lease or run window.
      const refused = () => ({ result: { ok: false, reason: "stale", effects: [] } });
      // A replacement host may clean up an old committed hold, but may never
      // deliver it as a new grant. Exact token/generation/body checks below and
      // Room's durable no-live-send proof still apply. Reconcile before ticking.
      if (transfer.v !== 1 || transfer.protocol !== SESSION_PROTOCOL || transfer.world !== r.world
        || !time(transfer.epoch) || transfer.epoch < 1 || transfer.epoch > r.fence
        || transfer.resetResources !== "defaults" || transfer.view?.state !== "starting"
        || transfer.view.accountId !== accountId || transfer.view.generation !== reference.generation
        || ![transfer.revision, transfer.at, transfer.expiresAt, transfer.view.deadline].every(time)
        || transfer.revision < 1 || transfer.revision > r.revision || transfer.at > now
        || transfer.expiresAt <= transfer.at || transfer.expiresAt - transfer.at > HANDOFF_MS) return refused();
      const held = r.sessions?.sessions.find(s => s.accountId === accountId && s.generation === reference.generation && s.token === reference.token);
      if (held?.state === "grace" && held.deadline === transfer.view.deadline) {
        const registry = SessionRegistry.restore(r.sessions, { protocol: SESSION_PROTOCOL, world: r.world, maxSessions: this.maxSessions });
        return { result: { ok: true, duplicate: true, effects: [], view: registry.view(accountId) } };
      }
      const current = await readSessionBody(tx, r, now, accountId, reference, this.maxSessions, true, true, this.sessionAdapter.transfer);
      if (!current || !["starting", "live"].includes(current.view.state)) return refused();
      const view = { ...current.view, state: "starting", deadline: transfer.view.deadline, presentation: transfer.view.presentation };
      if (!sameCheckpointValue(view, transfer.view) || !sameCheckpointValue(current.checkpoint, transfer.checkpoint)) return refused();
      // This is one confirmed closed handoff, not an absence census. Keep
      // unrelated live generations protected until their own observation/event.
      const protectedTokens = r.sessions.sessions.map(s => s.token);
      const { registry, recovery } = this.registry(r, now, protectedTokens, { priorityAccount: accountId, budget });
      // Recovery may already have expired an unacknowledged starting hold.
      const existing = registry.view(accountId);
      const result = existing?.state === "grace" && existing.deadline === transfer.view.deadline
        ? { ok: true, effects: [], view: existing }
        : registry.abandon(reference, transfer.at, transfer.view.deadline, now);
      this.settle(r, registry); r.wallAt = now; await this.save(tx, r);
      return structuredClone({ result, recovery, work: this.work(registry, now, budget) });
    });
  }

  // SERVER-retained transfer + current authenticated socket receipt only. Never
  // accept a browser-supplied snapshot. Offered bodies can fall during preflight;
  // the final short lease is bound to an unchanged exact body until its ACK.
  // Room still needs durable delivery/close records and a current-socket CAS.
  async bodyHandoff(ticket, liveTokens, accountId, ref, issued, started) {
    if (typeof started !== "boolean" || !Number.isSafeInteger(accountId) || accountId < 1 || accountId !== ref?.accountId)
      fail("authenticated body account mismatch");
    if (!Array.isArray(liveTokens) || !exact(issued, ["v", "protocol", "world", "epoch", "revision", "at", "expiresAt", "resetResources", "view", "checkpoint"]))
      fail("invalid body handoff receipt");
    boundedJSON(issued, HOST.snapshotBytes);
    const transfer = structuredClone(issued), reference = { accountId, generation: ref.generation, token: ref.token }, tokens = [...liveTokens];
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil) fail("run closed to body handoff");
      const refused = () => ({ result: { ok: false, reason: "stale", effects: [] }, transfer: null });
      if (transfer.v !== 1 || transfer.protocol !== SESSION_PROTOCOL || transfer.world !== r.world
        || transfer.epoch !== r.fence || transfer.resetResources !== "defaults"
        || ![transfer.revision, transfer.at, transfer.expiresAt].every(time) || transfer.revision < 1
        || transfer.revision > r.revision || transfer.at > now || transfer.expiresAt <= now
        || transfer.view?.accountId !== accountId || transfer.view?.generation !== reference.generation
        || transfer.view?.state !== (started ? "starting" : "offered")) return refused();
      // Reject a stale socket before its old census can change newer sessions.
      const current = await readSessionBody(tx, r, now, accountId, reference, this.maxSessions, true, false, this.sessionAdapter.transfer);
      if (!current || current.view.bodyId !== transfer.view.bodyId || current.view.kind !== transfer.view.kind) return refused();
      const duplicate = started && current.view.state === "live";
      if (current.view.state !== (started ? "starting" : "offered") && !duplicate) return refused();
      if (started) {
        const view = duplicate ? { ...current.view, state: "starting", deadline: transfer.view.deadline, presentation: transfer.view.presentation } : current.view;
        if (!sameCheckpointValue(view, transfer.view) || !sameCheckpointValue(current.checkpoint, transfer.checkpoint)) return refused();
      }
      if (duplicate) return { result: { ok: true, duplicate: true, view: current.view, effects: [] }, transfer: null };
      const { registry, recovery } = this.registry(r, now, tokens, { priorityAccount: accountId, budget });
      const result = started ? registry.started(reference, now) : registry.activate(reference, now);
      this.settle(r, registry); r.wallAt = now;
      await this.save(tx, r);
      const final = !started && result.ok ? await readSessionBody(tx, r, now, accountId, reference, this.maxSessions, true, false, this.sessionAdapter.transfer) : null;
      if (!started && result.ok && !final) fail("missing committed body activation");
      return structuredClone({ result, transfer: final, recovery, work: this.work(registry, now, budget) });
    });
  }

  // Server-only transfer read after connect has committed. accountId must come
  // from Room authentication, never the message body. The current session and
  // its exact component are read atomically; no other player's state or token
  // leaves this method. This is not a browser control grant or an apply ACK.
  async bodyForSession(ticket, accountId, ref) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId !== ref?.accountId)
      fail("authenticated body account mismatch");
    const reference = { accountId, generation: ref?.generation, token: ref?.token };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil) fail("run closed to body transfer");
      return readSessionBody(tx, r, now, accountId, reference, this.maxSessions, false, false, this.sessionAdapter.transfer);
    });
  }

  // Room calls this only for an apply ACK from its current authenticated socket.
  // `issued` is the exact transfer retained by the SERVER, not a browser body.
  // Unrelated world commits may advance revision; changed physical/equipment or
  // occupancy state, generation, epoch or an expired offer may never activate.
  // This read confirms neither presence nor a new lease and changes no deadline.
  async confirmBody(ticket, accountId, ref, issued) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId !== ref?.accountId)
      fail("authenticated body account mismatch");
    if (!exact(issued, ["v", "protocol", "world", "epoch", "revision", "at", "expiresAt", "resetResources", "view", "checkpoint"]))
      fail("invalid body apply receipt");
    boundedJSON(issued, HOST.snapshotBytes);
    const transfer = structuredClone(issued), reference = { accountId, generation: ref.generation, token: ref.token };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx);
      this.owns(r, ticket, now);
      if (r.status !== "running" || now >= r.runUntil) fail("run closed to body confirmation");
      if (transfer.v !== 1 || transfer.protocol !== SESSION_PROTOCOL || transfer.world !== r.world
        || transfer.epoch !== r.fence || transfer.resetResources !== "defaults"
        || ![transfer.revision, transfer.at, transfer.expiresAt].every(time) || transfer.revision < 1
        || transfer.revision > r.revision || transfer.at > now || transfer.expiresAt <= now) return false;
      const current = await readSessionBody(tx, r, now, accountId, reference, this.maxSessions, false, false, this.sessionAdapter.transfer);
      return !!current && sameCheckpointValue(current.view, transfer.view) && sameCheckpointValue(current.checkpoint, transfer.checkpoint);
    });
  }

  // Server-only: account/ref and census come from the current authenticated
  // Room connection. No browser route enables this boundary yet. A duplicate
  // never refreshes presence; a stale generation is rejected before recovery.
  async updateBody(ticket, liveTokens, accountId, ref, sample, { observedAt = null } = {}) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || accountId !== ref?.accountId
      || !exact(sample, ['sequence', 'checkpoint']) || !Number.isSafeInteger(sample.sequence) || sample.sequence < 1)
      fail('invalid body movement account or sample');
    if (observedAt !== null && !time(observedAt)) fail('invalid server movement observation');
    boundedJSON(sample, 4096, 256);
    boundedJSON(liveTokens, 4096, 64);
    const input = structuredClone(sample), reference = { accountId, generation: ref.generation, token: ref.token }, tokens = structuredClone(liveTokens);
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      if (r.status !== 'running' || now >= r.runUntil) fail('run closed to body movement');
      const row = r.sessions?.sessions.find(s => s.accountId === accountId);
      if (!row || row.state !== 'live' || row.generation !== reference.generation || row.token !== reference.token
        || !Array.isArray(tokens) || !tokens.includes(row.token)) fail('fenced body movement session');
      if (!tx.bodyMovements || typeof this.sessionAdapter.readMovement !== 'function'
        || typeof this.sessionAdapter.applyMovement !== 'function') fail('atomic body movement adapter required');
      const candidate = this.sessionAdapter.readMovement(row, input.checkpoint);
      // Source-owned packed scalars encode signed zero explicitly. Hash the
      // canonical validated packed component, never unchecked browser JSON.
      const bytes = encoder.encode(JSON.stringify([observedAt, candidate.checkpoint]));
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(v => v.toString(16).padStart(2, '0')).join('');
      return tx.bodyMovements.run({ v: 1, accountId, bodyId: row.bodyId, generation: row.generation,
        sequence: input.sequence, digest, at: now },
      [...r.sessions.sessions, ...r.sessions.pending].map(s => s.accountId), async () => {
        this.sessionAdapter.applyMovement(row, candidate);
        const { registry } = this.registry(r, now, tokens, { priorityAccount: accountId, budget });
        const result = registry.updateObserved(reference, now, observedAt ?? now, { motion: candidate.motion,
          ...(candidate.equipment === undefined ? {} : { equipment: candidate.equipment }) });
        if (result !== true) fail('body movement refused');
        this.settle(r, registry); r.wallAt = now; await this.save(tx, r);
      });
    });
  }

  // A distinct RPC name makes an older host refuse instead of silently ignoring
  // the Room observation option and moving presence past a confirmed close.
  async updateObservedBody(ticket, liveTokens, accountId, ref, sample, observedAt) {
    if (!time(observedAt)) fail('server movement observation required');
    return this.updateBody(ticket, liveTokens, accountId, ref, sample, { observedAt });
  }

  // A close is an explicit server observation, not an inferred missing transport. Retrying a
  // stale/already-grace generation cannot move its deadline. Never use a browser-supplied timestamp.
  async disconnect(ticket, liveTokens, ref, closedAt) {
    const closeRef = { accountId: ref?.accountId, generation: ref?.generation, token: ref?.token };
    return this.sessions(ticket, liveTokens, registry => registry.view(closeRef.accountId), [{ ref: closeRef, at: closedAt }]);
  }

  // Trusted closed Room row only. Unlike sessions(), this finite cleanup may
  // finish after the NPC run ends. It observes exactly one close, infers no
  // other live absence, and cannot renew ownership, run AI or replay movement.
  async closeRetainedBody(ticket, ref, closedAt) {
    if (!ref || !Number.isSafeInteger(ref.accountId) || ref.accountId < 1
      || !Number.isSafeInteger(ref.generation) || ref.generation < 1
      || typeof ref.token !== "string" || !/^[0-9a-f]{32}$/.test(ref.token) || !time(closedAt)) fail("invalid retained body close");
    const reference = { accountId: ref.accountId, generation: ref.generation, token: ref.token };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      if (closedAt > now) fail("future retained body close");
      const previous = r.sessions;
      if (!previous?.sessions.some(s => s.accountId === reference.accountId
        && s.generation === reference.generation && s.token === reference.token)) return { changed: false };
      const tokens = previous.sessions.map(s => s.token);
      // The finite run already stopped authorizing live movement at runUntil.
      const at = Math.min(closedAt, r.runUntil);
      const { registry } = this.registry(r, now, tokens, { closes: [{ ref: reference, at }] });
      this.settle(r, registry);
      const changed = !sameCheckpointValue(previous.sessions, r.sessions.sessions)
        || !sameCheckpointValue(previous.pending, r.sessions.pending);
      if (changed) { r.wallAt = now; await this.save(tx, r); }
      return { changed };
    });
  }

  async bodyReferenceState(ticket, accountId, ref) {
    if (!Number.isSafeInteger(accountId) || accountId < 1 || ref?.accountId !== accountId) fail("authenticated body account mismatch");
    const reference = structuredClone(ref);
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      const held = r.sessions?.sessions.find(s => s.accountId === accountId && s.bodyId === reference.bodyId
        && s.generation === reference.generation && s.token === reference.token);
      if (!held) return null;
      return SessionRegistry.restore(r.sessions, { protocol: SESSION_PROTOCOL, world: r.world, maxSessions: this.maxSessions }).view(accountId);
    });
  }

  // Read before requesting a cross-object census; mutations must compare it.
  async bodyLifecycleRevision(ticket) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      return r.revision;
    });
  }

  // Runner attachment must be possible while a body deadline is due. Reading
  // poses is deliberately blocked then; metadata grants no publication/control.
  async worldRunState(ticket) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      return { world: r.world, epoch: r.fence, owner: r.owner, revision: r.revision,
        status: r.status, runUntil: r.runUntil, publicationProtocol: r.room ? 1 : 0,
        canPublish: typeof this.simulation.poses === 'function' };
    });
  }

  // Explicit server event after close observations/census are reconciled by
  // Room. No NPC tick, clock catch-up, ownership renewal, timer or physics loop.
  // A no-op remains read-only, including repeated wakes and lost-reply retries.
  async reconcileBodies(ticket, liveTokens, closes = [], { expectedRevision } = {}) {
    if (expectedRevision !== undefined && (!time(expectedRevision) || expectedRevision < 1)) fail("invalid body census revision");
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      // A Room census is not an atomic cross-object read. Refuse if admission,
      // live ACK or movement changed the host while that census was in flight.
      if (expectedRevision !== undefined && expectedRevision !== r.revision)
        return { changed: false, superseded: true, epoch: r.fence, revision: r.revision, wakeAt: null };
      const previous = r.sessions;
      // Validate the authenticated event even before the first body admission.
      const { registry } = this.registry(r, now, liveTokens, { closes, create: true });
      if (!previous) return { changed: false, epoch: r.fence, revision: r.revision, wakeAt: null };
      if (now >= r.runUntil) registry.drain(r.runUntil, now);
      this.settle(r, registry);
      // Ignore only the read-time registry clock. Every persisted ownership,
      // position, deadline, occupancy and handback field remains compared.
      const changed = !sameCheckpointValue(previous.sessions, r.sessions.sessions)
        || !sameCheckpointValue(previous.pending, r.sessions.pending)
        || previous.nextGeneration !== r.sessions.nextGeneration;
      if (changed) { r.wallAt = now; await this.save(tx, r); }
      return { changed, epoch: r.fence, revision: r.revision, wakeAt: bodyWake(r) };
    });
  }

  // A complete, bounded committed view for Room/late-join delivery. This is not
  // an enabled transport and grants no control. Tokens and private components
  // never enter the frame. Consumers must fence its epoch/revision and expiry.
  async bodyPresence(ticket) {
    return this.storage.transaction(async tx => {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      const wakeAt = bodyWake(r);
      if (wakeAt !== null && now >= wakeAt) fail("body lifecycle due");
      const count = (r.sessions?.sessions.length || 0) + (r.sessions?.pending.length || 0);
      if (count > BODY_VIEW.maxBodies) fail("body presentation capacity");
      const registry = r.sessions && SessionRegistry.restore(r.sessions,
        { protocol: SESSION_PROTOCOL, world: r.world, maxSessions: this.maxSessions });
      const frame = { v: BODY_VIEW.version, protocol: SESSION_PROTOCOL, world: r.world,
        epoch: r.fence, revision: r.revision, now, expiresAt: Math.min(r.leaseUntil, wakeAt ?? Infinity),
        views: registry ? r.sessions.sessions.map(s => registry.view(s.accountId)) : [],
        departures: registry ? registry.pending() : [] };
      return { wakeAt, frame: JSON.parse(boundedJSON(frame, BODY_VIEW.maxBytes)) };
    });
  }

  // Trusted server-only receipt after Room durably retains a presentation. No
  // browser ACK can call this hook. Room delivery wiring is still required;
  // passing IDs alone is not proof that a viewer received a frame. The exact
  // host revision prevents a delayed receipt from deleting a newer departure.
  async acknowledgeBodyDepartures(ticket, receipt) {
    if (!exact(receipt, ["world", "epoch", "revision", "ids"]) || !id(receipt.world)
      || !time(receipt.epoch) || !receipt.epoch || !time(receipt.revision) || !receipt.revision
      || !Array.isArray(receipt.ids) || !receipt.ids.length || receipt.ids.length > BODY_VIEW.maxBodies
      || receipt.ids.some(value => typeof value !== "string" || value.length > 23 || !/^depart:[1-9][0-9]*$/.test(value))
      || new Set(receipt.ids).size !== receipt.ids.length) fail("invalid body departure receipt");
    const observed = { ...receipt, ids: [...receipt.ids] };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      if (observed.world !== r.world || observed.epoch !== r.fence || observed.revision !== r.revision)
        return { changed: false, superseded: true };
      const pending = r.sessions?.pending || [], ids = new Set(observed.ids);
      if (observed.ids.some(value => !pending.some(p => p.id === value && p.applied)))
        fail("unapplied or unknown body departure");
      // Only remove already-applied persisted intents. Recovering the registry
      // here could sweep another due body and turn its delivery ACK into a new
      // disconnect/handback operation; that belongs to explicit reconciliation.
      r.sessions.pending = pending.filter(p => !ids.has(p.id));
      r.wallAt = now;
      if (now >= r.runUntil && !r.sessions.sessions.length && !r.sessions.pending.length) {
        r.status = "stopped"; r.leaseUntil = now;
      }
      await this.save(tx, r);
      return { changed: true, superseded: false };
    });
  }

  // Project only a committed checkpoint, without stepping, renewing or writing it.
  // The optional full-rig adapter must be pure and deterministic. Public x/y/z
  // snapshots cannot substitute for it. A caller cannot publish uncommitted work.
  async poses(ticket, { format, skipPending = false } = {}) {
    if (typeof skipPending !== "boolean") fail("invalid pending publication policy");
    if (format !== undefined && !["mixed-1", "mixed-2", "mixed-3"].includes(format)) fail("unsupported host pose format");
    if (typeof this.simulation.poses !== "function") fail("NPC pose adapter required");
    return this.transaction(async function(tx) {
      const r = await this.publicationRecord(tx, ticket, skipPending);
      if (!r) return null;
      const queries = this.simulation.readQueries?.(r.simulation);
      if (queries?.then || queries && typeof queries.npcFor !== "function") fail("invalid simulation queries");
      const frame = typeof queries?.poses === "function" ? queries.poses(format) : this.simulation.poses(structuredClone(r.simulation), format);
      const authority = { v: format === "mixed-3" ? 4 : format === "mixed-2" ? 3 : format ? 2 : 1, ...(format ? { format } : {}), mode: "server", world: r.world, epoch: r.fence, revision: r.revision };
      if (!globalThis.BL.npcAuthority.posesFor(authority, frame, format !== undefined)) fail("invalid host poses");
      return { ticket: this.ticket(r), sequence: r.revision, at: r.simulatedAt, publicationProtocol: r.room ? 1 : 0,
        runUntil: r.runUntil, ...(format ? { format } : {}), frame: frame.slice(0) };
    });
  }

  // Bind only after Room has committed the matching authority. A failed first
  // configuration must not strand a host behind a nonexistent Room. Compare the
  // projected revision; metadata-only binding may reuse those exact frame bytes.
  async bindRoomPublication(ticket, { sequence, at, runUntil }) {
    return this.transaction(async function(tx) {
      const r = await this.publicationRecord(tx, ticket, true);
      if (!r) return null;
      const fresh = r.revision === sequence && r.simulatedAt === at && r.runUntil === runUntil;
      if (!r.room) { r.room = { v: 1, pending: false, claim: null }; await this.save(tx, r); }
      // A simulation write may obsolete these bytes, but must not starve the
      // ownership barrier. The next projection observes the durable binding.
      if (!fresh) return null;
      return { publicationProtocol: 1, sequence: r.revision, at: r.simulatedAt, runUntil: r.runUntil };
    });
  }

  async publicationRecord(tx, ticket, skipPending = false) {
    const now = this.now(), r = await this.read(tx);
    this.owns(r, ticket, now);
    if (r.status !== "running" || now >= r.runUntil) fail("run closed to pose publication");
    // Frozen positions need no catch-up. Due departures and expired handoff
    // leases still require durable lifecycle reconciliation before publication.
    if (r.sessions?.sessions.some(s => s.state !== "live" && (now >= s.deadline
      || s.state === "starting" && now >= Math.min(s.stepAt + HANDOFF_MS, s.deadline)))) {
      if (skipPending) return null;
      fail("body recovery pending");
    }
    return r;
  }

  // Recheck the exact committed revision after Room RPCs without projecting the
  // same deterministic rigs again. Every persisted mutation increments revision;
  // this still validates storage, ownership, deadlines and pending body recovery.
  // It is not a frame validator or a substitute for Room's independent fence.
  async confirmPoses(ticket, { sequence, at, runUntil }, { skipPending = false } = {}) {
    if (typeof skipPending !== "boolean") fail("invalid pending publication policy");
    if (!time(sequence) || !sequence || !time(at) || !time(runUntil)) fail("invalid pose revision");
    if (typeof this.simulation.poses !== "function") fail("NPC pose adapter required");
    return this.transaction(async function(tx) {
      const r = await this.publicationRecord(tx, ticket, skipPending);
      if (!r) return false;
      return r.revision === sequence && r.simulatedAt === at && r.runUntil === runUntil;
    });
  }

  work(registry, now, budget) {
    return registry ? { ...registry.work(now), attemptedSteps: this.passiveSteps - budget.left } : undefined;
  }

  // A reader is valid only until the next simulation mutation. It is local to
  // this transaction attempt, never retained on VirtualHost or in storage.
  npcLookup(r) {
    if (!this.simulation.readQueries) return (bodyId, source) => this.simulation.npcFor(r.simulation, bodyId, source);
    const queries = this.simulation.readQueries(r.simulation);
    if (!queries || typeof queries.npcFor !== "function" || queries.then) fail("invalid simulation queries");
    return (bodyId, source) => queries.npcFor(bodyId, source);
  }

  registry(r, now, liveTokens, { closes = [], create = false, priorityAccount = null, budget = { left: this.passiveSteps } } = {}) {
    if (!r.sessions && !create) return { registry: null, recovery: { effects: [] } };
    if (!Array.isArray(liveTokens)) fail("authenticated transport census required");
    const options = { protocol: SESSION_PROTOCOL, world: r.world, maxSessions: this.maxSessions, passiveBudget: this.passiveSteps, adapter: {
      stepPassive: (motion, ms) => {
        // Storage can rerun this callback against a fresh checkpoint. Attempts
        // share the outer operation budget; exhaustion aborts without publishing
        // any speculative progress. A later explicit operation may try again.
        if (budget.left <= 0) fail("passive operation budget exhausted");
        budget.left--;
        return this.sessionAdapter.stepPassive(motion, ms, r.simulation);
      },
      canStep: typeof this.sessionAdapter.canStep === "function" ? body => this.sessionAdapter.canStep(body) : undefined,
      validateOccupancy: (body, resource) => this.sessionAdapter.validateOccupancy?.(body, resource, r.simulation) === true,
    } };
    // Validate census/close bounds on first admission too, not only once a checkpoint exists.
    const registry = SessionRegistry.restore(r.sessions || new SessionRegistry(options).checkpoint(), options);
    const recovery = registry.recover(now, liveTokens, closes, priorityAccount);
    return { registry, recovery };
  }

  settle(r, registry) {
    // Player lifecycle and NPC simulation are independent. Legacy pending
    // handback metadata may still be read, but never moves, resumes or spawns
    // an NPC. The client makes the existing track solid when presence ends.
    for (const intent of registry.pending()) {
      if (intent.applied) continue;
      registry.markApplied(intent.id);
    }
    r.sessions = registry.checkpoint();
  }

  async stop(ticket, liveTokens) {
    const budget = { left: this.passiveSteps };
    return this.transaction(async function(tx) {
      const now = this.now(), r = await this.read(tx); this.owns(r, ticket, now);
      const { registry, recovery } = this.registry(r, now, liveTokens, { budget });
      const effects = registry ? registry.drain(Math.min(now, r.runUntil), now).effects : [];
      if (registry) this.settle(r, registry);
      r.runUntil = Math.min(now, r.runUntil); r.status = registry?.size ? "draining" : "stopped";
      r.wallAt = now; r.leaseUntil = registry?.size ? now + HOST.leaseMs : now;
      await this.save(tx, r);
      return { status: r.status, recovery, effects, work: this.work(registry, now, budget) };
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
