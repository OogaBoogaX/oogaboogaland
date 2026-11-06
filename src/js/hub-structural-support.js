// Source Hub mattress and masonry queries, shared by browser and host.
// The browser may explicitly bypass them for its separate Cloud Hopper mode.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, terrain = BL.terrain;
  const create = ({ getRoot, getHeadquarters, disabled, getDefaultRadius }) => {
    if (typeof getRoot !== "function" || typeof getHeadquarters !== "function"
      || typeof disabled !== "function" || typeof getDefaultRadius !== "function")
      throw Error("Hub structural support providers required");
  const bedSupportAt = (x, z, y, maxStep, radius) => {
    const headquarters = getHeadquarters(), root = getRoot();
    let floor = -Infinity;
    if (!headquarters) return floor;
    for (const bed of headquarters.mattresses) {
      if (y + maxStep < bed.y || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        const top = bed.y + boxes[i + 4];
        if (top <= floor || top > y + maxStep + 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) floor = top;
      }
    }
    return floor;
  };
  const bedCeilingAt = (x, z, y, radius) => {
    const headquarters = getHeadquarters(), root = getRoot();
    if (disabled()) return Infinity;
    let ceiling = Infinity;
    if (!headquarters) return ceiling;
    for (const bed of headquarters.mattresses) {
      if (y >= bed.y + bed.sleep.pillowTop - 1e-7 || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        if (y >= bed.y + boxes[i + 4] - 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) ceiling = Math.min(ceiling, bed.y + boxes[i + 1]);
      }
    }
    return ceiling;
  };
  const BED_SWEEP = new Float64Array(14);
  const bedSegmentClear = (x, y, z, toX, toY, toZ, radius, height, all = false) => {
    const headquarters = getHeadquarters(), root = getRoot();
    if (disabled()) return true;
    if (!headquarters) return true;
    const dx = toX - x, dy = toY - y, dz = toZ - z;
    for (const bed of headquarters.mattresses) {
      if (Math.min(y, toY) >= bed.y + bed.sleep.pillowTop - 1e-7 || Math.max(y, toY) + height <= bed.y
        || !all && (!bed.node.visible || bed.node.parent !== root)) continue;
      const lx = (x - bed.x) * bed.cr - (z - bed.z) * bed.sr, lz = (x - bed.x) * bed.sr + (z - bed.z) * bed.cr;
      const vx = dx * bed.cr - dz * bed.sr, vz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      const q = BED_SWEEP;
      q[0] = lx; q[1] = y - bed.y; q[2] = lz; q[3] = vx; q[4] = dy; q[5] = vz; q[6] = radius; q[7] = height;
      for (let i = 0; i < boxes.length; i += 6) {
        for (let j = 0; j < 6; j++) q[j + 8] = boxes[i + j];
        if (!terrain.segmentBoxQueryClear(q)) return false;
      }
    }
    return true;
  };
  // Stone frames are rendered boxes, separate from the carved terrain.
  // Rotate the cylinder into each fixed arch's axes; its footprint stays round.
  const entranceCeilingAt = (x, z, y, radius) => {
    const headquarters = getHeadquarters(), root = getRoot();
    if (disabled()) return Infinity;
    let ceiling = Infinity;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      const dx = x - node.position.x, dz = z - node.position.z, reach = entry.radius + radius;
      if (y >= entry.maxY - 1e-7 || dx * dx + dz * dz > reach * reach) continue;
      const lx = dx * entry.cr - dz * entry.sr, lz = dx * entry.sr + dz * entry.cr, scale = node.scale.x, boxes = node.geometry.collisionBoxes;
      for (let j = 0; j < boxes.length; j += 6) {
        if (y >= node.position.y + boxes[j + 4] - 1e-7) continue;
        const ox = Math.max(boxes[j] * scale - lx, 0, lx - boxes[j + 3] * scale), oz = Math.max(boxes[j + 2] - lz, 0, lz - boxes[j + 5]);
        if (ox * ox + oz * oz < radius * radius - 1e-9) ceiling = Math.min(ceiling, node.position.y + boxes[j + 1]);
      }
    }
    return ceiling;
  };
  const ENTRANCE_SWEEP = new Float64Array(14);
  const entranceSegmentClear = (x, y, z, toX, toY, toZ, radius = getDefaultRadius()) => {
    const headquarters = getHeadquarters(), root = getRoot();
    if (disabled()) return true;
    const dx = toX - x, dy = toY - y, dz = toZ - z, span2 = dx * dx + dz * dz;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      if (Math.min(y, toY) - radius >= entry.maxY || Math.max(y, toY) + radius <= entry.minY) continue;
      const k = span2 ? Math.max(0, Math.min(1, ((node.position.x - x) * dx + (node.position.z - z) * dz) / span2)) : 0;
      const ox = x + dx * k - node.position.x, oz = z + dz * k - node.position.z, reach = entry.radius + radius;
      if (ox * ox + oz * oz > reach * reach) continue;
      const lx = (x - node.position.x) * entry.cr - (z - node.position.z) * entry.sr, lz = (x - node.position.x) * entry.sr + (z - node.position.z) * entry.cr;
      const vx = dx * entry.cr - dz * entry.sr, vz = dx * entry.sr + dz * entry.cr, boxes = node.geometry.collisionBoxes, scale = node.scale.x;
      const q = ENTRANCE_SWEEP;
      q[0] = lx; q[1] = y - node.position.y - radius; q[2] = lz; q[3] = vx; q[4] = dy; q[5] = vz; q[6] = radius; q[7] = radius * 2;
      for (let j = 0; j < boxes.length; j += 6) {
        q[8] = boxes[j] * scale; q[9] = boxes[j + 1]; q[10] = boxes[j + 2];
        q[11] = boxes[j + 3] * scale; q[12] = boxes[j + 4]; q[13] = boxes[j + 5];
        if (!terrain.segmentBoxQueryClear(q)) return false;
      }
    }
    return true;
  };
    return { bedSupportAt, bedCeilingAt, bedSegmentClear, entranceCeilingAt, entranceSegmentClear };
  };
  BL.hubStructuralSupport = { create };
})();
