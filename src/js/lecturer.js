// Whoever gives a hall's lectures: an Ooga built from a profile (`PROFILES`: its look, hairline, clothes and how it carries
// itself, all data, so another course brings its own lecturer by adding one) and moved by the lecture's own state.
// `create({ parent, profile, stage })` stands him on the stage; `update(dt, elapsed, state, speaking, pen)` walks him
// to the place the lecture names (lecture-kit.js `PLACES`), turns him to the hall, poses his arms in the gesture it
// names (`GESTURES`) with the small beats of someone talking with his hands, his hands open as he talks, nods his
// head as he speaks, and at the tablet follows the marker's place on the board with his drawing hand (`pen`,
// lecture-slides.js `penAt`). When the hall hands him a point on a screen (`aim`: what the sentence is about), he
// stays open to the hall, turns a little toward it, looks up at it and points at it with a finger of the hand on
// that side, the arm solved to lie along the line to it. Between
// lectures he waits at the lectern. He is under a name no login can have, so he never joins the roster, and he is
// nobody's walk block. Allocates nothing a frame.
(() => {
  "use strict";
  const BL = window.BL;
  const { box, merge, moved, turnedZ } = BL.models;
  const { createNode, addChild, removeChild } = BL.scene;
  const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
  // A number from 0 to 65535 for a whole number: what he does varies by it, so it is not a pattern anyone can read,
  // yet is the same on every page and every run (a shared lecture shows one lecturer).
  const hash = (n) => { let h = Math.imul(n | 0, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return h >>> 16; };
  // An arm's pose: its swing forward (negative is forward and up), how far it stands out from the side, and its
  // elbow's bend; `beat` is how much the hand moves with the words; `hr` and `hl` are the right and left hands' shapes
  // (open unless named: a fist, or a pointing finger).
  const POSES = {
    rest: { r: [-0.12, 0.1, 0.3], l: [-0.12, 0.1, 0.3], beat: 0.02 },
    open: { r: [-0.7, 0.42, 0.95], l: [-0.7, 0.42, 0.95], beat: 0.1 },
    wide: { r: [-1.0, 0.95, 0.4], l: [-1.0, 0.95, 0.4], beat: 0.07 },
    count: { r: [-1.2, 0.18, 1.55], l: [-0.95, 0.12, 1.25], beat: 0.1, hr: "point" },
    chop: { r: [-0.95, 0.1, 1.05], l: [-0.2, 0.12, 0.4], beat: 0.16, hl: "fist" },
    point: { r: [-1.45, 0.3, 0.15], l: [-0.15, 0.1, 0.35], beat: 0.04, hr: "point", hl: "fist" },
    shrug: { r: [-0.5, 0.62, 1.45], l: [-0.5, 0.62, 1.45], beat: 0.06 },
    pinch: { r: [-1.25, 0.06, 1.65], l: [-0.2, 0.1, 0.4], beat: 0.09, hr: "point" },
    glasses: { r: [-1.75, -0.05, 2.25], l: [-0.15, 0.1, 0.35], beat: 0.02, hr: "point" },
    lean: { r: [-0.62, 0.22, 1.12], l: [-0.62, 0.22, 1.12], beat: 0.02 },
    weigh: { r: [-0.85, 0.4, 1.2], l: [-0.85, 0.4, 1.2], beat: 0.18, see: true },
    up: { r: [-2.4, 0.2, 0.3], l: [-0.2, 0.1, 0.4], beat: 0.05, hr: "point", hl: "fist" },
    draw: { r: [-0.92, 0.05, 1.3], l: [-0.55, 0.2, 1.05], beat: 0, hr: "point" },
    // Ways of talking with the hands, for a sentence that asks for no gesture of its own (`TALK` names the ones taken in
    // turn; the others are a lecture's to ask for).
    fist: { r: [-0.85, 0.14, 1.45], l: [-0.15, 0.1, 0.35], beat: 0.14, hr: "fist" },
    fists: { r: [-0.78, 0.22, 1.4], l: [-0.78, 0.22, 1.4], beat: 0.13, hr: "fist", hl: "fist" },
    offer: { r: [-0.85, 0.5, 0.95], l: [-0.12, 0.1, 0.3], beat: 0.12 },
    offerL: { r: [-0.12, 0.1, 0.3], l: [-0.85, 0.5, 0.95], beat: 0.12 },
    you: { r: [-1.3, 0.12, 0.45], l: [-0.15, 0.1, 0.35], beat: 0.05, hr: "point", hl: "fist" },
    youL: { r: [-0.15, 0.1, 0.35], l: [-1.25, 0.12, 0.5], beat: 0.05, hl: "point", hr: "fist" },
    steeple: { r: [-0.6, -0.16, 1.75], l: [-0.6, -0.16, 1.75], beat: 0.03 },
    hip: { r: [-0.8, 0.45, 1.0], l: [0.2, 0.6, 1.7], beat: 0.1, hl: "fist" },
    tap: { r: [-0.85, -0.04, 1.5], l: [-0.72, -0.04, 1.42], beat: 0.12, hr: "fist" },
    // Walking, the hands in loose fists; and pacing while he talks, one fist keeping time.
    walk: { r: [-0.05, 0.1, 0.55], l: [-0.05, 0.1, 0.55], beat: 0, hr: "fist", hl: "fist" },
    stroll: { r: [-0.55, 0.15, 1.25], l: [-0.05, 0.1, 0.55], beat: 0.16, hr: "fist", hl: "fist" }
  };
  const TALK = ["open", "offer", "steeple", "offerL", "fist", "you"];
  // The places he may pace about while a long stretch is said.
  const PACES = { centre: true, left: true, right: true };
  const glasses = (u) => {
    const frame = "#141416", z = 3.35 * u, parts = [];
    for (const side of [-1, 1]) {
      const cx = side * 2.5 * u;
      parts.push(box({ w: 2.7 * u, h: 0.3 * u, d: 0.25 * u, color: frame, offset: { x: cx, y: 4.2 * u, z } }), box({ w: 2.7 * u, h: 0.3 * u, d: 0.25 * u, color: frame, offset: { x: cx, y: 1.9 * u, z } }),
        box({ w: 0.3 * u, h: 2.6 * u, d: 0.25 * u, color: frame, offset: { x: cx - 1.35 * u, y: 3.05 * u, z } }), box({ w: 0.3 * u, h: 2.6 * u, d: 0.25 * u, color: frame, offset: { x: cx + 1.35 * u, y: 3.05 * u, z } }),
        box({ w: 0.25 * u, h: 0.3 * u, d: 3.6 * u, color: frame, offset: { x: side * 3.72 * u, y: 3.6 * u, z: z - 1.8 * u } }));
    }
    // The bridge runs level with the rims' tops, over the top of the nose and a little proud of it.
    parts.push(box({ w: 2.5 * u, h: 0.34 * u, d: 0.55 * u, color: frame, offset: { y: 4.2 * u, z: z + 0.15 * u } }));
    return merge(...parts);
  };
  // A lecturer's hands, in place of an island Ooga's fist (the same frame: the wrist at the top, the palm toward +z,
  // the thumb on `side`): open, the palm flat with three fingers out and the thumb away from them; and pointing, the
  // first finger out with the other two curled into the palm and the thumb across them.
  const openHand = (side, u, skin, shade) => merge(
    box({ w: 3.0 * u, h: 2.15 * u, d: 1.1 * u, color: skin, offset: { y: 0.78 * u, z: 0.2 * u } }),
    ...[-1.04, 0, 1.04].map((x, i) => box({ w: 0.92 * u, h: (i === 1 ? 2.3 : 2.05) * u, d: 0.85 * u, color: i === 1 ? skin : shade, offset: { x: x * u, y: (i === 1 ? -1.45 : -1.32) * u, z: 0.2 * u } })),
    moved(turnedZ(box({ w: 0.85 * u, h: 1.9 * u, d: 0.85 * u, color: shade }), side * 0.6), side * 2.05 * u, 0.25 * u, 0.25 * u)
  );
  const pointHand = (side, u, skin, shade) => merge(
    box({ w: 3.0 * u, h: 2.15 * u, d: 1.1 * u, color: skin, offset: { y: 0.78 * u, z: 0.2 * u } }),
    box({ w: 0.92 * u, h: 2.5 * u, d: 0.85 * u, color: skin, offset: { x: side * 1.04 * u, y: -1.55 * u, z: 0.2 * u } }),
    box({ w: 1.98 * u, h: 1.05 * u, d: 1.5 * u, color: shade, offset: { x: -side * 0.5 * u, y: -0.82 * u, z: 0.55 * u } }),
    box({ w: 1.7 * u, h: 0.7 * u, d: 0.6 * u, color: skin, offset: { x: -side * 0.1 * u, y: -0.7 * u, z: 1.55 * u } })
  );
  // A receding hairline with a widow's peak: hair over the crown set back from the forehead, coming forward to a
  // point in the middle, bare in a bay either side of it, forward again at each side to a point toward the brow's
  // outer end and down from there into a short sideburn in front of the ear; short over the ears and across the back,
  // in two shades.
  const widowsPeak = (u, hair, dark) => {
    // Hair on the top of the head stands on it (the head's top is 6 units up): `on(w, h, z0, z1, x)` is a slab of it.
    const on = (w, h, z0, z1, color, x = 0) => box({ w: w * u, h: h * u, d: (z1 - z0) * u, color, offset: { x: x * u, y: (6 + h / 2) * u, z: (z0 + z1) / 2 * u } });
    // Hair on the side of the head, a slab between two heights.
    const by = (side, y0, y1, z0, z1, color) => box({ w: 0.5 * u, h: (y1 - y0) * u, d: (z1 - z0) * u, color, offset: { x: side * 3.72 * u, y: (y0 + y1) / 2 * u, z: (z0 + z1) / 2 * u } });
    const parts = [
      // The crown, and the tongue of hair that narrows forward from it down the middle to the peak. Either side of
      // the tongue the scalp is bare, in a bay that widens toward the front until it reaches the side of the head.
      on(7.5, 0.9, -3.3, 0.3, hair),
      on(3.0, 0.88, 0.3, 1.0, hair), on(2.2, 0.85, 1.0, 1.7, hair), on(1.5, 0.82, 1.7, 2.4, hair), on(1.1, 0.8, 2.4, 3.0, dark),
      // The peak itself, down onto the forehead: a block over the brow's middle and a point under it.
      box({ w: 1.2 * u, h: 1.2 * u, d: 0.5 * u, color: dark, offset: { y: 6.25 * u, z: 3.0 * u } }),
      box({ w: 0.7 * u, h: 0.6 * u, d: 0.4 * u, color: dark, offset: { y: 5.4 * u, z: 3.1 * u } }),
      // The back of the head, covered from the crown down to the nape, where it narrows to the neck.
      box({ w: 7.5 * u, h: 5.7 * u, d: 0.5 * u, color: hair, offset: { y: 3.75 * u, z: -3.2 * u } }),
      box({ w: 5.6 * u, h: 0.6 * u, d: 0.5 * u, color: dark, offset: { y: 0.6 * u, z: -3.2 * u } })
    ];
    for (const side of [-1, 1]) {
      parts.push(
        // The bay's outer edge, stepping out to the side of the head as it comes forward.
        on(1.05, 0.88, 0.3, 1.0, hair, side * 3.22), on(0.65, 0.85, 1.0, 1.7, hair, side * 3.42), on(0.35, 0.8, 1.7, 2.3, hair, side * 3.57),
        // The side of the head: all of it over the ear (the ear is 2 to 4 units up, a unit either side of the middle)
        // and behind it, close against the ear and on down beside the nape, and forward to a point at the temple no higher than
        // the head's top, so no corner of hair shows on top there.
        by(side, 4.0, 6.5, -3.3, 2.3, hair), by(side, 4.7, 6.0, 2.3, 3.0, dark),
        by(side, 2.0, 4.0, -3.3, -1.0, dark), by(side, 0.9, 2.0, -3.3, -1.9, dark),
        // A short sideburn against the front of the ear.
        by(side, 2.9, 4.0, 1.0, 2.0, hair), by(side, 2.4, 2.9, 1.0, 1.7, dark));
    }
    return merge(...parts);
  };
  // A dress shirt worn loose and tucked in: cut in rings from the belt to the shoulders (each a height, its half width,
  // how far forward and back it stands, and how much its corners are cut). It comes out of the belt, hangs full over
  // it all the way round, falls straight to the chest and slopes in to the neck, standing off the trunk everywhere
  // (the body under it is far narrower at the waist, so the shirt hides it down to the belt); its placket and buttons
  // follow the front, and its collar stands round his neck. In the torso's own frame, in units.
  const SHIRT = [[1.65, 3.72, 3.05, -2.7, 0.9], [2.05, 4.12, 3.38, -2.98, 1.0], [3.0, 4.18, 3.42, -3.04, 1.0], [5.7, 4.25, 3.42, -3.1, 1.05], [7.05, 4.42, 3.42, -3.12, 1.1], [8.0, 4.4, 3.25, -3.08, 1.25], [8.42, 3.85, 2.85, -2.8, 1.4]];
  // The belt under the shirt's hem, low on the hips just over the legs: thin and black, a little proud of the hips,
  // with a small black buckle.
  const BELT = { y0: 1.25, y1: 1.65, ring: [3.74, 3.07, -2.72, 0.9], color: "#0b0b0c", buckle: "#1d1d20" };
  // How far his head is lifted off his shoulders, so a neck shows and his collar can stand round it.
  const NECK = 1.0;
  const looseShirt = (u, p) => {
    const { geometry, pushVert, face } = BL.models, { hexToRgb } = BL.math, g = geometry(), body = hexToRgb(p.shirt), dark = hexToRgb(p.shirtDark);
    const ring = ([y, hx, zf, zb, c]) => [[-hx + c, zf], [hx - c, zf], [hx, zf - c], [hx, zb + c], [hx - c, zb], [-hx + c, zb], [-hx, zb + c], [-hx, zf - c]].map(([x, z]) => [x * u, y * u, z * u]);
    // A flat face wound so it looks away from the shirt's middle (or up, or down, for a cap).
    const out = (pts, color, away) => {
      const [a, b, c] = pts, nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const idx = pts.map((q) => pushVert(g, q[0], q[1], q[2]));
      face(g, nx * away[0] + ny * away[1] + nz * away[2] < 0 ? idx.reverse() : idx, color);
    };
    const rings = SHIRT.map(ring);
    for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < 8; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % 8], c = rings[i + 1][(k + 1) % 8], d = rings[i + 1][k];
      out([a, b, c, d], body, [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2 - 0.1 * u]);
    }
    out(rings[rings.length - 1], body, [0, 1, 0]);
    out(rings[0], dark, [0, -1, 0]);
    // The belt, a band of its own under the hem.
    const belt = hexToRgb(BELT.color), b0 = ring([BELT.y0, ...BELT.ring]), b1 = ring([BELT.y1, ...BELT.ring]);
    for (let k = 0; k < 8; k++) out([b0[k], b0[(k + 1) % 8], b1[(k + 1) % 8], b1[k]], belt, [(b0[k][0] + b0[(k + 1) % 8][0]) / 2, 0, (b0[k][2] + b0[(k + 1) % 8][2]) / 2 - 0.1 * u]);
    out(b0, belt, [0, -1, 0]);
    // The placket down the front, a strip a little proud of each ring's front, and a button on every stretch of it.
    const front = (y) => { for (let i = 0; i + 1 < SHIRT.length; i++) if (y <= SHIRT[i + 1][0]) { const t = (y - SHIRT[i][0]) / (SHIRT[i + 1][0] - SHIRT[i][0]); return SHIRT[i][2] + (SHIRT[i + 1][2] - SHIRT[i][2]) * t; } return SHIRT[SHIRT.length - 1][2]; };
    // It runs from the hem up the chest, and stops where the shirt turns in to the shoulders.
    const parts = [g], top = SHIRT[SHIRT.length - 1][0], foot = SHIRT[SHIRT.length - 2][0] - 0.03;
    for (let i = 0; i < 8; i++) {
      const y0 = SHIRT[0][0] + (foot - SHIRT[0][0]) * i / 8, y1 = SHIRT[0][0] + (foot - SHIRT[0][0]) * (i + 1) / 8, w = 0.45 * u;
      out([[-w, y0 * u, (front(y0) + 0.04) * u], [w, y0 * u, (front(y0) + 0.04) * u], [w, y1 * u, (front(y1) + 0.04) * u], [-w, y1 * u, (front(y1) + 0.04) * u]], dark, [0, 0, 1]);
    }
    parts.push(box({ w: 0.62 * u, h: 0.46 * u, d: 0.1 * u, color: BELT.buckle, offset: { y: (BELT.y0 + BELT.y1) / 2 * u, z: (BELT.ring[1] + 0.05) * u } }),
      box({ w: 0.34 * u, h: 0.22 * u, d: 0.12 * u, color: BELT.color, offset: { y: (BELT.y0 + BELT.y1) / 2 * u, z: (BELT.ring[1] + 0.06) * u } }));
    for (const y of [2.45, 3.6, 4.75, 5.9, 7.0]) parts.push(box({ w: 0.36 * u, h: 0.36 * u, d: 0.12 * u, color: p.button, offset: { y: y * u, z: (front(y) + 0.1) * u } }));
    // The collar, modelled as a shirt's collar is made and worn open. A stand rises from inside the shirt round the
    // neck, its two ends a little apart at the throat. The collar's leaf is joined to the stand's top edge all the way
    // round, turns over there (the fold) and falls outside the stand as one band of the same depth everywhere, from
    // one side of the throat round the back to the other, its hem resting on the shoulders; its two leading edges
    // slant a little out from the fold to the hem. The stand goes down into the shirt, so nothing shows between them,
    // and between its ends his throat shows. The shirt's own
    // cloth and colour throughout: the light alone picks out the fold, and the hem and the leading edges are a
    // cloth's thickness, in the shirt's shadow tone.
    const leaf = hexToRgb(p.shirt), ZC = 0.15, HIGH = top + 1.0, THICK = 0.2, D = Math.PI / 180, END = 11;
    // The fold at a bearing round the neck (0 the throat, 180 the back), and the hem on the shoulders below it.
    // The fold stands clear of his neck all the way round, its corners too.
    const foldAt = (deg) => [2.5 * Math.sin(deg * D), HIGH, ZC + 2.15 * Math.cos(deg * D)];
    const hemAt = (deg) => [3.3 * Math.sin(deg * D), top + 0.03, ZC + 2.7 * Math.cos(deg * D)];
    // His neck above the body's own, up to his chin: it is what shows between the collar's ends at the throat.
    parts.push(box({ w: 2.8 * u, h: (NECK + 0.9) * u, d: 2.5 * u, color: p.skin, offset: { y: (top + 0.35 + (NECK + 0.9) / 2) * u, z: ZC * u } }));
    const BEARINGS = [END, 30, 50, 70, 90, 115, 140, 160, 180];
    for (const side of [-1, 1]) {
      const at = (q) => [side * q[0] * u, q[1] * u, q[2] * u];
      const F = BEARINGS.map((deg) => at(foldAt(deg))), H = BEARINGS.map((deg) => at(hemAt(deg))), raised = (q) => [q[0], q[1] + THICK * u, q[2]];
      // The fall, from the fold out and down to the hem.
      for (let k = 0; k + 1 < F.length; k++) {
        const away = [(H[k][0] + H[k + 1][0]) / 2, 0.6 * u, (H[k][2] + H[k + 1][2]) / 2 - ZC * u];
        out([F[k], F[k + 1], raised(H[k + 1])], leaf, away);
        out([F[k], raised(H[k + 1]), raised(H[k])], leaf, away);
        // Its hem, the cloth's thickness.
        out([raised(H[k]), raised(H[k + 1]), H[k + 1], H[k]], dark, away);
      }
      // Its leading edge at the throat.
      out([F[0], raised(H[0]), H[0], [F[0][0] * 0.86, (top + 0.03) * u, (F[0][2] - ZC * u) * 0.86 + ZC * u]], dark, [-side, 0, 0.4]);
      // The fold's turn in toward the neck, and the stand inside it, from the fold down into the shirt.
      const inner = (q) => [q[0] * 0.86, q[1] - 0.05 * u, (q[2] - ZC * u) * 0.86 + ZC * u], sunk = (q) => [q[0] * 0.86, (top - 0.3) * u, (q[2] - ZC * u) * 0.86 + ZC * u];
      for (let k = 0; k + 1 < F.length; k++) {
        out([F[k], F[k + 1], inner(F[k + 1]), inner(F[k])], leaf, [0, 1, 0]);
        out([inner(F[k]), inner(F[k + 1]), sunk(F[k + 1]), sunk(F[k])], leaf, [(F[k][0] + F[k + 1][0]) / 2, 0, (F[k][2] + F[k + 1][2]) / 2 - ZC * u]);
        // The stand's inner face, toward the neck.
        out([inner(F[k]), inner(F[k + 1]), sunk(F[k + 1]), sunk(F[k])], leaf, [-(F[k][0] + F[k + 1][0]) / 2, 0, -((F[k][2] + F[k + 1][2]) / 2 - ZC * u)]);
      }
      // The stand's end at the throat, closed.
      out([F[0], inner(F[0]), sunk(F[0]), [F[0][0], (top - 0.3) * u, F[0][2]]], leaf, [-side, 0, 0.5]);
    }
    return merge(...parts);
  };
  // What a profile's clothes paint on the body (the modelled look wears a character's blocks as paint): a button-up
  // shirt with a collar, its placket and buttons down the front and long sleeves to a cuff, a belt, trousers and
  // shoes, with glasses and hair on the head.
  const dressOf = (p) => ({
    torso(k, v) {
      // The body under the shirt is plain: trousers to the waist, the shirt's colour above. The shirt, its buttons,
      // its collar and the belt are pieces of their own over it (`looseShirt`).
      const shirt = k.color(p.shirt), trousers = k.color(p.trousers);
      v.fill(0, 8, 0, 7, 0, 5, (x, y) => y < 4 ? trousers : shirt);
      k.loin = [trousers, trousers];
    },
    gear(k) {
      const u = k.u, { makeVox } = BL.models, shirt = k.color(p.shirt), collar = k.color(p.collar), skin = k.P.skin, trousers = k.color(p.trousers), shoe = k.color(p.shoes);
      const arm = makeVox();
      arm.fill(0, 2, 0, 1, 0, 2, skin);
      arm.fill(0, 2, 2, 2, 0, 2, collar);
      arm.fill(0, 2, 3, 10, 0, 2, shirt);
      const leg = makeVox();
      leg.fill(0, 3, 2, 4, 0, 3, trousers);
      leg.fill(0, 3, 0, 1, 0, 5, shoe);
      k.parts.armR.geometry = k.parts.armL.geometry = k.vg(arm, { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
      k.parts.legR.geometry = k.parts.legL.geometry = k.vg(leg, { x: -2 * u, y: -5 * u, z: -2.5 * u });
    },
    headgear(k) {
      if (p.glasses) addChild(k.parts.head, createNode({ geometry: glasses(k.u) }));
      if (p.hairline === "widowsPeak") addChild(k.parts.head, createNode({ geometry: widowsPeak(k.u, p.hair, p.hairDark) }));
    },
    extras(k) { if (p.looseShirt) addChild(k.parts.torso, createNode({ geometry: looseShirt(k.u, p) })); }
  });
  const PROFILES = {
    pumponopoulos: {
      name: "pumponopoulos/lecture", display: "Professor Pumponopoulos", skin: "#f1d2ba", hair: "#191614", hairDark: "#0e0c0b", hairline: "widowsPeak", height: 1.05, belly: 1.0,
      shirt: "#24303f", shirtDark: "#1a2330", collar: "#3d5169", button: "#0b0b0c", trousers: "#23262d", shoes: "#15120f", glasses: true, looseShirt: true, noseShade: 1,
      // A slighter frame than an island Ooga's: how wide and deep his trunk, arms and legs are drawn, and how far in
      // his shoulders and his hips sit (the legs stay inside the narrower trunk).
      frame: { torso: [0.78, 0.82], arm: 0.64, shoulder: 0.83, leg: 0.74, hip: 0.72, hand: 0.86 },
      // How he moves: his walking pace on the stage (m/s), how big his hands' beats are and how often he shifts his weight.
      pace: 1.25, energy: 0.9, sway: 0.9
    }
  };
  const traitsOf = (p) => ({ ...BL.contributors.traitsFor(p.name), display: p.display, skin: p.skin, hair: p.hair, fur: p.shirt, height: p.height, belly: p.belly, bald: true, cleanShaven: true, flatMouth: true, noFlaps: true, noseShade: p.noseShade, dress: dressOf(p) });

  const create = ({ parent, profile, stage }) => {
    const p = PROFILES[profile];
    if (!p) throw new Error(`No lecturer ${profile}`);
    const figure = BL.models.caveman(traitsOf(p)), parts = figure.parts, body = figure.root;
    if (p.frame) {
      const f = p.frame;
      parts.torso.scale.x = f.torso[0]; parts.torso.scale.z = f.torso[1];
      // An arm is thinned in its own cloth, each part about its own length, never by squashing its node: a forearm
      // bent inside a squashed upper arm would be sheared out of true.
      const thin = (g) => ({ ...g, verts: g.verts.map((v, i) => i % 3 === 1 ? v : v * f.arm) });
      for (const [arm, fore] of [[parts.armR, parts.forearmR], [parts.armL, parts.forearmL]]) {
        arm.geometry = thin(arm.geometry); fore.geometry = thin(fore.geometry);
        fore.position.z *= f.arm;
        arm.position.x *= f.shoulder;
      }
      for (const leg of [parts.legR, parts.legL]) { leg.scale.x = leg.scale.z = f.leg; leg.position.x *= f.hip; }
    }
    // A leg is capped in skin where it meets the hip, and an arm where it meets the shoulder, out of sight on an
    // island Ooga; under a narrower trunk their corners show, so a clothed limb's caps take its cloth's colour.
    if (p.trousers) {
      const skin = BL.math.hexToRgb(p.skin), recolour = (limbs, hex) => { const cloth = BL.math.hexToRgb(hex); for (const limb of limbs) for (const face of limb.geometry.faces) if (face.color[0] === skin[0] && face.color[1] === skin[1] && face.color[2] === skin[2]) face.color = cloth; };
      recolour([parts.legR, parts.legL], p.trousers);
      recolour([parts.armR, parts.armL], p.shirt);
      // So too a forearm's cap at the elbow, which shows as a sliver behind a bent arm; its cap at the wrist stays skin.
      const cloth = BL.math.hexToRgb(p.shirt);
      for (const fore of [parts.forearmR, parts.forearmL]) for (const face of fore.geometry.faces) if (face.color[0] === skin[0] && face.color[1] === skin[1] && face.color[2] === skin[2] && face.i.every((i) => fore.geometry.verts[i * 3 + 1] > 0)) face.color = cloth;
    }
    // His hands: an open and a pointing hand beside the fist an Ooga is built with, one of the three shown at a time.
    const u = figure.traits.height / 16, hands = {}, shown = { r: "", l: "" };
    for (const [key, side, fist] of [["r", -1, parts.fingersR], ["l", 1, parts.fingersL]]) {
      const at = fist.position, skinDk = "#" + [0, 1, 2].map((i) => Math.round(parseInt(p.skin.slice(1 + i * 2, 3 + i * 2), 16) * 0.9).toString(16).padStart(2, "0")).join("");
      // A hand a little smaller than an island Ooga's, on the thinner arm.
      const grow = p.frame ? p.frame.hand : 1, scale = () => ({ x: grow, y: 1, z: grow });
      const open = createNode({ position: { x: at.x, y: at.y, z: at.z }, scale: scale(), geometry: openHand(side, u, p.skin, skinDk) }), point = createNode({ position: { x: at.x, y: at.y, z: at.z }, scale: scale(), geometry: pointHand(side, u, p.skin, skinDk), visible: false });
      addChild(fist.parent, open, point);
      fist.scale.x = fist.scale.z = grow;
      hands[key] = { open, point, fist };
    }
    const hand = (key, shape) => {
      if (shown[key] === shape) return;
      shown[key] = shape;
      const h = hands[key];
      h.open.visible = shape === "open"; h.point.visible = shape === "point"; h.fist.visible = shape === "fist";
    };
    hand("r", "open"); hand("l", "open");
    if (p.looseShirt) parts.head.position.y += NECK * figure.traits.height / 16;
    // A lecturer carries nothing an island Ooga does: its club, its snack and its rifle with every round on it.
    const hide = (node) => { node.visible = false; if (node.children) for (const child of node.children) hide(child); };
    for (const name of ["club", "gun", "snack"]) if (parts[name]) hide(parts[name]);
    const home = stage.places.lectern;
    const root = createNode({ position: { x: home.x, y: stage.top, z: home.z }, rotation: { x: 0, y: home.ry, z: 0 }, sightHidden: true });
    addChild(root, body);
    addChild(parent, root);
    const hip = body.position.y;
    // His arms as they are now (swing, spread, bend for each), eased toward the gesture's.
    const arm = { r: [-0.12, 0.1, 0.3], l: [-0.12, 0.1, 0.3] };
    let walk = 0, heading = home.ry, look = 0, nod = 0, glance = 0, glanceAt = 2, talk = 0, aiming = 0;
    // How far he turns from the hall to point (he stays open to it, and points up and back over the shoulder on the
    // screen's side with that side's arm), and where his shoulder is over his feet.
    const TURN = 0.55, SHOULDER = parts.armR.position.y + hip;
    let pointSide = "r", paceSide = 1, paceHold = 0, paceBeat = -1, paceStep = 0, paceSpan = 1;
    // An arm's own measures, in the frame its shoulders hang in (the body's, its origin at the hip): the shoulder out to
    // the side and up, the elbow below it and a little behind (`TILT`), and along the forearm the palm and a fingertip.
    const ELBOW = parts.forearmR.position, L1 = Math.hypot(ELBOW.y, ELBOW.z), TILT = Math.atan2(-ELBOW.z, -ELBOW.y);
    const SX = Math.abs(parts.armR.position.x), SY = parts.armR.position.y, WRIST = -parts.fingersR.position.y, PALM = WRIST + 0.03, TIP = WRIST + 0.16;
    const solved = { x: 0, z: 0, b: 0 }, at = { x: 0, y: 0, z: 0 }, desk = { x: 0, z: 0 }, goal = { x: 0, z: 0 };
    // Where a point along the forearm (`l2` from the elbow) is, for an arm turned `x` forward and `z` about its length's
    // side (as the node turns: `z` first, then `x`) with its elbow bent `b`.
    const handAt = (sign, x, z, b, l2) => {
      const vy = ELBOW.y - l2 * Math.cos(b), vz = ELBOW.z + l2 * Math.sin(b), y1 = vy * Math.cos(z);
      at.x = sign * SX - vy * Math.sin(z); at.y = SY + y1 * Math.cos(x) - vz * Math.sin(x); at.z = y1 * Math.sin(x) + vz * Math.cos(x);
    };
    // The arm that puts that point of its forearm at a place, its elbow down and back: two bones in a plane, the
    // plane the one the shoulder's own turns allow. Solved twice, the second time for what the first missed by.
    const reachOnce = (sign, tx, ty, tz, l2) => {
      let x = tx - sign * SX, y = ty - SY, z = tz;
      const d = Math.hypot(x, y, z) || 1e-6, dc = Math.max(Math.abs(L1 - l2) + 0.02, Math.min(L1 + l2 - 0.004, d));
      x /= d; y /= d; z /= d;
      const phi = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + l2 * l2 - dc * dc) / (2 * L1 * l2))));
      const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + dc * dc - l2 * l2) / (2 * L1 * dc))));
      const s = Math.sqrt(Math.max(1e-6, 1 - x * x)), ca = Math.cos(al), sa = Math.sin(al);
      const c1 = Math.max(-0.95, Math.min(0.95, x * Math.tan(al) / s)), c2 = -Math.sqrt(1 - c1 * c1);
      const ux = x * ca + c1 * (1 - x * x) / s * sa, uy = y * ca + (-c1 * x * y + c2 * z) / s * sa, uz = z * ca + (-c1 * x * z - c2 * y) / s * sa;
      solved.z = Math.asin(Math.max(-1, Math.min(1, ux)));
      solved.x = Math.atan2(-uz, -uy) - TILT;
      solved.b = Math.max(0.02, Math.PI - phi - TILT);
    };
    const reach = (sign, tx, ty, tz, l2) => {
      reachOnce(sign, tx, ty, tz, l2);
      handAt(sign, solved.x, solved.z, solved.b, l2);
      reachOnce(sign, tx + (tx - at.x), ty + (ty - at.y), tz + (tz - at.z), l2);
    };
    // The lectern, as his hands must know it: `deskOf` puts a point of his own frame into the lectern's, `bodyOf` one
    // of the lectern's into his, and `topAt` is how high the reading top stands there (it slopes down toward him).
    const D = stage.lectern;
    let ch = 1, sh = 0;
    const cl = Math.cos(D.ry), sl = Math.sin(D.ry);
    const deskOf = (x, z) => {
      const dx = root.position.x + x * ch + z * sh - D.x, dz = root.position.z - x * sh + z * ch - D.z;
      desk.x = dx * cl - dz * sl; desk.z = dx * sl + dz * cl;
    };
    const bodyOf = (x, z) => {
      const dx = D.x + x * cl + z * sl - root.position.x, dz = D.z - x * sl + z * cl - root.position.z;
      desk.x = dx * ch - dz * sh; desk.z = dx * sh + dz * ch;
    };
    const topAt = (z) => D.top + D.slope * (z - D.topZ);
    // How far a point of his arm must rise to clear the lectern: nothing, away from it or above its top.
    const CLEAR = 0.07;
    // The fastest his shoulder swings, his arm spreads and his elbow bends, in radians a second.
    const SLEW = [2.4, 1.8, 2.8];
    const lift = (sign, x, z, b, l2) => {
      handAt(sign, x, z, b, l2);
      deskOf(at.x, at.z);
      if (Math.abs(desk.x) > D.hx + 0.07 || desk.z < D.topZ - D.hz - 0.06 || desk.z > D.topZ + D.hz + 0.06) return 0;
      return Math.max(0, topAt(desk.z) + CLEAR - (at.y + hip));
    };
    // Round what stands on the stage rather than through it: where to walk to now, on the way to a place.
    const steer = (tx, tz) => {
      const pos = root.position;
      for (const B of stage.blocks) {
        const ax = tx - pos.x, az = tz - pos.z, len = ax * ax + az * az;
        if (len < 1e-4) continue;
        const k = ((B.x - pos.x) * ax + (B.z - pos.z) * az) / len;
        if (k <= 0.02 || k >= 0.98) continue;
        let ox = pos.x + ax * k - B.x, oz = pos.z + az * k - B.z, o = Math.hypot(ox, oz);
        if (o >= B.r) continue;
        // A path through its very middle goes round on the stage's own middle's side.
        if (o < 0.02) { ox = -B.x; oz = stage.F + 1.6 - B.z; o = Math.hypot(ox, oz) || 1; }
        tx = B.x + ox / o * (B.r + 0.14); tz = B.z + oz / o * (B.r + 0.14);
      }
      goal.x = tx; goal.z = tz;
    };
    const blocked = (x, z) => { for (const B of stage.blocks) if (Math.hypot(x - B.x, z - B.z) < B.r + 0.2) return true; return false; };
    const update = (dt, elapsed, st, speaking, pen, aim, stroll) => {
      const where = st ? st.place : "lectern", place = stage.places[where] || home, pos = root.position;
      // His place; or, through some of the long stretches said out on the stage and not others, a slow walk about it.
      // Nothing of it is regular: whether he walks at all in a stretch, how long he stands before the first step, which
      // way he sets off, how far each way, how long he stands at each end, and whether he then stays there for the rest.
      const beatNo = st ? st.beat : -1;
      const pacing = !!stroll && speaking && !pen && !!PACES[where] && hash(beatNo * 53 + 11) % 100 < 45;
      let tx = place.x, tz = place.z;
      if (pacing) {
        if (beatNo !== paceBeat) {
          const h = hash(beatNo * 97 + 1);
          paceBeat = beatNo; paceStep = 0; paceSide = h & 1 ? 1 : -1; paceHold = 1.5 + h % 650 / 100; paceSpan = 0.6 + hash(beatNo * 89 + 2) % 90 / 100;
        }
        // While he points at something he stands where he is.
        if (paceHold > 0 || aim) { if (!aim) paceHold -= dt; tx = pos.x; tz = pos.z; }
        else {
          tx = place.x + paceSide * paceSpan * Math.cos(place.ry); tz = place.z - paceSide * paceSpan * Math.sin(place.ry);
          if (blocked(tx, tz) || Math.hypot(tx, tz - stage.F) > stage.r - 0.8) { tx = place.x; tz = place.z; }
          if (Math.hypot(tx - pos.x, tz - pos.z) < 0.06) {
            const h = hash(beatNo * 97 + ++paceStep * 31);
            paceHold = h % 100 < 30 ? 999 : 3 + (h >> 7) % 600 / 100;
            paceSide = -paceSide; paceSpan = 0.6 + hash(h) % 90 / 100;
          }
        }
      } else { paceHold = 0; paceBeat = -1; }
      steer(tx, tz);
      // To it at a walk, turned the way he goes (a pacing walk stays half turned to the hall); there, as the place has him.
      const dx = goal.x - pos.x, dz = goal.z - pos.z, far = Math.hypot(dx, dz), moving = far > 0.04;
      if (moving) {
        const step = Math.min(far, p.pace * (pacing ? 0.5 : 1) * dt);
        pos.x += dx / far * step; pos.z += dz / far * step;
        walk += step * 4.4;
      }
      const pointing = !!aim && !moving && !pen;
      aiming = damp(aiming, pointing ? 1 : 0, 7, dt);
      // Which side the point lies on as he stands at his place: his left is +x in his own frame.
      if (pointing) pointSide = (aim.x - pos.x) * Math.cos(place.ry) - (aim.z - pos.z) * Math.sin(place.ry) >= 0 ? "l" : "r";
      let want = place.ry;
      if (moving && far > 0.3) {
        want = Math.atan2(dx, dz);
        if (pacing) { let off = want - place.ry; while (off > Math.PI) off -= 2 * Math.PI; while (off < -Math.PI) off += 2 * Math.PI; want = place.ry + Math.max(-0.95, Math.min(0.95, off)); }
      } else if (pointing) want = place.ry + (pointSide === "l" ? TURN : -TURN);
      let turn = want - heading;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      heading += turn * (1 - Math.exp(-7 * dt));
      root.rotation.y = heading;
      ch = Math.cos(heading); sh = Math.sin(heading);
      const stride = moving ? Math.sin(walk) * (pacing ? 0.42 : 0.55) : 0;
      parts.legL.rotation.x = damp(parts.legL.rotation.x, stride, 16, dt);
      parts.legR.rotation.x = damp(parts.legR.rotation.x, -stride, 16, dt);
      body.position.y = hip + (moving ? Math.abs(Math.cos(walk)) * 0.025 : Math.sin(elapsed * 1.7) * 0.004);
      // Whether the lectern is in front of him, within his arms' reach: its near edge, in his own frame.
      bodyOf(0, D.topZ - D.hz);
      const atDesk = !moving && desk.z > 0.2 && desk.z < 0.62 && Math.abs(desk.x) < 0.3;
      // The gesture, with the hands' beats while he speaks: the one the sentence names, or for a plain sentence one of
      // the ways he talks with his hands, a different one a sentence. Walking, his hands are fists.
      talk = damp(talk, speaking && st && st.speaking ? 1 : 0, 6, dt);
      const drawing = !!pen && !moving && atDesk, resting = !st || !speaking;
      let name = drawing ? "draw" : moving ? pacing ? "stroll" : "walk" : pointing ? "point" : resting ? "rest" : st.gesture;
      // A plain sentence takes one of his ways of talking, kept for a few sentences on end so his hands settle into
      // it (two to four, by where in the lecture he is). Less is more: about half of those stretches, in no order, his
      // hands are simply still, down at his sides, or on the lectern when he stands behind it.
      const plain = name === "open", roll = st ? hash(Math.floor(st.sentence / (2 + hash(st.beat * 7 + 3) % 3)) * 13 + st.beat * 101 + 5) : 0;
      if (plain) name = roll % 100 < 50 ? "rest" : TALK[(roll >> 7) % TALK.length];
      // Behind the lectern with nothing to say with his hands, they rest on its top.
      const onDesk = atDesk && !drawing && !pointing && (resting || name === "lean" || name === "rest");
      const pose = POSES[name] || POSES.open;
      hand("r", pointing ? pointSide === "r" ? "point" : "fist" : onDesk ? "open" : pose.hr || "open");
      hand("l", pointing ? pointSide === "l" ? "point" : "fist" : onDesk || drawing ? "open" : pose.hl || "open");
      // The hands' beats with the words: small, and slow enough to read as emphasis rather than fidgeting.
      const beat = pose.beat * p.energy * talk * 0.4, a = Math.sin(elapsed * 3.2), b = Math.sin(elapsed * 2.2 + 1.3);
      for (const side of ["r", "l"]) {
        const sign = side === "r" ? -1 : 1, now = arm[side];
        const target = pointing && side !== pointSide ? POSES.rest[side] : pose[side];
        let x = target[0] + a * beat * (pose.see ? -sign : 1) + (moving ? stride * sign * 0.5 : 0), z = target[1] + b * beat * 0.4, flex = target[2] + a * beat * 0.5, rate = moving ? 9 : 4.5;
        // Pointing: the arm straight along the line from his shoulder to the point, in his own frame as he stands.
        if (pointing && side === pointSide) {
          const wx = aim.x - pos.x, wy = aim.y - (pos.y + SHOULDER), wz = aim.z - pos.z, len = Math.hypot(wx, wy, wz) || 1;
          // A screen behind him is pointed at as the hall sees it: up and across toward it, with only a little of
          // how far back it lies, so the arm is raised in sight rather than hidden behind his head.
          let lx = (wx * ch - wz * sh) / len, ly = wy / len, lz = (wx * sh + wz * ch) / len;
          if (lz < 0) { lz *= 0.25; const k = Math.hypot(lx, ly, lz) || 1; lx /= k; ly /= k; lz /= k; }
          // The arm turns about z by the angle whose sine is the point's sideways share, then about x; the right arm's
          // spread is kept with the other sign. Raised forward and on over the top, never swung back past the hip.
          z = Math.asin(Math.max(-1, Math.min(1, lx))) * sign; x = Math.atan2(-lz, -ly); flex = 0.06; rate = 8;
          if (x > 0.6) x -= 2 * Math.PI;
        } else if (drawing && side === "r") {
          // His finger on the tablet where the marker is on the board: the board's right is his right, its top the
          // tablet's far edge.
          const tzl = D.topZ + (0.5 - pen.y) * 0.24;
          bodyOf((0.5 - pen.x) * -0.42, tzl);
          reach(sign, desk.x, topAt(tzl) + 0.035 - hip, desk.z, TIP);
          x = solved.x; z = solved.z * sign; flex = solved.b; rate = 16;
        } else if (onDesk || drawing) {
          // A hand laid on the lectern's top, toward its near edge on his own side.
          const tzl = D.topZ - D.hz * 0.45;
          bodyOf(sign * D.hx * 0.6, tzl);
          reach(sign, desk.x, topAt(tzl) + 0.05 - hip, desk.z, PALM);
          x = solved.x; z = solved.z * sign; flex = solved.b;
        }
        // Nothing of the arm passes through the lectern. The pose he eases toward is raised clear of its top first, so
        // his hands settle above it; and the eased pose itself is corrected only if it still dips well in on the way.
        if (!moving) {
          const up = Math.max(lift(sign, x, z * sign, flex, PALM), lift(sign, x, z * sign, flex, TIP));
          if (up > 0) {
            handAt(sign, x, z * sign, flex, PALM);
            reach(sign, at.x, at.y + up + 0.01, at.z, PALM);
            x = solved.x; z = solved.z * sign; flex = solved.b;
          }
        }
        // Eased toward it, and no joint faster than an arm moves: a raise to point overhead takes a second, never a frame.
        const quick = drawing && side === "r" ? 2 : 1;
        for (let k = 0; k < 3; k++) {
          const to = damp(now[k], k === 0 ? x : k === 1 ? z : flex, rate, dt), most = SLEW[k] * quick * dt;
          now[k] += Math.max(-most, Math.min(most, to - now[k]));
        }
        // And if on the way a palm or a fingertip still dips into the lectern, the elbow folds a little more, then the
        // arm lifts a little, until it is clear: small turns of the joints he already has, so nothing jumps.
        if (!moving) for (let n = 0; n < 3; n++) {
          if (Math.max(lift(sign, now[0], now[1] * sign, now[2], PALM), lift(sign, now[0], now[1] * sign, now[2], TIP)) < 0.004) break;
          if (now[2] < 2.2) now[2] += 0.04; else now[0] -= 0.04;
        }
      }
      parts.armR.rotation.x = arm.r[0]; parts.armR.rotation.z = -arm.r[1]; parts.forearmR.rotation.x = -arm.r[2];
      parts.armL.rotation.x = arm.l[0]; parts.armL.rotation.z = arm.l[1]; parts.forearmL.rotation.x = -arm.l[2];
      // His head: down to the tablet while he draws, else across the hall, a glance every few seconds, a nod on the beat.
      if (elapsed > glanceAt) { glanceAt = elapsed + 2.2 + (Math.sin(elapsed * 12.9898) * 43758.5453 % 1 + 1) % 1 * 3.4; glance = (Math.sin(elapsed * 78.233) * 0.5) * p.sway; }
      look = damp(look, drawing ? 0 : pointing ? (pointSide === "l" ? 0.7 : -0.7) : glance, pointing ? 6 : 3, dt);
      nod = damp(nod, drawing ? 0.5 : pointing ? -0.2 : talk * (0.05 + Math.max(0, a) * 0.07), 8, dt);
      parts.head.rotation.y = look; parts.head.rotation.x = nod;
      // His trunk stays square over his hips and between his arms: only his head turns and tips.
      parts.torso.rotation.y = 0;
      parts.torso.rotation.x = 0;
    };
    // The whole of him as one geometry in his own frame, for a viewer to turn: standing at rest and square, both
    // sides alike, whatever he was in the middle of (his next update poses him again).
    const portrait = () => {
      const rest = POSES.rest;
      parts.armR.rotation.x = rest.r[0]; parts.armR.rotation.z = -rest.r[1]; parts.forearmR.rotation.x = -rest.r[2];
      parts.armL.rotation.x = rest.l[0]; parts.armL.rotation.z = rest.l[1]; parts.forearmL.rotation.x = -rest.l[2];
      parts.legL.rotation.x = parts.legR.rotation.x = parts.head.rotation.x = parts.head.rotation.y = 0;
      body.position.y = hip;
      hand("r", "open"); hand("l", "open");
      // Turned about, since a viewer opens on a model from its far side.
      const { mat4 } = BL.math, pieces = [], origin = mat4.create();
      mat4.fromTRS(origin, { x: 0, y: 0, z: 0 }, { x: 0, y: Math.PI, z: 0 }, { x: 1, y: 1, z: 1 });
      const walk = (node, parent) => {
        if (node.visible === false) return;
        const local = mat4.create(), world = mat4.create(), g = node.geometry;
        mat4.fromTRS(local, node.position, node.rotation, node.scale);
        mat4.multiply(world, parent, local);
        if (g) {
          const v = g.verts, verts = new Array(v.length), m = world;
          for (let i = 0; i < v.length; i += 3) {
            verts[i] = m[0] * v[i] + m[4] * v[i + 1] + m[8] * v[i + 2] + m[12];
            verts[i + 1] = m[1] * v[i] + m[5] * v[i + 1] + m[9] * v[i + 2] + m[13];
            verts[i + 2] = m[2] * v[i] + m[6] * v[i + 1] + m[10] * v[i + 2] + m[14];
          }
          pieces.push({ verts, faces: g.faces.map((f) => ({ i: f.i.slice(), color: f.color, emissive: f.emissive || 0 })), lines: [] });
        }
        if (node.children) for (const child of node.children) walk(child, world);
      };
      walk(body, origin);
      return merge(...pieces);
    };
    return {
      update, root, figure, portrait,
      dispose() { removeChild(parent, root); },
      name: p.display,
      get place() { return { x: root.position.x, z: root.position.z, heading }; }
    };
  };
  BL.lecturer = { create, PROFILES, POSES };
})();
