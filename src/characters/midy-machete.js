(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry } = BL.models;
  const { createNode, addChild } = BL.scene;
  const SKIN = "#d98b47", RED = "#ff2438", RED_CORE = "#fff4ee", WHITE = "#fff3f0", PINK = "#ffb3b6", LID = "#a8643a";
  const GOLD = "#f2b523", GOLD_HI = "#ffd768", GOLD_DK = "#c4861a", ORANGE = "#f7931a";
  const TOP = "#1a171b", SHORTS = "#2f3a3a", LEATHER = "#6a4424", BOOT = "#17131a", SOLE = "#8a4f1c";
  const HAIR = ["#241612", "#33211a", "#4a3024"];
  const BROW = "#2a1610", LIPS = "#5a2a1c", BLUSH = "#d47b40";
  const BTC = ["01010", "11110", "10001", "11110", "10001", "11110", "01010"];
  const eachMark = (fn) => BTC.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === "1") fn(c, r); });
  const mix = (x, y, z) => ((Math.imul(x + 11, 73856093) ^ Math.imul(y + 29, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
  const modelled = () => BL.models.STYLE === "R";
  const HEAD = 0.85, NECK = 0.7;
  const SOLES = 0.45;
  const mane = (put, bare) => {
    const tone = (x, y, z) => { const n = mix(x, y, z); return n < 34 ? 0 : n < 74 ? 1 : 2; };
    const hair = (x, y, z) => put(x, y, z, tone(x, y, z));
    const gap = (x, y, z) => mix(x, y, z) < 24;
    for (let x = -1; x <= 7; x++) for (let z = -1; z <= 5; z++) { hair(x, 7, z); hair(x, 6, z); if (x >= 0 && x <= 6 && z >= 0 && z <= 4) { hair(x, 8, z); hair(x, 9, z); } }
    for (let x = 2; x <= 4; x++) for (const z of [4, 5]) bare(x, 6, z);
    for (const x of [0, 6]) hair(x, 5, 5);
    for (let x = -1; x <= 7; x++) { hair(x, 7, 6); if (x <= 1 || x >= 5) hair(x, 6, 6); }
    for (const x of [-1, 0, 6, 7]) hair(x, 5, 6);
    for (const x of [-1, 7]) hair(x, 4, 6);
    for (const x of [-1, 7]) {
      for (let y = -2; y <= 5; y++) for (let z = -1; z <= (y < 0 ? 1 : 4); z++) hair(x, y, z);
      for (let y = 3; y <= 6; y++) hair(x, y, 5);
    }
    for (const x of [-2, 8]) for (let y = -4; y <= 7; y++) for (let z = -2; z <= 3; z++) {
      if (y < 0 && z > -1) continue;
      const edge = y === -4 || y === 7 || z === -2 || z === 3 || (y < 0 && z === -1);
      if (!(edge && gap(x, y, z))) hair(x, y, z);
    }
    for (const x of [-3, 9]) for (let y = 1; y <= 6; y++) for (let z = -1; z <= 2; z++) if (!gap(x, y, z) || (y > 2 && y < 6 && z === 0)) hair(x, y, z);
    for (let x = -1; x <= 7; x++) {
      const long = x <= -1 || x >= 7 ? -3 : x <= 0 || x >= 6 ? -4 : x <= 1 || x >= 5 ? -5 : -6;
      for (let y = long; y <= 7; y++) {
        if (!(y === long && gap(x, y, -1))) hair(x, y, -1);
        if (y >= long + 1 && !((y === long + 1 || y === 7 || x === -1 || x === 7) && gap(x, y, -2))) hair(x, y, -2);
      }
      if (x >= 0 && x <= 6) { hair(x, -1, 0); hair(x, -2, 0); }
    }
  };

  const crownGeometry = (u) => {
    const v = makeVox(), X0 = -2, X1 = 15, Z0 = -2, Z1 = 12, Y0 = 16, Y1 = 19, ring = [];
    for (let x = X0; x <= X1; x++) ring.push([x, Z1]);
    for (let z = Z1 - 1; z >= Z0; z--) ring.push([X1, z]);
    for (let x = X1 - 1; x >= X0; x--) ring.push([x, Z0]);
    for (let z = Z0 + 1; z < Z1; z++) ring.push([X0, z]);
    ring.forEach(([x, z], n) => {
      const p = n % 5, q = n % 6;
      for (let y = Y0; y <= Y1; y++) v.set(x, y, z, (y === 17 || y === 18) && (q === 1 || q === 2) ? 3 : y === Y0 ? 2 : y === Y1 ? 1 : 0);
      if (p < 3) for (let y = Y1 + 1; y <= Y1 + 3; y++) v.set(x, y, z, p === 1 && y === Y1 + 2 ? 3 : y === Y1 + 3 ? 1 : 0);
    });
    return voxelGeometry(v, { unit: u / 2, palette: [GOLD, GOLD_HI, GOLD_DK, "#d61f2c"], origin: { x: -3.5 * u, y: 0, z: -3 * u } });
  };
  const coinGeometry = (u) => {
    const v = makeVox(), R = 7.6;
    for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) {
      const d = Math.hypot(x, y);
      if (d <= R) for (const z of [0, 1]) v.set(x, y, z, d > R - 1.3 ? 2 : 0);
    }
    eachMark((c, r) => v.set(c - 2, 3 - r, 2, 1));
    return voxelGeometry(v, { unit: u / 4, palette: [ORANGE, GOLD_HI, GOLD_DK], origin: { x: 0, y: 0, z: 0 } });
  };
  const bagGeometry = (u) => {
    const v = makeVox();
    for (let x = -6; x <= 6; x++) for (let y = -14; y <= -2; y++) for (let z = -4; z <= 4; z++) {
      const nx = x / 6.4, ny = (y + 7.5) / 6.8, nz = z / 4.6;
      if (nx * nx + ny * ny * 1.1 + nz * nz <= 1) v.set(x, y, z, mix(x, y, z) < 18 ? 1 : mix(x, y, z) > 88 ? 2 : 0);
    }
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) v.set(x, -1, z, 3);
    for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) for (let y = 0; y <= 2; y++) if (Math.abs(x) + Math.abs(z) <= 4 + y) v.set(x, y, z, y === 2 ? 2 : 0);
    eachMark((c, r) => v.set(c - 2, -5 - r, 5, 3));
    return voxelGeometry(v, { unit: u / 4, palette: ["#8a5a32", "#6e4524", "#a8703f", GOLD, GOLD_DK], origin: { x: 0, y: 0, z: 0 } });
  };

  const DOG_INK = ["#f8e8c8", "#ead0a2", "#c98146", "#a8642f"];
  const dogGeometry = (u, part) => {
    const v = makeVox(), CREAM = 0, CREAM_DK = 1, TAN = 2, TAN_DK = 3;
    const fur = (x, y, z) => mix(x, y, z) < 18 ? CREAM_DK : CREAM, tan = (x, y, z) => mix(x, y, z) < 28 ? TAN_DK : TAN;
    if (part === "leg") { v.fill(-1, 0, -3, -1, -1, 0, fur); v.fill(-1, 0, -4, -4, -1, 0, TAN); }
    if (part === "tail") { v.fill(-1, 0, 0, 2, -1, -1, fur); v.fill(-1, 0, 2, 5, -2, -2, fur); v.fill(-1, 0, 5, 6, -1, -1, CREAM); }
    if (part) return voxelGeometry(v, { unit: u / 2, palette: DOG_INK });
    v.fill(-2, 2, 4, 8, -6, 3, (x, y, z) => (y >= 7 && z >= -4 && z <= -1) || (Math.abs(x) === 2 && y >= 5 && z >= -5 && z <= -3) ? tan(x, y, z) : fur(x, y, z));
    v.fill(-2, 2, 4, 7, 4, 4, fur);
    const coat = (x, y, z) => x !== 0 && y >= 11 && (z >= 6 || y >= 13 || Math.abs(x) === 3) ? tan(x, y, z) : fur(x, y, z);
    v.fill(-3, 3, 8, 13, 1, 7, coat); v.fill(-2, 2, 14, 14, 2, 6, coat);
    v.fill(-2, 2, 8, 10, 8, 9, fur);
    for (const s of [-1, 1]) {
      v.fill(4 * s, 4 * s, 6, 13, 2, 5, (x, y, z) => y === 6 && mix(x, y, z) < 45 ? null : y <= 7 || z === 2 ? TAN_DK : TAN);
      v.fill(5 * s, 5 * s, 7, 11, 3, 4, tan);
    }
    return voxelGeometry(v, { unit: u / 2, palette: DOG_INK, origin: { x: -u / 4, y: 0, z: 0 } });
  };
  const dogDetail = (u) => {
    const H = BL.heroBody, v = makeVox(), g = BL.models.geometry();
    v.fill(6, 11, 46, 52, 32, 32, 0); v.fill(-12, -7, 46, 52, 32, 32, 0);
    v.fill(5, 12, 53, 54, 32, 33, 2); v.fill(-13, -6, 53, 54, 32, 33, 2);
    v.fill(-4, 3, 40, 44, 36, 40, 0); v.fill(-1, 0, 36, 39, 40, 40, 0);
    v.fill(-7, 6, 34, 35, 40, 40, 0); v.fill(6, 7, 36, 36, 40, 40, 0); v.fill(-8, -7, 36, 36, 40, 40, 0);
    v.fill(-4, 3, 29, 35, 40, 41, 1); v.fill(-3, 2, 28, 28, 40, 41, 1);
    const A = 1.36, Z = 2.61, L = 3.3, hem = (at) => 1.1 + 2.9 * at / L, p = 0.25, front = Z + 0.012;
    const cloth = [[-A, 4], [A, 4], [A, hem(A)], [0.08, 1.1], [-0.08, 1.1], [-A, hem(A)]].map(([x, y]) => [x, y, Z - 0.1]);
    H.slab(g, cloth, H.FRONT, 0.1, 1, TOP);
    H.poly(g, cloth, TOP, [0, 0, -1]);
    for (const e of [-1, 1]) H.slab(g, [[4, Z], [4, Z - L + A], [hem(A), Z]].map(([y, z]) => [e * (A - 0.1), y, z]), [e, 0, 0], 0.1, 1, TOP);
    eachMark((c, r) => {
      const x = (c - 2.5) * p, y = 3.45 - r * p;
      H.poly(g, [[x, y - p, front], [x + p, y - p, front], [x + p, y, front], [x, y, front]], GOLD, H.FRONT);
    });
    return BL.models.merge(voxelGeometry(v, { unit: u / 8, palette: ["#1b1210", "#ec6f86", DOG_INK[3]] }), H.scaled(g, u));
  };

  const swordGeometry = (h) => {
    const H = BL.heroBody, geo = BL.models.geometry();
    const steel = "#dcd9d2", steelDk = "#a9a69f", flat = "#1d171c";
    const dark = "#262024", mark = GOLD;
    H.loft(geo, [[-2.1, 0.42, 0.52, 0.16], [-1.4, 0.42, 0.52, 0.16]], dark);
    H.loft(geo, [[-1.4, 0.34, 0.4, 0.14], [1.2, 0.34, 0.4, 0.14]], "#17131a", [false, false]);
    H.loft(geo, [[1.2, 0.46, 2.15, 0.2], [1.72, 0.46, 2.15, 0.2]], dark);
    H.loft(geo, [[1.72, 0.17, 1.24, 0.12], [3, 0.17, 1.24, 0.12]], [steel, steelDk], [false, false]);
    H.loft(geo, [[2.95, 0.17, 1.8, 0.15], [9.6, 0.17, 1.8, 0.15], [12.3, 0.03, 0.05, 0.02]], [steel, steelDk]);
    H.loft(geo, [[1.72, 0.25, 1.06, 0.1], [9.5, 0.25, 1.06, 0.1], [11.6, 0.06, 0.08, 0.03]], flat);
    const pw = 0.25, ph = 0.3, top = 5.1;
    for (const side of [-1, 1]) eachMark((c, r) => {
      const x = side * 0.262, z = -side * (c - 2) * pw, y = top - r * ph;
      H.poly(geo, [[x, y - ph, z - pw / 2], [x, y - ph, z + pw / 2], [x, y, z + pw / 2], [x, y, z - pw / 2]], mark, [side, 0, 0]);
    });
    return Object.assign(H.scaled(geo, h / 16), { slingTurn: Math.PI / 2, slingHiltUp: true });
  };
  const swordVox = () => {
    const v = makeVox();
    v.fill(-1, 1, -6, -1, 0, 1, 2);
    v.fill(-4, 4, 0, 1, 0, 1, 2);
    v.fill(-2, 2, 2, 3, 0, 1, (x) => Math.abs(x) === 2 ? 1 : 0);
    v.fill(-3, 3, 4, 15, 0, 1, (x) => Math.abs(x) >= 2 ? 1 : 0);
    v.fill(-2, 2, 16, 17, 0, 1, (x) => Math.abs(x) === 2 ? 1 : 0);
    v.fill(-1, 1, 18, 19, 0, 1, 1);
    return v;
  };
  const blockSword = (k, palette) => voxelGeometry(swordVox(), { unit: k.u / 2, palette, origin: { x: -0.25 * k.u, y: 0, z: 0 } });

  BL.characters.add({
    handle: "midy-machete",
    display: "Midy-Machete",
    joined: 1794434196,
    lastCommit: 1794435352,
    look: {
      build: "slim", height: 1.04, face: "none", hairless: true, noBrow: true, noPupils: true, noFlaps: true,
      skin: SKIN, hair: "#1d1420", fur: "#c58b55",
      portrait: { min: [-3, -2, -3], max: [9, 9, 7] }
    },
    voice: {
      poke: "Stack sats!",
      idle: [
        "GM, humble plebs!",
        "Not your keys, not your coins.",
        "Proof of work, every day.",
        "Junior, let's go explore!",
        "Bitcoin warrior queen reporting for duty."
      ]
    },
    dress: {
      torso(k, v) {
        const shorts = k.color(SHORTS), belt = k.color(LEATHER), gold = k.color(GOLD), top = k.color(TOP), skin = k.skinJ;
        v.fill(0, 8, 0, 2, 0, 5, shorts);
        v.fill(0, 8, 3, 3, 0, 5, modelled() ? skin : belt);
        v.fill(0, 8, 4, 5, 0, 5, skin);
        v.fill(0, 8, 6, 7, 0, 5, top);
        if (!modelled()) { v.set(4, 3, 5, gold); v.set(4, 6, 5, gold); }
      },
      gear(k) {
        const u = k.u, skin = k.skinJ, shorts = k.color(SHORTS), boot = k.color(BOOT), sole = k.color(SOLE), gold = k.color(GOLD);
        const leg = (side) => {
          const v = makeVox();
          v.fill(0, 3, 4, 4, 0, 3, modelled() ? skin : shorts);
          v.fill(0, 3, 3, 3, 0, 3, skin);
          v.fill(0, 3, 2, 2, 0, 3, boot);
          v.fill(0, 3, 1, 1, 0, 5, boot);
          v.fill(0, 3, 0, 0, 0, 5, sole);
          v.set(side < 0 ? 3 : 0, 0, 6, sole);
          v.set(side < 0 ? 1 : 2, 0, 6, sole);
          return v;
        };
        k.parts.legR.geometry = k.vg(leg(-1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        k.parts.legL.geometry = k.vg(leg(1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        const arm = makeVox();
        arm.fill(0, 2, 2, 10, 0, 2, skin);
        arm.fill(0, 2, 2, 2, 0, 2, gold);
        arm.fill(-1, 3, 0, 1, -1, 3, skin);
        k.parts.armR.geometry = k.parts.armL.geometry = k.vg(arm, { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
      },
      club: (k) => modelled()
        ? { default: swordGeometry(k.h), rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 } }
        : { default: blockSword(k, ["#1d171c", "#dcd9d2", "#262024"]), rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 } },
      model(k, wear) {
        const H = BL.heroBody, M = BL.models, u = k.u, body = wear(), S = H.trunk(true);
        const tuck = (y) => y >= 2.6 ? 1 : (y < 1.2 ? 1.5 + (y + 0.4) / 1.6 * 0.25 : 1.75 - (y - 1.2) / 1.4 * 0.15) / S.ring(y)[1];
        for (let v = body.torso.verts, i = 0; i < v.length; i += 3) if (v[i + 2] > 0) v[i + 2] *= tuck(v[i + 1] / u);
        const hu = u * HEAD, hair = makeVox(), skin = makeVox(), low = (y) => y > 0 ? y - 1 : y, at = { x: -3.5 * hu, y: NECK * u, z: -3 * hu };
        const flesh = (x, y, z) => skin.fill(2 * x, 2 * x + 1, 2 * y, 2 * y + 1, 2 * z, 2 * z + 1, 0);
        const keeps = (x, y, z) => y && !((x < 0 || x > 6) && (y < 5 && z > 4 || y < 3 && (z > 1 || x < -2 || x > 8) || (y === 3 || y === 4) && (z === 2 || z === 3)));
        mane((x, y, z, t) => { if (keeps(x, y, z)) hair.set(x, low(y), z, t); }, (x, y, z) => { hair.del(x, low(y), z); flesh(x, low(y), z); });
        for (let x = 0; x <= 6; x++) for (let y = 0; y <= 4; y++) for (let z = 0; z <= 5; z++) if (!hair.has(x, y, z)) flesh(x, y, z);
        skin.fill(0, 13, -1, -1, 0, 11, 0);
        const bare = M.moved(voxelGeometry(skin, { unit: hu / 2, palette: [SKIN], origin: at }), 0, 0, 0.003 * hu);
        bare.voxel = null;
        const blocks = M.merge(voxelGeometry(hair, { unit: hu, palette: HAIR, origin: at }), bare);
        const face = (shut) => {
          const g = M.geometry(), z = 3 * HEAD + 0.002, F = H.FRONT;
          for (const side of [-1, 1]) {
            const X = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)];
            const [bx0, bx1] = X(0.4, 2.7);
            H.slab(g, H.rect(bx0, bx1, 4.27, 4.92, z, 0.1, 0.25 * side), F, 0.3, 0.92, BROW, "#170b08");
            const [ex0, ex1] = X(0.78, 2.34);
            const liner = "#170d10";
            if (shut) {
              H.slab(g, H.rect(ex0, ex1, 2.6, 3.95, z, 0.2), F, 0.05, 1, LID);
              H.slab(g, H.rect(ex0, ex1, 2.66, 2.86, z + 0.05, 0.05), F, 0.04, 1, liner);
            } else {
              H.slab(g, H.rect(ex0 - 0.16, ex1 + 0.16, 2.44, 4.0, z, 0.24), F, 0.02, 1, "#c7401f", "#c7401f", 0.35);
              H.slab(g, H.rect(ex0, ex1, 2.6, 3.95, z + 0.02, 0.1), F, 0.04, 1, WHITE, "#e8c9c6", 0.85);
              const [ix0, ix1] = X(0.78, 1.8);
              H.slab(g, H.rect(ix0, ix1, 2.6, 3.95, z + 0.045, 0.06), F, 0.03, 1, RED, "#c4121e", 1);
              const [px0, px1] = X(1.86, 2.3);
              H.slab(g, H.rect(px0, px1, 2.66, 3.24, z + 0.06, 0.03), F, 0.015, 1, PINK, PINK, 0.9);
              const [cx0, cx1] = X(1.04, 1.54);
              H.slab(g, H.rect(cx0, cx1, 3.02, 3.52, z + 0.09, 0.02, Math.PI / 4), F, 0.03, 1, RED_CORE, RED_CORE, 1.7);
              const [lx0, lx1] = X(0.7, 2.62);
              H.slab(g, H.rect(lx0, lx1, 3.88, 4.16, z + 0.02, 0.06, 0.06 * side), F, 0.14, 1, liner);
            }
            const [kx0, kx1] = X(1.65, 2.85);
            H.slab(g, H.rect(kx0, kx1, 1.65, 2.3, z, 0.22), F, 0.01, 1, BLUSH);
            const [mx0, mx1] = X(0.5, 0.86);
            H.slab(g, H.rect(mx0, mx1, 1.5, 1.64, z, 0.03, 0.5 * side), F, 0.04, 1, LIPS);
            const sx = side * 3.5 * HEAD, out = (pts, ez) => pts.map(([o, y]) => [sx + o * side, y, ez]);
            const ear = out([[0, 2.95], [0.4, 2.95], [0.62, 3.2], [0.62, 3.95], [0.4, 4.2], [0, 4.2]], -0.34);
            H.slab(g, ear, F, 0.44, 0.86, SKIN, SKIN, 0.45);
            H.poly(g, ear, SKIN, [0, 0, -1], 0.45);
            H.poly(g, out([[0.14, 3.3], [0.44, 3.3], [0.44, 3.9], [0.14, 3.9]], 0.105), LID, F, 0.3);
            const cx = sx + side * 0.24, cy = 2.4, cz = 0, r0 = 0.3, r1 = 0.68, t = 0.2 * side, N = 8;
            for (let n = 0; n < N; n++) {
              const a0 = (n + 0.5) / N * Math.PI * 2, a1 = (n + 1.5) / N * Math.PI * 2, mid = (a0 + a1) / 2, at = (a, r, dx) => [cx + dx, cy + Math.sin(a) * r, cz + Math.cos(a) * r];
              H.poly(g, [at(a0, r0, t), at(a0, r1, t), at(a1, r1, t), at(a1, r0, t)], n % 2 ? GOLD : GOLD_HI, [side, 0, 0]);
              H.poly(g, [at(a0, r0, -t), at(a0, r1, -t), at(a1, r1, -t), at(a1, r0, -t)], GOLD_DK, [-side, 0, 0]);
              H.poly(g, [at(a0, r1, -t), at(a1, r1, -t), at(a1, r1, t), at(a0, r1, t)], GOLD, [0, Math.sin(mid), Math.cos(mid)]);
              H.poly(g, [at(a0, r0, -t), at(a1, r0, -t), at(a1, r0, t), at(a0, r0, t)], GOLD_DK, [0, -Math.sin(mid), -Math.cos(mid)]);
            }
          }
          H.slab(g, H.rect(-0.56, 0.56, 1.4, 1.54, z, 0.04), F, 0.04, 1, LIPS);
          M.moved(g, 0, NECK - HEAD, 0);
          return H.loft(g, [[0, 1.4, 1.3, 0.5, 0, -0.32], [NECK - 0.2, 1.4, 1.3, 0.5, 0, -0.32]], SKIN, [false, false]);
        };
        const head = (shut) => M.merge(blocks, H.scaled(face(shut), u));
        const g = M.geometry(), OFF = 0.07, WIDE = 1.6, foot = (S.heights || []).find((y) => y > 7.85 && y < 8.72), HIGH = foot ? foot + 0.05 : 8.72;
        const on = (x, y, way, d = OFF) => S.lift([x, y, S.face(x, y, way)], [0, y >= 7.6 ? 0.5 : 0, way], d);
        const shell = (y, d = OFF) => { const [hx, hz, cut, cz] = S.ring(y), f = hz * tuck(y); return [y, hx + d, (f + hz) / 2 + d, cut + d * 0.5, 0, cz + (f - hz) / 2]; };
        H.loft(g, [7.74, 7.8, ...(foot ? [foot] : []), HIGH].map((y) => shell(y)), TOP, [false, false]);
        H.loft(g, [shell(4.3, 0), shell(4.34), shell(4.75), shell(5.05), shell(5.28), shell(5.32, 0)], TOP, [false, false]);
        const flat = (y) => { const [hx, , cut] = S.ring(y); return Math.min(WIDE, hx - cut); };
        const end = foot || HIGH, f0 = S.ring(7.8), f1 = S.ring(end), w0 = f0[0] - f0[2], w1 = f1[0] - f1[2];
        const ROWS = [7.12, 7.25, 7.8, ...(w0 > WIDE && WIDE > w1 ? [7.8 + (w0 - WIDE) / (w0 - w1) * (end - 7.8)] : []), ...(foot ? [foot] : []), HIGH + 0.02], lift = OFF + 0.05;
        for (let i = 0; i + 1 < ROWS.length; i++) {
          const y0 = ROWS[i], y1 = ROWS[i + 1], a = flat(y0), b = flat(y1);
          H.poly(g, [on(-a, y0, 1, lift), on(a, y0, 1, lift), on(b, y1, 1, lift), on(-b, y1, 1, lift)], SKIN, [0, 0.4, 1]);
          if (b < WIDE) for (const e of [-1, 1]) H.poly(g, [on(e * a, y0, 1, lift), on(e * WIDE, y0, 1, lift), on(e * WIDE, y1, 1, lift), on(e * b, y1, 1, lift)], SKIN, [e, 0.4, 1]);
        }
        const pw = 0.26, ph = 0.232, top = 6.93, d = OFF + 0.04;
        eachMark((c, r) => {
          const x0 = (c - 2.5) * pw, y1 = top - r * ph;
          H.poly(g, [on(x0, y1 - ph, 1, d), on(x0 + pw, y1 - ph, 1, d), on(x0 + pw, y1, 1, d), on(x0, y1, 1, d)], GOLD, [0, 0, 1]);
        });
        H.loft(g, [shell(S.low + 0.02, 0.015), [S.low - 0.24, 2.9, 1.53, 0.5, 0, -0.03]], SHORTS, [false, true]);
        const B0 = 1.2, B1 = 2.5, BY = (B0 + B1) / 2;
        H.loft(g, [shell(B0 - 0.02, 0), shell(B0, 0.1), shell(B1, 0.1), shell(B1 + 0.02, 0)], LEATHER, [false, false]);
        const z0 = S.face(0, B0, 1) * tuck(B0) + 0.1, lean = (S.face(0, B1, 1) * tuck(B1) + 0.1 - z0) / (B1 - B0), nl = Math.hypot(lean, 1), out = [0, -lean / nl, 1 / nl];
        const plate = (w, t, c, up, deep, keep, ...ink) => H.slab(g, H.rect(-w, w, BY - t, BY + t, 0, c).map(([x, y]) => [x, y + out[1] * up, z0 + (y - B0) * lean + out[2] * up]), out, deep, keep, ...ink);
        plate(0.9, 0.8, 0.12, 0, 0.22, 0.94, GOLD, GOLD_DK);
        plate(0.55, 0.47, 0.06, 0.22, 0.02, 1, "#3b2413");
        plate(0.22, 0.19, 0.04, 0.24, 0.07, 0.9, GOLD_HI, GOLD);
        body.torso = M.merge(body.torso, H.scaled(g, u));
        const cuff = M.geometry(), bands = M.geometry();
        H.loft(cuff, [[-3.92, 0.84, 0.86, 0.3], [-3.76, 1.03, 1.05, 0.36], [-3.02, 1.07, 1.09, 0.36], [-2.86, 0.92, 0.95, 0.32]], [GOLD_DK, GOLD, GOLD_HI]);
        const band = "#2a242c";
        H.loft(bands, [[0.1, 1.36, 1.46, 0.42], [-0.96, 1.38, 1.48, 0.42], [-1.02, 1.31, 1.41, 0.4]], SHORTS, [false, false]);
        H.loft(bands, [[-3.95, 1.2, 1.31, 0.38, 0, 0.05], [-3.25, 1.15, 1.26, 0.38, 0, 0.07]], BOOT);
        H.loft(bands, [[-4.5, 1.33, 1.43, 0.4], [-3.95, 1.33, 1.43, 0.4]], band);
        H.loft(bands, [[-5.55, 1.31, 1.45, 0.4, 0, -0.03], [-5.05, 1.31, 1.43, 0.4]], band);
        H.loft(bands, [[-5.05, 1.21, 1.31, 0.355], [-4.5, 1.21, 1.31, 0.355]], "#e0851c", [false, false]);
        H.slab(bands, H.rect(-0.4, 0.4, -5.48, -5.12, 1.44, 0.05), H.FRONT, 0.12, 0.9, GOLD, GOLD_DK);
        H.loft(bands, [[-7 - SOLES, 1.26, 2.16, 0.35, 0, 0.6], [-6.68, 1.26, 2.16, 0.37, 0, 0.6]], [SOLE]);
        H.scaled(cuff, u); H.scaled(bands, u);
        for (const key of ["forearm", "forearmL"]) if (body[key]) body[key] = M.merge(body[key], cuff);
        for (const key of ["leg", "legL"]) if (body[key]) body[key] = M.merge(body[key], bands);
        return { ...body, headOpen: head(false), headClosed: head(true) };
      },
      crown(k, v) {
        const tones = HAIR.map((hex) => k.color(hex));
        mane((x, y, z, t) => v.set(x, y, z, tones[t]), (x, y, z) => v.set(x, y, z, k.P.skin));
      },
      eyes(k, v) {
        const red = k.color(RED), core = k.color(RED_CORE);
        for (const [x0, x1] of [[1, 2], [4, 5]]) for (let x = x0; x <= x1; x++) {
          v.set(x, 3, 5, x === 2 || x === 4 ? core : red);
          k.eyeCells.push([x, 3]);
        }
        k.headEmissive = { [red]: 1, [core]: 1.4 };
        k.lid = k.color(LID);
        return true;
      },
      mark(k, v) {
        const brow = k.color(BROW), lips = k.color(LIPS), gold = k.color(GOLD);
        for (const [x, y] of [[1, 5], [2, 4], [5, 5], [4, 4]]) v.set(x, y, 6, brow);
        for (const x of [2, 3, 4]) v.set(x, 1, 6, lips);
        for (const x of [-1, 7]) v.set(x, 1, 5, gold);
      },
      headgear(k) {
        const u = k.u, s = modelled() ? HEAD : 1, low = modelled() ? u * (s - NECK) : 0, size = { x: s, y: s, z: s };
        addChild(k.parts.head, createNode({ position: { x: 0, y: -low, z: 0 }, scale: size, geometry: crownGeometry(u) }));
        addChild(k.parts.head, createNode({ position: { x: 0, y: 9.7 * u * s - low, z: 3.5 * u * s }, scale: size, geometry: coinGeometry(u) }));
      },
      extras(k) {
        const h = k.h, u = k.u, bag = 0.67, big = 1.2;
        const up = modelled() ? SOLES * u : 0;
        k.root.position.y += up;
        const dog = k.parts.dog = createNode({ position: { x: 0.58 * h, y: -k.legH - up, z: -0.25 * h }, scale: { x: big, y: big, z: big }, geometry: dogGeometry(u) });
        const limb = (part, x, y, z) => { const n = createNode({ position: { x: x * u, y: y * u, z: z * u }, geometry: dogGeometry(u, part) }); addChild(dog, n); return n; };
        addChild(dog, createNode({ geometry: dogDetail(u) }));
        dog.legs = [[-0.75, 1.5], [0.75, 1.5], [-0.75, -2.5], [0.75, -2.5]].map(([x, z]) => limb("leg", x, 2, z));
        dog.tail = limb("tail", 0, 3.5, -3);
        dog.packAt = { y: 4.5 * u, z: -1.5 * u, scale: 0.25 };
        addChild(k.root, dog);
        addChild(k.parts.torso, createNode({ position: { x: -3.25 * u, y: 1.9 * u, z: -0.25 * u }, rotation: { x: 0, y: -1.62, z: 0.12 }, scale: { x: bag, y: bag, z: bag }, geometry: bagGeometry(u) }));
      }
    }
  });
})();
