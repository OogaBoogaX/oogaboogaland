// Kortik's Switchboard: the manual patchboard on its deck beside the Routing Console, and Kortik, the samurai who works
// it. Geometry only; kortik.js runs him. Everything is in the wall's frame: the panel's face at z 0 looking +z into the
// hall, x along the wall, y up from the deck.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, FM = BL.factoryModels, Q = BL.math.quat;
  const { box, bevelBox, merge, cached, makeVox, voxelGeometry, characterGeometry, lathe, turn, shaded, tube, torus, forwardLathe, moved, turnedX, turnedY, turnedZ } = M;
  const { prism, along, lanternParts, chain, noShadow, particleGeometry, geometry, pushVert, face } = M;
  const { createNode, addChild } = BL.scene;

  // ---- Kortik ------------------------------------------------------------------------------------------------------

  // A fictional samurai for now, in his own rig rather than the roster's caveman: the character sheet's voxels are under
  // five centimetres, about twice the caveman's detail, and his head is big on a stocky body. `NAME` is a name no
  // login can have, so nothing ever counts him as a contributor.
  const NAME = "kortik/factory";
  const U = 0.046;
  const C = {
    skin: 0, skinDk: 1, skinLt: 2, hair: 3, hairDk: 4, hairLt: 5, robe: 6, robeDk: 7, robeLt: 8, sash: 9, sashDk: 10,
    wrap: 11, sandal: 12, strap: 13, white: 14, black: 15, mouth: 16, collar: 17, shadow: 18, sole: 19, throat: 20
  };
  const PALETTE = ["#d4945a", "#b0703c", "#e6ad78", "#2a2124", "#1b1517", "#3d3134", "#3b3444", "#29232f", "#4b4456", "#d3c3a2", "#aa977a",
    "#1d1a1c", "#8a5a32", "#d3c3a2", "#f4f0e6", "#141212", "#5a2418", "#5c546a", "#17131b", "#5e3c22", "#2a0c08"];
  // Furious, his face goes red: the same cells under a palette with the skin flushed.
  const FLUSHED = PALETTE.slice();
  FLUSHED[C.skin] = "#e2664c"; FLUSHED[C.skinDk] = "#b8412c"; FLUSHED[C.skinLt] = "#f08a6c";
  // A cell's own small variation, hashed from where it is, never drawn from a random stream.
  const hv = (x, y, z) => ((Math.imul(x + 31, 73856093) ^ Math.imul(y + 17, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 9;
  const skin = (x, y, z) => (hv(x, y, z) === 0 ? C.skinDk : C.skin);
  const hair = (x, y, z) => { const r = hv(x, y, z); return r < 2 ? C.hairDk : r === 8 ? C.hairLt : C.hair; };
  // Kimono cloth: folds running down it and a little wear.
  const cloth = (x, y, z) => (x % 4 === 1 ? C.robeDk : hv(x, y, z) === 0 ? C.robeLt : C.robe);
  const pleat = (x, y, z) => (x % 2 ? C.robeDk : hv(x, y, z) === 0 ? C.robe : C.shadow);
  const vg = (v, ox, oy, oz, palette = PALETTE) => characterGeometry(voxelGeometry(v, { unit: U, palette, origin: { x: ox * U, y: oy * U, z: oz * U } }));

  // The head, fourteen cells across, its base on the neck and its face toward +z: a messy black crop with a topknot,
  // heavy brows slanting to a scowl over narrowed eyes, a broad nose, a drooping moustache over a down-turned mouth, a
  // short beard along the jaw to a point, and ears showing under the hair. `closed` draws the blink, `talk` the mouth
  // dropped open into the beard with his teeth showing.
  const headVox = (closed, talk) => {
    const v = makeVox();
    v.fill(1, 12, 0, 10, 1, 11, skin);
    v.fill(3, 10, 0, 2, 12, 12, C.skin);
    for (const x of [0, 13]) { v.fill(x, x, 4, 6, 5, 7, C.skin); v.set(x, 5, 6, C.skinDk); }
    // Hair: two layers down the back, over the temples, the crown to the hairline, and spikes standing off the top.
    v.fill(0, 13, 3, 12, 0, 0, hair);
    v.fill(1, 12, 4, 12, -1, -1, hair);
    v.fill(0, 0, 7, 12, 0, 10, hair);
    v.fill(13, 13, 7, 12, 0, 10, hair);
    v.fill(0, 13, 11, 12, 0, 12, hair);
    for (let x = 0; x <= 13; x++) for (let z = -1; z <= 12; z++) {
      const r = hv(x, 13, z);
      if (r < 5) v.set(x, 13, z, hair(x, 13, z));
      if (r < 2 && x > 0 && x < 13) v.set(x, 14, z, hair(x, 14, z));
    }
    v.fill(0, 3, 9, 10, 12, 12, hair);
    v.fill(10, 13, 9, 10, 12, 12, hair);
    v.fill(0, 1, 2, 8, 8, 11, hair);
    v.fill(12, 13, 2, 8, 8, 11, hair);
    // The topknot: a bound stalk, its dark tie, and the knot itself, rounded at its corners.
    v.fill(5, 8, 13, 14, 4, 7, hair);
    v.fill(5, 8, 15, 15, 4, 7, C.hairDk);
    for (let y = 16; y <= 18; y++) for (let x = 4; x <= 9; x++) for (let z = 3; z <= 8; z++) if (!((x === 4 || x === 9) && (z === 3 || z === 8))) v.set(x, y, z, hair(x, y, z));
    v.fill(5, 8, 19, 19, 4, 7, hair);
    v.fill(6, 7, 20, 20, 5, 6, C.hairDk);
    // Brows, standing proud of the face and slanting down to a crease between them.
    v.fill(2, 4, 8, 8, 12, 12, C.hairDk);
    v.fill(3, 5, 7, 7, 12, 12, C.hairDk);
    v.fill(9, 11, 8, 8, 12, 12, C.hairDk);
    v.fill(8, 10, 7, 7, 12, 12, C.hairDk);
    v.fill(6, 7, 7, 8, 11, 11, C.skinDk);
    // Eyes, narrowed and glaring in; the lids and the shadow under them.
    for (const [x0, x1, pupil] of [[3, 5, 5], [8, 10, 8]]) {
      for (let x = x0; x <= x1; x++) {
        v.set(x, 6, 11, closed ? C.skin : x === pupil ? C.black : C.white);
        v.set(x, 5, 11, closed ? C.skinDk : x === pupil ? C.black : C.white);
        v.set(x, 4, 11, C.skinDk);
      }
    }
    // The nose, its tip and nostrils.
    v.fill(6, 7, 3, 6, 12, 12, C.skinLt);
    v.fill(6, 7, 3, 4, 13, 13, C.skin);
    v.set(6, 3, 13, C.skinDk);
    v.set(7, 3, 13, C.skinDk);
    // The moustache drooping past the mouth, and the beard from the jaw to a point.
    v.fill(3, 10, 2, 2, 12, 12, C.hair);
    for (const x of [3, 4, 9, 10]) v.set(x, 1, 12, C.hair);
    v.fill(5, 8, 1, 1, 12, 12, C.mouth);
    v.fill(2, 11, 0, 0, 9, 12, hair);
    v.fill(2, 11, -1, -1, 8, 12, hair);
    v.fill(3, 10, -2, -2, 8, 12, hair);
    v.fill(4, 9, -3, -3, 9, 12, hair);
    v.fill(5, 8, -4, -4, 10, 12, hair);
    v.fill(1, 1, 0, 3, 8, 11, hair);
    v.fill(12, 12, 0, 3, 8, 11, hair);
    if (talk) {
      v.fill(5, 8, -1, 1, 12, 12, C.throat);
      v.fill(5, 8, 1, 1, 12, 12, C.white);
      v.fill(6, 7, -1, -1, 12, 12, C.mouth);
    }
    return v;
  };
  // The body, sixteen cells across from the hip up: a dark kimono with folds, crossed at the chest over a V of skin
  // with its lapels standing proud, and the pale sash round the waist, knotted at the front with its tails hanging.
  const torsoVox = () => {
    const v = makeVox();
    v.fill(0, 15, 0, 11, 0, 9, cloth);
    v.fill(2, 13, 12, 12, 1, 8, cloth);
    for (const [x0, x1, y] of [[5, 10, 12], [6, 9, 11], [7, 8, 10]]) v.fill(x0, x1, y, y, 9, 9, C.skin);
    for (const [x, y] of [[3, 12], [4, 12], [4, 11], [5, 11], [5, 10], [6, 10], [6, 9], [7, 9], [7, 8], [8, 8],
      [12, 12], [11, 12], [11, 11], [10, 11], [10, 10], [9, 10], [9, 9], [8, 9], [8, 7], [9, 7]]) {
      v.set(x, y, 9, C.collar);
      v.set(x, y, 10, C.collar);
    }
    for (let i = 0; i < 4; i++) v.set(9 + Math.floor(i / 2), 3 - i, 9, C.robeDk);
    v.fill(0, 15, 4, 6, 0, 9, (x, y) => (y === 5 ? C.sashDk : C.sash));
    v.fill(2, 13, 4, 6, 10, 10, (x, y) => (y === 5 ? C.sashDk : C.sash));
    v.fill(6, 9, 4, 7, 11, 11, C.sash);
    v.fill(7, 8, 5, 6, 12, 12, C.sashDk);
    v.set(5, 6, 11, C.sash);
    v.set(10, 6, 11, C.sash);
    v.fill(6, 7, 0, 3, 11, 11, C.sash);
    v.fill(8, 9, 1, 3, 11, 11, C.sashDk);
    return v;
  };
  // An arm in two pieces jointed at the elbow. The upper arm is the wide kimono sleeve from the shoulder to below the
  // elbow, dark inside its mouth, with its pouch hanging at the back; the forearm comes out of it to a dark wrist wrap
  // and the fist.
  const upperVox = () => {
    const v = makeVox();
    v.fill(0, 6, 8, 17, 0, 6, cloth);
    v.fill(0, 6, 8, 8, 0, 6, C.robeDk);
    v.fill(2, 4, 8, 8, 2, 4, C.shadow);
    v.fill(0, 6, 5, 7, 0, 1, cloth);
    v.fill(0, 6, 5, 5, 0, 1, C.robeDk);
    return v;
  };
  const foreVox = () => {
    const v = makeVox();
    v.fill(2, 4, 5, 8, 2, 4, skin);
    v.fill(1, 5, 3, 4, 1, 5, C.wrap);
    v.fill(1, 5, 0, 2, 1, 5, skin);
    v.fill(1, 5, 2, 2, 5, 5, C.skinDk);
    v.set(5, 1, 4, C.skinLt);
    return v;
  };
  // The hakama, wide and pleated: a thigh from the hip to the knee, and a shin to the ankle over a straw sandal.
  const thighVox = () => {
    const v = makeVox();
    v.fill(0, 6, 0, 5, 0, 6, pleat);
    return v;
  };
  const shinVox = () => {
    const v = makeVox();
    v.fill(0, 6, 2, 6, 0, 6, pleat);
    v.fill(-1, 7, 2, 2, -1, 7, C.robeDk);
    v.fill(2, 4, 1, 1, 2, 4, C.wrap);
    v.fill(1, 5, 0, 0, 0, 8, C.sole);
    v.fill(1, 5, 1, 1, 7, 8, skin);
    v.fill(1, 5, 1, 1, 5, 5, C.strap);
    v.set(3, 1, 6, C.strap);
    return v;
  };
  // The katana at his left hip, made round, in two pieces: the black scabbard bowed a little with its gold fittings,
  // and the sword in it, a gold guard and collar, a gold grip bound in dark diamonds with its cap, and a steel blade
  // bowed the same way, so it lies hidden in the scabbard until he draws it. Both are built along +y, the grip's end
  // up and the guard at 0.
  const SCABBARD = "#1d1a1c", GOLD = "#e8b23a", GOLD_DK = "#a87a22", HILT_DK = "#24180e";
  const STEEL = "#d6e0e8", STEEL_DK = "#97a3ae", EDGE = "#ffffff";
  const BOW = 0.035, SHEATH = [-0.66, -0.02];
  // Built at a real katana's size against his hip, then made bigger, as a toon's sword is.
  const BLADE_SCALE = 1.35;
  const grown = (g) => { for (let i = 0; i < g.verts.length; i++) g.verts[i] *= BLADE_SCALE; return g; };
  const bowAt = (y) => BOW * Math.sin(Math.PI * (y - SHEATH[0]) / (SHEATH[1] - SHEATH[0]));
  const scabbard = cached(() => characterGeometry(grown(shaded([
    tube({ path: (t) => { const y = SHEATH[0] + (SHEATH[1] - SHEATH[0]) * t; return { x: bowAt(y), y, z: 0 }; }, radius: () => 0.034, rings: 10, segments: 10, colorFn: () => SCABBARD }),
    turn([[0, -0.685], [0.036, -0.675], [0.038, -0.62], [0, -0.62]], 12, GOLD),
    turn([[0.038, -0.045], [0.041, -0.022], [0.038, 0]], 12, GOLD_DK)
  ]))));
  // The blade: a lens of steel along the bow from the collar to the point, its spine to -x and its edge to +x, the
  // ridge line between them, the temper line pale toward the edge, and the point curving in to the spine. Flat
  // faces, lit a little, so a glint can catch it.
  const blade = () => {
    const g = geometry(), N = 14, y0 = -0.026, y1 = -0.636, rings = [], opts = { emissive: 0.32 };
    const steel = BL.math.hexToRgb(STEEL), dark = BL.math.hexToRgb(STEEL_DK), edge = BL.math.hexToRgb(EDGE);
    for (let i = 0; i <= N; i++) {
      const s = i / N, y = y0 + (y1 - y0) * s, cx = bowAt(y);
      if (i === N) { rings.push(pushVert(g, cx - 0.014, y, 0)); break; }
      const W = 0.054 - 0.014 * s, T = 0.012 - 0.003 * s, k = s > 0.82 ? (s - 0.82) / 0.18 : 0, f = 1 - k * k, ax = cx - W / 2;
      const P = [[0, T * 0.3], [0.35 * W, T / 2], [0.68 * W, T * 0.32], [W, 0], [0.68 * W, -T * 0.32], [0.35 * W, -T / 2], [0, -T * 0.3]];
      rings.push(P.map(([px, pz]) => pushVert(g, ax + px * f, y, pz * f)));
    }
    const tone = [dark, steel, edge, edge, steel, dark, dark];
    for (let i = 0; i < N; i++) {
      const a = rings[i], b = rings[i + 1];
      for (let k = 0; k < 7; k++) {
        const k2 = (k + 1) % 7;
        face(g, i === N - 1 ? [a[k], b, a[k2]] : [a[k], b[k], b[k2], a[k2]], tone[k], opts);
      }
    }
    face(g, rings[0].slice(), steel, opts);
    return g;
  };
  const sword = cached(() => {
    const round = [
      turn([[0, 0.002], [0.076, 0.004], [0.076, 0.022], [0, 0.024]], 16, GOLD),
      turn([[0, -0.034], [0.03, -0.034], [0.032, 0], [0, 0.002]], 10, GOLD_DK),
      tube({ path: (t) => ({ x: 0, y: 0.026 + 0.248 * t, z: 0 }), radius: () => 0.026, rings: 4, segments: 10, colorFn: () => GOLD }),
      turn([[0.028, 0.27], [0.029, 0.285], [0.02, 0.296], [0, 0.298]], 12, GOLD_DK)
    ];
    const flat = [blade()];
    for (const y of [0.06, 0.11, 0.16, 0.21, 0.255]) for (const z of [-1, 1]) flat.push(moved(turnedZ(box({ w: 0.028, h: 0.028, d: 0.008, color: HILT_DK }), Math.PI / 4), 0, y, z * 0.025));
    return characterGeometry(grown(shaded(round, flat)));
  });
  // Where the katana hangs from his hip, its turn at rest and turned ready to draw (its grip across his belly, where
  // his right hand reaches it), where each hand holds the grip from the guard, the point's reach from the right, and
  // where his left hand steadies the scabbard.
  const KATANA = { x: 8.6 * U, y: 5 * U, z: 0, rest: [1.15, 0.18, -0.12], readyX: 5.2 * U, ready: [1.2, -0.88, 0],
    hold: 0.07 * BLADE_SCALE, hold2: 0.19 * BLADE_SCALE, tip: 0.705 * BLADE_SCALE, scab: -0.1 * BLADE_SCALE };
  const geometries = cached(() => ({
    headOpen: vg(headVox(false, false), -7, 0, -6.5),
    headClosed: vg(headVox(true, false), -7, 0, -6.5),
    headTalk: vg(headVox(false, true), -7, 0, -6.5),
    redOpen: vg(headVox(false, false), -7, 0, -6.5, FLUSHED),
    redClosed: vg(headVox(true, false), -7, 0, -6.5, FLUSHED),
    redTalk: vg(headVox(false, true), -7, 0, -6.5, FLUSHED),
    torso: vg(torsoVox(), -8, 0, -5),
    upper: vg(upperVox(), -3.5, -17.5, -3.5),
    fore: vg(foreVox(), -3.5, -8.5, -3.5),
    thigh: vg(thighVox(), -3.5, -5.5, -3.5),
    shin: vg(shinVox(), -3.5, -6.5, -3.5)
  }));
  // A fresh rig over the shared geometry: the root at his hip, the head on its neck, arms from the shoulders jointed at
  // the elbow, legs jointed at the knee, and the katana's two pieces turned by quaternions. `ARM` is the length from
  // shoulder to elbow and from elbow to the middle of the fist, for his arms' two-bone reach.
  const ARM = { upper: 9 * U, fore: 7 * U };
  const rig = () => {
    const G = geometries(), root = createNode();
    const torso = createNode({ geometry: G.torso });
    const head = createNode({ position: { x: 0, y: 12 * U, z: 0.3 * U }, geometry: G.headOpen });
    const arm = (side) => createNode({ position: { x: side * 10 * U, y: 11 * U, z: 0 }, rotation: { x: -0.2, y: 0, z: side * 0.08 }, geometry: G.upper });
    const fore = () => createNode({ position: { x: 0, y: -ARM.upper, z: 0 }, geometry: G.fore });
    const thigh = (side) => createNode({ position: { x: side * 4 * U, y: 0, z: 0 }, geometry: G.thigh });
    const shin = () => createNode({ position: { x: 0, y: -5 * U, z: 0 }, geometry: G.shin });
    const parts = { torso, head, armR: arm(-1), armL: arm(1), foreR: fore(), foreL: fore(), legR: thigh(-1), legL: thigh(1), shinR: shin(), shinL: shin() };
    // His left is +x, facing +z; the katana slung there, its grip forward and up.
    const hang = (geometry) => createNode({ position: { x: KATANA.x, y: KATANA.y, z: KATANA.z }, quaternion: Q.fromEuler(Q.create(), ...KATANA.rest), geometry });
    parts.katana = hang(scabbard());
    parts.sword = hang(sword());
    addChild(parts.armR, parts.foreR);
    addChild(parts.armL, parts.foreL);
    addChild(parts.legR, parts.shinR);
    addChild(parts.legL, parts.shinL);
    addChild(root, torso, parts.legR, parts.legL, parts.armR, parts.armL, head, parts.katana, parts.sword);
    return { root, parts, headOpen: G.headOpen, headClosed: G.headClosed, headTalk: G.headTalk, redOpen: G.redOpen, redClosed: G.redClosed, redTalk: G.redTalk, ARM };
  };

  // ---- the switchboard ----------------------------------------------------------------------------------------

  const WOOD = "#7a4a26", WOOD_DK = "#4a2c16", WOOD_LT = "#9a6234", PANEL = "#24150d", BRASS = "#c9a24a", BRASS_DK = "#8f6c2a", HOLE = "#0c0908";
  const STRIP = "#e8dcc0", LAMP = "#ffb21c", RED = "#c8321e", RED_DK = "#8a1f12", BLACK = "#1e1a1a", PAPER = "#efdfb0", IRON = "#2a2a2a";
  const PAGES = "#efe4c4", GILT = "#d9a93a", CREAM = "#efe6d2", YELLOW = "#e8b52a";
  // The board: jacks on a grid over the whole face, `cols` across `pitch` apart and `rows` up from `y0`, each with its
  // lamp just above. The middle `active` columns of the lowest `activeRows` rows are the ones Kortik can reach from
  // his stool, and the ones he works; `active` shares the parity of `cols`, so they sit in the middle of the grid. The
  // shelf in front carries the cords' plugs in a row and a key behind each, over his kneehole; the desk's wings either
  // side of him, from `wingIn` out, come `wing` from the board.
  const BOARD = {
    half: 2.8, top: 3.4, depth: 0.38, shelf: 0.745, shelfDepth: 0.5, knee: 0.66, wingIn: 0.95, wing: 0.95,
    cols: 21, rows: 10, pitch: 0.25, rowPitch: 0.22, y0: 0.98, lamp: 0.09,
    active: 7, activeRows: 3,
    cords: 10, cordPitch: 0.15, plugZ: 0.16, keyZ: 0.34, black: [2, 6, 8], patched: 18, cordR: 0.026,
    seat: { y: 0.62, z: FM.KORTIK.seat },
    sign: { y: 4.35, z: 0.08, height: 1.1 }
  };
  const DESK = BOARD.shelf + 0.03;
  // Where the mug stands on the desk, and the logbook lies open.
  const MUG = { x: -1.2, z: 0.62 }, LOG = { x: -1.88, y: DESK + 0.028, z: 0.68, ang: 0.12, w: 0.33, h: 0.2 };
  const jackX = (c) => (c - (BOARD.cols - 1) / 2) * BOARD.pitch, jackY = (r) => BOARD.y0 + r * BOARD.rowPitch;
  const cordX = (i) => (i - (BOARD.cords - 1) / 2) * BOARD.cordPitch;
  // The desk's depth from the board at x: the shelf over his knees, the wings either side.
  const deskDepth = (x) => (Math.abs(x) < BOARD.wingIn ? BOARD.shelfDepth : BOARD.wing);
  // The active jacks, lowest row first, as indices into the whole grid (row * cols + col).
  const ACTIVE = [];
  for (let r = 0; r < BOARD.activeRows; r++) for (let c = 0; c < BOARD.active; c++) ACTIVE.push(r * BOARD.cols + (BOARD.cols - BOARD.active) / 2 + c);
  // A plug, turned and standing on its tip at y 0: a brass tip and ring, a fat sleeve in the cord's colour with grip
  // rings, and a tapering boot where the cord leaves it at PLUG. A hand holds it round the sleeve, GRIP up from the tip.
  // The board's own plugs, out of his reach and never handled, are turned plainer, without the grip rings.
  const PLUG = 0.17, GRIP = 0.06;
  const plugParts = (color, dark, fine = true) => {
    const n = fine ? 10 : 8, out = [
      turn([[0, -0.065], [0.011, -0.06], [0.011, -0.035], [0.015, -0.032], [0.011, -0.028], [0.011, -0.012], [0, -0.012]], n, BRASS),
      turn([[0, -0.012], [0.02, -0.012], [0.022, 0], [0, 0]], n, BRASS_DK),
      turn([[0, 0], [0.034, 0.004], [0.037, 0.02], [0.037, 0.1], [0.034, 0.112], [0, 0.112]], fine ? 12 : 8, color),
      turn([[0, 0.112], [0.028, 0.112], [0.02, 0.15], [0.016, PLUG], [0, PLUG]], n, dark)
    ];
    if (fine) out.push(moved(torus(0.037, 0.005, dark, 0, 12, 6), 0, 0.04, 0), moved(torus(0.037, 0.005, dark, 0, 12, 6), 0, 0.075, 0));
    return out;
  };
  const plug = (color, dark) => shaded(plugParts(color, dark));
  // A paper canvas in a hand-lettered face, as a flat face `w` by `h` facing +z.
  const NOTE_FONT = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
  const paperFace = (canvas, w, h) => {
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const x = w / 2, y = h / 2;
    const out = { verts: [-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0], faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false };
    out.imageSurface = { asset: { width: canvas.width, height: canvas.height, load: () => image }, rect: [-x, -y, w, h] };
    return out;
  };
  // A paper note pinned to the board, its lines centred, with a red pin and an underline.
  const note = (lines, size = 0.42) => {
    const S = 256, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = canvas.height = S;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, S, S);
    g.fillStyle = "rgba(120, 90, 40, 0.18)";
    g.fillRect(0, S - 18, S, 18);
    g.fillStyle = "#b8322a";
    g.beginPath(); g.arc(S / 2, 18, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2018";
    g.textAlign = "center"; g.textBaseline = "middle";
    const px = lines.length > 3 ? 38 : 46;
    g.font = `${px}px ${NOTE_FONT}`;
    const y0 = S / 2 - (lines.length - 1) * px * 0.55 + 8;
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], S / 2, y0 + i * px * 1.1);
    g.strokeStyle = "#c0392b"; g.lineWidth = 4;
    const last = y0 + (lines.length - 1) * px * 1.1 + px * 0.55;
    g.beginPath(); g.moveTo(S * 0.28, last); g.lineTo(S * 0.72, last - 4); g.stroke();
    return paperFace(canvas, size, size);
  };
  // His routing log lying open: ruled pages, a column of patches crossed out and done again, and a doodle.
  const logbook = () => {
    const W = 256, H = 156, canvas = document.createElement("canvas"), g = canvas.getContext("2d");
    canvas.width = W; canvas.height = H;
    for (const [x0, tint] of [[0, "#f3e9cc"], [W / 2, "#efe3c2"]]) { g.fillStyle = tint; g.fillRect(x0, 0, W / 2, H); }
    g.fillStyle = "rgba(90, 60, 20, 0.22)"; g.fillRect(W / 2 - 6, 0, 12, H);
    g.strokeStyle = "rgba(70, 110, 160, 0.45)"; g.lineWidth = 1;
    for (let y = 30; y < H - 6; y += 15) { g.beginPath(); g.moveTo(8, y); g.lineTo(W / 2 - 10, y); g.moveTo(W / 2 + 10, y); g.lineTo(W - 8, y); g.stroke(); }
    g.fillStyle = "#2a2018"; g.textBaseline = "alphabetic";
    g.font = `bold 15px ${NOTE_FONT}`;
    g.fillText("ROUTING LOG", 12, 22);
    g.font = `13px ${NOTE_FONT}`;
    const left = ["ch 7 -> ch 12", "ch 3 -> ch 5", "ch 9 -> ch 2", "ch 3 -> ch 5", "rebal. AGAIN"], right = ["ch 4 -> ch 11", "fee: 1 sat", "WHY", "ch 11 -> ch 4", "plug. unplug."];
    left.forEach((t, i) => g.fillText(t, 12, 43 + i * 15));
    right.forEach((t, i) => g.fillText(t, W / 2 + 14, 28 + i * 15));
    g.strokeStyle = "#c0392b"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, 54); g.lineTo(96, 50); g.stroke();
    g.fillStyle = "#e8a417";
    g.beginPath(); g.moveTo(206, 104); g.lineTo(190, 124); g.lineTo(200, 124); g.lineTo(192, 144); g.lineTo(214, 118); g.lineTo(203, 118); g.lineTo(212, 104); g.closePath(); g.fill();
    return paperFace(canvas, LOG.w, LOG.h);
  };
  // Where each note is pinned and how far it leans.
  const NOTES = [
    { lines: ["plug.", "unplug.", "repeat."], x: -2.05, y: 2.45, tilt: 0.06 },
    { lines: ["More", "channels?", "Really?"], x: 1.95, y: 2.55, tilt: -0.05 },
    { lines: ["Lightning", "is just a", "switchboard", "with extra", "steps."], x: 2.05, y: 1.5, tilt: 0.04, size: 0.5 }
  ];
  // What stands against the board on the desk, by the reach of the board it covers: [x0, x1, top]. No patch cord
  // is plugged in behind these or laid down across them.
  const COVERS = [[-2.78, -2.3, DESK + 0.29], [-1.95, -1.45, DESK + 0.4], [-1.4, -1.0, DESK + 0.15], [1.08, 1.32, DESK + 0.26], [2.1, 2.45, DESK + 0.15]];

  // A hardback lying flat, its spine to +z: boards a little proud of the page block, a round spine with two gilt
  // bands round it, turned `ang` about its middle and laid at (x, y, z).
  const book = (round, flat, x, y, z, ang, len, thick, width, color) => {
    const r = thick / 2, board = 0.007, sz = width / 2 - r * 0.5, at = (g) => moved(turnedY(g, ang), x, y, z);
    flat.push(at(box({ w: len, h: board, d: width, color, offset: { y: board / 2 } })), at(box({ w: len, h: board, d: width, color, offset: { y: thick - board / 2 } })));
    flat.push(at(box({ w: len - 0.014, h: thick - board * 2, d: width - 0.02, color: PAGES, offset: { y: thick / 2, z: -0.004 } })));
    round.push(at(moved(turnedZ(turn([[0, 0], [r, 0], [r, len], [0, len]], 10, color), -Math.PI / 2), -len / 2, r, sz)));
    for (const b of [-0.32, 0.32]) round.push(at(moved(turnedZ(torus(r + 0.0012, 0.0026, GILT, 0, 10, 4), Math.PI / 2), b * len, r, sz)));
  };
  // A hardback standing on its tail, spine to +z, `thick` across.
  const upright = (round, flat, x, z, ang, tall, thick, width, color) => {
    const r = thick / 2, board = 0.007, sz = width / 2 - r * 0.5, at = (g) => moved(turnedY(g, ang), x, DESK, z);
    for (const s of [-1, 1]) flat.push(at(box({ w: board, h: tall, d: width, color, offset: { x: s * (r - board / 2), y: tall / 2 } })));
    flat.push(at(box({ w: thick - board * 2, h: tall - 0.012, d: width - 0.02, color: PAGES, offset: { y: tall / 2, z: -0.004 } })));
    round.push(at(moved(turn([[0, 0], [r, 0], [r, tall], [0, tall]], 10, color), 0, 0, sz)));
    for (const b of [0.18, 0.82]) round.push(at(moved(torus(r + 0.0012, 0.0026, GILT, 0, 10, 4), 0, b * tall, sz)));
  };
  // Hand tools, built standing on their tips at y 0: a screwdriver with a fluted handle, a pencil, a hammer.
  const screwdriver = (color) => merge(
    turn([[0, 0], [0.004, 0.003], [0.004, 0.095], [0, 0.095]], 6, "#9aa3ab"),
    turn([[0, 0.088], [0.011, 0.09], [0.015, 0.104], [0.015, 0.162], [0.012, 0.176], [0, 0.18]], 10, color),
    moved(torus(0.0152, 0.0028, "#1a1414", 0, 10, 4), 0, 0.118, 0), moved(torus(0.0152, 0.0028, "#1a1414", 0, 10, 4), 0, 0.146, 0)
  );
  const pencil = () => merge(
    turn([[0, 0], [0.0025, 0.004], [0.006, 0.02], [0.006, 0.15], [0, 0.15]], 6, YELLOW),
    turn([[0, 0], [0.0025, 0.004], [0, 0.004]], 6, "#2a2a2a"),
    turn([[0.0062, 0.15], [0.0062, 0.162], [0, 0.163]], 8, "#e58fa0")
  );
  const hammer = () => merge(
    turn([[0, 0], [0.011, 0.004], [0.012, 0.2], [0, 0.205]], 8, "#b07a44"),
    moved(bevelBox({ w: 0.1, h: 0.034, d: 0.034, color: "#3a3e44" }), 0.012, 0.2, 0)
  );
  const pliers = () => {
    const out = [];
    for (const s of [-1, 1]) out.push(tube({ path: (t) => ({ x: s * (0.004 + 0.02 * t * t), y: 0.17 * t, z: 0 }), radius: (t) => (t > 0.45 ? 0.008 : 0.005), rings: 6, segments: 6, colorFn: (t) => (t > 0.45 ? RED : "#7e868e") }));
    return merge(...out);
  };
  // A carpenter's tote: a floor, low sides, end boards peaked for its dowel handle, and tools standing in it.
  const tote = (round, flat, x, z) => {
    const w = 0.44, d = 0.19, y = DESK;
    flat.push(box({ w, h: 0.016, d, color: WOOD, offset: { x, y: y + 0.008, z } }));
    for (const s of [-1, 1]) flat.push(box({ w, h: 0.11, d: 0.014, color: WOOD, offset: { x, y: y + 0.055, z: z + s * (d / 2 - 0.007) } }));
    for (const s of [-1, 1]) flat.push(moved(turnedY(prism([[-d / 2, 0], [d / 2, 0], [d / 2, 0.13], [0, 0.23], [-d / 2, 0.13]], 0.02, WOOD_DK), Math.PI / 2), x + s * (w / 2 - 0.01), y, z));
    round.push(moved(turnedZ(turn([[0, 0], [0.012, 0], [0.012, w - 0.02], [0, w - 0.02]], 8, WOOD_LT), -Math.PI / 2), x - w / 2 + 0.01, y + 0.2, z));
    round.push(along(screwdriver(RED), x - 0.15, y + 0.01, z - 0.04, -0.18, 1, -0.1), along(screwdriver(YELLOW), x - 0.08, y + 0.01, z + 0.04, -0.05, 1, 0.12));
    round.push(along(screwdriver(BLACK), x + 0.08, y + 0.01, z - 0.03, 0.1, 1, -0.16), along(pliers(), x + 0.15, y + 0.01, z + 0.04, 0.22, 1, 0.08));
    round.push(along(hammer(), x - 0.02, y + 0.01, z - 0.02, 0.12, 1, 0.05), along(pencil(), x + 0.03, y + 0.01, z + 0.05, -0.2, 1, 0.2), along(screwdriver(RED), x + 0.02, y + 0.01, z + 0.05, 0.05, 1, 0.2));
  };
  // A stack of loose sheets, each a little askew, with a black clip on top and a pencil laid over it.
  const papers = (round, flat, x, y, z, ang, n, w = 0.22, d = 0.3) => {
    for (let i = 0; i < n; i++) flat.push(moved(turnedY(box({ w, h: 0.004, d, color: i % 3 === 1 ? "#f6f1e2" : PAPER, offset: { y: 0.002 } }), ang + Math.sin(i * 2.7) * 0.08), x + Math.sin(i * 1.3) * 0.006, y + i * 0.0045, z));
    const top = y + n * 0.0045;
    flat.push(moved(turnedY(box({ w: 0.05, h: 0.012, d: 0.03, color: "#151515", offset: { y: 0.006, z: -d / 2 + 0.02 } }), ang), x, top, z));
    round.push(moved(turnedY(tube({ path: (t) => ({ x: -0.02 + 0.04 * t, y: 0.014, z: -d / 2 + 0.035 + Math.sin(Math.PI * t) * 0.012 }), radius: () => 0.0018, rings: 6, segments: 5, colorFn: () => "#b8bec4" }), ang), x, top, z));
    round.push(moved(turnedY(turnedZ(pencil(), -Math.PI / 2), ang + 0.5), x - 0.07, top + 0.006, z + 0.03));
  };
  // His mug: thick cream stoneware with a round handle, half full of black coffee, a lightning bolt on its face in
  // gold edged dark, wrapped round its curve. Its own geometry, so it can jump when he thumps the desk.
  const mug = cached(() => {
    const R = 0.068, H = 0.15;
    const round = [
      turn([[0, 0], [R - 0.008, 0], [R - 0.002, 0.004], [R, 0.016], [R + 0.002, H - 0.012], [R, H], [R - 0.01, H], [R - 0.011, H - 0.012], [R - 0.011, 0.02], [0, 0.02]], 20, CREAM),
      lathe({ profile: [[R - 0.011, H - 0.032], [0, H - 0.032]], segments: 20, color: "#3b2416" }),
      tube({ path: (t) => { const a = -Math.PI / 2 + Math.PI * t; return { x: R - 0.006 + 0.048 * Math.cos(a), y: H * 0.52 + 0.046 * Math.sin(a), z: 0 }; }, radius: () => 0.012, rings: 14, segments: 8, colorFn: () => CREAM })
    ];
    // Two convex pieces make the bolt: the bar slanting down from the top, and the spike to the point.
    const BOLT = [[[-0.022, 0], [0.006, 0], [0.024, 0.056], [0.004, 0.056]], [[-0.012, -0.058], [0.022, 0.006], [-0.006, 0.006]]];
    const wrap = (g, z) => {
      const v = g.verts;
      for (let i = 0; i < v.length; i += 3) v[i + 2] += z + Math.sqrt(Math.max(0, R * R - v[i] * v[i])) - R;
      return g;
    };
    const flat = [];
    for (const [scale, depth, color, glow, z] of [[1.32, 0.004, "#2a1c0e", 0, R + 0.0012], [1, 0.005, "#ffc21a", 0.35, R + 0.0034]]) {
      for (const piece of BOLT) flat.push(wrap(moved(prism(piece.map(([x, y]) => [x * scale, y * scale]), depth, color, glow), 0, H * 0.5, 0), z));
    }
    return shaded(round, flat);
  });
  // A crate of rough planks: a body, darker slats round it and its corner posts.
  const crate = (flat, x, y, z, s, ang, color) => {
    const at = (g) => moved(turnedY(g, ang), x, y, z);
    flat.push(at(bevelBox({ w: s, h: s, d: s, color, bevel: 0.02, offset: { y: s / 2 } })));
    for (const h of [0.22, 0.72]) for (const [w, d] of [[s + 0.012, s * 0.96], [s * 0.96, s + 0.012]]) flat.push(at(box({ w, h: s * 0.1, d, color: WOOD_DK, offset: { y: s * h } })));
  };
  // A coil of cord, lying in loops.
  const coil = (round, x, y, z, r, n) => {
    for (let i = 0; i < n; i++) round.push(moved(torus(r - i * 0.012, 0.02, i % 3 === 2 ? BLACK : RED, 0, 16, 6), x + Math.sin(i) * 0.01, y + 0.02 + i * 0.036, z + Math.cos(i * 1.7) * 0.01));
  };

  const station = cached(() => {
    const B = BOARD, parts = [], round = [], glass = [], half = B.half;
    // The cabinet: a dark face in a timber border between posts at its ends, which run up to carry the sign, under a
    // cornice. The face is laid in tiles and the border in short lengths, so the Canvas 2D renderer's depth sort keeps
    // the jacks in front of them; the posts, cornice and desk close the case in.
    const faceW = half * 2 - 0.2, faceY0 = B.shelf + 0.03, faceH = B.top - faceY0;
    parts.push(moved(M.panel({ w: faceW, h: faceH, tilesX: 18, tilesY: 9, color: PANEL }), 0, faceY0 + faceH / 2, -0.014));
    for (let i = 0; i < 9; i++) {
      const x = (i - 4) * faceW / 9;
      for (const [y, h] of [[faceY0 + 0.06, 0.12], [B.top - 0.06, 0.12]]) parts.push(box({ w: faceW / 9, h, d: 0.03, color: WOOD_DK, offset: { x, y, z: -0.01 } }));
    }
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const h = (faceH - 0.24) / 5;
      parts.push(box({ w: 0.12, h, d: 0.03, color: WOOD_DK, offset: { x: s * (faceW / 2 - 0.06), y: faceY0 + 0.12 + h * (i + 0.5), z: -0.01 } }));
    }
    for (const s of [-1, 1]) {
      parts.push(bevelBox({ w: 0.2, h: B.top + 0.1, d: B.depth + 0.1, color: WOOD, offset: { x: s * (half + 0.02), y: (B.top + 0.1) / 2, z: -B.depth / 2 } }));
      parts.push(FM.beam(s * (half + 0.02), B.top, -0.1, s * (half + 0.02), 5.15, -0.1, 0.16, WOOD_DK));
    }
    // The iron arms the sign's lanterns hang from.
    for (const [along, up, out] of FM.KORTIK.hooks) parts.push(FM.beam(along, up, -0.1, along, up, out, 0.07, IRON));
    parts.push(FM.beam(-half - 0.1, 5.05, -0.1, half + 0.1, 5.05, -0.1, 0.12, WOOD_DK));
    parts.push(bevelBox({ w: half * 2 + 0.34, h: 0.22, d: B.depth + 0.18, color: WOOD, offset: { y: B.top + 0.11, z: -B.depth / 2 } }));
    parts.push(bevelBox({ w: half * 2 + 0.2, h: 0.08, d: B.depth + 0.1, color: WOOD_LT, offset: { y: B.top + 0.26, z: -B.depth / 2 } }));
    // The jacks: a turned brass bezel round a dark hole on every cell of the grid, a brass collar round each lamp, and a
    // paper designation strip under each row.
    const bezel = forwardLathe(turn([[0.024, 0], [0.044, 0], [0.048, 0.012], [0.042, 0.024], [0.024, 0.024], [0.024, 0.008]], 8, BRASS));
    const hole = forwardLathe(lathe({ profile: [[0.024, 0.008], [0, 0.008]], segments: 8, color: HOLE }));
    const collar = forwardLathe(torus(0.03, 0.006, BRASS_DK, 0, 8, 4));
    for (let r = 0; r < B.rows; r++) {
      const y = jackY(r);
      for (let c = 0; c < B.cols; c++) {
        const x = jackX(c);
        round.push(moved(merge(bezel), x, y, 0), moved(merge(hole), x, y, 0), moved(merge(collar), x, y + B.lamp, 0.004));
      }
      const sw = ((B.cols - 1) * B.pitch + 0.14) / 7;
      for (let i = 0; i < 7; i++) parts.push(box({ w: sw, h: 0.032, d: 0.006, color: STRIP, offset: { x: (i - 3) * sw, y: y - 0.075, z: 0.003 } }));
    }
    // The desk, a U round his stool: the shelf over his kneehole carries the plugs and keys, and the wings either side
    // come out further, each with a pedestal of drawers at its end, a leg at its inner corner and an open bay under it.
    const legH = B.shelf - 0.035, ped = 0.95, pedX = half - 0.05 - ped / 2;
    parts.push(bevelBox({ w: B.wingIn * 2, h: 0.06, d: B.shelfDepth + 0.08, color: WOOD_LT, offset: { y: B.shelf, z: B.shelfDepth / 2 } }));
    parts.push(box({ w: (pedX - ped / 2) * 2, h: legH - 0.02, d: 0.03, color: "#2a170b", offset: { y: (legH - 0.02) / 2, z: 0.02 } }));
    for (const s of [-1, 1]) {
      const ww = half - B.wingIn;
      parts.push(bevelBox({ w: ww, h: 0.07, d: B.wing + 0.04, color: WOOD_LT, offset: { x: s * (B.wingIn + ww / 2), y: B.shelf - 0.005, z: B.wing / 2 } }));
      parts.push(bevelBox({ w: ped, h: legH, d: B.wing - 0.04, color: WOOD_DK, offset: { x: s * pedX, y: legH / 2, z: B.wing / 2 - 0.01 } }));
      for (const y of [0.13, 0.36, 0.58]) {
        parts.push(bevelBox({ w: ped - 0.12, h: 0.18, d: 0.025, color: WOOD, bevel: 0.008, offset: { x: s * pedX, y, z: B.wing - 0.02 } }));
        round.push(moved(forwardLathe(turn([[0, 0], [0.024, 0.004], [0.028, 0.022], [0, 0.034]], 10, BRASS)), s * pedX, y, B.wing - 0.008));
      }
      parts.push(bevelBox({ w: 0.08, h: legH, d: 0.08, color: WOOD_DK, offset: { x: s * (B.wingIn + 0.05), y: legH / 2, z: B.wing - 0.05 } }));
      parts.push(box({ w: pedX - ped / 2 - B.wingIn - 0.09, h: 0.07, d: 0.03, color: WOOD, offset: { x: s * ((pedX - ped / 2 + B.wingIn + 0.09) / 2), y: legH - 0.035, z: B.wing - 0.03 } }));
      parts.push(box({ w: 0.035, h: legH - 0.02, d: B.shelfDepth - 0.04, color: WOOD_DK, offset: { x: s * (B.knee + 0.02), y: (legH - 0.02) / 2, z: B.shelfDepth / 2 } }));
    }
    for (let i = 0; i < B.cords; i++) {
      round.push(moved(lathe({ profile: [[0.032, 0.031], [0.026, 0.031], [0, 0.031]], segments: 10, color: HOLE }), cordX(i), B.shelf, B.plugZ));
      round.push(moved(turn([[0.034, 0.03], [0.038, 0.036], [0.032, 0.04]], 10, BRASS), cordX(i), B.shelf, B.plugZ));
      parts.push(box({ w: 0.07, h: 0.014, d: 0.1, color: IRON, offset: { x: cordX(i), y: B.shelf + 0.036, z: B.keyZ } }));
    }
    // The rest of the board is patched already: round cords plugged into jacks he cannot reach from his stool, hanging
    // under their own weight to another jack or down onto the desk, a plug in each jack; none behind what stands on
    // the desk against the board, and none laid down over the keys or across it.
    const rnd = BL.math.mulberry32(0x636f7264), reachable = new Set(ACTIVE);
    const covered = (x, y) => COVERS.some(([x0, x1, top]) => x > x0 - 0.12 && x < x1 + 0.12 && y < top + 0.25);
    const anyJack = () => {
      let idx;
      do idx = Math.floor(rnd() * B.cols * B.rows); while (reachable.has(idx) || covered(jackX(idx % B.cols), jackY(Math.floor(idx / B.cols))));
      return idx;
    };
    const plugged = (x, y, color, dark) => {
      for (const p of plugParts(color, dark, false)) round.push(moved(turnedX(p, Math.PI / 2), x, y, 0.012));
    };
    for (let i = 0; i < B.patched; i++) {
      const a = anyJack(), ax = jackX(a % B.cols), ay = jackY(Math.floor(a / B.cols)), black = rnd() < 0.22;
      const color = black ? BLACK : RED, dark = black ? "#0e0c0c" : RED_DK;
      let bx = ax * 0.7 + (rnd() - 0.5) * 0.6, by = B.shelf + 0.05, bz = 0.32;
      if (rnd() >= 0.5 || Math.abs(bx) < 0.85 || covered(bx, by)) {
        const b = anyJack();
        bx = jackX(b % B.cols); by = jackY(Math.floor(b / B.cols)); bz = PLUG + 0.012;
        plugged(bx, by, color, dark);
      }
      plugged(ax, ay, color, dark);
      const az = PLUG + 0.012, span = Math.hypot(bx - ax, by - ay), sag = 0.14 + 0.32 * span;
      const at = (t) => {
        const d = 4 * t * (1 - t), x = ax + (bx - ax) * t;
        let y = ay + (by - ay) * t - sag * d;
        const z = az + (bz - az) * t + 0.16 * d;
        if (z < deskDepth(x) + 0.06 && y < B.shelf + 0.06) y = B.shelf + 0.06;
        return { x, y, z };
      };
      round.push(tube({ path: at, radius: () => B.cordR, rings: 16, segments: 8, colorFn: () => color }));
    }

    // The left wing: a stack of books, more standing at the back by the post, his tote of tools, the logbook open
    // and the mug (its own node). Under it, the tomes that would not fit.
    for (const [y, len, thick, width, color, ang] of [[0, 0.36, 0.07, 0.27, "#2c3b5c", 0.06], [0.07, 0.33, 0.06, 0.25, "#6b3b22", -0.1],
      [0.13, 0.34, 0.055, 0.25, "#d2bf8e", 0.14], [0.185, 0.3, 0.06, 0.23, "#25424a", -0.05], [0.245, 0.28, 0.05, 0.21, "#7a2a26", 0.2]]) {
      book(round, parts, -2.36, DESK + y, 0.6, ang, len, thick, width, color);
    }
    let ux = -2.74;
    for (const [tall, thick, color, ang] of [[0.27, 0.055, "#5e3a7a", 0], [0.25, 0.06, "#2f5a8a", 0], [0.28, 0.05, "#8a3a2a", 0], [0.24, 0.065, "#3f5a34", -0.22]]) {
      upright(round, parts, ux + thick / 2, 0.17, ang, tall, thick, 0.19, color);
      ux += thick + (ang ? 0.012 : 0.002);
    }
    parts.push(box({ w: 0.012, h: 0.16, d: 0.12, color: IRON, offset: { x: ux + 0.02, y: DESK + 0.08, z: 0.17 } }), box({ w: 0.08, h: 0.008, d: 0.12, color: IRON, offset: { x: ux + 0.055, y: DESK + 0.004, z: 0.17 } }));
    tote(round, parts, -1.7, 0.16);
    for (const s of [-1, 1]) parts.push(moved(turnedY(bevelBox({ w: LOG.w / 2 + 0.01, h: 0.018, d: LOG.h + 0.02, color: "#5a2e1a", bevel: 0.006, offset: { x: s * LOG.w / 4, y: 0.009 } }), LOG.ang), LOG.x, DESK, LOG.z));
    for (const s of [-1, 1]) parts.push(moved(turnedY(box({ w: LOG.w / 2 - 0.006, h: 0.012, d: LOG.h - 0.004, color: PAGES, offset: { x: s * (LOG.w / 4 - 0.002), y: 0.021 } }), LOG.ang), LOG.x, DESK, LOG.z));
    for (const [y, len, thick, width, color, ang] of [[0, 0.4, 0.085, 0.3, "#3a2a24", 0.08], [0.085, 0.37, 0.08, 0.28, "#24324a", -0.12], [0.165, 0.38, 0.07, 0.27, "#5a5f66", 0.05], [0.235, 0.34, 0.075, 0.26, "#6b3b22", 0.18]]) {
      book(round, parts, -1.4, y, 0.46, ang, len, thick, width, color);
    }
    book(round, parts, -0.93, 0, 0.5, 0.55, 0.32, 0.07, 0.24, "#25424a");
    book(round, parts, -0.93, 0.07, 0.5, 0.4, 0.3, 0.06, 0.22, "#d2bf8e");
    // The right wing: the red telephone, his routing notes, a cup of pencils and a lantern; under it a crate of
    // spare cord.
    parts.push(bevelBox({ w: 0.28, h: 0.1, d: 0.24, color: RED, offset: { x: 2.25, y: DESK + 0.05, z: 0.55 } }));
    round.push(moved(tube({ path: (t) => ({ x: -0.15 + 0.3 * t, y: 0.05 * Math.sin(Math.PI * t), z: 0 }), radius: () => 0.026, rings: 8, segments: 8, colorFn: () => "#a82a18" }), 2.25, DESK + 0.13, 0.53));
    round.push(moved(forwardLathe(lathe({ profile: [[0.07, 0], [0.07, 0.012], [0, 0.012]], segments: 16, color: "#f2efe4" })), 2.25, DESK + 0.05, 0.67));
    round.push(moved(tube({ path: (t) => ({ x: 0.12 + 0.05 * Math.sin(t * 9), y: 0.02, z: -0.1 - 0.25 * t }), radius: () => 0.008, rings: 18, segments: 5, colorFn: () => "#3a1410" }), 2.25, DESK, 0.55));
    papers(round, parts, 1.5, DESK, 0.6, -0.18, 9);
    round.push(moved(turn([[0, 0], [0.05, 0], [0.052, 0.12], [0.046, 0.12], [0.044, 0.01], [0, 0.01]], 12, "#3a2a1e"), 1.2, DESK, 0.17));
    for (const [dx, dz, lean] of [[-0.015, 0.01, -0.15], [0.015, -0.01, 0.12], [0, 0.015, 0.05]]) round.push(along(pencil(), 1.2 + dx, DESK + 0.012, 0.17 + dz, lean, 1, -lean * 0.6));
    round.push(along(screwdriver(YELLOW), 1.21, DESK + 0.012, 0.165, 0.1, 1, 0.12));
    lanternParts(0.42, 2.56, DESK, 0.68, parts, glass);
    crate(parts, 1.25, 0, 0.42, 0.4, 0.1, "#8a5a30");
    coil(round, 1.25, 0.4, 0.42, 0.15, 3);
    // The side cabinet out on the deck to the right: a drawer over a cupboard with iron straps, papers and his box of
    // cables and tools on top, a lantern on the floor beside it.
    const cab = { x: 2.25, z: 1.5, w: 0.82, h: 0.8, d: 0.56 };
    parts.push(bevelBox({ w: cab.w, h: cab.h - 0.06, d: cab.d, color: WOOD_DK, offset: { x: cab.x, y: 0.06 + (cab.h - 0.06) / 2, z: cab.z } }));
    parts.push(bevelBox({ w: cab.w - 0.04, h: 0.06, d: cab.d - 0.06, color: "#2e1b0e", offset: { x: cab.x, y: 0.03, z: cab.z } }));
    parts.push(bevelBox({ w: cab.w + 0.06, h: 0.045, d: cab.d + 0.06, color: WOOD_LT, offset: { x: cab.x, y: cab.h + 0.02, z: cab.z } }));
    const front = cab.z + cab.d / 2;
    parts.push(bevelBox({ w: cab.w - 0.12, h: 0.16, d: 0.025, color: WOOD, bevel: 0.008, offset: { x: cab.x, y: cab.h - 0.12, z: front + 0.01 } }));
    parts.push(bevelBox({ w: cab.w - 0.12, h: 0.46, d: 0.025, color: WOOD, bevel: 0.008, offset: { x: cab.x, y: 0.36, z: front + 0.01 } }));
    for (const y of [0.18, 0.54]) parts.push(box({ w: cab.w - 0.1, h: 0.03, d: 0.01, color: IRON, offset: { x: cab.x, y, z: front + 0.026 } }));
    round.push(moved(turnedX(torus(0.03, 0.006, IRON, 0, 12, 5), Math.PI / 2), cab.x, cab.h - 0.15, front + 0.032));
    round.push(moved(forwardLathe(turn([[0, 0], [0.018, 0.004], [0.022, 0.02], [0, 0.03]], 10, BRASS)), cab.x + cab.w / 2 - 0.13, 0.4, front + 0.022));
    papers(round, parts, cab.x - 0.18, cab.h + 0.043, cab.z - 0.02, 0.25, 12, 0.22, 0.3);
    const tb = { x: cab.x + 0.18, y: cab.h + 0.043, z: cab.z + 0.02, w: 0.36, h: 0.13, d: 0.24 };
    parts.push(box({ w: tb.w, h: 0.012, d: tb.d, color: WOOD, offset: { x: tb.x, y: tb.y + 0.006, z: tb.z } }));
    for (const s of [-1, 1]) {
      parts.push(box({ w: tb.w, h: tb.h, d: 0.014, color: WOOD, offset: { x: tb.x, y: tb.y + tb.h / 2, z: tb.z + s * (tb.d / 2 - 0.007) } }));
      parts.push(box({ w: 0.014, h: tb.h, d: tb.d, color: WOOD_DK, offset: { x: tb.x + s * (tb.w / 2 - 0.007), y: tb.y + tb.h / 2, z: tb.z } }));
      for (const t of [-1, 1]) parts.push(box({ w: 0.03, h: tb.h + 0.004, d: 0.03, color: IRON, offset: { x: tb.x + s * (tb.w / 2 - 0.012), y: tb.y + tb.h / 2, z: tb.z + t * (tb.d / 2 - 0.012) } }));
    }
    coil(round, tb.x - 0.06, tb.y, tb.z, 0.08, 3);
    round.push(along(screwdriver(RED), tb.x + 0.1, tb.y + 0.01, tb.z - 0.05, 0.3, 1, -0.1), along(screwdriver(BLACK), tb.x + 0.12, tb.y + 0.01, tb.z + 0.04, 0.2, 1, 0.25));
    round.push(along(hammer(), tb.x + 0.06, tb.y + 0.01, tb.z + 0.01, -0.25, 1, 0.1), along(pliers(), tb.x + 0.02, tb.y + 0.01, tb.z - 0.06, 0.1, 1, -0.3));
    const [floorAlong, floorFoot, floorOut, floorScale] = FM.KORTIK.lanterns[1];
    lanternParts(floorScale, floorAlong, floorFoot, floorOut, parts, glass);
    // Out on the deck to the left, a crate with spare cord coiled on top; by the post, the lantern on its bracket.
    crate(parts, -2.5, 0, 1.95, 0.62, 0.12, "#8a5a30");
    coil(round, -2.5, 0.62, 1.95, 0.19, 4);
    // The bracket's arm and brace come off the post over the lantern, which hangs from its end on a short chain.
    const [pl, foot, lo, scale] = FM.KORTIK.lanterns[0], top = foot + 0.84 * scale;
    parts.push(FM.beam(pl, top + 0.15, 0.04, pl, top + 0.15, lo + 0.06, 0.06, IRON), FM.beam(pl, top - 0.15, 0.04, pl, top + 0.12, lo - 0.1, 0.035, IRON));
    parts.push(...chain(pl, top + 0.12, lo, pl, top, lo, 0.035, IRON));
    lanternParts(scale, pl, foot, lo, parts, glass);
    // His stool, square and pegged, with stretchers for his sandals.
    const sz = B.seat.z;
    parts.push(bevelBox({ w: 0.44, h: 0.06, d: 0.44, color: WOOD, offset: { y: 0.52, z: sz } }));
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(FM.beam(lx * 0.19, 0, sz + lz * 0.19, lx * 0.16, 0.5, sz + lz * 0.16, 0.06, WOOD_DK));
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) parts.push(FM.beam(ax * 0.178, 0.2, sz + az * 0.178, bx * 0.178, 0.2, sz + bz * 0.178, 0.04, WOOD));

    const body = shaded(round, parts);
    const lampAt = (color) => shaded([forwardLathe(turn([[0.026, 0], [0.026, 0.008], [0.02, 0.026], [0, 0.032]], 10, color, 1))]);
    // A lever key: a bat-handle standing up from its plate with a round knob, pivoting about x at its foot.
    const key = shaded([turn([[0.008, 0], [0.008, 0.06], [0, 0.06]], 8, "#c8c2b4"), turn([[0, 0.055], [0.018, 0.06], [0.02, 0.075], [0.014, 0.088], [0, 0.09]], 10, BLACK)]);
    // A cord segment: a unit round tube along +z, scaled to length and thickness where it is drawn.
    const segment = (color) => shaded([forwardLathe(lathe({ profile: [[1, -0.5], [1, 0.5]], segments: 10, color }))]);
    return {
      body, glass: noShadow(merge(...glass)), lamp: lampAt(LAMP), lampRed: lampAt("#ff3a22"), mug: mug(), log: logbook(),
      plugs: { red: plug(RED, RED_DK), black: plug(BLACK, "#0e0c0c") }, key, segments: { red: segment(RED), black: segment(BLACK) }, notes: NOTES.map((n) => note(n.lines, n.size))
    };
  });
  // Sparks off the board when his blade scrapes it, and the light his blade leaves along a cut.
  const sparks = cached(() => ["#fff4c8", "#ffd27a", "#ff9a3c"].map((c) => particleGeometry(c, 0.05, 1)));
  const trail = cached(() => particleGeometry("#e6f4ff", 0.055, 1));
  // The sign above the board, in the Factory's lit lettering.
  const sign = () => FM.label("KORTIK'S\nSWITCHBOARD", "Manual Routing Department", { height: BOARD.sign.height });

  BL.kortikModels = { NAME, U, BOARD, ACTIVE, NOTES, PLUG, GRIP, KATANA, DESK, MUG, LOG, rig, station, sparks, trail, sign, jackX, jackY, cordX };
})();
