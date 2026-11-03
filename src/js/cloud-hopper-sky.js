// Cloud Hopper's level scenery (docs/cloud-hopper-levels-plan.md 4 and 7a), built for a run under the level's
// fixed sky (`sky` in cloud-hopper-levels.js, which the hub samples on `DAY`). It is all decoration: hidden from
// the outline registry, never collided with, and kept off every cloud's swept footprint, so nothing in it reads as a
// landing. Each level's scenery comes from a fixed seed, so it stands the same on every run; only its animation
// moves, on the scenery's own clock.
// - `islets` (Floating Isles): voxel isles with grass, flowers, palms, trees and a hut on top and sandstone strata,
//   drips and hanging vines under them; two shapes pour a waterfall off the rim into mist, smaller isles hang off
//   some on rope bridges, two Ooga balloons drift by, gulls wheel and a double rainbow stands opposite the sun.
// - `spires` (Amber Spires): towering cumulus coloured for the low sun (gold where faces turn to it, lavender where
//   they turn away, cream on the tops, glowing a little), all at one scale, young ones nearer off to the sides of the
//   course and some of the far ones growing from the Play press, long cloud banks along the horizon, sky lanterns
//   rising past the course and geese flying a V.
// - `aurora` (Aurora Heights): the aurora as a real one stands, in pixel art: long curtains far off in the sky toward
//   the island, kept where they stand however far a rider falls, a bright green lower edge with rays rising from it
//   into faint violet and red, shimmering, slowly folding and now and then breaking up; shooting stars; dark
//   isles growing glowing crystals; and great crystals turning in the air.
// - `storm` (Thunderhead): rain round the eye, lightning striking the sea with the sky's flash and the strike's
//   distance for its thunder, and storm-dark isles far out to either side whose lighthouses sweep their beams round,
//   only their light glowing faintly through the haze from far off. `grade` greys the hub's sampled sky for it and `flash` lifts it for a frame of lightning.
// The moving parts are instanced batches written in place (one draw each) and a few node transforms; nothing
// allocates a frame. The Canvas 2D renderer gets the still scenery and a thinner aurora, without the flocks,
// lanterns or shooting stars.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const M = BL.models, { hexToRgb, mulberry32 } = BL.math;
  const TAU = Math.PI * 2;
  // The day every level sky is sampled on, the equinox, so a level looks the same on any day of the year.
  const DAY = 80;
  const SEED = 77, SHORE = 42;
  // Scenery keeps this far (m) off every cloud's swept footprint; a piece that cannot steps out across the route.
  const GAP = 6, STEP = 10, TRIES = 8;
  const mix = (a, b, k) => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // A fixed hash of a cell to [0, 1), so a shape's texture never depends on the order it was filled in.
  const hash = (a, b, c) => {
    let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // A thin square rod from a to b, `w` across: four quads.
  const rod = (geo, ax, ay, az, bx, by, bz, w, color) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    let ux = -dz, uy = 0, uz = dx;
    if (Math.hypot(ux, uz) < 0.1 * len) { ux = 0; uy = dz; uz = -dy; }
    const ul = Math.hypot(ux, uy, uz), vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux, vl = Math.hypot(vx, vy, vz);
    const h = w / 2, corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]], ids = [];
    for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz]]) for (const [p, q] of corners) {
      ids.push(M.pushVert(geo, px + (ux / ul * p + vx / vl * q) * h, py + (uy / ul * p + vy / vl * q) * h, pz + (uz / ul * p + vz / vl * q) * h));
    }
    for (let k = 0; k < 4; k++) M.face(geo, [ids[k], ids[(k + 1) % 4], ids[4 + (k + 1) % 4], ids[4 + k]], color);
  };

  // The sun's direction at `hour` on the level skies' day, as the hub's sky shows it.
  const SKY = { sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, light: { x: 0, y: 1, z: 0 }, starMatrix: new Float32Array(9),
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3) };
  const sunAt = (hour) => { BL.daylight.sample(hour, SKY, DAY); return SKY.sunDirection; };

  // ---- Floating isles, by day and (Aurora Heights) by night -------------------------------------------------------
  // On the island's grid mesher, half a metre a cell: a domed grass top with flowers and a boulder or two, a band of
  // soil, then sandstone strata tapering to a ragged keel with drips under it, and vines and roots hanging off the
  // rim. Variants 0 and 2 by day carry a stream from a pool to the rim and a waterfall off it. By night (4-7) the rock
  // is slate, the grass dark moss, the flowers glowing crystals a few cells tall; in a storm (8-11) the rock is wet
  // grey and the grass dark under heather and pebbles. A variant returns its mesh with where
  // things stand on it: `spots` for trees, its `rim` radius every 1/32 turn, how far it reaches (`radius`), its `fall`
  // and the mist under it.
  const CELL = 0.5;
  const INKS = {
    day: ["#62bb3e", "#7ad04c", "#4e9e32", "#7a5232", "#5e3d24", "#c9a06a", "#ad8156", "#958270", "#a8a296", "#3f7a2c", "#5d9436", "#6b4a2e", "#ffd84a", "#ff8cc0", "#ffffff", "#c58bff", "#3f9ee6"],
    night: ["#2f5a4a", "#3a6b55", "#26483c", "#3a3040", "#2c2533", "#4a4658", "#3c3a4a", "#565068", "#454055", "#2e8a6c", "#3cc49a", "#3a2e3a", "#5ff5ff", "#c77dff", "#7dffb0", "#ff7ad9", "#3f9ee6"],
    storm: ["#465f3c", "#526d44", "#3a5233", "#4a3b30", "#3a2e26", "#5d5c63", "#4f4e56", "#686670", "#57555e", "#2f4a2c", "#3d5a36", "#3a2e26", "#8a6f9a", "#a08bb0", "#c9c4b8", "#7d6a8e", "#3f6e96"]
  };
  // Palette slots: 1-3 grass, 4-5 soil, 6-9 strata, 10-12 vines and roots, 13-16 flowers (crystals at night), 17 water.
  const GRASS = 1, SOIL = 4, STRATA = 6, HANG = 10, BLOOM = 13, WATER = 17;
  // A fall is the Mempool rainforest's: thick strands in its lake's moving water, each its own length (FALL_LENGTHS).
  const FALL = hexToRgb(BL.poolModels.WATER[1]), FALL_HEIGHT = 20, FALL_LENGTHS = [0.71, 0.91, 0.82, 1, 0.88, 0.63, 0.77], RIM_STEPS = 32;
  const isle = M.variants((i) => {
    const v = i % 4, night = i >= 4 && i < 8, palette = INKS[i >= 8 ? "storm" : night ? "night" : "day"].map(hexToRgb), rand = mulberry32(911 + v * 37);
    const R = 9 + v * 1.6 + rand() * 1.5, depth = R * (1.35 + rand() * 0.35), p1 = rand() * TAU, p2 = rand() * TAU, p3 = rand() * TAU;
    const S = Math.ceil(R * 1.3) * 2 + 6, top = Math.ceil(depth * 1.25) + 10, H = top + 8, c = S / 2;
    const grid = BL.terrain.makeGrid(S, H, S), surface = new Int16Array(S * S).fill(-1), bottom = new Int16Array(S * S), stream = new Uint8Array(S * S);
    const rimAt = (a) => R * (1 + 0.16 * Math.sin(3 * a + p1) + 0.09 * Math.sin(5 * a + p2) + 0.05 * Math.sin(9 * a + p3));
    const qAt = (x, z) => { const dx = x + 0.5 - c, dz = z + 0.5 - c; return Math.hypot(dx, dz) / rimAt(Math.atan2(dz, dx)); };
    const falls = i < 4 && (v === 0 || v === 2), fa = rand() * TAU, fx = Math.cos(fa), fz = Math.sin(fa);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const q = qAt(x, z);
      if (q > 1) continue;
      const dx = x + 0.5 - c, dz = z + 0.5 - c;
      const s = top - Math.floor(q * q * 2.4) + Math.round(0.7 * Math.sin(dx * 0.45 + p1) * Math.cos(dz * 0.4 + p2));
      const keel = depth * Math.pow(1 - Math.pow(q, 1.5), 0.8) * (0.85 + 0.3 * hash(x, 3, z)) + (q < 0.75 && hash(x, 5, z) < 0.08 ? 2 + hash(x, 9, z) * 6 : 0);
      const b = Math.max(0, s - Math.max(2, Math.round(keel))), patch = Math.sin(x * 0.9 + p1) + Math.cos(z * 0.8 + p2);
      surface[x * S + z] = s; bottom[x * S + z] = b;
      for (let y = b; y <= s; y++) {
        const k = s - y;
        let ink;
        // Grass on the top and down the rim's side; soil under it; strata in wavy bands below.
        if (k === 0 || (k === 1 && q > 0.88)) ink = GRASS + (patch > 0.9 ? 1 : patch < -0.9 ? 2 : 0);
        else if (k <= 2) ink = SOIL + (k === 2 ? 1 : 0);
        else ink = STRATA + ((Math.floor((y + 1.6 * Math.sin(x * 0.35 + z * 0.25 + p3)) / 2.5) % 4) + 4) % 4;
        grid.set(x, y, z, ink);
      }
    }
    // The stream: a cell deep, from a pool a third of the way out over the rim.
    if (falls) for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const col = x * S + z, s = surface[col];
      if (s < 0) continue;
      const dx = x + 0.5 - c, dz = z + 0.5 - c, along = dx * fx + dz * fz, across = Math.abs(dz * fx - dx * fz);
      if (Math.hypot(dx - fx * R * 0.3, dz - fz * R * 0.3) >= 2.3 && !(along > R * 0.3 && across < 1.1)) continue;
      grid.set(x, s, z, 0); grid.set(x, s - 1, z, WATER);
      surface[col] = s - 1; stream[col] = 1;
    }
    // Flowers dotted through the grass, or at night crystals up to a few metres tall, then a boulder or two.
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
      const col = x * S + z, s = surface[col];
      if (s < 0 || stream[col] || qAt(x, z) > 0.85 || hash(x, 11, z) >= 0.09) continue;
      const ink = BLOOM + Math.floor(hash(x, 13, z) * 4);
      // By night a few grow into crystal columns; the rest glow in the moss.
      if (!night || hash(x, 19, z) >= 0.3) { grid.set(x, s, z, ink); continue; }
      for (let y = 1, tall = 1 + Math.floor(hash(x, 17, z) * 4); y <= tall; y++) grid.set(x, s + y, z, ink);
    }
    for (let n = 0; n < 2; n++) {
      const a = rand() * TAU, d = R * (0.25 + rand() * 0.35), bx = c + Math.cos(a) * d, bz = c + Math.sin(a) * d, br = 1.4 + rand() * 1.2;
      for (let x = Math.floor(bx - br); x <= bx + br; x++) for (let z = Math.floor(bz - br); z <= bz + br; z++) {
        const col = x * S + z, e = 1 - ((x + 0.5 - bx) ** 2 + (z + 0.5 - bz) ** 2) / (br * br);
        if (e <= 0 || surface[col] < 0 || stream[col]) continue;
        for (let y = 1; y <= Math.max(1, Math.round(br * 0.9 * Math.sqrt(e))); y++) grid.set(x, surface[col] + y, z, STRATA + 2 + (hash(x, y, z) < 0.5 ? 1 : 0));
      }
    }
    // Spots for trees, clear of the stream, a boulder and each other; a flower there gives way.
    const spots = [];
    for (let n = 0; n < 30 && spots.length < 6; n++) {
      const a = rand() * TAU, d = rimAt(a) * (0.12 + rand() * 0.5), x = Math.floor(c + Math.cos(a) * d), z = Math.floor(c + Math.sin(a) * d), col = x * S + z;
      const px = (x + 0.5 - c) * CELL, pz = (z + 0.5 - c) * CELL;
      if (surface[col] < 0 || stream[col] || grid.get(x, surface[col] + 2, z) || spots.some((p) => Math.hypot(p.x - px, p.z - pz) < 2.4)) continue;
      grid.set(x, surface[col] + 1, z, 0);
      spots.push({ x: px, y: (surface[col] + 1 - top) * CELL, z: pz });
    }
    // Vines and roots hanging from under the rim, clear of the fall.
    for (let n = 0, count = 10 + v * 3; n < count; n++) {
      const a = rand() * TAU, len = 3 + Math.floor(rand() * 8), ink = HANG + Math.floor(rand() * 3), r = rimAt(a) * (0.86 + rand() * 0.08);
      const x = Math.floor(c + Math.cos(a) * r), z = Math.floor(c + Math.sin(a) * r), col = x * S + z;
      if (surface[col] < 0 || (falls && Math.abs(Math.atan2(Math.sin(a - fa), Math.cos(a - fa))) < 0.4)) continue;
      for (let y = bottom[col] - 1; y >= Math.max(0, bottom[col] - len); y--) grid.set(x, y, z, ink);
    }
    // Where crystals may hang from the keel: the three deepest columns well inside the rim, a little apart.
    const hangs = [];
    for (let n = 0; n < 3; n++) {
      let deepest = -1;
      for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const col = x * S + z, px = (x + 0.5 - c) * CELL, pz = (z + 0.5 - c) * CELL;
        if (surface[col] < 0 || qAt(x, z) > 0.6 || deepest >= 0 && bottom[col] >= bottom[deepest]
          || hangs.some((h) => Math.hypot(h.x - px, h.z - pz) < 1.6)) continue;
        deepest = col;
      }
      if (deepest < 0) break;
      const x = Math.floor(deepest / S), z = deepest % S;
      hangs.push({ x: (x + 0.5 - c) * CELL, y: (bottom[deepest] - top) * CELL, z: (z + 0.5 - c) * CELL });
    }
    const origin = { x: -c * CELL, y: -top * CELL, z: -c * CELL };
    const mesh = BL.terrain.gridGeometry(grid, { unit: CELL, palette: [null, ...palette], origin });
    // By night the crystals glow, the vines glow teal and the moss faintly.
    const glow = new Map(night ? [...palette.slice(BLOOM - 1, BLOOM + 3).map((ink) => [ink, 0.9]), [palette[HANG - 1], 0.55], [palette[HANG], 0.55], ...palette.slice(GRASS - 1, GRASS + 2).map((ink) => [ink, 0.12])] : []);
    const water = palette[WATER - 1];
    for (const f of mesh.faces) {
      if (glow.has(f.color)) f.emissive = glow.get(f.color);
      if (f.color === water) f.water = true;
    }
    // The fall, after the Mempool rainforest's: seven thick strands from under the lip, curving a little out as they
    // drop and widening, each ending at its own height, in the lake's moving translucent water, mist under it. It is
    // its own mesh, which each isle lays with its own flow (`standIsle`).
    const mist = [];
    let fall = null;
    const geometry = mesh;
    if (falls) {
      const g = M.geometry(), rim = rimAt(fa) * CELL, ux = fz, uz = -fx, STRANDS = FALL_LENGTHS.length, W = 1.6;
      let lip = -1;
      for (let d = rimAt(fa) - 0.7; lip < 0; d -= 0.5) lip = surface[Math.floor(c + fx * d) * S + Math.floor(c + fz * d)];
      const ly = (lip + 1 - top) * CELL - 0.03, at = (u, down, front) => {
        const t = down / FALL_HEIGHT, out = rim - 0.3 + 1.2 * Math.sqrt(t) + front, w = u * W * (1 + 0.6 * t);
        return M.pushVert(g, out * fx + w * ux, ly - down, out * fz + w * uz);
      };
      const quad = (ids) => M.face(g, ids, FALL, { emissive: 0.9 });
      let low = 0;
      for (let j = 0; j < STRANDS; j++) {
        const drop = FALL_HEIGHT * FALL_LENGTHS[(j + v * 2) % STRANDS], depth = 0.18 + ((j * 3 + v) % 5) * 0.04, rows = Math.ceil(drop / 0.5);
        let previous = null;
        for (let i = 0; i <= rows; i++) {
          const down = drop * i / rows, inset = down > drop - 0.8 ? 0.035 : down > drop * 0.65 ? 0.018 : 0;
          const left = j / STRANDS - 0.5 + inset, right = (j + 1) / STRANDS - 0.5 - inset, front = depth * Math.min(1, down / 0.5);
          const row = [at(left, down, front), at(right, down, front), at(left, down, 0), at(right, down, 0)];
          if (previous) {
            quad([previous[0], row[0], row[1], previous[1]]);
            quad([previous[3], row[3], row[2], previous[2]]);
            quad([previous[2], row[2], row[0], previous[0]]);
            quad([previous[1], row[1], row[3], previous[3]]);
          }
          previous = row;
        }
        quad([previous[0], previous[2], previous[3], previous[1]]);
        low = Math.max(low, drop);
      }
      for (const f of g.faces) f.lake = true;
      g.glass = 0.64; g.castShadow = false;
      fall = { geometry: g, ux, uz, ox: (rim - 0.3) * fx, oy: ly, oz: (rim - 0.3) * fz };
      const t = low * 0.85 / FALL_HEIGHT, out = rim - 0.3 + 1.2 * Math.sqrt(t), y = ly - low * 0.85, px = -fz, pz = fx;
      mist.push({ x: out * fx, y, z: out * fz, size: 1.9 }, { x: (out + 1.2) * fx + px * 1.3, y: y - 1.2, z: (out + 1.2) * fz + pz * 1.3, size: 1.3 });
    }
    geometry.castShadow = false;
    const rim = new Float32Array(RIM_STEPS);
    for (let k = 0; k < RIM_STEPS; k++) rim[k] = rimAt(k / RIM_STEPS * TAU) * CELL;
    return { geometry, fall, spots, rim, mist, hangs, radius: R * 1.3 * CELL, lip: -2 * CELL };
  });
  // An Ooga hut for the biggest isle: a round wattle wall with a doorway under a thatched cone.
  const hut = M.cached(() => {
    const wall = M.lathe({ profile: [[1.05, 0], [1.12, 0.3], [1.05, 1.15]], segments: 10, color: (t) => t < 0.5 ? "#8a5a32" : "#a8703e" });
    const roof = M.lathe({ profile: [[1.65, 0.95], [1.15, 1.5], [0.6, 2.0], [0.2, 2.4], [0, 2.5]], segments: 10, color: (t) => t < 0.3 ? "#c49a48" : t < 0.7 ? "#d9b562" : "#b38a3e" });
    const door = M.box({ w: 0.6, h: 0.9, d: 0.14, color: "#2a1a10", offset: { x: 0, y: 0.45, z: 1.06 } });
    const g = M.merge(wall, roof, door);
    g.castShadow = false;
    return g;
  });
  // A rope bridge one unit long down +x, sagging in the middle: planks on two foot ropes, posts and handrails.
  const bridge = M.cached(() => {
    const g = M.geometry(), N = 16, sag = (u) => -0.09 * 4 * u * (1 - u), rope = hexToRgb("#c9a46a");
    const parts = [g];
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      parts.push(M.box({ w: 0.042, h: 0.008, d: 0.13, color: i % 3 ? "#a8703e" : "#8a5a32", offset: { x: u, y: sag(u), z: 0 } }));
    }
    for (const z of [-0.07, 0.07]) for (let k = 0; k < N; k++) {
      const u0 = k / N, u1 = (k + 1) / N;
      rod(g, u0, sag(u0) - 0.006, z, u1, sag(u1) - 0.006, z, 0.006, rope);
      rod(g, u0, sag(u0) * 0.8 + 0.07, z, u1, sag(u1) * 0.8 + 0.07, z, 0.006, rope);
      if (k % 4 === 0) rod(g, u0, sag(u0), z, u0, sag(u0) * 0.8 + 0.075, z, 0.008, hexToRgb("#6b4a2b"));
    }
    const geo = M.merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  // An Ooga hot-air balloon: a hide envelope patched in bands, ropes down to a woven basket with a fire under the
  // mouth. Its basket floor is the origin.
  const BALLOON_SCALE = 1.5, BALLOON_BANDS = [["#c8955a", "#f4c542", "#a8703e", "#5aa83a"], ["#e0a24a", "#8a5a32", "#f4d27a", "#c8553a"]];
  const balloon = M.variants((v) => {
    const bands = BALLOON_BANDS[v];
    const envelope = M.lathe({ profile: [[0.55, 3.2], [1.3, 3.5], [2.3, 4.6], [2.9, 6.1], [3.0, 7.4], [2.6, 8.7], [1.8, 9.6], [0.7, 10.1], [0, 10.2]], segments: 12, color: (t) => bands[Math.floor(t * 8) % bands.length] });
    const mouth = M.lathe({ profile: [[0.62, 3.05], [0.62, 3.25]], segments: 12, color: "#3a2a1c" });
    const basket = M.box({ w: 1.4, h: 0.9, d: 1.4, color: "#9a6a3a", offset: { y: 0.45 } });
    const rimBox = M.box({ w: 1.5, h: 0.12, d: 1.5, color: "#6b4a2b", offset: { y: 0.92 } });
    const fire = M.box({ w: 0.35, h: 0.35, d: 0.35, color: "#ffb347", emissive: 1, offset: { y: 2.75 } });
    const ropes = M.geometry(), rope = hexToRgb("#5a4030");
    for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) rod(ropes, x * 0.68, 0.95, z * 0.68, x * 0.48, 3.15, z * 0.48, 0.05, rope);
    const g = M.merge(envelope, mouth, basket, rimBox, fire, ropes);
    g.castShadow = false;
    return g;
  });
  // A double rainbow: seven bands round a unit arc. Its local x runs down from the crown to the feet, so the beam's
  // fade, full at the crown, dissolves the feet; y runs across it. The bright one stands nearer the island and the
  // greater one beyond it is fainter with its colours turned round, red inside, as a real double rainbow's are.
  // How far behind the island's middle each stands (m), and its radius.
  const RAINBOW = { behind: 220, size: 430 }, INNER_RAINBOW = { behind: 90, size: 250 };
  const BANDS = ["#ff4d4d", "#ff9b3d", "#ffe34f", "#62e06c", "#4cb2ff", "#5d6cff", "#a66cff"];
  const bow = (bands, glass) => {
    const g = M.geometry(), SEGS = 64, W = 0.016;
    for (let b = 0; b < bands.length; b++) {
      const color = hexToRgb(bands[b]), r0 = 1 - (b + 1) * W, r1 = 1 - b * W, ids = [];
      for (let s = 0; s <= SEGS; s++) {
        const a = s / SEGS * Math.PI;
        ids.push([M.pushVert(g, 1 - r0 * Math.sin(a), r0 * Math.cos(a), 0), M.pushVert(g, 1 - r1 * Math.sin(a), r1 * Math.cos(a), 0)]);
      }
      for (let s = 0; s < SEGS; s++) M.face(g, [ids[s][0], ids[s][1], ids[s + 1][1], ids[s + 1][0]], color, { emissive: 1 });
    }
    g.glass = glass; g.lightBeam = 1.4; g.castShadow = false;
    return g;
  };
  const rainbow = M.cached(() => bow(BANDS, 0.34)), outerRainbow = M.cached(() => bow([...BANDS].reverse(), 0.24));

  // ---- Sunset cumulus --------------------------------------------------------------------------------------------
  // Fills a grid from ellipsoid lobes ([x, y, z, rx, ry, rz] in cells), chips cells at the skin and cuts a flat
  // base, and meshes it with a palette slot for every `band` cells up, so `sunset` can colour each face by height.
  const billow = (lobes, unit, band) => {
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, y, z, rx, ry, rz] of lobes) {
      x0 = Math.min(x0, x - rx); x1 = Math.max(x1, x + rx); y1 = Math.max(y1, y + ry); z0 = Math.min(z0, z - rz); z1 = Math.max(z1, z + rz);
    }
    const ox = Math.floor(x0) - 1, oz = Math.floor(z0) - 1, sx = Math.ceil(x1) - ox + 2, sy = Math.ceil(y1) + 2, sz = Math.ceil(z1) - oz + 2;
    const field = new Float32Array(sx * sy * sz), grid = BL.terrain.makeGrid(sx, sy, sz);
    for (const [lx, ly, lz, rx, ry, rz] of lobes) {
      for (let x = Math.max(0, Math.floor(lx - rx - ox)); x <= Math.min(sx - 1, Math.ceil(lx + rx - ox)); x++)
        for (let y = Math.max(0, Math.floor(ly - ry)); y <= Math.min(sy - 1, Math.ceil(ly + ry)); y++)
          for (let z = Math.max(0, Math.floor(lz - rz - oz)); z <= Math.min(sz - 1, Math.ceil(lz + rz - oz)); z++) {
            const dx = (x + ox + 0.5 - lx) / rx, dy = (y + 0.5 - ly) / ry, dz = (z + oz + 0.5 - lz) / rz, k = 1 - dx * dx - dy * dy - dz * dz, i = grid.index(x, y, z);
            if (k > field[i]) field[i] = k;
          }
    }
    for (let x = 0; x < sx; x++) for (let y = 1; y < sy; y++) for (let z = 0; z < sz; z++) {
      const k = field[grid.index(x, y, z)];
      if (k <= 0 || (k < 0.1 && hash(x, y, z) < 0.3)) continue;
      grid.set(x, y, z, 1 + Math.min(14, Math.floor(y / band)));
    }
    const palette = [null];
    for (let n = 0; n < 15; n++) palette.push([255, 255, 255]);
    const geo = BL.terrain.gridGeometry(grid, { unit, palette, origin: { x: ox * unit, y: -unit, z: oz * unit } });
    geo.castShadow = false;
    geo.cutawayPreserve = true;
    return { geo, height: y1 * unit };
  };
  const DUSK = hexToRgb("#7a6a9a"), ROSE = hexToRgb("#f2a487"), CREAM = hexToRgb("#fff0cf"), GOLD = hexToRgb("#ffb347"), LILAC = hexToRgb("#9d8cd4");
  // Colours a cloud's faces for a low sun from the horizontal `sunX`, `sunZ` (null on a cloud that turns): cream on
  // the tops, gold where a face turns to the sun, lilac where it turns away, rose through the middle and dusk under
  // the base, `warm` scaling the gold. The sunlit upper faces glow a little for the bloom.
  const sunset = (geo, height, sunX, sunZ, warm = 1) => {
    const v = geo.verts, normals = [];
    let flip = 1, highest = -Infinity;
    for (const f of geo.faces) {
      let nx = 0, ny = 0, nz = 0, cy = 0;
      for (let k = 0; k < f.i.length; k++) {
        const a = f.i[k] * 3, b = f.i[(k + 1) % f.i.length] * 3;
        nx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]); ny += (v[a + 2] - v[b + 2]) * (v[a] + v[b]); nz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
        cy += v[a + 1] / f.i.length;
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / l, ny / l, nz / l, cy);
      if (cy > highest && Math.abs(ny) > 0.5 * l) { highest = cy; flip = ny > 0 ? 1 : -1; }
    }
    geo.faces.forEach((f, n) => {
      const nx = normals[n * 4] * flip, ny = normals[n * 4 + 1] * flip, nz = normals[n * 4 + 2] * flip, t = Math.max(0, Math.min(1, normals[n * 4 + 3] / height));
      let col = t < 0.5 ? mix(DUSK, ROSE, smooth(0, 0.5, t)) : mix(ROSE, CREAM, smooth(0.5, 1, t));
      const facing = sunX === null ? 0 : nx * sunX + nz * sunZ;
      if (ny > 0.5) col = mix(col, CREAM, 0.45);
      else if (ny < -0.5) col = mix(col, DUSK, 0.6);
      else if (facing > 0) col = mix(col, GOLD, facing * (0.45 + 0.45 * t) * warm);
      else col = mix(col, LILAC, -facing * 0.5);
      f.color = col;
      f.emissive = ny < -0.5 ? 0 : 0.08 + (0.1 + Math.max(0, facing) * 0.3) * t * t * warm + (ny > 0.5 ? 0.12 * t : 0);
    });
  };
  // A towering cumulus five metres a cell: billows stacked up a leaning axis, narrowing as they climb, each with a
  // few smaller billows round it, under an anvil spread across the top (or, on variant 1, a rounded crown).
  const SPIRE_CELL = 5;
  // Every Amber Spires tower stands at one scale, so their blocks match and the near ones tower over the course.
  const SPIRE_SCALE = 1.3;
  // Its young towers: how far off the course they stand (least and spread), and in seconds from the Play press: how
  // long after one the next starts, how far apart a tower's billows start to puff up the column and how long each
  // takes, and when its top starts to spread out over it and how long that takes.
  const YOUNG = { across: [220, 50], every: 2.5, gap: 1.4, puff: 3.5, top: 12, spread: 5 };
  // A tower's lobes in cells ([x, y, z, rx, ry, rz]): its column's nine billows, each followed by its three small
  // ones, then its anvil or crown.
  const spireLobes = (v) => {
    const rand = mulberry32(431 + v * 19), height = 32 + v * 5 + rand() * 6, base = 8 + rand() * 3, lean = (rand() - 0.5) * 0.3, lobes = [];
    for (let k = 0; k < 9; k++) {
      const f = k / 8, y = 2 + f * height * 0.82, r = base * (1 - 0.42 * f) * (0.88 + rand() * 0.24), lx = lean * f * height, lz = lean * 0.4 * f * height;
      lobes.push([lx, y, lz, r, r * 0.8, r]);
      for (let s = 0; s < 3; s++) {
        const a = rand() * TAU, o = r * 0.68;
        lobes.push([lx + Math.cos(a) * o, y + (rand() - 0.3) * r * 0.5, lz + Math.sin(a) * o, r * 0.55, r * 0.5, r * 0.55]);
      }
    }
    const tx = lean * height * 0.95, tz = lean * 0.38 * height;
    if (v === 1) lobes.push([tx, height * 0.9, tz, base * 0.62, base * 0.55, base * 0.62]);
    else {
      lobes.push([tx, height * 0.88, tz, base * 1.75, 2.6, base * 1.4]);
      for (let s = 0; s < 5; s++) { const a = s / 5 * TAU + rand(); lobes.push([tx + Math.cos(a) * base, height * 0.9, tz + Math.sin(a) * base * 0.8, base * 0.55, 2.2, base * 0.5]); }
    }
    return lobes;
  };
  const spireCache = M.scopedMap(), pieceCache = M.scopedMap();
  const spire = (v, sunX, sunZ) => {
    const key = `${v}:${sunX.toFixed(3)}:${sunZ.toFixed(3)}`;
    if (spireCache.has(key)) return spireCache.get(key);
    const { geo, height: h } = billow(spireLobes(v), SPIRE_CELL, 3);
    sunset(geo, h, sunX, sunZ);
    spireCache.set(key, geo);
    return geo;
  };
  // The same tower in pieces to grow it: each column billow with its small ones, then its top, each a mesh centred on
  // its billow and coloured for its place in the whole tower, with where it stands in the tower (`x`, `y`, `z`) and
  // how far below that it starts (`rise`).
  const spirePieces = (v, sunX, sunZ) => {
    const key = `${v}:${sunX.toFixed(3)}:${sunZ.toFixed(3)}`;
    if (pieceCache.has(key)) return pieceCache.get(key);
    const lobes = spireLobes(v), pieces = [];
    let height = 0;
    for (const lobe of lobes) height = Math.max(height, (lobe[1] + lobe[4]) * SPIRE_CELL);
    for (let at = 0; at < lobes.length; at += 4) {
      const part = at < 36 ? lobes.slice(at, at + 4) : lobes.slice(at), [lx, ly, lz, , ry] = part[0], { geo } = billow(part, SPIRE_CELL, 3);
      sunset(geo, height, sunX, sunZ);
      // A cell's centre stands a cell lower in metres than in the lobes' cells (`billow`'s origin).
      const x = lx * SPIRE_CELL, y = (ly - 1) * SPIRE_CELL, z = lz * SPIRE_CELL;
      pieces.push({ geo: M.moved(geo, -x, -y, -z), x, y, z, rise: ry * SPIRE_CELL * 0.9 });
      if (at >= 36) break;
    }
    pieceCache.set(key, pieces);
    return pieces;
  };
  // A long low bank for the horizon, six metres a cell, its long side down x; `warm` is how squarely it faces the sun.
  const bank = M.variants((i) => {
    const v = i % 2, rand = mulberry32(611 + v * 23), L = 46 + v * 10, lobes = [];
    for (let k = 0; k < 14; k++) {
      const r = 4 + rand() * 3.5, ry = r * 0.6;
      lobes.push([(k / 13 - 0.5) * L, 1 + ry * 0.6, (rand() - 0.5) * 6, r * 1.3, ry, r]);
    }
    const { geo, height } = billow(lobes, 6, 2);
    sunset(geo, height, null, null, i < 2 ? 1 : 0.35);
    return geo;
  });
  // A paper sky lantern a metre tall, lit from a flame at its open foot.
  const lantern = M.cached(() => {
    const paper = M.lathe({ profile: [[0.3, 0.05], [0.42, 0.3], [0.46, 0.7], [0.36, 1.0], [0, 1.04]], segments: 6, color: (t) => t < 0.34 ? "#ffe08a" : t < 0.67 ? "#ffc060" : "#ffa04a", emissive: 1 });
    const flame = M.box({ w: 0.16, h: 0.2, d: 0.16, color: "#fff2b0", emissive: 1, offset: { y: 0.12 } });
    const g = M.merge(paper, flame);
    g.castShadow = false;
    return g;
  });
  const goose = M.cached(() => {
    const g = BL.dressing.set().put("gull", 0, 0, 0).build().solid;
    g.castShadow = false;
    return g;
  });

  // ---- The aurora and the night --------------------------------------------------------------------------------
  // One ray of a curtain: a pixel column standing on the curtain's lower edge, a vertical sheet with its local x
  // running up it from 0 (the edge) to 1 and z across it, in hard bands of colour as pixel art draws it (`RAY_ROWS`
  // where each band starts), coloured as a real aurora is: brightest and sharpest at its lower edge, then green
  // fading through teal as it rises into the faint violet and red of its top, which the beam fades out up x. It shows
  // through any haze, as something a hundred kilometres up does.
  const RAY_INKS = ["#e8ffc8", "#9dff8c", "#55f07a", "#2fd370", "#24ae7a", "#3b8790", "#6c5c9c", "#a4467e"];
  const RAY_ROWS = [0, 0.02, 0.08, 0.2, 0.36, 0.52, 0.68, 0.84, 1];
  // Under a curtain's lower edge, its local x running down from it: a thin pink fringe, then a soft green glow on the
  // sky fading down.
  const SKIRT_INKS = ["#ff74b8", "#62e08c", "#45c27a", "#2e9c6c"];
  const SKIRT_ROWS = [0, 0.12, 0.35, 0.68, 1];
  const column = (inks, rows, glass, beam) => {
    const g = M.geometry(), rgb = inks.map(hexToRgb), ids = [];
    // Each band in two, its upper half a step toward the next band's ink, for a finer grain.
    for (let r = 0; r < rows.length; r++) {
      ids.push([M.pushVert(g, rows[r], 0, -0.5), M.pushVert(g, rows[r], 0, 0.5)]);
      if (r < rgb.length) { const m = (rows[r] + rows[r + 1]) / 2; ids.push([M.pushVert(g, m, 0, -0.5), M.pushVert(g, m, 0, 0.5)]); }
    }
    for (let r = 0; r < rgb.length * 2; r++) {
      const ink = r % 2 ? mix(rgb[r >> 1], rgb[Math.min(rgb.length - 1, (r >> 1) + 1)], 0.5) : rgb[r >> 1];
      M.face(g, [ids[r][0], ids[r][1], ids[r + 1][1], ids[r + 1][0]], ink, { emissive: 1 });
    }
    // Two-sided, as Canvas 2D would otherwise drop whichever face a column turns from the eye.
    g.glass = glass; g.lightBeam = beam; g.castShadow = false; g.fogPierce = 1; g.twoSided = true;
    return g;
  };
  const ray = M.cached(() => column(RAY_INKS, RAY_ROWS, 0.5, 1.35));
  const skirt = M.cached(() => column(SKIRT_INKS, SKIRT_ROWS, 0.3, 1));
  // A crystal shard from the origin, `len` along its axis leaned `tilt` from upright toward the bearing `lean`: a six-
  // sided prism to a point, its facets alternately light and dark and glowing brighter toward the tip, in `inks`
  // [deep, body, light, tip].
  const shard = (len, r, inks, tilt, lean, x, y, z) => {
    const deep = hexToRgb(inks[0]);
    const geo = M.lathe({ profile: [[r * 0.75, 0], [r, len * 0.12], [r * 0.95, len * 0.7], [r * 0.4, len * 0.9], [0, len]], segments: 6,
      color: (t) => inks[Math.min(3, Math.floor(t * 4))] });
    geo.faces.forEach((f, n) => { if (n % 2) f.color = mix(f.color, deep, 0.35); f.emissive = 0.55 + 0.15 * Math.floor(n / 6); });
    return M.moved(M.turnedY(M.turnedZ(geo, tilt), Math.PI - lean), x, y, z);
  };
  // Teal, violet, mint and rose.
  const CRYSTAL_INKS = [["#0c6f78", "#22c7bb", "#8ff4ea", "#e6fffc"], ["#40268a", "#7c52e6", "#bf9fff", "#f1e8ff"],
    ["#176e45", "#3fd98d", "#a8ffd0", "#effff5"], ["#7a1f5c", "#e05aa8", "#ffa8d8", "#fff0f8"]];
  // A cluster grown from a dark rock: a tall shard in the middle and a ring of shorter ones leaning out, now and then
  // one of the next colour. Variants 0-3 are the great floating ones, 4-7 small ones for the isles.
  const cluster = M.variants((i) => {
    const v = i % 4, small = i >= 4, rand = mulberry32(5150 + i * 31), inks = CRYSTAL_INKS[v];
    const parts = [M.lathe({ profile: [[0, -1.1], [0.7, -0.85], [1.15, -0.35], [1.0, 0.05], [0.55, 0.22], [0, 0.26]], segments: 7,
      color: (t) => t < 0.5 ? "#2b2735" : "#3a3546" })];
    parts.push(shard(small ? 2.2 : 3.6, small ? 0.38 : 0.58, inks, (rand() - 0.5) * 0.2, rand() * TAU, 0, 0.1, 0));
    for (let k = 0, n = small ? 4 : 7; k < n; k++) {
      const a = k / n * TAU + rand() * 0.6, d = 0.35 + rand() * 0.4;
      parts.push(shard((small ? 0.9 : 1.3) + rand() * (small ? 1 : 1.6), (small ? 0.18 : 0.24) + rand() * 0.14, CRYSTAL_INKS[(v + (rand() < 0.25 ? 1 : 0)) % 4],
        0.45 + rand() * 0.5, a, Math.cos(a) * d, 0.05, Math.sin(a) * d));
    }
    const g = M.merge(...parts);
    g.castShadow = false;
    return g;
  });
  // Six small shards on a ring round a great crystal, which turns them about it.
  const orbit = M.variants((v) => {
    const rand = mulberry32(6262 + v), parts = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU + rand() * 0.4;
      parts.push(shard(0.6 + rand() * 0.4, 0.12, CRYSTAL_INKS[v], rand() * Math.PI, rand() * TAU, Math.cos(a) * 2.8, (rand() - 0.5) * 0.8, Math.sin(a) * 2.8));
    }
    const g = M.merge(...parts);
    g.castShadow = false;
    return g;
  });
  // A soft additive glow behind a great crystal, in its colour, turned to the eye every frame.
  const GLOWS = ["90,240,230", "170,130,255", "120,255,180", "255,120,200"];
  const glow = M.variants((v) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const paint = canvas.getContext("2d"), gradient = paint.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, `rgba(${GLOWS[v]},0.55)`); gradient.addColorStop(0.4, `rgba(${GLOWS[v]},0.2)`); gradient.addColorStop(1, `rgba(${GLOWS[v]},0)`);
    paint.fillStyle = gradient; paint.fillRect(0, 0, 128, 128);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const g = M.panel({ tilesX: 1, tilesY: 1, color: "#000000" });
    g.castShadow = false; g.cutawayPreserve = true;
    g.imageSurface = { asset: { width: 128, height: 128, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright: 0.25 };
    return g;
  });
  // A lighthouse's warm light far off in the haze, turned to the eye every frame: it falls away smoothly to nothing
  // well inside its square, so no edge of the picture shows even when a beam flares it.
  const hazeLight = M.cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const paint = canvas.getContext("2d"), gradient = paint.createRadialGradient(64, 64, 0, 64, 64, 54);
    for (const [at, alpha] of [[0, 0.6], [0.2, 0.42], [0.45, 0.17], [0.7, 0.05], [1, 0]]) gradient.addColorStop(at, `rgba(255,226,160,${alpha})`);
    paint.fillStyle = gradient; paint.beginPath(); paint.arc(64, 64, 54, 0, TAU); paint.fill();
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const g = M.panel({ tilesX: 1, tilesY: 1, color: "#000000" });
    g.castShadow = false; g.cutawayPreserve = true;
    g.imageSurface = { asset: { width: 128, height: 128, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright: 0.25 };
    return g;
  });
  // Glowing mushrooms, three to a clump: pale stems under caps glowing cyan (0) or pink (1), darker underneath.
  const MUSHROOM_INKS = [["#5ff5ff", "#2aa8c0"], ["#ff7ad9", "#c04a9a"]];
  const mushrooms = M.variants((v) => {
    const rand = mulberry32(777 + v), parts = [];
    for (let k = 0; k < 3; k++) {
      const m = 0.6 + rand() * 0.6, a = k / 3 * TAU + rand(), d = k ? 0.35 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d;
      parts.push(M.moved(M.lathe({ profile: [[0.07 * m, 0], [0.06 * m, 0.5 * m], [0.08 * m, 0.6 * m]], segments: 6, color: "#e8e2d4", emissive: 0.25 }), x, 0, z));
      parts.push(M.moved(M.lathe({ profile: [[0.05 * m, 0.55 * m], [0.32 * m, 0.6 * m], [0.3 * m, 0.7 * m], [0.18 * m, 0.82 * m], [0, 0.86 * m]], segments: 8,
        color: (t) => t < 0.3 ? MUSHROOM_INKS[v][1] : MUSHROOM_INKS[v][0], emissive: 0.85 }), x, 0, z));
    }
    const g = M.merge(...parts);
    g.castShadow = false;
    return g;
  });
  // A standing stone with glowing runes cut through it.
  const runestone = M.cached(() => {
    const parts = [M.bevelBox({ w: 0.7, h: 2.2, d: 0.45, color: "#3a3646", offset: { y: 1.1 } })];
    for (let k = 0; k < 4; k++) {
      parts.push(M.box({ w: 0.36, h: 0.06, d: 0.47, color: "#7dfff0", emissive: 1, offset: { y: 0.5 + k * 0.38 } }));
      parts.push(M.box({ w: 0.06, h: 0.2, d: 0.47, color: "#7dfff0", emissive: 1, offset: { x: k % 2 ? 0.12 : -0.12, y: 0.62 + k * 0.38 } }));
    }
    const g = M.merge(...parts);
    g.castShadow = false;
    return g;
  });
  // A fall of light pouring off a night isle's rim: two crossed sheets, its local x down, fading as it falls.
  const lightFall = M.cached(() => {
    const g = M.geometry(), ink = hexToRgb("#7dffe0");
    for (const plane of [0, 1]) {
      const at = (x, u) => M.pushVert(g, x, plane ? u : 0, plane ? 0 : u);
      M.face(g, [at(0, -0.5), at(0, 0.5), at(1, 0.5), at(1, -0.5)], ink, { emissive: 0.9 });
    }
    g.glass = 0.32; g.lightBeam = 1; g.castShadow = false;
    return g;
  });
  const firefly = M.cached(() => {
    const g = M.box({ w: 1, h: 1, d: 1, color: "#e8ff9a", emissive: 1 });
    g.castShadow = false;
    return g;
  });
  // A shooting star: a streak from its head (0) back along x to a fading tail (1), narrowing as it goes.
  const streak = M.cached(() => {
    const g = M.geometry(), inks = ["#ffffff", "#e6f3ff", "#b8dcff"].map(hexToRgb), ids = [];
    for (let r = 0; r <= inks.length; r++) { const x = r / inks.length, w = 0.5 * (1 - 0.75 * x); ids.push([M.pushVert(g, x, 0, -w), M.pushVert(g, x, 0, w)]); }
    for (let r = 0; r < inks.length; r++) M.face(g, [ids[r][0], ids[r][1], ids[r + 1][1], ids[r + 1][0]], inks[r], { emissive: 1 });
    g.glass = 0.95; g.lightBeam = 1; g.castShadow = false;
    return g;
  });
  // ---- The storm ------------------------------------------------------------------------------------------------
  // Greys a sampled sky for a storm, once as the hub samples it: its colours toward a cold grey by `storm`, the sun
  // and its direct light cut.
  const grade = (opts, storm) => {
    const grey = (rgb) => {
      const l = rgb[0] * 0.3 + rgb[1] * 0.55 + rgb[2] * 0.15;
      rgb[0] += (l * 0.62 - rgb[0]) * storm; rgb[1] += (l * 0.68 - rgb[1]) * storm; rgb[2] += (l * 0.8 - rgb[2]) * storm;
    };
    grey(opts.horizon); grey(opts.zenith); grey(opts.clear); grey(opts.sky); grey(opts.ground);
    opts.directStrength *= 1 - 0.75 * storm;
    for (let i = 0; i < 3; i++) opts.sun[i] *= 1 - 0.85 * storm;
  };
  // A lightning flash lifts the sky and the haze for a frame, `level` 0 to 1; the hub's next restore takes it off.
  const flashSky = (opts, level) => {
    for (let i = 0; i < 3; i++) {
      opts.horizon[i] = Math.min(1, opts.horizon[i] + level * 0.35); opts.zenith[i] = Math.min(1, opts.zenith[i] + level * 0.25);
      opts.clear[i] = Math.min(1, opts.clear[i] + level * 0.35); opts.sky[i] = Math.min(1, opts.sky[i] + level * 0.3);
      opts.ground[i] = Math.min(1, opts.ground[i] + level * 0.15);
    }
  };
  // The flash strobes twice, then decays: full, a dip, a second bright, the tail (weather.js's own envelope).
  const flashAt = (t) => t < 0.08 ? 1 : t < 0.14 ? 0.25 : t < 0.22 ? 0.85 : 0.85 * Math.exp(-(t - 0.22) / 0.12);
  // A bolt, unit height from its top (y 1) down to its foot (0): a jagged trunk with forks, two crossed ribbons so
  // it reads from any side, one shape a variant; it shows through most of the haze.
  const bolt = M.variants((v) => {
    const g = M.geometry(), rand = mulberry32(4242 + v * 131), ink = hexToRgb("#f2ecff"), lit = { emissive: 1 }, w = 0.007;
    const segment = (x0, y0, x1, y1, width) => {
      const a = M.pushVert(g, x0 - width, y0, 0), b = M.pushVert(g, x0 + width, y0, 0), c = M.pushVert(g, x1 + width, y1, 0), d = M.pushVert(g, x1 - width, y1, 0);
      const e = M.pushVert(g, x0, y0, -width), f = M.pushVert(g, x0, y0, width), h = M.pushVert(g, x1, y1, width), k = M.pushVert(g, x1, y1, -width);
      M.face(g, [a, b, c, d], ink, lit); M.face(g, [e, f, h, k], ink, lit);
    };
    let x = 0, y = 1;
    while (y > 0) {
      const nx = x + (rand() - 0.5) * 0.08, ny = y - 0.03 - rand() * 0.04;
      segment(x, y, nx, Math.max(0, ny), w);
      if (rand() < 0.22) {
        const bx = nx + (rand() - 0.5) * 0.16, by = ny - 0.06 - rand() * 0.05;
        segment(nx, ny, bx, by, w * 0.55);
        if (rand() < 0.5) segment(bx, by, bx + (rand() - 0.5) * 0.08, by - 0.05, w * 0.35);
      }
      x = nx; y = ny;
    }
    g.castShadow = false; g.fogPierce = 0.8;
    return g;
  });
  // A lighthouse in metres up from its foot: a stone plinth, a tapering tower banded white and Bitcoin orange, the
  // gallery's deck and rail, the lantern's glowing lamp, its mullions and a dark cap. `LAMP_Y` is the lamp's middle.
  const LAMP_Y = 12.6, TOWER_BANDS = 6, TOWER_INKS = ["#f2eee4", "#f7931a"], IRON = "#2b2a30";
  const lighthouse = M.cached(() => {
    const profile = [];
    for (let b = 0; b <= TOWER_BANDS; b++) profile.push([1.55 - 0.5 * b / TOWER_BANDS, 0.8 + 10.8 * b / TOWER_BANDS]);
    const parts = [
      M.lathe({ profile: [[2.3, -1.2], [2.3, 0.5], [1.95, 0.8], [0, 0.8]], segments: 12, color: "#5a5860" }),
      M.lathe({ profile, segments: 12, color: (t) => TOWER_INKS[Math.round(t * TOWER_BANDS) % 2] }),
      M.lathe({ profile: [[1.05, 11.6], [1.75, 11.6], [1.75, 11.85], [0, 11.85]], segments: 12, color: IRON }),
      M.lathe({ profile: [[1.7, 12.5], [1.7, 12.62]], segments: 12, color: IRON }),
      M.lathe({ profile: [[1.0, 13.4], [1.05, 13.55], [0.85, 14.0], [0.45, 14.4], [0.12, 14.65], [0, 14.7]], segments: 12, color: "#3b2a2a" }),
      M.lathe({ profile: [[0, 14.7], [0.16, 14.8], [0.16, 15.1], [0, 15.2]], segments: 6, color: IRON }),
      M.lathe({ profile: [[0.82, 11.85], [0.82, 13.4], [0, 13.4]], segments: 8, color: "#fff1c2", emissive: 1 })
    ];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, b = a + TAU / 16;
      parts.push(M.box({ w: 0.08, h: 0.7, d: 0.08, color: IRON, offset: { x: Math.cos(a) * 1.68, y: 12.2, z: Math.sin(a) * 1.68 } }));
      parts.push(M.box({ w: 0.1, h: 1.55, d: 0.1, color: IRON, offset: { x: Math.cos(b) * 0.9, y: 12.62, z: Math.sin(b) * 0.9 } }));
    }
    const g = M.merge(...parts);
    g.castShadow = false;
    return g;
  });
  // A lighthouse's beam along +x from the lamp (0) to its end (1), widening as it goes, in rings so Canvas 2D fades
  // it too.
  const beam = M.cached(() => {
    const g = M.geometry(), ink = hexToRgb("#fff3cf"), lit = { emissive: 1 }, RINGS = 8, SIDES = 8, rings = [];
    for (let k = 0; k <= RINGS; k++) {
      const x = k / RINGS, r = 0.03 + 0.47 * x, ring = [];
      for (let s = 0; s < SIDES; s++) ring.push(M.pushVert(g, x, Math.cos(s / SIDES * TAU) * r, Math.sin(s / SIDES * TAU) * r));
      rings.push(ring);
    }
    for (let k = 0; k < RINGS; k++) for (let s = 0; s < SIDES; s++) M.face(g, [rings[k][s], rings[k + 1][s], rings[k + 1][(s + 1) % SIDES], rings[k][(s + 1) % SIDES]], ink, lit);
    g.glass = 0.3; g.lightBeam = 1; g.castShadow = false;
    return g;
  });

  // How near (x, z) comes to any cloud's footprint over its whole lane, less that cloud's reach.
  const clearOf = (course, x, z, radius) => {
    for (const c of course.clouds) {
      const ex = c.moveX * c.moveRange, ez = c.moveZ * c.moveRange, dx = x - c.baseX, dz = z - c.baseZ;
      const along = Math.max(-1, Math.min(1, (dx * ex + dz * ez) / Math.max(1e-9, ex * ex + ez * ez)));
      if (Math.hypot(dx - ex * along, dz - ez * along) < radius + Math.max(c.rx, c.rz) + GAP) return false;
    }
    return true;
  };
  // An instanced batch of `count` copies of `geometry`, written in place by the caller (one draw). Each instance's
  // glow (its 17th float) is 1, so emissive faces light as they do on an ordinary node.
  const batch = (geometry, count) => {
    const data = new Float32Array(count * 20);
    for (let o = 16; o < data.length; o += 20) data[o] = 1;
    return createNode({ geometry, instanceData: data, instanceCount: count, instanceVersion: 0, fixedInstanceCapacity: true, sightHidden: true });
  };
  // Writes an instance's matrix from its three axes (scaled) and its position.
  const write = (d, o, ax, ay, az, bx, by, bz, cx, cy, cz, x, y, z) => {
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = 0;
    d[o + 4] = bx; d[o + 5] = by; d[o + 6] = bz; d[o + 7] = 0;
    d[o + 8] = cx; d[o + 9] = cy; d[o + 10] = cz; d[o + 11] = 0;
    d[o + 12] = x; d[o + 13] = y; d[o + 14] = z; d[o + 15] = 1;
  };
  const yawed = (d, o, yaw, sx, sy, sz, x, y, z) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    write(d, o, c * sx, 0, -s * sx, 0, sy, 0, s * sz, 0, c * sz, x, y, z);
  };

  // `onStrike(distance)` hears each lightning strike, for its thunder.
  const create = ({ root, renderer, seaY, onStrike = null }) => {
    const lite = renderer?.kind === "canvas2d";
    const scenery = createNode({ visible: false, sightHidden: true });
    addChild(root, scenery);
    // What moves, set by `build`: each a function of the scenery's clock, the frame's dt and the camera.
    const movers = [];
    // The two balloons and their passengers, built once and stood again on each Floating Isles run.
    const balloons = [];
    // `flash` is the storm's lightning this frame, 0 to 1, which the hub lifts the sky by.
    let time = 0, reach = 0, flash = 0;
    const node = (geometry, x, y, z, s = 1, parent = scenery) => {
      const n = createNode({ geometry, position: { x, y, z }, scale: { x: s, y: s, z: s }, sightHidden: true });
      addChild(parent, n);
      return n;
    };
    const reached = (x, y, z, size) => {
      const start = route.start;
      reach = Math.max(reach, Math.hypot(x - start.x, y - start.y, z - start.z) + size);
    };
    // The route from the finish (t = 0) out to the start (t = 1): where a point `across` it stands and how high the
    // course runs there.
    const route = { start: null, finish: null, length: 0, nx: 0, nz: 0, sideX: 0, sideZ: 0, ahead: 0 };
    const POINT = { x: 0, z: 0 };
    const at = (t, across) => {
      const along = SHORE + (route.length - SHORE) * t;
      POINT.x = route.finish.x + route.nx * along + route.sideX * across;
      POINT.z = route.finish.z + route.nz * along + route.sideZ * across;
      return POINT;
    };
    const routeY = (t) => route.finish.y + 18 + (route.start.y - route.finish.y - 18) * t;
    // Steps a point at `t` out across the route until it clears every lane by GAP; null when it cannot.
    const place = (course, t, across, radius) => {
      const side = Math.sign(across) || 1;
      for (let tries = 0; tries <= TRIES; tries++, across += side * STEP) {
        const p = at(t, across);
        if (clearOf(course, p.x, p.z, radius)) return p;
      }
      return null;
    };

    // Stands an isle, its rim facing a random way, and returns its node.
    const standIsle = (shape, x, y, z, s, spin) => {
      const base = node(shape.geometry, x, y, z, s);
      base.rotation.y = spin;
      if (shape.fall) {
        // Its fall flows as the Mempool rainforest's do: the lake's water runs down it from the lip, its texture laid
        // across it and down it in metres, from where this isle stands. Canvas 2D draws a face from one side only.
        const f = shape.fall, c = Math.cos(spin), n = Math.sin(spin), ax = f.ux * c + f.uz * n, az = -f.ux * n + f.uz * c;
        const ox = x + (f.ox * c + f.oz * n) * s, oz = z + (-f.ox * n + f.oz * c) * s;
        const geometry = { ...f.geometry, lakeFlow: new Float32Array([ax, 0, az, -ax * ox - az * oz, 0, -1, 0, y + f.oy * s]) };
        if (lite) geometry.faces = [...f.geometry.faces, ...f.geometry.faces.map((face) => ({ ...face, i: [...face.i].reverse() }))];
        node(geometry, 0, 0, 0, 1, base);
      }
      for (const m of shape.mist) {
        const holder = node(null, m.x, m.y, m.z, 1, base);
        addChild(holder, BL.cloudHopperModels.cloud(m.size, m.size * 0.8, m.size * 0.7, "normal", spin));
      }
      reached(x, y, z, shape.radius * s);
      return base;
    };
    // How far an isle's rim reaches at world bearing `a`, in metres.
    const rimToward = (shape, base, a) => {
      const k = Math.round((a + base.rotation.y) / TAU * RIM_STEPS);
      return shape.rim[((k % RIM_STEPS) + RIM_STEPS) % RIM_STEPS] * base.scale.x;
    };
    const isles = (level, course, rand) => {
      for (let k = 0; k < 16; k++) {
        const t = (k + 0.5) / 16, side = k % 2 ? 1 : -1, far = k % 3 === 2, v = (k * 3 + 1) % 4, shape = isle(v);
        const s = far ? 1.7 + rand() * 0.8 : 0.9 + rand() * 0.5, y = routeY(t) - (far ? -10 + rand() * 25 : 14 + rand() * 26), spin = rand() * TAU;
        const p = place(course, t, side * (far ? 120 + rand() * 50 : 36 + rand() * 40), shape.radius * s);
        if (!p) continue;
        const x = p.x, z = p.z, base = standIsle(shape, x, y, z, s, spin);
        // Palms, a tree, bushes and, on the biggest, a hut, each standing on one of the isle's spots.
        shape.spots.forEach((spot, n) => {
          const geometry = v === 3 && n === 0 ? hut() : n % 3 === 0 ? BL.dressing.palm((k + n) % 3) : n % 3 === 1 ? BL.hubModels.tree((k + n) % 3) : BL.hubModels.bush((k + n) % 3);
          const size = v === 3 && n === 0 ? 0.8 : n % 3 === 0 ? 0.55 + rand() * 0.2 : n % 3 === 1 ? 0.32 + rand() * 0.08 : 0.5;
          node(geometry, spot.x, spot.y, spot.z, size, base).rotation.y = rand() * TAU;
        });
        // Every third near isle has a small one hung off it on a rope bridge, further out at the same height.
        if (k % 3 !== 1) continue;
        const small = isle(1), s2 = s * 0.7, a = Math.atan2(route.sideZ * side, route.sideX * side), spin2 = rand() * TAU;
        const gap = 12 + rand() * 6, out = shape.radius * s + gap + small.radius * s2;
        const qx = x + Math.cos(a) * out, qz = z + Math.sin(a) * out;
        if (!clearOf(course, qx, qz, small.radius * s2)) continue;
        const other = standIsle(small, qx, y, qz, s2, spin2);
        const ra = rimToward(shape, base, a) * 0.92, rb = rimToward(small, other, a + Math.PI) * 0.92;
        const ax = x + Math.cos(a) * ra, az = z + Math.sin(a) * ra, ay = y + shape.lip * s, bx = qx - Math.cos(a) * rb, bz = qz - Math.sin(a) * rb, by = y + small.lip * s2;
        const len = Math.hypot(bx - ax, by - ay, bz - az), span = node(bridge(), ax, ay, az, len);
        span.rotation.y = Math.atan2(-(bz - az), bx - ax); span.rotation.z = Math.asin((by - ay) / len);
      }
      // Two Ooga balloons drifting toward the island, bobbing, each with an Ooga in its basket.
      for (let n = 0; n < 2; n++) {
        if (!balloons[n]) {
          const holder = createNode({ geometry: balloon(n), sightHidden: true });
          // The passenger keeps an island Ooga's own size inside the scaled balloon.
          const passenger = BL.models.caveman(BL.contributors.traitsFor(`balloon-ooga-${n}`)), figure = passenger.root;
          figure.scale.x = figure.scale.y = figure.scale.z = 1 / BALLOON_SCALE;
          figure.position.y = 0.5 + figure.scale.y * passenger.traits.height * 5 / 16; figure.rotation.y = n ? 0.4 : -0.3;
          passenger.parts.club.visible = false;
          passenger.parts.armR.rotation.x = -2.6;
          figure.sightHidden = true;
          addChild(holder, figure);
          balloons.push(holder);
        }
        const holder = balloons[n], t = n ? 0.68 : 0.28, side = n ? 1 : -1, p = place(course, t, side * (55 + rand() * 25), 8);
        if (!p) continue;
        const x0 = p.x, z0 = p.z, y0 = routeY(t) + (n ? -6 : 8), ph = rand() * TAU;
        holder.position.x = x0; holder.position.y = y0; holder.position.z = z0; holder.scale.x = holder.scale.y = holder.scale.z = BALLOON_SCALE;
        addChild(scenery, holder);
        reached(x0, y0, z0, 12);
        movers.push((time) => {
          holder.position.x = x0 - route.nx * time * 0.6; holder.position.z = z0 - route.nz * time * 0.6;
          holder.position.y = y0 + Math.sin(time * 0.35 + ph) * 1.2;
          holder.rotation.y = ph + time * 0.04; holder.rotation.z = Math.sin(time * 0.5 + ph) * 0.03;
        });
      }
      // The double rainbow, centred over the island beyond it as the course sees it, facing the course.
      const a = Math.atan2(-route.nz, -route.nx);
      for (const [geometry, { behind: r, size }] of [[outerRainbow(), RAINBOW], [rainbow(), INNER_RAINBOW]]) {
        const arc = node(geometry, route.finish.x + Math.cos(a) * r, seaY + size, route.finish.z + Math.sin(a) * r, size);
        arc.rotation.z = -Math.PI / 2; arc.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
        reached(arc.position.x, seaY + size, arc.position.z, size);
      }
      if (lite) return;
      // Gulls wheeling beside the route.
      for (const [t, across, seed] of [[0.35, -60, 3], [0.75, 55, 11]]) {
        const p = at(t, across), y = routeY(t), flock = BL.dressing.flock({ count: 12, cx: p.x, cz: p.z, radius: [16, 38], height: [y - 10, y + 10], seed, scale: 1.6 });
        addChild(scenery, flock.node);
        movers.push((time) => flock.update(time));
      }
    };

    const spires = (level, course, rand) => {
      const sun = sunAt(level.sky.hour), sl = Math.hypot(sun.x, sun.z) || 1, sunX = sun.x / sl, sunZ = sun.z / sl, { finish } = route;
      // Towers that grow from the Play press, starting at `at`: billow after billow puffs up out of the one below and
      // flows up the column, then the top spreads out over it. Each is its tower's pieces on nodes of its own, eased
      // into place until all have grown.
      const towers = [], from = new Float32Array(16), s = SPIRE_SCALE;
      let grownAt = 0, grown = false;
      const grow = (v, x, y, z, at) => {
        const tower = createNode({ position: { x, y, z }, scale: { x: s, y: s, z: s }, sightHidden: true });
        for (const piece of spirePieces(v, sunX, sunZ)) {
          renderer?.prepareGeometry(piece.geo);
          const n = createNode({ geometry: piece.geo, position: { x: piece.x, y: piece.y, z: piece.z }, visible: false, matrixCloud: true, sightHidden: true });
          n.piece = piece;
          addChild(tower, n);
        }
        from[towers.length] = at; grownAt = Math.max(grownAt, at + YOUNG.top + YOUNG.spread);
        towers.push(tower); addChild(scenery, tower);
      };
      // Far round the island, four of them growing too (standing grown on Canvas 2D).
      for (let k = 0; k < 10; k++) {
        const a = route.ahead + (k % 2 ? 1 : -1) * (0.15 + rand() * 1.2), r = 420 + rand() * 330;
        const x = finish.x + Math.cos(a) * r, z = finish.z + Math.sin(a) * r, y = seaY + 25 + rand() * 20;
        if (!lite && k % 5 % 2) grow(k % 3, x, y, z, 1.2 + 3 * towers.length);
        else node(spire(k % 3, sunX, sunZ), x, y, z, s).matrixCloud = true;
        reached(x, y + 230 * s, z, 110 * s);
      }
      // Banks round the horizon, gold where they face the sun and dusky where they do not.
      for (let k = 0; k < 12; k++) {
        const a = route.ahead + (k / 12) * TAU + (rand() - 0.5) * 0.3, r = 720 + rand() * 230, s = 0.9 + rand() * 0.3;
        const x = finish.x + Math.cos(a) * r, z = finish.z + Math.sin(a) * r, warm = Math.cos(a) * sunX + Math.sin(a) * sunZ > 0.2;
        const n = node(bank((warm ? 0 : 2) + (k % 2)), x, seaY + 8 + rand() * 30, z, s);
        n.matrixCloud = true; n.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
        reached(x, n.position.y, z, 180 * s);
      }
      if (lite) return;
      // Sky lanterns rising past the course on both sides, each fading in at the foot of its climb and out at the top.
      const N = 64, lanterns = batch(lantern(), N), d = lanterns.instanceData;
      const bx = new Float32Array(N), bz = new Float32Array(N), lo = new Float32Array(N), span = new Float32Array(N), y0 = new Float32Array(N), speed = new Float32Array(N), ph = new Float32Array(N), sc = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = rand(), p = place(course, t, (rand() < 0.5 ? -1 : 1) * (22 + rand() * 110), 6) || at(t, 200);
        bx[i] = p.x; bz[i] = p.z; lo[i] = routeY(t) - 140; span[i] = 190; y0[i] = rand() * 190;
        speed[i] = 0.9 + rand() * 1.1; ph[i] = rand() * TAU; sc[i] = 2.2 + rand() * 1.1;
      }
      addChild(scenery, lanterns);
      movers.push((time) => {
        for (let i = 0; i < N; i++) {
          const climb = (y0[i] + time * speed[i]) % span[i], k = sc[i] * Math.min(1, climb / 15, (span[i] - climb) / 15);
          yawed(d, i * 20, ph[i] + time * 0.2, k, k, k, bx[i] + Math.sin(time * 0.3 + ph[i]) * 3, lo[i] + climb, bz[i] + Math.cos(time * 0.25 + ph[i]) * 3);
        }
        lanterns.instanceVersion++;
      });
      // Geese in a V on a wide circle round the island, a little above the course's middle.
      const G = 11, geese = batch(goose(), G), g = geese.instanceData, R = 300, h = routeY(0.55) + 25, w = 9 / R, a0 = rand() * TAU;
      addChild(scenery, geese);
      movers.push((time) => {
        const a = a0 + time * w, cx = finish.x + Math.cos(a) * R, cz = finish.z + Math.sin(a) * R, tx = -Math.sin(a), tz = Math.cos(a), yaw = Math.atan2(tx, tz);
        for (let i = 0; i < G; i++) {
          const rank = Math.ceil(i / 2), side = i % 2 ? 1 : -1, flap = 0.35 + Math.abs(Math.sin(time * 5.5 + i * 0.7)) * 1.4;
          yawed(g, i * 20, yaw, 1.8, 1.8 * flap, 1.8, cx - tx * rank * 4.5 - tz * side * rank * 3.2, h + rank * 0.3, cz - tz * rank * 4.5 + tx * side * rank * 3.2);
        }
        geese.instanceVersion++;
      });
      // Young towers off to the sides of the course, nearer than the rest, growing one after another down it (`YOUNG`).
      for (let k = 0; k < 6; k++) {
        const p = place(course, 0.92 - 0.13 * k, (k % 2 ? 1 : -1) * (YOUNG.across[0] + rand() * YOUNG.across[1]), 100 * s);
        if (!p) continue;
        const x = p.x, z = p.z, y = seaY + 20 + rand() * 15;
        grow(k % 3, x, y, z, k * YOUNG.every);
        reached(x, y + 250 * s, z, 100 * s);
      }
      movers.push((time) => {
        if (grown) return;
        for (let i = 0; i < towers.length; i++) {
          const nodes = towers[i].children, age = time - from[i];
          for (let n = 0; n < nodes.length; n++) {
            const node = nodes[n], top = n === nodes.length - 1;
            const p = Math.max(0, Math.min(1, (age - (top ? YOUNG.top : n * YOUNG.gap)) / (top ? YOUNG.spread : YOUNG.puff))), e = 1 - (1 - p) ** 3;
            node.visible = e > 0.02;
            node.scale.x = node.scale.y = node.scale.z = e;
            node.position.y = node.piece.y - (1 - e) * node.piece.rise;
          }
        }
        grown = time >= grownAt;
      });
    };

    const aurora = (level, course, rand) => {
      const tier = lite ? 0 : renderer.quality === "low" ? 0.5 : renderer.quality === "medium" ? 0.75 : 1;
      // Dark isles growing glowing crystals: clusters, glowing mushrooms and rune stones on their spots, crystals
      // hanging from their keels, a fall of light off every third one's rim, and fireflies drifting round them all.
      const isles = [];
      for (let k = 0; k < 10; k++) {
        const t = (k + 0.5) / 10, side = k % 2 ? 1 : -1, far = k % 3 === 2, shape = isle((k * 3 + 1) % 4 + 4);
        const s = far ? 1.6 + rand() * 0.7 : 0.9 + rand() * 0.4, y = routeY(t) - (far ? -10 + rand() * 25 : 16 + rand() * 24), spin = rand() * TAU;
        const p = place(course, t, side * (far ? 120 + rand() * 50 : 40 + rand() * 40), shape.radius * s);
        if (!p) continue;
        const x = p.x, z = p.z, base = standIsle(shape, x, y, z, s, spin);
        isles.push(x, y, z);
        shape.spots.forEach((spot, n) => {
          const what = n % 3, piece = node(what === 0 ? cluster(4 + (k + n) % 4) : what === 1 ? mushrooms((k + n) % 2) : runestone(),
            spot.x, spot.y, spot.z, what === 0 ? 0.8 + rand() * 0.35 : what === 1 ? 2 : 0.85, base);
          piece.rotation.y = rand() * TAU;
        });
        shape.hangs.forEach((hang, n) => {
          const piece = node(cluster(4 + (k + n + 1) % 4), hang.x, hang.y + 0.2, hang.z, 0.7 + rand() * 0.3, base);
          piece.rotation.x = Math.PI; piece.rotation.y = rand() * TAU;
        });
        if (k % 3 === 1) {
          const a = rand() * TAU, r = rimToward(shape, base, a) * 0.96, fall = node(lightFall(), x + Math.cos(a) * r, y + shape.lip * s, z + Math.sin(a) * r);
          fall.rotation.z = -Math.PI / 2; fall.scale.x = 26 + rand() * 18; fall.scale.y = fall.scale.z = 1.6 * s;
        }
      }
      if (!lite && isles.length) {
        const N = Math.round(90 * tier), flies = batch(firefly(), N), fd = flies.instanceData, at3 = Float32Array.from(isles), count = isles.length / 3;
        const home = new Uint8Array(N), radius = new Float32Array(N), speed = new Float32Array(N), lift = new Float32Array(N), phase = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          home[i] = i % count; radius[i] = 3 + rand() * 9; speed[i] = (0.2 + rand() * 0.4) * (rand() < 0.5 ? -1 : 1); lift[i] = -2 + rand() * 8; phase[i] = rand() * TAU;
        }
        addChild(scenery, flies);
        movers.push((time) => {
          for (let i = 0; i < N; i++) {
            const o = home[i] * 3, a = phase[i] + time * speed[i], k = 0.08 + 0.07 * (0.5 + 0.5 * Math.sin(time * 3 + phase[i] * 2));
            write(fd, i * 20, k, 0, 0, 0, k, 0, 0, 0, k, at3[o] + Math.cos(a) * radius[i], at3[o + 1] + lift[i] + Math.sin(time * 1.3 + phase[i]) * 0.7, at3[o + 2] + Math.sin(a) * radius[i]);
          }
          flies.instanceVersion++;
        });
      }
      // The great crystals nearer the lanes: clusters on rock, turning and bobbing, a ring of shards turning round
      // each and a glow behind each turned to the eye.
      for (let k = 0; k < 7; k++) {
        const t = (k + 0.5) / 7, p = place(course, t, (k % 2 ? 1 : -1) * (28 + rand() * 35), 6);
        if (!p) continue;
        const v = k % 4, s = 1.1 + rand() * 0.7, gem = node(cluster(v), p.x, routeY(t) - 6 + rand() * 18, p.z, s);
        const ring = node(orbit(v), 0, 1.4, 0, 1, gem), halo = node(glow(v), 0, 0, 0, 8 * s);
        halo.smokeOpacity = 0.45;
        const y0 = gem.position.y, ph = rand() * TAU, turn = (k % 2 ? 1 : -1) * (0.12 + rand() * 0.1);
        gem.rotation.x = (rand() - 0.5) * 0.3;
        reached(p.x, y0, p.z, 10);
        movers.push((time, dt, camera) => {
          gem.rotation.y = ph + time * turn; gem.position.y = y0 + Math.sin(time * 0.45 + ph) * 1.6;
          ring.rotation.y = -time * 0.6 * Math.sign(turn) * 2;
          halo.position.x = gem.position.x; halo.position.y = gem.position.y + 1.4 * s; halo.position.z = gem.position.z;
          const dx = camera.position.x - halo.position.x, dy = camera.position.y - halo.position.y, dz = camera.position.z - halo.position.z;
          halo.rotation.y = Math.atan2(dx, dz); halo.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
        });
      }
      // The aurora as a real one stands: long curtains far off in the sky toward the island, straight but for their
      // folds, so perspective bends each into an arc settling toward the horizon at its ends, and each kept where it
      // stands round the eye, as something a hundred kilometres up stays put however far a rider falls (`CURTAINS`: how
      // far ahead of the eye, how high over it its lower edge runs, how tall its rays stand, how far it runs either
      // side of where it is centred, `side` of the course, its columns' width and how bright it burns; a negative
      // `ahead` is behind the eye). The far ones toward the island stand their lower edge `sea` metres over the sea
      // instead, so from high on the course they hang low over the sea behind the island and rise into the sky as a
      // rider comes down to it; their edges rise and dip `wave` metres, the others' a quarter of their height over the
      // eye. Toward the island: two far ones over the sea, a long low arc and a shorter one off to one side; overhead,
      // three high off to either side, their rays drawing together toward the top of the sky; and behind, two more. A
      // lower edge never comes down under the sea's own height. Each is pixel columns standing edge to edge on its
      // lower edge, each its own height, so the rays are streaked and their tips step as staircases, and under each a
      // skirt of pink fringe and green glow. Canvas 2D gets the two farthest toward the island, coarser and without
      // their skirts.
      const CURTAINS = [
        { ahead: 2600, sea: 30, wave: 40, rise: 560, run: 3600, side: 0, px: 22, bright: 0.75 },
        { ahead: 1500, sea: 80, wave: 40, rise: 420, run: 2600, side: 250, px: 16, bright: 0.85 },
        { ahead: 800, over: 40, rise: 300, run: 1100, side: 500, px: 11, bright: 0.95 },
        { ahead: 420, over: 180, rise: 240, run: 900, side: -350, px: 9, bright: 1 },
        { ahead: 240, over: 300, rise: 260, run: 1200, side: 150, px: 10, bright: 1 },
        { ahead: -260, over: 280, rise: 240, run: 1000, side: -300, px: 10, bright: 0.95 },
        { ahead: -900, over: 60, rise: 320, run: 1600, side: 100, px: 13, bright: 0.85 },
        { ahead: -1800, over: -20, rise: 420, run: 2600, side: -300, px: 18, bright: 0.7 }];
      // How it moves, as a real aurora does: its folds drift along it and change over a minute or two (FOLD, a share
      // of its distance), its rays shimmer and their pleats run along it a few degrees a second, a wave of brightness
      // runs along it every RIPPLE seconds, and every so often it breaks up (BREAKUP): brightening fast, its folds and
      // rays quickening and its pink fringe glowing, then easing back.
      const FOLD = 0.14, RIPPLE = [16, 24], BREAKUP = { first: 40, every: 125, rise: 2, fade: 6, last: 20 };
      const shown = CURTAINS.filter((c, n) => !lite || n < 2).map((c) => ({ ...c, rays: Math.max(24, Math.round(2 * c.run / c.px * (lite ? 0.25 : tier))) }));
      const total = shown.reduce((sum, c) => sum + c.rays, 0), rays = batch(ray(), total), rd = rays.instanceData;
      const skirts = lite ? null : batch(skirt(), total), kd = skirts ? skirts.instanceData : null;
      const wide = new Float32Array(total), beat = new Float32Array(total);
      for (let i = 0; i < total; i++) { wide[i] = rand(); beat[i] = rand() * TAU; }
      let first = 0;
      for (const c of shown) {
        c.first = first; first += c.rays; c.phase = rand() * TAU;
        c.ripple = RIPPLE[0] + rand() * (RIPPLE[1] - RIPPLE[0]); c.offset = rand() * c.ripple;
        reached(route.start.x, route.start.y, route.start.z, route.length + Math.hypot(c.ahead * (1 + FOLD), c.run + Math.abs(c.side)) + Math.abs(c.over ?? 0) * 1.4 + c.rise);
      }
      addChild(scenery, rays);
      if (skirts) addChild(scenery, skirts);
      const fx = Math.cos(route.ahead), fz = Math.sin(route.ahead), sx = route.sideX, sz = route.sideZ;
      // Its clocks: the folds' and the rays', each quickening through a breakup.
      let folds = 0, pleats = 0;
      // Where a curtain's lower edge runs at s along it (0 to 1, side to side), round the eye at e, into P: folding
      // toward and away from the eye and rising and dipping a little as it goes.
      const P = { x: 0, y: 0, z: 0 };
      const edge = (c, s, e) => {
        const along = c.side + (2 * s - 1) * c.run;
        const fold = c.ahead * FOLD * (0.6 * Math.sin(TAU * 1.2 * s + 0.11 * folds + c.phase) + 0.4 * Math.sin(TAU * 2.7 * s - 0.17 * folds + 2 * c.phase));
        P.x = e.x + sx * along + fx * (c.ahead + fold); P.z = e.z + sz * along + fz * (c.ahead + fold);
        P.y = Math.max(seaY + 8, (c.sea === undefined ? e.y + c.over : seaY + c.sea)
          + (c.wave ?? Math.abs(c.over) * 0.25) * (Math.sin(TAU * 1.3 * s + 0.06 * folds + c.phase) + 0.4 * Math.sin(TAU * 3.1 * s - 0.1 * folds + 2 * c.phase)));
      };
      movers.push((time, dt, camera) => {
        // A breakup's strength now: none before the first, then up fast and easing back after each.
        const since = time - BREAKUP.first, into = since - Math.floor(since / BREAKUP.every) * BREAKUP.every;
        const flare = since < 0 || into > BREAKUP.last ? 0 : into < BREAKUP.rise ? into / BREAKUP.rise : Math.exp(-(into - BREAKUP.rise) / BREAKUP.fade);
        folds += dt * (1 + 3 * flare); pleats += dt * (1 + 2 * flare);
        const e = camera.position;
        for (let n = 0; n < shown.length; n++) {
          const c = shown[n], px = c.px, step = px * 0.5, wave = ((time + c.offset) / c.ripple) % 1 * 1.6 - 0.3;
          // Each column spans the edge from one point on it to the next, so it runs on unbroken through its folds.
          edge(c, 0, e);
          let lx = P.x, ly = P.y, lz = P.z;
          for (let i = 0; i < c.rays; i++) {
            const s = (i + 0.5) / c.rays, j = c.first + i, o = j * 20;
            edge(c, (i + 1) / c.rays, e);
            // Bright stretches and faint ones along it, changing slowly, and its ends fading out.
            const taper = Math.sqrt(Math.min(1, s * 8, (1 - s) * 8)) * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(TAU * 1.4 * s + 0.05 * folds + 3 * c.phase))
              * (0.6 + 0.4 * Math.sin(TAU * 3.3 * s - 0.07 * folds + c.phase)));
            // Pleats of bright and dim rays running along it, two ways at once, so it shimmers.
            const pleat = 0.5 + 0.5 * Math.sin(TAU * 17 * s - 2.2 * pleats + c.phase) * Math.sin(TAU * 6.5 * s + 0.9 * pleats + 2 * c.phase);
            const h = px * Math.max(1, Math.round(c.rise * Math.sqrt(taper) * (0.45 + 0.25 * Math.sin(TAU * 4.3 * s + 0.35 * pleats + c.phase) + 0.15 * pleat + 0.15 * wide[j])
              * (1 + 0.3 * flare) / px));
            const y = e.y + step * Math.round(((ly + P.y) / 2 - e.y) / step), dx = P.x - lx, dz = P.z - lz, l = Math.hypot(dx, dz) || 1;
            const cx = (lx + P.x) / 2, cz = (lz + P.z) / 2, ripple = 0.6 * Math.exp(-(((s - wave) / 0.06) ** 2));
            write(rd, o, 0, h, 0, -dz / l, 0, dx / l, dx, 0, dz, cx, y, cz);
            rd[o + 16] = c.bright * taper * ((0.25 + 0.65 * pleat * pleat + 0.1 * Math.sin(7 * time + beat[j])) * (1 + 0.8 * flare) + ripple);
            if (kd) {
              write(kd, o, 0, -px * 5, 0, -dz / l, 0, dx / l, dx, 0, dz, cx, y, cz);
              kd[o + 16] = c.bright * taper * (0.3 + 0.9 * flare + 0.4 * ripple);
            }
            lx = P.x; ly = P.y; lz = P.z;
          }
        }
        rays.instanceVersion++;
        if (skirts) skirts.instanceVersion++;
      });
      if (lite) return;
      // Shooting stars: up to three at once, each a streak across the sky beyond the course for under a second.
      const MAX = 3, stars = batch(streak(), MAX), sd = stars.instanceData;
      const hx = new Float32Array(MAX), hy = new Float32Array(MAX), hz = new Float32Array(MAX), dx = new Float32Array(MAX), dy = new Float32Array(MAX), dz = new Float32Array(MAX), age = new Float32Array(MAX), life = new Float32Array(MAX);
      let live = 0, next = 2;
      stars.instanceCount = 0; stars.visible = false;
      addChild(scenery, stars);
      movers.push((time, dt, camera) => {
        next -= dt;
        if (next <= 0 && live < MAX) {
          const az = route.ahead + (Math.random() - 0.5) * 2.6, el = 0.3 + Math.random() * 0.6, side = Math.random() < 0.5 ? -1 : 1, i = live++;
          hx[i] = camera.position.x + Math.cos(az) * Math.cos(el) * 520; hy[i] = camera.position.y + Math.sin(el) * 520; hz[i] = camera.position.z + Math.sin(az) * Math.cos(el) * 520;
          const ex = -Math.sin(az) * side, ez = Math.cos(az) * side, l = Math.hypot(ex, 0.55, ez);
          dx[i] = ex / l; dy[i] = -0.55 / l; dz[i] = ez / l; age[i] = 0; life[i] = 0.55 + Math.random() * 0.35;
          next = 2.5 + Math.random() * 4.5;
        }
        for (let i = 0; i < live; i++) {
          age[i] += dt;
          if (age[i] < life[i]) continue;
          live--;
          hx[i] = hx[live]; hy[i] = hy[live]; hz[i] = hz[live]; dx[i] = dx[live]; dy[i] = dy[live]; dz[i] = dz[live]; age[i] = age[live]; life[i] = life[live];
          i--;
        }
        for (let i = 0; i < live; i++) {
          const x = hx[i] + dx[i] * 300 * age[i], y = hy[i] + dy[i] * 300 * age[i], z = hz[i] + dz[i] * 300 * age[i];
          const len = 80 * Math.min(1, age[i] / 0.12, (life[i] - age[i]) / 0.15);
          // Across the streak, square to the line of sight.
          const vx = camera.position.x - x, vy = camera.position.y - y, vz = camera.position.z - z;
          let wx = dy[i] * vz - dz[i] * vy, wy = dz[i] * vx - dx[i] * vz, wz = dx[i] * vy - dy[i] * vx;
          const wl = Math.hypot(wx, wy, wz) || 1;
          wx /= wl; wy /= wl; wz /= wl;
          write(sd, i * 20, -dx[i] * len, -dy[i] * len, -dz[i] * len, dy[i] * wz - dz[i] * wy, dz[i] * wx - dx[i] * wz, dx[i] * wy - dy[i] * wx, wx * 1.8, wy * 1.8, wz * 1.8, x, y, z);
        }
        stars.instanceCount = live; stars.visible = live > 0;
        stars.instanceVersion++;
      });
    };

    const storm = (level, course, rand) => {
      // Lighthouse isles: storm-dark isles well out to either side of the course at about its height, each with a
      // lighthouse sweeping two beams round, landmarks far off rather than anywhere to land. A keeper's hut and bushes
      // stand on the rest of each isle's spots. The haze takes them as it takes everything; past its start a
      // lighthouse is only its light, diffused: a soft glow over the lamp that comes up as the haze takes the tower,
      // swells as a beam sweeps toward the eye and dies away by `GONE` metres off.
      const ISLES = 8, ACROSS = [90, 35], TOWER = 0.75, BEAM = [55, 8], TURN = 0.8, GONE = 420, AHEAD = 3, [near, far] = level.sky.fog;
      for (let k = 0; k < ISLES; k++) {
        const t = (k + 0.5) / ISLES, side = k % 2 ? 1 : -1, v = (k * 3 + 1) % 4, shape = isle(8 + v), s = 1.3 + rand() * 0.4;
        const p = place(course, t, side * (ACROSS[0] + rand() * ACROSS[1]), shape.radius * s);
        if (!p) continue;
        const y = routeY(t) - 4 + rand() * 10, spin = rand() * TAU, base = standIsle(shape, p.x, y, p.z, s, spin), [spot, ...rest] = shape.spots;
        const tower = node(lighthouse(), spot.x, spot.y, spot.z, TOWER, base);
        const turn = node(null, 0, LAMP_Y, 0, 1, tower), phase = rand() * TAU;
        for (const yaw of [0, Math.PI]) {
          const shine = node(beam(), 0, 0, 0, 1, turn);
          shine.rotation.y = yaw; shine.scale.x = BEAM[0]; shine.scale.y = shine.scale.z = BEAM[1];
        }
        rest.forEach((stand, n) => {
          node(n ? BL.hubModels.bush((k + n) % 3) : hut(), stand.x, stand.y, stand.z, n ? 0.5 : 0.8, base).rotation.y = rand() * TAU;
        });
        reached(p.x, y, p.z, BEAM[0] * TOWER * s);
        const c = Math.cos(spin), n = Math.sin(spin), hx = p.x + (spot.x * c + spot.z * n) * s, hz = p.z + (-spot.x * n + spot.z * c) * s;
        const hy = y + (spot.y + LAMP_Y * TOWER) * s, halo = node(hazeLight(), hx, hy, hz);
        movers.push((time, dt, camera) => {
          const yaw = phase + time * TURN, turned = spin + yaw;
          turn.rotation.y = yaw;
          const dx = camera.position.x - hx, dy = camera.position.y - hy, dz = camera.position.z - hz, flat = Math.hypot(dx, dz) || 1;
          const d = Math.hypot(flat, dy), light = smooth(near, far, d) * (1 - smooth(far, GONE, d));
          halo.visible = light > 0;
          if (!halo.visible) return;
          // A beam's axis is the node's +x turned by `turned`; how squarely one points at the eye flares the glow.
          const sweep = Math.abs(Math.cos(turned) * dx - Math.sin(turned) * dz) / flat;
          halo.smokeOpacity = light * (0.12 + 0.5 * sweep ** 12);
          halo.scale.x = halo.scale.y = halo.scale.z = 12 + d * 0.06;
          // Stood a little toward the eye, so the tower never blocks the glow behind it and shows as a silhouette.
          halo.position.x = hx + dx / d * AHEAD * s; halo.position.y = hy + dy / d * AHEAD * s; halo.position.z = hz + dz / d * AHEAD * s;
          halo.rotation.y = Math.atan2(dx, dz); halo.rotation.x = -Math.atan2(dy, flat);
        });
      }
      // Lightning: every 4 to 10 s a strike 60 to 110 m off from the eye, inside the haze's reach and mostly ahead,
      // from the storm just over the eye down past the course (no lower than the sea), one or two bolts with it, and
      // the flash's strobe for the hub.
      const bolts = [node(bolt(0), 0, 0, 0), node(bolt(1), 0, 0, 0)];
      for (const b of bolts) b.visible = false;
      let next = 3, struck = -1;
      movers.push((time, dt, camera) => {
        if (time >= next && dt > 0) {
          next = time + 4 + Math.random() * 6; struck = time;
          const p = camera.position;
          for (let i = 0; i < bolts.length; i++) {
            const b = bolts[i], a = route.ahead + (Math.random() - 0.5) * 1.8, d = 60 + Math.random() * 50;
            const foot = Math.max(seaY, p.y - 110), h = p.y + 45 - foot;
            b.visible = i === 0 || Math.random() < 0.45;
            b.position.x = p.x + Math.cos(a) * d; b.position.y = foot; b.position.z = p.z + Math.sin(a) * d;
            b.scale.x = b.scale.z = h * 0.45; b.scale.y = h; b.rotation.y = Math.random() * TAU;
            if (i === 0) onStrike?.(d);
          }
        }
        flash = struck < 0 ? 0 : flashAt(time - struck);
        if (struck >= 0 && time - struck > 0.25) for (let i = 0; i < bolts.length; i++) bolts[i].visible = false;
      });
      if (lite) return;
      // Rain: streaks fixed in the world and wrapped into a box round the eye, so turning never drags them along,
      // slanted by the wind and falling fast; as many as the quality tier carries. One within NEAR of the eye is left
      // out, or it would cross the view as a bar.
      const N = renderer.quality === "high" ? 360 : renderer.quality === "low" ? 120 : 240, BOX = 44, TALL = 30, NEAR = 3, WIDE = 1.1;
      const drops = batch(BL.weather.rainDrop(), N), d = drops.instanceData, sx = new Float32Array(N), sy = new Float32Array(N), sz = new Float32Array(N);
      for (let i = 0; i < N; i++) { sx[i] = rand() * BOX; sy[i] = rand() * TALL; sz[i] = rand() * BOX; }
      const windX = route.sideX * 0.22, windZ = route.sideZ * 0.22, l = Math.hypot(windX, 1, windZ), len = 1.15;
      addChild(scenery, drops);
      movers.push((time, dt, camera) => {
        const p = camera.position;
        for (let i = 0; i < N; i++) {
          const fall = (sy[i] + time * 26) % TALL, x = p.x - BOX / 2 + ((sx[i] + fall * windX - p.x) % BOX + BOX) % BOX;
          const z = p.z - BOX / 2 + ((sz[i] + fall * windZ - p.z) % BOX + BOX) % BOX, k = (x - p.x) ** 2 + (z - p.z) ** 2 < NEAR * NEAR ? 0 : 1;
          write(d, i * 20, WIDE * k, 0, 0, windX / l * len * k, 1 / l * len * k, windZ / l * len * k, 0, 0, WIDE * k, x, p.y + TALL / 2 - fall, z);
        }
        drops.instanceVersion++;
      });
    };

    // Lays `level`'s scenery round a course from `start` down to `finish` and returns how far it reaches from the
    // start, for the camera's far plane.
    const build = (level, course, start, finish) => {
      clear();
      const kind = level.sky?.scenery;
      if (!kind) return 0;
      const sx = start.x - finish.x, sz = start.z - finish.z, length = Math.hypot(sx, sz), nx = sx / length, nz = sz / length;
      Object.assign(route, { start, finish, length, nx, nz, sideX: -nz, sideZ: nx, ahead: Math.atan2(-nz, -nx) });
      const rand = mulberry32(SEED);
      reach = 0; time = 0;
      if (kind === "islets") isles(level, course, rand);
      else if (kind === "spires") spires(level, course, rand);
      else if (kind === "aurora") aurora(level, course, rand);
      else if (kind === "storm") storm(level, course, rand);
      for (const move of movers) move(0, 0, { position: start });
      scenery.visible = true;
      return reach;
    };
    const update = (dt, camera) => {
      if (!scenery.visible) return;
      time += dt;
      for (let i = 0; i < movers.length; i++) movers[i](time, dt, camera);
    };
    const clear = () => {
      for (let i = scenery.children.length - 1; i >= 0; i--) removeChild(scenery, scenery.children[i]);
      movers.length = 0; scenery.visible = false; flash = 0;
    };
    const dispose = () => { clear(); removeChild(root, scenery); };
    return { build, update, clear, dispose, get flash() { return flash; } };
  };
  BL.cloudHopperSky = { DAY, create, grade, flash: flashSky, bolt };
})();
