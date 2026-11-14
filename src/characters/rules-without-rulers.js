(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, ring, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
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
    display: "genXbtc",
    joined: 1789801750,
    lastCommit: 1789954043,
    look: { portrait: { min: [-1, -2, 0], max: [7, 7, 8] }, pumpkin: true, bald: true, cleanShaven: true, noBrow: true, noPupils: true, face: "none", skin: "#cfc8b4", hair: "#151515", fur: "#141414", height: 1.16 },
    voice: {
      poke: "POWER OVERWHELMING",
      idle: ["Shut up you larp", "Rules Without Rulers"]
    },
    dress: {
      model(k, wear) {
        const H = BL.heroBody, body = wear(), S = H.trunk(false), geo = BL.models.geometry(), STEPS = 10, HALF = 0.36, OUT = [0, 0, -1];
        const top = S.top - 0.6, foot = S.belt + 0.45, corner = (y) => { const [hx, , cut] = S.ring(y); return hx - cut - 0.16; };
        const strap = "#f4f1e8", bound = "#c9c3b0", stitch = "#8f8875", steel = "#a8adb5", steelDk = "#6d727a";
        for (const side of [-1, 1]) {
          const x1 = side * corner(top), x0 = -side * corner(foot), length = Math.hypot(x1 - x0, top - foot), nx = -(top - foot) / length * HALF, ny = (x1 - x0) / length * HALF;
          const at = (t, s, lift) => { const y = foot + (top - foot) * t + ny * s; return [x0 + (x1 - x0) * t + nx * s, y, S.back(y) - lift]; };
          const run = (t0, t1, s0, s1, lift) => [at(t0, s0, lift), at(t0, s1, lift), at(t1, s1, lift), at(t1, s0, lift)];
          for (let i = 0; i < STEPS; i++) {
            const t0 = i / STEPS, t1 = (i + 1) / STEPS;
            H.slab(geo, run(t0, t1, -1, 1, 0.01), OUT, 0.08, 1, strap, bound);
            for (const [s0, s1] of [[-1, -0.72], [0.72, 1]]) H.poly(geo, run(t0, t1, s0, s1, 0.095), bound, OUT);
            H.poly(geo, run(t0 + 0.03, t0 + 0.07, -0.14, 0.14, 0.095), stitch, OUT);
          }
          for (const t of [0.035, 0.965]) {
            H.slab(geo, run(t - 0.022, t + 0.022, -0.42, 0.42, 0.09), OUT, 0.07, 0.7, steel, steelDk);
          }
        }
        const mid = (top + foot) / 2, pin = S.back(mid) - 0.1;
        H.slab(geo, [[0, mid + 0.95, pin], [0.72, mid, pin], [0, mid - 0.95, pin], [-0.72, mid, pin]], OUT, 0.1, 0.78, "#e89423", "#b86f12");
        H.slab(geo, H.rect(-0.17, 0.17, mid - 0.17, mid + 0.17, pin - 0.1, 0.06), OUT, 0.07, 0.7, steel, steelDk);
        body.torso = merge(body.torso, H.scaled(geo, k.u));
        return body;
      },
      torso(k, v) {
        const P = k.P, orange = k.color("#e89423");
        v.fill(0, 8, 0, 7, 0, 5, k.leopard);
        for (const ry of [1, 3, 5]) v.fill(1, 7, ry, ry, 5, 5, k.skinJ);
        v.fill(4, 4, 1, 6, 5, 5, k.skinJ);
        v.fill(3, 5, 4, 7, 5, 5, k.jit(P.white, P.skin, 0.3));
        v.fill(6, 7, 5, 6, 5, 5, orange);
        v.set(7, 6, 5, P.spot);
        if (BL.models.STYLE !== "R") for (let i = 0; i <= 6; i++) {
          v.set(1 + i, 7 - i, 0, P.white);
          v.set(7 - i, 7 - i, 0, P.white);
        }
        const hide = k.color("#c8923a"), spot = k.color("#4a2f16");
        k.loin = [hide, spot];
        for (let x = 0; x <= 8; x++) for (let z = 0; z <= 5; z++) for (const y of [0, 1]) {
          if (x === 0 || x === 8 || z === 0 || z === 5) v.set(x, y, z, (x * 3 + y * 5 + z * 7) % 6 === 0 ? spot : hide);
        }
      },
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
