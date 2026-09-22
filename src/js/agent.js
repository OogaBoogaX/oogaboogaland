// The Agent: a voxel gorilla in little black shades. Outside the Matrix it is a
// plain dark ape; inside the Matrix and in the games its true nature shows, one
// voxel map drawn in glowing code green. It knuckle-walks, gallops on all fours
// and sometimes walks hunched on its hind legs.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { makeVox, voxelGeometry, cached } = BL.models;
  const { createNode, addChild, removeChild, updateLocal, boundsOf } = BL.scene;
  const { damp, clamp, mulberry32, fnv1a, mat4 } = BL.math;
  const U = 0.086;
  // Hip height, torso length, the shoulder on the chest, and the arm: the knuckles
  // reach the ground when the chest leans QUAD forward (8 + 11 cos 1.0 = 13.9 ≈ 14).
  const HIP = 8 * U, SHOULDER_Y = 11 * U, SHOULDER_X = 6 * U, NECK_Y = 10.5 * U;
  const QUAD = 1.0, HUNCH = 0.5, REAR = 0.12;
  // Palette slots, shared by both forms
  const C = { body: 0, bodyDk: 1, hide: 2, hideDk: 3, pad: 4, groove: 5, dash: 6, shades: 7, eye: 8, silver: 9, nostril: 10, brow: 11 };
  const APE = ["#2b2724", "#1d1a18", "#56504b", "#46403c", "#3d3834", "#161412", "#2b2724", "#070707", "#2a1a0e", "#8b8681", "#0e0d0c", "#3a3531"];
  const CODE = ["#0f5a22", "#093a15", "#6dff8c", "#48d864", "#a4ffb4", "#08300f", "#3dff66", "#070707", "#e6ffea", "#5cf07c", "#062a0d", "#86ffa0"];
  const CODE_GLOW = { [C.body]: 0.12, [C.bodyDk]: 0.05, [C.hide]: 0.6, [C.hideDk]: 0.45, [C.pad]: 0.85, [C.dash]: 1, [C.eye]: 1, [C.silver]: 0.55, [C.brow]: 0.6 };
  // Per gait: chest lean, limb swing, then a roaming and a driven pair of ground
  // speed (m/s) and stride per cycle (m). Driven it keeps up with an Ooga
  // (pilot.WALK.speed) and the gallop outruns one; roaming it ambles.
  const WALK_SPEED = BL.pilot.WALK.speed;
  const GAITS = {
    idle: { pitch: QUAD, speed: 0, stride: 1, drive: 0, driveStride: 1, legs: 0, arms: 0 },
    knuckle: { pitch: QUAD, speed: 0.9, stride: 0.9, drive: WALK_SPEED, driveStride: 2.4, legs: 0.45, arms: 0.4 },
    gallop: { pitch: 0.95, speed: 3.4, stride: 1.6, drive: WALK_SPEED * 1.5, driveStride: 3.6, legs: 0.75, arms: 0.7 },
    hunch: { pitch: HUNCH, speed: 0.75, stride: 0.7, drive: WALK_SPEED, driveStride: 2.2, legs: 0.5, arms: 0.35 },
    upright: { pitch: 0.16, speed: 0.9, stride: 1.2, drive: WALK_SPEED, driveStride: 2.4, legs: 0.48, arms: 0.24 },
    beat: { pitch: REAR, speed: 0, stride: 1, drive: 0, driveStride: 1, legs: 0, arms: 0 }
  };
  // Cycle offsets: a four-beat walk, a bound (pairs half a cycle apart), a biped walk
  const OFFSETS = {
    knuckle: { legL: 0, armL: 0.25, legR: 0.5, armR: 0.75 },
    gallop: { legL: 0, legR: 0.08, armL: 0.5, armR: 0.58 },
    hunch: { legL: 0, armR: 0, legR: 0.5, armL: 0.5 },
    upright: { legL: 0, armR: 0, legR: 0.5, armL: 0.5 }
  };
  const LIMBS = [{ leg: "legL", arm: "armL", side: -1 }, { leg: "legR", arm: "armR", side: 1 }];
  const BEAT_TIME = 1.6;
  const POUND_TIME = 0.64, CHEW_TIME = 0.44, MANAGED_BEAT_TIME = 1.2;
  const MANAGED_MOTION_RADIUS = 2.25, MANAGED_MOTION_HEIGHT = 2.8;
  const MANAGED_SMASH_RADIUS = 2.9;
  const TAU = Math.PI * 2;
  const wave = (phase, offset) => Math.sin(TAU * (phase + offset));
  const QUAD_RADIUS = 0.85, QUAD_CENTERS = [0.05, 0.7, 1.35];
  const POUND_RADIUS = 0.875, POUND_CENTERS = [0.05, 0.8, 1.6];
  const STAND_RADIUS = 0.825, STAND_CENTER = 0.19;
  const PARK_RADIUS = 0.72, PARK_CENTER = 0.06;
  const SIT_RADIUS = 0.9, SIT_CENTERS = [-0.12, 0.55];
  // Three overlapping longitudinal cylinders enclose the complete quadruped,
  // including its knuckles, without reserving a four-metre-wide turning circle
  // while it walks straight. Each smaller pose profile is used only once the
  // current rig actually fits; transitions retain the complete radial envelope.
  const footprintProfile = (entry) => !entry.compact ? 0 : entry.footprintMode === "sit" ? entry.gorilla.sitCompact ? 5 : 0 : entry.footprintMode === "park" ? entry.gorilla.parkCompact ? 4 : 0
    : entry.footprintMode === "stand" ? entry.gorilla.standCompact ? 3 : 0
    : entry.footprintMode === "pound" ? entry.gorilla.poundCompact ? 2 : 0 : entry.gorilla.compact ? 1 : 0;
  const footprintCount = (entry) => { const profile = footprintProfile(entry); return profile === 5 ? 2 : profile === 1 || profile === 2 ? 3 : 1; };
  const footprintRadius = (entry) => {
    const profile = footprintProfile(entry);
    return profile ? (profile === 5 ? SIT_RADIUS : profile === 4 ? PARK_RADIUS : profile === 3 ? STAND_RADIUS : profile === 2 ? POUND_RADIUS : QUAD_RADIUS) * entry.root.scale.x
      : Math.max(entry.radius, entry.gorilla.bodyRadius);
  };
  const footprintOffset = (entry, index) => {
    const profile = footprintProfile(entry);
    return profile ? (profile === 5 ? SIT_CENTERS[index] : profile === 4 ? PARK_CENTER : profile === 3 ? STAND_CENTER : (profile === 2 ? POUND_CENTERS : QUAD_CENTERS)[index]) * entry.root.scale.x : 0;
  };
  const footprintOverlaps = (a, ax, ay, az, ah, b, bx, by, bz, bh, margin = 0) => {
    if (ay >= by + b.height || ay + a.height <= by) return false;
    const radius = footprintRadius(a) + footprintRadius(b) + margin, r2 = radius * radius;
    const as = Math.sin(ah), ac = Math.cos(ah), bs = Math.sin(bh), bc = Math.cos(bh);
    for (let i = 0; i < footprintCount(a); i++) {
      const ao = footprintOffset(a, i);
      for (let j = 0; j < footprintCount(b); j++) {
        const bo = footprintOffset(b, j), dx = ax + as * ao - bx - bs * bo, dz = az + ac * ao - bz - bc * bo;
        if (dx * dx + dz * dz < r2) return true;
      }
    }
    return false;
  };
  const footprintCircleOverlaps = (entry, x, y, z, heading, ox, oy, oz, radius, height, margin = 0) => {
    if (y >= oy + height || y + entry.height <= oy) return false;
    const r = footprintRadius(entry) + radius + margin, sine = Math.sin(heading), cosine = Math.cos(heading);
    for (let i = 0; i < footprintCount(entry); i++) {
      const offset = footprintOffset(entry, i), dx = x + sine * offset - ox, dz = z + cosine * offset - oz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
  // An expanded pose can leave two conservative capsules overlapping even when
  // their meshes are apart. Allow an escape only when every overlapping pair
  // separates throughout the move and no other pair is entered. Test the limb
  // centres, including their turning arcs, rather than just the two roots.
  const separatingPair = (x, z, vx, vz, heading, turn, offset, ox, oz, radius) => {
    const sx = x + Math.sin(heading) * offset - ox, sz = z + Math.cos(heading) * offset - oz;
    const ex = x + vx + Math.sin(heading + turn) * offset - ox, ez = z + vz + Math.cos(heading + turn) * offset - oz;
    const start2 = sx * sx + sz * sz, r2 = radius * radius, overlap = start2 < r2;
    if (overlap && ex * ex + ez * ez <= start2 + 1e-9) return false;
    if (Math.abs(turn * offset) < 1e-9) {
      const dot = sx * vx + sz * vz;
      if (overlap) return dot >= -1e-9;
      const length2 = vx * vx + vz * vz, t = length2 ? clamp(-dot / length2, 0, 1) : 0;
      return (sx + vx * t) ** 2 + (sz + vz * t) ** 2 >= r2 - 1e-9;
    }
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.06)), half = 0.5 / steps;
    const speed = Math.hypot(vx, vz) + Math.abs(offset * turn), acceleration = Math.abs(offset) * turn * turn;
    for (let i = 0; i < steps; i++) {
      const a = i / steps, b = (i + 1) / steps, mid = (a + b) * 0.5;
      if (overlap) {
        const angle = heading + turn * mid, sine = Math.sin(angle), cosine = Math.cos(angle);
        const rx = x + vx * mid + sine * offset - ox, rz = z + vz * mid + cosine * offset - oz;
        const derivative = rx * (vx + cosine * offset * turn) + rz * (vz - sine * offset * turn);
        const bound = speed * speed + (Math.hypot(rx, rz) + speed * half) * acceleration;
        // This bounds the derivative of squared distance across the interval,
        // including the curved part between the two sampled headings.
        if (derivative - bound * half < -1e-9) return false;
      } else {
        const ax = x + vx * a + Math.sin(heading + turn * a) * offset - ox;
        const az = z + vz * a + Math.cos(heading + turn * a) * offset - oz;
        const dx = x + vx * b + Math.sin(heading + turn * b) * offset - ox - ax;
        const dz = z + vz * b + Math.cos(heading + turn * b) * offset - oz - az;
        const length2 = dx * dx + dz * dz, t = length2 ? clamp(-(ax * dx + az * dz) / length2, 0, 1) : 0;
        const reach = radius + Math.abs(offset) * (1 - Math.cos(turn / steps * 0.5));
        if ((ax + dx * t) ** 2 + (az + dz * t) ** 2 < reach * reach - 1e-9) return false;
      }
    }
    return true;
  };
  const footprintSeparates = (a, ax, ay, az, ah, nx, ny, nz, nh, b, bx, by, bz, bh, margin = 0) => {
    if (Math.min(ay, ny) >= by + b.height || Math.max(ay, ny) + a.height <= by) return true;
    // A new vertical contact is not an escape from an existing overlap.
    if (ay >= by + b.height || ay + a.height <= by) return false;
    const turn = Math.atan2(Math.sin(nh - ah), Math.cos(nh - ah));
    const radius = footprintRadius(a) + footprintRadius(b) + margin, bs = Math.sin(bh), bc = Math.cos(bh);
    for (let i = 0; i < footprintCount(a); i++) for (let j = 0; j < footprintCount(b); j++) {
      const bo = footprintOffset(b, j);
      if (!separatingPair(ax, az, nx - ax, nz - az, ah, turn, footprintOffset(a, i), bx + bs * bo, bz + bc * bo, radius)) return false;
    }
    return true;
  };
  const footprintCircleSeparates = (entry, x, y, z, heading, nx, ny, nz, nh, ox, oy, oz, radius, height, margin = 0) => {
    if (Math.min(y, ny) >= oy + height || Math.max(y, ny) + entry.height <= oy) return true;
    if (y >= oy + height || y + entry.height <= oy) return false;
    const turn = Math.atan2(Math.sin(nh - heading), Math.cos(nh - heading)), reach = footprintRadius(entry) + radius + margin;
    for (let i = 0; i < footprintCount(entry); i++) {
      if (!separatingPair(x, z, nx - x, nz - z, heading, turn, footprintOffset(entry, i), ox, oz, reach)) return false;
    }
    return true;
  };
  const footprintSweep = (entry, x, y, z, toX, toY, toZ, radius, height, fromHeading, toHeading, test, ignore) => {
    if (!entry || !footprintProfile(entry)) return test(x, y, z, toX, toY, toZ, radius, height, entry, ignore);
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.12)), angle = turn / steps;
    for (let step = 0; step < steps; step++) {
      const a = step / steps, b = (step + 1) / steps, first = fromHeading + turn * a, last = fromHeading + turn * b;
      for (let i = 0; i < footprintCount(entry); i++) {
        const offset = footprintOffset(entry, i), arc = Math.abs(offset) * (1 - Math.cos(angle * 0.5));
        if (!test(x + (toX - x) * a + Math.sin(first) * offset, y + (toY - y) * a, z + (toZ - z) * a + Math.cos(first) * offset,
          x + (toX - x) * b + Math.sin(last) * offset, y + (toY - y) * b, z + (toZ - z) * b + Math.cos(last) * offset,
          footprintRadius(entry) + arc, height, entry, ignore)) return false;
      }
    }
    return true;
  };
  const footprint = { count: footprintCount, radius: footprintRadius, offset: footprintOffset,
    overlaps: footprintOverlaps, circleOverlaps: footprintCircleOverlaps, separates: footprintSeparates,
    circleSeparates: footprintCircleSeparates, sweep: footprintSweep };

  const jitter = (rand, base, dark, p) => () => rand() < p ? dark : base;
  // Columns of lit code run down the fur: every fourth column, two cells on, one off.
  const codeDashes = (v) => {
    for (const [key, c] of v.map) {
      if (c !== C.body && c !== C.bodyDk) continue;
      const [x, y, z] = key.split(",").map(Number);
      const hash = (Math.imul(x + 64, 73856093) ^ Math.imul(z + 64, 19349663)) >>> 0;
      if (hash % 4 === 0 && (y + hash % 3) % 3 !== 0) v.map.set(key, C.dash);
    }
    return v;
  };
  const legVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 3, 2, 7, 0, 3, fur);
    v.fill(-1, 4, 5, 7, -1, 4, fur);
    // A lit foot pad split into toes on its front
    v.fill(0, 3, 0, 1, 0, 5, C.pad);
    for (const x of [1, 3]) v.fill(x, x, 0, 1, 5, 5, C.groove);
    return codeDashes(v);
  };
  const armVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 3, 8, 13, 0, 3, fur);
    // Heavy forearms over knuckle pads with dark grooves between the fingers
    v.fill(-1, 4, 2, 7, -1, 4, fur);
    v.fill(-1, 4, 0, 1, 0, 4, C.pad);
    for (const x of [0, 2]) v.fill(x, x, 0, 1, 4, 4, C.groove);
    v.fill(-1, 4, 2, 2, 4, 4, C.hideDk);
    return codeDashes(v);
  };
  const torsoVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(1, 8, 0, 2, 1, 5, fur);
    v.fill(0, 9, 3, 11, 0, 6, fur);
    // The pale chest plate on the front, the silver back and shoulder mounds on top
    v.fill(2, 7, 3, 9, 6, 6, jitter(rand, C.hide, C.hideDk, 0.25));
    v.fill(3, 6, 2, 2, 5, 5, C.hideDk);
    v.fill(1, 8, 10, 11, 0, 2, C.silver);
    for (const [x0, x1] of [[-2, 1], [8, 11]]) {
      v.fill(x0, x1, 8, 12, 1, 5, fur);
      v.fill(x0, x1, 12, 12, 1, 5, C.silver);
      v.fill(x0, x1, 10, 11, 5, 5, C.silver);
    }
    return codeDashes(v);
  };
  const headVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 6, 0, 6, 0, 5, fur);
    // The sagittal crest, ears and a heavy brow
    v.fill(2, 4, 7, 8, 0, 3, fur);
    v.fill(3, 3, 9, 9, 1, 2, C.silver);
    v.set(-1, 4, 2, C.body);
    v.set(7, 4, 2, C.body);
    v.fill(0, 6, 5, 5, 6, 6, C.brow);
    // Face, muzzle and nostrils
    v.fill(1, 5, 0, 4, 5, 5, C.hide);
    v.fill(1, 5, 0, 2, 6, 7, jitter(rand, C.hide, C.hideDk, 0.2));
    v.set(2, 2, 7, C.nostril);
    v.set(4, 2, 7, C.nostril);
    // Eyes just above the little black shades
    for (const x of [1, 2, 4, 5]) v.set(x, 4, 5, C.eye);
    v.fill(0, 6, 3, 3, 6, 6, C.shades);
    v.set(0, 3, 5, C.shades);
    v.set(6, 3, 5, C.shades);
    return v;
  };
  const feedingHeadVox = (rand) => {
    const v = headVox(rand);
    // The separate jaw fills this recess at rest. Articulating it never deforms
    // or rebuilds the shared head geometry, and walking leaves the mouth shut.
    for (let x = 1; x <= 5; x++) for (let y = 0; y <= 1; y++) for (let z = 6; z <= 7; z++) v.map.delete(`${x},${y},${z}`);
    v.fill(1, 5, 0, 1, 5, 5, C.nostril);
    return v;
  };
  const jawVox = () => {
    const v = makeVox();
    v.fill(0, 4, 0, 1, 0, 1, C.hide);
    v.fill(0, 4, 0, 0, 1, 1, C.hideDk);
    return v;
  };
  // One voxel map per part, two palettes: ape and code.
  const geometries = cached(() => {
    const part = (name, build, origin) => {
      const v = build(mulberry32(fnv1a(`agent/${name}`)));
      return {
        ape: voxelGeometry(v, { unit: U, palette: APE, origin }),
        code: voxelGeometry(v, { unit: U, palette: CODE, origin, emissive: CODE_GLOW })
      };
    };
    return {
      legL: part("legL", legVox, { x: -2 * U, y: -8 * U, z: -2 * U }),
      legR: part("legR", legVox, { x: -2 * U, y: -8 * U, z: -2 * U }),
      armL: part("armL", armVox, { x: -2 * U, y: -14 * U, z: -2 * U }),
      armR: part("armR", armVox, { x: -2 * U, y: -14 * U, z: -2 * U }),
      torso: part("torso", torsoVox, { x: -5 * U, y: 0, z: -3.5 * U }),
      head: part("head", headVox, { x: -3.5 * U, y: 0, z: -2 * U }),
      feedingHead: part("head", feedingHeadVox, { x: -3.5 * U, y: 0, z: -2 * U }),
      jaw: part("jaw", jawVox, { x: -2.5 * U, y: -U, z: 0 })
    };
  });
  const PART_NAMES = ["legL", "legR", "torso", "armL", "armR", "head"];

  // A step may climb at most STEP_UP and drop at most STEP_DOWN, so walls and
  // cliff edges stop the Agent instead of lifting it or dropping it off the island.
  // BODY is what it needs overhead, so it is barred by the same rock and props an Ooga is.
  const STEP_UP = 0.6, STEP_DOWN = 1.2, BODY = 13 * U;
  const GRAVITY = 9.8, JUMP_SPEED = 4.4, REVEAL_TIME = 9;
  // A click this soon after taking the Agent was the third of a triple: a look, not a drive.
  const TRIPLE_MS = 500;
  // groundAt(x, z) is the walking surface; walkable(fromX, fromZ, toX, toZ, y, height),
  // when given, is the scene's own swept test, the one its Oogas walk by, and bounds
  // every step the Agent takes. A walk is a list of { x, z } waypoints.
  const create = ({ groundAt, walkable = null, form = "ape", x = 0, z = 0, heading = 0, managed = false, scale = 1 }) => {
    const geos = geometries();
    const root = createNode({ position: { x, y: groundAt(x, z), z }, rotation: { x: 0, y: heading, z: 0 }, scale: { x: scale, y: scale, z: scale } });
    // The renderers draw the Agent's own palette inside the Matrix instead of repainting it.
    root.matrixNative = true;
    const hips = createNode({ position: { x: 0, y: HIP, z: 0 } });
    const chest = createNode({ rotation: { x: QUAD, y: 0, z: 0 } });
    const parts = {
      legL: createNode({ position: { x: -3 * U, y: 0, z: 0 } }),
      legR: createNode({ position: { x: 3 * U, y: 0, z: 0 } }),
      torso: chest,
      armL: createNode({ position: { x: -SHOULDER_X, y: SHOULDER_Y, z: 0.5 * U } }),
      armR: createNode({ position: { x: SHOULDER_X, y: SHOULDER_Y, z: 0.5 * U } }),
      head: createNode({ position: { x: 0, y: NECK_Y, z: 1.5 * U } })
    };
    addChild(chest, parts.armL, parts.armR, parts.head);
    if (managed) {
      parts.jaw = createNode({ position: { x: 0, y: U, z: 4 * U } });
      addChild(parts.head, parts.jaw);
      parts.armL.rotation.x = parts.armR.rotation.x = -QUAD;
      parts.head.rotation.x = -QUAD * 0.85;
    }
    addChild(hips, parts.legL, parts.legR, chest);
    addChild(root, hips);
    const state = {
      form: null, gait: "idle", walkGait: "knuckle", phase: 0, speed: 0, backwards: false, pitch: QUAD, heading,
      route: null, routeIndex: 0, idleFor: 1 + Math.random() * 2, gaitFor: 0, beat: 0,
      pace: null, driven: false, walkStyle: "knuckle", inX: 0, inZ: 0, inRun: false,
      vy: 0, air: false, revealFor: 0, pound: 0, chewing: 0, biped: false, lounge: "", hipHeight: HIP,
      charge: 0, takeoff: 0, landing: 0, crouch: 0, roll: 0, rollBlend: 0, rollAngle: 0, rollTarget: 0,
      smash: false, hipOffsetZ: 0, sideAngle: 0,
      climb: 0, climbBlend: 0, climbStride: 0, climbDirection: 0, mantle: 0,
      groom: 0, groomBlend: 0, groomSide: 1, groomTime: 0
    };
    const rollQuaternion = managed ? new Float32Array([0, 0, 0, 1]) : null;
    const setForm = (next) => {
      if (state.form === next) return;
      state.form = next;
      for (const name of PART_NAMES) parts[name].geometry = geos[managed && name === "head" ? "feedingHead" : name][next];
      if (managed) parts.jaw.geometry = geos.jaw[next];
    };
    setForm(form);
    const setGait = (gait) => {
      if (!GAITS[gait]) throw new Error(`agent: unknown gait ${gait}`);
      state.gait = gait;
      if (gait === "knuckle" || gait === "gallop" || gait === "hunch") state.walkGait = gait;
    };
    // A walk along waypoints; gallop for long trips, otherwise knuckle or hunch, re-rolled as it goes.
    const walk = (route, long = false) => {
      state.route = route;
      state.routeIndex = 0;
      state.walkGait = long && Math.random() < 0.4 ? "gallop" : Math.random() < 0.55 ? "knuckle" : "hunch";
      state.gaitFor = 5 + Math.random() * 4;
      state.gait = state.walkGait;
    };
    // Games: stay near a spot, idling and making short runs within the radius.
    const PACE_TARGET = [{ x: 0, z: 0 }];
    const pace = (cx, cz, radius) => {
      state.pace = { x: cx, z: cz, radius };
    };
    const nextPace = () => {
      const p = state.pace, a = Math.random() * TAU, r = p.radius * Math.sqrt(Math.random());
      PACE_TARGET[0].x = p.x + Math.cos(a) * r;
      PACE_TARGET[0].z = p.z + Math.sin(a) * r;
      walk(PACE_TARGET, Math.hypot(PACE_TARGET[0].x - root.position.x, PACE_TARGET[0].z - root.position.z) > p.radius * 0.8);
    };
    const place = (px, pz, facing) => {
      root.position.x = px;
      root.position.z = pz;
      root.position.y = groundAt(px, pz);
      state.heading = facing;
      state.route = null;
      state.gait = "idle";
      state.idleFor = 1 + Math.random() * 2;
    };
    // Player control: a world-space direction (length up to 1) and whether to run.
    const setDriven = (on) => {
      state.driven = on;
      state.route = null;
      state.beat = 0;
      state.gait = "idle";
      state.inX = state.inZ = 0;
      if (!on) state.idleFor = 1 + Math.random() * 2;
    };
    const drive = (dirX, dirZ, run) => {
      state.inX = dirX;
      state.inZ = dirZ;
      state.inRun = run;
    };
    const toggleStyle = () => {
      state.walkStyle = state.walkStyle === "knuckle" ? "hunch" : "knuckle";
    };
    // A step has to clear the ground limits and the scene's own sweep, so the
    // Agent stops at what stops an Ooga instead of walking through it.
    const stepTo = (nx, nz) => {
      const p = root.position, ground = groundAt(p.x, p.z), ny = groundAt(nx, nz);
      if (ny <= ground - STEP_DOWN || ny >= p.y + STEP_UP) return false;
      if (walkable && !walkable(p.x, p.z, nx, nz, p.y, BODY)) return false;
      p.x = nx;
      p.z = nz;
      return true;
    };
    // Blocked head on, try each axis alone, the way a walking Ooga slides along a wall.
    const slideTo = (nx, nz) => {
      const p = root.position;
      return stepTo(nx, nz) || nx !== p.x && stepTo(nx, p.z) || nz !== p.z && stepTo(p.x, nz);
    };
    const driven = (dt) => {
      const m = Math.hypot(state.inX, state.inZ);
      if (m < 0.1) {
        state.gait = "idle";
        return;
      }
      state.gait = state.inRun ? "gallop" : state.walkStyle;
      const want = Math.atan2(state.inX, state.inZ), turn = Math.atan2(Math.sin(want - state.heading), Math.cos(want - state.heading));
      state.heading += turn * (1 - Math.exp(-8 * dt));
      const p = root.position, step = state.speed * dt * Math.min(1, m) * Math.max(0, Math.cos(turn));
      slideTo(p.x + Math.sin(state.heading) * step, p.z + Math.cos(state.heading) * step);
    };
    const jump = () => {
      if (state.air) return;
      state.air = true;
      state.vy = JUMP_SPEED;
    };
    // Its true colours outside the Matrix, for a while
    const reveal = () => {
      state.revealFor = REVEAL_TIME;
    };
    const poke = () => {
      if (managed) return beat();
      state.beat = BEAT_TIME;
      state.gait = "beat";
    };
    const feed = () => { state.chewing = CHEW_TIME; };
    const beat = () => {
      if (!managed || state.pound > 0 || state.beat > 0 || state.speed > 0.1 || state.air || state.charge > 0 || state.crouch > 0.01 || state.rollBlend > 0.001 || state.roll > 0 || state.climb > 0 || state.climbBlend > 0.001) return false;
      state.beat = MANAGED_BEAT_TIME;
      return true;
    };
    const pound = () => {
      if (!managed || state.pound > 0 || state.beat > 0 || state.air || state.charge > 0 || state.crouch > 0.01 || state.rollBlend > 0.001 || state.roll > 0 || state.climb > 0 || state.climbBlend > 0.001) return false;
      state.pound = POUND_TIME;
      return true;
    };
    // Called with no route while idle; returns once a new walk is wanted.
    let onIdle = null;
    const steer = (dt) => {
      const target = state.route[state.routeIndex];
      const p = root.position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.3) {
        state.routeIndex++;
        if (state.routeIndex >= state.route.length) {
          state.route = null;
          state.gait = "idle";
          state.idleFor = 1.5 + Math.random() * 3;
        }
        return;
      }
      const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - state.heading), Math.cos(want - state.heading));
      state.heading += turn * (1 - Math.exp(-6 * dt));
      state.gaitFor -= dt;
      if (state.gaitFor <= 0 && state.walkGait !== "gallop") {
        state.walkGait = Math.random() < 0.55 ? "knuckle" : "hunch";
        state.gait = state.walkGait;
        state.gaitFor = 5 + Math.random() * 4;
      }
      // Slow while facing away, so it turns before it runs on
      const step = Math.min(distance, state.speed * dt * Math.max(0, Math.cos(turn)));
      // Walled in: drop the route and idle, and onIdle picks somewhere else to go.
      if (!slideTo(p.x + Math.sin(state.heading) * step, p.z + Math.cos(state.heading) * step)) {
        state.route = null;
        state.gait = "idle";
        state.idleFor = 0.4 + Math.random() * 0.8;
      }
    };
    const limb = (node, angle, dt, rate = 18) => {
      node.rotation.x = damp(node.rotation.x, angle, rate, dt);
    };
    const pose = (dt) => {
      const g = GAITS[state.gait], top = managed ? state.speed : state.driven ? g.drive : g.speed;
      const stride = (state.driven ? g.driveStride : g.stride) * scale;
      if (!managed) state.speed = damp(state.speed, top, 6, dt);
      state.phase = (state.phase + dt * state.speed / stride * (managed && state.backwards ? -1 : 1)) % 1;
      const moving = top > 0 ? clamp(state.speed / top, 0, 1) : 0;
      const lounge = managed ? state.lounge : "", onSide = lounge === "left" || lounge === "right", reclining = lounge === "back" || onSide;
      if (managed) {
        state.crouch = damp(state.crouch, state.air ? 0 : Math.max(state.charge, Math.min(1, state.landing * 2)), state.air ? 24 : 20, dt);
        state.rollBlend = damp(state.rollBlend, state.roll, 9, dt);
        state.rollAngle = damp(state.rollAngle, state.rollTarget * state.rollBlend, 18, dt);
        state.sideAngle = damp(state.sideAngle, onSide ? (lounge === "left" ? 1 : -1) * Math.PI / 2 : 0, 5, dt);
        state.climbBlend = damp(state.climbBlend, state.climb * (1 - state.mantle), 10, dt);
        state.groomBlend = damp(state.groomBlend, state.groom, 8, dt);
        state.groomTime += dt;
      }
      const crouch = managed ? state.crouch : 0, rolling = managed ? state.rollBlend : 0, climbing = managed ? state.climbBlend : 0;
      const grooming = managed ? state.groomBlend : 0, climbPhase = managed ? state.climbStride / 1.2 : 0;
      const jumping = managed && state.air, takeoff = managed ? state.takeoff : 0;
      const squeeze = managed && state.biped === "squeeze" && !lounge && !state.air && state.pound <= 0 && state.beat <= 0;
      let pitch = squeeze ? 0 : g.pitch, bob = 0;
      if (state.gait === "gallop") {
        pitch += 0.12 * wave(state.phase, 0.25) * moving;
        bob = 0.08 * Math.max(0, wave(state.phase, 0.25)) * moving;
      } else if (moving > 0) bob = 0.02 * Math.abs(wave(state.phase, 0)) * moving;
      let poundLift = 0;
      if (managed && state.poundCharge > 0 && state.pound <= 0) {
        poundLift = state.poundCharge * 0.8;
        pitch = 1.02 - 0.45 * poundLift;
      }
      if (managed && state.pound > 0) {
        const t = 1 - state.pound / POUND_TIME;
        // A controlled smash plants the feet, rears up with both fists overhead,
        // then folds at the shoulders as the fists strike the floor. Workers keep
        // their shorter equipment-pounding gesture.
        poundLift = state.smash ? t < 0.34 ? t / 0.34 : t < 0.46 ? 1 : t < 0.66 ? 1 - (t - 0.46) / 0.2 : 0
          : t < 0.28 ? t / 0.28 : t < 0.58 ? 1 - (t - 0.28) / 0.3 : 0;
        pitch = state.smash ? 1.02 - 0.86 * poundLift : 1.02 - 0.36 * poundLift;
        state.pound = Math.max(0, state.pound - dt);
      }
      if (lounge) { pitch = reclining ? 0 : -0.18 + grooming * 0.12; bob = 0; }
      // A loaded crouch compresses both pairs of limbs, then the takeoff extends
      // them before the airborne tuck. Landing absorbs the impact the same way.
      if (crouch > 0) { pitch += (1.12 - pitch) * crouch; bob *= 1 - crouch; }
      if (jumping) { pitch += (0.82 - pitch) * takeoff; bob = 0; }
      if (rolling > 0) { pitch *= 1 - rolling; bob *= 1 - rolling; }
      if (climbing > 0) { pitch += (0.04 - pitch) * climbing; bob *= 1 - climbing; }
      state.pitch = damp(state.pitch, pitch, 6, dt);
      chest.rotation.x = state.pitch;
      const o = OFFSETS[state.gait];
      // Arms hang straight down in the world whatever the chest's lean; the swing reaches forward and back.
      for (let i = 0; i < LIMBS.length; i++) {
        const l = LIMBS[i], arm = parts[l.arm];
        // A standing neighbour tucks its shoulders and takes short steps to let
        // another adult pass. Meshes and model scale stay exactly the same.
        const climbStroke = wave(climbPhase, l.side < 0 ? 0 : 0.5), leg = parts[l.leg];
        if (managed) {
          arm.position.x = damp(arm.position.x, l.side * ((squeeze ? 0.4 : SHOULDER_X) * (1 - climbing) + 0.44 * climbing), 12, dt);
          arm.position.z = damp(arm.position.z, 0.5 * U - climbing * 0.13, 12, dt);
          leg.position.y = damp(leg.position.y, Math.max(0, -climbStroke) * 0.09 * climbing, 18, dt);
          leg.position.z = damp(leg.position.z, -0.1 * climbing, 12, dt);
        }
        let legAngle = lounge ? onSide ? -0.42 : reclining ? 0.1 : -1.28 : jumping ? 0.7 - takeoff * 0.85 : o ? -(squeeze ? 0.1 : g.legs) * moving * wave(state.phase, o[l.leg]) : 0;
        legAngle += (-1.2 - legAngle) * crouch;
        legAngle += (-0.6 - legAngle) * rolling;
        legAngle += (-0.38 + 0.12 * climbStroke - legAngle) * climbing;
        limb(leg, legAngle, dt, managed && state.landing > 0 ? 32 : 18);
        if (rolling > 0.001) {
          limb(arm, -state.pitch - 0.7 * rolling, dt);
          arm.rotation.z = damp(arm.rotation.z, -l.side * 0.22 * rolling, 12, dt);
        } else if (lounge) {
          // The lower arm cushions the head on its side; the upper hand rests
          // across the chest. A seated neighbour picks with one hand while the
          // other stays planted beside its hip.
          const lower = onSide && (lounge === "left" ? l.side < 0 : l.side > 0);
          const groomArm = l.side === state.groomSide ? grooming : 0;
          const pick = Math.sin(state.groomTime * 10.5), reach = -1.36 + pick * 0.055;
          const rest = onSide ? lower ? -2.3 : -1.08 : reclining ? -0.08 : -0.7;
          limb(arm, rest + (reach - rest) * groomArm, dt);
          const restSide = onSide ? lower ? l.side * 0.12 : -l.side * 0.55 : reclining ? l.side * 0.18 : 0;
          arm.rotation.z = damp(arm.rotation.z, restSide + (l.side * 0.6 - restSide) * groomArm, 12, dt);
        } else if (managed && (state.pound > 0 || poundLift > 0)) {
          limb(arm, -state.pitch - (state.smash ? 2.7 : 1.65) * poundLift, dt);
          arm.rotation.z = damp(arm.rotation.z, 0, 18, dt);
        } else if (managed && state.dragging && l.side > 0) {
          // Keep one knuckle around the Ooga's trailing ankle while the free
          // arm can still counter-swing through the walk.
          limb(arm, -state.pitch + 0.72, dt);
          arm.rotation.z = damp(arm.rotation.z, -0.2, 18, dt);
        } else if (state.gait === "beat") {
          // Alternate fists on the chest, easing in and out of the pose
          const beatTime = managed ? MANAGED_BEAT_TIME : BEAT_TIME;
          const k = Math.min(1, (beatTime - state.beat) * 4) * Math.min(1, state.beat * 4);
          arm.rotation.x = damp(arm.rotation.x, -state.pitch - (1.25 + 0.3 * Math.sin((beatTime - state.beat) * 16 + (l.side < 0 ? 0 : Math.PI))) * k, 18, dt);
          arm.rotation.z = damp(arm.rotation.z, -l.side * 0.45 * k, 12, dt);
        } else {
          let armAngle = -state.pitch - (jumping ? state.biped ? 0.2 : 0.7 - takeoff * 0.85 : o && !squeeze ? g.arms * moving * wave(state.phase, o[l.arm]) : 0);
          armAngle += (-state.pitch - 1 - armAngle) * crouch;
          limb(arm, armAngle, dt, managed && state.landing > 0 ? 32 : 18);
          arm.rotation.z = damp(arm.rotation.z, state.gait === "hunch" ? l.side * 0.12 : 0, 8, dt);
        }
        if (managed) {
          const groomArm = lounge === "sit" && l.side === state.groomSide ? grooming : 0;
          arm.rotation.y = damp(arm.rotation.y, l.side * 0.5 * groomArm, 12, dt);
          // Reach high with one hand as the opposite foot takes its next hold.
          // The controller advances the phase by actual signed wall travel, so
          // stopping freezes the grip and descending reverses the same gait.
          if (climbing > 0.001) {
            const raised = -2.82 + 0.12 * climbStroke;
            arm.rotation.x += (raised - arm.rotation.x) * climbing;
            arm.rotation.z *= 1 - climbing;
          }
        }
      }
      // The head keeps the face forward, looking up when it rears
      parts.head.rotation.x = -state.pitch * (state.gait === "beat" ? 1.15 : 0.85);
      if (managed) {
        parts.head.rotation.x += (-0.04 - state.climbDirection * 0.16 - parts.head.rotation.x) * climbing;
        parts.head.rotation.y = damp(parts.head.rotation.y, state.groomSide * 0.36 * grooming, 8, dt);
        state.beat = Math.max(0, state.beat - dt);
        state.chewing = Math.max(0, state.chewing - dt);
        const chew = state.chewing > 0 ? Math.abs(Math.sin((CHEW_TIME - state.chewing) * 29)) : 0;
        parts.jaw.position.y = (1 - chew * 0.65) * U;
        parts.jaw.rotation.x = chew * 0.16;
      }
      if (managed) {
        const hipHeight = (lounge ? reclining ? 0 : 0.12 : HIP - 0.17 * crouch + 0.08 * takeoff) * (1 - rolling);
        state.hipHeight = damp(state.hipHeight, hipHeight, crouch > 0 || jumping ? 14 : 6, dt);
        hips.rotation.x = damp(hips.rotation.x, reclining ? -Math.PI / 2 : -Math.PI / 2 * rolling, rolling > 0.0001 ? 9 : 6, dt);
        state.hipOffsetZ = damp(state.hipOffsetZ, reclining ? 0.5 : 0.45 * rolling, 6, dt);
        hips.position.z = state.hipOffsetZ;
        hips.position.y = state.hipHeight + bob;
        // Roll around the body's long axis after lying back. Euler YXZ would
        // roll the standing spine first, which sweeps the head through the floor.
        if (rolling > 0.0001 || Math.abs(state.rollAngle) > 0.0001 || Math.abs(state.sideAngle) > 0.0001) {
          const sx = Math.sin(hips.rotation.x * 0.5), cx = Math.cos(hips.rotation.x * 0.5);
          const angle = state.rollAngle + state.sideAngle, sz = Math.sin(angle * 0.5), cz = Math.cos(angle * 0.5);
          rollQuaternion[0] = cz * sx; rollQuaternion[1] = sz * sx;
          rollQuaternion[2] = sz * cx; rollQuaternion[3] = cz * cx;
          hips.quaternion = rollQuaternion;
        } else hips.quaternion = null;
      } else hips.position.y = HIP + bob;
      root.rotation.y = state.heading;
    };
    const update = (dt) => {
      // Managed companions belong to their shared collision controller. A scene's
      // ordinary Agent update must never move or animate them a second time.
      if (managed || !(dt > 0)) return;
      if (state.revealFor > 0) state.revealFor -= dt;
      if (state.beat > 0) {
        state.beat -= dt;
        if (state.beat <= 0) state.gait = state.route ? state.walkGait : "idle";
      } else if (state.driven) driven(dt);
      else if (state.route) steer(dt);
      else if ((state.idleFor -= dt) <= 0) {
        if (state.pace) nextPace();
        else if (onIdle) onIdle();
        else state.idleFor = 2;
      }
      pose(dt);
      const ground = groundAt(root.position.x, root.position.z);
      if (state.air) {
        state.vy -= GRAVITY * dt;
        root.position.y += state.vy * dt;
        if (root.position.y <= ground) {
          root.position.y = ground;
          state.air = false;
          state.vy = 0;
        }
      } else root.position.y = ground;
    };
    // Geometry bounds are cached once; seven tiny matrix products cover every arm,
    // foot and jaw through the current animation. The controller can reserve the
    // full envelope instead of colliding only the narrower torso.
    const envelopeParts = managed ? [parts.legL, parts.legR, chest, parts.armL, parts.armR, parts.head, parts.jaw] : null;
    const envelopeBounds = managed ? envelopeParts.map((part) => boundsOf(part.geometry)) : null;
    const envelopeChest = managed ? mat4.create() : null, envelopeHead = managed ? mat4.create() : null, envelopePart = managed ? mat4.create() : null;
    const body = { minX: 0, maxX: 0, minY: 0, maxY: BODY * scale, minZ: 0, maxZ: 0, radius: 0.75 * scale, height: BODY * scale };
    const measureBody = () => {
      updateLocal(hips);
      updateLocal(chest);
      updateLocal(parts.head);
      mat4.multiply(envelopeChest, hips.local, chest.local);
      mat4.multiply(envelopeHead, envelopeChest, parts.head.local);
      body.minX = body.minY = body.minZ = Infinity;
      body.maxX = body.maxY = body.maxZ = -Infinity;
      let radius2 = 0, compactRadius2 = 0, poundRadius2 = 0, standRadius2 = 0, parkRadius2 = 0, sitRadius2 = 0, sitWidth = 0;
      for (let i = 0; i < envelopeParts.length; i++) {
        const part = envelopeParts[i], b = envelopeBounds[i];
        let m;
        if (part === chest) m = envelopeChest;
        else if (part === parts.head) m = envelopeHead;
        else {
          updateLocal(part);
          mat4.multiply(envelopePart, part.parent === hips ? hips.local : part.parent === chest ? envelopeChest : envelopeHead, part.local);
          m = envelopePart;
        }
        for (let corner = 0; corner < 8; corner++) {
          const x = b[corner & 1 ? "max" : "min"][0], y = b[corner & 2 ? "max" : "min"][1], z = b[corner & 4 ? "max" : "min"][2];
          const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) * scale;
          const py = (m[1] * x + m[5] * y + m[9] * z + m[13]) * scale;
          const pz = (m[2] * x + m[6] * y + m[10] * z + m[14]) * scale;
          body.minX = Math.min(body.minX, px); body.maxX = Math.max(body.maxX, px);
          body.minY = Math.min(body.minY, py); body.maxY = Math.max(body.maxY, py);
          body.minZ = Math.min(body.minZ, pz); body.maxZ = Math.max(body.maxZ, pz);
          radius2 = Math.max(radius2, px * px + pz * pz);
          const nearest = Math.min(Math.abs(pz - QUAD_CENTERS[0] * scale), Math.abs(pz - QUAD_CENTERS[1] * scale), Math.abs(pz - QUAD_CENTERS[2] * scale));
          compactRadius2 = Math.max(compactRadius2, px * px + nearest * nearest);
          const poundNearest = Math.min(Math.abs(pz - POUND_CENTERS[0] * scale), Math.abs(pz - POUND_CENTERS[1] * scale), Math.abs(pz - POUND_CENTERS[2] * scale));
          poundRadius2 = Math.max(poundRadius2, px * px + poundNearest * poundNearest);
          standRadius2 = Math.max(standRadius2, px * px + (pz - STAND_CENTER * scale) ** 2);
          parkRadius2 = Math.max(parkRadius2, px * px + (pz - PARK_CENTER * scale) ** 2);
          // Grooming intentionally touches the seated partner with one hand.
          // Only that arm leaves the seated-neighbour footprint; the complete
          // body envelope above continues to include it for scenery clearance.
          if (!(state.groomBlend > 0.001 && part === (state.groomSide < 0 ? parts.armL : parts.armR))) {
            const sitNearest = Math.min(Math.abs(pz - SIT_CENTERS[0] * scale), Math.abs(pz - SIT_CENTERS[1] * scale));
            sitRadius2 = Math.max(sitRadius2, px * px + sitNearest * sitNearest);
            sitWidth = Math.max(sitWidth, Math.abs(px));
          }
        }
      }
      // Stop animated knuckles dipping below the supporting floor without moving
      // the controller's root or interfering with its airborne height.
      if (body.minY < 0) {
        const lift = -body.minY / scale;
        hips.position.y += lift;
        updateLocal(hips);
        envelopeChest[13] += lift; envelopeHead[13] += lift;
        body.maxY -= body.minY;
        body.minY = 0;
      }
      body.radius = Math.sqrt(radius2);
      body.height = body.maxY - body.minY;
      // At the circles' bisectors their union still covers the entire width,
      // so faces between the tested box corners cannot escape between circles.
      body.compact = compactRadius2 <= (QUAD_RADIUS * scale) ** 2
        && Math.max(-body.minX, body.maxX) <= Math.sqrt(QUAD_RADIUS ** 2 - 0.325 ** 2) * scale;
      body.poundCompact = poundRadius2 <= (POUND_RADIUS * scale) ** 2
        && Math.max(-body.minX, body.maxX) <= Math.sqrt(POUND_RADIUS ** 2 - 0.4 ** 2) * scale;
      body.standCompact = standRadius2 <= (STAND_RADIUS * scale) ** 2;
      body.parkCompact = parkRadius2 <= (PARK_RADIUS * scale) ** 2;
      body.sitCompact = state.lounge === "sit" && sitRadius2 <= (SIT_RADIUS * scale) ** 2
        && sitWidth <= Math.sqrt(SIT_RADIUS ** 2 - 0.335 ** 2) * scale;
    };
    const envelope = (out) => {
      out.minX = body.minX; out.maxX = body.maxX;
      out.minY = body.minY; out.maxY = body.maxY;
      out.minZ = body.minZ; out.maxZ = body.maxZ;
      out.radius = body.radius; out.height = body.height;
      return out;
    };
    // Managed motion adds climb (0..1 wall grip), signed climbStride in metres,
    // climbDirection (-1/0/1 gaze) and mantle (0..1 return over the top edge).
    // Seated grooming uses groom (0..1), groomSide (-1 left/+1 right), and an
    // optional groomPhase in seconds. All transitions reuse the existing rig.
    const poseManaged = (dt, px, py, pz, facing, speed, airborne = false, biped = false, lounge = "", motion = null) => {
      root.position.x = px; root.position.y = py; root.position.z = pz;
      state.heading = facing;
      state.backwards = speed < 0;
      state.speed = Math.abs(speed);
      state.air = airborne;
      state.biped = biped;
      state.charge = motion ? clamp(motion.charge || 0, 0, 1) : 0;
      state.poundCharge = motion ? clamp(motion.poundCharge || 0, 0, 1) : 0;
      state.takeoff = motion ? clamp(motion.takeoff || 0, 0, 1) : 0;
      state.landing = motion ? clamp(motion.landing || 0, 0, 1) : 0;
      state.roll = motion ? clamp(motion.roll || 0, 0, 1) : 0;
      state.rollTarget = motion && Number.isFinite(motion.rollAngle) ? motion.rollAngle : 0;
      state.climb = motion && !airborne && !state.roll ? clamp(motion.climb || 0, 0, 1) : 0;
      state.climbStride = motion ? motion.climbStride || 0 : 0;
      state.climbDirection = motion ? clamp(motion.climbDirection || 0, -1, 1) : 0;
      state.mantle = motion ? clamp(motion.mantle || 0, 0, 1) : 0;
      state.groom = motion && lounge === "sit" && !airborne && !state.roll && !state.climb ? clamp(motion.groom || 0, 0, 1) : 0;
      state.groomSide = motion && motion.groomSide < 0 ? -1 : 1;
      if (motion && Number.isFinite(motion.groomPhase)) state.groomTime = motion.groomPhase;
      state.smash = !!(motion && motion.smash && !airborne && !state.roll && !state.charge);
      state.dragging = !!(motion && motion.dragging && !airborne && !state.roll);
      state.lounge = !airborne && state.speed <= 0.1 && (lounge === "sit" || lounge === "back" || lounge === "left" || lounge === "right") ? lounge : "";
      if (state.roll > 0 || state.charge > 0 || airborne || state.climb > 0) state.lounge = "";
      if (state.lounge || state.roll > 0 || state.charge > 0 || airborne || state.climb > 0) state.pound = state.beat = state.chewing = 0;
      if (state.speed > 0.1 || airborne) state.beat = 0;
      state.gait = state.beat > 0 ? "beat" : biped ? "upright" : state.speed > 1.7 ? "gallop" : state.speed > 0.01 ? "knuckle" : "idle";
      pose(Math.max(0, dt));
      measureBody();
    };
    const pointToWorld = (matrix, x, y, z, out) => {
      const px = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * scale;
      const py = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * scale;
      const pz = (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * scale;
      const sine = Math.sin(root.rotation.y), cosine = Math.cos(root.rotation.y);
      out.x = root.position.x + cosine * px + sine * pz;
      out.y = root.position.y + py;
      out.z = root.position.z - sine * px + cosine * pz;
      return out;
    };
    // These matrices come from the current pose, including the floor adjustment
    // and reclining hips, so projectiles never chase the previous render frame.
    const mouth = (out) => {
      if (managed) return pointToWorld(envelopeHead, 0, 0.7 * U, 6.05 * U, out);
      const head = parts.head, hc = Math.cos(head.rotation.x), hs = Math.sin(head.rotation.x);
      const cy = Math.cos(chest.rotation.x), sy = Math.sin(chest.rotation.x);
      const hy = head.position.y + hc * 0.7 * U - hs * 6.05 * U;
      const hz = head.position.z + hs * 0.7 * U + hc * 6.05 * U;
      const y = (hips.position.y + cy * hy - sy * hz) * scale, z = (sy * hy + cy * hz) * scale;
      out.x = root.position.x + Math.sin(root.rotation.y) * z;
      out.y = root.position.y + y;
      out.z = root.position.z + Math.cos(root.rotation.y) * z;
      return out;
    };
    const targetParts = [2, 5, 3, 4, 0, 1];
    const bodyTarget = (out, sample = 0) => {
      if (!managed) { out.x = root.position.x; out.y = root.position.y + BODY * 0.5; out.z = root.position.z; return out; }
      const index = targetParts[Math.abs(sample | 0) % targetParts.length], part = envelopeParts[index], bounds = envelopeBounds[index];
      let matrix;
      if (part === chest) matrix = envelopeChest;
      else if (part === parts.head) matrix = envelopeHead;
      else {
        updateLocal(part);
        mat4.multiply(envelopePart, part.parent === hips ? hips.local : envelopeChest, part.local);
        matrix = envelopePart;
      }
      return pointToWorld(matrix, (bounds.min[0] + bounds.max[0]) * 0.5, (bounds.min[1] + bounds.max[1]) * 0.5,
        (bounds.min[2] + bounds.max[2]) * 0.5, out);
    };
    if (managed) measureBody();
    // Only the form on show: the other set is released, so no scene keeps another
    // scene's Agent geometry resident. A swap re-uploads six small voxel parts.
    const liveGeometry = (set) => {
      for (const name of PART_NAMES) set.add(parts[name].geometry);
      if (managed) set.add(parts.jaw.geometry);
    };
    const dispose = () => {
      if (root.parent) removeChild(root.parent, root);
      state.route = null;
      state.pace = null;
      onIdle = null;
    };
    const agent = {
      root, parts, hips, chest, update, setForm, setGait, walk, pace, place, poke, jump, reveal, setDriven, drive, toggleStyle, liveGeometry, dispose,
      managed, poseManaged, mouth, bodyTarget, envelope, feed, pound, beat,
      get bodyRadius() { return body.radius; },
      get bodyHeight() { return body.maxY; },
      get bodyMinY() { return body.minY; },
      get compact() { return !!body.compact; },
      get poundCompact() { return !!body.poundCompact; },
      get standCompact() { return !!body.standCompact; },
      get parkCompact() { return !!body.parkCompact; },
      get sitCompact() { return !!body.sitCompact; },
      get pounding() { return state.pound > 0; },
      get beating() { return state.beat > 0; },
      get chewing() { return state.chewing > 0; },
      get motionActive() { return managed && (state.air || state.charge > 0 || state.crouch > 0.001 || state.takeoff > 0 || state.rollBlend > 0.001 || Math.abs(state.rollAngle) > 0.001 || state.climb > 0 || state.climbBlend > 0.001); },
      get smashActive() { return managed && state.smash && state.pound > 0; },
      get revealed() { return state.revealFor > 0; },
      get airborne() { return state.air; },
      groundAt,
      get heading() { return state.heading; },
      get driven() { return state.driven; },
      get form() { return state.form; },
      set onIdle(fn) { onIdle = fn; },
      get walking() { return !!state.route; },
      debug: {
        get form() { return state.form; },
        get gait() { return state.gait; },
        get pitch() { return state.pitch; },
        get speed() { return state.speed; },
        get phase() { return state.phase; },
        get driven() { return state.driven; },
        get walkStyle() { return state.walkStyle; },
        get revealed() { return state.revealFor > 0; },
        get airborne() { return state.air; },
        get climbing() { return state.climbBlend; },
        get lounge() { return state.lounge; },
        get grooming() { return state.groomBlend; },
        jump,
        reveal,
        setGait,
        setForm,
        poke,
        place,
        pace,
        parts,
        root
      }
    };
    return agent;
  };
  // Shift+A in any scene, or a double-click on the Agent in the hub and the lab: the
  // director hands the active scene's Agent to the player until Escape, Shift+A or a
  // double-click on the ground, and it wanders off again. Key-downs are taken in the
  // capture phase, so the scene's own controls never see them meanwhile. A scene may
  // provide agentView (the pilot's orbit, so drag and scroll work as with an Ooga),
  // agentControls (its sticks) and agentHandoff (release a controlled Ooga first).
  const PLAY_KEYS = { w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right", shift: "run", q: "turnLeft", e: "turnRight" };
  const CAMERA_DIST = 4.2, CAMERA_PITCH = 0.42, CAMERA_TURN = 1.8, SUMMON_DIST = 3.5;
  const createPlay = () => {
    const held = { forward: 0, back: 0, left: 0, right: 0, run: 0, turnLeft: 0, turnRight: 0 };
    let scene = null, agent = null, yaw = 0, startedAt = -Infinity;
    const typing = (e) => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || (e.target.closest && e.target.closest("dialog")));
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const key = e.key.toLowerCase();
      // Shift+A reaches the director, which lets go.
      if (e.shiftKey && key === "a") return;
      if (key === "escape") stop();
      else if (PLAY_KEYS[key]) held[PLAY_KEYS[key]] = 1;
      else if (key === " ") {
        if (!e.repeat) agent.jump();
      } else if (key === "c") {
        if (!e.repeat) agent.poke();
      } else if (key === "h") {
        if (!e.repeat) agent.toggleStyle();
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Key-ups pass on: the scene's controls saw the A of Shift+A go down before play began, and a
    // swallowed key-up left it held there, walking the next driven Ooga left on its own.
    const onKeyUp = (e) => {
      const name = PLAY_KEYS[e.key.toLowerCase()];
      if (name) held[name] = 0;
    };
    const onBlur = () => {
      for (const name in held) held[name] = 0;
    };
    const toast = (text) => {
      if (scene.debug && scene.debug.hud) scene.debug.hud.toast(text);
    };
    // summon: bring it in front of the camera (Shift+A); a double-click takes it where it stands.
    const start = (next, summon = true) => {
      if (next.agentHandoff) next.agentHandoff();
      scene = next;
      // A scene may build its Agent only when one is called for (the lab).
      agent = next.agent || (next.summonAgent ? next.summonAgent() : null);
      if (!agent) return;
      startedAt = performance.now();
      const c = next.camera, dx = c.target.x - c.position.x, dz = c.target.z - c.position.z, l = Math.hypot(dx, dz) || 1;
      if (summon) {
        const x = c.position.x + dx / l * SUMMON_DIST, z = c.position.z + dz / l * SUMMON_DIST, y = agent.groundAt(x, z);
        // Wherever there is ground to stand on in front of the camera, facing away
        if (Number.isFinite(y) && Math.abs(y - c.position.y) < 30) agent.place(x, z, Math.atan2(dx, dz));
      }
      agent.root.visible = true;
      agent.setDriven(true);
      yaw = Math.atan2(-dx, -dz);
      if (next.agentView) next.agentView.tYaw = next.agentView.yaw = yaw;
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", onBlur);
      toast("You are the Agent · WASD walk, Shift gallop, Space jump, H hunch, C beat chest · Esc or double-click the ground to let go");
    };
    function stop(quiet = false) {
      if (!agent) return;
      agent.setDriven(false);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      onBlur();
      // The free camera stays where the chase camera left it
      const view = scene.agentView, p = agent.root.position;
      if (view) {
        view.target.x = view.tx = p.x;
        view.target.y = view.ty = p.y + 0.9;
        view.target.z = view.tz = p.z;
      }
      if (!quiet) toast("The Agent wanders off");
      agent = scene = null;
    }
    // After the scene's update: steer relative to the camera, then place the chase camera.
    const update = (dt) => {
      if (!agent) return;
      const view = scene.agentView, turn = (held.turnLeft - held.turnRight) * CAMERA_TURN * dt;
      if (view) {
        view.tYaw += turn;
        yaw = view.yaw;
      } else yaw += turn;
      const stick = scene.agentControls ? scene.agentControls.read() : null;
      let ix = held.right - held.left + (stick ? stick.x : 0), iy = held.forward - held.back + (stick ? stick.y : 0);
      // The camera looks along -(sin yaw, cos yaw); screen right is (cos yaw, -sin yaw)
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let mx = fx * iy - fz * ix, mz = fz * iy + fx * ix;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      agent.drive(mx, mz, held.run > 0);
      const p = agent.root.position, c = scene.camera;
      const pitch = view ? view.pitch : CAMERA_PITCH, dist = view ? view.dist : CAMERA_DIST, cp = Math.cos(pitch);
      c.position.x = p.x + Math.sin(yaw) * cp * dist;
      c.position.y = p.y + 0.9 + Math.sin(pitch) * dist;
      c.position.z = p.z + Math.cos(yaw) * cp * dist;
      c.target.x = p.x;
      c.target.y = p.y + 0.9;
      c.target.z = p.z;
    };
    return { start, stop, update, get active() { return !!agent; }, get agent() { return agent; }, get startedAt() { return startedAt; } };
  };
  BL.agent = { create, createPlay, GAITS, TRIPLE_MS, QUAD, HUNCH, BODY, POUND_TIME, MANAGED_BEAT_TIME, MANAGED_MOTION_RADIUS, MANAGED_MOTION_HEIGHT, MANAGED_SMASH_RADIUS, footprint };
})();
