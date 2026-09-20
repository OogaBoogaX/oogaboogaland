(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4 } = BL.math;
  const SIZE = 1024, DEPTH_SIZE = 256, UP = { x: 0, y: 1, z: 0 };
  const create = ({ pile, altar, platform = false, cameraClear = null, cameraBoundsState = null, occlusionVersion = null }) => {
    const partialOcclusion = !platform && !!cameraClear;
    const owner = platform ? altar.node : pile.core, roots = platform ? [owner] : [owner, pile.shell], ordinary = [platform ? altar.slab : pile.core];
    // Keep decorative fruit under the mound owner but register only its continuous shell.
    // The platform has independent visibility and fading.
    if (!platform) for (const slot of pile.slots) roots.push(slot.node);
    const includes = (node) => node === ordinary[0];
    const geometryCache = new Map(), ordinaryWorld = new Float64Array(ordinary.length * 16), ordinaryVisible = new Uint8Array(ordinary.length);
    ordinaryWorld.fill(NaN);
    const view = mat4.create(), lastView = new Float64Array(19), bounds = new Float64Array(6);
    const triangle = new Float64Array(9), clipped = new Float64Array(12), screen = new Float64Array(8);
    lastView.fill(NaN);
    const mask = document.createElement("canvas"), rim = document.createElement("canvas"), maskCtx = mask.getContext("2d"), rimCtx = rim.getContext("2d");
    const hidden = partialOcclusion ? document.createElement("canvas") : null, layer = partialOcclusion ? document.createElement("canvas") : null;
    const hiddenCtx = hidden && hidden.getContext("2d"), layerCtx = layer && layer.getContext("2d");
    const depth = new Float32Array(partialOcclusion ? DEPTH_SIZE * DEPTH_SIZE : 0), expanded = new Float32Array(depth.length);
    let depthMinX = 0, depthMinY = 0, depthMaxX = -1, depthMaxY = -1;
    let depthWidth = 0, depthHeight = 0, depthScaleX = 1, depthScaleY = 1, depthReady = false, cameraX = 0, cameraY = 0, cameraZ = 0;
    let covered = 2, clippedUpdate = -1, clippedRevision = -1, layerUpdate = -1, layerContrast = -1;
    let dark = null, light = null, darkCtx = null, lightCtx = null, contrastReady = false;
    let version = 0, renderedVersion = -1, live = true, width = 0, height = 0, focal = 1, near = 0.1;
    const state = { instances: 0, considered: 0, contained: 0, outside: 0, faces: 0, updates: 0, queryInstances: 0, visibilitySamples: 0, visibilityCertificates: 0, occlusionRays: 0, occlusionTiles: 0, occlusionUpdates: 0, buffers: ordinaryWorld.byteLength + ordinaryVisible.byteLength + view.byteLength + lastView.byteLength + bounds.byteLength + triangle.byteLength + clipped.byteLength + screen.byteLength + depth.byteLength + expanded.byteLength, fillOpacity: 0.12, rimOpacity: 0.34 };
    const geometryOf = (geometry) => {
      let g = geometryCache.get(geometry);
      if (g) return g;
      const indices = [];
      for (const face of geometry.faces) for (let i = 1; i < face.i.length - 1; i++) indices.push(face.i[0], face.i[i], face.i[i + 1]);
      g = { source: geometry, bounds: BL.scene.boundsOf(geometry), indices: new Uint32Array(indices), transformed: new Float64Array(geometry.verts.length) };
      state.buffers += g.indices.byteLength + g.transformed.byteLength;
      geometryCache.set(geometry, g); return g;
    };
    for (const node of ordinary) geometryOf(node.geometry);
    const visible = (node) => {
      if (!node.parent) return false;
      for (let n = node; n; n = n.parent) if (!n.visible) return false;
      return true;
    };
    const sync = () => {
      if (!live) return false;
      let changed = false;
      for (let n = 0; n < ordinary.length; n++) {
        const node = ordinary[n], shown = +visible(node);
        if (ordinaryVisible[n] !== shown) { ordinaryVisible[n] = shown; changed = true; }
        if (shown) for (let a = 0; a < 16; a++) if (ordinaryWorld[n * 16 + a] !== node.world[a]) { ordinaryWorld[n * 16 + a] = node.world[a]; changed = true; }
      }
      if (!changed) return visible(owner);
      bounds[0] = bounds[1] = bounds[2] = Infinity; bounds[3] = bounds[4] = bounds[5] = -Infinity;
      for (let n = 0; n < ordinary.length; n++) if (ordinaryVisible[n]) {
        const node = ordinary[n], b = geometryOf(node.geometry).bounds, m = node.world;
        const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
        const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2, hz = (b.max[2] - b.min[2]) / 2;
        for (let a = 0; a < 3; a++) {
          const c = m[a] * cx + m[a + 4] * cy + m[a + 8] * cz + m[a + 12];
          const h = Math.abs(m[a]) * hx + Math.abs(m[a + 4]) * hy + Math.abs(m[a + 8]) * hz;
          bounds[a] = Math.min(bounds[a], c - h); bounds[a + 3] = Math.max(bounds[a + 3], c + h);
        }
      }
      version++;
      return visible(owner);
    };
    const distance = (x, y, z) => live ? Math.hypot(Math.max(0, bounds[0] - x, x - bounds[3]), Math.max(0, bounds[1] - y, y - bounds[4]), Math.max(0, bounds[2] - z, z - bounds[5])) : Infinity;
    // Provider hooks supplement ordinary registered meshes.
    // There are no additional instanced surfaces: only the registered shell counts.
    const perceived = () => false, cameraVisibility = () => 0, boxClear = () => true, inView = () => false;
    const rasterEdge = (ax, ay, ad, bx, by, bd) => {
      const dx = bx - ax, dy = by - ay;
      let lo = 0, hi = 1;
      if (dx) { const a = -ax / dx, b = (depthWidth - ax) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      else if (ax < 0 || ax >= depthWidth) return;
      if (dy) { const a = -ay / dy, b = (depthHeight - ay) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      else if (ay < 0 || ay >= depthHeight) return;
      if (hi < lo) return;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * (hi - lo) * 2));
      for (let step = 0; step <= steps; step++) {
        const t = lo + (hi - lo) * step / steps, x = Math.floor(ax + dx * t), y = Math.floor(ay + dy * t);
        if (x < 0 || y < 0 || x >= depthWidth || y >= depthHeight) continue;
        const at = y * depthWidth + x, d = ad + (bd - ad) * t;
        if (d > depth[at]) {
          depth[at] = d;
          if (x < depthMinX) depthMinX = x;
          if (x > depthMaxX) depthMaxX = x;
          if (y < depthMinY) depthMinY = y;
          if (y > depthMaxY) depthMaxY = y;
        }
      }
    };
    const rasterDepth = (count) => {
      for (let fan = 1; fan + 1 < count; fan++) {
        const a = fan * 2, b = a + 2, ax = screen[0] * depthScaleX, ay = screen[1] * depthScaleY;
        const bx = screen[a] * depthScaleX, by = screen[a + 1] * depthScaleY, cx = screen[b] * depthScaleX, cy = screen[b + 1] * depthScaleY;
        const ad = -1 / clipped[2], bd = -1 / clipped[fan * 3 + 2], cd = -1 / clipped[(fan + 1) * 3 + 2];
        // Subpixel tips still contribute to the higher-resolution silhouette.
        rasterEdge(ax, ay, ad, bx, by, bd); rasterEdge(bx, by, bd, cx, cy, cd); rasterEdge(cx, cy, cd, ax, ay, ad);
        const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(area) < 1e-9) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(depthWidth - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(depthHeight - 1, Math.ceil(Math.max(ay, by, cy)));
        if (x0 <= x1 && y0 <= y1) {
          if (x0 < depthMinX) depthMinX = x0;
          if (x1 > depthMaxX) depthMaxX = x1;
          if (y0 < depthMinY) depthMinY = y0;
          if (y1 > depthMaxY) depthMaxY = y1;
        }
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const wa = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / area;
          const wb = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / area, wc = 1 - wa - wb;
          if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
          const at = y * depthWidth + x, d = wa * ad + wb * bd + wc * cd;
          if (d > depth[at]) depth[at] = d;
        }
      }
    };
    const mesh = (g, m, depthOnly = false, withDepth = depthOnly) => {
      const v = g.source.verts, transformed = g.transformed, indices = g.indices;
      for (let a = 0; a < v.length; a += 3) {
        const x = m[0] * v[a] + m[4] * v[a + 1] + m[8] * v[a + 2] + m[12], y = m[1] * v[a] + m[5] * v[a + 1] + m[9] * v[a + 2] + m[13], z = m[2] * v[a] + m[6] * v[a + 1] + m[10] * v[a + 2] + m[14];
        transformed[a] = view[0] * x + view[4] * y + view[8] * z + view[12]; transformed[a + 1] = view[1] * x + view[5] * y + view[9] * z + view[13]; transformed[a + 2] = view[2] * x + view[6] * y + view[10] * z + view[14];
      }
      if (!depthOnly) maskCtx.beginPath();
      for (let i = 0; i < indices.length; i += 3) {
        for (let a = 0; a < 3; a++) { const j = indices[i + a] * 3; triangle[a * 3] = transformed[j]; triangle[a * 3 + 1] = transformed[j + 1]; triangle[a * 3 + 2] = transformed[j + 2]; }
        let count = 0;
        for (let a = 0; a < 3; a++) {
          const p = a * 3, q = (a + 1) % 3 * 3, inside = triangle[p + 2] <= -near, next = triangle[q + 2] <= -near;
          if (inside) { clipped[count * 3] = triangle[p]; clipped[count * 3 + 1] = triangle[p + 1]; clipped[count++ * 3 + 2] = triangle[p + 2]; }
          if (inside !== next) { const k = (-near - triangle[p + 2]) / (triangle[q + 2] - triangle[p + 2]); clipped[count * 3] = triangle[p] + (triangle[q] - triangle[p]) * k; clipped[count * 3 + 1] = triangle[p + 1] + (triangle[q + 1] - triangle[p + 1]) * k; clipped[count++ * 3 + 2] = -near; }
        }
        if (count < 3) continue;
        for (let a = 0; a < count; a++) {
          screen[a * 2] = width / 2 - clipped[a * 3] * focal / clipped[a * 3 + 2]; screen[a * 2 + 1] = height / 2 + clipped[a * 3 + 1] * focal / clipped[a * 3 + 2];
        }
        if (withDepth) rasterDepth(count);
        if (depthOnly) continue;
        const reverse = (screen[2] - screen[0]) * (screen[5] - screen[1]) - (screen[3] - screen[1]) * (screen[4] - screen[0]) < 0;
        maskCtx.moveTo(screen[0], screen[1]);
        for (let a = 1; a < count; a++) { const j = (reverse ? count - a : a) * 2; maskCtx.lineTo(screen[j], screen[j + 1]); }
        // Return to the first vertex explicitly; closing tiny subpaths makes Canvas revisit the growing path.
        // fill already closes each polygon, and this also seals the seam stroke.
        maskCtx.lineTo(screen[0], screen[1]); state.faces++;
      }
      if (!depthOnly) { maskCtx.fill(); maskCtx.stroke(); }
    };
    // Resolve mixed visibility only on the shell's nearest surface; whole patches use exact volume certificates.
    // Only uncertain boundary pixels need rays; decorative bananas never join this bounded pass.
    const classifyTile = (x0, y0, x1, y1) => {
      let minInverse = Infinity, maxInverse = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = expanded[y * depthWidth + x];
        if (d > 0) { minInverse = Math.min(minInverse, d); maxInverse = Math.max(maxInverse, d); }
      }
      const minDepth = 1 / maxInverse, maxDepth = 1 / minInverse;
      if (!maxDepth) return;
      state.occlusionTiles++;
      let classification = 0;
      if (cameraBoundsState && (x1 - x0 >= 4 || y1 - y0 >= 4)) {
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let corner = 0; corner < 8; corner++) {
          const z = corner & 4 ? maxDepth : minDepth, x = ((corner & 1 ? x1 : x0) / depthScaleX - width / 2) * z / focal;
          const y = (height / 2 - (corner & 2 ? y1 : y0) / depthScaleY) * z / focal;
          const wx = cameraX + view[0] * x + view[1] * y - view[2] * z, wy = cameraY + view[4] * x + view[5] * y - view[6] * z, wz = cameraZ + view[8] * x + view[9] * y - view[10] * z;
          minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz);
          maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz);
        }
        // Certify empty ray bounds as well as solid prop coverage; only mixed boundaries need pixels.
        // Exhaustive rock-plane searches remain a whole-shell operation.
        classification = cameraBoundsState(minX, minY, minZ, maxX, maxY, maxZ, true);
      }
      if (classification === 2) { hiddenCtx.fillRect(x0, y0, x1 - x0, y1 - y0); return; }
      if (classification === 1) return;
      if (x1 - x0 > 1 || y1 - y0 > 1) {
        const mx = x0 + Math.ceil((x1 - x0) / 2), my = y0 + Math.ceil((y1 - y0) / 2);
        classifyTile(x0, y0, mx, my);
        if (mx < x1) classifyTile(mx, y0, x1, my);
        if (my < y1) classifyTile(x0, my, mx, y1);
        if (mx < x1 && my < y1) classifyTile(mx, my, x1, y1);
        return;
      }
      const z = minDepth, x = ((x0 + 0.5) / depthScaleX - width / 2) * z / focal, y = (height / 2 - (y0 + 0.5) / depthScaleY) * z / focal;
      const dx = view[0] * x + view[1] * y - view[2] * z, dy = view[4] * x + view[5] * y - view[6] * z, dz = view[8] * x + view[9] * y - view[10] * z;
      const start = near / z, end = Math.max(0, 1 - 0.018 / Math.hypot(dx, dy, dz));
      if (start >= end) return;
      state.occlusionRays++;
      if (!cameraClear(cameraX + dx * start, cameraY + dy * start, cameraZ + dz * start, cameraX + dx * end, cameraY + dy * end, cameraZ + dz * end)) hiddenCtx.fillRect(x0, y0, 1, 1);
    };
    const updateHidden = (camera, withMask = false) => {
      const revision = occlusionVersion ? occlusionVersion() : 0;
      if (clippedUpdate === state.updates && clippedRevision === revision) return;
      clippedUpdate = state.updates; clippedRevision = revision;
      state.occlusionUpdates++; state.occlusionRays = state.occlusionTiles = 0;
      covered = cameraBoundsState ? cameraBoundsState(bounds[0], bounds[1], bounds[2], bounds[3], bounds[4], bounds[5]) : 0;
      if (covered) return;
      if (!depthReady) {
        const scale = Math.min(1, DEPTH_SIZE / Math.max(width, height));
        depthWidth = Math.max(1, Math.ceil(width * scale)); depthHeight = Math.max(1, Math.ceil(height * scale));
        depthScaleX = depthWidth / width; depthScaleY = depthHeight / height; depth.fill(0); expanded.fill(0);
        depthMinX = depthWidth; depthMinY = depthHeight; depthMaxX = depthMaxY = -1;
        // A changed view needs both outputs from these identical projected triangles. Emit the silhouette here
        // instead of walking them twice.
        for (let i = 0; i < ordinary.length; i++) if (ordinaryVisible[i]) mesh(geometryOf(ordinary[i].geometry), ordinary[i].world, !withMask, true);
        // Carry nearest surface depth into the existing outer rim.
        // This does not grow the silhouette or draw a new rim along an occluder edge.
        const pad = Math.max(2, Math.ceil(5 * Math.max(depthScaleX, depthScaleY)));
        // Outside the rasterised bounds every neighbourhood is empty and stays 0.
        for (let y = Math.max(0, depthMinY - pad); y <= Math.min(depthHeight - 1, depthMaxY + pad); y++) for (let x = Math.max(0, depthMinX - pad); x <= Math.min(depthWidth - 1, depthMaxX + pad); x++) {
          const at = y * depthWidth + x;
          let d = depth[at];
          if (!d) for (let j = Math.max(0, y - pad); j <= Math.min(depthHeight - 1, y + pad); j++) for (let i = Math.max(0, x - pad); i <= Math.min(depthWidth - 1, x + pad); i++) d = Math.max(d, depth[j * depthWidth + i]);
          expanded[at] = d;
        }
        depthReady = true;
      }
      if (hidden.width !== depthWidth || hidden.height !== depthHeight) { hidden.width = depthWidth; hidden.height = depthHeight; }
      hiddenCtx.clearRect(0, 0, depthWidth, depthHeight); hiddenCtx.fillStyle = "#ffffff";
      cameraX = camera.position.x; cameraY = camera.position.y; cameraZ = camera.position.z;
      classifyTile(0, 0, depthWidth, depthHeight);
      return withMask;
    };
    const buildContrast = (scale) => {
      if (!dark) {
        dark = document.createElement("canvas"); light = document.createElement("canvas");
        darkCtx = dark.getContext("2d"); lightCtx = light.getContext("2d");
      }
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
    const paint = (ctx, alpha, screenWidth, screenHeight, contrast) => {
      ctx.save();
      ctx.globalAlpha = state.fillOpacity * alpha; ctx.drawImage(mask, 0, 0, width, height, 0, 0, screenWidth, screenHeight);
      if (contrast > 0) { ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 0.68 * contrast * alpha; ctx.drawImage(dark, 0, 0, width, height, 0, 0, screenWidth, screenHeight); }
      ctx.globalAlpha = state.rimOpacity * alpha; ctx.drawImage(rim, 0, 0, width, height, 0, 0, screenWidth, screenHeight);
      if (contrast > 0) { ctx.globalAlpha = 0.5 * contrast * alpha; ctx.drawImage(light, 0, 0, width, height, 0, 0, screenWidth, screenHeight); }
      ctx.restore();
    };
    const draw = (camera, ctx, alpha, screenWidth, screenHeight, contrast = 0, guides = null) => {
      if (!live || alpha <= 0) return;
      const scale = Math.min(1, SIZE / Math.max(screenWidth, screenHeight)), w = Math.max(1, Math.ceil(screenWidth * scale)), h = Math.max(1, Math.ceil(screenHeight * scale));
      const clipHidden = partialOcclusion && !guides?.rockOnly;
      mat4.lookAt(view, camera.position, camera.target, camera.up || UP);
      let changed = version !== renderedVersion || w !== width || h !== height || lastView[16] !== camera.fov || lastView[17] !== camera.near || lastView[18] !== camera.far;
      for (let i = 0; i < 16; i++) if (lastView[i] !== view[i]) changed = true;
      if (changed) {
        depthReady = false;
        if (w !== width || h !== height) { width = mask.width = rim.width = w; height = mask.height = rim.height = h; }
        lastView.set(view); lastView[16] = camera.fov; lastView[17] = camera.near; lastView[18] = camera.far; renderedVersion = version;
        focal = height / 2 / Math.tan(camera.fov / 2); near = camera.near;
        maskCtx.clearRect(0, 0, width, height); maskCtx.fillStyle = maskCtx.strokeStyle = "#ffffff"; maskCtx.lineWidth = 0.6; maskCtx.lineJoin = "round";
        state.faces = 0; state.updates++;
        if (!clipHidden || !updateHidden(camera, true)) {
          for (let i = 0; i < ordinary.length; i++) if (ordinaryVisible[i]) mesh(geometryOf(ordinary[i].geometry), ordinary[i].world);
        }
        rimCtx.clearRect(0, 0, width, height); rimCtx.globalCompositeOperation = "source-over";
        const spread = Math.max(1.5, 2.25 * scale);
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) rimCtx.drawImage(mask, x * spread, y * spread);
        rimCtx.globalCompositeOperation = "destination-out"; rimCtx.drawImage(mask, 0, 0); contrastReady = false;
      }
      contrast = Math.max(0, Math.min(1, contrast));
      // A near-plane material cap already clips its own covered pixels.
      // Normal hidden-character views instead clip the shell by actual depth.
      if (clipHidden) {
        if (!changed) updateHidden(camera);
        if (covered === 1) return;
      }
      if (contrast > 0 && !contrastReady) buildContrast(scale);
      if (!clipHidden || covered === 2) { paint(ctx, alpha, screenWidth, screenHeight, contrast); return; }
      if (layerUpdate !== state.occlusionUpdates || layerContrast !== contrast) {
        if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
        layerCtx.clearRect(0, 0, width, height); paint(layerCtx, 1, width, height, contrast);
        layerCtx.globalCompositeOperation = "destination-in"; layerCtx.drawImage(hidden, 0, 0, depthWidth, depthHeight, 0, 0, width, height); layerCtx.globalCompositeOperation = "source-over";
        layerUpdate = state.occlusionUpdates; layerContrast = contrast;
      }
      ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0, width, height, 0, 0, screenWidth, screenHeight); ctx.restore();
    };
    const dispose = () => {
      live = false; roots.length = ordinary.length = 0; geometryCache.clear();
      mask.width = mask.height = rim.width = rim.height = 1;
      if (hidden) hidden.width = hidden.height = layer.width = layer.height = 1;
      if (dark) { dark.width = dark.height = light.width = light.height = 1; dark = light = darkCtx = lightCtx = null; }
      contrastReady = false;
    };
    return { owner, roots, includes, active: sync, distance, perceived, cameraVisibility, boxClear, inView, partialOcclusion, draw, dispose, state, get version() { return version; } };
  };
  BL.pileGuides = { create };
})();
