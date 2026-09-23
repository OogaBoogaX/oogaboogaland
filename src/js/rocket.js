// Ooga Orbit flight: the attached stack as one body over a round world; gravity pulls to the world's centre,
// air thins with height, stages drop, ascent lean stays in the launch plane. Fixed step, no allocation.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { rocketParts } = BL;
  const { clamp, quat } = BL.math;
  const G0 = rocketParts.G0;
  // World: islands float on a sea atop a sphere; launches go down the launch plane (x = 0) toward +z.
  const R = 3000, SEA = -40, CY = SEA - R, GM = G0 * R * R;
  // Air: RHO0 sea density, SCALE_H scale height, SPACE_ALT where the sky turns black, ORBIT_ALT the Sky Top
  // where the sky hook holds the pod on a circle for the spacewalk.
  const RHO0 = 0.003, SCALE_H = 30, SPACE_ALT = 140, ORBIT_ALT = 500;
  // Ascent lean: gimbal, the Ooga's own coast lean with the engine out, damp, and air turning the stack toward
  // (fins) or away from (no fins) its flight path.
  const LEAN = { gimbal: 1.3, coast: 0.35, damp: 2.2, air: 0.06 };
  const THROTTLE_RATE = 0.9;
  // Stress: Q_LIMIT is the head-on dynamic pressure the stack takes; BEND multiplies it for a lean into the wind.
  // Set where a full-throttle Volcano Jug through thick air is a strain and a Firecracker a real one, so the
  // throttle is an ascent decision; the autopilot eases off at Q_GUARD of it.
  const Q_LIMIT = 16, BEND = 5, OVER_T = 0.35, Q_GUARD = 0.85;
  // Heat: HEAT_K flux per density and speed cubed, COOL cooling, ASCENT_EXPOSE what the cone's point takes on
  // the way up.
  const HEAT_K = 3.4e-4, COOL = 0.35, ASCENT_EXPOSE = 0.15, SHIELD_BURN = 1e-4;
  // Pod: body rates on the three axes, response to the stick, weathervane turning the shield into the wind,
  // lift at an angle, blunt-face drag.
  const POD = { pitch: 1.5, roll: 2, yaw: 1.5, response: 6, weathervane: 0.012, lift: 0.34, cd: 1 };
  // Leaf chute glides like the drop's canopy: highest/fastest it can open, bloom time, glide and sink speeds,
  // how fast the pod settles into them, turn rate.
  const CHUTE = { alt: 135, speed: 34, bloom: 1.6, forward: 5, sink: 4, grip: 1.6, turn: 0.9 };
  // Touchdowns: soft, hard and broken speeds on land (LAND) and water (SPLASH).
  const LAND = { soft: 8, hard: 14 }, SPLASH = { soft: 14, hard: 22 };
  // NEAR_GROUND 90: height above the sea under which the islands can be under a body.
  const NEAR_GROUND = 90;
  // The air is gone by the orbit line, so an orbit keeps for as long as the player likes.
  const AIR_TOP = 150, AIR_FADE = 25;
  const densityAt = (alt) => alt >= AIR_TOP ? 0 : Math.exp(-Math.max(0, alt) / SCALE_H) * Math.min(1, (AIR_TOP - alt) / AIR_FADE);
  // onDrop hears every stage that comes off, before the stack's middle moves up.
  const create = ({ stack, groundAt, onDrop = null }) => {
    const parts = stack.map(rocketParts.partOf);
    const stages = rocketParts.stagesOf(stack);
    const pod = parts[parts.length - 1], shieldPart = parts.find((p) => p.kind === "shield") || null;
    // partY: where each part sits above the bottom of the whole stack.
    const partY = new Float64Array(parts.length);
    for (let i = 1; i < parts.length; i++) partY[i] = partY[i - 1] + parts[i - 1].h;
    const totalH = partY[parts.length - 1] + pod.h;
    const fuel = new Float64Array(stages.length);
    const s = {
      mode: "pad", p: { x: 0, y: 0, z: 0 }, pp: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 },
      q: quat.create(), up: new Float64Array(3), right: new Float64Array(3), front: new Float64Array(3),
      stage: 0, fuel, throttle: 1, burning: false, flameout: false, boost: 1, boostT: 0,
      psi: 0, psiRate: 0, alt: 0, speed: 0, radial: 0, across: 0, rho: 1, dynQ: 0, aoa: 0, stress: 0, over: 0,
      heat: 0, peakHeat: 0, shield: shieldPart ? 1 : 0, chute: "packed", bloom: 0, heading: 0, failure: null, landing: null, landSpeed: 0,
      mass: 0, height: totalH, bottom: 0, stability: 0, area: 1, maxAlt: 0, spaced: false
    };
    // Still attached: the lowest stage's index fixes the dry mass, the parked fuel above, the height and the air.
    let dryAttached = 0, fuelAbove = 0;
    const refit = () => {
      dryAttached = fuelAbove = 0;
      let stability = 0, rMax = 0;
      for (let i = s.stage; i < stages.length; i++) {
        dryAttached += stages[i].dry;
        if (i > s.stage) fuelAbove += fuel[i];
        stability += stages[i].stability;
      }
      const from = stages[s.stage].from;
      for (let i = from; i < parts.length; i++) rMax = Math.max(rMax, parts[i].r);
      s.bottom = partY[from];
      s.height = totalH - s.bottom;
      s.stability = stability - rocketParts.FLIP;
      const alone = s.stage === stages.length - 1 && !stages[s.stage].engine;
      s.area = alone ? Math.PI * pod.r * pod.r * POD.cd : Math.PI * rMax * rMax * 0.35 + 0.06 * (parts.length - from);
    };
    const massNow = () => dryAttached + fuelAbove + fuel[s.stage];
    const axes = () => {
      quat.rotateVec(s.right, s.q, 1, 0, 0);
      quat.rotateVec(s.up, s.q, 0, 1, 0);
      quat.rotateVec(s.front, s.q, 0, 0, 1);
    };
    // U = the world's up at a point, D = the launch plane's downrange there, E = cross-range (up x downrange).
    const U = new Float64Array(3), D = new Float64Array(3), E = new Float64Array(3);
    const localFrame = (p) => {
      const ux = p.x, uy = p.y - CY, uz = p.z, r = Math.hypot(ux, uy, uz);
      U[0] = ux / r; U[1] = uy / r; U[2] = uz / r;
      // Downrange is the plane normal (+x) crossed with up.
      D[0] = 0; D[1] = -U[2]; D[2] = U[1];
      const dl = Math.hypot(D[1], D[2]) || 1;
      D[1] /= dl; D[2] /= dl;
      E[0] = U[1] * D[2] - U[2] * D[1]; E[1] = U[2] * D[0] - U[0] * D[2]; E[2] = U[0] * D[1] - U[1] * D[0];
      return r;
    };
    // The lean is a turn about the launch plane's normal, measured from the world's up.
    const setLean = () => {
      const by = U[1] * Math.cos(s.psi) + D[1] * Math.sin(s.psi), bz = U[2] * Math.cos(s.psi) + D[2] * Math.sin(s.psi);
      quat.fromAxisAngle(s.q, 1, 0, 0, Math.atan2(bz, by));
      axes();
    };
    const reset = (x, y, z) => {
      s.mode = "pad";
      s.stage = 0;
      for (let i = 0; i < stages.length; i++) fuel[i] = stages[i].fuel;
      refit();
      s.p.x = x;
      s.p.y = y + s.height / 2;
      s.p.z = z;
      s.pp.x = s.p.x; s.pp.y = s.p.y; s.pp.z = s.p.z;
      s.v.x = s.v.y = s.v.z = 0;
      s.w.x = s.w.y = s.w.z = 0;
      s.psi = s.psiRate = 0;
      s.throttle = 1;
      s.burning = s.flameout = false;
      s.boost = 1;
      s.boostT = 0;
      s.heat = s.peakHeat = s.stress = s.over = s.aoa = s.dynQ = 0;
      s.shield = shieldPart ? 1 : 0;
      s.chute = "packed";
      s.bloom = 0;
      s.failure = s.landing = null;
      s.landSpeed = 0;
      s.maxAlt = 0;
      s.spaced = false;
      localFrame(s.p);
      setLean();
      measure();
      s.mass = massNow();
    };
    const engine = () => stages[s.stage].engine;
    // Lights the attached stage; boost scales its push for a moment after a clamp release that came early.
    const ignite = (boost = 1, boostT = 0) => {
      const e = engine();
      if (!e || fuel[s.stage] <= 0) return false;
      s.burning = true;
      s.boost = boost;
      s.boostT = boostT;
      if (e.solid) s.throttle = 1;
      return true;
    };
    // Drop the lowest stage; the stack's middle moves up to the new middle.
    const DROPPED = { from: 0, to: 0, stage: 0, height: 0 };
    const separate = () => {
      if (s.stage >= stages.length - 1) return null;
      const st = stages[s.stage];
      const cut = partY[st.to] - s.bottom;
      DROPPED.from = st.from;
      DROPPED.to = st.to;
      DROPPED.stage = s.stage;
      DROPPED.height = cut;
      if (onDrop) onDrop(DROPPED);
      const oldH = s.height;
      s.stage++;
      refit();
      // Old middle to new middle along the body's up.
      const shift = cut + s.height / 2 - oldH / 2;
      s.p.x += s.up[0] * shift;
      s.p.y += s.up[1] * shift;
      s.p.z += s.up[2] * shift;
      s.burning = false;
      s.boost = 1;
      s.mass = massNow();
      if (isPod() && s.mode === "ascent") homeward();
      return DROPPED;
    };
    const isPod = () => s.stage === stages.length - 1 && !stages[s.stage].engine;
    // Heading home: everything that can come off does (a pod with no knot under it keeps its last stage); the
    // rest turns freely.
    const homeward = () => {
      s.mode = "free";
      while (!isPod() && separate());
      s.burning = false;
      s.area = Math.PI * pod.r * pod.r * POD.cd;
      s.w.x = s.w.y = s.w.z = 0;
    };
    // Too high the leaves catch nothing and stay packed; too fast they tear.
    const chuteReady = () => s.chute === "packed" && s.mode === "free" && s.alt < CHUTE.alt && s.speed < CHUTE.speed;
    const deploy = () => {
      if (s.chute !== "packed" || s.mode !== "free" || s.alt >= CHUTE.alt) return false;
      if (s.speed >= CHUTE.speed) {
        s.chute = "torn";
        return true;
      }
      s.chute = "open";
      s.bloom = 0;
      localFrame(s.p);
      s.heading = Math.atan2(s.v.x * E[0] + s.v.y * E[1] + s.v.z * E[2], s.v.x * D[0] + s.v.y * D[1] + s.v.z * D[2]);
      return true;
    };
    const measure = () => {
      const r = localFrame(s.p);
      s.alt = r - R;
      const v = s.v;
      s.speed = Math.hypot(v.x, v.y, v.z);
      s.radial = v.x * U[0] + v.y * U[1] + v.z * U[2];
      s.across = v.x * D[0] + v.y * D[1] + v.z * D[2];
      s.rho = densityAt(s.alt);
      s.dynQ = 0.5 * RHO0 * s.rho * s.speed * s.speed * 100;
      if (s.alt > s.maxAlt) s.maxAlt = s.alt;
      if (s.alt > SPACE_ALT) s.spaced = true;
    };
    // Sky hook: the body held still at a point; the attached stack eases upright by a fraction each call.
    const hold = (x, y, z, upright = 0) => {
      s.p.x = x;
      s.p.y = y;
      s.p.z = z;
      s.v.x = s.v.y = s.v.z = 0;
      if (s.mode !== "free") {
        localFrame(s.p);
        s.psi *= 1 - upright;
        s.psiRate = 0;
        setLean();
      }
      measure();
    };
    // Stand the body upright with its shield down and stop it turning, as the sky hook lets go.
    const stand = () => {
      localFrame(s.p);
      s.psi = s.psiRate = 0;
      s.w.x = s.w.y = s.w.z = 0;
      setLean();
    };
    const fail = (why) => {
      if (!s.failure) s.failure = why;
      s.burning = false;
    };
    const touchdown = (water) => {
      const speed = s.speed, limits = water ? SPLASH : LAND;
      // Coming down on a side is harder than on the bottom (k 1.5 vs 1).
      const upright = s.up[0] * U[0] + s.up[1] * U[1] + s.up[2] * U[2];
      const k = upright > 0.6 ? 1 : 1.5, whole = s.mode !== "free";
      s.landSpeed = speed;
      // A whole rocket coming back down is a wreck unless it all but floats in upright.
      if (whole && (speed > 2 || upright < 0.9)) s.landing = "crash";
      else s.landing = speed * k < limits.soft ? "soft" : speed * k < limits.hard ? "hard" : "crash";
      s.mode = "down";
      s.burning = false;
      if (s.landing === "crash") fail(whole ? "wreck" : water ? "splat" : "crash");
    };
    const T = new Float64Array(3);
    // One fixed step; input { throttle: -1..1, lean: -1..1, pitch, roll, yaw }.
    const substep = (dt, input) => {
      if (s.mode === "down" || s.failure) return;
      s.pp.x = s.p.x; s.pp.y = s.p.y; s.pp.z = s.p.z;
      const m = massNow();
      s.mass = m;
      const e = engine();
      if (e && !e.solid) s.throttle = clamp(s.throttle + input.throttle * THROTTLE_RATE * dt, 0, 1);
      if (s.boostT > 0) {
        s.boostT -= dt;
        if (s.boostT <= 0) s.boost = 1;
      }
      // Thrust along the body's up, fuel burned by the push.
      let thrust = 0;
      if (s.burning && e) {
        const push = e.thrust * s.throttle * s.boost;
        const burn = push / e.ve * dt;
        if (fuel[s.stage] <= burn) {
          thrust = push * fuel[s.stage] / burn;
          fuel[s.stage] = 0;
          s.burning = false;
          s.flameout = true;
        } else {
          fuel[s.stage] -= burn;
          thrust = push;
        }
      }
      const v = s.v, sp = s.speed;
      const vx = sp > 1e-6 ? v.x / sp : 0, vy = sp > 1e-6 ? v.y / sp : 0, vz = sp > 1e-6 ? v.z / sp : 0;
      const r = localFrame(s.p);
      const g = GM / (r * r);
      let ax = -U[0] * g, ay = -U[1] * g, az = -U[2] * g;
      ax += s.up[0] * thrust / m;
      ay += s.up[1] * thrust / m;
      az += s.up[2] * thrust / m;
      // aoa is the angle between the flight and the body's up, or for the pod between the flight and its shield.
      const along = -(s.up[0] * vx + s.up[1] * vy + s.up[2] * vz);
      const q = 0.5 * RHO0 * s.rho * sp * sp;
      if (s.mode === "free") {
        // Blunt face first: drag along the flight, lift toward the part of the body's up across it.
        const cosA = clamp(along, -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
        s.aoa = Math.acos(cosA);
        const drag = q * s.area * (1 + 0.4 * sinA * sinA) / m;
        ax -= vx * drag;
        ay -= vy * drag;
        az -= vz * drag;
        if (cosA > 0 && sinA > 1e-4 && s.chute !== "open") {
          const cl = POD.lift * 2 * sinA * cosA, lift = q * s.area * cl / m;
          // Lift direction: the body's up minus its part along the flight, normalised.
          let lx = s.up[0] + vx * cosA, ly = s.up[1] + vy * cosA, lz = s.up[2] + vz * cosA;
          const ll = Math.hypot(lx, ly, lz) || 1;
          lx /= ll; ly /= ll; lz /= ll;
          ax += lx * lift;
          ay += ly * lift;
          az += lz * lift;
        }
      } else {
        // Head on, with more drag and stress for a lean into the wind.
        const cosA = sp > 3 ? clamp(-along, -1, 1) : 1, sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        s.aoa = sp > 3 ? Math.acos(cosA) : 0;
        const drag = q * s.area * (1 + 2 * sinA * sinA) / m;
        ax -= vx * drag;
        ay -= vy * drag;
        az -= vz * drag;
      }
      v.x += ax * dt;
      v.y += ay * dt;
      v.z += az * dt;
      // Under the leaves the pod settles into a glide along its heading and a steady sink; the stick turns it.
      if (s.chute === "open") {
        s.bloom = Math.min(1, s.bloom + dt / CHUTE.bloom);
        s.heading += (input.yaw - input.roll) * CHUTE.turn * s.bloom * dt;
        const hx = Math.cos(s.heading) * CHUTE.forward * s.bloom, hz = Math.sin(s.heading) * CHUTE.forward * s.bloom;
        const k = 1 - Math.exp(-CHUTE.grip * s.bloom * s.bloom * dt);
        v.x += (D[0] * hx + E[0] * hz - U[0] * CHUTE.sink - v.x) * k;
        v.y += (D[1] * hx + E[1] * hz - U[1] * CHUTE.sink - v.y) * k;
        v.z += (D[2] * hx + E[2] * hz - U[2] * CHUTE.sink - v.z) * k;
      }
      // On the pad the clamps hold until the push beats the weight.
      if (s.mode === "pad") {
        if (thrust > m * g) s.mode = "ascent";
        else {
          v.x = v.y = v.z = 0;
          if (!s.burning && s.flameout) fail("stuck");
        }
      }
      s.p.x += v.x * dt;
      s.p.y += v.y * dt;
      s.p.z += v.z * dt;
      measure();
      if (s.mode === "ascent" || s.mode === "pad") {
        localFrame(s.p);
        // gamma is the flight path's angle from the local up; alpha is the lean against it.
        const gamma = Math.atan2(s.across, s.radial);
        const alpha = s.speed > 3 ? Math.atan2(Math.sin(s.psi - gamma), Math.cos(s.psi - gamma)) : 0;
        const authority = s.burning ? LEAN.gimbal : LEAN.coast;
        const air = LEAN.air * s.dynQ * Math.sin(alpha) * s.stability / Math.max(1, Math.sqrt(m));
        if (s.mode === "ascent") s.psiRate += (input.lean * authority - air - s.psiRate * LEAN.damp) * dt;
        // Clamped, the stack cannot lean: an early kick waits for lift-off.
        if (s.mode === "ascent") s.psi += s.psiRate * dt;
        setLean();
      } else if (s.mode === "free") {
        if (s.chute === "open") {
          // Hanging under the canopy: the pod swings upright and stops turning.
          const bx = U[0], by = U[1], bz = U[2];
          const ux = s.up[0], uy = s.up[1], uz = s.up[2];
          // Turn about up x world-up toward upright.
          T[0] = uy * bz - uz * by; T[1] = uz * bx - ux * bz; T[2] = ux * by - uy * bx;
          s.w.x += (T[0] * 2.5 - s.w.x * 2) * dt;
          s.w.y += (T[1] * 2.5 - s.w.y * 2) * dt;
          s.w.z += (T[2] * 2.5 - s.w.z * 2) * dt;
        } else {
          // Stick rates about the body's axes, plus the air turning the shield into the wind.
          const tx = s.right[0] * input.pitch * POD.pitch + s.up[0] * input.roll * POD.roll + s.front[0] * input.yaw * POD.yaw;
          const ty = s.right[1] * input.pitch * POD.pitch + s.up[1] * input.roll * POD.roll + s.front[1] * input.yaw * POD.yaw;
          const tz = s.right[2] * input.pitch * POD.pitch + s.up[2] * input.roll * POD.roll + s.front[2] * input.yaw * POD.yaw;
          s.w.x += (tx - s.w.x) * POD.response * dt;
          s.w.y += (ty - s.w.y) * POD.response * dt;
          s.w.z += (tz - s.w.z) * POD.response * dt;
          if (s.speed > 1) {
            // The shield's outward normal is -up; turn it toward the flight about (-up) x flight.
            const nx = -s.up[0], ny = -s.up[1], nz = -s.up[2];
            const wx = ny * vz - nz * vy, wy = nz * vx - nx * vz, wz = nx * vy - ny * vx;
            const k = POD.weathervane * s.dynQ;
            s.w.x += wx * k * dt;
            s.w.y += wy * k * dt;
            s.w.z += wz * k * dt;
          }
        }
        quat.integrate(s.q, s.q, s.w.x, s.w.y, s.w.z, dt);
        axes();
      }
      // Heat: the flux the air brings, what the shield eats, what reaches the hull.
      const flux = HEAT_K * s.rho * s.speed * s.speed * s.speed;
      let hull;
      if (s.mode === "free") {
        const face = clamp(-(s.up[0] * vx + s.up[1] * vy + s.up[2] * vz), -1, 1);
        if (s.shield > 0 && face > 0) {
          s.shield = Math.max(0, s.shield - SHIELD_BURN / HEAT_K * flux * face * dt / shieldPart.ablate);
          hull = flux * (1 - face);
        } else hull = flux * (2 - Math.min(0, face) * 0.6);
      } else hull = flux * ASCENT_EXPOSE;
      s.heat = Math.max(0, s.heat + (hull / pod.heatTol - COOL * s.heat) * dt);
      if (s.heat > s.peakHeat) s.peakHeat = s.heat;
      if (s.heat >= 1) fail(s.mode === "free" ? "burnup" : "heat");
      if (s.mode === "ascent") {
        const sinA = Math.sin(s.aoa);
        s.stress = s.dynQ * (1 + BEND * sinA * sinA * s.height / 8) / Q_LIMIT;
        s.over = s.stress > 1 ? s.over + dt : 0;
        if (s.over > OVER_T) fail("breakup");
      } else s.stress = 0;
      const bx = s.p.x - s.up[0] * s.height / 2, by = s.p.y - s.up[1] * s.height / 2, bz = s.p.z - s.up[2] * s.height / 2;
      // The islands stand only on the top of the world: far round it the same x and z are open sky.
      const ground = s.alt < NEAR_GROUND ? groundAt(bx, bz) : -Infinity;
      if (s.mode !== "pad" && ground > -Infinity && by <= ground && s.radial < 0) {
        s.p.y += ground - by;
        touchdown(false);
      } else if (s.alt - s.height / 2 <= 0 && s.radial < 0) touchdown(true);
    };
    reset(0, 0, 0);
    return { state: s, parts, stages, fuel, partY, pod, shieldPart, reset, ignite, separate, homeward, deploy, chuteReady, substep, hold, stand, isPod, massNow, engine };
  };
  BL.rocket = { create, NEAR_GROUND, R, SEA, CY, GM, G0, RHO0, SCALE_H, SPACE_ALT, ORBIT_ALT, CHUTE, LAND, SPLASH, Q_LIMIT, Q_GUARD, densityAt };
})();
