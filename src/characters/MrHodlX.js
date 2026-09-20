(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, ring, merge, forward, cached } = BL.models;
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
  BL.characters.add({
    handle: "MrHodlX",
    joined: 1788800920,
    lastCommit: 1788200000,
    // gasMask also drives the mask's breath smoke in crew.js; nose, beard and mouth sit under the mask
    look: { gasMask: true, hairless: true, noBrow: true, face: "none" },
    dress: {
      hatY: (k) => 0.66 * k.h,
      headgear(k) {
        const h = k.h;
        addChild(k.parts.head, createNode({ scale: { x: h, y: h, z: h }, geometry: gasMaskGeometry() }));
      }
    }
  });
})();
