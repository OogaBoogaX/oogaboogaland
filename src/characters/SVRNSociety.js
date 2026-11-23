(() => {
  "use strict";
  const BL = window.BL;
  const { makeVox, voxelGeometry, merge, geometry } = BL.models;
  const GOLD = "#d4a017", GOLD_HI = "#f4d56a", GOLD_DK = "#8a6910", GRIP = "#5a3a1a";
  const LASH = "#3a1c10", BROW = "#5a2a16", PAINT = "#b42318";
  const GLYPH = {
    S: ["111", "100", "111", "001", "111"],
    V: ["101", "101", "101", "101", "010"],
    R: ["110", "101", "110", "101", "101"],
    N: ["101", "111", "101", "101", "101"],
    O: ["111", "101", "101", "101", "111"],
    C: ["111", "100", "100", "100", "111"],
    I: ["111", "010", "010", "010", "111"],
    E: ["111", "100", "110", "100", "111"],
    T: ["111", "010", "010", "010", "010"],
    Y: ["101", "101", "010", "010", "010"],
    "1": ["010", "110", "010", "010", "111"],
    "9": ["111", "101", "111", "001", "111"],
    "3": ["111", "001", "011", "001", "111"]
  };
  const stamp = (word, put) => {
    let pen = 0;
    for (const ch of word) {
      if (ch === " ") { pen += 2; continue; }
      const g = GLYPH[ch];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r][c] === "1") put(pen + c, r);
      pen += 4;
    }
  };
  const swordGeometry = (h) => {
    const H = BL.heroBody, geo = geometry();
    H.loft(geo, [[-1.5, 0.28, 0.42, 0.16], [-1.25, 0.48, 0.7, 0.22], [-0.95, 0.48, 0.7, 0.22], [-0.75, 0.32, 0.46, 0.16]], GOLD);
    H.loft(geo, [[-0.75, 0.4, 0.46, 0.16], [1.15, 0.4, 0.46, 0.16]], GRIP, [false, false]);
    H.loft(geo, [[1.15, 0.36, 1.85, 0.16], [1.65, 0.36, 1.85, 0.16]], [GOLD, GOLD_HI]);
    H.loft(geo, [[1.65, 0.2, 0.82, 0.16], [9.4, 0.17, 0.7, 0.14], [12.1, 0.12, 0.42, 0.09], [13.4, 0.03, 0.05, 0.02]], [GOLD, GOLD, GOLD_HI]);
    for (const side of [-1, 1]) H.poly(geo, [[side * 0.2, 2.2, -0.18], [side * 0.2, 2.2, 0.18], [side * 0.17, 9.2, 0.12], [side * 0.17, 9.2, -0.12]], GOLD_HI, [side, 0, 0], 0.35);
    const cw = 0.15, y0 = 3.15, z0 = -2.5 * cw;
    stamp("SVRN SOCIETY", (c, r) => {
      const y = y0 + c * cw, z = z0 + (4 - r) * cw;
      for (const side of [-1, 1]) {
        const x = side * 0.22;
        H.poly(geo, [[x, y, z], [x, y, z + cw * 0.82], [x, y + cw * 0.82, z + cw * 0.82], [x, y + cw * 0.82, z]], GOLD_DK, [side, 0, 0], 0.12);
      }
    });
    return Object.assign(H.scaled(geo, h / 16), { slingTurn: Math.PI / 2, slingHiltUp: true });
  };
  const facePaint = (shut) => {
    const H = BL.heroBody, g = geometry(), z = 3.04, F = H.FRONT;
    for (const side of [-1, 1]) {
      const cx = 1.6 * side, out = (a, b) => [Math.min(a * side, b * side), Math.max(a * side, b * side)];
      const top = [], bot = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, p = 0.67, th = 0.16 - 0.08 * t;
        const d = Math.abs((t - p) / (t < p ? p : 1 - p));
        const y = 4.22 + 0.18 * (1 - d * d);
        const x = side * (0.5 + t * 2.2);
        top.push([x, y + th * 0.45, z]);
        bot.push([x, y - th * 0.55, z]);
      }
      H.slab(g, top.concat(bot.reverse()), F, 0.05, 1, BROW, LASH);
      if (!shut) {
        H.slab(g, H.rect(cx - 0.86, cx + 0.86, 3.58, 3.76, z + 0.04, 0.05), F, 0.05, 1, LASH);
        const [fx0, fx1] = out(2.35, 2.95);
        H.slab(g, [[fx0, 3.62, z + 0.04], [fx1, 3.5, z + 0.04], [side > 0 ? fx1 : fx0, 3.98, z + 0.04]], F, 0.04, 1, LASH);
      }
    }
    const x0 = 1.55, x1 = 2.72, slant = 0.16, thick = 0.14, step = 0.44, yTop = 2.46;
    for (let i = 0; i < 3; i++) {
      const y = yTop - i * step;
      H.slab(g, [[x0, y - slant, z], [x1, y, z], [x1, y - thick, z], [x0, y - slant - thick, z]], F, 0.04, 1, PAINT, "#8e1a12");
    }
    return g;
  };

  const chestMark = () => {
    const H = BL.heroBody, g = geometry(), F = H.FRONT, INK = "#171412";
    const cx = 0, cy = 6.2, cz = 2.74, s = 1.05;
    const put = (pts) => H.slab(g, pts.map(([x, y]) => [cx + x * s, cy + y * s, cz]), F, 0.06, 1, INK);
    const brace = (x0, dir) => {
      put([[x0 + dir * -0.22, 0.52], [x0 + dir * -0.04, 0.7], [x0 + dir * 0.14, 0.7], [x0 + dir * 0.08, 0.42]]);
      put([[x0 + dir * -0.22, 0.56], [x0 + dir * 0.08, 0.46], [x0 + dir * 0.02, 0.06], [x0 + dir * -0.22, 0.06]]);
      put([[x0 + dir * 0.0, 0.22], [x0 + dir * 0.36, 0], [x0 + dir * 0.0, -0.22]]);
      put([[x0 + dir * -0.22, 0.18], [x0 + dir * 0.08, 0.18], [x0 + dir * 0.08, -0.18], [x0 + dir * -0.22, -0.18]]);
      put([[x0 + dir * -0.22, -0.06], [x0 + dir * 0.02, -0.06], [x0 + dir * 0.08, -0.46], [x0 + dir * -0.22, -0.56]]);
      put([[x0 + dir * -0.22, -0.52], [x0 + dir * 0.08, -0.42], [x0 + dir * 0.14, -0.7], [x0 + dir * -0.04, -0.7]]);
    };
    brace(-1.08, -1);
    put([[-0.42, -0.7], [-0.16, -0.7], [0.05, 0.7], [-0.15, 0.7]]);
    put([[0.42, -0.7], [0.16, -0.7], [-0.05, 0.7], [0.15, 0.7]]);
    brace(1.08, 1);
    return g;
  };
  const hairVox = (u, palette, P) => {
    const v = makeVox();
    const grain = (x, y, z) => ((Math.imul(x + 3, 73856093) ^ Math.imul(y + 5, 19349663) ^ Math.imul(z + 7, 83492791)) >>> 0) % 100;
    const lock = (x, y, z) => v.set(x, y, z, grain(x, y, z) < 16 ? 3 : 2);
    for (let x = -1; x <= 7; x++) for (let z = -1; z <= 6; z++) {
      const edge = (x === -1 || x === 7 ? 1 : 0) + (z === -1 || z === 6 ? 1 : 0);
      const open = z >= 5 && x <= 3;
      const part = x === 2 && z >= 4;
      if (edge < 2) {
        if (!open) lock(x, 6, z);
        if (!(z === 6 && x <= 4) && !part) lock(x, 7, z);
      }
      if (!edge && !part) lock(x, 8, z);
      if (x >= 1 && x <= 5 && z >= 1 && z <= 4 && !part) lock(x, 9, z);
    }
    lock(6, 5, 6); lock(6, 4, 6);
    lock(0, 5, 5); lock(0, 4, 5);
    for (let x = 0; x <= 6; x++) for (let y = -5 + Math.max(0, Math.abs(x - 3) - 1); y <= 5; y++) lock(x, y, -2);
    for (let x = -1; x <= 7; x++) for (let y = -4 + Math.max(0, Math.abs(x - 3) - 2); y <= 5; y++) lock(x, y, -1);
    for (const x of [-1, 7]) for (let z = 0; z <= 4; z++) for (let y = z <= 1 ? -3 : z - 4; y <= 5; y++) lock(x, y, z);
    for (const x of [-2, 8]) for (let z = 0; z <= 3; z++) for (let y = z === 0 || z === 3 ? 2 : 0; y <= (z === 0 || z === 3 ? 4 : 5); y++) lock(x, y, z);
    return voxelGeometry(v, { unit: u, palette: [palette[P.skin], palette[P.hair], palette[P.hair], palette[P.hairDk]], origin: { x: -3.5 * u, y: 0, z: -3 * u } });
  };
  const hairFront = () => {
    const H = BL.heroBody, g = geometry(), C = "#7b3a1d", D = "#5e2c16", F = H.FRONT;
    const strip = (pts, dx, dy, dz, deep, c) => {
      const a = [], b = [];
      for (const p of pts) { a.push([p[0] + dx, p[1] + dy, p[2] + dz]); b.push([p[0] - dx, p[1] - dy, p[2] - dz]); }
      H.slab(g, a.concat(b.reverse()), F, deep, 1, c, D);
    };
    const bang = (x0, y0, z0, x1, y1, z1, w, deep, c) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push([
          x0 + (x1 - x0) * t,
          y0 + (y1 - y0) * t + 0.16 * Math.sin(t * Math.PI * 1.1),
          z0 + (z1 - z0) * t + 0.08 * Math.sin(t * Math.PI)
        ]);
      }
      strip(pts, 0, w, 0, deep, c);
    };
    bang(-1.2, 6.9, 3.12, 2.15, 5.45, 3.28, 0.18, 0.14, C);
    bang(-0.95, 6.55, 3.22, 1.85, 5.35, 3.38, 0.14, 0.11, D);
    bang(-1.15, 7.2, 3.0, 1.45, 5.75, 3.18, 0.13, 0.1, C);
    const fall = (x0, z0, x1, z1, y0, y1, w, c) => {
      const pts = [];
      for (let i = 0; i <= 9; i++) {
        const t = i / 9;
        pts.push([
          x0 + (x1 - x0) * t + 0.16 * Math.sin(t * Math.PI * 1.35),
          y0 + (y1 - y0) * t,
          z0 + (z1 - z0) * t + 0.1 * Math.sin(t * Math.PI * 1.1)
        ]);
      }
      strip(pts, w, 0, 0, 0.11, c);
    };
    fall(2.75, 2.9, 2.6, 3.12, 6.15, 0.2, 0.16, C);
    fall(2.95, 2.72, 2.85, 3.0, 5.7, -0.1, 0.13, D);
    fall(-2.55, 2.85, -2.7, 3.08, 6.05, 0.25, 0.15, C);
    fall(-2.85, 2.68, -2.95, 2.95, 5.55, -0.05, 0.12, D);
    return g;
  };
  const withFace = (k, wear) => {
    const H = BL.heroBody, body = wear(), u = k.u, t = k.traits, P = k.P;
    const palette = [];
    palette[P.skin] = H.shade(t.skin, 1);
    palette[P.hair] = H.shade(t.hair, 1);
    palette[P.hairDk] = H.shade(t.hair, 0.85);
    palette[P.nose] = H.shade(t.skin, 1.18);
    const stock = H.head({ u, traits: { ...t, hairless: true } }, { palette, P });
    const hair = merge(hairVox(u, palette, P), H.scaled(hairFront(), u));
    body.headOpen = merge(stock.headOpen, H.scaled(facePaint(false), u), hair);
    body.headClosed = merge(stock.headClosed, H.scaled(facePaint(true), u), hair);
    return { H, body, u };
  };

  const GOWN = "#f4f1ea", GOWN_DK = "#e2ddd3";
  const SHOE = "#c8102e", SHOE_HI = "#e4455c", HEEL = "#6a0816";
  BL.characters.add({
    handle: "SVRNSociety",
    display: "Humble Warrior",
    joined: 1795200111,
    lastCommit: 1795200111,
    look: { build: "slim", skin: "#e9b99a", hair: "#7b3a1d", eyeColor: "#6f8a3c", face: "nose", height: 1.0, noBrow: true, wideEyes: true },
    voice: { poke: "You are loved.", idle: ["Stay humble, stack sats.", "SVRN under God, not man."] },
    dress: {
      torso(k, v) {
        const cloth = k.color(GOWN), seam = k.color(GOWN_DK);
        k.loin = [cloth, cloth];
        v.fill(0, 8, 0, 2, 0, 5, cloth);
        v.fill(1, 7, 3, 7, 1, 4, cloth);
        v.fill(2, 6, 7, 7, 2, 3, k.P.skin);
        v.fill(1, 7, 3, 3, 1, 4, seam);
      },
      gear(k) {
        const shoe = k.color(SHOE), sole = k.color(HEEL), u = k.u;
        const arm = makeVox();
        arm.fill(0, 2, 2, 7, 0, 2, k.skinJ);
        arm.fill(-1, 3, 0, 1, -1, 3, k.skinJ);
        k.parts.armR.geometry = k.parts.armL.geometry = k.vg(arm, { x: -1.5 * u, y: -11 * u, z: -1.5 * u });
        const foot = (side) => {
          const v = makeVox();
          v.fill(0, 3, 2, 4, 0, 3, k.skinJ);
          v.fill(0, 3, 1, 1, 0, 3, shoe);
          v.fill(0, 3, 0, 0, 0, 5, sole);
          v.set(side < 0 ? 3 : 0, 0, 6, sole);
          v.set(side < 0 ? 1 : 2, 0, 6, sole);
          return v;
        };
        k.parts.legR.geometry = k.vg(foot(-1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
        k.parts.legL.geometry = k.vg(foot(1), { x: -2 * u, y: -5 * u, z: -2.5 * u });
      },
      model(k, wear) {
        const { H, body, u } = withFace(k, wear), g = geometry();
        body.torso = merge(body.torso, H.scaled(chestMark(), u));
        H.loft(g, [[-7, 0.38, 0.42, 0.08, 0, -1.9], [-6.2, 0.32, 0.34, 0.1, 0, -1.85]], HEEL);
        const tip = [0, -6.48, 3.35], y0 = -6.78, y1 = -6.34, xw = 0.55, z0 = 2.72;
        H.poly(g, [[-xw, y1, z0], [xw, y1, z0], tip], SHOE, [0, 1, 0.25], 0.16);
        H.poly(g, [[-xw, y0, z0], tip, [xw, y0, z0]], SHOE, [0, -1, 0.15]);
        H.poly(g, [[-xw, y0, z0], [-xw, y1, z0], tip], SHOE, [-1, 0, 0.2], 0.1);
        H.poly(g, [[xw, y1, z0], [xw, y0, z0], tip], SHOE, [1, 0, 0.2], 0.1);
        H.slab(g, [[-0.26, -6.26, 1.2], [0.26, -6.26, 1.2], [0.16, -6.46, 2.15], [-0.16, -6.46, 2.15]], [0, 0.5, 0.85], 0.035, 1, SHOE_HI, SHOE_HI, 0.2);
        const mesh = H.scaled(g, u);
        body.leg = merge(body.leg, mesh);
        if (body.legL !== body.leg) body.legL = merge(body.legL, mesh);
        else body.legL = body.leg;
        return body;
      },
      club: (k) => ({ default: swordGeometry(k.h), rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 } })
    }
  });
})();
