// The Mempool island: a second floating chunk off the island's west rim, joined by a vine bridge,
// grown over with rainforest and hollowed by the Mempool cave. Geometry only — the hub places the
// island and its scatter, `scene-pool.js` builds the interior.
//
// Everything here is cached per shape and shared by every copy, so a hundred ferns are one draw call.
// The cave's readable surfaces come from two places the island already trusts: `hubModels.SIGN_GLYPHS`
// for carved headline numbers and the jumbotron's 5x7 font for the dense wall panels, turned into
// bounded run-length quads the same way the big board does it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { models, math } = BL;
  const { createNode, addChild } = BL.scene;
  const { cached, box, lathe, merge, polyline, makeVox, voxelGeometry, noShadow, pushVert, face } = models;
  const { mulberry32, lerp, hexToRgb } = math;

  // A lathe whose colour varies by ring and segment, as `rocket-models.js` defines for the launch pad.
  const latheBy = ({ profile, segments = 8, color, emissive = 0 }) => {
    const geo = { verts: [], faces: [], lines: [] };
    const rings = profile.map(([r, y]) => Array.from({ length: segments }, (_, s) => {
      const a = s / segments * Math.PI * 2;
      return pushVert(geo, Math.cos(a) * r, y, Math.sin(a) * r);
    }));
    const cache = new Map();
    const rgb = (hex) => cache.get(hex) || (cache.set(hex, hexToRgb(hex)), cache.get(hex));
    for (let p = 0; p < rings.length - 1; p++) {
      for (let s = 0; s < segments; s++) {
        const s2 = (s + 1) % segments;
        face(geo, [rings[p][s], rings[p + 1][s], rings[p + 1][s2], rings[p][s2]], rgb(color(p / (rings.length - 1), s)), { emissive });
      }
    }
    return geo;
  };

  const LEAF = "#2f6b33", LEAF_DK = "#245229", LEAF_LT = "#3f8a3c", BARK = "#4a3728", BARK_LT = "#5d4634";
  // Lines are drawn as screen-space quads, so this is a pixel width: 1.5 is the renderer default
  // and reads as thread against a canopy this size.
  const VINE_WIDTH = 3.6;
  const STONE = "#6f6f6a", STONE_DK = "#54544f", MOSS = "#3c6b40", WET = "#3a4a52", GOLD = "#e8c14a";

  // 4 o'clock is the one bearing with no cave mouth on it: CLOCKS fills 11, 10, 9, 7.5, 5, 3, 2 and 1,
  // spoke(0) at 12 carries the gate trail and spoke(PI) at 6 carries the launch bridge.
  const BEARING = 4 / 12 * Math.PI * 2;
  const DIR = { x: Math.sin(BEARING), z: -Math.cos(BEARING) };
  const SITE = { from: 27.4, span: 17, sag: 0.5, width: 2.3, isletR: 13, isletDepth: 16, caveR: 14, caveH: 8, stationR: 12, shaftR: 2.9, shaftDepth: 8, bearing: BEARING, dir: DIR };
  const UNIT = 0.5;

  // Built in a local frame whose +z points back at the home island, which is what `rotation.y = -bearing`
  // maps inward, exactly as the terrain's own cave mouths are turned. The bridge head sits where the
  // ground under it runs out, at that ground's height, and that height sets both ends.
  const spot = (island, out = {}) => {
    let r = SITE.from;
    while (island.surfaceAt(DIR.x * (r + 0.1), DIR.z * (r + 0.1)) > 0.5) r += 0.1;
    out.y = island.surfaceAt(DIR.x * r, DIR.z * r) + 0.02;
    out.rimRadius = r;
    out.bridgeX = DIR.x * r;
    out.bridgeZ = DIR.z * r;
    // The islet centre sits a bridge span and most of its own radius further out.
    const radius = r + SITE.span + SITE.isletR - 1;
    out.radius = radius;
    out.x = DIR.x * radius;
    out.z = DIR.z * radius;
    out.ry = -SITE.bearing;
    // How far out along local +z the bridge starts, so its far end lands on the rim head.
    out.bridgeLocalZ = radius - r - SITE.span;
    return out;
  };

  // A floating chunk of jungle floor: leaf litter, loam, then rock tapering to a point. Top face at y = 0.
  const islet = cached(() => {
    const rand = mulberry32(5551);
    const v = makeVox(), R = SITE.isletR / UNIT, deep = SITE.isletDepth / UNIT;
    for (let x = -Math.ceil(R) - 1; x <= Math.ceil(R) + 1; x++) {
      for (let z = -Math.ceil(R) - 1; z <= Math.ceil(R) + 1; z++) {
        const a = Math.atan2(z, x), edge = R * (0.9 + 0.1 * Math.sin(a * 4 - 0.7) + 0.05 * Math.sin(a * 9 + 2.1));
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > edge) continue;
        const k = r / edge, depth = Math.max(2, Math.round(deep * (1 - Math.pow(k, 1.4)) * (0.82 + rand() * 0.24)));
        // The stairwell is an actual hole down the middle: no ground inside it at all.
        const inShaft = r < SITE.shaftR / UNIT, shaftCells = SITE.shaftDepth / UNIT;
        for (let y = 1; y <= depth; y++) {
          if (inShaft && y <= shaftCells) continue;
          v.set(x, -y, z, y === 1 ? (rand() < 0.35 ? 1 : 0) : y <= 3 ? 2 : (rand() < 0.28 ? 4 : 3));
        }
      }
    }
    return voxelGeometry(v, { unit: UNIT, palette: [LEAF, LEAF_DK, "#5a4530", STONE, STONE_DK], origin: { x: 0, y: 0, z: 0 } });
  });

  // Planks on two slung vines, sagging to the middle. Built in its own frame: z = 0 to z = SITE.span.
  const deckY = (t) => -SITE.sag * 4 * t * (1 - t);
  const bridge = cached(() => {
    const geos = [], w = SITE.width, count = Math.round(SITE.span / 0.46);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      geos.push(box({ w, h: 0.08, d: 0.34, color: i % 3 === 0 ? BARK : BARK_LT, offset: { y: deckY(t), z: t * SITE.span } }));
    }
    const steps = 24;
    for (const side of [-1, 1]) {
      const rail = [], deck = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        rail.push({ x: side * w / 2, y: deckY(t) + 0.95, z: t * SITE.span });
        deck.push({ x: side * w / 2, y: deckY(t) - 0.04, z: t * SITE.span });
      }
      geos.push(polyline({ points: rail, color: MOSS, emissive: 0 }), polyline({ points: deck, color: BARK, emissive: 0 }));
      for (let i = 2; i < steps - 1; i += 3) {
        const t = i / steps;
        geos.push(polyline({ points: [{ x: side * w / 2, y: deckY(t) - 0.04, z: t * SITE.span }, { x: side * w / 2, y: deckY(t) + 0.95, z: t * SITE.span }], color: MOSS, emissive: 0 }));
      }
    }
    // A gateway at each end: two posts, a lashed crossbeam and a lantern, so the crossing reads as a way in.
    for (const z of [0, SITE.span]) {
      for (const side of [-1, 1]) {
        geos.push(box({ w: 0.26, h: 2.6, d: 0.26, color: BARK, offset: { x: side * (w / 2 + 0.12), y: 1.1, z } }));
        geos.push(box({ w: 0.34, h: 0.18, d: 0.34, color: MOSS, offset: { x: side * (w / 2 + 0.12), y: 2.34, z } }));
      }
      geos.push(box({ w: w + 0.7, h: 0.2, d: 0.2, color: BARK_LT, offset: { y: 2.5, z } }));
      geos.push(box({ w: 0.26, h: 0.34, d: 0.26, color: "#ffb347", emissive: 1, offset: { y: 2.18, z } }));
    }
    // Vines slung under the deck, following its own sag.
    for (const side of [-1, 1]) {
      const vine = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        vine.push({ x: side * w * 0.32, y: deckY(t) - 0.5 - Math.sin(t * Math.PI) * 0.55, z: t * SITE.span });
      }
      geos.push(polyline({ points: vine, color: LEAF_DK, emissive: 0 }));
    }
    const geo = merge(...geos);
    // The crossing is made of vine too: its rails and the ropes slung under the deck read as cord.
    geo.lineWidth = VINE_WIDTH;
    return geo;
  });

  // Rainforest: three canopy heights so the scatter reads as layers rather than a field of one tree.
  const canopy = (seed, height, spread) => cached(() => {
    const rand = mulberry32(seed), geos = [];
    const lean = (rand() - 0.5) * 0.25;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      geos.push(box({ w: lerp(0.5, 0.26, t), h: height / 6, d: lerp(0.5, 0.26, t), color: i % 2 ? BARK : BARK_LT, offset: { x: lean * t * height, y: height * t + height / 12 } }));
    }
    const top = height + 0.1, cx = lean * height;
    // Layered slabs, not a sphere: the flat look is the point, but a slab a third as deep as it is wide
    // reads as paper. Thicker slabs, spaced further apart, keep the layers distinct and give the crown
    // some body.
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + rand(), r = spread * (0.55 + rand() * 0.45);
      geos.push(box({ w: r * 1.5, h: 0.52, d: r * 1.5, color: i % 2 ? LEAF : LEAF_LT, offset: { x: cx + Math.cos(a) * r * 0.35, y: top - i * 0.4, z: Math.sin(a) * r * 0.35 } }));
    }
    geos.push(box({ w: spread * 1.1, h: 0.58, d: spread * 1.1, color: LEAF_DK, offset: { x: cx, y: top + 0.36 } }));
    // A liana or two off the crown, the jungle's one vertical line.
    for (let i = 0; i < 2; i++) {
      const a = rand() * Math.PI * 2, r = spread * 0.5;
      const x0 = cx + Math.cos(a) * r, z0 = Math.sin(a) * r;
      const pts = [];
      for (let j = 0; j <= 5; j++) pts.push({ x: x0 + (rand() - 0.5) * 0.2, y: top - j * (height * 0.11), z: z0 + (rand() - 0.5) * 0.2 });
      geos.push(polyline({ points: pts, color: MOSS, emissive: 0 }));
    }
    const geo = merge(...geos);
    // The lianas are the only lines in the build, so the whole tree's width is theirs: rope, not thread.
    geo.lineWidth = VINE_WIDTH;
    return geo;
  });
  const CANOPY = [canopy(71, 7.5, 3.2), canopy(72, 5.4, 2.6), canopy(73, 9.2, 3.8)];

  const fern = cached(() => {
    const rand = mulberry32(88), geos = [];
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2, len = 0.55 + rand() * 0.35;
      geos.push(box({ w: len, h: 0.07, d: 0.2, color: i % 2 ? LEAF : LEAF_LT, offset: { x: Math.cos(a) * len * 0.5, y: 0.22 + rand() * 0.18, z: Math.sin(a) * len * 0.5 } }));
    }
    return noShadow(merge(...geos));
  });
  const shrub = cached(() => merge(
    box({ w: 0.9, h: 0.55, d: 0.9, color: LEAF_DK, offset: { y: 0.28 } }),
    box({ w: 0.6, h: 0.3, d: 0.6, color: LEAF, offset: { y: 0.66 } })
  ));
  const mossRock = cached(() => merge(
    box({ w: 1.1, h: 0.7, d: 0.95, color: STONE, offset: { y: 0.35 } }),
    box({ w: 0.8, h: 0.12, d: 0.7, color: MOSS, offset: { y: 0.74 } })
  ));
  // Rainforest wildlife, in the same voxel idiom as the cavemen and the Agent: one cached build per
  // species, shared by every copy placed, so the whole menagerie is three draw calls and no per-frame work.
  const fill = (v, x0, x1, y0, y1, z0, z1, i) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) v.set(x, y, z, i);
  };
  // 0 coat, 1 rosette, 2 belly, 3 muzzle/eye
  const JAGUAR = ["#c8913f", "#2a2017", "#e6d6ae", "#15110c"];
  const jaguar = cached(() => {
    const v = makeVox(), rand = mulberry32(6101);
    fill(v, 0, 9, 2, 4, 0, 3, 0);
    fill(v, 0, 9, 2, 2, 0, 3, 2);
    // Rosettes scattered along the flanks, deterministic so every jaguar on the island matches.
    for (let x = 1; x <= 8; x++) for (let z = 0; z <= 3; z++) if (rand() < 0.22) v.set(x, 4, z, 1);
    for (let x = 1; x <= 8; x++) for (const z of [0, 3]) if (rand() < 0.3) v.set(x, 3, z, 1);
    fill(v, 9, 11, 3, 5, 1, 2, 0);
    fill(v, 11, 11, 3, 3, 1, 2, 3);
    v.set(10, 5, 0, 0); v.set(10, 5, 3, 0);
    v.set(11, 4, 1, 3); v.set(11, 4, 2, 3);
    for (const [lx, lz] of [[1, 0], [1, 3], [8, 0], [8, 3]]) fill(v, lx, lx + 1, 0, 1, lz, lz, 0);
    for (let i = 0; i < 5; i++) v.set(-1 - i, 4 + ((i / 2) | 0), 1 + (i & 1), i % 2 ? 1 : 0);
    return voxelGeometry(v, { unit: 0.13, palette: JAGUAR, origin: { x: 0, y: 0, z: 0 } });
  });
  // 0 plumage, 1 beak, 2 beak tip, 3 throat, 4 eye
  const TOUCAN = ["#16161a", "#f0972a", "#e8d24a", "#f4f0e6", "#d8d2c4"];
  const toucan = cached(() => {
    const v = makeVox();
    fill(v, 0, 4, 2, 5, 0, 2, 0);
    fill(v, 1, 3, 3, 4, 0, 0, 3);
    fill(v, 4, 6, 4, 6, 0, 2, 0);
    fill(v, 5, 5, 5, 5, 0, 0, 4);
    fill(v, 5, 5, 5, 5, 2, 2, 4);
    // The beak: most of the bird, tapering and brightening to its tip.
    fill(v, 7, 9, 4, 5, 1, 1, 1);
    fill(v, 7, 8, 3, 5, 1, 1, 1);
    fill(v, 10, 11, 4, 4, 1, 1, 2);
    for (let i = 0; i < 4; i++) v.set(-1 - i, 2 - ((i / 2) | 0), 1, 0);
    v.set(1, 1, 0, 1); v.set(3, 1, 0, 1);
    return voxelGeometry(v, { unit: 0.09, palette: TOUCAN, origin: { x: 0, y: 0, z: 0 } });
  });
  // 0 fur, 1 face, 2 belly, 3 eye
  const MONKEY = ["#6b4a2e", "#c69a6d", "#8a6640", "#1a1410"];
  const monkey = cached(() => {
    const v = makeVox();
    fill(v, 0, 3, 2, 5, 0, 3, 0);
    fill(v, 1, 2, 2, 4, 0, 0, 2);
    fill(v, 0, 3, 6, 8, 0, 3, 0);
    fill(v, 1, 2, 6, 7, 0, 0, 1);
    v.set(1, 7, 0, 3); v.set(2, 7, 0, 3);
    v.set(0, 8, 0, 0); v.set(3, 8, 0, 0);
    v.set(0, 8, 3, 0); v.set(3, 8, 3, 0);
    // Arms down the sides and a long tail curling up behind.
    for (const z of [0, 3]) fill(v, -1, -1, 3, 5, z, z, 0);
    for (let i = 0; i < 7; i++) v.set(4 + ((i / 3) | 0), 2 + i, 1 + (i & 1), 0);
    fill(v, 0, 3, 0, 1, 0, 1, 0);
    return voxelGeometry(v, { unit: 0.1, palette: MONKEY, origin: { x: 0, y: 0, z: 0 } });
  });

  const flowers = cached(() => {
    const rand = mulberry32(404), geos = [];
    const petals = ["#e86a9a", "#f2c14a", "#d95d7a", "#f0f0e2"];
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 0.55;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.28 + rand() * 0.22;
      geos.push(box({ w: 0.05, h, d: 0.05, color: LEAF_LT, offset: { x, y: h / 2, z } }));
      geos.push(box({ w: 0.17, h: 0.09, d: 0.17, color: petals[(rand() * petals.length) | 0], emissive: 0.2, offset: { x, y: h + 0.04, z } }));
    }
    return noShadow(merge(...geos));
  });
  const log = cached(() => {
    const geos = [merge(
      box({ w: 3.2, h: 0.62, d: 0.62, color: BARK, offset: { y: 0.31 } }),
      box({ w: 2.6, h: 0.14, d: 0.5, color: MOSS, offset: { y: 0.62 } }),
      box({ w: 0.12, h: 0.5, d: 0.5, color: "#6b533c", offset: { x: 1.62, y: 0.31 } })
    )];
    for (let i = 0; i < 3; i++) geos.push(box({ w: 0.24, h: 0.1, d: 0.24, color: "#d8d2b4", emissive: 0.15, offset: { x: -1 + i * 0.9, y: 0.68, z: 0.2 } }));
    return merge(...geos);
  });

  // A still pool of standing water: the island's name, and the only flat thing on it.
  const pond = cached(() => noShadow(lathe({ profile: [[2.6, 0.06], [0, 0.06]], segments: 20, color: WET, emissive: 0.22 })));

  // The stairwell: a mossy stone kerb round the hole, a lined shaft so you never see sky through it,
  // and a flight turning down into the dark. Its own origin is the hole's centre at ground level.
  const STAIR_STEPS = 26, STAIR_TURNS = 1.35, STAIR_INNER = 0.55, LINING_DROP = 0.12;
  const stairwell = cached(() => {
    const R = SITE.shaftR, D = SITE.shaftDepth, geos = [];
    // Kerb: blocks round the lip, a couple of them mossy.
    const kerb = 20;
    for (let i = 0; i < kerb; i++) {
      const a = i / kerb * Math.PI * 2, x = Math.cos(a) * (R + 0.3), z = Math.sin(a) * (R + 0.3);
      geos.push(box({ w: 0.8, h: 0.55, d: 0.8, color: i % 3 === 0 ? STONE_DK : STONE, offset: { x, y: 0.18, z } }));
      if (i % 4 === 0) geos.push(box({ w: 0.62, h: 0.1, d: 0.62, color: MOSS, offset: { x, y: 0.48, z } }));
    }
    // Shaft lining, dark and windowless, so the hole reads as depth rather than a gap in the island.
    // It hangs below the rim rather than reaching it: the islet's own top face is at y = 0, and a
    // lining that ends there puts a whole ring of faces exactly flush with the ground, which sparkles
    // from every angle as the camera turns. LINING_DROP is the gap that keeps them apart; the kerb and
    // the islet's own wall cover the band it leaves.
    const wall = 18;
    for (let i = 0; i < wall; i++) {
      const a = i / wall * Math.PI * 2, x = Math.cos(a) * (R + 0.12), z = Math.sin(a) * (R + 0.12);
      geos.push(box({ w: 1.15, h: D, d: 1.15, color: i % 2 ? "#3a352f" : "#2f2b26", offset: { x, y: -D / 2 - LINING_DROP, z } }));
    }
    // The flight itself, turning down the inside of the shaft to a landing at the bottom.
    for (let i = 0; i < STAIR_STEPS; i++) {
      const t = i / (STAIR_STEPS - 1), a = t * STAIR_TURNS * Math.PI * 2;
      const rad = (R - 0.75) * (1 - STAIR_INNER * t * 0.35);
      const y = -0.35 - t * (D - 1.1);
      geos.push(box({ w: 1.65, h: 0.26, d: 1.15, color: i % 2 ? "#6a635a" : "#7a736a", offset: { x: Math.cos(a) * rad, y, z: Math.sin(a) * rad } }));
      // A stub of newel under every few treads, so the flight has something to stand on.
      if (i % 3 === 0) geos.push(box({ w: 0.3, h: 0.9, d: 0.3, color: "#4b463f", offset: { x: Math.cos(a) * rad, y: y - 0.55, z: Math.sin(a) * rad } }));
    }
    geos.push(lathe({ profile: [[R - 0.1, -D + 0.1], [0, -D + 0.1]], segments: 16, color: "#332f2a" }));
    // Two torches down the wall: the only light in the hole, and the cue that it goes somewhere.
    for (const [a, y] of [[0.9, -1.6], [3.7, -4.6]]) {
      geos.push(box({ w: 0.22, h: 0.7, d: 0.22, color: BARK, offset: { x: Math.cos(a) * (R - 0.35), y, z: Math.sin(a) * (R - 0.35) } }));
      geos.push(box({ w: 0.3, h: 0.3, d: 0.3, color: "#ff9a2a", emissive: 1, offset: { x: Math.cos(a) * (R - 0.35), y: y + 0.5, z: Math.sin(a) * (R - 0.35) } }));
    }
    return merge(...geos);
  });
  const caveSign = cached(() => merge(
    box({ w: 3.1, h: 0.75, d: 0.14, color: BARK, offset: { y: 0.38 } }),
    box({ w: 3.3, h: 0.12, d: 0.18, color: BARK_LT, offset: { y: 0.8 } })
  ));
  // A torch in two pieces, so a station can stretch its stem without stretching its flame.
  const TORCH_STEM_H = 1.6;
  const torchStem = cached(() => box({ w: 0.2, h: TORCH_STEM_H, d: 0.2, color: BARK, offset: { y: TORCH_STEM_H / 2 } }));
  const torchFlame = cached(() => box({ w: 0.3, h: 0.3, d: 0.3, color: "#ff9a2a", emissive: 1, offset: { y: 0.15 } }));
  // A small standing board across the hole from the bridge, carrying the chain's headline numbers so a
  // visitor reads them without going down. The face looks along +z, which is the way `carve` and
  // `panelFrom` cut, so placing it with `rotation.y = 0` on the far side turns it back at the crossing.
  // `y` is the board's bottom edge, so it is also how much post shows under it: a board this size
  // wants short legs, not stilts.
  const CHAIN_BOARD = { w: 6.8, h: 3, y: 1, d: 0.2, px: 0.06 };
  const chainBoard = cached(() => merge(
    ...[-1, 1].map((side) => box({ w: 0.3, h: CHAIN_BOARD.y + 0.3, d: 0.3, color: BARK, offset: { x: side * (CHAIN_BOARD.w / 2 - 0.3), y: (CHAIN_BOARD.y + 0.3) / 2 } })),
    box({ w: CHAIN_BOARD.w, h: CHAIN_BOARD.h, d: CHAIN_BOARD.d, color: "#2a2724", offset: { y: CHAIN_BOARD.y + CHAIN_BOARD.h / 2 } }),
    box({ w: CHAIN_BOARD.w + 0.34, h: 0.26, d: 0.32, color: BARK_LT, offset: { y: CHAIN_BOARD.y + CHAIN_BOARD.h + 0.1 } }),
    box({ w: CHAIN_BOARD.w + 0.34, h: 0.22, d: 0.32, color: BARK_LT, offset: { y: CHAIN_BOARD.y - 0.08 } }),
    box({ w: 0.3, h: 0.3, d: 0.3, color: "#ffb347", emissive: 1, offset: { y: CHAIN_BOARD.y + CHAIN_BOARD.h + 0.36 } })
  ));
  // A small post beside the big board, carrying a question mark: the weather key is behind it.
  const INFO_SIGN = { w: 1.1, h: 1.1, y: 1.1, d: 0.16 };
  const infoSign = cached(() => merge(
    box({ w: 0.2, h: INFO_SIGN.y + 0.2, d: 0.2, color: BARK, offset: { y: (INFO_SIGN.y + 0.2) / 2 } }),
    box({ w: INFO_SIGN.w, h: INFO_SIGN.h, d: INFO_SIGN.d, color: "#3a3430", offset: { y: INFO_SIGN.y + INFO_SIGN.h / 2 } }),
    box({ w: INFO_SIGN.w + 0.16, h: 0.14, d: INFO_SIGN.d + 0.1, color: BARK_LT, offset: { y: INFO_SIGN.y + INFO_SIGN.h + 0.05 } }),
    box({ w: INFO_SIGN.w + 0.16, h: 0.12, d: INFO_SIGN.d + 0.1, color: BARK_LT, offset: { y: INFO_SIGN.y - 0.04 } }),
    // A question mark cut proud of the face, in the island's own sign glyphs.
    ...(() => {
      const glyph = BL.hubModels.SIGN_GLYPHS["?"], cell = 0.16, out = [];
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] !== "1") continue;
          out.push(box({
            w: cell, h: cell, d: 0.07, color: GOLD, emissive: 0.6,
            offset: { x: (col - 1) * cell, y: INFO_SIGN.y + INFO_SIGN.h * 0.5 + (2 - row) * cell, z: INFO_SIGN.d / 2 }
          }));
        }
      }
      return out;
    })()
  ));
  const torchPost = cached(() => merge(
    box({ w: 0.2, h: TORCH_STEM_H, d: 0.2, color: BARK, offset: { y: TORCH_STEM_H / 2 } }),
    box({ w: 0.3, h: 0.3, d: 0.3, color: "#ff9a2a", emissive: 1, offset: { y: 1.75 } })
  ));

  // The hall's section, as fractions of caveR and caveH: straight to head height so the wall reads
  // as a wall, then three courses doming in. The camera clamp and the geometry share it, so nothing
  // the visitor can reach is ever inside the stone.
  const WALL = [[1, 0], [1, 0.7], [0.85, 0.875], [0.45, 1.025], [0, 1.1]];
  // The wall's radius at a height, and the ceiling's height at a radius: the same curve read both ways.
  const wallRadiusAt = (y) => {
    const R = SITE.caveR, k = y / SITE.caveH;
    if (k <= WALL[1][1]) return R;
    for (let i = 1; i < WALL.length - 1; i++) {
      const a = WALL[i], b = WALL[i + 1];
      if (k > b[1]) continue;
      return R * lerp(a[0], b[0], (k - a[1]) / (b[1] - a[1]));
    }
    return 0;
  };
  const ceilingHeightAt = (r) => {
    const R = SITE.caveR, H = SITE.caveH;
    if (r >= R) return WALL[1][1] * H;
    for (let i = 1; i < WALL.length - 1; i++) {
      const a = WALL[i], b = WALL[i + 1];
      if (r <= b[0] * R || r > a[0] * R) continue;
      return lerp(a[1], b[1], (a[0] * R - r) / ((a[0] - b[0]) * R)) * H;
    }
    return WALL[WALL.length - 1][1] * H;
  };

  // The interior: a round stone hall at walking scale. A banded floor, a wall that stands straight to
  // head height before it domes, a course of fallen boulders round its foot, and stalactites over the
  // middle, so the room reads as rock in every direction instead of going black past the firelight.
  const room = cached(() => {
    const R = SITE.caveR, H = SITE.caveH, geos = [], rand = mulberry32(9301);
    // Rings run outward-in and the wall top-down: that winding is what turns both their normals into
    // the room, so the floor takes the firelight and the wall is lit from the inside it faces.
    // Four concentric courses against forty wedges reads as laid stone; one ring of wedges alone
    // reads as a starburst from the fire.
    const FLOOR = ["#524c45", "#494339", "#5a544c", "#4e4941"];
    geos.push(latheBy({
      profile: [[R, 0], [R * 0.76, 0], [R * 0.52, 0], [R * 0.28, 0], [0, 0]], segments: 40,
      color: (t, s) => FLOOR[(Math.round(t * 4) + s) % 4]
    }));
    geos.push(latheBy({
      profile: WALL.map(([r, k]) => [r * R, k * H]).reverse(), segments: 40,
      color: (t, s) => t < 0.5 ? (s % 2 ? "#3f3a35" : "#464038") : (s % 2 ? "#4d4842" : STONE_DK)
    }));
    // The skirting course: rubble that has come off the wall and settled against its foot.
    for (let i = 0; i < 36; i++) {
      const a = (i + rand() * 0.7) / 36 * Math.PI * 2, r = R - 0.5 - rand() * 0.5, s = 0.7 + rand() * 0.85;
      geos.push(box({ w: s, h: s * 0.7, d: s, color: i % 5 === 0 ? MOSS : i % 2 ? STONE : STONE_DK, offset: { x: Math.cos(a) * r, y: s * 0.3, z: Math.sin(a) * r } }));
    }
    // Stalactites in the island's own blocky idiom: three courses tapering to a point.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (R - 2.4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const top = ceilingHeightAt(r), len = 0.8 + rand() * 1.9, s = 0.75 + rand() * 0.6;
      const color = i % 3 === 0 ? "#565049" : i % 3 === 1 ? "#4a453f" : "#514b44";
      geos.push(
        box({ w: 0.6 * s, h: len * 0.42, d: 0.6 * s, color, offset: { x, y: top - len * 0.21, z } }),
        box({ w: 0.36 * s, h: len * 0.36, d: 0.36 * s, color, offset: { x, y: top - len * 0.6, z } }),
        box({ w: 0.16 * s, h: len * 0.22, d: 0.16 * s, color, offset: { x, y: top - len * 0.89, z } })
      );
    }
    return merge(...geos);
  });

  // Where the stairwell lands: a flight coming down out of the wall under a lintel and a lantern, so
  // the hall has a visible way in and out. Built facing local +z, which `bearing + PI` turns inward.
  const stairFoot = cached(() => {
    const geos = [];
    for (let i = 0; i < 6; i++) {
      geos.push(box({ w: 3.4, h: 0.26, d: 0.95, color: i % 2 ? "#6a635a" : "#7a736a", offset: { y: 0.13 + i * 0.26, z: -0.5 - i * 0.95 } }));
    }
    // A dark mouth behind the top step, so the way up reads as a way up rather than a dead end.
    geos.push(box({ w: 3.5, h: 2.6, d: 0.3, color: "#221f1c", offset: { y: 2.75, z: -6.4 } }));
    for (const side of [-1, 1]) geos.push(box({ w: 0.36, h: 3.1, d: 0.5, color: STONE_DK, offset: { x: side * 2.05, y: 3.05, z: -6.1 } }));
    geos.push(box({ w: 4.8, h: 0.42, d: 0.6, color: STONE, offset: { y: 4.8, z: -6.1 } }));
    geos.push(box({ w: 0.34, h: 0.34, d: 0.34, color: "#ff9a2a", emissive: 1, offset: { y: 4.4, z: -5.7 } }));
    return merge(...geos);
  });
  // The fire in the middle of the hall: a ring of stones, three logs across it and a layered flame,
  // built at the size the room wants so nothing has to be stretched into place.
  const FIRE_FLAME = [
    [1.5, 1.1, 0.75, 0, 0, "#ff8a1e"], [1.1, 0.85, 1.55, 0.1, -0.08, "#ffc148"],
    [0.82, 0.7, 2.1, 0.22, 0.12, "#ffc148"], [0.58, 0.5, 2.6, 0.1, 0.2, "#fff0b0"],
    [0.4, 0.4, 3, -0.06, 0.08, "#fff0b0"], [0.6, 0.62, 1.3, -0.72, 0.16, "#ffc148"],
    [0.5, 0.54, 1.75, 0.76, 0.42, "#ff8a1e"]
  ];
  const brazier = cached(() => {
    const rand = mulberry32(2207), geos = [box({ w: 3.4, h: 0.12, d: 3.4, color: "#2a2522", offset: { y: 0.06 } })];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + (rand() - 0.5) * 0.3, h = 0.55 + rand() * 0.35, r = 1.85;
      geos.push(box({ w: 0.8 + rand() * 0.3, h, d: 0.7 + rand() * 0.3, color: i % 3 === 0 ? STONE_DK : i % 3 === 1 ? STONE : "#645e56", offset: { x: Math.cos(a) * r, y: h * 0.5, z: Math.sin(a) * r } }));
    }
    geos.push(
      box({ w: 2.6, h: 0.34, d: 0.34, color: BARK, offset: { y: 0.3, z: -0.32 } }),
      box({ w: 0.34, h: 0.34, d: 2.6, color: BARK_LT, offset: { x: 0.32, y: 0.5 } }),
      box({ w: 2.6, h: 0.34, d: 0.34, color: BARK, offset: { y: 0.7, z: 0.32 } })
    );
    return merge(...geos, noShadow(merge(...FIRE_FLAME.map(([w, h, y, x, z, color]) => box({ w, h, d: w, color, emissive: 1, offset: { x, y, z } })))));
  });

  // A hewn face for a station's readables: one border shared by the tall faces that carry a panel and
  // the plaque that carries only a headline, so all four stations read as the same fitting.
  const facePlate = (w, h) => merge(
    box({ w, h, d: 0.28, color: "#332f2b" }),
    box({ w: w + 0.34, h: 0.28, d: 0.44, color: "#736c62", offset: { y: -h / 2 - 0.12 } }),
    box({ w: w + 0.34, h: 0.24, d: 0.44, color: "#736c62", offset: { y: h / 2 + 0.1 } }),
    ...[-1, 1].map((side) => box({ w: 0.26, h: h + 0.5, d: 0.4, color: "#6a645b", offset: { x: side * (w / 2 + 0.05) } }))
  );
  const FACE_W = 5.2, FACE_Z = 0.14;
  const stationFace = cached(() => facePlate(FACE_W, 5));
  const stationPlaque = cached(() => facePlate(FACE_W, 1));

  // A standing slab that carries carved text. Sizes are in glyph cells so the carver can fill it.
  // The chain's own tablet: the station face again, wider and standing on a plinth of its own.
  const tabletSlab = cached(() => merge(
    box({ w: 6.9, h: 0.36, d: 0.72, color: STONE_DK, offset: { y: 0.18 } }),
    box({ w: 6, h: 5, d: 0.3, color: "#332f2b", offset: { y: 2.95 } }),
    box({ w: 6.34, h: 0.26, d: 0.44, color: "#736c62", offset: { y: 0.52 } }),
    box({ w: 6.34, h: 0.24, d: 0.44, color: "#736c62", offset: { y: 5.55 } }),
    ...[-1, 1].map((side) => box({ w: 0.26, h: 5.4, d: 0.4, color: "#6a645b", offset: { x: side * 3.05, y: 2.95 } }))
  ));

  // Carved headline type: the island's own blocky sign glyphs, cut proud of a slab's face.
  const CARVE_Z = 0.16;
  const carve = (text, { cell = 0.14, color = GOLD, emissive = 0.55 } = {}) => {
    const glyphs = BL.hubModels.SIGN_GLYPHS, geos = [];
    let cursor = 0;
    for (const ch of String(text).toUpperCase()) {
      if (ch === " ") { cursor += 2.4; continue; }
      const glyph = glyphs[ch];
      if (!glyph) { cursor += 4; continue; }
      for (let row = 0; row < glyph.length; row++) {
        for (let col = 0; col < glyph[row].length; col++) {
          if (glyph[row][col] !== "1") continue;
          geos.push(box({ w: cell, h: cell, d: 0.08, color, emissive, offset: { x: (cursor + col) * cell, y: -(row * cell), z: CARVE_Z } }));
        }
      }
      cursor += 4;
    }
    return { geometry: geos.length ? merge(...geos) : null, width: cursor * cell };
  };
  // How wide a carving comes out, in cells, so a caller can pick the cell that fills its slab and no
  // reading can ever run off the stone however many digits the chain hands it.
  const carveCells = (text) => {
    let cursor = 0;
    for (const ch of String(text)) cursor += ch === " " ? 2.4 : 4;
    return cursor;
  };

  // A dense wall panel: the jumbotron's 5x7 font rendered into a canvas, then run-length merged into
  // quads exactly as the big board does, so a wall of numbers is a few hundred faces and no texture.
  const panelFrom = (ctx, w, h, px, py, background) => {
    const geo = { verts: [], faces: [], lines: [] };
    const data = ctx.getImageData(0, 0, w, h).data;
    const bg = background;
    const push = (x0, x1, y0, y1, color) => {
      const base = geo.verts.length / 3;
      geo.verts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
      geo.faces.push({ i: [base, base + 1, base + 2, base + 3], color, emissive: 0.85 });
    };
    for (let y = 0; y < h; y++) {
      const wy0 = (h - y - 1) * py, wy1 = (h - y) * py, row = y * w;
      let x = 0;
      while (x < w) {
        const i = (row + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
        if (r === bg[0] && g === bg[1] && b === bg[2]) { x++; continue; }
        let run = x + 1;
        while (run < w) {
          const j = (row + run) * 4;
          if (data[j] !== r || data[j + 1] !== g || data[j + 2] !== b) break;
          run++;
        }
        push(x * px, run * px, wy0, wy1, [r, g, b]);
        x = run;
      }
    }
    geo.castShadow = false;
    return geo;
  };

  // The island as one group: ground, bridge, cave mouth, sign and two torches. Scatter is the hub's.
  const build = (place) => {
    const node = createNode({ position: { x: place.x, y: place.y, z: place.z }, rotation: { x: 0, y: place.ry, z: 0 } });
    const groundNode = createNode({ geometry: islet() });
    const bridgeNode = createNode({ position: { x: 0, y: 0, z: place.bridgeLocalZ }, geometry: bridge() });
    // The way down is a stairwell through the middle of the island, not a door in its side.
    const stairNode = createNode({ geometry: stairwell() });
    const signNode = createNode({ position: { x: 0, y: 0, z: SITE.shaftR + 2.1 }, geometry: caveSign() });
    // Lit like every hub torch, so the Matrix treats their flames as fire rather than as stone.
    const torches = [-1, 1].map((side) => createNode({ position: { x: side * (SITE.shaftR + 1.5), y: 0, z: SITE.shaftR * 0.7 }, geometry: torchPost(), matrixEmissiveLiving: true }));
    const pondNode = createNode({ position: { x: 6.4, y: 0, z: -4.6 }, geometry: pond() });
    addChild(node, groundNode, bridgeNode, stairNode, signNode, pondNode, ...torches);
    return { node, ground: groundNode, bridge: bridgeNode, stair: stairNode, sign: signNode, pond: pondNode, torches };
  };

  BL.poolModels = {
    SITE, UNIT, BEARING, DIR, spot, build, latheBy, stairwell, islet, bridge, caveSign, torchPost, torchStem, torchFlame,
    TORCH_STEM_H, room, stairFoot, wallRadiusAt, ceilingHeightAt, brazier,
    stationFace, stationPlaque, FACE_W, FACE_Z,
    tabletSlab, carve, carveCells, panelFrom, chainBoard, CHAIN_BOARD, infoSign, INFO_SIGN, CANOPY, fern, shrub, mossRock, pond, deckY, STAIR_STEPS,
    jaguar, toucan, monkey, flowers, log,
    COLORS: { LEAF, LEAF_DK, LEAF_LT, BARK, BARK_LT, STONE, STONE_DK, MOSS, WET, GOLD }
  };
})();
