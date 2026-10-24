(() => {
  "use strict";
  const BL = window.BL;
  const { box, ring, tube, merge, cached, geometry, pushVert, face, makeVox } = BL.models;
  const { hexToRgb } = BL.math;
  const { createNode, addChild } = BL.scene;
  const FUR = "#f1e9da", MUZZLE = "#faf5ec", NOSE = "#24201e", NOSTRIL = "#0a0909", SHINE = "#615a55", MOUTH = "#3b2320";
  const HELMET = "#c9a032", WORN = "#8f7a3a", GRIME = "#7f7b3f", LINING = "#6e6047";
  const VISOR = "#2a0d0a", GLARE = "#5c2a20", FRAME = "#161412", LASER = "#ff5a1f", HOT = "#ffb070";
  const SUIT = "#e0a020", SUIT_DK = "#a86a14", OLIVE = "#8c873c", GLYPH = "#dfe8f0";
  const METAL = "#3d4248", BOLT = "#9aa0a6", CABLE = "#1d1f22", GLOVE = "#4a4d52";
  // Hashed from the cell, never drawn from rand: weathering that stays put.
  const grit = (x, y, z) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(z + 5, 83492791)) >>> 0) % 13;
  // A patch of sphere about (0, cy, 0) in degrees: azimuth from the front (+z) toward +x, elevation up.
  // `paint(i, j)` names each cell's colour, null leaves a hole; `inside` turns the faces inward.
  const shell = ({ r, cy, a0, a1, e0, e1, sa, se, paint, inside = false }) => {
    const geo = geometry(), rows = [], D = Math.PI / 180;
    for (let j = 0; j <= se; j++) {
      const e = (e0 + (e1 - e0) * j / se) * D, row = [];
      for (let i = 0; i <= sa; i++) {
        const a = (a0 + (a1 - a0) * i / sa) * D;
        row.push(pushVert(geo, r * Math.cos(e) * Math.sin(a), cy + r * Math.sin(e), r * Math.cos(e) * Math.cos(a)));
      }
      rows.push(row);
    }
    for (let j = 0; j < se; j++) for (let i = 0; i < sa; i++) {
      const c = paint(i, j);
      if (c === null) continue;
      const quad = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]];
      face(geo, inside ? quad.reverse() : quad, hexToRgb(c));
    }
    return geo;
  };
  // The space helmet in head units of height, pushed back off the face: a weathered mustard
  // dome with a wide-open front, its dark visor flipped up onto the crown in a thin frame.
  const R = 0.4, CY = 0.2;
  const helmetGeometry = cached(() => {
    // 15-degree cells; the face opening is three cells either side of the front, up to the brow.
    // The rim stops higher than on the closed helmet, so the tilted dome clears the shoulders.
    const open = (i, j) => Math.abs(i - 12 + 0.5) < 3 && j < 3;
    const dome = (i, j) => open(i, j) ? null : j === 0 ? GRIME : grit(i, j, 0) < 2 ? WORN : grit(i, j, 1) < 1 ? GRIME : HELMET;
    return merge(
      shell({ r: R, cy: CY, a0: -180, a1: 180, e0: -15, e1: 90, sa: 24, se: 7, paint: dome }),
      shell({ r: R - 0.02, cy: CY, a0: -180, a1: 180, e0: -15, e1: 90, sa: 24, se: 7, paint: (i, j) => open(i, j) ? null : LINING, inside: true }),
      shell({ r: R + 0.006, cy: CY, a0: -62, a1: 62, e0: 30, e1: 62, sa: 8, se: 3, paint: () => FRAME }),
      shell({ r: R + 0.012, cy: CY, a0: -57, a1: 57, e0: 33, e1: 59, sa: 8, se: 3, paint: (i, j) => j === 1 && i > 1 && i < 4 ? GLARE : VISOR })
    );
  });
  // The neck ring the helmet seats on, in root units: gunmetal, bolted, a cable to the pack.
  const neckRingGeometry = cached(() => {
    const bolts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2;
      bolts.push(box({ w: 0.028, h: 0.028, d: 0.028, color: BOLT, offset: { x: Math.sin(a) * 0.37, y: 0.5, z: Math.cos(a) * 0.37 } }));
    }
    const cable = tube({ rings: 10, segments: 6, radius: () => 0.014, colorFn: () => CABLE,
      path: (t) => ({ x: 0.36 - 0.12 * t, y: 0.48 - 0.1 * t + 0.06 * Math.sin(t * Math.PI), z: -0.3 * t }) });
    return merge(ring({ r: 0.35, thickness: 0.032, y: 0.5, segments: 16, color: METAL }), ring({ r: 0.33, thickness: 0.02, y: 0.45, segments: 16, color: CABLE }), ...bolts, cable);
  });
  // A Bitcoin sign from 0.018-high cells, centred on its own origin.
  const coinGeometry = cached(() => {
    const rows = [" # # ", "#### ", "#   #", "#### ", "#   #", "#### ", " # # "], c = 0.018, cells = [];
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === "#") cells.push(box({ w: c, h: c, d: 0.008, color: GLYPH, offset: { x: (i - 2) * c, y: (3 - j) * c } }));
    }));
    return merge(...cells);
  });
  const packGeometry = cached(() => merge(
    box({ w: 0.3, h: 0.26, d: 0.1, color: METAL }),
    box({ w: 0.3, h: 0.035, d: 0.104, color: SUIT, offset: { y: 0.09 } }),
    box({ w: 0.05, h: 0.05, d: 0.02, color: BOLT, offset: { x: 0.08, y: -0.04, z: -0.055 } }),
    box({ w: 0.12, h: 0.02, d: 0.02, color: CABLE, offset: { x: -0.05, y: -0.06, z: -0.055 } })
  ));
  const suitJ = (x, y, z) => grit(x, y, z) < 1 ? OLIVE : SUIT;
  const armVox = (C) => {
    const v = makeVox();
    v.fill(0, 2, 3, 7, 0, 2, (x, y, z) => C[suitJ(x, y, z)]);
    v.fill(-1, 3, 8, 10, -1, 3, (x, y, z) => C[x === -1 || z === -1 ? SUIT_DK : SUIT]);
    v.fill(-1, 3, 2, 2, -1, 3, C[METAL]);
    v.fill(-1, 3, 0, 1, -1, 3, C[GLOVE]);
    return v;
  };
  const legVox = (C) => {
    const v = makeVox();
    v.fill(0, 3, 3, 4, 0, 3, (x, y, z) => C[suitJ(x, y, z)]);
    v.fill(0, 3, 2, 2, 0, 3, C[METAL]);
    v.fill(0, 3, 0, 1, 0, 5, C[GLOVE]);
    return v;
  };
  const colors = (k) => Object.fromEntries([SUIT, SUIT_DK, OLIVE, METAL, GLOVE].map((hex) => [hex, k.color(hex)]));
  BL.characters.add({
    handle: "johnstackton21m",
    display: "Doggo",
    joined: 1792114421,
    lastCommit: 1792114421,
    // Fur under the helmet; the dog face is drawn in skull, the laser eyes in eyes.
    look: { skin: FUR, hair: FUR, fur: SUIT_DK, hairless: true, noBrow: true, noPupils: true, face: "none" },
    voice: {
      poke: "GM. Wen Omega?",
      idle: ["GM. Wen Omega?", "I habs humgry", "Laser eyes til MacDomalts fries"]
    },
    dress: {
      // A bulky yellow-orange suit: shaded sides, a gunmetal belt, olive grime on the front.
      torso(k, v) {
        const C = colors(k);
        v.fill(0, 8, 0, 7, 0, 5, (x, y, z) => C[y === 2 ? METAL : x === 0 || x === 8 || z === 0 ? SUIT_DK : z === 5 && grit(x, y, z) < 2 ? OLIVE : SUIT]);
        v.set(4, 2, 5, k.color(BOLT));
        k.loin = [C[SUIT_DK], C[OLIVE]];
      },
      // Suit sleeves and legs with gloves and boots; the neck ring and a Bitcoin sign on each side of the chest.
      gear(k) {
        const C = colors(k), u = k.u, h = k.h, glove = makeVox();
        k.parts.armR.geometry = k.parts.armL.geometry = k.vg(armVox(C), { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
        k.parts.legR.geometry = k.parts.legL.geometry = k.vg(legVox(C), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        glove.set(0, 1, 4, C[GLOVE]);
        glove.set(2, 1, 4, C[GLOVE]);
        k.parts.fingersR.geometry = k.parts.fingersL.geometry = k.vg(glove, { x: -1.5 * u, y: -u, z: -1.5 * u });
        addChild(k.root, createNode({ scale: { x: h, y: h, z: h }, geometry: neckRingGeometry() }));
        for (const x of [-0.14, 0.14]) addChild(k.parts.torso, createNode({ position: { x: x * h, y: 0.3 * h, z: 3.05 * u }, scale: { x: h, y: h, z: h }, geometry: coinGeometry() }));
      },
      // A bulldog head: broad cream skull and cheeks, a short muzzle with heavy jowls,
      // a big black nose and a small dark mouth line. No ears: the helmet still covers them.
      skull(k, v) {
        const P = k.P, muzzle = k.color(MUZZLE), nose = k.color(NOSE), mouth = k.color(MOUTH);
        v.fill(0, 6, 0, 5, 0, 5, (x, y, z) => grit(x, y, z) < 1 ? P.skinDk : P.skin);
        v.fill(-1, 7, 0, 3, 1, 5, P.skin);
        for (const x of [0, 6]) for (const z of [0, 5]) v.del(x, 5, z);
        v.fill(0, 6, 4, 4, 6, 6, P.skinDk);
        v.fill(1, 5, 0, 2, 6, 8, muzzle);
        v.fill(2, 4, 3, 3, 6, 7, muzzle);
        v.fill(0, 6, -1, -1, 5, 8, (x) => x === 3 ? null : P.skin);
        for (const x of [0, 6]) v.fill(x, x, 0, 1, 6, 8, P.skin);
        v.fill(2, 4, 2, 3, 8, 9, nose);
        v.set(2, 2, 9, k.color(NOSTRIL));
        v.set(4, 2, 9, k.color(NOSTRIL));
        v.set(3, 3, 9, k.color(SHINE));
        v.fill(2, 4, 0, 0, 8, 8, mouth);
        return true;
      },
      // Laser eyes, red-orange with a hot centre; closed, the lids are fur.
      eyes(k, v) {
        const laser = k.color(LASER), hot = k.color(HOT);
        for (const [x, c] of [[0, laser], [1, hot], [5, hot], [6, laser]]) {
          v.set(x, 3, 5, c);
          k.eyeCells.push([x, 3]);
        }
        k.headEmissive = { [laser]: 1, [hot]: 1 };
        k.lid = k.P.skinDk;
        return true;
      },
      hatY: (k) => 0.64 * k.h,
      headgear(k) {
        const h = k.h;
        addChild(k.parts.head, createNode({ position: { x: 0, y: 0.05 * h, z: -0.1 * h }, rotation: { x: -0.55, y: 0, z: 0 }, scale: { x: h, y: h, z: h }, geometry: helmetGeometry() }));
      },
      // A small life-support pack on the back.
      extras(k) {
        const h = k.h;
        addChild(k.parts.torso, createNode({ position: { x: 0, y: 0.33 * h, z: -3 * k.u - 0.05 * h }, scale: { x: h, y: h, z: h }, geometry: packGeometry() }));
      }
    }
  });
})();
