(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { hexToRgb } = BL.math;
  const AXE = BL.models.STYLE === "R";
  const staffVoxels = (rand) => {
    const v = makeVox();
    const woodJ = () => rand() < 0.2 ? 1 : 0;
    v.fill(0, 0, -2, 15, 0, 0, woodJ);
    for (const y of [3, 8, 12]) v.set(rand() < 0.5 ? -1 : 1, y, 0, 1);
    for (const [y, z] of [[16, 0], [17, 1], [17, 2], [16, 3], [15, 3]]) v.set(AXE ? -z : 0, y, AXE ? 0 : z, woodJ());
    return v;
  };
  const LION_PALETTE = [hexToRgb("#d4a04a"), hexToRgb("#bd8b38"), hexToRgb("#a5602a"), hexToRgb("#7d4520"), hexToRgb("#ecc98a"), hexToRgb("#141414"),
    hexToRgb("#f2b33d"), hexToRgb("#3b241a")];
  const LION_U = 0.04, L = { fur: 0, furDk: 1, mane: 2, maneDk: 3, cream: 4, black: 5, amber: 6, nose: 7 };
  const lionBody = (rand) => {
    const v = makeVox();
    const fur = () => rand() < 0.15 ? L.furDk : L.fur;
    const mane = () => rand() < 0.35 ? L.maneDk : L.mane;
    v.fill(-4, 3, 6, 12, -7, 7, fur);
    v.fill(-2, 1, 6, 6, -5, 5, L.cream);
    v.fill(-4, 3, 10, 16, 6, 11, fur);
    v.fill(-7, 6, 6, 20, 4, 10, (x, y, z) => {
      const dx = (x + 0.5) / 7.2, dy = (y - 13) / 7.2, ring = dx * dx + dy * dy <= 1;
      if (!ring) return null;
      const face = x >= -4 && x <= 3 && y >= 9 && y <= 16;
      return face && z > 7 ? null : mane();
    });
    v.fill(-3, 2, 7, 9, 9, 11, mane);
    v.fill(-3, 2, 15, 15, 11, 11, L.furDk);
    for (const [x, pupil] of [[-3, -2], [2, 1]]) { v.set(x, 14, 11, L.amber); v.set(pupil, 14, 11, L.black); }
    v.fill(-3, 2, 10, 12, 12, 12, L.cream);
    v.fill(-2, 1, 13, 13, 12, 12, L.nose);
    v.fill(-1, 0, 12, 12, 12, 13, L.nose);
    v.fill(-1, 0, 11, 11, 12, 12, L.nose);
    v.set(-2, 10, 12, L.nose);
    v.set(1, 10, 12, L.nose);
    for (const x of [-3, 2]) v.set(x, 11, 12, L.furDk);
    v.fill(-2, 1, 9, 9, 11, 12, L.cream);
    for (const x of [-5, 3]) {
      v.fill(x, x + 1, 19, 20, 9, 10, fur);
      v.fill(x, x + 1, 19, 19, 10, 10, L.maneDk);
    }
    return v;
  };
  const lionLeg = () => {
    const v = makeVox();
    v.fill(-1, 1, -6, -1, -1, 1, (x, y) => y === -6 ? L.furDk : L.fur);
    return v;
  };
  const lionTail = () => {
    const v = makeVox();
    for (const [y, z] of [[0, 0], [0, -1], [-1, -2], [-2, -3], [-3, -4], [-4, -4], [-5, -4]]) v.set(0, y, z, L.fur);
    v.fill(-1, 1, -7, -6, -5, -3, (x, y, z) => (x + y + z) % 2 ? L.maneDk : L.mane);
    return v;
  };
  const lionCub = (k) => {
    const U = LION_U, h = k.h, centred = { x: -U / 2, y: 0, z: -U / 2 };
    const node = createNode({ position: { x: 0.7 * h, y: -k.legH, z: -0.2 * h }, geometry: voxelGeometry(lionBody(k.rand), { unit: U, palette: LION_PALETTE }) });
    const leg = voxelGeometry(lionLeg(), { unit: U, palette: LION_PALETTE, origin: centred });
    node.legs = [[-2.5, 5.5], [2.5, 5.5], [-2.5, -4.5], [2.5, -4.5]].map(([x, z]) => {
      const n = createNode({ position: { x: x * U, y: 6 * U, z: z * U }, geometry: leg });
      addChild(node, n);
      return n;
    });
    node.tail = createNode({ position: { x: 0, y: 11 * U, z: -7.5 * U }, geometry: voxelGeometry(lionTail(), { unit: U, palette: LION_PALETTE, origin: { x: -U / 2, y: -U / 2, z: -U / 2 } }) });
    addChild(node, node.tail);
    node.packAt = { y: 13 * U, z: -5.5 * U, scale: 0.56 };
    return node;
  };
  BL.characters.add({
    handle: "timechainb",
    joined: 1788800921,
    lastCommit: 1788171200,
    look: { portrait: { min: [-1, -2, 0], max: [7, 11, 8] }, stoneAxe: AXE, hairless: true, skin: "#b8703c", hair: "#33200f" },
    dress: {
      club: (k) => AXE ? { voxels: staffVoxels(k.rand), rest: { x: 0.24, z: 0 }, carry: { x: 0.95, z: 0 } } : { voxels: staffVoxels(k.rand), rest: { x: 0.2, z: 0 } },
      crown(k, v) {
        const P = k.P, gold = k.color("#d4a83a"), goldDk = k.color("#9c7a22");
        const hair = k.color("#33200f"), hairDk = k.color("#2b1b0d");
        const curl = (x, y, z) => (x + y + z) % 2 ? hairDk : hair;
        v.fill(-1, 7, -4, 5, -2, -1, curl);
        v.fill(-1, -1, -4, 5, 0, 2, curl);
        v.fill(7, 7, -4, 5, 0, 2, curl);
        v.fill(0, 6, 0, 1, 5, 7, curl);
        v.fill(0, 6, -2, -1, 5, 8, curl);
        v.fill(1, 5, -5, -3, 6, 8, curl);
        v.fill(2, 4, -7, -6, 7, 8, curl);
        v.set(3, -8, 8, hairDk);
        v.fill(-1, 7, 6, 8, -1, 6, (x, y) => y === 7 ? gold : goldDk);
        v.fill(0, 6, 9, 9, 0, 5, gold);
        v.fill(1, 5, 10, 10, 1, 4, goldDk);
        v.fill(2, 4, 11, 11, 2, 3, gold);
      },
      extras(k) {
        k.parts.dog = lionCub(k);
        addChild(k.root, k.parts.dog);
      }
    }
  });
})();
