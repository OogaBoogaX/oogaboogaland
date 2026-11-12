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
  // Four more stand recessed two a side into the walls of the cave in front of the hall's doors (#554). Which game each
  // shows is the page's own reading of the plays (`arcade-popular.js`), so the seat belongs to the game (`<id>@out`,
  // separate from the one in the hall, so the two play at once and share its board) and `slot` says where it stands.
  // In the mouth's frame, +z out of the cave; MOUTH is where terrain.js puts the 3 o'clock mouth (the suite checks it).
  const OUTDOOR = "@out", MOUTH = Object.freeze({ x: 22, z: 0, ry: -Math.PI / 2 });
  // Just inside the mouth, well short of the doors, at the hall's own spacing; the terrain's shallow alcoves (`ARCADE_CAVE`) take their backs.
  const NICHE = Object.freeze({ along: Object.freeze([1.15, 2.65]), x: 3.37 });
  const sr = Math.sin(MOUTH.ry), cr = Math.cos(MOUTH.ry);
  // Nearest the mouth first, left then right, so the most played stand where a visitor comes in.
  const slots = Object.freeze(NICHE.along.flatMap((along, row) => [-1, 1].map((side, n) => {
    const lx = side * NICHE.x, lz = -along, turn = -side * Math.PI / 2, px = lx + Math.sin(turn) * 1.25, pz = lz + Math.cos(turn) * 1.25;
    return Object.freeze({ slot: row * 2 + n, lx, lz, turn, playX: px, playZ: pz, x: MOUTH.x + cr * px + sr * pz, y: 0,
      z: MOUTH.z - sr * px + cr * pz, yaw: MOUTH.ry + turn + Math.PI, side });
  })));
  const outdoorSeat = id => id + OUTDOOR;
  const get = id => {
    if (typeof id === "string" && id.endsWith(OUTDOOR) && byId.has(id.slice(0, -OUTDOOR.length))) return Object.freeze({ id, game: id.slice(0, -OUTDOOR.length), outdoor: true });
    return byId.get(id);
  };
  BL.arcadeCabinets = { entries, get, slots, slot: i => slots[i], outdoorSeat, MOUTH, NICHE, FEATURE: "arcade-cabinets-v1", OUTDOOR_FEATURE: "arcade-outdoor-v1" };
})();
