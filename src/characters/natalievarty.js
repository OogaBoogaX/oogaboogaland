(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  // A Victorian explorer in a yellow gown, drawn cute: a big round head, sparkly blue
  // eyes and rosy cheeks, brown hair up in a bun with loose locks framing her face,
  // puffed sleeves with cream cuffs, white gloves, a lilac bow at her collar, beige
  // cap-toe slingbacks under the hem, and a bouquet of orange flowers for a club.
  let slots = null;
  const colors = (k) => slots || (slots = {
    gown: k.color("#f3c63f"),
    gownLt: k.color("#fbdc6e"),
    gownDk: k.color("#d9a52a"),
    cream: k.color("#f6ecd2"),
    lilac: k.color("#a98fd0"),
    glove: k.color("#fbf7ee"),
    shoe: k.color("#e6d3b3"),
    shoeDk: k.color("#1b1b1d"),
    iris: k.color("#3f7fc4"),
    lip: k.color("#c8525e"),
    blush: k.color("#f4a3a0"),
    noseTip: k.color("#eaa98f")
  });
  // Hashed from the cell so the gown's folds never draw from the shared rand.
  const fold = (x, y, z) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(z + 5, 83492791)) >>> 0) % 5;
  const gownAt = (C) => (x, y, z) => { const f = fold(x, y, z); return f === 0 ? C.gownDk : f === 1 ? C.gownLt : C.gown; };
  // Legs under the skirt: yellow down to a cream ruffled hem, then two-tone shoes:
  // beige with a black cap toe, a black heel and a black slingback strap round the heel.
  const legVox = (C, side) => {
    const v = makeVox();
    v.fill(0, 3, 3, 4, 0, 3, gownAt(C));
    v.fill(0, 3, 2, 2, 0, 3, (x, y, z) => (x + z) % 2 ? C.cream : C.glove);
    v.fill(0, 3, 1, 1, 0, 4, C.shoe);
    v.fill(0, 3, 0, 0, 1, 4, C.shoe);
    v.fill(0, 3, 0, 1, 5, 5, C.shoe);
    v.fill(0, 3, 0, 0, 5, 5, C.shoeDk);
    v.set(side < 0 ? 3 : 0, 0, 6, C.shoeDk);
    v.set(side < 0 ? 1 : 2, 0, 6, C.shoeDk);
    v.fill(0, 3, 0, 0, 0, 0, C.shoeDk);
    v.fill(1, 2, 1, 1, 0, 0, C.shoeDk);
    return v;
  };
  // Puffed shoulder sleeves to a cream cuff above the elbow, bare forearm, white glove.
  const armVox = (k, C) => {
    const v = makeVox();
    v.fill(0, 2, 2, 6, 0, 2, k.skinJ);
    v.fill(0, 2, 7, 7, 0, 2, C.cream);
    v.fill(-1, 3, 8, 10, -1, 3, gownAt(C));
    v.fill(0, 2, 11, 11, 0, 2, C.gownLt);
    v.fill(-1, 3, 0, 1, -1, 3, C.glove);
    return v;
  };
  // A small N tattoo on the outside of her left forearm, drawn in half-size voxels so
  // its diagonal shows: a thin plate whose outer face sits just proud of the skin.
  // Read from beside her, the arm's front (+z) is on the left.
  const N = ["1001", "1101", "1011", "1001"];
  const INK = [BL.math.hexToRgb("#27324f")];
  const tattoo = (u) => {
    const v = makeVox();
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) if (N[row][col] === "1") v.set(0, 3 - row, 3 - col, 0);
    return voxelGeometry(v, { unit: u / 2, palette: INK, origin: { x: 1.5 * u + 0.002 - u / 2, y: -7.5 * u, z: -u } });
  };
  const fingerVox = (C) => {
    const v = makeVox();
    v.set(0, 1, 4, C.glove);
    v.set(2, 1, 4, C.glove);
    return v;
  };
  // The club is a bouquet: green stems bound with a pink ribbon, a cream paper wrap
  // flaring out, then orange blooms with golden hearts among a few leaves.
  const hexRgb = BL.math.hexToRgb;
  const BOUQUET = ["#4f9a3a", "#2f6e26", "#ff8a1f", "#e8600f", "#ffd34a", "#f59ab4", "#f7efdc"].map(hexRgb);
  const GOLD_BOUQUET = ["#c99a2e", "#a87c22", "#f0c95a", "#e0b53a", "#fff1a8", "#f0c95a", "#f7e7b0"].map(hexRgb);
  const STEM = 0, LEAF = 1, PETAL = 2, PETAL_DK = 3, HEART = 4, RIBBON = 5, PAPER = 6;
  const BLOOMS = [[0, 9, 0], [-2, 8, -1], [3, 8, 1], [1, 8, 3], [0, 8, -2], [2, 10, -1], [-1, 10, 2]];
  let bouquet = null;
  const bouquetVox = () => {
    if (bouquet) return bouquet;
    const v = bouquet = makeVox();
    v.fill(0, 1, 0, 4, 0, 1, STEM);
    v.fill(-1, 2, 2, 2, -1, 2, RIBBON);
    v.set(2, 1, 2, RIBBON);
    v.set(2, 1, 0, RIBBON);
    // The wrap: a ring widening upward, open at the top for the flowers.
    for (const [y, r] of [[4, 1], [5, 2], [6, 2], [7, 3]]) {
      for (let x = -r + 1; x <= r; x++) for (let z = -r + 1; z <= r; z++) {
        if (x === -r + 1 || x === r || z === -r + 1 || z === r) v.set(x, y, z, PAPER);
        else v.set(x, y, z, STEM);
      }
    }
    for (const [x, z] of [[-3, 0], [4, 1], [1, -3], [0, 4]]) v.fill(x, x, 8, 8, z, z, LEAF);
    // Each bloom: a golden heart with orange petals round it.
    for (const [x, y, z] of BLOOMS) {
      v.fill(x - 1, x + 1, y, y, z - 1, z + 1, (px, py, pz) => (px + pz) % 2 ? PETAL : PETAL_DK);
      v.set(x, y + 1, z, PETAL);
      v.set(x, y, z, HEART);
      v.set(x, y + 1, z, HEART);
    }
    return v;
  };
  BL.characters.add({
    handle: "natalievarty",
    joined: 1793927061,
    lastCommit: 1793927061,
    look: {
      build: "slim", height: 0.94, noBrow: true, face: "smirk",
      skin: "#f2c6a4", hair: "#6e3d1f", fur: "#f3c63f",
      portrait: { min: [-1, -3, -4], max: [7, 9, 8] }
    },
    voice: {
      poke: "Oh! Goodness, you startled me.",
      idle: ["I must sketch this banana.", "Fascinating. Simply fascinating.", "Tea, anyone?", "Notes, notes, notes.", "One more expedition.", "A whole island of Oogas!"]
    },
    dress: {
      torso(k, v) {
        const C = colors(k), gown = gownAt(C);
        // Bodice over the slim chest, a darker waistband, the skirt's top flaring below.
        v.fill(1, 7, 3, 7, 1, 4, gown);
        v.fill(1, 7, 3, 3, 1, 4, C.gownDk);
        v.fill(0, 8, 0, 2, 0, 5, gown);
        // A cream collar round the neck and a lilac bow at the throat.
        v.fill(2, 6, 7, 7, 1, 4, C.cream);
        v.fill(3, 5, 6, 6, 5, 5, C.lilac);
        v.set(4, 5, 5, C.lilac);
        // Gathered pleats down the skirt's front panel.
        for (const x of [2, 4, 6]) v.fill(x, x, 0, 2, 5, 5, C.gownDk);
        k.loin = [C.gown, C.gownLt];
      },
      gear(k) {
        const C = colors(k), u = k.u;
        k.parts.legR.geometry = k.vg(legVox(C, -1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        k.parts.legL.geometry = k.vg(legVox(C, 1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        const arm = k.vg(armVox(k, C), { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
        k.parts.armR.geometry = k.parts.armL.geometry = arm;
        addChild(k.parts.armL, createNode({ geometry: tattoo(u) }));
        const fingers = k.vg(fingerVox(C), { x: -1.5 * u, y: -u, z: -1.5 * u });
        k.parts.fingersR.geometry = k.parts.fingersL.geometry = fingers;
      },
      crown(k, v) {
        const H = k.P.hair, D = k.P.hairDk;
        // Up off the neck: trim the long back and sides to the jaw.
        // Hair only: the head block's own bottom layer (x 0..6, z 0..5 at y 0) stays, so the jaw stays closed.
        for (let x = -1; x <= 7; x++) for (let y = -5; y <= 0; y++) for (let z = -2; z <= 4; z++) if (y < 0 || x < 0 || x > 6 || z < 0) v.del(x, y, z);
        // A round bun high on the back of the head.
        v.fill(1, 5, 5, 8, -4, -3, H);
        v.fill(2, 4, 6, 7, -5, -5, D);
        v.fill(2, 4, 9, 9, -4, -3, D);
        // Loose locks falling in front of each ear to the chin.
        for (const x of [-1, 7]) v.fill(x, x, -1, 5, 4, 5, (xx, y) => y % 3 ? H : D);
        // A side-swept fringe across the forehead.
        v.fill(0, 3, 5, 5, 6, 6, H);
        v.set(0, 4, 6, H);
        v.set(4, 5, 6, D);
      },
      eyes(k, v) {
        const C = colors(k);
        // Big blue eyes, each with a white sparkle at its outer top; the pupils land inside.
        for (const [outer, inner] of [[0, 1], [6, 5]]) {
          v.set(outer, 3, 5, k.P.white);
          v.set(inner, 3, 5, C.iris);
          v.set(outer, 2, 5, C.iris);
          v.set(inner, 2, 5, C.iris);
          k.eyeCells.push([outer, 3], [inner, 3], [outer, 2], [inner, 2]);
        }
        return true;
      },
      mark(k, v) {
        const C = colors(k);
        // Lashes flicking out at the corners, a button nose, rosy cheeks and a tiny smile.
        v.set(1, 4, 6, k.P.hairDk);
        v.set(5, 4, 6, k.P.hairDk);
        v.set(6, 4, 6, k.P.hairDk);
        v.set(-1, 3, 5, k.P.hairDk);
        v.set(7, 3, 5, k.P.hairDk);
        v.set(3, 1, 6, C.noseTip);
        for (const x of [1, 5]) v.set(x, 1, 6, C.blush);
        for (const x of [0, 6]) v.set(x, 1, 5, C.blush);
        v.set(2, 0, 6, k.P.skin);
        v.set(3, 0, 6, C.lip);
        v.set(4, 0, 6, k.P.skin);
      },
      club: () => ({ voxels: bouquetVox(), palette: BOUQUET, goldPalette: GOLD_BOUQUET, rest: { x: 0.55, z: 0 }, carry: { x: 0.8, z: 0 } }),
      // A big round head on a small body reads cute: the whole head scales up from its base.
      headgear(k) {
        const s = k.parts.head.scale;
        s.x = s.y = s.z = 1.18;
      },
      hatY: (k) => 10 * k.u
    }
  });
})();
