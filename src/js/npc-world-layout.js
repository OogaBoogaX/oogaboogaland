// Bounded layout recipe carried with a complete authoritative world frame.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX_BYTES = 512;
  const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).sort().join() === keys;
  const level = n => Number.isFinite(n) && n >= 0 && n <= 10000000;
  const count = n => Number.isInteger(n) && n >= 0 && n <= 53;
  const history = h => exact(h, "count,level,ring,v") && h.v === 1 && level(h.level)
    && count(h.count) && Number.isFinite(h.ring) && h.ring >= 0 && h.ring <= 30;
  const water = w => {
    if (!exact(w, "v,values") || w.v !== 1 || !Array.isArray(w.values) || w.values.length !== 13
      || Object.keys(w.values).length !== 13) return false;
    const r = w.values;
    return r.slice(0, 4).every(n => Number.isFinite(n) && Math.abs(n) <= 1000000)
      && Number.isInteger(r[4]) && r[4] >= 0 && r[4] <= 2 && typeof r[5] === "boolean"
      && [r[6], r[7], r[12]].every(n => Number.isSafeInteger(n) && n >= 0)
      && r[6] <= r[12] && ["unavailable", "live", "stale"].includes(r[8])
      && r[9] === null && typeof r[10] === "boolean" && r[11] === null;
  };
  const validate = value => {
    if (!exact(value, "count,history,pile,v,water") || value.v !== 1 || !history(value.history)
      || !level(value.pile) || !count(value.count) || !water(value.water)
      || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES)
      throw Error("invalid NPC world layout");
    return value;
  };
  const sameRecipe = (a, b) => !!a && !!b && a.v === b.v && a.level === b.level && a.count === b.count;
  BL.npcWorldLayout = { MAX_BYTES, validate, history, sameRecipe };
})();
