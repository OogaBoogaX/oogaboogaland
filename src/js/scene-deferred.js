// The hub still registers first. Each single-scene implementation fills its existing shell when requested.
// A game still being built is listed in WIP as well as carrying `wip: true` in its definition: the director drops
// wip scenes at boot, before a hosted page has fetched a single definition.
(() => {
  "use strict";
  const WIP = ["keep"];
  for (const id of ["factory", "hangar", "arcade", "race", "drop", "mine", "orbit", "studio", "block", "raid", "poker", "keep"]) window.BL.deferred.scene(id, null, WIP.includes(id));
  // The Keep's halls share its chunk, and open whenever it does (`wipOf`).
  window.BL.deferred.scene("keephalls", null, true, "keep-scene").wipOf = "keep";
  // Every game in the arcade's hall but a stage cabinet: the carnival machines and each mezzanine cabinet's retro game,
  // read as scene-carnival.js reads them, all filled by its one chunk.
  const AM = window.BL.arcadeModels;
  for (const id of ["skee", "hoops", "shy", "claw", "hockey", "billiards", "darts", "pinball", "ride", ...AM.CABINETS.filter((c) => c.retro >= 0).map((c) => AM.RETRO[c.retro].id)]) window.BL.deferred.scene(id, null, false, "carnival-scene");
})();
