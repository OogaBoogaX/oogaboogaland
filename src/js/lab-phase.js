// The lab doorway consumes incoming bananas without a reflective surface.
// Its bounded glyph crests use the mirror's wave timing and rune alphabet.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const { CAPACITY, START_RADIUS, SPEED, LIFETIME } = BL.mirrorRipples;
  const MASKS = [630678, 497559, 988959, 495513, 1009263, 288049, 456438, 616809];
  const PER_WAVE = 24, GEOMETRIES = [];
  const glyphGeometry = (index) => {
    if (GEOMETRIES[index]) return GEOMETRIES[index];
    const verts = [], faces = [], mask = MASKS[index & 7];
    const color = BL.math.hexToRgb(index >= 8 ? "#d6ffe3" : "#46ff70");
    for (let bit = 0; bit < 24; bit++) {
      if (!(mask & (1 << bit))) continue;
      const x = ((bit & 3) - 1.5) * 0.025, y = (2.5 - (bit >> 2)) * 0.025, at = verts.length / 3;
      verts.push(x - 0.01, y - 0.01, 0, x + 0.01, y - 0.01, 0, x + 0.01, y + 0.01, 0, x - 0.01, y + 0.01, 0);
      faces.push({ i: [at, at + 1, at + 2, at + 3], color, emissive: 1 }, { i: [at + 3, at + 2, at + 1, at], color, emissive: 1 });
    }
    return GEOMETRIES[index] = { verts, faces, lines: [], castShadow: false };
  };
  const create = (group, mouth, opening) => {
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry), plane = 0.5;
    const minX = opening.minX, maxX = opening.maxX, minY = opening.floorY, maxY = opening.ceilingY;
    const geometry = { verts: [minX, minY, 0, maxX, maxY, 0], faces: [], lines: [], castShadow: false };
    const node = createNode({ geometry, position: { x: 0, y: 0, z: plane }, matrixNative: true });
    addChild(group, node);
    const ripples = BL.mirrorRipples.create(node), glyphs = new Array(CAPACITY * PER_WAVE);
    for (let i = 0; i < glyphs.length; i++) {
      glyphs[i] = createNode({ geometry: glyphGeometry(i & 15), visible: false, smokeOpacity: 0 });
      addChild(node, glyphs[i]);
    }
    let contactX = 0, contactY = 0, activeGlyphs = 0;
    const intersection = (ax, ay, az, bx, by, bz) => {
      const dx = ax - mouth.x, dz = az - mouth.z, ex = bx - mouth.x, ez = bz - mouth.z;
      const from = dx * sr + dz * cr - plane, to = ex * sr + ez * cr - plane;
      // Only incoming rounds cross the phase boundary. Include a final point
      // rounded to either side of the plane, but never a parallel segment.
      if (from <= 1e-6 || to > 1e-6 || from - to < 1e-8) return -1;
      const t = Math.min(1, from / (from - to));
      contactX = (dx + (ex - dx) * t) * cr - (dz + (ez - dz) * t) * sr;
      contactY = ay + (by - ay) * t - mouth.floorY;
      return contactX >= minX && contactX <= maxX && contactY >= minY && contactY <= maxY ? t : -1;
    };
    const clipTarget = (from, to) => {
      const t = intersection(from.x, from.y, from.z, to.x, to.y, to.z);
      if (t < 0) return false;
      to.x = from.x + (to.x - from.x) * t;
      to.y = from.y + (to.y - from.y) * t;
      to.z = from.z + (to.z - from.z) * t;
      return true;
    };
    const absorb = (ax, ay, az, point, dt = 0) => {
      const t = intersection(ax, ay, az, point.x, point.y, point.z);
      if (t < 0) return false;
      point.x = ax + (point.x - ax) * t;
      point.y = ay + (point.y - ay) * t;
      point.z = az + (point.z - az) * t;
      ripples.pulse(contactX, contactY, (1 - t) * dt);
      return true;
    };
    const update = (dt, time) => {
      ripples.update(dt, time);
      activeGlyphs = 0;
      for (let wave = 0; wave < CAPACITY; wave++) {
        const at = wave * 4, strength = ripples.waves[at + 3], age = ripples.waves[at + 2];
        const radius = START_RADIUS + age * SPEED, fade = Math.min(1, strength * 2.5);
        for (let n = 0; n < PER_WAVE; n++) {
          const glyph = glyphs[wave * PER_WAVE + n];
          if (!strength) { glyph.visible = false; continue; }
          const angle = n * Math.PI * 2 / PER_WAVE;
          const x = ripples.waves[at] + Math.cos(angle) * radius, y = ripples.waves[at + 1] + Math.sin(angle) * radius;
          // Clip complete runes inside the stone frame; no spill around its edge.
          glyph.visible = x - 0.055 >= minX && x + 0.055 <= maxX && y - 0.08 >= minY && y + 0.08 <= maxY;
          if (!glyph.visible) continue;
          const rune = (n * 73 + Math.floor(time * 20)) & 7;
          glyph.geometry = glyphGeometry(rune + (n % 5 === 0 ? 8 : 0));
          glyph.position.x = x; glyph.position.y = y;
          glyph.scale.x = glyph.scale.y = Math.min(1, 0.45 + age / LIFETIME);
          glyph.smokeOpacity = fade;
          activeGlyphs++;
        }
      }
    };
    const inside = (x, y, z) => {
      const dx = x - mouth.x, dz = z - mouth.z, across = dx * cr - dz * sr, along = dx * sr + dz * cr;
      const room = mouth.room, half = along < -room.from ? room.w / 2 : 2.5;
      return y >= mouth.floorY - 0.12 && y < mouth.floorY + room.h - 0.1
        && along <= plane && along >= -room.to && Math.abs(across) <= half;
    };
    return { node, ripples, clipTarget, absorb, update, inside,
      get activeGlyphs() { return activeGlyphs; },
      liveGeometry(set) { for (let i = 0; i < 16; i++) set.add(glyphGeometry(i)); },
      dispose() { ripples.dispose(); for (const glyph of glyphs) glyph.visible = false; removeChild(group, node); glyphs.length = 0; }
    };
  };
  BL.labPhase = { create };
})();
