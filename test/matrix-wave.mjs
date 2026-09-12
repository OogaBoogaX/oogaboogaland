// Deterministic real scene updates and renders. The browser's frame loop cannot
// interleave this bounded synchronous probe; no production state is simulated.
export const primeMatrixControls = () => {
  const B = window.__ooga, S = window.BL.scene, scene = window.BL.scenes.hub, fixture = S.createNode(), geometries = new Set(), batched = new Set();
  const collect = (node) => { if (node.geometry) { geometries.add(node.geometry); if (node.instanceData) batched.add(node.geometry); } for (const child of node.children) collect(child); };
  collect(scene.root); scene.liveGeometry(geometries);
  // The real crew keeps building during asynchronous wave checks. Prime only
  // its finite cached model catalog, so first use is not mistaken for a leak.
  for (const build of window.BL.models.buildableGeos) {
    const geometry = build();
    if (build() !== geometry) throw new Error("Ambient build geometry must be cached");
    geometries.add(geometry);
  }
  // Fixed batches are already resident. Never replace their GPU instance data
  // with a fixture transform while their production upload version is unchanged.
  for (const geometry of geometries) if (!batched.has(geometry) && !geometry.matrixGlyph && !geometry.matrixLocalGlyphSurface) S.addChild(fixture, S.createNode({ geometry }));
  B.renderer.render(fixture, B.camera, { ...B.renderOpts, matrix: null });
  fixture.children.length = 0;
};

export const matrixWaveProbe = (prime = () => {}) => {
  // Keep every measured expansion/reversal window below the radius clamp.
  const B = window.__ooga, scene = window.BL.scenes.hub, C = B.matrixCave, W = C.world, R = B.renderer, dt = 1 / 120;
  const gl = R.kind === "webgl2" ? document.getElementById("scene").getContext("webgl2") : null;
  const pixel = new Uint8Array(4);
  const mirrorPixels = new Uint8Array(9 * 9 * 4), withoutMirrorPixels = new Uint8Array(9 * 9 * 4);
  // Keep portal-crossing camera input separate from the measured projection.
  // Cave population work depends on wave distance, not this diagnostic camera.
  const camera = window.BL.scene.createCamera({ fov: B.camera.fov * 180 / Math.PI, near: B.camera.near, far: B.camera.far });
  camera.position = { x: 14.3, y: 31.8, z: 33.7 }; camera.target = { x: 0, y: 4, z: 0 };
  R.setQuality("high");
  prime();
  let elapsed = W.sampleStream(0).time;
  const buffers = C.caves.flatMap((c) => c.nodes.map((n) => n.instanceData));
  const step = (draw = false) => { elapsed += dt; scene.update(dt, elapsed); if (draw) R.render(scene.root, camera, B.renderOpts); };
  const snapshot = () => ({ radius: W.radius, direction: W.direction, active: W.active, inside: C.inside, portal: B.mirror.portal, nodePortal: B.mirrorCave.node.mirrorPortal, surfaceDrawn: B.mirror.surfaceDrawn, entranceZ: (B.camera.position.x - B.mirrorCave.mouth.x) * Math.sin(B.mirrorCave.mouth.ry) + (B.camera.position.z - B.mirrorCave.mouth.z) * Math.cos(B.mirrorCave.mouth.ry), time: elapsed, records: R.stats.records, resources: R.stats.mirrorResources, shadowPasses: R.stats.shadowPassCount,
    camera: [camera.position.x, camera.position.y, camera.position.z, camera.target.x, camera.target.y, camera.target.z, camera.fov, camera.near, camera.far],
    caves: C.caves.map((c) => { let farthest = 0; for (const node of c.nodes) for (let i = 0; i < node.instanceCount; i++) { const o = i * 20; farthest = Math.max(farthest, W.travelDistance(node.instanceData[o + 12], node.instanceData[o + 14], c.caveIndex)); } return { id: c.id, index: c.caveIndex, minimum: c.minimumTravelDistance, farthest, updates: c.updates, revealed: c.revealedGlyphCount, count: c.nodes.reduce((n, node) => n + node.instanceCount, 0), drawn: c.nodes.reduce((n, node) => n + node.drawInstanceCount, 0), versions: c.nodes.map((n) => n.instanceVersion) }; }) });
  const advance = (radius) => { let frames = 0; while ((W.direction > 0 ? W.radius < radius : W.radius > radius) && frames++ < 300) step(); if (frames >= 300) throw new Error("Matrix wave stopped progressing"); };
  const crossOutside = () => {
    const m = B.mirrorCave.mouth, o = B.pilot.orbit, targetZ = C.portal.opening.planeZ + 0.02 - 3.5;
    const target = { x: m.x + Math.sin(m.ry) * targetZ, y: m.floorY + 1.75, z: m.z + Math.cos(m.ry) * targetZ };
    o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = m.ry; o.pitch = o.tPitch = 0; o.dist = o.tDist = 3.5;
    B.pilot.update(0.1);
  };
  const measure = (state) => {
    const update = [], render = [], gpu = [], before = snapshot(); let drawn = 0;
    for (let i = 0; i < 24; i++) {
      let start = performance.now(); step(); update.push(performance.now() - start);
      start = performance.now(); if (R.render(scene.root, camera, B.renderOpts)) drawn++; render.push(performance.now() - start);
      // A synchronous one-pixel read forces completion; finish() alone can be
      // deferred by Chrome's command transport and underreport actual GPU time.
      start = performance.now(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); gpu.push(performance.now() - start);
    }
    const stats = (values) => { values.sort((a, b) => a - b); return { mean: values.reduce((a, b) => a + b, 0) / values.length, p95: values[Math.floor(values.length * 0.95)] }; };
    return { state, before, after: snapshot(), drawn, ready: R.ready, update: stats(update), render: stats(render), gpu: stats(gpu) };
  };
  const drawMirror = (comparePixels = false) => {
    // Observe uniforms on the first actual reflected draw after a crossing,
    // not just a debug promise that the mirror will return on a later frame.
    const locations = new Map(), targets = new Set(), passes = [], before = B.mirror.reflectionPassCount, draw = gl && gl.drawArraysInstanced;
    if (gl) gl.drawArraysInstanced = function (...args) {
      const program = gl.getParameter(gl.CURRENT_PROGRAM);
      if (!locations.has(program)) locations.set(program, gl.getUniformLocation(program, "uMatrixParams"));
      if (locations.get(program)) {
        const target = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
        if (!targets.has(target)) {
          targets.add(target);
          const uniform = (name) => gl.getUniform(program, gl.getUniformLocation(program, name));
          passes.push({ eye: Array.from(uniform("uEye")), matrix: Array.from(uniform("uMatrixParams")), origin: Array.from(uniform("uMatrixOrigin")), samples: uniform("uMatrixSamples"), caves: Array.from({ length: 7 }, (_, i) => Array.from(uniform(`uMatrixCaves[${i}]`))).flat() });
        }
      }
      return draw.apply(gl, args);
    };
    try {
      const drawn = R.render(scene.root, B.camera, B.renderOpts);
      const result = { drawn, passes, captures: B.mirror.reflectionPassCount - before, portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, faux: B.mirror.faux, near: B.camera.near, reflectedEye: gl ? Array.from(B.mirror.cameraPosition) : null, mainEye: [B.camera.position.x, B.camera.position.y, B.camera.position.z], expectedMatrix: [Number(W.active), W.radius, elapsed, W.density], expectedOrigin: Array.from(W.origin), expectedCaves: Array.from(W.caves), samples: B.mirror.samples };
      if (comparePixels && gl) {
        const x = (gl.drawingBufferWidth >> 1) - 4, y = (gl.drawingBufferHeight >> 1) - 4;
        gl.readPixels(x, y, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, mirrorPixels);
        // Omit only the mirror program's draw in a counterfactual control.
        // Portal state, ordinary geometry, lighting and wave time stay intact.
        gl.drawArraysInstanced = function (...args) { if (gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), "uReflection") === null) return draw.apply(gl, args); };
        R.render(scene.root, B.camera, B.renderOpts);
        gl.readPixels(x, y, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, withoutMirrorPixels);
        let changed = 0, difference = 0;
        for (let i = 0; i < mirrorPixels.length; i++) if (i % 4 !== 3) { const delta = Math.abs(mirrorPixels[i] - withoutMirrorPixels[i]); difference += delta; if (delta) changed++; }
        result.pixels = { changed, difference: difference / (9 * 9 * 3 * 255) };
        gl.drawArraysInstanced = draw;
        R.render(scene.root, B.camera, B.renderOpts);
      }
      return result;
    } finally { if (gl) gl.drawArraysInstanced = draw; }
  };
  step(true);
  const inactive = measure("inactive"), start = snapshot();
  C.viewInside(false); const entryCrossing = snapshot(); step(true);
  const entered = snapshot(), full = measure("full"), beforeExit = snapshot();
  crossOutside(); const partialCrossing = snapshot(); step(); const partialMirror = drawMirror(true), exit = snapshot();
  for (let i = 0; i < 12; i++) step(); const reverse = snapshot();
  C.viewInside(false); const partialReentryCrossing = snapshot(); step(); const partialReentryMirror = drawMirror(), reentry = snapshot();
  for (let i = 0; i < 12; i++) step(); const resumed = snapshot();
  // Every actual entrance is sampled immediately on each side, independently
  // calculating the projected doorway path from immutable mouth transforms.
  const paths = C.caves.map((c) => {
    const m = c.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), plane = C.portal.opening.planeZ;
    return { id: c.id, points: [plane + 0.01, plane, plane - 0.01, plane - 1, plane - 4].map((z) => {
      const x = m.x + sr * z, wz = m.z + cr * z, depth = Math.max(0, plane - z), entranceX = x + sr * depth, entranceZ = wz + cr * depth;
      return { localZ: z, expected: Math.hypot(entranceX - W.origin[0], entranceZ - W.origin[2]) + depth, actual: W.travelDistance(x, wz, c.caveIndex) };
    }) };
  });
  const fullBuffers = C.caves.flatMap((c) => c.nodes.map((n) => n.instanceData));
  const beforeFullExit = snapshot(); crossOutside(); const fullCrossing = snapshot(); step(); const fullMirror = drawMirror(true), fullExit = snapshot();
  C.viewInside(false); const fullReentryCrossing = snapshot(); step(); const fullReentryMirror = drawMirror(), fullReentry = snapshot();
  advance(W.maxRadius); C.viewApproach(); step();
  const retracting = measure("retracting");
  advance(20); step(true); const cavesRestored = snapshot();
  const reflection = gl ? drawMirror() : null;
  advance(0); step(true); const restored = snapshot(), idle = measure("restored");
  const current = C.caves.flatMap((c) => c.nodes.map((n) => n.instanceData));
  const cadence = [];
  if (gl) {
    for (const quality of ["medium", "low"]) {
      R.setQuality(quality); C.viewInside(false); step(); crossOutside(); step();
      for (let i = 0; i < 3; i++) { R.render(scene.root, B.camera, B.renderOpts); if (B.mirror.skipReason === "cadence") break; }
      const previous = B.mirror.skipReason;
      C.viewInside(false); step(); R.render(scene.root, B.camera, B.renderOpts);
      crossOutside(); step(); cadence.push({ quality, previous, mirror: drawMirror(true) });
    }
    R.setQuality("high"); C.viewApproach(); advance(0); step(true);
  }
  return { backend: R.kind, quality: R.quality, speed: W.speed, retreatSpeed: W.retreatSpeed, frontWidth: W.frontWidth, maxRadius: W.maxRadius, descriptors: Array.from(W.caves), start, entryCrossing, entered, beforeExit, exit, reverse, reentry, resumed, paths, cavesRestored, restored,
    partialCrossing, partialMirror, partialReentryCrossing, partialReentryMirror, beforeFullExit, fullCrossing, fullMirror, fullExit, fullReentryCrossing, fullReentryMirror, fullReentry, reflection, cadence,
    measurements: [inactive, full, retracting, idle], buffersStable: buffers.every((buffer, i) => buffer === fullBuffers[i] && buffer === current[i]), bytes: buffers.reduce((sum, b) => sum + b.byteLength, 0), bufferCount: buffers.length };
};
