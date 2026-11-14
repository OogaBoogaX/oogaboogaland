(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const ORANGE = "#ff9a1f", ORANGE_CORE = "#fff1c4";
  const CARIBBEAN = "#1fb6cc";
  const speckle = (x, y, z) => {
    let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) % 100;
  };
  const KOBE_PALETTE = ["#4a35c8", "#3b28a6", "#ff7a2a", "#ff4f9a", "#2fd6c8", "#ffd23f", "#f6ecd9", "#15100c", "#3a2416", "#3f8fe8", "#8fd0ff"];
  const [VIOLET, INDIGO, TANGERINE, ROSE, TURQUOISE, SUN, CREAM, JET, EYE, BEAD, BEAD_LIGHT] = KOBE_PALETTE.map((_, i) => i);
  const KOBE_GLOW = { [BEAD]: 0.9, [BEAD_LIGHT]: 1.2 };
  let kobe = null;
  const kobeVox = () => {
    if (kobe) return kobe;
    const v = makeVox(), coat = (x, y, z) => (speckle(x, y, z) < 20 ? INDIGO : VIOLET);
    const bloom = (set, petal, corner) => {
      set(0, 0, SUN);
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { set(a, b, petal); set(2 * a, 2 * b, petal); }
      for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) set(a, b, corner);
    };
    for (const x0 of [-3, 2]) for (const z0 of [-6, 3]) {
      v.fill(x0, x0 + 1, 1, 3, z0, z0 + 1, (x, y) => [TURQUOISE, TANGERINE, ROSE][y - 1]);
      v.fill(x0, x0 + 1, 0, 0, z0, z0 + 1, SUN);
    }
    v.fill(-3, 3, 4, 10, -6, 4, coat);
    for (const x of [-3, 3]) for (const y of [4, 10]) for (let z = -6; z <= 4; z++) v.del(x, y, z);
    for (const x of [-3, 3]) {
      bloom((dz, dy, c) => v.set(x, 7 + dy, -4 + dz, c), ROSE, TANGERINE);
      bloom((dz, dy, c) => v.set(x, 7 + dy, 2 + dz, c), TURQUOISE, SUN);
      v.set(x, 6, -1, TURQUOISE); v.set(x, 7, -1, SUN); v.set(x, 8, -1, TURQUOISE);
    }
    for (let z = -6; z <= 4; z++) {
      v.set(0, 10, z, z % 2 ? ROSE : SUN);
      if (z % 2 === 0) { v.set(-2, 10, z, TURQUOISE); v.set(2, 10, z, TURQUOISE); }
    }
    v.fill(-2, 2, 4, 9, 4, 4, TANGERINE);
    bloom((dx, dy, c) => { if (Math.abs(dx) < 2) v.set(dx, 7 + dy, 4, c); }, ROSE, SUN);
    v.fill(-2, 2, 5, 9, -6, -6, TURQUOISE);
    bloom((dx, dy, c) => { if (Math.abs(dx) < 2) v.set(dx, 7 + dy, -6, c); }, ROSE, TANGERINE);
    v.fill(-2, 2, 11, 11, 1, 4, coat);
    for (let x = -3; x <= 3; x++) for (let z = 0; z <= 5; z++) if (Math.abs(x) === 3 || z === 0 || z === 5) v.set(x, 11, z, (x + z) % 2 ? BEAD : BEAD_LIGHT);
    v.fill(-3, 3, 12, 17, 1, 7, coat);
    for (const x of [-3, 3]) for (const y of [12, 17]) for (let z = 1; z <= 7; z++) v.del(x, y, z);
    bloom((dx, dz, c) => { if (Math.abs(dx) < 2 && Math.abs(dz) < 2) v.set(dx, 17, 4 + dz, c); }, ROSE, TURQUOISE);
    v.fill(-1, 1, 12, 14, 8, 9, CREAM);
    v.set(0, 14, 9, JET); v.set(0, 12, 9, ROSE);
    v.fill(-2, 2, 12, 12, 7, 7, CREAM);
    v.fill(-1, 1, 15, 16, 7, 7, TANGERINE);
    v.set(0, 16, 7, SUN); v.set(0, 17, 7, TURQUOISE); v.set(-1, 17, 7, ROSE); v.set(1, 17, 7, ROSE);
    for (const s of [-1, 1]) {
      v.fill(Math.min(2 * s, 3 * s), Math.max(2 * s, 3 * s), 14, 15, 7, 7, EYE);
      v.set(2 * s, 15, 7, CREAM);
      v.set(2 * s, 16, 7, TURQUOISE); v.set(3 * s, 16, 7, TURQUOISE);
      v.set(2 * s, 13, 7, TANGERINE); v.set(3 * s, 13, 7, ROSE);
      v.set(3 * s, 15, 3, TURQUOISE); v.set(3 * s, 14, 4, SUN); v.set(3 * s, 14, 2, ROSE); v.set(3 * s, 15, 5, TANGERINE);
      [[1, 3], [1, 4], [2, 4], [2, 4], [3, 5], [4, 4]].forEach(([a, b], i) => {
        for (let x = a; x <= b; x++) {
          v.set(x * s, 18 + i, 3, i === 5 ? SUN : VIOLET);
          v.set(x * s, 18 + i, 4, i === 5 ? SUN : x > a && x < b ? TANGERINE : ROSE);
        }
      });
    }
    v.fill(0, 0, 8, 11, -7, -7, (x, y) => [ROSE, TANGERINE, SUN, TURQUOISE][y - 8]);
    v.set(0, 12, -6, ROSE); v.set(0, 12, -5, SUN);
    return (kobe = v);
  };
  const HAT_PALETTE = ["#d8c08a", "#c4a768", "#e8d7a8", "#b39656", "#7a5a3a", "#5e432a"];
  const [STRAW, STRAW_DARK, STRAW_LIGHT, STRAW_OLD, BAND, BAND_DARK] = HAT_PALETTE.map((_, i) => i);
  let hat = null;
  const hatVox = () => {
    if (hat) return hat;
    const v = makeVox();
    const straw = (x, y, z) => {
      const n = speckle(x, y, z);
      return n < 8 ? STRAW_OLD : ((x >> 1) + (z >> 1) + y) & 1 ? (n < 60 ? STRAW : STRAW_LIGHT) : n < 70 ? STRAW_DARK : STRAW;
    };
    for (let y = 18; y <= 26; y++) {
      const inset = y >= 26 ? 3 : y >= 25 ? 1 : 0;
      for (let x = -2 + inset; x <= 15 - inset; x++) for (let z = -2 + inset; z <= 13 - inset; z++) {
        const sideX = x === -2 + inset || x === 15 - inset, sideZ = z === -2 + inset || z === 13 - inset;
        if (sideX && sideZ && y >= 24 || y < 25 && !sideX && !sideZ) continue;
        v.set(x, y, z, y === 20 ? BAND_DARK : y === 21 ? BAND : straw(x, y, z));
      }
    }
    const cx = 7, cz = 6;
    for (let x = -14; x <= 28; x++) for (let z = -14; z <= 26; z++) {
      const d = Math.hypot(x - cx, z - cz) + (speckle(x >> 1, 7, z >> 1) % 3) * 0.35;
      if (d > 16.6 || (x >= -2 && x <= 15 && z >= -2 && z <= 13)) continue;
      const y = d > 15 ? 16 : d > 12.5 ? 17 : 18;
      v.set(x, y, z, straw(x, y, z));
      if (d > 14.6 && speckle(x, 3, z) < 22 && !(z > 14 && Math.abs(x - cx) < 9)) {
        v.set(x, y - 1, z, straw(x, 1, z));
        if (speckle(x, 5, z) < 45) v.set(x, y - 2, z, straw(x, 2, z));
        if (speckle(x, 9, z) < 15) v.set(x, y - 3, z, STRAW_OLD);
      }
    }
    return (hat = v);
  };
  const STICKERS = ["#d8322a", "#f2c230", "#2f9a48", "#f4df3a", "#7a3fa8", "#f4f1e6", "#17130f"];
  const GUITAR_PALETTE = ["#e3b872", "#cf9d55", "#5a2e1c", "#2e1a12", "#120b07", "#efe3c4", "#dcdcd2", "#c9c3b4", "#8a4f22", "#7a4a2a", "#6b3822", ...STICKERS];
  const [TOP, GRAIN, SIDE, DARK, HOLE, BONE, STEEL, TUNER, ROSETTE, NECK, BACK, S_RED, S_GOLD, S_GREEN, S_YELLOW, S_PURPLE, S_WHITE, S_BLACK] = GUITAR_PALETTE.map((_, i) => i);
  const BODY = [3, 4, 4, 4, 3, 3, 4, 5, 5, 5, 5, 4, 3], BODY_Y = 8, BRIDGE_Y = 17;
  let guitar = null;
  const guitarVox = () => {
    if (guitar) return guitar;
    const v = makeVox();
    v.fill(-2, 2, -5, -2, -1, 0, DARK);
    for (const y of [-5, -3]) for (const side of [-1, 1]) { v.set(3 * side, y, -1, TUNER); v.set(side, y, -2, STEEL); }
    v.fill(-1, 1, -1, BODY_Y - 1, 0, 1, NECK);
    v.fill(-1, 1, 0, BODY_Y + 1, -1, -1, DARK);
    for (const y of [3, 6, 9]) v.set(0, y, -1, STEEL);
    v.fill(-1, 1, -1, -1, -2, -1, BONE);
    for (const x of [-1, 1]) v.fill(x, x, 0, BRIDGE_Y - 1, -2, -2, STEEL);
    for (let r = 0; r < BODY.length; r++) {
      const w = BODY[r], y = BODY_Y + r;
      for (let x = -w; x <= w; x++) {
        const edge = Math.abs(x) === w || r === 0 || r === BODY.length - 1 || Math.abs(x) > BODY[r - 1] || Math.abs(x) > BODY[r + 1];
        v.set(x, y, 0, edge ? BONE : (x + 5) % 3 === 0 ? GRAIN : TOP);
        v.fill(x, x, y, y, 1, 3, SIDE);
        v.set(x, y, 4, BACK);
      }
    }
    for (const [r, hole, ring] of [[2, -1, 1], [3, 1, 2], [4, 2, 3], [5, 2, 3], [6, 1, 2], [7, -1, 1]]) {
      const y = BODY_Y + r;
      for (let x = -ring; x <= ring; x++) v.set(x, y, 0, Math.abs(x) <= hole ? HOLE : ROSETTE);
    }
    v.fill(-3, 3, BRIDGE_Y, BRIDGE_Y + 1, -1, -1, DARK);
    v.fill(-2, 2, BRIDGE_Y, BRIDGE_Y, -2, -2, BONE);
    for (const [x, y] of [[-3, 9], [-2, 9], [-2, 10], [-1, 10], [-1, 11], [0, 11]]) v.set(x, y, 4, S_WHITE);
    for (let x = 1; x <= 3; x++) for (let y = 9; y <= 11; y++) v.set(x, y, 4, x === 2 && y === 10 ? S_BLACK : S_WHITE);
    v.set(-1, 13, 4, S_RED); v.set(0, 13, 4, S_BLACK);
    for (let x = -4; x <= 4; x++) { v.set(x, 15, 4, x < -1 ? S_RED : x < 2 ? S_GOLD : S_GREEN); v.set(x, 16, 4, S_BLACK); }
    for (let x = -4; x <= 1; x++) { v.set(x, 17, 4, S_YELLOW); v.set(x, 18, 4, x % 2 ? S_PURPLE : S_YELLOW); }
    v.set(3, 17, 4, S_GOLD); v.set(4, 17, 4, S_GOLD); v.set(3, 18, 4, S_WHITE); v.set(4, 18, 4, S_BLACK);
    v.set(-3, 19, 4, S_WHITE); v.set(-2, 19, 4, S_PURPLE); v.set(0, 19, 4, S_RED); v.set(1, 19, 4, S_WHITE); v.set(3, 19, 4, S_RED);
    for (let x = 1; x <= 3; x++) v.set(x, 19, 0, x === 2 ? S_PURPLE : S_YELLOW);
    return (guitar = v);
  };
  BL.characters.add({
    handle: "Bitcoin-Bill",
    github: "Bitclank-Bill",
    display: "Bitclank-Bill",
    joined: 1792943472,
    lastCommit: 1792943472,
    look: {
      face: "beard", noPupils: true, height: 1.04, petRidesHat: true,
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
      torso(k, v) {
        const skin = k.skinJ, cord = k.color("#2a2018"), coin = k.color("#f7931a");
        v.fill(1, 7, 3, 7, 1, 4, k.color(CARIBBEAN));
        v.fill(1, 1, 7, 7, 1, 4, skin);
        v.fill(7, 7, 7, 7, 1, 4, skin);
        v.fill(3, 5, 6, 7, 4, 4, skin);
        v.set(4, 5, 4, skin);
        v.set(3, 6, 4, cord); v.set(5, 6, 4, cord); v.set(4, 5, 4, cord);
        v.set(4, 4, 4, coin);
      },
      club(k) {
        const v = guitarVox(), unit = k.u / 2, origin = { x: -0.5 * unit, y: 0, z: 0 };
        return {
          default: voxelGeometry(v, { unit, palette: GUITAR_PALETTE, origin }),
          rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 }
        };
      },
      crown(k, v) {
        const grey = k.color("#8b8279"), silver = k.color("#b3aba1");
        for (let y = 2; y <= 8; y++) for (let z = -1; z <= 6; z++) for (const x of [-1, 7]) {
          if (v.has(x, y, z) && k.rand() < 0.35) v.set(x, y, z, k.rand() < 0.5 ? grey : silver);
        }
        for (let x = 0; x <= 6; x++) for (let y = 2; y <= 8; y++) if (v.has(x, y, -1) && k.rand() < 0.25) v.set(x, y, -1, grey);
      },
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
      mark(k, v) {
        const dark = k.color("#3f3732"), mid = k.color("#857c72"), silver = k.color("#c9c3b9"), skip = new Set([k.P.nose, k.P.white, k.P.skin, k.P.skinDk]);
        for (let x = 0; x <= 6; x++) for (let y = -2; y <= 1; y++) for (let z = 5; z <= 7; z++) {
          if (!v.has(x, y, z) || skip.has(v.get(x, y, z))) continue;
          const r = k.rand();
          v.set(x, y, z, y <= -1 ? (r < 0.7 ? silver : mid) : y === 0 ? (r < 0.4 ? silver : r < 0.75 ? mid : dark) : (r < 0.6 ? dark : mid));
        }
      },
      headgear(k) {
        addChild(k.parts.head, createNode({ geometry: voxelGeometry(hatVox(), { unit: k.u / 2, palette: HAT_PALETTE, origin: { x: -3.5 * k.u, y: 0, z: -3 * k.u } }) }));
      },
      refine(k, part, v) {
        if (part !== "torso") return;
        const blue = k.color(CARIBBEAN), deep = k.color("#1a9fc0"), green = k.color("#6fd3ae"), yellow = k.color("#d6e89a"), cells = [];
        v.each((x, y, z, c) => { if (c === blue) cells.push(x, y, z); });
        for (let i = 0; i < cells.length; i += 3) {
          const x = cells[i], y = cells[i + 1], z = cells[i + 2];
          const fade = Math.sin(x * 0.21 + y * 0.12) + Math.sin(y * 0.26 - x * 0.07 + z * 0.1 + 1.3) + (speckle(x, y, z) / 100 - 0.5) * 0.7;
          if (fade > 1.35) v.set(x, y, z, yellow);
          else if (fade > 0.75) v.set(x, y, z, green);
          else if (fade < -1.2) v.set(x, y, z, deep);
        }
      },
      extras(k) {
        const s = 0.7, h = k.h, unit = k.u / 2;
        k.parts.dog = createNode({
          position: { x: 0.55 * h, y: -k.legH, z: -0.25 * h }, scale: { x: s, y: s, z: s },
          geometry: voxelGeometry(kobeVox(), { unit, palette: KOBE_PALETTE, origin: { x: -0.5 * unit, y: 0, z: -0.5 * unit }, emissive: KOBE_GLOW })
        });
        addChild(k.root, k.parts.dog);
      }
    }
  });
})();
