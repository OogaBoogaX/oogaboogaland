// Actual Hub work interiors. Browser and host use identical collision geometry,
// station coordinates and equipment anchors in the authored cave-mouth frame.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const inside = (mouth, plane = 0.5) => {
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
    return (x, y, z) => {
      const dx = x - mouth.x, dz = z - mouth.z, across = dx * cr - dz * sr, along = dx * sr + dz * cr;
      const room = mouth.room, half = along < -room.from ? room.w / 2 : 2.5;
      return y >= mouth.floorY - 0.12 && y < mouth.floorY + room.h - 0.1
        && along <= plane && along >= -room.to && Math.abs(across) <= half;
    };
  };
  const check = ({ mouth, group, opening, solids }) => {
    if (!mouth || ![mouth.x, mouth.z, mouth.ry, mouth.floorY].every(Number.isFinite)
      || !Array.isArray(group?.children) || !opening || typeof solids?.add !== "function")
      throw Error("Hub interior construction providers required");
  };
  const lab = options => {
    check(options);
    const { mouth: m, group, opening, solids, addTarget } = options;
    if (typeof addTarget !== "function") throw Error("Hub lab target provider required");
    const lab = BL.hubModels.entropyLab(m.room, m.floorY);
    BL.scene.addChild(group, lab.node);
    for (const node of lab.solids) solids.add(node);
    for (const display of lab.displays) if (display.node.geometry.imageSurface)
      addTarget(display.node, { kind: "lab-link", priority: 2, weaponType: "none" });
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const stations = lab.stations.map(station => ({ ...station,
      x: m.x + cr * station.x + sr * station.z, y: m.floorY + (station.y || 0),
      z: m.z - sr * station.x + cr * station.z, heading: m.ry + station.heading }));
    for (const item of lab.equipment) {
      const p = item.pickup, x = p.x, z = p.z;
      p.x = m.x + cr * x + sr * z; p.y += m.floorY; p.z = m.z - sr * x + cr * z;
      item.holder = null;
    }
    return { ...lab, group, mouth: m, opening, stations, inside: inside(m), phase: null };
  };
  const office = options => {
    check(options);
    const { slot, mouth, group, opening, solids } = options;
    const office = BL.bcaModels.office(mouth);
    BL.scene.addChild(group, office.node);
    for (const node of office.solids) solids.add(node);
    return { slot, mouth, group, opening, phase: null, office };
  };
  const factory = options => {
    check(options);
    const { slot, mouth: m, group, opening, solids, island } = options;
    if (typeof island?.surfaceAt !== "function") throw Error("Hub factory terrain provider required");
    const { createNode, addChild } = BL.scene, models = BL.factoryModels;
    const tunnel = models.hubTunnel();
    addChild(group, createNode({ geometry: tunnel.timber }), createNode({ geometry: tunnel.glow, sightHidden: true }));
    const tube = models.ROOF_TUBE, sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const tx = m.x + cr * tube.x + sr * tube.z, tz = m.z - sr * tube.x + cr * tube.z;
    const base = island.surfaceAt(tx, tz) - 0.35;
    if (!Number.isFinite(base)) throw Error("Hub factory outlet has no ground");
    const outlet = createNode({ position: { x: tube.x, y: base - m.floorY, z: tube.z }, geometry: models.bananaOutlet() });
    addChild(group, outlet); solids.add(outlet);
    if (island.roofOpening) {
      const shaft = createNode({ position: { x: tube.x, y: base - m.floorY, z: tube.z }, geometry: models.outletShaft(base - island.roofOpening.bottom) });
      addChild(group, shaft); solids.add(shaft);
    }
    return { slot, mouth: m, group, opening, phase: null, deliverySource: { x: tx, y: base + tube.height, z: tz } };
  };
  BL.hubWorkInteriors = { lab, office, factory, inside };
})();
