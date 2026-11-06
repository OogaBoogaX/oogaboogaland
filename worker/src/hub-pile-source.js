// Only the private BananaPayServer v2 aggregate contract, never invoice replay.
// The pile no longer decays; `at` is its accounting time, never read freshness.
import { boundedJSON } from './virtual-host.js';
import { hubPileMaximum } from './ooga-crew.js';
// Measured worst case: 17-digit sats/revision/at and 24-character banana amounts,
// a known level, cutover done and reconciliation current. Thirteen JSON nodes.
export const HUB_PILE_BYTES = 256, HUB_PILE_NODES = 13;
const KEYS = 'at,bananas,basis,cutover,eatPerHour,reconciliation,revision,type,uncertain,v';
const CUTOVER = ['pending', 'done'], RECONCILIATION = ['off', 'behind', 'review', 'current'];
const amount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER / 1000;
const stamp = n => Number.isSafeInteger(n) && n >= 1 && n <= 8640000000000000;
const invalid = () => { throw Object.assign(Error('invalid private pile snapshot'), { code: 'invalid' }); };
// A canonical copy, in the producer's key order. A v1 (decaying) snapshot is
// refused outright: it names no revision, cutover or reconciliation.
export function validateHubPile(value) {
  try { boundedJSON(value, HUB_PILE_BYTES, HUB_PILE_NODES); }
  catch (error) { throw Object.assign(error, { code: 'invalid' }); }
  if (value?.v === 1) throw Object.assign(Error('legacy private pile snapshot refused'), { code: 'legacy' });
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join() !== KEYS
    || value.v !== 2 || value.type !== 'pile' || value.eatPerHour !== 0 || value.basis !== 'credits'
    || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !CUTOVER.includes(value.cutover) || !RECONCILIATION.includes(value.reconciliation)) invalid();
  const { bananas, at, uncertain } = value;
  if (bananas === null) {
    // Unknown is never a number: no time, review, and nothing uncertain.
    if (at !== null || value.reconciliation !== 'review' || uncertain !== null) invalid();
  } else {
    if (!amount(bananas) || !stamp(at) || value.cutover !== 'done') invalid();
    if (uncertain === null ? value.reconciliation !== 'review'
      : !uncertain || typeof uncertain !== 'object' || Object.keys(uncertain).sort().join() !== 'bananas,sats'
        || !Number.isSafeInteger(uncertain.sats) || uncertain.sats < 0 || !amount(uncertain.bananas)) invalid();
  }
  return { v: 2, type: 'pile', bananas, at, eatPerHour: 0, revision: value.revision, basis: 'credits',
    cutover: value.cutover, reconciliation: value.reconciliation,
    uncertain: uncertain && { sats: uncertain.sats, bananas: uncertain.bananas } };
}
// The rendered level of a known v2 pile at a host time at or after its accounting
// time. Unknown is refused, never zero. No decay: an old accounting time stays valid.
export function hubPileLevel(value, at) {
  if (value?.v !== 2 || !amount(value.bananas)) throw Error('unknown private pile level');
  if (!Number.isSafeInteger(at) || !stamp(value.at) || at < value.at) throw Error('future private pile snapshot');
  return Math.min(hubPileMaximum, Math.floor(value.bananas));
}
