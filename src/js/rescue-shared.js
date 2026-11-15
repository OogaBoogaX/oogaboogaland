// DSB rescue's public wire contract. No session, owner, audio or browser storage
// belongs in this frame. This is a separate component, not 300 additional Oogas.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const LIMITS = Object.freeze({ dogs: 300, piles: 512, bytes: 64 * 1024, stepMs: 1000, gapMs: 8000 });
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const exact = (o, keys) => !!o && typeof o === "object" && !Array.isArray(o)
    && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  const point = n => Number.isInteger(n) && Math.abs(n) <= 20000; // centimetres, matching rescue's 200 m save boundary
  const worldId = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  // Real scene/voice zones use dsb-*; older staged fixtures used dsb or dsb:*.
  const zoneId = s => typeof s === "string" && s.length <= 64 && /^dsb(?:-[a-z0-9-]{1,20}(?:\.[a-z0-9-]{1,16})?|:[A-Za-z0-9_.:-]{1,58})?$/.test(s);
  // dog: home slot, birth generation, breed, activity, x/y/z cm, yaw milliradians.
  // pile: monotonically increasing id, x/y/z cm. Removed ids never get reused.
  const validate = frame => {
    if (!exact(frame, ["v", "world", "epoch", "revision", "at", "dogs", "piles"])
      || frame.v !== 1 || !worldId(frame.world) || !integer(frame.epoch) || !frame.epoch
      || !integer(frame.revision) || !frame.revision || !integer(frame.at)
      || !Array.isArray(frame.dogs) || frame.dogs.length > LIMITS.dogs
      || !Array.isArray(frame.piles) || frame.piles.length > LIMITS.piles) return false;
    let slot = -1, pile = 0;
    for (const d of frame.dogs) {
      if (!Array.isArray(d) || d.length !== 8 || !integer(d[0]) || d[0] >= LIMITS.dogs || d[0] <= slot
        || !integer(d[1]) || !d[1] || !integer(d[2]) || d[2] >= 6 || !integer(d[3]) || d[3] > 4
        || !d.slice(4, 7).every(point) || !Number.isInteger(d[7]) || Math.abs(d[7]) > 6284) return false;
      slot = d[0];
    }
    for (const p of frame.piles) {
      if (!Array.isArray(p) || p.length !== 4 || !integer(p[0]) || p[0] <= pile || !p.slice(1).every(point)) return false;
      pile = p[0];
    }
    return new TextEncoder().encode(JSON.stringify(frame)).byteLength <= LIMITS.bytes;
  };
  // Complete snapshots make removal/replacement/reconnection one operation. A
  // lost delta cannot resurrect a cleaned pile. Validation precedes replacement.
  const create = world => {
    if (!worldId(world)) throw Error("rescue world required");
    let current = null, text = null;
    return {
      accept(frame) {
        if (!validate(frame) || frame.world !== world || current && (frame.epoch < current.epoch
          || frame.epoch === current.epoch && frame.revision < current.revision)) return false;
        const next = JSON.stringify(frame);
        if (current && frame.epoch === current.epoch && frame.revision === current.revision) return next === text;
        if (current && frame.at < current.at) return false;
        // Never retain a caller-owned mutable row.
        current = JSON.parse(next); text = next;
        for (const row of [...current.dogs, ...current.piles]) Object.freeze(row);
        Object.freeze(current.dogs); Object.freeze(current.piles); Object.freeze(current);
        return true;
      },
      get current() { return current; },
      // Quality selects presentation only; the full accepted state stays intact.
      visibleDogs(quality = "high") {
        const n = { high: 300, medium: 150, low: 60 }[quality];
        if (!n) throw Error("rescue quality");
        return current ? current.dogs.slice(0, n) : [];
      },
    };
  };
  BL.rescueShared = { LIMITS, integer, exact, point, worldId, zoneId, validate, create };
})();
