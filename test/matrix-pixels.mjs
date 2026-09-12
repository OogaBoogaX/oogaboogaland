// Browser-side photometry: compare the real voxel mesh and surface shader through
// the same renderer, projection, framebuffer, bloom pass and final color output.
// No production shader flags or reported "parity" booleans participate in this test.
export const matrixPixelProbe = async (backend = "webgl2", interpolation = true) => {
  const BL = window.BL, S = BL.scene, size = 384;
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: size }, clientHeight: { value: size } });
  if (backend === "canvas2d") canvas.getContext("2d", { willReadFrequently: true });
  if (backend === "webgl2" && !interpolation) {
    const context = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" }), getExtension = context.getExtension.bind(context);
    context.getExtension = (name) => name === "OES_shader_multisample_interpolation" ? null : getExtension(name);
  }
  const renderer = (backend === "webgl2" ? BL.glRenderer : BL.canvasRenderer).createRenderer(canvas, { quality: "high" });
  const gl = backend === "webgl2" ? canvas.getContext("webgl2") : null, ctx = gl ? null : canvas.getContext("2d"), camera = S.createCamera({ near: 0.01, far: 100 });
  const root = S.createNode(), originals = S.createNode(), panel = S.createNode({
    geometry: { verts: [-0.96, -1.3, 0, 0.96, -1.3, 0, 0.96, 1.3, 0, -0.96, 1.3, 0], faces: [{ i: [0, 1, 2, 3], color: [1, 6, 2], emissive: 0 }], lines: [], castShadow: false },
    position: { x: 10.8, y: 0, z: 1 }
  });
  S.addChild(root, panel, originals);
  const occluder = S.createNode({ geometry: BL.models.box({ w: 2.2, h: 2.8, d: 0.06, color: "#000000" }), visible: false });
  S.addChild(root, occluder);
  const backing = S.createNode({ geometry: { verts: panel.geometry.verts, faces: [{ i: [0, 1, 2, 3], color: [0, 0, 0], emissive: 0 }], lines: [], castShadow: false, matrixLocalGlyphSurface: true }, position: panel.position, rotation: panel.rotation });
  S.addChild(originals, backing);
  const batches = Array.from({ length: 8 }, (_, i) => S.createNode({ geometry: BL.hubModels.matrixGlyph(i), instanceData: new Float32Array(1024 * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true }));
  S.addChild(originals, ...batches);
  const opts = { clear: [0, 0, 0], sky: [0.5, 0.5, 0.5], ground: [0.2, 0.2, 0.2], sun: [0.8, 0.8, 0.8], light: { x: 0, y: 0, z: 1 }, shadowCenter: { x: 10.8, y: 0, z: 1 }, shadowExtent: 5, bloomStrength: 0,
    matrix: { active: 1, radius: 100, time: 0.617, density: 1, origin: new Float32Array(3), caves: new Float32Array(28) } };
  const hash = (n) => { let x = n | 0; x ^= x >>> 16; x = Math.imul(x, 2146121005); x ^= x >>> 15; x = Math.imul(x, -2073254261); x ^= x >>> 16; return (x >>> 8) / 16777216; };
  const mod = (n, span) => n - Math.floor(n / span) * span;
  let surface = "wall", wallKind = "front";
  const wallBases = { front: [1, 0, 0, 0, 1, 0, 0, 0, 1], reverse: [-1, 0, 0, 0, 1, 0, 0, 0, -1], side: [0, 0, -1, 0, 1, 0, 1, 0, 0] };
  const probes = [];
  const buildOriginals = (time) => {
    for (const batch of batches) batch.instanceCount = 0;
    probes.length = 0;
    for (let line = 0; line < (surface === "floor" ? 28 : 16); line++) {
      const ray = line + 242, angle = ray * Math.PI * 2 / 512 - Math.PI, stream = surface === "floor" ? ray * 4 : line + 82;
      const speed = 0.56 + hash(stream + 19) * 0.64, train = 7 + Math.floor(hash(stream) * 6), gap = 2 + Math.floor(hash(stream + 41) * 5), sequence = train + gap, phase = hash(stream + 73) * sequence * 0.13;
      for (let cell = -24; cell < 100; cell++) {
        const position = mod(cell, sequence);
        const travel = time * speed + phase + (cell + 0.5) * 0.13;
        const x = surface === "floor" ? travel * Math.cos(angle) : wallKind === "side" ? 1.015 : (stream + 0.5) * 0.12, y = surface === "floor" ? 0.015 : -travel, z = surface === "floor" ? travel * Math.sin(angle) : wallKind === "side" ? (stream + 0.5) * 0.12 : wallKind === "reverse" ? 0.985 : 1.015;
        const cross = surface === "wall" && wallKind === "side" ? z : x;
        if (cross < 9.91 || cross > 11.69 || (surface === "floor" ? Math.abs(z) : Math.abs(y)) > 1.23) continue;
        const role = position >= train ? "gap" : position === train - 1 ? "head" : position === train - 2 ? "second" : position === 0 ? "tail" : "body";
        if (role === "gap") { probes.push({ x, y, z, role, local: [[0, 0, 0]], basis: surface === "floor" ? [-Math.sin(angle), 0, Math.cos(angle), Math.cos(angle), 0, Math.sin(angle), 0, 1, 0] : wallBases[wallKind] }); continue; }
        const glyph = (Math.abs(stream * 73 + cell * 151) + Math.floor(time * 20)) & 7, batch = batches[glyph], offset = batch.instanceCount++ * 20, data = batch.instanceData;
        for (let i = 0; i < 20; i++) data[offset + i] = 0;
        const basis = surface === "floor" ? [-Math.sin(angle), 0, Math.cos(angle), Math.cos(angle), 0, Math.sin(angle), 0, 1, 0] : wallBases[wallKind];
        for (let i = 0; i < 9; i++) data[offset + Math.floor(i / 3) * 4 + i % 3] = basis[i];
        data[offset + 15] = 1; data[offset + 12] = x; data[offset + 13] = y; data[offset + 14] = z;
        data[offset + 16] = (0.58 + hash(stream + 101) * 0.36) * (0.48 + (position + 1) / train * 0.52);
        data[offset + 18] = position === train - 1 ? 1 : position === train - 2 ? 0.55 : 0;
        const geometry = batch.geometry, local = [];
        for (let f = 0; f < geometry.faces.length; f += 6) {
          const face = geometry.faces[f], p = [0, 0, 0];
          for (const i of face.i) for (let a = 0; a < 3; a++) p[a] += geometry.verts[i * 3 + a] / face.i.length;
          local.push(p);
        }
        probes.push({ x, y, z, role, local, basis });
      }
    }
    for (const batch of batches) batch.instanceVersion++;
  };
  const pixels = new Uint8Array(size * size * 4);
  const capture = (original, bloom) => {
    originals.visible = original; panel.visible = !original; opts.bloomStrength = bloom;
    renderer.render(root, camera, opts);
    if (gl) gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    else pixels.set(ctx.getImageData(0, 0, size, size).data);
    const values = [], lit = [], colors = [0, 0, 0]; let count = 0, white = 0, energy = 0, fingerprint = 2166136261;
    // Crop inside both surfaces so their physical outer edge cannot change results.
    const a = {}, z = {}; if (surface === "floor") { renderer.project(10.1, 0, -0.9, a); renderer.project(11.5, 0, 0.9, z); } else if (wallKind === "side") { renderer.project(1, -0.9, 10.1, a); renderer.project(1, 0.9, 11.5, z); } else { renderer.project(10.1, -0.9, 1, a); renderer.project(11.5, 0.9, 1, z); }
    const x0 = Math.ceil(Math.min(a.x, z.x)) + 3, x1 = Math.floor(Math.max(a.x, z.x)) - 3;
    const y0 = gl ? size - Math.floor(Math.max(a.y, z.y)) + 3 : Math.ceil(Math.min(a.y, z.y)) + 3, y1 = gl ? size - Math.ceil(Math.min(a.y, z.y)) - 3 : Math.floor(Math.max(a.y, z.y)) - 3;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * size + x) * 4, r = pixels[o], g = pixels[o + 1], b = pixels[o + 2], luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      values.push(luminance); energy += luminance; count++;
      fingerprint = Math.imul(fingerprint ^ (r << 16 | g << 8 | b), 16777619);
      if (g > 32) { lit.push(luminance); colors[0] += r; colors[1] += g; colors[2] += b; }
      if (r > 150 && g > 200 && b > 150) white++;
    }
    values.sort((a, b) => a - b); lit.sort((a, b) => a - b);
    const q = (v, f) => v[Math.min(v.length - 1, Math.floor(v.length * f))] || 0;
    const roles = {};
    for (const probe of probes) {
      const b = probe.basis;
      for (const p of probe.local) {
        const screen = {}, x = probe.x + b[0] * p[0] + b[3] * p[1] + b[6] * p[2], y = probe.y + b[1] * p[0] + b[4] * p[1] + b[7] * p[2], z = probe.z + b[2] * p[0] + b[5] * p[1] + b[8] * p[2];
        renderer.project(x, y, z, screen);
        const sx = Math.floor(screen.x), sy = gl ? size - 1 - Math.floor(screen.y) : Math.floor(screen.y);
        if (sx < x0 || sx >= x1 || sy < y0 || sy >= y1) continue;
        const o = (sy * size + sx) * 4, role = roles[probe.role] || (roles[probe.role] = { total: 0, count: 0 });
        role.total += (0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]) / 255; role.count++;
      }
    }
    return { mean: energy / count, low: q(values, 0.1), median: q(lit, 0.5), high: q(lit, 0.95), range: q(lit, 0.95) - q(values, 0.1), coverage: lit.length / count, white: white / count, rgb: colors.map((v) => v / Math.max(1, lit.length) / 255), roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.total / v.count])), fingerprint: fingerprint >>> 0, count };
  };
  const results = [];
  try {
    camera.target = { x: 10.8, y: 0, z: 1 }; camera.position = { x: 10.8, y: 0, z: 4 };
    const started = performance.now();
    while (!renderer.render(root, camera, opts)) {
      if (renderer.failure || performance.now() - started > 8000) throw new Error(renderer.failure || "Matrix pixel renderer did not become ready");
      await new Promise(requestAnimationFrame);
    }
    for (surface of ["wall", "floor"]) for (const distance of [2.4, 5.4, 10]) {
      for (const condition of surface === "wall" ? ["lit", "unlit", "oblique", "fog", "shadow", "reverse", "side"] : ["lit", "unlit", "oblique", "fog", "shadow"]) {
        const light = condition === "unlit" ? -1 : 1;
        wallKind = condition === "reverse" || condition === "side" ? condition : "front";
        panel.rotation.y = 0; panel.position.x = 10.8;
        if (surface === "floor") {
          panel.rotation.x = -Math.PI / 2; panel.position.z = 0; camera.target = { x: 10.8, y: 0, z: 0 }; camera.position = { x: 10.8 + (condition === "oblique" ? distance * 0.5 : 0), y: distance, z: 0.02 * distance }; opts.light = { x: 0, y: light, z: 0 };
        } else {
          panel.rotation.x = 0; panel.position.z = 1; camera.target = { x: 10.8, y: 0, z: 1 }; camera.position = { x: 10.8 + (condition === "oblique" ? distance * 0.5 : 0), y: 0, z: 1 + distance }; opts.light = { x: 0, y: 0, z: light };
          if (wallKind === "reverse") { panel.rotation.y = Math.PI; camera.position.z = 1 - distance; opts.light.z = -1; }
          else if (wallKind === "side") { panel.rotation.y = Math.PI / 2; panel.position.x = 1; panel.position.z = 10.8; camera.target = { x: 1, y: 0, z: 10.8 }; camera.position = { x: 1 + distance, y: 0, z: 10.8 }; opts.light = { x: 1, y: 0, z: 0 }; }
        }
        occluder.visible = condition === "shadow";
        occluder.rotation.x = surface === "floor" ? Math.PI / 2 : 0;
        occluder.position = surface === "floor" ? { x: 18.8, y: 8, z: 0 } : { x: 18.8, y: 0, z: 9 };
        if (condition === "shadow") { opts.light.x = 1; opts.shadowExtent = 12; }
        opts.fog = condition === "fog" ? [0.04, 0.06, 0.05] : undefined; opts.fogNear = distance * 0.5; opts.fogFar = distance * 2;
        buildOriginals(opts.matrix.time);
        const reference = capture(true, 0), world = capture(false, 0), referenceBloom = capture(true, 0.9), worldBloom = capture(false, 0.9);
        results.push({ surface, distance, condition, reference, world, referenceBloom, worldBloom });
      }
    }
    // Both instants are in the same twenty-hertz mutation tick. Matching the moving
    // voxel reference therefore requires actual glyph translation, not mutation.
    const motion = [];
    opts.fog = undefined; occluder.visible = false; wallKind = "front"; panel.rotation.y = 0; panel.position.x = 10.8;
    for (surface of ["wall", "floor"]) {
      if (surface === "floor") {
        panel.rotation.x = -Math.PI / 2; panel.position.z = 0; camera.target = { x: 10.8, y: 0, z: 0 }; camera.position = { x: 10.8, y: 2.4, z: 0.048 }; opts.light = { x: 0, y: 1, z: 0 };
      } else {
        panel.rotation.x = 0; panel.position.z = 1; camera.target = { x: 10.8, y: 0, z: 1 }; camera.position = { x: 10.8, y: 0, z: 3.4 }; opts.light = { x: 0, y: 0, z: 1 };
      }
      const frames = [];
      for (const time of [0.5055, 0.543]) { opts.matrix.time = time; buildOriginals(time); frames.push({ time, reference: capture(true, 0), world: capture(false, 0) }); }
      motion.push({ surface, frames });
    }
    const transitions = [];
    if (gl) {
      // Control the front uniformly, independently of spatial propagation
      // already tested below. Inspect finalized RGBA8 scene and blurred bloom
      // attachments, not the clipped sum displayed by the composite pass.
      surface = "wall"; wallKind = "front"; panel.rotation.x = panel.rotation.y = 0; panel.position.x = 10.8; panel.position.z = 1;
      camera.target = { x: 10.8, y: 0, z: 1 }; camera.position = { x: 10.8, y: 0, z: 3.4 };
      opts.light = { x: 0, y: 0, z: 1 }; opts.matrix.time = 0.617; opts.matrix.radius = 100; buildOriginals(opts.matrix.time);
      const readback = gl.createFramebuffer();
      const attachment = (unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit); const texture = gl.getParameter(gl.TEXTURE_BINDING_2D), dimension = unit ? size >> 2 : size, data = new Uint8Array(dimension * dimension * 4);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, readback); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0); gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(0, 0, dimension, dimension, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0); return data;
      };
      const error = (actual, a, z, amount) => { let max = 0, sum = 0, count = 0; for (let i = 0; i < actual.length; i++) if (i % 4 !== 3) { const difference = Math.abs(actual[i] - (a[i] * (1 - amount) + z[i] * amount)); max = Math.max(max, difference); sum += difference; count++; } return { max, mean: sum / count }; };
      try {
        for (const kind of ["global-code", "emissive-to-code", "bright-emissive"]) {
          const emissive = kind !== "global-code";
          panel.geometry = { verts: panel.geometry.verts, faces: [{ i: [0, 1, 2, 3], color: emissive ? [255, 180, 60] : [1, 6, 2], emissive: emissive ? 1 : 0 }], lines: [], castShadow: false };
          panel.matrixEmissiveLiving = kind === "bright-emissive"; panel.highlight = emissive ? 0.6 : 0;
          const frames = [0, 0.5, 0.9989, 0.9991, 1].map((front) => { opts.matrix.active = front; const output = capture(false, 0.9); return { front, color: attachment(0), bloom: attachment(1), roles: output.roles }; });
          const a = frames[0], z = frames[4];
          transitions.push({ kind, midpoint: { color: error(frames[1].color, a.color, z.color, 0.5), bloom: error(frames[1].bloom, a.bloom, z.bloom, 0.5) }, nearFull: frames.slice(2, 4).map((f) => ({ front: f.front, color: error(f.color, a.color, z.color, f.front), bloom: error(f.bloom, a.bloom, z.bloom, f.front) })), roles: frames.map((f) => ({ front: f.front, ...f.roles })) });
        }
      } finally { gl.deleteFramebuffer(readback); panel.matrixEmissiveLiving = false; panel.highlight = 0; opts.matrix.active = 1; }
    }
    // The same tagged receiver at two cave depths must follow doorway travel,
    // not its shorter radius from the pile. Read a tiny centered patch where
    // the expected smooth transition is independent of glyph rasterization.
    surface = "wall"; wallKind = "front"; panel.rotation.x = panel.rotation.y = 0; panel.position.x = 10.8; panel.position.z = 1;
    camera.target = { x: 10.8, y: 0, z: 1 }; camera.position = { x: 10.8, y: 0, z: 3.4 };
    opts.light = { x: 0, y: 0, z: 1 }; opts.fog = undefined; opts.matrix.radius = 0;
    const interiors = [];
    const patch = () => { let sum = 0; for (let y = 190; y < 194; y++) for (let x = 190; x < 194; x++) { const o = (y * size + x) * 4; sum += (pixels[o] * 0.2126 + pixels[o + 1] * 0.7152 + pixels[o + 2] * 0.0722) / 255; } return sum / 16; };
    const entrance = Math.hypot(10.8, 2), depths = [1, 4];
    for (let cave = 1; cave <= 7; cave++) {
      panel.geometry = { verts: panel.geometry.verts, faces: [{ i: [0, 1, 2, 3], color: [180, 55, 120], emissive: 0, matrixCave: cave, matrixLocalGlyphSurface: true }], lines: [], castShadow: false };
      opts.matrix.caves.set([0, 1, 2, entrance], (cave - 1) * 4);
      const planes = [];
      for (const depth of depths) {
        panel.position.z = 2 - depth; camera.target.z = panel.position.z; camera.position.z = panel.position.z + 2.4;
        opts.matrix.active = 0; capture(false, 0); const normal = patch();
        opts.matrix.active = 1;
        const radii = [0, entrance - 0.1, entrance + 0.1, entrance + 2.51, entrance + 4.75, entrance + 5.51, entrance + 4.75, entrance + 2.51, entrance - 0.1, 0];
        const values = radii.map((radius) => { opts.matrix.radius = radius; capture(false, 0); return patch(); });
        opts.matrix.active = 0; capture(false, 0);
        planes.push({ depth, normal, restored: patch(), radii, values });
      }
      panel.position.z = camera.target.z = 1; camera.position.z = 3.4;
      for (let i = 0; i < batches.length; i++) { batches[i].geometry = { ...BL.hubModels.matrixGlyph(i), matrixCave: cave }; batches[i].instanceCount = 0; batches[i].instanceVersion++; }
      const data = batches[0].instanceData; data.fill(0, 0, 20); data[0] = data[5] = data[10] = data[15] = 1;
      data[12] = 10.8; data[14] = 1.015; data[16] = 0.8; data[18] = 1; batches[0].instanceCount = 1;
      opts.matrix.active = 1;
      const glyphRadii = [0, entrance - 0.1, entrance + 0.985 + 0.75, entrance + 3, entrance + 0.985 + 0.75, 0];
      const glyphValues = glyphRadii.map((radius) => { opts.matrix.radius = radius; return capture(true, 0).mean; });
      opts.matrix.active = 0;
      interiors.push({ cave, planes, glyphRadii, glyphValues });
    }
    const occupants = [];
    opts.matrix.caveBounds = new Float32Array(28); opts.matrix.caveNear = 7;
    panel.matrixLiving = true;
    panel.geometry = { verts: panel.geometry.verts, faces: [{ i: [0, 1, 2, 3], color: [180, 55, 120], emissive: 0 }], lines: [], castShadow: false };
    panel.position.z = camera.target.z = -2; camera.position.z = 0.4;
    for (let cave = 1; cave <= 7; cave++) {
      opts.matrix.caveBounds.fill(0); opts.matrix.caveBounds.set([10.8, -1.3, 1.52, 7], (cave - 1) * 4);
      opts.matrix.active = 0; capture(false, 0); const normal = patch();
      opts.matrix.active = 1;
      const values = [0, 12, entrance + 4.75, entrance + 5.51, entrance + 4.75, 12, 0].map((radius) => { opts.matrix.radius = radius; capture(false, 0); return patch(); });
      opts.matrix.active = 0; capture(false, 0); occupants.push({ cave, normal, restored: patch(), values });
    }
    panel.matrixLiving = false;
    panel.position.z = camera.target.z = 1; camera.position.z = 3.4;
    let shadow = null;
    if (gl) {
      opts.light = { x: 1, y: 0, z: 1 }; opts.sky = opts.ground = [0, 0, 0]; opts.sun = [1, 1, 1]; opts.shadowExtent = 12;
      occluder.rotation.x = 0; occluder.position = { x: 18.8, y: 0, z: 9 };
      occluder.visible = false; const lit = capture(false, 0).mean;
      occluder.visible = true; shadow = { lit, blocked: capture(false, 0).mean };
    }
    return { samples: results, motion, transitions, interiors, occupants, shadow, nativeSamples: !!gl && !!gl.getExtension("OES_shader_multisample_interpolation") };
  } finally { renderer.dispose(); }
};

// Inspect ownership and the actual uploaded instances, including all extruded
// corners at the portal and the backing-plane clearance, rather than counters
// that claim that clipping or exclusions are correct.
export const matrixCaveSnapshot = () => {
  const B = window.__ooga, C = B.matrixCave, key = (x, y, z, plane) => [x, y, z, plane].map((v) => Math.round(v * 10000)).join(":");
  // Clip each real coplanar source polygon to the glyph's complete footprint.
  // Greedy terrain faces do not overlap, so summed intersection area proves
  // support across internal seams without treating holes as a bounding box.
  const supportArea = (polygon, u, v) => {
    let points = polygon;
    for (const [axis, bound, sign] of [[0, u - 0.0395, 1], [0, u + 0.0395, -1], [1, v - 0.0605, 1], [1, v + 0.0605, -1]]) {
      const clipped = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], da = (a[axis] - bound) * sign, db = (b[axis] - bound) * sign;
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      points = clipped;
    }
    let area = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(area) / 2;
  };
  const faceOwners = new Map(), faceSources = new Map(), tagged = new Set(); let overlappingFaces = 0, missingFlags = 0, brightGlyphFaces = 0, linerNodes = 0;
  const scan = (node, living = false, partial = false) => {
    living ||= !!node.matrixLiving; partial ||= !!node.matrixEmissiveLiving;
    if (node.geometry?.matrixRevealBacking) linerNodes++;
    if (node.geometry && !node.geometry.matrixGlyph) for (const face of node.geometry.faces) {
      faceSources.set(face, { geometry: node.geometry, world: node.world });
      if (face.matrixCave) { tagged.add(face); if (!face.matrixLocalGlyphSurface) missingFlags++; }
      if (living || partial && face.emissive > 0) faceOwners.set(face, "bright");
    }
    for (const child of node.children) scan(child, living, partial);
  };
  scan(window.BL.scenes.hub.root);
  const seen = new Set(), caves = C.caves.map((cave) => {
    const m = cave.mouth, cr = Math.cos(m.ry), sr = Math.sin(m.ry), byPlane = new Map(), terrainPlanes = new Set(), ceilingLevels = new Set();
    let clearanceMin = Infinity, clearanceMax = -Infinity, maxLocalZ = -Infinity, escaped = 0, finite = true, actualCount = 0, tips = 0, dim = 0, sourceError = 0, backingSourcesValid = true, backFaces = 0, sideFaces = 0;
    for (const section of cave.sections) {
      const k = key(section.nx, section.ny, section.nz, section.plane), list = byPlane.get(k) || [];
      list.push(section); byPlane.set(k, list);
      for (const support of section.supports || [section]) {
        const face = support.face;
        if (seen.has(face)) overlappingFaces++; seen.add(face);
        if (face.matrixCave !== cave.caveIndex || !face.matrixLocalGlyphSurface) missingFlags++;
        if (faceOwners.get(face) === "bright") brightGlyphFaces++;
        const source = faceSources.get(face);
        backingSourcesValid &&= !!source && (section.source !== "terrain" || source.geometry === B.island.geometry) && support.polygon.length === face.i.length;
        if (source) for (let j = 0; j < face.i.length; j++) {
          const i = face.i[j], v = source.geometry.verts, w = source.world, x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2];
          const wx = w[0] * x + w[4] * y + w[8] * z + w[12], wy = w[1] * x + w[5] * y + w[9] * z + w[13], wz = w[2] * x + w[6] * y + w[10] * z + w[14];
          sourceError = Math.max(sourceError, Math.abs(section.nx * wx + section.ny * wy + section.nz * wz - section.plane), Math.abs(section.ux * wx + section.uy * wy + section.uz * wz - support.polygon[j][0]), Math.abs(section.vx * wx + section.vy * wy + section.vz * wz - support.polygon[j][1]));
        }
      }
      if (section.source === "terrain") {
        if (!section.horizontal) terrainPlanes.add(k);
        if (section.ny < -0.99) ceilingLevels.add(Math.round(section.plane * 10000));
        if (!section.horizontal && sr * section.nx + cr * section.nz > 0.5) backFaces++;
        if (!section.horizontal && Math.abs(cr * section.nx - sr * section.nz) > 0.5) sideFaces++;
      }
    }
    const chosen = cave.streams.find((stream) => !cave.sections[stream.section].horizontal && stream.flowMax - stream.flowMin > 1.5), chosenSection = chosen && cave.sections[chosen.section], positions = [];
    for (const node of cave.nodes) {
      const data = node.instanceData, bounds = window.BL.scene.boundsOf(node.geometry); actualCount += node.instanceCount;
      for (let i = 0; i < node.instanceCount; i++) {
        const o = i * 20, x = data[o + 12], y = data[o + 13], z = data[o + 14], nx = data[o + 8], ny = data[o + 9], nz = data[o + 10];
        for (let a = 0; a < 20; a++) finite &&= Number.isFinite(data[o + a]);
        if (data[o + 18] > 0) tips++; if (data[o + 16] < 0.5) dim++;
        let extent = 0;
        for (let axis = 0; axis < 3; axis++) { const direction = sr * data[o + axis * 4] + cr * data[o + axis * 4 + 2]; extent += Math.max(direction * bounds.min[axis], direction * bounds.max[axis]); }
        maxLocalZ = Math.max(maxLocalZ, sr * (x - m.x) + cr * (z - m.z) + extent);
        const plane = nx * x + ny * y + nz * z - 0.015, candidates = byPlane.get(key(nx, ny, nz, plane)) || [];
        // Instance transforms live in Float32 buffers. A value on a four-decimal
        // rounding boundary can land in the neighbouring key while remaining on
        // the same physical source plane, so recover only that narrowly matching
        // plane before applying the full polygon/constraint support proof below.
        if (!candidates.length) for (const section of cave.sections) {
          if (Math.abs(section.nx - nx) < 0.00001 && Math.abs(section.ny - ny) < 0.00001 && Math.abs(section.nz - nz) < 0.00001 && Math.abs(section.plane - plane) < 0.00002) candidates.push(section);
        }
        let backed = false;
        for (const section of candidates) {
          const u = section.ux * x + section.uy * y + section.uz * z, v = section.vx * x + section.vy * y + section.vz * z;
          const supported = section.supports ? Math.abs(section.supports.reduce((sum, support) => sum + supportArea(support.polygon, u, v), 0) - 0.079 * 0.121) < 0.000001 : section.constraints.every((p) => p[0] * u + p[1] * v <= p[2] + 0.00001);
          if (supported) {
            const clearance = nx * x + ny * y + nz * z - section.plane - 0.005;
            clearanceMin = Math.min(clearanceMin, clearance); clearanceMax = Math.max(clearanceMax, clearance); backed = true;
            if (section === chosenSection && Math.abs(u - chosen.cross) < 0.00001) positions.push(v);
            break;
          }
        }
        if (!backed) escaped++;
      }
    }
    const vertical = chosen;
    return { id: cave.id, buffers: cave.nodes.length, capacity: cave.capacity, bytes: cave.bufferBytes, fixed: cave.nodes.every((node) => node.fixedInstanceCapacity && node.instanceCount <= node.instanceData.length / 20 && node.drawInstanceCount <= node.instanceCount), actualCount, drawn: cave.nodes.reduce((n, node) => n + node.drawInstanceCount, 0), sections: cave.sections.length, terrain: cave.sections.filter((s) => s.source === "terrain").length, props: cave.sections.filter((s) => s.source === "prop").length, horizontal: cave.sections.filter((s) => s.horizontal).length, vertical: cave.sections.filter((s) => !s.horizontal).length, fullCeiling: cave.sections.some((s) => s.ny < -0.99), fullFloor: cave.sections.some((s) => s.ny > 0.99), owned: cave.sections.every((s) => (s.supports || [s]).every((support) => tagged.has(support.face))), backingSourcesValid, sourceError, terrainPlanes: terrainPlanes.size, ceilingLevels: ceilingLevels.size, backFaces, sideFaces, finite, escaped, maxLocalZ, clearanceMin, clearanceMax, tips, dim, stream: { speed: vertical.speed, phase: vertical.phase, head: vertical.head, gap: vertical.gap, direction: vertical.direction, flowRange: vertical.flowRange, min: vertical.flowMin, max: vertical.flowMax, trainLength: vertical.trainLength, gapLength: vertical.gapLength, brightness: vertical.brightness }, positions, seedSignature: cave.streams.slice(0, 16).map((s) => [s.speed, s.phase, s.brightness, s.trainLength, s.gapLength].join(":")).join("|"), updates: cave.updates };
  });
  return { active: C.world.active, time: C.world.sampleStream(0).time, quality: B.renderer.quality, records: B.renderer.stats.records, caveCount: caves.length, caveIds: B.mouths.map((m) => m.id), taggedFaces: tagged.size, overlappingFaces, missingFlags, brightGlyphFaces, linerNodes, caves };
};
