(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4, lerp } = BL.math;
  const { updateWorld, traverseVisible } = BL.scene;
  const DEFAULT_SKY = [0.5, 0.52, 0.58];
  const DEFAULT_GROUND = [0.22, 0.2, 0.19];
  const createRenderer = (canvas, { width: fixedW = 0, height: fixedH = 0, transparent = false } = {}) => {
    const ctx = canvas.getContext("2d");
    let width = 0, height = 0, dpr = 1, backdrop = null, skyGradient = null, lastF = 1;
    let clearRef = null, clearStyle = "", mirrorStyle = "#71808a";
    const size = { width: 0, height: 0 };
    const skyInts = new Int32Array(6);
    const mirrorInts = new Int32Array(3);
    const active = [];
    const DEFAULT_LIGHT = { x: 0.45, y: 0.85, z: 0.3 };
    const UP = { x: 0, y: 1, z: 0 };
    const AMBIENT = 0.5;
    const view = mat4.create();
    const pool = [];
    let poolUsed = 0;
    const acquire = () => {
      if (poolUsed === pool.length) {
        pool.push({ pts: new Float32Array(24), n: 0, depth: 0, style: "", coreStyle: "", line: false, lineGlow: 0, mirror: false, portal: false });
      }
      return pool[poolUsed++];
    };
    const V = Array.from({ length: 8 }, () => new Float32Array(3));
    const CLIP_IN = new Float32Array(30);
    const CLIP_OUT = new Float32Array(30);
    const BATCH_NODE = { geometry: null, world: new Float32Array(16), glow: 1, highlight: 0, tip: 0, depthBias: 0 };
    const mirrorDebug = {
      active: false, faux: true, portal: false, surfaceDrawn: false, captureValid: false, width: 0, height: 0, allocationCount: 0, reflectionPassCount: 0, skippedPassCount: 0, resources: 0, captureExcluded: true,
      cameraPosition: new Float32Array(3), cameraTarget: new Float32Array(3), planeCenter: new Float32Array(3), planeNormal: new Float32Array(3), skipReason: "canvas-faux"
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = fixedW || canvas.clientWidth;
      height = fixedH || canvas.clientHeight;
      size.width = width;
      size.height = height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      backdrop = ctx.createLinearGradient(0, 0, 0, height);
      backdrop.addColorStop(0, "#181818");
      backdrop.addColorStop(1, "#0a0a0a");
      skyGradient = null;
    };
    const buildSky = (horizon, zenith) => {
      let same = skyGradient !== null;
      for (let i = 0; i < 3; i++) {
        const h = Math.round(horizon[i] * 255), z = Math.round(zenith[i] * 255);
        if (skyInts[i] !== h || skyInts[i + 3] !== z) same = false;
        skyInts[i] = h;
        skyInts[i + 3] = z;
      }
      if (same) return;
      skyGradient = ctx.createLinearGradient(0, 0, 0, height);
      skyGradient.addColorStop(0, `rgb(${skyInts[3]},${skyInts[4]},${skyInts[5]})`);
      skyGradient.addColorStop(0.62, `rgb(${skyInts[0]},${skyInts[1]},${skyInts[2]})`);
      skyGradient.addColorStop(1, `rgb(${Math.round(skyInts[0] * 0.55)},${Math.round(skyInts[1] * 0.55)},${Math.round(skyInts[2] * 0.55)})`);
    };
    const clipNear = (src, count, near, dst) => {
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
    let eye = { x: 0, y: 0, z: 0 }, near = 0.2;
    const lightDir = new Float32Array([0, 1, 0]);
    const shadeNode = (node) => {
      const { verts, faces, lines } = node.geometry;
      const w = node.world;
      const f = lastF;
      const mirrorFace = !!(node.mirror || node.mirrorPortal);
      const portalFace = !!node.mirrorPortal || !!node.mirrorWalkThrough && mirrorDebug.portal;
      if (mirrorFace && portalFace) return;
      if (faces) {
        for (const face of faces) {
          const idx = face.i;
          const count = idx.length;
          for (let k = 0; k < count; k++) {
            const b = idx[k] * 3;
            mat4.transformPoint(V[k], w, verts[b], verts[b + 1], verts[b + 2]);
          }
          let nx = 0, ny = 0, nz = 0;
          for (let k = 0; k < count; k++) {
            const a = V[k], b = V[(k + 1) % count];
            nx += (a[1] - b[1]) * (a[2] + b[2]);
            ny += (a[2] - b[2]) * (a[0] + b[0]);
            nz += (a[0] - b[0]) * (a[1] + b[1]);
          }
          const nlen = Math.hypot(nx, ny, nz);
          if (nlen < 1e-9) continue;
          nx /= nlen;
          ny /= nlen;
          nz /= nlen;
          if (!portalFace && nx * (V[0][0] - eye.x) + ny * (V[0][1] - eye.y) + nz * (V[0][2] - eye.z) >= 0) continue;
          for (let k = 0; k < count; k++) {
            mat4.transformPoint(V[k], view, V[k][0], V[k][1], V[k][2]);
            CLIP_IN[k * 3] = V[k][0];
            CLIP_IN[k * 3 + 1] = V[k][1];
            CLIP_IN[k * 3 + 2] = V[k][2];
          }
          const clipped = clipNear(CLIP_IN, count, near, CLIP_OUT);
          if (clipped < 3) continue;
          const rec = acquire();
          let zsum = 0;
          for (let k = 0; k < clipped; k++) {
            const cz = CLIP_OUT[k * 3 + 2];
            rec.pts[k * 2] = width / 2 + CLIP_OUT[k * 3] * f / -cz;
            rec.pts[k * 2 + 1] = height / 2 - CLIP_OUT[k * 3 + 1] * f / -cz;
            zsum += cz;
          }
          rec.n = clipped;
          rec.depth = zsum / clipped - (node.depthBias || 0);
          rec.line = false;
          rec.mirror = mirrorFace;
          rec.portal = portalFace;
          const emissive = (face.emissive || 0) * node.glow;
          const diffuse = Math.max(0, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]);
          const hemi = AMBIENT * (0.6 + 0.4 * (ny * 0.5 + 0.5));
          let k = Math.min(1, hemi + diffuse * 0.7);
          k = lerp(k, 1.1, Math.min(1, emissive));
          k = lerp(k, 1.3, node.highlight * 0.4);
          const c = face.color;
          const tip = node.tip || 0;
          const red = lerp(c[0] * k, 214, tip * 0.88);
          const green = lerp(c[1] * k, 255, tip * 0.88);
          const blue = lerp(c[2] * k, 227, tip * 0.88);
          rec.style = rec.mirror ? mirrorStyle : `rgb(${Math.min(255, Math.round(red))},${Math.min(255, Math.round(green))},${Math.min(255, Math.round(blue))})`;
        }
      }
      if (lines) {
        for (const line of lines) {
          const a = line.i[0] * 3, b = line.i[1] * 3;
          mat4.transformPoint(V[0], w, verts[a], verts[a + 1], verts[a + 2]);
          mat4.transformPoint(V[1], w, verts[b], verts[b + 1], verts[b + 2]);
          mat4.transformPoint(V[0], view, V[0][0], V[0][1], V[0][2]);
          mat4.transformPoint(V[1], view, V[1][0], V[1][1], V[1][2]);
          CLIP_IN.set(V[0], 0);
          CLIP_IN.set(V[1], 3);
          const clipped = clipNear(CLIP_IN, 2, near, CLIP_OUT);
          if (clipped < 2) continue;
          const rec = acquire();
          for (let k = 0; k < 2; k++) {
            const cz = CLIP_OUT[k * 3 + 2];
            rec.pts[k * 2] = width / 2 + CLIP_OUT[k * 3] * f / -cz;
            rec.pts[k * 2 + 1] = height / 2 - CLIP_OUT[k * 3 + 1] * f / -cz;
          }
          rec.n = 2;
          rec.depth = (CLIP_OUT[2] + CLIP_OUT[5]) / 2 - (node.depthBias || 0);
          rec.line = true;
          rec.mirror = false;
          rec.portal = false;
          rec.lineGlow = (line.emissive || 0) * node.glow;
          const c = line.color;
          rec.style = `rgb(${c[0]},${c[1]},${c[2]})`;
          rec.coreStyle = rec.lineGlow > 0.5 ? `rgb(${Math.round(c[0] + (255 - c[0]) * 0.55)},${Math.round(c[1] + (255 - c[1]) * 0.55)},${Math.round(c[2] + (255 - c[2]) * 0.55)})` : "";
        }
      }
    };
    const shadeBatch = (node) => {
      const data = node.instanceData;
      BATCH_NODE.geometry = node.geometry;
      BATCH_NODE.depthBias = node.depthBias || 0;
      for (let instance = 0; instance < node.instanceCount; instance++) {
        const offset = instance * 20;
        for (let i = 0; i < 16; i++) BATCH_NODE.world[i] = data[offset + i];
        BATCH_NODE.glow = data[offset + 16];
        BATCH_NODE.highlight = data[offset + 17];
        BATCH_NODE.tip = data[offset + 18];
        shadeNode(BATCH_NODE);
      }
    };
    const render = (root, camera, opts = {}) => {
      const { light = DEFAULT_LIGHT, clear = null, sky = DEFAULT_SKY, ground = DEFAULT_GROUND, horizon = null, zenith = null } = opts;
      if (!fixedW && (canvas.clientWidth !== width || canvas.clientHeight !== height)) resize();
      const gradientSky = !!(horizon && zenith);
      if (gradientSky) buildSky(horizon, zenith);
      if (clear !== clearRef) {
        clearRef = clear;
        clearStyle = clear ? `rgb(${Math.round(clear[0] * 255)},${Math.round(clear[1] * 255)},${Math.round(clear[2] * 255)})` : "";
      }
      // The faux tint follows the sky, rebuilt only when a channel moves
      const mr = Math.round((sky[0] * 0.55 + ground[0] * 0.25 + 0.12) * 255), mg = Math.round((sky[1] * 0.55 + ground[1] * 0.25 + 0.14) * 255), mb = Math.round((sky[2] * 0.55 + ground[2] * 0.25 + 0.17) * 255);
      if (mr !== mirrorInts[0] || mg !== mirrorInts[1] || mb !== mirrorInts[2]) {
        mirrorInts[0] = mr;
        mirrorInts[1] = mg;
        mirrorInts[2] = mb;
        mirrorStyle = `rgb(${mr},${mg},${mb})`;
      }
      lastF = height / 2 / Math.tan(camera.fov / 2);
      near = camera.near;
      eye = camera.position;
      mat4.lookAt(view, camera.position, camera.target, UP);
      const llen = Math.hypot(light.x, light.y, light.z) || 1;
      lightDir[0] = light.x / llen;
      lightDir[1] = light.y / llen;
      lightDir[2] = light.z / llen;
      poolUsed = 0;
      mirrorDebug.active = false;
      mirrorDebug.portal = false;
      mirrorDebug.surfaceDrawn = false;
      updateWorld(root, null);
      traverseVisible(root, (node) => {
        if (node.mirror || node.mirrorPortal) {
          if (mirrorDebug.active) throw new Error("A scene may contain at most one mirror node");
          mirrorDebug.active = true;
          mirrorDebug.skippedPassCount++;
          const w = node.world, nlen = Math.hypot(w[8], w[9], w[10]) || 1;
          mirrorDebug.planeCenter[0] = w[12];
          mirrorDebug.planeCenter[1] = w[13];
          mirrorDebug.planeCenter[2] = w[14];
          mirrorDebug.planeNormal[0] = w[8] / nlen;
          mirrorDebug.planeNormal[1] = w[9] / nlen;
          mirrorDebug.planeNormal[2] = w[10] / nlen;
          const center = mirrorDebug.planeCenter, normal = mirrorDebug.planeNormal;
          const eyeD = (camera.position.x - center[0]) * normal[0] + (camera.position.y - center[1]) * normal[1] + (camera.position.z - center[2]) * normal[2];
          mirrorDebug.portal = !!node.mirrorPortal || !!node.mirrorWalkThrough && eyeD <= 0.001;
          mirrorDebug.cameraPosition[0] = camera.position.x - 2 * eyeD * normal[0];
          mirrorDebug.cameraPosition[1] = camera.position.y - 2 * eyeD * normal[1];
          mirrorDebug.cameraPosition[2] = camera.position.z - 2 * eyeD * normal[2];
          const targetD = (camera.target.x - center[0]) * normal[0] + (camera.target.y - center[1]) * normal[1] + (camera.target.z - center[2]) * normal[2];
          mirrorDebug.cameraTarget[0] = camera.target.x - 2 * targetD * normal[0];
          mirrorDebug.cameraTarget[1] = camera.target.y - 2 * targetD * normal[1];
          mirrorDebug.cameraTarget[2] = camera.target.z - 2 * targetD * normal[2];
        }
        if (node.instanceData) shadeBatch(node);
        else if (node.geometry) shadeNode(node);
      });
      active.length = poolUsed;
      for (let i = 0; i < poolUsed; i++) active[i] = pool[i];
      active.sort((a, b) => a.depth - b.depth);
      if (transparent) ctx.clearRect(0, 0, width, height);
      else {
        ctx.fillStyle = gradientSky ? skyGradient : clear ? clearStyle : backdrop;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.lineJoin = "round";
      for (const rec of active) {
        ctx.beginPath();
        ctx.moveTo(rec.pts[0], rec.pts[1]);
        if (rec.line) {
          ctx.lineTo(rec.pts[2], rec.pts[3]);
          if (rec.lineGlow > 0) {
            ctx.strokeStyle = rec.style;
            ctx.globalAlpha = 0.12 * rec.lineGlow;
            ctx.lineWidth = 11;
            ctx.stroke();
            ctx.globalAlpha = 0.28 * rec.lineGlow;
            ctx.lineWidth = 4.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = rec.coreStyle || rec.style;
          ctx.lineWidth = rec.lineGlow > 0 ? 1.8 : 1.4;
          ctx.stroke();
        } else {
          for (let k = 1; k < rec.n; k++) ctx.lineTo(rec.pts[k * 2], rec.pts[k * 2 + 1]);
          ctx.closePath();
          ctx.fillStyle = rec.style;
          ctx.fill();
          ctx.strokeStyle = rec.style;
          ctx.lineWidth = 1;
          ctx.stroke();
          if (rec.mirror) {
            mirrorDebug.surfaceDrawn = true;
            let minX = rec.pts[0], maxX = rec.pts[0], minY = rec.pts[1], maxY = rec.pts[1];
            for (let k = 1; k < rec.n; k++) {
              minX = Math.min(minX, rec.pts[k * 2]);
              maxX = Math.max(maxX, rec.pts[k * 2]);
              minY = Math.min(minY, rec.pts[k * 2 + 1]);
              maxY = Math.max(maxY, rec.pts[k * 2 + 1]);
            }
            ctx.save();
            ctx.clip();
            if (rec.portal) {
              const cell = Math.max(7, (maxY - minY) / 18);
              for (let y = minY; y < maxY; y += cell) {
                for (let x = minX; x < maxX; x += cell) {
                  const upper = y < minY + (maxY - minY) * 0.56;
                  const checker = (Math.floor((x - minX) / cell) + Math.floor((y - minY) / cell)) & 1;
                  ctx.fillStyle = upper ? (checker ? "#668e82" : "#759991") : (checker ? "#3f6448" : "#587453");
                  ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
                }
              }
            }
            ctx.strokeStyle = "rgba(235,245,250,.2)";
            ctx.lineWidth = Math.max(2, (maxY - minY) * 0.06);
            ctx.beginPath();
            ctx.moveTo(minX - (maxY - minY) * 0.2, maxY);
            ctx.lineTo(maxX, minY + (maxY - minY) * 0.18);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      return true;
    };
    const P = new Float32Array(3);
    const project = (x, y, z, out = {}) => {
      mat4.transformPoint(P, view, x, y, z);
      if (P[2] > -0.01) return null;
      out.x = width / 2 + P[0] * lastF / -P[2];
      out.y = height / 2 - P[1] * lastF / -P[2];
      out.depth = P[2];
      return out;
    };
    const ray = (px, py, camera, out) => mat4.rayFromView(out, view, width, height, camera.fov, camera.position, px, py);
    resize();
    return {
      kind: "canvas2d",
      render,
      resize,
      project,
      ray,
      setQuality: () => { },
      releaseGeometry: () => { },
      releaseUnused: () => 0,
      dispose: () => {
        mirrorDebug.active = false;
        mirrorDebug.portal = false;
        mirrorDebug.surfaceDrawn = false;
      },
      get quality() {
        return "low";
      },
      get stats() {
        return { records: 0, active: 0, mirrorResources: 0, culled: 0, drawn: 0 };
      },
      get mirror() {
        return mirrorDebug;
      },
      get ready() {
        return true;
      },
      get failure() {
        return null;
      },
      get size() {
        return size;
      }
    };
  };
  BL.canvasRenderer = { createRenderer };
})();
