// The hub still registers first. Each single-scene implementation fills its existing shell when requested.
(() => {
  "use strict";
  for (const id of ["factory", "arcade", "race", "drop", "mine", "orbit"]) window.BL.deferred.scene(id);
})();
