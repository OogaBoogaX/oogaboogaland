(() => {
  "use strict";
  const BL = window.BL;

  BL.characters.add({
    handle: "Holo-Elfstone",
    joined: 1789939534,
    lastCommit: 1789939534,

    look: {
      face: "beard",
      hair: "#211b18",
      fur: "#4a3a2a",
      skin: "#b97950"
    },

    voice: {
      poke: "Ooga distrust default settings.",
      idle: [
        "Ooga see pattern.",
        "Hash good.",
        "Clanker think. Ooga decide.",
        "Need more compute.",
        "Private key private.",
        "Oracle unclear. Ooga retry.",
        "Many token. Few banana.",
        "Proof of bonk.",
        "Number go up. Ooga calm.",
        "Ooga need one more run."
      ]
    },

    dress: {
      torso(k, v) {
        const hide = k.color("#514536");
        const hideDk = k.color("#3c3329");
        const cord = k.color("#766044");

        v.fill(0, 8, 0, 7, 0, 5, k.jit(hide, hideDk, 0.18));
        v.fill(0, 8, 6, 6, 5, 5, cord);
        v.fill(1, 1, 1, 6, 5, 5, cord);
        v.fill(7, 7, 1, 6, 5, 5, cord);
      },

      crown(k, v) {
        const leather = k.color("#4a3525");
        const cord = k.color("#756047");
        const metal = k.color("#393a37");
        const metalHi = k.color("#555650");
        const amber = k.color("#d88932");

        v.fill(-1, 7, 6, 8, -1, 5, k.hairJ);

        for (const [x, z, len] of [
          [-1, 0, 3],
          [-1, 3, 2],
          [7, -1, 2],
          [7, 2, 3],
          [1, -1, 2],
          [5, -1, 3]
        ]) {
          for (let y = 3; y > 3 - len; y--) {
            v.set(x, y, z, k.hairJ());
          }
        }

        v.fill(-1, 6, 7, 7, 1, 1, leather);
        v.fill(6, 7, 3, 7, 1, 1, leather);

        v.fill(5, 5, 5, 8, 0, 2, cord);
        v.set(4, 8, 1, cord);
        v.set(6, 8, 1, cord);

        v.fill(6, 7, 3, 5, 5, 6, metal);
        v.set(5, 5, 6, metalHi);
        v.set(6, 6, 6, metalHi);

        v.set(6, 4, 7, amber);
        k.headEmissive = { [amber]: 0.28 };
      }
    }
  });
})();
