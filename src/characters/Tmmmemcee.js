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
    look: { bald: true, skin: "#c98a5b", hair: "#5c4425", fur: "#c98936" },
    dress: {
      // Pig snout + tusks attached to the head as headgear. Hooked through
      // k.parts.head so they scale with character height and inherit any head
      // transforms. Each piece is a separate addChild so the geometry tree
      // stays clean and each can be tweaked independently.
      headgear(k) {
        const h = k.h;
        addChild(k.parts.head, createNode({
          scale: { x: h, y: h, z: h },
          geometry: snoutGeometry()
        }));
        addChild(k.parts.head, createNode({
          scale: { x: h, y: h, z: h },
          geometry: tuskGeometry()
        }));
      }
    }
  });
})();
