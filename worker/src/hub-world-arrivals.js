// Fresh login positions over the actual private Hub actors. This is read-only:
// arriving players never wake, relocate or possess their independent NPC track.
import '../../src/js/hub-arrival.js';
import { MAX_SESSIONS } from './host-sessions.js';

const fail = message => { throw Error(message); };
const kinds = ['ooga', 'clanker'];
const finitePosition = p => p && [p.x, p.y, p.z, p.yaw].every(Number.isFinite);

export function createHubWorldArrivals({ geometry, crew, clankers, npcIdFor, placement }) {
  if (!geometry?.altar || !geometry?.island || crew?.authoritative !== true
    || !Array.isArray(crew.list) || crew.list.length > 53 || !Array.isArray(clankers?.list)
    || clankers.list.length !== crew.list.length
    || typeof npcIdFor !== 'function' || typeof placement !== 'function')
    fail('actual Hub arrival providers required');
  const names = new Map(), sizes = new Map(), maximum = {
    ooga: { radius: .3, height: 1.6 }, clanker: { radius: 1.9, height: 2.2 } };
  for (const cave of crew.list) {
    const companion = clankers.list.find(entry => entry.owner === cave);
    if (!companion || typeof cave.traits?.name !== 'string') fail('Hub arrival roster mismatch');
    const name = cave.traits.name.toLowerCase();
    if (names.has(name)) fail('duplicate Hub arrival identity');
    names.set(name, { cave, companion });
    const shape = {
      ooga: { radius: Math.max(.3, cave.bodyRadius), height: cave.bodyHeight },
      clanker: { radius: Math.max(1.9, companion.gorilla.bodyRadius + .1),
        height: Math.max(2.2, companion.gorilla.bodyHeight + .04) } };
    for (const kind of kinds) {
      const value = shape[kind];
      if (![value.radius, value.height].every(n => Number.isFinite(n) && n > 0 && n <= 10))
        fail('invalid Hub standing body shape');
      maximum[kind].radius = Math.max(maximum[kind].radius, value.radius);
      maximum[kind].height = Math.max(maximum[kind].height, value.height);
    }
    sizes.set(name, shape);
  }
  return (who, { occupied } = {}) => {
    if (!who || !Number.isSafeInteger(who.accountId) || who.accountId < 1
      || who.bodyId !== `player:${who.accountId}` || typeof who.handle !== 'string' || !kinds.includes(who.kind)
      || !Array.isArray(occupied) || occupied.length > MAX_SESSIONS) fail('trusted Hub arrival identity and occupancy required');
    const mapped = names.get(who.handle.toLowerCase());
    // Unknown-character construction is a separate admission path. Never
    // invent an NPC, dimensions or identity from client-supplied coordinates.
    if (!mapped) fail('Hub arrival character unavailable');
    const { cave, companion } = mapped, actor = who.kind === 'ooga' ? cave : companion;
    const npcId = npcIdFor(who);
    if (typeof npcId !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(npcId)) fail('Hub arrival NPC mapping unavailable');
    const shape = sizes.get(who.handle.toLowerCase())[who.kind];
    const seen = new Set();
    for (const row of occupied) {
      if (!row || typeof row.bodyId !== 'string' || seen.has(row.bodyId) || !kinds.includes(row.kind)
        || typeof row.zone !== 'string' || !finitePosition(row.motion)) fail('invalid Hub arrival occupancy');
      seen.add(row.bodyId);
    }
    const heading = who.kind === 'ooga' ? actor.root.rotation.y : companion.heading;
    const position = { x: actor.root.position.x, y: actor.root.position.y - (who.kind === 'ooga' ? cave.baseY : 0),
      z: actor.root.position.z, yaw: Math.atan2(Math.sin(heading), Math.cos(heading)) };
    const check = p => {
      if (!finitePosition(p)) fail('invalid Hub arrival position');
      // Every body supplied here belongs to the Hub's shared coordinate world,
      // including its caves/islets. Conservatively reserve the largest standard
      // shape of that kind; passive NPCs intentionally reserve no player space.
      for (const row of occupied) {
        if (row.bodyId === who.bodyId) continue;
        const q = row.motion, other = maximum[row.kind];
        if (p.y < q.y + other.height && p.y + shape.height > q.y
          && Math.hypot(p.x - q.x, p.z - q.z) < shape.radius + other.radius + .15) return null;
      }
      const result = placement({ ...who }, { ...p }, { ...shape });
      if (result === null) return null;
      if (!result || result.then || Object.keys(result).join() !== 'grounded' || typeof result.grounded !== 'boolean')
        fail('invalid Hub arrival clearance result');
      return result;
    };
    let accepted;
    if (cave.state === 'away') {
      position.yaw = 0;
      if (!globalThis.BL.hubArrival.find({ platformRadius: geometry.altar.platformRadius,
        allowed(x, y, z) {
          if (geometry.island.surfaceAt(x, z) !== 0) return false;
          const result = check({ x, y, z, yaw: 0 });
          if (!result?.grounded) return false;
          accepted = result; return true;
        } }, position, true)) fail('no safe banana-pile arrival available');
    } else {
      if (!actor.root.visible || who.kind === 'clanker' && !companion.active)
        fail('NPC arrival position temporarily unavailable');
      accepted = check(position);
      if (!accepted) fail('NPC arrival position obstructed');
    }
    const ooga = who.kind === 'ooga';
    return { npcId, feetOffset: ooga ? cave.baseY : 0, zone: 'outside', body: {
      kind: who.kind, motion: { ...position, vx: 0, vy: 0, vz: 0, grounded: accepted.grounded },
      equipment: { weapon: null, mode: 'carry', primaryOwned: ooga && cave.weapon.primaryOwned,
        secondaryOwned: ooga && cave.weapon.secondaryOwned, selectedSlot: 1,
        unlimited: false, jetpack: false, jetpackOwned: ooga && cave.jetpackOwned } } };
  };
}
