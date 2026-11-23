
(() => {
  "use strict";

  const BL = window.BL;

  BL.characters.add({
    handle: "Global-DSB",
    joined: 1761945600,
    lastCommit: 1795392000,
    github: "Global-DSB",
    display: "Stone Age Elmo",

    look: {
      build: "slim",
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      wideEyes: true,
      noPupils: false,
      face: "nose",
      eyeColor: "#ffffff",
      hatY: 0
    },

    voice: {
      poke: [
        "Elmo has a rock!",
        "Elmo smash!",
        "Hehehe!",
        "Elmo loves rocks!"
      ],
      idle: [
        "Elmo is happy!",
        "Where is Elmo?",
        "Elmo wants food!",
        "Yay!"
      ]
    },

    dress: {
      skull(k, v) {
        k.color = "#e31b23";
      },

      torso(k, v) {
        k.color = "#e31b23";
        k.jit = 0;
      },

      eyes(k, v) {
        k.color = "#ffffff";
      },

      club(k) {
        k.color = "#777777";
      },

      gear(k) {
        k.color = "#e31b23";
      }
    }
  });
})();
