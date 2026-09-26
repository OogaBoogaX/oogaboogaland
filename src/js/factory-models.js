// The Lightning Factory's geometry: a tiered cavern behind the 2 o'clock mouth, and the tunnel the hub dresses
// that mouth with. Everything is cached and built once per page; the scene places nodes and animates them.
//
// `LAYOUT` is the one table of where everything stands, read by the scene as well, so the camera presets, the
// point lights, the gorillas' decks and the geometry cannot disagree. The cave's frame: the node core stands
// over the origin, +z runs out toward the entrance balcony and -z into the back wall, and the tiers step up
// from the pit (y 0) to the galleries under the vault. Levels are LEVEL.pit, low, main, high and top.
//
// Station pieces are built facing +z, the way a visitor on the balcony reads them, and turned into place by the
// scene. Where the scene animates a part (the core's chamber, a capacitor's glass, the rebalancer's ring, the
// lookout's beam, the treasury's pile and hopper, the carts) it is its own geometry, with a lit and a dim
// variant where it flashes, so a flash is a geometry swap and never a rebuild.
//
// The house style: timber and stone are chamfered `bevelBox`es; the machines are turned, lathes and tubes shaded
// smooth, with their signs (the bolt, the Bitcoin sign) cut as smooth solids. Labels are lit boards set in the
// system's sans (`label`), as the concept letters them.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { cached, box, bevelBox, lathe, tube, merge, noShadow, geometry, pushVert, face, makeVox, voxelGeometry } = models;
  const { mulberry32, hexToRgb } = math;
  const TAU = Math.PI * 2;

  const STONE = ["#5b4a3e", "#524238", "#66544a", "#4a3d34"], STONE_DK = "#3a2f28", ROCK_LT = "#75614f";
  const TIMBER = "#8a5a32", TIMBER_LT = "#a8703e", TIMBER_DK = "#5c3a1e";
  const IRON = "#4a4d52", IRON_DK = "#2c2e33", IRON_LT = "#6f737a", BRASS = "#c9962e";
  const GOLD = "#ffc83a", BOLT = "#ffd84a", EMBER = "#ff7a1e", CRYSTAL = "#4f9dff", CYAN = "#5fe3ff";
  // Each line's two capacitors: blue lights on a settled forward, orange sputters on a failed one.
  const CAP_BLUE = { dim: ["#1f5f9a", "#3f8fd0"], lit: ["#5fc0ff", "#c8f2ff"], halo: "#a8ecff" }, CAP_ORANGE = { dim: ["#9a4214", "#d0661e"], lit: ["#ff8a2a", "#ffd08a"], halo: "#ffd890" };
  const BRONZE = "#a86a34", BRONZE_DK = "#6e4222", COPPER = "#c0703a", COPPER_DK = "#7e4220";

  const LEVEL = { pit: 0, low: 2.5, main: 5, high: 10, top: 15.5 };
  // Rock outcrops either side of the front of the pit: [x, z, size].
  const OUTCROPS = [[-11, 21, 1.3], [-16, 25, 1.6], [14.5, 20, 1], [-6, 17, 0.8], [7, 15, 0.9]];
  const HALL = { halfW: 23, back: -22, front: 30, h: 26 };
  // The walls' stone comes in cells this big and leans this far in over the hall's height.
  const WALL_CELL = 0.75, WALL_LEAN = 3.5, STATION_BACK = 0.8;
  // Every standing place, in the cave's frame. A deck is its centre, top height, width (x) and depth (z).
  const LAYOUT = {
    LEVEL, HALL,
    core: { x: 0, z: -4, chamber: [6.4, 11.2], radius: 2.5 },
    // The balcony where the visitor comes in and first sees the hall, and the grand stairway from its front edge
    // down to the forge, as the concept draws it: [x, y, z] at its foot and at its head, and its width.
    entrance: { x: 0, y: LEVEL.main, z: 26, w: 5, d: 8 },
    stairway: [0, 0, 13, 0, LEVEL.main, 22, 3.4],
    ring: { x: 0, y: LEVEL.main, z: -4, inner: 3.6, outer: 6.6 },
    // Featured lines, lettered A to D: two on the main level either side of the core, two higher and further back.
    // Each line's station stands `STATION_BACK` behind its deck's middle, so the deck's front is a clear walk.
    bays: [
      { letter: "A", x: -11, y: LEVEL.high, z: -12, w: 7, d: 5 },
      { letter: "B", x: 11, y: LEVEL.high, z: -12, w: 7, d: 5 },
      { letter: "C", x: -12, y: LEVEL.main, z: -2, w: 7, d: 5 },
      { letter: "D", x: 12, y: LEVEL.main, z: -2, w: 7, d: 5 }
    ],
    // A peer tunnel behind each featured line, cut into the wall it stands against. `turn` faces it into the hall.
    tunnels: [
      { bay: 0, x: -11, y: LEVEL.high, z: -19.8, turn: 0 },
      { bay: 1, x: 11, y: LEVEL.high, z: -19.8, turn: 0 },
      { bay: 2, x: -20.8, y: LEVEL.main, z: -2, turn: Math.PI / 2 },
      { bay: 3, x: 20.8, y: LEVEL.main, z: -2, turn: -Math.PI / 2 }
    ],
    switchboard: { x: -12, y: LEVEL.low, z: 6, w: 7, d: 5 },
    rebalancer: { x: 14, y: LEVEL.low, z: 4.2, w: 6, d: 5 },
    treasury: { x: 12, y: LEVEL.low, z: 12.5, w: 7, d: 5 },
    // In front of the core's stone foot, whose face is at z 0.2 there.
    forge: { x: 0, z: 0.7 },
    lookout: { x: -16, y: LEVEL.top, z: -14, w: 6, d: 6, tower: 5.5 },
    study: { x: 21.4, y: LEVEL.main, z: 12, w: 4, d: 7 },
    // Level 2, the balcony's level: the walkway from the balcony's right side round the right wall, past the study
    // hall, to the Harbor line's porch, as decks [x0, x1, z0, z1]; each line's porch out to its peer tunnel comes
    // from the line and the tunnel (`porchOf`).
    walk: [[2.5, 17.6, 23.7, 26.3], [17.6, 20.2, -0.5, 26.3]],
    // Every other flight of stairs, [x, y, z] at the bottom and at the top and its width, read by the scaffold that
    // builds them (cutting the rail wherever one lands) and by the floor an Ooga walks: pit to the switchboard, the
    // treasury and the core's walkway, the main level to the high lines up the lines' inner sides, and the high
    // lines to the front edges of the galleries. Each lands on its deck's edge, never through it.
    stairs: [
      [-10, 0, 12.4, -10, LEVEL.low, 8.5, 1.6], [10.5, 0, 19, 10.5, LEVEL.low, 15, 1.6],
      [-4.5, 0, 7, -4.5, LEVEL.main, 0.6, 1.6], [4.5, 0, 7, 4.5, LEVEL.main, 0.6, 1.6],
      [-8.9, LEVEL.main, -4.2, -8.9, LEVEL.high, -9.6, 1.6], [8.9, LEVEL.main, -4.2, 8.9, LEVEL.high, -9.6, 1.6],
      [-7.8, LEVEL.high, -10.5, -2.5, LEVEL.top, -14.85, 1.6], [14.3, LEVEL.high, -10, 18.5, LEVEL.top, -13.95, 1.6]
    ],
    // The galleries under the vault: a row of smaller stations for every line past the featured four.
    galleries: [
      { x: -3, y: LEVEL.top, z: -16.8, w: 16, d: 4, stations: 6 },
      { x: 13.5, y: LEVEL.top, z: -16, w: 11, d: 4, stations: 4 }
    ]
  };

  // A line's porch out to its peer tunnel, [x0, x1, z0, z1] at the tunnel's level: from the line's outer edge to
  // the tunnel's face for the lines on the side walls, from the line's back edge for those at the back.
  const porchOf = (t) => {
    const b = LAYOUT.bays[t.bay];
    if (t.turn === 0) return [t.x - 1.5, t.x + 1.5, t.z + 0.6, b.z - b.d / 2];
    const s = Math.sign(t.x), inner = b.x + s * b.w / 2, face = t.x - s * 0.5;
    return [Math.min(inner, face), Math.max(inner, face), t.z - 1.5, t.z + 1.5];
  };

  // ---- small builders ------------------------------------------------------------------------------

  // A squared beam between two points: braces, rails, chains and cables.
  const beam = (ax, ay, az, bx, by, bz, w, color, emissive = 0) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let hx = 0, hy = 1, hz = 0;
    if (Math.abs(uy) > 0.9) { hx = 1; hy = 0; }
    let px = uy * hz - uz * hy, py = uz * hx - ux * hz, pz = ux * hy - uy * hx;
    const pl = Math.hypot(px, py, pz);
    px /= pl; py /= pl; pz /= pl;
    const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
    const geo = geometry(), rgb = hexToRgb(color), r = w / 2, opts = { emissive };
    const ring = (x, y, z) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => pushVert(geo, x + (px * s + qx * t) * r, y + (py * s + qy * t) * r, z + (pz * s + qz * t) * r));
    const a = ring(ax, ay, az), b = ring(bx, by, bz);
    for (let i = 0; i < 4; i++) face(geo, [a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]], rgb, opts);
    face(geo, b, rgb, opts);
    face(geo, a.slice().reverse(), rgb, opts);
    return geo;
  };
  const moved = (geo, x, y, z) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] += x; v[i + 1] += y; v[i + 2] += z; }
    return geo;
  };
  // Turns a freshly built geometry about y, the way a node's rotation.y would.
  const turnedY = (geo, a) => {
    const v = geo.verts, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], z = v[i + 2];
      v[i] = x * c + z * s;
      v[i + 2] = -x * s + z * c;
    }
    return geo;
  };
  // Turns a freshly built geometry about z, for the voussoirs of an arch.
  const turnedZ = (geo, a) => {
    const v = geo.verts, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1];
      v[i] = x * c - y * s;
      v[i + 1] = x * s + y * c;
    }
    return geo;
  };
  // A lathe laid on its side along +z, for pipes, lenses and wheels.
  const forwardLathe = (geo) => {
    const v = geo.verts;
    for (let i = 0; i < v.length; i += 3) { const y = v[i + 1]; v[i + 1] = v[i + 2]; v[i + 2] = y; }
    geo.faces.forEach((f) => f.i.reverse());
    return geo;
  };
  // A convex outline, counter-clockwise from the front, extruded `depth` thick about z 0.
  const prism = (points, depth, color, emissive = 0) => {
    const geo = geometry(), rgb = hexToRgb(color), opts = { emissive }, n = points.length;
    const back = points.map(([x, y]) => pushVert(geo, x, y, -depth / 2)), front = points.map(([x, y]) => pushVert(geo, x, y, depth / 2));
    for (let i = 0; i < n; i++) face(geo, [back[i], back[(i + 1) % n], front[(i + 1) % n], front[i]], rgb, opts);
    face(geo, front, rgb, opts);
    face(geo, back.slice().reverse(), rgb, opts);
    return geo;
  };
  // A flat sign made of convex pieces, each extruded `depth` thick and wound counter-clockwise whatever order its
  // points came in, then leant by `lean` radians clockwise: `height` is the span of the unit pieces' -1..1.
  const solidGlyph = (pieces, height, depth, color, emissive, lean = 0) => {
    const k = height / 2, c = Math.cos(lean), sn = Math.sin(lean);
    return merge(...pieces.map((piece) => {
      const points = piece.map(([x, y]) => [(x * c + y * sn) * k, (-x * sn + y * c) * k]);
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      return prism(area < 0 ? points.reverse() : points, depth, color, emissive);
    }));
  };
  // A lightning bolt as smooth solid geometry rather than voxels: the classic zigzag, split into three convex
  // pieces (the upper slab, the step and the tip), `height` tall, centred on the origin and facing +z.
  const BOLT_PIECES = [
    [[0.1, 1], [0.6, 1], [0.2, 0.2], [-0.213, 0.2]],
    [[-0.35, -0.15], [0.331, -0.15], [0.55, 0.2], [-0.213, 0.2]],
    [[0, -0.15], [0.331, -0.15], [-0.2, -1]]
  ].map((piece) => piece.map(([x, y]) => [x - 0.125, y]));
  const smoothBolt = (height, depth, color, emissive = 1) => solidGlyph(BOLT_PIECES, height, depth, color, emissive);
  // The Bitcoin sign the same way: the stem, three bars, two bowls in segments and the four ticks, leant as the
  // logo leans.
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const bowl = (cx, cy, ro, ri, n) => Array.from({ length: n }, (_, k) => {
    const a0 = -Math.PI / 2 + Math.PI * k / n, a1 = -Math.PI / 2 + Math.PI * (k + 1) / n;
    return [[cx + Math.cos(a0) * ri, cy + Math.sin(a0) * ri], [cx + Math.cos(a0) * ro, cy + Math.sin(a0) * ro], [cx + Math.cos(a1) * ro, cy + Math.sin(a1) * ro], [cx + Math.cos(a1) * ri, cy + Math.sin(a1) * ri]];
  });
  const BTC_PIECES = [
    rect(-0.55, -0.75, -0.3, 0.75), rect(-0.3, 0.5, 0.05, 0.75), rect(-0.3, -0.12, 0.1, 0.12), rect(-0.3, -0.75, 0.1, -0.5),
    ...bowl(0.05, 0.315, 0.435, 0.185, 9), ...bowl(0.1, -0.315, 0.435, 0.185, 9),
    rect(-0.45, 0.75, -0.3, 1), rect(-0.12, 0.75, 0.03, 1), rect(-0.45, -1, -0.3, -0.75), rect(-0.12, -1, 0.03, -0.75)
  ];
  const smoothBitcoin = (height, depth, color, emissive = 1) => solidGlyph(BTC_PIECES, height, depth, color, emissive, 0.24);

  // ---- turned parts -------------------------------------------------------------------------------
  // The machines are turned, like the stethoscope: lathes and tubes shaded smooth, so a glass drum or a pipe
  // reads round instead of faceted. `turn` doubles the profile's sharp corners so rims and caps keep their crease;
  // `shaded` gathers turned parts into one smooth geometry and folds flat ones (boxes, signs) in unsmoothed.
  const turn = (profile, segments, color, emissive = 0) => {
    const points = [];
    profile.forEach((p, i) => {
      points.push(p);
      if (i === 0 || i === profile.length - 1) return;
      const a = profile[i - 1], b = profile[i + 1], ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
      if ((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1) < 0.75) points.push(p);
    });
    return lathe({ profile: points, segments, color, emissive });
  };
  const shaded = (round, flat = []) => {
    const g = merge(...round);
    g.smooth = true;
    if (flat.length) BL.hubModels.flatInto(g, ...flat);
    return g;
  };
  // A ring of round section: `R` to the middle of the tube, `r` its thickness, lying flat about +y.
  const torus = (R, r, color, emissive = 0, segments = 20, sides = 8) => lathe({
    profile: Array.from({ length: sides + 1 }, (_, k) => [R + Math.cos(k / sides * TAU) * r, Math.sin(k / sides * TAU) * r]),
    segments, color, emissive
  });
  const ball = (r, color, emissive = 0, segments = 10) => lathe({ profile: Array.from({ length: 6 }, (_, k) => [Math.sin(k / 5 * Math.PI) * r, -Math.cos(k / 5 * Math.PI) * r]), segments, color, emissive });
  // Stands a geometry built round +y at (x, y, z) with that axis turned onto the direction (dx, dy, dz).
  const along = (geo, x, y, z, dx, dy, dz) => {
    const l = Math.hypot(dx, dy, dz) || 1, tx = dx / l, ty = dy / l, tz = dz / l;
    const hx = Math.abs(ty) < 0.9 ? 0 : 1, hy = Math.abs(ty) < 0.9 ? 1 : 0;
    let nx = hy * tz, ny = -hx * tz, nz = hx * ty - hy * tx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx, v = geo.verts;
    for (let i = 0; i < v.length; i += 3) {
      const a = v[i], b = v[i + 1], c = v[i + 2];
      v[i] = x + nx * a + tx * b + bx * c; v[i + 1] = y + ny * a + ty * b + by * c; v[i + 2] = z + nz * a + tz * b + bz * c;
    }
    return geo;
  };
  // A chain from one point to another: oval links of round iron, each a quarter turn from the last.
  const chain = (ax, ay, az, bx, by, bz, size = 0.16, color = IRON_DK) => {
    const len = Math.hypot(bx - ax, by - ay, bz - az), pitch = size * 2.2, n = Math.max(1, Math.round(len / pitch)), out = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, link = forwardLathe(torus(size, size * 0.3, color, 0, 10, 6));
      for (let k = 1; k < link.verts.length; k += 3) link.verts[k] *= 1.55;
      if (i % 2) turnedY(link, Math.PI / 2);
      out.push(along(link, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, bx - ax, by - ay, bz - az));
    }
    return out;
  };

  // ---- labels ---------------------------------------------------------------------------------------
  // A label as the concept draws them: a near-black board with a thin pale edge, the name in bold capitals and
  // what it does under it, set in the system's sans at a sign's size so it reads sharp from across the hall. The
  // lettering is a picture on the board's face (`imageSurface`), drawn unlit like a lit sign; `back` is the iron
  // board behind it. `height` is a two-line label's height in metres. Fixed labels are cached; a label whose
  // reading changes passes `keep: false`, and the scene releases what it replaces. Styles: plain, `gold` (the study
  // hall's sign) and `paper` (the note on its door).
  const LABEL_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const LABEL_STYLES = {
    plain: { board: "#0d0b0a", edge: "rgba(236,226,206,0.6)", title: "#f8f4ec", sub: "#d6cfc1", back: IRON_DK },
    gold: { board: "#1a120c", edge: "rgba(243,195,90,0.7)", title: "#f3c35a", sub: "#e8c887", back: TIMBER_DK },
    paper: { board: "#efe2c4", edge: "rgba(90,60,30,0.45)", title: "#3a2416", sub: "#5a3a22", back: "#c9b48c" }
  };
  const labelCache = new Map();
  const label = (title, sub = "", { height = 1.25, style = "plain", keep = true } = {}) => {
    const key = `${title}|${sub}|${height}|${style}`;
    let out = keep ? labelCache.get(key) : null;
    if (out) return out;
    const S = LABEL_STYLES[style], canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    const titleFont = `bold 50px ${LABEL_FONT}`, subFont = `37px ${LABEL_FONT}`;
    g.font = titleFont;
    const tw = g.measureText(title).width;
    g.font = subFont;
    const sw = sub ? g.measureText(sub).width : 0, w = Math.ceil(Math.max(tw, sw) + 56), h = sub ? 124 : 80;
    canvas.width = w;
    canvas.height = h;
    g.fillStyle = S.board;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = S.edge;
    g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = S.title;
    g.font = titleFont;
    g.fillText(title, w / 2, sub ? 45 : h / 2 + 2);
    if (sub) {
      g.fillStyle = S.sub;
      g.font = subFont;
      g.fillText(sub, w / 2, 90);
    }
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const m = height / 124, W = w * m, H = h * m, face = { verts: [-W / 2, -H / 2, 0.03, W / 2, -H / 2, 0.03, W / 2, H / 2, 0.03, -W / 2, H / 2, 0.03], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [-W / 2, -H / 2, W, H] };
    const back = bevelBox({ w: W + 0.14, h: H + 0.14, d: 0.08, color: S.back, bevel: 0.03, offset: { z: -0.02 } });
    back.castShadow = false;
    out = { face, back, width: W, height: H };
    if (keep) labelCache.set(key, out);
    return out;
  };

  // ---- timber: decks, posts, rails and stairs ------------------------------------------------------

  // A rail from one point to another on a deck whose top is at y 0: posts every metre and a half, a handrail and a
  // middle rail.
  const railParts = (x0, z0, x1, z1) => {
    const geos = [], len = Math.hypot(x1 - x0, z1 - z0), posts = Math.max(2, Math.round(len / 1.4) + 1);
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1), x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      geos.push(bevelBox({ w: 0.16, h: 1.05, d: 0.16, color: TIMBER_DK, bevel: 0.03, offset: { x, y: 0.52, z } }));
    }
    geos.push(beam(x0, 1.02, z0, x1, 1.02, z1, 0.14, TIMBER_LT), beam(x0, 0.55, z0, x1, 0.55, z1, 0.09, TIMBER));
    return geos;
  };
  // A plank deck with its top at y 0, joists under it, posts down to `drop` metres below, and a rail along the
  // named edges ("n" is -z, "s" +z, "w" -x, "e" +x). Posts stand at the corners and every few metres.
  const deckParts = (w, d, drop, rails = "", seed = 1, cuts = []) => {
    const rand = mulberry32(seed), geos = [], across = w >= d;
    const n = Math.max(2, Math.round((across ? d : w) / 0.9));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5, tone = [TIMBER, TIMBER_LT, "#946236"][Math.floor(rand() * 3)];
      geos.push(across
        ? bevelBox({ w: w - 0.04, h: 0.2, d: d / n - 0.05, color: tone, bevel: 0.04, offset: { y: -0.1, z: t * d } })
        : bevelBox({ w: w / n - 0.05, h: 0.2, d: d - 0.04, color: tone, bevel: 0.04, offset: { x: t * w, y: -0.1 } }));
    }
    for (const s of [-1, 1]) {
      geos.push(bevelBox({ w: across ? w : 0.28, h: 0.34, d: across ? 0.28 : d, color: TIMBER_DK, bevel: 0.05, offset: { x: across ? 0 : s * (w / 2 - 0.2), y: -0.37, z: across ? s * (d / 2 - 0.2) : 0 } }));
    }
    if (drop > 0.4) {
      const cols = Math.max(2, Math.round(w / 3.2) + 1), rows = Math.max(2, Math.round(d / 3.2) + 1);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (i > 0 && i < cols - 1 && j > 0 && j < rows - 1) continue;
        const x = (i / (cols - 1) - 0.5) * (w - 0.5), z = (j / (rows - 1) - 0.5) * (d - 0.5);
        geos.push(bevelBox({ w: 0.36, h: drop, d: 0.36, color: TIMBER_DK, bevel: 0.06, offset: { x, y: -drop / 2 - 0.2, z } }));
      }
      // Cross braces on the long faces, for the scaffold look.
      if (drop > 1.5) for (const s of [-1, 1]) {
        const y0 = -drop + 0.3, y1 = -0.6;
        if (across) geos.push(beam(-w / 2 + 0.3, y0, s * (d / 2 - 0.25), w / 2 - 0.3, y1, s * (d / 2 - 0.25), 0.16, TIMBER), beam(-w / 2 + 0.3, y1, s * (d / 2 - 0.25), w / 2 - 0.3, y0, s * (d / 2 - 0.25), 0.16, TIMBER));
        else geos.push(beam(s * (w / 2 - 0.25), y0, -d / 2 + 0.3, s * (w / 2 - 0.25), y1, d / 2 - 0.3, 0.16, TIMBER), beam(s * (w / 2 - 0.25), y1, -d / 2 + 0.3, s * (w / 2 - 0.25), y0, d / 2 - 0.3, 0.16, TIMBER));
      }
    }
    // A rail leaves a gap wherever a stair or a bridge lands on its edge: `cuts` are [x, z, half-width] in the
    // deck's frame.
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, keep = [[0, len]];
      for (const [cx, cz, half] of cuts) {
        const t = (cx - x0) * ux + (cz - z0) * uz, off = Math.abs((cx - x0) * uz - (cz - z0) * ux);
        if (off > 0.6 || t < -half || t > len + half) continue;
        for (let i = keep.length - 1; i >= 0; i--) {
          const [a, b] = keep[i];
          if (t + half <= a || t - half >= b) continue;
          keep.splice(i, 1, ...[[a, t - half], [t + half, b]].filter(([p, q]) => q - p > 0.3));
        }
      }
      for (const [a, b] of keep) geos.push(...railParts(x0 + ux * a, z0 + uz * a, x0 + ux * b, z0 + uz * b));
    };
    const hw = w / 2 - 0.1, hd = d / 2 - 0.1;
    if (rails.includes("n")) rail(-hw, -hd, hw, -hd);
    if (rails.includes("s")) rail(-hw, hd, hw, hd);
    if (rails.includes("w")) rail(-hw, -hd, -hw, hd);
    if (rails.includes("e")) rail(hw, -hd, hw, hd);
    return geos;
  };
  // A flight of steps from (ax, ay, az) up to (bx, by, bz), `w` wide.
  const stairParts = (ax, ay, az, bx, by, bz, w = 1.6) => {
    const geos = [], rise = by - ay, steps = Math.max(3, Math.round(rise / 0.32)), len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len, px = -uz, pz = ux;
    for (const s of [-1, 1]) geos.push(beam(ax + px * s * w / 2, ay, az + pz * s * w / 2, bx + px * s * w / 2, by, bz + pz * s * w / 2, 0.22, TIMBER_DK));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + rise * t;
      geos.push(beam(x - px * w / 2, y + 0.06, z - pz * w / 2, x + px * w / 2, y + 0.06, z + pz * w / 2, 0.14, i % 2 ? TIMBER : TIMBER_LT));
    }
    return geos;
  };

  // ---- the hall ---------------------------------------------------------------------------------------

  // The cavern itself: a stone floor, craggy walls in stacked blocks, a vault hung with stalactites, rock
  // ledges under the high decks, and blue crystal and the glow of water running down the back. Stone is one
  // mesh; the crystal and the falls, which glow, are another with no shadow.
  const hall = cached(() => {
    const rand = mulberry32(2112), rock = [], glow = [];
    const { halfW: W, back: B, front: F, h: H } = HALL;
    for (let x = -W; x < W; x += 4) for (let z = B; z < F; z += 4) {
      rock.push(box({ w: 4, h: 0.4, d: 4, color: STONE[Math.floor(rand() * 4)], offset: { x: x + 2, y: -0.2 - rand() * 0.06, z: z + 2 } }));
    }
    // Walls: voxel stone in cells of WALL_CELL metres, leaning in as they rise and heaved in and out at two scales,
    // a shell three cells thick behind the face. Openings in the walls for the peer tunnels, the study hall and the
    // tunnel out: [wall, centre along it, bottom, top, half-width]; the walls are "back", "left", "right" and
    // "front", and along a wall is x for the back and front and z for the sides.
    const openings = LAYOUT.tunnels.map((t) => [t.turn === 0 ? "back" : t.x < 0 ? "left" : "right", t.turn === 0 ? t.x : t.z, t.y - 0.5, t.y + 6, 3.8]);
    openings.push(["right", LAYOUT.study.z, LAYOUT.study.y - 0.5, LAYOUT.study.y + 9.5, 3.4], ["front", 0, 3, 10.5, 6.5]);
    const open = (wall, u, y) => openings.some(([w, c, y0, y1, half]) => w === wall && Math.abs(u - c) < half && y > y0 && y < y1);
    const C = WALL_CELL, v = makeVox(), cell = (m) => Math.floor(m / C);
    const hash = (a, b, k) => {
      let h = (a * 374761393 + b * 668265263 + k * 2147483647) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    // Value noise on a lattice of `size` metres, eased between its corners.
    const heave = (u, y, size, k) => {
      const fu = u / size, fy = y / size, iu = Math.floor(fu), iy = Math.floor(fy), tu = fu - iu, ty = fy - iy;
      const su = tu * tu * (3 - 2 * tu), sy = ty * ty * (3 - 2 * ty);
      const a = hash(iu, iy, k), b = hash(iu + 1, iy, k), c = hash(iu, iy + 1, k), d = hash(iu + 1, iy + 1, k);
      return (a + (b - a) * su) * (1 - sy) + (c + (d - c) * su) * sy;
    };
    const falls = [-17, -4.5, 4.5, 18];
    // A wall's face stands `depth` in from its line: half a metre, the lean, and the heave. `put` lays one of the
    // shell's cells, `d` of them back from the face, in the wall's own axes.
    const shell = (name, from, to, k, put) => {
      for (let iu = cell(from); iu <= cell(to); iu++) for (let iy = 0; iy * C < H + 1; iy++) {
        const u = (iu + 0.5) * C, y = (iy + 0.5) * C;
        if (open(name, u, y)) continue;
        // The back wall is smooth where the water runs down it.
        const groove = name === "back" && falls.some((f) => Math.abs(u - f) < 1.1);
        const depth = 0.5 + y / H * WALL_LEAN + (groove ? 0 : heave(u, y, 3.2, k) * 0.95 + hash(iu, iy, k + 9) * 0.3);
        const tone = hash(iu >> 1, iy >> 1, k + 3), color = tone < 0.1 ? 5 : 1 + Math.floor(hash(iu >> 1, iy >> 1, k + 5) * 3.99);
        for (let d = 0; d < 3; d++) put(iu, iy, depth, d, color);
      }
    };
    shell("back", -W - 1, W + 1, 1, (iu, iy, depth, d, c) => v.set(iu, iy, cell(B + depth) - d, c));
    shell("front", -W - 1, W + 1, 2, (iu, iy, depth, d, c) => v.set(iu, iy, cell(F - depth) + d, c));
    shell("left", B, F, 3, (iu, iy, depth, d, c) => v.set(cell(-W + depth) - d, iy, iu, c));
    shell("right", B, F, 4, (iu, iy, depth, d, c) => v.set(cell(W - depth) + d, iy, iu, c));
    const walls = voxelGeometry(v, { unit: C, palette: [null, ...STONE, ROCK_LT] });
    // The vault: slabs across the top and stalactites hanging from them in three tapering courses.
    for (let x = -W; x < W; x += 5) for (let z = B; z < F; z += 5) rock.push(box({ w: 5.4, h: 2, d: 5.4, color: STONE[Math.floor(rand() * 4)], offset: { x: x + 2.5, y: H + rand() * 1.2, z: z + 2.5 } }));
    for (let i = 0; i < 70; i++) {
      const x = (rand() * 2 - 1) * (W - 3), z = B + 2 + rand() * (F - B - 5), len = 1.4 + rand() * 3.6, s = 0.8 + rand() * 0.8;
      const top = H - 0.8, color = STONE[Math.floor(rand() * 4)];
      rock.push(
        box({ w: 0.9 * s, h: len * 0.45, d: 0.9 * s, color, offset: { x, y: top - len * 0.22, z } }),
        box({ w: 0.55 * s, h: len * 0.35, d: 0.55 * s, color, offset: { x, y: top - len * 0.62, z } }),
        box({ w: 0.25 * s, h: len * 0.22, d: 0.25 * s, color, offset: { x, y: top - len * 0.9, z } })
      );
    }
    // Rock ledges the high decks and tunnels sit on, stepped out of the walls.
    const ledge = (x, y, z, w, d) => {
      for (let k = 0; k < 3; k++) rock.push(box({ w: w - k * 0.8, h: y / 3 + 0.2, d: d - k * 0.6, color: STONE[(k + 1) % 4], offset: { x, y: y * (k + 0.5) / 3, z } }));
    };
    // Their tops stand just under the porches' planks.
    for (const t of LAYOUT.tunnels) {
      if (t.turn === 0) ledge(t.x, t.y - 0.4, t.z + 2.2, 8, 5);
      else ledge(t.x - Math.sign(t.x) * 2.4, t.y - 0.4, t.z, 7, 8);
    }
    // Blue crystal in clusters along the foot of the walls and on the ledges, and three falls of glowing water
    // down the back wall, as in the concept.
    const crystal = (x, y, z, s) => {
      for (let k = 0; k < 4; k++) {
        const a = rand() * TAU, lean = 0.2 + rand() * 0.3, h = s * (1 + rand() * 1.2), r = s * (0.16 + rand() * 0.1);
        const g = lathe({ profile: [[r, 0], [r * 0.9, h * 0.8], [0, h]], segments: 5, color: k % 2 ? CRYSTAL : "#7fc4ff", emissive: 0.75 });
        const c = Math.cos(a) * lean, sn = Math.sin(a) * lean;
        const v = g.verts;
        for (let i = 0; i < v.length; i += 3) { v[i] += v[i + 1] * c; v[i + 2] += v[i + 1] * sn; }
        glow.push(moved(g, x + Math.cos(a) * s * 0.3, y, z + Math.sin(a) * s * 0.3));
      }
    };
    for (let i = 0; i < 26; i++) {
      const side = i % 3, t = rand();
      if (side === 0) crystal(-W + 1.5 + rand(), 0, B + 3 + t * (F - B - 8), 0.8 + rand() * 0.9);
      else if (side === 1) crystal(W - 1.5 - rand(), 0, B + 3 + t * (F - B - 8), 0.8 + rand() * 0.9);
      else crystal(-W + 4 + t * (2 * W - 8), 0, B + 1.8, 0.9 + rand());
    }
    for (const t of LAYOUT.tunnels) crystal(t.x + (t.turn ? 0 : 3.6), t.y, t.z + (t.turn ? 3.4 : 1.4), 0.7);
    // Outcrops either side of the front of the pit, framing the view from the balcony.
    for (const [x, z, s] of OUTCROPS) {
      for (let k = 0; k < 4; k++) {
        const w = (3.6 - k * 0.7) * s, h = 1.4 * s;
        rock.push(box({ w, h, d: w * 0.9, color: STONE[(k + 2) % 4], offset: { x: x + (rand() - 0.5) * 0.6, y: h * (k + 0.5), z: z + (rand() - 0.5) * 0.6 } }));
      }
      crystal(x + 1.4 * s, 0, z - 1.2 * s, 0.9 * s);
    }
    for (const fx of [-17, -4.5, 4.5, 18]) {
      for (let y = 0; y < 15; y += 1.5) glow.push(box({ w: 1.1 + rand() * 0.5, h: 1.6, d: 0.3, color: y % 3 < 1.5 ? "#3f8fe0" : "#6ab8ff", emissive: 0.55 + rand() * 0.2, offset: { x: fx + (rand() - 0.5) * 0.3, y: y + 0.8, z: B + 1.4 + (y + 0.8) / H * WALL_LEAN } }));
      // The pool each fall lands in.
      glow.push(moved(lathe({ profile: [[1.6, 0.05], [0, 0.05]], segments: 10, color: "#4a9bff", emissive: 0.5 }), fx, 0, B + 2.6));
    }
    return { rock: merge(...rock), walls, glow: noShadow(merge(...glow)) };
  });

  // Decks, bridges, stairs and the core's walkway ring: all the timber, as one mesh.
  const scaffold = cached(() => {
    const L = LAYOUT, geos = [];
    const place = (parts, x, y, z) => { for (const g of parts) geos.push(moved(g, x, y, z)); };
    // Where a stair or a bridge lands on a deck, as cuts in that deck's frame.
    const landings = [];
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) landings.push([ax, ay, az, w / 2 + 0.2], [bx, by, bz, w / 2 + 0.2]);
    landings.push([L.lookout.x + L.lookout.w / 2, LEVEL.top, L.lookout.z - 1, 1.1]);
    const cutsFor = (d) => landings.filter(([x, y, z]) => Math.abs(y - d.y) < 0.3 && Math.abs(x - d.x) < d.w / 2 + 1 && Math.abs(z - d.z) < d.d / 2 + 1).map(([x, , z, half]) => [x - d.x, z - d.z, half]);
    const deckAt = (d, rails, drop = d.y) => place(deckParts(d.w, d.d, drop, rails, Math.round(d.x * 7 + d.z), cutsFor(d)), d.x, d.y, d.z);
    for (const b of L.bays) deckAt(b, b.y > LEVEL.main ? "s" : "sn", b.y > LEVEL.main ? b.y - LEVEL.main + 1.4 : b.y);
    deckAt(L.switchboard, "se");
    deckAt(L.rebalancer, "sn");
    deckAt(L.treasury, "sw");
    deckAt(L.lookout, "se", 3);
    for (const g of L.galleries) deckAt(g, "s", 3);
    // The balcony the visitor enters on, running out from the tunnel, railed on its left and on its right either
    // side of where the walkway leaves it.
    const e = L.entrance, [w0, , a0, a1] = L.walk[0], ex = e.x + e.w / 2 - 0.1;
    place(deckParts(e.w, e.d, e.y, "w"), e.x, e.y, e.z);
    place(railParts(ex, e.z - e.d / 2 + 0.1, ex, a0), 0, e.y, 0);
    place(railParts(ex, a1, ex, e.z + e.d / 2 - 0.1), 0, e.y, 0);
    // Level 2's walkway round the right wall, posted down to the pit floor, railed along the hall side; and each
    // line's porch out to its peer tunnel, railed along both sides.
    for (const [x0, x1, z0, z1] of L.walk) place(deckParts(x1 - x0, z1 - z0, e.y, "", 17), (x0 + x1) / 2, e.y, (z0 + z1) / 2);
    const [[, s0x1], [s1x0, s1x1, s1z0]] = L.walk;
    place(railParts(w0, a0 + 0.1, s0x1, a0 + 0.1), 0, e.y, 0);
    place(railParts(w0, a1 - 0.1, s1x1 - 0.1, a1 - 0.1), 0, e.y, 0);
    place(railParts(s1x0 + 0.1, a0, s1x0 + 0.1, s1z0), 0, e.y, 0);
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = porchOf(t), side = t.turn !== 0;
      place(deckParts(x1 - x0, z1 - z0, side ? t.y : 0.3, "", 23), (x0 + x1) / 2, t.y, (z0 + z1) / 2);
      if (!side) for (const x of [x0 + 0.1, x1 - 0.1]) place(railParts(x, z0, x, z1), 0, t.y, 0);
      else {
        place(railParts(x0, z0 + 0.1, x1, z0 + 0.1), 0, t.y, 0);
        // The Harbor line's porch meets the walkway along its hall-side edge.
        if (t.x > 0) place(railParts(x0, z1 - 0.1, s1x0, z1 - 0.1), 0, t.y, 0);
        else place(railParts(x0, z1 - 0.1, x1, z1 - 0.1), 0, t.y, 0);
      }
    }
    // The core's walkway: a ring of planks round the chamber's foot, railed on the outside.
    const r = L.ring, planks = 28;
    for (let i = 0; i < planks; i++) {
      const a = i / planks * TAU, a2 = (i + 1) / planks * TAU, mid = (r.inner + r.outer) / 2;
      const g = bevelBox({ w: (r.outer - r.inner), h: 0.2, d: mid * TAU / planks - 0.05, color: i % 3 ? TIMBER : TIMBER_LT, bevel: 0.04, offset: { x: mid, y: -0.1 } });
      geos.push(moved(turnedY(g, -(a + a2) / 2), r.x, r.y, r.z));
      const px = Math.cos(a) * (r.outer - 0.15), pz = Math.sin(a) * (r.outer - 0.15);
      const qx = Math.cos(a2) * (r.outer - 0.15), qz = Math.sin(a2) * (r.outer - 0.15);
      // The rail leaves gaps where the bridges to C and D meet it and where the stairs up from the pit arrive.
      const mx = r.x + Math.cos(a + (a2 - a) / 2) * r.outer, mz = r.z + Math.sin(a + (a2 - a) / 2) * r.outer;
      const gap = Math.abs(Math.cos(a + 0.1)) > 0.93 || L.stairs.some(([, , , bx, by, bz]) => by === r.y && Math.hypot(bx - mx, bz - mz) < 1.3);
      if (!gap) geos.push(beam(r.x + px, r.y + 1, r.z + pz, r.x + qx, r.y + 1, r.z + qz, 0.13, TIMBER_LT), bevelBox({ w: 0.15, h: 1, d: 0.15, color: TIMBER_DK, bevel: 0.03, offset: { x: r.x + px, y: r.y + 0.5, z: r.z + pz } }));
      if (i % 4 === 0) geos.push(bevelBox({ w: 0.4, h: r.y, d: 0.4, color: TIMBER_DK, bevel: 0.06, offset: { x: r.x + Math.cos(a) * (r.outer - 0.4), y: r.y / 2 - 0.2, z: r.z + Math.sin(a) * (r.outer - 0.4) } }));
    }
    // Bridges from the ring to the main-level lines, and from the balcony toward the core.
    const bridge = (x0, z0, x1, z1, y, w = 2) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.5), ux = (x1 - x0) / len, uz = (z1 - z0) / len, px = -uz, pz = ux;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        geos.push(beam(x - px * w / 2, y - 0.1, z - pz * w / 2, x + px * w / 2, y - 0.1, z + pz * w / 2, 0.22, i % 2 ? TIMBER : TIMBER_LT));
      }
      for (const s of [-1, 1]) {
        geos.push(beam(x0 + px * s * w / 2, y + 1, z0 + pz * s * w / 2, x1 + px * s * w / 2, y + 1, z1 + pz * s * w / 2, 0.12, TIMBER_LT));
        geos.push(beam(x0 + px * s * w / 2, y - 0.3, z0 + pz * s * w / 2, x1 + px * s * w / 2, y - 0.3, z1 + pz * s * w / 2, 0.24, TIMBER_DK));
      }
    };
    bridge(-6.6, -4, -8.5, -2.5, LEVEL.main);
    bridge(6.6, -4, 8.5, -2.5, LEVEL.main);
    // The grand stairway from the balcony down to the forge: plank treads and risers between heavy stringers,
    // propped on posts, with a rail each side.
    {
      const [x, y0, z0, , y1, z1, w] = L.stairway, steps = Math.round((y1 - y0) / 0.32), run = (z1 - z0) / steps, rise = (y1 - y0) / steps;
      const heightAt = (z) => y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      for (let i = 0; i < steps; i++) {
        const top = y0 + rise * (i + 1), z = z0 + run * (i + 0.5);
        geos.push(bevelBox({ w: w - 0.1, h: 0.12, d: run + 0.03, color: i % 2 ? TIMBER : TIMBER_LT, bevel: 0.03, offset: { x, y: top - 0.06, z } }));
        geos.push(box({ w: w - 0.2, h: rise, d: 0.06, color: TIMBER_DK, offset: { x, y: top - rise / 2, z: z - run / 2 + 0.03 } }));
      }
      for (const s of [-1, 1]) {
        const sx = x + s * (w / 2 + 0.1);
        geos.push(beam(sx, y0 - 0.1, z0, sx, y1 - 0.1, z1, 0.3, TIMBER_DK));
        geos.push(beam(sx, y0 + 1.05, z0 - 0.2, sx, y1 + 1.05, z1, 0.14, TIMBER_LT), beam(sx, y0 + 0.6, z0 - 0.2, sx, y1 + 0.6, z1, 0.09, TIMBER));
        for (let z = z0 + 0.1; z < z1; z += 1.5) geos.push(bevelBox({ w: 0.16, h: 1.1, d: 0.16, color: TIMBER_DK, bevel: 0.03, offset: { x: sx, y: heightAt(z) + 0.5, z } }));
        for (const z of [z0 + (z1 - z0) * 0.45, z0 + (z1 - z0) * 0.8]) geos.push(bevelBox({ w: 0.36, h: heightAt(z), d: 0.36, color: TIMBER_DK, bevel: 0.06, offset: { x: sx, y: heightAt(z) / 2 - 0.2, z } }));
      }
    }
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) for (const g of stairParts(ax, ay, az, bx, by, bz, w)) geos.push(g);
    // The watchtower's deck joins the first gallery.
    bridge(L.lookout.x + L.lookout.w / 2, L.lookout.z - 1, L.galleries[0].x - L.galleries[0].w / 2, L.lookout.z - 1, LEVEL.top, 1.8);
    return merge(...geos);
  });

  // ---- the floor an Ooga walks --------------------------------------------------------------------------

  // Every surface in the hall with its height at a point: the pit floor, the decks, the balcony and its stairway, the
  // bridges, the core's walkway and the stairs. `supportAt(x, z, feet)` is the highest of them within a step of
  // the feet, the layered support the crew expects, so an Ooga on a deck stands on it and one on the pit floor
  // walks under it. `clearAt` keeps bodies out of what stands on the floors. Both allocate nothing.
  const STEP = 0.6;
  const FLOOR = cached(() => {
    const L = LAYOUT, rects = [], strips = [], blocks = [];
    const rect = (d, y = d.y) => rects.push(d.x - d.w / 2 + 0.15, d.x + d.w / 2 - 0.15, d.z - d.d / 2 + 0.15, d.z + d.d / 2 - 0.15, y);
    for (const d of [...L.bays, L.switchboard, L.rebalancer, L.treasury, L.lookout, ...L.galleries]) rect(d);
    rect(L.entrance);
    // Level 2's walkway and the porches, running a little into whatever they meet so a walker crosses over.
    const [[ax0, ax1, az0, az1], [bx0, bx1, bz0, bz1]] = L.walk, y2 = L.entrance.y;
    rects.push(ax0 - 0.3, ax1 + 0.3, az0 + 0.15, az1 - 0.15, y2, bx0 + 0.15, bx1 - 0.15, bz0 - 0.3, bz1 - 0.15, y2);
    for (const t of L.tunnels) {
      const [x0, x1, z0, z1] = porchOf(t);
      if (t.turn === 0) rects.push(x0 + 0.15, x1 - 0.15, z0, z1 + 0.3, t.y);
      else rects.push(x0 - 0.3, x1 + 0.3, z0 + 0.15, z1 - 0.15, t.y);
    }
    // A strip runs from one end to the other, `w` wide, rising from y0 to y1: bridges and stairs.
    const strip = (x0, y0, z0, x1, y1, z1, w) => strips.push(x0, z0, x1, z1, w / 2, y0, y1);
    const [gx, gy0, gz0, gx1, gy1, gz1, gw] = L.stairway;
    strip(gx, gy0, gz0, gx1, gy1, gz1, gw - 0.3);
    strip(gx1, gy1, gz1 - 0.1, gx1, gy1, gz1 + 0.4, gw - 0.3);
    strip(-6.4, LEVEL.main, -4, -9.1, LEVEL.main, -2.25, 1.9);
    strip(6.4, LEVEL.main, -4, 9.1, LEVEL.main, -2.25, 1.9);
    strip(L.lookout.x + L.lookout.w / 2 - 0.3, LEVEL.top, L.lookout.z - 1, L.galleries[0].x - L.galleries[0].w / 2 + 0.3, LEVEL.top, L.lookout.z - 1, 1.7);
    // Each stair runs half a metre on, flat, past both ends, so it meets the deck or floor it lands on.
    for (const [ax, ay, az, bx, by, bz, w] of L.stairs) {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len * 0.5, uz = (bz - az) / len * 0.5;
      strip(ax, ay, az, bx, by, bz, w - 0.2);
      strip(ax - ux, ay, az - uz, ax, ay, az, w - 0.2);
      strip(bx, by, bz, bx + ux, by, bz + uz, w - 0.2);
    }
    // What stands in the way, as circles [x, z, radius, from, to] between two heights of the feet.
    const block = (x, z, r, from, to) => blocks.push(x, z, r, from, to);
    block(L.core.x, L.core.z, 4.35, -1, LEVEL.main - 0.3);
    block(L.core.x, L.core.z, L.ring.inner, LEVEL.main - 0.3, HALL.h);
    for (const x of [-2.9, -2.2, -1, 0, 1, 2.2, 2.9]) block(L.forge.x + x, L.forge.z + 0.6, 0.75, -1, 4);
    block(L.forge.x + FORGE_TRACKS[1], FORGE_CART_Z, 0.8, -1, 1.5);
    for (const [x, z] of COILS) block(x, z, 0.45, LEVEL.main - 0.5, LEVEL.main + 2.5);
    for (const [x, z] of FORGE_STORES) block(x, z, 0.6, -1, 1.5);
    for (const [x, z, k] of OUTCROPS) block(x, z, 1.9 * k, -1, 5.6 * k);
    for (const b of L.bays) for (const x of [-1.2, 1.2]) block(b.x + x, b.z - STATION_BACK, 0.62, b.y - 0.5, b.y + 3);
    const sw = L.switchboard, rb = L.rebalancer, tr = L.treasury, lk = L.lookout;
    for (const x of [-1.6, 0, 1.6]) block(sw.x + x, sw.z - 0.6, 0.7, sw.y - 0.5, sw.y + 3);
    block(sw.x - 3, sw.z + 1.4, 0.75, sw.y - 0.5, sw.y + 2);
    block(rb.x, rb.z, 2.3, rb.y - 0.5, rb.y + 3);
    block(rb.x + 2.5, rb.z - 0.8, 0.7, rb.y - 0.5, rb.y + 2);
    block(tr.x - 2.2, tr.z - 1, 1.25, tr.y - 0.5, tr.y + 3);
    block(tr.x - 0.1, tr.z + 0.2, 1.2, tr.y - 0.5, tr.y + 1.5);
    block(tr.x + 2.1, tr.z - 0.6, 1.05, tr.y - 0.5, tr.y + 3);
    block(lk.x, lk.z, 1.35, lk.y - 0.5, lk.y + 6);
    // The peer tunnels' portals and the study hall's locked door.
    for (const t of L.tunnels) block(t.x + Math.sin(t.turn) * -0.6, t.z - Math.cos(t.turn) * 0.6, 1, t.y - 0.5, t.y + 5);
    block(L.study.x + 0.4, L.study.z, 1.2, L.study.y - 0.5, L.study.y + 5);
    return { rects: new Float32Array(rects), strips: new Float32Array(strips), blocks: new Float32Array(blocks), ring: L.ring };
  });
  const supportAt = (x, z, feet) => {
    const F = FLOOR(), reach = feet + STEP;
    let best = 0;
    const R = F.rects;
    for (let i = 0; i < R.length; i += 5) {
      const y = R[i + 4];
      if (y > best && y <= reach && x >= R[i] && x <= R[i + 1] && z >= R[i + 2] && z <= R[i + 3]) best = y;
    }
    const S = F.strips;
    for (let i = 0; i < S.length; i += 7) {
      const x0 = S[i], z0 = S[i + 1], dx = S[i + 2] - x0, dz = S[i + 3] - z0, len2 = dx * dx + dz * dz;
      const t = ((x - x0) * dx + (z - z0) * dz) / len2;
      if (t < 0 || t > 1) continue;
      const px = x0 + dx * t - x, pz = z0 + dz * t - z;
      if (px * px + pz * pz > S[i + 4] * S[i + 4]) continue;
      const y = S[i + 5] + (S[i + 6] - S[i + 5]) * t;
      if (y > best && y <= reach) best = y;
    }
    // The core's walkway: the ring of planks round the chamber's foot.
    const r = F.ring, d = Math.hypot(x - r.x, z - r.z);
    if (r.y > best && r.y <= reach && d >= r.inner + 0.1 && d <= r.outer - 0.2) best = r.y;
    return best;
  };
  const clearAt = (x, z, feet, radius) => {
    if (Math.abs(x) > HALL.halfW - 2 || z < HALL.back + 2 || z > HALL.front - 0.4) return false;
    const B = FLOOR().blocks;
    for (let i = 0; i < B.length; i += 5) {
      if (feet < B[i + 3] || feet > B[i + 4]) continue;
      const dx = x - B[i], dz = z - B[i + 1], r = B[i + 2] + radius;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };

  // ---- the node core ------------------------------------------------------------------------------------

  // The stone plinth from the pit to the walkway, the power drum above the walkway with its lava seams and blue
  // lamps, the chamber's bronze ribs and brass rings, the stepped crown with its windows, the lantern's cage, and
  // the chains that hold it all to the vault. The glass, the bolts and the lantern's flame are `coreChamber`, so
  // the scene can light and dim them.
  const coreBody = cached(() => {
    const c = LAYOUT.core, [lo, hi] = c.chamber, M = LEVEL.main, round = [], flat = [];
    round.push(turn([[4.2, 0], [4.2, 0.5], [3.9, 0.7], [3.4, 0.9], [3.3, M - 0.6], [3.65, M - 0.35], [3.65, M - 0.2], [0, M - 0.2]], 20, (t) => t < 0.3 ? STONE[3] : STONE[2]));
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU;
      if (Math.abs(Math.sin(a) - 1) < 0.1) continue;
      flat.push(moved(turnedY(bevelBox({ w: 0.9, h: M - 1.2, d: 0.6, color: STONE_DK, bevel: 0.1 }), -a + Math.PI / 2), Math.cos(a) * 3.5, (M - 1.2) / 2 + 0.6, Math.sin(a) * 3.5));
    }
    round.push(turn([[3.25, M - 0.2], [3.3, M + 0.1], [3.08, M + 0.22], [3.08, lo - 0.34], [3.24, lo - 0.22], [3.24, lo], [0, lo]], 28, BRONZE_DK));
    // A seam of lava zigzagging round the drum, with short cracks running off it, and a ring of blue lamps over it.
    const rand = mulberry32(77), seam = 56, at = (a, y) => [Math.cos(a) * 3.1, y, Math.sin(a) * 3.1];
    for (let k = 0; k < seam; k++) {
      const a0 = k / seam * TAU, a1 = (k + 1) / seam * TAU, y0 = M + 0.42 + (k % 2 ? 0.12 : -0.1) + rand() * 0.05, y1 = M + 0.42 + ((k + 1) % 2 ? 0.12 : -0.1);
      flat.push(beam(...at(a0, y0), ...at(a1, y1), 0.075, "#ff8a2a", 1));
      if (k % 4 === 1) flat.push(beam(...at(a0, y0), ...at(a0 + (rand() - 0.5) * 0.12, y0 + (rand() < 0.5 ? -0.3 : 0.3)), 0.05, "#ffb040", 1));
    }
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * TAU;
      round.push(moved(ball(0.1, "#5fc0ff", 1, 8), Math.cos(a) * 3.1, lo - 0.55, Math.sin(a) * 3.1));
    }
    for (const y of [lo, hi]) round.push(moved(torus(2.7, 0.2, BRASS, 0, 32, 8), 0, y, 0));
    // Eight heavy riveted ribs up the glass, set so the four bolts look out between them.
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * TAU, r = 2.72;
      flat.push(moved(turnedY(bevelBox({ w: 0.42, h: hi - lo + 0.2, d: 0.36, color: BRONZE, bevel: 0.07 }), -a + Math.PI / 2), Math.cos(a) * r, (lo + hi) / 2, Math.sin(a) * r));
      for (let y = lo + 0.35; y < hi - 0.2; y += 0.5) round.push(moved(ball(0.065, BRASS, 0, 6), Math.cos(a) * (r + 0.19), y, Math.sin(a) * (r + 0.19)));
    }
    // A ring of blue lamps round the edge of the walkway the core stands in.
    const ring = LAYOUT.ring;
    for (let k = 0; k < 40; k++) {
      const a = (k + 0.5) / 40 * TAU;
      round.push(moved(ball(0.075, "#5fc0ff", 1, 6), Math.cos(a) * (ring.outer + 0.03), ring.y - 0.12, Math.sin(a) * (ring.outer + 0.03)));
    }
    // The crown: three stepped tiers of copper, each with a band of lit windows, up to the lantern's base.
    round.push(turn([[2.95, hi], [3.12, hi + 0.25], [3.12, hi + 0.6], [2.72, hi + 0.8], [2.72, hi + 1.35], [2.24, hi + 1.55], [2.24, hi + 2.05],
      [1.64, hi + 2.25], [1.64, hi + 2.75], [1.0, hi + 2.95], [0.75, hi + 3.1], [0, hi + 3.1]], 28, (t) => t < 0.3 ? COPPER : t < 0.6 ? COPPER_DK : COPPER));
    for (const [r, y, n] of [[2.73, hi + 1.07, 14], [2.25, hi + 1.8, 12], [1.65, hi + 2.5, 9]]) {
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * TAU;
        flat.push(moved(turnedY(box({ w: 0.36, h: 0.28, d: 0.06, color: "#ffb347", emissive: 0.95 }), -a + Math.PI / 2), Math.cos(a) * r, y, Math.sin(a) * r));
      }
    }
    // The lantern: a brass base, six bars of cage round the flame and a copper dome with a finial.
    round.push(turn([[0.82, hi + 3.1], [0.82, hi + 3.28], [0.66, hi + 3.36], [0, hi + 3.36]], 16, BRASS));
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      flat.push(bevelBox({ w: 0.1, h: 1.2, d: 0.1, color: BRASS, bevel: 0.02, offset: { x: Math.cos(a) * 0.62, y: hi + 3.96, z: Math.sin(a) * 0.62 } }));
    }
    round.push(turn([[0.86, hi + 4.52], [0.86, hi + 4.64], [0.34, hi + 5.1], [0.14, hi + 5.5], [0, hi + 5.56]], 16, COPPER_DK));
    round.push(moved(ball(0.16, BRASS, 0, 10), 0, hi + 5.66, 0));
    // Chains up to the vault from the crown.
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * TAU, x = Math.cos(a) * 1.9, z = Math.sin(a) * 1.9;
      round.push(...chain(x, hi + 2.1, z, x * 1.4, HALL.h, z * 1.4, 0.2));
    }
    return moved(shaded(round, flat), c.x, 0, c.z);
  });
  // The glass chamber, the four bolts on it and the lantern's flame: lit while the node runs, dark when it stops.
  const coreChamber = cached(() => {
    const c = LAYOUT.core, [lo, hi] = c.chamber, mid = (lo + hi) / 2;
    const build = (lit) => {
      const glass = turn([[2.44, lo], [2.5, lo + 0.45], [2.53, lo + 1.5], [2.53, hi - 1.5], [2.5, hi - 0.45], [2.44, hi]], 32,
        (t) => lit ? (t < 0.15 || t > 0.8 ? "#d65a1a" : t < 0.35 || t > 0.6 ? "#f5822c" : "#ffa640") : "#3a2418", lit ? 0.8 : 0.12);
      const flame = turn([[0.3, hi + 3.36], [0.42, hi + 3.8], [0.36, hi + 4.25], [0, hi + 4.5]], 14, lit ? "#ffe08a" : "#4a3420", lit ? 1 : 0.1);
      const bolts = [0, 1, 2, 3].map((k) => turnedY(moved(smoothBolt(3.6, 0.3, lit ? "#fff4c0" : "#6a4a2a", lit ? 1 : 0.15), 0, mid, 2.66), k * Math.PI / 2));
      // Molten cracks running out from behind each bolt across its window, as the concept's glass has them.
      const rand = mulberry32(501), cracks = [];
      for (let k = 0; k < 4; k++) for (let n = 0; n < 9; n++) {
        let u = (rand() - 0.5) * 0.9, v = (rand() - 0.5) * 2.6;
        const du = Math.sign(u || 1) * (0.5 + rand() * 0.5), dv = (rand() - 0.5) * 0.8;
        for (let seg = 0; seg < 3; seg++) {
          const u1 = Math.max(-0.82, Math.min(0.82, u + du * (0.22 + rand() * 0.18))), v1 = v + dv * 0.3 + (rand() - 0.5) * 0.3;
          cracks.push(turnedY(beam(u, mid + v, 2.57, u1, mid + v1, 2.57, 0.045, lit ? "#ffe89a" : "#5a3018", lit ? 1 : 0.1), k * Math.PI / 2));
          u = u1; v = v1;
        }
      }
      return noShadow(moved(shaded([glass, flame], [...bolts, ...cracks]), c.x, 0, c.z));
    };
    return { lit: build(true), dark: build(false) };
  });
  // Conduits from each featured line's capacitors to the chamber: a thick copper pipe with brass flanges along it,
  // a row of blue lamps down its back, and a brass sleeve where it leaves the line and where it meets the chamber.
  // The path the sats ride is sampled once so the scene only reads it.
  const CONDUIT_SAMPLES = 48;
  const conduitPath = (bay) => {
    const c = LAYOUT.core, side = Math.sign(bay.x), [lo, hi] = c.chamber;
    const ax = bay.x - side * (bay.w / 2 - 1.2), ay = bay.y + 1.6, az = bay.z - STATION_BACK + 0.2;
    const bx = c.x + side * 2.62, by = bay.y > LEVEL.main ? hi - 0.9 : lo + 1.2, bz = c.z + (bay.z < c.z ? -0.6 : 0.6);
    const lift = bay.y > LEVEL.main ? 0.8 : 2.2;
    return (t) => {
      const u = 1 - t;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = Math.max(ay, by) + lift;
      return { x: u * u * ax + 2 * u * t * mx + t * t * bx, y: u * u * ay + 2 * u * t * my + t * t * by, z: u * u * az + 2 * u * t * mz + t * t * bz };
    };
  };
  const conduits = cached(() => {
    const round = [], lamps = [], paths = [];
    for (const bay of LAYOUT.bays) {
      const path = conduitPath(bay), samples = new Float32Array((CONDUIT_SAMPLES + 1) * 3);
      let length = 0;
      for (let i = 0; i <= CONDUIT_SAMPLES; i++) {
        const p = path(i / CONDUIT_SAMPLES);
        samples[i * 3] = p.x; samples[i * 3 + 1] = p.y + 0.3; samples[i * 3 + 2] = p.z;
        if (i) length += Math.hypot(p.x - samples[i * 3 - 3], p.y + 0.3 - samples[i * 3 - 2], p.z - samples[i * 3 - 1]);
      }
      paths.push(samples);
      round.push(tube({ path, radius: () => 0.36, rings: 48, segments: 14, colorFn: () => COPPER }));
      const at = (t, build) => {
        const p = path(t), a = path(Math.max(0, t - 0.01)), b = path(Math.min(1, t + 0.01));
        return along(build(), p.x, p.y, p.z, b.x - a.x, b.y - a.y, b.z - a.z);
      };
      const flanges = Math.max(2, Math.round(length / 1.5));
      for (let i = 1; i < flanges; i++) round.push(at(i / flanges, () => turn([[0.36, -0.1], [0.46, -0.1], [0.5, -0.06], [0.5, 0.06], [0.46, 0.1], [0.36, 0.1]], 16, BRASS)));
      for (const t of [0.03, 0.97]) round.push(at(t, () => turn([[0.36, -0.3], [0.52, -0.3], [0.56, -0.24], [0.56, 0.24], [0.52, 0.3], [0.36, 0.3]], 16, BRONZE)));
      // Blue lamps along the pipe's back, where the concept strings its lights.
      const lampsOn = Math.round(length / 0.75);
      for (let i = 1; i < lampsOn; i++) {
        const t = i / lampsOn, p = path(t), a = path(Math.max(0, t - 0.01)), b = path(Math.min(1, t + 0.01));
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const dl = Math.hypot(dx, dy, dz);
        dx /= dl; dy /= dl; dz /= dl;
        let ux = -dy * dx, uy = 1 - dy * dy, uz = -dy * dz;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        lamps.push(moved(ball(0.11, i % 3 ? "#58b8ff" : "#9fe0ff", 1, 8), p.x + ux * 0.38, p.y + uy * 0.38, p.z + uz * 0.38));
      }
    }
    return { pipe: shaded(round), glow: noShadow(shaded(lamps)), paths };
  });
  // A sat: a small faceted gold gem, drawn by the hundred as one instanced batch.
  const sat = cached(() => noShadow(lathe({ profile: [[0, -0.2], [0.17, -0.02], [0.14, 0.08], [0, 0.2]], segments: 6, color: GOLD, emissive: 0.85 })));

  // ---- a featured line ----------------------------------------------------------------------------------

  // A line's standing parts, facing +z at its deck's centre: the turned bronze feet and caps of its two
  // capacitors with their brass cages, a riveted iron back plate that the glass glows against, bronze posts and a
  // beam over them, and a copper pipe arching between the terminals. The glass itself is `capacitor`, which flashes.
  const stationFrame = cached(() => {
    const round = [], flat = [];
    for (const x of [-1.2, 1.2]) {
      round.push(moved(turn([[0.76, 0], [0.76, 0.22], [0.68, 0.3], [0.68, 0.46], [0.6, 0.52], [0, 0.52]], 18, BRONZE), x, 0, 0));
      round.push(moved(turn([[0.6, 3.08], [0.7, 3.14], [0.7, 3.36], [0.58, 3.46], [0.3, 3.56], [0, 3.58]], 18, BRONZE), x, 0, 0));
      round.push(moved(turn([[0.12, 3.56], [0.12, 3.8], [0.2, 3.85], [0.2, 3.96], [0, 3.98]], 10, BRASS), x, 0, 0));
      for (const y of [0.62, 2.98]) round.push(moved(torus(0.62, 0.06, BRASS, 0, 18, 6), x, y, 0));
      for (const a of [0.75, 2.4, 3.9, 5.5]) flat.push(bevelBox({ w: 0.07, h: 2.5, d: 0.07, color: BRASS, bevel: 0.015, offset: { x: x + Math.cos(a) * 0.66, y: 1.8, z: Math.sin(a) * 0.66 } }));
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * TAU;
        round.push(moved(ball(0.035, BRASS, 0, 6), x + Math.cos(a) * 0.71, 3.25, Math.sin(a) * 0.71), moved(ball(0.035, BRASS, 0, 6), x + Math.cos(a) * 0.69, 0.38, Math.sin(a) * 0.69));
      }
      [-0.26, 0, 0.26].forEach((dx, i) => round.push(moved(ball(0.055, ["#5fc0ff", "#6fff9a", "#ffc83a"][i], 1, 8), x + dx, 0.14, 0.75)));
    }
    flat.push(bevelBox({ w: 4.1, h: 3.5, d: 0.16, color: IRON_DK, bevel: 0.05, offset: { y: 1.95, z: -0.9 } }));
    for (let i = 0; i < 12; i++) for (const y of [0.3, 3.6]) flat.push(box({ w: 0.08, h: 0.08, d: 0.05, color: BRASS, offset: { x: -1.9 + i * 0.345, y, z: -0.8 } }));
    for (const x of [-2.3, 2.3]) flat.push(bevelBox({ w: 0.34, h: 4.2, d: 0.34, color: BRONZE, bevel: 0.06, offset: { x, y: 2.1, z: -0.6 } }));
    flat.push(bevelBox({ w: 5, h: 0.32, d: 0.42, color: BRONZE_DK, bevel: 0.06, offset: { y: 4.1, z: -0.6 } }));
    round.push(tube({ path: (t) => ({ x: -1.2 + 2.4 * t, y: 3.95 + Math.sin(Math.PI * t) * 0.3, z: 0 }), radius: () => 0.1, rings: 16, segments: 8, colorFn: () => COPPER }));
    return shaded(round, flat);
  });
  // A capacitor's glass with a bolt on its face, dim at rest and lit for a flash; the scene swaps the two.
  // The glass has a halo of its own colour behind the bolt, a shine down its left and bubbles rising in it.
  const capacitor = cached(() => {
    const build = (tone, lit) => {
      const [edge, core] = lit ? tone.lit : tone.dim, rand = mulberry32(tone === CAP_BLUE ? 7 : 8);
      const glass = turn([[0.55, 0.52], [0.6, 0.95], [0.62, 1.8], [0.6, 2.65], [0.55, 3.08]], 20, (t) => t > 0.2 && t < 0.75 ? core : edge, lit ? 1 : 0.7);
      const flat = [moved(smoothBolt(2, 0.05, tone.halo, lit ? 1 : 0.75), 0, 1.82, 0.64), moved(smoothBolt(1.62, 0.12, lit ? "#ffffff" : "#f6eedc", lit ? 1 : 0.85), 0, 1.8, 0.7)];
      flat.push(moved(turnedY(box({ w: 0.07, h: 1.9, d: 0.02, color: "#ffffff", emissive: lit ? 1 : 0.55 }), -0.62), Math.sin(-0.62) * 0.63, 1.85, Math.cos(-0.62) * 0.63));
      const round = [glass];
      for (let i = 0; i < 9; i++) {
        const a = (rand() - 0.5) * 1.9, y = 0.75 + rand() * 2.15, r = 0.03 + rand() * 0.035;
        round.push(moved(ball(r, tone.halo, lit ? 1 : 0.7, 6), Math.sin(a) * 0.62, y, Math.cos(a) * 0.62));
      }
      return noShadow(shaded(round, flat));
    };
    return {
      blue: { dim: build(CAP_BLUE, false), lit: build(CAP_BLUE, true) },
      orange: { dim: build(CAP_ORANGE, false), lit: build(CAP_ORANGE, true) }
    };
  });

  // ---- the stations ---------------------------------------------------------------------------------

  // The on-chain forge in the core's foot: an arch of voussoirs in two rings with a keystone, on brick piers, with a
  // brass rim round the furnace mouth, and two tracks running out of it toward the stairway. The furnace's glowing
  // face, the ring of heat round it, its flames and its Bitcoin sign are `forgeFire`, lit hotter when a line is
  // opened or closed on chain.
  const FORGE_TRACKS = [-0.95, 0.95], FORGE_CART_Z = 4.6;
  // The stores by the forge, [x, z]: between its tracks and the stairs up to the core's walkway, clear of both.
  const FORGE_STORES = [[-2.5, 3.4], [2.5, 2.8], [-2.5, 5], [2.5, 4.6], [2.3, 6.2]];
  const forge = cached(() => {
    const f = LAYOUT.forge, geos = [], cy = 1.9;
    for (const [r, n, depth, z] of [[2.25, 12, 1.3, 0], [2.95, 16, 1, -0.15]]) for (let k = 0; k <= n; k++) {
      const a = Math.PI * k / n, key = k === n / 2, w = r * Math.PI / n * 0.9;
      geos.push(moved(turnedZ(bevelBox({ w: key ? w * 1.35 : w, h: key ? 0.9 : 0.64, d: key ? depth + 0.2 : depth, color: key ? ROCK_LT : k % 2 ? STONE[0] : STONE[2], bevel: 0.08 }), a - Math.PI / 2), Math.cos(a) * r, cy + Math.sin(a) * r, z));
    }
    for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (const [x, d, z] of [[2.25, 1.3, 0], [2.95, 1, -0.15]]) {
      geos.push(bevelBox({ w: 0.64, h: 0.6, d, color: (row + (x < 2.5 ? 0 : 1)) % 2 ? STONE[1] : STONE[3], bevel: 0.08, offset: { x: s * x, y: 0.31 + row * 0.63, z } }));
    }
    geos.push(bevelBox({ w: 3.8, h: 3.4, d: 0.4, color: "#1e120c", bevel: 0.06, offset: { y: 1.7, z: -0.6 } }));
    for (const tx of FORGE_TRACKS) {
      for (const x of [-0.45, 0.45]) geos.push(box({ w: 0.08, h: 0.08, d: 11.5, color: IRON_LT, offset: { x: tx + x, y: 0.12, z: 5.75 } }));
      for (let z = 0; z < 11.3; z += 0.5) geos.push(box({ w: 1.25, h: 0.07, d: 0.2, color: TIMBER_DK, offset: { x: tx, y: 0.04, z } }));
    }
    const rim = tube({ path: (t) => ({ x: Math.cos(Math.PI * t) * 1.9, y: cy + Math.sin(Math.PI * t) * 1.9, z: 0.45 }), radius: () => 0.13, rings: 28, segments: 8, colorFn: () => BRASS });
    return moved(shaded([rim], geos), f.x, 0, f.z);
  });
  // A flame: a teardrop of orange with a smaller one of yellow in front of it.
  const FLAME = [[0, 1], [-0.24, 0.42], [-0.2, 0.12], [0, 0], [0.2, 0.12], [0.24, 0.42]];
  const flame = (h, x, y, z, hot) => [
    moved(prism(FLAME.map(([u, v]) => [u * h, v * h]), 0.08, hot ? "#ff7a1e" : "#e0561a", 1), x, y, z),
    moved(prism(FLAME.map(([u, v]) => [u * h * 0.55, v * h * 0.6]), 0.08, hot ? "#ffe890" : "#ffb040", 1), x, y, z + 0.06)
  ];
  const forgeFire = cached(() => {
    const f = LAYOUT.forge;
    const build = (hot) => {
      const face = forwardLathe(turn([[1.66, 0], [1.66, 0.12], [1.3, 0.28], [0.7, 0.36], [0, 0.38]], 28,
        (t) => hot ? (t < 0.3 ? "#e8500e" : t < 0.6 ? "#ff6e18" : "#ff8a24") : (t < 0.3 ? "#9a360c" : t < 0.6 ? "#c84a12" : "#dc5a16"), hot ? 1 : 0.85));
      const heat = forwardLathe(torus(1.76, 0.1, hot ? "#ffd868" : "#ff9a38", 1, 36, 8));
      const floor = turn([[1.5, 0.03], [0, 0.04]], 24, hot ? "#ff8a24" : "#c84a12", hot ? 0.9 : 0.6);
      const sign = smoothBitcoin(2.3, 0.24, hot ? "#fff2b8" : "#ffd98a", 1);
      const flames = [[-1.05, 0.55], [-0.55, 0.75], [0, 0.62], [0.55, 0.78], [1.05, 0.52]].flatMap(([x, h]) => flame(hot ? h * 1.25 : h, x, 0.22, 0.32, hot));
      return noShadow(moved(shaded([moved(face, 0, 1.9, -0.36), moved(heat, 0, 1.9, -0.2), moved(floor, 0, 0, 1.4)], [moved(sign, 0, 1.9, 0.14), ...flames]), f.x, 0, f.z));
    };
    return { hot: build(true), warm: build(false) };
  });
  // A Tesla coil for the core's walkway: a turned bronze foot, copper wound up a dark column, a brass toroid on top
  // and sparks leaping off it.
  const COILS = [[-3.85, -2.6], [3.85, -2.6]];
  const teslaCoil = cached(() => shaded([
    turn([[0.42, 0], [0.42, 0.18], [0.3, 0.26], [0.3, 0.4], [0, 0.4]], 16, BRONZE),
    turn([[0.15, 0.4], [0.15, 2.1], [0, 2.1]], 12, IRON_DK),
    tube({ path: (t) => ({ x: Math.cos(t * TAU * 10) * 0.19, y: 0.5 + t * 1.5, z: Math.sin(t * TAU * 10) * 0.19 }), radius: () => 0.035, rings: 200, segments: 5, colorFn: () => COPPER }),
    moved(torus(0.34, 0.12, BRASS, 0, 22, 8), 0, 2.22, 0)
  ], [moved(smoothBolt(0.8, 0.05, "#fff4b0", 1), 0.4, 2.62, 0), moved(turnedY(smoothBolt(0.6, 0.05, "#bff8ff", 1), 1.4), -0.34, 2.56, 0.12)]));
  // A cart for the forge's track: the mine's own, loaded with gold.
  const cart = cached(() => merge(BL.mineModels.hubCart(), ...[[-0.25, -0.3], [0.2, -0.2], [-0.1, 0.25], [0.3, 0.3], [0, 0]].map(([x, z]) => box({ w: 0.3, h: 0.24, d: 0.3, color: GOLD, emissive: 0.6, offset: { x, y: 1.02, z } }))));

  // The switchboard: a timber desk with a brass top, its front studded with lit buttons, three keyboards on it,
  // and a curved bank of seven monitors on stands behind, where forwards are routed; a cart of gold beside it, as
  // in the concept. Each monitor is [x, y, width, height, turn]; its lit face is `switchScreens`.
  const MONITORS = [[-2.05, 1.72, 1.2, 0.78, 0.26], [-0.7, 1.72, 1.2, 0.78, 0.08], [0.7, 1.72, 1.2, 0.78, -0.08], [2.05, 1.72, 1.2, 0.78, -0.26],
    [-1.42, 2.72, 1.2, 0.78, 0.16], [0, 2.8, 1.46, 0.95, 0], [1.42, 2.72, 1.2, 0.78, -0.16]];
  const monitorAt = (geo, [x, y, , , turned]) => moved(turnedY(geo, turned), x, y, -1.05 + Math.abs(turned) * 0.9);
  const switchboard = cached(() => {
    const geos = [];
    geos.push(bevelBox({ w: 5.2, h: 1, d: 1.3, color: TIMBER_DK, bevel: 0.08, offset: { y: 0.5, z: -0.5 } }));
    geos.push(bevelBox({ w: 5.4, h: 0.12, d: 1.45, color: BRASS, bevel: 0.03, offset: { y: 1.06, z: -0.5 } }));
    for (let i = 0; i < 14; i++) {
      const tone = ["#ff5a3a", "#5fe36a", "#ffc83a", "#5fb8ff"][i % 4];
      geos.push(box({ w: 0.14, h: 0.1, d: 0.05, color: tone, emissive: 0.95, offset: { x: -2.2 + i * 0.34, y: 0.78, z: 0.17 } }));
    }
    for (const x of [-1.5, 0, 1.5]) {
      geos.push(bevelBox({ w: 1.1, h: 0.08, d: 0.4, color: IRON_DK, bevel: 0.02, offset: { x, y: 1.16, z: -0.15 } }));
      for (let r = 0; r < 3; r++) geos.push(box({ w: 0.9, h: 0.02, d: 0.06, color: "#c8d8e8", emissive: 0.3, offset: { x, y: 1.21, z: -0.27 + r * 0.11 } }));
    }
    for (const m of MONITORS) {
      geos.push(monitorAt(bevelBox({ w: m[2] + 0.14, h: m[3] + 0.14, d: 0.14, color: IRON_DK, bevel: 0.04 }), m));
      geos.push(monitorAt(box({ w: 0.12, h: m[1] - 1.1, d: 0.12, color: IRON, offset: { y: -(m[1] - 1.1) / 2, z: -0.1 } }), m));
    }
    geos.push(moved(merge(BL.mineModels.hubCart()), -3, 0, 1.4));
    return merge(...geos);
  });
  // The monitors' faces, dim and busy: a forward routed through the board lights them. The middle one draws the
  // routes, nodes joined by lines; the rest scroll text.
  const switchScreens = cached(() => {
    const build = (busy) => {
      const geos = [];
      MONITORS.forEach((m, i) => {
        const [, , w, h] = m, tone = i % 3 === 0 ? "#3fa7ff" : i % 3 === 1 ? "#5fe3ff" : "#2f8fe6";
        geos.push(monitorAt(box({ w, h, d: 0.03, color: busy ? tone : "#1f4a70", emissive: busy ? 0.95 : 0.7, offset: { z: 0.08 } }), m));
        if (i === 5) {
          const nodes = [[-0.5, 0.25], [-0.15, -0.2], [0.2, 0.28], [0.52, -0.1], [-0.45, -0.3], [0.1, 0.02]];
          for (const [ax, ay] of nodes) for (const [bx, by] of nodes) if (ax < bx && Math.hypot(bx - ax, by - ay) < 0.55) geos.push(monitorAt(beam(ax, ay, 0.1, bx, by, 0.1, 0.025, busy ? "#e8fbff" : "#8fc0e0", 1), m));
          for (const [x, y] of nodes) geos.push(monitorAt(box({ w: 0.09, h: 0.09, d: 0.02, color: busy ? "#ffe07a" : "#e8c860", emissive: 1, offset: { x, y, z: 0.11 } }), m));
        } else for (let k = 0; k < 4; k++) {
          const lw = 0.25 + ((i * 3 + k) % 4) * 0.17;
          geos.push(monitorAt(box({ w: lw, h: 0.06, d: 0.02, color: busy ? "#e8fbff" : "#8fc0e0", emissive: 1, offset: { x: -w / 2 + 0.12 + lw / 2, y: h / 2 - 0.15 - k * 0.16, z: 0.1 } }), m));
        }
      });
      return noShadow(merge(...geos));
    };
    return { calm: build(false), busy: build(true) };
  });
  // The rebalancer: a stepped round platform ringed in cyan light, with lit rings on its dark glass top and a lens
  // in the middle, four pylons round it and a console beside it. `rebalancerRing` hovers over it and spins while
  // the gorillas run it: a ring of light with three arrows chasing round it, and a column of light when it runs.
  const rebalancerBase = cached(() => {
    const round = [
      turn([[2.25, 0], [2.25, 0.2], [2.1, 0.3], [2.1, 0.45], [1.95, 0.52], [1.82, 0.52], [1.82, 0.56], [0, 0.56]], 32, (t) => t > 0.7 ? "#15323f" : IRON),
      moved(torus(2.13, 0.08, "#5fe3ff", 0.95, 36, 8), 0, 0.46, 0),
      moved(torus(1.5, 0.035, "#7ff0ff", 0.9, 32, 6), 0, 0.57, 0), moved(torus(1.05, 0.035, "#7ff0ff", 0.9, 28, 6), 0, 0.57, 0), moved(torus(0.66, 0.03, "#bff8ff", 1, 24, 6), 0, 0.57, 0),
      turn([[0.46, 0.56], [0.44, 0.74], [0.3, 0.88], [0, 0.94]], 18, "#a6f6ff", 1)
    ], flat = [];
    for (let k = 0; k < 4; k++) {
      const a = (k + 0.5) / 4 * TAU, x = Math.cos(a) * 1.98, z = Math.sin(a) * 1.98;
      round.push(moved(turn([[0.15, 0.5], [0.15, 1.45], [0.22, 1.52], [0.22, 1.6], [0, 1.62]], 10, BRONZE), x, 0, z), moved(ball(0.13, "#7ff0ff", 1, 10), x, 1.74, z));
    }
    flat.push(bevelBox({ w: 1.2, h: 1.05, d: 0.8, color: IRON_DK, bevel: 0.08, offset: { x: 2.5, y: 0.52, z: -0.8 } }));
    flat.push(box({ w: 0.95, h: 0.55, d: 0.05, color: "#5fe3ff", emissive: 0.95, offset: { x: 2.5, y: 1.2, z: -0.42 } }));
    flat.push(bevelBox({ w: 1.05, h: 0.7, d: 0.1, color: IRON, bevel: 0.03, offset: { x: 2.5, y: 1.2, z: -0.5 } }));
    return shaded(round, flat);
  });
  const rebalancerRing = cached(() => {
    const build = (on) => {
      const lit = on ? "#9ff6ff" : "#2d8fa6", e = on ? 1 : 0.55, round = [torus(1.55, 0.1, lit, e, 40, 8), torus(1.02, 0.05, lit, e * 0.9, 32, 6)], flat = [];
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU, x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55, tx = -Math.sin(a), tz = Math.cos(a);
        for (const s of [-1, 1]) flat.push(beam(x - tx * 0.32 + Math.cos(a) * s * 0.22, 0, z - tz * 0.32 + Math.sin(a) * s * 0.22, x + tx * 0.08, 0, z + tz * 0.08, 0.1, on ? "#ffffff" : "#6fc8dc", e));
        flat.push(beam(Math.cos(a) * 1.02, 0, Math.sin(a) * 1.02, Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0.05, lit, e));
      }
      if (on) round.push(turn([[0.1, -0.35], [0.1, 1.3], [0, 1.36]], 10, "#dffcff", 1));
      return noShadow(shaded(round, flat));
    };
    return { on: build(true), off: build(false) };
  });
  // The treasury: an iron vault with a round door and its wheel, and the fee hopper on its legs. The vault stands
  // at the deck's left, the hopper at its right; the heap of gold between them is `goldPile`.
  const HOPPER = { x: 2.1, z: -0.6, y: 2.4 };
  const treasuryBody = cached(() => {
    const round = [
      moved(forwardLathe(turn([[0.74, 0], [0.74, 0.1], [0.62, 0.16], [0, 0.18]], 24, BRONZE)), -2.2, 1.25, -0.1),
      moved(forwardLathe(torus(0.34, 0.05, BRASS, 0, 20, 6)), -2.2, 1.25, 0.14),
      moved(ball(0.1, BRASS, 0, 10), -2.2, 1.25, 0.14),
      moved(turn([[0.28, 1], [0.3, 1.2], [1, HOPPER.y], [1.08, HOPPER.y + 0.05], [1.08, HOPPER.y + 0.24], [0.98, HOPPER.y + 0.24]], 18, COPPER), HOPPER.x, 0, HOPPER.z),
      moved(turn([[0.3, 0.7], [0.3, 1], [0, 1]], 12, BRASS), HOPPER.x, 0, HOPPER.z)
    ];
    const flat = [
      bevelBox({ w: 2.2, h: 2.4, d: 1.8, color: IRON, bevel: 0.1, offset: { x: -2.2, y: 1.2, z: -1 } }),
      ...[-1, 1].map((s) => bevelBox({ w: 0.16, h: 2.5, d: 0.16, color: BRASS, bevel: 0.03, offset: { x: -2.2 + s * 1.08, y: 1.2, z: -0.1 } })),
      ...[0, 1, 2].map((k) => {
        const a = k / 3 * TAU;
        return beam(-2.2, 1.25, 0.14, -2.2 + Math.cos(a) * 0.34, 1.25 + Math.sin(a) * 0.34, 0.14, 0.05, BRASS);
      }),
      ...[0, 1, 2].map((k) => {
        const a = k / 3 * TAU, x = HOPPER.x + Math.cos(a) * 0.9, z = HOPPER.z + Math.sin(a) * 0.9;
        return beam(x, 0, z, x, HOPPER.y, z, 0.12, IRON_DK);
      })
    ];
    return shaded(round, flat);
  });
  // The gold heap: a glowing mound of coins and bars at unit size, scaled by the scene to the node's public
  // capacity: a dome of gold under coins lying every way, stacks round its foot and bars on top.
  const goldPile = cached(() => {
    const rand = mulberry32(88), round = [turn([[1.2, 0], [0.95, 0.32], [0.55, 0.68], [0, 0.82]], 18, "#d9a52a", 0.4)], flat = [];
    const coin = () => turn([[0.16, -0.025], [0.16, 0.025], [0.13, 0.03], [0, 0.03]], 12, rand() < 0.3 ? "#ffe07a" : GOLD, 0.6);
    const tilt = (geo, a) => {
      const v = geo.verts, c = Math.cos(a), sn = Math.sin(a);
      for (let i = 0; i < v.length; i += 3) { const y = v[i + 1], z = v[i + 2]; v[i + 1] = y * c - z * sn; v[i + 2] = y * sn + z * c; }
      return geo;
    };
    for (let i = 0; i < 80; i++) {
      const r = Math.sqrt(rand()) * 1.15, a = rand() * TAU, y = Math.max(0.03, 0.82 * (1 - (r / 1.2) ** 1.6));
      round.push(moved(turnedY(tilt(coin(), (rand() - 0.5) * 1.2), rand() * TAU), Math.cos(a) * r, y, Math.sin(a) * r));
    }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + 0.3, r = 1.3, n = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) round.push(moved(coin(), Math.cos(a) * r + (rand() - 0.5) * 0.02, 0.03 + k * 0.058, Math.sin(a) * r));
    }
    for (let i = 0; i < 9; i++) {
      const a = rand() * TAU, r = rand() * 0.6;
      flat.push(moved(turnedY(bevelBox({ w: 0.44, h: 0.13, d: 0.2, color: "#ffd24a", emissive: 0.6, bevel: 0.03 }), rand() * TAU), Math.cos(a) * r, 0.84 * (1 - (r / 1.2) ** 1.6) + 0.06, Math.sin(a) * r));
    }
    return shaded(round, flat);
  });
  // The hopper's fill: a gold disc the scene raises as fees come in.
  const hopperFill = cached(() => noShadow(lathe({ profile: [[0.95, 0], [0.95, 0.12], [0, 0.18]], segments: 12, color: "#ffd84a", emissive: 0.85 })));

  // The lookout: a timber tower on the top deck with a lantern room, a blue banner with the bolt hanging from it,
  // and a copper dome; the beam sweeps while the feed is live.
  const lookoutTower = cached(() => {
    const t = LAYOUT.lookout, round = [], flat = [], h = t.tower;
    for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) flat.push(beam(x, 0, z, x * 0.7, h, z * 0.7, 0.26, TIMBER_DK));
    for (let y = 1.2; y < h; y += 1.6) {
      const k = 1 - y / h * 0.3;
      flat.push(beam(-1.1 * k, y, -1.1 * k, 1.1 * k, y + 0.8, 1.1 * k, 0.12, TIMBER), beam(1.1 * k, y, -1.1 * k, -1.1 * k, y + 0.8, 1.1 * k, 0.12, TIMBER));
    }
    flat.push(bevelBox({ w: 2.4, h: 0.3, d: 2.4, color: TIMBER_LT, bevel: 0.05, offset: { y: h } }));
    round.push(turn([[0.95, h + 0.15], [0.95, h + 0.28], [0.8, h + 0.34], [0, h + 0.34]], 16, BRASS));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      flat.push(bevelBox({ w: 0.08, h: 1.5, d: 0.08, color: BRASS, bevel: 0.02, offset: { x: Math.cos(a) * 0.86, y: h + 1.05, z: Math.sin(a) * 0.86 } }));
    }
    round.push(turn([[1.12, h + 1.8], [1.12, h + 1.92], [0.7, h + 2.45], [0.3, h + 2.8], [0, h + 2.86]], 18, COPPER_DK));
    round.push(moved(ball(0.14, BRASS, 0, 10), 0, h + 2.98, 0));
    // The banner, facing the balcony.
    flat.push(bevelBox({ w: 1.6, h: 0.1, d: 0.1, color: TIMBER_DK, bevel: 0.02, offset: { y: h - 0.35, z: 1.2 } }));
    flat.push(box({ w: 1.3, h: 2.2, d: 0.05, color: "#2b52b8", offset: { y: h - 1.5, z: 1.2 } }));
    flat.push(moved(smoothBolt(1.4, 0.06, "#8fd0ff", 0.9), 0, h - 1.45, 1.25));
    return shaded(round, flat);
  });
  const lookoutLamp = cached(() => {
    const h = LAYOUT.lookout.tower;
    const build = (on) => noShadow(shaded([turn([[0.62, h + 0.34], [0.72, h + 0.9], [0.62, h + 1.72], [0, h + 1.8]], 16, on ? "#ffe29a" : "#4a3a22", on ? 1 : 0.1)]));
    return { on: build(true), off: build(false) };
  });
  // The beam: a long, thin cone of pale light from the lamp, turned by the scene about the tower's axis.
  const lookoutBeam = cached(() => {
    const g = lathe({ profile: [[0.1, 0], [2, 13], [0, 13]], segments: 8, color: "#fff2c0", emissive: 0.7 });
    const v = g.verts;
    for (let i = 0; i < v.length; i += 3) { const y = v[i + 1]; v[i + 1] = v[i] * 0.3; v[i] = y; }
    g.faces.forEach((f) => f.i.reverse());
    return noShadow(g);
  });

  // The study hall: an arch in the right wall with shelves of books and a glowing bolt inside, chained shut
  // with a monkey padlock. It opens in a later change; here it is only locked. Its sign and the note are labels.
  const studyHall = cached(() => {
    const round = [], flat = [], glow = [];
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * k / 12, x = Math.cos(a) * 2.2, y = 2.4 + Math.sin(a) * 2.2;
      flat.push(moved(bevelBox({ w: 0.7, h: 0.7, d: 1, color: k % 2 ? STONE[1] : ROCK_LT, bevel: 0.1 }), x, y, 0));
    }
    for (const x of [-2.2, 2.2]) flat.push(bevelBox({ w: 0.8, h: 2.4, d: 1, color: STONE_DK, bevel: 0.1, offset: { x, y: 1.2 } }));
    flat.push(box({ w: 4, h: 4.6, d: 0.2, color: "#3a2416", offset: { y: 2.3, z: -1.4 } }));
    // Stone round the arch and over it, where the wall is cut back to show the hall and hang its sign.
    const rand = mulberry32(42);
    for (const x of [-3.1, 3.1]) flat.push(bevelBox({ w: 1.1, h: 4.8, d: 1.8, color: STONE[2], bevel: 0.12, offset: { x, y: 2.4, z: -0.9 } }));
    for (let y = 4.6; y < 9; y += 1.5) for (let x = -3; x <= 3; x += 2) flat.push(bevelBox({ w: 2.1, h: 1.6, d: 1.6, color: STONE[Math.floor(rand() * 4)], bevel: 0.14, offset: { x: x + (rand() - 0.5) * 0.3, y: y + 0.75, z: -1.2 - rand() * 0.4 } }));
    for (const x of [-1.2, 1.2]) for (let sh = 0; sh < 4; sh++) {
      flat.push(box({ w: 1.3, h: 0.08, d: 0.5, color: TIMBER, offset: { x, y: 0.5 + sh * 0.8, z: -1.1 } }));
      for (let b = 0; b < 6; b++) flat.push(box({ w: 0.16, h: 0.5 + rand() * 0.18, d: 0.36, color: ["#8b2d23", "#2d5a8b", "#3f7a38", "#b58a2a", "#6a3a8b"][Math.floor(rand() * 5)], offset: { x: x - 0.5 + b * 0.2, y: 0.8 + sh * 0.8, z: -1.1 } }));
    }
    glow.push(moved(forwardLathe(turn([[0.95, 0], [0.95, 0.05], [0, 0.08]], 24, "#ff9a2a", 0.75)), 0, 2.6, -1.3), moved(smoothBolt(1.7, 0.2, "#ffd84a", 1), 0, 2.6, -1.08));
    // Two chains crossed over the arch, and the padlock where they meet, with a monkey's face on it.
    round.push(...chain(-2.1, 4.4, 0.62, 2.1, 1.1, 0.62, 0.13), ...chain(2.1, 4.4, 0.62, -2.1, 1.1, 0.62, 0.13));
    flat.push(bevelBox({ w: 1.2, h: 1.05, d: 0.42, color: "#e0a83a", bevel: 0.16, offset: { y: 2.2, z: 0.78 } }));
    round.push(tube({ path: (t) => ({ x: Math.cos(Math.PI * t) * 0.36, y: 2.72 + Math.sin(Math.PI * t) * 0.5, z: 0.78 }), radius: () => 0.085, rings: 14, segments: 8, colorFn: () => IRON_LT }));
    const disc = (r, color, x, y, z) => moved(forwardLathe(turn([[r, 0], [r, 0.04], [r * 0.75, 0.08], [0, 0.09]], 18, color)), x, y, z);
    round.push(disc(0.3, "#6b4424", 0, 2.2, 0.99), disc(0.11, "#6b4424", -0.31, 2.36, 0.97), disc(0.11, "#6b4424", 0.31, 2.36, 0.97), disc(0.17, "#e3c08a", 0, 2.08, 1.05));
    for (const s of [-1, 1]) round.push(moved(ball(0.045, "#111111", 0, 8), s * 0.1, 2.27, 1.07));
    return { stone: shaded(round, flat), glow: noShadow(shaded(glow)) };
  });

  // A peer tunnel: a stone arch round a portal of light, a thick ring with a vortex of thinner rings and three
  // spiral arms turning in toward the middle, and through it a glimpse of the peer's place. The themes are the
  // concept's: beach, volcano, jungle and harbour.
  const TUNNEL_THEMES = [
    { ring: "#5fd6ff", inner: "#b8f0ff", sky: "#3aa0d8", ground: "#e8d39a", accent: "#2f9f6a" },
    { ring: "#ff7a3a", inner: "#ffd0a0", sky: "#7a2a18", ground: "#3a2320", accent: "#ff5a1e" },
    { ring: "#6fff9a", inner: "#c8ffd8", sky: "#2f7a4a", ground: "#2f5a2a", accent: "#1f4a24" },
    { ring: "#6fb8ff", inner: "#c8e4ff", sky: "#2f5a8a", ground: "#4a6a8a", accent: "#e8e0d0" }
  ];
  const tunnel = (theme) => {
    const T = TUNNEL_THEMES[theme], geos = [], glow = [], portal = [], rand = mulberry32(theme * 11 + 3);
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * k / 12, x = Math.cos(a) * 2.5, y = 2.6 + Math.sin(a) * 2.5;
      geos.push(moved(bevelBox({ w: 0.8, h: 0.8, d: 1.4, color: k % 2 ? STONE[3] : ROCK_LT, bevel: 0.12 }), x, y, 0));
    }
    for (const x of [-2.5, 2.5]) geos.push(bevelBox({ w: 0.9, h: 2.6, d: 1.4, color: STONE_DK, bevel: 0.12, offset: { x, y: 1.3 } }));
    for (const x of [-0.5, 0.5]) geos.push(box({ w: 0.08, h: 0.08, d: 4, color: IRON_LT, offset: { x, y: 0.1, z: -1 } }));
    // The passage behind the arch, walled and roofed, and the rock the wall is cut back to round it.
    for (const x of [-2.75, 2.75]) geos.push(bevelBox({ w: 0.5, h: 5.3, d: 2.8, color: STONE[2], bevel: 0.1, offset: { x, y: 2.65, z: -1.9 } }));
    geos.push(bevelBox({ w: 6, h: 0.6, d: 2.8, color: STONE[1], bevel: 0.1, offset: { y: 5.3, z: -1.9 } }));
    geos.push(box({ w: 8.4, h: 7.4, d: 0.5, color: STONE_DK, offset: { y: 3.2, z: -3.6 } }));
    for (const x of [-3.6, 3.6]) geos.push(bevelBox({ w: 1.2, h: 6.8, d: 1.6, color: STONE[0], bevel: 0.14, offset: { x, y: 3.4, z: -1.2 } }));
    portal.push(moved(forwardLathe(torus(2.28, 0.17, T.ring, 1, 40, 10)), 0, 2.6, 0.5));
    [[1.82, 0.05, 0.85, 0.32], [1.34, 0.045, 0.75, 0.16], [0.86, 0.04, 0.65, 0]].forEach(([R, r, e, z]) => portal.push(moved(forwardLathe(torus(R, r, T.inner, e, 32, 6)), 0, 2.6, z)));
    for (let k = 0; k < 3; k++) {
      const a0 = k / 3 * TAU;
      portal.push(tube({ path: (t) => ({ x: Math.cos(a0 + t * 4.2) * (2.1 - 1.8 * t), y: 2.6 + Math.sin(a0 + t * 4.2) * (2.1 - 1.8 * t), z: 0.4 - t * 0.45 }), radius: (t) => 0.05 - t * 0.025, rings: 28, segments: 6, colorFn: () => T.inner, emissive: 0.9 }));
    }
    glow.push(box({ w: 4.4, h: 4.6, d: 0.1, color: T.sky, emissive: 0.75, offset: { y: 2.3, z: -3.2 } }));
    glow.push(box({ w: 4.4, h: 0.9, d: 1.4, color: T.ground, emissive: 0.45, offset: { y: 0.45, z: -2.5 } }));
    for (let i = 0; i < 3; i++) {
      const x = -1.3 + i * 1.3, h = 0.6 + rand() * 0.5;
      glow.push(box({ w: 0.7, h, d: 0.5, color: "#3a2a1e", emissive: 0.3, offset: { x, y: 0.9 + h / 2, z: -2.7 } }));
      glow.push(box({ w: 0.8, h: 0.25, d: 0.6, color: T.accent, emissive: 0.5, offset: { x, y: 0.9 + h + 0.1, z: -2.7 } }));
      glow.push(box({ w: 0.14, h: 0.14, d: 0.05, color: "#ffd27a", emissive: 1, offset: { x, y: 0.9 + h / 2, z: -2.44 } }));
    }
    return { stone: merge(...geos), glow: noShadow(shaded(portal, glow)) };
  };
  const tunnels = cached(() => TUNNEL_THEMES.map((_, i) => tunnel(i)));

  // A gallery station: a smaller pair of capacitors on a stand, for the lines past the featured four.
  const galleryStation = cached(() => shaded([-0.4, 0.4].flatMap((x) => [
    moved(turn([[0.36, 0], [0.36, 0.3], [0.3, 0.36], [0, 0.36]], 14, BRONZE), x, 0, 0),
    moved(turn([[0.3, 1.6], [0.34, 1.66], [0.34, 1.8], [0, 1.84]], 14, BRONZE), x, 0, 0)
  ]), [bevelBox({ w: 1.7, h: 0.18, d: 0.6, color: IRON_DK, bevel: 0.04, offset: { y: 0.1 } })]));
  const galleryCaps = cached(() => {
    const cap = (x, tone, lit) => {
      const [edge, core] = lit ? tone.lit : tone.dim;
      return [moved(turn([[0.26, 0.36], [0.29, 0.9], [0.29, 1.1], [0.26, 1.6]], 14, (t) => t > 0.2 && t < 0.75 ? core : edge, lit ? 1 : 0.65), x, 0, 0), moved(smoothBolt(0.7, 0.06, "#ffffff", lit ? 1 : 0.7), x, 1, 0.32)];
    };
    const build = (lit) => {
      const [a, b] = cap(-0.4, CAP_BLUE, lit), [c, d] = cap(0.4, CAP_ORANGE, false);
      return noShadow(shaded([a, c], [b, d]));
    };
    return { dim: build(false), lit: build(true) };
  });

  // The note on the study hall's door, as the concept writes it: a scrap of paper taped up askew, LOCKED in big
  // marker letters, BANANAS FIRST! under it and a banana drawn in the corner. Pinned with two brass tacks.
  const NOTE_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive';
  const studyNote = cached(() => {
    const w = 440, h = 380, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = w;
    canvas.height = h;
    const paper = g.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, 280);
    paper.addColorStop(0, "#f7ead0");
    paper.addColorStop(1, "#d9c59c");
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
    // Tape across the two top corners.
    g.fillStyle = "rgba(236,224,180,0.85)";
    for (const [x, a] of [[40, -0.6], [w - 40, 0.6]]) {
      g.save(); g.translate(x, 22); g.rotate(a); g.fillRect(-46, -14, 92, 28); g.restore();
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#3a1f10";
    const line = (text, size, x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); g.font = `bold ${size}px ${NOTE_FONT}`; g.fillText(text, 0, 0); g.restore(); };
    line("LOCKED", 104, w / 2 - 6, 92, -0.05);
    g.strokeStyle = "#3a1f10";
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    for (let x = 70; x <= 360; x += 8) g.lineTo(x, 150 + Math.sin(x / 18) * 4 - (x - 70) * 0.04);
    g.stroke();
    line("BANANAS", 70, w / 2 - 14, 212, 0.03);
    line("FIRST!", 76, w / 2 - 52, 300, -0.04);
    // The banana: a yellow crescent with a brown edge and stalk, and a little shine.
    g.save();
    g.translate(348, 292);
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(-58, -8);
    g.quadraticCurveTo(0, 62, 58, -14);
    g.quadraticCurveTo(0, 30, -58, -8);
    g.fillStyle = "#ffd23a";
    g.fill();
    g.lineWidth = 5;
    g.strokeStyle = "#6b4213";
    g.stroke();
    g.beginPath();
    g.moveTo(58, -14);
    g.lineTo(68, -26);
    g.stroke();
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-30, 12);
    g.quadraticCurveTo(0, 32, 30, 10);
    g.stroke();
    g.restore();
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const H = 1.45, W = H * w / h;
    const face = { verts: [-W / 2, -H / 2, 0.02, W / 2, -H / 2, 0.02, W / 2, H / 2, 0.02, -W / 2, H / 2, 0.02], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    face.imageSurface = { asset: { width: w, height: h, load: () => image }, rect: [-W / 2, -H / 2, W, H] };
    const back = merge(box({ w: W, h: H, d: 0.03, color: "#d9c59c" }), ...[-1, 1].map((sx) => moved(ball(0.05, BRASS, 0, 8), sx * (W / 2 - 0.16), H / 2 - 0.14, 0.05)));
    back.castShadow = false;
    return { face, back };
  });

  // ---- lanterns ---------------------------------------------------------------------------------------

  // The concept's lanterns: six panes of warm glass in a black iron frame, a flat foot, a peaked cap and a ring
  // to hang it by, `s` times the size of one 0.84 m tall with its foot at the origin. The frame is flat-shaded, so
  // it reads as metalwork; the glass is its own list, lit.
  const lanternParts = (s, x, y, z, frame, glass) => {
    const S = (profile) => profile.map(([r, h]) => [r * s, h * s]);
    frame.push(
      moved(lathe({ profile: S([[0.2, 0], [0.2, 0.05], [0.13, 0.08], [0, 0.08]]), segments: 6, color: IRON_DK }), x, y, z),
      moved(lathe({ profile: S([[0.23, 0.5], [0.23, 0.55], [0.1, 0.72], [0.04, 0.76], [0, 0.77]]), segments: 6, color: IRON_DK }), x, y, z),
      moved(forwardLathe(torus(0.06 * s, 0.014 * s, IRON_DK, 0, 10, 5)), x, y + 0.84 * s, z)
    );
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * TAU;
      frame.push(box({ w: 0.035 * s, h: 0.44 * s, d: 0.035 * s, color: IRON_DK, offset: { x: x + Math.cos(a) * 0.18 * s, y: y + 0.29 * s, z: z + Math.sin(a) * 0.18 * s } }));
    }
    glass.push(moved(lathe({ profile: S([[0.14, 0.07], [0.172, 0.15], [0.176, 0.29], [0.172, 0.43], [0.14, 0.51]]), segments: 6, color: (t) => t < 0.2 || t > 0.7 ? "#ffb444" : "#fff0b8", emissive: 1 }), x, y, z));
  };
  // Where the lanterns hang, and what holds them: [kind, x, y, z, turn] with y the floor they stand on, and
  // strings [ax, ay, az, bx, by, bz, sag, at] with lanterns hung at the fractions `at` along them.
  //   post:  a timber post with an arm out along +x turned by `turn`, the lantern hanging from its end
  //   top:   a heavy post with a big lantern standing on it, for the head of the stairway
  //   rail:  a small lantern standing on a rail post
  //   chain: a lantern at height y on a chain down from the vault
  const lanterns = (lamps, strings) => {
    const frame = [], glass = [], lights = [];
    const light = (x, y, z) => lights.push(x, y, z, 6);
    for (const [kind, x, y, z, turn = 0] of lamps) {
      if (kind === "post") {
        const ax = Math.cos(turn), az = -Math.sin(turn), tx = x + ax * 0.8, tz = z + az * 0.8;
        frame.push(bevelBox({ w: 0.22, h: 2.95, d: 0.22, color: TIMBER_DK, bevel: 0.04, offset: { x, y: y + 1.47, z } }));
        frame.push(beam(x - ax * 0.1, y + 2.82, z - az * 0.1, x + ax * 0.95, y + 2.82, z + az * 0.95, 0.14, TIMBER_DK), beam(x, y + 2.25, z, x + ax * 0.55, y + 2.78, z + az * 0.55, 0.09, TIMBER));
        frame.push(...chain(tx, y + 2.76, tz, tx, y + 2.46, tz, 0.05, IRON_DK));
        lanternParts(1.3, tx, y + 1.36, tz, frame, glass);
        light(tx, y + 1.8, tz);
      } else if (kind === "top") {
        frame.push(bevelBox({ w: 0.36, h: 1.7, d: 0.36, color: TIMBER_DK, bevel: 0.06, offset: { x, y: y + 0.85, z } }), bevelBox({ w: 0.56, h: 0.14, d: 0.56, color: IRON_DK, bevel: 0.03, offset: { x, y: y + 1.75, z } }));
        lanternParts(1.7, x, y + 1.82, z, frame, glass);
        light(x, y + 2.4, z);
      } else if (kind === "rail") {
        lanternParts(0.85, x, y + 1.06, z, frame, glass);
        light(x, y + 1.4, z);
      } else {
        frame.push(...chain(x, HALL.h, z, x, y + 1.5, z, 0.14, IRON_DK));
        lanternParts(1.75, x, y, z, frame, glass);
        light(x, y + 0.7, z);
      }
    }
    for (const [ax, ay, az, bx, by, bz, sag, at] of strings) {
      const at_ = (t) => ({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t - Math.sin(Math.PI * t) * sag, z: az + (bz - az) * t });
      frame.push(tube({ path: at_, radius: () => 0.03, rings: 20, segments: 5, colorFn: () => "#1b1714" }));
      for (const t of at) {
        const p = at_(t);
        frame.push(...chain(p.x, p.y, p.z, p.x, p.y - 0.36, p.z, 0.05, IRON_DK));
        lanternParts(1.2, p.x, p.y - 0.36 - 0.84 * 1.2, p.z, frame, glass);
        light(p.x, p.y - 0.8, p.z);
      }
    }
    return { frame: merge(...frame), glass: noShadow(merge(...glass)), lights };
  };

  // A worker's hard hat with a lamp on its brow, sized for the gorillas' heads.
  const hardHat = cached(() => merge(
    lathe({ profile: [[0.36, 0], [0.35, 0.12], [0.28, 0.25], [0.13, 0.32], [0, 0.33]], segments: 12, color: "#f2c230" }),
    lathe({ profile: [[0.46, -0.02], [0.46, 0.04], [0.32, 0.04], [0.32, -0.02]], segments: 12, color: "#d9a522" }),
    box({ w: 0.13, h: 0.11, d: 0.07, color: "#fff4c0", emissive: 0.95, offset: { y: 0.14, z: 0.35 } })
  ));

  // ---- the tunnel between the island and the hall ------------------------------------------------------

  // One tunnel with two ends: the hub dresses the 2 o'clock mouth with it, and the factory builds it again behind
  // its balcony, so looking back from inside shows the same tunnel running on to daylight. Both work in the
  // mouth's frame: x across, y up from the floor, +z out of the cave, the rim at z 0 and the shield at SHIELD_Z.
  // In the hall that frame stands at EXIT_Z with the balcony's floor, so the shield is the balcony's back edge.
  const SHIELD_Z = -3.8, EXIT_Z = HALL.front - 0.6 - SHIELD_Z;

  // The part both ends share: three timber sets, the track running in (out to `reach`, since the factory's end
  // stops at the rim), and the shield's emitters, iron posts with cyan coils just outside the phase plane, which
  // is as wide as the mouth's opening (about ±2.5 m).
  const tunnelFrame = (reach) => {
    const geos = [], glow = [];
    for (const z of [0.2, -1.6, -3.2]) {
      for (const x of [-2.15, 2.15]) geos.push(bevelBox({ w: 0.34, h: 3.3, d: 0.34, color: TIMBER_DK, bevel: 0.06, offset: { x, y: 1.65, z } }));
      geos.push(bevelBox({ w: 4.8, h: 0.36, d: 0.42, color: TIMBER, bevel: 0.06, offset: { y: 3.4, z } }));
      for (const s of [-1, 1]) geos.push(beam(s * 2.1, 2.6, z, s * 1.4, 3.3, z, 0.14, TIMBER_DK));
    }
    for (const x of [-0.5, 0.5]) geos.push(box({ w: 0.07, h: 0.07, d: reach + 4.6, color: IRON_LT, offset: { x, y: 0.1, z: (reach - 4.6) / 2 } }));
    for (let z = reach - 0.2; z > -4.5; z -= 0.5) geos.push(box({ w: 1.3, h: 0.06, d: 0.18, color: TIMBER_DK, offset: { y: 0.04, z } }));
    for (const x of [-2.72, 2.72]) {
      geos.push(bevelBox({ w: 0.4, h: 3.4, d: 0.4, color: IRON_DK, bevel: 0.05, offset: { x, y: 1.7, z: SHIELD_Z } }));
      for (let y = 0.5; y < 3.2; y += 0.45) glow.push(box({ w: 0.5, h: 0.12, d: 0.5, color: CYAN, emissive: 0.95, offset: { x, y, z: SHIELD_Z } }));
    }
    glow.push(box({ w: 5.8, h: 0.14, d: 0.3, color: CYAN, emissive: 0.9, offset: { y: 3.35, z: SHIELD_Z } }));
    return { geos, glow };
  };

  // The hub's end. Beyond the shield, the factory's bolt glows at the end of the tunnel against a dark wall, so the
  // path pulls people in: the smooth bolt, not the voxel one. A plain start, to be dressed further later.
  const hubTunnel = cached(() => {
    const { geos, glow } = tunnelFrame(1);
    geos.push(box({ w: 4.6, h: 3.6, d: 0.2, color: "#1f140e", offset: { y: 1.8, z: SHIELD_Z - 2.9 } }));
    glow.push(moved(smoothBolt(2.2, 0.24, "#ffd84a", 1), 0, 1.6, SHIELD_Z - 2.3));
    for (const x of [-1.5, 1.5]) glow.push(box({ w: 0.26, h: 0.34, d: 0.26, color: "#ffd27a", emissive: 1, offset: { x, y: 2.7, z: SHIELD_Z - 1.5 } }));
    return { timber: merge(...geos), glow: noShadow(merge(...glow)) };
  });

  // The factory's end, from the balcony's back edge out to the rim. The rock is what the terrain carves at every
  // mouth, 5 wide and 3 high out to the rim and 6 by 4 in the chamber behind it where the shield stands, in the
  // terrain's own dark inner stone; toward the hall it takes the hall's stone and fills the front wall round the
  // portal. `outside` is the island drawn simply, for a visit that did not come in from the hub, which is the one
  // time there is no picture of it to hang past the rim (`outsideView`).
  const EXIT_ROCK = { unit: 0.5, x: [-13, 12], y: [-4, 8], z: [-9, 0] };
  const exitTunnel = cached(() => {
    const R = EXIT_ROCK, u = R.unit, v = makeVox();
    const open = (x, y, z) => y > 0 && (z > -2.5 ? Math.abs(x) < 2.5 && y < 3 : Math.abs(x) < 3 && y < 4);
    const at = (i) => (i + 0.5) * u;
    for (let i = R.x[0]; i <= R.x[1]; i++) for (let j = R.y[0]; j <= R.y[1]; j++) for (let k = R.z[0]; k <= R.z[1]; k++) {
      const x = at(i), y = at(j), z = at(k);
      if (open(x, y, z)) continue;
      // The face toward the hall is craggy: about a third of it stands half a block proud, clear of the portal.
      if (k === R.z[0] && (Math.abs(x) < 3.6 && y < 4 || (((i * 73856093) ^ (j * 19349663)) >>> 0) % 8 > 2)) continue;
      const inside = open(x + u, y, z) || open(x - u, y, z) || open(x, y + u, z) || open(x, y - u, z) || open(x, y, z + u) || open(x, y, z - u);
      // Inner stone in blocks of about a metre and floor under foot, both paling toward the rim with the daylight
      // falling in (baked, so it holds on the tiers that light only the stations); the hall's stone in blocks of
      // its own size.
      const block = (Math.floor(x) * 7 + Math.floor(y) * 13 + Math.floor(z) * 5) & 3, day = z > -1 ? 2 : z > -2.5 ? 1 : 0;
      v.set(i, j, k, inside ? (j < 0 ? 7 + day : 1 + day * 2 + (block & 1)) : 10 + ((Math.floor(x / 1.5) * 3 + Math.floor(y / 1.5) * 5 + k) & 3));
    }
    const palette = [null, "#4e443c", "#453b34", "#62564c", "#584d44", "#7a6d60", "#6e6256", "#4a3e34", "#5a4c40", "#6c5c4d", ...STONE];
    const rock = voxelGeometry(v, { unit: u, palette, origin: { x: 0, y: -0.01, z: 0 } });
    const { geos, glow } = tunnelFrame(0.45);
    const outside = [], band = (h, yc, color, emissive, z) => outside.push(box({ w: 11, h, d: 0.2, color, emissive, offset: { y: yc, z } }));
    const out = 0.5;
    band(2.2, 4.3, "#d6eeff", 1, out + 7.2);
    band(1.6, 2.5, "#b4dcfa", 1, out + 7.1);
    band(1.2, 1.2, "#c9e6e8", 0.95, out + 7);
    band(0.7, 0.45, "#a9d8b0", 0.9, out + 6.9);
    outside.push(box({ w: 3.6, h: 0.9, d: 0.4, color: "#9cc9a2", emissive: 0.8, offset: { x: -1.9, y: 0.55, z: out + 6.6 } }));
    outside.push(box({ w: 1.8, h: 0.6, d: 0.4, color: "#a8d3ac", emissive: 0.8, offset: { x: 2.5, y: 0.4, z: out + 6.6 } }));
    outside.push(box({ w: 11, h: 1, d: 6.2, color: "#9cc98c", emissive: 0.7, offset: { y: -0.52, z: out + 3.6 } }));
    outside.push(box({ w: 1.5, h: 0.08, d: 6.4, color: "#e6d0a2", emissive: 0.75, offset: { y: 0.02, z: out + 3.4 } }));
    outside.push(box({ w: 2.3, h: 0.06, d: 6.4, color: "#c1d09a", emissive: 0.7, offset: { y: 0, z: out + 3.4 } }));
    for (const [x, z, h] of [[-2.4, out + 4.2, 3.2], [2.1, out + 5, 2.7]]) {
      outside.push(box({ w: 0.26, h, d: 0.26, color: "#a8906e", emissive: 0.7, offset: { x, y: h / 2, z } }));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        outside.push(moved(turnedY(box({ w: 1.5, h: 0.14, d: 0.4, color: k % 2 ? "#86bf78" : "#94c986", emissive: 0.75, offset: { x: 0.7 } }), a), x, 0.05 + h, z));
      }
    }
    return { rock, timber: merge(...geos), glow: noShadow(merge(...glow)), outside: noShadow(merge(...outside)) };
  });

  // The picture the hub takes of the island on the way in (`world.factoryView`): taken from the shield looking out,
  // `eye` above the floor, spanning `across` either side and `up` and `down` as slopes. Hung `distance` past where
  // it was taken and square to the tunnel, it lines up with the island seen through the rim from anywhere behind
  // the shield. A plain quad facing +z with the image over it; the scene turns it round to face the hall.
  const outsideView = (view, distance) => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false };
    const x = view.across * distance, y0 = view.eye - view.down * distance, y1 = view.eye + view.up * distance;
    geo.verts.push(-x, y0, 0, x, y0, 0, x, y1, 0, -x, y1, 0);
    geo.faces.push({ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 });
    geo.imageSurface = { asset: view, rect: [-x, y0, 2 * x, y1 - y0] };
    return geo;
  };

  BL.factoryModels = {
    LAYOUT, LEVEL, HALL, WALL_LEAN, STATION_BACK, SHIELD_Z, porchOf, FORGE_TRACKS, FORGE_CART_Z, FORGE_STORES, COILS, teslaCoil, EXIT_Z, CONDUIT_SAMPLES, TUNNEL_THEMES, STEP, supportAt, clearAt,
    hall, scaffold, coreBody, coreChamber, conduits, sat, stationFrame, capacitor, forge, forgeFire, cart,
    switchboard, switchScreens, rebalancerBase, rebalancerRing, treasuryBody, goldPile, hopperFill,
    lookoutTower, lookoutLamp, lookoutBeam, studyHall, studyNote, tunnels, galleryStation, galleryCaps, label, lanterns, hardHat, hubTunnel, exitTunnel, outsideView,
    beam, moved, turnedY, smoothBolt, smoothBitcoin
  };
})();
