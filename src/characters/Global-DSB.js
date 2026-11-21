
(() => {
  "use strict";
  const BL = window.BL;
  const now = Math.floor(Date.now() / 1000);

  BL.characters.add({
    handle: "Global-DSB",
    display: "Caveman Elmo",
    joined: now,
    lastCommit: now,

    look: {
      skin: "#e31b23",
      hair: "#c4161d",
      fur: "#ff2a32",
      eyeColor: "#ffffff",
      eyeGlow: 0.08,
      wideEyes: true,
      noPupils: false,
      face: "smirk",
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      height: 1.05
    },

    voice: {
      poke: "Caveman Elmo says OOGA BOOGA!",
      idle: [
        "Elmo find banana!",
        "Big club. Big bonk!",
        "Ooga ooga, cave time!",
        "Elmo strongest caveman!",
        "Bone necklace very fancy.",
        "No fire, just fury!"
      ]
    },

    dress: {
      eyes(k, v) {
        const white = k.color("#fff4e8");
        const black = k.color("#111111");
        const orange = k.color("#f47a16");

        v.fill(1, 2, 3, 5, 5, 5, white);
        v.fill(4, 5, 3, 5, 5, 5, white);
        v.set(1, 4, 5, black);
        v.set(5, 4, 5, black);

        v.fill(2, 4, 2, 3, 6, 6, orange);
        k.eyeCells.push([1, 4], [5, 4]);
        return true;
      },

      torso(k, v) {
        const hide = k.color("#9a6738");
        const hideLight = k.color("#bd8950");
        const hideDark = k.color("#604022");
        const bone = k.color("#eee2c8");
        const boneShade = k.color("#c9b99a");
        const cord = k.color("#6d4728");

        v.fill(1, 6, 1, 2, 0, 5, k.jit(hide, hideDark, 0.28));
        v.fill(3, 6, 1, 4, 0, 5, k.jit(hideLight, hide, 0.25));
        v.fill(5, 6, 1, 6, 0, 5, k.jit(hide, hideDark, 0.3));

        v.set(1, 6, 2, hideDark);
        v.set(3, 5, 2, hideDark);
        v.set(4, 6, 4, hideDark);
        v.set(6, 5, 3, hideDark);
        v.set(2, 4, 1, hideDark);
        v.set(5, 4, 4, hideDark);

        v.fill(1, 7, 0, 2, 0, 5, k.jit(hideLight, hideDark, 0.35));
        v.fill(3, 7, 0, 4, 0, 5, k.jit(hide, hideDark, 0.3));
        v.fill(5, 7, 0, 6, 0, 5, k.jit(hideLight, hide, 0.35));

        v.set(1, 3, 5, cord);
        v.set(2, 4, 5, cord);
        v.set(3, 4, 5, cord);
        v.set(4, 4, 5, cord);
        v.set(5, 3, 5, cord);

        v.set(2, 5, 5, boneShade);
        v.set(3, 5, 5, bone);
        v.set(4, 5, 5, boneShade);
        v.set(1, 4, 5, bone);
        v.set(5, 4, 5, bone);
        v.set(3, 6, 5, bone);
      },

      club() {
        return {
          rest: { x: 0.28, z: 0 },
          carry: { x: 0.95, z: 0 }
        };
      }
    }
  });
})();
