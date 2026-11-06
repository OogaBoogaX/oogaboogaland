// A single coalesced backlog reading for the real Hub, retained in its atomic
// simulation checkpoint. This is a trusted service input, never a browser API.
import { boundedJSON } from './virtual-host.js';
const integer = value => Number.isSafeInteger(value) && value >= 0;
const fail = () => { throw Error('invalid Hub backlog input'); };
export function validateHubInput(value) {
  boundedJSON(value, 256, 8);
  if (!value || Object.keys(value).sort().join() !== 'kind,observedAt,v,vsize'
    || value.v !== 1 || value.kind !== 'backlog' || !integer(value.observedAt)
    || value.observedAt === 0 || !integer(value.vsize)) fail();
  return value;
}
export function createHubWorldInputs(hydrology) {
  if (hydrology?.authoritative !== true || typeof hydrology.apply !== 'function') fail();
  let pending = null, used = false;
  const validatePending = row => {
    if (row === null) return;
    if (!Array.isArray(row) || row.length !== 4 || Object.keys(row).length !== 4 || !row.every(integer)
      || row[0] === 0 || row[0] > row[2] || row[3] > row[2]) fail();
  };
  const checkWater = row => {
    if (row && (row[0] < hydrology.state.observedAt
      || row[0] === hydrology.state.observedAt && row[1] !== hydrology.state.vsize)) fail();
  };
  return {
    // effectiveAt uses the host's simulation clock; acceptedAt and observedAt
    // remain wall time. Paused outage intervals must not delay queued readings.
    enqueue(input, { acceptedAt, effectiveAt }) {
      const value = validateHubInput(input);
      if (!integer(acceptedAt) || !integer(effectiveAt) || effectiveAt > acceptedAt || value.observedAt > acceptedAt) fail();
      used = true;
      const at = pending ? pending[0] : hydrology.state.observedAt;
      const size = pending ? pending[1] : hydrology.state.vsize;
      if (value.observedAt < at) return 'stale';
      if (value.observedAt === at) {
        if (value.vsize !== size) fail();
        return 'retained';
      }
      // Latest standing reading wins. This policy must never be reused for
      // donation, combat or inventory events, which require individual receipts.
      pending = [value.observedAt, value.vsize, acceptedAt, effectiveAt];
      return 'accepted';
    },
    drain(simulatedAt, wallAt) {
      if (!integer(simulatedAt) || !integer(wallAt) || wallAt < simulatedAt) fail();
      used = true;
      // The durable wall cursor accounts for explicit paused-outage recovery.
      // Comparing only logical time would defer an old reading after a restart.
      if (!pending || wallAt < pending[2]) return false;
      const row = pending;
      checkWater(row);
      hydrology.apply({ backlogAt: row[0], vsize: row[1] });
      pending = null;
      return true;
    },
    capture() {
      validatePending(pending); checkWater(pending);
      return { v: 1, pending: pending && [...pending] };
    },
    restore(saved) {
      if (used || !saved || Object.keys(saved).sort().join() !== 'pending,v' || saved.v !== 1) fail();
      validatePending(saved.pending); checkWater(saved.pending);
      pending = saved.pending && [...saved.pending]; used = true;
    },
  };
}
