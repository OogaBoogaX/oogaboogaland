(() => {
  "use strict";
  const BL = window.BL;
  const { createNode, addChild } = BL.scene;
  const { lathe, merge, forward, ring, cached } = BL.models;

  // Pig snout — wider-than-tall oval disc using lathe revolution.
  // Sticks out further than the default caveman snout so the pig half reads
  // visually. Two nostril rings on the front face.
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


  // Pig ears - leaf-shaped, sticking up from the temple area of the head.
  // The most recognizable pig feature from the South Park ManBearPig reference.
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

  // The modelled look's ears, in units of the head: a pig's, broad where they join the head at its top
  // corners, standing up and out, and folded over a little past halfway so the pointed tip flops ahead and down.
  // Each is pink behind and a deeper pink inside, with the hollow of the ear a darker panel set into its front.
  const pigEarGeometry = (u) => {
    const H = BL.heroBody, geo = BL.models.geometry(), pink = "#eaa2a2", inner = "#d98484", hollow = "#c46e70";
    for (const s of [-1, 1]) {
      const at = (x, y, z) => [s * x, y, z];
      const b0 = at(2.1, 5.75, 1.7), b1 = at(3.6, 5.45, 0.3), b2 = at(3.3, 5.75, -1.7), b3 = at(1.9, 5.9, -1.15);
      const m0 = at(3.3, 8.1, 1.9), m1 = at(5.1, 7.5, 0.45), m2 = at(4.5, 8.1, -1.15);
      const tip = at(5.7, 7.1, 2.9);
      // The root is a short cup of four sides, so the ear has body where it leaves the head.
      const sides = [[b0, b1, m1, m0], [b1, b2, m2, m1], [b2, b3, m2], [b3, b0, m0, m2]];
      for (const q of sides) H.both(geo, s > 0 ? q : q.slice().reverse(), pink, inner);
      // The flap folds ahead from the fold line and comes to a point.
      const flap = [m0, m1, tip], back = [m1, m2, tip], top = [m2, m0, tip];
      for (const q of [flap, back, top]) H.both(geo, s > 0 ? q : q.slice().reverse(), pink, inner);
      // The hollow, on the cup's front side.
      const mid = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t + 0.03];
      const h0 = mid(b0, m0, 0.18), h1 = mid(b1, m1, 0.18), h2 = mid(b1, m1, 0.85), h3 = mid(b0, m0, 0.85);
      const q = [mid(h0, h1, 0.15), mid(h0, h1, 0.85), mid(h3, h2, 0.85), mid(h3, h2, 0.15)];
      H.both(geo, s > 0 ? q : q.slice().reverse(), hollow, hollow);
    }
    return H.scaled(geo, u);
  };
  // Pig tusks — small ivory tusks hanging from the upper jaw, one on each side
  // of the snout. Same dress-hook pattern as MrHodlX's gas mask and timechainb's
  // lion cub.
  const tuskGeometry = cached(() => {
    const ivory = "#f5e6c8";
    const tusk = (sx) => forward(
      lathe({
        // Tapered cone profile: radius shrinks as y goes negative, so the tusk
        // points downward from the jaw attachment point.
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
    // snout and noTeeth are the modelled look's: a pig's snout for his nose, and a beard left whole.
    look: { bald: true, snout: true, noTeeth: true, skin: "#c98a5b", hair: "#5c4425", fur: "#c98936" },
    dress: {
      // Pig snout + tusks attached to the head as headgear. Hooked through
      // k.parts.head so they scale with character height and inherit any head
      // transforms. Each piece is a separate addChild so the geometry tree
      // stays clean and each can be tweaked independently.
      headgear(k) {
        const h = k.h;
        // The modelled look's head carries the snout itself and wears no tusks: only the ears are hung on it.
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
