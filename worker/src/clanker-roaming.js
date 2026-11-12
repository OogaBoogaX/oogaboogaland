// Restricted actual-controller recovery: roaming meadow or static terrain
// support for player bodies. No jobs, occupancy, climbing or live scene activation.
import { createClankerBufferCheckpoint, CLANKER_BUFFER_FIELDS, CLANKER_FIXED_PATH_CAPACITY } from "./clanker-buffers.js";
import { createCheckpointPack } from "./checkpoint-pack.js";
import { restoreNpcRandom } from "./npc-random.js";
import "../../src/js/clanker-body-transfer.js";
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

// Full job/controller records with source-owned reservations, but fresh rig
// animation. The combined Hub restore must restore lab items and world state,
// then call finishRecovery before the controller may step or capture again.
export function createClankerLogicalCheckpoint(sim, world) {
  return createCheckpoint(sim, world, null, sim.logicalCheckpoint, 64 * 1024, true);
}

// Created from a trusted boot's source rules/baseline/owner, not stored data.
// Its closure has no simulation or rig, so a world may retain these small codecs
// after disposing its bootstrap controller. It changes no position or time.
function bodyRecords(pack, world, baseline, owner, rules, sourceBaseline) {
  if (!["validate", "motion", "disconnect"].every(k => typeof rules?.[k] === "function")) bad();
  const wire = globalThis.BL.clankerBodyTransfer.create({ world, baseline: sourceBaseline, owner, rules });
  const read = saved => {
    const state = pack.unpack(saved);
    if (Object.keys(state).sort().join() !== "baseline,body,v,world" || state.v !== 3
      || state.world !== world || state.baseline !== baseline || rules.validate(state.body) !== true
      || state.body[0] !== owner) bad();
    return state;
  };
  return Object.freeze({
    read,
    motion(saved) { return rules.motion(read(saved).body); },
    transfer(saved) { return wire.encode(read(saved).body); },
    // Data conversion only. The caller must authenticate, order and atomically
    // commit a live sample with its session; this does not grant ownership.
    fromTransfer(value) { return pack.pack({ v: 3, world, baseline, body: wire.read(value) }); },
    disconnect(saved, before) {
      const state = read(saved), motion = rules.motion(state.body);
      if (!before || Object.keys(before).length !== 8
        || Object.keys(motion).some(k => !Object.hasOwn(before, k) || !Object.is(before[k], motion[k]))) bad();
      state.body = rules.disconnect(state.body);
      return { checkpoint: pack.pack(state), motion: rules.motion(state.body) };
    },
  });
}

// Isolated controlled body only. This component budget is NOT a session-slot
// reservation; the host must measure/admit the complete body before integration.
export function createClankerBodyCheckpoint(sim, world) {
  const bridge = sim.bodyCheckpoint, pack = createCheckpointPack(8192, { intern: true });
  if (sim.list.length !== 1 || !bridge || bridge.capture()[0] !== 0
    || typeof bridge.bodyState !== "function" || typeof bridge.restoreBody !== "function"
    || typeof world !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(world)) bad();
  const boot = JSON.stringify(bridge.baseline());
  let h1 = 2166136261, h2 = 3335557771;
  for (let i = 0; i < boot.length; i++) {
    h1 = Math.imul(h1 ^ boot.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ boot.charCodeAt(i), 16777619);
  }
  const baseline = `${h1 >>> 0}:${h2 >>> 0}`;
  const records = bodyRecords(pack, world, baseline, sim.list[0].owner.id, bridge.records, JSON.parse(boot));
  let invalid = false, restored = false;
  const ready = () => { if (invalid) bad(); };
  return {
    records,
    neutralize() { ready(); sim.bodyCheckpoint.neutralize(); },
    disconnect() { ready(); sim.bodyCheckpoint.disconnect(); },
    motion() { ready(); return sim.bodyCheckpoint.motion(); },
    stepPassive(motion, ms) {
      ready();
      const before = sim.bodyCheckpoint.motion();
      if (!motion || Object.keys(before).some(k => !Object.is(before[k], motion[k]))) bad();
      try { sim.bodyCheckpoint.stepPassive(ms); return sim.bodyCheckpoint.motion(); }
      catch (error) { invalid = true; throw error; }
    },
    // Only physical continuity. Health, AI, RNG, timers, paths and animation
    // start from source defaults; there is no generic actor-state serialization.
    capture() { ready(); return pack.pack({ v: 3, world, baseline, body: bridge.bodyState() }); },
    // Only the authoritative host may defer a vanished-footing correction to
    // its next passive step. Source capture/live activation refuse until then.
    restore(saved, { passive = false } = {}) {
      ready();
      try {
        if (typeof passive !== "boolean") bad();
        if (restored || bridge.capture()[0] !== 0 || sim.player) bad();
        const state = records.read(saved);
        bridge.restoreBody(state.body, passive); if (!sim.player) bad(); restored = true; return true;
      }
      catch (error) { invalid = true; throw error; }
    },
  };
}

function createCheckpoint(sim, world, rigCodec, bridge, budget, logical = false) {
  const entries = sim.list;
  if (!bridge || bridge.capture()[0] !== 0 || !logical && (!rigCodec?.packRoster || !rigCodec?.unpackRoster)) bad();
  const identity = logical ? e => e.owner.traits.name : e => e.owner.id;
  const ids = entries.map(identity), referenced = [...entries, ...(logical ? bridge.references() : [])];
  if (new Set(referenced).size !== referenced.length || referenced.length > entries.length + 256) bad();
  const references = new Map(referenced.map((e, i) => [e, i]));
  const omitted = logical ? new Set([...excluded, "animation", "fireFX"]) : excluded;
  const fixedPaths = logical && entries.every(e => e.pathing != null);
  if (entries.some(e => e.pathing != null) && !fixedPaths) bad();
  const pathValid = e => {
    if (!fixedPaths) return;
    const p = e.pathing, coordinate = n => Number.isFinite(n) && Math.abs(n) <= 10000;
    if (!p || Object.keys(p).sort().join() !== "count,index,laneX,laneZ,plans,targetX,targetZ,tx,tz,version"
      || !Number.isSafeInteger(p.version) || p.version > -1 || p.version < -Number.MAX_SAFE_INTEGER
      || !Number.isSafeInteger(p.plans) || p.plans < 0
      || !Number.isInteger(p.count) || p.count < 0 || p.count > CLANKER_FIXED_PATH_CAPACITY
      || !Number.isInteger(p.index) || p.index < 0 || p.index > p.count
      || ![p.targetX, p.targetZ].every(coordinate)
      || ![p.tx, p.tz].every(n => Number.isNaN(n) || coordinate(n))
      || ![p.laneX, p.laneZ].every(a => ArrayBuffer.isView(a) && a.length === CLANKER_FIXED_PATH_CAPACITY
        && a.every(coordinate))) bad();
  };
  const buffers = createClankerBufferCheckpoint(world, ids, identity, fixedPaths), pack = createCheckpointPack(budget, { intern: true });
  const rigs = logical ? null : entries.map(e => e.gorilla.createManagedCheckpoint(world));
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
    if (value.length === 2 && value[0] === 0 && Number.isInteger(value[1]) && value[1] >= 0 && value[1] < referenced.length)
      return referenced[value[1]];
    bad();
  };
  const fields = [];
  // Compile only the freshly constructed local source layout, never a schema
  // from storage. A changed layout/default/world boot changes the baseline.
  const compile = (value, path = []) => {
    const name = path.join(".");
    // Full-Hub support queries populate these rectangle samples lazily. They
    // are derived collision/pose scratch, rebuilt by finishRecovery, not job
    // state. Do not compile an incomplete first-actor rectangle into the schema.
    if (bufferFields.has(name) || logical && name === "motion.groundRects") return { buffer: true };
    if (path.length && (value === null || typeof value !== "object" || references.has(value))) {
      if (fields.length >= 700 || path.length > 6) bad();
      const field = { path, kind: value === missing ? "optional" : value === null || references.has(value) ? "reference" : typeof value };
      const index = fields.length; fields.push(field); return { index };
    }
    if (!value || Array.isArray(value) || ArrayBuffer.isView(value) || path.length > 6) bad();
    const keys = Object.keys(value).filter(k => path.length || !omitted.has(k));
    if (name === "motion" && !keys.includes("walkGait")) keys.push("walkGait");
    if (keys.length > 128 || keys.some(k => ["__proto__", "prototype", "constructor"].includes(k))) bad();
    return { keys, children: keys.map(k => compile(Object.hasOwn(value, k) ? value[k] : missing, [...path, k])) };
  };
  const shape = compile(entries[0]);
  const compatible = (field, value) => field.kind === "optional" ? value === missing || typeof value === "string" && value.length <= 80
    : field.kind === "reference" ? value === null || references.has(value) : typeof value === field.kind;
  const values = entry => {
    pathValid(entry);
    const out = [];
    const walk = (value, node, root = false) => {
      if (node.buffer) return;
      if (node.index !== undefined) {
        if (!compatible(fields[node.index], value)) bad(); out[node.index] = token(value); return;
      }
      if (!value || typeof value !== "object") bad();
      const keys = Object.keys(value).filter(k => !root || !omitted.has(k));
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
  let invalid = false, restored = false, pendingRebuild = false;
  const ready = () => { if (invalid) bad(); };
  return {
    capture() {
      ready(); if (pendingRebuild) bad();
      const clocks = Array.from(bridge.capture());
      if (!equal(staticState, Array.from(bridge.baseline()))) bad();
      const actors = entries.map((e, i) => {
        const word = e.random?.capture?.();
        if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) bad();
        const row = [word], current = values(e);
        for (let j = 0; j < fields.length; j++) if (!equal(current[j], defaults[i][j])) row.push(j, current[j]);
        return row;
      });
      return pack.pack({ v: logical ? 2 : 1, world, baseline, clocks, actors, buffers: buffers.capture(entries),
        rigs: logical ? entries.map(e => [e.root.position.x, e.root.position.y, e.root.position.z, e.root.visible])
          : structuredClone(rigCodec.packRoster(world, rigs.map((rig, index) => ({ index, snapshot: rig.capture() })), true)) });
    },
    restore(saved) {
      ready();
      // Restore into a fresh, disposable controller before it can publish or
      // step. If application fails, poison this adapter; discard the controller.
      if (restored || bridge.capture()[0] !== 0) bad();
      const state = pack.unpack(saved);
      if (Object.keys(state).sort().join() !== "actors,baseline,buffers,clocks,rigs,v,world" || state.v !== (logical ? 2 : 1)
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
      const arrays = buffers.restore(state.buffers), poses = logical ? state.rigs : rigCodec.unpackRoster(state.rigs);
      if (!dense(poses) || poses.length !== entries.length || (logical
        ? poses.some(p => !dense(p) || p.length !== 4 || p.slice(0, 3).some(n => !Number.isFinite(n) || Math.abs(n) >= 10000) || typeof p[3] !== "boolean")
        : poses.some((p, i) => p.index !== i))) bad();
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
        pathValid(e);
        e.random = decoded[i].random;
        if (logical) {
          const p = e.root.position; [p.x, p.y, p.z, e.root.visible] = poses[i];
        } else rigs[i].restore(poses[i].snapshot);
      }
      bridge.capture(); // Refuse a saved state outside this limited profile.
      restored = true; invalid = false; pendingRebuild = logical;
      return true;
    },
    ...(logical ? { finishRecovery() {
      ready(); if (!restored || !pendingRebuild) bad();
      invalid = true; bridge.rebuild(); bridge.capture();
      pendingRebuild = false; invalid = false;
    } } : {}),
  };
}
