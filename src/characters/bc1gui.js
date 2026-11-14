(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, merge, turnedZ } = BL.models;
  const { createNode, addChild } = BL.scene;
  const skateboardGeometry = (h) => merge(
    box({ w: 0.22 * h, h: 0.8 * h, d: 0.03 * h, color: "#7cc242" }),
    box({ w: 0.2 * h, h: 0.08 * h, d: 0.03 * h, color: "#f7931a", offset: { z: -0.006 * h } }),
    ...[-0.28, 0.28].map((y) => box({ w: 0.2 * h, h: 0.03 * h, d: 0.045 * h, color: "#8a8a8a", offset: { y: y * h, z: -0.03 * h } })),
    ...[-0.28, 0.28].flatMap((y) => [-0.085, 0.085].map((x) => box({ w: 0.06 * h, h: 0.06 * h, d: 0.05 * h, color: "#1a1a1a", offset: { x: x * h, y: y * h, z: -0.07 * h } })))
  );
  const DECK = { y: [-0.4, -0.386, -0.355, -0.3, -0.21, -0.05, 0.05, 0.21, 0.3, 0.355, 0.386, 0.4], wide: [0.03, 0.068, 0.098, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.098, 0.068, 0.03],
    kick: [0.05, 0.044, 0.03, 0.01, 0, 0, 0, 0, 0.01, 0.03, 0.044, 0.05] };
  const TRUCK = 0.27, AXLE = -0.045, WHEEL = 0.022, TRACK = 0.095;
  const deckGeometry = (h) => {
    const H = BL.heroBody, geo = BL.models.geometry(), ply = (thick, lift, trim) => DECK.y.map((y, i) => [y, DECK.wide[i] - trim, thick, 0.0006, 0, DECK.kick[i] + lift]);
    H.loft(geo, ply(0.006, 0, 0), "#c9a66b");
    H.loft(geo, ply(0.0012, 0.0072, 0.003), "#1b1b1d");
    H.loft(geo, ply(0.0012, -0.0072, 0.003), DECK.y.slice(1).map((_, i) => i === 5 ? "#f7931a" : i === 4 || i === 6 ? "#6faa2f" : "#7cc242"));
    return merge(H.scaled(geo, h), ...[-TRUCK, TRUCK].flatMap((y) => [
      box({ w: 0.07 * h, h: 0.075 * h, d: 0.006 * h, color: "#8d939a", offset: { y: y * h, z: -0.01 * h } }),
      box({ w: 0.032 * h, h: 0.032 * h, d: 0.02 * h, color: "#6d727a", offset: { y: (y - Math.sign(y) * 0.02) * h, z: -0.022 * h } }),
      box({ w: 0.12 * h, h: 0.026 * h, d: 0.02 * h, color: "#9aa0a8", offset: { y: y * h, z: -0.032 * h } }),
      box({ w: 0.2 * h, h: 0.008 * h, d: 0.008 * h, color: "#c3c8ce", offset: { y: y * h, z: AXLE * h } })
    ]));
  };
  const wheelGeometry = (h) => turnedZ(merge(
    lathe({ profile: [[0, -0.015 * h], [0.013 * h, -0.015 * h], [WHEEL * h, -0.011 * h], [WHEEL * h, 0.011 * h], [0.013 * h, 0.015 * h], [0, 0.015 * h]], segments: 10, color: "#f1ead6" }),
    lathe({ profile: [[0, -0.0165 * h], [0.008 * h, -0.0165 * h], [0.008 * h, 0.0165 * h], [0, 0.0165 * h]], segments: 6, color: "#f7931a" })
  ), Math.PI / 2);
  BL.characters.add({
    handle: "bc1gui",
    display: "ottoz0r",
    github: "ottoz0r",
    joined: 1788800918,
    lastCommit: 1788190400,
    look: { portrait: { min: [-3, -2, -1], max: [7, 13, 8] }, skater: true, hairless: true, noBrow: true, face: "smirk", skin: "#f2a33c", hair: "#e4561f", fur: "#8f4f17" },
    dress: {
      crown(k, v) {
        const P = k.P, knit = k.color("#8cc63f"), knitDk = k.color("#6faa2f"), pom = k.color("#a9d94c"), btc = k.color("#f7931a"), lens = k.color("#3f9c96");
        const rib = (x, y, z) => (x + z) % 2 ? knitDk : knit;
        v.fill(-1, 7, 4, 8, -1, 6, rib);
        v.fill(-1, 5, 9, 9, 0, 5, rib);
        v.fill(-2, 3, 10, 10, 1, 4, rib);
        v.fill(-3, 0, 11, 12, 1, 3, k.jit(pom, knit, 0.2));
        v.fill(-2, -1, 13, 13, 2, 2, pom);
        for (const [bx, by] of [[3, 8], [4, 8], [3, 7], [5, 7], [3, 6], [4, 6], [3, 5], [5, 5], [3, 4], [4, 4]]) v.set(bx, by, 6, btc);
        if (BL.models.STYLE !== "R") {
          for (const z of [-1, 1, 3]) {
            v.fill(-1, -1, -2, 3, z, z, k.hairJ);
            v.fill(7, 7, -2, 3, z, z, k.hairJ);
          }
          for (const x of [0, 2, 4, 6]) v.fill(x, x, -3, 3, -1, -1, k.hairJ);
        }
        v.fill(0, 6, 3, 3, 6, 6, P.black);
        v.fill(0, 1, 2, 3, 6, 6, lens);
        v.fill(5, 6, 2, 3, 6, 6, lens);
        v.fill(-1, -1, 3, 3, 4, 6, P.black);
        v.fill(7, 7, 3, 3, 4, 6, P.black);
      },
      extras(k) {
        const h = k.h;
        if (BL.models.STYLE !== "R") {
          k.parts.board = createNode({ position: { x: 0, y: 0.28 * h, z: -0.35 * h }, rotation: { x: 0, y: 0, z: 0.4 }, geometry: skateboardGeometry(h) });
          addChild(k.root, k.parts.board);
          return;
        }
        const rest = { x: 0, y: 0.28 * h, z: -0.215 * h, turn: 0.4 }, wheel = wheelGeometry(h);
        k.parts.board = createNode({ position: { x: rest.x, y: rest.y, z: rest.z }, rotation: { x: 0, y: 0, z: rest.turn }, geometry: deckGeometry(h) });
        k.parts.board.ride = { rest, under: (WHEEL - AXLE) * h, deck: (WHEEL - AXLE + 0.0085) * h, wheel: WHEEL * h };
        k.parts.boardWheels = [-TRUCK, TRUCK].flatMap((y) => [-TRACK, TRACK].map((x) => createNode({ position: { x: x * h, y: y * h, z: AXLE * h }, geometry: wheel })));
        for (const node of k.parts.boardWheels) addChild(k.parts.board, node);
        addChild(k.root, k.parts.board);
        const H = BL.heroBody, geo = BL.models.geometry(), hair = "#e4561f", dark = "#c94a18";
        [-3, -1, 1, 3].forEach((x, i) => H.loft(geo, [[4.2, 0.5, 0.17, 0.05, x, -3.17], [0, 0.5, 0.17, 0.05, x, -3.17], [i % 2 ? -2.3 : -3, 0.44, 0.15, 0.05, x, -2.55]], i % 2 ? dark : hair));
        for (const side of [-1, 1]) [-2.4, -0.5, 1.4].forEach((z, i) => H.loft(geo, [[4.2, 0.17, 0.5, 0.05, side * 3.67, z], [0.4, 0.17, 0.5, 0.05, side * 3.67, z], [i === 1 ? -2 : -1.4, 0.15, 0.44, 0.05, side * 3.2, z]], i % 2 ? hair : dark));
        addChild(k.parts.head, createNode({ geometry: H.scaled(geo, k.u) }));
      }
    }
  });
})();
