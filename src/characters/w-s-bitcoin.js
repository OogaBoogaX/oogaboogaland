(() => {
  "use strict";
  const BL = window.BL;
  const { geometry, pushVert, face, tube, lathe, merge } = BL.models;
  const { hexToRgb } = BL.math;
  const beveledStone = (outline, center, bodyDepth, edgeDepth, color, chipColor) => {
    const geo = geometry(), innerFront = [], innerBack = [], outerFront = [], outerBack = [];
    const bodyHalf = bodyDepth / 2, edgeHalf = edgeDepth / 2;
    // Both outlines wind counterclockwise around a center inside every facet.
    // The thick shoulder ends well before the cutting edge: no flat extrusion
    // lies underneath the bevel and hides its taper when viewed from the side.
    for (let i = 0; i < outline.length; i++) {
      const point = outline[i], inset = 0.68 + (i % 3) * 0.025;
      const x = center[0] + (point[0] - center[0]) * inset;
      const y = center[1] + (point[1] - center[1]) * inset;
      const shoulder = bodyHalf * (0.84 + (i % 4) * 0.04);
      innerFront.push(pushVert(geo, x, y, shoulder));
      innerBack.push(pushVert(geo, x, y, -shoulder));
      outerFront.push(pushVert(geo, point[0], point[1], edgeHalf));
      outerBack.push(pushVert(geo, point[0], point[1], -edgeHalf));
    }
    const front = pushVert(geo, center[0], center[1], bodyHalf);
    const back = pushVert(geo, center[0], center[1], -bodyHalf);
    const stone = hexToRgb(color), chip = hexToRgb(chipColor);
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      face(geo, [front, innerFront[i], innerFront[next]], stone);
      face(geo, [back, innerBack[next], innerBack[i]], stone);
      // Separate triangles preserve the changing angle of each chipped facet
      // in both renderers instead of assigning one normal to a twisted quad.
      face(geo, [innerFront[i], outerFront[i], outerFront[next]], i % 3 ? chip : stone);
      face(geo, [innerFront[i], outerFront[next], innerFront[next]], i % 3 ? stone : chip);
      face(geo, [innerBack[i], outerBack[next], outerBack[i]], i % 3 ? chip : stone);
      face(geo, [innerBack[i], innerBack[next], outerBack[next]], i % 3 ? stone : chip);
      face(geo, [outerFront[i], outerBack[i], outerBack[next], outerFront[next]], i % 3 ? chip : stone);
    }
    return geo;
  };
  const stoneAxeGeometry = (h, gold = false) => {
    const u = h / 16, pieces = [];
    const wood = "#4a2b16", woodShade = "#2f1a0d", woodLight = "#68401f";
    const stone = gold ? "#b28b35" : "#68635a";
    const stoneChip = gold ? "#d1ad56" : "#918a7c";
    const profile = (points) => points.map(([x, y]) => [x * 0.84 * u, y * u]);
    // One slightly bowed hardwood haft, spanning the same twenty voxels as
    // timechainb's staff from its butt to the point above the axe head.
    pieces.push(
      tube({
        rings: 12, segments: 8,
        path: (t) => ({ x: Math.sin(t * Math.PI) * 0.7 * u, y: (-3 + t * 16.6) * u, z: Math.sin(t * Math.PI * 2) * 0.08 * u }),
        radius: (t) => (1.08 + 0.16 * Math.cos(t * Math.PI * 2) + 0.16 * t) * u,
        colorFn: (t) => t < 0.22 ? woodShade : t > 0.72 ? wood : woodLight
      }),
      lathe({ profile: [[0, -3 * u], [1.45 * u, -2.85 * u], [1.3 * u, -2.3 * u], [1.15 * u, -2.05 * u]], segments: 8, color: woodShade })
    );
    // A single fieldstone head tapers from its thick center to a narrow rim on
    // both the rounded left blade and pointed right blade. Angled chipped faces
    // form the stone itself, including its irregular underside.
    pieces.push(
      beveledStone(profile([[0, 14.1], [-2.3, 14.75], [-4.8, 14.95], [-6.7, 14.3], [-7.65, 13.05], [-7.85, 11.65], [-7.25, 10.4], [-6.1, 9.55], [-4.4, 9.3], [-2.75, 9.85], [-0.95, 10.75], [0.6, 11.35], [2.25, 11.55], [3.75, 11.25], [4.9, 11.7], [6.4, 12.5], [7.25, 13.25], [6, 14], [4.25, 14.5], [2.35, 14.65]]),
        [0, 12.7 * u], 2.3 * u, 0.12 * u, stone, stoneChip)
    );
    // A separate matching stone point is wedged vertically above the head;
    // both rims share their adjacent stone facets' color without a dark seam.
    pieces.push(
      beveledStone(profile([[-1.25, 13.7], [1.2, 14.05], [0.45, 15.95], [-0.3, 17], [-0.9, 15.15]]),
        [0, 14.9 * u], 2.15 * u, 0.1 * u, stone, stoneChip)
    );
    const axe = merge(...pieces);
    axe.stoneAxe = true;
    axe.weaponLength = 20 * u;
    return axe;
  };
  BL.characters.add({
    handle: "w-s-bitcoin",
    joined: 1788800916,
    lastCommit: 1788178261,
    // stoneAxe also drives the axe stance in crew.js
    look: { stoneAxe: true, hairless: true, hatY: 8 },
    dress: {
      // An apple for a head: red with a wooden stalk and a leaf
      skull(k, v) {
        const apple = k.color("#c8342a"), appleDk = k.color("#8f231b");
        const appleJ = k.jit(apple, appleDk, 0.14);
        v.fill(-1, 7, 0, 7, -1, 5, appleJ);
        for (let x = -1; x <= 7; x++) {
          for (let z = -1; z <= 5; z++) {
            const rim = x === -1 || x === 7 || z === -1 || z === 5;
            if (rim) v.del(x, 7, z);
            if (x === -1 || x === 7 || z === -1) v.del(x, 0, z);
          }
        }
        v.fill(1, 5, 0, 1, 6, 6, appleJ);
        v.set(3, 8, 2, k.P.wood);
        v.set(3, 9, 2, k.P.wood);
        v.set(4, 9, 2, k.color("#4f8a3d"));
        k.nose = [appleDk, apple];
        return true;
      },
      // The axe rests at 0.24; carried while working it hangs like a club.
      club: (k) => ({ default: stoneAxeGeometry(k.h), gold: stoneAxeGeometry(k.h, true), rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } }),
      // Repaint the stubble beside the tusks so both sides stay a clean mirror pair.
      mark(k, v) {
        const P = k.P;
        for (let x = 0; x <= 6; x++) {
          for (let y = 0; y <= 1; y++) {
            v.set(x, y, 7, P.hair);
            for (let z = 5; z <= 6; z++) if (v.get(x, y, z) === P.stubble) v.set(x, y, z, P.hair);
          }
        }
        for (const x of [0, 6]) {
          v.set(x, 0, 7, P.stubble);
          v.set(x, 1, 7, P.stubble);
          v.del(x, 0, 6);
        }
        v.set(1, 0, 7, P.white);
        v.set(5, 0, 7, P.white);
      }
    }
  });
})();
