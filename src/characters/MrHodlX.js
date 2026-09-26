(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, ring, merge, forward, cached, geometry, pushVert, face, tube } = BL.models;
  const { hexToRgb } = BL.math;
  const { createNode, addChild } = BL.scene;
  // crew.js MASK_PORTS match the centre hole and six surrounding holes here.
  const gasMaskGeometry = cached(() => {
    const shell = "#3a3d35", trim = "#2a2d27", metal = "#5b6066";
    const hood = lathe({ profile: [[0.29, -0.06], [0.31, 0.1], [0.31, 0.3], [0.28, 0.46], [0.2, 0.58], [0.08, 0.66], [0, 0.68]], segments: 14, color: shell });
    const snout = forward(lathe({ profile: [[0.17, 0], [0.16, 0.06], [0.13, 0.13], [0.11, 0.16]], segments: 12, color: shell }), { y: 0.1, z: 0.24 });
    const filter = forward(lathe({ profile: [[0, 0], [0.12, 0], [0.13, 0.05], [0.1, 0.07], [0, 0.07]], segments: 12, color: metal }), { y: 0.1, z: 0.39 });
    const lens = (x) => merge(
      forward(lathe({ profile: [[0.06, 0], [0.09, 0], [0.095, 0.03], [0.06, 0.03]], segments: 12, color: metal }), { x, y: 0.22, z: 0.28 }),
      forward(lathe({ profile: [[0, 0], [0.065, 0], [0.065, 0.005], [0, 0.005]], segments: 12, color: "#ff2a1e", emissive: 1 }), { x, y: 0.22, z: 0.31 })
    );
    const tube = (x) => forward(lathe({ profile: [[0.03, 0], [0.038, 0.02], [0.038, 0.11], [0.03, 0.13], [0, 0.13]], segments: 10, color: metal }), { x, y: 0.09, z: 0.2 });
    const holes = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i / 6 * Math.PI * 2) * 0.065, Math.sin(i / 6 * Math.PI * 2) * 0.065])]
      .map(([hx, hy]) => box({ w: 0.03, h: 0.03, d: 0.008, color: "#0f1113", offset: { x: hx, y: 0.1 + hy, z: 0.463 } }));
    return merge(hood, snout, filter, ...holes, lens(-0.12), lens(0.12), tube(-0.21), tube(0.21), ring({ r: 0.315, thickness: 0.02, y: 0.4, segments: 14, color: trim }));
  });
  const hockeyStickGeometry = (h, gold = false) => {
    const u = h / 16, shaft = geometry(), blade = geometry(), shaftRings = [], bladeSections = [];
    const bladeSegments = 28, bladeRise = 2.8;
    const shaftColor = hexToRgb(gold ? "#a77b32" : "#292e31");
    const shaftSide = hexToRgb(gold ? "#805a25" : "#1b2023");
    const tape = (gold ? ["#e8cf8d", "#cba95d", "#dfc27c"] : ["#e1dfd7", "#b9b9b3", "#d1d0ca"]).map(hexToRgb);
    const tapeEdge = hexToRgb(gold ? "#ad8848" : "#999b98");
    const seam = gold ? "#765922" : "#777b7a";
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, y = (-3 + 18.2 * t) * u, w = 0.8 * u, d = 0.52 * u;
      shaftRings.push([pushVert(shaft, -w, y, -d), pushVert(shaft, w, y, -d),
        pushVert(shaft, w, y, d), pushVert(shaft, -w, y, d)]);
      if (!i) continue;
      for (let side = 0; side < 4; side++) face(shaft,
        [shaftRings[i - 1][side], shaftRings[i][side], shaftRings[i][(side + 1) % 4], shaftRings[i - 1][(side + 1) % 4]],
        t <= 0.2 ? tape[1] : side % 2 ? shaftSide : shaftColor);
    }
    face(shaft, shaftRings[0], tape[1]);
    const gripWrap = tube({ rings: 80, segments: 4, radius: () => 0.025 * u, colorFn: () => seam,
      path: (t) => {
        const around = t * 16, edge = Math.floor(around) % 4, along = around - Math.floor(around);
        const w = 0.8 * u, d = 0.52 * u;
        return { x: edge === 0 ? -w + 2 * w * along : edge === 1 ? w : edge === 2 ? w - 2 * w * along : -w,
          y: (-3 + 3.64 * t) * u,
          z: edge === 0 ? d : edge === 1 ? d - 2 * d * along : edge === 2 ? -d : -d + 2 * d * along };
      } });
    const bladeShape = (t) => {
      const heelT = Math.min(1, t / 0.4), heel = heelT * heelT * (3 - 2 * heelT);
      const toeT = Math.max(0, (t - 0.78) / 0.22), toe = Math.sqrt(Math.max(0.01, 1 - toeT * toeT));
      const dx = 8.5 * (4 * t - 3 * t * t), dy = 3 * bladeRise * (1 - t) * (1 - t);
      const length = Math.hypot(dx, dy);
      return { x: -8.5 * t * t * (2 - t) * u, y: (15.2 + bladeRise * (1 - (1 - t) ** 3)) * u,
        z: 1.15 * t * t * (3 - 2 * t) * u, nx: dy / length, ny: dx / length,
        halfY: (0.8 + 0.85 * heel) * toe * u, halfZ: (0.52 - 0.1 * t) * toe * u };
    };
    for (let i = 0; i <= bladeSegments; i++) {
      const s = bladeShape(i / bladeSegments), wx = s.nx * s.halfY, wy = s.ny * s.halfY;
      bladeSections.push([pushVert(blade, s.x - wx, s.y - wy, s.z - s.halfZ),
        pushVert(blade, s.x + wx, s.y + wy, s.z - s.halfZ),
        pushVert(blade, s.x + wx, s.y + wy, s.z + s.halfZ),
        pushVert(blade, s.x - wx, s.y - wy, s.z + s.halfZ)]);
      if (!i) continue;
      const a = bladeSections[i - 1], b = bladeSections[i], taped = i >= 11 && i <= 21;
      const color = taped ? tape[Math.floor((i - 11) / 3) % tape.length] : shaftColor;
      const edge = taped ? tapeEdge : shaftSide;
      for (let side = 0; side < 4; side++) face(blade,
        [a[side], b[side], b[(side + 1) % 4], a[(side + 1) % 4]], side % 2 ? edge : color);
    }
    face(blade, [...bladeSections[bladeSegments]].reverse(), shaftSide);
    const wraps = [];
    for (let i = 0; i <= 6; i++) {
      const s = bladeShape(0.35 + i * (0.4 / 6));
      wraps.push(tube({ rings: 12, segments: 4, radius: () => 0.025 * u, colorFn: () => seam,
        path: (t) => {
          const edge = Math.min(3, Math.floor(t * 4)), along = t * 4 - edge;
          const halfY = s.halfY - 0.035 * u;
          const across = edge === 0 ? -halfY + 2 * halfY * along
            : edge === 2 ? halfY - 2 * halfY * along : edge === 1 ? halfY : -halfY;
          const z = edge === 0 ? s.z + s.halfZ : edge === 2 ? s.z - s.halfZ
            : edge === 1 ? s.z + s.halfZ * (1 - 2 * along) : s.z - s.halfZ * (1 - 2 * along);
          const skew = across / s.halfY * 0.18 * u;
          return { x: s.x + s.nx * across - s.ny * skew, y: s.y + s.ny * across + s.nx * skew, z };
        } }));
    }
    const stick = merge(shaft, blade, gripWrap, ...wraps);
    stick.stoneAxe = true;
    stick.weaponLength = 20 * u;
    return stick;
  };
  BL.characters.add({
    handle: "MrHodlX",
    joined: 1788800920,
    lastCommit: 1788200000,
    // gasMask also drives the mask's breath smoke in crew.js; nose, beard and mouth sit under the mask
    look: { gasMask: true, stoneAxe: true, hairless: true, noBrow: true, face: "none" },
    dress: {
      hatY: (k) => 0.66 * k.h,
      club: (k) => ({ default: hockeyStickGeometry(k.h), gold: hockeyStickGeometry(k.h, true), rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } }),
      headgear(k) {
        const h = k.h;
        addChild(k.parts.head, createNode({ scale: { x: h, y: h, z: h }, geometry: gasMaskGeometry() }));
      }
    }
  });
})();
