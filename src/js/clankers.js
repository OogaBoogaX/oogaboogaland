// A contributor's clanker keeps its own place in the work cave and travels while
// its Ooga reloads. Routes, leaps and reservations are bounded by the roster.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, damp, mulberry32, fnv1a } = BL.math;
  const { addChild } = BL.scene;
  const SCALE = 1, SPEED = 2.7, CHILL_SPEED = 0.9, STEP = 0.52, PROP_STEP = 1.02;
  // Measured full-size gallop envelope. Airborne and floor-pound poses reserve
  // their larger envelopes before beginning the animation.
  const WALK_RADIUS = 1.9, AIR_RADIUS = 2.05, FOOT = 1.4, SPACE = 0.07, TAU = Math.PI * 2;
  // The mirror sits at local z .5. Keeping a working root at or behind this
  // line leaves room for the largest 2.25-unit pound pose without recrossing it.
  const MIRROR_WORK_LIMIT = -1.85;
  const WALK_HEIGHT = 2.2;
  const JUMP_SAMPLES = 20, MAX_JUMP = 8.5;
  const CLIMB_POINTS = 128, CLIMB_RADIUS = 1.05, CLIMB_HEIGHT = 3.1, CLIMB_STANDOFF = 0.87;
  const CLIMB_SPEED = 2.1, CLIMB_APPROACH_SPEED = 3.15, CLIMB_CREST_SPEED = 2.75, CLIMB_TURN_TIME = 0.42, CLIMB_MOUNT_DISTANCE = 0.75;
  const JUMP_CHARGE = 0.65, ROLL_SECONDS = 3, SOOT_SECONDS = 10, MOTION_RADIUS = BL.agent.MANAGED_MOTION_RADIUS, MOTION_HEIGHT = BL.agent.MANAGED_MOTION_HEIGHT;
  const GRAVITY = BL.pilot.WALK.gravity, NORMAL_JUMP = BL.crew.JUMP_SPEED;
  const STEERING = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 1.95, -1.95, 2.5, -2.5, Math.PI];
  const REST_TRANSITION_TIMES = [1 / 120, 1 / 60, 1 / 30, 0.06, 0.15, 0.3, 0.6, 1.2];
  const ROOM_CELLS = [[-1.7, -4.92], [1.7, -4.92], [-1.7, -3.38], [1.7, -3.38],
    [-1.7, -1.84], [1.7, -1.84], [-1.7, -0.3], [1.7, -0.3],
    [0, -4.92], [0, -3.38], [0, -1.84], [0, -0.3]];
  // Aisle lanes admit the complete walking rig and its turn, unlike points
  // beside the bench faces that fit only a stationary sideways work pose.
  const LAB_ROUTE_X = [-1.14, 0, 1.14], LAB_ROUTE_Z = [-0.15, -1.8, -3.2, -4.05];
  const create = (ctx) => {
    const { crew, sites, groundAt, clear } = ctx;
    const footprint = BL.agent.footprint, torso = BL.agent.torso;
    const climbSolidAt = ctx.climbSolidAt || ctx.solidAt, climbSurfaceAt = ctx.climbSurfaceAt || ctx.surfaceAt;
    const list = [], byOwner = new Map(), portals = new Array(sites.length).fill(null);
    // Stations are authored once in world space: { x, y, z, heading, kind,
    // side, enabled? }. labInside owns the entrance plane, independently of assignment.
    const labSite = Number.isInteger(ctx.labSite) ? ctx.labSite : -1, labStations = ctx.labStations || [], labEquipment = ctx.labEquipment || [];
    const labNodes = new Float64Array(16 * 3), labHeadings = new Float64Array(16), labCosts = new Float64Array(16), labTimes = new Float64Array(16), labWaits = new Float64Array(16), labFixed = new Uint8Array(16), labPrevious = new Int8Array(16), labQueue = new Uint8Array(16);
    const labEdges = new Uint8Array(16 * 16 * 2), labEdgeWaits = new Float64Array(16 * 16 * 2), labEdgeTimes = new Float64Array(16 * 16 * 2);
    const labGeometry = new Uint8Array(128);
    const labFuturePoint = { x: 0, y: 0, z: 0, heading: 0 };
    let labPassAt = 0, labRouteBudget = 1, labRouteTurn = -1, labRouteNext = 0, labWaitSerial = 0;
    let labEscape = null;
    const roamRadius = ctx.roamRadius || 28, ringRadius = Math.min(roamRadius - 6, (ctx.meadowRadius || 22) - 6);
    const POINT = { x: 0, y: 0, z: 0 };
    const loungeSpots = new Float64Array(320 * 3);
    let loungeCount = 0, roofCount = 0, loungeReady = false;
    const roamPath = new Float64Array(12), roamPoint = { x: 0, y: 0, z: 0, heading: 0 };
    let roamBudget = 1, roamNext = 0, roamTurn = -1, roamSerial = 0;
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
      // Changed-cave departures get the opening first, keeping opposing
      // traffic from continually contesting the same narrow arch.
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
    const contactAt = (x, y, z) => {
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i], m = site.mouth, dx = x - m.x, dz = z - m.z;
        const across = dx * site.cr - dz * site.sr, along = dx * site.sr + dz * site.cr;
        const room = site.room || m.room, from = room ? room.from : 2.5, to = room ? room.to : 6.5;
        const half = along < -from ? (room ? room.w / 2 : 3) : 2.5;
        if (y >= m.floorY - 0.15 && y <= m.floorY + (room ? room.h : 4)
          && along <= 2.5 && along >= -to && Math.abs(across) < half) return i;
      }
      return -1;
    };
    const peerShape = (x, y, z, bx, by, bz) => {
      return torso || footprint;
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
    const canopyBackoutClear = (e, x, y, z, nx, ny, nz, heading) => {
      const dx = nx - x, dz = nz - z, distance = Math.hypot(dx, dz);
      if (!e.lowCover || distance < 1e-6 || dx * Math.sin(heading) + dz * Math.cos(heading) > -distance * 0.5) return false;
      const sx = dx / distance, sz = dz / distance;
      // An arm chain may already overlap the crown or trunk when low-cover
      // mode begins. Prove a clear point directly behind the planted body,
      // then permit only the small backward steps that escape that overlap.
      for (let retreat = 0.4; retreat <= 2.0001; retreat += 0.4) {
        const ex = x + sx * retreat, ez = z + sz * retreat, ey = groundAt(ex, ez, y);
        if (Number.isFinite(ey) && Math.abs(ey - y) <= STEP && landing(ex, ey, ez)
          && clear(ex, ey, ez, ex, ey, ez, e.radius, e.height, e, null, heading, heading)) return true;
      }
      return false;
    };
    const staticClear = (e, x, y, z, nx = x, ny = y, nz = z, fromHeading = e.heading, toHeading = fromHeading) =>
      clear(x, y, z, nx, ny, nz, e.radius, e.height, e, null, fromHeading, toHeading)
      || canopyBackoutClear(e, x, y, z, nx, ny, nz, fromHeading);
    // Retained routes double as short-lived space/time reservations. Predict
    // from the actual position, so a late worker never leaves a phantom path
    // behind it. Unplanned, controlled and working actors keep their real spot.
    const labFuture = (e, seconds, out) => {
      const p = e.root.position, job = e.lab;
      out.x = p.x; out.y = p.y; out.z = p.z; out.heading = e.heading;
      if (!e.motion.lab || e.controlled || e.fire.burning || e === labEscape
        || !job.pathCount || job.arrived && !job.yielding) return out;
      const settling = e.gorilla.labItem ? !e.gorilla.labCompact : !e.gorilla.labWalkCompact;
      seconds -= Math.max(settling ? 0.15 : 0, job.readyAt - elapsed);
      const speed = job.yielding ? 0.65 : 1.1;
      for (let i = job.pathIndex; seconds > 0 && i < job.pathCount; i++) {
        if (i > job.pathIndex) seconds -= job.pathWaits[i];
        if (seconds <= 0) break;
        const at = i * 3, dx = job.path[at] - out.x, dz = job.path[at + 2] - out.z, distance = Math.hypot(dx, dz);
        const fixed = Number.isFinite(job.pathFacings[i]);
        const final = !fixed && i + 1 === job.pathCount && !job.pathPartial && !job.yielding && e.route !== "exit";
        const facing = fixed ? job.pathFacings[i] : final && distance <= 0.8 ? job.targetHeading : Math.atan2(dx, dz);
        const turn = Math.atan2(Math.sin(facing - out.heading), Math.cos(facing - out.heading)), duration = Math.abs(turn) / 3;
        if (seconds < duration) { out.heading += Math.sign(turn) * seconds * 3; break; }
        seconds -= duration; out.heading = facing;
        const approach = final ? Math.min(distance, 0.8) : 0, travel = distance - approach;
        let step = Math.min(travel, seconds * speed);
        if (distance > 0) { out.x += dx / distance * step; out.z += dz / distance * step; }
        seconds -= step / speed;
        if (step < travel || seconds <= 0) break;
        if (final) {
          const turn = Math.atan2(Math.sin(job.targetHeading - facing), Math.cos(job.targetHeading - facing));
          const duration = Math.abs(turn) / 3;
          if (seconds < duration) { out.heading += Math.sign(turn) * seconds * 3; break; }
          seconds -= duration; out.heading = job.targetHeading;
          step = Math.min(approach, seconds * speed);
          if (distance > 0) { out.x += dx / distance * step; out.z += dz / distance * step; }
          seconds -= step / speed;
          if (step < approach) break;
        }
        out.x = job.path[at]; out.y = job.path[at + 1]; out.z = job.path[at + 2];
        if (fixed && i + 1 === job.pathCount && !job.pathPartial && !job.yielding && e.route !== "exit") {
          const turn = Math.atan2(Math.sin(job.targetHeading - out.heading), Math.cos(job.targetHeading - out.heading));
          const duration = Math.abs(turn) / 3;
          if (seconds < duration) { out.heading += Math.sign(turn) * seconds * 3; break; }
          seconds -= duration; out.heading = job.targetHeading;
        }
      }
      return out;
    };
    // Gorillas reserve their torsos against one another. World solids and
    // humans still receive the complete animated arm and shoulder envelope.
    const occupied = (e, x, y, z, destinations = true, heading = e.heading) => {
      const start = e.root.position;
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active) continue;
        const p = e.planningLabTraffic ? labFuture(other, e.labPlanTime, labFuturePoint) : other.root.position;
        const otherHeading = e.planningLabTraffic ? p.heading : other.heading;
        const margin = e.motion.lab || other.motion.lab ? 0.03 : SPACE, radius = e.radius + other.radius + margin;
        const shape = peerShape(x, y, z, p.x, p.y, p.z);
        if (shape.overlaps(e, x, y, z, heading, other, p.x, p.y, p.z, otherHeading, margin)
          && (e.planningLabTraffic || !shape.separates(e, start.x, start.y, start.z, e.heading, x, y, z, heading,
            other, p.x, p.y, p.z, otherHeading, margin))) {
          if (e.planningLabTraffic) {
            const departing = other.motion.lab && !other.controlled && !other.fire.burning && other !== labEscape && !other.lab.arrived;
            e.labTrafficBlocked = other.motion.lab && !other.controlled && !other.fire.burning && other !== labEscape
              && other.lab.pathCount > 0 && (!other.lab.arrived || other.lab.yielding);
            // Fair planner admission takes more than one frame. A coworker
            // already assigned to leave is pending traffic even before its
            // retained route exists; don't mistake that brief queue for a jam.
            if (departing && Math.hypot(other.slotX - other.root.position.x, other.slotZ - other.root.position.z) > 0.1) e.labPendingTraffic = true;
          }
          return true;
        }
        if (destinations && other.climb.active && climbClaimOccupied(e, x, y, z, heading, other)) return true;
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
    const reserved = (e, x, z, heading = sites[e.site].mouth.ry) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || !other.hasSlot || other.site !== e.site) continue;
        const station = other.site === labSite && labStations[other.lab.station];
        const compact = other.compact, mode = other.footprintMode, work = other.planningLabWork;
        if (station) { other.compact = other.planningLab = true; other.footprintMode = "lab"; other.planningLabWork = station.kind; }
        const shape = peerShape(x, sites[e.site].mouth.floorY, z, other.slotX, other.slotY, other.slotZ);
        const overlaps = shape.overlaps(e, x, sites[e.site].mouth.floorY, z, heading,
          other, other.slotX, other.slotY, other.slotZ, station ? station.heading : sites[e.site].mouth.ry, SPACE);
        other.compact = compact; other.footprintMode = mode; other.planningLab = false; other.planningLabWork = work;
        if (overlaps) return true;
      }
      return false;
    };
    const sitePoint = (site, x, z, out) => {
      out.x = site.mouth.x + site.cr * x + site.sr * z;
      out.y = site.mouth.floorY;
      out.z = site.mouth.z - site.sr * x + site.cr * z;
      return out;
    };
    const mirrorWorkClear = (e, x, z, nx, nz) => {
      const site = e.site >= 0 ? sites[e.site] : null;
      if (!site?.mirrorRoom || e.route === "exit") return true;
      const m = site.mouth;
      const along = (x - m.x) * site.sr + (z - m.z) * site.cr;
      return along > MIRROR_WORK_LIMIT
        || (nx - m.x) * site.sr + (nz - m.z) * site.cr <= MIRROR_WORK_LIMIT;
    };
    const insideLab = (x, y, z) => labSite >= 0 && (ctx.labInside ? ctx.labInside(x, y, z) : caveAt(x, y, z) === labSite);
    const releaseLab = (e) => {
      if (e.lab.item >= 0 && ctx.labReturn) ctx.labReturn(e);
      e.lab.item = e.lab.pickup = -1; e.lab.stage = ""; e.lab.station = -1; e.lab.time = e.lab.reach = 0; e.lab.arrived = false;
      e.lab.yielding = 0; e.lab.yieldFor = null; e.lab.yieldReady = false; e.lab.pathPending = e.lab.pathPartial = false; e.lab.squeezeUntil = 0;
      e.lab.waitOrder = e.lab.coordinationUntil = e.lab.trafficWait = 0;
      e.lab.pathCount = e.lab.pathIndex = 0; e.motion.labWork = ""; e.motion.labReach = 0; e.motion.labSqueeze = false;
      e.motion.labDie = false; e.motion.labRoll = 0;
      e.motion.labBench = null;
    };
    const syncLab = (e) => {
      const p = e.root.position, inside = insideLab(p.x, p.y, p.z), wasInside = e.motion.lab;
      e.motion.lab = inside;
      e.motion.labSqueeze = false;
      if (inside) {
        e.parked = false; e.biped = true; e.lounge = "";
        if (!wasInside && !e.controlled && !e.actionControlled) e.pound = e.beat = e.stand = e.recover = 0;
      } else if (wasInside) {
        e.biped = false;
        e.motion.labWork = "";
        if (!e.lab.yielding && (e.phase !== "travel" || e.site !== labSite)) releaseLab(e);
      }
      if (e.controlled || e.fire.rolling || e.climb.active || e.jump.active || e.drive.airborne || e.pound || e.beat || e.recover) e.motion.labWork = "";
    };
    const labEnvelope = (e) => {
      if (!e.motion.lab || e.climb.active || e.jump.active || e.drive.airborne || e.fire.rolling || e.fire.rollRecover
        || e.drive.jumpArmed || e.drive.motionRecover || e.pound || e.beat || e.recover || e.motion.smash || e.gorilla.smashActive) return false;
      e.biped = true; e.footprintMode = "lab"; e.compact = !!(e.gorilla.labIdleCompact || e.gorilla.labWalkCompact || e.gorilla.labCompact);
      e.radius = Math.max(BL.agent.LAB_RADIUS || 1.1, e.gorilla.bodyRadius + 0.04);
      e.height = Math.max(BL.agent.LAB_HEIGHT || 2.8, e.gorilla.bodyHeight + 0.04);
      return true;
    };
    const labProof = (index, e, x, y, z, nx, ny, nz, fromHeading, toHeading) => {
      const cached = labGeometry[index];
      if (cached) return cached === 1;
      const fits = staticClear(e, x, y, z, nx, ny, nz, fromHeading, toHeading);
      if (index < labGeometry.length) labGeometry[index] = fits ? 1 : 2;
      return fits;
    };
    const labSegment = (e, ax, ay, az, bx, by, bz, heading, fromHeading = heading, final = false, fixed = false, startAt = 0, wait = 0, reuse = false) => {
      const distance = Math.hypot(bx - ax, bz - az);
      const travelHeading = Math.atan2(bx - ax, bz - az);
      let px = ax, py = ay, pz = az, facing = fromHeading, time = startAt, proof = 0;
      // A time shift changes peers, never this edge's scenery or turn poses.
      // Reuse successful static samples across its bounded wait alternatives.
      if (!reuse) labGeometry.fill(0);
      e.labTrafficBlocked = false;
      // Waiting is a reservation too: never wait in another worker's path.
      for (let t = 0; t < wait; t += 0.2) {
        e.labPlanTime = startAt + t;
        if (occupied(e, ax, ay, az, true, facing)) return false;
      }
      time += wait;
      let travelled = 0;
      do {
        // Match moveLab: face the route while travelling, then face the bench
        // only on its final approach. A sideways endpoint pose cannot prove a
        // long forward walk beside a cabinet, nor an obstructed starting turn.
        const remaining = distance - travelled;
        const desired = fixed ? fromHeading : final && remaining <= 0.800001 ? heading : travelHeading;
        const turn = Math.atan2(Math.sin(desired - facing), Math.cos(desired - facing));
        const turns = Math.ceil(Math.abs(turn) / 0.2);
        for (let n = 1; n <= turns; n++) {
          const angle = facing + turn * n / turns;
          e.labPlanTime = time + Math.abs(turn) * n / turns / 3;
          if (occupied(e, px, py, pz, true, angle)
            || !labProof(proof, e, px, py, pz, px, py, pz, angle, angle)) return false;
          proof++;
        }
        time += Math.abs(turn) / 3;
        facing = desired;
        const step = Math.min(0.3, remaining, final && !fixed && remaining > 0.800001 ? remaining - 0.8 : remaining);
        travelled += step;
        const k = distance ? travelled / distance : 1, x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k;
        time += step / (e.lab.yielding ? 0.65 : 1.1); e.labPlanTime = time;
        if (occupied(e, x, y, z, true, facing)
          || !labProof(proof, e, fixed ? px : x, fixed ? py : y, fixed ? pz : z, x, y, z, facing, facing)) return false;
        proof++;
        px = x; py = y; pz = z;
      } while (travelled < distance - 1e-8);
      // A backward or sideways aisle leg keeps its original facing. Prove the
      // final workstation turn here, after the body has cleared the aisle.
      if (fixed && final) {
        const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
        const turns = Math.ceil(Math.abs(turn) / 0.2);
        for (let i = 1; i <= turns; i++) {
          const angle = facing + turn * i / turns;
          e.labPlanTime = time + Math.abs(turn) * i / turns / 3;
          if (occupied(e, bx, by, bz, true, angle)
            || !labProof(proof, e, bx, by, bz, bx, by, bz, facing + turn * (i - 1) / turns, angle)) return false;
          proof++;
        }
        time += Math.abs(turn) / 3;
      }
      e.labPlanTime = time;
      return true;
    };
    const labStageClear = (e, index, tx, tz) => {
      const at = index * 3, x = labNodes[at], y = labNodes[at + 1], z = labNodes[at + 2], heading = labHeadings[index];
      const site = sites[labSite], p = e.root.position;
      const along = (tx - p.x) * site.sr + (tz - p.z) * site.cr;
      const across = (x - site.mouth.x) * site.cr - (z - site.mouth.z) * site.sr;
      // A stopped torso in the centre blocks BOTH passing lanes. Opposing
      // trips stage on opposite sides, leaving their coworker's lane open.
      if (Math.abs(along) > 0.4 && across * Math.sign(along) < 0.35) return false;
      // Vacating a desk by less than a torso width does not actually release
      // it. Keep staging pockets clear of every coworker's claimed job too.
      for (const other of list) {
        const station = labStations[other.lab.station];
        if (other === e || !other.active || other.site !== labSite || !station) continue;
        if (torso.overlaps(e, x, y, z, heading, other, other.slotX, other.slotY, other.slotZ, station.heading, 0.08)) return false;
      }
      for (let t = 0; t <= 2; t += 0.2) {
        e.labPlanTime = labTimes[index] + t;
        if (occupied(e, x, y, z, true, heading)) return false;
      }
      return true;
    };
    // A small shared roadmap covers the gaps between the three workstation
    // rows. Each route owns only its retained points; searching never allocates.
    const planLabPath = (e, tx, ty, tz, heading, partial = false) => {
      e.lab.pathPending = true;
      if (!labRouteBudget || labRouteTurn >= 0 && labRouteTurn !== e.index) return false;
      labRouteBudget--; e.lab.pathPending = false; e.lab.plans++; labRouteNext = (e.index + 1) % list.length;
      const p = e.root.position, job = e.lab, site = sites[labSite];
      const staged = job.pathPartial && job.targetX === tx && job.targetZ === tz;
      const radius = e.radius, height = e.height, compact = e.compact, mode = e.footprintMode;
      const planning = e.planningLab, work = e.planningLabWork, squeeze = e.motion.labSqueeze, speed = e.speed;
      const carrying = !!e.gorilla.labItem;
      const departure = (carrying ? e.gorilla.labCompact : e.gorilla.labWalkCompact) ? 0 : 0.4;
      e.radius = carrying ? BL.agent.LAB_RADIUS : BL.agent.LAB_WALK_RADIUS; e.height = BL.agent.LAB_HEIGHT; e.speed = 1.1;
      e.compact = e.planningLab = e.planningLabTraffic = true; e.footprintMode = "lab"; e.planningLabWork = carrying ? "carry" : "";
      e.labPendingTraffic = false;
      e.motion.labSqueeze = false;
      labNodes[0] = p.x; labNodes[1] = p.y; labNodes[2] = p.z;
      labHeadings[0] = e.heading;
      labNodes[3] = tx; labNodes[4] = ty; labNodes[5] = tz;
      let count = 2;
      // A bench can prevent the first turn without blocking a small step back.
      // Include that local clearance before the shared aisle points so a long
      // trip can turn promptly rather than reverse to the far workstation.
      for (let i = 0; i < 2; i++) {
        const at = count++ * 3, back = 0.65 + i * 0.4;
        labNodes[at] = p.x - Math.sin(e.heading) * back; labNodes[at + 1] = p.y;
        labNodes[at + 2] = p.z - Math.cos(e.heading) * back;
      }
      for (const z of LAB_ROUTE_Z) for (const x of LAB_ROUTE_X) {
        const at = count++ * 3;
        sitePoint(site, x, z, POINT); labNodes[at] = POINT.x; labNodes[at + 1] = POINT.y; labNodes[at + 2] = POINT.z;
      }
      // Peer arms may pass, but every route still fits the natural gait against
      // cabinets, benches and stone. There is no smaller passing animation.
      job.pathFixed = false; job.pathHeading = e.heading;
      const dx = tx - p.x, dz = tz - p.z, distance = Math.hypot(dx, dz);
      const sameFacing = Math.abs(Math.atan2(Math.sin(heading - e.heading), Math.cos(heading - e.heading))) < 0.35;
      const sideways = sameFacing && distance < 2.6 && Math.abs(dx * Math.sin(e.heading) + dz * Math.cos(e.heading)) < distance * 0.45;
      // Neighbouring jobs on one bench need a shuffle along it, not a detour
      // into the aisle just to face the direction of a short sideways step.
      let directSide = false, sideWait = 0, traffic = false;
      e.speed = sideways && dx * Math.sin(e.heading) + dz * Math.cos(e.heading) < 0 ? -1.1 : 1.1;
      if (sideways) for (; sideWait <= 2; sideWait += 0.5) {
        if (labSegment(e, p.x, p.y, p.z, tx, ty, tz, heading, e.heading, true, true, 0, sideWait + departure, sideWait > 0)) { directSide = true; break; }
        if (!e.labTrafficBlocked) break;
        traffic = true;
      }
      labPrevious.fill(-1); labPrevious[0] = 0; labCosts.fill(Infinity); labCosts[0] = 0;
      labQueue.fill(0); labQueue[0] = 1; labTimes[0] = 0; labEdges.fill(0);
      if (directSide) { labPrevious[1] = 0; labHeadings[1] = e.heading; labFixed[1] = 1; labWaits[1] = sideWait; }
      // Validate promising edges lazily. The Euclidean lower bound orders the
      // frontier; a costly full-rig proof runs only when that edge could improve
      // the best route, rather than for every neighbour of every visited node.
      e.labPlanTime = 8;
      const blockedEnd = partial && !staged && occupied(e, tx, ty, tz, true, heading) && !e.labTrafficBlocked;
      let stagedAt = -1;
      for (let visit = 0; !directSide && visit < count * count * 4; visit++) {
        let from = -1, next = -1, fixed = false, edge = -1, cost = Infinity, estimate = Infinity;
        for (let i = 0; i < count; i++) if (labQueue[i]) {
          const a = i * 3;
          for (let j = 1; j < count; j++) {
            if (labQueue[j] || blockedEnd && j === 1) continue;
            const b = j * 3, dx = labNodes[b] - labNodes[a], dz = labNodes[b + 2] - labNodes[a + 2];
            const length = Math.hypot(dx, dz), remaining = Math.hypot(tx - labNodes[b], tz - labNodes[b + 2]);
            if (length < 0.01) continue;
            for (let mode = 0; mode < 2; mode++) {
              if (mode && (length > 1.1 || i && labFixed[i])) continue;
              const id = (i * 16 + j) * 2 + mode, state = labEdges[id];
              if (state === 1) continue;
              const turn = mode ? 0 : Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - labHeadings[i]), Math.cos(Math.atan2(dx, dz) - labHeadings[i])));
              const candidate = labCosts[i] + length * (mode ? 2 : 1) + turn * 0.18 + (state === 2 ? labEdgeWaits[id] * 1.1 : 0);
              if (candidate + remaining < estimate) { from = i; next = j; fixed = !!mode; edge = id; cost = candidate; estimate = candidate + remaining; }
            }
          }
        }
        if (from < 0) break;
        const a = from * 3, b = next * 3, dx = labNodes[b] - labNodes[a], dz = labNodes[b + 2] - labNodes[a + 2];
        const facing = next === 1 ? heading : Math.atan2(dx, dz);
        if (labEdges[edge] === 0) {
          labEdges[edge] = 1;
          e.speed = fixed && dx * Math.sin(labHeadings[from]) + dz * Math.cos(labHeadings[from]) < 0 ? -1.1 : 1.1;
          for (let delay = 0; delay <= 2; delay += 0.5) {
            if (labSegment(e, labNodes[a], labNodes[a + 1], labNodes[a + 2], labNodes[b], labNodes[b + 1], labNodes[b + 2], facing,
              labHeadings[from], next === 1 && !job.yielding && e.route !== "exit", fixed, labTimes[from], delay + (from === 0 ? departure : 0), delay > 0)) {
              labEdges[edge] = 2; labEdgeTimes[edge] = e.labPlanTime; labEdgeWaits[edge] = delay; break;
            }
            if (!e.labTrafficBlocked) break;
            traffic = true;
          }
          continue;
        }
        labCosts[next] = cost; labTimes[next] = labEdgeTimes[edge]; labWaits[next] = labEdgeWaits[edge];
        labHeadings[next] = fixed ? labHeadings[from] : facing; labFixed[next] = +fixed;
        labPrevious[next] = from; labQueue[next] = 1;
        if (next === 1) break;
        if (blockedEnd && Math.hypot(labNodes[b] - p.x, labNodes[b + 2] - p.z) >= 0.35) {
          if (labStageClear(e, next, tx, tz)) { stagedAt = next; break; }
        }
      }
      let at = labPrevious[1] >= 0 ? 1 : stagedAt;
      if (at < 0 && partial && !staged) {
        let nearest = Infinity;
        for (let i = 2; i < count; i++) {
          if (labPrevious[i] < 0) continue;
          const j = i * 3, distance = labCosts[i] + Math.hypot(tx - labNodes[j], tz - labNodes[j + 2]);
          if (Math.hypot(labNodes[j] - p.x, labNodes[j + 2] - p.z) < 0.35 || distance >= nearest) continue;
          if (labStageClear(e, i, tx, tz)) { nearest = distance; at = i; }
        }
      }
      e.radius = radius; e.height = height; e.compact = compact; e.footprintMode = mode;
      e.planningLab = planning; e.planningLabTraffic = false; e.planningLabWork = work; e.motion.labSqueeze = squeeze; e.speed = speed;
      job.pathCount = job.pathIndex = 0; job.pathAt = elapsed + 0.65;
      job.targetX = tx; job.targetY = ty; job.targetZ = tz; job.targetHeading = heading;
      if (at < 0) {
        // Let a known reservation advance before treating admission delay as
        // a stall. This deadline is set once, never renewed by failed retries.
        if ((traffic || e.labPendingTraffic) && !job.trafficWait) job.trafficWait = elapsed + 1.2;
        return false;
      }
      job.pathPartial = at !== 1;
      while (at) { labQueue[job.pathCount++] = at; at = labPrevious[at]; }
      for (let i = 0; i < job.pathCount; i++) {
        const index = labQueue[job.pathCount - 1 - i], from = index * 3, to = i * 3;
        job.path[to] = labNodes[from]; job.path[to + 1] = labNodes[from + 1]; job.path[to + 2] = labNodes[from + 2];
        job.pathFacings[i] = labFixed[index] ? labHeadings[index] : NaN; job.pathWaits[i] = labWaits[index];
      }
      job.readyAt = elapsed + departure + job.pathWaits[0];
      job.pathFixed = Number.isFinite(job.pathFacings[0]);
      job.pathHeading = job.pathFixed ? job.pathFacings[0] : e.heading;
      return true;
    };
    const labGoal = (e, x, y, z, heading, partial = false) => {
      const job = e.lab, p = e.root.position;
      if (job.targetX !== x || job.targetY !== y || job.targetZ !== z) {
        job.pathCount = job.pathIndex = 0; job.pathAt = job.coordinationUntil = job.trafficWait = 0; job.pathPartial = false;
      }
      if (job.pathPartial && job.pathCount && job.pathIndex + 1 === job.pathCount) {
        const end = job.pathIndex * 3;
        if (Math.hypot(job.path[end] - p.x, job.path[end + 2] - p.z) < 0.003) {
          job.pathCount = job.pathIndex = 0; job.pathAt = 0; job.coordinationUntil = elapsed + 2;
        }
      }
      if (job.pathIndex >= job.pathCount) {
        if (elapsed < job.pathAt || !planLabPath(e, x, y, z, heading, partial)) return false;
      }
      let at = job.pathIndex * 3;
      // Turns are checked at the waypoint itself. Cutting a corner early can
      // shift the next leg into a desk even though the planned route is clear.
      if (Math.hypot(job.path[at] - p.x, job.path[at + 2] - p.z) < 0.003 && job.pathIndex + 1 < job.pathCount) {
        at = ++job.pathIndex * 3; job.readyAt = elapsed + job.pathWaits[job.pathIndex];
      }
      job.pathFixed = Number.isFinite(job.pathFacings[job.pathIndex]);
      if (job.pathFixed) job.pathHeading = job.pathFacings[job.pathIndex];
      setGoal(e, job.path[at], job.path[at + 1], job.path[at + 2]);
      if (e.blocked > 0.4) { job.pathCount = job.pathIndex = 0; job.pathAt = elapsed + 0.2; }
      return true;
    };
    const ordinaryLabStep = (e, x, y, z, heading, speed, separating = false) => {
      const p = e.root.position, radius = e.radius, height = e.height, compact = e.compact, mode = e.footprintMode;
      const planning = e.planningLab, work = e.planningLabWork, squeeze = e.motion.labSqueeze, previousSpeed = e.speed;
      e.radius = BL.agent.LAB_WALK_RADIUS; e.height = BL.agent.LAB_HEIGHT;
      e.compact = e.planningLab = true; e.footprintMode = "lab"; e.planningLabWork = "";
      e.motion.labSqueeze = false; e.speed = speed;
      // Check the natural walking pose against scenery at both ends before
      // opening the shoulders from a stationary workstation pose.
      const fits = (separating || !occupied(e, p.x, p.y, p.z)) && !occupied(e, x, y, z, true, heading)
        && staticClear(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, heading);
      e.radius = radius; e.height = height; e.compact = compact; e.footprintMode = mode;
      e.planningLab = planning; e.planningLabWork = work; e.motion.labSqueeze = squeeze; e.speed = previousSpeed;
      return fits;
    };
    const beginLabEscape = (e) => {
      if (labEscape || !e.motion.lab || e.lab.item >= 0) return false;
      const p = e.root.position, s = e.stuck;
      const station = labStations[e.lab.station];
      const targetX = station ? station.x : e.goalX, targetZ = station ? station.z : e.goalZ;
      const startDistance = Math.hypot(targetX - p.x, targetZ - p.z);
      let awayX = 0, awayZ = 0;
      for (const other of list) {
        if (other === e || !other.active || !other.motion.lab) continue;
        const q = other.root.position, dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz;
        if (d2 < 9) { awayX += dx / Math.max(0.1, d2); awayZ += dz / Math.max(0.1, d2); }
      }
      const away = Math.hypot(awayX, awayZ) > 0.01 ? Math.atan2(awayX, awayZ) : e.heading + Math.PI;
      let best = -Infinity;
      // A short translation with the current facing fits beside a desk even
      // when turning toward a distant roadmap point would swing into it.
      // Only one stalled worker retreats at a time; the others keep its space.
      for (let ring = 0; ring < 3; ring++) for (let side = 0; side < 8; side++) {
        const angle = away + (side % 2 ? 1 : -1) * Math.ceil(side / 2) * Math.PI / 4, distance = 0.45 + ring * 0.35;
        const x = p.x + Math.sin(angle) * distance, z = p.z + Math.cos(angle) * distance;
        const speed = Math.cos(angle - e.heading) < 0 ? -0.9 : 0.9;
        if (!insideLab(x, p.y, z) || !ordinaryLabStep(e, x, p.y, z, e.heading, speed, true)) continue;
        let gap = 3;
        for (const other of list) {
          if (other === e || !other.active || !other.motion.lab) continue;
          gap = Math.min(gap, Math.hypot(x - other.root.position.x, z - other.root.position.z));
        }
        const score = gap * 0.35 + (startDistance - Math.hypot(targetX - x, targetZ - z));
        if (score > best) { best = score; s.escapeX = x; s.escapeZ = z; }
      }
      if (!Number.isFinite(best)) return false;
      s.escapeLeft = 1.8; s.escapeBlocked = 0; s.escapes++; labEscape = e;
      e.motion.labWork = ""; e.motion.labReach = 0; e.blocked = 0;
      return true;
    };
    const stepLabEscape = (e, dt) => {
      const s = e.stuck, p = e.root.position;
      if (labEscape !== e) return false;
      s.escapeLeft -= dt;
      const dx = s.escapeX - p.x, dz = s.escapeZ - p.z, distance = Math.hypot(dx, dz);
      if (s.escapeLeft <= 0 || s.escapeBlocked > 0.3 || distance < 0.015 || !e.motion.lab || e.controlled || e.lab.item >= 0) {
        labEscape = null; s.escapeLeft = 0; e.lab.pathCount = e.lab.pathIndex = 0; e.lab.pathAt = 0;
        s.retryAt = elapsed + 0.5;
        e.blocked = 0; return false;
      }
      e.motion.labWork = ""; e.motion.labReach = 0;
      const step = Math.min(distance, 0.9 * dt), x = p.x + dx / distance * step, z = p.z + dz / distance * step;
      const speed = dx * Math.sin(e.heading) + dz * Math.cos(e.heading) < 0 ? -0.9 : 0.9;
      e.speed = speed;
      labEnvelope(e);
      if (e.gorilla.labWalkCompact && ordinaryLabStep(e, x, p.y, z, e.heading, speed, true)
        && !occupied(e, x, p.y, z, true, e.heading) && staticClear(e, p.x, p.y, p.z, x, p.y, z)) {
        p.x = x; p.z = z; s.escapeBlocked = 0;
      } else { e.speed = 0; s.escapeBlocked += dt; }
      return true;
    };
    const moveLab = (e, dt, speed = 1.1) => {
      const p = e.root.position, dx = e.goalX - p.x, dz = e.goalZ - p.z, distance = Math.hypot(dx, dz);
      const carrying = !!e.gorilla.labItem;
      e.motion.labSqueeze = false;
      e.motion.labWork = carrying ? "carry" : "";
      if (!carrying) e.motion.labReach = 0;
      if (!distance) { e.speed = 0; return; }
      if (e.lab.pathCount && elapsed < e.lab.readyAt) { e.speed = 0; e.blocked = 0; return; }
      const station = labStations[e.lab.station];
      const fixed = e.lab.pathFixed && e.lab.pathCount;
      const final = !e.lab.yielding && !e.lab.pathPartial && e.route !== "exit" && station && e.lab.pathIndex + 1 >= e.lab.pathCount;
      const desired = fixed ? e.lab.pathHeading
        : final && distance <= 0.800001
        ? station.heading : Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(desired - e.heading), Math.cos(desired - e.heading));
      const heading = e.heading + clamp(turn, -dt * 3, dt * 3);
      // Clear the starting turn before committing to a forward walk. A fixed
      // departure or short bench shuffle intentionally keeps its facing.
      const step = !fixed && Math.abs(turn) > dt * 3 ? 0
        : Math.min(distance, speed * dt, final && !fixed && distance > 0.800001 ? distance - 0.8 : distance);
      const x = p.x + dx / distance * step, z = p.z + dz / distance * step;
      const walkingSpeed = (dx * Math.sin(heading) + dz * Math.cos(heading) < 0 ? -1 : 1) * speed;
      if (carrying) {
        // A displaced inspector must reach its bench before yielding. The real
        // held vessel cannot fit the empty-handed shuffle; retain its full pose.
        e.motion.labSqueeze = false;
        if (!e.gorilla.labCompact) { e.speed = 0; return; }
      } else {
        if (!e.gorilla.labWalkCompact) { e.speed = 0; return; }
        if (!ordinaryLabStep(e, x, p.y, z, heading, walkingSpeed)) {
          e.speed = 0; e.blocked += dt;
          if (heading !== e.heading && ordinaryLabStep(e, p.x, p.y, p.z, heading, walkingSpeed)) e.heading = heading;
          return;
        }
      }
      e.speed = walkingSpeed;
      labEnvelope(e);
      if (occupied(e, x, p.y, z, true, heading) || !staticClear(e, p.x, p.y, p.z, x, p.y, z, e.heading, heading)) {
        // A bench can block the translating arc while leaving room to turn
        // into the final approach. Validate that stationary turn separately.
        e.speed = 0;
        if (heading !== e.heading && !occupied(e, p.x, p.y, p.z, true, heading)
          && staticClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, heading)) e.heading = heading;
        e.blocked += dt; return;
      }
      p.x = x; p.z = z; e.heading = heading;
      if (step > 0) e.lab.trafficWait = 0;
      e.speed = step / dt * (dx * Math.sin(heading) + dz * Math.cos(heading) < 0 ? -1 : 1); e.blocked = 0;
    };
    const requestLabPass = (requester, tx, tz) => {
      if (elapsed < labPassAt || labSite < 0) return false;
      // Ask for clearance along the route actually being walked. The straight
      // chord to a distant workstation may cross an unrelated occupied desk.
      if (requester.lab.pathCount) {
        const at = requester.lab.pathIndex * 3;
        tx = requester.lab.path[at]; tz = requester.lab.path[at + 2];
      }
      const p = requester.root.position, dx = tx - p.x, dz = tz - p.z, length2 = dx * dx + dz * dz;
      let nearest = Infinity, blocker = null;
      for (let i = 0; i < list.length; i++) {
        const other = list[i], q = other.root.position;
        if (other === requester || !other.active || other.controlled || other === labEscape || other.site !== labSite || other.phase !== "work"
          || other.lab.yielding || !other.motion.lab || other.climb.active || other.fire.rolling) continue;
        // A worker already following its reservation is about to clear this
        // space. Do not cancel that plan by asking it to yield mid-crossing.
        if (!other.lab.arrived && other.blocked < 0.4
          && (!other.lab.pathPartial || other.lab.pathCount || elapsed < other.lab.coordinationUntil)) continue;
        // A held-item return can itself need room. Never ask one of the
        // requester’s waiting ancestors to yield back and close a wait cycle.
        let dependency = requester, cyclic = false;
        for (let n = 0; dependency && n < list.length; n++) {
          if (dependency === other) { cyclic = true; break; }
          dependency = dependency.lab.yielding ? dependency.lab.yieldFor : null;
        }
        if (cyclic) continue;
        const projection = length2 ? ((q.x - p.x) * dx + (q.z - p.z) * dz) / length2 : 0;
        if (projection < -0.05) continue;
        const t = clamp(projection, 0, 1);
        const distance = Math.hypot(q.x - p.x, q.z - p.z);
        const shape = peerShape(p.x, p.y, p.z, q.x, q.y, q.z);
        const reach = shape.radius(requester) + shape.radius(other) + 0.03;
        if (distance > 4 || distance >= nearest || Math.hypot(q.x - p.x - dx * t, q.z - p.z - dz * t) > reach) continue;
        const heading = requester.lab.pathFixed && requester.lab.pathCount ? requester.lab.pathHeading : Math.atan2(dx, dz);
        if (shape.separates(requester, p.x, p.y, p.z, requester.heading, tx, p.y, tz, heading,
          other, q.x, q.y, q.z, other.heading, 0.03)) continue;
        blocker = other; nearest = distance;
      }
      if (!blocker) return false;
      labPassAt = elapsed + 0.45;
      const job = blocker.lab, site = sites[labSite], p0 = blocker.root.position;
      const across = (p0.x - site.mouth.x) * site.cr - (p0.z - site.mouth.z) * site.sr;
      const along = (p0.x - site.mouth.x) * site.sr + (p0.z - site.mouth.z) * site.cr;
      // Retract before selecting a real, reachable retreat. A fixed side point
      // can be inside the bench or still cover the requester's final approach.
      const side = across < 0 ? -1 : 1;
      job.yielding = 1; job.yieldFor = requester; job.yieldUntil = elapsed + 1;
      const length = Math.sqrt(length2) || 1; job.yieldDX = dx / length; job.yieldDZ = dz / length;
      job.yieldAlong = along; job.yieldChoice = 0; job.yieldReady = false;
      job.yieldTargetX = tx; job.yieldTargetZ = tz;
      job.yieldProgressX = p.x; job.yieldProgressZ = p.z; job.yieldProgressAt = elapsed;
      job.yieldSide = side; job.pathCount = job.pathIndex = 0; job.pathAt = 0;
      blocker.motion.labSqueeze = false;
      if (job.item >= 0) { job.stage = "return"; job.reach = 0; }
      return true;
    };
    const planLabYield = (e) => {
      const job = e.lab, p = e.root.position, point = job.yieldPoint, home = labStations[job.station];
      if (elapsed < job.pathAt) return false;
      const other = job.yieldFor, q = other && other.root.position;
      const radius = e.radius, height = e.height, compact = e.compact, mode = e.footprintMode;
      const planning = e.planningLab, work = e.planningLabWork, speed = e.speed;
      e.radius = BL.agent.LAB_WALK_RADIUS; e.height = BL.agent.LAB_HEIGHT;
      e.compact = e.planningLab = true; e.footprintMode = "lab"; e.planningLabWork = ""; e.speed = 0.65;
      let found = false;
      for (let n = 0; n < 8; n++) {
        const choice = job.yieldChoice % 8;
        if (choice === 0 && home) {
          point.x = home.x; point.y = home.y; point.z = home.z;
        } else {
          const shift = choice === 2 ? -0.8 : choice === 3 ? 0.8 : choice === 4 ? -0.8 : choice === 5 ? -1.6 : choice === 6 ? 1.6 : 0;
          const across = choice === 4 ? 0 : (choice === 7 ? -job.yieldSide : job.yieldSide) * LAB_ROUTE_X[2];
          sitePoint(sites[labSite], across, job.yieldAlong + shift, point);
        }
        point.heading = Math.atan2(point.x - p.x, point.z - p.z);
        let blocks = false;
        if (q) {
          const dx = job.yieldTargetX - q.x, dz = job.yieldTargetZ - q.z, length2 = dx * dx + dz * dz;
          const shape = peerShape(point.x, point.y, point.z, q.x, q.y, q.z);
          const reach = shape.radius(e) + shape.radius(other) + 0.03;
          for (let i = 0; i < shape.count(other); i++) {
            const offset = shape.offset(other, i), x = q.x + Math.sin(other.heading) * offset, z = q.z + Math.cos(other.heading) * offset;
            const k = length2 ? clamp(((point.x - x) * dx + (point.z - z) * dz) / length2, 0, 1) : 0;
            if ((point.x - x - dx * k) ** 2 + (point.z - z - dz * k) ** 2 < reach * reach) { blocks = true; break; }
          }
        }
        if (Math.hypot(point.x - p.x, point.z - p.z) < 0.08 || blocks || !insideLab(point.x, point.y, point.z)
          || occupied(e, point.x, point.y, point.z, true, point.heading)
          || !staticClear(e, point.x, point.y, point.z, point.x, point.y, point.z, point.heading, point.heading)) {
          job.yieldChoice++; continue;
        }
        found = true; break;
      }
      e.radius = radius; e.height = height; e.compact = compact; e.footprintMode = mode;
      e.planningLab = planning; e.planningLabWork = work; e.speed = speed;
      if (!found) { job.pathAt = elapsed + 0.5; return false; }
      if (!planLabPath(e, point.x, point.y, point.z, point.heading)) {
        if (!job.pathPending) job.yieldChoice++;
        return false;
      }
      job.yieldReady = true; e.blocked = 0;
      return true;
    };
    const yieldLab = (e, dt) => {
      const job = e.lab, p = e.root.position, point = job.yieldPoint;
      if (job.item >= 0) { workLab(e, dt); return; }
      e.motion.labWork = ""; e.motion.labReach = 0; e.motion.labSqueeze = false;
      if (!e.gorilla.labWalkCompact) { e.speed = 0; return; }
      const other = job.yieldFor, q = other && other.root.position;
      if (elapsed >= job.yieldUntil) {
        const distance = q ? Math.hypot(q.x - p.x, q.z - p.z) : Infinity;
        const passed = q && (q.x - p.x) * job.yieldDX + (q.z - p.z) * job.yieldDZ > 1.65;
        const withdrew = other && other.controlled && other.drive.x * job.yieldDX + other.drive.z * job.yieldDZ < -0.2 && distance > 2.1;
        if (!other || !other.active || passed || withdrew || distance >= 4.5 || other.lab.arrived && other.phase === "work") {
          let home = labStations[job.station];
          if (home && home.kind === "carry") {
            const pickup = labPickupFor(e, job.station);
            if (pickup < 0) return;
            home = labPickupPoint(home, labEquipment[pickup], job.pickupPoint);
            job.pickup = pickup;
          }
          if (home) {
            if (elapsed < job.pathAt) return;
            // Returning resumes ordinary walking, including the workstation
            // turn. Reserve that speed and pose before releasing the yield.
            const yielding = job.yielding;
            job.yielding = 0;
            if (!planLabPath(e, home.x, home.y, home.z, home.heading)) { job.yielding = yielding; return; }
          }
          job.yielding = 0; job.yieldFor = null; job.yieldReady = false; job.arrived = false;
          return;
        }
      }
      if (q && Math.hypot(q.x - job.yieldProgressX, q.z - job.yieldProgressZ) > 0.15) {
        job.yieldProgressX = q.x; job.yieldProgressZ = q.z; job.yieldProgressAt = elapsed;
      }
      if (job.yieldReady && (e.blocked > 0.5 || elapsed - job.yieldProgressAt > 2.5 && Math.hypot(p.x - point.x, p.z - point.z) < 0.08)) {
        job.yieldReady = false; job.yieldChoice++; job.pathCount = job.pathIndex = 0; job.pathAt = 0;
        job.yieldProgressAt = elapsed;
      }
      if (!job.yieldReady && !planLabYield(e)) { e.speed = 0; return; }
      const distance = Math.hypot(p.x - point.x, p.z - point.z);
      if (distance > 0.003) {
        if (labGoal(e, point.x, point.y, point.z, point.heading)) moveLab(e, dt, 0.65);
        else e.speed = 0;
      } else e.speed = damp(e.speed, 0, 12, dt);
    };
    const labPickupFor = (e, station) => {
      const pickup = e.lab.item >= 0 ? e.lab.item : e.lab.pickup, item = labEquipment[pickup];
      if (item && item.station === station && (!item.holder || item.holder === e)) return pickup;
      for (let i = 0; i < labEquipment.length; i++) {
        const item = labEquipment[i];
        if (item.station === station && (!item.holder || item.holder === e)) return i;
      }
      return -1;
    };
    const labPickupPoint = (station, equipment, point) => {
      const q = equipment.pickup, sine = Math.sin(station.heading), cosine = Math.cos(station.heading);
      point.x = q.x - sine * 1.213094 - cosine * 0.272893; point.y = station.y;
      point.z = q.z - cosine * 1.213094 + sine * 0.272893;
      point.heading = station.heading; point.side = station.side;
      return point;
    };
    const reserveLab = (e, moving, recovering = false) => {
      if (!labStations.length) return false;
      if (!moving && !recovering) {
        if (!e.lab.waitOrder) e.lab.waitOrder = ++labWaitSerial;
        for (const other of list) {
          if (other !== e && other.active && other.mode === "working" && other.site === labSite && !other.hasSlot
            && other.lab.waitOrder > 0 && other.lab.waitOrder < e.lab.waitOrder) return false;
        }
      }
      if (moving) {
        const mouth = sites[labSite].mouth;
        for (const other of list) {
          if (other === e || !other.active) continue;
          if (other.site === labSite && other.mode === "working" && other.lab.waitOrder > 0) return false;
          if (other.phase === "travel" && other.site === labSite || other.route === "exit" && other.fromSite === labSite) return false;
          if (other.controlled && Math.hypot(other.drive.x, other.drive.z) > 0.05
            && Math.hypot(other.root.position.x - mouth.x, other.root.position.z - mouth.z) < 8) return false;
        }
      }
      const p = e.root.position, previous = e.lab.station;
      const radius = e.radius, height = e.height, compact = e.compact, mode = e.footprintMode;
      e.radius = BL.agent.LAB_RADIUS || 1.1; e.height = BL.agent.LAB_HEIGHT || 2.8;
      e.compact = e.planningLab = true; e.footprintMode = "lab";
      const start = moving ? (Math.max(0, previous) + 1) % labStations.length : e.index % labStations.length;
      let chosen = -1, chosenPickup = -1;
      for (let i = 0; i < labStations.length; i++) {
        const index = (start + i) % labStations.length, station = labStations[index];
        if (station.enabled === false) continue;
        if (moving && (index === previous || Math.hypot(station.x - p.x, station.z - p.z) < 0.65)) continue;
        let claimed = false;
        for (let j = 0; j < list.length; j++) {
          const other = list[j];
          if (other !== e && other.active && other.site === labSite && other.hasSlot && other.lab.station === index) { claimed = true; break; }
        }
        if (claimed) continue;
        const pickup = station.kind === "carry" ? labPickupFor(e, index) : -1;
        if (station.kind === "carry" && pickup < 0) continue;
        // A rolled die can move its pickup spot. Prove the exact destination
        // workLab will use, instead of discarding this route after committing.
        const destination = pickup >= 0 ? labPickupPoint(station, labEquipment[pickup], e.lab.pickupPoint) : station;
        e.planningLabWork = station.kind; e.planningLabSide = station.side === -1 ? -1 : 1;
        if (occupied(e, destination.x, destination.y, destination.z, true, destination.heading)
          || reserved(e, destination.x, destination.z, destination.heading)
          || !staticClear(e, destination.x, destination.y, destination.z, destination.x, destination.y, destination.z, destination.heading, destination.heading)) continue;
        // Changing jobs is optional. Keep the current desk productive until a
        // complete route is reserved; staging in its aisle would release the
        // old job before we know how to reach the new one.
        if (moving && !planLabPath(e, destination.x, destination.y, destination.z, destination.heading)) continue;
        chosen = index; chosenPickup = pickup; break;
      }
      e.radius = radius; e.height = height; e.compact = compact; e.footprintMode = mode; e.planningLab = false; e.planningLabWork = "";
      if (chosen < 0) {
        if (moving) e.lab.pathPending = false;
        return false;
      }
      const station = labStations[chosen];
      const destination = chosenPickup >= 0 ? labPickupPoint(station, labEquipment[chosenPickup], e.lab.pickupPoint) : station;
      e.lab.waitOrder = 0;
      e.lab.station = chosen; e.lab.arrived = false; e.lab.time = e.lab.reach = 0;
      e.lab.stage = station.kind === "carry" ? "fetch" : ""; e.lab.bench = -1; e.lab.pickup = chosenPickup;
      e.slotIndex = chosen; e.slotX = destination.x; e.slotY = destination.y; e.slotZ = destination.z; e.hasSlot = true;
      return true;
    };
    const yieldLabStation = (e) => {
      let waiting = false;
      for (const other of list) {
        if (other === e || !other.active || other.site !== labSite) continue;
        // Keep one complete exit/entry exchange in flight through the arch.
        if (other.phase === "travel" || other.phase === "leave") return false;
        if (other.mode === "working" && other.phase === "wait" && other.lab.waitOrder > 0) waiting = true;
      }
      if (!waiting || e.lab.item >= 0 || e.lab.yielding) return false;
      releasePortal(e); releaseLab(e);
      e.motion.labSqueeze = false;
      e.lab.waitOrder = ++labWaitSerial;
      e.hasSlot = false; e.slotIndex = -1; e.overflow = true;
      e.phase = "travel"; e.route = "exit"; e.fromSite = labSite;
      e.blocked = e.retry = 0;
      return true;
    };
    const trafficAt = (x, y, z) => {
      // Keep the doorway and its central apron open even between shifts.
      // The wider firing fan belongs only to real assigned workers; reserving
      // every empty fan removes most of the meadow from idle destinations.
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i], m = site.mouth, dx = x - m.x, dz = z - m.z;
        if (y < m.floorY - 0.2 || y > m.floorY + 2.6) continue;
        const across = dx * site.cr - dz * site.sr, along = dx * site.sr + dz * site.cr;
        if (along <= -0.5 || along >= 12 || Math.abs(across) >= 6.5) continue;
        if (along < 6.5 && Math.abs(across) < 2.5) return true;
        for (let j = 0; j < crew.list.length; j++) {
          const cave = crew.list[j], work = cave.work;
          if (cave === crew.player || cave.state !== "working" || !cave.root.visible) continue;
          if (work.plannedSite === i || work.site === i && (work.phase === "outbound"
            || work.phase === "station" || work.phase === "shoot" || work.phase === "return")) return true;
        }
      }
      return false;
    };
    const reserve = (e, move = false, recovering = false) => {
      const site = sites[e.site];
      if (!site) return false;
      if (e.site === labSite) return reserveLab(e, move, recovering);
      const p = e.root.position, previousHeading = e.heading;
      e.heading = site.mouth.ry;
      // Fill the sides before the centre, keeping a route through the mouth
      // for ordinary repository populations. Every candidate still checks the
      // complete current/planned rig against furniture and other residents.
      const cells = ROOM_CELLS;
      const start = move ? (e.slotIndex + 1 + e.workCycle) % cells.length : 0;
      for (let i = 0; i < cells.length; i++) {
        const index = (start + i) % cells.length, cell = cells[index];
        // Keep the complete working pose behind the mirror plane. The old
        // middle row left the torso inside while a turn, jump or pound could
        // put the head back through the glass.
        if (site.mirrorRoom && cell[1] > -3) continue;
        // The expanded mirror chamber still has a voxel-stepped side wall.
        // Keep its work lanes nearer the centre so an inward-facing full arm
        // pose can travel between them without scraping that wall.
        sitePoint(site, site.mirrorRoom ? cell[0] * 0.76 : cell[0], cell[1], POINT);
        if (move && Math.hypot(POINT.x - p.x, POINT.z - p.z) < 0.65) continue;
        if (occupied(e, POINT.x, POINT.y, POINT.z) || reserved(e, POINT.x, POINT.z)
          || !staticClear(e, POINT.x, POINT.y, POINT.z)) continue;
        e.slotIndex = index; e.slotX = POINT.x; e.slotY = POINT.y; e.slotZ = POINT.z; e.hasSlot = true;
        e.heading = previousHeading; return true;
      }
      e.heading = previousHeading; return false;
    };
    const restTransitionClear = (e, lounge, dt = 0) => {
      if (!ctx.restPoseClear) return true;
      // A short first step can sweep sideways before the torso is upright.
      // Larger look-ahead poses do not imply this actual frame is clear.
      if (dt > 0 && !ctx.restPoseClear(e, dt, lounge)) return false;
      for (let i = 0; i < REST_TRANSITION_TIMES.length; i++) {
        if (!ctx.restPoseClear(e, REST_TRANSITION_TIMES[i], lounge)) return false;
      }
      return true;
    };
    let checkingRest = false;
    const noRestTerrain = () => false;
    const restPreviewClear = (e) => {
      if (!checkingRest) return true;
      checkingRest = false;
      const p = e.root.position;
      e.compact = false; e.radius = Math.max(WALK_RADIUS, e.gorilla.bodyRadius + 0.1);
      e.height = Math.max(2.7, e.gorilla.bodyHeight + 0.04);
      for (const other of list) if (other !== e && other.active) {
        const q = other.root.position;
        if ((torso || footprint).overlaps(e, p.x, p.y, p.z, e.root.rotation.y,
          other, q.x, q.y, q.z, other.heading, SPACE)) return false;
      }
      return !occupied(e, p.x, p.y, p.z, true, e.root.rotation.y)
        && staticClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.root.rotation.y, e.root.rotation.y);
    };
    const restSpace = (e, pose, x, y, z, heading) => {
      if (ctx.restPoseClear) {
        if (!ctx.restPoseClear(e, 2, pose, true, x, y, z, heading)) return false;
        // A resting place must also let its occupant get back onto all fours.
        // Check the rise while selecting it, before another body can settle
        // into the space needed by that transition.
        for (const dt of REST_TRANSITION_TIMES) {
          if (!ctx.restPoseClear(e, dt, "", true, x, y, z, heading, pose)) return false;
        }
        return true;
      }
      const compact = e.compact, radius = e.radius, height = e.height;
      checkingRest = true;
      let fits = e.gorilla.climbPoseClear(2, x, y, z, heading, e.motion,
        ctx.solidAt || noRestTerrain, restPreviewClear, e, 0, true, pose);
      for (let i = 0; fits && i < REST_TRANSITION_TIMES.length; i++) {
        checkingRest = true;
        fits = e.gorilla.climbPoseClear(REST_TRANSITION_TIMES[i], x, y, z, heading, e.motion,
          ctx.solidAt || noRestTerrain, restPreviewClear, e, 0, true, "", pose);
      }
      checkingRest = false; e.compact = compact; e.radius = radius; e.height = height;
      return fits;
    };
    const leaveLounge = (e) => {
      e.groomTime = 0; e.motion.groom = 0; e.loungePartner = null;
      if (e.lounge) e.loungeDepart = true;
    };
    const roamStartClear = (e) => {
      const p = e.root.position, compact = e.compact, mode = e.footprintMode, radius = e.radius, height = e.height;
      e.compact = e.planningRoam = true; e.footprintMode = "walk"; e.radius = WALK_RADIUS; e.height = WALK_HEIGHT;
      const fits = !occupied(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z);
      e.compact = compact; e.footprintMode = mode; e.radius = radius; e.height = height; e.planningRoam = false;
      return fits;
    };
    const setGoal = (e, x, y, z) => {
      if (e.lounge && Math.hypot(x - e.root.position.x, z - e.root.position.z) > 0.18) leaveLounge(e);
      e.goalX = x; e.goalY = y; e.goalZ = z;
    };
    // Retain the small itinerary for an entire outing. Static routes are only
    // searched when choosing a destination or an obstruction changes; peers
    // share their retained routes for short, deterministic crossing waits.
    const roamFuture = (e, seconds, out) => {
      const p = e.root.position, r = e.roam;
      out.x = p.x; out.y = p.y; out.z = p.z; out.heading = e.heading;
      if (e.controlled || e.lounge || e.loungeDepart || e.recover > 0 || e.climb.active || elapsed < r.waitUntil) return out;
      for (let i = r.index; i < r.count && seconds > 0; i++) {
        const at = i * 3, dx = r.path[at] - out.x, dz = r.path[at + 2] - out.z;
        const distance = Math.hypot(dx, dz), heading = i === 0 && r.reverseStart ? r.departHeading : Math.atan2(dx, dz);
        seconds -= Math.abs(Math.atan2(Math.sin(heading - out.heading), Math.cos(heading - out.heading))) / 3;
        if (seconds <= 0) break;
        const step = Math.min(distance, seconds * CHILL_SPEED);
        if (distance > 0) { out.x += dx * step / distance; out.z += dz * step / distance; }
        out.y += (r.path[at + 1] - out.y) * Math.min(1, step / Math.max(0.001, distance));
        out.heading = heading; seconds -= step / CHILL_SPEED;
      }
      return out;
    };
    const roamPeerClear = (e, x, y, z, heading, stationary = false, fromX = x, fromY = y, fromZ = z, fromHeading = heading) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || !other.root.visible) continue;
        if (stationary && other !== e.roam.obstacle && other.phase === "chill" && !other.controlled
          && !other.lounge && !other.loungeDepart && other.recover <= 0 && !other.climb.active
          && elapsed >= other.roam.waitUntil && other.roam.count > other.roam.index) continue;
        const p = other.root.position, shape = torso || footprint;
        if (other.climb.active && climbClaimOccupied(e, x, y, z, heading, other)) return false;
        if (shape.overlaps(e, x, y, z, heading, other, p.x, p.y, p.z, other.heading, SPACE)
          || !shape.separates(e, fromX, fromY, fromZ, fromHeading, x, y, z, heading,
            other, p.x, p.y, p.z, other.heading, SPACE)) return false;
      }
      return true;
    };
    const roamLeg = (e, x, y, z, nx, ny, nz, heading, partial, out, fixedHeading = NaN) => {
      const distance = Math.hypot(nx - x, nz - z), facing = Number.isFinite(fixedHeading) ? fixedHeading : Math.atan2(nx - x, nz - z);
      if (!staticClear(e, x, y, z, x, y, z, heading, facing)
        || !roamPeerClear(e, x, y, z, facing, true, x, y, z, heading)) return false;
      const steps = Math.max(1, Math.ceil(distance / 0.4)), dx = (nx - x) / steps, dz = (nz - z) / steps;
      let px = x, py = y, pz = z;
      for (let i = 1; i <= steps; i++) {
        const tx = x + dx * i, tz = z + dz * i, ty = support(e, tx, tz, py, STEP, facing);
        // A prop's edge has no continuous wall to grip. Prove the horizontal
        // clearance and vertical landing here, then use the existing passive
        // descent at execution. Otherwise every route off a rock is mistaken
        // for an unavailable climb, even though walking off it is supported.
        const propDrop = py - ty > STEP && py - (ctx.terrainSupportAt
          ? ctx.terrainSupportAt(e, px, pz, py, STEP, facing) : groundAt(px, pz, py)) > STEP;
        if (!Number.isFinite(ty) || Math.abs(ty - py) > STEP && !propDrop || !landing(tx, ty, tz)
          || !roamPeerClear(e, tx, ty, tz, facing, true, px, py, pz, facing)
          || !propStepClear(e, px, py, pz, tx, ty, tz, facing, facing)) {
          // A low tread is not a climbable wall. Try another walking approach
          // instead of retaining a zero-length "wall" route at its edge.
          if (!partial || Math.abs(ny - py) < 1 || Math.hypot(px - nx, pz - nz) > 7) return false;
          out.x = px; out.y = py; out.z = pz; out.heading = facing;
          return true;
        }
        px = tx; py = ty; pz = tz;
      }
      // Intermediate knots inherit the support reached by the swept steps.
      // Their point-terrain sample can be below a rock that provides a valid
      // short clearance step. Only the final destination owns a level goal.
      out.x = px; out.y = py; out.z = pz; out.heading = facing;
      return true;
    };
    const planRoam = (e, x, y, z, endHeading = e.loungeHeading, pose = e.roam.pose, walkingOnly = false) => {
      if (!roamBudget) return false;
      roamBudget--;
      const p = e.root.position, r = e.roam;
      const compact = e.compact, mode = e.footprintMode, radius = e.radius, height = e.height;
      e.compact = e.planningRoam = true; e.footprintMode = "walk"; e.radius = WALK_RADIUS; e.height = WALK_HEIGHT;
      const dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
      const sx = distance > 0 ? dz / distance : 1, sz = distance > 0 ? -dx / distance : 0;
      let found = false, best = Infinity, count = 0, wall = false, reverse = false;
      // Straight first. The two interior knots produce a short parallel pass
      // around a tree or resting body, without routing via a distant landmark.
      for (let attempt = 0; attempt < 15; attempt++) {
        const departure = attempt >= 11 ? -(attempt - 10) * 0.65 : attempt >= 9 ? (attempt - 8) * 0.9 : 0;
        const offset = attempt && !departure ? Math.ceil(attempt / 2) * 1.35 * (attempt % 2 ? 1 : -1) : 0;
        let px = p.x, py = p.y, pz = p.z, heading = e.heading, length = 0, valid = true, n = 0;
        const legs = departure ? 2 : attempt ? 3 : 1;
        for (let leg = 0; leg < legs; leg++) {
          const final = leg + 1 === legs, t = final ? 1 : (leg + 1) / 3;
          // At a tight resting place, move forward into the clearing before
          // turning. The large knuckle arc need not fit at the resting root.
          const nx = departure && !final ? p.x + Math.sin(e.heading) * departure : p.x + dx * t + (final ? 0 : sx * offset);
          const nz = departure && !final ? p.z + Math.cos(e.heading) * departure : p.z + dz * t + (final ? 0 : sz * offset);
          const ny = final ? y : groundAt(nx, nz, py);
          if (!roamLeg(e, px, py, pz, nx, ny, nz, heading, final, roamPoint,
            departure < 0 && !final ? e.heading : NaN)) { valid = false; break; }
          length += Math.hypot(roamPoint.x - px, roamPoint.z - pz);
          roamPath[n++] = roamPoint.x; roamPath[n++] = roamPoint.y; roamPath[n++] = roamPoint.z;
          px = roamPoint.x; py = roamPoint.y; pz = roamPoint.z; heading = roamPoint.heading;
        }
        if (!valid || length >= best || walkingOnly && Math.abs(py - y) > 0.55) continue;
        if (Math.abs(py - y) <= 0.55) {
          const facing = Number.isFinite(endHeading) ? endHeading : heading;
          if (!staticClear(e, px, py, pz, px, py, pz, heading, facing)
            || !roamPeerClear(e, px, py, pz, facing, true, px, py, pz, heading)) continue;
          // Reserve the actual resting body at its final facing. A clear
          // walking endpoint alone says nothing about space for reclining.
          if (pose) {
            e.planningRoam = e.compact = false;
            const fits = restSpace(e, pose, px, py, pz, facing);
            e.planningRoam = e.compact = true;
            if (!fits) continue;
          }
        }
        found = true; best = length; count = n / 3; wall = Math.abs(py - y) > 0.55; reverse = departure < 0;
        for (let i = 0; i < n; i++) r.path[i] = roamPath[i];
        if (!attempt) break;
      }
      e.compact = compact; e.footprintMode = mode; e.radius = radius; e.height = height; e.planningRoam = false;
      r.plans++;
      if (!found) return false;
      r.count = count; r.index = 0; r.wall = wall; r.level = p.y; r.waitUntil = 0; r.blocked = 0;
      r.reverseStart = reverse; r.departHeading = e.heading;
      r.targetX = x; r.targetY = y; r.targetZ = z; r.order = ++roamSerial; r.obstacle = null;
      return true;
    };
    const loungePose = (e) => {
      const choice = e.random();
      return choice < 0.35 ? "sit" : choice < 0.48 ? "back" : choice < 0.61 ? "left" : choice < 0.74 ? "right"
        : choice < 0.83 ? "lean-left" : choice < 0.92 ? "lean-right" : "lean-back";
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
    const loungeReserved = (e, x, y, z, radius = WALK_RADIUS, partner = null) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || other === partner || !other.active || other.phase !== "chill"
          || other.loungePartner === e || Math.abs(other.goalY - y) > 1.5) continue;
        // A settled body still owns room to rise. Only its explicitly paired
        // grooming guest shares that space; ordinary walking uses torso bounds.
        const space = radius + (other.loungePartner ? 1.25 : WALK_RADIUS) + SPACE;
        if ((other.goalX - x) ** 2 + (other.goalZ - z) ** 2 < space * space) return true;
      }
      return false;
    };
    const loungeGoal = (e, x, y, z, roof, partner = null, heading = NaN, pose = "") => {
      setGoal(e, x, y, z);
      e.rest = (roof ? 45 : 30) + e.random() * (roof ? 35 : 30);
      e.loungeRoof = roof; e.loungePartner = partner; e.loungeHeading = heading;
      e.loungeCycle = roof ? e.loungeCycle + 1 : 0;
      e.groomTime = 0; e.groomWait = 2 + e.random() * 6;
      if (!e.loungeDepart) e.lounge = "";
      e.phase = "chill"; e.motion.groom = 0; e.roam.arrived = false; e.roam.failedChoices = 0; e.roam.pose = partner ? "sit" : pose || loungePose(e);
      e.roam.departPending = false;
    };
    const loungeSeatSpace = (e, x, y, z, heading, partner = e.loungePartner) => {
      const compact = e.compact, mode = e.footprintMode, radius = e.radius, height = e.height;
      e.compact = e.planningSeat = true; e.footprintMode = "sit"; e.radius = 0.9; e.height = 2.7;
      const fits = !occupied(e, x, y, z, true, heading) && staticClear(e, x, y, z, x, y, z, heading, heading);
      e.compact = compact; e.footprintMode = mode; e.radius = radius; e.height = height; e.planningSeat = false;
      return fits && !loungeReserved(e, x, y, z, 1.25, partner);
    };
    const loungeFailed = (e, x, z) => {
      const r = e.roam;
      return elapsed < r.failedUntil && (x - r.failedX) ** 2 + (z - r.failedZ) ** 2 < 4
        || elapsed < r.wallFailedUntil && (x - r.wallFailedX) ** 2 + (z - r.wallFailedZ) ** 2 < 4;
    };
    const nearbyLounge = (e, roof, spawn, stayLevel = false) => {
      const first = Math.floor(e.random() * Math.max(1, list.length));
      for (let i = 0; i < list.length; i++) {
        const other = list[(first + i) % list.length];
        if (other === e || !other.active || other.controlled || other.mode !== "chilling" || other.phase !== "chill" || other.loungePartner
          || other.lounge !== "sit" || !other.gorilla.sitCompact || other.loungeRoof !== roof || other.rest < 15) continue;
        let claimed = false;
        for (let j = 0; j < list.length; j++) if (list[j] !== e && list[j].active && list[j].loungePartner === other) { claimed = true; break; }
        if (claimed) continue;
        // Sit just behind one shoulder, facing the same direction. Keeping the
        // torsos separate leaves a hand free to reach the neighbour's back.
        const q = other.root.position, heading = other.heading, sine = Math.sin(heading), cosine = Math.cos(heading);
        if (stayLevel && Math.hypot(q.x - e.root.position.x, q.z - e.root.position.z) > 12) continue;
        const firstSide = e.random() < 0.5 ? -1 : 1;
        for (let n = 0; n < 2; n++) {
          const side = n ? -firstSide : firstSide;
          const x = q.x - cosine * side * 1.9 - sine, z = q.z + sine * side * 1.9 - cosine;
          const y = roof && ctx.surfaceAt ? ctx.surfaceAt(x, z) : groundAt(x, z, q.y);
          if (!spawn && (Math.hypot(x - e.root.position.x, z - e.root.position.z) < 2 || loungeFailed(e, x, z))) continue;
          if (Math.hypot(x, z) < (ctx.meadowRadius || 22) * 0.82 || Math.abs(y - q.y) > 0.15 || !grass(x, y, z, 0.9) || trafficAt(x, y, z)
            || caveAt(x, y, z) >= 0 || !loungeSeatSpace(e, x, y, z, heading, other)) continue;
          if (spawn && !restSpace(e, "sit", x, y, z, heading)) continue;
          if (!spawn && (Math.hypot(x - e.root.position.x, z - e.root.position.z) > 10 || !planRoam(e, x, y, z, heading, "sit", stayLevel))) continue;
          loungeGoal(e, x, y, z, roof, other, heading);
          e.rest = Math.min(e.rest, Math.max(10, other.rest - Math.hypot(x - e.root.position.x, z - e.root.position.z) / CHILL_SPEED));
          e.motion.groomSide = side;
          if (spawn) { e.heading = heading; e.lounge = "sit"; }
          return true;
        }
      }
      return false;
    };
    const chooseChill = (e, spawn = false, stayLevel = false) => {
      // Cave exits also request a fresh distant destination. Only a companion
      // still hidden during activation may already be seated at that goal.
      spawn = spawn && !e.root.visible;
      stayLevel = stayLevel || !spawn && elapsed < e.roam.levelOnlyUntil;
      if (!spawn && (!roamBudget || roamTurn >= 0 && roamTurn !== e.index || elapsed < e.roam.nextChoice)) return false;
      if (!spawn && e.lounge && !roamStartClear(e)) {
        // A seat can fit beside scenery while the future knuckles cannot.
        // Clear that start in the seated pose before asking a walking planner
        // for an entire outing; otherwise departure waits on its own route.
        const r = e.roam, p = e.root.position;
        if (!r.departPending) { r.departAt = elapsed; r.departX = p.x; r.departY = p.y; r.departZ = p.z; }
        r.departPending = true; e.rest = 0; leaveLounge(e); return false;
      }
      prepareLounges(e);
      const p = e.root.position, compact = e.compact, radius = e.radius, height = e.height;
      const wantsRoof = stayLevel ? unusedRoof(p.x, p.y, p.z, 0) : e.mode !== "working" && roofCount > 0 && e.loungeCycle < 2 && e.random() < 0.7;
      const pose = loungePose(e);
      e.compact = false; e.height = Math.max(height, 2.7);
      // Prefer a small group on some visits; a crowded group always falls back
      // to another empty resting spot instead of blocking a walk indefinitely.
      if (e.random() < 0.5 && nearbyLounge(e, wantsRoof, spawn, stayLevel)) {
        e.compact = compact; e.radius = radius; e.height = height; return true;
      }
      for (let pass = 0; pass < 2; pass++) {
        const roof = pass ? !wantsRoof : wantsRoof;
        const count = roof ? roofCount : loungeCount - roofCount, from = roof ? 0 : roofCount;
        const local = !spawn ? 48 : 0, candidates = count + local;
        if (!candidates) continue;
        const first = Math.floor(e.random() * Math.max(1, count));
        e.radius = roof ? Math.max(radius, 2.12) : radius;
        for (let i = 0; i < candidates; i++) {
          const choice = local && e.roam.failedChoices >= 2 ? (i < local ? count + i : i - local) : i;
          const n = (from + (first + choice) % Math.max(1, count)) * 3;
          let x = loungeSpots[n], y = loungeSpots[n + 1], z = loungeSpots[n + 2];
          if (choice >= count) {
            // Cached seats may all be too close or blocked from this side of
            // a prop. Search the current level too, including roof clearings;
            // querying only the meadow strands a walker above that meadow.
            const sample = choice - count, angle = (first + sample % 12) * TAU / 12;
            const radius = 2.5 + Math.floor(sample / 12) * 2.5;
            x = p.x + Math.sin(angle) * radius; z = p.z + Math.cos(angle) * radius;
            y = roof && ctx.surfaceAt ? ctx.surfaceAt(x, z) : groundAt(x, z, 0);
            if (roof && !unusedRoof(x, y, z, FOOT)) continue;
            if (Math.hypot(x, z) < (ctx.meadowRadius || 22) * 0.82 || !grass(x, y, z) || trafficAt(x, y, z)
              || caveAt(x, y, z) >= 0) continue;
          }
          // A walking-only outing may step off a rock or follow a sloped roof.
          // Its supported route, not equal endpoint heights, excludes climbs.
          if (stayLevel && Math.hypot(x - p.x, z - p.z) > 12) continue;
          // Worker assignments can change after the resting-spot cache was
          // built. Recheck the live firing lanes for cached candidates too.
          if (trafficAt(x, y, z)) continue;
          const distance = Math.hypot(x - p.x, z - p.z);
          if (!spawn && (distance < 2 || distance > 12 || loungeFailed(e, x, z))) continue;
          // Filter a future walking arrival, not the current reclining body's
          // large fallback circle. The exact new rest and rise are proved by
          // restSpace below (or by the retained route's endpoint admission).
          const mode = e.footprintMode, candidateCompact = e.compact, candidateHeight = e.height;
          const arrivalHeading = spawn ? e.heading : Math.atan2(x - p.x, z - p.z);
          if (!spawn) { e.planningRoam = e.compact = true; e.footprintMode = "walk"; e.height = WALK_HEIGHT; }
          const clearSpot = !occupied(e, x, y, z, true, arrivalHeading) && !loungeReserved(e, x, y, z, roof ? 2.12 : WALK_RADIUS)
            && staticClear(e, x, y, z, x, y, z, arrivalHeading, arrivalHeading);
          e.planningRoam = false; e.compact = candidateCompact; e.footprintMode = mode; e.height = candidateHeight;
          if (!clearSpot) continue;
          if (spawn && !restSpace(e, pose, x, y, z, e.heading)) continue;
          if (!spawn && !planRoam(e, x, y, z, NaN, pose, stayLevel)) {
            e.compact = compact; e.radius = radius; e.height = height;
            if (roamBudget === 0) {
              e.roam.failedX = x; e.roam.failedZ = z; e.roam.failedUntil = elapsed + 30;
            }
            e.roam.nextChoice = elapsed + 0.4;
            if (++e.roam.failedChoices >= 4 && e.lounge) { e.rest = 12 + e.random() * 8; e.roam.failedChoices = 0; }
            return false;
          }
          loungeGoal(e, x, y, z, roof, null, NaN, pose);
          if (spawn) e.lounge = e.roam.pose;
          e.compact = compact; e.radius = radius; e.height = height; return true;
        }
      }
      e.compact = compact; e.radius = radius; e.height = height;
      e.roam.failedChoices++; e.roam.nextChoice = elapsed + 0.5; return false;
    };
    const restAfterClimb = (e) => {
      // Returning from a blocked or bottomless route invalidates that stroll.
      // A supported nearby rest replaces its unreachable goal, so the same
      // wall is not retried as soon as the short grip cooldown expires.
      e.loungePartner = null; e.loungeHeading = NaN; e.motion.groom = 0;
      if (e.roam.wall) {
        e.roam.wallFailedX = e.goalX; e.roam.wallFailedZ = e.goalZ; e.roam.wallFailedUntil = elapsed + 60;
      }
      e.roam.count = e.roam.index = 0; e.roam.wall = false; e.roam.alignTime = 0;
      if (chooseChill(e, false, true)) return;
      const p = e.root.position;
      setGoal(e, p.x, p.y, p.z); e.rest = 12 + e.random() * 8;
      e.speed = 0; e.lounge = ""; e.phase = "chill";
      // At a narrow lip the full resting body may not fit yet. Preserve the
      // walking footprint until the ordinary safe-expansion check permits it.
      e.exitFootprint = true;
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
      if (!near) {
        e.groomTime = 0;
        if (partner && (!partner.active || partner.controlled || partner.lounge !== "sit" || partner.loungeDepart || partner.fire.burning
          || seated && Math.hypot(partner.root.position.x - e.root.position.x, partner.root.position.z - e.root.position.z) > 2.8)) e.loungePartner = null;
      }
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
      if (e.gorilla.debug.grooming > 0.02) return;
      // Admit the future walking pose before asking the seated rig to rise.
      // Waiting for a seated mesh to fit walking capsules can never complete.
      const roomToRise = roamStartClear(e);
      if (roomToRise && (!ctx.restPoseClear || ctx.restPoseClear(e, 1.2, "", false, p.x, p.y, p.z, e.heading, null, dt))
        && (!e.roam.departPending || chooseChill(e))) {
        e.footprintMode = "walk"; e.compact = e.gorilla.compact;
        // Finish the same checked rise that poseEntry validates before taking
        // a terrain step. Moving halfway through it can pin the remaining
        // limb transition against a nearby prop while every route looks clear.
        e.loungeDepart = false; e.lounge = ""; e.recover = 1.2; e.roam.riseAdmitted = true;
        return;
      }
      // A quad pose fitting here does not prove it can turn or walk out.
      // Keep the seated clearance maneuver until its onward route is also
      // admitted; standing in a prop pocket first can trap the wider gait.
      e.footprintMode = "sit"; e.compact = e.gorilla.sitCompact;
      const sine = Math.sin(e.heading), cosine = Math.cos(e.heading), radial = Math.hypot(p.x, p.z) || 1;
      for (let side = 0; side < 4; side++) {
        const across = side ? (side === 1 ? -1 : 1) * dt * 0.3 : 0;
        const x = side === 3 ? p.x + p.x / radial * dt * 0.35 : p.x - sine * dt * 0.35 + cosine * across;
        const z = side === 3 ? p.z + p.z / radial * dt * 0.35 : p.z - cosine * dt * 0.35 - sine * across;
        const y = groundAt(x, z, p.y);
        if (Math.abs(y - p.y) > 0.12 || !grass(x, y, z, 0.9)) continue;
        // A side-lying body is not a seated capsule. Check its actual short
        // scoot, including the limbs, before trying the rise again.
        if (ctx.restPoseClear ? !ctx.restPoseClear(e, dt, e.lounge, false, x, y, z, e.heading)
          : occupied(e, x, y, z) || !staticClear(e, p.x, p.y, p.z, x, y, z)) continue;
        p.x = x; p.y = y; p.z = z;
        if (e.roam.departPending) { e.goalX = x; e.goalY = y; e.goalZ = z; }
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
      e.heading = heading; e.roam.alignTime = 0;
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
      e.roam.departPending = false;
      releasePortal(e);
      if (siteIndex !== labSite) releaseLab(e);
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
    const activate = (e, recovering = false) => {
      const d = e.drive, f = e.fire, m = e.motion;
      e.lowCover = false; e.backoutLeft = 0;
      d.x = d.z = d.charge = d.vx = d.vy = d.vz = d.motionRecover = 0;
      d.climbExitHeading = d.climbExitLook = NaN;
      d.jumpHeld = d.jumpDown = d.jumpArmed = d.airborne = d.resume = d.motionEnvelope = false; d.grounded = true;
      f.burning = f.rolling = f.requested = f.escaping = false; f.retry = f.escapeRetry = 0; f.age = f.heat = f.soot = f.cooldown = f.rollRecover = 0;
      m.charge = m.takeoff = m.landing = m.roll = m.rollAngle = m.climb = m.mantle = m.groom = m.supportOffset = 0;
      e.climb.active = e.climb.claimPending = e.climb.crestPending = e.climb.searchPending = false;
      e.climb.retry = d.climbAxis = 0; e.roam.count = e.roam.index = 0; e.roam.departPending = false;
      e.actionControlled = e.motion.smash = false;
      releaseLab(e); e.motion.lab = false;
      e.mode = e.owner.state; e.site = e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site;
      e.parked = e.mode === "working"; e.parkFor = 0; e.exitFootprint = false;
      e.biped = e.parked ? true : false;
      e.radius = WALK_RADIUS; e.foot = FOOT;
      e.pound = e.beat = e.stand = e.recover = 0; e.lounge = ""; e.loungeDepart = false; e.footprintMode = e.parked ? "stand" : "walk";
      e.gorilla.poseManaged(2, e.root.position.x, e.root.position.y, e.root.position.z, e.heading, 0, false, e.biped);
      e.compact = e.parked ? e.gorilla.standCompact : false;
      e.active = true; e.root.visible = false; e.hasSlot = false; e.jump.active = false; e.overflow = false;
      e.portalWait = false; e.portalRetry = 0;
      if (e.mode === "working" && sites[e.site] && reserve(e, false, recovering)) {
        e.root.position.x = e.slotX; e.root.position.y = e.slotY; e.root.position.z = e.slotZ;
        e.heading = e.site === labSite && labStations[e.lab.station] ? labStations[e.lab.station].heading : sites[e.site].mouth.ry;
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
      syncLab(e);
      e.gorilla.poseManaged(e.lounge ? 2 : 1 / 60, e.root.position.x, e.root.position.y, e.root.position.z, e.heading, 0, false, e.biped, e.lounge, e.motion);
      labEnvelope(e);
      if (e.lounge === "sit" && e.gorilla.sitCompact) { e.footprintMode = "sit"; e.compact = true; }
      e.root.visible = true;
      if (ctx.track && !e.tracked) { ctx.track(e); e.tracked = true; }
    };
    for (let i = 0; i < crew.list.length; i++) {
      const owner = crew.list[i], gorilla = BL.agent.create({ managed: true, groundAt, scale: SCALE });
      gorilla.poseManaged(0.6, 0, 0, 0, i * 2.39996323, 0, false, false);
      const entry = {
        owner, cave: owner, tooltipOwner: owner, gorilla, root: gorilla.root, parts: gorilla.parts,
        health: { value: BL.crew.HEALTH_MAX * 2, max: BL.crew.HEALTH_MAX * 2 }, index: i,
        radius: WALK_RADIUS, height: 2.7, foot: FOOT, minY: 0, biped: false, compact: owner.state === "working" && gorilla.compact, footprintMode: "walk",
        active: false, tracked: false, mode: "", phase: "", route: "", entryTurn: false, site: -1, fromSite: -1, portal: -1,
        hasSlot: false, slotIndex: -1, slotX: 0, slotY: 0, slotZ: 0, goalX: 0, goalY: 0, goalZ: 0,
        random: mulberry32(fnv1a(`clanker/${owner.id || owner.traits.name || i}`)),
        heading: i * 2.39996323, speed: 0, blocked: 0, retry: 0, rest: 0, yieldFor: 0, turn: 1, portalWait: false,
        steerHeading: NaN, steerSide: 0, steerFor: 0, steerClear: 0, steerGoalX: NaN, steerGoalZ: NaN,
        lowCover: false, backoutLeft: 0, backoutHeading: 0,
        sampleTime: 0, sampleX: 0, sampleZ: 0, stuckTime: 0, portalSince: 0, portalRetry: 0,
        stuck: { time: 0, stage: 0, taskTime: 0, taskActive: false, taskX: 0, taskZ: 0, taskDistance: 0,
          replans: 0, recoveries: 0, escapes: 0, escapeLeft: 0, escapeBlocked: 0, escapeX: 0, escapeZ: 0,
          retryAt: 0, reason: "", x: NaN, y: NaN, z: NaN, workTime: 0, workCycles: 0, workReach: 0, workStage: "", workItem: -1,
          turnError: Infinity, heading: NaN, searchCursor: 0 },
        overflow: false, activity: 0, hits: 0, pounds: 0, pound: 0, poundHit: false, poundPower: 2,
        drag: { cave: null, time: 0 },
        beat: 0, beats: 0, stand: 0, parked: false, parkFor: 0, exitFootprint: false, workCycle: 0, recover: 0, lounge: "", jumps: 0,
        loungePartner: null, loungeHeading: NaN, loungeCycle: 0, loungeRoof: false, loungeDepart: false, groomTime: 0, groomWait: 0,
        planningRoam: false, planningSeat: false, roam: { path: new Float64Array(12), count: 0, index: 0, wall: false, level: 0, reverseStart: false, departHeading: 0,
          targetX: NaN, targetY: NaN, targetZ: NaN, order: 0, waitUntil: 0, blocked: 0, obstacle: null, waitPeer: null, waitX: 0, waitZ: 0,
          plans: 0, arrived: false, pose: "", lastPose: "", transition: 0, nextChoice: 0, failedChoices: 0,
          departPending: false, departAt: 0, departX: 0, departY: 0, departZ: 0, riseAdmitted: false,
          wallFailedX: NaN, wallFailedZ: NaN, wallFailedUntil: 0,
          levelOnlyUntil: 0, planAt: 0, progressTime: 0, progressX: NaN, progressZ: NaN, progressDistance: Infinity, progressTurn: Infinity, progressCursor: -1, progressClaim: 0, backoutX: NaN, backoutZ: NaN, alignTime: 0, failedX: NaN, failedZ: NaN, failedUntil: 0 },
        controlled: false, pendingSite: -1, actionControlled: false,
        planningLab: false, planningLabWork: "", planningLabSide: 1, lab: { station: -1, time: 0, arrived: false, cycles: 0,
          item: -1, pickup: -1, bench: -1, pickupPoint: { x: 0, y: 0, z: 0, heading: 0, side: 1 },
          stage: "", reach: 0, yielding: 0, yieldStation: -1, yieldSide: 1, yieldUntil: 0, yieldFor: null, yieldDX: 0, yieldDZ: 0,
          yieldAlong: 0, yieldChoice: 0, yieldReady: false, yieldTargetX: 0, yieldTargetZ: 0,
          yieldProgressX: 0, yieldProgressZ: 0, yieldProgressAt: 0, yieldPoint: { x: 0, y: 0, z: 0, heading: 0 },
          squeezeUntil: 0, waitOrder: 0, coordinationUntil: 0, path: new Float64Array(16 * 3), pathFacings: new Float64Array(16), pathWaits: new Float64Array(16), plans: 0, readyAt: 0, targetHeading: 0, trafficWait: 0, pathPending: false, pathPartial: false, pathFixed: false, pathHeading: 0, pathCount: 0, pathIndex: 0, pathAt: 0, targetX: NaN, targetY: NaN, targetZ: NaN },
        drive: { x: 0, z: 0, climbAxis: 0, heading: NaN, climbExitHeading: NaN, climbExitLook: NaN,
          run: false, jumpHeld: false, jumpDown: false, jumpArmed: false,
          cancelled: false, charge: 0, vx: 0, vy: 0, vz: 0, airborne: false, passiveFall: false, grounded: true, resume: false, motionRecover: 0, motionEnvelope: false },
        motion: { charge: 0, poundCharge: 0, takeoff: 0, landing: 0, supportOffset: 0, roll: 0, rollAngle: 0, smash: false, dragging: false,
          climb: 0, climbBlend: NaN, climbStride: 0, climbDirection: 0, mantle: 0, groom: 0, groomSide: 1, groomPhase: 0,
          lab: false, labWork: "", labPhase: i * 0.71, labSide: 1, labDt: 1 / 30, labReach: 0, labGripY: 0.53105, labSqueeze: false,
          labDie: false, labRoll: 0, labBench: null },
        climb: { active: false, requested: 0, requestHeading: 0, requestUntil: 0, action: 0, actionAt: -Infinity,
          actionX: 0, actionY: 0, actionZ: 0, actionHeading: 0, autoDirection: -1, descending: false, progress: 0, length: 0, lowerY: 0, upperY: 0, climbs: 0,
          count: 0, index: 0, heading: 0, topHeading: 0, exitHeading: 0, fromTop: false, basePrepEnd: 0, lowerGroundDistance: 0, bottomTurn: 0, mount: 0, finish: 0, retry: 0, blocked: 0, mantleStart: 0, mantleRiseEnd: 0, autoTo: -1, waitRelease: false, lowerExit: true, minimum: 0, attempts: 0, failure: "", blockX: 0, blockY: 0, blockZ: 0,
          searchPending: false, searchDeferred: false, searchCursor: 0, searchIndex: 0, searchBudget: 0,
          searchX: 0, searchY: 0, searchZ: 0, searchHeading: 0, searchDescending: false,
          searchGoalX: 0, searchGoalY: 0, searchGoalZ: 0,
          claimPending: false, crestPending: false, claimOrder: 0, claimFor: -1, claimOwnerOrder: 0, claimProgress: 0, claimProgressAt: 0, claimRetreat: false,
          returning: false, reversals: 0, holdPose: false,
          peerCheck: false, peerX: 0, peerY: 0, peerZ: 0, peerHeading: 0,
          points: new Float64Array(CLIMB_POINTS * 3), lengths: new Float64Array(CLIMB_POINTS) },
        fire: { burning: false, age: 0, heat: 0, rolling: false, rollTime: 0, soot: 0, cooldown: 0,
          reaction: 0, rollRecover: 0, x: 0, z: 0, heading: 0, requested: false, retry: 0,
          escaping: false, escapeRetry: 0, escapeX: 0, escapeY: 0, escapeZ: 0 },
        fireFX: { next: 0 },
        jump: { active: false, progress: 0, reverse: false, blocked: 0, duration: 0, fromX: 0, fromY: 0, fromZ: 0,
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
      if (e.motion.lab && e.lab.item >= 0) { e.pendingSite = index; return; }
      beginTravel(e, index);
    };
    const jumpPoint = (jump, t, out) => {
      out.x = jump.fromX + (jump.toX - jump.fromX) * t;
      out.y = jump.fromY + (jump.toY - jump.fromY) * t + jump.lift * 4 * t * (1 - t);
      out.z = jump.fromZ + (jump.toZ - jump.fromZ) * t;
    };
    const prepareJump = (e, x, y, z, lift = 0, vault = false) => {
      if (e.lowCover || e.motion.lab && !e.controlled) return false;
      const p = e.root.position, jump = e.jump, distance = Math.hypot(x - p.x, z - p.z);
      if (distance > MAX_JUMP || y > p.y + 1.7 || y < p.y - 7.5 || !landing(x, y, z)
        || e.phase === "work" && caveAt(x, y, z, AIR_RADIUS) !== e.site) return false;
      const previousRadius = e.radius, previousHeight = e.height, previousCompact = e.compact;
      e.compact = false;
      // Use the same measured envelope that poseEntry retains throughout flight.
      e.radius = Math.max(MOTION_RADIUS, previousRadius); e.height = Math.max(MOTION_HEIGHT, previousHeight);
      if (occupied(e, p.x, p.y, p.z) || !staticClear(e, p.x, p.y, p.z) || occupied(e, x, y, z)) {
        e.radius = previousRadius; e.height = previousHeight; e.compact = previousCompact; return false;
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
          || occupied(e, POINT.x, POINT.y, POINT.z)) { e.radius = previousRadius; e.height = previousHeight; e.compact = previousCompact; return false; }
        points[j] = POINT.x; points[j + 1] = POINT.y; points[j + 2] = POINT.z;
      }
      jump.active = true; jump.progress = 0; jump.reverse = false; jump.blocked = 0; e.jumps++;
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
      if (!moved) {
        e.speed = 0; jump.blocked += dt;
        if (jump.blocked >= 0.4) {
          // A moving neighbour can close both directions of an authored arc.
          // Release that arc into the same swept gravity/landing controller as
          // a player jump instead of suspending the clanker in midair forever.
          const d = e.drive;
          d.vx = d.vz = 0;
          d.vy = Math.min(0, ((jump.toY - jump.fromY) + jump.lift * 4 * (1 - jump.progress * 2)) / jump.duration);
          d.airborne = d.resume = d.motionEnvelope = true; d.passiveFall = d.grounded = false; d.motionRecover = 0.6;
          jump.active = false; e.motion.takeoff = 0;
        }
        return;
      }
      jump.blocked = 0;
      p.x = POINT.x; p.y = POINT.y; p.z = POINT.z; jump.progress = next;
      e.speed = Math.hypot(jump.toX - jump.fromX, jump.toZ - jump.fromZ) / jump.duration;
      if (next === 1 || next === 0 && jump.reverse) {
        jump.active = false; e.blocked = 0; e.rest = Math.max(e.rest, 0.12);
      }
    };
    // One bounded, reversible wall route per gorilla. Endpoints reserve a full
    // walking body; the upright climb reserves the measured hand/foot envelope.
    const CLIMB_HAND_X = [-0.65, -0.35, -0.15, 0.15, 0.35, 0.65];
    let climbClaimSerial = 0;
    const climbTransitionPeers = (e, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
      const c = e.climb;
      if (c.peerCheck) {
        c.peerCheck = false;
        const p = e.root.position;
        if (ctx.climbPeersClear && !ctx.climbPeersClear(e, c.peerX, c.peerY, c.peerZ,
          p.x, p.y, p.z, c.peerHeading, e.root.rotation.y, true)) return false;
      }
      return !ctx.climbTransitionClear || ctx.climbTransitionClear(e, x, y, z, nx, ny, nz,
        radius, height, actors, riders, toRadius, toHeight, !ctx.climbPeersClear);
    };
    const climbPoseClear = (e, dt, x, y, z, heading, motion, speed = 0) => {
      const c = e.climb, p = e.root.position;
      c.peerX = p.x; c.peerY = p.y; c.peerZ = p.z; c.peerHeading = e.heading;
      c.peerCheck = true;
      const fits = e.gorilla.climbPoseClear(dt, x, y, z, heading, motion, ctx.solidAt,
        climbTransitionPeers, e, speed);
      c.peerCheck = false;
      return fits;
    };
    const climbClear = (e, x, y, z, nx = x, ny = y, nz = z, heading = e.climb.active ? e.climb.heading : e.heading, actors = true) => {
      if (ctx.climbRidersClear && !ctx.climbRidersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      if (actors && ctx.climbPeersClear && !ctx.climbPeersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      const sine = Math.sin(heading), cosine = Math.cos(heading);
      // The forward knuckles/toes use a shallow row of circles; enclosing the
      // entire spread grip in one cylinder would hold the chest far off the wall.
      for (let i = -1; i < CLIMB_HAND_X.length; i++) {
        const side = i < 0 ? 0 : CLIMB_HAND_X[i], front = i < 0 ? -0.12 : 0.48, radius = i < 0 ? 0.85 : 0.36;
        const dx = cosine * side + sine * front, dz = -sine * side + cosine * front;
        if (!(ctx.climbClear ? ctx.climbClear(e, x + dx, y, z + dz, nx + dx, ny, nz + dz, radius, CLIMB_HEIGHT, false, actors, !ctx.climbPeersClear)
          : clear(x + dx, y, z + dz, nx + dx, ny, nz + dz, radius, CLIMB_HEIGHT, e))) return false;
      }
      return true;
    };
    const climbWalkClear = (e, x, y, z, nx, ny, nz, heading, actors = true) => {
      if (ctx.climbRidersClear && !ctx.climbRidersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      if (actors && ctx.climbPeersClear && !ctx.climbPeersClear(e, x, y, z, nx, ny, nz, heading, heading)) return false;
      const sx = Math.sin(heading), sz = Math.cos(heading);
      for (let i = 0; i < 3; i++) {
        const offset = 0.05 + i * 0.775;
        if (!(ctx.climbClear ? ctx.climbClear(e, x + sx * offset, y, z + sz * offset,
          nx + sx * offset, ny, nz + sz * offset, 0.88, CLIMB_HEIGHT, false, actors, !ctx.climbPeersClear)
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
    const CLIMB_GROUND_POINT = { x: 0, y: 0, z: 0 };
    const climbGroundPoint = (c, end) => {
      const index = c.index;
      climbPoint(c, end === 2 ? c.length : end === 1 ? c.lowerGroundDistance : c.basePrepEnd, CLIMB_GROUND_POINT);
      c.index = index;
      return CLIMB_GROUND_POINT;
    };
    const climbClaimOccupied = (e, x, y, z, heading, owner) => {
      const c = owner.climb;
      if (!c.active) return false;
      const planning = owner.planningRoam, height = owner.height;
      // A wall grip has a smaller trunk footprint than its grounded finish.
      // Keep both supported ends free in case a temporary obstacle requires
      // returning to the original footing; arms still share peer space.
      owner.planningRoam = true; owner.height = WALK_HEIGHT;
      try {
        for (let end = c.lowerExit ? 0 : 2; end < 3; end++) {
          const p = climbGroundPoint(c, end), facing = end === 2 ? c.topHeading : c.heading + Math.PI;
          if (torso.overlaps(e, x, y, z, heading, owner, p.x, p.y, p.z, facing, SPACE)) return true;
        }
        return false;
      } finally { owner.planningRoam = planning; owner.height = height; }
    };
    const climbGroundPeersClear = (e) => {
      if (!ctx.climbPeersClear) return true;
      const c = e.climb, planning = e.planningRoam, height = e.height;
      e.planningRoam = true; e.height = WALK_HEIGHT;
      try {
        for (let end = c.lowerExit ? 0 : 2; end < 3; end++) {
          const p = climbGroundPoint(c, end), facing = end === 2 ? c.topHeading : c.heading + Math.PI;
          if (!ctx.climbPeersClear(e, p.x, p.y, p.z, p.x, p.y, p.z, facing, facing, true)) return false;
        }
        return true;
      } finally { e.planningRoam = planning; e.height = height; }
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
    const plannedTurnMotion = { climb: 1, climbBlend: 1, mantle: 0, climbStride: 0, climbDirection: 0 };
    const plannedTurnClear = ctx.climbTransitionClear ? (e, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) =>
      ctx.climbTransitionClear(e, x, y, z, nx, ny, nz, radius, height, false, false, toRadius, toHeight) : null;
    const bottomTurnClear = (e, x, y, z, heading) => {
      // A safe upright footfall can still leave the lowered shoulders inside a
      // diagonal rock corner. Reserve the complete grounded turn before using
      // that footfall as the end of a descent, not after the gorilla reaches it.
      plannedTurnMotion.climbDirection = 0;
      plannedTurnMotion.climbStride = e.motion.climbStride + y - e.root.position.y;
      for (let i = 0; i <= 16; i++) {
        const turn = i / 16;
        let blend = 1 - turn * turn * (3 - 2 * turn), clear = false;
        // Match the controller's hand release: stay taller while rotating past
        // a projecting corner, then lower the knuckles on the clear way out.
        for (;;) {
          plannedTurnMotion.climbBlend = blend; plannedTurnMotion.mantle = 0;
          if (e.gorilla.climbPoseClear(2, x, y, z, heading + Math.PI * turn, plannedTurnMotion,
            ctx.solidAt, plannedTurnClear, e, 0, true)) { clear = true; break; }
          if (blend >= 1 || i === 16) break;
          blend = Math.min(1, blend + 0.12);
        }
        if (!clear) return false;
      }
      return true;
    };
    const climbCrestClear = (e) => {
      const c = e.climb, p = e.root.position, savedIndex = c.index;
      const length = c.length - c.mantleStart;
      const samples = Math.min(40, Math.max(4, Math.ceil(length / 0.25)));
      let fits = true, facing = c.descending ? c.topHeading : c.heading;
      for (let i = 0; i <= samples; i++) {
        const distance = c.mantleStart + length * (c.descending ? 1 - i / samples : i / samples);
        climbPoint(c, distance, POINT);
        const top = distance < c.mantleRiseEnd
          ? 0.65 * (distance - c.mantleStart) / Math.max(0.01, c.mantleRiseEnd - c.mantleStart)
          : 0.65 + 0.35 * (distance - c.mantleRiseEnd) / Math.max(0.1, c.length - c.mantleRiseEnd);
        const turn = Math.atan2(Math.sin(c.topHeading - c.heading), Math.cos(c.topHeading - c.heading));
        plannedTurnMotion.climbBlend = 1 - top * top * (3 - 2 * top);
        plannedTurnMotion.mantle = top;
        plannedTurnMotion.climbStride = e.motion.climbStride + POINT.y - p.y;
        plannedTurnMotion.climbDirection = c.descending ? -1 : 1;
        const heading = c.heading + turn * top;
        if (e.gorilla.climbPoseClear(2, POINT.x, POINT.y, POINT.z, heading,
          plannedTurnMotion, ctx.solidAt, plannedTurnClear, e, 0, true)) facing = heading;
        // Runtime can retain the last clear yaw while folding past an uneven
        // lip. Prove that same pose in travel order, including descent.
        else if (!e.gorilla.climbPoseClear(2, POINT.x, POINT.y, POINT.z, facing,
          plannedTurnMotion, ctx.solidAt, plannedTurnClear, e, 0, true)) {
          c.blockX = POINT.x; c.blockY = POINT.y; c.blockZ = POINT.z; fits = false; break;
        }
      }
      c.index = savedIndex;
      return fits;
    };
    const climbPointDistance2 = (x, z, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
      const t = length ? clamp(((x - ax) * dx + (z - az) * dz) / length, 0, 1) : 0;
      return (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
    };
    const climbRoutesOverlap = (a, b) => {
      for (let i = 1; i < a.count; i++) for (let j = 1; j < b.count; j++) {
        const ai = i * 3, bi = j * 3, ap = a.points, bp = b.points;
        if (Math.min(ap[ai - 2], ap[ai + 1]) > Math.max(bp[bi - 2], bp[bi + 1]) + CLIMB_HEIGHT
          || Math.min(bp[bi - 2], bp[bi + 1]) > Math.max(ap[ai - 2], ap[ai + 1]) + CLIMB_HEIGHT) continue;
        const ax = ap[ai - 3], az = ap[ai - 1], bx = ap[ai], bz = ap[ai + 2];
        const cx = bp[bi - 3], cz = bp[bi - 1], dx = bp[bi], dz = bp[bi + 2];
        // The wall lane uses the trunks; either grounded end also needs room
        // for the two torso centres of the four-footed arrival/departure.
        const gap = i === 1 || i + 1 === a.count || j === 1 || j + 1 === b.count ? 2.5 : 1.3;
        if (Math.min(ax, bx) > Math.max(cx, dx) + gap || Math.max(ax, bx) < Math.min(cx, dx) - gap
          || Math.min(az, bz) > Math.max(cz, dz) + gap || Math.max(az, bz) < Math.min(cz, dz) - gap) continue;
        const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, cross = ux * vz - uz * vx;
        if (Math.abs(cross) > 1e-8) {
          const t = ((cx - ax) * vz - (cz - az) * vx) / cross;
          const u = ((cx - ax) * uz - (cz - az) * ux) / cross;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
        }
        if (Math.min(climbPointDistance2(ax, az, cx, cz, dx, dz), climbPointDistance2(bx, bz, cx, cz, dx, dz),
          climbPointDistance2(cx, cz, ax, az, bx, bz), climbPointDistance2(dx, dz, ax, az, bx, bz)) < gap * gap) return true;
      }
      return false;
    };
    const admitClimb = (e) => {
      const c = e.climb;
      if (c.crestPending) {
        if (!climbFrameBudget) { c.searchPending = c.searchDeferred = true; c.retry = 0.03; return false; }
        // Mesh admission is the last expensive part of this outer update.
        // A second failed route must not share a frame with the full crest.
        climbFrameBudget = 0; c.crestPending = false;
        if (!climbCrestClear(e)) { c.claimPending = false; return false; }
      }
      for (const other of list) {
        const o = other.climb;
        if (other === e || !other.active || !o.active && (!o.claimPending || !o.searchPending || o.claimOrder >= c.claimOrder)) continue;
        if (!(c.claimFor === other.index && c.claimOwnerOrder === o.claimOrder) && !climbRoutesOverlap(c, o)) continue;
        if (c.claimFor !== other.index || Math.abs(c.claimProgress - o.progress) >= 0.05) {
          c.claimFor = other.index; c.claimProgress = o.progress; c.claimProgressAt = elapsed;
        }
        c.claimOwnerOrder = o.claimOrder;
        c.claimPending = c.searchPending = c.searchDeferred = true; c.retry = 0.03;
        // Do not wait on the owner's landing. Ordinary supported backout
        // clears it before another approach; an airborne actor never yields.
        const p = e.root.position;
        c.claimRetreat = false;
        if (!e.controlled && o.active) for (let i = 1; i < o.count; i++) {
          const at = i * 3;
          if (p.y > Math.max(o.points[at - 2], o.points[at + 1]) + CLIMB_HEIGHT
            || p.y + e.height < Math.min(o.points[at - 2], o.points[at + 1])) continue;
          if (climbPointDistance2(p.x, p.z, o.points[at - 3], o.points[at - 1], o.points[at], o.points[at + 2]) < 1.4 ** 2) {
            c.claimRetreat = true; break;
          }
        }
        return false;
      }
      if (!climbGroundPeersClear(e)) { c.failure = "landing occupied"; c.claimPending = false; return false; }
      c.claimPending = false; c.claimFor = -1; c.claimRetreat = false;
      c.mount = 0; c.finish = c.blocked = c.bottomTurn = 0; c.active = true; c.climbs++; c.failure = "";
      c.returning = c.holdPose = false; c.reversals = 0;
      c.waitRelease = c.descending && e.controlled && e.drive.climbAxis > 0;
      c.autoTo = c.descending ? Math.max(0, c.mantleStart - 0.8) : c.requested > 0 ? Math.min(c.length, c.lowerGroundDistance + 0.45) : -1;
      c.autoDirection = c.descending ? -1 : 1; c.requested = 0;
      e.drive.airborne = e.drive.passiveFall = false; e.drive.grounded = false; e.drive.vx = e.drive.vy = e.drive.vz = e.drive.charge = 0;
      e.drive.jumpArmed = false; e.motion.charge = e.motion.groom = 0;
      e.motion.climb = 1; e.motion.climbBlend = 0; e.motion.mantle = 1;
      e.drive.climbExitHeading = e.drive.climbExitLook = NaN;
      e.lounge = ""; if (e.controlled) e.loungePartner = null;
      if (e.drag.cave && ctx.onReleaseDrag) ctx.onReleaseDrag(e);
      e.speed = 0; e.biped = false;
      releasePortal(e);
      return true;
    };
    const buildClimb = (e, lx, ly, lz, ux, uy, uz, heading, descending, lowerExit = true) => {
      const c = e.climb, sx = Math.sin(heading), sz = Math.cos(heading), p = e.root.position;
      c.claimPending = c.crestPending = false;
      c.claimFor = -1; c.claimOwnerOrder = 0;
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
          if (climbSolidAt(lx + sx * d, ly + 0.9, lz + sz * d)) { shortApproach = true; break; }
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
      if (count < 2 || count * 2 + 11 > CLIMB_POINTS) return false;
      let lastX = lx, lastZ = lz;
      for (let i = 0; i <= count; i++) {
        const y = ly + (riseY - ly) * i / count;
        let wall = Infinity;
        // Sample the lowest protrusion over the whole upright body, rather
        // than letting a hand or the forehead disappear into a rock shelf.
        for (let h = 0; h < 13; h++) for (let side = -1; side <= 1; side++) for (let d = 0.08; d <= reach; d += 0.12) {
          if (climbSolidAt(lx + sx * d + sz * side * CLIMB_RADIUS, y + 0.04 + h * 0.25,
            lz + sz * d - sx * side * CLIMB_RADIUS)) {
            let low = Math.max(0, d - 0.12), high = d;
            for (let refine = 0; refine < 3; refine++) {
              const middle = (low + high) * 0.5;
              if (climbSolidAt(lx + sx * middle + sz * side * CLIMB_RADIUS, y + 0.04 + h * 0.25,
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
        for (let retreat = i ? 0 : 0.4; retreat <= (i ? 0.72 : 1.6); retreat += 0.12) {
          const nx = x - sx * retreat, nz = z - sz * retreat;
          if (!i && lowerExit && !bottomTurnClear(e, nx, y, nz, heading)) continue;
          if (appendClimbPoint(e, nx, y, nz)) { x = nx; z = nz; placed = true; break; }
        }
        if (!placed) return false;
        if (!i) c.lowerGroundDistance = c.length;
        lastX = x; lastZ = z;
      }
      c.failure = "mantle"; c.mantleStart = c.length;
      const topDX = ux - lastX, topDZ = uz - lastZ, topRun = Math.hypot(topDX, topDZ);
      const inward = Math.min(1.05, topRun * 0.65);
      const pullX = topRun ? topDX / topRun * inward : 0, pullZ = topRun ? topDZ / topRun * inward : 0;
      // Roll over the lip on one continuous quarter curve: begin vertically,
      // pull the hips inward while rising, and finish moving horizontally on
      // all fours. More samples keep the root direction continuous enough that
      // the planted hands do not appear to kink around the voxel edge.
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, rise = (uy - riseY) * (2 * t - t * t);
        if (!appendClimbPoint(e, lastX + pullX * t * t, riseY + rise, lastZ + pullZ * t * t, true)) return false;
      }
      lastX += pullX; lastZ += pullZ;
      c.mantleRiseEnd = c.length;
      if (!descending && !climbWalkClear(e, lastX, uy, lastZ, ux, uy, uz, topHeading, false)) return false;
      if (!appendClimbPoint(e, ux, uy, uz, true)) return false;
      c.minimum = lowerExit ? 0 : c.lengths[1];
      c.lowerY = ly; c.upperY = uy; c.heading = heading; c.lowerExit = lowerExit;
      c.topHeading = topHeading; c.fromTop = descending; c.exitHeading = heading;
      c.progress = descending ? c.length : 0; c.descending = descending;
      c.failure = "crest pose";
      c.claimPending = c.crestPending = true; c.claimOrder = ++climbClaimSerial;
      return admitClimb(e);
    };
    const pendingClimbSearch = (e) => {
      const c = e.climb;
      if (!c.searchPending) return false;
      const p = e.root.position, d = e.drive;
      const requested = c.requested && e.controlled && elapsed < c.requestUntil;
      const dx = requested ? Math.sin(c.requestHeading) : e.controlled ? d.x : e.goalX - p.x;
      const dz = requested ? Math.cos(c.requestHeading) : e.controlled ? d.z : e.goalZ - p.z;
      const heading = Math.atan2(dx, dz);
      if (!e.active || c.active || e.lowCover || !e.controlled && (!alive(e.owner) || e.mode !== e.owner.state)
        || e.recover > 0 || e.jump.active || d.airborne || d.jumpArmed || e.pound || e.beat || e.stand || e.parked || e.fire.rolling
        || Math.hypot(dx, dz) <= (e.controlled ? 0.05 : 0.18)
        || Math.hypot(p.x - c.searchX, p.y - c.searchY, p.z - c.searchZ) > 0.35
        || Math.abs(Math.atan2(Math.sin(heading - c.searchHeading), Math.cos(heading - c.searchHeading))) > 0.18
        || !e.controlled && Math.hypot(e.goalX - c.searchGoalX, e.goalY - c.searchGoalY, e.goalZ - c.searchGoalZ) > 0.35
        || !requested && caveAt(p.x, p.y, p.z) >= 0 || !e.controlled && (e.route === "exit" && e.fromSite >= 0 || e.route === "enter" || e.route === "apron")) {
        c.searchPending = c.searchDeferred = c.claimPending = c.crestPending = c.claimRetreat = false;
        c.claimOrder = 0; c.claimFor = -1; c.searchCursor = 0; c.retry = 0;
        if (climbTurn === e.index) climbTurn = -1;
        return false;
      }
      return true;
    };
    const holdClimbSearch = (e) => {
      if (!pendingClimbSearch(e)) return false;
      if (e.climb.claimPending && e.climb.claimRetreat) {
        const c = e.climb;
        c.claimPending = c.crestPending = c.searchPending = c.searchDeferred = false; c.claimOrder = 0; c.claimFor = -1; c.retry = 0.8;
        // The waiting torso occupies the admitted climber's landing. Use the
        // existing swept ground backout instead of blocking it or teleporting.
        backOut(e, e.motion.labDt || 1 / 30, true);
        return true;
      }
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
      if (!climbSolidAt || !climbSurfaceAt || e.climb.active || e.climb.retry > 0 || e.jump.active || e.drive.airborne
        || e.drive.jumpArmed || e.fire.rolling || e.pound || e.beat || e.recover > 0 || e.parked) return false;
      const p = e.root.position, sx = Math.sin(heading), sz = Math.cos(heading);
      e.climb.retry = 0.6; e.climb.failure = "search";
      if (descending) {
        let edge = NaN;
        for (let d = 0.35; d <= 3.1; d += 0.25) {
          if (climbSurfaceAt(p.x + sx * d, p.z + sz * d) < p.y - 0.8) { edge = d; break; }
        }
        if (!Number.isFinite(edge)) return false;
        for (let n = 0; n < 7; n++) for (let d = edge + 1.8; d <= edge + 6; d += 0.6) {
          const side = n ? Math.ceil(n / 2) * 0.75 * (n % 2 ? 1 : -1) : 0;
          const x = p.x + sx * d + sz * side, z = p.z + sz * d - sx * side, y = climbSurfaceAt(x, z);
          if (!landing(x, y, z) || y > p.y - 0.8 || y < p.y - 16
            || !climbWalkClear(e, x, y, z, x, y, z, heading + Math.PI, false)) continue;
          if (attemptClimb(e, x, y, z, p.x, p.y, p.z, heading + Math.PI, true)) return true;
          if (e.climb.searchDeferred) return false;
        }
      } else {
        let wall = NaN;
        for (let d = 0.25; d <= 4.5; d += 0.2) {
          if (climbSolidAt(p.x + sx * d, p.y + 0.9, p.z + sz * d)) { wall = d; break; }
        }
        if (!Number.isFinite(wall)) return false;
        // A distant stair tread also intersects a chest-height ray. Walk
        // those small steps normally; grips are for an actual cliff riser.
        let previousY = p.y, cliff = false;
        for (let d = 0.2; d <= wall + 0.6; d += 0.2) {
          const y = climbSurfaceAt(p.x + sx * d, p.z + sz * d);
          if (y > previousY + STEP) { cliff = true; break; }
          previousY = y;
        }
        if (!cliff) return false;
        e.climb.failure = "landing";
        for (let n = 0; n < 7; n++) for (let d = wall + 1.5; d <= wall + 6; d += 0.6) {
          // A voxel crest can slope sideways. Pull over onto the nearest
          // complete foothold rather than insisting on an unsafe half ledge.
          const side = n ? Math.ceil(n / 2) * 0.75 * (n % 2 ? 1 : -1) : 0;
          const x = p.x + sx * d + sz * side, z = p.z + sz * d - sx * side, y = climbSurfaceAt(x, z);
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
      if (c.claimPending && c.searchDescending === descending && pendingClimbSearch(e)) {
        if (!admitClimb(e)) return false;
        c.searchPending = c.searchDeferred = false;
        if (climbTurn === e.index) climbTurn = -1;
        return true;
      }
      if (!c.searchPending || c.searchDescending !== descending
        || Math.hypot(p.x - c.searchX, p.y - c.searchY, p.z - c.searchZ) > 0.35
        || Math.abs(Math.atan2(Math.sin(heading - c.searchHeading), Math.cos(heading - c.searchHeading))) > 0.18) {
        c.searchPending = c.claimPending = c.crestPending = false; c.searchCursor = 0; c.searchX = p.x; c.searchY = p.y; c.searchZ = p.z;
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
      if (descending && climbSolidAt && climbSurfaceAt) {
        // Autonomous walks need a supported destination. A bottomless wall
        // is an exploration choice for the player, not a useful chill route.
        if (!e.controlled) {
          c.searchPending = false;
          if (climbTurn === e.index) climbTurn = -1;
          if (e.phase === "chill") { restAfterClimb(e); return true; }
          return false;
        }
        // The player may descend without a known floor. Reserve the longest
        // available section of wall and retain a grip at its lower end.
        const sx = Math.sin(heading), sz = Math.cos(heading);
        for (let edge = 0.35; edge <= 3.1; edge += 0.25) {
          if (climbSurfaceAt(p.x + sx * edge, p.z + sz * edge) >= p.y - 0.8) continue;
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
      // A rejected translation may still allow the feet to settle safely
      // before the next step. Prove that stationary articulation too; blindly
      // damping the old target can otherwise push a hand into the lip.
      const p = e.root.position;
      c.holdPose = !climbPoseClear(e, dt, p.x, p.y, p.z, e.heading, e.motion);
      c.blocked += dt;
      if (!e.controlled && c.blocked > 1.2 && !c.returning) {
        // A temporary obstruction cancels the trip once. Follow the already
        // checked route back to its reserved source, rather than bouncing
        // forever between two blocked heights and resetting the stall timer.
        c.returning = true; c.reversals++;
        c.descending = !c.fromTop; c.autoTo = -1; c.blocked = 0; e.drive.resume = true;
      }
    };
    const updateClimb = (e, dt) => {
      const c = e.climb, d = e.drive, m = e.motion, p = e.root.position;
      c.holdPose = false;
      e.speed = 0; e.compact = false;
      e.radius = Math.max(CLIMB_RADIUS, e.gorilla.bodyRadius + 0.015); e.height = Math.max(CLIMB_HEIGHT, e.gorilla.bodyHeight + 0.015);
      e.footprintMode = "pound";
      m.climb = 1; m.climbDirection = 0;
      if (c.waitRelease && d.climbAxis <= 0) c.waitRelease = false;
      let axis = e.controlled ? c.waitRelease ? 0 : d.climbAxis : c.descending ? -1 : 1;
      if (!e.controlled && !c.lowerExit && c.progress <= c.minimum + 0.001) {
        c.returning = true; c.descending = false; c.autoTo = -1; axis = 1;
      }
      if (c.autoTo >= 0) {
        if (c.autoDirection > 0 && d.climbAxis < 0) c.autoTo = -1;
        else if (c.autoDirection > 0 ? c.progress < c.autoTo - 0.01 : c.progress > c.autoTo + 0.01) axis = c.autoDirection > 0 ? 1 : -1;
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
        const turn = clamp(c.bottomTurn + (axis < 0 ? 1 : -1) * dt / CLIMB_TURN_TIME, 0, 1), facing = c.heading + Math.PI * turn;
        let blend = 1 - turn * turn * (3 - 2 * turn);
        m.climbBlend = blend; m.mantle = 0;
        while (!climbPoseClear(e, dt, p.x, p.y, p.z, facing, m) && blend < 1) {
          blend = Math.min(1, blend + 0.12); m.climbBlend = blend;
        }
        if (climbPoseClear(e, dt, p.x, p.y, p.z, facing, m)
          && (!ctx.climbRidersClear || ctx.climbRidersClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, facing))) {
          e.heading = facing; c.bottomTurn = turn; c.blocked = 0;
        } else {
          m.climbBlend = oldBlend; m.mantle = oldMantle; climbBlocked(e, dt);
        }
        return;
      }
      if (!axis) {
        c.holdPose = !climbPoseClear(e, dt, p.x, p.y, p.z, e.heading, m);
        return;
      }
      // Ground handoffs and the rounded crest are deliberate but brisk. The
      // wall keeps a readable climbing cadence without making either end drag.
      const phaseAt = c.progress + axis * dt * CLIMB_CREST_SPEED;
      const pace = c.lowerExit && phaseAt <= c.lowerGroundDistance + 0.001 ? CLIMB_APPROACH_SPEED
        : phaseAt >= c.mantleStart - 0.001 ? CLIMB_CREST_SPEED : CLIMB_SPEED;
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
          const start = Math.max(c.basePrepEnd || 0, c.lowerGroundDistance - CLIMB_MOUNT_DISTANCE);
          const approach = clamp((next - start) / Math.max(0.01, c.lowerGroundDistance - start), 0, 1);
          blend = approach * approach * (3 - 2 * approach);
        }
      }
      const oldBlend = m.climbBlend, oldMantle = m.mantle, oldStride = m.climbStride;
      // Keep the knuckle-walk gait alive while the body rises into its first
      // grips. Zeroing it at the start of this blend translated a rigid pose
      // across the last stretch of ground and made the mount look like a float.
      let speed = ground ? Math.hypot(POINT.x - p.x, POINT.z - p.z) / dt : 0;
      if ((POINT.x - p.x) * Math.sin(facing) + (POINT.z - p.z) * Math.cos(facing) < 0) speed = -speed;
      m.climbBlend = blend; m.mantle = top;
      m.climbStride += POINT.y - p.y; m.climbDirection = Math.sign(axis);
      const transition = blend < 0.999 || e.gorilla.debug.climbing < 0.999 || Math.abs(facing - e.heading) > 0.001;
      if (!transition && !climbClear(e, p.x, p.y, p.z, POINT.x, POINT.y, POINT.z)) {
        m.climbBlend = oldBlend; m.mantle = oldMantle; m.climbStride = oldStride; m.climbDirection = 0;
        climbBlocked(e, dt);
        return;
      }
      if (transition && !climbPoseClear(e, dt, POINT.x, POINT.y, POINT.z, facing, m, speed)) {
        // An uneven crest may interrupt a turn. Keep the low walking pose and
        // advance toward the open lip before continuing the pivot.
        if (!top || !climbPoseClear(e, dt, POINT.x, POINT.y, POINT.z, e.heading, m, speed)) {
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
        if (!e.controlled && e.mode === "chilling" && e.phase === "chill" && (axis > 0) === c.fromTop) restAfterClimb(e);
      }
    };
    const travelGoal = (e, dt) => {
      const p = e.root.position, site = sites[e.site];
      if (!site && e.phase !== "leave") return false;
      if (e.route === "exit") {
        const from = e.fromSite >= 0 ? sites[e.fromSite] : null;
        const along = from ? (p.x - from.mouth.x) * from.sr + (p.z - from.mouth.z) * from.cr : Infinity;
        if (from && along < 0.5 + e.radius && p.y < from.mouth.floorY + 2.7) {
          if (e.fromSite === labSite && e.motion.lab) {
            // Queued departures must also retract their workstation pose, or
            // their hands can cover the aisle needed by the portal holder.
            e.motion.labWork = ""; e.motion.labReach = 0; e.motion.labSqueeze = false;
          }
          if (!claimPortal(e, e.fromSite)) return false;
          if (e.fromSite === labSite && e.motion.lab) {
            const across = (p.x - from.mouth.x) * from.cr - (p.z - from.mouth.z) * from.sr;
            if (along < -0.6 || Math.abs(across) > 0.3) {
              sitePoint(from, 0, -0.45, POINT);
              // Route searches reuse POINT for their roadmap nodes. Keep the
              // actual exit target when asking a blocked coworker to move.
              const x = POINT.x, y = POINT.y, z = POINT.z;
              if (!labGoal(e, x, y, z, from.mouth.ry, true)) {
                requestLabPass(e, x, z);
                // A rear worker may have claimed before the front workers'
                // state changed this frame. Let the nearest leaver go first.
                releasePortal(e); return false;
              }
              if (e.blocked > 0.3) requestLabPass(e, x, z);
              return true;
            }
          }
          sitePoint(from, 0, 0.7 + e.radius, POINT);
          if (e.fromSite === labSite && e.blocked > 0.3) requestLabPass(e, POINT.x, POINT.z);
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
        if (!e.hasSlot && !reserve(e)) {
          e.overflow = true;
          if (e.site === labSite) {
            releasePortal(e); e.phase = "wait"; e.route = ""; e.retry = 1;
            waitSpot(e); return true;
          }
          return false;
        }
        e.overflow = false;
        if (site.mirrorRoom) {
          const along = (p.x - site.mouth.x) * site.sr + (p.z - site.mouth.z) * site.cr;
          if (along > -3.3) {
            // Cross straight through the mirror and establish full-body
            // clearance in the centre aisle before turning toward a room
            // slot. A diagonal turn at the plane is what exposed the head.
            sitePoint(site, 0, -3.5, POINT);
            setGoal(e, POINT.x, POINT.y, POINT.z);
            return true;
          }
        }
        // A mirror-room worker continues forward after crossing the plane.
        // Turning to face the mouth here made its head immediately poke back
        // through the mirror before it reached a reserved work slot.
        if (e.motion.lab || site.mirrorRoom) e.entryTurn = true;
        if (!e.entryTurn) {
          sitePoint(site, 0, -0.45, POINT);
          if (Math.hypot(POINT.x - p.x, POINT.z - p.z) > 0.16) {
            if (e.site === labSite && e.blocked > 0.3) requestLabPass(e, POINT.x, POINT.z);
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
        if (e.site === labSite && e.motion.lab) {
          const station = labStations[e.lab.station];
          if (!labGoal(e, e.slotX, e.slotY, e.slotZ, station ? station.heading : e.heading)) {
            requestLabPass(e, e.slotX, e.slotZ); return false;
          }
        } else setGoal(e, e.slotX, e.slotY, e.slotZ);
        if (Math.hypot(e.slotX - p.x, e.slotZ - p.z) < 0.2) {
          e.phase = "work"; e.route = ""; e.rest = 0.8 + e.random(); releasePortal(e);
        }
        return true;
      }
      return true;
    };
    const backOut = (e, dt, start = false) => {
      const p = e.root.position;
      if (start) { e.backoutHeading = e.heading; e.backoutLeft = 1.5; }
      const heading = e.backoutHeading;
      const sx = -Math.sin(heading), sz = -Math.cos(heading);
      const step = Math.min(e.backoutLeft, CHILL_SPEED * dt);
      const x = p.x + sx * step, z = p.z + sz * step, y = support(e, x, z, p.y, PROP_STEP, heading);
      if (!Number.isFinite(y) || Math.abs(y - p.y) > PROP_STEP || !landing(x, y, z)
        || occupied(e, x, y, z, true, heading)
        || !staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, heading)) {
        e.backoutLeft = 0; return false;
      }
      p.x = x; setSupportY(e, y); p.z = z; e.heading = heading; e.speed = -step / dt;
      e.backoutLeft = Math.max(e.lowCover ? 0.8 : 0, e.backoutLeft - step); e.blocked = e.stuckTime = e.sampleTime = 0;
      e.sampleX = x; e.sampleZ = z;
      return true;
    };
    const propStepClear = (e, x, y, z, nx, ny, nz, fromHeading, toHeading) => {
      if (staticClear(e, x, y, z, nx, ny, nz, fromHeading, toHeading)) return true;
      if (ny > y && (nx !== x || nz !== z)) return !occupied(e, x, ny, z, true, fromHeading)
        && staticClear(e, x, y, z, x, ny, z, fromHeading, fromHeading)
        && staticClear(e, x, ny, z, nx, ny, nz, fromHeading, toHeading);
      // The hull of a diagonal descent can cut a rounded prop's shoulder.
      // Take the same two fully swept legs as controlled movement: clear its
      // top horizontally, then lower onto the independently measured support.
      return ny < y && (nx !== x || nz !== z) && !occupied(e, nx, y, nz, true, toHeading)
        && staticClear(e, x, y, z, nx, y, nz, fromHeading, toHeading)
        && staticClear(e, nx, y, nz, nx, ny, nz, toHeading, toHeading);
    };
    const move = (e, dt, speed) => {
      if (e.recover > 0) { e.speed = 0; return; }
      if (e.backoutLeft > 0 && backOut(e, dt)) return;
      const p = e.root.position, dx = e.goalX - p.x, dz = e.goalZ - p.z, distance = Math.hypot(dx, dz);
      if (distance < (e.motion.lab ? 0.06 : 0.15)) { e.speed = damp(e.speed, 0, 12, dt); return; }
      const desired = Math.atan2(dx, dz), step = Math.min(distance, speed * dt);
      const inCave = caveAt(p.x, p.y, p.z) >= 0;
      const onProp = raisedSupport(e);
      const doorway = e.lab.yielding || e.route === "exit" && e.fromSite >= 0 || e.route === "enter" || e.route === "apron";
      if (!onProp && !e.lowCover && !inCave && !doorway && !e.climb.retry) {
        const drop = ctx.surfaceAt && ctx.surfaceAt(p.x + Math.sin(desired) * 3.1, p.z + Math.cos(desired) * 3.1) < p.y - 0.8;
        // A meadow stroll should steer around a cave instead of climbing it
        // and immediately descending again to chase its unchanged floor goal.
        if ((e.phase !== "chill" || (drop ? e.goalY < p.y - 0.55 : e.goalY > p.y + 0.55))
          && tryClimb(e, desired, !!drop)) return;
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
      if (!onProp && !e.parked && !doorway && !inCave && aheadY < p.y - 0.7 && e.retry <= 0
        && (e.phase !== "chill" || e.goalY < p.y - 0.55)) {
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
      const fullStride = e.phase === "work" || e.route === "enter" || e.route === "exit";
      let chosen = NaN, chosenFacing = e.heading, chosenMode = initialMode, chosenCompact = initialCompact;
      let best = -Infinity, chosenY = p.y, chosenStep = 0, directAhead = false, chosenAhead = false;
      for (let i = 0; i < STEERING.length; i++) {
        const heading = desired + STEERING[i] * e.turn, sx = Math.sin(heading), sz = Math.cos(heading);
        const turn = Math.atan2(Math.sin(heading - e.heading), Math.cos(heading - e.heading));
        const labStation = e.motion.lab && e.phase === "work" && !e.lab.yielding
          && e.lab.pathIndex + 1 >= e.lab.pathCount && labStations[e.lab.stage === "fetch" || e.lab.stage === "return" ? e.lab.bench : e.lab.station];
        const roomFacing = e.motion.lab ? labStation && distance < 0.8 ? labStation.heading : NaN
          : e.route === "exit" && e.fromSite >= 0 ? sites[e.fromSite].mouth.ry
          : (e.phase === "work" || e.route === "enter") && !sites[e.site].mirrorRoom
            ? sites[e.site].mouth.ry + (e.route === "enter" && !e.entryTurn ? Math.PI : 0) : NaN;
        const facingTurn = Number.isFinite(roomFacing)
          ? Math.atan2(Math.sin(roomFacing - e.heading), Math.cos(roomFacing - e.heading)) : turn;
        const facing = e.heading + clamp(facingTurn, -dt * 5, dt * 5);
        // The larger chain also covers reverse strides and the recovery
        // from a hop or chest beat. Reserve it before every working step.
        e.footprintMode = e.parked ? "stand" : e.mode === "working" || e.phase === "leave" || e.exitFootprint ? "pound" : "walk";
        e.compact = e.footprintMode === "stand" ? e.gorilla.standCompact
          : (e.mode === "working" || e.phase === "leave" || e.exitFootprint || e.phase === "chill" && (!e.lounge || Math.abs(e.speed) > 0.1))
            && (e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact);
        labEnvelope(e);
        // Turning slows the feet, but not the torso's yaw. Test that exact
        // shorter translation: scaling a cleared move afterward can swing
        // the leading knuckles into the very prop the full step avoided.
        const stride = step * (fullStride ? 1 : Math.max(0.18, Math.cos(turn)));
        const x = p.x + sx * stride, z = p.z + sz * stride;
        // Crossing inward is one-way for this work visit. Once the complete
        // body is behind the glass it cannot wander back into the portal;
        // the explicit exit route remains the only way out.
        if (!mirrorWorkClear(e, p.x, p.z, x, z)) continue;
        const y = support(e, x, z, p.y, PROP_STEP, facing);
        const propStep = onProp || Math.abs(y - groundAt(x, z, p.y)) > 0.02;
        if (onProp && y < p.y - PROP_STEP && beginSupportFall(e, x, z, facing, sx * speed, sz * speed)) return;
        if (!Number.isFinite(y) || y > p.y + PROP_STEP || y < p.y - PROP_STEP || !landing(x, y, z, e.foot)
          || e.phase === "work" && !e.lab.yielding && caveAt(x, y, z) !== e.site
          || e.parked && caveAt(x, y, z) < 0) continue;
        if (occupied(e, x, y, z, true, facing)) continue;
        if (!(propStep ? propStepClear : staticClear)(e, p.x, p.y, p.z, x, y, z, e.heading, facing)) continue;
        // Reserve the approaching arm chain before it reaches a prop, including
        // the turn it will make along that approach. Shorten the horizon on
        // stairs; their individual risers still use the ordinary step checks.
        let ahead = Math.min(distance, 0.8 + speed * 0.7), ax = p.x + sx * ahead, az = p.z + sz * ahead;
        let ay = support(e, ax, az, p.y, PROP_STEP, facing);
        if (Math.abs(ay - p.y) > PROP_STEP) {
          ahead = Math.min(0.45, distance); ax = p.x + sx * ahead; az = p.z + sz * ahead;
          ay = support(e, ax, az, p.y, PROP_STEP, facing);
        }
        const aheadTurn = Math.min(Math.PI, ahead / Math.max(0.1, speed) * 5);
        const aheadFacing = e.heading + clamp(facingTurn, -aheadTurn, aheadTurn);
        const aheadPropStep = onProp || Math.abs(ay - groundAt(ax, az, p.y)) > 0.02;
        const goodAhead = Number.isFinite(ay) && Math.abs(ay - p.y) <= PROP_STEP && landing(ax, ay, az, e.foot)
          && !occupied(e, ax, ay, az, true, aheadFacing)
          && (aheadPropStep ? propStepClear : staticClear)(e, p.x, p.y, p.z, ax, ay, az, e.heading, aheadFacing);
        if (!i) directAhead = goodAhead;
        const side = Math.sign(STEERING[i] * e.turn);
        const commitment = e.steerFor > 0 && side && e.steerSide ? side === e.steerSide ? 0.45 : -1.25 : 0;
        const score = Math.cos(heading - desired) * 2 + Math.cos(heading - e.steerHeading) * 0.5
          + (goodAhead ? 3 : 0) + commitment - i * 0.008;
        if (score > best) {
          best = score; chosen = heading; chosenFacing = facing; chosenY = y; chosenStep = stride;
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
        const smoothStep = step * (fullStride ? 1 : Math.max(0.18, Math.cos(smooth - e.heading)));
        const sx = p.x + Math.sin(smooth) * smoothStep, sz = p.z + Math.cos(smooth) * smoothStep;
        const sy = support(e, sx, sz, p.y, PROP_STEP, chosenFacing);
        const smoothPropStep = onProp || Math.abs(sy - groundAt(sx, sz, p.y)) > 0.02;
        if (Number.isFinite(sy) && sy <= p.y + PROP_STEP && sy >= p.y - PROP_STEP && landing(sx, sy, sz)
          && mirrorWorkClear(e, p.x, p.z, sx, sz)
          && (e.phase !== "work" || e.lab.yielding || caveAt(sx, sy, sz) === e.site) && (!e.parked || caveAt(sx, sy, sz) >= 0)
          && !occupied(e, sx, sy, sz, true, chosenFacing)
          && (smoothPropStep ? propStepClear : staticClear)(e, p.x, p.y, p.z, sx, sy, sz, e.heading, chosenFacing)) {
          chosen = smooth; chosenY = sy; chosenStep = smoothStep;
        }
        e.steerHeading = chosen;
        e.heading = chosenFacing;
        p.x += Math.sin(chosen) * chosenStep; setSupportY(e, chosenY); p.z += Math.cos(chosen) * chosenStep;
        e.speed = chosenStep / dt * (Math.cos(chosen - e.heading) < 0 ? -1 : 1);
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
          if (e.phase === "work" && !e.lab.yielding) {
            if (reserve(e, true)) setGoal(e, e.slotX, e.slotY, e.slotZ);
          } else if (e.phase === "chill") chooseChill(e);
          else { e.route = caveAt(p.x, p.y, p.z) >= 0 ? "exit" : "ring"; e.fromSite = caveAt(p.x, p.y, p.z); }
        }
      }
    };
    const abandonRoam = (e) => {
      const r = e.roam, p = e.root.position;
      // A rejected wall approach should lead to a nearby rest, not another
      // roof destination behind the same obstruction on the next decision.
      if (r.wall) {
        r.levelOnlyUntil = elapsed + 20;
        // Ordinary candidate failures must not replace the longer exclusion
        // for the wall that already sent this outing back to its start.
        r.wallFailedX = e.goalX; r.wallFailedZ = e.goalZ; r.wallFailedUntil = elapsed + 60;
      }
      r.failedX = e.goalX; r.failedZ = e.goalZ; r.failedUntil = elapsed + 60;
      r.count = r.index = 0; r.wall = false; r.blocked = r.progressTime = 0; r.obstacle = null;
      setGoal(e, p.x, p.y, p.z); e.rest = 0; e.speed = 0;
      r.nextChoice = elapsed + 0.2;
    };
    const moveRoam = (e, dt) => {
      const p = e.root.position, r = e.roam;
      const point = r.index * 3, tx = r.index < r.count ? r.path[point] : e.goalX;
      const tz = r.index < r.count ? r.path[point + 2] : e.goalZ;
      const distanceToPoint = Math.hypot(tx - p.x, tz - p.z);
      const desired = r.index === 0 && r.reverseStart ? r.departHeading : Math.atan2(tx - p.x, tz - p.z);
      const turnError = Math.abs(Math.atan2(Math.sin(desired - e.heading), Math.cos(desired - e.heading)));
      r.progressTime += dt;
      if (e.backoutLeft > 0 && (!Number.isFinite(r.backoutX) || Math.hypot(p.x - r.backoutX, p.z - r.backoutZ) > 0.1)) {
        // A committed, fixed-heading canopy withdrawal deliberately moves
        // away from the destination. Credit its real clearance, not its pose.
        r.backoutX = p.x; r.backoutZ = p.z; r.progressTime = 0;
      }
      const peer = r.waitPeer;
      if (peer && peer.active && elapsed < r.waitUntil + 0.25 && peer.roam.progressTime < 0.6
        && Math.hypot(peer.root.position.x - r.waitX, peer.root.position.z - r.waitZ) > 0.1) {
        // Credit the known crossing actor before testing our own deadline.
        // A brief gap between conflict samples must not erase its progress.
        r.waitX = peer.root.position.x; r.waitZ = peer.root.position.z; r.progressTime = r.blocked = 0;
      }
      // Motion in a circle is not progress. Track improvement toward the
      // retained waypoint (or its planted turn), independently of replanning.
      if (r.progressX !== tx || r.progressZ !== tz) {
        r.progressX = tx; r.progressZ = tz; r.progressDistance = distanceToPoint; r.progressTurn = turnError;
      } else if (distanceToPoint < r.progressDistance - 0.1 || turnError < r.progressTurn - 0.05) {
        r.progressDistance = distanceToPoint; r.progressTurn = turnError; r.progressTime = 0;
      }
      if (e.climb.searchCursor > r.progressCursor || e.climb.claimProgressAt > r.progressClaim) r.progressTime = 0;
      r.progressCursor = e.climb.searchCursor; r.progressClaim = e.climb.claimProgressAt;
      if (r.progressTime > 2 && !e.climb.active) {
        e.climb.searchPending = e.climb.claimPending = e.climb.crestPending = false;
        abandonRoam(e); return;
      }
      // A tall prop has a separate supported-departure/fall controller. Small
      // treads stay on the retained route; switching controllers at every
      // half-metre prop edge reverses their steps and produces vertical jitter.
      const terrainY = ctx.terrainSupportAt ? ctx.terrainSupportAt(e, p.x, p.z, p.y, STEP) : groundAt(p.x, p.z, p.y);
      if ((!r.count || r.wall) && p.y - terrainY > STEP && raisedSupport(e)) { move(e, dt, CHILL_SPEED); return; }
      if ((!r.count || r.wall) && Math.abs(e.goalY - p.y) >= 1 && !e.lowCover && caveAt(p.x, p.y, p.z) < 0) {
        const searched = e.climb.retry <= 0;
        if (tryClimb(e, Math.atan2(e.goalX - p.x, e.goalZ - p.z), e.goalY < p.y) || holdClimbSearch(e)) { e.speed = 0; return; }
        // At the retained wall approach a completed search has already
        // rejected every grip/landing. Waiting and repeating that identical
        // search cannot open a route; release this outing immediately. A
        // deferred search or a moving claimant still keeps its normal wait.
        if (searched && r.wall && (r.index >= r.count || r.index + 1 === r.count && distanceToPoint < 0.025)) { abandonRoam(e); return; }
      }
      if (e.climb.claimPending) {
        tryClimb(e, Math.atan2(e.goalX - p.x, e.goalZ - p.z), e.goalY < p.y);
        holdClimbSearch(e); e.speed = 0; return;
      }
      if (e.backoutLeft > 0 && backOut(e, dt)) return;
      if (r.targetX !== e.goalX || r.targetY !== e.goalY || r.targetZ !== e.goalZ
        || !r.count || r.wall && Math.abs(p.y - r.level) > 0.55) {
        e.speed = 0;
        if (!roamBudget) return;
        if (!planRoam(e, e.goalX, e.goalY, e.goalZ)) {
          if (e.lowCover && backOut(e, dt, true)) return;
          abandonRoam(e); return;
        }
      }
      if (r.index >= r.count) {
        e.speed = 0;
        if (!r.wall) return;
        const searched = e.climb.retry <= 0;
        if (tryClimb(e, Math.atan2(e.goalX - p.x, e.goalZ - p.z), e.goalY < p.y) || holdClimbSearch(e)) return;
        if (searched || e.lowCover) abandonRoam(e);
        return;
      }
      const at = r.index * 3, dx = r.path[at] - p.x, dz = r.path[at + 2] - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.025) { r.index++; r.blocked = 0; e.speed = 0; return; }
      const facing = r.index === 0 && r.reverseStart ? r.departHeading : Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(facing - e.heading), Math.cos(facing - e.heading));
      const heading = e.heading + clamp(turn, -dt * 3, dt * 3);
      // Rotate on supported feet, then travel forwards. A small corner blend
      // is enough; moving backwards across a clearing is never an idle route.
      const step = Math.abs(turn) > 0.15 ? 0 : Math.min(distance, CHILL_SPEED * dt);
      const x = p.x + dx / distance * step, z = p.z + dz / distance * step;
      // The route proves a planted turn followed by a supported step. A foot
      // leaving a prop during that turn must not also drop the whole body;
      // settling onto the next support belongs to the translation proof.
      const y = step > 0 ? support(e, x, z, p.y, PROP_STEP, heading) : p.y;
      let waitFor = null;
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active || other.controlled || other.phase !== "chill" || other.lounge
          || other.roam.index >= other.roam.count || other.roam.order >= r.order) continue;
        for (let t = 0.3; t <= 1.8; t += 0.3) {
          roamFuture(e, t, roamPoint);
          const px = roamPoint.x, py = roamPoint.y, pz = roamPoint.z, ph = roamPoint.heading;
          roamFuture(other, t, roamPoint);
          if ((torso || footprint).overlaps(e, px, py, pz, ph, other, roamPoint.x, roamPoint.y, roamPoint.z, roamPoint.heading, SPACE)) {
            waitFor = other; break;
          }
        }
        if (waitFor) break;
      }
      if (waitFor) {
        e.speed = 0; r.waitUntil = elapsed + 0.2; r.blocked += dt;
        const q = waitFor.root.position;
        if (r.waitPeer !== waitFor) {
          r.waitPeer = waitFor; r.waitX = q.x; r.waitZ = q.z;
        }
        if (r.blocked > 0.6 && roamBudget && elapsed >= r.planAt) {
          r.obstacle = waitFor; r.planAt = elapsed + 0.6;
          if (!planRoam(e, e.goalX, e.goalY, e.goalZ) && r.blocked > 2) abandonRoam(e);
        }
        return;
      }
      // Match roamFuture's reserved pause instead of inching into the other
      // actor's corridor whenever a single prediction sample becomes clear.
      if (elapsed < r.waitUntil) { e.speed = 0; return; }
      if (step > 0 && y < p.y - PROP_STEP && raisedSupport(e) && landing(x, y, z)
        && !occupied(e, x, y, z, true, heading) && propStepClear(e, p.x, p.y, p.z, x, y, z, e.heading, heading)
        && beginSupportFall(e, x, z, heading, 0, 0)) return;
      if (Number.isFinite(y) && Math.abs(y - p.y) <= PROP_STEP && landing(x, y, z)
        && !occupied(e, x, y, z, true, heading) && propStepClear(e, p.x, p.y, p.z, x, y, z, e.heading, heading)) {
        p.x = x; setSupportY(e, y); p.z = z; e.heading = heading;
        e.speed = step / dt * (r.index === 0 && r.reverseStart ? -1 : 1); r.blocked = 0;
      } else {
        e.speed = 0; r.blocked += dt;
        if (e.lowCover && r.blocked > 0.35 && backOut(e, dt, true)) { r.count = 0; return; }
        if (r.blocked > 0.5 && roamBudget && elapsed >= r.planAt) {
          r.obstacle = null;
          for (let i = 0; i < list.length; i++) {
            const other = list[i];
            if (other === e || !other.active || !other.root.visible) continue;
            const q = other.root.position, shape = torso || footprint;
            if (!shape.separates(e, p.x, p.y, p.z, e.heading, x, y, z, heading,
              other, q.x, q.y, q.z, other.heading, SPACE)) { r.obstacle = other; break; }
          }
          r.planAt = elapsed + 0.6;
          if (!planRoam(e, e.goalX, e.goalY, e.goalZ)) abandonRoam(e);
        }
      }
    };
    const support = (e, x, z, y, step, heading = e.heading) => ctx.supportAt ? ctx.supportAt(e, x, z, y, step, heading) : groundAt(x, z, y);
    const setSupportY = (e, y) => {
      const p = e.root.position, delta = p.y - y;
      if (Math.abs(delta) > 1e-7) e.motion.supportOffset = clamp(e.motion.supportOffset + delta, -PROP_STEP, PROP_STEP);
      p.y = y;
    };
    const raisedSupport = (e) => {
      if (!ctx.supportAt) return false;
      const p = e.root.position;
      // Compare like footprints: a riser under a knuckle is still terrain,
      // even when the root's point sample belongs to the lower tread.
      const terrain = ctx.terrainSupportAt ? ctx.terrainSupportAt(e, p.x, p.z, p.y, STEP) : groundAt(p.x, p.z, p.y);
      return p.y - terrain > 0.02;
    };
    const entryFor = (value) => value === undefined ? player : typeof value === "number" ? list[value]
      : value && value.gorilla ? value : byOwner.get(value);
    const resumeEntry = (e) => {
      e.drive.resume = false; e.hasSlot = false;
      e.roam.departPending = false;
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
      player.climb.requested = 0;
      player.climb.searchPending = player.climb.searchDeferred = player.climb.claimPending = player.climb.crestPending = false;
      player.climb.claimFor = -1; player.climb.claimOwnerOrder = player.climb.claimOrder = 0;
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
      e.roam.departPending = false;
      releaseLab(e);
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
    const climbAction = (value) => {
      const e = entryFor(value);
      if (!e || !e.active || !e.controlled || e.climb.active || e.lowCover || e.drive.airborne || e.jump.active
        || e.fire.burning || e.fire.rolling || e.pound || e.beat || e.recover > 0 || e.parked
        || !climbSolidAt || !climbSurfaceAt) return 0;
      if (e.climb.requested) return e.climb.requested;
      const p = e.root.position, d = e.drive;
      const heading = Math.hypot(d.x, d.z) > 0.05 ? Math.atan2(d.x, d.z) : Number.isFinite(d.heading) ? d.heading : e.heading;
      const sx = Math.sin(heading), sz = Math.cos(heading);
      const c = e.climb;
      if (elapsed - c.actionAt < 0.12 && Math.hypot(p.x - c.actionX, p.y - c.actionY, p.z - c.actionZ) < 0.15
        && Math.abs(Math.atan2(Math.sin(heading - c.actionHeading), Math.cos(heading - c.actionHeading))) < 0.08) return c.action;
      c.actionAt = elapsed; c.actionX = p.x; c.actionY = p.y; c.actionZ = p.z; c.actionHeading = heading;
      // Labels use only a short surface/riser probe. Building a complete route
      // happens after activation under the shared per-update search budget.
      let previousY = p.y;
      for (let distance = 0.25; distance <= 4.5; distance += 0.25) {
        const x = p.x + sx * distance, z = p.z + sz * distance, y = climbSurfaceAt(x, z);
        if (distance <= 3.1 && y < p.y - 0.8) {
          // A lower landing is optional at the island's outer wall, but a
          // grippable face is not. Reject floating/thin unsupported ledges
          // without replacing the cheap label probe with a route search.
          const lipX = p.x + sx * (distance - 0.26), lipZ = p.z + sz * (distance - 0.26), lipY = Math.min(p.y, previousY);
          // The last roof tread may sit below the supported root. Measure
          // wall thickness below that local lip, not above its stone surface.
          if (climbSolidAt(lipX, lipY - 0.25, lipZ) && climbSolidAt(lipX, lipY - 0.75, lipZ)) return c.action = -1;
        }
        if (y > previousY + STEP && climbSolidAt(x, p.y + 0.9, z)) return c.action = 1;
        previousY = y;
      }
      return c.action = 0;
    };
    const startClimb = (value) => {
      const e = entryFor(value);
      if (!e) return false;
      e.climb.actionAt = -Infinity;
      const action = climbAction(e);
      if (!action) return false;
      const d = e.drive, c = e.climb;
      if (!c.requested) {
        c.requested = action; c.requestUntil = elapsed + 5;
        c.requestHeading = Math.hypot(d.x, d.z) > 0.05 ? Math.atan2(d.x, d.z) : Number.isFinite(d.heading) ? d.heading : e.heading;
        c.searchPending = c.searchDeferred = false; c.searchCursor = 0; c.retry = 0;
      }
      d.jumpArmed = false; d.charge = e.motion.charge = 0;
      d.jumpDown = d.jumpHeld; d.cancelled = true;
      return true;
    };
    const requestedClimb = (e) => {
      const c = e.climb, d = e.drive;
      if (!c.requested) return false;
      const heading = Math.hypot(d.x, d.z) > 0.05 ? Math.atan2(d.x, d.z) : Number.isFinite(d.heading) ? d.heading : e.heading;
      if (elapsed >= c.requestUntil || !e.controlled || e.lowCover || d.airborne || e.fire.burning || e.fire.rolling
        || e.pound || e.beat || e.recover > 0 || e.parked
        || Math.abs(Math.atan2(Math.sin(heading - c.requestHeading), Math.cos(heading - c.requestHeading))) > 0.5) {
        c.requested = 0; c.searchPending = c.searchDeferred = c.claimPending = c.crestPending = false; c.retry = 0;
        c.claimFor = -1; c.claimOwnerOrder = c.claimOrder = 0;
        if (climbTurn === e.index) climbTurn = -1;
        return false;
      }
      if (c.retry > 0) { e.speed = d.vx = d.vz = 0; return true; }
      if (tryClimb(e, c.requestHeading, c.requested < 0)) return true;
      if (c.searchDeferred) { e.speed = d.vx = d.vz = 0; return true; }
      c.requested = 0;
      return false;
    };
    const fullEnvelope = (e, radius, height) => {
      const r = e.radius, h = e.height, compact = e.compact, p = e.root.position;
      e.radius = Math.max(radius, r); e.height = Math.max(height, h); e.compact = false;
      if (!occupied(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z)) return true;
      e.radius = r; e.height = h; e.compact = compact; return false;
    };
    const beginSupportFall = (e, x, z, heading, vx, vz) => {
      const p = e.root.position, floor = groundAt(x, z, p.y);
      // Props have no continuous cliff face to scale. Walk off their supported
      // top and hand the descent to ordinary gravity, never snap to the meadow
      // or reject every step merely because the ground is more than STEP away.
      if (e.parked || e.climb.active || !Number.isFinite(floor) || !landing(x, floor, z)
        || p.y - groundAt(p.x, p.z, p.y) <= STEP) return false;
      if (occupied(e, x, p.y, z, true, heading) || !staticClear(e, p.x, p.y, p.z, x, p.y, z, e.heading, heading)) return false;
      p.x = x; p.z = z; e.heading = heading;
      const d = e.drive;
      d.vx = vx; d.vz = vz; d.vy = 0; d.airborne = d.passiveFall = true; d.grounded = d.motionEnvelope = false;
      // Keep the four-footed step pose. Reserving a new round jump envelope
      // here would reach backward onto the prop and falsely regain its support.
      d.motionRecover = 0; d.resume = !e.controlled; e.lounge = ""; e.motion.takeoff = 0;
      e.climb.requested = 0; e.climb.searchPending = e.climb.searchDeferred = e.climb.claimPending = e.climb.crestPending = false;
      return true;
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
      d.grounded = d.passiveFall = false; d.airborne = true; d.motionEnvelope = true; d.motionRecover = 0.6; e.motion.takeoff = 1; e.jumps++;
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
      else if (pressed && startClimb(e)) { d.jumpArmed = false; d.charge = 0; }
      else if (pressed && !e.lowCover && d.grounded && !e.fire.rolling && !e.parked && !e.pound && !e.beat
        && fullEnvelope(e, MOTION_RADIUS, MOTION_HEIGHT)) { d.jumpArmed = true; d.motionEnvelope = true; d.charge = 0; }
      if (d.jumpHeld && d.jumpArmed && d.grounded) d.charge = Math.min(1, d.charge + dt / JUMP_CHARGE);
      if (!d.jumpHeld && d.jumpDown) {
        if (d.jumpArmed && !d.cancelled) { beginDrivenJump(e, d.charge); d.motionRecover = 0.6; }
        d.jumpArmed = false; d.charge = 0;
      }
      d.jumpDown = d.jumpHeld; m.charge = d.charge;
      if (e.fire.rolling) return;
      if (requestedClimb(e)) return;
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
      e.biped = e.parked;
      const previousCompact = e.compact, previousRadius = e.radius, previousHeight = e.height;
      e.footprintMode = e.parked ? "stand" : d.passiveFall ? e.footprintMode : "pound";
      if (!d.airborne && !d.jumpArmed) d.motionRecover = Math.max(0, d.motionRecover - dt);
      const motion = d.airborne && !d.passiveFall || d.jumpArmed || d.motionRecover > 0 || e.fire.rollRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive;
      e.compact = !motion && (e.parked ? e.gorilla.standCompact : e.footprintMode === "walk" ? e.gorilla.compact : e.gorilla.poundCompact);
      e.radius = Math.max(motion ? MOTION_RADIUS : WALK_RADIUS, e.gorilla.bodyRadius + 0.1);
      e.height = Math.max(motion ? MOTION_HEIGHT : WALK_HEIGHT, e.gorilla.bodyHeight + 0.04);
      labEnvelope(e);
      // The forward limb chain and the jump circle contain the same rig but
      // cover different spare space. Never adopt a chain through the next step.
      if (!e.lowCover && !previousCompact && e.compact && previousRadius >= e.gorilla.bodyRadius
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
      if (!e.lowCover && !d.airborne && !d.jumpArmed && amount > 0.05 && !e.climb.retry && caveAt(p.x, p.y, p.z) < 0
        && p.y - groundAt(p.x, p.z, p.y) <= STEP) {
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
        let floor = support(e, x, z, p.y, d.airborne ? 0 : PROP_STEP, facing);
        if (!d.airborne) {
          const propSupported = raisedSupport(e);
          if (!Number.isFinite(floor) || floor < p.y - (propSupported ? PROP_STEP : STEP)) {
            if (beginSupportFall(e, x, z, facing, d.vx, d.vz)) continue;
            d.vx = d.vz = 0; break;
          }
          else if (floor > p.y + PROP_STEP) { x = p.x; z = p.z; floor = p.y; }
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
        if (!valid && !d.airborne && y > p.y && y - p.y <= PROP_STEP && (!e.parked || caveAt(x, y, z) >= 0)
          && !occupied(e, p.x, y, p.z) && !occupied(e, x, y, z, true, facing)
          && staticClear(e, p.x, p.y, p.z, p.x, y, p.z)
          && staticClear(e, p.x, y, p.z, x, y, z, e.heading, facing)) valid = true;
        if (valid) {
          p.x = x;
          if (!d.airborne && !landing) setSupportY(e, y); else p.y = y;
          p.z = z; e.heading = facing;
          if (landing) {
            d.airborne = false; d.grounded = true; d.vy = 0;
            d.motionRecover = d.passiveFall ? 0 : 0.6; m.landing = d.passiveFall ? 0 : 1; d.passiveFall = false;
          }
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
            if (d.airborne) { d.motionRecover = d.passiveFall ? 0 : 0.6; m.landing = d.passiveFall ? 0 : 1; }
            d.airborne = d.passiveFall = false; d.grounded = true; d.vy = 0;
          }
        }
      }
      e.speed = Math.hypot(p.x - oldX, p.z - oldZ) / dt;
      if (e.speed > 0 && (p.x - oldX) * Math.sin(e.heading) + (p.z - oldZ) * Math.cos(e.heading) < 0) e.speed = -e.speed;
      if (!d.airborne && d.resume && !e.controlled) resumeEntry(e);
    };
    const poseEntry = (e, dt, beforeX, beforeY, beforeZ) => {
      const p = e.root.position;
      if (e.climb.active && e.climb.holdPose) return;
      syncLab(e);
      e.motion.supportOffset = damp(e.motion.supportOffset, 0, 12, dt);
      e.motion.labPhase += dt;
      if (e.lounge && Math.abs(e.speed) <= 0.1 && !ctx.restPoseClear) {
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
      if (!e.controlled && e.phase === "chill" && !e.climb.active && !e.jump.active && !e.drive.airborne && !e.fire.burning) {
        if (e.roam.lastPose !== e.lounge) { e.roam.lastPose = e.lounge; e.roam.transition = 1.2; }
        if (e.roam.transition > 0 && ctx.restPoseClear) {
          const actualLounge = e.gorilla.debug.lounge;
          // An interrupted handoff may already have cleared the logical rest
          // without changing the rig. Admit its complete rise before advancing.
          const unprovedRise = actualLounge && !e.lounge && !e.roam.riseAdmitted;
          if (unprovedRise && !ctx.restPoseClear(e, 1.2, "", false, p.x, p.y, p.z, e.heading, null, dt)
            || !ctx.restPoseClear(e, dt, e.lounge)) {
            p.x = beforeX; p.y = beforeY; p.z = beforeZ; e.heading = e.root.rotation.y;
            e.roam.riseAdmitted = false;
            if (actualLounge !== e.lounge) {
              const rising = !e.lounge && !!actualLounge;
              e.lounge = e.roam.lastPose = actualLounge; e.roam.transition = 0; e.roam.arrived = false;
              if (rising) { e.recover = 0; leaveLounge(e); }
              else e.rest = Math.min(e.rest, 1);
            }
            e.speed = 0; return;
          }
          e.roam.transition = Math.max(0, e.roam.transition - dt);
        }
      }
      e.gorilla.poseManaged(dt, p.x, p.y, p.z, e.heading, e.speed, e.jump.active || e.drive.airborne && !e.drive.passiveFall, e.biped, e.lounge, e.motion);
      e.roam.riseAdmitted = false;
      if (!e.motion.lab && e.footprintMode === "lab") {
        e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact;
      }
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
      labEnvelope(e);
      if (ctx.fireContact && ctx.fireContact(e, beforeX, beforeY, beforeZ)) ignite(e);
      if (ctx.onMove && (beforeX !== p.x || beforeY !== p.y || beforeZ !== p.z)) ctx.onMove(e, beforeX, beforeY, beforeZ, dt);
    };
    const finishLabItem = (e) => {
      const job = e.lab;
      job.item = -1; job.stage = ""; job.reach = 0; job.time = 0;
      job.arrived = false;
      if (job.yielding) { job.stage = "fetch"; return; }
      if (e.mode !== e.owner.state || e.pendingSite >= 0 && e.pendingSite !== e.site) return;
      if (yieldLabStation(e)) return;
      if (reserve(e, true)) { job.cycles++; e.workCycle++; setGoal(e, e.slotX, e.slotY, e.slotZ); }
      else job.stage = "fetch";
    };
    const workLab = (e, dt) => {
      const p = e.root.position, job = e.lab, station = labStations[job.station];
      if (station && station.enabled === false) {
        releaseLab(e); e.hasSlot = false; beginTravel(e, labSite); return;
      }
      const wasWorking = !!e.motion.labWork;
      e.motion.labWork = ""; e.motion.labReach = 0;
      if (job.item >= 0) e.motion.labSqueeze = false;
      e.motion.labDie = false; e.motion.labRoll = 0;
      if (job.stage === "roll") {
        e.speed = damp(e.speed, 0, 12, dt);
        e.motion.labWork = "roll";
        job.time -= dt;
        const item = labEquipment[job.item];
        // Keep the scientist and its claim at the bench while the real die
        // tumbles. A requested exit/yield changes this to the normal return.
        if (item && item.rolling || job.time > 0) return;
        if (ctx.labReturn && !ctx.labReturn(e)) return;
        finishLabItem(e);
        return;
      }
      if (station && station.kind === "carry" && job.item < 0 && !job.stage) job.stage = "fetch";
      let destination = station;
      if (job.stage === "fetch" || job.stage === "inspect" || job.stage === "return") {
        job.pickup = labPickupFor(e, job.station);
        const equipment = labEquipment[job.pickup];
        if (equipment) {
          job.bench = equipment.station;
          destination = labPickupPoint(labStations[job.bench], equipment, job.pickupPoint);
          e.motion.labGripY = equipment.node.geometry.labGripY || BL.scene.boundsOf(equipment.node.geometry).max[1] * 0.85;
          e.motion.labDie = equipment.kind === "die";
          e.motion.labBench = equipment.bench || null;
        } else destination = null;
      }
      if (!destination) { e.speed = 0; return; }
      e.slotX = destination.x; e.slotY = destination.y; e.slotZ = destination.z;
      const distance = Math.hypot(destination.x - p.x, destination.z - p.z);
      if (distance > 0.003) {
        job.arrived = false;
        job.reach = 0;
        if (e.gorilla.labItem) { e.motion.labWork = "carry"; e.motion.labReach = 1; e.motion.labSqueeze = false; }
        if (labGoal(e, destination.x, destination.y, destination.z, destination.heading, true)) moveLab(e, dt, 1.1);
        else { e.speed = damp(e.speed, 0, 12, dt); if (!job.pathPending) requestLabPass(e, destination.x, destination.z); }
        if (e.blocked > 0.35) requestLabPass(e, destination.x, destination.z);
        return;
      }
      e.speed = damp(e.speed, 0, 12, dt);
      // Finish retracting the wider walking shoulders before raising the hands.
      // Doing both together sweeps the elbows outside either final footprint.
      if (job.item < 0 && !wasWorking) {
        e.motion.labSqueeze = false;
        if (!e.gorilla.labIdleCompact) { e.speed = 0; return; }
      }
      const turn = Math.atan2(Math.sin(destination.heading - e.heading), Math.cos(destination.heading - e.heading));
      {
        const heading = e.heading + clamp(turn, -dt * 3, dt * 3);
        if (Math.abs(turn) > 0.01 && !occupied(e, p.x, p.y, p.z, true, heading)
          && staticClear(e, p.x, p.y, p.z, p.x, p.y, p.z, e.heading, heading)) e.heading = heading;
      }
      if (Math.abs(turn) >= 0.08) return;
      e.motion.labSide = destination.side === -1 ? -1 : 1;
      const nextWork = job.stage === "fetch" || job.stage === "return" ? "carry" : station.kind;
      // A route was planned against yesterday's occupied workstations. Before
      // opening the arms again, reserve the whole working pose at this instant.
      const compact = e.compact, mode = e.footprintMode;
      e.planningLab = e.compact = true; e.footprintMode = "lab";
      e.planningLabWork = nextWork; e.planningLabSide = e.motion.labSide;
      const ready = !occupied(e, p.x, p.y, p.z) && staticClear(e, p.x, p.y, p.z);
      e.compact = compact; e.footprintMode = mode; e.planningLab = false; e.planningLabWork = "";
      if (!ready) return;
      e.motion.labSqueeze = false;
      if (job.stage === "fetch" || job.stage === "return") {
        e.motion.labWork = "carry"; e.motion.labReach = 1;
        job.reach += dt;
        if (job.reach < 0.8) return;
        if (job.stage === "return") {
          if (ctx.labReturn && !ctx.labReturn(e)) return;
          finishLabItem(e);
          return;
        } else {
          const chosen = job.pickup;
          if (chosen < 0 || !ctx.labPickup || !ctx.labPickup(e, chosen)) { job.reach = 0; return; }
          job.item = chosen; job.stage = "inspect"; job.reach = 0;
          job.pathCount = job.pathIndex = 0; job.pathAt = 0; job.arrived = false;
          return;
        }
      }
      e.motion.labWork = station.kind === "carry" ? job.item >= 0 ? "carry" : "" : station.kind;
      if (!job.arrived) {
        job.arrived = true;
        job.time = e.motion.labDie ? 1.1 + e.random() * 0.6 : 8 + e.random() * 5;
      }
      job.time -= dt;
      if (e.motion.labDie) e.motion.labRoll = clamp(1 - job.time / 0.45, 0, 1);
      if (job.time <= 0) {
        if (e.motion.labDie && job.item >= 0 && ctx.labRoll) {
          if (!ctx.labRoll(e, job.item)) return;
          job.stage = "roll"; job.time = 2.5 + e.random() * 1.5;
          return;
        }
        if (job.item >= 0) { job.stage = "return"; job.arrived = false; job.reach = 0; job.pathCount = 0; return; }
        if (yieldLabStation(e)) return;
        // A workstation stays occupied until its scientist has a real, clear
        // next job. Failed reservations keep the hands working, not idling.
        if (reserve(e, true)) {
          job.cycles++; e.workCycle++;
          setGoal(e, e.slotX, e.slotY, e.slotZ);
        } else job.time = 1 + e.random();
      }
    };
    const updateEntry = (e, dt) => {
      const p = e.root.position, beforeX = p.x, beforeY = p.y, beforeZ = p.z;
      e.motion.labDt = dt;
      syncLab(e);
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
          releaseLab(e);
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
      if (e.motion.lab && e.lab.item >= 0 && (e.mode !== e.owner.state || e.pendingSite >= 0 && e.pendingSite !== e.site)) {
        if (e.lab.stage !== "return") { e.lab.stage = "return"; e.lab.reach = 0; }
        workLab(e, dt); poseEntry(e, dt, beforeX, beforeY, beforeZ); return;
      }
      if (e.pendingSite >= 0 && e.lab.item < 0 && e.mode === "working" && e.owner.state === "working") {
        const site = e.pendingSite; e.pendingSite = -1; beginTravel(e, site);
      }
      if (e.mode !== e.owner.state) {
        e.roam.departPending = false;
        releasePortal(e);
        e.lab.yielding = 0; e.lab.yieldFor = null; e.lab.yieldReady = false;
        if (e.lounge) leaveLounge(e);
        e.mode = e.owner.state; e.hasSlot = false;
        if (e.mode === "working") beginTravel(e, e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site);
        else {
          e.fromSite = caveAt(p.x, p.y, p.z);
          if (e.fromSite >= 0) { e.phase = "leave"; e.route = "exit"; }
          else { e.phase = "chill"; e.rest = 0; chooseChill(e); }
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
      e.biped = e.motion.lab || e.parked || e.phase === "work" && (e.stand > 0 || e.beat > 0);
      if (e.parked && e.gorilla.standCompact) e.footprintMode = "stand";
      else if (!e.parked && e.footprintMode === "stand" && e.gorilla.compact) e.footprintMode = "walk";
      else if (e.phase === "chill" && !e.exitFootprint && !e.gorilla.motionActive && e.gorilla.compact
        && !e.jump.active && !e.pound && !e.beat && !e.stand) e.footprintMode = "walk";
      e.drive.motionRecover = Math.max(0, e.drive.motionRecover - dt);
      const seated = e.lounge === "sit" && e.gorilla.sitCompact && Math.abs(e.speed) <= 0.1;
      if (seated) e.footprintMode = "sit";
      else if (e.footprintMode === "sit") e.footprintMode = "walk";
      e.compact = (seated || e.mode === "working" || e.phase === "leave" || e.parked || e.exitFootprint || e.phase === "chill" && (!e.lounge || e.lounge === "sit" || Math.abs(e.speed) > 0.1))
        && !e.jump.active && !e.gorilla.motionActive
        && !e.fire.rollRecover && !e.drive.motionRecover && !(e.drive.motionEnvelope && e.gorilla.motionActive)
        && (seated || (e.footprintMode === "stand" ? e.gorilla.standCompact : e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact));
      const gestureRadius = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_RADIUS : e.pound > 0 ? 2.25 : e.jump.active ? AIR_RADIUS : WALK_RADIUS;
      e.radius = Math.max(gestureRadius, e.gorilla.bodyRadius + 0.1);
      const gestureHeight = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_HEIGHT : e.lounge || e.recover > 0 ? 2.7
        : e.parked || e.pound > 0 || e.beat > 0 || e.stand > 0 ? 2.6 : WALK_HEIGHT;
      e.height = Math.max(gestureHeight, e.gorilla.bodyHeight + 0.04);
      e.foot = FOOT;
      labEnvelope(e);
      if (stepLabEscape(e, dt) || labEscape && labEscape !== e && e.motion.lab && e.stuck.time >= 0.65
        && Math.hypot(p.x - labEscape.root.position.x, p.z - labEscape.root.position.z) < 3) {
        if (labEscape !== e) e.speed = 0;
        poseEntry(e, dt, beforeX, beforeY, beforeZ); return;
      }
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
      } else if (e.lab.yielding) {
        yieldLab(e, dt);
      } else if (e.phase === "travel" || e.phase === "leave") {
        if (e.parked) {
          e.speed = 0;
          const passage = e.fromSite < 0 || claimPortal(e, e.fromSite);
          if (passage && expandGesture(e, WALK_RADIUS)) { e.parked = false; e.recover = 0.55; }
          else if (passage && e.gorilla.standCompact && e.fromSite >= 0) {
            // Walk upright through the room's central aisle. The
            // full quadruped envelope must fit before crossing the entrance.
            sitePoint(sites[e.fromSite], 0, -0.9, POINT);
            setGoal(e, POINT.x, POINT.y, POINT.z);
            move(e, dt, 0.6);
          }
        } else if (travelGoal(e, dt)) { if (!e.jump.active) { if (e.motion.lab && (e.fromSite === labSite && e.route === "exit" || e.site === labSite && (e.route === "enter" || e.phase === "work"))) moveLab(e, dt); else move(e, dt, SPEED); } }
        else { e.speed = damp(e.speed, 0, 12, dt); }
      } else if (e.phase === "wait") {
        yieldSpace(e);
        move(e, dt, CHILL_SPEED);
        if (!e.retry) {
          e.retry = 1.5 + e.index * 0.07;
          if (Math.hypot(p.x, p.z) > ringRadius * 0.8) waitSpot(e);
          if ((e.site === labSite || e.owner.work.phase !== "return" && e.owner.work.phase !== "reload") && reserve(e)) {
            e.overflow = false; e.phase = "travel"; e.route = "exit";
            e.fromSite = caveAt(p.x, p.y, p.z);
          }
        }
      } else if (e.phase === "work") {
        if (e.motion.lab) workLab(e, dt);
        else if (e.parked) {
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
        if (Math.hypot(e.goalX - p.x, e.goalZ - p.z) > 0.025 || Math.abs(e.goalY - p.y) > 0.55) moveRoam(e, dt);
        else {
          e.speed = damp(e.speed, 0, 12, dt);
          if (!e.roam.departPending && !e.lowCover && !e.exitFootprint && !e.lounge && grass(p.x, p.y, p.z, e.loungePartner ? 0.9 : FOOT) && alignLounge(e, dt)) {
            let pose = e.loungePartner ? "sit" : e.roam.pose || loungePose(e);
            let fits = restTransitionClear(e, pose, dt);
            // A reclining pose may need more room than the approach. Sitting
            // is a supported alternative at the same destination, not another
            // trip across the clearing to discover the same obstruction.
            if (!fits && pose !== "sit") { pose = "sit"; fits = restTransitionClear(e, pose, dt); }
            if (fits) {
              e.speed = 0; e.lounge = pose; e.roam.arrived = true; e.roam.alignTime = 0;
              if (e.rest <= 0) e.rest = (e.loungeRoof ? 45 : 30) + e.random() * (e.loungeRoof ? 35 : 30);
            } else { e.roam.alignTime += dt; if (e.roam.alignTime > 0.5) e.rest = 0; }
          }
          if (e.lounge) e.rest = Math.max(0, e.rest - dt);
          else if (!e.loungeDepart) { e.roam.alignTime += dt; if (e.roam.alignTime > 1.5) e.rest = 0; }
          if (e.rest <= 0) chooseChill(e);
        }
        groomLounge(e, dt);
      }
      poseEntry(e, dt, beforeX, beforeY, beforeZ);
    };
    const recoverStall = (e, dt) => {
      const p = e.root.position, s = e.stuck, job = e.lab, r = e.roam;
      if (!e.active || e.controlled || e.phase !== "chill") r.departPending = false;
      if (r.departPending && Math.hypot(p.x - r.departX, p.y - r.departY, p.z - r.departZ) > 0.15) {
        r.departX = p.x; r.departY = p.y; r.departZ = p.z; r.departAt = elapsed;
      }
      const departureStalled = r.departPending && elapsed - r.departAt > 1.5;
      const station = labStations[job.station], goalDistance = Math.hypot(e.goalX - p.x, e.goalZ - p.z);
      const desired = job.pathFixed && job.pathCount ? job.pathHeading
        : !job.yielding && !job.pathPartial && e.route !== "exit" && station && goalDistance <= 0.800001 && job.pathIndex + 1 >= job.pathCount
        ? station.heading : Math.atan2(e.goalX - p.x, e.goalZ - p.z);
      const turnError = Math.abs(Math.atan2(Math.sin(desired - e.heading), Math.cos(desired - e.heading)));
      const stageChanged = job.stage !== s.workStage || job.item !== s.workItem;
      if (stageChanged) s.workReach = 0;
      const doingWork = job.cycles !== s.workCycles || !!e.motion.labWork && s.workTime > 0 && job.time < s.workTime - 1e-7
        || Math.min(job.reach, 0.8) > s.workReach + 1e-7;
      const progressed = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) >= 0.35
        || doingWork
        || e.climb.searchPending && e.climb.searchCursor > s.searchCursor
        || Math.abs(e.heading - s.heading) > 1e-7 && (e.phase === "chill" || turnError < s.turnError - 1e-7);
      s.workTime = job.time; s.workCycles = job.cycles; s.workReach = Math.max(s.workReach, Math.min(job.reach, 0.8));
      s.workStage = job.stage; s.workItem = job.item; s.turnError = turnError;
      s.searchCursor = e.climb.searchCursor; s.heading = e.heading;
      const away = Math.hypot(e.goalX - p.x, e.goalZ - p.z) > 0.18 || Math.abs(e.goalY - p.y) > 0.55;
      const resting = !r.departPending && !e.loungeDepart && (e.lounge && e.rest > 0 || !e.motion.lab && !away && e.rest > 0);
      const wantsMove = r.departPending || e.loungeDepart || e.climb.active || e.climb.searchPending || e.jump.active || e.drive.airborne
        || e.phase === "travel" || e.phase === "leave" || e.motion.lab && e.phase === "work" || away;
      // Escaping in circles must not pass as completing the blocked job.
      if (doingWork || !e.active || e.controlled || !e.motion.lab || resting || !wantsMove || e.fire.burning || e.fire.rolling) {
        s.taskTime = 0; s.taskActive = false;
      } else if (s.taskActive) {
        const distance = Math.hypot(s.taskX - p.x, s.taskZ - p.z);
        // Give a recovering walker credit for getting genuinely closer to its
        // original workstation. Moving around in an escape loop or changing
        // waypoints cannot refresh this monotonically decreasing watermark.
        if (distance < s.taskDistance - 0.35) { s.taskDistance = distance; s.taskTime = 0; }
        else s.taskTime += dt;
      }
      const taskExpired = s.taskActive && s.taskTime >= 8 || r.departPending && elapsed - r.departAt >= 8;
      // An independent clock survives changing waypoints and mutual yielding.
      // Limb animation alone is not progress; real work and deliberate rest are.
      if (!e.active || e.controlled || e.fire.burning || e.fire.rolling || e.pound || e.beat
        || resting || !wantsMove || r.departPending && !departureStalled
        || e.phase === "chill" && !departureStalled && (e.recover > 0
          || !e.loungeDepart && !e.climb.active && (elapsed < e.roam.waitUntil || e.roam.progressTime < 2.1)
          || e.climb.claimPending && elapsed - e.climb.claimProgressAt < 1.5)
        || !taskExpired && (elapsed < job.coordinationUntil || elapsed < job.trafficWait || job.pathCount && elapsed < job.readyAt || progressed) || !Number.isFinite(s.x)) {
        s.x = p.x; s.y = p.y; s.z = p.z; s.time = 0; s.stage = 0;
        return;
      }
      s.time += dt;
      if (!taskExpired && (s.time < 0.65 || s.stage && elapsed < s.retryAt || labEscape && e.motion.lab)) return;
      const hard = s.time >= 8 || taskExpired, lab = e.motion.lab;
      // A live climb may be paused between search slices. Replanning that
      // mid-wall pose as a ground walk is unsafe, so retain its grip until reset.
      if (!hard && (e.climb.active || e.jump.active || e.drive.airborne)) { s.stage = 1; s.retryAt = elapsed + 0.5; return; }
      releasePortal(e);
      if (hard || !lab) releaseLab(e);
      else {
        // Keep the workstation and real held equipment. Only stale movement
        // claims are discarded; a carrier returns its item before retreating.
        job.yielding = 0; job.yieldFor = null; job.yieldReady = false; job.arrived = false;
        job.pathCount = job.pathIndex = 0; job.pathPending = job.pathPartial = false;
        if (job.item >= 0) { job.stage = "return"; job.reach = 0; }
      }
      if (e.lounge) leaveLounge(e);
      for (const other of list) if (other !== e && other.lab.yieldFor === e) {
        other.lab.yieldFor = null; other.lab.yielding = 0; other.lab.yieldReady = false;
        other.lab.pathCount = other.lab.pathIndex = 0; other.lab.pathAt = 0;
      }
      e.climb.requested = 0; e.climb.searchPending = e.climb.searchDeferred = e.climb.claimPending = e.climb.crestPending = false;
      e.climb.searchCursor = e.climb.retry = 0;
      if (climbTurn === e.index) climbTurn = -1;
      e.blocked = e.stuckTime = e.retry = e.portalRetry = e.yieldFor = 0;
      e.steerHeading = e.steerGoalX = e.steerGoalZ = NaN; e.backoutLeft = 0;
      e.lab.pathAt = 0; e.lab.targetX = e.lab.targetZ = NaN;
      if (hard || !lab) { e.hasSlot = false; e.slotIndex = -1; }
      e.parked = false;
      e.speed = e.drive.vx = e.drive.vz = 0;
      if (hard) {
        if (labEscape === e) labEscape = null;
        s.escapeLeft = 0; s.taskTime = 0; s.taskActive = false;
        // Activation already reserves a supported, collision-checked work or
        // resting spot. If none fits it stays hidden and retries; never place a
        // body inside another actor or scenery just to make a timeout pass.
        const soot = e.fire.soot, cooldown = e.fire.cooldown;
        e.climb.active = e.drive.passiveFall = false;
        if (e.drag.cave && ctx.onReleaseDrag) ctx.onReleaseDrag(e);
        // An existing lab occupant need not join the entrance queue again to
        // recover into a free workstation. Claimed stations, bodies and solid
        // scenery still reject the candidate through the normal reservation.
        activate(e, e.motion.lab && e.site === labSite);
        e.fire.soot = soot; e.fire.cooldown = cooldown;
        s.recoveries++; s.reason = "relocated"; s.time = 0; s.stage = 0;
        s.x = p.x; s.y = p.y; s.z = p.z;
      } else {
        if (lab && !s.taskActive) {
          s.taskActive = true; s.taskTime = 0;
          s.taskX = station ? station.x : e.goalX; s.taskZ = station ? station.z : e.goalZ;
          s.taskDistance = Math.hypot(s.taskX - p.x, s.taskZ - p.z);
        }
        if ((!lab || job.station < 0) && e.mode === "working") resumeEntry(e);
        if (lab) beginLabEscape(e);
        s.replans++; s.reason = "replanned"; s.stage = 1;
        s.retryAt = elapsed + 1.5;
      }
      s.workTime = job.time; s.workCycles = job.cycles;
      if (ctx.onRecovery && e.active) ctx.onRecovery(e, hard);
    };
    const update = (dt) => {
      if (disposed || !(dt > 0)) return;
      if (labEscape && (!labEscape.active || labEscape.controlled || labEscape.fire.burning
        || labEscape.climb.active || labEscape.jump.active || labEscape.drive.airborne)) {
        labEscape.stuck.escapeLeft = 0; labEscape = null;
      }
      roamBudget = 1; roamTurn = -1;
      for (let i = 0; i < list.length; i++) {
        const index = (roamNext + i) % list.length, e = list[index];
        if (e.active && !e.controlled && e.phase === "chill" && !e.loungeDepart && e.recover <= 0
          && e.rest <= 0 && e.roam.nextChoice <= elapsed
          && Math.hypot(e.goalX - e.root.position.x, e.goalZ - e.root.position.z) <= 0.025
          && Math.abs(e.goalY - e.root.position.y) <= 0.55) {
          roamTurn = index; roamNext = (index + 1) % list.length; break;
        }
      }
      labRouteBudget = 1; labRouteTurn = -1;
      for (let i = 0; i < list.length; i++) {
        const index = (labRouteNext + i) % list.length, e = list[index];
        if (e.active && e.lab.pathPending && e.lab.pathAt <= elapsed) { labRouteTurn = index; labRouteNext = (index + 1) % list.length; break; }
      }
      if (player && labSite >= 0 && Math.hypot(player.drive.x, player.drive.z) > 0.05) {
        const p = player.root.position, m = sites[labSite].mouth;
        if (Math.abs(p.y - m.floorY) < 0.5 && Math.hypot(p.x - m.x, p.z - m.z) < 7)
          requestLabPass(player, p.x + player.drive.x * 3.5, p.z + player.drive.z * 3.5);
      }
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
        if (e.controlled ? !c.requested && Math.hypot(e.drive.x, e.drive.z) <= 0.05 : Math.hypot(e.goalX - e.root.position.x, e.goalZ - e.root.position.z) <= 0.18) continue;
        climbTurn = index; climbNext = (index + 1) % list.length;
        break;
      }
      while (remaining > 1e-8) {
        const step = Math.min(remaining, 1 / 30); remaining -= step; elapsed += step;
        for (let i = 0; i < list.length; i++) {
          updateEntry(list[i], step);
          recoverStall(list[i], step);
        }
      }
    };
    const target = (cave, out, sample = 0) => {
      const e = byOwner.get(cave);
      if (!e || !e.active || e.mode !== "working" || e.site !== cave.work.site
        || e.phase !== "work" && !(e.phase === "travel" && e.route === "enter")) return false;
      if (e.site === labSite) {
        // The entrance transforms incoming bananas; desk workers are never
        // projectile targets behind equipment or another scientist.
        sitePoint(sites[labSite], Math.sin((sample + e.index) * 2.39996323) * 1.8, 0.5, out);
        out.y += 1.3 + (Math.sin(sample * 1.7 + e.index) * 0.5 + 0.5);
        return true;
      }
      const p = e.root.position;
      if (caveAt(p.x, p.y, p.z) !== cave.work.site) return false;
      e.gorilla.bodyTarget(out, sample);
      return true;
    };
    const hit = (cave) => {
      const e = byOwner.get(cave);
      if (!e || !e.active) return false;
      e.activity = Math.min(9, e.activity + 1); e.hits++;
      if (e.site !== labSite && e.activity >= 3) e.rest = Math.min(e.rest, 0.7);
      return true;
    };
    const stats = () => {
      let active = 0, working = 0, chilling = 0, overflow = 0, airborne = 0, hits = 0, pounds = 0, beats = 0, stuck = 0, replans = 0, recoveries = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.active) { active++; if (e.mode === "working") working++; else chilling++; }
        if (e.overflow) overflow++;
        if (e.jump.active || e.drive.airborne) airborne++;
        hits += e.hits; pounds += e.pounds; beats += e.beats;
        if (e.stuck.time >= 0.65) stuck++;
        replans += e.stuck.replans; recoveries += e.stuck.recoveries;
      }
      return { capacity: list.length, active, working, chilling, overflow, airborne, hits, pounds, beats, stuck, replans, recoveries, elapsed };
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
    return { list, sync, update, target, hit, plan, stats, liveGeometry, dispose, contactAt,
      possess, release, control, cancelInput, climbAction, startClimb, smash, grab, chestBeat, ignite, dropRoll, get player() { return player; } };
  };
  BL.clankers = { create, WALK_RADIUS, WALK_HEIGHT };
})();
