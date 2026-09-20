(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, merge } = BL.models;
  const cached = (build) => {
    let value = null;
    return () => value || (value = build());
  };
  const variants = (build) => {
    const cache = new Array(11);
    return (i = 0) => cache[i % 11] || (cache[i % 11] = build(i % 11));
  };
  const STONE = ["#7d6f61", "#5e5449", "#877869"];
  const MOSS = ["#6f7d3e", "#7b8945", "#65733a"];
  const ROOM_RADIUS = 14;
  const MATTRESS = { width: 1.45, depth: 2.45, height: 0.345, wallInset: 0.65, surface: 0.245, pillowTop: 0.345, pillowZ: -0.82 };
  // 19 room slots: eleven HQ plus eight basement.
  // Static geometry is reused across visits without retaining a departed room or scene.
  const mattressCache = new Array(19);
  const roomSignCache = new Array(19);
  const fabric = (pattern, width, depth, top, bottom, centerZ, kind) => {
    const geo = { verts: [], faces: [], lines: [] }, size = pattern.width, colors = pattern.colors;
    const cells = new Uint32Array(size * size), used = new Uint8Array(cells.length);
    for (let i = 0; i < cells.length; i++) cells[i] = colors[i * 3] << 16 | colors[i * 3 + 1] << 8 | colors[i * 3 + 2];
    const quad = (a, b, c, d, color) => {
      const i = geo.verts.length / 3;
      geo.verts.push(...a, ...b, ...c, ...d);
      geo.faces.push({ i: [i, i + 1, i + 2, i + 3], color: [color >>> 16, color >>> 8 & 255, color & 255], emissive: 0, mattressFabric: kind });
    };
    const xAt = (x) => (x / size - 0.5) * width, zAt = (z) => (z / size - 0.5) * depth + centerZ;
    // Merge equal-colour rectangles: every LifeHash pixel is kept, face count stays small in both renderers.
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const start = z * size + x, color = cells[start];
      if (used[start]) continue;
      let w = 1, h = 1;
      while (x + w < size && !used[start + w] && cells[start + w] === color) w++;
      rows: while (z + h < size) {
        for (let dx = 0; dx < w; dx++) if (used[start + h * size + dx] || cells[start + h * size + dx] !== color) break rows;
        h++;
      }
      for (let dz = 0; dz < h; dz++) used.fill(1, start + dz * size, start + dz * size + w);
      const x0 = xAt(x), x1 = xAt(x + w), z0 = zAt(z), z1 = zAt(z + h);
      quad([x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0], color);
    }
    // Edge pixels continue down the case and sheet so the sides carry the same fabric, not an unprinted block.
    for (let edge = 0; edge < 4; edge++) for (let i = 0; i < size;) {
      const pixel = (n) => edge < 2 ? (edge ? size - 1 : 0) * size + n : n * size + (edge === 3 ? size - 1 : 0);
      const color = cells[pixel(i)];
      let end = i + 1;
      while (end < size && cells[pixel(end)] === color) end++;
      if (edge < 2) {
        const x0 = xAt(i), x1 = xAt(end), z = zAt(edge ? size : 0);
        if (edge) quad([x0, bottom, z], [x1, bottom, z], [x1, top, z], [x0, top, z], color);
        else quad([x1, bottom, z], [x0, bottom, z], [x0, top, z], [x1, top, z], color);
      } else {
        const x = xAt(edge === 3 ? size : 0), z0 = zAt(i), z1 = zAt(end);
        if (edge === 3) quad([x, bottom, z1], [x, bottom, z0], [x, top, z0], [x, top, z1], color);
        else quad([x, bottom, z0], [x, bottom, z1], [x, top, z1], [x, top, z0], color);
      }
      i = end;
    }
    return geo;
  };
  const mattress = (room) => {
    const roomKey = [room.x, room.floor, room.z].map((n) => Number(n.toFixed(6))).join(",");
    const slot = room.index + (room.basement ? 11 : 0), cached = mattressCache[slot];
    if (cached && cached.mattress.roomKey === roomKey) return cached;
    const sheet = { seed: `room:${roomKey}:sheet` };
    sheet.pattern = BL.lifehash.make(sheet.seed);
    // The pillow carries the same LifeHash rotated a quarter turn, following the bedding's long axis.
    const pattern = sheet.pattern, colors = new Uint8Array(pattern.colors.length), size = pattern.width;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = ((size - 1 - x) * size + y) * 3, to = (y * size + x) * 3;
      colors[to] = pattern.colors[from]; colors[to + 1] = pattern.colors[from + 1]; colors[to + 2] = pattern.colors[from + 2];
    }
    const pillow = { seed: sheet.seed, pattern: { width: size, height: size, colors, hash: pattern.hash } };
    const base = box({ w: MATTRESS.width - 0.02, h: 0.035, d: MATTRESS.depth - 0.02, color: "#c6b997", offset: { y: 0.0175 } });
    // The blanket is the top surface; a second buried top can sort in front of it in the Canvas painter.
    base.faces.splice(4, 1);
    const geo = merge(
      base,
      fabric(sheet.pattern, MATTRESS.width, MATTRESS.depth, MATTRESS.surface, 0.035, 0, "sheet"),
      fabric(pillow.pattern, 0.9, 0.5, MATTRESS.pillowTop, MATTRESS.surface, MATTRESS.pillowZ, "pillow")
    );
    geo.mattress = { roomKey, width: MATTRESS.width, depth: MATTRESS.depth, height: MATTRESS.height, sheet, pillow };
    mattressCache[slot] = geo;
    return geo;
  };
  const roomSign = (room) => {
    const bedding = mattress(room).mattress, slot = room.index + (room.basement ? 11 : 0), cached = roomSignCache[slot];
    if (cached && cached.roomLifehashSign.roomKey === bedding.roomKey) return cached;
    const hash = bedding.sheet.pattern.hash, text = hash.slice(0, 8).toUpperCase(), width = 2.12, height = 0.72, cell = 0.055, pixel = 0.047;
    const geo = merge(
      box({ w: width, h: height, d: 0.08, color: "#4a3319" }),
      box({ w: width - 0.08, h: 0.345, d: 0.025, color: "#8f6538", offset: { y: 0.1775, z: 0.04 } }),
      box({ w: width - 0.08, h: 0.345, d: 0.025, color: "#9c7040", offset: { y: -0.1775, z: 0.04 } }),
      ...[-0.72, 0.72].map((x) => box({ w: 0.035, h: 0.30, d: 0.035, color: "#63472f", offset: { x, y: 0.48, z: -0.08 } })),
      ...[-1, 1].flatMap((x) => [-0.27, 0.27].map((y) => box({ w: 0.035, h: 0.035, d: 0.015, color: "#3a2a18", offset: { x, y, z: 0.058 } })))
    );
    for (let ch = 0; ch < text.length; ch++) {
      const glyph = BL.hubModels.SIGN_GLYPHS[text[ch]];
      for (let row = 0; row < glyph.length; row++) for (let col = 0; col < 3;) {
        if (glyph[row][col] !== "1") { col++; continue; }
        const start = col++;
        while (col < 3 && glyph[row][col] === "1") col++;
        // Merge each horizontal ink stroke into one face; the inscription is static geometry shared across visits.
        const x0 = -(text.length * 4 - 1) * cell / 2 + (ch * 4 + start) * cell + (cell - pixel) / 2;
        const x1 = x0 + (col - start - 1) * cell + pixel, y = (2 - row) * cell;
        const at = geo.verts.length / 3;
        geo.verts.push(x0, y - pixel / 2, 0.054, x1, y - pixel / 2, 0.054, x1, y + pixel / 2, 0.054, x0, y + pixel / 2, 0.054);
        geo.faces.push({ i: [at, at + 1, at + 2, at + 3], color: [211, 193, 155], emissive: 0.2, roomSignInk: true });
      }
    }
    // The hanging point is the origin, so impacts rotate the sign about its cords, not the board's middle.
    const size = 0.56;
    for (let i = 0; i < geo.verts.length; i += 3) {
      geo.verts[i] *= size;
      geo.verts[i + 1] = (geo.verts[i + 1] - 0.63) * size;
      geo.verts[i + 2] = (geo.verts[i + 2] + 0.08) * size;
    }
    geo.roomLifehashSign = { roomKey: bedding.roomKey, hash, lines: [text], width: width * size, height: height * size,
      board: new Float64Array([-width * size / 2, (-height / 2 - 0.63) * size, 0.04 * size, width * size / 2, (height / 2 - 0.63) * size, 0.1455 * size]) };
    roomSignCache[slot] = geo;
    return geo;
  };
  const room = cached(() => {
    const parts = [box({ w: 1.3, h: 0.04, d: 1.3, color: "#39352d", offset: { y: 0.025 } })];
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      parts.push(box({ w: 0.48, h: 0.22 + i % 3 * 0.045, d: 0.44, color: STONE[i % STONE.length], offset: { x: Math.sin(angle) * 0.95, y: 0.11, z: Math.cos(angle) * 0.95 } }));
    }
    for (const x of [-2.6, 2.6]) {
      parts.push(box({ w: 0.52, h: 0.2, d: 2.15, color: "#735338", offset: { x, y: 0.48 } }));
      for (const z of [-0.8, 0.8]) parts.push(box({ w: 0.58, h: 0.38, d: 0.45, color: STONE[1], offset: { x, y: 0.19, z } }));
    }
    parts.push(box({ w: 0.85, h: 0.17, d: 0.18, color: "#51402d", offset: { y: 0.1, z: -0.15 } }), box({ w: 0.18, h: 0.14, d: 0.92, color: "#63472f", offset: { x: 0.15, y: 0.23 } }));
    return merge(...parts);
  });
  // Rough cairns sit outside the clear entrance at x = +/-2.3; the slope begins between them.
  const entranceRamp = cached(() => {
    const parts = [];
    for (const x of [-2.3, 2.3]) {
      parts.push(box({ w: 0.45, h: 0.3, d: 0.46, color: STONE[1], offset: { x, y: 0.15, z: 0.1 } }), box({ w: 0.34, h: 0.24, d: 0.3, color: STONE[0], offset: { x: x + 0.03, y: 0.42, z: 0.09 } }), box({ w: 0.24, h: 0.025, d: 0.22, color: MOSS[0], offset: { x: x + 0.02, y: 0.553, z: 0.09 } }));
    }
    const geo = merge(...parts);
    geo.headquartersRamp = true;
    return geo;
  });
  const buildRoomEntrance = (i, lightLintel) => {
    const rand = BL.math.mulberry32(827 + i * 311), parts = [];
    for (const side of [-1, 1]) for (let row = 0; row < 8; row++) {
      const x = side * (2.25 + (row + i) % 3 * 0.07), y = 0.25 + row * 0.5, depth = 0.52 + rand() * 0.18;
      parts.push(box({ w: 0.64, h: 0.5, d: depth, color: STONE[(row + i + (side > 0 ? 1 : 0)) % STONE.length], offset: { x, y, z: -0.06 } }));
      if ((row + i + (side > 0 ? 2 : 0)) % 4 === 0) {
        parts.push(box({ w: 0.245, h: 0.245, d: 0.025, color: MOSS[(row + i) % MOSS.length], offset: { x: x + side * 0.08, y: y + 0.12, z: depth * 0.5 - 0.045 } }));
      }
    }
    for (let col = 0; col < 8; col++) {
      const x = -2.1 + col * 0.6, y = 3.96 + (col + i) % 3 * 0.04, depth = 0.58 + rand() * 0.15;
      const lintel = box({ w: 0.62, h: 0.52, d: depth, color: lightLintel ? STONE[2] : STONE[(col + i) % STONE.length], offset: { x, y, z: -0.06 } });
      for (const face of lintel.faces) face.headquartersEntranceLintel = true;
      parts.push(lintel);
      if ((col + i * 3) % 5 < 2) {
        parts.push(box({ w: 0.245, h: 0.245, d: 0.025, color: MOSS[(col + i) % MOSS.length], offset: { x, y: y + 0.12, z: depth * 0.5 - 0.045 } }));
        if ((col + i) % 2) parts.push(box({ w: 0.245, h: 0.245, d: 0.025, color: MOSS[(col + i + 1) % MOSS.length], offset: { x: x + 0.24, y: y - 0.12, z: depth * 0.5 - 0.045 } }));
      }
    }
    const geometry = merge(...parts);
    geometry.collisionBoxes = new Float64Array(parts.length * 6);
    for (let j = 0; j < parts.length; j++) {
      const bounds = BL.scene.boundsOf(parts[j]);
      geometry.collisionBoxes.set(bounds.min, j * 6);
      geometry.collisionBoxes.set(bounds.max, j * 6 + 3);
    }
    return geometry;
  };
  const roomEntrance = variants((i) => buildRoomEntrance(i, false));
  const rampEntrance = variants((i) => buildRoomEntrance(i, true));
  BL.headquartersModels = { room, entranceRamp, roomEntrance, rampEntrance, mattress, roomSign, MATTRESS, ROOM_RADIUS };
})();
