// The mirror entrance shares ordinary object visibility: one continuous silhouette plus a small plane-bound
// hint of the code behind the reflection.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4, mulberry32, fnv1a } = BL.math;
  const UP = { x: 0, y: 1, z: 0 }, SIZE = 1024;
  // Matches the native cave and world surface streams, in world units; quality removes the same column ranks,
  // never rune size or fall speed.
  const PITCH = 0.12, GAP = 0.13, GLYPH_HZ = 20, SPEED_MIN = 0.56, SPEED_RANGE = 0.64;
  const TRAIN_MIN = 7, TRAIN_RANGE = 6, TRAIN_GAP_MIN = 2, TRAIN_GAP_RANGE = 5;
  const IVORY = [217, 201, 169], DOORWAY_INSET = 0.015, DOORWAY_OPACITY = 0.18;
  const create = ({ mirror, stand }) => {
    const owner = mirror.group, roots = [owner], entries = [], glyphs = [], doorwayNodes = [];
    const view = mat4.create(), lastView = new Float64Array(18), panelView = mat4.create();
    const polygon = new Float64Array(18), clipped = new Float64Array(21), screen = new Float64Array(14);
    const heightPolygon = new Float64Array(24), heightClipped = new Float64Array(24);
    const mask = document.createElement("canvas"), rim = document.createElement("canvas");
    const dark = document.createElement("canvas"), light = document.createElement("canvas");
    const maskCtx = mask.getContext("2d"), rimCtx = rim.getContext("2d"), darkCtx = dark.getContext("2d"), lightCtx = light.getContext("2d");
    const panel = mirror.node, panelBounds = BL.scene.boundsOf(panel.geometry);
    const left = panelBounds.min[0], bottom = panelBounds.min[1], right = panelBounds.max[0], top = panelBounds.max[1], planeZ = panelBounds.min[2];
    const firstColumn = Math.ceil((left + 0.0395) / PITCH), lastColumn = Math.floor((right - 0.0395) / PITCH);
    const streamCount = Math.max(0, lastColumn - firstColumn + 1), streams = new Float64Array(streamCount * 8);
    const flowMin = bottom + 0.0605, flowMax = top - 0.0605;
    const doorwayCapacity = streamCount * Math.ceil((Math.ceil((flowMax - flowMin) / GAP) + 1) / 8);
    let live = true, inside = false, time = 0, version = 0, renderedVersion = -1, contrastReady = false;
    let width = 0, height = 0, focal = 1, near = 0.1, scale = 1, panelVisible = false, densityRankLimit = 8;
    const state = { inside: false, time: 0, draws: 0, builds: 0, faces: 0, standFaces: 0, glyphs: 0, glyphCells: 0,
      streams: streamCount, activeStreams: 0, densityRankLimit: 8, width: 0, height: 0,
      doorway: false, doorwayGlyphs: 0, doorwayUpdates: 0, doorwayCapacity: doorwayCapacity * 8, doorwayBytes: doorwayCapacity * 8 * 80 };
    lastView.fill(NaN);
    const register = (node, interior = false) => {
      if (node.sightHidden) return;
      interior = interior || node === stand;
      const g = node.geometry;
      if (g && !node.instanceData && !g.matrixGlyph && g.faces && g.faces.length) {
        const world = new Float64Array(16); world.fill(NaN);
        entries.push({ node, geometry: g, interior, world, points: new Float64Array(g.verts.length),
          heights: g.clipMinY !== undefined || g.clipMaxY !== undefined ? new Float64Array(g.verts.length / 3) : null,
          clipMinY: g.clipMinY, clipMaxY: g.clipMaxY, shown: false });
      }
      for (const child of node.children) register(child, interior);
    };
    register(owner);
    // Reuses the actual cave rune pixels flattened onto the reflective plane; this finite atlas and its streams
    // are laid out once, never per frame.
    for (let variant = 0; variant < 8; variant++) {
      const g = BL.hubModels.matrixGlyph(variant), cells = [], v = g.verts;
      const front = BL.scene.boundsOf(g).max[2];
      for (const face of g.faces) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, flat = true;
        for (const index of face.i) {
          const at = index * 3;
          if (Math.abs(v[at + 2] - front) > 1e-6) { flat = false; break; }
          minX = Math.min(minX, v[at]); minY = Math.min(minY, v[at + 1]);
          maxX = Math.max(maxX, v[at]); maxY = Math.max(maxY, v[at + 1]);
        }
        if (flat && minX < maxX && minY < maxY) cells.push(minX, minY, maxX, maxY);
      }
      glyphs.push(new Float64Array(cells));
      // The cave-side doorway hint uses the overlay's pixels but native depth-tested faces so walls and Oogas cover
      // it; flat pixels avoid the unseen sides of hundreds of tiny voxels.
      const geometry = { verts: [], faces: [], lines: [], matrixGlyph: true, matrixGlyphOpacity: DOORWAY_OPACITY, castShadow: false };
      for (let n = 0; n < cells.length; n += 4) {
        const at = geometry.verts.length / 3, x0 = cells[n], y0 = cells[n + 1], x1 = cells[n + 2], y1 = cells[n + 3];
        geometry.verts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
        geometry.faces.push({ i: [at, at + 1, at + 2, at + 3], color: IVORY, emissive: 1 });
      }
      const node = BL.scene.createNode({ geometry, visible: false, sightHidden: true, instanceData: new Float32Array(doorwayCapacity * 20), instanceCount: 0, drawInstanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
      BL.scene.addChild(owner, node); doorwayNodes.push(node);
    }
    for (let n = 0; n < streamCount; n++) {
      const at = n * 8, column = firstColumn + n, seed = fnv1a(`mirror-outline:${column}`), random = mulberry32(seed);
      const train = TRAIN_MIN + Math.floor(random() * TRAIN_RANGE), gap = TRAIN_GAP_MIN + Math.floor(random() * TRAIN_GAP_RANGE);
      streams[at] = column * PITCH;
      streams[at + 2] = SPEED_MIN + random() * SPEED_RANGE;
      streams[at + 1] = random() * (train + gap) * GAP;
      streams[at + 3] = train; streams[at + 4] = gap; streams[at + 5] = 0.58 + random() * 0.36;
      streams[at + 6] = seed; streams[at + 7] = (column % 8 + 8) % 8;
    }
    const shown = (entry) => {
      // Outside, the reflective face closes the entrance silhouette; inside, leave that plane open so it cannot
      // swallow the button's own contour.
      if ((!inside && entry.interior) || (inside && entry.node === panel) || !entry.node.parent) return false;
      for (let node = entry.node; node; node = node.parent) if (!node.visible || node.sightHidden) return false;
      return true;
    };
    const projectPolygon = (count, target) => {
      let corners = 0;
      for (let n = 0; n < count; n++) {
        const a = n * 3, b = (n + 1) % count * 3, aIn = polygon[a + 2] <= -near, bIn = polygon[b + 2] <= -near;
        if (aIn) {
          clipped[corners * 3] = polygon[a]; clipped[corners * 3 + 1] = polygon[a + 1]; clipped[corners++ * 3 + 2] = polygon[a + 2];
        }
        if (aIn !== bIn) {
          const t = (-near - polygon[a + 2]) / (polygon[b + 2] - polygon[a + 2]);
          clipped[corners * 3] = polygon[a] + (polygon[b] - polygon[a]) * t;
          clipped[corners * 3 + 1] = polygon[a + 1] + (polygon[b + 1] - polygon[a + 1]) * t;
          clipped[corners++ * 3 + 2] = -near;
        }
      }
      if (corners < 3) return false;
      let outside = 15;
      for (let n = 0; n < corners; n++) {
        const x = width / 2 - clipped[n * 3] * focal / clipped[n * 3 + 2];
        const y = height / 2 + clipped[n * 3 + 1] * focal / clipped[n * 3 + 2];
        screen[n * 2] = x; screen[n * 2 + 1] = y;
        outside &= (x < -4 ? 1 : x > width + 4 ? 2 : 0) | (y < -4 ? 4 : y > height + 4 ? 8 : 0);
      }
      // Near the mirror most rune pixels lie beyond the viewport: keep the four-pixel rim/contrast margin and
      // reject only polygons wholly beyond one edge, so large crossing faces still form a continuous mask.
      if (outside) return 2;
      // All faces contribute the same winding to the union mask, including rear-facing parts, so overlapping
      // triangles cannot cancel each other.
      const reverse = (screen[2] - screen[0]) * (screen[5] - screen[1]) - (screen[3] - screen[1]) * (screen[4] - screen[0]) < 0;
      target.moveTo(screen[0], screen[1]);
      for (let n = 1; n < corners; n++) { const at = (reverse ? corners - n : n) * 2; target.lineTo(screen[at], screen[at + 1]); }
      target.closePath();
      return 1;
    };
    const clipHeight = (source, target, count, limit, upper) => {
      let corners = 0;
      for (let n = 0; n < count; n++) {
        const a = n * 4, b = (n + 1) % count * 4;
        const aIn = upper ? source[a + 3] <= limit : source[a + 3] >= limit, bIn = upper ? source[b + 3] <= limit : source[b + 3] >= limit;
        if (aIn) { for (let axis = 0; axis < 4; axis++) target[corners * 4 + axis] = source[a + axis]; corners++; }
        if (aIn !== bIn) {
          const t = (limit - source[a + 3]) / (source[b + 3] - source[a + 3]);
          for (let axis = 0; axis < 4; axis++) target[corners * 4 + axis] = source[a + axis] + (source[b + axis] - source[a + axis]) * t;
          corners++;
        }
      }
      return corners;
    };
    const drawMesh = (entry) => {
      const { geometry, points, heights, node } = entry, v = geometry.verts, world = node.world;
      for (let at = 0; at < v.length; at += 3) {
        const x = world[0] * v[at] + world[4] * v[at + 1] + world[8] * v[at + 2] + world[12];
        const y = world[1] * v[at] + world[5] * v[at + 1] + world[9] * v[at + 2] + world[13];
        const z = world[2] * v[at] + world[6] * v[at + 1] + world[10] * v[at + 2] + world[14];
        points[at] = view[0] * x + view[4] * y + view[8] * z + view[12];
        points[at + 1] = view[1] * x + view[5] * y + view[9] * z + view[13];
        points[at + 2] = view[2] * x + view[6] * y + view[10] * z + view[14];
        if (heights) heights[at / 3] = y;
      }
      let batch = 0;
      maskCtx.beginPath();
      for (const face of geometry.faces) for (let fan = 1; fan + 1 < face.i.length; fan++) {
        for (let n = 0; n < 3; n++) {
          const at = face.i[n ? fan + n - 1 : 0] * 3;
          polygon[n * 3] = points[at]; polygon[n * 3 + 1] = points[at + 1]; polygon[n * 3 + 2] = points[at + 2];
          if (heights) {
            heightPolygon[n * 4] = points[at]; heightPolygon[n * 4 + 1] = points[at + 1]; heightPolygon[n * 4 + 2] = points[at + 2]; heightPolygon[n * 4 + 3] = heights[at / 3];
          }
        }
        let count = 3;
        if (heights) {
          // Keep overhead gate sections out of the entrance silhouette using the same world-space lintel/floor planes
          // as both renderers.
          count = clipHeight(heightPolygon, heightClipped, count, geometry.clipMinY ?? -Infinity, false);
          count = clipHeight(heightClipped, heightPolygon, count, geometry.clipMaxY ?? Infinity, true);
          for (let n = 0; n < count; n++) for (let axis = 0; axis < 3; axis++) polygon[n * 3 + axis] = heightPolygon[n * 4 + axis];
        }
        const projected = count >= 3 ? projectPolygon(count, maskCtx) : 0;
        if (!projected) continue;
        if (projected === 1) { state.faces++; if (entry.interior) state.standFaces++; }
        // Preserve the original stroke batches when offscreen triangles are omitted; changing which visible edges
        // share a fill alters coverage.
        if (++batch === 16) { maskCtx.fill(); maskCtx.stroke(); maskCtx.beginPath(); batch = 0; }
      }
      if (batch) { maskCtx.fill(); maskCtx.stroke(); }
    };
    const buildContrast = () => {
      if (dark.width !== width || dark.height !== height) { dark.width = light.width = width; dark.height = light.height = height; }
      darkCtx.clearRect(0, 0, width, height); lightCtx.clearRect(0, 0, width, height);
      const spread = Math.max(0.75, scale);
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) darkCtx.drawImage(rim, x * spread, y * spread);
      darkCtx.globalCompositeOperation = "source-in"; darkCtx.fillStyle = "#11160f"; darkCtx.fillRect(0, 0, width, height);
      darkCtx.globalCompositeOperation = "source-over";
      lightCtx.drawImage(rim, 0, 0); lightCtx.globalCompositeOperation = "source-in";
      lightCtx.fillStyle = "#f1e5ca"; lightCtx.fillRect(0, 0, width, height); lightCtx.globalCompositeOperation = "source-over";
      contrastReady = true;
    };
    const panelCell = (x0, y0, x1, y1, target) => {
      const m = panelView;
      for (let n = 0; n < 4; n++) {
        const x = n === 0 || n === 3 ? x0 : x1, y = n < 2 ? y0 : y1;
        polygon[n * 3] = m[0] * x + m[4] * y + m[8] * planeZ + m[12];
        polygon[n * 3 + 1] = m[1] * x + m[5] * y + m[9] * planeZ + m[13];
        polygon[n * 3 + 2] = m[2] * x + m[6] * y + m[10] * planeZ + m[14];
      }
      return projectPolygon(4, target) === 1;
    };
    const drawRain = (ctx, alpha, screenWidth, screenHeight) => {
      mat4.multiply(panelView, view, panel.world);
      ctx.save(); ctx.scale(screenWidth / width, screenHeight / height);
      ctx.beginPath();
      const geometry = panel.geometry, verts = geometry.verts, m = panelView;
      let visible = false;
      for (const face of geometry.faces) for (let fan = 1; fan + 1 < face.i.length; fan++) {
        for (let n = 0; n < 3; n++) {
          const at = face.i[n ? fan + n - 1 : 0] * 3, x = verts[at], y = verts[at + 1], z = verts[at + 2];
          polygon[n * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
          polygon[n * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          polygon[n * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        if (projectPolygon(3, ctx) === 1) visible = true;
      }
      if (!visible) { ctx.restore(); return; }
      ctx.clip(); ctx.fillStyle = "#d9c9a9";
      for (let n = 0; n < streamCount; n++) {
        const at = n * 8;
        if (streams[at + 7] >= densityRankLimit) continue;
        state.activeStreams++;
        const x = streams[at], travel = time * streams[at + 2] + streams[at + 1], train = streams[at + 3], sequence = train + streams[at + 4];
        const first = Math.ceil((flowMin + travel) / GAP), last = Math.floor((flowMax + travel) / GAP), seed = streams[at + 6];
        const mutation = Math.floor(time * GLYPH_HZ + (seed & 15) / 16);
        // Repeated trains share each tail position's opacity and one path; native pixel quads stay exactly projected
        // even at grazing angles.
        for (let tail = 0; tail < train; tail++) {
          const start = first + ((tail - first) % sequence + sequence) % sequence;
          if (start > last) continue;
          ctx.beginPath();
          for (let cell = start; cell <= last; cell += sequence) {
            const y = cell * GAP - travel, cells = glyphs[(cell + mutation + (seed & 7)) & 7];
            let drawn = false;
            for (let pixel = 0; pixel < cells.length; pixel += 4) {
              const x0 = Math.max(left, x + cells[pixel]), y0 = Math.max(bottom, y + cells[pixel + 1]);
              const x1 = Math.min(right, x + cells[pixel + 2]), y1 = Math.min(top, y + cells[pixel + 3]);
              if (x0 < x1 && y0 < y1 && panelCell(x0, y0, x1, y1, ctx)) { state.glyphCells++; drawn = true; }
            }
            if (drawn) state.glyphs++;
          }
          ctx.globalAlpha = 0.18 * alpha * streams[at + 5] * (0.48 + (1 - tail / train) * 0.52); ctx.fill();
        }
      }
      ctx.restore();
    };
    const draw = (camera, ctx, alpha, screenWidth, screenHeight, contrast = 0) => {
      state.glyphs = state.glyphCells = state.activeStreams = 0;
      if (!live || alpha <= 0) return;
      scale = Math.min(1, SIZE / Math.max(screenWidth, screenHeight));
      const w = Math.max(1, Math.ceil(screenWidth * scale)), h = Math.max(1, Math.ceil(screenHeight * scale));
      mat4.lookAt(view, camera.position, camera.target, camera.up || UP);
      let changed = version !== renderedVersion || w !== width || h !== height || lastView[16] !== camera.fov || lastView[17] !== camera.near;
      for (let at = 0; at < 16; at++) if (lastView[at] !== view[at]) changed = true;
      panelVisible = false;
      for (const entry of entries) {
        if (entry.geometry !== entry.node.geometry) {
          const geometry = entry.node.geometry;
          entry.geometry = geometry;
          if (entry.points.length < geometry.verts.length) entry.points = new Float64Array(geometry.verts.length);
          if (geometry.clipMinY !== undefined || geometry.clipMaxY !== undefined) {
            if (!entry.heights || entry.heights.length < geometry.verts.length / 3) entry.heights = new Float64Array(geometry.verts.length / 3);
          } else entry.heights = null;
          changed = true;
        }
        const visible = shown(entry);
        if (entry.shown !== visible) { entry.shown = visible; changed = true; }
        if (entry.clipMinY !== entry.geometry.clipMinY || entry.clipMaxY !== entry.geometry.clipMaxY) {
          entry.clipMinY = entry.geometry.clipMinY; entry.clipMaxY = entry.geometry.clipMaxY; changed = true;
        }
        if (visible) {
          if (entry.node === panel) panelVisible = true;
          for (let at = 0; at < 16; at++) if (entry.world[at] !== entry.node.world[at]) { entry.world[at] = entry.node.world[at]; changed = true; }
        }
      }
      if (changed) {
        if (w !== width || h !== height) { width = mask.width = rim.width = w; height = mask.height = rim.height = h; }
        lastView.set(view); lastView[16] = camera.fov; lastView[17] = camera.near; renderedVersion = version;
        state.width = width; state.height = height; state.faces = state.standFaces = 0;
        focal = height / 2 / Math.tan(camera.fov / 2); near = camera.near;
        maskCtx.clearRect(0, 0, width, height); maskCtx.fillStyle = maskCtx.strokeStyle = "#d9c9a9";
        maskCtx.lineWidth = 0.6; maskCtx.lineJoin = "round";
        for (const entry of entries) if (entry.shown) drawMesh(entry);
        rimCtx.clearRect(0, 0, width, height); rimCtx.globalCompositeOperation = "source-over";
        const spread = Math.max(1, 1.5 * scale);
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) rimCtx.drawImage(mask, x * spread, y * spread);
        rimCtx.globalCompositeOperation = "destination-out"; rimCtx.drawImage(mask, 0, 0);
        rimCtx.globalCompositeOperation = "source-over"; contrastReady = false; state.builds++;
      }
      contrast = Math.max(0, Math.min(1, contrast));
      if (contrast > 0 && !contrastReady) buildContrast();
      ctx.save(); ctx.globalCompositeOperation = "source-over";
      if (contrast > 0) { ctx.globalAlpha = 0.68 * contrast * alpha; ctx.drawImage(dark, 0, 0, width, height, 0, 0, screenWidth, screenHeight); }
      ctx.globalAlpha = 0.18 * alpha; ctx.drawImage(rim, 0, 0, width, height, 0, 0, screenWidth, screenHeight);
      if (contrast > 0) { ctx.globalAlpha = 0.5 * contrast * alpha; ctx.drawImage(light, 0, 0, width, height, 0, 0, screenWidth, screenHeight); }
      if (!inside && panelVisible) drawRain(ctx, alpha, screenWidth, screenHeight);
      ctx.restore(); state.draws++;
    };
    const update = (nextInside, elapsed, density = 1) => {
      if (!live) return;
      if (inside !== !!nextInside) { inside = !!nextInside; version++; }
      time = Math.max(0, elapsed); state.inside = inside; state.time = time;
      densityRankLimit = Math.max(0, Math.min(8, Math.round(density * 8))); state.densityRankLimit = densityRankLimit;
    };
    const updateDoorway = (camera, enabled, elapsed, density = 1) => {
      if (!live) return;
      const w = panel.world, eye = camera.position;
      // The selected Ooga owns whether this hint is needed; the real camera side owns which face can show it. The
      // exterior reflection is untouched.
      const shown = !!enabled && panel.visible && !(panel.mirrorDamage && panel.mirrorDamage.broken)
        && (eye.x - w[12]) * w[8] + (eye.y - w[13]) * w[9] + (eye.z - w[14]) * w[10] < -1e-5;
      state.doorway = shown; state.doorwayGlyphs = 0;
      for (let glyph = 0; glyph < doorwayNodes.length; glyph++) {
        const node = doorwayNodes[glyph]; node.visible = shown; node.instanceCount = node.drawInstanceCount = 0;
      }
      if (!shown) return;
      const rankLimit = Math.max(0, Math.min(8, Math.round(density * 8))), z = planeZ - DOORWAY_INSET;
      for (let n = 0; n < streamCount; n++) {
        const at = n * 8;
        if (streams[at + 7] >= rankLimit) continue;
        const x = streams[at], travel = elapsed * streams[at + 2] + streams[at + 1], train = streams[at + 3], sequence = train + streams[at + 4], seed = streams[at + 6];
        const first = Math.ceil((flowMin + travel) / GAP), last = Math.floor((flowMax + travel) / GAP), mutation = Math.floor(elapsed * GLYPH_HZ + (seed & 15) / 16);
        for (let cell = first; cell <= last; cell++) {
          const tail = (cell % sequence + sequence) % sequence;
          if (tail >= train) continue;
          const y = cell * GAP - travel;
          if (panel.mirrorDamage && !panel.mirrorDamage.contains(x, y)) continue;
          const node = doorwayNodes[(cell + mutation + (seed & 7)) & 7], slot = node.instanceCount++, data = node.instanceData, offset = slot * 20;
          if (slot >= doorwayCapacity) throw new Error("Mirror doorway glyph capacity exceeded");
          // Turn the rune to face into the cave without mirroring its letters.
          data[offset] = -w[0]; data[offset + 1] = -w[1]; data[offset + 2] = -w[2]; data[offset + 3] = 0;
          data[offset + 4] = w[4]; data[offset + 5] = w[5]; data[offset + 6] = w[6]; data[offset + 7] = 0;
          data[offset + 8] = -w[8]; data[offset + 9] = -w[9]; data[offset + 10] = -w[10]; data[offset + 11] = 0;
          data[offset + 12] = w[0] * x + w[4] * y + w[8] * z + w[12];
          data[offset + 13] = w[1] * x + w[5] * y + w[9] * z + w[13];
          data[offset + 14] = w[2] * x + w[6] * y + w[10] * z + w[14]; data[offset + 15] = 1;
          data[offset + 16] = streams[at + 5] * (0.48 + (1 - tail / train) * 0.52);
          data[offset + 17] = data[offset + 18] = 0; data[offset + 19] = 1;
          state.doorwayGlyphs++;
        }
      }
      for (let glyph = 0; glyph < doorwayNodes.length; glyph++) {
        const node = doorwayNodes[glyph]; node.drawInstanceCount = node.instanceCount; node.instanceVersion++;
      }
      state.doorwayUpdates++;
    };
    const dispose = () => {
      for (const node of doorwayNodes) BL.scene.removeChild(owner, node);
      doorwayNodes.length = 0; state.doorway = false; state.doorwayGlyphs = 0;
      live = false; roots.length = entries.length = glyphs.length = 0;
      mask.width = mask.height = rim.width = rim.height = dark.width = dark.height = light.width = light.height = 1;
      state.width = state.height = state.glyphs = state.glyphCells = state.activeStreams = state.faces = state.standFaces = 0;
    };
    // The provider contributes no extra geometry to these queries; the registry still evaluates every real node
    // for proximity and occlusion.
    return { owner, roots, active: () => live, distance: () => Infinity, perceived: () => false, cameraVisibility: () => 0, inView: () => false,
      clear: () => true, boxClear: () => true, draw, update, updateDoorway, doorwayNodes, dispose, state, get version() { return version; } };
  };
  BL.mirrorGuides = { create };
})();
