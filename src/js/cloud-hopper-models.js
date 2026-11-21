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
  // Power-up pickups (plan 3, the chosen B set), each round its own middle at pickup size: carved stone goggles with
  // glowing lenses (X-ray), a sky feather in a wind ring (Updraft), and a grappling hook on a coil of vine rope. A modest
  // fill keeps them readable at night and in the storm, as the jetpack's.
  const POWERS = ["xray", "updraft", "hook"];
  // The grappling hook, flying shank first along +z: a bone shank, the rope's eye behind it, and three iron prongs
  // curling forward and back at its head, lashed on with vine.
  const hookHead = M.cached(() => {
    const parts = [M.turnedX(M.lathe({ profile: [[0.045, -0.4], [0.06, -0.3], [0.05, 0.05], [0.075, 0.12], [0, 0.2]], segments: 8, color: "#efe6cf" }), Math.PI / 2),
      M.moved(M.turnedX(M.torus(0.07, 0.02, "#6b4a2b", 0, 10, 5), Math.PI / 2), 0, 0, -0.46)];
    for (let k = 0; k < 3; k++) {
      const prong = M.tube({ path: (t) => { const a = t * 2.3; return { x: 0.18 - 0.18 * Math.cos(a), y: 0, z: 0.1 + 0.18 * Math.sin(a) }; },
        radius: (t) => 0.036 - 0.022 * t, rings: 10, segments: 6, colorFn: () => "#9a8f80" });
      parts.push(M.turnedZ(prong, k * Math.PI * 2 / 3));
    }
    for (let k = 0; k < 3; k++) parts.push(M.box({ w: 0.15, h: 0.15, d: 0.035, color: "#4f8a35", offset: { z: -0.22 + k * 0.07 } }));
    const geometry = M.merge(...parts);
    for (const face of geometry.faces) face.emissive = Math.max(face.emissive || 0, 0.22);
    geometry.castShadow = false;
    return geometry;
  });
  // The hook's rope, one unit down +z, its length the node's z scale.
  const rope = M.cached(() => {
    const geometry = M.box({ w: 0.08, h: 0.08, d: 1, color: "#8a7040", emissive: 0.35, offset: { z: 0.5 } });
    geometry.castShadow = false;
    return geometry;
  });
  const facing = (geo) => M.turnedX(geo, Math.PI / 2);
  // X-ray's carved stone goggles (the chosen C): chunky stone rims notched with glowing runes round dark glowing lenses
  // with scanning rings, bridged in stone, and a leather strap. `R` is a lens's radius and `gap` the lenses' half
  // spacing, their plane at z 0 facing +z; the strap runs from each rim's outer edge out to ±`side` and round behind to
  // `back` behind that plane, squared off by `square` (0 round, nearer 1 hugging a box), never across the lenses.
  const goggles = (R, gap, side, back, square) => {
    const parts = [], tube = 0.05 * R / 0.17;
    for (const s of [-1, 1]) {
      const x = s * gap;
      parts.push(M.moved(facing(M.torus(R, tube * 1.35, "#8f8a82", 0, 8, 4)), x, 0, 0));
      parts.push(M.moved(facing(M.lathe({ profile: [[R * 0.85, 0], [0, R * 0.08]], segments: 16, color: "#1d5f6a", emissive: 0.5 })), x, 0, tube * 0.2));
      for (const r of [0.55, 0.3]) parts.push(M.moved(facing(M.torus(R * r, tube * 0.18, "#7ffcff", 1, 16, 4)), x, 0, tube * 0.35));
      for (const a of [0.8, 2.35, 3.9, 5.5]) parts.push(M.box({ w: tube * 0.5, h: tube * 1.1, d: tube * 0.4, color: "#7ffcff", emissive: 1,
        offset: { x: x + Math.cos(a) * R, y: Math.sin(a) * R, z: tube * 1.2 } }));
    }
    parts.push(M.box({ w: gap * 2 - R * 2 + tube, h: tube * 1.2, d: tube, color: "#8f8a82", offset: { y: R * 0.25 } }));
    const edge = gap + R + tube * 0.5, band = tube * 0.9, bend = 1 - square;
    const path = (t) => {
      const c = Math.cos(Math.PI * t), sn = Math.sin(Math.PI * t);
      return { x: -side * Math.sign(c) * Math.abs(c) ** bend, y: 0, z: -tube - (back - tube) * sn ** bend };
    };
    parts.push(M.tube({ path, radius: () => band, rings: 24, segments: 5, colorFn: () => "#5a4a3a" }));
    for (const s of [-1, 1]) if (side > edge) parts.push(M.box({ w: side - edge, h: band * 2, d: band * 2, color: "#5a4a3a", offset: { x: s * (edge + side) / 2, z: -tube } }));
    return M.merge(...parts);
  };
  // The goggles worn over an Ooga's eyes on its face anchor (fractions of its height), the lenses just in front of its
  // face and the strap round the back of its head, one geometry for each size of head.
  const wornGeometry = new Map();
  const wornGoggles = (cave) => {
    const h = cave.parts.face.scale.x, b = boundsOf(cave.parts.head.geometry);
    const z = b.max[2] / h + 0.03, side = Math.max(-b.min[0], b.max[0]) / h + 0.02, back = z - b.min[2] / h + 0.02, key = side.toFixed(3) + ":" + back.toFixed(3);
    let geometry = wornGeometry.get(key);
    if (!geometry) {
      geometry = goggles(0.08, 0.125, side, back, 0.7);
      geometry.castShadow = false;
      wornGeometry.set(key, geometry = M.characterGeometry(geometry));
    }
    return createNode({ geometry, position: { x: 0, y: 0.16, z } });
  };
  const powerBody = M.variants((i) => {
    let geometry;
    if (POWERS[i] === "xray") {
      geometry = goggles(0.17, 0.21, 0.42, 0.32, 0);
    } else if (POWERS[i] === "updraft") {
      const parts = [M.box({ w: 0.035, h: 0.95, d: 0.035, color: "#e9e2cf" }), M.moved(M.turnedZ(M.torus(0.42, 0.016, "#f4fbff", 0.7, 22, 4), -0.3), 0, 0.05, 0)];
      for (let k = 0; k < 9; k++) {
        const y = -0.3 + k * 0.085, w = 0.24 * Math.sin(Math.PI * (k + 0.6) / 9.6), tip = k > 6;
        const color = tip ? "#3fd0c6" : k % 2 ? "#f6f4ee" : "#e4e9ef";
        parts.push(M.box({ w, h: 0.07, d: 0.02, color, emissive: tip ? 0.4 : 0.1, offset: { x: -w / 2 - 0.015, y: y + 0.012 } }));
        parts.push(M.box({ w, h: 0.07, d: 0.02, color, emissive: tip ? 0.4 : 0.1, offset: { x: w / 2 + 0.015, y } }));
      }
      geometry = M.turnedZ(M.merge(...parts), 0.25);
    } else {
      // The hook standing prongs up on two coils of its rope.
      geometry = M.merge(M.moved(M.turnedX(M.merge(hookHead()), -Math.PI / 2), 0, 0.12, 0),
        M.moved(M.torus(0.3, 0.04, "#8a7040", 0, 18, 6), 0, -0.3, 0), M.moved(M.torus(0.26, 0.04, "#7a6236", 0, 18, 6), 0.03, -0.24, 0.02));
    }
    for (const face of geometry.faces) face.emissive = Math.max(face.emissive || 0, 0.22);
    geometry.castShadow = false;
    return M.characterGeometry(geometry);
  });
  // Each pickup's glow in its own tint: the jetpack's blue, X-ray's cyan, the feather's mint, the hook's gold.
  const AURAS = [["220,246,255", "142,216,255", "108,190,255"], ["205,255,255", "90,232,255", "40,200,255"],
    ["228,255,238", "150,240,192", "100,220,160"], ["255,246,214", "255,214,120", "240,180,60"]];
  const pickupAura = M.variants((tint) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const paint = canvas.getContext("2d"), gradient = paint.createRadialGradient(64, 64, 0, 64, 64, 64), [inner, middle, outer] = AURAS[tint];
    gradient.addColorStop(0, `rgba(${inner},0.8)`);
    gradient.addColorStop(0.35, `rgba(${middle},0.4)`);
    gradient.addColorStop(1, `rgba(${outer},0)`);
    paint.fillStyle = gradient; paint.fillRect(0, 0, 128, 128);
    const image = new Image();
    image.src = canvas.toDataURL("image/png");
    const geometry = M.panel({ tilesX: 1, tilesY: 1, color: "#000000" });
    geometry.castShadow = false; geometry.cutawayPreserve = true;
    geometry.imageSurface = { asset: { width: 128, height: 128, load: () => image },
      rect: [-0.5, -0.5, 1, 1], cutout: true, soft: true, blend: "add", bright: 0.2 };
    return geometry;
  });
  // A floating pickup of `kind` (a jetpack, or a power-up), turning in its own glow.
  const pickup = (kind = "jetpack") => {
    const tint = kind === "jetpack" ? 0 : 1 + POWERS.indexOf(kind);
    const node = createNode({ scale: { x: 1.6, y: 1.6, z: 1.6 }, sightHidden: true });
    node.body = createNode({ geometry: tint ? powerBody(tint - 1) : pickupBody(), sightHidden: true });
    node.bodyBounds = boundsOf(node.body.geometry);
    node.aura = createNode({ geometry: pickupAura(tint),
      scale: { x: 1.35, y: 1.6, z: 1 }, smokeOpacity: 0.22, sightHidden: true });
    node.pool = createNode({ geometry: pickupAura(tint), position: { x: 0, y: -0.18, z: 0 },
      rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: 1.25, y: 1.25, z: 1 }, smokeOpacity: 0.3, sightHidden: true });
    addChild(node, node.body, node.aura, node.pool);
    return node;
  };
  // `haze` is the level's fog [near, far] when it has one, which the glow fades into with distance as the body does,
  // since a blended picture takes no fog of its own.
  const updateJetpackPickup = (node, camera, time, haze = null) => {
    node.body.rotation.y = time;
    const bounds = node.bodyBounds, center = bounds.center, c = Math.cos(time), s = Math.sin(time);
    const x = c * center[0] + s * center[2], y = center[1], z = c * center[2] - s * center[0];
    let dx = camera.position.x - node.position.x - x * node.scale.x;
    let dy = camera.position.y - node.position.y - y * node.scale.y;
    let dz = camera.position.z - node.position.z - z * node.scale.z;
    let distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) { dx = dy = 0; dz = distance = 1; }
    // Only the surrounding light breathes; the metal's fill stays steady.
    const t = haze ? Math.max(0, Math.min(1, (distance - haze[0]) / (haze[1] - haze[0]))) : 0;
    const glow = (0.92 + Math.sin(time * 2.4) * 0.08) * (1 - t * t * (3 - 2 * t));
    node.aura.smokeOpacity = 0.22 * glow; node.pool.smokeOpacity = 0.3 * glow;
    // Put the whole billboard behind the rotating pack's bounds. A plane
    // through the tanks depth-clips into a pale band across their faces.
    const back = (bounds.radius + 0.08) / distance;
    node.aura.position.x = x - dx * back;
    node.aura.position.y = y - dy * back;
    node.aura.position.z = z - dz * back;
    node.aura.rotation.y = Math.atan2(dx, dz);
    node.aura.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
  };
  // A leaf for the sky feather's gust.
  const leaf = M.cached(() => {
    const geometry = M.merge(M.box({ w: 0.24, h: 0.03, d: 0.12, color: "#79d46b", emissive: 0.3 }), M.box({ w: 0.12, h: 0.032, d: 0.06, color: "#a6e88f", emissive: 0.3, offset: { x: 0.04 } }));
    geometry.castShadow = false;
    return geometry;
  });
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
  // The gust card's wind: strokes blowing across over a cloud, each a straight run [x0, x1] at [y, z] that ends in a
  // curl of `r` turning up (1) or down (-1), drawn as short glowing bars.
  const GUST_STROKES = [[-3.4, 1.2, 1.25, 0.7, 0.45, 1], [-2.8, 1.9, 0.55, -0.3, 0.38, -1], [-2.2, 0.6, 1.95, -0.8, 0.32, 1],
    [-3.8, -2.6, 0.85, 1.1, 0, 0], [2.6, 3.6, 1.55, 0.1, 0, 0], [-1, 0.2, 2.45, 0.3, 0, 0]];
  const gustStrokes = () => {
    const parts = [], bar = (x0, y0, x1, y1, z) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      parts.push(M.moved(M.turnedZ(M.box({ w: length + 0.08, h: 0.09, d: 0.09, color: "#dff4ff", emissive: 0.7 }), Math.atan2(y1 - y0, x1 - x0)),
        (x0 + x1) / 2, (y0 + y1) / 2, z));
    };
    for (const [x0, x1, y, z, r, turn] of GUST_STROKES) {
      bar(x0, y, x1, y, z);
      if (!r) continue;
      // Round from the run's end about a centre r above (or below) it, three quarters of a turn, tightening.
      let px = x1, py = y;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12, angle = -Math.PI / 2 + t * Math.PI * 1.5, radius = r * (1 - 0.4 * t);
        const x = x1 + Math.cos(angle) * radius, yy = y + turn * (r + Math.sin(angle) * radius);
        bar(px, py, x, yy, z); px = x; py = yy;
      }
    }
    return M.noShadow(M.merge(...parts));
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
      } else if (kind === "tornado") {
        addChild(root, BL.cloudHopperTornado.still());
      } else if (kind === "gust") {
        addChild(root, cloud(2.7, 1.9, 1.6), createNode({ geometry: gustStrokes() }));
      } else if (kind === "jetpack") {
        addChild(root, cloud(0.48, 0.32, 0.22), createNode({ geometry: BL.hubModels.jetpack(), position: { x: 0, y: 0.18, z: 0 } }));
      } else if (POWERS.includes(kind)) {
        addChild(root, cloud(0.48, 0.32, 0.22), createNode({ geometry: powerBody(POWERS.indexOf(kind)), position: { x: 0, y: 0.32, z: 0 },
          rotation: { x: 0, y: 0.4, z: 0 }, scale: { x: 0.5, y: 0.5, z: 0.5 } }));
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
  BL.cloudHopperModels = { cloud, cloudMesh, boostSurface, updateBoostSurface, bounceMarker, updateBounceMarker, pickup, jetpackPickup: () => pickup("jetpack"),
    updateJetpackPickup, hookHead, rope, leaf, wornGoggles, cabinet, updateCabinet, createGuidePictures };
})();
