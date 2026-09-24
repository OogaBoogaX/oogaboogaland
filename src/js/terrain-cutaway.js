// Render-only horizontal sections of terrain. Solid voxels fill the island's
// actual outline; carved rooms, windows and shafts stay open. No collision data
// or authored mesh is changed. Each visit retains at most eight slices per pass.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const CACHE_CAP = 8, DETAIL_STEP = 0.05, EPS = 1e-7;
  const create = (source, releaseGeometry = () => {}) => {
    const node = createNode({ visible: false }), solid = createNode(), detail = createNode();
    addChild(node, solid, detail);
    const { data, sx, sy, sz, unit, origin, palette } = source;
    const mask = new Uint8Array(sx * sz), polygon = new Float64Array(512), clipped = new Float64Array(512), hull = new Float64Array(1024);
    // Architectural fragments occupy only a few columns. Index them once so
    // a moving slice never scans the whole island for each detail-height step.
    const windowColumns = [], rampColumns = [];
    if (source.windows) for (let column = 0; column < source.windows.length; column++) {
      const pieces = source.windows[column];
      if (pieces && pieces.length) windowColumns.push(pieces);
    }
    if (source.rampLayers) for (let layer = 0; layer < source.rampLayers.length; layer++) {
      const info = source.rampLayers[layer], columns = [];
      for (let column = 0; column < info.ranges.length; column++) if (info.ranges[column]) columns.push(column);
      rampColumns.push({ info, columns });
    }
    const solidCache = [], detailCache = [];
    const stats = { solidBuilds: 0, detailBuilds: 0, cacheEntries: 0, faces: 0 };
    let generation = 0, currentSolid = null, currentDetail = null;
    const sameRegion = (a, b) => !a || !b ? !a && !b : a.id === b.id && a.x === b.x && a.z === b.z && a.cos === b.cos && a.sin === b.sin && a.halfWidth === b.halfWidth && a.halfDepth === b.halfDepth;
    const lookup = (cache, key, region) => {
      for (let i = 0; i < cache.length; i++) if (cache[i].key === key && sameRegion(cache[i].region, region)) { cache[i].used = ++generation; return cache[i]; }
      return null;
    };
    const remember = (cache, key, region, geometry) => {
      const entry = { key, region: region ? { ...region } : null, geometry, used: ++generation };
      if (cache.length === CACHE_CAP) {
        let oldest = 0;
        for (let i = 1; i < cache.length; i++) if (cache[i].used < cache[oldest].used) oldest = i;
        releaseGeometry(cache[oldest].geometry); cache[oldest] = entry;
      } else cache.push(entry);
      stats.cacheEntries = solidCache.length + detailCache.length;
      return entry;
    };
    const emptyGeometry = () => ({ verts: [], faces: [], lines: [], castShadow: false, cutawayCap: true });
    // All scratch belongs to this visit. Polygon generation only runs when a
    // slice or its authored cut region changes, never during a steady camera.
    const emit = (geometry, points, count, color, region) => {
      if (count < 3) return;
      if (points !== polygon) for (let i = 0; i < count * 2; i++) polygon[i] = points[i];
      let input = polygon, output = clipped;
      if (region) for (let side = 0; side < 4 && count >= 3; side++) {
        const sign = side & 1 ? -1 : 1;
        const nx = (side < 2 ? region.cos : region.sin) * sign, nz = (side < 2 ? -region.sin : region.cos) * sign;
        const limit = (side < 2 ? region.halfWidth : region.halfDepth) + region.x * nx + region.z * nz;
        let written = 0;
        for (let i = 0; i < count; i++) {
          const j = (i + 1) % count, ax = input[i * 2], az = input[i * 2 + 1], bx = input[j * 2], bz = input[j * 2 + 1];
          const a = limit - ax * nx - az * nz, b = limit - bx * nx - bz * nz;
          if (a >= -EPS) { output[written++] = ax; output[written++] = az; }
          if ((a < -EPS) !== (b < -EPS)) { const t = a / (a - b); output[written++] = ax + (bx - ax) * t; output[written++] = az + (bz - az) * t; }
        }
        count = written / 2;
        const swap = input; input = output; output = swap;
      }
      if (count < 3) return;
      let area = 0;
      for (let i = 0; i < count; i++) { const j = (i + 1) % count; area += input[i * 2] * input[j * 2 + 1] - input[j * 2] * input[i * 2 + 1]; }
      if (Math.abs(area) < EPS * EPS) return;
      const first = geometry.verts.length / 3;
      for (let i = 0; i < count; i++) { const k = area < 0 ? i : count - 1 - i; geometry.verts.push(input[k * 2], 0, input[k * 2 + 1]); }
      if (count === 4) geometry.faces.push({ i: [first, first + 1, first + 2, first + 3], color, emissive: 0 });
      else for (let i = 1; i < count - 1; i++) geometry.faces.push({ i: [first, first + i, first + i + 1], color, emissive: 0 });
    };
    const buildSolid = (layer, region) => {
      const geometry = emptyGeometry();
      stats.solidBuilds++;
      if (layer < 0 || layer >= sy) return geometry;
      let x0 = 0, x1 = sx, z0 = 0, z1 = sz;
      if (region) {
        const rx = Math.abs(region.cos) * region.halfWidth + Math.abs(region.sin) * region.halfDepth, rz = Math.abs(region.sin) * region.halfWidth + Math.abs(region.cos) * region.halfDepth;
        x0 = Math.max(0, Math.floor((region.x - rx - origin.x) / unit)); x1 = Math.min(sx, Math.ceil((region.x + rx - origin.x) / unit));
        z0 = Math.max(0, Math.floor((region.z - rz - origin.z) / unit)); z1 = Math.min(sz, Math.ceil((region.z + rz - origin.z) / unit));
      }
      mask.fill(0);
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) mask[x * sz + z] = data[(x * sy + layer) * sz + z];
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1;) {
        const at = x * sz + z, material = mask[at];
        if (!material) { z++; continue; }
        let width = 1, depth = 1;
        while (z + width < z1 && mask[at + width] === material) width++;
        for (; x + depth < x1; depth++) {
          let same = true;
          for (let k = 0; k < width; k++) if (mask[at + depth * sz + k] !== material) { same = false; break; }
          if (!same) break;
        }
        const left = origin.x + x * unit, right = left + depth * unit, front = origin.z + z * unit, back = front + width * unit;
        polygon[0] = left; polygon[1] = front; polygon[2] = left; polygon[3] = back; polygon[4] = right; polygon[5] = back; polygon[6] = right; polygon[7] = front;
        emit(geometry, polygon, 4, palette[material], region);
        for (let k = 0; k < depth; k++) mask.fill(0, at + k * sz, at + k * sz + width);
        z += width;
      }
      return geometry;
    };
    const buildDetail = (slice, region) => {
      const geometry = emptyGeometry(), y = slice * DETAIL_STEP - EPS;
      stats.detailBuilds++;
      // Window cuts retain convex fragments in otherwise empty voxels. Their
      // triangle edges yield a convex cross-section, including slanted reveals.
      for (let column = 0; column < windowColumns.length; column++) {
        const pieces = windowColumns[column];
        for (let p = 0; p < pieces.length; p++) {
          const piece = pieces[p];
          if (y < piece.minY || y >= piece.maxY) continue;
          const verts = piece.vertices, indices = piece.triangles.i;
          let count = 0;
          for (let t = 0; t < indices.length; t += 3) for (let edge = 0; edge < 3; edge++) {
            const a = indices[t + edge] * 3, b = indices[t + (edge + 1) % 3] * 3, ay = verts[a + 1], by = verts[b + 1];
            if ((ay <= y) === (by <= y)) continue;
            const mix = (y - ay) / (by - ay), x = verts[a] + (verts[b] - verts[a]) * mix, z = verts[a + 2] + (verts[b + 2] - verts[a + 2]) * mix;
            let duplicate = false;
            for (let i = 0; i < count; i++) if (Math.abs(polygon[i * 2] - x) < EPS && Math.abs(polygon[i * 2 + 1] - z) < EPS) { duplicate = true; break; }
            if (!duplicate && count < polygon.length / 2) { polygon[count * 2] = x; polygon[count * 2 + 1] = z; count++; }
          }
          if (count < 3) continue;
          for (let i = 1; i < count; i++) {
            const x = polygon[i * 2], z = polygon[i * 2 + 1]; let j = i;
            while (j > 0 && (polygon[(j - 1) * 2] > x || polygon[(j - 1) * 2] === x && polygon[(j - 1) * 2 + 1] > z)) { polygon[j * 2] = polygon[(j - 1) * 2]; polygon[j * 2 + 1] = polygon[(j - 1) * 2 + 1]; j--; }
            polygon[j * 2] = x; polygon[j * 2 + 1] = z;
          }
          let length = 0;
          for (let pass = 0; pass < 2; pass++) {
            const start = length;
            for (let i = 0; i < count; i++) {
              const k = pass ? count - 1 - i : i, x = polygon[k * 2], z = polygon[k * 2 + 1];
              while (length >= start + 2 && (hull[(length - 1) * 2] - hull[(length - 2) * 2]) * (z - hull[(length - 2) * 2 + 1]) - (hull[(length - 1) * 2 + 1] - hull[(length - 2) * 2 + 1]) * (x - hull[(length - 2) * 2]) <= EPS * EPS) length--;
              hull[length * 2] = x; hull[length * 2 + 1] = z; length++;
            }
            length--;
          }
          emit(geometry, hull, length, piece.color, region);
        }
      }
      // Smooth stair/ramp tops bridge carved voxel steps. Cap the exact part of
      // each triangular prism below its top, never the traversable void above it.
      for (let layer = 0; layer < rampColumns.length; layer++) {
        const { info, columns } = rampColumns[layer], verts = source.rampGeometry.verts, faces = source.rampGeometry.faces;
        for (let i = 0; i < columns.length; i++) {
          const column = columns[i];
          const range = info.ranges[column];
          if (!range || y < (((info.cavities[column] >> 4) & 63) - info.offset) * unit) continue;
          for (let n = 0; n < (range & 3); n++) {
            const face = faces[source.rampFaceOffset + (range >>> 2) + n]; let count = 0;
            for (let edge = 0; edge < 3; edge++) {
              const a = face.i[edge] * 3, b = face.i[(edge + 1) % 3] * 3, ay = verts[a + 1], by = verts[b + 1];
              if (ay > y) { polygon[count * 2] = verts[a]; polygon[count * 2 + 1] = verts[a + 2]; count++; }
              if ((ay > y) !== (by > y)) { const mix = (y - ay) / (by - ay); polygon[count * 2] = verts[a] + (verts[b] - verts[a]) * mix; polygon[count * 2 + 1] = verts[a + 2] + (verts[b + 2] - verts[a + 2]) * mix; count++; }
            }
            emit(geometry, polygon, count, face.color, region);
          }
        }
      }
      return geometry;
    };
    const update = (cutY, region = null) => {
      node.visible = Number.isFinite(cutY) && cutY > origin.y && cutY < origin.y + sy * unit;
      if (!node.visible) return cutY;
      node.position.y = cutY - 0.002;
      const layer = Math.floor((cutY - origin.y - EPS) / unit);
      if (!currentSolid || currentSolid.key !== layer || !sameRegion(currentSolid.region, region)) currentSolid = lookup(solidCache, layer, region) || remember(solidCache, layer, region, buildSolid(layer, region));
      solid.geometry = currentSolid.geometry;
      if (source.windows || source.rampLayers) {
        const slice = Math.floor((cutY + EPS) / DETAIL_STEP);
        if (!currentDetail || currentDetail.key !== slice || !sameRegion(currentDetail.region, region)) currentDetail = lookup(detailCache, slice, region) || remember(detailCache, slice, region, buildDetail(slice, region));
        detail.geometry = currentDetail.geometry;
      }
      stats.faces = solid.geometry.faces.length + (detail.geometry ? detail.geometry.faces.length : 0);
      return cutY;
    };
    const dispose = () => {
      for (const entry of solidCache) releaseGeometry(entry.geometry);
      for (const entry of detailCache) releaseGeometry(entry.geometry);
      solidCache.length = detailCache.length = 0; currentSolid = currentDetail = null;
      solid.geometry = detail.geometry = null; node.visible = false; stats.cacheEntries = stats.faces = 0;
    };
    return { node, update, dispose, stats };
  };
  BL.terrainCutaway = { create };
})();
