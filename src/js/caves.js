(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Ring slot position is a clock angle: 12 is far, 3 is right.
  const slot = (id, clock, scene = null, status = "dark", name = null, repo = null) => ({ id, clock, scene, status, name, repo });
  const slots = [
    slot("c11", 11, "lab", "open", "EntropyLab", "oogaboogax/entropylab"),
    // The hub's ten point lights are spoken for by the other open mouths and the fire pit, so the mine's
    // torches and lantern glow without casting light of their own.
    { ...slot("c10", 10, "mine", "open", "Ooga Mine"), glowOnly: true },
    slot("c9", 9, "race", "open", "Ooga Rally", "oogaboogax/oogaboogaland"),
    slot("c730", 7.25, null, "headquarters", "Headquarters"),
    slot("c1", 1, null, "mirror", "Ooga Booga Land", "oogaboogax/oogaboogaland"),
    slot("c2", 2),
    slot("c3", 3),
    slot("c5", 4.75, null, "headquarters", "Headquarters")
  ];
  BL.caves = { slots, gate: { name: "The old gate" } };
})();
