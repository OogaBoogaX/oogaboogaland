// Both Hub window geometry and the deferred donation flow use this one square glass size.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  BL.factoryKiosk = { W: 400, H: 400 };
})();
