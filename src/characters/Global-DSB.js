
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
(() => {
  "use strict";
  const BL = window.BL;

  BL.characters.add({
    handle: "Global-DSB",
    joined: 1761945600,
    lastCommit: 1761945600,

    look: {
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
      noPupils: true,
      face: "none",
      height: 1.10,
      skin: "#3a1a12",
      hair: "#1a0a08",
      fur: "#2a120c",
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
      skull(k, v) {
        const rock   = k.color("#3a1a12");
        const rockLt = k.color("#5c2a18");
        const lava   = k.color("#ff3a00");
        const lavaHi = k.color("#ffaa22");
        const black  = k.color("#0a0504");

        v.fill(0, 6, 0, 6, 0, 5, rock);
        v.fill(1, 1, 2, 5, 3, 3, lava);
        v.fill(5, 5, 2, 5, 3, 3, lava);
        v.fill(2, 4, 1, 1, 4, 4, lavaHi);
        v.fill(1, 2, 3, 4, 5, 5, black);
        v.fill(4, 5, 3, 4, 5, 5, black);
        return true;
      },

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

      hat(k, v) {
        const helm   = k.color("#0d0d10");
        const helmLt = k.color("#2a2a30");
        const spike  = k.color("#111114");
        const btc    = k.color("#f7931a");
        const heart  = k.color("#ff2244");
        const bone   = k.color("#e8e0d0");

        v.fill(-1, 7, 5, 8, -1, 6, helm);
        v.fill(0, 6, 8, 9, 0, 5, helmLt);

        for (const x of [0, 2, 4, 6]) {
          v.set(x, 10, 2, spike);
          v.set(x, 11, 2, spike);
        }
        v.set(1, 10, 3, spike);
        v.set(5, 10, 3, spike);

        v.fill(2, 4, 6, 7, 6, 6, btc);
        v.set(3, 5, 6, btc);
        v.set(3, 8, 6, btc);

        v.set(1, 6, 6, heart);
        v.set(5, 6, 6, heart);
        v.set(2, 5, 6, heart);
        v.set(4, 5, 6, heart);

        v.set(0, 6, 5, bone);
        v.set(6, 6, 5, bone);
      },

      torso(k, v) {
        const rock   = k.color("#2a120c");
        const rockLt = k.color("#4a2218");
        const lava   = k.color("#ff3a00");
        const lavaHi = k.color("#ff8800");

        v.fill(0, 8, 0, 7, 0, 5, k.jit(rock, rockLt, 0.3));
        v.fill(2, 2, 1, 6, 5, 5, lava);
        v.fill(6, 6, 2, 5, 5, 5, lavaHi);
        v.set(4, 4, 5, lava);
        v.set(3, 6, 5, lavaHi);
      }
    }
  });
})();
