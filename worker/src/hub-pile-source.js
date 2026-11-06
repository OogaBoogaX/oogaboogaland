// Only the private BananaPayServer aggregate contract, never invoice replay.
import { boundedJSON } from './virtual-host.js';
import { hubPileMaximum } from './ooga-crew.js';
export function validateHubPile(value) {
  boundedJSON(value, 256, 8);
  if (!value || Object.keys(value).sort().join() !== 'at,bananas,eatPerHour,type,v'
    || value.v !== 1 || value.type !== 'pile'
    || !Number.isFinite(value.bananas) || value.bananas < 0 || value.bananas > Number.MAX_SAFE_INTEGER / 1000
    || !Number.isSafeInteger(value.at) || value.at < 1 || value.at > 8640000000000000
    || !Number.isSafeInteger(value.eatPerHour) || value.eatPerHour < 0)
    throw Error('invalid private pile snapshot');
  return value;
}
export function hubPileLevel(value, at) {
  if (!Number.isSafeInteger(at) || at < value.at) throw Error('future private pile snapshot');
  return Math.min(hubPileMaximum, Math.max(0,
    Math.floor(value.bananas - value.eatPerHour * (at - value.at) / 3600000)));
}
