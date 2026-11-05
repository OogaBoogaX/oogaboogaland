// Event dispatcher for an already acquired, finite host/Room pair. The real
// world factory and deployment binding must be supplied separately. No fixture,
// timer, alarm, automatic begin/takeover or renewal is installed here.
import { HOST } from './virtual-host.js';
import { LatestHostPublication } from './host-publication.js';
import { publishHostPoses } from './host-room.js';
import { stageWorldBody, drainBodyEvents, reconcileRoomBodies, tickRoomWorld, retainHostBodyPresence } from './host-body-room.js';
const time = value => Number.isSafeInteger(value) && value >= 0;
const fail = message => { throw Error(message); };

export async function openHostWorldRunner({ host, room, ticket, format, clock = Date.now, waitUntil }) {
  if (typeof waitUntil !== 'function' || typeof clock !== 'function'
    || format !== undefined && format !== 'mixed-1') fail('explicit world runner adapters required');
  const owner = { ...ticket }, now = clock();
  const snapshot = await host.worldRunState(owner);
  if (!snapshot || snapshot.publicationProtocol !== 1 || snapshot.status !== 'running' || snapshot.canPublish !== true
    || snapshot.world !== owner.world || snapshot.epoch !== owner.fence || snapshot.owner !== owner.owner
    || !time(now) || !time(snapshot.runUntil) || snapshot.runUntil <= now
    || snapshot.runUntil - now > HOST.maxRunMs) fail('acquired finite world required');
  const status = await room.npcAuthorityStatus(), authority = status?.authority;
  if (!authority || authority.mode !== 'server' || authority.world !== owner.world
    || authority.epoch !== owner.fence || authority.v !== (format ? 2 : 1) || authority.format !== format)
    fail('world runner Room mapping mismatch');
  const roomTicket = { ...authority, owner: owner.owner };
  const checked = await room.npcAuthorityStatus(roomTicket);
  if (!checked?.owns || checked.runUntil !== snapshot.runUntil || checked.cadence !== undefined)
    fail('world runner requires the current strict Room authority');
  if (await host.bodyLifecycleRevision(owner) !== snapshot.revision) fail('world runner startup superseded');
  const until = snapshot.runUntil;
  let lastNow = now, active = null, closed = false, ready = false, presented = false, after = 0, bodyAt = null;
  let roomState = { authority: { ...authority }, owner: owner.owner, runUntil: until, cadence: null };
  const publication = new LatestHostPublication({ until, clock,
    publish: async ({ notBefore }) => {
      const result = await publishHostPoses(host, room, owner, { format, roomState, notBefore, waitUntil, clock });
      if (result.roomState) roomState = result.roomState;
      return result;
    } });
  const close = () => { closed = true; ready = false; publication.close(); };
  const at = () => {
    const value = clock();
    if (!time(value) || value < lastNow) { close(); fail('world runner clock moved backwards'); }
    lastNow = value; if (value >= until) close(); return value;
  };
  // Never queue player identities, controls or closures in process memory.
  // Busy means NOT accepted; Room's durable records/current socket are retried
  // on another explicit event. Uncertain errors close this dispatcher.
  const dispatch = operation => {
    at();
    if (closed) return Promise.resolve({ status: 'closed' });
    if (active) return Promise.resolve({ status: 'busy' });
    active = Promise.resolve().then(() => {
      at(); return closed ? { status: 'closed' } : operation();
    }).catch(error => { close(); throw error; }).finally(() => { active = null; });
    return active;
  };
  const bodyDue = now => !ready || bodyAt !== null && now >= bodyAt;
  return {
    admit(identity, kind = 'ooga') {
      const who = { ...identity };
      return dispatch(async () => {
        ready = false;
        return stageWorldBody(host, room, owner, roomTicket, who, kind);
      });
    },
    bodies({ refresh = true } = {}) {
      if (typeof refresh !== 'boolean') fail('invalid body presentation refresh');
      return dispatch(async () => {
        ready = false;
        const drained = await drainBodyEvents(host, room, owner, roomTicket, { limit: 4, after });
        after = drained.after;
        if (drained.blocked || drained.remaining || drained.publicationPending)
          return { status: 'pending', work: drained };
        const recovered = await reconcileRoomBodies(host, room, owner, roomTicket);
        if (recovered.status !== 'reconciled') return recovered;
        // This is an event-only reconciliation, including first attachment or
        // restart. Re-read committed presentation even if the preceding host
        // mutation's reply was lost. It never starts a frozen-body update loop.
        // Recovery rescans must inspect the current census, but an unchanged
        // frozen world must not generate recurring presentation writes/traffic.
        // First attachment and actual work still reconcile an uncertain reply.
        const presence = refresh || !presented || recovered.changed || drained.results.length || drained.presence
          ? await retainHostBodyPresence(host, room, owner, roomTicket)
          : { status: 'unchanged', retained: true };
        if (!presence.retained) return { status: 'superseded' };
        presented = true;
        const deadlines = [drained.nextDeadline, recovered.wakeAt].filter(value => value !== null);
        if (deadlines.some(value => !time(value))) fail('invalid world body deadline');
        bodyAt = deadlines.length ? Math.min(...deadlines) : null;
        ready = !closed;
        publication.offer(await host.bodyLifecycleRevision(owner));
        return { status: 'reconciled', nextBodyAt: bodyAt, work: drained, presence };
      });
    },
    tick() {
      return dispatch(async () => {
        if (bodyDue(at())) return { status: 'body-events-required', nextBodyAt: bodyAt };
        const tick = await tickRoomWorld(host, room, owner, roomTicket);
        if (tick.status !== 'advanced') { ready = false; return tick; }
        const result = tick.result;
        if (result.recovery?.effects?.length || result.effects?.length) ready = false;
        if (result.snapshot) publication.offer(result.snapshot.sequence);
        if (result.status !== 'running') close();
        return { ...tick, bodyEventsRequired: !ready };
      });
    },
    publish() {
      at();
      if (closed) return Promise.resolve({ status: 'closed' });
      if (bodyDue(lastNow)) return Promise.resolve({ status: 'body-events-required', nextBodyAt: bodyAt });
      // One separate publication flight permits production to continue while a
      // frame waits. LatestHostPublication coalesces signals; final confirmation
      // refuses a frame superseded by a concurrent commit or ownership change.
      return publication.flush().catch(error => { close(); throw error; });
    },
    state() {
      at(); return { closed, busy: !!active, ready, until, nextBodyAt: bodyAt, publication: publication.state() };
    },
    // Local shutdown only. Durable close/grace and coordinated release remain
    // separate explicit events; stopping a runner must not abandon player state.
    close,
  };
}
