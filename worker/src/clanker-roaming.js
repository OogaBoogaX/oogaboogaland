// Restricted actual-controller recovery. Static, noncombat meadow only; no
// general-world bodies, caves, jobs, reservations or live browser activation.
import { createClankerBufferCheckpoint, CLANKER_BUFFER_FIELDS } from "./clanker-buffers.js";
import { createCheckpointPack } from "./checkpoint-pack.js";
import { restoreNpcRandom } from "./npc-random.js";
const excluded = new Set(["owner", "cave", "tooltipOwner", "gorilla", "root", "parts", "random"]);
const bufferFields = new Set(CLANKER_BUFFER_FIELDS);
const missing = Symbol("missing");
const bad = () => { throw Error("invalid Clanker roaming checkpoint or profile"); };
const equal = (a, b) => Array.isArray(a) && Array.isArray(b)
  ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b);
const dense = a => Array.isArray(a) && Reflect.ownKeys(a).length === a.length + 1
  && Array.from({ length: a.length }, (_, i) => Object.getOwnPropertyDescriptor(a, i)).every(d => d && "value" in d);

export function createClankerRoamingCheckpoint(sim, world, rigCodec) {
  return createCheckpoint(sim, world, rigCodec, sim.roamingCheckpoint, 64 * 1024);
}

// Isolated controlled body only. This component budget is NOT a session-slot
// reservation; the host must measure/admit the complete body before integration.
export function createClankerBodyCheckpoint(sim, world, rigCodec) {
  if (sim.list.length !== 1) bad();
  const codec = createCheckpoint(sim, world, rigCodec, sim.bodyCheckpoint, 8 * 1024);
  let invalid = false;
  const ready = () => { if (invalid) bad(); };
  return {
    neutralize() { ready(); sim.bodyCheckpoint.neutralize(); },
    capture() { ready(); if (!sim.player) bad(); return codec.capture(); },
    restore(saved) {
      ready();
      try { codec.restore(saved); if (!sim.player) bad(); return true; }
      catch (error) { invalid = true; throw error; }
    },
  };
}

function createCheckpoint(sim, world, rigCodec, bridge, budget) {
  const entries = sim.list;
  if (!bridge || bridge.capture()[0] !== 0 || !rigCodec?.packRoster || !rigCodec?.unpackRoster) bad();
  const ids = entries.map(e => e.owner.id), references = new Map(entries.map((e, i) => [e, i]));
  const buffers = createClankerBufferCheckpoint(world, ids), pack = createCheckpointPack(budget, { intern: true });
  const rigs = entries.map(e => e.gorilla.createManagedCheckpoint(world));
  const token = value => {
    if (value === missing) return [-6];
    if (value === undefined) return [-5];
    if (typeof value === "number") {
      if (Number.isNaN(value)) return [-1];
      if (value === Infinity) return [-2];
      if (value === -Infinity) return [-3];
      if (Object.is(value, -0)) return [-4];
      if (Math.abs(value) > 1e12) bad();
      return value;
    }
    if (references.has(value)) return [0, references.get(value)];
    if (value === null || typeof value === "boolean" || typeof value === "string" && value.length <= 80) return value;
    bad();
  };
  const decode = value => {
    if (!Array.isArray(value)) { token(value); return value; }
    if (!dense(value)) bad();
    if (value.length === 1 && Number.isInteger(value[0]) && value[0] <= -1 && value[0] >= -6)
      return [NaN, Infinity, -Infinity, -0, undefined, missing][-value[0] - 1];
    if (value.length === 2 && value[0] === 0 && Number.isInteger(value[1]) && value[1] >= 0 && value[1] < entries.length)
      return entries[value[1]];
    bad();
  };
  const fields = [];
  // Compile only the freshly constructed local source layout, never a schema
  // from storage. A changed layout/default/world boot changes the baseline.
  const compile = (value, path = []) => {
    const name = path.join(".");
    if (bufferFields.has(name)) return { buffer: true };
    if (path.length && (value === null || typeof value !== "object" || references.has(value))) {
      if (fields.length >= 700 || path.length > 6) bad();
      const field = { path, kind: value === missing ? "optional" : value === null || references.has(value) ? "reference" : typeof value };
      const index = fields.length; fields.push(field); return { index };
    }
    if (!value || Array.isArray(value) || ArrayBuffer.isView(value) || path.length > 6) bad();
    const keys = Object.keys(value).filter(k => path.length || !excluded.has(k));
    if (name === "motion" && !keys.includes("walkGait")) keys.push("walkGait");
    if (keys.length > 128 || keys.some(k => ["__proto__", "prototype", "constructor"].includes(k))) bad();
    return { keys, children: keys.map(k => compile(Object.hasOwn(value, k) ? value[k] : missing, [...path, k])) };
  };
  const shape = compile(entries[0]);
  const compatible = (field, value) => field.kind === "optional" ? value === missing || typeof value === "string" && value.length <= 80
    : field.kind === "reference" ? value === null || references.has(value) : typeof value === field.kind;
  const values = entry => {
    const out = [];
    const walk = (value, node, root = false) => {
      if (node.buffer) return;
      if (node.index !== undefined) {
        if (!compatible(fields[node.index], value)) bad(); out[node.index] = token(value); return;
      }
      if (!value || typeof value !== "object") bad();
      const keys = Object.keys(value).filter(k => !root || !excluded.has(k));
      if (keys.some(k => !node.keys.includes(k))) bad();
      for (let i = 0; i < node.keys.length; i++) {
        const k = node.keys[i]; walk(Object.hasOwn(value, k) ? value[k] : missing, node.children[i]);
      }
    };
    walk(entry, shape, true); return out;
  };
  const defaults = entries.map(values), staticState = Array.from(bridge.baseline());
  // This is an accidental-baseline mismatch guard, not authentication. The
  // enclosing host must still bind its explicit simulation/world version.
  const baselineText = JSON.stringify([fields.map(f => f.path), defaults, staticState]);
  let h1 = 2166136261, h2 = 3335557771;
  for (let i = 0; i < baselineText.length; i++) {
    h1 = Math.imul(h1 ^ baselineText.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ baselineText.charCodeAt(i), 16777619);
  }
  const baseline = `${h1 >>> 0}:${h2 >>> 0}`;
  let invalid = false, restored = false;
  const ready = () => { if (invalid) bad(); };
  return {
    capture() {
      ready();
      const clocks = Array.from(bridge.capture());
      if (!equal(staticState, Array.from(bridge.baseline()))) bad();
      const actors = entries.map((e, i) => {
        const word = e.random?.capture?.();
        if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) bad();
        const row = [word], current = values(e);
        for (let j = 0; j < fields.length; j++) if (!equal(current[j], defaults[i][j])) row.push(j, current[j]);
        return row;
      });
      return pack.pack({ v: 1, world, baseline, clocks, actors, buffers: buffers.capture(entries),
        rigs: structuredClone(rigCodec.packRoster(world, rigs.map((rig, index) => ({ index, snapshot: rig.capture() })), true)) });
    },
    restore(saved) {
      ready();
      // Restore into a fresh, disposable controller before it can publish or
      // step. If application fails, poison this adapter; discard the controller.
      if (restored || bridge.capture()[0] !== 0) bad();
      const state = pack.unpack(saved);
      if (Object.keys(state).sort().join() !== "actors,baseline,buffers,clocks,rigs,v,world" || state.v !== 1
        || state.world !== world || state.baseline !== baseline || !dense(state.actors) || state.actors.length !== entries.length) bad();
      const decoded = state.actors.map((row, i) => {
        if (!dense(row) || row.length % 2 !== 1 || row.length > fields.length * 2 + 1) bad();
        const random = restoreNpcRandom({ v: 1, word: row[0] }).next, result = defaults[i].map(decode);
        let previous = -1;
        for (let j = 1; j < row.length; j += 2) {
          const index = row[j];
          if (!Number.isInteger(index) || index <= previous || index >= fields.length || equal(row[j + 1], defaults[i][index])) bad();
          const value = decode(row[j + 1]);
          if (!compatible(fields[index], value)) bad(); result[index] = value; previous = index;
        }
        return { random, result };
      });
      const arrays = buffers.restore(state.buffers), poses = rigCodec.unpackRoster(state.rigs);
      if (poses.length !== entries.length || poses.some((p, i) => p.index !== i)) bad();
      invalid = true;
      bridge.restore(state.clocks);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        for (let j = 0; j < fields.length; j++) {
          const path = fields[j].path; let object = e;
          for (let k = 0; k < path.length - 1; k++) object = object[path[k]];
          const key = path.at(-1), value = decoded[i].result[j];
          if (value === missing) delete object[key]; else object[key] = value;
        }
        for (const [group, members] of Object.entries(arrays[i])) Object.assign(e[group], members);
        e.random = decoded[i].random;
        rigs[i].restore(poses[i].snapshot);
      }
      bridge.capture(); // Refuse a saved state outside this limited profile.
      restored = true; invalid = false;
      return true;
    },
  };
}
