(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, ring, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  // A silk top hat: wide brim, tall crown with a slight flare, an island-orange
  // band, a white X badge pinned above the band
  const topHatGeometry = cached(() => {
    const felt = "#1b1b1d";
    const brim = lathe({ profile: [[0, 0], [0.31, 0], [0.325, 0.02], [0.31, 0.04], [0, 0.04]], segments: 14, color: "#111113" });
    const crown = lathe({ profile: [[0.205, 0.03], [0.2, 0.16], [0.205, 0.3], [0.225, 0.42], [0.23, 0.46], [0, 0.46]], segments: 14, color: felt });
    const cross = [];
    for (let i = -2; i <= 2; i++) {
      cross.push(box({ w: 0.036, h: 0.036, d: 0.03, color: "#f2efe4", offset: { x: i * 0.036, y: 0.27 + i * 0.036, z: 0.207 } }));
      if (i) cross.push(box({ w: 0.036, h: 0.036, d: 0.03, color: "#f2efe4", offset: { x: i * 0.036, y: 0.27 - i * 0.036, z: 0.207 } }));
    }
    return merge(brim, crown, ring({ r: 0.21, thickness: 0.035, y: 0.075, segments: 14, color: "#d8892b" }), ...cross);
  });
  const PUMPKIN = "#e8862a", PUMPKIN_DK = "#cf6f1c", PUMPKIN_GLOW = "#ffc14d";
  BL.characters.add({
    handle: "rules-without-rulers",
    // In-game name; activity still joins on the handle (the GitHub login)
    display: "genXbtc",
    joined: 1789801750,
    lastCommit: 1789954043,
    // pumpkin also flickers the head's glow in crew.js
    look: { portrait: { min: [-1, -2, 0], max: [7, 7, 8] }, pumpkin: true, bald: true, cleanShaven: true, noBrow: true, noPupils: true, face: "none", hatY: 15, skin: "#cfc8b4", hair: "#151515", fur: "#141414", height: 1.16 },
    voice: {
      poke: "POWER OVERWHELMING",
      idle: ["Shut up you larp", "Rules Without Rulers"]
    },
    dress: {
      // A dark tailcoat over bone: rib stripes and a sternum on the chest, a light
      // cravat at the throat, an orange rose on the lapel, a white X across the back
      torso(k, v) {
        const P = k.P, orange = k.color("#e89423");
        v.fill(0, 8, 0, 7, 0, 5, k.leopard);
        for (const ry of [1, 3, 5]) v.fill(1, 7, ry, ry, 5, 5, k.skinJ);
        v.fill(4, 4, 1, 6, 5, 5, k.skinJ);
        v.fill(3, 5, 4, 7, 5, 5, k.jit(P.white, P.skin, 0.3));
        v.fill(6, 7, 5, 6, 5, 5, orange);
        v.set(7, 6, 5, P.spot);
        for (let i = 0; i <= 6; i++) {
          v.set(1 + i, 7 - i, 0, P.white);
          v.set(7 - i, 7 - i, 0, P.white);
        }
        // Under the tailcoat, the Ooga's leopard loincloth: its wrap here, its flaps from models.js.
        const hide = k.color("#c8923a"), spot = k.color("#4a2f16");
        k.loin = [hide, spot];
        for (let x = 0; x <= 8; x++) for (let z = 0; z <= 5; z++) for (const y of [0, 1]) {
          if (x === 0 || x === 8 || z === 0 || z === 5) v.set(x, y, z, (x * 3 + y * 5 + z * 7) % 6 === 0 ? spot : hide);
        }
      },
      // A carved pumpkin, ribbed in two oranges, rounded top and bottom
      skull(k, v) {
        const pumpkin = k.color(PUMPKIN), pumpkinDk = k.color(PUMPKIN_DK);
        v.fill(-1, 7, 0, 7, -1, 5, (x) => (x + 9) % 3 ? pumpkin : pumpkinDk);
        for (let x = -1; x <= 7; x++) {
          for (let z = -1; z <= 5; z++) {
            if (x === -1 || x === 7 || z === -1 || z === 5) {
              v.del(x, 7, z);
              v.del(x, 0, z);
            }
          }
        }
        return true;
      },
      // Carved triangle eyes lit from inside; lids still close over them.
      // The nose and jagged grin glow too, but stay clear when he blinks.
      eyes(k, v) {
        const glow = k.color(PUMPKIN_GLOW);
        for (const [ex, ey] of [[1, 4], [2, 4], [2, 5], [4, 4], [5, 4], [4, 5]]) {
          v.set(ex, ey, 5, glow);
          k.eyeCells.push([ex, ey]);
        }
        v.set(3, 3, 5, glow);
        v.fill(0, 6, 2, 2, 5, 5, glow);
        v.set(2, 1, 5, glow);
        v.set(4, 1, 5, glow);
        k.headEmissive = { [glow]: 1 };
        k.lid = k.color(PUMPKIN_DK);
        return true;
      },
      headgear(k) {
        const h = k.h, u = k.u;
        addChild(k.parts.head, createNode({ position: { x: 0, y: 7.5 * u, z: 0 }, rotation: { x: 0, y: 0, z: 0.06 }, scale: { x: h, y: h, z: h }, geometry: topHatGeometry(), portraitHidden: true }));
      }
    }
  });
})();
