(() => {
  "use strict";
  const BL = window.BL;
  const { createNode, addChild } = BL.scene;
  const { lathe, merge, forward, ring, cached } = BL.models;

  const snoutGeometry = cached(() => {
    const pink = "#e8a8a8";
    const darkPink = "#6a3535";
    const snoutShape = lathe({
      profile: [
        [0, -0.05],
        [0.075, -0.045],
        [0.10, -0.025],
        [0.105, 0],
        [0.10, 0.025],
        [0.075, 0.045],
        [0, 0.05]
      ],
      segments: 16,
      color: pink
    });
    const nostril = (sx) => forward(
      ring({
        r: 0.014,
        thickness: 0.005,
        segments: 10,
        color: darkPink
      }),
      { x: sx, y: -0.008, z: 0.10 }
    );
    return merge(snoutShape, nostril(-0.038), nostril(0.038));
  });

  const earGeometry = cached(() => {
    const pink = "#f0a8a8";
    const ear = (sx) => forward(
      lathe({
        profile: [
          [0, 0],
          [0.07, 0.04],
          [0.08, 0.10],
          [0.075, 0.16],
          [0.05, 0.22],
          [0, 0.28]
        ],
        segments: 10,
        color: pink
      }),
      { x: sx, y: 0.55, z: 0.10 }
    );
    return merge(ear(-0.20), ear(0.20));
  });

  const pigEarGeometry = (u) => {
    const H = BL.heroBody, geo = BL.models.geometry(), pink = "#eaa2a2", inner = "#d98484", hollow = "#c46e70";
    for (const s of [-1, 1]) {
      const at = (x, y, z) => [s * x, y, z];
      const b0 = at(2.1, 5.75, 1.7), b1 = at(3.6, 5.45, 0.3), b2 = at(3.3, 5.75, -1.7), b3 = at(1.9, 5.9, -1.15);
      const m0 = at(3.3, 8.1, 1.9), m1 = at(5.1, 7.5, 0.45), m2 = at(4.5, 8.1, -1.15);
      const tip = at(5.7, 7.1, 2.9);
      const sides = [[b0, b1, m1, m0], [b1, b2, m2, m1], [b2, b3, m2], [b3, b0, m0, m2]];
      for (const q of sides) H.both(geo, s > 0 ? q : q.slice().reverse(), pink, inner);
      const flap = [m0, m1, tip], back = [m1, m2, tip], top = [m2, m0, tip];
      for (const q of [flap, back, top]) H.both(geo, s > 0 ? q : q.slice().reverse(), pink, inner);
      const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t + 0.03];
      const h0 = mid(b0, m0, 0.18), h1 = mid(b1, m1, 0.18), h2 = mid(b1, m1, 0.85), h3 = mid(b0, m0, 0.85);
      const q = [mid(h0, h1, 0.15), mid(h0, h1, 0.85), mid(h3, h2, 0.85), mid(h3, h2, 0.15)];
      H.both(geo, s > 0 ? q : q.slice().reverse(), hollow, hollow);
    }
    return H.scaled(geo, u);
  };
  const tuskGeometry = cached(() => {
    const ivory = "#f5e6c8";
    const tusk = (sx) => forward(
      lathe({
        profile: [
          [0.028, 0],
          [0.026, -0.02],
          [0.020, -0.045],
          [0.012, -0.07],
          [0.005, -0.09],
          [0, -0.1]
        ],
        segments: 10,
        color: ivory
      }),
      { x: sx, y: 0.04, z: 0.33 }
    );
    return merge(tusk(-0.045), tusk(0.045));
  });

  BL.characters.add({
    handle: "Tmmmemcee",
    joined: 1788800922,
    lastCommit: 1788225311,
    look: { bald: true, snout: true, noTeeth: true, skin: "#c98a5b", hair: "#5c4425", fur: "#c98936" },
    dress: {
      headgear(k) {
        const h = k.h;
        if (BL.models.STYLE === "R") {
          addChild(k.parts.head, createNode({ geometry: pigEarGeometry(k.u) }));
          return;
        }
        addChild(k.parts.head, createNode({
          scale: { x: h, y: h, z: h },
          geometry: snoutGeometry()
        }));
        addChild(k.parts.head, createNode({
          scale: { x: h, y: h, z: h },
          geometry: tuskGeometry()
        }));
        if (BL.models.STYLE === "R") addChild(k.parts.head, createNode({ geometry: pigEarGeometry(k.u) }));
        else addChild(k.parts.head, createNode({
          scale: { x: h, y: h, z: h },
          geometry: earGeometry()
        }));
      }
    }
  });
})();
