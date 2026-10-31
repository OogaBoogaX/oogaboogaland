// Cloud Hopper reuses the island's voxel clouds and Ooga Arcade's carved cabinet kit.
// Each cloud node's highest puff is at local y=0 and its base at -depth.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, boundsOf } = BL.scene;
  const M = BL.models, BOOST_FRAMES = 12, BOOST_FPS = 18;
  const BOUNCE_SPOTS = [0, 0, -0.45, -0.35, 0.45, -0.35, -0.45, 0.35, 0.45, 0.35];
  const pickupBody = M.cached(() => {
    const geometry = M.merge(BL.hubModels.jetpack());
    // A modest fill keeps the metal readable at night while most lighting
    // and voxel shading remain intact. Worn packs keep their shared material.
    for (const face of geometry.faces) face.emissive = 0.28;
    return M.characterGeometry(geometry);
  });
  const pickupAura = M.cached(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const paint = canvas.getContext("2d"), gradient = paint.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(220,246,255,0.8)");
    gradient.addColorStop(0.35, "rgba(142,216,255,0.4)");
    gradient.addColorStop(1, "rgba(108,190,255,0)");
    paint.fillStyle = gradient; paint.fillRect(0, 0, 128, 128);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geometry = M.panel({ tilesX: 1, tilesY: 1, color: "#000000" });
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    geometry.imageSurface = { asset: { width: 128, height: 128, load: () => image },
      rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright: 0.2 };
    return geometry;
  });
  const jetpackPickup = () => {
    const node = createNode({ scale: { x: 1.6, y: 1.6, z: 1.6 }, sightHidden: true });
    node.body = createNode({ geometry: pickupBody(), sightHidden: true });
    node.bodyBounds = boundsOf(node.body.geometry);
    node.aura = createNode({ geometry: pickupAura(),
      scale: { x: 1.35, y: 1.6, z: 1 }, smokeOpacity: 0.22, sightHidden: true });
    node.pool = createNode({ geometry: pickupAura(), position: { x: 0, y: -0.18, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.25, y: 1.25, z: 1 }, smokeOpacity: 0.3, sightHidden: true });
    addChild(node, node.body, node.aura, node.pool);
    return node;
  };
  const updateJetpackPickup = (node, camera, time) => {
    const pulse = 0.92 + Math.sin(time * 2.4) * 0.08;
    node.body.rotation.y = time;
    // Only the surrounding light breathes; the metal's fill stays steady.
    node.aura.smokeOpacity = 0.22 * pulse; node.pool.smokeOpacity = 0.3 * pulse;
    const bounds = node.bodyBounds, center = bounds.center, c = Math.cos(time), s = Math.sin(time);
    const x = c * center[0] + s * center[2], y = center[1], z = c * center[2] - s * center[0];
    let dx = camera.position.x - node.position.x - x * node.scale.x;
    let dy = camera.position.y - node.position.y - y * node.scale.y;
    let dz = camera.position.z - node.position.z - z * node.scale.z;
    let distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) { dx = dy = 0; dz = distance = 1; }
    // Put the whole billboard behind the rotating pack's bounds. A plane
    // through the tanks depth-clips into a pale band across their faces.
    const back = (bounds.radius + 0.08) / distance;
    node.aura.position.x = x - dx * back;
    node.aura.position.y = y - dy * back;
    node.aura.position.z = z - dz * back;
    node.aura.rotation.y = Math.atan2(dx, dz);
    node.aura.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
  };
  const bounceCloud = M.variants((index) => {
    // Copy through the model builder so packed clouds stay immutable too.
    // Voxel detail is a spatial grid; face colours hold its two cloud tones.
    const geometry = M.merge(BL.hubModels.cloud(index));
    const light = BL.math.hexToRgb("#cf9fff"), shade = BL.math.hexToRgb("#9970d6");
    for (const face of geometry.faces) face.color = face.color[0] > 235 ? light : shade;
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    return geometry;
  });
  const boostCloud = M.variants((index) => {
    const geometry = M.merge(BL.hubModels.cloud(index));
    const light = BL.math.hexToRgb("#e923ad"), shade = BL.math.hexToRgb("#b91b84");
    for (const face of geometry.faces) { face.color = face.color[0] > 235 ? light : shade; face.emissive = 0.2; }
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    return geometry;
  });
  // A night level's clouds (its sky's `night`): each kind's mesh with a soft fill, so landings read under the moon.
  const NIGHT_FILL = 0.34;
  const night = (source) => M.variants((index) => {
    const geometry = M.merge(source(index));
    for (const face of geometry.faces) face.emissive = Math.max(face.emissive || 0, NIGHT_FILL);
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    return geometry;
  });
  const nightCloud = night(BL.hubModels.cloud), nightBounce = night(bounceCloud), nightBoost = night(boostCloud);
  const cloudMesh = (index, kind = "normal", dark = false) => kind === "bounce" ? (dark ? nightBounce : bounceCloud)(index)
    : kind === "boost" ? (dark ? nightBoost : boostCloud)(index) : (dark ? nightCloud : BL.hubModels.cloud)(index);
  const cloud = (rx, rz, depth, kind = "normal", yaw = 0, dark = false) => {
    const across = rz > rx, aspect = Math.max(rx, rz) / Math.min(rx, rz);
    const index = aspect < 1.35 ? 0 : aspect < 1.85 ? 1 : 2;
    const geometry = cloudMesh(index, kind, dark);
    const b = boundsOf(geometry), sx = (across ? rz : rx) * 2 / (b.max[0] - b.min[0]);
    const sy = depth / (b.max[1] - b.min[1]), sz = (across ? rx : rz) * 2 / (b.max[2] - b.min[2]);
    const x = -(b.min[0] + b.max[0]) * sx * 0.5, z = -(b.min[2] + b.max[2]) * sz * 0.5;
    const px = across ? z : x, pz = across ? -x : z, c = Math.cos(yaw), s = Math.sin(yaw);
    // Scale the node so the shared mesh and its voxel-detail grid stay untouched.
    // Rotate the centring offset too, keeping each cloud over its support centre.
    return createNode({ geometry, position: { x: c * px + s * pz, y: -b.max[1] * sy, z: c * pz - s * px },
      rotation: { x: 0, y: yaw + (across ? Math.PI / 2 : 0), z: 0 }, scale: { x: sx, y: sy, z: sz }, matrixCloud: true, sightHidden: true });
  };
  const boostTexture = M.cached(() => {
    const frames = [], size = 192, period = 24;
    for (let frame = 0; frame < BOOST_FRAMES; frame++) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const paint = canvas.getContext("2d");
      paint.fillStyle = "#e923ad"; paint.fillRect(0, 0, size, size);
      paint.fillStyle = "#ffffff";
      // A tiled field of pixel chevrons flows toward local +Y (up the image).
      // The cloud's own top faces clip it to every puff and ragged edge.
      for (let row = -1; row <= size / period + 1; row++) for (let x = 0; x < size; x += 3) {
        const across = (x + period) % (period * 2) - period;
        const y = row * period - frame / BOOST_FRAMES * period + Math.abs(across) * 0.55;
        paint.fillRect(x, Math.round(y), 3, 4);
      }
      frames.push(canvas);
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const paint = canvas.getContext("2d");
    paint.drawImage(frames[0], 0, 0);
    return { frames, frame: 0, paint, surface: { canvas, version: 0, rect: [-6, -6, 12, 12], tessellated: true } };
  });
  const boostSurface = (cloud, body) => {
    // Build once from the actual voxel tops, before the body's world position
    // is added. The texture frame faces the launch direction while the cloud
    // itself is free to rotate. All stepped heights and gaps stay intact.
    const source = M.merge(body.geometry), geometry = M.geometry(), v = source.verts;
    const c = Math.cos(body.rotation.y), s = Math.sin(body.rotation.y), white = [255, 255, 255];
    for (const face of source.faces) {
      const a = face.i[0] * 3, b = face.i[1] * 3, d = face.i[2] * 3;
      const ny = (v[b + 2] - v[a + 2]) * (v[d] - v[a]) - (v[b] - v[a]) * (v[d + 2] - v[a + 2]);
      if (ny <= 0) continue;
      const indices = [];
      for (const index of face.i) {
        const at = index * 3, x = v[at] * body.scale.x, z = v[at + 2] * body.scale.z;
        const wx = c * x + s * z + body.position.x, wz = c * z - s * x + body.position.z;
        const height = v[at + 1] * body.scale.y + body.position.y;
        indices.push(M.pushVert(geometry, wx * cloud.boostZ - wz * cloud.boostX,
          wx * cloud.boostX + wz * cloud.boostZ, -height));
      }
      M.face(geometry, indices, white, { emissive: 0.65 });
    }
    const animation = boostTexture();
    geometry.imageSurface = animation.surface;
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    const node = createNode({ geometry, rotation: { x: Math.PI / 2, y: Math.atan2(cloud.boostX, cloud.boostZ), z: 0 }, sightHidden: true });
    node.animation = animation;
    return node;
  };
  const updateBoostSurface = (node, time) => {
    const animation = node.animation, frame = Math.floor(time * BOOST_FPS) % BOOST_FRAMES;
    if (frame === animation.frame) return;
    animation.paint.drawImage(animation.frames[frame], 0, 0);
    animation.frame = frame; animation.surface.version++;
  };
  const bounceMarkerGeometry = M.cached(() => {
    const spring = M.tube({
      path: t => ({ x: Math.cos(t * Math.PI * 6) * 0.38, y: t, z: Math.sin(t * Math.PI * 6) * 0.38 }),
      radius: () => 0.055, rings: 30, segments: 4, colorFn: () => "#f2dcff", emissive: 0.3
    });
    // Crossed pixel chevrons keep the upward cue readable from every side.
    const parts = [M.box({ w: 0.2, h: 0.2, d: 0.2, color: "#fff9d9", emissive: 0.4, offset: { y: 0.6 } })];
    for (let i = 1; i <= 3; i++) for (const side of [-1, 1]) {
      parts.push(M.box({ w: 0.2, h: 0.2, d: 0.2, color: "#fff9d9", emissive: 0.4, offset: { x: i * side * 0.18, y: 0.6 - i * 0.18 } }),
        M.box({ w: 0.2, h: 0.2, d: 0.2, color: "#fff9d9", emissive: 0.4, offset: { y: 0.6 - i * 0.18, z: i * side * 0.18 } }));
    }
    const geometries = [spring, M.merge(...parts), M.ring({ r: 0.56, thickness: 0.045, segments: 12, color: "#dfb3ff", emissive: 0.2 })];
    for (const geometry of geometries) { geometry.castShadow = false; geometry.cutawayPreserve = true; }
    return geometries;
  });
  const bounceMarker = () => {
    const node = createNode({ scale: { x: 0.55, y: 0.55, z: 0.55 }, sightHidden: true });
    const geometries = bounceMarkerGeometry();
    // Five small cues share the same meshes; flat children keep their geometry
    // lifetime and fading on the existing course path.
    for (let i = 0; i < BOUNCE_SPOTS.length; i += 2) {
      for (const geometry of geometries) addChild(node, createNode({ geometry, sightHidden: true }));
    }
    return node;
  };
  const updateBounceMarker = (node, cloud, time) => {
    node.position.x = cloud.x; node.position.y = cloud.top + 0.15; node.position.z = cloud.z;
    node.rotation.y = cloud.yaw; node.visible = cloud.active;
    for (let i = 0; i < BOUNCE_SPOTS.length / 2; i++) {
      const phase = (time / 2.2 + cloud.seed / 4294967296 + i * 0.19) % 1, bounce = 4 * phase * (1 - phase);
      const spring = node.children[i * 3], arrow = node.children[i * 3 + 1], ring = node.children[i * 3 + 2];
      const height = 0.22 + bounce * 0.45;
      // Spread in cloud metres while keeping each animation at its subtle
      // original scale. The parent turns every position with the cloud.
      spring.position.x = arrow.position.x = ring.position.x = BOUNCE_SPOTS[i * 2] * cloud.rx / node.scale.x;
      spring.position.z = arrow.position.z = ring.position.z = BOUNCE_SPOTS[i * 2 + 1] * cloud.rz / node.scale.z;
      spring.scale.y = height; spring.scale.x = spring.scale.z = 1.15 - bounce * 0.15;
      arrow.position.y = height + 0.12; arrow.scale.y = 0.7 + bounce * 0.35;
      arrow.scale.x = arrow.scale.z = 1.1 - bounce * 0.1;
      ring.scale.x = ring.scale.z = 1.25 - bounce * 0.25;
      spring.smokeOpacity = arrow.smokeOpacity = ring.smokeOpacity = cloud.opacity * 0.75;
    }
  };
  const cabinet = () => {
    const A = BL.arcadeModels, node = createNode({ geometry: A.cloudHopperCabinet() });
    const frames = A.cloudHopperFrames(), screen = createNode({ geometry: frames[0], depthBias: -0.1,
      position: { x: 0, y: A.SCREEN.y, z: A.SCREEN.z }, rotation: { x: A.SCREEN.lean, y: 0, z: 0 } });
    const sign = BL.hubModels.caveSign(A.CLOUD_HOPPER.title, A.CLOUD_HOPPER.icon), bounds = boundsOf(sign);
    const scale = A.MARQUEE.w / (bounds.max[0] - bounds.min[0]);
    addChild(node, screen, createNode({ geometry: sign, position: { x: 0, y: A.MARQUEE.y, z: A.MARQUEE.z },
      scale: { x: scale, y: scale, z: scale } }));
    node.screen = screen; node.frames = frames;
    return node;
  };
  const updateCabinet = (node, time) => {
    const geometry = node.frames[Math.floor(time * BL.arcadeModels.FPS) % node.frames.length];
    if (node.screen.geometry !== geometry) node.screen.geometry = geometry;
  };
  // The first-play cards use the same transparent model portraits as Ghost
  // Hunter. Build and draw each once when requested, without a second frame loop.
  const createGuidePictures = () => {
    const pictures = new Map(), width = 320, height = 220;
    let canvas = null, renderer = null, disposed = false;
    const guideBoost = (body) => {
      // Portraits have no texture pass. Clip the same repeating pixel chevrons
      // as boostTexture to each unrotated cloud top, including its lower puffs.
      const source = M.merge(body.geometry), v = source.verts, geometry = M.geometry(), sides = [];
      for (const face of source.faces) {
        const a = face.i[0] * 3, b = face.i[1] * 3, d = face.i[2] * 3;
        if ((v[b + 2] - v[a + 2]) * (v[d] - v[a]) - (v[b] - v[a]) * (v[d + 2] - v[a + 2]) <= 0) { sides.push(face); continue; }
        let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
        for (const index of face.i) {
          const x = v[index * 3] * body.scale.x + body.position.x, z = v[index * 3 + 2] * body.scale.z + body.position.z;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        const y = v[a + 1] * body.scale.y + body.position.y;
        for (let px = Math.floor((minX + 6) * 16 / 3) * 3; px < (maxX + 6) * 16; px += 3) {
          const x0 = Math.max(minX, px / 16 - 6), x1 = Math.min(maxX, (px + 3) / 16 - 6);
          const bend = Math.abs((px + 24) % 48 - 24) * 0.55;
          const tile = (z0, z1, white) => {
            if (z1 <= z0) return;
            M.face(geometry, [M.pushVert(geometry, x0, y, z0), M.pushVert(geometry, x0, y, z1),
              M.pushVert(geometry, x1, y, z1), M.pushVert(geometry, x1, y, z0)], white ? [255, 255, 255] : face.color,
            { emissive: white ? 0.65 : face.emissive });
          };
          let filled = minZ;
          for (let row = -1; row <= 9; row++) {
            const z = Math.round(row * 24 + bend) / 16 - 6, z0 = Math.max(minZ, z), z1 = Math.min(maxZ, z + 0.25);
            if (z1 <= z0) continue;
            tile(filled, z0, false); tile(z0, z1, true); filled = z1;
          }
          tile(filled, maxZ, false);
        }
      }
      // Replace these faces instead of layering over them: the portrait's
      // painter ordering cannot depth-test a patterned face over a larger one.
      source.faces = sides; body.geometry = source;
      return createNode({ geometry });
    };
    const build = (kind) => {
      const root = createNode({ rotation: { x: 0, y: -0.4, z: 0 } });
      if (kind === "normal" || kind === "boost" || kind === "bounce") {
        const body = cloud(2.7, 1.9, 1.6, kind);
        addChild(root, body);
        if (kind === "boost") addChild(root, guideBoost(body));
        else if (kind === "bounce") {
          const marker = bounceMarker();
          updateBounceMarker(marker, { x: 0, z: 0, top: 0, rx: 2.7, rz: 1.9, yaw: 0, seed: 0, active: true, opacity: 1 }, 0.6);
          addChild(root, marker);
        }
      } else if (kind === "jetpack") {
        addChild(root, cloud(0.48, 0.32, 0.22), createNode({ geometry: BL.hubModels.jetpack(), position: { x: 0, y: 0.18, z: 0 } }));
      }
      else if (kind === "finish") {
        // Snapshot the actual 1,000-banana mound without touching the live pile.
        // Portraits have no instancing pass, so bake each shell tile once here.
        const pile = BL.pile.create({ root: createNode(), world: { level: 1000 }, pileScale: 0.45, pileY: 0.36,
          renderer: { kind: "webgl2", releaseGeometry() {} } });
        try {
          const { core, shell } = pile, point = new Float64Array(3);
          addChild(root, createNode({ geometry: core.geometry, position: { ...core.position }, scale: { ...core.scale } }));
          for (let i = 0; i < shell.instanceCount; i++) {
            const geometry = M.merge(shell.geometry), v = geometry.verts, matrix = shell.instanceData.subarray(i * 20, i * 20 + 16);
            for (let at = 0; at < v.length; at += 3) {
              BL.math.mat4.transformPoint(point, matrix, v[at], v[at + 1], v[at + 2]);
              v[at] = point[0]; v[at + 1] = point[1]; v[at + 2] = point[2];
            }
            addChild(root, createNode({ geometry }));
          }
          // Match the mainland's stone platform and its close-fitting rim.
          const outer = pile.footprintEdge + 0.12, count = Math.max(8, Math.round(outer * Math.PI * 2 / 0.3));
          const arc = outer * Math.PI * 2 / count * 0.88;
          addChild(root, createNode({ geometry: BL.hubModels.altarSlab(), scale: { x: outer - 0.1, y: 0.34, z: outer - 0.1 } }));
          for (let i = 0; i < count; i++) {
            const angle = i * Math.PI * 2 / count;
            addChild(root, createNode({ geometry: BL.hubModels.altarBlock(i % 3),
              position: { x: Math.cos(angle) * outer, y: 0, z: Math.sin(angle) * outer },
              rotation: { x: 0, y: -angle, z: 0 }, scale: { x: 0.2, y: 0.34, z: arc } }));
          }
        } finally { pile.dispose(); }
      } else return null;
      return root;
    };
    const picture = (kind) => {
      if (disposed) return null;
      if (pictures.has(kind)) return pictures.get(kind);
      const root = build(kind);
      if (!root) return null;
      if (!renderer) {
        canvas = document.createElement("canvas");
        renderer = BL.iconRenderer.createRenderer(canvas, { width, height });
      }
      const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], point = new Float64Array(3);
      BL.scene.updateWorld(root);
      BL.scene.traverseVisible(root, node => {
        if (!node.geometry) return;
        const b = boundsOf(node.geometry);
        for (let i = 0; i < 8; i++) {
          BL.math.mat4.transformPoint(point, node.world, (i & 1 ? b.max : b.min)[0], (i & 2 ? b.max : b.min)[1], (i & 4 ? b.max : b.min)[2]);
          for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis], point[axis]); high[axis] = Math.max(high[axis], point[axis]); }
        }
      });
      const camera = BL.scene.createCamera({ fov: 28, near: 0.01, far: 100 });
      camera.target.x = (low[0] + high[0]) / 2; camera.target.y = (low[1] + high[1]) / 2; camera.target.z = (low[2] + high[2]) / 2;
      const sine = Math.sin(0.48), cosine = Math.cos(0.48), tangent = Math.tan(camera.fov / 2);
      let distance = 0;
      for (let i = 0; i < 8; i++) {
        const x = (i & 1 ? high : low)[0] - camera.target.x, y = (i & 2 ? high : low)[1] - camera.target.y;
        const z = (i & 4 ? high : low)[2] - camera.target.z, depth = y * sine + z * cosine;
        distance = Math.max(distance, depth + Math.max(Math.abs(x) / (tangent * width / height), Math.abs(y * cosine - z * sine) / tangent));
      }
      distance *= 1.12;
      camera.position.x = camera.target.x; camera.position.y = camera.target.y + sine * distance; camera.position.z = camera.target.z + cosine * distance;
      renderer.render(root, camera);
      const result = document.createElement("canvas");
      result.width = canvas.width; result.height = canvas.height;
      result.getContext("2d").drawImage(canvas, 0, 0);
      pictures.set(kind, result);
      return result;
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (renderer) renderer.dispose();
      if (canvas) canvas.width = canvas.height = 1;
      for (const picture of pictures.values()) picture.width = picture.height = 1;
      pictures.clear(); renderer = canvas = null;
    };
    return { picture, dispose };
  };
  BL.cloudHopperModels = { cloud, cloudMesh, boostSurface, updateBoostSurface, bounceMarker, updateBounceMarker, jetpackPickup, updateJetpackPickup, cabinet, updateCabinet, createGuidePictures };
})();
