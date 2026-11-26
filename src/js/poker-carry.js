// Ask Ooga To Move's pure parts: the poses of one Ooga lifting another overhead, carrying it, winding up and throwing
// it through a pane of Banana Club's glass, and the carried figure's own (pulled up from its chair, squirming, flailing
// in flight); where the carried figure lies; the throw's arc and tumble on a fixed step; and the aim at a pane.
//
// Poses write only rotations on a caveman's rig (`models.caveman`'s `parts`): the arms' x and y, the legs' x and the
// head's x and y, never the arms' z (which differs by figure), a position, the torso or the root. The carrier's poses
// also fill a caller-owned `pose` ({ dy, pitch, carry }, from `createPose`): `dy` metres to add to the root's height,
// `pitch` the root's lean (rotation.x, + forward), and `carry` the share of the way the carried figure has come from
// its chair to over the carrier's head. Each pose settles to a known pose at its ends. Random choices come from a
// seed; nothing allocates once the caller's objects exist. Loads in Node beside math.js; touches no scene or DOM.
(() => {
  "use strict";
  const BL = window.BL, Q = BL.math.quat;
  const TAU = Math.PI * 2, UP = -Math.PI;
  // Timings, seconds: the lift from the chair to overhead (the hands grip at GRIP_AT of it, the figure leaves the
  // chair from HOIST_FROM), the wind-up and the release (the figure leaves the hands at RELEASE_AT of it).
  const LIFT_TIME = 1.4, GRIP_AT = 0.4, HOIST_FROM = 0.55, WIND_TIME = 0.45, RELEASE_TIME = 0.7, RELEASE_AT = 0.25;
  // The rig, as shares of a figure's height (`traits.height`): the root (hips) over the soles (models.js's seven leg
  // units of sixteen), the palms of arms raised straight up over the root, and for the carried figure the depth from
  // its back to its root and from its root to its middle along its length.
  const LEG_SHARE = 7 / 16, HANDS = 1.085, LIE_DEPTH = 0.2, MIDDLE = 0.23;
  // Rotations the poses meet: the crew's standing arms, the poker room's sitting pose (`pokerModels.sitPose`), the
  // carrier's head tipped back a little to watch its load, and the carried figure's resting pose across the hands.
  const STAND_ARMS = -0.2, SIT_ARMS = -0.9, SIT_LEGS = -1.35, HOLD_HEAD = -0.12;
  const CARRIED_ARMS = -1.3, CARRIED_LEGS = -0.45, CARRIED_HEAD = 0.2;
  // Carrying: metres a second, and as a share of the scene's own walk, with the step's heavier bob (a share of height).
  const CARRY_SPEED = 1.3, CARRY_SPEED_SHARE = 0.5, BOB = 0.045;
  // The throw: a fixed step, gravity inside the hall (outside the glass there is none: the figure sails on into
  // space), the launch speeds a charge of 0 to 1 spans, the farthest aim, the removal distance from the launch (the
  // figure shrinks past SHRINK_FROM to MIN_SCALE), the twinkle's time, the tumble's rate, and the clearance a body
  // needs from any frame member, sill, transom or rail.
  const FIXED = 1 / 120, MAX_SUBSTEPS = 8, GRAVITY = 9.8, SPEED_MIN = 5, SPEED_MAX = 18, MAX_THROW = 16;
  const REMOVE_DIST = 40, SHRINK_FROM = 18, MIN_SCALE = 0.3, TWINKLE_TIME = 0.6, TUMBLE = 7, BODY_CLEAR = 0.35;
  // arcTo's level speed: ARC_BASE plus ARC_GAIN a metre, held between ARC_MIN and ARC_MAX; closer than ARC_NEAR is no throw.
  const ARC_BASE = 7, ARC_GAIN = 0.5, ARC_MIN = 8, ARC_MAX = 12, ARC_NEAR = 1;

  // Turns q by the world-frame angular velocity w[i..i+2] over dt, as math.js's quat.integrate does, reading the rates
  // from an array so no number is boxed between calls (and with no Math.hypot, which allocates on V8 here).
  const turn = (q, w, i, dt) => {
    const hx = w[i] * dt / 2, hy = w[i + 1] * dt / 2, hz = w[i + 2] * dt / 2, x = q[0], y = q[1], z = q[2], s = q[3];
    q[0] = x + hy * z - hz * y + hx * s; q[1] = y + hz * x - hx * z + hy * s; q[2] = z + hx * y - hy * x + hz * s; q[3] = s - hx * x - hy * y - hz * z;
    const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1;
    q[0] /= len; q[1] /= len; q[2] /= len; q[3] /= len;
  };
  // The per-frame code smooths inline (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)) and reads its seeded values from
  // HASHES rather than calling a function that returns a number: a returned fraction is boxed whenever the call is not
  // inlined, which V8 does not promise.
  // A seeded hash in [0, 1): the same seed and channel always give the same value. `seeded(seed)` writes channels 0 to
  // HASH_COUNT - 1 into HASHES, unless they are already that seed's.
  const hash = (seed, k) => { const s = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  const HASH_COUNT = 52, HASHES = new Float64Array(HASH_COUNT), HASHED = Float64Array.of(NaN);
  const seeded = (seed) => {
    if (HASHED[0] === seed) return;
    HASHED[0] = seed;
    for (let k = 0; k < HASH_COUNT; k++) { const s = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; HASHES[k] = s - Math.floor(s); }
  };

  // ---- the carrier ----
  // Key poses, a row each: [t, arms' x, arms' y (the right arm's; the left's is its negative), head's x, root pitch,
  // root drop as a share of height]. The legs take minus the pitch, so they stay upright as the body leans.
  const ROW = 6;
  const LIFT = Float64Array.from([
    0, STAND_ARMS, 0, 0, 0, 0,
    GRIP_AT, -1.25, 0.12, 0.36, 0.32, -0.06,
    HOIST_FROM, -1.4, 0.12, 0.3, 0.3, -0.06,
    1, UP, 0, HOLD_HEAD, 0, 0]);
  const DRAWN = UP - 0.65;
  const WIND = Float64Array.from([0, UP, 0, HOLD_HEAD, 0, 0, 1, DRAWN, 0, -0.32, -0.18, -0.04]);
  const RELEASE = Float64Array.from([0, DRAWN, 0, -0.32, -0.18, -0.04, 0.3, -1.2, 0, 0.18, 0.3, -0.02, 1, STAND_ARMS, 0, 0, 0, 0]);
  // Writes the pose `keys` gives at t (exactly its first row at t <= 0 and its last at t >= its last row's t).
  const keyed = (keys, rig, t, pose) => {
    const n = keys.length / ROW;
    let i = 0, u = 0;
    if (t >= keys[(n - 1) * ROW]) i = (n - 1) * ROW;
    else if (t > 0) {
      let k = 1;
      while (k < n - 1 && t >= keys[k * ROW]) k++;
      i = (k - 1) * ROW;
      const v = (t - keys[i]) / (keys[i + ROW] - keys[i]);
      u = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
    }
    const j = u > 0 ? i + ROW : i;
    const arms = keys[i + 1] + (keys[j + 1] - keys[i + 1]) * u, armsY = keys[i + 2] + (keys[j + 2] - keys[i + 2]) * u;
    const head = keys[i + 3] + (keys[j + 3] - keys[i + 3]) * u, pitch = keys[i + 4] + (keys[j + 4] - keys[i + 4]) * u, drop = keys[i + 5] + (keys[j + 5] - keys[i + 5]) * u;
    const p = rig.parts;
    p.armR.rotation.x = arms; p.armL.rotation.x = arms; p.armR.rotation.y = armsY; p.armL.rotation.y = -armsY;
    p.legR.rotation.x = -pitch; p.legL.rotation.x = -pitch;
    p.head.rotation.x = head;
    if (pose) { pose.dy = drop * rig.traits.height; pose.pitch = pitch; }
  };
  // The lift, t 0 to 1 of LIFT_TIME: from standing the carrier bends and reaches to the seated figure, grips, and hoists
  // it overhead, ending with both arms straight up and the head tipped back. `pose.carry` runs 0 to 1 from HOIST_FROM.
  const lift = (rig, t, pose) => {
    keyed(LIFT, rig, t, pose);
    if (pose) { const v = (t - HOIST_FROM) / (1 - HOIST_FROM); pose.carry = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v); }
  };
  // Holding overhead while walking, `phase` the caller's walk phase (radians, a step each pi): the arms sway the load
  // side to side and the head bobs; `pose.dy` is the heavier dip of each step, to add to the caller's own walk. The
  // legs are the caller's walk cycle's. At phase 0 this is exactly the lift's end.
  const hold = (rig, phase, pose) => {
    const p = rig.parts, s = 0.06 * Math.sin(phase);
    p.armR.rotation.x = UP + s; p.armL.rotation.x = UP - s; p.armR.rotation.y = 0; p.armL.rotation.y = 0;
    p.head.rotation.x = HOLD_HEAD + 0.03 * Math.sin(2 * phase);
    if (pose) { pose.dy = -BOB * rig.traits.height * (0.5 - 0.5 * Math.cos(2 * phase)); pose.pitch = 0; pose.carry = 1; }
  };
  // The wind-up, t 0 to 1 of WIND_TIME: from holding (phase 0) the arms draw back behind the head and the body leans
  // back; at t >= 1 it holds the drawn pose, where the release starts.
  const wind = (rig, t, pose) => { keyed(WIND, rig, t, pose); if (pose) pose.carry = 1; };
  // The release, t 0 to 1 of RELEASE_TIME: the arms hurl forward and the body follows through (the figure leaves the
  // hands at RELEASE_AT), then the carrier settles to standing, exactly so at t >= 1.
  const release = (rig, t, pose) => { keyed(RELEASE, rig, t, pose); if (pose) pose.carry = t < RELEASE_AT ? 1 : 0; };

  // ---- the carried figure ----
  const carried = (p, arms, armY, legL, legR, head, headY) => {
    p.armR.rotation.x = arms; p.armL.rotation.x = arms; p.armR.rotation.y = armY; p.armL.rotation.y = -armY;
    p.legL.rotation.x = legL; p.legR.rotation.x = legR; p.head.rotation.x = head; p.head.rotation.y = headY;
  };
  // Pulled from the chair, t 0 to 1: from the sitting pose (exactly at t <= 0) to the carried pose (exactly at t >= 1),
  // with a startled wriggle on the way.
  const rise = (npc, t) => {
    const p = npc.parts;
    if (t <= 0) { carried(p, SIT_ARMS, 0, SIT_LEGS, SIT_LEGS, 0, 0); return; }
    if (t >= 1) { carried(p, CARRIED_ARMS, 0, CARRIED_LEGS, CARRIED_LEGS, CARRIED_HEAD, 0); return; }
    const u = t * t * (3 - 2 * t), w = Math.sin(Math.PI * u), legs = SIT_LEGS + (CARRIED_LEGS - SIT_LEGS) * u;
    p.armR.rotation.x = SIT_ARMS + (CARRIED_ARMS - SIT_ARMS) * u + 0.3 * w * Math.sin(9 * u);
    p.armL.rotation.x = SIT_ARMS + (CARRIED_ARMS - SIT_ARMS) * u - 0.3 * w * Math.sin(9 * u);
    p.armR.rotation.y = 0.3 * w; p.armL.rotation.y = -0.3 * w;
    p.legL.rotation.x = legs + 0.25 * w * Math.sin(11 * u); p.legR.rotation.x = legs - 0.25 * w * Math.sin(11 * u);
    p.head.rotation.x = CARRIED_HEAD * u; p.head.rotation.y = 0.25 * w * Math.sin(13 * u);
  };
  // Each squirm channel's base rate (radians a second): left leg, right leg, left arm, right arm, the arms' spread
  // left and right, the head's shake and its nod.
  const SQUIRM_RATE = Float64Array.from([9, 10.5, 7, 8, 5, 6, 11, 4]);
  // The eight channels' irregular waves at `time` into WAVES: each three incommensurate sines whose rates and phases
  // come from the seed's HASHES (written to an array, not returned, so no number is boxed between calls).
  const WAVES = new Float64Array(8);
  const waves = (time) => {
    for (let k = 0; k < 8; k++) {
      const f = SQUIRM_RATE[k] * (0.7 + 0.6 * HASHES[k]), p1 = TAU * HASHES[k + 16], p2 = TAU * HASHES[k + 32];
      WAVES[k] = Math.sin(f * time + p1) + 0.6 * Math.sin(1.73 * f * time + p2) + 0.35 * Math.sin(0.41 * f * time + p1);
    }
  };
  // Squirming across the carrier's hands, `time` seconds since it was lifted: legs kicking, arms flapping, the head
  // shaking "no", each on its own seeded rhythm, easing in from the carried pose (exactly so at time <= 0). Comic, not
  // distressing: wide, quick, bouncy movements with nothing bent the wrong way.
  const squirm = (npc, time, seed) => {
    const p = npc.parts;
    if (time <= 0) { carried(p, CARRIED_ARMS, 0, CARRIED_LEGS, CARRIED_LEGS, CARRIED_HEAD, 0); return; }
    const u = time / 0.35, a = u >= 1 ? 1 : u * u * (3 - 2 * u);
    seeded(seed); waves(time);
    p.legL.rotation.x = CARRIED_LEGS + a * 0.5 * WAVES[0];
    p.legR.rotation.x = CARRIED_LEGS + a * 0.5 * WAVES[1];
    p.armL.rotation.x = CARRIED_ARMS + a * 0.55 * WAVES[2];
    p.armR.rotation.x = CARRIED_ARMS + a * 0.55 * WAVES[3];
    p.armL.rotation.y = -a * 0.3 * WAVES[4];
    p.armR.rotation.y = a * 0.3 * WAVES[5];
    p.head.rotation.y = a * 0.45 * Math.sin(SQUIRM_RATE[6] * (0.7 + 0.6 * HASHES[6]) * time + TAU * HASHES[22]);
    p.head.rotation.x = CARRIED_HEAD + a * 0.12 * WAVES[7];
  };
  // Flailing in flight, `time` seconds since the throw: arms windmilling, legs bicycling, the head looking about,
  // easing in from the carried pose (exactly so at time <= 0).
  const flail = (npc, time, seed) => {
    const p = npc.parts;
    if (time <= 0) { carried(p, CARRIED_ARMS, 0, CARRIED_LEGS, CARRIED_LEGS, CARRIED_HEAD, 0); return; }
    seeded(seed);
    const v = time / 0.2, a = v >= 1 ? 1 : v * v * (3 - 2 * v), fa = 11 + 4 * HASHES[48], fl = 13 + 4 * HASHES[49], pa = TAU * HASHES[50], pl = TAU * HASHES[51];
    p.armR.rotation.x = CARRIED_ARMS + a * 1.3 * Math.sin(fa * time + pa);
    p.armL.rotation.x = CARRIED_ARMS + a * 1.3 * Math.sin(fa * time + pa + 2.4);
    p.armR.rotation.y = a * 0.6 * Math.cos(fa * time + pa); p.armL.rotation.y = -a * 0.6 * Math.cos(fa * time + pa + 2.4);
    p.legL.rotation.x = CARRIED_LEGS + a * 0.7 * Math.sin(fl * time + pl); p.legR.rotation.x = CARRIED_LEGS + a * 0.7 * Math.sin(fl * time + pl + Math.PI);
    p.head.rotation.y = a * 0.35 * Math.sin(0.37 * fa * time + pl); p.head.rotation.x = CARRIED_HEAD + a * 0.15 * Math.sin(0.53 * fl * time + pa);
  };
  // Standing, for anything cut short: the crew's standing arms, straight legs and a level head, every rotation the
  // poses here write.
  const settle = (rig) => carried(rig.parts, STAND_ARMS, 0, 0, 0, 0, 0);

  // ---- where the carried figure lies ----
  // Laid across the hands its length runs along the carrier's left-right (its head toward the carrier's left, +x), its
  // front up (on its back) or down. R_BACK takes the figure's up to its carrier's +x and its front to up.
  const R_BACK = Float32Array.from([-0.5, -0.5, -0.5, 0.5]), R_FRONT = Q.multiply(new Float32Array(4), Float32Array.from([1, 0, 0, 0]), R_BACK);
  const YAW = new Float32Array(4), V = new Float32Array(3);
  const createPose = () => ({ dy: 0, pitch: 0, carry: 0 });
  const createCarried = () => ({ x: 0, y: 0, z: 0, q: Q.create() });
  // Writes into `out` the root position and orientation (`out.q`, for the carried figure's `root.quaternion`) that lay
  // a figure `npcHeight` tall on its back (or `front`) across the raised hands of `carrier`, its middle over the
  // carrier's root, its back on the palms. Reads the carrier's root position (after the caller's bob) and yaw.
  const carriedAt = (carrier, out, npcHeight = 1, front = false) => {
    const r = carrier.root, h = carrier.traits.height;
    Q.fromAxisAngle(YAW, 0, 1, 0, r.rotation.y);
    Q.multiply(out.q, YAW, front ? R_FRONT : R_BACK);
    Q.rotateVec(V, out.q, 0, MIDDLE * npcHeight, 0);
    out.x = r.position.x - V[0];
    out.y = r.position.y + HANDS * h + LIE_DEPTH * npcHeight;
    out.z = r.position.z - V[2];
  };

  // ---- the flight ----
  const createFlight = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, q: Q.create(), w: new Float64Array(3), ox: 0, oy: 0, oz: 0,
    nx: 0, ny: 0, nz: 0, nd: 0, plane: false, crossed: false, cx: 0, cy: 0, cz: 0, crossTime: 0, time: 0, dist: 0, scale: 1,
    gone: false, goneTime: 0, star: 0, done: false, acc: 0 });
  const speedOf = charge => SPEED_MIN + (charge <= 0 ? 0 : charge >= 1 ? 1 : charge) * (SPEED_MAX - SPEED_MIN);
  // Launches from `from` ({ x, y, z } and, if it has one, its orientation `q`: a carried spot from carriedAt) along
  // `dir` (made unit) at the speed `charge` (0 to 1) gives, tumbling head over heels about a level axis square to the
  // throw with a seeded wobble. `plane` is the pane aimed at (its centre and outward normal, from the glazing's panes
  // or `aim.pane`), whose crossing the flight reports; with none it never crosses and gravity never ends.
  const throwInit = (state, from, dir, charge, plane, seed = 0) => {
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1, dx = dir.x / len, dy = dir.y / len, dz = dir.z / len, v = speedOf(charge);
    state.x = state.ox = from.x; state.y = state.oy = from.y; state.z = state.oz = from.z;
    state.vx = dx * v; state.vy = dy * v; state.vz = dz * v;
    if (from.q) Q.copy(state.q, from.q); else Q.identity(state.q);
    const lev = Math.sqrt(dx * dx + dz * dz), ax = lev > 1e-6 ? dz / lev : 1, az = lev > 1e-6 ? -dx / lev : 0;
    const spin = TUMBLE * (0.8 + 0.5 * hash(seed, 1)) * (hash(seed, 2) < 0.5 ? -1 : 1), roll = 5 * (hash(seed, 3) - 0.5), yaw = 3 * (hash(seed, 4) - 0.5);
    state.w[0] = ax * spin + dx * roll; state.w[1] = yaw + dy * roll; state.w[2] = az * spin + dz * roll;
    state.plane = !!plane;
    if (plane) { state.nx = plane.nx; state.ny = plane.ny || 0; state.nz = plane.nz; state.nd = plane.cx * plane.nx + plane.cy * state.ny + plane.cz * plane.nz; }
    state.crossed = state.plane && state.x * state.nx + state.y * state.ny + state.z * state.nz - state.nd >= 0;
    state.cx = state.cy = state.cz = state.crossTime = state.time = state.dist = state.goneTime = state.star = state.acc = 0;
    state.scale = 1; state.gone = state.done = false;
  };
  // One step of `dt` seconds (FIXED): exact constant-acceleration motion (gravity until the glass is crossed, none
  // after), the tumble integrated as a world-frame angular velocity (`w`, radians a second), the crossing point (`cx`,
  // `cy`, `cz`) found inside the step, `dist` from the launch and `scale` past SHRINK_FROM. Past REMOVE_DIST the figure
  // is `gone` and stops; `star` (0 to 1 and back) is its twinkle there for the caller's pooled star, and then `done`.
  const throwStep = (state, dt) => {
    if (state.done) return;
    if (state.gone) {
      state.goneTime += dt;
      if (state.goneTime >= TWINKLE_TIME) { state.done = true; state.star = 0; } else state.star = Math.sin(Math.PI * state.goneTime / TWINKLE_TIME);
      return;
    }
    const g = state.crossed ? 0 : GRAVITY, x0 = state.x, y0 = state.y, z0 = state.z;
    state.x += state.vx * dt; state.y += state.vy * dt - 0.5 * g * dt * dt; state.z += state.vz * dt; state.vy -= g * dt;
    turn(state.q, state.w, 0, dt);
    if (state.plane && !state.crossed) {
      const s1 = state.x * state.nx + state.y * state.ny + state.z * state.nz - state.nd;
      if (s1 >= 0) {
        const s0 = x0 * state.nx + y0 * state.ny + z0 * state.nz - state.nd, f = s0 < 0 ? s0 / (s0 - s1) : 0;
        state.cx = x0 + (state.x - x0) * f; state.cy = y0 + (state.y - y0) * f; state.cz = z0 + (state.z - z0) * f;
        state.crossTime = state.time + f * dt; state.crossed = true;
      }
    }
    state.time += dt;
    const ex = state.x - state.ox, ey = state.y - state.oy, ez = state.z - state.oz;
    state.dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
    state.scale = state.dist <= SHRINK_FROM ? 1 : Math.max(MIN_SCALE, 1 - (1 - MIN_SCALE) * (state.dist - SHRINK_FROM) / (REMOVE_DIST - SHRINK_FROM));
    if (state.dist >= REMOVE_DIST) state.gone = true;
  };
  // A displayed frame's worth of steps: `frameDt` (held to 0.1 s) accumulated into FIXED steps, at most MAX_SUBSTEPS.
  // Returns the steps taken.
  const throwRun = (state, frameDt) => {
    state.acc += frameDt < 0.1 ? frameDt : 0.1;
    let n = 0;
    while (state.acc >= FIXED && n < MAX_SUBSTEPS) { throwStep(state, FIXED); state.acc -= FIXED; n++; }
    if (n === MAX_SUBSTEPS) state.acc = 0;
    return n;
  };

  // ---- the aim ----
  // An aim's result: `ok`, `reason` (below), the pane (`pane`, its `id`) and the point on its plane (`x`, `y`, `z`, `t`
  // along the ray), and after arcTo the launch direction (`dx`, `dy`, `dz`), `charge` and flight `time` to the point.
  // Reasons: "glass" (ok), "frame" (a mullion, post or the transom), "sill", "vault" (over the glass's head), "column",
  // "blocked" (another blocker), "far" (past MAX_THROW), "none" (no wall ahead), and from arcTo "near", "speed", "low"
  // (would hit the balustrade outside: aim higher) and "high" (would meet the cornice).
  const createAim = () => ({ ok: false, reason: "none", id: -1, pane: null, t: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, charge: 0, time: 0 });
  // Whether a unit ray meets a blocker nearer than NEAREST[0]. Every blocker has one shape, { kind, x, z, r, x0, x1, y0,
  // y1, z0, z1 } (`cylinder` and `box` make them): a "cylinder" stands upright at x, z with radius r from y0 to y1, a
  // "box" spans x0 to x1, y0 to y1 and z0 to z1. (One shape keeps these reads monomorphic, and the distance goes in and a
  // yes or no comes out through an array and a boolean, so nothing is boxed per blocker.)
  const NEAREST = new Float64Array(1);
  const blocks = (b, o, d) => {
    const best = NEAREST[0];
    if (b.kind === "cylinder") {
      const ex = o.x - b.x, ez = o.z - b.z, a = d.x * d.x + d.z * d.z;
      if (a < 1e-12) return false;
      const bb = ex * d.x + ez * d.z, c = ex * ex + ez * ez - b.r * b.r, disc = bb * bb - a * c;
      if (disc < 0) return false;
      const root = Math.sqrt(disc), t0 = (-bb - root) / a, t1 = (-bb + root) / a, t = t0 > 0 ? t0 : t1 > 0 ? 0 : -1;
      if (t < 0 || t >= best) return false;
      const y = o.y + d.y * t;
      return y >= b.y0 && y <= b.y1;
    }
    let lo = 0, hi = best;
    for (let k = 0; k < 3; k++) {
      const ok = k === 0 ? o.x : k === 1 ? o.y : o.z, dk = k === 0 ? d.x : k === 1 ? d.y : d.z;
      const mn = k === 0 ? b.x0 : k === 1 ? b.y0 : b.z0, mx = k === 0 ? b.x1 : k === 1 ? b.y1 : b.z1;
      if (Math.abs(dk) < 1e-12) { if (ok < mn || ok > mx) return false; continue; }
      let a = (mn - ok) / dk, c = (mx - ok) / dk;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > lo) lo = a; if (c < hi) hi = c;
      if (lo > hi) return false;
    }
    return lo < best;
  };
  // Blockers of that shape, for a scene adding its own (a bar, a cage) to the glazing's. Freeze a list of them only
  // once all exist (or leave them open), so they share one map.
  const blocker = (kind, x, z, r, x0, x1, y0, y1, z0, z1) => ({ kind, x, z, r, x0, x1, y0, y1, z0, z1 });
  const cylinder = (x, z, r, y0, y1) => blocker("cylinder", x, z, r, x - r, x + r, y0, y1, z - r, z + r);
  const box = (x0, x1, y0, y1, z0, z1) => blocker("box", (x0 + x1) / 2, (z0 + z1) / 2, 0, x0, x1, y0, y1, z0, z1);
  // Where a ray (`origin`, unit `dir`: from the carrier's head or the camera) meets the glazing's panes (`panes`, the
  // glazing's `panes()`), the first it reaches through its glass: true, with `out` the pane and point, when a body can
  // pass there (BODY_CLEAR from every frame member, sill and transom, within MAX_THROW level distance, and no blocker
  // nearer); false with the reason otherwise (the pane and point still written when one was met).
  const aimAt = (panes, origin, dir, out, blockers) => {
    out.ok = false; out.reason = "none"; out.id = -1; out.pane = null;
    // 1e30 rather than Infinity for "none yet": a heap constant there kept the nearest distance boxed.
    let best = 1e30, hit = null, wallT = 1e30, wallReason = "none";
    for (let i = 0; i < panes.length; i++) {
      const p = panes[i], den = dir.x * p.nx + dir.z * p.nz;
      if (den <= 1e-6) continue;
      const t = ((p.cx - origin.x) * p.nx + (p.cz - origin.z) * p.nz) / den;
      if (t <= 0) continue;
      const hx = origin.x + dir.x * t, hy = origin.y + dir.y * t, hz = origin.z + dir.z * t, along = (hx - p.cx) * p.ux + (hz - p.cz) * p.uz;
      if (along > p.halfW + 1e-9 || along < -p.halfW - 1e-9) continue;
      if (hy >= p.y0 && hy <= p.y1) { if (t < best) { best = t; hit = p; } }
      else if (t < wallT && ((hy < p.y0 && p.tier === 0) || (hy > p.y1 && p.tier === 1))) { wallT = t; wallReason = hy < p.y0 ? "sill" : "vault"; }
    }
    if (!hit) { out.reason = wallReason; return false; }
    out.t = best; out.pane = hit; out.id = hit.id;
    out.x = origin.x + dir.x * best; out.y = origin.y + dir.y * best; out.z = origin.z + dir.z * best;
    const lx = out.x - origin.x, lz = out.z - origin.z;
    if (lx * lx + lz * lz > MAX_THROW * MAX_THROW) { out.reason = "far"; return false; }
    NEAREST[0] = best;
    if (blockers) for (let i = 0; i < blockers.length; i++) if (blocks(blockers[i], origin, dir)) { out.reason = blockers[i].kind === "cylinder" ? "column" : "blocked"; return false; }
    const p = hit, along = (out.x - p.cx) * p.ux + (out.z - p.cz) * p.uz, alongAt = out.x * p.ux + out.z * p.uz;
    if (out.y - p.y0 < BODY_CLEAR) { out.reason = p.tier === 0 ? "sill" : "frame"; return false; }
    if (p.y1 - out.y < BODY_CLEAR) { out.reason = p.tier === 1 ? "vault" : "frame"; return false; }
    if (p.halfW - Math.abs(along) < p.edge + BODY_CLEAR) { out.reason = "frame"; return false; }
    for (let i = 0; i < p.members.length; i++) if (Math.abs(alongAt - p.members[i]) < p.memberHalf + BODY_CLEAR) { out.reason = "frame"; return false; }
    out.reason = "glass"; out.ok = true;
    return true;
  };
  // The launch that carries a body from `from` (over the carrier's head) through `point` on the glass: a ballistic arc
  // at a level speed rising with distance (ARC_BASE, ARC_GAIN, ARC_MIN, ARC_MAX), as a unit direction (`out.dx`, `dy`,
  // `dz`) and the `charge` throwInit turns back into that speed, with the flight `time`. With `pane` (the pane aimed at)
  // it also refuses an arc whose straight run on past the glass would not clear the balustrade outside ("low") or
  // whose top would meet the cornice ("high"). `point` may be `out` itself (plan does that).
  const arcTo = (from, point, out, pane) => {
    const px = point.x, py = point.y, pz = point.z, dx = px - from.x, dy = py - from.y, dz = pz - from.z, level = Math.sqrt(dx * dx + dz * dz);
    out.ok = false;
    if (level < ARC_NEAR) { out.reason = "near"; return false; }
    if (level > MAX_THROW) { out.reason = "far"; return false; }
    const vh = Math.min(ARC_MAX, Math.max(ARC_MIN, ARC_BASE + ARC_GAIN * level)), T = level / vh;
    const vx = dx / T, vz = dz / T, vy = dy / T + 0.5 * GRAVITY * T, speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed < SPEED_MIN || speed > SPEED_MAX) { out.reason = "speed"; return false; }
    if (pane) {
      const vn = vx * pane.nx + vz * pane.nz;
      if (vn <= 1e-6) { out.reason = "none"; return false; }
      if (py + (vy - GRAVITY * T) * pane.rail.dist / vn - BODY_CLEAR <= pane.rail.top) { out.reason = "low"; return false; }
      if (vy > 0 && vy / GRAVITY < T && from.y + vy * vy / (2 * GRAVITY) > pane.ceiling - BODY_CLEAR) { out.reason = "high"; return false; }
    }
    out.dx = vx / speed; out.dy = vy / speed; out.dz = vz / speed;
    out.charge = (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN); out.time = T;
    out.ok = true; out.reason = "glass";
    return true;
  };
  // aimAt then arcTo from `from` (the carried spot) to the point aimed at: true when the throw can go, with `out`
  // holding everything throwInit takes (`out.dx..dz`, `out.charge`, `out.pane`).
  const plan = (panes, origin, dir, from, out, blockers) => aimAt(panes, origin, dir, out, blockers) && arcTo(from, out, out, out.pane);

  // ---- the practice tables' computer opponents -----------------------------------------------------------------
  // Every practice table nobody is playing at is pre-seated with NPC_COUNTS[i % 4] of the rules' own computer players
  // (2 to 5, never the same at two tables whose indexes are one or two apart: the pair across the aisle and the next
  // down the bank), in seats spread round it from a start that turns with the table. No table ever holds more than
  // NPC_MAX of them, so at least SEATS - NPC_MAX (four) seats stay free of NPCs for real players. These read only
  // which seats are taken and by a bot: never a seat's private hand.
  const NPC_MAX = 5, NPC_COUNTS = Object.freeze([2, 4, 5, 3]), SEAT_COUNT = 9;
  const npcSeats = Object.freeze(Array.from({ length: 10 }, (_, t) => {
    const n = NPC_COUNTS[t % 4], start = (t * 2) % SEAT_COUNT;
    return Object.freeze(Array.from({ length: n }, (_, k) => (start + Math.round(k * SEAT_COUNT / n)) % SEAT_COUNT));
  }));
  const botId = (table, seat) => `bot-${table}-${seat}`;
  const botsAt = seats => { let n = 0; for (let i = 0; i < seats.length; i++) if (seats[i] && seats[i].bot) n++; return n; };
  // Seats table `t`'s pattern opponents (rules table `table`) in its free pattern seats, skipping a seat `skip(seat)`
  // names, while it holds fewer than NPC_MAX; only between hands. Returns how many sat down.
  const preseat = (table, t, skip = null) => {
    if (table.playing) return 0;
    const seats = table.snapshot().seats, list = npcSeats[t % npcSeats.length];
    let bots = botsAt(seats), added = 0;
    for (let k = 0; k < list.length && bots < NPC_MAX; k++) {
      const s = list[k];
      if (seats[s] || skip && skip(s)) continue;
      table.join(botId(t, s), `Bot ${s + 1}`, true, s); bots++; added++;
    }
    return added;
  };
  // Up to `count` more opponents at table `t` (the "Quick seat" and "Add bots" buttons), its pattern seats first, then
  // any free seat, never past NPC_MAX. The rules refuse it during a hand. Returns how many sat down.
  const addBots = (table, t, count) => {
    const seats = table.snapshot().seats, list = npcSeats[t % npcSeats.length];
    let bots = botsAt(seats), added = 0;
    const sit = s => { if (added < count && bots < NPC_MAX && !seats[s]) { table.join(botId(t, s), `Bot ${s + 1}`, true, s); seats[s] = true; bots++; added++; } };
    for (let k = 0; k < list.length; k++) sit(list[k]);
    for (let s = 0; s < SEAT_COUNT; s++) sit(s);
    return added;
  };
  // Ask Ooga To Move at a practice table: whether the request can wait for the seat (a bot sits there), and whether
  // it has to wait for the hand to end first (the rules empty no seat during a hand).
  const isBot = (table, seat) => { const p = table.snapshot().seats[seat]; return !!p && p.bot; };
  const mustWait = table => table.playing;
  // Frees the bot's seat with the rules' own `leave`, between hands only: true when the seat is empty after.
  const freeSeat = (table, seat) => {
    const p = table.snapshot().seats[seat];
    if (!p || !p.bot || table.playing) return false;
    table.leave(p.id);
    return !table.snapshot().seats[seat];
  };

  BL.pokerCarry = Object.freeze({
    NPC_MAX, NPC_COUNTS, npcSeats, botId, preseat, addBots, isBot, mustWait, freeSeat,
    LIFT_TIME, GRIP_AT, HOIST_FROM, WIND_TIME, RELEASE_TIME, RELEASE_AT, LEG_SHARE, HANDS, LIE_DEPTH, MIDDLE,
    STAND_ARMS, SIT_ARMS, SIT_LEGS, HOLD_HEAD, CARRIED_ARMS, CARRIED_LEGS, CARRIED_HEAD, CARRY_SPEED, CARRY_SPEED_SHARE, BOB,
    FIXED, MAX_SUBSTEPS, GRAVITY, SPEED_MIN, SPEED_MAX, MAX_THROW, REMOVE_DIST, SHRINK_FROM, MIN_SCALE, TWINKLE_TIME, TUMBLE, BODY_CLEAR,
    createPose, lift, hold, wind, release, rise, squirm, flail, settle, createCarried, carriedAt,
    createFlight, speedOf, throwInit, throwStep, throwRun, createAim, cylinder, box, aimAt, arcTo, plan
  });
})();
