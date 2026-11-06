// Seeded mainland planting shared by browser and private host construction.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { mulberry32, fnv1a, clamp, lerp } = BL.math;
  const { createNode, addChild } = BL.scene;
  const hubModels = BL.hubModels, poolModels = BL.poolModels;
  const LIBRARY = BL.hubLayout.library, polar = BL.hubLayout.polar;
  const SEED = 1, DEG = Math.PI / 180, PLAYER_RADIUS = 0.3;
  const MEADOW_INNER = 5, MEADOW_OUTER = 20.5, CLIFF_INNER = 23.5, CLIFF_OUTER = 29;
  const PALM_COUNT = 8, PALM_CANDIDATES = 400, PALM_GAP = 5, PALM_INNER = 6, PALM_OUTER = MEADOW_OUTER - 2.5;
  const PALM_RUN_CLEAR = 3, PALM_STAIR_CLEAR = 6, PALM_SOUTH = 45 * DEG, PALM_PATH = 0.9;
  const ARCADE_PALM_REACH = 8, ARCADE_PALM_ALONG = 0.15;
  const SPREAD_CANDIDATES = 40, SPREAD_TRIES = 1500;
  const MATRIX_LIVING_PROPS = new Set(["tree"]);
  const workCave = slot => slot.repo && (slot.status === "open" || slot.status === "mirror");
  const plantPalms = ({ island, root, placed, solids, addProp, claim, free, nearPath,
    nearMouth, entranceClear, slots, meadowPalms, plantHammock }) => {
    const rand = mulberry32(fnv1a("palms"));
    let n = 0;
    // Level ground off the paths and stairs, with nothing else claimed where the trunk would stand.
    const stands = (x, z) => {
      const y = island.surfaceAt(x, z);
      if (nearPath(x, z, PALM_PATH) || island.overlapsStairs(x, z, 2) || !free(x, z, 1.2)) return false;
      // Level ground only: every side within a quarter metre of the foot.
      for (let i = 0; i < 4; i++) if (Math.abs(island.surfaceAt(x + Math.cos(i * 1.571) * 0.6, z + Math.sin(i * 1.571) * 0.6) - y) > 0.26) return false;
      return true;
    };
    const plant = (x, z, yaw = null) => {
      if (!stands(x, z)) return null;
      const y = island.surfaceAt(x, z);
      const variant = n++ % 3;
      const node = createNode({ geometry: BL.dressing.palm(variant), position: { x, y, z }, rotation: { x: 0, y: yaw ?? rand() * Math.PI * 2, z: 0 }, sightHidden: true });
      addChild(root, node);
      placed.push(node);
      const owner = addProp("palm", node, x, z, 1.6);
      owner.variant = variant;
      solids.add(node);
      return { owner, reservation: claim(x, z, 1.2) };
    };
    // A grove: up to `size` palms round a centre a trunk-and-crown apart (2.9 m), each standing only where it fits.
    const grove = (cx, cz, size, fits) => {
      if (size === 1) return fits(cx, cz) && plant(cx, cz) ? 1 : 0;
      let planted = 0;
      const a0 = rand() * Math.PI * 2, r = size === 2 ? 1.45 : 1.68;
      for (let k = 0; k < size; k++) {
        const a = a0 + k * Math.PI * 2 / size, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (fits(x, z) && plant(x, z)) planted++;
      }
      return planted;
    };
    const groveSize = () => {
      const r = rand();
      return r < 0.25 ? 1 : r < 0.65 ? 2 : 3;
    };
    // The gorillas' runs join every pair of work caves, from either cave's doorway step or apron (2.6 m and 5.5 m
    // out, where clankers.js walks a gorilla out and in) to either of the other's.
    const ends = slots.filter(workCave).map((slot) => {
      const m = island.mouths.find((entry) => entry.id === slot.id), sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      return [2.6, 5.5].map((d) => ({ x: m.x + sr * d, z: m.z + cr * d }));
    });
    // Where a bed trip leaves the meadow (clankerBeds' first point).
    const foot = poolModels.SITE.approachFrom - 0.8, footX = poolModels.DIR.x * foot, footZ = poolModels.DIR.z * foot;
    const runs = [];
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++)
      for (const a of ends[i]) for (const b of ends[j]) runs.push(a, b);
    const offRuns = (x, z) => {
      for (let i = 0; i < runs.length; i += 2) {
        const a = runs[i], dx = runs[i + 1].x - a.x, dz = runs[i + 1].z - a.z;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < PALM_RUN_CLEAR) return false;
      }
      return true;
    };
    // Nothing within PALM_SOUTH of due south, the meadow between the Headquarters mouths: the clearing before the
    // totems and the Oogatron's board.
    const meadowFits = (x, z) => island.surfaceAt(x, z) === 0 && !nearMouth(x, z, 6) && entranceClear(x, z, 1.2) && offRuns(x, z)
      && Math.hypot(x - footX, z - footZ) >= PALM_STAIR_CLEAR && Math.atan2(Math.abs(x), z) >= PALM_SOUTH && stands(x, z);
    // The north end: a palm either side of the pass, from the meadow's edge, the only ground there beyond the runs.
    const northPalm = (side) => {
      for (let deg = 14; deg >= 6; deg--) for (let r = MEADOW_OUTER; r >= MEADOW_OUTER - 1.5; r -= 0.25) {
        const p = polar(side * deg, r);
        if (meadowFits(p.x, p.z)) { meadowPalms.push(plant(p.x, p.z)); return; }
      }
    };
    northPalm(-1);
    northPalm(1);
    // Best candidate: of PALM_CANDIDATES seeded spots each time, the fitting one farthest from the palms already
    // standing, so they spread evenly at every distance from the pile, none nearer another than PALM_GAP. The radius
    // is drawn uniformly, not by area, so the inner meadow holds its share.
    for (let k = meadowPalms.length; k < PALM_COUNT; k++) {
      let x = 0, z = 0, best = PALM_GAP;
      for (let c = 0; c < PALM_CANDIDATES; c++) {
        const p = polar(rand() * 360, lerp(PALM_INNER, PALM_OUTER, rand()));
        let gap = Infinity;
        for (const { owner } of meadowPalms) gap = Math.min(gap, Math.hypot(owner.x - p.x, owner.z - p.z));
        if (gap > best && meadowFits(p.x, p.z)) { best = gap; x = p.x; z = p.z; }
      }
      if (best === PALM_GAP) break;
      meadowPalms.push(plant(x, z));
    }
    // The palm that stood against the hill in the library's frontage steps a couple of metres out into the meadow,
    // so the widened nook and the stone above it stand clear of its crown.
    const axis = Math.atan2(LIBRARY.x, -LIBRARY.z);
    for (const { owner, reservation } of meadowPalms) {
      if (!owner) continue;
      const r = Math.hypot(owner.x, owner.z), bearing = Math.atan2(owner.x, -owner.z);
      if (r > 20.2 || Math.abs(bearing - axis) * r > LIBRARY.width / 2 + 1.4) continue;
      const moved = r - 2.5, x = Math.sin(bearing) * moved, z = -Math.cos(bearing) * moved;
      owner.node.position.x = x; owner.node.position.z = z;
      owner.node.position.y = island.surfaceAt(x, z);
      owner.x = x; owner.z = z;
      reservation.x = x; reservation.z = z;
    }
    plantHammock(offRuns, { plant, fits: meadowFits, stands, variant: () => n % 3 });
    // Along the cliff tops, where they break the skyline.
    const cliffTop = (x, z) => island.surfaceAt(x, z) > 2.5 && !nearMouth(x, z, 5);
    for (let deg = 11, placedTop = 0; deg < 360 && placedTop < 16; deg += 34) {
      const size = groveSize();
      for (let k = 0; k < 5; k++) {
        const p = polar(deg + (rand() - 0.5) * 14, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        const planted = grove(p.x, p.z, size, cliffTop);
        if (planted) { placedTop += planted; break; }
      }
    }
  };
  const plantHammock = ({ island, root, solids, claimed, claim, nearPath, entranceClear,
    nearMouth, arcadeMouth, meadowPalms, hammockClaims }, offRuns, planting) => {
    if (!arcadeMouth) return;
    const H = BL.hubHammock, lines = island.path.centerlines;
    let spoke = null, best = Infinity;
    for (const line of lines) {
      const end = line[line.length - 1], d = Math.hypot(end.x - arcadeMouth.x, end.z - arcadeMouth.z);
      if (d < best) { best = d; spoke = line; }
    }
    // Each palm's side of the spoke, its distance from it and how far along it lies.
    const sides = [];
    for (const { owner } of meadowPalms) {
      if (!owner) continue;
      let distance = Infinity, side = 0, along = 0;
      for (let i = 0; i + 1 < spoke.length; i++) {
        const a = spoke[i], b = spoke[i + 1], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
        const t = clamp(((owner.x - a.x) * dx + (owner.z - a.z) * dz) / len2, 0, 1), px = a.x + dx * t - owner.x, pz = a.z + dz * t - owner.z;
        const d = Math.hypot(px, pz);
        if (d < distance) { distance = d; side = Math.sign(dx * (owner.z - a.z) - dz * (owner.x - a.x)); along = (i + t) / (spoke.length - 1); }
      }
      if (distance < ARCADE_PALM_REACH && along > ARCADE_PALM_ALONG && side) sides.push({ owner, side });
    }
    // A trunk at the rope attachment: its middle at TIE over its foot, turned by the palm's yaw.
    const tie = (owner) => {
      const node = owner.node, trunk = BL.dressing.palmTrunk(owner.variant, H.TIE), ry = node.rotation.y;
      return { x: node.position.x + Math.cos(ry) * trunk.x, z: node.position.z - Math.sin(ry) * trunk.x, ground: node.position.y, r: trunk.r };
    };
    let chosen = null, nearest = Infinity;
    const consider = (a, b, extra = false) => {
      const ta = tie(a.owner), tb = tie(b.owner), mid = Math.hypot((ta.x + tb.x) / 2 - arcadeMouth.x, (ta.z + tb.z) / 2 - arcadeMouth.z);
      if (mid >= nearest) return;
      const skipA = meadowPalms.find((entry) => entry.owner === a.owner)?.reservation;
      const skipB = meadowPalms.find((entry) => entry.owner === b.owner)?.reservation;
      const pathClear = (x, z, r) => !nearPath(x, z, r) && entranceClear(x, z, r) && !island.overlapsStairs(x, z, r);
      const clear = (x, z, r) => {
        if (!pathClear(x, z, r) || nearMouth(x, z, 4) || !offRuns(x, z)) return false;
        for (const c of claimed) if (c !== skipA && c !== skipB && Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
        return true;
      };
      const plan = H.plan({ a: ta, b: tb, clear, surfaceAt: island.surfaceAt, pathClear });
      if (plan) { chosen = { plan, a, b, ta, tb, extra }; nearest = mid; }
    };
    for (let i = 0; i < sides.length; i++) for (let j = i + 1; j < sides.length; j++) {
      if (sides[i].side === sides[j].side) consider(sides[i], sides[j]);
    }
    // If the sparse meadow has no pair, plant one companion palm in the same clear grass
    // patch. The full span must fit before it becomes a prop, collision or reservation.
    if (!chosen) for (const a of sides) for (const radius of [5, 5.75, 6.5]) for (let k = 0; k < 24; k++) {
      const x = a.owner.x + Math.cos(k * Math.PI / 12) * radius, z = a.owner.z + Math.sin(k * Math.PI / 12) * radius;
      if (!planting.fits(x, z)) continue;
      const owner = { x, z, variant: planting.variant(), node: { position: { x, y: island.surfaceAt(x, z), z }, rotation: { y: 0 } } };
      consider(a, { owner }, true);
    }
    if (!chosen) return;
    // Keep the near palm; move its companion toward the Arcade, beside the berry bush.
    // This authored spot uses actual trunk, path and stair clearance instead of the
    // random meadow planting's broad exclusion around the clankers' bed approach.
    const companionX = 13.5, companionZ = 4.75;
    if (chosen.extra && planting.stands(companionX, companionZ)
      && entranceClear(companionX, companionZ, 1.2) && offRuns(companionX, companionZ) && !nearMouth(companionX, companionZ, 6)) {
      const x = companionX, z = companionZ;
      const owner = { x, z, variant: planting.variant(), node: { position: { x, y: island.surfaceAt(x, z), z }, rotation: { y: 0 } } };
      consider(chosen.a, { owner }, true);
    }
    if (chosen.extra) {
      const entry = planting.plant(chosen.b.owner.x, chosen.b.owner.z, 0);
      if (!entry) return;
      meadowPalms.push(entry); chosen.b.owner = entry.owner;
    }
    const { plan } = chosen;
    const hammock = H.create({ plan, root, solids, ra: chosen.ta.r, rb: chosen.tb.r, seed: fnv1a("hammock"), anchors: [chosen.a.owner, chosen.b.owner] });
    hammock.anchors = [chosen.a.owner, chosen.b.owner];
    // Three circles along the bed's swing (its `envelope`), each covering a third of its length and its whole width.
    const { half, across } = plan.envelope, cover = Math.hypot(half / 3, across);
    for (const k of [-1, 0, 1]) hammockClaims.push(claim(plan.x + plan.ux * k * half * 2 / 3, plan.z + plan.uz * k * half * 2 / 3, cover));
    for (const seat of hammock.seats) hammockClaims.push(claim(seat.walkAt.x, seat.walkAt.z, 0.5));
    return hammock;
  };
  const scatter = function* ({ island, claim, free, nearMouth, workSceneryClear,
    entranceClear, sceneryClaims, scenery, place, props, pause }, slice) {
    const rand = mulberry32(SEED);
    const routeOverlaps = (x, z, radius) => island.path.overlaps(x, z, radius) || island.overlapsStairs(x, z, radius);
    const treeGroundClear = (geometry, x, z, y) => {
      // Scan every voxel column touched by the solid crown and a walking body's
      // radius. Four corner samples miss narrow, higher steps on cave roofs.
      const reach = geometry.treeSolidRadius + PLAYER_RADIUS, unit = island.unit, half = unit / 2;
      if (island.overlapsStairs(x, z, reach)) return false;
      // Reserve a full voxel above two units for the tallest helmeted head-look envelope.
      const rootRadius = Math.hypot(0.5, 0.25), ceiling = y + geometry.treeSolidCanopyFloor - 2.25;
      const grid = island.sightGrid, minX = Math.floor((x - reach - grid[1]) / unit), maxX = Math.floor((x + reach - grid[1]) / unit);
      const minZ = Math.floor((z - reach - grid[3]) / unit), maxZ = Math.floor((z + reach - grid[3]) / unit);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const px = grid[1] + (gx + 0.5) * unit, pz = grid[3] + (gz + 0.5) * unit;
        const distance = Math.hypot(Math.max(0, Math.abs(px - x) - half), Math.max(0, Math.abs(pz - z) - half));
        if (distance > reach) continue;
        const floor = island.surfaceAt(px, pz);
        if (floor > ceiling || distance < rootRadius && floor > y) return false;
      }
      return true;
    };
    const candidateFree = (x, z, radius) => {
      for (let i = 0; i < sceneryClaims.length; i++) {
        const c = sceneryClaims[i];
        if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return false;
      }
      return true;
    };
    // Grass is dressing: it reflows with the rest but answers no tap or Space.
    const addScenery = (geometry, x, z, ry, y, kind, footprint) => {
      const reservation = claim(x, z, footprint);
      sceneryClaims.push(reservation);
      const quiet = kind === "grass";
      const pickRadius = kind === "tree" ? BL.scene.boundsOf(geometry).radius : footprint + 0.3;
      const node = place(geometry, x, z, ry, y, quiet ? null : kind, pickRadius);
      if (quiet) node.screenCull = true;
      if (quiet || kind === "flower" || kind === "bush") node.sightHidden = true;
      if (MATRIX_LIVING_PROPS.has(kind)) node.matrixLiving = true;
      const owner = quiet ? { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: 0, active: true } : props[props.length - 1];
      owner.footprint = footprint;
      owner.scenery = true;
      owner.reservation = reservation;
      reservation.scenery = owner;
      scenery.push(owner);
      return node;
    };
    const meadowAt = () => polar(rand() * 360, Math.sqrt(lerp(MEADOW_INNER * MEADOW_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
    const meadowSpot = (x, z, radius) => island.surfaceAt(x, z) <= 0 && !nearMouth(x, z, 3.5) && workSceneryClear(x, z, radius)
      && candidateFree(x, z, radius) && free(x, z, radius) && !routeOverlaps(x, z, radius);
    const meadowTurn = (square) => square ? Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.4 : rand() * Math.PI * 2;
    const meadow = (count, radius, kind, geometryAt, square = false) => {
      for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
        const { x, z } = meadowAt();
        if (!meadowSpot(x, z, radius)) continue;
        addScenery(geometryAt(n), x, z, meadowTurn(square), 0, kind, radius);
        n++;
      }
    };
    // Best candidate: each prop takes, of SPREAD_CANDIDATES seeded spots, the fitting one farthest from those already
    // standing, clear of every open cave's doorway, drawing on to SPREAD_TRIES while none fits. The kinds are dealt
    // in turn by their share, the one furthest behind next, so each spreads as evenly as the whole.
    const spread = (kinds) => {
      const spots = [];
      let left = 0;
      for (const k of kinds) { k.n = 0; left += k.count; }
      for (; left > 0; left--) {
        let next = null;
        for (const k of kinds) if (k.n < k.count && (!next || (k.n + 0.5) / k.count < (next.n + 0.5) / next.count)) next = k;
        let x = 0, z = 0, best = -1;
        for (let c = 0; c < SPREAD_TRIES && (c < SPREAD_CANDIDATES || best < 0); c++) {
          const p = meadowAt();
          let gap = Infinity;
          for (let i = 0; i < spots.length; i += 2) gap = Math.min(gap, Math.hypot(spots[i] - p.x, spots[i + 1] - p.z));
          if (gap > best && entranceClear(p.x, p.z, next.radius) && meadowSpot(p.x, p.z, next.radius)) { best = gap; x = p.x; z = p.z; }
        }
        if (best >= 0) {
          addScenery(next.geometryAt(next.n), x, z, meadowTurn(next.square), 0, next.kind, next.radius);
          spots.push(x, z);
        }
        next.n++;
      }
    };
    const cliff = (count, radius, minHeight, kind, geometryAt, grove = false) => {
      // Safe root ledges are rarer than decorative bush sites (48000 tree tries vs 1200).
      // Bounds the seeded search while retaining the full grove on the cliffs.
      let n = 0;
      const tryAt = (x, z) => {
        const h = island.surfaceAt(x, z);
        if (h < minHeight || !free(x, z, radius) || routeOverlaps(x, z, radius)) return false;
        let clear = true;
        for (let i = 0; i < 4 && clear; i++) {
          const a = (i + 0.5) * Math.PI / 2;
          if (island.surfaceAt(x + Math.cos(a) * 1.2, z + Math.sin(a) * 1.2) > h + 1.5) clear = false;
        }
        if (!clear || nearMouth(x, z, 4) || !candidateFree(x, z, radius)) return false;
        let geometry = geometryAt(n);
        if (kind === "tree" && !treeGroundClear(geometry, x, z, h)) {
          // A narrower crown can fit a ledge that cannot clear the next variant.
          // Try each cached shape once rather than exhaust the search on that tree.
          let fits = false;
          for (let variant = 0; variant < 4 && !fits; variant++) {
            const alternate = hubModels.tree(variant);
            if (alternate === geometry) continue;
            if (treeGroundClear(alternate, x, z, h)) { geometry = alternate; fits = true; }
          }
          if (!fits) return false;
        }
        addScenery(geometry, x, z, rand() * Math.PI * 2, h, kind, radius);
        n++;
        return true;
      };
      for (let tries = 0; n < count && tries < (kind === "tree" ? 48000 : 1200); tries++) {
        const { x, z } = polar(rand() * 360, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        if (!tryAt(x, z) || !grove) continue;
        // Copses: most trees take one or two neighbours just over a footprint apart, so the cliffs read as
        // groves rather than a ring of singles. A neighbour that does not fit its ledge is simply skipped.
        const r = rand(), extra = r < 0.25 ? 0 : r < 0.65 ? 1 : 2, a0 = rand() * Math.PI * 2;
        for (let k = 0; k < extra && n < count; k++) {
          const a = a0 + k * 2.1 + (rand() - 0.5) * 0.5, d = radius * 2 + 0.2 + rand() * 0.6;
          tryAt(x + Math.cos(a) * d, z + Math.sin(a) * d);
        }
      }
    };
    yield* pause(slice);
    cliff(40, 1.4, 3, "tree", (n) => hubModels.tree(n % 4 === 3 ? 3 : n % 3), true);
    yield* pause(slice);
    cliff(30, 1, 0.5, "bush", (n) => hubModels.bush(n % 3));
    spread([
      { kind: "bush", count: 30, radius: 0.7, geometryAt: (n) => hubModels.bush(n % 3) }
    ]);
    meadow(50, 0.35, "flower", () => hubModels.flowerTuft());
    meadow(18, 0.3, "grass", () => hubModels.grass());
  };
  const sceneryReason = ({ island, workSceneryClear, chalkboardClearance, claimed }, o) => {
    const clearance = island.path.debug.ringOuterRadius + 0.25;
    if (o.node.position.y < 2 && !workSceneryClear(o.x, o.z, o.footprint)) return 3;
    if (o.prop === "bush" && chalkboardClearance) {
      const board = chalkboardClearance, dx = o.x - board.x, dz = o.z - board.z;
      const across = dx * board.rightX + dz * board.rightZ, front = dx * board.frontX + dz * board.frontZ;
      // Keep the board's face and both edges clear without moving the seeded meadow scatter.
      if (Math.abs(across) < 1.8 * BL.hubMouthDressing.chalkboard.scale + o.footprint && front > 0 && front < 2.4 + o.footprint) return 3;
    }
    if (Math.hypot(o.x, o.z) - o.footprint < clearance - 1e-9) return 1;
    if (island.path.overlaps(o.x, o.z, o.footprint) || island.overlapsStairs(o.x, o.z, o.footprint)) return 2;
    for (let i = 0; i < claimed.length; i++) {
      const c = claimed[i];
      if (!c.scenery && Math.hypot(c.x - o.x, c.z - o.z) < c.r + o.footprint) return 3;
    }
    return 0;
  };
  BL.hubMainlandPlanting = { plantPalms, plantHammock, scatter, sceneryReason };
})();
