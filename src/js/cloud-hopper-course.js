// Cloud Hopper's seeded course and falling pickups; no scene or render state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, mulberry32 } = BL.math;
  const MAX_CLOUDS = 128, CLOUD_DEPTH = 2, APPEAR_SECONDS = 0.6;
  // How many places along its slot an ordinary cloud's clock is tried at before it stays permanent.
  const PLACES = 21;
  // A tornado's draw and lift ease back at these speeds once it lets a cloud go (m/s), and lift a cloud at most so far (m).
  const DRAW_BACK = 3, LIFT_BACK = 4, LIFT_MAX = 30;
  const CLOUD_GAP = 1.5;
  // The most eligible clouds a course's start, finish and jetpacks ever keep from being special.
  const SPECIAL_SPARE = 7;
  const GRAVITY = 9.8, PICKUP_LIFT = 0.7, PICKUP_RADIUS = 0.75, RUN_SPEED = 11.625, JUMP_SPEED = 4.8, SETTLE = 1.5, WOBBLE = 0.12;
  // Lifetime classes: a permanent cloud never fades; an ordinary one disappears once in each of its own slots.
  const PERMANENT = 0, ORDINARY = 1;
  // The phases a disappearance passes through. A warning keeps full support; the fade still holds a rider, sinking.
  const SOLID = 0, WARNING = 1, FADING = 2, HIDDEN = 3, APPEARING = 4;
  // The course's timing. `permanent` is the share of a course's white clouds that never fade, the rest ordinary (a
  // cloud that cannot be made ordinary fairly stays permanent, the next ones making up for it), while every boost
  // and bounce cloud is ordinary, never fading being for white clouds alone; `ordinary` its clouds'
  // slots in seconds (one disappearance each, log-uniform per cloud); `warn` and `fade` the warning and the sinking
  // fade, and `hidden` how long a cloud is gone before it comes back (s); `gap` is the least solid time between two of one
  // cloud's disappearances; `stagger` keeps reachable ordinary clouds' first two warnings apart; `spine` is the
  // most forward hops from a main landing to a permanent cloud; `pace` the seconds a hop is expected to take;
  // `reach` the share of a running jump (with the air jump when `airJump`) the fairness checks count on;
  // `presence` [early, late, extra] the span a rider may be on a cloud, from early × to late × its expected
  // arrival plus extra seconds. These defaults are Level 2's.
  const TIMING = Object.freeze({ permanent: 0.7, ordinary: Object.freeze([18, 42.9]),
    warn: 2.5, fade: 0.875, hidden: Object.freeze([2, 3.5]), gap: 4, firstWarn: 4, stagger: 3, spine: 3, pace: 2.8, reach: 0.7, airJump: true,
    presence: Object.freeze([0.4, 2.5, 40]) });
  // The course's shape: the along-route `step` between main landings (never under the widest swept clouds'
  // clearance), main and `side` cloud half-sizes [rx, rx range, rz, rz range], how far a `turn` aims across
  // and the most a landing `sway`s from the last, each cloud's swing `lane` and `speed` [least, range], side
  // clouds per main landing (`sides`, at most `sideMax`) and how far out they sit (`offset` [least, range]),
  // the `boost` and `bounce` shares of the clouds a course chooses among, the same number on every course of a level (at
  // most `bounceMax` bounces), the chance of a second
  // jetpack (`twoPacks`), and how many X-ray, Updraft and grappling hook pickups it carries (plan 3). These defaults
  // are the old course's.
  const LAYOUT = Object.freeze({ step: 11.5, main: Object.freeze([2.7, 0.9, 1.9, 0.7]), side: Object.freeze([2.8, 0.7, 2.1, 0.5]),
    turn: 40, sway: 7, lane: Object.freeze([5, 3]), speed: Object.freeze([0.9, 0.6]), sides: Infinity, sideMax: 24,
    offset: Object.freeze([22, 12]), boost: 0.22, bounce: 0.16, bounceMax: Infinity, twoPacks: 0.45, xray: 0, updraft: 0, hook: 0 });
  // Where along the main landings each power-up kind is spread: [first, span] as shares of the course.
  const STRETCH = Object.freeze({ xray: Object.freeze([0.12, 0.6]), updraft: Object.freeze([0.35, 0.45]), hook: Object.freeze([0.1, 0.5]) });
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
  // pickupAt consumes one pickup (a jetpack, or an `xray`, `updraft` or `hook`
  // power-up: its `kind`) and returns its stable record; equipping belongs to the
  // caller. `hit` finds where a ray first meets a cloud, for the grappling hook. `whirl` is a tornado's hold on the
  // clouds near it (cloud-hopper-tornado.js), the one thing besides race time that moves them. runSpeed and jumpSpeed are the player's, for the fairness checks;
  // `layout` and `timing` override LAYOUT's and TIMING's fields (a level's).
  const create = ({ start, finish, mainlandRadius = 30, seed = 1, layout: shape = LAYOUT, timing: tune = TIMING,
    runSpeed = RUN_SPEED, jumpSpeed = JUMP_SPEED }) => {
    const layout = { ...LAYOUT, ...shape }, timing = { ...TIMING, ...tune };
    const rand = mulberry32(seed), outwardX = start.x - finish.x, outwardZ = start.z - finish.z;
    const moveRand = mulberry32(seed ^ 0x3c6ef372), orientationRand = mulberry32(seed ^ 0xa54ff53a);
    const sideRand = mulberry32(seed ^ 0xbb67ae85);
    const startDistance = Math.hypot(outwardX, outwardZ), nx = outwardX / startDistance, nz = outwardZ / startDistance;
    const shoreDistance = mainlandRadius + 12, endY = finish.y + 18;
    const distance = startDistance - shoreDistance, drop = start.y - endY, sideX = -nz, sideZ = nx;
    // Slightly wider main gaps still fit a running jump. Bound their jitter
    // by the widest rotated mesh so neighbouring drift lanes stay separate.
    const minimumStep = Math.hypot(layout.main[0] + layout.main[1], layout.main[2] + layout.main[3]) * 2 + CLOUD_GAP;
    const count = Math.min(MAX_CLOUDS - 24, Math.max(12, Math.ceil(Math.max(drop / 9, distance / layout.step))),
      Math.max(6, Math.floor(distance / minimumStep)));
    const clouds = [], landings = [], pickups = [], placements = [], step = 1 / count;
    const alongJitter = Math.min(0.08, Math.max(0, 1 - minimumStep / (distance * step)));
    let lateral = 0, movementTime = 0, beganAt = -1, nextTurn = 0, target = 0, courseTime = 0;
    const addCloud = (x, y, z, rx, rz, side = 0) => {
      // Each cloud swings across the course on its own lane, speed and phase.
      // Independent lanes and clocks keep the field from swaying as one.
      const direction = moveRand() < 0.5 ? -1 : 1, moveX = sideX * direction, moveZ = sideZ * direction;
      const moveRange = layout.lane[0] + moveRand() * layout.lane[1], moveSpeed = layout.speed[0] + moveRand() * layout.speed[1];
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
        baseX: x, baseZ: z, previousX: x, previousZ: z, previousActive: true, turn: 0,
        moveX, moveZ, moveRange, moveSpeed, swing: 0,
        // The second draw is each cloud's clock phase, which keeps a seed's landings where they always were.
        seed: (rand() * 4294967296) >>> 0, clock: rand(), life: PERMANENT, main: !side, arrival: 0, held: 0, drawn: 0, lift: 0, previousLift: 0,
        slotSeconds: 0, t0: 0, firstGoneAt: 0, phase: SOLID, progress: 0, warning: -1, windowStart: 0, windowEnd: 0
      };
      cloud.swing = cycleRandom(cloud.seed, 0, 0x7f4a7c15) * Math.PI * 2;
      clouds.push(cloud);
      return cloud;
    };
    for (let i = 0; i < count; i++) {
      if (i >= nextTurn) {
        target = (rand() - 0.5) * 2 * layout.turn;
        nextTurn = i + 1 + Math.floor(rand() * 3);
      }
      const remaining = count - 1 - i;
      // Frequent random turns break up the line; taper back toward the coast.
      const wanted = remaining < 5 ? 0 : target + (rand() - 0.5) * 12;
      lateral += clamp(wanted - lateral, -layout.sway, layout.sway);
      lateral = clamp(lateral, -remaining * layout.sway, remaining * layout.sway);
      const last = remaining === 0, t = (i + 1) * step;
      const along = last ? 1 : t + (rand() - 0.5) * step * alongJitter;
      const down = last ? 1 : t + (rand() - 0.5) * step * 0.2;
      const radial = startDistance - distance * along;
      const x = finish.x + nx * radial + sideX * lateral, z = finish.z + nz * radial + sideZ * lateral;
      const y = start.y - drop * down;
      landings.push(addCloud(x, y, z, layout.main[0] + rand() * layout.main[1], layout.main[2] + rand() * layout.main[3]));
    }
    // Fill stratified segments across the whole descent instead of exhausting
    // the extra-cloud budget near the top. Alternating sides balance each
    // neighbourhood while keeping positions and heights random each play.
    const segments = count - 5, firstSide = sideRand() < 0.5 ? -1 : 1;
    const alternatives = Math.min(layout.sideMax, segments, MAX_CLOUDS - count, Math.round(count * layout.sides));
    for (let i = 0; i < alternatives; i++) {
      const low = Math.floor(i * segments / alternatives), high = Math.floor((i + 1) * segments / alternatives);
      const index = 2 + low + Math.floor(sideRand() * (high - low)), a = landings[index - 1], b = landings[index];
      const t = 0.35 + sideRand() * 0.3, side = i % 2 ? -firstSide : firstSide, offset = side * (layout.offset[0] + sideRand() * layout.offset[1]);
      addCloud(a.x + (b.x - a.x) * t + sideX * offset, a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t + sideZ * offset, layout.side[0] + sideRand() * layout.side[1], layout.side[2] + sideRand() * layout.side[3], side);
    }
    clouds.sort((a, b) => b.y - a.y);
    for (let i = 0; i < clouds.length; i++) clouds[i].index = i;
    const pickupCount = rand() < 1 - layout.twoPacks ? 1 : 2;
    for (let i = 0; i < pickupCount; i++) {
      const index = i ? Math.max(4, Math.floor(count * 0.24)) : 1 + Math.floor(rand() * 2);
      const cloud = landings[index];
      pickups.push({
        index: i, kind: "jetpack", cloud, x: cloud.x, y: cloud.top + PICKUP_LIFT, z: cloud.z,
        vy: 0, active: true, collected: false, falling: false
      });
    }
    // Special surfaces have their own stream: adding them must not move a
    // recorded course's landings, pickups, drift or disappearance clocks.
    // Every course of a level carries the same number of each: its `boost` and `bounce` shares (at most `bounceMax`
    // bounces, and at least one of each it carries) of the clouds a course of its size always has to choose from (all
    // but SPECIAL_SPARE, the most the start, the finish and the jetpacks ever keep), dealt at random among the eligible
    // clouds, bounces no nearer each other in height than a hop and a half while the course allows.
    const specialRand = mulberry32(seed ^ 0x7b1d943f), eligible = [];
    // The second landing is never special, since a run's first two landings never fade.
    for (const cloud of clouds) {
      if (cloud.y >= landings[0].y || cloud.y <= landings[count - 3].y || cloud === landings[1]
        || pickups.some(pickup => pickup.cloud === cloud)) continue;
      eligible.push(cloud);
    }
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(specialRand() * (i + 1)), cloud = eligible[i];
      eligible[i] = eligible[j]; eligible[j] = cloud;
    }
    const pool = clouds.length - SPECIAL_SPARE, hop = drop * step * 1.5;
    const dealt = { boost: layout.boost > 0 ? Math.max(1, Math.round(layout.boost * pool)) : 0,
      bounce: layout.bounce > 0 && layout.bounceMax > 0 ? Math.min(layout.bounceMax, Math.max(1, Math.round(layout.bounce * pool))) : 0 };
    const apart = (cloud) => { for (const other of eligible) if (other.kind === "bounce" && Math.abs(other.y - cloud.y) <= hop) return false; return true; };
    // Make a white eligible cloud `kind` (those `may` allows), the bounce kept apart from the others on the first pass.
    const deal = (kind, may) => {
      for (let pass = 0; pass < 2; pass++) for (const cloud of eligible) {
        if (cloud.kind !== "normal" || !may(cloud) || kind === "bounce" && !pass && !apart(cloud)) continue;
        cloud.kind = kind;
        if (kind === "boost") { cloud.boostX = -nx; cloud.boostZ = -nz; }
        return true;
      }
      return false;
    };
    for (let k = 0; k < dealt.boost; k++) deal("boost", () => true);
    for (let k = 0; k < dealt.bounce; k++) deal("bounce", () => true);
    // A boost cloud launches toward the mainland independently of its orientation (`deal` sets it).
    // ---- lifetimes --------------------------------------------------------------------------------------------
    // Every disappearance is a closed-form function of race time: a cloud's clock starts at t0 and is cut into
    // slots of slotSeconds, each holding one warning, fade, hidden span and return at a seeded place inside it,
    // with half the least solid gap kept clear at either end. Each slot draws its own place and hidden span.
    const W = timing.warn, GONE = W + timing.fade, gapHalf = timing.gap / 2;
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
      else if (local < GONE) { cloud.phase = FADING; cloud.progress = (local - W) / timing.fade; }
      else if (local < back) { cloud.phase = HIDDEN; cloud.progress = (local - GONE) / hidden; }
      else if (local < back + APPEAR_SECONDS) { cloud.phase = APPEARING; cloud.progress = (local - back) / APPEAR_SECONDS; }
      else cloud.windowStart = windowAt(cloud, slot + 1);
    };
    // The span a rider may be on this cloud, from early to late runs.
    const presence = (cloud) => cloud.arrival * timing.presence[1] + timing.presence[2];
    const schedule = (cloud, shift = 0) => {
      if (cloud.life === PERMANENT) { cloud.slotSeconds = cloud.t0 = cloud.firstGoneAt = Infinity; return; }
      const range = timing.ordinary;
      cloud.slotSeconds = range[0] * Math.pow(range[1] / range[0], cycleRandom(cloud.seed, 0, 0x9e6c63d1));
      cloud.t0 = timing.firstWarn - gapHalf + cloud.clock * cloud.slotSeconds + shift;
      cloud.firstGoneAt = windowAt(cloud, 0) + GONE;
    };
    // Every cloud starts permanent, and the settling below makes the course's share of its white clouds and every
    // boost and bounce cloud ordinary from its own stream, so a seed's landings, specials and pickups stay where they
    // were. A run starts and ends on clouds that never fade.
    const lifeRand = mulberry32(seed ^ 0x2545f491), fixed = new Uint8Array(clouds.length);
    for (const k of [0, 1, count - 2, count - 1]) fixed[landings[k].index] = 1;
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
    // A main landing links to a permanent cloud or the coast within `spine` hops.
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
    // Settle from the bottom up, each cloud by its own clock alone, so every cloud one can escape to is settled
    // before it. While the white clouds made ordinary so far fall short of the course's share of them (a seeded
    // chance either way, so they fall unevenly), a white cloud is made ordinary if one of PLACES places along its
    // slot keeps its every warning fair, its linked ordinary clouds' first warnings apart and, for a main landing, a
    // permanent cloud or the coast within `spine` hops; otherwise it stays permanent, and the next ones make up for
    // it. Every boost and bounce cloud is made ordinary, since only a white cloud may never fade; a touch launches a
    // rider off one, so no rider stands on it as it warns and it keeps only its linked ordinary clouds' warnings
    // apart. One no place keeps so turns white and stays permanent. Nothing settled changes.
    const open = clouds.filter((cloud, i) => !fixed[i] && cloud.kind === "normal").length, wanted = (1 - timing.permanent) * open;
    let ordinary = 0, seen = 0;
    const turned = [];
    for (let i = n - 1; i >= 0; i--) {
      const cloud = clouds[i], special = cloud.kind !== "normal";
      if (fixed[i]) continue;
      if (!special) {
        seen++;
        if (lifeRand() >= clamp(wanted * seen / open - ordinary + 0.5, 0, 1)) continue;
      }
      cloud.life = ORDINARY;
      let done = false;
      for (let attempt = 0, shift = 0; attempt < PLACES && !done; attempt++) {
        schedule(cloud, shift);
        done = special ? !crowded(i) : settled(i) && !crowded(i) && (!cloud.main || spineFrom(i));
        shift += cloud.slotSeconds / PLACES;
      }
      if (done) { if (!special) ordinary++; }
      else {
        cloud.life = PERMANENT; schedule(cloud);
        if (special) { turned.push(cloud.kind); cloud.kind = "normal"; cloud.boostX = cloud.boostZ = 0; }
      }
    }
    // Each special turned white is dealt again to an ordinary white cloud, whose clock already keeps every check a special
    // needs, so the counts hold.
    for (const kind of turned) deal(kind, (cloud) => cloud.life === ORDINARY);
    for (const cloud of clouds) {
      const offset = offsetAt(cloud, 0, wobbleAt(cloud, 0));
      cloud.x = cloud.previousX = cloud.baseX + cloud.moveX * offset;
      cloud.z = cloud.previousZ = cloud.baseZ + cloud.moveZ * offset;
      evaluate(cloud, 0);
    }

    // ---- power-ups --------------------------------------------------------------------------------------------
    // X-ray, Updraft and grappling hook pickups, each kind spread over its own stretch of the main landings, on plain
    // clouds no pickup holds, clear of the first and last three, from their own stream so nothing above moves.
    const powerRand = mulberry32(seed ^ 0x6a09e667);
    for (const kind of ["xray", "updraft", "hook"]) for (let k = 0, n = layout[kind]; k < n; k++) {
      const [first, span] = STRETCH[kind], want = Math.round((first + span * (k + 0.3 + powerRand() * 0.4) / n) * (count - 1));
      let cloud = null;
      for (let d = 0; d < count && !cloud; d++) for (let side = 0; side < 2 && !cloud; side++) {
        const i = side ? want - d : want + d, c = landings[i];
        if (i < 3 || i > count - 4 || c.kind !== "normal" || pickups.some(p => p.cloud === c)) continue;
        cloud = c;
      }
      if (cloud) pickups.push({ index: pickups.length, kind, cloud, x: cloud.x, y: cloud.top + PICKUP_LIFT, z: cloud.z,
        vy: 0, active: true, collected: false, falling: false });
    }

    // ---- the clock ----------------------------------------------------------------------------------------------
    const begin = () => {
      if (beganAt < 0) {
        beganAt = movementTime;
        for (const cloud of clouds) cloud.held = wobbleAt(cloud, movementTime);
      }
      return beganAt;
    };
    // A tornado's whirl: within `reach` of its axis (x, z) a cloud turns round it, as a vortex turns, at `speed` m/s on
    // the edge of its `core` and slower outside it; each cloud keeps its own angle round it (`turn`) while it is
    // near, and `strength` (0 to 1) blends it from its lane to that turned place, so as the whirl dies or moves off a
    // cloud eases back into its lane. It also draws a near cloud in toward it at up to `draw` m/s (`drawn`, never inside
    // its core) and lifts it at up to `rise` m/s (`lift`, at most LIFT_MAX), both easing back once it lets the cloud go.
    // Every step is smooth, so a planted rider is carried round, in and up.
    const whirl = { x: 0, z: 0, strength: 0, reach: 1, core: 1, speed: 0, draw: 0, rise: 0 };
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
        cloud.previousLift = cloud.lift;
        const dx = cloud.x - whirl.x, dz = cloud.z - whirl.z, r = Math.hypot(dx, dz), near = whirl.strength > 0 ? 1 - (r / whirl.reach) ** 2 : 0;
        if (near > 0) {
          cloud.turn += dt * whirl.speed * (r < whirl.core ? 1 / whirl.core : whirl.core / (r * r));
          const k = whirl.strength * Math.min(1, 1.6 * near), c = Math.cos(cloud.turn) - 1, s = Math.sin(cloud.turn);
          cloud.x += k * (dx * c - dz * s); cloud.z += k * (dx * s + dz * c);
        } else cloud.turn = 0;
        const pull = whirl.strength * Math.max(0, near);
        cloud.drawn = pull > 0 ? Math.min(Math.max(0, r - whirl.core - 2), cloud.drawn + dt * whirl.draw * pull) : Math.max(0, cloud.drawn - dt * DRAW_BACK);
        cloud.lift = pull > 0 ? Math.min(LIFT_MAX, cloud.lift + dt * whirl.rise * pull) : Math.max(0, cloud.lift - dt * LIFT_BACK);
        if (cloud.drawn > 0) {
          const qx = cloud.x - whirl.x, qz = cloud.z - whirl.z, q = Math.hypot(qx, qz) || 1, k = Math.max(whirl.core + 2, q - cloud.drawn) / q;
          cloud.x = whirl.x + qx * k; cloud.z = whirl.z + qz * k;
        }
        evaluate(cloud, time);
        const opacity = cloud.phase === FADING ? 1 - cloud.progress : cloud.phase === HIDDEN ? 0
          : cloud.phase === APPEARING ? cloud.progress : 1;
        cloud.opacity = opacity;
        cloud.active = opacity > 0;
        cloud.fading = cloud.phase === FADING;
        cloud.warning = cloud.phase === WARNING ? cloud.progress : -1;
        cloud.top = cloud.y + cloud.lift - cloud.depth * (1 - opacity);
      }
      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.active) continue;
        const cloud = pickup.cloud, fallingFor = time - cloud.firstGoneAt;
        if (fallingFor < 0) {
          pickup.x = cloud.x; pickup.z = cloud.z;
          pickup.y = cloud.top + PICKUP_LIFT;
          pickup.vy = cloud.fading ? -cloud.depth / timing.fade : 0;
        } else {
          // Detach at the exact zero-opacity instant, even if a frame spans the
          // whole disappearance. A returning cloud never recalls its pickup.
          if (!pickup.falling) {
            const offset = offsetAt(cloud, cloud.firstGoneAt);
            pickup.x = cloud.baseX + cloud.moveX * offset;
            pickup.z = cloud.baseZ + cloud.moveZ * offset;
            pickup.falling = true;
          }
          const speed = cloud.depth / timing.fade;
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
    // Where a ray from (ox, oy, oz) along the unit (dx, dy, dz) first meets a solid cloud's body, out to `far` metres:
    // into `out` (x, y, z, the cloud and how far), true when it does. A body is the cloud's footprint from its top down
    // its depth, `pad` wider.
    const hit = (ox, oy, oz, dx, dy, dz, far, out, pad = 0.3) => {
      let best = far;
      out.cloud = null;
      for (let i = 0; i < clouds.length; i++) {
        const cloud = clouds[i];
        if (!cloud.active) continue;
        const bottom = cloud.top - cloud.depth, rx = cloud.rx + pad, rz = cloud.rz + pad;
        // In the cloud's frame, scaled so its footprint is the unit circle.
        const px = ox - cloud.x, pz = oz - cloud.z;
        const lx = (px * cloud.cosYaw - pz * cloud.sinYaw) / rx, lz = (px * cloud.sinYaw + pz * cloud.cosYaw) / rz;
        const ex = (dx * cloud.cosYaw - dz * cloud.sinYaw) / rx, ez = (dx * cloud.sinYaw + dz * cloud.cosYaw) / rz;
        let t = Infinity;
        // Through the top, from above.
        if (dy < 0 && oy > cloud.top) {
          const s = (cloud.top - oy) / dy, qx = lx + ex * s, qz = lz + ez * s;
          if (qx * qx + qz * qz <= 1) t = s;
        }
        // Through the side, between its top and its foot.
        const a = ex * ex + ez * ez, b = 2 * (lx * ex + lz * ez), c = lx * lx + lz * lz - 1, root = b * b - 4 * a * c;
        if (a > 1e-12 && root >= 0) {
          const s = (-b - Math.sqrt(root)) / (2 * a), y = oy + dy * s;
          if (s >= 0 && s < t && y <= cloud.top && y >= bottom) t = s;
        }
        if (t < best) { best = t; out.cloud = cloud; }
      }
      if (!out.cloud) return false;
      out.x = ox + dx * best; out.y = oy + dy * best; out.z = oz + dz * best; out.t = best;
      return true;
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
    // `wants(kind)`, when given, says which kinds the body may take now; the rest stay where they are.
    const pickupAt = (x, y, z, height, wants = null) => {
      for (let i = 0; i < pickups.length; i++) {
        const pickup = pickups[i];
        if (!pickup.active || wants && !wants(pickup.kind) || pickup.y < y - PICKUP_RADIUS || pickup.y > y + height + PICKUP_RADIUS) continue;
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
      const velocity = pickup.falling ? pickup.vy : -pickup.cloud.depth / timing.fade;
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
      // A nearby pack or sky feather is only a rescue if the body can meet it vertically
      // before water. An unreachable one overhead must not hold DQ open.
      for (const pickup of pickups) if (pickup.active && (pickup.kind === "jetpack" || pickup.kind === "updraft") && pickup.y >= seaY - PICKUP_RADIUS
        && canInterceptPickup(pickup, x, feet, z, vy, speed, jump, seaY, jetSeconds, jetAccel, height, seaTime)) return true;
      return false;
    };
    return { clouds, pickups, layout, timing, horizon, start: begin, update, supportAt, contactAt, touchTime, pickupAt, canRecover, solidLeft,
      hit, whirl, windowAt, escapes, steadyAt, linked, presence, offsetAt };
  };
  BL.cloudHopperCourse = { create, LAYOUT, TIMING, MAX_CLOUDS, CLOUD_DEPTH, APPEAR_SECONDS, PICKUP_LIFT, PICKUP_RADIUS,
    PERMANENT, ORDINARY, SOLID, WARNING, FADING, HIDDEN, APPEARING };
})();
