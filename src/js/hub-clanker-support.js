// The Hub's actual gorilla footprint, ramp fitting, prop and water support.
// Controllers retain ownership of their rig scratch state; this owns only query scratch.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const CORE_RADIUS = 0.025;
  const create = ({ getIsland, getSolids, getAltar, getMempool, getClimbMasonry,
    playersSupportAt: clankerPlayersSupportAt, step: STEP_MAX,
    abyss: ABYSS_FLOOR, altarHeight: ALTAR_HEIGHT, draught: GORILLA_DRAUGHT }) => {
    if (![getIsland, getSolids, getAltar, getMempool, getClimbMasonry, clankerPlayersSupportAt].every(f => typeof f === "function")
      || ![STEP_MAX, ABYSS_FLOOR, ALTAR_HEIGHT, GORILLA_DRAUGHT].every(Number.isFinite)
      || STEP_MAX < 0 || GORILLA_DRAUGHT <= 0) throw Error("Hub Clanker support providers required");
    const CLANKER_CORE_RADIUS = CORE_RADIUS;
    const npcTreeSupportAllowed = node => !node.npcTreeSupport;
  const clankerRectangleAt = (entry, out, climbingTop = false) => {
    const scale = entry.root.scale.x, upright = !climbingTop && (entry.parked || entry.biped);
    out.halfForward = (upright ? 0.825 : 1.5) * scale;
    out.halfSide = (upright ? 0.825 : 0.85) * scale;
    out.centerForward = (upright ? 0.19 : 0.7) * scale;
    return out;
  };
  const CLANKER_TERRAIN_RAMP = { groundX: 0, groundZ: 0, uneven: 0 };
  const clankerSceneSupportAt = (entry, x, z, y, step, heading = entry.heading, props = true) => {
    const island = getIsland(), solids = getSolids(), altar = getAltar(), mempoolIsland = getMempool();
    // Tree tops are landing surfaces for the driven gorilla, not floors for a roaming one (as for Oogas).
    const accept = entry.controlled ? null : npcTreeSupportAllowed;
    const padSupportAt = entry.rage.active ? clankerRagePadSupportAt : clankerPadSupportAt;
    if (!entry.motion.lab && !entry.planningLab) {
      const terrainStep = step >= STEP_MAX && BL.wallPanels.rampAt(island.surfaceAt, x, y, z, heading, CLANKER_TERRAIN_RAMP)
        ? Math.min(step, BL.wallPanels.RAMP_STEP) : Math.min(step, STEP_MAX);
      let floor = island.supportAt(x, z, y, terrainStep, ABYSS_FLOOR, 0);
      if (props) {
        // The supporting top must last until the same core that collides
        // with its side has cleared it. A point support dropped the root
        // while its trailing radius still overlapped an intact box, so both
        // the diagonal step and the horizontal-then-down proof rejected it.
        floor = Math.max(floor, solids.supportAt(x, z, y, step, CLANKER_CORE_RADIUS, null, null, true, accept, entry.rage.active));
        if (mempoolIsland) floor = Math.max(floor, mempoolIsland.floatAt(x, z, y, step, GORILLA_DRAUGHT));
        if (ALTAR_HEIGHT <= y + step + 1e-7
          && x * x + z * z < altar.platformRadius * altar.platformRadius) floor = Math.max(floor, ALTAR_HEIGHT);
        // Only the body's support area holds it up; reaching limbs must not
        // keep the root suspended past a short step or platform edge.
        floor = Math.max(floor, solids.gorillaStepAt(x, z, y, step));
      }
      return floor;
    }
    // Upright scientists stand on their feet. An arm reaching a keyboard is
    // not a foot landing on that desk, even though it belongs to the body sweep.
    // Keep that foot support in upright flight too: a descending arm cannot
    // land the jumping body on a neighbouring bench before its feet get there.
    if (entry.motion.lab && (!entry.drive.airborne && !entry.gorilla.motionActive
      || entry.drive.airborne && !entry.drive.passiveFall)) {
      const floor = island.supportAt(x, z, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, 0.45);
      return props ? Math.max(floor, solids.supportAt(x, z, y, step, 0.45, null, null, true, accept, entry.rage.active), solids.gorillaStepAt(x, z, y, step)) : floor;
    }
    // Pitching a walking rig on the tunnel ramp can leave the flat-ground
    // compact envelope. Its broad bounding circle then reaches the tunnel's
    // side ledges, although the feet remain on the ramp. Keep the walking
    // support footprint here; the complete posed hull still checks collision.
    const compact = entry.compact, planning = entry.planningRoam;
    if ((!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (planning || entry.footprintMode === "walk")
      && clankerGroundPlaneAt(x, y, z, heading, CLANKER_SUPPORT_PLANE)) {
      entry.compact = true; entry.planningRoam = true;
    }
    // Terrain and tall platforms use the body footprint. Short props use the
    // centre alone, so a reaching arm cannot force an early rise or sidestep.
    const shape = BL.agent.footprint, radius = shape.radius(entry);
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    const platformReach = altar.platformRadius + radius - 1e-7;
    let floor = ABYSS_FLOOR;
    for (let part = 0; part < shape.count(entry); part++) {
      const offset = shape.offset(entry, part), px = x + sine * offset, pz = z + cosine * offset;
      floor = Math.max(floor, island.supportAt(px, pz, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, radius));
      if (props) floor = Math.max(floor, solids.supportAt(px, pz, y, step, radius, null, null, true, accept, entry.rage.active));
      // Keep the dais under a released gorilla until it has walked back off.
      if (props && ALTAR_HEIGHT <= y + step + 1e-7
        && px * px + pz * pz < platformReach * platformReach) floor = Math.max(floor, ALTAR_HEIGHT);
    }
    if (props) floor = Math.max(floor, solids.gorillaStepAt(x, z, y, step));
    entry.compact = compact; entry.planningRoam = planning;
    if ((!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active && !entry.gorilla.motionActive
      && (planning || entry.footprintMode === "walk")
      && !clankerGroundPlaneAt(x, y, z, heading, CLANKER_SUPPORT_PLANE)) {
      const center = padSupportAt(x, z, y, step, props);
      if (floor > center + 0.2) {
        const pads = entry.gorilla.walkSupportAt(x, z, y, heading, step, props, padSupportAt);
        if (Number.isFinite(pads) && pads < floor - 0.02) floor = pads;
      }
    }
    return floor;
  };
  // The scene's support, and other players' tops for the gorilla the visitor drives.
  const clankerSupportAt = (entry, x, z, y, step, heading = entry.heading, props = true) => {
    const floor = clankerSceneSupportAt(entry, x, z, y, step, heading, props);
    return props ? Math.max(floor, clankerPlayersSupportAt(entry, x, z, y, step)) : floor;
  };
  const clankerPadSupportAt = (x, z, y, step, props, skipRageProps = false) => {
    const island = getIsland(), solids = getSolids(), altar = getAltar(), mempoolIsland = getMempool();
    const floor = island.supportAt(x, z, y, Math.min(step, STEP_MAX), ABYSS_FLOOR);
    if (!props) return floor;
    const radius = altar.platformRadius - 1e-7;
    return Math.max(floor, solids.supportAt(x, z, y, step, 0, null, null, true, null, skipRageProps), solids.gorillaStepAt(x, z, y, step),
      mempoolIsland ? mempoolIsland.floatAt(x, z, y, step, GORILLA_DRAUGHT) : ABYSS_FLOOR,
      ALTAR_HEIGHT <= y + step + 1e-7 && x * x + z * z < radius * radius ? ALTAR_HEIGHT : ABYSS_FLOOR);
  };
  const clankerRagePadSupportAt = (x, z, y, step, props) => clankerPadSupportAt(x, z, y, step, props, true);
  const clankerTerraceAt = (x, y, z, heading) => {
    const island = getIsland();
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    for (let i = 0; i < 3; i++) {
      const offset = i === 0 ? 0.05 : i === 1 ? 0.7 : 1.35;
      // Detect the stone beside the whole walking body, including a riser too
      // high to count as a legal step. This selects exact collision proof; it
      // does not raise the controller's permitted step height.
      if (island.supportAt(x + sine * offset, z + cosine * offset, y, BL.clankers.WALK_HEIGHT, ABYSS_FLOOR, 0.85) > y + 0.02) return true;
    }
    return false;
  };
  const CLANKER_SUPPORT_PLANE = { groundX: 0, groundY: 0, groundZ: 0 };
  // Compare support using the same footprint so a terrain tread beneath a
  // leading limb cannot be mistaken for standing on a raised prop.
  const clankerTerrainSupportAt = (entry, x, z, y, step, heading = entry.heading) =>
    clankerSupportAt(entry, x, z, y, step, heading, false);
  const CLANKER_RAMP_COLUMN = { floor: 0, ceiling: 0 };
  const clankerGroundPlaneAt = (x, y, z, heading, out, motion = null) => {
    const island = getIsland();
    const column = CLANKER_RAMP_COLUMN, sine = Math.sin(heading), cosine = Math.cos(heading);
    let ramp = false;
    // Retain the dedicated HQ ramp fit; its tunnel sides are deliberately
    // outside the terrain rectangle used on the open island.
    for (let i = 0; i < 3 && !ramp; i++) {
      const along = i === 0 ? 0 : i === 1 ? 2.4 : -0.9;
      const px = x + sine * along, pz = z + cosine * along;
      ramp = !!(island.rampColumnAt(px, pz, false, column) && y < column.ceiling
        || island.rampColumnAt(px, pz, true, column) && y < column.ceiling);
    }
    const entry = motion && motion.supportEntry;
    if (entry) { motion.groundRects.angled.steep = false; motion.groundRects.angled.walkable = false; }
    if (!ramp && (!entry || !motion.lab)
      && BL.wallPanels.rampAt(island.surfaceAt, x, y, z, heading, CLANKER_TERRAIN_RAMP)) {
      const floor = island.supportAt(x, z, y, BL.wallPanels.RAMP_STEP, ABYSS_FLOOR, 0);
      if (floor > ABYSS_FLOOR + STEP_MAX && y >= floor - 0.2 && y <= floor + 1.2) {
        const across = CLANKER_TERRAIN_RAMP.groundX, along = CLANKER_TERRAIN_RAMP.groundZ;
        if (entry) {
          const flat = motion.groundRects.flat, angled = motion.groundRects.angled;
          clankerRectangleAt(entry, flat);
          flat.x = angled.x = x; flat.z = angled.z = z; flat.y = angled.y = floor;
          flat.heading = angled.heading = heading;
          angled.halfForward = flat.halfForward; angled.halfSide = flat.halfSide;
          angled.centerForward = flat.centerForward;
          angled.groundX = across; angled.groundZ = along;
          angled.uneven = CLANKER_TERRAIN_RAMP.uneven;
          angled.walkable = true; angled.steep = false;
        }
        out.groundX = across; out.groundZ = along; out.groundY = floor - y;
        return true;
      }
    }
    if (entry && !motion.lab && !ramp) {
      const rects = motion.groundRects, flat = rects.flat, angled = rects.angled;
      const rect = clankerRectangleAt(entry, flat);
      const halfForward = rect.halfForward, halfSide = rect.halfSide, centerForward = rect.centerForward;
      const cx = x + sine * centerForward, cz = z + cosine * centerForward;
      const floor = clankerSupportAt(entry, x, z, y, STEP_MAX, heading);
      flat.x = angled.x = x; flat.z = angled.z = z;
      flat.heading = angled.heading = heading;
      flat.halfForward = angled.halfForward = halfForward;
      flat.halfSide = angled.halfSide = halfSide;
      flat.centerForward = angled.centerForward = centerForward;
      angled.y = floor; angled.walkable = false; angled.steep = false;
      angled.uneven = Infinity;
      if (!Number.isFinite(floor) || floor <= ABYSS_FLOOR + STEP_MAX) { flat.y = ABYSS_FLOOR; return false; }
      const sampleY = Math.max(y, floor);
      // Most frames have terrain alone beneath the rectangle. Only ask the
      // prop BVH for four more samples when the live centre is on scenery.
      flat.y = island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, 0);
      const onProp = floor > flat.y + 0.02;
      const bx = cx - sine * halfForward, bz = cz - cosine * halfForward;
      const fx = cx + sine * halfForward, fz = cz + cosine * halfForward;
      const lx = cx - cosine * halfSide, lz = cz + sine * halfSide;
      const rx = cx + cosine * halfSide, rz = cz - sine * halfSide;
      // Sample actual contact beneath each edge. Reapplying the whole blended
      // rectangle at every edge made a small prop behave like a much wider one.
      const back = onProp ? clankerPadSupportAt(bx, bz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(bx, bz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const front = onProp ? clankerPadSupportAt(fx, fz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(fx, fz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const left = onProp ? clankerPadSupportAt(lx, lz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(lx, lz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const right = onProp ? clankerPadSupportAt(rx, rz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(rx, rz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      if (!Number.isFinite(back) || !Number.isFinite(front) || !Number.isFinite(left) || !Number.isFinite(right)
        || Math.min(back, front, left, right) <= ABYSS_FLOOR + STEP_MAX) return false;
      const across = (right - left) / (2 * halfSide), along = (front - back) / (2 * halfForward);
      angled.groundX = across; angled.groundZ = along;
      angled.uneven = Math.max(Math.abs(left + right - floor * 2), Math.abs(front + back - floor * 2));
      angled.steep = Math.hypot(across, along) > 0.65;
      // A blended short prop can lift the centre before both edges touch it.
      // Its real edge heights should still pitch the walking body; unevenness
      // remains available to reject a stationary resting pose.
      angled.walkable = !angled.steep && (onProp || Math.abs(left + right - floor * 2) <= 0.42);
      if (!angled.walkable || y < floor - 0.2 || y > floor + 0.9) return false;
      out.groundX = across; out.groundZ = along; out.groundY = floor - y;
      return Math.abs(across) + Math.abs(along) > 0.01;
    }
    if (!ramp) return false;
    const floor = island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR);
    if (y < floor - 0.2 || y > floor + 0.9) return false;
    const back = island.supportAt(x - sine * 0.35, z - cosine * 0.35, floor, STEP_MAX, ABYSS_FLOOR);
    const front = island.supportAt(x + sine * 1.35, z + cosine * 1.35, floor, 0.9, ABYSS_FLOOR);
    const left = island.supportAt(x - cosine * 0.5, z + sine * 0.5, floor, STEP_MAX, ABYSS_FLOOR);
    const right = island.supportAt(x + cosine * 0.5, z - sine * 0.5, floor, STEP_MAX, ABYSS_FLOOR);
    const across = right - left, along = (front - back) / 1.7;
    if (Math.abs(left + right - floor * 2) > 0.12 || Math.hypot(across, along) > 0.65) return false;
    if (entry) {
      const flat = motion.groundRects.flat, angled = motion.groundRects.angled;
      flat.x = angled.x = x; flat.z = angled.z = z;
      flat.y = angled.y = floor; flat.heading = angled.heading = heading;
      angled.groundX = across; angled.groundZ = along;
      angled.uneven = Math.max(Math.abs(left + right - floor * 2), Math.abs(front + back - floor * 2));
      angled.steep = false; angled.walkable = true;
    }
    out.groundX = across; out.groundZ = along; out.groundY = floor - y;
    return true;
  };
  const clankerClimbTorsoClear = (vertices) => {
    const island = getIsland(), solids = getSolids(), climbMasonry = getClimbMasonry();
    if (!island.hullClearAt(vertices)) return false;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]); maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]); maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]); maxZ = Math.max(maxZ, vertices[i + 2]);
    }
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i];
      if (maxX < row.minX || minX > row.maxX || maxY < row.minY || minY > row.maxY
        || maxZ < row.minZ || minZ > row.maxZ || !solids.isActive(row.node)) continue;
      for (let j = 0; j < row.boxes.length; j++) if (BL.convex.hullsOverlap(vertices, row.boxes[j])) return false;
    }
    return true;
  };
  const clankerClimbAreaAt = (x, y, z) => {
    const island = getIsland();
    // Climb geometry belongs to the mainland's cliff belt and underground
    // walls. The meadow, authored stairs and satellite mesh paths are walks.
    // This broad phase only admits a search; contact still proves a real wall.
    const radius2 = x * x + z * z, outer = island.radius + 4, inner = island.meadowRadius - 4;
    return radius2 <= outer * outer && (y < -0.5 || radius2 >= inner * inner) && !island.stairAt(x, y, z);
  };
  const clankerClimbSolidAt = (x, y, z) => {
    const island = getIsland(), solids = getSolids(), climbMasonry = getClimbMasonry();
    if (island.solidAt(x, y, z)) return true;
    // The cave's visible masonry projects beyond the voxel cliff. Grips and
    // wall routes must see that same stone before ordinary props collision
    // rejects a route through its jambs. Scenery stays on its existing mesh.
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i], boxes = row.node.geometry.climbBoxes, ly = y - row.y;
      if (ly < 0 || ly > 3.5 || Math.abs(x - row.x) > 4 || Math.abs(z - row.z) > 4
        || !solids.isActive(row.node)) continue;
      const dx = x - row.x, dz = z - row.z, lx = dx * row.cr - dz * row.sr;
      const lz = dx * row.sr + dz * row.cr - row.offsetZ;
      for (let at = 0; at < boxes.length; at += 6) if (lx >= boxes[at] && lx <= boxes[at + 3]
        && ly >= boxes[at + 1] && ly <= boxes[at + 4] && lz >= boxes[at + 2] && lz <= boxes[at + 5]) return true;
    }
    return false;
  };
  const clankerClimbSurfaceAt = (x, z) => {
    const island = getIsland(), solids = getSolids(), climbMasonry = getClimbMasonry();
    let height = island.surfaceAt(x, z);
    // The stair/cliff probe must see the same projecting masonry as the
    // contact probe. Walking support still comes from the live solid mesh.
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i];
      if (Math.abs(x - row.x) > 4 || Math.abs(z - row.z) > 4 || !solids.isActive(row.node)) continue;
      const dx = x - row.x, dz = z - row.z, lx = dx * row.cr - dz * row.sr;
      const lz = dx * row.sr + dz * row.cr - row.offsetZ, boxes = row.node.geometry.climbBoxes;
      for (let at = 0; at < boxes.length; at += 6) if (lx >= boxes[at] && lx <= boxes[at + 3]
        && lz >= boxes[at + 2] && lz <= boxes[at + 5]) height = Math.max(height, row.y + boxes[at + 4]);
    }
    return height;
  };
  const clankerPlatformEntryAt = (x, y, z, out) => {
    const island = getIsland();
    const hq = island.headquarters, radius = Math.hypot(x, z), angle = Math.atan2(x, -z);
    for (let level = 0; level < 2; level++) {
      const balconies = level ? hq.basement.balconies : hq.balconies;
      for (let i = 0; i < balconies.length; i++) {
        const platform = balconies[i];
        if (angle <= platform.startAngle || angle >= platform.endAngle
          || y < platform.floor - 0.1 || y > platform.ceiling + 2.4
          || radius < Math.min(platform.radius, platform.openingRadius) - 4
          || radius > Math.max(platform.radius, platform.openingRadius) + 2.5) continue;
        // The root trails the front of the walking rectangle. Capture it
        // before the projecting lip blocks its descent, and place its feet
        // well inside the opening rather than at the outer floor edge.
        const landingRadius = Math.min(platform.radius, platform.openingRadius) - 2.6;
        out.x = x * landingRadius / radius; out.z = z * landingRadius / radius;
        out.y = platform.floor; out.heading = Math.atan2(-x, -z);
        out.radius = Math.max(platform.radius, platform.openingRadius) + 0.75;
        return true;
      }
    }
    return false;
  };
  const CLANKER_TALL_OBSTACLE = {
    node: null, minAlong: 0, maxAlong: 0, minAcross: 0, maxAcross: 0,
    minContactAcross: 0, maxContactAcross: 0
  };
  const clankerTallObstacleAhead = (entry, dx, dz) => {
    const solids = getSolids();
    const p = entry.root.position, step = BL.clankers.PROP_STEP, aboveStep = p.y + step + 0.02;
    return solids.shoulderAt(p.x, aboveStep, p.z, dx, dz, 0.025,
      Math.max(0, entry.height - step), 1.4, CLANKER_TALL_OBSTACLE, aboveStep, entry.rage.active);
  };
    return { clankerClimbTorsoClear, clankerClimbAreaAt, clankerClimbSolidAt,
      clankerClimbSurfaceAt, clankerPlatformEntryAt, clankerTallObstacleAhead, clankerRectangleAt, clankerSupportAt, clankerTerrainSupportAt,
      clankerGroundPlaneAt, clankerPadSupportAt, clankerRagePadSupportAt, clankerTerraceAt };
  };
  BL.hubClankerSupport = { create, CORE_RADIUS };
})();
