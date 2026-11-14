(() => {
  "use strict";
  const BL = window.BL;
  const { box, lathe, tube, prism, merge, moved, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  const AXE = BL.models.STYLE === "R";
  const hurley = (h) => {
    const u = h / 16, wood = "#c19a60", edge = "#dfbd83", side = AXE ? -1 : 1, butt = AXE ? -3 : -2;
    const line = (t) => ({ x: side * Math.sin(t * Math.PI / 2) * 0.65 * u, y: (butt + t * (11 - butt)) * u, z: 0 }), thick = (t) => (0.35 + 0.12 * t) * u;
    const shaft = tube({ rings: 10, segments: 6, path: line, radius: thick, colorFn: () => wood });
    const outline = [[-0.05, 9.6], [1.4, 9.5], [4.6, 10.6], [5.2, 11.7], [4.8, 12.8], [3.3, 13.1], [1.2, 12.2], [0.2, 11.1]];
    const bas = prism((AXE ? outline.slice().reverse() : outline).map(([x, y]) => [side * x * u, y * u]), 0.6 * u, edge);
    if (!AXE) return merge(shaft, bas, lathe({ profile: [[0.4 * u, -2.1 * u], [0.42 * u, -1.8 * u], [0.42 * u, 1.4 * u], [0.38 * u, 1.6 * u]], segments: 8, color: "#504b3e" }));
    const GRIP = 4.6 / 14, grip = tube({ rings: 8, segments: 8, path: (t) => line(t * GRIP), radius: (t) => thick(t * GRIP) + (t > 0.94 ? 0.04 : 0.08) * u, colorFn: () => "#504b3e" });
    const cap = lathe({ profile: [[0.01 * u, -3.1 * u], [0.43 * u, -3.1 * u], [0.43 * u, -2.98 * u]], segments: 8, color: "#504b3e" });
    return merge(shaft, bas, grip, cap);
  };
  const height = 1.3, hurleyGeometry = cached(() => hurley(height));
  BL.characters.add({
    handle: "SatsMason", joined: 1792784900, lastCommit: 1792863005,
    look: { height, stoneAxe: AXE, bald: true, cleanShaven: true, noBrow: true, noPupils: true,
      face: "none", skin: "#777667", hair: "#4c5040", fur: "#675039", eyeColor: "#d1b576" },
    voice: { poke: "Mind the hurley.", idle: ["Fair play… for effort.", "Off you go."] },
    dress: {
      torso(k, v) {
        v.fill(1, 7, 4, 7, 1, 4, k.skinJ);
        const leather = k.color("#70533b"), seam = k.color("#493827");
        v.fill(0, 8, 0, 2, 0, 5, leather);
        v.fill(0, 8, 3, 3, 0, 5, seam);
        v.set(4, 3, 5, k.color("#a59570"));
        k.loin = [leather, seam];
        for (const [x, y] of [[2, 7], [2, 6], [3, 5], [6, 6], [6, 5]]) v.set(x, y, 4, k.P.skinDk);
      },
      club: () => ({ default: hurleyGeometry(), rest: { x: AXE ? 0.24 : 0.95, z: 0 }, carry: { x: 0.95, z: 0 } }),
      extras(k) {
        const u = k.u, leather = "#493827";
        const pockets = merge(
          box({ w: 2.2 * u, h: 1.8 * u, d: 0.5 * u, color: leather, offset: { x: -2 * u, y: 1.2 * u, z: 3.3 * u } }),
          box({ w: 2.2 * u, h: 1.8 * u, d: 0.5 * u, color: leather, offset: { x: 2 * u, y: 1.2 * u, z: 3.3 * u } }),
          box({ w: 0.4 * u, h: 1.2 * u, d: 0.35 * u, color: "#93968e", offset: { x: -2 * u, y: 2.5 * u, z: 3.2 * u } })
        );
        addChild(k.parts.torso, createNode({ geometry: pockets }));
        const profile = [];
        for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 8; profile.push([Math.sin(a) * 0.65 * u, -Math.cos(a) * 0.65 * u]); }
        const ball = lathe({ profile, segments: 12, color: "#eee4c9" });
        addChild(k.parts.torso, createNode({ geometry: moved(ball, 2 * u, 2.65 * u, 3.1 * u) }));
      }
    }
  });
})();
