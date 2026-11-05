// One explicit, bounded Room/host handoff operation. No timer or automatic run.
// Retry the exact durable command through the atomic receipt API only. A closed
// command recovers its result or records cancellation; it cannot create a body.
import { sameCheckpointValue } from "./virtual-host.js";

// Explicit trusted admission event. Retained Room work wins over a fresh nonce;
// lost replies are reconciled by reading the outbox, never by blind re-admission.
export async function stageWorldBody(host, room, hostTicket, roomTicket, identity, kind = 'ooga') {
  const owner = { ...hostTicket }, authority = { ...roomTicket }, who = { ...identity };
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error('body admission authorities differ');
  const inspect = () => room.bodyCandidate(authority, who, kind);
  const before = await inspect();
  if (before.status === 'blocked') return { status: 'blocked' };
  if (before.status === 'retained') return { status: 'retained', ...await room.deliverBodyHandoff(authority, who) };
  if (before.status !== 'available' || before.candidate?.accountId !== who.accountId) throw Error('invalid body admission candidate');
  const prepared = await host.prepareWorldBody(owner, before.candidate);
  const request = crypto.randomUUID().replaceAll('-', '');
  try {
    await room.stageBodyHandoff(authority, who, prepared.preparation, prepared.kind, request, prepared.claim);
    return { status: 'staged', request };
  } catch (error) {
    // A concurrent event for this same connection may already own the outbox.
    // Never clear or replace it; the current Room authority checks it again.
    const after = await inspect();
    if (after.status !== 'retained') throw error;
    return { status: 'reconciled', ...await room.deliverBodyHandoff(authority, who) };
  }
}

// One bounded coordinator pass, explicitly invoked by a trusted serialized
// runner. No admission, timer, lease renewal or rate-policy change. Durable
// Room records remain the queue, so an interrupted pass needs no local replay.
export async function drainBodyEvents(host, room, hostTicket, roomTicket, { limit = 4, after = 0 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4
    || !Number.isSafeInteger(after) || after < 0) throw Error("invalid body event budget");
  const owner = { ...hostTicket }, authority = { ...roomTicket };
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error("body event authorities differ");
  await host.bodyLifecycleRevision(owner);
  const work = await room.bodyWork(authority), order = { close: 0, handoff: 1, movement: 2 };
  if (!work || !Array.isArray(work.events) || work.events.length > 32 || !Array.isArray(work.tokens)
    || work.tokens.length > 32 || new Set(work.tokens).size !== work.tokens.length
    || work.tokens.some(t => typeof t !== "string" || !/^[0-9a-f]{32}$/.test(t))
    || work.nextDeadline !== null && (!Number.isSafeInteger(work.nextDeadline) || work.nextDeadline < 0)
    || work.publicationPending !== null && (!Number.isSafeInteger(work.publicationPending) || work.publicationPending < 1))
    throw Error("invalid body event inventory");
  const seen = new Set();
  for (const event of work.events) {
    const i = event?.identity;
    if (!Object.hasOwn(order, event?.kind) || !Number.isSafeInteger(i?.accountId) || i.accountId < 1
      || typeof i.connection !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(i.connection) || seen.has(i.accountId))
      throw Error("invalid body event identity");
    seen.add(i.accountId);
  }
  const events = work.events.slice().sort((a, b) => order[a.kind] - order[b.kind]
    || Number(a.identity.accountId <= after) - Number(b.identity.accountId <= after)
    || a.identity.accountId - b.identity.accountId);
  const results = [];
  // Mark BEFORE a host mutation. Cleanup can retire its last outbox row before
  // a crash; the marker is then the durable evidence that publication is owed.
  const publication = events.length ? await room.beginBodyEventBatch(authority) : work.publicationPending;
  if (publication !== null && (!Number.isSafeInteger(publication) || publication < 1)) throw Error("invalid body event publication");
  for (const event of events.slice(0, limit)) {
    // A preceding offer may have created a ref. Protect the freshly retained
    // refs before another operation can infer any unrelated absence.
    const tokens = results.length ? (await room.bodyCensus(authority)).tokens : work.tokens;
    if (!Array.isArray(tokens) || tokens.length > 32 || new Set(tokens).size !== tokens.length
      || tokens.some(t => typeof t !== "string" || !/^[0-9a-f]{32}$/.test(t))) throw Error("invalid body event census");
    const operation = event.kind === "close" ? closeBodyHandoff
      : event.kind === "handoff" ? advanceBodyHandoff : advanceBodyMovement;
    const result = await operation(host, room, owner, authority, event.identity, tokens);
    results.push({ kind: event.kind, identity: { ...event.identity }, result });
    if (result.status === "blocked") break;
  }
  // Publication follows host commits. A failed/uncertain publication remains
  // recoverable through the existing retained frame/departure receipt protocol.
  const presence = publication !== null ? await retainHostBodyPresence(host, room, owner, authority) : null;
  const published = presence?.retained === true && await room.completeBodyEventBatch(authority, publication);
  // Activation can replace a ten-second preparation with a one-second ACK
  // deadline. Return the committed deadline, never the pre-operation estimate.
  const next = results.length ? await room.bodyWork(authority) : work;
  return { results, after: results.at(-1)?.identity.accountId ?? after,
    blocked: results.at(-1)?.result.status === "blocked",
    remaining: next.events.length, nextDeadline: next.nextDeadline, presence,
    publicationPending: publication !== null && !published };
}

// One finite server publication. Host and Room commits are independent: retain
// the exact complete public frame in Room before acknowledging host departures.
// A lost Room reply is read/reconciled, never assumed successful or replayed as
// a fresh admission. Explicit preview socket delivery remains credit-bounded.
export async function retainHostBodyPresence(host, room, hostTicket, roomTicket) {
  const owner = { ...hostTicket }, authority = { ...roomTicket };
  if (owner.world !== authority.world || owner.fence < authority.epoch
    || owner.fence === authority.epoch && owner.owner !== authority.owner) throw Error("body presentation authorities differ");
  const { frame } = await host.bodyPresence(owner);
  if (await host.bodyLifecycleRevision(owner) !== frame.revision) return { status: "superseded", retained: false };
  const expected = { world: frame.world, epoch: frame.epoch, revision: frame.revision, ids: frame.departures.map(p => p.id) };
  let retained;
  try { retained = await room.retainBodyPresence(authority, owner, frame); }
  catch (error) {
    const after = await room.bodyPresenceStatus(authority);
    if (!after || !sameCheckpointValue(after.frame, frame)) throw error;
    retained = { duplicate: true, receipt: expected };
  }
  if (!sameCheckpointValue(retained?.receipt, expected)) throw Error("body presentation receipt mismatch");
  // Socket receipts only release per-viewer credit. Host departure removal is
  // justified by durable Room retention, never by an untrusted client ACK.
  await room.deliverBodyPresence(authority);
  if (!expected.ids.length) return { status: "retained", retained: true, duplicate: retained.duplicate };
  const acknowledged = await host.acknowledgeBodyDepartures(owner, retained.receipt);
  return { status: acknowledged.changed ? "acknowledged" : "superseded", retained: true, duplicate: retained.duplicate };
}

export async function reconcileRoomBodies(host, room, hostTicket, roomTicket) {
  const owner = { ...hostTicket }, authority = { ...roomTicket };
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error("body census authorities differ");
  // Read first, so a concurrent admission or live acknowledgement cannot be
  // mistaken for an absent session by the subsequently observed Room census.
  const revision = await host.bodyLifecycleRevision(owner);
  const census = await room.bodyCensus(authority);
  if (!census.ready) return { status: "blocked", closed: census.closed, pending: census.pending, unobserved: census.unobserved };
  const result = await host.reconcileBodies(owner, census.tokens, [], { expectedRevision: revision });
  return { status: result.superseded ? "superseded" : "reconciled", ...result };
}

// One explicit world step after Room's pending body work has been drained.
// No timer, automatic retry or publication: the bounded publication runner is
// independent, and a busy census asks the caller to finish its durable outbox.
export async function tickRoomWorld(host, room, hostTicket, roomTicket) {
  const owner = { ...hostTicket }, authority = { ...roomTicket };
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error('world census authorities differ');
  const revision = await host.bodyLifecycleRevision(owner);
  const census = await room.bodyCensus(authority);
  if (!census || typeof census.ready !== 'boolean' || !Array.isArray(census.tokens) || census.tokens.length > 32
    || new Set(census.tokens).size !== census.tokens.length
    || census.tokens.some(token => typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token))
    || !['closed', 'pending', 'unobserved'].every(key => Array.isArray(census[key]) && census[key].length <= 32)
    || census.ready && (census.closed.length || census.pending.length || census.unobserved.length))
    throw Error('invalid world census');
  if (!census.ready) return { status: 'blocked', closed: census.closed, pending: census.pending, unobserved: census.unobserved };
  const result = await host.tick(owner, census.tokens, { expectedRevision: revision });
  return { status: result.superseded ? 'superseded' : 'advanced', result };
}

export async function advanceBodyHandoff(host, room, hostTicket, roomTicket, identity, liveTokens) {
  const owner = { ...hostTicket }, authority = { ...roomTicket }, who = { ...identity }, tokens = [...liveTokens];
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error("body handoff authorities differ");
  const pending = await room.pendingBodyHandoff(authority, who);
  if (!pending) return { status: "idle", ...await room.deliverBodyHandoff(authority, who) };
  const command = pending.command;
  if (!command || command.accountId !== who.accountId || command.connection !== who.connection)
    throw Error("body handoff connection mismatch");
  const answer = await host.bodyOperation(owner, tokens, command, { recoverOnly: pending.closed });
  const result = await room.completeBodyHandoff(authority, who, command.revision, answer);
  return { status: "completed", phase: result.phase, delivered: result.delivered };
}

// One retained movement, never an unbounded queue or blind new command. The
// original Room observation time survives processing/retry after socket close.
export async function advanceBodyMovement(host, room, hostTicket, roomTicket, identity, liveTokens) {
  const owner = { ...hostTicket }, authority = { ...roomTicket }, who = { ...identity }, tokens = [...liveTokens];
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error('body movement authorities differ');
  const pending = await room.pendingBodyMovement(authority, who);
  if (!pending) return { status: 'idle' };
  if (pending.ref?.accountId !== who.accountId) throw Error('body movement account mismatch');
  if (pending.closed) {
    if (!Number.isSafeInteger(pending.closedAt) || pending.closedAt < pending.observedAt)
      throw Error('body movement close time mismatch');
    let view = await host.bodyReferenceState(owner, who.accountId, pending.ref);
    if (view?.state === 'live') {
      // Fence first. A concurrent update either committed before this close and
      // its body is retained, or fails against the passive generation. Never
      // replay an uncommitted/invalid sample after the socket has gone away.
      await host.disconnect(owner, tokens, pending.ref, pending.closedAt);
      view = await host.bodyReferenceState(owner, who.accountId, pending.ref);
    }
    if (view !== null && !['grace', 'offered'].includes(view.state)) return { status: 'blocked' };
    await room.fenceBodyMovement(authority, who, pending.sample.sequence, { ref: pending.ref, view });
    return { status: 'fenced' };
  }
  if (typeof host.updateObservedBody !== 'function') throw Error('observed movement host protocol required');
  const answer = await host.updateObservedBody(owner, tokens, who.accountId, pending.ref, pending.sample, pending.observedAt);
  const result = await room.completeBodyMovement(authority, who, pending.sample.sequence, answer);
  return { status: 'completed', delivered: result.delivered };
}

// One explicit close reconciliation, before ordinary host recovery/ticking.
// Host receipt retirement is separate: Room must retain the result first, and
// the original request window must expire before a journal slot can be reused.
export async function closeBodyHandoff(host, room, hostTicket, roomTicket, identity, liveTokens) {
  const owner = { ...hostTicket }, authority = { ...roomTicket }, who = { ...identity }, tokens = [...liveTokens];
  if (owner.world !== authority.world || owner.fence !== authority.epoch || owner.owner !== authority.owner)
    throw Error("body handoff authorities differ");
  let close = await room.closedBodyHandoff(authority, who);
  if (close?.kind === "reconcile") {
    await advanceBodyHandoff(host, room, owner, authority, who, tokens);
    close = await room.closedBodyHandoff(authority, who);
  }
  let movementFenced = false;
  if (close?.kind === 'movement') {
    const movement = await advanceBodyMovement(host, room, owner, authority, who, tokens);
    if (movement.status === 'blocked') return movement;
    movementFenced = movement.status === 'fenced';
    close = await room.closedBodyHandoff(authority, who);
  }
  if (!close) return { status: "idle" };
  if (close.kind === "retire") {
    await room.resolveBodyHandoff(authority, who, close.revision, null); return { status: "resolved" };
  }
  if (close.kind === "abandon") {
    const abandoned = await host.abandonBody(owner, tokens, who.accountId, close.ref, close.issued);
    if (!abandoned.result.ok) return { status: "blocked" };
  } else if (close.kind === "disconnect") {
    if (!movementFenced) await host.disconnect(owner, tokens, close.ref, close.closedAt);
  }
  else throw Error("unresolved body close operation");
  const view = await host.bodyReferenceState(owner, who.accountId, close.ref);
  if (view && !["grace", "offered"].includes(view.state)) return { status: "blocked" };
  await room.resolveBodyHandoff(authority, who, close.revision, { ref: close.ref, view });
  return { status: "resolved" };
}

// Reconcile exactly one closed handoff after a Room lease/run has expired.
// Recover/cancel uncertain operations before touching its body. This finite path
// cannot create a body, replay movement, infer unrelated live disconnects or
// renew NPC ownership. No-live-send rollback preserves the original deadline.
export async function retireRecoveredBodyHandoff(host, room, hostTicket, roomTicket, identity) {
  const owner = { ...hostTicket }, authority = { ...roomTicket }, who = { ...identity };
  if (owner.world !== authority.world || !Number.isSafeInteger(owner.fence)
    || !Number.isSafeInteger(authority.epoch) || authority.epoch < 1 || owner.fence < authority.epoch
    || owner.fence === authority.epoch && owner.owner !== authority.owner)
    throw Error("body cleanup authorities differ");
  await host.bodyLifecycleRevision(owner); // Current host fence, including idle retirement.
  let work = await room.closedBodyRecovery(authority, who);
  if (!work) return { status: "idle" };
  if (work.pending) {
    const command = work.pending.command;
    if (!work.pending.closed || command?.accountId !== who.accountId || command.connection !== who.connection)
      throw Error("closed body recovery mismatch");
    const answer = await host.bodyOperation(owner, [], command, { recoverOnly: true });
    await room.completeClosedBodyRecovery(authority, who, command.revision, answer);
    work = await room.closedBodyRecovery(authority, who);
  }
  if (!work) return { status: "idle" };
  if (work.close.kind === "reconcile") return { status: "blocked" };
  if (work.close.kind === "movement") {
    const m = work.movement;
    if (!m?.closed || m.ref?.accountId !== who.accountId) throw Error("closed movement recovery mismatch");
    let view = await host.bodyReferenceState(owner, who.accountId, m.ref);
    if (view?.state === "live") {
      await host.closeRetainedBody(owner, m.ref, m.closedAt);
      view = await host.bodyReferenceState(owner, who.accountId, m.ref);
    }
    if (view !== null && !["grace", "offered"].includes(view.state)) return { status: "blocked" };
    await room.fenceClosedBodyMovement(authority, who, m.sample.sequence, { ref: m.ref, view });
    work = await room.closedBodyRecovery(authority, who);
  }
  const close = work?.close;
  if (!close) return { status: "idle" };
  let proof = null;
  if (close.kind !== "retire") {
    if (!["abandon", "disconnect"].includes(close.kind)) return { status: "blocked" };
    let view = await host.bodyReferenceState(owner, who.accountId, close.ref);
    if (view && !["grace", "offered"].includes(view.state)) {
      if (close.kind === "abandon") {
        await host.abandonBody(owner, [], who.accountId, close.ref, close.issued);
        // Recovery may expire the old hold while processing abandonment. The
        // fresh exact-ref proof below decides, never an old operation result.
      } else await host.closeRetainedBody(owner, close.ref, close.closedAt);
      view = await host.bodyReferenceState(owner, who.accountId, close.ref);
    }
    if (view !== null && !["grace", "offered"].includes(view.state)) return { status: "blocked" };
    proof = { ref: close.ref, view };
  }
  await room.resolveClosedBodyRecovery(authority, who, close.revision, proof);
  return { status: "resolved" };
}
