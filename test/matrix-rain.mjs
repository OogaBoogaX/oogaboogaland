// Inspect the restored airborne rain separately from the surface-following
// glyph batches. Advance the real scene synchronously so the browser frame
// loop cannot interleave or hide a bad wave gate or direction reversal.
export const matrixRainProbe = (prime = () => {}) => {
  const B = window.__ooga, C = B.matrixCave, W = C.world, R = B.renderer, scene = window.BL.scenes.hub, dt = 1 / 120;
  const mod = (value, period) => (value % period + period) % period;
  let elapsed = W.sampleStream(0).time;
  R.setQuality("high"); prime();
  const buffers = C.caves.flatMap((c) => c.rain.nodes.map((n) => n.instanceData));
  const step = (draw = false) => { scene.update(dt, elapsed += dt); if (draw) R.render(scene.root, B.camera, B.renderOpts); };
  const advance = (radius) => { let frames = 0; while ((W.direction > 0 ? W.radius < radius : W.radius > radius) && frames++ < 300) step(); if (frames >= 300) throw new Error("Rain wave stopped progressing"); };
  const capture = (inspect = false) => ({ time: elapsed, radius: W.radius, active: W.active, direction: W.direction, inside: C.inside, records: R.stats.records,
    caves: C.caves.map((cave) => {
      const rain = cave.rain, m = cave.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), groups = rain.streams.map(() => []), space = { caveIndex: 0, floor: 0, ceiling: 0 };
      let count = 0, finite = true, upright = true, twoSided = true, leaders = 0, second = 0, trailing = 0, minGlow = Infinity, maxGlow = 0, escaped = 0, unknown = 0, maxLocalZ = -Infinity, farthest = 0, boundsError = 0;
      for (const [glyph, node] of rain.nodes.entries()) for (let i = 0; i < node.instanceCount; i++) {
        const data = node.instanceData, o = i * 20, x = data[o + 12], y = data[o + 13], z = data[o + 14], glow = data[o + 16], tip = data[o + 18];
        count++; finite &&= data.subarray(o, o + 20).every(Number.isFinite);
        upright &&= Math.abs(data[o + 4]) < 0.000001 && Math.abs(data[o + 5] - 1) < 0.000001 && Math.abs(data[o + 6]) < 0.000001;
        twoSided &&= data[o + 19] === 0;
        if (tip > 0.99) leaders++; else if (tip > 0) second++; else trailing++;
        minGlow = Math.min(minGlow, glow); maxGlow = Math.max(maxGlow, glow);
        farthest = Math.max(farthest, W.travelDistance(x, z, cave.caveIndex));
        const stream = rain.streams.findIndex((s) => Math.abs(s.x - x) < 0.00001 && Math.abs(s.z - z) < 0.00001);
        if (stream < 0) unknown++; else {
          const s = rain.streams[stream]; boundsError = Math.max(boundsError, s.minY - y, y - s.maxY);
          groups[stream].push({ x, y, z, glyph, glow, tip });
        }
        if (!inspect) continue;
        // The actual transformed glyph box must fit the original carved void,
        // not merely the rain builder's self-reported vertical interval.
        const bounds = window.BL.scene.boundsOf(node.geometry);
        for (const vx of [bounds.min[0], bounds.max[0]]) for (const vy of [bounds.min[1], bounds.max[1]]) for (const vz of [bounds.min[2], bounds.max[2]]) {
          const wx = x + data[o] * vx + data[o + 4] * vy + data[o + 8] * vz, wy = y + data[o + 1] * vx + data[o + 5] * vy + data[o + 9] * vz, wz = z + data[o + 2] * vx + data[o + 6] * vy + data[o + 10] * vz;
          maxLocalZ = Math.max(maxLocalZ, sr * (wx - m.x) + cr * (wz - m.z));
          if (!B.island.cavityAt(wx, wz, space) || space.caveIndex !== cave.caveIndex || wy < space.floor - 0.00001 || wy > space.ceiling + 0.00001) escaped++;
        }
      }
      let expected = 0, missing = 0, doubles = 0, unwanted = 0, shadeError = 0, mutationErrors = 0, positionError = 0, excluded = 0;
      const rows = rain.streams.map((stream, index) => {
        const values = groups[index], head = stream.maxY - mod(elapsed * stream.speed + stream.phase, stream.period), rows = [];
        if (!inspect) return { index, head, rows, speed: stream.speed, period: stream.period };
        for (let character = 0; character < stream.trainLength; character++) {
          const y = head + character * rain.spacing;
          let blocked = false;
          for (let i = 0; i < stream.blocked.length; i += 2) if (y >= stream.blocked[i] && y <= stream.blocked[i + 1]) blocked = true;
          const permitted = stream.rank < rain.densityRankLimit && y >= stream.minY && y <= stream.maxY && !blocked && W.travelDistance(stream.x, stream.z, cave.caveIndex) - 0.16 < W.radius;
          const matches = values.filter((v) => Math.abs(v.y - y) < 0.00001);
          if (!permitted) { excluded++; unwanted += matches.length; continue; }
          expected++; if (!matches.length) missing++; if (matches.length > 1) doubles += matches.length - 1;
          const tip = character === 0 ? 1 : character === 1 ? 0.55 : 0, glow = stream.brightness * (0.48 + (1 - character / stream.trainLength) * 0.52);
          const glyph = (character + Math.floor(elapsed * 20 + (stream.seed & 15) / 16) + (stream.seed & 7)) & 7;
          for (const value of matches) { shadeError = Math.max(shadeError, Math.abs(value.tip - tip), Math.abs(value.glow - glow)); positionError = Math.max(positionError, Math.abs(value.y - y)); if (value.glyph !== glyph) mutationErrors++; }
          rows.push({ character, y, matches });
        }
        unwanted += values.filter((v) => !rows.some((row) => Math.abs(row.y - v.y) < 0.00001)).length;
        return { index, head, speed: stream.speed, period: stream.period, rows };
      });
      return { id: cave.id, caveIndex: cave.caveIndex, streams: rain.streams.length, spacing: rain.spacing, density: rain.densityRankLimit, minimum: cave.minimumTravelDistance, count, drawn: rain.nodes.reduce((n, node) => n + node.drawInstanceCount, 0), reported: rain.activeGlyphCount,
        updates: rain.updates, versions: rain.nodes.map((n) => n.instanceVersion), capacities: rain.nodes.map((n) => n.instanceData.length / 20), capacity: rain.capacity, perGlyphCapacity: rain.perGlyphCapacity, bytes: rain.bufferBytes, buffers: rain.nodes.length,
        fixed: rain.nodes.every((n) => n.fixedInstanceCapacity && n.instanceCount <= rain.perGlyphCapacity), sharedStyle: rain.nodes.every((n, glyph) => n.geometry.verts === cave.nodes[glyph].geometry.verts && n.geometry.faces === cave.nodes[glyph].geometry.faces && n.geometry.matrixGlyph && n.geometry.matrixCave === cave.caveIndex),
        finite, upright, twoSided, leaders, second, trailing, minGlow, maxGlow, escaped, unknown, maxLocalZ, farthest, boundsError, expected, missing, doubles, unwanted, shadeError, mutationErrors, positionError, excluded, rows,
        seeds: rain.streams.map((s) => s.seed).join(","), speeds: new Set(rain.streams.map((s) => s.speed)).size, phases: new Set(rain.streams.map((s) => s.phase)).size, brightness: [Math.min(...rain.streams.map((s) => s.brightness)), Math.max(...rain.streams.map((s) => s.brightness))] };
    }) });
  step(true); const inactive = capture();
  C.viewInside(false); step(); advance(20); step(true); const unreached = capture();
  advance(26); step(true); const partial = capture(true);
  C.viewApproach(); step(); const reversed = capture(true);
  C.viewInside(false); step(); advance(W.maxRadius); step(true); const before = capture(true);
  for (let i = 0; i < 12; i++) step(); step(true); const after = capture(true), motion = [];
  for (const [caveIndex, cave] of before.caves.entries()) {
    let eligible = 0, moved = 0, gaps = 0, error = 0;
    for (const stream of cave.rows) {
      const next = after.caves[caveIndex].rows[stream.index], shift = stream.speed * (after.time - before.time);
      if (Math.abs(stream.head - shift - next.head) > 0.00001) { gaps++; continue; }
      for (const row of stream.rows) {
        const match = next.rows.find((r) => r.character === row.character);
        if (!match || !row.matches.length) continue;
        eligible++; if (match.matches.length === 1) { moved++; error = Math.max(error, Math.abs(match.matches[0].y - row.matches[0].y + shift), Math.abs(match.matches[0].x - row.matches[0].x), Math.abs(match.matches[0].z - row.matches[0].z)); }
      }
      if (!stream.rows.length || !next.rows.length) gaps++;
    }
    motion.push({ id: cave.id, eligible, moved, gaps, error });
  }
  const tiers = [before];
  for (const quality of ["medium", "low", "high"]) { R.setQuality(quality); step(true); tiers.push(capture(true)); }
  C.viewApproach(); step(); advance(20); step(true); const receded = capture();
  advance(0); step(true); const restored = capture();
  for (let i = 0; i < 12; i++) step(); const idle = capture();
  const current = C.caves.flatMap((c) => c.rain.nodes.map((n) => n.instanceData));
  const compact = (s) => ({ ...s, caves: s.caves.map(({ rows, ...c }) => c) });
  return { backend: R.kind, drawn: R.ready, buffersStable: buffers.every((buffer, i) => buffer === current[i]), totalBytes: buffers.reduce((n, b) => n + b.byteLength, 0), inactive: compact(inactive), unreached: compact(unreached), partial: compact(partial), reversed: compact(reversed), before: compact(before), after: compact(after), motion, tiers: tiers.map(compact), receded: compact(receded), restored: compact(restored), idle: compact(idle) };
};

export const matrixRainCycleProbe = async (prime = () => {}) => {
  const B = window.__ooga, scene = window.BL.scenes.hub;
  const wait = (condition) => new Promise((resolve, reject) => { const start = performance.now(), tick = () => condition() ? resolve() : performance.now() - start > 30000 ? reject(new Error("Rain scene cycle did not settle")) : requestAnimationFrame(tick); requestAnimationFrame(tick); });
  const activate = async () => { B.renderer.setQuality("high"); B.matrixCave.viewInside(false); await wait(() => B.matrixCave.world.radius === B.matrixCave.world.maxRadius); prime(); };
  const snapshot = () => ({ nodes: B.stats().allNodes, targets: B.stats().targets, rain: B.matrixCave.caves.map((c) => ({ id: c.id, streams: c.rain.streams.length, capacity: c.rain.capacity, bytes: c.rain.bufferBytes, count: c.rain.activeGlyphCount })) });
  await activate(); const before = snapshot(), oldRoot = scene.root, oldRain = B.matrixCave.caves.flatMap((c) => c.rain.nodes);
  B.go("lab"); await wait(() => B.scene === "lab"); const labFrame = B.renderedFrames;
  await wait(() => B.renderedFrames > labFrame + 24);
  const detached = oldRoot.children.length === 0 && oldRain.every((n) => n.parent === null), noHubDebug = scene.debug === null;
  B.go("hub"); await wait(() => B.scene === "hub"); const hubFrame = B.renderedFrames;
  await wait(() => B.renderedFrames > hubFrame + 24);
  const fresh = B.matrixCave.world.radius === 0 && !B.matrixCave.world.active && B.matrixCave.caves.every((c) => c.rain.activeGlyphCount === 0);
  await activate(); const after = snapshot(), newRain = B.matrixCave.caves.flatMap((c) => c.rain.nodes);
  return { before, after, detached, noHubDebug, fresh, distinct: newRain.every((n) => !oldRain.includes(n) && oldRain.every((old) => old.instanceData !== n.instanceData)), oldBuffers: oldRain.length, newBuffers: newRain.length };
};
