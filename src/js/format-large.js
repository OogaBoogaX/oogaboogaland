// Counts from a thousand up, shortened to a figure and a unit (1.2K, 34K, 5.6M): the page's one way, which game.js
// re-exports as `formatLarge` and the panels Ooga Chat shares (roster-panel.js) use too. Reads nothing at load.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const UNITS = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const formatLarge = (n) => {
    const unit = UNITS.find(([size]) => n >= size);
    if (!unit) return String(n);
    const v = n / unit[0];
    return `${v < 10 ? (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, "") : Math.floor(v)}${unit[1]}`;
  };
  BL.largeNumbers = { UNITS, formatLarge };
  BL.formatLarge = formatLarge;
})();
