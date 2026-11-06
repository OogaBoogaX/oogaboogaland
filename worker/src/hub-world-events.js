// Trusted absolute state from one versioned service source. Donations/inventory
// are reflected in totals, never replayed as increments on retry. No polling.
import { boundedJSON, sameCheckpointValue as same } from './virtual-host.js';
const fail = () => { throw Error('invalid authoritative Hub event'); };
const stamp = n => Number.isSafeInteger(n) && n >= 0;
export function createHubWorldEvents({ state, roster, changed, source }) {
  if (typeof state?.validateUpdate !== 'function' || typeof roster?.validateCheckpoint !== 'function'
    || typeof changed !== 'function') fail();
  if (!source || Object.keys(source).sort().join() !== 'observedAt,revision'
    || !stamp(source.revision) || source.revision < 1 || !stamp(source.observedAt) || source.observedAt < 1) fail();
  let pending = null, revision = source.revision, observedAt = source.observedAt, used = false;
  const update = () => {
    const { level, tint, inventory, assignments, pile } = state.capture();
    return { level, tint, inventory, assignments, pile };
  };
  const validate = value => {
    boundedJSON(value, 32 * 1024, 4096);
    if (!value || Object.keys(value).sort().join() !== 'activity,kind,observedAt,revision,state,v'
      || value.v !== 1 || value.kind !== 'hub-state' || !stamp(value.revision) || value.revision < 1
      || !stamp(value.observedAt) || value.observedAt < 1) fail();
    state.validateUpdate(value.state, value.observedAt); roster.validateCheckpoint(value.activity);
    if (value.state.pile && value.state.pile.at > value.observedAt) fail();
    // The trusted source still cannot advance contributor activity into its
    // future. Per-repository stamps are bounded by each row's last commit.
    if (value.activity.rows.some(row => row[1] > value.observedAt || row[2] > value.observedAt)) fail();
    return value;
  };
  const equalPayload = (a, b) => {
    const fields = ['level', 'tint', 'inventory', 'assignments', 'pile'];
    return fields.every(k => same(a.state[k], b.state[k])) && same(a.activity, b.activity);
  };
  const validPending = p => {
    if (p === null) return;
    if (!p || Object.keys(p).sort().join() !== 'acceptedAt,effectiveAt,input'
      || !stamp(p.acceptedAt) || !stamp(p.effectiveAt) || p.effectiveAt > p.acceptedAt) fail();
    validate(p.input);
    if (p.input.observedAt > p.acceptedAt || p.input.revision <= revision || p.input.observedAt < observedAt) fail();
  };
  return {
    // The latest validated source observation, queued or accepted. It only
    // grows: a queued input never observes earlier than the accepted one.
    sourceAt: () => pending ? pending.input.observedAt : observedAt,
    // The pile the queue will leave applied: the queued input's, else the current.
    queuedPile: () => pending ? structuredClone(pending.input.state.pile ?? null) : null,
    queued: () => pending !== null,
    // Whether this queue now holds the world's source state (restored or changed).
    used: () => used,
    enqueue(input, timing) {
      used = true;
      validate(input);
      if (!timing || !stamp(timing.acceptedAt) || !stamp(timing.effectiveAt)
        || timing.effectiveAt > timing.acceptedAt || input.observedAt > timing.acceptedAt) fail();
      const prior = pending?.input || { revision, observedAt, state: update(), activity: roster.capture() };
      if (input.revision < prior.revision) return 'stale';
      if (input.revision === prior.revision) {
        if (input.observedAt !== prior.observedAt || !equalPayload(input, prior)) fail();
        return 'retained';
      }
      if (input.observedAt < prior.observedAt) fail();
      pending = { acceptedAt: timing.acceptedAt, effectiveAt: timing.effectiveAt, input: structuredClone(input) };
      return 'accepted';
    },
    drain(simulatedAt, wallAt) {
      used = true;
      if (!pending || wallAt < pending.acceptedAt) return false;
      validPending(pending);
      const value = pending.input;
      state.applyUpdate(value.state); roster.restore(value.activity);
      changed(); revision = value.revision; observedAt = value.observedAt; pending = null;
      return true;
    },
    capture() {
      validPending(pending);
      return { v: 3, revision, observedAt, pending: structuredClone(pending) };
    },
    restore(saved) {
      if (used || !saved || Object.keys(saved).sort().join() !== 'observedAt,pending,revision,v'
        || saved.v !== 3 || !stamp(saved.revision) || !stamp(saved.observedAt)
        || saved.revision < source.revision || saved.observedAt < source.observedAt) fail();
      revision = saved.revision; observedAt = saved.observedAt; validPending(saved.pending);
      pending = structuredClone(saved.pending); used = true;
    },
  };
}
