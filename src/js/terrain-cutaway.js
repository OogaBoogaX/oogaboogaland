// Render-only horizontal sections of terrain. Solid voxels fill the island's
// actual outline; carved rooms, windows and shafts stay open. No collision data
// or authored mesh is changed. Each visit retains at most eight slices per pass.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const CACHE_CAP = 8, DETAIL_STEP = 0.05, EPS = 1e-7;
  const pathChannel = (key, state) => {
    if (!key || !state) return -1;
    for (let channel = 0; channel < 4; channel++) {
      const station = key >>> (channel * 8) & 255;
      if (station && state.mix[channel] > 0 && station >= state.lo[channel] && station <= state.hi[channel]) return channel;
    }
    return -1;
  };
  // Architectural fragments occupy only a few columns. Index them once per read-only source so
  // a moving slice never scans the whole island for each detail-height step, nor each section for each source.
  const COLUMNS = new WeakMap();
  const columnsOf = (source) => {
    let index = COLUMNS.get(source);
    if (index) return index;
    const windowColumns = [], rampColumns = [];
    if (source.windows) for (let column = 0; column < source.windows.length; column++) {
      const pieces = source.windows[column];
      if (pieces && pieces.length) windowColumns.push({ column, pieces });
    }
    if (source.rampLayers) for (let layer = 0; layer < source.rampLayers.length; layer++) {
      const info = source.rampLayers[layer], columns = [];
      for (let column = 0; column < info.ranges.length; column++) if (info.ranges[column]) columns.push(column);
      rampColumns.push({ info, columns });
    }
    index = { windowColumns, rampColumns };
    COLUMNS.set(source, index);
    return index;
  };
  const create = (source, releaseGeometry = () => {}) => {
    const node = createNode({ visible: false }), solid = createNode(), detail = createNode();
    const pathNodes = source.cutawayPaths ? Array.from({ length: 4 }, () => createNode()) : [];
    const detailPathNodes = source.cutawayPaths ? Array.from({ length: 4 }, () => createNode()) : [];
    addChild(node, solid, detail, ...pathNodes, ...detailPathNodes);
    const { data, sx, sy, sz, unit, origin, palette } = source;
    const detailStride = Math.ceil(sy * unit / DETAIL_STEP) + 1;
    const mask = new Uint8Array(sx * sz), polygon = new Float64Array(512), clipped = new Float64Array(512), hull = new Float64Array(1024);
    const { windowColumns, rampColumns } = columnsOf(source);
    const solidCache = [], detailCache = [];
    const stats = { solidBuilds: 0, detailBuilds: 0, cacheEntries: 0, faces: 0 };
    let generation = 0, currentSolid = null, currentDetail = null;
    const sameRegion = (a, b) => !a || !b ? !a && !b : a.id === b.id && a.x === b.x && a.z === b.z && a.cos === b.cos && a.sin === b.sin && a.halfWidth === b.halfWidth && a.halfDepth === b.halfDepth;
    const releaseCached = (geometry) => {
      if (geometry?.base) {
        releaseGeometry(geometry.base);
        for (let i = 0; i < geometry.paths.length; i++) releaseGeometry(geometry.paths[i]);
      } else releaseGeometry(geometry);
    };
    const lookup = (cache, key, region) => {
      for (let i = 0; i < cache.length; i++) if (cache[i].key === key && sameRegion(cache[i].region, region)) { cache[i].used = ++generation; return cache[i]; }
      return null;
    };
    const remember = (cache, key, region, geometry) => {
      const entry = { key, region: region ? { ...region } : null, geometry, used: ++generation };
      if (cache.length === CACHE_CAP) {
        let oldest = 0;
        for (let i = 1; i < cache.length; i++) if (cache[i].used < cache[oldest].used) oldest = i;
        releaseCached(cache[oldest].geometry); cache[oldest] = entry;
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
    const buildSolid = (layer, region, pathState) => {
      const geometry = emptyGeometry(), paths = pathNodes.map(emptyGeometry);
      stats.solidBuilds++;
      if (layer < 0 || layer >= sy) return { base: geometry, paths };
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
        const key = source.cutawayPaths?.keys[at] || 0, channel = region ? -1 : pathChannel(key, pathState);
        let width = 1, depth = 1;
        while (z + width < z1 && mask[at + width] === material
          && (region || pathChannel(source.cutawayPaths?.keys[at + width] || 0, pathState) === channel)) width++;
        for (; x + depth < x1; depth++) {
          let same = true;
          for (let k = 0; k < width; k++) if (mask[at + depth * sz + k] !== material
            || !region && pathChannel(source.cutawayPaths?.keys[at + depth * sz + k] || 0, pathState) !== channel) { same = false; break; }
          if (!same) break;
        }
        const left = origin.x + x * unit, right = left + depth * unit, front = origin.z + z * unit, back = front + width * unit;
        polygon[0] = left; polygon[1] = front; polygon[2] = left; polygon[3] = back; polygon[4] = right; polygon[5] = back; polygon[6] = right; polygon[7] = front;
        emit(channel < 0 ? geometry : paths[channel], polygon, 4, palette[material], region);
        for (let k = 0; k < depth; k++) mask.fill(0, at + k * sz, at + k * sz + width);
        z += width;
      }
      return { base: geometry, paths };
    };
    const buildDetail = (slice, region, pathState) => {
      const geometry = emptyGeometry(), paths = detailPathNodes.map(emptyGeometry), y = slice * DETAIL_STEP - EPS;
      stats.detailBuilds++;
      // Window cuts retain convex fragments in otherwise empty voxels. Their
      // triangle edges yield a convex cross-section, including slanted reveals.
      for (let entry = 0; entry < windowColumns.length; entry++) {
        const { column, pieces } = windowColumns[entry];
        const bottom = source.cutawayPaths?.bottoms[column];
        // Only a section through removable rock above the authored tunnel
        // ceiling follows the path fade. Sills and side reveals at or below
        // that ceiling remain physical base geometry.
        const channel = !region && Number.isFinite(bottom) && y > bottom + EPS
          ? pathChannel(source.cutawayPaths?.keys[column] || 0, pathState) : -1;
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
          emit(channel < 0 ? geometry : paths[channel], hull, length, piece.color, region);
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
      return { base: geometry, paths };
    };
    const update = (cutY, region = null, pathState = null) => {
      node.visible = Number.isFinite(cutY) && cutY > origin.y && cutY < origin.y + sy * unit;
      if (!node.visible) return cutY;
      node.position.y = cutY - 0.002;
      const layer = Math.floor((cutY - origin.y - EPS) / unit);
      const solidKey = layer + (!region && pathState ? pathState.version * sy : 0);
      if (!currentSolid || currentSolid.key !== solidKey || !sameRegion(currentSolid.region, region)) currentSolid = lookup(solidCache, solidKey, region) || remember(solidCache, solidKey, region, buildSolid(layer, region, pathState));
      solid.geometry = currentSolid.geometry.base;
      for (let channel = 0; channel < pathNodes.length; channel++) {
        const path = pathNodes[channel], geometry = currentSolid.geometry.paths[channel], opacity = 1 - (pathState?.mix[channel] || 0);
        path.geometry = geometry;
        path.smokeOpacity = opacity;
        path.visible = geometry.faces.length > 0 && opacity > 0;
      }
      if (source.windows || source.rampLayers) {
        const slice = Math.floor((cutY + EPS) / DETAIL_STEP);
        const detailKey = slice + (!region && pathState ? pathState.version * detailStride : 0);
        if (!currentDetail || currentDetail.key !== detailKey || !sameRegion(currentDetail.region, region)) currentDetail = lookup(detailCache, detailKey, region) || remember(detailCache, detailKey, region, buildDetail(slice, region, pathState));
        detail.geometry = currentDetail.geometry.base;
        for (let channel = 0; channel < detailPathNodes.length; channel++) {
          const path = detailPathNodes[channel], geometry = currentDetail.geometry.paths[channel], opacity = 1 - (pathState?.mix[channel] || 0);
          path.geometry = geometry;
          path.smokeOpacity = opacity;
          path.visible = geometry.faces.length > 0 && opacity > 0;
        }
      }
      stats.faces = solid.geometry.faces.length + (detail.geometry ? detail.geometry.faces.length : 0);
      for (let channel = 0; channel < pathNodes.length; channel++) stats.faces += pathNodes[channel].geometry.faces.length + (detailPathNodes[channel].geometry?.faces.length || 0);
      return cutY;
    };
    const dispose = () => {
      for (const entry of solidCache) releaseCached(entry.geometry);
      for (const entry of detailCache) releaseGeometry(entry.geometry);
      solidCache.length = detailCache.length = 0; currentSolid = currentDetail = null;
      solid.geometry = detail.geometry = null;
      for (let channel = 0; channel < pathNodes.length; channel++) pathNodes[channel].geometry = detailPathNodes[channel].geometry = null;
      node.visible = false; stats.cacheEntries = stats.faces = 0;
    };
    return { node, update, dispose, stats };
  };
  // Split the authored ramp-ceiling columns out of the island render mesh and
  // gate the lower ramp's smooth render floor behind its real cover. Collision,
  // sight queries and every caller that owns the canonical geometry continue
  // to see the original arrays unchanged; ordinary faces below a tunnel ceiling
  // remain in the stable base mesh.
  const createRampRoof = (source, canonicalGeometry, releaseGeometry = () => {}) => {
    const paths = source?.cutawayPaths;
    const birdseyeWindows = source?.birdseyeWindows;
    const makeGeometry = (template = canonicalGeometry) => ({ ...template, verts: template.verts, faces: [], lines: [] });
    const baseGeometry = makeGeometry(), keptGeometry = makeGeometry();
    const cutGeometry = Array.from({ length: 4 }, () => makeGeometry());
    const lowerFloorGeometry = Array.from({ length: 2 }, () => makeGeometry());
    const windowRoofGeometry = Array.from({ length: birdseyeWindows?.levels || 0 }, () => makeGeometry());
    // Ordinary terrain geometry on purpose: the renderer's global cut plane
    // continues to clip these newly exposed walls just like the island.
    const perimeterGeometry = Array.from({ length: 4 }, () => ({ verts: [], faces: [], lines: [], castShadow: false }));
    // boundsOf caches by geometry identity. Seed every mutable perimeter with
    // the complete source bounds so reusing its arrays cannot leave a later
    // station range outside an earlier cached cull sphere. These vertices are
    // deliberately unreferenced by faces.
    const boundVerts = [source.origin.x, source.origin.y, source.origin.z,
      source.origin.x + source.sx * source.unit, source.origin.y + source.sy * source.unit, source.origin.z + source.sz * source.unit];
    for (let channel = 0; channel < 4; channel++) perimeterGeometry[channel].verts.push(...boundVerts);
    const node = createNode(), keptNode = createNode({ geometry: keptGeometry });
    const cutNodes = cutGeometry.map((geometry) => createNode({ geometry }));
    const lowerFloorNodes = lowerFloorGeometry.map((geometry) => createNode({ geometry }));
    const perimeterNodes = perimeterGeometry.map((geometry) => createNode({ geometry, visible: false }));
    const windowRoofNodes = windowRoofGeometry.map((geometry) => createNode({ geometry }));
    addChild(node, keptNode, ...cutNodes, ...lowerFloorNodes, ...windowRoofNodes, ...perimeterNodes);
    const removable = [], lowerFloorFaces = [];
    // Low byte is the station and the next two bits are the owning channel.
    // Zero remains the no-path sentinel, so hot rebuilds need no object result.
    const pathPart = (key) => {
      for (let channel = 0; channel < 4; channel++) {
        const station = key >>> (channel * 8) & 255;
        if (station) return station | channel << 8;
      }
      return 0;
    };
    const aboveCeiling = (face) => {
      const bottom = face.cutawayPathBottom;
      if (!face.cutawayPathKey || !Number.isFinite(bottom)) return false;
      let above = false;
      for (let i = 0; i < face.i.length; i++) {
        const y = canonicalGeometry.verts[face.i[i] * 3 + 1];
        if (y < bottom - EPS) return false;
        if (y > bottom + EPS) above = true;
      }
      return above;
    };
    const windowRoofLevel = (face) => {
      const mask = face.cutawayWindowMask || 0, column = face.cutawayWindowColumn;
      if (!mask || column < 0 || !birdseyeWindows) return -1;
      for (let level = 0; level < birdseyeWindows.levels; level++) {
        if (!(mask & 1 << level)) continue;
        const top = birdseyeWindows.tops[level * birdseyeWindows.mask.length + column];
        if (!Number.isFinite(top)) continue;
        let above = false, clear = true;
        for (let i = 0; i < face.i.length; i++) {
          const y = canonicalGeometry.verts[face.i[i] * 3 + 1];
          if (y < top - EPS) { clear = false; break; }
          if (y > top + EPS) above = true;
        }
        if (clear && above) return level;
      }
      return -1;
    };
    for (let i = 0; i < canonicalGeometry.faces.length; i++) {
      const face = canonicalGeometry.faces[i];
      if (face.cutawayFloorChannel >= 2 && face.cutawayFloorChannel < 4 && face.cutawayFloorStation) {
        lowerFloorFaces.push({ face, channel: face.cutawayFloorChannel, station: face.cutawayFloorStation });
        continue;
      }
      const windowLevel = windowRoofLevel(face);
      if (windowLevel >= 0) { windowRoofGeometry[windowLevel].faces.push(face); continue; }
      const part = aboveCeiling(face) && pathPart(face.cutawayPathKey);
      if (part) removable.push({ face, channel: part >>> 8, station: part & 255 });
      else baseGeometry.faces.push(face);
    }
    // Lines are not path-tagged. They remain on the stable base mesh exactly
    // once, while split face meshes share the immutable canonical vertices.
    baseGeometry.lines = canonicalGeometry.lines || [];
    const partitionGeometries = [baseGeometry, keptGeometry, ...cutGeometry, ...lowerFloorGeometry, ...windowRoofGeometry];
    const geometries = [...partitionGeometries, ...perimeterGeometry];
    // 256 is the scene's sentinel for a route already consumed by the global
    // horizontal scan; eight bits would wrap it to zero and reopen the route.
    const lastLo = new Uint16Array(4), lastHi = new Uint16Array(4), lastFloorOpen = new Uint8Array(2);
    const activeCells = paths ? new Uint8Array(paths.width * paths.height) : null;
    let pathCellCount = 0;
    if (paths) for (let cell = 0; cell < paths.keys.length; cell++) if (paths.keys[cell]) pathCellCount++;
    const pathCells = new Uint32Array(pathCellCount), pathOwners = new Uint16Array(pathCellCount);
    const directionX = new Int8Array([-1, 1, 0, 0]), directionZ = new Int8Array([0, 0, -1, 1]);
    if (paths) for (let cell = 0, written = 0; cell < paths.keys.length; cell++) {
      const part = pathPart(paths.keys[cell]);
      if (!part) continue;
      pathCells[written] = cell; pathOwners[written++] = part;
    }
    const stats = { baseFaces: baseGeometry.faces.length, removableFaces: removable.length, keptFaces: 0,
      cutFaces: new Uint32Array(4), lowerFloorFaces: new Uint32Array(2), windowRoofFaces: new Uint32Array(windowRoofGeometry.map(geometry => geometry.faces.length)), perimeterFaces: new Uint32Array(4), rebuilds: 0 };
    let initialized = false, disposed = false, lastActive = false;
    const selected = (channel, station) => station >= lastLo[channel] && station <= lastHi[channel];
    const releaseMutable = () => {
      releaseGeometry(keptGeometry);
      for (let channel = 0; channel < 4; channel++) {
        releaseGeometry(cutGeometry[channel]);
        releaseGeometry(perimeterGeometry[channel]);
      }
      for (let floor = 0; floor < 2; floor++) releaseGeometry(lowerFloorGeometry[floor]);
    };
    const clearMutable = () => {
      keptGeometry.faces.length = 0;
      stats.keptFaces = 0;
      for (let channel = 0; channel < 4; channel++) {
        cutGeometry[channel].faces.length = 0;
        perimeterGeometry[channel].verts.length = boundVerts.length;
        perimeterGeometry[channel].faces.length = 0;
        stats.cutFaces[channel] = stats.perimeterFaces[channel] = 0;
      }
      for (let floor = 0; floor < 2; floor++) lowerFloorGeometry[floor].faces.length = stats.lowerFloorFaces[floor] = 0;
    };
    const appendPerimeter = (geometry, x, z, edge, y0, y1, color) => {
      const left = paths.origin.x + x * paths.unit, right = left + paths.unit;
      const front = paths.origin.z + z * paths.unit, back = front + paths.unit;
      const first = geometry.verts.length / 3;
      if (edge === 0) geometry.verts.push(left, y0, front, left, y1, front, left, y1, back, left, y0, back);
      else if (edge === 1) geometry.verts.push(right, y0, front, right, y0, back, right, y1, back, right, y1, front);
      else if (edge === 2) geometry.verts.push(left, y0, front, right, y0, front, right, y1, front, left, y1, front);
      else geometry.verts.push(left, y0, back, left, y1, back, right, y1, back, right, y0, back);
      geometry.faces.push({ i: [first, first + 1, first + 2, first + 3], color, emissive: 0, cutawayRampWall: true });
    };
    const rebuild = () => {
      releaseMutable();
      clearMutable();
      for (let i = 0; i < removable.length; i++) {
        const entry = removable[i];
        if (selected(entry.channel, entry.station)) cutGeometry[entry.channel].faces.push(entry.face);
        else keptGeometry.faces.push(entry.face);
      }
      for (let i = 0; i < lowerFloorFaces.length; i++) {
        const entry = lowerFloorFaces[i], floor = entry.channel - 2;
        // Outside bird's-eye every physical face is present. During a cut,
        // reveal only the prefix whose cover the global scan has consumed, or
        // a local section after its matching roof has become fully transparent.
        if (!lastActive || entry.station < lastLo[entry.channel]
          || lastFloorOpen[floor] && selected(entry.channel, entry.station)) lowerFloorGeometry[floor].faces.push(entry.face);
      }
      if (paths) {
        activeCells.fill(0);
        for (let i = 0; i < pathCells.length; i++) {
          const part = pathOwners[i], channel = part >>> 8;
          if (selected(channel, part & 255)) activeCells[pathCells[i]] = channel + 1;
        }
        const { data, sx, sy, sz, unit, origin, palette } = source;
        // Removed rock is the solid part of an active authored column at or
        // above its recorded cave ceiling. Add a wall only where that removal
        // exposes an actual solid voxel in the adjacent, retained column.
        for (let i = 0; i < pathCells.length; i++) {
          const cell = pathCells[i], owner = activeCells[cell];
          if (!owner) continue;
          const x = Math.floor(cell / sz), z = cell - x * sz;
          const channel = owner - 1, bottom = paths.bottoms[cell];
          if (!Number.isFinite(bottom)) continue;
          const firstLayer = Math.max(0, Math.round((bottom - origin.y) / unit));
          for (let edge = 0; edge < 4; edge++) {
            const nx = x + directionX[edge], nz = z + directionZ[edge];
            if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
            const neighbor = nx * sz + nz, neighborBottom = paths.bottoms[neighbor];
            if (activeCells[neighbor] && neighborBottom <= bottom + EPS) continue;
            let runStart = -1, runMaterial = 0;
            for (let y = firstLayer; y <= sy; y++) {
              let material = 0;
              if (y < sy && data[(x * sy + y) * sz + z]) {
                const adjacent = data[(nx * sy + y) * sz + nz];
                const adjacentRemoved = activeCells[neighbor] && Number.isFinite(neighborBottom)
                  && origin.y + y * unit >= neighborBottom - EPS;
                if (adjacent && !adjacentRemoved) material = adjacent;
              }
              if (material === runMaterial) continue;
              if (runMaterial) appendPerimeter(perimeterGeometry[channel], x, z, edge,
                origin.y + runStart * unit, origin.y + y * unit, palette[runMaterial]);
              runStart = material ? y : -1;
              runMaterial = material;
            }
          }
        }
      }
      keptNode.visible = keptGeometry.faces.length > 0;
      stats.keptFaces = keptGeometry.faces.length;
      for (let channel = 0; channel < 4; channel++) {
        stats.cutFaces[channel] = cutGeometry[channel].faces.length;
        stats.perimeterFaces[channel] = perimeterGeometry[channel].faces.length;
      }
      for (let floor = 0; floor < 2; floor++) {
        lowerFloorNodes[floor].visible = lowerFloorGeometry[floor].faces.length > 0;
        stats.lowerFloorFaces[floor] = lowerFloorGeometry[floor].faces.length;
      }
      stats.rebuilds++;
    };
    const update = (state) => {
      if (disposed) return;
      let changed = !initialized;
      const active = !!state?.active;
      if (lastActive !== active) changed = true;
      lastActive = active;
      for (let channel = 0; channel < 4; channel++) {
        const lo = state?.lo?.[channel] || 0, hi = state?.hi?.[channel] || 0;
        if (lastLo[channel] !== lo || lastHi[channel] !== hi) changed = true;
        lastLo[channel] = lo; lastHi[channel] = hi;
      }
      for (let floor = 0; floor < 2; floor++) {
        const open = (state?.mix?.[floor + 2] || 0) >= 1 - EPS ? 1 : 0;
        if (lastFloorOpen[floor] !== open) changed = true;
        lastFloorOpen[floor] = open;
      }
      if (changed) { rebuild(); initialized = true; }
      for (let channel = 0; channel < 4; channel++) {
        const mix = Math.max(0, Math.min(1, state?.mix?.[channel] || 0));
        cutNodes[channel].smokeOpacity = 1 - mix;
        // A camera cutaway must not also erase the roof from the light's
        // shadow pass. At zero camera opacity collect() keeps this node out of
        // the colour draw while the shadow renderer can still use it.
        cutNodes[channel].visible = cutGeometry[channel].faces.length > 0;
        perimeterNodes[channel].smokeOpacity = mix;
        perimeterNodes[channel].visible = perimeterGeometry[channel].faces.length > 0 && mix > 0;
      }
      for (let level = 0; level < windowRoofNodes.length; level++) {
        const mix = Math.max(0, Math.min(1, state?.windowMix?.[level] || 0)), window = windowRoofNodes[level];
        window.smokeOpacity = 1 - mix;
        window.visible = windowRoofGeometry[level].faces.length > 0;
      }
    };
    const dispose = () => {
      if (disposed) return;
      releaseGeometry(baseGeometry);
      releaseMutable();
      baseGeometry.faces.length = keptGeometry.faces.length = removable.length = lowerFloorFaces.length = 0;
      for (let level = 0; level < windowRoofGeometry.length; level++) {
        releaseGeometry(windowRoofGeometry[level]);
        windowRoofGeometry[level].faces.length = 0;
        windowRoofNodes[level].geometry = null;
      }
      for (let channel = 0; channel < 4; channel++) {
        cutGeometry[channel].faces.length = 0;
        perimeterGeometry[channel].verts.length = perimeterGeometry[channel].faces.length = 0;
        cutNodes[channel].geometry = perimeterNodes[channel].geometry = null;
      }
      for (let floor = 0; floor < 2; floor++) {
        lowerFloorGeometry[floor].faces.length = 0;
        lowerFloorNodes[floor].geometry = null;
      }
      keptNode.geometry = null; node.visible = false; disposed = true;
    };
    update(null);
    return { node, baseGeometry, geometries, partitionGeometries, lowerFloorGeometry, perimeterGeometry, exclude: geometries, update, dispose, stats };
  };
  BL.terrainCutaway = { create, createRampRoof };
})();
