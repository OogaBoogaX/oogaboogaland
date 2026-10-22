(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox } = BL.models;
  const { hexToRgb } = BL.math;
  // The totem: four flat shrinking stones, an orange block capped on top.
  const STACK_PALETTE = [hexToRgb("#9aa0a4"), hexToRgb("#7d8388"), hexToRgb("#f7931a"), hexToRgb("#cf6c14")];
  const GOLD_STACK_PALETTE = [hexToRgb("#e6c25c"), hexToRgb("#c9a23e"), hexToRgb("#f7e6a8"), hexToRgb("#d8b56a")];
  const totemVoxels = (rand) => {
    const v = makeVox();
    const stone = () => rand() < 0.25 ? 1 : 0;
    const sat = () => rand() < 0.4 ? 3 : 2;
    // Hand-stone, then wider courses, narrowing to the orange cap.
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
    // The head from the reference: silver curls round a bare face, wide grey
    // glasses, a broad nose and a short lip, with dark brows under the fringe.
    look: {
      bald: true, hairless: true, cleanShaven: true, noBrow: true, noPupils: true,
      face: "none", hatY: 11, height: 1.08, skin: "#d9a878", hair: "#8d939a", fur: "#a97f52",
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
      // A grey business suit: jacket and trousers, a white shirt open at the
      // collar with no tie, black shoes, and his sat kept as a lapel pin.
      torso(k, v) {
        const suit = k.color("#ab9f92"), suitDk = k.color("#96897d"), lapel = k.color("#8a7e72");
        const shirt = k.color("#dcecd4"), shirtDk = k.color("#c9d9c0");
        const button = k.color("#1e2126"), pin = k.color("#f7931a");
        const cloth = k.jit(suit, suitDk, 0.12);
        v.fill(0, 8, 0, 7, 0, 5, cloth);
        // The shirt in the open V of the jacket, widest at the collar.
        v.fill(3, 5, 6, 7, 5, 5, k.jit(shirt, shirtDk, 0.2));
        v.fill(4, 4, 4, 5, 5, 5, shirt);
        // Lapels edging the V as it narrows.
        v.fill(2, 2, 6, 7, 5, 5, lapel);
        v.fill(6, 6, 6, 7, 5, 5, lapel);
        v.set(3, 5, 5, lapel); v.set(5, 5, 5, lapel);
        v.set(3, 4, 5, lapel); v.set(5, 4, 5, lapel);
        // The jacket closes under the V with two buttons.
        v.fill(3, 5, 3, 3, 5, 5, cloth);
        v.set(4, 3, 5, button);
        v.set(4, 2, 5, button);
        v.set(6, 6, 5, pin);
        k.loin = [suit, suitDk];
      },
      gear(k) {
        const suit = k.color("#ab9f92"), suitDk = k.color("#96897d"), shirt = k.color("#dcecd4");
        const trouser = k.color("#2c3a52"), trouserDk = k.color("#233043"), shoe = k.color("#17191c");
        // Jacket sleeves to the wrist, a white cuff, and the hands left bare.
        const sleeve = makeVox();
        sleeve.fill(0, 2, 3, 7, 0, 2, (x, y) => y === 7 ? suitDk : suit);
        sleeve.fill(-1, 3, 8, 10, -1, 3, suit);
        sleeve.fill(0, 2, 2, 2, 0, 2, shirt);
        sleeve.fill(-1, 3, 0, 1, -1, 3, k.skinJ);
        const sleeveGeo = k.vg(sleeve, { x: -1.5 * k.u, y: -11 * k.u, z: -1.5 * k.u });
        k.parts.armR.geometry = k.parts.armL.geometry = sleeveGeo;
        // Trousers over the legs, black shoes.
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
      // A stack of stones swung like a club, shrinking upward courses.
      club: (k) => ({ voxels: totemVoxels(k.rand), palette: STACK_PALETTE, goldPalette: GOLD_STACK_PALETTE, rest: { x: 0.9, z: 0.05 } }),
      // A taller skull than the common one, to hold the forehead, the frames and
      // the chin the reference's head has room for.
      skull(k, v) {
        v.fill(0, 6, 0, 6, 0, 5, k.skinJ);
        v.fill(1, 5, 0, 1, 6, 6, k.skinJ);
        return true;
      },
      // One small dark eye in each lens, low enough to leave a lid above it.
      eyes(k, v) {
        const eye = k.color("#202020");
        for (const x of [1, 5]) {
          v.set(x, 3, 5, eye);
          k.eyeCells.push([x, 3]);
        }
        return true;
      },
      // The crown is his hair: silver curls built round the skull, thick at the
      // sides and back, a fringe dipping over the temples and the forehead bare.
      crown(k, v) {
        const P = k.P, rand = k.rand, light = k.color("#c6cbd1");
        const tuft = () => rand() < 0.22 ? light : rand() < 0.3 ? P.hairDk : P.hair;
        // The mat over the skull, kept off the forehead and ragged at its edge.
        for (let x = -1; x <= 7; x++) for (let z = -2; z <= 6; z++) {
          if (z === 6 && x >= 1 && x <= 5) continue;
          if (rand() < 0.12) continue;
          v.set(x, 7, z, tuft());
        }
        // Two courses thinning as they rise.
        for (let x = -1; x <= 7; x++) for (let z = -2; z <= 5; z++) if (rand() < 0.78) v.set(x, 8, z, tuft());
        for (let x = 0; x <= 6; x++) for (let z = -2; z <= 4; z++) if (rand() < 0.5) v.set(x, 9, z, tuft());
        // The sides and back, down past the ears to the jaw line.
        for (let y = 1; y <= 6; y++) {
          for (let z = -2; z <= 4; z++) {
            if (rand() < 0.88) v.set(-1, y, z, tuft());
            if (rand() < 0.88) v.set(7, y, z, tuft());
          }
          for (let x = -1; x <= 7; x++) if (rand() < 0.9) v.set(x, y, -2, tuft());
        }
        // Curls breaking out of the mass.
        for (let i = 0; i < 16; i++) {
          const x = -2 + Math.floor(rand() * 11), y = 7 + Math.floor(rand() * 4), z = -3 + Math.floor(rand() * 9);
          v.set(x, y, z, tuft());
        }
      },
      // The face under the curls: the nose bridge and its broad base, dark brows,
      // the wide grey frames with the bridge over the nose, and the lip below.
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
