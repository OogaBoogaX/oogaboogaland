// Existing Clanker arc preparation and flight transitions, shared unchanged.
// World/peer/rig queries and the passive-fall or wall controller remain explicit adapters.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const create = ({ ctx, clamp, POINT, MAX_JUMP, ROOF_JUMP_HEIGHT, WALL_ENTER_SHARE, AIR_RADIUS, SPEED, GRAVITY, MOTION_RADIUS, MOTION_HEIGHT, JUMP_SAMPLES, wallContactShare, climbClear, landing, caveAt, occupied, staticClear, rageCarrying, attachContactWall }) => {
    const jumpPoint = (jump, t, out) => {
      out.x = jump.fromX + (jump.toX - jump.fromX) * t;
      out.y = jump.fromY + (jump.toY - jump.fromY) * t + jump.lift * 4 * t * (1 - t);
      out.z = jump.fromZ + (jump.toZ - jump.fromZ) * t;
    };
    const prepareJump = (e, x, y, z, lift = 0, vault = false, running = false, wall = false) => {
      if (e.motion.lab && !e.controlled) return false;
      const p = e.root.position, jump = e.jump, distance = Math.hypot(x - p.x, z - p.z);
      if (distance > MAX_JUMP || y > p.y + (running ? ROOF_JUMP_HEIGHT : 1.7) || y < p.y - 7.5
        || (wall ? wallContactShare(e, x, y, z, e.heading) < WALL_ENTER_SHARE
          || !climbClear(e, x, y, z, x, y, z, e.heading) : !landing(x, y, z))
        || e.phase === "work" && caveAt(x, y, z, AIR_RADIUS) !== e.site) return false;
      let duration = running ? distance / SPEED : Math.max(vault ? 1 : 0.52, distance / (vault ? 2.4 : 3.3));
      const rageAscent = running && e.rageTraversal && y > p.y;
      if (rageAscent) {
        // Rage approaches can use the full jump reach to a high landing. Do not
        // stretch that arc to the ordinary stroll speed. The longest legal
        // flight rises to the maximum apex, then descends to this landing.
        const rise = y - p.y, apexTime = Math.sqrt(2 * ROOF_JUMP_HEIGHT / GRAVITY);
        duration = clamp(duration, Math.sqrt(2 * rise / GRAVITY),
          apexTime + Math.sqrt(2 * (ROOF_JUMP_HEIGHT - rise) / GRAVITY));
      }
      if (running) {
        // Keep a gravity-shaped arc at the chosen running speed. Reject
        // landings above the apex or beyond the bounded running-jump height.
        const velocity = (y - p.y) / duration + GRAVITY * duration * 0.5;
        const tolerance = rageAscent ? 1e-9 : 0;
        if (velocity <= 0 || velocity - GRAVITY * duration > tolerance
          || velocity * velocity / (2 * GRAVITY) > ROOF_JUMP_HEIGHT + tolerance) return false;
        lift = GRAVITY * duration * duration / 8;
      }
      // A voluntary jump must not bypass the fireplace detour just because
      // its airborne arc clears the flame. Walk around the pit and rim.
      if (!e.controlled && ctx.fireClear && !ctx.fireClear(e, p.x, p.y, p.z, x, y, z)) return false;
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
      jump.duration = duration;
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
      jump.active = true; jump.wall = wall; jump.caveExit = false; jump.progress = 0; jump.reverse = false; jump.blocked = 0; e.jumps++;
      return true;
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
        if (staticClear(e, p.x, p.y, p.z, POINT.x, POINT.y, POINT.z)
          // Admit the actual next animated hand/captive pose before advancing
          // the arc cursor. A refusal reverses through the same checked arc.
          && (!rageCarrying(e) || ctx.rageJumpPoseClear?.(e, dt, POINT.x, POINT.y, POINT.z,
            Math.hypot(jump.toX - jump.fromX, jump.toZ - jump.fromZ) / jump.duration,
            next !== 1 && !(next === 0 && jump.reverse)) !== false)) { moved = true; break; }
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
          if (e.rage.active) {
            // A refused rage arc needs the same checked outward recovery as
            // a released wall grip. Keep the flying pose if its held body
            // cannot yet fit the passive-fall pose at this height.
            d.wallRelease = true;
            d.passiveFall = !rageCarrying(e) || ctx.rageJumpPoseClear?.(e, dt, p.x, p.y, p.z, 0, false) !== false;
            e.climb.airAttachAfter = Infinity;
          }
        }
        return;
      }
      jump.blocked = 0;
      p.x = POINT.x; p.y = POINT.y; p.z = POINT.z; jump.progress = next;
      e.speed = Math.hypot(jump.toX - jump.fromX, jump.toZ - jump.fromZ) / jump.duration;
      if (next === 1 && jump.wall) {
        const d = e.drive;
        d.airborne = true;
        d.vx = (jump.toX - jump.fromX) / jump.duration;
        d.vz = (jump.toZ - jump.fromZ) / jump.duration;
        d.vy = (jump.toY - jump.fromY - jump.lift * 4) / jump.duration;
        if (attachContactWall(e)) {
          jump.active = false; e.climb.fromTop = false; return;
        }
        // A moved obstruction can invalidate the grip during flight. Retrace
        // the checked arc to the takeoff footing instead of standing in air.
        d.airborne = false; d.vx = d.vy = d.vz = 0; jump.reverse = true; return;
      }
      if (next === 1 || next === 0 && jump.reverse) {
        jump.active = false; e.blocked = 0; e.rest = Math.max(e.rest, 0.12);
      }
    };
    return { prepareJump, updateJump };
  };
  BL.clankerFlight = { create };
})();
