// The basement shaft's finite stone rim, shared by the wall outline pass.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ island }) => {
    const hole = island.headquarters.basement.hole, grid = island.sightGrid, unit = grid[0], ox = grid[1], oz = grid[3];
    const bottom = hole.floor - hole.rimDepth - unit, faces = [], centers = [], samples = [], groups = [];
    const bounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    const sampleBounds = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    const quad = (points, nx, ny, nz) => {
      const group = centers.length / 3;
      for (const vertex of [0, 1, 2, 0, 2, 3]) for (let axis = 0; axis < 3; axis++) faces.push(points[vertex * 3 + axis]);
      groups.push(group, group);
      for (let axis = 0; axis < 3; axis++) {
        let center = 0;
        for (let vertex = 0; vertex < 4; vertex++) {
          const value = points[vertex * 3 + axis]; center += value;
          bounds[axis] = Math.min(bounds[axis], value); bounds[axis + 3] = Math.max(bounds[axis + 3], value);
        }
        center /= 4; centers.push(center);
        const sample = Math.fround(center + (axis === 0 ? nx : axis === 1 ? ny : nz) * 0.025);
        samples.push(sample); sampleBounds[axis] = Math.min(sampleBounds[axis], sample); sampleBounds[axis + 3] = Math.max(sampleBounds[axis + 3], sample);
      }
    };
    // Mirrors the shaft carve in terrain.js: cell-center cut plus two shallow steps.
    // The final unit of inner lip ends here; the deep shaft is not a wall cue.
    const topAt = (x, z) => {
      const radius = Math.hypot(x - hole.x, z - hole.z);
      return radius < hole.radius ? bottom : radius < hole.mouthRadius
        ? hole.floor - Math.min(hole.rimDepth, Math.ceil((hole.mouthRadius - radius) / unit) * unit) : hole.floor;
    };
    const riser = (ax, az, bx, bz, top, low, nx, nz) => {
      if (low < top) quad([ax, top, az, bx, top, bz, bx, low, bz, ax, low, az], nx, 0, nz);
    };
    const firstX = Math.floor((hole.x - hole.mouthRadius - unit - ox) / unit), lastX = Math.ceil((hole.x + hole.mouthRadius + unit - ox) / unit);
    const firstZ = Math.floor((hole.z - hole.mouthRadius - unit - oz) / unit), lastZ = Math.ceil((hole.z + hole.mouthRadius + unit - oz) / unit);
    for (let gx = firstX; gx <= lastX; gx++) for (let gz = firstZ; gz <= lastZ; gz++) {
      const x = gx * unit + ox, z = gz * unit + oz, cx = x + unit / 2, cz = z + unit / 2, radius = Math.hypot(cx - hole.x, cz - hole.z);
      if (radius < hole.radius || radius >= hole.mouthRadius + unit) continue;
      const y = topAt(cx, cz);
      quad([x, y, z, x, y, z + unit, x + unit, y, z + unit, x + unit, y, z], 0, 1, 0);
      riser(x + unit, z, x + unit, z + unit, y, topAt(cx + unit, cz), 1, 0);
      riser(x, z + unit, x, z, y, topAt(cx - unit, cz), -1, 0);
      riser(x + unit, z + unit, x, z + unit, y, topAt(cx, cz + unit), 0, 1);
      riser(x, z, x + unit, z, y, topAt(cx, cz - unit), 0, -1);
    }
    const count = centers.length / 3, order = new Uint16Array(count);
    for (let n = 0; n < count; n++) order[n] = n;
    return {
      kind: "hole", index: -1, basement: true, source: hole, sx: 0, sz: -1, floor: bottom, ceiling: hole.floor, height: hole.floor - bottom,
      windows: [], bounds, searchBounds: new Float64Array(bounds), count: 0, lines: new Float32Array(0), contains: () => false,
      surface: new Float32Array(faces), surfaceCount: faces.length / 9, surfaceGroups: new Uint16Array(groups), surfaceGroupCount: count,
      surfaceCenters: new Float32Array(centers), surfaceSamples: new Float32Array(samples), surfaceWallGroups: new Uint8Array(count),
      surfaceStations: new Float32Array(count), surfaceSections: new Float32Array(count), surfaceTerrainSeen: new Uint8Array(count),
      surfacePhases: new Float32Array(count), surfaceWholePhases: new Float32Array(count), surfaceTargets: new Float32Array(count), surfacePerceived: new Float32Array(count), surfaceHidden: new Uint8Array(count),
      surfaceEye: new Float64Array([NaN, NaN, NaN]), surfacePosition: new Float64Array([NaN, NaN, NaN]), surfaceCamera: new Float64Array([NaN, NaN, NaN]), surfaceView: new Float64Array([NaN, NaN, NaN, NaN]),
      surfaceActor: null, surfaceOcclusion: -1, surfaceVersion: 0, surfaceWholeActive: 0, surfaceActive: 0,
      walls: [{ key: 0, bounds, distance: Infinity, target: 0, phase: 0, perceived: false, visibleMin: Infinity, visibleMax: -Infinity, surfaceOrder: order, surfaceTree: { bounds: sampleBounds, start: 0, end: count, left: null, right: null } }],
    };
  };
  BL.holeGuides = { create };
})();
