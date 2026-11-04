import "../../src/js/npc-walker.js";

const api = globalThis.BL.npcWalker;
export const createWalkerState = api.createState;
export const WALKER = Object.freeze({ cells: api.NAV_SIZE, checkpointBytes: 32 * 1024, goalDistance: 64 });
const bad = () => { throw new Error("invalid NPC walker checkpoint"); };
const integer = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const finite = (n, bound = 10000) => Number.isFinite(n) && Math.abs(n) <= bound;
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
  && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const array = (v, size) => Array.isArray(v) && v.length <= size && Object.keys(v).length === v.length
  && Object.keys(v).every((k, i) => k === String(i));
const callbacks = ["playerBody", "gapClear", "npcWalkable", "groundAt", "inBananas", "shoulderNeighbor",
  "shoulderClear", "flyable", "walkerClear", "groundY", "shoulderStep", "standPose", "walkPose"];
const constants = ["SHOULDER_GAP", "OUTSIDE_GAP", "STEP", "SHOULDER_REACH", "JUMP_SPEED",
  "PLAYER_STEP", "NPC_PASS_REACH", "RUSH_SPEED"];

// All world, crowd and pose effects remain caller-owned and synchronous. This
// wrapper is for bounded simulation steps, not arbitrary original crew probes.
export function createNpcWalker(adapters) {
  if (!adapters || callbacks.some(k => typeof adapters[k] !== "function")
    || constants.some(k => !finite(adapters[k], 10) || adapters[k] <= 0)
    || adapters.PLAYER_STEP < .025 || adapters.PLAYER_STEP > .125
    || !finite(adapters.WALK?.gravity, 100) || adapters.WALK.gravity <= 0
    || !array(adapters.crewList, 128) || !adapters.ctx
    || ["outsideActors", "npcRecoveryDrop", "npcLandingAllowed", "npcHazardClear"].some(k => typeof adapters.ctx[k] !== "function")
    || !finite(adapters.ctx.outsideActorHeight, 10) || adapters.ctx.outsideActorHeight <= 0
    || adapters.ctx.npcPaths != null && typeof adapters.ctx.npcPaths.target !== "function") {
    throw new Error("NPC walker requires explicit simulation adapters");
  }
  const boolean = fn => (...args) => {
    const value = fn(...args);
    if (typeof value !== "boolean") throw new Error("invalid NPC walker decision");
    return value;
  };
  const number = fn => (...args) => {
    const value = fn(...args);
    if (!finite(value)) throw new Error("invalid NPC walker support");
    return value;
  };
  const synchronous = fn => (...args) => {
    const value = fn(...args);
    if (value && typeof value.then === "function") throw new Error("asynchronous NPC walker effect");
    return value;
  };
  const checked = { ...adapters, ctx: { ...adapters.ctx } };
  for (const k of ["playerBody", "gapClear", "npcWalkable", "inBananas", "shoulderNeighbor", "shoulderClear", "flyable", "walkerClear"]) checked[k] = boolean(adapters[k]);
  for (const k of ["groundAt", "groundY"]) checked[k] = number(adapters[k]);
  for (const k of ["standPose", "walkPose"]) checked[k] = synchronous(adapters[k]);
  for (const k of ["npcRecoveryDrop", "npcLandingAllowed", "npcHazardClear"]) checked.ctx[k] = boolean(adapters.ctx[k]);
  checked.ctx.outsideActors = () => {
    const bodies = adapters.ctx.outsideActors();
    if (!array(bodies, 128)) throw new Error("invalid NPC walker crowd");
    return bodies;
  };
  const continuation = (cave, allowReset = false) => {
    const p = cave.root.position, a = cave.avoidance, n = a.navigation;
    const near = (x, z) => finite(x) && finite(z) && Math.hypot(x - p.x, z - p.z) <= WALKER.goalDistance;
    // Existing work transitions invalidate tx before recoverWalker resets mode.
    // Only entry points that run that reset may accept the invalidated cache.
    const invalidated = allowReset && Number.isNaN(a.tx);
    if (!invalidated && ((n.mode || !Number.isNaN(a.tx)) && !near(a.tx, a.tz)
      || (n.mode === 1 || n.mode === 2) && !near(n.x, n.z)
      || n.mode === 4 && !near(n.jumpX, n.jumpZ))) throw new Error("invalid NPC walker continuation");
    const path = cave.pathing;
    if (path) {
      if (!integer(path.count, 0, 4096)) throw new Error("invalid NPC walker route");
      if (path.count && !near(path.targetX, path.targetZ)) throw new Error("invalid NPC walker route");
      for (let i = 0; i < path.count; i++) if (!near(path.laneX?.[i], path.laneZ?.[i])) throw new Error("invalid NPC walker route");
    }
  };
  if (adapters.ctx.npcPaths) {
    const target = synchronous(adapters.ctx.npcPaths.target);
    checked.ctx.npcPaths = { target(...args) { const result = target(...args); continuation(args[0], true); return result; } };
  }
  checked.shoulderStep = (...args) => {
    const moved = adapters.shoulderStep(...args), distance = args[3];
    if (moved !== -1 && moved !== 0 && !(finite(moved, distance) && moved >= Math.min(distance, 1e-8) && moved > 0)) {
      throw new Error("invalid NPC shoulder progress");
    }
    return moved;
  };
  const controller = api.create(checked);
  const goal = (cave, x, z, allowReset = false) => {
    const p = cave?.root?.position;
    if (!array(adapters.crewList, 128) || !p || ![x, z, p.x, p.y, p.z].every(n => finite(n)) || Math.hypot(x - p.x, z - p.z) > WALKER.goalDistance) {
      throw new Error("invalid NPC walker goal");
    }
    continuation(cave, allowReset);
  };
  const dt = n => { if (!finite(n, .25) || n < 0) throw new Error("invalid NPC walker step"); };
  return {
    recoverWalker(cave, x, z, seconds, usePath = false) {
      goal(cave, x, z, true); dt(seconds);
      if (typeof usePath !== "boolean") throw new Error("invalid NPC walker path flag");
      controller.recoverWalker(cave, x, z, seconds, usePath);
      continuation(cave);
    },
    walkToward(cave, x, z, distance) {
      goal(cave, x, z);
      if (!finite(distance, 1) || distance < 0) throw new Error("invalid NPC walker distance");
      return controller.walkToward(cave, x, z, distance);
    },
    walkWorkTo(cave, target, seconds, followPath = true) {
      goal(cave, target?.x, target?.z, true); dt(seconds);
      if (typeof followPath !== "boolean") throw new Error("invalid NPC walker path flag");
      return controller.walkWorkTo(cave, target, seconds, followPath);
    },
  };
}

const template = createWalkerState(0), keys = Object.keys(template), detourKeys = Object.keys(template.detour);
const bufferKeys = ["costs", "parents", "heights", "closed", "path"];
const navKeys = Object.keys(template.navigation).filter(k => !bufferKeys.includes(k));
const coordinates = ["tx", "tz", "goalX", "goalZ"];
const copyTop = (a, encode) => {
  const value = { ...a, detour: { ...a.detour } }; delete value.navigation;
  for (const k of coordinates) value[k] = encode ? Number.isNaN(a[k]) ? null : a[k] : a[k] === null ? NaN : a[k];
  for (const k of ["goalX", "goalZ"]) value.detour[k] = encode ? Number.isNaN(a.detour[k]) ? null : a.detour[k] : a.detour[k] === null ? NaN : a.detour[k];
  value.best = encode ? a.best === Infinity ? null : a.best : a.best === null ? Infinity : a.best;
  return value;
};
const optionalCoordinate = n => Number.isNaN(n) || finite(n);
const validTop = a => typeof a.active === "boolean" && [1, -1].includes(a.side)
  && finite(a.stalled, 1e9) && a.stalled >= -1 && (a.best === Infinity || finite(a.best, 1e6) && a.best >= 0)
  && coordinates.every(k => optionalCoordinate(a[k])) && integer(a.pathIndex, -1, 4095) && integer(a.pathVersion, -1, Number.MAX_SAFE_INTEGER)
  && exact(a.detour, detourKeys) && integer(a.detour.site, -1, 31) && integer(a.detour.phase, 0, 8)
  && [1, -1].includes(a.detour.side) && ["entryX", "x", "z"].every(k => finite(a.detour[k]))
  && ["goalX", "goalZ"].every(k => optionalCoordinate(a.detour[k]));
const validNav = n => integer(n.mode, 0, 4) && ["x", "z", "jumpX", "jumpZ", "clearance"].every(k => finite(n[k]))
  && ["searches", "expansions", "jumps"].every(k => integer(n[k], 0, Number.MAX_SAFE_INTEGER))
  && integer(n.jumpCandidate, 0, 8) && integer(n.count, 0, WALKER.cells)
  && integer(n.index, -1, Math.max(0, n.count - 1)) && ["double", "boosted", "moving"].every(k => typeof n[k] === "boolean")
  && (n.mode !== 1 || n.count === 0 && n.index === 0) && (n.mode !== 2 || n.count > 0 && n.index >= 0);

// Owns avoidance/search continuation ONLY. Root motion, work gait, progress
// backoff, traffic, surface routes, crowd/reservations, hop/leap and inventory
// must commit alongside it. Mode 4 requires the existing airborne integrator.
export function createWalkerCheckpoint(world) {
  if (typeof world !== "string" || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(world)) bad();
  const read = saved => {
    if (!exact(saved, ["v", "world", "avoidance"]) || saved.v !== 1 || saved.world !== world
      || !exact(saved.avoidance, keys) || !exact(saved.avoidance.detour, detourKeys)) bad();
    const a = saved.avoidance, n = a.navigation;
    // Null is the only wire sentinel. Nonfinite input must never masquerade as
    // the original NaN target or Infinity best-distance cache.
    if (![...coordinates.map(k => a[k]), a.detour.goalX, a.detour.goalZ, a.best].every(v => v === null || finite(v, 1e6))
      || !validTop(copyTop(a, false)) || !exact(n, [...navKeys, "entries", "path"]) || !validNav(n)
      || !array(n.entries, WALKER.cells) || !array(n.path, WALKER.cells) || n.path.length !== n.count) bad();
    const entries = new Map(); let prior = -1;
    for (const e of n.entries) {
      if (!array(e, 5) || e.length !== 5 || !integer(e[0], 0, WALKER.cells - 1) || e[0] <= prior
        || !finite(e[1], 1e6) || e[1] < 0 || Math.fround(e[1]) !== e[1]
        || !integer(e[2], -1, WALKER.cells - 1) || !finite(e[3]) || Math.fround(e[3]) !== e[3]
        || ![0, 1].includes(e[4])) bad();
      prior = e[0]; entries.set(e[0], e);
    }
    const searching = n.mode === 1 || n.mode === 2;
    if (searching) {
      const center = (WALKER.cells - 1) / 2, root = entries.get(center);
      if (!root || root[1] !== 0 || root[2] !== -1) bad();
      // Strictly decreasing costs make a cyclic parent chain impossible; the
      // original reconstruction loop must never hang on a corrupt checkpoint.
      for (const [i, e] of entries) if (i !== center) {
        const parent = entries.get(e[2]);
        if (!parent || parent[1] >= e[1]) bad();
      }
      if (n.mode === 2) for (let i = 0; i < n.path.length; i++) {
        const e = entries.get(n.path[i]);
        if (!e || n.path[i] === center || e[2] !== (i + 1 < n.path.length ? n.path[i + 1] : center)) bad();
      }
    } else if (entries.size) bad();
    if (!n.path.every(i => integer(i, 0, WALKER.cells - 1)) || new Set(n.path).size !== n.path.length
      || new TextEncoder().encode(JSON.stringify(saved)).length > WALKER.checkpointBytes) bad();
    const out = createWalkerState(0); Object.assign(out, copyTop(a, false));
    const nav = out.navigation;
    for (const k of navKeys) nav[k] = n[k];
    nav.costs.fill(Infinity); nav.parents.fill(-1);
    for (const e of entries.values()) { nav.costs[e[0]] = e[1]; nav.parents[e[0]] = e[2]; nav.heights[e[0]] = e[3]; nav.closed[e[0]] = e[4]; }
    nav.path.set(n.path);
    return out;
  };
  return {
    capture(a) {
      if (!exact(a, keys) || !validTop(a) || !exact(a.navigation, [...navKeys, ...bufferKeys]) || !validNav(a.navigation)) bad();
      const n = a.navigation;
      if (!(n.costs instanceof Float32Array) || !(n.parents instanceof Int16Array) || !(n.heights instanceof Float32Array)
        || !(n.closed instanceof Uint8Array) || !(n.path instanceof Int16Array) || bufferKeys.some(k => n[k].length !== WALKER.cells)) bad();
      const nav = Object.fromEntries(navKeys.map(k => [k, n[k]])); nav.entries = []; nav.path = Array.from(n.path.subarray(0, n.count));
      if (n.mode === 1 || n.mode === 2) for (let i = 0; i < WALKER.cells; i++) {
        if (Number.isFinite(n.costs[i])) nav.entries.push([i, n.costs[i], n.parents[i], n.heights[i], n.closed[i]]);
        else if (n.costs[i] !== Infinity || n.closed[i]) bad();
      }
      const saved = { v: 1, world, avoidance: { ...copyTop(a, true), navigation: nav } };
      read(saved); return saved;
    },
    restore: read,
  };
}
