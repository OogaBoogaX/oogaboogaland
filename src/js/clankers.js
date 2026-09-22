// A contributor's clanker keeps its own place in the work cave and travels while
// its Ooga reloads. Routes, leaps and reservations are bounded by the roster.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, damp, mulberry32, fnv1a } = BL.math;
  const { addChild } = BL.scene;
  const SCALE = 1, SPEED = 2.7, CHILL_SPEED = 0.9, STEP = 0.52;
  // Measured full-size gallop envelope. Airborne and floor-pound poses reserve
  // their larger envelopes before beginning the animation.
  const WALK_RADIUS = 1.9, AIR_RADIUS = 2.05, FOOT = 1.4, SPACE = 0.07, TAU = Math.PI * 2;
  const WALK_HEIGHT = 2.2;
  const JUMP_SAMPLES = 20, MAX_JUMP = 8.5;
  const CLIMB_POINTS = 128, CLIMB_RADIUS = 1.05, CLIMB_HEIGHT = 3.1, CLIMB_STANDOFF = 0.87, CLIMB_SPEED = 1.65;
  const JUMP_CHARGE = 1.2, ROLL_SECONDS = 3, SOOT_SECONDS = 10, MOTION_RADIUS = BL.agent.MANAGED_MOTION_RADIUS, MOTION_HEIGHT = BL.agent.MANAGED_MOTION_HEIGHT;
  const GRAVITY = BL.pilot.WALK.gravity, NORMAL_JUMP = BL.crew.JUMP_SPEED;
  const STEERING = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 1.95, -1.95, 2.5, -2.5, Math.PI];
  const ROOM_CELLS = [[-1.7, -4.92], [1.7, -4.92], [-1.7, -3.38], [1.7, -3.38],
    [-1.7, -1.84], [1.7, -1.84], [-1.7, -0.3], [1.7, -0.3],
    [0, -4.92], [0, -3.38], [0, -1.84], [0, -0.3]];
  const create = (ctx) => {
    const { crew, sites, groundAt, clear } = ctx;
    const footprint = BL.agent.footprint;
    const list = [], byOwner = new Map(), portals = new Array(sites.length).fill(null);
    const roamRadius = ctx.roamRadius || 28, ringRadius = Math.min(roamRadius - 6, (ctx.meadowRadius || 22) - 6);
    const POINT = { x: 0, y: 0, z: 0 };
    const loungeSpots = new Float64Array(320 * 3);
    let loungeCount = 0, roofCount = 0, loungeReady = false;
    let disposed = false, elapsed = 0, player = null;
    let climbFrameBudget = 0, climbTurn = -1, climbNext = 0;
    const alive = (cave) => cave.state === "working" || cave.state === "chilling";
    const releasePortal = (e) => {
      if (e.portal >= 0 && portals[e.portal] === e) portals[e.portal] = null;
      e.portal = -1;
    };
    const claimPortal = (e, site) => {
      if (portals[site] === e) {
        if (e.route !== "exit" && !e.jump.active && caveAt(e.root.position.x, e.root.position.y, e.root.position.z) !== site
          && elapsed - e.portalSince > 18) {
          releasePortal(e); e.portalRetry = elapsed + 2; e.portalWait = false;
        } else return true;
      }
      const holder = portals[site];
      if (holder && e.route === "exit" && holder.route !== "exit" && !holder.jump.active
        && caveAt(holder.root.position.x, holder.root.position.y, holder.root.position.z) !== site) {
        releasePortal(holder); holder.route = "apron"; holder.portalWait = false;
      }
      if (portals[site]) return false;
      // Changed-cave departures get the opening first. The full-arm bodies cannot
      // safely pass side by side in the same narrow arch.
      const mouth = sites[site].mouth;
      let next = null, nearest = Infinity;
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (!other.active || other.fromSite !== site || other.route !== "exit"
          || other.phase !== "leave" && other.phase !== "travel") continue;
        const p = other.root.position;
        if (caveAt(p.x, p.y, p.z) !== site) continue;
        const distance = (p.x - mouth.x) ** 2 + (p.z - mouth.z) ** 2;
        if (distance < nearest) { next = other; nearest = distance; }
      }
      if (next && next !== e) return false;
      if (!next) {
        let hits = Infinity;
        for (let i = 0; i < list.length; i++) {
          const other = list[i];
          if (!other.active || other.site !== site || !other.hasSlot || other.portalRetry > elapsed
            || other.route !== "apron" && other.route !== "enter") continue;
          const p = other.root.position, distance = (p.x - mouth.x) ** 2 + (p.z - mouth.z) ** 2;
          if (other.hits < hits || other.hits === hits && distance < nearest) { next = other; hits = other.hits; nearest = distance; }
        }
        if (next !== e) return false;
      }
      portals[site] = e; e.portal = site; e.portalSince = elapsed;
      return true;
    };
    const caveAt = (x, y, z, inset = 0) => {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i], m = site.mouth, dx = x - m.x, dz = z - m.z;
        if (site.contains) { if (site.contains(x, y, z, inset)) return i; continue; }
        const across = dx * site.cr - dz * site.sr, along = dx * site.sr + dz * site.cr;
        const room = site.room || m.room, from = room ? room.from : 2.5, to = room ? room.to : 6.5;
        const half = along < -from ? (room ? room.w / 2 : 3) : 2.5;
        if (y >= m.floorY - 0.15 && y <= m.floorY + (room ? room.h : 4)
          && along <= 0.5 - inset && along >= -to + inset && Math.abs(across) < half - inset) return i;
      }
      return -1;
    };
    const unusedRoof = (x, y, z, foot) => {
      const roofs = ctx.loungeRoofs;
      if (!roofs || !ctx.surfaceAt || Math.abs(ctx.surfaceAt(x, z) - y) > 0.05) return false;
      let patch = false;
      for (let i = 0; i < roofs.length; i++) {
        const roof = roofs[i];
        if (y >= roof.y - 0.55 && (roof.x - x) ** 2 + (roof.z - z) ** 2 < 4.5 ** 2) { patch = true; break; }
      }
      if (!patch) return false;
      // Unused cave tops contain exposed stone as well as grass. All four
      // sides still need a nearby supporting top; the full rig clearance
      // rejects higher rock before a resting place is accepted.
      for (let side = 0; side < 4; side++) {
        const sx = x + (side < 2 ? (side ? 1 : -1) * foot : 0);
        const sz = z + (side >= 2 ? (side === 3 ? 1 : -1) * foot : 0);
        if (ctx.onLand && !ctx.onLand(sx, sz) || Math.abs(ctx.surfaceAt(sx, sz) - y) > 0.5) return false;
      }
      return true;
    };
    const grass = (x, y, z, foot = FOOT) => Number.isFinite(y) && Math.hypot(x, z) < roamRadius
      && (!ctx.onLand || ctx.onLand(x, z)) && (!ctx.isGrass || ctx.isGrass(x, z, y)
        && ctx.isGrass(x - foot, z, y) && ctx.isGrass(x + foot, z, y)
        && ctx.isGrass(x, z - foot, y) && ctx.isGrass(x, z + foot, y) || unusedRoof(x, y, z, foot));
    const landing = (x, y, z) => Number.isFinite(y) && Math.hypot(x, z) < roamRadius && (!ctx.onLand || ctx.onLand(x, z));
    const staticClear = (e, x, y, z, nx = x, ny = y, nz = z, fromHeading = e.heading, toHeading = fromHeading) =>
      clear(x, y, z, nx, ny, nz, e.radius, e.height, e, null, fromHeading, toHeading);
    // Include the complete arm envelope, and reserve airborne destinations so
    // another clanker cannot stand under a leap that is already in progress.
    const occupied = (e, x, y, z, destinations = true, heading = e.heading) => {
      const start = e.root.position;
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active) continue;
        const p = other.root.position, radius = e.radius + other.radius + SPACE;
        if (footprint.overlaps(e, x, y, z, heading, other, p.x, p.y, p.z, other.heading, SPACE)
          && !footprint.separates(e, start.x, start.y, start.z, e.heading, x, y, z, heading,
            other, p.x, p.y, p.z, other.heading, SPACE)) return true;
        if (destinations && other.jump.active) {
          const jump = other.jump, dx = jump.toX - jump.fromX, dz = jump.toZ - jump.fromZ, length2 = dx * dx + dz * dz;
          const t = length2 ? clamp(((x - jump.fromX) * dx + (z - jump.fromZ) * dz) / length2, 0, 1) : 0;
          const nearX = jump.fromX + dx * t, nearZ = jump.fromZ + dz * t;
          if (y < Math.max(jump.fromY, jump.toY) + jump.lift + other.height && y + e.height > Math.min(jump.fromY, jump.toY)
            && (x - nearX) ** 2 + (z - nearZ) ** 2 < radius * radius) return true;
        }
      }
      for (let i = 0; i < crew.list.length; i++) {
        const other = crew.list[i];
        if (!other.root.visible || other.state === "away" || other.state === "sleeping" || other.clankerRide?.entry === e) continue;
        const p = other.root.position, feet = p.y - other.baseY;
        if (footprint.circleOverlaps(e, x, y, z, heading, p.x, feet, p.z, 0.38, other.bodyHeight || other.traits.height, SPACE)
          && !footprint.circleSeparates(e, start.x, start.y, start.z, e.heading, x, y, z, heading,
            p.x, feet, p.z, 0.38, other.bodyHeight || other.traits.height, SPACE)) return true;
      }
      return false;
    };
    const expandGesture = (e, radius) => {
      if (e.lowCover) return false;
      const previous = e.radius, height = e.height, compact = e.compact, mode = e.footprintMode, p = e.root.position;
      e.footprintMode = radius >= 2.25 ? "pound" : "walk";
      e.compact = e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact;
      e.radius = Math.max(previous, radius);
      e.height = Math.max(height, 2.6);
      if (staticClear(e, p.x, p.y, p.z) && !occupied(e, p.x, p.y, p.z)) return true;
      e.radius = previous; e.height = height; e.compact = compact; e.footprintMode = mode; return false;
    };
    const reserved = (e, x, z) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || !other.hasSlot || other.site !== e.site) continue;
        if (footprint.overlaps(e, x, sites[e.site].mouth.floorY, z, sites[e.site].mouth.ry,
          other, other.slotX, other.slotY, other.slotZ, sites[e.site].mouth.ry, SPACE)) return true;
      }
      return false;
    };
    const sitePoint = (site, x, z, out) => {
      out.x = site.mouth.x + site.cr * x + site.sr * z;
      out.y = site.mouth.floorY;
      out.z = site.mouth.z - site.sr * x + site.cr * z;
      return out;
    };
    const trafficAt = (x, y, z) => {
      // Keep the whole firing fan and both grass landing pockets available.
      // Waiting gorillas must not permanently occupy the end of an exit arc.
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i], m = site.mouth, dx = x - m.x, dz = z - m.z;
        if (y < m.floorY - 0.2 || y > m.floorY + 2.6) continue;
        const across = dx * site.cr - dz * site.sr, along = dx * site.sr + dz * site.cr;
        if (along > -0.5 && along < 12 && Math.abs(across) < 6.5) return true;
      }
      return false;
    };
    const reserve = (e, move = false) => {
      const site = sites[e.site];
      if (!site) return false;
      const p = e.root.position, previousHeading = e.heading;
      e.heading = site.mouth.ry;
      // Fill the sides before the centre, keeping a route through the mouth
      // for ordinary repository populations. Every candidate still checks the
      // complete current/planned rig against furniture and other residents.
      const cells = ROOM_CELLS;
      const start = move ? (e.slotIndex + 1 + e.workCycle) % cells.length : 0;
      for (let i = 0; i < cells.length; i++) {
        const index = (start + i) % cells.length, cell = cells[index];
        sitePoint(site, cell[0], cell[1], POINT);
        if (move && Math.hypot(POINT.x - p.x, POINT.z - p.z) < 0.65) continue;
        if (occupied(e, POINT.x, POINT.y, POINT.z) || reserved(e, POINT.x, POINT.z)
          || !staticClear(e, POINT.x, POINT.y, POINT.z)) continue;
        e.slotIndex = index; e.slotX = POINT.x; e.slotY = POINT.y; e.slotZ = POINT.z; e.hasSlot = true;
        e.heading = previousHeading; return true;
      }
      e.heading = previousHeading; return false;
    };
    const leaveLounge = (e) => {
      e.groomTime = 0; e.motion.groom = 0;
      if (e.lounge === "sit" && e.gorilla.sitCompact) {
        // Retract the visiting hand before standing. The walking capsules then
        // reserve the complete rise, keeping a seated neighbour's back clear.
        e.loungeDepart = true;
      } else { e.lounge = ""; e.recover = 0.65; }
    };
    const setGoal = (e, x, y, z) => {
      if (e.lounge && Math.hypot(x - e.root.position.x, z - e.root.position.z) > 0.18) leaveLounge(e);
      e.goalX = x; e.goalY = y; e.goalZ = z;
    };
    const loungePose = (e) => {
      const choice = e.random();
      return choice < 0.5 ? "sit" : choice < 0.68 ? "back" : choice < 0.84 ? "left" : "right";
    };
    const prepareLounges = (e) => {
      if (loungeReady) return;
      loungeReady = true;
      const roofs = ctx.loungeRoofs, meadow = ctx.meadowRadius || 22;
      const compact = e.compact, radius = e.radius, height = e.height;
      e.compact = false; e.radius = Math.max(radius, 2.12); e.height = Math.max(height, 2.7);
      // Search the complete unused roof patch, including exposed stone. The
      // first small ring often lands on trees or higher voxels; a bounded half-
      // metre grid finds the actual clearings without moving props or rock.
      if (roofs && ctx.surfaceAt) for (let i = 0; i < roofs.length && loungeCount < 80; i++) {
        const roof = roofs[i], start = loungeCount;
        for (let n = 0; n < 298 && loungeCount < 80; n++) {
          if (n >= 9 && loungeCount - start >= 9) break;
          const angle = roof.angle + (n - 1) * TAU / 8, spread = n ? 1.35 : 0;
          const dx = n < 9 ? Math.sin(angle) * spread : ((n - 9) % 17 - 8) * 0.5;
          const dz = n < 9 ? Math.cos(angle) * spread : (Math.floor((n - 9) / 17) - 8) * 0.5;
          if (dx * dx + dz * dz >= 4.5 ** 2) continue;
          const x = roof.x + dx, z = roof.z + dz, y = ctx.surfaceAt(x, z);
          if (y < roof.y - 0.55 || !grass(x, y, z) || trafficAt(x, y, z) || caveAt(x, y, z) >= 0
            || !staticClear(e, x, y, z)) continue;
          const at = loungeCount++ * 3;
          loungeSpots[at] = x; loungeSpots[at + 1] = y; loungeSpots[at + 2] = z;
          roofCount++;
        }
      }
      e.compact = compact; e.radius = radius; e.height = height;
      const inner = meadow * 0.82, edge = meadow - WALK_RADIUS - 0.25;
      for (let i = 0; i < 288 && loungeCount < 320; i++) {
        const angle = i % 96 * TAU / 96, distance = inner + (edge - inner) * Math.floor(i / 96) / 2;
        const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance, y = groundAt(x, z, 0);
        if (!grass(x, y, z) || trafficAt(x, y, z) || caveAt(x, y, z) >= 0) continue;
        const at = loungeCount++ * 3;
        loungeSpots[at] = x; loungeSpots[at + 1] = y; loungeSpots[at + 2] = z;
      }
    };
    const loungeReserved = (e, x, y, z, radius = WALK_RADIUS) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || other.phase !== "chill" || other.loungePartner === e || Math.abs(other.goalY - y) > 1.5) continue;
        if (Math.hypot(other.goalX - other.root.position.x, other.goalZ - other.root.position.z) < 0.18) continue;
        const space = radius + (other.loungePartner ? 1.25 : WALK_RADIUS) + SPACE;
        if ((other.goalX - x) ** 2 + (other.goalZ - z) ** 2 < space * space) return true;
      }
      return false;
    };
    const loungeGoal = (e, x, y, z, roof, partner = null, heading = NaN) => {
      setGoal(e, x, y, z);
      e.rest = (roof ? 24 : 16) + e.random() * 22;
      e.loungeRoof = roof; e.loungePartner = partner; e.loungeHeading = heading;
      e.loungeCycle = roof ? e.loungeCycle + 1 : 0;
      e.groomTime = 0; e.groomWait = 2 + e.random() * 6;
      if (!e.loungeDepart) e.lounge = "";
      e.phase = "chill"; e.motion.groom = 0;
    };
    const loungeSeatSpace = (e, x, y, z, heading) => {
      const sine = Math.sin(heading), cosine = Math.cos(heading);
      for (let part = 0; part < 2; part++) {
        const offset = part ? 0.55 : -0.12, px = x + sine * offset, pz = z + cosine * offset;
        if (!clear(px, y, pz, px, y, pz, 0.9, 2.7, e)) return false;
        for (let i = 0; i < list.length; i++) {
          const other = list[i];
          if (other === e || !other.active) continue;
          const p = other.root.position;
          if (footprint.circleOverlaps(other, p.x, p.y, p.z, other.heading, px, y, pz, 0.9, 2.7, SPACE)) return false;
        }
      }
      return !loungeReserved(e, x, y, z, 1.25);
    };
    const nearbyLounge = (e, roof, spawn) => {
      const first = Math.floor(e.random() * Math.max(1, list.length));
      for (let i = 0; i < list.length; i++) {
        const other = list[(first + i) % list.length];
        if (other === e || !other.active || other.controlled || other.mode !== "chilling" || other.phase !== "chill" || other.loungePartner
          || other.lounge !== "sit" || !other.gorilla.sitCompact || other.loungeRoof !== roof || other.rest < 7) continue;
        // Sit just behind one shoulder, facing the same direction. Keeping the
        // torsos separate leaves a hand free to reach the neighbour's back.
        const q = other.root.position, heading = other.heading, sine = Math.sin(heading), cosine = Math.cos(heading);
        const firstSide = e.random() < 0.5 ? -1 : 1;
        for (let n = 0; n < 2; n++) {
          const side = n ? -firstSide : firstSide;
          const x = q.x - cosine * side * 1.9 - sine, z = q.z + sine * side * 1.9 - cosine;
          const y = roof && ctx.surfaceAt ? ctx.surfaceAt(x, z) : groundAt(x, z, q.y);
          if (!spawn && Math.hypot(x - e.root.position.x, z - e.root.position.z) < 2) continue;
          if (Math.abs(y - q.y) > 0.15 || !grass(x, y, z, 0.9) || trafficAt(x, y, z)
            || caveAt(x, y, z) >= 0 || !loungeSeatSpace(e, x, y, z, heading)) continue;
          loungeGoal(e, x, y, z, roof, other, heading);
          e.motion.groomSide = side;
          if (spawn) { e.heading = heading; e.lounge = "sit"; }
          return true;
        }
      }
      return false;
    };
    const chooseChill = (e, spawn = false) => {
      // Cave exits also request a fresh distant destination. Only a companion
      // still hidden during activation may already be seated at that goal.
      spawn = spawn && !e.root.visible;
      prepareLounges(e);
      const p = e.root.position, compact = e.compact, radius = e.radius, height = e.height;
      const wantsRoof = e.mode !== "working" && roofCount > 0 && e.loungeCycle < 2 && e.random() < 0.7;
      e.compact = false; e.height = Math.max(height, 2.7);
      // Prefer a small group on some visits; a crowded group always falls back
      // to another empty resting spot instead of blocking a walk indefinitely.
      if (e.random() < 0.5 && nearbyLounge(e, wantsRoof, spawn)) {
        e.compact = compact; e.radius = radius; e.height = height; return true;
      }
      for (let pass = 0; pass < 2; pass++) {
        const roof = pass ? !wantsRoof : wantsRoof;
        const count = roof ? roofCount : loungeCount - roofCount, from = roof ? 0 : roofCount;
        if (!count) continue;
        const first = Math.floor(e.random() * count);
        e.radius = roof ? Math.max(radius, 2.12) : radius;
        for (let i = 0; i < count; i++) {
          const index = from + (first + i) % count;
          const n = index * 3, x = loungeSpots[n], y = loungeSpots[n + 1], z = loungeSpots[n + 2];
          if (!spawn && Math.hypot(x - p.x, z - p.z) < 2 || occupied(e, x, y, z) || loungeReserved(e, x, y, z, e.radius)) continue;
          if (!staticClear(e, x, y, z)) continue;
          loungeGoal(e, x, y, z, roof);
          if (spawn) e.lounge = loungePose(e);
          e.compact = compact; e.radius = radius; e.height = height; return true;
        }
      }
      e.compact = compact; e.radius = radius; e.height = height; return false;
    };
    const spawnLounge = (e) => chooseChill(e, true);
    const groomLounge = (e, dt) => {
      const partner = e.loungePartner, p = e.root.position;
      const seated = e.lounge === "sit" && Math.abs(e.speed) < 0.05 && !e.fire.burning;
      let near = false;
      if (seated && partner && partner.active && !partner.controlled && partner.lounge === "sit"
        && partner.phase === "chill" && !partner.fire.burning) {
        const q = partner.root.position, dx = q.x - p.x, dz = q.z - p.z;
        const side = dx * Math.cos(e.heading) - dz * Math.sin(e.heading);
        const forward = dx * Math.sin(e.heading) + dz * Math.cos(e.heading);
        near = Math.abs(q.y - p.y) < 0.2 && Math.abs(side) > 1.6 && Math.abs(side) < 2.25 && forward > 0.65 && forward < 1.35;
        if (near) {
          e.motion.groomSide = side < 0 ? -1 : 1;
          near = !ctx.groomClear || ctx.groomClear(e, partner);
        }
      }
      if (e.loungeDepart) near = false;
      if (!near) e.groomTime = 0;
      else if (e.groomTime > 0) e.groomTime = Math.max(0, e.groomTime - dt);
      else if ((e.groomWait -= dt) <= 0) {
        e.groomTime = 2.2 + e.random() * 2.4;
        e.groomWait = 7 + e.random() * 10;
      }
      e.motion.groom = damp(e.motion.groom, near && e.groomTime > 0 ? 1 : 0, 6, dt);
      e.motion.groomPhase += dt;
    };
    const departLounge = (e, dt) => {
      e.speed = 0; e.motion.groom = 0;
      const p = e.root.position;
      if (!e.gorilla.compact) return;
      e.footprintMode = "walk"; e.compact = true;
      if (!occupied(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z)) {
        e.loungeDepart = false; e.lounge = ""; e.recover = 0.65;
        return;
      }
      // If a neighbour arrived close in front, scoot back while still seated
      // until the entire walking pose fits. Never stand through another body.
      e.footprintMode = "sit"; e.compact = e.gorilla.sitCompact;
      const sine = Math.sin(e.heading), cosine = Math.cos(e.heading);
      for (let side = 0; side < 3; side++) {
        const across = side ? (side === 1 ? -1 : 1) * dt * 0.3 : 0;
        const x = p.x - sine * dt * 0.35 + cosine * across, z = p.z - cosine * dt * 0.35 - sine * across;
        const y = groundAt(x, z, p.y);
        if (Math.abs(y - p.y) > 0.12 || !grass(x, y, z, 0.9) || !loungeSeatSpace(e, x, y, z, e.heading)
          || !staticClear(e, p.x, p.y, p.z, x, y, z)) continue;
        p.x = x; p.y = y; p.z = z;
        break;
      }
    };
    const alignLounge = (e, dt) => {
      if (!Number.isFinite(e.loungeHeading)) return true;
      const p = e.root.position, delta = Math.atan2(Math.sin(e.loungeHeading - e.heading), Math.cos(e.loungeHeading - e.heading));
      if (Math.abs(delta) < 0.015) return true;
      const heading = e.heading + delta * (1 - Math.exp(-8 * dt));
      if (occupied(e, p.x, p.y, p.z, true, heading) || !staticClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, heading)) {
        // A companion may have moved since this spot was chosen. Leave the
        // seating plan rather than twisting the arm chain through its body.
        e.rest = Math.min(e.rest, 1);
        return false;
      }
      e.heading = heading;
      return false;
    };
    const waitSpot = (e) => {
      const p = e.root.position;
      // The human firing fan is at the cave apron. Overflow waits well inland,
      // outside the fan's reload approach.
      const fromAngle = Math.hypot(p.x, p.z) > 1 ? Math.atan2(p.x, p.z) : e.index * 2.39996323;
      for (let i = 0; i < 96; i++) {
        const angle = fromAngle + (e.random() - 0.5) * (i < 16 ? 0.9 : TAU), radius = ringRadius * (0.5 + e.random() * 0.58);
        const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius, y = groundAt(x, z, 0);
        if (!grass(x, y, z, e.foot) || trafficAt(x, y, z) || occupied(e, x, y, z) || !staticClear(e, x, y, z)) continue;
        setGoal(e, x, y, z); return true;
      }
      setGoal(e, p.x, p.y, p.z); return false;
    };
    const yieldSpace = (e) => {
      if (e.yieldFor > 0) return;
      const p = e.root.position;
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || other.phase !== "travel" && other.phase !== "leave") continue;
        const q = other.root.position, dx = p.x - q.x, dz = p.z - q.z, distance = Math.hypot(dx, dz);
        if (Math.abs(p.y - q.y) > e.height || distance > e.radius + other.radius + 2.5) continue;
        if (dx * (other.goalX - q.x) + dz * (other.goalZ - q.z) <= 0) continue;
        const away = Math.atan2(dx, dz);
        for (let n = 0; n < 12; n++) {
          const angle = away + STEERING[n % 6], step = n < 6 ? 3 : 4.5;
          const x = p.x + Math.sin(angle) * step, z = p.z + Math.cos(angle) * step, y = groundAt(x, z, p.y);
          if (!grass(x, y, z, e.foot) || trafficAt(x, y, z) || occupied(e, x, y, z) || !staticClear(e, x, y, z)) continue;
          setGoal(e, x, y, z); e.yieldFor = 1.2; e.rest = 0; return;
        }
        e.yieldFor = 0.5;
      }
    };
    const beginTravel = (e, siteIndex) => {
      releasePortal(e);
      e.site = siteIndex; e.hasSlot = false; e.slotIndex = -1; e.overflow = false;
      e.portalWait = false; e.portalRetry = 0;
      e.phase = "travel"; e.route = "exit"; e.entryTurn = false; e.blocked = 0; e.retry = 0;
      const p = e.root.position, from = caveAt(p.x, p.y, p.z);
      e.fromSite = from;
      const room = reserve(e);
      if (from === siteIndex && room) {
        e.phase = "work"; e.route = ""; e.rest = 0.5;
        setGoal(e, e.slotX, e.slotY, e.slotZ);
      } else if (!room && from < 0) {
        e.phase = "wait"; e.overflow = true; e.retry = 1 + e.index * 0.07;
        if (grass(p.x, p.y, p.z, e.foot) && Math.hypot(p.x, p.z) < ringRadius * 0.8) setGoal(e, p.x, p.y, p.z);
        else waitSpot(e);
      }
    };
    const activate = (e) => {
      const d = e.drive, f = e.fire, m = e.motion;
      e.lowCover = false; e.backoutLeft = 0;
      d.x = d.z = d.charge = d.vx = d.vy = d.vz = d.motionRecover = 0;
      d.climbExitHeading = d.climbExitLook = NaN;
      d.jumpHeld = d.jumpDown = d.jumpArmed = d.airborne = d.resume = d.motionEnvelope = false; d.grounded = true;
      f.burning = f.rolling = f.requested = f.escaping = false; f.retry = f.escapeRetry = 0; f.age = f.heat = f.soot = f.cooldown = f.rollRecover = 0;
      m.charge = m.takeoff = m.landing = m.roll = m.rollAngle = m.climb = m.mantle = m.groom = 0;
      e.climb.active = false; e.climb.retry = d.climbAxis = 0;
      e.actionControlled = e.motion.smash = false;
      e.mode = e.owner.state; e.site = e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site;
      e.parked = e.mode === "working"; e.parkFor = 0; e.exitFootprint = false;
      e.biped = e.parked ? "squeeze" : false;
      e.radius = WALK_RADIUS; e.foot = FOOT;
      e.pound = e.beat = e.stand = e.recover = 0; e.lounge = ""; e.loungeDepart = false; e.footprintMode = e.parked ? "park" : "walk";
      e.gorilla.poseManaged(2, e.root.position.x, e.root.position.y, e.root.position.z, e.heading, 0, false, e.biped);
      e.compact = e.parked ? e.gorilla.parkCompact : false;
      e.active = true; e.root.visible = false; e.hasSlot = false; e.jump.active = false; e.overflow = false;
      e.portalWait = false; e.portalRetry = 0;
      if (e.mode === "working" && sites[e.site] && reserve(e)) {
        e.root.position.x = e.slotX; e.root.position.y = e.slotY; e.root.position.z = e.slotZ;
        e.heading = sites[e.site].mouth.ry;
        e.phase = "work"; e.route = ""; e.rest = 1 + e.random() * 2;
        setGoal(e, e.slotX, e.slotY, e.slotZ);
      } else {
        e.parked = false; e.biped = false; e.footprintMode = "walk";
        e.gorilla.poseManaged(2, e.root.position.x, e.root.position.y, e.root.position.z, e.heading, 0, false, false);
        e.compact = e.mode === "working" && e.gorilla.compact;
        if (e.mode === "working" ? waitSpot(e) : spawnLounge(e)) {
          e.root.position.x = e.goalX; e.root.position.y = e.goalY; e.root.position.z = e.goalZ;
          if (e.mode === "working" && sites[e.site]) beginTravel(e, e.site);
        } else { e.active = false; e.retry = 1; return; }
      }
      e.gorilla.poseManaged(e.lounge ? 2 : 1 / 60, e.root.position.x, e.root.position.y, e.root.position.z, e.heading, 0, false, e.biped, e.lounge);
      if (e.lounge === "sit" && e.gorilla.sitCompact) { e.footprintMode = "sit"; e.compact = true; }
      e.root.visible = true;
      if (ctx.track && !e.tracked) { ctx.track(e); e.tracked = true; }
    };
    for (let i = 0; i < crew.list.length; i++) {
      const owner = crew.list[i], gorilla = BL.agent.create({ managed: true, groundAt, scale: SCALE });
      gorilla.poseManaged(0.6, 0, 0, 0, i * 2.39996323, 0, false, false);
      const entry = {
        owner, cave: owner, gorilla, root: gorilla.root, index: i,
        radius: WALK_RADIUS, height: 2.7, foot: FOOT, minY: 0, biped: false, compact: owner.state === "working" && gorilla.compact, footprintMode: "walk",
        active: false, tracked: false, mode: "", phase: "", route: "", entryTurn: false, site: -1, fromSite: -1, portal: -1,
        hasSlot: false, slotIndex: -1, slotX: 0, slotY: 0, slotZ: 0, goalX: 0, goalY: 0, goalZ: 0,
        random: mulberry32(fnv1a(`clanker/${owner.id || owner.traits.name || i}`)),
        heading: i * 2.39996323, speed: 0, blocked: 0, retry: 0, rest: 0, yieldFor: 0, turn: 1, portalWait: false,
        steerHeading: NaN, steerSide: 0, steerFor: 0, steerClear: 0, steerGoalX: NaN, steerGoalZ: NaN,
        lowCover: false, backoutLeft: 0, backoutHeading: 0,
        sampleTime: 0, sampleX: 0, sampleZ: 0, stuckTime: 0, portalSince: 0, portalRetry: 0,
        overflow: false, activity: 0, hits: 0, pounds: 0, pound: 0, poundHit: false, poundPower: 2,
        drag: { cave: null, time: 0 },
        beat: 0, beats: 0, stand: 0, parked: false, parkFor: 0, exitFootprint: false, workCycle: 0, recover: 0, lounge: "", jumps: 0,
        loungePartner: null, loungeHeading: NaN, loungeCycle: 0, loungeRoof: false, loungeDepart: false, groomTime: 0, groomWait: 0,
        controlled: false, pendingSite: -1, actionControlled: false,
        drive: { x: 0, z: 0, climbAxis: 0, heading: NaN, climbExitHeading: NaN, climbExitLook: NaN,
          run: false, jumpHeld: false, jumpDown: false, jumpArmed: false,
          cancelled: false, charge: 0, vx: 0, vy: 0, vz: 0, airborne: false, grounded: true, resume: false, motionRecover: 0, motionEnvelope: false },
        motion: { charge: 0, poundCharge: 0, takeoff: 0, landing: 0, roll: 0, rollAngle: 0, smash: false, dragging: false,
          climb: 0, climbBlend: NaN, climbStride: 0, climbDirection: 0, mantle: 0, groom: 0, groomSide: 1, groomPhase: 0 },
        climb: { active: false, descending: false, progress: 0, length: 0, lowerY: 0, upperY: 0, climbs: 0,
          count: 0, index: 0, heading: 0, topHeading: 0, exitHeading: 0, fromTop: false, basePrepEnd: 0, lowerGroundDistance: 0, bottomTurn: 0, mount: 0, finish: 0, retry: 0, blocked: 0, mantleStart: 0, mantleRiseEnd: 0, autoTo: -1, waitRelease: false, lowerExit: true, minimum: 0, attempts: 0, failure: "", blockX: 0, blockY: 0, blockZ: 0,
          searchPending: false, searchDeferred: false, searchCursor: 0, searchIndex: 0, searchBudget: 0,
          searchX: 0, searchY: 0, searchZ: 0, searchHeading: 0, searchDescending: false,
          searchGoalX: 0, searchGoalY: 0, searchGoalZ: 0,
          points: new Float64Array(CLIMB_POINTS * 3), lengths: new Float64Array(CLIMB_POINTS) },
        fire: { burning: false, age: 0, heat: 0, rolling: false, rollTime: 0, soot: 0, cooldown: 0,
          reaction: 0, rollRecover: 0, x: 0, z: 0, heading: 0, requested: false, retry: 0,
          escaping: false, escapeRetry: 0, escapeX: 0, escapeY: 0, escapeZ: 0 },
        fireFX: { next: 0 },
        jump: { active: false, progress: 0, reverse: false, duration: 0, fromX: 0, fromY: 0, fromZ: 0,
          toX: 0, toY: 0, toZ: 0, lift: 0,
          points: new Float64Array((JUMP_SAMPLES + 1) * 3) }
      };
      gorilla.root.visible = false;
      gorilla.root.matrixNative = false;
      gorilla.root.matrixLiving = true;
      addChild(ctx.root, gorilla.root);
      list.push(entry); byOwner.set(owner, entry);
    }
    const sync = () => {
      if (disposed) return;
      for (let i = 0; i < list.length; i++) if (!list[i].active && alive(list[i].owner)) activate(list[i]);
    };
    sync();
    const plan = (cave, index) => {
      const e = byOwner.get(cave);
      if (!e || !sites[index]) return;
      if (e.controlled || e.drive.airborne || e.climb.active) { e.pendingSite = index; return; }
      // Reloading never evicts a gorilla whose next shift is in this cave.
      if (e.site === index) return;
      if (!e.active) { e.site = index; return; }
      beginTravel(e, index);
    };
    const jumpPoint = (jump, t, out) => {
      out.x = jump.fromX + (jump.toX - jump.fromX) * t;
      out.y = jump.fromY + (jump.toY - jump.fromY) * t + jump.lift * 4 * t * (1 - t);
      out.z = jump.fromZ + (jump.toZ - jump.fromZ) * t;
    };
    const prepareJump = (e, x, y, z, lift = 0, vault = false) => {
      if (e.lowCover) return false;
      const p = e.root.position, jump = e.jump, distance = Math.hypot(x - p.x, z - p.z);
      if (distance > MAX_JUMP || y > p.y + 1.7 || y < p.y - 7.5 || !landing(x, y, z)
        || e.phase === "work" && caveAt(x, y, z, AIR_RADIUS) !== e.site) return false;
      const previousRadius = e.radius, previousCompact = e.compact;
      e.compact = false;
      e.radius = Math.max(AIR_RADIUS, previousRadius);
      if (occupied(e, p.x, p.y, p.z) || !staticClear(e, p.x, p.y, p.z) || occupied(e, x, y, z)) {
        e.radius = previousRadius; e.compact = previousCompact; return false;
      }
      jump.fromX = p.x; jump.fromY = p.y; jump.fromZ = p.z;
      jump.toX = x; jump.toY = y; jump.toZ = z;
      jump.lift = lift || 0.5 + distance * 0.16;
      jump.duration = Math.max(vault ? 1 : 0.52, distance / (vault ? 2.4 : 3.3));
      if (y < p.y - 1.7) {
        jump.lift = Math.max(jump.lift, (p.y - y) * 0.55 + 0.4);
        jump.duration = Math.max(jump.duration, Math.sqrt((p.y - y) * 2 / 9.8) + 0.45);
      }
      const points = jump.points;
      points[0] = p.x; points[1] = p.y; points[2] = p.z;
      for (let i = 1; i <= JUMP_SAMPLES; i++) {
        jumpPoint(jump, i / JUMP_SAMPLES, POINT);
        const j = i * 3;
        if (!staticClear(e, points[j - 3], points[j - 2], points[j - 1], POINT.x, POINT.y, POINT.z)
          || occupied(e, POINT.x, POINT.y, POINT.z)) { e.radius = previousRadius; e.compact = previousCompact; return false; }
        points[j] = POINT.x; points[j + 1] = POINT.y; points[j + 2] = POINT.z;
      }
      jump.active = true; jump.progress = 0; jump.reverse = false; e.jumps++;
      return true;
    };
    const tryJump = (e, heading) => {
      const p = e.root.position, sx = Math.sin(heading), sz = Math.cos(heading);
      const vaultLift = caveAt(p.x, p.y, p.z) >= 0 ? 1.4 : 2.2;
      for (let distance = 0.35; distance <= MAX_JUMP; distance += 0.35) {
        const x = p.x + sx * distance, z = p.z + sz * distance;
        if (distance < 1) continue;
        const y = groundAt(x, z, p.y + 1.65);
        if (prepareJump(e, x, y, z) || prepareJump(e, x, y, z, vaultLift, true)) return true;
      }
      return false;
    };
    const updateJump = (e, dt) => {
      const jump = e.jump, p = e.root.position;
      let next = jump.progress, moved = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        next = clamp(jump.progress + (jump.reverse ? -dt : dt) / jump.duration, 0, 1);
        jumpPoint(jump, next, POINT);
        // Reservations prevent a new leap from crossing an existing route.
        // In flight, sweep the actual bodies: conservative future corridors
        // must not pin an already-airborne clanker in both directions.
        if (staticClear(e, p.x, p.y, p.z, POINT.x, POINT.y, POINT.z)) { moved = true; break; }
        // Moving actors can temporarily obstruct either end. Recheck both
        // directions, so a blocked retreat can resume a now-clear landing.
        jump.reverse = !jump.reverse;
      }
      if (!moved) { e.speed = 0; return; }
      p.x = POINT.x; p.y = POINT.y; p.z = POINT.z; jump.progress = next;
      e.speed = Math.hypot(jump.toX - jump.fromX, jump.toZ - jump.fromZ) / jump.duration;
      if (next === 1 || next === 0 && jump.reverse) {
        jump.active = false; e.blocked = 0; e.rest = Math.max(e.rest, 0.12);
      }
    };
    // One bounded, reversible wall route per gorilla. Endpoints reserve a full
    // walking body; the upright climb reserves the measured hand/foot envelope.
    const CLIMB_HAND_X = [-0.65, -0.35, -0.15, 0.15, 0.35, 0.65];
    const climbClear = (e, x, y, z, nx = x, ny = y, nz = z, heading = e.climb.active ? e.climb.heading : e.heading, actors = true) => {
      if (ctx.climbRidersClear && !ctx.climbRidersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      const sine = Math.sin(heading), cosine = Math.cos(heading);
      // The forward knuckles/toes use a shallow row of circles; enclosing the
      // entire spread grip in one cylinder would hold the chest far off the wall.
      for (let i = -1; i < CLIMB_HAND_X.length; i++) {
        const side = i < 0 ? 0 : CLIMB_HAND_X[i], front = i < 0 ? -0.12 : 0.48, radius = i < 0 ? 0.85 : 0.36;
        const dx = cosine * side + sine * front, dz = -sine * side + cosine * front;
        if (!(ctx.climbClear ? ctx.climbClear(e, x + dx, y, z + dz, nx + dx, ny, nz + dz, radius, CLIMB_HEIGHT, false, actors)
          : clear(x + dx, y, z + dz, nx + dx, ny, nz + dz, radius, CLIMB_HEIGHT, e))) return false;
      }
      return true;
    };
    const climbWalkClear = (e, x, y, z, nx, ny, nz, heading, actors = true) => {
      if (ctx.climbRidersClear && !ctx.climbRidersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      const sx = Math.sin(heading), sz = Math.cos(heading);
      for (let i = 0; i < 3; i++) {
        const offset = 0.05 + i * 0.775;
        if (!(ctx.climbClear ? ctx.climbClear(e, x + sx * offset, y, z + sz * offset,
          nx + sx * offset, ny, nz + sz * offset, 0.88, CLIMB_HEIGHT, false, actors)
          : clear(x + sx * offset, y, z + sz * offset, nx + sx * offset, ny, nz + sz * offset, 0.88, CLIMB_HEIGHT, e))) return false;
      }
      return true;
    };
    const climbPoint = (c, distance, out) => {
      let i = c.index;
      while (i > 0 && c.lengths[i] > distance) i--;
      while (i < c.count - 2 && c.lengths[i + 1] < distance) i++;
      c.index = i;
      const k = clamp((distance - c.lengths[i]) / Math.max(0.0001, c.lengths[i + 1] - c.lengths[i]), 0, 1), at = i * 3;
      out.x = c.points[at] + (c.points[at + 3] - c.points[at]) * k;
      out.y = c.points[at + 1] + (c.points[at + 4] - c.points[at + 1]) * k;
      out.z = c.points[at + 2] + (c.points[at + 5] - c.points[at + 2]) * k;
    };
    const appendClimbPoint = (e, x, y, z, transition = false) => {
      const c = e.climb, i = c.count, at = i * 3;
      if (i >= CLIMB_POINTS) return false;
      const distance = i ? Math.hypot(x - c.points[at - 3], y - c.points[at - 2], z - c.points[at - 1]) : 0;
      if (i && distance < 0.0001) return true;
      const px = i ? c.points[at - 3] : x, py = i ? c.points[at - 2] : y, pz = i ? c.points[at - 1] : z;
      // A moving neighbour cannot invalidate the whole future climb. Check
      // stone/props here, then actual nearby bodies on each movement step.
      if (!(transition && ctx.climbTransitionClear ? ctx.climbTransitionClear(e, px, py, pz, x, y, z, CLIMB_RADIUS, CLIMB_HEIGHT, false)
        : climbClear(e, px, py, pz, x, y, z, e.climb.probeHeading, false))) { c.blockX = x; c.blockY = y; c.blockZ = z; return false; }
      c.points[at] = x; c.points[at + 1] = y; c.points[at + 2] = z;
      c.length += distance; c.lengths[i] = c.length; c.count++;
      return true;
    };
    const buildClimb = (e, lx, ly, lz, ux, uy, uz, heading, descending, lowerExit = true) => {
      const c = e.climb, sx = Math.sin(heading), sz = Math.cos(heading), p = e.root.position;
      const topHeading = descending ? e.heading : heading;
      c.probeHeading = heading;
      c.attempts++; c.failure = "start";
      // The current walking pose already passed movement collision. Raising
      // its full-height front-knuckle cylinders here invents a barrier at
      // the very wall the arms are about to tuck toward.
      if (descending ? !e.gorilla.climbPoseClear(0, p.x, p.y, p.z, e.heading, e.motion, ctx.solidAt) : !climbClear(e, p.x, p.y, p.z)) return false;
      c.failure = "top";
      if (!descending && !climbWalkClear(e, ux, uy, uz, ux, uy, uz, topHeading, false)) return false;
      c.failure = "path"; c.count = 0; c.length = 0; c.index = 0; c.basePrepEnd = 0;
      if (!appendClimbPoint(e, lx, ly, lz)) return false;
      if (!descending && lowerExit) {
        let shortApproach = false;
        for (let d = 0.2; d < 3.65; d += 0.2) {
          if (ctx.solidAt(lx + sx * d, ly + 0.9, lz + sz * d)) { shortApproach = true; break; }
        }
        if (shortApproach) {
          // A close start can leave no room to lift the knuckles past a rim.
          // Back up on all fours first, following the same supported footprint
          // as walking. The return trip finishes at this open setup footing.
          const startX = lx, startZ = lz;
          let y = ly;
          for (let i = 1; i <= 8; i++) {
            const x = startX - sx * i * 0.2, z = startZ - sz * i * 0.2;
            const floor = support(e, x, z, y, STEP, heading);
            if (!Number.isFinite(floor) || Math.abs(floor - y) > STEP || !landing(x, floor, z)
              || !e.gorilla.climbPoseClear(0, x, floor, z, heading, e.motion, ctx.solidAt, ctx.climbTransitionClear, e)
              || !appendClimbPoint(e, x, floor, z, true)) return false;
            lx = x; ly = y = floor; lz = z;
          }
          c.basePrepEnd = c.length;
        }
      }
      const reach = Math.hypot(ux - lx, uz - lz) + 3;
      // Reach over the lip while the feet are still on the wall. The final
      // rise blends the torso forward; only its supported continuation lowers
      // the hands all the way to the four-footed walking pose.
      const riseY = uy - Math.min(0.9, (uy - ly) * 0.45);
      const count = Math.ceil((riseY - ly) / 0.3);
      if (count < 2 || count * 2 + 7 > CLIMB_POINTS) return false;
      let lastX = lx, lastZ = lz;
      for (let i = 0; i <= count; i++) {
        const y = ly + (riseY - ly) * i / count;
        let wall = Infinity;
        // Sample the lowest protrusion over the whole upright body, rather
        // than letting a hand or the forehead disappear into a rock shelf.
        for (let h = 0; h < 13; h++) for (let side = -1; side <= 1; side++) for (let d = 0.08; d <= reach; d += 0.12) {
          if (ctx.solidAt(lx + sx * d + sz * side * CLIMB_RADIUS, y + 0.04 + h * 0.25,
            lz + sz * d - sx * side * CLIMB_RADIUS)) {
            let low = Math.max(0, d - 0.12), high = d;
            for (let refine = 0; refine < 3; refine++) {
              const middle = (low + high) * 0.5;
              if (ctx.solidAt(lx + sx * middle + sz * side * CLIMB_RADIUS, y + 0.04 + h * 0.25,
                lz + sz * middle - sx * side * CLIMB_RADIUS)) high = middle;
              else low = middle;
            }
            wall = Math.min(wall, low); break;
          }
        }
        if (!Number.isFinite(wall) && y < uy - 0.1) return false;
        let x = lastX, z = lastZ;
        if (Number.isFinite(wall)) { x = lx + sx * (wall - CLIMB_STANDOFF); z = lz + sz * (wall - CLIMB_STANDOFF); }
        // Rise beside a ledge first, then pull inward at that height. This
        // avoids a diagonal chord clipping the corner between two voxels.
        if (!appendClimbPoint(e, lastX, y, lastZ)) {
          // A projecting voxel above a grip needs an outward transfer before
          // the rise. Reserve that complete elbow instead of clipping it.
          const savedCount = c.count, savedLength = c.length, previousY = c.points[(c.count - 1) * 3 + 1];
          let placed = false;
          for (let retreat = 0.12; retreat <= 1.2; retreat += 0.12) {
            c.count = savedCount; c.length = savedLength;
            const rx = lastX - sx * retreat, rz = lastZ - sz * retreat;
            if (appendClimbPoint(e, rx, previousY, rz) && appendClimbPoint(e, rx, y, rz)) { placed = true; break; }
          }
          if (!placed) return false;
        }
        let placed = false;
        // Plant the last footfall outside the close wall grip. That small
        // outward transfer happens during the descent, leaving room to turn
        // onto all fours without sweeping the shoulders through the rock.
        for (let retreat = i ? 0 : 0.4; retreat <= (i ? 0.72 : 1.12); retreat += 0.12) {
          if (appendClimbPoint(e, x - sx * retreat, y, z - sz * retreat)) { x -= sx * retreat; z -= sz * retreat; placed = true; break; }
        }
        if (!placed) return false;
        if (!i) c.lowerGroundDistance = c.length;
        lastX = x; lastZ = z;
      }
      c.failure = "mantle"; c.mantleStart = c.length;
      const inward = Math.min(0.25, Math.max(0, (ux - lastX) * sx + (uz - lastZ) * sz) * 0.2);
      for (let i = 1; i <= 4; i++) {
        const t = i / 4;
        if (!appendClimbPoint(e, lastX + sx * inward * t, riseY + (uy - riseY) * t, lastZ + sz * inward * t, true)) return false;
      }
      lastX += sx * inward; lastZ += sz * inward;
      c.mantleRiseEnd = c.length;
      if (!descending && !climbWalkClear(e, lastX, uy, lastZ, ux, uy, uz, topHeading, false)) return false;
      if (!appendClimbPoint(e, ux, uy, uz, true)) return false;
      c.minimum = lowerExit ? 0 : c.lengths[1];
      c.lowerY = ly; c.upperY = uy; c.heading = heading; c.lowerExit = lowerExit;
      c.topHeading = topHeading; c.fromTop = descending; c.exitHeading = heading;
      c.progress = descending ? c.length : 0; c.descending = descending;
      c.mount = 0; c.finish = c.blocked = c.bottomTurn = 0; c.active = true; c.climbs++; c.failure = "";
      c.waitRelease = descending && e.controlled && e.drive.climbAxis > 0;
      c.autoTo = descending ? Math.max(0, c.mantleStart - 0.8) : -1;
      e.drive.airborne = false; e.drive.grounded = false; e.drive.vx = e.drive.vy = e.drive.vz = e.drive.charge = 0;
      e.drive.jumpArmed = false; e.motion.charge = e.motion.groom = 0;
      e.motion.climb = 1; e.motion.climbBlend = 0; e.motion.mantle = 1;
      e.drive.climbExitHeading = e.drive.climbExitLook = NaN;
      e.lounge = ""; if (e.controlled) e.loungePartner = null;
      if (e.drag.cave && ctx.onReleaseDrag) ctx.onReleaseDrag(e);
      e.speed = 0; e.biped = false;
      releasePortal(e);
      return true;
    };
    const pendingClimbSearch = (e) => {
      const c = e.climb;
      if (!c.searchPending) return false;
      const p = e.root.position, d = e.drive;
      const dx = e.controlled ? d.x : e.goalX - p.x, dz = e.controlled ? d.z : e.goalZ - p.z;
      const heading = Math.atan2(dx, dz);
      if (!e.active || c.active || e.lowCover || !e.controlled && (!alive(e.owner) || e.mode !== e.owner.state)
        || e.recover > 0 || e.jump.active || d.airborne || d.jumpArmed || e.pound || e.beat || e.stand || e.parked || e.fire.rolling
        || Math.hypot(dx, dz) <= (e.controlled ? 0.05 : 0.18)
        || Math.hypot(p.x - c.searchX, p.y - c.searchY, p.z - c.searchZ) > 0.35
        || Math.abs(Math.atan2(Math.sin(heading - c.searchHeading), Math.cos(heading - c.searchHeading))) > 0.18
        || !e.controlled && Math.hypot(e.goalX - c.searchGoalX, e.goalY - c.searchGoalY, e.goalZ - c.searchGoalZ) > 0.35
        || caveAt(p.x, p.y, p.z) >= 0 || !e.controlled && (e.route === "exit" && e.fromSite >= 0 || e.route === "enter" || e.route === "apron")) {
        c.searchPending = c.searchDeferred = false; c.searchCursor = 0; c.retry = 0;
        if (climbTurn === e.index) climbTurn = -1;
        return false;
      }
      return true;
    };
    const holdClimbSearch = (e) => {
      if (!pendingClimbSearch(e)) return false;
      // Keep the existing four-footed support while finding a complete grip
      // route. Walking around would continually invalidate the deferred cursor.
      e.speed = e.drive.vx = e.drive.vz = 0; e.biped = false;
      return true;
    };
    // A failed crest can have dozens of valid-looking footholds. Resume their
    // deterministic order over later updates instead of rebuilding every full
    // wall route in one frame. All bearings and lower-end fallbacks share this
    // cursor and budget; none restarts the first failed candidate on a retry.
    const attemptClimb = (e, lx, ly, lz, ux, uy, uz, heading, descending, lowerExit = true) => {
      const c = e.climb, index = c.searchIndex++;
      if (index < c.searchCursor) return false;
      if (!c.searchBudget || !climbFrameBudget || climbTurn >= 0 && climbTurn !== e.index) {
        c.searchDeferred = true; c.retry = 0.03; return false;
      }
      c.searchBudget--; climbFrameBudget--; climbNext = (e.index + 1) % list.length; c.searchCursor = index + 1;
      if (!buildClimb(e, lx, ly, lz, ux, uy, uz, heading, descending, lowerExit)) return false;
      c.searchPending = false;
      if (climbTurn === e.index) climbTurn = -1;
      return true;
    };
    const tryClimbAlong = (e, heading, descending = false) => {
      if (!ctx.solidAt || !ctx.surfaceAt || e.climb.active || e.climb.retry > 0 || e.jump.active || e.drive.airborne
        || e.drive.jumpArmed || e.fire.rolling || e.pound || e.beat || e.recover > 0 || e.parked) return false;
      const p = e.root.position, sx = Math.sin(heading), sz = Math.cos(heading);
      e.climb.retry = 0.6; e.climb.failure = "search";
      if (descending) {
        let edge = NaN;
        for (let d = 0.35; d <= 3.1; d += 0.25) {
          if (ctx.surfaceAt(p.x + sx * d, p.z + sz * d) < p.y - 0.8) { edge = d; break; }
        }
        if (!Number.isFinite(edge)) return false;
        for (let n = 0; n < 7; n++) for (let d = edge + 1.8; d <= edge + 6; d += 0.6) {
          const side = n ? Math.ceil(n / 2) * 0.75 * (n % 2 ? 1 : -1) : 0;
          const x = p.x + sx * d + sz * side, z = p.z + sz * d - sx * side, y = ctx.surfaceAt(x, z);
          if (!landing(x, y, z) || y > p.y - 0.8 || y < p.y - 16
            || !climbWalkClear(e, x, y, z, x, y, z, heading + Math.PI, false)) continue;
          if (attemptClimb(e, x, y, z, p.x, p.y, p.z, heading + Math.PI, true)) return true;
          if (e.climb.searchDeferred) return false;
        }
      } else {
        let wall = NaN;
        for (let d = 0.25; d <= 4.5; d += 0.2) {
          if (ctx.solidAt(p.x + sx * d, p.y + 0.9, p.z + sz * d)) { wall = d; break; }
        }
        if (!Number.isFinite(wall)) return false;
        // A distant stair tread also intersects a chest-height ray. Walk
        // those small steps normally; grips are for an actual cliff riser.
        let previousY = p.y, cliff = false;
        for (let d = 0.2; d <= wall + 0.6; d += 0.2) {
          const y = ctx.surfaceAt(p.x + sx * d, p.z + sz * d);
          if (y > previousY + STEP) { cliff = true; break; }
          previousY = y;
        }
        if (!cliff) return false;
        e.climb.failure = "landing";
        for (let n = 0; n < 7; n++) for (let d = wall + 1.5; d <= wall + 6; d += 0.6) {
          // A voxel crest can slope sideways. Pull over onto the nearest
          // complete foothold rather than insisting on an unsafe half ledge.
          const side = n ? Math.ceil(n / 2) * 0.75 * (n % 2 ? 1 : -1) : 0;
          const x = p.x + sx * d + sz * side, z = p.z + sz * d - sx * side, y = ctx.surfaceAt(x, z);
          if (!landing(x, y, z) || y < p.y + 0.8 || y > p.y + 16
            || !climbWalkClear(e, x, y, z, x, y, z, heading, false)) continue;
          if (attemptClimb(e, p.x, p.y, p.z, x, y, z, heading, false)) return true;
          if (e.climb.searchDeferred) return false;
        }
      }
      return false;
    };
    const tryClimb = (e, heading, descending = false) => {
      const c = e.climb, p = e.root.position;
      if (c.retry > 0 || e.lowCover) return false;
      if (!c.searchPending || c.searchDescending !== descending
        || Math.hypot(p.x - c.searchX, p.y - c.searchY, p.z - c.searchZ) > 0.35
        || Math.abs(Math.atan2(Math.sin(heading - c.searchHeading), Math.cos(heading - c.searchHeading))) > 0.18) {
        c.searchPending = false; c.searchCursor = 0; c.searchX = p.x; c.searchY = p.y; c.searchZ = p.z;
        c.searchHeading = heading; c.searchDescending = descending;
        c.searchGoalX = e.goalX; c.searchGoalY = e.goalY; c.searchGoalZ = e.goalZ;
      }
      // New approaches still run the cheap wall test. Only a real deferred
      // foothold joins the priority queue; ordinary grass walkers cannot fill it.
      if (c.searchPending && (!climbFrameBudget || climbTurn >= 0 && climbTurn !== e.index)) {
        c.searchPending = true; c.searchDeferred = true; c.retry = 0.03;
        return false;
      }
      c.searchPending = true; c.searchDeferred = false; c.searchIndex = 0;
      if (tryClimbAlong(e, heading, descending)) return true;
      if (c.searchDeferred) return false;
      if (!c.retry) { c.searchPending = false; return false; }
      // A diagonal approach can point through the corner of the cave rim.
      // Approach that same wall squarely, then resume the original goal above.
      let normal = Math.round(heading / (Math.PI / 2)) * Math.PI / 2, nearest = 10 * 10;
      if (ctx.loungeRoofs) for (let i = 0; i < ctx.loungeRoofs.length; i++) {
        const roof = ctx.loungeRoofs[i], distance = (p.x - roof.x) ** 2 + (p.z - roof.z) ** 2;
        if (distance < nearest) { nearest = distance; normal = roof.angle + (descending ? 0 : Math.PI); }
      }
      const delta = Math.abs(Math.atan2(Math.sin(normal - heading), Math.cos(normal - heading)));
      if (delta > 0.02 && delta < 0.65) {
        e.climb.retry = 0;
        if (tryClimbAlong(e, normal, descending)) return true;
        if (c.searchDeferred) return false;
      }
      if (descending && ctx.solidAt && ctx.surfaceAt) {
        // Descending does not require a known floor. Reserve the longest
        // available section of wall and retain a grip at its lower end.
        const sx = Math.sin(heading), sz = Math.cos(heading);
        for (let edge = 0.35; edge <= 3.1; edge += 0.25) {
          if (ctx.surfaceAt(p.x + sx * edge, p.z + sz * edge) >= p.y - 0.8) continue;
          for (let depth = 16; depth >= 2; depth -= 2) {
            const x = p.x + sx * (edge + 2), z = p.z + sz * (edge + 2);
            if (attemptClimb(e, x, p.y - depth, z, p.x, p.y, p.z, heading + Math.PI, true, false)) return true;
            if (c.searchDeferred) return false;
          }
          break;
        }
      }
      c.searchPending = false;
      if (climbTurn === e.index) climbTurn = -1;
      return false;
    };
    const climbBlocked = (e, dt) => {
      const c = e.climb;
      c.blocked += dt;
      if (!e.controlled && c.blocked > 1.2) {
        c.descending = !c.descending; c.autoTo = -1; c.blocked = 0; e.drive.resume = true;
      }
    };
    const updateClimb = (e, dt) => {
      const c = e.climb, d = e.drive, m = e.motion, p = e.root.position;
      e.speed = 0; e.compact = false;
      e.radius = Math.max(CLIMB_RADIUS, e.gorilla.bodyRadius + 0.015); e.height = Math.max(CLIMB_HEIGHT, e.gorilla.bodyHeight + 0.015);
      e.footprintMode = "pound";
      m.climb = 1; m.climbDirection = 0;
      if (c.waitRelease && d.climbAxis <= 0) c.waitRelease = false;
      let axis = e.controlled ? c.waitRelease ? 0 : d.climbAxis : c.descending ? -1 : 1;
      if (!e.controlled && !c.lowerExit && c.progress <= c.minimum + 0.001) {
        c.descending = false; c.autoTo = -1; axis = 1;
      }
      if (c.autoTo >= 0) {
        if (c.progress > c.autoTo + 0.01) axis = -1;
        else c.autoTo = -1;
      }
      if (axis < 0 && c.basePrepEnd > c.progress + 0.001) {
        // The initial backstep is still ordinary supported walking. Reversing
        // here releases the grip attempt at that safe footing immediately.
        c.active = false; c.retry = 0.8; d.grounded = true;
        m.climb = 0; m.climbBlend = NaN; m.mantle = 0;
        e.compact = e.gorilla.compact; e.footprintMode = "walk"; e.radius = WALK_RADIUS; e.height = WALK_HEIGHT;
        return;
      }
      // Finish the ground-facing turn at the foot of the wall, before taking
      // any horizontal step. The hands lower as the body rotates away, rather
      // than gliding upright across the ground and only then dropping to all fours.
      if (c.lowerExit && c.progress <= c.lowerGroundDistance + 0.001
        && (axis < 0 && c.bottomTurn < 1 || axis > 0 && c.bottomTurn > 0)) {
        const oldBlend = m.climbBlend, oldMantle = m.mantle;
        const turn = clamp(c.bottomTurn + (axis < 0 ? 1 : -1) * dt / 0.7, 0, 1), facing = c.heading + Math.PI * turn;
        let blend = 1 - turn * turn * (3 - 2 * turn);
        m.climbBlend = blend; m.mantle = 1 - blend;
        while (!e.gorilla.climbPoseClear(dt, p.x, p.y, p.z, facing, m, ctx.solidAt, ctx.climbTransitionClear, e) && blend < 1) {
          blend = Math.min(1, blend + 0.12); m.climbBlend = blend; m.mantle = 1 - blend;
        }
        if (e.gorilla.climbPoseClear(dt, p.x, p.y, p.z, facing, m, ctx.solidAt, ctx.climbTransitionClear, e)
          && (!ctx.climbRidersClear || ctx.climbRidersClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, facing))) {
          e.heading = facing; c.bottomTurn = turn; c.blocked = 0;
        } else {
          m.climbBlend = oldBlend; m.mantle = oldMantle; climbBlocked(e, dt);
        }
        return;
      }
      if (!axis) return;
      const pace = c.progress >= c.mantleStart ? 2.5 : CLIMB_SPEED;
      const bottom = c.lowerExit && axis < 0 ? c.basePrepEnd || 0 : c.minimum;
      let next = clamp(c.progress + axis * dt * pace, bottom, c.length);
      if (axis < 0 && c.lowerExit && c.progress > c.lowerGroundDistance && next < c.lowerGroundDistance) next = c.lowerGroundDistance;
      climbPoint(c, next, POINT);
      const riseEnd = Number.isFinite(c.mantleRiseEnd) ? c.mantleRiseEnd : c.mantleStart;
      const top = next <= c.mantleStart ? 0 : riseEnd > c.mantleStart && next < riseEnd
        ? 0.65 * (next - c.mantleStart) / (riseEnd - c.mantleStart)
        : clamp((riseEnd > c.mantleStart ? 0.65 : 0) + (riseEnd > c.mantleStart ? 0.35 : 1)
          * (next - riseEnd) / Math.max(0.1, c.length - riseEnd), 0, 1);
      const ground = next <= c.lowerGroundDistance + 0.001 && c.lowerExit;
      let blend = 1 - top * top * (3 - 2 * top), facing = c.heading;
      if (top > 0) {
        const turn = Math.atan2(Math.sin(c.topHeading - c.heading), Math.cos(c.topHeading - c.heading));
        facing = c.heading + turn * top;
      }
      if (ground) {
        if (axis < 0) { facing = c.heading + Math.PI * c.bottomTurn; blend = 1 - c.bottomTurn * c.bottomTurn * (3 - 2 * c.bottomTurn); }
        else {
          const start = Math.max(c.basePrepEnd || 0, c.lowerGroundDistance - 2.4);
          const approach = clamp((next - start) / Math.max(0.01, c.lowerGroundDistance - start), 0, 1);
          blend = approach * approach * (3 - 2 * approach);
        }
      }
      const oldBlend = m.climbBlend, oldMantle = m.mantle, oldStride = m.climbStride;
      let speed = ground && blend < 0.01 ? Math.hypot(POINT.x - p.x, POINT.z - p.z) / dt : 0;
      if ((POINT.x - p.x) * Math.sin(facing) + (POINT.z - p.z) * Math.cos(facing) < 0) speed = -speed;
      m.climbBlend = blend; m.mantle = 1 - blend;
      m.climbStride += POINT.y - p.y; m.climbDirection = Math.sign(axis);
      const transition = blend < 0.999 || e.gorilla.debug.climbing < 0.999 || Math.abs(facing - e.heading) > 0.001;
      if (!transition && !climbClear(e, p.x, p.y, p.z, POINT.x, POINT.y, POINT.z)) {
        m.climbBlend = oldBlend; m.mantle = oldMantle; m.climbStride = oldStride; m.climbDirection = 0;
        climbBlocked(e, dt);
        return;
      }
      if (transition && !e.gorilla.climbPoseClear(dt, POINT.x, POINT.y, POINT.z, facing, m, ctx.solidAt, ctx.climbTransitionClear, e, speed)) {
        // An uneven crest may interrupt a turn. Keep the low walking pose and
        // advance toward the open lip before continuing the pivot.
        if (!top || !e.gorilla.climbPoseClear(dt, POINT.x, POINT.y, POINT.z, e.heading, m, ctx.solidAt, ctx.climbTransitionClear, e, speed)) {
          m.climbBlend = oldBlend; m.mantle = oldMantle; m.climbStride = oldStride; m.climbDirection = 0;
          climbBlocked(e, dt); return;
        }
        facing = e.heading;
      }
      if (ctx.climbRidersClear && !ctx.climbRidersClear(e, p.x, p.y, p.z, POINT.x, POINT.y, POINT.z, e.heading, facing)) {
        m.climbBlend = oldBlend; m.mantle = oldMantle; m.climbStride = oldStride; m.climbDirection = 0;
        climbBlocked(e, dt); return;
      }
      c.blocked = 0; e.speed = speed;
      p.x = POINT.x; p.y = POINT.y; p.z = POINT.z; c.progress = next; e.heading = facing;
      if (next === c.length && axis > 0 || next === bottom && axis < 0 && c.lowerExit) {
        c.active = false; c.retry = 0.8; d.grounded = true;
        m.climb = 0; m.climbBlend = NaN; m.mantle = 0;
        e.compact = e.gorilla.compact; e.footprintMode = "walk"; e.radius = WALK_RADIUS; e.height = 2.7;
        e.recover = e.blocked = 0;
        if (axis < 0) d.climbExitHeading = e.heading;
        if (!e.controlled && (d.resume || e.pendingSite >= 0)) resumeEntry(e);
      }
    };
    const travelGoal = (e, dt) => {
      const p = e.root.position, site = sites[e.site];
      if (!site && e.phase !== "leave") return false;
      if (e.route === "exit") {
        const from = e.fromSite >= 0 ? sites[e.fromSite] : null;
        const along = from ? (p.x - from.mouth.x) * from.sr + (p.z - from.mouth.z) * from.cr : Infinity;
        if (from && along < 0.5 + e.radius && p.y < from.mouth.floorY + 2.7) {
          if (!claimPortal(e, e.fromSite)) return false;
          sitePoint(from, 0, 0.7 + e.radius, POINT);
          setGoal(e, POINT.x, POINT.y, POINT.z);
          return true;
        }
        releasePortal(e); e.route = "ring";
        if (e.phase === "leave") {
          e.phase = "chill"; e.route = ""; e.exitFootprint = true;
          return chooseChill(e, true);
        }
        if (!e.hasSlot && !reserve(e)) {
          e.phase = "wait"; e.route = ""; e.overflow = true; e.retry = 2;
          waitSpot(e); return true;
        }
      }
      if (e.route === "ring") {
        const fromAngle = Math.atan2(p.x, p.z), toAngle = Math.atan2(site.mouth.x, site.mouth.z);
        const delta = Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
        if (Math.abs(delta) > 0.2) {
          const angle = fromAngle + clamp(delta, -0.22, 0.22);
          for (let i = 0; i < 3; i++) {
            const radius = ringRadius - i * 1.5, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
            const y = groundAt(x, z, p.y);
            if (!landing(x, y, z) || occupied(e, x, y, z) || !staticClear(e, x, y, z)) continue;
            setGoal(e, x, y, z); return true;
          }
          const x = Math.sin(angle) * ringRadius, z = Math.cos(angle) * ringRadius;
          setGoal(e, x, groundAt(x, z, p.y), z); return true;
        }
        e.route = "apron";
      }
      if (e.route === "apron") {
        if (!claimPortal(e, e.site)) {
          if (!e.portalWait) { e.portalWait = true; waitSpot(e); }
          return true;
        }
        e.portalWait = false;
        // Walk into the centre aisle before approaching the arch. Painted
        // paths do not change the gait or trigger a leap.
        sitePoint(site, 0, 5.5, POINT);
        if (Math.hypot(POINT.x - p.x, POINT.z - p.z) > 0.3) {
          setGoal(e, POINT.x, POINT.y, POINT.z); return true;
        }
        e.route = "enter"; e.entryTurn = false;
      }
      if (e.route === "enter") {
        if (!claimPortal(e, e.site)) return false;
        if (!e.hasSlot && !reserve(e)) { e.overflow = true; return false; }
        e.overflow = false;
        if (!e.entryTurn) {
          sitePoint(site, 0, -0.45, POINT);
          if (Math.hypot(POINT.x - p.x, POINT.z - p.z) > 0.16) {
            setGoal(e, POINT.x, POINT.y, POINT.z); return true;
          }
          const turn = Math.atan2(Math.sin(site.mouth.ry - e.heading), Math.cos(site.mouth.ry - e.heading));
          const heading = e.heading + clamp(turn, -dt * 3, dt * 3);
          e.speed = 0;
          // Turn in the vestibule only when every intermediate part of the
          // full rig clears its neighbours, the arch and the cave fixtures.
          if (!occupied(e, p.x, p.y, p.z, true, heading)
            && staticClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, heading)) e.heading = heading;
          if (Math.abs(turn) > 0.04) return false;
          e.entryTurn = true;
        }
        setGoal(e, e.slotX, e.slotY, e.slotZ);
        if (Math.hypot(e.slotX - p.x, e.slotZ - p.z) < 0.2) {
          e.phase = "work"; e.route = ""; e.rest = 0.8 + e.random(); releasePortal(e);
        }
        return true;
      }
      return true;
    };
    const backOut = (e, dt, start = false) => {
      const p = e.root.position, heading = start ? e.heading : e.backoutHeading;
      const sx = -Math.sin(heading), sz = -Math.cos(heading);
      const step = start ? 0.8 : Math.min(e.backoutLeft, CHILL_SPEED * dt);
      const x = p.x + sx * step, z = p.z + sz * step, y = groundAt(x, z, p.y);
      if (!Number.isFinite(y) || Math.abs(y - p.y) > STEP || !landing(x, y, z)
        || occupied(e, x, y, z, true, heading)
        || !staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, heading)) {
        e.backoutLeft = 0; return false;
      }
      if (start) { e.backoutHeading = heading; e.backoutLeft = 1.5; return backOut(e, dt); }
      p.x = x; p.y = y; p.z = z; e.heading = heading; e.speed = -step / dt;
      e.backoutLeft = Math.max(e.lowCover ? 0.8 : 0, e.backoutLeft - step); e.blocked = e.stuckTime = e.sampleTime = 0;
      e.sampleX = x; e.sampleZ = z;
      return true;
    };
    const move = (e, dt, speed) => {
      if (e.recover > 0) { e.speed = 0; return; }
      if (e.backoutLeft > 0 && backOut(e, dt)) return;
      const p = e.root.position, dx = e.goalX - p.x, dz = e.goalZ - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.15) { e.speed = damp(e.speed, 0, 12, dt); return; }
      const desired = Math.atan2(dx, dz), step = Math.min(distance, speed * dt);
      const inCave = caveAt(p.x, p.y, p.z) >= 0;
      const doorway = e.route === "exit" && e.fromSite >= 0 || e.route === "enter" || e.route === "apron";
      if (!e.lowCover && !inCave && !doorway && !e.climb.retry) {
        const drop = ctx.surfaceAt && ctx.surfaceAt(p.x + Math.sin(desired) * 3.1, p.z + Math.cos(desired) * 3.1) < p.y - 0.8;
        if (tryClimb(e, desired, !!drop)) return;
      }
      if (holdClimbSearch(e)) return;
      e.sampleTime += dt;
      if (e.sampleTime >= 1) {
        e.stuckTime = Math.hypot(p.x - e.sampleX, p.z - e.sampleZ) < 0.3 ? e.stuckTime + e.sampleTime : 0;
        e.sampleTime = 0; e.sampleX = p.x; e.sampleZ = p.z;
        if (e.stuckTime > 1.5 && !inCave && !doorway && !(ctx.surfaceAt && ctx.surfaceAt(p.x + Math.sin(desired) * 3.1, p.z + Math.cos(desired) * 3.1) < p.y - 0.8)) {
          e.stuckTime = 0;
          // A roof lip can block every inward takeoff. Include a short
          // backward hop to make room for the rising part of the next arc.
          for (let i = 0; i < STEERING.length; i++) {
            const angle = desired + STEERING[i] * e.turn;
            if (tryJump(e, angle)) { e.heading = angle; return; }
          }
          if (e.phase === "wait") waitSpot(e);
        }
      }
      const aheadY = groundAt(p.x + Math.sin(desired) * (e.radius + 0.4), p.z + Math.cos(desired) * (e.radius + 0.4), p.y);
      if (!e.parked && !doorway && !inCave && aheadY < p.y - 0.7 && e.retry <= 0) {
        e.retry = 0.65;
        if (tryClimb(e, desired, true)) return;
      }
      if (!e.parked && !doorway && e.retry <= 0 && occupied(e, p.x + Math.sin(desired) * step, p.y, p.z + Math.cos(desired) * step)) {
        e.retry = 0.65;
        if (tryJump(e, desired)) { e.heading = desired; return; }
      }
      const initialMode = e.footprintMode, initialCompact = e.compact;
      if (e.steerGoalX !== e.goalX || e.steerGoalZ !== e.goalZ) {
        e.steerGoalX = e.goalX; e.steerGoalZ = e.goalZ;
        e.steerFor = e.steerClear = e.steerSide = 0; e.steerHeading = e.heading;
      }
      e.steerFor = Math.max(0, e.steerFor - dt);
      let chosen = NaN, chosenFacing = e.heading, chosenMode = initialMode, chosenCompact = initialCompact;
      let best = -Infinity, chosenY = p.y, directAhead = false, chosenAhead = false;
      for (let i = 0; i < STEERING.length; i++) {
        const heading = desired + STEERING[i] * e.turn, sx = Math.sin(heading), sz = Math.cos(heading);
        const turn = Math.atan2(Math.sin(heading - e.heading), Math.cos(heading - e.heading));
        const roomFacing = e.route === "exit" && e.fromSite >= 0 ? sites[e.fromSite].mouth.ry
          : e.phase === "work" || e.route === "enter" ? sites[e.site].mouth.ry + (e.route === "enter" && !e.entryTurn ? Math.PI : 0) : NaN;
        const facingTurn = Number.isFinite(roomFacing)
          ? Math.atan2(Math.sin(roomFacing - e.heading), Math.cos(roomFacing - e.heading)) : turn;
        const facing = e.heading + clamp(facingTurn, -dt * 5, dt * 5);
        // The larger chain also covers reverse strides and the recovery
        // from a hop or chest beat. Reserve it before every working step.
        e.footprintMode = e.parked ? "park" : e.mode === "working" || e.phase === "leave" || e.exitFootprint ? "pound" : "walk";
        e.compact = e.footprintMode === "park" ? e.gorilla.parkCompact
          : (e.mode === "working" || e.phase === "leave" || e.exitFootprint || e.phase === "chill" && (!e.lounge || Math.abs(e.speed) > 0.1))
            && (e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact);
        const x = p.x + sx * step, z = p.z + sz * step, y = groundAt(x, z, p.y);
        if (!Number.isFinite(y) || y > p.y + STEP || y < p.y - 0.7 || !landing(x, y, z, e.foot)
          || e.phase === "work" && caveAt(x, y, z) !== e.site
          || e.parked && caveAt(x, y, z) < 0) continue;
        if (occupied(e, x, y, z, true, facing)) continue;
        if (!staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, facing)) continue;
        // Reserve the approaching arm chain before it reaches a prop, including
        // the turn it will make along that approach. Shorten the horizon on
        // stairs; their individual risers still use the ordinary step checks.
        let ahead = Math.min(distance, 0.8 + speed * 0.7), ax = p.x + sx * ahead, az = p.z + sz * ahead;
        let ay = groundAt(ax, az, p.y);
        if (Math.abs(ay - p.y) > STEP) {
          ahead = Math.min(0.45, distance); ax = p.x + sx * ahead; az = p.z + sz * ahead; ay = groundAt(ax, az, p.y);
        }
        const aheadTurn = Math.min(Math.PI, ahead / Math.max(0.1, speed) * 5);
        const aheadFacing = e.heading + clamp(facingTurn, -aheadTurn, aheadTurn);
        const goodAhead = Number.isFinite(ay) && Math.abs(ay - p.y) <= STEP && landing(ax, ay, az, e.foot)
          && !occupied(e, ax, ay, az, true, aheadFacing) && staticClear(e, p.x, p.y, p.z, ax, ay, az, e.heading, aheadFacing);
        if (!i) directAhead = goodAhead;
        const side = Math.sign(STEERING[i] * e.turn);
        const commitment = e.steerFor > 0 && side && e.steerSide ? side === e.steerSide ? 0.45 : -1.25 : 0;
        const score = Math.cos(heading - desired) * 2 + Math.cos(heading - e.steerHeading) * 0.5
          + (goodAhead ? 3 : 0) + commitment - i * 0.008;
        if (score > best) {
          best = score; chosen = heading; chosenFacing = facing; chosenY = y;
          chosenAhead = goodAhead;
          chosenMode = e.footprintMode; chosenCompact = e.compact;
        }
        if (!i && goodAhead && (!e.steerSide || e.steerClear >= 0.25)) break;
      }
      e.footprintMode = chosenMode; e.compact = chosenCompact;
      // Under a crown, keep the knuckles down and withdraw along the current
      // body axis when there is no room for the complete turn. Commit to that
      // retreat instead of alternating small left/right corrections each frame.
      if (e.lowCover && !chosenAhead && backOut(e, dt, true)) return;
      e.steerClear = directAhead ? e.steerClear + dt : 0;
      if (e.steerClear >= 0.25) { e.steerSide = 0; e.steerFor = 0; }
      if (Number.isFinite(chosen)) {
        const side = Math.sign(Math.sin(chosen - desired));
        if (!directAhead && side && (e.steerFor <= 0 || side !== e.steerSide)) { e.steerSide = side; e.steerFor = 1.2; }
        // Ease the actual travel direction too, not just the visual body yaw.
        // Keep the tested evasive step when easing would still cross the prop.
        const delta = Math.atan2(Math.sin(chosen - e.steerHeading), Math.cos(chosen - e.steerHeading));
        const smooth = e.steerHeading + clamp(delta, -dt * 3.2, dt * 3.2);
        const sx = p.x + Math.sin(smooth) * step, sz = p.z + Math.cos(smooth) * step, sy = groundAt(sx, sz, p.y);
        if (Number.isFinite(sy) && sy <= p.y + STEP && sy >= p.y - 0.7 && landing(sx, sy, sz)
          && (e.phase !== "work" || caveAt(sx, sy, sz) === e.site) && (!e.parked || caveAt(sx, sy, sz) >= 0)
          && !occupied(e, sx, sy, sz, true, chosenFacing) && staticClear(e, p.x, p.y, p.z, sx, sy, sz, e.heading, chosenFacing)) {
          chosen = smooth; chosenY = sy;
        }
        e.steerHeading = chosen;
        const turn = Math.atan2(Math.sin(chosen - e.heading), Math.cos(chosen - e.heading));
        e.heading = chosenFacing;
        const gain = e.phase === "work" || e.route === "enter" || e.route === "exit" ? 1 : Math.max(0.18, Math.cos(turn));
        const nx = p.x + Math.sin(chosen) * step * gain, nz = p.z + Math.cos(chosen) * step * gain;
        const ny = gain < 1 ? groundAt(nx, nz, p.y) : chosenY;
        p.x = nx; p.y = ny; p.z = nz;
        e.speed = step * gain / dt * (Math.cos(chosen - e.heading) < 0 ? -1 : 1);
        e.blocked = Math.cos(chosen - desired) > 0.3 ? Math.max(0, e.blocked - dt * 2) : e.blocked + dt;
      } else {
        e.speed = damp(e.speed, 0, 16, dt); e.blocked += dt;
        if (ctx.push) ctx.push(e, Math.sin(desired), Math.cos(desired), dt);
        if (!e.parked && !doorway && e.retry <= 0 && e.blocked > 0.3) {
          e.retry = 0.6;
          if (tryJump(e, desired)) { e.heading = desired; return; }
          if (e.steerFor <= 0) { e.turn = -e.turn; e.steerSide = 0; }
        }
        if (e.blocked > 1.5) {
          e.blocked = 0;
          if (e.phase === "work") {
            if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
          } else if (e.phase === "chill") chooseChill(e);
          else { e.route = caveAt(p.x, p.y, p.z) >= 0 ? "exit" : "ring"; e.fromSite = caveAt(p.x, p.y, p.z); }
        }
      }
    };
    const support = (e, x, z, y, step, heading = e.heading) => ctx.supportAt ? ctx.supportAt(e, x, z, y, step, heading) : groundAt(x, z, y);
    const entryFor = (value) => value === undefined ? player : typeof value === "number" ? list[value]
      : value && value.gorilla ? value : byOwner.get(value);
    const resumeEntry = (e) => {
      e.drive.resume = false; e.hasSlot = false;
      e.backoutLeft = 0;
      e.drive.climbExitHeading = e.drive.climbExitLook = NaN;
      if (!alive(e.owner)) return;
      e.mode = e.owner.state;
      if (e.mode === "working") {
        const next = e.pendingSite >= 0 ? e.pendingSite : e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site;
        e.pendingSite = -1;
        if (sites[next]) beginTravel(e, next);
      } else {
        e.fromSite = caveAt(e.root.position.x, e.root.position.y, e.root.position.z);
        if (e.fromSite >= 0) { e.phase = "leave"; e.route = "exit"; }
        else { e.phase = "chill"; e.route = ""; chooseChill(e, true); }
      }
    };
    const cancelInput = () => {
      if (!player) return;
      const d = player.drive;
      if (d.charge > 0) d.motionRecover = 0.6;
      d.x = d.z = d.climbAxis = d.charge = player.motion.charge = 0; d.heading = NaN;
      d.climbExitHeading = d.climbExitLook = NaN;
      d.jumpHeld = d.jumpDown = d.jumpArmed = d.run = false; d.cancelled = true;
    };
    const release = () => {
      if (!player) return false;
      const e = player;
      e.drag.time = 0;
      if (e.drag.cave && ctx.onReleaseDrag) ctx.onReleaseDrag(e);
      cancelInput(); player = null; e.controlled = false;
      e.drive.resume = true;
      if (!e.drive.airborne && !e.fire.rolling && !e.climb.active) resumeEntry(e);
      return true;
    };
    const possess = (value) => {
      const e = entryFor(value);
      if (!e || !e.active || !e.root.visible) return false;
      if (player === e) return true;
      release(); player = e; e.controlled = true; e.drive.resume = false;
      releasePortal(e); e.hasSlot = false; e.pendingSite = -1;
      const d = e.drive, p = e.root.position;
      d.x = d.z = d.charge = 0; d.heading = e.heading; d.run = d.jumpHeld = d.jumpDown = d.jumpArmed = d.cancelled = false;
      d.vx = d.vy = d.vz = 0; d.airborne = e.jump.active;
      if (e.jump.active) {
        const j = e.jump, direction = j.reverse ? -1 : 1;
        d.vx = (j.toX - j.fromX) / j.duration * direction;
        d.vz = (j.toZ - j.fromZ) / j.duration * direction;
        d.vy = ((j.toY - j.fromY) + j.lift * 4 * (1 - j.progress * 2)) / j.duration * direction;
        e.jump.active = false;
      }
      d.grounded = !d.airborne && Math.abs(support(e, p.x, p.z, p.y, STEP) - p.y) < 0.08;
      if (!d.grounded && !e.climb.active) d.airborne = true;
      if (e.lounge) { e.lounge = ""; e.recover = 0.65; }
      e.phase = "controlled"; e.route = ""; e.exitFootprint = true;
      return true;
    };
    const control = (input) => {
      if (!player || !input) return false;
      const d = player.drive;
      d.x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
      d.z = Number.isFinite(input.z) ? clamp(input.z, -1, 1) : 0;
      d.heading = Number.isFinite(input.heading) ? input.heading : NaN;
      d.run = !!input.run; d.jumpHeld = !!input.jumpHeld;
      d.climbAxis = Number.isFinite(input.climbAxis) ? clamp(input.climbAxis, -1, 1) : 0;
      if (input.jumpPressed) { d.cancelled = false; d.jumpDown = false; }
      return true;
    };
    const fullEnvelope = (e, radius, height) => {
      const r = e.radius, h = e.height, compact = e.compact, p = e.root.position;
      e.radius = Math.max(radius, r); e.height = Math.max(height, h); e.compact = false;
      if (!occupied(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z)) return true;
      e.radius = r; e.height = h; e.compact = compact; return false;
    };
    const ignite = (value) => {
      const e = entryFor(value);
      if (!e || !e.active || !e.root.visible || e.fire.burning || e.fire.rolling || e.fire.cooldown > 0) return false;
      const f = e.fire;
      f.burning = true; f.requested = f.escaping = false; f.retry = f.escapeRetry = 0; f.age = 0; f.heat = 0.05; f.reaction = 1 + e.random() * 2;
      if (e.drive.charge > 0) e.drive.motionRecover = 0.6;
      e.drive.charge = e.motion.charge = 0; e.drive.jumpArmed = false;
      if (e.lounge) { e.lounge = ""; e.recover = 0.65; }
      return true;
    };
    const dropRoll = (value) => {
      const e = entryFor(value);
      if (!e || !e.fire.burning) return false;
      if (e.fire.rolling) return true;
      e.fire.requested = true;
      if (e.drive.airborne || e.jump.active || e.climb.active) return false;
      const radius = MOTION_RADIUS, height = MOTION_HEIGHT;
      if (!fullEnvelope(e, radius, height)) return false;
      const f = e.fire, p = e.root.position;
      f.rolling = true; f.requested = f.escaping = false; f.rollTime = 0; f.x = p.x; f.z = p.z; f.heading = e.heading;
      e.pound = e.beat = e.stand = e.recover = e.speed = 0; e.actionControlled = e.motion.smash = false; e.lounge = ""; e.parked = false;
      e.drive.vx = e.drive.vy = e.drive.vz = e.drive.charge = e.motion.charge = 0;
      e.drive.jumpArmed = false; e.drive.motionEnvelope = true; e.motion.roll = 1;
      return true;
    };
    const smash = (charge = 0) => {
      const e = player;
      if (!e || e.lowCover || e.climb.active || e.fire.rolling || e.drive.airborne || e.recover > 0 || e.parked || e.pound || e.beat) return false;
      if (ctx.canSmash ? !ctx.canSmash(e) : !expandGesture(e, 2.25)) return false;
      if (!e.gorilla.pound()) return false;
      e.poundPower = 2 + 2 * clamp(charge, 0, 1);
      e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact; e.radius = Math.max(e.radius, 2.25);
      e.pound = BL.agent.POUND_TIME; e.poundHit = false; e.actionControlled = e.motion.smash = true;
      e.speed = e.drive.vx = e.drive.vz = 0;
      return true;
    };
    const grab = () => {
      const e = player;
      return !!e && !e.climb.active && !e.fire.rolling && !e.drive.airborne && !e.pound && !e.beat && !e.drag.cave
        && !!ctx.onGrab && ctx.onGrab(e);
    };
    const chestBeat = () => {
      const e = player;
      if (!e || e.lowCover || e.climb.active || e.fire.rolling || e.drive.airborne || e.recover > 0 || e.parked || e.pound || e.beat) return false;
      if (!expandGesture(e, 1.55)) return false;
      const p = e.root.position;
      e.speed = e.drive.vx = e.drive.vz = 0;
      e.gorilla.poseManaged(0, p.x, p.y, p.z, e.heading, 0, false, false, "", e.motion);
      if (!e.gorilla.beat()) return false;
      e.beat = BL.agent.MANAGED_BEAT_TIME; e.beats++;
      return true;
    };
    const beginDrivenJump = (e, strength) => {
      const d = e.drive;
      if (e.lowCover || !d.grounded || d.airborne || e.recover > 0 || e.pound || e.beat || e.fire.burning || e.fire.rolling || e.parked
        || !fullEnvelope(e, MOTION_RADIUS, MOTION_HEIGHT)) return false;
      // Height is proportional to velocity squared: sqrt(3), not 3, reaches
      // exactly three normal Ooga jump heights with the same gravity.
      d.vy = NORMAL_JUMP * Math.sqrt(1 + 2 * clamp(strength, 0, 1));
      d.grounded = false; d.airborne = true; d.motionEnvelope = true; d.motionRecover = 0.6; e.motion.takeoff = 1; e.jumps++;
      return true;
    };
    const updateRoll = (e, dt) => {
      const f = e.fire, p = e.root.position;
      f.rollTime = Math.min(ROLL_SECONDS, f.rollTime + dt);
      const angle = Math.sin(f.rollTime * 7), offset = angle * 0.35;
      const x = f.x + Math.cos(f.heading) * offset, z = f.z - Math.sin(f.heading) * offset;
      e.compact = false; e.radius = MOTION_RADIUS; e.height = MOTION_HEIGHT;
      if (!occupied(e, x, p.y, z) && staticClear(e, p.x, p.y, p.z, x, p.y, z)) { p.x = x; p.z = z; }
      e.speed = 0; e.biped = false; e.motion.roll = 1; e.motion.rollAngle = angle * 1.25;
      if (f.rollTime >= ROLL_SECONDS) {
        f.burning = f.rolling = false; f.soot = Math.max(f.soot, f.heat); f.heat = 0;
        f.cooldown = 1.2; f.rollRecover = e.recover = 0.8; e.motion.roll = 0; e.motion.rollAngle = 0;
      }
    };
    const updateFire = (e, dt) => {
      const f = e.fire;
      f.cooldown = Math.max(0, f.cooldown - dt);
      f.rollRecover = Math.max(0, f.rollRecover - dt);
      f.retry = Math.max(0, f.retry - dt); f.escapeRetry = Math.max(0, f.escapeRetry - dt);
      if (f.burning) {
        f.age += dt; f.heat = Math.min(1, 0.05 + f.age / 4);
        if (!e.controlled && !f.rolling && f.age >= f.reaction) f.requested = true;
        if (f.requested && !f.retry && !e.drive.airborne && !e.jump.active && !dropRoll(e)) f.retry = 0.2;
      } else f.soot = Math.max(0, f.soot - dt / SOOT_SECONDS);
      if (f.rolling) updateRoll(e, dt);
      if (ctx.onFire && (f.burning || f.soot > 0 || f.rollRecover > 0)) ctx.onFire(e, dt);
    };
    const escapeForRoll = (e, dt) => {
      const f = e.fire, p = e.root.position;
      if (!f.requested || f.rolling || e.drive.airborne || e.jump.active || e.pound || e.beat || e.recover
        || e.stand || e.parked || e.gorilla.motionActive || e.gorilla.smashActive) return false;
      // A roll needs more side room than a knuckle walk. Back away from the
      // contacted prop without turning the long arms through it, then lie down.
      e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact;
      e.radius = Math.max(WALK_RADIUS, e.gorilla.bodyRadius + 0.1); e.height = Math.max(2.7, e.gorilla.bodyHeight + 0.08);
      e.biped = false;
      if (!f.escaping && !f.escapeRetry) {
        f.escapeRetry = 0.6;
        for (let n = 0; n < 24; n++) {
          const turn = n % 8, angle = e.heading + Math.PI + (turn % 2 ? 1 : -1) * Math.ceil(turn / 2) * Math.PI / 4;
          const distance = (Math.floor(n / 8) + 1) * 0.8;
          const x = p.x + Math.sin(angle) * distance, z = p.z + Math.cos(angle) * distance;
          const y = support(e, x, z, p.y, STEP);
          if (!Number.isFinite(y) || Math.abs(y - p.y) > STEP || !landing(x, y, z)
            || occupied(e, x, y, z) || !staticClear(e, p.x, p.y, p.z, x, y, z)) continue;
          let floorClear = true;
          for (let s = 1; s < 8; s++) {
            const k = s / 8, sy = support(e, p.x + (x - p.x) * k, p.z + (z - p.z) * k, p.y, STEP);
            if (!Number.isFinite(sy) || Math.abs(sy - p.y) > STEP) { floorClear = false; break; }
          }
          if (!floorClear) continue;
          const radius = e.radius, height = e.height, compact = e.compact;
          e.radius = MOTION_RADIUS; e.height = MOTION_HEIGHT; e.compact = false;
          const fits = !occupied(e, x, y, z) && staticClear(e, x, y, z);
          e.radius = radius; e.height = height; e.compact = compact;
          if (!fits) continue;
          f.escapeX = x; f.escapeY = y; f.escapeZ = z; f.escaping = true; break;
        }
      }
      if (!f.escaping) { e.speed = 0; return true; }
      const dx = f.escapeX - p.x, dz = f.escapeZ - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.06) { f.escaping = false; f.retry = 0; e.speed = 0; return true; }
      const step = Math.min(distance, 1.8 * dt), x = p.x + dx / distance * step, z = p.z + dz / distance * step;
      const y = support(e, x, z, p.y, STEP);
      if (Number.isFinite(y) && Math.abs(y - p.y) <= STEP && !occupied(e, x, y, z)
        && staticClear(e, p.x, p.y, p.z, x, y, z)) {
        p.x = x; p.y = y; p.z = z;
        e.speed = step / dt * (dx * Math.sin(e.heading) + dz * Math.cos(e.heading) < 0 ? -1 : 1);
      } else { f.escaping = false; e.speed = 0; }
      return true;
    };
    const updateDriven = (e, dt) => {
      const d = e.drive, p = e.root.position, m = e.motion;
      e.phase = "controlled"; e.route = ""; e.lounge = "";
      if (d.cancelled && !d.jumpHeld) d.cancelled = false;
      const pressed = d.jumpHeld && !d.jumpDown && !d.cancelled;
      if (pressed && e.fire.burning) { dropRoll(e); d.jumpArmed = false; d.charge = 0; }
      else if (pressed && !e.lowCover && d.grounded && !e.fire.rolling && !e.parked && !e.pound && !e.beat
        && fullEnvelope(e, MOTION_RADIUS, MOTION_HEIGHT)) { d.jumpArmed = true; d.motionEnvelope = true; d.charge = 0; }
      if (d.jumpHeld && d.jumpArmed && d.grounded) d.charge = Math.min(1, d.charge + dt / JUMP_CHARGE);
      if (!d.jumpHeld && d.jumpDown) {
        if (d.jumpArmed && !d.cancelled) { beginDrivenJump(e, d.charge); d.motionRecover = 0.6; }
        d.jumpArmed = false; d.charge = 0;
      }
      d.jumpDown = d.jumpHeld; m.charge = d.charge;
      if (e.fire.rolling) return;
      if (d.x * d.x + d.z * d.z > 0.0025) e.fire.escaping = false;
      else if (escapeForRoll(e, dt)) { d.vx = d.vz = 0; return; }
      if (e.recover > 0 && !d.airborne) {
        e.recover = Math.max(0, e.recover - dt); e.speed = 0; d.vx = d.vz = 0;
        if (!e.recover) e.actionControlled = e.motion.smash = false;
        return;
      }
      if (e.pound > 0 || e.beat > 0) {
        e.speed = 0; d.vx = d.vz = 0;
        if (e.pound > 0) {
          e.pound = Math.max(0, e.pound - dt);
          if (!e.poundHit && e.pound <= 0.22) {
            e.poundHit = true; e.pounds++;
            if (ctx.onPound) ctx.onPound(e);
            if (e.actionControlled && ctx.onSmash) ctx.onSmash(e);
          }
          if (!e.pound) e.recover = 0.35;
        }
        e.beat = Math.max(0, e.beat - dt);
        return;
      }
      if (m.poundCharge > 0) { e.speed = 0; d.vx = d.vz = 0; return; }
      if (e.parked && expandGesture(e, WALK_RADIUS)) {
        e.parked = false; e.biped = false; e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact;
        e.recover = 0.55; e.speed = 0; return;
      }
      e.biped = e.parked ? "squeeze" : false;
      const previousCompact = e.compact, previousRadius = e.radius, previousHeight = e.height;
      e.footprintMode = e.parked ? "park" : "pound";
      if (!d.airborne && !d.jumpArmed) d.motionRecover = Math.max(0, d.motionRecover - dt);
      const motion = d.airborne || d.jumpArmed || d.motionRecover > 0 || e.fire.rollRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive;
      e.compact = !motion && (e.parked ? e.gorilla.parkCompact : e.gorilla.poundCompact);
      e.radius = Math.max(motion ? MOTION_RADIUS : WALK_RADIUS, e.gorilla.bodyRadius + 0.1);
      e.height = Math.max(motion ? MOTION_HEIGHT : WALK_HEIGHT, e.gorilla.bodyHeight + 0.04);
      // The forward limb chain and the jump circle contain the same rig but
      // cover different spare space. Never adopt a chain through the next step.
      if (!previousCompact && e.compact && previousRadius >= e.gorilla.bodyRadius
        && (!staticClear(e, p.x, p.y, p.z) || occupied(e, p.x, p.y, p.z))) {
        e.compact = false; e.radius = Math.max(previousRadius, e.radius); e.height = Math.max(previousHeight, e.height);
      }
      const amount = Math.min(1, Math.hypot(d.x, d.z)), norm = amount > 0 ? Math.hypot(d.x, d.z) : 1;
      const speed = e.parked ? 0.6 : BL.pilot.WALK.speed * (d.run ? 1.5 : 1);
      const wantX = d.x / norm * speed * amount, wantZ = d.z / norm * speed * amount;
      d.vx = damp(d.vx, e.controlled ? wantX : 0, d.airborne ? 3 : 18, dt);
      d.vz = damp(d.vz, e.controlled ? wantZ : 0, d.airborne ? 3 : 18, dt);
      let wantedHeading = Number.isFinite(d.heading) ? d.heading : amount > 0.01 ? Math.atan2(d.x, d.z) : e.heading;
      if (Number.isFinite(d.climbExitHeading)) {
        // Continuing S after a descent walks away in the new four-footed
        // stance. A fresh look or movement direction resumes ordinary facing.
        if (!Number.isFinite(d.climbExitLook)) d.climbExitLook = wantedHeading;
        const lookTurn = Math.abs(Math.atan2(Math.sin(wantedHeading - d.climbExitLook), Math.cos(wantedHeading - d.climbExitLook)));
        const movingAway = amount < 0.05 || (d.x * Math.sin(d.climbExitHeading) + d.z * Math.cos(d.climbExitHeading)) / norm > 0.7;
        if (lookTurn > 0.25 || !movingAway || d.airborne || d.jumpArmed) d.climbExitHeading = d.climbExitLook = NaN;
        else wantedHeading = d.climbExitHeading;
      }
      if (e.lowCover && !motion && amount > 0.05
        && (d.x * Math.sin(e.heading) + d.z * Math.cos(e.heading)) / norm < -0.5) wantedHeading = e.heading;
      const delta = Math.atan2(Math.sin(wantedHeading - e.heading), Math.cos(wantedHeading - e.heading));
      const heading = e.heading + clamp(delta, -dt * 7, dt * 7);
      if (!e.lowCover && !d.airborne && !d.jumpArmed && amount > 0.05 && !e.climb.retry && caveAt(p.x, p.y, p.z) < 0) {
        const direction = Math.atan2(d.x, d.z);
        const drop = ctx.surfaceAt && ctx.surfaceAt(p.x + Math.sin(direction) * 3.1, p.z + Math.cos(direction) * 3.1) < p.y - 0.8;
        if (tryClimb(e, direction, !!drop)) return;
      }
      if (holdClimbSearch(e)) return;
      const count = Math.max(1, Math.ceil(Math.max(Math.hypot(d.vx, d.vz), Math.abs(d.vy)) * dt / 0.1));
      const step = dt / count, oldX = p.x, oldZ = p.z;
      for (let i = 0; i < count; i++) {
        const facing = e.heading + (heading - e.heading) / (count - i);
        let x = p.x + d.vx * step, z = p.z + d.vz * step, y = p.y, landing = false;
        let floor = support(e, x, z, p.y, d.airborne ? 0 : STEP, facing);
        if (!d.airborne) {
          if (!Number.isFinite(floor) || floor < p.y - STEP) { d.vx = d.vz = 0; break; }
          else if (floor > p.y + STEP) { x = p.x; z = p.z; floor = p.y; }
          else y = floor;
        }
        if (d.airborne) {
          y = p.y + d.vy * step - GRAVITY * step * step * 0.5;
          d.vy = Math.max(-40, d.vy - GRAVITY * step);
          floor = support(e, x, z, Math.max(p.y, y), 0, facing);
          if (d.vy <= 0 && Number.isFinite(floor) && floor <= p.y + 0.02 && y <= floor) {
            y = floor; landing = true;
          }
        }
        let valid = (!e.parked || caveAt(x, y, z) >= 0) && !occupied(e, x, y, z, true, facing)
          && staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, facing);
        if (!valid && y < p.y && (x !== p.x || z !== p.z) && (!e.parked || caveAt(x, y, z) >= 0)
          && !occupied(e, x, p.y, z, true, facing) && !occupied(e, x, y, z, true, facing)
          && staticClear(e, p.x, p.y, p.z, x, p.y, z, e.heading, facing)
          && staticClear(e, x, p.y, z, x, y, z, facing, facing)) valid = true;
        // Curved prop tops can intersect a diagonal descent even though its
        // horizontal and vertical legs are both clear. Keep both swept tests.
        if (!valid && !d.airborne && y > p.y && y - p.y <= STEP && (!e.parked || caveAt(x, y, z) >= 0)
          && !occupied(e, p.x, y, p.z) && !occupied(e, x, y, z, true, facing)
          && staticClear(e, p.x, p.y, p.z, p.x, y, p.z)
          && staticClear(e, p.x, y, p.z, x, y, z, e.heading, facing)) valid = true;
        if (valid) {
          p.x = x; p.y = y; p.z = z; e.heading = facing;
          if (landing) { d.airborne = false; d.grounded = true; d.vy = 0; d.motionRecover = 0.6; m.landing = 1; }
        }
        else {
          const horizontal = Math.hypot(d.vx, d.vz);
          if (ctx.push && horizontal > 0) ctx.push(e, d.vx / horizontal, d.vz / horizontal, step);
          // Resolve a blocked lateral move independently from gravity so walls
          // cannot suspend a jumping gorilla above the floor.
          const ownFloor = support(e, p.x, p.z, Math.max(p.y, y), 0);
          if (d.vy <= 0 && Number.isFinite(ownFloor) && ownFloor <= p.y + 0.02 && y < ownFloor) y = ownFloor;
          if (!occupied(e, p.x, y, p.z) && staticClear(e, p.x, p.y, p.z, p.x, y, p.z)) p.y = y;
          else if (d.vy > 0) d.vy = 0;
          if (Number.isFinite(ownFloor) && Math.abs(p.y - ownFloor) < 0.02 && d.vy <= 0) {
            if (d.airborne) { d.motionRecover = 0.6; m.landing = 1; }
            d.airborne = false; d.grounded = true; d.vy = 0;
          }
        }
      }
      e.speed = Math.hypot(p.x - oldX, p.z - oldZ) / dt;
      if (e.speed > 0 && (p.x - oldX) * Math.sin(e.heading) + (p.z - oldZ) * Math.cos(e.heading) < 0) e.speed = -e.speed;
      if (!d.airborne && d.resume && !e.controlled) resumeEntry(e);
    };
    const poseEntry = (e, dt, beforeX, beforeY, beforeZ) => {
      const p = e.root.position;
      if (e.lounge && Math.abs(e.speed) <= 0.1) {
        const compact = e.compact, mode = e.footprintMode;
        // The sitting body has its own measured capsules. Its rise and settling
        // fit the walking chain; reclining still reserves the wider full body.
        if (e.lounge === "sit") {
          if (!loungeSeatSpace(e, p.x, p.y, p.z, e.heading)) { leaveLounge(e); e.rest = 0; }
          if (e.gorilla.sitCompact) { e.footprintMode = "sit"; e.compact = true; }
          else { e.footprintMode = "walk"; e.compact = e.gorilla.compact; }
        } else {
          e.compact = false;
          if (occupied(e, p.x, p.y, p.z) || !staticClear(e, p.x, p.y, p.z)) {
            e.compact = compact; e.footprintMode = mode; e.lounge = ""; e.rest = 0;
          }
        }
      }
      e.gorilla.poseManaged(dt, p.x, p.y, p.z, e.heading, e.speed, e.jump.active || e.drive.airborne, e.biped, e.lounge, e.motion);
      if (e.climb.active) {
        e.radius = Math.max(CLIMB_RADIUS, e.gorilla.bodyRadius + 0.015);
        e.height = Math.max(CLIMB_HEIGHT, e.gorilla.bodyHeight + 0.015);
      }
      if (e.lounge === "sit" && e.gorilla.sitCompact) { e.footprintMode = "sit"; e.compact = true; }
      else if (e.footprintMode === "sit") { e.footprintMode = "walk"; e.compact = e.gorilla.compact; }
      if (e.actionControlled || e.motion.smash || e.gorilla.smashActive) {
        e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact;
        e.radius = Math.max(BL.agent.MANAGED_SMASH_RADIUS, e.gorilla.bodyRadius + 0.1);
        e.height = Math.max(e.height, e.gorilla.bodyHeight + 0.08);
      }
      if (e.gorilla.motionActive && !e.climb.active) {
        e.compact = false;
        e.radius = Math.max(e.radius, MOTION_RADIUS);
        e.height = Math.max(e.height, MOTION_HEIGHT);
      }
      if (e.drive.motionEnvelope && !e.gorilla.motionActive && !e.drive.airborne && !e.drive.jumpArmed
        && !e.drive.motionRecover && !e.fire.rolling && !e.fire.rollRecover) e.drive.motionEnvelope = false;
      if (ctx.fireContact && ctx.fireContact(e, beforeX, beforeY, beforeZ)) ignite(e);
      if (ctx.onMove && (beforeX !== p.x || beforeY !== p.y || beforeZ !== p.z)) ctx.onMove(e, beforeX, beforeY, beforeZ, dt);
    };
    const updateEntry = (e, dt) => {
      const p = e.root.position, beforeX = p.x, beforeY = p.y, beforeZ = p.z;
      e.motion.takeoff = Math.max(0, e.motion.takeoff - dt * 5);
      e.motion.landing = Math.max(0, e.motion.landing - dt * 5);
      e.retry = Math.max(0, e.retry - dt);
      e.climb.retry = Math.max(0, e.climb.retry - dt);
      if (e.controlled || e.mode !== "chilling" || e.fire.burning) e.motion.groom = 0;
      if (e.controlled || e.fire.burning) e.loungeDepart = false;
      e.yieldFor = Math.max(0, e.yieldFor - dt);
      e.parkFor = Math.max(0, e.parkFor - dt);
      if (!alive(e.owner) && !e.controlled && !e.drive.airborne && !e.fire.rolling && !e.climb.active) {
        if (e.active) {
          releasePortal(e);
          e.active = e.root.visible = e.hasSlot = e.jump.active = false;
          e.overflow = false;
          if (e.tracked && ctx.untrack) ctx.untrack(e);
          e.tracked = false;
        }
        return;
      }
      if (!e.active) { if (!e.retry) activate(e); return; }
      e.lowCover = !!ctx.underCanopy && ctx.underCanopy(e);
      if (e.lowCover) e.motion.poundCharge = 0;
      if (ctx.fireContact && ctx.fireContact(e, p.x, p.y, p.z)) ignite(e);
      updateFire(e, dt);
      if (e.climb.active) { updateClimb(e, dt); poseEntry(e, dt, beforeX, beforeY, beforeZ); return; }
      if (e.controlled || e.drive.airborne || e.drive.resume) {
        updateDriven(e, dt); poseEntry(e, dt, beforeX, beforeY, beforeZ); return;
      }
      if (e.fire.rolling || escapeForRoll(e, dt)) { poseEntry(e, dt, beforeX, beforeY, beforeZ); return; }
      if (e.mode !== e.owner.state) {
        releasePortal(e);
        if (e.lounge) leaveLounge(e);
        e.mode = e.owner.state; e.hasSlot = false;
        if (e.mode === "working") beginTravel(e, e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site);
        else {
          e.fromSite = caveAt(p.x, p.y, p.z);
          if (e.fromSite >= 0) { e.phase = "leave"; e.route = "exit"; }
          else { e.phase = "chill"; e.rest = 0; chooseChill(e); }
        }
      }
      if (e.phase === "work" && !e.jump.active && !e.pound && !e.beat && !e.stand && !e.recover) {
        for (let i = 0; i < list.length; i++) {
          const other = list[i];
          if (!other.active || other === e || other.phase !== "travel" && other.phase !== "leave") continue;
          const q = other.root.position;
          if ((other.fromSite === e.site || other.site === e.site) && Math.hypot(q.x - p.x, q.z - p.z) < 7) {
            e.parked = true; e.parkFor = 1.5;
            setGoal(e, p.x, p.y, p.z); e.slotX = p.x; e.slotY = p.y; e.slotZ = p.z;
            break;
          }
        }
      }
      if (e.exitFootprint) {
        // Clearing the arch does not instantly make space for the relaxed
        // lounge envelope. Keep the walking limb chain until nearby leavers
        // have separated far enough for the larger idle footprint.
        const compact = e.compact;
        e.compact = false;
        if (staticClear(e, p.x, p.y, p.z) && !occupied(e, p.x, p.y, p.z)) e.exitFootprint = false;
        else e.compact = compact;
      }
      // Outside a work room the gait always stays on all fours. Standing is
      // a brief idle action inside, never a narrow-door collision workaround.
      e.biped = e.parked ? "squeeze" : e.phase === "work" && (e.stand > 0 || e.beat > 0);
      if (e.parked && e.gorilla.parkCompact) e.footprintMode = "park";
      else if (!e.parked && e.footprintMode === "park" && e.gorilla.compact) e.footprintMode = "walk";
      e.drive.motionRecover = Math.max(0, e.drive.motionRecover - dt);
      const seated = e.lounge === "sit" && e.gorilla.sitCompact && Math.abs(e.speed) <= 0.1;
      if (seated) e.footprintMode = "sit";
      else if (e.footprintMode === "sit") e.footprintMode = "walk";
      e.compact = (seated || e.mode === "working" || e.phase === "leave" || e.parked || e.exitFootprint || e.phase === "chill" && (!e.lounge || e.lounge === "sit" || Math.abs(e.speed) > 0.1))
        && !e.jump.active && !e.gorilla.motionActive
        && !e.fire.rollRecover && !e.drive.motionRecover && !(e.drive.motionEnvelope && e.gorilla.motionActive)
        && (seated || (e.footprintMode === "park" ? e.gorilla.parkCompact : e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact));
      const gestureRadius = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_RADIUS : e.pound > 0 ? 2.25 : e.jump.active ? AIR_RADIUS : WALK_RADIUS;
      e.radius = Math.max(gestureRadius, e.gorilla.bodyRadius + 0.1);
      const gestureHeight = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_HEIGHT : e.lounge || e.recover > 0 ? 2.7
        : e.parked || e.pound > 0 || e.beat > 0 || e.stand > 0 ? 2.6 : WALK_HEIGHT;
      e.height = Math.max(gestureHeight, e.gorilla.bodyHeight + 0.04);
      e.foot = FOOT;
      if (e.jump.active) updateJump(e, dt);
      else if (e.loungeDepart) departLounge(e, dt);
      else if (e.recover > 0) {
        e.recover = Math.max(0, e.recover - dt); e.speed = 0;
        if (!e.recover) e.actionControlled = e.motion.smash = false;
      } else if (e.beat > 0 || e.stand > 0) {
        e.beat = Math.max(0, e.beat - dt); e.stand = Math.max(0, e.stand - dt); e.speed = 0;
        if (!e.beat && !e.stand) {
          e.recover = 0.45; e.rest = 0.6;
          if (e.phase === "work" && reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
        }
      } else if (e.pound > 0) {
        e.pound = Math.max(0, e.pound - dt); e.speed = 0;
        if (!e.poundHit && e.pound <= 0.22) {
          e.poundHit = true; e.pounds++;
          if (ctx.onPound) ctx.onPound(e);
          if (e.actionControlled && ctx.onSmash) ctx.onSmash(e);
        }
        if (e.pound <= 0) {
          e.recover = 0.35;
          e.rest = 0.6 + e.random() * 0.4;
          if (e.phase === "work") {
            if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
          }
        }
      } else if (e.phase === "travel" || e.phase === "leave") {
        if (e.parked) {
          e.speed = 0;
          const passage = e.fromSite < 0 || claimPortal(e, e.fromSite);
          if (passage && expandGesture(e, WALK_RADIUS)) { e.parked = false; e.recover = 0.55; }
          else if (passage && e.gorilla.parkCompact && e.fromSite >= 0) {
            // Tuck the arms and shuffle through the room's central aisle. The
            // full quadruped envelope must fit before crossing the entrance.
            sitePoint(sites[e.fromSite], 0, -0.9, POINT);
            setGoal(e, POINT.x, POINT.y, POINT.z);
            move(e, dt, 0.6);
          }
        } else if (travelGoal(e, dt)) { if (!e.jump.active) move(e, dt, SPEED); }
        else { e.speed = damp(e.speed, 0, 12, dt); }
      } else if (e.phase === "wait") {
        yieldSpace(e);
        move(e, dt, CHILL_SPEED);
        if (!e.retry) {
          e.retry = 1.5 + e.index * 0.07;
          if (Math.hypot(p.x, p.z) > ringRadius * 0.8) waitSpot(e);
          if (e.owner.work.phase !== "return" && e.owner.work.phase !== "reload" && reserve(e)) {
            e.overflow = false; e.phase = "travel"; e.route = "exit";
            e.fromSite = caveAt(p.x, p.y, p.z);
          }
        }
      } else if (e.phase === "work") {
        if (e.parked) {
          e.speed = 0; e.rest -= dt;
          if (!e.parkFor && e.rest <= 0) {
            e.rest = 0.75;
            if (expandGesture(e, WALK_RADIUS)) {
              e.parked = false; e.recover = 0.55;
              if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
            }
          }
        } else if (Math.hypot(e.goalX - p.x, e.goalZ - p.z) > 0.18) move(e, dt, SPEED * 0.85);
        else {
          e.speed = damp(e.speed, 0, 12, dt); e.rest -= dt;
          if (e.rest <= 0) {
            const cycle = e.workCycle % 6;
            if (cycle === 2 && Math.abs(e.speed) < 0.05 && expandGesture(e, 1.55) && e.gorilla.beat()) {
              e.beat = BL.agent.MANAGED_BEAT_TIME; e.beats++; e.workCycle++;
            } else if (cycle === 4 && expandGesture(e, 1.55)) {
              e.stand = 0.9; e.workCycle++;
            } else if (cycle === 5 && prepareJump(e, p.x, p.y, p.z, 0.35)) {
              e.rest = 0.5; e.workCycle++;
              if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
            } else if (expandGesture(e, 2.25) && e.gorilla.pound()) {
              e.activity = Math.max(0, e.activity - 3); e.pound = BL.agent.POUND_TIME; e.poundHit = false;
              e.workCycle++;
            } else {
              e.rest = 0.4;
              if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
            }
          }
        }
      } else {
        yieldSpace(e);
        if (Math.hypot(e.goalX - p.x, e.goalZ - p.z) > 0.18 || Math.abs(e.goalY - p.y) > 0.55) move(e, dt, CHILL_SPEED);
        else {
          e.speed = damp(e.speed, 0, 12, dt); e.rest -= dt;
          if (!e.exitFootprint && !e.lounge && Math.hypot(p.x, p.z) >= (ctx.meadowRadius || 22) * 0.82
            && grass(p.x, p.y, p.z, e.loungePartner ? 0.9 : FOOT) && alignLounge(e, dt)) {
            e.speed = 0; e.lounge = e.loungePartner ? "sit" : loungePose(e);
          }
          if (e.rest <= 0) { e.rest = 6; chooseChill(e); }
        }
        groomLounge(e, dt);
      }
      poseEntry(e, dt, beforeX, beforeY, beforeZ);
    };
    const update = (dt) => {
      if (disposed || !(dt > 0)) return;
      let remaining = Math.min(dt, 0.25);
      // Budget the rendered update, not each catch-up physics substep. Rotate
      // the deferred-search priority so a crowded cliff cannot starve the last
      // companion in the roster or rebuild many wall routes in the same frame.
      climbFrameBudget = 2; climbTurn = -1;
      for (let i = 0; i < list.length; i++) {
        list[i].climb.searchBudget = 2;
        pendingClimbSearch(list[i]);
      }
      for (let i = 0; i < list.length; i++) {
        const index = (climbNext + i) % list.length, e = list[index], c = e.climb;
        if (!e.active || c.active || !c.searchPending || c.retry > remaining || e.recover > 0 || e.jump.active || e.drive.airborne
          || e.pound || e.beat || e.parked || e.fire.rolling) continue;
        if (e.controlled ? Math.hypot(e.drive.x, e.drive.z) <= 0.05 : Math.hypot(e.goalX - e.root.position.x, e.goalZ - e.root.position.z) <= 0.18) continue;
        climbTurn = index; climbNext = (index + 1) % list.length;
        break;
      }
      while (remaining > 1e-8) {
        const step = Math.min(remaining, 1 / 30); remaining -= step; elapsed += step;
        for (let i = 0; i < list.length; i++) updateEntry(list[i], step);
      }
    };
    const target = (cave, out, sample = 0) => {
      const e = byOwner.get(cave);
      if (!e || !e.active || e.mode !== "working" || e.site !== cave.work.site
        || e.phase !== "work" && !(e.phase === "travel" && e.route === "enter")) return false;
      const p = e.root.position;
      if (caveAt(p.x, p.y, p.z) !== cave.work.site) return false;
      e.gorilla.bodyTarget(out, sample);
      return true;
    };
    const hit = (cave) => {
      const e = byOwner.get(cave);
      if (!e || !e.active) return false;
      e.activity = Math.min(9, e.activity + 1); e.hits++;
      if (e.activity >= 3) e.rest = Math.min(e.rest, 0.7);
      return true;
    };
    const stats = () => {
      let active = 0, working = 0, chilling = 0, overflow = 0, airborne = 0, hits = 0, pounds = 0, beats = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.active) { active++; if (e.mode === "working") working++; else chilling++; }
        if (e.overflow) overflow++;
        if (e.jump.active || e.drive.airborne) airborne++;
        hits += e.hits; pounds += e.pounds; beats += e.beats;
      }
      return { capacity: list.length, active, working, chilling, overflow, airborne, hits, pounds, beats, elapsed };
    };
    const liveGeometry = (set) => { for (let i = 0; i < list.length; i++) if (list[i].active) list[i].gorilla.liveGeometry(set); };
    const dispose = () => {
      disposed = true; player = null;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.tracked && ctx.untrack) ctx.untrack(e);
        e.gorilla.dispose(); e.active = e.tracked = false;
      }
      list.length = 0; byOwner.clear();
      portals.fill(null);
    };
    return { list, sync, update, target, hit, plan, stats, liveGeometry, dispose,
      possess, release, control, cancelInput, smash, grab, chestBeat, ignite, dropRoll, get player() { return player; } };
  };
  BL.clankers = { create };
})();
