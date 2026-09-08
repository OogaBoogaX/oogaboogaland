(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mulberry32, hexToRgb, clamp } = BL.math;
  // Dense voxel grid, 0 and outside both empty
  const makeGrid = (sx, sy, sz) => {
    const data = new Uint8Array(sx * sy * sz);
    const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz;
    const index = (x, y, z) => (x * sy + y) * sz + z;
    return {
      data,
      sx,
      sy,
      sz,
      index,
      get: (x, y, z) => inside(x, y, z) ? data[index(x, y, z)] : 0,
      set: (x, y, z, c) => {
        data[index(x, y, z)] = c;
      },
      has: (x, y, z) => inside(x, y, z) && data[index(x, y, z)] !== 0
    };
  };
  // Exposed grid faces, greedy-merged a slice at a time
  const DIR_BIT = 0x100;
  const gridGeometry = (grid, { unit, palette, origin = { x: 0, y: 0, z: 0 } }) => {
    const { data, sx, sy, sz } = grid;
    const dims = [sx, sy, sz], strides = [sy * sz, sz, 1];
    const geo = { verts: [], faces: [], lines: [] };
    const mask = new Int16Array(Math.max(sx * sy, sy * sz, sz * sx));
    const corner = new Float64Array(3);
    const at = (d, k, u, i, v, j) => {
      corner[d] = k;
      corner[u] = i;
      corner[v] = j;
      geo.verts.push(origin.x + corner[0] * unit, origin.y + corner[1] * unit, origin.z + corner[2] * unit);
      return geo.verts.length / 3 - 1;
    };
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      const nd = dims[d], nu = dims[u], nv = dims[v];
      const sd = strides[d], su = strides[u], sv = strides[v];
      for (let k = 0; k <= nd; k++) {
        // Faces between cells k-1 and k along d
        let n = 0;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; i++, n++) {
            const base = i * su + j * sv + k * sd;
            const a = k > 0 ? data[base - sd] : 0, b = k < nd ? data[base] : 0;
            mask[n] = a && !b ? a | DIR_BIT : !a && b ? b : 0;
          }
        }
        n = 0;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu;) {
            const c = mask[n];
            if (!c) {
              i++;
              n++;
              continue;
            }
            let w = 1;
            while (i + w < nu && mask[n + w] === c) w++;
            let h = 1;
            for (; j + h < nv; h++) {
              let same = true;
              for (let x = 0; x < w && same; x++) same = mask[n + x + h * nu] === c;
              if (!same) break;
            }
            // (d, u, v) is cyclic, so this order faces +d
            const c0 = at(d, k, u, i, v, j), c1 = at(d, k, u, i + w, v, j), c2 = at(d, k, u, i + w, v, j + h), c3 = at(d, k, u, i, v, j + h);
            geo.faces.push({ i: c & DIR_BIT ? [c0, c1, c2, c3] : [c0, c3, c2, c1], color: palette[c & 0xff], emissive: 0 });
            for (let y = 0; y < h; y++) mask.fill(0, n + y * nu, n + y * nu + w);
            i += w;
            n += w;
          }
        }
      }
    }
    return geo;
  };
  // Smooth value noise, three octaves, roughly 0..1
  const LATTICE = 64;
  const valueNoise = (rand) => {
    const cells = new Float32Array(LATTICE * LATTICE);
    for (let i = 0; i < cells.length; i++) cells[i] = rand();
    const at = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
      const x0 = ix & (LATTICE - 1), x1 = (ix + 1) & (LATTICE - 1);
      const y0 = (iy & (LATTICE - 1)) * LATTICE, y1 = ((iy + 1) & (LATTICE - 1)) * LATTICE;
      const a = cells[y0 + x0] + (cells[y0 + x1] - cells[y0 + x0]) * tx;
      const b = cells[y1 + x0] + (cells[y1 + x1] - cells[y1 + x0]) * tx;
      return a + (b - a) * ty;
    };
    return (x, y) => at(x, y) * 0.6 + at(x * 2.1 + 17.3, y * 2.1 + 5.7) * 0.3 + at(x * 4.3 + 3.1, y * 4.3 + 11.9) * 0.1;
  };
  const smooth = (t) => {
    const k = clamp(t, 0, 1);
    return k * k * (3 - 2 * k);
  };

  // ---------- hub island ----------
  // Quarter-unit cells, clocks running clockwise from -z
  const UNIT = 0.25;
  const SX = 248, SY = 60, SZ = 248;
  const SURFACE = 28;
  const ORIGIN = { x: -SX / 2 * UNIT, y: -SURFACE * UNIT, z: -SZ / 2 * UNIT };
  const RADIUS = 30, MEADOW = 22, DEPTH = 7;
  const MAX_HEIGHT = 8;
  const BLUFF = 6;
  const MOUTH = { w: 5, h: 3, depth: 5 };
  const ROOM = { w: 6, h: 4, from: 2.5, to: 6.5 };
  const RING = 8, PATH_HALF = 0.75;
  const GATE_Z = -(RADIUS - 2), PASS_HALF = 2.5, PASS_TOP = 5, TRAIL_HALF = 1;
  // Bluff, apron and trail measures
  const BLUFF_LEN = 8, SIDE_OUT = 2.5, APRON = 3, TRAIL_LEAN = 1.2;
  const P = { grass: 1, grassLight: 2, grassDark: 3, path: 4, stone: 5, stoneDark: 6, inner: 7, dirt: 8, floor: 9 };
  const PALETTE = [null, "#6f7d3e", "#7b8945", "#65733a", "#a3874f", "#877869", "#5e5449", "#2f2824", "#6a4e39", "#3a302a"].map((hex) => hex && hexToRgb(hex));
  const UNDER_BANDS = [P.dirt, P.stoneDark, P.dirt, P.stone];
  // Slot, its ring clock, and its tunnel clock
  const CLOCKS = [["c11", 11], ["c9", 9], ["c730", 7.5, 10.5], ["c1", 1], ["c2", 2], ["c3", 3], ["c5", 5, 2]];
  const facing = (angle) => {
    const ry = (Math.PI * 2 - angle) % (Math.PI * 2);
    return ry > Math.PI ? ry - Math.PI * 2 : ry;
  };
  const ISLANDS = new Map();
  const island = ({ seed = 1 } = {}) => {
    const hit = ISLANDS.get(seed);
    if (hit) return hit;
    const rand = mulberry32(seed);
    const noise = valueNoise(rand);
    // A spoke from the ring path to the cliff face
    const spoke = (angle, axis = angle) => {
      const ox = Math.sin(axis), oz = -Math.cos(axis);
      const lean = Math.cos(angle) * ox + Math.sin(angle) * oz;
      const sign = rand() < 0.5 ? -1 : 1, amp = 0.8 + rand() * 0.7;
      const reach = MEADOW + (lean ? SIDE_OUT : 0);
      return { angle, axis, ox, oz, lean, x: Math.sin(angle) * reach, z: -Math.cos(angle) * reach, e: UNIT / 2 * (Math.abs(ox) + Math.abs(oz)) - 1e-6, wobble: (lean ? -Math.sign(lean) : sign) * amp };
    };
    const frames = CLOCKS.map(([id, clock, axis = clock]) => ({ id, clock, ...spoke(clock / 12 * Math.PI * 2, axis / 12 * Math.PI * 2) }));
    const pass = spoke(0);
    const spokes = [...frames, pass, spoke(Math.PI)];
    const ringPhase = rand() * Math.PI * 2;
    const grid = makeGrid(SX, SY, SZ);
    const height = new Float32Array(SX * SZ);
    const paths = new Uint8Array(SX * SZ);
    // Walkable top, colour and underside per column
    const NONE = -DEPTH - 1;
    const tops = new Float32Array(SX * SZ).fill(NONE);
    const surfaces = new Uint8Array(SX * SZ);
    const bottoms = new Uint8Array(SX * SZ);
    // Colours sample a half-unit lattice so quads merge
    const q = (w) => Math.floor(w * 2) / 2;
    // Seamless noise around the island, by sector
    const around = (theta, k, c) => noise(Math.cos(theta) * k + c, Math.sin(theta) * k + c);
    const grassAt = (wx, wz) => {
      const g = noise(q(wx) / 3 + 120, q(wz) / 3 + 60);
      return g < 0.38 ? P.grassDark : g < 0.68 ? P.grass : P.grassLight;
    };
    // Blocky stone and dirt strata on cliff faces
    const strata = (wx, wz, gy) => {
      const s = noise(q(wx) / 2 + q(gy * UNIT) * 1.8 + 400, q(wz) / 2 + 400);
      return s < 0.35 ? P.stoneDark : s < 0.7 ? P.stone : P.dirt;
    };
    for (let gx = 0; gx < SX; gx++) {
      const wx = (gx + 0.5) * UNIT + ORIGIN.x;
      for (let gz = 0; gz < SZ; gz++) {
        const wz = (gz + 0.5) * UNIT + ORIGIN.z;
        const r = Math.hypot(wx, wz);
        if (r >= RADIUS) continue;
        // Flatten a bluff and apron around each mouth
        let bluff = 0, apron = false;
        for (const f of frames) {
          const dx = wx - f.x, dz = wz - f.z;
          const along = dx * f.ox + dz * f.oz, across = Math.abs(dz * f.ox - dx * f.oz);
          if (along > -f.e && across < 5) bluff = Math.max(bluff, (1 - smooth((across - 3) / 2)) * (1 - smooth((along - BLUFF_LEN) / 2)));
          else if (f.lean && along > -APRON && across < 3.5) apron = true;
        }
        const theta = Math.atan2(wx, -wz);
        // The rim erodes, except around the mouths
        const rim = bluff > 0 ? r : r + (noise(wx / 6 + 40, wz / 6 + 40) - 0.5) * 2 + (around(theta, 3, 120) - 0.5) * 4;
        if (rim >= RADIUS) continue;
        // Edge, slope and plateau vary by sector
        let near = 0;
        for (const f of frames) near = Math.max(near, 1 - smooth((Math.hypot(wx - f.x, wz - f.z) - 5) / 5));
        const edge = MEADOW + (around(theta, 2.2, 30) - 0.5) * 7 * (1 - near);
        const ramp = 3 + around(theta, 1.7, 60) * 6;
        const plateau = 2.5 + around(theta, 1.4, 90) * 5;
        let top = 0, surface = grassAt(wx, wz);
        if (r < edge && bluff <= 0) {
          if (Math.abs(r - RING - Math.sin(theta * 3 + ringPhase) * 0.7) < PATH_HALF) surface = P.path;
          if (r > RING - 0.5) {
            for (const s of spokes) {
              const d = theta - s.angle;
              const lateral = r * Math.atan2(Math.sin(d), Math.cos(d));
              const bend = Math.sin((r - RING) / (MEADOW - RING) * Math.PI * 2);
              if (Math.abs(lateral + s.lean * TRAIL_LEAN - s.wobble * (s.lean ? Math.abs(bend) : bend)) < PATH_HALF) surface = P.path;
            }
          }
        } else {
          // Terraces to a plateau, dipping at rim and six
          let h = 0.4 + (plateau + noise(wx / 12 + 80, wz / 12 + 80) * 2.5) * smooth((r - edge) / ramp) - 1.2 * smooth((r - (RADIUS - 2)) / 2) + (noise(wx / 5 + 20, wz / 5 + 20) - 0.5) * 1.2;
          h *= 1 - 0.6 * smooth(1 - (Math.PI - Math.abs(theta)) / 0.5);
          const crest = BLUFF + noise(wx / 4 + 500, wz / 4 + 500) * 1.5;
          if (h < crest) h += (crest - h) * bluff;
          const patch = noise(q(wx) / 4 + 700, q(wz) / 4 + 700);
          if (apron) h = 0;
          else if (patch <= 0.58) surface = patch < 0.3 ? P.stoneDark : P.stone;
          if (Math.abs(wx) < PASS_HALF && wz < 0) {
            h = Math.min(PASS_TOP, Math.floor((r - MEADOW) / UNIT) * UNIT);
            surface = Math.abs(wx - pass.wobble * Math.sin((r - MEADOW) / (-GATE_Z - MEADOW) * Math.PI * 2)) < TRAIL_HALF ? P.path : grassAt(wx, wz);
          } else if (Math.abs(wx) < PATH_HALF && wz > 0) surface = P.path;
          top = clamp(Math.round(h / UNIT) * UNIT, 0, MAX_HEIGHT);
        }
        // The underside drops sheer, tapering at the edge
        const depth = rim <= RADIUS - 3 ? DEPTH : DEPTH * (1 - Math.pow((rim - (RADIUS - 3)) / 3, 1.6));
        const i = gx * SZ + gz;
        tops[i] = top;
        surfaces[i] = surface;
        bottoms[i] = Math.max(0, SURFACE - 1 - Math.floor(depth / UNIT));
        // Only trails count as paths, so props may stand
        if (surface === P.path) paths[i] = 1;
        else if (r > 3 && r < edge && bluff <= 0 && noise(q(wx) / 1.5 + 200, q(wz) / 1.5 + 200) > 0.83) surfaces[i] = P.path;
      }
    }
    // Fill columns, with stone showing at step edges
    const row = (j) => tops[j] === NONE ? -1 : SURFACE - 1 + Math.round(tops[j] / UNIT);
    const { data } = grid;
    for (let gx = 0; gx < SX; gx++) {
      const wx = (gx + 0.5) * UNIT + ORIGIN.x;
      for (let gz = 0; gz < SZ; gz++) {
        const i = gx * SZ + gz;
        const top = tops[i];
        if (top === NONE) continue;
        const wz = (gz + 0.5) * UNIT + ORIGIN.z;
        const gyTop = SURFACE - 1 + Math.round(top / UNIT);
        const band = Math.floor(noise(q(wx) / 6 + 300, q(wz) / 6 + 300) * 3);
        const edge = top > 0 && top - Math.min(tops[i - SZ], tops[i + SZ], tops[i - 1], tops[i + 1]) >= 1;
        const walled = Math.min(row(i - SZ), row(i + SZ), row(i - 1), row(i + 1));
        const column = (gx * SY) * SZ + gz;
        for (let gy = bottoms[i]; gy <= gyTop; gy++) {
          data[column + gy * SZ] = gy === gyTop && !edge ? surfaces[i] : gy < SURFACE ? UNDER_BANDS[Math.floor((SURFACE - 1 - gy + band * 2) / 6) % 4] : gy <= walled && gy < gyTop ? P.stone : strata(wx, wz, gy);
        }
      }
    }
    // Carve tunnel and room as rotated boxes
    const carve = (f) => {
      const e = f.e;
      const cx = f.x + f.ox * 4, cz = f.z + f.oz * 4;
      const gx0 = Math.max(0, Math.floor((cx - 7 - ORIGIN.x) / UNIT)), gx1 = Math.min(SX - 1, Math.ceil((cx + 7 - ORIGIN.x) / UNIT));
      const gz0 = Math.max(0, Math.floor((cz - 7 - ORIGIN.z) / UNIT)), gz1 = Math.min(SZ - 1, Math.ceil((cz + 7 - ORIGIN.z) / UNIT));
      const columns = [];
      for (let gx = gx0; gx <= gx1; gx++) {
        const wx = (gx + 0.5) * UNIT + ORIGIN.x;
        for (let gz = gz0; gz <= gz1; gz++) {
          const wz = (gz + 0.5) * UNIT + ORIGIN.z;
          const dx = wx - f.x, dz = wz - f.z;
          const along = dx * f.ox + dz * f.oz, across = Math.abs(dz * f.ox - dx * f.oz);
          const room = along > ROOM.from - e && along < ROOM.to + e && across < ROOM.w / 2 + e;
          if (!room && !(along > -0.5 && along < MOUTH.depth + e && across < MOUTH.w / 2 + e)) continue;
          const gyTop = SURFACE - 1 + Math.round((room ? ROOM.h : MOUTH.h) / UNIT);
          for (let gy = SURFACE; gy <= gyTop; gy++) grid.set(gx, gy, gz, 0);
          if (along > -e) columns.push(gx, gyTop, gz);
        }
      }
      for (let i = 0; i < columns.length; i += 3) {
        const gx = columns[i], gyTop = columns[i + 1], gz = columns[i + 2];
        if (grid.has(gx, SURFACE - 1, gz)) grid.set(gx, SURFACE - 1, gz, P.floor);
        if (grid.has(gx, gyTop + 1, gz)) grid.set(gx, gyTop + 1, gz, P.inner);
        for (let gy = SURFACE; gy <= gyTop; gy++) {
          if (grid.has(gx + 1, gy, gz)) grid.set(gx + 1, gy, gz, P.inner);
          if (grid.has(gx - 1, gy, gz)) grid.set(gx - 1, gy, gz, P.inner);
          if (grid.has(gx, gy, gz + 1)) grid.set(gx, gy, gz + 1, P.inner);
          if (grid.has(gx, gy, gz - 1)) grid.set(gx, gy, gz - 1, P.inner);
        }
      }
    };
    for (const f of frames) carve(f);
    // Walkable height is the lowest run's top
    const surface = new Float32Array(SX * SZ);
    const land = new Uint8Array(SX * SZ);
    for (let gx = 0; gx < SX; gx++) {
      for (let gz = 0; gz < SZ; gz++) {
        const column = (gx * SY) * SZ + gz;
        let gy = 0;
        while (gy < SY && !data[column + gy * SZ]) gy++;
        if (gy === SY) continue;
        while (gy < SY && data[column + gy * SZ]) gy++;
        const i = gx * SZ + gz;
        height[i] = (gy - SURFACE) * UNIT;
        land[i] = 1;
        let top = SY;
        while (top > gy && !data[column + (top - 1) * SZ]) top--;
        surface[i] = (top - SURFACE) * UNIT;
      }
    }
    const column = (x, z) => {
      const gx = Math.floor((x - ORIGIN.x) / UNIT), gz = Math.floor((z - ORIGIN.z) / UNIT);
      return gx >= 0 && gz >= 0 && gx < SX && gz < SZ ? gx * SZ + gz : -1;
    };
    const heightAt = (x, z) => {
      const i = column(x, z);
      return i < 0 ? 0 : height[i];
    };
    const surfaceAt = (x, z) => {
      const i = column(x, z);
      return i < 0 ? 0 : surface[i];
    };
    const isPath = (x, z) => {
      const i = column(x, z);
      return i >= 0 && paths[i] === 1;
    };
    const onLand = (x, z) => {
      const i = column(x, z);
      return i >= 0 && land[i] === 1;
    };
    const inside = (ROOM.from + ROOM.to) / 2;
    const mouths = frames.map((f) => ({ id: f.id, clock: f.clock, angle: f.angle, x: f.x, z: f.z, ry: facing(f.axis), floorY: 0, inside: { x: f.x + f.ox * inside, z: f.z + f.oz * inside }, apron: { x: f.x - f.ox * 1.6, z: f.z - f.oz * 1.6 } }));
    const built = {
      geometry: gridGeometry(grid, { unit: UNIT, palette: PALETTE, origin: ORIGIN }),
      heightAt,
      surfaceAt,
      isPath,
      onLand,
      mouths,
      gate: { x: 0, z: GATE_Z, ry: 0 },
      radius: RADIUS,
      meadowRadius: MEADOW,
      passHalf: PASS_HALF,
      unit: UNIT
    };
    ISLANDS.set(seed, built);
    return built;
  };
  BL.terrain = { makeGrid, gridGeometry, island, PALETTE, MAX_HEIGHT };
})();
