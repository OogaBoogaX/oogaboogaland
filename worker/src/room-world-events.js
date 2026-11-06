// Private same-application routing only. One stable object name across world
// versions; a new version must migrate the retained world, never create a second
// island owner. These hints carry no player-controlled pose, identity or command.
export const HUB_WORLD_OBJECT = 'island';
export function validateRoomWorldHint(value) {
  if (!value || Object.keys(value).sort().join() !== 'epoch,owner,revision,room,runUntil,v,world'
    || value.v !== 1 || value.room !== HUB_WORLD_OBJECT
    || !['world', 'owner'].every(key => typeof value[key] === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(value[key]))
    || !['epoch', 'revision', 'runUntil'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0))
    throw Error('invalid Room world event hint');
  return value;
}

// Wake hints are expendable: current sockets and durable handoff/movement rows
// remain the source of work. Restart/periodic finite-run recovery must rescan
// those records. At most one request and one coalesced flag are held in memory.
export function createRoomWorldNotifier({ current, send, hold = () => {}, clock = Date.now,
  schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null, active = false, dirty = false, budget = 0, nextAt = 0, lastAt = 0, failures = 0, error = null, disposed = false;
  const queue = () => {
    if (disposed || active || timer !== null || !dirty || !budget || failures >= 3) return;
    const now = clock();
    if (!Number.isSafeInteger(now) || now < lastAt) { disposed = true; error = 'world event clock moved backwards'; return; }
    timer = schedule(() => { timer = null; hold(flush()); }, Math.max(0, nextAt - now));
  };
  const flush = async () => {
    if (disposed || active || !dirty || !budget) return;
    const now = clock();
    if (!Number.isSafeInteger(now) || now < lastAt || now < nextAt) { error = 'world event pacing violation'; disposed = true; return; }
    lastAt = now;
    const value = current();
    if (!value) { dirty = false; return; }
    let hint;
    try {
      hint = structuredClone(validateRoomWorldHint(value));
      if (now >= hint.runUntil || hint.runUntil - now > 900000) { dirty = false; return; }
    } catch (caught) { error = caught.message; disposed = true; return; }
    dirty = false; active = true; budget--; nextAt = now + 250;
    try {
      const result = await send(hint);
      if (!result || typeof result.more !== 'boolean' || !['handled', 'busy', 'stale'].includes(result.status))
        throw Error('invalid world event receipt');
      if (result.status === 'stale') dirty = false;
      else dirty ||= result.more || result.status === 'busy';
      failures = 0; error = null;
    } catch (caught) {
      failures++; error = caught.message; dirty = true;
      // No automatic retry of an uncertain external outcome. A later actual
      // event may try again; three failures quiesce this notifier until restart.
      budget = 0;
    } finally { active = false; queue(); }
  };
  return {
    notify() {
      if (disposed || failures >= 3) return false;
      dirty = true; budget = 2; queue(); return true;
    },
    state: () => ({ active, pending: dirty, scheduled: timer !== null, failures, error, disposed }),
    dispose() { disposed = true; dirty = false; budget = 0; if (timer !== null) cancel(timer); timer = null; },
  };
}

// Receiver used by the future fixed-world DO binding after it has attached its
// finite runner. Validate against that receiver's own retained tickets, never
// acquire authority from the notification. Caller serializes receiver wakes.
export async function dispatchRoomWorldHint(runner, room, hostTicket, roomTicket, input) {
  const hint = structuredClone(validateRoomWorldHint(input));
  if (hint.world !== hostTicket.world || hint.epoch !== hostTicket.fence || hint.owner !== hostTicket.owner
    || roomTicket.world !== hint.world || roomTicket.epoch !== hint.epoch || roomTicket.owner !== hint.owner
    || roomTicket.revision !== hint.revision || runner.state().until !== hint.runUntil)
    return { status: 'stale', more: false };
  const bodies = await runner.bodies({ refresh: false });
  if (bodies.status === 'closed') return { status: 'stale', more: false };
  if (bodies.status !== 'reconciled') return { status: 'busy', more: true };
  const candidates = await room.bodyAdmissionCandidates(roomTicket);
  if (!candidates || !Array.isArray(candidates.identities) || candidates.identities.length > 4
    || typeof candidates.more !== 'boolean'
    || new Set(candidates.identities.map(identity => identity?.accountId)).size !== candidates.identities.length
    || candidates.identities.some(identity => !identity || Object.keys(identity).sort().join() !== 'accountId,connection'
      || !Number.isSafeInteger(identity.accountId) || identity.accountId < 1
      || typeof identity.connection !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(identity.connection)))
    throw Error('invalid body admission inventory');
  for (const identity of candidates.identities) {
    const result = await runner.admit(identity, 'ooga');
    if (result.status === 'busy') return { status: 'busy', more: true };
    if (result.status === 'closed') return { status: 'stale', more: false };
    if (result.status === 'blocked') return { status: 'busy', more: true };
    if (!['staged', 'retained', 'reconciled'].includes(result.status)) throw Error('invalid world admission result');
  }
  return { status: 'handled', more: candidates.more };
}
