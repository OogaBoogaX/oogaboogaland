// Private mutable Hub inputs. No browser saves, feeds, timers or player state.
// Actor health/weapons/random continuation belong to the source actor codecs.
import { boundedJSON } from './virtual-host.js';
import { hubCharacters, hubSwag, hubDaylight, hubPileMaximum } from './ooga-crew.js';
import { validateHubPile, hubPileLevel } from './hub-pile-source.js';

const fail = () => { throw Error('invalid private Hub state'); };
const stamp = n => Number.isSafeInteger(n) && n >= 0 && n <= 8640000000000000;
const id = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
const exact = (o, keys) => o && Object.keys(o).sort().join() === keys;

export function createHubWorldState(initial) {
  const names = new Set(hubCharacters.all().map(row => row.handle));
  const catalog = new Map(hubSwag.map(item => [item.id, item]));
  const validate = saved => {
    boundedJSON(saved, 16 * 1024, 2048);
    if (!(saved?.v === 1 && exact(saved, 'assignments,at,elapsed,inventory,level,tint,v')
      || saved?.v === 2 && exact(saved, 'assignments,at,elapsed,inventory,level,pile,tint,v'))
      || !stamp(saved.at) || !Number.isFinite(saved.elapsed) || saved.elapsed < 0
      || saved.elapsed > saved.at / 1000 || !Number.isFinite(saved.level)
      || saved.level < 0 || saved.level > hubPileMaximum || ![-1, 0, 1].includes(saved.tint)
      || !Array.isArray(saved.inventory) || saved.inventory.length > 200
      || !Array.isArray(saved.assignments) || saved.assignments.length > names.size) fail();
    if (saved.v === 2 && saved.pile !== null) {
      validateHubPile(saved.pile);
      if (saved.pile.at > saved.at) fail();
    }
    const entries = new Set(), owners = new Set(), assigned = new Set();
    for (const row of saved.inventory) {
      if (!Array.isArray(row) || row.length !== 2 || !id(row[0]) || !catalog.has(row[1]) || entries.has(row[0])) fail();
      entries.add(row[0]);
    }
    for (const row of saved.assignments) {
      if (!Array.isArray(row) || row.length !== 2 || !names.has(row[0]) || !entries.has(row[1])
        || owners.has(row[0]) || assigned.has(row[1])) fail();
      owners.add(row[0]); assigned.add(row[1]);
    }
    return true;
  };
  validate(initial);
  let at = initial.at, elapsed = initial.elapsed, tint = initial.tint, restored = false, pile = null;
  const world = { level: initial.level, weapons: new Map(), health: new Map() };
  const state = { inventory: [], assignments: Object.create(null) }, items = new Map();
  const apply = saved => {
    at = saved.at; elapsed = saved.elapsed; tint = saved.tint; world.level = saved.level;
    pile = saved.pile ? structuredClone(saved.pile) : null;
    if (pile) world.level = hubPileLevel(pile, at);
    state.inventory = saved.inventory.map(([id, itemId]) => ({ id, itemId }));
    for (const name of Object.keys(state.assignments)) delete state.assignments[name];
    for (const [name, entry] of saved.assignments) state.assignments[name] = entry;
    items.clear(); for (const row of state.inventory) items.set(row.id, catalog.get(row.itemId));
  };
  apply(initial);
  const light = { moon: {}, light: {}, sunDirection: {}, starMatrix: new Float32Array(9) };
  for (const key of ['clear', 'horizon', 'zenith', 'sky', 'ground', 'sun', 'direct']) light[key] = new Float32Array(3);
  let sampledAt = -1;
  const capture = () => {
    const saved = { v: 2, at, elapsed, level: world.level, tint, pile: pile && { ...pile },
      inventory: state.inventory.map(row => [row.id, row.itemId]), assignments: Object.entries(state.assignments) };
    validate(saved); return saved;
  };
  return {
    world, game: { state, itemOf: entry => items.get(entry) || null },
    clock: () => at, tintWanted: () => tint, elapsed: () => elapsed,
    stars() {
      if (sampledAt !== at) {
        const date = new Date(at), yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
        const day = (at - yearStart) / 86400000, hour = (at % 86400000) / 3600000;
        hubDaylight.sample(hour, light, Math.floor(day) + 1, hubDaylight.ISLAND_LATITUDE_DEG, day, at);
        sampledAt = at;
      }
      return light.stars;
    },
    advance(ms, wallAt) {
      if (ms !== 250 || !stamp(wallAt) || wallAt < at || !Number.isFinite(elapsed + ms / 1000)) fail();
      at = wallAt; elapsed += ms / 1000;
      if (pile) world.level = hubPileLevel(pile, at);
    },
    capture,
    validateUpdate(value) {
      if (!exact(value, 'assignments,inventory,level,tint') && !exact(value, 'assignments,inventory,level,pile,tint')) fail();
      // Intake may arrive between simulation ticks. Event timing separately
      // bounds the source timestamp; this does not advance the world's clock.
      return validate({ ...capture(), ...value, at: Math.max(at, value.pile?.at || 0) });
    },
    applyUpdate(value) {
      if (!exact(value, 'assignments,inventory,level,tint') && !exact(value, 'assignments,inventory,level,pile,tint')) fail();
      const next = { ...capture(), ...value }; validate(next); apply(next);
    },
    restore(saved) {
      if (restored) fail(); validate(saved); apply(saved); sampledAt = -1; restored = true;
    },
    validate() { capture(); return true; },
  };
}
