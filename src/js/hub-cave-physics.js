// Authored cave barriers and NPC exclusion queries, shared by browser and host.
// Camera clearance remains separate; actor sweeps include the gaps between bars.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { createNode, addChild } = BL.scene, { hubModels, terrain } = BL;
  const { lerp } = BL.math;
  const layout = Object.freeze({ MATRIX_GATE_HIDDEN_Y: 3.2, MIRROR_GATE_Z: 0.28,
    MIRROR_GATE_CLOSED: true, PORTAL_Z: 0.5, PORTAL_MIN_X: -2.48,
    PORTAL_MAX_X: 2.48, PORTAL_MIN_Y: 0, PORTAL_MAX_Y: 2.98, RIM_SEAM_DROP: 0.015 });
  const { MATRIX_GATE_HIDDEN_Y, MIRROR_GATE_Z, MIRROR_GATE_CLOSED, PORTAL_Z,
    PORTAL_MIN_X, PORTAL_MAX_X, PORTAL_MIN_Y, PORTAL_MAX_Y, RIM_SEAM_DROP } = layout;
  const sealedCaveVariant = id => id === "c3" ? 1 : id === "c10" ? 2 : 0;
  const create = ({ getSolids, getMirrorMouth, matrixGates, sealedCaves, closedCaveZones,
    headquartersRimLintels, climbMasonry, radius: PLAYER_RADIUS, step: STEP_MAX }) => {
    if (typeof getSolids !== "function" || typeof getMirrorMouth !== "function"
      || ![matrixGates, sealedCaves, closedCaveZones, headquartersRimLintels, climbMasonry].every(Array.isArray)
      || !Number.isFinite(PLAYER_RADIUS) || PLAYER_RADIUS <= 0 || !Number.isFinite(STEP_MAX) || STEP_MAX < 0)
      throw Error("Hub cave collision providers required");
    const registerClimbMasonry = (node, mouth) => {
      node.climbMasonry = true;
      const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry), y = mouth.floorY + node.position.y;
      const slabs = node.geometry.climbBoxes, boxes = [];
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let at = 0; at < slabs.length; at += 6) {
        const box = new Float64Array(24);
        for (let corner = 0; corner < 8; corner++) {
          const x = slabs[at + (corner & 1 ? 3 : 0)], z = slabs[at + (corner & 4 ? 5 : 2)] + node.position.z;
          const wx = mouth.x + cr * x + sr * z, wy = y + slabs[at + (corner & 2 ? 4 : 1)], wz = mouth.z - sr * x + cr * z;
          box[corner * 3] = wx; box[corner * 3 + 1] = wy; box[corner * 3 + 2] = wz;
          minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz);
          maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz);
        }
        boxes.push(box);
      }
      climbMasonry.push({
        node, x: mouth.x, y, z: mouth.z, sr, cr, offsetZ: node.position.z,
        boxes, minX, minY, minZ, maxX, maxY, maxZ
      });
    };
    const buildShell = (slot, m, caveIndex) => {
      const solids = getSolids();
      if (!slot || !m || !Number.isSafeInteger(caveIndex) || caveIndex < 1 || caveIndex > 32
        || typeof solids?.add !== "function" || ![m.x, m.floorY, m.z, m.ry].every(Number.isFinite))
        throw Error("invalid Hub cave shell");
      const ax = Math.sin(m.ry), az = Math.cos(m.ry);
      const group = createNode({ position: { x: m.x, y: m.floorY, z: m.z }, rotation: { x: 0, y: m.ry, z: 0 } });
      const rim = createNode({ position: { x: 0, y: slot.status === "headquarters" ? 0 : -RIM_SEAM_DROP, z: PORTAL_Z }, geometry: hubModels.caveMouthRim(slot.status === "headquarters" ? 1 : 0), sightSolid: true });
      addChild(group, rim);
      solids.add(rim);
      registerClimbMasonry(rim, m);
      if (slot.status === "headquarters") {
        const lintel = createNode({ position: { x: 0, y: -RIM_SEAM_DROP, z: PORTAL_Z }, geometry: hubModels.caveMouthRim(2), sightSolid: true });
        addChild(group, lintel);
        solids.add(lintel);
        registerClimbMasonry(lintel, m);
        headquartersRimLintels.push(lintel);
      }
      if (slot.status === "dark") {
        const geometry = hubModels.sealedCaveFace(sealedCaveVariant(slot.id));
        const seal = createNode({ position: { x: 0, y: 0, z: 0.52 }, geometry, matrixExterior: true, sightSolid: true });
        addChild(group, seal);
        solids.add(seal);
        registerClimbMasonry(seal, m);
        sealedCaves.push({ caveIndex, mouth: m, node: seal, sr: ax, cr: az, stopZ: seal.position.z + geometry.frontZ + 0.01 });
        closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: seal.position.z + geometry.frontZ + 0.26 });
      } else if (slot.status === "mirror") {
        const opening = rim.geometry.openingBounds;
        const geometry = { ...hubModels.matrixPrisonBars(), matrixCave: caveIndex, clipMinY: m.floorY + opening.floorY, clipMaxY: m.floorY + opening.ceilingY };
        const bars = createNode({ position: { x: 0, y: MATRIX_GATE_HIDDEN_Y, z: 0.78 }, geometry, visible: false, matrixExterior: true });
        addChild(group, bars);
        const bounds = BL.scene.boundsOf(geometry);
        matrixGates.push({ kind: "matrix-gate", caveIndex, mouth: m, node: bars, sr: ax, cr: az, open: false, localOpen: false, locked: false, raising: false, held: false, floor: opening.floorY, ceiling: opening.ceilingY, bottom: bounds.min[1], top: bounds.max[1], minX: bounds.min[0], maxX: bounds.max[0], minZ: bars.position.z + bounds.min[2], maxZ: bars.position.z + bounds.max[2] });
      }
      return { group, rim };
    };
    const finishMirror = gate => {
      const m = gate.mouth, ax = gate.sr, az = gate.cr;
      const gateShift = MIRROR_GATE_Z - gate.node.position.z;
      gate.node.position.z = MIRROR_GATE_Z;
      gate.minZ += gateShift; gate.maxZ += gateShift;
      gate.locked = MIRROR_GATE_CLOSED;
      if (gate.locked) {
        gate.node.position.y = gate.floor;
        gate.node.visible = true;
        closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: PORTAL_Z + 0.25 });
      }
    };
    const matrixGateSegmentClear = (x, y, z, toX, toY, toZ, radius, height, clankerPass = false, closed = false) => {
      const dx = toX - x, dy = toY - y, dz = toZ - z;
      for (let i = 0; i < matrixGates.length; i++) {
        const gate = matrixGates[i], m = gate.mouth;
        if (clankerPass && m === getMirrorMouth()) continue;
        const bottom = closed ? gate.floor : Math.max(gate.floor, gate.node.position.y + gate.bottom);
        const top = closed ? gate.ceiling : Math.min(gate.ceiling, gate.node.position.y + gate.top);
        if (bottom >= top || Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) continue;
        const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
        if (!terrain.segmentBoxClear(lx, y - m.floorY, lz, dx * gate.cr - dz * gate.sr, dy, dx * gate.sr + dz * gate.cr, radius, height, gate.minX, bottom, gate.minZ, gate.maxX, top, gate.maxZ)) return false;
      }
      return true;
    };
    const matrixGateCeilingAt = (x, z, y) => {
      let ceiling = Infinity;
      for (let i = 0; i < matrixGates.length; i++) {
        const gate = matrixGates[i], m = gate.mouth;
        const bottom = Math.max(gate.floor, gate.node.position.y + gate.bottom), top = Math.min(gate.ceiling, gate.node.position.y + gate.top);
        if (bottom >= top || y >= m.floorY + top - 1e-7) continue;
        const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
        const ox = Math.max(gate.minX - lx, 0, lx - gate.maxX), oz = Math.max(gate.minZ - lz, 0, lz - gate.maxZ);
        if (ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9) ceiling = Math.min(ceiling, m.floorY + bottom);
      }
      return ceiling;
    };
    const crossesSealedCave = (fromX, fromZ, toX, toZ, y = 0) => {
      for (let i = 0; i < sealedCaves.length; i++) {
        const sealed = sealedCaves[i], m = sealed.mouth, sr = sealed.sr, cr = sealed.cr;
        if (y < m.floorY - STEP_MAX || y > m.floorY + PORTAL_MAX_Y) continue;
        const a = (fromX - m.x) * sr + (fromZ - m.z) * cr - sealed.stopZ;
        const b = (toX - m.x) * sr + (toZ - m.z) * cr - sealed.stopZ;
        if (a * b > 0 || a === b) continue;
        const k = a / (a - b), x = lerp(fromX, toX, k), z = lerp(fromZ, toZ, k);
        const across = (x - m.x) * cr - (z - m.z) * sr;
        if (across >= PORTAL_MIN_X && across <= PORTAL_MAX_X) return true;
      }
      return false;
    };
    const workZoneContains = (zone, x, y, z, height) => {
      if (!zone.active || y + height <= zone.floor || y >= zone.floor + 3.5) return false;
      const dx = x - zone.x, dz = z - zone.z, across = dx * zone.cr - dz * zone.sr, along = dx * zone.sr + dz * zone.cr;
      const ox = Math.max(Math.abs(across) - zone.half, 0), oz = Math.max(-7 - along, 0, along - zone.front);
      return ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9;
    };
    const workZoneSegmentClear = (zone, x, y, z, toX, toY, toZ, height) => {
      const dx = x - zone.x, dz = z - zone.z, vx = toX - x, vz = toZ - z;
      return terrain.segmentBoxClear(dx * zone.cr - dz * zone.sr, y, dx * zone.sr + dz * zone.cr,
        vx * zone.cr - vz * zone.sr, toY - y, vx * zone.sr + vz * zone.cr, PLAYER_RADIUS, height,
        -zone.half, zone.floor, -7, zone.half, zone.floor + 3.5, zone.front);
    };
    const npcClosedCaveAt = (x, z, y = null, height = 1.5) => {
      for (const zone of closedCaveZones) if (workZoneContains(zone, x, y === null ? zone.floor : y, z, height)) return true;
      return false;
    };
    const npcClosedCaveClear = (x, y, z, toX, toY, toZ, height) => {
      for (const zone of closedCaveZones) {
        // A released player may already be beside the boards. Keep the way out open.
        if (workZoneContains(zone, x, y, z, height)) {
          const dx = x - zone.x, dz = z - zone.z, tx = toX - zone.x, tz = toZ - zone.z;
          const across = Math.abs(dx * zone.cr - dz * zone.sr), toAcross = Math.abs(tx * zone.cr - tz * zone.sr);
          const along = dx * zone.sr + dz * zone.cr, toAlong = tx * zone.sr + tz * zone.cr;
          if (toAlong >= along - 1e-7 || toAcross > across + 1e-7) continue;
          return false;
        }
        if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, height)) return false;
      }
      return true;
    };
    return { buildShell, finishMirror, matrixGateSegmentClear, matrixGateCeilingAt,
      crossesSealedCave, workZoneContains, workZoneSegmentClear, npcClosedCaveAt, npcClosedCaveClear };
  };
  BL.hubCavePhysics = { create, layout, sealedCaveVariant };
})();
