// Finite evaluator adapter only. Actual restricted AI/rigs; authored empty
// meadow and chilling owners. No world jobs, player ownership or live binding.
import { createClankerRoamingCheckpoint } from "../src/clanker-roaming.js";
import { createNpcPose } from "../src/npc-pose.js";
import "../../src/js/clanker-pose.js";
import "../../src/js/npc-pose-packet.js";

export function roamingSimulation(B, count, spacious = false) {
  if (!Number.isInteger(count) || count < 1 || count > 53 || typeof spacious !== "boolean") throw Error("bounded roaming fixture required");
  const version = `cycle-roaming-1-${count}-${spacious ? "spacious" : "crowded"}`;
  const emptyOoga = createNpcPose(123, 1);
  const make = saved => {
    const owners = Array.from({ length: count }, (_, i) => ({ id: `fixture-${i}`, traits: { name: `fixture-${i}` },
      state: "chilling", work: { site: -1, plannedSite: -1 }, root: B.scene.createNode(), camp: { burning: false } }));
    const crew = { list: owners, cavemen: new Map(owners.map(o => [o.traits.name, o])), stateOf: o => o.state };
    const sim = B.clankers.create({ root: B.scene.createNode(), crew, sites: [], checkpointRandom: true, checkpointProfile: "roaming-1",
      groundAt: () => 0, clear: () => true, combatEnabled: false, ...(spacious ? { meadowRadius: 60, roamRadius: 68 } : {}) });
    try {
      const codec = createClankerRoamingCheckpoint(sim, version, B.clankerState);
      if (saved !== null) codec.restore(saved);
      return { sim, codec };
    } catch (error) { sim.dispose(); throw error; }
  };
  const operations = use => ({ version, checkpointBytes: 64 * 1024,
    initial: () => use(null, (sim, codec) => {
      sim.sync(); for (const e of sim.list) e.rest = 0;
      return codec.capture();
    }),
    validate: saved => use(saved, () => true),
    step(saved, ms) {
      if (ms !== 250) throw Error("roaming fixture requires fixed host step");
      use(saved, (sim, codec) => {
        sim.update(ms / 1000); const next = codec.capture();
        // Commit only after a complete bounded capture, inside the scope so it
        // remembers the new wire identities paired with this private controller.
        for (const key of Object.keys(saved)) delete saved[key]; Object.assign(saved, next);
      });
    },
    project: saved => use(saved, sim => ({ npcs: sim.list.filter(e => e.active).map(e => ({
      id: `clanker-${e.index}`, kind: "clanker", ...e.root.position, yaw: Math.atan2(Math.sin(e.heading), Math.cos(e.heading)),
      activity: "chilling", phase: e.phase, route: "fixture", progress: 0, seed: e.random.capture(),
    })), hub: { pile: 0 } })),
    // Synthetic owners are not authenticated players. Never claim this profile
    // can hand a player body back to an NPC or restore browser possession.
    npcFor: () => null, handoff: () => false,
    poses: (saved, format) => {
      if (format !== "mixed-1") throw Error("roaming fixture requires explicit mixed format");
      return use(saved, sim => globalThis.BL.npcPosePacket.pack(version, emptyOoga([]), sim.list.map(e => ({
        index: e.index, pose: e.gorilla.createPoseProjector(version).capture(),
      }))));
    },
    stats: saved => use(saved, sim => ({ ...sim.stats() })),
  });
  const adapter = operations((saved, fn) => {
    const { sim, codec } = make(saved);
    try { return fn(sim, codec); } finally { sim.dispose(); }
  });
  // One bounded, private, data-only validation memo per authored world. A
  // byte/field change takes the full restore path; no digest, session, fence or
  // mutable controller is cached across transactions. Compare descriptors so a
  // getter, sparse array or prototype cannot masquerade as validated wire data.
  let validated = null;
  const freeze = value => {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const sameWire = (value, known) => {
    if (Object.is(value, known)) return true;
    if (!value || !known || typeof value !== "object" || typeof known !== "object"
      || Array.isArray(value) !== Array.isArray(known)) return false;
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value) ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) return false;
    const names = Reflect.ownKeys(known);
    if (Reflect.ownKeys(value).length !== names.length) return false;
    for (const key of names) {
      const field = Object.getOwnPropertyDescriptor(value, key), original = Object.getOwnPropertyDescriptor(known, key);
      if (!field || !("value" in field) || field.enumerable !== original.enumerable || !sameWire(field.value, original.value)) return false;
    }
    return true;
  };
  // Exactly one private controller per transaction attempt. Wire children are
  // frozen and compared by identity, never a lossy hash. A changed DTO rebuilds
  // from that checkpoint; retries receive a new scope through VirtualHost.
  // Capture still validates every individual fixed step before changing its DTO.
  adapter.forTransaction = () => {
    let active = true, runtime = null, previous = null, keys = [], refs = [];
    const alive = () => { if (!active) throw Error("roaming transaction closed"); };
    const discard = () => { runtime?.sim.dispose(); runtime = previous = null; keys = refs = []; };
    const matches = saved => saved === previous && saved !== null
      && (Object.getPrototypeOf(saved) === Object.prototype || Object.getPrototypeOf(saved) === null)
      && Reflect.ownKeys(saved).length === keys.length && keys.every((key, i) => {
        const d = Object.getOwnPropertyDescriptor(saved, key);
        return d && d.enumerable && "value" in d && Object.is(d.value, refs[i]);
      });
    const bind = saved => {
      keys = Object.keys(saved); refs = keys.map(key => saved[key]);
      for (const value of refs) freeze(value);
      previous = saved;
    };
    const scope = operations((saved, fn) => {
      alive();
      try {
        if (!matches(saved) || !runtime) { discard(); runtime = make(saved); }
        const result = fn(runtime.sim, runtime.codec);
        if (saved === null) discard(); // Initial state gets validated on first read.
        else {
          if (!matches(saved)) validated = freeze(structuredClone(saved));
          bind(saved);
        }
        return result;
      } catch (error) { active = false; discard(); throw error; }
    });
    for (const key of Object.keys(scope)) if (typeof scope[key] === "function") {
      const fn = scope[key]; scope[key] = (...args) => { alive(); return fn(...args); };
    }
    const validate = scope.validate;
    scope.validate = saved => {
      alive();
      if (matches(saved)) return true;
      if (validated && sameWire(saved, validated)) { discard(); bind(saved); return true; }
      return validate(saved);
    };
    // Publication can read the already validated immutable checkpoint without
    // cloning it and rebuilding all rigs a second time. Readers are bound to
    // these exact wire children and expire on mutation or scope disposal.
    scope.readQueries = saved => {
      scope.validate(saved);
      const names = Object.keys(saved), values = names.map(k => saved[k]);
      const check = () => {
        alive();
        if (!matches(saved) || names.length !== keys.length || names.some((k, i) => k !== keys[i] || !Object.is(saved[k], values[i])))
          throw Error("roaming query checkpoint changed");
      };
      return { npcFor() { check(); return null; }, poses(format) { check(); return scope.poses(saved, format); } };
    };
    scope.dispose = () => { active = false; discard(); };
    return scope;
  };
  return adapter;
}
