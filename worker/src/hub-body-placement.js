// Standard-body clearance for admission, live samples and reclaim. Passive
// NPCs reserve no space; retained player bodies still fence safe reclaim.
import { BODY_STORAGE } from './host-body-storage.js';
const fail = () => { throw Error('invalid Hub body placement request'); };
export function createHubBodyPlacement(actors, placement) {
  const shapes = new Map(), maximum = { ooga: { radius: 0, height: 0 }, clanker: { radius: 0, height: 0 } };
  for (const cave of actors.crew.list) {
    const companion = actors.clankers.list.find(entry => entry.owner === cave);
    if (!companion) fail();
    const shape = { ooga: { radius: Math.max(.3, cave.bodyRadius), height: cave.bodyHeight },
      clanker: { radius: Math.max(1.9, companion.gorilla.bodyRadius + .1), height: Math.max(2.2, companion.gorilla.bodyHeight + .04) } };
    for (const kind of ['ooga', 'clanker']) {
      if (![shape[kind].radius, shape[kind].height].every(n => Number.isFinite(n) && n > 0 && n <= 10)) fail();
      maximum[kind].radius = Math.max(maximum[kind].radius, shape[kind].radius);
      maximum[kind].height = Math.max(maximum[kind].height, shape[kind].height);
    }
    shapes.set(cave.traits.name, shape);
  }
  return (name, kind, p, occupied) => {
    const shape = shapes.get(name)?.[kind];
    if (!shape || !p || ![p.x, p.y, p.z, p.yaw].every(Number.isFinite)
      || !Array.isArray(occupied) || occupied.length > BODY_STORAGE.maxBodies) fail();
    for (const row of occupied) {
      const other = maximum[row?.kind], q = row?.motion;
      if (!other || !q || ![q.x, q.y, q.z].every(Number.isFinite)) fail();
      if (p.y < q.y + other.height && p.y + shape.height > q.y
        && Math.hypot(p.x - q.x, p.z - q.z) < shape.radius + other.radius + .15) return null;
    }
    return placement.playerPlacement({ kind }, p, shape);
  };
}
