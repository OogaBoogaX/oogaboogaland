// Shared character motion constants. No controls, camera, DOM or player state.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  BL.walkRules = { speed: 7.75, run: 1.5, gravity: 9.8, step: 0.6, ledgeRise: 2.4, ledgeSpeed: 3, ledgeDrag: 1.5 };
})();
