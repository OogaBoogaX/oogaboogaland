(() => {
  "use strict";
  const BL = window.BL;
  const { geometry, pushVert, face, box, lathe, tube, merge, forward } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { hexToRgb } = BL.math;
  // A slab facing +z with quarter-arc corners and bevelled front and back edges. Three points a
  // corner keep each cap within the canvas fallback's sixteen-vertex face.
  const slab = ({ w, h, d, r, bevel = 0, color, offset }) => {
    const geo = geometry(), rgb = hexToRgb(color);
    const ring = (inset, z) => {
      const out = [], hw = w / 2 - inset, hh = h / 2 - inset, rr = r - inset;
      for (let c = 0; c < 4; c++) {
        const cx = c === 0 || c === 3 ? hw - rr : rr - hw, cy = c < 2 ? hh - rr : rr - hh;
        for (let j = 0; j <= 2; j++) {
          const a = (c + j / 2) * Math.PI / 2;
          out.push(pushVert(geo, offset.x + cx + rr * Math.cos(a), offset.y + cy + rr * Math.sin(a), offset.z + z));
        }
      }
      return out;
    };
    const rings = bevel ? [ring(bevel, -d / 2), ring(0, bevel - d / 2), ring(0, d / 2 - bevel), ring(bevel, d / 2)] : [ring(0, -d / 2), ring(0, d / 2)];
    for (let p = 0; p < rings.length - 1; p++) {
      const a = rings[p], b = rings[p + 1];
      for (let i = 0; i < a.length; i++) face(geo, [a[i], a[(i + 1) % a.length], b[(i + 1) % a.length], b[i]], rgb);
    }
    face(geo, rings[rings.length - 1], rgb);
    face(geo, rings[0].slice().reverse(), rgb);
    return geo;
  };
  const MEDKIT = { shell: "#f4f1ea", seam: "#2e2e30", cross: "#f7931a", grip: "#2e2e30", brass: "#f2b81c" };
  const GOLD_MEDKIT = { shell: "#e0b53a", seam: "#6b5416", cross: "#f0c95a", grip: "#6b5416", brass: "#c99a2e" };
  const medkitCache = new Map();
  // A clamshell case standing on the fist: a dark seam round its middle, a raised cross on both lids,
  // latches on the ends, and the stethoscope's dark grip and brass on top.
  const medkitGeometry = (h, pal) => {
    const key = `${h}:${pal === MEDKIT ? "kit" : "gold"}`;
    let geo = medkitCache.get(key);
    if (!geo) {
      const W = 0.42, H = 0.32, D = 0.17, R = 0.06, X = 0.03, Y = 0.235, TOP = Y + H / 2;
      const at = (x, y, z) => ({ x: x * h, y: y * h, z: z * h });
      const part = (w, hh, d, color, x, y, z) => box({ w: w * h, h: hh * h, d: d * h, color, offset: at(x, y, z) });
      const cross = (side) => merge(part(0.2, 0.064, 0.014, pal.cross, X, Y, side * (D / 2 + 0.004)), part(0.064, 0.2, 0.014, pal.cross, X, Y, side * (D / 2 + 0.004)));
      const grip = tube({
        rings: 12,
        segments: 6,
        path: (t) => at(X - 0.1 * Math.cos(Math.PI * t), TOP + 0.012 + 0.07 * Math.sin(Math.PI * t), 0),
        radius: () => 0.019 * h,
        colorFn: () => pal.grip
      });
      geo = merge(
        slab({ w: W * h, h: H * h, d: D * h, r: R * h, bevel: 0.018 * h, color: pal.shell, offset: at(X, Y, 0) }),
        slab({ w: (W + 0.014) * h, h: (H + 0.014) * h, d: 0.028 * h, r: (R + 0.007) * h, color: pal.seam, offset: at(X, Y, 0) }),
        cross(1), cross(-1), grip,
        part(0.05, 0.03, 0.05, pal.brass, X - 0.1, TOP + 0.012, 0),
        part(0.05, 0.03, 0.05, pal.brass, X + 0.1, TOP + 0.012, 0),
        part(0.02, 0.07, 0.05, pal.brass, X - W / 2 - 0.009, Y, 0),
        part(0.02, 0.07, 0.05, pal.brass, X + W / 2 + 0.009, Y, 0)
      );
      medkitCache.set(key, geo);
    }
    return geo;
  };
  const stethoscopeCache = new Map();
  // One tube: bell at one end, forked earpieces at the other, nothing converging (it would read as a chain).
  // The bell sits clear of the arm that carries the kit; brass collars tie the hardware together.
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
    // GitHub login behind the handle, for activity and the jumbotron
    github: "drneski",
    joined: 1789692980,
    lastCommit: 1788219000,
    // Laser eyes: lit orange, open or closed, with no pupils
    look: { eyeColor: "#f7931a", eyeGlow: 1, noPupils: true, hair: "#f2ece0" },
    voice: {
      poke: "You've got 10 seconds!",
      idle: ["You are fired!", "Where is Kortik??", "Go rebalance your Node!", "Get laid on the 1st date", "What's your question for DrNeski?", "I sold my neighbor ex's cat for sats"]
    },
    dress: {
      // The kit stands upright in the grip, rolled slightly. The voxel paper it replaced drew 126
      // jitter values; a geometry club still draws the stock club's 116 after this hook, so ten
      // more here keep his face and mane as they were.
      club(k) {
        for (let i = 0; i < 10; i++) k.rand();
        return { default: medkitGeometry(k.h, MEDKIT), gold: medkitGeometry(k.h, GOLD_MEDKIT), rest: { x: 0.2, z: 0.1 } };
      },
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
