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
  const JUMP_SAMPLES = 20, MAX_JUMP = 8.5;
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
    const loungeSpots = new Float64Array(320 * 3), loungeBlocked = new Uint8Array(320);
    let loungeCount = 0, roofCount = 0, loungeReady = false;
    let disposed = false, elapsed = 0, player = null;
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
    const grass = (x, y, z, foot = FOOT) => Number.isFinite(y) && Math.hypot(x, z) < roamRadius
      && (!ctx.onLand || ctx.onLand(x, z)) && (!ctx.isGrass || ctx.isGrass(x, z, y)
        && ctx.isGrass(x - foot, z, y) && ctx.isGrass(x + foot, z, y)
        && ctx.isGrass(x, z - foot, y) && ctx.isGrass(x, z + foot, y));
    const landing = (x, y, z) => Number.isFinite(y) && Math.hypot(x, z) < roamRadius && (!ctx.onLand || ctx.onLand(x, z));
    const staticClear = (e, x, y, z, nx = x, ny = y, nz = z, fromHeading = e.heading, toHeading = fromHeading) =>
      clear(x, y, z, nx, ny, nz, e.radius, e.height, e, null, fromHeading, toHeading);
    // Include the complete arm envelope, and reserve airborne destinations so
    // another clanker cannot stand under a leap that is already in progress.
    const occupied = (e, x, y, z, destinations = true, heading = e.heading) => {
      for (let i = 0; i < list.length; i++) {
        const other = list[i];
        if (other === e || !other.active) continue;
        const p = other.root.position, radius = e.radius + other.radius + SPACE;
        if (footprint.overlaps(e, x, y, z, heading, other, p.x, p.y, p.z, other.heading, SPACE)) return true;
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
        if (footprint.circleOverlaps(e, x, y, z, heading, p.x, feet, p.z, 0.38, other.bodyHeight || other.traits.height, SPACE)) return true;
      }
      return false;
    };
    const expandGesture = (e, radius) => {
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
    const setGoal = (e, x, y, z) => {
      if (e.lounge && Math.hypot(x - e.root.position.x, z - e.root.position.z) > 0.18) {
        e.lounge = ""; e.recover = 0.65;
      }
      e.goalX = x; e.goalY = y; e.goalZ = z;
    };
    const chooseChill = (e, spawn = false) => {
      const p = e.root.position, compact = e.compact;
      // Lounge destinations need the whole relaxed body, even when the
      // departing worker is still using its narrow cave footprint.
      e.compact = false;
      const outer = spawn || Math.hypot(p.x, p.z) < (ctx.meadowRadius || 22) * 0.82;
      for (let i = 0; i < 40; i++) {
        const roof = e.mode !== "working" && !!ctx.surfaceAt && i < 20 && (spawn || e.random() < 0.5);
        // The flat roof patches are narrow between the stair cuts and trees.
        // Cover the authored cave sectors before falling back to meadow grass;
        // a single random-radius ring repeatedly missed every usable roof.
        const angle = roof ? (e.index + i) * TAU / 16 : e.random() * TAU;
        const meadow = ctx.meadowRadius || 22, inner = meadow * 0.82, edge = meadow - WALK_RADIUS - 0.25;
        const distance = outer ? inner + e.random() * Math.max(0, edge - inner) : 2 + e.random() * 4;
        const roofRadius = meadow + 1.5 + Math.floor(i / 16) * 0.5;
        const x = roof ? Math.sin(angle) * roofRadius : (outer ? 0 : p.x) + Math.sin(angle) * distance;
        const z = roof ? Math.cos(angle) * roofRadius : (outer ? 0 : p.z) + Math.cos(angle) * distance;
        const y = roof ? ctx.surfaceAt(x, z) : groundAt(x, z, spawn ? 0 : p.y);
        if (Math.hypot(x, z) < (ctx.meadowRadius || 22) * 0.82 || !grass(x, y, z, e.foot) || trafficAt(x, y, z) || caveAt(x, y, z) >= 0 || occupied(e, x, y, z) || !staticClear(e, x, y, z)) continue;
        if (roof && !clear(x, y, z, x, y, z, Math.max(e.radius, 2.12), Math.max(e.height, 2.7), e)) continue;
        if (e.root.visible && roof && Math.abs(y - p.y) > 1.6) continue;
        setGoal(e, x, y, z);
        e.rest = 12 + e.random() * 18; e.lounge = ""; e.phase = "chill";
        e.compact = compact; return true;
      }
      e.compact = compact; return false;
    };
    const spawnLounge = (e) => {
      // Enumerate the outer meadow and authored roof sectors once. Random
      // per-character attempts used to miss valid patches and defer visible
      // companions to later one-second retries.
      if (!loungeReady) {
        loungeReady = true;
        const meadow = ctx.meadowRadius || 22, inner = meadow * 0.82;
        const edge = meadow - WALK_RADIUS - 0.25;
        for (let i = 0; i < 320; i++) {
          const roof = i < 32, index = roof ? i : i - 32;
          if (roof && !ctx.surfaceAt) continue;
          const angle = (index % (roof ? 16 : 96)) * TAU / (roof ? 16 : 96);
          const distance = roof ? meadow + 1.5 + Math.floor(index / 16) * 0.5
            : inner + (edge - inner) * (Math.floor(index / 96) / 2);
          const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
          const y = roof ? ctx.surfaceAt(x, z) : groundAt(x, z, 0);
          if (!grass(x, y, z) || trafficAt(x, y, z) || caveAt(x, y, z) >= 0) continue;
          const n = loungeCount++ * 3;
          loungeSpots[n] = x; loungeSpots[n + 1] = y; loungeSpots[n + 2] = z;
          if (roof) roofCount++;
        }
      }
      const compact = e.compact, radius = e.radius, height = e.height;
      e.compact = false; e.height = Math.max(height, 2.7);
      for (let i = 0; i < loungeCount; i++) {
        const roof = i < roofCount, count = roof ? roofCount : loungeCount - roofCount;
        const index = roof ? (e.index + i) % count : roofCount + (e.index * 23 + i - roofCount) % count;
        if (loungeBlocked[index]) continue;
        e.radius = roof ? Math.max(radius, 2.12) : radius;
        const n = index * 3, x = loungeSpots[n], y = loungeSpots[n + 1], z = loungeSpots[n + 2];
        if (occupied(e, x, y, z)) continue;
        if (!staticClear(e, x, y, z)) { loungeBlocked[index] = 1; continue; }
        setGoal(e, x, y, z); e.rest = 12 + e.random() * 18;
        e.lounge = e.random() < 0.5 ? "sit" : "back"; e.phase = "chill";
        e.compact = compact; e.radius = radius; e.height = height;
        return true;
      }
      e.compact = compact; e.radius = radius; e.height = height;
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
      d.x = d.z = d.charge = d.vx = d.vy = d.vz = d.motionRecover = 0;
      d.jumpHeld = d.jumpDown = d.jumpArmed = d.airborne = d.resume = d.motionEnvelope = false; d.grounded = true;
      f.burning = f.rolling = f.requested = f.escaping = false; f.retry = f.escapeRetry = 0; f.age = f.heat = f.soot = f.cooldown = f.rollRecover = 0;
      m.charge = m.takeoff = m.landing = m.roll = m.rollAngle = 0;
      e.actionControlled = e.motion.smash = false;
      e.mode = e.owner.state; e.site = e.owner.work.plannedSite >= 0 ? e.owner.work.plannedSite : e.owner.work.site;
      e.parked = e.mode === "working"; e.parkFor = 0; e.exitFootprint = false;
      e.biped = e.parked ? "squeeze" : false;
      e.radius = WALK_RADIUS; e.foot = FOOT;
      e.pound = e.beat = e.stand = e.recover = 0; e.lounge = ""; e.footprintMode = e.parked ? "park" : "walk";
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
        sampleTime: 0, sampleX: 0, sampleZ: 0, stuckTime: 0, portalSince: 0, portalRetry: 0,
        overflow: false, activity: 0, hits: 0, pounds: 0, pound: 0, poundHit: false, poundPower: 2,
        drag: { cave: null, time: 0 },
        beat: 0, beats: 0, stand: 0, parked: false, parkFor: 0, exitFootprint: false, workCycle: 0, recover: 0, lounge: "", jumps: 0,
        controlled: false, pendingSite: -1, actionControlled: false,
        drive: { x: 0, z: 0, heading: NaN, run: false, jumpHeld: false, jumpDown: false, jumpArmed: false,
          cancelled: false, charge: 0, vx: 0, vy: 0, vz: 0, airborne: false, grounded: true, resume: false, motionRecover: 0, motionEnvelope: false },
        motion: { charge: 0, poundCharge: 0, takeoff: 0, landing: 0, roll: 0, rollAngle: 0, smash: false, dragging: false },
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
      if (e.controlled || e.drive.airborne) { e.pendingSite = index; return; }
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
    const move = (e, dt, speed) => {
      if (e.recover > 0) { e.speed = 0; return; }
      const p = e.root.position, dx = e.goalX - p.x, dz = e.goalZ - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.15) { e.speed = damp(e.speed, 0, 12, dt); return; }
      const desired = Math.atan2(dx, dz), step = Math.min(distance, speed * dt);
      const inCave = caveAt(p.x, p.y, p.z) >= 0;
      const doorway = e.route === "exit" && e.fromSite >= 0 || e.route === "enter" || e.route === "apron";
      e.sampleTime += dt;
      if (e.sampleTime >= 1) {
        e.stuckTime = Math.hypot(p.x - e.sampleX, p.z - e.sampleZ) < 0.3 ? e.stuckTime + e.sampleTime : 0;
        e.sampleTime = 0; e.sampleX = p.x; e.sampleZ = p.z;
        if (e.stuckTime > 1.5 && !inCave && !doorway) {
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
        if (tryJump(e, desired)) { e.heading = desired; return; }
      }
      if (!e.parked && !doorway && e.retry <= 0 && occupied(e, p.x + Math.sin(desired) * step, p.y, p.z + Math.cos(desired) * step)) {
        e.retry = 0.65;
        if (tryJump(e, desired)) { e.heading = desired; return; }
      }
      const initialMode = e.footprintMode, initialCompact = e.compact;
      let chosen = NaN, chosenFacing = e.heading, chosenMode = initialMode, chosenCompact = initialCompact;
      let best = -Infinity, chosenY = p.y, pushed = false;
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
          || e.parked && caveAt(x, y, z) < 0
          || (e.phase === "wait" || e.phase === "chill") && !trafficAt(p.x, p.y, p.z) && trafficAt(x, y, z)) continue;
        if (occupied(e, x, y, z, true, facing)) continue;
        if (!staticClear(e, p.x, p.y, p.z, x, y, z, e.heading, facing)) {
          if (!i && ctx.push) { ctx.push(e, sx, sz, dt); pushed = true; }
          continue;
        }
        // Look ahead far enough to turn before the long arms touch a prop.
        const ahead = Math.min(0.5, distance), ax = p.x + sx * ahead, az = p.z + sz * ahead, ay = groundAt(ax, az, p.y);
        const goodAhead = Number.isFinite(ay) && Math.abs(ay - p.y) <= STEP && landing(ax, ay, az, e.foot)
          && !occupied(e, ax, ay, az, true, facing) && staticClear(e, p.x, p.y, p.z, ax, ay, az, e.heading, facing);
        const score = Math.cos(heading - desired) * 2 + Math.cos(heading - e.heading) * 0.3 + (goodAhead ? 1 : 0) - i * 0.008;
        if (score > best) {
          best = score; chosen = heading; chosenFacing = facing; chosenY = y;
          chosenMode = e.footprintMode; chosenCompact = e.compact;
        }
        if (!i && goodAhead) break;
      }
      e.footprintMode = chosenMode; e.compact = chosenCompact;
      if (Number.isFinite(chosen)) {
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
        if (!pushed && ctx.push) ctx.push(e, Math.sin(desired), Math.cos(desired), dt);
        if (!e.parked && !doorway && e.retry <= 0 && e.blocked > 0.3) {
          e.retry = 0.6;
          if (tryJump(e, desired)) { e.heading = desired; return; }
          e.turn = -e.turn;
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
      d.x = d.z = d.charge = player.motion.charge = 0; d.heading = NaN;
      d.jumpHeld = d.jumpDown = d.jumpArmed = d.run = false; d.cancelled = true;
    };
    const release = () => {
      if (!player) return false;
      const e = player;
      e.drag.time = 0;
      if (e.drag.cave && ctx.onReleaseDrag) ctx.onReleaseDrag(e);
      cancelInput(); player = null; e.controlled = false;
      e.drive.resume = true;
      if (!e.drive.airborne && !e.fire.rolling) resumeEntry(e);
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
      if (!d.grounded) d.airborne = true;
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
      if (e.drive.airborne || e.jump.active) return false;
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
      if (!e || e.fire.rolling || e.drive.airborne || e.recover > 0 || e.parked || e.pound || e.beat) return false;
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
      return !!e && !e.fire.rolling && !e.drive.airborne && !e.pound && !e.beat && !e.drag.cave
        && !!ctx.onGrab && ctx.onGrab(e);
    };
    const chestBeat = () => {
      const e = player;
      if (!e || e.fire.rolling || e.drive.airborne || e.recover > 0 || e.parked || e.pound || e.beat) return false;
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
      if (!d.grounded || d.airborne || e.recover > 0 || e.pound || e.beat || e.fire.burning || e.fire.rolling || e.parked
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
      else if (pressed && d.grounded && !e.fire.rolling && !e.parked && !e.pound && !e.beat
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
      e.height = Math.max(motion ? MOTION_HEIGHT : 2.7, e.gorilla.bodyHeight + 0.08);
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
      const wantedHeading = Number.isFinite(d.heading) ? d.heading : amount > 0.01 ? Math.atan2(d.x, d.z) : e.heading;
      const delta = Math.atan2(Math.sin(wantedHeading - e.heading), Math.cos(wantedHeading - e.heading));
      const heading = e.heading + clamp(delta, -dt * 7, dt * 7);
      const count = Math.max(1, Math.ceil(Math.max(Math.hypot(d.vx, d.vz), Math.abs(d.vy)) * dt / 0.1));
      const step = dt / count, oldX = p.x, oldZ = p.z;
      for (let i = 0; i < count; i++) {
        const facing = e.heading + (heading - e.heading) / (count - i);
        let x = p.x + d.vx * step, z = p.z + d.vz * step, y = p.y, landing = false;
        let floor = support(e, x, z, p.y, d.airborne ? 0 : STEP, facing);
        if (!d.airborne) {
          if (!Number.isFinite(floor) || floor < p.y - STEP) { d.airborne = true; d.grounded = false; d.vy = 0; }
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
        // A seated or reclining body is wider than its walking limb chain.
        // Claim that space before changing pose; otherwise a neighbor can be
        // admitted beside the narrow shape and both appear stuck apart.
        const compact = e.compact;
        e.compact = false;
        if (occupied(e, p.x, p.y, p.z) || !staticClear(e, p.x, p.y, p.z)) {
          e.compact = compact; e.lounge = ""; e.rest = 0;
        }
      }
      e.gorilla.poseManaged(dt, p.x, p.y, p.z, e.heading, e.speed, e.jump.active || e.drive.airborne, e.biped, e.lounge, e.motion);
      if (e.actionControlled || e.motion.smash || e.gorilla.smashActive) {
        e.footprintMode = "pound"; e.compact = e.gorilla.poundCompact;
        e.radius = Math.max(BL.agent.MANAGED_SMASH_RADIUS, e.gorilla.bodyRadius + 0.1);
        e.height = Math.max(e.height, e.gorilla.bodyHeight + 0.08);
      }
      if (e.gorilla.motionActive) {
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
      e.yieldFor = Math.max(0, e.yieldFor - dt);
      e.parkFor = Math.max(0, e.parkFor - dt);
      if (!alive(e.owner) && !e.controlled && !e.drive.airborne && !e.fire.rolling) {
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
      if (ctx.fireContact && ctx.fireContact(e, p.x, p.y, p.z)) ignite(e);
      updateFire(e, dt);
      if (e.controlled || e.drive.airborne || e.drive.resume) {
        updateDriven(e, dt); poseEntry(e, dt, beforeX, beforeY, beforeZ); return;
      }
      if (e.fire.rolling || escapeForRoll(e, dt)) { poseEntry(e, dt, beforeX, beforeY, beforeZ); return; }
      if (e.mode !== e.owner.state) {
        releasePortal(e);
        if (e.lounge) { e.lounge = ""; e.recover = 0.65; }
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
      e.compact = (e.mode === "working" || e.phase === "leave" || e.parked || e.exitFootprint || e.phase === "chill" && (!e.lounge || Math.abs(e.speed) > 0.1))
        && !e.jump.active && !e.gorilla.motionActive
        && !e.fire.rollRecover && !e.drive.motionRecover && !(e.drive.motionEnvelope && e.gorilla.motionActive)
        && (e.footprintMode === "park" ? e.gorilla.parkCompact : e.footprintMode === "pound" ? e.gorilla.poundCompact : e.gorilla.compact);
      const gestureRadius = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_RADIUS : e.pound > 0 ? 2.25 : e.jump.active ? AIR_RADIUS : WALK_RADIUS;
      e.radius = Math.max(gestureRadius, e.gorilla.bodyRadius + 0.1);
      const gestureHeight = (e.fire.rollRecover > 0 || e.drive.motionRecover > 0 || e.drive.motionEnvelope && e.gorilla.motionActive) ? MOTION_HEIGHT : e.mode === "chilling" || e.lounge || e.recover > 0 ? 2.7
        : e.parked || e.pound > 0 || e.beat > 0 || e.stand > 0 ? 2.6 : 2.15;
      e.height = Math.max(gestureHeight, e.gorilla.bodyHeight + 0.08);
      e.foot = FOOT;
      if (e.jump.active) updateJump(e, dt);
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
        if (Math.hypot(e.goalX - p.x, e.goalZ - p.z) > 0.18) move(e, dt, CHILL_SPEED);
        else {
          e.speed = damp(e.speed, 0, 12, dt); e.rest -= dt;
          if (!e.exitFootprint && !e.lounge && Math.hypot(p.x, p.z) >= (ctx.meadowRadius || 22) * 0.82 && grass(p.x, p.y, p.z, FOOT)) {
            e.speed = 0; e.lounge = e.random() < 0.5 ? "sit" : "back";
          }
          if (e.rest <= 0) { e.rest = 6; chooseChill(e); }
        }
      }
      poseEntry(e, dt, beforeX, beforeY, beforeZ);
    };
    const update = (dt) => {
      if (disposed || !(dt > 0)) return;
      let remaining = Math.min(dt, 0.25);
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
