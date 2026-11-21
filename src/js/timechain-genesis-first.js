// The Genesis Museum's first versions (timechain-room-genesis.js): the models first built for each plinth, the
// machines and papers of their years (a terminal, a vault door, a rack server), kept beside the pieces the ring shows
// today (timechain-genesis-models.js, each the idea itself). The room swaps a plinth's piece for its first version
// as a visitor comes up close, and a piece's pop-up shows its first version. Built as the museum's miners are
// (timechain-room-mining.js): in real millimetres scaled 1.6 times (`mm`), every label and screen drawn as geometry,
// every part laid on another at least LIFT proud of it so no two faces looking the same way share a plane. Each is an
// original design of a real kind of artefact, carrying no maker's mark or logo. `model(root, key, s, y, opts)` builds
// one in kit `root` (its front toward -z, standing on y), `opts.part` one piece of a shared plinth alone (for the
// viewer), `opts.view` the viewer's build (round parts in half the faces), `opts.unit` and `opts.lip` as the
// pieces of today take them. Nothing here moves: a lamp is lit, a reel and a fan stand still.
(() => {
  "use strict";
  const BL = window.BL;
  const RM = BL.timechainRoomModels, P = RM.paintKit;
  const mm = (v) => v * 1.6e-3, LIFT = 0.002, HALF = Math.PI / 2, TAU = Math.PI * 2;
  const C = {
    amber: "#f7931a", amberText: "#ffb04d", glow: "#ffc93c", glowText: "#ffd66b", ink: "#14110e", white: "#f4efe6",
    beige: "#d9d2bf", beigeDark: "#b9b1a0", cream: "#e8e2d2", grey: "#8c8f94", steel: "#3a3e45", steelDark: "#26282d", steelLight: "#9aa1a9",
    dark: "#1c1e22", black: "#0d0e10", pcb: "#1f6b3a", chip: "#111111", brass: "#b8923a", brassDark: "#8a6a24", gold: "#e0b43a",
    goldDark: "#a8832a", phosphor: "#3ce07a", phosphorDim: "#13522c", screen: "#0b1a10", paper: "#efe9d8", paperOld: "#e3d9bf",
    inkBlue: "#1b2d6b", red: "#b4322a", btc: "#f7931a", wood: "#6b4a2b", woodDark: "#4a331c", glassTint: "#cfe6ea", led: "#3ce07a", ledRed: "#e04a3c",
    cable: "#1d1d1f", blue: "#2f63c9", envelope: "#efe3c8", carbon: "#2a2a2e", rubber: "#222224", key: "#dcd6c6", keyDark: "#3b3b3f"
  };
  // Which way a frame's -z looks (its turn about y, then about x), for a frame laid on a face of a part.
  const FACES = { front: [0, 0], back: [Math.PI, 0], left: [-HALF, 0], right: [HALF, 0], top: [0, HALF], bottom: [0, -HALF] };
  // The tools for a frame `k` whose origin stands `base` up, everything `s` times the museum's size: boxes;
  // cylinders, upright unless turned; tori, flat unless turned; lit boxes; pixel words and pictures facing -z; `at`, a
  // frame of its own placed and turned in this one, and `face`, one whose -z looks out of a face; `layer`, the depth
  // of the n-th layer laid on a face, and `ink`, of words written on it.
  // `moving` is never true here (the builders still ask it of the moving parts they once had, which stand still).
  let uid = 0;
  // A room may show its displays larger than the museum's size: while one is built (`model`, `opts.unit`) every length
  // here is `UNIT` times its own, the plinth's own metres included, and `s` stays what the display's own layout says.
  // Such a room may also stand the piece on a deck raised `LIP` metres behind the plinth's front edge (`opts.lip`):
  // the label strip stays down on the edge, in front of and below everything.
  let UNIT = 1, LIP = 0, VIEW = false;
  // How round a round part is drawn: the faces its builder asks for, and more where it is large, so a big curve shows
  // no corners up close (`ROUND.metre` faces a metre of radius, up to `ROUND.most`; a ring's tube rounder as it
  // thickens). The viewer draws every face itself on each turn, so its build has half of that, never under the
  // builder's own. A part of under ten faces round stays as it is (a hexagonal nut, a crystal).
  const ROUND = { metre: 220, most: 48 };
  const round = (o, seg0, radius, tube = 0) => {
    const seg = (o && o.seg) || seg0;
    if (seg < 10) return o;
    const want = Math.max(seg, Math.min(ROUND.most, Math.ceil(radius * ROUND.metre)));
    const out = { ...o, seg: VIEW ? Math.max(seg, Math.ceil(want / 2)) : want };
    if (tube && !(o && o.sides)) out.sides = tube < 0.008 ? 6 : tube < 0.02 ? 8 : 12;
    return out;
  };
  const grown = (geo, o) => UNIT === 1 ? o : { ...o, scale: (o && o.scale || 1) * UNIT };
  const cast = (geo) => { const g = BL.models.merge(geo); if (UNIT !== 1) for (let i = 0; i < g.verts.length; i++) g.verts[i] *= UNIT; return g; };
  // `quiet` (the far build): words under 6 mm a pixel at the museum's size are left out, since nobody reads them from
  // across the room.
  const tools = (k, base, s0, moving = false, quiet = false) => {
    const s = s0 * UNIT, part = (geo, o) => typeof geo === "function" ? o : grown(geo, o);
    const T = {
      s: s0, moving, quiet, k, base,
      node: (name, geo, x, yy, z, o) => k.node(name, geo, x * s, base + yy * s, z * s, part(geo, o)),
      // A part that slides from where it stands by `d` ([x, y, z] here) and back every `period` seconds (nodes keep
      // their place in the room's frame, so the slide is turned to the room with this frame's heading).
      // Shown only from `t0` to `t1` of every `period` seconds.
      pulse: (geo, x, yy, z, period, t0, t1, o) => moving ? k.node(`pulse:${uid++}:${period}:${t0}:${t1}`, geo, x * s, base + yy * s, z * s, part(geo, o)) : (t1 - t0 > period / 2 ? k.add(cast(geo), x * s, base + yy * s, z * s, o || {}) : null),
      // Moved from where it stands by `d` between `t0` and `t1` of the cycle, staying there till the cycle turns.
      slide: (geo, x, yy, z, d, period, t0, t1, o) => { const a = k.yaw(), c = Math.cos(a), sn = Math.sin(a), wx = (c * d[0] + sn * d[2]) * s, wz = (-sn * d[0] + c * d[2]) * s; const show = o && o.show ? o.show : [0, period]; return moving ? k.node(`slide:${uid++}:${wx.toFixed(4)}:${(d[1] * s).toFixed(4)}:${wz.toFixed(4)}:${period}:${t0}:${t1}:${show[0]}:${show[1]}`, geo, x * s, base + yy * s, z * s, part(geo, o)) : k.add(cast(geo), (x + d[0]) * s, base + (yy + d[1]) * s, (z + d[2]) * s, {}); },
      // A part turned about its own z from `r0` to `r1` between `t0` and `t1`, and back between `t2` and `t3`.
      tip: (builder, x, yy, z, r0, r1, period, t0, t1, t2, t3) => k.node(moving ? `tip:${uid++}:${r0}:${r1}:${period}:${t0}:${t1}:${t2}:${t3}` : null, builder, x * s, base + yy * s, z * s, { rz: moving ? 0 : r1 }),
      shuttle: (geo, x, yy, z, d, period, phase = 0, o) => { const a = k.yaw(), c = Math.cos(a), sn = Math.sin(a), wx = (c * d[0] + sn * d[2]) * s, wz = (-sn * d[0] + c * d[2]) * s; return moving ? k.node(`shuttle:${uid++}:${wx.toFixed(4)}:${(d[1] * s).toFixed(4)}:${wz.toFixed(4)}:${period}:${phase}`, geo, x * s, base + yy * s, z * s, part(geo, o)) : k.add(cast(geo), x * s, base + yy * s, z * s, o || {}); },
      B: (w, h, d, color, x, yy, z, o) => k.box(w * s, h * s, d * s, color, x * s, base + yy * s, z * s, o),
      Y: (rt, rb, h, color, x, yy, z, o) => k.cyl(rt * s, rb * s, h * s, color, x * s, base + yy * s, z * s, round(o, 16, Math.max(rt, rb) * s)),
      R: (rr, r, color, x, yy, z, o) => k.torus(rr * s, r * s, color, x * s, base + yy * s, z * s, round(o, 24, rr * s, r * s)),
      ball: (r, color, x, yy, z, o) => k.ball(r * s, color, x * s, base + yy * s, z * s, round(o, 14, r * s)),
      lathe: (profile, color, x, yy, z, o) => k.lathe(profile.map(([r, y]) => [r * s, y * s]), color, x * s, base + yy * s, z * s, round(o, 16, profile.reduce((m, q) => Math.max(m, q[0]), 0) * s)),
      prism: (pts, depth, color, x, yy, z, o) => k.prism(pts.map(([px, py]) => [px * s, py * s]), depth * s, color, x * s, base + yy * s, z * s, o),
      add: (geo, x, yy, z) => k.add(geo, x * s, base + yy * s, z * s),
      say: (text, px, color, x, yy, z, e = 0.25) => quiet && px * s0 < 0.006 ? null : T.add(RM.helpers.litWord(text, px * s, color, e), x, yy, z),
      at: (x, yy, z, ry = 0, rx = 0, rz = 0) => tools(k.group(x * s, base + yy * s, z * s, ry, rx, rz), 0, s0, moving, quiet),
      face: (face, x, yy, z, spin = 0) => T.at(x, yy, z, FACES[face][0], FACES[face][1], spin),
      layer: (n) => -LIFT - 2 * LIFT * n, ink: (n) => -LIFT - 2 * LIFT * n - 0.0025
    };
    return T;
  };
  // ---------- pieces many models share ----------
  // The moving parts' shared geometries: a green and a red lamp, a tape reel (flat, turning about y) and a fan's
  // blades (flat too; placed turned so they face the way the fan blows).
  const LED_G = RM.helpers.own(() => BL.models.noShadow(BL.models.box({ w: 0.008, h: 0.008, d: 0.004, color: C.led, emissive: 1 })));
  const LED_R = RM.helpers.own(() => BL.models.noShadow(BL.models.box({ w: 0.008, h: 0.008, d: 0.004, color: C.ledRed, emissive: 0.9 })));
  const REEL = RM.helpers.own(() => BL.models.merge(BL.models.lathe({ profile: [[0, -0.006], [0.05, -0.006], [0.05, 0.006], [0, 0.006]], segments: 20, color: "#3a3e45" }), BL.models.box({ w: 0.09, h: 0.014, d: 0.008, color: "#8f949a" }), BL.models.box({ w: 0.008, h: 0.014, d: 0.09, color: "#8f949a" }), BL.models.box({ w: 0.016, h: 0.02, d: 0.016, color: C.steelLight })));
  const FAN = RM.helpers.own(() => { const parts = [BL.models.lathe({ profile: [[0, -0.004], [0.005, -0.004], [0.005, 0.004], [0, 0.004]], segments: 8, color: C.black })]; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(BL.models.turnedY(BL.models.box({ w: 0.004, h: 0.003, d: 0.013, color: "#2a2c31", offset: { z: -0.0085 } }), a)); } return BL.models.noShadow(BL.models.merge(...parts)); });
  // A unit bar of dim phosphor, sized by its node: the band that rolls down a tube.
  const ROLL = RM.helpers.own(() => BL.models.noShadow(BL.models.box({ w: 1, h: 0.03, d: 0.002, color: "#1d7a44", emissive: 0.5 })));
  // A lamp: blinking (`period` seconds, `phase` into it) where the build moves, lit still otherwise.
  const lamp2 = (F, red, x, y, z, period = 0, phase = 0, o = {}) => {
    if (F.moving && period) F.node(`blink:${uid++}:${period}:${phase}`, red ? LED_R() : LED_G(), x, y, z, o);
    else F.B(0.008, 0.008, 0.004, red ? C.ledRed : C.led, x, y, z, { ...o, emissive: red ? 0.9 : 1, glow: true });
  };
  // A CRT monitor of the beige years: its case, the tube's bezel, the glass a little proud, and a screen `paint(F)`
  // draws in a frame laid on the glass (its words at `F.ink(n)`). `w` and `h` the glass, in metres already scaled.
  const crt = (T, x, y, z, w, h, color, paint, fine = true) => {
    const depth = w * 1.05, bezel = 0.03;
    T.B(w + 2 * bezel + 0.02, h + 2 * bezel + 0.02, depth, color, x, y + (h + 2 * bezel + 0.02) / 2, z + depth / 2);
    T.B(w + 2 * bezel - 0.02, h + 2 * bezel - 0.02, depth * 0.9, color, x, y + (h + 2 * bezel + 0.02) / 2 + 0.01, z + depth / 2 + depth * 0.1);
    const F = T.face("front", x, y + bezel + h / 2 + 0.01, z);
    F.B(w + 2 * bezel, h + 2 * bezel, 0.012, "#c9c2b0", 0, 0, -0.006);
    F.B(w, h, 0.006, C.screen, 0, 0, -0.015, { emissive: 0.35, glow: true });
    if (fine) { F.B(0.02, 0.02, 0.004, C.led, (w + bezel) / 2, -(h + bezel) / 2, -0.014, { emissive: 1, glow: true }); F.B(0.06, 0.012, 0.004, "#8a8577", -(w + bezel) / 2 + 0.03, -(h + bezel) / 2, -0.014); }
    const S = T.face("front", x, y + bezel + h / 2 + 0.01, z - 0.018);
    paint(S, w, h);
    // The tube's slow roll: a dim band that travels down the glass and back (the near build alone).
    if (T.moving) S.shuttle(ROLL(), 0, h / 2 - 0.006, -0.0005, [0, -(h - 0.012), 0], 7, (uid % 5) * 1.3, { scale: w * S.s });
    return F;
  };
  // Lines of green phosphor text on a screen frame `S`, `px` a pixel, from the top left.
  const lines = (S, rows, px, w, h, color = C.phosphor, e = 0.9) => {
    // Inside an even margin, the pixel the largest (up to `px`) at which the longest row and the whole column fit.
    const m = Math.min(w, h) * 0.07, longest = Math.max(1, ...rows.map((r) => r.length * 6 - 1)), p = Math.min(px, (w - 2 * m) / longest, (h - 2 * m) / (rows.length * 9 - 2));
    rows.forEach((row, i) => { if (row) S.say(row, p, color, w / 2 - m - (row.length * 6 - 1) * p / 2, h / 2 - m - p * 3.5 - i * p * 9, S.ink(0), e); });
  };
  // A plate of words that cannot overflow, in a frame whose -z looks out (a `face`): the plate `w` by `h` (none with
  // `bg: null`), and `rows` of [text, pixel, colour, emissive] on it, each line's pixel the largest up to its own that
  // fits the width inside the margin, the whole block shrunk together if it is too tall, lines spaced by their own
  // height (`gap` of it between), centred, or from the left margin with `left`. Returns the pixels used.
  const card = (F, rows, w, h, o = {}) => {
    const m = o.margin === undefined ? Math.max(0.006, Math.min(w, h) * 0.09) : o.margin, t = o.t || 0.004, gap = o.gap === undefined ? 0.75 : o.gap;
    if (o.bg !== null) F.B(w, h, t, o.bg || C.ink, 0, 0, 0, o.lit ? { emissive: o.lit, glow: true } : {});
    let sizes = rows.map(([text, px]) => Math.min(px, (w - 2 * m) / Math.max(1, text.length * 6 - 1)));
    const tall = (z) => z.reduce((a, q, i) => a + q * 7 + (i ? Math.max(q, z[i - 1]) * 7 * gap : 0), 0), k = Math.min(1, (h - 2 * m) / tall(sizes));
    sizes = sizes.map((q) => q * k);
    let y = tall(sizes) / 2;
    rows.forEach(([text, , color, e], i) => {
      if (i) y -= Math.max(sizes[i], sizes[i - 1]) * 7 * gap;
      y -= sizes[i] * 3.5;
      if (text) F.say(text, sizes[i], color || C.white, o.left ? w / 2 - m - (text.length * 6 - 1) * sizes[i] / 2 : 0, y, F.ink(0), e === undefined ? 0.3 : e);
      y -= sizes[i] * 3.5;
    });
    return sizes;
  };
  // A board standing on the plinth, leaning back `lean` radians from upright on a foot and a rear strut, its face to
  // the path: returns the frame of its face (for `card`), `w` by `h`, its foot at (x, 0, z).
  const easel = (T, x, z, w, h, lean = 0.3, color = C.woodDark, ry = 0) => {
    const P = T.at(x, 0, z, ry), top = h * Math.cos(lean), back = h * Math.sin(lean);
    P.B(w * 0.8, 0.014, back + 0.12, color, 0, 0.007, back / 2 + 0.03);
    P.B(0.03, top * 0.9, 0.03, color, 0, top * 0.45, back + 0.07, { rx: -0.12 });
    const F = P.at(0, 0.014 + top / 2, back / 2 + 0.012, 0, lean, 0);
    F.B(w + 0.02, h + 0.02, 0.014, color, 0, 0, 0.009);
    // A picture light over the board, on a short arm: a hood with a lit strip under it. Two clips at the top corners.
    F.B(w * 0.56, 0.004, 0.02, C.glowText, 0, h / 2 + 0.03, -0.03, { emissive: 0.95, glow: true });
    if (!T.quiet) {
      F.B(w * 0.6, 0.01, 0.03, C.steelDark, 0, h / 2 + 0.037, -0.03);
      F.B(0.012, 0.034, 0.04, C.steelDark, 0, h / 2 + 0.025, -0.008);
      for (const sx of [-1, 1]) F.B(0.03, 0.02, 0.006, C.brass, sx * (w / 2 - 0.035), h / 2 + 0.01, -0.001);
    }
    return F;
  };
  // On a plinth several entries share, each entry's vignette stands over its own plaque: the plaques are PITCH apart
  // (timechain-room-genesis.js CARD.pitch), the first in walk order at the viewer's left, which is +x here.
  const PITCH = 1.0, spot = (j, n) => ((n - 1) / 2 - j) * PITCH;
  // A rebuilt display is laid out in the plinth's own metres, whatever scale the room gives its piece.
  const plain = (T) => T.s === 1 ? T : tools(T.k, T.base, 1, T.moving, T.quiet);
  // The display's label: a strip standing along the plinth's front edge, in front of and below everything.
  const label = (T, lines, w = 0.86, x = 0) => strip(T, lines, x, 0.048 - LIP / UNIT, -0.55, w, 0.004);
  // A lit rod between two points at one height (a link drawn in light).
  const beam = (T, a, b, y, color = C.glow, r = 0.006) => { const dx = b[0] - a[0], dz = b[1] - a[1]; T.B(r, r, Math.hypot(dx, dz), color, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, { ry: Math.atan2(dx, dz), emissive: 1, glow: true }); };
  // A keyboard: a wedge with rows of keys (left out when not fine, the wedge alone).
  const keyboard = (T, x, y, z, w, d, color, fine, keyColor = C.key) => {
    T.B(w, 0.03, d, color, x, y + 0.015, z);
    T.B(w, 0.012, d, color, x, y + 0.036, z + 0.004);
    if (!fine) return;
    const rows = 4, cols = Math.max(8, Math.round(w / 0.035)), kw = (w - 0.03) / cols - 0.004, kd = (d - 0.04) / rows - 0.005;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wide = r === rows - 1 && c > cols * 0.3 && c < cols * 0.7;
      if (wide && c !== Math.round(cols * 0.3) + 1) continue;
      T.B(wide ? kw * (Math.round(cols * 0.7) - Math.round(cols * 0.3) - 1) + 0.004 * (Math.round(cols * 0.4) - 1) : kw, 0.012, kd, keyColor, x - w / 2 + 0.015 + (c + 0.5) * (kw + 0.004) + (wide ? kw * 1.6 : 0), y + 0.048, z - d / 2 + 0.02 + (r + 0.5) * (kd + 0.005));
    }
  };
  // A thick cable as straight runs between corners, each a box along its axis.
  const cord = (T, pts, r, color) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      T.B(Math.abs(dx) + r, Math.abs(dy) + r, Math.abs(dz) + r, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    }
  };
  // A padlock standing on its foot: the body, its shackle (open when `open`), the keyway.
  const padlock = (T, x, y, z, size, open, fine) => {
    const w = size, h = size * 0.85, d = size * 0.4, sr = size * 0.09;
    T.B(w, h, d, C.brass, x, y + h / 2, z);
    T.B(w * 0.94, h * 0.94, d + 0.004, C.brassDark, x, y + h / 2, z);
    T.B(w * 0.8, h * 0.8, d + 0.008, C.brass, x, y + h / 2, z);
    const arc = [], R = w * 0.32, lift = open ? size * 0.35 : 0;
    for (let i = 0; i <= 8; i++) { const a = Math.PI * i / 8; arc.push([x - R * Math.cos(a), y + h + lift + R * Math.sin(a), z]); }
    for (let i = 1; i < arc.length; i++) { const a = arc[i - 1], b = arc[i]; T.B(Math.abs(b[0] - a[0]) + sr * 2, Math.abs(b[1] - a[1]) + sr * 2, sr * 2, C.steelLight, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z); }
    T.B(sr * 2, h * 0.45 + lift, sr * 2, C.steelLight, x + R, y + h - h * 0.2 + (h * 0.45 + lift) / 2 - lift * 0 + lift / 2 - lift / 2, z);
    T.B(sr * 2, lift + h * 0.1, sr * 2, C.steelLight, x - R, y + h + lift / 2 - h * 0.05, z);
    if (fine) { const F = T.face("front", x, y + h * 0.35, z - d / 2 - 0.004); F.B(size * 0.05, size * 0.16, 0.004, C.black, 0, 0, 0); F.Y(size * 0.06, size * 0.06, 0.004, C.black, 0, size * 0.1, 0, { rx: HALF, seg: 10 }); }
  };
  // A key lying flat: its bow, blade and bits.
  const key = (T, x, y, z, len, ry, fine) => {
    const F = T.at(x, y, z, ry);
    F.R(len * 0.14, len * 0.04, C.brass, -len * 0.36, 0, 0, { seg: 16, sides: 6 });
    F.B(len * 0.7, len * 0.05, len * 0.08, C.brass, len * 0.05, 0, 0);
    if (fine) for (let i = 0; i < 4; i++) F.B(len * 0.06, len * 0.05, len * (0.06 + (i % 2) * 0.05), C.brass, len * 0.12 + i * len * 0.09, 0, -len * 0.06);
  };
  // A small 1990s computer tower (or a desktop lying flat with `flat`), beige, with drive bays, a power button and the
  // vents only when fine.
  const tower = (T, x, y, z, w, h, d, fine, flat = false) => {
    T.B(w, h, d, C.beige, x, y + h / 2, z);
    const F = T.face("front", x, y + h / 2, z - d / 2);
    F.B(w - 0.02, h - 0.02, 0.006, C.beigeDark, 0, 0, -0.003);
    // Drive bays: a 5.25" bay (or two) and a 3.5" floppy slot, a power button, two lamps.
    const bay = flat ? w * 0.35 : w * 0.75;
    F.B(bay, flat ? h * 0.3 : h * 0.1, 0.008, C.cream, flat ? w * 0.2 : 0, flat ? 0 : h * 0.34, -0.007);
    F.B(bay * 0.9, 0.006, 0.01, C.black, flat ? w * 0.2 : 0, flat ? -h * 0.05 : h * 0.3, -0.008);
    F.B(bay * 0.6, flat ? h * 0.2 : h * 0.07, 0.008, C.cream, flat ? w * 0.2 : 0, flat ? 0 : h * 0.22, -0.007);
    F.B(bay * 0.45, 0.004, 0.01, C.black, flat ? w * 0.2 : 0, flat ? -h * 0.02 : h * 0.2, -0.008);
    F.B(0.03, 0.02, 0.01, C.cream, flat ? -w * 0.3 : -w * 0.25, flat ? 0 : -h * 0.3, -0.008);
    if (fine) {
      F.B(0.008, 0.008, 0.004, C.led, flat ? -w * 0.2 : -w * 0.1, flat ? 0.01 : -h * 0.3, -0.009, { emissive: 1, glow: true });
      // The disk lamp, flickering as a working machine's does.
      lamp2(F, true, flat ? -w * 0.2 : -w * 0.1, flat ? -0.01 : -h * 0.33, -0.009, 0.45, (uid % 7) * 0.06);
      for (let i = 0; i < 6; i++) F.B(w * 0.3, 0.003, 0.004, C.beigeDark, flat ? -w * 0.3 : w * 0.2, (flat ? -h * 0.2 : -h * 0.42) + i * 0.008, -0.008);
    }
  };
  // A dial-up modem of the early 1990s: a flat box, its row of status lamps labelled as they were.
  const modem = (T, x, y, z, fine) => {
    const w = mm(230), h = mm(45), d = mm(170);
    T.B(w, h, d, "#d6d0c1", x, y + h / 2, z);
    T.B(w - 0.01, 0.004, d - 0.01, "#c2bcad", x, y + h + 0.002, z);
    const F = T.face("front", x, y + h / 2, z - d / 2);
    F.B(w - 0.02, h - 0.02, 0.006, "#2a2a2e", 0, 0, -0.003);
    const LAMPS = ["HS", "AA", "CD", "OH", "RD", "SD", "TR", "MR"];
    LAMPS.forEach((name, i) => {
      const lx = -w * 0.4 + i * w * 0.1, on = i !== 1 && i !== 3;
      if (on && (i === 4 || i === 5) && F.moving) F.node(`blink:${uid++}:${i === 4 ? 0.3 : 0.42}:${i === 4 ? 0 : 0.17}`, LED_R(), lx, 0.004, -0.007);
      else F.B(0.012, 0.006, 0.004, on ? C.ledRed : "#4a1e1a", lx, 0.004, -0.007, on ? { emissive: 0.95, glow: true } : {});
      if (fine) F.say(name, 0.0022, "#d0c8b8", lx, -0.011, F.ink(0) - 0.004, 0.1);
    });
  };

  // ---------- the stage every display stands on ----------
  // The room's rules for a display: anything whose content is flat (cards, papers, screens) stands on an angled
  // lectern facing the path, titles get a label strip of their own, every powered thing has its cable to an outlet on
  // the plinth's back, items on one plinth keep clear of one another, and a surface grows rather than its text shrinks.
  // A sloped lectern: a wedge `w` across, `d` deep, its slope `tilt` radians from the vertical facing -z (the path), its
  // front edge `lip` high; returns the frame laid on the slope (its +y the slope's normal, up and toward the path), with
  // the slope's size, for sheets and cards. The wedge is closed on every side, so it reads from the back too.
  const lectern = (T, x, z, w, d, tilt = 0.65, lip = 0.06, color = C.woodDark, ry = 0) => {
    const rise = d / Math.tan(tilt), hB = lip + rise;
    const P = T.at(x, 0, z, ry);
    P.prism([[-d / 2, 0], [d / 2, 0], [d / 2, lip], [-d / 2, hB]], w, color, 0, 0, 0, { ry: HALF });
    P.B(w + 0.02, 0.012, d + 0.02, color === C.woodDark ? C.wood : C.steelDark, 0, 0.006, 0);
    // A small ledge along the front edge, so a sheet looks held.
    P.B(w, 0.014, 0.016, color === C.woodDark ? C.wood : C.steelDark, 0, lip + 0.007, -d / 2 - 0.006);
    // A reading light along the ledge's front.
    P.B(w - 0.02, 0.004, 0.004, C.glowText, 0, lip + 0.004, -d / 2 - 0.016, { emissive: 0.9, glow: true });
    const slope = Math.atan2(rise, d), len = Math.hypot(rise, d);
    const S = P.at(0, (lip + hB) / 2 + 0.002, 0, 0, -slope, 0);
    S.w = w - 0.02; S.d = len - 0.02;
    return S;
  };
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
  // A cable: a smooth run through `pts` ([x, y, z] in metres of this frame), each span sagging `sag` of its length,
  // as short cylinders; `plug` adds a moulded plug at the last point. Low-segment, merged into the static mesh.
  const cable = (T, pts, r = 0.005, color = C.cable, sag = 0.12, plug = true) => {
    const path = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(2, Math.ceil(len / 0.06));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) { const t = k / n; path.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * len * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]); }
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
      if (len < 1e-5) continue;
      const ux = dx / len, uy = dy / len, uz = dz / len, rz = Math.asin(Math.max(-1, Math.min(1, -ux))), rx = Math.atan2(uz, uy);
      T.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0, rx, rz).Y(r, r, len + r, color, 0, 0, 0, { seg: 6 });
    }
    if (plug) { const e = path[path.length - 1]; T.B(r * 4, r * 5, r * 6, color === C.cable ? "#2a2a2e" : color, e[0], e[1], e[2]); }
  };
  const outlet = (T0, n = 2) => {
    // On the plinth's top, along its back edge: a low power strip set on the concrete, its sockets facing up, so every
    // cord stays on the top and nothing hangs over a face; in the plinth's own metres, whatever the model's scale.
    const T = tools(T0.k, T0.base, 1, false), z = 0.52, y = 0.012, count = Math.max(2, Math.min(8, n)), w = 0.08 + count * 0.05;
    T.B(w, 0.024, 0.07, "#2a2a2e", -0.52 + w / 2, y, z);
    T.B(w - 0.01, 0.004, 0.06, "#3a3a3e", -0.52 + w / 2, y + 0.014, z);
    const sockets = [];
    for (let i = 0; i < count; i++) { const x = -0.52 + 0.06 + i * 0.05; T.B(0.03, 0.004, 0.03, "#c9c2b0", x, y + 0.017, z); for (const sx of [-1, 1]) T.B(0.003, 0.003, 0.01, C.black, x + sx * 0.007, y + 0.02, z - 0.004); T.B(0.005, 0.003, 0.005, C.black, x, y + 0.02, z + 0.008); sockets.push([x, y + 0.02, z]); }
    T.B(0.012, 0.012, 0.004, C.ledRed, -0.52 + 0.02, y + 0.026, z, { emissive: 0.8, glow: true });
    return sockets;
  };
  // A lead in straight runs, in the plinth's own metres: down the device's back to the top, back to just before the
  // power strip, along it and into its socket; nothing sags or swings past an edge.
  const wire = (T, from, socket, r = 0.006, color = C.cable) => cord(T, [from, [from[0], 0.006, from[2]], [from[0], 0.006, 0.47], [socket[0], 0.006, 0.47], [socket[0], 0.006, socket[2]], [socket[0], socket[1], socket[2]]], r, color);

  // ---------- the models ----------
  const M = {};
  // 1985 · the curve y² = x³ + 7 (secp256k1's shape over the reals) in steel, P, Q and P + Q marked on it and the
  // chord-and-tangent construction drawn as lit rods: the group law Bitcoin's keys live by.
  M.ecc = (T0, fine) => {
    const T = plain(T0);
    T.B(0.9, 0.03, 0.3, C.steel, 0, 0.015, 0);
    // The plane as it is drawn on paper: x grows to the viewer's right, which is -x here.
    const X = (x) => -x * 0.14, Y = (y) => 0.3 + y * 0.055;
    // The curve's two arms, swept as short rods.
    const pts = [];
    for (let x = -1.9; x <= 2.6; x += 0.08) { const y2 = x * x * x + 7; if (y2 >= 0) pts.push([x, Math.sqrt(y2)]); }
    for (const sign of [1, -1]) for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], ax = X(a[0]), ay = Y(sign * a[1]), bx = X(b[0]), by = Y(sign * b[1]);
      T.B(0.012, Math.hypot(bx - ax, by - ay) + 0.006, 0.012, C.steelLight, (ax + bx) / 2, (ay + by) / 2, 0, { rz: Math.atan2(bx - ax, by - ay) });
    }
    // Axes.
    T.B(0.7, 0.004, 0.004, "#6a6e74", -0.04, Y(0), 0.01);
    T.B(0.004, 0.42, 0.004, "#6a6e74", X(0), Y(0), 0.01);
    // P (-1.8, 1.2), Q (0.5, 2.67): the line through them meets the curve again at R; P + Q is R mirrored.
    const Pp = [-1.8, Math.sqrt((-1.8) ** 3 + 7)], Qp = [0.5, Math.sqrt(0.125 + 7)];
    const m = (Qp[1] - Pp[1]) / (Qp[0] - Pp[0]), rx = m * m - Pp[0] - Qp[0], ry = Pp[1] + m * (rx - Pp[0]);
    const line = (a, b, color, e) => { const ax = X(a[0]), ay = Y(a[1]), bx = X(b[0]), by = Y(b[1]); T.B(0.006, Math.hypot(bx - ax, by - ay), 0.006, color, (ax + bx) / 2, (ay + by) / 2, -0.012, { rz: Math.atan2(bx - ax, by - ay), emissive: e, glow: true }); };
    line([Pp[0] - 0.4, Pp[1] - 0.4 * m], [rx + 0.3, ry + 0.3 * m], C.amber, 0.7);
    line([rx, ry], [rx, -ry], C.glow, 0.7);
    for (const [p, words, color, side] of [[Pp, "P", C.white, -1], [Qp, "Q", C.white, -1], [[rx, ry], "R", C.grey, 1], [[rx, -ry], "P+Q", C.glow, -1]]) {
      T.ball(0.018, color, X(p[0]), Y(p[1]), -0.012, { seg: 10, emissive: 0.5 });
      // The point's name on a small dark tag beside it, clear of the curve and the lines.
      const tw = words.length * 0.026 + 0.022;
      card(T.face("front", X(p[0]) + side * (0.03 + tw / 2), Y(p[1]) + 0.05, -0.014), [[words, 0.0042, color, 0.4]], tw, 0.046, { t: 0.004, margin: 0.008 });
    }
    label(T, ["Y^2 = X^3 + 7", "SECP256K1 · ADDING POINTS IS EASY, UNDOING IT IS HARD"]);
  };



  // 1998 · secure property titles: a registry drawer drawn out of its cabinet, the deed cards standing in it, the
  // one at the front lifted to read, each title signed on from the last owner's key, and a short chain beside it.
  M.titles = (T0, fine) => {
    const R0 = plain(T0), T = R0.at(0, 0, 0.03), cw = mm(400), ch = mm(300), cd = mm(200), dw = mm(170), dh = mm(110), dl = mm(380);
    // The cabinet's front, the drawer pulled out of its slot.
    T.B(cw, ch, cd, C.wood, 0.05, ch / 2, 0.25);
    T.B(cw - 0.02, ch - 0.02, 0.006, C.woodDark, 0.05, ch / 2, 0.25 - cd / 2 - 0.003);
    for (const [x, y] of [[-cw / 4 + 0.05, ch * 0.75], [cw / 4 + 0.05, ch * 0.75], [cw / 4 + 0.05, ch * 0.27]]) {
      T.B(dw - 0.01, dh - 0.01, 0.01, C.wood, x, y, 0.25 - cd / 2 - 0.008);
      if (fine) T.B(0.05, 0.012, 0.012, C.brass, x, y, 0.25 - cd / 2 - 0.018);
    }
    const D = T.at(-cw / 4 + 0.05, ch * 0.27, 0.25 - cd / 2 - dl / 2 + 0.02);
    D.B(dw, dh * 0.8, dl, C.wood, 0, dh * 0.4, 0);
    D.B(dw - 0.016, dh * 0.6, dl - 0.016, "#3a2a16", 0, dh * 0.5 + LIFT, 0);
    D.B(dw, dh, 0.012, C.wood, 0, dh / 2, -dl / 2 - 0.006);
    const F = D.face("front", 0, dh * 0.62, -dl / 2 - 0.012);
    F.B(0.14, 0.046, 0.004, C.brass, 0, 0, -0.002);
    card(F.at(0, 0, -0.005), [["TITLES", 0.0028, C.ink, 0.05]], 0.128, 0.038, { bg: C.paper, t: 0.002, margin: 0.006 });
    F.B(0.05, 0.012, 0.012, C.brass, 0, -0.04, -0.006);
    // The cards standing in the drawer, their tabs stepped, the front one lifted upright.
    const n = fine ? 18 : 9, pitch = (dl - 0.06) / n;
    for (let i = 0; i < n; i++) {
      const z = -dl / 2 + 0.05 + i * pitch, lean = 0.12;
      const Cd = D.at(0, dh * 0.3, z, 0, lean);
      Cd.B(dw - 0.03, mm(100), 0.0016, i % 2 ? C.paper : C.paperOld, 0, mm(50), 0);
      Cd.B(mm(30), mm(14), 0.0016, i % 2 ? C.paper : C.paperOld, -dw / 2 + 0.03 + (i % 3) * mm(45), mm(105), 0);
    }
    // The front card lifted clear of the drawer to read, leaning back a little.
    const Up = D.at(0, dh + 0.012, -dl / 2 + 0.03, 0, 0.12);
    Up.B(dw - 0.02, mm(110), 0.002, C.paper, 0, mm(55), 0);
    const U = Up.face("front", 0, mm(55), -0.001);
    card(U, [["TITLE 0042", 0.0038, C.ink, 0.05], ["OWNER: KEY 7A3F", 0.0027, C.ink, 0.05], ["FROM: KEY 19C2", 0.0027, C.ink, 0.05], ["SIGNED", 0.0027, C.inkBlue, 0.1]], dw - 0.03, mm(110) - 0.012, { bg: null, gap: 0.6, margin: 0.01 });
    U.Y(0.012, 0.012, 0.004, C.red, -0.09, -mm(40), U.layer(1) - 0.002, { rx: HALF, seg: 12 });
    // The chain of three rings lying beside the cabinet.
    for (let i = 0; i < 3; i++) T.R(0.03, 0.006, C.steelLight, 0.36 + i * 0.05, 0.006 + (i % 2) * 0.03, -0.14, { rx: i % 2 ? HALF : 0, seg: 16, sides: 6 });
    label(R0, ["SECURE PROPERTY TITLES", "A REGISTER NO SINGLE CLERK CAN FORGE"]);
  };

  // A thin rod from one point to another, as a box turned to lie along it (about y, then tipped).
  const rod = (T, a, b, r, color, e = 0) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], flat = Math.hypot(dx, dz), len = Math.hypot(flat, dy);
    const F = T.at((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), -Math.atan2(dy, flat));
    F.B(r, r, len, color, 0, 0, 0, e ? { emissive: e, glow: true } : {});
  };
  // 2001 · peer to peer, two pieces: Chord's ring, sixteen nodes round a circle with one node's finger table drawn
  // across it to the nodes one, two, four and eight steps on (the `ring` piece), and BitTorrent's swarm, a file as a
  // stack of pieces with gaps in it and six peers each sending a piece in along its own line (the `swarm` piece).
  M.p2p = (T, fine, key, part) => {
    // Two models on one wide plinth, each on a riser over its own card and named on a strip of its own at the riser's
    // front: the swarm (left, +x) and the Chord ring (right). The swarm's pieces shuttle between the peers.
    // Each model on a riser tilted 30 degrees toward the path (a steel lectern), half again its size, so the hops and
    // the shuttling pieces read from the walk; the wedge is closed on every side for the walk round.
    const tilted = (T, w, d) => { const S = lectern(T, 0, 0.02, w, d, 1.05, 0.05, C.steelDark); return tools(S.k, 0, S.s * 1.5, S.moving, T.quiet); };
    const ring = (T) => {
      const R = tilted(T, 0.95, 0.95);
      R.Y(0.28, 0.29, 0.02, C.dark, 0, 0.01, 0, { seg: 40 });
      R.R(0.24, 0.005, C.steelLight, 0, 0.12, 0, { seg: 56, sides: 8 });
      const at = (i) => { const a = i / 16 * TAU; return [0.24 * Math.sin(a), 0.12, -0.24 * Math.cos(a)]; };
      for (let i = 0; i < 16; i++) {
        const p = at(i), first = i === 0;
        R.Y(0.005, 0.005, 0.1, C.steel, p[0], 0.07, p[2], { seg: 8 });
        R.ball(first ? 0.024 : 0.017, first ? C.amber : "#8fb6ff", p[0], 0.12, p[2], { seg: 12, emissive: first ? 0.9 : 0.35 });
      }
      for (const k of [1, 2, 4, 8]) rod(R, at(0), at(k), 0.005, C.glow, 0.8);
      // A lookup running round the ring: a bead that hops the finger table's way, node 0 to 1, 2, 4, 8, and back.
      if (R.moving) for (const [k, ph] of [[1, 0], [2, 0.5], [4, 1.0], [8, 1.5]]) { const a = at(0), b = at(k); R.shuttle(LED_G(), a[0], a[1] + 0.03, a[2], [b[0] - a[0], 0, b[2] - a[2]], 4, ph); }
      strip(T, ["CHORD", "FIND ANY KEY IN A FEW HOPS, NO SERVER"], 0, 0.045, -0.57, 0.5, 0.0034);
    };
    const swarm = (T) => {
      const S = tilted(T, 0.95, 0.95);
      S.Y(0.3, 0.31, 0.02, C.dark, 0, 0.01, 0, { seg: 40 });
      // The file: ten coloured pieces in a row on a stand in the middle, three still missing from this peer's copy.
      const colors = ["#e05a4a", "#e0a23a", "#d7d04a", "#5bc45b", "#49b9c9", "#4a7de0", "#8a5ae0", "#d05ab8", "#c9c9c9", "#7a8a9a"], missing = new Set([3, 6, 8]);
      S.B(0.34, 0.04, 0.08, C.steel, 0, 0.04, 0);
      for (let i = 0; i < 10; i++) { const x = (i - 4.5) * 0.032; if (missing.has(i)) S.B(0.026, 0.004, 0.05, "#2a2c31", x, 0.062, 0); else S.B(0.026, 0.03, 0.05, colors[i], x, 0.077, 0); }
      // Six peers round it, each a small box with the piece it holds on top, a lamp, and its piece shuttling in to
      // the file and back (tit for tat: one goes out as one comes in).
      const peers = [[0, 0.24, 3], [0.21, 0.12, 6], [0.21, -0.12, 8], [0, -0.24, 1], [-0.21, -0.12, 6], [-0.21, 0.12, 3]];
      peers.forEach(([x, z, piece], i) => {
        S.B(0.06, 0.06, 0.06, "#2e3238", x, 0.05, z);
        S.B(0.046, 0.012, 0.046, colors[piece], x, 0.086, z);
        rod(S, [x, 0.08, z], [0, 0.065, 0], 0.003, "#55606c");
        if (S.moving) S.shuttle(BL.models.noShadow(BL.models.box({ w: 0.03, h: 0.012, d: 0.03, color: colors[piece], emissive: 0.6 })), x * 0.8, 0.11, z * 0.8, [-x * 0.7, -0.03, -z * 0.7], 3.6, i * 0.6);
        else S.B(0.03, 0.012, 0.03, colors[piece], x * 0.45, 0.095, z * 0.45, { emissive: 0.5, glow: true });
        if (fine) lamp2(S, false, x - 0.018, 0.07, z - 0.031, 1.1, i * 0.18);
      });
      strip(T, ["SWARM", "A FILE IN PIECES, TRADED PEER TO PEER"], 0, 0.045, -0.57, 0.5, 0.0034);
    };
    if (part === "swarm") { swarm(T); return; }
    if (part === "ring" || part === "main") { ring(T); return; }
    swarm(T.at(spot(0, 2), 0, 0.05)); ring(T.at(spot(1, 2), 0, 0.05));
  };

  // 1982 · the Byzantine Generals as a sand-table: a walled city on a low hill, four generals' tents round it with
  // their standards, messengers on the paths between the camps, and one camp flying the traitor's black flag.
  M.byzantine = (T, fine) => {
    T.B(0.9, 0.05, 0.7, C.woodDark, 0, 0.025, 0);
    T.B(0.86, 0.012, 0.66, "#c9b27a", 0, 0.056, 0);
    // The hill and the city: walls with towers at the corners, a keep in the middle, a gate toward the front.
    T.lathe([[0.22, 0], [0.2, 0.03], [0.14, 0.05], [0, 0.05]], "#b59f6a", 0, 0.062, 0, { seg: 20 });
    T.B(0.22, 0.05, 0.22, "#8a8f96", 0, 0.137, 0);
    T.B(0.18, 0.012, 0.18, "#6f747b", 0, 0.168, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { T.B(0.04, 0.08, 0.04, "#8a8f96", sx * 0.11, 0.152, sz * 0.11); T.lathe([[0, 0], [0.028, 0], [0, 0.03]], C.red, sx * 0.11, 0.192, sz * 0.11, { seg: 8 }); }
    T.B(0.07, 0.07, 0.07, "#9aa0a7", 0, 0.207, 0);
    T.lathe([[0, 0], [0.05, 0], [0, 0.05]], C.red, 0, 0.242, 0, { seg: 8 });
    T.B(0.04, 0.03, 0.012, C.woodDark, 0, 0.127, -0.116);
    if (fine) for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; T.B(0.012, 0.012, 0.012, "#6f747b", 0.1 * Math.sin(a) * 1.05, 0.168, 0.1 * Math.cos(a) * 1.05); }
    // The camps: a tent (a prism roof) and a standard at each corner of the table, the far right one the traitor's.
    [[-0.33, -0.22, false], [0.33, -0.22, false], [-0.33, 0.22, false], [0.33, 0.22, true]].forEach(([x, z, traitor]) => {
      T.prism([[-0.06, 0], [0.06, 0], [0, 0.07]], 0.1, traitor ? "#5a5250" : C.cream, x, 0.062, z);
      T.B(0.006, 0.14, 0.006, C.woodDark, x + 0.08, 0.132, z);
      T.B(0.035, 0.022, 0.003, traitor ? C.black : C.amber, x + 0.098, 0.19, z, { emissive: traitor ? 0 : 0.5, glow: !traitor });
      if (fine) T.lathe([[0, 0], [0.025, 0], [0.02, 0.012], [0, 0.012]], "#8a4f0c", x - 0.06, 0.062, z + 0.06, { seg: 8 });
    });
    // The paths between the camps, and the messengers on them.
    for (const [x0, z0, x1, z1] of [[-0.33, -0.22, 0.33, -0.22], [-0.33, 0.22, 0.33, 0.22], [-0.33, -0.22, -0.33, 0.22], [0.33, -0.22, 0.33, 0.22]]) {
      T.B(Math.abs(x1 - x0) + 0.02, 0.003, Math.abs(z1 - z0) + 0.02, "#a8905e", (x0 + x1) / 2, 0.064, (z0 + z1) / 2);
    }
    for (const [x, z] of [[-0.1, -0.22], [0.33, 0.0], [0.08, 0.22]]) { T.Y(0.008, 0.008, 0.03, C.blue, x, 0.08, z, { seg: 6 }); T.ball(0.009, C.cream, x, 0.1, z, { seg: 6 }); }
    strip(T, ["THE BYZANTINE GENERALS", "AGREE ON ONE PLAN THOUGH SOME OF THE MESSENGERS LIE"], 0, 0.05, -0.37, 0.7, 0.0036);
  };

  // A window of the early-nineties GUI kind on a screen frame `S` (`w` by `h` glass): a pale page, a dark title bar,
  // dark lines of text, and buttons along the foot. Rows are [text, kind]: "title", "line", "bold", "button".
  const guiScreen = (S, w, h, rows, px0 = 0.0022) => {
    // The pixel the largest (up to `px0`) at which the longest row, the row of buttons and the whole column fit.
    const wide = Math.max(1, ...rows.filter(([, kind]) => kind !== "button").map(([t]) => t.length * 6 - 1)), btn = rows.filter(([, kind]) => kind === "button").reduce((a, [t]) => a + t.length * 6 + 12, 0), tall = rows.reduce((a, [, kind]) => a + (kind === "title" ? 15 : kind === "button" ? 0 : 10), 0) + (btn ? 14 : 0) + 9;
    const px = Math.min(px0, (w - 0.03) / wide, btn ? (w - 0.03) / btn : px0, (h - 0.012) / tall);
    S.B(w - 0.006, h - 0.006, LIFT, "#d8d8d0", 0, 0, S.layer(0), { emissive: 0.45, glow: true });
    S.B(w - 0.006, px * 12, LIFT, "#1c2a5e", 0, h / 2 - 0.003 - px * 6, S.layer(1), { emissive: 0.3, glow: true });
    let y = h / 2 - 0.003 - px * 6, bx = w / 2 - 0.014;
    rows.forEach(([text, kind]) => {
      if (kind === "title") { S.say(text, px, C.white, 0, y, S.ink(2), 0.3); y -= px * 15; return; }
      if (kind === "button") { const bw = (text.length * 6 + 6) * px; S.B(bw, px * 11, LIFT, "#b8b8b0", bx - bw / 2, y, S.layer(1), { emissive: 0.3, glow: true }); S.say(text, px, C.ink, bx - bw / 2, y, S.ink(2), 0.05); bx -= bw + px * 6; return; }
      if (text) S.say(text, px, kind === "bold" ? "#1c2a5e" : "#222", w / 2 - (text.length * 6 - 1) * px / 2 - 0.014, y, S.ink(2), 0.08);
      y -= px * 10;
    });
  };
  // 1988 · the Crypto Anarchist Manifesto as it went round, printed and passed hand to hand: a dot-matrix printer of
  // the late eighties (a stepped beige case, the smoked lid over the platen, its knob, the lamps and switches, a
  // tractor-fed page climbing out of it) and, on a board of its own beside it, the leaflet's first page large enough
  // to read. (+x is the viewer's left.)
  M.may88 = (T0, fine) => {
    const T = plain(T0), px = -0.32, pz = 0.08, w = 0.46, d = 0.3, h1 = 0.09, h2 = 0.15;
    T.B(w, h1, d, C.beige, px, h1 / 2, pz);
    T.B(w, h2 - h1, d * 0.6, C.beige, px, h1 + (h2 - h1) / 2, pz + d * 0.2);
    T.B(w - 0.03, 0.004, d * 0.34, C.beigeDark, px, h1 + 0.002, pz - d * 0.32);
    T.B(w * 0.7, 0.004, d * 0.4, "#3a3f46", px + 0.02, h2 + 0.004, pz + d * 0.2);
    T.Y(0.026, 0.026, 0.016, C.beigeDark, px - w / 2 - 0.008, h1 + 0.03, pz + d * 0.2, { rz: HALF, seg: 14 });
    // The page climbing out behind the lid: the tractor holes down both edges, a few lines printed on it.
    const Pg = T.at(px + 0.02, h2 + 0.004, pz + d * 0.44, 0, 0.12, 0);
    Pg.B(0.32, 0.22, 0.002, C.paper, 0, 0.11, 0);
    if (fine) {
      for (let i = 0; i < 6; i++) Pg.B(0.2 - (i % 3) * 0.02, 0.007, LIFT, "#5a5750", (i % 3) * 0.01, 0.185 - i * 0.024, -0.002);
      for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) Pg.B(0.006, 0.006, LIFT, "#8a8577", sx * 0.148, 0.2 - i * 0.022, -0.002);
    }
    const F = T.face("front", px - w * 0.2, h1 * 0.5, pz - d / 2);
    F.B(w * 0.5, h1 * 0.6, 0.004, C.beigeDark, 0, 0, -0.002);
    if (fine) {
      for (let i = 0; i < 3; i++) F.B(0.03, 0.016, 0.006, C.cream, 0.07 - i * 0.045, 0.004, -0.007);
      F.B(0.01, 0.01, 0.004, C.led, -0.085, 0.004, -0.007, { emissive: 1, glow: true });
    }
    // The leaflet on its board: the title, its author, the sentence it opens with.
    const Lb = easel(T, 0.3, -0.18, 0.48, 0.58, 0.36);
    card(Lb, [["THE CRYPTO", 0.0064, C.ink, 0.05], ["ANARCHIST", 0.0064, C.ink, 0.05], ["MANIFESTO", 0.0064, C.ink, 0.05], ["", 0.002], ["TIMOTHY C. MAY", 0.0044, C.ink, 0.05], ["", 0.002], ["A SPECTER IS HAUNTING", 0.0031, "#3a3832", 0.05], ["THE MODERN WORLD,", 0.0031, "#3a3832", 0.05], ["THE SPECTER OF", 0.0031, "#3a3832", 0.05], ["CRYPTO ANARCHY.", 0.0031, "#3a3832", 0.05]], 0.46, 0.56, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.03 });
    wire(T, [px, 0.04, pz + d / 2], outlet(T, 2)[0]);
    label(T, ["THE CRYPTO ANARCHIST MANIFESTO", "PRINTED AND PASSED HAND TO HAND, 1988"]);
  };
  // 1994 · ecash at work: on the left a desktop PC of the year, its monitor showing the wallet window, the keyboard
  // and mouse before it; on the right, on a riser, the card terminal of the Dutch trials, its display and keys on a
  // slope to the path, the card in its slot. (+x is the viewer's left.)
  M.digicash = (T0, fine) => {
    const T = plain(T0), pw = mm(400), ph = mm(150), pd = mm(380), px = 0.27, pz = 0.28;
    tower(T, px, 0, pz, pw, ph, pd, fine, true);
    crt(T, px, ph, pz - pd / 2 + 0.03, mm(300), mm(225), C.beige, (S, sw, sh) => {
      guiScreen(S, sw, sh, [["ECASH WALLET", "title"], ["BALANCE   $ 125.00", "bold"], ["", "line"], ["COINS  1  2  5  10  20", "line"], ["LAST PAYMENT  $ 2.50", "line"], ["WITHDRAW FROM BANK...", "line"], ["", "line"], ["PAY", "button"], ["WITHDRAW", "button"]], 0.0026);
    }, fine);
    keyboard(T, px, 0, -0.14, pw * 0.95, mm(150), C.beige, fine);
    T.B(0.06, 0.028, 0.1, C.beige, px - pw / 2 - 0.08, 0.014, -0.14);
    // The card terminal on its riser: the display above the keys on the slope, the card in the slot at its foot.
    const rx = -0.37, rz = 0.02;
    T.B(0.34, 0.05, 0.36, C.steelDark, rx, 0.025, rz);
    const R = T.at(rx, 0.05, rz), S = lectern(R, 0, 0.04, 0.24, 0.22, 0.7, 0.05, "#d9d4c6");
    card(S.face("top", 0, 0.004, 0.085), [["INSERT CARD", 0.0034, C.phosphor, 0.8], ["NLG 0.00", 0.003, "#2a9c58", 0.6]], 0.2, 0.09, { bg: "#16241a", t: 0.006, margin: 0.01, gap: 0.6 });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) S.B(0.032, 0.008, 0.024, c === 1 && r === 3 ? C.led : "#4a4a4e", (c - 1) * 0.046, 0.004, 0.012 - r * 0.034);
    R.B(0.074, 0.008, 0.006, C.black, 0, 0.03, 0.04 - 0.11 - 0.012);
    R.B(mm(54), 0.0016, mm(86), "#2f63c9", 0, 0.03, 0.04 - 0.11 - 0.04);
    R.B(mm(12), 0.001, mm(11), C.gold, mm(12), 0.0312, 0.04 - 0.11 - 0.055);
    cord(T, [[rx, 0.056, rz + 0.17], [rx, 0.008, rz + 0.19], [rx, 0.008, 0.42], [px - pw / 2, 0.008, 0.42]], 0.006, "#8a8577");
    const sockets = outlet(T, 2);
    wire(T, [px, 0.07, pz + pd / 2], sockets[0]);
    wire(T, [px - 0.12, 0.3, pz + 0.17], sockets[1]);
    label(T, ["DIGICASH · ECASH", "BLIND SIGNATURES AT WORK, 1994 TO 1998"]);
  };
  // 1991 · PGP 1.0 as it ran: a 386 tower at the back left, beside it a 14-inch VGA monitor on its riser with the DOS
  // screen (the program's banner of 5 June 1991, a key pair being made with `pgp -k`, the public key written out
  // uuencoded), the keyboard before it, the floppy it went round on stood up with its label to the path; and to the
  // right, on a board of its own, a public key in the ASCII armour PGP 2.0 brought in 1992, the form every later key
  // took. (+x is the viewer's left.)
  M.pgp = (T0, fine) => {
    const T = plain(T0), tw = 0.2, th = 0.46, td = 0.4, mx = 0.12, mz = 0.16;
    tower(T, 0.47, 0, 0.3, tw, th, td, fine, false);
    T.B(0.36, 0.05, 0.3, C.beige, mx, 0.025, mz + 0.16);
    crt(T, mx, 0.05, mz, 0.3, 0.225, C.beige, (S, sw, sh) => {
      lines(S, ["C:\\PGP>PGP -K", "PRETTY GOOD PRIVACY 1.0", "(C) 1990 PHILIP ZIMMERMANN", "5 JUN 91", "GENERATING RSA KEY PAIR", "................DONE", "C:\\PGP>TYPE PHIL.PUB", "BEGIN 644 PHIL.PUB", "M4$9)1T%)3B!0R$X%4E,", "C:\\PGP>_"], 0.0022, sw, sh, "#d8d8d0", 0.8);
    }, fine);
    keyboard(T, mx, 0, -0.1, 0.36, 0.14, C.beige, fine);
    // The disk it went round on, stood up on a rest with its label to the path.
    T.B(0.18, 0.06, 0.2, C.steelDark, 0.47, 0.03, -0.14);
    const Fd = easel(T.at(0.47, 0.06, 0), 0, -0.2, 0.12, 0.125, 0.5, "#2b2b30");
    Fd.B(0.05, 0.04, 0.003, C.steelLight, -0.008, 0.042, -0.0005);
    card(Fd.at(0, -0.028, -0.001), [["PGP 1.0", 0.0034, C.inkBlue, 0.05], ["JUN 91", 0.0028, C.inkBlue, 0.05]], 0.104, 0.066, { bg: C.paper, t: 0.002, margin: 0.006, gap: 0.5 });
    // The armoured key block, large enough to read.
    const Kb = easel(T, -0.36, -0.14, 0.42, 0.44, 0.45);
    card(Kb, [["-----BEGIN PGP", 0.0029, C.ink, 0.05], ["PUBLIC KEY BLOCK-----", 0.0029, C.ink, 0.05], ["VERSION: 2.0", 0.0027, C.ink, 0.05], ["", 0.0015], ["MQCNAIRJ3VQAAAEEANEUOZPL", 0.0027, C.inkBlue, 0.05], ["0X2K9ME2A7VNPFQ4B3WZKH1T", 0.0027, C.inkBlue, 0.05], ["=A7XZ", 0.0027, C.inkBlue, 0.05], ["-----END PGP", 0.0029, C.ink, 0.05], ["PUBLIC KEY BLOCK-----", 0.0029, C.ink, 0.05], ["", 0.0015], ["PGP 2.0 ARMOUR, 1992", 0.0024, "#6a6660", 0.05]], 0.4, 0.42, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.018 });
    const sockets = outlet(T, 2);
    wire(T, [0.47, 0.1, 0.3 + td / 2], sockets[0]);
    wire(T, [mx, 0.2, mz + 0.32], sockets[1]);
    cord(T, [[0.47 - tw / 2, 0.012, 0.42], [mx + 0.18, 0.012, 0.42]], 0.006, "#8a8577");
    label(T, ["PRETTY GOOD PRIVACY 1.0", "STRONG ENCRYPTION FOR ANYONE WITH A PC, JUNE 1991"]);
  };
  // 1992 to 1994 · three vignettes, each over its own plaque: the list (a PC in a text mail reader with the threads of
  // its first months, the keyboard, the dial-up modem and a mug); the Manifesto on a board (dated 9 March 1993, its
  // first sentence); the Cyphernomicon printed into a ring binder stood on a rest (version 0.666 of 10 September
  // 1994). The viewer shows each alone (`part`: "main", "manifesto", "binder"). (+x is the viewer's left.)
  M.cypherpunks = (T0, fine, key, part) => {
    const T = plain(T0);
    const list = (F) => {
      tower(F, 0.2, 0, 0.26, 0.46, 0.16, 0.42, fine, true);
      crt(F, 0.2, 0.16, 0.14, 0.3, 0.225, C.beige, (S, sw, sh) => {
        lines(S, ["CYPHERPUNKS  (247 NEW)", "----------------------", "RE: ANONYMOUS REMAILERS", "RE: DIGITAL CASH", "A CYPHERPUNK'S MANIFESTO", "RE: DC-NETS", "RE: PGP 2.0 KEYS", "RE: CLIPPER CHIP", "> _"], 0.0024, sw, sh);
      }, fine);
      keyboard(F, 0.2, 0, -0.14, 0.4, 0.15, C.beige, fine);
      // The modem on a shelf of its own, its lamps to the path; the line to the PC; a mug before it.
      F.B(0.39, 0.09, 0.29, C.steelDark, -0.28, 0.045, 0.14);
      modem(F, -0.28, 0.09, 0.14, fine);
      cord(F, [[-0.28, 0.008, 0.29], [-0.28, 0.008, 0.4], [-0.03, 0.008, 0.4]], 0.006, "#8a8577");
      F.lathe([[0, 0], [0.034, 0], [0.036, 0.09], [0.03, 0.09], [0.03, 0.006], [0, 0.006]], "#d8d2c2", -0.3, 0, -0.2, { seg: 14 });
      F.R(0.022, 0.006, "#d8d2c2", -0.34, 0.05, -0.2, { seg: 12, sides: 6 });
      if (fine) F.Y(0.028, 0.028, 0.004, "#3a2a1a", -0.3, 0.08, -0.2, { seg: 12 });
      label(F, ["THE CYPHERPUNKS", "THE LIST WHERE DIGITAL MONEY WAS ARGUED OUT, 1992"]);
    };
    const manifesto = (F) => {
      const Lb = easel(F, 0, -0.16, 0.5, 0.62, 0.4), dark = ["#3a3832", 0.05];
      card(Lb, [["A CYPHERPUNK'S", 0.005, C.ink, 0.05], ["MANIFESTO", 0.005, C.ink, 0.05], ["", 0.002], ["ERIC HUGHES", 0.004, C.ink, 0.05], ["9 MARCH 1993", 0.0034, C.ink, 0.05], ["", 0.002], ["PRIVACY IS NECESSARY", 0.0032, ...dark], ["FOR AN OPEN SOCIETY", 0.0032, ...dark], ["IN THE ELECTRONIC AGE.", 0.0032, ...dark]], 0.48, 0.6, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.03 });
      label(F, ["A CYPHERPUNK'S MANIFESTO", "ERIC HUGHES, 9 MARCH 1993"]);
    };
    const binder = (F) => {
      // The binder upright on a rest, its front cover to the path, the spine at the viewer's left.
      const w = 0.36, h = 0.44, t = 0.07, Lb = easel(F, 0, -0.12, 0.4, 0.48, 0.32, C.steelDark);
      Lb.B(w + 0.03, 0.014, t + 0.03, C.steelDark, 0, -h / 2 - 0.007, -t / 2);
      Lb.B(w, h, 0.005, "#24304d", 0, 0, -0.0025);
      Lb.B(w - 0.02, h - 0.014, t - 0.012, C.paper, -0.008, 0, -t / 2);
      Lb.B(0.005, h, t, "#24304d", w / 2 - 0.0025, 0, -t / 2);
      Lb.B(w, h, 0.005, "#2d3b5e", 0, 0, -t + 0.0025);
      if (fine) for (let i = 0; i < 3; i++) Lb.Y(0.008, 0.008, 0.004, C.steelLight, w / 2 - 0.03, (i - 1) * 0.13, -t - 0.001, { rx: HALF, seg: 10 });
      card(Lb.at(-0.012, 0.03, -t - 0.001), [["THE CYPHERNOMICON", 0.003, C.ink, 0.05], ["", 0.0015], ["TIMOTHY C. MAY", 0.0028, C.ink, 0.05], ["VERSION 0.666", 0.0026, "#3a3832", 0.05], ["10 SEPTEMBER 1994", 0.0026, "#3a3832", 0.05]], 0.3, 0.2, { bg: C.paper, t: 0.002, gap: 0.55, margin: 0.014 });
      label(F, ["THE CYPHERNOMICON", "THE CYPHERPUNKS' FAQ, PRINTED INTO A BINDER, 1994"]);
    };
    if (part === "manifesto") { manifesto(T); return; }
    if (part === "binder") { binder(T); return; }
    if (part === "main") { list(T); return; }
    const x0 = spot(0, 3);
    list(T.at(x0, 0, 0)); manifesto(T.at(spot(1, 3), 0, 0)); binder(T.at(spot(2, 3), 0, 0));
    const sockets = outlet(T, 3);
    wire(T, [x0 + 0.2, 0.05, 0.47], sockets[2]);
  };
  // 1994 · a notebook of the year, two inches thick and dark grey, its trackball in the palm rest, the lid open on a
  // pale screen with a web shop's order form and the payment window the merchant's button opened; beside it, on a
  // board of its own, the receipt; the phone line runs to a wall jack at the back. (+x is the viewer's left.)
  M.cybercash = (T0, fine) => {
    const T = plain(T0), w = 0.38, d = 0.29, h = 0.05, nx = 0.17, nz = 0.04, lh = 0.29, sw = 0.33, sh = 0.235;
    T.B(w, h, d, "#4a4d52", nx, h / 2, nz);
    T.B(w - 0.02, 0.004, d - 0.02, "#3c3f44", nx, h + 0.002, nz);
    keyboard(T, nx, h - 0.03, nz + d * 0.14, w * 0.86, d * 0.42, "#4a4d52", fine, "#2a2c30");
    T.B(w * 0.36, 0.006, d * 0.2, "#3c3f44", nx, h + 0.003, nz - d * 0.3);
    T.ball(0.015, "#1e1f22", nx, h + 0.009, nz - d * 0.3, { seg: 14 });
    // The lid, leaning back from the hinge; the screen on its face.
    const L = T.at(nx, h, nz + d / 2, 0, 0.22);
    L.B(w, lh, 0.016, "#4a4d52", 0, lh / 2, 0.008);
    L.B(sw + 0.02, sh + 0.02, 0.004, "#3c3f44", 0, lh / 2, -0.002);
    L.B(sw, sh, 0.004, "#e6ebf2", 0, lh / 2, -0.004, { emissive: 0.6, glow: true });
    const S = L.at(0, lh / 2, -0.006), form = ["#1b2d6b", 0.1];
    S.B(sw - 0.006, 0.012, LIFT, "#9aa0ab", 0, sh / 2 - 0.009, S.layer(0), { emissive: 0.3, glow: true });
    card(S.at(0, sh * 0.2, 0), [["ORDER FORM", 0.003, ...form], ["BOOK          29.95", 0.0026, ...form], ["SHIPPING       4.00", 0.0026, ...form], ["TOTAL        $33.95", 0.0026, ...form]], sw - 0.01, sh * 0.42, { bg: null, left: true, margin: 0.012, gap: 0.6 });
    card(S.at(-0.02, -sh * 0.25, -0.003), [["WALLET · PAYMENT", 0.0026, C.white, 0.4], ["PAY $33.95 BY CARD", 0.0028, "#ffe9a8", 0.4], ["CONNECTING TO GATEWAY..", 0.0022, "#b8c4e0", 0.3]], sw * 0.8, sh * 0.42, { bg: "#1c2a5e", lit: 0.3, margin: 0.012, gap: 0.6 });
    // The receipt on its board.
    const Rc = easel(T, -0.37, -0.1, 0.24, 0.4, 0.4);
    card(Rc, [["CYBERCASH", 0.0032, C.inkBlue, 0.1], ["RECEIPT", 0.0034, C.ink, 0.05], ["", 0.002], ["BOOK   29.95", 0.0026, C.ink, 0.05], ["SHIPPING 4.00", 0.0026, C.ink, 0.05], ["TOTAL $33.95", 0.003, C.inkBlue, 0.1], ["", 0.002], ["PAID", 0.0042, C.red, 0.1]], 0.22, 0.38, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.016 });
    // The wall jack on a block at the back, the phone line to it, the power lead to the strip.
    T.B(0.06, 0.09, 0.03, "#e8e2d2", 0.44, 0.045, 0.46);
    if (fine) T.B(0.014, 0.012, 0.006, C.black, 0.44, 0.04, 0.443);
    cable(T, [[nx + w / 2 - 0.02, 0.03, nz + d / 2], [0.4, 0.01, 0.36], [0.44, 0.04, 0.44]], 0.003, "#cfc9b8", 0.1, false);
    wire(T, [nx - 0.1, 0.03, nz + d / 2], outlet(T, 2)[0]);
    label(T, ["CYBERCASH", "A WALLET WINDOW OVER THE WEB'S FIRST SHOP PAGES"]);
  };
  // 18 June 1996 · the report on a board raised and tilted to the path, large enough to read its cover as the
  // document carries it: the title, the three authors, the NSA office and division, the date.
  M.mint = (T0, fine) => {
    const T = plain(T0), Lb = easel(T, 0, -0.2, 0.6, 0.76, 0.65, C.wood);
    card(Lb, [["HOW TO MAKE A MINT:", 0.0045, C.ink, 0.05], ["THE CRYPTOGRAPHY OF", 0.0038, C.ink, 0.05], ["ANONYMOUS", 0.0038, C.ink, 0.05], ["ELECTRONIC CASH", 0.0038, C.ink, 0.05], ["", 0.0025], ["LAURIE LAW", 0.0036, C.ink, 0.05], ["SUSAN SABETT", 0.0036, C.ink, 0.05], ["JERRY SOLINAS", 0.0036, C.ink, 0.05], ["", 0.0025], ["NATIONAL SECURITY AGENCY", 0.003, "#3a3832", 0.05], ["OFFICE OF INFORMATION", 0.003, "#3a3832", 0.05], ["SECURITY RESEARCH", 0.003, "#3a3832", 0.05], ["AND TECHNOLOGY", 0.003, "#3a3832", 0.05], ["CRYPTOLOGY DIVISION", 0.003, "#3a3832", 0.05], ["", 0.0025], ["18 JUNE 1996", 0.0036, C.ink, 0.05]], 0.58, 0.74, { bg: C.paper, t: 0.003, gap: 0.45, margin: 0.03 });
    label(T, ["HOW TO MAKE A MINT", "THE NSA'S OWN SURVEY OF ANONYMOUS CASH, 1996"]);
  };

  // 1996 · e-gold: a round steel vault door standing ajar on its hinge post beside a section of the vault's wall, as
  // a bank's is built: the thick disc with its bolt heads round the rim, the five-spoked wheel that draws the bolts,
  // the combination dial beside it and the day-gate bars behind; through the opening the shelf of bars the grams
  // stood for, and the plate over it with the reserve as the company reported it at its 2006 peak.
  M.egold = (T0, fine) => {
    // The vault at about six tenths of its drawn size, set back and to the right so the open door stays on the top.
    const R0 = plain(T0), T = tools(R0.at(-0.14, 0, 0.3).k, 0, 0.62, R0.moving, R0.quiet);
    // A walk-round vault: a thick-walled strongroom with real depth, the round door swung open on its hinge, the day
    // gate inside it, and through the opening the lit shelves of gold bars; a grille at the back shows the gold from
    // behind too. The reserve on a larger plate over the door, with its date.
    const R = mm(240), thick = mm(80), VW = 0.78, VH = 0.98, VD = 0.56, face = -VD / 2;
    const wall = "#4a4e55", inner = "#2b2e34";
    // The box: floor, roof, back (with a grille), two sides, and the front wall round the round opening.
    T.B(VW, 0.03, VD, wall, 0, 0.015, 0);
    T.B(VW, 0.03, VD, wall, 0, VH - 0.015, 0);
    for (const sx of [-1, 1]) T.B(0.03, VH, VD, wall, sx * (VW / 2 - 0.015), VH / 2, 0);
    T.B(VW, VH, 0.03, wall, 0, VH / 2, VD / 2 - 0.015);
    const Gr = T.face("back", 0, VH * 0.55, VD / 2 + 0.002);
    Gr.B(0.3, 0.3, 0.004, C.black, 0, 0, -0.002);
    for (let i = -3; i <= 3; i++) { Gr.B(0.006, 0.3, 0.006, C.steelLight, i * 0.04, 0, -0.006); Gr.B(0.3, 0.006, 0.006, C.steelLight, 0, i * 0.04, -0.006); }
    const cy = R + 0.12;
    // The front wall as four slabs round the opening (above, below, either side), the opening a true hole.
    T.B(VW, VH - cy - R - 0.02, 0.04, wall, 0, (VH + cy + R + 0.02) / 2, face + 0.02);
    T.B(VW, cy - R - 0.02, 0.04, wall, 0, (cy - R - 0.02) / 2, face + 0.02);
    for (const sx of [-1, 1]) T.B((VW - 2 * R - 0.04) / 2, 2 * R + 0.04, 0.04, wall, sx * (VW / 2 - (VW - 2 * R - 0.04) / 4), cy, face + 0.02);
    // The opening's rim, a ring of thick wall segments.
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, b = (i + 1) / 24 * TAU; T.at(Math.cos(a) * (R + 0.02), cy + Math.sin(a) * (R + 0.02), face + 0.02, 0, 0, a + HALF).B(2 * Math.PI * (R + 0.02) / 24 + 0.004, 0.05, 0.05, "#5a5f66", 0, 0, 0); void b; }
    T.R(R + 0.045, 0.02, C.steelLight, 0, cy, face - 0.004, { rx: HALF, seg: 40, sides: 8 });
    // Inside: the day gate just behind the opening, and three lit shelves of bars running back.
    for (let i = -4; i <= 4; i++) T.Y(0.006, 0.006, 2 * R - 0.02, C.steelLight, i * R * 0.22, cy, face + 0.07, { seg: 8 });
    T.B(R * 1.9, 0.012, 0.012, C.steelLight, 0, cy + R * 0.9, face + 0.07);
    T.B(R * 1.9, 0.012, 0.012, C.steelLight, 0, cy - R * 0.9, face + 0.07);
    const bar = (x, y, z) => {
      const F = T.at(x, y, z);
      F.prism([[-mm(45), 0], [mm(45), 0], [mm(38), mm(28)], [-mm(38), mm(28)]], mm(100), C.goldDark, 0, 0, 0);
      F.prism([[-mm(42), LIFT], [mm(42), LIFT], [mm(36), mm(28) + LIFT], [-mm(36), mm(28) + LIFT]], mm(96), C.gold, 0, 0, 0);
    };
    for (let s = 0; s < 3; s++) {
      const y = cy - R * 0.75 + s * 0.17;
      T.B(VW - 0.08, 0.012, 0.3, C.steel, 0, y, 0.08);
      T.B(VW - 0.12, 0.004, 0.012, C.glow, 0, y + 0.15, 0.08 - 0.13, { emissive: 0.9, glow: true });
      for (let i = 0; i < 5; i++) { bar(-mm(240) + i * mm(120), y + 0.006, 0.0); if (fine) bar(-mm(180) + i * mm(120), y + 0.006 + mm(28) + LIFT, 0.0); bar(-mm(240) + i * mm(120), y + 0.006, 0.16); }
    }
    // The door on its hinge post at the right, swung 50 degrees open toward the room.
    const hinge = T.at(R + 0.05, cy, face - 0.02, -50 * P.DEG);
    T.Y(0.022, 0.022, 2 * R + 0.22, C.steelLight, R + 0.05, cy, face - 0.03, { seg: 14 });
    for (const dy of [-R * 0.75, R * 0.75]) T.B(0.09, 0.05, 0.05, "#6a717a", R + 0.075, cy + dy, face - 0.03);
    hinge.Y(R, R, thick, "#596069", -R - 0.01, 0, 0, { rx: HALF, seg: 48 });
    hinge.R(R - 0.01, 0.014, "#3c4047", -R - 0.01, 0, -thick / 2 - 0.004, { rx: HALF, seg: 48, sides: 8 });
    hinge.Y(R * 0.86, R * 0.86, 0.01, "#6a717a", -R - 0.01, 0, -thick / 2 - 0.009, { rx: HALF, seg: 40 });
    if (fine) for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; hinge.Y(0.012, 0.012, 0.014, "#8b929b", -R - 0.01 + Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, -thick / 2 - 0.016, { rx: HALF, seg: 8 }); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; hinge.Y(0.016, 0.016, 0.05, C.steelLight, -R - 0.01 + Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0, { rz: a + HALF, seg: 10 }); }
    const W = hinge.at(-R - 0.01, 0, -thick / 2 - 0.06);
    W.R(R * 0.4, 0.012, C.steelLight, 0, 0, 0, { rx: HALF, seg: 32, sides: 8 });
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; W.B(0.014, R * 0.76, 0.014, C.steelLight, 0, 0, 0.004 * (i % 2), { rz: a }); }
    W.Y(0.04, 0.04, 0.07, "#7c838c", 0, 0, 0.012, { rx: HALF, seg: 16 });
    const Dl = hinge.at(-R - 0.01 - R * 0.62, R * 0.12, -thick / 2 - 0.028);
    Dl.Y(0.045, 0.05, 0.03, "#2a2d33", 0, 0, 0, { rx: HALF, seg: 24 });
    Dl.Y(0.03, 0.03, 0.012, "#8b929b", 0, 0, -0.02, { rx: HALF, seg: 20 });
    if (fine) for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; Dl.B(0.003, i % 5 ? 0.006 : 0.012, 0.003, C.white, Math.cos(a) * 0.04, Math.sin(a) * 0.04, -0.016); }
    hinge.B(0.02, 0.14, 0.02, C.steelLight, -R - 0.01 - R * 0.62, -R * 0.3, -thick / 2 - 0.045);
    hinge.B(0.09, 0.02, 0.02, C.steelLight, -R - 0.01 - R * 0.62 + 0.035, -R * 0.3 - 0.06, -thick / 2 - 0.045);
    // The reserve on a board of its own beside the vault: the figure the company reported, with the date it stood at.
    const Pb = easel(R0, 0.4, -0.12, 0.34, 0.34, 0.4, C.steelDark);
    card(Pb, [["GOLD ON DEPOSIT", 0.003, "#c9ccd0", 0.15], ["APRIL 2006", 0.0026, "#c9ccd0", 0.15], ["", 0.0015], ["123,874 OZ", 0.0046, C.glow, 0.95], ["", 0.0015], ["ABOUT 3.85 TONNES,", 0.0024, "#c9ccd0", 0.15], ["BY THE COMPANY'S", 0.0024, "#c9ccd0", 0.15], ["OWN REPORT", 0.0024, "#c9ccd0", 0.15]], 0.32, 0.32, { t: 0.004, gap: 0.55, margin: 0.016 });
    label(R0, ["E-GOLD", "GRAMS OF GOLD IN A VAULT, MOVED BETWEEN ACCOUNTS ONLINE"]);
  };
  // 1997 · Hashcash: three postage stamps on a board facing the path, each laid out on lines of its own (the name,
  // a stamp in the 2002 header format with the address it is for, the hash's leading zeros in red, the bits it
  // took); beside them the mail terminal minting one in the 28 March 1997 announcement's own form, and the rubber
  // stamp on its pad. (+x is the viewer's left.)
  M.hashcash = (T0, fine) => {
    const T = plain(T0);
    const Fb = easel(T, 0.2, -0.16, 0.72, 0.38, 0.4);
    for (let i = 0; i < 3; i++) {
      const G = Fb.at((1 - i) * 0.234, 0, -0.001);
      G.B(0.226, 0.36, 0.003, "#d9d0b4", 0, 0, 0);
      card(G.at(0, 0, -0.0016), [["HASHCASH", 0.0042, C.inkBlue, 0.05], ["", 0.001], ["1:20:020801:", 0.0026, C.ink, 0.05], ["ADAM@", 0.0026, C.ink, 0.05], ["CYPHERSPACE.ORG", 0.0026, C.ink, 0.05], ["", 0.001], ["SHA-1", 0.0026, "#5a5750", 0.05], ["00000...", 0.0046, C.red, 0.1], ["", 0.001], ["20 BITS", 0.0034, C.ink, 0.05]], 0.208, 0.34, { bg: "#f3eedf", t: 0.002, margin: 0.01, gap: 0.5 });
    }
    // The terminal of 1997: the stamp being minted in the form the announcement gave (version 0, the date as yymmdd,
    // the address, the counter), its lines from the left inside an even margin.
    const tw = mm(170), th = mm(130), cx = -0.4;
    T.B(tw + 0.06, 0.04, mm(200), C.cream, cx, 0.02, 0.2);
    crt(T, cx, 0.04, 0.1, tw, th, C.cream, (Sc, w, h) => lines(Sc, ["$ HASHCASH -B20 ADAM@", "  CYPHERSPACE.ORG", "", "MINTING...", "0:970328:ADAM@", "CYPHERSPACE.ORG:", "COUNTER 0F3A91", "", "SHA1 00000B7... 20 BITS"], 0.0022, w, h), fine);
    keyboard(T, cx, 0, -0.1, tw + 0.04, mm(70), C.cream, fine);
    // The rubber stamp standing on its pad, in front of the terminal.
    const Sp = T.at(-0.4, 0, -0.34, 0.2);
    Sp.B(mm(70), mm(8), mm(46), "#2a2a2e", 0, mm(4), 0);
    Sp.B(mm(52), mm(10), mm(30), C.woodDark, 0, mm(13), 0);
    Sp.Y(mm(8), mm(11), mm(40), C.wood, 0, mm(38), 0, { seg: 12 });
    Sp.ball(mm(13), C.wood, 0, mm(64), 0, { seg: 12 });
    wire(T, [cx, 0.14, 0.34], outlet(T, 2)[0]);
    label(T, ["HASHCASH", "A LITTLE CPU BURNED FOR A STAMP ANYONE CAN CHECK"]);
  };
  // 2005 · bit gold: a brass beam balance of the counting-house kind, level: on the left pan a weight, on the right
  // three gold tiles stood on edge, each stamped with the first digits of a hash, hung clear of the stirrups; the
  // strip names the four steps Szabo set out. Nothing moves. (+x is the viewer's left.)
  M.bitgold = (T0, fine) => {
    const T = plain(T0), z = 0.08, beamY = 0.62, panY = 0.2, R = 0.2;
    T.B(0.5, 0.04, 0.26, C.woodDark, 0, 0.02, z);
    T.B(0.44, 0.012, 0.2, C.wood, 0, 0.046, z);
    T.B(0.034, beamY - 0.05, 0.034, C.brass, 0, 0.05 + (beamY - 0.05) / 2, z);
    T.Y(0.022, 0.03, 0.05, C.brassDark, 0, beamY + 0.035, z, { seg: 10 });
    T.B(0.78, 0.02, 0.026, C.brass, 0, beamY, z);
    for (const sx of [-1, 1]) {
      const px = sx * 0.37, rise = 0.27;
      // The pan and its stirrup: two upright rods outside whatever stands in the pan, a bar across, a rod to the beam.
      T.Y(R, R - 0.03, 0.016, C.brass, px, panY, z, { seg: 24 });
      for (const cx of [-1, 1]) T.B(0.008, rise, 0.008, C.brassDark, px + cx * (R - 0.008), panY + rise / 2, z);
      T.B(2 * R - 0.008, 0.008, 0.008, C.brassDark, px, panY + rise, z);
      T.B(0.008, beamY - panY - rise, 0.008, C.brassDark, px, panY + rise + (beamY - panY - rise) / 2, z);
      if (sx > 0) {
        T.Y(0.07, 0.085, 0.12, C.brassDark, px, panY + 0.008 + 0.06, z, { seg: 16 });
        T.Y(0.024, 0.03, 0.04, C.brass, px, panY + 0.008 + 0.14, z, { seg: 10 });
      } else ["00A7F3", "003C91", "00D1E8"].forEach((hash, i) => {
        const x = px + (1 - i) * 0.118;
        T.B(0.11, 0.09, 0.02, C.gold, x, panY + 0.008 + 0.045, z);
        if (fine) card(T.face("front", x, panY + 0.008 + 0.045, z - 0.01), [[hash, 0.0027, "#3b2608", 0.05]], 0.11, 0.09, { bg: null, margin: 0.006 });
      });
    }
    label(T, ["BIT GOLD", "CHALLENGE > PROOF > TIMESTAMP > REGISTRY"]);
  };
  // 1997 · a vending machine, the contract in hardware Szabo pointed at: a dark cabinet with its open display of five
  // shelves of cans behind the window frame, the coin mechanism (slot, bill validator, coin return) in the right-hand
  // column with the selection buttons lit, the delivery flap at the foot, the sold-out and exact-change lamps.
  M.szabo97 = (T0, fine) => {
    // The machine at a little over four tenths of its drawn size, so its roof is under eye height on the plinth.
    const R0 = plain(T0), T = tools(R0.at(0.3, 0, 0.16).k, 0, 0.43, R0.moving, R0.quiet);
    const w = mm(600), h = mm(1000), d = mm(400);
    // The case round a true recess for the window: the rear, the controls' column, the far wall, above and below.
    const cz = 0.13, col = "#4a505a", wx = -w * 0.17, ww = w * 0.62;
    T.B(w, h, d - cz, col, 0, h / 2, cz / 2);
    T.B(w * 0.36, h, cz, col, w * 0.32, h / 2, -d / 2 + cz / 2);
    T.B(w * 0.02, h, cz, col, -w * 0.49, h / 2, -d / 2 + cz / 2);
    T.B(ww, h * 0.09, cz, col, wx, h * 0.955, -d / 2 + cz / 2);
    T.B(ww, h * 0.25, cz, col, wx, h * 0.125, -d / 2 + cz / 2);
    T.B(ww - 0.03, 0.012, 0.012, C.glow, wx, h * 0.9, -d / 2 + 0.03, { emissive: 0.9, glow: true });
    T.B(w + 0.02, 0.04, d + 0.02, C.black, 0, 0.02, 0);
    T.B(w + 0.01, 0.02, d + 0.01, "#5a6068", 0, h - 0.01, 0);
    // The window on the left two thirds, its shelves and cans behind the frame (no pane: a merged part draws no glass).
    const winW = w * 0.62, winH = h * 0.66, winX = -w * 0.17, winY = h * 0.58, pane = -d / 2;
    T.B(winW + 0.02, winH + 0.02, 0.012, C.black, winX, winY, pane + 0.1);
    const colors = ["#c8322e", "#2f63c9", "#e0b43a"];
    for (let s = 0; s < 5; s++) {
      const sy = winY - winH / 2 + 0.03 + s * (winH - 0.04) / 5;
      T.B(winW - 0.01, 0.008, 0.11, "#5a5f66", winX, sy, pane + 0.06);
      const n = fine ? 5 : 3, can = (winW - 0.03) / 5;
      for (let i = 0; i < n; i++) T.Y(can * 0.36, can * 0.36, mm(120), colors[(s + i) % 3], winX - winW / 2 + 0.02 + (fine ? i : i * 2) * can + can / 2, sy + 0.004 + mm(60), pane + 0.06, { seg: 12 });
      if (fine) for (let i = 0; i < 5; i++) T.B(0.004, 0.006, 0.006, "#8d939b", winX - winW / 2 + 0.02 + i * can + can / 2, sy + 0.009, pane + 0.012);
    }
    for (const sx of [-1, 1]) T.B(0.02, winH + 0.02, 0.01, "#8d939b", winX + sx * (winW / 2 + 0.005), winY, pane - 0.006);
    T.B(winW + 0.03, 0.02, 0.01, "#8d939b", winX, winY + winH / 2 + 0.01, pane - 0.006);
    T.B(winW + 0.03, 0.02, 0.01, "#8d939b", winX, winY - winH / 2 - 0.01, pane - 0.006);
    // The right-hand column: the lit price window, the coin slot in its plate, the bill validator's mouth, the
    // selection buttons, the coin return cup.
    const F = T.face("front", w * 0.3, h * 0.6, pane);
    F.B(w * 0.3, h * 0.72, 0.006, "#3a3e46", 0, 0, -0.003);
    F.B(0.12, 0.045, 0.008, C.black, 0, winH * 0.48, -0.008);
    F.say("0.75", 0.0036, C.ledRed, 0, winH * 0.48, F.ink(2), 0.9);
    F.B(0.07, 0.04, 0.008, "#8d939b", 0, winH * 0.4, -0.008);
    F.B(0.004, 0.024, 0.004, C.black, 0, winH * 0.4, -0.013);
    if (fine) F.say("COINS", 0.002, "#c9ccd0", 0, winH * 0.4 - 0.036, F.ink(2), 0.15);
    F.B(0.075, 0.035, 0.01, "#1a1b1e", 0, winH * 0.3, -0.008);
    F.B(0.06, 0.004, 0.006, C.steelLight, 0, winH * 0.3, -0.014);
    if (fine) F.say("BILLS", 0.002, "#c9ccd0", 0, winH * 0.3 - 0.034, F.ink(2), 0.15);
    for (let i = 0; i < 5; i++) {
      const y = winH * 0.17 - i * 0.065;
      F.B(0.06, 0.04, 0.012, "#44484f", 0, y, -0.009);
      F.B(0.05, 0.03, 0.004, C.glow, 0, y, -0.016, { emissive: 0.8, glow: true });
      F.say(`A${i + 1}`, 0.0026, C.ink, 0, y, F.ink(5), 0.1);
    }
    if (fine) { F.B(0.012, 0.008, 0.004, C.ledRed, -0.025, -winH * 0.2, -0.008, { emissive: 0.8, glow: true }); F.say("EXACT CHANGE", 0.0016, "#8d939b", 0.012, -winH * 0.2, F.ink(2), 0.1); }
    F.B(0.07, 0.05, 0.01, "#1a1b1e", 0, -winH * 0.3, -0.008);
    F.B(0.06, 0.02, 0.014, "#3a3e45", 0, -winH * 0.3 - 0.012, -0.012);
    if (fine) F.say("COIN RETURN", 0.002, "#8d939b", 0, -winH * 0.3 - 0.04, F.ink(2), 0.1);
    // The delivery flap along the foot of the window.
    T.B(winW * 0.9, 0.11, 0.012, "#3a3e45", winX, 0.14, pane - 0.006);
    T.B(winW * 0.86, 0.09, 0.006, "#1a1b1e", winX, 0.14, pane - 0.013);
    if (fine) T.say("PUSH", 0.003, "#8d939b", winX, 0.14, pane - 0.0175, 0.1);
    // The contract the machine keeps, step by step, on a board beside it.
    const Cb = easel(R0, -0.3, -0.12, 0.46, 0.42, 0.4);
    card(Cb, [["A CONTRACT", 0.0044, C.amberText || C.amber, 0.5], ["IN HARDWARE", 0.0044, C.amberText || C.amber, 0.5], ["", 0.002], ["1  INSERT 0.75", 0.0034, C.white, 0.3], ["2  PRESS A1", 0.0034, C.white, 0.3], ["3  THE CAN DROPS", 0.0034, C.white, 0.3], ["", 0.002], ["NO CLERK, NO COURT", 0.003, C.glow, 0.5]], 0.44, 0.4, { t: 0.004, gap: 0.55, margin: 0.02 });
    label(R0, ["SMART CONTRACTS", "A VENDING MACHINE IS A CONTRACT IN HARDWARE"]);
  };
  // 1998 · b-money: five small servers of the year in a shallow arc on a step at the back, and in front of them, on
  // a board tilted to the path, the one thing they share: the ledger of how much money belongs to each pseudonym,
  // which every participant keeps; a line of light from each server to it.
  M.bmoney = (T0, fine) => {
    const T = plain(T0), stepY = 0.38, bz = -0.3, bh = 0.4, lean = 0.5, back = bz + bh * Math.sin(lean), top = 0.014 + bh * Math.cos(lean);
    T.B(1.1, stepY, 0.3, C.steelDark, 0, stepY / 2, 0.38);
    const Lb = easel(T, 0, bz, 0.66, bh, lean);
    card(Lb, [["THE SHARED LEDGER", 0.0046, C.glow, 0.5], ["", 0.0015], ["PSEUDONYM A1 · 50", 0.0042, C.white, 0.3], ["PSEUDONYM 7F · 120", 0.0042, C.white, 0.3], ["PSEUDONYM C3 · 35", 0.0042, C.white, 0.3], ["PSEUDONYM 9D · 80", 0.0042, C.white, 0.3], ["", 0.0015], ["EVERY SERVER KEEPS THIS SAME LIST", 0.003, C.amberText || C.amber, 0.4]], 0.64, bh - 0.02, { gap: 0.5, margin: 0.022 });
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.22, z = 0.38 - Math.abs(i - 2) * 0.025;
      tower(T, x, stepY, z, 0.14, 0.22, 0.2, fine);
      // The line of light: down the step's face, then along the plinth to the board's foot.
      T.B(0.008, stepY - 0.004, 0.006, C.glow, x, stepY / 2, 0.23 - 0.004, { emissive: 1, glow: true });
      beam(T, [x, 0.226], [x * 0.5, back + 0.11], 0.005, C.glow, 0.008);
    }
    T.B(0.62, 0.008, 0.008, C.glow, 0, top + 0.016, back + 0.022, { emissive: 1, glow: true });
    wire(T, [0.3, 0.05, 0.52], outlet(T, 6)[0], 0.004);
    label(T, ["B-MONEY", "EVERY PARTICIPANT KEEPS THE SAME ACCOUNTS"]);
  };

  // 7 September 1999 · the patent's front page on a board raised and tilted to the path, under eye height: the
  // Office's head, the number and date, the applicants, the title, the inventors, the assignee and the filing date,
  // each on a line of its own inside the page's margins.
  M.keiser = (T0, fine) => {
    const T = plain(T0), Lb = easel(T, 0, -0.12, 0.58, 0.66, 0.32), ink = [C.ink, 0.05], grey = ["#3a3832", 0.05];
    card(Lb, [["UNITED STATES PATENT", 0.0038, ...ink], ["5,950,176", 0.0054, ...ink], ["SEP. 7, 1999", 0.0034, ...ink], ["", 0.0015], ["KEISER ET AL.", 0.0032, ...ink], ["", 0.0015], ["COMPUTER-IMPLEMENTED", 0.003, ...ink], ["SECURITIES TRADING SYSTEM", 0.003, ...ink], ["WITH A VIRTUAL SPECIALIST", 0.003, ...ink], ["FUNCTION", 0.003, ...ink], ["", 0.0015], ["INVENTORS: TIMOTHY M. KEISER,", 0.0026, ...grey], ["MICHAEL R. BURNS", 0.0026, ...grey], ["ASSIGNEE: HSX INC.", 0.0026, ...grey], ["FILED: MAR. 25, 1996", 0.0026, ...grey]], 0.56, 0.64, { bg: C.cream, t: 0.003, gap: 0.5, margin: 0.024 });
    if (fine) for (let i = 0; i < 22; i++) Lb.B(i % 3 ? 0.002 : 0.004, 0.02, LIFT, C.ink, -0.14 - i * 0.0052, 0.296, -0.0026);
    label(T, ["US PATENT 5,950,176", "GRANTED 7 SEP 1999 · KEISER AND BURNS"]);
  };
  // 1998 to 2001 · two vignettes, each over its own plaque. Web points (left): a late-nineties monitor on a shop's
  // points page in a browser of the day (blue title bar, grey toolbar, address line), the keyboard and mouse before
  // it, a printed web gift certificate on a board beside it. Game gold (right): a chest open on its coins and, on a
  // board beside it, an auction listing for them. No brand of either kind of money is shown. The viewer shows each
  // alone (`part`: "main" or "web", "chest"). (+x is the viewer's left.)
  M.dotcom = (T0, fine, key, part) => {
    const T = plain(T0);
    const chest = (F0) => {
      const T = tools(F0.k, 0, 1.5, F0.moving, F0.quiet);
      T.B(0.22, 0.14, 0.15, C.wood, 0, 0.07, 0);
      T.B(0.2, 0.13, 0.13, C.woodDark, 0, 0.075, 0);
      for (const sx of [-1, 1]) T.B(0.016, 0.142, 0.154, C.brass, sx * 0.07, 0.07, 0);
      const Ld = T.at(0, 0.14, 0.075, 0, 1.9);
      Ld.B(0.22, 0.03, 0.15, C.wood, 0, 0.015, -0.075);
      Ld.B(0.22, 0.03, 0.09, C.wood, 0, 0.045, -0.075);
      for (const sx of [-1, 1]) { Ld.B(0.016, 0.032, 0.154, C.brass, sx * 0.07, 0.015, -0.075); Ld.B(0.016, 0.032, 0.094, C.brass, sx * 0.07, 0.045, -0.075); }
      if (fine) T.B(0.03, 0.03, 0.006, C.brassDark, 0, 0.1, -0.078);
      for (let i = 0; i < 18; i++) { const r = (i * 7) % 5, c = (i * 3) % 4; T.Y(0.014, 0.014, 0.004, C.gold, -0.06 + c * 0.04 + (r % 2) * 0.01, 0.105 + r * 0.012 + (i > 12 ? 0.03 : 0), -0.04 + r * 0.02, { seg: 12 }); }
      for (const [x, z, ry] of [[-0.16, -0.13, 0.3], [-0.19, -0.07, 1.1], [0.15, -0.14, 0.6], [0.0, -0.18, 0.2]]) { const Co = T.at(x, 0.002, z, ry); Co.Y(0.014, 0.014, 0.004, C.gold, 0, 0, 0, { seg: 12 }); }
      if (fine) for (let i = 0; i < 6; i++) T.Y(0.014, 0.014, 0.004, C.goldDark, -0.05 + i * 0.02, 0.1, 0.03 - (i % 2) * 0.02, { seg: 12 });
    };
    const listing = (F) => {
      const Lb = easel(F, 0, -0.1, 0.34, 0.36, 0.4);
      card(Lb, [["ONLINE AUCTION", 0.0036, C.ink, 0.05], ["", 0.0015], ["1,000 PLATINUM COINS", 0.0025, C.ink, 0.05], ["HIGH BID  $12.50", 0.003, C.inkBlue, 0.1], ["DELIVERED IN GAME", 0.0022, "#5a5750", 0.05], ["", 0.0015], ["[ BID NOW ]", 0.0028, C.ink, 0.05]], 0.32, 0.34, { bg: C.paper, t: 0.003, gap: 0.55, margin: 0.016 });
    };
    const gold = (F) => { chest(F.at(0.22, 0, 0.12)); listing(F.at(-0.26, 0, 0)); label(F, ["GAME GOLD", "A WORLD'S COIN SOLD FOR DOLLARS · 2001"]); };
    const web = (F) => {
      const w = 0.4, h = 0.3, mx = 0.1;
      F.B(0.34, 0.03, 0.3, C.beigeDark, mx, 0.015, 0.26);
      F.Y(0.12, 0.14, 0.03, C.beige, mx, 0.045, 0.26, { seg: 24 });
      crt(F, mx, 0.06, 0.02, w, h, C.beige, (S, sw, sh) => {
        S.B(sw - 0.004, sh * 0.1, LIFT, "#1f3f8f", 0, sh / 2 - sh * 0.05, S.layer(0), { emissive: 0.5, glow: true });
        S.B(sw - 0.004, sh * 0.2, LIFT, "#c0c0c0", 0, sh / 2 - sh * 0.2, S.layer(0), { emissive: 0.35, glow: true });
        S.B(sw - 0.004, sh * 0.7, LIFT, "#e8e8e8", 0, -sh * 0.15, S.layer(0), { emissive: 0.45, glow: true });
        S.B(sw - 0.05, sh * 0.075, LIFT, "#ffffff", 0, sh / 2 - sh * 0.255, S.layer(1), { emissive: 0.5, glow: true });
        // Every line from the left margin (the viewer's left is +x).
        const left = (t, px, col, y, lift) => S.say(t, px, col, sw / 2 - 0.035 - (t.length * 6 - 1) * px / 2, y, S.ink(lift), 0.25);
        left("POINTS SHOP - WEB BROWSER", 0.0019, "#ffffff", sh / 2 - sh * 0.05, 1);
        left("FILE  EDIT  VIEW  GO  HELP", 0.0017, "#202020", sh / 2 - sh * 0.135, 1);
        left("HTTP://WWW.SHOP.EXAMPLE/POINTS", 0.0016, "#202020", sh / 2 - sh * 0.255, 2);
        [["YOUR POINTS", 0.0034, "#1f3f8f"], ["BALANCE  1,250 POINTS", 0.0025, "#202020"], ["EARN 50: VISIT A PARTNER SITE", 0.0019, "#202020"], ["SPEND POINTS AT 300 SHOPS", 0.0019, "#202020"], ["[ EARN ]   [ SPEND ]", 0.0025, "#1f3f8f"]].forEach(([t, px, col], i) => left(t, px, col, sh * 0.12 - i * sh * 0.13, 1));
      }, fine);
      keyboard(F, mx, 0, -0.26, 0.4, 0.13, C.beige, fine);
      F.B(0.16, 0.004, 0.15, "#2a4a8a", -0.31, 0.002, -0.32);
      F.B(0.05, 0.022, 0.085, C.cream, -0.31, 0.013, -0.32);
      // The gift certificate on a board of its own, raised on a block beside the monitor.
      F.B(0.3, 0.06, 0.24, C.steelDark, -0.33, 0.03, 0.0);
      const Cb = easel(F.at(-0.33, 0.06, 0), 0, -0.08, 0.26, 0.2, 0.42);
      card(Cb, [["WEB GIFT CERTIFICATE", 0.002, C.inkBlue, 0.1], ["$25.00", 0.0048, C.ink, 0.05], ["CODE 7F3K-22Q9", 0.0022, "#5a5750", 0.05], ["SPEND AT ANY PARTNER STORE", 0.0016, "#5a5750", 0.05]], 0.24, 0.18, { bg: "#fbf4df", t: 0.003, gap: 0.55, margin: 0.012 });
      label(F, ["WEB POINTS", "EARNED ON SITES, SPENT IN SHOPS · 1998 - 2001"]);
    };
    if (part === "chest") { gold(T); return; }
    if (part === "web" || part === "main") { web(T); return; }
    web(T.at(spot(0, 2), 0, 0)); gold(T.at(spot(1, 2), 0, 0));
    wire(T, [spot(0, 2) + 0.1, 0.2, 0.44], outlet(T, 2)[0]);
  };
  // 2004 · a 1U server open on a rack shelf, its lid leaning behind it: the board with its processor, memory and
  // supply inside, and the secure coprocessor, a full-length card almost all of which is the sealed tamper-responding
  // enclosure (a metal brick over the circuitry, its battery tray at the bracket end keeping the keys alive, a
  // status lamp), drawn half out of its riser; a token slip lies on the shelf.
  M.rpow = (T, fine) => {
    // The 1U server open on an angled riser so the board reads from the path: the board populated as 2004 hardware
    // was (processor under its heatsink, four memory sticks, chipset, capacitors, regulators, two PCI slots, the drive
    // cables and the supply), two fans turning at the back, the status lamps blinking; the secure coprocessor seated
    // upright in a slot, its tamper-responding enclosure over most of its length, named on a riser card of its own;
    // beside it a small display cycling a token in, verified, a token out; power and network leads to the plinth's
    // back. Nothing stands behind it but the rack posts.
    const w = mm(430), h = mm(44), d = mm(500);
    // The server on a steel riser tilted 30 degrees to the path, so the whole board is looked into from eye level.
    const Rz = lectern(T, -0.08, 0.1, mm(500) + 0.06, d + 0.1, 1.05, 0.06, C.steelDark);
    const Sv = tools(Rz.k, 0, Rz.s, Rz.moving, Rz.quiet).at(0, 0.004, 0);
    Sv.B(w, 0.003, d, C.black, 0, 0.0015, 0);
    for (const sx of [-1, 1]) Sv.B(0.003, h, d, C.black, sx * (w / 2 - 0.0015), h / 2, 0);
    Sv.B(w, h, 0.003, C.black, 0, h / 2, d / 2 - 0.0015);
    Sv.B(w, h, 0.01, "#1a1b1f", 0, h / 2, -d / 2 + 0.005);
    const F = Sv.face("front", 0, h / 2, -d / 2);
    for (const sx of [-1, 1]) { F.B(0.1, h - 0.02, 0.004, "#2a2c31", sx * 0.11, 0, -0.002); F.B(0.09, 0.004, 0.004, C.black, sx * 0.11, 0.012, -0.004); }
    lamp2(F, false, -0.3, 0.008, -0.004, 0, 0);
    lamp2(F, true, -0.3, -0.008, -0.004, 0.45, 0.1);
    lamp2(F, false, -0.28, -0.008, -0.004, 0.3, 0.2);
    if (fine) { for (let i = 0; i < 10; i++) F.B(0.003, h - 0.03, 0.004, C.black, 0.26 + i * 0.008, 0, -0.004); F.B(0.016, 0.016, 0.006, "#2a2c31", -0.325, 0, -0.005); }
    // The board.
    Sv.B(w - 0.06, 0.003, d - 0.14, C.pcb, -0.02, 0.0045, 0.02);
    if (fine) for (let i = 0; i < 18; i++) Sv.B(0.002, 0.0006, 0.06 + (i % 4) * 0.03, "#2c8a4a", -0.19 + i * 0.02, 0.0062, -0.06 + (i % 3) * 0.04);
    Sv.B(0.05, 0.004, 0.05, "#2a2c31", -0.08, 0.008, 0.06);
    Sv.B(0.09, 0.034, 0.09, C.steelLight, -0.08, 0.027, 0.06);
    for (let i = 0; i < 9; i++) Sv.B(0.09, 0.03, 0.0025, C.steel, -0.08, 0.03, 0.02 + i * 0.01);
    for (let i = 0; i < 4; i++) { Sv.B(0.003, 0.03, 0.13, "#0f3f22", 0.03 + i * 0.012, 0.021, 0.06); if (fine) for (let k = 0; k < 8; k++) Sv.B(0.0024, 0.01, 0.012, C.black, 0.03 + i * 0.012, 0.02, 0.0 + k * 0.016); }
    Sv.B(0.03, 0.004, 0.03, C.black, 0.0, 0.008, -0.06);
    Sv.B(0.024, 0.014, 0.024, "#3a3e45", 0.0, 0.016, -0.06);
    for (let i = 0; i < 10; i++) Sv.Y(0.004, 0.004, 0.012, i % 3 ? "#1a1a40" : "#5a3a1a", -0.17 + (i % 5) * 0.012, 0.012, -0.09 + Math.floor(i / 5) * 0.014, { seg: 8 });
    for (let i = 0; i < 4; i++) Sv.B(0.012, 0.012, 0.012, C.black, -0.17 + i * 0.016, 0.012, -0.14);
    for (let i = 0; i < 2; i++) Sv.B(0.1, 0.012, 0.006, "#d8d8d0", 0.12, 0.012, -0.11 + i * 0.03);
    Sv.B(0.12, 0.04, 0.2, "#3a3e45", w / 2 - 0.08, 0.026, 0.16);
    if (fine) { Sv.B(0.02, 0.012, 0.012, C.black, w / 2 - 0.15, 0.012, 0.1); cable(Sv, [[w / 2 - 0.15, 0.014, 0.1], [0.02, 0.03, 0.06], [-0.12, 0.012, -0.05]], 0.0025, "#c9c9c9", 0.1, false); cable(Sv, [[0.12, 0.016, -0.12], [0.18, 0.03, -0.02], [0.2, 0.012, 0.12]], 0.003, "#8a8577", 0.15, false); }
    for (const x of [-0.2, -0.12]) { Sv.B(0.04, 0.04, 0.012, C.steelDark, x, 0.022, -0.2); if (Sv.moving) Sv.node(`spin:${uid++}:${x < -0.15 ? 28 : 31}`, FAN(), x, 0.022, -0.209, { rx: HALF }); else if (fine) Sv.Y(0.016, 0.016, 0.014, C.black, x, 0.022, -0.2, { rx: HALF, seg: 12 }); }
    // The coprocessor, upright in its slot: the board, bracket, enclosure, battery tray, lamp.
    const Cp = Sv.at(0.1, 0.0045, -0.12, 0);
    Cp.B(0.32, 0.105, 0.0016, C.pcb, 0.0, 0.0525, 0);
    Cp.B(0.09, 0.01, 0.004, C.goldDark, -0.04, 0.004, 0);
    Cp.B(0.004, 0.12, 0.02, C.steelLight, -0.158, 0.06, -0.01);
    Cp.B(0.22, 0.08, 0.03, "#8d939b", 0.03, 0.055, -0.0165);
    Cp.B(0.21, 0.07, 0.004, "#a7adb5", 0.03, 0.055, -0.0335);
    if (fine) for (let i = 0; i < 4; i++) Cp.B(0.004, 0.004, 0.003, C.steelDark, -0.06 + i * 0.06, 0.088, -0.035);
    Cp.B(0.05, 0.05, 0.02, C.black, -0.115, 0.06, -0.011);
    for (const y of [0.048, 0.072]) Cp.Y(0.006, 0.006, 0.03, "#c9ccd2", -0.115, y, -0.012, { rx: 0, rz: HALF, seg: 8 });
    lamp2(Cp, false, 0.14, 0.095, -0.004, 1.2, 0.3);
    if (fine) Cp.B(0.2, 0.06, LIFT, "#9ba1a9", 0.03, 0.055, -0.036, { emissive: 0.08 });
    // The riser card naming it, standing in the slot beside, and the token display on the shelf before the server.
    const Nm = Sv.at(0, 0.0045, d / 2 - 0.04, 0);
    Nm.B(0.02, 0.05, 0.01, C.steelDark, 0, 0.025, 0.006);
    card(Nm.at(0, 0.11, 0), [["SECURE COPROCESSOR", 0.0034, C.amber, 0.4], ["TAMPER-RESPONDING:", 0.0024, "#d4c8b6", 0.2], ["THE KEYS DIE IF IT IS OPENED", 0.0024, "#d4c8b6", 0.2]], 0.46, 0.12, { t: 0.006, gap: 0.6, margin: 0.012 });
    // The token display on a stand of its own beside the riser, whole from the path.
    T.B(0.2, 0.24, 0.2, C.steelDark, 0.47, 0.12, 0.0);
    card(T.face("front", 0.47, 0.12, -0.103), [["RPOW", 0.0044, C.white, 0.3]], 0.18, 0.07, { bg: C.ink, t: 0.004, margin: 0.01 });
    const Dp = easel(T.at(0.47, 0.24, 0), 0, -0.07, 0.18, 0.15, 0.35, C.black);
    Dp.B(0.17, 0.14, 0.004, "#0b1a10", 0, 0, -0.002, { emissive: 0.4, glow: true });
    [["TOKEN IN", 0.042], ["VERIFIED", 0], ["TOKEN OUT", -0.042]].forEach(([t, y], i) => { card(Dp.at(-0.014, y, -0.004), [[t, 0.0026, C.phosphor, 0.7]], 0.136, 0.036, { bg: null, margin: 0.004 }); lamp2(Dp, false, 0.07, y, -0.006, 3, i); });
    label(T, ["REUSABLE PROOFS OF WORK", "A HASHCASH TOKEN IN, A FRESH ONE OUT, ON A SEALED CHIP"]);
  };
  // 2006 · an office PC of the year: a black-and-silver small tower at the left, a flat panel on its stand with the
  // notice the exchange's visitors found in May 2013 (the domain seized), a plain keyboard and mouse; and to the
  // right, on a board of its own, a printed statement of an account as they were kept, in LR dollars and LR euros.
  // No agency seal or company mark is drawn: the words alone. (+x is the viewer's left.)
  M.lr = (T0, fine) => {
    const T = plain(T0), tw = 0.18, th = 0.4, td = 0.42, TX = 0.49, TZ = 0.2;
    T.B(tw, th, td, C.black, TX, th / 2, TZ);
    const Tf = T.face("front", TX, th / 2, TZ - td / 2);
    Tf.B(tw - 0.02, th - 0.02, 0.006, C.steelLight, 0, 0, -0.003);
    Tf.B(tw - 0.06, 0.03, 0.008, C.black, 0, th * 0.35, -0.007);
    Tf.B(0.016, 0.016, 0.006, C.steelLight, 0, -th * 0.3, -0.009);
    if (fine) { lamp2(Tf, false, 0.03, -th * 0.3, -0.009, 0.5, 0.1); Tf.B(tw - 0.06, 0.012, 0.008, C.black, 0, th * 0.27, -0.007); }
    // The panel on a short stand, the whole notice inside its margins.
    const pw = 0.52, ph = 0.4, PX = 0.09, PZ = 0.14, gw = pw - 0.03, gh = ph - 0.03;
    T.B(0.26, 0.012, 0.18, C.black, PX, 0.006, PZ + 0.02);
    T.B(0.05, 0.12, 0.03, C.black, PX, 0.07, PZ + 0.03);
    T.B(pw, ph, 0.025, C.black, PX, 0.12 + ph / 2, PZ);
    const S = T.face("front", PX, 0.12 + ph / 2, PZ - 0.0125), dark = ["#202020", 0.1];
    S.B(gw, gh, 0.003, "#f2f2f2", 0, 0, S.layer(0), { emissive: 0.6, glow: true });
    S.B(gw, 0.07, LIFT, "#a8201a", 0, gh / 2 - 0.045, S.layer(1), { emissive: 0.45, glow: true });
    S.say("THIS DOMAIN NAME HAS BEEN SEIZED", 0.0023, C.white, 0, gh / 2 - 0.045, S.ink(2), 0.5);
    card(S.at(0, -0.04, S.layer(1)), [["BY THE UNITED STATES ATTORNEY", 0.003, ...dark], ["FOR THE SOUTHERN DISTRICT", 0.003, ...dark], ["OF NEW YORK", 0.003, ...dark], ["", 0.003], ["PURSUANT TO A SEIZURE WARRANT", 0.003, ...dark], ["ISSUED IN MAY 2013", 0.003, ...dark]], gw - 0.02, gh - 0.11, { bg: null, left: true, margin: 0.024, gap: 0.8 });
    keyboard(T, PX, 0, -0.16, 0.4, 0.14, "#2a2c31", fine, "#3b3b3f");
    T.B(0.05, 0.022, 0.085, "#2a2c31", PX + 0.29, 0.011, -0.16);
    // The statement on its board.
    const Lb = easel(T, -0.4, -0.08, 0.3, 0.36, 0.4);
    card(Lb, [["ACCOUNT STATEMENT", 0.003, C.ink, 0.05], ["ACCOUNT U1234567", 0.0026, C.ink, 0.05], ["", 0.0015], ["LRD  2,450.00", 0.003, C.inkBlue, 0.1], ["LRE      0.00", 0.003, C.inkBlue, 0.1], ["", 0.0015], ["COSTA RICA", 0.0022, "#5a5750", 0.05], ["NO IDENTITY", 0.0022, "#5a5750", 0.05], ["CHECK ON FILE", 0.0022, "#5a5750", 0.05]], 0.28, 0.34, { bg: C.paper, t: 0.003, gap: 0.55, margin: 0.016 });
    const sockets = outlet(T, 2);
    wire(T, [PX, 0.2, PZ + 0.02], sockets[0]);
    wire(T, [TX, 0.08, TZ + td / 2], sockets[1]);
    cord(T, [[PX + 0.1, 0.012, 0.3], [TX - tw / 2, 0.012, 0.3]], 0.006, "#8a8577");
    label(T, ["LIBERTY RESERVE", "SEIZED MAY 2013 · NO IDENTITY CHECKS"]);
  };

  // A standing ring (a hook or a handle): a torus turned up on its edge, its lower half buried in what it hangs from.
  const standingRing = (T, x, y, z, R, r, color, ry = 0) => T.R(R, r, color, x, y, z, { rx: HALF, ry, seg: 16, sides: 8 });
  // 1974 · a packet switch after the ARPANET's Interface Message Processors, built at about half their size to stand
  // on a plinth: a ruggedised minicomputer cabinet in grey with the lifting hooks on its roof, a front panel in the
  // upper third of two sixteen-bit lamp registers and a row of toggles, a louvred door below, a paper-tape reader on
  // a shelf at its side (the IMPs loaded their program from tape) and the thick line to the host.
  M.tcpip = (T0, fine) => {
    // The cabinet in the plinth's own metres, its roof under eye height; `H` the height the panel's rows were laid out to.
    const R0 = plain(T0), T = R0.at(-0.1, 0, 0.06), w = 0.5, h = 0.68, d = 0.42, H = 1.06, body = "#6b7076", trim = "#4a4f55";
    T.B(w, h, d, body, 0, h / 2, 0);
    T.B(w + 0.02, 0.05, d + 0.02, trim, 0, 0.025, 0);
    T.B(w + 0.02, 0.03, d + 0.02, trim, 0, h - 0.015, 0);
    for (const sx of [-1, 1]) standingRing(T, sx * 0.12, h + 0.01, 0, 0.03, 0.006, C.steelLight, HALF);
    for (const sx of [-1, 1]) T.B(0.012, 0.24, 0.03, C.steelLight, sx * (w / 2 + 0.006), h * 0.5, 0);
    // The panel: a dark plate, the two registers of lamps (a lit address and a data word), the toggles under them,
    // a column of status lamps, the power key and the maker-free name plate.
    const F = T.face("front", 0, h - 0.2, -d / 2);
    F.B(w - 0.05, H * 0.34, 0.01, "#25282c", 0, 0, -0.005);
    F.B(w - 0.07, 0.034, 0.004, "#8f949a", 0, H * 0.14, -0.012);
    F.say("INTERFACE MESSAGE PROCESSOR", 0.0025, C.ink, 0, H * 0.14, F.ink(3), 0.05);
    const words = [0xa5c3, 0x3e91];
    words.forEach((word, r) => {
      for (let c = 0; c < 16; c++) {
        const on = (word >> (15 - c)) & 1;
        if (fine || on) F.Y(0.007, 0.007, 0.006, on ? C.glow : "#5a3a12", -0.165 + c * 0.022, H * 0.085 - r * 0.045, -0.013, { rx: HALF, seg: 8, emissive: on ? 1 : 0, glow: !!on });
      }
      if (fine) F.say(r ? "DATA" : "ADDRESS", 0.0016, "#c8ccd0", -0.165 + 7.5 * 0.022, H * 0.085 - r * 0.045 + 0.016, F.ink(2), 0.1);
    });
    for (let c = 0; c < 16; c++) {
      F.B(0.008, 0.008, 0.004, "#8f949a", -0.165 + c * 0.022, -H * 0.01, -0.012);
      if (fine) F.Y(0.004, 0.004, 0.022, C.steelLight, -0.165 + c * 0.022, -H * 0.01 + (c % 3 ? 0.008 : -0.008), -0.02, { rx: HALF + (c % 3 ? 0.55 : -0.55), seg: 6 });
    }
    if (fine) ["RUN", "HALT", "LINE", "HOST"].forEach((name, i) => { if (i === 2 && F.moving) F.node(`blink:${uid++}:0.6:0`, LED_G(), 0.215, H * 0.09 - i * 0.03, -0.013); else F.Y(0.006, 0.006, 0.005, i === 0 || i === 2 ? C.led : "#3a2a10", 0.215, H * 0.09 - i * 0.03, -0.013, { rx: HALF, seg: 8, emissive: i === 0 || i === 2 ? 0.9 : 0, glow: i === 0 || i === 2 }); F.say(name, 0.0014, "#c8ccd0", 0.192, H * 0.09 - i * 0.03, F.ink(2), 0.1); });
    F.Y(0.012, 0.012, 0.012, C.black, -0.17, -H * 0.1, -0.016, { rx: HALF, seg: 10 });
    F.say("PACKET SWITCH", 0.0032, C.white, 0.02, -H * 0.1, F.ink(2), 0.25);
    // The door under the panel: louvres and a recessed pull.
    const D = T.face("front", 0, 0.155, -d / 2);
    D.B(w - 0.05, 0.25, 0.006, "#5f656b", 0, 0, -0.003);
    if (fine) for (let i = 0; i < 7; i++) D.B(w - 0.12, 0.004, 0.006, "#3a3f45", 0, -0.1 + i * 0.03, -0.007);
    D.B(0.06, 0.016, 0.01, "#2b2f33", 0.13, 0.105, -0.008);
    // The tape reader on its shelf, its reels and the tape between them, and the line to the host out the back.
    T.B(0.24, 0.02, 0.26, trim, w / 2 + 0.16, 0.19, 0.04);
    T.B(0.02, 0.19, 0.02, trim, w / 2 + 0.05, 0.095, -0.06);
    T.B(0.02, 0.19, 0.02, trim, w / 2 + 0.05, 0.095, 0.14);
    T.B(0.22, 0.09, 0.22, "#8f949a", w / 2 + 0.16, 0.245, 0.04);
    for (const dx of [0.1, 0.22]) { if (T.moving) T.node(`spin:${uid++}:${dx < 0.2 ? 2.4 : -1.9}`, REEL(), w / 2 + dx, 0.296, 0.04); else T.Y(0.05, 0.05, 0.012, "#3a3e45", w / 2 + dx, 0.296, 0.04, { seg: 20 }); }
    T.B(0.2, 0.0016, mm(25), C.paperOld, w / 2 + 0.16, 0.291, -0.04);
    if (fine) for (let i = 0; i < 12; i++) T.B(0.003, 0.002, 0.003, C.black, w / 2 + 0.07 + i * 0.016, 0.292, -0.04 + ((i * 5) % 3 - 1) * 0.006);
    cable(T, [[0, 0.3, d / 2 + 0.01], [0, 0.3, d / 2 + 0.1], [0, 0.03, d / 2 + 0.12], [-0.42, 0.03, d / 2 + 0.14]], 0.012, C.cable, 0.02, false);
    // Packets on the line to the host: three lit beads sliding along it, a hop apart.
    for (let i = 0; i < 3; i++) T.shuttle(LED_G(), -0.02 - i * 0.12, 0.05, d / 2 + 0.13, [-0.12, 0, 0.005], 1.2, i * 0.4);
    wire(R0, [0, 0.08, 0.06 + d / 2], outlet(R0, 2)[0], 0.007);
    label(R0, ["INTERFACE MESSAGE PROCESSOR", "THE PACKET SWITCH AT EVERY ARPANET SITE"]);
  };
  // 1976 · a video terminal of the year: the one-piece cream case of the kind that put a twelve-inch tube over an
  // attached keyboard, its screen set into the slope, working the exchange out in green on black with the textbook's
  // small numbers; two beakers of paint beside it, the analogy's yellow and blue each mixed with the shared colour to
  // the one green.
  M.dh = (T0, fine) => {
    const R0 = plain(T0), T = R0.at(0.1, 0, 0), w = 0.62, d = 0.66, h = 0.5, shelf = 0.26 * h;
    // Front low, a shelf for the keys, then the slope up to the flat top: the profile along z, extruded across x.
    T.prism([[-d / 2, 0], [d / 2, 0], [d / 2, shelf], [0.18 * d, shelf], [0.18 * d, 0.42 * h], [-0.18 * d, h], [-d / 2, h]], w, C.cream, 0, 0, 0, { ry: HALF });
    T.B(w + 0.004, 0.02, d - 0.02, C.beigeDark, 0, 0.01, 0);
    keyboard(T, 0, shelf, -d * 0.34, w * 0.86, d * 0.26, "#d8d1be", fine, C.keyDark);
    // The screen in the slope: a frame whose -z looks out square to it.
    const zA = -0.18 * d, yA = 0.42 * h, zB = 0.18 * d, yB = h, tilt = Math.atan2(zB - zA, yB - yA);
    const S = T.at(0, (yA + yB) / 2, (zA + zB) / 2, 0, tilt);
    const sw = 0.42, sh = 0.26;
    S.B(sw + 0.06, sh + 0.06, 0.016, "#2a2a2e", 0, 0, -0.008);
    S.B(sw, sh, 0.006, C.screen, 0, 0, -0.018, { emissive: 0.35, glow: true });
    lines(S.at(0, 0, -0.022), ["DIFFIE-HELLMAN 1976", "PUBLIC  P=23  G=5", "A: a=6  G^a MOD P = 8", "B: b=15 G^b MOD P = 19", "", "A: 19^6  MOD 23 = 2", "B: 8^15  MOD 23 = 2", "", "SHARED SECRET = 2 _"], 0.0032, sw, sh);
    if (fine) { S.B(0.012, 0.012, 0.004, C.led, sw / 2 + 0.02, -sh / 2 - 0.02, -0.018, { emissive: 1, glow: true }); S.Y(0.01, 0.01, 0.01, C.keyDark, -sw / 2 - 0.02, -sh / 2 - 0.02, -0.02, { rx: HALF, seg: 8 }); }
    // The beakers.
    [["#e8c23a", -0.33, -0.28], ["#2f63c9", -0.47, -0.2], ["#3f9a3f", -0.4, -0.02]].forEach(([color, x, z]) => {
      R0.lathe([[0.048, 0], [0.054, 0.136], [0.059, 0.144]], "#cfe6ea", x, 0, z, { seg: 14 });
      R0.Y(0.045, 0.045, 0.088, color, x, 0.046, z, { seg: 14 });
    });
    wire(R0, [0.1, 0.1, d / 2], outlet(R0, 2)[0]);
    label(R0, ["DIFFIE-HELLMAN", "TWO STRANGERS AGREE A SECRET IN THE OPEN"]);
  };
  // 1977 · RSA: in the middle the padlock open on its foot and the one key before it; on a board to the left the
  // memo's cover (MIT/LCS/TM-82, April 1977), on a board to the right the arithmetic, both raised and tilted to the
  // path. (+x is the viewer's left.)
  M.rsa = (T0, fine) => {
    const T = plain(T0), ink = [C.ink, 0.05], grey = ["#3a3832", 0.05], blue = [C.inkBlue, 0.1];
    const Lm = easel(T, 0.36, -0.1, 0.42, 0.5, 0.42);
    card(Lm, [["A METHOD FOR OBTAINING", 0.0028, ...ink], ["DIGITAL SIGNATURES AND", 0.0028, ...ink], ["PUBLIC-KEY CRYPTOSYSTEMS", 0.0028, ...ink], ["", 0.002], ["R.L. RIVEST", 0.0032, ...ink], ["A. SHAMIR", 0.0032, ...ink], ["L. ADLEMAN", 0.0032, ...ink], ["", 0.002], ["MIT/LCS/TM-82", 0.0027, ...grey], ["APRIL 1977", 0.0027, ...grey]], 0.4, 0.48, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.022 });
    const La = easel(T, -0.36, -0.1, 0.42, 0.5, 0.42);
    card(La, [["RSA, THE ARITHMETIC", 0.0032, ...ink], ["", 0.002], ["N = P * Q", 0.0028, ...ink], ["E * D = 1 MOD (P-1)(Q-1)", 0.0028, ...ink], ["PUBLIC (N, E)", 0.0028, ...ink], ["PRIVATE D", 0.0028, ...ink], ["ENCRYPT C = M^E MOD N", 0.0028, ...ink], ["DECRYPT M = C^D MOD N", 0.0028, ...ink], ["SIGN S = M^D MOD N", 0.0028, ...blue], ["CHECK S^E MOD N = M", 0.0028, ...blue]], 0.4, 0.48, { bg: C.paperOld, t: 0.003, gap: 0.5, margin: 0.022 });
    padlock(T, 0, 0, 0.16, 0.2, true, fine);
    key(T, 0, 0.006, -0.2, 0.2, 0.4, fine);
    label(T, ["RSA", "A LOCK ANYONE CAN SHUT, ONE KEY OPENS, AND A SIGNATURE"]);
  };
  // 1980 · a hash tree in brass and light: eight leaf tiles, four, two and the one root, each parent hung over its two
  // children and joined to them by lit rods, labelled as the whitepaper's figure labels its own (Tx, Hash01, Root
  // Hash), the first leaf at the viewer's left (+x), every label inside its tile, the root under eye height.
  M.merkle = (T0, fine) => {
    const T = plain(T0), levels = [8, 4, 2, 1], gap = [0.125, 0.25, 0.5, 1], rise = 0.17, z = 0.1, th = 0.07;
    T.B(1.06, 0.03, 0.3, C.steel, 0, 0.015, z);
    T.B(1.02, 0.004, 0.26, C.black, 0, 0.032, z);
    const pos = levels.map((n, l) => Array.from({ length: n }, (_, i) => [((n - 1) / 2 - i) * gap[l], 0.1 + l * rise]));
    pos.forEach((row, l) => row.forEach(([x, y], i) => {
      const root = l === 3, tw = [0.105, 0.17, 0.22, 0.3][l];
      T.B(tw, th, 0.03, root ? C.gold : C.brass, x, y, z);
      const words = l === 0 ? `TX${i}` : l === 1 ? `HASH${i * 2}${i * 2 + 1}` : l === 2 ? (i ? "HASH4567" : "HASH0123") : "ROOT HASH";
      card(T.face("front", x, y, z - 0.017), [[words, [0.0042, 0.0036, 0.0036, 0.0042][l], root ? C.glow : C.amber, root ? 0.9 : 0.5]], tw - 0.012, th - 0.012, { bg: root ? "#5a3f10" : C.ink, t: 0.004, margin: 0.006 });
      if (l > 0) for (const c of [0, 1]) {
        const child = pos[l - 1][i * 2 + c], dx = child[0] - x, dy = child[1] - y, len = Math.hypot(dx, dy);
        T.B(0.008, len - th, 0.008, C.amber, x + dx / 2, y + dy / 2, z, { rz: Math.atan2(dx, -dy), emissive: 0.6, glow: true });
      }
    }));
    T.B(0.012, 0.04, 0.012, C.glow, 0, 0.1 + 3 * rise + th / 2 + 0.02, z, { emissive: 1, glow: true });
    // The hashing, as a wave of light up the tree: a lamp at each tile, the leaves first, the root last, over four
    // seconds, then again.
    pos.forEach((row, l) => row.forEach(([x, y]) => lamp2(T, false, x, y + th / 2 + 0.008, z - 0.004, 4, l * 0.7)));
    label(T, ["A MERKLE TREE", "ONE ROOT VOUCHES FOR EVERY LEAF"]);
  };
  // 1982 · blind signatures as Chaum told them, in four steps from the viewer's left along a riser tilted to the
  // path: your coin with its number; the coin slid into an envelope lined with carbon paper; the bank's stamp
  // pressed on the outside of the sealed envelope, which is all the bank ever sees; the coin out again, carrying the
  // bank's signature through the carbon, its number never seen. A numbered caption under each step on the riser's
  // front; in the near build a light runs along them in turn (12 s). (+x is the viewer's left.)
  M.chaum = (T0, fine) => {
    const T = plain(T0), lip = 0.2, d = 0.3, z0 = 0.12, S = lectern(T, 0, z0, 1.12, d, 0.69, lip, C.steelDark), xs = [0.405, 0.135, -0.135, -0.405];
    const U = (x, y, lift = 0.004) => S.face("top", x, lift, y);
    const note = (x, y, rows) => card(U(x, y), rows, 0.23, 0.15, { bg: C.paper, t: 0.003, gap: 0.5, margin: 0.012 });
    const COIN = [["ONE COIN", 0.0042, C.ink, 0.05], ["NO 7A3F", 0.0042, C.ink, 0.05]];
    const envelope = (x, y, open) => {
      const E = U(x, y);
      E.B(0.24, 0.16, 0.006, C.envelope, 0, 0, 0);
      if (open) E.B(0.22, 0.03, 0.003, C.carbon, 0, 0.062, -0.004);
      else { for (const sx of [-1, 1]) E.B(0.13, 0.004, 0.002, "#b8a987", sx * 0.058, 0.035, -0.004, { rz: sx * 0.5 }); }
      return E;
    };
    // 1 · the coin.
    note(xs[0], 0.06, COIN);
    // 2 · the coin going into the envelope, its top half still showing above the carbon-lined mouth.
    note(xs[1], 0.13, [["ONE COIN", 0.0042, C.ink, 0.05], ["", 0.0042], ["", 0.0042]]);
    envelope(xs[1], 0.02, true);
    // 3 · the bank's stamp pressed on the sealed envelope; what the bank sees of the coin.
    const E3 = envelope(xs[2], 0.09, false);
    E3.B(0.1, 0.07, 0.03, C.woodDark, 0, -0.02, -0.018);
    E3.Y(0.016, 0.02, 0.07, C.wood, 0, -0.02, -0.066, { rx: HALF, seg: 12 });
    E3.ball(0.024, C.wood, 0, -0.02, -0.11, { seg: 12 });
    card(U(xs[2], -0.06), [["BANK SEES: ?", 0.0031, C.white, 0.3]], 0.24, 0.05, { margin: 0.008 });
    // 4 · the coin out again, signed through the carbon, and a tick.
    note(xs[3], 0.06, [...COIN, ["SIGNED: BANK", 0.003, C.inkBlue, 0.1]]);
    const Tk = U(xs[3], -0.075, 0.006);
    Tk.B(0.014, 0.04, 0.004, C.led, 0.02, -0.008, 0, { rz: -0.7, emissive: 1, glow: true });
    Tk.B(0.014, 0.076, 0.004, C.led, -0.016, 0.006, 0, { rz: 0.5, emissive: 1, glow: true });
    // The captions on the riser's front, one under each step, and the light that runs along them.
    [["1", "YOUR COIN"], ["2", "HIDE IT"], ["3", "BANK SIGNS", "BLIND"], ["4", "SIGNED,", "UNTRACEABLE"]].forEach(([n, a, b], i) => {
      const F = T.face("front", xs[i], lip / 2 + 0.012, z0 - d / 2);
      card(F.at(0.1, 0, 0), [[n, 0.008, C.amberText || C.amber, 0.5]], 0.05, 0.12, { bg: null, margin: 0.004 });
      card(F.at(-0.025, 0, 0), b ? [[a, 0.0034, C.white, 0.3], [b, 0.0034, C.white, 0.3]] : [[a, 0.0034, C.white, 0.3]], 0.2, 0.12, { bg: null, margin: 0.006, gap: 0.6 });
      T.pulse(BL.models.noShadow(BL.models.box({ w: 0.25, h: 0.01, d: 0.006, color: C.led, emissive: 1 })), xs[i], 0.03, z0 - d / 2 - 0.004, 12, i * 3, i * 3 + 3);
    });
    label(T, ["BLIND SIGNATURE", "THE BANK SIGNS WHAT IT CANNOT SEE"], 0.9);
  };
  // 1991 · time-stamping by linked hashes: on a board to the left three certificates, one under another, each
  // carrying the hash of the one before (a lit link between them); on a board to the right the week's paper, where
  // the latest hash is published for anyone to check. (+x is the viewer's left.)
  M.timestamp = (T0, fine) => {
    const T = plain(T0), hashes = ["3B7E", "A1C9", "5D02", "E6F4", "9F2A"];
    const Cb = easel(T, 0.3, -0.12, 0.5, 0.52, 0.42);
    // The certificates stand high on their board: the lowest one's last line clears the label strip in front of it.
    [2, 3, 4].forEach((i, k) => {
      const y = 0.03 + (1 - k) * 0.158;
      card(Cb.at(0, y, -0.001), [[`CERTIFICATE ${i + 1}`, 0.0032, C.ink, 0.05], [`PREV ${hashes[i - 1]} · HASH ${hashes[i]}`, 0.0032, C.inkBlue, 0.1], ["TIME-STAMPED, PUBLISHED IN THE PAPER", 0.0021, "#5a5750", 0.05]], 0.47, 0.15, { bg: k % 2 ? C.paperOld : C.paper, t: 0.003, gap: 0.55, margin: 0.012 });
      if (k) Cb.B(0.012, 0.03, 0.004, C.amber, 0.19, y + 0.079, -0.004, { emissive: 0.8, glow: true });
    });
    // The paper: its masthead, columns of print, and the boxed notice with the week's hash.
    const Pb = easel(T, -0.31, -0.12, 0.42, 0.52, 0.42);
    Pb.B(0.4, 0.5, 0.003, C.paper, 0, 0, -0.0015);
    card(Pb.at(0, 0.185, -0.003), [["THE DAILY LEDGER", 0.0038, C.ink, 0.05], ["SUNDAY · NOTICES", 0.0024, "#5a5750", 0.05]], 0.38, 0.1, { bg: null, margin: 0.008, gap: 0.6 });
    Pb.B(0.36, 0.003, LIFT, C.ink, 0, 0.128, -0.004);
    if (fine) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) Pb.B(0.1, 0.005, LIFT, "#6a675f", (c - 1) * 0.12, 0.105 - r * 0.017, -0.004);
    Pb.B(0.372, 0.212, 0.001, C.ink, 0, -0.125, -0.0035);
    card(Pb.at(0, -0.125, -0.005), [["THIS WEEK'S HASH", 0.0028, C.ink, 0.05], ["9F2A 7C41 D08B 3E55", 0.0031, C.inkBlue, 0.1], ["CHECK IT AGAINST", 0.0022, "#5a5750", 0.05], ["YOUR CERTIFICATE", 0.0022, "#5a5750", 0.05]], 0.364, 0.204, { bg: "#f3ecd8", t: 0.002, gap: 0.55, margin: 0.012 });
    label(T, ["TIME-STAMPING · LINKED HASHES", "EACH CERTIFICATE CARRIES THE HASH OF THE LAST"]);
  };
  // The whitepaper: nine sheets fanned on a lectern, the first page as the paper lays it out, the title over the
  // author's name and the site, the abstract as a block of print, the first heading under it.
  M.whitepaper = (T, fine) => {
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
      const n = fine ? 13 : 7;
      for (let k = 0; k < n; k++) { F.B(w * (k === n - 1 ? 0.45 : 0.74), LIFT, 0.0024, "#5a5750", k === n - 1 ? -w * 0.14 : 0, y, F.layer(0)); y -= 0.0068; }
      y -= 0.014;
      F.say("1. INTRODUCTION", 0.0019, C.ink, -w / 2 + 0.09, y, F.ink(0), 0.05); y -= 0.012;
      for (let k = 0; k < (fine ? 6 : 3); k++) { F.B(w * 0.82, LIFT, 0.0024, "#5a5750", 0, y, F.layer(0)); y -= 0.0068; }
    }
    // The card beside it with the day it was posted.
    const K = T.at(0.3, 0.03, -0.1, -0.4, -0.6);
    K.B(0.11, 0.0016, 0.07, C.paperOld, 0, 0, 0);
    const G = K.face("top", 0, 0.0016, 0);
    G.say("POSTED TO THE", 0.0018, C.ink, 0, 0.018, G.ink(0), 0.05);
    G.say("CRYPTOGRAPHY LIST", 0.0018, C.ink, 0, 0.004, G.ink(0), 0.05);
    G.say("31 OCT 2008", 0.0022, C.inkBlue, 0, -0.014, G.ink(0), 0.1);
  };
  // The genesis block: a slab of lit amber, block 0's header cut into its face, the coinbase's headline on a plate
  // under it. Every figure is the block's own.
  M.genesis = (T, fine) => {
    // Block 0: a slab of lit amber grown to hold its header with margins, cut into its face; on its back, finished for
    // the walk round, the coinbase's headline and the block's place in the chain. Every figure is the block's own.
    const w = 1.1, h = 0.7, d = 0.2;
    T.B(w, h, d, "#3b2608", 0, 0.12 + h / 2, 0);
    T.B(w - 0.03, h - 0.03, d + 0.006, C.btc || C.amber, 0, 0.12 + h / 2, 0, { emissive: 0.35 });
    T.B(w + 0.06, 0.12, d + 0.14, C.steel, 0, 0.06, 0);
    const F = T.face("front", 0, 0.12 + h / 2, -d / 2 - 0.003);
    F.B(w - 0.08, h - 0.08, 0.004, C.ink, 0, 0, -0.002);
    const rows = [["BLOCK 0", 0.0085, C.glow, 0.26], ["3 JAN 2009  18:15:05 UTC", 0.0046, C.white, 0.2], ["VERSION 1   DIFFICULTY 1   REWARD 50 BTC", 0.0032, C.white, 0.155], ["NONCE 2083236893   BITS 1D00FFFF", 0.0034, "#d4c8b6", 0.115], ["HASH", 0.003, C.amber, 0.075]];
    for (const [t, px, color, y] of rows) F.say(t, px, color, 0, y, F.ink(1), 0.6);
    const hash = "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
    for (let i = 0; i < 4; i++) F.say(hash.slice(i * 16, i * 16 + 16).toUpperCase(), 0.0036, C.phosphor, 0, 0.04 - i * 0.034, F.ink(1), 0.7);
    F.say("MERKLE ROOT 4A5E1E4B...AFDEDA33B", 0.0028, "#8c7f6c", 0, -0.12, F.ink(1), 0.3);
    F.say("1 TRANSACTION  285 BYTES  UNSPENDABLE REWARD", 0.0026, "#8c7f6c", 0, -0.155, F.ink(1), 0.3);
    F.say("PREVIOUS BLOCK  0000...0000 (NONE)", 0.0026, "#8c7f6c", 0, -0.19, F.ink(1), 0.3);
    const B = T.face("front", 0, 0.06, -d / 2 - 0.075);
    B.B(w, 0.1, 0.004, C.ink, 0, 0, -0.002);
    B.say("THE TIMES 03/JAN/2009", 0.0032, C.white, 0, 0.02, B.ink(1), 0.4);
    B.say("CHANCELLOR ON BRINK OF SECOND BAILOUT FOR BANKS", 0.0026, "#d4c8b6", 0, -0.014, B.ink(1), 0.3);
    // The back: the coinbase, in the words the block carries, and where the chain goes from here.
    const K = T.face("back", 0, 0.12 + h / 2, d / 2 + 0.003);
    K.B(w - 0.08, h - 0.08, 0.004, C.ink, 0, 0, -0.002);
    K.say("COINBASE", 0.0048, C.glow, 0, 0.26, K.ink(1), 0.6);
    K.say("THE MESSAGE IN THE FIRST TRANSACTION", 0.0026, "#d4c8b6", 0, 0.215, K.ink(1), 0.3);
    K.B(w - 0.2, 0.09, LIFT, "#1c1813", 0, 0.14, K.layer(1));
    K.say("THE TIMES 03/JAN/2009 CHANCELLOR ON", 0.0032, C.white, 0, 0.158, K.ink(2), 0.4);
    K.say("BRINK OF SECOND BAILOUT FOR BANKS", 0.0032, C.white, 0, 0.122, K.ink(2), 0.4);
    K.say("50 BTC TO 1A1ZP1EP5QGEFI2DMPTFTL5SLMV7DIVFNA", 0.0026, C.phosphor, 0, 0.06, K.ink(1), 0.5);
    K.say("NEVER SPENT", 0.0026, "#8c7f6c", 0, 0.025, K.ink(1), 0.3);
    K.say("NEXT: BLOCK 1 · 9 JAN 2009", 0.003, C.amber, 0, -0.06, K.ink(1), 0.5);
    K.say("EVERY BLOCK SINCE POINTS BACK TO THIS ONE", 0.0026, "#d4c8b6", 0, -0.1, K.ink(1), 0.3);
    for (let i = 0; i < 3; i++) K.B(0.06, 0.04, LIFT, i ? "#2a2420" : C.amber, -0.1 + i * 0.1, -0.17, K.layer(1), { emissive: i ? 0 : 0.6, glow: !i });
    for (let i = 0; i < 2; i++) K.B(0.04, 0.004, LIFT, C.amber, -0.05 + i * 0.1, -0.17, K.layer(1), { emissive: 0.6, glow: true });
  };

  // A model in kit `root`, standing on `y`, `s` times the museum's size: always the full build, still.
  const model = (root, key, s = 1, y = 0, opts = {}) => {
    const build = M[key];
    if (!build) throw new Error(`No first version for ${key}`);
    UNIT = opts.unit || 1; LIP = opts.lip || 0; VIEW = opts.view === true;
    try { build(tools(root, y, s, false, false), true, key, opts.part || null); } finally { UNIT = 1; LIP = 0; VIEW = false; }
  };
  // A built first version made crisp where two of its faces lie in one plane, look the same way and overlap in different
  // colours (a panel laid flush on a case, a block sunk to the face of another), which the depth test would draw in
  // stripes: the smaller of the two is lifted `lift` metres off along its own normal, on vertices of its own, so it
  // stands proud as the rest of the model's parts do. Faces are grouped by plane, so only faces in one plane are ever
  // compared; a face lifted onto another's plane is settled again, up to three passes. Run once a build, never in a
  // frame.
  const settle = (geo, lift = LIFT * 0.6, pass = 0) => {
    const v = geo.verts, planes = new Map(), out = [];
    for (let fi = 0; fi < geo.faces.length; fi++) {
      const f = geo.faces[fi], a = f.i[0] * 3;
      let nx = 0, ny = 0, nz = 0;
      for (let t = 2; t < f.i.length; t++) {
        const b = f.i[t - 1] * 3, c = f.i[t] * 3, ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
        nx += uy * wz - uz * wy; ny += uz * wx - ux * wz; nz += ux * wy - uy * wx;
      }
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) continue;
      nx /= len; ny /= len; nz /= len;
      // Two axes in the plane, and the face's outline on them.
      const ax = Math.abs(nx) < 0.9 ? [0, -nz, ny] : [nz, 0, -nx], al = Math.hypot(ax[0], ax[1], ax[2]);
      ax[0] /= al; ax[1] /= al; ax[2] /= al;
      const bx = [ny * ax[2] - nz * ax[1], nz * ax[0] - nx * ax[2], nx * ax[1] - ny * ax[0]], pts = [];
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const k of f.i) { const px = v[k * 3] * ax[0] + v[k * 3 + 1] * ax[1] + v[k * 3 + 2] * ax[2], py = v[k * 3] * bx[0] + v[k * 3 + 1] * bx[1] + v[k * 3 + 2] * bx[2]; pts.push(px, py); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      const key = `${Math.round(nx * 200)},${Math.round(ny * 200)},${Math.round(nz * 200)},${Math.round((nx * v[a] + ny * v[a + 1] + nz * v[a + 2]) / 0.0005)}`;
      const rec = { fi, n: [nx, ny, nz], pts, x0, x1, y0, y1, area: len / 2, look: `${f.color}|${f.emissive || 0}`, lift: false };
      if (!planes.has(key)) planes.set(key, []);
      planes.get(key).push(rec);
    }
    const inside = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) c = !c; return c; };
    for (const list of planes.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.look === B.look) continue;
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ox <= 0.0003 || oy <= 0.0003) continue;
        let hit = 0;
        for (let s = 1; s < 4 && hit < 1; s++) for (let t = 1; t < 4; t++) { const x = Math.max(A.x0, B.x0) + ox * s / 4, y = Math.max(A.y0, B.y0) + oy * t / 4; if (inside(x, y, A.pts) && inside(x, y, B.pts)) { hit++; break; } }
        if (hit) (A.area <= B.area ? A : B).lift = true;
      }
      for (const r of list) if (r.lift) out.push(r);
    }
    for (const r of out) {
      const f = geo.faces[r.fi], fresh = [];
      for (const k of f.i) { fresh.push(v.length / 3); v.push(v[k * 3] + r.n[0] * lift, v[k * 3 + 1] + r.n[1] * lift, v[k * 3 + 2] + r.n[2] * lift); }
      f.i = fresh;
    }
    return out.length && pass < 2 ? settle(geo, lift, pass + 1) : geo;
  };
  BL.timechainGenesisFirst = { model, settle, has: (key) => !!M[key], C, fits: FITS };
})();
