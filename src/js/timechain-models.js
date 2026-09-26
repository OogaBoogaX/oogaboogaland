// Timechain Sphere: a hollow, walk-in data observatory connected to the southwest rim.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { cached, box, merge, makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const SITE = { bearing: BL.terrain.TIMECHAIN.bearing, radius: 13, depth: 12, span: 18, width: 2.6 };
  const DIR = { x: Math.sin(SITE.bearing), z: -Math.cos(SITE.bearing) };
  const UNIT = 0.5, WOOD = "#795335", GOLD = "#c39748";
  const BITCOIN = ["00011011000", "00011011000", "01111111100", "00110000110", "00110000110", "00111111100", "00110000110", "00110000011", "00110000011", "01111111110", "00011011000", "00011011000"];
  const SYMBOL_CELL = 0.075, SYMBOL_SLICES = 4, SYMBOL_RADIUS = 13.05, SHELL_CY = 3;
  const DOOR_BOTTOM = Math.asin(-SHELL_CY / SYMBOL_RADIUS), DOOR_TOP = Math.asin((4.8 - SHELL_CY) / SYMBOL_RADIUS);
  const DOOR_HALF_ANGLE = Math.PI / 16, TAU = Math.PI * 2;
  // The ribbon wave opens three wide pockets; center one B in each.
  const SYMBOL_BEARINGS = [Math.PI / 6, Math.PI / 6 + TAU / 3, Math.PI / 6 - TAU / 3];
  const ground = cached(() => {
    // Keep the square floor corners inside the curved shell at the slab's bottom.
    const v = makeVox(), r = 12.1 / UNIT;
    for (let x = -26; x < 26; x++) for (let z = -26; z < 26; z++) {
      if (Math.hypot(x + 0.5, z + 0.5) > r) continue;
      v.set(x, -1, z, Math.abs(x + 0.5) < 1.5 ? 2 : (x + z) % 4 === 0 ? 1 : 0);
    }
    return voxelGeometry(v, { unit: UNIT, palette: ["#263843", "#304650", "#a3874f"], origin: { x: 0, y: 0, z: 0 } });
  });
  // The original painted wall remains solid; a thin exterior turns above it.
  const shell = cached(() => {
    const fixed = { verts: [], faces: [], lines: [], lineWidth: 1 };
    const outer = { verts: [], faces: [], lines: [], lineWidth: 1 };
    const segments = 96, radius = 13, cy = SHELL_CY;
    const levels = Array.from({ length: 49 }, (_, i) => -Math.PI / 2 + i * Math.PI / 48);
    levels.push(Math.asin(-cy / radius), Math.asin((4.8 - cy) / radius)); levels.sort((a, b) => a - b);
    const colors = ["#d9700b", "#e8810d", "#f7931a", "#ef8910"].map(BL.math.hexToRgb);
    const step = TAU / segments;
    for (let row = 0; row < levels.length - 1; row++) for (let col = 0; col < segments; col++) {
      const lo = -Math.PI + col * 2 * Math.PI / segments, hi = lo + 2 * Math.PI / segments;
      const bottom = levels[row], top = levels[row + 1], latitude = (bottom + top) / 2, longitude = (lo + hi) / 2;
      const y = cy + radius * Math.sin(latitude);
      if (Math.abs(longitude) < DOOR_HALF_ANGLE && y > 0 && y < 4.8) continue;
      const ribbon = Math.abs(latitude - 0.5 - 0.12 * Math.sin(longitude * 3)) < 0.06 || Math.abs(latitude + 0.5 + 0.12 * Math.sin(longitude * 3)) < 0.06;
      for (let skin = 0; skin < 2; skin++) for (let layer = 0; layer < (!skin && (y <= 0 || y >= 4.8) ? 2 : 1); layer++) {
        const geo = layer ? outer : fixed, base = geo.verts.length / 3, r = radius - skin * 0.16 + layer * 0.02;
        for (const [a, b] of [[lo, bottom], [hi, bottom], [hi, top], [lo, top]]) geo.verts.push(r * Math.cos(b) * Math.sin(a), cy + r * Math.sin(b), r * Math.cos(b) * Math.cos(a));
        geo.faces.push({ i: skin ? [base + 3, base + 2, base + 1, base] : [base, base + 1, base + 2, base + 3], color: skin ? [19, 32, 45] : ribbon ? [255, 188, 83] : colors[(row + col % 3) % colors.length], emissive: skin ? 0.45 : ribbon ? 0.8 : 0.5 });
        if (!skin) for (let edge = 0; edge < 2; edge++) geo.lines.push({ i: [base + edge, base + edge + 1], color: [133, 65, 8], emissive: 0.25 });
      }
    }
    // Match each door-height panel's original paint and grid lines, including the panels hidden by the doorway.
    const bandRows = [], bandGroups = new Map(), doorRows = [];
    for (let row = 0; row < levels.length - 1; row++) {
      const bottom = levels[row], top = levels[row + 1], y = cy + radius * Math.sin((bottom + top) / 2);
      if (y > 0 && y < 4.8) doorRows.push({ row, bottom, top });
    }
    const sliceWidth = step / SYMBOL_SLICES, halfSlice = sliceWidth / 2;
    for (let col = 0; col < segments; col++) {
      const longitude = -Math.PI + (col + 0.5) * step;
      const paints = doorRows.map(({ row, bottom, top }) => {
        const latitude = (bottom + top) / 2;
        const ribbon = Math.abs(latitude - 0.5 - 0.12 * Math.sin(longitude * 3)) < 0.06 || Math.abs(latitude + 0.5 + 0.12 * Math.sin(longitude * 3)) < 0.06;
        return ribbon ? 4 : (row + col % 3) % colors.length;
      });
      for (let slice = 0; slice < SYMBOL_SLICES; slice++) {
        const edge = slice === SYMBOL_SLICES - 1, key = `${paints.join("")}:${edge ? 1 : 0}`;
        let group = bandGroups.get(key);
        if (!group) {
          const geometry = { verts: [], faces: [], lines: [], lineWidth: 1 };
          for (let i = 0; i < doorRows.length; i++) {
            const { bottom, top } = doorRows[i], base = geometry.verts.length / 3, r = radius + 0.02;
            for (const [a, b] of [[-halfSlice, bottom], [halfSlice, bottom], [halfSlice, top], [-halfSlice, top]]) geometry.verts.push(r * Math.cos(b) * Math.sin(a), cy + r * Math.sin(b), r * Math.cos(b) * Math.cos(a));
            geometry.faces.push({ i: [base, base + 1, base + 2, base + 3], color: paints[i] === 4 ? [255, 188, 83] : colors[paints[i]], emissive: paints[i] === 4 ? 0.8 : 0.5 });
            geometry.lines.push({ i: [base, base + 1], color: [133, 65, 8], emissive: 0.25 });
            if (edge) geometry.lines.push({ i: [base + 1, base + 2], color: [133, 65, 8], emissive: 0.25 });
          }
          group = { geometry, angles: [], mask: true, halfWidth: halfSlice };
          bandGroups.set(key, group); bandRows.push(group);
        }
        group.angles.push(longitude + (slice - (SYMBOL_SLICES - 1) / 2) * sliceWidth);
      }
    }
    const symbolRows = [];
    for (let row = 0; row < BITCOIN.length; row++) {
      const top = (BITCOIN.length / 2 - row) * SYMBOL_CELL, bottom = top - SYMBOL_CELL;
      const cuts = [bottom];
      if (bottom < DOOR_BOTTOM && DOOR_BOTTOM < top) cuts.push(DOOR_BOTTOM);
      if (bottom < DOOR_TOP && DOOR_TOP < top) cuts.push(DOOR_TOP);
      cuts.push(top);
      for (let part = 0; part < cuts.length - 1; part++) {
        const low = cuts[part], high = cuts[part + 1], half = SYMBOL_CELL / (SYMBOL_SLICES * 2);
        const geometry = { verts: [], faces: [{ i: [0, 1, 2, 3], color: [255, 249, 230], emissive: 0.85 }], lines: [] };
        for (const [a, b] of [[-half, low], [half, low], [half, high], [-half, high]]) geometry.verts.push(SYMBOL_RADIUS * Math.cos(b) * Math.sin(a), cy + SYMBOL_RADIUS * Math.sin(b), SYMBOL_RADIUS * Math.cos(b) * Math.cos(a));
        symbolRows.push({ row, geometry, mask: low >= DOOR_BOTTOM && high <= DOOR_TOP });
      }
    }
    return { fixed, outer, bandRows, symbolRows };
  });
  const rotatingBatch = (geometry, angles, place, mask, halfWidth) => {
    const node = createNode({ geometry, sightHidden: true, instanceData: new Float32Array(angles.length * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    const baseCos = new Float32Array(angles.length), baseSin = new Float32Array(angles.length);
    for (let i = 0; i < angles.length; i++) {
      baseCos[i] = Math.cos(place.ry + angles[i]); baseSin[i] = Math.sin(place.ry + angles[i]);
    }
    return { node, angles: new Float32Array(angles), baseCos, baseSin, place, mask, halfWidth };
  };
  const turnBatch = (batch, spin, spinCos, spinSin) => {
    const { node, angles, baseCos, baseSin, place, mask, halfWidth } = batch, data = node.instanceData;
    let count = 0;
    for (let i = 0; i < angles.length; i++) {
      let local = angles[i] + spin;
      if (local > Math.PI) local -= TAU;
      if (local > Math.PI) local -= TAU;
      if (local < -Math.PI) local += TAU;
      if (mask && Math.abs(local) < DOOR_HALF_ANGLE + halfWidth) continue;
      const c = baseCos[i] * spinCos - baseSin[i] * spinSin, s = baseSin[i] * spinCos + baseCos[i] * spinSin, o = count++ * 20;
      data[o] = c; data[o + 1] = 0; data[o + 2] = -s; data[o + 3] = 0;
      data[o + 4] = 0; data[o + 5] = 1; data[o + 6] = 0; data[o + 7] = 0;
      data[o + 8] = s; data[o + 9] = 0; data[o + 10] = c; data[o + 11] = 0;
      data[o + 12] = place.x; data[o + 13] = place.y; data[o + 14] = place.z; data[o + 15] = 1;
      data[o + 16] = 1; data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
    }
    node.instanceCount = count;
    node.instanceVersion++;
  };
  const portal = cached(() => merge(
    box({ w: 5.6, h: 0.2, d: 0.6, color: "#ffbd53", emissive: 0.8, offset: { y: 4.85 } }),
    ...[-2.7, 2.7].map(x => box({ w: 0.18, h: 4.8, d: 0.6, color: "#ffbd53", emissive: 0.8, offset: { x, y: 2.4 } }))
  ));
  const bridge = cached(() => {
    const geos = [], count = Math.round(SITE.span / 0.45), length = SITE.span / count;
    // Touching planks keep continuous support; a shallow lip avoids coplanar grass at each shore.
    for (let i = 0; i < count; i++) geos.push(box({ w: SITE.width, h: 0.16, d: length, color: i % 3 ? WOOD : "#8b6340", offset: { y: -0.04, z: (i + 0.5) * length } }));
    for (const side of [-1, 1]) {
      const x = side * (SITE.width / 2 + 0.08);
      geos.push(box({ w: 0.12, h: 0.12, d: SITE.span, color: GOLD, offset: { x, y: 0.95, z: SITE.span / 2 } }));
      for (let i = 0; i <= 6; i++) geos.push(box({ w: 0.18, h: 1.1, d: 0.18, color: WOOD, offset: { x, y: 0.45, z: i * SITE.span / 6 } }));
    }
    return merge(...geos);
  });
  const chairBase = cached(() => merge(
    box({ w: 1.35, h: 0.12, d: 1.1, color: "#33434c", offset: { y: 0.12 } }),
    box({ w: 0.22, h: 0.55, d: 0.22, color: "#8a9ba6", offset: { y: 0.38 } })
  ));
  const chairSeat = cached(() => merge(
    box({ w: 1.24, h: 0.22, d: 0.95, color: "#253d48", offset: { y: 0.68 } }),
    box({ w: 1.04, h: 0.14, d: 0.85, color: "#477485", offset: { y: 0.81 } }),
    box({ w: 1.08, h: 0.15, d: 0.4, color: "#477485", offset: { y: 0.64, z: 0.52 } }),
    ...[-0.63, 0.63].map(x => box({ w: 0.18, h: 0.18, d: 1.05, color: "#334e5a", offset: { x, y: 1.08 } }))
  ));
  const chairBack = cached(() => merge(
    box({ w: 1.25, h: 1.25, d: 0.22, color: "#253d48", offset: { y: 0.58 } }),
    box({ w: 1.05, h: 0.9, d: 0.17, color: "#477485", offset: { y: 0.55, z: 0.15 } }),
    box({ w: 0.72, h: 0.27, d: 0.25, color: "#68a0ad", offset: { y: 1.07, z: 0.16 } })
  ));
  const laptopBase = cached(() => {
    const geos = [box({ w: 1.04, h: 0.065, d: 0.65, color: "#96a9b5" })];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 9; col++) geos.push(box({ w: 0.075, h: 0.015, d: 0.065, color: "#263843", offset: { x: (col - 4) * 0.1, y: 0.042, z: 0.06 + row * 0.08 } }));
    geos.push(box({ w: 0.3, h: 0.01, d: 0.16, color: "#617681", offset: { y: 0.04, z: -0.18 } }));
    return merge(...geos);
  });
  const laptopLid = cached(() => merge(
    box({ w: 1.04, h: 0.47, d: 0.055, color: "#96a9b5", offset: { y: 0.22 } }),
    box({ w: 0.94, h: 0.39, d: 0.015, color: "#112733", emissive: 0.45, offset: { y: 0.23, z: -0.036 } }),
    ...[0, 1, 2, 3].map(i => box({ w: 0.28 + (i % 3) * 0.13, h: 0.025, d: 0.01, color: i % 2 ? "#8ee2a2" : "#67d8ed", emissive: 0.85, offset: { x: -0.14, y: 0.34 - i * 0.075, z: -0.05 } }))
  ));
  const build = (island) => {
    let rim = 27.4;
    while (rim < 36 && island.surfaceAt(DIR.x * (rim + 0.1), DIR.z * (rim + 0.1)) > 0.5) rim += 0.1;
    // Overlap both shores, so the bridge meets solid ground rather than a voxel corner.
    const start = rim - 1, bridgeZ = SITE.radius - 2, radius = start + SITE.span + bridgeZ;
    const place = { x: DIR.x * radius, y: island.surfaceAt(DIR.x * start, DIR.z * start) + 0.02, z: DIR.z * radius, ry: -SITE.bearing, rim: start, bridgeZ, approachFrom: BL.terrain.TIMECHAIN.from };
    const node = createNode({ position: { x: place.x, y: place.y, z: place.z }, rotation: { x: 0, y: place.ry, z: 0 } });
    const groundNode = createNode({ geometry: ground() });
    const skins = shell();
    const shellNode = createNode({ geometry: skins.fixed });
    const outer = createNode({ geometry: skins.outer, sightHidden: true });
    const batches = [];
    for (const band of skins.bandRows) {
      const batch = rotatingBatch(band.geometry, band.angles, place, band.mask, band.halfWidth);
      batches.push(batch); addChild(outer, batch.node);
    }
    for (const part of skins.symbolRows) {
      const angles = [];
      for (const bearing of SYMBOL_BEARINGS) for (let col = 0; col < BITCOIN[part.row].length; col++) {
        if (BITCOIN[part.row][col] !== "1") continue;
        for (let slice = 0; slice < SYMBOL_SLICES; slice++) angles.push(bearing + (col - 5 + (slice - (SYMBOL_SLICES - 1) / 2) / SYMBOL_SLICES) * SYMBOL_CELL);
      }
      const batch = rotatingBatch(part.geometry, angles, place, part.mask, SYMBOL_CELL / (SYMBOL_SLICES * 2));
      batches.push(batch); addChild(outer, batch.node);
    }
    const turn = (angle) => {
      outer.rotation.y = angle;
      const c = Math.cos(angle), s = Math.sin(angle);
      for (let i = 0; i < batches.length; i++) turnBatch(batches[i], angle, c, s);
    };
    turn(0);
    const entrance = createNode({ geometry: portal(), position: { x: 0, y: 0, z: 12.65 } });
    addChild(entrance, createNode({ position: { x: 0, y: 5.6, z: 0 }, geometry: BL.hubModels.caveSign("TIMECHAIN SPHERE") }));
    const bridgeNode = createNode({ position: { x: 0, y: 0, z: bridgeZ }, geometry: bridge() });
    const chairNode = createNode({ position: { x: 0, y: 0, z: 1.8 }, geometry: chairBase() });
    const swivel = createNode({ geometry: chairSeat(), rotation: { x: 0, y: Math.PI, z: 0 } });
    const back = createNode({ geometry: chairBack(), position: { x: 0, y: 0.82, z: -0.44 }, rotation: { x: -0.23, y: 0, z: 0 } });
    const laptop = createNode({ geometry: laptopBase(), position: { x: 0, y: 1, z: 0.58 } });
    addChild(laptop, createNode({ geometry: laptopLid(), position: { x: 0, y: 0.035, z: 0.3 }, rotation: { x: 0.14, y: 0, z: 0 } }));
    addChild(swivel, back, laptop); addChild(chairNode, swivel);
    addChild(node, groundNode, shellNode, outer, entrance, bridgeNode, chairNode);
    return { node, shell: shellNode, outer, turn, entrance, ground: groundNode, bridge: bridgeNode, chair: chairNode, swivel, laptop, place };
  };
  BL.timechainModels = { SITE, DIR, build };
})();
