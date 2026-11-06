// Oogatron input preparation only. Network reads happen outside the host's
// serialized mutation window; the latest retained world supplies all other data.
import { contributorRows } from './contributor-policy.js';
import { boundedJSON, sameCheckpointValue } from './virtual-host.js';
import { createContributorRoster, hubCharacters, hubSlots, hubRepositoryOf, normalizeHubStats } from './ooga-crew.js';
import { validateHubPile, hubPileLevel } from './hub-pile-source.js';
export function hubActivityUpdate(saved, stats, observedAt) {
  contributorRows(stats, observedAt); // Existing source schema/freshness checks.
  const generatedAt = Date.parse(stats.meta.generated_at);
  if (!Number.isSafeInteger(observedAt) || generatedAt > observedAt) throw Error('future Hub activity source');
  const simulation = saved?.simulation, inputs = simulation?.inputs;
  if (!inputs || inputs.v !== 3 || simulation.state.at > observedAt) throw Error('Hub source checkpoint unavailable');
  const previous = inputs.pending?.input;
  const activity = previous?.activity || simulation.activity;
  const roster = createContributorRoster({ registry: hubCharacters, clock: () => observedAt,
    repositoryOf: hubRepositoryOf, normalizeStats: normalizeHubStats, slots: hubSlots, authoritative: true });
  roster.restore(activity);
  roster.applySnapshot(stats, observedAt);
  const next = roster.capture();
  if (sameCheckpointValue(activity, next)) return { generatedAt, input: null };
  const revision = (previous?.revision || inputs.revision) + 1;
  if (!Number.isSafeInteger(revision)) throw Error('Hub source revision exhausted');
  const state = previous?.state || simulation.state;
  const input = { v: 1, kind: 'hub-state', observedAt, revision,
    state: { level: state.level, tint: state.tint, inventory: state.inventory, assignments: state.assignments,
      pile: state.pile || null }, activity: next };
  boundedJSON(input, 32 * 1024, 4096);
  return { generatedAt, input: structuredClone(input) };
}

const refused = (code, message) => { throw Object.assign(Error(message), { code }); };
// One private pile snapshot against the latest retained/pending state, observed by
// the host at observedAt. Returns { status, input }; only 'accepted' has an input.
// - 'unknown': a valid snapshot with no level. Never stored, never turned into 0.
// - 'stale': a lower producer revision, or a host observation older than one
//   already accepted or pending. The later observation stands.
// - 'unchanged': the identical aggregate at the same revision.
// - 'accepted': a higher revision (which may lower the level, as a reversal does),
//   or new health/uncertainty at the same revision with the same accounting.
// Throws, with a code, for an invalid or legacy snapshot, conflicting accounting at
// one revision, or a checkpoint that cannot take it.
export function hubPileUpdate(saved, value, observedAt) {
  const pile = validateHubPile(value);
  if (!Number.isSafeInteger(observedAt) || observedAt < 1) refused('invalid', 'invalid private pile observation');
  if (pile.at !== null && pile.at > observedAt) refused('invalid', 'future private pile snapshot');
  const simulation = saved?.simulation, inputs = simulation?.inputs;
  if (!inputs || inputs.v !== 3 || simulation.state.at > observedAt) refused('checkpoint', 'Hub source checkpoint unavailable');
  const previous = inputs.pending?.input, state = previous?.state || simulation.state;
  if (observedAt < (previous ? previous.observedAt : inputs.observedAt)) return { status: 'stale', input: null };
  const held = state.pile;
  if (held && held.v !== 2) refused('legacy', 'legacy private pile checkpoint requires migration');
  if (held && pile.revision < held.revision) return { status: 'stale', input: null };
  if (held && pile.revision === held.revision) {
    if (pile.bananas !== held.bananas || pile.at !== held.at || pile.cutover !== held.cutover)
      refused('conflict', 'conflicting private pile accounting');
    if (sameCheckpointValue(pile, held)) return { status: 'unchanged', input: null };
  }
  if (pile.bananas === null) return { status: 'unknown', input: null };
  const revision = (previous?.revision || inputs.revision) + 1;
  if (!Number.isSafeInteger(revision)) throw Error('Hub source revision exhausted');
  const input = { v: 1, kind: 'hub-state', observedAt, revision,
    state: { level: hubPileLevel(pile, observedAt), tint: state.tint,
      inventory: state.inventory, assignments: state.assignments, pile },
    activity: previous?.activity || simulation.activity };
  boundedJSON(input, 32 * 1024, 4096);
  return { status: 'accepted', input: structuredClone(input) };
}
