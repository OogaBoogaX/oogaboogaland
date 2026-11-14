(() => {
  "use strict";
  const BL = window.BL;
  const { geometry, pushVert, face, tube, lathe, merge } = BL.models;
  const { hexToRgb } = BL.math;
  const beveledStone = (outline, center, bodyDepth, edgeDepth, color, chipColor) => {
    const geo = geometry(), innerFront = [], innerBack = [], outerFront = [], outerBack = [];
    const bodyHalf = bodyDepth / 2, edgeHalf = edgeDepth / 2;
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
      face(geo, [innerFront[i], outerFront[i], outerFront[next]], i % 3 ? chip : stone);
      face(geo, [innerFront[i], outerFront[next], innerFront[next]], i % 3 ? stone : chip);
      face(geo, [innerBack[i], outerBack[next], outerBack[i]], i % 3 ? chip : stone);
      face(geo, [innerBack[i], innerBack[next], outerBack[next]], i % 3 ? stone : chip);
      face(geo, [outerFront[i], outerBack[i], outerBack[next], outerFront[next]], i % 3 ? chip : stone);
    }
    return geo;
  };
  const stoneAxeGeometry = (h, slim = false) => {
    const u = h / 16, pieces = [], thin = slim ? 0.75 : 1, head = slim ? 0.9 : 1, seat = 12.7;
    const wood = "#4a2b16", woodShade = "#2f1a0d", woodLight = "#68401f";
    const stone = "#68635a";
    const stoneChip = "#918a7c";
    const profile = (points) => points.map(([x, y]) => [x * 0.84 * head * u, (seat + (y - seat) * head) * u]);
    pieces.push(
      tube({
        rings: 12, segments: 8,
        path: (t) => ({ x: Math.sin(t * Math.PI) * (slim ? 0.15 : 0.7) * u, y: (-3 + t * 16.6) * u, z: Math.sin(t * Math.PI * 2) * 0.08 * u }),
        radius: (t) => (1.08 + 0.16 * Math.cos(t * Math.PI * 2) + 0.16 * t) * thin * u,
        colorFn: (t) => t < 0.22 ? woodShade : t > 0.72 ? wood : woodLight
      }),
      lathe({ profile: [[0, -3 * u], [1.45 * thin * u, -2.85 * u], [1.3 * thin * u, -2.3 * u], [1.15 * thin * u, -2.05 * u]], segments: 8, color: woodShade })
    );
    pieces.push(
      beveledStone(profile([[0, 14.1], [-2.3, 14.75], [-4.8, 14.95], [-6.7, 14.3], [-7.65, 13.05], [-7.85, 11.65], [-7.25, 10.4], [-6.1, 9.55], [-4.4, 9.3], [-2.75, 9.85], [-0.95, 10.75], [0.6, 11.35], [2.25, 11.55], [3.75, 11.25], [4.9, 11.7], [6.4, 12.5], [7.25, 13.25], [6, 14], [4.25, 14.5], [2.35, 14.65]]),
        [0, seat * u], 2.3 * head * u, 0.12 * u, stone, stoneChip)
    );
    pieces.push(
      beveledStone(profile([[-1.25, 13.7], [1.2, 14.05], [0.45, 15.95], [-0.3, 17], [-0.9, 15.15]]),
        [0, (seat + 2.2 * head) * u], 2.15 * head * u, 0.1 * u, stone, stoneChip)
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
    look: { portrait: { min: [-1, -2, 0], max: [7, 7, 8] }, stoneAxe: true, hairless: true },
    dress: {
      model(k) {
        const H = BL.heroBody, { makeVox, voxelGeometry } = BL.models, u = k.u;
        const skin = "#e2a468", brown = "#4a2c17", brownDark = "#3a2011", fur = "#6b4226", furDark = "#553219", cream = "#f1e0b5", creamDark = "#e2cb95";
        const wraps = { wrap: fur, wrapDark: "#3a2212", trim: cream };
        const body = H.build(k, {
          skin, pecs: "#a8643a",
          belt: { color: "#5a3a22", gold: "#f0b020", goldDark: "#b9770f", goldLight: "#ffe07a", coin: true },
          skirt: [[2.5, fur, furDark, 0.14], [3.2, cream, creamDark, 0.02]], cuffs: wraps, anklets: wraps
        });
        const red = "#c8342a", redDark = "#8f231b", palette = [red, redDark, brown, brownDark], v = makeVox();
        const tone = (x, y, z) => ((Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
        for (let x = 0; x < 9; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
          const d = [Math.min(x, 8 - x), Math.min(y, 7 - y), Math.min(z, 7 - z)].sort((p, q) => p - q);
          if (d[0] + d[1] === 0 || d[2] <= 1 && d[0] + d[1] + d[2] <= 2 || y === 7 && x === 4 && (z === 3 || z === 4)) continue;
          v.set(x, y, z, tone(x, y, z) < 14 ? 1 : 0);
        }
        for (let x = 1; x <= 7; x++) for (let y = -2; y <= 1; y++) for (let z = 6; z <= 9; z++) {
          if (y < 0 && (x < 2 || x > 6 || y === -2 && tone(x, 9, z) < 34)) continue;
          v.set(x, y, z, tone(x, y, z) < 22 ? 3 : 2);
        }
        const apple = voxelGeometry(v, { unit: u, palette, origin: { x: -4.5 * u, y: 0, z: -4.5 * u } });
        const face = (shut) => {
          const g = BL.models.geometry(), z = 3.501, F = H.FRONT;
          for (const side of [-1, 1]) {
            const X = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)];
            const [bx0, bx1] = X(0, 3.55);
            H.slab(g, H.rect(bx0, bx1, 4, 5.05, z, 0.18, 0.07 * side), F, 1, 0.9, brown, brownDark);
            const [ex0, ex1] = X(1.5, 3.5);
            if (shut) {
              H.slab(g, H.rect(ex0, ex1, 2, 4, z), F, 0.1, 1, redDark);
              H.slab(g, H.rect(ex0, ex1, 2.55, 2.75, z + 0.1), F, 0.03, 1, "#4a120c");
            } else {
              H.slab(g, H.rect(ex0, ex1, 2, 4, z, 0.12), F, 0.06, 1, "#f4f0e6", "#d9d2c2");
              const [px0, px1] = X(1.55, 2.55);
              H.slab(g, H.rect(px0, px1, 2.05, 3.05, z + 0.06, 0.1), F, 0.05, 1, "#17110d");
              const gx = (px0 + px1) / 2 + 0.2;
              H.slab(g, H.rect(gx, gx + 0.28, 2.62, 2.9, z + 0.11), F, 0.03, 1, "#ffffff");
            }
            H.loft(g, [[-0.32, 0.16, 0.16, 0.07, 2 * side, z + 1.68], [-0.2, 0.33, 0.33, 0.14, 2.01 * side, z + 1.7], [0.02, 0.46, 0.46, 0.19, 2.04 * side, z + 1.74], [0.3, 0.5, 0.5, 0.2, 2.08 * side, z + 1.78],
              [0.95, 0.43, 0.43, 0.17, 2.2 * side, z + 1.9], [1.65, 0.27, 0.27, 0.1, 2.38 * side, z + 2], [2.2, 0.05, 0.05, 0.02, 2.52 * side, z + 2.02]],
              ["#e6dabd", "#e6dabd", "#e6dabd", "#e6dabd", "#f3ebd6", "#fcf8ec"]);
          }
          H.noseBlock(g, H.rect(-1.5, 1.5, 2, 4, z, 0.4), F, 1.9, "#b33026", redDark);
          return g;
        };
        const stalk = tube({ rings: 5, segments: 6, path: (t) => ({ x: 0.05 + 0.95 * t * t, y: 7 + 2.9 * t, z: -0.5 - 0.25 * t }), radius: (t) => 0.36 - 0.1 * t, colorFn: (t) => t > 0.8 ? "#7a4a26" : "#63391d" });
        const leafGeo = BL.models.geometry(), lz = -0.55, A = [0.8, 9.3, lz + 0.22], T = [4.5, 10.65, lz + 0.22];
        const U1 = [1.45, 10.4, lz], U2 = [3, 11.1, lz], L1 = [2.3, 9.3, lz], L2 = [3.75, 9.75, lz];
        H.both(leafGeo, [A, T, U2, U1], "#6ad040", "#3f9a2b");
        H.both(leafGeo, [A, L1, L2, T], "#4cae2e", "#398c27");
        const head = (shut) => merge(apple, H.scaled(merge(face(shut), stalk, leafGeo), u));
        return { ...body, headOpen: head(false), headClosed: head(true) };
      },
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
      club: (k) => ({ default: stoneAxeGeometry(k.h, BL.models.STYLE === "R"), rest: { x: 0, y: Math.PI / 2, z: 0.24 }, carry: { x: 0, y: Math.PI / 2, z: 0.95 } }),
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
