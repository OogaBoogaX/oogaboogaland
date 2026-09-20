// Fixed walking routes between the meadow and the headquarters beds.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const RADIUS = 0.3, HEIGHT = 2, STEP = 0.6, SAMPLE = 0.125;
  // The validated waypoint graph depends only on the island's architecture; later visits reuse it and map
  // fresh bed objects onto its nodes.
  const graphs = new WeakMap();
  const create = ({ island, beds, walkable = null, surfaceRoute = null }) => {
    const cached = graphs.get(island), reuse = !!cached && cached.bedIds.length === beds.length;
    const H = island.headquarters, points = reuse ? cached.points : [], edges = reuse ? cached.edges : [], bedNodes = new Map(), surface = [];
    const floorAt = (x, y, z) => island.supportAt(x, z, y, STEP, -120, RADIUS);
    const clear = (x, y, z, lift = STEP) => island.clearAt(x, y + lift, z, RADIUS, HEIGHT - lift) && island.ceilingAt(x, y, z, RADIUS) >= y + HEIGHT - 1e-7;
    const segment = (a, b, surfaceOnly = false, lift = STEP) => {
      const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (lift < STEP ? 0.025 : SAMPLE)));
      let x = a.x, y = a.y, z = a.z;
      if (!clear(x, y, z, lift)) return false;
      for (let i = 1; i <= count; i++) {
        const t = i / count, nx = a.x + (b.x - a.x) * t, nz = a.z + (b.z - a.z) * t, guide = a.y + (b.y - a.y) * t;
        const ny = floorAt(nx, surfaceOnly ? island.surfaceAt(nx, nz) : guide, nz);
        // A route follows support, never a drop into another layer or the shaft.
        if ((surfaceOnly ? ny < -1e-7 : Math.abs(ny - guide) > STEP + 1e-6) || Math.abs(ny - y) > STEP + 1e-6 || !clear(nx, ny, nz, lift)) return false;
        if (!island.voxelSegmentClearAt(x, y + lift, z, nx, ny + lift, nz, RADIUS, HEIGHT - lift)) return false;
        if (walkable && !walkable(x, z, nx, nz, y, HEIGHT)) return false;
        x = nx; y = ny; z = nz;
      }
      return Math.abs(y - b.y) < 0.025;
    };
    const node = (x, y, z) => {
      const floor = floorAt(x, y, z);
      if (Math.abs(floor - y) > STEP + 1e-6 || !clear(x, floor, z)) throw new Error(`Headquarters sleep waypoint has no clear floor: ${x},${y},${z} (support ${floor})`);
      const id = points.length;
      points.push({ x, y: floor, z }); edges.push([]);
      return id;
    };
    const link = (a, b) => {
      if (!segment(points[a], points[b]) || !segment(points[b], points[a])) return false;
      const p = points[a], q = points[b], cost = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      edges[a].push({ to: b, cost }); edges[b].push({ to: a, cost });
      return true;
    };
    const requireLink = (a, b) => { if (!link(a, b)) throw new Error(`Headquarters sleep route crosses rock: ${a} to ${b}`); };
    const ring = (radius, y, count) => {
      const ids = [];
      for (let i = 0; i < count; i++) { const angle = i * Math.PI * 2 / count; ids.push(node(Math.sin(angle) * radius, y, -Math.cos(angle) * radius)); }
      for (let i = 0; i < count; i++) requireLink(ids[i], ids[(i + 1) % count]);
      return ids;
    };
    const joinRing = (id, ids) => {
      const p = points[id]; let closest = 0, distance = Infinity;
      for (let i = 0; i < ids.length; i++) { const q = points[ids[i]], d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2; if (d < distance) { distance = d; closest = i; } }
      requireLink(id, ids[closest]);
    };
    const chain = (samples) => {
      let first = -1, previous = -1;
      for (const p of samples) {
        const id = node(p.x, p.y, p.z);
        if (previous >= 0) requireLink(previous, id); else first = id;
        previous = id;
      }
      return { first, last: previous };
    };
    if (reuse) {
      beds.forEach((bed, i) => bedNodes.set(bed, cached.bedIds[i]));
    } else {
      surface.push(...ring(17, 0, 72));
      const upper = ring(11, H.floor, 48), lower = ring(7, H.basement.floor, 48);
      for (const ramp of H.ramps) {
        const m = island.mouths.find((mouth) => mouth.id === ramp.id), apron = node(m.apron.x, 0, m.apron.z), route = chain(ramp.samples);
        joinRing(apron, surface); requireLink(apron, route.first); joinRing(route.last, upper);
      }
      for (const ramp of H.basement.ramps) {
        const route = chain(ramp.samples);
        joinRing(route.first, upper); joinRing(route.last, lower);
      }
      for (const bed of beds) {
        const room = bed.room, approach = node(room.approach.x, room.floor, room.approach.z), entrance = node(room.entrance.x, room.floor, room.entrance.z), center = node(room.x, room.floor, room.z), at = bed.walkAt;
        const end = node(at.x, room.floor, at.z);
        joinRing(approach, room.basement ? lower : upper);
        requireLink(approach, entrance); requireLink(entrance, center); requireLink(center, end);
        bedNodes.set(bed, end);
      }
      graphs.set(island, { points, edges, bedIds: beds.map((bed) => bedNodes.get(bed)) });
    }
    // Search storage belongs to this visit and is reused for each state change.
    const size = points.length, distance = new Float64Array(size), previous = new Int32Array(size), visited = new Uint8Array(size);
    const candidates = new Int32Array(16), candidateDistance = new Float64Array(16);
    const rounded = (route) => {
      const result = [route[0]];
      for (let i = 1; i < route.length - 1; i++) {
        const before = route[i - 1], corner = route[i], after = route[i + 1];
        const ax = corner.x - before.x, az = corner.z - before.z, bx = after.x - corner.x, bz = after.z - corner.z;
        const incoming = Math.hypot(ax, az), outgoing = Math.hypot(bx, bz);
        if (incoming < 1e-6 || outgoing < 1e-6 || (ax * bx + az * bz) / (incoming * outgoing) > 0.999) { result.push(corner); continue; }
        let curve = null, reach = Math.min(0.9, incoming * 0.4, outgoing * 0.4);
        // Round turns only as far as the real floor, walls and headroom allow; build and validate once per chosen
        // route, never per frame.
        for (let attempt = 0; attempt < 4 && !curve; attempt++, reach *= 0.5) {
          const a = { x: corner.x - ax * reach / incoming, y: corner.y + (before.y - corner.y) * reach / incoming, z: corner.z - az * reach / incoming };
          const b = { x: corner.x + bx * reach / outgoing, y: corner.y + (after.y - corner.y) * reach / outgoing, z: corner.z + bz * reach / outgoing };
          a.y = floorAt(a.x, a.y, a.z); b.y = floorAt(b.x, b.y, b.z);
          const samples = [a], steps = Math.max(4, Math.ceil(reach * 2 / SAMPLE));
          let valid = segment(result[result.length - 1], a, false, 0.3);
          for (let n = 1; valid && n <= steps; n++) {
            const t = n / steps, u = 1 - t;
            const x = u * u * a.x + 2 * u * t * corner.x + t * t * b.x, z = u * u * a.z + 2 * u * t * corner.z + t * t * b.z;
            const guide = u * u * a.y + 2 * u * t * corner.y + t * t * b.y, y = floorAt(x, guide, z), p = { x, y, z };
            valid = Math.abs(y - guide) <= STEP + 1e-6 && segment(samples[samples.length - 1], p, false, 0.3);
            samples.push(p);
          }
          if (valid && segment(b, after, false, 0.3)) curve = samples;
        }
        if (curve) result.push(...curve); else result.push(corner);
      }
      result.push(route[route.length - 1]);
      return result;
    };
    const attach = (from, onlySurface, out) => {
      candidates.fill(-1); candidateDistance.fill(Infinity);
      const count = size;
      for (let j = 0; j < count; j++) {
        const id = j, p = points[id];
        if (onlySurface && p.y < -1e-7) continue;
        if (!onlySurface && Math.abs(p.y - from.y) > STEP + 1e-6) continue;
        const d = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
        if (d >= candidateDistance[15]) continue;
        let k = 15;
        while (k > 0 && d < candidateDistance[k - 1]) { candidates[k] = candidates[k - 1]; candidateDistance[k] = candidateDistance[k - 1]; k--; }
        candidates[k] = id; candidateDistance[k] = d;
      }
      for (let i = 0; i < candidates.length; i++) if (candidates[i] >= 0 && segment(from, points[candidates[i]], onlySurface) && segment(points[candidates[i]], from, onlySurface)) out.push({ id: candidates[i], cost: candidateDistance[i] });
    };
    const route = (x, y, z, bed, toBed, homeX = 0, homeZ = -16) => {
      const from = { x, y, z }, starts = [], ends = [];
      attach(from, y >= -0.1, starts);
      let target = null;
      if (toBed) {
        const id = bedNodes.get(bed);
        if (id === undefined) return null;
        ends.push({ id, cost: 0 });
      } else {
        target = { x: homeX, y: island.surfaceAt(homeX, homeZ), z: homeZ };
        attach(target, true, ends);
      }
      if (!starts.length || !ends.length) return null;
      distance.fill(Infinity); previous.fill(-1); visited.fill(0);
      for (const start of starts) distance[start.id] = start.cost;
      for (let count = 0; count < size; count++) {
        let current = -1, best = Infinity;
        for (let i = 0; i < size; i++) if (!visited[i] && distance[i] < best) { best = distance[i]; current = i; }
        if (current < 0) break;
        visited[current] = 1;
        for (const edge of edges[current]) {
          const next = best + edge.cost;
          if (next < distance[edge.to]) { distance[edge.to] = next; previous[edge.to] = current; }
        }
      }
      let end = -1, best = Infinity;
      for (const candidate of ends) if (distance[candidate.id] + candidate.cost < best) { best = distance[candidate.id] + candidate.cost; end = candidate.id; }
      if (end < 0) return null;
      const result = [];
      for (let i = end; i >= 0; i = previous[i]) result.push(points[i]);
      result.push(from); result.reverse();
      if (target) result.push(target);
      const simplified = [];
      for (const p of result) {
        simplified.push(p);
        while (simplified.length >= 3) {
          const n = simplified.length, a = simplified[n - 3], b = simplified[n - 2];
          // Preserve the authored slope centerline: only shorten circulation and room approaches on the same flat
          // floor, away from ramp bends.
          if (a.y >= -0.05 || Math.abs(a.y - b.y) > 1e-7 || Math.abs(a.y - p.y) > 1e-7 || !segment(a, p, false, 0.3)) break;
          simplified.splice(n - 2, 1);
        }
      }
      const smooth = rounded(simplified);
      if (surfaceRoute) {
        let join = -1;
        if (toBed) {
          for (let i = 0; i < smooth.length && smooth[i].y >= -1e-7; i++) join = i;
        } else {
          for (let i = smooth.length - 1; i >= 0 && smooth[i].y >= -1e-7; i--) join = i;
        }
        if (join >= 0) {
          const above = toBed ? surfaceRoute(smooth[0], smooth[join]) : surfaceRoute(smooth[join], smooth[smooth.length - 1]);
          let valid = true;
          for (let i = 1; valid && i < above.length; i++) valid = segment(above[i - 1], above[i], true, 0.3);
          if (valid) return toBed ? above.concat(smooth.slice(join + 1)) : smooth.slice(0, join).concat(above);
        }
      }
      return smooth;
    };
    return { route, clearSegment: segment, points, radius: RADIUS, height: HEIGHT, nodeCount: size, edgeCount: edges.reduce((sum, list) => sum + list.length, 0) / 2 };
  };
  BL.headquartersSleep = { create };
})();
