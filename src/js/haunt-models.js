// The Ghost Hunter's gargoyle and iron fence builders, shared so Block Frenzy's Haunted Hollow can use them without the
// deferred arcade group. Ghost Hunter calls these too (`arcade-scene-models.js`); moved here verbatim.
(() => {
  "use strict";
  const { BL, bevelBox, ccw, cached, lathe, moved, prism, shaded, turnedX, turnedY, turnedZ } = window.BL.arcadeModelsSceneKit;
  const HAUNT_GLOW = "#46ff72";
  const ball = (r, color, segments = 10) => lathe({ profile: [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], segments, color });
  // A stone gargoyle for the arena's wall top, after the cathedrals' (one over the hallway's mouth and over every
  // `GARGOYLE_EVERY`th bay): crouched on a ledge jutting from the rock, its great bat wings half spread up off its back, leaning out over the arena and down into it, ears pricked, jaw open on its
  // fangs, its eyes glowing the hunt's green. Built facing +z, the ledge's back on the wall's face at the origin and
  // its foot on y 0; every perch shares the one geometry.
  const GARGOYLE_STONE = ["#45423e", "#3a3835", "#504c47"], GARGOYLE_EVERY = 2;
  const gargoyle = cached(() => {
    const J = BL.hubModels, [S0, S1, S2] = GARGOYLE_STONE, round = [], flat = [];
    const lump = (x, y, z, rx, ry, rz, color) => {
      const g = ball(1, color, 8), v = g.verts;
      for (let i = 0; i < v.length; i += 3) { v[i] = x + v[i] * rx; v[i + 1] = y + v[i + 1] * ry; v[i + 2] = z + v[i + 2] * rz; }
      return g;
    };
    const fang = (x, y, z, down) => moved(turnedX(lathe({ profile: [[0.018, 0], [0, 0.06]], segments: 5, color: "#b8b2a6" }), down ? Math.PI : 0), x, y, z);
    // The beast, built crouched on y 0 and leant out over its paws.
    const body = [], sheets = [];
    for (const f of [-1, 1]) {
      body.push(lump(f * 0.2, 0.24, -0.18, 0.2, 0.22, 0.26, S0), lump(f * 0.25, 0.06, -0.02, 0.1, 0.06, 0.14, S1));
      body.push(J.log(f * 0.17, 0.5, 0.26, f * 0.18, 0.08, 0.4, 0.07, S0), lump(f * 0.18, 0.06, 0.45, 0.09, 0.06, 0.11, S1));
      for (const d of [-0.04, 0, 0.04]) body.push(moved(turnedX(lathe({ profile: [[0.016, 0], [0, 0.06]], segments: 5, color: S2 }), Math.PI / 2 + 0.5), f * 0.18 + d, 0.05, 0.54));
      const ear = turnedX(turnedZ(prism(ccw([[-0.06, 0], [0.06, 0], [f * 0.03, 0.22]]), 0.04, S1), -f * 0.45), -0.35);
      sheets.push(moved(ear, f * 0.13, 0.85, 0.42));
      // A wing folded up off the shoulder in four membranes between its fingers, its leading bone along the top.
      const R = [0, 0], T = [[0.1, 1.1], [-0.7, 1.3], [-1.24, 0.84], [-1.2, 0.24], [-0.84, -0.08]];
      const wing = (g) => moved(turnedZ(g, f * 0.22), f * 0.24, 0.62, -0.05);
      for (let k = 0; k < T.length - 1; k++) sheets.push(wing(turnedY(prism(ccw([R, T[k], T[k + 1]]), 0.03, k % 2 ? S1 : S0), -Math.PI / 2)));
      for (const [a, b] of [[R, T[0]], [T[0], T[1]]]) body.push(wing(J.log(0, a[1], a[0], 0, b[1], b[0], 0.04, S1)));
      const eye = lump(f * 0.075, 0.765, 0.635, 0.036, 0.03, 0.022, HAUNT_GLOW);
      for (const fc of eye.faces) fc.emissive = 1;
      body.push(eye);
    }
    body.push(lump(0, 0.46, 0.02, 0.26, 0.3, 0.34, S0), lump(0, 0.58, 0.24, 0.23, 0.22, 0.2, S2));
    for (let k = 0; k < 4; k++) body.push(moved(lathe({ profile: [[0.04, 0], [0, 0.09]], segments: 5, color: S1 }), 0, 0.72 - k * 0.04, 0.12 - k * 0.14));
    body.push(J.log(0, 0.22, -0.4, 0, 0.12, -0.62, 0.05, S0), J.log(0, 0.12, -0.62, 0.12, 0.04, -0.7, 0.04, S0));
    body.push(lump(0, 0.74, 0.46, 0.19, 0.17, 0.2, S2), lump(0, 0.815, 0.58, 0.17, 0.05, 0.07, S1), lump(0, 0.69, 0.64, 0.12, 0.09, 0.13, S0));
    body.push(lump(0, 0.61, 0.67, 0.09, 0.05, 0.1, "#1e1b19"), lump(0, 0.55, 0.62, 0.11, 0.045, 0.13, S0));
    for (const f of [-1, 1]) {
      body.push(lump(f * 0.04, 0.71, 0.765, 0.02, 0.015, 0.012, "#1e1b19"));
      body.push(fang(f * 0.05, 0.64, 0.73, true), fang(f * 0.06, 0.565, 0.71, false));
    }
    const perch = (g) => moved(turnedX(g, 0.3), 0, 0.3, -0.12);
    round.push(...body.map(perch));
    flat.push(...sheets.map(perch));
    // The ledge it crouches on, out of the wall's top, and the bracket under it.
    flat.push(bevelBox({ w: 0.9, h: 0.3, d: 1.2, color: S1, bevel: 0.05, offset: { y: 0.15, z: -0.3 } }), bevelBox({ w: 0.66, h: 0.26, d: 0.5, color: S1, bevel: 0.04, offset: { y: -0.12, z: 0.02 } }));
    return shaded(round, flat);
  });
  // The iron fence that rises across the hallway's mouth into the arena while a hunt runs (`IRON_FENCE`, wide enough to
  // bury its ends in the rock either side, tall to the mouth's roof): wrought-iron bars with spear tips between two
  // square posts, two rails across them, built across x facing +z with its foot on y 0.
  const IRON_FENCE = { w: 4.6, h: 3.9, pitch: 0.2 };
  const ironFence = cached(() => {
    const { w, h, pitch } = IRON_FENCE, IRON = "#2a2c30", round = [], flat = [];
    for (let x = -w / 2 + 0.3; x <= w / 2 - 0.29; x += pitch) {
      round.push(moved(lathe({ profile: [[0.022, 0], [0.022, h - 0.22]], segments: 6, color: IRON }), x, 0, 0));
      round.push(moved(lathe({ profile: [[0, h - 0.24], [0.05, h - 0.2], [0, h]], segments: 4, color: "#3c3f45" }), x, 0, 0));
    }
    for (const y of [0.35, h - 0.55]) flat.push(bevelBox({ w: w - 0.2, h: 0.07, d: 0.06, color: IRON, bevel: 0.015, offset: { y } }));
    for (const f of [-1, 1]) {
      flat.push(bevelBox({ w: 0.16, h: h + 0.1, d: 0.16, color: IRON, bevel: 0.02, offset: { x: f * (w / 2 - 0.12), y: (h + 0.1) / 2 } }));
      round.push(moved(lathe({ profile: [[0.1, 0], [0.12, 0.05], [0, 0.18]], segments: 4, color: "#3c3f45" }), f * (w / 2 - 0.12), h + 0.1, 0));
    }
    return shaded(round, flat);
  });
  BL.hauntModels = { gargoyle, ironFence, IRON_FENCE, GARGOYLE_EVERY };
})();
