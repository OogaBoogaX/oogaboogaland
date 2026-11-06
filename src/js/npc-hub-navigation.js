// Actual Hub NPC work-zone detours, ledge exclusions and voluntary fire avoidance.
// World geometry and the roster are resolved at query time, including after recovery.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { clamp, lerp } = BL.math;
  const create = ({ getCrew, getIsland, workZones, openings: CAMERA_OPENINGS, cavePhysics,
    npcPileAt, walkable, playerSupportAt, destinationFeet, fireHazards,
    fireBottom: FIRE_BOTTOM, fireTop: FIRE_TOP, radius: PLAYER_RADIUS, step: STEP_MAX }) => {
    if (![getCrew, getIsland, npcPileAt, walkable, playerSupportAt, destinationFeet].every(fn => typeof fn === "function")
      || ![workZones, CAMERA_OPENINGS, fireHazards].every(Array.isArray)
      || ![FIRE_BOTTOM, FIRE_TOP, PLAYER_RADIUS, STEP_MAX].every(Number.isFinite)
      || FIRE_BOTTOM >= FIRE_TOP || PLAYER_RADIUS <= 0 || STEP_MAX < 0 || !cavePhysics)
      throw Error("Hub NPC navigation providers required");
    const { workZoneContains, workZoneSegmentClear, npcClosedCaveAt, npcClosedCaveClear } = cavePhysics;
    if (![workZoneContains, workZoneSegmentClear, npcClosedCaveAt, npcClosedCaveClear].every(fn => typeof fn === "function"))
      throw Error("Hub NPC cave collision required");
    const npcFireClear = (x, y, z, toX, toY, toZ, height) => {
      const dx = toX - x, dy = toY - y, dz = toZ - z, length = dx * dx + dz * dz;
      for (const hazard of fireHazards) {
        if (!hazard.pit.visible) continue;
        const low = hazard.y + FIRE_BOTTOM - height, high = hazard.y + FIRE_TOP;
        let enter = 0, exit = 1;
        if (dy) {
          const a = (low - y) / dy, b = (high - y) / dy;
          enter = Math.max(0, Math.min(a, b)); exit = Math.min(1, Math.max(a, b));
          if (enter >= exit) continue;
        } else if (y <= low || y >= high) continue;
        const ox = x - hazard.x, oz = z - hazard.z, before = ox * ox + oz * oz;
        // A fire can light beneath a walker: let them move outward, never deeper in.
        // A stationary point inside is still an unsafe goal.
        if (y > low && y < high && before < hazard.avoidRadius ** 2 && length > 0
          && ox * dx + oz * dz >= 0 && (ox + dx) ** 2 + (oz + dz) ** 2 > before) continue;
        const t = length ? clamp(-(ox * dx + oz * dz) / length, enter, exit) : enter;
        if ((ox + dx * t) ** 2 + (oz + dz * t) ** 2 < hazard.avoidRadius ** 2) return false;
      }
      return true;
    };
    const workZoneTraveler = (cave) => cave && !cave.nonInteractive && cave !== getCrew()?.player && (cave.state !== "working" || cave.bedTravel.mode);
    const refreshWorkZones = () => {
      const crew = getCrew();
      for (const zone of workZones) { zone.active = false; zone.half = 3.4; zone.front = 5.8; }
      for (let i = 0; i < crew.list.length; i++) {
        const cave = crew.list[i];
        // Passive work keeps its routine but creates no firing exclusion zone
        // that could redirect another actor walking past the cave.
        if (cave.nonInteractive || !cave.root.visible || cave === crew.player || cave.state !== "working" || !cave.work.phase) continue;
        const zone = workZones[cave.work.site], p = cave.work.position;
        if (!zone) continue;
        zone.active = true;
        if (cave.work.phase !== "outbound" && cave.work.phase !== "station" && cave.work.phase !== "shoot") continue;
        const dx = p.x - zone.x, dz = p.z - zone.z;
        zone.half = Math.max(zone.half, Math.abs(dx * zone.cr - dz * zone.sr) + 0.8);
        zone.front = Math.max(zone.front, dx * zone.sr + dz * zone.cr + 0.8);
      }
    };
    // Cave-mouth frames are narrow structural ledges, not NPC destinations.
    // Recovery may otherwise jump onto the top bar and find no legal walking
    // step back down to the apron. Only reject that exposed ceiling band:
    // the continuous meadow above a deeply buried HQ ramp remains walkable.
    const NPC_RAMP_ROOF_COLUMN = { floor: 0, ceiling: 0 };
    const npcRampRoofAt = (x, y, z, radius = PLAYER_RADIUS) => {
      const island = getIsland();
      for (let i = 0; i < 5; i++) {
        const px = i === 1 ? x - radius : i === 2 ? x + radius : x;
        const pz = i === 3 ? z - radius : i === 4 ? z + radius : z;
        if (island.rampColumnAt(px, pz, false, NPC_RAMP_ROOF_COLUMN)
          && Math.abs(y - NPC_RAMP_ROOF_COLUMN.ceiling) <= 0.55) return true;
      }
      return false;
    };
    const npcCaveRimAt = (x, y, z) => {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const entry = CAMERA_OPENINGS[i], m = entry.mouth;
        if (y <= m.floorY + STEP_MAX) continue;
        const dx = x - m.x, dz = z - m.z;
        const across = dx * entry.cr - dz * entry.sr, along = dx * entry.sr + dz * entry.cr;
        if (Math.abs(across) <= 3 + PLAYER_RADIUS && along >= -PLAYER_RADIUS && along <= 1 + PLAYER_RADIUS) return true;
      }
      return false;
    };
    const npcCaveRoofAt = (x, y, z) => {
      const island = getIsland();
      if (npcRampRoofAt(x, y, z)) return true;
      const surface = island.surfaceAt(x, z);
      if (y < surface - 0.15 || y > surface + STEP_MAX || surface <= STEP_MAX) return false;
      for (let i = 0; i < island.mouths.length; i++) {
        const m = island.mouths[i], sr = Math.sin(m.ry), cr = Math.cos(m.ry);
        const dx = x - m.x, dz = z - m.z;
        const across = dx * cr - dz * sr, along = dx * sr + dz * cr;
        if (Math.abs(across) <= m.room.w / 2 + PLAYER_RADIUS
          && along >= -m.room.to - 1 && along <= 1 + PLAYER_RADIUS) return true;
      }
      return false;
    };
    const npcWorkZoneAt = (cave, x, y, z) => {
      if (!workZoneTraveler(cave)) return false;
      for (const zone of workZones) if (workZoneContains(zone, x, y, z, cave.bodyHeight)) return true;
      return false;
    };
    // Where an NPC may land, for the crew and for a rider jumping off a clanker.
    const npcLandingAllowed = (x, y, z, height, cave) => !npcRampRoofAt(x, y, z) && !npcCaveRimAt(x, y, z) && !npcClosedCaveAt(x, z, y, height) && !npcPileAt(x, y, z, height) && !npcWorkZoneAt(cave, x, y, z) && npcFireClear(x, y, z, x, y, z, height);
    const npcWorkZoneClear = (cave, x, y, z, toX, toY, toZ) => {
      if (!workZoneTraveler(cave)) return true;
      const p = cave.root.position, feet = p.y - cave.baseY;
      for (const zone of workZones) {
        // A shift may start around someone. Their exit remains open.
        if (!zone.active || workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight)) continue;
        if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, cave.bodyHeight)) return false;
      }
      return true;
    };
    const npcWorkDetour = (cave, tx, tz, targetY = cave.root.position.y - cave.baseY) => {
      const out = cave.avoidance.detour, p = cave.root.position, feet = p.y - cave.baseY;
      if (!workZoneTraveler(cave)) { out.site = -1; return false; }
      if (out.goalX !== tx || out.goalZ !== tz) { out.site = -1; out.goalX = tx; out.goalZ = tz; }
      if (out.site < 0) {
        for (let i = 0; i < workZones.length; i++) {
          const zone = workZones[i];
          if (!zone.active) continue;
          const inside = workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight);
          const path = cave.pathing;
          if (!inside && workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)
            && (path.tx !== tx || path.tz !== tz || workZoneSegmentClear(zone, p.x, feet, p.z, path.targetX, targetY, path.targetZ, cave.bodyHeight))) continue;
          const localX = (p.x - zone.x) * zone.cr - (p.z - zone.z) * zone.sr;
          out.site = i; out.phase = 0; out.entryX = inside ? localX : (localX < 0 ? -1 : 1) * (zone.half + 0.9);
          out.side = (tx - zone.x) * zone.cr - (tz - zone.z) * zone.sr < 0 ? -1 : 1;
          cave.avoidance.navigation.mode = 0; cave.avoidance.tx = NaN;
          break;
        }
        if (out.site < 0) return false;
      }
      const zone = workZones[out.site];
      if (!zone.active) { out.site = -1; cave.pathing.tx = NaN; return false; }
      // Two front corners avoid both the line of fire and the occupied fan.
      // Keep this direct detour until its original goal, so painted-path hints
      // cannot pull the walker back toward an intermediate point inside it.
      if (out.phase === 0) {
        out.x = zone.x + zone.cr * out.entryX + zone.sr * (zone.front + 0.9);
        out.z = zone.z - zone.sr * out.entryX + zone.cr * (zone.front + 0.9);
        if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 1;
      }
      if (out.phase === 1) {
        if (workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)) out.phase = 2;
        else {
          const x = out.side * (zone.half + 0.9), z = zone.front + 0.9;
          out.x = zone.x + zone.cr * x + zone.sr * z; out.z = zone.z - zone.sr * x + zone.cr * z;
          if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 2;
        }
      }
      if (out.phase === 2) { out.x = tx; out.z = tz; }
      cave.pathing.tx = NaN; cave.pathing.index = cave.pathing.count;
      cave.pathing.targetX = out.x; cave.pathing.targetZ = out.z;
      return true;
    };
    const npcDestinationBlocked = (cave, x, z) => {
      // Stroll destinations are on the surface. Evaluate their own floor,
      // not the walker's current elevation at the bottom of a staircase.
      const feet = destinationFeet(cave, x, z);
      return npcRampRoofAt(x, feet, z) || npcClosedCaveAt(x, z, feet, cave.bodyHeight) || npcPileAt(x, feet, z, cave.bodyHeight) || npcWorkZoneAt(cave, x, feet, z) || !npcFireClear(x, feet, z, x, feet, z, cave.bodyHeight) || !walkable(x, z, x, z, feet, cave.bodyHeight, cave);
    };
    const npcWalkable = BL.npcClearance.create({ walkable, playerSupportAt, npcRampRoofAt,
      npcClosedCaveClear, npcWorkZoneClear, npcFireClear, npcPileAt, PLAYER_RADIUS, lerp,
      // The island is rebuilt between visits; resolve it at query time.
      island: {
        clearAt: (x, y, z, radius, height) => getIsland().clearAt(x, y, z, radius, height),
        voxelSegmentClearAt: (x, y, z, toX, toY, toZ, radius, height) =>
          getIsland().voxelSegmentClearAt(x, y, z, toX, toY, toZ, radius, height),
      },
    });
    return { refreshWorkZones, npcRampRoofAt, npcCaveRimAt, npcCaveRoofAt, npcWorkZoneAt, npcLandingAllowed, npcWorkZoneClear, npcWorkDetour, npcDestinationBlocked, npcWalkable, npcFireClear };
  };
  BL.npcHubNavigation = { create };
})();
