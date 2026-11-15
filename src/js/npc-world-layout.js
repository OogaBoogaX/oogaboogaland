// Bounded layout recipe carried with a complete authoritative world frame.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX_BYTES = 512;
  const exact = (v, keys) => v && !Array.isArray(v) && Object.keys(v).sort().join() === keys;
  const level = n => Number.isFinite(n) && n >= 0 && n <= 10000000;
  const count = n => Number.isInteger(n) && n >= 0 && n <= (BL.npcAuthority?.MAX_OOGAS ?? 64);
  const history = h => exact(h, "count,level,ring,v") && h.v === 1 && level(h.level)
    && count(h.count) && Number.isFinite(h.ring) && h.ring >= 0 && h.ring <= 30;
  const validate = value => {
    if (!exact(value, "count,history,pile,v") || value.v !== 1 || !history(value.history)
      || !level(value.pile) || !count(value.count)
      || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES)
      throw Error("invalid NPC world layout");
    return value;
  };
  const sameRecipe = (a, b) => !!a && !!b && a.v === b.v && a.level === b.level && a.count === b.count;
  BL.npcWorldLayout = { MAX_BYTES, validate, history, sameRecipe };
})();
