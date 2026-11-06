import { createClankerFlight, createFlightState, createFlightCheckpoint } from "../../src/clanker-flight.js";
import { prepare as prepareWalker } from "./npc-walker-fixture.mjs";
export const world = "clanker-flight-fixture-1", codec = createFlightCheckpoint(world, 20);
export const constants = { MAX_JUMP: 8.5, ROOF_JUMP_HEIGHT: 7.5, WALL_ENTER_SHARE: .25,
  AIR_RADIUS: 2.05, SPEED: 2.7, GRAVITY: 9.8, MOTION_RADIUS: 2.25, MOTION_HEIGHT: 2.8, JUMP_SAMPLES: 20 };
export function initial() {
  return { root: { position: { x: -4, y: 0, z: -4 } }, heading: Math.PI / 2, speed: 0, rest: 0, blocked: 0,
    radius: 1.9, height: 2.2, compact: true, jumps: 0, controlled: false, rageTraversal: false, phase: "chill", site: 0,
    motion: { lab: false, dragging: false, takeoff: 0 }, rage: { active: false }, climb: { airAttachAfter: 0, fromTop: false },
    drive: { vx: 0, vy: 0, vz: 0, airborne: false, resume: false, motionEnvelope: false, passiveFall: false,
      grounded: true, motionRecover: 0, wallRelease: false }, jump: createFlightState(20) };
}
export function capture(entry) {
  const saved = structuredClone(entry); saved.jump = codec.capture(entry.jump);
  saved.climb.airAttachAfter = entry.climb.airAttachAfter === Infinity ? null : entry.climb.airAttachAfter;
  return saved;
}
export function restore(saved) {
  const entry = structuredClone(saved); entry.jump = codec.restore(saved.jump);
  entry.climb.airAttachAfter = saved.climb.airAttachAfter === null ? Infinity : saved.climb.airAttachAfter;
  return entry;
}
export async function prepare(create = createClankerFlight) {
  const f = await prepareWalker(), mesh = f.catalog.create();
  const control = { blocked: false, reverseOnly: false, fireClear: true, attach: false, poseClear: true, calls: 0, failAt: 0 };
  const adapters = { ...constants,
    ctx: { fireClear: () => control.fireClear, rageJumpPoseClear: () => control.poseClear },
    wallContactShare: () => .5, climbClear: () => true, caveAt: () => -1,
    landing: (x, y, z) => Math.abs(mesh.supportAt(x, z, y + .01, .52, .3) - y) < .05,
    occupied: () => false, rageCarrying: e => !!(e.rage.active && e.motion.dragging),
    attachContactWall: e => { if (control.attach) e.climb.fromTop = true; return control.attach; },
    staticClear(e, x, y, z, nx = x, ny = y, nz = z) {
      control.calls++;
      return !control.blocked && control.calls !== control.failAt && !(control.reverseOnly && nx > x)
        && mesh.segmentClear(x, y + .01, z, nx, ny + .01, nz, e.radius, e.height);
    } };
  return { mesh, control, adapters, controller: create({ ...adapters, POINT: { x: 0, y: 0, z: 0 }, clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)) }) };
}
