(() => {
  "use strict";

  const BL = window.BL;
  const { geometry, makeVox, merge } = BL.models;
  let loft, poly, rect, scaled, slab, FRONT;
  const hero = () => ({ loft, poly, rect, scaled, slab, FRONT } = BL.heroBody);
  const midnight = "#182a40";
  const steel = "#284b70";
  const blue = "#396c9a";
  const glacier = "#6eb4df";
  const frost = "#bdddec";
  const snow = "#def6ff";
  const cyan = "#56dfff";
  const fur = "#a4afb9";

  const chestArmor = (surface, u) => {
    const armor = geometry();
    const bottom = surface.belt + 0.55;
    const top = surface.top - 0.5;
    const rows = [bottom, ...surface.heights.filter((y) => y > bottom && y < top), top];
    const point = (y, side, edge, depth) => {
      const [width, , bevel] = surface.ring(y);
      const x = edge * (width - bevel) * side * (0.6 + 0.32 * (y - bottom) / (top - bottom));
      const [a, b, z] = surface.lift([x, y, surface.face(x, y, 1)], FRONT, depth);
      return [a, b, z];
    };
    for (const side of [-1, 1]) {
      for (let i = 1; i < rows.length; i++) {
        const [a, b] = [rows[i - 1], rows[i]];
        const inner = 0.09, rim = 0.91;
        poly(armor, [point(a, side, inner, 0.29), point(a, side, rim, 0.29),
          point(b, side, rim, 0.29), point(b, side, inner, 0.29)], blue, FRONT);
        poly(armor, [point(a, side, rim, 0.29), point(a, side, 1, 0.12),
          point(b, side, 1, 0.12), point(b, side, rim, 0.29)], glacier, FRONT);
        poly(armor, [point(a, side, 0.77, 0.32), point(a, side, 0.83, 0.32),
          point(b, side, 0.83, 0.32), point(b, side, 0.77, 0.32)], cyan, FRONT, 0.46);
      }
      for (let i = 0; i < 5; i++) {
        const x = side * (0.65 + i * 0.46), y = top - 0.06 - i * 0.13;
        const z = surface.face(x, y, 1) + 0.29;
        slab(armor, [[x - 0.38, y + 0.34, z], [x + 0.38, y + 0.34, z],
          [x + side * 0.15, y - 0.35 - i % 2 * 0.14, z]], FRONT, 0.18, 0.66,
        i % 2 ? fur : frost, fur);
      }
    }

    const sealY = bottom + (top - bottom) * 0.59;
    const sealZ = surface.front(sealY) + 0.41;
    const octagon = (radius, z) => Array.from({ length: 8 }, (_, i) => {
      const angle = (i + 0.5) * Math.PI / 4;
      return [radius * Math.cos(angle), sealY + radius * Math.sin(angle), z];
    });
    slab(armor, octagon(1.19, sealZ), FRONT, 0.26, 0.88, "#c44a19", "#f7931a");
    slab(armor, octagon(0.86, sealZ + 0.27), FRONT, 0.045, 0.94, "#8b291b", "#ffba53");
    const glyph = [".#.#.", "####.", ".#..#", ".###.", ".#..#", "####.", ".#.#."];
    glyph.forEach((row, y) => {
      Array.from(row).forEach((pixel, x) => {
        if (pixel !== "#") return;
        const left = (x - 2.5) * 0.19, base = sealY + (2.9 - y) * 0.19;
        poly(armor, rect(left, left + 0.19, base, base + 0.19, sealZ + 0.33), "#ffe09a", FRONT, 0.17);
      });
    });

    const boltZ = surface.front(bottom + 0.48) + 0.35;
    poly(armor, [[0.27, bottom + 0.99, boltZ], [-0.62, bottom + 0.39, boltZ],
      [0.03, bottom + 0.43, boltZ], [-0.27, bottom - 0.12, boltZ],
      [0.62, bottom + 0.58, boltZ], [-0.03, bottom + 0.54, boltZ]], cyan, FRONT, 0.56);
    return scaled(armor, u);
  };

  const pauldron = (side, u) => {
    const armor = geometry();
    loft(armor, [
      [-3.14, 1.16, 1.36, 0.52, side * 0.6],
      [-2.65, 1.82, 1.82, 0.66, side * 0.7],
      [-2.38, 2.08, 2.02, 0.62, side * 0.76],
      [-1.9, 2.41, 2.19, 0.75, side * 0.78],
      [-0.75, 2.24, 2.15, 0.7, side * 0.76],
      [0.18, 1.72, 1.83, 0.64, side * 0.77],
      [0.75, 0.92, 1.21, 0.47, side * 0.93]
    ], [steel, glacier, midnight, blue, glacier, frost]);

    for (const [x, z, height, width] of [[0.97, -0.76, 1.88, 0.58],
      [1.68, 0.18, 1.48, 0.52], [2.21, -0.51, 1.03, 0.43]]) {
      loft(armor, [[-0.48, width, width * 0.77, 0.23, side * x, z],
        [0.18, width, width * 0.77, 0.23, side * x, z],
        [height, 0.035, 0.06, 0.025, side * (x + 0.46), z - 0.21]], [glacier, frost]);
    }

    const muzzle = (points, z) => points.map(([x, y]) => [side * (0.79 + x), y, z]);
    const crest = [[-1.04, -0.31], [-0.94, 0.37], [-0.44, -0.14], [0.44, -0.14],
      [0.94, 0.37], [1.04, -0.31], [0.88, -1.17], [0.39, -1.39],
      [0.24, -1.88], [-0.24, -1.88], [-0.39, -1.39], [-0.88, -1.17]];
    slab(armor, muzzle(crest, 2.02), FRONT, 0.25, 0.94, midnight, steel);
    const face = [[-0.83, -0.16], [-0.44, -0.39], [0.44, -0.39], [0.83, -0.16],
      [0.7, -1.02], [0.34, -1.19], [0.19, -1.64], [-0.19, -1.64], [-0.34, -1.19], [-0.7, -1.02]];
    slab(armor, muzzle(face, 2.28), FRONT, 0.15, 0.93, frost, glacier);
    for (const eye of [-1, 1]) {
      const glint = [[0.19 * eye, -0.89], [0.63 * eye, -0.72],
        [0.57 * eye, -0.89], [0.24 * eye, -1.02]];
      poly(armor, muzzle(glint, 2.44), steel, FRONT);
      poly(armor, muzzle([[0.25 * eye, -0.88], [0.56 * eye, -0.77],
        [0.43 * eye, -0.89]], 2.45), cyan, FRONT, 0.72);
    }
    slab(armor, muzzle([[-0.2, -1.5], [0.2, -1.5], [0.13, -1.66], [-0.13, -1.66]], 2.44),
      FRONT, 0.13, 0.78, midnight);
    return scaled(armor, u);
  };

  BL.characters.add({
    handle: "amlozano1",
    joined: 1795544153,
    lastCommit: 1795544153,
    look: {
      build: "normal",
      skin: "#b78066",
      hair: "#302622",
      fur,
      face: "beard",
      eyeColor: "#539bda",
      eyeGlow: 0.23,
      noFlaps: true
    },
    voice: {
      poke: "Something need doing?",
      idle: ["work work"]
    },
    dress: {
      torso(k, v) {
        v.fill(0, 8, 0, 2, 0, 5, k.color(midnight));
        v.fill(1, 7, 3, 7, 1, 4, (x, y) => k.color(y === 3 ? midnight : steel));
        v.set(4, 3, 4, k.color(glacier));
      },
      gear(k) {
        const [dark, plate, ice] = [midnight, steel, glacier].map(k.color);
        const sleeves = makeVox();
        sleeves.fill(0, 2, 2, 7, 0, 2, (_, y) => y === 3 ? ice : y < 7 ? plate : dark);
        sleeves.fill(-1, 3, 8, 10, -1, 3, plate);
        sleeves.fill(-1, 3, 0, 1, -1, 3, dark);
        k.parts.armR.geometry = k.parts.armL.geometry = k.vg(sleeves,
          { x: -1.5 * k.u, y: -11 * k.u, z: -1.5 * k.u });
        const boots = makeVox();
        boots.fill(0, 3, 2, 4, 0, 3, (x, y, z) => y === 2 && z === 3 ? ice : y === 3 ? dark : plate);
        boots.fill(0, 3, 0, 1, 0, 5, (x, y, z) => y === 0 ? dark : z >= 3 ? ice : plate);
        k.parts.legR.geometry = k.parts.legL.geometry = k.vg(boots,
          { x: -2 * k.u, y: -5 * k.u, z: -2.5 * k.u });
      },
      mark(k, v) {
        const sweep = k.color("#504039");
        const frontEdge = [3, 4, 4, 5, 5, 6, 6, 5, 4];
        for (let x = -1; x <= 7; x++) {
          for (let y = 6; y <= 9; y++) {
            for (let z = -1; z <= 6; z++) v.del(x, y, z);
          }
          const crest = x >= 2 && x <= 5 ? 9 : x === -1 || x === 7 ? 7 : 8;
          for (let y = 6; y <= crest; y++) {
            const front = frontEdge[x + 1] - (y - 6);
            const back = y <= 7 ? -1 : 0;
            for (let z = back; z <= front; z++) {
              v.set(x, y, z, (x + 2 * y + z) % 7 === 0 ? sweep : k.P.hair);
            }
          }
        }
        for (const [x, low, high] of [[-1, 1, 5], [7, 0, 5]]) {
          for (let y = low; y <= high; y++) {
            v.set(x, y, 3, y % 3 === 0 ? sweep : k.P.hair);
            if (y > low) v.set(x, y, 4, k.P.hair);
          }
        }
        v.set(5, 5, 6, k.P.hair);
        v.set(6, 5, 6, sweep);
        v.set(7, 4, 5, k.P.hair);

        const stubble = k.color("#4b3731");
        for (let x = 0; x <= 6; x++) {
          for (let z = 5; z <= 7; z++) {
            v.del(x, -2, z);
            v.del(x, -1, z);
          }
          v.del(x, 0, 7);
          v.del(x, 1, 7);
          v.set(x, 0, 6, stubble);
          v.set(x, 1, 6, x <= 1 || x >= 5 ? stubble : k.P.skin);
        }
        v.fill(2, 4, -1, -1, 5, 6, stubble);
        v.fill(2, 4, 1, 1, 7, 7, stubble);
        v.set(3, 0, 7, k.color("#211916"));
      },
      model(k, wear) {
        hero();
        const body = wear();
        body.torso = merge(body.torso, chestArmor(BL.heroBody.trunk(k.traits.slim), k.u));
        body.arm = merge(body.arm, pauldron(-1, k.u));
        body.armL = merge(body.armL, pauldron(1, k.u));
        return body;
      },
      club(k) {
        hero();
        const hammer = geometry();
        loft(hammer, [[-1.18, 0.47, 0.44, 0.15], [-0.85, 0.54, 0.49, 0.16],
          [-0.54, 0.38, 0.35, 0.12], [3.8, 0.38, 0.35, 0.12],
          [4.52, 0.56, 0.48, 0.17], [4.87, 0.75, 0.55, 0.2]], [glacier, steel, midnight, steel, cyan]);
        loft(hammer, [[4.78, 2.02, 0.75, 0.35], [5.25, 2.71, 0.98, 0.5],
          [6.5, 2.79, 1.03, 0.51], [7.09, 2.02, 0.67, 0.34]],
        [glacier, blue, frost]);
        const iceFace = [[-2.32, 5.77, 1.036], [-1.72, 6.39, 1.036], [1.82, 6.39, 1.036],
          [2.26, 6.02, 1.036], [1.75, 5.44, 1.036], [-1.81, 5.44, 1.036]];
        slab(hammer, iceFace, FRONT, 0.13, 0.84, glacier, frost);
        poly(hammer, [[-1.86, 5.91, 1.17], [-0.55, 6.14, 1.17], [-0.26, 5.85, 1.17],
          [0.44, 6.06, 1.17], [1.79, 5.96, 1.17], [0.39, 5.91, 1.17], [-0.32, 5.69, 1.17],
          [-0.6, 5.97, 1.17]], snow, FRONT, 0.62);
        hammer.slingTurn = 0;
        const hold = { x: 0.31, z: -0.08 };
        return { default: scaled(hammer, k.u), rest: hold, carry: hold };
      }
    }
  });
})();
