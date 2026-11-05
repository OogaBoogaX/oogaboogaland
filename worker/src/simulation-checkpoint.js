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
      return { npcFor(id) {
        if (snapshot === undefined) snapshot = freeze(codec.unpack(state));
        return sync(simulation.npcFor(snapshot, id));
      } };
    },
    handoff(state, intent) {
      const runtime = codec.unpack(state), result = sync(simulation.handoff(runtime, intent));
      if (result === true) assign(state, codec.pack(runtime));
      return result;
    },
  };
  if (typeof simulation.poses === "function") wrapped.poses = state => sync(simulation.poses(codec.unpack(state)));
  return wrapped;
}
