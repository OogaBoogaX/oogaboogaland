(() => {
  "use strict";
  const BL = window.BL;

  BL.characters.add({
    handle: "Global-DSB",
    joined: 1761945600,
    lastCommit: 1795350000,

    look: {
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      noPupils: true,
      face: "none",
      height: 1.10,
      skin: "#e52b20",
      hair: "#cc2119",
      fur: "#ed3025",
      eyeColor: "#ffffff",
      eyeGlow: 0
    },

    voice: {
      poke: "DSB LOVES CAVEMAN LAND!",
      idle: [
        "DSB loves rocks!",
        "DSB is happy!",
        "Where is DSB's club?",
        "DSB likes red!",
        "DSB smash big rock!",
        "DSB wants cookies!",
        "Caveman DSB is here!"
      ]
    },

    dress: {
      skull(k, v) {
        const red = k.color("#ed3025");
        const redDark = k.color("#b91d18");
        const orange = k.color("#ff8c00");
        const white = k.color("#ffffff");
        const black = k.color("#090909");

        v.fill(0, 6, 0, 6, 0, 5, red);
        v.fill(1, 5, 0, 6, 1, 4, red);
        v.fill(0, 6, 1, 5, 5, 5, red);

        v.fill(1, 2, 5, 7, 3, 4, white);
        v.fill(4, 5, 5, 7, 3, 4, white);

        v.set(2, 5, 7, black);
        v.set(4, 5, 7, black);

        v.fill(2, 4, 5, 7, 6, 7, orange);

        v.fill(2, 4, 3, 5, 7, 7, redDark);

        return true;
      },

      eyes(k, v) {
        const white = k.color("#ffffff");
        const black = k.color("#080808");

        for (const x of [1, 4]) {
          v.set(x, 5, 5, white);
          v.set(x, 5, 6, black);
          k.eyeCells.push([x, 5]);
        }

        return true;
      },

      hat(k, v) {
        const brown = k.color("#754421");
        const light = k.color("#a66b38");
        const bone = k.color("#eee1c5");

        v.fill(0, 6, 8, 8, 0, 5, brown);
        v.fill(1, 5, 9, 9, 1, 5, light);

        v.set(2, 7, 9, bone);
        v.set(3, 7, 9, bone);
        v.set(4, 7, 9, bone);
      },

      torso(k, v) {
        const brown = k.color("#754421");
        const light = k.color("#a66b38");
        const dark = k.color("#482713");
        const red = k.color("#ed3025");

        v.fill(0, 7, 0, 7, 0, 5, red);

        v.fill(1, 6, 2, 6, 5, 5, brown);
        v.fill(2, 5, 2, 5, 6, 6, light);

        v.fill(1, 6, 1, 1, 6, 6, dark);
        v.set(3, 7, 6, light);
      }
    }
  });
})();
