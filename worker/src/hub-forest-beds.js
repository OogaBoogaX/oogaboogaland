import { HOST } from './virtual-host.js';
// Reuse the deterministic forest search, never its mutable beds or world.
// The layout module is fixed for this isolate. The clearance proof from the
// original search is replayed against each new private world's solids;
// any changed answer reruns the source search and replaces the one-entry cache.
import { createHubOutdoorBeds, hubPoolLayout } from './ooga-crew.js';

const MAX_QUERIES = 16384;
let cached = null;
const bed = row => ({ x: row[0], y: row[1], z: row[2], outdoor: true,
  sleeper: null, node: { rotation: { y: row[3] } } });

export function createHubForestBeds(pool, clear, count) {
  const place = pool?.place;
  if (pool?.layout !== hubPoolLayout || typeof clear !== 'function'
    || !Number.isInteger(count) || count < 0 || count > HOST.maxOogas
    || !place || ![place.x, place.y, place.z, place.ry].every(Number.isFinite))
    throw Error('invalid Hub forest bed inputs');
  const key = [place.x, place.y, place.z, place.ry, count];
  const previous = cached;
  if (previous && key.every((value, i) => Object.is(value, previous.key[i]))) {
    let matches = true;
    const queries = previous.queries;
    for (let i = 0; i < queries.length; i += 4) {
      if (+!!clear(queries[i], queries[i + 1], queries[i + 2]) !== queries[i + 3]) {
        matches = false; break;
      }
    }
    if (matches) return { beds: previous.anchors.map(bed) };
  }
  // Keep storage bounded even if a future authored layout needs many attempts.
  // An oversized transcript disables reuse; it never truncates the search.
  let queries = [], completed = 0;
  const forest = createHubOutdoorBeds(pool, (x, y, z) => {
    const result = !!clear(x, y, z);
    if (queries) {
      // anchorSearch stops a candidate at its first blocked sample. That one
      // rejection proves it still unavailable; its preceding clear samples do
      // not need replay. Retain every sample of each accepted footprint.
      if (!result) queries.length = completed;
      if (queries.length < MAX_QUERIES * 4) queries.push(x, y, z, +result);
      else queries = null;
      if (!result && queries) completed = queries.length;
    }
    return result;
  });
  for (let i = 0; i < count; i++) {
    if (!forest.more()) break;
    if (queries) completed = queries.length;
  }
  const anchors = forest.beds.map(b => [b.x, b.y, b.z, b.node.rotation.y]);
  cached = queries ? { key, anchors, queries: Float64Array.from(queries) } : null;
  return { beds: anchors.map(bed) };
}
