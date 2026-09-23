(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // Ring slot position is a clock angle: 12 is far, 3 is right.
  const slot = (id, clock, scene = null, status = "dark", name = null, repo = null) => ({ id, clock, scene, status, name, repo });
  const slots = [
    slot("c11", 11, "lab", "open", "EntropyLab", "oogaboogax/entropylab"),
    slot("c10", 10, "dsb", "open", "DSB Land"),
    slot("c9", 9, "race", "open", "Ooga Rally", "oogaboogax/oogaboogaland"),
    slot("c730", 7.25, null, "headquarters", "Headquarters"),
    slot("c1", 1, null, "mirror", "Ooga Booga Land", "oogaboogax/oogaboogaland"),
    slot("c2", 2),
    slot("c3", 3),
    slot("c5", 4.75, null, "headquarters", "Headquarters")
  ];
  BL.caves = { slots, gate: { name: "The old gate" } };
})();
