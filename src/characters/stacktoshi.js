(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox } = BL.models;
  const { hexToRgb } = BL.math;
  const STACK_PALETTE = [hexToRgb("#9aa0a4"), hexToRgb("#7d8388"), hexToRgb("#f7931a"), hexToRgb("#cf6c14")];
  const totemVoxels = (rand) => {
    const v = makeVox();
    const stone = () => rand() < 0.25 ? 1 : 0;
    const sat = () => rand() < 0.4 ? 3 : 2;
    v.fill(0, 1, 0, 3, 0, 1, stone);
    v.fill(-1, 2, 4, 5, -1, 2, stone);
    v.fill(-1, 2, 6, 7, -1, 2, stone);
    v.fill(0, 1, 8, 9, 0, 1, stone);
    v.fill(0, 1, 10, 11, 0, 1, sat);
    v.set(0, 12, 0, 2);
    v.set(1, 12, 1, 2);
    return v;
  };
  BL.characters.add({
    handle: "stacktoshi",
    github: "stacktoshi",
    joined: 1789940000,
    lastCommit: 1792629820,
    look: {
      bald: true, hairless: true, cleanShaven: true, noBrow: true, noPupils: true,
      noFlaps: true, face: "none", height: 1.08, skin: "#d9a878", hair: "#8d939a", fur: "#a97f52",
      portrait: { min: [-2, -2, -3], max: [8, 10, 8] }
    },
    voice: {
      poke: "Patience. The stack builds itself.",
      idle: [
        "One stone at a time.",
        "The stack only goes up.",
        "Every course needs a calm hand.",
        "Twenty one million stones, one cairn.",
        "The next block is already mined.",
        "Balance is a decision."
      ]
    },
    dress: {
      torso(k, v) {
        const suit = k.color("#ab9f92"), suitDk = k.color("#96897d"), lapel = k.color("#8a7e72");
        const shirt = k.color("#dcecd4"), shirtDk = k.color("#c9d9c0");
        const button = k.color("#1e2126"), pin = k.color("#f7931a");
        const cloth = k.jit(suit, suitDk, 0.12);
        v.fill(0, 8, 0, 7, 0, 5, cloth);
        v.fill(3, 5, 6, 7, 5, 5, k.jit(shirt, shirtDk, 0.2));
        v.fill(4, 4, 4, 5, 5, 5, shirt);
        v.fill(2, 2, 6, 7, 5, 5, lapel);
        v.fill(6, 6, 6, 7, 5, 5, lapel);
        v.set(3, 5, 5, lapel); v.set(5, 5, 5, lapel);
        v.set(3, 4, 5, lapel); v.set(5, 4, 5, lapel);
        v.fill(3, 5, 3, 3, 5, 5, cloth);
        v.set(4, 3, 5, button);
        v.set(4, 2, 5, button);
        v.set(6, 6, 5, pin);
        k.loin = [suit, suitDk];
      },
      gear(k) {
        const suit = k.color("#ab9f92"), suitDk = k.color("#96897d"), shirt = k.color("#dcecd4");
        const trouser = k.color("#2c3a52"), trouserDk = k.color("#233043"), shoe = k.color("#17191c");
        const sleeve = makeVox();
        sleeve.fill(0, 2, 3, 7, 0, 2, (x, y) => y === 7 ? suitDk : suit);
        sleeve.fill(-1, 3, 8, 10, -1, 3, suit);
        sleeve.fill(0, 2, 2, 2, 0, 2, shirt);
        sleeve.fill(-1, 3, 0, 1, -1, 3, k.skinJ);
        const sleeveGeo = k.vg(sleeve, { x: -1.5 * k.u, y: -11 * k.u, z: -1.5 * k.u });
        k.parts.armR.geometry = k.parts.armL.geometry = sleeveGeo;
        const leg = (side) => {
          const v = makeVox();
          v.fill(0, 3, 2, 4, 0, 3, (x, y) => y === 2 ? trouserDk : trouser);
          v.fill(0, 3, 0, 1, 0, 5, shoe);
          v.set(side < 0 ? 3 : 0, 0, 6, shoe);
          v.set(side < 0 ? 1 : 2, 0, 6, shoe);
          return v;
        };
        k.parts.legR.geometry = k.vg(leg(-1), { x: -2 * k.u, y: -5 * k.u, z: -2.5 * k.u });
        k.parts.legL.geometry = k.vg(leg(1), { x: -2 * k.u, y: -5 * k.u, z: -2.5 * k.u });
      },
      club: (k) => ({ voxels: totemVoxels(k.rand), palette: STACK_PALETTE, rest: { x: 0.9, z: 0.05 } }),
      skull(k, v) {
        v.fill(0, 6, 0, 6, 0, 5, k.skinJ);
        v.fill(1, 5, 0, 1, 6, 6, k.skinJ);
        return true;
      },
      eyes(k, v) {
        const eye = k.color("#202020");
        for (const x of [1, 5]) {
          v.set(x, 3, 5, eye);
          k.eyeCells.push([x, 3]);
        }
        return true;
      },
      crown(k, v) {
        const P = k.P, rand = k.rand, light = k.color("#c6cbd1");
        const tuft = () => rand() < 0.22 ? light : rand() < 0.3 ? P.hairDk : P.hair;
        for (let x = -1; x <= 7; x++) for (let z = -2; z <= 6; z++) {
          if (z === 6 && x >= 1 && x <= 5) continue;
          if (rand() < 0.12) continue;
          v.set(x, 7, z, tuft());
        }
        for (let x = -1; x <= 7; x++) for (let z = -2; z <= 5; z++) if (rand() < 0.78) v.set(x, 8, z, tuft());
        for (let x = 0; x <= 6; x++) for (let z = -2; z <= 4; z++) if (rand() < 0.5) v.set(x, 9, z, tuft());
        for (let y = 1; y <= 6; y++) {
          for (let z = -2; z <= 4; z++) {
            if (rand() < 0.88) v.set(-1, y, z, tuft());
            if (rand() < 0.88) v.set(7, y, z, tuft());
          }
          for (let x = -1; x <= 7; x++) if (rand() < 0.9) v.set(x, y, -2, tuft());
        }
        for (let i = 0; i < 16; i++) {
          const x = -2 + Math.floor(rand() * 11), y = 7 + Math.floor(rand() * 4), z = -3 + Math.floor(rand() * 9);
          v.set(x, y, z, tuft());
        }
      },
      mark(k, v) {
        const P = k.P, frame = k.color("#8e949a"), brow = k.color("#45494f"), lip = k.color("#b06a55");
        v.fill(3, 3, 3, 4, 6, 6, P.nose);
        v.set(3, 2, 7, P.nose);
        v.fill(0, 2, 6, 6, 6, 6, brow);
        v.fill(4, 6, 6, 6, 6, 6, brow);
        v.fill(-1, 2, 4, 4, 6, 6, frame);
        v.fill(-1, 2, 2, 2, 6, 6, frame);
        v.fill(-1, -1, 3, 3, 6, 6, frame);
        v.fill(2, 2, 3, 3, 6, 6, frame);
        v.fill(4, 7, 4, 4, 6, 6, frame);
        v.fill(4, 7, 2, 2, 6, 6, frame);
        v.fill(4, 4, 3, 3, 6, 6, frame);
        v.fill(7, 7, 3, 3, 6, 6, frame);
        v.set(3, 3, 6, frame);
        v.fill(-1, -1, 3, 3, 2, 5, frame);
        v.fill(7, 7, 3, 3, 2, 5, frame);
        v.fill(2, 4, 2, 2, 6, 6, P.nose);
        v.fill(2, 4, 1, 1, 7, 7, lip);
      }
    }
  });
})();
