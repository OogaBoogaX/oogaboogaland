// Ten tables in two banks, with a central promenade and circulation outside every seat.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const REAR_WALL_Z = 36.5;
  const PORTAL_Z = REAR_WALL_Z - BL.bifrostModels.MIRROR_Z - 0.05;
  const EXIT_Z = PORTAL_Z + BL.bifrostModels.MIRROR_Z;
  const TABLES = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 11 : -11, z: 24 - Math.floor(i / 2) * 12 }));
  // The gaming floor's set dressing (poker-games.js): two roulette and two craps tables, one in each bank's cross aisle
  // either side of the middle row, midway between it and its neighbour (z +-6) on the bank's line, the kinds alternating
  // corner to corner. The aisles at z +-18 stay open, since the row-aisle walk crosses them straight; at z +-6 a 7 m gap
  // between the chairs leaves 2.3 m and more each side of a table. Each roulette wheel and each craps table's far wall
  // faces the promenade; the shooter's end is toward the side aisle.
  const GAMES = Object.freeze([[2, 4, "roulette"], [3, 5, "craps"], [4, 6, "craps"], [5, 7, "roulette"]].map(([a, b, kind]) => {
    const x = TABLES[a].x, inward = x < 0;
    const yaw = (kind === "roulette") === inward ? Math.PI : 0;
    const kit = BL.pokerGames, extra = -kit.STAFF[kind].z + kit.STAFF_DEPTH - kit.FOOT[kind].hz;
    // Centre the felt and the dealer together in the aisle between poker rows.
    return Object.freeze({ kind, x, z: (TABLES[a].z + TABLES[b].z + Math.cos(yaw)*extra) / 2, yaw });
  }));
  // Every figure in the room is drawn at the game's scale 1: an Ooga of the roster's middle height (1.04) stands 1.625 m,
  // its hip (the leg's pivot, the root) 0.455 m up, the shin folding when the thigh swings forward to sit. The tables and
  // chairs are built for that body: the felt at FELT_Y and the padded rail's top at RAIL_TOP, the chair's seat at
  // SEAT_TOP. A seated figure's root stands at `sitY(height)`: SIT_HIP of its height over the seat, where its legs at
  // the sitting pose's -1.35 just clear the cushion back to the seat's front edge, so they overhang it like lower legs.
  const FELT_Y = 0.78, RAIL_TOP = 0.915, SEAT_TOP = 0.47, SIT_HIP = 0.155, DEALER_SCALE = 0.7;
  const sitY = height => SEAT_TOP + SIT_HIP * height;
  // Each table drawn at Ooga scale in plan as well: every radius of the old table (felt 4.38 by 2.8, the rail's inner
  // edge 4.55 by 2.95, inlay 4.02 by 2.44, the pedestal, the cards, chips and board) times TABLE_K. The padded rail's
  // tube (0.22 across) and the overhangs past it stay their own size, an Ooga's forearm: the rail's middle 0.11 m out
  // from its inner edge, the stone top reaching 0.09 m past that middle and the walk block 0.19 m, as they did. TABLE_K is chosen from the seating: nine chairs round the felt at a
  // 1.38 to 1.43 m pitch, shoulder room for an Ooga a metre wide with its arms, and 2.75 m left for the dealer.
  const TABLE_K = 0.45;
  const FELT_A = 4.38 * TABLE_K, FELT_B = 2.8 * TABLE_K, RAIL_A = 4.55 * TABLE_K + 0.11, RAIL_B = 2.95 * TABLE_K + 0.11;
  const TOP_A = RAIL_A + 0.09, TOP_B = RAIL_B + 0.09, WALK_A = RAIL_A + 0.19, WALK_B = RAIL_B + 0.19;
  // The chairs on a ring 0.42 m outside the rail's outer edge, so each chair's front edge stands about 0.15 m from the
  // rail and a seated Ooga is at the table, spread evenly by distance round the ring (not by angle, which crowds the
  // ends) over the arc the old layout gave them, the 1.1 radians left over the dealer's. The cards, chips and dealer
  // button are laid from `PLACES`: the old layout's 6 by 4.2 ring times TABLE_K, at each chair's own angle.
  const SEAT_A = RAIL_A + 0.11 + 0.42, SEAT_B = RAIL_B + 0.11 + 0.42, SEAT_SPAN = Math.PI * 2 - 1.1;
  const seatAngles = (() => {
    const N = 2048, a0 = -Math.PI / 2 + 0.55, cum = new Float64Array(N + 1), out = [];
    for (let i = 1; i <= N; i++) { const t0 = a0 + SEAT_SPAN * (i - 1) / N, t1 = a0 + SEAT_SPAN * i / N; cum[i] = cum[i - 1] + Math.hypot(SEAT_A * (Math.cos(t1) - Math.cos(t0)), SEAT_B * (Math.sin(t1) - Math.sin(t0))); }
    for (let j = 0, i = 0; j < 9; j++) {
      const want = cum[N] * j / 8;
      while (i < N - 1 && cum[i + 1] < want) i++;
      out.push(a0 + SEAT_SPAN * (i + (want - cum[i]) / (cum[i + 1] - cum[i])) / N);
    }
    return out;
  })();
  const SEATS = seatAngles.map(a => {
    const x = Math.cos(a) * SEAT_A, z = Math.sin(a) * SEAT_B;
    const yaw=Math.atan2(-x,-z);
    // Seat centres anchor furniture and presence; hips sit forward so shins clear the piping.
    return { x, z, yaw, hipX:x+.17*Math.sin(yaw), hipZ:z+.17*Math.cos(yaw) };
  });
  // Enclose the full chair ring and rail before testing the swept body against either.
  const CHAIR_RADIUS = 0.53;
  const TABLE_HX = Math.max(WALK_A, SEAT_A + CHAIR_RADIUS), TABLE_HZ = Math.max(WALK_B, SEAT_B + CHAIR_RADIUS);
  const SIGN_X=3.15, SIGN_Z=-1.52, SIGN_YAW=-.76;
  const PLACES = Object.freeze(seatAngles.map(a => Object.freeze({ x: Math.cos(a) * 6 * TABLE_K, z: Math.sin(a) * 4.2 * TABLE_K })));
  // The dealer stands 0.43 m behind the rail's outer edge on the gap the chairs leave.
  const DEALER_Z = -(RAIL_B + 0.11 + 0.43);
  // The dealt card runs from DEAL_FROM toward the table's far side over DEAL_RUN (the old 2.4 and 2.1 m, times TABLE_K).
  const DEAL_FROM = -2.4 * TABLE_K, DEAL_RUN = 2.1 * TABLE_K;
  const box = (w, h, d, color, x = 0, y = 0, z = 0) => M.bevelBox({ w, h, d, color, offset: { x, y, z } });
  const disk = (radius, bottom, top, color, segments = 48) => M.lathe({ segments, profile: [[0, bottom], [radius, bottom], [radius, top], [0, top]], color });
  const node = (geo, x = 0, y = 0, z = 0) => S.createNode({ geometry: geo, position: { x, y, z } });
  // A card, chip or button laid on the felt: at TABLE_K of its size every way, as the table is in plan.
  const onFelt = (geo, x = 0, y = 0, z = 0) => { const n = node(geo, x, y, z); n.scale.x = n.scale.y = n.scale.z = TABLE_K; return n; };
  // Banana Club is a white marble hall built from the marble kit, in the colours of its one preset (poker-themes.js).
  const K = BL.pokerMarble, GOLD = K.GOLD, T = BL.pokerThemes.club;
  // Banana Club's fittings, each drawn inside its FURNITURE box: one-offs bake into the shell, and pieces repeated
  // about the room are one geometry each, placed as nodes in `build`. Small plain boxes keep the Canvas 2D sort's
  // faces small; the bottles' glow carries the dim room. Canvas 2D sorts and paints every face on the CPU, so there
  // `lite` (set by the scene from the renderer, before it builds) draws the same fittings with fewer faces.
  let lite = false;
  // Dark walnut stays for the back bar and the sofa frames, oxblood leather for the sofas and the table rails, a nero
  // marble for the bar top; the high-roller inlay is the floor's orange.
  const WOOD = "#3b2519", OXBLOOD = "#5c1a22", ROPE = "#7a1622", NERO = "#2e2a26";
  const flat = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  // A veined marble block at (x, y, z): a moved copy of the kit's cached slab, so a seed is built once however often it is placed.
  const marble = (w, h, d, seed, veins, x, y, z, color = K.WHITE) => M.moved(M.merge(K.slab({ w, h, d, seed, veins, color })), x, y, z);
  // A cord slung along z between two posts, with overlapping links so bends stay closed.
  const cord = (x, za, zb, y, sag, r, color) => {
    const links = [];
    for (let k = 0, n = lite ? 4 : 10; k < n; k++) {
      const z0 = za + (zb - za) * k / n, z1 = za + (zb - za) * (k + 1) / n, y0 = y - Math.sin(k / n * Math.PI) * sag, y1 = y - Math.sin((k + 1) / n * Math.PI) * sag;
      const dy = y1 - y0, dz = z1 - z0, overlap = r / (2 * Math.hypot(dy, dz));
      const ey = dy * overlap, ez = dz * overlap;
      links.push(M.beam(x, y0 - ey, z0 - ez, x, y1 + ey, z1 + ez, r * 2, color));
    }
    return links;
  };
  const clubFurniture = (parts, bars) => {
    // The floor and its gold lines are `poker-floor.js`'s.
    const block = lite ? flat : box;
    for (const f of FURNITURE) {
      if (f.kind === "bar") {
        bars.push(...BL.pokerTerrace.bar(f.x, f.z, lite, true));
      } else if (f.kind === "cage") {
        // The cashier's booth: a marble counter facing the room under a brass grille with a teller's gap, marble sides and
        // a cream canopy. The valance stays oxblood, so the lit CASHIER sign in front of it reads against dark.
        const x0 = f.x - f.hx, x1 = f.x + f.hx, z0 = f.z - f.hz, z1 = f.z + f.hz;
        for (const z of [f.z - 1.2, f.z + 1.2]) parts.push(marble(0.5, 0.91, 2.4, z < f.z ? 70 : 71, 4, x0 + 0.3, 0.455, z), flat(0.56, 0.04, 2.4, K.BRASS, x0 + 0.3, 0.93, z),
          flat(0.05, 0.05, 2.4, K.BRASS, x0 + 0.3, 2.6, z), block(0.1, 3.4, 2.4, K.WHITE, x1 - 0.05, 1.7, z));
        for (let n = 1; n < 25; n += lite ? 2 : 1) { const z = z0 + n * 0.2; if (Math.abs(z - f.z) > 0.45) parts.push(flat(0.03, 1.65, 0.03, K.BRASS, x0 + 0.3, 1.775, z)); }
        for (const z of [z0 + 0.05, z1 - 0.05]) parts.push(block(1.9, 2.6, 0.1, K.WHITE, f.x, 1.3, z));
        // The back's face to the glass: a gold coping along its top and a darker marble foot.
        parts.push(flat(0.16, 0.05, 4.84, GOLD, x1 - 0.05, 3.425, f.z), flat(0.12, 0.12, 4.82, K.SHADE, x1 - 0.03, 0.06, f.z));
        for (const z of [f.z - 1.25, f.z + 1.25]) parts.push(block(1.9, 0.15, 2.5, K.CREAM, f.x + 0.05, 2.675, z), block(0.06, 0.8, 2.5, OXBLOOD, x0 + 0.13, 3, z),
          flat(0.04, 0.04, 2.5, K.BRASS, x0 + 0.09, 3.38, z), flat(0.04, 0.04, 2.5, K.BRASS, x0 + 0.09, 2.62, z));
      } else if (f.kind === "highRoller") {
        // The high-roller table's own inlay of Bitcoin-orange marble in 2 m squares, edged in gold (no red on the floor).
        for (let x = f.x - f.hx + 1; x < f.x + f.hx; x += 2) for (let z = f.z - f.hz + 1; z < f.z + f.hz; z += 2) parts.push(flat(2, 0.012, 2, BL.pokerFloor.ORANGE, x, 0.001, z));
        for (let x = f.x - f.hx + 1; x < f.x + f.hx; x += 2) for (const z of [f.z - f.hz + 0.08, f.z + f.hz - 0.08]) parts.push(flat(2, 0.012, 0.1, GOLD, x, 0.008, z));
        for (let z = f.z - f.hz + 1; z < f.z + f.hz; z += 2) for (const x of [f.x - f.hx + 0.08, f.x + f.hx - 0.08]) parts.push(flat(0.1, 0.012, 2, GOLD, x, 0.008, z));
      }
    }
    // Deep red ropes between the outer pairs of posts leave the middle gap open.
    const posts = FURNITURE.filter(f => f.kind === "ropePost");
    for (let i = 0; i < posts.length; i += 2) parts.push(...cord(posts[i].x, posts[i].z, posts[i + 1].z, 0.77, 0.2, 0.025, ROPE));
  };
  // The repeated pieces, each built about its own origin to stand at its box's centre; the sofa's back is at +x.
  // The bar stool's felt top at 0.62, a little under an Ooga's hip, below the 0.95 counter.
  const stool = (leather = OXBLOOD) => M.merge(M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0], [0.19, 0], [0.19, 0.03], [0.05, 0.06], [0.035, 0.08], [0.035, 0.5], [0.14, 0.52], [0, 0.52]], color: GOLD }),
    M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0.52], [0.2, 0.52], [0.2, 0.59], [0.17, 0.62], [0, 0.62]], color: leather }));
  // Oxblood leather on a walnut frame. The lounges' seats are built round where a resident's hip sits (sofa x 0.12,
  // armchair x 0): the cushion at 0.40 runs 0.27 m in front of the hip and the back cushion's face stands where the
  // Ooga's back is, so a resident sits on the cushion against the back with the legs over the front edge.
  const sofa = () => M.merge(box(0.72, 0.24, 3.9, WOOD, 0.19, 0.2), box(0.16, 0.6, 3.9, OXBLOOD, 0.48, 0.55),
    ...[-1, 1].flatMap(sz => [-1, 1].map(sx => flat(0.08, 0.08, 0.08, GOLD, 0.19 + sx * 0.32, 0.04, sz * 1.85))),
    ...[-1.17, 0, 1.17].flatMap(z => [box(0.46, 0.08, 1.14, OXBLOOD, 0.08, 0.36, z), box(0.12, 0.4, 1.14, OXBLOOD, 0.36, 0.6, z)]),
    ...[-1, 1].flatMap(s => [box(0.74, 0.26, 0.2, OXBLOOD, 0.19, 0.45, s * 1.87), flat(0.74, 0.03, 0.2, GOLD, 0.19, 0.595, s * 1.87)]));
  // A lounge armchair to sit the sofa's company, in the same oxblood leather on walnut with gold feet and arm caps,
  // built like the sofa about its own origin with its back at +x: seat 0.40, arms 0.56, back 0.85.
  const armchair = () => M.merge(box(0.62, 0.22, 0.86, WOOD, 0.04, 0.19), box(0.45, 0.1, 0.63, OXBLOOD, -0.045, 0.35, 0),
    box(0.18, 0.6, 0.86, OXBLOOD, 0.26, 0.55, 0),
    ...[-1, 1].flatMap(s => [box(0.62, 0.22, 0.11, OXBLOOD, 0.04, 0.42, s * 0.375), flat(0.62, 0.03, 0.11, GOLD, 0.04, 0.545, s * 0.375)]),
    ...[-1, 1].flatMap(sz => [-1, 1].map(sx => flat(0.07, 0.09, 0.07, GOLD, 0.04 + sx * 0.27, 0.045, sz * 0.375))));
  // The low table's marble top at 0.38, its lamps in proportion.
  const lowTable = () => M.merge(marble(0.95, 0.06, 1.75, 80, 2, 0, 0.35, 0), flat(0.97, 0.025, 1.77, GOLD, 0, 0.315),
    ...[-1, 1].flatMap(sz => [-1, 1].map(sx => flat(0.05, 0.3, 0.05, GOLD, sx * 0.4, 0.15, sz * 0.8))), flat(0.08, 0.1, 0.08, "#ffd28a", 0, 0.43, 0, 0.8),
    // A table lamp at each end: a gold foot and stem under a glowing silk shade, so the lounge reads warm against the night.
    ...[-1, 1].flatMap(sz => [flat(0.16, 0.04, 0.16, GOLD, 0, 0.4, sz * 0.6), flat(0.035, 0.36, 0.035, GOLD, 0, 0.6, sz * 0.6),
      flat(0.3, 0.22, 0.3, "#ffd9a0", 0, 0.89, sz * 0.6, 0.95), flat(0.32, 0.02, 0.32, GOLD, 0, 1.01, sz * 0.6)]));
  // A high-top cocktail table for the crowd to stand at with a drink: a small round marble top at 0.95 (the bar
  // counter's height, at an Ooga's chest) with a gold rim, on a gold stem and foot.
  const highTop = () => M.merge(M.lathe({ segments: lite ? 6 : 16, profile: [[0, 0], [0.24, 0], [0.24, 0.025], [0.07, 0.05], [0.035, 0.08], [0.035, 0.88], [0.09, 0.9], [0, 0.9]], color: GOLD }),
    M.lathe({ segments: lite ? 8 : 24, profile: [[0, 0.9], [0.34, 0.9], [0.345, 0.925], [0.34, 0.95], [0, 0.95]], color: K.WHITE }),
    M.lathe({ segments: lite ? 8 : 24, profile: [[0.34, 0.925], [0.352, 0.925], [0.352, 0.952], [0.34, 0.952]], color: GOLD }));
  const ropePost = () => M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0], [0.17, 0], [0.17, 0.035], [0.06, 0.075], [0.035, 0.1], [0.035, 0.79], [0.06, 0.81], [0.075, 0.855], [0.05, 0.895], [0, 0.9]], color: K.BRASS });
  // The dressing kit's palm is a 4 m tree; a potted one grows hub leaf cards from a lathe pot, its crown pulled in to the box.
  const palm = () => {
    const H = BL.hubModels, rand = BL.math.mulberry32(41);
    const pot = M.merge(M.lathe({ segments: lite ? 6 : 12, profile: [[0, 0], [0.2, 0], [0.27, 0.5], [0.3, 0.55], [0.26, 0.55], [0, 0.52]], color: "#2b211b" }),
      M.lathe({ segments: lite ? 6 : 12, profile: [[0.27, 0.47], [0.305, 0.5], [0.305, 0.56], [0.27, 0.56]], color: GOLD }));
    const geo = H.withJungle(pot, g => {
      H.liana(g, [[0, 0.5, 0], [0.02, 1, 0.01], [0, 1.45, 0]], 0.045, 0.03, "#6b4a2b");
      for (const [y, count, size] of lite ? [[0.85, 4, 0.55], [1.35, 4, 0.6]] : [[0.75, 5, 0.5], [1.1, 5, 0.55], [1.45, 6, 0.6]]) H.sprig(g, 0, y, 0, 0, 1, 0, count, size, rand);
    });
    let reach = 0;
    for (let i = 0; i < geo.verts.length; i += 3) if (geo.verts[i + 1] > 0.6) reach = Math.max(reach, Math.hypot(geo.verts[i], geo.verts[i + 2]));
    const k = Math.min(1, 0.33 / reach);
    for (let i = 0; i < geo.verts.length; i += 3) if (geo.verts[i + 1] > 0.6) { geo.verts[i] *= k; geo.verts[i + 2] *= k; }
    return geo;
  };
  // A tiered brass frame for each of the three chandeliers: three rings joined by four slanted arms each to the one
  // above, the top ring's arms meeting a central stem at y 7.6, the stem from the bottom ring's cross up to the vault.
  const CRYSTAL_RINGS = [[2.1, 6.55, 24, 0.17], [1.45, 5.85, 16, 0.15], [0.8, 5.15, 10, 0.13]];
  // Raise each complete fixture by half the former gap from the crown ring to the ridge.
  const CHANDELIER_LIFT = (BL.pokerVault.hang(0) - (CRYSTAL_RINGS[0][1] + CRYSTAL_RINGS[0][3])) / 2;
  const CHANDELIER_LIGHT_Y = 6.15 + CHANDELIER_LIFT;
  const chandelierFrame = () => {
    const ring = (r, y, h) => M.lathe({ segments: lite ? 16 : 48, profile: [[r + 0.08, y], [r + 0.08, y + h], [r - 0.08, y + h], [r - 0.08, y], [r + 0.08, y]], color: T.accent });
    const parts = CRYSTAL_RINGS.map(([r, y, , h]) => ring(r, y, h));
    // The stem rises to a turned knop, and from it a gold chain (a plain rod on the lite set) to a rose under the vault's ridge.
    const top = BL.pokerVault.hang(0) - CHANDELIER_LIFT;
    parts.push(flat(1.76, 0.04, 0.04, T.accent, 0, 5.13), flat(0.04, 0.04, 1.76, T.accent, 0, 5.13));
    if (lite) parts.push(M.beam(0, 5.11, 0, 0, top - 0.1, 0, 0.07, T.accent), disk(0.3, top - 0.1, top, T.accent, 12));
    else parts.push(M.beam(0, 5.11, 0, 0, 9.2, 0, 0.07, T.accent), M.lathe({ segments: 12, color: T.accent, profile: [[0, 9.05], [0.09, 9.08], [0.13, 9.2], [0.09, 9.32], [0, 9.35]] }),
      ...M.chain(0, 9.35, 0, 0, top - 0.12, 0, 0.09, T.accent), disk(0.32, top - 0.12, top, T.accent, 24));
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), [r0, y0, , h0] = CRYSTAL_RINGS[0];
      for (let t = 1; t < 3; t++) { const [r, y, , h] = CRYSTAL_RINGS[t], [ru, yu] = CRYSTAL_RINGS[t - 1]; parts.push(M.beam(c * r, y + h, s * r, c * ru, yu, s * ru, 0.05, T.accent)); }
      parts.push(M.beam(c * r0, y0 + h0, s * r0, c * 0.035, 7.6, s * 0.035, 0.05, T.accent));
    }
    return M.merge(...parts);
  };
  // A brilliant cut with a flat table, kite-shaped crown and alternating pavilion facets.
  // Cool and spectral faces catch the warm light; a second palette uses the same cuts for a mined block.
  const TINTS = ["#e4ffff", "#c3b8ff"];
  const FACETS = ["#ecffff", "#68bfea", "#91a7ef", "#e9bcf4", "#f9ffff", "#48adc2", "#efe3ff", "#577abc"];
  const crystals = () => {
    const gem = (x, top, z, width, length, color) => {
      const g = M.geometry(), depth = width * 1.40, bottom = top - length, sides = lite ? 6 : 8;
      const layer = (r, h, spin) => Array.from({ length: sides }, (_, i) => {
        const a = i * 2*Math.PI/sides + spin;
        return M.pushVert(g, x+r*Math.cos(a), bottom+h, z+r*Math.sin(a));
      });
      const tip = M.pushVert(g,x,bottom,z), girdle = layer(width*0.55,depth*0.68,0);
      const pavilion = layer(width*0.31,depth*0.34,Math.PI/sides);
      const crown = layer(width*0.55,depth*0.73,0), table = layer(width*0.33,depth,Math.PI/sides);
      const offset = color === TINTS[0] ? 0 : 3;
      const facet = (points,i,glow) => M.face(g,points,BL.math.hexToRgb(FACETS[(i+offset)%FACETS.length]),{emissive:glow});
      for (let i=0;i<sides;i++) {
        const k=(i+1)%sides;
        facet([tip,pavilion[i],pavilion[k]],i+3,0.52);
        facet([pavilion[i],girdle[k],pavilion[k]],i+1,0.62);
        facet([pavilion[i],girdle[i],girdle[k]],i,0.74);
        facet([girdle[i],crown[i],crown[k],girdle[k]],i+2,0.88);
        facet([crown[i],table[i],crown[k]],i+4,0.82);
        facet([table[i],table[k],crown[k]],i+1,0.96);
      }
      facet(table.slice().reverse(),0,0.92);
      return M.merge(g,flat(0.018,length-depth,0.018,GOLD,x,top-(length-depth)/2,z));
    };
    const meshes = CRYSTAL_RINGS.map(([r, y, count]) => {
      const parts = [];
      if (lite) for (let k = 0, n = Math.ceil(count / 2); k < n; k++) { const a = k * Math.PI * 2 / n; parts.push(gem(Math.cos(a) * r, y, Math.sin(a) * r, 0.30, 0.6, TINTS[k & 1])); }
      else for (let k = 0; k < count; k++) {
        const a = k * Math.PI * 2 / count, b = (k + 0.5) * Math.PI * 2 / count, ri = r - 0.12;
        parts.push(gem(Math.cos(a) * r, y, Math.sin(a) * r, 0.30, 0.6, TINTS[k & 1]), gem(Math.cos(b) * ri, y - 0.45, Math.sin(b) * ri, 0.30, 0.6, TINTS[(k + 1) & 1]),
          M.beam(Math.cos(b) * (r - 0.07), y, Math.sin(b) * (r - 0.07), Math.cos(b) * ri, y - 0.45, Math.sin(b) * ri, 0.02, TINTS[1], 0.6));
      }
      return M.merge(...parts);
    });
    meshes.push(lite ? gem(0, 4.2, 0, 0.45, 0.9, TINTS[0]) : M.merge(...Array.from({ length: 6 }, (_, k) => gem(0, 4.2 + (6 - k) * 0.4, 0, 0.26 * 0.4 / 0.6, 0.4, TINTS[k & 1])), gem(0, 4.2, 0, 0.45, 0.9, TINTS[0])));
    for (const g of meshes) g.castShadow = false;
    return meshes;
  };
  const amberCrystals = g => {
    const amber = M.geometry();
    amber.verts = g.verts;
    const orange = [[181,62,11],[246,98,13],[247,147,26],[255,176,58]];
    for (const f of g.faces) amber.faces.push(f.emissive ? { ...f, color: orange[(f.color[0]+f.color[1]) % 4], emissive: f.emissive * 0.91 } : f);
    amber.castShadow = false; amber.fogPierce = 1;
    return amber;
  };
  // Two crossed, tapering ribbons. The beam shader fades from local x=0 to its distant tip.
  const chandelierRay = () => {
    const g=M.geometry(), ink=BL.math.hexToRgb("#ffa23a"), reach=8.4;
    for (let plane=0;plane<2;plane++) {
      const pairs=[];
      for (const [x,w] of [[0,0.012],[0.8,0.046],[4,0.12],[reach,0.19]]) {
        pairs.push([-1,1].map(s=>M.pushVert(g,x,plane?0:s*w,plane?s*w:0)));
      }
      for (let i=1;i<pairs.length;i++) {
        const a=pairs[i-1], b=pairs[i]; M.face(g,[a[0],a[1],b[1],b[0]],ink,{emissive:1});
      }
    }
    g.glass=0.075;g.lightBeam=reach;g.castShadow=false;g.twoSided=true;
    return g;
  };
  // Banana Club's ornate table. Each part is built in the unit space its table node scales (top TOP_A by TOP_B, felt FELT_A by
  // FELT_B, pinstripe 4.02 by 2.44 times TABLE_K; the base and the rail built at size).
  // A turned marble pedestal with gold bands, pulled into an oval under the top; it meets the top at y 0.52. The table
  // stands at an Ooga's height (felt FELT_Y), so the pedestal is drawn shorter in proportion: a lower plinth and a
  // tighter waist, the same bands.
  const pedestal = () => {
    const segments = lite ? 12 : 24, g = M.shaded([
      M.lathe({ segments, color: K.SHADE, profile: [[0, 0], [1.5, 0], [1.5, 0.07], [1.38, 0.1]] }),
      M.lathe({ segments, color: GOLD, profile: [[1.38, 0.1], [1.41, 0.12], [1.38, 0.14], [1.2, 0.155]] }),
      M.lathe({ segments, color: K.WHITE, profile: [[1.2, 0.155], [0.92, 0.23], [0.76, 0.32], [0.88, 0.41], [1.08, 0.465]] }),
      M.lathe({ segments, color: GOLD, profile: [[1.08, 0.465], [1.14, 0.482], [1.12, 0.498]] }),
      M.lathe({ segments, color: K.WHITE, profile: [[1.12, 0.498], [1.22, 0.505], [1.22, 0.52], [0, 0.52]] })
    ]);
    for (let i = 0; i < g.verts.length; i += 3) { g.verts[i] *= 1.7 * TABLE_K; g.verts[i + 2] *= 1.15 * TABLE_K; }
    return g;
  };
  // A padded oxblood rail round the felt: a tube along an oval of RAIL_A by RAIL_B, 0.22 m across and 0.17 m high, out
  // on the top's edge (TOP_A by TOP_B) and clear of the felt (FELT_A by FELT_B), so the button, cards and chips lie
  // inside it. Built at room size, then divided by the rim node's scale (4.5 by 2.92 times TABLE_K).
  const rail = (color = OXBLOOD) => {
    const A = RAIL_A, B = RAIL_B, SX = 4.5 * TABLE_K, SZ = 2.92 * TABLE_K, segments = lite ? 28 : 56, sides = lite ? 5 : 8, across = 0.11, high = 0.085, y = RAIL_TOP - high;
    const geo = M.merge(), rgb = BL.math.hexToRgb(color), rows = [];
    for (let k = 0; k < segments; k++) {
      const t = k / segments * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), l = Math.hypot(c / A, s / B), nx = c / A / l, nz = s / B / l, row = [];
      for (let j = 0; j < sides; j++) {
        const p = j / sides * Math.PI * 2, out = Math.cos(p) * across;
        row.push(M.pushVert(geo, (A * c + nx * out) / SX, y + Math.sin(p) * high, (B * s + nz * out) / SZ));
      }
      rows.push(row);
    }
    const v = geo.verts, at = (i, k) => v[i * 3 + k];
    for (let k = 0; k < segments; k++) for (let j = 0; j < sides; j++) {
      const a = rows[k][j], b = rows[(k + 1) % segments][j], c = rows[(k + 1) % segments][(j + 1) % sides], d = rows[k][(j + 1) % sides];
      // Wind each quad outward: its normal must point away from the tube's middle at that station.
      const ux = at(b, 0) - at(a, 0), uy = at(b, 1) - at(a, 1), uz = at(b, 2) - at(a, 2), wx = at(d, 0) - at(a, 0), wy = at(d, 1) - at(a, 1), wz = at(d, 2) - at(a, 2);
      const t = k / segments * Math.PI * 2, ox = at(a, 0) - A * Math.cos(t) / SX, oy = at(a, 1) - y, oz = at(a, 2) - B * Math.sin(t) / SZ;
      const dot = (uy * wz - uz * wy) * ox + (uz * wx - ux * wz) * oy + (ux * wy - uy * wx) * oz;
      M.face(geo, dot < 0 ? [a, d, c, b] : [a, b, c, d], rgb);
    }
    geo.smooth = true;
    return geo;
  };
  // A gold inlay ring laid on the felt, a broad band and a fine one inside it.
  const inlay = () => {
    const segments = lite ? 32 : 64;
    const y = FELT_Y + 0.004;
    return M.merge(M.lathe({ segments, profile: [[1, y], [0.985, y]], color: GOLD, emissive: 0.2 }),
      M.lathe({ segments, profile: [[0.958, y], [0.952, y]], color: GOLD, emissive: 0.2 }));
  };
  // The stone top under the felt, its underside bevelled up toward the edge (0.52 in the middle, 0.66 at the rim) so a
  // seated Ooga's feet, reaching just under the rail, pass below it.
  const stoneTop = (color=T.stone[5],innerCap=0) => M.lathe({ segments: 48, profile: [[0, 0.52], [0.88, 0.52], [1, 0.66], [1, FELT_Y - 0.06], [innerCap, FELT_Y - 0.06]], color });
  // A walnut chair with turned legs, an oxblood cushion, a stepped crest and brass finials.
  // Its back stands at -z and the front piping runs 0.27 m forward of the furniture centre.
  const ornateChair = () => {
    const block = lite ? flat : box, segments = lite ? 4 : 6, top = SEAT_TOP;
    const leg = (x, z) => M.moved(M.lathe({ segments, profile: [[0.04, 0], [0.03, 0.18], [0.045, top - 0.11]], color: T.wood }), x, 0, z);
    const finial = x => M.moved(M.lathe({ segments, profile: [[0, 0], [0.045, 0.02], [0.05, 0.055], [0.022, 0.095], [0, 0.12]], color: GOLD, emissive: 0.15 }), x, 0.97, -0.25);
    return M.merge(block(0.75, 0.07, 0.56, T.wood, 0, top - 0.075, -0.01), block(0.68, 0.04, 0.52, OXBLOOD, 0, top - 0.02, 0.01),
      leg(-0.3, 0.22), leg(0.3, 0.22), leg(-0.3, -0.24), leg(0.3, -0.24),
      block(0.07, 0.58, 0.08, T.wood, -0.34, 0.65, -0.25), block(0.07, 0.58, 0.08, T.wood, 0.34, 0.65, -0.25),
      block(0.56, 0.42, 0.06, OXBLOOD, 0, 0.72, -0.21), flat(0.6, 0.04, 0.07, T.wood, 0, 0.5, -0.25),
      block(0.76, 0.06, 0.1, T.wood, 0, 0.94, -0.25), flat(0.44, 0.05, 0.09, T.wood, 0, 0.995, -0.25), flat(0.2, 0.04, 0.08, T.wood, 0, 1.04, -0.25),
      flat(0.4, 0.02, 0.02, GOLD, 0, 0.995, -0.198), finial(-0.34), finial(0.34));
  };
  const cache = BL.models.scopedMap(), scoped = M.track(() => cache.clear());
  const geometry = () => {
    scoped.use();
    const key = lite ? "gatsby-lite" : "gatsby";
    if (cache.has(key)) return cache.get(key);
    const shell = [], bars = [];
    clubFurniture(shell,bars);
    // The marble floor tiles, wall panels and columns are a few cached geometries placed as nodes in `build`; the walls
    // are `poker-glazing.js`'s glass and the roof `poker-vault.js`'s glass vault, both stood in `build`.
    // Each table lamp's cable hangs from the vault's purlin over its row on a slim gold rod at either end.
    const V = BL.pokerVault;
    for (const p of TABLES) for (const dz of [-1.8 * TABLE_K, 1.8 * TABLE_K]) {
      const top = V.lampHang(p.x);
      shell.push(M.beam(p.x, 8.76, p.z + dz, p.x, top + 0.02, p.z + dz, 0.035, T.accent), flat(0.1, 0.05, 0.1, T.accent, p.x, top - 0.02, p.z + dz));
    }
    for (const x of [-5.2, 5.2]) shell.push(M.beam(x, 7.99, -36.24, x, BL.pokerVault.SPRING + 0.02, -36.46, 0.026, T.accent), flat(0.09, 0.03, 0.09, T.accent, x, BL.pokerVault.SPRING - 0.015, -36.46));
    // Twin rods suspend a stepped brass and opal pendant above each felt.
    const shade = M.merge(
      M.lathe({ segments: lite ? 8 : 16, profile: [[0, 3.45], [0.54, 3.45], [0.54, 3.52], [0.43, 3.57], [0.43, 3.67], [0.26, 3.7], [0.23, 3.82], [0, 3.82]], color: GOLD }),
      M.lathe({ segments: lite ? 8 : 16, profile: [[0, 3.31], [0.31, 3.31], [0.45, 3.45]], color: "#ecd5a2", emissive: 0.68 }));
    for (const p of [...TABLES, ...GAMES]) {
      const dz = GAMES.includes(p) ? 0.6 : 1.8 * TABLE_K;
      for (const sign of [-1, 1]) {
        const z = p.z + sign * dz;
        if (GAMES.includes(p)) shell.push(M.beam(p.x, 8.76, z, p.x, V.lampHang(p.x), z, 0.035, T.accent));
        shell.push(M.beam(p.x, 8.8, z, p.x, 3.81, p.z + sign * 0.15, 0.035, GOLD));
      }
    }
    const jacket = M.merge(box(0.92, 0.96, 0.66, "#292f33", 0, 0.49),
      box(0.31, 0.66, 0.08, "#e6e1ce", 0, 0.62, 0.36),
      box(0.1, 0.48, 0.09, "#e6b634", 0, 0.52, 0.42),
      box(0.18, 0.14, 0.1, "#f7d052", 0, 0.84, 0.42));
    const built = {
      shell: K.staticMesh(M.merge(...shell)), bars, shade, chair: ornateChair(), jacket,
      sleeve: box(0.4, 0.78, 0.43, "#292f33", 0, -0.29, 0.025),
      cuff: box(0.41, 0.12, 0.44, "#e6e1ce", 0, -0.73, 0.025),
      base: pedestal(), stone: stoneTop(), rim: rail(), felt: disk(1, FELT_Y - 0.02, FELT_Y, T.felt), pinstripe: inlay(),
      back: BL.pokerCards.geometry(null), chip: disk(0.17, 0, 0.055, "#e2b43c"),
      button: disk(0.16, 0, 0.055, "#ece3c7"),
      vaultSign: BL.pokerIce.sign(lite),
      title: BL.pokerIce.line("GENESIS VAULT", 0.213, "#e0f4ff", lite),
      stool: stool(), tealStool: stool("#28615c"), sofa: sofa(), armchair: armchair(), lowTable: lowTable(), highTop: highTop(),
      // Floor tiles (the floor module's six veined white seeds and two dark ones for the border).
      tiles: BL.pokerFloor.tiles(lite),
      column: K.column({ h: 8.8 }), palm: palm(), post: ropePost(), chandelier: chandelierFrame(), crystals: crystals(), ray: chandelierRay(),
      pinstripeGold: M.lathe({ segments: 64, profile: [[1, FELT_Y + 0.005], [0.993, FELT_Y + 0.005]], color: "#f2cf6e", emissive: 0.45 }),
      cashier: BL.poolModels.carve("CASHIER", { joined:true, cell: 0.12, color: "#ffe1a0", emissive: 1 })
    };
    built.eras = [];
    built.instruments = BL.pokerEraTables.instrumentKit();
    for (const [key, felt, leather] of [
      [0,"#315442","#833639"],[1,"#343933","#574538"],[2,"#173b5d","#29344b"],[3,"#484037","#42342d"],
      [4,"#394b33",OXBLOOD],[5,"#5e3635","#5b3532"],[6,"#23484b","#574537"],
      [7,"#292d39","#201e28"],[8,"#1f5043","#3f4b38"],[9,"#324049","#353038"]
    ]) {
      let art=BL.pokerEraTables.decoration(key,lite,built.chair), sign=BL.pokerEraTables.sign(key);
      if(key===0){
        art=M.merge(art,BL.pokerSatoshi.table(seatAngles,RAIL_A,RAIL_B,lite));
        sign=M.merge(sign,BL.pokerSatoshi.signTrim());
      }
      built.eras[key] = { felt:disk(1,FELT_Y-.02,FELT_Y,felt), rim:leather===OXBLOOD?built.rim:rail(leather),
        art:K.staticMesh(art), sign:K.staticMesh(sign) };
    }
    const founder=built.eras[0];
    founder.felt=BL.pokerSatoshi.felt(founder.felt,lite,FELT_Y,"#315442");
    founder.top=stoneTop("#74452d",lite ? .81 : 0);
    built.satoshiBay=BL.pokerSatoshi.bay(lite);
    built.cashier.geometry.castShadow = false;
    // The evening hall's haze takes nothing off what glows: the crystals, the lanterns' lit glass and the cashier's
    // sign stay crisp down the hall.
    built.amber = built.crystals.map(amberCrystals);
    for (const g of [...built.crystals, built.cashier.geometry, built.shade]) g.fogPierce = 1;
    cache.set(key, built); return built;
  };
  const card = c => BL.pokerCards.geometry(c);
  // The tells' sweat (poker-tells.js): a pale drop on the brow, then a second running down beside it, two meshes shared
  // by every table, built about a seat's bead node with +z toward the table. The node stands at a seated
  // Ooga's brow for the roster's middle height (1.04): 0.895 m over its seated hip and 0.3 m in front of the chair's centre.
  const BEAD_Y = sitY(1.04) + 0.895, BEAD_OUT = 0.3, NOOP = () => {};
  const beadGeometry = M.cached(() => {
    const drop = (x, y) => M.moved(M.lathe({ segments: 6, profile: [[0, 0.075], [0.016, 0.05], [0.03, 0.02], [0.026, 0.004], [0, 0]], color: "#bfe8ff", emissive: 0.35 }), x, y, 0);
    const one = drop(0.09, 0), two = M.merge(drop(0.09, 0), drop(-0.06, -0.07));
    one.castShadow = two.castShadow = false;
    return { one, two };
  });
  // A table's three tell props, made on first use rather than with the room, so a fresh room's node tree is exactly the
  // one it had before them: a bead node a seat, the tossed card pair (the card backs' geometry) and the pushed stack (the
  // chip piles' geometry). At most seats + 2 nodes a table, each made once on a tell's event and reused for the room's
  // life; level 0 and the hides never make one. Once made, placing writes transforms only.
  const tellProps = (t, g) => {
    const geos = beadGeometry();
    const beadAt = j => {
      if (t.beads[j]) return t.beads[j];
      const s = SEATS[j], bead = node(geos.one, s.x + Math.sin(s.yaw) * BEAD_OUT, BEAD_Y, s.z + Math.cos(s.yaw) * BEAD_OUT);
      bead.rotation.y = s.yaw; bead.visible = false; S.addChild(t.root, bead);
      return t.beads[j] = bead;
    };
    const tossNode = () => {
      if (t.toss) return t.toss;
      const toss = S.createNode();
      S.addChild(toss, onFelt(g.back, -0.26 * TABLE_K), onFelt(g.back, 0.26 * TABLE_K, 0.015 * TABLE_K)); toss.visible = false; S.addChild(t.root, toss);
      return t.toss = toss;
    };
    const pushNode = () => {
      if (t.push) return t.push;
      const push = onFelt(g.chip); push.scale.y = 5 * TABLE_K; push.visible = false; S.addChild(t.root, push);
      return t.push = push;
    };
    return {
      beadAt,
      setBeads: (j, level) => {
        if (level > 0) { const b = beadAt(j); b.visible = true; b.geometry = level > 1 ? geos.two : geos.one; }
        else if (t.beads[j]) t.beads[j].visible = false;
      },
      // From seat j's card backs (k 0) to the table's middle (k 1), riding up over the board and shrinking to nothing.
      placeToss: (j, k) => {
        k = k > 0 ? (k < 1 ? k : 1) : 0;
        const toss = tossNode(), from = t.backs[j].position, u = 1 - k;
        toss.position.x = from.x * u; toss.position.y = from.y + 0.04 * k; toss.position.z = from.z * u;
        toss.rotation.y = SEATS[j].yaw + k * 0.8;
        toss.scale.x = toss.scale.y = toss.scale.z = u;
        toss.visible = k < 1;
      },
      hideToss: () => { if (t.toss) t.toss.visible = false; },
      // From seat j's chip pile (k 0) to the table's middle (k 1), riding up over the board.
      placePush: (j, k) => {
        k = k > 0 ? (k < 1 ? k : 1) : 0;
        const push = pushNode(), from = t.chips[j].position, u = 1 - k;
        push.position.x = from.x * u; push.position.y = from.y + 0.04 * k; push.position.z = from.z * u;
        push.visible = true;
      },
      hidePush: () => { if (t.push) t.push.visible = false; }
    };
  };
  // Canvas 2D's lite set never builds the props; its methods do nothing and `beadAt` gives null.
  const LITE_PROPS = Object.freeze({ beadAt: () => null, setBeads: NOOP, placeToss: NOOP, hideToss: NOOP, placePush: NOOP, hidePush: NOOP });
  const build = () => {
    const geo = geometry(), root = S.createNode(), environment = S.createNode(), tables = [];
    const fixtures = S.createNode();
    S.addChild(root, environment, fixtures);
    for (let i = 0; i < 10; i++) {
      const p = TABLES[i], group = S.createNode({ position: { x: p.x, y: 0, z: p.z } });
      const era = geo.eras[i];
      const top = node(era.top || geo.stone); top.scale.x = TOP_A; top.scale.z = TOP_B;
      const rim = node(era.rim); rim.scale.x = 4.5 * TABLE_K; rim.scale.z = 2.92 * TABLE_K;
      const felt = node(era.felt); felt.scale.x = FELT_A; felt.scale.z = FELT_B;
      if(lite && i===0){ top.depthBias=.52; felt.depthBias=.19; }
      const pinstripe = node(i === HIGH_ROLLER ? geo.pinstripeGold : geo.pinstripe); pinstripe.scale.x = 4.02 * TABLE_K; pinstripe.scale.z = 2.44 * TABLE_K;
      const base = node(geo.base);
      S.addChild(group, base, top, rim, felt, pinstripe);
      const chairs = [], chips = [], backs = [];
      for (let j = 0; j < SEATS.length; j++) {
        const s = SEATS[j], pl = PLACES[j], chair = node(geo.chair, s.x, 0, s.z); chair.rotation.y = s.yaw; chairs.push(chair); S.addChild(group, chair);
        const pile = onFelt(geo.chip, pl.x * 0.65, FELT_Y + 0.01, pl.z * 0.59); pile.visible = false; chips.push(pile); S.addChild(group, pile);
        const cards = S.createNode({ position: { x: pl.x * 0.57, y: FELT_Y + 0.02, z: pl.z * 0.57 }, rotation: { x: 0, y: s.yaw, z: 0 } });
        S.addChild(cards, onFelt(geo.back, -0.26 * TABLE_K), onFelt(geo.back, 0.26 * TABLE_K, 0.015 * TABLE_K)); cards.visible = false; backs.push(cards); S.addChild(group, cards);
      }
      // Deal left to right and print upright as seen from the gorilla's side of the table.
      const board = Array.from({ length: 5 }, (_, j) => { const n = onFelt(geo.back, (2 - j) * 0.72 * TABLE_K, FELT_Y + 0.03); n.rotation.y = Math.PI; n.visible = false; S.addChild(group, n); return n; });
      const button = onFelt(geo.button); S.addChild(group, button); button.visible = false;
      const label = node(era.sign,SIGN_X,0,SIGN_Z);
      label.rotation.y = SIGN_YAW;
      S.addChild(base,node(era.art));
      S.addChild(group,label);
      // The dealer, a gorilla at DEALER_SCALE: as tall as a standing Ooga guest, so it reads as staff beside the table, not over it.
      const agent = BL.agent.create({ groundAt: () => 0, x: 0, z: DEALER_Z, managed: true, scale: DEALER_SCALE });
      agent.poseManaged(1, 0, 0, DEALER_Z, 0, 0, false, true);
      S.addChild(agent.parts.torso, node(geo.jacket));
      for (const arm of [agent.parts.armR, agent.parts.armL]) S.addChild(arm, node(geo.sleeve), node(geo.cuff));
      S.addChild(group, agent.root);
      const dealCard = onFelt(geo.back, 0, FELT_Y + 0.12, DEAL_FROM); dealCard.visible = false; S.addChild(group, dealCard);
      S.addChild(root, group);
      const table = { root: group, base, top, rim, felt, pinstripe, chairs, chips, backs, board, button, label, plate:label, agent, dealCard,
        beads: SEATS.map(() => null), toss: null, push: null, actors: new Array(SEATS.length).fill(null), version: -1, pulse: 0 };
      tables.push(Object.assign(table, lite ? LITE_PROPS : tellProps(table, geo)));
    }
    const updateInstruments = BL.pokerEraTables.instruments(tables,geo.instruments);
    const sparkle = [], rays = [];
    // The fountain, statues, patterned marble floor, glass vault and glass walls, built once a room on the set `setLite`
    // chose; the hall animates only while its scene is active.
    const hall = BL.pokerHall.build(lite), statues = BL.pokerStatues.build(lite), floor = BL.pokerFloor.build(lite), vault = BL.pokerVault.build(lite);
    const glazing = BL.pokerGlazing.build(lite);
    const satoshiBay=node(geo.satoshiBay,-BL.pokerGlazing.SIDE_X+.34,0,21.25);
    satoshiBay.glow=1;
    S.addChild(environment, node(geo.shell),satoshiBay);
    for(const section of geo.bars) S.addChild(environment,node(section));
    for (const p of [...TABLES, ...GAMES]) S.addChild(fixtures, node(geo.shade, p.x, 0, p.z));
    S.addChild(environment, floor.root, vault.root, glazing.root);
    // A colonnade of round columns before the glass.
    for (const side of [-1, 1]) for (const z of BL.pokerGlazing.COLUMN_Z) if (side < 0 || z !== 0) S.addChild(environment, node(geo.column, BL.pokerGlazing.columnX(side,z), 0, z));
    for (let f = 0; f < 3; f++) {
      const z = (f - 1) * 24;
      S.addChild(fixtures, node(geo.chandelier, 0, CHANDELIER_LIFT, z));
      for (let ring = 0; ring < 4; ring++) { const n = node(geo.crystals[ring], 0, CHANDELIER_LIFT, z); n.ring = ring; n.fixture = f; n.prism = n.geometry; n.amber = geo.amber[ring]; sparkle.push(n); S.addChild(fixtures, n); }
      for (let k=0;k<(lite?4:7);k++) {
        const a=(k+f*0.27)*2*Math.PI/(lite?4:7);
        const ray=node(geo.ray, 0.62*Math.cos(a),5.6 + CHANDELIER_LIFT,z+0.62*Math.sin(a));
        ray.rotation.y=-a; ray.rotation.z=-0.49-0.12*(k%3); ray.visible=false;
        rays.push(ray); S.addChild(fixtures,ray);
      }
    }
    for (const f of FURNITURE) {
      if (f.kind === "bar") for (let k = 0; k < 5; k++) S.addChild(environment, node(f.x < 0 ? geo.stool : geo.tealStool, f.x - 6 + k * 3, 0, f.z + f.hz + .32));
      else if (f.kind === "sofa") { const n = node(geo.sofa, f.x, 0, f.z); n.rotation.y = f.x < 0 ? Math.PI : 0; S.addChild(environment, n); }
      // Facing its `yaw`: the piece's front looks down -x, so it turns by a quarter more.
      else if (f.kind === "armchair") { const n = node(geo.armchair, f.x, 0, f.z); n.rotation.y = f.yaw + Math.PI / 2; S.addChild(environment, n); }
      else if (f.kind === "lowTable") S.addChild(environment, node(geo.lowTable, f.x, 0, f.z));
      else if (f.kind === "highTop") S.addChild(environment, node(geo.highTop, f.x, 0, f.z));
      else if (f.kind === "palm") S.addChild(environment, node(geo.palm, f.x, 0, f.z));
      else if (f.kind === "ropePost") S.addChild(environment, node(geo.post, f.x, 0, f.z));
      else if (f.kind === "cage") {
        // Turned to face the room from the canopy's front, centred on the booth.
        const sign = node(geo.cashier.geometry, f.x - f.hx + 0.22, 3.25, f.z - (geo.cashier.width - 0.24) / 2);
        sign.rotation.y = -Math.PI / 2; S.addChild(environment, sign);
      }
    }
    S.addChild(environment, hall.root, statues.root);
    // The gaming tables and their staff, on the set this room is built on.
    const games = BL.pokerGames.build(GAMES, { lite, dress: { jacket: geo.jacket, sleeve: geo.sleeve, cuff: geo.cuff }, scale: DEALER_SCALE });
    S.addChild(environment, games.root);
    const signY = 6.4;
    S.addChild(environment, node(geo.vaultSign, 0, signY, -36.18),
      node(geo.title.geometry, 0, signY, -35.85));
    return { root, updateInstruments, tables, fixtures, sparkle, rays, hall, statues, floor, vault, glazing, games };
  };
  // Banana Club's fittings as axis-aligned boxes (centre, half-extents) in room coordinates; the geometry is built from
  // the same table. `solid` ones stop walkers, while the high-roller corner is only a mark round table 9.
  // Beside the tables on the side aisles' side (x 17) and the promenade's (x 5.5), 2.4 m and more clear of the chairs,
  // off the cross aisles, the fountain's ring and the high-roller's ropes.
  const HIGH_TOPS = [...[-17, 17].flatMap(x => [24, 12, 0, -12].map(z => [x, z])), ...[-5.5, 5.5].flatMap(x => [24, 12, -12].map(z => [x, z])), [-5.5, -24]];
  const FURNITURE = Object.freeze([
    BL.pokerBandstand.floor,
    { kind: "bar", x: -10, z: -34.55, hx: 8, hz: 1.65, solid: true }, { kind: "bar", x: 10, z: -34.55, hx: 8, hz: 1.65, solid: true },
    ...Object.keys(BL.pokerEraTables.names).map(key=>({kind:"eraSign",x:TABLES[key].x+SIGN_X,z:TABLES[key].z+SIGN_Z,hx:.78,hz:.75,solid:true})),
    {kind:"founderChair",x:TABLES[0].x-3.08,z:TABLES[0].z-2.76,hx:1.04,hz:.81,solid:true},
    { kind: "cage", x: 22.4, z: 31, hx: 1.0, hz: 2.5, solid: true },
    // Keep the west corner beside the Bitcoin book open. Its party sits at the arrival end of the wall.
    ...[-1, 1].flatMap(side => {
      const z = BL.pokerFloor.loungeZ(side);
      return [
        { kind: "sofa", x: side * 22.6, z, hx: .6, hz: 2, solid: true },
        { kind: "lowTable", x: side * 20.6, z, hx: .5, hz: .9, solid: true },
        { kind: "palm", x: side * 22.3, z: z + side * 2.4, hx: .35, hz: .35, solid: true },
        { kind: "armchair", x: side * 19.05, z: z - .9, hx: .45, hz: .48, yaw: side * Math.PI / 2, solid: true },
        { kind: "armchair", x: side * 19.05, z: z + .9, hx: .45, hz: .48, yaw: side * Math.PI / 2, solid: true },
        { kind: "armchair", x: side * 20.6, z: z - 2.35, hx: .48, hz: .45, yaw: 0, solid: true },
        { kind: "armchair", x: side * 20.6, z: z + 2.35, hx: .48, hz: .45, yaw: Math.PI, solid: true }
      ];
    }),
    ...[-27.1,-25.1,-22.9,-20.9].map(z=>({kind:"ropePost", x:7.08, z, hx:.2,hz:.2,solid:true})),
    ...[-26.1,-21.9].map(z=>({kind:"rope", x:7.08,z,hx:.1,hz:1,solid:true})),
    { kind: "highRoller", x: 11, z: -24, hx: 4, hz: 4, solid: false },
    // High-top cocktail tables for the crowd beside the tables, fifteen down the two banks.
    ...HIGH_TOPS.map(([x, z]) => x === BL.pokerHourglass.X && z === BL.pokerHourglass.Z
      ? { kind: "hourglass", x, z, hx: BL.pokerHourglass.RADIUS, hz: BL.pokerHourglass.RADIUS, solid: true }
      : { kind: "highTop", x, z, hx: 0.3, hz: 0.3, solid: true }),
    // The gaming tables (turned only by half turns, so their boxes keep their own half-extents).
    ...GAMES.map((g, game) => ({ kind: "game", game, x: g.x, z: g.z, hx: BL.pokerGames.FOOT[g.kind].hx, hz: BL.pokerGames.FOOT[g.kind].hz, solid: true })),
    // Each statue from its plinth's back edge to as far as it reaches toward the room, and as wide as it reaches, so no
    // head meets a held piece above the plinth.
    ...BL.pokerStatues.SLOTS.map(s => {
      const P = BL.pokerStatues.PLINTH, hx = (P.w / 2 + P.reach) / 2, out = Math.sign(s.x);
      return { kind: "plinth", x: s.x + out * (P.w / 2 - hx), z: s.z, hx, hz: Math.max(P.w / 2, P.side), solid: true };
    })
  ].map(f => Object.freeze(f)));
  const HIGH_ROLLER = 9;
  const solids = FURNITURE.filter(f => f.solid).concat(GAMES.map(g => {
    const p = BL.pokerGames.STAFF[g.kind], c = Math.cos(g.yaw), s = Math.sin(g.yaw);
    return { x: g.x + c*p.x + s*p.z, z: g.z - s*p.x + c*p.z, hx: .30, hz: BL.pokerGames.STAFF_DEPTH };
  }));
  // Most crowd queries are a single stride. Overlap the 6 m cells by 1 m so a short
  // step across a seam still has every possible blocker in its starting cell's list.
  const CELL = 6, PAD = 1, COLS = 8, ROWS = 12, GRID_X = -24, GRID_Z = -36;
  const solidCells = Array.from({ length: COLS * ROWS }, (_, i) => {
    const x = GRID_X + i % COLS * CELL, z = GRID_Z + Math.floor(i / COLS) * CELL;
    return solids.filter(f => f.x + f.hx >= x - PAD && f.x - f.hx <= x + CELL + PAD &&
      f.z + f.hz >= z - PAD && f.z - f.hz <= z + CELL + PAD);
  });
  // The room is rebuilt per visit but this module lives for the page, so the scene puts lite back off in `leave`.
  const setLite = on => { lite = on; K.setLite(on); };
  const F = BL.pokerFountain;
  // Whether the segment, grown by r, crosses box f: a slab test on t in [0, 1], so a zero-length step tests its point.
  const crosses = (ax, az, bx, bz, r, f) => {
    let lo = 0, hi = 1;
    const dx = bx - ax, dz = bz - az, x0 = f.x - f.hx - r, x1 = f.x + f.hx + r, z0 = f.z - f.hz - r, z1 = f.z + f.hz + r;
    if (dx === 0) { if (ax <= x0 || ax >= x1) return false; } else {
      const p = (x0 - ax) / dx, q = (x1 - ax) / dx;
      lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q));
      if (lo >= hi) return false;
    }
    if (dz === 0) return az > z0 && az < z1;
    const p = (z0 - az) / dz, q = (z1 - az) / dz;
    return Math.max(lo, Math.min(p, q)) < Math.min(hi, Math.max(p, q));
  };
  const walkable = (ax, az, bx, bz, y, height, actor) => {
    const r = actor?.bodyRadius || 0.4;
    // Leave room to reach the glass, but never continue through the wall behind it.
    const rear = Math.abs(bx) < BL.bifrostModels.WINDOW.halfW - r ? REAR_WALL_Z - 0.01 : 35.5 - r;
    if (bx < -23 + r || !BL.pokerTerrace.clear(ax, az, bx, bz, r) || bz < -35.5 + r || bz > rear) return false;
    const vx = bx - ax, vz = bz - az, dd = vx * vx + vz * vz, chairRadius2 = (r + CHAIR_RADIUS) ** 2;
    const rx = WALK_A + r, rz = WALK_B + r, dx = vx / rx, dz = vz / rz, d = dx * dx + dz * dz;
    const left = Math.min(ax, bx) - r - TABLE_HX, right = Math.max(ax, bx) + r + TABLE_HX;
    const near = Math.min(az, bz) - r - TABLE_HZ, far = Math.max(az, bz) + r + TABLE_HZ;
    // A swept ellipse catches a fast step through a table, not just its endpoint.
    for (let i = 0; i < TABLES.length; i++) {
      const t = TABLES[i];
      if (t.x < left || t.x > right || t.z < near || t.z > far) continue;
      const x = (ax - t.x) / rx, z = (az - t.z) / rz;
      const u = d ? Math.max(0, Math.min(1, -(x * dx + z * dz) / d)) : 0;
      if ((x + u * dx) ** 2 + (z + u * dz) ** 2 < 1) return false;
      for (let j = 0; j < SEATS.length; j++) {
        const s = SEATS[j];
        const sx = t.x + s.x, sz = t.z + s.z;
        const k = dd ? Math.max(0, Math.min(1, ((sx - ax) * vx + (sz - az) * vz) / dd)) : 0;
        if ((ax + k * vx - sx) ** 2 + (az + k * vz - sz) ** 2 < chairRadius2) return false;
      }
    }
    let blockers = solids;
    if (Math.abs(vx) + r <= PAD && Math.abs(vz) + r <= PAD) {
      const col = Math.floor((ax - GRID_X) / CELL), row = Math.floor((az - GRID_Z) / CELL);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) blockers = solidCells[row * COLS + col];
    }
    for (let i = 0; i < blockers.length; i++) if (crosses(ax, az, bx, bz, r, blockers[i])) return false;
    // The swept step must clear the Charging Bull’s plinth, including the walker’s own radius.
    const k = dd ? Math.max(0, Math.min(1, ((F.X - ax) * vx + (F.Z - az) * vz) / dd)) : 0;
    return (ax + k * vx - F.X) ** 2 + (az + k * vz - F.Z) ** 2 >= (F.RADIUS + r) ** 2;
  };
  /** Writes into `out` the nearest point, on rings 0.5 m apart out to 4 m in sixteen directions, where a body may stand. */
  const nearestClear = (x, z, actor, out) => {
    out.x = x; out.z = z;
    if (walkable(x, z, x, z, 0, 2, actor)) return out;
    for (let ring = 1; ring <= 8; ring++) {
      const d = ring * 0.5;
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (walkable(px, pz, px, pz, 0, 2, actor)) { out.x = px; out.z = pz; return out; }
      }
    }
    throw new Error(`pokerModels.nearestClear: nothing clear within 4 m of (${x}, ${z})`);
  };
  // The crowd's named places, `{ kind, x, z, yaw, table }` with yaw facing (sin, cos) and `table` -1 off the rails:
  // four rail spots a table, the strolls down the promenade and the side aisles, the door, small conversation groups
  // (`group`, two to four places round a middle, each facing it) in the arrival band, by the fountain and down the
  // promenade, places at the side walls looking out (`glass`, in pairs), the bar stools, places
  // standing at the bar between them, the cage's window, a bouncer's place by each rope, and the lounges' seats
  // (`lounge`, with `seat` "sofa" or "armchair" and `side` -1 or 1), which only their residents sit in. Stools and
  // seats stand inside their furniture, being sat on (a lounge seat where the resident's hip rests on its cushion); a standing spot inside something is moved out (a rail spot along
  // its own line from the table, dropped past 1.5 m). Laid once a page.
  let spotList = null;
  const STAND = { bodyRadius: 0.5 }, STROLL_Z = [30, 18, 6, -6, -18, -30], STROLL_MID = [24, 12, 0, -12, -24];
  const OUT_OF_LOUNGE = { [-30]: -21, [-24]: -15 };
  const GROUPS = [[-14, 31.2, 4], [-6, 30.6, 3], [6, 30.6, 4], [14, 31, 3], [0, 4.9, 3], [0, -4.9, 4], [0, 18, 3], [0, -18, 3]], GROUP_R = 0.85;
  const GLASS_Z = [22, 12.5, 3, -12.5, -23], GLASS_X = 22.1;
  const spots = () => {
    if (spotList) return spotList;
    const list = [], clear = { x: 0, z: 0 };
    const add = (kind, x, z, yaw, table = -1) => list.push(Object.freeze({ kind, x, z, yaw, table }));
    const stand = (kind, x, z, yaw) => { nearestClear(x, z, STAND, clear); add(kind, clear.x, clear.z, yaw); };
    TABLES.forEach((t, i) => {
      // Four lines out from the table's corners (the old layout's, times TABLE_K), a watcher at the first clear place on
      // each and a second ring a step further back behind the first.
      // At Satoshi's table the two rear-left spectators stand between the dealer and the founder's chair.
      const rearLeft = i === 0 ? -1.0 : -3.4;
      for (const [ox, oz] of [[rearLeft, -5.3], [3.4, -5.3], [-3.4, 5.3], [3.4, 5.3]].map(([x, z]) => [x * TABLE_K, z * TABLE_K])) {
        const len = Math.hypot(ox, oz), ux = ox / len, uz = oz / len;
        let from = 0;
        for (let ring = 0; ring < 2; ring++) for (let d = from; d <= from + 1.5; d += 0.25) {
          const x = t.x + ox + ux * d, z = t.z + oz + uz * d;
          if (walkable(x, z, x, z, 0, 2, STAND)) { add("rail", x, z, Math.atan2(-ux, -uz), i); from = d + 1.1; break; }
        }
      }
    });
    // The side aisles' last strolls toward the bar stop short of the lounges (`OUT_OF_LOUNGE`), so nobody stands among
    // the armchairs in front of the women.
    const aisle = (x, z) => {
      // Reserve the west bookcase approach as well as the occupied seating bay.
      if (x < 0 && z > 0) return -(OUT_OF_LOUNGE[-z] ?? -z);
      return x ? OUT_OF_LOUNGE[z] ?? z : z;
    };
    for (const z of STROLL_Z) for (const x of [-20, 0, 20]) stand("stroll", x, aisle(x, z), 0);
    for (const z of STROLL_MID) for (const x of [-20, 0, 20]) if (x || Math.abs(z) > 6) stand("stroll", x, aisle(x, z), 0);
    for (const x of [-3, 3]) stand("door", x, 33, Math.PI);
    // Three guests round each high-top, facing it, as a conversation group.
    for (const [gx, gz] of HIGH_TOPS) for (let k = 0; k < 3; k++) {
      const a = (k + 0.5) * 2 * Math.PI / 3 + gz * 0.1;
      nearestClear(gx + Math.sin(a) * 0.95, gz + Math.cos(a) * 0.95, STAND, clear);
      add("group", clear.x, clear.z, Math.atan2(gx - clear.x, gz - clear.z));
    }
    for (const [gx, gz, n] of GROUPS) for (let k = 0; k < n; k++) {
      const a = (k + 0.5) * 2 * Math.PI / n + gx * 0.1;
      nearestClear(gx + Math.sin(a) * GROUP_R, gz + Math.cos(a) * GROUP_R, STAND, clear);
      add("group", clear.x, clear.z, Math.atan2(gx - clear.x, gz - clear.z));
    }
    for (const side of [-1, 1]) for (const z of GLASS_Z) for (const dz of [-0.6, 0.6]) stand("glass", side * GLASS_X, z + dz, side * Math.PI / 2);
    // The gaming tables' places: guests round each, facing it, and the craps shooter's at its end (`slot` its index in
    // `pokerGames.SPOTS`, `role` "guest" or "shooter").
    GAMES.forEach((g, game) => BL.pokerGames.spotsFor(g).forEach((s, slot) => list.push(Object.freeze({ kind: "game", x: s.x, z: s.z, yaw: s.yaw, table: -1, game, slot, role: s.role }))));
    for (const f of FURNITURE) {
      const side = -Math.sign(f.x);
      if (f.kind === "bar") {
        for (let k = -6; k <= 6; k += 3) add("stool", f.x + k, f.z + f.hz + .24, Math.PI);
        for (let k = -4.5; k <= 4.5; k += 3) if (Math.abs(f.x + k) > 4) stand("bar", f.x + k, f.z + f.hz + .95, Math.PI);
      } else if (f.kind === "sofa") for (const dz of [-1.17, 0, 1.17]) list.push(Object.freeze({ kind: "lounge", x: f.x + side * .065, z: f.z + dz, yaw: side * Math.PI / 2, table: -1, seat: "sofa", side: -side }));
      else if (f.kind === "armchair") list.push(Object.freeze({ kind: "lounge", x: f.x+.185*Math.sin(f.yaw), z: f.z+.185*Math.cos(f.yaw), yaw: f.yaw, table: -1, seat: "armchair", side: Math.sign(f.x) }));
      else if (f.kind === "cage") add("cage", f.x + side * 1.6, f.z, -side * Math.PI / 2);
      else if (f.kind === "rope") add("rope", f.x + side, f.z, side * Math.PI / 2);
    }
    spotList = Object.freeze(list);
    return spotList;
  };
  // The bar wings', the cage's and the fountain's soft warm lights, eight floats each (x, y, z, range, r, g, b, 0), after
  // the room's thirteen.
  const CLUB_LIGHTS = Float32Array.from([-10, 3, -35.6, 9, 1, 0.7, 0.4, 0, 10, 3, -35.6, 9, 1, 0.7, 0.4, 0, 20.6, 2.4, 31, 7, 1, 0.85, 0.55, 0,
    BL.pokerFountain.X, 3.6, BL.pokerFountain.Z, 6, 0.8, 0.72, 0.56, 0]);
  // The colonnade: a warm light low before each statue's plinth, where its uplight cups stand, so the figures
  // read lit from below against the night through the glass, and the sill and glass round them catch it. After every
  // other light, so a tier that keeps fewer drops them first (the scene counts them only on the tier that keeps all).
  const COLONNADE = Float32Array.from(BL.pokerStatues.SLOTS.flatMap(({ x, z }) => [x - Math.sign(x) * 0.9, 0.25, z, 6, 2.2, 1.7, 1.15, 0]));
  // One warm light a lounge, from its table lamps, after the colonnade's and counted on the top WebGL tier alone with it,
  // so the women on the sofas and in the armchairs read lit, not dark against the night.
  const LOUNGE_LIGHTS = Float32Array.from(FURNITURE.filter(f => f.kind === "lowTable").flatMap(f => [f.x, 1.3, f.z, 6.5, 1.9, 1.35, 0.8, 0]));
  // One warm light a gaming table, from its lamp, after the lounges' and counted on the top WebGL tier alone with them:
  // the four fit the tier's 32 after the 27 before them.
  const GAME_LIGHTS = Float32Array.from(GAMES.flatMap(g => [g.x, 3.6, g.z, 7, 1.6, 1.2, 0.75, 0]));
  // The one sitting pose for a caveman at a table, the same for every figure: the legs forward over the chair and both
  // arms brought forward to the rail. Standing restores the original leg meshes and the crew's resting rotations.
  const SIT_LEGS = -1.35, SIT_ARMS = -0.9, STAND_ARMS = -0.2;
  // Bend the calf in the leg's local space. Cutting crossing faces at the fold keeps
  // the long voxel faces and their shorter neighbours joined along the kneecap.
  const folded = new WeakMap(), straight = new WeakMap();
  const foldedLeg = source => {
    if (folded.has(source)) return folded.get(source);
    const storage = BL.compactGeometry?.storageOf(source), verts = source.verts || storage?.verts;
    if (!verts?.length) return source;
    const out = M.geometry(), c = Math.cos(-SIT_LEGS), s = Math.sin(-SIT_LEGS);
    let bottom = Infinity, top = -Infinity;
    for (let i=1;i<verts.length;i+=3) { bottom=Math.min(bottom,verts[i]); top=Math.max(top,verts[i]); }
    const knee=bottom+(top-bottom)*.40, band=(top-bottom)*.085;
    const cuts=[knee-band,knee+band], raw=Array.from(verts), crossings=new Map();
    const split=(indices,y) => {
      const lower=[], upper=[];
      let a=indices[indices.length-1];
      for (const b of indices) {
        const ay=raw[a*3+1], by=raw[b*3+1];
        if ((ay<y && by>y)||(ay>y && by<y)) {
          const key=Math.min(a,b)+"/"+Math.max(a,b)+"/"+y;
          let n=crossings.get(key);
          if (n===undefined) {
            const f=(y-ay)/(by-ay); n=raw.length/3; crossings.set(key,n);
            raw.push(raw[a*3]+f*(raw[b*3]-raw[a*3]),y,raw[a*3+2]+f*(raw[b*3+2]-raw[a*3+2]));
          }
          lower.push(n); upper.push(n);
        }
        if (by<=y) lower.push(b);
        if (by>=y) upper.push(b);
        a=b;
      }
      return [lower,upper].filter(poly=>poly.length>=3);
    };
    for(let j=0;j<(storage?.count ?? source.faces.length);j++) {
      const f=storage ? BL.compactGeometry.copyFace(source,j) : source.faces[j];
      let pieces=[Array.from(f.i)];
      for(const cut of cuts) pieces=pieces.flatMap(poly=>poly.some(i=>raw[3*i+1]<cut)&&poly.some(i=>raw[3*i+1]>cut)?split(poly,cut):[poly]);
      for(const i of pieces) out.faces.push({...f,i});
    }
    for(let i=0;i<raw.length;i+=3) {
      const y=raw[i+1], z=raw[i+2], k=Math.max(0,Math.min(1,(knee+band-y)/(2*band)));
      out.verts.push(raw[i],y+k*((c-1)*(y-knee)-s*z),z+k*(s*(y-knee)+(c-1)*z));
    }
    out.characterPart=true;
    folded.set(source,out); straight.set(out,source); return out;
  };
  const bendLeg = (leg,on) => {
    const g=leg?.geometry;
    if(g && on && !straight.has(g)) leg.geometry=foldedLeg(g);
    else if(g && !on && straight.has(g)) leg.geometry=straight.get(g);
  };
  const bendKnees = (p,on) => { bendLeg(p.legR,on); bendLeg(p.legL,on); };
  const sitPose = cave => {
    const p = cave.parts;
    bendKnees(p,true);
    if (p.legL) p.legL.rotation.x = SIT_LEGS; if (p.legR) p.legR.rotation.x = SIT_LEGS;
    if (p.armL) p.armL.rotation.x = SIT_ARMS; if (p.armR) p.armR.rotation.x = SIT_ARMS;
  };
  const standPose = cave => {
    const p = cave.parts;
    bendKnees(p,false);
    if (p.legL) p.legL.rotation.x = 0; if (p.legR) p.legR.rotation.x = 0;
    if (p.armL) p.armL.rotation.x = STAND_ARMS; if (p.armR) p.armR.rotation.x = STAND_ARMS;
  };
  BL.pokerModels = { CHANDELIER_LIGHT_Y, TABLE_K, FELT_A, FELT_B, RAIL_A, RAIL_B, TOP_A, TOP_B, WALK_A, WALK_B, TABLE_HX, TABLE_HZ, CHAIR_RADIUS, DEALER_Z, DEAL_FROM, DEAL_RUN, FELT_Y, RAIL_TOP, SEAT_TOP, SIT_HIP, DEALER_SCALE, sitY, PLACES, BEAD_Y, TABLES, GAMES, SEATS, REAR_WALL_Z, PORTAL_Z, EXIT_Z, FURNITURE, HIGH_ROLLER, geometry, card, build, walkable, crosses, setLite, nearestClear, CLUB_LIGHTS, COLONNADE, LOUNGE_LIGHTS, GAME_LIGHTS, spots, bendKnees, sitPose, standPose };
})();
