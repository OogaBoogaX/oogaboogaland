// Shared bounded banana-pile arrival search. Geometry and occupied bodies are
// checked by the caller; this never moves an NPC or falls back to an old bed.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const find = ({ platformRadius, allowed, random = Math.random }, out, initial = false, search = null) => {
    if (!Number.isFinite(platformRadius) || platformRadius <= 0 || typeof allowed !== "function"
      || typeof random !== "function" || !out || typeof initial !== "boolean"
      || search && (!Number.isFinite(search.angle) || !Number.isSafeInteger(search.next)
        || search.next < 0 || search.next > (initial ? 288 : 192)))
      throw Error("invalid Hub arrival search");
    const draw = () => {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error("invalid Hub arrival random source");
      return value;
    };
    const inner = Math.max(5, platformRadius + 1.3), outer = inner + 3;
    const start = search ? search.angle : initial ? 0 : draw() * Math.PI * 2;
    // Deterministic arrivals examine six rings. Ordinary respawns try 48
    // random positions first, then three rings, matching the source Hub.
    for (let attempt = search ? search.next : 0; attempt < (initial ? 288 : 192); attempt++) {
      const scan = initial ? attempt : attempt - 48;
      const angle = scan < 0 ? draw() * Math.PI * 2 : start + (scan % 48) * Math.PI / 24;
      const distance = scan < 0 ? Math.sqrt(inner * inner + (outer * outer - inner * inner) * draw())
        : inner + 0.5 + Math.floor(scan / 48);
      const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
      if (allowed(x, 0, z) !== true) continue;
      out.x = x; out.y = 0; out.z = z;
      if (search) search.next = attempt + 1;
      return true;
    }
    return false;
  };
  BL.hubArrival = { find };
})();
