// VirtualHost's synchronous simulation contract over the real Hub factory.
// Each storage attempt owns one private world; failed attempts discard it.
// A single committed world may be lent to a later matching storage attempt.
// This module is deliberately not installed in a deployed Worker binding.
import { HOST, boundedJSON, sameCheckpointValue } from './virtual-host.js';
import { buildHubWorld } from './hub-world.js';
import { hubNpcFor } from './hub-world-identity.js';
import { createHubWorldState } from './hub-world-state.js';
import { createContributorRoster, hubCharacters, hubSlots, hubRepositoryOf, normalizeHubStats } from './ooga-crew.js';

const fail = () => { throw Error('closed or invalid Hub simulation scope'); };
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export function createHubWorldSimulation(configuration) {
  boundedJSON(configuration, 32 * 1024, 4096);
  const copy = structuredClone(configuration);
  if (copy?.state && typeof copy.state === 'object' && !Array.isArray(copy.state)) {
    if (!Object.hasOwn(copy.state, 'inventory')) copy.state.inventory = [];
    if (!Object.hasOwn(copy.state, 'assignments')) copy.state.assignments = [];
  }
  const config = freeze(copy);
  if (!config || Object.keys(config).sort().join() !== 'activity,checkpointBytes,seed,source,state,version'
    || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff
    || !config.source || Object.keys(config.source).sort().join() !== 'observedAt,revision'
    || !Number.isSafeInteger(config.source.revision) || config.source.revision < 1
    || !Number.isSafeInteger(config.source.observedAt) || config.source.observedAt < 1
    || !/^[A-Za-z0-9_.:-]{1,64}$/.test(config.version)
    || !Number.isSafeInteger(config.checkpointBytes) || config.checkpointBytes < 256
    || config.checkpointBytes > HOST.checkpointBytes - HOST.metadataBytes - HOST.sessionSlotBytes) fail();
  // Validate trusted configuration before it can be durably installed; this
  // constructs no terrain, rig, timer or network subscription.
  const bootstrapState = createHubWorldState(config.state, () => config.source.observedAt);
  if (config.state.elapsed !== 0 || config.state.at !== config.source.observedAt) fail();
  const bootstrapRoster = createContributorRoster({ registry: hubCharacters, clock: bootstrapState.clock,
    repositoryOf: hubRepositoryOf, normalizeStats: normalizeHubStats, slots: hubSlots, authoritative: true });
  bootstrapRoster.validateCheckpoint(config.activity);
  if (config.activity.rows.some(row => row[1] > config.source.observedAt || row[2] > config.source.observedAt)) fail();
  const construct = (saved, now) => {
    const construction = buildHubWorld(config, saved, now);
    try {
      let next = construction.next();
      while (!next.done) next = construction.next();
      return next.value;
    } finally { construction.return(); }
  };
  // One bounded, immutable validation result, never a live world. Confirming an
  // unchanged persisted checkpoint must not rebuild terrain/rigs. Exact values
  // (including -0) are compared; revisions, ownership and deadlines still come
  // from the fresh host record. A valid speculative DTO is safe to remember:
  // this cache proves validity only, never that a transaction committed it.
  let validated = null;
  let warm = null;
  const forTransaction = () => {
    let active = true, runtime = null, previous = null, keys = [], refs = [];
    const alive = () => { if (!active) fail(); };
    const discard = () => {
      try { runtime?.dispose(); } finally { runtime = previous = null; keys = refs = []; }
    };
    const matches = saved => saved === previous && saved !== null
      && (Object.getPrototypeOf(saved) === Object.prototype || Object.getPrototypeOf(saved) === null)
      && Reflect.ownKeys(saved).length === keys.length && keys.every((key, i) => {
        const field = Object.getOwnPropertyDescriptor(saved, key);
        return field && field.enumerable && 'value' in field && Object.is(field.value, refs[i]);
      });
    const remember = saved => {
      keys = Object.keys(saved); refs = keys.map(key => saved[key]);
      for (const value of refs) freeze(value);
      previous = saved;
    };
    const use = (saved, run) => {
      alive();
      try {
        if (!runtime || !matches(saved)) {
          discard();
          if (warm && sameCheckpointValue(saved, warm.saved)) {
            runtime = warm.runtime; warm = null;
          } else {
            // A mismatched committed cache is only an optimization, not a
            // recovery authority. Release it before allocating its replacement
            // so cold takeover/revision changes do not pin two full worlds.
            const obsolete = warm; warm = null;
            obsolete?.runtime.dispose();
            runtime = construct(saved);
          }
          remember(saved);
        }
        return run(runtime);
      } catch (error) { active = false; discard(); throw error; }
    };
    const persist = (saved, run) => use(saved, world => {
      const result = run(world);
      if (result === false) return result;
      // No partly captured world may replace the last committed DTO.
      const next = world.capture();
      for (const key of Object.keys(saved)) delete saved[key];
      Object.assign(saved, next); remember(saved);
      return result;
    });
    const scope = {
      version: config.version, checkpointBytes: config.checkpointBytes,
      initial(now) {
        alive(); discard();
        try {
          runtime = construct(null, now);
          const saved = runtime.capture(); remember(saved); return saved;
        } catch (error) { active = false; discard(); throw error; }
      },
      validate(saved) {
        alive();
        try {
          boundedJSON(saved, config.checkpointBytes, HOST.simulationNodes);
          if (validated !== null && sameCheckpointValue(saved, validated)) return true;
          const valid = use(saved, world => world.validate());
          if (valid === true) validated = freeze(structuredClone(saved));
          return valid;
        } catch (error) { active = false; discard(); throw error; }
      },
      step: (saved, ms, now, timing) => persist(saved, world => world.step(ms, now, timing)),
      project: saved => use(saved, world => world.project()),
      poses: (saved, format) => use(saved, world => world.poses(format)),
      bodyPlacement: (saved, ...args) => use(saved, world => world.bodyPlacement(...args)),
      playerSpawn: (saved, who, context) => use(saved, world => world.playerSpawn(who, context)),
      npcFor: (saved, bodyId, source) => use(saved, () => hubNpcFor(bodyId, source)),
      enqueueInput(saved, value, timing) {
        let result;
        persist(saved, world => { result = world.enqueueInput(value, timing); return result === 'accepted'; });
        return result;
      },
      // Only a changed queue or applied pile replaces the committed DTO.
      applySource(saved, snapshot, timing) {
        let result;
        persist(saved, world => { result = world.applySource(snapshot, timing); return result === 'applied' || result === 'queued'; });
        return result;
      },
      readQueries(saved) {
        // Query readers need the transaction's own runtime/reference fence even
        // when metadata-only validation was satisfied from the immutable DTO.
        use(saved, world => world.validate());
        const savedRefs = [...refs];
        const check = () => {
          alive();
          if (!matches(saved) || savedRefs.some((value, i) => !Object.is(value, refs[i]))) fail();
        };
        return {
          npcFor(bodyId, source) { check(); return hubNpcFor(bodyId, source); },
          poses(format) { check(); return scope.poses(saved, format); },
        };
      },
      dispose() { active = false; discard(); },
      committed() {
        alive();
        if (!runtime) return;
        // Only VirtualHost's post-storage-success hook calls this. The loan is
        // removed from the pool before use, so overlapping attempts never share
        // mutable actors. Fresh persisted state must match every exact value.
        const saved = freeze(structuredClone(previous));
        const old = warm;
        warm = { saved, runtime };
        runtime = previous = null; keys = refs = [];
        old?.runtime.dispose();
      },
    };
    return scope;
  };
  const adapter = { version: config.version, checkpointBytes: config.checkpointBytes, forTransaction };
  for (const method of ['initial', 'validate', 'step', 'project', 'poses', 'playerSpawn', 'npcFor', 'enqueueInput', 'applySource', 'bodyPlacement']) {
    adapter[method] = (...args) => {
      const scope = forTransaction();
      try { return scope[method](...args); } finally { scope.dispose(); }
    };
  }
  return adapter;
}
