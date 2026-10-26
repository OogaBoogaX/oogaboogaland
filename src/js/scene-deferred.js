// The hub still registers first. Each single-scene implementation fills its existing shell when requested.
// A game still being built is listed in WIP as well as carrying `wip: true` in its definition: the director drops
// wip scenes at boot, before a hosted page has fetched a single definition.
(() => {
  "use strict";
  const WIP = [];
  for (const id of ["factory", "arcade", "race", "drop", "mine", "orbit"]) window.BL.deferred.scene(id, null, WIP.includes(id));
})();
