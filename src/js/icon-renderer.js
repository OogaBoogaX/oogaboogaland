// The HUD's transparent, fixed-size portraits use the ordinary face/line path from the Canvas fallback.
// Keep projection, Float32 rounding, face lighting, stable depth ordering and paint widths identical.
(() => {
  "use strict";
  const BL = window.BL;
  const { mat4, lerp, sortByKey, sortScratch } = BL.math;
  const { updateWorld, traverseVisible, hiddenFromCamera, hiddenFromCutaway } = BL.scene;
  // Compact character bakes are read through one synchronous cursor each, never their legacy face views.
  const compactCursors = new WeakMap();
  const readFace = (geometry, index) => {
    if (!geometry.compactGeometry) return geometry.faces[index];
    let cursor = compactCursors.get(geometry);
    if (!cursor) { cursor = BL.compactGeometry.createCursor(geometry); compactCursors.set(geometry, cursor); }
    return BL.compactGeometry.readFace(geometry, index, cursor);
  };
  const createRenderer = (canvas, { width, height }) => {
    const ctx = canvas.getContext("2d"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = mat4.create(), V = Array.from({ length: 72 }, () => new Float32Array(3));
    const CLIP_IN = new Float32Array(216), CLIP_OUT = new Float32Array(216);
    const lightDir = new Float32Array(3), light = { x: 0.45, y: 0.85, z: 0.3 };
    const llen = Math.hypot(light.x, light.y, light.z);
    lightDir[0] = light.x / llen; lightDir[1] = light.y / llen; lightDir[2] = light.z / llen;
    const skyLuma = 0.5 * 0.2126 + 0.52 * 0.7152 + 0.58 * 0.0722;
    const groundLuma = 0.22 * 0.2126 + 0.2 * 0.7152 + 0.19 * 0.0722;
    const pool = [], styleCache = new Map();
    let poolUsed = 0, lastF = 1, near = 0.1, eye = null;
    let sortCapacity = 0, sortIds = new Uint32Array(0), sortKeys = new Float64Array(0), sortWork = sortScratch(0);
    const acquire = () => {
      if (poolUsed === pool.length) pool.push({ pts: new Float32Array(144), n: 0, depth: 0, style: "", coreStyle: "", line: false, lineGlow: 0, smokeOpacity: 1 });
      return pool[poolUsed++];
    };
    const styleFor = (r, g, b) => {
      const key = (r << 16) | (g << 8) | b;
      let s = styleCache.get(key);
      if (s === undefined) {
        s = `rgb(${r},${g},${b})`;
        if (styleCache.size >= 16384) styleCache.clear();
        styleCache.set(key, s);
      }
      return s;
    };
    const clipNear = (src, count, near, dst) => {
      // All inside: the clip is the identity copy, priced per vertex.
      let inside = true;
      for (let i = 0; i < count; i++) if (src[i * 3 + 2] > -near) { inside = false; break; }
      if (inside) {
        for (let i = 0; i < count * 3; i++) dst[i] = src[i];
        return count;
      }
      let out = 0;
      for (let i = 0; i < count; i++) {
        const ax = src[i * 3], ay = src[i * 3 + 1], az = src[i * 3 + 2];
        const j = (i + 1) % count;
        const bx = src[j * 3], by = src[j * 3 + 1], bz = src[j * 3 + 2];
        const aIn = az <= -near, bIn = bz <= -near;
        if (aIn) {
          dst[out * 3] = ax;
          dst[out * 3 + 1] = ay;
          dst[out * 3 + 2] = az;
          out++;
        }
        if (aIn !== bIn) {
          const t = (-near - az) / (bz - az);
          dst[out * 3] = ax + (bx - ax) * t;
          dst[out * 3 + 1] = ay + (by - ay) * t;
          dst[out * 3 + 2] = -near;
          out++;
        }
      }
      return out;
    };
    const shadeNode = (node) => {
      const opacity = (node.smokeOpacity === undefined ? 1 : node.smokeOpacity) * (node.geometry.glassOpacity || node.geometry.glass || 1);
      if (opacity === 0) return;
      const { verts, faces, lines } = node.geometry, w = node.world, f = lastF;
      const ember = Math.min(1, node.ember || 0), scorch = 1 - Math.min(1, node.scorch || 0) * 0.88;
      const materialGlow = ember > 0 ? 0 : node.glow;
      if (faces) for (let index = 0; index < faces.length; index++) {
        const face = readFace(node.geometry, index), idx = face.i, count = idx.length;
        let nx = 0, ny = 0, nz = 0;
        for (let k = 0; k < count; k++) {
          const b = idx[k] * 3;
          mat4.transformPoint(V[k], w, verts[b], verts[b + 1], verts[b + 2]);
        }
        for (let k = 0; k < count; k++) {
          const a = V[k], b = V[(k + 1) % count];
          nx += (a[1] - b[1]) * (a[2] + b[2]);
          ny += (a[2] - b[2]) * (a[0] + b[0]);
          nz += (a[0] - b[0]) * (a[1] + b[1]);
        }
        const nlen = Math.hypot(nx, ny, nz);
        if (nlen < 1e-9) continue;
        nx /= nlen; ny /= nlen; nz /= nlen;
        if (nx * (V[0][0] - eye.x) + ny * (V[0][1] - eye.y) + nz * (V[0][2] - eye.z) >= 0) {
          if (!node.geometry.twoSided) continue;
          nx = -nx; ny = -ny; nz = -nz;
        }
        for (let k = 0; k < count; k++) {
          mat4.transformPoint(V[k], view, V[k][0], V[k][1], V[k][2]);
          CLIP_IN.set(V[k], k * 3);
        }
        const clipped = clipNear(CLIP_IN, count, near, CLIP_OUT);
        if (clipped < 3) continue;
        const rec = acquire();
        let zsum = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let k = 0; k < clipped; k++) {
          const cz = CLIP_OUT[k * 3 + 2], scale = f / -cz;
          rec.pts[k * 2] = width / 2 + CLIP_OUT[k * 3] * scale;
          rec.pts[k * 2 + 1] = height / 2 - CLIP_OUT[k * 3 + 1] * scale;
          minX = Math.min(minX, rec.pts[k * 2]); maxX = Math.max(maxX, rec.pts[k * 2]);
          minY = Math.min(minY, rec.pts[k * 2 + 1]); maxY = Math.max(maxY, rec.pts[k * 2 + 1]);
          zsum += cz;
        }
        if (maxX < -2 || minX > width + 2 || maxY < -2 || minY > height + 2) { poolUsed--; continue; }
        rec.n = clipped; rec.depth = zsum / clipped - (node.depthBias || 0);
        rec.line = false; rec.smokeOpacity = opacity;
        const emissive = Math.max((face.emissive || 0) * materialGlow, ember * 0.9);
        const diffuse = Math.max(0, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]);
        const hemi = Math.max(0.3, lerp(groundLuma, skyLuma, ny * 0.5 + 0.5));
        let k = lerp(Math.min(1, hemi + diffuse * 0.7), 1.1, Math.min(1, emissive));
        k = lerp(k, 1.3, node.scorch > 0 ? 0 : node.highlight * 0.4);
        const c = face.color, detail = 0.72 + (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255 * scorch * 0.28;
        const heat = 255 * detail;
        const cr = lerp(c[0] * scorch, heat, ember * 0.9);
        const cg = lerp(c[1] * scorch, heat * (0.12 + ember * 0.85), ember * 0.9);
        const cb = lerp(c[2] * scorch, heat * (0.01 + ember * ember * ember * 0.74), ember * 0.9);
        const tip = node.tip > 1.5 ? 0 : node.tip || 0;
        rec.style = styleFor(Math.min(255, Math.round(lerp(cr * k, 214, tip * 0.88))), Math.min(255, Math.round(lerp(cg * k, 255, tip * 0.88))), Math.min(255, Math.round(lerp(cb * k, 227, tip * 0.88))));
      }
      if (lines) for (const line of lines) {
        const a = line.i[0] * 3, b = line.i[1] * 3;
        mat4.transformPoint(V[0], w, verts[a], verts[a + 1], verts[a + 2]);
        mat4.transformPoint(V[1], w, verts[b], verts[b + 1], verts[b + 2]);
        mat4.transformPoint(V[0], view, V[0][0], V[0][1], V[0][2]);
        mat4.transformPoint(V[1], view, V[1][0], V[1][1], V[1][2]);
        CLIP_IN.set(V[0], 0); CLIP_IN.set(V[1], 3);
        if (clipNear(CLIP_IN, 2, near, CLIP_OUT) < 2) continue;
        const rec = acquire();
        for (let k = 0; k < 2; k++) {
          const scale = f / -CLIP_OUT[k * 3 + 2];
          rec.pts[k * 2] = width / 2 + CLIP_OUT[k * 3] * scale;
          rec.pts[k * 2 + 1] = height / 2 - CLIP_OUT[k * 3 + 1] * scale;
        }
        if (Math.max(rec.pts[0], rec.pts[2]) < -7 || Math.min(rec.pts[0], rec.pts[2]) > width + 7 || Math.max(rec.pts[1], rec.pts[3]) < -7 || Math.min(rec.pts[1], rec.pts[3]) > height + 7) { poolUsed--; continue; }
        rec.n = 2; rec.depth = (CLIP_OUT[2] + CLIP_OUT[5]) / 2 - (node.depthBias || 0);
        rec.line = true; rec.smokeOpacity = opacity;
        rec.lineGlow = Math.max((line.emissive || 0) * materialGlow, ember * 0.9);
        const c = line.color, heat = 255 * (0.72 + (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255 * scorch * 0.28);
        const red = lerp(c[0] * scorch, heat, ember * 0.9);
        const green = lerp(c[1] * scorch, heat * (0.12 + ember * 0.85), ember * 0.9);
        const blue = lerp(c[2] * scorch, heat * (0.01 + ember * ember * ember * 0.74), ember * 0.9);
        rec.style = styleFor(Math.round(red), Math.round(green), Math.round(blue));
        rec.coreStyle = rec.lineGlow > 0.5 ? styleFor(Math.round(red + (255 - red) * 0.55), Math.round(green + (255 - green) * 0.55), Math.round(blue + (255 - blue) * 0.55)) : "";
      }
    };
    const gatherNode = node => {
      if (node.geometry && !hiddenFromCamera(node) && !hiddenFromCutaway(node)) shadeNode(node);
    };
    const render = (root, camera) => {
      lastF = height / 2 / Math.tan(camera.fov / 2); near = camera.near; eye = camera.position;
      mat4.lookAt(view, camera.position, camera.target, camera.up || { x: 0, y: 1, z: 0 });
      poolUsed = 0; updateWorld(root, null); traverseVisible(root, gatherNode);
      if (poolUsed > sortCapacity) {
        sortCapacity = Math.max(256, sortCapacity);
        while (sortCapacity < poolUsed) sortCapacity *= 2;
        sortIds = new Uint32Array(sortCapacity); sortKeys = new Float64Array(sortCapacity); sortWork = sortScratch(sortCapacity);
      }
      for (let i = 0; i < poolUsed; i++) { sortIds[i] = i; sortKeys[i] = pool[i].depth; }
      sortByKey(sortIds, 0, poolUsed, sortKeys, 1, 0, sortWork);
      ctx.clearRect(0, 0, width, height); ctx.lineJoin = "round";
      let lastFill = null, lastStroke = null, lastWidth = 0, lastAlpha = NaN;
      for (let i = 0; i < poolUsed; i++) {
        const rec = pool[sortIds[i]];
        ctx.beginPath();
        ctx.moveTo(rec.pts[0], rec.pts[1]);
        if (rec.line) {
          if (lastAlpha !== rec.smokeOpacity) { ctx.globalAlpha = rec.smokeOpacity; lastAlpha = rec.smokeOpacity; }
          ctx.lineTo(rec.pts[2], rec.pts[3]);
          if (rec.lineGlow > 0) {
            if (lastStroke !== rec.style) { ctx.strokeStyle = rec.style; lastStroke = rec.style; }
            const glowAlpha = 0.12 * rec.lineGlow * rec.smokeOpacity;
            if (lastAlpha !== glowAlpha) { ctx.globalAlpha = glowAlpha; lastAlpha = glowAlpha; }
            if (lastWidth !== 11) { ctx.lineWidth = 11; lastWidth = 11; }
            ctx.stroke();
            const midAlpha = 0.28 * rec.lineGlow * rec.smokeOpacity;
            if (lastAlpha !== midAlpha) { ctx.globalAlpha = midAlpha; lastAlpha = midAlpha; }
            if (lastWidth !== 4.5) { ctx.lineWidth = 4.5; lastWidth = 4.5; }
            ctx.stroke();
            if (lastAlpha !== rec.smokeOpacity) { ctx.globalAlpha = rec.smokeOpacity; lastAlpha = rec.smokeOpacity; }
          }
          const coreStyle = rec.coreStyle || rec.style;
          if (lastStroke !== coreStyle) { ctx.strokeStyle = coreStyle; lastStroke = coreStyle; }
          const coreWidth = rec.lineGlow > 0 ? 1.8 : 1.4;
          if (lastWidth !== coreWidth) { ctx.lineWidth = coreWidth; lastWidth = coreWidth; }
          ctx.stroke();
          if (lastAlpha !== 1) { ctx.globalAlpha = 1; lastAlpha = 1; }
        } else {
          for (let k = 1; k < rec.n; k++) ctx.lineTo(rec.pts[k * 2], rec.pts[k * 2 + 1]);
          ctx.closePath();
          {
            if (rec.smokeOpacity !== 1 && lastAlpha !== rec.smokeOpacity) { ctx.globalAlpha = rec.smokeOpacity; lastAlpha = rec.smokeOpacity; }
            if (lastFill !== rec.style) { ctx.fillStyle = rec.style; lastFill = rec.style; }
            ctx.fill();
            if (lastStroke !== rec.style) { ctx.strokeStyle = rec.style; lastStroke = rec.style; }
            if (lastWidth !== 1) { ctx.lineWidth = 1; lastWidth = 1; }
            ctx.stroke();
            if (rec.smokeOpacity !== 1 && lastAlpha !== 1) { ctx.globalAlpha = 1; lastAlpha = 1; }
          }
        }
      }
      return true;
    };
    return { render, dispose: () => {} };
  };
  BL.iconRenderer = { createRenderer };
})();
