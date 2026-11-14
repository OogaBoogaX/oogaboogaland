(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  let slots = null;
  const colors = (k) => slots || (slots = {
    gown: k.color("#f3c63f"),
    gownLt: k.color("#fbdc6e"),
    gownDk: k.color("#d9a52a"),
    cream: k.color("#f6ecd2"),
    lilac: k.color("#a98fd0"),
    glove: k.color("#fbf7ee"),
    shoe: k.color("#e6d3b3"),
    shoeDk: k.color("#1b1b1d"),
    iris: k.color("#3f7fc4"),
    lip: k.color("#c8525e"),
    blush: k.color("#f4a3a0"),
    noseTip: k.color("#eaa98f")
  });
  const fold = (x, y, z) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(z + 5, 83492791)) >>> 0) % 5;
  const gownAt = (C) => (x, y, z) => { const f = fold(x, y, z); return f === 0 ? C.gownDk : f === 1 ? C.gownLt : C.gown; };
  const legVox = (C, side) => {
    const v = makeVox();
    v.fill(0, 3, 3, 4, 0, 3, gownAt(C));
    v.fill(0, 3, 2, 2, 0, 3, (x, y, z) => (x + z) % 2 ? C.cream : C.glove);
    v.fill(0, 3, 1, 1, 0, 4, C.shoe);
    v.fill(0, 3, 0, 0, 1, 4, C.shoe);
    v.fill(0, 3, 0, 1, 5, 5, C.shoe);
    v.fill(0, 3, 0, 0, 5, 5, C.shoeDk);
    v.set(side < 0 ? 3 : 0, 0, 6, C.shoeDk);
    v.set(side < 0 ? 1 : 2, 0, 6, C.shoeDk);
    v.fill(0, 3, 0, 0, 0, 0, C.shoeDk);
    v.fill(1, 2, 1, 1, 0, 0, C.shoeDk);
    return v;
  };
  const armVox = (k, C) => {
    const v = makeVox();
    v.fill(0, 2, 2, 6, 0, 2, k.skinJ);
    v.fill(0, 2, 7, 7, 0, 2, C.cream);
    v.fill(-1, 3, 8, 10, -1, 3, gownAt(C));
    v.fill(0, 2, 11, 11, 0, 2, C.gownLt);
    v.fill(-1, 3, 0, 1, -1, 3, C.glove);
    return v;
  };
  const N = ["1001", "1101", "1011", "1001"];
  const INK = [BL.math.hexToRgb("#27324f")];
  const tattoo = (u) => {
    const v = makeVox();
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) if (N[row][col] === "1") v.set(0, 3 - row, 3 - col, 0);
    return voxelGeometry(v, { unit: u / 2, palette: INK, origin: { x: 1.5 * u + 0.002 - u / 2, y: -7.5 * u, z: -u } });
  };
  const fingerVox = (C) => {
    const v = makeVox();
    v.set(0, 1, 4, C.glove);
    v.set(2, 1, 4, C.glove);
    return v;
  };
  const hexRgb = BL.math.hexToRgb;
  const BOUQUET = ["#4f9a3a", "#2f6e26", "#ff8a1f", "#e8600f", "#ffd34a", "#f59ab4", "#f7efdc"].map(hexRgb);
  const STEM = 0, LEAF = 1, PETAL = 2, PETAL_DK = 3, HEART = 4, RIBBON = 5, PAPER = 6;
  const BLOOMS = [[0, 9, 0], [-2, 8, -1], [3, 8, 1], [1, 8, 3], [0, 8, -2], [2, 10, -1], [-1, 10, 2]];
  let bouquet = null;
  const bouquetVox = () => {
    if (bouquet) return bouquet;
    const v = bouquet = makeVox();
    v.fill(0, 1, 0, 4, 0, 1, STEM);
    v.fill(-1, 2, 2, 2, -1, 2, RIBBON);
    v.set(2, 1, 2, RIBBON);
    v.set(2, 1, 0, RIBBON);
    for (const [y, r] of [[4, 1], [5, 2], [6, 2], [7, 3]]) {
      for (let x = -r + 1; x <= r; x++) for (let z = -r + 1; z <= r; z++) {
        if (x === -r + 1 || x === r || z === -r + 1 || z === r) v.set(x, y, z, PAPER);
        else v.set(x, y, z, STEM);
      }
    }
    for (const [x, z] of [[-3, 0], [4, 1], [1, -3], [0, 4]]) v.fill(x, x, 8, 8, z, z, LEAF);
    for (const [x, y, z] of BLOOMS) {
      v.fill(x - 1, x + 1, y, y, z - 1, z + 1, (px, py, pz) => (px + pz) % 2 ? PETAL : PETAL_DK);
      v.set(x, y + 1, z, PETAL);
      v.set(x, y, z, HEART);
      v.set(x, y + 1, z, HEART);
    }
    return v;
  };
  const bouquetGeometry = (h) => {
    const H = BL.heroBody, geo = BL.models.geometry(), hex = (i) => { const c = BOUQUET[i]; return "#" + c.map((n) => Math.round(n).toString(16).padStart(2, "0")).join(""); };
    const stem = hex(STEM), leaf = hex(LEAF), petal = hex(PETAL), petalDk = hex(PETAL_DK), heart = hex(HEART), ribbon = hex(RIBBON), paper = hex(PAPER), paperDk = H.shade(paper, 0.86), ribbonDk = H.shade(ribbon, 0.8);
    H.loft(geo, [[-0.74, 0.28, 0.28, 0.1], [-0.6, 0.42, 0.42, 0.15], [3.3, 0.52, 0.52, 0.18]], [H.shade(stem, 0.85), stem]);
    H.loft(geo, [[1.8, 0.62, 0.62, 0.2], [2.4, 0.62, 0.62, 0.2]], ribbon);
    for (const s of [-1, 1]) {
      H.both(geo, [[0.1 * s, 2.1, 0.66], [1.05 * s, 2.62, 0.74], [1.15 * s, 1.72, 0.74]], ribbon, ribbonDk);
      H.both(geo, [[0.08 * s, 1.95, 0.66], [0.62 * s, 0.85, 0.72], [0.28 * s, 0.95, 0.72]], ribbonDk, ribbon);
    }
    H.slab(geo, H.rect(-0.2, 0.2, 1.9, 2.3, 0.63, 0.06), H.FRONT, 0.14, 0.8, ribbon, ribbonDk);
    H.loft(geo, [[3.0, 0.72, 0.72, 0.25], [4.4, 1.55, 1.55, 0.5], [5.6, 2.35, 2.35, 0.8], [6.35, 2.85, 2.85, 1, 0, 0, null, -0.08]], [paperDk, paper, paper], [true, false]);
    H.loft(geo, [[5.85, 2.42, 2.42, 0.85], [6.1, 2.55, 2.55, 0.9]], leaf, [false, true]);
    const frame = (n) => {
      const l = Math.hypot(n[0], n[1], n[2]), N = [n[0] / l, n[1] / l, n[2] / l], up = Math.abs(N[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      let a = [up[1] * N[2] - up[2] * N[1], up[2] * N[0] - up[0] * N[2], up[0] * N[1] - up[1] * N[0]];
      const al = Math.hypot(a[0], a[1], a[2]);
      a = [a[0] / al, a[1] / al, a[2] / al];
      return { N, a, b: [N[1] * a[2] - N[2] * a[1], N[2] * a[0] - N[0] * a[2], N[0] * a[1] - N[1] * a[0]] };
    };
    const light = H.shade(petal, 1.14);
    const bloom = (c, n, r, salt) => {
      const { N, a, b } = frame(n), at = (ang, far, lift) => [0, 1, 2].map((i) => c[i] + (a[i] * Math.cos(ang) + b[i] * Math.sin(ang)) * far + N[i] * lift);
      const ring = (count, turn, far, w, base, cup, tones) => {
        for (let p = 0; p < count; p++) {
          const ang = (p + turn) / count * Math.PI * 2, low = base + (p % 2) * 0.08 * r, tone = tones[p % 2];
          H.both(geo, [at(ang, far * 0.1, low), at(ang - w, far * 0.62, low + cup * 0.45), at(ang - w * 0.62, far * 0.92, low + cup * 0.85), at(ang, far, low + cup),
            at(ang + w * 0.62, far * 0.92, low + cup * 0.85), at(ang + w, far * 0.62, low + cup * 0.45)], tone, H.shade(tone, 0.82));
        }
      };
      ring(8, salt * 0.37, r, 0.52, 0.08 * r, 0.34 * r, [petalDk, petal]);
      ring(6, salt * 0.37 + 0.5, r * 0.62, 0.66, 0.3 * r, 0.3 * r, [petal, light]);
      const top = at(0, 0, 0.72 * r);
      for (let p = 0; p < 8; p++) H.both(geo, [at(p / 8 * Math.PI * 2, r * 0.26, 0.46 * r), at((p + 1) / 8 * Math.PI * 2, r * 0.26, 0.46 * r), top], heart, H.shade(heart, 0.8));
    };
    bloom([0, 8.0, 0], [0, 1, 0.12], 1.7, 0);
    for (let i = 0; i < 6; i++) {
      const ang = (i + 0.5) / 6 * Math.PI * 2, x = Math.sin(ang), z = Math.cos(ang);
      bloom([x * 2.25, 7.15 + (i % 2) * 0.3, z * 2.25], [x, 0.95, z], 1.45, i + 1);
      const la = ang + Math.PI / 6, lx = Math.sin(la), lz = Math.cos(la), wx = lz * 0.5, wz = -lx * 0.5;
      H.both(geo, [[lx * 2.3, 6.5, lz * 2.3], [lx * 3.2 + wx, 6.95, lz * 3.2 + wz], [lx * 4.3, 7.5, lz * 4.3], [lx * 3.2 - wx, 6.95, lz * 3.2 - wz]], leaf, H.shade(leaf, 0.8));
    }
    return H.scaled(geo, h / 16);
  };
  const modelled = () => BL.models.STYLE === "R";
  BL.characters.add({
    handle: "natalievarty",
    joined: 1793927061,
    lastCommit: 1793927061,
    look: {
      build: "slim", height: 0.94, noBrow: true, face: "smirk",
      skin: "#f2c6a4", hair: "#6e3d1f", fur: "#f3c63f",
      portrait: { min: [-1, -3, -4], max: [7, 9, 8] }
    },
    voice: {
      poke: "Oh! Goodness, you startled me.",
      idle: ["I must sketch this banana.", "Fascinating. Simply fascinating.", "Tea, anyone?", "Notes, notes, notes.", "One more expedition.", "A whole island of Oogas!"]
    },
    dress: {
      model(k, wear) {
        const H = BL.heroBody, { geometry, merge } = BL.models, u = k.u, F = H.FRONT, body = wear();
        const skin = "#f2c6a4", skinDk = "#dba888", lash = "#3a2416", lip = "#c8525e", lipDk = "#a8424d";
        const face = (shut) => {
          const g = H.loft(geometry(), [[0, 2.1, 2.3, 0.8, 0, 0.3], [1.2, 3.05, 3, 0.9], [4.6, 3.25, 3, 0.9], [6.3, 3, 2.8, 1], [7, 2, 1.9, 0.8]], skin), z = 3.005;
          for (const side of [-1, 1]) {
            const cx = 1.62 * side, out = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)], [fx0, fx1] = out(2.5, 3.05);
            if (shut) {
              H.slab(g, H.rect(cx - 0.92, cx + 0.92, 2.98, 3.16, z, 0.07), F, 0.04, 1, lash);
              H.slab(g, [[fx0, 3.0, z], [fx1, 2.86, z], [side > 0 ? fx1 : fx0, 3.2, z]], F, 0.04, 1, lash);
            } else {
              H.slab(g, H.rect(cx - 0.92, cx + 0.92, 2.5, 3.96, z, 0.36), F, 0.04, 1, "#fbf8f2", "#e3dccf");
              H.slab(g, H.rect(cx - 0.64, cx + 0.64, 2.54, 3.92, z + 0.04, 0.32), F, 0.03, 1, "#2f66a8");
              H.slab(g, H.rect(cx - 0.5, cx + 0.5, 2.6, 3.42, z + 0.07, 0.26), F, 0.02, 1, "#5b9be0");
              H.slab(g, H.rect(cx - 0.25, cx + 0.25, 2.96, 3.52, z + 0.09, 0.09), F, 0.02, 1, "#15100d");
              H.slab(g, H.rect(cx + 0.14 * side - 0.17, cx + 0.14 * side + 0.17, 3.4, 3.74, z + 0.11, 0.05), F, 0.02, 1, "#ffffff");
              H.slab(g, H.rect(cx - 0.34 * side - 0.09, cx - 0.34 * side + 0.09, 2.74, 2.92, z + 0.11), F, 0.02, 1, "#ffffff");
              H.slab(g, H.rect(cx - 1.0, cx + 1.0, 3.92, 4.12, z + 0.04, 0.06), F, 0.05, 1, lash);
              H.slab(g, [[fx0, 3.94, z + 0.04], [fx1, 4.06, z + 0.04], [side > 0 ? fx1 : fx0, 4.4, z + 0.04]], F, 0.05, 1, lash);
            }
            H.slab(g, H.rect(2.15 * side - 0.56, 2.15 * side + 0.56, 1.62, 2.2, z, 0.22), F, 0.012, 1, "#f4a3a0");
            H.slab(g, side > 0 ? [[0.3, 1.06, z], [0.66, 1.3, z], [0.62, 1.42, z], [0.3, 1.2, z]] : [[-0.3, 1.2, z], [-0.62, 1.42, z], [-0.66, 1.3, z], [-0.3, 1.06, z]], F, 0.05, 0.95, lip, lipDk);
          }
          H.slab(g, H.rect(-0.3, 0.3, 1.06, 1.2, z), F, 0.05, 0.95, lip, lipDk);
          H.slab(g, H.rect(-0.27, 0.27, 2.0, 2.46, z, 0.1), F, 0.3, 0.6, "#eaa98f", skinDk);
          return g;
        };
        const v = makeVox(), tone = (x, y, z) => ((Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
        const lock = (x, y, z) => v.set(x, y, z, tone(x, y, z) < 22 ? 1 : 0);
        for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
          const rim = x === 0 || x === 7 || z === 0 || z === 7, corner = (x === 0 || x === 7) && (z === 0 || z === 7), side = x === 0 || x === 7;
          if (!corner) lock(x, 7, z);
          if (!rim) lock(x, 8, z);
          if (!rim || corner) continue;
          if (z !== 7) lock(x, 6, z);
          if (z === 0) for (let y = x >= 2 && x <= 5 ? 0 : 1; y <= 5; y++) lock(x, y, z);
          if (side && z <= 5) for (let y = z <= 1 ? 1 : z <= 3 ? 2 : 4; y <= 5; y++) lock(x, y, z);
          if (side && z === 6) for (let y = x ? 1 : 0; y <= 5; y++) lock(x, y, z);
        }
        for (let x = 1; x <= 6; x++) lock(x, 6, 7);
        for (let x = 1; x <= 4; x++) lock(x, 5, 7);
        lock(1, 4, 7);
        for (let x = 2; x <= 5; x++) for (let y = 6; y <= 9; y++) for (let z = -3; z <= -1; z++) {
          const ends = (x === 2 || x === 5 ? 1 : 0) + (y === 6 || y === 9 ? 1 : 0) + (z === -3 ? 1 : 0);
          if (ends < 2) lock(x, y, z);
        }
        const blocks = voxelGeometry(v, { unit: u, palette: [BL.math.hexToRgb("#6e3d1f"), BL.math.hexToRgb("#57301a")], origin: { x: -4 * u, y: 0, z: -4 * u } });
        const head = (shut) => merge(blocks, H.scaled(face(shut), u));
        return { ...body, headOpen: head(false), headClosed: head(true) };
      },
      torso(k, v) {
        const C = colors(k), gown = gownAt(C);
        v.fill(1, 7, 3, 7, 1, 4, gown);
        v.fill(1, 7, 3, 3, 1, 4, C.gownDk);
        v.fill(0, 8, 0, 2, 0, 5, gown);
        v.fill(2, 6, 7, 7, 1, 4, C.cream);
        v.fill(3, 5, 6, 6, 5, 5, C.lilac);
        v.set(4, 5, 5, C.lilac);
        for (const x of [2, 4, 6]) v.fill(x, x, 0, 2, 5, 5, C.gownDk);
        k.loin = [C.gown, C.gownLt];
      },
      gear(k) {
        const C = colors(k), u = k.u;
        k.parts.legR.geometry = k.vg(legVox(C, -1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        k.parts.legL.geometry = k.vg(legVox(C, 1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        const arm = k.vg(armVox(k, C), { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
        k.parts.armR.geometry = k.parts.armL.geometry = arm;
        if (modelled()) {
          const H = BL.heroBody, ink = "#27324f", n = BL.models.geometry(), X = 1.0, out = [1, 0, 0];
          const stroke = (y0, z0, y1, z1, w) => H.poly(n, [[X, y0, z0 + w], [X, y0, z0 - w], [X, y1, z1 - w], [X, y1, z1 + w]], ink, out);
          stroke(0.5, 0.36, -0.5, 0.36, 0.08);
          stroke(0.5, -0.36, -0.5, -0.36, 0.08);
          stroke(0.5, 0.36, -0.5, -0.36, 0.09);
          const worn = createNode({ geometry: H.scaled(n, u) });
          worn.forearm = 0.5;
          addChild(k.parts.armL, worn);
        } else addChild(k.parts.armL, createNode({ geometry: tattoo(u) }));
        const fingers = k.vg(fingerVox(C), { x: -1.5 * u, y: -u, z: -1.5 * u });
        k.parts.fingersR.geometry = k.parts.fingersL.geometry = fingers;
      },
      crown(k, v) {
        const H = k.P.hair, D = k.P.hairDk;
        for (let x = -1; x <= 7; x++) for (let y = -5; y <= 0; y++) for (let z = -2; z <= 4; z++) if (y < 0 || x < 0 || x > 6 || z < 0) v.del(x, y, z);
        v.fill(1, 5, 5, 8, -4, -3, H);
        v.fill(2, 4, 6, 7, -5, -5, D);
        v.fill(2, 4, 9, 9, -4, -3, D);
        for (const x of [-1, 7]) v.fill(x, x, -1, 5, 4, 5, (xx, y) => y % 3 ? H : D);
        v.fill(0, 3, 5, 5, 6, 6, H);
        v.set(0, 4, 6, H);
        v.set(4, 5, 6, D);
      },
      eyes(k, v) {
        const C = colors(k);
        for (const [outer, inner] of [[0, 1], [6, 5]]) {
          v.set(outer, 3, 5, k.P.white);
          v.set(inner, 3, 5, C.iris);
          v.set(outer, 2, 5, C.iris);
          v.set(inner, 2, 5, C.iris);
          k.eyeCells.push([outer, 3], [inner, 3], [outer, 2], [inner, 2]);
        }
        return true;
      },
      mark(k, v) {
        const C = colors(k);
        v.set(1, 4, 6, k.P.hairDk);
        v.set(5, 4, 6, k.P.hairDk);
        v.set(6, 4, 6, k.P.hairDk);
        v.set(-1, 3, 5, k.P.hairDk);
        v.set(7, 3, 5, k.P.hairDk);
        v.set(3, 1, 6, C.noseTip);
        for (const x of [1, 5]) v.set(x, 1, 6, C.blush);
        for (const x of [0, 6]) v.set(x, 1, 5, C.blush);
        v.set(2, 0, 6, k.P.skin);
        v.set(3, 0, 6, C.lip);
        v.set(4, 0, 6, k.P.skin);
      },
      club: (k) => modelled() ? { default: bouquetGeometry(k.h), rest: { x: 0.55, z: 0 }, carry: { x: 0.8, z: 0 } }
        : { voxels: bouquetVox(), palette: BOUQUET, rest: { x: 0.55, z: 0 }, carry: { x: 0.8, z: 0 } },
      headgear(k) {
        const s = k.parts.head.scale;
        s.x = s.y = s.z = 1.18;
      }
    }
  });
})();
