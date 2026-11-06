// The authored Hub altar, shared with private host construction. Path radius and
// collision support must follow this same bounded ring layout as the pile grows.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { createNode, addChild } = BL.scene, { hubModels } = BL;
  const ALTAR_HEIGHT = 0.34, ALTAR_BLOCK_WIDTH = 0.2, ALTAR_BLOCK_ARC = 0.3, ALTAR_RING_GAP = 0.02, ALTAR_MAX_BLOCKS = 512;
  const PILE_SCALE = 0.45;
  const setVec = (v, x, y, z) => { v.x = x; v.y = y; v.z = z; };
  const create = ({ root, placed }) => {
    const node = createNode();
    const slab = createNode({ geometry: hubModels.altarSlab(), depthBias: 0.15 });
    const rings = [];
    addChild(node, slab);
    for (let i = 0; i < 3; i++) {
      const ring = createNode({ geometry: hubModels.altarBlock(i), instanceData: new Float32Array(Math.ceil(ALTAR_MAX_BLOCKS / 3) * 20), instanceCount: 0, instanceVersion: 0, depthBias: 0.2 });
      rings.push(ring);
      addChild(node, ring);
    }
    addChild(root, node);
    placed.push(node);
    const result = { node, slab, rings, radius: 0, platformRadius: 0, outerRingRadius: 0, outerRingInnerRadius: 0, height: ALTAR_HEIGHT, ringCount: 1, blockCount: 0, setRadius: null };
    result.setRadius = (radius) => {
      result.radius = radius;
      const halfWidth = ALTAR_BLOCK_WIDTH * 0.5;
      const outer = radius + ALTAR_RING_GAP + halfWidth;
      const wanted = Math.min(ALTAR_MAX_BLOCKS, Math.max(8, Math.round(outer * Math.PI * 2 / ALTAR_BLOCK_ARC)));
      const arc = outer * Math.PI * 2 / wanted * 0.88;
      result.blockCount = wanted;
      result.outerRingRadius = outer;
      result.outerRingInnerRadius = outer - halfWidth;
      result.platformRadius = outer + halfWidth;
      setVec(slab.scale, result.outerRingInnerRadius, ALTAR_HEIGHT, result.outerRingInnerRadius);
      for (let i = 0; i < rings.length; i++) rings[i].instanceCount = 0;
      for (let i = 0; i < wanted; i++) {
        const angle = i / wanted * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ring = rings[i % rings.length];
        const offset = ring.instanceCount++ * 20;
        const data = ring.instanceData;
        data[offset] = cos * ALTAR_BLOCK_WIDTH;
        data[offset + 1] = 0;
        data[offset + 2] = sin * ALTAR_BLOCK_WIDTH;
        data[offset + 3] = 0;
        data[offset + 4] = 0;
        data[offset + 5] = ALTAR_HEIGHT;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = -sin * arc;
        data[offset + 9] = 0;
        data[offset + 10] = cos * arc;
        data[offset + 11] = 0;
        data[offset + 12] = cos * outer;
        data[offset + 13] = 0;
        data[offset + 14] = sin * outer;
        data[offset + 15] = 1;
        data[offset + 16] = 1;
        data[offset + 17] = 0;
        data[offset + 18] = 0;
        data[offset + 19] = 0;
      }
      for (let i = 0; i < rings.length; i++) rings[i].instanceVersion++;
    };
    result.setRadius(PILE_SCALE);
    return result;
  };
  BL.hubAltar = { create, height: ALTAR_HEIGHT, pileScale: PILE_SCALE };
})();
