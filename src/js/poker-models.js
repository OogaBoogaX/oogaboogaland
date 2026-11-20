// Ten tables in two banks, with a central promenade and circulation outside every seat.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene;
  const REAR_WALL_Z = 36.5;
  const PORTAL_Z = REAR_WALL_Z - BL.bifrostModels.MIRROR_Z - 0.05;
  const EXIT_Z = PORTAL_Z + BL.bifrostModels.MIRROR_Z;
  const TABLES = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 11 : -11, z: 24 - Math.floor(i / 2) * 12 }));
  const SEATS = Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + 0.55 + i * (Math.PI * 2 - 1.1) / 8;
    const x = Math.cos(a) * 6, z = Math.sin(a) * 4.2;
    return { x, z, yaw: Math.atan2(-x, -z) };
  });
  const box = (w, h, d, color, x = 0, y = 0, z = 0) => M.bevelBox({ w, h, d, color, offset: { x, y, z } });
  const disk = (radius, bottom, top, color, segments = 48) => M.lathe({ segments, profile: [[0, bottom], [radius, bottom], [radius, top], [0, top]], color });
  const node = (geo, x = 0, y = 0, z = 0) => S.createNode({ geometry: geo, position: { x, y, z } });
  const GOLD = "#c8a45f", EMERALD = "#245749";
  // Brass strips form the room's architectural fanlights. These are cached wall
  // finishes, kept outside the walkable floor rather than freestanding obstacles.
  const strip = (ax, ay, bx, by, width, color = GOLD, z = 0.17) => {
    const length = Math.hypot(bx - ax, by - ay), cs = (by - ay) / length, sn = (ax - bx) / length;
    const g = box(width, length, 0.05, color);
    for (let i = 0; i < g.verts.length; i += 3) {
      const x = g.verts[i], y = g.verts[i + 1];
      g.verts[i] = x * cs - y * sn + (ax + bx) / 2;
      g.verts[i + 1] = x * sn + y * cs + (ay + by) / 2;
      g.verts[i + 2] += z;
    }
    return g;
  };
  const fanlight = () => {
    const parts = [box(3.4, 4.3, 0.18, EMERALD, 0, 2.15)];
    for (const x of [-1.66, 1.66]) parts.push(box(0.055, 4.3, 0.06, GOLD, x, 2.15, 0.13));
    for (const y of [0.07, 4.23]) parts.push(box(3.32, 0.055, 0.06, GOLD, 0, y, 0.13));
    for (let i = 0; i <= 12; i++) {
      const a = i * Math.PI / 12;
      parts.push(strip(Math.cos(a) * 0.3, 1.7 + Math.sin(a) * 0.3, Math.cos(a) * 1.48, 1.7 + Math.sin(a) * 1.48, 0.042));
    }
    for (const [width, height] of [[2.4, 0.45], [1.6, 0.72], [0.8, 1]]) {
      parts.push(strip(-width / 2, 0.35, -width / 2, height, 0.055), strip(width / 2, 0.35, width / 2, height, 0.055), strip(-width / 2, height, width / 2, height, 0.055));
    }
    return M.merge(...parts);
  };
  // Geological wall finishes sit beyond x=23.4; the spectator boundary is x=23.
  // Like the mine's chamber walls, these are architecture, baked into two meshes.
  const caveWalls = theme => {
    const stone = [], veins = [], rand = BL.math.mulberry32(712);
    const crystal = theme.id === "crystal", ember = theme.id === "ember", jungle = theme.id === "jungle";
    for (const side of [-1, 1]) for (let z = -33; z <= 33; z += 6) {
      for (let band = 0; band < 5; band++) {
        const depth = 0.5 + rand() * 0.25, height = 1.6 + rand() * 0.4;
        stone.push(box(depth, height, 5.8, theme.stone[band % 3], side * 24.05, 0.9 + band * 1.8, z + (band % 2 ? 0.2 : -0.2)));
      }
      const length = 0.6 + rand() * 0.7;
      const drip = M.lathe({ segments: 6, profile: [[0.65, 0], [0.4, -length * 0.45], [0, -length]], color: theme.stone[2] });
      for (let i = 0; i < drip.verts.length; i += 3) { drip.verts[i] += side * 24.1; drip.verts[i + 1] += 9.1; drip.verts[i + 2] += z; }
      stone.push(drip);
      if (crystal) for (let k = 0; k < 3; k++) {
        const height = 1.4 + rand() * 1.7;
        const shard = M.lathe({ segments: 6, profile: [[0, 0], [0.46, 0.25], [0.37, height * 0.72], [0, height]], color: k === 1 ? theme.mineral : theme.accent, emissive: 0.38 });
        for (let i = 0; i < shard.verts.length; i += 3) {
          shard.verts[i] = side * 23.85 + shard.verts[i] * 0.45;
          shard.verts[i + 2] += z + (k - 1) * 0.9 + shard.verts[i + 1] * (k - 1) * 0.13;
          shard.verts[i + 1] += 2 + (k % 2) * 0.5;
        }
        veins.push(shard);
      }
      if (ember) for (let k = 0; k < 7; k++) {
        const seam = box(0.07, 0.72, 0.11, k % 2 ? theme.accent : theme.mineral, side * 23.62, 1 + k * 0.62, z + (k % 3) * 0.18);
        for (const f of seam.faces) f.emissive = 0.6;
        veins.push(seam);
      }
      if (jungle) for (let k = 0; k < 4; k++) stone.push(box(0.08, 0.13, 0.9 + rand(), theme.runner, side * 23.62, 1.8 + k * 1.8, z + (k & 1 ? -0.8 : 0.8)));
      if (theme.id === "moonstone") for (let k = 0; k < 5; k++) {
        const inlay = box(0.06, 0.07, 2.2 + rand(), theme.mineral, side * 23.62, 2.8 + k * 0.55, z);
        for (const f of inlay.faces) f.emissive = 0.35;
        veins.push(inlay);
      }
    }
    // Shallow mineral bands in the far wall repeat the room's geological palette.
    for (let k = 0; k < 7; k++) stone.push(box(48, 0.4, 0.22, theme.stone[k % 3], 0, 0.8 + k * 1.25, -36.35));
    const glow = veins.length ? M.merge(...veins) : null;
    if (glow) glow.castShadow = false;
    return { stone: M.merge(...stone), veins: glow };
  };
  // Banana Club's fittings, each drawn inside its FURNITURE box: one-offs bake into the shell, and pieces repeated
  // about the room are one geometry each, placed as nodes in `setTheme`. Small plain boxes keep the Canvas 2D sort's
  // faces small; the bottles' glow carries the dim room. Canvas 2D sorts and paints every face on the CPU, so there
  // `lite` (set by the scene from the renderer, before it builds) draws the same fittings with fewer faces.
  let lite = false;
  const CARPET = ["#1f3b30", "#284a3c"], WOOD = "#3b2519", OXBLOOD = "#5c1a22", ROPE = "#7a1622", BOTTLES = ["#d9892c", "#4f9a4a", "#dfe8de"];
  const flat = (w, h, d, color, x = 0, y = 0, z = 0, emissive = 0) => M.box({ w, h, d, color, emissive, offset: { x, y, z } });
  // A cord slung along z between two posts, with overlapping links so bends stay closed.
  const cord = (x, za, zb, y, sag, r, color) => {
    const links = [];
    for (let k = 0, n = lite ? 4 : 10; k < n; k++) {
      const z0 = za + (zb - za) * k / n, z1 = za + (zb - za) * (k + 1) / n, y0 = y - Math.sin(k / n * Math.PI) * sag, y1 = y - Math.sin((k + 1) / n * Math.PI) * sag;
      const dy = y1 - y0, dz = z1 - z0, overlap = r / (2 * Math.hypot(dy, dz));
      const ey = dy * overlap, ez = dz * overlap;
      links.push(M.beam(x, y0 - ey, z0 - ez, x, y1 + ey, z1 + ez, r * 2, color));
    }
    return links;
  };
  const clubFurniture = () => {
    const parts = [], block = lite ? flat : box, rand = BL.math.mulberry32(907);
    // The carpet's brass inlay runs every third seam of the floor grid, a 4 m link at a time.
    for (const x of [-18, -6, 6, 18]) for (let row = 0; row < 19; row++) parts.push(flat(0.06, 0.012, 4, GOLD, x, -0.009, (row - 9) * 4));
    for (const z of [-30, -18, -6, 6, 18, 30]) for (let col = 0; col < 13; col++) parts.push(flat(4, 0.012, 0.06, GOLD, (col - 6) * 4, -0.009, z));
    for (const f of FURNITURE) {
      if (f.kind === "bar") {
        // Against the wall, six bays of bottle shelves; a bartender's walk; then the counter, with its stools in front.
        const back = f.z - f.hz, front = f.z + f.hz;
        for (let k = 0; k <= 6; k++) parts.push(flat(0.08, 3.05, 0.35, WOOD, f.x - 7.5 + k * 2.5, 2.725, back + 0.175));
        for (let k = 0; k < 6; k++) {
          const x = f.x - 6.25 + k * 2.5;
          parts.push(flat(2.5, 4.3, 0.04, WOOD, x, 2.15, back + 0.02), block(2.5, 1.2, 0.35, WOOD, x, 0.6, back + 0.175), block(2.5, 0.12, 0.4, WOOD, x, 4.31, back + 0.2));
          for (const y of [1.95, 2.7, 3.45]) parts.push(flat(2.5, 0.05, 0.33, WOOD, x, y - 0.025, back + 0.185));
          for (const y of [1.2, 1.95, 2.7, 3.45, 4.25]) parts.push(flat(2.5, 0.035, 0.02, GOLD, x, y - 0.02, back + 0.36));
          for (const y of [1.2, 1.95, 2.7, 3.45]) for (let b = 0; b < 5; b++) {
            const h = 0.26 + rand() * 0.14, bx = x - 1 + b * 0.5 + (rand() - 0.5) * 0.12, tint = BOTTLES[Math.floor(rand() * 3)];
            if (lite) { if (!(b & 1)) parts.push(flat(0.12, h + 0.1, 0.12, tint, bx, y + (h + 0.1) / 2, back + 0.18, 0.6)); continue; }
            parts.push(flat(0.12, h, 0.12, tint, bx, y + h / 2, back + 0.18, 0.6), flat(0.045, 0.1, 0.045, tint, bx, y + h + 0.05, back + 0.18, 0.6));
          }
          parts.push(block(2.5, 1.02, 0.6, WOOD, x, 0.51, front - 0.75), block(2.5, 0.08, 0.7, "#24170f", x, 1.06, front - 0.72),
            flat(2.5, 0.05, 0.03, GOLD, x, 1.06, front - 0.355), flat(2.5, 0.045, 0.045, GOLD, x, 0.24, front - 0.42));
        }
      } else if (f.kind === "cage") {
        // The cashier's booth: a counter facing the room under a brass grille with a teller's gap, panelled sides and a canopy.
        const x0 = f.x - f.hx, x1 = f.x + f.hx, z0 = f.z - f.hz, z1 = f.z + f.hz;
        for (const z of [f.z - 1.2, f.z + 1.2]) parts.push(block(0.5, 1.1, 2.4, WOOD, x0 + 0.3, 0.55, z), flat(0.56, 0.04, 2.4, GOLD, x0 + 0.3, 1.12, z),
          flat(0.05, 0.05, 2.4, GOLD, x0 + 0.3, 2.6, z), block(0.1, 3.4, 2.4, WOOD, x1 - 0.05, 1.7, z));
        for (let n = 1; n < 25; n += lite ? 2 : 1) { const z = z0 + n * 0.2; if (Math.abs(z - f.z) > 0.45) parts.push(flat(0.03, 1.5, 0.03, GOLD, x0 + 0.3, 1.85, z)); }
        for (const z of [z0 + 0.05, z1 - 0.05]) parts.push(block(1.9, 2.6, 0.1, WOOD, f.x, 1.3, z));
        for (const z of [f.z - 1.25, f.z + 1.25]) parts.push(block(1.9, 0.15, 2.5, WOOD, f.x + 0.05, 2.675, z), block(0.06, 0.8, 2.5, OXBLOOD, x0 + 0.13, 3, z),
          flat(0.04, 0.04, 2.5, GOLD, x0 + 0.09, 3.38, z), flat(0.04, 0.04, 2.5, GOLD, x0 + 0.09, 2.62, z));
      } else if (f.kind === "highRoller") {
        // A deep red inlay round table 9 in 2 m squares, edged in brass.
        for (let x = f.x - f.hx + 1; x < f.x + f.hx; x += 2) for (let z = f.z - f.hz + 1; z < f.z + f.hz; z += 2) parts.push(flat(2, 0.012, 2, OXBLOOD, x, 0.001, z));
        for (let x = f.x - f.hx + 1; x < f.x + f.hx; x += 2) for (const z of [f.z - f.hz + 0.08, f.z + f.hz - 0.08]) parts.push(flat(2, 0.012, 0.1, GOLD, x, 0.008, z));
        for (let z = f.z - f.hz + 1; z < f.z + f.hz; z += 2) for (const x of [f.x - f.hx + 0.08, f.x + f.hx - 0.08]) parts.push(flat(0.1, 0.012, 2, GOLD, x, 0.008, z));
      }
    }
    // Deep red ropes between the outer pairs of posts leave the middle gap open.
    const posts = FURNITURE.filter(f => f.kind === "ropePost");
    for (let i = 0; i < posts.length; i += 2) parts.push(...cord(posts[i].x, posts[i].z, posts[i + 1].z, 0.86, 0.22, 0.025, ROPE));
    return M.merge(...parts);
  };
  // The repeated pieces, each built about its own origin to stand at its box's centre; the sofa's back is at +x.
  const stool = theme => M.merge(M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0], [0.19, 0], [0.19, 0.03], [0.05, 0.06], [0.035, 0.08], [0.035, 0.66], [0.14, 0.68], [0, 0.68]], color: GOLD }),
    M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0.68], [0.2, 0.68], [0.2, 0.77], [0.17, 0.8], [0, 0.8]], color: theme.felt }));
  const sofa = theme => M.merge(box(1.1, 0.3, 3.9, theme.panel, 0, 0.25), box(0.25, 0.78, 3.9, theme.felt, 0.45, 0.64),
    ...[-1, 1].flatMap(sz => [-1, 1].map(sx => flat(0.08, 0.1, 0.08, GOLD, sx * 0.45, 0.05, sz * 1.85))),
    ...[-1.17, 0, 1.17].flatMap(z => [box(0.86, 0.16, 1.14, theme.felt, -0.1, 0.48, z), box(0.16, 0.5, 1.14, theme.felt, 0.27, 0.78, z)]),
    ...[-1, 1].flatMap(s => [box(1.12, 0.36, 0.2, theme.felt, 0, 0.56, s * 1.87), flat(1.12, 0.03, 0.2, GOLD, 0, 0.755, s * 1.87)]));
  const lowTable = () => M.merge(box(0.95, 0.06, 1.75, WOOD, 0, 0.42), flat(0.97, 0.025, 1.77, GOLD, 0, 0.385),
    ...[-1, 1].flatMap(sz => [-1, 1].map(sx => flat(0.05, 0.37, 0.05, GOLD, sx * 0.4, 0.185, sz * 0.8))), flat(0.08, 0.1, 0.08, "#ffd28a", 0, 0.5, 0, 0.8));
  const ropePost = () => M.lathe({ segments: lite ? 4 : 12, profile: [[0, 0], [0.17, 0], [0.17, 0.035], [0.06, 0.08], [0.035, 0.11], [0.035, 0.88], [0.06, 0.9], [0.075, 0.95], [0.05, 0.995], [0, 1]], color: GOLD });
  // The dressing kit's palm is a 4 m tree; a potted one grows hub leaf cards from a lathe pot, its crown pulled in to the box.
  const palm = () => {
    const H = BL.hubModels, rand = BL.math.mulberry32(41);
    const pot = M.merge(M.lathe({ segments: lite ? 6 : 12, profile: [[0, 0], [0.2, 0], [0.27, 0.5], [0.3, 0.55], [0.26, 0.55], [0, 0.52]], color: "#2b211b" }),
      M.lathe({ segments: lite ? 6 : 12, profile: [[0.27, 0.47], [0.305, 0.5], [0.305, 0.56], [0.27, 0.56]], color: GOLD }));
    const geo = H.withJungle(pot, g => {
      H.liana(g, [[0, 0.5, 0], [0.02, 1, 0.01], [0, 1.45, 0]], 0.045, 0.03, "#6b4a2b");
      for (const [y, count, size] of lite ? [[0.85, 4, 0.55], [1.35, 4, 0.6]] : [[0.75, 5, 0.5], [1.1, 5, 0.55], [1.45, 6, 0.6]]) H.sprig(g, 0, y, 0, 0, 1, 0, count, size, rand);
    });
    let reach = 0;
    for (let i = 0; i < geo.verts.length; i += 3) if (geo.verts[i + 1] > 0.6) reach = Math.max(reach, Math.hypot(geo.verts[i], geo.verts[i + 2]));
    const k = Math.min(1, 0.33 / reach);
    for (let i = 0; i < geo.verts.length; i += 3) if (geo.verts[i + 1] > 0.6) { geo.verts[i] *= k; geo.verts[i + 2] *= k; }
    return geo;
  };
  // A tiered brass frame for each of the three chandeliers: three rings joined by four slanted arms each to the one
  // above, the top ring's arms meeting a central stem at y 7.6, the stem from the bottom ring's cross to a ceiling plate.
  const CRYSTAL_RINGS = [[2.1, 6.55, 24, 0.17], [1.45, 5.85, 16, 0.15], [0.8, 5.15, 10, 0.13]];
  const chandelierFrame = theme => {
    const ring = (r, y, h) => M.lathe({ segments: lite ? 16 : 48, profile: [[r + 0.08, y], [r + 0.08, y + h], [r - 0.08, y + h], [r - 0.08, y], [r + 0.08, y]], color: theme.accent });
    const parts = CRYSTAL_RINGS.map(([r, y, , h]) => ring(r, y, h));
    parts.push(flat(1.76, 0.04, 0.04, theme.accent, 0, 5.13), flat(0.04, 0.04, 1.76, theme.accent, 0, 5.13), M.beam(0, 5.11, 0, 0, 9.04, 0, 0.07, theme.accent), disk(0.5, 9.04, 9.1, theme.accent, lite ? 12 : 48));
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), s = Math.sin(a), [r0, y0, , h0] = CRYSTAL_RINGS[0];
      for (let t = 1; t < 3; t++) { const [r, y, , h] = CRYSTAL_RINGS[t], [ru, yu] = CRYSTAL_RINGS[t - 1]; parts.push(M.beam(c * r, y + h, s * r, c * ru, yu, s * ru, 0.05, theme.accent)); }
      parts.push(M.beam(c * r0, y0 + h0, s * r0, c * 0.035, 7.6, s * 0.035, 0.05, theme.accent));
    }
    return M.merge(...parts);
  };
  // Six-sided double-pointed gems, 0.26 m wide and 0.6 m long, white and pale blue in turn. Each ring's mesh is a double
  // curtain: a row under the ring, and a row half a step round, 0.45 m lower and 0.12 m in, each gem on a fine strand
  // from the ring. The drop is six 0.4 m gems tip to tip down the stem and a 0.9 m pendant ending at y 3.3. Four meshes,
  // shared by the three chandeliers, lit from within so the dim room and the lowest tier's missing bloom still see them.
  // Lite: one row of half as many four-sided gems a ring, no strands, and the pendant alone for the drop.
  const TINTS = ["#ffffff", "#d6eaff"];
  const crystals = () => {
    const gem = (x, top, z, width, length, color) => {
      const g = M.lathe({ segments: lite ? 4 : 6, profile: [[0, top], [width / 2, top - length * 0.3], [0, top - length]], color, emissive: 1 });
      for (let i = 0; i < g.verts.length; i += 3) { g.verts[i] += x; g.verts[i + 2] += z; } return g; };
    const meshes = CRYSTAL_RINGS.map(([r, y, count]) => {
      const parts = [];
      if (lite) for (let k = 0, n = Math.ceil(count / 2); k < n; k++) { const a = k * Math.PI * 2 / n; parts.push(gem(Math.cos(a) * r, y, Math.sin(a) * r, 0.26, 0.6, TINTS[k & 1])); }
      else for (let k = 0; k < count; k++) {
        const a = k * Math.PI * 2 / count, b = (k + 0.5) * Math.PI * 2 / count, ri = r - 0.12;
        parts.push(gem(Math.cos(a) * r, y, Math.sin(a) * r, 0.26, 0.6, TINTS[k & 1]), gem(Math.cos(b) * ri, y - 0.45, Math.sin(b) * ri, 0.26, 0.6, TINTS[(k + 1) & 1]),
          M.beam(Math.cos(b) * (r - 0.07), y, Math.sin(b) * (r - 0.07), Math.cos(b) * ri, y - 0.45, Math.sin(b) * ri, 0.02, TINTS[1], 0.6));
      }
      return M.merge(...parts);
    });
    meshes.push(lite ? gem(0, 4.2, 0, 0.45, 0.9, TINTS[0]) : M.merge(...Array.from({ length: 6 }, (_, k) => gem(0, 4.2 + (6 - k) * 0.4, 0, 0.26 * 0.4 / 0.6, 0.4, TINTS[k & 1])), gem(0, 4.2, 0, 0.45, 0.9, TINTS[0])));
    for (const g of meshes) g.castShadow = false;
    return meshes;
  };
  const cache = BL.models.scopedMap(), scoped = M.track(() => cache.clear());
  const geometry = (id = "gatsby") => {
    const theme = BL.pokerThemes.get(id), cave = theme.id !== "gatsby";
    scoped.use();
    const key = !cave && lite ? "gatsby-lite" : theme.id;
    if (cache.has(key)) return cache.get(key);
    const shell = [], dressed = BL.dressing.set(), lamps = BL.dressing.set();
    // The same floor footprint supports either the club or geological wall
    // finishes; kit lanterns and foliage follow the chosen cave palette.
    for (let row = 0; row < 19; row++) for (let col = 0; col < 13; col++)
      shell.push(box(3.98, 0.35, 3.98, cave ? ((col + row) % 3 ? theme.stone[0] : theme.stone[1]) : (col + row) % 2 ? CARPET[0] : CARPET[1], (col - 6) * 4, -0.19, (row - 9) * 4));
    if (!cave) shell.push(clubFurniture());
    for (let side = -1; side <= 1; side += 2) {
      shell.push(box(1.2, 10, 76, theme.stone[2], side * 25, 4.8));
      shell.push(box(0.1, 2.1, 73, theme.panel, side * 24.34, 1.05));
      shell.push(box(0.12, 0.08, 73, theme.accent, side * 24.27, 2.12));
      for (let z = -34; z <= 34; z += 8.5) {
        shell.push(box(0.9, 8.8, 1, theme.wood, side * 23.8, 4.4, z));
        shell.push(box(1.1, 0.3, 1.2, theme.accent, side * 23.8, 1.3, z));
        shell.push(box(1.1, 0.3, 1.2, theme.accent, side * 23.8, 7.6, z));
        if (!cave || theme.id === "jungle") for (let k = 0; k < (cave ? 6 : 3); k++)
          dressed.put("vine", side * 23.85, 6.1 + k * 0.24, z - 0.9 + k * 0.38, side > 0 ? 3 : 1, k % 3);
        if (theme.id === "jungle") dressed.put("runeStone", side * 24, 2.4, z, side > 0 ? 3 : 1);
      }
    }
    shell.push(box(50, 10, 1, theme.stone[3], 0, 4.8, -37));
    shell.push(box(50, 10, 1, theme.stone[3], 0, 4.8, REAR_WALL_Z + 0.5));
    shell.push(box(50, 0.8, 76, theme.stone[4], 0, 9.5));
    for (let z = -30; z <= 30; z += 12) {
      shell.push(box(48, 0.65, 0.8, theme.wood, 0, 8.9, z));
      shell.push(box(48, 0.06, 0.86, theme.accent, 0, 8.54, z));
    }
    // The central promenade is a flat inlay, leaving its whole width walkable.
    shell.push(box(6.7, 0.012, 68, theme.runner, 0, 0.001));
    for (const x of [-3.6, -3.36, 3.36, 3.6]) shell.push(box(0.085, 0.02, 70, theme.accent, x, 0.012));
    for (let z = -30; z <= 30; z += 12) {
      const tile = box(2.4, 0.01, 2.4, theme.mineral, 0, 0.012);
      for (let j = 0; j < tile.verts.length; j += 3) {
        const x = tile.verts[j], zz = tile.verts[j + 2];
        tile.verts[j] = (x - zz) * Math.SQRT1_2; tile.verts[j + 2] = (x + zz) * Math.SQRT1_2 + z;
      }
      shell.push(tile);
    }
    for (const p of TABLES) {
      lamps.cable(p.x, 8.8, p.z - 1.8, p.x, 8.8, p.z + 1.8, 3.1, [0.25, 0.5, 0.75], "hanging", theme.lamp);
      if (!cave || theme.id === "jungle") for (const dx of [-3.6, 3.6]) dressed.put("vine", p.x + dx, 8.5, p.z - 4.8, 0, dx > 0 ? 1 : 2);
    }
    if (cave) for (const z of [-24, 0, 24])
      lamps.cable(-2, 8.9, z, 2, 8.9, z, 2.2, [0.25, 0.5, 0.75], "hanging", theme.lamp);
    const rock = cave ? caveWalls(theme) : null;
    if (rock) shell.push(rock.stone);
    const chair = M.merge(box(0.95, 0.22, 0.9, theme.panel, 0, 0.57), box(1.0, 1.1, 0.18, theme.wood, 0, 1, -0.4),
      box(0.79, 0.78, 0.12, theme.felt, 0, 1.03, -0.26), box(0.96, 0.06, 0.2, theme.accent, 0, 1.54, -0.4),
      box(0.18, 0.5, 0.18, "#373a35", -0.33, 0.25, 0.28), box(0.18, 0.5, 0.18, "#373a35", 0.33, 0.25, 0.28),
      box(0.18, 0.5, 0.18, "#373a35", -0.33, 0.25, -0.28), box(0.18, 0.5, 0.18, "#373a35", 0.33, 0.25, -0.28));
    const jacket = M.merge(box(0.92, 0.96, 0.66, "#292f33", 0, 0.49),
      box(0.31, 0.66, 0.08, "#e6e1ce", 0, 0.62, 0.36),
      box(0.1, 0.48, 0.09, "#e6b634", 0, 0.52, 0.42),
      box(0.18, 0.14, 0.1, "#f7d052", 0, 0.84, 0.42));
    const built = {
      shell: M.merge(...shell), veins: rock?.veins || null, dressing: dressed.build(), lamps: lamps.build(), chair, jacket, fanlight: fanlight(),
      sleeve: box(0.4, 0.78, 0.43, "#292f33", 0, -0.29, 0.025),
      cuff: box(0.41, 0.12, 0.44, "#e6e1ce", 0, -0.73, 0.025),
      base: M.merge(box(1.5, 1, 1.3, theme.stone[1], -2.5, 0.5), box(1.5, 1, 1.3, theme.stone[1], 2.5, 0.5)),
      stone: disk(1, 1.02, 1.32, theme.stone[5]), rim: disk(1, 1.32, 1.36, theme.accent), felt: disk(1, 1.36, 1.38, theme.felt),
      pinstripe: M.lathe({ segments: 64, profile: [[1, 1.384], [0.995, 1.384]], color: theme.accent }),
      back: BL.pokerCards.geometry(null), chip: disk(0.17, 0, 0.055, "#e2b43c"),
      button: disk(0.16, 0, 0.055, "#ece3c7"),
      title: BL.poolModels.carve("BANANA POKER", { cell: 0.24, color: theme.accent }),
      welcome: BL.poolModels.carve(cave ? theme.name.toUpperCase() : "GOOD HANDS GOOD COMPANY", { cell: 0.1, color: theme.mineral, emissive: 0.1 })
    };
    if (!cave) {
      Object.assign(built, { stool: stool(theme), sofa: sofa(theme), lowTable: lowTable(), palm: palm(), post: ropePost(), chandelier: chandelierFrame(theme), crystals: crystals(),
        pinstripeGold: M.lathe({ segments: 64, profile: [[1, 1.385], [0.993, 1.385]], color: "#f2cf6e", emissive: 0.45 }),
        cashier: BL.poolModels.carve("CASHIER", { cell: 0.12, color: "#ffe1a0", emissive: 1 }) });
      built.cashier.geometry.castShadow = false;
    }
    cache.set(key, built); return built;
  };
  const card = c => BL.pokerCards.geometry(c);
  const build = (id = "gatsby") => {
    const theme = BL.pokerThemes.get(id), g = geometry(theme.id), root = S.createNode(), environment = S.createNode(), tables = [];
    const fixtures = S.createNode();
    S.addChild(root, environment, fixtures);
    for (let i = 0; i < 10; i++) {
      const p = TABLES[i], group = S.createNode({ position: { x: p.x, y: 0, z: p.z } });
      const top = node(g.stone); top.scale.x = 4.75; top.scale.z = 3.15;
      const rim = node(g.rim); rim.scale.x = 4.5; rim.scale.z = 2.92;
      const felt = node(g.felt); felt.scale.x = 4.38; felt.scale.z = 2.8;
      const pinstripe = node(g.pinstripe); pinstripe.scale.x = 4.02; pinstripe.scale.z = 2.44;
      const base = node(g.base);
      S.addChild(group, base, top, rim, felt, pinstripe);
      const chairs = [], chips = [], backs = [];
      for (const s of SEATS) {
        const chair = node(g.chair, s.x, 0, s.z); chair.rotation.y = s.yaw; chairs.push(chair); S.addChild(group, chair);
        const pile = node(g.chip, s.x * 0.65, 1.39, s.z * 0.59); pile.visible = false; chips.push(pile); S.addChild(group, pile);
        const cards = S.createNode({ position: { x: s.x * 0.57, y: 1.4, z: s.z * 0.57 }, rotation: { x: 0, y: s.yaw, z: 0 } });
        S.addChild(cards, node(g.back, -0.26), node(g.back, 0.26, 0.015)); cards.visible = false; backs.push(cards); S.addChild(group, cards);
      }
      // Deal left to right and print upright as seen from the gorilla's side of the table.
      const board = Array.from({ length: 5 }, (_, j) => { const n = node(g.back, (2 - j) * 0.72, 1.41); n.rotation.y = Math.PI; n.visible = false; S.addChild(group, n); return n; });
      const button = node(g.button); S.addChild(group, button); button.visible = false;
      const lettering = BL.poolModels.carve(`TABLE ${i + 1}`, { cell: 0.1, color: "#ffe1a0", emissive: 1 });
      lettering.geometry.castShadow = false;
      const label = S.createNode({ position: { x: 0, y: 4.65, z: 0 } });
      label.scale.x = label.scale.y = label.scale.z = 0.7;
      const text = node(lettering.geometry, -(lettering.width - 0.2) / 2);
      text.glow = 1;
      S.addChild(label, text); S.addChild(group, label);
      const agent = BL.agent.create({ groundAt: () => 0, x: 0, z: -3.6, managed: true, scale: 1.16 });
      agent.poseManaged(1, 0, 0, -3.6, 0, 0, false, true);
      S.addChild(agent.parts.torso, node(g.jacket));
      for (const arm of [agent.parts.armR, agent.parts.armL]) S.addChild(arm, node(g.sleeve), node(g.cuff));
      S.addChild(group, agent.root);
      const dealCard = node(g.back, 0, 1.5, -2.4); dealCard.visible = false; S.addChild(group, dealCard);
      S.addChild(root, group);
      tables.push({ root: group, base, top, rim, felt, pinstripe, chairs, chips, backs, board, button, label, agent, dealCard, actors: new Array(SEATS.length).fill(null), version: -1, pulse: 0 });
    }
    let current = null;
    const sparkle = [];
    const setTheme = id => {
      const next = BL.pokerThemes.get(id); if (current === next.id) return;
      const geo = geometry(next.id);
      while (environment.children.length) S.removeChild(environment, environment.children[environment.children.length - 1]);
      while (fixtures.children.length) S.removeChild(fixtures, fixtures.children[fixtures.children.length - 1]);
      sparkle.length = 0;
      S.addChild(environment, node(geo.shell), ...BL.dressing.nodes(geo.dressing, { glow: 1 }));
      S.addChild(fixtures, ...BL.dressing.nodes(geo.lamps, { glow: 1 }));
      if (geo.veins) { const n = node(geo.veins); n.glow = 1; S.addChild(environment, n); }
      if (next.id === "gatsby") {
        for (const side of [-1, 1]) for (const z of [-29.75, -12.75, 4.25, 21.25]) {
          const panel = node(geo.fanlight, side * 24.27, 2.65, z);
          panel.rotation.y = -side * Math.PI / 2; S.addChild(environment, panel);
        }
        for (let f = 0; f < 3; f++) {
          const z = (f - 1) * 24;
          S.addChild(fixtures, node(geo.chandelier, 0, 0, z));
          for (let ring = 0; ring < 4; ring++) { const n = node(geo.crystals[ring], 0, 0, z); n.ring = ring; n.fixture = f; sparkle.push(n); S.addChild(fixtures, n); }
        }
        for (const f of FURNITURE) {
          if (f.kind === "bar") for (let k = 0; k < 5; k++) S.addChild(environment, node(geo.stool, f.x - 6 + k * 3, 0, f.z + f.hz - 0.22));
          else if (f.kind === "sofa") { const n = node(geo.sofa, f.x, 0, f.z); n.rotation.y = f.x < 0 ? Math.PI : 0; S.addChild(environment, n); }
          else if (f.kind === "lowTable") S.addChild(environment, node(geo.lowTable, f.x, 0, f.z));
          else if (f.kind === "palm") S.addChild(environment, node(geo.palm, f.x, 0, f.z));
          else if (f.kind === "ropePost") S.addChild(environment, node(geo.post, f.x, 0, f.z));
          else if (f.kind === "cage") {
            // Turned to face the room from the canopy's front, centred on the booth.
            const sign = node(geo.cashier.geometry, f.x - f.hx + 0.22, 3.25, f.z - (geo.cashier.width - 0.24) / 2);
            sign.rotation.y = -Math.PI / 2; S.addChild(environment, sign);
          }
        }
      }
      const title = geo.title;
      S.addChild(environment, node(title.geometry, -title.width / 2, 6.4, -36.15));
      const welcome = geo.welcome;
      S.addChild(environment, node(welcome.geometry, -welcome.width / 2, 5.2, -36.15));
      for (const table of tables) {
        table.base.geometry = geo.base; table.top.geometry = geo.stone;
        table.rim.geometry = geo.rim; table.felt.geometry = geo.felt; table.pinstripe.geometry = geo.pinstripe;
        for (const chair of table.chairs) chair.geometry = geo.chair;
      }
      if (geo.pinstripeGold) tables[HIGH_ROLLER].pinstripe.geometry = geo.pinstripeGold;
      current = next.id;
    };
    setTheme(theme.id);
    return { root, tables, fixtures, sparkle, setTheme, get theme() { return current; } };
  };
  // Banana Club's fittings as axis-aligned boxes (centre, half-extents) in room coordinates; the geometry is built from
  // the same table. `solid` ones stop walkers, while the high-roller corner is only a mark round table 9.
  const FURNITURE = Object.freeze([
    { kind: "bar", x: -10, z: -35.3, hx: 8, hz: 0.9, solid: true }, { kind: "bar", x: 10, z: -35.3, hx: 8, hz: 0.9, solid: true },
    { kind: "cage", x: 22.4, z: 31, hx: 1.0, hz: 2.5, solid: true },
    { kind: "sofa", x: -22.6, z: -31, hx: 0.6, hz: 2.0, solid: true }, { kind: "sofa", x: 22.6, z: -31, hx: 0.6, hz: 2.0, solid: true },
    { kind: "lowTable", x: -20.6, z: -31, hx: 0.5, hz: 0.9, solid: true }, { kind: "lowTable", x: 20.6, z: -31, hx: 0.5, hz: 0.9, solid: true },
    { kind: "palm", x: -22.3, z: -28.6, hx: 0.35, hz: 0.35, solid: true }, { kind: "palm", x: 22.3, z: -28.6, hx: 0.35, hz: 0.35, solid: true },
    { kind: "ropePost", x: 5.0, z: -28.4, hx: 0.2, hz: 0.2, solid: true }, { kind: "ropePost", x: 5.0, z: -26.8, hx: 0.2, hz: 0.2, solid: true },
    { kind: "ropePost", x: 5.0, z: -21.8, hx: 0.2, hz: 0.2, solid: true }, { kind: "ropePost", x: 5.0, z: -20.2, hx: 0.2, hz: 0.2, solid: true },
    { kind: "rope", x: 5.0, z: -27.6, hx: 0.1, hz: 0.8, solid: true }, { kind: "rope", x: 5.0, z: -21.0, hx: 0.1, hz: 0.8, solid: true },
    { kind: "highRoller", x: 11, z: -24, hx: 7.0, hz: 5.0, solid: false }
  ].map(f => Object.freeze(f)));
  const HIGH_ROLLER = 9;
  const CLUB_SOLIDS = FURNITURE.filter(f => f.solid), NO_SOLIDS = [];
  // The room is rebuilt per visit but this module lives for the page, so the scene puts it back on "gatsby" in `leave`.
  let solids = CLUB_SOLIDS;
  // As with the floor, the scene puts lite back off in `leave`; a cave theme ignores it.
  const setLite = on => { lite = on; };
  const setFloor = themeId => { solids = themeId === "gatsby" ? CLUB_SOLIDS : NO_SOLIDS; };
  // Whether the segment, grown by r, crosses box f: a slab test on t in [0, 1], so a zero-length step tests its point.
  const crosses = (ax, az, bx, bz, r, f) => {
    let lo = 0, hi = 1;
    const dx = bx - ax, dz = bz - az, x0 = f.x - f.hx - r, x1 = f.x + f.hx + r, z0 = f.z - f.hz - r, z1 = f.z + f.hz + r;
    if (dx === 0) { if (ax <= x0 || ax >= x1) return false; } else {
      const p = (x0 - ax) / dx, q = (x1 - ax) / dx;
      lo = Math.max(lo, Math.min(p, q)); hi = Math.min(hi, Math.max(p, q));
      if (lo >= hi) return false;
    }
    if (dz === 0) return az > z0 && az < z1;
    const p = (z0 - az) / dz, q = (z1 - az) / dz;
    return Math.max(lo, Math.min(p, q)) < Math.min(hi, Math.max(p, q));
  };
  const walkable = (ax, az, bx, bz, y, height, actor) => {
    const r = actor?.bodyRadius || 0.4;
    // Leave room to reach the glass, but never continue through the wall behind it.
    const rear = Math.abs(bx) < BL.bifrostModels.WINDOW.halfW - r ? REAR_WALL_Z - 0.01 : 35.5 - r;
    if (Math.abs(bx) > 23 - r || bz < -35.5 + r || bz > rear) return false;
    // A swept ellipse catches a fast step through a table, not just its endpoint.
    for (const t of TABLES) {
      const rx = 4.85 + r, rz = 3.25 + r, x = (ax - t.x) / rx, z = (az - t.z) / rz;
      const dx = (bx - ax) / rx, dz = (bz - az) / rz, d = dx * dx + dz * dz;
      const u = d ? Math.max(0, Math.min(1, -(x * dx + z * dz) / d)) : 0;
      if ((x + u * dx) ** 2 + (z + u * dz) ** 2 < 1) return false;
      for (const s of SEATS) {
        const sx = t.x + s.x, sz = t.z + s.z, vx = bx - ax, vz = bz - az, dd = vx * vx + vz * vz;
        const k = dd ? Math.max(0, Math.min(1, ((sx - ax) * vx + (sz - az) * vz) / dd)) : 0;
        if ((ax + k * vx - sx) ** 2 + (az + k * vz - sz) ** 2 < (r + 0.53) ** 2) return false;
      }
    }
    for (let i = 0; i < solids.length; i++) if (crosses(ax, az, bx, bz, r, solids[i])) return false;
    return true;
  };
  /** Writes into `out` the nearest point, on rings 0.5 m apart out to 4 m in sixteen directions, where a body may stand. */
  const nearestClear = (x, z, actor, out) => {
    out.x = x; out.z = z;
    if (walkable(x, z, x, z, 0, 2, actor)) return out;
    for (let ring = 1; ring <= 8; ring++) {
      const d = ring * 0.5;
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        if (walkable(px, pz, px, pz, 0, 2, actor)) { out.x = px; out.z = pz; return out; }
      }
    }
    throw new Error(`pokerModels.nearestClear: nothing clear within 4 m of (${x}, ${z})`);
  };
  // The bar wings' and the cage's warm lights, eight floats each (x, y, z, range, r, g, b, 0), after the room's thirteen.
  const CLUB_LIGHTS = Float32Array.from([-10, 3, -35.6, 9, 1, 0.7, 0.4, 0, 10, 3, -35.6, 9, 1, 0.7, 0.4, 0, 20.6, 2.4, 31, 7, 1, 0.85, 0.55, 0]), NO_LIGHTS = new Float32Array(0);
  const lights = themeId => BL.pokerThemes.get(themeId).id === "gatsby" ? CLUB_LIGHTS : NO_LIGHTS;
  BL.pokerModels = { TABLES, SEATS, REAR_WALL_Z, PORTAL_Z, EXIT_Z, FURNITURE, HIGH_ROLLER, geometry, card, build, walkable, setFloor, setLite, nearestClear, lights };
})();
