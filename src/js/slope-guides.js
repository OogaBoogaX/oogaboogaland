// Connected sky-exposed slope sides, classified once from the terrain columns.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, CACHE = new WeakMap(), EPS = 1e-5, TREAD_WIDTH = 2;
  const DIAGONAL = Math.SQRT1_2;
  const DX = new Float32Array([1, DIAGONAL, 0, -DIAGONAL, -1, -DIAGONAL, 0, DIAGONAL]);
  const DZ = new Float32Array([0, DIAGONAL, 1, DIAGONAL, 0, -DIAGONAL, -1, -DIAGONAL]);
  const create = ({ island }) => {
    const cached = CACHE.get(island);
    if (cached) return cached;
    const unit = island.unit, grid = island.sightGrid;
    const ox = grid[1] + Math.floor((-island.radius - unit - grid[1]) / unit) * unit;
    const oz = grid[3] + Math.floor((-island.radius - unit - grid[3]) / unit) * unit;
    const width = Math.ceil((island.radius + unit - ox) / unit), depth = Math.ceil((island.radius + unit - oz) / unit), cells = width * depth;
    const heights = new Float32Array(cells), smooth = new Float32Array(cells), gx = new Float32Array(cells), gz = new Float32Array(cells);
    const fronts = new Uint8Array(cells), masks = new Uint8Array(cells), treads = new Int8Array(cells).fill(-1), sides = new Int32Array(cells * 8).fill(-1), queue = new Int32Array(cells);
    const indexAt = (x, z) => {
      const ix = Math.floor((x - ox) / unit), iz = Math.floor((z - oz) / unit);
      return ix < 0 || ix >= width || iz < 0 || iz >= depth ? -1 : ix * depth + iz;
    };
    for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
      const i = x * depth + z, cx = ox + (x + 0.5) * unit, cz = oz + (z + 0.5) * unit;
      heights[i] = Math.max(0, island.surfaceAt(cx, cz)); fronts[i] = island.frontageColumnAt(cx, cz);
    }
    // Average the height over several steps before taking the downhill direction.
    // Alternating X/Z voxel faces then share the diagonal hillside's aspect.
    for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
      let total = 0;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const sx = x + dx, sz = z + dz;
        if (sx >= 0 && sx < width && sz >= 0 && sz < depth) total += heights[sx * depth + sz];
      }
      smooth[x * depth + z] = total / 25;
    }
    for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
      const i = x * depth + z;
      gx[i] = smooth[Math.max(0, x - 2) * depth + z] - smooth[Math.min(width - 1, x + 2) * depth + z];
      gz[i] = smooth[x * depth + Math.max(0, z - 2)] - smooth[x * depth + Math.min(depth - 1, z + 2)];
    }
    const sectorAt = (i, nx, nz) => {
      let x = gx[i], z = gz[i];
      const length = Math.hypot(x, z);
      // A riser takes its tread's high-column aspect; averaging with a low neighbour splits one step in two.
      // Small perpendicular notches belong to that step; only an opposite face or canceled crest gets its own aspect.
      if (length <= EPS || x * nx + z * nz < -length * 0.5) { x = nx; z = nz; }
      return (Math.round(Math.atan2(z, x) * 4 / Math.PI) + 8) % 8;
    };
    let riserCount = 0, treadCount = 0;
    const markRiser = (i, neighbor, nx, nz) => {
      if (neighbor < 0 || fronts[neighbor] || heights[i] <= heights[neighbor] + EPS) return;
      masks[i] |= 1 << sectorAt(i, nx, nz); riserCount++;
    };
    for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) {
      const i = x * depth + z, height = heights[i];
      if (fronts[i] || height <= EPS) continue;
      markRiser(i, x + 1 < width ? i + depth : -1, 1, 0);
      markRiser(i, x > 0 ? i - depth : -1, -1, 0);
      markRiser(i, z + 1 < depth ? i + 1 : -1, 0, 1);
      markRiser(i, z > 0 ? i - 1 : -1, 0, -1);
      const length = Math.hypot(gx[i], gz[i]);
      if (length <= EPS) continue;
      const sector = (Math.round(Math.atan2(gz[i], gx[i]) * 4 / Math.PI) + 8) % 8;
      const dx = Math.sign(DX[sector]), dz = Math.sign(DZ[sector]), stride = Math.hypot(dx, dz) * unit, reach = Math.ceil((TREAD_WIDTH + stride) / stride);
      let lower = 0, higher = 0, downOpen = true, upOpen = true;
      for (let step = 1; step <= reach && ((!lower && downOpen) || (!higher && upOpen)); step++) {
        if (downOpen && !lower) {
          const sx = x + dx * step, sz = z + dz * step, n = sx < 0 || sx >= width || sz < 0 || sz >= depth ? -1 : sx * depth + sz;
          if (n < 0 || fronts[n] || heights[n] > height + EPS) downOpen = false;
          else if (heights[n] < height - EPS) lower = step * stride;
        }
        if (upOpen && !higher) {
          const sx = x - dx * step, sz = z - dz * step, n = sx < 0 || sx >= width || sz < 0 || sz >= depth ? -1 : sx * depth + sz;
          if (n < 0 || fronts[n] || heights[n] < height - EPS) upOpen = false;
          else if (heights[n] > height + EPS) higher = step * stride;
        }
      }
      // Measure the complete flat strip, not each half from this cell.
      // Every point on a short terrace must meet the same width rule, including cells touching its risers.
      if (lower && higher && lower + higher - stride <= TREAD_WIDTH + EPS) { masks[i] |= 1 << sector; treads[i] = sector; treadCount++; }
    }
    let sideCount = 0;
    for (let i = 0; i < cells; i++) for (let sector = 0; sector < 8; sector++) {
      const bit = 1 << sector;
      if (!(masks[i] & bit) || sides[i * 8 + sector] >= 0) continue;
      let first = 0, count = 1;
      queue[0] = i; sides[i * 8 + sector] = sideCount;
      while (first < count) {
        const at = queue[first++], x = Math.floor(at / depth), z = at % depth;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const sx = x + dx, sz = z + dz;
          if ((!dx && !dz) || sx < 0 || sx >= width || sz < 0 || sz >= depth) continue;
          const next = sx * depth + sz;
          // Fixed aspect labels stop a chain of small turns joining the near side to the opposite side round a hill.
          if (!(masks[next] & bit) || sides[next * 8 + sector] >= 0) continue;
          sides[next * 8 + sector] = sideCount; queue[count++] = next;
        }
      }
      sideCount++;
    }
    const classify = (x, y, z, nx, ny, nz, out) => {
      let i, sector;
      if (ny > 0.9) {
        i = indexAt(x, z);
        if (i < 0 || fronts[i] || treads[i] < 0 || Math.abs(y - heights[i]) > EPS) return false;
        sector = treads[i];
      } else {
        if (Math.abs(ny) > 0.1) return false;
        i = indexAt(x - nx * 0.025, z - nz * 0.025);
        const neighbor = indexAt(x + nx * 0.025, z + nz * 0.025);
        if (i < 0 || neighbor < 0 || i === neighbor || fronts[i] || fronts[neighbor]
          || heights[i] <= heights[neighbor] + EPS || y < heights[neighbor] - EPS || y > heights[i] + EPS) return false;
        sector = sectorAt(i, nx, nz);
      }
      const side = sides[i * 8 + sector];
      if (side < 0) return false;
      out.side = side; out.sector = sector;
      out.x = ox + (Math.floor(i / depth) + 0.5) * unit; out.z = oz + (i % depth + 0.5) * unit;
      return true;
    };
    const result = { classify, stats: { cells, sides: sideCount, risers: riserCount, treads: treadCount } };
    CACHE.set(island, result);
    return result;
  };
  BL.slopeGuides = { create };
})();
