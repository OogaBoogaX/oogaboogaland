(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { hexToRgb } = BL.math;
  const SHIELD_PALETTE = ["#513b2b", "#644a34", "#292c30", "#777b7d", "#a8aaab", "#d69b39"].map(hexToRgb);
  const shieldVox = () => {
    const v = makeVox();
    for (let x = -4; x <= 6; x++) for (let y = -1; y <= 9; y++) {
      const r2 = (x - 1) * (x - 1) + (y - 4) * (y - 4);
      if (r2 > 25) continue;
      const rim = r2 > 16;
      v.set(x, y, 0, rim ? 2 : 0);
      v.set(x, y, 1, rim ? 3 : (x + 4) % 3 === 0 ? 0 : 1);
    }
    v.fill(0, 2, 3, 5, 2, 2, 3);
    v.set(1, 4, 3, 4);
    for (const [x, y] of [[1, 8], [1, 0], [-3, 4], [5, 4]]) v.set(x, y, 2, 4);
    v.fill(-2, -2, 3, 6, 2, 2, 5);
    v.set(-1, 5, 2, 5);
    v.set(-1, 3, 2, 5);
    return v;
  };
  const swordGeometry = (h) => {
    const H = BL.heroBody, geo = BL.models.geometry();
    const steel = "#c5c9ce", steelDk = "#9a9fa6", groove = "#7b8189";
    const bronze = "#b08a3e", leather = "#513b2b";
    H.loft(geo, [[-2.8, 0.3, 0.5, 0.2], [-2.55, 0.55, 1, 0.26], [-2.05, 0.55, 1, 0.26], [-1.8, 0.36, 0.52, 0.18]], bronze);
    H.loft(geo, [[-1.8, 0.48, 0.54, 0.2], [1.7, 0.48, 0.54, 0.2]], leather, [false, false]);
    H.loft(geo, [[1.7, 0.4, 2, 0.18], [2.15, 0.4, 2, 0.18]], bronze);
    H.loft(geo, [[2.15, 0.21, 0.85, 0.18], [9.8, 0.18, 0.72, 0.15], [12.4, 0.13, 0.46, 0.1], [13.8, 0.03, 0.05, 0.02]], [steel, steel, steelDk]);
    for (const side of [-1, 1]) H.poly(geo, [[side * 0.216, 2.5, -0.22], [side * 0.216, 2.5, 0.22], [side * 0.186, 9.5, 0.15], [side * 0.186, 9.5, -0.15]], groove, [side, 0, 0]);
    return Object.assign(H.scaled(geo, h / 16), { slingTurn: Math.PI / 2, slingHiltUp: true });
  };
  const modelled = () => BL.models.STYLE === "R";
  BL.characters.add({
    handle: "l0n0",
    joined: 1791577993,
    lastCommit: 1791577993,
    look: {
      build: "normal", height: 1.16, face: "beard",
      skin: "#dfb895", hair: "#d9b65f", fur: "#51483e",
      portrait: { min: [-1, -5, -2], max: [7, 10, 8] }
    },
    voice: {
      poke: "The timechain calls. We sail.",
      idle: [
        "Stack sats. Raid knowledge.",
        "Proof, not promises.",
        "The longship needs more hash.",
        "No king controls the timechain.",
        "I came for bananas. Stayed for Bitcoin.",
        "Valhalla can wait. Blocks won't.",
        "Where does this path lead?",
        "A Viking verifies."
      ]
    },
    dress: {
      torso(k, v) {
        const cloth = k.color("#292c30"), leather = k.color("#513b2b"), seam = k.color("#75604b"), iron = k.color("#777b7d");
        k.loin = [cloth, leather];
        v.fill(0, 8, 0, 2, 0, 5, cloth);
        v.fill(1, 7, 3, 7, 1, 4, cloth);
        v.fill(0, 8, 6, 7, 0, 5, k.jit(k.P.fur, seam, 0.15));
        for (let y = 2; y <= 6; y++) {
          const x = 7 - y;
          v.fill(x, x + 1, y, y, 5, 5, leather);
        }
        v.fill(0, 8, 2, 2, 0, 5, leather);
        v.fill(4, 5, 2, 3, 6, 6, iron);
        v.set(4, 3, 7, k.color("#d69b39"));
      },
      club: (k) => modelled() ? { default: swordGeometry(k.h), rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 } }
        : { voxels: shieldVox(), palette: SHIELD_PALETTE, rest: { x: 0, z: 0 }, carry: { x: 0.15, z: 0 } },
      extras(k) {
        if (!modelled()) return;
        const u = k.u, shield = createNode({ position: { x: 1.5 * u, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI / 2, z: 0 },
          geometry: voxelGeometry(shieldVox(), { unit: u, palette: SHIELD_PALETTE, origin: { x: -1.5 * u, y: -4.5 * u, z: 0 } }) });
        shield.forearm = 0.55;
        addChild(k.parts.armL, shield);
        k.parts.shield = shield;
      },
      gear(k) {
        const leather = k.color("#513b2b"), dark = k.color("#302720"), iron = k.color("#777b7d");
        const boot = makeVox();
        boot.fill(0, 3, 2, 4, 0, 3, leather);
        boot.fill(0, 3, 0, 1, 0, 5, dark);
        boot.fill(0, 3, 4, 4, 0, 3, k.P.fur);
        boot.fill(0, 3, 2, 2, 4, 4, iron);
        const bootGeometry = k.vg(boot, { x: -2 * k.u, y: -5 * k.u, z: -2.5 * k.u });
        k.parts.legR.geometry = k.parts.legL.geometry = bootGeometry;
        const arm = makeVox();
        arm.fill(0, 2, 2, 7, 0, 2, k.skinJ);
        arm.fill(-1, 3, 8, 10, -1, 3, k.skinJ);
        arm.fill(-1, 3, 0, 1, -1, 3, k.skinJ);
        arm.fill(-1, 3, 8, 9, -1, 3, k.jit(k.P.fur, leather, 0.15));
        arm.fill(0, 2, 3, 5, 0, 2, leather);
        arm.fill(0, 2, 3, 3, 3, 3, iron);
        const armGeometry = k.vg(arm, { x: -1.5 * k.u, y: -11 * k.u, z: -1.5 * k.u });
        k.parts.armR.geometry = k.parts.armL.geometry = armGeometry;
        k.parts.torso.scale.x = 1.12;
        k.parts.torso.scale.z = 1;
        k.parts.armR.position.x = -(0.29 * k.h * 1.12 + 0.09 * k.h);
        k.parts.armL.position.x = -k.parts.armR.position.x;
      },
      crown(k, v) {
        for (const [x, z, end] of [[-1, 0, -2], [-1, 3, -3], [7, 0, -3], [7, 3, -2], [0, -2, -4], [2, -2, -3], [4, -2, -4], [6, -2, -3]]) {
          v.fill(x, x, end, 5, z, z, k.hairJ);
        }
        v.fill(1, 3, 9, 9, 0, 2, k.P.hair);
        v.set(2, 10, 1, k.P.hairDk);
      },
      mark(k, v) {
        const braid = k.color("#d9b65f"), shade = k.color("#ad8742"), tie = k.color("#777b7d");
        v.fill(0, 6, 0, 1, 6, 7, braid);
        v.fill(1, 5, -1, -1, 6, 7, braid);
        for (const x of [1, 5]) {
          for (let y = -2; y >= -4; y--) {
            v.set(x, y, 7, (x + y) % 2 === 0 ? shade : braid);
            v.set(x, y, 8, (x + y) % 2 === 0 ? braid : shade);
          }
          v.set(x, -5, 7, tie);
        }
        v.del(5, 4, 6);
        v.set(5, 5, 6, braid);
        v.fill(2, 4, 0, 0, 8, 8, shade);
        v.set(4, 1, 8, k.P.white);
        v.set(0, 2, 6, k.P.skinDk);
      }
    }
  });
})();
