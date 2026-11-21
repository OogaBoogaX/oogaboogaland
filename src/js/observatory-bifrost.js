// Camera-only Bifrost: the entrance window's reduced model, plus lightweight silhouettes of current
// public chamber poses. It never enters a scene, owns a player, publishes a pose or opens audio/network.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const create = (renderer) => {
    const BM = BL.bifrostModels, stand = BM.gateWindow(), meshes = new Set(), wrappers = new Map();
    const root = createNode({ cameraHidden: true }), rings = [], beam = [];
    const source = { root, meshes, update: null, dispose: null,
      light: { clear: [0.015, 0.018, 0.04], sky: [0.3, 0.3, 0.38], ground: [0.13, 0.11, 0.1],
        direct: [0, 0, 0], directStrength: 0, ambientFloor: 0.5, diffuseFloor: 0 } };
    const mesh = (geometry) => {
      let g = wrappers.get(geometry);
      if (!g) {
        g = { ...geometry, castShadow: false, cameraFeedSource: source, cameraFeedKeep: true };
        wrappers.set(geometry, g); meshes.add(g);
      }
      return g;
    };
    const add = (geometry, position = null) => {
      const node = createNode({ geometry: mesh(geometry), ...(position ? { position } : {}) });
      addChild(root, node); return node;
    };
    add(stand.hall); add(stand.front);
    const glyph = add(stand.glyph, { x: 0, y: BM.CORE.glyphY, z: 0 });
    const rim = stand.rim ? add(stand.rim) : null;
    for (const geometry of stand.rings) rings.push(add(geometry, { x: 0, y: BM.CORE.glyphY, z: 0 }));
    for (const row of stand.beam.rows) {
      const node = add(stand.beam.geometry, { x: 0, y: row.y, z: 0 });
      Object.assign(node.scale, { x: row.r, y: row.h, z: row.r }); beam.push(node);
    }
    const visitors = BL.observatoryVisitors.create(add, "bifrost.chamber");
    source.setDetail = visitors.setDetail;
    let since = 0, charge = 0, spin = 0, phase = 0;
    let want = 0;
    const approach = (rec) => {
      for (let i = 0; i < BM.WINDOWS.length; i++) if (BM.WINDOWS[i].kind === "travel") {
        const a = BM.SLOTS[i], distance = Math.hypot(rec.x - Math.sin(a) * BM.HALL.r, rec.z - Math.cos(a) * BM.HALL.r);
        want = Math.max(want, Math.max(0, Math.min(1, (7.5 - distance) / 6.1)));
      }
    };
    source.update = (dt) => {
      since += dt;
      if (since < 0.1) return;
      const step = Math.min(0.25, since); since = 0;
      want = 0; visitors.update(step, approach);
      charge += (want - charge) * Math.min(1, step * 2);
      spin = (spin + step * (0.6 + 5 * charge)) % (Math.PI * 2); phase += step;
      glyph.rotation.y = spin; glyph.position.y = BM.CORE.glyphY + Math.sin(phase * 1.5) * 0.024;
      for (let i = 0; i < rings.length; i++) rings[i].rotation.y += step * (i === 0 ? 0.5 : i === 1 ? -0.35 : 0.25) * (1 + 7 * charge);
      for (let i = 0; i < beam.length; i++) beam[i].glow = 0.85 + 0.15 * Math.sin(phase * 2 - i * 0.7);
      if (rim) rim.glow = 0.9 + Math.sin(phase * 2.4) * 0.1;
    };
    source.dispose = () => {
      for (const g of meshes) renderer.releaseGeometry(g);
      visitors.dispose(); root.children.length = rings.length = beam.length = 0; meshes.clear(); wrappers.clear();
    };
    return source;
  };
  BL.observatoryBifrost = { create };
})();
