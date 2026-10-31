// Cloud Hopper's seeded course and falling pickups; no scene or render state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, mulberry32 } = BL.math;
  const MAX_CLOUDS = 128, CLOUD_DEPTH = 2, FADE_SECONDS = 1, APPEAR_SECONDS = 0.6;
  const CLOUD_GAP = 1.5, MAIN_RADIUS = Math.hypot(3.6, 2.6);
  const GRAVITY = 9.8, PICKUP_LIFT = 0.7, PICKUP_RADIUS = 0.75, RUN_SPEED = 11.625, JUMP_SPEED = 4.8, SETTLE = 1.5, WOBBLE = 0.12;
  // Lifetime classes: a permanent cloud never fades; a long-lived one first fades long after an ordinary run
  // reaches it; an ordinary one disappears once in each of its own slots.
  const PERMANENT = 0, LONG = 1, ORDINARY = 2;
  // The phases a disappearance passes through. A warning keeps full support; the fade still holds a rider, sinking.
  const SOLID = 0, WARNING = 1, FADING = 2, HIDDEN = 3, APPEARING = 4;
  // The course's timing. Shares are of the clouds drawn before the fixed and promoted permanent ones; slots are
  // seconds (one disappearance each, log-uniform per cloud); `gap` is the least solid time between two of one
  // cloud's disappearances; `stagger` keeps reachable ordinary clouds' first two warnings apart; `spine` is the
  // most forward hops from a main landing to a permanent cloud; `pace` the seconds a hop is expected to take;
  // `reach` the share of a running jump (with the air jump when `airJump`) the fairness checks count on;
  // `presence` [early, late, extra] the span a rider may be on a cloud, from early × to late × its expected
  // arrival plus extra seconds. These defaults keep roughly today's challenge, the plan's Level 2.
  const TIMING = Object.freeze({ permanent: 0.08, long: 0.2, ordinary: Object.freeze([14, 36]), longSlot: Object.freeze([60, 130]),
    warn: 2.5, hidden: Object.freeze([1.5, 3.5]), gap: 4, firstWarn: 4, stagger: 3, spine: 3, pace: 2.8, reach: 0.7, airJump: true,
    presence: Object.freeze([0.4, 2.5, 40]) });
  const cycleRandom = (seed, cycle, salt) => {
    let value = seed ^ Math.imul(cycle + 1, 0x9e3779b9) ^ salt;
    value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
    value = Math.imul(value ^ value >>> 15, 0x735a2d97);
    return ((value ^ value >>> 15) >>> 0) / 4294967296;
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
    const sweep = fromX !== undefined && cloud.previousActive;
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
  // Clouds swing smoothly across their lanes from creation; start() arms their
  // disappearance clocks once the rider leaves and returns the drift time kept
  // with a ghost recording. update(dt, raceTime) can follow the race clock
  // directly, and every cloud's state is a closed-form function of that time;
  // previousX/Z carry a planted rider. A record's y is its full-opacity top; top
  // sinks as it fades. `phase` and `warning` say where its schedule stands and
  // solidLeft reads it. supportAt returns the highest eligible top or -Infinity;
  // pass the greater of the previous/current feet heights to catch a falling body.
  // pickupAt consumes one pickup and returns its stable record; equipping belongs
  // to the caller. runSpeed and jumpSpeed are the player's, for the fairness checks.
  const create = ({ start, finish, mainlandRadius = 30, seed = 1, timing = TIMING, runSpeed = RUN_SPEED, jumpSpeed = JUMP_SPEED }) => {
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
    let lateral = 0, movementTime = 0, beganAt = -1, nextTurn = 0, target = 0, courseTime = 0;
    const addCloud = (x, y, z, rx, rz, side = 0) => {
      // Each cloud swings across the course on its own lane, speed and phase.
      // Independent lanes and clocks keep the field from swaying as one.
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
        baseX: x, baseZ: z, previousX: x, previousZ: z, previousActive: true,
        moveX, moveZ, moveRange, moveSpeed, swing: 0,
        // The second draw is each cloud's clock phase, which keeps a seed's landings where they always were.
        seed: (rand() * 4294967296) >>> 0, clock: rand(), life: ORDINARY, late: false, main: !side, arrival: 0, held: 0,
        slotSeconds: 0, t0: 0, firstGoneAt: 0, phase: SOLID, progress: 0, warning: -1, windowStart: 0, windowEnd: 0
      };
      cloud.swing = cycleRandom(cloud.seed, 0, 0x7f4a7c15) * Math.PI * 2;
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
    // ---- lifetimes --------------------------------------------------------------------------------------------
    // Every disappearance is a closed-form function of race time: a cloud's clock starts at t0 and is cut into
    // slots of slotSeconds, each holding one warning, fade, hidden span and return at a seeded place inside it,
    // with half the least solid gap kept clear at either end. Each slot draws its own place and hidden span.
    const W = timing.warn, GONE = W + FADE_SECONDS, gapHalf = timing.gap / 2;
    const expected = count * timing.pace, horizon = expected * 3;
    const hiddenFor = (cloud, slot) => timing.hidden[0] + cycleRandom(cloud.seed, slot, 0x85157af5) * (timing.hidden[1] - timing.hidden[0]);
    const windowAt = (cloud, slot) => {
      if (cloud.life === PERMANENT) return Infinity;
      const span = GONE + hiddenFor(cloud, slot) + APPEAR_SECONDS;
      return cloud.t0 + slot * cloud.slotSeconds + gapHalf + cycleRandom(cloud.seed, slot, 0x632be5ab) * (cloud.slotSeconds - span - timing.gap);
    };
    // Fully solid and not warning at time t.
    const steadyAt = (cloud, t) => {
      if (cloud.life === PERMANENT || t < cloud.t0) return true;
      const slot = Math.floor((t - cloud.t0) / cloud.slotSeconds), local = t - windowAt(cloud, slot);
      return local < 0 || local >= GONE + hiddenFor(cloud, slot) + APPEAR_SECONDS;
    };
    // Writes phase and its progress, windowStart (the current or next warning) and windowEnd (the end of a
    // current disappearance's return).
    const evaluate = (cloud, t) => {
      cloud.phase = SOLID; cloud.progress = 0;
      if (cloud.life === PERMANENT) { cloud.windowStart = cloud.windowEnd = Infinity; return; }
      const slot = t < cloud.t0 ? 0 : Math.floor((t - cloud.t0) / cloud.slotSeconds), start = windowAt(cloud, slot), local = t - start;
      cloud.windowStart = start;
      if (local < 0) return;
      const hidden = hiddenFor(cloud, slot), back = GONE + hidden;
      cloud.windowEnd = start + back + APPEAR_SECONDS;
      if (local < W) { cloud.phase = WARNING; cloud.progress = local / W; }
      else if (local < GONE) { cloud.phase = FADING; cloud.progress = (local - W) / FADE_SECONDS; }
      else if (local < back) { cloud.phase = HIDDEN; cloud.progress = (local - GONE) / hidden; }
      else if (local < back + APPEAR_SECONDS) { cloud.phase = APPEARING; cloud.progress = (local - back) / APPEAR_SECONDS; }
      else cloud.windowStart = windowAt(cloud, slot + 1);
    };
    // The span a rider may be on this cloud, from early to late runs.
    const presence = (cloud) => cloud.arrival * timing.presence[1] + timing.presence[2];
    const schedule = (cloud, shift = 0) => {
      if (cloud.life === PERMANENT) { cloud.slotSeconds = cloud.t0 = cloud.firstGoneAt = Infinity; return; }
      const long = cloud.life === LONG, range = long ? timing.longSlot : timing.ordinary;
      cloud.slotSeconds = range[0] * Math.pow(range[1] / range[0], cycleRandom(cloud.seed, 0, long ? 0x4f1bbcdc : 0x9e6c63d1));
      // A long-lived cloud's first warning waits well past when an ordinary run reaches it; a late one past
      // every run's presence on it.
      const first = cloud.late ? presence(cloud) : long ? Math.max(timing.firstWarn, cloud.arrival * 1.6 + 20) : timing.firstWarn;
      cloud.t0 = first - gapHalf + cloud.clock * cloud.slotSeconds * (long ? 0.4 : 1) + shift;
      cloud.firstGoneAt = windowAt(cloud, 0) + GONE;
    };
    // Classes come from their own stream, so a seed's landings, specials and pickups stay where they were.
    const lifeRand = mulberry32(seed ^ 0x2545f491);
    for (const cloud of clouds) {
      const r = lifeRand();
      cloud.life = r < timing.permanent ? PERMANENT : r < timing.permanent + timing.long ? LONG : ORDINARY;
    }
    // A run starts and ends on clouds that never fade.
    for (const k of [0, 1, count - 2, count - 1]) landings[k].life = PERMANENT;
    for (const cloud of clouds) {
      const along = (cloud.baseX - finish.x) * nx + (cloud.baseZ - finish.z) * nz;
      cloud.arrival = clamp((startDistance - along) / distance, 0, 1) * expected;
      schedule(cloud);
    }

    // ---- motion ---------------------------------------------------------------------------------------------------
    // Each cloud swings smoothly across its lane. During a run its offset is a function of race time alone, so
    // where every cloud stands at any warning is known here. Waiting at the start only wobbles each swing's
    // phase, a wobble the run's first SETTLE seconds ease away: the field stays alive and every move continuous.
    const offsetAt = (cloud, t, wobble = 0) => cloud.moveRange * Math.sin(cloud.swing + t * cloud.moveSpeed / cloud.moveRange + wobble);
    const wobbleAt = (cloud, waited) => WOBBLE * Math.sin(waited * 0.6 + cloud.swing);

    // ---- reach ----------------------------------------------------------------------------------------------------
    // a reaches b at race time t when b is no higher than a (later in the height order) and the gap between
    // their edges there is inside `reach` of a running jump dropping between their tops, less how far b can
    // move during that flight. Candidates are the clouds a could reach with both lanes at their closest; links
    // only ever point down the course, so settling clouds from the bottom up never revisits one.
    const flight = (fall) => (jumpSpeed + Math.sqrt(jumpSpeed * jumpSpeed + 2 * GRAVITY * Math.max(0, fall))) / GRAVITY
      + (timing.airJump ? 2 * jumpSpeed / GRAVITY : 0);
    const reachFor = (fall) => timing.reach * runSpeed * flight(fall);
    const near = (cloud) => Math.min(cloud.rx, cloud.rz);
    const reachesAt = (a, b, t) => {
      const oa = offsetAt(a, t), ob = offsetAt(b, t), fall = a.y - b.y;
      const gap = Math.hypot(b.baseX + b.moveX * ob - a.baseX - a.moveX * oa, b.baseZ + b.moveZ * ob - a.baseZ - a.moveZ * oa) - near(a) - near(b);
      return gap <= reachFor(fall) - b.moveSpeed * flight(fall);
    };
    // Lanes at their centres: the nominal links the spine and the stagger read.
    const nominal = (a, b, lanes) => {
      const dx = b.baseX - a.baseX, dz = b.baseZ - a.baseZ;
      const across = Math.max(0, Math.abs(dx * sideX + dz * sideZ) - lanes * (a.moveRange + b.moveRange));
      return Math.hypot(dx * nx + dz * nz, across) - near(a) - near(b) <= reachFor(a.y - b.y);
    };
    const n = clouds.length, firstCandidate = new Int16Array(n + 1), firstLink = new Int16Array(n + 1), foundCandidates = [], foundLinks = [];
    for (let i = 0; i < n; i++) {
      firstCandidate[i] = foundCandidates.length; firstLink[i] = foundLinks.length;
      for (let j = i + 1; j < n; j++) {
        if (clouds[j].y > clouds[i].y) continue;
        if (nominal(clouds[i], clouds[j], 1)) foundCandidates.push(j);
        if (nominal(clouds[i], clouds[j], 0)) foundLinks.push(j);
      }
    }
    firstCandidate[n] = foundCandidates.length; firstLink[n] = foundLinks.length;
    const candidates = Int16Array.from(foundCandidates), links = Int16Array.from(foundLinks);
    const linked = (i, j) => {
      for (let e = firstLink[i]; e < firstLink[i + 1]; e++) if (links[e] === j) return true;
      return false;
    };
    // The mainland's coast is ground that never fades.
    const shoreAt = (cloud, t) => {
      const offset = offsetAt(cloud, t);
      return Math.hypot(cloud.baseX + cloud.moveX * offset - finish.x, cloud.baseZ + cloud.moveZ * offset - finish.z)
        - mainlandRadius - near(cloud) <= reachFor(cloud.y - finish.y);
    };

    // ---- fairness -------------------------------------------------------------------------------------------------
    // Whenever a cloud starts a warning while a rider may be on it, a cloud it reaches then is steady (or the
    // coast is in reach): warning and fade outlast the jump, so that target still holds when they land.
    const escapes = (i, t) => {
      const cloud = clouds[i];
      if (shoreAt(cloud, t)) return true;
      for (let e = firstCandidate[i]; e < firstCandidate[i + 1]; e++) {
        const other = clouds[candidates[e]];
        if (steadyAt(other, t) && reachesAt(cloud, other, t)) return true;
      }
      return false;
    };
    const settled = (i) => {
      const cloud = clouds[i], early = cloud.arrival * timing.presence[0], late = presence(cloud);
      for (let slot = 0; ; slot++) {
        const start = windowAt(cloud, slot);
        if (start > late) return true;
        if (start + GONE >= early && !escapes(i, start)) return false;
      }
    };
    // Linked ordinary clouds may not start their first two warnings within `stagger` seconds of each other.
    const clashes = (a, b) => {
      for (let ka = 0; ka < 2; ka++) for (let kb = 0; kb < 2; kb++) {
        if (Math.abs(windowAt(a, ka) - windowAt(b, kb)) < timing.stagger) return true;
      }
      return false;
    };
    const crowded = (i) => {
      for (let j = i + 1; j < n; j++) {
        if (clouds[j].life === ORDINARY && (linked(i, j) || linked(j, i)) && clashes(clouds[i], clouds[j])) return true;
      }
      return false;
    };
    // Settle from the bottom up, each cloud by its own clock alone: shift it along its slot, then try it
    // long-lived, then long-lived past every rider's presence, which always settles. No neighbour changes.
    for (let i = n - 1; i >= 0; i--) {
      const cloud = clouds[i];
      if (cloud.life === PERMANENT) continue;
      let done = false;
      for (let stage = cloud.life === ORDINARY ? 0 : 1; stage < 3 && !done; stage++) {
        cloud.life = stage ? LONG : ORDINARY; cloud.late = stage === 2;
        for (let attempt = 0, shift = 0; attempt < (cloud.late ? 1 : 7) && !done; attempt++) {
          schedule(cloud, shift);
          done = settled(i) && (cloud.life !== ORDINARY || !crowded(i));
          shift += cloud.slotSeconds / 7;
        }
      }
    }
    // Every main landing links to a permanent cloud or the coast within `spine` hops. One that does not makes
    // permanent the farthest main landing it reaches in that many hops, or itself when it reaches none.
    // Permanence only adds steady ground, so the settled clocks stay settled.
    const visited = new Uint8Array(n), queue = new Int16Array(n), hops = new Uint8Array(n);
    const spineFrom = (from) => {
      visited.fill(0);
      let head = 0, tail = 0;
      queue[tail++] = from; visited[from] = 1; hops[from] = 0;
      while (head < tail) {
        const i = queue[head++];
        if (clouds[i].life === PERMANENT || shoreAt(clouds[i], clouds[i].arrival)) return true;
        if (hops[i] === timing.spine) continue;
        for (let e = firstLink[i]; e < firstLink[i + 1]; e++) {
          const j = links[e];
          if (visited[j]) continue;
          visited[j] = 1; hops[j] = hops[i] + 1; queue[tail++] = j;
        }
      }
      return false;
    };
    for (let k = 0; k < count; k++) {
      const from = landings[k].index;
      if (spineFrom(from)) continue;
      let next = from;
      for (let h = 0; h < timing.spine; h++) {
        let far = next;
        for (let m = k + 1; m < count; m++) if (linked(next, landings[m].index)) far = landings[m].index;
        if (far === next) break;
        next = far;
      }
      clouds[next].life = PERMANENT; schedule(clouds[next]);
    }
    for (const cloud of clouds) {
      const offset = offsetAt(cloud, 0, wobbleAt(cloud, 0));
      cloud.x = cloud.previousX = cloud.baseX + cloud.moveX * offset;
      cloud.z = cloud.previousZ = cloud.baseZ + cloud.moveZ * offset;
      evaluate(cloud, 0);
    }

    // ---- the clock ----------------------------------------------------------------------------------------------
    const begin = () => {
      if (beganAt < 0) {
        beganAt = movementTime;
        for (const cloud of clouds) cloud.held = wobbleAt(cloud, movementTime);
      }
      return beganAt;
    };
    const update = (dt, raceTime) => {
      if (beganAt >= 0 && Number.isFinite(raceTime)) movementTime = beganAt + Math.max(0, raceTime);
      else movementTime += dt;
      const time = beganAt < 0 ? 0 : movementTime - beganAt;
      courseTime = time;
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        cloud.previousActive = cloud.active;
        cloud.previousX = cloud.x; cloud.previousZ = cloud.z;
        // Never a jump, so a rider is carried and a sweep holds over a frame of any length; direct evaluation
        // keeps long frames exact. The wobble held at departure eases out over the run's first SETTLE seconds.
        const settle = Math.min(1, time / SETTLE);
        const offset = beganAt < 0 ? offsetAt(cloud, 0, wobbleAt(cloud, movementTime))
          : offsetAt(cloud, time, cloud.held * (1 - settle * settle * (3 - 2 * settle)));
        cloud.x = cloud.baseX + cloud.moveX * offset;
        cloud.z = cloud.baseZ + cloud.moveZ * offset;
        evaluate(cloud, time);
        const opacity = cloud.phase === FADING ? 1 - cloud.progress : cloud.phase === HIDDEN ? 0
          : cloud.phase === APPEARING ? cloud.progress : 1;
        cloud.opacity = opacity;
        cloud.active = opacity > 0;
        cloud.fading = cloud.phase === FADING;
        cloud.warning = cloud.phase === WARNING ? cloud.progress : -1;
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
            const offset = offsetAt(cloud, cloud.firstGoneAt);
            pickup.x = cloud.baseX + cloud.moveX * offset;
            pickup.z = cloud.baseZ + cloud.moveZ * offset;
            pickup.falling = true;
          }
          const speed = cloud.depth / FADE_SECONDS;
          pickup.y = cloud.y - cloud.depth + PICKUP_LIFT - speed * fallingFor - GRAVITY * fallingFor * fallingFor * 0.5;
          pickup.vy = -speed - GRAVITY * fallingFor;
          if (pickup.y < finish.y - 120) pickup.active = false;
        }
      }
    };
    // Seconds of support this cloud has left by its schedule, read after update: Infinity when it never fades,
    // the time to the end of its fade otherwise, or minus the time until it is back while it is gone.
    const solidLeft = (cloud) => cloud.phase === HIDDEN || cloud.phase === APPEARING ? courseTime - cloud.windowEnd
      : cloud.windowStart + GONE - courseTime;
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
    return { clouds, pickups, timing, horizon, start: begin, update, supportAt, contactAt, touchTime, pickupAt, canRecover, solidLeft,
      windowAt, escapes, steadyAt, linked, presence, offsetAt };
  };
  BL.cloudHopperCourse = { create, TIMING, MAX_CLOUDS, CLOUD_DEPTH, FADE_SECONDS, APPEAR_SECONDS, PICKUP_LIFT, PICKUP_RADIUS,
    PERMANENT, LONG, ORDINARY, SOLID, WARNING, FADING, HIDDEN, APPEARING };
})();
