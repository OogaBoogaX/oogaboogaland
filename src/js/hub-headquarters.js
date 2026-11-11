// The actual HQ/basement construction, shared by the browser and host.
// Geometry, mattress anchors and collision shells have one source of truth.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ island, root, solids, placed, addTarget, fireRigs, fireHazards,
    fireAvoidRadius, sleepMarksVisible, lazyBedding = false }) => {
    if (!island?.headquarters?.basement || !root || !Array.isArray(root.children)
      || !Array.isArray(placed) || !Array.isArray(fireRigs) || !Array.isArray(fireHazards)
      || typeof solids?.add !== "function" || typeof addTarget !== "function"
      || typeof sleepMarksVisible !== "function" || typeof lazyBedding !== "boolean"
      || !Number.isFinite(fireAvoidRadius) || fireAvoidRadius <= 0) throw Error("HQ construction providers required");
    const { createNode, addChild } = BL.scene, { headquartersModels, hubModels } = BL;
    const floor = island.headquarters.floor, basement = island.headquarters.basement;
    const room = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: headquartersModels.room() });
    addChild(root, room);
    placed.push(room);
    solids.add(room);
    const benches = [];
    for (const x of [-2.6, 2.6]) for (const z of [-0.55, 0.55]) benches.push({ kind: "bench", x, y: floor + 0.58, z, floor, ry: Math.atan2(-x, -z), sitter: null, walkAt: { x: x - Math.sign(x) * 0.85, z } });
    const entrances = [], lights = [], mattresses = [], roomSigns = [], rampMarkers = [], lazyBeds = [];
    const addEntrance = (node, roomIndex, lower, ramp = false) => {
      node.sightSolid = true;
      addChild(root, node);
      placed.push(node);
      solids.add(node, true);
      const bounds = BL.scene.boundsOf(node.geometry);
      entrances.push({ roomIndex, node, basement: lower, ramp, sr: Math.sin(node.rotation.y), cr: Math.cos(node.rotation.y), radius: Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * node.scale.x, Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))), minY: node.position.y + bounds.min[1], maxY: node.position.y + bounds.max[1] });
    };
    const torchAt = (x, y, z) => {
      const node = createNode({ position: { x, y, z }, geometry: hubModels.torch(), glow: 0.85, matrixEmissiveLiving: true });
      addChild(root, node);
      placed.push(node);
      lights.push({ id: `headquarters:${lights.length}`, node, x, y: y + 1.6, z });
    };
    for (const level of [island.headquarters, basement]) for (const cave of level.rooms) {
      const i = cave.index, angle = cave.angle;
      const entrance = createNode({ position: { x: cave.entrance.x, y: cave.floor, z: cave.entrance.z }, rotation: { x: 0, y: -angle, z: 0 }, scale: { x: (cave.corridorWidth ?? cave.width - 1.3) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.roomEntrance(i) });
      addEntrance(entrance, i, level === basement);
      const dimensions = headquartersModels.MATTRESS, across = -(cave.width / 2 - dimensions.wallInset - dimensions.width / 2), along = cave.depth / 2 - dimensions.wallInset - dimensions.depth / 2;
      const sx = Math.sin(angle), cx = Math.cos(angle), geometry = lazyBedding ? headquartersModels.mattressPlaceholder(cave) : headquartersModels.mattress(cave);
      const sign = createNode({ position: { x: cave.entrance.x - sx * 0.28, y: cave.floor + 3.78, z: cave.entrance.z + cx * 0.28 }, rotation: { x: 0, y: -angle, z: 0 }, geometry: headquartersModels.roomSign(cave, lazyBedding), matrixSignLiving: true });
      addChild(root, sign);
      placed.push(sign);
      const hanging = { roomIndex: i, basement: level === basement, room: cave, node: sign, sr: -sx, cr: cx, velocity: 0, hits: 0, contacts: 0 };
      roomSigns.push(hanging);
      addTarget(sign, { kind: "room-sign", roomSign: hanging });
      const node = createNode({ position: { x: cave.x + cx * across + sx * along, y: cave.floor, z: cave.z + sx * across - cx * along }, rotation: { x: 0, y: -angle, z: 0 }, geometry });
      addChild(root, node);
      placed.push(node);
      const side = dimensions.width / 2 + 0.5;
      mattresses.push({
        roomIndex: i, basement: level === basement, corner: "rear-left", room: cave, node, ...geometry.mattress,
        x: node.position.x, y: cave.floor, z: node.position.z, sr: -sx, cr: cx, sleeper: null, sleep: dimensions,
        collisionBoxes: new Float64Array([-dimensions.width / 2, 0, -dimensions.depth / 2, dimensions.width / 2, dimensions.surface, dimensions.depth / 2,
        -0.45, dimensions.surface, dimensions.pillowZ - 0.25, 0.45, dimensions.pillowTop, dimensions.pillowZ + 0.25]),
        walkAt: { x: node.position.x + cx * side, y: cave.floor, z: node.position.z + sx * side }
      });
      if (lazyBedding) lazyBeds.push({ bed: mattresses[mattresses.length - 1], ready: false, failed: false });
    }
    for (const ramp of basement.ramps) {
      const p = ramp.entrance;
      // Scale so the model's inner opening, including the voxel edge, clears the tunnel.
      const entrance = createNode({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: -ramp.angle, z: 0 }, scale: { x: (ramp.width + island.unit * Math.SQRT2) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.rampEntrance(ramp.index) });
      addEntrance(entrance, ramp.index, false, true);
    }
    const addRampMarker = (ramp, label, floor, channel) => {
      const first = ramp.samples[0], ahead = ramp.samples[Math.min(3, ramp.samples.length - 1)];
      const dx = ahead.x - first.x, dz = ahead.z - first.z, length = Math.hypot(dx, dz) || 1;
      const direction = { x: dx / length, z: dz / length };
      const at = (distance) => {
        let i = 1; while (i < ramp.samples.length - 1 && ramp.samples[i].s < distance) i++;
        const from = ramp.samples[i - 1], to = ramp.samples[i], k = (distance - from.s) / (to.s - from.s);
        return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
      };
      // Both smaller marks sit inside the opening and follow the real ramp
      // pitch. The label comes first; its arrow continues farther downhill.
      const fitted = (distance, geometry) => {
        const half = Math.min(0.35, distance * 0.3), point = at(distance), from = at(distance - half), to = at(distance + half);
        const tx = to.x - from.x, ty = to.y - from.y, tz = to.z - from.z, horizontal = Math.hypot(tx, tz) || 1;
        return {
          point, node: createNode({
            position: { x: point.x, y: point.y + 0.035, z: point.z }, rotation: { x: Math.atan2(-ty, horizontal), y: Math.atan2(tx, tz), z: 0 },
            scale: { x: 0.72, y: 0.72, z: 0.72 }, geometry, visible: false, depthBias: 0.35
          })
        };
      };
      const labelDistance = Math.min(0.85, ramp.length * 0.12), arrowDistance = Math.min(1.85, ramp.length * 0.24);
      const labelMark = fitted(labelDistance, null);
      const arrowMark = fitted(arrowDistance, headquartersModels.rampMarkerArrow());
      const frame = labelMark.node, arrow = arrowMark.node, labelPoint = labelMark.point, arrowPoint = arrowMark.point;
      const node = createNode({ geometry: headquartersModels.rampMarkerLabel(label), depthBias: 0.35 });
      const yaw = frame.rotation.y, pitch = frame.rotation.x;
      const across = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
      const downhill = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      addChild(frame, node);
      addChild(root, frame, arrow);
      placed.push(frame, arrow);
      rampMarkers.push({ node, frame, arrow, label, across, downhill, channel, ramp, direction, labelDistance, arrowDistance, labelPoint, arrowPoint });
    };
    for (let i = 0; i < island.headquarters.ramps.length; i++) addRampMarker(island.headquarters.ramps[i], "HQ", 0, i);
    for (let i = 0; i < basement.ramps.length; i++) addRampMarker(basement.ramps[i], "B1", floor, i + 2);
    for (const ramp of island.headquarters.ramps) {
      const p = ramp.samples[30], angle = Math.atan2(p.x, -p.z), radius = Math.hypot(p.x, p.z) - 1.6;
      torchAt(Math.sin(angle) * radius, p.y + 0.6, -Math.cos(angle) * radius);
    }
    const firepit = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: hubModels.firepit() });
    solids.add(firepit);
    // The island's voxel flame burns in the HQ hearth too; its embers are the hub's critter batch at the hearth.
    const rig = BL.blaze.createVoxelRig({ scale: 1, sightHidden: true });
    addChild(firepit, rig.root);
    fireRigs.push(rig);
    fireHazards.push({ node: rig.root, boxes: rig.boxes, pit: firepit, x: 0, y: floor, z: 0, avoidRadius: fireAvoidRadius });
    addChild(root, firepit);
    placed.push(firepit);
    const hearth = { id: "headquarters:hearth", node: rig.root, rig, x: 0, y: floor + 0.6, z: 0, phase: 23 };
    lights.push(hearth);
    // The hearth is the only shared HQ point light.
    // Windows and ramp torches stay physical/emissive; no camera-proximity light spills into an unclaimed room.
    const sources = [hearth];
    return { node: room, entrances, mattresses, roomSigns, rampMarkers, lazyBeds, benches, fireHazards, lights, sources, hearth, firepit, rooms: island.headquarters.rooms, windows: island.headquarters.windows, ramps: island.headquarters.ramps, openFloor: island.headquarters.room, basement, sleepMarksVisible };
  };
  BL.hubHeadquarters = { create };
})();
