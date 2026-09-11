// Real native instances and geometric stream domains, shared by the Mirror's
// WebGL and Canvas checks. No assertion depends on the removed chamber panels.
export const matrixSurfaceSnapshot = () => {
  const B = window.__ooga, C = B.matrixCave, cave = C.caves.find((c) => c.id === "c1"), time = C.world.sampleStream(0).time;
  const rank = B.renderer.kind === "canvas2d" ? 1 : { high: 8, medium: 5, low: 3 }[B.renderer.quality], expected = new Array(8).fill(0);
  const slots = new Int32Array(cave.streams.length);
  for (const entry of cave.entries) slots[entry.stream]++;
  const expectedCapacity = slots.reduce((sum, count) => sum + Math.ceil(count / 8) * 8, 0);
  const mod = (value, period) => (value % period + period) % period;
  for (const entry of cave.entries) {
    if (entry.rank >= rank) continue;
    const stream = cave.streams[entry.stream], travel = time * stream.speed + stream.phase;
    const cell = Math.ceil((stream.flowMin - stream.direction * travel) / 0.13) + entry.character, flow = cell * 0.13 + stream.direction * travel;
    if (flow < stream.flowMin || flow > stream.flowMax || mod(-stream.direction * cell, stream.trainLength + stream.gapLength) >= stream.trainLength) continue;
    expected[(cell + Math.floor(time * 20 + (stream.seed & 15) / 16) + (stream.seed & 7)) & 7]++;
  }
  const categories = { floor: 0, ceiling: 0, wall: 0 }, active = { floor: 0, ceiling: 0, wall: 0 };
  let leaders = 0, second = 0, trailing = 0, minimumGlow = Infinity, maximumGlow = -Infinity;
  for (const section of cave.sections) categories[section.ny > 0.99 ? "floor" : section.ny < -0.99 ? "ceiling" : "wall"]++;
  for (const node of cave.nodes) for (let i = 0; i < node.instanceCount; i++) {
    const offset = i * 20, data = node.instanceData;
    active[data[offset + 9] > 0.99 ? "floor" : data[offset + 9] < -0.99 ? "ceiling" : "wall"]++;
    if (data[offset + 18] > 0.99) leaders++; else if (data[offset + 18] > 0) second++; else trailing++;
    minimumGlow = Math.min(minimumGlow, data[offset + 16]); maximumGlow = Math.max(maximumGlow, data[offset + 16]);
  }
  const grouped = (category) => cave.streams.filter((s) => { const n = cave.sections[s.section].ny; return category === "floor" ? n > 0.99 : category === "ceiling" ? n < -0.99 : Math.abs(n) < 0.99; });
  const distribution = (streams) => ({ count: streams.length, brightness: [Math.min(...streams.map((s) => s.brightness)), Math.max(...streams.map((s) => s.brightness))], phases: new Set(streams.map((s) => Math.floor(mod(s.phase / s.flowRange, 1) * 16))).size, trains: [...new Set(streams.map((s) => s.trainLength))].sort((a, b) => a - b), gaps: [...new Set(streams.map((s) => s.gapLength))].sort((a, b) => a - b), directions: [...new Set(streams.map((s) => s.direction))] });
  const motions = Object.fromEntries(["floor", "ceiling", "wall"].map((name) => {
    const s = grouped(name).reduce((longest, stream) => !longest || stream.flowMax - stream.flowMin > longest.flowMax - longest.flowMin ? stream : longest, null);
    return [name, { head: s.head, gap: s.gap, speed: s.speed, direction: s.direction, flowRange: s.flowRange, trainLength: s.trainLength, brightness: s.brightness, phase: s.phase }];
  }));
  let liners = 0;
  const scan = (node) => { if (node.geometry?.matrixRevealBacking) liners++; for (const child of node.children) scan(child); }; scan(window.BL.scenes.hub.root);
  return { scene: B.scene, kind: B.renderer.kind, inside: C.inside, active: C.world.active, radius: C.world.radius, visible: C.visible, drawEnabled: C.drawEnabled,
    portal: B.mirror.portal, surfaceDrawn: B.mirror.surfaceDrawn, faux: B.mirror.faux, passes: B.mirror.reflectionPassCount, resources: B.mirror.resources, reason: B.mirror.skipReason, records: B.renderer.stats.records,
    time, expected, batches: cave.nodes.map((n) => n.instanceCount), drawn: cave.nodes.map((n) => n.drawInstanceCount), versions: cave.nodes.map((n) => n.instanceVersion),
    categories, activeCategories: active, distributions: Object.fromEntries(["floor", "ceiling", "wall"].map((name) => [name, distribution(grouped(name))])), motions,
    leaders, second, trailing, minimumGlow, maximumGlow, gaps: C.movingGapCount, cadence: C.glyphCadenceHz, updates: C.updates, mutation: C.mutationHash,
    entries: cave.entries.length, registered: cave.sections.reduce((sum, s) => sum + s.glyphCount, 0), capacity: cave.capacity, expectedCapacity, buffers: cave.nodes.length, bytes: cave.bufferBytes,
    allocations: cave.allocationCount, rebuilds: cave.rebuildCount, hash: C.registryHash, quality: C.quality, density: rank / 8, liners, noRoom: !("room" in B.mirrorCave) };
};

export const matrixSurfaceViews = async (snapshot) => {
  const B = window.__ooga, m = B.mirrorCave.mouth, o = B.pilot.orbit, sr = Math.sin(m.ry), cr = Math.cos(m.ry);
  const wait = () => new Promise((resolve) => { const start = B.renderedFrames, tick = () => B.renderedFrames >= start + 3 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  const world = (p) => ({ x: m.x + cr * p[0] + sr * p[2], y: m.floorY + p[1], z: m.z - sr * p[0] + cr * p[2] });
  const poses = [["front", 0, 1.75, -2], ["left-oblique", -1.8, 1.75, -2], ["right-oblique", 1.8, 1.75, -2], ["left-wall", -1.9, 1.75, -3.5], ["right-wall", 1.9, 1.75, -3.5], ["elevated", 0, 2.6, -3.5], ["low", 0, 0.7, -3.5], ["rear-left", -1.8, 1.75, -5.3], ["rear-right", 1.8, 1.75, -5.3]], samples = [];
  for (const [name, x, y, z] of poses) {
    const eye = world([x, y, z]), target = world([0, 1.65, 0.48]), dx = eye.x - target.x, dy = eye.y - target.y, dz = eye.z - target.z, dist = Math.hypot(dx, dy, dz);
    o.target = target; o.tx = target.x; o.ty = target.y; o.tz = target.z; o.yaw = o.tYaw = Math.atan2(dx, dz); o.pitch = o.tPitch = Math.asin(dy / dist); o.dist = o.tDist = dist;
    B.pilot.update(0.1); await wait();
    const s = snapshot(); samples.push({ name, inside: s.inside, visible: s.visible, categories: s.activeCategories, liners: s.liners, noRoom: s.noRoom, records: s.records, hash: s.hash });
  }
  B.matrixCave.viewInside(true); await wait();
  return samples;
};
