// The mirror entrance shares ordinary object visibility as one continuous silhouette.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4 } = BL.math;
  const UP = { x: 0, y: 1, z: 0 }, SIZE = 1024;
  const create = ({ mirror }) => {
    const owner = mirror.group, roots = [owner], entries = [];
    const view = mat4.create(), lastView = new Float64Array(18);
    const polygon = new Float64Array(18), clipped = new Float64Array(21), screen = new Float64Array(14);
    const heightPolygon = new Float64Array(24), heightClipped = new Float64Array(24);
    const mask = document.createElement("canvas"), rim = document.createElement("canvas");
    const dark = document.createElement("canvas"), light = document.createElement("canvas");
    const maskCtx = mask.getContext("2d"), rimCtx = rim.getContext("2d"), darkCtx = dark.getContext("2d"), lightCtx = light.getContext("2d");
    const panel = mirror.node;
    let live = true, inside = false, version = 0, renderedVersion = -1, contrastReady = false;
    let width = 0, height = 0, focal = 1, near = 0.1, scale = 1;
    const state = { inside: false, draws: 0, builds: 0, faces: 0, standFaces: 0, width: 0, height: 0 };
    lastView.fill(NaN);
    const register = (node, interior = false) => {
      if (node.sightHidden) return;
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
    const draw = (camera, ctx, alpha, screenWidth, screenHeight, contrast = 0) => {
      if (!live || alpha <= 0) return;
      scale = Math.min(1, SIZE / Math.max(screenWidth, screenHeight));
      const w = Math.max(1, Math.ceil(screenWidth * scale)), h = Math.max(1, Math.ceil(screenHeight * scale));
      mat4.lookAt(view, camera.position, camera.target, camera.up || UP);
      let changed = version !== renderedVersion || w !== width || h !== height || lastView[16] !== camera.fov || lastView[17] !== camera.near;
      for (let at = 0; at < 16; at++) if (lastView[at] !== view[at]) changed = true;
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
      ctx.restore(); state.draws++;
    };
    const update = nextInside => {
      if (!live) return;
      if (inside !== !!nextInside) { inside = !!nextInside; version++; }
      state.inside = inside;
    };
    const dispose = () => {
      live = false; roots.length = entries.length = 0;
      mask.width = mask.height = rim.width = rim.height = dark.width = dark.height = light.width = light.height = 1;
      state.width = state.height = state.faces = state.standFaces = 0;
    };
    // The provider contributes no extra geometry to these queries; the registry still evaluates every real node
    // for proximity and occlusion.
    return { owner, roots, active: () => live, distance: () => Infinity, perceived: () => false, cameraVisibility: () => 0, inView: () => false,
      clear: () => true, boxClear: () => true, draw, update, dispose, state, get version() { return version; } };
  };
  BL.mirrorGuides = { create };
})();
