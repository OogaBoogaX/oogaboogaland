(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, tube, prism, merge, moved } = BL.models;
  const { createNode, addChild } = BL.scene;
  const hurley = (h, gold) => {
    const u = h / 16, wood = gold ? "#c29a42" : "#c19a60", edge = gold ? "#e0bd69" : "#dfbd83";
    const shaft = tube({ rings: 10, segments: 6,
      path: (t) => ({ x: Math.sin(t * Math.PI / 2) * 0.65 * u, y: (-2 + t * 13) * u, z: 0 }),
      radius: (t) => (0.35 + 0.12 * t) * u, colorFn: () => wood });
    const bas = prism([[-0.05, 9.6], [1.4, 9.5], [4.6, 10.6], [5.2, 11.7], [4.8, 12.8], [3.3, 13.1], [1.2, 12.2], [0.2, 11.1]].map(([x, y]) => [x * u, y * u]), 0.6 * u, edge);
    const grip = lathe({ profile: [[0.4 * u, -2.1 * u], [0.42 * u, -1.8 * u], [0.42 * u, 1.4 * u], [0.38 * u, 1.6 * u]], segments: 8, color: "#504b3e" });
    return merge(shaft, bas, grip);
  };
  BL.characters.add({
    handle: "SatsMason", joined: 1791072000, lastCommit: 1791072000,
    look: { height: 1.3, bald: true, cleanShaven: true, noBrow: true, noPupils: true,
      face: "none", skin: "#777667", hair: "#4c5040", fur: "#675039", eyeColor: "#d1b576" },
    voice: { poke: "Mind the hurley.", idle: ["Fair play… for effort.", "Off you go."] },
    dress: {
      torso(k, v) {
        // Stone chest above a waist apron; no glowing emblem or shoulder strap.
        v.fill(1, 7, 4, 7, 1, 4, k.skinJ);
        const leather = k.color("#70533b"), seam = k.color("#493827");
        v.fill(0, 8, 0, 2, 0, 5, leather);
        v.fill(0, 8, 3, 3, 0, 5, seam);
        v.set(4, 3, 5, k.color("#a59570"));
        k.loin = [leather, seam];
        // A few dark joints make the exposed chest read as worked stone.
        for (const [x, y] of [[2, 7], [2, 6], [3, 5], [6, 6], [6, 5]]) v.set(x, y, 4, k.P.skinDk);
      },
      club: (k) => ({ default: hurley(k.h, false), gold: hurley(k.h, true),
        rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 } }),
      extras(k) {
        const u = k.u, leather = "#493827";
        // Fixed pocket details only: selectable equipment belongs to a later engine PR.
        const pockets = merge(
          box({ w: 2.2 * u, h: 1.8 * u, d: 0.5 * u, color: leather, offset: { x: -2 * u, y: 1.2 * u, z: 3.3 * u } }),
          box({ w: 2.2 * u, h: 1.8 * u, d: 0.5 * u, color: leather, offset: { x: 2 * u, y: 1.2 * u, z: 3.3 * u } }),
          box({ w: 0.4 * u, h: 1.2 * u, d: 0.35 * u, color: "#93968e", offset: { x: -2 * u, y: 2.5 * u, z: 3.2 * u } })
        );
        addChild(k.parts.torso, createNode({ geometry: pockets }));
        const profile = [];
        for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 8; profile.push([Math.sin(a) * 0.65 * u, -Math.cos(a) * 0.65 * u]); }
        const ball = lathe({ profile, segments: 12, color: "#eee4c9" });
        // The sliotar sits at the belt, leaving both existing weapon/food poses intact.
        addChild(k.parts.torso, createNode({ geometry: moved(ball, 2 * u, 2.65 * u, 3.1 * u) }));
      }
    }
  });
})();
