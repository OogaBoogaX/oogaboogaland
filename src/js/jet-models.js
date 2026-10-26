// Lightning Jet v2, the jet docked in the Lightning Jet Hangar, built in big voxels so the renderer's block detail
// gives it its concept's blocky look: a white fuselage over a royal-blue belly with a gold
// pinstripe between them and the bolt's roundel on each side, a dark glass canopy in its frame, swept wings edged in
// blue, blue tailplanes and a blue fin carrying a big gold bolt, twin engine pods with gold intakes, and its gear. Each
// part is shaped as its own set of cells (`PARTS`); a construction stage (`STAGES`) is the parts fitted by then, merged
// into one mesh (`jet(stage)`, cached), so nothing fitted shows a face inside another. The engines' nozzles are turned,
// smooth, not voxels (`nozzles`): a round jet nozzle on each pod, which `pieces(stage)` fits with the engines.
// `STAGE` is the stage the hangar shows, which the maintainer bumps by hand; `?debug=1&jetstage=N` previews another.
//
// The parts are drawn on a grid of quarter units, with the fuselage's axis `CY` units up, and built `SCALE` times
// that, so each voxel is `U` metres across. In the jet's frame: the nose toward -z, y up, the origin on the floor under
// its middle, in metres. `SIZE` is its overall size, `POINTS` where the hangar meets it (the cockpit's seat and eye,
// the canopy's hinge, the engines), `columns(stage)` its cells seen from above for walkers (each column's bottom and
// top, which `hangar-models.js` makes the Jet's solid and the surfaces on top of it), and `LIVERY` its colours.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { cached, makeVox, voxelGeometry, turn, shaded, torus, box, moved, turnedY, forwardLathe, merge } = models;

  const SCALE = 1.5, CELL = 0.25, U = CELL * SCALE, CY = 3;
  const LIVERY = { body: "#eef1f6", blue: "#2443a8", gold: "#ffc83a", glass: "#1b2f5e", steel: "#a9b1bc" };
  // The palette, by index: whites in two tones and a panel line, blues in two tones and the nose's darker one, the
  // gold, the canopy's glass and frame, the nacelles in two tones, the intakes, the tyres and the struts.
  const PALETTE = [null, LIVERY.body, "#e2e6ee", "#d3d8e2", LIVERY.blue, "#2b4dbb", "#1a2f7a", LIVERY.gold, LIVERY.glass, "#9aa3b0", "#c9ced6", "#b6bcc6", "#2a2d33", "#1d1f24", "#5a6068"];
  const WHITE = 1, WHITE_B = 2, PANEL = 3, BLUE = 4, BLUE_B = 5, NOSE = 6, GOLD = 7, GLASS = 8, FRAME = 9, NACELLE = 10, NACELLE_B = 11, INTAKE = 12, TYRE = 13, STRUT = 14;
  const EMISSIVE = { [GLASS]: 0.22 };
  const SIZE = { length: 18.5 * SCALE, span: 12.4 * SCALE, height: 8 * SCALE };

  const smooth = (t) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  // The fuselage's radius along its length: an ogive nose, swelling to the cabin, a long even body, and a taper to the
  // tail, where the engines' exhausts stand out past it.
  const radius = (z) => {
    if (z < -9 || z > 9) return 0;
    if (z < -6.5) return 1.3 * Math.pow(Math.sin((z + 9) / 2.5 * Math.PI / 2), 0.8);
    if (z < -3.5) return 1.3 + 0.3 * smooth((z + 6.5) / 3);
    if (z < 5) return 1.6;
    return 1.6 - 0.6 * smooth((z - 5) / 4);
  };
  const inFuselage = (x, y, z) => {
    const r = radius(z);
    return r > 0 && (x / r) ** 2 + ((y - CY) / (r * 1.04)) ** 2 <= 1;
  };
  // The bolt, as one outline in -1..1 (u across, v up), for the fin and the roundels.
  const BOLT = [[0.1, 1], [0.6, 1], [0.25, 0.2], [0.6, 0.2], [-0.25, -1], [-0.02, -0.15], [-0.38, -0.15]];
  const inBolt = (u, v) => {
    let inside = false;
    for (let i = 0, j = BOLT.length - 1; i < BOLT.length; j = i++) {
      const [ui, vi] = BOLT[i], [uj, vj] = BOLT[j];
      if ((vi > v) !== (vj > v) && u < (uj - ui) * (v - vi) / (vj - vi) + ui) inside = !inside;
    }
    return inside;
  };
  // Two tones a colour, by cell, so a broad face reads as built of blocks.
  const tone = (i, j, k, a, b) => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & 2 ? b : a;

  // Each part as a function of a cell's indices and centre, giving its colour or nothing; and the box of cells it may
  // fill, [i0, i1, j0, j1, k0, k1].
  const PARTS = {
    // The fuselage: white over the blue belly, a gold pinstripe between, panel lines every two metres, the nose's tip
    // in a darker blue, and the bolt's roundel on each flank behind the canopy.
    body: {
      box: [-8, 7, 4, 20, -36, 36],
      cell: (i, j, k, x, y, z) => {
        if (!inFuselage(x, y, z)) return null;
        if (z < -8.4) return NOSE;
        const r = radius(z), shell = Math.abs(x) > r * 0.72;
        const dz = z + 1.1, dy = y - CY - 0.3;
        if (shell && dz * dz + dy * dy <= 0.62) return inBolt(dz / 0.42, dy / 0.66) ? GOLD : BLUE;
        if (y < CY - 0.5) return tone(i, j, k, BLUE, BLUE_B);
        if (y < CY - 0.25) return GOLD;
        return (k & 7) === 0 ? PANEL : tone(i, j, k, WHITE, WHITE_B);
      }
    },
    // The canopy: a glass bubble over the cockpit, in its frame, with a bow across its middle.
    canopy: {
      box: [-4, 3, 13, 20, -30, -10],
      cell: (i, j, k, x, y, z) => {
        const cz = -5, cyTop = CY + radius(cz) * 0.8;
        if ((x / 0.85) ** 2 + ((y - cyTop) / 0.8) ** 2 + ((z - cz) / 2.2) ** 2 > 1 || inFuselage(x, y, z)) return null;
        return Math.abs(z - cz) < 0.13 || inFuselage(x, y - CELL, z) ? FRAME : GLASS;
      }
    },
    // The wings, swept and set low with a little dihedral: white, their leading edges and tips blue.
    wings: {
      box: [-25, 24, 6, 12, -11, 9],
      cell: (i, j, k, x, y, z) => {
        const s = Math.abs(x);
        if (s > 6.2 || s < 1) return null;
        const f = s / 6, le = -2.6 + 3 * f, te = 2.2 - 0.6 * f, wy = CY - 0.75 + 0.06 * s, t = 0.55 - 0.3 * f;
        if (z < le || z > te || Math.abs(y - wy) > Math.max(t / 2, 0.13)) return null;
        return s > 5.5 || z - le < 0.45 ? BLUE : tone(i, j, k, WHITE, WHITE_B);
      }
    },
    // The tail: the tailplanes, blue, and the fin over them, blue with a white leading edge and the gold bolt.
    tail: {
      box: [-14, 13, 12, 32, 18, 36],
      cell: (i, j, k, x, y, z) => {
        const s = Math.abs(x), plane = CY + 0.45;
        if (s <= 3.3 && Math.abs(y - plane) <= 0.15 && z >= 5.8 + 1.8 * s / 3.3 && z <= 8.6) return tone(i, j, k, BLUE, BLUE_B);
        const h = y - CY;
        if (s > 0.25 || h < 0.9 || h > 5) return null;
        const le = 4.8 + h / 5 * 2.8, te = 8.9 - h / 5 * 0.1;
        if (z < le || z > te) return null;
        if (z - le < 0.45) return WHITE;
        return inBolt((z - 7.6) / 1, (h - 2.9) / 1.5) ? GOLD : tone(i, j, k, BLUE, BLUE_B);
      }
    },
    // The engine pods either side of the tail: gold rings round dark intakes and grey nacelles, ending where their
    // nozzles fit on (`nozzles`).
    engines: {
      box: [-10, 9, 6, 16, 18, 36],
      cell: (i, j, k, x, y, z) => {
        if (z < 4.6 || z > 9.2) return null;
        const ex = x < 0 ? -1.35 : 1.35, d = Math.hypot(x - ex, y - (CY - 0.35));
        const r = z < 5 ? 0.8 : 0.84 - 0.18 * smooth((z - 5) / 4.2);
        if (d > r) return null;
        if (z < 4.85) return d > 0.55 ? GOLD : INTAKE;
        return tone(i, j, k, NACELLE, NACELLE_B);
      }
    },
    // The gear: a nose leg and two main legs, each a strut and its wheels, hubs grey.
    gear: {
      box: [-8, 7, 0, 9, -27, 6],
      cell: (i, j, k, x, y, z) => {
        const wheel = (cx, cz, w) => Math.abs(x - cx) <= w && Math.hypot(y - 0.42, z - cz) <= 0.42;
        if (wheel(0, -6.2, 0.26)) return Math.hypot(y - 0.42, z + 6.2) < 0.2 ? STRUT : TYRE;
        for (const s of [-1, 1]) if (wheel(s * 1.5, 1, 0.26)) return Math.hypot(y - 0.42, z - 1) < 0.2 ? STRUT : TYRE;
        if (Math.abs(x) < 0.13 && Math.abs(z + 6.2) < 0.13 && y > 0.75 && y < CY - 1.2) return STRUT;
        for (const s of [-1, 1]) if (Math.abs(x - s * 1.5) < 0.13 && Math.abs(z - 1) < 0.13 && y > 0.75 && y < CY - 0.75) return STRUT;
        return null;
      }
    }
  };
  // The parts fitted at each stage: the airframe on its gear, then its wings, its tail and engines, and last its canopy,
  // when it is Jet v2 as it will fly.
  const STAGES = { 1: ["body", "gear"], 2: ["body", "gear", "wings"], 3: ["body", "gear", "wings", "tail", "engines"], 4: ["body", "gear", "wings", "tail", "engines", "canopy"] };
  const STAGE = 4;

  // One part's cells, shaped once a page.
  const cells = new Map();
  const partCells = (name) => {
    let out = cells.get(name);
    if (out) return out;
    const P = PARTS[name], [i0, i1, j0, j1, k0, k1] = P.box;
    out = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const c = P.cell(i, j, k, (i + 0.5) * CELL, (j + 0.5) * CELL, (k + 0.5) * CELL);
      if (c) out.push(i, j, k, c);
    }
    cells.set(name, out);
    return out;
  };
  // The jet at a stage, its fitted parts' cells merged into one grid, the fuselage's last, so a cell two parts share
  // takes the body's colour. Each stage's mesh is a cached build, released with the hangar's others.
  const builds = {};
  for (const [stage, parts] of Object.entries(STAGES)) builds[stage] = cached(() => {
    const v = makeVox();
    for (const name of [...parts.filter((p) => p !== "body"), "body"]) {
      const c = partCells(name);
      for (let n = 0; n < c.length; n += 4) v.set(c[n], c[n + 1], c[n + 2], c[n + 3]);
    }
    return voxelGeometry(v, { unit: U, palette: PALETTE, emissive: EMISSIVE });
  });
  const jet = (stage = STAGE) => (builds[stage] || builds[STAGE])();
  // The jet at a stage seen from above, for walkers: a grid of columns `U` metres square in the jet's frame, from cell
  // `i0` across and `k0` along, `ni` by `nk` of them, and where each column's lowest cell starts and its highest ends,
  // in metres up from the floor (`bottom`, `top`; -1 for a column that holds none), from the same cells as its mesh.
  const columnBuilds = {};
  for (const [stage, parts] of Object.entries(STAGES)) columnBuilds[stage] = cached(() => {
    let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity;
    for (const name of parts) {
      const c = partCells(name);
      for (let n = 0; n < c.length; n += 4) { i0 = Math.min(i0, c[n]); i1 = Math.max(i1, c[n]); k0 = Math.min(k0, c[n + 2]); k1 = Math.max(k1, c[n + 2]); }
    }
    const ni = i1 - i0 + 1, nk = k1 - k0 + 1, bottom = new Float32Array(ni * nk).fill(-1), top = new Float32Array(ni * nk).fill(-1);
    for (const name of parts) {
      const c = partCells(name);
      for (let n = 0; n < c.length; n += 4) {
        const at = (c[n] - i0) * nk + c[n + 2] - k0, lo = c[n + 1] * U, hi = lo + U;
        if (bottom[at] < 0 || lo < bottom[at]) bottom[at] = lo;
        if (hi > top[at]) top[at] = hi;
      }
    }
    return { U, i0, k0, ni, nk, bottom, top };
  });
  const columns = (stage = STAGE) => (columnBuilds[stage] || columnBuilds[STAGE])();

  // The engines' nozzles, turned and shaded smooth as the concept draws them, one at the end of each pod, in metres in
  // the jet's frame, their axis along +z (aft): a dark steel collar over the pod's end; a polished steel shell
  // narrowing and flaring again to a thin lip, raised petal seams round it; inside, the dark throat with a flame-holder
  // ring, the turbine's face recessed in it and a grey cone pointing out from its middle. Each profile runs so its
  // faces look out of the nozzle: up the outside, back down the inside, inward across a face looking aft.
  const NOZZLE = { at: 9.2 * SCALE - 0.08, r: 0.66 * SCALE, segments: 36, petals: 16 };
  const STEEL = LIVERY.steel, STEEL_DK = "#5d6470", THROAT = "#15181e", CONE = "#8a929e", RING = "#3a3f48";
  const nozzles = cached(() => {
    const k = NOZZLE.r / 0.99, n = NOZZLE.segments, round = [], flat = [];
    const one = (ex) => {
      const parts = [
        turn([[1.08, 0], [1.08, 0.18], [1, 0.18]], n, STEEL_DK),
        turn([[1, 0.18], [0.97, 0.55], [1, 0.95], [0.92, 0.98]], n, STEEL),
        turn([[0.92, 0.98], [0.86, 0.62], [0.8, 0.45], [0.3, 0.45]], n, THROAT),
        turn([[0.3, 0.45], [0.26, 0.6], [0.12, 0.85], [0, 0.92]], n, CONE),
        moved(torus(0.62, 0.035, RING, 0, n, 6), 0, 0.62, 0)
      ];
      const seams = [];
      for (let p = 0; p < NOZZLE.petals; p++) {
        const a = (p + 0.5) / NOZZLE.petals * Math.PI * 2;
        seams.push(moved(turnedY(box({ w: 0.035, h: 0.62, d: 0.03, color: STEEL_DK }), a), Math.sin(a) * 1.0, 0.64, Math.cos(a) * 1.0));
      }
      const place = (g) => {
        forwardLathe(g);
        const v = g.verts;
        for (let i = 0; i < v.length; i += 3) { v[i] = v[i] * k + ex; v[i + 1] = v[i + 1] * k + POINTS.engines[0].y; v[i + 2] = v[i + 2] * k + NOZZLE.at; }
        return g;
      };
      for (const g of parts) round.push(place(g));
      for (const g of seams) flat.push(place(g));
    };
    for (const e of POINTS.engines) one(e.x);
    return shaded(round, flat);
  });
  // What the jet is at a stage, each a mesh of its own: its cells, and its nozzles once its engines are fitted.
  const pieces = (stage = STAGE) => (STAGES[stage] || STAGES[STAGE]).includes("engines") ? [jet(stage), nozzles()] : [jet(stage)];

  // Where the hangar meets it and what walkers keep out of, drawn in the grid's units and scaled to metres.
  const at = (p) => ({ x: p.x * SCALE, y: p.y * SCALE, z: p.z * SCALE });
  const POINTS = {
    seat: at({ x: 0, y: CY + 0.35, z: -5 }), eye: at({ x: 0, y: CY + 1.25, z: -5.4 }), hinge: at({ x: 0, y: CY + 1.3, z: -2.8 }),
    engines: [at({ x: -1.35, y: CY - 0.35, z: 6.9 }), at({ x: 1.35, y: CY - 0.35, z: 6.9 })]
  };
  // Each nozzle's exit, its centre and radius, in the jet's frame: where the static fire's plume starts.
  const EXHAUST = POINTS.engines.map((e) => ({ x: e.x, y: e.y, z: NOZZLE.at + 0.98 * NOZZLE.r / 0.99, r: 0.92 * NOZZLE.r / 0.99 }));

  // The fuselage's axis, metres up from the floor, round which a board turns the Jet in miniature.
  const AXIS = CY * SCALE;

  BL.jetModels = { SIZE, SCALE, AXIS, LIVERY, STAGES, STAGE, POINTS, EXHAUST, U, jet, columns, nozzles, pieces };
})();
