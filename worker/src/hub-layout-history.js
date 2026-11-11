// Constant-size construction recipe and irreversible pile clearance history.
// The authored seed/algorithms are identified by the enclosing world version.
import { boundedJSON, sameCheckpointValue, HOST } from './virtual-host.js';
import { hubPileMaximum } from './ooga-crew.js';
export function validateHubLayout(value) {
  boundedJSON(value, 256, 8);
  if (!value || Object.keys(value).sort().join() !== 'count,level,ring,v' || value.v !== 1
    || !Number.isFinite(value.level) || value.level < 0 || value.level > hubPileMaximum
    || !Number.isInteger(value.count) || value.count < 0 || value.count > HOST.maxOogas
    || !Number.isFinite(value.ring) || value.ring < 0 || value.ring > 30)
    throw Error('invalid Hub layout history');
  return value;
}
export function assertHubLayout(actual, expected) {
  validateHubLayout(actual); validateHubLayout(expected);
  if (!sameCheckpointValue(actual, expected)) throw Error('Hub layout history mismatch');
  return true;
}
