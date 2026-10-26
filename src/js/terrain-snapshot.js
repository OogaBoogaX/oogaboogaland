// Rehydrates an explicit terrain data snapshot; no serialized functions, evaluation or source strings.
// Query source SHA256: 335193f3d7566939ff20d3b1cbbd5548c48fbabebf25bb039e29b06ef9034045
(() => {
  "use strict";
  const BL = window.BL;
  const { clamp } = BL.math;
  const validate = state => {
    const c = state?.constants;
    if (state?.version !== 1 || c?.SX !== 248 || c?.SY !== 156 || c?.SZ !== 248 || c?.UNIT !== 0.25) throw new Error("Unknown terrain snapshot");
    const columns = c.SX * c.SZ, cells = columns * c.SY;
    const arrays = { gridData: [Uint8Array, cells], cavities: [Uint16Array, columns], lowerCavities: [Uint16Array, columns],
      basementCavities: [Uint16Array, columns], basementCells: [Uint8Array, columns], basementCollision: [Uint32Array, columns],
      basementHeights: [Float32Array, (c.SX + 1) * (c.SZ + 1)], rampCells: [Uint8Array, columns],
      rampHeights: [Float32Array, (c.SX + 1) * (c.SZ + 1)], rampCollision: [Uint32Array, columns], frontageCells: [Uint8Array, columns],
      height: [Float32Array, columns], surface: [Float32Array, columns], land: [Uint8Array, columns], meadow: [Uint8Array, columns],
      birdseyeWindowMask: [Uint8Array, columns], birdseyeWindowTops: [Float32Array, columns * 2],
      birdseyeWindowCeilings: [Float32Array, 2], sightColumnWork: [Uint8Array, columns] };
    for (const [name, [Type, count]] of Object.entries(arrays)) if (!(state[name] instanceof Type) || state[name].length !== count) throw new Error(`Invalid terrain ${name}`);
    if (!Array.isArray(state.windowColumns) || state.windowColumns.length !== columns || !(state.geometry?.verts instanceof Float64Array)
      || state.geometry.verts.length % 3 || !Array.isArray(state.geometry.faces) || state.geometry.faces.length > 200000) throw new Error("Invalid terrain geometry");
    const vertices = state.geometry.verts.length / 3;
    for (const face of state.geometry.faces) if (!Array.isArray(face.i) || face.i.length < 3 || face.i.length > 72
      || !face.i.every(i => Number.isInteger(i) && i >= 0 && i < vertices)) throw new Error("Invalid terrain face");
    if (!(state.windowSightPlanes instanceof Float64Array) || state.windowSightPlanes.length % 4
      || !(state.windowSightRefs instanceof Uint32Array) || !(state.rampSight instanceof Float64Array) || state.rampSight.length % 17
      || !Array.isArray(state.rockCaves?.regions) || !Array.isArray(state.headquartersRamps) || !Array.isArray(state.headquartersRooms)
      || !Array.isArray(state.headquartersWindows) || !Array.isArray(state.mouths) || !Array.isArray(state.masterList)
      || !Array.isArray(state.basement?.ramps) || !Array.isArray(state.basement?.rooms) || !state.basement.hole) throw new Error("Invalid terrain query data");
    for (const pieces of state.windowColumns) if (pieces) for (const piece of pieces) {
      if (!(piece.vertices instanceof Float64Array) || piece.vertices.length % 3 || !(piece.triangles?.i instanceof Uint16Array)
        || piece.triangles.i.length % 3 || !piece.triangles.i.every(i => i < piece.vertices.length / 3)) throw new Error("Invalid terrain window");
    }
    for (const region of state.rockCaves.regions) if (!(region.data instanceof Uint8Array) || ![region.x, region.y, region.z, region.sx, region.sy, region.sz].every(Number.isInteger)
      || region.x < 0 || region.y < 0 || region.z < 0 || region.x + region.sx > c.SX || region.y + region.sy > c.SY || region.z + region.sz > c.SZ
      || region.data.length !== region.sx * region.sy * region.sz) throw new Error("Invalid terrain cave ownership");
    const paths = state.cutawayPaths;
    if (!(paths?.keys instanceof Uint32Array) || paths.keys.length !== columns || !(paths.bottoms instanceof Float32Array) || paths.bottoms.length !== columns
      || !(paths.lengths instanceof Float32Array) || paths.lengths.length !== 4 || !(paths.initial instanceof Uint8Array) || paths.initial.length !== 4
      || !(paths.bottomByStation instanceof Float32Array) || paths.bottomByStation.length !== 1024) throw new Error("Invalid terrain cutaway paths");
    // Native structured clone is the codec. Reject executable/accessor-bearing graphs and cap malformed records.
    const pending = [state], seen = new Set(), buffers = new Set(); let bytes = 0;
    while (pending.length) {
      const value = pending.pop();
      if (typeof value === "function" || typeof value === "symbol") throw new Error("Executable terrain snapshot");
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value); if (seen.size > 1000000) throw new Error("Oversized terrain snapshot");
      if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        const buffer = value instanceof ArrayBuffer ? value : value.buffer;
        if (!buffers.has(buffer)) { buffers.add(buffer); bytes += buffer.byteLength; } continue;
      }
      if (Array.isArray(value) && value.length > 2000000) throw new Error("Oversized terrain array");
      for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || descriptor.get || descriptor.set) throw new Error("Terrain accessor");
        pending.push(descriptor.value);
      }
    }
    if (bytes > 64 * 1024 * 1024) throw new Error("Oversized terrain buffers");
    return bytes;
  };
  const create = state => {
    validate(state);
    const { UNIT, SX, SY, SZ, PX, PZ, SURFACE, ORIGIN, RADIUS, MEADOW, DEPTH, RING_HALF, PATH_UNIT, PATH_CAPACITY, PATH_LIFT, GATE_Z, PASS_HALF, STAIR_TERRACE, TIMECHAIN, TIMECHAIN_X, TIMECHAIN_Z, POOL_APPROACH, POOL_X, POOL_Z, P, PALETTE, PATH_TILE, UNDER_SPHERE_CENTER, UNDER_SPHERE_RADIUS, HEADQUARTERS_CAVE, HEADQUARTERS_FLOOR, HEADQUARTERS_CEILING, HEADQUARTERS_HEIGHT, HEADQUARTERS_ROCK, HEADQUARTERS_ROOM } = state.constants;
    const { cavities, lowerCavities, basementCavities, basementCells, basementHeights, basementCollision, rampCells, rampHeights, rampCollision, frontageCells, height, surface, land, meadow, windowColumns, windowSightPlanes, windowSightRefs, headquartersRamps, headquartersRooms, headquartersWindows, headquartersGallery, headquartersBalconies, headquartersFronts, cutawayPaths, birdseyeWindowMask, birdseyeWindowTops, birdseyeWindowCeilings, geometry, roofOpening, rampFaceOffset, rockCaves, rampSight, sightColumnWork, masterList, masterPathCount, masterPathHash, centerlines, mouths, windowFragmentCount } = state;
    const basement = { ...state.basement, hole: { ...state.basement.hole } }, basementHole = basement.hole;
    basementHole.contains = (x, z) => {
      const dx = (Math.floor((x - ORIGIN.x) / UNIT) + 0.5) * UNIT + ORIGIN.x - basementHole.x;
      const dz = (Math.floor((z - ORIGIN.z) / UNIT) + 0.5) * UNIT + ORIGIN.z - basementHole.z;
      return dx * dx + dz * dz < basementHole.radius * basementHole.radius;
    };
    const data = state.gridData, inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
    const index = (x, y, z) => (x * SY + y) * SZ + z;
    const grid = { data, sx: SX, sy: SY, sz: SZ, index,
      get: (x, y, z) => inside(x, y, z) ? data[index(x, y, z)] : 0,
      has: (x, y, z) => inside(x, y, z) && data[index(x, y, z)] !== 0 };
    const paths = new Uint8Array(PX * PZ), pathData = new Float32Array(PATH_CAPACITY * 20);
    let pathCount = 0, pathVersion = 0, pathReflows = 0, ringPathCount = 0, visibleSpokeCount = 0;
    let requestedInner = 0, ringInner = 0, ringCenter = 0, ringOuter = 0, pathVisible = false;
    const { segmentBoxClear } = BL.terrain;

  const undersideDepthAt = (radius) => Math.max(0, UNDER_SPHERE_CENTER + Math.sqrt(Math.max(0, UNDER_SPHERE_RADIUS * UNDER_SPHERE_RADIUS - radius * radius)));
  const smooth = (t) => {
    const k = clamp(t, 0, 1);
    return k * k * (3 - 2 * k);
  };

    const column = (x, z) => {
      const gx = Math.floor((x - ORIGIN.x) / UNIT), gz = Math.floor((z - ORIGIN.z) / UNIT);
      return gx >= 0 && gz >= 0 && gx < SX && gz < SZ ? gx * SZ + gz : -1;
    };
    const rampFloorAt = (x, z) => {
      const px = (x - ORIGIN.x) / UNIT, pz = (z - ORIGIN.z) / UNIT;
      const gx = Math.floor(px), gz = Math.floor(pz), tx = px - gx, tz = pz - gz, i = gx * (SZ + 1) + gz;
      const ramp = headquartersRamps[rampCells[gx * SZ + gz] - 1], along = (x - ramp.from.x) * ramp.axis.x + (z - ramp.from.z) * ramp.axis.z;
      if (along <= 0) return 0;
      if (along < 0.75) return -along * ramp.slope;
      const a = rampHeights[i], b = rampHeights[i + 1], c = rampHeights[i + SZ + 2], d = rampHeights[i + SZ + 1];
      return tz >= tx ? a * (1 - tz) + b * (tz - tx) + c * tx : a * (1 - tx) + c * tz + d * (tx - tz);
    };
    const basementFloorAt = (x, z) => {
      if (basementHole.contains(x, z)) return -Infinity;
      const px = (x - ORIGIN.x) / UNIT, pz = (z - ORIGIN.z) / UNIT, gx = Math.floor(px), gz = Math.floor(pz);
      const cell = gx * SZ + gz;
      if (!basementCells[cell]) return (((basementCavities[cell] >> 4) & 63) - 64) * UNIT;
      const i = gx * (SZ + 1) + gz, tx = px - gx, tz = pz - gz;
      const a = basementHeights[i], b = basementHeights[i + 1], c = basementHeights[i + SZ + 2], d = basementHeights[i + SZ + 1];
      return tz >= tx ? a * (1 - tz) + b * (tz - tx) + c * tx : a * (1 - tx) + c * tz + d * (tx - tz);
    };
    const heightAt = (x, z) => {
      const i = column(x, z);
      return i < 0 ? 0 : rampCells[i] ? rampFloorAt(x, z) : lowerCavities[i] ? (((lowerCavities[i] >> 4) & 63) - 32) * UNIT : basementCavities[i] ? basementFloorAt(x, z) : height[i];
    };
    const surfaceAt = (x, z) => {
      const i = column(x, z);
      return i < 0 ? 0 : rampCells[i] ? Math.max(surface[i], rampFloorAt(x, z)) : surface[i];
    };
    // Pick the supporting run by height, shelves and window sills included; a rock column taller than maxStep
    // returns its own top so callers can reject it instead of falling back to the room below.
    const voxelSupportAt = (x, z, y = Infinity, maxStep = 0.6, emptyFloor = null) => {
      const i = column(x, z);
      if (i < 0 || !land[i]) return emptyFloor === null ? 0 : emptyFloor;
      if (y + maxStep < ORIGIN.y && emptyFloor !== null) return emptyFloor;
      if (y >= surface[i] - maxStep) return surfaceAt(x, z);
      const gx = Math.floor(i / SZ), gz = i % SZ, base = gx * SY * SZ + gz;
      let gy = clamp(Math.floor((y + maxStep - ORIGIN.y) / UNIT), 0, SY - 1);
      if (data[base + gy * SZ]) {
        while (gy < SY && data[base + gy * SZ]) gy++;
      } else {
        while (gy >= 0 && !data[base + gy * SZ]) gy--;
        if (gy < 0 && emptyFloor !== null) return emptyFloor;
        gy++;
      }
      const floor = (gy - SURFACE) * UNIT;
      if (basementCells[i] && y < ((basementCavities[i] >> 10) - 64) * UNIT) return Math.max(floor, basementFloorAt(x, z));
      const rampBase = (((lowerCavities[i] >> 4) & 63) - 32) * UNIT;
      return rampCells[i] && y + maxStep >= rampBase ? Math.max(floor, rampFloorAt(x, z)) : floor;
    };
    const windowPieceTop = (piece, x, z, radius, direction = 1) => {
      let top = -Infinity;
      for (let i = 0; i < piece.triangles.i.length; i += 3) top = Math.max(top, rampTriangleTop(piece.triangles, x, z, radius, direction, piece.vertices, i));
      return top;
    };
    const pointSupportAt = (x, z, y = Infinity, maxStep = 0.6, emptyFloor = null) => {
      let floor = voxelSupportAt(x, z, y, maxStep, emptyFloor);
      const pieces = windowColumns[column(x, z)];
      if (pieces) for (const piece of pieces) {
        if (piece.minY > y + maxStep || piece.maxY < floor) continue;
        const top = windowPieceTop(piece, x, z, 0), bottom = -windowPieceTop(piece, x, z, 0, -1);
        if (bottom <= y + maxStep + 1e-7) floor = Math.max(floor, top);
      }
      return floor;
    };
    // Exact circle/column overlap: corner-only contact is not a wall.
    const overlapsColumn = (x, z, radius2, gx, gz) => {
      const dx = Math.max(0, Math.abs((gx + 0.5) * UNIT + ORIGIN.x - x) - UNIT / 2);
      const dz = Math.max(0, Math.abs((gz + 0.5) * UNIT + ORIGIN.z - z) - UNIT / 2);
      return radius2 ? dx * dx + dz * dz < radius2 - 1e-12 : true;
    };
    // Keep feet on a discrete sill until the whole footprint clears its edge; ramps keep their continuous centre
    // height, only discrete rock and window sills raise the footprint above that slope.
    const supportAt = (x, z, y = Infinity, maxStep = 0.6, emptyFloor = null, radius = 0) => {
      let floor = pointSupportAt(x, z, y, maxStep, emptyFloor);
      if (!radius || floor > y + maxStep) return floor;
      const gx0 = Math.max(0, Math.floor((x - radius - ORIGIN.x) / UNIT)), gx1 = Math.min(SX - 1, Math.floor((x + radius - ORIGIN.x) / UNIT));
      const gz0 = Math.max(0, Math.floor((z - radius - ORIGIN.z) / UNIT)), gz1 = Math.min(SZ - 1, Math.floor((z + radius - ORIGIN.z) / UNIT));
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        if (!overlapsColumn(x, z, radius * radius, gx, gz)) continue;
        const cell = gx * SZ + gz, px = (gx + 0.5) * UNIT + ORIGIN.x, pz = (gz + 0.5) * UNIT + ORIGIN.z;
        const pieces = windowColumns[cell];
        if (pieces) for (const piece of pieces) {
          if (piece.minY > y + maxStep || piece.maxY < floor) continue;
          const top = windowPieceTop(piece, x, z, radius), bottom = -windowPieceTop(piece, x, z, radius, -1);
          if (bottom <= y + maxStep + 1e-7 && top <= y + maxStep + 1e-7) floor = Math.max(floor, top);
        }
        const support = voxelSupportAt(px, pz, y, maxStep, emptyFloor);
        if (support <= floor || support > y + maxStep) continue;
        if (rampCells[cell] && Math.abs(support - rampFloorAt(px, pz)) < 1e-7 || basementCells[cell] && Math.abs(support - basementFloorAt(px, pz)) < 1e-7) continue;
        floor = support;
      }
      return floor;
    };
    // Highest point of a rendered slope triangle under a circular footprint: the max lies on an edge or at the
    // disk's uphill point, so no samples or temp vectors are needed, even at clipped doorway triangles.
    const rampTriangleTop = (face, x, z, radius, direction = 1, verts = geometry.verts, triangle = 0) => {
      const indices = face.i;
      const a = indices[triangle] * 3, b = indices[triangle + 1] * 3, c = indices[triangle + 2] * 3;
      const ax = verts[a], ay = verts[a + 1] * direction, az = verts[a + 2];
      const bx = verts[b] - ax, by = verts[b + 1] * direction - ay, bz = verts[b + 2] - az;
      const cx = verts[c] - ax, cy = verts[c + 1] * direction - ay, cz = verts[c + 2] - az;
      const determinant = bx * cz - bz * cx;
      if (Math.abs(determinant) < 1e-12) return -Infinity;
      const gradientX = (by * cz - cy * bz) / determinant, gradientZ = (bx * cy - cx * by) / determinant;
      const length = Math.hypot(gradientX, gradientZ), scale = length ? radius / length : 0;
      const px = x + gradientX * scale - ax, pz = z + gradientZ * scale - az;
      const u = (px * cz - pz * cx) / determinant, v = (bx * pz - bz * px) / determinant;
      let top = u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9 ? ay + gradientX * px + gradientZ * pz : -Infinity;
      for (let edge = 0; edge < 3; edge++) {
        const p = indices[triangle + edge] * 3, q = indices[triangle + (edge + 1) % 3] * 3;
        const dx = verts[q] - verts[p], dz = verts[q + 2] - verts[p + 2], dy = (verts[q + 1] - verts[p + 1]) * direction;
        const ex = x - verts[p], ez = z - verts[p + 2], length2 = dx * dx + dz * dz;
        const middle = (ex * dx + ez * dz) / length2;
        const perpendicularX = ex - dx * middle, perpendicularZ = ez - dz * middle;
        const remaining = radius * radius - perpendicularX * perpendicularX - perpendicularZ * perpendicularZ;
        if (remaining < 0) continue;
        const half = Math.sqrt(remaining / length2), lo = Math.max(0, middle - half), hi = Math.min(1, middle + half);
        if (lo <= hi) top = Math.max(top, verts[p + 1] * direction + dy * (dy > 0 ? hi : lo));
      }
      return top;
    };
    // Exact voxel overlap for a vertical cylinder given bottom y and upward height; slopes fill the gap above
    // their voxel bases using the render mesh.
    const clearAt = (x, y, z, radius = 0, bodyHeight = 0) => {
      const epsilon = 1e-7, edge = radius ? epsilon : 0, cap = bodyHeight ? epsilon : 0;
      const gx0 = Math.max(0, Math.floor((x - radius - ORIGIN.x + edge) / UNIT)), gx1 = Math.min(SX - 1, Math.floor((x + radius - ORIGIN.x - edge) / UNIT));
      const gz0 = Math.max(0, Math.floor((z - radius - ORIGIN.z + edge) / UNIT)), gz1 = Math.min(SZ - 1, Math.floor((z + radius - ORIGIN.z - edge) / UNIT));
      const gy0 = Math.max(0, Math.floor((y - ORIGIN.y + cap) / UNIT)), gy1 = Math.min(SY - 1, Math.floor((y + bodyHeight - ORIGIN.y - cap) / UNIT));
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        if (!overlapsColumn(x, z, radius * radius, gx, gz)) continue;
        const base = gx * SY * SZ + gz, i = gx * SZ + gz;
        for (let gy = gy0; gy <= gy1; gy++) if (data[base + gy * SZ]) return false;
        const pieces = windowColumns[i];
        if (pieces) for (const piece of pieces) {
          if (y >= piece.maxY - epsilon || y + bodyHeight <= piece.minY + epsilon) continue;
          if (BL.convex.sweptCylinder(piece.vertices, x, y, z, x, y, z, radius, bodyHeight)) return false;
        }
        for (let layer = 0; layer < 2; layer++) {
          const range = layer ? basementCollision[i] : rampCollision[i];
          const base = layer ? (((basementCavities[i] >> 4) & 63) - 64) * UNIT : (((lowerCavities[i] >> 4) & 63) - 32) * UNIT;
          if (!range || y + bodyHeight <= base + epsilon) continue;
          for (let n = 0; n < (range & 3); n++) {
            const face = geometry.faces[rampFaceOffset + (range >>> 2) + n], verts = geometry.verts;
            if (Math.max(verts[face.i[0] * 3 + 1], verts[face.i[1] * 3 + 1], verts[face.i[2] * 3 + 1]) <= y + epsilon) continue;
            if (rampTriangleTop(face, x, z, radius) > y + epsilon) return false;
          }
        }
      }
      return true;
    };
    // Camera substeps already test rendered ramp triangles with clearAt; this sweeps the volume between them
    // exactly against the solid voxel boxes.
    const voxelSegmentClearAt = (x, y, z, toX, toY, toZ, radius, height) => {
      const gx0 = Math.max(0, Math.floor((Math.min(x, toX) - radius - ORIGIN.x) / UNIT)), gx1 = Math.min(SX - 1, Math.floor((Math.max(x, toX) + radius - ORIGIN.x) / UNIT));
      const gz0 = Math.max(0, Math.floor((Math.min(z, toZ) - radius - ORIGIN.z) / UNIT)), gz1 = Math.min(SZ - 1, Math.floor((Math.max(z, toZ) + radius - ORIGIN.z) / UNIT));
      const gy0 = Math.max(0, Math.floor((Math.min(y, toY) - ORIGIN.y) / UNIT)), gy1 = Math.min(SY - 1, Math.floor((Math.max(y, toY) + height - ORIGIN.y) / UNIT));
      const dx = toX - x, dy = toY - y, dz = toZ - z;
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const base = gx * SY * SZ + gz, minX = gx * UNIT + ORIGIN.x, minZ = gz * UNIT + ORIGIN.z;
        for (let gy = gy0; gy <= gy1; gy++) {
          if (!data[base + gy * SZ]) continue;
          const minY = gy * UNIT + ORIGIN.y;
          if (!segmentBoxClear(x, y, z, dx, dy, dz, radius, height, minX, minY, minZ, minX + UNIT, minY + UNIT, minZ + UNIT)) return false;
        }
        const pieces = windowColumns[gx * SZ + gz];
        if (pieces) for (const piece of pieces) {
          if (Math.min(y, toY) >= piece.maxY - 1e-7 || Math.max(y, toY) + height <= piece.minY + 1e-7) continue;
          if (BL.convex.sweptCylinder(piece.vertices, x, y, z, toX, toY, toZ, radius, height)) return false;
        }
      }
      return true;
    };
    const hullBox = new Float64Array(24), hullRamp = new Float64Array(18);
    const hullClearAt = (vertices) => {
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < vertices.length; i += 3) {
        minX = Math.min(minX, vertices[i]); maxX = Math.max(maxX, vertices[i]);
        minY = Math.min(minY, vertices[i + 1]); maxY = Math.max(maxY, vertices[i + 1]);
        minZ = Math.min(minZ, vertices[i + 2]); maxZ = Math.max(maxZ, vertices[i + 2]);
      }
      const gx0 = Math.max(0, Math.floor((minX - ORIGIN.x) / UNIT)), gx1 = Math.min(SX - 1, Math.floor((maxX - ORIGIN.x) / UNIT));
      const gz0 = Math.max(0, Math.floor((minZ - ORIGIN.z) / UNIT)), gz1 = Math.min(SZ - 1, Math.floor((maxZ - ORIGIN.z) / UNIT));
      const gy0 = Math.max(0, Math.floor((minY - ORIGIN.y) / UNIT)), gy1 = Math.min(SY - 1, Math.floor((maxY - ORIGIN.y) / UNIT));
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        const cell = gx * SZ + gz, base = gx * SY * SZ + gz;
        for (let gy = gy0; gy <= gy1; gy++) if (data[base + gy * SZ]) {
          for (let corner = 0; corner < 8; corner++) {
            const at = corner * 3;
            hullBox[at] = (gx + (corner & 1)) * UNIT + ORIGIN.x;
            hullBox[at + 1] = (gy + ((corner >> 1) & 1)) * UNIT + ORIGIN.y;
            hullBox[at + 2] = (gz + ((corner >> 2) & 1)) * UNIT + ORIGIN.z;
          }
          if (BL.convex.hullsOverlap(hullBox, vertices)) return false;
        }
        const pieces = windowColumns[cell];
        if (pieces) for (const piece of pieces) if (minY < piece.maxY && maxY > piece.minY
          && BL.convex.hullsOverlap(piece.vertices, vertices)) return false;
        for (let layer = 0; layer < 2; layer++) {
          const range = layer ? basementCollision[cell] : rampCollision[cell];
          const floor = layer ? (((basementCavities[cell] >> 4) & 63) - 64) * UNIT : (((lowerCavities[cell] >> 4) & 63) - 32) * UNIT;
          if (!range || maxY <= floor) continue;
          for (let n = 0; n < (range & 3); n++) {
            const face = geometry.faces[rampFaceOffset + (range >>> 2) + n], verts = geometry.verts;
            if (Math.max(verts[face.i[0] * 3 + 1], verts[face.i[1] * 3 + 1], verts[face.i[2] * 3 + 1]) <= minY) continue;
            for (let k = 0; k < 3; k++) {
              const at = k * 3, v = face.i[k] * 3;
              hullRamp[at] = hullRamp[at + 9] = verts[v];
              hullRamp[at + 1] = verts[v + 1]; hullRamp[at + 10] = floor;
              hullRamp[at + 2] = hullRamp[at + 11] = verts[v + 2];
            }
            if (BL.convex.hullsOverlap(hullRamp, vertices)) return false;
          }
        }
      }
      return true;
    };
    const ceilingAt = (x, y, z, radius = 0) => {
      const gx0 = Math.max(0, Math.floor((x - radius - ORIGIN.x) / UNIT)), gx1 = Math.min(SX - 1, Math.floor((x + radius - ORIGIN.x) / UNIT));
      const gz0 = Math.max(0, Math.floor((z - radius - ORIGIN.z) / UNIT)), gz1 = Math.min(SZ - 1, Math.floor((z + radius - ORIGIN.z) / UNIT));
      let ceiling = Infinity;
      for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
        if (!overlapsColumn(x, z, radius * radius, gx, gz)) continue;
        const base = gx * SY * SZ + gz;
        let gy = Math.max(0, Math.floor((y - ORIGIN.y + 1e-7) / UNIT));
        // The initial solid run is the floor at a slope's uphill edge.
        while (gy < SY && data[base + gy * SZ]) gy++;
        while (gy < SY && !data[base + gy * SZ]) gy++;
        if (gy < SY) ceiling = Math.min(ceiling, (gy - SURFACE) * UNIT);
        const pieces = windowColumns[gx * SZ + gz];
        if (pieces) for (const piece of pieces) {
          if (piece.maxY <= y + 1e-7 || piece.minY >= ceiling) continue;
          const bottom = -windowPieceTop(piece, x, z, radius, -1);
          if (bottom > y + 1e-7) ceiling = Math.min(ceiling, bottom);
        }
      }
      return ceiling;
    };
    // Movement-only continuous support across neighbouring walkable voxel tops; rendering and collision keep
    // using the exact stepped arrays above.
    const upperFloorAt = (i, fallback, y, maxStep) => {
      for (let layer = 0; layer < 2; layer++) {
        const cavity = layer ? lowerCavities[i] : cavities[i], floor = (((cavity >> 4) & 63) - 32) * UNIT;
        if (cavity && floor <= y + maxStep && floor > fallback) fallback = floor;
      }
      return fallback;
    };
    const smoothSupportAt = (x, z, y, maxStep, radius = 0) => {
      const center = column(x, z);
      if (center >= 0 && basementCells[center] && y < ((basementCavities[center] >> 10) - 64) * UNIT) return basementFloorAt(x, z);
      if (center >= 0 && rampCells[center] && y + maxStep >= (((lowerCavities[center] >> 4) & 63) - 32) * UNIT && (y < surface[center] - maxStep || surface[center] <= rampFloorAt(x, z))) return upperFloorAt(center, rampFloorAt(x, z), y, maxStep);
      const px = (x - ORIGIN.x) / UNIT - 0.5, pz = (z - ORIGIN.z) / UNIT - 0.5;
      const gx = Math.floor(px), gz = Math.floor(pz), tx = px - gx, tz = pz - gz;
      if (gx < 0 || gz < 0 || gx + 1 >= SX || gz + 1 >= SZ) return y;
      const i00 = gx * SZ + gz, i10 = i00 + SZ, i01 = i00 + 1, i11 = i10 + 1;
      let a = land[i00] ? y >= surface[i00] - maxStep ? surface[i00] : height[i00] : y;
      let b = land[i10] ? y >= surface[i10] - maxStep ? surface[i10] : height[i10] : y;
      let c = land[i01] ? y >= surface[i01] - maxStep ? surface[i01] : height[i01] : y;
      let d = land[i11] ? y >= surface[i11] - maxStep ? surface[i11] : height[i11] : y;
      if (radius) {
        // Interpolate the footprint that lands on a step's leading edge: centre-only samples lag that contact and
        // pin the visual lift.
        const x0 = (gx + 0.5) * UNIT + ORIGIN.x, z0 = (gz + 0.5) * UNIT + ORIGIN.z;
        if (land[i00]) a = supportAt(x0, z0, y, maxStep, null, radius);
        if (land[i10]) b = supportAt(x0 + UNIT, z0, y, maxStep, null, radius);
        if (land[i01]) c = supportAt(x0, z0 + UNIT, y, maxStep, null, radius);
        if (land[i11]) d = supportAt(x0 + UNIT, z0 + UNIT, y, maxStep, null, radius);
      }
      a = upperFloorAt(i00, a, y, maxStep);
      b = upperFloorAt(i10, b, y, maxStep);
      c = upperFloorAt(i01, c, y, maxStep);
      d = upperFloorAt(i11, d, y, maxStep);
      if (Math.abs(a - y) > maxStep) a = y;
      if (Math.abs(b - y) > maxStep) b = y;
      if (Math.abs(c - y) > maxStep) c = y;
      if (Math.abs(d - y) > maxStep) d = y;
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
    const cavityAt = (x, z, out, caveIndex = 0, y = Infinity) => {
      if (Number.isFinite(y) && y < basementHole.bottom && basementHole.contains(x, z)) return false;
      const i = column(x, z), cavity = i < 0 ? 0 : caveIndex === HEADQUARTERS_CAVE ? lowerCavities[i] : cavities[i] || lowerCavities[i];
      if (i >= 0 && basementCavities[i] && (!caveIndex || caveIndex === HEADQUARTERS_CAVE)) {
        const ceiling = ((basementCavities[i] >> 10) - 64) * UNIT;
        if (!cavity || y < ceiling) {
          out.caveIndex = HEADQUARTERS_CAVE;
          out.floor = basementFloorAt(x, z);
          out.ceiling = ceiling;
          return true;
        }
      }
      if (!cavity) return false;
      out.caveIndex = cavity & 15;
      out.floor = out.caveIndex === HEADQUARTERS_CAVE && rampCells[i] ? rampFloorAt(x, z) : (((cavity >> 4) & 63) - 32) * UNIT;
      const ceiling = cavity >> 10;
      out.ceiling = ceiling === 63 ? Infinity : (ceiling - 32) * UNIT;
      return true;
    };
    // Structural guides use the carved footprint to tell a tunnel's side wall from its stepped ceiling's risers.
    const rampColumnAt = (x, z, basement, out) => {
      const i = column(x, z), id = i < 0 ? 0 : basement ? basementCells[i] : rampCells[i];
      if (!id) return 0;
      const cavity = basement ? basementCavities[i] : lowerCavities[i], offset = basement ? 64 : 32;
      out.floor = (((cavity >> 4) & 63) - offset) * UNIT;
      out.ceiling = ((cavity >> 10) - offset) * UNIT;
      return id;
    };
    const frontageColumnAt = (x, z) => { const i = column(x, z); return i < 0 ? 0 : frontageCells[i]; };
    const pathColumn = (x, z) => {
      const gx = Math.floor((x - ORIGIN.x) / PATH_UNIT), gz = Math.floor((z - ORIGIN.z) / PATH_UNIT);
      return gx >= 0 && gz >= 0 && gx < PX && gz < PZ ? gx * PZ + gz : -1;
    };
    const isPath = (x, z) => {
      const i = pathColumn(x, z);
      return i >= 0 && paths[i] === 1;
    };
    const isGrassAt = (x, z, y = surfaceAt(x, z)) => {
      const i = column(x, z);
      if (i < 0 || !land[i] || isPath(x, z) || Math.abs(y - surfaceAt(x, z)) > UNIT + 1e-7) return false;
      const gy = Math.round((surface[i] - ORIGIN.y) / UNIT) - 1;
      const material = data[(Math.floor(i / SZ) * SY + gy) * SZ + i % SZ];
      return material === P.grass || material === P.grassLight || material === P.grassDark;
    };
    const onLand = (x, z) => {
      const i = column(x, z);
      return i >= 0 && land[i] === 1;
    };
    // Master spokes are banana-independent; ring changes only clip this fixed mask.
    const tileInnerRadius = (x, z) => Math.hypot(Math.max(0, Math.abs(x) - PATH_UNIT / 2), Math.max(0, Math.abs(z) - PATH_UNIT / 2));
    const writePathTile = (i, x, z) => {
      if (pathCount >= PATH_CAPACITY) throw new Error("Dynamic path instance capacity exceeded");
      paths[i] = 1;
      const o = pathCount++ * 20;
      pathData[o] = 1;
      pathData[o + 1] = 0;
      pathData[o + 2] = 0;
      pathData[o + 3] = 0;
      pathData[o + 4] = 0;
      pathData[o + 5] = 1;
      pathData[o + 6] = 0;
      pathData[o + 7] = 0;
      pathData[o + 8] = 0;
      pathData[o + 9] = 0;
      pathData[o + 10] = 1;
      pathData[o + 11] = 0;
      pathData[o + 12] = x;
      pathData[o + 13] = surfaceAt(x, z) + PATH_LIFT;
      pathData[o + 14] = z;
      pathData[o + 15] = 1;
      pathData[o + 16] = 1;
      pathData[o + 17] = 0;
      pathData[o + 18] = 0;
      pathData[o + 19] = 0;
    };
    // The ring scans only its own square of cells; the spokes only their master list.
    const setPathRadius = (platformRadius) => {
      requestedInner = platformRadius + PATH_UNIT;
      const quantized = Math.ceil((requestedInner - 1e-9) / PATH_UNIT) * PATH_UNIT;
      if (quantized === ringInner) return false;
      ringInner = quantized;
      // Keep loading beside the pile, with a separate passing lane outside it.
      ringCenter = ringInner + RING_HALF;
      ringOuter = ringCenter + RING_HALF;
      pathVisible = ringOuter <= MEADOW;
      pathCount = 0;
      ringPathCount = 0;
      visibleSpokeCount = 0;
      paths.fill(0);
      if (pathVisible) {
        const g0 = Math.max(0, Math.floor((-ringOuter - ORIGIN.x) / PATH_UNIT)), g1 = Math.min(PX - 1, Math.ceil((ringOuter - ORIGIN.x) / PATH_UNIT));
        for (let gx = g0; gx <= g1; gx++) {
          const wx = (gx + 0.5) * PATH_UNIT + ORIGIN.x;
          for (let gz = g0; gz <= g1; gz++) {
            const i = gx * PZ + gz, c = (gx >> 1) * SZ + (gz >> 1);
            if (!land[c] || !meadow[c]) continue;
            const wz = (gz + 0.5) * PATH_UNIT + ORIGIN.z;
            const innerRadius = tileInnerRadius(wx, wz);
            if (innerRadius < ringInner || innerRadius >= ringOuter) continue;
            writePathTile(i, wx, wz);
            ringPathCount++;
          }
        }
      }
      for (let n = 0; n < masterList.length; n++) {
        const i = masterList[n], gx = Math.floor(i / PZ), gz = i % PZ;
        const wx = (gx + 0.5) * PATH_UNIT + ORIGIN.x, wz = (gz + 0.5) * PATH_UNIT + ORIGIN.z;
        if (tileInnerRadius(wx, wz) < ringOuter) continue;
        writePathTile(i, wx, wz);
        visibleSpokeCount++;
      }
      // Each tile carries which of its eight neighbours are road (1 +x, 2 -x, 4 +z, 8 -z, then 16 +x+z, 32 -x+z,
      // 64 +x-z, 128 -x-z) in its first parameter, stored as 1 + mask (road tiles are never emissive, so the slot is
      // free); the road shader cuts each tile along the marching-squares half line of those neighbours, which turns
      // the tile staircase into straight diagonals and curves.
      for (let t = 0; t < pathCount; t++) {
        const o = t * 20, gx = Math.floor((pathData[o + 12] - ORIGIN.x) / PATH_UNIT), gz = Math.floor((pathData[o + 14] - ORIGIN.z) / PATH_UNIT);
        const at = (x, z) => x >= 0 && z >= 0 && x < PX && z < PZ && paths[x * PZ + z] === 1;
        pathData[o + 16] = 1 + (at(gx + 1, gz) ? 1 : 0) + (at(gx - 1, gz) ? 2 : 0) + (at(gx, gz + 1) ? 4 : 0) + (at(gx, gz - 1) ? 8 : 0)
          + (at(gx + 1, gz + 1) ? 16 : 0) + (at(gx - 1, gz + 1) ? 32 : 0) + (at(gx + 1, gz - 1) ? 64 : 0) + (at(gx - 1, gz - 1) ? 128 : 0);
      }
      pathVersion++;
      pathReflows++;
      return true;
    };
    const overlapsPath = (x, z, radius) => {
      const gx0 = Math.max(0, Math.floor((x - radius - ORIGIN.x) / PATH_UNIT));
      const gx1 = Math.min(PX - 1, Math.floor((x + radius - ORIGIN.x) / PATH_UNIT));
      const gz0 = Math.max(0, Math.floor((z - radius - ORIGIN.z) / PATH_UNIT));
      const gz1 = Math.min(PZ - 1, Math.floor((z + radius - ORIGIN.z) / PATH_UNIT));
      const half = PATH_UNIT / 2, radius2 = radius * radius;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = (gx + 0.5) * PATH_UNIT + ORIGIN.x;
        const dx = Math.max(0, Math.abs(cx - x) - half);
        for (let gz = gz0; gz <= gz1; gz++) {
          const i = gx * PZ + gz;
          if (!paths[i]) continue;
          const cz = (gz + 0.5) * PATH_UNIT + ORIGIN.z;
          const dz = Math.max(0, Math.abs(cz - z) - half);
          if (dx * dx + dz * dz <= radius2) return true;
        }
      }
      return false;
    };
    // The rainforest approach has no painted path, but all three terrace cuts must stay clear of scenery.
    const overlapsStairs = (x, z, radius) => {
      if (z + radius >= STAIR_TERRACE.from - 1 && Math.abs(x) <= STAIR_TERRACE.halfWidth + STAIR_TERRACE.blend + radius) return true;
      const timechainAlong = x * TIMECHAIN_X + z * TIMECHAIN_Z;
      if (timechainAlong + radius >= TIMECHAIN.from - 1
        && Math.abs(x * TIMECHAIN_Z - z * TIMECHAIN_X) <= TIMECHAIN.halfWidth + TIMECHAIN.blend + radius) return true;
      const poolAlong = x * POOL_X + z * POOL_Z;
      return poolAlong + radius >= POOL_APPROACH.from - 1 && poolAlong - radius <= POOL_APPROACH.to + 0.5
        && Math.abs(x * POOL_Z - z * POOL_X) <= POOL_APPROACH.halfWidth + POOL_APPROACH.blend + radius;
    };
    const stairAt = (x, y, z) => {
      const i = column(x, z);
      if (i < 0) return false;
      if (rampCells[i] && Math.abs(rampFloorAt(x, z) - y) <= UNIT + 0.05) return true;
      if (Math.abs(surfaceAt(x, z) - y) > UNIT + 0.05) return false;
      if (Math.abs(x) < PASS_HALF && z < -MEADOW && z > -RADIUS) return true;
      if (z >= STAIR_TERRACE.from - 1 && z <= STAIR_TERRACE.from + STAIR_TERRACE.top * 2 + 1
        && Math.abs(x) < STAIR_TERRACE.halfWidth + STAIR_TERRACE.blend) return true;
      const timechainAlong = x * TIMECHAIN_X + z * TIMECHAIN_Z;
      if (timechainAlong >= TIMECHAIN.from - 1 && timechainAlong <= TIMECHAIN.from + TIMECHAIN.top * 2 + 1
        && Math.abs(x * TIMECHAIN_Z - z * TIMECHAIN_X) < TIMECHAIN.halfWidth + TIMECHAIN.blend) return true;
      const poolAlong = x * POOL_X + z * POOL_Z;
      return poolAlong >= POOL_APPROACH.from - 1 && poolAlong <= POOL_APPROACH.to + 0.5
        && Math.abs(x * POOL_Z - z * POOL_X) < POOL_APPROACH.halfWidth + POOL_APPROACH.blend;
    };
    // Walking centerlines reuse the rendered path mask's bends; master curves stay fixed and navigation clips
    // them to the growing ring.
    const windowPieceAt = (x, y, z) => {
      const pieces = windowColumns[column(x, z)];
      if (pieces) for (const piece of pieces) {
        if (y < piece.minY || y >= piece.maxY) continue;
        // Occupancy includes internal faces shared by adjacent fragments: a zero-size swept body treats each as a
        // harmless touch, else it reports an infinitesimal air seam through solid rock.
        const v = piece.vertices, indices = piece.triangles.i;
        let inside = true;
        for (let n = 0; n < indices.length; n += 3) {
          const a = indices[n] * 3, b = indices[n + 1] * 3, c = indices[n + 2] * 3;
          const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vy = v[c + 1] - v[a + 1], vz = v[c + 2] - v[a + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const distance = nx * (x - v[a]) + ny * (y - v[a + 1]) + nz * (z - v[a + 2]);
          if (distance > 0 && distance * distance > 1e-18 * (nx * nx + ny * ny + nz * nz)) { inside = false; break; }
        }
        if (inside) return piece;
      }
      return null;
    };
    const voxelMaterialAt = (x, y, z) => {
      const material = grid.get(Math.floor((x - ORIGIN.x) / UNIT), Math.floor((y - ORIGIN.y) / UNIT), Math.floor((z - ORIGIN.z) / UNIT));
      if (material) return PALETTE[material];
      const piece = windowPieceAt(x, y, z);
      return piece ? piece.color : null;
    };
    const solidAt = (x, y, z) => voxelMaterialAt(x, y, z) !== null;
    const rockCaveCell = (gx, gy, gz) => {
      for (let n = 0; n < rockCaves.regions.length; n++) {
        const region = rockCaves.regions[n], x = gx - region.x, y = gy - region.y, z = gz - region.z;
        if (x < 0 || y < 0 || z < 0 || x >= region.sx || y >= region.sy || z >= region.sz) continue;
        const cave = region.data[(x * region.sy + y) * region.sz + z];
        if (cave) return cave;
      }
      return 0;
    };
    // Match the nearest actual voxel boundary, not the cave's bounding box; unowned exterior air competes too, so
    // a thin cave roof keeps radial material on top while its underside follows the carved wave.
    let caveCell = -1;
    const caveOpen = new Uint8Array(6), caveOwner = new Int32Array(6);
    const rockCaveAt = (x, y, z) => {
      const px = (x - ORIGIN.x) / UNIT, py = (y - ORIGIN.y) / UNIT, pz = (z - ORIGIN.z) / UNIT;
      const gx = Math.floor(px), gy = Math.floor(py), gz = Math.floor(pz);
      if (gx < 0 || gy < 0 || gz < 0 || gx >= SX || gy >= SY || gz >= SZ) return 0;
      if (!grid.has(gx, gy, gz)) {
        // Window cuts leave solid convex pieces in empty cells; ownership matches that of their rendered faces.
        const piece = windowPieceAt(x, y, z);
        return piece ? piece.matrixCave : rockCaveCell(gx, gy, gz);
      }
      // A stone texture samples one voxel many times in a row; its open sides and owners never change, so cache
      // them for the last voxel.
      const cell = grid.index(gx, gy, gz);
      if (cell !== caveCell) {
        caveCell = cell;
        for (let side = 0; side < 6; side++) {
          const axis = side >> 1, step = side & 1 ? 1 : -1;
          const nx = gx + (axis === 0 ? step : 0), ny = gy + (axis === 1 ? step : 0), nz = gz + (axis === 2 ? step : 0);
          caveOpen[side] = grid.has(nx, ny, nz) ? 0 : 1;
          caveOwner[side] = caveOpen[side] ? rockCaveCell(nx, ny, nz) : 0;
        }
      }
      let nearest = Infinity, owner = 0;
      for (let side = 0; side < 6; side++) {
        if (!caveOpen[side]) continue;
        const axis = side >> 1, positive = side & 1;
        const fraction = axis === 0 ? px - gx : axis === 1 ? py - gy : pz - gz, distance = positive ? 1 - fraction : fraction;
        if (distance > nearest) continue;
        const cave = caveOwner[side];
        if (distance < nearest || !cave) { nearest = distance; owner = cave; }
      }
      return owner;
    };
    // Returns shared palette RGB arrays (do not mutate); air and points outside the island return null.
    const rockMaterialAt = (x, y, z) => {
      const material = voxelMaterialAt(x, y, z);
      if (material) return material;
      const i = column(x, z);
      if (i < 0) return null;
      // Smooth ramps fill the gap between voxel base and rendered triangles: read the actual triangle colour,
      // including the main ramp's dark stone patches, instead of guessing from elevation.
      for (let layer = 0; layer < 2; layer++) {
        const range = layer ? basementCollision[i] : rampCollision[i];
        const base = layer ? (((basementCavities[i] >> 4) & 63) - 64) * UNIT : (((lowerCavities[i] >> 4) & 63) - 32) * UNIT;
        if (!range || y <= base + 1e-7) continue;
        for (let n = 0; n < (range & 3); n++) {
          const face = geometry.faces[rampFaceOffset + (range >>> 2) + n];
          if (rampTriangleTop(face, x, z, 0) > y + 1e-7) return face.color;
        }
      }
      return null;
    };
    const sightConvexHit = (planes, offset, count, x, y, z, dx, dy, dz, lo, hi, ids = null) => {
      let tangent = false;
      for (let i = 0; i < count; i++) {
        const n = ids ? ids[offset + i] * 4 : offset + i * 4;
        const nx = planes[n], ny = planes[n + 1], nz = planes[n + 2], distance = planes[n + 3] - nx * x - ny * y - nz * z, speed = nx * dx + ny * dy + nz * dz;
        if (Math.abs(speed) < 1e-12) { if (distance < -1e-9) return false; if (Math.abs(distance) <= 1e-9) tangent = true; }
        else {
          const t = distance / speed;
          if (speed > 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
          if (lo >= hi - 1e-12) return false;
        }
      }
      if (tangent) {
        const middle = (lo + hi) / 2, px = x + dx * middle, py = y + dy * middle, pz = z + dz * middle;
        for (let i = 0; i < count; i++) {
          const n = ids ? ids[offset + i] * 4 : offset + i * 4;
          const nx = planes[n], ny = planes[n + 1], nz = planes[n + 2];
          if (Math.abs(nx * dx + ny * dy + nz * dz) >= 1e-12 || Math.abs(planes[n + 3] - nx * x - ny * y - nz * z) > 1e-9) continue;
          // A tangent to an exposed face is clear; shared fragment/triangle planes inside the solid union must not
          // become transparent seams.
          if (!rockMaterialAt(px + nx * 1e-6, py + ny * 1e-6, pz + nz * 1e-6) || !rockMaterialAt(px - nx * 1e-6, py - ny * 1e-6, pz - nz * 1e-6)) return false;
        }
      }
      return lo < hi - 1e-12;
    };
    const sightCacheStats = { queries: 0, hits: 0 };
    const sightClearAt = (x, y, z, toX, toY, toZ, witness = null, slot = 0) => {
      const dx = toX - x, dy = toY - y, dz = toZ - z;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-12) return rockMaterialAt(x, y, z) === null;
      if (witness) {
        sightCacheStats.queries++;
        const at = witness[slot];
        // Only actual, still-occupied voxels certify a hit. Shrink the cell and require a positive
        // interval well above the DDA tolerance: tangencies, tiny spans and partial rock fall through.
        // Rechecking occupancy and the current segment makes this independent of camera/terrain epochs.
        if (at >= 0 && at < data.length && data[at]) {
          const gz = at % SZ, gy = Math.floor(at / SZ) % SY, gx = Math.floor(at / (SY * SZ));
          let enter = 0, exit = 1;
          for (let axis = 0; axis < 3 && enter < exit; axis++) {
            const start = axis === 0 ? x : axis === 1 ? y : z, speed = axis === 0 ? dx : axis === 1 ? dy : dz;
            const min = (axis === 0 ? ORIGIN.x + gx * UNIT : axis === 1 ? ORIGIN.y + gy * UNIT : ORIGIN.z + gz * UNIT) + UNIT * 1e-7, max = min + UNIT * (1 - 2e-7);
            if (!speed) { if (start <= min || start >= max) exit = enter; }
            else {
              const a = (min - start) / speed, b = (max - start) / speed;
              enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
            }
          }
          if (exit - enter > 1e-7) { sightCacheStats.hits++; return false; }
        }
        witness[slot] = -1;
      }
      let lo = 0, hi = 1;
      for (let axis = 0; axis < 3; axis++) {
        const start = axis === 0 ? x : axis === 1 ? y : z, speed = axis === 0 ? dx : axis === 1 ? dy : dz, min = axis === 0 ? ORIGIN.x : axis === 1 ? ORIGIN.y : ORIGIN.z, max = min + (axis === 0 ? SX : axis === 1 ? SY : SZ) * UNIT;
        if (!speed) { if (start < min || start >= max) return true; }
        else {
          const a = (min - start) / speed, b = (max - start) / speed;
          lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
          if (lo >= hi - 1e-12) return true;
        }
      }
      let gx = clamp(Math.floor((x + dx * lo - ORIGIN.x) / UNIT), 0, SX - 1), gy = clamp(Math.floor((y + dy * lo - ORIGIN.y) / UNIT), 0, SY - 1), gz = clamp(Math.floor((z + dz * lo - ORIGIN.z) / UNIT), 0, SZ - 1);
      const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz), stepX = dx ? UNIT / Math.abs(dx) : Infinity, stepY = dy ? UNIT / Math.abs(dy) : Infinity, stepZ = dz ? UNIT / Math.abs(dz) : Infinity;
      let tx = dx ? (ORIGIN.x + (gx + (dx > 0 ? 1 : 0)) * UNIT - x) / dx : Infinity, ty = dy ? (ORIGIN.y + (gy + (dy > 0 ? 1 : 0)) * UNIT - y) / dy : Infinity, tz = dz ? (ORIGIN.z + (gz + (dz > 0 ? 1 : 0)) * UNIT - z) / dz : Infinity;
      let t = lo, previousColumn = -1;
      for (let step = 0; step < SX + SY + SZ + 3; step++) {
        const end = Math.min(tx, ty, tz, hi), column = gx * SZ + gz;
        if (end > t + 1e-12) {
          if (data[(gx * SY + gy) * SZ + gz]) {
            if (witness) witness[slot] = (gx * SY + gy) * SZ + gz;
            return false;
          }
          if (column !== previousColumn && sightColumnWork[column]) {
            const columnEnd = Math.min(tx, tz, hi), a = y + dy * t, b = y + dy * columnEnd, minY = Math.min(a, b), maxY = Math.max(a, b), pieces = windowColumns[column];
            if (pieces) for (const piece of pieces) {
              if (minY > piece.maxY || maxY < piece.minY) continue;
              if (sightConvexHit(windowSightPlanes, piece.sightOffset, piece.sightCount, x, y, z, dx, dy, dz, t, columnEnd, windowSightRefs)) return false;
            }
            for (let layer = 0; layer < 2; layer++) {
              const range = layer ? basementCollision[column] : rampCollision[column];
              if (!range) continue;
              const base = layer ? (((basementCavities[column] >> 4) & 63) - 64) * UNIT : (((lowerCavities[column] >> 4) & 63) - 32) * UNIT;
              if (maxY <= base + 1e-9) continue;
              const bottom = dy ? (base - y) / dy : 0, start = dy > 0 ? Math.max(t, bottom) : t, finish = dy < 0 ? Math.min(columnEnd, bottom) : columnEnd;
              if (start >= finish - 1e-12) continue;
              for (let n = 0; n < (range & 3); n++) {
                const at = ((range >>> 2) + n) * 17;
                if (minY > rampSight[at + 16]) continue;
                if (sightConvexHit(rampSight, at, 4, x, y, z, dx, dy, dz, start, finish)) return false;
              }
            }
            previousColumn = column;
          }
        }
        if (end >= hi - 1e-12) break;
        if (tx <= end + 1e-12) { gx += sx; tx += stepX; if (gx < 0 || gx >= SX) break; }
        if (ty <= end + 1e-12) { gy += sy; ty += stepY; if (gy < 0 || gy >= SY) break; }
        if (tz <= end + 1e-12) { gz += sz; tz += stepZ; if (gz < 0 || gz >= SZ) break; }
        t = end;
      }
      return true;
    };
    // Conservative empty-volume certificate for batches of sight rays: partial window cells and sloping ramp
    // prisms keep their whole bounds, so uncertainty falls back to the exact ray query above.
    const sightBoxClearAt = (minX, minY, minZ, maxX, maxY, maxZ) => {
      const x0 = Math.max(0, Math.floor((minX - ORIGIN.x - 1e-7) / UNIT)), x1 = Math.min(SX - 1, Math.floor((maxX - ORIGIN.x + 1e-7) / UNIT));
      const y0 = Math.max(0, Math.floor((minY - ORIGIN.y - 1e-7) / UNIT)), y1 = Math.min(SY - 1, Math.floor((maxY - ORIGIN.y + 1e-7) / UNIT));
      const z0 = Math.max(0, Math.floor((minZ - ORIGIN.z - 1e-7) / UNIT)), z1 = Math.min(SZ - 1, Math.floor((maxZ - ORIGIN.z + 1e-7) / UNIT));
      if (x0 > x1 || y0 > y1 || z0 > z1) return true;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const column = x * SZ + z;
        for (let y = y0; y <= y1; y++) if (data[(x * SY + y) * SZ + z]) return false;
        const pieces = windowColumns[column];
        if (pieces) for (let n = 0; n < pieces.length; n++) if (minY <= pieces[n].maxY && maxY >= pieces[n].minY) return false;
        for (let layer = 0; layer < 2; layer++) {
          const range = layer ? basementCollision[column] : rampCollision[column];
          if (!range) continue;
          const base = layer ? (((basementCavities[column] >> 4) & 63) - 64) * UNIT : (((lowerCavities[column] >> 4) & 63) - 32) * UNIT;
          if (maxY < base) continue;
          for (let n = 0; n < (range & 3); n++) if (minY <= rampSight[((range >>> 2) + n) * 17 + 16]) return false;
        }
      }
      return true;
    };
    const sightConvexBox = (planes, offset, count, minX, minY, minZ, maxX, maxY, maxZ, ids = null) => {
      for (let i = 0; i < count; i++) {
        const n = ids ? ids[offset + i] * 4 : offset + i * 4, nx = planes[n], ny = planes[n + 1], nz = planes[n + 2];
        if (nx * (nx < 0 ? minX : maxX) + ny * (ny < 0 ? minY : maxY) + nz * (nz < 0 ? minZ : maxZ) > planes[n + 3]) return false;
      }
      return true;
    };
    const sightCutBoxClear = (cuts, minX, minY, minZ, maxX, maxY, maxZ) => {
      for (let n = 0; n < cuts.length; n++) {
        const planes = cuts[n];
        let separate = false;
        for (let i = 0; i < planes.length; i++) {
          const p = planes[i], nearest = p[0] * (p[0] < 0 ? maxX : minX) + p[1] * (p[1] < 0 ? maxY : minY) + p[2] * (p[2] < 0 ? maxZ : minZ);
          if (nearest > p[3] + 1e-8) { separate = true; break; }
        }
        if (!separate) return false;
      }
      return true;
    };
    // Every part of a blocking cross-section must be rock: at a flared window certify the clipped cell volume
    // against one complete convex fragment, since sample points cannot rule out a narrow opening.
    const sightBoxSolidAt = (minX, minY, minZ, maxX, maxY, maxZ) => {
      minX -= 1e-7; minY -= 1e-7; minZ -= 1e-7; maxX += 1e-7; maxY += 1e-7; maxZ += 1e-7;
      const x0 = Math.floor((minX - ORIGIN.x) / UNIT), x1 = Math.floor((maxX - ORIGIN.x) / UNIT);
      const y0 = Math.floor((minY - ORIGIN.y) / UNIT), y1 = Math.floor((maxY - ORIGIN.y) / UNIT);
      const z0 = Math.floor((minZ - ORIGIN.z) / UNIT), z1 = Math.floor((maxZ - ORIGIN.z) / UNIT);
      if (x0 < 0 || y0 < 0 || z0 < 0 || x1 >= SX || y1 >= SY || z1 >= SZ) return false;
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) {
        if (data[(x * SY + y) * SZ + z]) continue;
        const pieces = windowColumns[x * SZ + z];
        if (!pieces) return false;
        const ax = Math.max(minX, ORIGIN.x + x * UNIT), ay = Math.max(minY, ORIGIN.y + y * UNIT), az = Math.max(minZ, ORIGIN.z + z * UNIT);
        const bx = Math.min(maxX, ORIGIN.x + (x + 1) * UNIT), by = Math.min(maxY, ORIGIN.y + (y + 1) * UNIT), bz = Math.min(maxZ, ORIGIN.z + (z + 1) * UNIT);
        let covered = false;
        for (let n = 0; n < pieces.length; n++) {
          const p = pieces[n];
          if (ay < p.minY || by > p.maxY) continue;
          // All fragments in one cut cell are panels of the same wall: prove the box misses every authored opening
          // before falling back to containment in one convex fragment, so their joins cannot flicker.
          if (sightCutBoxClear(p.cuts, ax, ay, az, bx, by, bz)) { covered = true; break; }
          if (sightConvexBox(windowSightPlanes, p.sightOffset, p.sightCount, ax, ay, az, bx, by, bz, windowSightRefs)) { covered = true; break; }
        }
        if (!covered) return false;
      }
      return true;
    };
    const path = {
      geometry: PATH_TILE,
      instanceData: pathData,
      centerlines,
      get version() { return pathVersion; },
      setRadius: setPathRadius,
      overlaps: overlapsPath,
      apply(node) {
        node.instanceCount = pathCount;
        node.instanceVersion = pathVersion;
        node.visible = pathCount > 0;
      },
      debug: {
        get active() { return pathVisible; },
        get requestedInnerRadius() { return requestedInner; },
        get ringInnerRadius() { return ringInner; },
        get ringCenterRadius() { return ringCenter; },
        get ringOuterRadius() { return ringOuter; },
        get ringLoadingRadius() { return ringInner + RING_HALF / 2; },
        get ringTrafficRadius() { return ringOuter - RING_HALF / 2; },
        get quantizedRadius() { return ringInner; },
        get visibleInstanceCount() { return pathCount; },
        masterSpokeCellCount: masterPathCount,
        get visibleSpokeCellCount() { return visibleSpokeCount; },
        get ringCellCount() { return ringPathCount; },
        get clippedSpokeCellCount() { return masterPathCount - visibleSpokeCount; },
        masterMaskBuildCount: 1,
        masterMaskHash: masterPathHash,
        bufferCapacity: PATH_CAPACITY,
        get reflowCount() { return pathReflows; }
      }
    };
    const built = {
      geometry,
      roofOpening,
      // Shared construction data is read-only to rendering. The cap builder
      // fills only actual solid cells and the continuous window/ramp remnants.
      cutawaySource: { data, sx: SX, sy: SY, sz: SZ, unit: UNIT, origin: ORIGIN, palette: PALETTE, windows: windowColumns, cutawayPaths,
        birdseyeWindows: { mask: birdseyeWindowMask, tops: birdseyeWindowTops, ceilings: birdseyeWindowCeilings, levels: 2 },
        rampGeometry: geometry, rampFaceOffset, rampLayers: [{ ranges: rampCollision, cavities: lowerCavities, offset: 32 }, { ranges: basementCollision, cavities: basementCavities, offset: 64 }] },
      path,
      cutawayPaths,
      heightAt,
      surfaceAt,
      supportAt,
      clearAt,
      voxelSegmentClearAt,
      hullClearAt,
      ceilingAt,
      smoothSupportAt,
      cavityAt,
      rampColumnAt,
      frontageColumnAt,
      cavityBytes: cavities.byteLength + lowerCavities.byteLength + basementCavities.byteLength,
      solidAt,
      rockMaterialAt,
      rockCaveAt,
      rockCaveBytes: rockCaves.bytes,
      sightClearAt,
      sightCacheStats,
      sightBoxClearAt,
      sightBoxSolidAt,
      sightGrid: new Float64Array([UNIT, ORIGIN.x, ORIGIN.y, ORIGIN.z]),
      sightBytes: rampSight.byteLength + windowSightPlanes.byteLength + windowSightRefs.byteLength,
      windowPiecesAt: (x, z) => windowColumns[column(x, z)],
      isPath,
      overlapsStairs,
      stairAt,
      isGrassAt,
      onLand,
      mouths,
      headquarters: { caveIndex: HEADQUARTERS_CAVE, floor: HEADQUARTERS_FLOOR, ceiling: HEADQUARTERS_CEILING, rockCover: HEADQUARTERS_ROCK, room: HEADQUARTERS_ROOM, rooms: headquartersRooms, windows: headquartersWindows, windowFragments: windowFragmentCount, windowFaces: state.windowFaceCount, gallery: headquartersGallery, balconies: headquartersBalconies, ramps: headquartersRamps, fronts: headquartersFronts, basement },
      gate: { x: 0, z: GATE_Z, ry: 0 },
      radius: RADIUS,
      undersideDepth: DEPTH,
      undersideDepthAt,
      meadowRadius: MEADOW,
      passHalf: PASS_HALF,
      unit: UNIT,
      pathUnit: PATH_UNIT
    };
    return built;
  };
  BL.terrainSnapshot = { create, validate };
})();
