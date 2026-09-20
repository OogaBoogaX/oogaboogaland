// Character-attached UI shares one geometric visibility result per frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4 } = BL.math, { boundsOf } = BL.scene;
  const UP = { x: 0, y: 1, z: 0 }, VERTICES = 64, FRAGMENTS = 1024, EPS = 1e-10;
  const meshes = new WeakMap();
  const meshOf = (geometry) => {
    let mesh = meshes.get(geometry);
    if (mesh) return mesh;
    const vertices = geometry.verts, indices = [], boxes = [], order = [], nodes = [];
    for (const face of geometry.faces) for (let i = 1; i + 1 < face.i.length; i++) {
      const a = face.i[0] * 3, b = face.i[i] * 3, c = face.i[i + 1] * 3;
      indices.push(a, b, c); order.push(order.length);
      for (let axis = 0; axis < 3; axis++) boxes.push(Math.min(vertices[a + axis], vertices[b + axis], vertices[c + axis]));
      for (let axis = 0; axis < 3; axis++) boxes.push(Math.max(vertices[a + axis], vertices[b + axis], vertices[c + axis]));
    }
    const keys = new Float64Array(order.length * 3), scratch = BL.math.sortScratch(order.length);
    for (let i = 0; i < order.length; i++) for (let axis = 0; axis < 3; axis++) keys[i * 3 + axis] = boxes[i * 6 + axis] + boxes[i * 6 + axis + 3];
    const build = (from, to) => {
      const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = from; i < to; i++) for (let axis = 0; axis < 3; axis++) {
        box[axis] = Math.min(box[axis], boxes[order[i] * 6 + axis]); box[axis + 3] = Math.max(box[axis + 3], boxes[order[i] * 6 + axis + 3]);
      }
      const index = nodes.length, node = { box, from, to, left: -1, right: -1 }; nodes.push(node);
      if (to - from > 12) {
        let axis = 0;
        if (box[4] - box[1] > box[3] - box[0]) axis = 1;
        if (box[5] - box[2] > box[axis + 3] - box[axis]) axis = 2;
        BL.math.sortByKey(order, from, to, keys, 3, axis, scratch);
        const middle = (from + to) >>> 1; node.left = build(from, middle); node.right = build(middle, to);
      }
      return index;
    };
    if (order.length) build(0, order.length);
    mesh = { vertices, indices: new Uint32Array(indices), order: new Uint32Array(order), nodes };
    meshes.set(geometry, mesh); return mesh;
  };
  const create = ({ root, renderer, camera, occluded = null }) => {
    let records = new WeakMap(), memo = new WeakMap();
    const active = [], candidates = [], view = mat4.create(), nextView = mat4.create(), stack = new Int32Array(64);
    const clipA = new Float64Array(VERTICES * 4), clipB = new Float64Array(VERTICES * 4), projected = new Float64Array(VERTICES * 2);
    const insideA = new Float64Array(VERTICES * 2), insideB = new Float64Array(VERTICES * 2), outside = new Float64Array(VERTICES * 2);
    const fragments = new Float64Array(FRAGMENTS * VERTICES * 2), counts = new Uint8Array(FRAGMENTS);
    let frame = 0, viewVersion = 0, candidateCount = 0, prepared = false, width = 1, height = 1, tanX = 1, tanY = 1, sideX = 1, sideY = 1, near = 0.1, far = 1000;
    let planeA = 0, planeB = 0, planeC = 0, witnessX = 0, witnessY = 0, hitEntry = null, hitTriangle = 0, hitDepth = 0;
    const belongs = (node, owner) => {
      for (let parent = node; parent; parent = parent.parent) if (parent === owner) return true;
      return false;
    };
    const present = (node) => {
      for (let parent = node; parent; parent = parent.parent) {
        if (!parent.visible || parent.cameraHidden) return false;
        if (parent === root) return true;
      }
      return false;
    };
    const add = (node, world, offset = 0, instance = -1) => {
      let list = records.get(node);
      if (!list) { list = []; records.set(node, list); }
      const index = instance + 1;
      let entry = list[index];
      if (!entry) { entry = { node, inverse: mat4.create(), camera: mat4.create(), world: mat4.create(), bounds: null, geometry: null, frame: -1, viewVersion: -1, minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity, minDepth: 0, inFrustum: false, orientation: 1, radius: 0, inverseDirty: true, localMinY: -Infinity }; list[index] = entry; }
      const geometry = node.geometry, w = entry.world;
      let changed = entry.geometry !== geometry;
      for (let i = 0; !changed && i < 16; i++) changed = w[i] !== world[offset + i];
      if (changed) {
        for (let i = 0; i < 16; i++) w[i] = world[offset + i];
        entry.geometry = geometry; entry.bounds = boundsOf(geometry); entry.inverseDirty = true;
        const determinant = w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9]) + w[8] * (w[1] * w[6] - w[2] * w[5]);
        entry.orientation = Math.abs(determinant) < 1e-12 ? 0 : Math.sign(determinant);
        entry.radius = entry.bounds.radius * Math.max(Math.hypot(w[0], w[1], w[2]), Math.hypot(w[4], w[5], w[6]), Math.hypot(w[8], w[9], w[10]));
      }
      if (!entry.orientation) return;
      const bounds = entry.bounds;
      if (changed || entry.viewVersion !== viewVersion) {
        mat4.multiply(entry.camera, view, w);
        const m = entry.camera, b = bounds.center, radius = entry.radius;
        const x = m[0] * b[0] + m[4] * b[1] + m[8] * b[2] + m[12], y = m[1] * b[0] + m[5] * b[1] + m[9] * b[2] + m[13], z = -(m[2] * b[0] + m[6] * b[1] + m[10] * b[2] + m[14]);
        entry.inFrustum = !(z + radius < near || z - radius > far || Math.abs(x) > z * tanX + radius * sideX || Math.abs(y) > z * tanY + radius * sideY);
        if (entry.inFrustum) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, minDepth = Infinity;
          for (let i = 0; i < 8; i++) {
            const bx = i & 1 ? bounds.max[0] : bounds.min[0], by = i & 2 ? bounds.max[1] : bounds.min[1], bz = i & 4 ? bounds.max[2] : bounds.min[2];
            const depth = -(m[2] * bx + m[6] * by + m[10] * bz + m[14]);
            minDepth = Math.min(minDepth, depth);
            if (depth <= near) continue;
            const px = (m[0] * bx + m[4] * by + m[8] * bz + m[12]) / (depth * tanX), py = (m[1] * bx + m[5] * by + m[9] * bz + m[13]) / (depth * tanY);
            minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
          }
          // Perspective extrema lie at box corners only when the whole box is
          // in front of the near plane. Straddlers keep the full exact query.
          // Allow Float32 transform rounding before the exact local ray test.
          const margin = 1e-6 * Math.max(1, Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY));
          entry.minX = minDepth > near ? minX - margin : -Infinity; entry.minY = minDepth > near ? minY - margin : -Infinity;
          entry.maxX = minDepth > near ? maxX + margin : Infinity; entry.maxY = minDepth > near ? maxY + margin : Infinity;
          entry.minDepth = minDepth - 1e-6 * Math.max(1, Math.abs(minDepth));
        }
        entry.viewVersion = viewVersion;
      }
      if (!entry.inFrustum) return;
      // Static scenery and unchanged instances share the same exact inverse
      // across frames; camera motion still refreshes their projection above.
      if (entry.inverseDirty) { mat4.invert(entry.inverse, w); entry.inverseDirty = false; }
      entry.frame = frame;
      entry.localMinY = node.mirror ? bounds.min[1] + (bounds.max[1] - bounds.min[1]) * Math.max(0, Math.min(1, node.mirrorReveal || 0)) : -Infinity;
      active.push(entry);
    };
    const visit = (node) => {
      if (!node.visible || node.cameraHidden) return;
      const geometry = node.geometry;
      // Smoke is translucent; guide lines and glyph effects do not cover UI.
      if (geometry && geometry.faces && geometry.faces.length && !geometry.matrixGlyph && !node.mirrorPortal && !(node.smokeOpacity < 1)) {
        if (node.instanceData) {
          const data = node.instanceData, count = node.drawInstanceCount === undefined ? node.instanceCount : Math.min(node.instanceCount, node.drawInstanceCount);
          for (let i = 0; i < count; i++) if (data[i * 20 + 18] >= -1) add(node, data, i * 20, i);
        } else add(node, node.world);
      }
      for (const child of node.children) visit(child);
    };
    const prepare = () => {
      if (prepared) return;
      prepared = true; active.length = 0;
      const size = renderer.size, tangent = Math.tan(camera.fov / 2);
      let changed = width !== size.width || height !== size.height || near !== camera.near || far !== camera.far || tanY !== tangent;
      mat4.lookAt(nextView, camera.position, camera.target, camera.up || UP);
      for (let i = 0; !changed && i < 16; i++) changed = view[i] !== nextView[i];
      if (changed) {
        width = size.width; height = size.height; near = camera.near; far = camera.far;
        tanY = tangent; tanX = tanY * width / height;
        sideX = Math.hypot(1, tanX); sideY = Math.hypot(1, tanY);
        view.set(nextView); viewVersion++;
      }
      visit(root);
    };
    const rayBox = (box, x, y, z, dx, dy, dz, limit, min = box.min, max = box.max) => {
      let low = near, high = limit;
      for (let axis = 0; axis < 3; axis++) {
        const p = axis === 0 ? x : axis === 1 ? y : z, d = axis === 0 ? dx : axis === 1 ? dy : dz;
        const a = min ? min[axis] : box[axis], b = max ? max[axis] : box[axis + 3];
        if (Math.abs(d) < 1e-15) { if (p < a || p > b) return false; }
        else { const u = (a - p) / d, v = (b - p) / d; low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v)); if (high < low) return false; }
      }
      return true;
    };
    const nearest = (sx, sy, depth, owner) => {
      const vx = sx * tanX, vy = sy * tanY;
      const dx = view[0] * vx + view[1] * vy - view[2], dy = view[4] * vx + view[5] * vy - view[6], dz = view[8] * vx + view[9] * vy - view[10];
      const eye = camera.position; hitEntry = null; hitDepth = depth - Math.max(1e-6, depth * 1e-7);
      for (let candidate = 0; candidate < candidateCount; candidate++) {
        const entry = candidates[candidate];
        if (sx < entry.minX || sx > entry.maxX || sy < entry.minY || sy > entry.maxY || entry.minDepth >= hitDepth) continue;
        const m = entry.inverse;
        const x = m[0] * eye.x + m[4] * eye.y + m[8] * eye.z + m[12], y = m[1] * eye.x + m[5] * eye.y + m[9] * eye.z + m[13], z = m[2] * eye.x + m[6] * eye.y + m[10] * eye.z + m[14];
        const ux = m[0] * dx + m[4] * dy + m[8] * dz, uy = m[1] * dx + m[5] * dy + m[9] * dz, uz = m[2] * dx + m[6] * dy + m[10] * dz;
        if (!rayBox(entry.bounds, x, y, z, ux, uy, uz, hitDepth)) continue;
        const mesh = meshOf(entry.geometry), v = mesh.vertices, indices = mesh.indices;
        let top = mesh.nodes.length ? 1 : 0; stack[0] = 0;
        while (top) {
          const node = mesh.nodes[stack[--top]];
          if (!rayBox(node.box, x, y, z, ux, uy, uz, hitDepth)) continue;
          if (node.left >= 0) { stack[top++] = node.left; stack[top++] = node.right; continue; }
          for (let i = node.from; i < node.to; i++) {
            const at = mesh.order[i] * 3, a = indices[at], b = indices[at + 1], c = indices[at + 2];
            const abx = v[b] - v[a], aby = v[b + 1] - v[a + 1], abz = v[b + 2] - v[a + 2], acx = v[c] - v[a], acy = v[c + 1] - v[a + 1], acz = v[c + 2] - v[a + 2];
            const px = uy * acz - uz * acy, py = uz * acx - ux * acz, pz = ux * acy - uy * acx, determinant = abx * px + aby * py + abz * pz;
            if (determinant * entry.orientation <= 1e-12) continue;
            const tx = x - v[a], ty = y - v[a + 1], tz = z - v[a + 2], beta = (tx * px + ty * py + tz * pz) / determinant;
            if (beta < -EPS || beta > 1 + EPS) continue;
            const qx = ty * abz - tz * aby, qy = tz * abx - tx * abz, qz = tx * aby - ty * abx, gamma = (ux * qx + uy * qy + uz * qz) / determinant;
            if (gamma < -EPS || beta + gamma > 1 + EPS) continue;
            const t = (acx * qx + acy * qy + acz * qz) / determinant, worldY = eye.y + dy * t;
            if (t <= near || t >= hitDepth || y + uy * t < entry.localMinY || worldY < (entry.geometry.clipMinY ?? -Infinity) || worldY > (entry.geometry.clipMaxY ?? Infinity)) continue;
            hitEntry = entry; hitTriangle = at; hitDepth = t;
          }
        }
      }
      return hitEntry !== null;
    };
    const clip = (src, count, dst, stride, a, b, c, d = 0, constant = 0) => {
      let written = 0, previous = (count - 1) * stride;
      for (let i = 0; i < count; i++) {
        const at = i * stride, av = a * src[previous] + b * src[previous + 1] + (stride === 4 ? c * src[previous + 2] + d * src[previous + 3] + constant : c);
        const bv = a * src[at] + b * src[at + 1] + (stride === 4 ? c * src[at + 2] + d * src[at + 3] + constant : c);
        if ((av >= 0) !== (bv >= 0)) {
          const t = av / (av - bv);
          for (let axis = 0; axis < stride; axis++) dst[written * stride + axis] = src[previous + axis] + (src[at + axis] - src[previous + axis]) * t;
          written++;
        }
        if (bv >= 0) { for (let axis = 0; axis < stride; axis++) dst[written * stride + axis] = src[at + axis]; written++; }
        previous = at;
      }
      return written;
    };
    const projectTriangle = (entry, a, b, c) => {
      const m = entry.camera, v = entry.geometry.verts;
      for (let i = 0; i < 3; i++) {
        const at = i === 0 ? a : i === 1 ? b : c, o = i * 4, x = v[at], y = v[at + 1], z = v[at + 2];
        clipA[o] = m[0] * x + m[4] * y + m[8] * z + m[12]; clipA[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
        clipA[o + 2] = -(m[2] * x + m[6] * y + m[10] * z + m[14]); clipA[o + 3] = y;
      }
      const ax = clipA[4] - clipA[0], ay = clipA[5] - clipA[1], az = clipA[6] - clipA[2], bx = clipA[8] - clipA[0], by = clipA[9] - clipA[1], bz = clipA[10] - clipA[2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, plane = nx * clipA[0] + ny * clipA[1] + nz * clipA[2];
      if (plane <= 1e-12) return 0;
      planeA = nx * tanX / plane; planeB = ny * tanY / plane; planeC = nz / plane;
      let src = clipA, dst = clipB, count = 3;
      for (let side = 0; side < 9 && count >= 3; side++) {
        let a = 0, b = 0, c = 0, d = 0, constant = 0;
        if (side === 0) { c = 1; constant = -near; }
        else if (side === 1) { c = -1; constant = far; }
        else if (side < 4) { a = side === 2 ? 1 : -1; c = tanX; }
        else if (side < 6) { b = side === 4 ? 1 : -1; c = tanY; }
        else if (side === 6) { if (entry.localMinY === -Infinity) continue; d = 1; constant = -entry.localMinY; }
        else {
          const bound = side === 7 ? entry.geometry.clipMinY : entry.geometry.clipMaxY;
          if (bound === undefined) continue;
          const sign = side === 7 ? 1 : -1;
          a = view[4] * sign; b = view[5] * sign; c = -view[6] * sign; constant = (camera.position.y - bound) * sign;
        }
        count = clip(src, count, dst, 4, a, b, c, d, constant); const swap = src; src = dst; dst = swap;
      }
      for (let i = 0; i < count; i++) { projected[i * 2] = src[i * 4] / (src[i * 4 + 2] * tanX); projected[i * 2 + 1] = src[i * 4 + 1] / (src[i * 4 + 2] * tanY); }
      return count;
    };
    const area = (p, count) => {
      let sum = 0;
      for (let i = 1; i + 1 < count; i++) sum += (p[i * 2] - p[0]) * (p[i * 2 + 3] - p[1]) - (p[i * 2 + 1] - p[1]) * (p[i * 2 + 2] - p[0]);
      return Math.abs(sum);
    };
    const exposed = (count, owner) => {
      const targetA = planeA, targetB = planeB, targetC = planeC;
      let top = 1; counts[0] = count;
      for (let i = 0; i < count * 2; i++) fragments[i] = projected[i];
      while (top) {
        count = counts[--top]; const offset = top * VERTICES * 2;
        let x = 0, y = 0;
        for (let i = 0; i < count; i++) { x += insideA[i * 2] = fragments[offset + i * 2]; y += insideA[i * 2 + 1] = fragments[offset + i * 2 + 1]; }
        const originalArea = area(insideA, count);
        if (count < 3 || originalArea < 1e-14) continue;
        x /= count; y /= count;
        if (!nearest(x, y, 1 / (targetA * x + targetB * y + targetC), owner)) { witnessX = x; witnessY = y; return true; }
        const mesh = meshOf(hitEntry.geometry), indices = mesh.indices;
        const covered = projectTriangle(hitEntry, indices[hitTriangle], indices[hitTriangle + 1], indices[hitTriangle + 2]);
        if (covered < 3) { witnessX = x; witnessY = y; return true; }
        let src = insideA, dst = insideB, remainingArea = 0;
        // Subtract the blocker only where its plane lies in front of this
        // surface. Every outside fragment remains eligible, however narrow.
        for (let edge = 0; edge <= covered && count >= 3; edge++) {
          if (count >= VERTICES - 1) { witnessX = x; witnessY = y; return true; }
          const j = edge * 2, k = ((edge + 1) % covered) * 2;
          const a = edge === covered ? planeA - targetA : projected[j + 1] - projected[k + 1];
          const b = edge === covered ? planeB - targetB : projected[k] - projected[j];
          const c = edge === covered ? planeC - targetC : -a * projected[j] - b * projected[j + 1];
          const n = clip(src, count, outside, 2, -a, -b, -c);
          if (n >= 3 && area(outside, n) >= 1e-14) {
            remainingArea += area(outside, n);
            // Keep uncertainty visible if pathological geometry exhausts the
            // fixed scratch budget; it must never erase a visible sliver.
            if (top >= FRAGMENTS || n >= VERTICES - 1) { witnessX = x; witnessY = y; return true; }
            counts[top] = n;
            for (let i = 0; i < n * 2; i++) fragments[top * VERTICES * 2 + i] = outside[i];
            top++;
          }
          count = clip(src, count, dst, 2, a, b, c); const swap = src; src = dst; dst = swap;
        }
        // A ray grazing a seam can be inside by rounding while the polygon
        // remains outside. Do not revisit an unchanged fragment indefinitely.
        if (remainingArea >= originalArea * (1 - 1e-12)) { witnessX = x; witnessY = y; return true; }
      }
      return false;
    };
    const visiblePart = (node, owner) => {
      if (!node.visible || node.cameraHidden) return false;
      const entry = records.get(node)?.[0], geometry = node.geometry;
      if (entry && entry.frame === frame && geometry) for (const face of geometry.faces) for (let i = 1; i + 1 < face.i.length; i++) {
        const count = projectTriangle(entry, face.i[0] * 3, face.i[i] * 3, face.i[i + 1] * 3);
        if (count >= 3 && area(projected, count) >= 1e-14 && exposed(count, owner)) return true;
      }
      for (const child of node.children) if (visiblePart(child, owner)) return true;
      return false;
    };
    let headMinX = Infinity, headMaxX = -Infinity, headTop = Infinity;
    const projectHead = (node) => {
      if (!node.visible || node.cameraHidden) return;
      const entry = records.get(node)?.[0];
      if (entry && entry.frame === frame) {
        const b = entry.bounds, m = entry.camera;
        for (let i = 0; i < 8; i++) {
          const x = i & 1 ? b.max[0] : b.min[0], y = i & 2 ? b.max[1] : b.min[1], z = i & 4 ? b.max[2] : b.min[2];
          const depth = -(m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (depth < near) continue;
          const px = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / (depth * tanX) + 1) * width / 2;
          headMinX = Math.min(headMinX, px); headMaxX = Math.max(headMaxX, px);
          headTop = Math.min(headTop, (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / (depth * tanY)) * height / 2);
        }
      }
      for (const child of node.children) projectHead(child);
    };
    let actorMinX = Infinity, actorMinY = Infinity, actorMaxX = -Infinity, actorMaxY = -Infinity;
    const boundActor = (node) => {
      if (!node.visible || node.cameraHidden) return;
      const entry = records.get(node)?.[0];
      if (entry && entry.frame === frame) {
        actorMinX = Math.min(actorMinX, entry.minX); actorMinY = Math.min(actorMinY, entry.minY);
        actorMaxX = Math.max(actorMaxX, entry.maxX); actorMaxY = Math.max(actorMaxY, entry.maxY);
      }
      for (const child of node.children) boundActor(child);
    };
    const selectCandidates = (owner) => {
      actorMinX = actorMinY = Infinity; actorMaxX = actorMaxY = -Infinity;
      boundActor(owner);
      const previous = candidateCount; candidateCount = 0;
      // One conservative character bound excludes unrelated scenery before
      // thousands of exact witness rays, preserving the active entry order.
      for (const entry of active) if (entry.maxX >= actorMinX && entry.minX <= actorMaxX && entry.maxY >= actorMinY && entry.minY <= actorMaxY && !belongs(entry.node, owner)) candidates[candidateCount++] = entry;
      for (let i = candidateCount; i < previous; i++) candidates[i] = null;
    };
    const query = (cave) => {
      let result = memo.get(cave);
      if (!result) { result = { frame: -1, visible: false, x: 0, y: 0 }; memo.set(cave, result); }
      if (result.frame === frame) return result;
      result.frame = frame; result.visible = false;
      if (!present(cave.root) || occluded && occluded(cave)) return result;
      prepare();
      selectCandidates(cave.root);
      if (!visiblePart(cave.root, cave.root)) return result;
      result.visible = true; result.x = (witnessX + 1) * width / 2; result.y = (1 - witnessY) * height / 2;
      const head = cave.parts.head;
      if (present(head)) {
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        projectHead(head);
        if (headTop !== Infinity) { result.x = (headMinX + headMaxX) / 2; result.y = headTop; }
      }
      result.x = Math.max(0, Math.min(width, result.x)); result.y = Math.max(0, Math.min(height, result.y));
      return result;
    };
    return {
      begin: () => { frame++; prepared = false; },
      visible: (cave) => query(cave).visible,
      anchor: (cave, out) => { const result = query(cave); if (!result.visible) return false; out.x = result.x; out.y = result.y; return true; },
      dispose: () => { active.length = candidates.length = candidateCount = 0; records = new WeakMap(); memo = new WeakMap(); hitEntry = null; }
    };
  };
  BL.characterVisibility = { create };
})();
