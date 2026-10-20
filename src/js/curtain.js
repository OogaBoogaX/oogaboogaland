// The loading curtain's line, picked where the curtain stands so its first paint is its last: the page's one
// script arrives megabytes later. The build inlines this as its own block (`data-early`).
(() => {
  "use strict";
  const SAYINGS = [
    "growing the island…", "counting the bananas…", "waking the Oogas…", "polishing the rocks…", "herding the clouds…",
    "lighting the torches…", "packing the leaf chutes…", "lashing sticks into a rocket…", "filling barrels with banana mash…",
    "warming up the Fire Pot…", "sweeping the rope bridge…", "feeding the fireflies…", "teaching cavemen to drive…",
    "hiding the jetpack…", "tightening the Vine Knots…", "fluffing the leaf beds…"
  ];
  document.getElementById("curtain-saying").textContent = SAYINGS[Math.floor(Math.random() * SAYINGS.length)];
})();
