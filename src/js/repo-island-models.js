// Merge Rock's geometry, off the main island's south rim: a small round floating island of voxel stone, a stone lip
// round its edge, a stone bridge to the lip from the top of the south stairs (where the Oogatron arches over the path),
// and a carved totem for every repository `repo-island-data.js` lists, each from the meadow totems' own kit
// (`totem-models.js`) and standing that repository's importance times Bitcoin Core's height.
//
// The island's frame: its middle at the origin, y 0 its top (the bridge's deck and the south terrace's height), north
// (-z) back toward the main island. The island turns slowly about its middle (repo-island.js), lip and all; the lip is
// round, so the bridge, which does not turn, always meets it. Bitcoin Core stands in the middle of a paved plaza, the
// rest of its section in a ring round it, and a ring path round that. Every other section has a wedge of the outer
// island between two spoke paths, clockwise from north, in `SECTIONS` order and as wide as its totems need;
// within a wedge the totems stand close in up to five rows, the most important nearest the plaza and in each row's
// middle, so the island rises to Core, every one facing out toward the lip. The section's carved sign with its badge
// lies flat in the lip at the wedge's middle, read from the lip looking in.
//
// `plan()` is the layout, pure and computed once a page from the data: every totem's place, turn, design and layout,
// the sections' wedges, signs and spokes, and the totems gathered into chunks of up to `CHUNK` neighbours, each a
// merged mesh. `designFor` gives each repository a carving of its own: its section's crests and paints, faces, wood,
// wings and studs drawn from a hash of its name, five faces for the most important down to two, and no two alike
// (the meadow's four keep their own designs). `spot(island)` finds the south rim, where the bridge leaves it, and
// the island's middle a deck's length past it, throwing if another islet comes within CLEAR of it. The ground and its
// paths are the island's own moss and cobble (`GROUND`), not the main island's grass and dirt.
//
// Geometry, each cached for the page and released with the hub's caches: `rockSteps` (the top a half-metre lattice
// painted with the plaza's bed, the paths' grout and the ground, its `collisionGeometry` a closed turned shell whose top
// is the island's top and the lip's, the lip's stonework (`lip`), the paths' cobbles, kerbs and the plaza's cobbles
// (`pavement`), and the crystals hanging under every totem in place of a rock keel (`crystals`)), `bridge()` (stone in
// island coordinates: a flagged deck whose end follows the lip's round edge, a stepped arch under it, parapets and pillars, and four lanterns
// whose glass is `glass`, with their glow points in `lamps`), `signs()` (every section's sign laid flat in the lip, never
// solid), and `chunkSteps(k, tier)`: a chunk's carvings merged at one of three details (`near`, `far`
// for across the island, `distant` for across the water) as `mesh`, the carvings walk-through; the distant
// build also gives each totem's runes (`glyphs`, for the lit bands) and all eye sockets
// (`eyes`); every detail carries its matching painted surfaces (`features`); `crystals()` is the cluster under the island, each crystal with the totems over it, and `gem(k)` the
// glowing copy of one. Nothing here runs per frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { box, bevelBox, merge, moved, turnedX, turnedY, turn, noShadow, cachedSteps, cached } = models;
  const { hexToRgb, fnv1a, mulberry32 } = math;
  const { pause, due } = BL.buildTasks;
  const TAU = Math.PI * 2;

  // The island: its radius to the lip's outer edge and its top, a half-metre lattice `soil` deep. The lip: its width, how far its top stands over the island's (a kerb's step), how far
  // its wall goes down, and its flags round. The bridge: its span from the rim to the lip, its width, the deck slab's
  // depth, the parapets' height and thickness, pillars `pillar` square and `pillarH` high every `pillarStep` metres.
  const ISLE = { R: 15.75, unit: 0.5, soil: 1.5 };
  const LIP = { width: 1.4, rise: 0.08, drop: 1.5, flags: 72, trim: 0.22 };
  const BRIDGE = { span: 16, width: 4.6, slab: 0.6, parapet: 0.82, wall: 0.4, pillar: 0.66, pillarH: 1.3, pillarStep: 4 };
  // The plan's radii: the plaza, the Core ring the rest of Core's section stands on, the ring path, the spokes' half
  // width, the least gap between two totems' reaches, the edge of the top, where the lip begins, and the middle of the
  // lip's flags, where the section plaques lie.
  const PLAN = { plaza: 2.4, coreRing: 4.1, ringIn: 5.5, ringOut: 6.5, spoke: 0.55, gap: 0.3, edge: ISLE.R - LIP.width, sign: ISLE.R - LIP.trim - (LIP.width - LIP.trim) / 2 };
  // A carving's girth, as its height, follows its importance: its scale across from the least important's to Core's
  // (`totemModels.layoutOf` keeps it near the scale its height gives, so no face is squashed).
  const GIRTH = [0.38, 0.66];
  // Up to four neighbours a chunk: few enough that merging, packing or uploading one never holds a frame for long.
  const CHUNK = 4;
  // The three details a chunk is carved at (`totemModels.carve`'s `detail`).
  const TIERS = { near: 0.45, far: 0.3, distant: 0.15 };
  // How far the island keeps from the other islets.
  const CLEAR = 8;
  // The ground's own look, moss and cobble: the ground's three tones, the grout the paths' cobbles are set in (two
  // tones) and the cobbles' and kerbs' own, and the lip's flags, grout,
  // coping, wall stones and plinth.
  const GROUND = {
    ground: ["#4e7c3a", "#5a8a44", "#41692f"], path: ["#6c675f", "#645f58"], grout: "#55524c",
    cobbles: ["#a7a195", "#948e83", "#b5afa3", "#837e74", "#9c968a"], kerbs: ["#7f7b73", "#8a867e", "#77736b"],
    lip: ["#9a9892", "#8b8983", "#a6a49e", "#7f7d77"], coping: ["#706d67", "#67645e", "#78756f"], wall: ["#7b776f", "#6e6a63", "#857f77", "#736f68"], plinth: "#5e5a54"
  };
  const P = BL.terrain.PALETTE.length;
  // The terrain's palette, then the island's own: its ground, paths, plaza and lip.
  const PALETTE = [...BL.terrain.PALETTE, ...[...GROUND.ground, ...GROUND.path, GROUND.grout, "#6a625b"].map(hexToRgb)];
  const C = { stone: 5, stoneDark: 6, dirt: 8, ground: P, groundLight: P + 1, groundDark: P + 2, path: P + 3, path2: P + 4, edge: P + 5, kerb: P + 6 };

  // ---- designs -------------------------------------------------------------------------------------------------
  // Each section's crests and paints; a carving's paint and second paint are drawn from these, never the same.
  const BTC = "#f7931a", BONE = "#e8dcc0", RED = "#a8442a", GOLD = "#f2c230", OCHRE = "#c8782e";
  const STYLES = {
    core: { crests: ["key", "orb", "star", "scroll", "shield", "chain"], paints: [BTC, "#d38a22", OCHRE], paints2: [BONE, RED, GOLD] },
    nodes: { crests: ["tower", "gear", "orb"], paints: ["#2f8f86", "#3d7a6e", "#5aa89a"], paints2: [GOLD, BONE, "#e06a3a"] },
    indexers: { crests: ["eye", "scroll", "orb"], paints: ["#3a8fc0", "#2f6f9a", "#5aa6d0"], paints2: [GOLD, BONE, "#e06a3a"] },
    libraries: { crests: ["chain", "scroll", "gear", "key"], paints: ["#b8742a", "#8a5a2a", "#c89040"], paints2: ["#3d6e5a", BONE, "#2f6f9a"] },
    lightning: { crests: ["bolt", "star", "orb"], paints: ["#7a52b0", "#5b3e96", "#9a72d0"], paints2: [GOLD, "#ffe066", BONE] },
    "lightning-tools": { crests: ["bolt", "gear", "chain"], paints: ["#5b4bb0", "#6a5ac8", "#4a3a90"], paints2: ["#f2a630", GOLD, BONE] },
    "software-wallets": { crests: ["key", "moon", "star", "headdress"], paints: ["#3f9a5a", "#2f7f4a", "#5ab070"], paints2: ["#6fb8d8", GOLD, BONE] },
    "hardware-wallets": { crests: ["shield", "key", "tower"], paints: ["#4a6fa0", "#2e4e7a", "#6a8ab8"], paints2: ["#c8ccd0", "#e06a3a", GOLD] },
    payments: { crests: ["headdress", "star", "flame"], paints: ["#4f9a3a", "#3f8a2a", "#6aaa48"], paints2: [OCHRE, GOLD, BONE] },
    privacy: { crests: ["moon", "shield", "eye"], paints: ["#3a3a48", "#4a4058", "#2a2a36"], paints2: ["#8a6ab8", "#b0a0d0", BONE] },
    mining: { crests: ["pick", "flame", "gear"], paints: ["#b8402a", "#a03020", "#c85a30"], paints2: ["#f2a630", GOLD, BONE] },
    layers: { crests: ["chain", "orb", "tower"], paints: ["#2f5fa8", "#3a78b8", "#24508a"], paints2: ["#4ac0b0", BONE, GOLD] },
    "dev-tools": { crests: ["scroll", "gear", "star"], paints: [BONE, "#d8cfb8", "#c0b8a0"], paints2: ["#2f6f9a", RED, "#3d6e5a"] },
    nostr: { crests: ["headdress", "star", "moon"], paints: ["#8e44ad", "#a05ac0", "#7a3a98"], paints2: ["#e070b0", GOLD, BONE] }
  };
  // Woods as the meadow's totems carve them: the wood, its light and its dark.
  const WOODS = [["#7a4a2a", "#8e5a34", "#4e2f18"], ["#6e5a4a", "#86725e", "#463a30"], ["#a07a50", "#b48c5e", "#6a4e30"], ["#9a4e30", "#ae6040", "#5e2e1a"],
    ["#5e4630", "#74583c", "#3a2a1c"], ["#8a6a48", "#a0805a", "#5a4430"], ["#6a3a28", "#804a34", "#40221a"], ["#7e6a52", "#968066", "#4e4232"]];
  // The meadow's four keep their carvings, and a few repositories carry the crest their work is: the BIPs a scroll,
  // the curve's library a key, the hardware wallet interface a shield.
  const MEADOW = { "bitcoin/bitcoin": "CORE", "lightningnetwork/lnd": "LND", "ElementsProject/lightning": "CLN", "btcpayserver/btcpayserver": "BTCPAY" };
  const CRESTED = { "bitcoin/bips": "scroll", "bitcoin-core/secp256k1": "key", "bitcoin-core/HWI": "shield", "lightning/bolts": "scroll", "bitcoinbook/bitcoinbook": "scroll", "mempool/mempool": "eye", "stratum-mining/stratum": "pick" };
  const FACES = ["ooga", "gorilla", "bird", "owl", "sun", "frog"];
  const faceCount = (importance) => importance >= 0.8 ? 5 : importance >= 0.55 ? 4 : importance >= 0.32 ? 3 : 2;
  // A carving's own design, `taken` the signatures already given out.
  const designFor = (repo, taken) => {
    const meadow = MEADOW[repo.repo];
    if (meadow) {
      const d = BL.totemModels.DESIGNS[meadow];
      taken.add(signature(d));
      return d;
    }
    const style = STYLES[repo.section] || STYLES["dev-tools"], h = fnv1a(repo.repo), rand = mulberry32(h);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    for (let attempt = 0; ; attempt++) {
      const n = faceCount(repo.importance), faces = [];
      for (let k = 0; k < n; k++) {
        let kind = pick(FACES);
        while (kind === faces[k - 1] || n <= 4 && faces.includes(kind)) kind = pick(FACES);
        faces.push(kind);
      }
      const wood = pick(WOODS), paint = pick(style.paints);
      let paint2 = pick(style.paints2);
      if (paint2 === paint) paint2 = BONE;
      const top = faces[faces.length - 1];
      const d = {
        faces, crest: attempt === 0 && CRESTED[repo.repo] || pick(style.crests),
        wings: top === "bird" && rand() < 0.75 ? 0.9 + rand() * 0.35 : 0, studs: repo.importance >= 0.45 && rand() < 0.5,
        wood: wood[0], lt: wood[1], dk: wood[2], paint, paint2
      };
      const key = signature(d);
      if (taken.has(key) && attempt < 64) continue;
      if (taken.has(key)) throw new Error(`Merge Rock: no design of its own for ${repo.repo}`);
      taken.add(key);
      return d;
    }
  };
  const signature = (d) => [d.faces.join("-"), d.crest, d.wood, d.paint, d.paint2, d.wings ? "w" : "", d.studs ? "s" : ""].join("|");

  // ---- the plan ------------------------------------------------------------------------------------------------
  const polar = (theta, r) => ({ x: Math.sin(theta) * r, z: -Math.cos(theta) * r });
  const outward = (x, z) => Math.atan2(x, z);
  // Spreads `row` over the arc from `a0` to `a1` at radius r, the most important in the middle, each given the room
  // its reach needs, with `hole` metres left empty at the arc's middle (the Core ring).
  const spread = (row, r, a0, a1, hole, out) => {
    const order = [];
    row.slice().sort((a, b) => b.importance - a.importance).forEach((t, k) => { if (k % 2) order.push(t); else order.unshift(t); });
    const widths = order.map((t) => 2 * t.L.reach + PLAN.gap), used = widths.reduce((a, b) => a + b, 0) + hole;
    const spare = Math.max(0, (a1 - a0) * r - used) / (order.length + 1);
    let at = a0 * r + spare, middle = (a0 + a1) / 2 * r, holeDone = !hole;
    order.forEach((t, k) => {
      if (!holeDone && at + widths[k] / 2 > middle - hole / 2) { at += hole; holeDone = true; }
      const theta = (at + widths[k] / 2) / r, p = polar(theta, r);
      out.push({ ...t, x: p.x, z: p.z, r, theta, ry: outward(p.x, p.z) });
      at += widths[k] + spare;
    });
  };
  // Packs a wedge's totems, most important first, each into the innermost free place nearest the wedge's middle: off
  // the ring path, a spoke's half width and a gap off either edge, a gap inside the lip and a gap clear of every reach
  // already placed, so a wedge fills ring by ring and the island rises toward Core. `STEP` is how finely it looks; each
  // search starts a ring's depth inside the last one placed, since the rings inside that are full.
  const STEP = 0.15;
  const packWedge = (list, from, to, lead, tail, out) => {
    const mine = [], mid = (from + to) / 2;
    let left = 0, floor = 0;
    for (const t of list) {
      const reach = t.L.reach;
      let at = null;
      for (let r = Math.max(PLAN.ringOut + PLAN.gap + reach, floor); !at && r + reach <= PLAN.edge - PLAN.gap; r += STEP) {
        const a0 = from + (lead + reach) / r, a1 = to - (tail + reach) / r, half = Math.max(a1 - mid, mid - a0);
        for (let m = 0; !at && ((m + 1) >> 1) * STEP / r <= half; m++) {
          const a = mid + ((m + 1) >> 1) * (m & 1 ? 1 : -1) * STEP / r;
          if (a < a0 || a > a1) continue;
          const x = Math.sin(a) * r, z = -Math.cos(a) * r;
          let clear = true;
          for (const u of mine) {
            const dx = x - u.x, dz = z - u.z, room = reach + u.L.reach + PLAN.gap;
            if (dx * dx + dz * dz < room * room) { clear = false; break; }
          }
          if (clear) at = { x, z, r, theta: a };
        }
      }
      if (!at) { left++; continue; }
      floor = at.r - 2 * reach - PLAN.gap;
      const placed = { ...t, ...at, ry: outward(at.x, at.z) };
      mine.push(placed);
      out.push(placed);
    }
    return left;
  };
  const plan = cached(() => {
    const D = BL.repoIslandData, TM = BL.totemModels, taken = new Set(), sections = new Map();
    for (const s of D.SECTIONS) sections.set(s.id, { ...s, totems: [] });
    D.REPOS.forEach((repo, index) => {
      const design = designFor(repo, taken);
      const word = repo.word, L = TM.layoutOf(design, repo.importance, GIRTH[0] + GIRTH[1] * repo.importance);
      sections.get(repo.section).totems.push({ index, repo: repo.repo, name: repo.name, word, section: repo.section, importance: repo.importance, design, L, seed: 9000 + index });
    });
    const placed = [], signs = [], spokes = [], wedges = [];
    // Core: Bitcoin Core in the middle facing north, the rest round it on the Core ring, facing out.
    const core = sections.get("core");
    const centre = core.totems.find((t) => t.repo === "bitcoin/bitcoin");
    placed.push({ ...centre, x: 0, z: 0, r: 0, theta: 0, ry: Math.PI });
    const ring = core.totems.filter((t) => t !== centre);
    // Spread evenly all the way round: the arc runs one gap past a full turn, so the gap across its ends is the others'.
    const ringNeed = ring.reduce((sum, t) => sum + 2 * t.L.reach + PLAN.gap, 0), ringGap = (TAU * PLAN.coreRing - ringNeed) / ring.length;
    if (ringGap < 0) throw new Error("Merge Rock: the Core ring is overfull");
    const ringRow = [];
    spread(ring, PLAN.coreRing, 0, TAU + ringGap / PLAN.coreRing, 0, ringRow);
    for (const t of ringRow) placed.push({ ...t, ry: outward(t.x, t.z) });
    // The wedges, meeting at the spokes' middles: each section's share of the circle first by the ground its totems
    // need (each reach's square with a gap) and the strips its spokes keep, then, for a few passes, packed and each
    // share scaled by how much of its wedge's ground its totems took (or more, by how many found no room), so every
    // section fills out toward the lip alike. The pass kept is the one where all fit and the emptiest wedge is fullest,
    // the first where every wedge is past 85% full.
    const outer = [...sections.values()].filter((s) => s.id !== "core"), depth = PLAN.edge - PLAN.ringOut;
    const edge = PLAN.spoke + PLAN.gap * 0.5, reachable = (PLAN.edge - PLAN.gap) ** 2 - PLAN.ringOut ** 2;
    const lists = outer.map((s) => s.totems.slice().sort((a, b) => b.importance - a.importance || a.index - b.index));
    const need = outer.map((s) => s.totems.reduce((sum, t) => sum + (2 * t.L.reach + PLAN.gap) ** 2, 0) + 2 * edge * depth);
    let packed = null, best = null, bestFill = -Infinity;
    for (let pass = 0; pass < 5; pass++) {
      const total = need.reduce((a, b) => a + b, 0);
      let theta = 0;
      packed = outer.map((s, k) => {
        const from = theta, to = theta + TAU * need[k] / total, out = [];
        theta = to;
        const left = packWedge(lists[k], from, to, edge, edge, out);
        const far = out.reduce((most, t) => Math.max(most, Math.hypot(t.x, t.z) + t.L.reach), PLAN.ringOut);
        return { s, from, to, out, left, fill: left ? 1 + 2 * left / lists[k].length : (far * far - PLAN.ringOut ** 2) / reachable };
      });
      const least = packed.every((w) => !w.left) ? Math.min(...packed.map((w) => w.fill)) : -Infinity;
      if (!best || least > bestFill) { best = packed; bestFill = least; }
      if (bestFill > 0.85) break;
      need.forEach((n, k) => { need[k] = n * Math.max(0.5, packed[k].fill) ** 0.7; });
    }
    for (const { s, from, to, out, left } of best) {
      if (left) throw new Error(`Merge Rock: the ${s.name} wedge has no room for ${left} more`);
      wedges.push({ id: s.id, name: s.name, badge: s.badge, from, to, count: s.totems.length });
      spokes.push(from);
      const sp = polar((from + to) / 2, PLAN.sign);
      signs.push({ id: s.id, name: s.name, badge: s.badge, x: sp.x, z: sp.z, ry: outward(sp.x, sp.z) });
      placed.push(...out);
    }
    // Chunks: Core's middle and ring, then each wedge ring by ring across it.
    const chunks = [];
    const gather = (list) => {
      for (let k = 0; k < list.length; k += CHUNK) chunks.push(list.slice(k, k + CHUNK).map((t) => t.at));
    };
    placed.forEach((t, at) => { t.at = at; });
    gather(placed.filter((t) => t.section === "core"));
    for (const w of wedges) gather(placed.filter((t) => t.section === w.id).sort((a, b) => a.r - b.r || a.theta - b.theta));
    const bounds = chunks.map((list) => {
      let x = 0, z = 0;
      for (const at of list) { x += placed[at].x; z += placed[at].z; }
      x /= list.length; z /= list.length;
      let radius = 0;
      for (const at of list) radius = Math.max(radius, Math.hypot(placed[at].x - x, placed[at].z - z) + placed[at].L.reach);
      return { x, z, radius };
    });
    // No two reaches may touch, nor any reach a path.
    for (let a = 0; a < placed.length; a++) {
      const t = placed[a];
      for (let b = a + 1; b < placed.length; b++) {
        const u = placed[b];
        if (Math.hypot(t.x - u.x, t.z - u.z) < t.L.reach + u.L.reach + PLAN.gap * 0.5) throw new Error(`Merge Rock: ${t.repo} and ${u.repo} stand too close`);
      }
      if (t.r && pathAt(t.x, t.z, spokes, t.L.reach * 0.5)) throw new Error(`Merge Rock: ${t.repo} stands on a path`);
    }
    return { totems: placed, chunks, bounds, signs, spokes, wedges, byIndex: D.REPOS.map((_, i) => placed.find((t) => t.index === i)) };
  });

  // Whether (x, z) lies on a path, widened by `pad`: the ring path and the spokes between wedges.
  const pathAt = (x, z, spokes, pad = 0) => {
    const r = Math.hypot(x, z);
    if (r >= PLAN.ringIn - pad && r <= PLAN.ringOut + pad) return true;
    if (r < PLAN.ringOut || r > PLAN.edge) return false;
    for (const a of spokes) {
      const along = x * Math.sin(a) - z * Math.cos(a), across = x * Math.cos(a) + z * Math.sin(a);
      if (along > 0 && Math.abs(across) <= PLAN.spoke + pad) return true;
    }
    return false;
  };

  // ---- where it stands -----------------------------------------------------------------------------------------
  // The south rim straight out from the stairs, the terrace's height there, and the island's middle in the world.
  const spot = (island) => {
    let rim = 24;
    while (rim < 36 && island.surfaceAt(0, rim + 0.1) > 0.5) rim += 0.1;
    const y = island.surfaceAt(0, rim - 0.3), z = rim + BRIDGE.span + ISLE.R;
    // The other islets stay well clear: the Mempool island where its spot puts it, and the Timechain Sphere anywhere
    // out along its bearing, as ₿IFRÖST's islet checks them.
    const pool = BL.poolModels.spot(island, {}), T = BL.timechainModels, out = Math.max(0, z * T.DIR.z);
    for (const [name, ox, oz, r] of [["Mempool island", pool.x, pool.z, BL.poolModels.SITE.reach], ["Timechain Sphere", T.DIR.x * out, T.DIR.z * out, T.SITE.radius]]) {
      const apart = Math.hypot(ox, z - oz) - r - ISLE.R;
      if (apart < CLEAR) throw new Error(`Merge Rock comes within ${apart.toFixed(1)} m of the ${name}`);
    }
    return { x: 0, y, z, rim };
  };

  // ---- the rock ------------------------------------------------------------------------------------------------
  const noise = (x, z) => Math.sin(x * 0.41 + 1.3) * Math.cos(z * 0.37 - 0.7) + 0.5 * Math.sin((x + z) * 0.23 + 2.1);
  // The colour of the top at (x, z), the lattice cell (ix, iz): the plaza's cobble bed, the grout the
  // paths' cobbles are set in, and the ground.
  const topAt = (x, z, ix, iz, spokes) => {
    const r = Math.hypot(x, z);
    if (r > PLAN.edge) return C.kerb;
    if (r < PLAN.plaza || pathAt(x, z, spokes)) return (ix + iz) % 2 ? C.path2 : C.path;
    const n = noise(x, z);
    return n > 0.75 ? C.groundLight : n < -0.75 ? C.groundDark : C.ground;
  };

  // ---- stonework -----------------------------------------------------------------------------------------------
  // A face through `pts` ([x, y, z] corners), wound to face away from (hx, hy, hz), a point inside its piece.
  const facet = (g, pts, hx, hy, hz, color, emissive = 0) => {
    const [a, b, c] = pts, n = pts.length;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let mx = 0, my = 0, mz = 0;
    for (const p of pts) { mx += p[0] / n; my += p[1] / n; mz += p[2] / n; }
    if ((uy * vz - uz * vy) * (mx - hx) + (uz * vx - ux * vz) * (my - hy) + (ux * vy - uy * vx) * (mz - hz) < 0) pts = pts.slice().reverse();
    const i = [];
    for (const p of pts) { i.push(g.verts.length / 3); g.verts.push(p[0], p[1], p[2]); }
    g.faces.push(emissive ? { i, color, emissive } : { i, color });
  };
  const ringAt = (r, a, y) => [Math.sin(a) * r, y, -Math.cos(a) * r];
  // A stone of the ring between radii r0 and r1, bearings a0 and a1, heights y0 and y1.
  const block = (g, r0, r1, a0, a1, y0, y1, color) => {
    const h = ringAt((r0 + r1) / 2, (a0 + a1) / 2, (y0 + y1) / 2), q = (pts) => facet(g, pts, h[0], h[1], h[2], color);
    q([ringAt(r0, a0, y1), ringAt(r1, a0, y1), ringAt(r1, a1, y1), ringAt(r0, a1, y1)]);
    q([ringAt(r1, a0, y0), ringAt(r1, a1, y0), ringAt(r1, a1, y1), ringAt(r1, a0, y1)]);
    q([ringAt(r0, a0, y0), ringAt(r0, a0, y1), ringAt(r0, a1, y1), ringAt(r0, a1, y0)]);
    q([ringAt(r0, a0, y0), ringAt(r1, a0, y0), ringAt(r1, a0, y1), ringAt(r0, a0, y1)]);
    q([ringAt(r0, a1, y0), ringAt(r0, a1, y1), ringAt(r1, a1, y1), ringAt(r1, a1, y0)]);
  };
  // A laid stone at (x, z), `hl` long along (dx, dz) and `hw` across, from y0 to y1, its top drawn in to `taper`.
  const stone = (g, x, z, dx, dz, hl, hw, y0, y1, taper, color) => {
    const at = (sl, sw, y, k) => [x + (dx * sl * hl - dz * sw * hw) * k, y, z + (dz * sl * hl + dx * sw * hw) * k];
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]], bottom = corners.map(([a, b]) => at(a, b, y0, 1)), top = corners.map(([a, b]) => at(a, b, y1, taper));
    const hy = (y0 + y1) / 2;
    facet(g, top, x, hy, z, color);
    for (let k = 0; k < 4; k++) facet(g, [bottom[k], bottom[(k + 1) % 4], top[(k + 1) % 4], top[k]], x, hy, z, color);
  };
  const shades = (rand, list) => () => hexToRgb(list[Math.floor(rand() * list.length)]);

  // The lip: two rows of flags in grout over the ring, staggered, each a few millimetres off true; a coping round its
  // edge, a little over the wall; the wall in three courses of stones over a grout backing, staggered and a little
  // proud of one another, on a plinth; and its skirt tucked in under the island and its inner wall hiding the
  // lattice's stepped edge, which runs on under it.
  const LIP_FLAGS = 96, WALL_STONE = 1.05;
  const lipGeometry = () => {
    const R = ISLE.R, Ri = PLAN.edge, top = LIP.rise, band = R - LIP.trim, mid = (Ri + band) / 2, rand = mulberry32(0x11b1);
    const flag = shades(rand, GROUND.lip), coping = shades(rand, GROUND.coping), wall = shades(rand, GROUND.wall), plinth = hexToRgb(GROUND.plinth);
    const g = { verts: [], faces: [], lines: [] }, n = LIP_FLAGS;
    const bed = merge(turn([[band, top - 0.03], [Ri, top - 0.03]], n, GROUND.grout), turn([[Ri, top - 0.03], [Ri, -0.1], [R - 0.9, -LIP.drop - 0.4]], n, GROUND.grout),
      turn([[R - 0.9, -LIP.drop - 0.4], [R - 0.05, -LIP.drop - 0.12]], n, GROUND.plinth), turn([[R - 0.05, -LIP.drop - 0.12], [R - 0.05, 0.012]], n, GROUND.grout));
    [[Ri + 0.012, mid - 0.012], [mid + 0.012, band - 0.012]].forEach(([r0, r1], row) => {
      for (let k = 0; k < n; k++) {
        const a0 = (k + row * 0.5) / n * TAU, a1 = a0 + TAU / n, gap = 0.012 / r1;
        block(g, r0, r1, a0 + gap, a1 - gap, top - 0.05, top - 0.004 + rand() * 0.008, flag());
      }
    });
    for (let k = 0; k < n / 2; k++) {
      const a0 = k / (n / 2) * TAU, a1 = a0 + TAU / (n / 2), gap = 0.01 / R;
      block(g, band, R + 0.04, a0 + gap, a1 - gap, 0.012, top + 0.006, coping());
    }
    const courses = 3, y1 = 0.004, y0 = -LIP.drop + 0.1, h = (y1 - y0) / courses, count = Math.round(TAU * R / WALL_STONE);
    for (let c = 0; c < courses; c++) for (let k = 0; k < count; k++) {
      const a0 = (k + (c % 2) * 0.5) / count * TAU, a1 = a0 + TAU / count, gap = 0.016 / R;
      block(g, R - 0.06, R + 0.004 + rand() * 0.018, a0 + gap, a1 - gap, y1 - (c + 1) * h + 0.008, y1 - c * h - 0.008, wall());
    }
    for (let k = 0; k < n / 2; k++) {
      const a0 = k / (n / 2) * TAU, a1 = a0 + TAU / (n / 2), gap = 0.01 / R;
      block(g, R - 0.06, R + 0.035, a0 + gap, a1 - gap, -LIP.drop - 0.12, y0 - 0.006, plinth);
    }
    return merge(bed, g);
  };

  // The paths' paving: cobbles in staggered rows set in the lattice's grout, kerbstones along both edges of every path
  // (the ring path's outer kerb broken where a spoke leaves it), and the plaza's matching cobbles round Bitcoin Core.
  const COBBLE = 0.26, KERB = 0.07;
  const paveSteps = function* (slice, spokes) {
    const g = { verts: [], faces: [], lines: [] }, rand = mulberry32(0xc0bb1e), cobble = shades(rand, GROUND.cobbles), kerb = shades(rand, GROUND.kerbs);
    const lay = (x, z, dx, dz, size) => {
      const turn = (rand() - 0.5) * 0.18, c = Math.cos(turn), sn = Math.sin(turn), k = 0.92 + rand() * 0.08;
      stone(g, x, z, dx * c - dz * sn, dz * c + dx * sn, size / 2 * k, size / 2 * (0.92 + rand() * 0.08), -0.01, 0.024 + rand() * 0.014, 0.8, cobble());
    };
    // The ring path: its kerbs, then its cobbles in rows round it, each row half a cobble on from the last.
    const r0 = PLAN.ringIn + 2 * KERB, r1 = PLAN.ringOut - 2 * KERB, rows = Math.max(1, Math.round((r1 - r0) / COBBLE)), size = (r1 - r0) / rows;
    for (const [r, outer] of [[PLAN.ringIn + KERB, false], [PLAN.ringOut - KERB, true]]) {
      const count = Math.round(TAU * r / 0.5);
      for (let k = 0; k < count; k++) {
        const a = (k + 0.5) / count * TAU, x = Math.sin(a) * r, z = -Math.cos(a) * r;
        if (outer && spokes.some((s) => Math.abs(x * Math.cos(s) + z * Math.sin(s)) < PLAN.spoke + 0.2 && x * Math.sin(s) - z * Math.cos(s) > 0)) continue;
        stone(g, x, z, Math.cos(a), Math.sin(a), 0.235, KERB - 0.008, -0.01, 0.045, 0.88, kerb());
      }
    }
    for (let row = 0; row < rows; row++) {
      const r = r0 + (row + 0.5) * size, count = Math.round(TAU * r / COBBLE);
      for (let k = 0; k < count; k++) {
        const a = (k + (row % 2) * 0.5) / count * TAU;
        lay(Math.sin(a) * r, -Math.cos(a) * r, Math.cos(a), Math.sin(a), Math.min(size, TAU * r / count) - 0.03);
      }
      yield* pause(slice);
    }
    // Every spoke: its kerbs along both edges and its cobbles in rows across it, staggered, out to the lip.
    const across = 2 * (PLAN.spoke - 2 * KERB), lanes = Math.max(1, Math.round(across / COBBLE)), lane = across / lanes;
    for (const s of spokes) {
      const ax = Math.sin(s), az = -Math.cos(s), cx = Math.cos(s), cz = Math.sin(s);
      for (const side of [-1, 1]) for (let d = PLAN.ringOut + 0.25; d < PLAN.edge - 0.1; d += 0.5) {
        const o = side * (PLAN.spoke - KERB);
        stone(g, ax * d + cx * o, az * d + cz * o, ax, az, 0.235, KERB - 0.008, -0.01, 0.045, 0.88, kerb());
      }
      for (let d = PLAN.ringOut + COBBLE / 2 + 0.02, row = 0; d < PLAN.edge - COBBLE / 2; d += COBBLE, row++) {
        for (let k = 0; k < lanes + (row % 2); k++) {
          const o = -across / 2 + (k + (row % 2 ? 0 : 0.5)) * lane;
          if (Math.abs(o) > across / 2 - lane * 0.3) continue;
          lay(ax * d + cx * o, az * d + cz * o, ax, az, Math.min(lane, COBBLE) - 0.03);
        }
      }
      yield* pause(slice);
    }
    // The same staggered cobbles as the paths, right out to the plaza's edge.
    for (let row = 0, z = -PLAN.plaza + COBBLE / 2; z < PLAN.plaza; z += COBBLE, row++) {
      for (let x = -PLAN.plaza + (row % 2 ? COBBLE : COBBLE / 2); x < PLAN.plaza; x += COBBLE) {
        if (Math.hypot(x, z) < PLAN.plaza - COBBLE / 2) lay(x, z, 1, 0, COBBLE - 0.03);
      }
      yield* pause(slice);
    }
    return g;
  };

  // ---- the crystals --------------------------------------------------------------------------------------------
  // The island's underside is a crystal cave's ceiling turned to the sky: a dark rock matrix, lumpy and deepest under
  // the middle, hidden under a carpet of short crystals packed so their roots touch (`carpet` of them on a
  // sunflower's spiral, longer toward the middle) and grown with clusters of amethyst quartz, each a slender lead
  // crystal and a few shorter ones leaning off it from one root. Every crystal is a six-sided prism of unequal
  // faces under a six-faced point a little off its axis, zoned as amethyst is, deep at its root to pale at its point,
  // in one of a few hues between pink and blue, and see-through (`glass`), the carpet a little less (`carpetGlass`). Clusters stand on a
  // sunflower's spiral, the middle's longest and thickest; each grows mostly down and a little out along the rock, so
  // the ceiling's silhouette is one rounded mass, lowest under Bitcoin Core. Each cluster stands under the totems
  // nearer it than any other (`crystals()`'s `totems`, places in `plan().totems`); while they are lit the runtime lays
  // luminous facets (`gem(k, band)`) over each shell, tinted by smoothly tapering light from nearby lit totems.
  const CRYSTAL = {
    hues: [["#291738", "#49305f", "#79618f", "#a38cb5"], ["#321a3b", "#57305f", "#8e5f94", "#b58fb5"], ["#202137", "#383b61", "#646c98", "#949dbb"]],
    core: ["#ff5ad2", "#7a8cff", "#ffc2ee"], rock: ["#2b2430", "#342b3a", "#251f2a", "#3d3244"],
    depth: 3, clusters: 150, satellites: [4, 8], carpet: 1800, glass: 0.86, carpetGlass: 0.93, lightRange: 4.5, lightBands: 8
  };
  const BASE_R = PLAN.edge + 0.4, HUES = CRYSTAL.hues.map((h) => h.map(hexToRgb)), CORE = CRYSTAL.core.map(hexToRgb), ROCK = CRYSTAL.rock.map(hexToRgb);
  // The rock's underside at (x, z): deepest under the middle, lumpy, rising to the soil's underside at the rim.
  const rockY = (x, z) => {
    const k = Math.min(1, Math.hypot(x, z) / BASE_R);
    return Math.min(-ISLE.soil, -ISLE.soil - CRYSTAL.depth * (1 - k * k) ** 1.2 + (0.45 * noise(x * 0.9, z * 0.9) + 0.2 * noise(x * 2.3 + 5, z * 2.3 - 3)) * (1 - k ** 4));
  };
  // The rock's outward normal there, facing down and out.
  const rockNormal = (x, z) => {
    const e = 0.25, dx = (rockY(x + e, z) - rockY(x - e, z)) / (2 * e), dz = (rockY(x, z + e) - rockY(x, z - e)) / (2 * e), l = Math.hypot(dx, 1, dz);
    return [dx / l, -1 / l, dz / l];
  };
  // A quartz crystal rooted at (x, y, z) (sunk a little into the rock) along (ax, ay, az), `r` across and `len` long:
  // `sides` unequal prism faces, zoned with six sides from `c[0]` at the root to `c[1]`, under a point a little off
  // its axis whose faces take `c[2]` and `c[3]` by turns, as quartz's larger and smaller rhombs catch the light apart.
  const quartz = (g, x, y, z, ax, ay, az, r, len, c, rand, sides = 6, emissive = 0, zoned = sides === 6) => {
    const al = Math.hypot(ax, ay, az);
    ax /= al; ay /= al; az /= al;
    let ux = -az, uz = ax, ul = Math.hypot(ux, uz);
    if (ul < 1e-6) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    const vx = ay * uz, vy = az * ux - ax * uz, vz = -ay * ux;
    const twist = rand() * TAU, point = r * (1.1 + rand() * 0.4), sink = Math.min(0.25, len * 0.15), top = sink + Math.max(len - point, len * 0.4), offs = [], radii = [];
    for (let k = 0; k < sides; k++) { offs.push(twist + (k + (rand() - 0.5) * 0.25) / sides * TAU); radii.push(0.88 + rand() * 0.22); }
    const sx = x - ax * sink, sy = y - ay * sink, sz = z - az * sink;
    const ring = (t, s) => offs.map((a, k) => {
      const cu = Math.cos(a) * r * s * radii[k], cv = Math.sin(a) * r * s * radii[k];
      return [sx + ax * t + ux * cu + vx * cv, sy + ay * t + vy * cv, sz + az * t + uz * cu + vz * cv];
    });
    const rings = zoned ? [ring(0, 0.9), ring(top * 0.45, 0.97), ring(top, 1)] : [ring(0, 0.85), ring(top, 1)];
    const end = top + point, lu = (rand() - 0.5) * 0.24 * r, lv = (rand() - 0.5) * 0.24 * r;
    const tip = [sx + ax * end + ux * lu + vx * lv, sy + ay * end + vy * lv, sz + az * end + uz * lu + vz * lv];
    const hx = sx + ax * end * 0.5, hy = sy + ay * end * 0.5, hz = sz + az * end * 0.5;
    for (let s = 0; s + 1 < rings.length; s++) for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      facet(g, [rings[s][k], rings[s][k1], rings[s + 1][k1], rings[s + 1][k]], hx, hy, hz, rings.length === 3 ? c[s] : c[1], emissive);
    }
    const last = rings[rings.length - 1];
    for (let k = 0; k < sides; k++) facet(g, [last[k], last[(k + 1) % sides], tip], hx, hy, hz, c[2 + k % 2], emissive);
  };
  const crystals = cached(() => {
    const P = plan(), n = CRYSTAL.clusters, spread = BASE_R - 0.9, golden = Math.PI * (3 - Math.sqrt(5)), list = [], sites = [];
    for (let k = 0; k < n; k++) {
      const rand = mulberry32(fnv1a(`crystal-cluster/${k}`)), at = spread * Math.sqrt(Math.max(0, k + (k ? rand() * 0.6 - 0.3 : 0)) / (n - 1)), a = k * golden + (rand() - 0.5) * 0.3;
      const x = Math.sin(a) * at, z = -Math.cos(a) * at, [nx, ny, nz] = rockNormal(x, z), f = 1 - Math.min(1, at / BASE_R) ** 1.6;
      const len = 1 + 7.5 * f ** 1.3 * (0.85 + rand() * 0.25), r = 0.1 + 0.28 * f * (0.85 + rand() * 0.3);
      const dx = nx * 0.35 + (rand() - 0.5) * 0.18, dy = ny * 0.35 - 0.65, dz = nz * 0.35 + (rand() - 0.5) * 0.18;
      const hue = HUES[Math.floor(rand() * HUES.length)], site = { x, z, totems: [], neighbours: [] };
      sites.push(site);
      const grow = (px, pz, ax, ay, az, w, l) => list.push({ x: px, y: rockY(px, pz), z: pz, ax, ay, az, r: w, len: l, hue, seed: fnv1a(`crystal/${list.length}`), totems: site.totems, neighbours: site.neighbours });
      grow(x, z, dx, dy, dz, r, len);
      for (let m = 0, [few, most] = CRYSTAL.satellites, count = few + Math.floor(rand() * (most - few + 1)); m < count; m++) {
        const turn = rand() * TAU, off = r * (0.9 + rand() * 0.8), ox = Math.cos(turn), oz = Math.sin(turn), tilt = 0.25 + rand() * 0.45;
        grow(x + ox * off, z + oz * off, dx + ox * tilt, dy, dz + oz * tilt, r * (0.4 + rand() * 0.35), len * (0.3 + rand() * 0.45));
      }
    }
    P.totems.forEach((t, at) => {
      let best = sites[0], near = Infinity;
      for (const s of sites) { const d = (s.x - t.x) ** 2 + (s.z - t.z) ** 2; if (d < near) { near = d; best = s; } }
      best.totems.push(at);
      for (const site of sites) if ((site.x - t.x) ** 2 + (site.z - t.z) ** 2 < CRYSTAL.lightRange ** 2) site.neighbours.push(at);
    });
    // The short crystals belong to the same lighting map as the large clusters. Each follows its nearest
    // totem directly and catches a weaker wash from other lit totems within the neighbouring patch.
    const rand = mulberry32(0xd5e5), count = CRYSTAL.carpet, carpetSpread = BASE_R * 0.985, step = Math.sqrt(Math.PI * carpetSpread * carpetSpread / count);
    for (let k = 0; k < count; k++) {
      const r0 = carpetSpread * Math.sqrt((k + 0.5) / count), a = k * golden;
      const x = Math.sin(a) * r0 + (rand() - 0.5) * step * 0.4, z = -Math.cos(a) * r0 + (rand() - 0.5) * step * 0.4;
      const [nx, ny, nz] = rockNormal(x, z), f = 1 - Math.min(1, r0 / BASE_R) ** 1.6, r = step * 0.62 * (0.85 + rand() * 0.3);
      const c = { x, y: rockY(x, z), z, ax: nx * 0.6 + (rand() - 0.5), ay: ny * 0.6 - 0.4, az: nz * 0.6 + (rand() - 0.5),
        r, len: r * (2 + rand() * 2) * (1 + 1.2 * f), hue: HUES[Math.floor(rand() * HUES.length)], seed: fnv1a(`crystal-carpet/${k}`), short: true, totems: [], neighbours: [] };
      let nearest = 0, distance = Infinity;
      P.totems.forEach((t, at) => {
        const d = (t.x - x) ** 2 + (t.z - z) ** 2;
        if (d < distance) { nearest = at; distance = d; }
        if (d < CRYSTAL.lightRange ** 2) c.neighbours.push(at);
      });
      c.totems.push(nearest);
      list.push(c);
    }
    return list;
  });
  // A crystal's luminous facets, with a baked tint and emission level for the runtime's source-totem groups.
  const gems = models.scopedMap();
  const gem = (k, band = CRYSTAL.lightBands - 1) => {
    const key = k * CRYSTAL.lightBands + band;
    let g = gems.get(key);
    if (!g) {
      const c = crystals()[k];
      g = { verts: [], faces: [], lines: [] };
      // The outer facets carry a tint proportional to local light, rather than switching to a
      // bright shell as soon as any neighbour is lit. Keep the original crystal colors at the dim edge.
      const level = (band + 1) / CRYSTAL.lightBands, light = [CORE[1], CORE[0], CORE[2], CORE[1]];
      const colors = c.hue.map((color, i) => color.map((v, channel) => v + (light[i][channel] - v) * level * 0.65));
      quartz(g, c.x, c.y, c.z, c.ax, c.ay, c.az, c.r, c.len, colors, mulberry32(c.seed), 6, level, !c.short);
      gems.set(key, g);
    }
    return g;
  };
  // The ceiling: its rock (faceted, lumpy, opaque), its carpet of crystals and its clusters, each in its own glass.
  const crystalSteps = function* (slice) {
    const rock = { verts: [], faces: [], lines: [] }, carpet = { verts: [], faces: [], lines: [] }, glass = { verts: [], faces: [], lines: [] }, rings = 14, segs = 44;
    const at = (i, j) => { const r = BASE_R * i / rings, a = (j + (i % 2) * 0.5) / segs * TAU, x = Math.sin(a) * r, z = -Math.cos(a) * r; return [x, rockY(x, z), z]; };
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1), tone = (k) => ROCK[fnv1a(`rock/${i}/${j}/${k}`) % ROCK.length];
      facet(rock, [a, c, d], 0, 5, 0, tone(0));
      if (i) facet(rock, [a, d, b], 0, 5, 0, tone(1));
    }
    for (const c of crystals()) {
      quartz(c.short ? carpet : glass, c.x, c.y, c.z, c.ax, c.ay, c.az, c.r, c.len, c.hue, mulberry32(c.seed), 6, 0, !c.short);
      if (due(slice, 31)) yield* pause(slice);
    }
    glass.glass = CRYSTAL.glass;
    carpet.glass = CRYSTAL.carpetGlass;
    return { crystals: noShadow(glass), carpet: noShadow(carpet), base: noShadow(rock) };
  };

  const packed = (g) => { if (BL.compactGeometry?.enabled) BL.compactGeometry.pack(g, { immutable: true, renderOnly: true }); return g; };
  const rockSteps = cachedSteps(function* (slice) {
    const T = BL.terrain, P = plan(), u = ISLE.unit, n = Math.ceil(2 * (ISLE.R + 0.5) / u), soil = Math.round(ISLE.soil / u);
    const top = T.makeGrid(n, soil, n), half = n * u / 2;
    for (let ix = 0; ix < n; ix++) {
      if (due(slice, 7)) yield* pause(slice);
      for (let iz = 0; iz < n; iz++) {
        const x = -half + (ix + 0.5) * u, z = -half + (iz + 0.5) * u, r = Math.hypot(x, z);
        // On under the lip far enough that no gap shows between the lattice's steps and the lip's inner wall.
        if (r > PLAN.edge + 0.45) continue;
        const colour = topAt(x, z, ix, iz, P.spokes);
        for (let iy = 0; iy < soil; iy++) top.set(ix, iy, iz, iy === soil - 1 ? colour : iy ? C.dirt : C.stoneDark);
      }
    }
    const soilGeo = yield* T.gridGeometrySteps(top, { unit: u, palette: PALETTE, origin: { x: -half, y: -ISLE.soil, z: -half } }, slice);
    yield* pause(slice);
    const pavement = packed(yield* paveSteps(slice, P.spokes));
    yield* pause(slice);
    const mass = yield* crystalSteps(slice);
    // The walking shell: the top as a flat disc at y 0 and the lip's ring a step over it, closed under the soil and
    // the lip's skirt. The crystals are never in anyone's way.
    const shell = turn([[0, 0], [PLAN.edge, 0], [PLAN.edge, LIP.rise], [ISLE.R, LIP.rise], [ISLE.R, -LIP.drop], [ISLE.R - 0.9, -LIP.drop - 0.4], [0, -LIP.drop - 0.4]].reverse(), 48, "#000000");
    soilGeo.collisionGeometry = shell;
    return { soil: soilGeo, lip: packed(lipGeometry()), pavement, crystals: mass.crystals, carpet: mass.carpet, crystalBase: packed(mass.base) };
  });

  // ---- the bridge ----------------------------------------------------------------------------------------------
  const STONES = ["#8b837b", "#7a716a", "#958d84", "#857c74"];
  const bridge = cached(() => {
    const parts = [], glass = [], frame = [], lamps = [];
    // The deck ends a few centimetres off the lip's round edge, clear of its stones and under its coping: at its middle
    // (`to`) and, a flag at a time, on toward it where the edge curves away, so no gap shows beside the turning lip.
    const end = ISLE.R + 0.06, from = -(ISLE.R + BRIDGE.span) - 0.6, to = -end, W = BRIDGE.width, rand = mulberry32(0x6b1d);
    const edgeAt = (x) => -Math.sqrt(end * end - x * x);
    // The deck's flags, a row every 0.8 m, three across and staggered, flush at y 0 over the slab.
    for (let z = from, row = 0; z < edgeAt(W / 2); z += 0.8, row++) {
      const cuts = row % 2 ? [-W / 2, -W / 6, W / 6, W / 2] : [-W / 2, -0.4, 0.9, W / 2];
      for (let k = 0; k < 3; k++) {
        const near = cuts[k] < 0 && cuts[k + 1] > 0 ? 0 : Math.min(Math.abs(cuts[k]), Math.abs(cuts[k + 1]));
        const depth = Math.min(0.8, edgeAt(near) - z);
        if (depth > 0.05) parts.push(box({ w: cuts[k + 1] - cuts[k] - 0.03, h: 0.06, d: depth - 0.03, color: STONES[Math.floor(rand() * STONES.length)], offset: { x: (cuts[k] + cuts[k + 1]) / 2, y: -0.03, z: z + depth / 2 } }));
      }
    }
    // The slab and its stepped arch: deep where it meets each island, thin across the middle.
    const length = to - from;
    for (let z = from, k = 0; z < to; z += 0.8, k++) {
      const depth = Math.min(0.8, to - z), t = (z + depth / 2 - from) / length, drop = BRIDGE.slab + 2.2 * Math.pow(2 * t - 1, 4);
      parts.push(box({ w: W, h: drop, d: depth, color: k % 2 ? "#6b625a" : "#746b62", offset: { y: -0.06 - drop / 2, z: z + depth / 2 } }));
      parts.push(box({ w: W - 0.6, h: 0.18, d: depth, color: "#5d5650", offset: { y: -0.06 - drop - 0.09, z: z + depth / 2 } }));
    }
    // Parapets with copings, from past the rim to short of the island's edge, and pillars along them.
    const p0 = from + 1.6, p1 = to - 1.4, x = W / 2 - BRIDGE.wall / 2;
    for (const side of [-1, 1]) {
      parts.push(box({ w: BRIDGE.wall, h: BRIDGE.parapet, d: p1 - p0, color: "#7a716a", offset: { x: side * x, y: BRIDGE.parapet / 2, z: (p0 + p1) / 2 } }));
      parts.push(box({ w: BRIDGE.wall + 0.1, h: 0.1, d: p1 - p0 + 0.1, color: "#958d84", offset: { x: side * x, y: BRIDGE.parapet + 0.05, z: (p0 + p1) / 2 } }));
      const pillars = Math.round((p1 - p0) / BRIDGE.pillarStep);
      for (let k = 0; k <= pillars; k++) {
        const z = p0 + (p1 - p0) * k / pillars, end = k === 0 || k === pillars, h = end ? BRIDGE.pillarH + 0.2 : BRIDGE.pillarH;
        parts.push(bevelBox({ w: BRIDGE.pillar, h, d: BRIDGE.pillar, color: "#857c74", offset: { x: side * x, y: h / 2, z } }));
        parts.push(box({ w: BRIDGE.pillar + 0.12, h: 0.12, d: BRIDGE.pillar + 0.12, color: "#958d84", offset: { x: side * x, y: h + 0.06, z } }));
        if (end) {
          models.lanternParts(1.1, side * x, h + 0.12, z, frame, glass);
          lamps.push({ x: side * x, y: h + 0.5, z });
        }
      }
    }
    // One uninterrupted walking slab across the full deck. Decorative rails and posts never snag a
    // walker; the slab reaches beneath the curved lip even at the outermost flagstones.
    const deckTo = edgeAt(W / 2) + 0.12;
    const stone = merge(...parts, ...frame);
    stone.collisionGeometry = box({ w: W, h: BRIDGE.slab, d: deckTo - from, color: "#000000", offset: { y: -BRIDGE.slab / 2, z: (from + deckTo) / 2 } });
    return { stone, glass: noShadow(merge(...glass)), lamps, from, to, width: W, walk: W / 2 };
  });

  // ---- the section plaques ----
  // Each section's carved sign laid flat on the lip at its wedge's middle, its relief pressed to `PLAQUE_DEPTH` of its
  // thickness and set a little into the flags, its letters upright to someone on the lip looking in. A few centimetres
  // proud, it is never in anyone's way.
  const PLAQUE_SCALE = 0.5, PLAQUE_DEPTH = 0.4, PLAQUE_SINK = 0.02;
  // Split long board faces before bending: moving only their corners would leave a straight chord
  // under curved lettering. The relief and badge follow the same arc as the board, at the lip's radius.
  const curvedPlaque = (flat, radius) => {
    const result = { verts: [], faces: [], lines: [] }, step = 0.18;
    const clip = (points, edge, side) => {
      const out = [];
      for (let k = 0; k < points.length; k++) {
        const a = points[k], b = points[(k + 1) % points.length], inside = side * (a[0] - edge) >= 0;
        if (inside) out.push(a);
        if (inside !== (side * (b[0] - edge) >= 0)) {
          const t = (edge - a[0]) / (b[0] - a[0]);
          out.push([edge, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }
      }
      return out;
    };
    const vertex = (x, y, z) => {
      const at = result.verts.length / 3, angle = x / radius;
      result.verts.push(Math.sin(angle) * (radius + z), y, Math.cos(angle) * (radius + z) - radius);
      return at;
    };
    for (const face of flat.faces) {
      const points = face.i.map(i => flat.verts.slice(i * 3, i * 3 + 3));
      const low = Math.min(...points.map(p => p[0])), high = Math.max(...points.map(p => p[0]));
      const count = Math.max(1, Math.ceil((high - low) / step));
      for (let k = 0; k < count; k++) {
        const part = clip(clip(points, low + (high - low) * k / count, 1), low + (high - low) * (k + 1) / count, -1);
        if (part.length >= 3) result.faces.push({ ...face, i: part.map(p => vertex(...p)) });
      }
    }
    for (const line of flat.lines) {
      const a = flat.verts.slice(line.i[0] * 3, line.i[0] * 3 + 3), b = flat.verts.slice(line.i[1] * 3, line.i[1] * 3 + 3);
      const count = Math.max(1, Math.ceil(Math.abs(b[0] - a[0]) / step));
      let previous = vertex(...a);
      for (let k = 1; k <= count; k++) {
        const t = k / count, next = vertex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        result.lines.push({ ...line, i: [previous, next] }); previous = next;
      }
    }
    return result;
  };
  const signs = cached(() => {
    const parts = [], picks = [];
    for (const s of plan().signs) {
      const board = BL.hubModels.caveSign(s.name, s.badge, false, false, 0.24), w = board.signWidth * PLAQUE_SCALE;
      const flat = turnedX({ verts: board.verts.map((v) => v * PLAQUE_SCALE), faces: board.faces, lines: board.lines }, -Math.PI / 2), v = flat.verts;
      let low = Infinity;
      for (let k = 1; k < v.length; k += 3) low = Math.min(low, v[k]);
      for (let k = 1; k < v.length; k += 3) v[k] = (v[k] - low) * PLAQUE_DEPTH + LIP.rise - PLAQUE_SINK;
      parts.push(moved(turnedY(curvedPlaque(flat, Math.hypot(s.x, s.z)), s.ry), s.x, 0, s.z));
      picks.push({ id: s.id, name: s.name, x: s.x, y: LIP.rise, z: s.z, radius: Math.max(0.6, w / 2) });
    }
    return { geometry: merge(...parts), picks };
  });

  // ---- the totems ----------------------------------------------------------------------------------------------
  // Name plaques spell the GitHub repository name, independent of the short rune word. Only names over 32
  // characters use the catalog's readable project name. Wrap to two centered rows, preferably at a separator,
  // and cap the plank's width so long names do not reach into neighbouring carvings.
  const CELL = 0.024, PEG = 0.18, PLANK = "#b27a43", PANEL = "#3a2a1c", INK = hexToRgb("#f6ecd2");
  const UNDERSCORE = ["000", "000", "000", "000", "111"];
  const boardGlyph = ch => ch === "M" ? BL.hubModels.CARVED_M : ch === "_" ? UNDERSCORE : BL.hubModels.SIGN_GLYPHS[ch];
  const boardCells = text => [...text].reduce((sum, ch) => sum + (ch === " " ? 3 : boardGlyph(ch)[0].length) + 1, -1);
  const boardLines = (repo) => {
    const name = repo.repo.slice(repo.repo.indexOf("/") + 1), text = (name.length > 32 ? repo.name : name).toUpperCase();
    if (boardCells(text) <= 43) return [text];
    let split = 1, best = Infinity;
    for (let i = 1; i < text.length; i++) {
      const left = boardCells(text.slice(0, i).trim()), right = boardCells(text.slice(i).trim());
      if (left < 0 || right < 0) continue;
      const score = Math.max(left, right) + (/[-_. ]/.test(text[i - 1]) ? 0 : 8);
      if (score < best) { best = score; split = i; }
    }
    return [text.slice(0, split).trim(), text.slice(split).trim()];
  };
  const boards = models.scopedMap();
  const nameBoard = (repo) => {
    let geo = boards.get(repo.repo);
    if (geo) return geo;
    const rows = boardLines(repo), widths = rows.map(boardCells), cells = Math.max(...widths), cell = Math.min(CELL, 1.25 / cells);
    const height = 5 + (rows.length - 1) * 7, w = cells * cell + 0.08, h = height * cell + 0.07, y = PEG + h / 2 + 0.02;
    geo = merge(bevelBox({ w: w + 0.04, h: h + 0.03, d: 0.05, color: PLANK, offset: { y } }), box({ w, h, d: 0.056, color: PANEL, offset: { y } }),
      ...[-1, 1].map((side) => bevelBox({ w: 0.05, h: PEG + 0.12, d: 0.05, color: "#5c4425", offset: { x: side * (w / 2 - 0.03), y: (PEG + 0.12) / 2 - 0.06, z: -0.01 } })));
    rows.forEach((text, line) => {
      let x = -widths[line] * cell / 2;
      for (const ch of text) {
        if (ch === " ") { x += 4 * cell; continue; }
        const g = boardGlyph(ch);
        g.forEach((row, r) => {
          for (let c = 0; c < row.length;) {
            if (row[c] !== "1") { c++; continue; }
            let n = 1;
            while (row[c + n] === "1") n++;
            const x0 = x + c * cell, top = y + height * cell / 2 - (line * 7 + r) * cell, z = 0.03, at = geo.verts.length / 3;
            geo.verts.push(x0, top - cell, z, x0 + n * cell, top - cell, z, x0 + n * cell, top, z, x0, top, z);
            geo.faces.push({ i: [at, at + 1, at + 2, at + 3], color: INK, emissive: 0.15 });
            c += n;
          }
        });
        x += (g[0].length + 1) * cell;
      }
    });
    boards.set(repo.repo, geo);
    return geo;
  };
  // A chunk's carvings at one detail, a totem a step, placed in the island's frame and merged into one packed mesh. The
  // distant build comes first and carries each totem's runes and all its eye sockets.
  const chunks = new Map();
  const chunkSteps = (k, tier) => {
    const key = `${k}|${tier}`;
    if (!chunks.has(key)) chunks.set(key, cachedSteps(function* (slice) {
      const TM = BL.totemModels, P = plan(), list = P.chunks[k], parts = [], glyphs = [], eyes = [], features = [];
      for (const at of list) {
        const t = P.totems[at], L = t.L, c = Math.cos(t.ry), s = Math.sin(t.ry);
        const place = (g) => moved(turnedY(g, t.ry), t.x, 0, t.z);
        const opts = tier === "near" ? { detail: TIERS.near, highlights: true, board: nameBoard(t), leanStones: true } : { detail: TIERS[tier], highlights: true, board: false };
        const geo = TM.carve(L, t.word, t.seed, opts);
        features.push(place(geo.featureHighlights));
        parts.push(place(geo));
        if (tier === "distant") {
          // Every face has eye fires; every detail puts them in the same sockets.
          const sockets = L.eyes;
          eyes.push(sockets.map(([x, y, z, size]) => [t.x + x * c + z * s, y, t.z - x * s + z * c, size]));
          glyphs.push(place(TM.glyphsOf(L, t.word)));
        }
        yield* pause(slice);
      }
      let face = 0, line = 0;
      const ranges = parts.map(g => {
        const range = [face, face + g.faces.length, line, line + g.lines.length];
        face = range[1]; line = range[3];
        return range;
      });
      const mesh = merge(...parts);
      mesh.smooth = true;
      // Packing is the longest single step: it gets an idle slice of its own.
      yield;
      if (BL.compactGeometry?.enabled) BL.compactGeometry.pack(mesh, { immutable: true, renderOnly: true });
      return tier === "distant" ? { mesh, glyphs, eyes, features, ranges } : { mesh, features, ranges };
    }));
    return chunks.get(key);
  };

  // A camera-overlapped carving is omitted from its chunk without hiding its neighbours. Vertices stay shared;
  // only the visible faces and lines are copied on an overlap/detail change, never on an ordinary frame.
  const without = (mesh, ranges, mask) => {
    const result = { verts: mesh.verts, faces: [], lines: [], smooth: true };
    for (let slot = 0; slot < ranges.length; slot++) {
      if (mask & (1 << slot)) continue;
      const [from, to, lineFrom, lineTo] = ranges[slot];
      for (let f = from; f < to; f++) result.faces.push(BL.compactGeometry ? BL.compactGeometry.copyFace(mesh, f) : mesh.faces[f]);
      for (let l = lineFrom; l < lineTo; l++) result.lines.push(mesh.lines[l]);
    }
    return result;
  };

  BL.repoIslandModels = { ISLE, LIP, BRIDGE, PLAN, TIERS, CHUNK, STYLES, GROUND, CRYSTAL, crystals, gem, plan, designFor, pathAt, spot, rockSteps, bridge, signs, boardLines, nameBoard, chunkSteps, without };
})();
