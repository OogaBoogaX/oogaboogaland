// Surface walkers keep just right of the terrain's curve midpoints. Collision avoidance
// can leave a trail, and off-path destinations retain their final approach.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const CAPACITY = 4096, SPACING = 0.25, LOOK_AHEAD = 0.45, LANE_OFFSET = 0.35;
  const create = ({ island, walkable, surfaceAt = island.surfaceAt, pointAllowed = null }) => {
    const path = island.path, size = CAPACITY;
    const xs = new Float64Array(size), zs = new Float64Array(size), groups = new Int16Array(size), heads = new Int32Array(size);
    const edges = new Int32Array(size * 8), next = new Int32Array(size * 8), costs = new Float64Array(size * 8);
    const parents = new Int32Array(size), distances = new Float64Array(size), heap = new Int32Array(size), heapIndex = new Int32Array(size);
    let version = -1, count = 0, edgeCount = 0, heapCount = 0;
    const centerX = new Float64Array(size), centerZ = new Float64Array(size);
    const xAt = (i) => xs[i], zAt = (i) => zs[i];
    const createState = () => ({ tx: NaN, tz: NaN, version: -1, count: 0, index: 0, plans: 0,
      targetX: 0, targetZ: 0, route: new Int32Array(size), laneX: new Float64Array(size), laneZ: new Float64Array(size) });
    const node = (x, z, group) => {
      if (count === size) throw new Error("NPC path node capacity exceeded");
      xs[count] = x; zs[count] = z; groups[count] = group; heads[count] = -1;
      return count++;
    };
    const connect = (a, b) => {
      if (edgeCount + 2 > edges.length) throw new Error("NPC path edge capacity exceeded");
      const length = Math.hypot(xs[a] - xs[b], zs[a] - zs[b]);
      edges[edgeCount] = b; costs[edgeCount] = length; next[edgeCount] = heads[a]; heads[a] = edgeCount++;
      edges[edgeCount] = a; costs[edgeCount] = length; next[edgeCount] = heads[b]; heads[b] = edgeCount++;
    };
    const rebuild = () => {
      version = path.version; count = edgeCount = 0;
      // Through traffic stays in the outer half in either direction;
      // the usual right offset separates its two directions within that lane.
      const radius = path.debug.ringTrafficRadius ?? path.debug.ringCenterRadius;
      if (path.debug.active) {
        const steps = Math.ceil(Math.PI * 2 * radius / SPACING);
        let first = -1, previous = -1;
        for (let n = 0; n < steps; n++) {
          const angle = n / steps * Math.PI * 2, x = Math.sin(angle) * radius, z = -Math.cos(angle) * radius;
          if (pointAllowed && !pointAllowed(x, z)) { previous = -1; continue; }
          const i = node(x, z, 0);
          if (!n) first = i;
          if (previous >= 0) connect(previous, i);
          previous = i;
        }
        if (first >= 0 && previous >= 0 && first !== previous) connect(first, previous);
      }
      for (let line = 0; line < path.centerlines.length; line++) {
        const points = path.centerlines[line];
        let previous = -1;
        for (let n = 1; n < points.length; n++) {
          const a = points[n - 1], b = points[n], dx = b.x - a.x, dz = b.z - a.z;
          const steps = Math.ceil(Math.hypot(dx, dz) / SPACING);
          for (let k = n === 1 ? 0 : 1; k <= steps; k++) {
            const t = k / steps;
            let x = a.x + dx * t, z = a.z + dz * t;
            // Decorative trails still reach sealed mouths. They cannot be
            // intermediate destinations just because they remain painted.
            if (Math.hypot(x, z) < radius || pointAllowed && !pointAllowed(x, z)) { previous = -1; continue; }
            // A rasterized bend can put its mathematical center just outside
            // a road tile. Snap that sample onto the nearby painted road;
            // dropping it would disconnect the trail and send traffic across grass.
            if (!island.isPath(x, z)) {
              const fromX = x, fromZ = z, y = island.surfaceAt(x, z);
              let best = Infinity;
              for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
                const px = fromX + ox * SPACING / 2, pz = fromZ + oz * SPACING / 2;
                const distance = (px - fromX) ** 2 + (pz - fromZ) ** 2;
                if (distance >= best || !island.isPath(px, pz) || Math.hypot(px, pz) < radius
                  || pointAllowed && !pointAllowed(px, pz) || Math.abs(island.surfaceAt(px, pz) - y) > 0.1) continue;
                x = px; z = pz; best = distance;
              }
              if (!Number.isFinite(best)) { previous = -1; continue; }
            }
            const i = node(x, z, line + 1);
            if (previous >= 0) connect(previous, i);
            previous = i;
          }
        }
      }
      // Join curve ends at the ring and at the frontage/pass junctions.
      // Do not connect parallel curves merely because their path masks overlap.
      for (let i = 0; i < count; i++) {
        if (!groups[i] || heads[i] < 0 || next[heads[i]] >= 0) continue;
        let closest = -1, best = 0.75 ** 2;
        for (let j = 0; j < count; j++) {
          if (groups[j] === groups[i]) continue;
          const distance = (xs[i] - xs[j]) ** 2 + (zs[i] - zs[j]) ** 2;
          if (distance < best) { closest = j; best = distance; }
        }
        if (closest >= 0) connect(i, closest);
      }
    };
    const nearest = (x, z) => {
      let closest = -1, best = Infinity;
      for (let i = 0; i < count; i++) {
        if (pointAllowed && !pointAllowed(xs[i], zs[i])) continue;
        const distance = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
        if (distance < best) { closest = i; best = distance; }
      }
      return closest;
    };
    const enqueue = (i) => {
      let at = heapIndex[i];
      if (at < 0) at = heapCount++;
      while (at) {
        const parent = (at - 1) >> 1, above = heap[parent];
        if (distances[above] <= distances[i]) break;
        heap[at] = above; heapIndex[above] = at; at = parent;
      }
      heap[at] = i; heapIndex[i] = at;
    };
    const dequeue = () => {
      const result = heap[0], last = heap[--heapCount]; heapIndex[result] = -2;
      if (heapCount) {
        let at = 0;
        while (at * 2 + 1 < heapCount) {
          let child = at * 2 + 1;
          if (child + 1 < heapCount && distances[heap[child + 1]] < distances[heap[child]]) child++;
          if (distances[last] <= distances[heap[child]]) break;
          heap[at] = heap[child]; heapIndex[heap[at]] = at; at = child;
        }
        heap[at] = last; heapIndex[last] = at;
      }
      return result;
    };
    const plan = (state, x, z, tx, tz) => {
      if (version !== path.version) rebuild();
      state.tx = tx; state.tz = tz; state.version = version; state.count = state.index = 0; state.plans++;
      const start = nearest(x, z), end = nearest(tx, tz);
      if (start < 0 || end < 0 || start === end) return;
      parents.fill(-1, 0, count); distances.fill(Infinity, 0, count); heapIndex.fill(-1, 0, count); heapCount = 0;
      distances[end] = 0; parents[end] = end; enqueue(end);
      while (heapCount) {
        const i = dequeue();
        if (i === start) break;
        for (let e = heads[i]; e >= 0; e = next[e]) {
          const j = edges[e], distance = distances[i] + costs[e];
          if (heapIndex[j] === -2 || distance >= distances[j]) continue;
          distances[j] = distance; parents[j] = i; enqueue(j);
        }
      }
      if (parents[start] < 0) return;
      // Keep a connected trail even when a bend makes it longer than the
      // direct line. Work traffic should not shortcut across the lawn.
      for (let i = start; ; i = parents[i]) {
        state.route[state.count++] = i;
        if (i === end) break;
      }
    };
    const LANE_A = { x: 0, z: 0 }, LANE_B = { x: 0, z: 0 };
    const JOIN_A = { x: 0, z: 0, distance: 0 }, JOIN_B = { x: 0, z: 0, distance: 0 };
    const alongRoute = (state, at, direction, distance, out) => {
      let previous = state.route[at], remaining = distance;
      out.x = xs[previous]; out.z = zs[previous];
      for (let n = at + direction; n >= 0 && n < state.count && remaining > 0; n += direction) {
        const i = state.route[n], dx = xs[i] - xs[previous], dz = zs[i] - zs[previous], length = Math.hypot(dx, dz);
        const t = length ? Math.min(1, remaining / length) : 0;
        out.x += dx * t; out.z += dz * t; remaining -= Math.min(remaining, length); previous = i;
      }
      out.distance = distance - remaining;
    };
    // Cache the lane at departure. Rounding only sharp graph joins keeps a
    // right-offset lane from folding back over itself where a spoke meets a ring.
    const prepareLane = (cave) => {
      const state = cave.pathing;
      for (let n = 0; n < state.count; n++) { const i = state.route[n]; centerX[n] = xs[i]; centerZ[n] = zs[i]; }
      for (let n = 1; n < state.count - 1; n++) {
        const i = state.route[n], before = state.route[n - 1], after = state.route[n + 1];
        if (groups[before] === groups[i] && groups[after] === groups[i]) continue;
        const ax = xs[i] - xs[before], az = zs[i] - zs[before], bx = xs[after] - xs[i], bz = zs[after] - zs[i];
        if ((ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)) > 0.8) continue;
        alongRoute(state, n, -1, 0.7, JOIN_A); alongRoute(state, n, 1, 0.7, JOIN_B);
        const radius = Math.min(JOIN_A.distance, JOIN_B.distance);
        if (radius < 0.25) continue;
        alongRoute(state, n, -1, radius, JOIN_A); alongRoute(state, n, 1, radius, JOIN_B);
        for (let direction = -1; direction <= 1; direction += 2) {
          let distance = 0, previous = i;
          for (let at = n; at >= 0 && at < state.count; at += direction) {
            const current = state.route[at];
            distance += Math.hypot(xs[current] - xs[previous], zs[current] - zs[previous]); previous = current;
            if (distance > radius) break;
            const t = (1 + direction * distance / radius) * 0.5, u = 1 - t;
            const x = u * u * JOIN_A.x + 2 * u * t * xs[i] + t * t * JOIN_B.x;
            const z = u * u * JOIN_A.z + 2 * u * t * zs[i] + t * t * JOIN_B.z;
            if ((!pointAllowed || pointAllowed(x, z)) && island.isPath(x, z) && Math.abs(island.surfaceAt(x, z) - island.surfaceAt(xs[current], zs[current])) < 0.1) {
              centerX[at] = x; centerZ[at] = z;
            }
          }
        }
      }
      const last = state.route[state.count - 1], endX = xs[last], endZ = zs[last];
      for (let at = 0; at < state.count; at++) {
        const before = Math.max(0, at - 1), after = Math.min(state.count - 1, at + 1);
        const ax = centerX[at] - centerX[before], az = centerZ[at] - centerZ[before], aLength = Math.hypot(ax, az);
        const bx = centerX[after] - centerX[at], bz = centerZ[after] - centerZ[at], bLength = Math.hypot(bx, bz);
        const fx = (aLength ? ax / aLength : 0) + (bLength ? bx / bLength : 0);
        const fz = (aLength ? az / aLength : 0) + (bLength ? bz / bLength : 0), length = Math.hypot(fx, fz);
        const endDistance = Math.hypot(endX - centerX[at], endZ - centerZ[at]);
        const offset = LANE_OFFSET * Math.min(1, Math.hypot(state.tx - centerX[at], state.tz - centerZ[at]), endDistance);
        let x = centerX[at], z = centerZ[at];
        if (state.count - at < 8 && endDistance < LOOK_AHEAD * 2 && Math.hypot(state.tx - endX, state.tz - endZ) < SPACING) {
          const t = 1 - endDistance / (LOOK_AHEAD * 2), k = t * t * (3 - 2 * t);
          x += (state.tx - endX) * k; z += (state.tz - endZ) * k;
        }
        if (pointAllowed && !pointAllowed(x, z)) { x = centerX[at]; z = centerZ[at]; }
        // With -Z forward, right is +X, matching the camera and walking controls.
        const laneX = x - (length ? fz / length * offset : 0), laneZ = z + (length ? fx / length * offset : 0);
        if ((!pointAllowed || pointAllowed(laneX, laneZ)) && island.isPath(laneX, laneZ) && Math.abs(island.surfaceAt(laneX, laneZ) - island.surfaceAt(x, z)) < 0.1) { x = laneX; z = laneZ; }
        state.laneX[at] = x; state.laneZ[at] = z;
      }
    };
    const lanePoint = (state, at, out) => { out.x = state.laneX[at]; out.z = state.laneZ[at]; };
    const target = (cave, tx, tz) => {
      const state = cave.pathing, p = cave.root.position, feet = p.y - cave.baseY;
      state.targetX = tx; state.targetZ = tz;
      // A foot can overlap the next tread before its center reaches it.
      // Keep the same route while standing on that supported stair edge.
      if (feet < -0.05 || Math.abs(feet - surfaceAt(p.x, p.z, feet)) > 0.1 || cave.bedTravel.mode) { state.tx = NaN; return; }
      if (state.tx !== tx || state.tz !== tz || state.version !== path.version) {
        plan(state, p.x, p.z, tx, tz);
        if (state.count) prepareLane(cave);
      }
      if (state.index >= state.count) return;
      const last = state.route[state.count - 1];
      let index = state.index, fraction = 0, best = Infinity;
      for (let n = state.index; n < Math.min(state.count - 1, state.index + 32); n++) {
        lanePoint(state, n, LANE_A); lanePoint(state, n + 1, LANE_B);
        const dx = LANE_B.x - LANE_A.x, dz = LANE_B.z - LANE_A.z, length2 = dx * dx + dz * dz;
        const t = length2 ? Math.max(0, Math.min(1, ((p.x - LANE_A.x) * dx + (p.z - LANE_A.z) * dz) / length2)) : 1;
        const distance = (LANE_A.x + dx * t - p.x) ** 2 + (LANE_A.z + dz * t - p.z) ** 2;
        if (distance < best) { best = distance; index = n; fraction = t; }
      }
      state.index = index;
      if (state.count - index <= 2 && Math.hypot(xs[last] - p.x, zs[last] - p.z) < 0.2) { state.index = state.count; return; }
      lanePoint(state, index, LANE_A);
      let x = LANE_A.x, z = LANE_A.z, remaining = best < 0.75 ** 2 ? LOOK_AHEAD : 0;
      for (let n = index; n < state.count - 1; n++) {
        lanePoint(state, n, LANE_A); lanePoint(state, n + 1, LANE_B);
        const dx = LANE_B.x - LANE_A.x, dz = LANE_B.z - LANE_A.z, length = Math.hypot(dx, dz);
        const t = n === index ? fraction : 0;
        const available = length * (1 - t), aim = length ? t + Math.min(remaining, available) / length : 1;
        x = LANE_A.x + dx * aim; z = LANE_A.z + dz * aim;
        if (remaining <= available) break;
        remaining -= available;
      }
      const closed = pointAllowed && !pointAllowed(x, z);
      if (closed || walkable && !walkable(x, z, x, z, island.surfaceAt(x, z), cave.bodyHeight, cave)) {
        let found = false;
        for (let n = index + 1; n < Math.min(state.count, index + 32); n++) {
          lanePoint(state, n, LANE_B);
          if (pointAllowed && !pointAllowed(LANE_B.x, LANE_B.z) || walkable && !walkable(LANE_B.x, LANE_B.z, LANE_B.x, LANE_B.z, island.surfaceAt(LANE_B.x, LANE_B.z), cave.bodyHeight, cave)) continue;
          state.index = n; x = LANE_B.x; z = LANE_B.z; found = true; break;
        }
        // A newly closed frontage must not hold a walker on a dead-end
        // waypoint forever. Ordinary local avoidance handles the safe goal.
        if (closed && !found) { state.index = state.count; return; }
      }
      // Passing can leave a walker beside the lane. A clear waypoint beyond
      // an obstacle is not a clear shortcut to it: rejoin the nearby segment
      // before advancing instead of starting repeated backwards detours.
      if (walkable && best > 0.02 ** 2 && best < 0.75 ** 2
        && !walkable(p.x, p.z, x, z, feet, cave.bodyHeight, cave)) {
        lanePoint(state, index, LANE_A); lanePoint(state, index + 1, LANE_B);
        const joinX = LANE_A.x + (LANE_B.x - LANE_A.x) * fraction;
        const joinZ = LANE_A.z + (LANE_B.z - LANE_A.z) * fraction;
        if ((!pointAllowed || pointAllowed(joinX, joinZ))
          && walkable(p.x, p.z, joinX, joinZ, feet, cave.bodyHeight, cave)) { state.index = index; x = joinX; z = joinZ; }
      }
      state.targetX = x; state.targetZ = z;
    };
    // Authored routes use centerline indices only; lane coordinates belong to live walkers.
    const routeState = { plans: 0, route: new Int32Array(size) };
    // Bed journeys allocate their authored route only at departure.
    // They share the same surface centerlines before and after the underground portion.
    const route = (from, to) => {
      plan(routeState, from.x, from.z, to.x, to.z);
      const result = [from];
      for (let n = 0; n < routeState.count; n++) {
        const i = routeState.route[n];
        result.push({ x: xs[i], y: island.surfaceAt(xs[i], zs[i]), z: zs[i] });
      }
      result.push(to);
      return result;
    };
    return { createState, target, route, xAt, zAt, capacity: size, get nodes() { return count; }, buffers: xs.byteLength + zs.byteLength + centerX.byteLength + centerZ.byteLength + groups.byteLength + heads.byteLength + edges.byteLength + next.byteLength + costs.byteLength + parents.byteLength + distances.byteLength + heap.byteLength + heapIndex.byteLength + routeState.route.byteLength };
  };
  // Passive Hub work trips use only the authored mainland spokes and the pile
  // ring: no graph, obstacle search, bed route or satellite crossing. Adapted
  // from the virtual host's routine paths (697964fe). It shares `create`'s
  // walker state; its own version stamp keeps either planner from reusing the
  // other's lane. Null when the island's authored routes are unsupported.
  const fixed = (island) => {
    const path = island.path;
    const lines = path.centerlines.filter(points => points.length > 1
      && Math.hypot(points[0].x, points[0].z) < island.meadowRadius
      && Math.hypot(points[points.length - 1].x, points[points.length - 1].z) <= island.meadowRadius + 0.01);
    if (!lines.length || lines.length > 32 || lines.some(line => line.length > 256)) return null;
    const stamp = () => -2 - path.version;
    const nearest = (x, z, radius) => {
      let result = null, distance = Infinity;
      for (const line of lines) for (let i = 0; i < line.length; i++) {
        const p = line[i];
        if (Math.hypot(p.x, p.z) < radius) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < distance) { distance = d; result = { line, i }; }
      }
      return result;
    };
    const append = (s, x, z) => {
      if (s.count && Math.hypot(s.laneX[s.count - 1] - x, s.laneZ[s.count - 1] - z) < 0.01) return;
      if (s.count === s.laneX.length) throw new Error("authored mainland route capacity");
      s.laneX[s.count] = x; s.laneZ[s.count++] = z;
    };
    // Whether (x, z) lies past sample `q` toward its neighbour `n` along the spoke.
    const past = (q, n, x, z) => (x - q.x) * (n.x - q.x) + (z - q.z) * (n.z - q.z) > 0;
    // Whether the straight line from (ax, az) to (bx, bz) comes no nearer the pile's middle than its nearer end, less
    // `SLACK` (under a body's breadth, so a line grazing the ring's own curve still counts as going straight on).
    const SLACK = 0.25, JOIN = 0.75;
    // Where the spoke runs from sample `q`, outside the ring, to `r`, inside it, across the ring itself: the ring meets
    // the spoke there, not at `q`'s own bearing (an oblique spoke otherwise gets a short spur and a kink).
    const meet = (q, r, radius) => {
      const dx = r.x - q.x, dz = r.z - q.z, a = dx * dx + dz * dz, b = 2 * (q.x * dx + q.z * dz), c = q.x * q.x + q.z * q.z - radius * radius;
      const t = a > 0 ? Math.max(0, Math.min(1, (-b - Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a))) : 0;
      return { x: q.x + dx * t, z: q.z + dz * t };
    };
    const wide = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
      const t = length > 0 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / length)) : 0;
      return Math.hypot(ax + dx * t, az + dz * t) >= Math.min(Math.hypot(ax, az), Math.hypot(bx, bz)) - SLACK;
    };
    const prepare = (s, p, tx, tz) => {
      s.tx = tx; s.tz = tz; s.version = stamp(); s.count = s.index = 0; s.plans++;
      let ringFrom = 0, ringTo = 0;
      const radius = path.debug.ringTrafficRadius ?? path.debug.ringCenterRadius;
      const from = Math.hypot(p.x, p.z) > radius + 0.5 ? nearest(p.x, p.z, radius) : null;
      const to = Math.hypot(tx, tz) > radius + 0.5 ? nearest(tx, tz, radius) : null;
      // The nearest sample to either end of a leg can lie behind the walker or beyond its goal: a walker between two
      // samples (a leg begun from a route point, or replanned mid-spoke when its slot or the ring changes) would step
      // back to it and turn round, and a goal between two samples would be overshot and walked back to. Start at the
      // first sample ahead of the walker and stop at the last one short of the goal.
      if (from && to && from.line === to.line) {
        // Same-spoke travel follows its existing samples directly in either direction.
        const line = from.line, step = from.i <= to.i ? 1 : -1;
        let i = from.i, end = to.i;
        // Each end is trimmed against the original bounds; two adjacent samples can both drop, leaving none between.
        if (from.i !== to.i) {
          if (past(line[from.i], line[from.i + step], p.x, p.z)) i += step;
          if (past(line[to.i], line[to.i - step], tx, tz)) end -= step;
        }
        // One shared sample is on the way only when it lies between the two ends; crossed trims leave a direct leg.
        if (from.i === to.i ? (p.x - line[i].x) * (tx - line[i].x) + (p.z - line[i].z) * (tz - line[i].z) <= 0
          : (end - i) * step >= 0) {
          for (; ; i += step) {
            append(s, line[i].x, line[i].z);
            if (i === end) break;
          }
        }
      } else {
        let x = p.x, z = p.z;
        if (from) {
          let i = from.i;
          if (i > 0 && past(from.line[i], from.line[i - 1], p.x, p.z)) i--;
          for (; i >= 0; i--) {
            const q = from.line[i];
            if (Math.hypot(q.x, q.z) < radius) break;
            append(s, q.x, q.z); x = q.x; z = q.z;
          }
          if (i >= 0 && i + 1 < from.line.length && Math.hypot(x, z) >= radius) { const m = meet(from.line[i + 1], from.line[i], radius); x = m.x; z = m.z; }
        }
        let first = to ? to.i : 0;
        while (to && first > 0 && Math.hypot(to.line[first - 1].x, to.line[first - 1].z) >= radius) first--;
        // Below `first` the spoke runs inside the ring, so a goal short of `first` keeps no sample and the ring ends
        // at the goal's own bearing.
        let last = to ? to.i : 0;
        if (to && last > 0 && past(to.line[last], to.line[last - 1], tx, tz)) last--;
        const end = to && last >= first ? first > 0 ? meet(to.line[first], to.line[first - 1], radius) : to.line[first] : { x: tx, z: tz };
        // Around the pile on the real ring, never across it.
        const start = Math.atan2(x, z), finish = Math.atan2(end.x, end.z);
        const angle = Math.atan2(Math.sin(finish - start), Math.cos(finish - start));
        const steps = Math.max(1, Math.ceil(Math.abs(angle) * radius / 0.5));
        ringFrom = s.count;
        for (let i = 0; i <= steps; i++) {
          const a = start + angle * i / steps;
          append(s, Math.sin(a) * radius, Math.cos(a) * radius);
        }
        ringTo = s.count;
        if (to) for (let i = first; i <= last; i++) append(s, to.line[i].x, to.line[i].z);
      }
      append(s, tx, tz);
      // The ring is for going round the pile. Where a leg meets it beside a spoke's end (a loading slot or a walker
      // near the junction), stepping out onto the ring at the leg's own bearing, along it and off again turned the
      // walker away and back. The arc is left out whole when the straight line from the point before it (or the
      // walker) to the point after it comes no nearer the pile than its own ends; a turn round the pile keeps all of it,
      // so its curve stays even rather than bent at a shortcut's end.
      if (ringTo > ringFrom && ringTo < s.count) {
        const kx = ringFrom ? s.laneX[ringFrom - 1] : p.x, kz = ringFrom ? s.laneZ[ringFrom - 1] : p.z;
        if (wide(kx, kz, s.laneX[ringTo], s.laneZ[ringTo])) {
          const drop = ringTo - ringFrom;
          for (let i = ringTo; i < s.count; i++) { s.laneX[i - drop] = s.laneX[i]; s.laneZ[i - drop] = s.laneZ[i]; }
          s.count -= drop;
        } else {
          // Kept, the arc still joins each spoke where the drawn spoke bends to meet the ring: its last samples there and
          // the arc's first or last points lie a few centimetres apart at sharp angles, which a walker overshoots and
          // turns back to. Within `JOIN` of the join the corner is taken straight, by the same pile rule.
          const jx = s.laneX[ringFrom], jz = s.laneZ[ringFrom], ex = s.laneX[ringTo - 1], ez = s.laneZ[ringTo - 1];
          let kx2 = p.x, kz2 = p.z, kept = 0;
          for (let i = 0; i < s.count; i++) {
            const x = s.laneX[i], z = s.laneZ[i];
            const near = Math.hypot(x - jx, z - jz) < JOIN || Math.hypot(x - ex, z - ez) < JOIN;
            if (near && i + 1 < s.count && wide(kx2, kz2, s.laneX[i + 1], s.laneZ[i + 1])) continue;
            s.laneX[kept] = x; s.laneZ[kept++] = z; kx2 = x; kz2 = z;
          }
          s.count = kept;
        }
      }
    };
    const target = (cave, tx, tz) => {
      const s = cave.pathing, p = cave.root.position;
      if (!Number.isFinite(tx) || !Number.isFinite(tz)) { s.tx = NaN; s.targetX = p.x; s.targetZ = p.z; return; }
      if (s.tx !== tx || s.tz !== tz || s.version !== stamp()) prepare(s, p, tx, tz);
      while (s.index < s.count && Math.hypot(s.laneX[s.index] - p.x, s.laneZ[s.index] - p.z) < 0.08) s.index++;
      s.targetX = s.index < s.count ? s.laneX[s.index] : tx;
      s.targetZ = s.index < s.count ? s.laneZ[s.index] : tz;
    };
    return { target, lines: lines.length };
  };
  BL.npcPaths = { create, fixed };
})();
