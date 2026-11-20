// Public pose silhouettes shared by observer adapters. No scene ownership, NPCs or subscriptions.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  let body = null, detailedBody = null;
  const create = (add, zone) => {
    if (!body) {
      const { box, merge } = BL.models;
      body = merge(
        box({ w: 0.55, h: 0.55, d: 0.5, color: "#be9873", offset: { y: 1.2 } }),
        box({ w: 0.6, h: 0.58, d: 0.36, color: "#987b57", offset: { y: 0.68 } }),
        box({ w: 0.64, h: 0.22, d: 0.39, color: "#4d5b39", offset: { y: 0.38 } }),
        ...[-1, 1].flatMap(side => [
          box({ w: 0.18, h: 0.46, d: 0.2, color: "#be9873", offset: { x: side * 0.39, y: 0.72 } }),
          box({ w: 0.2, h: 0.3, d: 0.27, color: "#be9873", offset: { x: side * 0.18, y: 0.15 } })])
      );
      // A readable face, hands and feet without constructing full character rigs.
      // These remain generic observers, not invented costumes or player actions.
      detailedBody = merge(body,
        box({ w: 0.12, h: 0.1, d: 0.12, color: "#c8a17e", offset: { y: 1.17, z: 0.28 } }),
        ...[-1, 1].flatMap(side => [
          box({ w: 0.075, h: 0.07, d: 0.025, color: "#251e19", offset: { x: side * 0.13, y: 1.3, z: 0.26 } }),
          box({ w: 0.22, h: 0.18, d: 0.23, color: "#be9873", offset: { x: side * 0.39, y: 0.48, z: 0.02 } }),
          box({ w: 0.24, h: 0.1, d: 0.34, color: "#765d48", offset: { x: side * 0.18, y: 0.05, z: 0.04 } })]));
    }
    body.cameraFeedVisitor = detailedBody.cameraFeedVisitor = true;
    const detail = add(detailedBody); detail.visible = false;
    const actors = [];
    for (let i = 0; i < 32; i++) { const node = add(body); node.visible = false; actors.push({ node, id: null }); }
    const plain = actors[0].node.geometry;
    let detailed = false;
    return {
      setDetail(level) {
        const on = level > 0;
        if (on === detailed) return;
        detailed = on;
        for (const actor of actors) actor.node.geometry = on ? detail.geometry : plain;
      },
      update(step, visit = null) {
        let count = 0;
        for (const rec of BL.net.remotes.values()) {
          if (count === actors.length) break;
          if (!rec.body || rec.zone !== zone || rec.poseZone !== zone) continue;
          const entry = actors[count++], p = entry.node.position, ease = entry.id !== rec.id ? 1 : Math.min(1, step * 12);
          entry.node.visible = true; entry.id = rec.id;
          p.x += (rec.x - p.x) * ease; p.y += (rec.y - p.y) * ease; p.z += (rec.z - p.z) * ease;
          entry.node.rotation.y = rec.yaw;
          if (visit) visit(rec);
        }
        for (let i = count; i < actors.length; i++) { actors[i].node.visible = false; actors[i].id = null; }
      },
      dispose() { actors.length = 0; }
    };
  };
  BL.observatoryVisitors = { create };
})();
