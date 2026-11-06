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
  if (!inputs || inputs.v !== 2 || simulation.state.at > observedAt) throw Error('Hub source checkpoint unavailable');
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

export function hubPileUpdate(saved, value, observedAt) {
  validateHubPile(value);
  if (!Number.isSafeInteger(observedAt) || observedAt < value.at || observedAt - value.at > 60000)
    throw Error('stale or future private pile source');
  const simulation = saved?.simulation, inputs = simulation?.inputs;
  if (!inputs || inputs.v !== 2 || simulation.state.at > observedAt) throw Error('Hub source checkpoint unavailable');
  const previous = inputs.pending?.input, state = previous?.state || simulation.state;
  if (state.pile && value.at < state.pile.at) return null;
  if (state.pile && value.at === state.pile.at) {
    if (!sameCheckpointValue(value, state.pile)) throw Error('conflicting private pile snapshot');
    return null;
  }
  if (state.pile && value.eatPerHour === 0 && state.pile.eatPerHour === 0
    && value.bananas === state.pile.bananas) return null;
  const revision = (previous?.revision || inputs.revision) + 1;
  if (!Number.isSafeInteger(revision)) throw Error('Hub source revision exhausted');
  const input = { v: 1, kind: 'hub-state', observedAt, revision,
    state: { level: hubPileLevel(value, observedAt), tint: state.tint,
      inventory: state.inventory, assignments: state.assignments, pile: structuredClone(value) },
    activity: previous?.activity || simulation.activity };
  boundedJSON(input, 32 * 1024, 4096);
  return input;
}
