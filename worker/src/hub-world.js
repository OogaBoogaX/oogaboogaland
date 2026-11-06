// Real Hub construction and atomic logical recovery, with no browser singleton
// or synthetic terrain. The generator permits a bounded startup runner to yield
// between construction stages; it does not schedule or activate that runner.
import { boundedJSON, HOST } from './virtual-host.js';
import { createNpcExecution, createContributorRoster,
  hubCharacters, hubSlots, hubRepositoryOf, normalizeHubStats } from './ooga-crew.js';
import { buildHubWorldGeometry } from './hub-world-geometry.js';
import { createHubWorldState } from './hub-world-state.js';
import { createHubWorldActors } from './hub-world-actors.js';
import { createHubWorldEvents } from './hub-world-events.js';
import { createHubWorldProjection } from './hub-world-projection.js';
import { createHubWorldPlacement } from './hub-world-placement.js';
import { hubNpcFor } from './hub-world-identity.js';
import { createHubBodyPlacement } from './hub-body-placement.js';
import { validateHubLayout, assertHubLayout } from './hub-layout-history.js';

const fail = () => { throw Error('invalid complete Hub construction'); };
export function* buildHubWorld(config, saved = null, now = null) {
  if (!config || !/^[A-Za-z0-9_.:-]{1,64}$/.test(config.version)
    || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff
    || !Number.isSafeInteger(config.checkpointBytes) || config.checkpointBytes < 256
    || config.checkpointBytes > HOST.checkpointBytes - HOST.metadataBytes - HOST.sessionSlotBytes) fail();
  boundedJSON(config, 32 * 1024, 4096);
  if (saved !== null) boundedJSON(saved, config.checkpointBytes, HOST.simulationNodes);
  else if (!Number.isSafeInteger(now) || now < 1) fail();
  const state = createHubWorldState(saved === null ? { ...config.state, at: now, elapsed: 0 } : saved.state);
  const execution = createNpcExecution({ seed: config.seed });
  const roster = createContributorRoster({ registry: hubCharacters, clock: state.clock,
    repositoryOf: hubRepositoryOf, normalizeStats: normalizeHubStats, slots: hubSlots, authoritative: true });
  // Explicit trusted activity is required at first boot; never start all NPCs
  // from a viewer's local activity snapshot or silently use stale bundled dates.
  roster.restore(saved === null ? config.activity : saved.activity);
  // Earlier world records include shared water or different route semantics.
  // Refuse them explicitly; never silently reinterpret retained actor state.
  if (saved !== null && saved.v !== 7) throw Error('Hub packed logical recovery migration required');
  const layout = validateHubLayout(saved === null
    ? { v: 1, level: state.world.level, count: roster.activeRoster.length, ring: 0 } : saved.layout);
  let geometry = null, actors = null, completed = false, disposed = false;
  const inputs = createHubWorldEvents({ state, roster, source: config.source,
    changed() {
      geometry.setPileLevel(state.world.level);
      if (geometry.refreshMainland()) actors.clankers.supportRemoved();
      actors.crew.applyAllSwag(); geometry.sync();
    } });
  if (saved === null && config.source.observedAt > now) fail();
  const dispose = () => {
    if (disposed) return; disposed = true;
    try { actors?.dispose(); } finally { geometry?.dispose(); }
  };
  const alive = () => { if (disposed) fail(); };
  try {
    geometry = yield* buildHubWorldGeometry({ layout,
      getRosterCount: () => roster.activeRoster.length });
    geometry.setPileLevel(state.world.level); geometry.refreshMainland(); geometry.sync();
    if (saved !== null) assertHubLayout(geometry.captureLayout(), saved.layout);
    yield;
    actors = createHubWorldActors({ geometry, roster, execution, world: state.world,
      clock: state.clock, tintWanted: state.tintWanted, game: state.game, stars: state.stars,
      npcIdFor: who => hubNpcFor(who.bodyId, who) });
    const recovery = actors.composeRecovery({ version: config.version, checkpointBytes: config.checkpointBytes,
      inputs, worldState: state, layoutState: {
        capture: geometry.captureLayout,
        restore: value => assertHubLayout(geometry.captureLayout(), value),
      }, validateWorld: () => state.validate()
        && geometry.pileLevel === state.world.level, disposeWorld: dispose });
    if (saved === null) actors.initialize(); else recovery.restore(saved);
    const projection = createHubWorldProjection({ version: config.version, actors, geometry, world: state.world });
    const placement = createHubWorldPlacement(geometry);
    const placeBody = createHubBodyPlacement(actors, placement);
    completed = true;
    return {
      actors, geometry, state, roster, placement,
      bodyPlacement(...args) { alive(); return placeBody(...args); },
      capture() { alive(); return recovery.capture(); },
      validate() { alive(); return recovery.usable && state.validate(); },
      step(ms, simulatedAt, timing) {
        alive();
        const wallAt = timing?.wallAt;
        if (ms !== HOST.stepMs || !Number.isSafeInteger(simulatedAt) || simulatedAt < 0
          || !Number.isSafeInteger(wallAt) || wallAt < simulatedAt) fail();
        state.advance(ms, wallAt);
        inputs.drain(simulatedAt, wallAt);
        // Clock-driven pile decay is also a geometry change; refresh before
        // either actor controller plans against the new level.
        if (geometry.pileLevel !== state.world.level) {
          geometry.setPileLevel(state.world.level);
          if (geometry.refreshMainland()) actors.clankers.supportRemoved();
          geometry.sync();
        }
        actors.refreshActivity(); actors.step(ms / 1000, state.elapsed());
      },
      enqueueInput(value, timing) { alive(); return inputs.enqueue(value, timing); },
      project() { alive(); return projection.project(); },
      poses(format) { alive(); return projection.poses(format); },
      playerSpawn(who, context) { alive(); return actors.playerSpawn(who, context); },
      dispose,
    };
  } finally {
    if (!completed) dispose();
  }
}
