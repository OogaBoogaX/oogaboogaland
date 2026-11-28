// Ooga Raid's Ooga: the visitor's own voxel caveman with its banana rifle, posed side-on from the rules engine's state.
//
// `create({ root, name })` builds the Ooga from `contributors.traitsFor(name)` and returns `{ node, pose, barrelTip,
// holdGap, bigHead, liveGeometry, dispose }`; `bigHead(on)` grows the head BIG_HEAD times about its foot (Shaman's
// Secrets' big heads, a look only: the sim's hit point is unchanged). `node` stands at the feet, scaled so the body (1.44 h, feet to hair) stands
// `raidModels.TALL` (1.06 m), as every standing foot soldier does (the reference's player and its foot troops stand one
// size, each filling its hit zone): every Ooga, whatever its height on the island, and both players alike. Everything below `node` keeps the rig's own units (heights of h), so the poses are unchanged and
// scale with it. `pose(dt, state, p, clock, room)` places it at player p's `(px, py, 0)` (`room` true on a rooms stage) and turns the
// rig's own parts toward the pose the sim's `pState`, `pPose`, `pAim`, `pFace`, `pDuck` and `pInvincible` call for,
// damped, allocating nothing; `clock` is the sim's state, read for its `time` (handed over as a number, the time would be
// boxed every call). Call it once a frame, after the sim's tick.
//
// Under `node`: a spin node turning about the play plane's normal round a pivot (tuck, prone and fall back), the body
// turned by yaw 0.35 rad toward the viewer from profile in either facing (never a negative scale, which would flip the
// faces' winding), then the rig. A lean pitches the rig's root about the hip with the legs counter-turned to stay
// upright. The rifle (`poseGun`) is solved onto the sim's shot start: its tip on `TUNE.MUZZLE`'s point for the pose and
// aim, its barrel at the aim's angle as the camera sees it, the right palm on its grip and the left hand on its fore-end.
//
// The poses, from section 7 of the design:
// - stand; run, its stride by |pvx|;
// - tuck and spin in every jump, whatever the aim (the reference's), two turns a second forward about the curled
//   body's middle, the rifle hidden: the ball is centred on the sim's air muzzle circle and squeezed to its radius, so
//   a shot leaves the ball's edge. Whatever ends the tuck, landing included, the turn is finished forward first;
// - prone, rolled flat about 0.4 h and centred on x, aiming forward;
// - the five aims, up, up-forward, forward, down-forward and down, each with its lean;
// - wade, lowered by half the body (1.44 h, feet to hair), the rifle on the water's muzzle points; duck under, lowered by
//   the whole body and hidden;
// - drop in, arms up and legs apart, no rifle; fall back on death, rolled about 0.3 h the way it faces, drifting back
//   in a hop; out of play, hidden;
// - a blink, shown on alternate twelfths of a second while `pInvincible` is above 0.
//
// The sim tests the Ooga as one point `RULES.PLAYER_POINT` (0.5 m) over its feet in every pose, so at the soldiers'
// height that point sits at the drawn body's middle, standing. The gun is its own part, posed by `poseGun` from the
// GUN constants; `barrelTip(out)` writes where the barrel's tip stands in the world (as of the last render's matrices)
// and returns out, or null while the gun is hidden.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, contributors } = BL;
  const { clamp, quat, mat4 } = BL.math;
  const { createNode, addChild, removeChild, updateLocal } = BL.scene;
  const { POSE, PSTATE, TUNE } = BL.raidSim;
  const PI = Math.PI, HALF = PI / 2, Q = PI / 4;

  // Turned toward the viewer from profile; the body's height from the feet to the top of the hair, in heights. A big
  // head's size.
  const YAW = 0.35, BODY = 1.44, BIG_HEAD = 1.9;
  // The aim's elevation over the facing by `pAim` (0 to 7 anticlockwise from right), and the lean each wants: back to
  // clear the hair aiming up, forward aiming down, more for down-forward while running.
  // A typed array, so the level aims' 0 reads as a fraction too: a frozen array keeps it a small integer, and V8 would
  // compile the pose's arithmetic for small integers, to throw it out at the first aim up or down.
  const ELEV = Float64Array.of(0, Q, HALF, Q, 0, -Q, -HALF, -Q);
  const LEAN_UP = -0.12, LEAN_UP_FWD = -0.06, LEAN_DOWN_FWD = 0.14, LEAN_RUN_DOWN = 0.1, LEAN_DOWN = 0.15;
  // Damping rates a second: limbs, the facing turn, the spin node's roll and pivot, and the sink into water.
  const LIMB = 14, TURN = 16, ROLL = 12, SINK = 10;
  // The stride: radians of phase per metre run per height, the leg swing on land and in water, and the bob.
  const STRIDE_RATE = 5.5, STRIDE = 0.7, STRIDE_WADE = 0.35, BOB = 0.035;
  // Tuck: two turns a second, the root's lean, the legs and arms against the root, and the curled body's middle
  // (TUCK_X forward of the feet in profile, TUCK_Y over them, measured at no spin). It spins about that middle, which
  // eases over px within EASE of takeoff and stays there, a turn-round in the air included, so the sim's hit point is
  // inside the ball. The ball's middle is lifted to the air muzzle circle's centre (`ballLift`), easing in and out at
  // TUCK_LIFT in EASE, and squeezed to its radius over EASE.
  // A tuck ending mid-turn stays tucked and finishes the turn at FINISH to the angle the next pose wants, then holds it
  // exactly: on the ground the short way when under a quarter turn off, forward otherwise (a flat jump lands half way
  // round, and the short way back would swing the head through the ground); in the air always the short way. Then for
  // UNFOLD_T the limbs and pivot settle at UNFOLD, and the feet stay planted: a rigid leg block turned at the hip
  // reaches lower than standing, so while still the body is raised by the reach of the lower foot's corner.
  const SPIN = 4 * PI, TUCK_LEAN = 0.8, TUCK_LEGS = -2.5, TUCK_ARMS = -1.7, TUCK_X = 0.4, TUCK_Y = 0.64, TUCK_LIFT = 0.15;
  const EASE = 0.1, FINISH = 6 * PI, UNFOLD = 30, UNFOLD_T = 0.2;
  // A leg block below the hip, in sixteenths of the height: its length, the foot's reach forward and back, half width.
  const LEG = 5, TOE = 4.5, HEEL = 2.5, LEG_HALF = 2;
  // Prone: the pivot, the shift forward that centres the lying body on x, and how far it lowers to lie on the ground.
  const PRONE_PIVOT = 0.4, PRONE_SHIFT = 0.32, PRONE_LIFT = -0.08;
  // Duck: the whole body and a little more under the surface.
  const DUCK_EXTRA = 0.05;
  // Drop in: both arms up. Fall back: the pivot, the arms flung up, the drift back and the hop, in heights.
  const DROP_ARMS = -PI + 0.25, DEAD_PIVOT = 0.3, DEAD_LIFT = 0.08, DEAD_ARMS = -PI + 0.45, DEAD_DRIFT = 0.55, DEAD_HOP = 0.4;
  // The gun, in heights of the rig: the palm along the right arm (as `crew.js` seats it); in the gun's own frame (its
  // barrel along +z, before SCALE) the grip and the barrel's tip (the end of `models`' barrel, 0.66 h out). SCALE
  // shortens the island's rifle to a carbine the Ooga's rigid arm can hold with its tip on the sim's muzzle points.
  const GUN = Object.freeze({
    PALM_Y: -0.625, PALM_Z: 0.15, GRIP_Y: -0.14, GRIP_Z: -0.184, TIP_Y: -0.01, TIP_Z: 0.66, SCALE: 0.75
  });
  // The rifle follows its aim and muzzle point at AIM a second (faster than the limbs, so a tapped shot leaves the
  // barrel), and fades between the held rifle and the free arms at the limbs' rate.
  const AIM = 30;
  // How far an arm may be drawn in or out along its length to put its hand on the rifle.
  const REACH = Object.freeze([0.6, 1.3]);
  // The air ball: the sim's muzzle circle in the air (its centre over the feet and its radius, from TUNE.MUZZLE), and
  // the curled body's radius about its middle at no squeeze, in heights; the ball is squeezed to the circle's radius.
  // TUNE.MUZZLE read once into one typed array, [forward, up] at (pose * 8 + k) * 2: the frame reads numbers from one
  // kind of array, not the table's frozen rows, whose differing shapes would keep the pose from being optimized.
  const MZ = Float64Array.from(TUNE.MUZZLE.flatMap((row) => row.flatMap((m) => [m[0], m[1]])));
  const AIR = TUNE.MUZZLE[POSE.JUMP], AIR_UP = AIR.reduce((n, m) => n + m[1], 0) / AIR.length;
  const AIR_R = Math.hypot(AIR[0][0], AIR[0][1] - AIR_UP), TUCK_R = 0.768;
  // The eyes' blink.
  const BLINK_EVERY = 3.7, BLINK_FOR = 0.13;

  const ARM_Q = quat.create(), GRIP_Q = quat.create(), FREE_Q = quat.create(), V = new Float32Array(3);
  // The rig's frame in the world this frame (node, spin, body and rig composed) and the vectors the rifle is solved in.
  const RIG = mat4.create(), AB = new Float64Array(6), P3 = new Float64Array(3), AT = new Float64Array(3), TIP = new Float64Array(3), GRIP = new Float64Array(3), W = new Float64Array(3), R3 = new Float64Array(3);
  // A fraction handed to or returned from a call that is not inlined is boxed into a new heap number, so `pose` hands
  // its numbers to its larger helpers (and to quat's `fromEulerIn` and `rotateVecIn`) through this array instead.
  const IO = new Float64Array(4);
  const wrap = (a) => a - 2 * PI * Math.floor((a + PI) / (2 * PI));
  const toward = (current, target, k) => current + (target - current) * k;
  const stepTo = (current, target, max) => current + clamp(target - current, -max, max);
  // How far the lower of two legs, each turned by x about the hip and splayed by z (IO 0 and 1 the right's, 2 and 3 the
  // left's), reaches below a standing foot, in sixteenths, into IO[0].
  // The rotation turning unit vector a onto unit vector b, the short way, into q.
  // (The vectors come in AB, the points in P3, as numbers handed over a call would be boxed.)
  const arc = (q) => {
    const ax = AB[0], ay = AB[1], az = AB[2], bx = AB[3], by = AB[4], bz = AB[5], d = ax * bx + ay * by + az * bz;
    if (d < -0.9999) { q[0] = 1; q[1] = 0; q[2] = 0; q[3] = 0; return; }
    q[0] = ay * bz - az * by; q[1] = az * bx - ax * bz; q[2] = ax * by - ay * bx; q[3] = 1 + d;
    // Written out: Math.hypot boxes its arguments.
    const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    q[0] /= n; q[1] /= n; q[2] /= n; q[3] /= n;
  };
  // A point of the rig's frame into the world (into W), and a world point back into the rig's frame (into R3): the
  // rig's frame is a turn and the node's uniform scale, so its inverse is its transpose over the scale squared.
  const toWorld = () => {
    const m = RIG, x = P3[0], y = P3[1], z = P3[2];
    W[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; W[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; W[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  };
  const toRig = () => {
    const m = RIG, x = P3[0], y = P3[1], z = P3[2], s2 = m[0] * m[0] + m[1] * m[1] + m[2] * m[2], dx = x - m[12], dy = y - m[13], dz = z - m[14];
    R3[0] = (m[0] * dx + m[1] * dy + m[2] * dz) / s2; R3[1] = (m[4] * dx + m[5] * dy + m[6] * dz) / s2; R3[2] = (m[8] * dx + m[9] * dy + m[10] * dz) / s2;
  };
  const reach = () => {
    let most = 0;
    for (let i = 0; i < 4; i += 2) {
      const x = IO[i], z = IO[i + 1];
      most = Math.max(most, Math.cos(z) * (LEG * Math.cos(x) + (x > 0 ? TOE : HEEL) * Math.abs(Math.sin(x))) + LEG_HALF * Math.abs(Math.sin(z)) - LEG);
    }
    IO[0] = most;
  };

  const create = ({ root, name }) => {
    const traits = contributors.traitsFor(name);
    const cave = models.caveman(traits);
    const h = traits.height, parts = cave.parts, rig = cave.root, gun = parts.gun;
    const node = createNode(), spin = createNode(), body = createNode();
    addChild(body, rig);
    addChild(spin, body);
    addChild(node, spin);
    addChild(root, node);
    node.scale.x = node.scale.y = node.scale.z = BL.raidModels.TALL / (BODY * h);
    parts.club.visible = false;
    parts.snack.visible = false;
    gun.visible = true;
    const hand = parts.armR.quaternion = quat.create(), handL = parts.armL.quaternion = quat.create();
    const scale = node.scale.x, ballLift = AIR_UP / scale - TUCK_Y * h, squeeze = AIR_R / (TUCK_R * h * scale);
    gun.scale.x = gun.scale.y = gun.scale.z = GUN.SCALE;
    const full = BODY * h + DUCK_EXTRA, middle = TUCK_X * h / Math.cos(YAW), u = h / 16;
    // Every damped value, as the pose last left it; `last` is the last pState seen, -1 before the first pose. The spin
    // turns about the body's point (pivotX, pivot), which sits at (lx, ly) from the feet; `unfold` counts down the
    // settle after a tuck.
    const a = {
      last: -1, turning: 0, unfold: 0, yaw: HALF - YAW, roll: 0, pivotX: 0, pivot: 0, lx: 0, ly: 0, lift: 0, ball: 1, sink: 0, lean: 0,
      gunE: 0, tf: 0.5, tu: 0.66, g: 0, hold: 0, gap: 0,
      rRx: -0.2, rRz: -0.1, wrist: 0, lRx: -0.2, lRz: 0.1, legR: 0, legL: 0, legRz: 0, legLz: 0, head: 0,
      phase: 0, stride: 0
    };
    // Every damped value but `last` and `turning` (whole numbers) comes to hold fractions. V8 lays out a field first
    // stored a small integer for small integers, and the first fraction stored there changes the record's shape, which
    // sends `pose` and `poseGun` back through V8's slower tiers (where every number is boxed) for tens of seconds of play:
    // so each is stored a fraction once here, then its start value, and the record keeps one shape from the first pose.
    for (const key of Object.keys(a)) if (key !== "last" && key !== "turning") { const start = a[key]; a[key] = 0.5; a[key] = start; }
    // Turn about another point of the body, (IO[0], IO[1]), without moving the picture.
    const repivot = () => {
      const x = IO[0], y = IO[1], c = Math.cos(a.roll), sn = Math.sin(a.roll), dx = x - a.pivotX, dy = y - a.pivot;
      a.lx += c * dx - sn * dy;
      a.ly += sn * dx + c * dy;
      a.pivotX = x;
      a.pivot = y;
    };

    // The rifle with its tip on the world point (tx, ty) (the sim's muzzle point, eased), its barrel along the screen
    // angle a.gunE from the facing (fd, -1 to 1 through a turn), and the right palm on its grip: the rig's frame solved
    // in the world, the gun's pitch the one whose barrel the camera sees at that angle, and the palm on the line through
    // the screen point where the arm reaches it, in front of the shoulder, so the rifle is drawn over the body. It is
    // held one-handed: the left arm swings free, as a second hand would hide the short rifle. Where the arm falls short
    // or long even drawn in or out, the rifle still keeps its tip and the arm points at it; a.gap keeps by how much.
    const poseGun = () => {
      const tx = AT[0], ty = AT[1], fd = AT[2];
      updateLocal(node); updateLocal(spin); updateLocal(body); updateLocal(rig);
      mat4.multiply(RIG, node.local, spin.local);
      mat4.multiply(RIG, RIG, body.local);
      mat4.multiply(RIG, RIG, rig.local);
      // The aim's screen direction passes through IO, so it reaches the sums below as fractions even while the aim is
      // level: Math.sin(0) is the small integer 0, and V8 would compile them for small integers, to throw them out at the
      // first aim up or down.
      IO[0] = fd * Math.cos(a.gunE); IO[1] = Math.sin(a.gunE);
      const m = RIG, gs = GUN.SCALE * h, cx = IO[0], cy = IO[1];
      if (cx * cx + cy * cy > 0.04) {
        const c1 = cx * m[5] - cy * m[4], c2 = cx * m[9] - cy * m[8];
        let g = Math.atan2(-c2, c1);
        if (cx * (Math.sin(g) * m[4] + Math.cos(g) * m[8]) + cy * (Math.sin(g) * m[5] + Math.cos(g) * m[9]) < 0) g += PI;
        a.g = g;
      }
      IO[0] = -a.g; IO[1] = 0; IO[2] = 0;
      quat.fromEulerIn(gun.quaternion, IO);
      IO[0] = 0; IO[1] = GUN.TIP_Y * gs; IO[2] = GUN.TIP_Z * gs;
      quat.rotateVecIn(TIP, gun.quaternion, IO);
      IO[1] = GUN.GRIP_Y * gs; IO[2] = GUN.GRIP_Z * gs;
      quat.rotateVecIn(GRIP, gun.quaternion, IO);
      // The grip to the tip in the world, and the shoulder.
      const gx = TIP[0] - GRIP[0], gy = TIP[1] - GRIP[1], gz = TIP[2] - GRIP[2];
      const wx = m[0] * gx + m[4] * gy + m[8] * gz, wy = m[1] * gx + m[5] * gy + m[9] * gz, wz = m[2] * gx + m[6] * gy + m[10] * gz;
      const sh = parts.armR.position;
      P3[0] = sh.x; P3[1] = sh.y; P3[2] = sh.z;
      toWorld();
      const sx = W[0], sy = W[1], sz = W[2], k = Math.sqrt(m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
      const arm = Math.sqrt(GUN.PALM_Y * GUN.PALM_Y + GUN.PALM_Z * GUN.PALM_Z) * h * k, px = tx - wx - sx, py = ty - wy - sy, rest = arm * arm - px * px - py * py;
      // The palm in front of the shoulder (toward the camera), so the rifle is drawn over the body.
      const pz = sz + (rest > 0 ? Math.sqrt(rest) : 0);
      P3[0] = tx; P3[1] = ty; P3[2] = pz + wz;
      toRig();
      gun.position.x = R3[0] - TIP[0]; gun.position.y = R3[1] - TIP[1]; gun.position.z = R3[2] - TIP[2];
      // The right arm: its palm (through the wrist's roll) turned onto the grip.
      P3[0] = tx - wx; P3[1] = ty - wy; P3[2] = pz;
      toRig();
      let dx = R3[0] - sh.x, dy = R3[1] - sh.y, dz = R3[2] - sh.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      IO[0] = 0; IO[1] = HALF; IO[2] = 0;
      quat.fromEulerIn(GRIP_Q, IO);
      IO[0] = 0; IO[1] = GUN.PALM_Y; IO[2] = GUN.PALM_Z;
      quat.rotateVecIn(V, GRIP_Q, IO);
      const v = Math.sqrt(V[0] * V[0] + V[1] * V[1] + V[2] * V[2]);
      AB[0] = V[0] / v; AB[1] = V[1] / v; AB[2] = V[2] / v; AB[3] = dx / d; AB[4] = dy / d; AB[5] = dz / d;
      arc(ARM_Q);
      quat.multiply(ARM_Q, ARM_Q, GRIP_Q);
      if (a.hold > 0.999) quat.copy(hand, ARM_Q);
      else quat.slerpTo(hand, ARM_Q, a.hold);
      // The arm drawn out or in along its length (as if bent at the elbow, within REACH) to span the shoulder to the
      // grip, faded with the hold; a.gap keeps how far short (above 0) or long (below) it stays, in metres.
      const want = d * k, st = Math.min(Math.max(want / arm, REACH[0]), REACH[1]);
      parts.armR.scale.y = 1 + (st - 1) * a.hold;
      a.gap = want - arm * st;
    };
    const barrelTip = (out) => {
      if (!gun.visible || !node.visible) return null;
      mat4.transformPoint(out, gun.world, 0, GUN.TIP_Y * h, GUN.TIP_Z * h);
      return out;
    };

    const pose = (dt, s, p, clock, room) => {
      const state = s.pState[p], time = clock.time;
      if (state === PSTATE.OUT) {
        node.visible = false;
        a.last = state;
        return;
      }
      // The first pose, and every drop in (a fresh Ooga high over the screen), start settled.
      const snap = a.last === -1 || (state === PSTATE.DROP && a.last !== PSTATE.DROP);
      a.last = state;
      let kL = snap ? 1 : 1 - Math.exp(-LIMB * dt);
      const kT = snap ? 1 : 1 - Math.exp(-TURN * dt);
      const kS = snap ? 1 : 1 - Math.exp(-SINK * dt), kF = 1 - Math.exp(-UNFOLD * dt);
      let kR = snap ? 1 : 1 - Math.exp(-ROLL * dt);
      const kind = s.pPose[p], face = s.pFace[p] < 0 ? -1 : 1, aim = s.pAim[p], speed = Math.abs(s.pvx[p]);
      const alive = state === PSTATE.NORMAL, air = kind === POSE.JUMP, elev = ELEV[aim];
      // Spinning in the tuck, or still finishing the turn it left unfinished (`turning`, the turn's direction).
      if (snap) a.turning = a.unfold = 0;
      const spinning = alive && air;
      const finishing = !spinning && a.turning !== 0 && (alive || state === PSTATE.DEAD);
      const tuck = spinning || finishing, armed = alive && !tuck;
      const water = kind === POSE.WATER && (alive || state === PSTATE.DROP);
      const running = armed && speed > 0.05 && (kind === POSE.STAND || water);

      let roll = 0, pivot = 0, shift = 0, lift = 0, sink = 0, lean = 0, gunE = 0, head = 0;
      let rRx = -0.2, rRz = -0.1, wrist = 0, lRx = -0.2, lRz = 0.1, legR = 0, legL = 0, legRz = 0, legLz = 0;
      let driftX = 0, driftY = 0, closed = false;
      if (armed) {
        if (kind === POSE.PRONE) {
          // Flat on the belly, head forward: "up" in the body's own frame is forward along the ground.
          roll = -face * HALF; pivot = PRONE_PIVOT * h; shift = -face * PRONE_SHIFT * h; lift = PRONE_LIFT * h;
          head = -0.9;
        } else {
          lean = elev > 1 ? LEAN_UP : elev > 0 ? LEAN_UP_FWD : elev < -1 ? LEAN_DOWN : elev < 0 ? LEAN_DOWN_FWD + (running ? LEAN_RUN_DOWN : 0) : 0;
          gunE = elev;
          head = -0.3 * elev;
          legR = legL = -lean;
        }
        // The free right arm's pose the held one fades from and to; the left swings free at the side, clear of the rifle.
        rRx = -HALF - gunE; rRz = 0; wrist = HALF;
        lRx = 0.25; lRz = 0.12;
      } else if (tuck) {
        pivot = TUCK_Y * h; lift = ballLift; lean = TUCK_LEAN;
        legR = legL = TUCK_LEGS; rRx = lRx = TUCK_ARMS; rRz = -0.3; lRz = 0.3;
      } else if (state === PSTATE.DROP) {
        rRx = lRx = DROP_ARMS; rRz = -0.15; lRz = 0.15; legRz = -0.15; legLz = 0.15;
      } else {
        // Fall back the way it faces, about 0.3 h, drifting back in a hop over TUNE.DEAD.
        const t = clamp(TUNE.DEAD - s.pTimer[p], 0, TUNE.DEAD), out = Math.min(1, t / 0.6);
        roll = face * HALF; pivot = DEAD_PIVOT * h; lift = DEAD_LIFT * h; lean = -0.15;
        rRx = lRx = DEAD_ARMS; rRz = -0.35; lRz = 0.35; legR = legL = -0.5; head = 0.3; closed = true;
        driftX = -face * DEAD_DRIFT * h * (1 - (1 - out) * (1 - out));
        driftY = DEAD_HOP * h * Math.sin(Math.min(1, t / 0.5) * PI);
      }
      if (water) sink = s.pDuck[p] ? full : BODY * h / 2;

      a.yaw = toward(a.yaw, face > 0 ? HALF - YAW : -HALF + YAW, kT);
      a.unfold = Math.max(0, a.unfold - dt);
      if (tuck && !snap) {
        // The middle as the body's yaw now carries it. Entering, the spin moves there without moving the picture;
        // after that it follows the yaw, so a turn-round in the air turns the body about a middle that stays put.
        const mx = middle * Math.sin(a.yaw);
        if (a.turning === 0) { IO[0] = mx; IO[1] = pivot; repivot(); }
        else { a.pivotX = mx; a.pivot = pivot; }
        if (spinning) {
          a.turning = -face;
          a.roll = wrap(a.roll - face * SPIN * dt);
        } else {
          const to = state === PSTATE.DEAD ? face * HALF : kind === POSE.PRONE ? -face * HALF : 0, off = wrap(to - a.roll);
          const dir = air || Math.abs(off) < HALF ? Math.sign(off) : a.turning, ahead = dir * off < 0 ? dir * off + 2 * PI : dir * off;
          if (ahead > FINISH * dt) a.roll = wrap(a.roll + dir * FINISH * dt);
          else {
            // Done: hand over to the next pose's pivot without moving the picture, and settle quickly.
            a.roll = to;
            a.turning = 0;
            a.unfold = UNFOLD_T;
            IO[0] = 0; IO[1] = state === PSTATE.DEAD ? DEAD_PIVOT * h : kind === POSE.PRONE ? PRONE_PIVOT * h : 0; repivot();
          }
        }
        // While tucked the middle eases over px, at its height.
        if (a.turning !== 0) {
          const ex = -a.lx, ey = pivot - a.ly, d = Math.sqrt(ex * ex + ey * ey), most = TUCK_X * h / EASE * dt;
          if (d <= most) { a.lx = 0; a.ly = pivot; } else { a.lx += ex * most / d; a.ly += ey * most / d; }
        }
      } else {
        a.roll = wrap(a.roll + wrap(roll - a.roll) * kR);
        if (a.unfold > 0) kR = kF;
        a.pivotX = toward(a.pivotX, 0, kR); a.pivot = toward(a.pivot, pivot, kR);
        a.lx = toward(a.lx, shift, kR); a.ly = toward(a.ly, pivot, kR);
      }
      a.lift = snap ? lift : stepTo(a.lift, lift, TUCK_LIFT * h / EASE * dt);
      a.ball = snap ? (tuck ? squeeze : 1) : stepTo(a.ball, tuck ? squeeze : 1, (1 - squeeze) / EASE * dt);
      if (a.unfold > 0) kL = kF;
      a.sink = toward(a.sink, sink, kS);
      a.lean = toward(a.lean, lean, kL);
      a.hold = snap ? (armed ? 1 : 0) : toward(a.hold, armed ? 1 : 0, kL);
      a.rRx = toward(a.rRx, rRx, kL); a.rRz = toward(a.rRz, rRz, kL); a.wrist = toward(a.wrist, wrist, kL);
      a.lRx = toward(a.lRx, lRx, kL); a.lRz = toward(a.lRz, lRz, kL);
      a.legR = toward(a.legR, legR, kL); a.legL = toward(a.legL, legL, kL);
      a.legRz = toward(a.legRz, legRz, kL); a.legLz = toward(a.legLz, legLz, kL);
      a.head = toward(a.head, head, kL);
      a.stride = toward(a.stride, running ? (water ? STRIDE_WADE : STRIDE) : 0, kL);
      if (running) a.phase = (a.phase + dt * speed / h * STRIDE_RATE) % (2 * PI);
      const swing = Math.sin(a.phase) * a.stride, bob = water ? 0 : Math.abs(Math.sin(a.phase)) * a.stride * BOB * h;
      // Feet planted while upright and still (the run keeps its own bob).
      let plant = 0;
      if (!tuck && roll === 0) {
        IO[0] = a.lean + a.legR + swing; IO[1] = a.legRz; IO[2] = a.lean + a.legL - swing; IO[3] = a.legLz;
        reach();
        plant = Math.max(0, 1 - a.stride / STRIDE) * u * IO[0];
      }

      node.position.x = s.px[p];
      node.position.y = s.py[p];
      node.position.z = 0;
      spin.position.x = a.lx + driftX;
      spin.position.y = a.ly + a.lift + plant - a.sink + driftY + bob;
      spin.rotation.z = a.roll;
      spin.scale.x = spin.scale.y = spin.scale.z = a.ball;
      body.position.x = -a.pivotX;
      body.position.y = -a.pivot;
      body.rotation.y = a.yaw;
      rig.rotation.x = a.lean;
      parts.legR.rotation.x = a.legR + swing;
      parts.legL.rotation.x = a.legL - swing;
      parts.legR.rotation.z = a.legRz;
      parts.legL.rotation.z = a.legLz;
      parts.head.rotation.x = a.head;
      IO[0] = a.lRx + (armed ? 0 : swing * 0.6); IO[1] = 0; IO[2] = a.lRz;
      quat.fromEulerIn(handL, IO);
      IO[0] = a.rRx; IO[1] = 0; IO[2] = a.rRz;
      quat.fromEulerIn(FREE_Q, IO);
      IO[0] = 0; IO[1] = a.wrist; IO[2] = 0;
      quat.fromEulerIn(GRIP_Q, IO);
      quat.multiply(hand, FREE_Q, GRIP_Q);
      quat.fromEuler(parts.fingersR.quaternion, 0, armed ? 0 : HALF, 0);
      quat.fromEuler(parts.fingersL.quaternion, 0, armed ? 0 : -HALF, 0);

      // The rifle's tip on the sim's muzzle point for this pose and aim (`TUNE.MUZZLE`, mirrored facing left; in a room
      // an up or up-forward shot starts at the forward point's height, its reach along the aim), eased with its aim.
      gun.visible = armed;
      if (!armed) parts.armR.scale.y = 1;
      if (armed) {
        const at = (kind * 8 + (room && elev > 0 ? 0 : face > 0 ? aim : (12 - aim) & 7)) * 2;
        const kA = snap ? 1 : 1 - Math.exp(-AIM * dt);
        a.tf = toward(a.tf, room && elev > 0 ? MZ[at] * Math.cos(elev) : MZ[at], kA);
        a.tu = toward(a.tu, MZ[at + 1], kA);
        a.gunE = toward(a.gunE, gunE, kA);
        const fd = Math.sin(a.yaw) / Math.cos(YAW);
        AT[0] = s.px[p] + fd * a.tf; AT[1] = s.py[p] + a.tu; AT[2] = fd;
        poseGun();
      }
      parts.head.geometry = closed || time % BLINK_EVERY < BLINK_FOR ? cave.headClosed : cave.headOpen;
      node.visible = !(s.pInvincible[p] > 0 && ((time * 12) | 0) & 1) && !(s.pDuck[p] && a.sink > 0.9 * full);
    };

    // Both heads, so the blink's swap never uploads mid-run.
    const liveGeometry = (set) => {
      set.add(cave.headOpen).add(cave.headClosed);
    };
    const dispose = () => {
      if (node.parent) removeChild(node.parent, node);
    };
    // How far the right hand falls short of the rifle's grip (above 0) or reaches past it (below), in metres.
    const holdGap = () => a.gap;
    const bigHead = (on) => {
      parts.head.scale.x = parts.head.scale.y = parts.head.scale.z = on ? BIG_HEAD : 1;
    };
    return { node, pose, barrelTip, holdGap, bigHead, liveGeometry, dispose };
  };

  BL.raidCrew = { create };
})();
