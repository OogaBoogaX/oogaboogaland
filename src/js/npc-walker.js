// The existing crew's supported walker, incremental local search and work-route
// stepping. World/crowd queries and pose effects are injected; airborne integration
// and the complete actor lifecycle still belong to the caller.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const NAV_WIDTH = 21, NAV_SIZE = NAV_WIDTH * NAV_WIDTH, NAV_HALF = 10, NAV_CELL = 0.5, NAV_STEP = 0.025, NAV_CENTER = NAV_HALF * NAV_WIDTH + NAV_HALF;
  const createState = i => ({
          active: false, side: i & 1 ? 1 : -1, stalled: 0, best: Infinity, tx: NaN, tz: NaN, goalX: NaN, goalZ: NaN, pathIndex: -1, pathVersion: -1,
          detour: { site: -1, phase: 0, side: 1, entryX: 0, goalX: NaN, goalZ: NaN, x: 0, z: 0 },
          navigation: {
            mode: 0, x: 0, z: 0, count: 0, index: 0, searches: 0, expansions: 0,
            jumpCandidate: 0, jumps: 0, jumpX: 0, jumpZ: 0, clearance: 0, double: false, boosted: false, moving: false,
            costs: new Float32Array(NAV_SIZE), parents: new Int16Array(NAV_SIZE), heights: new Float32Array(NAV_SIZE), closed: new Uint8Array(NAV_SIZE), path: new Int16Array(NAV_SIZE)
          }
        });
  const create = ({ ctx, crewList, playerBody, gapClear, npcWalkable, groundAt,
    inBananas, shoulderNeighbor, shoulderClear, flyable, walkerClear, groundY,
    shoulderStep, standPose, walkPose, fixedTrip = () => false, pathsFor = () => ctx.npcPaths, SHOULDER_GAP, OUTSIDE_GAP, STEP,
    SHOULDER_REACH, JUMP_SPEED, WALK, PLAYER_STEP, NPC_PASS_REACH, RUSH_SPEED }) => {
    const recoverWalker = (cave, tx, tz, dt, usePath = false) => {
      const a = cave.avoidance, nav = a.navigation, p = cave.root.position, path = cave.pathing;
      if (fixedTrip(cave)) { nav.mode = 0; return; }
      // Keep the route identity stable and recover toward its current segment.
      // The path index advances within a route; replans and explicit route
      // resets invalidate the cached target before restarting stall tracking.
      const stable = usePath && path && Number.isFinite(path.tx) && Number.isFinite(path.tz) && path.count > 1 && path.index < path.count - 1;
      const gx = stable ? path.tx : tx, gz = stable ? path.tz : tz;
      const leg = stable ? Math.min(path.index, path.count - 2) : -1, version = stable ? path.version : -1;
      const changed = gx !== a.goalX || gz !== a.goalZ || version !== a.pathVersion || !Number.isFinite(a.tx);
      if (changed || leg > a.pathIndex) {
        a.goalX = gx; a.goalZ = gz; a.pathIndex = leg; a.pathVersion = version;
        let end = leg + 1;
        if (stable) {
          // Graph samples along one straight lane are not recovery goals:
          // a sub-metre sample can finish the search before the obstruction.
          // Stop at the next bend, keeping recovery on this side of its wall.
          const dx = path.laneX[end] - path.laneX[leg], dz = path.laneZ[end] - path.laneZ[leg];
          while (end + 1 < path.count) {
            const nx = path.laneX[end + 1] - path.laneX[end], nz = path.laneZ[end + 1] - path.laneZ[end];
            if (dx * nx + dz * nz <= 0 || Math.abs(dx * nz - dz * nx) > 1e-7) break;
            end++;
          }
        }
        a.tx = stable ? path.laneX[end] : tx; a.tz = stable ? path.laneZ[end] : tz;
        // Rounded bends have short, non-collinear samples. A nearby clear
        // sample can end recovery before the blocked lookahead, so retain
        // the route's lookahead there, rather than its final destination.
        const nearby = Math.hypot(a.tx - p.x, a.tz - p.z);
        if (stable && nearby < 0.75 && Math.hypot(tx - p.x, tz - p.z) > nearby) { a.tx = tx; a.tz = tz; }
        a.best = Infinity; a.stalled = 0; nav.mode = 0;
      }
      const distance = Math.hypot(a.tx - p.x, a.tz - p.z);
      if (cave.traffic.waiting) { a.stalled = 0; a.best = Infinity; nav.mode = 0; return; }
      if (distance < a.best - 0.1) { a.best = distance; a.stalled = 0; }
      else a.stalled += dt;
      if (!nav.mode && a.stalled > 0.75 && distance > 0.15) {
        // A small fixed local search escapes a cul-de-sac; spread over frames, unobstructed walking never searches.
        nav.mode = 1; nav.x = p.x; nav.z = p.z; nav.count = nav.index = 0; nav.searches++;
        nav.costs.fill(Infinity); nav.parents.fill(-1); nav.closed.fill(0);
        nav.costs[NAV_CENTER] = 0; nav.heights[NAV_CENTER] = p.y - cave.baseY;
      }
    };
    const recoveryBodies = new Array(crewList.length), recoveryOutside = [];
    let recoveryBodyCount = 0, recoveryOutsideCount = 0;
    const recoveryHeight = (cave, x, z, y, tx, tz, step) => {
      const dx = tx - x, dz = tz - z, distance = Math.hypot(dx, dz);
      if (distance < 1e-7) return y;
      step = Math.min(step, NAV_STEP);
      const steps = Math.max(1, Math.ceil(distance / step));
      const fromX = x, fromZ = z;
      // Fetch and filter the crowd once per edge. Keep short swept checks
      // only for nearby bodies: escape and height rules depend on each step.
      recoveryBodyCount = recoveryOutsideCount = 0;
      for (let n = 0; n < crewList.length; n++) {
        const other = crewList[n];
        if (!cave.nonInteractive && !other.nonInteractive && other !== cave && !playerBody(other) && other.root.visible && other.state !== "away" && !other.root.quaternion && !other.camp.seat
          && Math.hypot(other.root.position.x - x, other.root.position.z - z) <= distance + Math.max(SHOULDER_GAP, cave.bodyRadius + other.bodyRadius)) recoveryBodies[recoveryBodyCount++] = other;
      }
      const outside = ctx.outsideActors && ctx.outsideActors();
      if (outside && !cave.nonInteractive) for (let n = 0; n < outside.length; n++) {
        const body = outside[n];
        if (!body.player && Math.hypot(body.x - x, body.z - z) <= distance + Math.max(OUTSIDE_GAP, (body.radius || 0) + cave.bodyRadius)) recoveryOutside[recoveryOutsideCount++] = body;
      }
      // A coarse edge can cross a deep corner before reaching a higher tread.
      // Follow the same short, supported steps as the walker, not the line
      // between endpoint heights, or recovery will select that edge forever.
      for (let i = 1; i <= steps; i++) {
        const along = Math.min(distance, i * step) / distance;
        const nx = fromX + dx * along, nz = fromZ + dz * along;
        for (let n = 0; n < recoveryOutsideCount; n++) {
          const body = recoveryOutside[n];
          if (y < body.y + (body.height || ctx.outsideActorHeight) && y + cave.bodyHeight > body.y
            && !gapClear(x, z, nx, nz, body, Math.max(OUTSIDE_GAP, (body.radius || 0) + cave.bodyRadius))) return NaN;
        }
        for (let n = 0; n < recoveryBodyCount; n++) {
          const other = recoveryBodies[n], floor = other.root.position.y - other.baseY;
          if (y < floor + other.bodyHeight - 0.05 && y + cave.bodyHeight > floor + 0.05 && Math.abs(y - floor) < STEP
            && !gapClear(x, z, nx, nz, other.root.position, Math.max(SHOULDER_GAP, cave.bodyRadius + other.bodyRadius))) return NaN;
        }
        if (!npcWalkable(x, z, nx, nz, y, cave.bodyHeight, cave)) return NaN;
        const height = groundAt(nx, nz, y, y, cave);
        if (height < y - STEP - 1e-7 || height > y + STEP + 1e-7) return NaN;
        x = nx; z = nz; y = height;
      }
      return y;
    };
    const searchWalker = (cave, tx, tz, step) => {
      const nav = cave.avoidance.navigation;
      for (let budget = 0; budget < 6; budget++) {
        let current = -1, best = Infinity;
        for (let i = 0; i < NAV_SIZE; i++) if (!nav.closed[i] && nav.costs[i] < Infinity) {
          const x = nav.x + (i % NAV_WIDTH - NAV_HALF) * NAV_CELL, z = nav.z + (Math.floor(i / NAV_WIDTH) - NAV_HALF) * NAV_CELL;
          const score = nav.costs[i] + Math.hypot(tx - x, tz - z);
          if (score < best) { current = i; best = score; }
        }
        if (current < 0) { nav.mode = 3; nav.jumpCandidate = 0; return; }
        nav.closed[current] = 1; nav.expansions++;
        const col = current % NAV_WIDTH, row = Math.floor(current / NAV_WIDTH);
        const x = nav.x + (col - NAV_HALF) * NAV_CELL, z = nav.z + (row - NAV_HALF) * NAV_CELL, y = nav.heights[current];
        const remaining = Math.hypot(tx - x, tz - z);
        // A stalled walker needs a step out of its current cell. Accepting
        // the center produces an empty route and clears the stall unchanged.
        const destination = current !== NAV_CENTER && remaining < 0.75 && Number.isFinite(recoveryHeight(cave, x, z, y, tx, tz, step));
        const exit = (col === 0 || row === 0 || col === NAV_WIDTH - 1 || row === NAV_WIDTH - 1)
          && remaining < Math.hypot(tx - nav.x, tz - nav.z) - 0.5;
        if (destination || exit) {
          for (let i = current; i !== NAV_CENTER && i >= 0; i = nav.parents[i]) nav.path[nav.count++] = i;
          nav.index = nav.count - 1; nav.mode = 2;
          return;
        }
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || col + dx < 0 || col + dx >= NAV_WIDTH || row + dz < 0 || row + dz >= NAV_WIDTH) continue;
          const next = current + dz * NAV_WIDTH + dx, cost = nav.costs[current] + Math.hypot(dx, dz) * NAV_CELL;
          if (nav.closed[next] || cost >= nav.costs[next]) continue;
          const nx = x + dx * NAV_CELL, nz = z + dz * NAV_CELL;
          const height = recoveryHeight(cave, x, z, y, nx, nz, step);
          if (!Number.isFinite(height)) continue;
          nav.costs[next] = cost; nav.parents[next] = current; nav.heights[next] = height;
        }
      }
    };
    const jumpWalker = (cave, tx, tz) => {
      const nav = cave.avoidance.navigation, p = cave.root.position, feet = p.y - cave.baseY;
      if (inBananas(cave) || nav.jumpCandidate >= 8) { nav.mode = 0; cave.avoidance.stalled = -1; return; }
      // The search spans frames: traffic or scenery can clear before it fails.
      // Recheck the supported ground route before committing to an escape jump.
      if (Number.isFinite(recoveryHeight(cave, p.x, p.z, feet, tx, tz, NAV_STEP))) {
        nav.mode = 0; cave.avoidance.stalled = 0; cave.avoidance.best = Infinity; cave.avoidance.active = false;
        return;
      }
      for (let otherIndex = 0; otherIndex < crewList.length; otherIndex++) {
        const other = crewList[otherIndex];
        if (!shoulderNeighbor(cave, other)) continue;
        const q = other.root.position;
        if (Math.min(Math.hypot(p.x - q.x, p.z - q.z), Math.hypot(tx - q.x, tz - q.z)) >= SHOULDER_REACH) continue;
        // A crowd can invalidate a local search while it is being explored.
        // Refresh the ground route when either the walker or its hint is
        // beside someone, instead of jumping out of a passing queue.
        nav.mode = 0; cave.avoidance.stalled = -0.25; return;
      }
      const distance = Math.hypot(tx - p.x, tz - p.z), reach = Math.min(distance, SHOULDER_REACH);
      if (distance > 1e-7 && !shoulderClear(cave, p.x + (tx - p.x) * reach / distance, p.z + (tz - p.z) * reach / distance)) {
        // Another Ooga can close a doorway only temporarily. Retry ordinary
        // walking after yielding instead of jumping onto the visitor's head.
        nav.mode = 0; cave.avoidance.stalled = -0.25;
        return;
      }
      const candidate = nav.jumpCandidate++, turn = candidate ? Math.ceil(candidate / 2) * (candidate & 1 ? 1 : -1) * Math.PI / 4 : 0;
      const angle = Math.atan2(tx - p.x, tz - p.z) + turn, endX = p.x + Math.sin(angle) * 1.1, endZ = p.z + Math.cos(angle) * 1.1;
      // Rotated escape candidates need the same crowd check as the forward
      // route: another Ooga's head is not a recovery platform.
      if (!shoulderClear(cave, endX, endZ)) return;
      const landing = groundAt(endX, endZ, feet + 2.1, feet + 2.1, cave), clearance = Math.max(feet, landing) + 0.08;
      const maxDrop = ctx.npcRecoveryDrop && ctx.npcRecoveryDrop(p.x, feet, p.z, cave) ? 4 : 3;
      if (landing < feet - maxDrop || landing > feet + 2.1 || !flyable(endX, endZ, endX, endZ, landing + 1e-5, cave.bodyHeight, cave)
        || ctx.npcLandingAllowed && !ctx.npcLandingAllowed(endX, landing, endZ, cave.bodyHeight, cave)) return;
      const double = landing > feet + 0.85;
      let x = p.x, z = p.z, y = feet, velocity = JUMP_SPEED, boosted = false, moving = false;
      // Check one candidate per frame against swept bodies and actual support.
      // A lift before lateral travel lets a wedged NPC jump onto its obstacle.
      for (let i = 0; i < 120; i++) {
        velocity -= WALK.gravity * 0.025;
        if (double && !boosted && velocity <= 0) { velocity = JUMP_SPEED; boosted = true; }
        const nextY = y + velocity * 0.025;
        if (nextY >= clearance) moving = true;
        const remaining = Math.hypot(endX - x, endZ - z), step = moving ? Math.min(0.075, remaining) : 0;
        const nx = remaining ? x + (endX - x) * step / remaining : x, nz = remaining ? z + (endZ - z) * step / remaining : z;
        if (ctx.npcHazardClear && !ctx.npcHazardClear(x, y, z, nx, nextY, nz, cave.bodyHeight, cave)) return;
        if (moving && velocity < 0 && nextY <= landing && Math.hypot(endX - nx, endZ - nz) < 0.6) {
          if (!flyable(nx, nz, nx, nz, landing + 1e-5, cave.bodyHeight, cave)) return;
          nav.mode = 4; nav.jumpX = endX; nav.jumpZ = endZ; nav.clearance = clearance; nav.double = double;
          nav.boosted = nav.moving = false; nav.jumps++; cave.hopV = JUMP_SPEED;
          cave.leap.vx = cave.leap.vz = 0;
          return;
        }
        if (nextY < feet - maxDrop || !flyable(x, z, nx, nz, Math.min(y, nextY) + 1e-5, cave.bodyHeight, cave)
          || !flyable(nx, nz, nx, nz, nextY + 1e-5, cave.bodyHeight, cave)) return;
        x = nx; z = nz; y = nextY;
      }
    };
    const walkToward = (cave, tx, tz, distance) => {
      // A fixed meadow leg steps straight along its authored waypoint and passes
      // through any object in its way: the authored paths are clear, so there is
      // no blocking check. Each step settles on the terrain beneath it (groundY).
      if (fixedTrip(cave)) {
        const p = cave.root.position, dx = tx - p.x, dz = tz - p.z, left = Math.hypot(dx, dz);
        if (left < 1e-7) return 0;
        const step = Math.min(distance, PLAYER_STEP, left), x = p.x + dx / left * step, z = p.z + dz / left * step;
        // The host also fences its authored route against the authoritative
        // land boundary. The browser keeps rock's terrain-only passive walk.
        if (ctx.npcExecution && !walkerClear(cave, x, z)) return 0;
        p.x = x; p.z = z; p.y = groundY(cave);
        const angle = Math.atan2(dx, dz);
        cave.root.rotation.y += Math.atan2(Math.sin(angle - cave.root.rotation.y), Math.cos(angle - cave.root.rotation.y)) * 0.35;
        return step;
      }
      if (cave.traffic.yielding) return 0;
      const progress = cave.progress;
      if (progress.backoff > 0) {
        const p = cave.root.position, step = Math.min(distance, progress.backoff, PLAYER_STEP);
        const x = p.x + progress.backX * step, z = p.z + progress.backZ * step;
        if (!walkerClear(cave, x, z)) { progress.backoff = 0; return 0; }
        p.x = x; p.z = z; p.y = groundY(cave);
        progress.backoff = Math.max(0, progress.backoff - step);
        return step;
      }
      if (cave.traffic.waiting) return 0;
      const nav = cave.avoidance.navigation;
      if (nav.mode === 1) { searchWalker(cave, cave.avoidance.tx, cave.avoidance.tz, NAV_STEP); return 0; }
      if (nav.mode === 3) { jumpWalker(cave, cave.avoidance.tx, cave.avoidance.tz); return 0; }
      if (nav.mode === 4) return 0;
      if (nav.mode === 2) {
        while (nav.index >= 0) {
          const i = nav.path[nav.index], x = nav.x + (i % NAV_WIDTH - NAV_HALF) * NAV_CELL, z = nav.z + (Math.floor(i / NAV_WIDTH) - NAV_HALF) * NAV_CELL;
          if (Math.hypot(x - cave.root.position.x, z - cave.root.position.z) < 1e-6) { nav.index--; continue; }
          tx = x; tz = z; break;
        }
        if (nav.index < 0) { nav.mode = 0; cave.avoidance.stalled = 0; cave.avoidance.best = Infinity; cave.avoidance.active = false; }
      }
      const p = cave.root.position, dx = tx - p.x, dz = tz - p.z, remaining = Math.hypot(dx, dz);
      if (remaining < 1e-7) return 0;
      const step = Math.min(distance, nav.mode === 2 ? NAV_STEP : PLAYER_STEP, remaining), heading = Math.atan2(dx, dz), avoidance = cave.avoidance;
      // A clear stop before a wall must not trigger a pass around the wall beyond it; probe only the route left.
      // Recovery waypoints already clear solid bodies; a shoulder detour here can circle a blocked waypoint forever.
      const passing = nav.mode === 2 ? -1 : shoulderStep(cave, dx / remaining, dz / remaining, step, true, Math.min(NPC_PASS_REACH, remaining));
      if (passing >= 0) {
        avoidance.active = false;
        // A wall can close the chosen shoulder side. Let the ordinary
        // two-sided detour below try the open side before starting recovery.
        if (passing || cave.shoulder.prop) return passing;
      }
      let angle = heading;
      const ahead = nav.mode === 2 ? step : avoidance.active ? Math.min(0.9, remaining) : step;
      if (walkerClear(cave, p.x + Math.sin(heading) * step, p.z + Math.cos(heading) * step)
        && (ahead === step || walkerClear(cave, p.x + Math.sin(heading) * ahead, p.z + Math.cos(heading) * ahead))) avoidance.active = false;
      else {
        if (nav.mode === 2) { nav.mode = 0; avoidance.stalled = 0.8; return 0; }
        let clear = false;
        // Fixed capacity, no path allocation: each candidate is tested for the step and a body-width look-ahead.
        for (let side = 0; side < 2 && !clear; side++) {
          const sign = side ? -avoidance.side : avoidance.side;
          for (let turn = 1; turn <= 4; turn++) {
            angle = heading + sign * turn * Math.PI / 6;
            const look = Math.max(step, 0.35), sx = Math.sin(angle), sz = Math.cos(angle);
            if (!walkerClear(cave, p.x + sx * look, p.z + sz * look) || !walkerClear(cave, p.x + sx * step, p.z + sz * step)) continue;
            avoidance.side = sign;
            avoidance.active = clear = true;
            break;
          }
        }
        if (!clear) { if (avoidance.stalled >= 0) avoidance.stalled = Math.max(0.8, avoidance.stalled); return 0; }
      }
      p.x += Math.sin(angle) * step; p.z += Math.cos(angle) * step;
      p.y = groundY(cave);
      cave.root.rotation.y += Math.atan2(Math.sin(angle - cave.root.rotation.y), Math.cos(angle - cave.root.rotation.y)) * 0.35;
      return step;
    };
    const walkWorkTo = (cave, target, dt, followPath = true) => {
      const p = cave.root.position, work = cave.work, paths = followPath && !work.direct && pathsFor(cave);
      if (!paths && cave.pathing) {
        cave.pathing.tx = NaN; cave.pathing.index = cave.pathing.count;
        cave.pathing.targetX = target.x; cave.pathing.targetZ = target.z;
      }
      if (Math.hypot(target.x - p.x, target.z - p.z) < 0.12) { standPose(cave); return true; }
      if (paths && (!cave.avoidance.navigation.mode || cave.pathing.tx !== target.x || cave.pathing.tz !== target.z)) paths.target(cave, target.x, target.z);
      recoverWalker(cave, paths ? cave.pathing.targetX : target.x, paths ? cave.pathing.targetZ : target.z, dt, !!paths);
      let remaining = RUSH_SPEED * dt * (inBananas(cave) ? 0.5 : 1), moved = 0;
      while (remaining > 1e-8 && Math.hypot(target.x - p.x, target.z - p.z) >= 0.12) {
        if (paths && (!cave.avoidance.navigation.mode || cave.pathing.tx !== target.x || cave.pathing.tz !== target.z)) paths.target(cave, target.x, target.z);
        const step = walkToward(cave, paths ? cave.pathing.targetX : target.x, paths ? cave.pathing.targetZ : target.z, remaining);
        if (!step) break;
        moved += step; remaining -= step;
      }
      work.gait += moved * 5;
      if (moved) walkPose(cave, work.gait); else standPose(cave);
      p.y = groundY(cave);
      return Math.hypot(target.x - p.x, target.z - p.z) < 0.12;
    };
    return { recoverWalker, walkToward, walkWorkTo };
  };
  BL.npcWalker = { create, createState, NAV_SIZE };
})();
