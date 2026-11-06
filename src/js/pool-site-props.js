// Authored Mempool props, shared by browser construction and the private host.
// Seed order and placement caps belong here; presentation and wildlife updates do not.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const { createNode, addChild } = BL.scene;
  const { mulberry32 } = BL.math;
  const DEG = Math.PI / 180, BEAST_CLEAR = 1.3;
  const pauseBuild = function* () { yield; };
  const boards = (site) => {
    const P = BL.poolModels, L = BL.poolLayout, B = P.CHAIN_BOARD, boardBearing = Math.PI;
    const boardNode = createNode({ position: { x: Math.sin(boardBearing) * B.r, y: L.LEVEL.shore, z: Math.cos(boardBearing) * B.r }, rotation: { x: 0, y: boardBearing + Math.PI, z: 0 }, geometry: P.chainBoard() });
    const panelNode = createNode();
    const boardLegs = createNode({ geometry: { ...P.chainBoardLegs() } });
    addChild(boardNode, panelNode, boardLegs);
    site.boardLegs = boardLegs;
    addChild(site.node, boardNode);
    const infoBearing = boardBearing - (B.w / 2 + P.INFO_SIGN.w / 2 + 0.8) / B.r;
    const infoNode = createNode({ position: { x: Math.sin(infoBearing) * B.r, y: L.LEVEL.shore, z: Math.cos(infoBearing) * B.r }, rotation: { x: 0, y: infoBearing + Math.PI, z: 0 }, geometry: P.infoSign() });
    const infoLeg = createNode({ geometry: { ...P.infoSignLeg() } });
    addChild(infoNode, infoLeg);
    site.infoLeg = infoLeg;
    addChild(site.node, infoNode);
    return { boardNode, panelNode, infoNode };
  };
  const forest = function* ({ site, boardNode, infoNode, atNode, pause = pauseBuild }) {
    if (!site?.node || !boardNode?.position || !infoNode?.position || typeof atNode !== "function" || typeof pause !== "function")
      throw Error("Mempool forest placement providers required");
    const P = BL.poolModels, S = P.SITE, L = BL.poolLayout, B = P.CHAIN_BOARD;
    // Where an animal may stand and walk: the forest floor and the ring path, never a nest, a channel, the court,
    // the shore or the ledge.
    const beastGround = (x, z) => {
      const r = Math.hypot(x, z);
      return r < L.LAKE_R ? L.membraneY(r) : L.groundAt(x, z);
    };
    const beastSpot = (x, z) => {
      if (L.groundAt(x, z) !== L.LEVEL.ground || Math.hypot(x, z) < L.RING.lowland + 0.4) return false;
      const d = L.turn(Math.atan2(x, z), 0);
      return !(d > L.COURT.from - 0.2 && d < L.RAMP.start + 0.2 && Math.hypot(x, z) > L.RING.path - 0.5);
    };
    // The animals' starting spots are claimed before the scatter, so no plant is seeded where one stands; they
    // come alive once the forest is placed (`pool-wildlife.js`), since they walk round its trunks and climb them.
    const beastRand = mulberry32(4343), ANIMALS = [];
    for (const kind of ["jaguar", "jaguar", "monkey", "monkey", "toucan", "toucan"]) {
      for (let n = 0; n < 200; n++) {
        const a = beastRand() * Math.PI * 2, r = L.RING.lowland + 1 + beastRand() * (S.isletR - L.RING.lowland - 2), x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (!beastSpot(x, z) || L.keptClear(x, z, -0.2) && r > L.RING.path || ANIMALS.some((b) => Math.hypot(x - b[1], z - b[2]) < 6)) continue;
        ANIMALS.push([kind, x, z, beastRand() * Math.PI * 2]);
        break;
      }
    }
    const claimed = ANIMALS.map(([, x, z]) => ({ x, z, r: BEAST_CLEAR }));
    // What the animals keep off, in the island group's frame: the boards, then every trunk, rock and log the
    // scatter places. The entrance name is overhead, so it does not block the gateway.
    const obstacles = [
      { x: boardNode.position.x, z: boardNode.position.z, r: B.w / 2 }, { x: infoNode.position.x, z: infoNode.position.z, r: 0.7 }
    ];
    const trees = [], logs = [];
    // Rainforest: three canopy heights, ferns and shrubs under them, each species one shared geometry
    // and one prop kind, so every plant answers a tap the way the home island's own scatter does.
    // `r` is both the footprint it claims and the radius a pointer picks it by; `clear` is how far it
    // keeps off the paths, the nests, the channels and the court, so only its crown ever reaches over them.
    // `most` caps each kind: the crowns make the forest, and every fern and shrub is a thousand faces or two,
    // so the undergrowth is kept to what frames the paths rather than carpeting the floor.
    const SCATTER = [
      { upTo: 0.36, kind: "canopy", r: 0.6, clear: 0.55, most: 44 },
      { upTo: 0.54, kind: "bush", r: 0.55, clear: 0.35, most: 26 },
      { upTo: 0.76, kind: "poolfern", r: 0.5, clear: 0.2, most: 38 },
      { upTo: 0.88, kind: "flower", r: 0.6, clear: 0.3, most: 36 },
      { upTo: 0.95, kind: "poolrock", r: 0.7, clear: 0.7, most: 14 },
      { upTo: 2, kind: "poollog", r: 1.7, clear: 1.6, most: 8 }
    ];
    const grown = { canopy: 0, bush: 0, poolfern: 0, flower: 0, poolrock: 0, poollog: 0 };
    const rand = mulberry32(4242);
    const geometryFor = (kind) => kind === "canopy" ? P.CANOPY[(rand() * P.CANOPY.length) | 0]()
      : kind === "bush" ? P.shrub() : kind === "poolfern" ? P.fern() : kind === "flower" ? P.flowers()
        : kind === "poolrock" ? P.mossRock() : P.log();
    const inner = L.RING.lowland * L.RING.lowland, outer = (S.isletR + 0.8) * (S.isletR + 0.8), trunks = [];
    const level = (x, z, reach, ground) => L.groundAt(x + reach, z) === ground && L.groundAt(x - reach, z) === ground && L.groundAt(x, z + reach) === ground && L.groundAt(x, z - reach) === ground;
    // Planted, not scattered: trees at the back corners of every nest and behind it, so each clearing lies under
    // crowns of its own. A trunk stands clear of the beds; only its crown reaches over them.
    const planted = [];
    for (const nest of L.NESTS) for (const [across, out] of [[-L.NEST.halfT - 0.35, L.NEST.halfR - 0.3], [L.NEST.halfT + 0.35, L.NEST.halfR - 0.3], [0.3, L.NEST.halfR + 0.75], [-L.NEST.halfT - 0.5, -0.6], [L.NEST.halfT + 0.5, 0.4]]) {
      const ux = Math.sin(nest.bearing), uz = Math.cos(nest.bearing), x = ux * (L.NEST.r + out) + uz * across, z = uz * (L.NEST.r + out) - ux * across;
      const ground = L.groundAt(x, z), r = Math.hypot(x, z);
      if (!(ground >= L.LEVEL.lowland) || r + 0.5 > L.edgeAt(Math.atan2(x, z)) - 0.4 || !level(x, z, 0.3, ground)) continue;
      if (L.CHANNELS.some((channel) => r <= channel.to + 0.6 && Math.abs(L.turn(Math.atan2(x, z), channel.bearing)) * r < L.CHANNEL.low + 0.6)) continue;
      planted.push({ x, z, ground });
      trunks.push({ x, z, r: 0.6 });
    }
    // Trees rooted in the bowl's shallows, between outlets, with smaller crowns over the water.
    for (const deg of [61.5, 97.5, 133.5, 169.5, 205.5, 241.5, 277.5, 313.5]) {
      const bearing = deg * Math.PI / 180, r = L.LAKE_R;
      const x = Math.sin(bearing) * r, z = Math.cos(bearing) * r;
      planted.push({ x, z, ground: L.membraneY(r), pool: true });
      trunks.push({ x, z, r: 0.6 });
    }
    yield* pause();
    for (let i = 0; i < 3600 + planted.length; i++) {
      const fixed = i < planted.length ? planted[i] : null;
      const a = rand() * Math.PI * 2, r = Math.sqrt(inner + rand() * (outer - inner)), roll = rand();
      const x = fixed ? fixed.x : Math.sin(a) * r, z = fixed ? fixed.z : Math.cos(a) * r;
      const pick = fixed ? SCATTER[0] : SCATTER.find((e) => roll < e.upTo), ground = fixed ? fixed.ground : L.groundAt(x, z);
      if (grown[pick.kind] >= pick.most) continue;
      if (!fixed) {
        // Undergrowth takes the lowland's damp ground too; everything else wants the dry forest floor or the ridge.
        const soft = pick.kind === "poolfern" || pick.kind === "bush" || pick.kind === "flower";
        // Clear of everything that is walked, slept on or flooded, and off the rim.
        if (!(ground >= (soft ? L.LEVEL.lowland : L.LEVEL.ground)) || Math.hypot(x, z) < L.RING.path + pick.clear || L.keptClear(x, z, soft ? Math.min(pick.clear, 0.15) : pick.clear) && !(soft && ground === L.LEVEL.lowland && Math.hypot(x, z) > L.RING.path + 0.3) || r + pick.r > L.edgeAt(a) - 0.5) continue;
        // Level ground under the whole footprint: nothing stands half over a terrace's step.
        if (!level(x, z, pick.r * 0.6, ground)) continue;
        // Nothing grows through an animal, and trunks keep a body's width apart. Plants still crowd each other,
        // which is what makes it jungle.
        if (claimed.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pick.r)) continue;
        if (pick.kind === "canopy" || pick.kind === "poolrock" || pick.kind === "poollog") {
          if (trunks.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pick.r + 0.7)) continue;
          trunks.push({ x, z, r: pick.r });
        }
      }
      grown[pick.kind]++;
      const geometry = geometryFor(pick.kind);
      // A little scale and turn per copy: free variety, since every copy shares one cached build.
      const k = (0.82 + rand() * 0.45) * (fixed && fixed.pool ? 0.72 : 1);
      const node = createNode({ position: { x, y: ground, z }, rotation: { x: 0, y: rand() * Math.PI * 2, z: 0 }, scale: { x: k, y: (0.9 + rand() * 0.3) * (fixed && fixed.pool ? 0.85 : 1), z: k }, geometry });
      // Undergrowth stays out of the outline registry, as the home scatter's bushes and flowers do.
      if (pick.kind === "bush" || pick.kind === "poolfern" || pick.kind === "flower") node.sightHidden = true;
      addChild(site.node, node);
      atNode(pick.kind, node, pick.r * k);
      const feature = { x, y: ground, z, ry: node.rotation.y, k, sy: node.scale.y, geometry };
      if (pick.kind === "canopy") { trees.push(feature); obstacles.push({ x, z, r: 0.45 * k }); }
      else if (pick.kind === "poolrock") obstacles.push({ x, z, r: 0.75 * k });
      else if (pick.kind === "poollog") {
        logs.push(feature);
        const ax = Math.cos(feature.ry), az = -Math.sin(feature.ry);
        for (const t of [-1.2, 0, 1.2]) obstacles.push({ x: x + ax * t * k, z: z + az * t * k, r: 0.4 * k });
      }
    }
    yield* pause();
    // Broad leaves, fern fans and flowering thickets form a middle storey beneath the trees. A separate
    // seed leaves the established trunks, animal perches and small forest scatter where they were.
    const foliageRand = mulberry32(6417), undergrowth = P.UNDERGROWTH.map((build) => build()), thickets = [];
    const plantThicket = (geometry, x, ground, z, width, height, turn) => {
      const node = createNode({
        position: { x, y: ground, z }, rotation: { x: 0, y: turn, z: 0 },
        scale: { x: width, y: height, z: width }, geometry, sightHidden: true
      });
      addChild(site.node, node);
      atNode("bush", node, geometry.plantRadius * width);
      thickets.push({ x, y: ground, z, r: geometry.plantRadius * width, h: geometry.plantHeight * height });
    };
    // Five larger pockets behind the shoreline trees, on their path side in the flooded shallows.
    // Leaves can reach back over the water; their outer edge and sway stop before the walking path.
    let foliageIndex = 0;
    for (const [degrees, count] of [[61.5, 2], [133.5, 3], [205.5, 2], [241.5, 3], [313.5, 2]]) {
      for (let j = 0; j < count; j++) {
        const geometry = undergrowth[foliageIndex++ % undergrowth.length];
        const width = Math.min((j ? 1.04 : 1.32) + foliageRand() * 0.28, 1.78 / geometry.plantRadius);
        const radius = geometry.plantRadius * width + 0.14;
        const r = Math.min(L.LAKE_R + 0.6 + foliageRand() * 0.25, L.RING.lowland - 0.12 - radius);
        const spread = Math.max(0, 18 * DEG - Math.asin((radius + L.CHANNEL.low + 0.03) / r));
        const bearing = degrees * DEG + (j ? (j & 1 ? 1 : -1) : foliageRand() - 0.5) * spread * 0.9;
        const x = Math.sin(bearing) * r, z = Math.cos(bearing) * r;
        plantThicket(geometry, x, Math.max(L.LEVEL.shore, L.groundAt(x, z)), z,
          width, (j ? 1.35 : 1.6) + foliageRand() * 0.3, bearing + (foliageRand() - 0.5) * 1.8);
      }
    }
    // Start on the raised jungle's outer shoulders, then gather patches around trees and in forest gaps.
    // Full leaf footprints keep paths, nests and channels open; only the roots need level footing.
    const poolThickets = thickets.length, shoulders = [55, 75, 95, 115, 135, 145];
    for (let attempt = 0; attempt < 1200 && thickets.length < poolThickets + 24; attempt++) {
      const shoulder = attempt < shoulders.length * 12;
      const geometry = undergrowth[(thickets.length - poolThickets) % undergrowth.length];
      const width = Math.min(1.02 + foliageRand() * 0.3, (shoulder ? 1.42 : 1.7) / geometry.plantRadius);
      const radius = geometry.plantRadius * width + 0.12;
      const angle = shoulder ? (shoulders[(attempt / 12) | 0] + (foliageRand() - 0.5) * 9) * DEG : foliageRand() * Math.PI * 2;
      const radial = shoulder ? 18.91 + foliageRand() * 0.09
        : L.RING.path + radius + foliageRand() * (L.edgeAt(angle) - L.RING.path - 2 * radius - 0.3);
      let x = Math.sin(angle) * radial, z = Math.cos(angle) * radial;
      if (!shoulder && attempt % 3) {
        const tree = trees[(foliageRand() * trees.length) | 0];
        if (Math.hypot(tree.x, tree.z) <= L.LAKE_R + 0.1) continue;
        const offset = 1.3 + foliageRand() * 1.8;
        x = tree.x + Math.sin(angle) * offset; z = tree.z + Math.cos(angle) * offset;
      }
      const ground = L.groundAt(x, z), r = Math.hypot(x, z), bearing = Math.atan2(x, z);
      if (ground < L.LEVEL.ground || L.keptClear(x, z, radius) || r + radius > L.edgeAt(bearing) - 0.3
        || !level(x, z, 0.24 * width, ground)) continue;
      let supported = true;
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, px = x + Math.sin(a) * radius, pz = z + Math.cos(a) * radius;
        if (L.groundAt(px, pz) > ground + L.UNIT || !L.onIsland(px, pz, 0.25)) { supported = false; break; }
      }
      if (!supported) continue;
      if (claimed.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + radius)
        || obstacles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + radius * 0.55)
        || thickets.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r + radius) * 0.62)) continue;
      plantThicket(geometry, x, ground, z, width, 1.15 + foliageRand() * 0.4, angle);
    }
    // What the rain lands on above the ground: the dense middle of every crown, a dome over its cells of the
    // layout's grid. A crown's ragged edge lets the drops through, so the forest floor still sees rain between
    // the trees.
    const CROWN_CORE = 0.8, crownTop = new Float32Array(L.SX * L.SZ).fill(-Infinity);
    for (const tree of trees) {
      const c = Math.cos(tree.ry), s = Math.sin(tree.ry);
      for (const [cx, cy, cz, rx, ry] of tree.geometry.climb.crowns) {
        const x = tree.x + (cx * c + cz * s) * tree.k, z = tree.z + (cz * c - cx * s) * tree.k, r = rx * tree.k;
        const i1 = Math.min(L.SX - 1, Math.floor((x + r - L.ORIGIN.x) / L.UNIT)), k1 = Math.min(L.SZ - 1, Math.floor((z + r - L.ORIGIN.z) / L.UNIT));
        for (let i = Math.max(0, Math.floor((x - r - L.ORIGIN.x) / L.UNIT)); i <= i1; i++) for (let k = Math.max(0, Math.floor((z - r - L.ORIGIN.z) / L.UNIT)); k <= k1; k++) {
          const dx = L.ORIGIN.x + (i + 0.5) * L.UNIT - x, dz = L.ORIGIN.z + (k + 0.5) * L.UNIT - z, d = (dx * dx + dz * dz) / (r * r);
          if (d < CROWN_CORE * CROWN_CORE) crownTop[i * L.SZ + k] = Math.max(crownTop[i * L.SZ + k], tree.y + (cy + ry * 0.85 * Math.sqrt(1 - d)) * tree.sy);
        }
      }
    }
    // Dense undergrowth catches rain too; use its central mass, letting drops through the ragged leaves.
    for (const plant of thickets) {
      const r = plant.r * 0.55;
      const i1 = Math.min(L.SX - 1, Math.floor((plant.x + r - L.ORIGIN.x) / L.UNIT)), k1 = Math.min(L.SZ - 1, Math.floor((plant.z + r - L.ORIGIN.z) / L.UNIT));
      for (let i = Math.max(0, Math.floor((plant.x - r - L.ORIGIN.x) / L.UNIT)); i <= i1; i++) for (let k = Math.max(0, Math.floor((plant.z - r - L.ORIGIN.z) / L.UNIT)); k <= k1; k++) {
        const dx = L.ORIGIN.x + (i + 0.5) * L.UNIT - plant.x, dz = L.ORIGIN.z + (k + 0.5) * L.UNIT - plant.z, d = (dx * dx + dz * dz) / (r * r);
        if (d < 1) crownTop[i * L.SZ + k] = Math.max(crownTop[i * L.SZ + k], plant.y + plant.h * (0.68 + 0.2 * Math.sqrt(1 - d)));
      }
    }
    return { beastGround, beastSpot, ANIMALS, obstacles, trees, logs, crownTop };
  };
  const sleep = (M) => {
    const poolModels = BL.poolModels, L = M.layout, D = poolModels.DIR, ring = (L.RING.lowland + L.RING.path) / 2, ARC = 18 * DEG;
    const slots = L.SLOTS.map((slot) => ({
      x: M.worldX(slot.x, slot.z), y: M.place.y + slot.y, z: M.worldZ(slot.x, slot.z), heading: slot.heading + M.place.ry, nest: slot.nest, bearing: L.NESTS[slot.nest].bearing
    }));
    const path = (index, out) => {
      const bed = slots[index], to = bed.bearing - Math.PI * 2;
      let n = 0;
      const local = (lx, lz) => { out[n * 2] = M.worldX(lx, lz); out[n * 2 + 1] = M.worldZ(lx, lz); n++; };
      out[0] = D.x * (poolModels.SITE.approachFrom - 0.8); out[1] = D.z * (poolModels.SITE.approachFrom - 0.8);
      out[2] = D.x * (M.place.rimRadius - 0.3); out[3] = D.z * (M.place.rimRadius - 0.3);
      n = 2;
      local(0, L.R - 1.6); local(0, 15.4); local(0, ring);
      for (let b = -ARC; b > to + 0.05; b -= ARC) local(Math.sin(b) * ring, Math.cos(b) * ring);
      local(Math.sin(to) * ring, Math.cos(to) * ring);
      out[n * 2] = bed.x; out[n * 2 + 1] = bed.z;
      return n + 1;
    };
    return { slots, path };
  };
  BL.poolSiteProps = { boards, forest, sleep };
})();
