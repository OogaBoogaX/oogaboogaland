// The Lightning Jet Hangar's forklift, from its concept: a chunky hangar forklift in the Jet's colours, mustard yellow
// over a black chassis with the bolt in blue panels down its sides, an amber beacon and work lights on its overhead
// guard, red tail lights and hazard chevrons at its back, where a black vented panel and an EXPERIMENTAL BOOST PACKAGE
// plate sit over the bumper, and in its cockpit a steering wheel with the bolt on its hub, a dashboard, and beside it a
// big red button under a clear flip cover, DO NOT PRESS over it and EXPERIMENTAL THRUSTER PACKAGE under it.
//
// Its body is voxels `U` metres across (`body`), so the renderer's block detail gives it the concept's blocky look; what
// is round, fine or moves is built finer, each moving part in its own frame for a node of its own: the four wheels
// (`wheel`, turning about x), the mast's carriage with its backrest and forks (`carriage`, up the mast), the steering
// wheel (`steering`, about its column), the beacon's dome (`beacon`), the button's cover (`cover`, about its hinge) and
// the back's two vented doors (`doors`, each about its outer edge). `PLACES` says where each stands. The decals are
// pictures painted once a page (`pictures`). In the forklift's frame: the forks toward -z, x to the driver's right,
// the origin on the floor midway between its axles, in units the scene builds `SCALE` metres each; `FOOTPRINT` is the
// box round it, in metres.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models } = BL;
  const { cached, box, bevelBox, merge, noShadow, moved, turnedX, turnedY, turnedZ, beam, lathe, torus, along, makeVox, voxelGeometry, turn, shaded } = models;
  const TAU = Math.PI * 2;

  const U = 0.125, SCALE = 1.15;
  const YELLOW = "#f2b01e", YELLOW_B = "#e3a114", BLACK = "#1f2125", BLACK_B = "#2b2e34", BLUE = "#2443a8", BLUE_B = "#2b4dbb", GOLD = "#ffc83a";
  const RUBBER = "#17181b", STEEL = "#a9b1bc", STEEL_DK = "#5d6470", RED = "#e8342a", AMBER = "#ffb02e", LAMP = "#fff1b8", TAIL = "#ff3b2e";
  const FORK = "#4c5159", TIP = "#ffd23e", CHROME = "#d3d9e0", GRIP = "#e8542a";
  // The body's palette, by index.
  const PALETTE = [null, YELLOW, YELLOW_B, BLACK, BLACK_B, BLUE, BLUE_B, TAIL];
  const Y = 1, Y_B = 2, K = 3, K_B = 4, B = 5, B_B = 6, T = 7;
  // Where its parts stand: the axles' z, the wheels' radius, width and how far out their middles are; the hull's half
  // width and its levels (the underbody's top, the cab's floor, the cowl's top, the deck the seat stands on, the
  // counterweight's top);
  // the cowl's front and the dash's back, the cab's back and the counterweight's front and back (the sides and the back
  // on the voxels' grid, so the decals and doors lie on their faces); the mast's uprights, the carriage's face, how far
  // the forks reach and how high the carriage rests off the floor, the back's vented doors (their half width and their
  // foot and head); the guard's posts and roof; the seat, the steering wheel's hub (and its column's tilt), the button,
  // its cover's hinge at its block's far edge, and the beacon.
  const PLACES = {
    front: -0.98, rear: 0.98, frontR: 0.55, rearR: 0.46, frontW: 0.44, rearW: 0.4, frontX: 0.78, rearX: 0.72,
    half: 0.875, under: 0.44, floor: 0.6, cowlTop: 1.12, deck: 1.08, top: 1.6,
    cowl: -1.28, dash: -0.72, cab: 0.08, weight: 0.72, back: 1.5,
    mastX: 0.42, mastZ: -1.5, mastTop: 2.62, face: -1.72, forks: 1.3, lift: 0.08, doorX: 0.62, doorY: [0.64, 1.32],
    postX: 0.74, postFront: -0.9, postRear: 0.8, roof: 2.68,
    seat: [0, 1.08, 0.38], steering: [-0.02, 1.58, -0.64, 0.95], button: [0.44, 1.42, -0.76], hinge: [0.44, 1.42, -0.87], beacon: [0, 2.76, 0.58]
  };
  const P = PLACES;
  // How thick the seat's cushion is, on the deck at the seat's place: its top is where a driver sits.
  const CUSHION = 0.14;
  // The box round it, from its carriage's face to its back and out to its wheels, in metres, which the scene's reach into
  // its cab goes by (walkers meet the circles the scene keeps round its body).
  const FOOTPRINT = { x: (P.frontX + P.frontW / 2 + 0.04) * SCALE, z0: (P.face - 0.1) * SCALE, z1: (P.back + 0.02) * SCALE, top: (P.roof + 0.1) * SCALE };

  // Two tones a colour, by cell, so a broad face reads as built of blocks.
  const tone = (i, j, k, a, b) => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & 2 ? b : a;
  // The bolt, as one outline in -1..1 (u across, v up): the side panels' and the steering wheel's in gold, and the
  // decals'.
  const BOLT = [[0.1, 1], [0.6, 1], [0.25, 0.2], [0.6, 0.2], [-0.25, -1], [-0.02, -0.15], [-0.38, -0.15]];
  // The bolt as a solid `depth` thick, `su` by `sv` its outline, its face toward +z: in its two convex halves (the upper
  // stroke and the lower point), each counter-clockwise, since a prism takes only a convex outline that way round.
  const boltSolid = (su, sv, depth, color, emissive) => merge(...[[6, 5, 2, 1, 0], [5, 4, 3, 2]].map((part) => models.prism(part.map((i) => [BOLT[i][0] * su, BOLT[i][1] * sv]), depth, color, emissive)));
  // How far (x, y, z) lies outside a wheel's arch, cut out of the hull round each wheel with a hand's breadth to spare
  // (below 0 inside it), and Infinity inboard of the arches.
  const archGap = (x, y, z) => {
    if (Math.abs(x) < 0.42) return Infinity;
    return Math.min(Math.hypot(z - P.front, y - P.frontR) - P.frontR - 0.07, Math.hypot(z - P.rear, y - P.rearR) - P.rearR - 0.07);
  };
  // The hull's top over z at |x|: the cowl's, flat up to the dash, where the dashboard stands on it; the cab's floor
  // between the dash and the deck but a fender over each front wheel, the engine's deck, and the counterweight with its
  // top's back edge cut away.
  const topAt = (ax, z) => {
    if (z < P.dash) return P.cowlTop;
    if (z < P.cab) return ax > 0.46 && z < -0.4 ? 0.98 : P.floor;
    if (z < P.weight) return P.deck;
    return Math.min(P.top, P.top - (z - (P.back - 0.25)));
  };
  // The body's cells: a colour index, or nothing. At the back, the vented panel's place is left open for its doors,
  // dark behind them, the tail lights either side of the plate under them (the plate and the bumper's chevrons are
  // pictures); a blue panel down each side, for the bolt; the underbody, a heavy black lip round each wheel arch, the
  // cab's floor, the deck and the counterweight's top edge in black.
  const bodyCell = (i, j, k, x, y, z) => {
    const ax = Math.abs(x), gap = archGap(x, y, z);
    if (y < 0.26 || ax > P.half || z < P.cowl || z > P.back || gap < 0 || y > topAt(ax, z)) return null;
    const back = z > P.back - U, panel = ax < P.doorX && y > P.doorY[0] && y < P.doorY[1];
    if (panel && back) return null;
    if (panel && z > P.back - 2 * U) return K;
    if (back && ax > 0.6 && y > 0.46 && y < 0.64) return T;
    if (y < P.under && !(back && y > 0.26)) return tone(i, j, k, K, K_B);
    if (gap < 1.6 * U) return tone(i, j, k, K, K_B);
    if (ax > P.half - U && z > P.cab + 0.05 && z < P.back - 0.3 && y > 0.6 && y < 1.14) return tone(i, j, k, B, B_B);
    if (z >= P.dash && z < P.cab && y > P.floor - U) return K;
    if (z >= P.cab && z < P.weight && y > P.deck - U) return K;
    if (z >= P.weight && y > topAt(ax, z) - U) return K;
    return tone(i, j, k, Y, Y_B);
  };
  const body = cached(() => {
    const v = makeVox(), i0 = Math.floor(-P.half / U), i1 = Math.ceil(P.half / U), k0 = Math.floor(P.cowl / U), k1 = Math.ceil(P.back / U);
    for (let i = i0; i <= i1; i++) for (let j = 0; j <= Math.ceil(P.top / U); j++) for (let k = k0; k <= k1; k++) {
      const c = bodyCell(i, j, k, (i + 0.5) * U, (j + 0.5) * U, (k + 0.5) * U);
      if (c) v.set(i, j, k, c);
    }
    return voxelGeometry(v, { unit: U, palette: PALETTE, emissive: { [T]: 0.9 } });
  });

  // A wheel about x through its middle: a fat rubber tyre with blocks round its tread, and a yellow hub with its nuts on
  // both faces.
  const wheel = cached(() => {
    const out = {};
    for (const [key, r, w] of [["front", P.frontR, P.frontW], ["rear", P.rearR, P.rearW]]) {
      const h = w / 2, lugs = [];
      const tyre = turnedZ(turn([[r * 0.6, -h], [r * 0.9, -h], [r * 0.98, -h + 0.04], [r * 0.98, h - 0.04], [r * 0.9, h], [r * 0.6, h]], 24, RUBBER), Math.PI / 2);
      const hub = turnedZ(turn([[0, -h - 0.01], [r * 0.5, -h - 0.01], [r * 0.6, -h + 0.03], [r * 0.6, h - 0.03], [r * 0.5, h + 0.01], [0, h + 0.01]], 18, YELLOW), Math.PI / 2);
      const cap = turnedZ(turn([[0, h + 0.012], [r * 0.18, h + 0.012], [r * 0.2, h + 0.04], [0, h + 0.05]], 12, BLACK), Math.PI / 2);
      const capIn = turnedZ(turn([[0, -h - 0.05], [r * 0.2, -h - 0.04], [r * 0.18, -h - 0.012], [0, -h - 0.012]], 12, BLACK), Math.PI / 2);
      // The tread: chunky blocks in two rows, the one half a block round from the other.
      const n = Math.round(TAU * r / 0.15);
      for (let q = 0; q < n; q++) for (const side of [-1, 1]) {
        lugs.push(turnedX(bevelBox({ w: w * 0.46, h: 0.065, d: 0.1, color: RUBBER, bevel: 0.02, offset: { x: side * w * 0.25, y: r * 0.98 + 0.02 } }), (q + (side > 0 ? 0.5 : 0)) / n * TAU));
      }
      for (let q = 0; q < 5; q++) for (const s of [-1, 1]) {
        const a = q / 5 * TAU;
        lugs.push(bevelBox({ w: 0.03, h: 0.04, d: 0.04, color: BLACK_B, bevel: 0.01, offset: { x: s * (h + 0.025), y: Math.cos(a) * r * 0.34, z: Math.sin(a) * r * 0.34 } }));
      }
      out[key] = shaded([tyre, hub, cap, capIn], lugs);
    }
    return out;
  });

  // A round pipe from one point to another, for hoses.
  const pipe = (ax, ay, az, bx, by, bz, r, color) => along(turn([[r, 0], [r, Math.hypot(bx - ax, by - ay, bz - az)]], 8, color), ax, ay, az, bx - ax, by - ay, bz - az);
  // A bolt's head, its cap toward -z, and one on a side, its cap out along x toward side `s`.
  const boltHead = (x, y, z, r = 0.022) => moved(turnedX(turn([[r, 0], [r, 0.014], [r * 0.7, 0.022], [0, 0.022]], 6, STEEL_DK), -Math.PI / 2), x, y, z);
  const sideBolt = (x, y, z, s, r = 0.02) => moved(turnedZ(turn([[r, 0], [r, 0.008], [r * 0.7, 0.012], [0, 0.012]], 6, STEEL_DK), -s * Math.PI / 2), x, y, z);

  // How far either side of the middle the chains run and the forks hang; and each chain's run at rest, in the mast's
  // frame: how far out it runs, its anchor's height on the middle tie, the crosshead's and its sheave's, the line of the
  // sheaves' axles (z) and the chain's radius round them, the carriage's anchor's height, straight under the sheave's
  // front, and how far apart its links lie (`chainLink`).
  const CHAIN_X = 0.15, FORK_X = 0.32;
  // The forks' top as a deck to stand on, in the carriage's frame: how far either side of the middle it reaches over both
  // blades and the gap between, from their tips back to their shanks along z, and its height over the carriage's foot.
  const FORK_DECK = { x: FORK_X + 0.075, tip: -P.forks, heel: -0.07, top: 0.085 };
  const CHAIN = { x: CHAIN_X, anchor: 1.47, head: 2.24, sheave: 2.31, z: P.mastZ + 0.04, r: 0.08, carriage: P.lift + 0.8, pitch: 0.028 * 2.2 };
  // The mast, as massive as its concept's, in two stages. Its outer uprights (`mast`), each a channel open toward the
  // middle, its web outside and a flange before and behind it, banded at its seams with bolts in the bands, capped, and
  // its pivot pin through its foot; tie bars across their feet and, behind the inner stage so it rises clear, their
  // heads and middle, the middle holding the chains' anchors; the lift cylinder's barrel on the foot's tie; and two hoses
  // down its front, clamped, up into the head's tie. Its inner stage (`innerMast`, which the scene raises half as far as
  // the carriage): the inner uprights nested in the outer ones' openings, standing out of them toward the middle, the
  // lift cylinder's chrome rod, long enough to stay in the barrel at full lift, and the yellow crosshead on it, whose two
  // sheaves carry each chain (`CHAIN`) from its anchor up behind and over and down the front to the carriage's.
  const mast = cached(() => {
    const flat = [], round = [], z = P.mastZ, y0 = 0.12, h = P.mastTop - y0;
    for (const s of [-1, 1]) {
      const x = s * P.mastX;
      flat.push(bevelBox({ w: 0.05, h, d: 0.28, color: BLACK, bevel: 0.015, offset: { x: x + s * 0.095, y: y0 + h / 2, z } }));
      for (const dz of [-0.115, 0.115]) flat.push(bevelBox({ w: 0.24, h, d: 0.05, color: BLACK, bevel: 0.015, offset: { x, y: y0 + h / 2, z: z + dz } }));
      for (let q = 1; q < 5; q++) {
        const y = y0 + h * q / 5;
        flat.push(bevelBox({ w: 0.065, h: 0.07, d: 0.295, color: BLACK_B, bevel: 0.012, offset: { x: x + s * 0.095, y, z } }));
        flat.push(bevelBox({ w: 0.25, h: 0.07, d: 0.065, color: BLACK_B, bevel: 0.012, offset: { x, y, z: z - 0.115 } }));
        for (const dz of [-0.08, 0.08]) round.push(sideBolt(x + s * 0.1275, y, z + dz, s));
        round.push(boltHead(x - s * 0.065, y, z - 0.148), boltHead(x + s * 0.065, y, z - 0.148));
      }
      round.push(moved(turnedZ(turn([[0.055, 0], [0.055, 0.012], [0.04, 0.02], [0, 0.02]], 12, STEEL_DK), -s * Math.PI / 2), x + s * 0.12, 0.3, z));
      // The cap over its web and flanges, clear of the inner upright rising past it, two bolts in its face.
      flat.push(bevelBox({ w: 0.16, h: 0.05, d: 0.3, color: BLACK, bevel: 0.012, offset: { x: x + s * 0.05, y: P.mastTop + 0.025, z } }));
      round.push(boltHead(x + s * 0.02, P.mastTop + 0.025, z - 0.152), boltHead(x + s * 0.09, P.mastTop + 0.025, z - 0.152));
    }
    const across = P.mastX * 2 + 0.28, cz = z + 0.04;
    flat.push(bevelBox({ w: across, h: 0.14, d: 0.06, color: BLACK, bevel: 0.015, offset: { y: P.mastTop - 0.07, z: z + 0.18 } }));
    flat.push(bevelBox({ w: across - 0.04, h: 0.16, d: 0.24, color: BLACK, bevel: 0.025, offset: { y: 0.24, z } }));
    for (let q = -2; q <= 2; q++) round.push(boltHead(q * 0.2, 0.24, z - 0.122));
    flat.push(bevelBox({ w: P.mastX * 2, h: 0.1, d: 0.06, color: BLACK_B, bevel: 0.015, offset: { y: 1.36, z: z + 0.17 } }));
    // The lift cylinder's barrel on its clamp at the foot.
    flat.push(bevelBox({ w: 0.28, h: 0.06, d: 0.22, color: BLACK_B, bevel: 0.015, offset: { y: 0.35, z: cz } }));
    round.push(moved(turn([[0.085, 0], [0.085, 1.42], [0.1, 1.44], [0.1, 1.54], [0.06, 1.56], [0, 1.56]], 16, BLACK_B), 0, 0.32, cz));
    for (const s of [-1, 1]) {
      // The chain's anchor on the middle tie; and a hose down the front, with its clamps, up into the head's tie and down
      // back into the cowl at its foot.
      flat.push(bevelBox({ w: 0.07, h: 0.1, d: 0.06, color: BLACK_B, bevel: 0.012, offset: { x: s * CHAIN_X, y: CHAIN.anchor - 0.04, z: z + 0.14 } }));
      const hx = s * 0.07, hz = z - 0.09;
      round.push(pipe(hx, P.mastTop - 0.1, hz, hx, 0.5, hz, 0.018, BLACK), pipe(hx, 0.5, hz, hx, 0.42, P.cowl, 0.018, BLACK));
      for (const y of [0.8, 1.4, 1.95]) flat.push(bevelBox({ w: 0.05, h: 0.03, d: 0.05, color: STEEL_DK, bevel: 0.008, offset: { x: hx, y, z: hz } }));
    }
    return shaded(round, flat);
  });
  const innerMast = cached(() => {
    const flat = [], round = [], z = P.mastZ, cz = CHAIN.z, inner = [0.36, P.mastTop - 0.04];
    for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.12, h: inner[1] - inner[0], d: 0.17, color: BLACK_B, bevel: 0.015, offset: { x: s * (P.mastX - 0.09), y: (inner[0] + inner[1]) / 2, z } }));
    round.push(moved(turn([[0.048, 0], [0.048, CHAIN.head - 0.62], [0, CHAIN.head - 0.62]], 14, CHROME), 0, 0.62, cz));
    flat.push(bevelBox({ w: 0.62, h: 0.1, d: 0.16, color: YELLOW, bevel: 0.02, offset: { y: CHAIN.head, z: cz } }));
    for (const s of [-1, 1]) {
      const x = s * CHAIN_X;
      // The sheave between its two cheeks.
      round.push(moved(turnedZ(turn([[0, -0.03], [0.08, -0.03], [0.064, 0], [0.08, 0.03], [0, 0.03]], 18, STEEL_DK), Math.PI / 2), x, CHAIN.sheave, cz));
      for (const dx of [-0.045, 0.045]) flat.push(bevelBox({ w: 0.018, h: 0.13, d: 0.13, color: BLACK_B, bevel: 0.005, offset: { x: x + dx, y: CHAIN.sheave - 0.01, z: cz } }));
    }
    return shaded(round, flat);
  });
  // One of the chains' links, its long axis along y, in the xy plane (`a`) and a quarter turn from it (`b`), which the
  // scene lays along each chain's run `CHAIN.pitch` apart, the one and then the other.
  const chainLink = cached(() => {
    const ring = (quarter) => {
      const g = turnedX(torus(0.028, 0.0084, STEEL_DK, 0, 10, 6), Math.PI / 2);
      for (let k = 1; k < g.verts.length; k += 3) g.verts[k] *= 1.55;
      return shaded([quarter ? turnedY(g, Math.PI / 2) : g]);
    };
    return { a: ring(false), b: ring(true) };
  });
  // The carriage in its own frame, the floor under its face at the origin (it rests `PLACES.lift` above it): the two fork
  // bars across the mast, the upper with a lip along its top and the notches the forks' locks drop into; a bracket
  // behind each side of them with two rollers against the inner upright; a yellow guard up each end as its concept's,
  // strapped in black and bolted; the backrest's grille between them; the chains' anchors; and the forks.
  const carriage = cached(() => {
    const flat = [], round = [], D = 0.08, W = 1.34;
    flat.push(bevelBox({ w: W, h: 0.14, d: D, color: BLACK, bevel: 0.02, offset: { y: 0.24, z: D / 2 } }));
    flat.push(bevelBox({ w: W, h: 0.16, d: D, color: BLACK, bevel: 0.02, offset: { y: 0.62, z: D / 2 } }));
    flat.push(box({ w: W, h: 0.025, d: D + 0.02, color: BLACK_B, offset: { y: 0.7125, z: D / 2 - 0.01 } }));
    for (let q = -7; q <= 7; q++) if (Math.abs(Math.abs(q) * 0.085 - FORK_X) > 0.1) flat.push(box({ w: 0.022, h: 0.035, d: 0.012, color: STEEL_DK, offset: { x: q * 0.085, y: 0.68, z: -0.006 } }));
    for (const s of [-1, 1]) {
      flat.push(bevelBox({ w: 0.05, h: 0.58, d: 0.18, color: BLACK_B, bevel: 0.012, offset: { x: s * 0.22, y: 0.44, z: D + 0.09 } }));
      for (const y of [0.3, 0.6]) round.push(moved(turnedZ(turn([[0.055, -0.02], [0.055, 0.02], [0.03, 0.03], [0, 0.03]], 12, STEEL_DK), -s * Math.PI / 2), s * 0.255, y, D + 0.12));
      // The chain's anchor on the upper bar, and its pin.
      const az = CHAIN.z - CHAIN.r - P.face;
      flat.push(bevelBox({ w: 0.07, h: 0.1, d: 0.07, color: BLACK_B, bevel: 0.012, offset: { x: s * CHAIN_X, y: 0.77, z: az } }));
      round.push(sideBolt(s * CHAIN_X + s * 0.035, 0.79, az, s, 0.016));
      // The guard up the end, its straps and their bolts.
      const gx = s * 0.6;
      flat.push(bevelBox({ w: 0.2, h: 1.26, d: 0.1, color: YELLOW, bevel: 0.03, offset: { x: gx, y: 0.79, z: -0.01 } }));
      for (const y of [0.36, 0.92, 1.34]) {
        flat.push(bevelBox({ w: 0.214, h: 0.06, d: 0.112, color: BLACK, bevel: 0.012, offset: { x: gx, y, z: -0.01 } }));
        round.push(boltHead(gx - 0.06, y, -0.066, 0.016), boltHead(gx + 0.06, y, -0.066, 0.016));
      }
    }
    // The backrest: its top and middle rails and the bars between the guards.
    for (const y of [1.06, 1.39]) flat.push(bevelBox({ w: 1.0, h: 0.07, d: 0.06, color: BLACK_B, bevel: 0.015, offset: { y, z: 0.01 } }));
    for (let q = 0; q < 8; q++) flat.push(box({ w: 0.035, h: 0.66, d: 0.035, color: BLACK, offset: { x: -0.4375 + q * 0.125, y: 1.06, z: 0.01 } }));
    // Each fork: its blade, thinning toward its tip with the tip's underside chamfered and its heel rounded under the
    // shank, a wedge in the inside of the heel, and its tip lit; the shank up the bars' face, a rating plate on it; the
    // hooks over the upper bar and under the lower, each turned down behind; and the lock's pin on top.
    const T = 0.1, L = P.forks, S = 0.07, FW = 0.15, R = 0.07;
    const bladeTop = (a) => a < 0.8 * L ? T - (T - 0.07) * a / (0.8 * L) : 0.07 - 0.035 * (a - 0.8 * L) / (0.2 * L);
    const heel = [210, 240].map((d) => [R + R * Math.cos(d * Math.PI / 180), R + R * Math.sin(d * Math.PI / 180)]);
    // An outline in (forward, up), stood on its side and given the fork's width across.
    const sideways = (points, w, color, emissive = 0) => turnedY(models.prism(points, w, color, emissive), Math.PI / 2);
    for (const s of [-1, 1]) {
      const x = s * FORK_X;
      flat.push(moved(sideways([[R, 0], [L - 0.04, 0], [L, 0.022], [L, 0.035], [0.8 * L, 0.07], [0, T], [0, R], ...heel], FW, FORK), x, 0, 0));
      flat.push(moved(sideways([[S - 0.002, bladeTop(S) - 0.004], [S + 0.065, bladeTop(S + 0.065) - 0.004], [S - 0.002, bladeTop(S) + 0.065]], FW - 0.01, FORK), x, 0, 0));
      flat.push(moved(sideways([[L - 0.16, -0.004], [L - 0.035, -0.004], [L + 0.006, 0.021], [L + 0.006, 0.039], [L - 0.16, bladeTop(L - 0.16) + 0.004]], FW + 0.008, TIP, 1), x, 0, 0));
      flat.push(bevelBox({ w: FW, h: 0.64, d: S, color: FORK, bevel: 0.015, offset: { x, y: 0.4, z: -S / 2 } }));
      flat.push(box({ w: 0.07, h: 0.045, d: 0.006, color: STEEL_DK, offset: { x, y: 0.55, z: -S - 0.003 } }));
      for (const [y, drop] of [[0.75, -0.04], [0.148, 0.04]]) {
        flat.push(bevelBox({ w: FW, h: 0.05, d: S + D + 0.03, color: FORK, bevel: 0.012, offset: { x, y, z: (D + 0.03 - S) / 2 } }));
        flat.push(bevelBox({ w: FW, h: 0.09, d: 0.028, color: FORK, bevel: 0.01, offset: { x, y: y + drop, z: D + 0.016 } }));
      }
      round.push(moved(turn([[0.022, 0], [0.022, 0.04], [0.034, 0.046], [0.034, 0.066], [0, 0.072]], 10, STEEL_DK), x, 0.775, -0.01));
    }
    return shaded(round, flat);
  });

  // The instrument panel along the dash's top, sloped toward the driver: where its middle stands, its tilt and its
  // depth. `dashAt` says where (u across, v up its face) lies, `out` proud of it, and `onDash` stands a part built facing
  // +z there. On it, [u, v, radius] the gauges, [u, v, half width, half height] the screen, [u, v] the lamp panel and
  // the ignition's lock, and [colour, u] the warning lights along its top. The fork stick stands right of the column on
  // a pedestal from the floor: the pedestal's top, and the stick's grip.
  const DASH = { x: -0.1, y: 1.34, z: P.dash - 0.08, tilt: -0.55, d: 0.06 };
  const dashAt = (u, v, out = 0) => {
    const c = Math.cos(DASH.tilt), s = Math.sin(DASH.tilt), w = DASH.d / 2 + out;
    return [DASH.x + u, DASH.y + v * c - w * s, DASH.z + v * s + w * c];
  };
  const onDash = (geo, u, v, out = 0) => moved(turnedX(geo, DASH.tilt), ...dashAt(u, v, out));
  const GAUGES = [[-0.05, -0.02, 0.07], [-0.22, -0.035, 0.05]], SCREEN = [0.24, -0.01, 0.075, 0.045], LAMP_PANEL = [-0.33, -0.01], IGNITION = [0.1, -0.08];
  const LIGHTS = [["#3dff7a", 0.17], [AMBER, 0.205], ["#ff3b2e", 0.24], ["#3aa8ff", 0.275], [AMBER, 0.31]];
  const STICK = { x: 0.19, y: 1.12, z: -0.62, grip: [0.19, 1.34, -0.57] };
  // The charge dial's needle, for the scene: where its pivot stands proud of the dial, the panel's tilt, and the dial's
  // arc, E at `from` round `sweep` to F (radians on the picture, clockwise as it is painted), and the charge it reads
  // (`level`, 0 to 1) while the forklift runs.
  const CHARGE = { at: dashAt(GAUGES[1][0], GAUGES[1][1], 0.006), tilt: DASH.tilt, r: GAUGES[1][2], from: Math.PI * 1.15, sweep: Math.PI * 0.7, level: 0.86 };
  // The key in the ignition, for the scene: where it stands proud of the lock, the panel's tilt, and how far it turns
  // (radians about the lock, clockwise to the driver below 0) to ON and to START, where the lock's marks stand.
  const KEY = { at: dashAt(IGNITION[0], IGNITION[1], 0.012), tilt: DASH.tilt, on: -1, start: -1.45 };

  // The overhead guard: a post at each corner from the hull up to its roof, the roof's frame and its slats, the work
  // lights' black housings at its front corners and the beacon's base; the bolt in gold on each side's blue panel; the
  // seat on its deck; the cockpit (below); and the button's block.
  const fittings = cached(() => {
    const flat = [], round = [];
    for (const s of [-1, 1]) flat.push(moved(turnedY(boltSolid(0.3, 0.25, 0.04, GOLD, 0.15), s * Math.PI / 2), s * (P.half + 0.018), 0.87, 0.3));
    const post = (x, y0, z) => flat.push(bevelBox({ w: 0.13, h: P.roof - y0, d: 0.13, color: BLACK, bevel: 0.025, offset: { x, y: y0 + (P.roof - y0) / 2, z } }));
    for (const s of [-1, 1]) { post(s * P.postX, 1.0, P.postFront); post(s * P.postX, P.deck, P.postRear); }
    for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.15, h: 0.14, d: P.postRear - P.postFront + 0.16, color: BLACK_B, bevel: 0.025, offset: { x: s * P.postX, y: P.roof, z: (P.postFront + P.postRear) / 2 } }));
    for (const z of [P.postFront, P.postRear]) flat.push(bevelBox({ w: P.postX * 2 + 0.16, h: 0.14, d: 0.14, color: BLACK_B, bevel: 0.025, offset: { y: P.roof, z } }));
    for (let q = 1; q < 6; q++) flat.push(box({ w: P.postX * 2, h: 0.05, d: 0.07, color: BLACK, offset: { y: P.roof + 0.02, z: P.postFront + (P.postRear - P.postFront) * q / 6 } }));
    for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.24, h: 0.18, d: 0.18, color: BLACK, bevel: 0.035, offset: { x: s * (P.postX - 0.04), y: P.roof + 0.15, z: P.postFront - 0.02 } }));
    round.push(moved(turn([[0.11, 0], [0.11, 0.05], [0.09, 0.07], [0, 0.07]], 16, BLACK), P.beacon[0], P.roof + 0.06, P.beacon[2]));
    // The seat: its cushion, its back and a hip guard round its sides.
    const [sx, sy, sz] = P.seat;
    flat.push(bevelBox({ w: 0.56, h: CUSHION, d: 0.52, color: BLACK, bevel: 0.05, offset: { x: sx, y: sy + CUSHION / 2, z: sz } }));
    flat.push(moved(turnedX(bevelBox({ w: 0.56, h: 0.6, d: 0.13, color: BLACK, bevel: 0.05, offset: { y: 0.3 } }), 0.12), sx, sy + 0.12, sz + 0.27));
    for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.06, h: 0.18, d: 0.36, color: BLACK_B, bevel: 0.02, offset: { x: sx + s * 0.31, y: sy + 0.2, z: sz + 0.08 } }));
    // The dashboard: a console standing on the cowl, its sloped face the instrument panel under its brow, a bezel round
    // each gauge, the screen in its frame and the lamp panel's housing (the dials, the screen and the lamps are pictures
    // and `lamps`).
    flat.push(bevelBox({ w: 0.74, h: DASH.y - P.cowlTop, d: 0.2, color: BLACK, bevel: 0.02, offset: { x: DASH.x, y: (DASH.y + P.cowlTop) / 2, z: DASH.z - 0.1 } }));
    flat.push(moved(turnedX(bevelBox({ w: 0.74, h: 0.3, d: DASH.d, color: BLACK_B, bevel: 0.02 }), DASH.tilt), DASH.x, DASH.y, DASH.z));
    flat.push(onDash(bevelBox({ w: 0.78, h: 0.035, d: 0.1, color: BLACK, bevel: 0.012, offset: { z: 0.03 } }), 0, 0.165));
    for (const [u, v, r] of GAUGES) round.push(onDash(turnedX(torus(r + 0.008, 0.012, BLACK, 0, 20, 6), Math.PI / 2), u, v, 0.004));
    const [su, sv, sw, sh] = SCREEN;
    for (const [w, h, du, dv] of [[2 * sw + 0.03, 0.015, 0, sh + 0.0075], [2 * sw + 0.03, 0.015, 0, -sh - 0.0075], [0.015, 2 * sh, sw + 0.0075, 0], [0.015, 2 * sh, -sw - 0.0075, 0]]) {
      flat.push(onDash(box({ w, h, d: 0.012, color: BLACK }), su + du, sv + dv, 0.006));
    }
    flat.push(onDash(bevelBox({ w: 0.08, h: 0.08, d: 0.02, color: BLACK, bevel: 0.008 }), ...LAMP_PANEL, 0.01));
    // The ignition: its lock's face in a chrome bezel, and a mark at OFF, ON and START round it.
    const [iu, iv] = IGNITION;
    round.push(onDash(turnedX(turn([[0, 0], [0.024, 0], [0.024, 0.008], [0.018, 0.012], [0, 0.012]], 16, BLACK_B), Math.PI / 2), iu, iv));
    round.push(onDash(turnedX(torus(0.027, 0.006, CHROME, 0, 20, 6), Math.PI / 2), iu, iv, 0.006));
    for (const a of [0, KEY.on, KEY.start]) flat.push(onDash(turnedZ(box({ w: 0.005, h: 0.012, d: 0.004, color: a ? "#3dff7a" : STEEL }), a), iu - Math.sin(a) * 0.045, iv + Math.cos(a) * 0.045, 0.002));
    // The steering column's shroud along the wheel's axis, up out of the dash to its hub, and its tilt lever.
    const [wx, wy, wz, tilt] = P.steering, ay = Math.cos(tilt), az = Math.sin(tilt), len = 0.44;
    round.push(along(turn([[0, 0], [0.055, 0], [0.055, len - 0.12], [0.045, len - 0.08], [0.038, len - 0.03], [0.03, len]], 14, BLACK), wx, wy - ay * len, wz - az * len, 0, ay, az));
    flat.push(beam(wx - 0.04, wy - ay * 0.2, wz - az * 0.2, wx - 0.13, wy - ay * 0.17, wz - az * 0.2 + 0.03, 0.018, STEEL_DK));
    round.push(moved(turn([[0, -0.02], [0.022, -0.015], [0.022, 0.015], [0, 0.02]], 10, BLACK), wx - 0.13, wy - ay * 0.17, wz - az * 0.2 + 0.03));
    // The fork stick's pedestal, right of the column, up from the floor against the dash, a plate on its top and the
    // rubber boot the stick (`stick`) stands in.
    const { x: kx, y: ky, z: kz } = STICK;
    flat.push(bevelBox({ w: 0.13, h: ky - P.floor, d: 0.14, color: BLACK, bevel: 0.02, offset: { x: kx, y: (ky + P.floor) / 2, z: kz } }));
    flat.push(box({ w: 0.1, h: 0.004, d: 0.1, color: STEEL_DK, offset: { x: kx, y: ky + 0.002, z: kz } }));
    round.push(moved(turn([[0.05, 0], [0.044, 0.014], [0.05, 0.028], [0.042, 0.042], [0.046, 0.056], [0.034, 0.07], [0.02, 0.078], [0, 0.078]], 14, BLACK_B), kx, ky, kz));
    // The cab's floor: a rubber mat ribbed across, and the brake's wide pedal and the throttle's on their arms.
    const mz = (P.dash + P.cab) / 2;
    flat.push(bevelBox({ w: 0.84, h: 0.014, d: P.cab - P.dash - 0.06, color: BLACK_B, bevel: 0.006, offset: { y: P.floor + 0.007, z: mz } }));
    for (let q = 0; q < 8; q++) flat.push(box({ w: 0.78, h: 0.01, d: 0.022, color: BLACK, offset: { y: P.floor + 0.018, z: P.dash + 0.08 + q * 0.08 } }));
    for (const [px, w] of [[-0.24, 0.16], [0, 0.11]]) {
      flat.push(beam(px, P.floor + 0.02, P.dash + 0.02, px, P.floor + 0.12, P.dash + 0.1, 0.03, BLACK));
      flat.push(moved(turnedX(bevelBox({ w, h: 0.024, d: 0.17, color: STEEL_DK, bevel: 0.008 }), 0.75), px, P.floor + 0.14, P.dash + 0.16));
      for (let q = -1; q <= 1; q++) flat.push(moved(turnedX(box({ w: w - 0.03, h: 0.008, d: 0.02, color: BLACK_B, offset: { y: 0.016, z: q * 0.05 } }), 0.75), px, P.floor + 0.14, P.dash + 0.16));
    }
    // A grab handle up the left front post, standing off its back on two brackets.
    const gz = P.postFront + 0.065;
    for (const y of [1.45, 2.05]) flat.push(beam(-P.postX, y, gz, -P.postX, y, gz + 0.075, 0.03, BLACK_B));
    round.push(moved(turn([[0, 0], [0.018, 0], [0.018, 0.68], [0, 0.68]], 10, YELLOW), -P.postX, 1.41, gz + 0.075));
    // The button's block on the cowl right of the dashboard, its top level: a bezel round the button, the cover's hinge
    // knuckles along its far edge, and the housings of the two amber lamps beside it.
    const [bx, by, bz] = P.button, [, hy, hz] = P.hinge;
    flat.push(bevelBox({ w: 0.3, h: by - P.cowlTop, d: 0.26, color: BLACK, bevel: 0.025, offset: { x: bx, y: (by + P.cowlTop) / 2, z: bz } }));
    round.push(moved(torus(0.085, 0.012, BLACK_B, 0, 22, 6), bx, by + 0.006, bz));
    for (const s of [-1, 1]) round.push(moved(turnedZ(turn([[0, -0.035], [0.016, -0.035], [0.016, 0.035], [0, 0.035]], 10, STEEL_DK), Math.PI / 2), bx + s * 0.09, hy + 0.012, hz));
    for (const s of [-1, 1]) flat.push(bevelBox({ w: 0.07, h: 0.07, d: 0.07, color: BLACK_B, bevel: 0.015, offset: { x: bx + s * 0.19, y: by + 0.02, z: bz + 0.06 } }));
    return shaded(round, flat);
  });
  // The lit parts, on one node so they can dim together: the work lights' lenses, the dash's lamp panel and its warning
  // lights, and the button's two amber lamps; the beacon's dome stands apart (`beacon`).
  const lamps = cached(() => {
    const out = [];
    for (const s of [-1, 1]) out.push(bevelBox({ w: 0.18, h: 0.12, d: 0.02, color: LAMP, emissive: 1, bevel: 0.015, offset: { x: s * (P.postX - 0.04), y: P.roof + 0.15, z: P.postFront - 0.115 } }));
    for (const du of [-0.018, 0.018]) for (const dv of [-0.018, 0.018]) out.push(onDash(box({ w: 0.028, h: 0.028, d: 0.006, color: AMBER, emissive: 1 }), LAMP_PANEL[0] + du, LAMP_PANEL[1] + dv, 0.022));
    for (const [color, u] of LIGHTS) out.push(onDash(box({ w: 0.022, h: 0.016, d: 0.006, color, emissive: 1 }), u, 0.1, 0.004));
    const [bx, by, bz] = P.button;
    for (const s of [-1, 1]) out.push(bevelBox({ w: 0.05, h: 0.05, d: 0.02, color: AMBER, emissive: 1, bevel: 0.01, offset: { x: bx + s * 0.19, y: by + 0.02, z: bz + 0.1 } }));
    return noShadow(merge(...out));
  });
  // The beacon's amber dome in its own frame, its foot at the origin, and the bright windows of its reflector either side
  // along x, so it is seen to turn (the scene turns it about y).
  const beacon = cached(() => noShadow(shaded([turn([[0, 0], [0.085, 0], [0.09, 0.05], [0.085, 0.13], [0.06, 0.18], [0, 0.19]], 18, AMBER, 1)],
    [-1, 1].map((s) => bevelBox({ w: 0.012, h: 0.1, d: 0.07, color: LAMP, emissive: 1, bevel: 0.004, offset: { x: s * 0.086, y: 0.085 } })))));
  // The steering wheel in its hub's frame, its rim in the xz plane round the origin facing +y (the column tilts it toward
  // the driver, the node's rotation.x, `PLACES.steering`'s last, so +z is its foot by the driver's knees): a chunky rim of
  // blocks round a round core, a spinner knob on it at ten o'clock, and a square hub on three thick spokes, left, right
  // and down, a raised pad on its face with the bolt on it in gold.
  const steering = cached(() => {
    const R = 0.21, round = [torus(R, 0.028, BLACK_B, 0, 32, 8)], flat = [];
    for (let q = 0; q < 16; q++) flat.push(turnedY(bevelBox({ w: 0.072, h: 0.062, d: 0.064, color: BLACK, bevel: 0.014, offset: { z: R } }), (q + 0.5) / 16 * TAU));
    const kx = -Math.sin(Math.PI / 3) * R, kz = -Math.cos(Math.PI / 3) * R;
    round.push(moved(turn([[0, 0], [0.026, 0], [0.026, 0.012], [0.018, 0.016], [0.018, 0.05], [0.026, 0.058], [0.026, 0.09], [0.016, 0.1], [0, 0.1]], 12, BLACK_B), kx, 0.03, kz));
    for (const s of [-1, 1]) flat.push(bevelBox({ w: R - 0.07, h: 0.032, d: 0.065, color: BLACK, bevel: 0.01, offset: { x: s * (R / 2 + 0.03), y: -0.006 } }));
    flat.push(bevelBox({ w: 0.065, h: 0.032, d: R - 0.07, color: BLACK, bevel: 0.01, offset: { y: -0.006, z: R / 2 + 0.03 } }));
    flat.push(bevelBox({ w: 0.13, h: 0.06, d: 0.13, color: BLACK_B, bevel: 0.02 }));
    flat.push(bevelBox({ w: 0.1, h: 0.014, d: 0.1, color: BLACK, bevel: 0.006, offset: { y: 0.036 } }));
    // The bolt in gold, flat on the pad, upright to the driver.
    const mark = boltSolid(0.04, 0.04, 0.008, GOLD, 0.5);
    flat.push(moved(turnedX(mark, -Math.PI / 2), 0, 0.047, 0));
    return shaded(round, flat);
  });
  // The charge dial's needle in its own frame, its pivot at the origin and its length along +x on the dial's face (+z
  // out of it), and the dark cap over its pivot.
  const needle = cached(() => {
    const r = CHARGE.r;
    return shaded([turnedX(turn([[0, 0], [r * 0.12, 0], [r * 0.12, 0.003], [0, 0.004]], 12, "#3a3f47"), Math.PI / 2)],
      [box({ w: r * 0.74, h: r * 0.09, d: 0.002, color: "#ffffff", emissive: 0.6, offset: { x: r * 0.37 } })]);
  });
  // The fork stick in its own frame, its pivot in the boot at the origin (`STICK`'s foot): the shaft and the red grip,
  // which the scene leans back as the forks rise and forward as they fall.
  const stick = cached(() => {
    const { x, y, z, grip } = STICK, dx = grip[0] - x, dy = grip[1] - y, dz = grip[2] - z, length = Math.hypot(dx, dy, dz);
    return shaded([along(turn([[0.014, 0], [0.014, length], [0, length]], 10, STEEL), 0, 0, 0, dx, dy, dz),
      along(turn([[0, 0], [0.02, 0], [0.032, 0.015], [0.036, 0.05], [0.03, 0.075], [0.016, 0.085], [0, 0.088]], 14, GRIP), dx, dy, dz, dx, dy, dz)]);
  });
  // The key in its own frame, the lock's axis along +z out of the panel: its collar in the lock, the shank, the black
  // head with the bolt in gold on both faces, standing upright at OFF, and a keyring through its foot with a yellow tag
  // on it, the bolt on that too.
  const key = cached(() => {
    const round = [turnedX(turn([[0, 0], [0.012, 0], [0.012, 0.008], [0, 0.008]], 12, STEEL), Math.PI / 2)], flat = [];
    flat.push(box({ w: 0.008, h: 0.014, d: 0.02, color: STEEL, offset: { z: 0.016 } }));
    flat.push(bevelBox({ w: 0.014, h: 0.05, d: 0.042, color: BLACK, bevel: 0.006, offset: { z: 0.046 } }));
    for (const s of [-1, 1]) flat.push(moved(turnedY(boltSolid(0.011, 0.016, 0.003, GOLD, 0.4), s * Math.PI / 2), s * 0.0075, 0.004, 0.046));
    round.push(moved(turnedZ(torus(0.011, 0.0025, CHROME, 0, 14, 5), Math.PI / 2), 0, -0.033, 0.05));
    flat.push(bevelBox({ w: 0.007, h: 0.036, d: 0.026, color: YELLOW, bevel: 0.004, offset: { y: -0.06, z: 0.05 } }));
    for (const s of [-1, 1]) flat.push(moved(turnedY(boltSolid(0.008, 0.012, 0.002, BLACK), s * Math.PI / 2), s * 0.004, -0.06, 0.05));
    return shaded(round, flat);
  });
  // The big red button, a mushroom on its stem, and its clear red cover in its hinge's frame (the hinge along x at the
  // block's far edge, the cover reaching from it toward the driver over the button), which lifts open about x.
  const button = cached(() => shaded([turn([[0.04, -0.02], [0.04, 0.02], [0.075, 0.025], [0.075, 0.05], [0.06, 0.07], [0, 0.075]], 22, RED, 0.5)]));
  const cover = cached(() => {
    const W = 0.26, H = 0.13, D = 0.22, c = "#ff7a6a";
    const g = merge(
      box({ w: W, h: 0.012, d: D, color: c, offset: { y: H, z: D / 2 } }),
      box({ w: 0.012, h: H, d: D, color: c, offset: { x: -W / 2, y: H / 2, z: D / 2 } }),
      box({ w: 0.012, h: H, d: D, color: c, offset: { x: W / 2, y: H / 2, z: D / 2 } }),
      box({ w: W, h: H, d: 0.012, color: c, offset: { y: H / 2, z: D } }),
      box({ w: W, h: H, d: 0.012, color: c, offset: { y: H / 2 } })
    );
    g.glass = 0.35;
    return g;
  });
  // The back's two vented doors, each in its hinge's frame at its outer edge (the left's at -x, opening outward about
  // y), their faces flush with the back: a black panel with slats across it and a bolt head at each corner.
  const doors = cached(() => {
    const W = P.doorX - 0.01, [y0, y1] = P.doorY, out = [];
    for (const s of [-1, 1]) {
      const parts = [bevelBox({ w: W, h: y1 - y0, d: 0.1, color: BLACK, bevel: 0.02, offset: { x: -s * W / 2, y: (y0 + y1) / 2, z: -0.05 } })];
      for (let q = 0; q < 6; q++) parts.push(bevelBox({ w: W - 0.12, h: 0.045, d: 0.03, color: BLACK_B, bevel: 0.01, offset: { x: -s * W / 2, y: y0 + 0.1 + q * 0.1, z: 0.012 } }));
      for (const [dx, dy] of [[0.05, 0.05], [W - 0.05, 0.05], [0.05, y1 - y0 - 0.05], [W - 0.05, y1 - y0 - 0.05]]) parts.push(box({ w: 0.035, h: 0.035, d: 0.02, color: STEEL_DK, offset: { x: -s * dx, y: y0 + dy, z: 0.008 } }));
      out.push(merge(...parts));
    }
    return out;
  });

  // Its shape as walkers meet it, in its own frame and units, as the Jet's columns are (`jetModels.columns`): over a grid
  // `U` across, each column's solid from `bottom` to `top` (`bottom` below 0 where there is none): its voxel body with
  // its back's doors in their recess, its wheels, its mast, its dashboard, button block and seat, and its guard's posts
  // up to the roof; and the roof itself
  // apart (`roof`, its extent either side of the middle, from and to along z, and its underside and top), so walkers
  // pass under it in the cab. The carriage and its forks move, so the scene adds them as they stand.
  const columns = cached(() => {
    const I0 = Math.floor(-1.1 / U), I1 = Math.ceil(1.1 / U), K0 = Math.floor((P.face - 0.2) / U), K1 = Math.ceil((P.back + 0.12) / U);
    const ni = I1 - I0, nk = K1 - K0, bottom = new Float32Array(ni * nk).fill(-1), top = new Float32Array(ni * nk).fill(-1);
    const span = (i, k, y0, y1) => {
      const c = (i - I0) * nk + (k - K0);
      if (bottom[c] < 0 || y0 < bottom[c]) bottom[c] = y0;
      if (y1 > top[c]) top[c] = y1;
    };
    // Every cell whose middle lies in the box [x0, x1] by [z0, z1], from y0 to y1.
    const fill = (x0, x1, z0, z1, y0, y1) => {
      for (let i = I0; i < I1; i++) for (let k = K0; k < K1; k++) {
        const x = (i + 0.5) * U, z = (k + 0.5) * U;
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) span(i, k, y0, y1);
      }
    };
    for (let i = I0; i < I1; i++) for (let k = K0; k < K1; k++) {
      let lo = -1, hi = -1;
      for (let j = 0; j <= Math.ceil(P.top / U); j++) {
        if (!bodyCell(i, j, k, (i + 0.5) * U, (j + 0.5) * U, (k + 0.5) * U)) continue;
        if (lo < 0) lo = j;
        hi = j;
      }
      if (lo >= 0) span(i, k, lo * U, (hi + 1) * U);
    }
    for (const [x, z, r, w] of [[P.frontX, P.front, P.frontR, P.frontW], [P.rearX, P.rear, P.rearR, P.rearW]]) {
      for (const s of [-1, 1]) fill(s * x - w / 2, s * x + w / 2, z - r, z + r, 0, 2 * r);
    }
    fill(-P.mastX - 0.14, P.mastX + 0.14, P.mastZ - 0.15, P.mastZ + 0.21, 0.12, P.mastTop + 0.05);
    fill(-P.doorX, P.doorX, P.back - U, P.back, P.doorY[0], P.doorY[1]);
    fill(DASH.x - 0.37, DASH.x + 0.37, DASH.z - 0.2, DASH.z + 0.03, P.cowlTop, DASH.y + 0.16);
    const [bx, by, bz] = P.button, [sx, sy, sz] = P.seat;
    fill(bx - 0.15, bx + 0.15, bz - 0.13, bz + 0.13, P.cowlTop, by + 0.15);
    fill(sx - 0.28, sx + 0.28, sz - 0.26, sz + 0.26, sy, sy + CUSHION);
    fill(sx - 0.28, sx + 0.28, sz + 0.2, sz + 0.34, sy, sy + 0.72);
    for (const s of [-1, 1]) for (const z of [P.postFront, P.postRear]) fill(s * P.postX - 0.13, s * P.postX + 0.13, z - 0.13, z + 0.13, 1, P.roof + 0.07);
    const roof = { x: P.postX + 0.08, z0: P.postFront - 0.07, z1: P.postRear + 0.07, bottom: P.roof - 0.07, top: P.roof + 0.07 };
    return { U, i0: I0, k0: K0, ni, nk, bottom, top, roof };
  });

  // ---- the decals, pictures painted once a page ----

  const PX = 700, SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const pictures = new Map();
  const bolt = (g, x, y, s, fill) => {
    g.beginPath();
    BOLT.forEach(([u, v], n) => (n ? g.lineTo(x + u * s * 0.5, y - v * s * 0.5) : g.moveTo(x + u * s * 0.5, y - v * s * 0.5)));
    g.closePath(); g.fillStyle = fill; g.fill();
  };
  const write = (g, s, x, y, px, color, max) => {
    g.font = `bold ${px}px ${SANS}`;
    while (g.measureText(s).width > max && px > 6) { px *= 0.94; g.font = `bold ${px}px ${SANS}`; }
    g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(s, x, y);
  };
  const PAINT = {
    // The rear plate: EXPERIMENTAL BOOST PACKAGE on brushed white, a bolt beside it, in a black border.
    boost: (g, W, H) => {
      g.fillStyle = "#e9ecf0"; g.fillRect(0, 0, W, H);
      g.strokeStyle = BLACK; g.lineWidth = H * 0.1; g.strokeRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1);
      write(g, "EXPERIMENTAL", W * 0.42, H * 0.36, H * 0.3, BLACK, W * 0.7);
      write(g, "BOOST PACKAGE", W * 0.42, H * 0.68, H * 0.3, BLACK, W * 0.7);
      bolt(g, W * 0.86, H * 0.5, H * 0.72, BLACK);
    },
    // DO NOT PRESS in white on red, on the cover's front.
    donot: (g, W, H) => {
      g.fillStyle = "#d8261c"; g.fillRect(0, 0, W, H);
      g.strokeStyle = "#ffe0d8"; g.lineWidth = H * 0.08; g.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
      write(g, "DO NOT PRESS", W / 2, H * 0.54, H * 0.56, "#ffffff", W * 0.86);
    },
    // EXPERIMENTAL THRUSTER PACKAGE on the block's front, black on yellow between two bolts.
    thruster: (g, W, H) => {
      g.fillStyle = YELLOW; g.fillRect(0, 0, W, H);
      write(g, "EXPERIMENTAL", W * 0.5, H * 0.34, H * 0.3, BLACK, W * 0.68);
      write(g, "THRUSTER PACKAGE", W * 0.5, H * 0.7, H * 0.3, BLACK, W * 0.68);
      bolt(g, W * 0.08, H * 0.5, H * 0.74, BLACK);
      bolt(g, W * 0.92, H * 0.5, H * 0.74, BLACK);
    },
    // The bumper's hazard chevrons, black and yellow, pointing to its middle.
    chevrons: (g, W, H) => {
      g.fillStyle = YELLOW; g.fillRect(0, 0, W, H);
      g.fillStyle = BLACK;
      for (const side of [-1, 1]) for (let q = 0; q < 6; q++) {
        const x = W / 2 + side * (q * H * 1.1 + H * 0.3);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + side * H * 0.55, 0); g.lineTo(x + side * H * 1.05, H); g.lineTo(x + side * H * 0.5, H); g.closePath(); g.fill();
      }
    },
    // Hazard stripes for the button block's top round the button, and down each side between the wheels (`hazard`).
    hazard: (g, W, H) => PAINT.stripes(g, W, H),
    stripes: (g, W, H) => {
      g.fillStyle = YELLOW; g.fillRect(0, 0, W, H);
      g.fillStyle = BLACK;
      for (let x = -H; x < W + H; x += H * 0.5) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + H * 0.25, H); g.lineTo(x + H * 0.25 + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill(); }
    },
    // The speed dial: its face dark with a steel rim, ticks every unit and a long one every five with its figure, the
    // last quarter red, and an orange needle on its cap.
    gauge: (g, W, H) => {
      const r = W / 2, at = (q) => Math.PI * 0.75 + q / 20 * Math.PI * 1.5;
      g.fillStyle = "#0c0e12"; g.beginPath(); g.arc(r, r, r * 0.96, 0, TAU); g.fill();
      g.strokeStyle = STEEL; g.lineWidth = W * 0.05; g.stroke();
      g.strokeStyle = "#d8261c"; g.lineWidth = W * 0.06; g.beginPath(); g.arc(r, r, r * 0.74, at(15), at(20)); g.stroke();
      g.strokeStyle = "#ffffff";
      for (let q = 0; q <= 20; q++) {
        const a = at(q), long = q % 5 === 0;
        g.lineWidth = W * (long ? 0.03 : 0.014);
        g.beginPath(); g.moveTo(r + Math.cos(a) * r * (long ? 0.6 : 0.68), r + Math.sin(a) * r * (long ? 0.6 : 0.68)); g.lineTo(r + Math.cos(a) * r * 0.8, r + Math.sin(a) * r * 0.8); g.stroke();
        if (long) write(g, String(q), r + Math.cos(a) * r * 0.42, r + Math.sin(a) * r * 0.42, W * 0.12, "#ffffff", W * 0.2);
      }
      g.strokeStyle = AMBER; g.lineWidth = W * 0.045; g.beginPath(); g.moveTo(r, r); g.lineTo(r + Math.cos(at(3)) * r * 0.7, r + Math.sin(at(3)) * r * 0.7); g.stroke();
      g.fillStyle = "#3a3f47"; g.beginPath(); g.arc(r, r, r * 0.12, 0, TAU); g.fill();
    },
    // The charge dial: E to F over a red, amber and green arc (CHARGE's sweep), and the bolt under it; its needle is a
    // part of its own (`needle`).
    charge: (g, W, H) => {
      const r = W / 2, at = (t) => CHARGE.from + t * CHARGE.sweep;
      g.fillStyle = "#0c0e12"; g.beginPath(); g.arc(r, r, r * 0.96, 0, TAU); g.fill();
      g.strokeStyle = STEEL; g.lineWidth = W * 0.05; g.stroke();
      for (const [t0, t1, c] of [[0, 0.2, "#d8261c"], [0.2, 0.45, AMBER], [0.45, 1, "#3dff7a"]]) { g.strokeStyle = c; g.lineWidth = W * 0.1; g.beginPath(); g.arc(r, r, r * 0.68, at(t0), at(t1)); g.stroke(); }
      // E and F just under the arc's ends, clear of the needle resting at either.
      write(g, "E", r + Math.cos(at(0)) * r * 0.5, r + Math.sin(at(0)) * r * 0.5 + W * 0.17, W * 0.16, "#ffffff", W * 0.2);
      write(g, "F", r + Math.cos(at(1)) * r * 0.5, r + Math.sin(at(1)) * r * 0.5 + W * 0.17, W * 0.16, "#ffffff", W * 0.2);
      bolt(g, r, r * 1.45, r * 0.5, AMBER);
    },
    // The dashboard's little screen in blue: the bolt, a battery's bars, the forks' height and READY.
    screen: (g, W, H) => {
      g.fillStyle = "#06122e"; g.fillRect(0, 0, W, H);
      bolt(g, W * 0.16, H * 0.42, H * 0.6, "#5fe3ff");
      g.fillStyle = "#5fe3ff";
      for (let q = 0; q < 4; q++) g.fillRect(W * (0.32 + q * 0.085), H * 0.18, W * 0.06, H * 0.28);
      write(g, "0.0m", W * 0.82, H * 0.32, H * 0.26, "#5fe3ff", W * 0.26);
      write(g, "READY", W * 0.42, H * 0.8, H * 0.22, "#b6f4ff", W * 0.5);
    }
  };
  // A picture `w` by `h` metres facing +z, painted once a page; `round` cuts it to its disc, `lit` how much it glows.
  const picture = (key, w, h, lit = 0.08, round = false) => {
    let geo = pictures.get(key);
    if (geo) return geo;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * PX); canvas.height = Math.round(h * PX);
    PAINT[key](canvas.getContext("2d"), canvas.width, canvas.height);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    geo = { verts: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    geo.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-w / 2, -h / 2, w, h], bright: lit };
    if (round) Object.assign(geo.imageSurface, { cutout: true });
    pictures.set(key, geo);
    return geo;
  };
  // Every decal and where it goes, [geometry, x, y, z, rotation.x, rotation.y], in the forklift's frame, or for DO NOT
  // PRESS on the cover's front in the cover's hinge frame (`cover`, so it lifts with it), and the screen (`screen`).
  const decals = () => {
    const [bx, by, bz] = P.button;
    return {
      body: [
        [picture("boost", 0.62, 0.15), 0, 0.53, P.back + 0.004, 0],
      [picture("chevrons", P.half * 2 - 0.06, 0.17), 0, 0.355, P.back + 0.004, 0],
        [picture("thruster", 0.28, 0.07), bx, by - 0.14, bz + 0.132, 0],
        [picture("stripes", 0.28, 0.24), bx, by + 0.002, bz, -Math.PI / 2],
        ...GAUGES.map(([u, v, r], i) => [picture(i ? "charge" : "gauge", 2 * r, 2 * r, 0.15, true), ...dashAt(u, v, 0.002), DASH.tilt]),
        ...[-1, 1].map((s) => [picture("hazard", 0.66, 0.13), s * (P.half + 0.004), 0.52, 0.02, 0, s * Math.PI / 2])
      ],
      cover: [[picture("donot", 0.24, 0.055, 0.3), 0, 0.065, 0.227, 0]],
      // The dashboard's screen on its own, lit while the forklift runs.
      screen: [picture("screen", 2 * SCREEN[2], 2 * SCREEN[3], 0.5), ...dashAt(SCREEN[0], SCREEN[1], 0.002), DASH.tilt]
    };
  };

  BL.forkliftModels = { U, SCALE, PLACES, CUSHION, FOOTPRINT, body, wheel, mast, carriage, fittings, lamps, beacon, steering, key, KEY, needle, CHARGE, stick, STICK, innerMast, CHAIN, chainLink, FORK_DECK, columns, button, cover, doors, decals };
})();
