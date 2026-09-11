// Race tracks: a closed spline becomes a road ribbon, terrain skirt, walls and baked decor in culled sectors
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, lerp, mulberry32, hexToRgb } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;
  const { hubModels, raceModels, daylight } = BL;
  const SURF = { road: 0, sand: 1, board: 2, gap: 3, ice: 4, lava: 5, snow: 6, crystal: 7, ash: 8 };
  // Speed and grip per surface, off-road ones under 1
  const SURFACE_GRIP = [1, 0.55, 1, 0, 0.5, 1, 0.6, 1, 0.6];
  const SURFACE_SLIP = [0, 0, 0, 0, 1, 0, 0.35, 0, 0];
  const STEP = 1.5;
  const SHOULDER = 1.6, CURB_W = 0.55, WALL_H = 1.3, FALL = 7;
  // The slab rides above the skirt with a crown and raised rumble curbs
  const ROAD_LIFT = 0.26, SLAB_DEPTH = 0.22, CROWN = 0.05, CURB_H = 0.11;
  const CELL = 3, MARGIN = 48, CHUNK = 20;
  const SECTOR_LENGTH = 42;
  const CHECKPOINTS = 8;
  const LIP = 1.7, LIP_SAMPLES = 5, RUNWAY = 45;
  const LOD_FAR = 95;
  const GRID_GAP = 4.6;
  // One instanced batch: the whole crowd is a single draw however large
  const SPECTATOR_CAP = 320;
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
  const rgb = (hex) => hexToRgb(hex);
  const shadeRgb = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
  const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  const geometry = () => ({ verts: [], faces: [], lines: [] });
  const quad = (geo, a, b, c, d, color, emissive = 0) => geo.faces.push({ i: [a, b, c, d], color, emissive });
  const vert = (geo, x, y, z) => {
    geo.verts.push(x, y, z);
    return geo.verts.length / 3 - 1;
  };
  // Append a geometry turned about y and scaled, into a sector's merged mesh
  const bake = (out, geo, x, y, z, yaw, s = 1) => {
    const base = out.verts.length / 3, v = geo.verts, c = Math.cos(yaw), sn = Math.sin(yaw);
    for (let i = 0; i < v.length; i += 3) {
      const px = v[i] * s, py = v[i + 1] * s, pz = v[i + 2] * s;
      out.verts.push(x + px * c + pz * sn, y + py, z + pz * c - px * sn);
    }
    for (const f of geo.faces) out.faces.push({ i: f.i.map((k) => k + base), color: f.color, emissive: f.emissive });
  };
  const writeInstance = (data, o, yaw, s, x, y, z, glow = 1) => {
    const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s;
    data[o] = c; data[o + 1] = 0; data[o + 2] = -sn; data[o + 3] = 0;
    data[o + 4] = 0; data[o + 5] = s; data[o + 6] = 0; data[o + 7] = 0;
    data[o + 8] = sn; data[o + 9] = 0; data[o + 10] = c; data[o + 11] = 0;
    data[o + 12] = x; data[o + 13] = y; data[o + 14] = z; data[o + 15] = 1;
    data[o + 16] = glow; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
  };

  // ---------- themes ----------
  const skyOpts = (hour) => {
    const opts = {
      clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
      light: { x: 0.5, y: 0.8, z: 0.2 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, starMatrix: new Float32Array(9), stars: 0, time: 0,
      lights: new Float32Array(80), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 38, bloomStrength: 0.55
    };
    daylight.sample(hour, opts, 172, 20);
    // Fog fades into the horizon colour the sky pass paints
    opts.fog = opts.horizon;
    opts.fogNear = hour > 18 ? 60 : 110;
    opts.fogFar = hour > 18 ? 230 : 320;
    return opts;
  };
  const caveOpts = (clear, sky, ground, sun, light) => ({
    clear: new Float32Array(clear), sky: new Float32Array(sky), ground: new Float32Array(ground), sun: new Float32Array(sun), direct: new Float32Array(sun),
    light, directStrength: 0.9, ambientFloor: 0.26, diffuseFloor: 0.1, shadowStrength: 0.75, shadowFloor: 0.45, shadowBias: 0.003,
    lights: new Float32Array(80), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 38, bloomStrength: 0.85,
    fog: new Float32Array(clear), fogNear: 28, fogFar: 125
  });
  const THEMES = {
    bay: {
      renderOpts: () => skyOpts(9.5),
      road: [rgb("#b9a27a"), rgb("#ad9670"), rgb("#c2ab82")], line: rgb("#e9dcb8"), board: [rgb("#9c7040"), rgb("#8f6538")],
      curb: [rgb("#e04a3a"), rgb("#f3efe4")], wall: rgb("#8d857b"), wallTop: rgb("#a39a8f"), slab: rgb("#8c7a5a"), shoulder: rgb("#d8c48e"), seams: null,
      offroad: SURF.sand,
      floor: { level: -1.3, color: rgb("#2f8f9c"), emissive: 0.12, deep: rgb("#1f6b78") },
      height: (n, d) => n * 5 - 1.6,
      ground: (h, n) => h < 0.4 ? mix(rgb("#e0cf9c"), rgb("#d2bf8a"), n) : h < 1.6 ? mix(rgb("#8fb04a"), rgb("#7a9a3c"), n) : mix(rgb("#6f8f3a"), rgb("#5f7a30"), n),
      decor: [
        { build: (i) => raceModels.palm(i % 3), p: 0.22, near: [3, 16], scale: [0.85, 1.3], big: true },
        { build: (i) => raceModels.lagoonRock(i % 2), p: 0.05, near: [6, 22], scale: [0.7, 1.1], big: true },
        { build: (i) => hubModels.bush(i % 3), p: 0.3, near: [2.5, 14], scale: [0.9, 1.4], big: true },
        { build: () => hubModels.grass(), p: 0.9, near: [1.5, 18], scale: [1.2, 2], big: false },
        { build: () => hubModels.flowerTuft(), p: 0.35, near: [2, 12], scale: [1, 1.5], big: false }
      ],
      water: { build: () => raceModels.buoy(), p: 0.12, near: [6, 20] },
      spectators: true,
      torches: 0,
      banners: [rgb("#f5c542"), rgb("#22c55e")]
    },
    gorge: {
      renderOpts: () => caveOpts([0.09, 0.03, 0.02], [0.55, 0.32, 0.24], [0.62, 0.24, 0.1], [0.95, 0.6, 0.4], { x: 0.3, y: 0.9, z: -0.2 }),
      road: [rgb("#5a524d"), rgb("#4e4743"), rgb("#635a55")], line: rgb("#8d7d70"), board: [rgb("#5c5048"), rgb("#4f453e")],
      curb: [rgb("#ff6a1e"), rgb("#3a3330")], wall: rgb("#4a413a"), wallTop: rgb("#6a5f57"), slab: rgb("#2b2724"), shoulder: rgb("#3a3330"), seams: rgb("#ff6a1e"),
      offroad: SURF.ash,
      floor: { level: 0.3, color: rgb("#ff5a12"), emissive: 1, deep: rgb("#ffa02a") },
      height: (n, d) => n * 12 - 5.4,
      ground: (h, n) => h < 1 ? mix(rgb("#3a3330"), rgb("#2b2724"), n) : h < 3.5 ? mix(rgb("#4a413a"), rgb("#3a3330"), n) : mix(rgb("#5e5449"), rgb("#4a413a"), n),
      decor: [
        { build: (i) => raceModels.lavaRock(i % 3), p: 0.16, near: [3, 16], scale: [0.8, 1.3], big: true },
        { build: (i) => raceModels.obsidianSpike(i % 3), p: 0.14, near: [3, 14], scale: [0.8, 1.4], big: true },
        { build: () => raceModels.bones(), p: 0.12, near: [2, 10], scale: [0.9, 1.3], big: false },
        { build: (i) => hubModels.rock(i % 2), p: 0.2, near: [2, 12], scale: [0.7, 1.2], big: false }
      ],
      water: null,
      spectators: true,
      torches: 11,
      ceiling: { y: 15, amp: 6, color: [rgb("#3a3330"), rgb("#2b2724")], drips: 0.5 },
      banners: [rgb("#ff6a1e"), rgb("#f5c542")]
    },
    peak: {
      renderOpts: () => skyOpts(23),
      road: [rgb("#8fa2ad"), rgb("#84969f"), rgb("#9bb0bb")], line: rgb("#dbe8ef"), board: [rgb("#b9dcf0"), rgb("#a9d0e8")],
      curb: [rgb("#4a78b8"), rgb("#eef3f7")], wall: rgb("#586470"), wallTop: rgb("#eef3f7"), slab: rgb("#5c6b78"), shoulder: rgb("#dfe9f0"), seams: null,
      offroad: SURF.snow,
      floor: { level: -2.2, color: rgb("#1c2a3a"), emissive: 0, deep: rgb("#121c28") },
      height: (n, d) => n * 14 - 3,
      ground: (h, n) => h < 1 ? mix(rgb("#dfe9f0"), rgb("#cfdde8"), n) : h < 6 ? mix(rgb("#eef3f7"), rgb("#dfe9f0"), n) : mix(rgb("#f6f9fb"), rgb("#eef3f7"), n),
      decor: [
        { build: (i) => raceModels.pine(i % 3), p: 0.24, near: [3, 18], scale: [0.9, 1.4], big: true },
        { build: (i) => raceModels.snowRock(i % 2), p: 0.08, near: [4, 20], scale: [0.7, 1.2], big: true },
        { build: (i) => raceModels.iceSpike(i % 3), p: 0.14, near: [2.5, 12], scale: [0.8, 1.3], big: false },
        { build: (i) => raceModels.crystal(i % 3), p: 0.1, near: [2.5, 10], scale: [0.8, 1.4], big: false, surface: SURF.crystal }
      ],
      water: null,
      spectators: true,
      torches: 4,
      banners: [rgb("#79d8ff"), rgb("#c99bff")]
    }
  };

  // ---------- track definitions ----------
  // x, z, y, options: w width, bank radians (right edge up), surface, wall 1 left 2 right 3 both, curb
  const P = (x, z, y = 0, o = {}) => ({ x, z, y, w: 11, bank: 0, surface: SURF.road, wall: 0, curb: 1, pad: 0, ...o });
  const TRACKS = [
    {
      id: "bay", name: "Banana Bay", theme: "bay", laps: 3, seed: 11, hazard: "water",
      targets: { gold: 82000, silver: 96000, bronze: 118000 },
      points: [
        P(-90, 60, 0, { w: 13.0 }), P(-40, 63), P(20, 60), P(70, 52, 0.3, { bank: 0.14 }), P(112, 25, 1, { bank: 0.22, w: 11.7 }), P(130, -15, 2, { bank: 0.12 }),
        P(120, -55, 2.4, { surface: SURF.board, curb: 0, wall: 3, w: 9.75 }), P(85, -85, 2.6, { surface: SURF.board, curb: 0, wall: 3, w: 9.75 }),
        P(45, -98, 2.8, { surface: SURF.board, curb: 0, wall: 3, w: 9.75, pad: 1 }), P(24, -100, 3.4, { surface: SURF.board, curb: 0, wall: 3, w: 9.75 }),
        P(14, -100, 3.6, { surface: SURF.gap, w: 9.75 }), P(2, -99, 2.2, { surface: SURF.gap, w: 9.75 }), P(-8, -97, 1.6, { w: 10.4 }),
        P(-45, -90, 0.6), P(-78, -70, 0, { bank: -0.16 }), P(-100, -40, 0, { bank: -0.2, w: 11.7 }), P(-96, -5, 0), P(-118, 22, 0.4, { bank: 0.1 }), P(-112, 50, 0.2)
      ]
    },
    {
      id: "gorge", name: "Lava Gorge", theme: "gorge", laps: 3, seed: 23, hazard: "lava",
      targets: { gold: 112000, silver: 132000, bronze: 158000 },
      points: [
        P(-80, 70, 0, { w: 11.7, wall: 3 }), P(-20, 74, 0, { wall: 3 }), P(40, 70, 0.4, { wall: 3 }), P(85, 50, 1.2, { bank: 0.2, wall: 3 }), P(100, 10, 2.4, { bank: 0.16, wall: 3, w: 10.4 }),
        P(80, -25, 3.2, { w: 9.1, wall: 0, curb: 1 }), P(45, -30, 3.6, { w: 9.1, curb: 1 }), P(30, -5, 4.2, { w: 9.1, bank: -0.18, wall: 3 }), P(50, 22, 4.8, { w: 9.1, wall: 3 }),
        P(20, 45, 5.2, { bank: 0.1, wall: 3 }), P(-20, 40, 5.6, { w: 9.75, wall: 1 }), P(-55, 20, 5.2, { w: 9.75, surface: SURF.board, wall: 0, curb: 0 }), P(-85, -10, 4.2, { w: 9.75, surface: SURF.board, wall: 0, curb: 0 }),
        P(-95, -50, 3, { bank: -0.2, wall: 3 }), P(-70, -85, 1.6, { bank: -0.12, wall: 3 }), P(-20, -95, 0.6, { wall: 3 }), P(20, -78, 0.2, { bank: 0.18, wall: 3, w: 9.1 }), P(0, -50, 0, { bank: 0.16, wall: 3, w: 9.1 }),
        P(-40, -40, 0, { wall: 3 }), P(-90, -10, 0, { wall: 3 }), P(-105, 35, 0, { wall: 3, bank: 0.1 })
      ]
    },
    {
      id: "peak", name: "Frost Peak", theme: "peak", laps: 3, seed: 37, hazard: "void",
      targets: { gold: 136000, silver: 156000, bronze: 186000 },
      points: [
        P(-100, 80, 0, { w: 11.7 }), P(-40, 84, 0.2), P(20, 80, 1), P(70, 62, 2.4, { bank: 0.18 }), P(105, 30, 4.4, { bank: 0.24, wall: 2 }), P(112, -10, 6.8, { bank: 0.12, wall: 2 }),
        P(85, -40, 9, { bank: -0.2, wall: 1, w: 10.4 }), P(45, -30, 11, { bank: -0.2, wall: 3, w: 9.75 }), P(20, -60, 13.2, { bank: 0.16, wall: 3, w: 9.75 }),
        P(-20, -75, 15, { surface: SURF.ice, curb: 0, wall: 3, w: 10.4 }), P(-60, -60, 16.2, { surface: SURF.ice, curb: 0, wall: 3, w: 10.4, bank: -0.18 }), P(-85, -20, 17, { surface: SURF.ice, curb: 0, wall: 3, w: 10.4 }),
        P(-70, 15, 17.6, { surface: SURF.crystal, curb: 0, wall: 3, w: 9.75 }), P(-30, 30, 18, { surface: SURF.crystal, curb: 0, wall: 3, w: 9.75 }), P(10, 20, 18.4, { surface: SURF.crystal, curb: 0, wall: 3, w: 9.75 }),
        P(40, -2, 19.6, { w: 10.4, wall: 3 }), P(52, -22, 21, { w: 10.4, wall: 3, pad: 1 }), P(58, -33, 21.4, { w: 10.4, surface: SURF.gap, wall: 3 }), P(64, -43, 15, { w: 10.4, surface: SURF.gap }), P(70, -55, 11, { w: 11.7 }),
        P(58, -92, 8, { w: 11.7, bank: 0.16 }), P(5, -108, 5, { w: 11.7 }), P(-55, -100, 3, { bank: -0.14, w: 11.7 }), P(-95, -70, 2.5, { bank: -0.16 }), P(-118, -20, 2), P(-115, 30, 1.4, { bank: 0.08 }), P(-108, 58, 0.8)
      ]
    }
  ];
  const trackById = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

  // ---------- spline ----------
  const catmull = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  // Resample the closed spline at STEP along its arc into structure-of-arrays samples
  const sampleSpline = (points) => {
    const n = points.length;
    const fine = [];
    for (let s = 0; s < n; s++) {
      const a = points[(s - 1 + n) % n], b = points[s], c = points[(s + 1) % n], d = points[(s + 2) % n];
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        fine.push({ x: catmull(a.x, b.x, c.x, d.x, t), y: catmull(a.y, b.y, c.y, d.y, t), z: catmull(a.z, b.z, c.z, d.z, t), seg: s, t });
      }
    }
    let total = 0;
    const lengths = new Float32Array(fine.length);
    for (let i = 0; i < fine.length; i++) {
      const p = fine[i], q = fine[(i + 1) % fine.length];
      lengths[i] = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      total += lengths[i];
    }
    const count = Math.max(8, Math.round(total / STEP));
    const step = total / count;
    const out = { count, length: total, x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count), tx: new Float32Array(count), tz: new Float32Array(count), w: new Float32Array(count), bank: new Float32Array(count), surface: new Uint8Array(count), wall: new Uint8Array(count), curb: new Uint8Array(count), dist: new Float32Array(count), curvature: new Float32Array(count), line: new Float32Array(count), pad: new Uint8Array(count) };
    let fi = 0, acc = 0;
    for (let i = 0; i < count; i++) {
      const target = i * step;
      while (acc + lengths[fi] < target && fi < fine.length - 1) {
        acc += lengths[fi];
        fi++;
      }
      const p = fine[fi], q = fine[(fi + 1) % fine.length];
      const k = lengths[fi] > 0 ? clamp((target - acc) / lengths[fi], 0, 1) : 0;
      out.x[i] = lerp(p.x, q.x, k);
      out.y[i] = lerp(p.y, q.y, k);
      out.z[i] = lerp(p.z, q.z, k);
      out.dist[i] = target;
      // Per-point attributes follow the nearer control point of the segment
      const s = p.seg, t = p.t + k / 12;
      const b = points[s], c = points[(s + 1) % n];
      const near = t < 0.5 ? b : c;
      out.w[i] = lerp(b.w, c.w, smooth(t));
      out.bank[i] = lerp(b.bank, c.bank, smooth(t));
      out.surface[i] = near.surface;
      out.wall[i] = near.wall;
      out.curb[i] = near.curb;
      out.pad[i] = near.pad ? 1 : 0;
    }
    // The road rises into a lip over the last samples before a gap, so a fast racer launches clear
    for (let i = 0; i < count; i++) {
      if (out.surface[i] !== SURF.gap || out.surface[(i - 1 + count) % count] === SURF.gap) continue;
      for (let k = 1; k <= LIP_SAMPLES; k++) {
        const j = (i - k + count) % count, t = 1 - (k - 1) / LIP_SAMPLES;
        out.y[j] += LIP * t * t;
      }
    }
    for (let i = 0; i < count; i++) {
      const p = (i - 1 + count) % count, q = (i + 1) % count;
      let tx = out.x[q] - out.x[p], tz = out.z[q] - out.z[p];
      const len = Math.hypot(tx, tz) || 1;
      out.tx[i] = tx / len;
      out.tz[i] = tz / len;
    }
    // Signed curvature from the heading change per unit length, then a smoothed racing line offset
    for (let i = 0; i < count; i++) {
      const p = (i - 1 + count) % count, q = (i + 1) % count;
      const cross = out.tx[p] * out.tz[q] - out.tz[p] * out.tx[q];
      out.curvature[i] = Math.asin(clamp(cross, -1, 1)) / (2 * step);
    }
    for (let i = 0; i < count; i++) {
      let sum = 0;
      for (let k = -6; k <= 14; k++) sum += out.curvature[(i + k + count) % count];
      out.line[i] = clamp(sum / 21 * 260, -1, 1);
    }
    return out;
  };

  // ---------- build ----------
  const build = (def, { renderer, detail = 1, rain = false }) => {
    const theme = THEMES[def.theme];
    // Weather: rain on the outdoor tracks, snow on the peak, never in the gorge
    const wet = rain && !theme.ceiling;
    const precipitation = wet ? (def.theme === "peak" ? "snow" : "rain") : null;
    const rand = mulberry32(def.seed);
    const noise = valueNoise(mulberry32(def.seed + 1));
    const S = sampleSpline(def.points);
    const n = S.count;
    const root = createNode();
    const geometries = [];
    const keep = (geo) => {
      geometries.push(geo);
      return geo;
    };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, S.x[i]);
      maxX = Math.max(maxX, S.x[i]);
      minZ = Math.min(minZ, S.z[i]);
      maxZ = Math.max(maxZ, S.z[i]);
    }
    const bounds = { minX: minX - MARGIN, maxX: maxX + MARGIN, minZ: minZ - MARGIN, maxZ: maxZ + MARGIN };
    // Coarse grid of sample indices for cold lookups
    const GRID = 8;
    const gw = Math.ceil((bounds.maxX - bounds.minX) / GRID), gh = Math.ceil((bounds.maxZ - bounds.minZ) / GRID);
    const cellOf = (x, z) => clamp(Math.floor((x - bounds.minX) / GRID), 0, gw - 1) * gh + clamp(Math.floor((z - bounds.minZ) / GRID), 0, gh - 1);
    const cellLists = Array.from({ length: gw * gh }, () => []);
    for (let i = 0; i < n; i++) cellLists[cellOf(S.x[i], S.z[i])].push(i);
    const cellStart = new Int32Array(gw * gh + 1);
    const cellItems = new Int32Array(n);
    for (let c = 0, o = 0; c < cellLists.length; c++) {
      cellStart[c] = o;
      for (const i of cellLists[c]) cellItems[o++] = i;
    }
    cellStart[gw * gh] = n;
    const d2 = (i, x, z) => (S.x[i] - x) ** 2 + (S.z[i] - z) ** 2;
    const nearestCold = (x, z) => {
      const cx = clamp(Math.floor((x - bounds.minX) / GRID), 0, gw - 1), cz = clamp(Math.floor((z - bounds.minZ) / GRID), 0, gh - 1);
      let best = -1, bestD = Infinity;
      for (let r = 1; r <= Math.max(gw, gh) && best < 0; r++) {
        for (let gx = Math.max(0, cx - r); gx <= Math.min(gw - 1, cx + r); gx++) {
          for (let gz = Math.max(0, cz - r); gz <= Math.min(gh - 1, cz + r); gz++) {
            const c = gx * gh + gz;
            for (let o = cellStart[c]; o < cellStart[c + 1]; o++) {
              const d = d2(cellItems[o], x, z);
              if (d < bestD) {
                bestD = d;
                best = cellItems[o];
              }
            }
          }
        }
      }
      return best < 0 ? 0 : best;
    };
    // Walk from a hint while the distance falls; the hint is the caller's last answer
    const nearest = (x, z, hint = -1) => {
      if (hint < 0) return nearestCold(x, z);
      let i = hint, d = d2(i, x, z);
      for (let k = 0; k < 24; k++) {
        const q = (i + 1) % n, dq = d2(q, x, z);
        if (dq >= d) break;
        i = q;
        d = dq;
      }
      for (let k = 0; k < 24; k++) {
        const p = (i - 1 + n) % n, dp = d2(p, x, z);
        if (dp >= d) break;
        i = p;
        d = dp;
      }
      return i;
    };
    const rightX = (i) => -S.tz[i], rightZ = (i) => S.tx[i];
    // Signed lateral distance and along-fraction to the next sample, written into out
    const project = (x, z, i, out) => {
      const q = (i + 1) % n;
      const dx = x - S.x[i], dz = z - S.z[i];
      out.lateral = dx * rightX(i) + dz * rightZ(i);
      out.along = clamp((dx * S.tx[i] + dz * S.tz[i]) / STEP, -1, 1);
      out.index = i;
      out.next = q;
      return out;
    };
    // Interpolate toward whichever neighbour the point lies between, so the height never steps at a sample
    const roadY = (i, along, lateral) => {
      const back = along < 0;
      const a = back ? (i - 1 + n) % n : i, b = back ? i : (i + 1) % n;
      const k = clamp(back ? 1 + along : along, 0, 1);
      return lerp(S.y[a], S.y[b], k) + lateral * Math.tan(lerp(S.bank[a], S.bank[b], k));
    };
    const halfAt = (i) => S.w[i] * 0.5;
    // The driving surface: the slab top with its crown
    const slabY = (i, along, lateral) => roadY(i, along, lateral) + ROAD_LIFT + (S.surface[i] === SURF.board ? 0 : CROWN * (1 - Math.min(1, Math.abs(lateral) / halfAt(i))));
    // Terrain heightfield
    const nx = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 1, nz = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 1;
    const heights = new Float32Array(nx * nz);
    const water = new Uint8Array(nx * nz);
    const floor = theme.floor;
    for (let gx = 0; gx < nx; gx++) {
      const wx = bounds.minX + gx * CELL;
      for (let gz = 0; gz < nz; gz++) {
        const wz = bounds.minZ + gz * CELL;
        const i = nearestCold(wx, wz);
        const dx = wx - S.x[i], dz = wz - S.z[i];
        const d = Math.hypot(dx, dz);
        const lat = dx * rightX(i) + dz * rightZ(i);
        const half = halfAt(i);
        const gap = S.surface[i] === SURF.gap, bridge = S.surface[i] === SURF.board;
        let h = theme.height(noise(wx / 26 + 40, wz / 26 + 40), d);
        const road = roadY(i, 0, clamp(lat, -half, half)) - SLAB_DEPTH - 0.1;
        // Bridges cross whatever lies below; elsewhere the skirt meets the road
        if (gap) h = Math.min(h, floor.level - 1.2);
        else if (bridge) h = Math.min(h, road - 1.6, floor.level + 0.6 * smooth((d - half - 3) / 8) + (h - floor.level) * smooth((d - half - 3) / 8));
        else h = lerp(road, h + (noise(wx / 4 + 900, wz / 4 + 900) - 0.5) * 0.5, smooth((d - half - SHOULDER - 1) / 7));
        const k = gx * nz + gz;
        if (h < floor.level) {
          heights[k] = floor.level;
          water[k] = 1;
        } else heights[k] = h;
      }
    }
    const groundAt = (x, z) => {
      const fx = clamp((x - bounds.minX) / CELL, 0, nx - 1.001), fz = clamp((z - bounds.minZ) / CELL, 0, nz - 1.001);
      const gx = Math.floor(fx), gz = Math.floor(fz), tx = fx - gx, tz = fz - gz;
      const a = heights[gx * nz + gz], b = heights[(gx + 1) * nz + gz], c = heights[gx * nz + gz + 1], d = heights[(gx + 1) * nz + gz + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
    };
    const waterAt = (x, z) => {
      const gx = clamp(Math.round((x - bounds.minX) / CELL), 0, nx - 1), gz = clamp(Math.round((z - bounds.minZ) / CELL), 0, nz - 1);
      return water[gx * nz + gz] === 1;
    };
    const SAMPLE = { lateral: 0, along: 0, index: 0, next: 0 };
    // Height under a point: the ribbon on the road, the skirt off it, the hazard floor over a gap
    const heightAt = (x, z, hint = -1, out = null) => {
      const i = nearest(x, z, hint);
      const s = out ? project(x, z, i, out) : project(x, z, i, SAMPLE);
      const half = halfAt(i), a = Math.abs(s.lateral);
      if (S.surface[i] === SURF.gap) return floor.level - 1;
      if (a <= half) return slabY(i, s.along, s.lateral);
      const edge = roadY(i, s.along, Math.sign(s.lateral) * half) + ROAD_LIFT;
      if (S.curb[i] && a <= half + CURB_W) return edge + CURB_H;
      const start = S.curb[i] ? half + CURB_W : half;
      return lerp(edge - 0.05, groundAt(x, z), smooth((a - start) / SHOULDER));
    };
    const surfaceAt = (x, z, i, lateral) => {
      if (S.surface[i] === SURF.gap) return SURF.gap;
      if (Math.abs(lateral) <= halfAt(i) + CURB_W) return S.surface[i];
      return waterAt(x, z) ? SURF.gap : theme.offroad;
    };

    // ---------- sectors ----------
    const sectorCount = Math.max(6, Math.round(S.length / SECTOR_LENGTH));
    const perSector = Math.ceil(n / sectorCount);
    const sectors = [];
    const roadColors = theme.road, boardColors = theme.board;
    // Lane columns across the slab, outer lanes a shade darker where tyres never run
    const LANES = [-1, -0.62, -0.06, 0.06, 0.62, 1];
    const edgeAt = (k, side, extra = 0) => {
      const off = side * (halfAt(k) + extra);
      return { x: S.x[k] + rightX(k) * off, z: S.z[k] + rightZ(k) * off, y: roadY(k, 0, off) };
    };
    // A block with a top and four sides, its base open, turned to the road's tangent
    const block = (geo, cx, cy, cz, w, h, d, k, color, emissive = 0, bottom = false) => {
      const tx = S.tx[k], tz = S.tz[k], rx = rightX(k), rz = rightZ(k);
      const at = (u, v, y) => vert(geo, cx + rx * u + tx * v, y, cz + rz * u + tz * v);
      const a0 = at(-w / 2, -d / 2, cy), b0 = at(w / 2, -d / 2, cy), c0 = at(w / 2, d / 2, cy), d0 = at(-w / 2, d / 2, cy);
      const a1 = at(-w / 2, -d / 2, cy + h), b1 = at(w / 2, -d / 2, cy + h), c1 = at(w / 2, d / 2, cy + h), d1 = at(-w / 2, d / 2, cy + h);
      quad(geo, a1, d1, c1, b1, color, emissive);
      if (bottom) quad(geo, a0, b0, c0, d0, color, emissive);
      quad(geo, a0, b0, b1, a1, color, emissive);
      quad(geo, b0, c0, c1, b1, color, emissive);
      quad(geo, c0, d0, d1, c1, color, emissive);
      quad(geo, d0, a0, a1, d1, color, emissive);
    };
    for (let s = 0; s < sectorCount; s++) {
      const from = s * perSector, to = Math.min(n, from + perSector);
      if (from >= n) break;
      const road = geometry(), big = geometry(), small = geometry(), walls = big;
      road.castShadow = false;
      const rows = [];
      for (let i = from; i <= to; i++) {
        const k = i % n, half = halfAt(k), row = [];
        for (const lane of LANES) row.push(vert(road, S.x[k] + rightX(k) * lane * half, roadY(k, 0, lane * half) + ROAD_LIFT + CROWN * (1 - Math.abs(lane)), S.z[k] + rightZ(k) * lane * half));
        rows.push(row);
      }
      for (let i = from; i < to; i++) {
        const k = i % n, q = (k + 1) % n, r0 = rows[i - from], r1 = rows[i - from + 1];
        if (S.surface[k] === SURF.gap) continue;
        const board = S.surface[k] === SURF.board;
        const ice = S.surface[k] === SURF.ice, crystal = S.surface[k] === SURF.crystal;
        const tone = noise(S.x[k] / 9, S.z[k] / 9);
        const base = board ? boardColors[i % 2] : roadColors[Math.floor(tone * roadColors.length) % roadColors.length];
        const dry = ice ? mix(base, rgb("#cfe6f5"), 0.55) : crystal ? mix(base, rgb("#b8ecff"), 0.35) : base;
        const c = wet ? mix(shadeRgb(dry, 0.74), rgb("#6d7a8a"), 0.18) : dry;
        const worn = shadeRgb(c, 0.9);
        if (board) {
          // Two planks a segment, each a slab with seams between, on cross beams and piles
          const width = halfAt(k) * 2 + 0.16;
          for (let pk = 0; pk < 2; pk++) {
            const along = (pk + 0.5) * (STEP / 2);
            const jitter = (noise(S.x[k] / 2 + pk * 3 + 40, S.z[k] / 2 + 40) - 0.5) * 0.03;
            const cx = S.x[k] + S.tx[k] * along, cz = S.z[k] + S.tz[k] * along;
            block(road, cx, roadY(k, along / STEP, 0) + ROAD_LIFT - 0.17 + jitter, cz, width, 0.17, STEP / 2 - 0.08, k, shadeRgb(boardColors[(i * 2 + pk) % 2], 0.95 + jitter * 3), 0, true);
          }
          if (i % 4 === 0) {
            const beamY = roadY(k, 0, 0) + ROAD_LIFT - 0.5;
            block(walls, S.x[k], beamY, S.z[k], width + 1, 0.3, 0.34, k, rgb("#5c4425"));
            for (const side of [-1, 1]) {
              const e = edgeAt(k, side, 0.2), gy = Math.min(groundAt(e.x, e.z), floor.level) - 0.3;
              block(walls, e.x, gy, e.z, 0.36, Math.max(0.4, beamY - gy + 0.1), 0.36, k, rgb("#4a3319"));
            }
          }
        } else for (let l = 0; l < LANES.length - 1; l++) {
          const middle = l === 2;
          const stripe = middle && !board && (i >> 1) % 2 === 0;
          const outer = l === 0 || l === LANES.length - 2;
          quad(road, r0[l + 1], r1[l + 1], r1[l], r0[l], stripe ? theme.line : outer && !board ? worn : c, ice || crystal ? 0.12 : 0);
        }
        // Cracks on ice, glowing seams on lava rock, an odd darker plank on a boardwalk
        if (ice && (i * 7) % 5 === 0) {
          const lat = (tone - 0.5) * halfAt(k) * 1.4;
          const o = { x: S.x[k] + rightX(k) * lat, z: S.z[k] + rightZ(k) * lat };
          const dx = rightX(k) * 0.05 + S.tx[k] * 0.9, dz = rightZ(k) * 0.05 + S.tz[k] * 0.9;
          const y = roadY(k, 0, lat) + ROAD_LIFT + CROWN + 0.006;
          const v0 = vert(road, o.x - rightX(k) * 0.03, y, o.z - rightZ(k) * 0.03), v1 = vert(road, o.x + rightX(k) * 0.03, y, o.z + rightZ(k) * 0.03);
          const v2 = vert(road, o.x + dx + rightX(k) * 0.03, y, o.z + dz + rightZ(k) * 0.03), v3 = vert(road, o.x + dx - rightX(k) * 0.03, y, o.z + dz - rightZ(k) * 0.03);
          quad(road, v0, v3, v2, v1, rgb("#4a78b8"));
        } else if (theme.seams && !board && (i * 11) % 7 === 0) {
          const lat = (tone - 0.5) * halfAt(k) * 1.5;
          const o = { x: S.x[k] + rightX(k) * lat, z: S.z[k] + rightZ(k) * lat };
          const dx = S.tx[k] * 1.1 + rightX(k) * (tone - 0.5) * 0.8, dz = S.tz[k] * 1.1 + rightZ(k) * (tone - 0.5) * 0.8;
          const y = roadY(k, 0, lat) + ROAD_LIFT + CROWN + 0.006;
          const v0 = vert(road, o.x - rightX(k) * 0.04, y, o.z - rightZ(k) * 0.04), v1 = vert(road, o.x + rightX(k) * 0.04, y, o.z + rightZ(k) * 0.04);
          const v2 = vert(road, o.x + dx + rightX(k) * 0.04, y, o.z + dz + rightZ(k) * 0.04), v3 = vert(road, o.x + dx - rightX(k) * 0.04, y, o.z + dz - rightZ(k) * 0.04);
          quad(road, v0, v3, v2, v1, theme.seams, 0.9);
        }
        // Slab sides down to the skirt, then a shoulder out to the terrain
        for (const side of [-1, 1]) {
          const e0 = edgeAt(k, side), e1 = edgeAt(q, side);
          const top0 = e0.y + ROAD_LIFT, top1 = e1.y + ROAD_LIFT, bottom0 = e0.y - SLAB_DEPTH, bottom1 = e1.y - SLAB_DEPTH;
          const t0 = vert(road, e0.x, top0, e0.z), t1 = vert(road, e1.x, top1, e1.z), b0 = vert(road, e0.x, bottom0, e0.z), b1 = vert(road, e1.x, bottom1, e1.z);
          const sideColor = board ? rgb("#5c4425") : theme.slab;
          if (side > 0) quad(road, t0, t1, b1, b0, sideColor);
          else quad(road, t0, b0, b1, t1, sideColor);
          if (S.curb[k]) {
            // A raised rumble strip, alternating colours, its inner face rising from the slab
            const inner0 = edgeAt(k, side, 0.02), inner1 = edgeAt(q, side, 0.02), outer0 = edgeAt(k, side, CURB_W), outer1 = edgeAt(q, side, CURB_W);
            const color = theme.curb[(i >> 1) % 2];
            const ci0 = vert(road, inner0.x, inner0.y + ROAD_LIFT, inner0.z), ci1 = vert(road, inner1.x, inner1.y + ROAD_LIFT, inner1.z);
            const ct0 = vert(road, inner0.x, inner0.y + ROAD_LIFT + CURB_H, inner0.z), ct1 = vert(road, inner1.x, inner1.y + ROAD_LIFT + CURB_H, inner1.z);
            const co0 = vert(road, outer0.x, outer0.y + ROAD_LIFT + CURB_H, outer0.z), co1 = vert(road, outer1.x, outer1.y + ROAD_LIFT + CURB_H, outer1.z);
            const cb0 = vert(road, outer0.x, outer0.y + ROAD_LIFT - 0.05, outer0.z), cb1 = vert(road, outer1.x, outer1.y + ROAD_LIFT - 0.05, outer1.z);
            if (side > 0) {
              quad(road, ci0, ct0, ct1, ci1, color);
              quad(road, ct0, co0, co1, ct1, color);
              quad(road, co0, cb0, cb1, co1, theme.slab);
            } else {
              quad(road, ci0, ci1, ct1, ct0, color);
              quad(road, ct0, ct1, co1, co0, color);
              quad(road, co0, co1, cb1, cb0, theme.slab);
            }
          }
          const shoulderIn = S.curb[k] ? CURB_W : 0;
          const s0 = edgeAt(k, side, shoulderIn), s1 = edgeAt(q, side, shoulderIn), g0 = edgeAt(k, side, shoulderIn + SHOULDER), g1 = edgeAt(q, side, shoulderIn + SHOULDER);
          const sy0 = s0.y + ROAD_LIFT - 0.05, sy1 = s1.y + ROAD_LIFT - 0.05;
          if (!board) {
            const p0 = vert(road, s0.x, sy0, s0.z), p1 = vert(road, s1.x, sy1, s1.z), p2 = vert(road, g1.x, groundAt(g1.x, g1.z) + 0.02, g1.z), p3 = vert(road, g0.x, groundAt(g0.x, g0.z) + 0.02, g0.z);
            const shoulderColor = mix(theme.shoulder, shadeRgb(theme.shoulder, 0.86), noise(S.x[k] / 5 + 30, S.z[k] / 5 + 30));
            if (side > 0) quad(road, p0, p1, p2, p3, shoulderColor);
            else quad(road, p0, p3, p2, p1, shoulderColor);
          }
          // Walls: rock blocks, or a wooden railing along a boardwalk
          if (!(S.wall[k] & (side < 0 ? 1 : 2))) continue;
          const w0 = edgeAt(k, side, CURB_W + 0.55);
          const wy = w0.y + ROAD_LIFT;
          if (board) {
            if (i % 3 === 0) block(walls, w0.x, wy - 0.3, w0.z, 0.16, 1.15, 0.16, k, rgb("#4a3319"));
            const railColor = rgb("#8a6236");
            const w1 = edgeAt(q, side, CURB_W + 0.55);
            const ra = vert(walls, w0.x, wy + 0.8, w0.z), rb = vert(walls, w1.x, w1.y + ROAD_LIFT + 0.8, w1.z), rc = vert(walls, w1.x, w1.y + ROAD_LIFT + 0.9, w1.z), rd = vert(walls, w0.x, wy + 0.9, w0.z);
            quad(walls, ra, rb, rc, rd, railColor);
            quad(walls, ra, rd, rc, rb, railColor);
          } else {
            const jitter = noise(S.x[k] / 3 + 70, S.z[k] / 3 + 70);
            const h = WALL_H * (0.75 + jitter * 0.6), w = 0.8 + jitter * 0.3;
            block(walls, w0.x + rightX(k) * side * 0.2, wy - 0.4, w0.z + rightZ(k) * side * 0.2, w, h + 0.4, STEP + 0.05, k, mix(theme.wall, theme.wallTop, jitter * 0.6));
            if (jitter > 0.55) block(walls, w0.x + rightX(k) * side * 0.35, wy + h - 0.05, w0.z + rightZ(k) * side * 0.35, w * 0.6, 0.35 + jitter * 0.4, STEP * 0.6, k, theme.wallTop);
          }
        }
      }
      // A checkered start line across the slab
      if (from === 0) {
        const k = 0, half = halfAt(k), cells = Math.max(6, Math.round(half * 2 / 0.7));
        for (let row = 0; row < 2; row++) {
          for (let cidx = 0; cidx < cells; cidx++) {
            const l0 = -half + cidx * (half * 2 / cells), l1 = l0 + half * 2 / cells;
            const a0 = row * 0.7, a1 = a0 + 0.7;
            const y = (lat) => roadY(k, 0, lat) + ROAD_LIFT + CROWN * (1 - Math.abs(lat / half)) + 0.008;
            const at = (lat, along) => vert(road, S.x[k] + rightX(k) * lat + S.tx[k] * along, y(lat), S.z[k] + rightZ(k) * lat + S.tz[k] * along);
            const p0 = at(l0, a0), p1 = at(l1, a0), p2 = at(l1, a1), p3 = at(l0, a1);
            quad(road, p0, p3, p2, p1, (row + cidx) % 2 ? rgb("#f3efe4") : rgb("#1a1a1a"));
          }
        }
      }
      // Decor scattered off the road, baked into the sector
      for (let i = from; i < to; i += 2) {
        const k = i % n;
        if (S.surface[k] === SURF.gap) continue;
        for (let d = 0; d < theme.decor.length; d++) {
          const kind = theme.decor[d];
          if (kind.surface !== undefined && kind.surface !== S.surface[k]) continue;
          for (const side of [-1, 1]) {
            if (rand() > kind.p * detail) continue;
            if (S.wall[k] & (side < 0 ? 1 : 2) && kind.near[0] < 2.5) continue;
            const off = side * (halfAt(k) + CURB_W + SHOULDER * 0.5 + lerp(kind.near[0], kind.near[1], rand()));
            const x = S.x[k] + rightX(k) * off + (rand() - 0.5) * STEP, z = S.z[k] + rightZ(k) * off + (rand() - 0.5) * STEP;
            const j = nearest(x, z, k);
            const dx = x - S.x[j], dz = z - S.z[j];
            if (Math.abs(dx * rightX(j) + dz * rightZ(j)) < halfAt(j) + CURB_W + SHOULDER * 0.5 + kind.near[0] * 0.5 && Math.hypot(dx, dz) < halfAt(j) + CURB_W + kind.near[0] * 0.5) continue;
            if (waterAt(x, z)) continue;
            const y = groundAt(x, z) - 0.08;
            bake(kind.big ? big : small, kind.build(Math.floor(rand() * 3)), x, y, z, rand() * Math.PI * 2, lerp(kind.scale[0], kind.scale[1], rand()));
          }
        }
        if (theme.water && (i & 3) === 0) {
          for (const side of [-1, 1]) {
            if (rand() > theme.water.p * detail) continue;
            const off = side * (halfAt(k) + lerp(theme.water.near[0], theme.water.near[1], rand()));
            const x = S.x[k] + rightX(k) * off, z = S.z[k] + rightZ(k) * off;
            if (!waterAt(x, z)) continue;
            bake(small, theme.water.build(), x, floor.level - 0.1, z, rand() * Math.PI * 2, 1);
          }
        }
      }
      // Banners on alternate sectors
      if (s % 2 === 1) {
        for (const side of [-1, 1]) {
          const k = (from + 2) % n;
          if (S.surface[k] === SURF.gap || waterAt(S.x[k] + rightX(k) * side * (halfAt(k) + 2.8), S.z[k] + rightZ(k) * side * (halfAt(k) + 2.8))) continue;
          const off = side * (halfAt(k) + CURB_W + SHOULDER + 0.6);
          const x = S.x[k] + rightX(k) * off, z = S.z[k] + rightZ(k) * off;
          bake(big, raceModels.banner(theme.banners[s % theme.banners.length].join(",")), x, groundAt(x, z) - 0.05, z, Math.atan2(rightX(k) * side, rightZ(k) * side), 1);
        }
      }
      let cx = 0, cz = 0, cy = 0;
      for (let i = from; i < to; i++) {
        cx += S.x[i % n];
        cz += S.z[i % n];
        cy += S.y[i % n];
      }
      cx /= to - from;
      cz /= to - from;
      cy /= to - from;
      const node = createNode();
      const nodes = { road: createNode({ geometry: keep(road) }), big: createNode({ geometry: keep(big) }), small: createNode({ geometry: keep(small) }) };
      addChild(node, nodes.road, nodes.big, nodes.small);
      addChild(root, node);
      sectors.push({ node, nodes, from, to, cx, cy, cz });
    }
    // Terrain chunks under everything, no shadow casting
    const terrainNodes = [];
    for (let cx = 0; cx < nx - 1; cx += CHUNK) {
      for (let cz = 0; cz < nz - 1; cz += CHUNK) {
        const geo = geometry();
        geo.castShadow = false;
        for (let gx = cx; gx < Math.min(nx - 1, cx + CHUNK); gx++) {
          for (let gz = cz; gz < Math.min(nz - 1, cz + CHUNK); gz++) {
            const wx = bounds.minX + gx * CELL, wz = bounds.minZ + gz * CELL;
            const k = gx * nz + gz;
            const h00 = heights[k], h10 = heights[k + nz], h01 = heights[k + 1], h11 = heights[k + nz + 1];
            const i = nearestCold(wx + CELL / 2, wz + CELL / 2);
            const dx = wx + CELL / 2 - S.x[i], dz = wz + CELL / 2 - S.z[i];
            const lat = Math.abs(dx * rightX(i) + dz * rightZ(i));
            // Cells fully under the ribbon add nothing
            if (S.surface[i] !== SURF.gap && S.surface[i] !== SURF.board && lat + CELL * 0.71 < halfAt(i) + CURB_W && Math.hypot(dx, dz) < halfAt(i) + CELL) continue;
            const wet = water[k] && water[k + nz] && water[k + 1] && water[k + nz + 1];
            const tone = noise(wx / 7 + 90, wz / 7 + 90);
            const color = wet ? mix(floor.color, floor.deep, tone) : theme.ground((h00 + h11) * 0.5 - floor.level, tone);
            const a = vert(geo, wx, h00, wz), b = vert(geo, wx + CELL, h10, wz), c = vert(geo, wx + CELL, h11, wz + CELL), d = vert(geo, wx, h01, wz + CELL);
            quad(geo, a, d, c, b, color, wet ? floor.emissive : 0);
          }
        }
        if (!geo.faces.length) continue;
        const node = createNode({ geometry: keep(geo) });
        addChild(root, node);
        terrainNodes.push(node);
      }
    }
    // A cavern roof over the gorge: a noisy sheet facing down, stalactites where the road is not
    if (theme.ceiling) {
      const c = theme.ceiling;
      for (let cx = 0; cx < nx - 1; cx += CHUNK) {
        for (let cz = 0; cz < nz - 1; cz += CHUNK) {
          const geo = geometry();
          geo.castShadow = false;
          const roofAt = (gx, gz) => c.y + noise((bounds.minX + gx * CELL) / 18 + 500, (bounds.minZ + gz * CELL) / 18 + 500) * c.amp;
          for (let gx = cx; gx < Math.min(nx - 1, cx + CHUNK); gx++) {
            for (let gz = cz; gz < Math.min(nz - 1, cz + CHUNK); gz++) {
              const wx = bounds.minX + gx * CELL, wz = bounds.minZ + gz * CELL;
              const tone = noise(wx / 6 + 77, wz / 6 + 77);
              const a = vert(geo, wx, roofAt(gx, gz), wz), b = vert(geo, wx + CELL, roofAt(gx + 1, gz), wz), cc = vert(geo, wx + CELL, roofAt(gx + 1, gz + 1), wz + CELL), d = vert(geo, wx, roofAt(gx, gz + 1), wz + CELL);
              quad(geo, a, b, cc, d, mix(c.color[0], c.color[1], tone));
              if (tone > 1 - c.drips * 0.35 && (gx + gz) % 3 === 0) {
                const i = nearestCold(wx, wz);
                if (Math.hypot(wx - S.x[i], wz - S.z[i]) > halfAt(i) + 4) bake(geo, raceModels.stalactite((gx * 7 + gz) % 3), wx + CELL / 2, roofAt(gx, gz) - 0.1, wz + CELL / 2, tone * 6, 0.8 + tone * 0.6);
              }
            }
          }
          const node = createNode({ geometry: keep(geo) });
          addChild(root, node);
          terrainNodes.push(node);
        }
      }
    }
    // Start gantry at sample 0 facing the grid, finish arch shares it
    const gx0 = S.x[0], gz0 = S.z[0], gy0 = S.y[0] + ROAD_LIFT;
    const gantryYaw = Math.atan2(S.tx[0], S.tz[0]);
    const gantryNode = createNode({ position: { x: gx0, y: gy0, z: gz0 }, rotation: { x: 0, y: gantryYaw + Math.PI, z: 0 }, geometry: raceModels.gantry() });
    const sign = createNode({ position: { x: gx0, y: gy0 + raceModels.GANTRY.height + 1.6, z: gz0 }, rotation: { x: 0, y: gantryYaw + Math.PI, z: 0 }, geometry: hubModels.caveSign("Ooga Rally") });
    const lamps = [];
    for (let i = -1; i <= 1; i++) {
      const lamp = createNode({ position: { x: gx0 + rightX(0) * i * 1.6, y: gy0 + raceModels.gantryLampY, z: gz0 + rightZ(0) * i * 1.6 }, geometry: raceModels.gantryLamp(), glow: 0.1 });
      lamps.push(lamp);
    }
    addChild(root, gantryNode, sign, ...lamps);
    geometries.push(gantryNode.geometry, sign.geometry, raceModels.gantryLamp());
    // Torches along the road on cave tracks, each a point light candidate
    const torches = [];
    if (theme.torches) {
      const every = Math.floor(n / (theme.torches * 4));
      for (let i = 0, t = 0; i < n; i += every, t++) {
        const side = t % 2 ? 1 : -1;
        if (S.surface[i] === SURF.gap) continue;
        const off = side * (halfAt(i) + CURB_W + 1.2);
        const x = S.x[i] + rightX(i) * off, z = S.z[i] + rightZ(i) * off, y = roadY(i, 0, side * halfAt(i)) + ROAD_LIFT - 0.05;
        const stand = createNode({ position: { x, y, z }, geometry: raceModels.torchStand() });
        const flame = createNode({ position: { x: 0, y: raceModels.torchStand().flameY, z: 0 }, geometry: raceModels.torchFlame(), glow: 1 });
        addChild(stand, flame);
        addChild(root, stand);
        torches.push({ x, y: y + raceModels.torchStand().flameY, z, flame, phase: t * 1.7 });
      }
      geometries.push(raceModels.torchStand(), raceModels.torchFlame());
    }
    // Spectators: instanced figures in stands beside the first straight and at three corners
    const spectators = { node: null, x: new Float32Array(SPECTATOR_CAP), y: new Float32Array(SPECTATOR_CAP), z: new Float32Array(SPECTATOR_CAP), yaw: new Float32Array(SPECTATOR_CAP), phase: new Float32Array(SPECTATOR_CAP), count: 0 };
    const standsGeo = geometry();
    if (theme.spectators) {
      const spots = [];
      // A stand: rows of figures on stepped plank tiers, cols figures long, two to a sample
      const stand = (i, side, rows, cols) => {
        for (let r = 0; r < rows; r++) {
          const mid = (i + cols - 1) % n;
          if (S.surface[mid] !== SURF.gap) {
            const off = side * (halfAt(mid) + CURB_W + 2.4 + r * 1.1);
            const px = S.x[mid] + rightX(mid) * off, pz = S.z[mid] + rightZ(mid) * off;
            if (!waterAt(px, pz)) block(standsGeo, px, groundAt(px, pz) - 0.3, pz, 1.1, 0.3 + r * 0.25, cols * 2 * STEP + 0.5, mid, r % 2 ? rgb("#8f6538") : rgb("#9c7040"));
          }
          for (let c = 0; c < cols; c++) {
            for (let half = 0; half < 2; half++) {
              const k = (i + c * 2) % n;
              if (S.surface[k] === SURF.gap) continue;
              const off = side * (halfAt(k) + CURB_W + 2.4 + r * 1.1);
              const x = S.x[k] + rightX(k) * off + S.tx[k] * half * STEP * 0.5 + (rand() - 0.5) * 0.3, z = S.z[k] + rightZ(k) * off + S.tz[k] * half * STEP * 0.5 + (rand() - 0.5) * 0.3;
              if (waterAt(x, z)) continue;
              spots.push({ x, y: groundAt(x, z) + r * 0.25, z, yaw: Math.atan2(-rightX(k) * side, -rightZ(k) * side) + (rand() - 0.5) * 0.5 });
            }
          }
        }
      };
      stand(n - 12, -1, 4, 10);
      stand(n - 12, 1, 4, 10);
      const corners = [];
      for (let i = 20; i < n - 30; i++) if (Math.abs(S.curvature[i]) > 0.04 && (!corners.length || i - corners[corners.length - 1] > n / 5)) corners.push(i);
      for (const i of corners.slice(0, 3)) stand(i - 6, S.curvature[i] > 0 ? 1 : -1, 3, 8);
      const count = Math.min(SPECTATOR_CAP, spots.length);
      for (let i = 0; i < count; i++) {
        spectators.x[i] = spots[i].x;
        spectators.y[i] = spots[i].y;
        spectators.z[i] = spots[i].z;
        spectators.yaw[i] = spots[i].yaw;
        spectators.phase[i] = rand() * Math.PI * 2;
      }
      spectators.count = count;
      spectators.node = createNode({ geometry: raceModels.spectator(def.seed % 3), instanceData: new Float32Array(SPECTATOR_CAP * 20), instanceCount: count, instanceVersion: 0, fixedInstanceCapacity: true });
      addChild(root, spectators.node, createNode({ geometry: keep(standsGeo) }));
      geometries.push(spectators.node.geometry);
    }
    // Checkpoints, grid, spawn points
    const checkpoints = new Int32Array(CHECKPOINTS);
    const runway = Math.ceil(RUNWAY / STEP);
    const gapAhead = (i) => {
      for (let k = 0; k <= runway; k++) if (S.surface[(i + k) % n] === SURF.gap) return true;
      return false;
    };
    for (let c = 0; c < CHECKPOINTS; c++) {
      let i = Math.floor(c * n / CHECKPOINTS);
      if (c > 0) for (let tries = 0; tries < n && (gapAhead(i) || S.surface[i] === SURF.gap); tries++) i = (i - 1 + n) % n;
      checkpoints[c] = i;
    }
    const grid = [];
    for (let slot = 0; slot < 8; slot++) {
      const row = Math.floor(slot / 2), col = slot % 2 ? 1 : -1;
      const i = (n - 3 - Math.round(row * GRID_GAP / STEP) + n) % n;
      const lat = col * halfAt(i) * 0.42;
      grid.push({ x: S.x[i] + rightX(i) * lat, y: slabY(i, 0, lat), z: S.z[i] + rightZ(i) * lat, heading: Math.atan2(S.tx[i], S.tz[i]), index: i });
    }
    const spawns = { bananas: [], crates: [], pads: [], boulders: [] };
    const every = Math.floor(n / 30);
    for (let i = every, k = 0; i < n - 4; i += every, k++) {
      if (S.surface[i] === SURF.gap || S.surface[(i + 2) % n] === SURF.gap) continue;
      const lane = ((k % 3) - 1) * halfAt(i) * 0.45;
      const at = (lat) => ({ x: S.x[i] + rightX(i) * lat, y: slabY(i, 0, lat), z: S.z[i] + rightZ(i) * lat, heading: Math.atan2(S.tx[i], S.tz[i]), index: i });
      if (k % 5 === 4) spawns.crates.push(at(lane), at(-lane || halfAt(i) * 0.45));
      else spawns.bananas.push(at(lane), at(lane + (lane > 0 ? -1.3 : 1.3)));
    }
    // Boost pads on the straightest samples, well apart
    const straights = [];
    for (let i = 12; i < n - 12; i++) {
      let bend = 0;
      for (let k = -10; k <= 10; k++) bend += Math.abs(S.curvature[(i + k + n) % n]);
      if (S.surface[i] !== SURF.gap && bend < 0.12 && (!straights.length || i - straights[straights.length - 1] > n / 6)) straights.push(i);
    }
    // A flagged pad sits at the end of its run, right before the lip it feeds
    for (let i = 0; i < n; i++) {
      if (!S.pad[i] || S.pad[(i + 1) % n] || S.surface[i] === SURF.gap) continue;
      spawns.pads.push({ x: S.x[i], y: slabY(i, 0, 0), z: S.z[i], heading: Math.atan2(S.tx[i], S.tz[i]), index: i });
    }
    const flagged = spawns.pads.length;
    for (const i of straights.filter((i) => spawns.pads.every((p) => Math.abs(p.index - i) > 40)).slice(0, Math.max(0, 4 - flagged))) {
      const lat = (spawns.pads.length % 2 ? 1 : -1) * halfAt(i) * 0.4;
      spawns.pads.push({ x: S.x[i] + rightX(i) * lat, y: slabY(i, 0, lat), z: S.z[i] + rightZ(i) * lat, heading: Math.atan2(S.tx[i], S.tz[i]), index: i });
    }
    if (def.hazard === "lava") {
      for (const i of [Math.floor(n * 0.32), Math.floor(n * 0.71)]) spawns.boulders.push({ index: i, x: S.x[i], z: S.z[i], y: slabY(i, 0, 0), heading: Math.atan2(S.tx[i], S.tz[i]), half: halfAt(i) });
    }
    // Minimap polyline, normalised to a unit square
    const mapPts = [];
    const spanX = maxX - minX, spanZ = maxZ - minZ, span = Math.max(spanX, spanZ);
    for (let i = 0; i < n; i += 3) mapPts.push((S.x[i] - minX - (spanX - span) / 2) / span, (S.z[i] - minZ - (spanZ - span) / 2) / span);
    const mapPoint = (x, z, out) => {
      out.x = (x - minX - (spanX - span) / 2) / span;
      out.y = (z - minZ - (spanZ - span) / 2) / span;
      return out;
    };
    const renderOpts = theme.renderOpts();
    if (wet) {
      const grey = precipitation === "snow" ? [0.42, 0.46, 0.54] : [0.5, 0.53, 0.58];
      for (const key of ["horizon", "zenith", "clear", "sky"]) if (renderOpts[key]) for (let i = 0; i < 3; i++) renderOpts[key][i] = renderOpts[key][i] * 0.35 + grey[i] * 0.65;
      for (let i = 0; i < 3; i++) {
        renderOpts.sun[i] = renderOpts.sun[i] * 0.4 + 0.3;
        renderOpts.direct[i] = renderOpts.direct[i] * 0.4 + 0.3;
      }
      renderOpts.directStrength = 0.45;
      renderOpts.shadowStrength = 0.35;
      renderOpts.stars = 0;
      renderOpts.bloomStrength = 0.35;
      renderOpts.fogNear = 40;
      renderOpts.fogFar = 170;
    }
    const slipAt = (surface) => Math.min(1, SURFACE_SLIP[surface] + (wet && (surface === SURF.road || surface === SURF.board) ? 0.42 : 0));
    // Per frame: spectators bob, torches flicker, far sectors drop their small decor
    const update = (elapsed, camX, camZ) => {
      if (spectators.node) {
        const data = spectators.node.instanceData;
        for (let i = 0; i < spectators.count; i++) {
          const hop = Math.max(0, Math.sin(elapsed * 6 + spectators.phase[i])) * 0.18;
          writeInstance(data, i * 20, spectators.yaw[i], 1, spectators.x[i], spectators.y[i] + hop, spectators.z[i], 1);
        }
        spectators.node.instanceVersion++;
      }
      for (let i = 0; i < torches.length; i++) torches[i].flame.glow = 0.85 + Math.sin(elapsed * 11 + torches[i].phase) * 0.15;
      for (let s = 0; s < sectors.length; s++) {
        const sec = sectors[s];
        sec.nodes.small.visible = (sec.cx - camX) ** 2 + (sec.cz - camZ) ** 2 < LOD_FAR * LOD_FAR;
      }
    };
    const dispose = () => {
      for (const child of root.children.slice()) removeChild(root, child);
      for (const geo of geometries) renderer.releaseGeometry(geo);
      geometries.length = 0;
      sectors.length = 0;
      terrainNodes.length = 0;
      torches.length = 0;
    };
    return {
      id: def.id, name: def.name, laps: def.laps, targets: def.targets, hazard: def.hazard, theme: def.theme,
      root, samples: S, count: n, length: S.length, sectors, terrainNodes, checkpoints, grid, spawns, torches, lamps, spectators, renderOpts,
      nearest, project, heightAt, surfaceAt, groundAt, waterAt, roadY, slabY, halfAt, slipAt, wet, precipitation, rightX, rightZ, mapPts, mapPoint, bounds, update, dispose,
      get geometryCount() {
        return geometries.length;
      }
    };
  };
  BL.raceTrack = { TRACKS, THEMES, SURF, SURFACE_GRIP, SURFACE_SLIP, STEP, SHOULDER, CURB_W, FALL, LOD_FAR, build, trackById, writeInstance };
})();
