// Upper cave boundaries plus the solid stone slabs sealing unopened entrances.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, EPS = 1e-5;
  const create = ({ island, slots = BL.caves.slots, sealed = [] }) => {
    const contexts = [], byCave = new Map(), column = { caveIndex: 0, floor: 0, ceiling: 0 };
    const stats = { caves: 0, seals: 0, faces: 0, ceilingRisers: 0 };
    const descriptor = (kind, slot, mouth, caveIndex) => {
      const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
      const context = { kind, index: caveIndex - 1, source: { mouth, id: slot.id, caveIndex, blocked: kind === "sealed", x: mouth.x, z: mouth.z }, floor: mouth.floorY, ceiling: mouth.floorY, bounds, faces: [] };
      context.contains = (x, y, z, margin = 0) => {
        if (x < bounds[0] - margin || x > bounds[3] + margin || y < bounds[1] - margin || y > bounds[4] + margin || z < bounds[2] - margin || z > bounds[5] + margin) return false;
        return kind === "sealed" || island.cavityAt(x, z, column, caveIndex, y) && column.caveIndex === caveIndex && y >= column.floor - margin && y <= column.ceiling + margin;
      };
      contexts.push(context);
      return context;
    };
    const append = (context, points, nx, ny, nz, wall = 0) => {
      if (points.length < 3) return;
      const a = points[0];
      let area = false;
      for (let n = 1; n + 1 < points.length && !area; n++) {
        const b = points[n], c = points[n + 1], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        area = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2 > EPS * EPS;
      }
      if (!area) return;
      context.faces.push({ points, nx, ny, nz, wall }); stats.faces++;
      for (const point of points) for (let axis = 0; axis < 3; axis++) {
        context.bounds[axis] = Math.min(context.bounds[axis], point[axis]);
        context.bounds[axis + 3] = Math.max(context.bounds[axis + 3], point[axis]);
      }
      context.floor = context.bounds[1]; context.ceiling = context.bounds[4];
    };
    const clip = (points, axis, value, direction) => {
      const output = [];
      for (let n = 0; n < points.length; n++) {
        const a = points[n], b = points[(n + 1) % points.length], da = (a[axis] - value) * direction, db = (b[axis] - value) * direction;
        if (da >= 0) output.push(a);
        if ((da < 0) !== (db < 0)) {
          const t = da / (da - db);
          output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      return output;
    };
    for (let index = 0; index < island.mouths.length; index++) {
      const mouth = island.mouths[index], slot = slots.find((entry) => entry.id === mouth.id);
      // Headquarters, c730 and c5 mouths are skipped here: they continue into the existing HQ ramp contexts.
      if (!slot || slot.status === "headquarters" || slot.id === "c730" || slot.id === "c5") continue;
      if (slot.status === "dark") continue;
      byCave.set(index + 1, descriptor("cave", slot, mouth, index + 1)); stats.caves++;
    }
    const vertices = island.geometry.verts, unit = island.unit;
    for (const face of island.geometry.faces) {
      const context = byCave.get(face.matrixCave);
      if (!context || face.i.length < 3 || face.headquartersWindowReveal || face.windowIndex !== undefined) continue;
      const points = face.i.map((index) => [vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]]), a = points[0], b = points[1], c = points[2];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const length = Math.hypot(nx, ny, nz);
      if (length <= EPS || Math.abs(ny) > length * 0.1) continue;
      nx /= length; ny /= length; nz /= length;
      const axis = Math.abs(nx) > Math.abs(nz) ? 2 : 0, origin = island.sightGrid[axis === 0 ? 1 : 3];
      let low = Infinity, high = -Infinity;
      for (const point of points) { low = Math.min(low, point[axis]); high = Math.max(high, point[axis]); }
      for (let cell = Math.floor((low - origin + EPS) / unit); cell < Math.ceil((high - origin - EPS) / unit); cell++) {
        let polygon = clip(clip(points, axis, origin + cell * unit, 1), axis, origin + (cell + 1) * unit, -1);
        if (polygon.length < 3) continue;
        let x = 0, y = 0, z = 0;
        for (const point of polygon) { x += point[0]; y += point[1]; z += point[2]; }
        x /= polygon.length; y /= polygon.length; z /= polygon.length;
        const positive = island.clearAt(x + nx * 0.025, y, z + nz * 0.025), negative = island.clearAt(x - nx * 0.025, y, z - nz * 0.025);
        if (positive === negative) continue;
        const direction = positive ? 1 : -1, ax = nx * direction, az = nz * direction, caveIndex = context.source.caveIndex;
        if (!island.cavityAt(x + ax * 0.025, z + az * 0.025, column, caveIndex, y) || column.caveIndex !== caveIndex) continue;
        const floor = column.floor, ceiling = column.ceiling;
        // Skip ceiling risers: entrance below the room, same cave air on both horizontal sides, not a side wall.
        if (island.cavityAt(x - ax * 0.025, z - az * 0.025, column, caveIndex, y) && column.caveIndex === caveIndex) { stats.ceilingRisers++; continue; }
        polygon = clip(clip(polygon, 1, floor, 1), 1, ceiling, -1);
        if (!positive) polygon.reverse();
        append(context, polygon, ax, 0, az);
      }
    }
    for (const context of contexts) {
      const mouth = context.source.mouth, sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
      let minX = Infinity, maxX = -Infinity, back = Infinity;
      for (const face of context.faces) for (const point of face.points) {
        const dx = point[0] - mouth.x, dz = point[2] - mouth.z, x = dx * cr - dz * sr, z = dx * sr + dz * cr;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); back = Math.min(back, z);
      }
      // Stair-stepped voxel facets still describe three authored walls.
      // Group entry shoulders with the adjoining side, not by each X/Z face normal in the rotated voxel grid.
      for (const face of context.faces) {
        let x = 0, z = 0;
        for (const point of face.points) { x += point[0] - mouth.x; z += point[2] - mouth.z; }
        x /= face.points.length; z /= face.points.length;
        const across = x * cr - z * sr, along = x * sr + z * cr;
        face.wall = Math.abs(along - back) < Math.min(Math.abs(across - minX), Math.abs(across - maxX)) ? 2 : across < 0 ? 0 : 1;
      }
    }
    // Sealed core fills the rim's opening through its full depth: outline its six outer surfaces as one wall.
    // Painted voxel seams and thin moss dressing add no structural contours.
    const { mat4 } = BL.math, world = mat4.create(), local = mat4.create(), chain = [];
    for (const seal of sealed) {
      const mouth = seal.mouth, slot = slots.find((entry) => entry.id === mouth.id);
      if (!slot || slot.status !== "dark" || slot.id === "c730" || slot.id === "c5") continue;
      const context = descriptor("sealed", slot, mouth, seal.caveIndex), node = seal.node, bounds = node.geometry.sealBounds;
      const geometry = BL.models.box({ w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY, d: bounds.maxZ - bounds.minZ, color: "#77716a",
        offset: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, z: (bounds.minZ + bounds.maxZ) / 2 } });
      context.source.node = node; stats.seals++;
      chain.length = 0;
      for (let at = node; at; at = at.parent) chain.push(at);
      mat4.identity(world);
      for (let n = chain.length - 1; n >= 0; n--) {
        const at = chain[n];
        if (at.quaternion) mat4.fromTQS(local, at.position, at.quaternion, at.scale);
        else mat4.fromTRS(local, at.position, at.rotation, at.scale);
        mat4.multiply(world, world, local);
      }
      const transformed = new Float32Array(geometry.verts.length), v = geometry.verts;
      for (let at = 0; at < v.length; at += 3) {
        transformed[at] = world[0] * v[at] + world[4] * v[at + 1] + world[8] * v[at + 2] + world[12];
        transformed[at + 1] = world[1] * v[at] + world[5] * v[at + 1] + world[9] * v[at + 2] + world[13];
        transformed[at + 2] = world[2] * v[at] + world[6] * v[at + 1] + world[10] * v[at + 2] + world[14];
      }
      for (const face of geometry.faces) {
        if (face.i.length < 3) continue;
        const points = face.i.map((index) => [transformed[index * 3], transformed[index * 3 + 1], transformed[index * 3 + 2]]), a = points[0], b = points[1], c = points[2];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
        if (length > EPS) append(context, points, nx / length, ny / length, nz / length);
      }
    }
    return { contexts, stats };
  };
  BL.caveGuides = { create };
})();
