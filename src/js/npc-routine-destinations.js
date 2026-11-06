// Existing Hub routine destinations and reservation selection. The host uses
// its checkpointed random stream; the browser retains its presentation clock.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, { mulberry32, lerp } = BL.math;
  const SEED = 1, MEADOW = 22, MEADOW_OUTER = MEADOW - 1.5;
  const WANDER_COUNT = 36, WANDER_INNER = 5.5, FIRE_SEATS = 6;
  const NIGHT = 0.5, FIRE_SEAT_CHANCE = 0.5, PLAYER_RADIUS = 0.3, DEG = Math.PI / 180;
  const polar = (degrees, radius) => ({ x: Math.sin(degrees * DEG) * radius,
    z: -Math.cos(degrees * DEG) * radius });
  const create = ({ getCrew, getIsland, getRosterCount, slots, getStars, getOutside, random,
    spots, chillSpots, fireSeats, free, nearMouth, mirrorClosed: MIRROR_GATE_CLOSED,
    npcRampRoofAt, npcClosedCaveAt, npcPileAt, npcWorkZoneAt, npcFireClear,
    walkable, physicalClearAt, propSegmentClear }) => {
    if (![getCrew, getIsland, getRosterCount, getStars, getOutside, random, free, nearMouth,
      npcRampRoofAt, npcClosedCaveAt, npcPileAt, npcWorkZoneAt, npcFireClear, walkable,
      physicalClearAt, propSegmentClear].every(fn => typeof fn === "function")
      || ![slots, spots, chillSpots, fireSeats].every(Array.isArray)) throw Error("Hub routine providers required");
  const buildSpots = () => {
    // Sit beside the ramp approaches, leaving the entrance and its walking lane clear.
    for (const ramp of getIsland().headquarters.ramps) {
      for (let along = 4; along <= 8; along += 2) for (let side = -1; side <= 1; side += 2) for (let across = 3.25; across <= 4.75; across += 1.5) {
        const x = ramp.from.x - ramp.axis.x * along + ramp.axis.z * side * across;
        const z = ramp.from.z - ramp.axis.z * along - ramp.axis.x * side * across;
        if (getIsland().surfaceAt(x, z) !== 0 || !getIsland().isGrassAt(x, z) || getIsland().path.overlaps(x, z, 0.8)
          || Math.hypot(x, z) < getIsland().path.debug.ringOuterRadius + 1.5 || !free(x, z, 0.9)) continue;
        chillSpots.push({ x, z, ry: Math.atan2(-x, -z), sit: true });
      }
    }
    spots.push({ x: 0, z: -(MEADOW + 2.5), ry: Math.PI });
    for (const m of getIsland().mouths) {
      // Empty caves are sealed rock, not places for the crew to visit.
      const slot = slots.find((slot) => slot.id === m.id);
      if (slot.status === "dark" || slot.status === "mirror" && MIRROR_GATE_CLOSED) continue;
      spots.push({ x: m.apron.x, z: m.apron.z, ry: Math.atan2(m.x - m.apron.x, m.z - m.apron.z) });
    }
    // Leave spare destinations when the roster outgrows the original meadow pool.
    const rand = mulberry32(SEED + 5), count = Math.max(WANDER_COUNT, getRosterCount() * 2);
    for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
      const { x, z } = polar(rand() * 360, Math.sqrt(lerp(WANDER_INNER * WANDER_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
      if (getIsland().surfaceAt(x, z) !== 0 || nearMouth(x, z, 3) || npcClosedCaveAt(x, z) || !free(x, z, 0.9)) continue;
      spots.push({ x, z, ry: NaN });
      n++;
    }
  };
  const seatTaken = (s) => {
    for (let caveIndex = 0; caveIndex < getCrew().list.length; caveIndex++) {
      const cave = getCrew().list[caveIndex];
      const a = cave.act;
      if ((a.kind === "wander" || a.kind === "idle") && a.spot.x === s.x && a.spot.z === s.z) return true;
    }
    return false;
  };
  const freeSeat = () => {
    const start = Math.floor(random() * FIRE_SEATS);
    for (let i = 0; i < FIRE_SEATS; i++) {
      const s = fireSeats[(start + i) % FIRE_SEATS];
      if (!seatTaken(s)) return s;
    }
    return null;
  };
  const npcWanderPointClear = (s, cave) => {
    const feet = getIsland().surfaceAt(s.x, s.z), height = cave ? cave.bodyHeight : 1.5;
    return !npcRampRoofAt(s.x, feet, s.z) && !npcClosedCaveAt(s.x, s.z, feet, height) && !npcPileAt(s.x, feet, s.z, height) && !npcWorkZoneAt(cave, s.x, feet, s.z) && npcFireClear(s.x, feet, s.z, s.x, feet, s.z, height) && walkable(s.x, s.z, s.x, s.z, feet, height, cave);
  };
  const settleFireSeat = (cave) => {
    const radius = Math.max(PLAYER_RADIUS, cave.bodyRadius), height = cave.bodyHeight;
    const outside = getOutside();
    seats: for (const s of fireSeats) {
      // Idle chillers leave the pile's work ring; never seat them where they must immediately move.
      if (Math.hypot(s.x, s.z) < getIsland().path.debug.ringOuterRadius + 1.5
        || getIsland().surfaceAt(s.x, s.z) !== 0 || seatTaken(s) || !npcWanderPointClear(s, cave)
        || !physicalClearAt(s.x, 1e-5, s.z, radius, height, cave)
        || !propSegmentClear(s.x, 1e-5, s.z, s.x, 1e-5, s.z, radius, height, cave)) continue;
      if (!cave.nonInteractive) for (const other of getCrew().list) {
        if (other === cave || other.nonInteractive) continue;
        // Workers later in roster order already own their loading slots.
        if (other.state === "away" && other.slot && crew.stateOf(other) === "working"
          && Math.hypot(s.x - other.slot.x, s.z - other.slot.z) < radius + other.bodyRadius + 0.15) continue seats;
        if (!other.root.visible) continue;
        const p = other.root.position, feet = p.y - other.baseY;
        if (feet < height && feet + other.bodyHeight > 0
          && Math.hypot(s.x - p.x, s.z - p.z) < radius + other.bodyRadius + 0.15) continue seats;
      }
      if (!cave.nonInteractive && outside) for (const p of outside) {
        if (p.y < height && p.y + p.height > 0
          && Math.hypot(s.x - p.x, s.z - p.z) < radius + p.radius + 0.15) continue seats;
      }
      return s;
    }
    return null;
  };
  const wanderSpot = (out, cave = null, settle = false) => {
    const chilling = cave?.state === "chilling";
    let s = settle && chilling ? settleFireSeat(cave)
      : (chilling && random() < 0.6 || getStars() > NIGHT && random() < FIRE_SEAT_CHANCE) ? freeSeat() : null;
    if (s && !npcWanderPointClear(s, cave)) s = null;
    if (!s && chilling) {
      const start = Math.floor(random() * chillSpots.length);
      for (let i = 0; i < chillSpots.length; i++) {
        const candidate = chillSpots[(start + i) % chillSpots.length];
        if (candidate.x === out.x && candidate.z === out.z || seatTaken(candidate) || !npcWanderPointClear(candidate, cave)) continue;
        s = candidate; break;
      }
      if (!s) {
        s = freeSeat();
        if (s && !npcWanderPointClear(s, cave)) s = null;
      }
    }
    if (!s) {
      const start = Math.floor(random() * spots.length);
      for (let i = 0; i < spots.length; i++) {
        const candidate = spots[(start + i) % spots.length];
        if (candidate.x === out.x && candidate.z === out.z
          || seatTaken(candidate)
          || chilling && Math.hypot(candidate.x, candidate.z) < getIsland().path.debug.ringOuterRadius + 1.5
          || !npcWanderPointClear(candidate, cave)) continue;
        s = candidate; break;
      }
    }
    if (!s) return false;
    out.x = s.x;
    out.z = s.z;
    out.ry = chilling && Number.isNaN(s.ry) ? Math.atan2(-s.x, -s.z) : s.ry;
    out.sit = !!s.sit;
    return true;
  };
  const npcRecoverySpot = (cave, out) => {
    const p = cave.root.position;
    let nearest = Infinity;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i], distance = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (distance >= nearest || seatTaken(s) || !npcWanderPointClear(s, cave)) continue;
      const feet = getIsland().surfaceAt(s.x, s.z);
      let occupied = false;
      if (!cave.nonInteractive) for (let j = 0; j < getCrew().list.length; j++) {
        const other = getCrew().list[j], q = other.root.position, otherFeet = q.y - other.baseY;
        if (other.nonInteractive) continue;
        if (other !== cave && other.root.visible && feet < otherFeet + other.bodyHeight && feet + cave.bodyHeight > otherFeet
          && Math.hypot(s.x - q.x, s.z - q.z) < cave.bodyRadius + other.bodyRadius) { occupied = true; break; }
      }
      if (occupied) continue;
      nearest = distance; out.x = s.x; out.y = feet; out.z = s.z;
    }
    return Number.isFinite(nearest);
  };
    return { buildSpots, wanderSpot, npcRecoverySpot };
  };
  const fireSpot = (island, free, nearPath) => {
    for (const degrees of [130, 125, 135, 120, 140, 115, 145]) {
      const p = polar(degrees, 11.5);
      if (island.surfaceAt(p.x, p.z) === 0 && free(p.x, p.z, 1.6) && !nearPath(p.x, p.z, 1.8)) return p;
    }
    throw Error("No clear spot for the fire pit");
  };
  const fireSeatsAt = (p, count, out) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > 128 || !Array.isArray(out) || out.length)
      throw Error("bounded empty fire-seat layout required");
    for (let ring = 1; out.length < Math.max(FIRE_SEATS, count * 3); ring++) {
      const seats = FIRE_SEATS * ring, radius = 1.8 * ring;
      for (let i = 0; i < seats; i++) {
        const a = (i + 0.5) / seats * Math.PI * 2, x = p.x + Math.cos(a) * radius, z = p.z + Math.sin(a) * radius;
        out.push({ x, z, ry: Math.atan2(p.x - x, p.z - z), sit: true });
      }
    }
    return out;
  };
  // Shared authored bluff ladder. The bounded search refuses an incompatible
  // terrain instead of silently placing a different support in the host.
  const ladder = island => {
    const z = -3.6, reach = 0.65, { createNode, addChild } = BL.scene;
    if (!(island.unit > 0) || !Number.isFinite(island.unit)) throw Error("invalid ladder terrain");
    let faceX = MEADOW - 1, found = false;
    for (let i = 0; i < 1024; i++, faceX += island.unit) {
      const height = island.surfaceAt(faceX + island.unit / 2, z);
      if (!Number.isFinite(height)) throw Error("invalid ladder surface");
      if (height >= 3) { found = true; break; }
    }
    if (!found) throw Error("Hub ladder ledge missing");
    const x = faceX - reach - 0.06;
    const root = createNode({ position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: -Math.asin(reach / 4) } });
    const rungs = createNode({ rotation: { x: 0, y: Math.PI / 2, z: 0 }, geometry: BL.hubModels.ladder() });
    addChild(root, rungs);
    return { root, rungs, x, z, spot: { x: x - 1.1, z, ry: Math.PI / 2 } };
  };
  BL.npcRoutineDestinations = { create, fireSpot, fireSeatsAt, ladder };
})();
