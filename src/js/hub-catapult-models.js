// The hub catapult's geometry, after Block Frenzy's (`block-models.js` `catapult`, `catapultArm`, `chute`) in the hub's
// timber and the Ooga island's colours, a fifth larger. In its own frame throwing toward +z, the origin on the ground
// under the frame's middle: `frame`, a timber base on wheel blocks with two uprights, a crossbar and a low front tie,
// and the painted stand board under the bucket that a visitor steps onto (`PAD`); `arm`, the throwing arm and its
// bucket, pivoting at its foot (`PIVOT`) so the hub can swing it; `emblem`, the painted coconut the crossbar wears on
// its front, toward the island, a design feature only (the bucket stays empty); and `chute`, a domed canopy in panels of banana gold and
// cream over four cords down to the shoulders. Every builder is cached.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, merge, turnedY, cached } = BL.models;
  const TIMBER = "#6a4a2a", DARK = "#3a2a1a", ARM = "#8a6440", RAIL = "#5a3a22";
  const GOLD = "#e8b23a", CREAM = "#fff3d6", OCHRE = "#c8742a";
  // Metres in the frame. The arm pivots at PIVOT over the frame's middle and reaches ARM_LEN back along -z to its
  // bucket, which at rest lies on the stand board at PAD; CROSSBAR stands just in front of the pivot, where the arm's
  // whip strikes its back face (WHIP) and its front wears the emblem; FOOTPRINT is the box round all of it on the ground (half width, back and front), which the hub keeps
  // clear of paths, caves and props.
  const PIVOT = { y: 0.54, z: 0.3 }, ARM_LEN = 2.5, CROSSBAR = { y: 1.92, z: 0.65, d: 0.24 };
  const PAD = { z: -2.15, half: 0.78, top: 0.06 };
  // The arm's angle about x at rest, its bucket on the board, and at the top of its whip, against the crossbar.
  const REST = -0.19, WHIP = 1.66;
  const FOOTPRINT = { half: 1.15, back: -3, front: 1.45 };
  const frame = cached(() => {
    const parts = [];
    for (const x of [-0.84, 0.84]) {
      parts.push(bevelBox({ w: 0.24, h: 0.29, d: 2.64, color: TIMBER, offset: { x, y: 0.36 } }));
      for (const z of [-0.96, 0.96]) parts.push(bevelBox({ w: 0.17, h: 0.6, d: 0.6, color: DARK, offset: { x: x * 1.15, y: 0.3, z } }));
      parts.push(bevelBox({ w: 0.19, h: 1.68, d: 0.19, color: TIMBER, offset: { x, y: 1.2, z: CROSSBAR.z } }));
    }
    parts.push(bevelBox({ w: 1.92, h: 0.24, d: CROSSBAR.d, color: DARK, offset: { y: CROSSBAR.y, z: CROSSBAR.z } }));
    parts.push(box({ w: 1.92, h: 0.19, d: 0.19, color: TIMBER, offset: { y: 0.42, z: 1.1 } }));
    // The stand board: planks with an ochre ring painted round where the bucket rests, so it reads as the way in.
    for (let k = -2; k <= 2; k++) parts.push(box({ w: PAD.half * 2, h: PAD.top, d: 0.3, color: k % 2 ? RAIL : TIMBER, offset: { y: PAD.top / 2, z: PAD.z + k * 0.31 } }));
    for (const s of [-1, 1]) {
      parts.push(box({ w: PAD.half * 2 - 0.1, h: 0.012, d: 0.08, color: OCHRE, emissive: 0.25, offset: { y: PAD.top + 0.006, z: PAD.z + s * (PAD.half - 0.12) } }));
      parts.push(box({ w: 0.08, h: 0.012, d: PAD.half * 2 - 0.1, color: OCHRE, emissive: 0.25, offset: { x: s * (PAD.half - 0.12), y: PAD.top + 0.006, z: PAD.z } }));
    }
    return merge(...parts);
  });
  const arm = cached(() => merge(
    bevelBox({ w: 0.19, h: 0.19, d: ARM_LEN, color: ARM, offset: { z: -ARM_LEN / 2 } }),
    bevelBox({ w: 0.72, h: 0.12, d: 0.72, color: TIMBER, offset: { y: 0.06, z: -ARM_LEN } }),
    box({ w: 0.78, h: 0.24, d: 0.1, color: RAIL, offset: { y: 0.18, z: -ARM_LEN - 0.36 } }),
    box({ w: 0.1, h: 0.2, d: 0.72, color: RAIL, offset: { x: -0.36, y: 0.16, z: -ARM_LEN } }),
    box({ w: 0.1, h: 0.2, d: 0.72, color: RAIL, offset: { x: 0.36, y: 0.16, z: -ARM_LEN } })
  ));
  // The painted coconut: the arcade's coconut (`arcadeModelsSceneKit.nut`) in Bitcoin orange paint, its fibre streaks
  // and three dark eyes showing through, round so it sits half proud of the crossbar's face.
  const emblem = cached(() => BL.arcadeModelsSceneKit.nut("#f7931a", 0.2, false, false));
  const chute = cached(() => {
    const parts = [];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      parts.push(turnedY(box({ w: 1.14, h: 0.14, d: 0.84, color: k % 2 ? GOLD : CREAM, emissive: 0.15, offset: { y: 3.84, z: 1.02 } }), a));
      parts.push(turnedY(box({ w: 0.84, h: 0.12, d: 0.6, color: k % 2 ? CREAM : GOLD, offset: { y: 4.14, z: 0.42 } }), a));
    }
    for (const [x, z] of [[-1.08, -1.08], [1.08, -1.08], [-1.08, 1.08], [1.08, 1.08]]) {
      const n = 6;
      for (let k = 0; k < n; k++) parts.push(box({ w: 0.036, h: 0.38, d: 0.036, color: "#ddd2b8", offset: { x: x * (0.25 + 0.75 * k / n), y: 2.04 + k * 0.3, z: z * (0.25 + 0.75 * k / n) } }));
    }
    const geo = merge(...parts);
    geo.castShadow = false;
    return geo;
  });
  BL.hubCatapultModels = { frame, arm, emblem, chute, PIVOT, ARM_LEN, CROSSBAR, PAD, REST, WHIP, FOOTPRINT };
})();
