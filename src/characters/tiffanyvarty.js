(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  const height = 1.06;
  const gem = (h, x, y, z, s, color) => {
    const g = lathe({ profile: [[0, 0.75 * s], [s, 0.2 * s], [0.7 * s, -0.1 * s], [0, -s]], segments: 6, color, emissive: 0.9 });
    const v = g.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] += x; v[i + 1] += y; v[i + 2] += z; }
    return g;
  };
  const club = (h) => {
    const u = h / 16, metal = "#e9c6d8", shine = "#fdf3fa", stone = "#c9f6ff";
    const parts = [
      lathe({ profile: [[0.5 * u, -2 * u], [0.55 * u, -1.6 * u], [0.55 * u, 1.6 * u], [0.5 * u, 2 * u]], segments: 8, color: "#7a4a8c" }),
      lathe({ profile: [[0.42 * u, 2 * u], [0.6 * u, 6 * u], [0.9 * u, 8.5 * u]], segments: 10, color: metal }),
      lathe({ profile: [[0.9 * u, 8.5 * u], [1.7 * u, 9.8 * u], [1.9 * u, 11.2 * u], [1.5 * u, 12.6 * u], [0.6 * u, 13.4 * u], [0, 13.6 * u]], segments: 12, color: metal }),
      box({ w: 0.25 * u, h: 3 * u, d: 0.2 * u, color: shine, emissive: 0.5, offset: { x: 0.9 * u, y: 11 * u, z: 1.4 * u } }),
      gem(h, 0, 14.4 * u, 0, 1 * u, stone)
    ];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, b = a + Math.PI / 6;
      parts.push(gem(h, Math.cos(a) * 1.95 * u, 10.4 * u, Math.sin(a) * 1.95 * u, 0.45 * u, stone));
      parts.push(gem(h, Math.cos(b) * 1.75 * u, 12.1 * u, Math.sin(b) * 1.75 * u, 0.38 * u, stone));
    }
    for (const y of [3.5, 5.2, 6.9]) parts.push(gem(h, 0, y * u, 0.62 * u, 0.28 * u, stone));
    return merge(...parts);
  };
  const clubGeometry = cached(() => club(height));
  BL.characters.add({
    handle: "tiffanyvarty",
    joined: 1793927094,
    lastCommit: 1793927094,
    look: { height, build: "slim", face: "nose", noBrow: true, skin: "#f6d2b8", hair: "#f26a1b", fur: "#1b1b1f" },
    voice: {
      poke: "Hands off, I'm on a mission.",
      idle: ["Mission log: stack sats, save the island.", "No villain outruns a Lightning payment.", "Diamond hands, diamond club.", "Call me when the mempool clears."]
    },
    dress: {
      model(k) {
        const H = BL.heroBody, { makeVox, voxelGeometry, geometry } = BL.models, u = k.u, F = H.FRONT;
        const top = "#1b1b1f", topDk = "#2a2a31", pink = "#e23a72", pinkDk = "#c42f62", skin = "#f6d2b8", skinDk = "#e6bca0", bow = "#ff6fa8";
        const body = H.build(k, {
          slim: true, skin, torso: [pink, pink, top, top, top, top, top, top, top, top, top, topDk, null], sleeve: top,
          belt: { color: "#7a4a26", gold: "#ffc23c", goldDark: "#c98a1b", goldLight: "#ffe08a" },
          skirt: [[1.5, pink, pinkDk, 0.12], [2, pinkDk, null, 0.02]],
          emblem: (g, chestZ, y0, y1) => {
            const z = chestZ(y0) + 0.02, at = (x, t) => [x, y0 + (y1 - y0) * t, z - (chestZ(y0) - chestZ(y0 + (y1 - y0) * t))];
            H.slab(g, [at(0.5, 0.98), at(0.05, 0.56), at(0.62, 0.56), at(-0.4, 0.02), at(-0.02, 0.46), at(-0.58, 0.46)], F, 0.08, 1, "#ffc23c", "#c98a1b");
          },
          boot: { color: "#17171a", sole: "#2f2f34", detail: (g, B) => {
            const z = B.foot[0][5] + B.foot[0][2] - 0.6, y = B.foot[1][0] + 0.1, n = [0, 0.8, 0.6];
            for (const side of [-1, 1]) H.slab(g, [[0.12 * side, y - 0.2, z], [0.85 * side, y - 0.42, z], [0.85 * side, y + 0.42, z], [0.12 * side, y + 0.2, z]], n, 0.22, 0.85, bow, pink);
            H.slab(g, H.rect(-0.2, 0.2, y - 0.22, y + 0.22, z), n, 0.3, 0.8, pink);
          } }
        });
        const armL = merge(body.arm), ink = "#3a2350", high = [0.95 / body.armScale, -2.05, -0.25], low = [0.85 / body.armScale, -6.1, -0.75];
        const span = Math.hypot(low[0] - high[0], low[1] - high[1], low[2] - high[2]), down = high.map((v, i) => (low[i] - v) / span);
        const outLength = Math.hypot(down[1], down[0]), out = [-down[1] / outLength, down[0] / outLength, 0];
        const lean = down[2], sideLength = Math.sqrt(1 - lean * lean), side = [-lean * down[0] / sideLength, -lean * down[1] / sideLength, (1 - lean * lean) / sideLength];
        const P = (across, along) => [(high[0] + down[0] * along + side[0] * across) * u, (high[1] + down[1] * along + side[1] * across) * u, (high[2] + down[2] * along + side[2] * across) * u];
        H.slab(armL, [P(-0.6, 0.3), P(0.6, 0.3), P(0.6, 0.65), P(-0.6, 0.65)], out, 0.02 * u, 1, ink);
        H.slab(armL, [P(-0.18, 0.65), P(0.18, 0.65), P(0.18, 1.8), P(-0.18, 1.8)], out, 0.02 * u, 1, ink);
        const skull = () => H.loft(geometry(), [[0, 2.1, 2.3, 0.8, 0, 0.3], [1.2, 3.05, 3, 0.9], [4.6, 3.25, 3, 0.9], [6.3, 3, 2.8, 1], [7, 2, 1.9, 0.8]], skin);
        const face = (shut) => {
          const g = skull(), z = 3.005;
          for (const side of [-1, 1]) {
            const X = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)], cx = 1.6 * side;
            if (shut) {
              H.slab(g, H.rect(cx - 0.85, cx + 0.85, 3.05, 3.25, z, 0.08), F, 0.04, 1, "#2a1a14");
            } else {
              H.slab(g, H.rect(cx - 0.85, cx + 0.85, 2.6, 3.9, z, 0.32), F, 0.04, 1, "#fbf8f2", "#e3dccf");
              H.slab(g, H.rect(cx - 0.56, cx + 0.56, 2.64, 3.84, z + 0.04, 0.3), F, 0.03, 1, "#2a7d47");
              H.slab(g, H.rect(cx - 0.46, cx + 0.46, 2.72, 3.74, z + 0.07, 0.26), F, 0.02, 1, "#3fb065");
              H.slab(g, H.rect(cx - 0.22, cx + 0.22, 2.98, 3.46, z + 0.09, 0.08), F, 0.02, 1, "#15100d");
              H.slab(g, H.rect(cx - 0.36, cx - 0.1, 3.42, 3.68, z + 0.11), F, 0.02, 1, "#ffffff");
              H.slab(g, H.rect(cx - 0.95, cx + 0.95, 3.84, 4.04, z + 0.04, 0.06), F, 0.05, 1, "#2a1a14");
              const [fx0, fx1] = X(2.45, 2.95);
              H.slab(g, [[fx0, 3.86, z + 0.04], [fx1, 3.98, z + 0.04], [side > 0 ? fx1 : fx0, 4.3, z + 0.04]], F, 0.05, 1, "#2a1a14");
            }
            const [bx0, bx1] = X(0.75, 2.6);
            H.slab(g, H.rect(bx0, bx1, 4.34, 4.55, z, 0.06, 0.09 * side), F, 0.08, 1, "#b0500f");
            H.slab(g, H.rect(2.1 * side - 0.5, 2.1 * side + 0.5, 1.7, 2.25, z, 0.2), F, 0.012, 1, "#f5a3b1");
            H.slab(g, [[0, 1.2, z], [0.78 * side, 1.27, z], [0.3 * side, 1.47, z], [0, 1.38, z]], F, 0.07, 0.96, pink, pinkDk);
          }
          H.slab(g, [[-0.78, 1.27, z], [-0.42, 0.97, z], [0.42, 0.97, z], [0.78, 1.27, z], [0, 1.2, z]], F, 0.09, 0.94, "#ec4f83", pinkDk);
          H.slab(g, [[-0.3, 1.95, z], [0.3, 1.95, z], [0.17, 2.75, z], [-0.17, 2.75, z]], F, 0.32, 0.6, skin, skinDk);
          return g;
        };
        const hair = "#f26a1b", hairDk = "#d95a12", band = "#141416", v = makeVox();
        const tone = (x, y, z) => ((Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
        const lock = (x, y, z) => v.set(x, y, z, tone(x, y, z) < 20 ? 1 : 0);
        for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
          const rim = x === 0 || x === 7 || z === 0 || z === 7, corner = (x === 0 || x === 7) && (z === 0 || z === 7);
          if (!corner) lock(x, 7, z);
          if (!rim && z < 6) lock(x, 8, z);
          if (x >= 2 && x <= 5 && z >= 1 && z <= 3 && tone(x, 9, z) < 70) lock(x, 9, z);
          if (!rim || corner) continue;
          v.set(x, 6, z, 2);
          if (z === 0) for (let y = x >= 2 && x <= 5 ? 0 : 2; y <= 5; y++) lock(x, y, z);
          if ((x === 0 || x === 7) && z <= 5) for (let y = z <= 4 ? -1 - (tone(x, 0, z) % 3) : 1 + (x ? 1 : 0); y <= 5; y++) lock(x, y, z);
          if ((x === 0 || x === 7) && z === 6) for (let y = 3; y <= 5; y++) lock(x, y, z);
        }
        for (const x of [-1, 8]) for (let z = 1; z <= 4; z++) for (let y = 1; y <= 5; y++) if (tone(x, y, z) < 62 && !(y === 5 && (z === 1 || z === 4))) lock(x, y, z);
        for (let x = 1; x <= 5; x++) lock(x, 5, 7);
        for (let x = 1; x <= 2; x++) lock(x, 4, 7);
        lock(6, 5, 7);
        for (const x of [3, 4]) {
          v.set(x, 7, -1, 2);
          lock(x, 8, -1); lock(x, 6, -1);
          for (let y = 3; y <= 8; y++) lock(x, y, -2);
          for (let y = 0; y <= 5; y++) lock(x, y, -3);
        }
        lock(3, -1, -3);
        const blocks = voxelGeometry(v, { unit: u, palette: [hair, hairDk, band], origin: { x: -4 * u, y: 0, z: -4 * u } });
        const head = (shut) => merge(blocks, H.scaled(face(shut), u));
        return { ...body, armL, headOpen: head(false), headClosed: head(true) };
      },
      torso(k, v) {
        const top = k.color("#1b1b1f"), topDk = k.color("#2a2a31"), shorts = k.color("#e23a72"), shortsDk = k.color("#c42f62");
        const belt = k.color("#7a4a26"), bolt = k.color("#ffc23c");
        v.fill(0, 8, 0, 2, 0, 5, shorts);
        v.fill(1, 7, 3, 7, 1, 4, top);
        v.fill(2, 6, 7, 7, 1, 4, topDk);
        v.fill(0, 8, 2, 2, 0, 5, belt);
        v.set(4, 2, 5, bolt);
        for (const [x, y] of [[5, 6], [4, 6], [4, 5], [3, 5], [4, 4], [3, 4]]) v.set(x, y, 4, bolt);
        k.loin = [shorts, shortsDk];
      },
      crown(k, v) {
        for (let y = -5; y <= 5; y++) for (let x = -1; x <= 7; x++) v.del(x, y, -2);
        const band = k.color("#141416");
        for (let x = -1; x <= 7; x++) v.set(x, 6, 6, band);
        for (let z = -1; z <= 5; z++) { v.set(-1, 6, z, band); v.set(7, 6, z, band); }
        for (let y = 5; y <= 9; y++) for (let x = 2; x <= 4; x++) v.set(x, y, -2, k.hairJ());
        for (let y = -1; y <= 7; y++) for (let x = 3 - (y < 2 ? 0 : 1); x <= 3 + (y < 2 ? 0 : 1); x++) v.set(x, y, -3, k.hairJ());
        for (let x = 0; x <= 3; x++) v.set(x, 5, 6, k.hairJ());
      },
      eyes(k, v) {
        const green = k.color("#3fb065"), spark = k.P.white;
        for (const [x0, x1] of [[0, 1], [5, 6]]) for (let x = x0; x <= x1; x++) for (let y = 2; y <= 4; y++) {
          v.set(x, y, 5, y === 4 && (x === 0 || x === 6) ? spark : green);
          k.eyeCells.push([x, y]);
        }
        return true;
      },
      mark(k, v) {
        const P = k.P, lip = k.color("#e23a72"), blush = k.color("#f5a3b1");
        v.set(1, 2, 5, k.color("#3fb065"));
        v.set(5, 2, 5, k.color("#3fb065"));
        v.set(1, 3, 5, P.black);
        v.set(5, 3, 5, P.black);
        v.set(0, 5, 6, P.black);
        v.set(6, 5, 6, P.black);
        v.del(3, 3, 6);
        v.fill(2, 4, 0, 0, 6, 6, lip);
        v.set(1, 1, 6, lip);
        v.set(5, 1, 6, lip);
        v.set(0, 1, 5, blush);
        v.set(6, 1, 5, blush);
      },
      club: () => ({ default: clubGeometry() }),
      extras(k) {
        if (BL.models.STYLE === "R") return;
        const u = k.u, boot = "#141416", sole = "#2a2a2e";
        const bow = "#ff6fa8", knot = "#e23a72";
        const bootGeo = merge(
          box({ w: 4.3 * u, h: 2.2 * u, d: 7.4 * u, color: boot, offset: { y: -3.9 * u, z: 1 * u } }),
          box({ w: 4.4 * u, h: 0.4 * u, d: 7.5 * u, color: sole, offset: { y: -4.9 * u, z: 1 * u } }),
          box({ w: 1.3 * u, h: 1.1 * u, d: 0.4 * u, color: bow, offset: { x: -0.85 * u, y: -3.2 * u, z: 4.85 * u } }),
          box({ w: 1.3 * u, h: 1.1 * u, d: 0.4 * u, color: bow, offset: { x: 0.85 * u, y: -3.2 * u, z: 4.85 * u } }),
          box({ w: 0.6 * u, h: 0.6 * u, d: 0.55 * u, color: knot, offset: { y: -3.2 * u, z: 4.9 * u } }),
          box({ w: 0.35 * u, h: 0.8 * u, d: 0.35 * u, color: bow, offset: { x: -0.4 * u, y: -3.85 * u, z: 4.9 * u } }),
          box({ w: 0.35 * u, h: 0.8 * u, d: 0.35 * u, color: bow, offset: { x: 0.4 * u, y: -3.85 * u, z: 4.9 * u } })
        );
        addChild(k.parts.legR, createNode({ geometry: bootGeo }));
        addChild(k.parts.legL, createNode({ geometry: bootGeo }));
        const ink = "#3a2350", tx = 1.52 * u;
        const tattoo = merge(
          box({ w: 0.06 * u, h: 0.4 * u, d: 1.8 * u, color: ink, offset: { x: tx, y: -4.4 * u } }),
          box({ w: 0.06 * u, h: 1.8 * u, d: 0.4 * u, color: ink, offset: { x: tx, y: -5.5 * u } })
        );
        addChild(k.parts.armL, createNode({ geometry: tattoo }));
      }
    }
  });
})();
