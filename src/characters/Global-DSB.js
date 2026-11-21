(() => {
  "use strict";
  const BL = window.BL;

  BL.characters.add({
    handle: "Global-DSB",
    display: "Elmo Ooga",
    joined: Math.floor(Date.now() / 1000),
    lastCommit: Math.floor(Date.now() / 1000),

    look: {
      skin: "#e31b23",       // bright Elmo red
      hair: "#c4161d",
      fur: "#ff2a32",
      eyeColor: "#ffffff",
      eyeGlow: 0.15,
      wideEyes: true,
      noPupils: false,
      face: "none",
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      height: 1.05
    },

    voice: {
      poke: "Elmo wants to play! Ooga!",
      idle: [
        "Elmo loves bananas!",
        "Ooga ooga, club time!",
        "This is Elmo's island!",
        "Red is the best color.",
        "Bone necklace looks good on Elmo.",
        "Stack sats with Elmo!"
      ]
    },

    dress: {
      // Big friendly face + orange nose
      eyes(k, v) {
        const white = k.color("#ffffff");
        const black = k.color("#111111");
        const orange = k.color("#ff7a00");

        // Large white eyes
        v.fill(1, 2, 3, 5, 5, 5, white);
        v.fill(4, 5, 3, 5, 5, 5, white);
        // Pupils
        v.set(1, 4, 5, black);
        v.set(5, 4, 5, black);
        // Orange nose
        v.fill(2, 4, 2, 3, 6, 6, orange);
        k.eyeCells.push([1, 4], [5, 4]);
        return true;
      },

      // Bone necklace
      torso(k, v) {
        const bone = k.color("#e8e0d0");
        const boneDk = k.color("#c4b8a0");
        const hide = k.color("#8b5a2b");
        const hideDk = k.color("#5c3a1a");

        // Necklace bones
        v.set(2, 6, 5, bone);
        v.set(3, 6, 5, boneDk);
        v.set(4, 6, 5, bone);
        v.set(1, 5, 5, bone);
        v.set(5, 5, 5, bone);
        v.set(2, 4, 5, boneDk);
        v.set(4, 4, 5, bone);

        // Tattered loincloth feel
        v.fill(1, 7, 0, 2, 0, 5, k.jit(hide, hideDk, 0.4));
      },

      // Classic club positioning
      club(k) {
        return {
          rest: { x: 0.28, z: 0 },
          carry: { x: 0.95, z: 0 }
        };
      }
    }
  });
})();
