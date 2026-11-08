(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, merge, variants } = BL.models;
  const { createNode, addChild } = BL.scene;
  const height = 1.06;
  // Her club: a polished rose-silver club studded with glowing diamonds.
  const gem = (h, x, y, z, s, color) => {
    const g = lathe({ profile: [[0, 0.75 * s], [s, 0.2 * s], [0.7 * s, -0.1 * s], [0, -s]], segments: 6, color, emissive: 0.9 });
    const v = g.verts;
    for (let i = 0; i < v.length; i += 3) { v[i] += x; v[i + 1] += y; v[i + 2] += z; }
    return g;
  };
  const club = (h, gold) => {
    const u = h / 16, metal = gold ? "#f2c94c" : "#e9c6d8", shine = gold ? "#fff1b8" : "#fdf3fa", stone = gold ? "#fffbe8" : "#c9f6ff";
    const parts = [
      // A wrapped grip, a polished shaft and a rounded head.
      lathe({ profile: [[0.5 * u, -2 * u], [0.55 * u, -1.6 * u], [0.55 * u, 1.6 * u], [0.5 * u, 2 * u]], segments: 8, color: "#7a4a8c" }),
      lathe({ profile: [[0.42 * u, 2 * u], [0.6 * u, 6 * u], [0.9 * u, 8.5 * u]], segments: 10, color: metal }),
      lathe({ profile: [[0.9 * u, 8.5 * u], [1.7 * u, 9.8 * u], [1.9 * u, 11.2 * u], [1.5 * u, 12.6 * u], [0.6 * u, 13.4 * u], [0, 13.6 * u]], segments: 12, color: metal }),
      box({ w: 0.25 * u, h: 3 * u, d: 0.2 * u, color: shine, emissive: 0.5, offset: { x: 0.9 * u, y: 11 * u, z: 1.4 * u } }),
      // A big diamond crowning it.
      gem(h, 0, 14.4 * u, 0, 1 * u, stone)
    ];
    // Two rings of diamonds round the head, staggered.
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, b = a + Math.PI / 6;
      parts.push(gem(h, Math.cos(a) * 1.95 * u, 10.4 * u, Math.sin(a) * 1.95 * u, 0.45 * u, stone));
      parts.push(gem(h, Math.cos(b) * 1.75 * u, 12.1 * u, Math.sin(b) * 1.75 * u, 0.38 * u, stone));
    }
    // A few small ones down the shaft.
    for (const y of [3.5, 5.2, 6.9]) parts.push(gem(h, 0, y * u, 0.62 * u, 0.28 * u, stone));
    return merge(...parts);
  };
  const clubGeometry = variants((gold) => club(height, gold));
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
      torso(k, v) {
        // A black top with a gold lightning bolt, pink shorts to match her lipstick and a brown belt.
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
        // Swap the long back fall for a high ponytail, and add a black headband.
        for (let y = -5; y <= 5; y++) for (let x = -1; x <= 7; x++) v.del(x, y, -2);
        const band = k.color("#141416");
        for (let x = -1; x <= 7; x++) v.set(x, 6, 6, band);
        for (let z = -1; z <= 5; z++) { v.set(-1, 6, z, band); v.set(7, 6, z, band); }
        for (let y = 5; y <= 9; y++) for (let x = 2; x <= 4; x++) v.set(x, y, -2, k.hairJ());
        for (let y = -1; y <= 7; y++) for (let x = 3 - (y < 2 ? 0 : 1); x <= 3 + (y < 2 ? 0 : 1); x++) v.set(x, y, -3, k.hairJ());
        // Side-swept bangs over one brow.
        for (let x = 0; x <= 3; x++) v.set(x, 5, 6, k.hairJ());
      },
      eyes(k, v) {
        // Big green eyes, three cells tall, each with a white sparkle up top.
        const green = k.color("#3fb065"), spark = k.P.white;
        for (const [x0, x1] of [[0, 1], [5, 6]]) for (let x = x0; x <= x1; x++) for (let y = 2; y <= 4; y++) {
          v.set(x, y, 5, y === 4 && (x === 0 || x === 6) ? spark : green);
          k.eyeCells.push([x, y]);
        }
        return true;
      },
      mark(k, v) {
        // Pupils, lashes, a little nose, rosy cheeks and a lipstick smile.
        const P = k.P, lip = k.color("#e23a72"), blush = k.color("#f5a3b1");
        v.set(1, 2, 5, k.color("#3fb065"));
        v.set(5, 2, 5, k.color("#3fb065"));
        v.set(1, 3, 5, P.black);
        v.set(5, 3, 5, P.black);
        v.set(0, 5, 6, P.black);
        v.set(6, 5, 6, P.black);
        v.del(3, 3, 6);
        // The lips sit on the muzzle's front (z 6), which would otherwise hide them.
        v.fill(2, 4, 0, 0, 6, 6, lip);
        v.set(1, 1, 6, lip);
        v.set(5, 1, 6, lip);
        v.set(0, 1, 5, blush);
        v.set(6, 1, 5, blush);
      },
      club: () => ({ default: clubGeometry(0), gold: clubGeometry(1) }),
      extras(k) {
        const u = k.u, boot = "#141416", sole = "#2a2a2e";
        // Short black boots with a pink bow on each toe.
        const bow = "#ff6fa8", knot = "#e23a72";
        // The stock foot under it runs from the heel at z -2.5u to the toes' front at 4.5u: the boot reaches 0.2u past
        // both (-2.7u to 4.7u), so no skin pokes through and no face of it lies flush with the boot's.
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
        // A "T" tattoo on the outside of her left upper arm, inked just over the skin.
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
