// Hosted work trips use the authored mainland spokes and pile ring only.
// No graph, obstacle search, bed route or satellite-island connection. A blocked
// fixed segment waits; scenery never triggers a new cross-world journey.
export function createHubRoutinePaths(island) {
  const path = island.path, capacity = 512;
  const lines = path.centerlines.filter(points => points.length > 1
    && Math.hypot(points[0].x, points[0].z) < island.meadowRadius
    && Math.hypot(points.at(-1).x, points.at(-1).z) <= island.meadowRadius + .01);
  if (!lines.length || lines.length > 32 || lines.some(line => line.length > 256))
    throw Error('unsupported authored mainland routes');
  const createState = () => ({ tx: NaN, tz: NaN, version: -1, count: 0, index: 0,
    plans: 0, targetX: 0, targetZ: 0, laneX: new Float64Array(capacity), laneZ: new Float64Array(capacity) });
  const nearest = (x, z, radius) => {
    let result = null, distance = Infinity;
    for (const line of lines) for (let i = 0; i < line.length; i++) {
      const p = line[i];
      if (Math.hypot(p.x, p.z) < radius) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < distance) { distance = d; result = { line, i }; }
    }
    return result;
  };
  const append = (s, x, z) => {
    if (s.count && Math.hypot(s.laneX[s.count - 1] - x, s.laneZ[s.count - 1] - z) < .01) return;
    if (s.count === capacity) throw Error('authored mainland route capacity');
    s.laneX[s.count] = x; s.laneZ[s.count++] = z;
  };
  const prepare = (s, p, tx, tz) => {
    s.tx = tx; s.tz = tz; s.version = path.version; s.count = s.index = 0; s.plans++;
    const radius = path.debug.ringTrafficRadius ?? path.debug.ringCenterRadius;
    if (!Number.isFinite(radius) || radius <= 0) throw Error('invalid pile ring');
    const from = Math.hypot(p.x, p.z) > radius + .5 ? nearest(p.x, p.z, radius) : null;
    const to = Math.hypot(tx, tz) > radius + .5 ? nearest(tx, tz, radius) : null;
    // Same-spoke travel follows its existing samples directly in either direction.
    if (from && to && from.line === to.line) {
      const step = from.i <= to.i ? 1 : -1;
      for (let i = from.i; ; i += step) {
        append(s, from.line[i].x, from.line[i].z);
        if (i === to.i) break;
      }
    } else {
      let x = p.x, z = p.z;
      if (from) for (let i = from.i; i >= 0; i--) {
        const q = from.line[i];
        if (Math.hypot(q.x, q.z) < radius) break;
        append(s, q.x, q.z); x = q.x; z = q.z;
      }
      let first = to?.i;
      while (first > 0 && Math.hypot(to.line[first - 1].x, to.line[first - 1].z) >= radius) first--;
      const end = to ? to.line[first] : { x: tx, z: tz };
      const start = Math.atan2(x, z), finish = Math.atan2(end.x, end.z);
      const angle = Math.atan2(Math.sin(finish - start), Math.cos(finish - start));
      const steps = Math.max(1, Math.ceil(Math.abs(angle) * radius / .5));
      for (let i = 0; i <= steps; i++) {
        const a = start + angle * i / steps;
        append(s, Math.sin(a) * radius, Math.cos(a) * radius);
      }
      if (to) for (let i = first; i <= to.i; i++) append(s, to.line[i].x, to.line[i].z);
    }
    append(s, tx, tz);
  };
  return {
    createState, capacity,
    target(cave, tx, tz) {
      const s = cave.pathing, p = cave.root.position;
      if (![p.x, p.z, tx, tz].every(Number.isFinite)) throw Error('invalid routine waypoint');
      if (s.tx !== tx || s.tz !== tz || s.version !== path.version) prepare(s, p, tx, tz);
      while (s.index < s.count && Math.hypot(s.laneX[s.index] - p.x, s.laneZ[s.index] - p.z) < .08) s.index++;
      s.targetX = s.index < s.count ? s.laneX[s.index] : tx;
      s.targetZ = s.index < s.count ? s.laneZ[s.index] : tz;
    },
  };
}
