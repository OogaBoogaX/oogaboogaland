(() => {
  "use strict";
  const BL = window.BL;
  const { geometry, merge } = BL.models;
  const WHITE = "#f4f2ee", SHADE = "#dcd8d0", INK = "#141313", EYE = "#f8f6f0";
  const place = (g, rx, ry, rz, tx, ty, tz) => {
    const v = g.verts, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    for (let i = 0; i < v.length; i += 3) {
      let x = v[i], y = v[i + 1], z = v[i + 2], t;
      t = y * cx - z * sx; z = y * sx + z * cx; y = t;
      t = x * cy + z * sy; z = -x * sy + z * cy; x = t;
      t = x * cz - y * sz; y = x * sz + y * cz; x = t;
      v[i] = x + tx; v[i + 1] = y + ty; v[i + 2] = z + tz;
    }
    return g;
  };
  const plate = (H, g, pts, half, shrink, color, side) => {
    const foot = pts.map(([x, y]) => [x, y, 0]);
    H.slab(g, foot, [0, 0, 1], half, shrink, color, side);
    H.slab(g, foot, [0, 0, -1], half, shrink, color, side);
    return g;
  };
  const fore = (H, sections, colors, y, z) => place(H.loft(geometry(), sections, colors), Math.PI / 2, 0, 0, 0, y, z);
  const ear = (H, s) => {
    const m = (pts) => pts.map(([x, y]) => [x * s, y]);
    const g = plate(H, geometry(), m([[-1.3, -0.9], [1.3, -0.9], [0.3, 3.9]]), 0.42, 0.86, WHITE, SHADE);
    H.slab(g, m([[-0.66, 0.15], [0.72, 0.15], [0.27, 2.75]]).map(([x, y]) => [x, y, 0.425]), [0, 0, 1], 0.05, 0.92, INK);
    H.slab(g, m([[-0.66, 0.15], [0.72, 0.15], [0.27, 2.75]]).map(([x, y]) => [x, y, -0.425]), [0, 0, -1], 0.03, 0.92, SHADE);
    return place(g, -0.12, 0.22 * s, -0.26 * s, 1.75 * s, 5.55, -0.35);
  };
  const ruff = (H, s) => {
    const parts = [
      [[2.4, 3.4], [4.7, 2.35], [2.8, 1.95]],
      [[2.5, 2.4], [4.45, 0.75], [2.55, 0.9]],
      [[2.3, 1.25], [3.4, -0.75], [1.5, 0.25]]
    ];
    return parts.map((pts) => place(plate(H, geometry(), pts.map(([x, y]) => [x * s, y]), 0.55, 0.8, WHITE, SHADE), 0, 0, 0, 0, 0, 0.9));
  };
  const eye = (H, g, s, z, shut) => {
    const pts = [[0.8, 3.45], [1.55, 3.22], [2.35, 3.5], [2.9, 4.2], [1.75, 4.02]].map(([x, y]) => [x * s, y]);
    const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    const at = (k, dz) => pts.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, z + dz]);
    if (shut) {
      H.slab(g, at(1, 0).map(([x, y, w]) => [x, c[1] + (y - c[1]) * 0.25, w]), [0, 0, 1], 0.05, 1, INK);
      return;
    }
    H.slab(g, at(1, 0), [0, 0, 1], 0.05, 1, INK);
    H.slab(g, at(0.7, 0.05), [0, 0, 1], 0.03, 1, EYE);
    const px = c[0] + 0.08 * s, py = c[1] - 0.02;
    H.slab(g, H.rect(px - 0.3, px + 0.3, py - 0.27, py + 0.27, z + 0.08, 0.1), [0, 0, 1], 0.03, 1, INK);
    H.slab(g, H.rect(px - 0.2, px - 0.06, py + 0.04, py + 0.18, z + 0.11), [0, 0, 1], 0.02, 1, "#ffffff");
  };
  const foxHead = (H, shut) => {
    const g = H.loft(geometry(), [[0, 2.1, 2.1, 0.7], [1.0, 2.9, 2.8, 0.9], [4.6, 3.0, 2.8, 0.9], [6.0, 2.55, 2.45, 0.9], [6.75, 1.75, 1.75, 0.7]], WHITE);
    for (const s of [-1, 1]) eye(H, g, s, 2.805, shut);
    const snout = fore(H, [[0, 1.55, 0.92, 0.45], [1.5, 1.32, 0.82, 0.45, 0, 0.05], [2.6, 0.82, 0.58, 0.35, 0, 0.14], [3.2, 0.52, 0.44, 0.24, 0, 0.18], [3.7, 0.28, 0.24, 0.12, 0, 0.2]], [WHITE, WHITE, WHITE, INK], 2.37, 2.0);
    const chin = fore(H, [[0, 1.2, 0.38, 0.25], [1.5, 0.88, 0.34, 0.22, 0, 0.02], [2.35, 0.42, 0.22, 0.12, 0, 0.05]], WHITE, 1.0, 2.0);
    const mouth = fore(H, [[0, 1.48, 0.075, 0.03, 0, 0], [1.5, 1.08, 0.07, 0.03, 0, 0.02], [2.45, 0.5, 0.06, 0.02, 0, 0.06]], INK, 1.42, 2.0);
    const smirk = geometry();
    H.slab(smirk, [[1.0, 1.4, 3.86], [1.42, 1.62, 3.62], [1.38, 1.76, 3.62], [0.98, 1.54, 3.86]], [0.4, 0, 0.9], 0.04, 1, INK);
    return merge(g, snout, chin, mouth, smirk, ear(H, -1), ear(H, 1), ...ruff(H, -1), ...ruff(H, 1));
  };
  const brush = (H, len, r, lift) => H.loft(geometry(), [[0, 0.3, 0.3, 0.12], [0.15, 0.68, 0.64, 0.27], [0.35, 0.95, 0.88, 0.38, 0, 0.06], [0.58, 1, 0.92, 0.4, 0, 0.24], [0.78, 0.8, 0.74, 0.32, 0, 0.5], [0.92, 0.42, 0.4, 0.18, 0, 0.78], [1, 0.05, 0.05, 0.02, 0, 0.95]].map(([y, hx, hz, b, cx, cz = 0]) => [y * len, hx * r, hz * r, b * r, 0, cz * lift]), [WHITE, WHITE, WHITE, WHITE, WHITE, SHADE]);
  const tail = (H) => place(brush(H, 9, 2.1, 1.9), -(Math.PI / 2 + 0.72), 0, 0, 0, 1.0, -1.5);
  const pupEar = (H, s) => {
    const m = (pts) => pts.map(([x, y]) => [x * s, y]);
    const g = plate(H, geometry(), m([[-0.6, -0.5], [0.6, -0.5], [0.15, 1.9]]), 0.2, 0.86, WHITE, SHADE);
    H.slab(g, m([[-0.3, 0.05], [0.34, 0.05], [0.14, 1.35]]).map(([x, y]) => [x, y, 0.205]), [0, 0, 1], 0.03, 0.92, INK);
    return place(g, -0.1, 0.2 * s, -0.24 * s, 0.75 * s, 7.15, 3.15);
  };
  const pupBody = (H) => {
    const g = fore(H, [[0, 1.15, 1.1, 0.45], [1.0, 1.6, 1.5, 0.55], [4.6, 1.5, 1.45, 0.55, 0, -0.1], [6.0, 1.15, 1.1, 0.45, 0, -0.2]], WHITE, 4.2, -3.0);
    H.loft(g, [[3.6, 1.0, 0.95, 0.4, 0, 2.2], [5.4, 0.92, 0.9, 0.36, 0, 2.9], [6.0, 0.85, 0.85, 0.34, 0, 3.1]], WHITE);
    H.loft(g, [[5.0, 0.95, 0.95, 0.4, 0, 3.3], [5.5, 1.35, 1.25, 0.5, 0, 3.3], [6.9, 1.3, 1.2, 0.5, 0, 3.3], [7.5, 0.85, 0.85, 0.34, 0, 3.25]], WHITE);
    const snout = fore(H, [[0, 0.8, 0.5, 0.24], [1.3, 0.55, 0.38, 0.2, 0, 0.06], [1.85, 0.32, 0.26, 0.12, 0, 0.1], [2.2, 0.16, 0.15, 0.06, 0, 0.12]], [WHITE, WHITE, INK], 5.75, 4.1);
    const jaw = fore(H, [[0, 0.6, 0.2, 0.1], [1.2, 0.36, 0.16, 0.08, 0, 0.03]], WHITE, 5.12, 4.1);
    const line = fore(H, [[0, 0.72, 0.04, 0.02], [1.3, 0.42, 0.04, 0.02, 0, 0.04]], INK, 5.3, 4.1);
    for (const s of [-1, 1]) {
      const z = 4.56, eye = [[0.3, 6.28], [0.7, 6.2], [1.08, 6.58], [0.62, 6.5]].map(([x, y]) => [x * s, y, z]);
      H.slab(g, eye, [0, 0, 1], 0.05, 1, INK);
      H.slab(g, H.rect(0.66 * s - 0.07, 0.66 * s + 0.07, 6.38, 6.5, z + 0.05), [0, 0, 1], 0.02, 1, EYE);
    }
    const ruffs = [];
    for (const s of [-1, 1]) for (const pts of [[[1.1, 6.3], [2.05, 5.6], [1.2, 5.45]], [[1.05, 5.75], [1.75, 4.85], [0.85, 5.1]]]) ruffs.push(place(plate(H, geometry(), pts.map(([x, y]) => [x * s, y]), 0.35, 0.8, WHITE, SHADE), 0, 0, 0, 0, 0, 3.3));
    return merge(g, snout, jaw, line, pupEar(H, -1), pupEar(H, 1), ...ruffs);
  };
  const pupLeg = (H) => H.loft(geometry(), [[-3.6, 0.48, 0.6, 0.16, 0, 0.12], [-3.3, 0.45, 0.55, 0.16, 0, 0.1], [-0.4, 0.5, 0.52, 0.2], [0.5, 0.62, 0.66, 0.24]], [SHADE, WHITE, WHITE]);
  const pup = (k) => {
    const H = BL.heroBody, { createNode, addChild } = BL.scene, u = k.u, h = k.h;
    const node = createNode({ position: { x: 0.7 * h, y: -k.legH, z: -0.2 * h }, geometry: H.scaled(pupBody(H), u) });
    const leg = H.scaled(pupLeg(H), u);
    node.legs = [[-0.72, 2.0], [0.72, 2.0], [-0.72, -2.2], [0.72, -2.2]].map(([x, z]) => {
      const n = createNode({ position: { x: x * u, y: 3.6 * u, z: z * u }, geometry: leg });
      addChild(node, n);
      return n;
    });
    node.tail = createNode({ position: { x: 0, y: 4.5 * u, z: -2.8 * u }, geometry: H.scaled(place(brush(H, 5.6, 1.25, 1.1), -(Math.PI / 2 + 0.45), 0, 0, 0, 0, 0), u) });
    addChild(node, node.tail);
    node.packAt = { y: 5.6 * u, z: -0.8 * u, scale: 0.4 };
    return node;
  };
  BL.characters.add({
    handle: "getfoxy",
    joined: 1795482881,
    lastCommit: 1795482881,
    look: { build: "normal", height: 1.0, skin: WHITE, fur: WHITE, hair: WHITE, eyeColor: "#1a1614", face: "smirk", cleanShaven: true, bald: true, hairless: true, noBrow: true },
    voice: {
      poke: "Ooga! Foxy! Paws off the tail.",
      idle: [
        "Cash you can hold, even on a card. No bank peeking.",
        "Tap, beep, paid. Nobody else needs to know.",
        "Ecash is like a den: quiet, cozy and private.",
        "I send my chatter through Tor. Foxes leave no tracks.",
        "This card holds real cash, not a promise of cash.",
        "Tap my card to yours and the sats hop right over.",
        "A sly fox never shows the whole ledger.",
        "No signal out here? My card still pays."
      ]
    },
    dress: {
      model(k, wear) {
        const H = BL.heroBody, u = k.u, body = wear();
        return { ...body, torso: merge(body.torso, H.scaled(tail(H), u)), headOpen: H.scaled(foxHead(H, false), u), headClosed: H.scaled(foxHead(H, true), u) };
      },
      extras(k) {
        k.parts.dog = pup(k);
        BL.scene.addChild(k.root, k.parts.dog);
      }
    }
  });
})();
