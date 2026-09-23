(() => {
  "use strict";
  const BL = window.BL;
  BL.characters.add({
    handle: "RandyMcMillan",
    joined: 1788800919,
    lastCommit: 1788210011,
    look: { portrait: { min: [-1, -2, -1], max: [7, 10, 8] }, hairless: true, noBrow: true, face: "smirk", hatY: 11, skin: "#f3b52a", hair: "#151515" },
    dress: {
      // The Bee: black bands round the fuzz and two pale wings folded off the back
      torso(k, v) {
        const P = k.P;
        v.fill(1, 7, 4, 4, 1, 4, P.black);
        v.fill(1, 7, 6, 6, 1, 4, P.black);
        const vein = k.jit(k.color("#e4f3fb"), k.color("#bcdcec"), 0.3);
        for (const cx of [0.5, 7.5]) v.fill(-2, 10, 2, 10, -1, -1, (x, y) => ((x - cx) / 2.6) ** 2 + ((y - 6.5) / 4) ** 2 <= 1 ? vein() : null);
      },
      // Round blue goggles on a black strap, two antennae bent forward off the crown
      crown(k, v) {
        const P = k.P, goggle = k.color("#3a9dff"), goggleDk = k.color("#1f6fc4");
        for (const cx of [1, 5]) {
          v.fill(cx - 1, cx + 1, 1, 4, 6, 6, P.black);
          v.fill(cx, cx, 2, 3, 6, 6, goggle);
          v.set(cx - 1, 3, 6, goggle);
          v.set(cx + 1, 2, 6, goggleDk);
        }
        v.set(3, 3, 6, P.black);
        v.fill(-1, -1, 3, 3, 3, 6, P.black);
        v.fill(7, 7, 3, 3, 3, 6, P.black);
        for (const ax of [1, 5]) {
          v.fill(ax, ax, 6, 7, 2, 2, P.black);
          v.set(ax, 8, 3, P.black);
          v.set(ax, 9, 4, P.black);
          v.set(ax, 10, 4, goggleDk);
        }
      }
    }
  });
})();
