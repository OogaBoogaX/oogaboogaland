// The Byzantine Keep's geometry, built once a visit from keep-layout.js: the land's terrain and forest, the castle in
// its moat, the two bridges, the lanterns and the sentinels.
//
// Two kinds of stone, as the castle is built. Its dressed masonry is fine voxels, an eighth of a metre (`U`; the keep
// itself three sixteenths, `UK`): walls, towers and the gatehouse are cut from dense grids (`tools`) and meshed by the
// terrain's own greedy mesher, each stone a tone of its own in courses three cells tall, so the renderer's block detail
// reads as coursed ashlar. It is a tall gothic castle in cold grey stone: every opening pointed (`pointed`), lit
// windows of leaded glass with stone tracery, stepped buttresses under pinnacles, corbel tables, and steep slate
// spires on every tower. Its rough work is the
// ghost arena's rock (`stone`, the arcade kit's block, in the arena's own tones `ARENA`): the battered plinth the
// castle stands on in the moat and the skirts of its corner towers in the arena's metre blocks, and the ravine bridge,
// the moat's abutment and the ruin round the way home in the same blocks at half the size.
//
// Everything is in the land's frame (keep-layout.js) unless it says it is a part to be stood somewhere by the scene.
(() => {
  "use strict";
  const BL = window.BL;
  if (BL.keepModels) return;
  const { models, math, terrain: T } = BL, L = BL.keepLayout;
  const { geometry, pushVert, face, box, bevelBox, lathe, merge, moved, turnedX, turnedZ, torus, noShadow, cached, cachedSteps, variants, shaded, turn, lanternParts, beam } = models;
  const { stone, paving, flagstone, facing } = BL.arcadeModelsSceneKit;
  const { hexToRgb, mulberry32 } = math;
  const pause = function* (slice) { if (slice) yield* BL.buildTasks.pause(slice); };
  // The heavy grid-meshed builders answer from the land's snapshot when it has them (keep-snapshot.js).
  const snap = (name, build) => BL.keepSnapshot ? BL.keepSnapshot.wrap(name, build) : build;
  const TAU = Math.PI * 2, UP = [0, 1, 0];
  const { CZ, CASTLE, KEEP, MOAT, GATE, YARD, LEAF, ABUTMENT, COURT, STAIRS, QUAY, DOCK, ISLET, ARCH, ARRIVE, STATUES, BOUNDS, TERRAIN } = L;

  // The ghost arena's rock (arcade-scene-models.js `STONE`) taken darker, and the night flagstones in the same warm stone.
  const ARENA = ["#17181b", "#1d1e22", "#121316"];
  // The islet's ruin round the arch keeps the ghost arena's own warm rock.
  const RUIN = ["#342d28", "#3d342e", "#2c2622"];
  const FLAGS = ["#3f3a36", "#48423d", "#37322e", "#4f4842"];
  const IRON = "#22252b";
  // How the arena lays a wall: blocks of these sizes in cells, each lapping its neighbours, set back a little at
  // random, chamfered and bulging. `BIG` is the arena's own metre blocks; `SMALL` the same at half the size.
  const BIG_BLOCKS = [[2, 2], [2, 2], [3, 2], [2, 1], [1, 2], [2, 1], [1, 1]], SMALL_BLOCKS = [[2, 1], [3, 1], [2, 2], [2, 1], [1, 1], [3, 2], [4, 1]];
  const BIG = { lap: 0.16, depth: 0.9, chamfer: 0.18, bulge: 0.1, back: 0.22 }, SMALL = { lap: 0.08, depth: 0.5, chamfer: 0.09, bulge: 0.05, back: 0.1 };
  const layBlocks = (cols, rows, sizes, rand, free, put) => {
    const taken = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!free(i, j)) taken[j * cols + i] = 1;
    const fits = (i, j, w, h) => {
      for (let b = j; b < j + h; b++) for (let a = i; a < i + w; a++) if (a >= cols || b >= rows || taken[b * cols + a]) return false;
      return true;
    };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (taken[j * cols + i]) continue;
      let [w, h] = sizes[Math.floor(rand() * sizes.length)];
      while (!fits(i, j, w, h)) if (w >= h && w > 1) w--; else h--;
      for (let b = j; b < j + h; b++) for (let a = i; a < i + w; a++) taken[b * cols + a] = 1;
      put(i, j, w, h);
    }
  };
  // A flat face of blocks into `geo`: `cols` by `rows` cells, each `cw` along `r` by `ch` along `u`, from its lower
  // corner `o`, looking out along `n`.
  const blockFace = (geo, rand, o, r, u, n, cols, rows, cw, ch, sizes, style, free = null, tones = ARENA) => {
    layBlocks(cols, rows, sizes, rand, free || (() => true), (i, j, w, h) => {
      const a = (i + w / 2) * cw, b = (j + h / 2) * ch, back = -rand() * style.back;
      stone(geo, [o[0] + r[0] * a + u[0] * b + n[0] * back, o[1] + r[1] * a + u[1] * b + n[1] * back, o[2] + r[2] * a + u[2] * b + n[2] * back], r, u, n,
        w * cw + style.lap, h * ch + style.lap, style.depth, style.chamfer, Math.min(w, h) > 1 ? style.bulge * 1.4 : style.bulge, tones[Math.floor(rand() * tones.length)]);
    });
  };

  // ---------- voxel masonry ----------
  const U = 0.125, UK = 0.1875;
  // The castle's materials, by their index in a grid: five tones of ashlar near black, as the cannon turrets', three of the spires' orange slate, shadow, moss, two of lit leaded glass, dull
  // gilt, two of oak, iron, a dim ember and dressed stone a shade lighter; and a doorway's dark inside with the warm
  // light it lets fall on its floor (`doorway`).
  const S1 = 1, S2 = 2, S3 = 3, S4 = 4, S5 = 5, SL1 = 6, DARK = 9, MOSS = 10, GLOW2 = 11, NOOK = 12, SPILL = 13, GOLD = 14, GLOW = 15, WOOD = 16, WOOD2 = 17, IRONM = 18, DIM = 19, PALE = 20;
  const HEX = [null, "#1a1b1e", "#1f2024", "#16171a", "#121316", "#24252a", "#c4561a", "#a84716", "#d86a26", "#110f0e", "#2c372c", "#e8802c", "#24170e", "#6a3614", "#a8873c", "#ffad4f", "#4a3524", "#5d4530", "#2a2c30", "#c9862e", "#2c2d32"];
  const RGB = HEX.map((c) => c && hexToRgb(c));
  const EMISSIVE = new Map([[RGB[GLOW], 1], [RGB[GLOW2], 0.85], [RGB[DIM], 0.5], [RGB[GOLD], 0.12], [RGB[SPILL], 0.45], [RGB[NOOK], 0.12]]);
  const hash3 = (a, b, c) => {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const frac = (v) => v - Math.floor(v);
  // The castle's stone is the ghost arena's (arcade-scene-models.js): blocks about a metre square, each a tone of its
  // own, in courses whose joints step along by half a block. `BLOCK` is a block's height and length in cells at each
  // voxel size; `masonry` the tone of a cell's block, moss creeping up the lowest courses; and `relief` cuts the joints
  // a cell back into every face of the stone, so each block stands proud of its mortar as the arena's do.
  const BLOCK = (unit) => unit < 0.15 ? { h: 8, l: 10 } : { h: 5, l: 7 };
  const blockOf = (B, x, y, z) => { const c = Math.floor(y / B.h), o = (c & 1) * (B.l >> 1) + Math.floor(hash3(c, 7, 13) * 3); return { c, o }; };
  const masonry = (course, len, foot = 0) => {
    const B = BLOCK(course < 3 ? 0.1875 : 0.125);
    return (x, y, z) => {
      const { c, o } = blockOf(B, x, y, z), h = hash3(Math.floor((x + o) / B.l), c, Math.floor((z + o) / B.l));
      if (y - foot < 18 && hash3(x >> 1, y >> 1, z >> 1) > 0.62 + (y - foot) * 0.02) return MOSS;
      return h < 0.3 ? S1 : h < 0.56 ? S2 : h < 0.76 ? S3 : h < 0.9 ? S4 : S5;
    };
  };
  const STONE_CELL = new Uint8Array(32);
  for (const t of [1, 2, 3, 4, 5, 10]) STONE_CELL[t] = 1;
  const relief = function* (grid, unit, slice) {
    const { sx, sy, sz, data: d } = grid, B = BLOCK(unit), at = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz ? d[(x * sy + y) * sz + z] : 0;
    const cut = new Uint8Array(sx * sy * sz);
    for (let x = 0; x < sx; x++) {
      if ((x & 7) === 0) yield* pause(slice);
      for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
        const v = d[(x * sy + y) * sz + z];
        if (!v || !STONE_CELL[v]) continue;
        // A face looking along x has its joints along z, one along z its joints along x; only where the stone behind
        // it is thick enough to lose a cell.
        let along = -1;
        if (!at(x + 1, y, z) && at(x - 1, y, z) && at(x - 2, y, z)) along = z; else if (!at(x - 1, y, z) && at(x + 1, y, z) && at(x + 2, y, z)) along = z;
        else if (!at(x, y, z + 1) && at(x, y, z - 1) && at(x, y, z - 2)) along = x; else if (!at(x, y, z - 1) && at(x, y, z + 1) && at(x, y, z + 2)) along = x;
        if (along < 0 || !at(x, y + 1, z) || !at(x, y - 1, z)) continue;
        const { o } = blockOf(B, x, y, z);
        if (y % B.h === 0 || (along + o) % B.l === 0) cut[(x * sy + y) * sz + z] = 1;
      }
    }
    for (let i = 0; i < cut.length; i++) if (cut[i]) d[i] = 0;
  };
  const darker = (m) => (x, y, z) => { const v = m(x, y, z); return v === MOSS ? v : v > S3 ? S4 : S2; };
  const slate = (x, y, z) => SL1 + Math.floor(hash3(x >> 1, y >> 1, z >> 1) * 3);
  // A window's leaded glass, lit from within: most panes bright, some a deeper amber.
  const glass = (u, y) => (((u * 3 + y * 2) % 7 + 7) % 7 < 2 ? GLOW2 : GLOW);
  // An open window's bars, a cell wide every third cell and across every eighth, firelight dim between them.
  const barred = (u, y) => (((u % 3) + 3) % 3 === 0 || y % 8 === 0 ? IRONM : DIM);
  // A grid's mesh, its lit materials glowing.
  const meshSteps = function* (grid, unit, origin, slice) {
    yield* relief(grid, unit, slice);
    const geo = yield* T.gridGeometrySteps(grid, { unit, palette: RGB, origin }, slice);
    for (const f of geo.faces) { const e = EMISSIVE.get(f.color); if (e) f.emissive = e; }
    return geo;
  };
  // A grid's tools: cells set only inside it, by a material or by what a function of the cell gives (null leaves the
  // cell alone). `box`, `cyl`, `cone`, `pyramid` and `gable` fill the solids a castle is made of.
  const tools = (g) => {
    const { sx, sy, sz, data } = g;
    const inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz;
    const set = (x, y, z, v) => { if (inside(x, y, z)) data[(x * sy + y) * sz + z] = v; };
    const get = (x, y, z) => inside(x, y, z) ? data[(x * sy + y) * sz + z] : 0;
    const shape = (x0, x1, y0, y1, z0, z1, within, m) => {
      const fn = typeof m === "function";
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(sx, Math.ceil(x1)); x++) for (let z = Math.max(0, Math.floor(z0)); z < Math.min(sz, Math.ceil(z1)); z++) {
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(sy, Math.ceil(y1)); y++) {
          if (within && !within(x, y, z)) continue;
          const v = fn ? m(x, y, z) : m;
          if (v != null) data[(x * sy + y) * sz + z] = v;
        }
      }
    };
    const box = (x0, x1, y0, y1, z0, z1, m) => shape(x0, x1, y0, y1, z0, z1, null, m);
    const cyl = (cx, cz, r, y0, y1, m, inner = -1) => shape(cx - r - 1, cx + r + 1, y0, y1, cz - r - 1, cz + r + 1, (x, y, z) => { const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz); return d <= r && d > inner; }, m);
    // A spire: `r` across at its eaves, `h` tall, flared at the eaves as a witch's hat is.
    const cone = (cx, cz, r, y0, h, m, p = 1.2) => shape(cx - r - 1, cx + r + 1, y0, y0 + h, cz - r - 1, cz + r + 1, (x, y, z) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r * (1 - (y - y0 + 0.5) / h) ** p + 0.35, m);
    const pyramid = (cx, cz, hx, hz, y0, h, m, p = 1.12) => shape(cx - hx - 1, cx + hx + 1, y0, y0 + h, cz - hz - 1, cz + hz + 1, (x, y, z) => { const k = (1 - (y - y0 + 0.5) / h) ** p; return Math.abs(x + 0.5 - cx) <= hx * k + 0.35 && Math.abs(z + 0.5 - cz) <= hz * k + 0.35; }, m);
    // A gabled roof over a rectangle, its ridge along x (or along z), `h` tall.
    const gable = (x0, x1, z0, z1, y0, h, alongX, m) => {
      const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2, half = (alongX ? z1 - z0 : x1 - x0) / 2;
      shape(x0, x1, y0, y0 + h, z0, z1, (x, y, z) => Math.abs((alongX ? z : x) + 0.5 - mid) <= half * (1 - (y - y0 + 0.5) / h) + 0.35, m);
    };
    return { g, set, get, shape, box, cyl, cone, pyramid, gable };
  };
  // A pointed opening's cell at `t` across its middle and `y` up, `half` either side from `y0` to its springing `y1`,
  // its head two arcs struck from the far jambs: inside it, on its dressed surround (`RING`), on a bar of its tracery
  // (`BAR`: one mullion forking in the head, or with `tracery` 2 a mullion at each third), or none of these.
  const INSIDE = 1, RING = 2, BAR = 3;
  const pointed = (t, y, half, y0, y1, ring = 1.4, tracery = 0) => {
    const at = Math.abs(t);
    if (y < y0 - 1) return 0;
    if (y < y0) return ring > 0 && at <= half + 1 ? RING : 0;
    const head = y > y1, d = head ? Math.hypot(at + half, y - y1) : 0;
    if (head ? d > 2 * half : at > half) return ring > 0 && (head ? d <= 2 * half + ring : at <= half + 1) ? RING : 0;
    if (tracery === 1 && (head ? Math.abs(at - (y - y1) * 0.5) < 0.6 : at < 0.5)) return BAR;
    if (tracery === 2 && (Math.abs(at - half / 3) < 0.5 || y === Math.round(y1) || (head && Math.abs(at - (y - y1) * 0.42) < 0.55 && at < half / 3))) return BAR;
    return INSIDE;
  };
  const backOf = (back, u, y, t) => typeof back === "function" ? back(u, y, t) : back;
  // An opening in a flat face `f`: from the cell (ox, oz) on the face's outer course, `u` cells along (ax, az) and
  // inward along (ix, iz); `depth` cells deep with `back` behind it.
  const opening = (K, f, uc, half, y0, y1, depth, back, tracery = 0, ring = 1.4) => {
    const top = Math.ceil(y1 + 1.74 * half + ring + 1);
    for (let u = Math.floor(uc - half - 3); u <= Math.ceil(uc + half + 3); u++) for (let y = y0 - 1; y <= top; y++) {
      const t = u + 0.5 - uc, k = pointed(t, y, half, y0, y1, ring, tracery);
      if (!k) continue;
      const x = f.ox + f.ax * u, z = f.oz + f.az * u;
      if (k !== INSIDE) { if (K.get(x, y, z)) K.set(x, y, z, PALE); continue; }
      for (let d = 0; d < depth; d++) K.set(x + f.ix * d, y, z + f.iz * d, 0);
      K.set(x + f.ix * depth, y, z + f.iz * depth, backOf(back, u, y, t));
    }
  };
  // The same in a round wall `R` across about (cx, cz), looking out along the angle `a0`.
  const roundOpening = (K, cx, cz, R, a0, half, y0, y1, depth, back, tracery = 0) => {
    const px = cx + Math.cos(a0) * R, pz = cz + Math.sin(a0) * R, reach = half + depth + 5, top = Math.ceil(y1 + 1.74 * half + 3);
    for (let x = Math.floor(px - reach); x <= Math.ceil(px + reach); x++) for (let z = Math.floor(pz - reach); z <= Math.ceil(pz + reach); z++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz, d = Math.hypot(dx, dz);
      if (d > R + 2.6 || d < R - depth - 1.6) continue;
      let da = Math.atan2(dz, dx) - a0;
      da -= Math.round(da / TAU) * TAU;
      const t = da * R;
      if (Math.abs(t) > half + 3) continue;
      for (let y = y0 - 1; y <= top; y++) {
        const k = pointed(t, y, half, y0, y1, 1.4, tracery);
        if (!k) continue;
        if (k !== INSIDE) { if (d > R - 1.3 && K.get(x, y, z)) K.set(x, y, z, PALE); continue; }
        if (d > R - depth) K.set(x, y, z, 0);
        else if (d > R - depth - 1.5) K.set(x, y, z, backOf(back, Math.round(t), y, t));
      }
    }
  };
  // A round tower into a grid: about (cx, cz), `R` across, from `y0` to the foot of its roof at `top`. A stepped foot,
  // a corbel table and ledge under the roof, then either a ring of `merlons` with the spire set back inside it or the
  // spire's eaves out over the ledge; `strings` are courses of dressed stone round it, `lights` rings of lit lancets
  // and `slits` of arrow loops, each `{ y, n, phase, half, tall }`, cut only where `only(angle)` allows.
  const roundTower = (K, cx, cz, R, y0, top, m, o = {}) => {
    const ang = (x, z) => Math.atan2(z + 0.5 - cz, x + 0.5 - cx) + Math.PI, dist = (x, z) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz), B = R + 4;
    if (o.foot !== false) { K.cyl(cx, cz, R + 2, y0, y0 + 8, darker(m)); K.cyl(cx, cz, R + 1, y0 + 8, y0 + 16, darker(m)); }
    K.cyl(cx, cz, R, y0, top, m);
    for (const y of o.strings || []) K.cyl(cx, cz, R + 1, y, y + 2, PALE, R - 1);
    const corbels = Math.max(8, Math.round(TAU * R / 8));
    K.shape(cx - B, cx + B, top - 6, top - 2, cz - B, cz + B, (x, y, z) => { const d = dist(x, z); return d <= R + 1.2 && d > R - 1 && frac(ang(x, z) / TAU * corbels) < 0.5; }, S3);
    K.cyl(cx, cz, R + 2.4, top - 2, top, PALE, R - 1);
    let eaves = R + 2.8, roof = top;
    // A gallery on the tower's top: a ring of wall `wall` thick and `h` tall, open over `open` either side of +z, the
    // head of the stair coming up through its floor at -z (`well`: `half` either side, `len` in from the wall, rising
    // `depth` in `steps`), and a ceiling `ceil` thick over it all, the spire set on that.
    if (o.gallery) {
      const G = o.gallery, side = (x, z) => Math.atan2(x + 0.5 - cx, z + 0.5 - cz);
      K.shape(cx - B, cx + B, top, top + G.h, cz - B, cz + B, (x, y, z) => {
        const d = dist(x, z);
        if (d > R || d <= R - G.wall) return false;
        return Math.abs(side(x, z)) >= G.open;
      }, (x, y, z) => {
        const a = side(x, z), d = dist(x, z);
        return Math.abs(a) < G.open + 1.4 / d || y >= top + G.h - 1 ? PALE : m(x, y, z);
      });
      // The stair head: a slot through the floor at the back, its steps rising toward the middle.
      const W = G.well, inner = R - G.wall;
      for (let x = Math.floor(cx - W.half); x < Math.ceil(cx + W.half); x++) for (let z = Math.floor(cz - inner - 1); z < Math.ceil(cz - inner + W.len); z++) {
        const lx = x + 0.5 - cx, s = z + 0.5 - cz + inner;
        if (Math.abs(lx) >= W.half || s < 0 || s > W.len) continue;
        const k = Math.min(W.steps, Math.floor(s / W.len * W.steps) + 1), tread = top - W.depth + Math.round(k * W.depth / W.steps);
        for (let y = tread; y < top; y++) K.set(x, y, z, 0);
        K.set(x, tread - 1, z, PALE);
      }
      // Over the stair head's back end, an arched doorway in the wall, lit behind as the stair's own doorway is and
      // dressed in pale stone, and a
      // low pale rail along both its sides on the floor, so it reads as the way down.
      const door = W.door, back = Math.floor(cz - inner);
      for (let x = Math.floor(cx - W.half - 3); x < Math.ceil(cx + W.half + 3); x++) for (let y = top; y < top + door + Math.ceil(W.half) + 3; y++) for (let z = back - 3; z <= back; z++) {
        const lx = Math.abs(x + 0.5 - cx), head = top + door + Math.sqrt(Math.max(0, W.half * W.half - lx * lx)) * 0.7;
        if (!K.get(x, y, z) && z === back) continue;
        if (lx < W.half && y < head) K.set(x, y, z, z === back - 3 ? GLOW2 : 0);
        else if (lx < W.half + 2 && y < head + 2 && K.get(x, y, z)) K.set(x, y, z, PALE);
      }
      for (let x = Math.floor(cx - W.half - W.rail); x < Math.ceil(cx + W.half + W.rail); x++) for (let z = Math.floor(cz - inner); z < Math.ceil(cz - inner + W.len); z++) {
        const lx = Math.abs(x + 0.5 - cx);
        if (lx >= W.half && lx < W.half + W.rail) for (let y = top; y < top + W.railTall; y++) K.set(x, y, z, PALE);
      }
      K.cyl(cx, cz, R + 1, top + G.h, top + G.h + G.ceil, PALE);
      roof = top + G.h + G.ceil;
    }
    if (o.merlons) {
      K.cyl(cx, cz, R + 2.4, top, top + 9, m, R - 2.6);
      K.shape(cx - B, cx + B, top + 9, top + 16, cz - B, cz + B, (x, y, z) => { const d = dist(x, z); return d <= R + 2.4 && d > R - 2.6 && frac(ang(x, z) / TAU * o.merlons) < 0.56; }, (x, y, z) => y === top + 15 ? PALE : m(x, y, z));
      eaves = R - 3.6;
    }
    if (o.cone) {
      K.cone(cx, cz, eaves, roof, o.cone, slate);
      // Small lit dormers in the spire, each under a slate hood.
      for (let k = 0; k < (o.dormers || 0); k++) {
        const a = (k + 0.5) / o.dormers * TAU + (o.phase || 0), yd = roof + Math.round(o.cone * 0.2), rr = eaves * (1 - (yd - roof + 0.5) / o.cone) ** 1.2, cs = Math.cos(a), sn = Math.sin(a);
        for (let w = -2; w <= 2; w++) for (let r = Math.floor(rr - 2); r <= Math.ceil(rr + 1.5); r++) for (let y = 0; y < 6; y++) {
          const x = Math.floor(cx + cs * r - sn * w), z = Math.floor(cz + sn * r + cs * w), hood = y >= 4 - (Math.abs(w) > 1 ? 1 : 0) || Math.abs(w) > 1;
          if (hood ? !K.get(x, yd + y, z) : true) K.set(x, yd + y, z, hood ? SL1 + 2 : r >= rr + 0.5 ? GLOW : SL1);
        }
      }
    }
    const allowed = o.only || (() => true);
    for (const s of o.slits || []) for (let k = 0; k < s.n; k++) { const a = k / s.n * TAU + (s.phase || 0); if (allowed(a)) roundOpening(K, cx, cz, R, a, 0.6, s.y, s.y + (s.tall || 10), 4, DARK); }
    for (const l of o.lights || []) for (let k = 0; k < l.n; k++) { const a = k / l.n * TAU + (l.phase || 0); if (allowed(a)) roundOpening(K, cx, cz, R, a, l.half || 2.4, l.y, l.y + (l.tall || 12), 3, glass, (l.half || 2.4) >= 3 ? 1 : 0); }
  };

  // A stretch of curtain wall, a part: along x about its middle, its outer face on z 0 looking out along +z, its foot at
  // y 0 and its walk `CASTLE.walk` up. Stepped buttresses divide its face into bays, a blind lancet and an arrow loop
  // in each; a corbel table carries the parapet and its merlons out over it. Variant 0 is the back wall, the back gate through its middle (keep-layout.js `BACK`), 1 the front's
  // either side of the gatehouse, 2 a side's between two of its towers, and 3 that same stretch with the west or east
  // gate through its middle (keep-layout.js `WEST`): its buttresses and lancets left off either side of the arch, the
  // passage cut clean through under a head of dressed stone.
  const wall = variants((short) => cachedSteps(snap("wall:" + short, function* (slice = null) {
    // 4 to 7 are Outpost Island's (keep-layout.js `OUTPOST`): its outer curtain's north and south sides (corner to
    // corner) and its east and west (between those), then its courtyard's the same, each with a gate in its middle.
    const O = L.OUTPOST, gate = short === 3 || short === 0 || short >= 4, GATE_W = L.WEST.half / U;
    const len = [2 * CASTLE.half - 9, CASTLE.half - 11.5, CASTLE.stretch[1].len - 9, CASTLE.stretch[0].len - 9, 2 * O.outer, 2 * (O.outer - CASTLE.wall), 2 * O.inner, 2 * (O.inner - CASTLE.wall)][short], sx = Math.round(len / U), Y0 = 2, IN = 2, OUT = 21, WALK = Y0 + Math.round(CASTLE.walk / U), sy = WALK + 18, sz = OUT + 6, g = T.makeGrid(sx, sy, sz), K = tools(g), m = masonry(3, 6, Y0);
    const BAY = 34, bays = Math.floor(sx / BAY), lead = Math.floor((sx - bays * BAY) / 2);
    K.box(0, sx, 0, WALK, IN, OUT + 1, m);
    K.box(0, sx, 0, Y0 + 8, OUT + 1, OUT + 2, darker(m));
    yield* pause(slice);
    // The corbel table, the parapet on it, its merlons and the low kerb on the yard's side.
    K.box(0, sx, WALK - 2, WALK, OUT + 1, OUT + 3, PALE);
    K.shape(0, sx, WALK - 6, WALK - 2, OUT + 1, OUT + 3, (x, y, z) => x % 8 < 4 && (z === OUT + 1 || y >= WALK - 4), S3);
    K.box(0, sx, WALK, WALK + 9, OUT - 2, OUT + 3, m);
    K.shape(0, sx, WALK + 9, WALK + 16, OUT - 2, OUT + 3, (x) => (x + 5) % 18 < 10, (x, y, z) => y === WALK + 15 ? PALE : m(x, y, z));
    K.box(0, sx, WALK, WALK + 4, IN, IN + 2, m);
    K.box(0, sx, Y0 + 70, Y0 + 72, OUT + 1, OUT + 2, PALE);
    yield* pause(slice);
    const face = { ox: 0, oz: OUT, ax: 1, az: 0, ix: 0, iz: -1 };
    for (let b = 0; b <= bays; b++) {
      // A buttress on each bay's line, in three offsets.
      const bx = lead + b * BAY, clear = (at) => !gate || Math.abs(at - sx / 2) > GATE_W + 6;
      if (clear(bx)) {
        K.box(bx - 3, bx + 3, 0, Y0 + 34, OUT + 1, OUT + 5, m);
        K.box(bx - 3, bx + 3, Y0 + 34, Y0 + 60, OUT + 1, OUT + 4, m);
        K.box(bx - 2, bx + 2, Y0 + 60, WALK - 6, OUT + 1, OUT + 3, m);
        for (const y of [Y0 + 33, Y0 + 59]) K.box(bx - 3, bx + 3, y, y + 2, OUT + 1, OUT + 5, PALE);
      }
      if (b === bays) break;
      const mid = bx + BAY / 2;
      if (!clear(mid)) continue;
      opening(K, face, mid, 8, Y0 + 14, Y0 + 44, 1, (u, y) => m(u, y, OUT - 1), 0, 1.6);
      for (let y = Y0 + 22; y < Y0 + 36; y++) { for (let z = OUT - 7; z < OUT; z++) K.set(Math.floor(mid), y, z, 0); K.set(Math.floor(mid), y, OUT - 8, DARK); }
      for (let x = Math.floor(mid) - 2; x <= Math.floor(mid) + 2; x++) for (let y = Y0 + 28; y < Y0 + 30; y++) { for (let z = OUT - 4; z < OUT; z++) K.set(x, y, z, 0); K.set(x, y, OUT - 5, DARK); }
    }
    if (gate) {
      // The stone within three cells of the opening dressed pale, through the wall's whole thickness; then the passage.
      const cx = sx / 2, RING = 3, top = (t) => L.westArchTop(t * U) / U, open = (x, y) => y - Y0 < top(x + 0.5 - cx);
      K.shape(cx - GATE_W - RING, cx + GATE_W + RING, 0, Y0 + top(0) + RING + 1, IN, OUT + 1, (x, y, z) => !!K.get(x, y, z) && !open(x, y) && y - Y0 - RING < top((x + 0.5 - cx) * GATE_W / (GATE_W + RING)), PALE);
      K.shape(cx - GATE_W, cx + GATE_W, 0, Y0 + top(0) + 1, 0, sz, (x, y) => open(x, y), 0);
      yield* pause(slice);
    }
    return yield* meshSteps(g, U, { x: -len / 2, y: -Y0 * U, z: -(OUT + 1) * U }, slice);
  })));

  // A curtain tower, a part about its axis, its foot at y 0, its gallery opening toward +z: a round tower with a cannon
  // gallery on its top (keep-layout.js `GALLERY`), a slate spire on its ceiling. `tall` is the taller pair at the
  // castle's back.
  const tower = variants((tall) => cachedSteps(snap("tower:" + tall, function* (slice = null) {
    const R = CASTLE.tower / UK, c = Math.ceil(R) + 6, sx = 2 * c, Y0 = 1, TOP = Y0 + Math.round(CASTLE.towerWalk[tall ? 1 : 0] / UK), CONE = 62, G = L.GALLERY;
    const gallery = { h: Math.round(G.height / UK), wall: G.wall / UK, ceil: Math.round(G.ceil / UK), open: G.open,
      well: { half: G.well.half / UK, len: G.well.len / UK, depth: G.well.depth / UK, steps: G.well.steps, door: Math.round(G.well.door / UK), rail: G.well.rail / UK, railTall: Math.round(G.well.railTall / UK) } };
    const sy = TOP + gallery.h + gallery.ceil + CONE + 14, g = T.makeGrid(sx, sy, sx), K = tools(g), m = masonry(2, 4, Y0);
    const lights = [{ y: Y0 + 41, n: 6, phase: 0.52, half: 1.7, tall: 9 }, { y: Y0 + 78, n: 6, phase: 0, half: 3, tall: 11 }];
    if (tall) lights.push({ y: Y0 + 116, n: 6, phase: 0.52, half: 1.7, tall: 9 });
    roundTower(K, c, c, R, 0, TOP, m, { gallery, cone: CONE, dormers: 4, strings: [Y0 + 35, Y0 + 72, ...(tall ? [Y0 + 109] : [])], slits: [{ y: Y0 + 17, n: 6, tall: 7 }, { y: Y0 + 57, n: 6, phase: 0.52, tall: 7 }], lights });
    yield* pause(slice);
    return yield* meshSteps(g, UK, { x: -c * UK, y: -Y0 * UK, z: -c * UK }, slice);
  })));


  // The gatehouse, a part: x about its middle, its front face on z 0 looking out along +z, its foot at y 0. A tall
  // pointed gate runs straight through it between two buttresses, under a great traceried window; a round turret
  // stands at each front corner under a slate spire.
  const gatehouse = cachedSteps(snap("gatehouse", function* (slice = null) {
    const HW = GATE.halfW / U, DEPTH = Math.round((GATE.front - GATE.back) / U), cx = 82, sx = 164, ZF = 78, Z0 = ZF - DEPTH, Y0 = 2, WB = Y0 + Math.round(GATE.height / U), TR = GATE.turret / U, WT = Y0 + Math.round(GATE.turretHeight / U), CONE = 84;
    const tX = GATE.turretX / U, tZ = ZF + (GATE.turretZ - GATE.front) / U, P = GATE.passage / U, SPRING = Y0 + Math.round(GATE.spring / U), sy = WT + CONE + 14, sz = ZF + 10, g = T.makeGrid(sx, sy, sz), K = tools(g), m = masonry(3, 6, Y0);
    K.box(cx - HW, cx + HW, 0, WB, Z0, ZF, m);
    K.box(cx - HW - 1, cx + HW + 1, 0, Y0 + 8, Z0 - 1, ZF + 1, darker(m));
    yield* pause(slice);
    // The corbel table, parapet and merlons round the block's top.
    K.shape(cx - HW - 3, cx + HW + 3, WB - 6, WB, Z0 - 3, ZF + 3, (x, y, z) => { const out = Math.max(Math.abs(x + 0.5 - cx) - HW, Z0 - (z + 0.5), z + 0.5 - ZF); return out > 0 && out <= (y >= WB - 2 ? 2 : 1) && (y >= WB - 2 || (x + z) % 8 < 4); }, (x, y) => y >= WB - 2 ? PALE : S3);
    K.shape(cx - HW - 2, cx + HW + 2, WB, WB + 16, Z0 - 2, ZF + 2, (x, y, z) => { const ax = Math.abs(x + 0.5 - cx), edge = ax > HW - 3 || z < Z0 + 3 || z >= ZF - 3; return edge && (y < WB + 9 || ((ax > HW - 3 ? z : x) + 4) % 18 < 10); }, (x, y, z) => y === WB + 15 ? PALE : m(x, y, z));
    yield* pause(slice);
    // The turrets, their openings only where they stand clear of the block.
    for (const s of [-1, 1]) {
      const tx = cx + s * tX, clear = (a) => { const px = tx + Math.cos(a) * TR, pz = tZ + Math.sin(a) * TR; return pz > ZF + 1 || Math.abs(px - cx) > HW + 1; };
      roundTower(K, tx, tZ, TR, 0, WT, m, { cone: CONE, dormers: 3, phase: 1.57, strings: [Y0 + 76, WB - 8], only: clear,
        slits: [{ y: Y0 + 30, n: 8, phase: Math.PI / 2 }], lights: [{ y: Y0 + 92, n: 8, phase: Math.PI / 2, half: 2.4, tall: 12 }, { y: Y0 + 160, n: 8, phase: Math.PI / 2 + 0.39, half: 2.4, tall: 12 }] });
      yield* pause(slice);
      // A buttress beside the gate, in offsets, with a pinnacle on its head.
      const bx = cx + s * (P + 7);
      K.box(bx - 3, bx + 3, 0, Y0 + 60, ZF, ZF + 5, m);
      K.box(bx - 3, bx + 3, Y0 + 60, Y0 + 100, ZF, ZF + 3, m);
      for (const y of [Y0 + 59, Y0 + 99]) K.box(bx - 3, bx + 3, y, y + 2, ZF, ZF + (y < Y0 + 80 ? 5 : 3), PALE);
      K.box(bx - 2, bx + 2, Y0 + 101, Y0 + 112, ZF, ZF + 3, PALE);
      K.pyramid(bx, ZF + 1.5, 2.6, 2.6, Y0 + 112, 14, PALE, 1);
    }
    // The gate: the passage through, two recessed orders round its mouths, the great window over it, the chains' slots.
    const front = { ox: cx, oz: ZF - 1, ax: 1, az: 0, ix: 0, iz: -1 }, back = { ox: cx, oz: Z0, ax: 1, az: 0, ix: 0, iz: 1 };
    for (const f of [front, back]) {
      opening(K, f, 0, P + 4, Y0, SPRING, 1, PALE, 0, 2);
      opening(K, f, 0, P + 2, Y0, SPRING, 2, PALE, 0, 0);
    }
    K.shape(cx - P - 1, cx + P + 1, Y0, SPRING + P * 1.74 + 2, Z0 - 2, ZF + 6, (x, y) => pointed(x + 0.5 - cx, y, P, Y0, SPRING, 0) === INSIDE, 0);
    opening(K, front, 0, 13, Y0 + 80, Y0 + 104, 3, glass, 2, 2);
    for (const s of [-1, 1]) K.box(cx + s * (LEAF.halfW - 0.2) / U - 1, cx + s * (LEAF.halfW - 0.2) / U + 1, Y0 + 56, Y0 + 60, ZF - 3, ZF, (x, y, z) => z === ZF - 3 ? DARK : 0);
    yield* pause(slice);
    return yield* meshSteps(g, U, { x: -cx * U, y: -Y0 * U, z: -ZF * U }, slice);
  }));

  // The keep, a part about its own middle, its foot at y 0 and its great door looking out along +z: one great round
  // tower, a storey a level, its drum in the castle's coursed stone with shallow pilasters between its lancets and a
  // string course at each upper floor, a corbel table and ledge under its top level, and that level an open arcade:
  // the wall's own ring with a great pointed arch through it at each of `KEEP.arches`, dressed in pale stone, a ledge
  // over them for the spire's eaves; the alchemy room's and the armory's walls open in the same arches
  // (`KEEP.arcades`); a round bartizan corbelled out on the pier at each of its four angles under its
  // own spire. `body` is everything under the top level's floor (`KEEP.roof` up), `top` everything over it: the
  // halls' top level, which is the keep's from inside, stands `top` round itself as its wall (and `keepSpire` over it).
  const keep = cachedSteps(snap("keep", function* (slice = null) {
    const q = (v) => Math.round(v / UK), R = q(KEEP.r), BR = q(KEEP.br), BX = q(KEEP.bartizan), c = BX + BR + 8, sx = 2 * c, sz = sx, cx = c, cz = c;
    const Y0 = 1, TOP = Y0 + q(KEEP.roof), UP = Y0 + q(KEEP.upper), ARM = Y0 + q(KEEP.armory), AH = q(KEEP.arcade), CONE = 46, FOOT = Y0 + q(KEEP.bartizanFoot), BTOP = FOOT + 40, sy = BTOP + CONE + 20, g = T.makeGrid(sx, sy, sz), K = tools(g), m = masonry(2, 4, Y0);
    // The drum, its battered foot, a string course at each upper floor, and the corbel table and ledge under the arcade.
    roundTower(K, cx, cz, R, 0, TOP, m, { strings: [UP - 2, ARM - 2] });
    yield* pause(slice);
    // The top level: the wall's ring carried on up, a corbel table and a ledge at its head for the spire, and the
    // ceiling within the ledge, all in this one grid so no two faces lie in one plane.
    const IN = R - q(KEEP.wall), dist = (x, z) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz), angle = (x, z) => Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
    {
      K.cyl(cx, cz, R, TOP, TOP + AH, m, IN);
      const corbels = Math.max(8, Math.round(TAU * R / 8));
      K.shape(cx - R - 4, cx + R + 4, TOP + AH - 6, TOP + AH - 2, cz - R - 4, cz + R + 4, (x, y, z) => { const d = dist(x, z); return d <= R + 1.2 && d > R - 1 && frac((angle(x, z) + Math.PI) / TAU * corbels) < 0.5; }, S3);
      K.cyl(cx, cz, R + 2.4, TOP + AH - 2, TOP + AH, PALE, IN);
      K.cyl(cx, cz, IN + 0.5, TOP + AH - 2, TOP + AH, S4);
    }
    yield* pause(slice);
    // Shallow pilasters up the drum between its windows, clear of the door and of the arches.
    const storey = q(KEEP.upper), inArch = (a0, y) => {
      for (const level of KEEP.arcades) {
        const f = Y0 + q(level.floor);
        if (y < f || y >= f + storey) continue;
        return level.arches.some((b) => { let d = a0 - b; d -= Math.round(d / TAU) * TAU; return Math.abs(d) < 0.1; });
      }
      return false;
    };
    for (let k = 0; k < 24; k++) {
      const a0 = (k + 0.5) / 24 * TAU;
      if (Math.cos(a0 - Math.PI / 2) > 0.93) continue;
      K.shape(cx - R - 2, cx + R + 2, Y0 + 14, TOP - 6, cz - R - 2, cz + R + 2, (x, y, z) => {
        const d = dist(x, z); if (d > R + 1.2 || d < R - 1 || inArch(a0, y)) return false;
        let da = angle(x, z) - a0; da -= Math.round(da / TAU) * TAU;
        return Math.abs(da) * R < 2.2;
      }, (x, y, z) => (y - Y0) % 32 === 31 ? PALE : m(x, y, z));
    }
    yield* pause(slice);
    // The great arches of every open level (`KEEP.arcades`), cut clean through the wall, each in a surround of pale
    // dressed stone. Under the top level the drum is solid, so its arches open onto the dark of the room beyond (the
    // halls are the room itself).
    {
      const half = KEEP.arch.half / UK, spring = KEEP.arch.spring / UK;
      for (const level of KEEP.arcades) {
        const F = Y0 + q(level.floor), back = level.floor < KEEP.roof ? IN - 5 : IN - 1;
        for (const a0 of level.arches) {
          const px = cx + Math.cos(a0) * R, pz = cz + Math.sin(a0) * R, reach = half + 12;
          K.shape(px - reach, px + reach, F, F + storey - 6, pz - reach, pz + reach, (x, y, z) => dist(x, z) > back && dist(x, z) <= R + 1.2, (x, y, z) => {
            const d = dist(x, z);
            let da = angle(x, z) - a0; da -= Math.round(da / TAU) * TAU;
            const t = da * d, up = y + 0.5 - F;
            if (up < L.archTop(half, spring, t)) return d > IN - 1 ? 0 : DARK;
            if (d <= IN - 1) return null;
            return d <= R && up < L.archTop(half + 2.4, spring + 1.2, t) + 1.4 ? PALE : null;
          });
        }
      }
    }
    yield* pause(slice);
    // A bartizan out on the pier at each of its four angles: corbelled out from the drum over the top balcony's
    // walkers, round under its spire.
    for (const a of KEEP.bartizans) {
      const bx = cx + Math.cos(a) * BX, bz = cz + Math.sin(a) * BX, foot = FOOT;
      K.shape(bx - BR - 1, bx + BR + 1, foot, foot + 16, bz - BR - 1, bz + BR + 1, (x, y, z) => Math.hypot(x + 0.5 - bx, z + 0.5 - bz) <= 3 + (BR - 3) * (y - foot + 1) / 16, PALE);
      roundTower(K, bx, bz, BR, foot + 16, BTOP, m, { foot: false, merlons: 8, cone: CONE, dormers: 2, phase: a, lights: [{ y: foot + 21, n: 4, phase: a, half: 1.4, tall: 8 }], only: (aa) => Math.cos(aa - a) > 0.1 });
      yield* pause(slice);
    }
    // The great door, framed in pale dressed stone, the lounge's firelight beyond it; and the lancets, where the
    // halls have them from inside.
    roundOpening(K, cx, cz, R, Math.PI / 2, q(KEEP.door.half) + 2, Y0, Y0 + q(KEEP.door.spring), 2, PALE);
    roundOpening(K, cx, cz, R, Math.PI / 2, q(KEEP.door.half), Y0, Y0 + q(KEEP.door.spring), 7, doorway(Y0));
    // The lancets stand open behind iron bars, the rooms' firelight dim beyond them.
    for (const w of KEEP.windows) roundOpening(K, cx, cz, R, w.a, q(w.half), Y0 + q(w.floor + w.sill), Y0 + q(w.floor + w.spring), 4, barred);
    yield* pause(slice);
    // The two halves, apart at the top level's floor.
    const half = (keepTop) => {
      const h = T.makeGrid(sx, sy, sz);
      h.data.set(g.data);
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) if ((y >= TOP) !== keepTop) h.data.fill(0, (x * sy + y) * sz, (x * sy + y + 1) * sz);
      return h;
    };
    const origin = { x: -cx * UK, y: -Y0 * UK, z: -cz * UK };
    const body = yield* meshSteps(half(false), UK, origin, slice);
    const top = yield* meshSteps(half(true), UK, origin, slice);
    return { body, top };
  }));

  // The keep's spire, a part about the keep's middle, in the land's own heights (its eaves `KEEP.roof + KEEP.arcade`
  // up): one great cone of orange slate flared at its eaves as the towers' are, in voxels twice the keep's, standing on
  // the arcade's ceiling (`keep().top`), and eight lit dormers round its foot.
  const keepSpire = cachedSteps(snap("keepSpire", function* (slice = null) {
    const SU = 2 * UK, R = Math.round((KEEP.r + 1.4) / SU), H = Math.round(KEEP.spire / SU), c = R + 4, g = T.makeGrid(2 * c, H + 3, 2 * c), K = tools(g);
    K.cone(c, c, R, 1, H, slate, 1.25);
    yield* pause(slice);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU, yd = 1 + Math.round(H * 0.12), rr = R * (1 - (yd - 1 + 0.5) / H) ** 1.25, cs = Math.cos(a), sn = Math.sin(a);
      for (let w = -3; w <= 3; w++) for (let r = Math.floor(rr - 4); r <= Math.ceil(rr + 2.5); r++) for (let y = 0; y < 9; y++) {
        const x = Math.floor(c + cs * r - sn * w), z = Math.floor(c + sn * r + cs * w), hood = y >= 7 - (Math.abs(w) > 1 ? Math.abs(w) - 1 : 0) || Math.abs(w) > 2;
        if (hood ? !K.get(x, yd + y, z) : true) K.set(x, yd + y, z, hood ? SL1 + 2 : r >= rr + 1.5 ? GLOW : SL1);
      }
    }
    const geo = yield* T.gridGeometrySteps(g, { unit: SU, palette: RGB, origin: { x: -c * SU, y: KEEP.roof + KEEP.arcade - SU, z: -c * SU } }, slice);
    for (const f of geo.faces) { const e = EMISSIVE.get(f.color); if (e) f.emissive = e; }
    return geo;
  }));

  // A balcony round the keep, a part about the keep's middle, its deck's top at y 0: a ring of stone out from the
  // keep's face on a corbel under every pier of the drum and between, its outer edge dressed in pale stone, and a
  // pierced parapet round it with a pier at each torch (`L.TORCHES`), an iron cresset of embers on the pier's head
  // where the scene stands the flame. The same ring serves all three upper levels.
  const balcony = cachedSteps(snap("balcony", function* (slice = null) {
    const B = L.BALCONY, q = (v) => v / UK, OUTR = q(B.outer), IN = q(KEEP.r) - 0.6, RAIL = q(B.outer - B.railW), c = Math.ceil(OUTR) + 3, sx = 2 * c;
    const D = 3, CORB = 8, Y0 = CORB + D, PAR = Math.round(q(B.rail)), PIER = Math.round(q(B.pier)), sy = Y0 + PAR + PIER + 4, g = T.makeGrid(sx, sy, sx), K = tools(g), m = masonry(2, 4, -100);
    const dist = (x, z) => Math.hypot(x + 0.5 - c, z + 0.5 - c), angle = (x, z) => Math.atan2(z + 0.5 - c, x + 0.5 - c);
    // The deck, its outer edge in pale stone.
    K.cyl(c, c, OUTR, CORB, Y0, (x, y, z) => dist(x, z) > OUTR - 1.2 ? PALE : m(x, y, z), IN);
    // The corbels under it, each stepped out from the keep's face to the deck's edge.
    const corbels = Math.round(TAU * OUTR / 14);
    K.shape(0, sx, 0, CORB, 0, sx, (x, y, z) => {
      const d = dist(x, z); if (d <= IN || d > OUTR - 0.5) return false;
      if (Math.abs(frac(angle(x, z) / TAU * corbels + 0.5) - 0.5) * TAU / corbels * d > 1.6) return false;
      return d - IN < (OUTR - 0.5 - IN) * (y + 1) / CORB;
    }, (x, y) => y === CORB - 1 ? PALE : S3);
    yield* pause(slice);
    // The parapet: a base course and a coping in pale stone, pierced between with small pointed openings.
    const holes = Math.round(TAU * OUTR / 6);
    K.shape(0, sx, Y0, Y0 + PAR, 0, sx, (x, y, z) => {
      const d = dist(x, z); if (d <= RAIL || d > OUTR) return false;
      if (y === Y0 || y >= Y0 + PAR - 1) return true;
      const t = frac(angle(x, z) / TAU * holes) * 6, top = y - Y0;
      return !(t > 1.5 && t < 4.5 && top < PAR - 1 - (Math.abs(t - 3) > 1 ? 1 : 0));
    }, (x, y, z) => y === Y0 || y >= Y0 + PAR - 1 ? PALE : m(x, y, z));
    // A pier at each torch, its head a bowl of pale stone with an iron cresset of embers.
    const half = 2.2;
    for (let k = 0; k < B.torches; k++) {
      const a = (k + 0.5) / B.torches * TAU, ca = Math.cos(a), sa = Math.sin(a), mid = q(B.outer - B.railW / 2);
      const local = (x, z) => { const dx = x + 0.5 - c, dz = z + 0.5 - c; return [dx * ca + dz * sa - mid, -dx * sa + dz * ca]; };
      K.shape(c + ca * mid - 6, c + ca * mid + 6, Y0, Y0 + PAR + PIER + 3, c + sa * mid - 6, c + sa * mid + 6, (x, y, z) => {
        const [r, t] = local(x, z), top = Y0 + PAR + PIER, w = y < top ? half : y < top + 1 ? half + 0.6 : half - 0.4;
        return Math.abs(r) < w && Math.abs(t) < w;
      }, (x, y, z) => {
        const [r, t] = local(x, z), top = Y0 + PAR + PIER, inner = Math.abs(r) < half - 1 && Math.abs(t) < half - 1;
        if (y < top) return y === Y0 + PAR - 1 || y === top - 1 ? PALE : m(x, y, z);
        if (y === top) return inner ? GLOW : PALE;
        return inner ? (y === top + 1 ? GLOW : null) : IRONM;
      });
    }
    yield* pause(slice);
    return yield* meshSteps(g, UK, { x: -c * UK, y: -Y0 * UK, z: -c * UK }, slice);
  }));

  // Behind a doorway: dark, with the warm light from inside falling on its floor and the foot of its back.
  const doorway = (foot) => (u, y) => y < foot + 2 ? SPILL : NOOK;
  // A tower door's porch, a part: its back sunk in the tower's face at the origin, looking out along +z, its foot at y 0.
  // One flat face of dressed stone between two plain pilasters, a plinth course at its foot and a cornice at its head,
  // a pointed arch of pale stone round a dark doorway, and a plain stretch of wall between the arch and the cornice for
  // its sign (scene-keep.js, at `PORCH.sign`). Its lanterns hang from brackets on the pilasters (`PORCH.lamp`).
  const PORCH = { sign: 5.42, lamp: { x: 1.31, y: 3.3, z: 1.0 } };
  const porch = cachedSteps(snap("porch", function* (slice = null) {
    const W = 13, cx = W, sx = 2 * W, Z0 = 5, DEPTH = 12, TOP = 50, g = T.makeGrid(sx, TOP + 1, DEPTH + 2), K = tools(g), m = masonry(3, 6, 0), P = 8.8, SPRING = 19;
    K.box(1, sx - 1, 0, TOP, 0, DEPTH, m);
    for (const x0 of [1, sx - 5]) K.box(x0, x0 + 4, 0, TOP - 3, Z0, DEPTH + 1, m);
    K.box(0, sx, 0, 2, Z0, DEPTH + 1, PALE);
    K.box(0, sx, TOP - 3, TOP - 1, Z0, DEPTH + 1, PALE);
    K.box(1, sx - 1, TOP - 1, TOP, Z0, DEPTH, PALE);
    yield* pause(slice);
    const face = { ox: cx, oz: DEPTH - 1, ax: 1, az: 0, ix: 0, iz: -1 };
    opening(K, face, 0, P + 2, 0, SPRING, 2, PALE, 0, 1.6);
    // Three cells deep, so its back stands clear of the tower's stepped foot behind it.
    opening(K, face, 0, P, 0, SPRING, 3, doorway(0), 0, 0);
    return yield* meshSteps(g, U, { x: -cx * U, y: 0, z: -Z0 * U }, slice);
  }));
  // The castle as the yard stands it, in the land's frame: every fixed part with where it stands and how it turns, and
  // `tag` for the keep's two halves. The yard stands them all; the halls' rooftop stands them round itself as its view
  // out (all but the keep's body, which is the halls' own walls), so the two never disagree.
  const castleParts = (tall) => {
    const list = [], put = (geometry, x = 0, z = 0, ry = 0, hidden = false, tag = null, y = 0, scale = 1) => list.push({ geometry, x, y, z, ry, hidden, tag, scale });
    const H = CASTLE.half, HZ = CASTLE.halfZ, k = keep();
    put(terrain(0)()); put(terrain(1)()); put(terrain(2)()); put(volcanoCone()); put(water(), 0, 0, 0, true);
    // Cold Storj: its ground, its mountains, its paths' ledges, its dock and its caves' mouths.
    put(terrain(3)());
    // The arena's rock behind the castle, and the high bridge to it out of the back gate, turned to run north.
    put(terrain(4)()); put(backBridge(), 0, 0, -Math.PI / 2);
    for (let i = 0; i < L.STORJ.mountains.length; i++) put(storjMountain(i)());
    put(storjWays());
    for (const t of L.STORJ.turrets) put(storjTower(), t.x, t.z, t.yaw, false, "storj-tower", t.y);
    { const house = longhouse(); for (const h of L.STORJ.houses) for (const part of [...house.walls, house.frame, house.roof]) put(part, h.x, h.z, h.yaw, false, null, h.y); }
    { const d = storjDock(); put(d.stone); put(d.timber); }
    for (const c of L.STORJ.caveAt) { const cave = storjCave(); put(cave.rock, c.x, c.z, c.yaw, false, null, c.y); put(cave.ice, c.x, c.z, c.yaw, true, null, c.y); }
    { const v = volcanoDock(); put(v.stone); put(v.timber); put(v.glow, 0, 0, 0, true); }
    // Outpost Island: its ground, its two curtains (a gate through every side), its courtyard's flags, the castle's
    // keep in the middle with its door shut, a bridge out of every outer gate to its dock, and a curtain tower on its
    // footing at each end of every dock's cross. All tagged `outpost`, its towers `outpost-tower` in `L.GALLERIES`' order.
    {
      const O = L.OUTPOST, k = keep(), d = outpostDocks(), tag = "outpost";
      put(terrain(6)(), 0, 0, 0, false, tag);
      for (const [W, ns, ew] of [[O.outer, 4, 5], [O.inner, 6, 7]]) {
        put(wall(ns)(), O.x, O.z + W, 0, false, tag); put(wall(ns)(), O.x, O.z - W, Math.PI, false, tag);
        put(wall(ew)(), O.x + W, O.z, Math.PI / 2, false, tag); put(wall(ew)(), O.x - W, O.z, -Math.PI / 2, false, tag);
      }
      put(d.yard, 0, 0, 0, false, tag); put(d.stone, 0, 0, 0, false, tag); put(d.timber, 0, 0, 0, false, tag);
      put(k.body, O.x, O.z, 0, false, tag); put(k.top, O.x, O.z, 0, false, tag); put(keepSpire(), O.x, O.z, 0, false, tag);
      for (const f of L.BALCONY.floors) put(balcony(), O.x, O.z, 0, false, tag, f);
      const door = O.z + KEEP.r - 0.5;
      put(doorLeaf(), O.x - 1.48, door, Math.PI / 2, false, tag); put(doorLeaf(), O.x + 1.48, door, -Math.PI / 2, false, tag);
      put(models.box({ w: 3.2, h: 5.4, d: 0.2, color: "#0b0a0c", offset: { y: 2.7 } }), O.x, door - 0.3, 0, false, tag);
      for (const a of O.arms) put(outpostBridge(), a.gx, a.gz, a.yaw, false, tag);
      for (const t of O.towers) { put(tower(t.tall)(), t.x, t.z, t.yaw, false, "outpost-tower", t.ground); put(towerSkirt(), t.x, t.z, 0, false, tag, t.ground); }
    }
    // Shards: its ground, its dock, its paved way down the trench, and the cave's mouth at the trench's foot under its
    // sign, looking back up the trench to the west.
    {
      const S = L.SHARDS, d = shardsDock(), mouth = storjCave().frame, sign = wordSign("SHARDS", 0.7);
      put(terrain(5)()); put(d.stone); put(d.timber); put(shardsWays());
      put(mouth, S.mouth.x, S.z, -Math.PI / 2, false, null, S.trench.floor);
      let low = Infinity;
      for (let i = 1; i < sign.verts.length; i += 3) low = Math.min(low, sign.verts[i]);
      put(sign, S.trench.notch.x0 + 0.6, S.z, -Math.PI / 2, false, null, S.plateau - low);
    }
    // CBDC's wall round the cone: its eight sides (the gate's first, the two with a stair either side of it), a
    // red-roofed turret at every corner, and the paved way from the gate to the cave.
    {
      const W = L.VOLCANO.wall, ring = cbdcWall();
      W.sides.forEach((side, k) => put(k === 0 ? ring.gate : k === 1 ? ring.stairs[0] : k === 7 ? ring.stairs[1] : ring.side, side.x, side.z, side.yaw));
      for (const t of W.turrets) put(ring.turret, t.x, t.z, t.yaw, false, "cbdc-turret", t.y);
      put(ring.way);
    }
    put(flags(), 0, 0, 0, true); put(stairs()); put(dock()); put(abutment()); put(ruin()); put(plinth()); put(yard(), 0, 0, 0, true);
    for (const sx of [-1, 1]) {
      put(wall(1)(), sx * (H + 3) / 2, CZ + HZ);
      // Each side wall's forward stretch has a gate through it, the west's and the east's.
      for (const sz of [-1, 1]) put(wall(sz > 0 ? 3 : 2)(), sx * H, CASTLE.stretch[sz > 0 ? 0 : 1].mid, sx * Math.PI / 2);
    }
    // The bridge out of the west gate, and the same turned about its own middle line out of the east gate.
    put(westBridge());
    put(westBridge(), 0, 2 * L.WEST_BRIDGE.z, Math.PI);
    // The signs over every way between the yard and the outside, one on each face: over the gatehouse's passage, and
    // over the west and east gates (`wordSign`), each above its opening's dressed stone and clear of the chains and
    // the portcullis's path inside the wall.
    {
      const inner = CASTLE.half - CASTLE.wall, out = CASTLE.half + 0.08;
      put(wordSign("COURTYARD", 0.9), 0, GATE.front + 0.01, 0, false, null, 9.05);
      put(wordSign("CASTLE ISLAND", 0.9), 0, GATE.back - 0.01, Math.PI, false, null, 9.05);
      put(wordSign("SHIPYARD", 0.9), -inner, L.WEST.z, Math.PI / 2, false, null, 8.75);
      put(wordSign("COURTYARD", 0.9), -out, L.WEST.z, -Math.PI / 2, false, null, 8.75);
      put(wordSign("ARMORY & FORGE", 0.9), inner, L.WEST.z, -Math.PI / 2, false, null, 8.75);
      put(wordSign("COURTYARD", 0.9), out, L.WEST.z, Math.PI / 2, false, null, 8.75);
      put(wordSign("ARENA", 0.9), 0, CZ - CASTLE.halfZ + CASTLE.wall, 0, false, null, 8.75);
      put(wordSign("COURTYARD", 0.9), 0, CZ - CASTLE.halfZ - 0.08, Math.PI, false, null, 8.75);
    }
    // The shipyard as the keep's rooftop sees it (`shipyard`: the yard stands its own, its halls' roofs and walls apart).
    {
      const dock = shipyard(), big = galleon(), at = L.SHIPS.find((q) => q.kind === "galleon").home, house = longhouse();
      put(dock.stone, 0, 0, 0, false, "shipyard"); put(dock.timber, 0, 0, 0, false, "shipyard");
      for (const part of [big.hull, big.rig, big.sails, big.guns]) { put(part, at.x, at.z, at.yaw, false, "shipyard", L.SEA); list[list.length - 1].scale = L.GALLEON.scale; }
      for (const h of L.HALLS) for (const part of [...house.walls, house.frame, house.roof]) put(part, h.dx, h.mz, h.door > 0 ? 0 : Math.PI, false, "shipyard", L.SHIPYARD.y);
      // And the Armory & Forge's quay, piers and decks, stood by the yard as the shipyard's are.
      const forge = armoryDock();
      put(forge.stone, 0, 0, 0, false, "shipyard"); put(forge.timber, 0, 0, 0, false, "shipyard");
    }
    CASTLE.towers.forEach(([x, z, t], i) => { put(tower(t)(), x, z, L.GALLERIES[i].yaw, false, "castle-tower"); put(towerSkirt(), x, z, i * 2.3); });
    put(wall(0)(), 0, CZ - HZ, Math.PI);
    put(gatehouse(), 0, GATE.front);
    L.TURRETS.forEach((t, i) => { const l = L.LADDERS[i]; put(turret(), t.x, t.z, t.yaw, false, "turret", t.y); put(turretCrown(), t.x, t.z, t.yaw, false, "turret-crown", t.y); put(turretLadder(Math.round((l.top - l.bottom) * 4) / 4)(), l.x, l.z, t.yaw, false, "turret-ladder", l.bottom); });
    put(k.body, KEEP.x, KEEP.z, 0, false, "keep-body");
    put(k.top, KEEP.x, KEEP.z, 0, false, "keep-top");
    put(keepSpire(), KEEP.x, KEEP.z, 0, false, "keep-top");
    for (const f of L.BALCONY.floors) put(balcony(), KEEP.x, KEEP.z, 0, false, "keep-balcony", f);
    return list;
  };

  // One leaf of the keep's great door, opened: its hinge on the origin, the leaf lying out along +z, oak boards
  // strapped in iron, its foot at y 0.
  const doorLeaf = cached(() => {
    const parts = [];
    for (let k = 0; k < 6; k++) parts.push(box({ w: 0.12, h: 3.9, d: 0.24, color: k % 2 ? "#4a3524" : "#5d4530", offset: { x: 0, y: 1.95, z: 0.13 + k * 0.245 } }));
    for (const y of [0.5, 1.7, 2.9]) parts.push(box({ w: 0.15, h: 0.1, d: 1.48, color: IRON, offset: { x: 0, y, z: 0.74 } }));
    parts.push(box({ w: 0.2, h: 0.2, d: 0.06, color: IRON, offset: { x: 0.08, y: 1.6, z: 1.3 } }));
    return merge(...parts);
  });

  // The land's lettering, Uncial Antiqua (keep-font-data.js), added once from its bytes: a FontFace made from a buffer
  // fetches nothing, so the content policy needs no font source. The titles' CSS and the sky's names ask for it by
  // `family`; the carved signs wait for it (`awaitFont`, at the head of `buildSteps`) and fall back to the island's
  // blocky alphabet where the browser has no FontFace or the face will not load.
  const FONT = { family: "Uncial Antiqua", ready: false, failed: false };
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !BL.keepFontData) FONT.failed = true;
  else {
    const raw = atob(BL.keepFontData), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const face = new FontFace(FONT.family, bytes.buffer);
    face.load().then(() => { document.fonts.add(face); FONT.ready = true; }, () => { FONT.failed = true; });
  }
  BL.keepFont = FONT;
  const awaitFont = function* () { while (!FONT.ready && !FONT.failed) yield; };

  // A carved board naming where a way leads, hung over it: the island's sign board (hubModels.caveSign's posts, planks
  // and dark panel) with its words cut in the land's lettering as lit blocks, a part `scale` of the island's size with
  // its middle at the origin, its back on z 0 and its face toward +z. The words are drawn once on a scratch canvas,
  // `LETTER.over` times finer than a cell, and a cell is ink where most of it is; ink cells are laid as rectangles,
  // each row's runs carried down while the row under has the same run. Without the face it is the island's own sign.
  const LETTER = { cell: 0.025, rows: 17, over: 4, spacing: 1.2 };
  const letterCells = (text) => {
    const O = LETTER.over, cv = document.createElement("canvas"), ctx = cv.getContext("2d", { willReadFrequently: true });
    const font = (px) => `400 ${px}px "${FONT.family}"`;
    ctx.font = font(100);
    const px = 100 * LETTER.rows * O / ctx.measureText("H").actualBoundingBoxAscent;
    ctx.font = font(px); ctx.letterSpacing = `${LETTER.spacing * O}px`;
    const m = ctx.measureText(text), asc = Math.ceil(m.actualBoundingBoxAscent / O) * O, desc = Math.ceil(m.actualBoundingBoxDescent / O) * O;
    const cols = Math.ceil((m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / O) + 2, rows = (asc + desc) / O + 2;
    cv.width = cols * O; cv.height = rows * O;
    ctx.font = font(px); ctx.letterSpacing = `${LETTER.spacing * O}px`; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#fff";
    ctx.fillText(text, O + m.actualBoundingBoxLeft, O + asc);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data, ink = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let y = 0; y < O; y++) for (let x = 0; x < O; x++) sum += data[((r * O + y) * cv.width + c * O + x) * 4 + 3];
      ink[r * cols + c] = sum >= 128 * O * O ? 1 : 0;
    }
    return { cols, rows, ink };
  };
  const fontSign = (text) => {
    const { SIGN_PLANKS, SIGN_INK, SIGN_PAD, SIGN_FRONT, CAVE_SIGN_WIDTH, CAVE_SIGN_HEIGHT } = BL.hubModels;
    const { cols, rows, ink } = letterCells(text), C = LETTER.cell, textW = cols * C, textH = rows * C;
    const width = Math.max(CAVE_SIGN_WIDTH, textW + SIGN_PAD), half = CAVE_SIGN_HEIGHT * 0.5, plankH = (CAVE_SIGN_HEIGHT - 0.04) / 3, depth = 0.3, mid = SIGN_FRONT - depth / 2;
    const geos = [];
    for (const side of [-1, 1]) geos.push(bevelBox({ w: 0.2, h: CAVE_SIGN_HEIGHT + 0.44, d: 0.2, color: "#6b4524", offset: { x: side * (width * 0.5 - 0.42), y: 0.02, z: 0.03 } }));
    [[0.07, 0.03], [-0.05, -0.04], [0.11, 0.02]].forEach(([grow, shift], k) => {
      geos.push(bevelBox({ w: width + grow, h: plankH, d: depth, color: SIGN_PLANKS[k], bevel: 0.05, offset: { x: shift, y: half - plankH * (k + 0.5) - 0.02 * k, z: mid } }));
    });
    geos.push(bevelBox({ w: textW + 0.14, h: Math.min(textH + 0.06, CAVE_SIGN_HEIGHT - 0.12), d: 0.035, color: "#3f2513", bevel: 0.012, offset: { x: 0, y: 0, z: SIGN_FRONT + 0.0125 } }));
    const used = new Uint8Array(cols * rows), x0 = -textW / 2, y0 = textH / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (!ink[r * cols + c] || used[r * cols + c]) continue;
      let n = 1;
      while (c + n < cols && ink[r * cols + c + n] && !used[r * cols + c + n]) n++;
      const same = (row) => {
        for (let i = 0; i < n; i++) if (!ink[row * cols + c + i] || used[row * cols + c + i]) return false;
        return (c === 0 || !ink[row * cols + c - 1]) && (c + n === cols || !ink[row * cols + c + n]);
      };
      let h = 1;
      while (r + h < rows && same(r + h)) h++;
      for (let j = 0; j < h; j++) for (let i = 0; i < n; i++) used[(r + j) * cols + c + i] = 1;
      geos.push(box({ w: C * n, h: C * h, d: 0.07, color: SIGN_INK, emissive: 1, offset: { x: x0 + C * (c + n / 2), y: y0 - C * (r + h / 2), z: SIGN_FRONT + 0.03 } }));
    }
    return merge(...geos);
  };
  const WORD_SIGNS = new Map();
  const wordSign = (text, scale) => {
    const key = `${text}|${scale}`;
    let geo = WORD_SIGNS.get(key);
    if (geo) return geo;
    const sign = FONT.ready ? fontSign(text) : BL.hubModels.caveSign(text, null, false, true), verts = sign.verts.slice();
    for (let i = 0; i < verts.length; i += 3) { verts[i] *= scale; verts[i + 1] *= scale; verts[i + 2] = (verts[i + 2] + 0.08) * scale; }
    geo = merge({ verts, faces: sign.faces, lines: sign.lines });
    WORD_SIGNS.set(key, geo);
    return geo;
  };

  // ---------- the arena's rock ----------
  // The plinth the castle stands on, in the land's frame: four battered faces of the arena's blocks from the moat's
  // bed up to the walking level, capped with the castle's ground.
  const plinth = cached(() => {
    const rand = mulberry32(6841), crag = geometry(), low = MOAT.bed - 0.2, H = -low, rows = 5, out = CASTLE.plinthFoot - CASTLE.plinthTop, tilt = Math.atan2(out, H), c = Math.cos(tilt), s = Math.sin(tilt);
    // The half extents of the battered foot, across and along.
    const FX = CASTLE.half + CASTLE.plinthFoot, FZ = CASTLE.halfZ + CASTLE.plinthFoot;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, n0 = [Math.sin(a), 0, Math.cos(a)], r = [Math.cos(a), 0, -Math.sin(a)], along = k % 2 ? FZ : FX, off = k % 2 ? FX : FZ;
      const u = [-n0[0] * s, c, -n0[2] * s], n = [n0[0] * c, s, n0[2] * c], cols = Math.round(2 * along), cw = 2 * along / cols, ch = H / c / rows;
      blockFace(crag, rand, [n0[0] * off - r[0] * along, low, CZ + n0[2] * off - r[2] * along], r, u, n, cols, rows, cw, ch, BIG_BLOCKS, BIG);
    }
    const TX = CASTLE.half + CASTLE.plinthTop, TZ = CASTLE.halfZ + CASTLE.plinthTop;
    const cap = box({ w: 2 * TX, h: H, d: 2 * TZ, color: "#2d2824", offset: { x: 0, y: low + H / 2 - 0.005, z: CZ } });
    return shaded([crag], [cap]);
  });
  // A corner tower's skirt, a part about the tower's axis: the arena's blocks round its foot, battered down to the bed.
  const towerSkirt = cached(() => {
    const rand = mulberry32(6857), crag = geometry(), low = MOAT.bed - 0.2, rows = 5, ch = -low / rows, cols = 49, R0 = CASTLE.tower + 1.25, R1 = CASTLE.tower + 0.3;
    layBlocks(cols, rows, BIG_BLOCKS, rand, () => true, (i, j, w, h) => {
      const a = (i + w / 2) / cols * TAU, cs = Math.cos(a), sn = Math.sin(a), up = (j + h / 2) / rows, R = R0 + (R1 - R0) * up + rand() * 0.2 - 0.1;
      stone(crag, [cs * R, low + (j + h / 2) * ch, sn * R], [-sn, 0, cs], UP, [cs, 0, sn], w * TAU * R / cols + BIG.lap, h * ch + BIG.lap, BIG.depth, BIG.chamfer, Math.min(w, h) > 1 ? 0.14 : 0.1, ARENA[Math.floor(rand() * 3)]);
    });
    return shaded([crag]);
  });
  // A cannon turret (keep-layout.js `TURRETS`), a part, its middle on the ground it stands on: a round drum of the
  // arena's metre blocks running down past its foot into the slope, a ring of corbels under a flagged deck, and
  // merlons round it, all in a stone near black, darker than the islet's slate, with a gap at the ladder's head on its landward (-z) side and the quarter toward the sea (+z) open.
  const BLACK_STONE = ["#17181b", "#1d1e22", "#121316", "#222327"];
  const drum = (H, tones, seed, rows, R = L.TURRET.r) => {
    const low = -4, rand = mulberry32(seed), crag = geometry(), ch = (H - low) / rows, cols = 20, parts = [];
    layBlocks(cols, rows, BIG_BLOCKS, rand, () => true, (i, j, w, h) => {
      const a = (i + w / 2) / cols * TAU, cs = Math.cos(a), sn = Math.sin(a), R0 = R - 0.25 + rand() * 0.16;
      stone(crag, [cs * R0, low + (j + h / 2) * ch, sn * R0], [-sn, 0, cs], UP, [cs, 0, sn], w * TAU * R0 / cols + BIG.lap, h * ch + BIG.lap, BIG.depth, BIG.chamfer, Math.min(w, h) > 1 ? 0.14 : 0.1, tones[Math.floor(rand() * 3)]);
    });
    parts.push(moved(lathe({ profile: [[0, 0], [R - 0.1, 0], [R - 0.1, 0.04], [0, 0.04]], segments: 20, color: tones[3] }), 0, H - 0.04, 0));
    parts.push(moved(lathe({ profile: [[R - 0.3, 0], [R + 0.3, 0.28], [R + 0.3, 0.5], [R - 0.3, 0.5]], segments: 20, color: tones[1] }), 0, H - 0.6, 0));
    return merge(shaded([crag]), ...parts);
  };
  const turret = cached(() => drum(L.TURRET.rise, BLACK_STONE, 7411, 12));
  // A tower of Cold Storj's fjord (keep-layout.js `STORJ.turrets`), a part as the turret is, three turrets tall: its
  // drum in the black stone, a band of pale ice under the deck, merlons all round but over the quarter its cannon
  // fires through (+z), and down its face under that gap a black banner with EntropyLab's mark in white (the hub's
  // own banner art, `BL.dressing.LAB_LOGO`).
  const storjTower = cached(() => {
    const R = L.TURRET.r, H = L.TURRET.rise * 3, parts = [drum(H, BLACK_STONE, 7451, 34)];
    parts.push(noShadow(moved(lathe({ profile: [[R + 0.02, 0], [R + 0.1, 0.06], [R + 0.1, 0.3], [R + 0.02, 0.36]], segments: 20, color: "#8fd8ff", emissive: 0.7 }), 0, H - 1.5, 0)));
    for (let k = 0; k < 14; k++) {
      const a = (k + 0.5) / 14 * TAU, cs = Math.cos(a), sn = Math.sin(a);
      if (sn > 0.68) continue;
      parts.push(moved(models.turnedY(bevelBox({ w: 0.95, h: k % 2 ? 1.25 : 0.7, d: 0.5, color: BLACK_STONE[k % 3], bevel: 0.06 }), Math.PI / 2 - a), cs * (R - 0.02), H + (k % 2 ? 0.625 : 0.35), sn * (R - 0.02)));
    }
    // The banner: an iron pole, black cloth with a ragged foot, and the mark in rows of white.
    const rows = BL.dressing.LAB_LOGO, W = 3.4, px = (W - 0.4) / rows[0].length, tall = rows.length * px + 0.9, top = H - 2.6, z = R + 0.16;
    parts.push(box({ w: W + 0.5, h: 0.12, d: 0.12, color: IRON, offset: { y: top + 0.05, z } }));
    parts.push(box({ w: W, h: tall, d: 0.05, color: "#0b0b0d", offset: { y: top - tall / 2, z } }));
    for (let k = 0; k < 5; k++) parts.push(box({ w: W / 5 - 0.12, h: 0.35 + (k % 2) * 0.3, d: 0.05, color: "#0b0b0d", offset: { x: (k - 2) * W / 5, y: top - tall - 0.15 - (k % 2) * 0.15, z } }));
    const ink = [];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length;) {
        if (row[c] === ".") { c++; continue; }
        const start = c; while (c < row.length && row[c] !== ".") c++;
        ink.push(box({ w: (c - start) * px, h: px + 0.004, d: 0.02, color: "#f2efe8", emissive: 0.35, offset: { x: ((start + c) / 2 - row.length / 2) * px, y: top - 0.45 - (r + 0.5) * px, z: z + 0.035 } }));
      }
    });
    parts.push(noShadow(merge(...ink)));
    return merge(...parts);
  });
  // Its merlons, a part of their own on the turret's frame, so the scene can take them out of the view of whoever
  // mans its cannon.
  const turretCrown = cached(() => {
    const TT = L.TURRET, R = TT.r, H = TT.rise, parts = [];
    // Fourteen merlons round the deck, none across the ladder's head.
    for (let k = 0; k < 14; k++) {
      const a = (k + 0.5) / 14 * TAU, cs = Math.cos(a), sn = Math.sin(a);
      // None across the ladder's head, nor over the quarter facing the sea, where the cannon stands out over the rim.
      if (sn < -0.92 || sn > 0.68) continue;
      parts.push(moved(models.turnedY(bevelBox({ w: 0.95, h: k % 2 ? 1.25 : 0.7, d: 0.5, color: BLACK_STONE[k % 3], bevel: 0.06 }), Math.PI / 2 - a), cs * (R - 0.02), H + (k % 2 ? 0.625 : 0.35), sn * (R - 0.02)));
    }
    return merge(...parts);
  });
  // Its ladder, a part, its foot at the origin and `rise` tall, standing `L.TURRET.off` off the drum behind it (+z),
  // with a timber ledge from its head to the deck.
  const turretLadder = variants((rise) => cached(() => {
    const parts = [], OAKL = "#5a4028", OAKD = "#3a2618", off = L.TURRET.off;
    for (const sx of [-1, 1]) parts.push(box({ w: 0.09, h: rise + 0.9, d: 0.09, color: OAKD, offset: { x: sx * 0.42, y: (rise + 0.9) / 2, z: 0 } }));
    for (let y = 0.3; y < rise; y += 0.34) parts.push(box({ w: 0.86, h: 0.06, d: 0.07, color: OAKL, offset: { x: 0, y, z: 0 } }));
    parts.push(bevelBox({ w: 1.5, h: 0.1, d: off + 0.6, color: OAKL, bevel: 0.02, offset: { x: 0, y: rise - 0.05, z: (off + 0.6) / 2 - 0.12 } }));
    for (const sx of [-1, 1]) parts.push(beam(sx * 0.6, rise - 0.9, off + 0.25, sx * 0.6, rise - 0.08, 0.05, 0.05, OAKD));
    return merge(...parts);
  }));
  // A cannon, its trunnions over the origin `CANNON.y` up and its muzzle toward +z: `carriage` an oak bed on four iron-
  // shod wheels with a gunner's stool behind it, `barrel` (about its trunnions) dark iron banded in orange, flaring
  // at the muzzle, a knob at the breech; `CANNON.muzzle` is how far the muzzle stands from the trunnions.
  const CANNON = { y: 0.78, muzzle: 2.0, stool: { y: 0.42, z: -1.55 } };
  const cannon = cached(() => {
    const OAKL = "#4a3420", OAKD = "#2f2016", IRONC = "#1b1c20", OR = "#f7931a", parts = [];
    parts.push(bevelBox({ w: 1.0, h: 0.26, d: 2.1, color: OAKL, bevel: 0.04, offset: { x: 0, y: 0.36, z: -0.15 } }));
    for (const sx of [-1, 1]) {
      parts.push(bevelBox({ w: 0.16, h: 0.5, d: 1.5, color: OAKD, bevel: 0.03, offset: { x: sx * 0.42, y: 0.62, z: -0.05 } }));
      for (const z of [0.55, -0.85]) parts.push(moved(turnedZ(lathe({ profile: [[0, -0.07], [0.3, -0.07], [0.32, 0], [0.3, 0.07], [0, 0.07]], segments: 12, color: OAKD }), Math.PI / 2), sx * 0.62, 0.3, z),
        moved(turnedZ(lathe({ profile: [[0.26, -0.08], [0.33, -0.08], [0.33, 0.08], [0.26, 0.08]], segments: 12, color: IRONC }), Math.PI / 2), sx * 0.62, 0.3, z));
    }
    parts.push(moved(lathe({ profile: [[0, 0], [0.26, 0], [0.24, 0.36], [0.28, 0.4], [0, 0.4]], segments: 10, color: OAKD }), 0, 0, CANNON.stool.z));
    const tube = lathe({ profile: [[0, -0.95], [0.12, -0.95], [0.16, -0.86], [0.3, -0.8], [0.3, -0.2], [0.26, 0.2], [0.22, 1.7], [0.3, 1.82], [0.3, CANNON.muzzle], [0.17, CANNON.muzzle], [0.17, 1.2], [0, 1.2]], segments: 14, color: IRONC });
    const bands = [-0.6, 0.15, 0.95, 1.6].map((y, i) => lathe({ profile: [[0.2, y - 0.05], [0.32 - i * 0.02, y - 0.05], [0.32 - i * 0.02, y + 0.05], [0.2, y + 0.05]], segments: 14, color: OR }));
    const trunnion = turnedZ(lathe({ profile: [[0, -0.5], [0.09, -0.5], [0.09, 0.5], [0, 0.5]], segments: 8, color: IRONC }), Math.PI / 2);
    return { carriage: merge(...parts), barrel: merge(turnedX(merge(tube, ...bands), Math.PI / 2), trunnion) };
  });
  // One of the aim's dots: a small glowing bead, 0.1 m across.
  const aimDot = cached(() => noShadow(lathe({ profile: [[0, -0.05], [0.035, -0.035], [0.05, 0], [0.035, 0.035], [0, 0.05]], segments: 8, color: "#ffe0a0", emissive: 0.85 })));
  // A cannon's shot: a ball of fire, a white-hot core in an orange shell, and the muzzle's flash.
  const fireball = cached(() => {
    const ball = (r, color, e) => lathe({ profile: [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], segments: 10, color, emissive: e });
    return noShadow(merge(ball(0.34, "#ff7a1a", 1), ball(0.22, "#ffe9a0", 1)));
  });
  // A parapet's pier, where a lantern stands: a part, its foot at the origin.
  const PIER_H = 1.34;
  const pier = (x, z) => bevelBox({ w: 0.66, h: PIER_H, d: 0.66, color: ARENA[1], bevel: 0.07, offset: { x, y: PIER_H / 2, z } });
  const paved = (inside, x0, x1, z0, z1, space, seed, top = 0.022) => {
    const rand = mulberry32(seed), seeds = [], stones = geometry();
    for (let x = x0 - space; x < x1 + space; x += space) for (let z = z0 - space; z < z1 + space; z += space) {
      const sx = x + (rand() - 0.5) * space * 0.5, sz = z + (rand() - 0.5) * space * 0.5;
      seeds.push([sx, sz, inside(sx, sz)]);
    }
    for (const { poly } of paving(seeds, space * 0.55)) flagstone(stones, poly, FLAGS[Math.floor(rand() * FLAGS.length)], top + rand() * 0.012);
    return stones;
  };

  // The stair down the castle island's sea cliff, in the land's frame: a causeway of the arena's blocks at half size
  // standing up out of the sea, its treads stepping down from the court between parapets coped in stone, a pier for each
  // lantern, to the quay at its foot where the ferry berths.
  const stairs = cached(() => {
    const S = STAIRS, Q = QUAY, rand = mulberry32(5150), crag = geometry(), flat = [], C = 0.5, low = L.SEA - 2.5, hw = S.halfW;
    const top = (z) => L.stairsAt(0, Math.min(Math.max(z, S.z0), S.b1));
    const cols = Math.round((S.b1 - S.z0) / C), rows = Math.round((1.2 - low) / C);
    for (const s of [-1, 1]) {
      // The causeway's long face up to the parapet's coping, and the parapet's inner face over the treads.
      blockFace(crag, rand, [s * hw, low, S.z0], [0, 0, 1], UP, [s, 0, 0], cols, rows, C, C, SMALL_BLOCKS, SMALL, (i, j) => low + (j + 0.5) * C < top(S.z0 + (i + 0.5) * C) + 1.05);
      blockFace(crag, rand, [s * S.deck, low, S.z0], [0, 0, 1], UP, [-s, 0, 0], cols, rows, C, C, SMALL_BLOCKS, SMALL, (i, j) => { const y = low + (j + 0.5) * C, t = top(S.z0 + (i + 0.5) * C); return y > t && y < t + 1.05; });
      // The quay's side and the step out from the stair to it.
      blockFace(crag, rand, [s * Q.halfW, low, Q.z0], [0, 0, 1], UP, [s, 0, 0], Math.round((Q.z1 - Q.z0) / C), Math.round((Q.y - low) / C), C, C, SMALL_BLOCKS, SMALL);
      blockFace(crag, rand, [s * hw, low, Q.z0], [s, 0, 0], UP, [0, 0, -1], Math.round((Q.halfW - hw) / C), Math.round((Q.y - low) / C), C, C, SMALL_BLOCKS, SMALL);
    }
    blockFace(crag, rand, [-Q.halfW, low, Q.z1], [1, 0, 0], UP, [0, 0, 1], Math.round(2 * Q.halfW / C), Math.round((Q.y - low) / C), C, C, SMALL_BLOCKS, SMALL);
    // The treads, each a slab of the court's flagstone over the causeway's fill, and the coping stepping down with them.
    for (let k = 0; k < 2 * S.flight + 1; k++) {
      const z0 = k < S.flight ? S.z0 + k * S.tread : k === S.flight ? S.a1 : S.b0 + (k - S.flight - 1) * S.tread, z1 = k < S.flight ? z0 + S.tread : k === S.flight ? S.b0 : z0 + S.tread, y = top((z0 + z1) / 2), d = z1 - z0;
      flat.push(bevelBox({ w: 2 * S.deck, h: 0.16, d: d + 0.01, color: FLAGS[k % FLAGS.length], bevel: 0.03, offset: { x: 0, y: y - 0.08, z: (z0 + z1) / 2 } }));
      flat.push(box({ w: 2 * S.deck - 0.04, h: y - 0.16 - low, d: d, color: "#2a2623", offset: { x: 0, y: (y - 0.16 + low) / 2, z: (z0 + z1) / 2 } }));
      for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.68, h: 0.13, d: d + 0.02, color: ARENA[1], bevel: 0.04, offset: { x: s * (hw - 0.25), y: y + 1.05, z: (z0 + z1) / 2 } }));
    }
    // The quay: its fill, its flags and two iron bollards for the ferry's lines.
    flat.push(box({ w: 2 * Q.halfW - 0.1, h: Q.y - low, d: Q.z1 - Q.z0 - 0.05, color: "#2a2623", offset: { x: 0, y: (Q.y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
    flat.push(moved(paved((x, z) => Math.abs(x) < Q.halfW - 0.2 && z > Q.z0 + 0.1 && z < Q.z1 - 0.15, -Q.halfW, Q.halfW, Q.z0, Q.z1, 0.95, 5161), 0, Q.y, 0));
    for (const z of [L.FERRY.quay.z - 1.8, L.FERRY.quay.z + 1.8]) flat.push(moved(lathe({ profile: [[0, 0], [0.17, 0], [0.13, 0.1], [0.12, 0.42], [0.18, 0.48], [0, 0.52]], segments: 10, color: IRON }), Q.halfW - 0.28, Q.y, z));
    for (const [x, z, kind, , base] of L.LANTERNS) if (kind === "pier" && z > 0) flat.push(moved(pier(x, z), 0, base, 0));
    return shaded([crag], flat);
  });
  // The islet's dock, in the land's frame: oak planks across two stringers on posts driven into the sea bed, mooring
  // posts by the ferry's berth.
  const dock = cached(() => {
    const D = DOCK, rand = mulberry32(7711), OAK = ["#5a4028", "#4f3823", "#65492e", "#463220"], OAK_D = "#34261a", parts = [], bed = L.SEA - 3;
    for (let z = D.z0; z < D.z1 - 0.05; z += 0.31) parts.push(box({ w: 2 * D.halfW + (rand() - 0.5) * 0.12, h: 0.08, d: 0.28, color: OAK[Math.floor(rand() * OAK.length)], offset: { x: (rand() - 0.5) * 0.06, y: D.y - 0.04, z: z + 0.155 } }));
    for (const s of [-1, 1]) parts.push(box({ w: 0.16, h: 0.24, d: D.z1 - D.z0, color: OAK_D, offset: { x: s * (D.halfW - 0.2), y: D.y - 0.2, z: (D.z0 + D.z1) / 2 } }));
    for (let z = D.z0 + 0.15; z <= D.z1 + 0.01; z += 2.4) for (const s of [-1, 1]) parts.push(box({ w: 0.24, h: D.y + 0.35 - bed, d: 0.24, color: OAK_D, offset: { x: s * (D.halfW + 0.06), y: (D.y + 0.35 + bed) / 2, z } }));
    for (const z of [L.FERRY.islet.z - 1.7, L.FERRY.islet.z + 1.7]) {
      parts.push(moved(lathe({ profile: [[0, 0], [0.15, 0], [0.14, 0.62], [0.18, 0.66], [0, 0.72]], segments: 10, color: OAK_D }), D.halfW - 0.18, D.y, z));
      parts.push(moved(torus(0.17, 0.035, "#8a7350", 0, 10, 6), D.halfW - 0.18, D.y + 0.3, z));
    }
    return merge(...parts);
  });
  // The moat's abutment, in the land's frame: a pier of the same blocks reaching out from the bank to where the
  // drawbridge comes down.
  const abutment = cached(() => {
    const { z0, z1, halfW } = ABUTMENT, rand = mulberry32(5210), crag = geometry(), flat = [], C = 0.5, low = MOAT.bed - 0.25, cols = Math.round((z1 + 1 - z0) / C), rows = Math.round((1 - low) / C);
    for (const s of [-1, 1]) {
      blockFace(crag, rand, [s * halfW, low, z0], [0, 0, 1], UP, [s, 0, 0], cols, rows, C, C, SMALL_BLOCKS, SMALL);
      blockFace(crag, rand, [s * (halfW - 0.5), 0, z0 + 0.5], [0, 0, 1], UP, [-s, 0, 0], cols - 1, 2, C, C, SMALL_BLOCKS, SMALL);
      flat.push(bevelBox({ w: 0.68, h: 0.13, d: z1 + 1 - z0, color: ARENA[1], bevel: 0.04, offset: { x: s * (halfW - 0.25), y: 1.05, z: (z0 + z1 + 1) / 2 } }));
    }
    blockFace(crag, rand, [-halfW, low, z0], [1, 0, 0], UP, [0, 0, -1], Math.round(2 * halfW / C), Math.round(-low / C), C, C, SMALL_BLOCKS, SMALL);
    flat.push(box({ w: 2 * halfW - 0.2, h: -low, d: z1 + 1 - z0 - 0.1, color: "#2a2623", offset: { x: 0, y: low / 2 - 0.02, z: (z0 + z1 + 1) / 2 + 0.05 } }));
    for (const [x, z, kind] of L.LANTERNS) if (kind === "pier" && z < 0) flat.push(pier(x > 0 ? halfW - 0.25 : -(halfW - 0.25), z));
    flat.push(paved((x, z) => Math.abs(x) < halfW - 0.62 && z > z0 + 0.1 && z < z1 + 1, -halfW, halfW, z0, z1 + 1, 0.95, 5221));
    return shaded([crag], flat);
  });
  // The ruin round the way home, in the land's frame: a broken wall of the same blocks behind the arch, and the
  // clearing's flags before it.
  const ruin = cached(() => {
    const rand = mulberry32(5303), crag = geometry(), C = 0.5, cols = 26, z = ARCH.z + 0.95, x0 = -cols * C / 2;
    const tops = Array.from({ length: cols }, (_, i) => Math.round(4 + 6.5 * Math.pow(Math.sin((i + 0.5) / cols * Math.PI), 0.7) + (L.hash2(i, 91) - 0.5) * 3));
    blockFace(crag, rand, [x0, 0, z], [1, 0, 0], UP, [0, 0, -1], cols, 13, C, C, SMALL_BLOCKS, SMALL, (i, j) => j < tops[i], RUIN);
    for (const s of [-1, 1]) blockFace(crag, rand, [s * (x0 + 0.02), 0, z - 0.02], [0, 0, 1], UP, [-s, 0, 0], 3, 4, C, C, SMALL_BLOCKS, SMALL, null, RUIN);
    // Its back, seen now that a jetpack flies round it.
    blockFace(crag, rand, [-x0, 0, z + 1.1], [-1, 0, 0], UP, [0, 0, 1], cols, 13, C, C, SMALL_BLOCKS, SMALL, (i, j) => j < tops[cols - 1 - i] - 1, RUIN);
    const flags = paved((x, zz) => Math.hypot(x - ARRIVE.x, zz - ARRIVE.z) < 3.6 || Math.abs(x) < 2.2 && zz > ARRIVE.z && zz < ARCH.z + 0.4,
      -4, 4, ARRIVE.z - 4, ARCH.z + 1, 1.05, 5311);
    return shaded([crag], [flags]);
  });
  // The court's flags and the passage's, in the land's frame.
  const flags = cached(() => {
    const court = paved((x, z) => Math.hypot(x - COURT.x, z - COURT.z) < COURT.r - 0.3 && !STATUES.some((s) => Math.hypot(x - s.x, z - s.z) < 1.1), -COURT.r, COURT.r, COURT.z - COURT.r, COURT.z + COURT.r, 1.1, 5401);
    const sill = paved((x, z) => Math.abs(x) < GATE.passage - 0.15 && z < LEAF.hinge - 0.1 && z > GATE.back - 0.4, -GATE.passage, GATE.passage, GATE.back - 0.4, LEAF.hinge, 0.9, 5413);
    return merge(court, sill);
  });

  // ---------- the terrain and its forest ----------
  // Grass, dirt, the path's earth, rock, the moat's mud, the sea, and the beach's dry and wet sand.
  const GRASS = 1, DIRT = 4, EARTH = 5, ROCK = 6, MUD = 9, SEA = 10, SAND = 11, WET = 12, SLATE = 13, ASH = 16, CINDER = 17, ASH_WET = 18, LAVA = 19, SNOW = 20, PACKED = 23, ICEROCK = 24, WETROCK = 27;
  const SEA_HEX = "#0f2636";
  const GROUND = [null, "#2c4429", "#33502f", "#263b24", "#40332a", "#4a3e33", "#4b4540", "#544d47", "#403a36", "#27251f", SEA_HEX, "#4f493f", "#3b362f",
    // 13-15 the islet's volcanic slate, 16 its black sand, 17 the path's cinders, 18 the sand wet.
    "#2a2c31", "#33353b", "#212226", "#1b1b1e", "#3a3230", "#141416",
    // 19 the volcano's lava.
    "#ff5a14",
    // 20-22 Cold Storj's snow, 23 its paths' packed snow, 24-26 its icy grey rock, 27 its dark wet rock at the water.
    "#dfe7ef", "#cfd9e4", "#eaf0f6", "#a7b3c1", "#5c6672", "#4d5661", "#69737f", "#2b3038"].map((c) => c && hexToRgb(c));
  // Lava's faces flow and glow as the renderer's lava does (a flat glowing colour on Canvas 2D).
  const lavaFaces = (geo, color) => { for (const f of geo.faces) if (f.color === color) { f.water = "lava"; f.emissive = 0.6; } };
  const TERRAIN_UNIT = 0.5;
  // One of the three grids `L.TERRAIN` names: the castle's island and the sea round it, the arrival islet's, or the
  // volcano island's up to the terrain's cap (`volcanoCone` stands over it from there).
  const terrain = variants((which) => cachedSteps(snap("terrain:" + which, function* (slice = null) {
    const R = TERRAIN[which], u = TERRAIN_UNIT, sx = Math.round((R.x1 - R.x0) / u), sz = Math.round((R.z1 - R.z0) / u), sy = Math.round((BOUNDS.high - BOUNDS.low) / u), g = T.makeGrid(sx, sy, sz), tops = new Int16Array(sx * sz), d = g.data;
    for (let x = 0; x < sx; x++) {
      if ((x & 3) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) tops[x * sz + z] = Math.round((L.terrainTop(R.x0 + (x + 0.5) * u, R.z0 + (z + 0.5) * u) - BOUNDS.low) / u);
    }
    for (let x = 0; x < sx; x++) {
      if ((x & 7) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) {
        const t = tops[x * sz + z], wx = R.x0 + (x + 0.5) * u, wz = R.z0 + (z + 0.5) * u;
        let steep = 0;
        if (x > 0) steep = Math.max(steep, Math.abs(t - tops[(x - 1) * sz + z]));
        if (x < sx - 1) steep = Math.max(steep, Math.abs(t - tops[(x + 1) * sz + z]));
        if (z > 0) steep = Math.max(steep, Math.abs(t - tops[x * sz + z - 1]));
        if (z < sz - 1) steep = Math.max(steep, Math.abs(t - tops[x * sz + z + 1]));
        const y = BOUNDS.low + t * u;
        let top;
        // Cold Storj is snow over the islet's black slate: slate on its cliffs and steep faces and under its paved
        // ways, black sand wet at the water.
        if (which === 3) {
          if (L.seaAt(wx, wz)) top = SEA;
          else if (L.storjPath(wx, wz) !== null) top = SLATE + 2;
          else if (y < L.SEA + 1.6 && L.onTerrace(wx, wz) < 0.5) top = y < L.SEA + 0.8 ? ASH_WET : ASH;
          else if (steep >= 3) top = SLATE + Math.floor(L.hash2(x >> 1, z >> 1) * 3);
          else top = SNOW + Math.min(2, Math.floor(L.noise(wx * 0.19 + 3, wz * 0.19 + 9) * 3));
          const base = x * sy * sz + z;
          for (let j = 0; j < t; j++) d[base + j * sz] = j === t - 1 || top === SEA ? top : j < t - 2 || top < SNOW ? SLATE + ((j >> 1) + (x >> 2)) % 3 : SNOW + 1;
          continue;
        }
        // Outpost Island is the castle island's own grass and rock, down to its beach of black sand.
        if (which === 6) {
          if (L.seaAt(wx, wz)) top = SEA;
          else if (steep >= 3) top = ROCK + Math.floor(L.hash2(x >> 1, z >> 1) * 3);
          else if (y < L.SEA + 1.6) top = y < L.SEA + 0.8 ? ASH_WET : ASH;
          else top = GRASS + Math.min(2, Math.floor(L.noise(wx * 0.21 + 3, wz * 0.21 + 9) * 3));
          const base = x * sy * sz + z;
          for (let j = 0; j < t; j++) d[base + j * sz] = j === t - 1 || top === SEA ? top : j >= t - 3 && top < ROCK ? SLATE + ((j >> 1) + (x >> 2)) % 3 : ROCK + ((j >> 1) + (x >> 3) + (z >> 3)) % 3;
          continue;
        }
        // The islet is volcanic slate, layered dark grey to its beach of black sand, its path of cinders.
        if (which >= 1) {
          // The volcano's island is the same slate, lava in its streams' channels, ash inside its wall, cinders on
          // its court, in the cave's mouth and down the path to its dock.
          // Shards is the islet's own slate, its way and its trench down to the cave in cinders.
          const cinder = which === 5 ? L.onShardsWay(wx, wz) > 0.55 || L.shardsTrench(wx, wz) !== null : which === 4 ? L.arenaDist(wx, wz) > L.ARENA_ISLE.r - L.ARENA_ISLE.floor : which === 1 ? L.onIsletPath(wx, wz) > 0.55 : L.onVolcanoCourt(wx, wz) > 0.6 || L.inVolcanoMouth(wx, wz) || (Math.abs(wz - L.VOLCANO.z) < 2.3 && wx > L.VOLCANO.dock.quay.x1 - 0.5 && wx < L.VOLCANO.court.x0 + 1);
          top = L.seaAt(wx, wz) ? SEA : which === 2 && L.lavaStream(wx, wz) > 0 ? LAVA : cinder ? CINDER : y < L.SEA + 1.6 ? (y < L.SEA + 0.8 ? ASH_WET : ASH) : which === 2 && L.cbdcAt(wx, wz, 60) && L.wallPlace(wx, wz).v < 0 ? ASH : SLATE + Math.floor(L.hash2(x >> 1, z >> 1) * 3);
          const base = x * sy * sz + z;
          for (let j = 0; j < t; j++) d[base + j * sz] = j === t - 1 || top === SEA ? top : SLATE + ((j >> 1) + (x >> 2)) % 3;
          continue;
        }
        if (L.seaAt(wx, wz)) top = SEA;
        else if (L.moatDist(wx, wz) < 0) top = y < MOAT.water + 0.4 ? MUD : steep > 1 ? ROCK + 1 : GRASS + 2;
        else if (steep >= 3 || (steep >= 2 && y < -1)) top = ROCK + Math.floor(L.hash2(x >> 1, z >> 1) * 3);
        else if (L.onIsletPath(wx, wz) > 0.55 || Math.hypot(wx - COURT.x, wz - COURT.z) < COURT.r + 0.5) top = CINDER;
        else if (y < L.SEA + 1.6) top = y < L.SEA + 0.8 ? ASH_WET : ASH;
        else top = GRASS + Math.min(2, Math.floor(L.noise(wx * 0.21 + 3, wz * 0.21 + 9) * 3));
        const base = x * sy * sz + z;
        for (let j = 0; j < t; j++) d[base + j * sz] = j === t - 1 || top === SEA ? top : j >= t - 3 && top < ROCK ? SLATE + ((j >> 1) + (x >> 2)) % 3 : ROCK + ((j >> 1) + (x >> 3) + (z >> 3)) % 3;
      }
    }
    const geo = yield* T.gridGeometrySteps(g, { unit: u, palette: GROUND, origin: { x: R.x0, y: BOUNDS.low, z: R.z0 } }, slice);
    // The sea's surface ripples as the moat's does.
    for (const f of geo.faces) if (f.color === GROUND[SEA]) f.water = true;
    lavaFaces(geo, GROUND[LAVA]);
    return geo;
  })));
  // The volcano's cone over the terrain's cap (keep-layout.js `VOLCANO.cone`), in the land's frame: blocks a metre
  // across in dark basalt banded with rust, ash toward its jagged rim, the crater's lake and the streams down its
  // flanks in lava, and over the cave mouth's cut an arch of the same blocks, down to its springing.
  const CONE = [null, "#1b1a1d", "#232125", "#151417", "#3a221c", "#4a281e", "#cfcac0", "#ff5a14"].map((c) => c && hexToRgb(c));
  const volcanoCone = cachedSteps(snap("volcanoCone", function* (slice = null) {
    const C = L.VOLCANO.cone, G = C.grid, u = C.unit, sx = Math.round((G.x1 - G.x0) / u), sy = Math.round((G.y1 - G.y0) / u), sz = Math.round((G.z1 - G.z0) / u), g = T.makeGrid(sx, sy, sz), d = g.data;
    const from = Math.round((BOUNDS.high - 1 - G.y0) / u);
    for (let x = 0; x < sx; x++) {
      if ((x & 3) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) {
        const wx = G.x0 + (x + 0.5) * u, wz = G.z0 + (z + 0.5) * u, whole = L.volcanoHeight(wx, wz, true);
        if (whole < C.base) continue;
        const top = Math.min(sy, Math.round((Math.round(whole) - G.y0) / u)), arch = L.mouthArch(wx, wz), lava = L.lavaStream(wx, wz) !== 0;
        const base = x * sy * sz + z;
        for (let j = arch === Infinity ? from : Math.max(0, Math.ceil((arch - G.y0) / u)); j < top; j++) {
          const y = G.y0 + j * u;
          d[base + j * sz] = j === top - 1 ? (lava ? 7 : y > C.top - 9 ? 6 : 1 + Math.floor(L.hash2(x >> 1, z >> 1) * 3)) : (y + (x >> 3) + (z >> 3)) % 11 < 2 ? 4 + ((x + z) >> 2 & 1) : 1 + ((j >> 1) + (x >> 2)) % 3;
        }
      }
    }
    const geo = yield* T.gridGeometrySteps(g, { unit: u, palette: CONE, origin: { x: G.x0, y: G.y0, z: G.z0 } }, slice);
    lavaFaces(geo, CONE[7]);
    geo.fogPierce = 0.35;
    return geo;
  }));

  // ---------- Cold Storj ----------
  // A mountain of Cold Storj over the terrain's cap (keep-layout.js `STORJ.mountains`), in the land's frame: blocks a
  // metre across in icy grey rock, snow on every top but the steepest and white over its peaks, its path's ribbon cut
  // down under the path's own ledge (`storjPaths`).
  const MOUNT = [null, "#2a2c31", "#33353b", "#212226", "#dfe7ef", "#cfd9e4", "#f2f6fa", "#212226"].map((c) => c && hexToRgb(c));
  const storjMountain = variants((i) => cachedSteps(snap("storjMountain:" + i, function* (slice = null) {
    const m = L.STORJ.mountains[i], G = m.grid, u = L.STORJ.unit, sx = Math.round((G.x1 - G.x0) / u), sy = Math.round((G.y1 - G.y0) / u), sz = Math.round((G.z1 - G.z0) / u), g = T.makeGrid(sx, sy, sz), d = g.data;
    const from = Math.round((BOUNDS.high - 1 - G.y0) / u), tops = new Float32Array(sx * sz);
    for (let x = 0; x < sx; x++) {
      if ((x & 7) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) tops[x * sz + z] = L.storjHeight(G.x0 + (x + 0.5) * u, G.z0 + (z + 0.5) * u);
    }
    for (let x = 0; x < sx; x++) {
      if ((x & 3) === 0) yield* pause(slice);
      for (let z = 0; z < sz; z++) {
        const whole = tops[x * sz + z];
        if (whole < BOUNDS.high) continue;
        const top = Math.min(sy, Math.round((Math.round(whole) - G.y0) / u)), wx = G.x0 + (x + 0.5) * u, wz = G.z0 + (z + 0.5) * u;
        let steep = 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, nz = z + oz; if (nx >= 0 && nx < sx && nz >= 0 && nz < sz) steep = Math.max(steep, Math.abs(whole - tops[nx * sz + nz])); }
        const path = L.storjPath(wx, wz) !== null, cap = whole > m.top - 14 ? 6 : 4 + (L.hash2(x >> 1, z >> 1) < 0.4 ? 1 : 0);
        const base = x * sy * sz + z;
        for (let j = from; j < top; j++) {
          const y = G.y0 + j * u;
          d[base + j * sz] = j === top - 1 ? (path ? 7 : steep > 2.6 ? 1 + Math.floor(L.hash2(x, z) * 3) : cap) : (y + (x >> 2) + (z >> 3)) % 9 < 1 && steep < 3 ? 5 : 1 + ((j >> 1) + (x >> 2)) % 3;
        }
      }
    }
    return yield* T.gridGeometrySteps(g, { unit: u, palette: MOUNT, origin: { x: G.x0, y: G.y0, z: G.z0 } }, slice);
  })));
  // Cold Storj's paved ways, in the land's frame: the mountain paths' ledges and the ways up to them from the docks,
  // each flagged as the land's stone ways are in winter's blue-greys: a bed of dark slate a stride
  // along at a time following the way's line, its top just under the walked height, and on it three flagstones
  // across, their joints wandering, a low kerb of slate along a mountain path's downhill edge.
  const WAY_STONE = ["#7f8a97", "#6d7885", "#8c97a3", "#616c79", "#77828f"];
  // A stride of paved way from (ax, ay, az) to (bx, by, bz), `half` either side of its line, into `parts`: its bed of
  // dark slate, three flagstones across it and, with `kerbX`, a kerb that far to one side.
  const wayLayer = (parts, rand) => (ax, ay, az, bx, by, bz, half, kerbX, kerbZ) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ay + by) / 2, len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az), cs = Math.cos(yaw), sn = Math.sin(yaw);
    parts.push(moved(models.turnedY(box({ w: half * 2 + 0.3, h: 0.9, d: len + 0.3, color: "#212226", offset: { y: -0.5 } }), yaw), mx, my, mz));
    const cut = [-half, -half / 3 + (rand() - 0.5) * 0.7, half / 3 + (rand() - 0.5) * 0.7, half];
    for (let k = 0; k < 3; k++) {
      const w = cut[k + 1] - cut[k] - 0.08, c = (cut[k] + cut[k + 1]) / 2;
      parts.push(moved(models.turnedY(bevelBox({ w, h: 0.12, d: len - 0.07, color: WAY_STONE[Math.floor(rand() * WAY_STONE.length)], bevel: 0.035, offset: { x: c, y: -0.06 + rand() * 0.015 } }), yaw), mx, my, mz));
    }
    if (kerbX !== undefined) parts.push(moved(models.turnedY(box({ w: 0.4, h: 0.32, d: len + 0.2, color: "#2a2c31", offset: { y: 0.1 } }), yaw), mx + kerbX, my, mz + kerbZ));
  };
  const storjWays = cached(() => {
    const parts = [], S = L.STORJ, P = S.path, rand = mulberry32(5519), at = {}, next = {}, lay = wayLayer(parts, rand);
    for (const m of S.mountains) {
      const length = P.turns * TAU * (L.pathPoint(m, 0).d + L.pathPoint(m, 1).d) / 2, n = Math.ceil(length / 1.25);
      for (let k = 0; k < n; k++) {
        L.pathPoint(m, k / n, at); L.pathPoint(m, (k + 1) / n, next);
        lay(at.x, at.y, at.z, next.x, next.y, next.z, P.w, (at.x - m.x) / at.d * (P.w + 0.1), (at.z - m.z) / at.d * (P.w + 0.1));
      }
    }
    const line = (ax, az, bx, bz, y, half) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.25); for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n; lay(ax + (bx - ax) * t0, y(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, y(t1), az + (bz - az) * t1, half); } };
    for (const p of S.spurs) line(p.ax, p.az, p.bx, p.bz, (t) => p.ay + (p.by - p.ay) * t, p.half);
    return merge(...parts);
  });
  // Shards' paved way (keep-layout.js `SHARDS`), in the land's frame, as Cold Storj's ways are flagged: from its quay up
  // to the plateau and east to the trench, and down the trench's treads to the court before the cave's mouth, each
  // stretch of it as level as the terrain's blocks under it; and the court and the notch flagged over.
  const shardsWays = cached(() => {
    const parts = [], S = L.SHARDS, T = S.trench, rand = mulberry32(8653), lay = wayLayer(parts, rand), u = TERRAIN_UNIT;
    const run = (x0, x1, half) => {
      let from = x0, y = L.terrainTop(x0 + u / 2, S.z);
      for (let x = x0 + u; x <= x1; x += u) {
        const next = x < x1 ? L.terrainTop(x + u / 2, S.z) : NaN;
        if (next === y) continue;
        for (let a = from; a < x - 0.01; a += 1.25) lay(a, y, S.z, Math.min(x, a + 1.25), y, S.z, half);
        from = x; y = next;
      }
    };
    run(S.way.x0 + 0.5, T.x0, S.way.half);
    run(T.x0, T.court.x0, T.half);
    const C = T.court, N = T.notch, flat = (x, z) => (x > C.x0 && x < C.x1 && Math.abs(z - S.z) < C.half - 0.1) || (x >= C.x1 && x < N.x1 && Math.abs(z - S.z) < N.half - 0.1);
    parts.push(moved(paved(flat, C.x0, N.x1, S.z - C.half, S.z + C.half, 1.4, 8657), 0, T.floor, 0));
    return merge(...parts);
  });
  // Shards' crystal (keep-layout.js `SHARDS.clusters`), in the land's frame: Merge Rock's own quartz
  // (repo-island-models.js `quartz`) grown up out of the ground, glowing of itself in its colours taken a share of the
  // way to its cores' light, as a lit cluster under Merge Rock does: `clusters`, a lead crystal and its satellites at
  // each of the layout's places, and `carpet`, short crystals scattered over the dry ground clear of the way, each
  // its own glass. WebGL draws them; Canvas 2D, which sorts every face, keeps to the ground's own glow.
  const SHARD_LIGHT = 0.45;
  const shardsCrystals = cached(() => {
    const RM = BL.repoIslandModels, S = L.SHARDS, T = S.trench, light = [RM.CORE[1], RM.CORE[0], RM.CORE[2], RM.CORE[1]];
    const hues = RM.HUES.map((h) => h.map((c, i) => c.map((v, ch) => v + (light[i][ch] - v) * SHARD_LIGHT)));
    const clusters = { verts: [], faces: [], lines: [] }, carpet = { verts: [], faces: [], lines: [] }, root = (x, z) => L.terrainTop(x, z);
    for (const c of S.clusters) {
      const rand = mulberry32(math.fnv1a(`shards/${c.seed}`)), hue = hues[Math.floor(rand() * hues.length)], len = c.tall, r = 0.16 + 0.2 * c.size;
      const dx = (rand() - 0.5) * 0.35, dz = (rand() - 0.5) * 0.35;
      RM.quartz(clusters, c.x, root(c.x, c.z), c.z, dx, 1, dz, r, len, hue, rand, 6, 0.4);
      for (let m = 0, count = 3 + Math.floor(rand() * 4); m < count; m++) {
        const turn = rand() * TAU, off = r * (1 + rand() * 1.2), ox = Math.cos(turn), oz = Math.sin(turn), tilt = 0.3 + rand() * 0.5, px = c.x + ox * off, pz = c.z + oz * off;
        RM.quartz(clusters, px, root(px, pz), pz, dx + ox * tilt, 1, dz + oz * tilt, r * (0.4 + rand() * 0.35), len * (0.3 + rand() * 0.4), hue, rand, 6, 0.4);
      }
    }
    const rand = mulberry32(8663), n = 520, golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < n; k++) {
      const at = (S.r - 2) * Math.sqrt((k + 0.5) / n), a = k * golden, x = S.x + Math.sin(a) * at + (rand() - 0.5) * 1.6, z = S.z + Math.cos(a) * at + (rand() - 0.5) * 1.6;
      const hue = hues[Math.floor(rand() * hues.length)], r = 0.07 + rand() * 0.09, tilt = rand() * TAU, lean = rand() * 0.6;
      if (L.seaAt(x, z) || (x < T.notch.x1 + 2 && Math.abs(z - S.z) < 5) || (x < S.dock.quay.x1 + 2 && Math.abs(z - S.z) < 13)) continue;
      RM.quartz(carpet, x, root(x, z), z, Math.cos(tilt) * lean, 1, Math.sin(tilt) * lean, r, r * (2.5 + rand() * 3), hue, rand, 6, 0.3, false);
    }
    clusters.glass = RM.CRYSTAL.glass; carpet.glass = RM.CRYSTAL.carpetGlass;
    return { clusters: noShadow(clusters), carpet: noShadow(carpet) };
  });
  // A cave's mouth along a path, a part looking out along +z, its foot at the origin: an arch of grey blocks framing the
  // notch cut into the mountain behind it (keep-layout.js `caveNotch`), sealed at the notch's back by a wall of ice
  // glowing faintly blue, dark behind it, a drift of snow at its foot. Sealed until its cave is dug.
  const STORJ_CAVE = { half: 2.1, tall: 4.6 };
  const storjCave = cached(() => {
    const C = STORJ_CAVE, rock = [], rand = mulberry32(6203), shades = ["#2a2c31", "#33353b", "#212226"];
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) rock.push(bevelBox({ w: 0.9, h: 0.72, d: 1.4, color: shades[Math.floor(rand() * 3)], bevel: 0.1, offset: { x: sx * (C.half + 0.45), y: 0.36 + k * 0.7, z: -0.3 } }));
    for (let k = -3; k <= 3; k++) rock.push(bevelBox({ w: 1.02, h: 0.9, d: 1.4, color: shades[Math.floor(rand() * 3)], bevel: 0.1, offset: { x: k * 0.98, y: C.tall + 0.45 + (Math.abs(k) < 2 ? 0.1 : 0), z: -0.3 } }));
    const dark = box({ w: C.half * 2, h: C.tall, d: 0.2, color: "#07090c", offset: { y: C.tall / 2, z: -3.85 } });
    const ice = box({ w: C.half * 2 - 0.1, h: C.tall - 0.1, d: 0.3, color: "#8fc6e8", emissive: 0.32, offset: { y: C.tall / 2, z: -2.9 } });
    // The notch's ceiling, where the mountain's blocks would leave it open to the sky.
    rock.push(box({ w: C.half * 2 + 0.2, h: 0.8, d: 4.2, color: "#212226", offset: { y: C.tall + 0.4, z: -1.9 } }));
    const drift = lathe({ profile: [[0, 0.9], [0.9, 0.82], [1.7, 0.5], [2.4, 0]], segments: 12, color: "#eaf0f6" });
    drift.verts.forEach((v, i, a) => { if (i % 3 === 0) a[i] *= 0.85; else if (i % 3 === 2) a[i] = a[i] * 0.4 - 2.1; });
    // `frame`, the arch and the dark behind it alone, for a mouth that is open (Shards').
    return { rock: merge(...rock, dark, drift), ice, frame: merge(...rock, dark) };
  });
  // Cold Storj's two docks (keep-layout.js `STORJ.docks`), in the land's frame, as the shipyard's: `stone`, each quay along its
  // bay's west shore, its faces in the arena's blocks, flagged, iron bollards down its seaward edge, a skin of snow on
  // its back edge; `timber`, the oak pier out from its middle.
  const storjDock = cachedSteps(function* (slice = null) {
    const S = L.STORJ, rand = mulberry32(8521), crag = geometry(), flat = [], wood = [], low = L.SEA - S.deep - 1.2;
    for (const D of S.docks) {
      const Q = D.quay, y = D.y, f = D.face, rows = 7, ch = (y - low) / rows, nz = Math.round(Q.z1 - Q.z0), nx = Math.round(Q.x1 - Q.x0), cz = (Q.z1 - Q.z0) / nz, cx = (Q.x1 - Q.x0) / nx;
      // Its face to the channel, and its two ends, in the arena's blocks.
      if (f > 0) blockFace(crag, rand, [Q.x0, low, Q.z1], [1, 0, 0], UP, [0, 0, 1], nx, rows, cx, ch, BIG_BLOCKS, BIG);
      else blockFace(crag, rand, [Q.x1, low, Q.z0], [-1, 0, 0], UP, [0, 0, -1], nx, rows, cx, ch, BIG_BLOCKS, BIG);
      yield* pause(slice);
      blockFace(crag, rand, [Q.x1, low, Q.z1], [0, 0, -1], UP, [1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
      blockFace(crag, rand, [Q.x0, low, Q.z0], [0, 0, 1], UP, [-1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
      yield* pause(slice);
      flat.push(box({ w: Q.x1 - Q.x0 - 0.2, h: y - low, d: Q.z1 - Q.z0 - 0.2, color: "#2a2623", offset: { x: (Q.x0 + Q.x1) / 2, y: (y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
      flat.push(moved(paved((x, z) => x > Q.x0 + 0.15 && x < Q.x1 - 0.15 && z > Q.z0 + 0.15 && z < Q.z1 - 0.15, Q.x0, Q.x1, Q.z0, Q.z1, 1.6, 8527), 0, y, 0));
      for (let x = Q.x0 + 2.5; x < Q.x1 - 1; x += 6.4) if (Math.abs(x - S.x) > 2.2) flat.push(moved(lathe({ profile: [[0, 0], [0.2, 0], [0.15, 0.12], [0.14, 0.5], [0.22, 0.58], [0, 0.62]], segments: 10, color: IRON }), x, y, D.bank - f * 0.4));
      timberDeck(wood, rand, D.pier, y, { up: 1.0 });
      // The boardwalk along the waterfront either side of the quay, on stilts.
      for (const d of D.boardwalk) timberDeck(wood, rand, d, y, { pw: 0.5, every: 4, stilts: true, up: 1.0 });
    }
    return { stone: shaded([crag], flat), timber: merge(...wood) };
  });
  // A pine of Cold Storj, a part as the dark pine is: the same tiers, each laden with snow toward its top.
  const SNOW_PINE = [null, "#3a2a1d", "#173229", "#20403a", "#b9c7d2", "#eef3f8"].map((c) => c && hexToRgb(c));
  const snowPine = variants((i) => {
    const plain = pine(i), snow = { ...plain, faces: plain.faces.map((f) => { const k = PINE.indexOf(f.color); return k > 0 ? { ...f, color: SNOW_PINE[k] } : f; }) };
    return snow;
  });
  // Where Cold Storj's pines stand: [x, y, z, kind, turn, size], over its plateau and the mountains' lower slopes, off
  // the paths, the docks' terraces, the ways up from them and the cliffs' edges.
  const storjForest = cached(() => {
    const out = [], rand = mulberry32(4471), STEP = 6.8, R = TERRAIN[3];
    for (let x = R.x0 + 3; x < R.x1 - 2; x += STEP) for (let z = R.z0 + 3; z < R.z1 - 2; z += STEP) {
      const px = x + (rand() - 0.5) * 5, pz = z + (rand() - 0.5) * 5, pick = rand(), turnBy = rand() * TAU, size = 0.8 + rand() * 0.6, kind = Math.floor(rand() * 4);
      if (pick > 0.55 || !L.storjLand(px, pz) || Math.min(L.storjCoast(px, pz), L.storjInlet(px, pz)) < 6 || L.onSpur(px, pz).k > 0.05 || L.onTerrace(px, pz) > 0.02) continue;
      if (L.STORJ.turrets.some((q) => Math.hypot(px - q.x, pz - q.z) < 6) || L.STORJ.statues.some((q) => Math.hypot(px - q.x, pz - q.z) < 12) || L.STORJ.ogres.some((q) => Math.hypot(px - q.x, pz - q.z) < 5)) continue;
      if (L.STORJ.mountains.some((m) => L.pathAt(m, px, pz, L.STORJ.path.w + 3, L.STORJ.path.end))) continue;
      const h = L.storjHeight(px, pz);
      if (h > 24 || h < L.SEA + 3) continue;
      out.push([px, h > BOUNDS.high ? Math.round(h) - 0.2 : L.terrainTop(px, pz) - 0.2, pz, kind, turnBy, size]);
    }
    return out;
  });
  // A great stone knight of the fjord's mouth (keep-layout.js `STORJ.statues`), a part at the knight's own size (the
  // scene stands it at its `scale`): the court knight's body carved in grey stone, the tops of its plates frosted with
  // snow, and its visor's slit lit icy blue (`eyes`).
  const stoneKnight = cached(() => {
    const src = knight().body, v = src.verts, greys = ["#6d7782", "#5e6873", "#7c8690", "#525b65"].map(hexToRgb), frost = hexToRgb("#e8eef4"), tone = new Map();
    const faces = src.faces.map((f) => {
      const [a, b, c] = f.i, ux = v[b * 3] - v[a * 3], uy = v[b * 3 + 1] - v[a * 3 + 1], uz = v[b * 3 + 2] - v[a * 3 + 2], wx = v[c * 3] - v[a * 3], wy = v[c * 3 + 1] - v[a * 3 + 1], wz = v[c * 3 + 2] - v[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, up = ny / (Math.hypot(nx, ny, nz) || 1);
      if (up > 0.6) return { ...f, color: frost, emissive: 0 };
      if (!tone.has(f.color)) tone.set(f.color, greys[tone.size % greys.length]);
      return { ...f, color: tone.get(f.color), emissive: 0 };
    });
    const u = KNIGHT_UNIT, eyes = noShadow(merge(...[-1, 1].map((sx) => box({ w: 5.6 * u, h: 1.8 * u, d: 0.03, color: "#8fd8ff", emissive: 1, offset: { x: sx * 3.9 * u, y: 67 * u, z: 9.15 * u } }))));
    return { body: { ...src, faces }, eyes };
  });
  // The rock plinth a stone knight stands on, a part about its middle, its top at y 0.
  const storjPlinth = cached(() => {
    const rand = mulberry32(331), parts = [], shades = ["#2a2c31", "#33353b", "#212226"];
    for (let k = 0; k < 4; k++) parts.push(bevelBox({ w: 15 - k * 0.6, h: 1.6, d: 12 - k * 0.5, color: shades[Math.floor(rand() * 3)], bevel: 0.25, offset: { y: -0.8 - (3 - k) * 1.6 } }));
    parts.push(box({ w: 14.6, h: 0.18, d: 11.4, color: "#e8eef4", offset: { y: 0.09 } }));
    return merge(...parts);
  });
  // A dark pine, a part: its foot at the origin. Its needles are laid in bands, so each tier meshes into few faces, and
  // it carries no grid, so the renderer shades it plainly instead of as masonry.
  const PINE_UNIT = 0.42;
  const PINE = [null, "#3a2a1d", "#16302a", "#1c3a31", "#22443a", "#2a5045"].map((c) => c && hexToRgb(c));
  const pine = variants((i) => {
    const u = PINE_UNIT, H = 19 + i * 3, R = 5 + (i % 3), c = R + 1, g = T.makeGrid(2 * c, H + 4, 2 * c), tiers = 4 + (i & 1), base = Math.round(H * 0.2), span = (H - base) / tiers;
    for (let y = 0; y < H - 2; y++) for (let x = c - 1; x <= c; x++) for (let z = c - 1; z <= c; z++) g.set(x, y, z, 1);
    for (let t = 0; t < tiers; t++) {
      const y0 = Math.round(base + t * span * 0.9), h = Math.round(span * 1.45), r0 = R * (1 - t / (tiers + 0.7));
      for (let y = 0; y < h && y0 + y < H + 4; y++) {
        const r = r0 * (1 - y / h) + 0.7;
        for (let x = 0; x < 2 * c; x++) for (let z = 0; z < 2 * c; z++) if (Math.hypot(x + 0.5 - c, z + 0.5 - c) <= r) g.set(x, y0 + y, z, 2 + Math.min(3, Math.floor(y * 4 / h)));
      }
    }
    const geo = T.gridGeometry(g, { unit: u, palette: PINE, origin: { x: -c * u, y: 0, z: -c * u } });
    delete geo.voxel;
    return geo;
  });
  // The same pine for the far forest, which throws no shadow anyone would see.
  const farPine = variants((i) => ({ ...pine(i), castShadow: false }));
  // Where the forest's pines stand: [x, y, z, kind, turn, size], off the land a traveller crosses and out of the ravine.
  const forest = cached(() => {
    const out = [], rand = mulberry32(7723), STEP = 6.4;
    const R = TERRAIN[0];
    for (let x = R.x0 + 3; x < R.x1 - 2; x += STEP) for (let z = R.z0 + 3; z < R.z1 - 2; z += STEP) {
      const px = x + (rand() - 0.5) * 4.6, pz = z + (rand() - 0.5) * 4.6, pick = rand(), turnBy = rand() * TAU, size = 0.85 + rand() * 0.55, kind = Math.floor(rand() * 4);
      if (pick > 0.72 || L.playDist(px, pz) < 3.4 + pick * 4 || L.coastDist(px, pz) < 10 + pick * 6 || L.westAt(px, pz, 5) || L.backAt(px, pz, 5)) continue;
      out.push([px, L.terrainTop(px, pz) - 0.2, pz, kind, turnBy, size]);
    }
    return out;
  });
  // The moat's water, and the sea out past the terrain all round (the terrain's own blocks carry it over the shallows
  // and up the ravine): level sheets of the renderer's rippling water, the sea's reaching far into the haze.
  const water = cached(() => {
    const sheet = (x0, x1, z0, z1, y, color) => {
      const g = geometry();
      face(g, [pushVert(g, x0, y, z0), pushVert(g, x0, y, z1), pushVert(g, x1, y, z1), pushVert(g, x1, y, z0)], hexToRgb(color));
      g.faces[0].water = true;
      return g;
    };
    const m = MOAT.half + 1, mz = MOAT.halfZ + 1;
    const FAR = 2600, A = TERRAIN[0], B = TERRAIN[1], C = TERRAIN[2], D = TERRAIN[3], E = TERRAIN[5], F = TERRAIN[6], Y = L.SEA;
    return noShadow(merge(sheet(-m, m, CZ - mz, CZ + mz, MOAT.water, SEA_HEX), sheet(-FAR, D.x0, -FAR, FAR, Y, SEA_HEX), sheet(D.x1, A.x0, -FAR, FAR, Y, SEA_HEX),
      sheet(D.x0, D.x1, -FAR, D.z0, Y, SEA_HEX), sheet(D.x0, F.x0, D.z1, FAR, Y, SEA_HEX), sheet(F.x0, D.x1, D.z1, F.z0, Y, SEA_HEX), sheet(F.x0, D.x1, F.z1, FAR, Y, SEA_HEX), sheet(A.x1, E.x0, -FAR, FAR, Y, SEA_HEX), sheet(E.x1, C.x0, -FAR, FAR, Y, SEA_HEX),
      sheet(E.x0, E.x1, -FAR, E.z0, Y, SEA_HEX), sheet(E.x0, E.x1, E.z1, FAR, Y, SEA_HEX),
      sheet(C.x1, FAR, -FAR, FAR, Y, SEA_HEX), sheet(C.x0, C.x1, -FAR, C.z0, Y, SEA_HEX), sheet(C.x0, C.x1, C.z1, FAR, Y, SEA_HEX),
      sheet(A.x0, A.x1, -FAR, A.z0, Y, SEA_HEX), sheet(A.x0, A.x1, A.z1, B.z0, Y, SEA_HEX), sheet(A.x0, B.x0, B.z0, B.z1, Y, SEA_HEX), sheet(B.x1, A.x1, B.z0, B.z1, Y, SEA_HEX),
      sheet(A.x0, A.x1, B.z1, FAR, Y, SEA_HEX)));
  });

  // ---------- lanterns ----------
  // A lantern on an iron post, a part: its foot at the origin, its arm reaching along +z. `light` is where it burns.
  const lanternPost = cached(() => {
    const frame = [], glass = [], TOP = 3.05, OUT = 0.68, s = 0.72;
    frame.push(bevelBox({ w: 0.44, h: 0.3, d: 0.44, color: ARENA[1], bevel: 0.05, offset: { y: 0.15 } }), box({ w: 0.12, h: TOP - 0.25, d: 0.12, color: IRON, offset: { y: 0.3 + (TOP - 0.25) / 2 } }));
    frame.push(box({ w: 0.2, h: 0.1, d: 0.2, color: IRON, offset: { y: 1.15 } }), box({ w: 0.08, h: 0.08, d: OUT + 0.18, color: IRON, offset: { y: TOP - 0.06, z: OUT / 2 } }));
    frame.push(beam(0, TOP - 0.62, 0.06, 0, TOP - 0.1, 0.5, 0.05, IRON), box({ w: 0.16, h: 0.16, d: 0.16, color: IRON, offset: { y: TOP + 0.13 } }));
    lanternParts(s, 0, TOP - 0.1 - 0.84 * s, OUT, frame, glass);
    return { frame: merge(...frame), glass: noShadow(merge(...glass)), light: { y: TOP - 0.1 - 0.54 * s, z: OUT } };
  });
  // A torch standing in the ground, a part, its foot at the origin: a stone foot, an oak shaft bound in iron and an
  // iron cresset of embers at its head. `TORCH_FLAME` is how high its fire (the scene's blaze) stands.
  const TORCH_FLAME = 1.72;
  const groundTorch = cached(() => merge(
    bevelBox({ w: 0.42, h: 0.22, d: 0.42, color: ARENA[2], bevel: 0.05, offset: { y: 0.11 } }),
    box({ w: 0.13, h: 1.42, d: 0.13, color: "#3a2618", offset: { y: 0.22 + 0.71 } }),
    ...[0.5, 1.05].map((y) => box({ w: 0.16, h: 0.05, d: 0.16, color: IRON, offset: { y } })),
    lathe({ profile: [[0.06, 1.56], [0.24, 1.66], [0.27, 1.76], [0.23, 1.76], [0.2, 1.68], [0, 1.68]], segments: 10, color: IRON }),
    box({ w: 0.3, h: 0.04, d: 0.3, color: "#ff7a1a", emissive: 1, offset: { y: 1.7 } })
  ));
  // A column round the arena, a part, its foot at the origin: a stepped plinth, a banded shaft and a capital in the
  // ghost arena's stone, an iron fire bowl on top heaped with embers. `COLUMN_FIRE` is how high its bonfire (the
  // scene's blaze) stands.
  const COLUMN_FIRE = 5.9;
  const arenaColumn = cached(() => merge(
    bevelBox({ w: 2, h: 0.4, d: 2, color: ARENA[2], bevel: 0.08, offset: { y: 0.2 } }),
    bevelBox({ w: 1.7, h: 0.35, d: 1.7, color: ARENA[0], bevel: 0.07, offset: { y: 0.575 } }),
    lathe({ profile: [[0.68, 0.75], [0.62, 0.95], [0.58, 4.6], [0.64, 4.85], [0, 4.85]], segments: 12, color: ARENA[1] }),
    ...[1.6, 3.2].map((y) => lathe({ profile: [[0.63, y - 0.06], [0.66, y], [0.63, y + 0.06], [0, y + 0.06]], segments: 12, color: ARENA[2] })),
    bevelBox({ w: 1.6, h: 0.4, d: 1.6, color: ARENA[0], bevel: 0.08, offset: { y: 5.05 } }),
    lathe({ profile: [[0.25, 5.25], [0.75, 5.45], [0.95, 5.85], [0.85, 5.85], [0.7, 5.55], [0, 5.55]], segments: 14, color: IRON }),
    lathe({ profile: [[0, 5.56], [0.78, 5.62], [0.5, 5.78], [0, 5.82]], segments: 12, color: "#ff6a14", emissive: 1 })
  ));
  // A lantern standing on a pier, and one hanging from a hook: parts, the first with its foot at the origin, the
  // second with its ring there.
  const standLantern = cached(() => {
    const frame = [], glass = [];
    lanternParts(0.85, 0, 0, 0, frame, glass);
    return { frame: merge(...frame), glass: noShadow(merge(...glass)), light: { y: 0.26, z: 0 } };
  });
  // A floating candle marking the rowboat's channel, a part, the waterline at the origin: a round of dark wood a hand
  // across with a stub of pale candle on it, its wick at `CANDLE.wick`, where the scene stands its flame.
  const CANDLE = { wick: 0.3 };
  const waterCandle = cached(() => merge(lathe({ profile: [[0, -0.04], [0.15, -0.04], [0.17, 0.03], [0.14, 0.06], [0, 0.06]], segments: 10, color: "#3a2a1c" }),
    lathe({ profile: [[0, 0.06], [0.045, 0.06], [0.045, 0.27], [0.03, 0.29], [0, 0.29]], segments: 8, color: "#efe6d2", emissive: 0.15 }), box({ w: 0.012, h: 0.03, d: 0.012, color: "#1a1410", offset: { y: 0.3 } })));
  // A short iron chain a lantern hangs from, a part about its middle, 0.55 m long: its links turned alternately.
  const hangChain = cached(() => merge(...Array.from({ length: 5 }, (_, k) => box({ w: k & 1 ? 0.018 : 0.05, h: 0.12, d: k & 1 ? 0.05 : 0.018, color: IRON, offset: { y: 0.22 - k * 0.11 } }))));
  const hangLantern = cached(() => {
    const frame = [], glass = [], s = 0.7;
    lanternParts(s, 0, -0.84 * s, 0, frame, glass);
    return { frame: merge(...frame), glass: noShadow(merge(...glass)), light: { y: -0.55 * s, z: 0 } };
  });

  // ---------- the drawbridge ----------
  // The leaf, a part: hinged along x at the origin, lying out along +z with its deck's top on y 0. `hooks` are where
  // its four lanterns hang, out over the water; `chain` where each chain is made fast.
  const leaf = cached(() => {
    const { length: LEN, halfW: HW } = LEAF, parts = [], rand = mulberry32(3301), OAK = ["#5a4028", "#4f3823", "#65492e", "#463220"], POSTS = [0.5, 2.6, 4.75, 6.9, 9.0];
    for (let z = 0.02; z < LEN - 0.2; z += 0.26) parts.push(box({ w: 2 * HW, h: 0.14, d: 0.24, color: OAK[Math.floor(rand() * 4)], offset: { x: 0, y: -0.07, z: z + 0.12 } }));
    for (const x of [-HW + 0.3, 0, HW - 0.3]) parts.push(box({ w: 0.26, h: 0.16, d: LEN, color: "#3a2a1b", offset: { x, y: -0.22, z: LEN / 2 } }));
    for (const z of [0.6, 3.3, 6.1, 8.9]) parts.push(box({ w: 2 * HW + 0.04, h: 0.03, d: 0.14, color: IRON, offset: { x: 0, y: 0.012, z } }));
    for (const s of [-1, 1]) {
      POSTS.forEach((z, k) => {
        const tall = k === 1 || k === 3, h = tall ? 1.78 : 1.05;
        parts.push(box({ w: 0.13, h, d: 0.13, color: "#4a3521", offset: { x: s * (HW - 0.09), y: h / 2, z } }));
        if (tall) parts.push(box({ w: 0.5, h: 0.07, d: 0.07, color: IRON, offset: { x: s * (HW + 0.13), y: 1.7, z } }));
      });
      parts.push(box({ w: 0.09, h: 0.11, d: 8.6, color: "#56402a", offset: { x: s * (HW - 0.09), y: 1.0, z: 4.75 } }), box({ w: 0.07, h: 0.08, d: 8.6, color: "#4a3521", offset: { x: s * (HW - 0.09), y: 0.55, z: 4.75 } }));
      parts.push(box({ w: 0.16, h: 0.16, d: 0.16, color: IRON, offset: { x: s * (HW - 0.2), y: 0.1, z: LEN - 0.9 } }));
    }
    return { deck: merge(...parts), hooks: [-1, 1].flatMap((s) => [POSTS[1], POSTS[3]].map((z) => ({ x: s * (HW + 0.34), y: 1.66, z }))), chain: { x: HW - 0.2, y: 0.18, z: LEN - 0.9 } };
  });
  // One link of its chains, a part lying along +z from the origin, `CHAIN_LINK` long.
  const CHAIN_LINK = 0.3;
  const chainLink = cached(() => box({ w: 0.075, h: 0.075, d: CHAIN_LINK * 0.86, color: "#3b3e45", offset: { z: CHAIN_LINK / 2 } }));
  // The portcullis, a part: about x, its foot at the origin.
  const portcullis = cached(() => {
    const parts = [], W = GATE.passage, H = GATE.spring + W * 1.74 + 0.3;
    for (let x = -W + 0.2; x <= W - 0.19; x += 0.4) parts.push(box({ w: 0.075, h: H, d: 0.075, color: IRON, offset: { x, y: H / 2 + 0.1 } }), moved(lathe({ profile: [[0, 0], [0.06, 0.12], [0, 0.12]], segments: 4, color: IRON }), x, -0.02, 0));
    for (let y = 0.55; y < H; y += 0.5) parts.push(box({ w: 2 * W + 0.3, h: 0.065, d: 0.1, color: IRON, offset: { x: 0, y } }));
    return merge(...parts);
  });

  // ---------- the stair's guards ----------
  // The viking who stands at the top of the sea stair, a part with its feet at the origin, facing +z, cut in voxels
  // (`GUARD_UNIT` across) from the maintainer's concept art. `speck` fills a box in blocks `n` cells across, each one
  // of `tones` by its place, so fur, hair and worn plate read as chunky blocks of their own shades.
  const GUARD_UNIT = 0.036;
  const guardTools = (W, H, D) => {
    const g = T.makeGrid(W, H, D), K = tools(g);
    const fill = (x0, x1, y0, y1, z0, z1, c) => K.box(x0, x1 + 1, y0, y1 + 1, z0, z1 + 1, c);
    const both = (x0, x1, y0, y1, z0, z1, c) => { fill(x0, x1, y0, y1, z0, z1, c); fill(W - 1 - x1, W - 1 - x0, y0, y1, z0, z1, c); };
    const speck = (x0, x1, y0, y1, z0, z1, tones, n = 2, seed = 0) => K.shape(x0, x1 + 1, y0, y1 + 1, z0, z1 + 1, null, (x, y, z) => tones[Math.floor(hash3(Math.floor(x / n) + seed, Math.floor(y / n), Math.floor(z / n) + seed * 7) * tones.length)]);
    const speckBoth = (x0, x1, y0, y1, z0, z1, tones, n = 2, seed = 0) => { speck(x0, x1, y0, y1, z0, z1, tones, n, seed); speck(W - 1 - x1, W - 1 - x0, y0, y1, z0, z1, tones, n, seed + 3); };
    return { g, K, fill, both, speck, speckBoth };
  };
  // The viking: squat and broad under a horned helm of rough grey iron with a dark leather brim and a nose guard, a
  // great orange beard spilling over his chest, white fur over both shoulders and round the hem of a rust tunic, a broad
  // belt with a square iron buckle, leather bracers, a short sword point down in his right hand and a round planked
  // shield on his left arm, dark trousers and rust boots.
  const VIKING_HEX = [null, "#ececf0", "#bfbcc0", "#8f9094", "#6f7074", "#3d2c22", "#ead9b8", "#d6c098", "#ef6a17", "#f58427", "#c9521a", "#b5521f", "#8f3e17",
    "#6e4324", "#4f2f19", "#35363a", "#e2c9a0", "#4a2a1a", "#a8502a", "#c26a3c", "#f4f1ea", "#0d0c0c", "#9aa0a8", "#c9ced6", "#5c3a20", "#e8b890"];
  const vikingOf = (o) => {
    const W = 48, H = 58, D = 26, { g, K, fill, both, speck, speckBoth } = guardTools(W, H, D);
    const GLOW_CELL = 26, ROBE = 27, ROBE_D = 28, SOOT = 29, FUR = [1, 1, 2, 1, 20], IRON = [3, 3, 4, 2], BRIM = 5, HORN = 6, HORN_D = 7, BEARD = [8, 9, 8, 10], TUNIC = [11, 11, 12], BELT = 13, BELT_D = 14, BUCKLE = 15, SKIN = 16, TROUSER = 17, BOOT = 18, BOOT_L = 19, WHITE = 20, BLACK = 21, BLADE = 22, BLADE_L = 23, WOOD = 24, FACE = 25;
    // Boots, their cuffs and toes, and the short legs.
    both(16, 21, 0, 3, 9, 19, BOOT); both(16, 21, 0, 1, 20, 21, BOOT); both(16, 21, 4, 5, 9, 18, BOOT_L); both(16, 21, 0, 0, 8, 21, BELT_D);
    both(17, 21, 6, 11, 10, 16, TROUSER);
    // The tunic, its fur hem, the belt and its buckle.
    speck(14, 33, 15, 30, 8, 18, TUNIC, 2, 1);
    speck(13, 34, 12, 14, 7, 19, FUR, 2, 2); speck(12, 35, 11, 13, 8, 18, FUR, 2, 5);
    for (const x of [13, 17, 22, 27, 31]) speck(x, x + 2, 10, 11, 9 + (x % 3), 19, FUR, 1, x);
    fill(13, 34, 17, 20, 7, 19, BELT); fill(13, 34, 17, 17, 7, 19, BELT_D); fill(13, 34, 20, 20, 7, 19, BELT_D);
    fill(21, 26, 16, 21, 20, 20, BUCKLE); fill(22, 25, 17, 20, 21, 21, BUCKLE); fill(23, 24, 18, 19, 21, 22, BELT);
    // An apron over the tunic's front, from the belt down to the hem, tied on at the belt.
    if (o.apron) { fill(16, 31, 11, 21, 19, 20, o.apron); fill(15, 32, 20, 21, 19, 20, BELT_D); }
    // A fur mantle across his back, and the fur over each shoulder, lumped up toward the neck.
    speck(13, 34, 24, 33, 5, 7, FUR, 2, 4);
    speckBoth(7, 15, 27, 33, 6, 20, FUR, 2, 6); speckBoth(8, 15, 34, 35, 8, 18, FUR, 2, 8); speckBoth(6, 6, 28, 32, 8, 18, FUR, 2, 9); speckBoth(9, 13, 25, 26, 7, 19, FUR, 2, 11);
    // The arms: sleeves, bracers banded darker, and the hands.
    both(8, 13, 22, 24, 9, 17, 11); both(8, 13, 15, 21, 10, 17, BELT); both(8, 13, 15, 15, 9, 18, BELT_D); both(8, 13, 20, 20, 9, 18, BELT_D); both(7, 7, 16, 19, 11, 16, WOOD);
    both(9, 12, 12, 14, 11, 17, SKIN);
    // The sword in his right hand, point down: pommel, grip in the fist, cross, and the blade with its fuller.
    if (o.sword) {
      fill(10, 11, 15, 16, 18, 19, WOOD); fill(7, 14, 10, 11, 18, 19, WOOD); fill(7, 14, 11, 11, 17, 20, BELT_D);
      fill(9, 12, 1, 9, 18, 19, BLADE); fill(10, 11, 2, 9, 20, 20, BLADE_L); fill(10, 11, 0, 0, 18, 19, BLADE); fill(9, 9, 1, 9, 18, 19, IRON[2]);
    }
    // A shipwright's mallet, its head up, or a wooden mug brimming with foam.
    if (o.mallet) { fill(10, 11, 9, 24, 18, 19, WOOD); fill(7, 14, 25, 29, 17, 21, BELT); fill(7, 14, 25, 25, 17, 21, BELT_D); fill(7, 14, 29, 29, 17, 21, BELT_D); }
    if (o.mug) { fill(8, 13, 13, 18, 18, 22, WOOD); fill(8, 13, 15, 15, 18, 22, BELT_D); fill(8, 13, 19, 19, 18, 22, WHITE); fill(9, 12, 20, 20, 19, 21, WHITE); fill(14, 14, 14, 17, 19, 21, WOOD); }
    // A smith's hammer, its iron head up with a peen behind; or a tall staff crowned with a glowing orb (`GLOW_CELL`).
    if (o.hammer) { fill(10, 11, 9, 24, 18, 19, WOOD); fill(7, 14, 25, 28, 17, 21, IRON[0]); fill(7, 14, 25, 25, 17, 21, IRON[3]); fill(9, 12, 26, 27, 15, 16, IRON[1]); }
    if (o.staff) { fill(9, 10, 0, 46, 18, 19, WOOD); fill(8, 11, 46, 46, 17, 20, BUCKLE); fill(8, 11, 47, 50, 17, 20, GLOW_CELL); fill(9, 10, 51, 51, 18, 19, GLOW_CELL); }
    // A robe from the belt to the ground over the boots, its hem darker.
    if (o.robe) { speck(14, 33, 1, 16, 8, 18, [ROBE, ROBE, ROBE_D], 2, 13); fill(13, 34, 0, 1, 7, 19, ROBE_D); }
    fill(9, 12, 12, 14, 18, 19, SKIN);
    // The round shield on his left arm: planks, an iron rim and boss.
    if (o.shield) {
      K.shape(29, 47, 10, 28, 18, 20, (x, y) => Math.hypot(x + 0.5 - 38, y + 0.5 - 19) <= 8.6, (x, y, z) => { const d = Math.hypot(x + 0.5 - 38, y + 0.5 - 19); return d > 7.4 ? BUCKLE : z === 20 && d < 2.4 ? 3 : Math.floor(x / 3) & 1 ? WOOD : BELT; });
      K.shape(35, 41, 16, 22, 21, 21, (x, y) => Math.hypot(x + 0.5 - 38, y + 0.5 - 19) <= 2.6, 2);
      fill(36, 39, 18, 20, 22, 22, 3);
    }
    // The head: hair behind, the face about the eyes, and the beard: moustache out past his cheeks, then down in
    // steps to a point over the belt.
    speck(15, 32, 31, 42, 6, 19, BEARD, 2, 3);
    fill(17, 30, 36, 39, 19, 19, FACE);
    both(18, 19, 37, 38, 20, 20, WHITE); both(20, 20, 37, 38, 20, 20, BLACK); both(17, 21, 39, 39, 20, 20, 10);
    speck(12, 35, 31, 35, 16, 21, BEARD, 2, 7); speck(11, 36, 32, 34, 17, 20, BEARD, 2, 9);
    speck(15, 32, 28, 30, 18, 21, BEARD, 2, 12); speck(17, 30, 25, 27, 19, 21, BEARD, 2, 14); speck(19, 28, 23, 24, 19, 21, BEARD, 2, 16); speck(21, 26, 22, 22, 19, 20, BEARD, 2, 18);
    fill(20, 27, 35, 36, 21, 22, 9); fill(22, 25, 34, 34, 22, 22, 8);
    // Soot over the apron and the face, a smith's.
    if (o.soot) { speck(16, 31, 11, 21, 20, 20, [o.apron, o.apron, o.apron, SOOT], 1, 5); speck(17, 30, 36, 39, 19, 19, [FACE, FACE, FACE, SOOT], 1, 9); }
    // The helm: a dark leather brim wider than the head, rough iron heaped up over it, the nose guard, and the horns
    // out of its sides and up.
    if (o.helm) {
      fill(13, 34, 40, 42, 5, 21, BRIM); fill(12, 35, 40, 41, 6, 20, BRIM);
      speck(15, 32, 43, 46, 6, 20, IRON, 2, 21); speck(16, 31, 47, 49, 7, 19, IRON, 2, 23); speck(18, 29, 50, 51, 8, 18, IRON, 2, 25); speck(20, 27, 52, 52, 10, 16, IRON, 2, 27);
      speck(15, 20, 45, 48, 16, 21, [2, 3], 2, 29); speck(26, 31, 46, 49, 15, 20, [3, 2, 2], 2, 31); speck(21, 26, 49, 53, 11, 17, [2, 1, 2], 2, 33); speck(17, 22, 47, 50, 6, 10, IRON, 2, 35);
      fill(23, 24, 34, 43, 21, 22, 3); fill(22, 25, 41, 44, 21, 22, 3); fill(23, 24, 36, 40, 23, 23, 2);
      both(8, 14, 44, 47, 11, 15, HORN); both(8, 10, 44, 44, 11, 15, HORN_D); both(6, 9, 46, 54, 11, 15, HORN); both(6, 6, 46, 50, 11, 15, HORN_D); both(6, 8, 55, 56, 12, 14, HORN); both(6, 7, 57, 57, 12, 13, HORN_D);
    } else if (o.hood) {
      // A deep hood over the head and down behind it, framing the face, its peak drooping back.
      speck(14, 33, 40, 48, 5, 20, [ROBE, ROBE_D, ROBE], 2, 21); speck(15, 32, 30, 40, 5, 7, [ROBE, ROBE_D], 2, 23);
      for (const [a, b] of [[14, 16], [31, 33]]) speck(a, b, 30, 40, 5, 20, [ROBE, ROBE_D, ROBE], 2, 25);
      fill(16, 31, 47, 47, 19, 20, ROBE_D); fill(19, 28, 49, 50, 6, 14, ROBE); fill(21, 26, 51, 51, 5, 10, ROBE_D);
    } else {
      // Bare-headed under a band: the hair heaped over the crown and down behind, or a leather cap pulled over it.
      speck(15, 32, 40, 45, 6, 20, o.cap ? [BELT, BELT_D, BELT] : BEARD, 2, 21); speck(17, 30, 46, 47, 8, 18, o.cap ? [BELT, BELT_D] : BEARD, 2, 23);
      fill(15, 32, 40, 40, 6, 21, o.cap ? BELT_D : BUCKLE);
    }
    const hex = VIKING_HEX.slice();
    for (const k in o.hex || {}) hex[k] = o.hex[k];
    const palette = hex.map((c) => c && hexToRgb(c)), geo = T.gridGeometry(g, { unit: GUARD_UNIT, palette, origin: { x: -W / 2 * GUARD_UNIT, y: 0, z: -13 * GUARD_UNIT } });
    for (const f of geo.faces) if (f.color === palette[GLOW_CELL]) f.emissive = 0.95;
    return geo;
  };
  const viking = cached(() => vikingOf({ sword: true, shield: true, helm: true }));
  // The shipyard's two, the viking's own build in their own colours (keep-layout.js `GUARDS`): Inga the barkeep, fair,
  // bare-headed and in green under a pale apron, a foaming mug in her fist; and Bjorn the shipwright, grey-bearded
  // under a leather cap, in blue under a leather apron, his mallet in his.
  const barkeep = cached(() => vikingOf({ apron: 20, mug: true, hex: { 8: "#e3bd55", 9: "#f0d27a", 10: "#c79f3c", 11: "#3f6b3a", 12: "#2f5230" } }));
  // Leif, the fleet's captain: the viking armed as Eryk is, grey bearded, in sea blue.
  const captain = cached(() => vikingOf({ sword: true, shield: true, helm: true, hex: { 8: "#c9c9c4", 9: "#e4e4de", 10: "#9d9d98", 11: "#2f5fa8", 12: "#234a86", 18: "#2a4f8f", 19: "#3a66ad" } }));
  const shipwright = cached(() => vikingOf({ apron: 13, mallet: true, cap: true, hex: { 8: "#b9b9bd", 9: "#d2d2d6", 10: "#8f9094", 11: "#3d5a80", 12: "#2f4766" } }));
  // The Armory & Forge's two: Thorvald the swordsmith, black-bearded under a leather cap, in a scorched leather apron
  // over a dark tunic, soot on his face and his hammer in his fist; and Ylva the alchemist, grey-haired in a deep hood
  // and a robe of dark violet, a tall staff in her hand crowned with a glowing green orb.
  const smith = cached(() => vikingOf({ apron: 13, hammer: true, soot: true, cap: true, hex: { 8: "#2a2522", 9: "#3b332d", 10: "#1d1916", 11: "#5a3a26", 12: "#45301f", 29: "#16120f" } }));
  const alchemist = cached(() => vikingOf({ staff: true, robe: true, hood: true, hex: { 8: "#c9c4bd", 9: "#e0dcd6", 10: "#a9a49d", 11: "#3b2a5a", 12: "#2b1f44", 26: "#7dffb0", 27: "#4a3470", 28: "#2f2148" } }));
  // The islet's skeleton, a jointed rig of parts, each about its own joint (the scene hangs them on nodes and moves
  // them): a great square skull with dark sockets, a ribcage of bare ribs on its spine under a tattered dark cape, a
  // plate pauldron on each shoulder (the left one greater), thin arm and leg bones jointed at elbow and knee with
  // knuckled fists and plated shins, and a broad dark blade as long as his body in his right fist. Cut in voxels
  // `SKELETON.u` across; `SKELETON` says where each part's joint stands on the one it hangs from, in metres, his feet
  // on the ground at y 0 and his face toward +z.
  const SKELETON = { u: 0.05, hip: 0.78, hipX: 0.13, knee: 0.36, chest: 0.5, shoulderX: 0.34, shoulderY: 0.4, elbow: 0.3, grip: 0.38, neck: 0.5, height: 1.95 };
  const SKEL_HEX = [null, "#e4dccb", "#cfc5b2", "#b3a893", "#8f8573", "#15120f", "#3b3d42", "#2c2e33", "#55585e", "#1c1a1d", "#262329", "#6b6156"];
  // The green skeleton: the same, half again as large, its bones green and its sword a glowing green (`skeleton(true)`,
  // `GREEN_SKELETON` its joints).
  const GREEN_SCALE = 1.5;
  const GREEN_SKELETON = Object.fromEntries(Object.entries(SKELETON).map(([k, v]) => [k, v * GREEN_SCALE]));
  const GREEN_HEX = [null, "#8fd16a", "#76b955", "#5e9c43", "#456f33", "#0c140a", "#3fe07a", "#22b358", "#9dffbd", "#16211a", "#1f2d22", "#3d5a35"];
  const buildSkeleton = (green) => {
    const u = green ? GREEN_SKELETON.u : SKELETON.u, pal = (green ? GREEN_HEX : SKEL_HEX).map((c) => c && hexToRgb(c)), BONE = [1, 1, 2, 1, 3], DARK_B = 4, VOID = 5, STEEL = 6, STEEL_D = 7, STEEL_L = 8, CAPE = 9, CAPE_L = 10, GRIP = 11;
    // A part: its grid drawn by `draw`, meshed with the voxel (px, py, pz) at its origin.
    const part = (W, H, D, px, py, pz, draw) => { const t = guardTools(W, H, D); draw(t); return T.gridGeometry(t.g, { unit: u, palette: pal, origin: { x: -px * u, y: -py * u, z: -pz * u } }); };
    const head = part(14, 13, 13, 7, 0, 6.5, ({ fill, speck }) => {
      speck(0, 13, 2, 12, 0, 12, BONE, 3, 1); speck(1, 12, 0, 1, 1, 11, BONE, 3, 2); fill(1, 12, 12, 12, 1, 11, 1); fill(0, 13, 2, 2, 0, 12, 3);
      for (const x of [2, 8]) { fill(x, x + 3, 5, 8, 11, 12, VOID); fill(x + 1, x + 2, 9, 9, 12, 12, VOID); }
      fill(6, 7, 3, 4, 12, 12, VOID); fill(6, 7, 3, 4, 11, 11, DARK_B);
      for (let x = 3; x <= 10; x += 2) fill(x, x, 0, 1, 12, 12, DARK_B);
    });
    const torso = part(18, 11, 9, 9, 0, 4.5, ({ fill, both, speck }) => {
      fill(8, 9, 0, 10, 2, 4, 2); fill(6, 11, 0, 1, 2, 6, 1); fill(5, 12, 0, 0, 3, 5, 3);
      for (let y = 3; y <= 9; y += 2) { both(4, 8, y, y, 3, 8, y === 9 ? 1 : 2); both(3, 3, y, y, 3, 7, 3); fill(4, 13, y, y, 2, 2, 3); }
      fill(7, 10, 4, 9, 8, 8, 1); fill(3, 14, 10, 10, 3, 7, 1);
      // The pauldrons: a small plate on the right shoulder, a great stepped one on the left.
      fill(0, 3, 8, 10, 2, 7, 2); fill(0, 2, 7, 7, 3, 6, 3);
      speck(13, 17, 7, 10, 1, 8, BONE, 2, 5); fill(14, 17, 10, 10, 2, 7, 1); fill(15, 17, 6, 6, 2, 7, 3); fill(13, 17, 8, 8, 1, 8, 3);
      // The cape, hung from the shoulders down the back, torn at its foot.
      fill(3, 14, 4, 10, 0, 1, CAPE); fill(4, 13, 0, 3, 0, 0, CAPE_L);
    });
    const cape = part(12, 14, 2, 6, 14, 1, ({ fill }) => {
      for (let x = 0; x < 12; x++) { const len = 6 + ((x * 7) % 5) * 2; fill(x, x, 14 - len, 13, 0, 0, x & 1 ? CAPE : CAPE_L); if (x % 3 === 0) fill(x, x, 14 - len, 13, 1, 1, CAPE); }
    });
    const limb = (len, w, plated) => part(w + 2, len, w + 2, (w + 2) / 2, len, (w + 2) / 2, ({ fill, speck }) => {
      speck(1, w, 0, len - 1, 1, w, BONE, 2, len); fill(0, w + 1, len - 2, len - 1, 0, w + 1, 2); fill(0, w + 1, 0, 0, 0, w + 1, 3);
      if (plated) { fill(0, w + 1, 2, len - 4, w, w + 1, 1); fill(0, w + 1, 3, 3, w + 1, w + 1, 3); }
    });
    const upperArm = limb(6, 2, false), thigh = limb(7, 2, false);
    const forearm = part(6, 9, 6, 3, 9, 3, ({ fill, speck }) => {
      speck(2, 3, 3, 8, 2, 3, BONE, 2, 3); fill(1, 4, 7, 8, 1, 4, 2);
      speck(0, 5, 0, 3, 0, 5, BONE, 1, 7); fill(0, 5, 3, 3, 0, 5, 3); for (const x of [0, 2, 4]) fill(x, x, 0, 0, 5, 5, DARK_B);
    });
    const shin = part(6, 8, 8, 3, 8, 3, ({ fill, speck }) => {
      speck(2, 3, 2, 7, 2, 3, BONE, 2, 4); fill(1, 4, 6, 7, 1, 4, 2); fill(1, 4, 3, 5, 4, 4, 1);
      speck(1, 4, 0, 1, 1, 7, BONE, 2, 9); fill(1, 4, 0, 0, 1, 7, 3);
    });
    // The sword, its grip at the origin and its blade up along +y: pommel, grip, a notched cross and the broad blade,
    // its edge paler, tapering at the point.
    const sword = part(9, 34, 3, 4.5, 4, 1.5, ({ fill, K }) => {
      fill(3, 5, 0, 1, 0, 2, STEEL_D); fill(4, 4, 2, 5, 1, 1, GRIP); fill(3, 5, 2, 5, 1, 1, GRIP);
      fill(0, 8, 6, 7, 0, 2, STEEL_D); fill(0, 0, 5, 5, 0, 2, STEEL_D); fill(8, 8, 5, 5, 0, 2, STEEL_D);
      K.shape(2, 7, 8, 34, 1, 2, (x, y) => y < 29 || Math.abs(x + 0.5 - 4.5) <= (34 - y) * 0.5, (x, y) => x === 2 || x === 6 ? STEEL_L : (y % 9 === 4 ? STEEL_D : STEEL));
    });
    // The green one's blade glows.
    if (green) for (const f of sword.faces) if (f.color === pal[STEEL] || f.color === pal[STEEL_D] || f.color === pal[STEEL_L]) f.emissive = 0.95;
    return { head, torso, cape, upperArm, forearm, thigh, shin, sword };
  };
  const whiteSkeleton = cached(() => buildSkeleton(false)), greenSkeleton = cached(() => buildSkeleton(true));
  const skeleton = (green = false) => green ? greenSkeleton() : whiteSkeleton();
  // The islet's ogre, from the maintainer's concept art, a jointed rig as the skeleton is and three times an Ooga's
  // height: a great blue belly under a small tusked head sunk in a dark fur collar, a spiked fur pauldron on his left
  // shoulder and an iron gauntlet with a plate on that forearm, a studded belt with an orange boss, a red sash, a
  // ragged skirt of rust mail, iron knee plates with an orange stud, broad sandalled feet, and in his right fist a long
  // stone haft with a great pale crescent axe blade. Cut in voxels `OGRE.u` across; `OGRE` is his joints, as `SKELETON`.
  const OGRE = { u: 0.075, hip: 1.5, hipX: 0.47, knee: 0.72, shoulderX: 1.3, shoulderY: 1.72, elbow: 0.86, grip: 0.9, gripZ: 0.1, neck: 1.95, height: 4.5 };
  const OGRE_HEX = [null, "#3f7fd6", "#356fc4", "#2c5fae", "#4a8fe4", "#26262b", "#37383f", "#52545c", "#f07a1c", "#ff9a3a", "#a8431c", "#7a2f16", "#b33a2e", "#e6dcc6", "#bfb49c",
    "#dcd9d5", "#b9b6b2", "#8e8a86", "#857a70", "#665d56", "#0f0d0c", "#ffb030"];
  // The red troll of the volcano's island (scene-keep.js `TROLL`), from the maintainer's concept art, on the ogre's rig
  // and cut from the same shapes: a red hide, tusks and a black beard, a green guard on his left shoulder, a belt of
  // leather and fur with a green sack at his hip, no axe, and a great dark cannon banded in brass lying on his right
  // shoulder (`shoulder`, a part hung on the torso at `TROLL.cannon`, its muzzle toward +z; `TROLL.muzzle` is where
  // its shot leaves, both in the torso's frame).
  const TROLL = { ...OGRE, cannon: { x: -0.98, y: OGRE.shoulderY + 0.42, z: 0.05 }, muzzle: { x: -0.98, y: OGRE.shoulderY + 0.42 + 0.375, z: 0.05 + 1.65 } };
  const TROLL_HEX = [...OGRE_HEX, "#5f8f2e", "#4a7524", "#7aa83a", "#1f2a2e", "#2a383c", "#141b1e", "#8a6a2a"];
  for (const [i, c] of [[1, "#d8281c"], [2, "#c21f15"], [3, "#a8170f"], [4, "#ee3a2a"], [10, "#8a5a2c"], [11, "#6a4220"], [12, "#4a7524"]]) TROLL_HEX[i] = c;
  const ogreOf = variants((troll) => {
    const u = OGRE.u, pal = (troll ? TROLL_HEX : OGRE_HEX).map((c) => c && hexToRgb(c)), SKIN = [1, 1, 2, 1, 3, 4], IRON = [5, 5, 6, 7], GUARD = troll ? [22, 23, 24, 22] : IRON, FUR = troll ? [20, 5, 20, 11] : IRON, CAN = [25, 26, 27, 25], BRASS = 28, OR = 8, OR_L = 9, RUST = [10, 11, 10, 8, 5], SASH = 12, HORN = 13, HORN_D = 14, PALE = 15, PALE_M = 16, PALE_D = 17, HAFT = 18, HAFT_D = 19, BLACK = 20, EYE = 21;
    const pick = (tones, x, y, z, n, seed) => tones[Math.floor(hash3(Math.floor(x / n) + seed, Math.floor(y / n), Math.floor(z / n) + seed * 7) * tones.length)];
    // Blue hide, flecked here and there with a stud of iron or orange as the art's is.
    const hide = (seed) => (x, y, z) => { const f = hash3(x + seed * 13, y * 3 + 1, z + seed); return f < 0.012 ? OR : f < 0.03 ? 6 : pick(SKIN, x, y, z, 2, seed); };
    const part = (W, H, D, px, py, pz, draw) => { const t = guardTools(W, H, D); draw(t, W, H, D); return T.gridGeometry(t.g, { unit: u, palette: pal, origin: { x: -px * u, y: -py * u, z: -pz * u } }); };
    const ball = (K, W, H, D, cx, cy, cz, rx, ry, rz, m, pow = 2) => K.shape(0, W, 0, H, 0, D, (x, y, z) => Math.abs((x + 0.5 - cx) / rx) ** pow + Math.abs((y + 0.5 - cy) / ry) ** pow + Math.abs((z + 0.5 - cz) / rz) ** pow <= 1, m);
    const torso = part(36, 48, 34, 18, 10, 17, ({ K, fill }, W, H, D) => {
      // The mail skirt, a ragged ring hung from the belt, open inside for the legs.
      K.shape(0, W, 0, 12, 0, D, (x, y, z) => { const d = Math.hypot((x + 0.5 - 18) / 15, (z + 0.5 - 17) / 14); return d <= 1 && d > 0.82 && y >= Math.floor(hash3(x, 7, z) * 6) && hash3(x, y, z) > 0.12; }, (x, y, z) => pick(RUST, x, y, z, 1, 3));
      const belly = hide(1);
      ball(K, W, H, D, 18, 22, 18, 16.5, 12.5, 15, (x, y, z) => y >= 12 && y <= 15 ? ((x + z) % 5 === 0 ? 7 : y === 15 ? 6 : 5) : y === 16 && z > 17 ? SASH : belly(x, y, z));
      ball(K, W, H, D, 18, 30, 16, 15.5, 9, 12.5, hide(2));
      // The belt's orange boss, and the chain's ring on the chest.
      K.shape(5, 13, 9, 18, 26, 34, (x, y, z) => Math.hypot(x + 0.5 - 9, y + 0.5 - 13.5) <= 4.2 && z >= 28 + Math.abs(x - 9) * 0.5 && z <= 31, (x, y) => Math.hypot(x + 0.5 - 9, y + 0.5 - 13.5) <= 2.4 ? OR : 6);
      K.shape(14, 22, 30, 36, 26, 30, (x, y, z) => { const d = Math.hypot(x + 0.5 - 18, y + 0.5 - 33); return d <= 2.6 && d > 1.2 && z === 28; }, OR_L);
      // The fur collar the head sits in, and the pauldron on his left shoulder with its two horns.
      ball(K, W, H, D, 18, 38, 16, 9, 3.2, 9, (x, y, z) => pick(FUR, x, y, z, 1, 5));
      ball(K, W, H, D, 30, 37, 15, 7.5, 5.5, 9, (x, y, z) => hash3(x, y, z) < 0.07 ? OR : pick(GUARD, x, y, z, 1, 9));
      // The troll's sack at his left hip.
      if (troll) ball(K, W, H, D, 31, 12, 23, 4.6, 4.8, 4.6, (x, y, z) => y > 14 ? 11 : pick(GUARD, x, y, z, 2, 4));
      for (const [hx, hz, top] of [[28, 13, 47], [33, 17, 48]]) K.shape(hx - 3, hx + 3, 40, top, hz - 3, hz + 3, (x, y, z) => Math.hypot(x + 0.5 - hx, z + 0.5 - hz) <= 2.6 * (top - y) / (top - 40) + 0.4, (x, y) => (y & 1 ? HORN : HORN_D));
    });
    const head = part(14, 13, 14, 7, 0, 7, ({ K, fill }, W, H, D) => {
      ball(K, W, H, D, 7, 6.5, 7, 7, 6.5, 7, hide(4), 4);
      fill(2, 11, 8, 8, 13, 13, 3); for (const x of [3, 9]) fill(x, x + 1, 7, 7, 13, 13, EYE);
      fill(6, 7, 5, 6, 13, 13, 2); fill(4, 9, 3, 3, 13, 13, BLACK);
      for (const x of [3, 10]) { fill(x, x, 3, 5, 13, 13, HORN); fill(x, x, 2, 2, 13, 13, HORN_D); }
      for (const x of [0, 13]) fill(x, x, 6, 8, 5, 8, 2);
      // The troll's black beard under his tusks, and heavy black brows.
      if (troll) { fill(2, 11, 0, 1, 9, 13, BLACK); fill(4, 9, 2, 2, 13, 13, BLACK); fill(1, 12, 0, 2, 9, 11, BLACK); fill(2, 5, 9, 9, 13, 13, BLACK); fill(8, 11, 9, 9, 13, 13, BLACK); }
    });
    const tube = (W, H, D, r, m, more) => part(W, H, D, W / 2, H, D / 2, (t) => { t.K.shape(0, W, 0, H, 0, D, (x, y, z) => (Math.abs((x + 0.5 - W / 2) / r) ** 3 + Math.abs((z + 0.5 - W / 2) / r) ** 3) <= 1, m); if (more) more(t); });
    const upperArm = tube(10, 13, 10, 4.8, hide(6)), thigh = tube(11, 10, 11, 5.4, hide(7));
    const fist = ({ fill, speck }) => { speck(0, 9, 0, 4, 0, 9, SKIN, 2, 11); for (const x of [2, 5, 8]) fill(x, x, 0, 3, 9, 9, 3); };
    const forearm = tube(10, 14, 10, 4.4, hide(8), fist);
    // His left forearm in an iron gauntlet, a studded plate on its outer side.
    const forearmL = tube(10, 14, 10, 4.9, (x, y, z) => y < 4 ? 1 : hash3(x, y, z) < 0.08 ? OR : pick(IRON, x, y, z, 1, 12), (t) => { fist(t); t.speck(9, 9, 3, 13, 0, 9, IRON, 1, 2); t.fill(9, 9, 7, 9, 3, 6, OR); });
    const shin = part(11, 11, 16, 5.5, 11, 5.5, ({ K, fill, speck }, W, H) => {
      const calf = hide(9);
      K.shape(0, W, 3, H, 0, 11, (x, y, z) => (Math.abs((x + 0.5 - 5.5) / 4.8) ** 3 + Math.abs((z + 0.5 - 5.5) / 4.8) ** 3) <= 1, calf);
      speck(2, 8, 7, 10, 9, 10, IRON, 1, 4); fill(4, 6, 8, 9, 10, 10, OR);
      speck(0, 10, 1, 2, 1, 15, SKIN, 2, 14); fill(0, 10, 0, 0, 1, 15, 11); fill(0, 10, 2, 2, 9, 10, 5); fill(0, 10, 2, 2, 3, 4, 5);
      for (const x of [1, 4, 7, 10]) fill(x, x, 1, 2, 15, 15, 3);
    });
    // The axe, its grip at the origin and its haft up along +y, the crescent blade's edge toward +z with a ring cut
    // through it, an iron spike behind.
    const sword = troll ? null : part(4, 54, 30, 2, 14, 13.5, ({ K, fill }) => {
      K.shape(1, 3, 0, 54, 12, 15, null, (x, y) => y < 3 || y % 9 === 0 ? 5 : y % 9 === 4 ? HAFT_D : HAFT);
      fill(0, 3, 0, 1, 11, 15, 6); fill(0, 3, 36, 50, 11, 15, 5);
      K.shape(1, 3, 30, 54, 15, 30, (x, y, z) => { const d = Math.hypot(z + 0.5 - 14, y + 0.5 - 43); return d <= 14 && d > 2 && Math.hypot(z + 0.5 - 19.5, y + 0.5 - 43) > 3.6 && Math.abs(y + 0.5 - 43) <= 5 + (z - 14) * 0.75; },
        (x, y, z) => { const d = Math.hypot(z + 0.5 - 14, y + 0.5 - 43); return d > 12.4 ? PALE : Math.floor(d) % 3 === 0 ? PALE_D : PALE_M; });
      K.shape(1, 3, 38, 48, 5, 12, (x, y, z) => Math.abs(y + 0.5 - 43) <= (z - 4) * 0.6, (x, y, z) => pick(IRON, x, y, z, 1, 3));
    });
    // The troll's cannon: a thick tube, swelling at its breech and its muzzle, banded in brass, its bore open.
    const bore = (x, y) => Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
    const shoulder = !troll ? null : part(12, 12, 34, 6, 1, 12, ({ K }) => {
      K.shape(0, 12, 0, 12, 0, 34, (x, y, z) => bore(x, y) <= (z > 29 || z < 3 ? 5.8 : z % 9 < 2 ? 5.3 : 4.6) && !(z > 24 && bore(x, y) < 2.8), (x, y, z) => z === 24 && bore(x, y) < 2.8 ? BLACK : z > 29 || z < 3 ? CAN[2] : z % 9 < 2 ? BRASS : pick(CAN, x, y, z, 2, 5));
    });
    return { head, torso, upperArm, forearm, forearmL, thigh, shin, sword, shoulder };
  });
  const ogre = () => ogreOf(false), troll = () => ogreOf(true);
  // The Byzantine Keep's weapons, held as a club is, for an Ooga `h` tall, in units of h/16 up the haft from the grip:
  // `sword`, Midy-Machete's sword (her character file's `swordGeometry`) in orange and black and its blade half
  // again as long, a black grip and guard, its blade orange with a black fuller; `axe`, a long dark haft with a black
  // wrapped grip, an iron socket and spike, and a bearded black head stepping out to an orange edge.
  const KEEP_ARMS = new Map();
  // The dagger, the wand and the staff, from the maintainer's art, in black and orange voxels a quarter of a sixteenth
  // of the Ooga's height across (`ARM_CELL`), the grip at the origin and the business end up +y, built from three
  // pieces: a round shaft wound in an orange spiral (`shaft`), orange collars round it (`collar`), and flat plates
  // broad along z (the dagger's blade and guard, the staff's star).
  const ARM_CELL = 0.25, ARM_HEX = ["#141316", "#1c1b1f", "#0e0d10", "#ff5a14", "#ff7a2a", "#c23c08", "#ffd08a"], ARM_GLOW = { 3: 0.55, 4: 0.6, 5: 0.3, 6: 1 };
  const AK = 0, AO = 3, AOL = 4, AOD = 5, AW = 6;
  const orangeArm = (id, h) => {
    const vox = models.makeVox(), hash = (p, q) => L.hash2(p * 7 + 3, q * 11 + 5);
    const black = (y, z) => AK + Math.floor(hash(y >> 1, z) * 3);
    // A round shaft from y0 to y1, its radius `r(y)` in cells, wound with an orange band turning `turns` a cell.
    const shaft = (y0, y1, r, turns = 0.11, plain = false) => {
      for (let y = y0; y <= y1; y++) {
        const R = r(y), n = Math.ceil(R);
        for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
          if (Math.hypot(x, z) > R + 0.15) continue;
          const a = Math.atan2(z, x) / (2 * Math.PI) + 0.5, band = ((a + y * turns) % 1 + 1) % 1 < 0.42;
          vox.set(x, y, z, plain ? black(y, x + z) : band ? (hash(y, x - z) > 0.8 ? AOL : AO) : black(y, x + z));
        }
      }
    };
    const collar = (y0, y1, R, c = AO) => { for (let y = y0; y <= y1; y++) for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) if (Math.hypot(x, z) <= R + 0.2) vox.set(x, y, z, y === y1 ? AOL : c); };
    // A flat plate in the y, z plane, `thick` cells either side of x 0: `at(y, z)` says each cell's colour or null.
    const plate = (y0, y1, z0, z1, thick, at) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const c = at(y, z); if (c === null || c === undefined) continue; for (let x = -thick; x <= thick; x++) vox.set(x, y, z, Math.abs(x) === thick && c === AK ? black(y, z) : c); } };
    // A ball, a pommel.
    const ball = (cy, R) => { for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = -Math.ceil(R); x <= Math.ceil(R); x++) for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) if (Math.hypot(x, y - cy, z) <= R) vox.set(x, y, z, hash(x + y, z) > 0.75 ? AOD : AO); };
    let scale = 1;
    if (id === "dagger") {
      // A short sword: the ball pommel, a grip wound orange, a guard of black edged orange with an orange diamond at
      // its middle and points at its ends, and a broad blade outlined in orange with an orange line down its middle,
      // its edges broken into lengths, and an arrowhead point.
      ball(-8.5, 2.6); collar(-6, -5, 1.6, AK);
      shaft(-5, 4, () => 1.6, 0.16);
      plate(5, 9, -9, 9, 1, (y, z) => {
        const a = Math.abs(z), half = [5, 8, 9, 8, 5][y - 5];
        if (a > half) return null;
        const gem = a + Math.abs(y - 7) <= 2;
        return gem ? (a + Math.abs(y - 7) < 1 ? AK : AOL) : a >= half - 1 || y === 5 || y === 9 ? AO : AK;
      });
      const B0 = 10, B1 = 34, HEAD = 27;
      plate(B0, B1, -6, 6, 1, (y, z) => {
        const a = Math.abs(z), t = (y - B0) / (B1 - B0);
        const w = y < HEAD ? 3.6 + (1 - t) * 0.8 : 5.2 * (B1 - y) / (B1 - HEAD);
        if (a > w + 0.2) return null;
        const edge = a > w - 1.2;
        // The edges in lengths, a black break every so often below the point.
        if (edge) return y < HEAD && (y - B0) % 7 === 6 ? AK : y >= HEAD ? AOL : AO;
        return a < 0.5 && y > B0 + 1 && y < HEAD + 2 ? AO : AK;
      });
    } else if (id === "wand") {
      // A slender spiral horn: a pointed pommel of orange over black, black rings flaring at its foot, then a shaft
      // tapering to an orange point, wound in orange and ringed by orange collars up its length.
      plate(-15, -7, -3, 3, 1, (y, z) => { const a = Math.abs(z), w = y < -11 ? (y + 15) * 0.75 : 3 - (y + 11) * 0.5; return a > w ? null : a > w - 1 ? AO : AK; });
      for (const [y0, y1, R] of [[-7, -6, 3.2], [-5, -4, 2.8], [-3, -3, 3.3]]) collar(y0, y1, R, AK);
      shaft(-2, 60, (y) => 2.5 - (y + 2) / 62 * 1.6, 0.09);
      for (const [y, R] of [[-1, 3.4], [6, 3.1], [16, 2.9], [27, 2.6], [38, 2.3], [48, 2], [56, 1.7]]) collar(y, y + 1, R);
      for (let y = 61; y <= 66; y++) { const R = 0.9 * (66 - y) / 5; for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (Math.hypot(x, z) <= R + 0.3) vox.set(x, y, z, y > 63 ? AOL : AO); }
    } else {
      // The staff: a pointed foot, a long shaft wound in orange with collars, orange discs under its head, and the head
      // a star: a black square turned on its point, edged orange, an orange diamond with a black heart in it, and eight
      // spikes round it in orange and black.
      plate(-54, -44, -3, 3, 1, (y, z) => { const a = Math.abs(z), w = y < -50 ? (y + 54) * 0.8 : 3.2 - (y + 50) * 0.3; return a > w ? null : a > w - 1 ? AO : AK; });
      collar(-43, -42, 2.8, AK);
      shaft(-41, 104, () => 2.1, 0.08);
      for (const y of [-38, -12, 10, 34, 60, 84]) collar(y, y + 1, 3);
      for (const [y, R] of [[96, 3.6], [100, 4.6], [104, 3.4]]) collar(y, y + 1, R);
      const CY = 122;
      plate(106, 138, -16, 16, 1, (y, z) => {
        const dy = y - CY, a = Math.abs(z), d = a + Math.abs(dy);
        if (d <= 10) return d <= 2 ? AK : d <= 5 ? AOL : d >= 9 ? AO : AK;
        // Eight spikes: four on the axes, four on the diagonals, each narrowing to its point.
        const ang = Math.atan2(dy, z), k = Math.round(ang / (Math.PI / 4)), off = Math.abs(ang - k * Math.PI / 4), rr = Math.hypot(dy, z), len = k % 2 ? 14 : 16;
        if (rr > len || off > 0.42 * (1 - (rr - 8) / (len - 8))) return null;
        return k % 2 ? AK : (rr > len - 5 ? AOL : AO);
      });
      scale = 1;
    }
    const u = h / 16 * ARM_CELL * scale;
    return Object.assign(models.voxelGeometry(vox, { unit: u, palette: ARM_HEX, origin: { x: -u / 2, y: 0, z: -u / 2 }, emissive: ARM_GLOW }), id === "dagger" ? { slingTurn: Math.PI / 2, slingHiltUp: true } : { slingTurn: Math.PI / 2 });
  };
  // The fourth-level sword (`keepWeapon("sword4")`): its cell in sixteenths of the Ooga's height, and the rows of
  // cells its pommel-side grip, guard and blade take. `flames`, where along the blade (0 the guard, 1 the tip) and to
  // which edge (z, of the blade's half width there) a small flame stands off it, and how big.
  const FROST = { cell: 0.25, grip: [-7, 3], guard: [4, 9], blade: [10, 110], body: 7, barb: 11, reach: 4.5, head: 0.88,
    // The blade's half width in cells, `t` of the way from guard to tip, out to its barbs' points.
    wide: (t) => t < 0.88 ? 7 + 3 : 9.5 * (1 - (t - 0.88) / 0.12),
    flames: [[0.1, 1, 1], [0.24, -1, 0.85], [0.4, 0.8, 0.9], [0.55, -0.8, 0.75], [0.7, 0.6, 0.7], [0.86, -0.4, 0.55]] };
  // Black steel in three tones, the middle lines, the edge's oranges from bright to its barbs' dark tops, the pommel's
  // two, the grip and the guard.
  const FROST_HEX = ["#121214", "#19191c", "#0c0c0e", "#ff5a14", "#ff7a2a", "#ff5c12", "#ff7422", "#c23c08", "#ff6418", "#d2480c", "#131315", "#1a1a1e"];
  // A bolt of lightning `LIGHTNING_LEN` m long, its foot at the origin and running up +y: a thin jagged white core in a
  // faint white glow, forking twice on its way, each of `n` variants its own path, so a strike flickers by swapping
  // them. The scene stands one on each enemy its fourth step strikes and one up from the blade into the sky.
  const LIGHTNING_LEN = 40;
  const lightning = variants((n) => {
    const rand = mulberry32(211 + n * 17), parts = [];
    const stroke = (x, y, z, len, step, jag, core, glow) => {
      const pts = [[x, y, z]];
      for (let d = step; d < len; d += step * (0.6 + rand() * 0.8)) { x += (rand() - 0.5) * jag; z += (rand() - 0.5) * jag; y += step; pts.push([x, y, z]); }
      // A thin white core in a faint white glow.
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        parts.push(beam(a[0], a[1], a[2], b[0], b[1], b[2], core, "#ffffff", 1), beam(a[0], a[1], a[2], b[0], b[1], b[2], glow, "#e8eeff", 0.85));
      }
      return pts;
    };
    const main = stroke(0, 0, 0, LIGHTNING_LEN, 1.4, 1.8, 0.04, 0.07);
    for (const at of [0.35, 0.62]) {
      const p = main[Math.floor(at * (main.length - 1))];
      stroke(p[0], p[1], p[2], 6 + rand() * 5, 1.1, 2.4, 0.025, 0.045);
    }
    return noShadow(merge(...parts));
  });
  // A flame off the frost blade's edge, small, standing up from its foot at the origin.
  const bladeFlame = cached(() => noShadow(merge(
    lathe({ profile: [[0, -0.01], [0.045, 0.02], [0.05, 0.07], [0.028, 0.15], [0, 0.24]], segments: 6, color: "#ff7a24", emissive: 1 }),
    lathe({ profile: [[0, -0.02], [0.028, 0.0], [0.03, 0.05], [0, 0.15]], segments: 5, color: "#ffe27a", emissive: 1 }))));
  const MAUL_SCALE = 1.755;
  const keepWeapon = (id, h) => {
    const key = id + "|" + h.toFixed(3);
    let g = KEEP_ARMS.get(key);
    if (g) return g;
    const H = BL.heroBody, geo = geometry();
    if (id === "sword") {
      const edge = "#f7931a", edgeDk = "#c4650f", fuller = "#141216", dark = "#1c1a1e", L = (y) => 1.72 + (y - 1.72) * 1.5;
      H.loft(geo, [[-2.1, 0.42, 0.52, 0.16], [-1.4, 0.42, 0.52, 0.16]], edge);
      H.loft(geo, [[-1.4, 0.34, 0.4, 0.14], [1.2, 0.34, 0.4, 0.14]], "#17131a", [false, false]);
      H.loft(geo, [[1.2, 0.46, 2.15, 0.2], [1.72, 0.46, 2.15, 0.2]], dark);
      H.loft(geo, [[1.72, 0.17, 1.24, 0.12], [L(3), 0.17, 1.24, 0.12]], [edge, edgeDk], [false, false]);
      H.loft(geo, [[L(2.95), 0.17, 1.8, 0.15], [L(9.6), 0.17, 1.8, 0.15], [L(12.3), 0.03, 0.05, 0.02]], [edge, edgeDk]);
      H.loft(geo, [[1.72, 0.25, 1.06, 0.1], [L(9.5), 0.25, 1.06, 0.1], [L(11.6), 0.06, 0.08, 0.03]], fuller);
      g = Object.assign(H.scaled(geo, h / 16), { slingTurn: Math.PI / 2, slingHiltUp: true });
    } else if (id === "sword4") {
      // The sword at its fourth level, from the maintainer's art: a broad black blade with a saw of orange barbs down
      // both edges, each a triangle hooked toward the point, two orange lines down its middle either side of a black
      // groove, and an arrowhead of a point outlined in orange; an angular black crossguard edged in orange with
      // pointed ends and an orange diamond at its middle; a black grip wound in an orange spiral; an orange ball for
      // a pommel. In voxels a quarter of a sixteenth of the Ooga's height (`FROST.cell`), the grip at the origin, the
      // blade up +y and broad along z, as the sword is.
      const F = FROST, vox = models.makeVox(), hash = (p, q) => L.hash2(p * 3 + 11, q * 5 + 7);
      const BLACK = 0, LINE = 3, EDGE = 5, BALL = 8, GRIP = 10, IRON = 11, Y0 = F.blade[0], Y1 = F.blade[1], W = F.body, P = F.barb;
      const black = (y, z) => BLACK + Math.floor(hash(y >> 1, z) * 3), orange = (y, z) => EDGE + (hash(y, z) > 0.7 ? 1 : 0);
      for (let y = Y0; y <= Y1; y++) {
        const t = (y - Y0) / (Y1 - Y0), head = t >= F.head;
        // The body's half width; the point flares out past it and runs straight in to its tip.
        const body = head ? (W + 2.5) * (1 - (t - F.head) / (1 - F.head)) : W;
        // A barb a period: nothing at its foot, widening to its hook, then cut square.
        // It takes the upper part of its period; below it the edge runs plain, so the barbs stand apart.
        const step = (y - Y0) % P, phase = Math.max(0, (step - 4) / (P - 5)), barb = head || t < 0.03 || step < 4 ? 0 : 1 + phase * F.reach;
        const w = Math.round(body + barb), inner = Math.round(body);
        for (let a = 0; a <= w; a++) for (const side of a ? [-1, 1] : [1]) {
          const z = a * side, thick = a <= inner - 1 ? 1 : a <= inner + 1 ? 1 : 0;
          for (let x = -thick; x <= thick; x++) {
            const face = Math.abs(x) === thick;
            let c;
            if (a > inner || a === inner) c = orange(y, z);
            else if (head && a >= inner - 1) c = orange(y, z);
            else if ((a === 1 || a === 2) && face && t > 0.04 && t < 0.94 && inner > 3) c = LINE + (hash(y, z) > 0.75 ? 1 : 0);
            else c = black(y, z);
            // Each barb's upper edge a darker orange, so the saw reads tooth by tooth.
            if (a > inner && !head && phase > 0.85) c = EDGE + 2;
            vox.set(x, y, z, c);
          }
        }
      }
      // The crossguard: five rows, widest at its middle, its ends drawn to points, edged in orange all round, an
      // orange diamond with a black heart at its middle.
      const G0 = F.guard[0], GM = 6.5, HALF = [8, 12, 16, 16, 12, 8];
      for (let y = G0; y <= F.guard[1]; y++) {
        const half = HALF[y - G0], dy = Math.abs(y - GM);
        for (let z = -half; z <= half; z++) {
          const a = Math.abs(z), rim = a >= half - 1 || y === G0 || y === F.guard[1], gem = a + dy <= 3;
          for (let x = a < 9 ? -1 : 0; x <= (a < 9 ? 1 : 0); x++) vox.set(x, y, z, gem ? (a + dy < 1.6 ? BLACK : LINE) : rim ? orange(y, z) : IRON);
        }
      }
      // The points past its ends, and the little horns up toward the blade.
      for (const side of [-1, 1]) { for (const y of [6, 7]) { vox.set(0, y, side * 17, EDGE); vox.set(0, y, side * 18, EDGE + 2); } vox.set(0, F.guard[1] + 1, side * 10, EDGE); vox.set(0, F.guard[1] + 2, side * 11, EDGE + 2); vox.set(0, G0 - 1, side * 7, EDGE + 2); vox.set(0, G0 - 2, side * 8, EDGE + 2); }
      // The grip: black, an orange band winding up it.
      const RING = [[-1, -2], [0, -2], [1, -2], [2, -1], [2, 0], [2, 1], [1, 2], [0, 2], [-1, 2], [-2, 1], [-2, 0], [-2, -1]];
      for (let y = F.grip[0]; y <= F.grip[1]; y++) {
        for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) vox.set(x, y, z, GRIP);
        RING.forEach(([x, z], i) => vox.set(x, y, z, ((y - F.grip[0]) * 3 + i) % 12 < 5 ? EDGE + (i & 1) : GRIP));
      }
      // The pommel: a black collar and an orange ball under it.
      const P0 = F.grip[0] - 1;
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) + Math.abs(z) < 4) vox.set(x, P0, z, IRON);
      for (let k = 1; k <= 7; k++) {
        const r = Math.sqrt(Math.max(0, 3.7 * 3.7 - (k - 4) * (k - 4)));
        for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (Math.hypot(x, z) <= r) vox.set(x, P0 - k, z, BALL + (hash(x + k, z) > 0.7 ? 1 : 0));
      }
      const u = h / 16 * F.cell;
      g = Object.assign(models.voxelGeometry(vox, { unit: u, palette: FROST_HEX, origin: { x: -u / 2, y: 0, z: -u / 2 }, emissive: { 3: 1, 4: 1, 5: 0.55, 6: 0.5, 7: 0.3, 8: 0.5, 9: 0.3 } }), { slingTurn: Math.PI / 2, slingHiltUp: true });
    } else if (id === "dagger") {
      g = orangeArm("dagger", h);
    } else if (id === "wand") {
      g = orangeArm("wand", h);
    } else if (id === "staff") {
      g = orangeArm("staff", h);
    } else if (id === "axe") {
      // The maul, from the maintainer's art, in the axe's place: a great black drum of a head on the end of the haft,
      // its axis along it, banded in orange near each end and studded all round with orange spikes, its far face
      // stepped in orange rings round a raised orange boss; a black neck of stacked collars; a haft banded orange and
      // black; and a round orange pommel. In sixteenths of the Ooga's height, the grip at the origin, the head up +y.
      const OR = "#f26a1b", OR_D = "#c24e10", BK = "#1b1a1e", BK_L = "#2c2b31", BK_D = "#111014", RING = (r0, r1, y0, y1, color, seg = 18) => lathe({ profile: [[r0, y0], [r1, y0], [r1, y1], [r0, y1]], segments: seg, color });
      const parts = [];
      // The pommel and the collar over it.
      parts.push(lathe({ profile: [[0, -3.1], [0.45, -3.05], [0.7, -2.8], [0.75, -2.45], [0.6, -2.15], [0.35, -2.0]], segments: 12, color: OR }));
      parts.push(RING(0, 0.45, -2.05, -1.75, BK, 10));
      // The haft, banded orange and black.
      for (let y = -1.75, i = 0; y < 6.8; y += 0.55, i++) parts.push(RING(0, 0.3, y, Math.min(6.8, y + 0.55), i % 2 ? BK : OR, 10));
      // The neck: stacked black collars widening up to the head.
      [[6.8, 7.25, 0.52], [7.25, 7.5, 0.42], [7.5, 8.0, 0.68], [8.0, 8.25, 0.56], [8.25, 8.7, 0.85]].forEach(([y0, y1, r], i) => parts.push(RING(0, r, y0, y1, i % 2 ? BK_D : BK_L, 12)));
      // The drum: its body, a heavy rim at each end, an orange band inside each rim.
      const R = 2.9, Y0 = 8.7, Y1 = 13.6;
      parts.push(RING(0, R, Y0 + 0.4, Y1 - 0.4, BK, 20));
      parts.push(RING(0, R + 0.3, Y0, Y0 + 0.65, BK_L, 20), RING(0, R + 0.3, Y1 - 0.65, Y1, BK_L, 20));
      parts.push(RING(R - 0.2, R + 0.12, Y0 + 1.05, Y0 + 1.4, OR, 20), RING(R - 0.2, R + 0.12, Y1 - 1.4, Y1 - 1.05, OR, 20));
      // The far face: rings stepping in, orange and black, to a raised orange boss.
      parts.push(RING(0, 2.3, Y1, Y1 + 0.2, OR_D, 18), RING(0, 1.75, Y1 + 0.2, Y1 + 0.4, BK_D, 16), RING(0, 1.3, Y1 + 0.4, Y1 + 0.65, OR, 14), RING(0, 0.75, Y1 + 0.65, Y1 + 0.95, OR_D, 12));
      // The spikes: orange cones out of the drum, three rings of them staggered round it.
      const spike = (a, y, len, base) => moved(models.turnedY(turnedZ(lathe({ profile: [[base, 0], [base * 0.55, len * 0.55], [0, len]], segments: 6, color: OR }), -Math.PI / 2), -a), Math.cos(a) * (R - 0.15), y, Math.sin(a) * (R - 0.15));
      for (let i = 0; i < 9; i++) {
        parts.push(spike(i / 9 * Math.PI * 2, Y0 + 2.0, 1.25, 0.42));
        parts.push(spike((i + 0.5) / 9 * Math.PI * 2, (Y0 + Y1) / 2 + 0.3, 1.5, 0.48));
        parts.push(spike(i / 9 * Math.PI * 2 + 0.2, Y1 - 1.9, 1.15, 0.4));
      }
      // Drawn 1.755 times those sixteenths, so it is a great weapon in the Ooga's hands.
      g = Object.assign(H.scaled(merge(...parts), h / 16 * MAUL_SCALE), { slingTurn: Math.PI / 2 });
    } else {
      const IRON_K = "#2a2b30", BLACK = "#17161a", ORANGE = "#f7931a";
      H.loft(geo, [[-2.1, 0.36, 0.36, 0.12], [0.8, 0.34, 0.34, 0.12]], BLACK);
      H.loft(geo, [[0.8, 0.3, 0.3, 0.1], [11.2, 0.28, 0.28, 0.1]], "#4a2e1a", [false, true]);
      const s16 = (w, hh, d, color, y, z) => box({ w, h: hh, d, color, offset: { x: 0, y, z } });
      g = Object.assign(H.scaled(merge(geo, s16(0.8, 2.4, 1.0, IRON_K, 9.9, 0), s16(0.5, 0.9, 1.1, IRON_K, 9.9, -0.95),
        s16(0.34, 2.2, 1.4, BLACK, 9.9, 1.2), s16(0.3, 3.4, 1.0, BLACK, 9.7, 2.3), s16(0.26, 4.4, 0.55, BLACK, 9.5, 3.05), s16(0.22, 4.8, 0.3, ORANGE, 9.45, 3.45),
        s16(0.36, 0.3, 1.2, ORANGE, 11.0, 0.9), s16(0.36, 0.3, 1.2, ORANGE, 8.8, 0.9)), h / 16), { slingTurn: Math.PI / 2 });
    }
    KEEP_ARMS.set(key, g);
    return g;
  };
  // A banana an enemy leaves where it fell: larger than life, bright yellow and glowing, its stalk and tip brown.
  const dropBanana = cached(() => models.tube({
    rings: 8, segments: 6, emissive: 0.6,
    path: (t) => { const a = (t - 0.5) * 2; return { x: Math.sin(a) * 0.55, y: (1 - Math.cos(a)) * 0.55 + 0.1, z: 0 }; },
    radius: (t) => 0.1 * Math.pow(Math.sin(Math.PI * t), 0.55) + 0.014,
    colorFn: (t) => t < 0.08 || t > 0.92 ? "#7a5420" : t < 0.18 || t > 0.82 ? "#ffe94a" : "#fff04a"
  }));
  // Eryk's crystal, waiting on the small island's far beach: a cluster of glowing orange shards, six-sided and pointed,
  // leaning out of a low dark rock, with a paler heart up the tallest. Its foot at the origin.
  const questCrystal = cached(() => {
    const OR = "#ff8a1f", OR_L = "#ffc77a", OR_D = "#d9600f";
    const shard = (len, r, tilt, a, x, z, color, emissive = 0.9) => moved(models.turnedY(turnedZ(lathe({ profile: [[0, 0], [r, 0.04], [r * 0.95, len * 0.75], [0, len]], segments: 6, color, emissive }), tilt), a), x, 0.12, z);
    return noShadow(merge(
      lathe({ profile: [[0, 0], [0.55, 0.02], [0.62, 0.12], [0.46, 0.22], [0, 0.26]], segments: 7, color: "#2c2926" }),
      shard(1.1, 0.16, 0, 0, 0, 0, OR), shard(0.9, 0.07, 0, 0, 0, 0, OR_L, 1),
      shard(0.75, 0.12, 0.45, 0.3, 0.12, 0.05, OR_D), shard(0.65, 0.11, 0.5, 2.4, -0.1, 0.08, OR), shard(0.55, 0.1, 0.55, 4.3, 0.02, -0.12, OR_L)
    ));
  });
  // What the ogre's axe throws up where it lands: `rocks`, chunks of the islet's dark stone in three sizes, and `dust`,
  // the grey puffs that roll out from it (the scene's particles).
  const smash = cached(() => ({
    rocks: [["#2f2c2a", 0.3, 0.24, 0.26], ["#45413d", 0.2, 0.16, 0.22], ["#1f1d1c", 0.13, 0.12, 0.12], ["#5a554f", 0.16, 0.2, 0.14]].map(([color, w, h, d]) => box({ w, h, d, color })),
    dust: [["#6f6a64", 0.5], ["#8a857e", 0.38], ["#57524d", 0.62]].map(([color, w]) => box({ w, h: w * 0.8, d: w, color })),
  }));
  // The knight, every one in the Keep (the court's two that turn on their plinths, the rooftop's guardians): tall, in
  // bone-white plate laid in lames, a flat-topped great helm with a ridge down its front, one
  // long eye slit and breaths under it, great round pauldrons, both gauntlets folded over the hilt of a dark sword stood
  // point down before him, an orange mantle round his neck and shoulders, a cape of the same down his back flaring at
  // the ground, a leather belt and a tattered orange tabard hanging from it. Cut in voxels `KNIGHT_UNIT` across, so he
  // stands as tall as the knights' plinths and the rooftop's guard posts were laid out for (3.2 m), his feet
  // at the origin, facing +z. `eyes` is the glow behind his eye slit, a part of its own in red and in orange.
  const KNIGHT_UNIT = 3.2 / 74;
  const PALE_HEX = [null, "#d8cfc1", "#c3b9aa", "#a39989", "#857b6e", "#17130f", "#d9822f", "#b5631f", "#93501a", "#7a4a26", "#9a5a2a", "#4f4944", "#6b635b", "#e6dfd3", "#ff7a1a", "#ff9a3a"];
  const DARK_PLATE = { 1: "#2b2b30", 2: "#222226", 3: "#18181b", 4: "#101012", 13: "#3a3a41" };
  const knight = cached(() => {
    const W = 44, H = 84, D = 30, { g, K, fill, both, speck, speckBoth } = guardTools(W, H, D);
    const AL = 1, AM = 2, AS = 3, AD = 4, VOID = 5, OR = 6, OR_D = 7, OR_S = 8, BELT = 9, BELT_L = 10, IRON_D = 11, IRON = 12, AH = 13, HOT = 14, HOT_L = 15, PLATE = [1, 1, 2, 1, 13];
    // The cape is cloth of its own (`knightCape`), hung from the shoulders by the scene and stirred in the wind.
    // Sabatons in three stepped plates, greaves ridged down the shin and banded, knee cops, and the thighs.
    both(12, 19, 0, 1, 8, 23, AM); both(12, 19, 2, 3, 9, 21, AL); both(13, 19, 4, 5, 10, 19, AM); both(13, 18, 0, 0, 24, 24, AS);
    speckBoth(13, 19, 6, 17, 10, 17, PLATE, 3, 1); both(15, 17, 6, 17, 18, 18, AH); both(13, 19, 9, 9, 10, 18, AS); both(13, 19, 13, 13, 10, 18, AS);
    both(12, 20, 18, 21, 9, 19, AL); both(14, 18, 19, 20, 20, 20, AM); both(12, 20, 18, 18, 9, 19, AS);
    speckBoth(13, 20, 22, 27, 9, 18, PLATE, 3, 4); both(12, 20, 28, 31, 8, 19, AL); both(12, 20, 28, 28, 8, 19, AS); both(12, 20, 25, 25, 9, 19, AS);
    // The tabard's tatters from the belt, the belt and its buckle, and the fauld over them.
    for (const [x, y] of [[22, 16], [24, 12], [26, 15], [28, 19], [20, 20], [18, 23]]) { fill(x, x + 1, y, 33, 19, 20, (x >> 1) & 1 ? OR : OR_D); fill(x, x + 1, y, y + 1, 19, 20, OR_S); }
    fill(11, 32, 32, 34, 8, 19, BELT); fill(11, 32, 35, 35, 8, 19, BELT_L); fill(11, 32, 32, 32, 7, 20, OR_S); fill(20, 23, 32, 34, 20, 20, IRON_D);
    speck(12, 31, 36, 39, 8, 19, PLATE, 3, 7); fill(12, 31, 36, 36, 8, 19, AS);
    // The breastplate in lames, and the mantle: round the neck, over the shoulders and down the chest to a point.
    speck(11, 32, 40, 51, 8, 19, PLATE, 3, 9); speck(13, 30, 42, 50, 20, 20, PLATE, 3, 11); fill(13, 30, 43, 43, 20, 20, AS); fill(13, 30, 47, 47, 20, 20, AS);
    fill(10, 33, 52, 55, 7, 20, OR); fill(13, 30, 56, 57, 8, 19, OR_D); fill(14, 29, 48, 51, 20, 21, OR); fill(16, 27, 46, 47, 21, 21, OR_D); fill(19, 24, 44, 45, 21, 21, OR_S);
    fill(10, 33, 52, 52, 7, 20, OR_D); for (const x of [11, 16, 26, 31]) fill(x, x + 1, 50, 51, 20, 20, OR_D);
    // The pauldrons: great rounded caps in stepped lames.
    for (const sx of [0, 1]) K.shape(sx ? W - 14 : 1, sx ? W - 1 : 14, 44, 59, 5, 23, (x, y, z) => { const cx = sx ? W - 8 : 8; return ((x + 0.5 - cx) / 6.6) ** 2 + ((y + 0.5 - 51) / 7.2) ** 2 + ((z + 0.5 - 13.5) / 8.2) ** 2 <= 1; }, (x, y) => y % 4 === 0 ? AS : (y >> 2) & 1 ? AL : AH);
    // The arms: upper plates, elbow cops, and the forearms brought in to the hilt.
    both(5, 10, 39, 45, 10, 17, AM); both(4, 11, 36, 39, 9, 18, AL); both(4, 11, 36, 36, 9, 18, AS);
    both(8, 14, 36, 41, 15, 22, AM); both(8, 14, 38, 38, 15, 22, AS); both(13, 19, 37, 42, 19, 25, AL); both(13, 19, 39, 39, 19, 25, AS);
    // The sword: its dark blade and fuller, the cross with its ends turned down, the pommel, and the gauntlets
    // folded one over the other on the grip.
    fill(20, 23, 1, 33, 24, 25, IRON_D); fill(21, 22, 3, 32, 26, 26, IRON); fill(21, 22, 0, 0, 24, 25, IRON_D);
    fill(14, 29, 34, 35, 23, 26, IRON_D); both(14, 15, 32, 33, 23, 26, IRON_D);
    speck(16, 27, 36, 43, 22, 27, [1, 13, 1, 2], 2, 13); fill(16, 27, 39, 39, 22, 27, AS); fill(21, 22, 37, 42, 28, 28, AM); fill(16, 27, 43, 43, 22, 27, AH);
    fill(20, 23, 44, 46, 23, 26, IRON_D); fill(21, 22, 47, 47, 24, 25, IRON);
    // The great helm: a tall flat-topped bucket, its ridge, the long eye slit, the breaths under it either side and a
    // seam down each side.
    speck(14, 29, 56, 72, 8, 21, PLATE, 4, 15); fill(15, 28, 73, 73, 9, 20, AH); fill(14, 29, 72, 72, 8, 21, AL); fill(14, 29, 56, 56, 7, 22, AS);
    fill(14, 29, 64, 64, 22, 22, AM); fill(15, 28, 57, 63, 22, 22, AL); fill(15, 28, 68, 71, 22, 22, AL);
    fill(15, 28, 65, 67, 22, 22, AM); both(15, 20, 66, 67, 22, 22, VOID); both(15, 20, 66, 67, 21, 21, VOID);
    fill(21, 22, 57, 72, 22, 23, AH);
    for (const x of [16, 18]) for (const y of [58, 60, 62]) both(x, x, y, y + 1, 22, 22, VOID);
    both(14, 14, 58, 71, 14, 14, AD); both(14, 14, 58, 71, 15, 15, AS);
    // An orange mohawk standing up from the helm's crown front to back, a ragged row of spikes tallest over the middle,
    // its tips paler.
    for (let z = 9; z <= 21; z++) {
      const t = (z - 9) / 12, h = Math.round(4 + 5 * Math.sin(Math.PI * (0.15 + 0.75 * t)) + ((z * 7) % 3) - 1);
      fill(20, 23, 74, 74 + Math.max(1, h - 3), z, z, z & 1 ? HOT : OR);
      fill(21, 22, 74, 74 + h, z, z, z & 1 ? OR : HOT);
      fill(21, 22, 74 + h, 74 + h, z, z, HOT_L);
    }
    const u = KNIGHT_UNIT, body = T.gridGeometry(g, { unit: u, palette: PALE_HEX.map((c) => c && hexToRgb(c)), origin: { x: -W / 2 * u, y: 0, z: -14 * u } });
    const eyes = (color) => noShadow(merge(...[-1, 1].map((sx) => box({ w: 5.6 * u, h: 1.8 * u, d: 0.03, color, emissive: 1, offset: { x: sx * 3.9 * u, y: 67 * u, z: 9.15 * u } }))));
    // The merchant's: the same knight with his plate in black, the orange kept.
    const dark = T.gridGeometry(g, { unit: u, palette: PALE_HEX.map((c, i) => c && hexToRgb(DARK_PLATE[i] || c)), origin: { x: -W / 2 * u, y: 0, z: -14 * u } });
    return { body, dark, eyes: [eyes("#ff2a1f"), eyes("#ff8a1e")] };
  });
  // A knight's cape, in the knight's own frame at its size from `knight` (3.2 m): orange cloth hung from the back of the
  // shoulders (`KNIGHT_CAPE.at`), flaring a little toward its foot, in `KNIGHT_CAPE.strips` strips one under another,
  // each a part about its own top edge as a banner's are (the scene hangs each from the one over it and stirs them),
  // darker folds down it, the Ooga Booga logo in black on its back, and its foot torn into a ragged fringe of tatters.
  const KNIGHT_CAPE = { at: { y: 55.5 * KNIGHT_UNIT, z: -9.2 * KNIGHT_UNIT }, w0: 1.02, w1: 1.34, h: 2.05, strips: 8 };
  const knightCape = cached(() => {
    const C = KNIGHT_CAPE, sh = C.h / C.strips, strips = Array.from({ length: C.strips }, () => []), rand = mulberry32(5521);
    const OR = "#e06a1f", OR_D = "#b84f13", OR_L = "#f2873a";
    const widthAt = (y) => C.w0 + (C.w1 - C.w0) * Math.min(1, y / C.h);
    for (let k = 0; k < C.strips - 1; k++) {
      const parts = strips[k], w = widthAt((k + 0.5) * sh);
      parts.push(box({ w, h: sh + 0.004, d: 0.035, color: k & 1 ? OR : OR_L, offset: { y: -sh / 2 } }));
      // Folds: darker bands down the cloth.
      for (let f = -2; f <= 2; f++) parts.push(box({ w: 0.07, h: sh + 0.004, d: 0.04, color: OR_D, offset: { x: f * w / 5.2, y: -sh / 2, z: -0.004 } }));
    }
    // The foot, torn into tatters each its own length.
    const cols = 16, w = C.w1, cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const r = rand(), len = sh * (r < 0.2 ? 0.35 + rand() * 0.25 : r > 0.8 ? 1.3 + rand() * 0.6 : 0.65 + rand() * 0.5), tw = cw * (0.7 + rand() * 0.3);
      strips[C.strips - 1].push(box({ w: tw, h: len, d: 0.035, color: i & 1 ? OR : OR_D, offset: { x: -w / 2 + (i + 0.5) * cw, y: -len / 2 + 0.002 } }));
      if (rand() > 0.6) strips[C.strips - 1].push(box({ w: tw * 0.5, h: len * 0.3, d: 0.035, color: OR_D, offset: { x: -w / 2 + (i + 0.5) * cw, y: -len - len * 0.15 } }));
    }
    // The logo on its back (the cape's outer face, -z), read the right way round from behind.
    const px = 0.82 / SAIL_LOGO[0].length, mid = (SAIL_LOGO[0].length - 1) / 2, top = 0.38;
    SAIL_LOGO.forEach((line, r) => {
      const y = top + (r + 0.5) * px, k = Math.floor(y / sh);
      if (k < 0 || k >= C.strips - 1) return;
      const ly = -(y - k * sh);
      for (let c = 0; c < line.length;) {
        if (line[c] !== "X") { c++; continue; }
        let e = c;
        while (e + 1 < line.length && line[e + 1] === "X") e++;
        strips[k].push(box({ w: (e - c + 1) * px + 0.002, h: px + 0.002, d: 0.01, color: "#141216", offset: { x: -((c + e) / 2 - mid) * px, y: ly, z: -0.024 } }));
        c = e + 1;
      }
    });
    return { strips: strips.map((p) => merge(...p)), strip: sh };
  });
  // The dust that circles a knight's feet, in red and in orange (`lit` 0 or 1).
  const dust = variants((lit) => noShadow(box({ w: 0.07, h: 0.07, d: 0.07, color: lit ? "#ff9a2e" : "#ff3a2e", emissive: 1 })));
  // A knight's plinth, a part: a turned drum in the knight's own bone white, its top `SENTINEL_FOOT` up.
  const SENTINEL_FOOT = 0.92;
  const sentinelPlinth = cached(() => shaded([
    turn([[1.16, 0], [1.16, 0.16], [1.02, 0.24], [0.98, 0.7], [1.08, 0.78], [1.08, SENTINEL_FOOT], [0, SENTINEL_FOOT]], 12, PALE_HEX[2]),
    moved(turn([[0.9, 0], [0.9, 0.02], [0, 0.02]], 12, PALE_HEX[1]), 0, SENTINEL_FOOT, 0)
  ]));
  const firefly = cached(() => noShadow(box({ w: 0.07, h: 0.07, d: 0.07, color: "#d6ff7a", emissive: 1 })));
  // The yard's flags, in the land's frame.
  const yard = cached(() => paved((x, z) => L.inYard(x, z, -0.35) || Math.abs(x) < GATE.passage && z > GATE.back - 1 && z < GATE.back + 0.5, -YARD.half, YARD.half, CZ - YARD.halfZ, GATE.back + 0.5, 1.55, 5507));
  // The arena's gargoyle with its eyes burning red, not the hunt's green.
  const gargoyle = cached(() => {
    const g = BL.hauntModels.gargoyle(), red = hexToRgb("#ff2a1f");
    return { ...g, faces: g.faces.map((f) => f.emissive ? { ...f, color: red } : f) };
  });
  // A crow on the wing, a part facing +z: its wings up, level or down (`pose` 0 to 2).
  const crow = variants((pose) => {
    const a = (pose - 1) * 0.55, INK = "#0a0b0e", wing = (s) => moved(turnedZ(box({ w: 0.72, h: 0.035, d: 0.3, color: INK, offset: { x: s * 0.4 } }), s * a), 0, 0.03, 0);
    return noShadow(merge(box({ w: 0.15, h: 0.13, d: 0.56, color: INK }), box({ w: 0.08, h: 0.07, d: 0.14, color: "#1b1c21", offset: { z: 0.33 } }), wing(1), wing(-1)));
  });
  // An iron bracket on a wall, a part: its plate on z 0, its arm reaching out along +z to a hook `BRACKET` out, level
  // with the origin.
  const BRACKET = 0.55;
  const wallBracket = cached(() => merge(box({ w: 0.16, h: 0.4, d: 0.04, color: IRON, offset: { y: -0.1, z: 0.02 } }), box({ w: 0.07, h: 0.07, d: BRACKET + 0.06, color: IRON, offset: { y: 0.03, z: BRACKET / 2 } }),
    beam(0, -0.26, 0.04, 0, 0, BRACKET - 0.1, 0.045, IRON)));

  // Everything heavy, built in slices behind the fade: the terrain and each of the castle's voxel parts.
  const buildSteps = function* () {
    yield* awaitFont();
    // The land's snapshot, if this build has one: asked for now, waited on, and let go when the build is over.
    if (BL.keepSnapshot) { BL.keepSnapshot.begin(); while (!BL.keepSnapshot.settled) yield; }
    const slice = { until: 0, budget: BL.buildTasks.SLICE_MS, work: 0 };
    yield* terrain(0).steps(slice);
    yield* terrain(1).steps(slice);
    yield* terrain(2).steps(slice);
    yield* volcanoCone.steps(slice);
    yield* terrain(3).steps(slice);
    yield* terrain(4).steps(slice);
    for (let i = 0; i < L.STORJ.mountains.length; i++) yield* storjMountain(i).steps(slice);
    yield* pause(slice);
    storjWays();
    yield* pause(slice);
    storjForest();
    yield* storjDock.steps(slice);
    stoneKnight(); storjPlinth(); storjCave(); storjTower();
    yield* wall(0).steps(slice);
    yield* wall(1).steps(slice);
    yield* wall(2).steps(slice);
    yield* wall(3).steps(slice);
    yield* tower(0).steps(slice);
    yield* tower(1).steps(slice);
    yield* gatehouse.steps(slice);
    yield* keep.steps(slice);
    yield* keepSpire.steps(slice);
    yield* balcony.steps(slice);
    yield* warship.steps(slice);
    yield* westBridge.steps(slice);
    yield* backBridge.steps(slice);
    yield* shipyard.steps(slice);
    yield* galleon.steps(slice);
    yield* pause(slice);
    yield* armoryDock.steps(slice);
    yield* volcanoDock.steps(slice);
    yield* terrain(5).steps(slice);
    yield* shardsDock.steps(slice);
    yield* terrain(6).steps(slice);
    for (let i = 4; i < 8; i++) yield* wall(i).steps(slice);
    yield* outpostBridge.steps(slice);
    yield* outpostDocks.steps(slice);
    yield* pause(slice);
    shardsWays();
    if (BL.repoIslandModels) { yield* pause(slice); shardsCrystals(); }
    cbdcWall();
    longhouse(); barkeep(); shipwright(); smith(); alchemist(); westPortcullis();
    for (const kind of Object.keys(YARD_PROPS)) { yield* pause(slice); yardProp(kind); }
    banner();
    yield* porch.steps(slice);
    yield* pause(slice);
    plinth(); towerSkirt();
    yield* pause(slice);
    stairs(); dock(); abutment(); boat();
    yield* pause(slice);
    ruin(); flags(); yard(); forest();
    for (let i = 0; i < 4; i++) { yield* pause(slice); pine(i); farPine(i); }
    if (BL.keepSnapshot) BL.keepSnapshot.finish();
  };

  // ---------- the ferry ----------
  // The rowboat, in its own frame: its bow toward +z, the waterline at y 0. Its hull is clinker planked in voxels a
  // twentieth of a metre across, full in the bow, square at its transom and rising at both ends: tarred below the
  // waterline, strakes of warm oak over it, an oxblood sheer strake under a cream line and a dark gunwale cap, ribs and
  // knees inside, three thwarts, and floorboards laid over a sealed bottom above the waterline, so no sea stands inside
  // it. Its bow post curves up and out to the iron hook its lantern hangs from. `BOAT` says where its parts are: the
  // passenger's bench (`seat`, its top), the rower's, each oarlock and the lantern's hook.
  const BOAT = { seat: { z: -1.45, y: 0.34 }, rower: { z: 0.25, y: 0.34 }, oarlock: { x: 0.86, y: 0.58, z: 0.3 }, hook: { x: 0, y: 1.95, z: 3.05 }, beam: 0.9, length: 4.9 };
  const BOAT_HEX = [null, "#6a4a2d", "#61432a", "#3a2a1c", "#2a1e15", "#7b5a3a", "#22252b", "#1b1511", "#5c1d16", "#b8a77e"];
  const boat = cached(() => {
    const u = 0.05, HX = 20, Z0 = -2.45, NZ = 102, Y0 = -0.3, NY = 24, g = T.makeGrid(2 * HX, NY, NZ), K = tools(g);
    const OAK1 = 1, OAK2 = 2, RIBC = 3, CAP = 4, BOARD = 5, TAR = 7, OXB = 8, CREAM = 9;
    const MID = 0.1, BOW = 2.5, STERN = -2.3, FLOOR = 0.12;
    const tb = (zm) => zm > MID ? (zm - MID) / (BOW - MID) : 0, ts = (zm) => zm < MID ? (MID - zm) / (MID - STERN) : 0;
    const half = (zm) => zm > BOW || zm < STERN ? 0 : zm > MID ? 0.9 * Math.pow(Math.max(0, 1 - Math.pow(tb(zm), 2.1)), 0.6) : 0.9 * (1 - 0.36 * Math.pow(ts(zm), 2.5));
    const keel = (zm) => -0.22 + 0.2 * tb(zm) ** 2 + 0.09 * ts(zm) ** 2;
    const sheer = (zm) => 0.52 + 0.24 * tb(zm) ** 2.2 + 0.1 * ts(zm) ** 2;
    const width = (zm, y) => half(zm) * Math.min(1, Math.pow(Math.max(0, (y - keel(zm)) / (sheer(zm) - keel(zm))), 0.36));
    for (let iz = 0; iz < NZ; iz++) {
      const zm = Z0 + (iz + 0.5) * u, k = keel(zm), sh = sheer(zm), rib = Math.abs(((zm + 2.3) / 0.34) % 1 - 0.5) > 0.42;
      if (half(zm) <= 0) continue;
      for (let iy = 0; iy < NY; iy++) {
        const y = Y0 + (iy + 0.5) * u;
        if (y < k || y > sh + u) continue;
        for (let ix = 0; ix < 2 * HX; ix++) {
          const ax = Math.abs((ix + 0.5 - HX) * u), w = width(zm, Math.min(y, sh));
          if (y > sh) { if (ax <= w + 0.035 && ax > w - 0.06) K.set(ix, iy, iz, CAP); continue; }
          if (ax > w) continue;
          const shell = ax > w - 0.065 || y < k + 0.07 || zm < STERN + 0.07 || zm > BOW - 0.12;
          if (shell) {
            // Strakes a hand and a half wide by height alone, so the curve's steps never speckle them.
            const band = Math.floor((y - 0.02) / 0.15);
            K.set(ix, iy, iz, y < 0.02 ? TAR : y > sh - 0.08 ? OXB : y > sh - 0.12 ? CREAM : band & 1 ? OAK1 : OAK2);
          } else if (y < FLOOR) K.set(ix, iy, iz, Math.floor(ax / 0.11) & 1 ? BOARD : OAK2);
          else if (rib && ax > w - 0.11) K.set(ix, iy, iz, RIBC);
        }
      }
    }
    // The thwarts, each on a knee either side, and the stern sheets.
    for (const [z0, z1, top] of [[0.13, 0.4, 0.34], [-1.62, -1.25, 0.34], [1.55, 1.75, 0.38]]) for (let iz = 0; iz < NZ; iz++) {
      const zm = Z0 + (iz + 0.5) * u;
      if (zm < z0 || zm > z1) continue;
      for (let iy = 0; iy < NY; iy++) {
        const y = Y0 + (iy + 0.5) * u;
        if (y > top || y < FLOOR) continue;
        for (let ix = 0; ix < 2 * HX; ix++) { const ax = Math.abs((ix + 0.5 - HX) * u), w = width(zm, y); if (ax <= w - 0.03 && (y > top - 0.05 || ax > w - 0.12 || ax < 0.04)) K.set(ix, iy, iz, y > top - 0.05 ? BOARD : RIBC); }
      }
    }
    const hull = T.gridGeometry(g, { unit: u, palette: BOAT_HEX.map((c) => c && hexToRgb(c)), origin: { x: -HX * u, y: Y0, z: Z0 } });
    // The bow post curving up and out to its hook, the oarlocks on their pads and an iron ring at the stern.
    const H = BOAT.hook, wood = BOAT_HEX[4], iron = BOAT_HEX[6], parts = [hull];
    const curve = [[0, 0.5, 2.42], [0, 0.95, 2.54], [0, 1.4, 2.66], [0, 1.78, 2.8], [0, 2.02, 2.94], [0, 2.02, H.z]];
    for (let i = 0; i + 1 < curve.length; i++) parts.push(beam(...curve[i], ...curve[i + 1], 0.085 - i * 0.008, wood));
    parts.push(beam(0, 2.02, H.z, 0, H.y, H.z, 0.022, iron), moved(torus(0.05, 0.012, iron, 0, 10, 4), 0, H.y - 0.04, H.z));
    for (const sx of [-1, 1]) parts.push(box({ w: 0.12, h: 0.05, d: 0.3, color: wood, offset: { x: sx * (BOAT.oarlock.x - 0.02), y: BOAT.oarlock.y - 0.07, z: BOAT.oarlock.z } }),
      box({ w: 0.03, h: 0.14, d: 0.03, color: iron, offset: { x: sx * BOAT.oarlock.x, y: BOAT.oarlock.y, z: BOAT.oarlock.z - 0.05 } }), box({ w: 0.03, h: 0.14, d: 0.03, color: iron, offset: { x: sx * BOAT.oarlock.x, y: BOAT.oarlock.y, z: BOAT.oarlock.z + 0.05 } }));
    parts.push(moved(turnedX(torus(0.06, 0.014, iron, 0, 10, 4), Math.PI / 2), 0, 0.42, STERN - 0.03));
    return merge(...parts);
  });
  // The dragon longship, from the maintainer's concept art, in its own frame (keep-layout.js `LONGSHIP`; each ship
  // stands it at its own scale): its bow toward +z, the waterline at y 0. `hull` is cut in voxels 0.4 m across: a long clinker hull,
  // black at both ends and striped orange and black amidships, its sheer sweeping up to a curled stern post and to the
  // dragon at the prow, black-horned and orange-scaled, its eyes and open jaws lit from within, teeth bared, a crest of
  // orange spines down the bow, and a lit deckhouse aft. `rig` is the mast, its yard and the chains to bow, stern and
  // rails, with two fire bowls on the deck; `sail` the great square sail bellied out on blocks, orange and black in
  // broad stripes with the Ooga Booga logo in white on the black field at its middle (both faces, `SAIL_LOGO`); `shields` the round shields
  // along both rails, orange and black by turns with white bosses. `WARSHIP_LIGHTS` are where its fires burn.
  const WARSHIP_HEX = [null, "#0c0b0d", "#17151a", "#d9611a", "#b84d14", "#ef7a26", "#2a2118", "#33281d", "#f1ece2", "#ffb030", "#ffd86a", "#231a14", "#3a2a1c",
    // 13-15 a raider's gargoyle's stone, 16 its green eyes.
    "#4a4d52", "#3c3f44", "#5c6066", "#5dff6a"];
  // The Ooga Booga logo for the sail, a cell a block, in white on its black field.
  const SAIL_LOGO = [
    ".....................................XXXXX..............................................",
    "......................................XXXXX.........XXX.................................",
    ".......................................XXXXX......XXXXXXX...............................",
    "...............................X.....XXXXXXX....XXXXX...................................",
    ".........................XXXXXXXXXXX..XXXXXXXX.XXXXX....................................",
    ".......................XXXXXXXXXXXXXXXXXXXXXXXXXXXX.....................................",
    ".....................XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..............................",
    "...........................XXXXXXXXXXXXXXXXXXXXXXXXXXX..................................",
    "...........................XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..............................",
    "...........................XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.............................",
    "........................XXXXXXXXXXXXXXXXXXXXX...XXXXXXXXXXXXX...........................",
    ".......................XXXXXXXXXXXXX.XXX.........XXXXXXXX...X...........................",
    "....................XXXXXXXXXXXXXX..XXX............XXXXXXX..............................",
    "...................XXXXXXXXXXXXXX...X...............XXXXXXX.............................",
    ".................XXXXXXXXXXXXXXX.....................XXX..XX............................",
    "................XXXXXXXXXXXXXXX......................XXX................................",
    "................X...XXXXXXXXXXX........................XX...............................",
    "..................XXXXXXXXXXX...........................XXXXXXX.........................",
    ".................XXXXXXXXXXX.........XXXXXXXXX.XX....XXXXXXXXXXX........................",
    "................XXXXXXXXXXXX.......XXXXXXXXXXXXXX.X.XXXXXXXXXXXXX.......................",
    "..............XXXX..XXXXXXXX.....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.......................",
    "............XXX....XXXXXXXXX....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.......................",
    "..................XXXXXXXXXX...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.......................",
    ".................XXXXXXXXXXX...XXXXXXXXXXXXXXXXXX..XXXXXXXXXXXXX........................",
    "..............XXXXXXXXXXXXXXX..XXXXXXXXXXXXXXXX.....X.......XXXX........................",
    "............XXXXXXXXXXXXXXXXX...XXXXXXXX....XX......X.......XX..........................",
    "...........XXXXXXXXXXXXXXXXXX...XXXXXX...............XXX....X...........................",
    "...........X.X.XXXXX....XXXXX....XX......XXXX.........XX....X...........................",
    "..............XXXX.......XXXX.........XXXX..X..........XX...X...........................",
    ".............XXXXX.XXX..XXXXXX..........................................................",
    "..............XXX..XXXX...XXX.................................X.........................",
    "..............XXX..X...X.XXXXX................................XX........................",
    ".............XXXX......XXXXXXX................................XX........................",
    ".............XXXX.....XXXXXXXXX...............................XXX.......................",
    "............XXXXX.......XXXXXX.................................XXX......................",
    "...........XXXXXX.......XXXXXX.........X.......................XX.......................",
    "...........XXXXXXX.....XXXXXXX.........X.......................XXX......................",
    "..........XXXXXXXX.....XXXXXXX.........X.......................XXX......................",
    ".........XXXXXXXXXX......XXXXX.........X....................XXXXXX......................",
    ".........XXXXXXXXXXX....XXXXXXXX........X..XXX.............XXXXXXX......................",
    "........XXXXXX.XXXXXX..XXXXXXXXX........XXXXXXXX..........XXX.XXXXX.....................",
    ".......XXXXXX.XXXXXXXXXXXXXXXXX...........XXXXXXXX......XXXX...XXXXXXX..................",
    ".......XXX.X..XXXXXXXXXXXXXXXXXX................XXXXXXXXXX......XXXXXX..................",
    ".......XX..X..XXXXXXXXXXXXXXXXXX...................XXXX..........XXXX...................",
    "......XX.....XXXXXXXXXXXXXXXXXX...................................XXXX..................",
    "......X.....XXXXXXXX.XXXXXXXXXXX................................XXXXXXXX................",
    "...........XXXXXXXXX.XXXXXXXXXX................................XX..XXXX.................",
    "..........XXXXXXXXXXXXXXXXXXXX.............................XX.......XXXX................",
    "..........XXXXXXXXXXXXXXXXXXXX.......................XXXX...........XXXXX...............",
    "..........XXXXXXXXXXXXXXXXXXXX......X....XX....XXXX.................XXXXX...............",
    ".........XXXXXXXXXXXXXXXXXXXXX....XXXXXXXXX........................XXXXXXX..............",
    ".........XXXXXXXXXXXXXXXXXXXXXXX..................................XXXXXXXX..............",
    "........XXX..X.XXXXXXXX.XXXXXXXX..................................XXXXXX................",
    "........XX.....XXXXXXX..XXXXXXXX............................X.....XXXXXXX...............",
    "........XX....XXXXXXXX..XXXXXXXX.......................XXXXXX..XXXXXXXXXX...............",
    "........X.....XXXXXXXX.XXXXXXXXXX....................XXXXXXX..XXXXXXXXXXX...............",
    "........X....XXXXXXXXX.XXXXXXXXXXX..................XXXXXXXXXXXXXXXXXXXXXX..............",
    "............XXXXXXXXX..XXXXXXXXXXXX..X..............XXXXXXXXXXXXXXXXXXXXXX..............",
    "...........XXX.XXXXXX..X..XXXXXXXXXXXXXX..X........XXXXXXXXXXXXXXXXXXXXX.X..............",
    "............X..XXXXXX.....XXXXXXXXXXXXXXX.XXX..X..XXXXXXXXXXXXXXXXXXXXXX................",
    "...............XXXXXX.....XXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXX................",
    "...............XXXXXX.....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX................",
    "..............XXXXXXX......XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX................",
    ".............XXXXXX.X......XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX................",
    ".............XXXXX..XX.....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..XXXXXXXXXX.X.................",
    ".............XXXXX...X.....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..XXXXXXXXX....................",
    "............XXXXX....XX....XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..XXXXXXXXXX...................",
    "...........XXXX.......XX....X.XXXXX.XXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXX..................",
    "...........XXX.........X......XXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.................",
    "..........XX..................XXXX..XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..............",
    "..........X.....................XXX..XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX..................",
    ".................................XX..XXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXX.................",
    ".......................................XXXXXXXXXXXXXXXXXXXXXXXXX.....XXX................",
    "............................XX.........XXXX.XXXXXXXXXXXXXXXXXXXX......XX................",
    ".............................XX..........XX..XXXXXXXXXXXXXXXXXX.........................",
    "..............................XX..........XX....XXXXXXXXXXXXX...........................",
    "................................XX.............XX.XXX..XXXXX............................",
    ".................................XX..........XX...XXX..XXXXX............................",
    "..................................XXX.......XX......X...XXX.............................",
    "...................................XXXXXXXXX............XX..............................",
    "......................................XXXX..............XX..............................",
    ".....................................XX.XXXX............X...............................",
    "........................................X..X............................................",
    "...........X.......XX....XX............XX............X.......X..............XXX....X....",
    ".XXXXX...XXXXX...XXXXX...XXX......X....X.....X.....XXXXXX..XXXXX...XXXX....XXXXX...XXX..",
    ".XX..XX.XX..XXX.XXX..X...XXX......X..........X.....XX..XX.XX..XXX.XX..XX..XXX.....XXXX..",
    "XX...XX.XX...XX.XX.......X.XX...............XXX....XXXXXX.XX...XXXXX...XXXXX......XXXX..",
    "XX...XXXXX...XXXXX..XXX.XX.XX...............XXX....XXXXXX.XX...XXXX....XXXX..XXX..XX.XX.",
    "XX...XX.XX...XX.XX...XX.XXXXX....X..........XXX....XX..XX.XX...XXXXX..XXXXXX..XX.XXXXXX.",
    ".XX..XX.XXX.XXX.XXX.XXX.XXXXXX...X.........XXXX....XX.XXX.XX..XX..XX..XX..XXX.XX.XXX.XX.",
    ".XXXXX...XXXXX...XXXXXXXXX..XX....X........XXX.....XXXXX...XXXXX...XXXX....XXXXX.XX..XXX",
    ".....................XXXX....X....X....X.XXXXX.....XX..........................X.X.....X",
    "..................................XX...XXXXXXX..........................................",
    "....................................XXXXXXXXX...........................................",
    ".......................................XXXX............................................."
  ];
  const WARSHIP_LIGHTS = [[0, 23.2, 61.5, 20], [0, 6.2, 18, 15], [0, 6.2, -14, 15], [0, 5.2, -24.6, 10]];
  // The mast and the sail, in the warship's frame: the sail hung from the yard and bellied toward the bow (`sailZ`).
  const MAST = { z: 2, top: 52, yard: 48.2, half: 22.5 };
  const SAIL = { top: 47.6, foot: 9.6, half: 22, cols: 44, rows: 12, belly: 3.4, px: 0.145 };
  // A raider's mark, a skull over crossed bones, in cells `SKULL_PX` across on its black sail.
  // CBDC's mark for its sails and flags: the four letters in blocks, five across and seven tall.
  const CBDC_MARK = (() => {
    const C = [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"], B = ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."], D = ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."];
    return C.map((_, r) => [C, B, D, C].map((g) => g[r]).join("."));
  })();
  const SKULL_PX = 0.72, SKULL = [
    ".......XXXXXXXXX.......", ".....XXXXXXXXXXXXX.....", "....XXXXXXXXXXXXXXX....", "...XXXXXXXXXXXXXXXXX...", "...XXXXXXXXXXXXXXXXX...", "...XX...XXXXXXX...XX...", "...XX...XXXXXXX...XX...",
    "...XX...XXXXXXX...XX...", "...XXXXXXXX.XXXXXXXX...", "....XXXXXX...XXXXXX....", ".....XXXXXXXXXXXXX.....", "......XX.XX.XX.XX......", "......XX.XX.XX.XX......", ".......XXXXXXXXX.......",
    "XX...................XX", "XXXX...............XXXX", "..XXXXX.........XXXXX..", ".....XXXXXX.XXXXXX.....", "........XXXXXXX........", ".....XXXXXX.XXXXXX.....", "..XXXXX.........XXXXX..", "XXXX...............XXXX", "XX...................XX"];
  const sailZ = (x, y) => MAST.z + 1.1 + SAIL.belly * Math.sin(Math.PI * (SAIL.top - y) / (SAIL.top - SAIL.foot)) * (1 - 0.5 * (x / SAIL.half) ** 2);
  // A molten bit dripping from a dragon's jaws, in the warship's frame, bright yellow (`0`) or deeper orange (`1`).
  const drip = variants((hot) => noShadow(box({ w: 0.55, h: 0.7, d: 0.55, color: hot ? "#ff6a1a" : "#ffc23a", emissive: 1 })));
  const warship = cachedSteps(function* (slice = null) {
    const W = L.LONGSHIP, u = 0.4, X0 = -10.4, Y0 = -3.6, Z0 = -56.4, NX = 52, NY = 100, NZ = 310;
    // The hull's blocks, with the dragon at the stem, or for a raider (`raider`) a stone gargoyle with green eyes.
    const hullOf = function* (raider) {
    const g = T.makeGrid(NX, NY, NZ), K = tools(g);
    const BLK = 1, BLK2 = 2, OR = 3, OR_D = 4, OR_L = 5, DECK = 6, DECK2 = 7, BONE = 8, FIRE = 9, EYE = 10, WOOD = 11, ROOF = 12, STONE = 13, STONE2 = 14, STONE3 = 15, GREEN = 16;
    const cx = (v) => (v - X0) / u, cy = (v) => (v - Y0) / u, cz = (v) => (v - Z0) / u;
    const keelAt = (a) => -3.2 * (1 - Math.pow(Math.min(1, Math.abs(a) / W.bow), 3));
    const sheerAt = L.longshipSheer;
    const widthAt = (a, y) => L.longshipHalf(a) * Math.min(1, Math.pow(Math.max(0, (y - keelAt(a)) / (3 - keelAt(a))), 0.5));
    const DECK_Y = W.deck;
    // The hull: solid under its deck, open over it between the rails; black at the ends, striped amidships.
    for (let iz = 0; iz < NZ; iz++) {
      if ((iz & 15) === 0) yield* pause(slice);
      const a = Z0 + (iz + 0.5) * u;
      if (Math.abs(a) >= W.bow) continue;
      const sh = sheerAt(a), kl = keelAt(a), ends = Math.abs(a) > W.ends;
      for (let iy = 0; iy < NY; iy++) {
        const y = Y0 + (iy + 0.5) * u;
        if (y < kl || y > sh) continue;
        for (let ix = 0; ix < NX; ix++) {
          const ax = Math.abs(X0 + (ix + 0.5) * u), w = widthAt(a, y);
          if (ax > w) continue;
          const shell = ax > w - 0.9;
          if (!ends && y > DECK_Y && !shell) continue;
          if (!ends && y > DECK_Y - u && !shell) { K.set(ix, iy, iz, Math.floor(ax / 0.8) & 1 ? DECK : DECK2); continue; }
          const row = Math.floor((y - 0.4) / 0.8);
          let c = y < 0.4 ? BLK : y > sh - 0.45 ? BLK : ends ? (Math.floor(y / 0.4) % 5 === 0 ? OR : (row & 1 ? BLK : BLK2)) : [OR, BLK, OR_D, OR, BLK2][((row % 5) + 5) % 5];
          if (!ends && y > sh - 0.9 && y <= sh - 0.45) c = OR_L;
          K.set(ix, iy, iz, c);
        }
      }
    }
    yield* pause(slice);
    // Solids in metres: an ellipsoid and a box, each in a material or what a function of the cell gives.
    const blob = (x, y, z, rx, ry, rz, m) => K.shape(cx(x - rx), cx(x + rx) + 1, cy(y - ry), cy(y + ry) + 1, cz(z - rz), cz(z + rz) + 1, (i, j, k) => ((X0 + (i + 0.5) * u - x) / rx) ** 2 + ((Y0 + (j + 0.5) * u - y) / ry) ** 2 + ((Z0 + (k + 0.5) * u - z) / rz) ** 2 <= 1, m);
    const slab = (x0, x1, y0, y1, z0, z1, m) => K.box(Math.round(cx(x0)), Math.round(cx(x1)), Math.round(cy(y0)), Math.round(cy(y1)), Math.round(cz(z0)), Math.round(cz(z1)), m);
    const scales = (i, j, k) => { const h = hash3(i >> 1, j >> 1, k >> 1); return h < 0.45 ? OR : h < 0.75 ? OR_D : OR_L; };
    const hide = (i, j, k) => hash3(i >> 1, j >> 1, k >> 1) < 0.7 ? BLK : BLK2;
    // The dragon: its neck up out of the stem, black down its back and scaled orange down its throat; the head, the
    // long upper jaw and the dropped lower one with the fire between them, teeth, lit eyes under black brows, two great
    // horns swept back and two lesser ones, and spines down the back of the neck.
    if (raider) {
      // The gargoyle: crouched on the stem in weathered grey stone, its claws gripping the post, its wings folded down
      // its back, a horned head thrust out over the water, jaws open on its teeth and its eyes burning green.
      const stone = (i, j, k) => { const h = hash3(i >> 1, j >> 1, k >> 1); return h < 0.45 ? STONE : h < 0.8 ? STONE2 : STONE3; };
      [[45.5, 13], [47.2, 14.8], [48.8, 16.4]].forEach(([z, y], i) => blob(0, y, z, 1.9 - i * 0.2, 1.7, 1.7, stone));
      blob(0, 18.4, 50.6, 2.3, 2.8, 2.5, stone);
      blob(0, 21.6, 53.4, 1.9, 1.7, 2.0, stone);
      blob(0, 21.0, 55.8, 1.25, 0.95, 1.4, stone);
      blob(0, 19.7, 55.4, 1.1, 0.55, 1.5, STONE3);
      slab(-0.75, 0.75, 20.1, 20.6, 55.0, 57.0, FIRE);
      for (let z = 55.2; z < 57.2; z += 0.6) for (const sx of [-1, 1]) slab(sx > 0 ? 0.55 : -0.85, sx > 0 ? 0.85 : -0.55, 20.0, 20.8, z, z + 0.25, BONE);
      for (const sx of [-1, 1]) {
        slab(sx > 0 ? 0.45 : -1.25, sx > 0 ? 1.25 : -0.45, 21.9, 22.5, 55.6, 56.3, GREEN);
        blob(sx * 0.95, 22.7, 55.4, 0.7, 0.3, 0.6, STONE3);
        for (let t = 0; t <= 1.001; t += 0.07) { const r = 0.6 * (1 - t) + 0.18; blob(sx * (1.1 + 1.3 * t), 22.9 + 3.2 * Math.pow(t, 0.8), 53.4 - 3.4 * t, r, r, r, STONE3); }
        blob(sx * 1.7, 22.8, 52.6, 0.3, 0.9, 0.5, stone);
        blob(sx * 2.4, 19.6, 48.6, 0.55, 3.2, 3.0, stone);
        for (let t = 0; t <= 1.001; t += 0.25) blob(sx * (2.5 + 0.2 * t), 22.6 + 1.4 * t, 47.6 - 1.6 * t, 0.35, 0.6, 0.35, STONE3);
        blob(sx * 1.4, 15.6, 52.6, 0.7, 1.6, 0.8, stone);
        for (const dz of [-0.4, 0.2, 0.8]) blob(sx * 1.4 + dz * 0.3, 14.0, 53.4 + dz, 0.22, 0.5, 0.22, BONE);
      }
    } else {
    const NECK = [[45.5, 13], [47.5, 15.6], [49.6, 18.2], [51.8, 20.6], [54, 22.8], [56, 24.4]];
    NECK.forEach(([z, y], i) => { const r = 2.6 - i * 0.14; blob(0, y, z, r * 0.82, r, r, (a, b, c) => (Z0 + (c + 0.5) * u - z) * 0.7 - (Y0 + (b + 0.5) * u - y) * 0.5 > 0.2 ? scales(a, b, c) : hide(a, b, c)); });
    NECK.forEach(([z, y], i) => { if (i) blob(0, y + 2.3 - i * 0.1, z - 1.9, 0.4, 1.3, 0.8, BLK); });
    blob(0, 25.3, 58.2, 2.5, 2.3, 3.6, (a, b, c) => Y0 + (b + 0.5) * u > 26.3 ? hide(a, b, c) : scales(a, b, c));
    blob(0, 23.4, 58.0, 2.0, 1.7, 1.6, OR_D);
    blob(0, 25.4, 62.4, 1.9, 1.25, 3.6, (a, b, c) => Y0 + (b + 0.5) * u > 25.9 ? hide(a, b, c) : scales(a, b, c));
    blob(0, 26.3, 64.8, 1.1, 0.7, 1.1, BLK);
    blob(0, 21.4, 61.0, 1.6, 0.8, 3.5, scales);
    slab(-1.0, 1.0, 22.2, 24.2, 58.4, 63.2, FIRE); slab(-0.6, 0.6, 22.6, 23.8, 57.2, 58.4, EYE);
    for (let z = 59.2; z < 65.2; z += 1.2) for (const sx of [-1, 1]) { slab(sx > 0 ? 1.0 : -1.4, sx > 0 ? 1.4 : -1.0, 23.4, 24.3, z, z + 0.4, BONE); slab(sx > 0 ? 0.9 : -1.3, sx > 0 ? 1.3 : -0.9, 22.1, 22.9, z + 0.6, z + 1.0, BONE); }
    for (const sx of [-1, 1]) { slab(sx > 0 ? 0.3 : -0.7, sx > 0 ? 0.7 : -0.3, 23.2, 24.3, 65.2, 65.6, BONE); slab(sx > 0 ? 2.0 : -2.6, sx > 0 ? 2.6 : -2.0, 25.5, 26.3, 59.4, 60.6, EYE); blob(sx * 2.0, 26.8, 59.8, 0.9, 0.55, 1.5, BLK); }
    for (const sx of [-1, 1]) {
      for (let t = 0; t <= 1.001; t += 0.05) { const r = 0.95 * (1 - t) + 0.28; blob(sx * (1.5 + 1.9 * t), 27 + 8 * Math.pow(t, 0.8), 57.4 - 8.5 * t + 3 * t * t, r, r, r, BLK); }
      for (let t = 0; t <= 1.001; t += 0.08) { const r = 0.6 * (1 - t) + 0.22; blob(sx * (2.2 + 1.6 * t), 25.4 + 3.2 * t, 56.2 - 4.2 * t, r, r, r, BLK); }
      for (let t = 0; t <= 1.001; t += 0.12) { const r = 0.42 * (1 - t) + 0.18; blob(sx * (1.3 + 0.6 * t), 22.4 - 1.6 * t, 57.6 - 2.6 * t, r, r, r, BLK); }
    }
    }
    // The crest of orange spines down the bow, and the stern post curling over.
    for (let a = 30; a <= 44; a += 2.4) blob(0, sheerAt(a) + 1.1, a, 0.5, 1.6, 0.9, (i, j, k) => j & 1 ? OR : OR_L);
    [[-46.5, 13.5, 1.5], [-49, 16.4, 1.4], [-51, 19.6, 1.3], [-51.6, 23, 1.2], [-50, 25.8, 1.1], [-47.4, 26.6, 1.0], [-45.4, 25.2, 0.9], [-45.2, 23, 0.8], [-46.8, 21.9, 0.7], [-48, 22.9, 0.6]].forEach(([z, y, r], i) => blob(0, y, z, r * 0.85, r, r, i > 6 ? OR : hide));
    // The deckhouse aft, its doorway lit.
    slab(-4, 4, DECK_Y, 5.4, -34, -26, WOOD); slab(-4.4, 4.4, 5.4, 5.8, -34.4, -25.6, ROOF); slab(-3, 3, 5.8, 6.4, -34.4, -25.6, ROOF); slab(-1.4, 1.4, 6.4, 6.9, -34.4, -25.6, ROOF);
    slab(-0.8, 0.8, DECK_Y, 4.6, -26, -25.6, FIRE);
    yield* pause(slice);
    const pal = WARSHIP_HEX.map((c) => c && hexToRgb(c));
    const built = yield* T.gridGeometrySteps(g, { unit: u, palette: pal, origin: { x: X0, y: Y0, z: Z0 } }, slice);
    for (const f of built.faces) if (f.color === pal[FIRE] || f.color === pal[EYE] || f.color === pal[GREEN]) f.emissive = 1;
    return built;
    };
    const hull = yield* hullOf(false), raiderHull = yield* hullOf(true);
    const DECK_Y = W.deck, sheerAt = L.longshipSheer;
    // The mast and its yard, the chains from the masthead to the dragon's neck, the stern and the rails, the sheets
    // from the yard's ends, and a fire bowl fore and aft of the mast.
    const IRONC = "#2a2a2e", SPAR = "#241b14", rig = [];
    rig.push(beam(0, DECK_Y - 0.4, MAST.z, 0, MAST.top, MAST.z, 0.75, SPAR), beam(-MAST.half, MAST.yard, MAST.z + 0.9, MAST.half, MAST.yard, MAST.z + 0.9, 0.45, SPAR));
    rig.push(beam(0, MAST.top - 0.5, MAST.z, 0, 21, 52, 0.11, IRONC), beam(0, MAST.top - 0.5, MAST.z, 0, 21, -50.5, 0.11, IRONC));
    for (const sx of [-1, 1]) {
      for (const dz of [-9, -3, 3, 9]) rig.push(beam(0, MAST.top - 4, MAST.z, sx * (L.longshipHalf(MAST.z + dz) - 0.3), 4.2, MAST.z + dz, 0.07, IRONC));
      rig.push(beam(sx * MAST.half, MAST.yard, MAST.z + 0.9, sx * 7.4, 4.6, -30, 0.08, IRONC), beam(sx * MAST.half, MAST.yard, MAST.z + 0.9, sx * 7.6, 4.6, 26, 0.06, IRONC));
    }
    for (const [x, y, z] of WARSHIP_LIGHTS.slice(1, 3)) rig.push(moved(lathe({ profile: [[0, 0], [0.5, 0], [0.3, 0.9], [1.1, 1.6], [1.2, 2.0], [0, 2.0]], segments: 10, color: IRONC }), x, DECK_Y, z),
      noShadow(moved(lathe({ profile: [[0, 0], [1.05, 0], [0.5, 0.9], [0, 1.5]], segments: 8, color: "#ff8a2a", emissive: 1 }), x, DECK_Y + 2.0, z)));
    // The sail: blocks hung from the yard and bellied toward the bow, in the art's stripes; a raider's is all black.
    const STRIPES = [0.1, 0.17, 0.3, 0.7, 0.83, 0.9, 1];
    const cw = 2 * SAIL.half / SAIL.cols, rh = (SAIL.top - SAIL.foot) / SAIL.rows;
    // The mark on both faces (`rows`, cells `px` across), each read the right way round from its own side: its cells
    // joined into runs along a row (`run` cells at most, so each keeps to the sail's belly), white on the black
    // field, glowing a little so it reads at night.
    const sailOf = (black, rows, px, run) => {
      const sail = [];
      for (let c = 0; c < SAIL.cols; c++) for (let r = 0; r < SAIL.rows; r++) {
        const x = -SAIL.half + (c + 0.5) * cw, y = SAIL.top - (r + 0.5) * rh, f = (c + 0.5) / SAIL.cols, stripe = black ? 1 : STRIPES.findIndex((e) => f < e);
        sail.push(box({ w: cw + 0.02, h: rh + 0.02, d: 0.3, color: black === "red" ? (r & 1 ? "#a01912" : "#b82117") : stripe & 1 ? (r & 1 ? "#141216" : "#1b181d") : (r & 1 ? "#d9611a" : "#e06a1f"), offset: { x, y, z: sailZ(x, y) } }));
      }
      const logoTop = (SAIL.top + SAIL.foot) / 2 + rows.length * px / 2, mid = (rows[0].length - 1) / 2;
      rows.forEach((line, r) => {
        for (let c = 0; c < line.length;) {
          if (line[c] !== "X") { c++; continue; }
          let e = c;
          while (e + 1 < line.length && line[e + 1] === "X" && e - c < run - 1) e++;
          const w = (e - c + 1) * px, u = ((c + e) / 2 - mid) * px, y = logoTop - (r + 0.5) * px;
          for (const side of [1, -1]) { const x = side * u, z = sailZ(x, y); sail.push(box({ w: w + 0.01, h: px + 0.01, d: 0.12, color: "#f4f1ea", emissive: 0.3, offset: { x, y, z: z + side * 0.2 } })); }
          c = e + 1;
        }
      });
      return sail;
    };
    const sail = sailOf(false, SAIL_LOGO, SAIL.px, 8), blackSail = sailOf(true, SKULL, SKULL_PX, 4), redSail = sailOf("red", SKULL, SKULL_PX, 4), cbdcSail = sailOf("red", CBDC_MARK, 1.5, 4);
    // The shields along both rails.
    const shields = [], disc = (r, t, color) => turnedZ(lathe({ profile: [[0, 0], [r, 0], [r * 0.96, t], [0, t]], segments: 14, color }), -Math.PI / 2);
    let n = 0;
    for (let a = -33; a <= 33.01; a += 4.7, n++) for (const sx of [-1, 1]) {
      const x = sx * (L.longshipHalf(a) + 0.12), y = sheerAt(a) - 0.9, alt = n & 1, turn = (geo) => sx > 0 ? geo : models.turnedY(geo, Math.PI);
      shields.push(moved(turn(disc(2.1, 0.28, "#17151a")), x, y, a), moved(turn(disc(1.8, 0.4, alt ? "#1b181d" : "#d9611a")), x, y, a), moved(turn(disc(1.0, 0.5, alt ? "#d9611a" : "#17151a")), x, y, a), moved(turn(disc(0.5, 0.72, "#f1ece2")), x, y, a));
    }
    return { hull, raiderHull, rig: merge(...rig), sail: noShadow(merge(...sail)), blackSail: noShadow(merge(...blackSail)), redSail: noShadow(merge(...redSail)), cbdcSail: noShadow(merge(...cbdcSail)), shields: merge(...shields) };
  });
  // ---------- the west gate, the bridge and the shipyard ----------
  // The west gate's portcullis, a part: about x, its foot at the origin, as wide as the passage and as tall as its arch.
  const westPortcullis = cached(() => {
    const parts = [], W = L.WEST.half, H = L.westArchTop(0) + 0.3;
    for (let x = -W + 0.25; x <= W - 0.24; x += 0.5) parts.push(box({ w: 0.09, h: H, d: 0.09, color: IRON, offset: { x, y: H / 2 + 0.1 } }), moved(lathe({ profile: [[0, 0], [0.07, 0.14], [0, 0.14]], segments: 4, color: IRON }), x, -0.02, 0));
    for (let y = 0.6; y < H; y += 0.6) parts.push(box({ w: 2 * W + 0.3, h: 0.075, d: 0.11, color: IRON, offset: { x: 0, y } }));
    return merge(...parts);
  });
  // Adds `fn(x)` to the height of every vertex of `geo`, so a part laid flat follows the way's deck.
  const lifted = (geo, fn) => { const v = geo.verts; for (let i = 0; i < v.length; i += 3) v[i + 1] += fn(v[i]); return geo; };
  // The bridge out of the west gate and the stair down from its far end (keep-layout.js `WEST_BRIDGE`, `WEST_STAIR`),
  // in the land's frame: a viaduct of the arena's metre blocks on piers, a pointed arch between each two ringed in
  // dressed voussoirs, its soffits and jambs under them; a flagged deck between pierced parapets under a coping; a
  // pillar either side at every pier, banded stone from the ground to well over the parapet, a blind niche in its face
  // toward the way and an iron cresset on its head (the scene stands the fire); and the stair, broad treads in three
  // flights between solid parapets, down to the shipyard's quay.
  const DRESSED = "#2c2d32";
  const westBridge = cachedSteps(function* (slice = null) {
    const B = L.WEST_BRIDGE, S = L.WEST_STAIR, rand = mulberry32(8123), crag = geometry(), flat = [], C = 1, low = L.SEA - 2.5, Z = B.z, hw = B.halfW;
    const E = B.ramp0, cols = Math.round((E - S.x1) / C), cw = (E - S.x1) / cols, rows = Math.ceil((B.y + 0.3 - low) / C);
    // Its two long faces, open under every arch and no higher than the deck (or the stair's treads).
    for (const s of [-1, 1]) {
      blockFace(crag, rand, [E, low, Z + s * hw], [-1, 0, 0], UP, [0, 0, s], cols, rows, cw, C, BIG_BLOCKS, BIG, (i, j) => {
        const x = E - (i + 0.5) * cw, y = low + (j + 0.5) * C;
        return y < L.wayY(x) + 0.2 && y > L.bridgeSoffit(x) && (x < -MOAT.half || y > MOAT.bed - 0.6);
      });
      yield* pause(slice);
    }
    // Each arch: its jambs below the springing, its soffit, and a ring of voussoirs on both faces.
    for (const span of B.spans) {
      const R = 2 * span.half, n = 7, seg = R * Math.PI / 3 / n, jamb = Math.ceil((span.spring - low) / C);
      if (jamb > 0) for (const [x, nx] of [[span.e, -1], [span.w, 1]]) blockFace(crag, rand, [x, low, Z - hw], [0, 0, 1], UP, [nx, 0, 0], Math.round(2 * hw / C), jamb, 2 * hw / Math.round(2 * hw / C), (span.spring - low) / jamb, BIG_BLOCKS, BIG);
      for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI / 3, cs = Math.cos(a), sn = Math.sin(a), y = span.spring + R * sn, turnBy = side * (a + Math.PI / 2);
        if (y < low) continue;
        // The arc is struck from the far jamb; `out` steps a piece back from the opening's edge into the stone.
        const at = (out) => [span.mid + side * (-span.half + (R + out) * cs), span.spring + (R + out) * sn];
        const [sx, sy] = at(0.13), [vx, vy] = at(0.36);
        flat.push(moved(turnedZ(box({ w: seg + 0.06, h: 0.26, d: 2 * hw - 0.1, color: ARENA[2] }), turnBy), sx, sy, Z));
        for (const s of [-1, 1]) flat.push(moved(turnedZ(bevelBox({ w: seg - 0.03, h: 0.72, d: 0.5, color: k & 1 ? DRESSED : ARENA[1], bevel: 0.06 }), turnBy), vx, vy, Z + s * (hw - 0.08)));
      }
      yield* pause(slice);
    }
    // The deck: flags from the passage through the curtain out to the stair's head, laid flat and lifted onto the
    // ramp, over a bed of fill.
    const X_IN = -(YARD.half + 0.05);
    flat.push(lifted(paved((x, z) => Math.abs(z - Z) < B.half - 0.04 && x < X_IN && x > B.x1 + 0.1, B.x1, X_IN, Z - B.half, Z + B.half, 1.2, 8131), L.bridgeY));
    flat.push(lifted(box({ w: E - B.x1, h: 0.5, d: 2 * hw - 0.3, color: "#2a2623", offset: { x: (E + B.x1) / 2, y: -0.27, z: Z } }), L.bridgeY));
    yield* pause(slice);
    // The parapets, a metre at a time: a plinth course, a block with a gap either side of it, and the coping.
    for (const s of [-1, 1]) for (let x = B.x0 - 0.5; x > B.x1; x -= 1) {
      const z = Z + s * (B.half + 0.35), y = L.bridgeY(x);
      flat.push(box({ w: 1.0, h: 0.3, d: 0.7, color: ARENA[0], offset: { x, y: y + 0.15, z } }));
      flat.push(bevelBox({ w: 0.56, h: 0.62, d: 0.5, color: ARENA[(Math.round(x) & 1) + 1], bevel: 0.07, offset: { x, y: y + 0.6, z } }));
      flat.push(bevelBox({ w: 1.03, h: 0.2, d: 0.84, color: DRESSED, bevel: 0.05, offset: { x, y: y + B.rail - 0.1, z } }));
    }
    yield* pause(slice);
    // The pillars: banded stone from below the water or the ground, slimmer over the parapet, a cornice and a cresset.
    const bowl = () => lathe({ profile: [[0, 0], [0.16, 0], [0.12, 0.22], [0.42, 0.42], [0.46, 0.56], [0.38, 0.56], [0.32, 0.46], [0, 0.46]], segments: 10, color: IRON });
    for (const px of B.pillars) for (const s of [-1, 1]) {
      const z = Z + s * B.pillarZ, deck = L.bridgeY(px), head = deck + B.rail + B.pillar, foot = px > -MOAT.half ? MOAT.bed - 0.4 : low;
      let k = 0;
      for (let y = foot; y < deck + B.rail - 0.01; y += 1.1, k++) { const h = Math.min(1.1, deck + B.rail - y); flat.push(bevelBox({ w: 2 * B.pillarR, h: h + 0.02, d: 2 * B.pillarR, color: ARENA[k % 3], bevel: 0.08, offset: { x: px, y: y + h / 2, z } })); }
      flat.push(bevelBox({ w: 2 * B.pillarR + 0.3, h: 0.24, d: 2 * B.pillarR + 0.3, color: DRESSED, bevel: 0.06, offset: { x: px, y: deck + B.rail + 0.12, z } }));
      for (let y = deck + B.rail + 0.24; y < head - 0.3; y += 1.1, k++) { const h = Math.min(1.1, head - 0.3 - y); flat.push(bevelBox({ w: 1.4, h: h + 0.02, d: 1.4, color: ARENA[k % 3], bevel: 0.07, offset: { x: px, y: y + h / 2, z } })); }
      flat.push(bevelBox({ w: 1.9, h: 0.3, d: 1.9, color: DRESSED, bevel: 0.08, offset: { x: px, y: head - 0.15, z } }));
      // A blind pointed niche in the face toward the way, an ember glowing low in it.
      const nz = z - s * 0.71, ny = deck + B.rail + 1.0;
      flat.push(box({ w: 0.62, h: 1.7, d: 0.05, color: "#0b0b0d", offset: { x: px, y: ny + 0.85, z: nz } }), moved(turnedZ(box({ w: 0.44, h: 0.44, d: 0.05, color: "#0b0b0d" }), Math.PI / 4), px, ny + 1.7, nz));
      flat.push(box({ w: 0.2, h: 0.2, d: 0.06, color: "#ff7a1a", emissive: 0.9, offset: { x: px, y: ny + 0.22, z: nz - s * 0.01 } }));
      flat.push(moved(bowl(), px, head, z), box({ w: 0.5, h: 0.05, d: 0.5, color: "#ff7a1a", emissive: 1, offset: { x: px, y: head + 0.49, z } }));
    }
    yield* pause(slice);
    // The stair: every tread a slab over its fill, a solid parapet stepping down with it either side.
    let x = S.x0, k = 0;
    const slab = (len, y) => {
      const mid = x - len / 2;
      flat.push(bevelBox({ w: len + 0.01, h: 0.16, d: 2 * B.half, color: FLAGS[k % FLAGS.length], bevel: 0.03, offset: { x: mid, y: y - 0.08, z: Z } }));
      flat.push(box({ w: len, h: y - 0.16 - low, d: 2 * hw - 0.3, color: "#2a2623", offset: { x: mid, y: (y - 0.16 + low) / 2, z: Z } }));
      for (const s of [-1, 1]) flat.push(box({ w: len, h: B.rail - 0.1, d: 0.62, color: ARENA[0], offset: { x: mid, y: y + (B.rail - 0.1) / 2, z: Z + s * (B.half + 0.35) } }),
        bevelBox({ w: len + 0.02, h: 0.16, d: 0.84, color: DRESSED, bevel: 0.05, offset: { x: mid, y: y + B.rail - 0.06, z: Z + s * (B.half + 0.35) } }));
      x -= len;
    };
    S.flights.forEach((n, i) => {
      for (let t = 0; t < n; t++) { k++; slab(S.tread, B.y - k * S.rise); }
      if (i < S.flights.length - 1) slab(S.landing, B.y - k * S.rise);
    });
    return shaded([crag], flat);
  });
  // CBDC's wall round the volcano (keep-layout.js `VOLCANO.wall`), in the bridges' make and the island's red, white
  // and black. One side is a part in its own frame: along x about its middle, its outer face toward +z, heights the
  // land's own. Its two faces are the arena's metre blocks, its walk flags between pierced parapets under a white
  // coping, and against its outer face two banded pillars with a blind niche and an iron cresset each (the scene
  // stands the fire). `gate` is the side with the pointed gate through it, ringed in voussoirs of white and red;
  // `stairs` the two with a stair up their inner face, each the other's mirror; `turret` a corner's drum under a white
  // string course and a red conical roof; `way` the flags from the gate to the cave's mouth, in the land's frame.
  const CBDC_WHITE = "#e8e4da", CBDC_RED = ["#a01912", "#b82117"];
  const cbdcWall = cached(() => {
    const V = L.VOLCANO, W = V.wall, S = W.stair, T = W.top, low = W.y - 3, tan = Math.tan(Math.PI / 8), half = W.half, lenAt = (z) => (W.apothem + z) * tan;
    const bowl = () => lathe({ profile: [[0, 0], [0.16, 0], [0.12, 0.22], [0.42, 0.42], [0.46, 0.56], [0.38, 0.56], [0.32, 0.46], [0, 0.46]], segments: 10, color: IRON });
    // `kind`: 0 a plain side, 1 the gate's, 2 and 3 the stairs' (the stair rising toward -x, then toward +x).
    const side = (kind) => {
      const rand = mulberry32(8611 + kind), crag = geometry(), flat = [], G = W.gate, sg = kind === 2 ? -1 : 1;
      const open = (x, y) => kind === 1 && y < W.y + L.archTop(G.half, G.spring, x);
      for (const s of [1, -1]) {
        const len = lenAt(s * half), cols = Math.round(2 * len), cw = 2 * len / cols, rows = Math.ceil(T + 0.2 - low);
        blockFace(crag, rand, [len, low, s * half], [-1, 0, 0], UP, [0, 0, s], cols, rows, cw, (T + 0.2 - low) / rows, BIG_BLOCKS, BIG, (i, j) => !open(len - (i + 0.5) * cw, low + (j + 0.5) * (T + 0.2 - low) / rows));
      }
      if (kind === 1) {
        const R = 2 * G.half, n = 7, seg = R * Math.PI / 3 / n, spring = W.y + G.spring, jamb = Math.ceil(spring - low), deep = Math.round(2 * half);
        for (const [x, nx] of [[G.half, -1], [-G.half, 1]]) blockFace(crag, rand, [x, low, -half], [0, 0, 1], UP, [nx, 0, 0], deep, jamb, 2 * half / deep, (spring - low) / jamb, BIG_BLOCKS, BIG);
        for (const sd of [-1, 1]) for (let k = 0; k < n; k++) {
          const a = (k + 0.5) / n * Math.PI / 3, cs = Math.cos(a), sn = Math.sin(a), turnBy = sd * (a + Math.PI / 2);
          const at = (out) => [sd * (-G.half + (R + out) * cs), spring + (R + out) * sn];
          const [sx, sy] = at(0.13), [vx, vy] = at(0.36);
          flat.push(moved(turnedZ(box({ w: seg + 0.06, h: 0.26, d: 2 * half - 0.1, color: ARENA[2] }), turnBy), sx, sy, 0));
          for (const s of [-1, 1]) flat.push(moved(turnedZ(bevelBox({ w: seg - 0.03, h: 0.72, d: 0.5, color: k & 1 ? CBDC_RED[0] : CBDC_WHITE, bevel: 0.06 }), turnBy), vx, vy, s * (half - 0.08)));
        }
      }
      // The walk: flags over a bed of fill, laid in strips so each ends on the corner's mitre.
      flat.push(moved(paved((x, z) => Math.abs(z) < half - W.railW && Math.abs(x) < lenAt(z) + 0.02, -lenAt(half), lenAt(half), -half, half, 1.2, 8617 + kind), 0, T, 0));
      for (let k = 0; k < 6; k++) { const z = -half + (k + 0.5) * half / 3, len = lenAt(z); flat.push(box({ w: 2 * len, h: 0.5, d: half / 3 + 0.02, color: "#2a2623", offset: { x: 0, y: T - 0.27, z } })); }
      // The parapets, a metre at a time, the inner one left open at a stair's landing.
      for (const s of [1, -1]) {
        const z = s * (half - 0.32), len = lenAt(z) - 0.1;
        for (let n = Math.floor(2 * len), i = 0, x = -n / 2 + 0.5; i < n; i++, x += 1) {
          if (s < 0 && kind > 1 && sg * x > S.to && sg * x < S.to + S.landing - S.rail) continue;
          flat.push(box({ w: 1.0, h: 0.3, d: 0.64, color: ARENA[0], offset: { x, y: T + 0.15, z } }));
          flat.push(bevelBox({ w: 0.56, h: 0.62, d: 0.46, color: ARENA[(Math.round(x + 40) & 1) + 1], bevel: 0.07, offset: { x, y: T + 0.6, z } }));
          flat.push(bevelBox({ w: 1.03, h: 0.2, d: 0.72, color: CBDC_WHITE, bevel: 0.05, offset: { x, y: T + W.rail - 0.1, z } }));
        }
      }
      // The pillars against the outer face.
      for (const px of W.pillars) {
        const z = half + W.pillarOut / 2, head = T + W.rail + W.pillar;
        let k = 0;
        for (let y = low; y < T + W.rail - 0.01; y += 1.1, k++) { const h = Math.min(1.1, T + W.rail - y); flat.push(bevelBox({ w: 2 * W.pillarR, h: h + 0.02, d: 2 * W.pillarR, color: ARENA[k % 3], bevel: 0.08, offset: { x: px, y: y + h / 2, z } })); }
        flat.push(bevelBox({ w: 2 * W.pillarR + 0.3, h: 0.24, d: 2 * W.pillarR + 0.3, color: CBDC_WHITE, bevel: 0.06, offset: { x: px, y: T + W.rail + 0.12, z } }));
        for (let y = T + W.rail + 0.24; y < head - 0.3; y += 1.1, k++) { const h = Math.min(1.1, head - 0.3 - y); flat.push(bevelBox({ w: 1.4, h: h + 0.02, d: 1.4, color: ARENA[k % 3], bevel: 0.07, offset: { x: px, y: y + h / 2, z } })); }
        flat.push(bevelBox({ w: 1.9, h: 0.3, d: 1.9, color: CBDC_WHITE, bevel: 0.08, offset: { x: px, y: head - 0.15, z } }));
        const nz = z - 0.71, ny = T + W.rail + 1.0;
        flat.push(box({ w: 0.62, h: 1.7, d: 0.05, color: "#0b0b0d", offset: { x: px, y: ny + 0.85, z: nz } }), moved(turnedZ(box({ w: 0.44, h: 0.44, d: 0.05, color: "#0b0b0d" }), Math.PI / 4), px, ny + 1.7, nz));
        flat.push(box({ w: 0.2, h: 0.2, d: 0.06, color: "#ff3a1a", emissive: 0.9, offset: { x: px, y: ny + 0.22, z: nz - 0.01 } }));
        flat.push(moved(bowl(), px, head, z), box({ w: 0.5, h: 0.05, d: 0.5, color: "#ff7a1a", emissive: 1, offset: { x: px, y: head + 0.49, z } }));
      }
      // The stair up the inner face: every tread a slab over its fill, a solid rail along its open edge, and the
      // landing at the walk's height.
      if (kind > 1) {
        const zm = -half - S.wide / 2, zr = -half - S.wide + S.rail / 2;
        const slab = (w0, len, y, k) => {
          const x = sg * (w0 + len / 2);
          flat.push(bevelBox({ w: len + 0.01, h: 0.16, d: S.wide, color: FLAGS[k % FLAGS.length], bevel: 0.03, offset: { x, y: y - 0.08, z: zm } }));
          flat.push(box({ w: len, h: y - 0.16 - low, d: S.wide - 0.04, color: ARENA[k % 3], offset: { x, y: (y - 0.16 + low) / 2, z: zm } }));
          flat.push(box({ w: len, h: W.rail - 0.1, d: S.rail, color: ARENA[0], offset: { x, y: y + (W.rail - 0.1) / 2, z: zr } }), bevelBox({ w: len + 0.02, h: 0.16, d: S.rail + 0.2, color: CBDC_WHITE, bevel: 0.05, offset: { x, y: y + W.rail - 0.06, z: zr } }));
        };
        for (let t = 0; t < S.treads; t++) slab(S.from + t * S.tread, S.tread, W.y + (t + 1) * S.rise, t);
        slab(S.to, S.landing, T, S.treads);
        flat.push(box({ w: S.rail, h: W.rail, d: S.wide, color: ARENA[0], offset: { x: sg * (S.to + S.landing - S.rail / 2), y: T + W.rail / 2, z: zm } }));
      }
      return shaded([crag], flat);
    };
    // A corner's turret, its foot at the court's height.
    const U = W.turret, H = W.walk + U.rise, R = U.r, parts = [drum(H, BLACK_STONE, 8641, 18, R)];
    parts.push(moved(lathe({ profile: [[R - 0.2, 0], [R + 0.36, 0.2], [R + 0.36, 0.5], [R - 0.2, 0.5]], segments: 20, color: CBDC_WHITE }), 0, H - 1.9, 0));
    parts.push(lathe({ profile: [[0, H], [R + 0.8, H], [R + 0.8, H + 0.22], [0.16, H + U.roof - 0.5], [0, H + U.roof - 0.5]], segments: 20, color: CBDC_RED[0] }));
    parts.push(lathe({ profile: [[R + 0.5, H - 0.12], [R + 0.9, H - 0.12], [R + 0.9, H + 0.06], [R + 0.5, H + 0.06]], segments: 20, color: CBDC_RED[1] }));
    parts.push(moved(lathe({ profile: [[0, 0], [0.16, 0], [0.26, 0.22], [0.1, 0.5], [0.05, 1.0], [0, 1.0]], segments: 8, color: CBDC_WHITE }), 0, H + U.roof - 0.55, 0));
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * TAU, cs = Math.cos(a), sn = Math.sin(a);
      parts.push(noShadow(moved(models.turnedY(box({ w: 0.5, h: 1.5, d: 0.08, color: "#ffad4f", emissive: 0.8 }), Math.PI / 2 - a), cs * (R + 0.03), H - 3.6, sn * (R + 0.03))));
    }
    // The way from before the gate, through it, to the cave's mouth.
    const gate = V.cone.x - W.apothem, x0 = gate - half - 6, x1 = V.mouth.x0 + 1;
    const way = moved(paved((x, z) => Math.abs(z - V.z) < 2.5 && x > x0 && x < x1, x0, x1, V.z - 2.5, V.z + 2.5, 1.2, 8647), 0, V.court.y, 0);
    return { side: side(0), gate: side(1), stairs: [side(2), side(3)], turret: merge(...parts), way };
  });

  // The high bridge out of the back gate to the arena (keep-layout.js `BACK_BRIDGE`), in a frame of its own the castle
  // turns to run north: `x` here is the land's z along the way and `z` the land's -x across it. The west bridge's
  // make throughout: the arena's blocks on piers, each arch ringed in dressed voussoirs, a flagged deck between
  // pierced parapets under a coping, a pillar either side at every pier with a cresset on its head.
  // An arched bridge of the back way's kind (keep-layout.js `spanY`), its along `z` the model's x and its middle line
  // on z 0: `moatEnd` where the castle's moat stops (its faces and pillars go only down to the moat's bed inside it) and
  // `xIn` where its flags begin.
  const archBridge = function* (B, seed, flagSeed, moatEnd, xIn, slice) {
    const rand = mulberry32(seed), crag = geometry(), flat = [], C = 1, low = L.SEA - 2.5, hw = B.halfW, E = B.z0, X1 = B.z1, deckY = (x) => L.spanY(B, x);
    const cols = Math.round((E - X1) / C), cw = (E - X1) / cols, rows = Math.ceil((B.peak + 0.3 - low) / C);
    for (const s of [-1, 1]) {
      blockFace(crag, rand, [E, low, s * hw], [-1, 0, 0], UP, [0, 0, s], cols, rows, cw, C, BIG_BLOCKS, BIG, (i, j) => {
        const x = E - (i + 0.5) * cw, y = low + (j + 0.5) * C;
        return y < deckY(x) + 0.2 && y > L.spanSoffit(B, x) && (x < moatEnd || y > MOAT.bed - 0.6);
      });
      yield* pause(slice);
    }
    for (const span of B.spans) {
      const R = 2 * span.half, n = Math.max(7, Math.round(R * Math.PI / 3 / 1.8)), seg = R * Math.PI / 3 / n, jamb = Math.ceil((span.spring - low) / C);
      if (jamb > 0) for (const [x, nx] of [[span.e, -1], [span.w, 1]]) blockFace(crag, rand, [x, low, -hw], [0, 0, 1], UP, [nx, 0, 0], Math.round(2 * hw / C), jamb, 2 * hw / Math.round(2 * hw / C), (span.spring - low) / jamb, BIG_BLOCKS, BIG);
      for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI / 3, cs = Math.cos(a), sn = Math.sin(a), y = span.spring + R * sn, turnBy = side * (a + Math.PI / 2);
        if (y < low) continue;
        const at = (out) => [span.mid + side * (-span.half + (R + out) * cs), span.spring + (R + out) * sn];
        const [sx, sy] = at(0.13), [vx, vy] = at(0.36);
        flat.push(moved(turnedZ(box({ w: seg + 0.06, h: 0.26, d: 2 * hw - 0.1, color: ARENA[2] }), turnBy), sx, sy, 0));
        for (const s of [-1, 1]) flat.push(moved(turnedZ(bevelBox({ w: seg - 0.03, h: 0.72, d: 0.5, color: k & 1 ? DRESSED : ARENA[1], bevel: 0.06 }), turnBy), vx, vy, s * (hw - 0.08)));
      }
      yield* pause(slice);
    }
    // The deck: flags from the passage through the back curtain out onto the arena, lifted onto its rise and fall.
    const X_IN = xIn;
    flat.push(lifted(paved((x, z) => Math.abs(z) < B.half - 0.04 && x < X_IN && x > X1 + 0.1, X1, X_IN, -B.half, B.half, 1.2, 9131), deckY));
    for (let i = 1; i < B.profile.length; i++) {
      const a = Math.min(E, B.profile[i - 1][0]), b = Math.max(X1, B.profile[i][0]);
      if (a <= b) continue;
      // The fill under the flags, a slab a stretch of the profile, tipped to its slope.
      const ya = deckY(a), yb = deckY(b), len = Math.hypot(a - b, ya - yb);
      flat.push(moved(turnedZ(box({ w: len + 0.05, h: 0.5, d: 2 * hw - 0.3, color: "#2a2623" }), Math.atan2(ya - yb, a - b)), (a + b) / 2, (ya + yb) / 2 - 0.27, 0));
    }
    yield* pause(slice);
    for (const s of [-1, 1]) for (let x = E - 0.5; x > X1; x -= 1) {
      const z = s * (B.half + 0.35), y = deckY(x);
      flat.push(box({ w: 1.0, h: 0.3, d: 0.7, color: ARENA[0], offset: { x, y: y + 0.15, z } }));
      flat.push(bevelBox({ w: 0.56, h: 0.62, d: 0.5, color: ARENA[(Math.round(x) & 1) + 1], bevel: 0.07, offset: { x, y: y + 0.6, z } }));
      flat.push(bevelBox({ w: 1.03, h: 0.2, d: 0.84, color: DRESSED, bevel: 0.05, offset: { x, y: y + B.rail - 0.1, z } }));
    }
    yield* pause(slice);
    const bowl = () => lathe({ profile: [[0, 0], [0.16, 0], [0.12, 0.22], [0.42, 0.42], [0.46, 0.56], [0.38, 0.56], [0.32, 0.46], [0, 0.46]], segments: 10, color: IRON });
    for (const px of B.pillars) for (const s of [-1, 1]) {
      const z = s * B.pillarZ, deck = deckY(px), head = deck + B.rail + B.pillar, foot = px > moatEnd ? MOAT.bed - 0.4 : low;
      let k = 0;
      // Banded stone in taller courses the higher the pillar stands, so the tall ones are no more pieces than the low.
      const course = Math.max(1.1, (deck + B.rail - foot) / 14);
      for (let y = foot; y < deck + B.rail - 0.01; y += course, k++) { const h = Math.min(course, deck + B.rail - y); flat.push(bevelBox({ w: 2 * B.pillarR, h: h + 0.02, d: 2 * B.pillarR, color: ARENA[k % 3], bevel: 0.08, offset: { x: px, y: y + h / 2, z } })); }
      flat.push(bevelBox({ w: 2 * B.pillarR + 0.3, h: 0.24, d: 2 * B.pillarR + 0.3, color: DRESSED, bevel: 0.06, offset: { x: px, y: deck + B.rail + 0.12, z } }));
      for (let y = deck + B.rail + 0.24; y < head - 0.3; y += 1.1, k++) { const h = Math.min(1.1, head - 0.3 - y); flat.push(bevelBox({ w: 1.4, h: h + 0.02, d: 1.4, color: ARENA[k % 3], bevel: 0.07, offset: { x: px, y: y + h / 2, z } })); }
      flat.push(bevelBox({ w: 1.9, h: 0.3, d: 1.9, color: DRESSED, bevel: 0.08, offset: { x: px, y: head - 0.15, z } }));
      const nz = z - s * 0.71, ny = deck + B.rail + 1.0;
      flat.push(box({ w: 0.62, h: 1.7, d: 0.05, color: "#0b0b0d", offset: { x: px, y: ny + 0.85, z: nz } }), moved(turnedZ(box({ w: 0.44, h: 0.44, d: 0.05, color: "#0b0b0d" }), Math.PI / 4), px, ny + 1.7, nz));
      flat.push(box({ w: 0.2, h: 0.2, d: 0.06, color: "#ff7a1a", emissive: 0.9, offset: { x: px, y: ny + 0.22, z: nz - s * 0.01 } }));
      flat.push(moved(bowl(), px, head, z), box({ w: 0.5, h: 0.05, d: 0.5, color: "#ff7a1a", emissive: 1, offset: { x: px, y: head + 0.49, z } }));
    }
    return shaded([crag], flat);
  };
  const backBridge = cachedSteps(function* (slice = null) {
    return yield* archBridge(L.BACK_BRIDGE, 9127, 9131, CZ - MOAT.halfZ, CZ - YARD.halfZ - 0.05, slice);
  });
  // Outpost Island's four, one model (keep-layout.js `OUTPOST.bridge`) turned onto each arm.
  const outpostBridge = cachedSteps(function* (slice = null) {
    return yield* archBridge(L.OUTPOST.bridge, 9301, 9303, Infinity, L.OUTPOST.bridge.z0 - 0.05, slice);
  });
  // Timber: a deck of oak planks over the rectangle `R` at `y` (laid across its shorter side, `pw` wide), two stringers
  // under it, and posts down into the sea every `every` metres round it (or under all of it, `stilts`), the outer ones
  // standing `up` over the deck.
  const OAK = ["#5a4028", "#4f3823", "#65492e", "#463220"], OAK_D = "#34261a", ROPE = "#8a7350";
  const timberDeck = (parts, rand, R, y, { pw = 0.31, every = 2.6, up = 0.35, stilts = false } = {}) => {
    const w = R.x1 - R.x0, d = R.z1 - R.z0, alongX = w >= d, bed = L.SEA - 3, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    for (let t = 0; t < (alongX ? w : d) - 0.02; t += pw) {
      const len = Math.min(pw, (alongX ? w : d) - t) - 0.03, at = t + (len + 0.03) / 2, color = OAK[Math.floor(rand() * OAK.length)];
      parts.push(alongX ? box({ w: len, h: 0.08, d: d + (rand() - 0.5) * 0.1, color, offset: { x: R.x0 + at, y: y - 0.04, z: cz } }) : box({ w: w + (rand() - 0.5) * 0.1, h: 0.08, d: len, color, offset: { x: cx, y: y - 0.04, z: R.z0 + at } }));
    }
    for (const s of [-1, 1]) parts.push(alongX ? box({ w, h: 0.24, d: 0.18, color: OAK_D, offset: { x: cx, y: y - 0.2, z: cz + s * (d / 2 - 0.25) } }) : box({ w: 0.18, h: 0.24, d, color: OAK_D, offset: { x: cx + s * (w / 2 - 0.25), y: y - 0.2, z: cz } }));
    const nx = Math.max(1, Math.round(w / every)), nz = Math.max(1, Math.round(d / every));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const edge = i === 0 || i === nx || j === 0 || j === nz;
      if (!edge && !stilts) continue;
      const top = y + (edge ? up : -0.08), px = R.x0 + w * i / nx + (i === 0 ? 0.06 : i === nx ? -0.06 : 0), pz = R.z0 + d * j / nz + (j === 0 ? 0.06 : j === nz ? -0.06 : 0);
      parts.push(box({ w: 0.26, h: top - bed, d: 0.26, color: OAK_D, offset: { x: px, y: (top + bed) / 2, z: pz } }));
    }
  };
  // The shipyard's stone and timber (keep-layout.js `SHIPYARD`, `HALLS`), in the land's frame. `stone`: the quay, its
  // four faces in the arena's blocks, flagged, iron bollards down its west edge. `timber`: the piers, the slip's stage
  // and the rails down off its end into the water, the two halls' decks on their stilts, the planks onto the longships,
  // and the ramp up along the quay's edge with the brow from its head across to the galleon, railed on posts.
  const shipyard = cachedSteps(function* (slice = null) {
    const Y = L.SHIPYARD, Q = Y.quay, rand = mulberry32(8209), crag = geometry(), flat = [], low = L.SEA - 2.5, y = Y.y, B = L.WEST_BRIDGE;
    const rows = 4, ch = (y - low) / rows, nz = Math.round(Q.z1 - Q.z0), nx = Math.round(Q.x1 - Q.x0), cz = (Q.z1 - Q.z0) / nz, cx = (Q.x1 - Q.x0) / nx;
    blockFace(crag, rand, [Q.x0, low, Q.z0], [0, 0, 1], UP, [-1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    // Its east face, but where the stair comes down onto it.
    blockFace(crag, rand, [Q.x1, low, Q.z0], [0, 0, 1], UP, [1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG, (i) => Math.abs(Q.z0 + (i + 0.5) * cz - B.z) > B.halfW);
    for (const [z, n] of [[Q.z0, -1], [Q.z1, 1]]) blockFace(crag, rand, [Q.x0, low, z], [1, 0, 0], UP, [0, 0, n], nx, rows, cx, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    flat.push(box({ w: Q.x1 - Q.x0 - 0.2, h: y - low, d: Q.z1 - Q.z0 - 0.2, color: "#2a2623", offset: { x: (Q.x0 + Q.x1) / 2, y: (y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
    flat.push(moved(paved((x, z) => x > Q.x0 + 0.15 && x < Q.x1 - 0.15 && z > Q.z0 + 0.15 && z < Q.z1 - 0.15, Q.x0, Q.x1, Q.z0, Q.z1, 1.6, 8221), 0, y, 0));
    for (let z = Q.z0 + 6; z < Q.z1 - 2; z += 9.5) if (Math.abs(z - (Y.piers[0].z0 + Y.piers[0].z1) / 2) > 3) flat.push(moved(lathe({ profile: [[0, 0], [0.2, 0], [0.15, 0.12], [0.14, 0.5], [0.22, 0.58], [0, 0.62]], segments: 10, color: IRON }), Q.x0 + 0.4, y, z));
    const stone = shaded([crag], flat);
    yield* pause(slice);
    const wood = [];
    timberDeck(wood, rand, Y.piers[0], y);
    for (const p of Y.piers.slice(1)) timberDeck(wood, rand, p, y, { up: 1.0 });
    timberDeck(wood, rand, Y.slip, y, { pw: 0.5, every: 3.4, stilts: true, up: 0.2 });
    for (const h of L.HALLS) if (h.x0 < 0) timberDeck(wood, rand, h.deck, y, { pw: 0.5, every: 4, stilts: true, up: 1.0 });
    yield* pause(slice);
    // Mooring posts along the longships' pier, a turn of rope on each.
    for (let x = Y.piers[0].x0 + 3; x < Y.piers[0].x1 - 2; x += 7) for (const s of [-1, 1]) {
      const z = s < 0 ? Y.piers[0].z0 + 0.2 : Y.piers[0].z1 - 0.2;
      wood.push(moved(lathe({ profile: [[0, 0], [0.15, 0], [0.14, 0.62], [0.18, 0.66], [0, 0.72]], segments: 10, color: OAK_D }), x, y, z), moved(torus(0.17, 0.035, ROPE, 0, 10, 6), x, y + 0.3, z));
    }
    // The slip's two rails running on down into the water off its east end, and the cradle's sleepers across them.
    const SL = Y.slip, mz = (SL.z0 + SL.z1) / 2;
    for (const s of [-1, 1]) wood.push(beam(SL.x0 + 1, y + 0.1, mz + s * 1.6, SL.x1 + 7, L.SEA - 1.6, mz + s * 1.6, 0.26, OAK_D));
    for (let x = SL.x0 + 1.5; x < SL.x1; x += 1.7) wood.push(box({ w: 0.3, h: 0.22, d: 4.4, color: OAK[1], offset: { x, y: y + 0.11, z: mz } }));
    // The planks onto the longships: two boards each, cleated.
    for (const p of Y.planks) for (const s of [-1, 1]) wood.push(box({ w: 0.62, h: 0.07, d: p.z1 - p.z0 + 1.2, color: OAK[s < 0 ? 0 : 2], offset: { x: (p.x0 + p.x1) / 2 + s * 0.36, y: y + 0.05, z: (p.z0 + p.z1) / 2 } }));
    // The ramp and the brow: boards across, a stringer and a rail either side on posts.
    const R = Y.ramp, W = Y.brow, top = L.SEA + L.GALLEON.afloat, rise = (z) => (top - y) * Math.min(1, Math.max(0, (z - R.z0) / (R.z1 - R.z0)));
    for (let z = R.z0; z < R.z1 - 0.01; z += 0.4) wood.push(box({ w: R.x1 - R.x0, h: 0.09, d: 0.37, color: OAK[Math.floor(rand() * OAK.length)], offset: { x: (R.x0 + R.x1) / 2, y: y + rise(z + 0.2) - 0.03, z: z + 0.2 } }));
    for (const xs of [R.x0 + 0.08, R.x1 - 0.08]) {
      wood.push(beam(xs, y - 0.1, R.z0, xs, top - 0.14, R.z1, 0.2, OAK_D), beam(xs, y + 1.0, R.z0, xs, top + 1.0, R.z1, 0.1, OAK_D));
      for (let z = R.z0; z <= R.z1 + 0.01; z += 2) wood.push(box({ w: 0.16, h: rise(z) + 1.05, d: 0.16, color: OAK_D, offset: { x: xs, y: y + (rise(z) + 1.05) / 2, z } }));
    }
    for (let x = W.x0; x < W.x1 - 0.01; x += 0.4) wood.push(box({ w: 0.37, h: 0.09, d: W.z1 - W.z0, color: OAK[Math.floor(rand() * OAK.length)], offset: { x: x + 0.2, y: top - 0.045, z: (W.z0 + W.z1) / 2 } }));
    wood.push(beam(W.x0, top + 1.0, W.z1 - 0.08, W.x1, top + 1.0, W.z1 - 0.08, 0.1, OAK_D), beam(R.x0 + 0.08, top + 1.0, R.z1, R.x1, top + 1.0, W.z1 - 0.08, 0.1, OAK_D));
    for (const [px, pz] of [[R.x1 - 0.08, W.z1 - 0.08], [R.x0 + 0.5, W.z1 - 0.08], [R.x1 - 0.08, R.z1 + 1.2]]) wood.push(box({ w: 0.2, h: top + 1.05 - y, d: 0.2, color: OAK_D, offset: { x: px, y: (top + 1.05 + y) / 2, z: pz } }));
    return { stone, timber: merge(...wood) };
  });
  // The Armory & Forge's stone and timber (keep-layout.js `ARMORY`, its two `HALLS`), in the land's frame, as the
  // shipyard's: the quay, its four faces in the arena's blocks (open on the west where the stair comes down onto it),
  // flagged, iron bollards down its east edge; the two piers off its ends, and the halls' decks on their stilts.
  const armoryDock = cachedSteps(function* (slice = null) {
    const A = L.ARMORY, Q = A.quay, rand = mulberry32(8311), crag = geometry(), flat = [], low = L.SEA - 2.5, y = A.y, B = L.WEST_BRIDGE;
    const rows = 4, ch = (y - low) / rows, nz = Math.round(Q.z1 - Q.z0), nx = Math.round(Q.x1 - Q.x0), cz = (Q.z1 - Q.z0) / nz, cx = (Q.x1 - Q.x0) / nx;
    blockFace(crag, rand, [Q.x1, low, Q.z0], [0, 0, 1], UP, [1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    blockFace(crag, rand, [Q.x0, low, Q.z0], [0, 0, 1], UP, [-1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG, (i) => Math.abs(Q.z0 + (i + 0.5) * cz - B.z) > B.halfW);
    for (const [z, n] of [[Q.z0, -1], [Q.z1, 1]]) blockFace(crag, rand, [Q.x0, low, z], [1, 0, 0], UP, [0, 0, n], nx, rows, cx, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    flat.push(box({ w: Q.x1 - Q.x0 - 0.2, h: y - low, d: Q.z1 - Q.z0 - 0.2, color: "#2a2623", offset: { x: (Q.x0 + Q.x1) / 2, y: (y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
    flat.push(moved(paved((x, z) => x > Q.x0 + 0.15 && x < Q.x1 - 0.15 && z > Q.z0 + 0.15 && z < Q.z1 - 0.15, Q.x0, Q.x1, Q.z0, Q.z1, 1.6, 8323), 0, y, 0));
    for (let z = Q.z0 + 5; z < Q.z1 - 2; z += 9.5) flat.push(moved(lathe({ profile: [[0, 0], [0.2, 0], [0.15, 0.12], [0.14, 0.5], [0.22, 0.58], [0, 0.62]], segments: 10, color: IRON }), Q.x1 - 0.4, y, z));
    const stone = shaded([crag], flat);
    yield* pause(slice);
    const wood = [];
    for (const p of A.piers) timberDeck(wood, rand, p, y, { up: 1.0 });
    // The plank onto the small longship along its face: two boards, as the shipyard's.
    for (const p of A.planks) for (const s of [-1, 1]) wood.push(box({ w: p.x1 - p.x0 + 1.2, h: 0.07, d: 0.62, color: OAK[s < 0 ? 0 : 2], offset: { x: (p.x0 + p.x1) / 2, y: y + 0.05, z: (p.z0 + p.z1) / 2 + s * 0.36 } }));
    for (const h of L.HALLS) if (h.x0 > 0) timberDeck(wood, rand, h.deck, y, { pw: 0.5, every: 4, stilts: true, up: 1.0 });
    return { stone, timber: merge(...wood) };
  });
  // The volcano island's dock (keep-layout.js `VOLCANO.dock`), in the land's frame, as the shipyard's: `stone`, the
  // quay along the shore, its faces in the arena's blocks, flagged, iron bollards down its seaward edge; `timber`, the
  // oak pier out from its middle; and `glow`, the dull red light at the back of the cave mouth's cut.
  // A dock on an island's west shore, as CBDC's and Shards' are: the quay `D.quay` with its seaward face down to `low`
  // in `rows` of the arena's blocks, its pier `D.pier` out from its middle at `mid`.
  // With `east` its face to the sea is on the east instead, and with no `D.pier` it has none.
  const westQuay = function* (D, mid, low, rows, seed, flags, slice, east = false) {
    const Q = D.quay, rand = mulberry32(seed), crag = geometry(), flat = [], y = D.y, P = D.pier;
    const ch = (y - low) / rows, nz = Math.round(Q.z1 - Q.z0), nx = Math.round(Q.x1 - Q.x0), cz = (Q.z1 - Q.z0) / nz, cx = (Q.x1 - Q.x0) / nx;
    if (east) blockFace(crag, rand, [Q.x1, low, Q.z1], [0, 0, -1], UP, [1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    else blockFace(crag, rand, [Q.x0, low, Q.z0], [0, 0, 1], UP, [-1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    for (const [z, n] of [[Q.z0, -1], [Q.z1, 1]]) blockFace(crag, rand, [Q.x0, low, z], [1, 0, 0], UP, [0, 0, n], nx, rows, cx, ch, BIG_BLOCKS, BIG);
    yield* pause(slice);
    flat.push(box({ w: Q.x1 - Q.x0 - 0.2, h: y - low, d: Q.z1 - Q.z0 - 0.2, color: "#2a2623", offset: { x: (Q.x0 + Q.x1) / 2, y: (y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
    flat.push(moved(paved((x, z) => x > Q.x0 + 0.15 && x < Q.x1 - 0.15 && z > Q.z0 + 0.15 && z < Q.z1 - 0.15, Q.x0, Q.x1, Q.z0, Q.z1, 1.6, flags), 0, y, 0));
    for (let z = Q.z0 + 2.5; z < Q.z1 - 1; z += 6.4) if (Math.abs(z - mid) > 2.2) flat.push(moved(lathe({ profile: [[0, 0], [0.2, 0], [0.15, 0.12], [0.14, 0.5], [0.22, 0.58], [0, 0.62]], segments: 10, color: IRON }), east ? Q.x1 - 0.4 : Q.x0 + 0.4, y, z));
    const stone = shaded([crag], flat);
    yield* pause(slice);
    const wood = [];
    if (P) timberDeck(wood, rand, P, y, { up: 1.0 });
    return { stone, timber: merge(...wood) };
  };
  const volcanoDock = cachedSteps(function* (slice = null) {
    const V = L.VOLCANO, { stone, timber } = yield* westQuay(V.dock, V.z, L.SEA - 2.5, 4, 8419, 8423, slice);
    const M = V.mouth, glow = noShadow(box({ w: 0.2, h: M.spring + M.rise - 0.5, d: M.half * 2 - 0.4, color: "#7a1c08", emissive: 0.75, offset: { x: M.x1 - 0.15, y: V.court.y + (M.spring + M.rise - 0.5) / 2, z: V.z } }));
    return { stone, timber, glow };
  });
  // A stone quay standing in the open water, the rectangle `Q` at `y`: its four faces in the arena's blocks down to
  // `low` in `rows`, flagged over (Outpost Island's crosses).
  const seaQuay = (Q, y, low, rows, seed, flags) => {
    const rand = mulberry32(seed), crag = geometry(), flat = [], ch = (y - low) / rows, nz = Math.max(1, Math.round(Q.z1 - Q.z0)), nx = Math.max(1, Math.round(Q.x1 - Q.x0)), cz = (Q.z1 - Q.z0) / nz, cx = (Q.x1 - Q.x0) / nx;
    blockFace(crag, rand, [Q.x0, low, Q.z0], [0, 0, 1], UP, [-1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    blockFace(crag, rand, [Q.x1, low, Q.z1], [0, 0, -1], UP, [1, 0, 0], nz, rows, cz, ch, BIG_BLOCKS, BIG);
    for (const [z, n] of [[Q.z0, -1], [Q.z1, 1]]) blockFace(crag, rand, [Q.x0, low, z], [1, 0, 0], UP, [0, 0, n], nx, rows, cx, ch, BIG_BLOCKS, BIG);
    flat.push(box({ w: Q.x1 - Q.x0 - 0.2, h: y - low, d: Q.z1 - Q.z0 - 0.2, color: "#2a2623", offset: { x: (Q.x0 + Q.x1) / 2, y: (y + low) / 2 - 0.02, z: (Q.z0 + Q.z1) / 2 } }));
    flat.push(moved(paved((x, z) => x > Q.x0 + 0.15 && x < Q.x1 - 0.15 && z > Q.z0 + 0.15 && z < Q.z1 - 0.15, Q.x0, Q.x1, Q.z0, Q.z1, 1.6, flags), 0, y, 0));
    return shaded([crag], flat);
  };
  // Outpost Island's docks (keep-layout.js `OUTPOST`): each arm's stone cross and its timber pier; and its courtyard's
  // flags inside the inner curtain.
  const outpostDocks = cachedSteps(function* (slice = null) {
    const O = L.OUTPOST, D = O.dock, stone = [], wood = [], rand = mulberry32(9311);
    for (const a of O.arms) { stone.push(seaQuay(a.cross, D.y, L.SEA - 7, 6, 9313 + a.k, 9317 + a.k)); timberDeck(wood, rand, a.pier, D.y, { up: 1.0 }); yield* pause(slice); }
    const h = O.inner - CASTLE.wall - 0.2;
    const yard = moved(paved((x, z) => Math.max(Math.abs(x), Math.abs(z)) < h, -h, h, -h, h, 1.6, 9323), O.x, 0, O.z);
    return { stone: merge(...stone), timber: merge(...wood), yard };
  });
  // Shards' dock (keep-layout.js `SHARDS.dock`), CBDC's own, its quay's face going down into the deep water along it.
  const shardsDock = cachedSteps(function* (slice = null) {
    const S = L.SHARDS;
    return yield* westQuay(S.dock, S.z, S.dock.deep - 0.5, 9, 8609, 8611, slice);
  });
  // A longhouse on the docks (keep-layout.js `HALL`, `HALLS`), parts about its middle with its floor at y 0 and its
  // door in the middle of its +z side: `walls`, its four log walls (toward +z, -z, +x and -x in turn, each with the
  // round shields and the banners that hang on it, so the scene can take one out of the view's way), `frame` (carved
  // corner and door posts, the lintel, the door swung open and a torch bracket either side of it) and `roof`, a steep
  // gable of dark boards under a ridge pole, its barge boards crossing at both ends into dragons' heads.
  const HALL_LOG = ["#4a3524", "#40301f", "#553d29"], HALL_DARK = "#2a1f17", HALL_ROOF = ["#231c18", "#2b221c", "#1d1714"], ORANGE = "#d9611a", NIGHT = "#17151a";
  const longhouse = cached(() => {
    const H = L.HALL, h0 = L.HALLS[0], hx = (h0.x1 - h0.x0) / 2, hz = (h0.z1 - h0.z0) / 2, t = H.wall, course = 0.4, n = Math.round(H.eaves / course);
    const shield = (alt) => { const disc = (r, d, color) => turnedX(lathe({ profile: [[0, 0], [r, 0], [r * 0.96, d], [0, d]], segments: 12, color }), Math.PI / 2); return merge(disc(0.52, 0.06, NIGHT), disc(0.45, 0.09, alt ? NIGHT : ORANGE), disc(0.25, 0.12, alt ? ORANGE : NIGHT), disc(0.11, 0.17, "#f1ece2")); };
    const cloth = () => merge(box({ w: 0.9, h: 2.3, d: 0.04, color: NIGHT, offset: { y: -1.15 } }), box({ w: 0.9, h: 0.14, d: 0.05, color: ORANGE, offset: { y: -0.07 } }), box({ w: 0.3, h: 2.0, d: 0.05, color: ORANGE, offset: { y: -1.2 } }), box({ w: 0.9, h: 0.14, d: 0.05, color: ORANGE, offset: { y: -2.23 } }), box({ w: 1.1, h: 0.07, d: 0.07, color: IRON, offset: { y: 0.03 } }));
    // A long wall along x on z 0, looking out along +z, with a doorway in its middle or none.
    const long = (door) => {
      const parts = [];
      for (let k = 0; k < n; k++) {
        const y = (k + 0.5) * course, color = HALL_LOG[k % 3];
        if (door && k * course < H.doorTall) for (const s of [-1, 1]) parts.push(bevelBox({ w: hx - H.door, h: course + 0.02, d: t, color, bevel: 0.07, offset: { x: s * (hx + H.door) / 2, y, z: -t / 2 } }));
        else parts.push(bevelBox({ w: 2 * hx, h: course + 0.02, d: t, color, bevel: 0.07, offset: { x: 0, y, z: -t / 2 } }));
      }
      for (let k = 0, x = -hx + 1.4; x < hx - 1; x += door ? 2.6 : 2.0, k++) if (!door || Math.abs(x) > H.door + 1.9) parts.push(moved(shield(k & 1), x, 2.35, 0.02));
      if (door) for (const s of [-1, 1]) parts.push(moved(cloth(), s * (H.door + 1.15), 3.3, 0.1));
      return merge(...parts);
    };
    // A gable wall along z on x 0, looking out along +x: the same courses, then stepping in under the roof.
    const gable = () => {
      const parts = [], slope = hz + H.over;
      for (let k = 0; k * course < H.eaves + H.ridge - 0.3; k++) {
        const y = (k + 0.5) * course, half = Math.min(hz, slope * (1 - (y + course / 2 - H.eaves) / H.ridge) - 0.1);
        if (half > 0.2) parts.push(bevelBox({ w: t, h: course + 0.02, d: 2 * half, color: HALL_LOG[k % 3], bevel: 0.07, offset: { x: -t / 2, y, z: 0 } }));
      }
      for (const z of [-2.6, 0, 2.6]) parts.push(moved(models.turnedY(shield(z === 0), Math.PI / 2), 0.02, 2.5, z));
      return merge(...parts);
    };
    const walls = [long(true), models.turnedY(long(false), Math.PI), gable(), models.turnedY(gable(), Math.PI)];
    moved(walls[0], 0, 0, hz); moved(walls[1], 0, 0, -hz); moved(walls[2], hx, 0, 0); moved(walls[3], -hx, 0, 0);
    // The frame: a carved post at each corner and each side of the door, banded in orange; the lintel; the door.
    const frame = [], post = (x, z, h) => { frame.push(bevelBox({ w: 0.6, h, d: 0.6, color: HALL_DARK, bevel: 0.1, offset: { x, y: h / 2, z } })); for (const y of [0.5, h * 0.5, h - 0.45]) frame.push(box({ w: 0.64, h: 0.12, d: 0.64, color: ORANGE, offset: { x, y, z } })); };
    for (const sx of [-1, 1]) { for (const sz of [-1, 1]) post(sx * (hx - 0.1), sz * (hz - 0.1), H.eaves + 0.2); post(sx * (H.door + 0.25), hz - 0.1, H.doorTall + 0.5); }
    frame.push(bevelBox({ w: 2 * H.door + 1.4, h: 0.5, d: 0.66, color: HALL_DARK, bevel: 0.1, offset: { x: 0, y: H.doorTall + 0.3, z: hz - 0.1 } }));
    for (let x = -H.door; x <= H.door + 0.01; x += 0.6) frame.push(moved(turnedZ(box({ w: 0.22, h: 0.22, d: 0.7, color: ORANGE }), Math.PI / 4), x, H.doorTall + 0.3, hz - 0.1));
    for (let k = 0; k < 5; k++) frame.push(box({ w: 0.1, h: H.doorTall - 0.1, d: 0.42, color: k & 1 ? "#4a3524" : "#5d4530", offset: { x: -H.door - 0.02, y: H.doorTall / 2, z: hz + 0.3 + k * 0.44 } }));
    for (const y of [0.5, 1.7]) frame.push(box({ w: 0.13, h: 0.1, d: 2.2, color: IRON, offset: { x: -H.door - 0.02, y, z: hz + 1.2 } }));
    for (const s of [-1, 1]) frame.push(beam(s * (H.door + 0.25), 2.2, hz + 0.2, s * (H.door + 0.25), 2.6, hz + 0.75, 0.08, IRON), moved(lathe({ profile: [[0.04, 0], [0.2, 0.1], [0.22, 0.2], [0.16, 0.2], [0, 0.12]], segments: 8, color: IRON }), s * (H.door + 0.25), 2.56, hz + 0.75));
    // The roof: boards up both slopes, the ridge pole, and the barge boards crossing into dragons at each end.
    const roof = [], slope = hz + H.over, run = Math.hypot(slope, H.ridge), pitch = Math.atan2(H.ridge, slope), len = 2 * (hx + H.over), courses = Math.ceil(run / 0.62);
    for (const s of [-1, 1]) for (let k = 0; k < courses; k++) {
      const u = (k + 0.5) / courses;
      roof.push(moved(turnedX(box({ w: len + (k & 1 ? 0 : 0.12), h: 0.12, d: run / courses + 0.14, color: HALL_ROOF[k % 3] }), s * pitch), 0, H.eaves + H.ridge * u + 0.02 * (k & 1), s * slope * (1 - u)));
    }
    roof.push(bevelBox({ w: len + 0.5, h: 0.3, d: 0.3, color: HALL_DARK, bevel: 0.06, offset: { x: 0, y: H.eaves + H.ridge + 0.1, z: 0 } }));
    for (const sx of [-1, 1]) {
      const x = sx * (hx + H.over + 0.06);
      for (const s of [-1, 1]) {
        // From the eave up past the ridge, so the two cross; a head at each board's end, looking out and up.
        const over = 1.9, tz = -s * slope * over / run, ty = H.eaves + H.ridge + H.ridge * over / run;
        roof.push(beam(x, H.eaves - 0.25, s * (slope + 0.3), x, ty, tz, 0.26, HALL_DARK));
        roof.push(bevelBox({ w: 0.3, h: 0.44, d: 0.8, color: ORANGE, bevel: 0.08, offset: { x, y: ty + 0.22, z: tz - s * 0.3 } }), box({ w: 0.26, h: 0.14, d: 0.5, color: HALL_DARK, offset: { x, y: ty - 0.02, z: tz - s * 0.62 } }));
        roof.push(box({ w: 0.34, h: 0.1, d: 0.1, color: "#ffd86a", emissive: 1, offset: { x, y: ty + 0.3, z: tz - s * 0.4 } }), beam(x, ty + 0.4, tz + s * 0.05, x, ty + 0.95, tz + s * 0.5, 0.12, NIGHT));
      }
    }
    return { walls, frame: merge(...frame), roof: merge(...roof), size: { hx, hz } };
  });
  // The shipyard's dressing and the halls' furniture (keep-layout.js `SHIPYARD.props`, a hall's `inside`), each a part
  // with its foot at the origin: `yardProp(kind)`, or null for a kind the keep's halls build (keep-halls-models.js).
  // Valhodl's crates and barrels come from the set-dressing kit (dressing.js), as every place's do: each cluster a
  // part with its foot at the origin, its pieces put in a set of its own (kind, x, y, z, quarter turns; a y of "top"
  // stands a piece on the kit's crate), and `kit(kind)` its baked geometry and its pieces' pick spheres (`picks`, six
  // numbers a piece as the kit's `build` gives them: kind, variant, then x, y, z and radius in metres), which the
  // scenes make poke targets of. Null for a kind that is not one.
  const KIT_CLUSTERS = {
    crates: [["crate", -0.45, 0, -0.2, 0], ["crate", 0.5, 0, 0.35, 1], ["crate", -0.35, "top", -0.15, 2]],
    casks: [["barrel", -0.45, 0, 0.1, 0], ["barrel", 0.45, 0, -0.2, 1], ["barrel", 0.05, 0, 0.7, 2]],
    barrel: [["barrel", 0, 0, 0, 0]],
    barrels: [["barrel", -0.95, 0, 0, 0], ["barrel", 0, 0, 0, 1], ["barrel", 0.95, 0, 0, 2]],
    keg: [["barrel", 0, 0, 0, 3]]
  };
  const kits = new Map();
  const kit = (kind) => {
    const spec = KIT_CLUSTERS[kind];
    if (!spec) return null;
    if (!kits.has(kind)) {
      const D = BL.dressing, set = D.set(), top = D.loosePiece("crate", 0).bounds[4];
      for (const [k, x, y, z, turns] of spec) set.put(k, x, y === "top" ? top : y, z, turns);
      const out = set.build();
      kits.set(kind, { geometry: out.solid, picks: out.picks });
    }
    return kits.get(kind);
  };
  const YARD_PROPS = {
    // A timber crane: a post on a cross foot, a braced jib out along +z, its rope down to a hook, and the treadwheel
    // that winds it.
    crane: () => merge(box({ w: 2.4, h: 0.24, d: 0.3, color: OAK_D, offset: { y: 0.12 } }), box({ w: 0.3, h: 0.24, d: 2.4, color: OAK_D, offset: { y: 0.12 } }), box({ w: 0.36, h: 6.2, d: 0.36, color: OAK[1], offset: { y: 3.1 } }),
      beam(0, 5.6, -0.6, 0, 7.4, 4.6, 0.3, OAK[0]), beam(0, 3.2, 0.1, 0, 6.4, 2.4, 0.2, OAK_D), beam(0, 0.3, -1.0, 0, 3.0, -0.1, 0.18, OAK_D), beam(0.9, 0.3, 0, 0.1, 2.6, 0, 0.18, OAK_D), beam(-0.9, 0.3, 0, -0.1, 2.6, 0, 0.18, OAK_D),
      beam(0, 7.3, 4.4, 0, 2.2, 4.4, 0.05, ROPE), moved(lathe({ profile: [[0, 0], [0.16, 0.06], [0.18, 0.3], [0.05, 0.36], [0, 0.36]], segments: 8, color: IRON }), 0, 1.86, 4.4),
      moved(turnedZ(torus(1.2, 0.09, OAK[2], 0, 16, 6), Math.PI / 2), 0.55, 1.6, -0.9), ...[0, 1, 2, 3].map((k) => moved(turnedX(box({ w: 0.1, h: 2.4, d: 0.1, color: OAK_D }), k * Math.PI / 4), 0.55, 1.6, -0.9))),
    // Sawn timber stacked on bearers, its boards along z.
    lumber: () => { const rand = mulberry32(31), parts = [-1.4, 0, 1.4].map((z) => box({ w: 2.0, h: 0.16, d: 0.18, color: OAK_D, offset: { y: 0.08, z } })); for (let row = 0; row < 5; row++) for (let i = 0; i < 6 - (row > 3 ? 2 : 0); i++) parts.push(box({ w: 0.29, h: 0.13, d: 4 + (rand() - 0.5) * 0.5, color: OAK[Math.floor(rand() * 4)], offset: { x: -0.8 + i * 0.32 + (row > 3 ? 0.3 : 0), y: 0.23 + row * 0.14, z: (rand() - 0.5) * 0.3 } })); return merge(...parts); },
    crates: () => kit("crates").geometry,
    casks: () => kit("casks").geometry,
    coil: () => merge(...[0, 1, 2].map((k) => moved(torus(0.42 - k * 0.03, 0.07, ROPE, 0, 14, 6), 0, 0.07 + k * 0.13, 0))),
    // A longship half built on its cradle, its keel along +z: the keel and both posts, pairs of ribs, the first strakes
    // up one side, and shores under it.
    ribs: () => {
      const parts = [box({ w: 0.3, h: 0.34, d: 11, color: OAK_D, offset: { y: 0.55 } })], half = (a) => 1.9 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(a) / 5.6, 2.3)), 0.55);
      for (const s of [-1, 1]) parts.push(beam(0, 0.6, s * 5.3, 0, 2.0, s * 6.2, 0.3, OAK_D), beam(0, 2.0, s * 6.2, 0, 3.6, s * 6.5, 0.26, OAK_D));
      for (let a = -4.5; a <= 4.51; a += 1.0) { const w = half(a); for (const s of [-1, 1]) parts.push(beam(0, 0.55, a, s * w * 0.75, 0.9, a, 0.16, OAK[1]), beam(s * w * 0.75, 0.9, a, s * w, 2.1, a, 0.16, OAK[1])); parts.push(box({ w: 2.6, h: 0.2, d: 0.24, color: OAK_D, offset: { y: 0.1, z: a } })); }
      for (let k = 0; k < 3; k++) for (let a = -4.5; a < 4.5; a += 1.0) parts.push(beam(-half(a) * (0.78 + k * 0.08) - 0.06, 0.95 + k * 0.36, a, -half(a + 1) * (0.78 + k * 0.08) - 0.06, 0.95 + k * 0.36, a + 1, 0.07, OAK[k]));
      for (const a of [-3, 0, 3]) for (const s of [-1, 1]) parts.push(beam(s * 2.6, 0.1, a, s * half(a) * 0.9, 1.5, a, 0.14, OAK_D));
      return merge(...parts);
    },
    // The bar, its length along x and its front toward -z: a plank top on a boarded front banded in orange, horns and
    // mugs standing on it.
    bar: () => { const parts = [bevelBox({ w: 9.4, h: 0.12, d: 0.95, color: OAK[2], bevel: 0.04, offset: { y: 1.08 } }), box({ w: 9.2, h: 1.02, d: 0.14, color: HALL_DARK, offset: { y: 0.51, z: -0.34 } }), box({ w: 9.2, h: 0.12, d: 0.16, color: ORANGE, offset: { y: 0.8, z: -0.35 } })];
      for (let x = -4.4; x <= 4.41; x += 1.1) parts.push(box({ w: 0.2, h: 1.02, d: 0.2, color: OAK_D, offset: { x, y: 0.51, z: -0.36 } }));
      for (const x of [-3.5, -2.1, -0.4, 1.3, 3.2]) parts.push(moved(lathe({ profile: [[0, 0], [0.09, 0], [0.1, 0.2], [0.08, 0.2], [0.07, 0.03], [0, 0.03]], segments: 8, color: "#6b4a2b" }), x, 1.14, 0.1 * Math.sin(x * 3)), box({ w: 0.12, h: 0.03, d: 0.12, color: "#f1ece2", offset: { x, y: 1.35, z: 0.1 * Math.sin(x * 3) } }));
      return merge(...parts); },
    stool: () => merge(lathe({ profile: [[0, 0.56], [0.24, 0.56], [0.26, 0.62], [0, 0.62]], segments: 10, color: OAK[0] }), ...[0, 1, 2].map((k) => beam(Math.cos(k * 2.1) * 0.24, 0, Math.sin(k * 2.1) * 0.24, Math.cos(k * 2.1) * 0.12, 0.56, Math.sin(k * 2.1) * 0.12, 0.07, OAK_D))),
    // A long table along x with a bench down each side.
    longTable: () => merge(bevelBox({ w: 4.2, h: 0.1, d: 1.0, color: OAK[2], bevel: 0.03, offset: { y: 0.8 } }), ...[-1, 1].flatMap((s) => [box({ w: 0.16, h: 0.76, d: 0.8, color: OAK_D, offset: { x: s * 1.7, y: 0.38 } }), bevelBox({ w: 4.0, h: 0.08, d: 0.4, color: OAK[0], bevel: 0.03, offset: { y: 0.46, z: s * 0.95 } }), ...[-1.6, 1.6].map((x) => box({ w: 0.12, h: 0.42, d: 0.34, color: OAK_D, offset: { x, y: 0.21, z: s * 0.95 } }))]),
      ...[-1.2, 0.2, 1.4].map((x) => moved(lathe({ profile: [[0, 0], [0.09, 0], [0.1, 0.2], [0, 0.2]], segments: 8, color: "#6b4a2b" }), x, 0.85, 0.15 * Math.cos(x * 4))), box({ w: 0.5, h: 0.05, d: 0.34, color: "#8a6a2e", offset: { x: -0.4, y: 0.87 } })),
    // A settle: a bench with a tall boarded back, its front toward +z.
    settle: () => merge(bevelBox({ w: 2.4, h: 0.1, d: 0.6, color: OAK[0], bevel: 0.03, offset: { y: 0.46 } }), box({ w: 2.4, h: 1.5, d: 0.1, color: HALL_DARK, offset: { y: 0.75, z: -0.3 } }), box({ w: 2.4, h: 0.12, d: 0.12, color: ORANGE, offset: { y: 1.3, z: -0.29 } }),
      ...[-1, 1].flatMap((s) => [bevelBox({ w: 0.14, h: 1.7, d: 0.66, color: OAK_D, bevel: 0.04, offset: { x: s * 1.22, y: 0.85, z: -0.02 } })])),
    // The hearth: a ring of stones round a bed of embers with logs laid across it (the scene stands the fire).
    hearth: () => merge(lathe({ profile: [[0.55, 0], [0.95, 0], [0.92, 0.3], [0.6, 0.34], [0.55, 0.2]], segments: 12, color: ARENA[1] }), lathe({ profile: [[0, 0.16], [0.56, 0.16], [0.56, 0.2], [0, 0.22]], segments: 10, color: "#ff7a1a", emissive: 0.9 }),
      beam(-0.5, 0.3, -0.2, 0.5, 0.34, 0.25, 0.16, "#2a1c12"), beam(-0.4, 0.34, 0.3, 0.45, 0.3, -0.3, 0.15, "#33231a")),
    // Planks stood on end against a wall, leaning back along -z.
    planks: () => merge(...[-0.7, -0.35, 0, 0.35, 0.7].map((x, k) => beam(x, 0, 0.5, x, 3.0 + (k % 2) * 0.3, -0.25, 0.26, OAK[k % 4]))),
    // A board hung over a door, its face toward +z: a horn of mead on it, or a longship.
    signMead: () => merge(bevelBox({ w: 1.8, h: 0.8, d: 0.1, color: HALL_DARK, bevel: 0.04 }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: 0.3 } }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: -0.3 } }),
      box({ w: 0.36, h: 0.4, d: 0.14, color: "#8a6a2e", offset: { y: -0.02 } }), box({ w: 0.42, h: 0.1, d: 0.16, color: "#f1ece2", offset: { y: 0.2 } }), box({ w: 0.1, h: 0.24, d: 0.14, color: "#8a6a2e", offset: { x: 0.26, y: 0 } })),
    signWright: () => merge(bevelBox({ w: 1.8, h: 0.8, d: 0.1, color: HALL_DARK, bevel: 0.04 }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: 0.3 } }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: -0.3 } }),
      box({ w: 1.0, h: 0.12, d: 0.14, color: ORANGE, offset: { y: -0.14 } }), box({ w: 0.12, h: 0.3, d: 0.14, color: ORANGE, offset: { x: 0.5, y: 0.0 } }), box({ w: 0.12, h: 0.24, d: 0.14, color: ORANGE, offset: { x: -0.5, y: -0.02 } }), box({ w: 0.06, h: 0.36, d: 0.14, color: "#f1ece2", offset: { y: 0.08 } }), box({ w: 0.4, h: 0.2, d: 0.13, color: "#f1ece2", offset: { y: 0.1 } })),
    // The Armory & Forge's boards: a hammer over an anvil, and a flask of green brew under two stars, glowing.
    signForge: () => merge(bevelBox({ w: 1.8, h: 0.8, d: 0.1, color: HALL_DARK, bevel: 0.04 }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: 0.3 } }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: -0.3 } }),
      box({ w: 0.6, h: 0.1, d: 0.13, color: "#f1ece2", offset: { y: -0.12 } }), box({ w: 0.3, h: 0.12, d: 0.13, color: "#f1ece2", offset: { y: -0.2 } }), box({ w: 0.16, h: 0.07, d: 0.13, color: "#f1ece2", offset: { x: 0.34, y: -0.09 } }),
      moved(turnedZ(merge(box({ w: 0.06, h: 0.4, d: 0.13, color: ORANGE }), box({ w: 0.24, h: 0.11, d: 0.14, color: "#f1ece2", offset: { y: 0.2 } })), -0.6), -0.05, 0.1, 0)),
    signMagic: () => merge(bevelBox({ w: 1.8, h: 0.8, d: 0.1, color: HALL_DARK, bevel: 0.04 }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: 0.3 } }), box({ w: 1.6, h: 0.08, d: 0.12, color: ORANGE, offset: { y: -0.3 } }),
      box({ w: 0.3, h: 0.24, d: 0.13, color: "#7dffb0", emissive: 0.9, offset: { y: -0.1 } }), box({ w: 0.1, h: 0.14, d: 0.13, color: "#f1ece2", offset: { y: 0.08 } }), box({ w: 0.36, h: 0.04, d: 0.13, color: "#f1ece2", offset: { y: 0.03 } }),
      ...[-0.5, 0.5].map((x) => moved(turnedZ(box({ w: 0.12, h: 0.12, d: 0.13, color: "#ffd86a", emissive: 0.8 }), Math.PI / 4), x, 0.04, 0))),
    // The forge's furnace, its front toward +z and its back against a wall: a stone hearth with its firebox open on the
    // coals (the scene stands the fire, `FURNACE.fire`), a hooded stack stepping in over it and the flue on up through
    // the roof under a cap.
    furnace: () => {
      const parts = [], ST = ["#2c2d32", "#24252a", "#35363c"];
      for (let k = 0; k < 4; k++) parts.push(bevelBox({ w: 2.4 - (k === 3 ? 0.1 : 0), h: 0.32, d: 1.6, color: ST[k % 3], bevel: 0.05, offset: { y: 0.16 + k * 0.32 } }));
      parts.push(box({ w: 1.2, h: 0.62, d: 0.5, color: "#0d0b0a", offset: { y: 0.66, z: 0.58 } }), box({ w: 1.1, h: 0.12, d: 0.5, color: "#ff7a1a", emissive: 1, offset: { y: 0.4, z: 0.56 } }));
      for (let k = 0; k < 5; k++) parts.push(box({ w: 0.16, h: 0.08, d: 0.16, color: k & 1 ? "#ffb04a" : "#ff5a12", emissive: 1, offset: { x: -0.4 + k * 0.2, y: 0.5, z: 0.6 + (k % 2) * 0.08 } }));
      parts.push(bevelBox({ w: 1.5, h: 0.14, d: 0.12, color: ST[2], bevel: 0.03, offset: { y: 1.04, z: 0.82 } }));
      for (let k = 0; k < 4; k++) parts.push(bevelBox({ w: 2.2 - k * 0.42, h: 0.3, d: 1.4 - k * 0.24, color: ST[(k + 1) % 3], bevel: 0.05, offset: { y: 1.43 + k * 0.3, z: -0.1 - k * 0.06 } }));
      for (let k = 0; k < 10; k++) parts.push(bevelBox({ w: 0.82, h: 0.5, d: 0.82, color: ST[k % 3], bevel: 0.05, offset: { y: 2.8 + k * 0.48, z: -0.3 } }));
      parts.push(bevelBox({ w: 1.06, h: 0.16, d: 1.06, color: ST[2], bevel: 0.04, offset: { y: 7.6, z: -0.3 } }), box({ w: 0.5, h: 0.06, d: 0.5, color: "#0d0b0a", offset: { y: 7.69, z: -0.3 } }));
      // Tongs and a poker hung on the hearth's side.
      for (const [dx, h] of [[0, 0.9], [0.12, 1.0]]) parts.push(box({ w: 0.04, h, d: 0.04, color: IRON, offset: { x: 1.24 + dx, y: 1.3 - h / 2, z: 0.3 } }));
      return merge(...parts);
    },
    // Bellows on a timber stand, their nozzle toward +x: two boards with leather between, a handle at their back.
    bellows: () => merge(...[-0.3, 0.3].map((z) => box({ w: 0.1, h: 0.5, d: 0.1, color: OAK_D, offset: { x: -0.3, y: 0.25, z } })), ...[-0.3, 0.3].map((z) => box({ w: 0.1, h: 0.5, d: 0.1, color: OAK_D, offset: { x: 0.3, y: 0.25, z } })),
      box({ w: 0.9, h: 0.06, d: 0.75, color: OAK[0], offset: { y: 0.52 } }), moved(turnedZ(box({ w: 1.0, h: 0.06, d: 0.62, color: OAK[2] }), -0.18), 0, 0.82, 0), box({ w: 0.86, h: 0.24, d: 0.56, color: "#3a2416", offset: { x: -0.05, y: 0.66 } }),
      beam(0.45, 0.66, 0, 0.9, 0.6, 0, 0.07, IRON), beam(-0.5, 0.92, 0, -0.85, 1.0, 0, 0.06, OAK_D), box({ w: 0.06, h: 0.06, d: 0.4, color: OAK_D, offset: { x: -0.86, y: 1.0 } })),
    // A stone trough of water to quench in, its length along x, a blade cooling in it.
    quench: () => merge(bevelBox({ w: 1.7, h: 0.6, d: 0.7, color: "#2c2d32", bevel: 0.05, offset: { y: 0.3 } }), box({ w: 1.5, h: 0.04, d: 0.5, color: "#16303e", offset: { y: 0.56 } }),
      moved(turnedZ(box({ w: 0.9, h: 0.04, d: 0.06, color: "#8d939c" }), 0.5), 0.35, 0.68, 0.05), box({ w: 0.08, h: 0.24, d: 0.08, color: OAK_D, offset: { x: 0.74, y: 0.92, z: 0.05 } })),
    // A heap of coal with a shovel stood in it.
    coal: () => { const rand = mulberry32(53), parts = [lathe({ profile: [[0, 0], [0.75, 0], [0.55, 0.22], [0.2, 0.42], [0, 0.45]], segments: 10, color: "#151517" })];
      for (let k = 0; k < 14; k++) { const a = rand() * TAU, r = rand() * 0.6; parts.push(box({ w: 0.14, h: 0.1, d: 0.12, color: k % 5 ? "#232327" : "#ff6a1a", emissive: k % 5 ? 0 : 0.8, offset: { x: Math.cos(a) * r, y: 0.42 - r * 0.5, z: Math.sin(a) * r } })); }
      parts.push(beam(0.2, 0.3, 0.1, 0.45, 1.3, 0.3, 0.05, OAK_D), box({ w: 0.24, h: 0.3, d: 0.03, color: IRON, offset: { x: 0.16, y: 0.24, z: 0.07 } }));
      return merge(...parts); },
    // A suit of plate on a stand, facing +z: a breastplate, pauldrons, a mail skirt and a helm.
    armour: () => { const ST = "#8d939c", SD = "#5f646c";
      return merge(lathe({ profile: [[0, 0], [0.35, 0], [0.35, 0.08], [0, 0.08]], segments: 12, color: OAK_D }), box({ w: 0.08, h: 1.6, d: 0.08, color: OAK_D, offset: { y: 0.8 } }), box({ w: 0.8, h: 0.07, d: 0.07, color: OAK_D, offset: { y: 1.5 } }),
        bevelBox({ w: 0.56, h: 0.6, d: 0.36, color: ST, bevel: 0.08, offset: { y: 1.22 } }), box({ w: 0.5, h: 0.06, d: 0.38, color: ORANGE, offset: { y: 1.0 } }), bevelBox({ w: 0.6, h: 0.36, d: 0.34, color: SD, bevel: 0.05, offset: { y: 0.78 } }),
        ...[-1, 1].map((sx) => bevelBox({ w: 0.26, h: 0.18, d: 0.34, color: ST, bevel: 0.06, offset: { x: sx * 0.36, y: 1.52 } })),
        moved(lathe({ profile: [[0, 0], [0.17, 0], [0.19, 0.16], [0.16, 0.32], [0, 0.36]], segments: 10, color: ST }), 0, 1.6, 0), box({ w: 0.2, h: 0.03, d: 0.04, color: "#17130f", offset: { y: 1.8, z: 0.16 } })); },
    // A lectern, its slope toward +z, a spellbook open on it, its runes glowing.
    lectern: () => merge(lathe({ profile: [[0, 0], [0.32, 0], [0.3, 0.08], [0.1, 0.12], [0.08, 1.0], [0, 1.0]], segments: 10, color: OAK_D }),
      moved(turnedX(box({ w: 0.7, h: 0.06, d: 0.5, color: OAK[0] }), 0.5), 0, 1.08, 0), moved(turnedX(merge(box({ w: 0.62, h: 0.05, d: 0.42, color: "#e6dcc0" }), box({ w: 0.02, h: 0.06, d: 0.42, color: "#5a2a3a" }),
        ...[-0.18, 0.18].flatMap((x) => [0.1, 0, -0.1].map((z) => box({ w: 0.16, h: 0.012, d: 0.03, color: "#7dffb0", emissive: 0.9, offset: { x, y: 0.03, z } })))), 0.5), 0, 1.13, 0.02)),
    // A cluster of crystals on a rock, glowing violet and teal.
    crystals: () => { const rand = mulberry32(61), parts = [lathe({ profile: [[0, 0], [0.55, 0], [0.45, 0.2], [0, 0.3]], segments: 8, color: "#2a2620" })];
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rand(), r = k ? 0.25 : 0, h = (k ? 0.5 : 0.95) + rand() * 0.3, tilt = k ? 0.3 + rand() * 0.2 : 0;
        parts.push(moved(turnedZ(models.turnedY(lathe({ profile: [[0, 0], [0.09, 0], [0.1, h * 0.75], [0, h]], segments: 6, color: k % 2 ? "#b18aff" : "#6ff0e0", emissive: 0.75 }), a), tilt), Math.cos(a) * r, 0.22, Math.sin(a) * r)); }
      return noShadow(merge(...parts)); },
    // Herbs hung to dry from a rail along x, the rail at the origin on two rods up to the eaves.
    herbs: () => { const rand = mulberry32(67), parts = [box({ w: 3.2, h: 0.06, d: 0.06, color: OAK_D }), ...[-1.4, 1.4].map((x) => box({ w: 0.04, h: 1.1, d: 0.04, color: IRON, offset: { x, y: 0.55 } }))];
      for (let x = -1.3; x <= 1.31; x += 0.32) { const h = 0.35 + rand() * 0.3, c = ["#5f7a3a", "#7a8a4a", "#8a6a3a", "#4a6a4a", "#9a7aa8"][Math.floor(rand() * 5)];
        parts.push(box({ w: 0.01, h: 0.14, d: 0.01, color: "#8a7350", offset: { x, y: -0.07 } }), box({ w: 0.14, h, d: 0.12, color: c, offset: { x, y: -0.14 - h / 2 } })); }
      return noShadow(merge(...parts)); },
    // A wrought candle-tree: three rings of candles on a stem, their flames lit.
    candles: () => { const parts = [lathe({ profile: [[0, 0], [0.26, 0], [0.22, 0.05], [0.04, 0.1], [0.04, 1.4], [0, 1.4]], segments: 8, color: IRON })];
      for (const [y, r, n] of [[0.8, 0.3, 6], [1.1, 0.2, 4], [1.4, 0, 1]]) { if (r) parts.push(moved(torus(r, 0.02, IRON, 0, 12, 4), 0, y, 0));
        for (let k = 0; k < n; k++) { const a = k / n * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r; parts.push(box({ w: 0.05, h: 0.18, d: 0.05, color: "#efe6d2", offset: { x, y: y + 0.09, z } }), box({ w: 0.035, h: 0.06, d: 0.035, color: "#ffd27a", emissive: 1, offset: { x, y: y + 0.21, z } })); } }
      return merge(...parts); }
  };
  // Where the furnace's fire burns in its firebox, in its own frame.
  const FURNACE = { fire: { y: 0.46, z: 0.42 } };
  const yardProps = new Map();
  const yardProp = (kind) => {
    if (!YARD_PROPS[kind]) return null;
    if (!yardProps.has(kind)) yardProps.set(kind, YARD_PROPS[kind]());
    return yardProps.get(kind);
  };
  // The galleon moored at the shipyard (keep-layout.js `GALLEON`), in its own frame at its own size, its bow toward +z
  // and the waterline at y 0: the longship's design grown tall. `hull`: voxels a quarter of a metre across in the
  // same orange and black strakes, its sides rising to a forecastle and, aft, a quarterdeck and a poop over it, a
  // stair either side up to each, a rail across each deck's break, gunports down both sides, lit windows round the
  // stern, and the longship's dragon at its stem, breathing the same fire. `rig`: three masts and their yards, the
  // stays and shrouds, and three great lanterns over the stern. `sails`: square sails in the longship's stripes, the
  // logo on the main course. `guns`: a cannon's barrel (`cannon`) run out of every port.
  const GALLEON_LIGHTS = [[0, 13.4, -29.4, 16], [0, 7.4, 4, 13], [0, 13.5, 35.6, 12]];
  const galleon = cachedSteps(function* (slice = null) {
    const G = L.GALLEON, u = 0.25, X0 = -9, Y0 = -3.75, Z0 = -34, NX = 72, NY = 102, NZ = 300, g = T.makeGrid(NX, NY, NZ), K = tools(g);
    const BLK = 1, BLK2 = 2, OR = 3, OR_D = 4, OR_L = 5, DECK = 6, DECK2 = 7, BONE = 8, FIRE = 9, EYE = 10;
    const cx = (v) => (v - X0) / u, cy = (v) => (v - Y0) / u, cz = (v) => (v - Z0) / u;
    const keelAt = (a) => -G.keel * (1 - Math.pow(Math.min(1, Math.abs(a) / G.bow), 3));
    const widthAt = (a, y) => L.galleonHalf(a) * Math.min(1, Math.pow(Math.max(0, (y - keelAt(a)) / (2.5 - keelAt(a))), 0.5));
    const PORTS = L.GALLEON.ports, PORT_Y = L.GALLEON.portY;
    for (let iz = 0; iz < NZ; iz++) {
      if ((iz & 15) === 0) yield* pause(slice);
      const a = Z0 + (iz + 0.5) * u;
      if (a >= G.bow || a <= -G.bow + 0.5) continue;
      const sh = L.galleonSheer(a), kl = keelAt(a), port = PORTS.some((p) => Math.abs(a - p) < 0.5);
      // A lit window every few metres under the quarterdeck and the poop, and all across the stern.
      const lit = a < G.quarter.z1 - 1 && Math.floor(a / 0.75) % 4 === 0, stern = a < -G.bow + 1.6;
      for (let iy = 0; iy < NY; iy++) {
        const y = Y0 + (iy + 0.5) * u;
        if (y < kl || y > sh) continue;
        for (let ix = 0; ix < NX; ix++) {
          const x = X0 + (ix + 0.5) * u, ax = Math.abs(x), w = widthAt(a, y);
          if (ax > w) continue;
          const shell = ax > w - 0.75 || stern, top = L.galleonTop(a, x);
          if (!shell && y > top) continue;
          if (!shell && y > top - u) { K.set(ix, iy, iz, Math.floor(ax / 0.75) & 1 ? DECK : DECK2); continue; }
          const row = Math.floor((y - 0.3) / 0.75);
          let c = y < 0.3 || y > sh - 0.3 ? BLK : [OR, BLK, OR_D, OR, BLK2][((row % 5) + 5) % 5];
          if (y > sh - 0.6 && y <= sh - 0.3) c = OR_L;
          const skin = ax > w - 0.26 || (stern && a < -G.bow + 0.76);
          if (skin && port && Math.abs(y - PORT_Y) < 0.5 && !stern) c = BLK;
          else if (skin && ((lit && y > G.deck + 0.6 && y < G.deck + 1.6) || (lit && a < G.poop.z1 - 1 && y > G.quarter.top + 0.6 && y < G.quarter.top + 1.6))) c = FIRE;
          else if (skin && stern && ix % 3 !== 0 && ((y > G.deck + 0.5 && y < G.deck + 1.7) || (y > G.quarter.top + 0.5 && y < G.quarter.top + 1.7))) c = FIRE;
          K.set(ix, iy, iz, c);
        }
      }
    }
    yield* pause(slice);
    const blob = (x, y, z, rx, ry, rz, m) => K.shape(cx(x - rx), cx(x + rx) + 1, cy(y - ry), cy(y + ry) + 1, cz(z - rz), cz(z + rz) + 1, (i, j, k) => ((X0 + (i + 0.5) * u - x) / rx) ** 2 + ((Y0 + (j + 0.5) * u - y) / ry) ** 2 + ((Z0 + (k + 0.5) * u - z) / rz) ** 2 <= 1, m);
    const slab = (x0, x1, y0, y1, z0, z1, m) => K.box(Math.round(cx(x0)), Math.round(cx(x1)), Math.round(cy(y0)), Math.round(cy(y1)), Math.round(cz(z0)), Math.round(cz(z1)), m);
    // A lid propped open over every port, and a rail across each deck's break between its two stairs.
    for (const p of PORTS) for (const s of [-1, 1]) { const w = L.galleonHalf(p); slab(s > 0 ? w - 0.1 : -w - 0.4, s > 0 ? w + 0.4 : -w + 0.1, PORT_Y + 0.5, PORT_Y + 0.75, p - 0.6, p + 0.6, OR_L); }
    for (const [a, top] of [[G.fore.z0 + 0.1, G.fore.top], [G.quarter.z1 - 0.35, G.quarter.top], [G.poop.z1 - 0.35, G.poop.top]]) {
      slab(-G.stairs[0], G.stairs[0], top + 0.9, top + 1.15, a, a + 0.25, BLK);
      for (let x = -G.stairs[0]; x <= G.stairs[0] + 0.01; x += 0.65) slab(x - 0.12, x + 0.13, top, top + 0.9, a, a + 0.25, OR_D);
    }
    yield* pause(slice);
    // The longship's dragon (`warship`), at half its size, its neck rising out of the stem.
    const k = 0.5, DZ = (z) => 27.6 + (z - 45) * k, DY = (y) => 9.2 + (y - 13) * k;
    const dblob = (x, y, z, rx, ry, rz, m) => blob(x * k, DY(y), DZ(z), Math.max(0.3, rx * k), Math.max(0.3, ry * k), Math.max(0.3, rz * k), m);
    const dslab = (x0, x1, y0, y1, z0, z1, m) => slab(x0 * k, x1 * k, DY(y0), DY(y1), DZ(z0), DZ(z1), m);
    const scales = (i, j, n) => { const h = hash3(i >> 1, j >> 1, n >> 1); return h < 0.45 ? OR : h < 0.75 ? OR_D : OR_L; };
    const hide = (i, j, n) => hash3(i >> 1, j >> 1, n >> 1) < 0.7 ? BLK : BLK2;
    const NECK = [[45.5, 13], [47.5, 15.6], [49.6, 18.2], [51.8, 20.6], [54, 22.8], [56, 24.4]];
    NECK.forEach(([z, y], i) => { const r = 2.6 - i * 0.14; dblob(0, y, z, r * 0.82, r, r, (a, b, c) => (Z0 + (c + 0.5) * u - DZ(z)) * 0.7 - (Y0 + (b + 0.5) * u - DY(y)) * 0.5 > 0.1 ? scales(a, b, c) : hide(a, b, c)); });
    NECK.forEach(([z, y], i) => { if (i) dblob(0, y + 2.3 - i * 0.1, z - 1.9, 0.4, 1.3, 0.8, BLK); });
    dblob(0, 25.3, 58.2, 2.5, 2.3, 3.6, (a, b, c) => Y0 + (b + 0.5) * u > DY(26.3) ? hide(a, b, c) : scales(a, b, c));
    dblob(0, 23.4, 58.0, 2.0, 1.7, 1.6, OR_D);
    dblob(0, 25.4, 62.4, 1.9, 1.25, 3.6, (a, b, c) => Y0 + (b + 0.5) * u > DY(25.9) ? hide(a, b, c) : scales(a, b, c));
    dblob(0, 26.3, 64.8, 1.1, 0.7, 1.1, BLK);
    dblob(0, 21.4, 61.0, 1.6, 0.8, 3.5, scales);
    dslab(-1.0, 1.0, 22.2, 24.2, 58.4, 63.2, FIRE); dslab(-0.6, 0.6, 22.6, 23.8, 57.2, 58.4, EYE);
    for (let z = 59.2; z < 65.2; z += 1.2) for (const sx of [-1, 1]) dslab(sx > 0 ? 1.0 : -1.5, sx > 0 ? 1.5 : -1.0, 23.3, 24.3, z, z + 0.5, BONE);
    for (const sx of [-1, 1]) { dslab(sx > 0 ? 2.0 : -2.6, sx > 0 ? 2.6 : -2.0, 25.5, 26.5, 59.4, 60.6, EYE); dblob(sx * 2.0, 26.9, 59.8, 0.9, 0.55, 1.5, BLK); }
    for (const sx of [-1, 1]) {
      for (let t = 0; t <= 1.001; t += 0.05) { const r = 0.95 * (1 - t) + 0.34; dblob(sx * (1.5 + 1.9 * t), 27 + 8 * Math.pow(t, 0.8), 57.4 - 8.5 * t + 3 * t * t, r, r, r, BLK); }
      for (let t = 0; t <= 1.001; t += 0.08) { const r = 0.6 * (1 - t) + 0.3; dblob(sx * (2.2 + 1.6 * t), 25.4 + 3.2 * t, 56.2 - 4.2 * t, r, r, r, BLK); }
    }
    // Orange spines down the forecastle's stem, as down the longship's bow.
    for (let a = 21; a <= 27; a += 1.6) blob(0, L.galleonSheer(a) + 0.5, a, 0.3, 0.8, 0.5, (i, j) => j & 1 ? OR : OR_L);
    yield* pause(slice);
    const pal = WARSHIP_HEX.map((c) => c && hexToRgb(c));
    const hull = yield* T.gridGeometrySteps(g, { unit: u, palette: pal, origin: { x: X0, y: Y0, z: Z0 } }, slice);
    for (const f of hull.faces) if (f.color === pal[FIRE] || f.color === pal[EYE]) f.emissive = 1;
    yield* pause(slice);
    // The rig: each mast with its yards, a stay fore and aft, shrouds to both rails; the stern's three lanterns on
    // their irons and a fire bowl on the main deck.
    const IRONC = "#2a2a2e", SPAR = "#241b14", rig = [], sails = [];
    // Each mast: where it stands, the deck it stands on, its head, and its sails from the lowest up ([top, foot, half]).
    const MASTS = [{ z: 19, deck: G.fore.top, top: 31, thick: 0.6, sails: [[20, 10.2, 8.2], [29.4, 21.6, 6.2]] }, { z: 2, deck: G.deck, top: 39, thick: 0.75, sails: [[23.4, 8.2, 10.5], [36.8, 25.2, 8] ], logo: true },
      { z: -15.5, deck: G.quarter.top, top: 28, thick: 0.5, sails: [[24, 11.6, 6.6]] }];
    const STRIPES = [0.1, 0.17, 0.3, 0.7, 0.83, 0.9, 1];
    for (const m of MASTS) {
      rig.push(beam(0, m.deck - 0.4, m.z, 0, m.top, m.z, m.thick, SPAR), box({ w: 0.9, h: 0.6, d: 0.05, color: "#d9611a", offset: { x: 0.45, y: m.top - 0.4, z: m.z } }));
      rig.push(beam(0, m.top - 0.6, m.z, 0, L.galleonSheer(Math.min(G.bow - 1, m.z + 12)), Math.min(G.bow - 1, m.z + 12), 0.08, IRONC), beam(0, m.top - 0.6, m.z, 0, L.galleonSheer(Math.max(-G.bow + 1, m.z - 11)), Math.max(-G.bow + 1, m.z - 11), 0.08, IRONC));
      for (const sx of [-1, 1]) for (const dz of [-3, -1.2, 0.6]) rig.push(beam(0, m.top - 3, m.z, sx * (L.galleonHalf(m.z + dz) - 0.2), L.galleonSheer(m.z + dz), m.z + dz, 0.06, IRONC));
      m.sails.forEach(([top, foot, half], n) => {
        const belly = half * 0.16, zOf = (x, y) => m.z + 0.7 + belly * Math.sin(Math.PI * (top - y) / (top - foot)) * (1 - 0.5 * (x / half) ** 2);
        rig.push(beam(-half - 0.5, top + 0.5, m.z + 0.6, half + 0.5, top + 0.5, m.z + 0.6, 0.36, SPAR));
        const cols = Math.round(2 * half), rows = Math.max(3, Math.round((top - foot) / 2.2)), cw = 2 * half / cols, rh = (top - foot) / rows;
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          const x = -half + (c + 0.5) * cw, y = top - (r + 0.5) * rh, f = (c + 0.5) / cols, stripe = STRIPES.findIndex((e) => f < e);
          sails.push(box({ w: cw + 0.02, h: rh + 0.02, d: 0.22, color: stripe & 1 ? (r & 1 ? "#141216" : "#1b181d") : (r & 1 ? "#d9611a" : "#e06a1f"), offset: { x, y, z: zOf(x, y) } }));
        }
        if (!m.logo || n) return;
        // The logo on both faces of the main course, as on the longship's sail.
        const px = 0.085, logoTop = (top + foot) / 2 + SAIL_LOGO.length * px / 2, mid = (SAIL_LOGO[0].length - 1) / 2;
        SAIL_LOGO.forEach((line, r) => {
          for (let c = 0; c < line.length;) {
            if (line[c] !== "X") { c++; continue; }
            let e = c;
            while (e + 1 < line.length && line[e + 1] === "X" && e - c < 7) e++;
            const w = (e - c + 1) * px, at = ((c + e) / 2 - mid) * px, y = logoTop - (r + 0.5) * px;
            for (const side of [1, -1]) { const x = side * at; sails.push(box({ w: w + 0.01, h: px + 0.01, d: 0.1, color: "#f4f1ea", emissive: 0.3, offset: { x, y, z: zOf(x, y) + side * 0.15 } })); }
            c = e + 1;
          }
        });
      });
    }
    const lantern = (x, y, z, s) => [beam(x, y - 1.6 * s, z + 0.3, x, y - 0.5 * s, z, 0.09, IRONC), moved(lathe({ profile: [[0, -0.5 * s], [0.34 * s, -0.4 * s], [0.42 * s, 0.3 * s], [0.2 * s, 0.6 * s], [0, 0.75 * s]], segments: 8, color: "#ffb030", emissive: 1 }), x, y, z),
      moved(lathe({ profile: [[0.36 * s, -0.46 * s], [0.46 * s, -0.4 * s], [0.46 * s, -0.3 * s], [0.36 * s, -0.36 * s]], segments: 8, color: IRONC }), x, y, z), moved(lathe({ profile: [[0, 0.6 * s], [0.3 * s, 0.56 * s], [0.06 * s, 0.95 * s], [0, 1.0 * s]], segments: 8, color: IRONC }), x, y, z)];
    rig.push(...lantern(0, 13.2, -29.6, 1.3), ...lantern(-2.6, 12.2, -29.2, 0.9), ...lantern(2.6, 12.2, -29.2, 0.9));
    rig.push(moved(lathe({ profile: [[0, 0], [0.4, 0], [0.24, 0.7], [0.85, 1.25], [0.92, 1.55], [0, 1.55]], segments: 10, color: IRONC }), 0, G.deck, 6), noShadow(moved(lathe({ profile: [[0, 0], [0.8, 0], [0.4, 0.7], [0, 1.15]], segments: 8, color: "#ff8a2a", emissive: 1 }), 0, G.deck + 1.55, 6)));
    yield* pause(slice);
    // The guns: the cannon's barrel half again as big, run out of every port.
    const guns = [], S = L.GALLEON.gun, barrel = cannon().barrel;
    for (const p of PORTS) for (const sx of [-1, 1]) {
      const b = models.turnedY(merge(barrel), sx * Math.PI / 2), v = b.verts;
      for (let i = 0; i < v.length; i++) v[i] *= S;
      guns.push(moved(b, sx * (L.galleonHalf(p) - 1.5), PORT_Y - 0.05, p));
    }
    return { hull, rig: merge(...rig), sails: noShadow(merge(...sails)), guns: merge(...guns) };
  });
  // A longship's deck guns (keep-layout.js `LONGSHIP.guns`), in the hull's own frame: `n` a side, each the turrets'
  // cannon on its carriage, its muzzle out over the rail, on a low stand where the rail wants it lifted.
  const longshipGuns = variants((n) => {
    const G = L.LONGSHIP.guns[n], C = cannon(), out = [];
    for (const a of G.at) for (const sx of [-1, 1]) {
      const gun = models.turnedY(merge(C.carriage, moved(merge(C.barrel), 0, CANNON.y, 0.25)), sx * Math.PI / 2), v = gun.verts, x = sx * (L.longshipHalf(a) - 1.35 * G.size);
      for (let i = 0; i < v.length; i++) v[i] *= G.size;
      out.push(moved(gun, x, L.LONGSHIP.deck + G.lift, a));
      if (G.lift > 0) out.push(box({ w: 2.7 * G.size, h: G.lift, d: 1.5 * G.size, color: "#34261a", offset: { x: x - sx * 0.3 * G.size, y: L.LONGSHIP.deck + G.lift / 2, z: a } }));
    }
    return merge(...out);
  });
  // A ship's helm, a part, its foot at the origin on the deck and the bow toward +z: a spoked wheel on an oak post,
  // and the helmsman's stool behind it (`HELM`: the stool's top and how far behind the post it stands).
  const HELM = { y: 0.5, z: -1.05 };
  const helm = cached(() => {
    const OAKL = "#5a4028", OAKD = "#34261a", BRASS = "#b8862e", parts = [], R = 0.56, Y = 1.22, Z = -0.24;
    parts.push(bevelBox({ w: 0.3, h: 1.1, d: 0.3, color: OAKD, bevel: 0.04, offset: { x: 0, y: 0.55, z: 0 } }), bevelBox({ w: 0.5, h: 0.12, d: 0.5, color: OAKL, bevel: 0.03, offset: { x: 0, y: 0.06, z: 0 } }));
    parts.push(moved(turnedX(torus(R, 0.05, OAKL, 0, 16, 6), Math.PI / 2), 0, Y, Z), moved(turnedX(lathe({ profile: [[0, -0.07], [0.12, -0.07], [0.12, 0.07], [0, 0.07]], segments: 8, color: BRASS }), Math.PI / 2), 0, Y, Z));
    parts.push(beam(0, Y, Z, 0, Y, 0, 0.07, OAKD));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, cs = Math.cos(a), sn = Math.sin(a); parts.push(beam(0, Y, Z, cs * (R + 0.16), Y + sn * (R + 0.16), Z, 0.045, OAKL)); }
    parts.push(moved(lathe({ profile: [[0, 0], [0.24, 0], [0.22, HELM.y - 0.08], [0.27, HELM.y - 0.04], [0.27, HELM.y], [0, HELM.y]], segments: 10, color: OAKD }), 0, 0, HELM.z));
    return merge(...parts);
  });
  // A standing banner, in its own frame, its foot at the origin and its cloth facing along +z: an iron pole on a stone
  // foot with an arm out along +x at its head, braced from the pole, a finial on the pole and at the arm's end, and its
  // cloth hung from the arm clear of the pole (its middle `out` along) in `BANNER.strips` strips one under another, each
  // a part about its own top edge (the scene hangs each from the one over it and stirs them in the wind): black with an
  // orange border, the Ooga Booga logo in white on both faces, each read the right way round, its foot torn into a
  // ragged fringe of tatters.
  const BANNER = { pole: 4.3, bar: 4.0, w: 1.7, top: 3.92, h: 2.7, strips: 9, border: 0.11, out: 1.1 };
  const banner = cached(() => {
    const B = BANNER, sh = B.h / B.strips, IRONB = "#1f2024", pole = [];
    pole.push(bevelBox({ w: 0.5, h: 0.32, d: 0.5, color: ARENA[1], bevel: 0.05, offset: { y: 0.16 } }), box({ w: 0.11, h: B.pole, d: 0.11, color: IRONB, offset: { y: B.pole / 2 } }));
    const arm = B.out + B.w / 2 + 0.16;
    pole.push(box({ w: arm, h: 0.08, d: 0.08, color: IRONB, offset: { x: arm / 2, y: B.bar } }), beam(0.02, B.bar - 0.75, 0, 0.7, B.bar - 0.02, 0, 0.045, IRONB));
    pole.push(box({ w: 0.12, h: 0.12, d: 0.12, color: "#a8873c", offset: { x: arm, y: B.bar } }));
    pole.push(moved(lathe({ profile: [[0, 0], [0.09, 0], [0.11, 0.08], [0.05, 0.22], [0, 0.34]], segments: 8, color: "#a8873c" }), 0, B.pole, 0));
    const strips = Array.from({ length: B.strips }, () => []), px = 1.3 / SAIL_LOGO[0].length, mid = (SAIL_LOGO[0].length - 1) / 2;
    const logoTop = B.top - B.h / 2 + SAIL_LOGO.length * px / 2 + 0.1;
    for (let k = 0; k < B.strips - 1; k++) {
      const parts = strips[k], y = -sh / 2;
      parts.push(box({ w: B.w - 2 * B.border, h: sh + 0.004, d: 0.04, color: k & 1 ? "#141216" : "#18151a", offset: { y } }));
      for (const sx of [-1, 1]) parts.push(box({ w: B.border, h: sh + 0.004, d: 0.05, color: k & 1 ? "#d9611a" : "#e06a1f", offset: { x: sx * (B.w - B.border) / 2, y } }));
      if (k === 0) parts.push(box({ w: B.w, h: B.border, d: 0.05, color: "#e06a1f", offset: { y: -B.border / 2 } }));
    }
    // The foot, torn: narrow tatters each its own length, some cut short, some trailing well below the rest.
    const rand = mulberry32(9917), cols = 20, cw = B.w / cols;
    for (let i = 0; i < cols; i++) {
      const edge = i === 0 || i === cols - 1, r = rand(), len = sh * (r < 0.18 ? 0.3 + rand() * 0.25 : r > 0.82 ? 1.35 + rand() * 0.7 : 0.6 + rand() * 0.6), w = cw * (0.72 + rand() * 0.3);
      strips[B.strips - 1].push(box({ w, h: len, d: edge ? 0.05 : 0.04, color: edge ? "#d9611a" : i & 1 ? "#141216" : "#1d191f", offset: { x: -B.w / 2 + (i + 0.5) * cw, y: -len / 2 + 0.002 } }));
      if (rand() > 0.55) strips[B.strips - 1].push(box({ w: w * 0.5, h: len * 0.35, d: 0.04, color: "#141216", offset: { x: -B.w / 2 + (i + 0.5) * cw + (rand() - 0.5) * cw * 0.6, y: -len - len * 0.17 } }));
    }
    SAIL_LOGO.forEach((line, r) => {
      const y = logoTop - (r + 0.5) * px, k = Math.floor((B.top - y) / sh);
      if (k < 0 || k >= B.strips) return;
      const ly = y - (B.top - k * sh);
      for (let c = 0; c < line.length;) {
        if (line[c] !== "X") { c++; continue; }
        let e = c;
        while (e + 1 < line.length && line[e + 1] === "X") e++;
        const w = (e - c + 1) * px, u = ((c + e) / 2 - mid) * px;
        for (const side of [1, -1]) strips[k].push(box({ w: w + 0.002, h: px + 0.002, d: 0.01, color: "#f4f1ea", emissive: 0.3, offset: { x: side * u, y: ly, z: side * 0.026 } }));
        c = e + 1;
      }
    });
    return { pole: merge(...pole), strips: strips.map((p) => merge(...p)), strip: sh };
  });
  // A flag on a spire's tip, in its own frame, the pole's foot at the origin: an iron pole with a gold finial, and its
  // cloth flying out along +x from near its head in `SPIRE_FLAG.cols` columns side by side, each a part about its own
  // edge nearer the pole (the scene hangs each from the one before it and waves them in the wind): black with an orange
  // border, the Ooga Booga logo in white on both faces, each read the right way round.
  const SPIRE_FLAG = { pole: 3.4, top: 3.15, w: 2.4, h: 1.5, cols: 10, border: 0.1 };
  const flagOf = variants((skull) => {
    const cbdc = skull === "cbdc", LOGO = cbdc ? CBDC_MARK : skull ? SKULL : SAIL_LOGO, EDGE_A = skull ? "#cfc9bb" : "#d9611a", EDGE_B = skull ? "#e2dccd" : "#e06a1f";
    const F = SPIRE_FLAG, cw = F.w / F.cols, IRONB = "#1f2024", cols = Array.from({ length: F.cols }, () => []);
    const pole = merge(box({ w: 0.1, h: F.pole, d: 0.1, color: IRONB, offset: { y: F.pole / 2 } }), moved(lathe({ profile: [[0, 0], [0.08, 0], [0.11, 0.08], [0.06, 0.2], [0, 0.3]], segments: 8, color: "#a8873c" }), 0, F.pole, 0));
    const y0 = -F.h / 2;
    for (let k = 0; k < F.cols; k++) {
      const parts = cols[k], x = cw / 2, edgeX = k === F.cols - 1;
      parts.push(box({ w: cw + 0.004, h: F.h - 2 * F.border, d: 0.035, color: cbdc ? (k & 1 ? "#a01912" : "#b82117") : k & 1 ? "#141216" : "#18151a", offset: { x, y: y0 } }));
      for (const sy of [-1, 1]) parts.push(box({ w: cw + 0.004, h: F.border, d: 0.045, color: k & 1 ? EDGE_A : EDGE_B, offset: { x, y: y0 + sy * (F.h - F.border) / 2 } }));
      if (edgeX) parts.push(box({ w: F.border, h: F.h, d: 0.045, color: EDGE_B, offset: { x: cw - F.border / 2, y: y0 } }));
    }
    const px = (F.w * 0.66) / LOGO[0].length, n = LOGO[0].length, x0 = (F.w - n * px) / 2, ly0 = y0 + LOGO.length * px / 2;
    LOGO.forEach((line, r) => {
      const y = ly0 - (r + 0.5) * px;
      for (const side of [1, -1]) {
        let c = 0;
        while (c < n) {
          if (line[c] !== "X") { c++; continue; }
          // Seen from the back the logo runs the other way along the flag.
          const at = (i) => x0 + (side > 0 ? i : n - 1 - i) * px, col = (i) => Math.min(F.cols - 1, Math.floor((at(i) + px / 2) / cw));
          let e = c;
          while (e + 1 < n && line[e + 1] === "X" && col(e + 1) === col(c)) e++;
          const k = col(c), a = at(c), b = at(e), mid = (a + b) / 2 + px / 2;
          cols[k].push(box({ w: (e - c + 1) * px + 0.002, h: px + 0.002, d: 0.01, color: "#f4f1ea", emissive: 0.3, offset: { x: mid - k * cw, y, z: side * 0.022 } }));
          c = e + 1;
        }
      }
    });
    return { pole, cols: cols.map((p) => merge(...p)), col: cw };
  });
  const spireFlag = () => flagOf(false);
  // A raider's flag: the same, its mark a skull over crossed bones and its border bone white.
  const raiderFlag = () => flagOf(true);
  // CBDC's: red under a white border, CBDC in white.
  const cbdcFlag = () => flagOf("cbdc");
  // The mark over the head of whoever has a quest to give ("!") or is waiting to hear one is done ("?"): a gold glyph
  // of light a unit tall about its middle, turned to the view by the scene.
  const questMark = variants((glyph) => lightPicture(96, 128, 64, (g, w, h) => {
    g.font = "900 112px Georgia, 'Times New Roman', serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(255,170,40,0.9)"; g.shadowBlur = 14; g.fillStyle = "#ffd76a";
    g.fillText(glyph, w / 2, h / 2 + 4);
  }));
  // A shipwright's mallet, a part, its grip at the origin and its handle down along -y to its head.
  const mallet = cached(() => merge(box({ w: 0.05, h: 0.42, d: 0.05, color: "#5a4028", offset: { y: -0.21 } }), bevelBox({ w: 0.26, h: 0.14, d: 0.14, color: "#3a2a1c", bevel: 0.02, offset: { y: -0.45 } })));
  // A fire arrow, in its own frame: its iron head's point at the origin, its shaft back along -z (`ARROW.length`), goose
  // feathers at its nock and a pitch-soaked rag bound behind its head (`ARROW.rag` back), where `arrowFlame` burns.
  const ARROW = { length: 1.0, rag: 0.15 };
  const fireArrow = cached(() => {
    const SHAFT = "#6e5236", parts = [box({ w: 0.024, h: 0.024, d: ARROW.length - 0.06, color: SHAFT, offset: { z: -0.06 - (ARROW.length - 0.06) / 2 } })];
    parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.03, 0.035], [0.018, 0.075], [0, 0.075]], segments: 4, color: "#2b2b30" }), -Math.PI / 2), 0, 0, 0));
    parts.push(moved(turnedX(lathe({ profile: [[0, 0], [0.03, 0.01], [0.034, 0.05], [0.03, 0.1], [0, 0.11]], segments: 6, color: "#2a1c12" }), -Math.PI / 2), 0, 0, -ARROW.rag + 0.05));
    for (const [x, y] of [[0, 0.03], [0.026, -0.015], [-0.026, -0.015]]) parts.push(box({ w: Math.abs(x) > 0 ? 0.04 : 0.004, h: Math.abs(x) > 0 ? 0.004 : 0.04, d: 0.16, color: "#d9d2c2", offset: { x, y, z: -ARROW.length + 0.1 } }));
    return merge(...parts);
  });
  // The flame on a fire arrow's rag, standing up from its foot at the origin.
  const arrowFlame = cached(() => noShadow(merge(
    lathe({ profile: [[0, -0.02], [0.11, 0.04], [0.12, 0.15], [0.07, 0.32], [0, 0.5]], segments: 8, color: "#ff7a24", emissive: 1 }),
    lathe({ profile: [[0, -0.05], [0.075, 0.0], [0.08, 0.12], [0.03, 0.3], [0, 0.36]], segments: 7, color: "#ffe27a", emissive: 1 }),
    lathe({ profile: [[0, -0.07], [0.045, -0.05], [0.05, 0.05], [0, 0.18]], segments: 6, color: "#fff4cc", emissive: 1 }))));
  // An oar, in its own frame: its loom through the oarlock at the origin, its handle inboard toward -x, its blade out
  // along +x; `side` -1 mirrors it for the boat's other side.
  const oar = variants((side) => {
    const s = side ? -1 : 1, wood = "#5c4430";
    return merge(beam(-0.8 * s, 0, 0, 2.05 * s, 0, 0, 0.045, wood), box({ w: 0.6, h: 0.035, d: 0.17, color: "#4a3624", offset: { x: 2.3 * s, y: 0, z: 0 } }), beam(-0.95 * s, 0, 0, -0.78 * s, 0, 0, 0.055, "#2a1f15"));
  });
  // ---------- the knights' beam ----------
  // The light that comes down on each knight as the two first face each other, as the ghost hunt's drops are called
  // down (ghost-models.js `beamOf`, `glowDisc`, `ringOf`): soft pictures drawn in light, `beam` one unit tall on its
  // foot and brightest down its middle, `disc` and `ring` one unit across about their middle, each turned to the view
  // or laid on the ground by the scene.
  const BEAM_GLOW = [255, 140, 30], BEAM_CORE = [255, 236, 190];
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const lightPicture = (w, h, foot, paint) => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext("2d"), w, h);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const unit = 1 / h, W = w * unit, x0 = -W / 2, y0 = -foot * unit;
    const geo = { verts: [x0, y0, 0, x0 + W, y0, 0, x0 + W, y0 + 1, 0, x0, y0 + 1, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [x0, y0, W, 1], cutout: true, soft: true, blend: "add", bright: 0.9 };
    return geo;
  };
  const glowBeam = cached(() => lightPicture(64, 256, 0, (g, w, h) => {
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, rgba(BEAM_GLOW, 0)); across.addColorStop(0.35, rgba(BEAM_GLOW, 0.55)); across.addColorStop(0.5, rgba(BEAM_CORE, 0.95));
    across.addColorStop(0.65, rgba(BEAM_GLOW, 0.55)); across.addColorStop(1, rgba(BEAM_GLOW, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    const up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, "rgba(0,0,0,1)"); up.addColorStop(0.7, "rgba(0,0,0,0.8)"); up.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = up; g.fillRect(0, 0, w, h);
  }));
  // The same beam in yellow, the wand's rain coming down on the Ooga.
  const SUN_GLOW = [255, 214, 50], SUN_CORE = [255, 250, 215];
  const sunBeam = cached(() => lightPicture(64, 256, 0, (g, w, h) => {
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, rgba(SUN_GLOW, 0)); across.addColorStop(0.35, rgba(SUN_GLOW, 0.6)); across.addColorStop(0.5, rgba(SUN_CORE, 1));
    across.addColorStop(0.65, rgba(SUN_GLOW, 0.6)); across.addColorStop(1, rgba(SUN_GLOW, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    const up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, "rgba(0,0,0,1)"); up.addColorStop(0.85, "rgba(0,0,0,0.85)"); up.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = up; g.fillRect(0, 0, w, h);
  }));
  // The sword slam's light: a white orb, a unit across about its middle, soft at its heart and brighter at its rim so
  // it reads as a sphere, and the knights' ground ring and glow in white.
  const SLAM_WHITE = [240, 246, 255];
  const whiteOrb = cached(() => lightPicture(128, 128, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, rgba([255, 255, 255], 0.75)); grad.addColorStop(0.55, rgba(SLAM_WHITE, 0.4)); grad.addColorStop(0.82, rgba(SLAM_WHITE, 0.8));
    grad.addColorStop(0.92, rgba(SLAM_WHITE, 0.3)); grad.addColorStop(1, rgba(SLAM_WHITE, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  const whiteDisc = cached(() => lightPicture(128, 128, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, rgba(SLAM_WHITE, 0.9)); grad.addColorStop(0.45, rgba(SLAM_WHITE, 0.45)); grad.addColorStop(1, rgba(SLAM_WHITE, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  // The staff's pulse: a disc clear at its middle, faintly violet inside and thick white at its edge, a unit across
  // about its middle; and its waves, `i` 0 a thick white ring with a soft glow, 1 a purple one.
  const PULSE_PURPLE = [176, 92, 255];
  // Variant 0 the staff's purple, 1 the maul's orange.
  const PULSE_ORANGE = [255, 128, 24];
  const pulseDisc = variants((i = 0) => lightPicture(256, 256, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2), C = i ? PULSE_ORANGE : PULSE_PURPLE;
    grad.addColorStop(0, rgba(C, 0)); grad.addColorStop(0.68, rgba(C, 0)); grad.addColorStop(0.82, rgba(C, 0.1));
    grad.addColorStop(0.9, rgba(i ? [255, 220, 170] : [225, 210, 255], 0.55)); grad.addColorStop(0.95, rgba(SLAM_WHITE, 0.95)); grad.addColorStop(1, rgba(SLAM_WHITE, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  // Variant 0 white and thick, 1 purple, 2 orange.
  const pulseWave = variants((i) => lightPicture(256, 256, 128, (g, w) => {
    const C = i === 2 ? PULSE_ORANGE : i ? PULSE_PURPLE : SLAM_WHITE;
    g.shadowColor = rgba(C, 0.9); g.shadowBlur = w * 0.03;
    g.strokeStyle = rgba(C, i ? 0.9 : 1); g.lineWidth = w * (i ? 0.03 : 0.06);
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.44, 0, Math.PI * 2); g.stroke();
  }));
  // The staff's spell: a ball of purple light with a pale heart.
  const spiritBall = cached(() => {
    const ball = (r, color, e) => lathe({ profile: [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], segments: 10, color, emissive: e });
    return noShadow(merge(ball(0.34, "#9b4dff", 1), ball(0.22, "#f0e2ff", 1)));
  });
  // The staff's spell's explosion: a ball of purple light, white at its heart, a unit across about its middle.
  const purpleOrb = cached(() => lightPicture(128, 128, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.25, rgba([214, 180, 255], 0.95)); grad.addColorStop(0.6, rgba(PULSE_PURPLE, 0.55)); grad.addColorStop(1, rgba(PULSE_PURPLE, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  const whiteRing = cached(() => lightPicture(192, 192, 96, (g, w) => {
    g.strokeStyle = rgba(SLAM_WHITE, 1); g.lineWidth = w * 0.045;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, Math.PI * 2); g.stroke();
  }));
  // The volcano's eruption: `fireGlow`, a soft ball of orange light a metre across, its middle at the origin, added to
  // what is behind it and showing through the haze (the fountain's blobs and the glow over the crater); `ashPuff`, a
  // soft dark puff of ash the same size, blended over what is behind it.
  const FIRE_GLOW = [255, 120, 30];
  const fireGlow = cached(() => {
    const geo = lightPicture(128, 128, 64, (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, rgba([255, 236, 170], 0.95)); grad.addColorStop(0.3, rgba([255, 160, 50], 0.7)); grad.addColorStop(0.7, rgba(FIRE_GLOW, 0.25)); grad.addColorStop(1, rgba(FIRE_GLOW, 0));
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    geo.fogPierce = 0.85;
    return geo;
  });
  const ashPuff = cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(58,50,48,0.9)"); grad.addColorStop(0.55, "rgba(44,40,40,0.55)"); grad.addColorStop(1, "rgba(30,28,30,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false, fogPierce: 0.5 };
    geo.imageSurface = { asset: { width: 128, height: 128, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "alpha", bright: 0 };
    return geo;
  });
  // The alchemy cauldron's bubbles, glowing green domes, and its mist: a soft pale green puff, its middle at the
  // origin, a metre across, blended over what is behind it.
  const brewBubble = cached(() => noShadow(lathe({ profile: [[0, 0], [0.7, 0.15], [1, 0.55], [0.7, 0.9], [0, 1]], segments: 10, color: "#7dffb0", emissive: 0.85 })));
  const brewMist = cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(170,255,200,0.85)"); grad.addColorStop(0.5, "rgba(110,230,160,0.45)"); grad.addColorStop(1, "rgba(80,200,140,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: 128, height: 128, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "alpha", bright: 0.25 };
    return geo;
  });
  // Foam on the water behind and before a boat under way: a soft pale puff, its middle at the origin, a metre across,
  // flecked so it reads as froth, faintly lit so it shows in the night, blended over the sea. Laid flat by its node.
  const foam = cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d"), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(235,246,255,0.75)"); grad.addColorStop(0.45, "rgba(205,228,245,0.4)"); grad.addColorStop(1, "rgba(180,210,235,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 90; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = 54 * Math.sqrt(((i * 0.618) % 1)), x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
      g.fillStyle = `rgba(255,255,255,${(0.35 * (1 - r / 60)).toFixed(3)})`;
      g.beginPath(); g.arc(x, y, 2 + (i % 4), 0, Math.PI * 2); g.fill();
    }
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: 128, height: 128, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "alpha", bright: 0.45 };
    return geo;
  });
  // The alchemy cauldron's beam: the same column of light in a faint green.
  const greenBeam = cached(() => lightPicture(64, 256, 0, (g, w, h) => {
    const G = [70, 255, 140], C = [200, 255, 215], across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, rgba(G, 0)); across.addColorStop(0.35, rgba(G, 0.4)); across.addColorStop(0.5, rgba(C, 0.75));
    across.addColorStop(0.65, rgba(G, 0.4)); across.addColorStop(1, rgba(G, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    const up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, "rgba(0,0,0,1)"); up.addColorStop(0.75, "rgba(0,0,0,0.7)"); up.addColorStop(1, "rgba(0,0,0,0.15)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = up; g.fillRect(0, 0, w, h);
  }));
  // The wand's fourth step's fire, burning low over the ground like lava: a squat, wide flame of short tongues licking
  // up off a broad root, in a fire's own colours (white-gold at the root through orange to deep red at the tips),
  // three shapes for variety; smooth and unshadowed.
  const LAVA_INKS = ["#fff1b0", "#ffb22e", "#ff6a12", "#b3220a"];
  const LAVA_FLAMES = [0, 1, 2].map((i) => cached(() => {
    const ink = (t) => LAVA_INKS[Math.min(3, Math.floor(t * 4))];
    const lick = (h, r) => turn([[0, 0], [r * 0.85, h * 0.06], [r, h * 0.22], [r * 0.82, h * 0.42], [r * 0.5, h * 0.66], [r * 0.2, h * 0.86], [0, h]], 8, ink, 0.95);
    const parts = [lick(0.32 + 0.05 * i, 0.22)];
    for (let k = 0; k < 5; k++) parts.push(models.turnedY(moved(turnedZ(lick(0.18 + 0.05 * ((k + i) % 3), 0.1), -0.25), 0.16, 0, 0), k * 1.26 + i));
    const geo = shaded(parts), v = geo.verts;
    for (let j = 0; j < v.length; j += 3) {
      const a = v[j + 1] * 1.4, c = Math.cos(a), sn = Math.sin(a), x = v[j], z = v[j + 2];
      v[j] = x * c + z * sn; v[j + 2] = -x * sn + z * c;
    }
    geo.sway = 0.12;
    return noShadow(geo);
  }));
  const lavaFlame = (i) => LAVA_FLAMES[i]();
  // The molten ground under it: a pool of lava a unit across lying flat, glowing yellow-orange at its heart through
  // orange cracks between dark crusted plates, its edge cooling to black crust and then nothing.
  const lavaPool = cached(() => {
    const W = 128, canvas = document.createElement("canvas");
    canvas.width = canvas.height = W;
    const g = canvas.getContext("2d"), rand = mulberry32(31), heart = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    heart.addColorStop(0, "rgba(255,214,110,1)"); heart.addColorStop(0.35, "rgba(255,128,24,0.95)"); heart.addColorStop(0.7, "rgba(170,34,8,0.8)"); heart.addColorStop(1, "rgba(30,8,4,0)");
    g.fillStyle = heart; g.fillRect(0, 0, W, W);
    // Crust plates over it, darker toward the edge, the lava showing through the cracks between them.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * W * 0.42, x = W / 2 + Math.cos(a) * r, y = W / 2 + Math.sin(a) * r, size = W * (0.05 + rand() * 0.07), dark = 0.35 + 0.6 * r / (W * 0.42);
      g.fillStyle = `rgba(${28 + rand() * 20 | 0},${10 + rand() * 8 | 0},6,${dark})`;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const b = k / 6 * Math.PI * 2 + rand() * 0.5, q = size * (0.7 + rand() * 0.5); g.lineTo(x + Math.cos(b) * q, y + Math.sin(b) * q); }
      g.closePath(); g.fill();
    }
    const fade = g.createRadialGradient(W / 2, W / 2, W * 0.3, W / 2, W / 2, W / 2);
    fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = fade; g.fillRect(0, 0, W, W);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: W, height: W, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "alpha", bright: 0.7 };
    return geo;
  });
  // The wand's fourth step raised: a white column of light standing up off its gem into the sky.
  const whiteBeam = cached(() => { const geo = lightPicture(64, 256, 0, (g, w, h) => {
    const W = [205, 225, 255], C = [255, 255, 255], across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, rgba(W, 0)); across.addColorStop(0.32, rgba(W, 0.5)); across.addColorStop(0.5, rgba(C, 1));
    across.addColorStop(0.68, rgba(W, 0.5)); across.addColorStop(1, rgba(W, 0));
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    const up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, "rgba(0,0,0,1)"); up.addColorStop(0.6, "rgba(0,0,0,0.85)"); up.addColorStop(1, "rgba(0,0,0,0)");
    g.globalCompositeOperation = "destination-in"; g.fillStyle = up; g.fillRect(0, 0, w, h);
  }); geo.imageSurface.bright = 2; return geo; });
  const glowDisc = cached(() => lightPicture(128, 128, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, rgba(BEAM_GLOW, 0.9)); grad.addColorStop(0.45, rgba(BEAM_GLOW, 0.45)); grad.addColorStop(1, rgba(BEAM_GLOW, 0));
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  const glowRing = cached(() => lightPicture(192, 192, 96, (g, w) => {
    g.strokeStyle = rgba(BEAM_GLOW, 1); g.lineWidth = w * 0.045;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, Math.PI * 2); g.stroke();
  }));

  // A blade's swoosh: a thin white crescent of light about the origin, its belly 0.9 of a unit ahead (+y) and its
  // horns a third of a turn apart, thinning to nothing.
  const swooshOf = (fill, glow) => lightPicture(256, 128, 0, (g, w, h) => {
    const R = h * 0.9, a = Math.PI / 3, cx = w / 2, r = R * 1.5, b = Math.asin(R * Math.sin(a) / r);
    g.fillStyle = fill;
    g.shadowColor = glow; g.shadowBlur = 7;
    g.beginPath(); g.arc(cx, h, R, -Math.PI / 2 - a, -Math.PI / 2 + a);
    // The inner edge, a wider circle through the same two horns.
    g.arc(cx, h - R * Math.cos(a) + r * Math.cos(b), r, -Math.PI / 2 + b, -Math.PI / 2 - b, true);
    g.closePath(); g.fill();
  });
  const swoosh = cached(() => swooshOf("rgba(255,255,255,0.95)", "rgba(225,240,255,0.9)"));
  // The same crescent in the spells' colours, by `SWOOSH_TINTS` (white, purple, green, orange, gold, pale gold, blue):
  // the staff's whirl and the wand's and staff's balls drawn up.
  const SWOOSH_TINTS = [[[255, 255, 255], [225, 240, 255]], [[176, 112, 255], [130, 60, 255]], [[96, 255, 150], [30, 220, 100]], [[255, 150, 40], [255, 100, 16]], [[255, 200, 80], [255, 140, 30]], [[255, 236, 190], [255, 190, 110]], [[120, 185, 255], [60, 130, 255]]];
  const swooshTint = variants((i) => swooshOf(`rgba(${SWOOSH_TINTS[i][0]},0.95)`, `rgba(${SWOOSH_TINTS[i][1]},0.9)`));
  // The frost blade's swoosh: the same crescent as a sheet of fire, white-hot along its leading edge, through yellow
  // and orange to deep red where it thins, tongues of flame licking back off its inner edge.
  // A swirling ball of fire, the maintainer's picture (keep-icon-data.js `fireball`) as a flat sprite a unit tall about
  // its middle, for the scene to turn to the view and spin: variant 0 drawn as it is, 1 laid over it lighter, 2 its
  // hot glow added on top.
  const fireSwirl = variants((i) => {
    const src = BL.keepIcons && BL.keepIcons.fireball, image = new Image(), W = 718 / 835;
    if (src) image.src = src;
    const geo = { verts: [-W / 2, -0.5, 0, W / 2, -0.5, 0, W / 2, 0.5, 0, -W / 2, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false, fogPierce: 0.7 };
    geo.imageSurface = { asset: { width: 274, height: 320, load: () => image }, rect: [-W / 2, -0.5, W, 1], cutout: true, soft: true, blend: i === 2 ? "add" : "alpha", bright: i === 2 ? 0.9 : 1 };
    return geo;
  });
  // The level 4 staff's rune circle, the maintainer's art (keep-icon-data.js `rune`) in white, a unit across about its
  // middle in the x, y plane for the scene to lay flat: variant 0 its lines, 1 the same added on a little wider as their
  // glow.
  // Variants 2 and 3 the same in orange (the wand's rain), the picture tinted once it has loaded.
  const runeCircle = variants((i) => {
    const src = BL.keepIcons && BL.keepIcons.rune, image = new Image();
    if (src && i < 2) image.src = src;
    else if (src) {
      const from = new Image();
      from.onload = () => {
        const c = document.createElement("canvas"); c.width = from.naturalWidth; c.height = from.naturalHeight;
        const g = c.getContext("2d");
        g.drawImage(from, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "rgb(255,140,30)"; g.fillRect(0, 0, c.width, c.height);
        image.src = c.toDataURL("image/png");
      };
      from.src = src;
    }
    const geo = { verts: [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false, fogPierce: 0.8 };
    geo.imageSurface = { asset: { width: 1048, height: 1048, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: i % 2 ? "add" : "alpha", bright: 1 };
    return geo;
  });
  // A beam of northern light standing on its foot: a soft curtain a unit tall, green at its foot through teal into
  // violet at its top, fading at its edges and its ends.
  // Variants 1 and 2 the same in fire: red into orange, and orange into gold (the wand's); 3 white (the frost blade's).
  const AURORAS = [[[120, 255, 170], [80, 230, 210], [150, 120, 255]], [[255, 40, 20], [255, 90, 20], [255, 150, 40]], [[255, 110, 20], [255, 160, 40], [255, 210, 90]], [[255, 255, 255], [232, 240, 255], [205, 220, 255]]];
  const auroraBeam = variants((i = 0) => lightPicture(64, 256, 0, (g, w, h) => {
    const AURORA = AURORAS[i], up = g.createLinearGradient(0, h, 0, 0);
    up.addColorStop(0, rgba(AURORA[0], 0)); up.addColorStop(0.08, rgba(AURORA[0], 0.95)); up.addColorStop(0.45, rgba(AURORA[1], 0.75)); up.addColorStop(0.8, rgba(AURORA[2], 0.45)); up.addColorStop(1, rgba(AURORA[2], 0));
    g.fillStyle = up; g.fillRect(0, 0, w, h);
    // Its edges faded with a mask drawn across it.
    g.globalCompositeOperation = "destination-in";
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, "rgba(0,0,0,0)"); across.addColorStop(0.3, "rgba(0,0,0,0.85)"); across.addColorStop(0.5, "rgba(0,0,0,1)"); across.addColorStop(0.7, "rgba(0,0,0,0.85)"); across.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = across; g.fillRect(0, 0, w, h);
  }));
  const fireSwoosh = cached(() => lightPicture(256, 128, 0, (g, w, h) => {
    const R = h * 0.9, a = Math.PI / 3, cx = w / 2, r = R * 1.5, b = Math.asin(R * Math.sin(a) / r), rand = mulberry32(97);
    const fire = g.createRadialGradient(cx, h, R * 0.55, cx, h, R);
    fire.addColorStop(0, "rgba(190,40,10,0)"); fire.addColorStop(0.35, "rgba(220,60,14,0.75)"); fire.addColorStop(0.7, "rgba(255,138,30,0.95)"); fire.addColorStop(0.9, "rgba(255,214,110,1)"); fire.addColorStop(1, "rgba(255,246,214,1)");
    g.fillStyle = fire; g.shadowColor = "rgba(255,120,30,0.9)"; g.shadowBlur = 9;
    g.beginPath(); g.arc(cx, h, R, -Math.PI / 2 - a, -Math.PI / 2 + a);
    g.arc(cx, h - R * Math.cos(a) + r * Math.cos(b), r, -Math.PI / 2 + b, -Math.PI / 2 - b, true);
    g.closePath(); g.fill();
    // Tongues: slim wedges from the crescent's body back toward its middle.
    for (let i = 0; i < 26; i++) {
      const t = -a * 0.92 + rand() * a * 1.84, at = -Math.PI / 2 + t, thin = 1 - Math.abs(t) / a, len = R * (0.1 + rand() * 0.26) * (0.4 + thin), wide = 0.035 + rand() * 0.03, r0 = R * (0.93 - 0.1 * thin);
      g.beginPath();
      g.moveTo(cx + Math.cos(at - wide) * r0, h + Math.sin(at - wide) * r0); g.lineTo(cx + Math.cos(at + wide) * r0, h + Math.sin(at + wide) * r0);
      g.lineTo(cx + Math.cos(at + (rand() - 0.5) * 0.12) * (r0 - len), h + Math.sin(at) * (r0 - len));
      g.closePath(); g.fill();
    }
  }));

  // The green skeleton's ground pulse: the ring in its sword's glowing green.
  const greenRing = cached(() => lightPicture(192, 192, 96, (g, w) => {
    g.strokeStyle = rgba([90, 255, 140], 1); g.lineWidth = w * 0.05;
    g.beginPath(); g.arc(w / 2, w / 2, w * 0.45, 0, Math.PI * 2); g.stroke();
  }));

  BL.keepModels = { kit, arenaColumn, COLUMN_FIRE, sunBeam, swooshTint, pulseDisc, pulseWave, spiritBall, purpleOrb, runeCircle, auroraBeam, fireSwirl, backBridge, FROST, bladeFlame, lightning, LIGHTNING_LEN, fireSwoosh, keepSpire, storjTower, storjMountain, storjWays, storjCave, STORJ_CAVE, storjDock, snowPine, storjForest, stoneKnight, storjPlinth, captain, questMark, raiderFlag, cbdcFlag, cbdcWall, mallet, longshipGuns, helm, HELM, fireGlow, ashPuff, troll, TROLL, volcanoCone, volcanoDock, shardsDock, outpostBridge, outpostDocks, shardsWays, shardsCrystals, groundTorch, TORCH_FLAME, spireFlag, SPIRE_FLAG, knightCape, KNIGHT_CAPE, greenRing, swoosh, whiteOrb, whiteDisc, whiteRing, turret, cannon, CANNON, fireball, aimDot, dropBanana, questCrystal, keepWeapon, skeleton, SKELETON, GREEN_SKELETON, ogre, OGRE, smash, waterCandle, CANDLE, drip, hangChain, balcony, banner, BANNER, paved, layBlocks, BIG_BLOCKS, BIG, glowBeam, greenBeam, whiteBeam, lavaFlame, lavaPool, brewBubble, brewMist, foam, glowDisc, glowRing, castleParts, porch, PORCH, doorLeaf, U, ARENA, PIER_H, SENTINEL_FOOT, CHAIN_LINK, TERRAIN_UNIT, buildSteps, terrain, wall, tower, gatehouse, keep, plinth, towerSkirt, stairs, dock, boat, oar, BOAT, abutment, ruin, flags, pine, farPine, forest, water,
    lanternPost, standLantern, hangLantern, fireArrow, arrowFlame, ARROW, warship, WARSHIP_LIGHTS, westBridge, westPortcullis, shipyard, armoryDock, longhouse, yardProp, FURNACE, wordSign, galleon, GALLEON_LIGHTS, barkeep, shipwright, smith, alchemist, leaf, chainLink, portcullis, knight, KNIGHT_UNIT, viking, GUARD_UNIT, dust, sentinelPlinth, firefly, wallBracket, BRACKET, yard, crow, gargoyle };
})();
