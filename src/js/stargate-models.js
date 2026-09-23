// Cached, renderer-neutral gate geometry. Local +Y is the front of the horizon.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, M = BL.models, S = BL.scene;
  const rings = new Map();
  let disc, wave, surge, pedestal;
  const build = (radius, outerRadius) => {
    const key = radius + ":" + outerRadius;
    if (!rings.has(key)) rings.set(key, M.lathe({ profile: [[radius, -0.08], [outerRadius, -0.08], [outerRadius, 0.08], [radius, 0.08], [radius, -0.08]], segments: 32, color: "#41596c" }));
    if (!disc) {
      // Both faces are authored: the aperture reads from above/below and front/back in both renderers.
      disc = M.lathe({ profile: [[0, 0], [1, 0], [0, 0]], segments: 32, color: "#287cae", emissive: 0.7 });
      wave = M.ring({ r: 1, thickness: 0.015, segments: 32, color: "#83e0ed", emissive: 0.9 });
      surge = M.lathe({ profile: [[0, 0], [0.65, 0], [0.8, 0.2], [0.45, 0.8], [0.1, 1], [0, 1]], segments: 16, color: "#55bfdc", emissive: 0.8 });
      pedestal = M.merge(M.box({ w: 0.7, h: 0.18, d: 0.7, color: "#485565", offset: { y: 0.09 } }),
        M.box({ w: 0.38, h: 0.8, d: 0.38, color: "#687782", offset: { y: 0.55 } }),
        M.box({ w: 0.8, h: 0.2, d: 0.65, color: "#45687c", offset: { y: 1.0 } }),
        M.box({ w: 0.3, h: 0.04, d: 0.3, color: "#8ae9ee", emissive: 0.8, offset: { y: 1.12 } }));
    }
    const root = S.createNode(), ring = S.createNode({ geometry: rings.get(key) });
    const horizon = S.createNode({ geometry: disc, visible: false, sightHidden: true, scale: { x: radius, y: 1, z: radius } });
    const kawoosh = S.createNode({ geometry: surge, visible: false, sightHidden: true });
    const ripples = Array.from({ length: 3 }, () => S.createNode({ geometry: wave, visible: false, sightHidden: true }));
    S.addChild(root, ring, horizon, kawoosh, ...ripples);
    return { root, horizon, kawoosh, ripples, dialer: S.createNode({ geometry: pedestal }) };
  };
  BL.stargateModels = { build };
})();
