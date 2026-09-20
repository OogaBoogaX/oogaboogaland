(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  const EPS = 1e-7, geometries = new WeakMap();
  // Props use their render mesh or an explicit collision shell; a shared local-space tree preserves openings in
  // arches, branches and aircraft without voxelizing each placed copy or rebuilding triangles when a prop moves.
  const geometryOf = (geometry) => {
    geometry = geometry.collisionGeometry || geometry;
    let cached = geometries.get(geometry);
    if (cached) return cached;
    const vertices = geometry.verts, triangles = [], bounds = [], order = [];
    for (const face of geometry.faces) for (let i = 1; i + 1 < face.i.length; i++) {
      const a = face.i[0] * 3, b = face.i[i] * 3, c = face.i[i + 1] * 3;
      const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
      const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-12) continue;
      order.push(order.length);
      triangles.push(a, b, c);
      bounds.push(Math.min(vertices[a], vertices[b], vertices[c]), Math.min(vertices[a + 1], vertices[b + 1], vertices[c + 1]), Math.min(vertices[a + 2], vertices[b + 2], vertices[c + 2]),
        Math.max(vertices[a], vertices[b], vertices[c]), Math.max(vertices[a + 1], vertices[b + 1], vertices[c + 1]), Math.max(vertices[a + 2], vertices[b + 2], vertices[c + 2]));
    }
    const nodes = [];
    const build = (from, to) => {
      const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = from; i < to; i++) for (let axis = 0; axis < 3; axis++) {
        box[axis] = Math.min(box[axis], bounds[order[i] * 6 + axis]);
        box[axis + 3] = Math.max(box[axis + 3], bounds[order[i] * 6 + axis + 3]);
      }
      const index = nodes.length, node = { box, from, to, left: -1, right: -1 };
      nodes.push(node);
      if (to - from > 8) {
        let axis = 0;
        if (box[4] - box[1] > box[3] - box[0]) axis = 1;
        if (box[5] - box[2] > box[axis + 3] - box[axis]) axis = 2;
        const sorted = order.slice(from, to).sort((a, b) => bounds[a * 6 + axis] + bounds[a * 6 + axis + 3] - bounds[b * 6 + axis] - bounds[b * 6 + axis + 3]);
        for (let i = 0; i < sorted.length; i++) order[from + i] = sorted[i];
        const middle = (from + to) >>> 1;
        node.left = build(from, middle); node.right = build(middle, to);
      }
      return index;
    };
    if (order.length) build(0, order.length);
    cached = { vertices, triangles: new Uint32Array(triangles), order: new Uint32Array(order), nodes };
    geometries.set(geometry, cached);
    return cached;
  };
  const create = () => {
    const entries = [], registered = new Map(), transforms = new WeakMap(), stack = new Int32Array(64), triangle = new Float64Array(9), query = new Float64Array(6);
    const clipA = new Float64Array(15), clipB = new Float64Array(15);
    let shoulderPolygons = new Float64Array(0), shoulderAcross = new Float64Array(0), shoulderSeen = new Uint8Array(0), shoulderQueue = new Int32Array(0);
    const stats = { nodes: 0, active: 0, transforms: 0, triangles: 0, queries: 0, triangleTests: 0 };
    let generation = 0;
    // Refresh only registered meshes and their ancestors, once per sync; the scene's normal render traversal
    // handles every unrelated node.
    const refreshWorld = (node) => {
      const stamp = transforms.get(node);
      if (stamp === generation) return true;
      if (stamp === -generation) return false;
      const active = node.visible && (!node.parent || refreshWorld(node.parent));
      transforms.set(node, active ? generation : -generation);
      if (!active) return false;
      if (node.quaternion) mat4.fromTQS(node.local, node.position, node.quaternion, node.scale);
      else mat4.fromTRS(node.local, node.position, node.rotation, node.scale);
      if (node.parent) mat4.multiply(node.world, node.parent.world, node.local);
      else node.world.set(node.local);
      stats.transforms++;
      return true;
    };
    const belongs = (node, root) => {
      for (let at = node; at; at = at.parent) if (at === root) return true;
      return false;
    };
    const add = (root, shoulderOnly = false) => {
      const visit = (node) => {
        if (node.geometry && node.geometry.faces.length && !node.instanceData && !registered.has(node)) {
          const geometry = geometryOf(node.geometry);
          if (geometry.nodes.length) {
            const count = geometry.triangles.length / 3;
            if (count > shoulderSeen.length) {
              shoulderPolygons = new Float64Array(count * 15);
              shoulderAcross = new Float64Array(count * 2);
              shoulderSeen = new Uint8Array(count); shoulderQueue = new Int32Array(count);
            }
            const entry = { node, geometry, world: mat4.create(), inverse: mat4.create(), box: new Float64Array(6), active: false, initialized: false, orientation: 1, shoulderOnly };
            entries.push(entry); registered.set(node, entry);
            stats.triangles += geometry.triangles.length / 3;
          }
        }
        for (const child of node.children) visit(child);
      };
      visit(root); stats.nodes = entries.length;
    };
    const remove = (root) => {
      for (let i = entries.length - 1; i >= 0; i--) if (belongs(entries[i].node, root)) {
        stats.triangles -= entries[i].geometry.triangles.length / 3;
        registered.delete(entries[i].node); entries.splice(i, 1);
      }
      stats.nodes = entries.length;
    };
    const sync = () => {
      generation++;
      stats.active = stats.transforms = 0;
      for (const entry of entries) {
        entry.active = refreshWorld(entry.node);
        if (!entry.active) continue;
        const world = entry.node.world;
        let changed = !entry.initialized;
        for (let i = 0; i < 16 && !changed; i++) changed = world[i] !== entry.world[i];
        if (changed) {
          const determinant = world[0] * (world[5] * world[10] - world[6] * world[9]) - world[4] * (world[1] * world[10] - world[2] * world[9]) + world[8] * (world[1] * world[6] - world[2] * world[5]);
          // Opening crates can collapse their scale to zero before removal (|determinant| < 1e-12).
          if (Math.abs(determinant) < 1e-12) { entry.active = false; continue; }
          entry.orientation = determinant < 0 ? -1 : 1;
          entry.world.set(world); mat4.invert(entry.inverse, world); entry.initialized = true;
          const box = entry.geometry.nodes[0].box;
          const x = (box[0] + box[3]) / 2, y = (box[1] + box[4]) / 2, z = (box[2] + box[5]) / 2;
          const hx = (box[3] - box[0]) / 2, hy = (box[4] - box[1]) / 2, hz = (box[5] - box[2]) / 2;
          for (let axis = 0; axis < 3; axis++) {
            const center = world[axis] * x + world[axis + 4] * y + world[axis + 8] * z + world[axis + 12];
            const reach = Math.abs(world[axis]) * hx + Math.abs(world[axis + 4]) * hy + Math.abs(world[axis + 8]) * hz;
            entry.box[axis] = center - reach; entry.box[axis + 3] = center + reach;
          }
        }
        stats.active++;
      }
    };
    const overlaps = (box, x0, y0, z0, x1, y1, z1) => box[0] <= x1 + EPS && box[3] >= x0 - EPS && box[1] <= y1 + EPS && box[4] >= y0 - EPS && box[2] <= z1 + EPS && box[5] >= z0 - EPS;
    const localQuery = (entry, x0, y0, z0, x1, y1, z1) => {
      const m = entry.inverse, x = (x0 + x1) / 2, y = (y0 + y1) / 2, z = (z0 + z1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
      for (let axis = 0; axis < 3; axis++) {
        const center = m[axis] * x + m[axis + 4] * y + m[axis + 8] * z + m[axis + 12];
        const reach = Math.abs(m[axis]) * hx + Math.abs(m[axis + 4]) * hy + Math.abs(m[axis + 8]) * hz;
        query[axis] = center - reach; query[axis + 3] = center + reach;
      }
    };
    const transformTriangle = (entry, index) => {
      const geometry = entry.geometry, vertices = geometry.vertices, m = entry.world;
      for (let i = 0; i < 3; i++) {
        const from = geometry.triangles[index * 3 + i], to = i * 3, x = vertices[from], y = vertices[from + 1], z = vertices[from + 2];
        triangle[to] = m[0] * x + m[4] * y + m[8] * z + m[12];
        triangle[to + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        triangle[to + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      }
      stats.triangleTests++;
    };
    // Maximum height of a triangle over a circular footprint, including contacts along its edges and the
    // steepest point inside the disk.
    const triangleTop = (x, z, radius, direction) => {
      const ax = triangle[0], ay = triangle[1] * direction, az = triangle[2];
      const bx = triangle[3] - ax, by = triangle[4] * direction - ay, bz = triangle[5] - az, cx = triangle[6] - ax, cy = triangle[7] * direction - ay, cz = triangle[8] - az;
      const determinant = bx * cz - bz * cx;
      if (Math.abs(determinant) < 1e-12) return -Infinity;
      const gx = (by * cz - cy * bz) / determinant, gz = (bx * cy - cx * by) / determinant, length = Math.hypot(gx, gz), scale = length ? radius / length : 0;
      const px = x + gx * scale - ax, pz = z + gz * scale - az, u = (px * cz - pz * cx) / determinant, v = (bx * pz - bz * px) / determinant;
      let top = u >= -EPS && v >= -EPS && u + v <= 1 + EPS ? ay + gx * px + gz * pz : -Infinity;
      for (let edge = 0; edge < 3; edge++) {
        const p = edge * 3, q = (edge + 1) % 3 * 3, dx = triangle[q] - triangle[p], dz = triangle[q + 2] - triangle[p + 2], dy = (triangle[q + 1] - triangle[p + 1]) * direction;
        const length2 = dx * dx + dz * dz;
        if (!length2) continue;
        const ex = x - triangle[p], ez = z - triangle[p + 2], middle = (ex * dx + ez * dz) / length2, rx = ex - dx * middle, rz = ez - dz * middle, remaining = radius * radius - rx * rx - rz * rz;
        if (remaining < -1e-12) continue;
        const half = Math.sqrt(Math.max(0, remaining) / length2), lo = Math.max(0, middle - half), hi = Math.min(1, middle + half);
        if (lo <= hi) top = Math.max(top, triangle[p + 1] * direction + dy * (dy > 0 ? hi : lo));
      }
      return top;
    };
    const surfaceAt = (x, z, y, maxStep, radius, ignore, direction) => {
      stats.queries++;
      let best = -Infinity;
      const limit = y * direction + maxStep;
      for (const entry of entries) {
        const box = entry.box;
        if (!entry.active || entry.shoulderOnly || box[0] > x + radius || box[3] < x - radius || box[2] > z + radius || box[5] < z - radius || ignore && belongs(entry.node, ignore)) continue;
        const low = direction > 0 ? box[1] : Math.max(box[1], y - maxStep), high = direction > 0 ? Math.min(box[4], y + maxStep) : box[4];
        if (low > high + EPS) continue;
        localQuery(entry, x - radius, low, z - radius, x + radius, high, z + radius);
        let size = 1; stack[0] = 0;
        while (size) {
          const node = entry.geometry.nodes[stack[--size]];
          if (!overlaps(node.box, query[0], query[1], query[2], query[3], query[4], query[5])) continue;
          if (node.left >= 0) { stack[size++] = node.left; stack[size++] = node.right; continue; }
          for (let i = node.from; i < node.to; i++) {
            transformTriangle(entry, entry.geometry.order[i]);
            const ny = ((triangle[5] - triangle[2]) * (triangle[6] - triangle[0]) - (triangle[3] - triangle[0]) * (triangle[8] - triangle[2])) * entry.orientation;
            if (ny * direction <= 1e-10) continue;
            const top = triangleTop(x, z, radius, direction);
            if (top <= limit + EPS && top > best) best = top;
          }
        }
      }
      return best * direction;
    };
    // A half-open edge convention counts shared diagonals only once; signed crossings also handle overlapping
    // closed parts of a merged model.
    const inside = (entry, x, y, z) => {
      if (!overlaps(entry.box, x, y, z, x, y, z)) return false;
      localQuery(entry, x, y, z, x, entry.box[4] + EPS, z);
      let winding = 0, size = 1; stack[0] = 0;
      while (size) {
        const node = entry.geometry.nodes[stack[--size]];
        if (!overlaps(node.box, query[0], query[1], query[2], query[3], query[4], query[5])) continue;
        if (node.left >= 0) { stack[size++] = node.left; stack[size++] = node.right; continue; }
        for (let i = node.from; i < node.to; i++) {
          transformTriangle(entry, entry.geometry.order[i]);
          const determinant = (triangle[3] - triangle[0]) * (triangle[8] - triangle[2]) - (triangle[5] - triangle[2]) * (triangle[6] - triangle[0]);
          if (Math.abs(determinant) < 1e-12) continue;
          let covered = true;
          const sign = determinant < 0 ? -1 : 1;
          for (let edge = 0; edge < 3; edge++) {
            const a = edge * 3, b = (edge + 1) % 3 * 3, dx = (triangle[b] - triangle[a]) * sign, dz = (triangle[b + 2] - triangle[a + 2]) * sign;
            const cross = dx * (z - triangle[a + 2]) - dz * (x - triangle[a]);
            if (cross < -1e-12 || Math.abs(cross) <= 1e-12 && !(dz > 0 || dz === 0 && dx < 0)) { covered = false; break; }
          }
          if (!covered) continue;
          const height = triangleTop(x, z, 0, 1);
          if (height > y + EPS) winding -= sign * entry.orientation;
        }
      }
      return winding > 0;
    };
    const segmentClear = (x, y, z, toX, toY, toZ, radius, height, ignore = null) => {
      stats.queries++;
      const x0 = Math.min(x, toX) - radius, x1 = Math.max(x, toX) + radius, y0 = Math.min(y, toY), y1 = Math.max(y, toY) + height, z0 = Math.min(z, toZ) - radius, z1 = Math.max(z, toZ) + radius;
      for (const entry of entries) {
        if (!entry.active || entry.shoulderOnly || !overlaps(entry.box, x0, y0, z0, x1, y1, z1) || ignore && belongs(entry.node, ignore)) continue;
        if (inside(entry, x, y + height / 2, z) || inside(entry, toX, toY + height / 2, toZ)) return false;
        localQuery(entry, x0, y0, z0, x1, y1, z1);
        let size = 1; stack[0] = 0;
        while (size) {
          const node = entry.geometry.nodes[stack[--size]];
          if (!overlaps(node.box, query[0], query[1], query[2], query[3], query[4], query[5])) continue;
          if (node.left >= 0) { stack[size++] = node.left; stack[size++] = node.right; continue; }
          for (let i = node.from; i < node.to; i++) {
            transformTriangle(entry, entry.geometry.order[i]);
            if (Math.max(triangle[1], triangle[4], triangle[7]) <= y0 + EPS || Math.min(triangle[1], triangle[4], triangle[7]) >= y1 - EPS) continue;
            if (BL.convex.sweptCylinder(triangle, x, y, z, toX, toY, toZ, radius, height)) return false;
          }
        }
      }
      return true;
    };
    const clipHeight = (from, count, to, height, direction) => {
      let written = 0, previous = (count - 1) * 3;
      for (let i = 0; i < count; i++) {
        const at = i * 3, a = (from[previous + 1] - height) * direction, b = (from[at + 1] - height) * direction;
        if (a < 0 && b > 0 || a > 0 && b < 0) {
          const t = a / (a - b), out = written++ * 3;
          to[out] = from[previous] + (from[at] - from[previous]) * t;
          to[out + 1] = height;
          to[out + 2] = from[previous + 2] + (from[at + 2] - from[previous + 2]) * t;
        }
        if (b >= 0) {
          const out = written++ * 3;
          to[out] = from[at]; to[out + 1] = from[at + 1]; to[out + 2] = from[at + 2];
        }
        previous = at;
      }
      return written;
    };
    // A clipped triangle has at most five vertices; its horizontal projection is convex, including the segments
    // made by vertical mesh faces.
    const shoulderSeparate = (a, b, dx, dz) => {
      const data = shoulderPolygons;
      let lowA = Infinity, highA = -Infinity, lowB = Infinity, highB = -Infinity;
      for (let i = 0; i < data[a]; i++) {
        const at = a + 5 + i * 2, value = data[at] * dx + data[at + 1] * dz;
        lowA = Math.min(lowA, value); highA = Math.max(highA, value);
      }
      for (let i = 0; i < data[b]; i++) {
        const at = b + 5 + i * 2, value = data[at] * dx + data[at + 1] * dz;
        lowB = Math.min(lowB, value); highB = Math.max(highB, value);
      }
      return lowA > highB + EPS || lowB > highA + EPS;
    };
    const shoulderTouches = (a, b) => {
      const data = shoulderPolygons;
      if (data[a + 1] > data[b + 2] + EPS || data[b + 1] > data[a + 2] + EPS || data[a + 3] > data[b + 4] + EPS || data[b + 3] > data[a + 4] + EPS) return false;
      for (let shape = 0; shape < 2; shape++) {
        const start = shape ? b : a, count = data[start];
        for (let i = 0; i < count; i++) {
          const at = start + 5 + i * 2, next = start + 5 + (i + 1) % count * 2;
          const dx = data[next] - data[at], dz = data[next + 1] - data[at + 1];
          if (shoulderSeparate(a, b, -dz, dx)) return false;
        }
      }
      return true;
    };
    const shoulderDistance = (start, radius) => {
      const data = shoulderPolygons, count = data[start];
      let first = Infinity, last = -Infinity;
      for (let i = 0; i < count; i++) {
        const at = start + 5 + i * 2, next = start + 5 + (i + 1) % count * 2;
        const along = data[at], across = data[at + 1], da = data[next] - along, dc = data[next + 1] - across;
        let lo = 0, hi = 1;
        if (dc) {
          const a = (-radius - across) / dc, b = (radius - across) / dc;
          lo = Math.max(0, Math.min(a, b)); hi = Math.min(1, Math.max(a, b));
        } else if (Math.abs(across) > radius) continue;
        if (lo > hi) continue;
        for (let end = 0; end < 2; end++) {
          const t = end ? hi : lo, c = across + dc * t, reach = Math.sqrt(Math.max(0, radius * radius - c * c)), l = along + da * t;
          first = Math.min(first, l - reach); last = Math.max(last, l + reach);
        }
        if (dc) {
          const acrossAt = radius * da * Math.sign(dc) / Math.hypot(da, dc);
          const near = (-acrossAt - across) / dc, far = (acrossAt - across) / dc;
          if (near > lo && near < hi) first = Math.min(first, along + da * near - Math.sqrt(Math.max(0, radius * radius - acrossAt * acrossAt)));
          if (far > lo && far < hi) last = Math.max(last, along + da * far + Math.sqrt(Math.max(0, radius * radius - acrossAt * acrossAt)));
        }
      }
      return last >= 0 ? Math.max(0, first) : Infinity;
    };
    const shoulderPolygon = (start, vertices, x, z, fx, fz) => {
      const data = shoulderPolygons;
      data[start] = vertices;
      data[start + 1] = data[start + 3] = Infinity; data[start + 2] = data[start + 4] = -Infinity;
      for (let p = 0; p < vertices; p++) {
        const dx = clipB[p * 3] - x, dz = clipB[p * 3 + 2] - z, along = dx * fx + dz * fz, across = dx * fz - dz * fx;
        data[start + 5 + p * 2] = along; data[start + 6 + p * 2] = across;
        data[start + 1] = Math.min(data[start + 1], along); data[start + 2] = Math.max(data[start + 2], along);
        data[start + 3] = Math.min(data[start + 3], across); data[start + 4] = Math.max(data[start + 4], across);
      }
    };
    // shoulderAt: y/height are the blocking slice above a walker's climbable step; out is the first connected
    // surface in forward/right frame; bottomY adds lower tiers only after contact; contactAcross keeps that slice.
    const shoulderAt = (x, y, z, fx, fz, radius, height, reach, out, bottomY = y) => {
      stats.queries++;
      out.node = null;
      if (height <= EPS) return false;
      const margin = reach + radius, toX = x + fx * reach, toZ = z + fz * reach;
      const x0 = Math.min(x, toX) - margin, x1 = Math.max(x, toX) + margin, z0 = Math.min(z, toZ) - margin, z1 = Math.max(z, toZ) + margin;
      let best = reach + EPS;
      for (const entry of entries) {
        if (!entry.active || !overlaps(entry.box, x0, bottomY, z0, x1, y + height, z1)) continue;
        localQuery(entry, x0, bottomY, z0, x1, y + height, z1);
        let size = 1, count = 0, nearest = -1; stack[0] = 0;
        while (size) {
          const node = entry.geometry.nodes[stack[--size]];
          if (!overlaps(node.box, query[0], query[1], query[2], query[3], query[4], query[5])) continue;
          if (node.left >= 0) { stack[size++] = node.left; stack[size++] = node.right; continue; }
          for (let i = node.from; i < node.to; i++) {
            transformTriangle(entry, entry.geometry.order[i]);
            const top = Math.max(triangle[1], triangle[4], triangle[7]);
            if (top <= bottomY + EPS || Math.min(triangle[1], triangle[4], triangle[7]) >= y + height - EPS) continue;
            const start = count * 15, contact = count * 2;
            shoulderAcross[contact] = Infinity; shoulderAcross[contact + 1] = -Infinity;
            let distance = Infinity;
            if (bottomY < y && top > y + EPS) {
              const lower = clipHeight(triangle, 3, clipA, y, 1), vertices = clipHeight(clipA, lower, clipB, y + height, -1);
              shoulderPolygon(start, vertices, x, z, fx, fz);
              shoulderAcross[contact] = shoulderPolygons[start + 3]; shoulderAcross[contact + 1] = shoulderPolygons[start + 4];
              distance = shoulderDistance(start, radius);
            }
            const lower = clipHeight(triangle, 3, clipA, bottomY, 1), vertices = clipHeight(clipA, lower, clipB, y + height, -1);
            if (!vertices) continue;
            shoulderPolygon(start, vertices, x, z, fx, fz);
            if (bottomY === y) {
              shoulderAcross[contact] = shoulderPolygons[start + 3]; shoulderAcross[contact + 1] = shoulderPolygons[start + 4];
              distance = shoulderDistance(start, radius);
            }
            if (distance < best) { best = distance; nearest = count; }
            count++;
          }
        }
        if (nearest < 0) continue;
        shoulderSeen.fill(0, 0, count); shoulderSeen[nearest] = 1; shoulderQueue[0] = nearest;
        out.node = entry.node; out.minAlong = out.minAcross = Infinity; out.maxAlong = out.maxAcross = -Infinity;
        out.minContactAcross = Infinity; out.maxContactAcross = -Infinity;
        let end = 1;
        for (let at = 0; at < end; at++) {
          const start = shoulderQueue[at] * 15, data = shoulderPolygons;
          out.minAlong = Math.min(out.minAlong, data[start + 1]); out.maxAlong = Math.max(out.maxAlong, data[start + 2]);
          out.minAcross = Math.min(out.minAcross, data[start + 3]); out.maxAcross = Math.max(out.maxAcross, data[start + 4]);
          const contact = shoulderQueue[at] * 2;
          out.minContactAcross = Math.min(out.minContactAcross, shoulderAcross[contact]); out.maxContactAcross = Math.max(out.maxContactAcross, shoulderAcross[contact + 1]);
          for (let i = 0; i < count; i++) if (!shoulderSeen[i] && shoulderTouches(start, i * 15)) {
            shoulderSeen[i] = 1; shoulderQueue[end++] = i;
          }
        }
      }
      return !!out.node;
    };
    return {
      add, remove, sync, segmentClear, shoulderAt, stats,
      isActive: (node) => !!registered.get(node)?.active,
      clearAt: (x, y, z, radius, height, ignore = null) => segmentClear(x, y, z, x, y, z, radius, height, ignore),
      supportAt: (x, z, y, maxStep = 0, radius = 0, ignore = null) => surfaceAt(x, z, y, maxStep, radius, ignore, 1),
      ceilingAt: (x, z, y, radius = 0, ignore = null) => surfaceAt(x, z, y, 0, radius, ignore, -1),
      dispose() { entries.length = 0; registered.clear(); stats.nodes = stats.active = stats.transforms = stats.triangles = 0; }
    };
  };
  BL.solidProps = { create };
})();
