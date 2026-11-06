// Actual Hub rig, limb, doorway and resting-pose sweeps. Browser and host
// supply their explicit peer policy; terrain and routine equipment stay real.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, { clamp } = BL.math, poolModels = BL.poolModels;
  const create = options => {
    const { getIsland, getSolids, getMempool, getTimechain, getBifrost, getClankers,
      getLab, getClimbMasonry, getPassingEntry, setPassingEntry, labInside,
      crossesSealedCave, matrixGateSegmentClear, npcFireClear, npcRampRoofAt,
      clankerPlayersClear, clankerPeersClear, clankerBedPlayersClear,
      clankerPassingPeer, clankerLabWorker, clankerEntering, clankerBodySegmentClear,
      clankerGroundPlaneAt, clankerRectangleAt, clankerTerraceAt,
      fireHazards, step: STEP_MAX, abyss: ABYSS_FLOOR, fireBottom: FIRE_BOTTOM, fireTop: FIRE_TOP } = options;
    if (![getIsland, getSolids, getMempool, getTimechain, getBifrost, getClankers,
      getLab, getClimbMasonry, getPassingEntry, setPassingEntry, labInside,
      crossesSealedCave, matrixGateSegmentClear, npcFireClear, npcRampRoofAt,
      clankerPlayersClear, clankerPeersClear, clankerBedPlayersClear, clankerPassingPeer,
      clankerLabWorker, clankerEntering, clankerBodySegmentClear,
      clankerGroundPlaneAt, clankerRectangleAt, clankerTerraceAt].every(fn => typeof fn === "function")
      || !Array.isArray(fireHazards) || ![STEP_MAX, ABYSS_FLOOR, FIRE_BOTTOM, FIRE_TOP].every(Number.isFinite)
      || STEP_MAX < 0 || FIRE_BOTTOM >= FIRE_TOP) throw Error("complete Hub rig clearance providers required");
    const CLANKER_RECTANGLE = { halfForward: 0, halfSide: 0, centerForward: 0 };
  const clankerSatelliteLandAt = (x, y, z, radius) => {
    // The rounded underside's balconies extend past the surface land mask.
    // Admit their actual footing so a window landing can continue walking.
    const terrainFloor = getIsland().supportAt(x, z, y, STEP_MAX, -Infinity, radius);
    if (Number.isFinite(terrainFloor) && Math.abs(terrainFloor - y) <= STEP_MAX) return true;
    let admitted = false;
    if (getMempool()) {
      const p = getMempool().place, s = poolModels.SITE, dx = x - p.x, dz = z - p.z;
      const cos = getMempool().cos, sin = getMempool().sin;
      const across = dx * cos - dz * sin, along = dx * sin + dz * cos;
      const reach = radius;
      const bridge = Math.abs(across) + reach < s.width / 2
        && along >= p.bridgeLocalZ + s.deckStart - reach && along <= p.bridgeLocalZ + s.span + reach;
      admitted = bridge || getMempool().layout.onIsland(across, along, reach);
    }
    // These floors are solid-prop meshes outside the main terrain's domain.
    // Use the queried footprint circle, not the complete body's bounding
    // radius: its three aligned circles fit the narrow wooden crossings.
    if (!admitted && getTimechain()) {
      const p = getTimechain().place, s = BL.timechainModels.SITE, dx = x - p.x, dz = z - p.z;
      const cos = getTimechain().cos, sin = getTimechain().sin;
      const across = dx * cos - dz * sin, along = dx * sin + dz * cos;
      const bridge = Math.abs(across) + radius <= s.width / 2 + 1e-7
        && along >= p.bridgeZ - radius && along <= p.bridgeZ + s.span + 0.5 + radius;
      admitted = bridge || Math.hypot(dx, dz) + radius < s.radius;
    }
    if (!admitted && getBifrost()) admitted = getBifrost().site.groundAt(x, z) > -Infinity;
    if (!admitted) return false;
    const support = getSolids().supportAt(x, z, y, STEP_MAX, radius);
    return support > -Infinity && support <= y + STEP_MAX && support >= y - 3.5;
  };
  const clankerCylinderClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null, climbing = false, actors = true, checkTerrain = true, toRadius = radius, toHeight = height, skipClimbMasonry = false) => {
    const fromRadius = radius, fromHeight = height;
    radius = Math.max(radius, toRadius); height = Math.max(height, toHeight);
    const floor = y + 0.002, toFloor = toY + 0.002, body = height - 0.002;
    if (!climbing && !getIsland().onLand(toX, toZ) && !clankerSatelliteLandAt(toX, toY, toZ, radius) || crossesSealedCave(x, z, toX, toZ, y)
      || checkTerrain && (!getIsland().clearAt(toX, toFloor, toZ, radius, body)
        || !getIsland().voxelSegmentClearAt(x, floor, z, toX, toFloor, toZ, radius, body))
      || !getSolids().segmentClear(x, floor, z, toX, toFloor, toZ, fromRadius, fromHeight - 0.002, ignore, toRadius, toHeight - 0.002, !!entry && !climbing, skipClimbMasonry, false, !!entry?.rage?.active)
      || !matrixGateSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body, true)) return false;
    if ((!entry || !entry.controlled) && !npcFireClear(x, y, z, toX, toY, toZ, height)) return false;
    if (!actors || entry?.nonInteractive) return true;
    if (getClankers()) for (let i = 0; i < getClankers().list.length; i++) {
      const other = getClankers().list[i];
      if (other !== entry && other !== ignore && other.active && !clankerPassingPeer(entry, other)
        && !clankerBodySegmentClear(other, x, floor, z, toX, toFloor, toZ, radius, body)) return false;
    }
    return true;
  };
  const clankerFireDistance = (x, z, heading, hazard, forward, halfForward, halfSide) => {
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    const dx = hazard.x - x - sine * forward, dz = hazard.z - z - cosine * forward;
    const along = Math.max(0, Math.abs(dx * sine + dz * cosine) - halfForward);
    const across = Math.max(0, Math.abs(dx * cosine - dz * sine) - halfSide);
    return along * along + across * across;
  };
  const clankerFireClear = (entry, x, y, z, toX, toY, toZ, fromHeading = entry.heading, toHeading = fromHeading) => {
    if (entry.controlled) return true;
    // Prop-height blending can leave the rendered feet below their support
    // position. Keep that lower body inside the pit's avoidance height band.
    const offset = Math.min(0, entry.motion.supportOffset);
    y += offset; toY += offset;
    const rect = clankerRectangleAt(entry, CLANKER_RECTANGLE);
    const forward = rect.centerForward, halfForward = rect.halfForward + 0.1, halfSide = rect.halfSide + 0.1;
    const dx = toX - x, dz = toZ - z;
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    for (const hazard of fireHazards) {
      if (!hazard.pit.visible || Math.max(y, toY) + entry.height <= hazard.y + FIRE_BOTTOM
        || Math.min(y, toY) >= hazard.y + FIRE_TOP) continue;
      const reach = hazard.avoidRadius + Math.max(Math.abs(forward) + halfForward, halfSide);
      const hx = x - hazard.x, hz = z - hazard.z;
      const t = dx * dx + dz * dz ? clamp(-(hx * dx + hz * dz) / (dx * dx + dz * dz), 0, 1) : 0;
      if ((hx + dx * t) ** 2 + (hz + dz * t) ** 2 >= reach * reach) continue;
      const radius2 = hazard.avoidRadius ** 2;
      // A gorilla already inside the margin may walk out instead of being trapped there.
      if (clankerFireDistance(x, z, fromHeading, hazard, forward, halfForward, halfSide) < radius2
        && (hx + dx) ** 2 + (hz + dz) ** 2 > hx * hx + hz * hz
        && hx * dx + hz * dz >= 0) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25), Math.ceil(Math.abs(turn) / 0.15));
      for (let i = 0; i <= steps; i++) {
        const a = i / steps;
        if (clankerFireDistance(x + dx * a, z + dz * a, fromHeading + turn * a,
          hazard, forward, halfForward, halfSide) < radius2) return false;
      }
    }
    return true;
  };
  const CLANKER_CORE_RADIUS = BL.hubClankerSupport.CORE_RADIUS;
  const clankerCenterClear = (entry, x, y, z, toX, toY, toZ, allowOffLand = false,
    fromHeading = entry.heading, toHeading = fromHeading) => {
    const radius = CLANKER_CORE_RADIUS, centerY = 0.65, height = 0.12;
    const from = y + centerY, to = toY + centerY;
    // A center brushing a step behind it may move away; new or inward contact still blocks.
    if (!allowOffLand && !getIsland().onLand(toX, toZ) && !clankerSatelliteLandAt(toX, toY, toZ, radius)
      || crossesSealedCave(x, z, toX, toZ, y)
      || !getIsland().clearAt(toX, to, toZ, radius, height)
      || !getIsland().voxelSegmentClearAt(x, from, z, toX, to, toZ, radius, height)
      || !getSolids().segmentClear(x, from, z, toX, to, toZ, radius, height, null, radius, height, true, false, !entry.drive.airborne && !entry.jump.active, entry.rage.active)
      || !matrixGateSegmentClear(x, from, z, toX, to, toZ, radius, height, true)) return false;
    return clankerFireClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading);
  };
  const CLANKER_CORE_FROM = { x: 0, y: 0, z: 0 }, CLANKER_CORE_TO = { x: 0, y: 0, z: 0 };
  const clankerWalkCoreAt = (entry, x, y, z, heading, out) => {
    const scale = entry.root.scale.x, hip = entry.gorilla.hips.position.y * scale;
    let forward = (entry.parked || entry.biped ? 0.19 : 0.7) * scale, lift = 0.85 * scale, side = 0;
    if (clankerGroundPlaneAt(x, y, z, heading, CLANKER_WALK_PLANE)) {
      // Rotate around the rig's hip, matching its pitch and roll. An unbounded
      // slope * forward offset puts the trunk below its feet when descending.
      const along = CLANKER_WALK_PLANE.groundZ, norm = Math.hypot(1, along);
      const across = CLANKER_WALK_PLANE.groundX / norm, rollNorm = Math.hypot(1, across);
      const relative = (lift - hip) / rollNorm;
      side = -(lift - hip) * across / rollNorm;
      lift = hip + (relative + along * forward) / norm;
      forward = (forward - along * relative) / norm;
      // Downhill pitch must not put the trunk core below the lower contact
      // ray, where a legal tread would be mistaken for a blocking wall.
      lift = Math.max(lift, 0.65 * scale);
    }
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    out.x = x + sine * forward + cosine * side;
    out.y = y + lift; out.z = z + cosine * forward - sine * side;
  };
  const clankerWalkCoreClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading, stationary = false) => {
    // Protect the trunk near the middle of the support rectangle, not just
    // the pelvis point behind it. This extra core applies to island stone;
    // props keep their existing center clearance and blended support.
    // A planted turn remains available to face away from a contacted wall.
    // Live planted turns may face away from contact. Recovery has no previously
    // admitted body, so its stationary query must prove the core itself clear.
    if (!stationary && x === toX && z === toZ || entry.drive.airborne || entry.fire.rolling) return true;
    const scale = entry.root.scale.x, radius = 0.34 * scale, height = 0.12 * scale;
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.15));
    const from = CLANKER_CORE_FROM, to = CLANKER_CORE_TO;
    clankerWalkCoreAt(entry, x, y, z, fromHeading, from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, heading = fromHeading + turn * t;
      clankerWalkCoreAt(entry, x + (toX - x) * t, y + (toY - y) * t, z + (toZ - z) * t, heading, to);
      if (!getIsland().clearAt(to.x, to.y, to.z, radius, height)
        || !getIsland().voxelSegmentClearAt(from.x, from.y, from.z, to.x, to.y, to.z, radius, height)) return false;
      from.x = to.x; from.y = to.y; from.z = to.z;
    }
    return true;
  };
  const clankerOpeningClear = (entry, x, y, z, toX, toY, toZ) => {
    // An upright climber can swing its feet through a window before the
    // broader walking rectangle follows. Check the actual foot path as well
    // as the trunk core; a stone sill or a prop must remain solid.
    const radius = 0.025, from = y + 0.08, to = toY + 0.08;
    return clankerCenterClear(entry, x, y, z, toX, toY, toZ, true)
      && getIsland().clearAt(toX, to, toZ, radius, 0.12)
      && getIsland().voxelSegmentClearAt(x, from, z, toX, to, toZ, radius, 0.12)
      && getSolids().segmentClear(x, from, z, toX, to, toZ, radius, 0.12, null, radius, 0.12, true, false, false, entry.rage.active)
      && clankerPlayersClear(entry, x, y, z, toX, toY, toZ);
  };
  const clankerRigClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading) => {
    // Only a complete companion uses its posed rig for this sweep.
    if (!entry || ignore || radius !== entry.radius || height !== entry.height) {
      return clankerCylinderClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore);
    }
    // The climbing handoff places the feet on the inner floor before the
    // quadruped body clears the window. Keep its certified center/foot sweep
    // through the throat, then restore the ordinary walking envelope.
    const exit = entry.climb;
    if (exit.openingExit && !exit.active) {
      const sx = Math.sin(exit.openingExitHeading), sz = Math.cos(exit.openingExitHeading);
      const from = (x - exit.openingExitX) * sx + (z - exit.openingExitZ) * sz;
      const to = (toX - exit.openingExitX) * sx + (toZ - exit.openingExitZ) * sz;
      const side = (toX - exit.openingExitX) * sz - (toZ - exit.openingExitZ) * sx;
      if (from >= -0.05 && to >= -0.05 && to < 2.4 && Math.abs(side) < 1.1)
        return clankerOpeningClear(entry, x, y, z, toX, toY, toZ);
    }
    // Rage keeps the same quadruped and capture sweeps through cave mouths;
    // crossing the lab threshold never reserves an upright worker pose.
    if ((entry.rage.active || !entry.motion.lab && !entry.planningLab && !labInside(toX, toY, toZ))
      && !entry.climb.active)
      return clankerCenterClear(entry, x, y, z, toX, toY, toZ,
        entry.drive.airborne && !entry.drive.passiveFall, fromHeading, toHeading)
        && clankerWalkCoreClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading);
    // The outdoor footprint catches lab benches during a vertical jump;
    // check the same upright rig that already fits between them on foot.
    const labPose = !entry.rage.active && (entry.planningLab || labInside(toX, toY, toZ)
      && (entry.controlled && entry.motion.lab && entry.drive.airborne
        || !entry.gorilla.motionActive && !entry.pound && !entry.beat && !entry.climb.active));
    if (labPose) return entry.gorilla.labPoseClear(entry.planningLab ? 2 : entry.motion.labDt || 1 / 60,
      toX, toY, toZ, toHeading, entry.speed, entry.planningLab ? entry.planningLabWork : entry.motion.labWork,
      entry.motion.labPhase, entry.planningLab ? entry.planningLabSide : entry.motion.labSide,
      getIsland().solidAt, clankerClimbTransitionClear, entry, entry.planningLab || !entry.motion.lab);
    // Crossing the entrance changes the rig immediately. Reserve the outside
    // quadruped before leaving, while the current upright body is still narrow.
    if (!entry.rage.active && entry.motion.lab && !entry.gorilla.motionActive && !entry.climb.active) {
      clankerExitBodyPending = true;
      if (!entry.gorilla.labPoseClear(2, toX, toY, toZ, toHeading, entry.speed, "", 0, 1,
        getIsland().solidAt, clankerExitTransitionClear, entry, true, false)) return false;
    }
    // A controlled smash moves on the ordinary walking footprint. Its raised
    // fists still animate and hit, but cannot halt travel on a terrain tread.
    if (!(entry.controlled && entry.actionControlled) && (!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (entry.planningRoam || entry.footprintMode === "walk")
      && (clankerGroundPlaneAt(x, y, z, fromHeading, CLANKER_WALK_PLANE)
        || clankerGroundPlaneAt(toX, toY, toZ, toHeading, CLANKER_WALK_PLANE))) {
      const p = entry.root.position;
      const planning = entry.planningRoam || Math.hypot(x - p.x, y - p.y, z - p.z) > 0.001;
      entry.walkPoseChecked = true;
      return entry.gorilla.walkPoseClear(x, y, z, toX, toY, toZ, fromHeading, toHeading,
        entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, getIsland().hullClearAt,
        entry, planning ? 1 / 30 : entry.motion.labDt || 1 / 60, planning ? 0 : entry.speed, planning);
    }
    if (!(entry.controlled && entry.actionControlled) && (!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (entry.planningRoam || entry.footprintMode === "walk")
      && (entry.motion.supportOffset < -0.001 || clankerTerraceAt(x, y, z, fromHeading)
        || clankerTerraceAt(toX, toY, toZ, toHeading))) {
      const p = entry.root.position;
      const planning = entry.planningRoam || Math.hypot(x - p.x, y - p.y, z - p.z) > 0.001;
      entry.walkPoseChecked = true;
      const dt = planning ? 1 / 30 : entry.motion.labDt || 1 / 60, offset = entry.motion.supportOffset;
      const dx = toX - x, dz = toZ - z;
      const speed = planning ? 0 : Math.hypot(dx, dz) / dt
        * (dx * Math.sin(toHeading) + dz * Math.cos(toHeading) < 0 ? -1 : 1);
      entry.motion.supportOffset = planning ? 0 : Math.max(-1.02, Math.min(1.02,
        offset + (entry.drive.passiveFall ? 0 : y - toY))) * Math.exp(-12 * dt);
      let clear;
      try {
        clear = entry.gorilla.walkPoseClear(x, y, z, toX, toY, toZ, fromHeading, toHeading,
          entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, getIsland().hullClearAt,
          entry, dt, speed, planning);
        if (clear) {
          entry.motion.supportOffset = 0;
          clear = entry.gorilla.walkPoseClear(toX, toY, toZ, toX, toY, toZ, toHeading, toHeading,
            entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, getIsland().hullClearAt,
            entry, 2, 0, true);
        }
      } finally { entry.motion.supportOffset = offset; }
      return clear;
    }
    return BL.agent.footprint.sweep(entry, x, y, z, toX, toY, toZ, radius, height,
      fromHeading, toHeading, clankerCylinderClear, ignore);
  };
  const CLANKER_WALK_PLANE = { groundX: 0, groundY: 0, groundZ: 0 };
  const clankerWalkSolidAt = (x, y, z) => !getIsland().clearAt(x, y, z, 0, 0);
  const clankerWalkTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height,
    actors, riders, toRadius, toHeight) => clankerCylinderClear(x, y, z, nx, ny, nz,
      radius, height, entry, null, false, actors, false, toRadius, toHeight);
  const CLANKER_REST_FOOTING = { lab: false, supportOffset: 0 };
  const clankerPointFootingAt = (x, z, y, skipRageProps = false) => Math.max(
    getIsland().supportAt(x, z, y, 0.02, ABYSS_FLOOR), getSolids().supportAt(x, z, y, 0.02, 0, null, null, false, null, skipRageProps));
  const clankerRestFootingClear = (entry, x, y, z, heading) => {
    if (entry.rage.active || !labInside(x, y, z))
      return clankerCenterClear(entry, x, y, z, x, y, z, false, heading, heading)
        && Math.abs(clankerPointFootingAt(x, z, y, entry.rage.active) - y) < 0.1;
    CLANKER_REST_FOOTING.lab = labInside(x, y, z);
    return entry.gorilla.walkPoseClear(x, y, z, x, y, z, heading, heading,
      CLANKER_REST_FOOTING, clankerWalkSolidAt, clankerWalkTransitionClear,
      getIsland().hullClearAt, entry, 2, 0, true, clankerPointFootingAt);
  };
  // Other players are solid to the gorilla the visitor drives, as they are to a driven Ooga (`crew.outsideSupportAt`).
  // Its body is the cylinder their pages see (the rig's posed envelope): their bodies hold it off and their tops hold
  // it up on that one footprint. NPC gorillas still run under players.
  const clankerClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading, carrier = null) => {
    if (entry) entry.walkPoseChecked = false;
    const previousEntry = getPassingEntry();
    // A lab crowd overlap must not trap an airborne gorilla at its current XZ.
    // Keep peer checks on every step with horizontal travel.
    const verticalLabJump = entry && entry.controlled && entry.motion.lab && entry.drive.airborne
      && x === toX && z === toZ;
    setPassingEntry(verticalLabJump ? entry : null);
    try {
      if (entry && !ignore && getClankers() && radius === entry.radius && height === entry.height && !entry.climb.active) {
        setPassingEntry(entry);
        // Surface NPCs sweep their trunks against peers too. The old centre
        // check admitted torso pileups that the climbing checks could not clear.
        // Human controls retain the permissive surface movement.
        if (!verticalLabJump && !entry.planningLabTraffic && !entry.planningRoam && (entry.motion.lab || !entry.controlled)
          && !clankerPeersClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading)) return false;
      }
      return clankerRigClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore, fromHeading, toHeading)
        && clankerPlayersClear(entry, x, y, z, toX, toY, toZ, carrier);
    } finally {
      setPassingEntry(previousEntry);
    }
  };
  const clankerClimbClear = (entry, x, y, z, nx, ny, nz, radius, height, riders = true, actors = true, peers = true, terrain = true) => {
    const previous = getPassingEntry();
    if (!peers) setPassingEntry(entry);
    try {
      return clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, null, true, actors, terrain,
        radius, height, !terrain);
    } finally { setPassingEntry(previous); }
  };
  // At a lip the bent rig fits where a tall cylinder cannot. The controller
  // checks that exact terrain pose; scenery and other gorillas stay solid.
  const clankerClimbTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors = true, riders = true, toRadius = radius, toHeight = height, peers = true, part = null, hull = null) => {
    const previous = getPassingEntry();
    if (!peers) setPassingEntry(entry);
    const bench = (entry.motion.lab || entry.planningLab) && part === entry.gorilla.parts.armL ? entry.gorilla.labPickupBench : null;
    const station = getLab().stations[entry.planningLabStation >= 0 ? entry.planningLabStation : entry.lab.station];
    // Only the assigned touchscreen's working arm may contact its screen.
    // The torso, other arm, benches and cave walls retain their full collision.
    const screen = (entry.motion.lab || entry.planningLab) && station?.kind === "touch"
      && part === (station.side < 0 ? entry.gorilla.parts.armR : entry.gorilla.parts.armL) ? station.contact : null;
    const contact = bench || screen;
    try {
      if (clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, contact, true, actors, false, toRadius, toHeight)) return true;
      if (!hull || contact) return false;
      // Circular arm slices include empty corners beside a real masonry grip.
      // The complete, uninset swept part box must clear every slab of one rim
      // before that same slice may omit it; every other blocker stays checked.
      const reach = Math.max(radius, toRadius);
      for (let i = 0; i < getClimbMasonry().length; i++) {
        const row = getClimbMasonry()[i];
        if (Math.max(x, nx) + reach < row.minX || Math.min(x, nx) - reach > row.maxX
          || Math.max(z, nz) + reach < row.minZ || Math.min(z, nz) - reach > row.maxZ
          || Math.max(y + height, ny + toHeight) < row.minY || Math.min(y, ny) > row.maxY
          || !getSolids().isActive(row.node)) continue;
        let clear = true;
        for (let j = 0; j < row.boxes.length; j++) if (BL.convex.hullsOverlap(hull, row.boxes[j])) { clear = false; break; }
        if (clear && clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, row.node, true, actors, false, toRadius, toHeight)) return true;
      }
      return false;
    } finally { setPassingEntry(previous); }
  };
  clankerClimbTransitionClear.needsHull = true;
  let clankerBedLanding = null;
  const clankerRestTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    const c = entry.climb;
    // The preview has posed the whole rig at the bed, so this radius includes its lying head and feet.
    if (clankerBedLanding && !clankerBedPlayersClear(entry, clankerBedLanding)) return false;
    if (c.peerCheck) {
      c.peerCheck = false;
      const p = entry.root.position;
      if (!clankerPeersClear(entry, c.peerX, c.peerY, c.peerZ, p.x, p.y, p.z,
        c.peerHeading, entry.root.rotation.y, true)) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz,
      radius, height, actors, riders, toRadius, toHeight, false);
  };
  const clankerRestPoseClear = (entry, dt, lounge, staticPose = false,
    x = entry.root.position.x, y = entry.root.position.y, z = entry.root.position.z, heading = entry.heading, fromLounge = null, sequenceStep = 0, bedLanding = null) => {
    const p = entry.root.position, c = entry.climb;
    const sx = staticPose ? x : p.x, sy = staticPose ? y : p.y, sz = staticPose ? z : p.z;
    const fromHeading = staticPose ? heading : entry.heading;
    if (!entry.motion.lab && !clankerCenterClear(entry, sx, sy, sz, x, y, z, false, fromHeading, heading)) return false;
    c.peerX = sx; c.peerY = sy; c.peerZ = sz; c.peerHeading = fromHeading; c.peerCheck = true;
    clankerBedLanding = bedLanding;
    try {
      return entry.gorilla.climbPoseClear(dt, x, y, z, heading, entry.motion,
        getIsland().solidAt, clankerRestTransitionClear, entry, 0, staticPose, lounge, fromLounge, sequenceStep);
    } finally { c.peerCheck = false; clankerBedLanding = null; }
  };
  clankerRestTransitionClear.beginPose = entry => { entry.climb.peerCheck = true; };
  let clankerExitBodyPending = false;
  const clankerExitTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    if (clankerExitBodyPending) {
      clankerExitBodyPending = false;
      const mode = entry.footprintMode, compact = entry.compact, previousRadius = entry.radius, previousHeight = entry.height, p = entry.root.position;
      // The rig is temporarily in its real future pose here. Reserve the same
      // walking envelope the controller will use immediately outside the lab.
      entry.footprintMode = "pound"; entry.compact = entry.gorilla.poundCompact;
      entry.radius = Math.max(BL.clankers.WALK_RADIUS, entry.gorilla.bodyRadius + 0.1);
      entry.height = Math.max(BL.clankers.WALK_HEIGHT, entry.gorilla.bodyHeight + 0.04);
      let clear = true;
      // NPC lab departures retain their coworker passing policy while the
      // body opens outside. A queued upright trunk cannot veto that handoff.
      if (!entry.nonInteractive && !clankerLabWorker(entry) && !clankerEntering(entry)) for (const other of getClankers().list) {
        if (other.nonInteractive || other === entry || !other.active) continue;
        const q = other.root.position;
        const shape = clankerPassingPeer(entry, other) ? BL.agent.torso : BL.agent.footprint;
        if (shape.overlaps(entry, p.x, p.y, p.z, entry.root.rotation.y,
          other, q.x, q.y, q.z, other.heading, 0.03)) { clear = false; break; }
      }
      entry.footprintMode = mode; entry.compact = compact;
      entry.radius = previousRadius; entry.height = previousHeight;
      if (!clear) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight);
  };
  const clankerRestSurfaceClear = (x, y, z, foot) => {
    if (!npcRampRoofAt(x, y, z, foot)) return true;
    let nearest = Infinity, along = 0;
    for (const ramp of getIsland().headquarters.ramps) {
      const dx = x - ramp.from.x, dz = z - ramp.from.z, distance = dx * dx + dz * dz;
      if (distance < nearest) { nearest = distance; along = dx * ramp.axis.x + dz * ramp.axis.z; }
    }
    return along >= 3.25;
  };
  const CLANKER_REST_SLOPE = {
    supportEntry: null, lab: false,
    groundRects: { flat: {}, angled: { walkable: false, uneven: Infinity, groundX: 0, groundZ: 0 } }
  };
  const clankerRestSiteClear = (entry, x, y, z, heading) => {
    if (!clankerFireClear(entry, x, y, z, x, y, z, heading, heading)) return false;
    const slope = CLANKER_REST_SLOPE, angled = slope.groundRects.angled;
    slope.supportEntry = entry;
    try { clankerGroundPlaneAt(x, y, z, heading, slope, slope); }
    finally { slope.supportEntry = null; }
    if (!angled.walkable || Math.hypot(angled.groundX, angled.groundZ) > 0.2 || angled.uneven > 0.3) return false;
    // Walking uses centre clearance; a settled body must also leave its rear,
    // middle and front clear of props, interactive items and other actors.
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    for (let i = 0; i < 3; i++) {
      const offset = i * 0.7, px = x + sine * offset, pz = z + cosine * offset;
      if (!clankerCylinderClear(px, y, pz, px, y, pz, 0.85, 2.7, entry, null, false, false, false)) return false;
    }
    return true;
  };
    return { clankerSatelliteLandAt, clankerCylinderClear, clankerFireDistance, clankerFireClear, clankerCenterClear, clankerWalkCoreAt, clankerWalkCoreClear, clankerOpeningClear, clankerRigClear, clankerWalkSolidAt, clankerWalkTransitionClear, clankerPointFootingAt, clankerRestFootingClear, clankerClear, clankerClimbClear, clankerClimbTransitionClear, clankerRestTransitionClear, clankerRestPoseClear, clankerExitTransitionClear, clankerRestSurfaceClear, clankerRestSiteClear };
  };
  BL.hubClankerClearance = { create };
})();
