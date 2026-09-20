(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4, lerp } = BL.math;
  const UP = { x: 0, y: 1, z: 0 };
  const grainHash = (x, y, z) => {
    let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
    n = Math.imul(n ^ n >>> 16, 2146121005);
    n = Math.imul(n ^ n >>> 15, -2073254261);
    return ((n ^ n >>> 16) >>> 0) / 4294967296;
  };
  // Neighbouring texels share lattice cells; the hash is pure, so each cell's 8 corners are cached per octave.
  const GRAIN_SLOTS = 256, grainKeys = new Float64Array(GRAIN_SLOTS * 4).fill(NaN), grainCorners = new Float64Array(GRAIN_SLOTS * 8);
  const grain = (x, y, z, field) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const slot = ((Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791) ^ field) >>> 0) & (GRAIN_SLOTS - 1), k = slot * 4, c = slot * 8;
    if (grainKeys[k] !== ix || grainKeys[k + 1] !== iy || grainKeys[k + 2] !== iz || grainKeys[k + 3] !== field) {
      grainKeys[k] = ix; grainKeys[k + 1] = iy; grainKeys[k + 2] = iz; grainKeys[k + 3] = field;
      grainCorners[c] = grainHash(ix, iy, iz); grainCorners[c + 1] = grainHash(ix + 1, iy, iz);
      grainCorners[c + 2] = grainHash(ix, iy + 1, iz); grainCorners[c + 3] = grainHash(ix + 1, iy + 1, iz);
      grainCorners[c + 4] = grainHash(ix, iy, iz + 1); grainCorners[c + 5] = grainHash(ix + 1, iy, iz + 1);
      grainCorners[c + 6] = grainHash(ix, iy + 1, iz + 1); grainCorners[c + 7] = grainHash(ix + 1, iy + 1, iz + 1);
    }
    x -= ix; y -= iy; z -= iz;
    x *= x * (3 - 2 * x); y *= y * (3 - 2 * y); z *= z * (3 - 2 * z);
    return lerp(lerp(lerp(grainCorners[c], grainCorners[c + 1], x), lerp(grainCorners[c + 2], grainCorners[c + 3], x), y),
      lerp(lerp(grainCorners[c + 4], grainCorners[c + 5], x), lerp(grainCorners[c + 6], grainCorners[c + 7], x), y), z);
  };
  const GLYPH_W = 32, GLYPH_H = 48, GLYPH_SIZE = GLYPH_W * GLYPH_H, GLYPH_RATE = 12;
  let glyphAtlas = null;
  const prepareGlyphAtlas = () => {
    if (glyphAtlas) return;
    glyphAtlas = new Float32Array(GLYPH_SIZE * 8);
    const scratch = new Float32Array(GLYPH_SIZE), kernel = [1, 4, 7, 10, 13, 10, 7, 4, 1];
    // Flatten the cave glyph pixels once and soften edges into the atlas; rendering only samples it, no live blur.
    for (let variant = 0; variant < 8; variant++) {
      const geometry = BL.hubModels.matrixGlyph(variant), v = geometry.verts;
      const front = BL.scene.boundsOf(geometry).max[2], offset = variant * GLYPH_SIZE;
      for (const face of geometry.faces) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, flat = true;
        for (const index of face.i) {
          const at = index * 3;
          if (Math.abs(v[at + 2] - front) > 1e-6) { flat = false; break; }
          minX = Math.min(minX, v[at]); minY = Math.min(minY, v[at + 1]);
          maxX = Math.max(maxX, v[at]); maxY = Math.max(maxY, v[at + 1]);
        }
        if (!flat || minX >= maxX || minY >= maxY) continue;
        const x0 = Math.max(0, Math.ceil((minX + 0.06) / 0.12 * GLYPH_W - 0.5)), x1 = Math.min(GLYPH_W, Math.ceil((maxX + 0.06) / 0.12 * GLYPH_W - 0.5));
        const y0 = Math.max(0, Math.ceil((0.09 - maxY) / 0.16 * GLYPH_H - 0.5)), y1 = Math.min(GLYPH_H, Math.ceil((0.09 - minY) / 0.16 * GLYPH_H - 0.5));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) glyphAtlas[offset + y * GLYPH_W + x] = 1;
      }
      for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++) if (x + k >= 0 && x + k < GLYPH_W) sum += glyphAtlas[offset + y * GLYPH_W + x + k] * kernel[k + 4];
        scratch[y * GLYPH_W + x] = sum / 57;
      }
      for (let y = 0; y < GLYPH_H; y++) for (let x = 0; x < GLYPH_W; x++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++) if (y + k >= 0 && y + k < GLYPH_H) sum += scratch[(y + k) * GLYPH_W + x] * kernel[k + 4];
        glyphAtlas[offset + y * GLYPH_W + x] = sum / 57;
      }
    }
  };
  const glyphField = (u, v, seed) => {
    const column = Math.floor(u), row = Math.floor(v), variant = Math.floor(grainHash(column, row, seed) * 8);
    const x = (u - column) * (GLYPH_W - 1), y = (1 - v + row) * (GLYPH_H - 1), ix = Math.floor(x), iy = Math.floor(y);
    const nx = Math.min(GLYPH_W - 1, ix + 1), ny = Math.min(GLYPH_H - 1, iy + 1), offset = variant * GLYPH_SIZE;
    return lerp(lerp(glyphAtlas[offset + iy * GLYPH_W + ix], glyphAtlas[offset + iy * GLYPH_W + nx], x - ix),
      lerp(glyphAtlas[offset + ny * GLYPH_W + ix], glyphAtlas[offset + ny * GLYPH_W + nx], x - ix), y - iy);
  };
  // The island is solid but its surface mesh has no interior faces: cap the solid/near-plane intersection.
  // Keeps the driven Ooga's silhouette; shared overlay uses the same world transforms in both renderers.
  const create = (overlay, interiorTextureAt = null) => {
    const ctx = overlay.getContext("2d");
    const mask = document.createElement("canvas"), rim = document.createElement("canvas"), stone = document.createElement("canvas");
    const maskCtx = mask.getContext("2d"), rimCtx = rim.getContext("2d"), stoneCtx = stone.getContext("2d");
    const concealed = document.createElement("canvas"), concealedRim = document.createElement("canvas");
    const concealedCtx = concealed.getContext("2d"), concealedRimCtx = concealedRim.getContext("2d");
    const visible = document.createElement("canvas"), visibleCtx = visible.getContext("2d");
    const apertureMask = document.createElement("canvas"), apertureCtx = apertureMask.getContext("2d");
    const wallLayer = document.createElement("canvas"), wallCtx = wallLayer.getContext("2d");
    const wallView = new Float64Array(18), phaseHeads = new Int32Array(256);
    let wallContexts = new Array(32), wallVersions = new Float64Array(32), wallCount = 0, wallFaces = 0, wallCached = false, wallContrast = 0, wallRockOnly = false;
    let surfacePoints = new Float32Array(0), surfaceCorners = new Uint8Array(0), surfaceNext = new Int32Array(0);
    const view = mat4.create(), triangle = new Float64Array(9), clipped = new Float64Array(12);
    let actorDepth = new Float32Array(0), clipActor = false, actorMinX = 0, actorMinY = 0, actorMaxX = -1, actorMaxY = -1;
    let actorColumns = new Int32Array(0);
    // Search the small silhouette band nearest-first. Stable distance order
    // keeps the same row/column tie break as scanning the complete square.
    // Buffer scale <= 1, spread <= 1.5 and contrast <= 1 bound its pad at 5.
    const actorNeighbors = new Int8Array(242);
    for (let y = -5, count = 0; y <= 5; y++) for (let x = -5; x <= 5; x++) {
      let at = count++ * 2;
      while (at && actorNeighbors[at - 2] ** 2 + actorNeighbors[at - 1] ** 2 > x * x + y * y) {
        actorNeighbors[at] = actorNeighbors[at - 2]; actorNeighbors[at + 1] = actorNeighbors[at - 1]; at -= 2;
      }
      actorNeighbors[at] = x; actorNeighbors[at + 1] = y;
    }
    const apertureView = new Float64Array(36), apertureClip = new Float64Array(39);
    let structurePhases = new Float32Array(0), structureTargets = new Uint8Array(0), structureSeen = new Uint8Array(0), structureLines = new Float32Array(0);
    const ROCK_GRID = 32, rockSamples = new Uint8Array((ROCK_GRID + 1) ** 2), rockTriangle = new Float64Array(9);
    const TEXTURE_SIZE = 128, textureTransform = new Float64Array(9), textureNext = new Float64Array(9);
    const textureColumns = new Float64Array(TEXTURE_SIZE * 3), textureRows = new Float64Array(TEXTURE_SIZE * 3);
    textureTransform.fill(NaN);
    stone.width = stone.height = TEXTURE_SIZE;
    const stoneImage = stoneCtx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE), stonePixels = stoneImage.data;
    let width = 0, height = 0, scale = 1, focal = 1, near = 0.2, cueContrast = 0, glyphTime = 0, textureGlyph = false, textureTick = -1;
    let glyphMaterial = null, textureMaterial = null, textureRevision = -1, textureInteriorRevision = -1, textureUniformGlyph = false;
    const state = { insideRock: false, partialRock: false, rockCoverage: 0, glyphInterior: false, glyphBlendMin: 0, glyphBlendMax: 0, glyphTextureUpdates: 0, outlined: false, faces: 0, opacity: 0.22, contrast: 0, textureSize: TEXTURE_SIZE, textureUpdates: 0, guideLines: 0, structureFaces: 0, structureFilled: false, structureUpdates: 0, structureCacheHits: 0, guideKind: null, guideIndex: -1, guideBasement: false };
    let rockAt = null, screenW = 1, screenH = 1, planeX = 0, planeY = 0, planeZ = 0, planeScale = 1;
    const sampleRock = (x, y) => {
      const right = (x - screenW / 2) * planeScale, up = (screenH / 2 - y) * planeScale;
      return rockAt(planeX + view[0] * right + view[1] * up, planeY + view[4] * right + view[5] * up, planeZ + view[8] * right + view[9] * up);
    };
    const rockCorner = (index, x, y, solid) => {
      rockTriangle[index] = x; rockTriangle[index + 1] = y; rockTriangle[index + 2] = solid;
    };
    const capTriangle = () => {
      let count = 0;
      for (let i = 0; i < 3; i++) {
        const a = i * 3, b = ((i + 1) % 3) * 3, aIn = rockTriangle[a + 2], bIn = rockTriangle[b + 2];
        if (aIn) {
          if (count++) ctx.lineTo(rockTriangle[a], rockTriangle[a + 1]); else ctx.moveTo(rockTriangle[a], rockTriangle[a + 1]);
        }
        if (aIn === bIn) continue;
        let lo = 0, hi = 1;
        // 8-step bisection refines the real rock boundary instead of exposing square mask tiles.
        for (let n = 0; n < 8; n++) {
          const t = (lo + hi) / 2;
          if (+sampleRock(rockTriangle[a] + (rockTriangle[b] - rockTriangle[a]) * t, rockTriangle[a + 1] + (rockTriangle[b + 1] - rockTriangle[a + 1]) * t) === aIn) lo = t;
          else hi = t;
        }
        const t = (lo + hi) / 2, x = rockTriangle[a] + (rockTriangle[b] - rockTriangle[a]) * t, y = rockTriangle[a + 1] + (rockTriangle[b + 1] - rockTriangle[a + 1]) * t;
        if (count++) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      if (count) ctx.closePath();
    };
    const updateStone = (materialAt) => {
      textureNext[0] = planeX; textureNext[1] = planeY; textureNext[2] = planeZ;
      textureNext[3] = view[0] * screenW * planeScale; textureNext[4] = view[4] * screenW * planeScale; textureNext[5] = view[8] * screenW * planeScale;
      textureNext[6] = view[1] * screenH * planeScale; textureNext[7] = view[5] * screenH * planeScale; textureNext[8] = view[9] * screenH * planeScale;
      const uniformGlyph = !interiorTextureAt && !glyphMaterial && cueContrast > 0, revision = glyphMaterial ? glyphMaterial.version : 0;
      const interiorRevision = interiorTextureAt ? interiorTextureAt.version || 0 : 0;
      const nextTick = Math.floor(glyphTime * GLYPH_RATE), tick = uniformGlyph || textureGlyph ? nextTick : -1, drift = nextTick / GLYPH_RATE * 0.1;
      let changed = glyphMaterial !== textureMaterial || revision !== textureRevision || interiorRevision !== textureInteriorRevision || uniformGlyph !== textureUniformGlyph || tick !== textureTick;
      for (let i = 0; i < 9; i++) if (!(Math.abs(textureNext[i] - textureTransform[i]) < 1e-5)) { changed = true; break; }
      if (!changed) { state.glyphInterior = textureGlyph; return; }
      textureTransform.set(textureNext); textureMaterial = glyphMaterial; textureRevision = revision; textureInteriorRevision = interiorRevision; textureUniformGlyph = uniformGlyph;
      let minimum = 1, maximum = 0;
      // Sample the real near-plane section; grain is a stationary 3D field, not a sliding screen-space wallpaper.
      for (let n = 0; n < TEXTURE_SIZE; n++) {
        const right = (n + 0.5) / TEXTURE_SIZE - 0.5, up = 0.5 - (n + 0.5) / TEXTURE_SIZE;
        textureColumns[n * 3] = textureNext[3] * right; textureColumns[n * 3 + 1] = textureNext[4] * right; textureColumns[n * 3 + 2] = textureNext[5] * right;
        textureRows[n * 3] = textureNext[6] * up; textureRows[n * 3 + 1] = textureNext[7] * up; textureRows[n * 3 + 2] = textureNext[8] * up;
      }
      for (let y = 0; y < TEXTURE_SIZE; y++) for (let x = 0; x < TEXTURE_SIZE; x++) {
        const wx = planeX + textureColumns[x * 3] + textureRows[y * 3];
        const wy = planeY + textureColumns[x * 3 + 1] + textureRows[y * 3 + 1];
        const wz = planeZ + textureColumns[x * 3 + 2] + textureRows[y * 3 + 2];
        const i = (y * TEXTURE_SIZE + x) * 4;
        // Each texel follows its stone surface's world wave; outline contrast must not recolor unreached rock.
        const amount = glyphMaterial ? glyphMaterial.coverageAt(wx, wy, wz) : uniformGlyph ? 1 : 0;
        minimum = Math.min(minimum, amount); maximum = Math.max(maximum, amount);
        let red = 0, green = 0, blue = 0;
        if (amount < 1) {
          if (interiorTextureAt) {
            interiorTextureAt(wx, wy, wz, stonePixels, i);
            red = stonePixels[i]; green = stonePixels[i + 1]; blue = stonePixels[i + 2];
          } else {
            const material = materialAt(wx, wy, wz) || BL.terrain.PALETTE[5];
            const light = 0.2 + grain(wx * 15, wy * 18, wz * 13, 0) * 0.12 + grain(wx * 73, wy * 67, wz * 79, 1) * 0.04;
            red = material[0] * light; green = material[1] * light; blue = material[2] * light;
          }
        }
        if (amount > 0) {
          prepareGlyphAtlas();
          // Two fixed world-space directions keep the blurred code anchored as the camera turns or crosses a floor.
          // Only world Y drifts, slowly downward at a bounded cadence.
          const a = glyphField(wx * 7 + wz * 3.13, wy * 6 + (wx - wz) * 0.25 + drift, 0);
          const b = glyphField(wz * 8 - wx * 2.61, wy * 6 + (wz + wx) * 0.19 + drift, 1);
          const glow = Math.max(a * 0.85, b * 0.65);
          red = lerp(red, 1 + glow * 2, amount); green = lerp(green, 2 + glow * 42, amount); blue = lerp(blue, 1 + glow * 9, amount);
        }
        stonePixels[i] = red; stonePixels[i + 1] = green; stonePixels[i + 2] = blue; stonePixels[i + 3] = 255;
      }
      state.glyphBlendMin = minimum; state.glyphBlendMax = maximum;
      state.glyphInterior = textureGlyph = maximum > 0; textureTick = textureGlyph ? nextTick : -1;
      stoneCtx.putImageData(stoneImage, 0, 0);
      state.textureUpdates++;
      if (textureGlyph) state.glyphTextureUpdates++;
    };
    const drawRock = (camera, solidAt, materialAt) => {
      rockAt = solidAt;
      screenW = overlay.clientWidth; screenH = overlay.clientHeight;
      planeX = camera.position.x - view[2] * camera.near;
      planeY = camera.position.y - view[6] * camera.near;
      planeZ = camera.position.z - view[10] * camera.near;
      planeScale = 2 * camera.near * Math.tan(camera.fov / 2) / screenH;
      const cols = Math.max(1, Math.ceil(ROCK_GRID * Math.min(1, screenW / screenH))), rows = Math.max(1, Math.ceil(ROCK_GRID * Math.min(1, screenH / screenW)));
      const stride = cols + 1, dx = screenW / cols, dy = screenH / rows;
      let count = 0;
      for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
        const solid = +sampleRock(x * dx, y * dy);
        rockSamples[y * stride + x] = solid;
        count += solid;
      }
      const total = (cols + 1) * (rows + 1);
      state.insideRock = count === total;
      state.partialRock = count > 0 && count < total;
      state.rockCoverage = count / total;
      ctx.beginPath();
      if (state.insideRock) ctx.rect(0, 0, screenW, screenH);
      else if (state.partialRock) {
        // One combined path prevents seams between neighbouring mask triangles.
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * stride + x, a = rockSamples[i], b = rockSamples[i + 1], c = rockSamples[i + stride + 1], d = rockSamples[i + stride];
          if (a && b && c && d) { ctx.rect(x * dx, y * dy, dx, dy); continue; }
          if (!(a || b || c || d)) continue;
          rockCorner(0, x * dx, y * dy, a); rockCorner(3, (x + 1) * dx, y * dy, b); rockCorner(6, (x + 1) * dx, (y + 1) * dy, c);
          capTriangle();
          rockCorner(3, (x + 1) * dx, (y + 1) * dy, c); rockCorner(6, x * dx, (y + 1) * dy, d);
          capTriangle();
        }
      }
      if (count) {
        updateStone(materialAt);
        ctx.save();
        ctx.clip();
        ctx.drawImage(stone, 0, 0, screenW, screenH);
        ctx.restore();
      }
      rockAt = null;
    };
    const ensureBuffers = (w, h) => {
      const nextScale = Math.min(1, 1024 / Math.max(w, h));
      const nextW = Math.max(1, Math.ceil(w * nextScale)), nextH = Math.max(1, Math.ceil(h * nextScale));
      if (nextW !== width || nextH !== height) {
        width = mask.width = rim.width = concealed.width = concealedRim.width = visible.width = apertureMask.width = wallLayer.width = nextW;
        height = mask.height = rim.height = concealed.height = concealedRim.height = visible.height = apertureMask.height = wallLayer.height = nextH;
        wallCached = false;
      }
      scale = nextScale;
    };
    const appendAperture = (points, count) => {
      for (let n = 0; n < count * 3; n += 3) {
        const x = points[n], y = points[n + 1], z = points[n + 2];
        apertureView[n] = view[0] * x + view[4] * y + view[8] * z + view[12];
        apertureView[n + 1] = view[1] * x + view[5] * y + view[9] * z + view[13];
        apertureView[n + 2] = view[2] * x + view[6] * y + view[10] * z + view[14];
      }
      let corners = 0;
      for (let n = 0; n < count; n++) {
        const a = n * 3, b = ((n + 1) % count) * 3, aIn = apertureView[a + 2] <= -near, bIn = apertureView[b + 2] <= -near;
        if (aIn) { for (let axis = 0; axis < 3; axis++) apertureClip[corners * 3 + axis] = apertureView[a + axis]; corners++; }
        if (aIn !== bIn) {
          const t = (-near - apertureView[a + 2]) / (apertureView[b + 2] - apertureView[a + 2]);
          for (let axis = 0; axis < 3; axis++) apertureClip[corners * 3 + axis] = apertureView[a + axis] + (apertureView[b + axis] - apertureView[a + axis]) * t;
          corners++;
        }
      }
      if (corners < 3) return false;
      for (let n = 0; n < corners * 3; n += 3) {
        apertureClip[n] = width / 2 - apertureClip[n] * focal / apertureClip[n + 2];
        apertureClip[n + 1] = height / 2 + apertureClip[n + 1] * focal / apertureClip[n + 2];
      }
      let area = 0;
      for (let corner = 0; corner < corners; corner++) {
        const a = corner * 3, b = ((corner + 1) % corners) * 3;
        area += apertureClip[a] * apertureClip[b + 1] - apertureClip[a + 1] * apertureClip[b];
      }
      // A face on the frame plane clips to a line; stroking that zero-area contact puts a strip back in the opening.
      if (Math.abs(area) < 1e-5) return false;
      const reverse = area < 0;
      for (let corner = 0; corner < corners; corner++) {
        const n = (reverse ? corners - 1 - corner : corner) * 3;
        if (corner) apertureCtx.lineTo(apertureClip[n], apertureClip[n + 1]); else apertureCtx.moveTo(apertureClip[n], apertureClip[n + 1]);
      }
      apertureCtx.closePath();
      return true;
    };
    let apertureBatch = 0, apertureFaces = 0;
    const appendApertureMask = (points, count) => {
      if (!appendAperture(points, count)) return;
      apertureFaces++;
      if (++apertureBatch === 16) {
        apertureCtx.fill(); apertureCtx.stroke(); apertureCtx.beginPath(); apertureBatch = 0;
      }
    };
    const drawCueRim = (target, source, opacity, w, h, visibleMask = null, fade = 1) => {
      if (cueContrast > 0) {
        // Reuse the aperture scratch after its window cuts; the keyline sits beside the rim, never filling body or view.
        apertureCtx.clearRect(0, 0, width, height);
        apertureCtx.globalCompositeOperation = "source-over";
        const spread = Math.max(0.75, scale);
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) apertureCtx.drawImage(source, x * spread, y * spread);
        if (visibleMask) { apertureCtx.globalCompositeOperation = "destination-out"; apertureCtx.drawImage(visibleMask, 0, 0); }
        apertureCtx.globalCompositeOperation = "source-in";
        apertureCtx.fillStyle = "#11160f"; apertureCtx.fillRect(0, 0, width, height);
        apertureCtx.globalCompositeOperation = "source-over";
        target.globalAlpha = 0.68 * cueContrast * fade;
        target.drawImage(apertureMask, 0, 0, width, height, 0, 0, w, h);
      }
      target.globalAlpha = opacity;
      target.drawImage(source, 0, 0, width, height, 0, 0, w, h);
      if (cueContrast > 0) {
        apertureCtx.clearRect(0, 0, width, height);
        apertureCtx.drawImage(source, 0, 0);
        apertureCtx.globalCompositeOperation = "source-in";
        apertureCtx.fillStyle = "#f1e5ca"; apertureCtx.fillRect(0, 0, width, height);
        apertureCtx.globalCompositeOperation = "source-over";
        target.globalAlpha = 0.5 * cueContrast * fade;
        target.drawImage(apertureMask, 0, 0, width, height, 0, 0, w, h);
      }
    };
    const drawStructure = (camera, guides, w, h) => {
      if (guides.objectsEnabled === false) return;
      const structures = guides.structures, size = structures ? structures.length : guides.structure ? 1 : 0;
      if (!size) return;
      const rockOnly = guides.rockOnly === true;
      ensureBuffers(w, h);
      let changed = !wallCached || wallCount !== size || wallContrast !== cueContrast || wallRockOnly !== rockOnly || wallView[16] !== camera.fov || wallView[17] !== camera.near;
      for (let n = 0; n < 16; n++) if (wallView[n] !== view[n]) changed = true;
      let surfaceCapacity = 0;
      for (let item = 0; item < size; item++) {
        const structure = structures ? structures[item] : guides.structure;
        if (wallContexts[item] !== structure || wallVersions[item] !== structure.surfaceVersion || structure.surfaceVersion === undefined) changed = true;
        if (structure.surfaceWholeActive || structure.surfaceActive) surfaceCapacity += structure.surfaceCount;
      }
      if (!changed) {
        state.structureCacheHits++;
        state.structureFaces = wallFaces; state.structureFilled = wallFaces > 0;
        if (wallFaces) { ctx.globalAlpha = 1; ctx.drawImage(wallLayer, 0, 0, width, height, 0, 0, w, h); }
        return;
      }
      if (size > wallVersions.length) {
        const capacity = Math.max(size, wallVersions.length * 2);
        wallContexts = new Array(capacity); wallVersions = new Float64Array(capacity);
      }
      if (surfaceCapacity > surfaceCorners.length) {
        const capacity = Math.max(surfaceCapacity, surfaceCorners.length * 2, 4096);
        surfacePoints = new Float32Array(capacity * 8); surfaceCorners = new Uint8Array(capacity); surfaceNext = new Int32Array(capacity);
      }
      wallCount = size; wallContrast = cueContrast; wallRockOnly = rockOnly; wallView.set(view); wallView[16] = camera.fov; wallView[17] = camera.near;
      for (let item = 0; item < size; item++) {
        const structure = structures ? structures[item] : guides.structure;
        wallContexts[item] = structure; wallVersions[item] = structure.surfaceVersion;
      }
      wallCached = true; wallFaces = 0;
      state.structureUpdates++;
      focal = height / 2 / Math.tan(camera.fov / 2);
      near = camera.near;
      maskCtx.clearRect(0, 0, width, height);
      concealedCtx.clearRect(0, 0, width, height);
      visibleCtx.clearRect(0, 0, width, height);
      wallCtx.clearRect(0, 0, width, height);
      maskCtx.globalAlpha = 1;
      maskCtx.fillStyle = maskCtx.strokeStyle = concealedCtx.fillStyle = visibleCtx.fillStyle = visibleCtx.strokeStyle = "#ffffff";
      maskCtx.lineWidth = visibleCtx.lineWidth = 0.6;
      maskCtx.beginPath(); visibleCtx.beginPath(); phaseHeads.fill(-1);
      let opaqueBatch = 0, visibleBatch = 0;
      for (let item = 0; item < size; item++) {
        const structure = structures ? structures[item] : guides.structure;
        if (!(structure.surfaceWholeActive || structure.surfaceActive)) continue;
        const surface = structure.surface;
        for (let at = 0; at < structure.surfaceCount * 9; at += 9) {
          const group = structure.surfaceGroups[at / 9];
          const whole = structure.surfaceWholePhases ? structure.surfaceWholePhases[group] : structure.surfacePhases[group];
          // In a rock cut the cap is the camera occluder: a clear sample elsewhere on the wall must not remove it.
          const phase = rockOnly ? whole * (structure.surfaceSections ? structure.surfaceSections[group] : 1) : structure.surfacePhases[group];
          if (whole <= 0) continue;
          for (let n = 0; n < 3; n++) {
            const i = at + n * 3, x = surface[i], y = surface[i + 1], z = surface[i + 2];
            triangle[n * 3] = view[0] * x + view[4] * y + view[8] * z + view[12];
            triangle[n * 3 + 1] = view[1] * x + view[5] * y + view[9] * z + view[13];
            triangle[n * 3 + 2] = view[2] * x + view[6] * y + view[10] * z + view[14];
          }
          let count = 0;
          for (let n = 0; n < 3; n++) {
            const a = n * 3, b = ((n + 1) % 3) * 3, aIn = triangle[a + 2] <= -near, bIn = triangle[b + 2] <= -near;
            if (aIn) { clipped[count++] = triangle[a]; clipped[count++] = triangle[a + 1]; clipped[count++] = triangle[a + 2]; }
            if (aIn !== bIn) {
              const t = (-near - triangle[a + 2]) / (triangle[b + 2] - triangle[a + 2]);
              clipped[count++] = triangle[a] + (triangle[b] - triangle[a]) * t;
              clipped[count++] = triangle[a + 1] + (triangle[b + 1] - triangle[a + 1]) * t;
              clipped[count++] = -near;
            }
          }
          if (count < 9) continue;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (let n = 0; n < count; n += 3) {
            const x = width / 2 - clipped[n] * focal / clipped[n + 2], y = height / 2 + clipped[n + 1] * focal / clipped[n + 2];
            clipped[n] = x; clipped[n + 1] = y;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
          if (maxX < -4 || minX > width + 4 || maxY < -4 || minY > height + 4) continue;
          // Equal winding preserves the union where opposing slab faces overlap.
          // Keep each rasterized path small; one huge path makes the canvas resolve thousands of overlapping contours.
          const reverse = (clipped[3] - clipped[0]) * (clipped[7] - clipped[1]) - (clipped[4] - clipped[1]) * (clipped[6] - clipped[0]) < 0;
          const corners = count / 3, start = wallFaces * 8, cameraVisible = !rockOnly && structure.surfaceHidden && !structure.surfaceHidden[group];
          for (let corner = 0; corner < corners; corner++) {
            const n = (reverse ? corners - 1 - corner : corner) * 3, x = clipped[n], y = clipped[n + 1];
            if (corner) maskCtx.lineTo(x, y); else maskCtx.moveTo(x, y);
            if (cameraVisible) { if (corner) visibleCtx.lineTo(x, y); else visibleCtx.moveTo(x, y); }
            if (phase > 0) { surfacePoints[start + corner * 2] = x; surfacePoints[start + corner * 2 + 1] = y; }
          }
          maskCtx.closePath();
          if (++opaqueBatch === 16) { maskCtx.fill(); maskCtx.stroke(); maskCtx.beginPath(); opaqueBatch = 0; }
          if (cameraVisible) {
            visibleCtx.closePath();
            if (++visibleBatch === 16) { visibleCtx.fill(); visibleCtx.stroke(); visibleCtx.beginPath(); visibleBatch = 0; }
          }
          if (phase > 0) {
            // One alpha unit is below the overlay's 8-bit opacity.
            // Reusable buckets keep fades smooth without a path or canvas allocation per triangle per frame.
            const level = Math.max(1, Math.min(255, Math.round(phase * 255)));
            surfaceCorners[wallFaces] = corners; surfaceNext[wallFaces] = phaseHeads[level]; phaseHeads[level] = wallFaces++;
          }
        }
      }
      if (opaqueBatch) { maskCtx.fill(); maskCtx.stroke(); }
      if (visibleBatch) { visibleCtx.fill(); visibleCtx.stroke(); }
      // Per-opening masks: a blocked part of one window must not erase a clear part of another.
      // Foreground stone cuts the mask at its rendered edges, including the flared frame and ceiling.
      apertureCtx.fillStyle = apertureCtx.strokeStyle = "#ffffff";
      apertureCtx.lineWidth = 0.6;
      // Jagged flare fragments end in acute triangles; a mitered seam stroke would push their tips into clear pixels.
      apertureCtx.lineJoin = "round";
      for (let item = 0; !rockOnly && item < size; item++) {
        const structure = structures ? structures[item] : guides.structure;
        if (!(structure.surfaceWholeActive || structure.surfaceActive) || !structure.apertures) continue;
        for (let aperture = 0; aperture < structure.apertures.count; aperture++) {
          apertureCtx.clearRect(0, 0, width, height); apertureCtx.beginPath(); apertureBatch = apertureFaces = 0;
          for (let at = 0; at < structure.surfaceCount * 9; at += 9) {
            const group = structure.surfaceGroups[at / 9], whole = structure.surfaceWholePhases ? structure.surfaceWholePhases[group] : structure.surfacePhases[group];
            if (!structure.surfaceAperture[group] || whole <= 0) continue;
            const cut = structure.apertures.clip(aperture, structure.surface, at);
            if (cut.count) appendApertureMask(cut.points, cut.count);
          }
          if (apertureBatch) { apertureCtx.fill(); apertureCtx.stroke(); }
          // An opening with no wall face would leave a transparent mask.
          if (!apertureFaces) continue;
          apertureCtx.globalCompositeOperation = "destination-out";
          apertureCtx.beginPath(); apertureBatch = 0;
          structure.apertures.blockers(aperture, appendApertureMask);
          if (apertureBatch) { apertureCtx.fill(); apertureCtx.stroke(); }
          apertureCtx.globalCompositeOperation = "source-over";
          visibleCtx.drawImage(apertureMask, 0, 0);
        }
      }
      for (let level = 1; level < phaseHeads.length; level++) if (phaseHeads[level] >= 0) {
        concealedCtx.beginPath();
        concealedCtx.globalAlpha = level / 255;
        let batch = 0;
        for (let face = phaseHeads[level]; face >= 0; face = surfaceNext[face]) {
          const start = face * 8;
          for (let corner = 0; corner < surfaceCorners[face]; corner++) {
            const at = start + corner * 2;
            if (corner) concealedCtx.lineTo(surfacePoints[at], surfacePoints[at + 1]); else concealedCtx.moveTo(surfacePoints[at], surfacePoints[at + 1]);
          }
          concealedCtx.closePath();
          if (++batch === 16) { concealedCtx.fill(); concealedCtx.beginPath(); batch = 0; }
        }
        if (batch) concealedCtx.fill();
      }
      concealedCtx.globalAlpha = 1;
      // Visible front faces beat hidden rear faces on the same pixels, else a thick slab outlines its visible side.
      concealedCtx.globalCompositeOperation = "destination-out";
      concealedCtx.drawImage(visible, 0, 0);
      concealedCtx.globalCompositeOperation = "source-over";
      state.structureFaces = wallFaces;
      if (!wallFaces) return;
      // The full wall supplies the silhouette; camera visibility masks fill and rim only afterward.
      // Keeps patch boundaries from becoming false wall edges on a jagged stone surface.
      wallCtx.globalAlpha = 0.12;
      wallCtx.drawImage(concealed, 0, 0);
      rimCtx.clearRect(0, 0, width, height);
      rimCtx.globalCompositeOperation = "source-over";
      concealedRimCtx.clearRect(0, 0, width, height);
      concealedRimCtx.drawImage(concealed, 0, 0);
      const spread = Math.max(1.5, 2.25 * scale);
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) {
        rimCtx.drawImage(mask, x * spread, y * spread);
        concealedRimCtx.drawImage(concealed, x * spread, y * spread);
      }
      rimCtx.globalCompositeOperation = "destination-out";
      rimCtx.drawImage(mask, 0, 0);
      rimCtx.globalCompositeOperation = "destination-in";
      rimCtx.drawImage(concealedRim, 0, 0);
      concealedRimCtx.clearRect(0, 0, width, height);
      concealedRimCtx.drawImage(visible, 0, 0);
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) concealedRimCtx.drawImage(visible, x * spread, y * spread);
      rimCtx.globalCompositeOperation = "destination-out";
      rimCtx.drawImage(concealedRim, 0, 0);
      rimCtx.globalCompositeOperation = "source-over";
      drawCueRim(wallCtx, rim, 0.34, width, height, visible);
      ctx.globalAlpha = 1;
      ctx.drawImage(wallLayer, 0, 0, width, height, 0, 0, w, h);
      state.structureFilled = true;
    };
    const reserveStructure = (count) => {
      if (count <= structurePhases.length) return;
      const capacity = Math.max(count, structurePhases.length * 2, 256), phases = new Float32Array(capacity), lines = new Float32Array(capacity * 6);
      phases.set(structurePhases); lines.set(structureLines);
      structurePhases = phases; structureTargets = new Uint8Array(capacity); structureSeen = new Uint8Array(capacity); structureLines = lines;
    };
    const drawGuideLine = (lines, n, object, opacity, observer, radius, focal, near) => {
      if (opacity <= 0) return;
      let ax = view[0] * lines[n] + view[4] * lines[n + 1] + view[8] * lines[n + 2] + view[12];
      let ay = view[1] * lines[n] + view[5] * lines[n + 1] + view[9] * lines[n + 2] + view[13];
      let az = view[2] * lines[n] + view[6] * lines[n + 1] + view[10] * lines[n + 2] + view[14];
      let bx = view[0] * lines[n + 3] + view[4] * lines[n + 4] + view[8] * lines[n + 5] + view[12];
      let by = view[1] * lines[n + 3] + view[5] * lines[n + 4] + view[9] * lines[n + 5] + view[13];
      let bz = view[2] * lines[n + 3] + view[6] * lines[n + 4] + view[10] * lines[n + 5] + view[14];
      if (az > -near && bz > -near) return;
      if (az > -near) { const t = (-near - az) / (bz - az); ax = lerp(ax, bx, t); ay = lerp(ay, by, t); az = -near; }
      else if (bz > -near) { const t = (-near - bz) / (az - bz); bx = lerp(bx, ax, t); by = lerp(by, ay, t); bz = -near; }
      const x0 = screenW / 2 - ax * focal / az, y0 = screenH / 2 + ay * focal / az;
      const x1 = screenW / 2 - bx * focal / bz, y1 = screenH / 2 + by * focal / bz;
      if (Math.max(x0, x1) < 0 || Math.min(x0, x1) > screenW || Math.max(y0, y1) < 0 || Math.min(y0, y1) > screenH) return;
      const distance = observer ? Math.hypot((lines[n] + lines[n + 3]) / 2 - observer[0], (lines[n + 1] + lines[n + 4]) / 2 - observer[1], (lines[n + 2] + lines[n + 5]) / 2 - observer[2]) : 0;
      const fade = object ? opacity : Math.min(1, Math.max(0, 2 - 2 * distance / radius)) * opacity;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      if (cueContrast > 0) {
        ctx.strokeStyle = "#11160f"; ctx.lineWidth = object ? 3.5 : 3;
        ctx.globalAlpha = 0.68 * cueContrast * fade; ctx.stroke();
      }
      ctx.strokeStyle = object ? "#d9c9a9" : "#b6aa95";
      ctx.lineWidth = object ? 1.5 : 1;
      ctx.globalAlpha = object ? 0.18 * opacity : 0.14 * Math.min(1, Math.max(0, 2 - 2 * distance / radius)) * opacity;
      ctx.stroke();
      if (cueContrast > 0) { ctx.strokeStyle = "#f1e5ca"; ctx.globalAlpha = 0.5 * cueContrast * fade; ctx.stroke(); }
      state.guideLines++;
    };
    const drawGuides = (camera, guides, dt) => {
      const lines = guides.lines, focal = screenH / 2 / Math.tan(camera.fov / 2), near = camera.near;
      state.guideKind = guides.kind; state.guideIndex = guides.index; state.guideBasement = guides.basement;
      if (guides.structures) {
        // Complete walls already have a continuous rim; keeping the old section lines re-adds panel seams on it.
        structurePhases.fill(0);
        for (let n = 0; n < guides.count * 6; n += 6) if (guides.kinds && guides.kinds[n / 6]) drawGuideLine(lines, n, true, guides.alphas ? guides.alphas[n / 6] : 1, guides.observer, guides.radius || 12, focal, near);
        return;
      }
      const sourceCount = guides.structureSourceCount || guides.structureCount || (!guides.sources ? guides.count : 0);
      reserveStructure(sourceCount);
      structureTargets.fill(0, 0, sourceCount); structureSeen.fill(0, 0, sourceCount);
      for (let n = 0; n < guides.count * 6; n += 6) {
        const object = guides.kinds && guides.kinds[n / 6];
        if (object) { drawGuideLine(lines, n, true, guides.alphas ? guides.alphas[n / 6] : 1, guides.observer, guides.radius || 12, focal, near); continue; }
        const source = guides.sources ? guides.sources[n / 6] : n / 6;
        if (source >= structurePhases.length) continue;
        structureTargets[source] = structureSeen[source] = 1;
        for (let axis = 0; axis < 6; axis++) structureLines[source * 6 + axis] = lines[n + axis];
      }
      if (guides.objectsEnabled === false) structurePhases.fill(0);
      else {
        const step = Math.max(0, dt) / 0.25;
        for (let source = 0; source < sourceCount; source++) {
          const before = structurePhases[source], target = structureTargets[source];
          structurePhases[source] = before < target ? Math.min(target, before + step) : Math.max(target, before - step);
        }
      }
      for (let n = 0; n < guides.count * 6; n += 6) if (!(guides.kinds && guides.kinds[n / 6])) {
        const source = guides.sources ? guides.sources[n / 6] : n / 6;
        drawGuideLine(lines, n, false, structurePhases[source], guides.observer, guides.radius || 12, focal, near);
      }
      for (let source = 0; source < sourceCount; source++) if (!structureSeen[source] && structurePhases[source] > 0) drawGuideLine(structureLines, source * 6, false, structurePhases[source], guides.observer, guides.radius || 12, focal, near);
    };
    // Only the exterior-ramp exception needs a partial character cue.
    // Keep nearest surface depth in the mask's pixel coords; no canvas readback or per-frame image alloc.
    const rasterActorEdge = (ax, ay, ad, bx, by, bd) => {
      const dx = bx - ax, dy = by - ay;
      let lo = 0, hi = 1;
      if (dx) { const a = -ax / dx, b = (width - ax) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      else if (ax < 0 || ax >= width) return;
      if (dy) { const a = -ay / dy, b = (height - ay) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
      else if (ay < 0 || ay >= height) return;
      if (hi < lo) return;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * (hi - lo) * 2));
      for (let step = 0; step <= steps; step++) {
        const t = lo + (hi - lo) * step / steps, x = Math.floor(ax + dx * t), y = Math.floor(ay + dy * t), depth = ad + (bd - ad) * t;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const at = y * width + x;
        if (depth > actorDepth[at]) actorDepth[at] = depth;
      }
    };
    const rasterActorDepth = (count) => {
      for (let fan = 1; fan + 1 < count / 3; fan++) {
        const b = fan * 3, c = b + 3, ad = -1 / clipped[2], bd = -1 / clipped[b + 2], cd = -1 / clipped[c + 2];
        const ax = width / 2 + clipped[0] * focal * ad, ay = height / 2 - clipped[1] * focal * ad;
        const bx = width / 2 + clipped[b] * focal * bd, by = height / 2 - clipped[b + 1] * focal * bd;
        const cx = width / 2 + clipped[c] * focal * cd, cy = height / 2 - clipped[c + 1] * focal * cd;
        const area = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
        actorMinX = Math.min(actorMinX, x0); actorMaxX = Math.max(actorMaxX, x1);
        actorMinY = Math.min(actorMinY, y0); actorMaxY = Math.max(actorMaxY, y1);
        // Canvas covers subpixel edges that miss every pixel center; keep their depth so hair/accessory tips clip.
        rasterActorEdge(ax, ay, ad, bx, by, bd); rasterActorEdge(bx, by, bd, cx, cy, cd); rasterActorEdge(cx, cy, cd, ax, ay, ad);
        if (Math.abs(area) < 1e-9) continue;
        const aStep = (by - cy) / area, bStep = (cy - ay) / area, cStep = -aStep - bStep;
        for (let y = y0; y <= y1; y++) {
          const aStart = ((by - cy) * (x0 + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / area;
          const bStart = ((cy - ay) * (x0 + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / area, cStart = 1 - aStart - bStart;
          let first = x0, last = x1;
          // Conservative scanline bounds skip the empty half of a triangle's
          // rectangle. Keep an extra pixel at each boundary, then use the
          // original barycentric test and depth calculation without rounding.
          if (aStep > 0) first = Math.max(first, Math.ceil(x0 + (-1e-7 - aStart) / aStep) - 1);
          else if (aStep < 0) last = Math.min(last, Math.floor(x0 + (-1e-7 - aStart) / aStep) + 1);
          else if (aStart < -1e-7) continue;
          if (bStep > 0) first = Math.max(first, Math.ceil(x0 + (-1e-7 - bStart) / bStep) - 1);
          else if (bStep < 0) last = Math.min(last, Math.floor(x0 + (-1e-7 - bStart) / bStep) + 1);
          else if (bStart < -1e-7) continue;
          if (cStep > 0) first = Math.max(first, Math.ceil(x0 + (-1e-7 - cStart) / cStep) - 1);
          else if (cStep < 0) last = Math.min(last, Math.floor(x0 + (-1e-7 - cStart) / cStep) + 1);
          else if (cStart < -1e-7) continue;
          for (let x = first; x <= last; x++) {
            const aWeight = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / area;
            const bWeight = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / area, cWeight = 1 - aWeight - bWeight;
            if (aWeight < -1e-7 || bWeight < -1e-7 || cWeight < -1e-7) continue;
            const at = y * width + x, depth = aWeight * ad + bWeight * bd + cWeight * cd;
            if (depth > actorDepth[at]) actorDepth[at] = depth;
          }
        }
      }
    };
    const maskVisibleActor = (camera, visibleAt, spread) => {
      visibleCtx.clearRect(0, 0, width, height);
      visibleCtx.fillStyle = "#ffffff";
      const pad = Math.ceil(spread + 2 + (cueContrast > 0 ? Math.max(0.75, scale) : 0));
      const x0 = Math.max(0, actorMinX - pad), x1 = Math.min(width - 1, actorMaxX + pad);
      const y0 = Math.max(0, actorMinY - pad), y1 = Math.min(height - 1, actorMaxY + pad), p = camera.position;
      const firstX = Math.max(0, x0 - pad), lastX = Math.min(width - 1, x1 + pad), area = (2 * pad + 1) ** 2;
      // Sliding coverage counts reject filled interiors and empty space in O(1); only the rim band searches depth.
      actorColumns.fill(0);
      for (let y = Math.max(0, y0 - pad); y <= Math.min(height - 1, y0 + pad); y++) for (let x = firstX; x <= lastX; x++) {
        if (actorDepth[y * width + x]) actorColumns[x]++;
      }
      for (let y = y0; y <= y1; y++) {
        let run = -1, coverage = 0;
        for (let x = Math.max(0, x0 - pad); x <= Math.min(width - 1, x0 + pad); x++) coverage += actorColumns[x];
        for (let x = x0; x <= x1 + 1; x++) {
          let clear = false;
          if (x <= x1 && coverage && coverage < area) {
            let depth = actorDepth[y * width + x];
            if (!depth) for (let n = 0; n < actorNeighbors.length; n += 2) {
              const dx = actorNeighbors[n], dy = actorNeighbors[n + 1], xx = x + dx, yy = y + dy;
              if (Math.abs(dx) > pad || Math.abs(dy) > pad || xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
              depth = actorDepth[yy * width + xx];
              if (depth) break;
            }
            if (depth) {
              // Extend the nearest body depth into its rim band.
              // Test each rim pixel itself, so a window border cannot erase hidden outline pixels on its other side.
              const z = 1 / depth, vx = (x + 0.5 - width / 2) * z / focal, vy = (height / 2 - y - 0.5) * z / focal;
              clear = visibleAt(p.x + view[0] * vx + view[1] * vy - view[2] * z,
                p.y + view[4] * vx + view[5] * vy - view[6] * z, p.z + view[8] * vx + view[9] * vy - view[10] * z);
            }
          }
          if (clear && run < 0) run = x;
          else if (!clear && run >= 0) { visibleCtx.fillRect(run, y, x - run, 1); run = -1; }
          if (x - pad >= 0) coverage -= actorColumns[x - pad];
          if (x + pad + 1 < width) coverage += actorColumns[x + pad + 1];
        }
        for (let x = firstX; x <= lastX; x++) {
          if (y - pad >= 0 && actorDepth[(y - pad) * width + x]) actorColumns[x]--;
          if (y + pad + 1 < height && actorDepth[(y + pad + 1) * width + x]) actorColumns[x]++;
        }
      }
    };
    const drawNode = (node) => {
      if (!node.visible || node.cameraHidden) return;
      const geometry = node.geometry, world = node.world;
      if (geometry) for (const face of geometry.faces) {
        // Triangles clip to at most four corners, so the scratch space stays fixed.
        for (let fan = 1; fan + 1 < face.i.length; fan++) {
          for (let n = 0; n < 3; n++) {
            const i = face.i[n === 0 ? 0 : fan + n - 1] * 3, v = geometry.verts;
            const x = world[0] * v[i] + world[4] * v[i + 1] + world[8] * v[i + 2] + world[12];
            const y = world[1] * v[i] + world[5] * v[i + 1] + world[9] * v[i + 2] + world[13];
            const z = world[2] * v[i] + world[6] * v[i + 1] + world[10] * v[i + 2] + world[14];
            triangle[n * 3] = view[0] * x + view[4] * y + view[8] * z + view[12];
            triangle[n * 3 + 1] = view[1] * x + view[5] * y + view[9] * z + view[13];
            triangle[n * 3 + 2] = view[2] * x + view[6] * y + view[10] * z + view[14];
          }
          let count = 0;
          for (let n = 0; n < 3; n++) {
            const a = n * 3, b = ((n + 1) % 3) * 3, aIn = triangle[a + 2] <= -near, bIn = triangle[b + 2] <= -near;
            if (aIn) {
              clipped[count++] = triangle[a]; clipped[count++] = triangle[a + 1]; clipped[count++] = triangle[a + 2];
            }
            if (aIn !== bIn) {
              const t = (-near - triangle[a + 2]) / (triangle[b + 2] - triangle[a + 2]);
              clipped[count++] = triangle[a] + (triangle[b] - triangle[a]) * t;
              clipped[count++] = triangle[a + 1] + (triangle[b + 1] - triangle[a + 1]) * t;
              clipped[count++] = -near;
            }
          }
          if (count < 9) continue;
          maskCtx.beginPath();
          for (let n = 0; n < count; n += 3) {
            const x = width / 2 - clipped[n] * focal / clipped[n + 2], y = height / 2 + clipped[n + 1] * focal / clipped[n + 2];
            if (n) maskCtx.lineTo(x, y); else maskCtx.moveTo(x, y);
          }
          maskCtx.closePath();
          maskCtx.fill();
          maskCtx.stroke();
          if (clipActor) rasterActorDepth(count);
          state.faces++;
        }
      }
      for (const child of node.children) drawNode(child);
    };
    const draw = (camera, actor, touchesRock, occluded, solidAt, materialAt, guides = null, dt = 1 / 60, contrast = 0, effect = null, actorVisibleAt = null, actorOutsideCover = false) => {
      state.contrast = cueContrast = Math.max(0, Math.min(1, contrast));
      glyphMaterial = effect;
      if (glyphMaterial) glyphTime = glyphMaterial.time;
      else if (cueContrast > 0) glyphTime += Math.max(0, dt);
      state.glyphInterior = false;
      state.insideRock = state.partialRock = false;
      state.rockCoverage = 0;
      state.outlined = false;
      state.faces = 0;
      state.guideLines = 0;
      state.structureFaces = 0;
      state.structureFilled = false;
      state.guideKind = null; state.guideIndex = -1; state.guideBasement = false;
      // The selected-character visibility gate is absolute.
      // Clear structurePhases before the early return so a newly hidden wall eases back in instead of snapping.
      if (guides?.objectsEnabled === false) structurePhases.fill(0);
      const hasStructures = guides?.objectsEnabled !== false && (guides?.structures ? guides.structures.length : guides?.structure?.surfaceActive);
      if (!touchesRock && !occluded && !guides?.count && !guides?.providerCount && !hasStructures) return;
      const w = overlay.clientWidth, h = overlay.clientHeight;
      screenW = w; screenH = h;
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      mat4.lookAt(view, camera.position, camera.target, camera.up || UP);
      if (touchesRock) drawRock(camera, solidAt, materialAt);
      const rockOnly = guides?.rockOnly === true;
      const drawCues = !rockOnly || state.insideRock || state.partialRock;
      // A near-plane rock cut re-enables cues only inside that cut; the clear part of the view stays clean.
      if (rockOnly && drawCues) { ctx.save(); ctx.clip(); }
      if (guides && drawCues) drawStructure(camera, guides, w, h);
      // Guide occlusion is tested per segment against the camera, in open air too, independent of the rock cap.
      if (guides && drawCues && guides.objectsEnabled !== false) drawGuides(camera, guides, dt);
      if (guides?.providerCount && drawCues && guides.objectsEnabled !== false) for (let i = 0; i < guides.ownerCount; i++) {
        const provider = guides.ownerProviders[i];
        if (provider && guides.ownerViews[i] && guides.ownerStates[i] & 2 && guides.ownerAlphas[i] > 0) provider.draw(camera, ctx, guides.ownerAlphas[i], w, h, cueContrast, guides);
      }
      // Fruit can hide the body past the near-plane cap; its body mask handles that, guides stay clipped to the cap.
      if (rockOnly && drawCues && actorOutsideCover) ctx.restore();
      if (actor && occluded && (actorOutsideCover || drawCues && guides?.objectsEnabled !== false)) {
        ensureBuffers(w, h);
        focal = height / 2 / Math.tan(camera.fov / 2);
        near = camera.near;
        maskCtx.clearRect(0, 0, width, height);
        maskCtx.fillStyle = maskCtx.strokeStyle = "#d9c9a9";
        maskCtx.lineWidth = 0.6;
        clipActor = !!actorVisibleAt;
        if (clipActor) {
          if (actorDepth.length !== width * height) actorDepth = new Float32Array(width * height);
          else actorDepth.fill(0);
          if (actorColumns.length !== width) actorColumns = new Int32Array(width);
          actorMinX = width; actorMinY = height; actorMaxX = actorMaxY = -1;
        }
        drawNode(actor);
        rimCtx.clearRect(0, 0, width, height);
        rimCtx.globalCompositeOperation = "source-over";
        const spread = Math.max(1, 1.5 * scale);
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) rimCtx.drawImage(mask, x * spread, y * spread);
        rimCtx.globalCompositeOperation = "destination-out";
        rimCtx.drawImage(mask, 0, 0);
        if (clipActor) { maskVisibleActor(camera, actorVisibleAt, spread); rimCtx.drawImage(visible, 0, 0); }
        drawCueRim(ctx, rim, state.opacity, w, h, clipActor ? visible : null, Math.min(1, state.opacity / 0.22));
        state.outlined = state.faces > 0;
      }
      if (rockOnly && drawCues && !actorOutsideCover) ctx.restore();
      ctx.restore();
    };
    const dispose = () => {
      mask.width = mask.height = rim.width = rim.height = stone.width = stone.height = concealed.width = concealed.height = concealedRim.width = concealedRim.height = visible.width = visible.height = apertureMask.width = apertureMask.height = wallLayer.width = wallLayer.height = 1;
      wallContexts.fill(null); wallCached = false; state.glyphInterior = false;
      glyphMaterial = textureMaterial = null;
      actorDepth = new Float32Array(0); actorColumns = new Int32Array(0); clipActor = false;
    };
    return { draw, dispose, state };
  };
  BL.cameraCover = { create };
})();
