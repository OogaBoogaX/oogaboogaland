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
    const view = mat4.create();
    const pool = [];
    let poolUsed = 0, suppressed = 0;
    let matrixActive = 0, matrixRadius = 0, matrixTime = 0, matrixDensity = 0, matrixOriginX = 0, matrixOriginZ = 0, matrixSurfaces = 0, matrixLivingSurfaces = 0, matrixArea = 0, matrixSamples = 0, matrixSampleStep = 1, matrixCulled = 0;
    let matrixCaves = null, matrixCaveBounds = null, matrixCaveNear = Infinity, matrixPointX = 0, matrixPointY = 0;
    const MATRIX_MASKS = new Int32Array([630678, 497559, 988959, 495513, 1009263, 288049, 456438, 616809]);
    const MATRIX_TILE_SIZE = 128, MATRIX_SAMPLE_BUDGET = 524288;
    const matrixTile = document.createElement("canvas");
    matrixTile.width = matrixTile.height = transparent ? 1 : MATRIX_TILE_SIZE;
    // This scratch surface is overwritten from CPU pixels for every receiver.
    // Keep it CPU-backed: a GPU tile read by drawImage otherwise synchronizes its
    // previous upload on every putImageData, dwarfing the bounded sampling work.
    const matrixCtx = matrixTile.getContext("2d", { willReadFrequently: true });
    const matrixImage = matrixCtx.createImageData(matrixTile.width, matrixTile.height);
    const matrixPixels = matrixImage.data;
    const matrixSample = new Float64Array(4);
    const matrixClipA = new Float64Array(32), matrixClipB = new Float64Array(32);
    const matrixStreams = new Float64Array(transparent ? 0 : 4096 * 6);
    const matrixPlaneKeys = new Int32Array(transparent ? 0 : 8192 * 4), matrixPlaneFrames = new Uint32Array(transparent ? 0 : 8192), matrixPlaneDepths = new Float64Array(transparent ? 0 : 8192);
    let matrixFrame = 0;
    const matrixHash = (n) => {
      let value = n | 0;
      value ^= value >>> 16;
      value = Math.imul(value, 2146121005);
      value ^= value >>> 15;
      value = Math.imul(value, -2073254261);
      value ^= value >>> 16;
      return (value >>> 8) / 16777216;
    };
    for (let stream = -2048; stream < matrixStreams.length / 6 - 2048; stream++) {
      const offset = (stream + 2048) * 6;
      const train = 7 + Math.floor(matrixHash(stream) * 6), sequence = train + 2 + Math.floor(matrixHash(stream + 41) * 5);
      matrixStreams[offset] = Math.floor(matrixHash(stream + 7) * 8);
      matrixStreams[offset + 1] = 0.56 + matrixHash(stream + 19) * 0.64;
      matrixStreams[offset + 2] = train;
      matrixStreams[offset + 3] = sequence;
      matrixStreams[offset + 4] = matrixHash(stream + 73) * sequence * 0.13;
      matrixStreams[offset + 5] = 0.58 + matrixHash(stream + 101) * 0.36;
    }
    const acquire = () => {
      if (poolUsed === pool.length) {
        pool.push({ pts: new Float32Array(24), n: 0, depth: 0, style: "", coreStyle: "", line: false, lineGlow: 0, mirror: false, portal: false, matrix: 0, matrixGlyph: false, matrixWall: 0, matrixNx: 0, matrixNy: 0, matrixNz: 0, matrixPlane: 0, matrixCenterDepth: 0, matrixMinX: 0, matrixMaxX: 0, matrixMinY: 0, matrixMaxY: 0, matrixRed: 0, matrixGreen: 0, matrixBlue: 0, matrixCave: 0, matrixLocal: false, matrixLiving: false, matrixDynamic: false, matrixPartial: false, matrixBacking: false, matrixFaceNx: 0, matrixFaceNy: 0, matrixFaceNz: 0, matrixFacePlane: 0 });
      }
      return pool[poolUsed++];
    };
    const V = Array.from({ length: 8 }, () => new Float32Array(3));
    const CLIP_IN = new Float32Array(30);
    const CLIP_OUT = new Float32Array(30);
    const BATCH_NODE = { geometry: null, world: new Float32Array(16), glow: 1, highlight: 0, tip: 0, depthBias: 0, matrixLiving: false, matrixEmissiveLiving: false };
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
    let directStrength = 1, ambientFloor = 0.3, diffuseFloor = 0, skyLuma = 0.5, groundLuma = 0.2;
    // Distance fog toward a colour, off until a frame passes one
    const fogRgb = [0, 0, 0];
    let fogNear = 1e8, fogFar = 1e8 + 1;
    const matrixModeOf = (node) => {
      let partial = 0;
      while (node) {
        if (node.matrixLiving) return 2;
        if (node.matrixEmissiveLiving) partial = 3;
        node = node.parent;
      }
      return partial;
    };
    const smooth = (value) => {
      const t = Math.max(0, Math.min(1, value));
      return t * t * (3 - 2 * t);
    };
    const matrixTravel = (x, z, cave) => {
      if (cave && matrixCaves) {
        const offset = (cave - 1) * 4, nx = matrixCaves[offset], nz = matrixCaves[offset + 1];
        const depth = Math.max(0, matrixCaves[offset + 2] - x * nx - z * nz);
        return Math.hypot(x + nx * depth - matrixOriginX, z + nz * depth - matrixOriginZ) + depth;
      }
      return Math.hypot(x - matrixOriginX, z - matrixOriginZ);
    };
    const matrixFront = (travel) => matrixActive * (1 - smooth((travel - matrixRadius + 1.5) / 1.5));
    const matrixLivingCave = (x, y, z) => {
      if (!matrixCaves || !matrixCaveBounds || Math.hypot(x - matrixOriginX, z - matrixOriginZ) < matrixCaveNear) return 0;
      for (let cave = 0; cave < 7; cave++) {
        const offset = cave * 4, sr = matrixCaves[offset], cr = matrixCaves[offset + 1];
        const depth = matrixCaves[offset + 2] - sr * x - cr * z;
        if (depth < 0 || depth > matrixCaveBounds[offset + 3]) continue;
        const localX = cr * (x - matrixCaveBounds[offset]) - sr * (z - matrixCaveBounds[offset + 2]);
        const localY = y - matrixCaveBounds[offset + 1], room = depth > 3;
        if (Math.abs(localX) <= (room ? 3.35 : 2.7) && localY >= 0 && localY <= (room ? 4.15 : 3.15)) return cave + 1;
      }
      return 0;
    };
    const matrixPlaneSlot = (nx, ny, nz, plane, write, depth) => {
      const sign = Math.abs(nx) > 0.0001 ? Math.sign(nx) : Math.abs(ny) > 0.0001 ? Math.sign(ny) : Math.sign(nz);
      const x = Math.round(nx * sign * 1000), y = Math.round(ny * sign * 1000), z = Math.round(nz * sign * 1000), d = Math.round(plane * sign * 1000);
      let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(d, 1640531513)) & 8191;
      for (let probe = 0; probe < 8192; probe++, slot = (slot + 1) & 8191) {
        const offset = slot * 4;
        if (matrixPlaneFrames[slot] !== matrixFrame) {
          if (!write) return -1;
          matrixPlaneFrames[slot] = matrixFrame;
          matrixPlaneKeys[offset] = x; matrixPlaneKeys[offset + 1] = y; matrixPlaneKeys[offset + 2] = z; matrixPlaneKeys[offset + 3] = d;
          matrixPlaneDepths[slot] = depth;
          return slot;
        }
        if (matrixPlaneKeys[offset] === x && matrixPlaneKeys[offset + 1] === y && matrixPlaneKeys[offset + 2] === z && matrixPlaneKeys[offset + 3] === d) {
          if (write) matrixPlaneDepths[slot] = Math.max(matrixPlaneDepths[slot], depth);
          return slot;
        }
      }
      return -1;
    };
    const shadeNode = (node) => {
      const { verts, faces, lines } = node.geometry;
      const w = node.world;
      const f = lastF;
      const mirrorFace = !!(node.mirror || node.mirrorPortal);
      const portalFace = !!node.mirrorPortal || !!node.mirrorWalkThrough && mirrorDebug.portal;
      const localMatrixGlyph = !!node.geometry.matrixGlyph;
      const matrixMode = matrixModeOf(node) || node.tip;
      if (mirrorFace && portalFace) return;
      if (faces) {
        for (const face of faces) {
          const idx = face.i;
          const count = idx.length;
          let centerX = 0, centerY = 0, centerZ = 0;
          for (let k = 0; k < count; k++) {
            const b = idx[k] * 3;
            mat4.transformPoint(V[k], w, verts[b], verts[b + 1], verts[b + 2]);
            centerX += V[k][0];
            centerY += V[k][1];
            centerZ += V[k][2];
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
          centerX /= count;
          centerY /= count;
          centerZ /= count;
          const flow = Math.hypot(centerX - matrixOriginX, centerZ - matrixOriginZ);
          const matrixLiving = matrixMode > 1.5 && (matrixMode < 2.5 || face.emissive > 0);
          const staticCave = face.matrixCave || node.geometry.matrixCave || 0;
          const dynamicCave = !staticCave && matrixActive && matrixRadius >= matrixCaveNear && matrixLiving && matrixCaveBounds && flow >= matrixCaveNear;
          const cave = staticCave || (dynamicCave ? matrixLivingCave(centerX, centerY, centerZ) : 0);
          const localGlyphSurface = !!(node.geometry.matrixLocalGlyphSurface || face.matrixLocalGlyphSurface || staticCave);
          const revealBacking = !!node.geometry.matrixRevealBacking;
          const ownedGlyph = localMatrixGlyph && cave && matrixCaves;
          let minimumFront = localMatrixGlyph && !ownedGlyph ? 1 : 0, maximumFront = minimumFront;
          if (matrixActive && (!localMatrixGlyph || ownedGlyph)) {
            let radiusSquared = 0;
            for (let k = 0; k < count; k++) radiusSquared = Math.max(radiusSquared, (V[k][0] - centerX) ** 2 + (V[k][2] - centerZ) ** 2);
            const distance = matrixTravel(centerX, centerZ, cave), margin = Math.sqrt(radiusSquared) * (cave && matrixCaves ? Math.SQRT2 : 1);
            minimumFront = matrixFront(distance + margin);
            maximumFront = matrixFront(Math.max(0, distance - margin));
          }
          if ((localMatrixGlyph || revealBacking) && maximumFront <= 0) continue;
          const partial = maximumFront > 0 && minimumFront < 1;
          const matrixAmount = !localMatrixGlyph && !partial ? minimumFront : 0;
          for (let k = 0; k < count; k++) {
            mat4.transformPoint(V[k], view, V[k][0], V[k][1], V[k][2]);
            CLIP_IN[k * 3] = V[k][0];
            CLIP_IN[k * 3 + 1] = V[k][1];
            CLIP_IN[k * 3 + 2] = V[k][2];
          }
          // A just-closed doorway must cover the view even inside the camera's
          // normal near plane. Keep its real projection and depth sorting.
          const clipped = clipNear(CLIP_IN, count, mirrorFace ? 1e-7 : near, CLIP_OUT);
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
          rec.matrixGlyph = localMatrixGlyph;
          rec.matrixCave = cave;
          rec.matrixDynamic = dynamicCave;
          rec.matrixLocal = localGlyphSurface;
          rec.matrixPartial = partial;
          rec.matrixBacking = revealBacking;
          if (localMatrixGlyph) {
            const len = Math.hypot(w[8], w[9], w[10]);
            rec.matrixNx = w[8] / len; rec.matrixNy = w[9] / len; rec.matrixNz = w[10] / len;
            rec.matrixPlane = rec.matrixNx * w[12] + rec.matrixNy * w[13] + rec.matrixNz * w[14];
            rec.matrixCenterDepth = view[2] * w[12] + view[6] * w[13] + view[10] * w[14] + view[14];
            rec.matrixFaceNx = nx; rec.matrixFaceNy = ny; rec.matrixFaceNz = nz;
            rec.matrixFacePlane = nx * (centerX - eye.x) + ny * (centerY - eye.y) + nz * (centerZ - eye.z);
          } else if (maximumFront && localGlyphSurface) matrixPlaneSlot(nx, ny, nz, nx * centerX + ny * centerY + nz * centerZ, true, rec.depth);
          const emissive = (face.emissive || 0) * node.glow;
          rec.matrixLiving = matrixLiving;
          const diffuse = Math.max(diffuseFloor, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]);
          const hemi = Math.max(ambientFloor, lerp(groundLuma, skyLuma, ny * 0.5 + 0.5));
          let k = Math.min(1, hemi + diffuse * 0.7 * directStrength);
          if (localMatrixGlyph) {
            const facingLength = Math.hypot(w[8], w[9], w[10]);
            const side = 1 - smooth((Math.abs(nx * w[8] + ny * w[9] + nz * w[10]) / facingLength - 0.45) / 0.45);
            const vx = eye.x - centerX, vy = eye.y - centerY, vz = eye.z - centerZ, vlen = Math.hypot(vx, vy, vz);
            const sideShade = 0.7 + Math.max(0, nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2]) * 0.22 + Math.max(0, (nx * vx + ny * vy + nz * vz) / vlen) * 0.08;
            k = lerp(0.78, 1.15, Math.min(1, emissive)) * lerp(1, sideShade, side);
          } else k = lerp(k, 1.1, Math.min(1, emissive));
          k = lerp(k, 1.3, node.highlight * 0.4);
          const c = face.color;
          const tip = node.tip > 1.5 ? 0 : node.tip || 0;
          const fog = localMatrixGlyph ? smooth((Math.hypot(centerX - eye.x, centerY - eye.y, centerZ - eye.z) - fogNear) / (fogFar - fogNear)) : Math.min(1, Math.max(0, (-rec.depth - fogNear) / (fogFar - fogNear)));
          let red = lerp(lerp(c[0] * k, 214, tip * 0.88), fogRgb[0], fog);
          let green = lerp(lerp(c[1] * k, 255, tip * 0.88), fogRgb[1], fog);
          let blue = lerp(lerp(c[2] * k, 227, tip * 0.88), fogRgb[2], fog);
          if (maximumFront && !localMatrixGlyph) {
            const pulse = matrixLiving ? 0.88 + Math.sin(matrixTime * 2.2 - flow * 0.5) * 0.08 : 0;
            const matrixFog = smooth((Math.hypot(centerX - eye.x, centerY - eye.y, centerZ - eye.z) - fogNear) / (fogFar - fogNear));
            const mr = matrixLiving ? 214 * pulse : fogRgb[0] * matrixFog;
            const mg = matrixLiving ? 255 * pulse : fogRgb[1] * matrixFog;
            const mb = matrixLiving ? 227 * pulse : fogRgb[2] * matrixFog;
            rec.matrixRed = mr; rec.matrixGreen = mg; rec.matrixBlue = mb;
            red = lerp(red, mr, matrixAmount);
            green = lerp(green, mg, matrixAmount);
            blue = lerp(blue, mb, matrixAmount);
            if (matrixLiving) matrixLivingSurfaces++;
            else matrixSurfaces++;
          }
          if (!localMatrixGlyph) rec.style = rec.mirror ? mirrorStyle : `rgb(${Math.min(255, Math.round(red))},${Math.min(255, Math.round(green))},${Math.min(255, Math.round(blue))})`;
          rec.matrix = 0;
          if (localMatrixGlyph || maximumFront && (partial || !matrixLiving && !localGlyphSurface)) {
            let minX = width, minY = height, maxX = 0, maxY = 0;
            for (let k = 0; k < clipped; k++) {
              minX = Math.min(minX, rec.pts[k * 2]); maxX = Math.max(maxX, rec.pts[k * 2]);
              minY = Math.min(minY, rec.pts[k * 2 + 1]); maxY = Math.max(maxY, rec.pts[k * 2 + 1]);
            }
            rec.matrixMinX = Math.max(0, Math.floor(minX)); rec.matrixMaxX = Math.min(width, Math.ceil(maxX));
            rec.matrixMinY = Math.max(0, Math.floor(minY)); rec.matrixMaxY = Math.min(height, Math.ceil(maxY));
            if (rec.matrixMaxX > rec.matrixMinX && rec.matrixMaxY > rec.matrixMinY) {
              if (localMatrixGlyph) {
                rec.matrixRed = Math.max(0, red - fogRgb[0] * fog);
                rec.matrixGreen = Math.max(0, green - fogRgb[1] * fog);
                rec.matrixBlue = Math.max(0, blue - fogRgb[2] * fog);
                rec.style = `rgb(${Math.min(255, Math.round(rec.matrixRed))},${Math.min(255, Math.round(rec.matrixGreen))},${Math.min(255, Math.round(rec.matrixBlue))})`;
              } else {
                rec.matrix = maximumFront;
                rec.matrixWall = Math.abs(ny) >= Math.max(Math.abs(nx), Math.abs(nz)) ? 0 : Math.abs(nx) >= Math.abs(nz) ? 1 : 2;
                rec.matrixNx = nx; rec.matrixNy = ny; rec.matrixNz = nz;
                rec.matrixPlane = nx * (centerX - eye.x) + ny * (centerY - eye.y) + nz * (centerZ - eye.z);
              }
              matrixArea += (rec.matrixMaxX - rec.matrixMinX) * (rec.matrixMaxY - rec.matrixMinY);
            }
          }
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
      const glyphs = !!node.geometry.matrixGlyph;
      const tanX = width * 0.5 / lastF, tanY = height * 0.5 / lastF;
      const sideX = Math.sqrt(1 + tanX * tanX), sideY = Math.sqrt(1 + tanY * tanY);
      BATCH_NODE.geometry = node.geometry;
      BATCH_NODE.depthBias = node.depthBias || 0;
      BATCH_NODE.matrixLiving = !!node.matrixLiving;
      BATCH_NODE.matrixEmissiveLiving = !!node.matrixEmissiveLiving;
      const count = node.drawInstanceCount === undefined ? node.instanceCount : Math.max(0, Math.min(node.instanceCount, node.drawInstanceCount));
      suppressed += node.instanceCount - count;
      if (node.cullSphere) {
        const sphere = node.cullSphere, x = sphere[0], y = sphere[1], z = sphere[2], r = sphere[3];
        const cx = view[0] * x + view[4] * y + view[8] * z + view[12];
        const cy = view[1] * x + view[5] * y + view[9] * z + view[13];
        const depth = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
        if (depth + r < near || Math.abs(cx) > depth * tanX + r * sideX || Math.abs(cy) > depth * tanY + r * sideY) { matrixCulled += count; return; }
      }
      for (let instance = 0; instance < count; instance++) {
        const offset = instance * 20;
        const facing = data[offset + 19];
        if (facing && (data[offset + 8] * facing * (eye.x - data[offset + 12]) + data[offset + 9] * facing * (eye.y - data[offset + 13]) + data[offset + 10] * facing * (eye.z - data[offset + 14])) <= 0) continue;
        if (glyphs) {
          const x = data[offset + 12], y = data[offset + 13], z = data[offset + 14];
          const cx = view[0] * x + view[4] * y + view[8] * z + view[12];
          const cy = view[1] * x + view[5] * y + view[9] * z + view[13];
          const depth = -(view[2] * x + view[6] * y + view[10] * z + view[14]);
          // The .079 by .121 by .01 voxel glyph fits within a .08-radius
          // sphere. Its instance basis is orthogonal, including on cave props.
          const radius = 0.08 * Math.sqrt(Math.max(
            data[offset] ** 2 + data[offset + 1] ** 2 + data[offset + 2] ** 2,
            data[offset + 4] ** 2 + data[offset + 5] ** 2 + data[offset + 6] ** 2,
            data[offset + 8] ** 2 + data[offset + 9] ** 2 + data[offset + 10] ** 2));
          if (depth + radius < near || Math.abs(cx) > depth * tanX + radius * sideX || Math.abs(cy) > depth * tanY + radius * sideY) { matrixCulled++; continue; }
          if (matrixCaves && node.geometry.matrixCave && (!matrixActive || matrixTravel(x, z, node.geometry.matrixCave) - radius * Math.SQRT2 >= matrixRadius)) { matrixCulled++; continue; }
        }
        for (let i = 0; i < 16; i++) BATCH_NODE.world[i] = data[offset + i];
        BATCH_NODE.glow = data[offset + 16];
        BATCH_NODE.highlight = data[offset + 17];
        BATCH_NODE.tip = data[offset + 18];
        shadeNode(BATCH_NODE);
      }
    };
    // Integrate each voxel face over the sample footprint. This retains small,
    // distant pixels instead of dropping whole glyphs at a screen-size cutoff.
    const matrixCoverage = (mask, cross, travel, halfX, halfY, shiftX, shiftY, blockX, blockY) => {
      const loX = cross - halfX - shiftX, hiX = cross + halfX - shiftX;
      const loY = travel - halfY - shiftY, hiY = travel + halfY - shiftY;
      const x0 = Math.max(0, Math.ceil((loX + 0.0315 - blockX) / 0.021));
      const x1 = Math.min(3, Math.floor((hiX + 0.0315 + blockX) / 0.021));
      const y0 = Math.max(0, Math.ceil((0.0525 - hiY - blockY) / 0.021));
      const y1 = Math.min(5, Math.floor((0.0525 - loY + blockY) / 0.021));
      let area = 0;
      for (let y = y0; y <= y1; y++) {
        const cy = (2.5 - y) * 0.021;
        const overlapY = Math.max(0, Math.min(hiY, cy + blockY) - Math.max(loY, cy - blockY));
        for (let x = x0; x <= x1; x++) {
          if (!((mask >> (y * 4 + x)) & 1)) continue;
          const cx = (x - 1.5) * 0.021;
          area += overlapY * Math.max(0, Math.min(hiX, cx + blockX) - Math.max(loX, cx - blockX));
        }
      }
      return area / (4 * halfX * halfY);
    };
    const sampleMatrix = (rec, x, y, z, dxx, dxy, dxz, dyx, dyy, dyz) => {
      matrixSample[3] = 0;
      const relX = x - matrixOriginX, relZ = z - matrixOriginZ, flow = Math.hypot(relX, relZ);
      const cave = rec.matrixDynamic ? matrixLivingCave(x, y, z) : rec.matrixCave;
      const front = rec.matrixPartial ? matrixFront(cave && matrixCaves ? matrixTravel(x, z, cave) : flow) : matrixActive;
      if (front <= 0) return;
      const vx = eye.x - x, vy = eye.y - y, vz = eye.z - z, distance = Math.hypot(vx, vy, vz);
      const fog = smooth((distance - fogNear) / (fogFar - fogNear));
      if (rec.matrixPartial) {
        matrixSample[0] = rec.matrixLiving ? rec.matrixRed : fogRgb[0] * fog;
        matrixSample[1] = rec.matrixLiving ? rec.matrixGreen : fogRgb[1] * fog;
        matrixSample[2] = rec.matrixLiving ? rec.matrixBlue : fogRgb[2] * fog;
        matrixSample[3] = front * 255;
      }
      if (rec.matrixLocal || rec.matrixLiving) return;
      let stream, cross, travel, ax, az, bx, by, bz;
      if (rec.matrixWall) {
        const coord = rec.matrixWall === 1 ? z : x;
        const facing = rec.matrixWall === 1 ? -Math.sign(rec.matrixNx) : Math.sign(rec.matrixNz);
        stream = Math.floor(coord / 0.12);
        cross = (coord - (stream + 0.5) * 0.12) * facing;
        travel = -y;
        ax = rec.matrixWall === 1 ? 0 : facing; az = rec.matrixWall === 1 ? facing : 0;
        bx = bz = 0; by = 1;
      } else {
        const rx = flow > 0.0001 ? relX / flow : 1, rz = flow > 0.0001 ? relZ / flow : 0;
        ax = -rz; az = rx; bx = rx; by = 0; bz = rz;
        const angle = Math.atan2(relZ, relX);
        const level = Math.max(0, Math.min(6, Math.ceil(Math.log2(Math.max(flow, 0.75) / 0.75))));
        const count = 32 * 2 ** level, step = Math.PI * 2 / count;
        const ray = Math.floor((angle + Math.PI) / step + 0.5);
        stream = ((ray % count + count) % count) * (2048 / count);
        let delta = angle - (ray * step - Math.PI);
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        cross = delta * flow;
        travel = flow;
      }
      const offset = (stream + 2048) * 6;
      if (offset < 0 || offset >= matrixStreams.length || matrixStreams[offset] >= matrixDensity * 8) return;
      const moving = (travel - matrixTime * matrixStreams[offset + 1] - matrixStreams[offset + 4]) / 0.13;
      const cell = Math.floor(moving), localY = (moving - cell - 0.5) * 0.13;
      const halfX = Math.max(0.000001, (Math.abs(ax * dxx + az * dxz) + Math.abs(ax * dyx + az * dyz)) * matrixSampleStep * 0.5);
      const halfY = Math.max(0.000001, (Math.abs(bx * dxx + by * dxy + bz * dxz) + Math.abs(bx * dyx + by * dyy + bz * dyz)) * matrixSampleStep * 0.5);
      const normalView = Math.max(0.00001, Math.abs(rec.matrixNx * vx + rec.matrixNy * vy + rec.matrixNz * vz));
      const shiftX = -(vx * ax + vz * az) * 0.01 / normalView;
      const shiftY = -(vx * bx + vy * by + vz * bz) * 0.01 / normalView;
      const sx = Math.abs(shiftX) >= Math.abs(shiftY) ? ax * Math.sign(-shiftX) : bx * Math.sign(-shiftY);
      const sy = Math.abs(shiftX) >= Math.abs(shiftY) ? 0 : by * Math.sign(-shiftY);
      const sz = Math.abs(shiftX) >= Math.abs(shiftY) ? az * Math.sign(-shiftX) : bz * Math.sign(-shiftY);
      const sideShade = 0.7 + Math.max(0, sx * lightDir[0] + sy * lightDir[1] + sz * lightDir[2]) * 0.22 + Math.max(0, (sx * vx + sy * vy + sz * vz) / distance) * 0.08;
      const sequence = matrixStreams[offset + 3], train = matrixStreams[offset + 2];
      const first = Math.max(-2, Math.floor((localY - halfY - Math.abs(shiftY) * 2 + 0.065) / 0.13));
      const last = Math.min(2, Math.floor((localY + halfY + Math.abs(shiftY) * 2 + 0.065) / 0.13));
      let coverage = 0, red = 0, green = 0, blue = 0;
      for (let neighbor = first; neighbor <= last; neighbor++) {
        const flowCell = cell + neighbor, position = (flowCell % sequence + sequence) % sequence;
        if (position >= train) continue;
        const glyph = (Math.abs(stream * 73 + flowCell * 151) + Math.floor(matrixTime * 20)) & 7;
        const mask = MATRIX_MASKS[glyph], glyphY = (localY - neighbor * 0.13) * (rec.matrixWall ? -1 : 1);
        const area = Math.min(1, matrixCoverage(mask, cross, glyphY, halfX, halfY, shiftX * 1.5, shiftY * 1.5, 0.008 + Math.abs(shiftX) * 0.5, 0.008 + Math.abs(shiftY) * 0.5));
        const face = Math.min(area, matrixCoverage(mask, cross, glyphY, halfX, halfY, shiftX * 2, shiftY * 2, 0.008, 0.008));
        if (!area) continue;
        const glow = matrixStreams[offset + 5] * (0.48 + (position + 1) / train * 0.52);
        const tip = position === train - 1 ? 1 : position === train - 2 ? 0.55 : 0;
        const emission = (0.78 + glow * 0.37) * lerp(1, sideShade, 1 - face / area);
        red += lerp((glyph & 1 ? 70 : 24) * emission, 214.2, tip * 0.88) * area;
        green += lerp((glyph & 1 ? 255 : 220) * emission, 255, tip * 0.88) * area;
        blue += lerp((glyph & 1 ? 112 : 74) * emission, 226.95, tip * 0.88) * area;
        coverage += area;
      }
      if (!coverage) return;
      const area = Math.min(1, coverage);
      if (rec.matrixPartial) {
        matrixSample[0] = lerp(matrixSample[0], lerp(red / coverage, fogRgb[0], fog), area);
        matrixSample[1] = lerp(matrixSample[1], lerp(green / coverage, fogRgb[1], fog), area);
        matrixSample[2] = lerp(matrixSample[2], lerp(blue / coverage, fogRgb[2], fog), area);
      } else {
        matrixSample[0] = lerp(red / coverage, fogRgb[0], fog);
        matrixSample[1] = lerp(green / coverage, fogRgb[1], fog);
        matrixSample[2] = lerp(blue / coverage, fogRgb[2], fog);
        matrixSample[3] = area * front * 255;
      }
    };
    const drawMatrix = (rec) => {
      const step = matrixSampleStep, span = MATRIX_TILE_SIZE * step;
      const nx = rec.matrixNx, ny = rec.matrixNy, nz = rec.matrixNz, plane = rec.matrixPlane;
      const rx = view[0] / lastF, ry = view[4] / lastF, rz = view[8] / lastF;
      const ux = -view[1] / lastF, uy = -view[5] / lastF, uz = -view[9] / lastF;
      const ndx = nx * rx + ny * ry + nz * rz, ndy = nx * ux + ny * uy + nz * uz;
      ctx.save();
      ctx.clip();
      for (let ty = rec.matrixMinY; ty < rec.matrixMaxY; ty += span) {
        const rows = Math.min(MATRIX_TILE_SIZE, Math.ceil((rec.matrixMaxY - ty) / step));
        for (let tx = rec.matrixMinX; tx < rec.matrixMaxX; tx += span) {
          const cols = Math.min(MATRIX_TILE_SIZE, Math.ceil((rec.matrixMaxX - tx) / step));
          let painted = false;
          for (let iy = 0; iy < rows; iy++) {
            const py = ty + (iy + 0.5) * step - height * 0.5;
            for (let ix = 0; ix < cols; ix++) {
              const px = tx + (ix + 0.5) * step - width * 0.5;
              const dx = rx * px + ux * py - view[2], dy = ry * px + uy * py - view[6], dz = rz * px + uz * py - view[10];
              const denominator = nx * dx + ny * dy + nz * dz, depth = plane / denominator;
              const i = (iy * MATRIX_TILE_SIZE + ix) * 4;
              matrixPixels[i + 3] = 0;
              matrixSamples++;
              if (depth < near || !Number.isFinite(depth)) continue;
              const ddx = -depth * ndx / denominator, ddy = -depth * ndy / denominator;
              sampleMatrix(rec, eye.x + dx * depth, eye.y + dy * depth, eye.z + dz * depth,
                rx * depth + dx * ddx, ry * depth + dy * ddx, rz * depth + dz * ddx,
                ux * depth + dx * ddy, uy * depth + dy * ddy, uz * depth + dz * ddy);
              if (!matrixSample[3]) continue;
              matrixPixels[i] = matrixSample[0]; matrixPixels[i + 1] = matrixSample[1]; matrixPixels[i + 2] = matrixSample[2]; matrixPixels[i + 3] = matrixSample[3];
              painted = true;
            }
          }
          if (!painted) continue;
          matrixCtx.putImageData(matrixImage, 0, 0, 0, 0, cols, rows);
          ctx.drawImage(matrixTile, 0, 0, cols, rows, tx, ty, cols * step, rows * step);
        }
      }
      ctx.restore();
    };
    const matrixPolygonCoverage = (rec, x, y, step) => {
      let count = rec.n, src = matrixClipA, dst = matrixClipB;
      for (let i = 0; i < count * 2; i++) src[i] = rec.pts[i];
      for (let edge = 0; edge < 4; edge++) {
        const axis = edge & 1, sign = edge < 2 ? 1 : -1;
        const limit = (axis ? y : x) + (edge < 2 ? 0 : step);
        let out = 0;
        for (let i = 0; i < count; i++) {
          const a = i * 2, b = ((i + 1) % count) * 2;
          const da = (src[a + axis] - limit) * sign, db = (src[b + axis] - limit) * sign;
          if (da >= 0) { dst[out * 2] = src[a]; dst[out * 2 + 1] = src[a + 1]; out++; }
          if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            dst[out * 2] = lerp(src[a], src[b], t); dst[out * 2 + 1] = lerp(src[a + 1], src[b + 1], t); out++;
          }
        }
        if (out < 3) return 0;
        count = out;
        const swap = src; src = dst; dst = swap;
      }
      let area = 0;
      matrixPointX = matrixPointY = 0;
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        area += src[i * 2] * src[j * 2 + 1] - src[j * 2] * src[i * 2 + 1];
        if (rec.matrixPartial) { matrixPointX += src[i * 2]; matrixPointY += src[i * 2 + 1]; }
      }
      if (rec.matrixPartial) { matrixPointX /= count; matrixPointY /= count; }
      return Math.min(1, Math.abs(area) * 0.5 / (step * step));
    };
    const drawMatrixGlyph = (rec) => {
      const step = matrixSampleStep;
      // Visible faces partition a voxel's silhouette. Sum their area-weighted
      // contributions; source-over would attenuate shared antialiased pixels twice.
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rec.style;
      for (let y = rec.matrixMinY; y < rec.matrixMaxY; y += step) for (let x = rec.matrixMinX; x < rec.matrixMaxX; x += step) {
        let coverage = matrixPolygonCoverage(rec, x, y, step);
        matrixSamples++;
        if (!coverage) continue;
        if (rec.matrixPartial) {
          const px = (matrixPointX - width * 0.5) / lastF, py = (height * 0.5 - matrixPointY) / lastF;
          const dx = view[0] * px + view[1] * py - view[2], dy = view[4] * px + view[5] * py - view[6], dz = view[8] * px + view[9] * py - view[10];
          const depth = rec.matrixFacePlane / (rec.matrixFaceNx * dx + rec.matrixFaceNy * dy + rec.matrixFaceNz * dz);
          coverage *= matrixFront(matrixTravel(eye.x + dx * depth, eye.z + dz * depth, rec.matrixCave));
          if (!coverage) continue;
        }
        ctx.globalAlpha = coverage;
        ctx.fillRect(x, y, step, step);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    const render = (root, camera, opts = {}) => {
      const { light = DEFAULT_LIGHT, directStrength: strength = 1, ambientFloor: ambient = 0.3, diffuseFloor: diffuse = 0, clear = null, sky = DEFAULT_SKY, ground = DEFAULT_GROUND, horizon = null, zenith = null, fog = null, fogNear: near0 = 0, fogFar: far0 = 0, matrix = null } = opts;
      matrixActive = matrix ? matrix.active : 0;
      matrixRadius = matrix ? matrix.radius : 0;
      matrixTime = matrix ? matrix.time : 0;
      matrixDensity = matrix ? matrix.density : 0;
      matrixOriginX = matrix ? matrix.origin[0] : 0;
      matrixOriginZ = matrix ? matrix.origin[2] : 0;
      matrixCaves = matrix ? matrix.caves || null : null;
      matrixCaveBounds = matrix ? matrix.caveBounds || null : null;
      matrixCaveNear = matrix ? matrix.caveNear === undefined ? Infinity : matrix.caveNear : Infinity;
      matrixSurfaces = matrixLivingSurfaces = matrixArea = matrixSamples = matrixCulled = 0;
      matrixFrame++;
      if (fog) {
        fogRgb[0] = fog[0] * 255;
        fogRgb[1] = fog[1] * 255;
        fogRgb[2] = fog[2] * 255;
        fogNear = near0;
        fogFar = Math.max(far0, near0 + 1);
      } else {
        fogNear = 1e8;
        fogFar = 1e8 + 1;
      }
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
      directStrength = strength;
      ambientFloor = ambient;
      diffuseFloor = diffuse;
      skyLuma = sky[0] * 0.2126 + sky[1] * 0.7152 + sky[2] * 0.0722;
      groundLuma = ground[0] * 0.2126 + ground[1] * 0.7152 + ground[2] * 0.0722;
      poolUsed = 0;
      suppressed = 0;
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
          mirrorDebug.portal = !!node.mirrorPortal;
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
      for (let i = 0; i < poolUsed; i++) {
        const rec = pool[i];
        // A large backing polygon must precede all of its own voxel faces, even
        // when its centre is nearer than glyphs at its far edge in an oblique view.
        if (rec.matrixGlyph && !rec.line) {
          let plane = matrixPlaneSlot(rec.matrixNx, rec.matrixNy, rec.matrixNz, rec.matrixPlane - 0.015, false, 0);
          if (plane < 0) plane = matrixPlaneSlot(rec.matrixNx, rec.matrixNy, rec.matrixNz, rec.matrixPlane + 0.015, false, 0);
          if (plane >= 0 && rec.depth <= matrixPlaneDepths[plane]) rec.depth = matrixPlaneDepths[plane] + 0.0001 + (rec.depth - rec.matrixCenterDepth) * 0.001;
        }
        active[i] = rec;
      }
      active.sort((a, b) => a.depth - b.depth);
      matrixSampleStep = Math.max(1, Math.ceil(Math.sqrt(matrixArea / MATRIX_SAMPLE_BUDGET)));
      if (matrixArea) {
        let samples;
        do {
          samples = 0;
          for (const rec of active) if ((rec.matrix || rec.matrixGlyph) && !rec.line) samples += Math.max(0, Math.ceil((rec.matrixMaxX - rec.matrixMinX) / matrixSampleStep)) * Math.max(0, Math.ceil((rec.matrixMaxY - rec.matrixMinY) / matrixSampleStep));
          if (samples > MATRIX_SAMPLE_BUDGET) matrixSampleStep = Math.max(matrixSampleStep + 1, Math.ceil(matrixSampleStep * Math.sqrt(samples / MATRIX_SAMPLE_BUDGET)));
        } while (samples > MATRIX_SAMPLE_BUDGET);
      }
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
          if (rec.matrixGlyph) drawMatrixGlyph(rec);
          else if (!rec.matrixBacking || !rec.matrixPartial) {
            ctx.fillStyle = rec.style;
            ctx.fill();
            ctx.strokeStyle = rec.style;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          if (rec.matrix && (matrixDensity > 0 || rec.matrixPartial)) drawMatrix(rec);
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
        return { records: 0, active: 0, mirrorResources: 0, shadowResources: 0, shadowSize: 0, shadowPassCount: 0, shadowFinite: true, culled: matrixCulled, drawn: 0, suppressed, matrixSurfaces, matrixLivingSurfaces, matrixSamples, matrixSampleStep, matrixSampleBudget: MATRIX_SAMPLE_BUDGET, matrixTileBytes: matrixPixels.byteLength };
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
