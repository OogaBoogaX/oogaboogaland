// The World Map's appearance, set before the page draws: this browser's choice (System, Light or Dark, localStorage
// ooga-theme, which the inspector at /inspect shares) on <html data-theme>; no attribute follows the system. Loaded
// ahead of the stylesheet, its own file since the page's policy allows no inline script; map.js wires the switch.
(() => {
  "use strict";
  try {
    const chosen = localStorage.getItem("ooga-theme");
    if (chosen === "light" || chosen === "dark") document.documentElement.dataset.theme = chosen;
  } catch { /* Storage refused: the system's. */ }
})();
