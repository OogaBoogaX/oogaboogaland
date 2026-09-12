// Independent physical-surface oracle: use original terrain faces and uploaded
// native matrices, never the builder's inset intervals as the coverage truth.
export const matrixHorizontalProbe = () => {
  const B = window.__ooga, C = B.matrixCave, scene = window.BL.scenes.hub, R = B.renderer, area = 0.079 * 0.121;
  const mod = (n, span) => (n % span + span) % span, planeKey = (ny, y) => `${ny}:${Math.round(y * 10000)}`;
  const intersection = (polygon, u, v) => {
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
    let result = 0;
    for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; result += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(result) / 2;
  };
  const caves = C.caves.map((cave) => {
    const m = cave.mouth, dx = m.inside.x - m.apron.x, dz = m.inside.z - m.apron.z, length = Math.hypot(dx, dz), inwardX = dx / length, inwardZ = dz / length, ux = -inwardZ, uz = inwardX;
    const planes = new Map(), geometry = B.island.geometry;
    for (const face of geometry.faces) {
      if (face.matrixCave !== cave.caveIndex) continue;
      const points = face.i.map((i) => [geometry.verts[i * 3], geometry.verts[i * 3 + 1], geometry.verts[i * 3 + 2]]), a = points[0], b = points[1], d = points[2];
      if (!points.every((p) => Math.abs(p[1] - a[1]) < 1e-8)) continue;
      const ny = Math.sign((b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]));
      if (!ny) continue;
      const key = planeKey(ny, a[1]);
      if (!planes.has(key)) planes.set(key, { key, y: a[1], ny, polygons: [], lanes: new Map() });
      planes.get(key).polygons.push(points.map((p) => [ux * p[0] + uz * p[2], ny * (inwardX * p[0] + inwardZ * p[2])]));
    }
    let phaseMismatch = 0, directionError = 0;
    for (const stream of cave.streams) {
      const s = cave.sections[stream.section];
      if (!s.horizontal) continue;
      directionError = Math.max(directionError, Math.abs(s.vx * stream.direction - inwardX), Math.abs(s.vy * stream.direction), Math.abs(s.vz * stream.direction - inwardZ));
      if (s.source !== "terrain") continue;
      const plane = planes.get(planeKey(Math.sign(s.ny), s.plane * s.ny)), column = Math.round(stream.cross / 0.12);
      if (!plane || R.kind === "canvas2d" && mod(column, 8) !== 0) continue;
      const lane = plane.lanes.get(column);
      if (lane) {
        if (["speed", "phase", "brightness", "trainLength", "gapLength", "seed", "direction"].some((name) => lane.stream[name] !== stream[name])) phaseMismatch++;
      } else plane.lanes.set(column, { column, cross: column * 0.12, stream });
    }
    const selected = [];
    for (const ny of [1, -1]) {
      const candidates = [];
      for (const plane of planes.values()) if (plane.ny === ny) for (const lane of plane.lanes.values()) {
        const polygons = plane.polygons.filter((p) => Math.min(...p.map((v) => v[0])) <= lane.cross + 0.0395 && Math.max(...p.map((v) => v[0])) >= lane.cross - 0.0395);
        if (!polygons.length) continue;
        const min = Math.min(...polygons.flatMap((p) => p.map((v) => v[1]))), max = Math.max(...polygons.flatMap((p) => p.map((v) => v[1])));
        candidates.push({ ...lane, plane, polygons, min, max, key: `${plane.key}:${lane.column}` });
      }
      candidates.sort((a, b) => b.max - b.min - (a.max - a.min) || Math.abs(a.cross - ux * m.x - uz * m.z) - Math.abs(b.cross - ux * m.x - uz * m.z));
      selected.push(...candidates.slice(0, 3));
    }
    return { cave, m, inwardX, inwardZ, ux, uz, planes, selected, phaseMismatch, directionError };
  });
  const capture = () => {
    const time = C.world.sampleStream(0).time;
    return { time, caves: caves.map((c) => {
      const actual = new Map(); let count = 0, axisError = 0, laneError = 0;
      for (const [glyph, node] of c.cave.nodes.entries()) for (let i = 0; i < node.instanceCount; i++) {
        const d = node.instanceData, o = i * 20, ny = Math.sign(d[o + 9]);
        if (Math.abs(d[o + 9]) < 0.999) continue;
        count++;
        axisError = Math.max(axisError, Math.abs(d[o] - c.ux), Math.abs(d[o + 1]), Math.abs(d[o + 2] - c.uz), Math.abs(d[o + 4] - ny * c.inwardX), Math.abs(d[o + 5]), Math.abs(d[o + 6] - ny * c.inwardZ), Math.abs(d[o + 8]), Math.abs(d[o + 9] - ny), Math.abs(d[o + 10]));
        const u = c.ux * d[o + 12] + c.uz * d[o + 14], v = ny * (c.inwardX * d[o + 12] + c.inwardZ * d[o + 14]), column = Math.round(u / 0.12), key = `${planeKey(ny, d[o + 13] - ny * 0.015)}:${column}`;
        laneError = Math.max(laneError, Math.abs(u - column * 0.12));
        if (!actual.has(key)) actual.set(key, []);
        actual.get(key).push({ u, v, glyph, glow: d[o + 16], tip: d[o + 18] });
      }
      const lanes = c.selected.map((lane) => {
        const stream = lane.stream, values = actual.get(lane.key) || [], travel = time * stream.speed + stream.phase, sequence = stream.trainLength + stream.gapLength, rows = [];
        let expected = 0, missing = 0, doubles = 0, gaps = 0, filledGaps = 0, seamRows = 0, excludedRows = 0, unsafe = 0, shadeError = 0, spacingError = 0, mutationErrors = 0;
        for (const value of values) spacingError = Math.max(spacingError, Math.abs((value.v - stream.direction * travel) / 0.13 - Math.round((value.v - stream.direction * travel) / 0.13)) * 0.13);
        const low = Math.floor((lane.min - stream.direction * travel) / 0.13) - 1, high = Math.ceil((lane.max - stream.direction * travel) / 0.13) + 1;
        for (let cell = low; cell <= high; cell++) {
          const v = cell * 0.13 + stream.direction * travel, matches = values.filter((value) => Math.abs(value.v - v) < 0.00002), pieces = lane.polygons.map((polygon) => intersection(polygon, lane.cross, v)), sum = pieces.reduce((n, a) => n + a, 0);
          const localZ = -(lane.plane.ny * v - c.inwardX * c.m.x - c.inwardZ * c.m.z), backed = Math.abs(sum - area) < 1e-10 && localZ + 0.0605 <= 0.48000001;
          if (!backed) { excludedRows++; unsafe += matches.length; continue; }
          const position = mod(-stream.direction * cell, sequence), gap = position >= stream.trainLength, seam = pieces.filter((piece) => piece > 1e-8).length > 1;
          if (gap) { gaps++; filledGaps += matches.length; } else {
            expected++; if (!matches.length) missing++; if (matches.length > 1) doubles += matches.length - 1; if (seam) seamRows++;
            const tip = position === 0 ? 1 : position === 1 ? 0.55 : 0, glow = stream.brightness * (0.48 + (1 - position / stream.trainLength) * 0.52);
            const glyph = (cell + Math.floor(time * 20 + (stream.seed & 15) / 16) + (stream.seed & 7)) & 7;
            for (const value of matches) { shadeError = Math.max(shadeError, Math.abs(value.tip - tip), Math.abs(value.glow - glow)); if (value.glyph !== glyph) mutationErrors++; }
          }
          rows.push({ cell, v, gap, seam, matches });
        }
        return { key: lane.key, kind: lane.plane.ny > 0 ? "floor" : "ceiling", speed: stream.speed, direction: stream.direction, expected, missing, doubles, gaps, filledGaps, seamRows, excludedRows, unsafe, shadeError, spacingError, mutationErrors, rows };
      });
      return { id: c.cave.id, count, axisError, laneError, phaseMismatch: c.phaseMismatch, directionError: c.directionError, planes: c.planes.size, lanes };
    }) };
  };
  const before = capture(); let elapsed = before.time;
  for (let i = 0; i < 6; i++) scene.update(1 / 60, elapsed += 1 / 60);
  const drawn = R.render(scene.root, B.camera, B.renderOpts), after = capture(), motion = [];
  for (let i = 0; i < before.caves.length; i++) for (const lane of before.caves[i].lanes) {
    const next = after.caves[i].lanes.find((v) => v.key === lane.key), shift = lane.direction * lane.speed * (after.time - before.time);
    let eligible = 0, moved = 0, seams = 0, error = 0, gapPairs = 0;
    for (const row of lane.rows) {
      const match = next.rows.find((v) => v.cell === row.cell);
      if (!match) continue;
      if (row.gap && match.gap) { gapPairs++; continue; }
      if (row.gap || !row.matches.length) continue;
      eligible++; if (row.seam || match.seam) seams++;
      if (match.matches.length === 1) { moved++; error = Math.max(error, Math.abs(match.matches[0].v - row.matches[0].v - shift), Math.abs(match.matches[0].u - row.matches[0].u)); }
    }
    motion.push({ id: before.caves[i].id, kind: lane.kind, eligible, moved, seams, gapPairs, distance: Math.abs(shift), error });
  }
  const compact = (snapshot) => ({ time: snapshot.time, caves: snapshot.caves.map((c) => ({ ...c, lanes: c.lanes.map(({ rows, ...lane }) => lane) })) });
  return { backend: R.kind, active: C.world.active, radius: C.world.radius, isolated: C.world.referenceCaveLayerIsolated, drawn, before: compact(before), after: compact(after), motion };
};
