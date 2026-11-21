(() => {
  "use strict";
  const BL = window.BL;
  BL.characters.add({
    handle: "Global-DSB",
    joined: 1795267200,
    lastCommit: 1795267200,
    look: {
      build: "normal",
      height: 1.05,
      skin: "#e02020",
      hair: "#cc1010",
      fur: "#ff2020",
      eyeColor: "#111111",
      eyeGlow: 0.15,
      face: "smirk",
      wideEyes: true,
      noBrow: true
    },
    voice: {
      poke: "Elmo love you!",
      idle: [
        "Ooga booga!",
        "Elmo got a club!",
        "Tickle me ooga!",
        "Bananas for Elmo!",
        "Red fur forever!",
        "That a nice rock."
      ]
    },
    dress: {
      torso(k, v) {
        const red = k.color("#ff2020");
        const redDk = k.color("#cc1010");
        const brown = k.color("#8b5a2b");
        const spot = k.color("#3a2510");
        const bone = k.color("#e8e0d0");

        // bright red fur body
        v.fill(0, 8, 0, 7, 0, 5, k.jit(red, redDk, 0.25));

        // leopard loincloth
        v.fill(1, 7, 0, 2, 0, 5, brown);
        v.fill(1, 7, 0, 2, 0, 5, k.jit(brown, spot, 0.4));
        v.set(2, 1, 5, spot);
        v.set(5, 1, 5, spot);
        v.set(3, 0, 4, spot);
        v.set(6, 0, 4, spot);
        k.loin = [brown, spot];
      },

      eyes(k, v) {
        const white = k.color("#ffffff");
        const black = k.color("#111111");
        for (const x of [1, 5]) {
          v.fill(x, x, 3, 4, 5, 6, white);
          v.set(x, 3, 6, black);
          k.eyeCells.push([x, 3]);
        }
        return true;
      },

      skull(k, v) {
        const orange = k.color("#ff7a00");
        // big orange nose
        v.fill(2, 4, 2, 3, 5, 6, orange);
        return true;
      },

      extras(k) {
        const u = k.u;
        const bone = "#e8e0d0";
        const { box, merge, createNode, addChild, moved } = BL.models;
        // simple bone necklace
        const beads = merge(
          box({ w: 0.6 * u, h: 0.6 * u, d: 0.6 * u, color: bone, offset: { x: -1.8 * u, y: 5.5 * u, z: 3.2 * u } }),
          box({ w: 0.6 * u, h: 0.6 * u, d: 0.6 * u, color: bone, offset: { x: 0 * u, y: 5.2 * u, z: 3.4 * u } }),
          box({ w: 0.6 * u, h: 0.6 * u, d: 0.6 * u, color: bone, offset: { x: 1.8 * u, y: 5.5 * u, z: 3.2 * u } })
        );
        addChild(k.parts.torso, createNode({ geometry: beads }));
      },

      club() {
        // keep the classic wooden club
        return null;
      }
    }
  });
})();
