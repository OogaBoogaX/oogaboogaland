import "../../src/js/clanker-flight.js";
const api = globalThis.BL.clankerFlight;
export const FLIGHT = Object.freeze({ checkpointBytes: 4096, maxSamples: 32, maxStep: .25 });
const keys = ["active", "progress", "reverse", "blocked", "duration", "fromX", "fromY", "fromZ", "toX", "toY", "toZ", "lift", "wall", "caveExit"];
const runtimeKeys = [...keys, "points"], flags = ["active", "reverse", "wall", "caveExit"];
const coordinates = ["fromX", "fromY", "fromZ", "toX", "toY", "toZ"];
const encoder = new TextEncoder();
const bad = () => { throw new Error("invalid Clanker flight checkpoint or adapter"); };
const finite = (v, limit = 10000) => Number.isFinite(v) && Math.abs(v) <= limit;
const exact = (v, names) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
const samplesOK = n => Number.isInteger(n) && n >= 2 && n <= FLIGHT.maxSamples;
const valid = j => flags.every(k => typeof j[k] === "boolean")
  && finite(j.progress, 1) && j.progress >= 0 && finite(j.blocked, 60) && j.blocked >= 0
  && finite(j.duration, 120) && j.duration >= (j.active ? .001 : 0)
  && finite(j.lift, 32) && j.lift >= 0 && coordinates.every(k => finite(j[k]));
const runtime = (j, samples) => {
  if (!exact(j, runtimeKeys) || !valid(j) || !(j.points instanceof Float64Array) || j.points.length !== (samples + 1) * 3) bad();
  for (let i = 0; i < j.points.length; i++) if (!finite(j.points[i])) bad();
};
export function createFlightState(samples) {
  if (!samplesOK(samples)) bad();
  return { active: false, progress: 0, reverse: false, blocked: 0, duration: 0,
    fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, lift: 0,
    wall: false, caveExit: false, points: new Float64Array((samples + 1) * 3) };
}

// Only e.jump belongs to this codec. Position, drive/gravity continuation,
// climb/captive state, reservations and work must commit in the enclosing world.
export function createFlightCheckpoint(world, samples) {
  if (typeof world !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(world) || !samplesOK(samples)) bad();
  return {
    capture(jump) {
      runtime(jump, samples);
      // points is preflight scratch: prepareJump writes point 0, then each
      // segment before its successor reads it. Flight and reservations read
      // from/to/lift instead. No scratch values are continuation state.
      const state = {};
      for (const k of keys) state[k] = jump[k];
      const saved = { v: 1, world, samples, jump: state };
      if (encoder.encode(JSON.stringify(saved)).byteLength > FLIGHT.checkpointBytes) bad();
      return saved;
    },
    restore(saved) {
      if (!exact(saved, ["v", "world", "samples", "jump"]) || saved.v !== 1 || saved.world !== world || saved.samples !== samples
        || !exact(saved.jump, keys) || !valid(saved.jump) || encoder.encode(JSON.stringify(saved)).byteLength > FLIGHT.checkpointBytes) bad();
      return { ...saved.jump, points: new Float64Array((samples + 1) * 3) };
    },
  };
}

export function createClankerFlight(adapters) {
  const callbacks = ["wallContactShare", "climbClear", "landing", "caveAt", "occupied", "staticClear", "rageCarrying", "attachContactWall"];
  const constants = ["MAX_JUMP", "ROOF_JUMP_HEIGHT", "AIR_RADIUS", "SPEED", "GRAVITY", "MOTION_RADIUS", "MOTION_HEIGHT"];
  if (!adapters || callbacks.some(k => typeof adapters[k] !== "function")
    || constants.some(k => !finite(adapters[k], k === "GRAVITY" ? 100 : 32) || adapters[k] < .01)
    || !samplesOK(adapters.JUMP_SAMPLES) || !finite(adapters.WALL_ENTER_SHARE, 1) || adapters.WALL_ENTER_SHARE <= 0
    || !["fireClear", "rageJumpPoseClear"].every(k => typeof adapters.ctx?.[k] === "function")) bad();
  const boolean = fn => (...args) => { const result = fn(...args); if (typeof result !== "boolean") bad(); return result; };
  const checked = { ...adapters, POINT: { x: 0, y: 0, z: 0 }, clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    ctx: { fireClear: boolean(adapters.ctx.fireClear), rageJumpPoseClear: boolean(adapters.ctx.rageJumpPoseClear) } };
  for (const k of callbacks) if (k !== "wallContactShare" && k !== "caveAt") checked[k] = boolean(adapters[k]);
  checked.wallContactShare = (...args) => { const v = adapters.wallContactShare(...args); if (!finite(v, 1) || v < 0) bad(); return v; };
  checked.caveAt = (...args) => { const v = adapters.caveAt(...args); if (!Number.isInteger(v) || v < -1 || v > 31) bad(); return v; };
  const controller = api.create(checked);
  const validate = e => {
    if (!e?.root?.position || ![e.root.position.x, e.root.position.y, e.root.position.z, e.heading, e.speed, e.rest, e.blocked].every(v => finite(v))
      || !finite(e.radius, 10) || e.radius <= 0 || !finite(e.height, 10) || e.height <= 0
      || !Number.isSafeInteger(e.jumps) || e.jumps < 0 || !e.drive || !e.motion || !e.rage || !e.climb) bad();
    runtime(e.jump, adapters.JUMP_SAMPLES);
  };
  return {
    prepareJump(e, x, y, z, lift = 0, vault = false, running = false, wall = false) {
      validate(e);
      if (![x, y, z].every(v => finite(v)) || !finite(lift, 32) || lift < 0
        || [vault, running, wall].some(v => typeof v !== "boolean")
        || running && Math.hypot(x - e.root.position.x, z - e.root.position.z) < .001) bad();
      const result = controller.prepareJump(e, x, y, z, lift, vault, running, wall);
      validate(e); return result;
    },
    updateJump(e, dt) {
      validate(e);
      if (!e.jump.active || !finite(dt, FLIGHT.maxStep) || dt <= 0) bad();
      controller.updateJump(e, dt); validate(e);
    },
  };
}
