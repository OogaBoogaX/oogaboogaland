(() => {
  "use strict";
  const BL = window.BL;

  BL.characters.add({
    handle: "Global-DSB",
    joined: 1761945600,
    lastCommit: 1761945600,
    display: "Global DSB",

    look: {
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      noPupils: true,
      face: "none",
      hatY: 12,
      height: 1.10,
      skin: "#3a1a12",          // dark lava rock
      hair: "#1a0a08",
      fur:  "#2a120c",
      eyeColor: "#ff2200",
      eyeGlow: 0.85
    },

    voice: {
      poke: "Global nonsense incoming.",
      idle: [
        "Hotter than the chain.",
        "Spikes up.",
        "Bitcoin or burn.",
        "No mercy, only magma.",
        "Skull stays lit.",
        "DSB does not cool down."
      ]
    },

    dress: {
      // Lava-rock skull head
      skull(k, v) {
        const rock   = k.color("#3a1a12");
        const rockLt = k.color("#5c2a18");
        const lava   = k.color("#ff3a00");
        const lavaHi = k.color("#ffaa22");
        const black  = k.color("#0a0504");

        // Base skull
        v.fill(0, 6, 0, 6, 0, 5, rock);
        // Cracks / lava veins
        v.fill(1, 1, 2, 5, 3, 3, lava);
        v.fill(5, 5, 2, 5, 3, 3, lava);
        v.fill(2, 4, 1, 1, 4, 4, lavaHi);
        // Darker eye sockets
        v.fill(1, 2, 3, 4, 5, 5, black);
        v.fill(4, 5, 3, 4, 5, 5, black);
        return true;
      },

      // Glowing red eyes
      eyes(k, v) {
        const glow = k.color("#ff2200");
        const core = k.color("#ffee44");
        for (const x of [1, 5]) {
          v.set(x, 3, 5, glow);
          v.set(x, 3, 6, core);
          k.eyeCells.push([x, 3]);
        }
        k.headEmissive = { [glow]: 0.9, [core]: 1 };
        return true;
      },

      // Spiked black helmet with Bitcoin + broken heart
      crown(k, v) {
        const helm   = k.color("#0d0d10");
        const helmLt = k.color("#2a2a30");
        const spike  = k.color("#111114");
        const btc    = k.color("#f7931a");
        const heart  = k.color("#ff2244");
        const bone   = k.color("#e8e0d0");

        // Helmet shell
        v.fill(-1, 7, 5, 8, -1, 6, helm);
        v.fill(0, 6, 8, 9, 0, 5, helmLt);

        // Spikes on top
        for (const x of [0, 2, 4, 6]) {
          v.set(x, 10, 2, spike);
          v.set(x, 11, 2, spike);
        }
        v.set(1, 10, 3, spike);
        v.set(5, 10, 3, spike);

        // Bitcoin symbol (front)
        v.fill(2, 4, 6, 7, 6, 6, btc);
        v.set(3, 5, 6, btc);
        v.set(3, 8, 6, btc);

        // Broken heart
        v.set(1, 6, 6, heart);
        v.set(5, 6, 6, heart);
        v.set(2, 5, 6, heart);
        v.set(4, 5, 6, heart);

        // Tiny skulls on the sides
        v.set(0, 6, 5, bone);
        v.set(6, 6, 5, bone);
      },

      // Dark lava body with glowing cracks
      torso(k, v) {
        const rock   = k.color("#2a120c");
        const rockLt = k.color("#4a2218");
        const lava   = k.color("#ff3a00");
        const lavaHi = k.color("#ff8800");

        v.fill(0, 8, 0, 7, 0, 5, k.jit(rock, rockLt, 0.3));
        // Lava cracks
        v.fill(2, 2, 1, 6, 5, 5, lava);
        v.fill(6, 6, 2, 5, 5, 5, lavaHi);
        v.set(4, 4, 5, lava);
        v.set(3, 6, 5, lavaHi);
      }
    }
  });
})();
