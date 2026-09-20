(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, box, lathe, tube, merge, forward } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { hexToRgb } = BL.math;
  const newspaperVoxels = (rand) => {
    const v = makeVox();
    const paperJ = () => rand() < 0.1 ? 1 : 0;
    v.fill(-2, 4, 2, 10, 0, 1, paperJ);
    for (const z of [0, 1]) {
      v.fill(-2, 4, 9, 9, z, z, 2);
      v.fill(-2, 1, 4, 7, z, z, 3);
      for (const [cx, cy] of [[-2, 4], [-2, 7], [1, 4], [1, 7]]) v.set(cx, cy, z, 0);
      for (const y of [4, 5, 6, 7]) v.fill(3, 4, y, y, z, z, 1);
      for (const y of [2, 3]) v.fill(-2, 3, y, y, z, z, 1);
    }
    return v;
  };
  const NEWS_PALETTE = [hexToRgb("#fbfaf6"), hexToRgb("#8d8880"), hexToRgb("#2b2b2b"), hexToRgb("#f7931a")];
  const GOLD_NEWS_PALETTE = [hexToRgb("#e0b53a"), hexToRgb("#c99a2e"), hexToRgb("#6b5416"), hexToRgb("#f0c95a")];
  const stethoscopeCache = new Map();
  // One tube: bell at one end, forked earpieces at the other, nothing converging (it would read as a chain).
  // The bell sits clear of the arm that carries the paper; brass collars tie the hardware together.
  const stethoscopeGeometry = (h) => {
    let geo = stethoscopeCache.get(h);
    if (!geo) {
      const DARK = "#2e2e30", GOLD = "#f2b81c", INSET = "#3a2a12";
      const BELL = { x: 0.17, y: 0.125, z: 0.23 }, EAR = { x: -0.16, y: 0.21, z: 0.22 };
      const path = (t) => ({ x: 0.16 * Math.cos(Math.PI * t) * h, y: (0.14 + 0.36 * Math.sin(Math.PI * t) + 0.06 * t) * h, z: (0.22 - 0.28 * Math.sin(Math.PI * t)) * h });
      const slung = tube({ rings: 20, segments: 6, path, radius: () => 0.023 * h, colorFn: () => DARK });
      const collar = (t) => box({ w: 0.052 * h, h: 0.052 * h, d: 0.052 * h, color: GOLD, offset: path(t) });
      const prong = (side) => tube({
        rings: 6,
        segments: 5,
        path: (u) => ({ x: (EAR.x + side * 0.045 * u) * h, y: (EAR.y - 0.105 * u) * h, z: (EAR.z + 0.012 * u) * h }),
        radius: () => 0.016 * h,
        colorFn: () => DARK
      });
      const tip = (side) => box({ w: 0.042 * h, h: 0.042 * h, d: 0.042 * h, color: GOLD, offset: { x: (EAR.x + side * 0.045) * h, y: (EAR.y - 0.115) * h, z: (EAR.z + 0.012) * h } });
      const face = (w, hh, x, y) => box({ w: w * h, h: hh * h, d: 0.01 * h, color: GOLD, offset: { x: (BELL.x + x) * h, y: (BELL.y + y) * h, z: (BELL.z + 0.03) * h } });
      const disc = (r, d, color) => forward(lathe({ profile: [[0, 0], [r * h, 0], [r * h, d * h], [0, d * h]], segments: 18, color }), { x: BELL.x * h, y: BELL.y * h, z: BELL.z * h });
      geo = merge(
        slung, collar(0.16), collar(0.34), collar(0.66), collar(0.86),
        prong(-1), prong(1), tip(-1), tip(1),
        disc(0.072, 0.018, GOLD),
        disc(0.052, 0.026, INSET),
        face(0.011, 0.058, -0.013, 0),
        face(0.03, 0.011, 0.002, 0.021),
        face(0.03, 0.011, 0.002, 0),
        face(0.03, 0.011, 0.002, -0.021),
        face(0.011, 0.014, 0.016, 0.011),
        face(0.011, 0.014, 0.016, -0.011),
        face(0.009, 0.014, -0.002, 0.034),
        face(0.009, 0.014, -0.002, -0.034)
      );
      stethoscopeCache.set(h, geo);
    }
    return geo;
  };
  BL.characters.add({
    handle: "DrNeski",
    joined: 1789692980,
    lastCommit: 1788219000,
    // Laser eyes: lit orange, open or closed, with no pupils
    look: { eyeColor: "#f7931a", eyeGlow: 1, noPupils: true, hair: "#f2ece0" },
    voice: {
      poke: "You've got 10 seconds!",
      idle: ["You are fired!", "Where is Kortik??", "Go rebalance your Node!", "Get laid on the 1st date", "What's your question for DrNeski?", "I sold my neighbor ex's cat for sats"]
    },
    dress: {
      // The paper stands upright in the grip, rolled slightly.
      club: (k) => ({ voxels: newspaperVoxels(k.rand), palette: NEWS_PALETTE, goldPalette: GOLD_NEWS_PALETTE, rest: { x: 0.2, z: 0.1 } }),
      gear(k) {
        addChild(k.root, createNode({ geometry: stethoscopeGeometry(k.h) }));
      },
      // A pale mane: a cap over the crown, locks standing off it, longer hair past the ears
      crown(k, v) {
        const P = k.P, rand = k.rand;
        v.fill(-1, 7, 6, 8, -1, 6, k.hairJ);
        for (const [lx, lz] of [[-2, 0], [-2, 3], [-1, -2], [2, -2], [5, -2], [8, 0], [8, 3], [-2, 5], [8, 5], [0, 7], [4, 7], [7, 7]]) {
          for (let i = 0, n = 3 + Math.floor(rand() * 4); i < n; i++) v.set(lx, 7 + i, lz, rand() < 0.3 ? P.hairDk : P.hair);
        }
        for (const [sx, sz] of [[-1, -1], [-1, 1], [-1, 4], [7, -1], [7, 1], [7, 4]]) {
          for (let y = -2; y <= 5; y++) v.set(sx, y, sz, rand() < 0.25 ? P.hairDk : P.hair);
        }
        // The band sits proud of the hair it holds back
        v.fill(-1, 7, 4, 5, -1, 6, k.jit(k.color("#c8342a"), k.color("#8f231b"), 0.25));
      }
    }
  });
})();
