// The physical video cabinets, shared by the page and the room. Carnival tables have their own rules.
(() => {
  "use strict";
  const BL = globalThis.BL = globalThis.BL || {};
  const ids = ["cloud-hopper", "drop", "orbit", "mine", "invaders", "stampede", "pong", "snake", "flap", "breaker", "dash", "stacker"];
  const entries = ids.map((id, i) => {
    const a = (i - 1.5) * 0.265, turn = i < 4 ? -a : 0;
    const x = i < 4 ? 8 * Math.sin(a) : (i - 7.5) * 1.5;
    const z = i < 4 ? -0.2 - 8 * Math.cos(a) : -23.15;
    return Object.freeze({ id, x: x + Math.sin(turn) * 1.25, y: i < 4 ? 0.36 : 3.2,
      z: z + Math.cos(turn) * 1.25, yaw: turn + Math.PI });
  });
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  BL.arcadeCabinets = { entries, get: id => byId.get(id), FEATURE: "arcade-cabinets-v1" };
})();
