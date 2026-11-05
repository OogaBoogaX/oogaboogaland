// Opt-in composition for actual data-only simulation adapters. The world version
// includes packing and its declared maximum; changing either requires a new world.
import { createCheckpointPack } from "./checkpoint-pack.js";
export function compactSimulation(simulation, checkpointBytes, { intern = false } = {}) {
  const codec = createCheckpointPack(checkpointBytes, { intern }), version = `pack${intern ? 2 : 1}-${checkpointBytes}:${simulation?.version}`;
  if (!simulation || !/^[A-Za-z0-9_.:-]{1,64}$/.test(version)
    || !["initial", "validate", "step", "project", "npcFor", "handoff"].every(k => typeof simulation[k] === "function")) {
    throw new Error("compact simulation requires explicit adapters and a bounded world version");
  }
  const sync = value => { if (value?.then) throw new Error("simulation must be synchronous"); return value; };
  const assign = (to, from) => {
    to.v = from.v; to.shapes = from.shapes; to.data = from.data;
    if (from.v === 2) to.scalars = from.scalars; else delete to.scalars;
  };
  const freeze = value => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const wrapped = { version, checkpointBytes,
    initial: now => codec.pack(sync(simulation.initial(now))),
    validate: state => sync(simulation.validate(codec.unpack(state))) === true,
    step(state, ms, now) {
      const runtime = codec.unpack(state); sync(simulation.step(runtime, ms, now)); assign(state, codec.pack(runtime));
    },
    project: state => sync(simulation.project(codec.unpack(state))),
    npcFor: (state, id) => sync(simulation.npcFor(codec.unpack(state), id)),
    // One transaction's read-only phase, discarded before any world mutation.
    // Decode lazily: ordinary live ticks often need no ownership lookups. The
    // private frozen copy prevents one query from poisoning another; no cache
    // survives a transaction retry, step or handoff, and no actor is retained globally.
    readQueries(state) {
      let snapshot;
      const read = () => snapshot === undefined ? snapshot = freeze(codec.unpack(state)) : snapshot;
      const queries = { npcFor: id => sync(simulation.npcFor(read(), id)) };
      if (typeof simulation.poses === "function") queries.poses = format => sync(simulation.poses(read(), format));
      return queries;
    },
    handoff(state, intent) {
      const runtime = codec.unpack(state), result = sync(simulation.handoff(runtime, intent));
      if (result === true) assign(state, codec.pack(runtime));
      return result;
    },
  };
  if (typeof simulation.poses === "function") wrapped.poses = (state, format) => sync(simulation.poses(codec.unpack(state), format));
  if (typeof simulation.playerSpawn === "function") wrapped.playerSpawn = (state, who) => sync(simulation.playerSpawn(codec.unpack(state), who));
  // The host creates one scope INSIDE each storage callback, including retries.
  // Frozen wire children make identity checks exact (no JSON hash collisions for
  // -0/nonfinite values). The outer record stays writable for atomic assignment.
  wrapped.forTransaction = () => {
    let active = true, entries = new WeakMap();
    const alive = () => { if (!active) throw Error("simulation transaction closed"); };
    const fields = state => state.v === 2 ? ["v", "shapes", "data", "scalars"] : ["v", "shapes", "data"];
    const remember = (state, runtime) => {
      const keys = fields(state);
      for (const key of keys) freeze(state[key]);
      const entry = { runtime: freeze(runtime), keys, refs: keys.map(key => state[key]), valid: false };
      entries.set(state, entry); return entry;
    };
    const entryFor = state => {
      alive(); const entry = entries.get(state);
      if (entry && (Object.getPrototypeOf(state) === Object.prototype || Object.getPrototypeOf(state) === null)
        && Reflect.ownKeys(state).length === entry.keys.length && entry.keys.every((key, i) => {
          const d = Object.getOwnPropertyDescriptor(state, key); return d && d.enumerable && "value" in d && Object.is(d.value, entry.refs[i]);
        })) return entry;
      return remember(state, codec.unpack(state));
    };
    const update = (state, mutate) => {
      const runtime = structuredClone(entryFor(state).runtime), result = sync(mutate(runtime));
      if (result === false) return false;
      const packed = codec.pack(runtime); // Validate all bounds before assignment.
      assign(state, packed); remember(state, runtime); return result;
    };
    const scope = { version, checkpointBytes,
      initial(now) { alive(); const state = wrapped.initial(now); entryFor(state); return state; },
      validate(state) {
        const entry = entryFor(state);
        if (!entry.valid) entry.valid = sync(simulation.validate(entry.runtime)) === true;
        return entry.valid;
      },
      step(state, ms, now) { update(state, runtime => { sync(simulation.step(runtime, ms, now)); }); },
      project: state => sync(simulation.project(entryFor(state).runtime)),
      npcFor: (state, id) => sync(simulation.npcFor(entryFor(state).runtime, id)),
      handoff: (state, intent) => update(state, runtime => sync(simulation.handoff(runtime, intent)) === true),
      readQueries(state) {
        const snapshot = entryFor(state).runtime;
        const queries = { npcFor(id) { alive(); return sync(simulation.npcFor(snapshot, id)); } };
        if (typeof simulation.poses === "function") queries.poses = format => { alive(); return sync(simulation.poses(snapshot, format)); };
        return queries;
      },
      dispose() { active = false; entries = new WeakMap(); },
    };
    if (typeof simulation.poses === "function") scope.poses = (state, format) => sync(simulation.poses(entryFor(state).runtime, format));
    if (typeof simulation.playerSpawn === "function") scope.playerSpawn = (state, who) => sync(simulation.playerSpawn(entryFor(state).runtime, who));
    return scope;
  };
  return wrapped;
}
