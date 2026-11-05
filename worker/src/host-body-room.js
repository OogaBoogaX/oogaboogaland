// One explicit, bounded Room/host handoff operation. No timer or automatic run.
// Retry the exact durable command through the atomic receipt API only. A closed
// command recovers its result or records cancellation; it cannot create a body.
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
