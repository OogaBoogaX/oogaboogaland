// Bitclank-Bill, Bitcoin Bill of Bitcoin Guide (bitcoinguide.app): salt-and-pepper hair swept back under a frayed beach straw hat,
// a full beard going grey at the chin, and glowing orange laser eyes. A tie-dye tank in blue and green with
// a cord necklace and an orange coin, and his chihuahua at his heel wherever he goes, painted up like an alebrije in
// violet, orange and turquoise. In place of the club he swings an acoustic guitar, held by the neck.
(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const ORANGE = "#ff9a1f", ORANGE_CORE = "#fff1c4";
  const STRAW = ["#d8c08a", "#c4a768", "#e8d7a8"], BAND = "#7a5a3a";
  const DYE = ["#2f8fd8", "#3fc6b5", "#7fd36a", "#1f6fb0", "#56b8e8"];
  // The chihuahua at his heel, painted as an alebrije, in its own voxel grid facing +z with its paws at y 0: legs,
  // a red-brown body with violet, orange and turquoise flowers, a cream chest, a head with big pink-lined ears, dark
  // eyes and nose, a collar of blue beads, and a tail curled up over its back.
  const dogVox = (k) => {
    const v = makeVox(), c = (hex) => k.color(hex);
    const coat = c("#8a4a2e"), coatDk = c("#6e3a24"), violet = c("#7a3fd0"), flower = c("#ff7a2a"), teal = c("#3fd8e0");
    const cream = c("#f0d2a8"), pink = c("#f28ab0"), black = c("#15100c"), bead = c("#5ab8ff"), fur = k.jit(coat, coatDk, 0.2);
    for (const [x, z] of [[-1, 1], [1, 1], [-1, -3], [1, -3]]) { v.fill(x, x, 1, 2, z, z, fur); v.set(x, 0, z, cream); }
    v.fill(-1, 1, 3, 5, -3, 2, fur);
    v.fill(-1, 1, 3, 4, 2, 2, cream);
    for (const [x, y, z, ink] of [[1, 5, 0, violet], [-1, 4, -1, flower], [1, 4, -2, teal], [0, 5, -2, flower], [-1, 5, 1, violet], [1, 3, 1, flower], [-1, 3, -3, teal]]) v.set(x, y, z, ink);
    v.fill(-1, 1, 6, 8, 2, 4, fur);
    v.fill(-1, 1, 6, 6, 2, 2, bead);
    v.set(0, 8, 4, flower); v.set(-1, 8, 3, violet); v.set(1, 8, 3, violet);
    v.set(-1, 7, 4, black); v.set(1, 7, 4, black);
    v.set(0, 6, 5, cream); v.set(0, 7, 5, cream); v.set(0, 7, 6, black);
    for (const x of [-1, 1]) { v.set(x, 9, 3, coat); v.set(x, 10, 3, coat); v.set(x, 9, 4, pink); }
    v.set(0, 6, -3, coat); v.set(0, 7, -3, coatDk); v.set(0, 8, -2, teal);
    return v;
  };
  // The straw hat in the head's voxel grid: a domed crown with a dark band, and a wide brim that droops at its rim and
  // trails ragged strands. Built once a page for each build kit, from the kit's own random draws.
  const hatVox = (k) => {
    // The crown sits over the hair's whole footprint (x -1 to 7, z -1 to 6), so no cell doubles a hair cell.
    const v = makeVox(), colors = STRAW.map((c) => k.color(c)), band = k.color(BAND), pick = () => colors[Math.floor(k.rand() * colors.length)];
    for (let y = 9; y <= 12; y++) {
      const inset = y >= 12 ? 1 : 0;
      v.fill(-1 + inset, 7 - inset, y, y, -1 + inset, 6 - inset, y === 10 ? band : pick);
    }
    const cx = 3, cz = 2.5;
    for (let x = -6; x <= 12; x++) for (let z = -6; z <= 11; z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d > 8.2 || (x >= -1 && x <= 7 && z >= -1 && z <= 6)) continue;
      const rim = d > 6.8;
      v.set(x, rim ? 8 : 9, z, pick());
      // Strands hanging from the rim, one or two cells long, but none across the front, where they'd hide his eyes.
      if (rim && k.rand() < 0.3 && !(z > 7 && Math.abs(x - cx) < 4.5)) {
        v.set(x, 7, z, pick());
        if (k.rand() < 0.4) v.set(x, 6, z, pick());
      }
    }
    return v;
  };
  // The acoustic guitar he carries for a club, in half-size cells: y runs along it from the headstock (y -5) to the
  // tail of the body (y 20), x across it, and its top faces -z. Palette slots, the gold twin in the same order:
  // spruce, spruce grain, rosewood sides, dark rosewood, sound hole, bone, string steel, tuner, rosette, mahogany
  // neck and the back.
  const GUITAR_PALETTE = ["#e3b872", "#cf9d55", "#5a2e1c", "#2e1a12", "#120b07", "#efe3c4", "#dcdcd2", "#c9c3b4", "#8a4f22", "#7a4a2a", "#6b3822"];
  const GOLD_GUITAR_PALETTE = ["#f0c95a", "#e0b53a", "#a8781e", "#6e4c12", "#3b2a0a", "#fff0c2", "#fff6d8", "#f5d77a", "#c99a2e", "#b8892a", "#9a6e1c"];
  const [TOP, GRAIN, SIDE, DARK, HOLE, BONE, STEEL, TUNER, ROSETTE, NECK, BACK] = GUITAR_PALETTE.map((_, i) => i);
  // The body's half-width row by row from the neck joint (y 8) to the tail: upper bout, waist, wider lower bout.
  const BODY = [3, 4, 4, 4, 3, 3, 4, 5, 5, 5, 5, 4, 3], BODY_Y = 8, BRIDGE_Y = 17;
  // One shape for both colourways, laid out once a page; it draws nothing from k.rand.
  let guitar = null;
  const guitarVox = () => {
    if (guitar) return guitar;
    const v = makeVox();
    // A short flat headstock, flush with the fretboard, with two tuners a side and their string posts on its face.
    v.fill(-2, 2, -5, -2, -1, 0, DARK);
    for (const y of [-5, -3]) for (const side of [-1, 1]) { v.set(3 * side, y, -1, TUNER); v.set(side, y, -2, STEEL); }
    // The neck, a darker fretboard over it with three frets, the bone nut, and two steel lines for the strings.
    v.fill(-1, 1, -1, BODY_Y - 1, 0, 1, NECK);
    v.fill(-1, 1, 0, BODY_Y + 1, -1, -1, DARK);
    for (const y of [3, 6, 9]) v.set(0, y, -1, STEEL);
    v.fill(-1, 1, -1, -1, -2, -1, BONE);
    for (const x of [-1, 1]) v.fill(x, x, 0, BRIDGE_Y - 1, -2, -2, STEEL);
    // The figure-eight body: a spruce top bound in bone, rosewood sides and back.
    for (let r = 0; r < BODY.length; r++) {
      const w = BODY[r], y = BODY_Y + r;
      for (let x = -w; x <= w; x++) {
        const edge = Math.abs(x) === w || r === 0 || r === BODY.length - 1 || Math.abs(x) > BODY[r - 1] || Math.abs(x) > BODY[r + 1];
        v.set(x, y, 0, edge ? BONE : (x + 5) % 3 === 0 ? GRAIN : TOP);
        v.fill(x, x, y, y, 1, 3, SIDE);
        v.set(x, y, 4, BACK);
      }
    }
    // The round sound hole in its rosette, under the strings.
    for (const [r, hole, ring] of [[2, -1, 1], [3, 1, 2], [4, 2, 3], [5, 2, 3], [6, 1, 2], [7, -1, 1]]) {
      const y = BODY_Y + r;
      for (let x = -ring; x <= ring; x++) v.set(x, y, 0, Math.abs(x) <= hole ? HOLE : ROSETTE);
    }
    // The bridge with its bone saddle, where the strings end.
    v.fill(-3, 3, BRIDGE_Y, BRIDGE_Y + 1, -1, -1, DARK);
    v.fill(-2, 2, BRIDGE_Y, BRIDGE_Y, -2, -2, BONE);
    return (guitar = v);
  };
  BL.characters.add({
    handle: "Bitcoin-Bill",
    github: "Bitclank-Bill",
    display: "Bitclank-Bill",
    joined: 1792943472,
    lastCommit: 1792943472,
    look: {
      face: "beard", noPupils: true, height: 1.04, hatY: 13, petRidesHat: true,
      skin: "#d99a74", hair: "#3b3430", fur: "#a97f52",
      portrait: { min: [-1, -2, 0], max: [7, 6, 8] }
    },
    voice: {
      poke: "clank clank",
      idle: [
        "Roll the dice, make the seed.",
        "Not your keys, not your coconuts.",
        "Read the white paper. Then read it again.",
        "Laser eyes on. Stack sats.",
        "Hold on tight, little dog.",
        "Proof of work, not proof of talk."
      ]
    },
    dress: {
      // The tie-dye tank: a spiral of blue, teal and green rings over the chest, bare shoulders and a scoop neck, and a
      // cord necklace with an orange coin.
      torso(k, v) {
        const dye = DYE.map((c) => k.color(c)), skin = k.skinJ, cord = k.color("#2a2018"), coin = k.color("#f7931a");
        v.fill(1, 7, 3, 7, 1, 4, (x, y) => dye[(Math.round(Math.hypot(x - 4, y - 5) * 1.3) + (k.rand() < 0.15 ? 1 : 0)) % dye.length]);
        v.fill(1, 1, 7, 7, 1, 4, skin);
        v.fill(7, 7, 7, 7, 1, 4, skin);
        v.fill(3, 5, 6, 7, 4, 4, skin);
        v.set(4, 5, 4, skin);
        v.set(3, 6, 4, cord); v.set(5, 6, 4, cord); v.set(4, 5, 4, cord);
        v.set(4, 4, 4, coin);
      },
      // The acoustic guitar for his club, in half-size cells, held by the neck at the nut so it swings and
      // thumps as the club does. Returning geometry leaves the default club's k.rand draws where they were.
      club(k) {
        const v = guitarVox(), unit = k.u / 2, origin = { x: -0.5 * unit, y: 0, z: 0 };
        return {
          default: voxelGeometry(v, { unit, palette: GUITAR_PALETTE, origin }),
          gold: voxelGeometry(v, { unit, palette: GOLD_GUITAR_PALETTE, origin }),
          rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 }
        };
      },
      // Salt and pepper: grey through the sides and back of the hair.
      crown(k, v) {
        const grey = k.color("#8b8279"), silver = k.color("#b3aba1");
        for (let y = 2; y <= 8; y++) for (let z = -1; z <= 6; z++) for (const x of [-1, 7]) {
          if (v.has(x, y, z) && k.rand() < 0.35) v.set(x, y, z, k.rand() < 0.5 ? grey : silver);
        }
        for (let x = 0; x <= 6; x++) for (let y = 2; y <= 8; y++) if (v.has(x, y, -1) && k.rand() < 0.25) v.set(x, y, -1, grey);
      },
      // Laser eyes: both glowing Bitcoin orange, each with a white-hot core.
      eyes(k, v) {
        const o = k.color(ORANGE), oc = k.color(ORANGE_CORE);
        for (const [x0, ring, core] of [[0, o, oc], [5, o, oc]]) {
          for (let x = x0; x <= x0 + 1; x++) for (let y = 2; y <= 3; y++) {
            v.set(x, y, 5, ring);
            k.eyeCells.push([x, y]);
          }
          v.set(x0 + (x0 ? 0 : 1), 3, 5, core);
        }
        k.headEmissive = { [o]: 1, [oc]: 1.4 };
        return true;
      },
      // The beard greys toward the chin: dark through the moustache and cheeks, silver at the bottom.
      mark(k, v) {
        const dark = k.color("#3f3732"), mid = k.color("#857c72"), silver = k.color("#c9c3b9"), skip = new Set([k.P.nose, k.P.white, k.P.skin, k.P.skinDk]);
        for (let x = 0; x <= 6; x++) for (let y = -2; y <= 1; y++) for (let z = 5; z <= 7; z++) {
          if (!v.has(x, y, z) || skip.has(v.get(x, y, z))) continue;
          const r = k.rand();
          v.set(x, y, z, y <= -1 ? (r < 0.7 ? silver : mid) : y === 0 ? (r < 0.4 ? silver : r < 0.75 ? mid : dark) : (r < 0.6 ? dark : mid));
        }
      },
      headgear(k) {
        addChild(k.parts.head, createNode({ geometry: k.vg(hatVox(k), { x: -3.5 * k.u, y: 0, z: -3 * k.u }) }));
      },
      // The chihuahua trots along at his heel, a little behind and to his left, wherever he goes.
      extras(k) {
        const s = 0.7, h = k.h;
        k.parts.dog = createNode({ position: { x: 0.55 * h, y: -5 * k.u, z: -0.25 * h }, scale: { x: s, y: s, z: s }, geometry: k.vg(dogVox(k), { x: -0.5 * k.u, y: 0, z: -0.5 * k.u }) });
        addChild(k.root, k.parts.dog);
      }
    }
  });
})();
