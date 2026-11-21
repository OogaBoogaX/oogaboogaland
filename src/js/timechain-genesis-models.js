// The models of the Genesis Museum, Room 8 of the Timechain Sphere (timechain-room-genesis.js): one for each
// technology and event on the road to Bitcoin, each shown as the idea itself (keys swapped in the open, hashes joined
// into a tree, a coin signed unseen) rather than as the machine of its year, in chrome, brushed metal, glass and light,
// warm orange against cool blue. Every label is drawn as geometry, so the model viewer shows it as the hall does. Each
// is an original design, carrying no maker's mark or logo. `model(root, key, y, opts)` builds one in kit `root` (its
// front toward -z, standing on y): `opts.part` one piece of a shared plinth alone (for the viewer), `opts.quiet` a
// lighter build for a piece seen from across the room (round parts in fewer faces, small words left out), `opts.view`
// the build the model viewer turns, `opts.moving` true the hall's near build, whose bubbles, sparks and lamps are
// nodes of their own for the room to move, and
// `opts.glass` the piece's glass in place of its solid parts, which a room draws as a mesh of its own.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels;
  const mm = (v) => v * 1.6e-3, LIFT = 0.002, HALF = Math.PI / 2, TAU = Math.PI * 2;
  // The label strips' and the paper's colours (a room lays its own accent over `amber` and `amberText`).
  const C = { amber: "#f7931a", amberText: "#ffb04d", ink: "#14110e", paper: "#efe9d8", paperOld: "#e3d9bf", inkBlue: "#1b2d6b", woodDark: "#4a331c" };
  // The pieces' colours: brushed steel and gun-metal, the dark of a deck, ceramic, the warm lights (orange to
  // near-white), the cool ones (blue, teal, pale), the accents, the dim tints of dark glass, and the glow over a dish.
  const HUE = { steel: "#aab3c2", gun: "#4d566b", dark: "#1b1f3d", deck: "#0f1126", cer: "#efe6d2", org: "#ff8a1e", amb: "#ffb347", hot: "#ffd9a3", blu: "#3fa8ff", teal: "#62cfe0", pale: "#b5eef5", green: "#8dffb6", vio: "#9b7cf0", gold: "#e8b93a", red: "#e04a3c", off: "#4a4f6e", dimBlu: "#1d3f66", glow: "#24558f", dimOrg: "#6b3f08", dimRed: "#4a1210" };
  // Which way a frame's -z looks (its turn about y, then about x), for a frame laid on a face of a part.
  const FACES = { front: [0, 0], back: [Math.PI, 0], left: [-HALF, 0], right: [HALF, 0], top: [0, HALF], bottom: [0, -HALF] };
  // A room may show its displays larger than the museum's size: while one is built (`model`, `opts.unit`) every length
  // here is `UNIT` times its own, the plinth's own metres included. Such a room may also stand the piece on a deck
  // raised `LIP` metres behind the plinth's front edge (`opts.lip`): the label strip stays down on the edge, in front
  // of and below everything. `GLASS`: the pass being built, a piece's glass or its solid parts.
  let UNIT = 1, LIP = 0, GLASS = false, uid = 0;
  // A shared geometry as a part of a mesh: a copy, grown to the room's size.
  const cast = (geo) => { const g = BL.models.merge(geo); if (UNIT !== 1) for (let i = 0; i < g.verts.length; i++) g.verts[i] *= UNIT; return g; };
  // The tools for a frame `k` whose origin stands `base` up: boxes; cylinders, upright unless turned; tori, flat
  // unless turned; pixel words facing -z; `at`, a frame of its own placed and turned in this one, and `face`, one
  // whose -z looks out of a face; `layer`, the depth of the n-th layer laid on a face, and `ink`, of words written on
  // it. `quiet` (the far build): words under 6 mm a pixel are left out, since nobody reads them from across the room.
  // `view`: the build is for the model viewer (`DETAIL`). `moving` (the hall's near build alone): what flows or blinks
  // is a node of its own, every one of a kind the one shared geometry (so all of a kind are one draw record), named
  // for the room's animator: `flow:<id>:<dx>:<dy>:<dz>:<spread>:<period>:<phase>`, carried from where it stands by
  // (dx, dy, dz) every `period` seconds, swaying `spread` to either side, and `blink:<id>:<period>:<phase>`. Nodes
  // keep their place in the room's frame, so a flow's way is turned to the room with this frame's heading. Elsewhere
  // the same parts are still, in the mesh: a lamp lit, a flow's part stopped `phase` of the way along (and left out of
  // the far build).
  const tools = (k, base, quiet = false, view = false, moving = false) => {
    const s = UNIT;
    const T = {
      quiet, view,
      B: (w, h, d, color, x, yy, z, o) => k.box(w * s, h * s, d * s, color, x * s, base + yy * s, z * s, o),
      Y: (rt, rb, h, color, x, yy, z, o) => k.cyl(rt * s, rb * s, h * s, color, x * s, base + yy * s, z * s, o),
      R: (rr, r, color, x, yy, z, o) => k.torus(rr * s, r * s, color, x * s, base + yy * s, z * s, o),
      ball: (r, color, x, yy, z, o) => k.ball(r * s, color, x * s, base + yy * s, z * s, o),
      lathe: (profile, color, x, yy, z, o) => k.lathe(profile.map(([r, y]) => [r * s, y * s]), color, x * s, base + yy * s, z * s, o),
      prism: (pts, depth, color, x, yy, z, o) => k.prism(pts.map(([px, py]) => [px * s, py * s]), depth * s, color, x * s, base + yy * s, z * s, o),
      say: (text, px, color, x, yy, z, e = 0.25) => quiet && px < 0.006 ? null : k.add(RM.helpers.litWord(text, px * s, color, e), x * s, base + yy * s, z * s),
      at: (x, yy, z, ry = 0, rx = 0, rz = 0) => tools(k.group(x * s, base + yy * s, z * s, ry, rx, rz), 0, quiet, view, moving),
      flow: (geo, x, yy, z, d, spread, period, phase) => {
        if (!moving) return quiet ? null : k.add(cast(geo), (x + d[0] * phase) * s, base + (yy + d[1] * phase) * s, (z + d[2] * phase) * s);
        const a = k.yaw(), c = Math.cos(a), sn = Math.sin(a);
        return k.node(`flow:${uid++}:${((c * d[0] + sn * d[2]) * s).toFixed(4)}:${(d[1] * s).toFixed(4)}:${((-sn * d[0] + c * d[2]) * s).toFixed(4)}:${(spread * s).toFixed(4)}:${period}:${phase}`, geo, x * s, base + yy * s, z * s, { scale: UNIT, glow: true });
      },
      blink: (geo, x, yy, z, period, phase) => moving ? k.node(`blink:${uid++}:${period}:${phase}`, geo, x * s, base + yy * s, z * s, { scale: UNIT, glow: true }) : quiet ? null : k.add(cast(geo), x * s, base + yy * s, z * s),
      face: (face, x, yy, z, spin = 0) => T.at(x, yy, z, FACES[face][0], FACES[face][1], spin),
      layer: (n) => -LIFT - 2 * LIFT * n, ink: (n) => -LIFT - 2 * LIFT * n - 0.0025
    };
    return T;
  };

  // ---------- what every piece shares ----------
  // On a plinth several entries share, each entry's piece stands over its own plaque: the plaques are PITCH apart
  // (timechain-room-genesis.js CARD.pitch), the first in walk order at the viewer's left, which is +x here.
  const PITCH = 1.0, spot = (j, n) => ((n - 1) / 2 - j) * PITCH;
  // A label strip: a dark plate `w` across facing -z at (x, y, z), its lines of pixel text sized to fit inside a margin,
  // the first line amber and the rest cream, each on its own row. Returns the plate's height.
  // Every strip's lines, measured against its width, for the room's overflow audit (`fits`, one row a strip).
  const FITS = [], FIT_SEEN = new Set();
  const strip = (T, lines, x, y, z, w, px = 0.0032, o = {}) => {
    const m = 0.012, gap = px * 4, sizes = lines.map((t, i) => Math.min(i ? px * 0.72 : px, (w - 2 * m) / Math.max(1, t.length * 6 - 1)));
    if (!FIT_SEEN.has(lines.join("|"))) { FIT_SEEN.add(lines.join("|")); const widest = Math.max(...lines.map((t, i) => BL.jumbotron.text.measureText(t, sizes[i]))); FITS.push({ plinth: "label strip", face: lines[0], faceW: w, w: widest, limit: 1 - 2 * m / w + 0.001, fits: widest <= w - 2 * m + 1e-6 }); }
    const h = 2 * m + sizes.reduce((a, b) => a + b * 7, 0) + gap * (lines.length - 1);
    const F = T.at(x, y, z, o.ry || 0);
    F.B(w, h, 0.012, C.ink, 0, 0, 0.006);
    F.B(w - 0.006, h - 0.006, 0.004, "#1c1813", 0, 0, -0.002);
    F.B(w, 0.003, 0.004, C.amber, 0, h / 2 + 0.0015, 0.002, { emissive: 0.8, glow: true });
    let yy = h / 2 - m;
    lines.forEach((t, i) => { yy -= sizes[i] * 3.5; F.say(t, sizes[i], i ? "#e8dcc8" : C.amberText || C.amber, 0, yy, -0.0055, i ? 0.2 : 0.4); yy -= sizes[i] * 3.5 + gap; });
    return h;
  };
  // The piece's label: a strip standing along the plinth's front edge, in front of and below everything.
  const label = (T, lines, w = 0.86, x = 0) => { if (!GLASS) strip(T, lines, x, 0.048 - LIP / UNIT, -0.55, w, 0.004); };
  const lit = (e, o) => e ? { ...o, emissive: e, glow: true } : o || {};
  // How round a round part is drawn. On its plinth, near, a part has the faces round it its builder asks for (`seg`)
  // and more where it is large, so no curve shows its corners from the walk: `DETAIL.round` faces a metre of radius,
  // up to `DETAIL.most`, a ring's tube four-sided where it is a hair of light and rounder as it thickens. The viewer
  // draws every face itself, in order, on each turn of the model, so its build has `DETAIL.view` of what the builder
  // asks. The far build, for a piece seen from across the room, has `DETAIL.far` of it and no more than a part of its
  // radius needs (`farRound`), every tube three-sided, a ball under `DETAIL.cube` metres in radius as a cube, and
  // leaves out any part under `DETAIL.least` metres across and any hair-thin ring under `DETAIL.hoop` metres in
  // radius. A part of under ten faces round stays as it is (a crystal, a hexagon).
  const DETAIL = { round: 220, most: 48, view: 0.5, far: 0.25, farRound: 90, least: 0.03, cube: 0.05, hoop: 0.08 };
  const round = (T, o, radius, tube) => o.seg < 10 ? o
    : T.quiet ? { ...o, seg: Math.max(radius < 0.02 ? 4 : 6, Math.min(Math.ceil(o.seg * DETAIL.far), Math.ceil(radius * DETAIL.farRound))), sides: 3 }
    : T.view ? { ...o, seg: Math.max(10, Math.ceil(o.seg * DETAIL.view)), ...(tube ? { sides: tube < 0.012 ? 4 : 6 } : null) }
    : { ...o, seg: Math.max(o.seg, Math.min(DETAIL.most, Math.ceil(radius * DETAIL.round))), ...(tube && !o.sides ? { sides: tube < 0.008 ? 4 : tube < 0.02 ? 6 : 10 } : null) };
  const seen = (T, size) => !T.quiet || size >= DETAIL.least;
  // Chrome, as an airbrush paints it: every face coloured by how far it looks up, a cool sky above, a dark line at the
  // horizon and a warm ground below.
  const STOPS = [[1, [236, 244, 255]], [0.5, [150, 190, 235]], [0.14, [70, 110, 190]], [0.03, [24, 28, 52]], [-0.12, [70, 38, 20]], [-0.5, [214, 122, 44]], [-1, [255, 196, 120]]];
  const chromed = (geo, e = 0.4) => {
    const v = geo.verts;
    for (const f of geo.faces) {
      let n = 0;
      for (let t = 2; t < f.i.length && !n; t++) {
        const a = f.i[0] * 3, b = f.i[t - 1] * 3, c = f.i[t] * 3, ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
        if (len > 1e-12) n = ny / len || 1e-6;
      }
      let k = 0; while (k < STOPS.length - 2 && n < STOPS[k + 1][0]) k++;
      const t = Math.min(1, Math.max(0, (STOPS[k][0] - n) / (STOPS[k][0] - STOPS[k + 1][0]))), p = STOPS[k][1], q = STOPS[k + 1][1];
      f.color = [0, 1, 2].map((j) => Math.round(p[j] + (q[j] - p[j]) * t)); f.emissive = e;
    }
    return geo;
  };
  // A piece draws its solid parts and its glass in the one builder (`So`, `Gl`), each shape lit by `e` where it is a
  // light; a room builds the piece once for either (`opts.glass`), and each pass keeps its own shapes alone.
  const draw = (glass) => {
    const on = (T, size) => GLASS === glass && seen(T, size);
    const widest = (profile) => profile.reduce((r, p) => Math.max(r, p[0]), 0);
    return {
      box: (T, w, h, d, c, x, y, z, e = 0, o) => { if (on(T, Math.max(w, h, d))) T.B(w, h, d, c, x, y, z, lit(e, o)); },
      cyl: (T, rt, rb, h, c, x, y, z, e = 0, o) => { if (on(T, Math.max(2 * rt, 2 * rb, h))) T.Y(rt, rb, h, c, x, y, z, lit(e, round(T, { seg: 16, ...o }, Math.max(rt, rb)))); },
      ring: (T, R, r, c, x, y, z, e = 0, o) => { if (on(T, r < 0.006 && R < DETAIL.hoop ? 0 : 2 * R)) T.R(R, r, c, x, y, z, lit(e, round(T, { seg: 32, ...o }, R, r))); },
      ball: (T, r, c, x, y, z, e = 0, o) => { if (!on(T, 2 * r)) return; if (T.quiet && r < DETAIL.cube) T.B(1.6 * r, 1.6 * r, 1.6 * r, c, x, y, z, lit(e)); else T.ball(r, c, x, y, z, lit(e, round(T, { seg: 14, ...o }, r))); },
      lathe: (T, profile, c, x, y, z, e = 0, o) => { if (on(T, 1)) T.lathe(profile, c, x, y, z, lit(e, round(T, { seg: 28, ...o }, widest(profile)))); },
      // The same shapes in chrome.
      cbox: (T, w, h, d, x, y, z, o) => { if (on(T, Math.max(w, h, d))) chromed(T.B(w, h, d, "#ffffff", x, y, z, o || {})); },
      ccyl: (T, rt, rb, h, x, y, z, o) => { if (on(T, Math.max(2 * rt, 2 * rb, h))) chromed(T.Y(rt, rb, h, "#ffffff", x, y, z, round(T, { seg: 28, ...o }, Math.max(rt, rb)))); },
      cring: (T, R, r, x, y, z, o) => { if (on(T, 2 * R)) chromed(T.R(R, r, "#ffffff", x, y, z, round(T, { seg: 40, ...o }, R, Math.max(r, 0.02)))); },
      cball: (T, r, x, y, z, o) => { if (on(T, 2 * r)) chromed(T.quiet && r < DETAIL.cube ? T.B(1.6 * r, 1.6 * r, 1.6 * r, "#ffffff", x, y, z) : T.ball(r, "#ffffff", x, y, z, round(T, { seg: 16, ...o }, r))); },
      shell: (T, profile, x, y, z, o) => { if (on(T, 1)) chromed(T.lathe(profile, "#ffffff", x, y, z, round(T, { seg: 28, ...o }, widest(profile)))); },
      // A thin rod from one point to another: turned to the other's bearing, then tipped up to it.
      rod: (T, a, b, r, c, e = 0) => { if (!on(T, 1)) return; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], flat = Math.hypot(dx, dz); T.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz)).at(0, 0, 0, 0, -Math.atan2(dy, flat)).B(r, r, Math.hypot(flat, dy), c, 0, 0, 0, lit(e)); },
      say: (T, t, px, c, x, y, z, e = 0.9) => { if (on(T, 1)) T.say(t, px, c, x, y, z, e); },
      // A crystal: two pyramids base to base.
      gem: (T, r, h, c, x, y, z, e = 0, seg = 6) => { if (!on(T, h)) return; T.Y(0, r, h / 2, c, x, y + h / 4, z, lit(e, { seg })); T.Y(r, 0, h / 2, c, x, y - h / 4, z, lit(e, { seg })); },
      // What flows or blinks (`tools`): never in the glass.
      flow: (T, geo, x, y, z, d, spread, period, phase) => { if (!glass && !GLASS) T.flow(geo, x, y, z, d, spread, period, phase); },
      blink: (T, geo, x, y, z, period = 1.6, phase = 0) => { if (!glass && !GLASS) T.blink(geo, x, y, z, period, phase); },
      // A glowing panel facing -z in a gun-metal bezel.
      panel: (T, w, h, c, x, y, z, e = 0.9) => { if (!on(T, Math.max(w, h))) return; T.B(w + 0.016, h + 0.016, 0.012, HUE.gun, x, y, z); T.B(w, h, 0.004, c, x, y, z - 0.007, lit(e)); }
    };
  };
  const So = draw(false), Gl = draw(true);
  // What flows and blinks, each kind one geometry every piece shares: a bubble, a spark, a glint of green, a lamp.
  const own = RM.helpers.own, bead = (c, r) => own(() => BL.models.noShadow(BL.models.lathe({ profile: [[0, -r], [r * 0.87, -r * 0.5], [r * 0.87, r * 0.5], [0, r]], segments: 8, color: c, emissive: 1 })));
  const lamp = (c) => own(() => BL.models.noShadow(BL.models.box({ w: 0.016, h: 0.016, d: 0.016, color: c, emissive: 1 })));
  const BUBBLE = { pale: bead(HUE.pale, 0.011), warm: bead(HUE.hot, 0.011) }, SPARK = bead(HUE.amb, 0.009), GLINT = bead(HUE.green, 0.009);
  const LAMP = { org: lamp(HUE.org), teal: lamp(HUE.teal), green: lamp(HUE.green), red: lamp(HUE.red) };
  // `n` of a kind rising `h` from (x, y, z), each a little after the last and at its own pace.
  const rising = (T, geo, x, y, z, h, spread, n, period = 3.4) => { for (let i = 0; i < n; i++) So.flow(T, geo(), x, y, z, [0, h, 0], spread, +(period * (0.85 + 0.3 * (i * 0.618 % 1))).toFixed(2), +(i * 0.618 % 1).toFixed(3)); };
  // A tank of glowing liquid standing at (x, y, z): a glass tube `r` in radius and `h` tall between chrome collars,
  // the liquid `fill` of the way up it (glass too, so what rises in it shows, under a bright skin), and bubbles.
  const tank = (T, x, y, z, r, h, c, fill = 0.78, n = 4, geo = BUBBLE.pale) => {
    Gl.cyl(T, r, r, h, HUE.dimBlu, x, y + h / 2, z, 0.3, { seg: 20 });
    Gl.cyl(T, r * 0.84, r * 0.84, h * fill, c, x, y + h * fill / 2, z, 0.9, { seg: 20 });
    So.cyl(T, r * 0.84, r * 0.84, 0.004, c, x, y + h * fill, z, 1, { seg: 20 });
    So.ccyl(T, r * 1.15, r * 1.15, 0.014, x, y, z); So.ccyl(T, r * 1.15, r * 1.15, 0.014, x, y + h, z);
    rising(T, geo, x, y + 0.012, z, h * fill - 0.02, r * 0.45, n);
  };
  // The base a piece floats over: a chrome dish set in the deck, a cool ring of light round its foot, a warm one at
  // its rim and a cool one inside it, and the light it throws up: three skins of glass one inside another, each taller
  // than the last, so the light is deepest at the dish and thins as it climbs.
  const base = (T, r = 0.4, c = HUE.org) => {
    So.shell(T, [[0, 0], [r + 0.04, 0], [r + 0.035, 0.022], [r - 0.01, 0.04], [r * 0.7, 0.03], [0, 0.026]], 0, 0, 0, { seg: 40 });
    So.ring(T, r + 0.05, 0.008, HUE.teal, 0, 0.008, 0, 1, { seg: 48 });
    So.ring(T, r - 0.03, 0.008, c, 0, 0.042, 0, 1, { seg: 48 });
    So.ring(T, r * 0.55, 0.005, HUE.blu, 0, 0.034, 0, 0.9, { seg: 40 });
    for (let k = 0; k < 3; k++) { const rb = r - 0.05 - 0.035 * k, h = 0.04 + 0.03 * k; Gl.lathe(T, [[rb, 0.04], [rb * 0.86, 0.04 + h]], HUE.glow, 0, 0, 0, 0.45, { seg: 40 }); }
  };
  // A sheet of light with lines of writing on it, facing -z in frame `T`.
  const sheet = (T, w, h, rows = 4, c = HUE.pale) => {
    Gl.box(T, w, h, 0.008, c, 0, 0, 0, 0.5);
    So.box(T, w, 0.004, 0.012, HUE.org, 0, h / 2, 0, 1); So.box(T, w, 0.004, 0.012, HUE.org, 0, -h / 2, 0, 1);
    for (let k = 0; k < rows; k++) So.box(T, w * (0.7 - (k % 3) * 0.12), 0.004, 0.002, c, w * (k % 3) * 0.06, h * (0.28 - k * 0.56 / Math.max(1, rows - 1)), -0.006, 0.6);
  };
  // A coin facing -z: a chrome disc with a rim of light.
  const coin = (T, x, y, z, r = 0.03, c = HUE.org) => { So.ccyl(T, r, r, r * 0.2, x, y, z, { rx: HALF, seg: 20 }); So.ring(T, r, r * 0.1, c, x, y, z - r * 0.1, 0.9, { rx: HALF, seg: 20 }); };
  // The outline of a rounded pod for `shell`: half an ellipse of radius `r` from height y0 up to y1.
  const pod = (r, y0, y1, n = 12) => Array.from({ length: n + 1 }, (_, i) => [r * Math.cos(Math.PI * (i / n - 0.5)), y0 + (y1 - y0) * i / n]);

  // ---------- the pieces ----------
  const PIECE = {};
  // Packet switching: one message at the sender splits into four coloured packets, each takes its own route through
  // a mesh of chrome nodes, and they stack up again in order at the receiver.
  PIECE.tcpip = (T) => {
    base(T, 0.44);
    const col = [HUE.org, HUE.hot, HUE.teal, HUE.blu], lum = [0.7, 1, 0.9, 0.9], yk = (k) => 0.4 + k * 0.07;
    for (const sx of [1, -1]) {
      const x = sx * 0.4;
      So.ccyl(T, 0.016, 0.03, 0.2, x, 0.13, 0);
      So.shell(T, pod(0.085, 0.21, 0.36), x, 0, 0);
      So.ring(T, 0.088, 0.005, sx > 0 ? HUE.org : HUE.blu, x, 0.285, 0, 1);
      Gl.cyl(T, 0.052, 0.052, 0.3, HUE.dimBlu, x, 0.505, 0, 0.5, { seg: 14 });
      for (let k = 0; k < 4; k++) So.box(T, 0.058, 0.052, 0.058, col[k], x, yk(k), 0, lum[k]);
      So.shell(T, pod(0.06, 0.65, 0.71), x, 0, 0);
    }
    const N = { a: [0.2, 0.74, 0.1], b: [0.21, 0.48, -0.12], c: [0.2, 0.22, 0.1], d: [0, 0.82, -0.1], e: [0, 0.52, 0.14], f: [0, 0.2, -0.12], g: [-0.2, 0.74, 0.1], h: [-0.21, 0.46, -0.12], i: [-0.2, 0.22, 0.1] };
    for (const [p, q] of ["ab", "bc", "de", "ef", "gh", "hi", "ad", "ci", "bf", "eh"]) So.rod(T, N[p], N[q], 0.006, HUE.steel);
    const routes = ["beg", "cfh", "aei", "adg"], at = [1, 1, 0, 1];
    for (let k = 0; k < 4; k++) {
      const pts = [[0.37, yk(k), 0], ...[...routes[k]].map((n) => N[n]), [-0.37, yk(k), 0]];
      for (let j = 0; j < pts.length - 1; j++) So.rod(T, pts[j], pts[j + 1], 0.008, col[k], lum[k]);
      const p = pts[at[k] + 1], q = pts[at[k] + 2];
      So.box(T, 0.045, 0.045, 0.045, col[k], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, lum[k], { ry: 0.6 });
    }
    for (const n in N) { So.cball(T, 0.04, ...N[n]); So.ring(T, 0.055, 0.004, HUE.pale, ...N[n], 0.9, { seg: 20 }); }
    label(T, ["PACKET SWITCHING", "ONE MESSAGE, MANY PACKETS, MANY ROUTES, ONE ARRIVAL"]);
  };
  // Diffie-Hellman: two chrome pods each keep a private crystal under dark glass, send a public orb across an open
  // arch, and each raises the same violet key crystal at its masthead.
  PIECE.dh = (T) => {
    base(T, 0.44);
    for (const [sx, c, dim, pub] of [[1, HUE.org, HUE.dimOrg, HUE.amb], [-1, HUE.blu, HUE.dimBlu, HUE.teal]]) {
      const x = sx * 0.31;
      So.ccyl(T, 0.022, 0.05, 0.14, x, 0.1, 0);
      So.shell(T, [[0, 0.16], [0.07, 0.165], [0.115, 0.2], [0.132, 0.25], [0.125, 0.29], [0.1, 0.3], [0, 0.3]], x, 0, 0);
      So.ring(T, 0.134, 0.005, c, x, 0.27, 0, 1, { seg: 40 });
      Gl.ball(T, 0.115, dim, x, 0.35, 0, 0.5, { seg: 14 });
      So.gem(T, 0.045, 0.13, c, x, 0.37, 0, 1);
      // the secret steeps in its own colour: liquid half way up the glass, and what rises from it
      Gl.lathe(T, [[0, 0.3], [0.092, 0.3], [0.103, 0.335], [0.104, 0.365], [0, 0.365]], c, x, 0, 0, 0.9, { seg: 24 });
      So.cyl(T, 0.1, 0.1, 0.004, pub, x, 0.366, 0, 1, { seg: 24 });
      rising(T, sx > 0 ? BUBBLE.warm : BUBBLE.pale, x, 0.31, 0, 0.13, 0.035, 4);
      So.shell(T, [[0, 0.45], [0.06, 0.455], [0.07, 0.48], [0.035, 0.51], [0.014, 0.56], [0.012, 0.68], [0, 0.68]], x, 0, 0);
      So.gem(T, 0.05, 0.15, HUE.vio, x, 0.78, 0, 1);
      So.cring(T, 0.095, 0.01, x, 0.78, 0, { rx: HALF });
      So.cring(T, 0.095, 0.01, x, 0.78, 0, { rz: HALF });
      // the public value crossing in the open, on its own rail
      const z = -sx * 0.08, n = 10, arc = (i) => { const u = 0.26 - 0.52 * i / n; return [u, 0.47 + 0.12 * (1 - (u / 0.26) ** 2), z]; };
      for (let i = 0; i < n; i++) So.rod(T, arc(i), arc(i + 1), 0.012, HUE.steel, 0.3);
      const u = -sx * 0.07, y = 0.47 + 0.12 * (1 - (u / 0.26) ** 2);
      So.ball(T, 0.036, pub, u, y, z, 1);
      So.cring(T, 0.05, 0.006, u, y, z, { rz: HALF });
    }
    for (const dy of [-0.016, 0.016]) So.box(T, 0.09, 0.012, 0.012, HUE.vio, 0, 0.78 + dy, 0, 1);
    So.say(T, "PUBLIC", 0.004, HUE.pale, 0, 0.42, -0.09);
    label(T, ["DIFFIE-HELLMAN", "PRIVATE SECRETS, PUBLIC SWAP, THE SAME SHARED KEY"]);
  };
  // RSA: a chrome lock that stands on two secret prime crystals; one floating key fits it, and the same key's bow
  // presses a seal of light onto a sheet (the signature).
  PIECE.rsa = (T) => {
    base(T, 0.44);
    const lx = 0.2;
    for (const sx of [-1, 1]) So.gem(T, 0.042, 0.27, sx > 0 ? HUE.org : HUE.amb, lx + sx * 0.06, 0.2, 0, 1);
    Gl.cyl(T, 0.125, 0.125, 0.25, HUE.dimOrg, lx, 0.2, 0, 0.5, { seg: 18 });
    So.say(T, "P", 0.006, HUE.dark, lx + 0.06, 0.2, -0.13, 0); So.say(T, "Q", 0.006, HUE.dark, lx - 0.06, 0.2, -0.13, 0);
    So.shell(T, [[0, 0.32], [0.1, 0.325], [0.15, 0.35], [0.172, 0.4], [0.18, 0.45], [0.172, 0.5], [0.15, 0.55], [0.1, 0.575], [0, 0.58]], lx, 0, 0);
    So.ring(T, 0.165, 0.006, HUE.org, lx, 0.365, 0, 1, { seg: 48 });
    So.cring(T, 0.09, 0.025, lx, 0.59, 0, { rx: HALF });
    for (const sz of [-1, 1]) { So.cyl(T, 0.034, 0.034, 0.012, HUE.dark, lx, 0.47, sz * 0.176, 0, { rx: HALF }); So.box(T, 0.012, 0.04, 0.004, HUE.blu, lx, 0.462, sz * 0.184, 1); So.ball(T, 0.013, HUE.blu, lx, 0.485, sz * 0.183, 1); }
    // the key, pointing at the lock's side port
    So.cyl(T, 0.028, 0.028, 0.012, HUE.blu, lx - 0.18, 0.45, 0, 1, { rz: HALF });
    So.ccyl(T, 0.013, 0.013, 0.17, -0.065, 0.45, 0, { rz: HALF });
    So.cbox(T, 0.022, 0.045, 0.014, 0, 0.425, 0); So.cbox(T, 0.022, 0.03, 0.014, -0.035, 0.432, 0);
    So.cring(T, 0.052, 0.015, -0.2, 0.45, 0, { rx: HALF });
    So.gem(T, 0.024, 0.06, HUE.blu, -0.2, 0.45, 0, 1);
    // the signed sheet
    const S = T.at(-0.385, 0.48, 0.03, 0.25);
    sheet(S, 0.19, 0.36, 5);
    So.ring(S, 0.042, 0.008, HUE.blu, 0.035, -0.115, -0.008, 1, { rx: HALF });
    So.ball(S, 0.014, HUE.blu, 0.035, -0.115, -0.008, 1);
    So.rod(T, [-0.2, 0.45, 0], [-0.35, 0.365, 0.02], 0.005, HUE.blu, 0.9);
    label(T, ["RSA", "TWO SECRET PRIMES, A LOCK, AND ONE KEY THAT SIGNS"]);
  };
  // Merkle tree: eight glass leaves in a ring, joined in pairs by rising branches to four, two and then one glowing
  // root crystal; the light warms from cool leaves to the orange root.
  PIECE.merkle = (T) => {
    base(T, 0.44);
    const lv = [[0.37, 0.15], [0.27, 0.36], [0.16, 0.55], [0, 0.74]], cols = [HUE.blu, HUE.teal, HUE.amb];
    const P = (L, n) => { const a = -0.654 + ((1 << L) * n + ((1 << L) - 1) / 2) * TAU / 8; return [lv[L][0] * Math.cos(a), lv[L][1], lv[L][0] * Math.sin(a)]; };
    for (let L = 0; L < 3; L++) for (let n = 0; n < 8 >> L; n++) So.rod(T, P(L, n), P(L + 1, n >> 1), 0.01, cols[L], 0.9);
    for (let n = 0; n < 8; n++) { const p = P(0, n); Gl.box(T, 0.075, 0.075, 0.075, HUE.blu, ...p, 0.5); So.box(T, 0.034, 0.034, 0.034, HUE.pale, ...p, 1); So.ccyl(T, 0.03, 0.012, 0.03, p[0], p[1] - 0.06, p[2]); }
    for (let n = 0; n < 4; n++) { const p = P(1, n); So.cball(T, 0.046, ...p); So.ring(T, 0.06, 0.005, HUE.teal, ...p, 1, { seg: 20 }); }
    for (let n = 0; n < 2; n++) { const p = P(2, n); So.cball(T, 0.058, ...p); So.ring(T, 0.074, 0.006, HUE.amb, ...p, 1, { seg: 24 }); }
    So.gem(T, 0.075, 0.2, HUE.org, 0, 0.78, 0, 0.7, 8);
    So.cring(T, 0.115, 0.012, 0, 0.78, 0);
    So.cring(T, 0.115, 0.012, 0, 0.78, 0, { rx: HALF });
    label(T, ["MERKLE TREE", "EIGHT LEAVES HASHED IN PAIRS UP TO ONE ROOT"]);
  };
  // Byzantine generals: seven chrome generals ring a floating citadel and pass messengers round the ring; five loyal
  // ones (blue) agree and aim one orange beam each at the city, two traitors (red) send lies.
  PIECE.byzantine = (T) => {
    base(T, 0.44);
    So.shell(T, [[0, 0.36], [0.08, 0.365], [0.15, 0.4], [0.175, 0.435], [0.16, 0.45], [0, 0.45]], 0, 0, 0);
    So.ring(T, 0.178, 0.006, HUE.org, 0, 0.44, 0, 1, { seg: 40 });
    So.shell(T, [[0, 0.45], [0.065, 0.45], [0.05, 0.52], [0.03, 0.6], [0.036, 0.63], [0.012, 0.72], [0, 0.78]], 0, 0, 0);
    So.ring(T, 0.04, 0.004, HUE.hot, 0, 0.63, 0, 1, { seg: 16 });
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 + 0.3, x = 0.105 * Math.cos(a), z = 0.105 * Math.sin(a), h = 0.14 + (k % 2) * 0.05;
      So.ccyl(T, 0.006, 0.034, h, x, 0.45 + h / 2, z); So.ball(T, 0.011, HUE.hot, x, 0.455 + h, z, 1);
    }
    So.cring(T, 0.14, 0.012, 0, 0.465, 0);
    Gl.lathe(T, [[0, 0.45], [0.165, 0.45], [0.162, 0.54], [0.135, 0.66], [0.085, 0.76], [0, 0.82]], HUE.dimBlu, 0, 0, 0, 0.4);
    So.ball(T, 0.022, HUE.hot, 0, 0.845, 0, 1);
    const R = 0.37, bad = [false, false, true, false, false, true, false];
    const G = (k, y) => { const a = k * TAU / 7 + 0.22; return [R * Math.cos(a), y, R * Math.sin(a)]; };
    for (let k = 0; k < 7; k++) {
      const [x, , z] = G(k, 0), c = bad[k] ? HUE.red : HUE.blu;
      So.ccyl(T, 0.01, 0.02, 0.1, x, 0.09, z);
      So.shell(T, [[0, 0.13], [0.05, 0.135], [0.06, 0.16], [0.042, 0.22], [0.024, 0.275], [0, 0.28]], x, 0, z);
      So.ring(T, 0.06, 0.004, c, x, 0.16, z, 1, { seg: 20 });
      So.ball(T, 0.034, c, x, 0.305, z, 0.8); if (bad[k]) So.blink(T, LAMP.red(), x, 0.352, z, 0.9, +(k / 7).toFixed(2));
      if (!bad[k]) So.rod(T, [x, 0.31, z], [x * 0.46, 0.44, z * 0.46], 0.007, HUE.org, 0.8);
      const j = (k + 1) % 7, lie = bad[k] || bad[j], p = G(k, 0.3), q = G(j, 0.3);
      So.rod(T, p, q, 0.005, lie ? HUE.red : HUE.blu, 0.9);
      So.gem(T, 0.018, 0.045, lie ? HUE.red : HUE.pale, (p[0] + q[0]) / 2, 0.3, (p[2] + q[2]) / 2, 1, 4);
      const m = (k + 3) % 7, lie2 = bad[k] || bad[m];
      So.rod(T, G(k, 0.3), G(m, 0.3), 0.003, lie2 ? HUE.red : HUE.blu, 0.7);
    }
    label(T, ["BYZANTINE GENERALS", "ONE PLAN AGREED, THOUGH SOME GENERALS LIE"]);
  };
  // Blind signature: the bank's floating chrome press signs a coin through a sealed dark-glass cover it cannot see
  // into; beside it the cover lies open and the coin still wears the same ring of signature light.
  PIECE.chaum = (T) => {
    base(T, 0.44);
    const ax = 0.24, bx = -0.25, cup = [[0, 0.19], [0.06, 0.195], [0.1, 0.23], [0.112, 0.28], [0.09, 0.29], [0, 0.29]];
    // the bank's press
    So.shell(T, [[0, 0.575], [0.055, 0.575], [0.07, 0.6], [0.05, 0.63], [0.075, 0.66], [0.1, 0.72], [0.095, 0.79], [0.065, 0.85], [0, 0.875]], ax, 0, 0);
    So.ring(T, 0.062, 0.007, HUE.blu, ax, 0.562, 0, 1);
    So.ring(T, 0.1, 0.005, HUE.org, ax, 0.725, 0, 1, { seg: 40 });
    So.panel(T, 0.1, 0.04, HUE.blu, ax, 0.775, -0.1);
    So.say(T, "BANK", 0.004, HUE.dark, ax, 0.775, -0.112, 0);
    // the sealed cover, the coin inside
    So.ccyl(T, 0.02, 0.04, 0.16, ax, 0.11, 0);
    So.shell(T, cup, ax, 0, 0);
    Gl.ball(T, 0.135, HUE.dimBlu, ax, 0.4, 0, 0.5, { seg: 14 }); Gl.ball(T, 0.118, HUE.dimBlu, ax, 0.4, 0, 0.4, { seg: 12 });
    So.cring(T, 0.108, 0.008, ax, 0.482, 0); So.cring(T, 0.108, 0.008, ax, 0.318, 0);
    const A = T.at(ax, 0.4, 0, 0, 0.3);
    coin(A, 0, 0, 0, 0.085, HUE.org);
    So.ring(A, 0.05, 0.006, HUE.blu, 0, 0, -0.014, 1, { rx: HALF });
    So.rod(T, [ax, 0.56, 0], [ax, 0.455, -0.03], 0.005, HUE.blu, 0.9);
    // the cover off: the coin and its signature
    So.ccyl(T, 0.02, 0.04, 0.16, bx, 0.11, 0);
    So.shell(T, cup, bx, 0, 0);
    Gl.lathe(T, [[0, 0.265], [0.07, 0.28], [0.115, 0.33], [0.135, 0.4], [0.12, 0.4], [0.1, 0.34], [0, 0.3]], HUE.dimBlu, bx, 0, 0, 0.5);
    Gl.lathe(T.at(bx - 0.07, 0.65, 0.02, 0, 0, -0.6), [[0, 0], [0.135, 0], [0.12, 0.06], [0.085, 0.105], [0.04, 0.13], [0, 0.135]], HUE.dimBlu, 0, 0, 0, 0.5);
    const B = T.at(bx, 0.45, 0, 0, 0.3);
    coin(B, 0, 0, 0, 0.11, HUE.org);
    for (const sz of [-1, 1]) So.ring(B, 0.065, 0.008, HUE.blu, 0, 0, sz * 0.017, 1, { rx: HALF });
    So.cyl(T, 0, 0.035, 0.07, HUE.org, -0.01, 0.4, 0, 0.8, { rz: -HALF });
    So.box(T, 0.06, 0.016, 0.016, HUE.org, 0.045, 0.4, 0, 0.8);
    label(T, ["BLIND SIGNATURE", "THE BANK SIGNS A COIN IT CANNOT SEE"]);
  };
  // Elliptic-curve cryptography: the curve y^2 = x^3 + 7 as a chrome rail. A beam through P and Q strikes the curve
  // at a third point and drops straight through to P + Q: one easy step forward, with no easy way back.
  PIECE.ecc = (T) => {
    base(T, 0.42);
    const pt = (x, y) => [0.03 - 0.168 * x, 0.5 + 0.082 * y];   // the curve's own x runs to the viewer's right
    // The rail, in even steps along its length.
    const fine = []; for (let i = 0; i <= 600; i++) { const y = -4.4 + 8.8 * i / 600; fine.push(pt(Math.cbrt(y * y - 7), y)); }
    let len = 0; const run = [0]; for (let i = 1; i < fine.length; i++) { len += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]); run.push(len); }
    const N = 46; let j = 0, last = fine[0];
    for (let k = 1; k <= N; k++) {
      while (j < fine.length - 1 && run[j] < len * k / N) j++;
      const p = fine[j], dx = p[0] - last[0], dy = p[1] - last[1], flat = Math.abs(dx);
      const F = T.at((p[0] + last[0]) / 2, (p[1] + last[1]) / 2, 0, dx < 0 ? -HALF : HALF).at(0, 0, 0, 0, -Math.atan2(dy, flat));
      So.ccyl(F, 0.017, 0.017, Math.hypot(dx, dy) * 1.25, 0, 0, 0, { rx: HALF, seg: 10 });
      last = p;
    }
    for (const s of [-1, 1]) So.cball(T, 0.026, ...pt(2.31, s * 4.4), 0, { seg: 10 });
    // The cage it floats in: two chrome hoops that are also its axes, on a chrome stem.
    So.cring(T, 0.39, 0.008, 0.03, 0.5, 0, { seg: 48 }); So.cring(T, 0.375, 0.008, 0.03, 0.5, 0, { rz: HALF, seg: 48 });
    So.shell(T, pod(0.05, 0.05, 0.13, 8), 0.03, 0, 0); So.ring(T, 0.052, 0.004, HUE.blu, 0.03, 0.09, 0, 1);
    for (const s of [-1, 1]) So.ball(T, 0.014, HUE.teal, 0.03 + s * 0.39, 0.5, 0, 1);
    // P and Q, the beam through them, the third point, and the drop to P + Q.
    const P = pt(-1.5, 1.904), Q = pt(0.5, 2.669), R = pt(1.146, 2.916), S = pt(1.146, -2.916), z = -0.03;
    So.rod(T, [P[0] + 0.07, P[1] - 0.013, z], [R[0], R[1], z], 0.007, HUE.blu, 1);
    So.rod(T, [R[0], R[1], z], [S[0], S[1], z], 0.007, HUE.org, 1);
    for (let k = 0; k < 4; k++) So.cyl(T, 0.022, 0, 0.04, HUE.org, R[0], R[1] - 0.1 - k * 0.085, z, 1, { seg: 10 });
    for (const p of [P, Q]) { So.ball(T, 0.032, HUE.amb, p[0], p[1], z, 1); So.cring(T, 0.045, 0.006, p[0], p[1], z, { rx: HALF, seg: 20 }); }
    So.cball(T, 0.026, R[0], R[1], z);
    So.ball(T, 0.045, HUE.blu, S[0], S[1], z, 1); So.cring(T, 0.066, 0.009, S[0], S[1], z, { rx: HALF, seg: 24 }); So.cring(T, 0.066, 0.006, S[0], S[1], z, { seg: 24 });
    So.say(T, "P", 0.007, HUE.hot, P[0] + 0.02, P[1] + 0.09, z); So.say(T, "Q", 0.007, HUE.hot, Q[0] + 0.01, Q[1] - 0.085, z);
    So.say(T, "P+Q", 0.007, HUE.pale, S[0] + 0.02, S[1] - 0.105, z);
    label(T, ["ELLIPTIC CURVES", "ADDING TWO POINTS IS EASY. UNDOING IT IS NOT."]);
  };
  // The Crypto Anarchist Manifesto: one short text copied from hand to hand, spiralling up a chrome beacon and out
  // over the red fence of the state's reach.
  PIECE.may88 = (T) => {
    base(T, 0.42);
    // The beacon the text is sent from: a chrome needle afloat, a warm light at its tip.
    So.shell(T, [[0, 0.09], [0.05, 0.1], [0.085, 0.14], [0.09, 0.19], [0.07, 0.25], [0.04, 0.34], [0.024, 0.5], [0.014, 0.66], [0.006, 0.78], [0, 0.8]], 0, 0, 0);
    So.ring(T, 0.094, 0.005, HUE.blu, 0, 0.19, 0, 1); So.ball(T, 0.026, HUE.org, 0, 0.83, 0, 1); So.cring(T, 0.045, 0.005, 0, 0.83, 0); So.blink(T, LAMP.org(), 0, 0.866, 0, 1.8, 0);
    // The fence: chrome posts in a ring, a red beam strung between them.
    for (let k = 0; k < 8; k++) { const a = TAU * (k + 0.5) / 8, x = 0.3 * Math.sin(a), z = -0.3 * Math.cos(a); So.ccyl(T, 0.01, 0.016, 0.16, x, 0.12, z, { seg: 10 }); So.cball(T, 0.018, x, 0.21, z, { seg: 8 }); }
    So.ring(T, 0.3, 0.005, HUE.red, 0, 0.17, 0, 1, { seg: 48 }); So.ring(T, 0.3, 0.003, HUE.red, 0, 0.11, 0, 0.8, { seg: 48 });
    // The copies: the first one large at the front, each next one a hand further round, higher and farther out.
    const n = 6, at = (k) => { const a = k * TAU * 75 / 360, r = k ? 0.24 + k * 0.03 : 0.15; return [r * Math.sin(a), k ? 0.355 + k * 0.065 : 0.36, -r * Math.cos(a), a]; };
    for (let k = 0; k < n; k++) {
      const [x, y, z, a] = at(k), s = k ? 0.55 : 1, S = T.at(x, y, z, -0.7 * Math.sin(a));
      if (k) sheet(S, 0.2 * s, 0.24 * s, 4, k % 2 ? HUE.pale : HUE.hot);
      else { Gl.box(S, 0.2, 0.24, 0.008, HUE.hot, 0, 0, 0, 0.5); So.box(S, 0.2, 0.004, 0.012, HUE.org, 0, -0.12, 0, 1); for (let i = 0; i < 3; i++) So.box(S, 0.15 - i * 0.03, 0.004, 0.002, HUE.hot, 0.01 * i, -0.03 - i * 0.028, -0.006, 0.6); }
      So.cbox(S, 0.2 * s + 0.02, 0.012, 0.016, 0, 0.12 * s + 0.008, 0); So.cball(S, 0.014, 0, 0.12 * s + 0.02, 0, { seg: 8 });
      if (k < n - 1) { const b = at(k + 1); So.rod(T, [x, y + 0.12 * s + 0.02, z], [b[0], b[1] + 0.086, b[2]], 0.005, HUE.blu, 1); }
    }
    So.say(T, "CRYPTO", 0.0045, HUE.hot, 0, 0.445, -0.16); So.say(T, "ANARCHY", 0.0045, HUE.hot, 0, 0.402, -0.16);
    label(T, ["THE CRYPTO ANARCHIST MANIFESTO", "PASSED HAND TO HAND, BEYOND ANY STATE'S REACH, 1988"]);
  };
  // Ecash at work: coins leave the bank's vault inside dark envelopes (blinded), rest in the wallet in the middle,
  // and are spent bare at the shop; the bank's red tracing beam breaks off without finding them.
  PIECE.digicash = (T) => {
    base(T, 0.44);
    const arc = (x0, y0, x1, y1, lift, t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + lift * 4 * t * (1 - t)];
    // The bank: a small chrome temple afloat, a round vault door of cool light between its columns.
    So.ccyl(T, 0.02, 0.05, 0.07, 0.34, 0.07, 0.02, { seg: 12 });
    So.cbox(T, 0.25, 0.026, 0.2, 0.34, 0.115, 0.02); So.cbox(T, 0.25, 0.03, 0.2, 0.34, 0.345, 0.02);
    So.box(T, 0.19, 0.2, 0.13, HUE.gun, 0.34, 0.23, 0.04);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { So.cyl(T, 0.014, 0.017, 0.2, HUE.steel, 0.34 + sx * 0.1, 0.23, 0.02 + sz * 0.075, 0, { seg: 10 }); }
    So.ccyl(T, 0, 0.175, 0.085, 0.34, 0.402, 0.02, { seg: 4, ry: TAU / 8 });
    So.cring(T, 0.058, 0.011, 0.34, 0.225, -0.03, { rx: HALF, seg: 24 }); So.cyl(T, 0.048, 0.048, 0.008, HUE.blu, 0.34, 0.225, -0.03, 1, { rx: HALF, seg: 20 });
    So.say(T, "BANK", 0.0035, HUE.pale, 0.34, 0.345, -0.084);
    // The wallet: a chrome bowl afloat, its coins standing under a dome of warm glass.
    So.shell(T, [[0, 0.2], [0.06, 0.205], [0.105, 0.23], [0.13, 0.275], [0.135, 0.31], [0.12, 0.315], [0, 0.3]], 0, 0, 0);
    So.ring(T, 0.137, 0.006, HUE.org, 0, 0.31, 0, 1, { seg: 40 });
    Gl.lathe(T, [[0, 0.31], [0.125, 0.31], [0.115, 0.38], [0.08, 0.44], [0, 0.47]], HUE.dimOrg, 0, 0, 0, 0.5);
    for (let k = -1; k <= 1; k++) coin(T, k * 0.062, 0.36, k ? 0.02 : -0.03, 0.042, HUE.org);
    So.ccyl(T, 0.012, 0.03, 0.14, 0, 0.12, 0, { seg: 12 });
    So.say(T, "WALLET", 0.0035, HUE.hot, 0, 0.262, -0.132);
    // The shop: a chrome counter under a canopy, lit teal.
    So.shell(T, [[0, 0.08], [0.05, 0.085], [0.08, 0.11], [0.092, 0.16], [0.085, 0.21], [0.1, 0.24], [0.1, 0.256], [0, 0.256]], -0.34, 0, 0.02);
    So.cyl(T, 0.007, 0.007, 0.16, HUE.steel, -0.34, 0.33, 0.02, 0, { seg: 8 }); So.ccyl(T, 0.02, 0.135, 0.07, -0.34, 0.44, 0.02);
    So.ring(T, 0.13, 0.005, HUE.teal, -0.34, 0.402, 0.02, 1); So.cball(T, 0.02, -0.34, 0.485, 0.02); So.ring(T, 0.094, 0.004, HUE.teal, -0.34, 0.16, 0.02, 1);
    So.say(T, "SHOP", 0.0035, HUE.pale, -0.34, 0.205, -0.075);
    // Withdrawn blinded: each coin in a dark envelope. Spent: bare coins.
    for (let k = 0; k < 12; k++) {
      const a = arc(0.34, 0.45, 0.02, 0.48, 0.2, k / 12), b = arc(0.34, 0.45, 0.02, 0.48, 0.2, (k + 1) / 12); So.rod(T, [a[0], a[1], 0], [b[0], b[1], 0], 0.004, HUE.blu, 1);
      const c = arc(-0.02, 0.48, -0.34, 0.5, 0.18, k / 12), d = arc(-0.02, 0.48, -0.34, 0.5, 0.18, (k + 1) / 12); So.rod(T, [c[0], c[1], 0], [d[0], d[1], 0], 0.004, HUE.org, 1);
    }
    for (const t of [0.25, 0.5, 0.75]) {
      const [x, y] = arc(0.34, 0.45, 0.02, 0.48, 0.2, t); coin(T, x, y, 0, 0.026, HUE.blu); Gl.ball(T, 0.046, HUE.dimBlu, x, y, 0, 0.5, { seg: 10 }); So.cring(T, 0.047, 0.004, x, y, 0, { seg: 20 });
      const [u, v] = arc(-0.02, 0.48, -0.34, 0.5, 0.18, t); coin(T, u, v, 0, 0.03, HUE.org);
    }
    // The bank's eye and its trace, lost half way.
    So.cyl(T, 0.006, 0.006, 0.34, HUE.steel, 0.42, 0.6, 0.1, 0, { seg: 8 }); So.cball(T, 0.03, 0.42, 0.79, 0.1); So.ball(T, 0.014, HUE.red, 0.4, 0.79, 0.075, 1);
    for (let k = 0; k < 5; k++) So.box(T, 0.045, 0.006, 0.006, HUE.red, 0.34 - k * 0.07, 0.79, 0.08, 1 - k * 0.17);
    So.say(T, "?", 0.009, HUE.red, -0.06, 0.79, 0.08);
    label(T, ["DIGICASH ECASH", "BLINDED AT THE BANK, SPENT AT THE SHOP, UNTRACEABLE"]);
  };
  // Time-stamping by linked hashes: four certificates climb a chrome rail of time, each one's own seal (the bright
  // crystal on its right) copied into the next one's left side and chained to it, so none can be slipped in earlier.
  PIECE.timestamp = (T) => {
    base(T, 0.44);
    const C = [HUE.amb, HUE.teal, HUE.org, HUE.blu], at = (k) => [0.3525 - k * 0.235, 0.28 + k * 0.135, 0.15 - k * 0.1];
    const tube = (a, b, r) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], flat = Math.hypot(dx, dz); So.ccyl(T.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz)).at(0, 0, 0, 0, -Math.atan2(dy, flat)), r, r, Math.hypot(flat, dy), 0, 0, 0, { rx: HALF, seg: 12 }); };
    // The rail of time, rising from the past (viewer's left, behind) to now (right, in front).
    tube([0.44, 0.085, 0.187], [-0.44, 0.59, -0.187], 0.014);
    So.cball(T, 0.024, 0.44, 0.085, 0.187); So.ball(T, 0.03, HUE.org, -0.44, 0.59, -0.187, 1); So.cring(T, 0.042, 0.006, -0.44, 0.59, -0.187, { rz: HALF, seg: 20 });
    So.cyl(T, 0.007, 0.012, 0.15, HUE.steel, 0.25, 0.115, 0.106, 0, { seg: 10 }); So.cyl(T, 0.007, 0.012, 0.41, HUE.steel, -0.2, 0.245, -0.085, 0, { seg: 10 });
    for (let k = 0; k < 4; k++) {
      const [x, y, z] = at(k), S = T.at(x, y, z);
      sheet(S, 0.14, 0.2, 3, HUE.pale);
      for (const s of [-1, 1]) { So.ccyl(S, 0.015, 0.015, 0.18, 0, s * 0.11, 0, { rz: HALF, seg: 12 }); for (const e of [-1, 1]) So.cball(S, 0.019, e * 0.092, s * 0.11, 0, { seg: 8 }); }
      So.cyl(S, 0.005, 0.005, 0.03, HUE.steel, 0, -0.138, 0, 0, { seg: 8 });
      So.say(S, String(k + 1), 0.007, HUE.hot, 0, 0.162, 0);
      // Its own hash, and the hash of the one before.
      So.gem(S, 0.026, 0.066, C[k], -0.085, 0.045, -0.022, 1);
      So.gem(S, 0.02, 0.05, k ? C[k - 1] : HUE.off, 0.085, -0.045, -0.022, k ? 0.9 : 0);
      if (k < 3) {
        const a = [x - 0.085, y + 0.045, z - 0.022], b = [x - 0.15, y + 0.09, z - 0.122];
        So.rod(T, a, b, 0.006, C[k], 1);
        for (let i = 1; i <= 3; i++) So.cring(T, 0.026, 0.007, a[0] + (b[0] - a[0]) * i / 4, a[1] + (b[1] - a[1]) * i / 4, a[2] + (b[2] - a[2]) * i / 4, i % 2 ? { rx: HALF, seg: 16 } : { rz: HALF, seg: 16 });
      }
    }
    label(T, ["TIME-STAMPING BY LINKED HASHES", "EACH CERTIFICATE CARRIES THE HASH OF THE LAST"]);
  };
  // PGP: a message sealed in a locked chrome capsule, and round it a web of trust: six people's keys, each vouching
  // for its neighbours along beams of light.
  PIECE.pgp = (T) => {
    base(T, 0.42);
    // The sealed message: a letter in a glass barrel between two chrome caps, a lock on its band, a shackle on top.
    So.ccyl(T, 0.01, 0.028, 0.2, 0, 0.16, 0, { seg: 12 });
    So.shell(T, [[0, 0.26], [0.05, 0.265], [0.09, 0.29], [0.108, 0.33], [0.108, 0.365], [0, 0.365]], 0, 0, 0);
    So.shell(T, [[0, 0.555], [0.108, 0.555], [0.108, 0.59], [0.088, 0.63], [0.045, 0.655], [0, 0.66]], 0, 0, 0);
    Gl.cyl(T, 0.096, 0.096, 0.19, HUE.dimBlu, 0, 0.46, 0, 0.5, { seg: 24 });
    sheet(T.at(0, 0.46, 0), 0.12, 0.15, 4, HUE.hot);
    So.cring(T, 0.1, 0.011, 0, 0.46, 0); So.ring(T, 0.108, 0.004, HUE.org, 0, 0.372, 0, 1); So.ring(T, 0.108, 0.004, HUE.org, 0, 0.55, 0, 1);
    So.ccyl(T, 0.036, 0.036, 0.02, 0, 0.46, -0.104, { rx: HALF, seg: 16 }); So.cyl(T, 0.024, 0.024, 0.006, HUE.org, 0, 0.46, -0.116, 1, { rx: HALF, seg: 16 });
    So.box(T, 0.008, 0.022, 0.004, HUE.dark, 0, 0.455, -0.12); So.ball(T, 0.008, HUE.dark, 0, 0.468, -0.12);
    So.cring(T, 0.042, 0.011, 0, 0.665, 0, { rx: HALF, seg: 24 });
    // The web: six keys round it, low and high by turns, every key joined to its neighbours.
    const node = (k) => { const a = TAU * (k + 0.5) / 6; return [0.36 * Math.sin(a), k % 2 ? 0.68 : 0.33, -0.36 * Math.cos(a), a]; };
    for (let k = 0; k < 6; k++) {
      const [x, y, z, a] = node(k), F = T.at(x, y, z, -a), c = k % 2 ? HUE.blu : HUE.org;
      So.cring(F, 0.036, 0.01, 0, 0, 0, { rx: HALF, seg: 20 }); So.ball(F, 0.017, c, 0, 0, 0, 1);
      So.cyl(F, 0.008, 0.008, 0.11, HUE.steel, 0, -0.09, 0, 0, { seg: 8 }); So.box(F, 0.03, 0.012, 0.01, HUE.steel, 0.018, -0.105, 0); So.box(F, 0.022, 0.012, 0.01, HUE.steel, 0.014, -0.132, 0);
      const n = node((k + 1) % 6), m = node((k + 2) % 6);
      So.rod(T, [x, y, z], [n[0], n[1], n[2]], 0.005, HUE.teal, 1);
      So.rod(T, [x, y, z], [m[0], m[1], m[2]], 0.003, c, 0.7);
      So.cball(T, 0.014, (x + n[0]) / 2, (y + n[1]) / 2, (z + n[2]) / 2, { seg: 8 });
    }
    label(T, ["PRETTY GOOD PRIVACY", "A SEALED MESSAGE AND A WEB OF KEYS THAT VOUCH"]);
  };
  // The cypherpunks list: six chrome voices speak inward to one list, a twisting stack of posts and replies in warm
  // and cool by turns; out of the top of the argument rises a coin of digital money.
  PIECE.cypherpunks = (T) => {
    base(T, 0.4);
    // The list: a spindle, and the posts threaded on it.
    So.shell(T, [[0, 0.08], [0.05, 0.085], [0.075, 0.11], [0.06, 0.15], [0.02, 0.17], [0, 0.172]], 0, 0, 0);
    So.ccyl(T, 0.008, 0.008, 0.6, 0, 0.46, 0, { seg: 10 });
    for (let k = 0; k < 9; k++) {
      const F = T.at(0, 0.21 + k * 0.058, 0, k * 0.5), c = k % 2 ? HUE.blu : HUE.org;
      Gl.box(F, 0.24, 0.036, 0.1, c, 0, 0, 0, 0.4);
      for (const s of [-1, 1]) { So.box(F, 0.15, 0.005, 0.002, HUE.hot, 0.03, 0.006, s * 0.052, 0.8); So.box(F, 0.1, 0.005, 0.002, HUE.hot, 0.055, -0.008, s * 0.052, 0.6); }
      So.cring(F, 0.02, 0.006, 0, 0, 0, { seg: 12 });
    }
    // The voices: chrome heads with horns turned to the list, each one's post flying in.
    for (let k = 0; k < 6; k++) {
      const a = TAU * (k + 0.5) / 6, y = 0.26 + ((k * 2) % 6) * 0.075, x = 0.34 * Math.sin(a), z = -0.34 * Math.cos(a), F = T.at(x, y, z, -a), c = k % 2 ? HUE.blu : HUE.org;
      So.cball(F, 0.036, 0, 0, 0); So.ccyl(F, 0.05, 0.012, 0.08, 0, 0, 0.065, { rx: HALF, seg: 16 }); So.ring(F, 0.05, 0.004, c, 0, 0, 0.105, 1, { rx: HALF, seg: 20 });
      So.rod(T, [x * 0.66, y, z * 0.66], [x * 0.3, y, z * 0.3], 0.005, c, 1);
      So.box(F, 0.05, 0.03, 0.004, c, 0, 0, 0.175, 0.9);
    }
    // What the argument made.
    So.cyl(T, 0.056, 0.056, 0.014, HUE.amb, 0, 0.8, 0, 0.9, { rx: HALF, seg: 24 }); So.cring(T, 0.06, 0.009, 0, 0.8, 0, { rx: HALF, seg: 28 });
    for (const s of [-1, 1]) So.ring(T, 0.034, 0.004, HUE.hot, 0, 0.8, s * 0.009, 1, { rx: HALF, seg: 20 });
    So.cring(T, 0.095, 0.006, 0, 0.8, 0, { seg: 32 });
    label(T, ["THE CYPHERPUNKS", "MANY VOICES, ONE LIST, AND AN ARGUMENT ABOUT MONEY"]);
  };
  // A Cypherpunk's Manifesto: a chrome tablet of code with a keyhole of light, and round it a wall of glass bricks
  // going up course by course, the next brick on its way down: privacy is built, not asked for.
  PIECE.hughes93 = (T) => {
    base(T, 0.4);
    // The tablet, the same on both faces: a dark slab framed in chrome beads under a chrome hoop, with the keyhole,
    // the words and lines of code in light.
    So.box(T, 0.25, 0.46, 0.05, HUE.dark, 0, 0.51, 0);
    So.cyl(T, 0.11, 0.11, 0.05, HUE.dark, 0, 0.74, 0, 0, { rx: HALF, seg: 32 });
    So.cring(T, 0.125, 0.022, 0, 0.74, 0, { rx: HALF });
    for (const sx of [-1, 1]) for (let k = 0; k < 9; k++) So.cball(T, 0.027, sx * 0.135, 0.29 + k * 0.05, 0, { seg: 10 });
    So.shell(T, [[0, 0.17], [0.03, 0.172], [0.06, 0.2], [0.15, 0.245], [0.17, 0.265], [0.15, 0.28], [0, 0.285]], 0, 0, 0);
    for (const F of [T, T.at(0, 0, 0, Math.PI)]) {
      So.cyl(F, 0.03, 0.03, 0.004, HUE.org, 0, 0.765, -0.028, 1, { rx: HALF, seg: 16 });
      So.box(F, 0.024, 0.065, 0.004, HUE.org, 0, 0.728, -0.028, 1);
      So.say(F, "CYPHERPUNKS", 0.003, HUE.hot, 0, 0.6, -0.03, 1);
      So.say(F, "WRITE CODE", 0.003, HUE.hot, 0, 0.57, -0.03, 1);
      for (let k = 0; k < 7; k++) { const w = 0.05 + ((k * 7) % 5) * 0.022; So.box(F, w, 0.007, 0.003, k === 6 ? HUE.org : HUE.blu, 0.085 - (k % 3) * 0.02 - w / 2, 0.525 - k * 0.029, -0.027, 1); }
    }
    // The wall: a chrome footing ring, then courses of bricks, each shorter than the one below, highest at the back.
    So.cring(T, 0.33, 0.016, 0, 0.105, 0);
    for (let k = 0; k < 3; k++) So.rod(T, [0.33 * Math.sin(k * TAU / 3 + 1), 0.1, 0.33 * Math.cos(k * TAU / 3 + 1)], [0.26 * Math.sin(k * TAU / 3 + 1), 0.03, 0.26 * Math.cos(k * TAU / 3 + 1)], 0.012, HUE.steel);
    const R = 0.33, STEP = TAU / 12, brick = (a, y, c, e, tip = 0) => {
      const B = T.at(R * Math.sin(a), y, R * Math.cos(a), a, 0, tip);
      if (c) { So.box(B, 0.15, 0.07, 0.036, c, 0, 0, 0, e); return; }
      Gl.box(B, 0.15, 0.07, 0.034, HUE.dimBlu, 0, 0, 0, 0.5);
      So.box(B, 0.15, 0.005, 0.038, HUE.blu, 0, 0.036, 0, 1);
    };
    [12, 10, 8, 5, 3].forEach((n, c) => { for (let i = 0; i < n; i++) brick((i - (n - 1) / 2) * STEP, 0.16 + c * 0.082, null); });
    brick(2 * STEP, 0.16 + 4 * 0.082 + 0.09, HUE.org, 1, 0.25);
    brick(-3 * STEP, 0.16 + 3 * 0.082 + 0.07, HUE.amb, 1, -0.2);
    label(T, ["A CYPHERPUNK'S MANIFESTO", "PRIVACY IS BUILT, NOT ASKED FOR. 1993"]);
  };
  // CyberCash: a card of light rides an armoured glass tube from the buyer's pod, through the chrome gateway that
  // checks it, to the shop, which sends a parcel out and a green "paid" back.
  PIECE.cybercash = (T) => {
    base(T, 0.44);
    const y = 0.46;
    // The safe line: a glass tube ribbed in chrome.
    Gl.cyl(T, 0.06, 0.06, 0.72, HUE.dimBlu, 0, y, 0, 0.5, { rz: HALF, seg: 16 });
    for (const x of [-0.26, -0.2, 0.2, 0.26]) So.cring(T, 0.068, 0.011, x, y, 0, { rz: HALF, seg: 24 });
    // The gateway: chrome pods above and below, three chrome hoops round the line between them.
    So.shell(T, pod(0.13, 0.12, 0.32), 0, 0, 0); So.shell(T, pod(0.14, 0.6, 0.83), 0, 0, 0);
    for (const x of [-0.075, 0, 0.075]) So.cring(T, x ? 0.115 : 0.135, 0.017, x, y, 0, { rz: HALF });
    So.ring(T, 0.142, 0.006, HUE.blu, 0, 0.715, 0, 1, { seg: 40 }); So.ring(T, 0.132, 0.005, HUE.blu, 0, 0.22, 0, 1, { seg: 40 });
    Gl.ball(T, 0.06, HUE.dimBlu, 0, 0.835, 0, 0.5, { seg: 12 }); So.ball(T, 0.026, HUE.green, 0, 0.845, 0, 1);
    // The card on its way in, its wake behind it; past the gateway only a green "approved" goes on.
    So.box(T, 0.11, 0.07, 0.01, HUE.org, 0.16, y, 0, 1); So.box(T, 0.11, 0.013, 0.014, HUE.dark, 0.16, y + 0.014, 0); So.box(T, 0.03, 0.012, 0.014, HUE.hot, 0.185, y - 0.018, 0, 1);
    for (let k = 1; k < 4; k++) So.box(T, 0.01, 0.05 - k * 0.012, 0.006, HUE.amb, 0.215 + k * 0.022, y, 0, 1);
    // What runs in the line: the card's sparks in to the gateway, glints of green on from it, and the shop's lamp.
    for (let i = 0; i < 3; i++) { So.flow(T, SPARK(), 0.34, y, 0, [-0.2, 0, 0], 0.012, 1.8, +(i / 3).toFixed(2)); So.flow(T, GLINT(), -0.1, y, 0, [-0.2, 0, 0], 0.012, 2.2, +(i / 3).toFixed(2)); }
    So.blink(T, LAMP.green(), -0.38, 0.45, -0.1, 1.4, 0);
    So.gem(T, 0.032, 0.075, HUE.green, -0.175, y, 0, 1); So.box(T, 0.03, 0.008, 0.008, HUE.green, -0.125, y, 0, 1);
    // The buyer (viewer's left): a chrome pod with a blue canopy and a light inside.
    So.shell(T, pod(0.1, 0.35, 0.57), 0.38, 0, 0); So.ccyl(T, 0.014, 0.03, 0.31, 0.38, 0.2, 0);
    Gl.ball(T, 0.075, HUE.dimBlu, 0.38, 0.59, 0, 0.5, { seg: 12 }); So.ball(T, 0.03, HUE.blu, 0.38, 0.61, 0, 1);
    So.ring(T, 0.102, 0.005, HUE.blu, 0.38, 0.46, 0, 1);
    // The shop (viewer's right): a chrome drum under a chrome roof, lit windows, a parcel on its way out.
    So.ccyl(T, 0.095, 0.095, 0.2, -0.38, 0.45, 0); So.ccyl(T, 0.014, 0.03, 0.31, -0.38, 0.2, 0);
    So.shell(T, [[0, 0.55], [0.11, 0.552], [0.117, 0.565], [0.09, 0.6], [0.04, 0.635], [0, 0.645]], -0.38, 0, 0);
    So.ring(T, 0.097, 0.007, HUE.org, -0.38, 0.5, 0, 1); So.ring(T, 0.097, 0.007, HUE.org, -0.38, 0.4, 0, 1);
    So.box(T, 0.07, 0.07, 0.07, HUE.cer, -0.38, 0.75, 0, 0.2, { ry: 0.5 }); So.box(T, 0.074, 0.014, 0.074, HUE.blu, -0.38, 0.75, 0, 1, { ry: 0.5 });
    // What each one is, front and back.
    for (const [F, s] of [[T, 1], [T.at(0, 0, 0, Math.PI), -1]]) {
      So.panel(F, 0.1, 0.034, HUE.blu, s * 0.38, 0.29, -0.06); So.say(F, "BUYER", 0.003, HUE.dark, s * 0.38, 0.29, -0.071, 0);
      So.panel(F, 0.14, 0.034, HUE.pale, 0, 0.71, -0.142); So.say(F, "GATEWAY", 0.003, HUE.dark, 0, 0.71, -0.153, 0);
      So.panel(F, 0.1, 0.034, HUE.org, s * -0.38, 0.29, -0.06); So.say(F, "SHOP", 0.003, HUE.dark, s * -0.38, 0.29, -0.071, 0);
    }
    label(T, ["CYBERCASH", "A CARD CARRIED SAFELY: BUYER, GATEWAY, SHOP. 1994"]);
  };
  // The Cyphernomicon: a book opened all the way round, twenty glass chapters fanned from a glowing chrome spine
  // between two chrome covers, their index tabs stepping down in a spiral; it floats tipped toward the reader.
  PIECE.cyphernomicon = (T) => {
    base(T, 0.4);
    So.ccyl(T, 0.016, 0.05, 0.12, 0, 0.09, 0); So.cball(T, 0.035, 0, 0.16, 0);
    const B = T.at(0, 0.49, 0, 0, -0.16, 0.05);
    // The covers: a chrome saucer below and a dome above, each with a rim of warm light.
    So.shell(B, [[0, -0.35], [0.1, -0.345], [0.22, -0.32], [0.31, -0.285], [0.335, -0.26], [0.32, -0.244], [0.2, -0.238], [0, -0.235]], 0, 0, 0, { seg: 32 });
    So.shell(B, [[0, 0.235], [0.2, 0.238], [0.32, 0.244], [0.335, 0.26], [0.31, 0.285], [0.22, 0.32], [0.1, 0.345], [0, 0.35]], 0, 0, 0, { seg: 32 });
    So.ring(B, 0.336, 0.006, HUE.org, 0, -0.252, 0, 1, { seg: 48 }); So.ring(B, 0.336, 0.006, HUE.org, 0, 0.252, 0, 1, { seg: 48 });
    So.cring(B, 0.07, 0.012, 0, 0.36, 0); So.ball(B, 0.028, HUE.blu, 0, 0.372, 0, 1);
    // The spine: a core of warm light in chrome collars.
    So.cyl(B, 0.04, 0.04, 0.47, HUE.org, 0, 0, 0, 1, { seg: 16 });
    for (const y of [-0.21, 0, 0.21]) So.shell(B, [[0, y - 0.02], [0.045, y - 0.018], [0.06, y], [0.045, y + 0.018], [0, y + 0.02]], 0, 0, 0, { seg: 16 });
    // Twenty chapters: a glass leaf each, lines of writing through it, and a tab at its edge.
    for (let i = 0; i < 20; i++) {
      const L = B.at(0, 0, 0, -i * TAU / 20 + HALF), open = i % 5 === 0;
      Gl.box(L, 0.25, 0.44, 0.006, open ? HUE.dimOrg : HUE.dimBlu, 0.185, 0, 0, 0.5);
      for (let k = 0; k < 3; k++) So.box(L, 0.16 - ((i + k) % 3) * 0.03, 0.005, 0.01, open ? HUE.hot : HUE.pale, 0.17, 0.13 - k * 0.05 - (i % 4) * 0.03, 0, 0.7);
      So.box(L, 0.045, 0.034, 0.014, open ? HUE.org : HUE.teal, 0.33, 0.19 - i * 0.02, 0, 1);
    }
    // The bookmark: a ribbon of light hung from the top cover.
    So.box(B, 0.022, 0.56, 0.004, HUE.amb, -0.2, -0.03, -0.275, 1); So.cball(B, 0.02, -0.2, -0.32, -0.275, { seg: 8 });
    label(T, ["THE CYPHERNOMICON", "THE LIST'S FAQ, A BOOK IN TWENTY CHAPTERS. 1994"]);
  };
  // How to Make a Mint: electronic cash in three steps down a cascade. A chrome press strikes a coin of light, the
  // coin is hidden in a dark glass sphere, and it is spent into a chrome till; the survey's page floats over it all.
  PIECE.mint = (T) => {
    base(T, 0.44);
    const tag = (t, c, x, y, z) => { So.panel(T, t.length * 0.018 + 0.024, 0.034, c, x, y, z); So.say(T, t, 0.003, HUE.dark, x, y, z - 0.011, 0); };
    const dots = (a, b, lift, c) => { for (let k = 1; k < 6; k++) { const t = k / 6; So.ball(T, 0.008, c, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + lift * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t, 1, { seg: 6 }); } };
    // 1. The press (viewer's left, high): a chrome hoop for a frame, the ram coming down, the anvil coming up, and
    // the coin struck hot between them; a finished coin leaves toward the next step.
    So.cring(T, 0.165, 0.022, 0.3, 0.67, 0, { rx: HALF }); So.ccyl(T, 0.016, 0.034, 0.44, 0.3, 0.27, 0);
    So.shell(T, [[0, 0.69], [0.05, 0.692], [0.075, 0.71], [0.085, 0.75], [0.07, 0.79], [0.035, 0.815], [0.02, 0.83], [0, 0.832]], 0.3, 0, 0);
    So.shell(T, [[0, 0.508], [0.02, 0.51], [0.035, 0.525], [0.07, 0.55], [0.085, 0.59], [0.075, 0.63], [0.05, 0.648], [0, 0.65]], 0.3, 0, 0);
    So.cyl(T, 0.066, 0.066, 0.018, HUE.org, 0.3, 0.67, 0, 1, { seg: 20 }); So.ring(T, 0.09, 0.004, HUE.hot, 0.3, 0.67, 0, 1);
    for (let k = 0; k < 6; k++) So.rod(T, [0.3 + 0.1 * Math.cos(k * TAU / 6), 0.67, 0.1 * Math.sin(k * TAU / 6)], [0.3 + 0.135 * Math.cos(k * TAU / 6), 0.67 + (k % 2 ? 0.02 : -0.02), 0.135 * Math.sin(k * TAU / 6)], 0.005, HUE.hot, 1);
    coin(T, 0.085, 0.6, -0.04, 0.045, HUE.org); tag("MINT", HUE.org, 0.3, 0.44, -0.03);
    // Sparks off the strike, and the molten metal the press is fed from, simmering in its tank.
    for (let i = 0; i < 4; i++) So.flow(T, SPARK(), 0.3, 0.67, -0.03, [(i - 1.5) * 0.07, 0.05 + (i % 2) * 0.04, -0.08], 0.008, 1.1 + i * 0.2, i * 0.27);
    tank(T, 0.43, 0.05, 0.1, 0.028, 0.3, HUE.amb, 0.78, 3, BUBBLE.warm); So.rod(T, [0.43, 0.36, 0.1], [0.36, 0.56, 0.03], 0.008, HUE.steel, 0.3);
    // 2. Blinded (centre): the coin inside a dark sphere in a chrome hoop, on a chrome cup.
    So.ccyl(T, 0.014, 0.03, 0.26, 0, 0.18, 0); So.shell(T, [[0, 0.3], [0.03, 0.302], [0.07, 0.325], [0.085, 0.36], [0.07, 0.366], [0, 0.345]], 0, 0, 0);
    Gl.ball(T, 0.105, HUE.dimBlu, 0, 0.46, 0, 0.5, { seg: 14 }); coin(T, 0, 0.46, 0, 0.042, HUE.off);
    // The coin is steeped out of sight: the sphere half full of dark liquid, bubbling.
    Gl.lathe(T, [[0, 0.365], [0.04, 0.37], [0.075, 0.395], [0.094, 0.43], [0.098, 0.455], [0, 0.455]], HUE.blu, 0, 0, 0, 0.9, { seg: 24 });
    rising(T, BUBBLE.pale, 0, 0.38, 0, 0.14, 0.03, 3);
    So.cring(T, 0.125, 0.012, 0, 0.46, 0, { rx: 0.5, rz: 0.3 }); So.ring(T, 0.108, 0.005, HUE.blu, 0, 0.46, 0, 1, { rx: HALF });
    tag("BLIND", HUE.blu, 0, 0.25, -0.03);
    // 3. Spent (viewer's right, low): the coin dropping into the slot of a chrome till that lights green.
    So.shell(T, pod(0.12, 0.11, 0.33), -0.3, 0, 0); So.box(T, 0.11, 0.012, 0.026, HUE.dark, -0.3, 0.328, 0);
    coin(T, -0.3, 0.37, 0, 0.048, HUE.org); So.ring(T, 0.122, 0.006, HUE.green, -0.3, 0.22, 0, 1);
    tag("SPEND", HUE.green, -0.3, 0.2, -0.125);
    dots([0.085, 0.6, -0.04], [0, 0.57, 0], 0.02, HUE.amb); dots([0, 0.57, 0], [-0.3, 0.43, 0], 0.07, HUE.pale);
    // The survey itself: a page of light looking down on the three steps.
    sheet(T.at(-0.28, 0.72, 0.08, -0.35, 0.12), 0.22, 0.26, 5);
    label(T, ["HOW TO MAKE A MINT", "ANONYMOUS CASH: MINTED, BLINDED, SPENT. NSA, 1996"]);
  };
  // e-gold: the gold never moves. A chrome vault floats shut round a stack of bars seen through its glass waist,
  // while over it grams pass as light from one account's pod to another's.
  PIECE.egold = (T) => {
    base(T, 0.44);
    // The vault: a chrome bowl, a glass waist with the bars inside, a chrome dome with a wheel on top.
    So.shell(T, [[0, 0.12], [0.08, 0.125], [0.16, 0.15], [0.22, 0.2], [0.25, 0.26], [0.26, 0.305], [0.24, 0.32], [0, 0.32]], 0, 0, 0, { seg: 32 });
    So.shell(T, [[0, 0.5], [0.24, 0.5], [0.26, 0.515], [0.25, 0.56], [0.21, 0.63], [0.14, 0.69], [0.06, 0.72], [0, 0.725]], 0, 0, 0, { seg: 32 });
    Gl.cyl(T, 0.235, 0.235, 0.18, HUE.dimBlu, 0, 0.41, 0, 0.3, { seg: 32 });
    So.ring(T, 0.262, 0.006, HUE.org, 0, 0.31, 0, 1, { seg: 48 }); So.ring(T, 0.262, 0.006, HUE.org, 0, 0.51, 0, 1, { seg: 48 });
    // the bars stand in a pool of molten gold, and it simmers
    Gl.cyl(T, 0.225, 0.225, 0.05, HUE.amb, 0, 0.347, 0, 0.9, { seg: 32 });
    for (let k = 0; k < 6; k++) rising(T, BUBBLE.warm, 0.19 * Math.sin(k * TAU / 6 + 0.5), 0.33, 0.19 * Math.cos(k * TAU / 6 + 0.5), 0.15, 0.012, 1, 2.6 + k * 0.3);
    for (let k = 0; k < 4; k++) So.box(T, 0.012, 0.19, 0.012, HUE.steel, 0.25 * Math.sin(k * HALF + 0.785), 0.41, 0.25 * Math.cos(k * HALF + 0.785));
    [3, 2, 1].forEach((n, r) => { for (let i = 0; i < n; i++) So.box(T, 0.1, 0.045, 0.2 - r * 0.03, HUE.gold, (i - (n - 1) / 2) * 0.112, 0.345 + r * 0.05, 0, 0.7); });
    So.ccyl(T, 0.02, 0.03, 0.04, 0, 0.74, 0); So.cring(T, 0.075, 0.012, 0, 0.765, 0); So.cball(T, 0.026, 0, 0.765, 0);
    for (let k = 0; k < 3; k++) So.cbox(T, 0.15, 0.012, 0.012, 0, 0.765, 0, { ry: k * TAU / 6 });
    // Two accounts, one either side: a chrome pod on a stalk, its balance on a panel at the front and at the back.
    for (const s of [1, -1]) {
      So.ccyl(T, 0.012, 0.028, 0.5, s * 0.41, 0.29, 0); So.shell(T, pod(0.075, 0.53, 0.71), s * 0.41, 0, 0);
      So.ring(T, 0.077, 0.005, HUE.blu, s * 0.41, 0.62, 0, 1); So.ball(T, 0.022, HUE.blu, s * 0.41, 0.725, 0, 1);
      for (const [F, f] of [[T, 1], [T.at(0, 0, 0, Math.PI), -1]]) { So.panel(F, 0.12, 0.05, HUE.blu, f * s * 0.41, 0.62, -0.08); So.say(F, s > 0 ? "-5G" : "+5G", 0.005, HUE.dark, f * s * 0.41, 0.62, -0.092, 0); }
    }
    // The transfer: an arc of light over the vault, and the grams on their way along it.
    const arc = (x) => [x, 0.885 - 0.15 * (x / 0.41) ** 2, 0];
    for (let k = 0; k < 10; k++) So.rod(T, arc(0.41 - k * 0.082), arc(0.41 - (k + 1) * 0.082), 0.006, HUE.blu, 1);
    So.gem(T, 0.024, 0.06, HUE.gold, -0.12, arc(-0.12)[1], 0, 0.9);
    for (let k = 1; k < 4; k++) So.ball(T, 0.012 - k * 0.002, HUE.amb, -0.12 + k * 0.05, arc(-0.12 + k * 0.05)[1], 0, 1, { seg: 6 });
    label(T, ["E-GOLD", "GOLD STAYS IN THE VAULT, GRAMS MOVE ONLINE. 1996"]);
  };
  // Hashcash: a finned chrome engine burns work, throwing off a spiral of dead tries, until one comes out a stamp
  // whose hash starts with zeros; a little lens at its side checks it at once and shows green.
  PIECE.hashcash = (T) => {
    base(T, 0.42);
    // The engine: a core of heat between chrome cooling fins, a chrome cap and a nozzle of fire.
    So.cyl(T, 0.07, 0.07, 0.3, HUE.org, 0, 0.3, 0, 0.7, { seg: 20 });
    for (let k = 0; k < 5; k++) { const y = 0.14 + k * 0.06, r = 0.2 - k * 0.016; So.shell(T, [[0, y], [r - 0.04, y + 0.003], [r, y + 0.016], [r, y + 0.022], [r - 0.04, y + 0.035], [0, y + 0.038]], 0, 0, 0); }
    So.shell(T, [[0, 0.44], [0.11, 0.442], [0.12, 0.46], [0.09, 0.49], [0.04, 0.505], [0, 0.51]], 0, 0, 0);
    So.cyl(T, 0.006, 0.03, 0.075, HUE.hot, 0, 0.545, 0, 1, { seg: 10 });
    // Its coolant: a tank either side at the back, boiling, piped to the core; sparks off the nozzle.
    for (const sx of [-1, 1]) { tank(T, sx * 0.21, 0.05, 0.19, 0.03, 0.3, HUE.teal); So.rod(T, [sx * 0.21, 0.36, 0.19], [sx * 0.06, 0.4, 0.04], 0.008, HUE.steel, 0.3); }
    for (let i = 0; i < 5; i++) So.flow(T, SPARK(), 0, 0.56, -0.02, [(i - 2) * 0.05, 0.16, -0.07], 0.012, 1.3 + i * 0.17, i * 0.21);
    // The tries that failed: dead tiles spiralling up round it, warming as they near the one that worked.
    for (let i = 0; i < 12; i++) {
      const a = i * 0.62 + 0.6, y = 0.17 + i * 0.033, c = i > 9 ? HUE.org : i > 7 ? HUE.dimOrg : HUE.off;
      const F = T.at(0.31 * Math.sin(a), y, 0.31 * Math.cos(a), a + Math.PI);
      So.box(F, 0.07, 0.046, 0.008, c, 0, 0, 0, i > 9 ? 0.9 : 0.4); So.box(F, 0.044, 0.007, 0.012, i > 7 ? HUE.hot : HUE.dark, 0, 0, 0, i > 7 ? 0.8 : 0);
    }
    // The stamp: a dark plate with a chrome perforated edge, the zeros hot from the work, the same on both faces.
    So.box(T, 0.4, 0.25, 0.018, HUE.dark, 0, 0.705, 0);
    for (let i = 0; i < 9; i++) for (const y of [0.58, 0.83]) So.cball(T, 0.016, -0.2 + i * 0.05, y, 0, { seg: 8 });
    for (let i = 1; i < 5; i++) for (const x of [-0.2, 0.2]) So.cball(T, 0.016, x, 0.58 + i * 0.05, 0, { seg: 8 });
    for (const F of [T, T.at(0, 0, 0, Math.PI)]) {
      So.say(F, "0000", 0.009, HUE.org, 0, 0.735, -0.013, 1);
      So.say(F, "9F3A 7C1E", 0.004, HUE.teal, 0, 0.655, -0.013, 0.8);
      So.box(F, 0.34, 0.004, 0.004, HUE.blu, 0, 0.8, -0.01, 1); So.box(F, 0.34, 0.004, 0.004, HUE.blu, 0, 0.615, -0.01, 1);
    }
    // The check: a chrome lens on a stalk, green the moment it looks.
    So.ccyl(T, 0.01, 0.024, 0.52, -0.39, 0.3, 0); So.cring(T, 0.06, 0.012, -0.39, 0.62, 0, { rx: HALF, seg: 24 });
    Gl.cyl(T, 0.055, 0.055, 0.008, HUE.green, -0.39, 0.62, 0, 0.6, { rx: HALF, seg: 20 });
    So.say(T, "OK", 0.005, HUE.green, -0.39, 0.62, -0.012, 1);
    So.rod(T, [-0.34, 0.64, 0], [-0.22, 0.69, 0], 0.005, HUE.green, 1);
    label(T, ["HASHCASH", "WORK BURNED FOR A STAMP ANYONE CAN CHECK. 1997"]);
  };
  // 1997 · the smart contract: a machine with no keeper. A coin goes into the chrome hopper, falls to the gate where
  // the rule is tested (green: paid), and the goods are let out of the bell below.
  PIECE.szabo97 = (T) => {
    base(T, 0.42);
    // The hopper, with the coin standing in its slot.
    So.shell(T, pod(0.155, 0.615, 0.8), 0, 0, 0);
    So.ring(T, 0.158, 0.005, HUE.org, 0, 0.7075, 0, 1, { seg: 48 });
    So.cyl(T, 0.055, 0.055, 0.012, HUE.org, 0, 0.83, 0, 0.9, { rx: HALF, seg: 20 }); So.cring(T, 0.055, 0.008, 0, 0.83, 0, { rx: HALF, seg: 24 });
    // The gate: a glass chamber with nobody in it, only the rule.
    Gl.cyl(T, 0.1, 0.1, 0.215, HUE.dimBlu, 0, 0.5075, 0, 0.5, { seg: 24 });
    So.cring(T, 0.118, 0.02, 0, 0.5075, 0);
    So.ring(T, 0.085, 0.008, HUE.green, 0, 0.5075, 0, 1);
    for (let i = 0; i < 3; i++) { const a = TAU * i / 3 + 1.55; So.blink(T, LAMP.green(), 0.14 * Math.sin(a), 0.5075, 0.14 * Math.cos(a), 1.5, +(i / 3).toFixed(2)); }
    So.gem(T, 0.038, 0.1, HUE.green, 0, 0.5075, 0, 1);
    So.rod(T, [0, 0.615, 0], [0, 0.565, 0], 0.006, HUE.org, 1);
    So.rod(T, [0, 0.45, 0], [0, 0.2, 0], 0.006, HUE.blu, 1);
    for (let i = 0; i < 3; i++) { const a = TAU * i / 3 + 0.5, x = 0.145 * Math.sin(a), z = 0.145 * Math.cos(a); So.rod(T, [x, 0.325, z], [x, 0.69, z], 0.009, HUE.steel); }
    // The bell the goods come out of, and the goods.
    So.shell(T, [[0, 0.25], [0.08, 0.245], [0.17, 0.23], [0.2, 0.235], [0.19, 0.27], [0.15, 0.32], [0.1, 0.37], [0.06, 0.395], [0, 0.4]], 0, 0, 0);
    So.ring(T, 0.185, 0.006, HUE.blu, 0, 0.23, 0, 1, { seg: 48 });
    So.cyl(T, 0.046, 0.046, 0.07, HUE.blu, 0, 0.15, 0, 1, { seg: 16 });
    So.ccyl(T, 0.03, 0.052, 0.018, 0, 0.194, 0); So.ccyl(T, 0.052, 0.03, 0.018, 0, 0.106, 0);
    // The three steps, named.
    So.say(T, "COIN IN", 0.004, HUE.org, 0.37, 0.83, 0); So.rod(T, [0.27, 0.83, 0], [0.075, 0.83, 0], 0.003, HUE.org, 0.8);
    So.say(T, "IF PAID", 0.004, HUE.green, 0.37, 0.5075, 0); So.rod(T, [0.27, 0.5075, 0], [0.15, 0.5075, 0], 0.003, HUE.green, 0.8);
    So.say(T, "GOODS OUT", 0.004, HUE.blu, 0.36, 0.2, -0.2); So.rod(T, [0.24, 0.2, -0.2], [0.06, 0.15, -0.03], 0.003, HUE.blu, 0.8);
    label(T, ["SMART CONTRACTS", "COIN IN, RULE MET, GOODS OUT: NO ONE IN THE MIDDLE"]);
  };
  // 1998 · secure property titles: one property held aloft by six keepers of the same register. Five copies agree
  // and their beams carry the title; the sixth, a forgery, is red, cut off from the rest and carries nothing.
  PIECE.titles = (T) => {
    base(T, 0.44);
    // The property: a house on its plot, ringed by its title.
    So.shell(T, [...Array.from({ length: 7 }, (_, i) => [0.2 * Math.sin(i * HALF / 6), 0.63 - 0.1 * Math.cos(i * HALF / 6)]), [0.17, 0.642], [0, 0.646]], 0, 0, 0, { seg: 32 });
    So.ring(T, 0.203, 0.004, HUE.org, 0, 0.632, 0, 1, { seg: 48 });
    So.box(T, 0.17, 0.105, 0.14, HUE.cer, 0, 0.696, 0);
    So.ccyl(T, 0, 0.15, 0.1, 0, 0.798, 0, { seg: 4, ry: TAU / 8 });
    for (const s of [-1, 1]) { So.box(T, 0.036, 0.062, 0.004, HUE.org, s * 0.04, 0.675, s * -0.072, 1); So.box(T, 0.04, 0.036, 0.004, HUE.amb, s * -0.035, 0.705, s * -0.072, 1); }
    // The keepers, each with its copy of the register over its head.
    const P = Array.from({ length: 6 }, (_, i) => { const a = TAU * (i + 0.5) / 6; return [0.36 * Math.sin(a), -0.36 * Math.cos(a)]; });
    P.forEach(([x, z], i) => {
      const bad = i === 5, K = T.at(x, 0, z, Math.atan2(-x, -z));
      So.shell(K, [[0, 0.06], [0.045, 0.06], [0.054, 0.076], [0.04, 0.098], [0.021, 0.15], [0.014, 0.24], [0.03, 0.262], [0, 0.274]], 0, 0, 0, { seg: 16 });
      if (bad) { So.ball(K, 0.034, HUE.red, 0, 0.31, 0, 0.7); So.blink(K, LAMP.red(), 0, 0.357, 0, 0.9, 0); } else So.cball(K, 0.034, 0, 0.31, 0);
      sheet(K.at(0, 0.44, 0), 0.11, 0.13, bad ? 5 : 3, bad ? HUE.red : HUE.pale);
      if (bad) {
        const m = [x * 0.84, 0.556, z * 0.84];
        So.rod(T, [x, 0.51, z], m, 0.004, HUE.red, 0.9);
        for (const s of [-1, 1]) So.rod(T, [m[0] - 0.028, m[1] - s * 0.028, m[2]], [m[0] + 0.028, m[1] + s * 0.028, m[2]], 0.008, HUE.red, 1);
        return;
      }
      So.rod(T, [x, 0.51, z], [x * 0.42, 0.585, z * 0.42], 0.004, HUE.blu, 0.9);
      if (i < 4) So.rod(T, [x, 0.372, z], [P[i + 1][0], 0.372, P[i + 1][1]], 0.003, HUE.teal, 0.8);
    });
    label(T, ["PROPERTY TITLES", "MANY KEEPERS, ONE REGISTER: NO CLERK CAN FORGE IT"]);
  };
  // 1998 · b-money: at the centre a puzzle of chrome dials turned into line, and the coin it makes; round it five
  // participants, each carrying the same five accounts as a ring of bars, every one linked to every other.
  PIECE.bmoney = (T) => {
    base(T, 0.44);
    // The puzzle: four dials, their marks brought into line, and the coin that comes of it.
    for (let k = 0; k < 4; k++) {
      const y = 0.56 + k * 0.058;
      So.cring(T, 0.07, 0.03, 0, y, 0, { seg: 24 });
      for (let j = 0; j < 4; j++) { const a = TAU * j / 4; So.box(T, 0.018, 0.036, 0.018, HUE.pale, 0.1 * Math.sin(a), y, 0.1 * Math.cos(a), 1); }
    }
    So.rod(T, [0, 0.764, 0], [0, 0.795, 0], 0.006, HUE.org, 1);
    So.cyl(T, 0.05, 0.05, 0.012, HUE.org, 0, 0.84, 0, 0.9, { rx: HALF, seg: 20 }); So.cring(T, 0.05, 0.008, 0, 0.84, 0, { rx: HALF, seg: 24 });
    So.rod(T, [0, 0.53, 0], [0, 0.05, 0], 0.005, HUE.blu, 0.9);
    So.say(T, "SOLVED", 0.004, HUE.pale, 0.32, 0.647, 0); So.rod(T, [0.235, 0.647, 0], [0.115, 0.647, 0], 0.003, HUE.pale, 0.8);
    // The participants: each a saucer with all five accounts standing on it, the same on every one.
    const H = [0.05, 0.11, 0.03, 0.08, 0.06];
    const P = Array.from({ length: 5 }, (_, i) => { const a = TAU * i / 5, z = -0.33 * Math.cos(a); return [0.33 * Math.sin(a), 0.24 + 0.085 * z / 0.33, z]; });
    P.forEach(([x, y, z], i) => {
      So.shell(T, [[0, 0], [0.05, 0.002], [0.085, 0.028], [0.092, 0.044], [0.075, 0.06], [0, 0.065]], x, y, z, { seg: 20 });
      So.ring(T, 0.093, 0.004, HUE.blu, x, y + 0.044, z, 1, { seg: 24 });
      H.forEach((h, k) => { const b = TAU * k / 5; So.box(T, 0.022, h, 0.022, k === 1 ? HUE.hot : HUE.org, x + 0.05 * Math.sin(b), y + 0.065 + h / 2, z - 0.05 * Math.cos(b), 0.9); });
      for (let j = i + 1; j < 5; j++) So.rod(T, [x, y + 0.03, z], [P[j][0], P[j][1] + 0.03, P[j][2]], 0.004, HUE.blu, 0.9);
    });
    label(T, ["B-MONEY", "PUZZLES MAKE THE MONEY, ALL KEEP EVERY ACCOUNT"]);
  };
  // 1999 · the virtual specialist: a program afloat in the gap of a price ladder, bids (blue) climbing to it from
  // below and offers (orange) stepping away above, always showing one price to buy at and one to sell at.
  PIECE.keiser = (T) => {
    base(T, 0.44);
    // The ladder of prices: chrome steps, bids below the gap and offers above it.
    for (let i = 0; i < 4; i++) {
      const xb = 0.42 - i * 0.085, yb = 0.17 + i * 0.07, xa = -0.165 - i * 0.085, ya = 0.62 + i * 0.07;
      So.cbox(T, 0.078, 0.038, 0.2, xb, yb, 0); So.cbox(T, 0.078, 0.038, 0.2, xa, ya, 0);
      for (const s of [-1, 1]) { So.box(T, 0.078, 0.016, 0.006, HUE.blu, xb, yb, s * 0.103, 1); So.box(T, 0.078, 0.016, 0.006, HUE.org, xa, ya, s * 0.103, 1); }
    }
    // The program in the gap: two chrome halves about a core of light.
    So.shell(T, [[0, 0.37], [0.05, 0.375], [0.09, 0.4], [0.11, 0.44], [0.105, 0.455], [0, 0.455]], 0, 0, 0);
    So.shell(T, [[0, 0.545], [0.105, 0.545], [0.11, 0.56], [0.09, 0.6], [0.05, 0.625], [0, 0.63]], 0, 0, 0);
    Gl.cyl(T, 0.095, 0.095, 0.09, HUE.dimBlu, 0, 0.5, 0, 0.5, { seg: 24 });
    So.gem(T, 0.04, 0.08, HUE.pale, 0, 0.5, 0, 1);
    So.ring(T, 0.07, 0.006, HUE.blu, 0, 0.48, 0, 1); So.ring(T, 0.07, 0.006, HUE.org, 0, 0.52, 0, 1);
    So.cball(T, 0.02, 0, 0.66, 0);
    for (const z of [-0.1, 0.1]) { So.blink(T, LAMP.teal(), 0, 0.48, z, 1.2, 0); So.blink(T, LAMP.org(), 0, 0.52, z, 1.2, 0.5); }
    // Its two standing quotes, shown to the front and to the back.
    for (const s of [1, -1]) {
      const F = s > 0 ? T : T.at(0, 0, 0, Math.PI);
      So.rod(F, [s * 0.1, 0.5, -0.03], [s * 0.2, 0.56, -0.06], 0.012, HUE.steel); So.rod(F, [s * -0.1, 0.5, -0.03], [s * -0.2, 0.44, -0.06], 0.012, HUE.steel);
      So.panel(F, 0.2, 0.12, HUE.blu, s * 0.3, 0.56, -0.06); So.say(F, "BUY", 0.004, HUE.dark, s * 0.3, 0.597, -0.073, 0); So.say(F, "99", 0.008, HUE.dark, s * 0.3, 0.543, -0.073, 0);
      So.panel(F, 0.2, 0.12, HUE.org, s * -0.3, 0.44, -0.06); So.say(F, "SELL", 0.004, HUE.dark, s * -0.3, 0.477, -0.073, 0); So.say(F, "101", 0.008, HUE.dark, s * -0.3, 0.423, -0.073, 0);
    }
    label(T, ["THE VIRTUAL SPECIALIST", "A PROGRAM THAT ALWAYS QUOTES A BUY AND A SELL PRICE"]);
  };
  // 1998 to 2001 · web points: a chrome horn blowing a bubble full of points, and beside it the one that burst:
  // its issuer folded, the horn dark and tipped over, its points fallen grey to the deck.
  PIECE.dotcom = (T) => {
    base(T, 0.4);
    const horn = (F, on) => {
      So.shell(F, [[0, 0], [0.05, 0], [0.036, 0.04], [0.03, 0.12], [0.045, 0.2], [0.085, 0.25], [0.125, 0.265], [0.115, 0.277], [0.06, 0.25], [0, 0.24]], 0, 0, 0);
      So.ring(F, 0.121, 0.005, on ? HUE.org : HUE.off, 0, 0.275, 0, on ? 1 : 0, { seg: 32 });
    };
    // The issuer still trading: its bubble of points.
    horn(T.at(0.1, 0.09, 0.02), true);
    Gl.ball(T, 0.2, HUE.dimBlu, 0.1, 0.57, 0.02, 0.5, { seg: 16 });
    // Froth off the horn, winding up round the bubble.
    rising(T, BUBBLE.pale, 0.1, 0.4, 0.02, 0.5, 0.225, 6, 5);
    const cs = [HUE.org, HUE.amb, HUE.blu, HUE.hot, HUE.teal];
    for (let i = 0; i < 16; i++) { const a = i * 2.39996, t = (i + 0.5) / 16, r = 0.15 * Math.sqrt(1 - (2 * t - 1) ** 2); So.cyl(T, 0.023, 0.023, 0.007, cs[i % 5], 0.1 + r * Math.sin(a), 0.57 + 0.15 * (2 * t - 1), 0.02 + r * Math.cos(a), 0.85, { rx: HALF, ry: a, seg: 10 }); }
    Gl.ball(T, 0.045, HUE.pale, 0.31, 0.81, 0, 0.4, { seg: 10 }); Gl.ball(T, 0.03, HUE.pale, -0.04, 0.85, 0.05, 0.4, { seg: 10 });
    // The one that folded: the bubble burst, the points worth nothing.
    horn(T.at(-0.2, 0.08, -0.06, 0, 0, 0.4), false);
    for (let i = 0; i < 7; i++) { const a = TAU * i / 7 + 0.2; So.rod(T, [-0.3 + 0.05 * Math.sin(a), 0.5 + 0.05 * Math.cos(a), -0.06], [-0.3 + 0.1 * Math.sin(a), 0.5 + 0.1 * Math.cos(a), -0.06], 0.006, HUE.red, 0.9); }
    [[-0.34, 0.4, -0.1], [-0.25, 0.33, -0.17], [-0.37, 0.25, -0.15], [-0.28, 0.19, -0.2]].forEach(([x, y, z], i) => So.cyl(T, 0.024, 0.024, 0.008, HUE.steel, x, y, z, 0, { rx: HALF + 0.5 + i * 0.5, ry: i * 1.1, seg: 10 }));
    [[-0.08, -0.36], [-0.17, -0.3], [-0.24, -0.35], [-0.3, -0.25], [-0.37, -0.16], [-0.13, -0.24]].forEach(([x, z], i) => So.cyl(T, 0.026, 0.026, 0.008, HUE.off, x, 0.064, z, 0, { rx: 0.7 + (i % 3) * 0.35, ry: i * 0.9, seg: 10 }));
    label(T, ["WEB POINTS", "EARNED ON SITES, SPENT IN SHOPS, LOST IN THE BUST"]);
  };
  // 2001 · game gold: a small world sealed in glass inside a chrome ring. Its gold pours out on one side into a
  // dish, and real dollars climb in from the dish on the other.
  PIECE.games = (T) => {
    base(T, 0.4);
    const wy = 0.58, wz = 0.04;
    // The world: an island with its hills, a tower and a hoard, in a ball of glass.
    Gl.ball(T, 0.17, HUE.dimBlu, 0, wy, wz, 0.5, { seg: 16 });
    So.cring(T, 0.205, 0.027, 0, wy, wz, { rx: HALF, seg: 48, sides: 12 });
    So.cyl(T, 0.13, 0.03, 0.06, HUE.gun, 0, wy - 0.055, wz); So.cyl(T, 0.133, 0.133, 0.008, HUE.teal, 0, wy - 0.022, wz, 0.6);
    So.cyl(T, 0, 0.05, 0.1, HUE.cer, 0.045, wy + 0.032, wz + 0.03, 0, { seg: 6 }); So.cyl(T, 0, 0.035, 0.065, HUE.cer, 0.088, wy + 0.014, wz - 0.03, 0, { seg: 6 });
    So.ccyl(T, 0.015, 0.02, 0.08, -0.05, wy + 0.022, wz); So.cyl(T, 0, 0.027, 0.042, HUE.org, -0.05, wy + 0.083, wz, 0.8, { seg: 8 });
    for (const [x, z] of [[-0.01, -0.05], [0.015, -0.06], [0.002, -0.075]]) So.ball(T, 0.016, HUE.gold, x, wy - 0.006, wz + z, 0.6, { seg: 8 });
    So.rod(T, [0, wy - 0.22, wz], [0, 0.05, wz], 0.005, HUE.blu, 0.9);
    // The two dishes, and the trade across the world's edge: gold out, dollars in.
    const dish = [[0, 0], [0.04, 0.002], [0.08, 0.02], [0.097, 0.045], [0.086, 0.05], [0.05, 0.03], [0, 0.025]];
    const arc = (p, q, r, t) => [0, 1, 2].map((j) => (1 - t) * (1 - t) * p[j] + 2 * t * (1 - t) * q[j] + t * t * r[j]);
    for (const s of [-1, 1]) { So.shell(T, dish, s * 0.28, 0.12, -0.2, { seg: 20 }); So.ring(T, 0.097, 0.004, s < 0 ? HUE.org : HUE.green, s * 0.28, 0.166, -0.2, 1, { seg: 24 }); }
    for (let i = 0; i < 6; i++) { const p = arc([-0.13, 0.6, -0.08], [-0.33, 0.66, -0.2], [-0.29, 0.22, -0.2], i / 5); So.cyl(T.at(p[0], p[1], p[2], i * 0.5, i * 0.3), 0.028, 0.028, 0.008, HUE.gold, 0, 0, 0, 0.7, { rx: HALF, seg: 12 }); }
    for (let i = 0; i < 4; i++) So.cyl(T, 0.03, 0.03, 0.009, HUE.gold, -0.28 + (i % 2) * 0.012, 0.158 + i * 0.011, -0.2, 0.6, { seg: 12 });
    for (let i = 0; i < 4; i++) So.flow(T, SPARK(), -0.16, 0.6, -0.09, [-0.13, -0.4, -0.11], 0.015, 2.2, +(i / 4).toFixed(2));
    for (let i = 0; i < 5; i++) { const p = arc([0.29, 0.24, -0.2], [0.33, 0.66, -0.2], [0.14, 0.6, -0.08], i / 4), N = T.at(p[0], p[1], p[2], -0.25, 0, i * 0.2 - 0.4); So.box(N, 0.075, 0.042, 0.004, HUE.green, 0, 0, 0, 0.8); So.say(N, "$", 0.004, HUE.dark, 0, 0, -0.007, 0); }
    for (let i = 0; i < 4; i++) So.box(T, 0.1, 0.008, 0.055, HUE.green, 0.28, 0.158 + i * 0.011, -0.2, 0.7, { ry: i * 0.25 });
    label(T, ["GAME GOLD", "A WORLD'S COIN, SOLD FOR REAL DOLLARS · 2001"]);
  };
  // BitTorrent: the file as a chrome sphere cut into slices, and round it a swarm of peers each building its own
  // copy slice by slice, passing a piece on (warm) for every piece it is given (cool).
  PIECE.bittorrent = (T) => {
    base(T, 0.38);
    const slice = (R, a, b) => { const p = [[0, a]]; for (let k = 0; k <= 4; k++) { const y = a + (b - a) * k / 4; p.push([Math.sqrt(Math.max(R * R * 0.03, R * R - y * y)), y]); } p.push([0, b]); return p; };
    const cy = 0.5, R = 0.15, n = 7, out = { 2: [0.095, -0.02], 4: [-0.095, 0.02] };
    for (let i = 0; i < n; i++) {
      const a = -R + 2 * R * i / n + 0.006, b = -R + 2 * R * (i + 1) / n - 0.006, d = out[i] || [0, 0];
      So.shell(T, slice(R, a, b), d[0], cy, d[1], { seg: 28 });
      if (i) So.cyl(T, R * 0.5, R * 0.5, 0.008, HUE.org, 0, cy + a - 0.006, 0, 0.9, { seg: 20 });
    }
    const H = [0.77, 0.62, 0.25, 0.3, 0.5], P = H.map((y, j) => { const a = TAU * j / 5; return [0.345 * Math.sin(a), y, 0.3 * Math.cos(a)]; });
    P.forEach((p, j) => {
      const r = 0.06, c = j % 2 ? HUE.blu : HUE.org, q = P[(j + 1) % 5], mid = (t, dy) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t + dy, p[2] + (q[2] - p[2]) * t];
      for (let k = 0; k < 4; k++) {
        const a = -r + 2 * r * k / 4 + 0.004, b = -r + 2 * r * (k + 1) / 4 - 0.004;
        if ((j * 2 + k) % 3) So.shell(T, slice(r, a, b), p[0], p[1], p[2], { seg: 16 }); else Gl.lathe(T, slice(r, a, b), HUE.pale, p[0], p[1], p[2], 0.5, { seg: 12 });
      }
      So.ring(T, r + 0.014, 0.004, c, p[0], p[1], p[2], 1, { seg: 24 });
      So.rod(T, mid(0.14, 0.008), mid(0.86, 0.008), 0.004, HUE.org, 0.9); So.rod(T, mid(0.14, -0.008), mid(0.86, -0.008), 0.004, HUE.blu, 0.9);
      const g = mid(0.36, 0.008), h = mid(0.64, -0.008);
      So.cyl(T, 0.022, 0.022, 0.01, HUE.amb, g[0], g[1], g[2], 1, { seg: 12 }); So.cyl(T, 0.022, 0.022, 0.01, HUE.teal, h[0], h[1], h[2], 1, { seg: 12 });
    });
    label(T, ["BITTORRENT", "A FILE IN PIECES, EACH PEER GIVING AS IT GETS"]);
  };
  // Distributed hash tables: a chrome ring of peers with nothing at its centre, and one lookup leaping round it in
  // ever shorter hops (a third of the ring, a sixth, a twelfth, the next peer but one) to the peer that holds the key.
  PIECE.dht = (T) => {
    base(T, 0.38);
    So.shell(T, [[0, 0.04], [0.12, 0.045], [0.09, 0.07], [0.04, 0.1], [0.025, 0.15], [0.05, 0.19], [0, 0.2]], 0, 0, 0);
    const D = T.at(0, 0.51, 0, 0.3, HALF - 0.22), R = 0.285, N = 48, at = (i, r = R) => { const a = TAU * i / N; return [r * Math.sin(a), 0, -r * Math.cos(a)]; };
    So.cring(D, R, 0.027, 0, 0, 0, { seg: 48 });
    for (let i = 0; i < N; i++) { const p = at(i, R + 0.038); So.ball(D, 0.009, HUE.pale, p[0], 0, p[2], 0.9, { seg: 6 }); }
    const hops = [6, 22, 30, 34, 36];
    for (let h = 0; h < 4; h++) {
      const a = at(hops[h]), b = at(hops[h + 1]), bow = 0.45 * Math.hypot(b[0] - a[0], b[2] - a[2]), S = 7;
      const pt = (t) => [a[0] + (b[0] - a[0]) * t, bow * Math.sin(Math.PI * t), a[2] + (b[2] - a[2]) * t];
      for (let k = 0; k < S; k++) So.rod(D, pt(k / S), pt((k + 1) / S), 0.009 - h * 0.001, HUE.org, 1);
      So.cball(D, 0.036, b[0], 0, b[2], { seg: 12 }); So.ring(D, 0.05, 0.005, HUE.org, b[0], 0, b[2], 1, { seg: 20 });
      { const q = at(hops[h + 1], R - 0.06); So.blink(D, LAMP.org(), q[0], 0, q[2], 2.4, +(h / 4).toFixed(2)); }
    }
    const s = at(hops[0]), k = at(hops[4], R + 0.105);
    So.cball(D, 0.046, s[0], 0, s[2]); So.ring(D, 0.062, 0.006, HUE.blu, s[0], 0, s[2], 1, { seg: 24 });
    for (const y of [-0.048, 0.048]) So.ball(D, 0.02, HUE.blu, s[0], y, s[2], 1, { seg: 10 });
    So.gem(D.at(k[0], 0, k[2], 0, 0.22 - HALF), 0.034, 0.1, HUE.amb, 0, 0, 0, 1); So.cring(D, 0.064, 0.008, k[0], 0, k[2], { seg: 24 });
    label(T, ["HASH TABLES", "ANY KEY FOUND IN A FEW HOPS, WITH NO SERVER"]);
  };
  // Reusable proofs of work: a sealed chrome capsule with a glass waist that shows its chip to anyone, three lenses
  // watching it, a spent grey token going in at one port and a fresh lit one coming out of the other.
  PIECE.rpow = (T) => {
    base(T, 0.44);
    const cap = (y, s) => { const p = []; for (let k = 0; k <= 8; k++) { const a = HALF * k / 8; p.push([0.19 * Math.sin(a), y - s * 0.15 * Math.cos(a)]); } p.push([0, y]); return s > 0 ? p : p.reverse(); };
    So.shell(T, cap(0.42, 1), 0, 0, 0); So.shell(T, cap(0.58, -1), 0, 0, 0);
    Gl.cyl(T, 0.175, 0.175, 0.16, HUE.dimBlu, 0, 0.5, 0, 0.5, { seg: 28 });
    // The chip stands in its coolant, which boils round it.
    Gl.cyl(T, 0.165, 0.165, 0.07, HUE.teal, 0, 0.455, 0, 0.9, { seg: 28 });
    for (let k = 0; k < 5; k++) rising(T, BUBBLE.pale, 0.12 * Math.sin(k * TAU / 5), 0.43, 0.12 * Math.cos(k * TAU / 5), 0.14, 0.01, 1, 2.4 + k * 0.35);
    for (const y of [0.42, 0.58]) { So.cring(T, 0.193, 0.013, 0, y, 0); So.ring(T, 0.165, 0.004, HUE.blu, 0, y + (0.5 - y) * 0.2, 0, 1, { seg: 40 }); }
    for (let i = 0; i < 6; i++) { const a = TAU * (i + 0.5) / 6; So.rod(T, [0.193 * Math.sin(a), 0.42, 0.193 * Math.cos(a)], [0.193 * Math.sin(a), 0.58, 0.193 * Math.cos(a)], 0.01, HUE.steel); }
    So.box(T, 0.085, 0.085, 0.085, HUE.gun, 0, 0.5, 0, 0, { ry: 0.78 });
    for (const y of [0.475, 0.5, 0.525]) So.box(T, 0.09, 0.006, 0.09, HUE.teal, 0, y, 0, 1, { ry: 0.78 });
    So.cball(T, 0.035, 0, 0.75, 0); So.cring(T, 0.05, 0.008, 0, 0.735, 0);
    for (const s of [-1, 1]) {
      So.ccyl(T, 0.04, 0.065, 0.1, s * 0.215, 0.5, 0, { rz: s * HALF });
      So.ring(T, 0.045, 0.005, s > 0 ? HUE.off : HUE.org, s * 0.268, 0.5, 0, s > 0 ? 0 : 1, { rz: HALF, seg: 20 });
      for (let k = 0; k < 3; k++) {
        const x = s * (0.32 + k * 0.065), y = 0.5 + s * k * k * 0.022, fresh = s < 0;
        So.cyl(T, 0.03, 0.03, 0.009, fresh ? HUE.org : HUE.steel, x, y, 0, fresh ? 0.7 : 0.3, { rx: HALF, seg: 18 });
        So.ring(T, 0.03, 0.005, fresh ? HUE.hot : HUE.off, x, y, 0, fresh ? 1 : 0.3, { rx: HALF, seg: 18 });
      }
    }
    for (const a of [Math.PI - 0.8, Math.PI + 0.8, 0]) {
      const p = [0.31 * Math.sin(a), 0.21, 0.33 * Math.cos(a)], q = [0.17 * Math.sin(a), 0.47, 0.17 * Math.cos(a)];
      So.rod(T, [p[0] * 1.08, 0.04, p[2] * 1.08], p, 0.008, HUE.steel); So.cball(T, 0.032, p[0], p[1], p[2], { seg: 12 });
      So.ball(T, 0.015, HUE.pale, p[0] * 0.92, p[1] + 0.022, p[2] * 0.92, 1, { seg: 8 }); So.blink(T, LAMP.teal(), p[0] * 0.92, p[1] + 0.055, p[2] * 0.92, 2.1, +(a * 0.37 % 1).toFixed(2)); So.rod(T, [p[0] * 0.92, p[1] + 0.022, p[2] * 0.92], q, 0.003, HUE.pale, 0.7);
    }
    label(T, ["REUSABLE PROOFS OF WORK", "SPENT TOKEN IN, FRESH TOKEN OUT, AUDITED BY ANYONE"]);
  };
  // Bit gold: nuggets climbing a chrome spire, each a solved puzzle ringed by its time-stamp, entered on the spire's
  // register and tied to the next; the topmost is still glass, the puzzle begun from the last solution.
  PIECE.bitgold = (T) => {
    base(T, 0.42);
    const n = 6, P = Array.from({ length: n }, (_, i) => { const a = i * 1.2 + 2.3; return [(0.28 - i * 0.012) * Math.sin(a), 0.2 + i * 0.105, (0.25 - i * 0.01) * Math.cos(a)]; });
    const spire = [[0, 0.05], [0.1, 0.055], [0.075, 0.08], [0.035, 0.11]];
    P.forEach((p) => spire.push([0.02, p[1] - 0.035], [0.042, p[1]], [0.02, p[1] + 0.035]));
    spire.push([0.03, 0.82], [0.012, 0.87], [0, 0.91]);
    So.shell(T, spire, 0, 0, 0);
    P.forEach((p, i) => {
      const done = i < n - 1;
      So.ring(T, 0.05, 0.005, done ? HUE.blu : HUE.off, 0, p[1], 0, done ? 1 : 0, { seg: 20 });
      So.rod(T, [0, p[1], 0], p, 0.007, HUE.steel);
      if (done) So.gem(T, 0.05, 0.11, HUE.gold, p[0], p[1], p[2], 0.4, 5); else { Gl.gem(T, 0.05, 0.11, HUE.pale, p[0], p[1], p[2], 0.5, 5); So.ball(T, 0.014, HUE.hot, p[0], p[1], p[2], 1, { seg: 8 }); }
      So.cring(T, 0.075, 0.009, p[0], p[1], p[2], { rx: 0.45, rz: 0.3, seg: 24 });
      if (done) So.ring(T, 0.062, 0.003, HUE.blu, p[0], p[1], p[2], 1, { rx: 0.45, rz: 0.3, seg: 24 });
      if (i) So.rod(T, [P[i - 1][0], P[i - 1][1] + 0.05, P[i - 1][2]], [p[0], p[1] - 0.05, p[2]], 0.005, HUE.org, 1);
    });
    label(T, ["BIT GOLD", "SOLVE, TIME-STAMP, REGISTER, AND BEGIN THE NEXT"]);
  };
  // Liberty Reserve: every account hangs from one chrome hub; the hub is bound and crossed in red, its lights are
  // out, and every coin under it has gone dark with it.
  PIECE.lr = (T) => {
    base(T, 0.44, HUE.red);
    So.lathe(T, [[0, 0.69], [0.1, 0.69], [0.3, 0.715], [0.4, 0.745], [0.41, 0.76], [0, 0.76]], HUE.gun, 0, 0, 0, 0, { seg: 32 });
    So.shell(T, [[0, 0.76], [0.41, 0.76], [0.36, 0.785], [0.22, 0.82], [0.1, 0.85], [0.04, 0.865], [0, 0.87]], 0, 0, 0, { seg: 32 });
    So.cring(T, 0.405, 0.018, 0, 0.757, 0, { seg: 48 });
    for (const r of [0.2, 0.3]) So.ring(T, r, 0.005, HUE.off, 0, 0.69 + (r - 0.1) * 0.125, 0, 0, { seg: 40 });
    So.shell(T, [[0, 0.05], [0.13, 0.055], [0.1, 0.08], [0.06, 0.14], [0.052, 0.25], [0.048, 0.45], [0.044, 0.69], [0, 0.69]], 0, 0, 0);
    So.ball(T, 0.022, HUE.red, 0, 0.885, 0, 1, { seg: 10 }); So.blink(T, LAMP.red(), 0, 0.915, 0, 2.4, 0);
    for (let i = 0; i < 12; i++) {
      const a = TAU * (i + 0.5) / 12, front = Math.cos(a) < -0.5, x = 0.35 * Math.sin(a), z = 0.33 * Math.cos(a), y = front ? 0.6 - (i % 2) * 0.05 : 0.5 - (i * 0.618 % 1) * 0.3;
      So.rod(T, [x, 0.73, z], [x, y + 0.03, z], 0.003, HUE.gun);
      So.cyl(T, 0.034, 0.034, 0.009, HUE.gun, x, y, z, 0, { rx: HALF, ry: -a, seg: 18 }); So.ring(T, 0.034, 0.005, HUE.steel, x, y, z, 0.2, { rx: HALF, ry: -a, seg: 18 });
    }
    Gl.cyl(T, 0.12, 0.12, 0.36, HUE.dimRed, 0, 0.4, 0, 0.5, { seg: 24 });
    for (const y of [0.22, 0.58]) { So.cring(T, 0.125, 0.012, 0, y, 0); So.ring(T, 0.125, 0.005, HUE.red, 0, y + (0.4 - y) * 0.1, 0, 1, { seg: 32 }); }
    for (const z of [-0.13, 0.13]) for (const s of [-1, 1]) So.rod(T, [-0.11, 0.4 - s * 0.14, z], [0.11, 0.4 + s * 0.14, z], 0.014, HUE.red, 1);
    for (const x of [-0.13, 0.13]) for (const s of [-1, 1]) So.rod(T, [x, 0.4 - s * 0.14, -0.11], [x, 0.4 + s * 0.14, 0.11], 0.014, HUE.red, 1);
    label(T, ["LIBERTY RESERVE", "NO IDENTITY CHECKS, ONE CENTRE, SHUT DOWN MAY 2013"]);
  };
  // Block 0: a dark slab carrying the room's two live screens, cradled in a chrome dish between two chrome pylons
  // banded in Bitcoin orange, and along its crown a chain beginning: forged links, then light, then links to come.
  PIECE.genesis = (T) => {
    base(T, 0.46);
    const y = 0.47, w = 1.02, h = 0.62, ex = w / 2 + 0.04, ey = h / 2 + 0.045;
    So.box(T, w + 0.04, h + 0.05, 0.19, HUE.deck, 0, y, 0);
    Gl.box(T, w + 0.07, h + 0.09, 0.14, HUE.dimOrg, 0, y, 0, 0.5);
    for (const z of [-0.098, 0.098]) for (const s of [-1, 1]) { So.box(T, w + 0.03, 0.006, 0.006, HUE.org, 0, y + s * (h / 2 + 0.018), z, 1); So.box(T, 0.006, h + 0.03, 0.006, HUE.org, s * (w / 2 + 0.014), y, z, 1); }
    So.shell(T, [[0, 0.035], [0.16, 0.04], [0.3, 0.07], [0.335, 0.095], [0.3, 0.112], [0.15, 0.118], [0, 0.118]], 0, 0, 0, { seg: 32 });
    for (const s of [-1, 1]) {
      So.ccyl(T, 0.028, 0.028, w + 0.1, 0, y + s * ey, 0, { rz: HALF });
      const pyl = [[0, 0.04], [0.048, 0.045], [0.042, 0.085]];
      for (let b = 0; b < 5; b++) pyl.push([0.026, 0.132 + b * 0.135], [0.046, 0.2 + b * 0.135], [0.026, 0.268 + b * 0.135]);
      So.shell(T, pyl.concat([[0.04, 0.845], [0.026, 0.885], [0, 0.905]]), s * ex, 0, 0);
      for (let b = 0; b < 4; b++) So.ring(T, 0.03, 0.006, HUE.org, s * ex, 0.268 + b * 0.135, 0, 1, { seg: 20 });
    }
    for (let i = 0; i < 8; i++) {
      const x = 0.12 - i * 0.068, o = i % 2 ? { rx: HALF, ry: HALF, seg: 20 } : { rx: HALF, seg: 20 }, yy = y + ey + 0.05;
      if (i < 2) So.cring(T, 0.036, 0.011, x, yy, 0, o); else if (i < 4) So.ring(T, 0.036, 0.009, i < 3 ? HUE.org : HUE.amb, x, yy, 0, 1, o); else Gl.ring(T, 0.036, 0.009, HUE.pale, x, yy, 0, 0.5, o);
    }
    // Embers off the first block, climbing from its crown.
    for (let i = 0; i < 8; i++) So.flow(T, SPARK(), (i - 3.5) * 0.14, y + ey + 0.03, i % 2 ? 0.05 : -0.05, [0, 0.34, 0], 0.025, +(5 + (i * 0.618 % 1) * 3).toFixed(1), +(i * 0.618 % 1).toFixed(3));
    label(T, ["THE GENESIS BLOCK", "3 JANUARY 2009, THE FIRST LINK OF THE CHAIN"]);
  };

  // ---------- the models, by plinth ----------
  // A piece alone, or on a plinth that carries several a row of them, each over its own plaque (`part` names one of
  // the row alone, for the viewer).
  const M = { ...PIECE };
  const row = (keys, parts) => (T, part) => { const one = part ? parts[part] : undefined; if (one !== undefined) PIECE[keys[one]](T); else keys.forEach((key, j) => PIECE[key](T.at(spot(j, keys.length), 0, 0))); };
  M.cypherpunks = row(["cypherpunks", "hughes93", "cyphernomicon"], { main: 0, manifesto: 1, binder: 2 });
  M.dotcom = row(["dotcom", "games"], { main: 0, web: 0, chest: 1 });
  M.p2p = row(["bittorrent", "dht"], { swarm: 0, main: 1, ring: 1 });
  // The whitepaper, for the viewer (the hall shows the paper itself): the nine sheets fanned on a sloped stand, the
  // first page's title, author and opening lines drawn on the top one, and a card with the day it was posted. All of
  // it solid.
  M.whitepaper = (T) => {
    if (GLASS) return;
    const w = mm(216), h = mm(279);
    T.prism([[-0.22, 0], [0.22, 0], [0.22, 0.03], [-0.22, 0.14]], 0.34, C.woodDark, 0, 0, 0, { ry: HALF });
    for (let i = 8; i >= 0; i--) {
      const S = T.at(i * 0.006, 0.088 + 0.0015 * (8 - i), -0.03 + i * 0.004, 0.02 * i - 0.08, -Math.atan2(0.11, 0.44), 0);
      S.B(w, 0.0014, h, C.paper, 0, 0, 0);
      if (i) continue;
      const F = S.face("top", 0, 0.0014, 0);
      let y = h / 2 - 0.03;
      for (const t of ["BITCOIN:", "A PEER-TO-PEER", "ELECTRONIC CASH SYSTEM"]) { F.say(t, 0.0025, C.ink, 0, y, F.ink(0), 0.05); y -= 0.022; }
      y -= 0.006;
      F.say("SATOSHI NAKAMOTO", 0.0019, C.ink, 0, y, F.ink(0), 0.05); y -= 0.016;
      F.say("WWW.BITCOIN.ORG", 0.0015, "#4a4740", 0, y, F.ink(0), 0.05); y -= 0.024;
      F.say("ABSTRACT.", 0.0017, C.ink, -w / 2 + 0.06, y, F.ink(0), 0.05); y -= 0.012;
      const n = 13;
      for (let k = 0; k < n; k++) { F.B(w * (k === n - 1 ? 0.45 : 0.74), LIFT, 0.0024, "#5a5750", k === n - 1 ? -w * 0.14 : 0, y, F.layer(0)); y -= 0.0068; }
      y -= 0.014;
      F.say("1. INTRODUCTION", 0.0019, C.ink, -w / 2 + 0.09, y, F.ink(0), 0.05); y -= 0.012;
      for (let k = 0; k < 6; k++) { F.B(w * 0.82, LIFT, 0.0024, "#5a5750", 0, y, F.layer(0)); y -= 0.0068; }
    }
    // The card beside it with the day it was posted.
    const K = T.at(0.3, 0.03, -0.1, -0.4, -0.6);
    K.B(0.11, 0.0016, 0.07, C.paperOld, 0, 0, 0);
    const G = K.face("top", 0, 0.0016, 0);
    G.say("POSTED TO THE", 0.0018, C.ink, 0, 0.018, G.ink(0), 0.05);
    G.say("CRYPTOGRAPHY LIST", 0.0018, C.ink, 0, 0.004, G.ink(0), 0.05);
    G.say("31 OCT 2008", 0.0022, C.inkBlue, 0, -0.014, G.ink(0), 0.1);
  };

  // A model in kit `root`, standing on `y`.
  const model = (root, key, y = 0, opts = {}) => {
    const build = M[key];
    if (!build) throw new Error(`No model for ${key}`);
    UNIT = opts.unit || 1; LIP = opts.lip || 0; GLASS = opts.glass === true;
    try { build(tools(root, y, opts.quiet === true, opts.view === true, opts.moving === true), opts.part || null); } finally { UNIT = 1; LIP = 0; GLASS = false; }
  };
  BL.timechainGenesisModels = { model, has: (key) => !!M[key], C, fits: FITS };
})();
