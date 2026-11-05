// Explicit preview cadences. Rolling mode permits four per rolling second;
// burst mode earns four/second with at most two credits. Both retain bounded
// debt, enforce a 125 ms gap and are inactive unless explicitly selected.
export const ROLLING_CADENCE = "rolling-4-v1";
export const BURST_CADENCE = "rate-4-burst-2-v1";
export const cadenceName = c => c?.v === 1 ? ROLLING_CADENCE : c?.v === 2 ? BURST_CADENCE : undefined;
export const emptyCadence = (name = ROLLING_CADENCE) => name === BURST_CADENCE
  ? { v: 2, count: 0, at: 0, theoreticalAt: 0 } : { v: 1, count: 0, times: [] };
const time = n => Number.isSafeInteger(n) && n >= 0;
export function validateCadence(c) {
  if (c?.v === 2) {
    if (Object.keys(c).sort().join(',') !== 'at,count,theoreticalAt,v' || !Number.isSafeInteger(c.count) || c.count < 0
      || !time(c.at) || !time(c.theoreticalAt)
      || (c.count === 0 ? c.at !== 0 || c.theoreticalAt !== 0
        : c.theoreticalAt - c.at < 250 || c.theoreticalAt - c.at > 500)) throw Error('invalid publication cadence');
    return c;
  }
  if (!c || Object.keys(c).sort().join(',') !== 'count,times,v' || c.v !== 1
    || !Number.isSafeInteger(c.count) || c.count < 0
    || !Array.isArray(c.times) || c.times.length !== Math.min(c.count, 4)
    || Object.keys(c.times).length !== c.times.length
    || c.times.some((t, i) => !time(t) || i && t - c.times[i - 1] < 125)) throw Error('invalid publication cadence');
  return c;
}
export function nextCadenceAt(c) {
  validateCadence(c);
  if (c.v === 2) return c.count ? Math.max(c.at + 125, c.theoreticalAt - 250) : 0;
  return c.times.length ? Math.max(c.times.at(-1) + 125, c.times.length === 4 ? c.times[0] + 1000 : 0) : 0;
}
export function advanceCadence(c, now) {
  if (!time(now) || now < nextCadenceAt(c) || c.count >= Number.MAX_SAFE_INTEGER) throw Error('publication cadence exceeded');
  // A 250 ms virtual service time, with one interval of bounded burst credit.
  // Late commits consume that credit instead of moving every future slot.
  if (c.v === 2) {
    const next = { v: 2, count: c.count + 1, at: now, theoreticalAt: Math.max(c.theoreticalAt, now) + 250 };
    return validateCadence(next);
  }
  return { v: 1, count: c.count + 1, times: [...c.times.slice(-3), now] };
}
