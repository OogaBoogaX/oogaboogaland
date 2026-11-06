(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox } = BL.models;
  // A Victorian explorer in a yellow gown: brown hair up in a bun with loose locks
  // framing her face, blue eyes, puffed sleeves with cream cuffs, white gloves, a
  // lilac bow at her collar and the gown's skirt falling over brown boots.
  let slots = null;
  const colors = (k) => slots || (slots = {
    gown: k.color("#f3c63f"),
    gownLt: k.color("#fbdc6e"),
    gownDk: k.color("#d9a52a"),
    cream: k.color("#f6ecd2"),
    lilac: k.color("#a98fd0"),
    glove: k.color("#fbf7ee"),
    boot: k.color("#5a3a22"),
    iris: k.color("#4f8fc8"),
    lip: k.color("#c8525e"),
    lipLt: k.color("#e08f8a"),
    blush: k.color("#f0a49a")
  });
  // Hashed from the cell so the gown's folds never draw from the shared rand.
  const fold = (x, y, z) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(z + 5, 83492791)) >>> 0) % 5;
  const gownAt = (C) => (x, y, z) => { const f = fold(x, y, z); return f === 0 ? C.gownDk : f === 1 ? C.gownLt : C.gown; };
  // Legs under the skirt: yellow down to a cream ruffled hem, then brown boots.
  const legVox = (C, side) => {
    const v = makeVox();
    v.fill(0, 3, 3, 4, 0, 3, gownAt(C));
    v.fill(0, 3, 2, 2, 0, 3, (x, y, z) => (x + z) % 2 ? C.cream : C.glove);
    v.fill(0, 3, 0, 1, 0, 5, C.boot);
    v.set(side < 0 ? 3 : 0, 0, 6, C.boot);
    v.set(side < 0 ? 1 : 2, 0, 6, C.boot);
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
  const fingerVox = (C) => {
    const v = makeVox();
    v.set(0, 1, 4, C.glove);
    v.set(2, 1, 4, C.glove);
    return v;
  };
  BL.characters.add({
    handle: "natalievarty",
    joined: 1793927061,
    lastCommit: 1793927061,
    look: {
      build: "slim", height: 1.0, noBrow: true, face: "smirk",
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
        const fingers = k.vg(fingerVox(C), { x: -1.5 * u, y: -u, z: -1.5 * u });
        k.parts.fingersR.geometry = k.parts.fingersL.geometry = fingers;
      },
      crown(k, v) {
        const H = k.P.hair, D = k.P.hairDk;
        // Up off the neck: trim the long back and sides to the jaw.
        for (let x = -1; x <= 7; x++) for (let y = -5; y <= 0; y++) for (let z = -2; z <= 4; z++) v.del(x, y, z);
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
        // White outer corners, blue irises toward the nose; pupils land on the irises.
        for (const [white, iris] of [[0, 1], [6, 5]]) {
          for (const y of [2, 3]) {
            v.set(white, y, 5, k.P.white);
            v.set(iris, y, 5, C.iris);
            k.eyeCells.push([white, y], [iris, y]);
          }
        }
        return true;
      },
      mark(k, v) {
        const C = colors(k);
        // Slim arched brows, rosy cheeks and a smile.
        v.set(1, 4, 6, k.P.hairDk);
        v.set(5, 4, 6, k.P.hairDk);
        v.set(6, 4, 6, k.P.hairDk);
        v.set(1, 1, 6, C.blush);
        v.set(5, 1, 6, C.blush);
        v.set(2, 0, 6, C.lipLt);
        v.set(3, 0, 6, C.lip);
        v.set(4, 0, 6, C.lipLt);
      },
      hatY: (k) => 10 * k.u
    }
  });
})();
