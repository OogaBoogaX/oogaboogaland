
(() => {
  "use strict";

  const BL = window.BL;
  const { geometry, pushVert, face } = BL.models;
  const { hexToRgb } = BL.math;

  const boulderGeometry = (h) => {
    const geo = geometry();
    const u = h / 16;

    const rings = [
      { y: 1, r: 1.7 },
      { y: 2, r: 2.5 },
      { y: 4, r: 3.1 },
      { y: 6, r: 2.8 },
      { y: 7, r: 1.9 }
    ];

    const segments = 8;
    const colors = ["#777777", "#686868", "#929292", "#555555"];
    const vertices = [];

    for (let r = 0; r < rings.length; r++) {
      const ring = [];

      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const wobble = 1 + 0.08 * Math.sin(i * 4 + r * 2);

        ring.push(pushVert(
          geo,
          Math.cos(angle) * rings[r].r * wobble * u,
          rings[r].y * u,
          Math.sin(angle) * rings[r].r * wobble * u
        ));
      }

      vertices.push(ring);
    }

    const bottom = pushVert(geo, 0, 0.5 * u, 0);
    const top = pushVert(geo, 0, 7.5 * u, 0);

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;

      face(
        geo,
        [bottom, vertices[0][i], vertices[0][next]],
        hexToRgb(colors[i % 4])
      );

      for (let r = 0; r < rings.length - 1; r++) {
        const shade = hexToRgb(colors[(i + r) % 4]);

        face(geo, [
          vertices[r][i],
          vertices[r + 1][i],
          vertices[r + 1][next],
          vertices[r][next]
        ], shade);
      }

      face(
        geo,
        [
          vertices[rings.length - 1][i],
          top,
          vertices[rings.length - 1][next]
        ],
        hexToRgb(colors[(i + 2) % 4])
      );
    }

    return geo;
  };

  BL.characters.add({
    handle: "Global-DSB",
    joined: 1761945600,
    lastCommit: 1795350000,

    look: {
      bald: true,
      hairless: true,
      cleanShaven: true,
      noBrow: true,
      noPupils: true,
      face: "none",
      height: 1.10,
      skin: "#ed3025",
      hair: "#ed3025",
      fur: "#ed3025",
      eyeColor: "#ffffff",
      eyeGlow: 0
    },

    voice: {
      poke: "DSB LOVES CAVEMAN LAND!",
      idle: [
        "DSB loves rocks!",
        "DSB is happy!",
        "Where is DSB's boulder?",
        "DSB likes red!",
        "DSB smash big rock!",
        "DSB wants cookies!",
        "Caveman DSB is here!"
      ]
    },

    dress: {
      skull(k, v) {
        const red = k.color("#ed3025");
        const dark = k.color("#b91d18");
        const white = k.color("#ffffff");
        const black = k.color("#080808");
        const orange = k.color("#ff8c00");

        const redJ = k.jit(red, dark, 0.08);

        v.fill(-1, 7, 0, 7, -1, 5, redJ);

        for (const x of [1, 5]) {
          v.set(x, 5, 6, white);
          v.set(x, 5, 7, black);
          k.eyeCells.push([x, 5]);
        }

        v.fill(2, 4, 5, 7, 6, 7, orange);

        return true;
      },

      eyes(k, v) {
        const white = k.color("#ffffff");
        const black = k.color("#080808");

        for (const x of [1, 5]) {
          v.set(x, 5, 5, white);
          v.set(x, 5, 6, black);
        }

        return true;
      },

      torso(k, v) {
        const red = k.color("#ed3025");
        const dark = k.color("#b91d18");
        const redJ = k.jit(red, dark, 0.08);

        v.fill(0, 7, 0, 7, 0, 5, redJ);

        return true;
      },

      club(k) {
        return {
          default: boulderGeometry(k.h),
          rest: { x: 0, y: Math.PI / 2, z: 0.24 },
          carry: { x: 0, y: Math.PI / 2, z: 0.95 }
        };
      }
    }
  });
})();
