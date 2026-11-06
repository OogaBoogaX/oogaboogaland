// Inactive Room-side durable handoff outbox. No route, binding or timer enables
// it. Caller identities and host replies are server-owned, never message bodies.
// Persist intent BEFORE a host RPC; an uncertain reply leaves pending work for
// reconciliation. It must never be turned into an automatic second admission.
import { boundedJSON, sameCheckpointValue } from "./virtual-host.js";
import "../../src/js/body-motion.js";
import "../../src/js/ooga-body.js";
import "../../src/js/ooga-motion.js";
export const ROOM_BODY = Object.freeze({ key: "room-body-handoff-v1", prefix: "room-body-handoff-v1:",
  max: 32, indexBytes: 1024, rowBytes: 34 * 1024, transferBytes: 32 * 1024 });
export const ROOM_MOVEMENT = Object.freeze({ prefix: 'room-body-movement-v1:', rowBytes: 5120, sampleBytes: 4096 });
const integer = n => Number.isSafeInteger(n) && n >= 0;
const positive = n => integer(n) && n > 0;
const token = s => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);
const name = s => typeof s === "string" && /^[A-Za-z0-9._:/-]{1,64}$/.test(s);
const connection = s => typeof s === "string" && /^[A-Za-z0-9-]{1,64}$/.test(s);
const exact = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
const fail = () => { throw Error("invalid or fenced Room body handoff"); };
const phases = ["prepared", "offering", "offered", "activating", "starting", "confirming", "live", "closed"];
const key = accountId => ROOM_BODY.prefix + accountId;
const identityValid = i => exact(i, ["accountId", "connection"]) && positive(i.accountId) && connection(i.connection);
const matches = (r, i) => r?.accountId === i.accountId && r.connection === i.connection;
const reference = (v, accountId, bodyId) => exact(v, ["accountId", "bodyId", "generation", "token"])
  && v.accountId === accountId && v.bodyId === bodyId && positive(v.generation) && token(v.token);
const receipt = t => ({ epoch: t.epoch, generation: t.view.generation, revision: t.revision });
const matchesReceipt = (m, t) => t && m.epoch === t.epoch && m.generation === t.view.generation && m.revision === t.revision;
function transferValid(t, r, state) {
  if (!exact(t, ["v", "protocol", "world", "epoch", "revision", "at", "expiresAt", "resetResources", "view", "checkpoint"])) return false;
  boundedJSON(t, ROOM_BODY.transferBytes, 512);
  return t.v === 1 && t.protocol === "host-session-v5" && t.world === r.preparation.world && t.epoch === r.preparation.epoch
    && positive(t.revision) && integer(t.at) && positive(t.expiresAt) && t.expiresAt > t.at && t.expiresAt - t.at <= (state === "starting" ? 1000 : 10000)
    && t.resetResources === "defaults" && t.view?.state === state && t.view.accountId === r.accountId
    && t.view.bodyId === r.preparation.bodyId && t.view.kind === r.kind && t.view.generation === r.ref?.generation
    && !Object.hasOwn(t.view, "token") && positive(t.view.deadline) && t.expiresAt <= t.view.deadline;
}
function validate(r) {
  boundedJSON(r, ROOM_BODY.rowBytes, 1024);
  if (!exact(r, ["v", "revision", "accountId", "connection", "request", "kind", "preparation", "claim", "phase", "at", "ref", "transfer", "pending", "closedAt", "liveSent", ...(Object.hasOwn(r || {}, "stopAt") ? ["stopAt"] : [])])
    || ![2, 3].includes(r.v) || r.v === 3 && !['live', 'closed'].includes(r.phase) || !positive(r.revision) || !identityValid({ accountId: r.accountId, connection: r.connection })
    || !token(r.request) || !["ooga", "clanker"].includes(r.kind) || !phases.includes(r.phase) || !integer(r.at)
    || typeof r.liveSent !== "boolean" || r.liveSent && !["live", "closed"].includes(r.phase)) fail();
  if (Object.hasOwn(r, "stopAt") && (!integer(r.stopAt) || r.stopAt > r.at || !r.liveSent
    || !["live", "closed"].includes(r.phase) || r.pending !== null)) fail();
  const p = r.preparation;
  if (!exact(p, ["v", "world", "epoch", "accountId", "bodyId", "generation", "nextGeneration", "expiresAt"])
    || p.v !== 1 || !name(p.world) || !name(p.bodyId) || p.accountId !== r.accountId || !positive(p.epoch)
    || !integer(p.generation) || !integer(p.nextGeneration) || !positive(p.expiresAt)) fail();
  if (r.ref !== null && !reference(r.ref, r.accountId, p.bodyId)) fail();
  if (r.claim !== null) {
    boundedJSON(r.claim, 2048, 128);
    if (r.claim.accountId !== r.accountId || r.claim.bodyId !== p.bodyId || r.claim.world !== p.world
      || r.claim.protocol !== "host-session-v5" || r.claim.body && r.claim.body.kind !== r.kind
      || !["prepared", "offering", "closed"].includes(r.phase)) fail();
  }
  if (r.transfer !== null && (!r.ref || !transferValid(r.transfer, r, r.transfer.view?.state)
    || !["offered", "starting"].includes(r.transfer.view?.state))) fail();
  if (r.pending !== null && (!exact(r.pending, ["phase", "revision"]) || !["offering", "activating", "confirming"].includes(r.pending.phase)
    || !positive(r.pending.revision) || r.pending.revision > r.revision || r.phase !== "closed" && r.pending.phase !== r.phase)) fail();
  if ((r.phase === "closed") !== (r.closedAt !== null) || r.closedAt !== null && (!integer(r.closedAt) || r.closedAt > r.at)) fail();
  if (["offering", "activating", "confirming"].includes(r.phase) && !r.pending) fail();
  if (["offered", "activating", "starting", "confirming", "live"].includes(r.phase) && !r.transfer) fail();
  if (["prepared", "offered", "starting", "live"].includes(r.phase) && r.pending) fail();
  if (["offered", "activating"].includes(r.phase) && r.transfer.view.state !== "offered"
    || ["starting", "confirming", "live"].includes(r.phase) && r.transfer.view.state !== "starting") fail();
  return r;
}

function movementValid(m, r) {
  boundedJSON(m, ROOM_MOVEMENT.rowBytes, 512);
  if (!exact(m, ['v', 'accountId', 'connection', 'request', 'generation', 'sequence', 'receivedAt', 'checkpoint', 'receipt', 'fenced'])
    || m.v !== 1 || !matches(m, r) || m.request !== r.request || m.generation !== r.ref?.generation
    || !positive(m.sequence) || !integer(m.receivedAt) || typeof m.fenced !== 'boolean'
    || m.fenced && r.phase !== 'closed' || r.phase === 'closed' && m.receivedAt > r.closedAt
    || m.receipt !== null && (!exact(m.receipt, ['sequence', 'at']) || m.receipt.sequence !== m.sequence
      || !integer(m.receipt.at) || m.receipt.at < m.receivedAt || m.fenced)) fail();
  boundedJSON({ sequence: m.sequence, checkpoint: m.checkpoint }, ROOM_MOVEMENT.sampleBytes, 256);
  return m;
}
const movementKey = accountId => ROOM_MOVEMENT.prefix + accountId;

export class RoomBodyHandoff {
  constructor({ storage, current, send, clock = Date.now }) {
    if (typeof storage?.transaction !== "function" || ![current, send, clock].every(f => typeof f === "function")) fail();
    this.storage = storage; this.current = current; this.send = send; this.clock = clock;
  }
  now(r) { const now = this.clock(); if (!integer(now) || r && now < r.at) fail(); return now; }
  async index(tx) {
    const ids = await tx.get(ROOM_BODY.key) || [];
    boundedJSON(ids, ROOM_BODY.indexBytes);
    if (!Array.isArray(ids) || ids.length > ROOM_BODY.max || ids.some(id => !positive(id)) || new Set(ids).size !== ids.length) fail();
    return ids;
  }
  async read(identity, tx = this.storage) {
    if (!identityValid(identity)) fail();
    const value = await tx.get(key(identity.accountId));
    if (value === undefined) return null;
    const row = validate(value);
    if (row.v === 3) movementValid(await tx.get(movementKey(row.accountId)), row);
    return matches(row, identity) ? structuredClone(row) : null;
  }
  async records() {
    return this.storage.transaction(async tx => {
      const ids = await this.index(tx), rows = [];
      for (const accountId of ids) {
        const row = validate(await tx.get(key(accountId)));
        if (row.accountId !== accountId) fail();
        if (row.v === 3) movementValid(await tx.get(movementKey(row.accountId)), row);
        rows.push(structuredClone(row));
      }
      return rows;
    });
  }
  async prepare(identity, preparation, kind, request, claim = null) {
    if (!identityValid(identity) || !token(request)) fail();
    const input = structuredClone({ identity, preparation, kind, request, claim });
    return this.storage.transaction(async tx => {
      if (this.current(input.identity) !== true) fail();
      const now = this.now(), ids = await this.index(tx), existing = await tx.get(key(input.identity.accountId));
      if (existing !== undefined) {
        validate(existing);
        if (!matches(existing, input.identity) || existing.request !== input.request || existing.kind !== input.kind
          || !sameCheckpointValue(existing.preparation, input.preparation)
          || ["prepared", "offering"].includes(existing.phase) && !sameCheckpointValue(existing.claim, input.claim)) fail();
        return structuredClone(existing); // reconcile uncertain prepare; never replace an outstanding close
      }
      if (ids.includes(input.identity.accountId) || ids.length >= ROOM_BODY.max
        || await tx.get(movementKey(input.identity.accountId)) !== undefined) fail();
      const row = validate({ v: 2, revision: 1, ...input.identity, request: input.request, kind: input.kind, claim: input.claim,
        preparation: input.preparation, phase: "prepared", at: now, ref: null, transfer: null, pending: null, closedAt: null, liveSent: false });
      if (now >= row.preparation.expiresAt || row.preparation.expiresAt - now > 10000) fail();
      await tx.put(key(row.accountId), row); await tx.put(ROOM_BODY.key, [...ids, row.accountId]); return structuredClone(row);
    });
  }
  async receive(identity, message) {
    if (!identityValid(identity)) fail();
    const m = structuredClone(message);
    if (!m || !["body-ready", "body-applied", "body-started", "body-decline"].includes(m.t)
      || !exact(m, ["body-ready", "body-decline"].includes(m.t) ? ["t", "request"] : ["t", "request", "epoch", "generation", "revision"])) return { status: "refused" };
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), now = this.now(r);
      if (!r || m.request !== r.request) return { status: "refused" };
      // Match the retained request and authenticated connection before closing.
      // A retry reconciles the first durable close time, even after expiry/wake.
      // Pending RPCs and possible live delivery remain for ordinary cleanup.
      if (m.t === "body-decline") {
        if (r.phase === "closed") return { status: "closed", record: r };
        if (this.current(identity) !== true) return { status: "refused" };
        const movement = await this.movement(identity, tx, r);
        if (movement && now < movement.receivedAt) fail();
        r.revision++; r.at = r.closedAt = now; r.phase = "closed";
        await tx.put(key(r.accountId), validate(r)); return { status: "closed", record: structuredClone(r) };
      }
      if (Object.hasOwn(r, "stopAt")) return { status: "refused" };
      if (this.current(identity) !== true || r.phase === "closed") return { status: "refused" };
      const stage = { "body-ready": ["prepared", "offering"], "body-applied": ["offered", "activating"], "body-started": ["starting", "confirming"] }[m.t];
      if (m.t !== "body-ready" && !matchesReceipt(m, r.transfer)) return { status: "refused" };
      if (now >= (r.transfer?.expiresAt ?? r.preparation.expiresAt)) return { status: "expired" };
      if (r.pending) return { status: "pending", record: r }; // unknown RPC outcome: inspect/reconcile, do NOT dispatch again
      if (r.phase !== stage[0]) return { status: "duplicate", record: r };
      r.revision++; r.at = now; r.phase = stage[1]; r.pending = { phase: r.phase, revision: r.revision };
      await tx.put(key(r.accountId), validate(r)); return { status: "dispatch", record: structuredClone(r) };
    });
  }
  // A host RPC completion may arrive after the socket closed. Retain its private
  // ref for cleanup, but never reopen or send to that socket or its replacement.
  async complete(identity, operationRevision, result) {
    if (!identityValid(identity) || !positive(operationRevision)) fail();
    const answer = structuredClone(result);
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), now = this.now(r);
      if (!r || r.pending?.revision !== operationRevision) fail();
      if (r.phase === "closed" && answer?.result?.ok === false && answer.result.reason === "cancelled") {
        r.revision++; r.at = now; r.pending = null; r.claim = null;
        await tx.put(key(r.accountId), validate(r)); return structuredClone(r);
      }
      if (answer?.result?.ok !== true) fail(); // preserve uncertainty/failure until explicit reconciliation
      const stage = r.pending.phase, prior = r.transfer;
      if (stage === "offering") {
        if (!reference(answer.result.session, r.accountId, r.preparation.bodyId)) fail();
        r.ref = answer.result.session; r.transfer = answer.transfer;
        if (!transferValid(r.transfer, r, "offered")) fail();
        r.claim = null;
      } else if (stage === "activating") {
        if (!reference(answer.result.session, r.accountId, r.preparation.bodyId)
          || answer.result.session.token !== r.ref.token || answer.result.session.generation !== r.ref.generation) fail();
        r.transfer = answer.transfer;
        if (!transferValid(r.transfer, r, "starting") || r.transfer.revision <= prior.revision) fail();
      } else {
        const view = answer.result.view;
        if (view?.state !== "live" || view.accountId !== r.accountId || view.bodyId !== r.ref.bodyId || view.generation !== r.ref.generation) fail();
      }
      r.revision++; r.at = now; r.pending = null;
      if (r.phase !== "closed") r.phase = { offering: "offered", activating: "starting", confirming: "live" }[stage];
      await tx.put(key(r.accountId), validate(r)); return structuredClone(r);
    });
  }
  async movement(identity, tx = this.storage, row = null) {
    const r = row || await this.read(identity, tx);
    if (!r) return null;
    const value = await tx.get(movementKey(r.accountId));
    if (value !== undefined && r.v !== 3) fail();
    return value === undefined ? null : structuredClone(movementValid(value, r));
  }
  // Explicit finite ingress only. Room derives identity from its current socket;
  // no browser identity, token or timestamp is used. One unresolved sample blocks
  // newer samples, so an uncertain host reply cannot be overwritten on wake.
  async receiveMovement(identity, message) {
    const format = message?.t === globalThis.BL.bodyMotion.TYPE ? globalThis.BL.bodyMotion
      : message?.t === globalThis.BL.oogaMotion.TYPE ? globalThis.BL.oogaMotion : null;
    const compact = !!format;
    if (!identityValid(identity) || (compact ? !format.envelope(message)
      : !exact(message, ['t', 'request', 'sequence', 'checkpoint'])
        || message.t !== 'body-motion' || !token(message.request) || !positive(message.sequence))) fail();
    if (!compact) boundedJSON({ sequence: message.sequence, checkpoint: message.checkpoint }, ROOM_MOVEMENT.sampleBytes, 256);
    const input = structuredClone(message), who = { ...identity };
    return this.storage.transaction(async tx => {
      const r = await this.read(who, tx), now = this.now(r);
      if (!r || r.phase !== 'live' || !r.liveSent || Object.hasOwn(r, 'stopAt') || input.request !== r.request || this.current(who) !== true) fail();
      let checkpoint = input.checkpoint;
      if (compact) {
        const retained = r.transfer?.checkpoint;
        if (format === globalThis.BL.oogaMotion) {
          if (r.kind !== 'ooga' || retained?.world !== r.preparation.world) fail();
          checkpoint = format.unpack(input.data, retained);
        } else {
          if (r.kind !== 'clanker' || !exact(retained, ['v', 'world', 'profile', 'body'])
            || retained.v !== 1 || retained.world !== r.preparation.world || typeof retained.profile !== 'string'
            || !Array.isArray(retained.body) || retained.body.length !== 10) fail();
          checkpoint = { ...retained, body: format.unpack(input.data, retained.body[0]) };
        }
        boundedJSON({ sequence: input.sequence, checkpoint }, ROOM_MOVEMENT.sampleBytes, 256);
      }
      const old = await this.movement(who, tx, r);
      if (this.current(who) !== true) fail();
      if (old) {
        if (now < old.receivedAt || old.fenced || input.sequence < old.sequence) fail();
        if (input.sequence === old.sequence) {
          if (!sameCheckpointValue(old.checkpoint, checkpoint)) fail();
          return { status: old.receipt ? 'accepted' : 'pending', sequence: old.sequence };
        }
        if (!old.receipt) return { status: 'busy', sequence: old.sequence };
        // Compact browser ingress retains its write debt through hibernation.
        // Private server callers keep their existing explicit cadence contract.
        if (compact && now - old.receivedAt < 250) return { status: 'paced', sequence: old.sequence };
      }
      const next = movementValid({ v: 1, ...who, request: r.request, generation: r.ref.generation,
        sequence: input.sequence, receivedAt: now, checkpoint, receipt: null, fenced: false }, r);
      if (r.v !== 3) {
        // Older v2 writers refuse this row instead of deleting a pending sample
        // through their handoff-only cleanup. Both records commit atomically.
        r.v = 3; r.revision++; r.at = now; await tx.put(key(r.accountId), validate(r));
      }
      await tx.put(movementKey(r.accountId), next);
      return { status: 'pending', sequence: next.sequence };
    });
  }
  async pendingMovement(identity) {
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), m = r && await this.movement(identity, tx, r);
      if (!m || m.receipt || m.fenced) return null;
      return { closed: r.phase === 'closed', closedAt: r.closedAt, ref: r.ref, observedAt: m.receivedAt,
        sample: { sequence: m.sequence, checkpoint: m.checkpoint } };
    });
  }
  async completeMovement(identity, sequence, answer) {
    if (!identityValid(identity) || !positive(sequence)) fail();
    const receipt = structuredClone(answer);
    if (!exact(receipt, ['sequence', 'at']) || receipt.sequence !== sequence || !integer(receipt.at)) fail();
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), m = r && await this.movement(identity, tx, r);
      this.now(r);
      if (!m || m.sequence !== sequence || m.fenced) fail();
      if (m.receipt) { if (!sameCheckpointValue(m.receipt, receipt)) fail(); return m; }
      m.receipt = receipt;
      await tx.put(movementKey(r.accountId), movementValid(m, r)); return structuredClone(m);
    });
  }
  // Only a trusted host proof that this generation is already passive/absent
  // can retire an unresolved sample after close. It can never become live again.
  async fenceMovement(identity, sequence, confirmation) {
    const proof = structuredClone(confirmation);
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), m = r && await this.movement(identity, tx, r);
      this.now(r);
      if (!m || r.phase !== 'closed' || m.sequence !== sequence || m.receipt
        || !exact(proof, ['ref', 'view']) || !sameCheckpointValue(proof.ref, r.ref)
        || proof.view !== null && (!["grace", "offered"].includes(proof.view?.state)
          || proof.view.accountId !== r.accountId || proof.view.bodyId !== r.ref.bodyId || proof.view.generation !== r.ref.generation)) fail();
      m.fenced = true;
      await tx.put(movementKey(r.accountId), movementValid(m, r)); return true;
    });
  }
  async deliverMovement(identity) {
    const r = await this.read(identity), m = r && await this.movement(identity, this.storage, r);
    if (!r || r.phase !== 'live' || !r.liveSent || !m?.receipt || m.fenced || this.current(identity) !== true) return false;
    return this.send(identity, { t: 'body-motion-ack', request: r.request, generation: r.ref.generation,
      sequence: m.sequence }) === true;
  }

  async close(identity, observedAt = this.clock()) {
    if (!identityValid(identity)) fail();
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), now = this.now(r);
      if (!integer(observedAt) || observedAt > now) fail();
      if (!r || r.phase === "closed") return r;
      const movement = await this.movement(identity, tx, r);
      if (movement && observedAt < movement.receivedAt) fail();
      r.revision++; r.at = now; r.phase = "closed"; r.closedAt = observedAt;
      await tx.put(key(r.accountId), validate(r)); return structuredClone(r);
    });
  }
  // Persist a stop request before notifying a connected controller. No new
  // movement or handoff can start afterward. The authenticated decline ACK,
  // not the send attempt, records the body close time for host reconciliation.
  async requestStop(identity) {
    if (!identityValid(identity)) fail();
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx), now = this.now(r);
      if (!r || this.current(identity) !== true) fail();
      if (Object.hasOwn(r, "stopAt")) return r;
      if (r.phase !== "live" || !r.liveSent || r.pending) fail();
      const movement = await this.movement(identity, tx, r);
      if (movement && !movement.receipt) fail();
      r.stopAt = now; r.at = now; r.revision++;
      await tx.put(key(r.accountId), validate(r)); return structuredClone(r);
    });
  }
  // Read the SAME durable command after an uncertain reply. Only the host's
  // atomic receipt API may retry it; raw offerBody must never be retried here.
  async command(identity) {
    return (await this.pending(identity))?.command ?? null;
  }
  async pending(identity) {
    const r = await this.read(identity);
    if (!r?.pending) return null;
    if (r.pending.phase === "offering" && !r.claim) fail();
    return { closed: r.phase === "closed", command: { accountId: r.accountId, connection: r.connection, request: r.request,
      phase: r.pending.phase, revision: r.pending.revision, input: r.pending.phase === "offering"
        ? { claim: r.claim, preparation: r.preparation } : { ref: r.ref, issued: r.transfer } } };
  }
  async cleanup(identity) {
    const r = await this.read(identity); this.now(r);
    if (!r || r.phase !== "closed") return null;
    if (r.pending) return { kind: "reconcile", record: r };
    const movement = await this.movement(identity, this.storage, r);
    if (movement && !movement.receipt && !movement.fenced) return { kind: 'movement', revision: r.revision };
    if (!r.ref) return { kind: "retire", revision: r.revision };
    // A durable possibility of sending live control is enough to forbid
    // rollback to the earlier snapshot, even if send() reported failure.
    return !r.liveSent && r.transfer?.view.state === "starting"
      ? { kind: "abandon", revision: r.revision, ref: r.ref, issued: r.transfer }
      : { kind: "disconnect", revision: r.revision, ref: r.ref, closedAt: r.closedAt };
  }
  // Explicit cleanup only after the runner has observed that this exact host
  // ref is passive/absent. A pending/uncertain operation cannot be discarded.
  // confirmation is a trusted host result, never a browser message.
  async resolveClosed(identity, expected, confirmation) {
    if (!identityValid(identity) || !positive(expected)) fail();
    const proof = structuredClone(confirmation);
    return this.storage.transaction(async tx => {
      const r = await this.read(identity, tx); this.now(r);
      if (!r || r.revision !== expected || r.phase !== "closed" || r.pending) fail();
      const movement = await this.movement(identity, tx, r);
      if (movement && !movement.receipt && !movement.fenced) fail();
      if (r.ref) {
        if (!exact(proof, ["ref", "view"]) || !reference(proof.ref, r.accountId, r.ref.bodyId)
          || proof.ref.token !== r.ref.token || proof.ref.generation !== r.ref.generation
          || proof.view !== null && (!["grace", "offered"].includes(proof.view?.state) || proof.view.accountId !== r.accountId
            || proof.view.bodyId !== r.ref.bodyId || proof.view.generation !== r.ref.generation)) fail();
      } else if (proof !== null) fail();
      const ids = await this.index(tx);
      if (!ids.includes(r.accountId)) fail();
      if (movement) await tx.delete(movementKey(r.accountId));
      await tx.delete(key(r.accountId)); await tx.put(ROOM_BODY.key, ids.filter(id => id !== r.accountId));
      return true;
    });
  }
  async deliver(identity) {
    let r = await this.read(identity); const now = this.now(r);
    if (r?.phase === "live" && Object.hasOwn(r, "stopAt") && this.current(identity) === true)
      return this.send(identity, { t: "body-stop", request: r.request }) === true;
    if (!r || r.pending || r.phase === "closed" || this.current(identity) !== true
      || now >= (r.transfer?.expiresAt ?? r.preparation.expiresAt)) return false;
    let message;
    if (r.phase === "prepared") message = { t: "body-prepare", v: 2, request: r.request, accountId: r.accountId,
      bodyId: r.preparation.bodyId, kind: r.kind, world: r.preparation.world, epoch: r.preparation.epoch, expiresAt: r.preparation.expiresAt };
    else if (r.phase === "offered" || r.phase === "starting") message = { t: r.phase === "offered" ? "body-grant" : "body-active", request: r.request, transfer: r.transfer };
    else if (r.phase === "live") {
      // Persist the possibility of control BEFORE sending. If this write or
      // response is uncertain, cleanup must assume controls may have started.
      const expected = r.revision;
      r = await this.storage.transaction(async tx => {
        const current = await this.read(identity, tx), at = this.now(current);
        if (!current || current.revision !== expected || current.phase !== "live" || at >= current.transfer.expiresAt
          || this.current(identity) !== true) return null;
        if (!current.liveSent) { current.liveSent = true; current.revision++; current.at = at; await tx.put(key(current.accountId), validate(current)); }
        return current;
      });
      if (!r) return false;
      message = { t: "body-live", request: r.request, ...receipt(r.transfer) };
    }
    else return false;
    // The owner must synchronously recheck/resolve this exact connection and
    // send; no async transport or data retained in a WebSocket attachment.
    if (this.current(identity) !== true) return false;
    return this.send(identity, structuredClone(message)) === true;
  }
}
