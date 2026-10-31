// Cloud Hopper's seeded course and falling pickups; no scene or render state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, mulberry32 } = BL.math;
  const MAX_CLOUDS = 128, CLOUD_DEPTH = 2, FADE_SECONDS = 1, APPEAR_SECONDS = 0.45, SYNC_SECONDS = 0.5;
  const CLOUD_GAP = 1.5, MAIN_RADIUS = Math.hypot(3.6, 2.6);
  const HIDDEN_MIN_SECONDS = 1.2, HIDDEN_RANGE_SECONDS = 2, GRAVITY = 9.8, PICKUP_LIFT = 0.7, PICKUP_RADIUS = 0.75;
  const cycleRandom = (seed, cycle, salt) => {
    let value = seed ^ Math.imul(cycle + 1, 0x9e3779b9) ^ salt;
    value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
    value = Math.imul(value ^ value >>> 15, 0x735a2d97);
    return ((value ^ value >>> 15) >>> 0) / 4294967296;
  };
  // Spread fades across each cloud's own cycle, leaving room to fully return
  // before its next cycle begins. Shared periods made whole regions pulse.
  const fadeAt = (cloud, cycle) => 2 + cycleRandom(cloud.seed, cycle, 0x632be5ab)
    * (cloud.cycleSeconds - FADE_SECONDS - HIDDEN_MIN_SECONDS - HIDDEN_RANGE_SECONDS - APPEAR_SECONDS - 2.5);
  const hiddenFor = (cloud, cycle) => HIDDEN_MIN_SECONDS + cycleRandom(cloud.seed, cycle, 0x85157af5) * HIDDEN_RANGE_SECONDS;
  const movePassAt = (cloud, time) => {
    const age = time - cloud.delay;
    if (age < 0) return 0;
    const cycle = Math.floor(age / cloud.cycleSeconds), local = age - cycle * cloud.cycleSeconds;
    // Return to the other end only halfway through complete invisibility.
    const reset = fadeAt(cloud, cycle) + FADE_SECONDS + hiddenFor(cloud, cycle) * 0.5;
    return cycle + (local >= reset ? 1 : 0);
  };
  const driftAt = (cloud, time, pass) => {
    // Waiting before departure cannot send the course out of reach. Drift
    // toward the edge without reversing or disappearing before the clock.
    if (!pass) return cloud.moveRange * -Math.expm1(-time * cloud.moveSpeed / cloud.moveRange);
    const cycle = pass - 1;
    const appear = cloud.delay + cycle * cloud.cycleSeconds + fadeAt(cloud, cycle) + FADE_SECONDS + hiddenFor(cloud, cycle);
    const gone = cloud.delay + pass * cloud.cycleSeconds + fadeAt(cloud, pass) + FADE_SECONDS;
    return cloud.moveRange * (2 * clamp((time - appear) / (gone - appear), 0, 1) - 1);
  };
  const contains = (cloud, x, z, radius) => {
    const dx = x - cloud.x, dz = z - cloud.z;
    const xk = (dx * cloud.cosYaw - dz * cloud.sinYaw) / (cloud.rx + radius);
    const zk = (dx * cloud.sinYaw + dz * cloud.cosYaw) / (cloud.rz + radius);
    return xk * xk + zk * zk <= 1;
  };
  // Sweep the whole body through the cloud's rotated bounds, including its
  // ragged outer puffs. Standing support remains the separate top query.
  const touchTime = (cloud, x, z, feet, height, radius = 0.3, fromX, fromZ, fromFeet) => {
    if (!cloud.active || cloud.kind === "normal") return Infinity;
    const sweep = fromX !== undefined && cloud.previousActive && cloud.previousPass === cloud.movePass;
    const dx = x - cloud.x, dz = z - cloud.z;
    const bx = sweep ? fromX - cloud.previousX : dx, bz = sweep ? fromZ - cloud.previousZ : dz;
    const x0 = bx * cloud.cosYaw - bz * cloud.sinYaw, z0 = bx * cloud.sinYaw + bz * cloud.cosYaw;
    const x1 = dx * cloud.cosYaw - dz * cloud.sinYaw, z1 = dx * cloud.sinYaw + dz * cloud.cosYaw;
    const y0 = sweep ? fromFeet : feet;
    let enter = 0, leave = 1;
    for (let axis = 0; axis < 3; axis++) {
      const from = axis === 0 ? x0 : axis === 1 ? y0 : z0;
      const to = axis === 0 ? x1 : axis === 1 ? feet : z1;
      const low = axis === 0 ? -cloud.rx - radius : axis === 1 ? cloud.y - cloud.depth - height : -cloud.rz - radius;
      const high = axis === 0 ? cloud.rx + radius : axis === 1 ? cloud.top : cloud.rz + radius;
      const delta = to - from;
      if (Math.abs(delta) < 1e-9) {
        if (from < low - 1e-6 || from > high + 1e-6) return Infinity;
      } else {
        const a = (low - 1e-6 - from) / delta, b = (high + 1e-6 - from) / delta;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        if (enter > leave) return Infinity;
      }
    }
    return enter;
  };

  // start/finish are feet positions; finish is the mainland pile, not a cloud.
  // The route stops offshore, with every cloud's entire motion over water.
  // Clouds drift from creation; start(driftTime) arms their fading clock once
  // the rider leaves and returns the phase kept with a ghost recording. An
  // optional recorded phase reproduces that course's drift. update(dt, raceTime)
  // can follow the race clock directly; previousX/Z carry a planted rider.
  // A record's y is its full-opacity top; top sinks as it fades. supportAt
  // returns the highest eligible top or -Infinity; pass the greater of the
  // previous/current feet heights to catch a falling body. pickupAt consumes
  // one pickup and returns its stable record; equipping belongs to the caller.
  const create = ({ start, finish, mainlandRadius = 30, seed = 1 }) => {
    const rand = mulberry32(seed), outwardX = start.x - finish.x, outwardZ = start.z - finish.z;
    const moveRand = mulberry32(seed ^ 0x3c6ef372), orientationRand = mulberry32(seed ^ 0xa54ff53a);
    const sideRand = mulberry32(seed ^ 0xbb67ae85);
    const startDistance = Math.hypot(outwardX, outwardZ), nx = outwardX / startDistance, nz = outwardZ / startDistance;
    const shoreDistance = mainlandRadius + 12, endY = finish.y + 18;
    const distance = startDistance - shoreDistance, drop = start.y - endY, sideX = -nz, sideZ = nx;
    // Slightly wider main gaps still fit a running jump. Bound their jitter
    // by the widest rotated mesh so neighbouring drift lanes stay separate.
    const minimumStep = MAIN_RADIUS * 2 + CLOUD_GAP;
    const count = Math.min(MAX_CLOUDS - 24, Math.max(12, Math.ceil(Math.max(drop / 9, distance / 11.5))),
      Math.max(6, Math.floor(distance / minimumStep)));
    const clouds = [], landings = [], pickups = [], placements = [], step = 1 / count;
    const alongJitter = Math.min(0.08, Math.max(0, 1 - minimumStep / (distance * step)));
    let lateral = 0, movementTime = 0, beganAt = -1, driftStart = 0, driftShift = 0, nextTurn = 0, target = 0, courseTime = 0;
    const addCloud = (x, y, z, rx, rz, side = 0) => {
      // Each cloud chooses left or right across the course for the whole run.
      // Independent lanes and fade clocks keep the field from swaying as one.
      const direction = moveRand() < 0.5 ? -1 : 1, moveX = sideX * direction, moveZ = sideZ * direction;
      const moveRange = 5 + moveRand() * 3, moveSpeed = 0.9 + moveRand() * 0.6;
      const yaw = orientationRand() * Math.PI * 2, cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
      const alongHalf = Math.abs(nx * cosYaw - nz * sinYaw) * rx + Math.abs(nx * sinYaw + nz * cosYaw) * rz;
      const acrossHalf = Math.abs(sideX * cosYaw - sideZ * sinYaw) * rx + Math.abs(sideX * sinYaw + sideZ * cosYaw) * rz + moveRange;
      // Motion is purely lateral: a radial bound keeps every puff offshore
      // without pushing the last clouds back into their neighbours.
      const along = Math.max((x - finish.x) * nx + (z - finish.z) * nz, mainlandRadius + 1.25 + alongHalf);
      let across = (x - finish.x) * sideX + (z - finish.z) * sideZ;
      if (side) for (const other of placements) {
        if (Math.abs(along - other.along) >= alongHalf + other.alongHalf + CLOUD_GAP) continue;
        // Place alternatives outside every intersecting lane, including the
        // entire left/right travel of both clouds, not just today's centres.
        across = side * Math.max(side * across, side * other.across + acrossHalf + other.acrossHalf + CLOUD_GAP);
      }
      x = finish.x + nx * along + sideX * across; z = finish.z + nz * along + sideZ * across;
      placements.push({ along, across, alongHalf, acrossHalf });
      const cloud = {
        index: clouds.length, x, y, z, rx, rz, depth: CLOUD_DEPTH, top: y, opacity: 1, active: true, fading: false,
        yaw, cosYaw, sinYaw,
        kind: "normal", boostX: 0, boostZ: 0,
        baseX: x, baseZ: z, previousX: x, previousZ: z, previousActive: true, previousPass: 0,
        moveX, moveZ, moveRange, moveSpeed, movePass: 0,
        seed: (rand() * 4294967296) >>> 0, delay: 3 + rand() * 7, cycleSeconds: 0, firstGoneAt: 0
      };
      cloud.cycleSeconds = 9 + cycleRandom(cloud.seed, 0, 0x9e6c63d1) * 6;
      cloud.firstGoneAt = cloud.delay + fadeAt(cloud, 0) + FADE_SECONDS;
      clouds.push(cloud);
      return cloud;
    };
    for (let i = 0; i < count; i++) {
      if (i >= nextTurn) {
        target = (rand() - 0.5) * 80;
        nextTurn = i + 1 + Math.floor(rand() * 3);
      }
      const remaining = count - 1 - i;
      // Frequent random turns break up the line; taper back toward the coast.
      const wanted = remaining < 5 ? 0 : target + (rand() - 0.5) * 12;
      lateral += clamp(wanted - lateral, -7, 7);
      lateral = clamp(lateral, -remaining * 7, remaining * 7);
      const last = remaining === 0, t = (i + 1) * step;
      const along = last ? 1 : t + (rand() - 0.5) * step * alongJitter;
      const down = last ? 1 : t + (rand() - 0.5) * step * 0.2;
      const radial = startDistance - distance * along;
      const x = finish.x + nx * radial + sideX * lateral, z = finish.z + nz * radial + sideZ * lateral;
      const y = start.y - drop * down;
      landings.push(addCloud(x, y, z, 2.7 + rand() * 0.9, 1.9 + rand() * 0.7));
    }
    // Fill stratified segments across the whole descent instead of exhausting
    // the extra-cloud budget near the top. Alternating sides balance each
    // neighbourhood while keeping positions and heights random each play.
    const segments = count - 5, alternatives = Math.min(24, segments), firstSide = sideRand() < 0.5 ? -1 : 1;
    for (let i = 0; i < alternatives; i++) {
      const low = Math.floor(i * segments / alternatives), high = Math.floor((i + 1) * segments / alternatives);
      const index = 2 + low + Math.floor(sideRand() * (high - low)), a = landings[index - 1], b = landings[index];
      const t = 0.35 + sideRand() * 0.3, side = i % 2 ? -firstSide : firstSide, offset = side * (22 + sideRand() * 12);
      addCloud(a.x + (b.x - a.x) * t + sideX * offset, a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t + sideZ * offset, 2.8 + sideRand() * 0.7, 2.1 + sideRand() * 0.5, side);
    }
    clouds.sort((a, b) => b.y - a.y);
    for (let i = 0; i < clouds.length; i++) clouds[i].index = i;
    const pickupCount = rand() < 0.55 ? 1 : 2;
    for (let i = 0; i < pickupCount; i++) {
      const index = i ? Math.max(4, Math.floor(count * 0.24)) : 1 + Math.floor(rand() * 2);
      const cloud = landings[index];
      pickups.push({
        index: i, cloud, x: cloud.x, y: cloud.top + PICKUP_LIFT, z: cloud.z,
        vy: 0, active: true, collected: false, falling: false
      });
    }
    // Special surfaces have their own stream: adding them must not move a
    // recorded course's landings, pickups, drift or disappearance clocks.
    const specialRand = mulberry32(seed ^ 0x7b1d943f), eligible = [];
    let boosts = 0, bounces = 0, lastBounceY = Infinity;
    for (const cloud of clouds) {
      if (cloud.y >= landings[0].y || cloud.y <= landings[count - 3].y
        || pickups.some(pickup => pickup.cloud === cloud)) continue;
      eligible.push(cloud);
      const choice = specialRand();
      if (choice < 0.22) { cloud.kind = "boost"; boosts++; }
      else if (choice < 0.38 && lastBounceY - cloud.y > drop * step * 1.5) {
        cloud.kind = "bounce"; bounces++; lastBounceY = cloud.y;
      }
    }
    // Even a short course introduces both surfaces, without stacking
    // consecutive bounce landings or putting one under an early jetpack.
    if (!boosts && eligible.length) {
      const at = Math.floor(specialRand() * eligible.length);
      for (let i = 0; i < eligible.length; i++) {
        const cloud = eligible[(at + i) % eligible.length];
        if (cloud.kind !== "normal") continue;
        cloud.kind = "boost"; boosts++; break;
      }
    }
    if (!bounces && eligible.length) {
      const at = Math.floor(specialRand() * eligible.length);
      for (let i = 0; i < eligible.length; i++) {
        const cloud = eligible[(at + i) % eligible.length];
        if (cloud.kind === "boost" && boosts === 1) continue;
        cloud.kind = "bounce"; break;
      }
    }
    for (const cloud of clouds) {
      if (cloud.kind === "boost") {
        // Launch toward the mainland independently of the cloud's orientation.
        cloud.boostX = -nx;
        cloud.boostZ = -nz;
      }
    }
    const begin = (driftTime = movementTime) => {
      if (beganAt < 0) {
        beganAt = movementTime;
        driftStart = Number.isFinite(driftTime) ? driftTime : movementTime;
        driftShift = driftStart - movementTime;
      }
      return driftStart;
    };
    const update = (dt, raceTime) => {
      if (beganAt >= 0 && Number.isFinite(raceTime)) movementTime = beganAt + Math.max(0, raceTime);
      else movementTime += dt;
      const time = beganAt < 0 ? 0 : movementTime - beganAt, t = Math.min(1, time / SYNC_SECONDS);
      courseTime = time;
      // Waiting on the start cloud still has live drift. Joining a recorded
      // course blends positions, not elapsed phase, without rewinding the
      // independently randomized disappearance clock.
      const driftTime = beganAt < 0 ? movementTime : driftStart + time, blend = t * t * (3 - 2 * t);
      const syncing = driftShift !== 0 && blend < 1;
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i], age = time - cloud.delay;
        cloud.previousActive = cloud.active; cloud.previousPass = cloud.movePass;
        cloud.movePass = movePassAt(cloud, time);
        let drift = driftAt(cloud, cloud.movePass ? time : driftTime, cloud.movePass);
        if (syncing) drift += (driftAt(cloud, movementTime, 0) - drift) * (1 - blend);
        cloud.previousX = cloud.x; cloud.previousZ = cloud.z;
        cloud.x = cloud.baseX + cloud.moveX * drift;
        cloud.z = cloud.baseZ + cloud.moveZ * drift;
        let opacity = 1, fading = false;
        if (age >= 0) {
          // Direct evaluation keeps both the work and the timing bounded even
          // after a long frame. Each cycle gets a fresh seeded disappearance.
          const cycle = Math.floor(age / cloud.cycleSeconds), local = age - cycle * cloud.cycleSeconds;
          const fade = fadeAt(cloud, cycle), gone = fade + FADE_SECONDS;
          const appear = gone + hiddenFor(cloud, cycle);
          if (local >= fade && local < gone) {
            opacity = 1 - (local - fade) / FADE_SECONDS;
            fading = true;
          } else if (local >= gone && local < appear) opacity = 0;
          else if (local >= appear && local < appear + APPEAR_SECONDS) opacity = (local - appear) / APPEAR_SECONDS;
        }
        cloud.opacity = opacity;
        cloud.active = opacity > 0;
        cloud.fading = fading;
        cloud.top = cloud.y - cloud.depth * (1 - opacity);
      }
      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.active) continue;
        const cloud = pickup.cloud, fallingFor = time - cloud.firstGoneAt;
        if (fallingFor < 0) {
          pickup.x = cloud.x; pickup.z = cloud.z;
          pickup.y = cloud.top + PICKUP_LIFT;
          pickup.vy = cloud.fading ? -cloud.depth / FADE_SECONDS : 0;
        } else {
          // Detach at the exact zero-opacity instant, even if a frame spans the
          // whole disappearance. A returning cloud never recalls its pickup.
          if (!pickup.falling) {
            // The phase blend ends well before any cloud first disappears.
            const drift = driftAt(cloud, driftStart + cloud.firstGoneAt, 0);
            pickup.x = cloud.baseX + cloud.moveX * drift;
            pickup.z = cloud.baseZ + cloud.moveZ * drift;
            pickup.falling = true;
          }
          const speed = cloud.depth / FADE_SECONDS;
          pickup.y = cloud.y - cloud.depth + PICKUP_LIFT - speed * fallingFor - GRAVITY * fallingFor * fallingFor * 0.5;
          pickup.vy = -speed - GRAVITY * fallingFor;
          if (pickup.y < finish.y - 120) pickup.active = false;
        }
      }
    };
    // Seconds until this cloud starts to fade, read from the same schedule as update: 0 while it fades,
    // negative while it is gone (minus the seconds until it returns), Infinity when its clock never starts.
    const solidLeft = (cloud) => {
      const age = courseTime - cloud.delay;
      if (age === -Infinity) return Infinity;
      if (age < 0) return -age + fadeAt(cloud, 0);
      const cycle = Math.floor(age / cloud.cycleSeconds), local = age - cycle * cloud.cycleSeconds;
      const fade = fadeAt(cloud, cycle), appear = fade + FADE_SECONDS + hiddenFor(cloud, cycle);
      if (local < fade) return fade - local;
      if (local < fade + FADE_SECONDS) return 0;
      if (local < appear) return local - appear;
      return cloud.cycleSeconds - local + fadeAt(cloud, cycle + 1);
    };
    const supportAt = (x, z, y, maxStep, radius = 0.3) => {
      const ceiling = y + maxStep;
      let top = -Infinity;
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        if (!cloud.active || cloud.top > ceiling || cloud.top <= top) continue;
        if (contains(cloud, x, z, radius)) top = cloud.top;
      }
      return top;
    };
    const contactAt = (x, z, feet, radius = 0.3) => {
      let contact = null;
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        if (!cloud.active || Math.abs(feet - cloud.top) > 0.1 || contact && cloud.top <= contact.top) continue;
        if (contains(cloud, x, z, radius)) contact = cloud;
      }
      return contact;
    };
    const pickupAt = (x, y, z, height) => {
      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.active || pickup.y < y - PICKUP_RADIUS || pickup.y > y + height + PICKUP_RADIUS) continue;
        const px = pickup.x - x, pz = pickup.z - z;
        if (px * px + pz * pz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        pickup.active = false;
        pickup.collected = true;
        return pickup;
      }
      return null;
    };
    // Conservative reach envelope: never fail a run because a hidden cloud
    // might reappear or sink into reach. Each landing has its own height, so
    // the failure boundary descends with the route toward the island.
    const coastTime = (feet, y, vy, jump, seaY) => {
      const target = Math.max(seaY, y - 0.4), rise = Math.max(0, vy), height = feet - target;
      if (height + (rise * rise + jump * jump) / (2 * GRAVITY) < 0) return -1;
      if (jump > 0) {
        // Optimize when the remaining air jump resets velocity. A fixed extra
        // jump duration misses valid late jumps during a long descent. The
        // reset must happen before the first water contact, never beneath it.
        const seaTime = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, feet - seaY))) / GRAVITY;
        const before = Math.min(seaTime, Math.max(0,
          (vy + Math.sqrt(Math.max(0, (vy * vy + jump * jump + 2 * GRAVITY * height) * 0.5))) / GRAVITY));
        const after = jump * jump + 2 * GRAVITY * (height + vy * before - GRAVITY * before * before * 0.5);
        return after < 0 ? -1 : before + (jump + Math.sqrt(after)) / GRAVITY;
      }
      const root = vy * vy + 2 * GRAVITY * height;
      return root < 0 ? -1 : (vy + Math.sqrt(root)) / GRAVITY;
    };
    const jetRecoveryTime = (feet, y, vy, jump, seaY, jetSeconds, jetAccel, jetRise) => {
      let elapsed = 0, early = -1;
      if (vy < 0) {
        // Real acceleration must arrest the fall first. Retain landings during
        // braking, but truncate at water instead of permitting a later rescue.
        const acceleration = jetAccel - GRAVITY, brake = Math.min(jetSeconds, -vy / acceleration);
        const low = feet + vy * brake + acceleration * brake * brake * 0.5, target = Math.max(seaY, y - 0.4);
        if (target <= feet && target >= low) {
          early = (-vy - Math.sqrt(Math.max(0, vy * vy - 2 * acceleration * (feet - target)))) / acceleration;
        }
        if (low <= seaY) return early;
        feet = low; vy += acceleration * brake; jetSeconds -= brake; elapsed = brake;
      }
      // Total upward impulse is finite. Grant it instantly up to the rise cap,
      // then spend the remainder cancelling gravity at that speed. This upper
      // envelope includes efficient pulsed thrust; a continuous burn followed
      // by a coast would underestimate how long a real pack can sustain lift.
      const impulse = jetAccel * jetSeconds, speed = Math.min(Math.max(jetRise, vy), vy + impulse);
      const hold = Math.max(0, (impulse - (speed - vy)) / GRAVITY);
      feet += speed * hold; elapsed += hold;
      const coast = coastTime(feet, y, speed, jump, seaY);
      return Math.max(early, coast < 0 ? -1 : elapsed + coast);
    };
    const recoveryTime = (feet, y, vy, jump, seaY, jetSeconds, jetAccel, jetRise) => {
      const coast = coastTime(feet, y, vy, jump, seaY);
      if (!(jetSeconds > 0 && jetAccel > GRAVITY && jetRise > 0)) return coast;
      // Jet-first recovery pays for cancelling the actual downward velocity,
      // including the lost height, before spending any fuel on lift. J can
      // instead remove the pack for an air jump, but that jump is then spent:
      // it cannot cancel the fall here and be granted again after the fuel.
      const jet = jetRecoveryTime(feet, y, vy, jump, seaY, jetSeconds, jetAccel, jetRise);
      const jumped = jump > 0 ? jetRecoveryTime(feet, y, jump, 0, seaY, jetSeconds, jetAccel, jetRise) : -1;
      return Math.max(coast, jet, jumped);
    };
    const canInterceptPickup = (pickup, x, feet, z, vy, speed, jump, seaY, jetSeconds, jetAccel, height, seaTime) => {
      if (seaTime < 0) return false;
      // Until release, include the pickup's whole remaining lateral lane and
      // sinking range. Once detached its horizontal position is fixed.
      const drift = pickup.falling ? 0 : 2 * pickup.cloud.moveRange;
      const distance = Math.max(0, Math.hypot(x - pickup.x, z - pickup.z) - PICKUP_RADIUS - drift);
      let at = distance === 0 ? 0 : speed > 0 ? distance / speed : Infinity;
      const release = pickup.falling ? 0 : Math.max(0, pickup.cloud.firstGoneAt - (beganAt < 0 ? 0 : Math.max(0, movementTime - beganAt)));
      const low = pickup.falling ? pickup.y : pickup.cloud.y - pickup.cloud.depth + PICKUP_LIFT;
      const velocity = pickup.falling ? pickup.vy : -pickup.cloud.depth / FADE_SECONDS;
      const end = Math.min(seaTime, release + (velocity + Math.sqrt(velocity * velocity
        + 2 * GRAVITY * Math.max(0, low - seaY + PICKUP_RADIUS))) / GRAVITY);
      const burn = jetSeconds > 0 && jetAccel > GRAVITY ? jetSeconds : 0;
      const turn = jump > 0 ? Math.abs(vy - jump) / GRAVITY : Infinity;
      // Maximum height with one air jump is piecewise quadratic: choose its
      // reset time optimally. Full thrust spent earliest adds an upper bound
      // on finite-fuel lift, retaining the current downward velocity. Ignoring
      // the rise cap and pre-jump impulse loss only favours a possible rescue.
      while (at <= end) {
        const next = Math.min(end, at < release ? release : Infinity, at < turn ? turn : Infinity, at < burn ? burn : Infinity);
        let a = -GRAVITY * 0.5, b = jump > 0 ? Math.max(vy, jump) : vy, c = feet;
        if (at >= turn) { a = -GRAVITY * 0.25; b = (vy + jump) * 0.5; c += (vy - jump) ** 2 / (4 * GRAVITY); }
        if (at < burn) a += jetAccel * 0.5;
        else if (burn) { b += jetAccel * burn; c -= jetAccel * burn * burn * 0.5; }
        let from = at, to = next;
        if (at < release) {
          c += height + PICKUP_RADIUS - low;
          // This check runs while descending: unpowered fall is the lower
          // height bound. It must reach the pickup's upper edge in time too.
          if (feet > pickup.y + PICKUP_RADIUS) from = Math.max(from,
            (vy + Math.sqrt(vy * vy + 2 * GRAVITY * (feet - pickup.y - PICKUP_RADIUS))) / GRAVITY);
        } else {
          const pb = velocity + GRAVITY * release, pc = low - velocity * release - GRAVITY * release * release * 0.5;
          a += GRAVITY * 0.5; b -= pb; c += height + PICKUP_RADIUS - pc;
          const slope = pb - vy, offset = pc + PICKUP_RADIUS - feet;
          if (slope > 0) from = Math.max(from, -offset / slope);
          else if (slope < 0) to = Math.min(to, -offset / slope);
          else if (offset < 0) from = Infinity;
        }
        if (from <= to) {
          const peak = a < 0 ? clamp(-b / (2 * a), from, to) : from;
          if ((a * peak + b) * peak + c >= 0 || (a * to + b) * to + c >= 0) return true;
        }
        if (next === end) break;
        at = next;
      }
      return false;
    };
    const canRecover = (x, feet, z, vy, speed, jump, seaY, jetSeconds = 0, jetAccel = 0, jetRise = 0, height = 0) => {
      const seaTime = recoveryTime(feet, seaY, vy, jump, seaY, jetSeconds, jetAccel, jetRise);
      // Treat the entire island and its overhanging props as reachable until
      // even reaching its coast before the water is impossible.
      if (Math.hypot(x - finish.x, z - finish.z) <= mainlandRadius + 12 + speed * seaTime) return true;
      const launchTime = recoveryTime(feet, start.y, vy, jump, seaY, jetSeconds, jetAccel, jetRise);
      if (launchTime >= 0 && Math.hypot(x - start.x, z - start.z) <= 5 + speed * launchTime) return true;
      for (const cloud of clouds) {
        const special = cloud.kind !== "normal";
        const time = recoveryTime(feet, cloud.y - cloud.depth - (special ? height : 0), vy, jump, seaY, jetSeconds, jetAccel, jetRise);
        if (time < 0) continue;
        // Allow the full remaining drift in either direction, not just the
        // current frame's footprint; this also covers clouds currently absent.
        const drift = 2 * cloud.moveRange;
        const reach = (special ? Math.hypot(cloud.rx, cloud.rz) : Math.max(cloud.rx, cloud.rz)) + 0.3 + drift + speed * time;
        if (Math.hypot(x - cloud.x, z - cloud.z) <= reach) return true;
      }
      // A nearby pack is only a rescue if the body can meet it vertically
      // before water. An unreachable pack overhead must not hold DQ open.
      for (const pickup of pickups) if (pickup.active && pickup.y >= seaY - PICKUP_RADIUS
        && canInterceptPickup(pickup, x, feet, z, vy, speed, jump, seaY, jetSeconds, jetAccel, height, seaTime)) return true;
      return false;
    };
    return { clouds, pickups, start: begin, update, supportAt, contactAt, touchTime, pickupAt, canRecover, solidLeft };
  };
  BL.cloudHopperCourse = { create, MAX_CLOUDS, CLOUD_DEPTH, FADE_SECONDS, APPEAR_SECONDS, PICKUP_LIFT, PICKUP_RADIUS };
})();
