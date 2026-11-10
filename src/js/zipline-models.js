// The ziplines' geometry (zipline.js rides them), in two dresses that share one top, the launch step and post Billy chose
// in DSB Land (whitewashed stone, olive wood and blue paint like the Chora's own dressing): the island's (`jungle`) ends
// in a log stake from the hub's jungle kit, DSB Land's (`chora`) in a whitewashed bollard. Each dress has a
// `top`, where the cable leaves at `topEye` (local metres, +z along the line, the foot at the origin), the island's on a
// small log `deck` in a treetop, the `footing` round it where Space takes the bar (|x| and a z span), a `bottom`
// where it ends at `bottomEye`, and a `trolley` whose origin rides the cable with its hand bar `TROLLEY` under it.
// `cable(line, dress)` is the rope itself, slung exactly as zipline.js reads it. Every top and bottom carries a
// `collisionGeometry` of its posts and deck alone, so the roof, ladder, leaves and eye never block a walker.
// Geometry is cached: the parts once a page, a cable by its two ends and sag.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const M = BL.models, { box, bevelBox, merge, shaded, noShadow, moved, turnedY } = M;
  const { mulberry32, fnv1a } = BL.math;
  const cache = M.scopedMap();
  const TROLLEY = 0.44;
  const once = (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };
  const J = () => BL.hubModels;
  // The island's bottom: a stake of rough log driven into the rock over the Headquarters doorway, the cable lashed
  // round its outer end, a liana trailing from it down the face and leaves sprouting round it. +z points into the rock.
  const stakeBottom = () => once("jungle-bottom", () => {
    const { log, lashing, withJungle, liana, sprig } = J(), rand = mulberry32(fnv1a("zipline-stake"));
    const geo = withJungle(shaded([log(0, -0.04, 0.55, 0, 0.04, -0.3, 0.085), lashing(0, 0.03, -0.22, 0, 0.1, -1, 0.09)]), (g) => {
      liana(g, [[0.02, 0.0, -0.18], [0.12, -0.5, 0.05], [0.05, -1.1, 0.2], [0.14, -1.6, 0.32]], 0.02, 0.014);
      for (const [x, y, dx, dy] of [[0.12, 0.08, 1, 0.5], [-0.12, 0.06, -1, 0.6], [0, 0.14, 0.1, 1], [0.08, -0.12, 0.8, -0.4]]) sprig(g, x, y, 0.05, dx, dy, -0.6, 4, 0.34, rand);
    });
    return geo;
  });
  // The top, by DSB Land's summit entry and on a Mempool rainforest treetop: no tower, since the height gives the drop. A low whitewashed stone launch
  // step, and behind it one stout olive-wood post on a stone footing with a blue-painted arm reaching out over the
  // step, the iron eye that holds the cable at its tip.
  const CHORA_EYE = { y: 2.95, z: 0.7 };
  const choraTop = () => once("chora-top", () => {
    const white = "#fbf8f1", blue = "#326c99", olive = "#7a6248", iron = "#425360";
    const geo = merge(
      bevelBox({ w: 1.3, h: 0.22, d: 1.1, color: white, offset: { y: 0.11, z: 0.75 } }),
      box({ w: 0.62, h: 0.4, d: 0.62, color: white, offset: { y: 0.2, z: -0.1 } }),
      bevelBox({ w: 0.28, h: 2.9, d: 0.28, color: olive, offset: { y: 1.85, z: -0.1 } }),
      box({ w: 0.16, h: 0.16, d: 1.0, color: blue, offset: { y: 3.12, z: 0.32 } }),
      box({ w: 0.08, h: 0.08, d: 0.8, color: blue, offset: { y: 2.75, z: 0.12 } }),
      box({ w: 0.05, h: 0.14, d: 0.05, color: iron, offset: { y: 3.0, z: CHORA_EYE.z } }),
      box({ w: 0.12, h: 0.04, d: 0.12, color: iron, offset: { y: CHORA_EYE.y, z: CHORA_EYE.z } }));
    geo.collisionGeometry = merge(
      box({ w: 1.3, h: 0.22, d: 1.1, color: "#000000", offset: { y: 0.11, z: 0.75 } }),
      box({ w: 0.62, h: 3.3, d: 0.62, color: "#000000", offset: { y: 1.65, z: -0.1 } }));
    return geo;
  });
  // Under the island's top, where it stands in a rainforest crown: a small deck of split logs lashed across two bearers,
  // its top at the origin, with lianas trailing from its edges and leaves tucked round it. Only its slab collides.
  const canopyDeck = () => once("jungle-deck", () => {
    const { log, lashing, withJungle, liana, sprig } = J(), rand = mulberry32(fnv1a("zipline-deck")), round = [];
    for (const x of [-0.7, 0.7]) round.push(log(x, -0.24, -0.75, x, -0.24, 1.55, 0.07));
    for (let z = -0.7; z <= 1.5; z += 0.14) round.push(log(-0.98, -0.08, z, 0.98, -0.08, z, 0.072, "#7a5634"));
    for (const x of [-0.7, 0.7]) for (const z of [-0.6, 1.4]) round.push(lashing(x, -0.16, z, 0, 1, 0, 0.08));
    const geo = withJungle(shaded(round), (g) => {
      for (const [x, z] of [[-0.95, -0.5], [0.95, 0.4], [-0.9, 1.3], [0.6, -0.72]]) {
        liana(g, [[x, -0.12, z], [x * 1.04, -0.9, z + 0.05], [x * 0.98, -1.7, z + 0.1]], 0.02, 0.014);
        sprig(g, x, -0.1, z, x, 0.3, z - 0.4, 5, 0.36, rand);
      }
    });
    geo.collisionGeometry = box({ w: 2, h: 0.32, d: 2.4, color: "#000000", offset: { y: -0.16, z: 0.4 } });
    return geo;
  });
  // DSB Land's bottom: a low whitewashed stone bollard with a blue cap, the cable ending in its iron eye.
  const CHORA_END = 2.45;
  const choraBottom = () => once("chora-bottom", () => {
    const geo = merge(
      box({ w: 0.62, h: 0.14, d: 0.62, color: "#fbf8f1", offset: { y: 0.07 } }),
      bevelBox({ w: 0.44, h: 2.5, d: 0.44, color: "#fbf8f1", offset: { y: 1.25 } }),
      box({ w: 0.52, h: 0.14, d: 0.52, color: "#326c99", offset: { y: 2.57 } }),
      box({ w: 0.06, h: 0.06, d: 0.2, color: "#425360", offset: { y: CHORA_END, z: -0.3 } }));
    geo.collisionGeometry = box({ w: 0.62, h: 2.64, d: 0.62, color: "#000000", offset: { y: 1.32 } });
    return geo;
  });
  // Block Frenzy's line off the Arcade's cliff ledge: the same top and eye as the others', in the hall's own bark logs and
  // lashings, and a log post on the loading island where it ends. Nothing collides but what the scene blocks itself.
  const ARCADE_END = 2.7;
  const arcadeTop = () => once("arcade-top", () => {
    const { log, lashing } = J();
    return shaded([log(0, 0, -0.1, 0, 3.2, -0.1, 0.13, "#5a3c22"), log(0, 3.12, -0.28, 0, 3.08, CHORA_EYE.z + 0.06, 0.08, "#5c3f25"),
      lashing(0, 3.12, -0.1, 0, 0, 1, 0.1), lashing(0, 3, CHORA_EYE.z, 0, 1, 0, 0.06)],
    [box({ w: 0.6, h: 0.16, d: 0.6, color: "#6a6158", offset: { y: 0.08, z: -0.1 } })]);
  });
  const arcadeBottom = () => once("arcade-bottom", () => {
    const { log, lashing } = J();
    return shaded([log(0, 0, 0, 0, ARCADE_END + 0.3, 0, 0.14, "#5a3c22"), lashing(0, ARCADE_END, 0, 0, 1, 0, 0.14)], [box({ w: 0.7, h: 0.14, d: 0.7, color: "#6a6158", offset: { y: 0.07 } })]);
  });
  // A trolley, +z along the cable: the wheel on the cable, a rod down to the hand bar across the line.
  const trolley = (dress) => once(`${dress}-trolley`, () => {
    const jungle = dress !== "chora", parts = [
      box({ w: 0.05, h: 0.16, d: 0.16, color: jungle ? "#6b4a2b" : "#425360", offset: { y: 0.02 } }),
      box({ w: 0.11, h: 0.04, d: 0.2, color: "#4a4d52", offset: { y: -0.08 } }),
      box({ w: 0.03, h: TROLLEY - 0.1, d: 0.03, color: "#4a4d52", offset: { y: -0.05 - (TROLLEY - 0.1) / 2 } })];
    if (!jungle) parts.push(box({ w: 0.7, h: 0.035, d: 0.035, color: "#6f737a", offset: { y: -TROLLEY } }),
      ...[-0.29, 0.29].map((x) => box({ w: 0.12, h: 0.05, d: 0.05, color: "#326c99", offset: { x, y: -TROLLEY } })));
    if (!jungle) return noShadow(merge(...parts));
    const { bamboo, lashing } = J();
    return noShadow(shaded([bamboo(-0.35, -TROLLEY, 0, 0.35, -TROLLEY, 0, 0.022), lashing(-0.27, -TROLLEY, 0, 1, 0, 0, 0.022), lashing(0.27, -TROLLEY, 0, 1, 0, 0, 0.022)], parts));
  });
  // The rope from the top's eye to the bottom's, sagging exactly as zipline.js's `cableAt`: vine-twisted rope on the
  // island, grey steel in DSB Land.
  const CABLE_STEPS = 48;
  const cable = (line, dress) => once(`${dress}-cable:${line.ax},${line.ay},${line.az},${line.bx},${line.by},${line.bz},${line.sag}`, () => {
    const points = [], at = { x: 0, y: 0, z: 0 };
    for (let k = 0; k <= CABLE_STEPS; k++) {
      BL.zipline.cableAt(line, k / CABLE_STEPS, at);
      points.push([at.x, at.y, at.z]);
    }
    return J().withJungle(null, (g) => J().liana(g, points, dress !== "chora" ? 0.03 : 0.022, dress !== "chora" ? 0.03 : 0.022, dress !== "chora" ? "#5b4a30" : "#6b7177", false));
  });
  const DRESSES = {
    arcade: { top: arcadeTop, footing: { x: 1.6, z0: -2.2, z1: 1.8 }, bottom: arcadeBottom, topEye: { x: 0, y: CHORA_EYE.y, z: CHORA_EYE.z }, bottomEye: { x: 0, y: ARCADE_END, z: -0.14 }, grab: { x: 0, y: 0.22, z: 0.85 } },
    jungle: { top: choraTop, deck: canopyDeck, footing: { x: 1.6, z0: -2.2, z1: 1.8 }, bottom: stakeBottom, topEye: { x: 0, y: CHORA_EYE.y, z: CHORA_EYE.z }, bottomEye: { x: 0, y: 0.03, z: -0.22 }, grab: { x: 0, y: 0.22, z: 0.85 } },
    chora: { top: choraTop, footing: { x: 0.9, z0: -0.6, z1: 1.5 }, bottom: choraBottom, topEye: { x: 0, y: CHORA_EYE.y, z: CHORA_EYE.z }, bottomEye: { x: 0, y: CHORA_END, z: -0.4 }, grab: { x: 0, y: 0.22, z: 0.85 } }
  };
  BL.ziplineModels = { TROLLEY, DRESSES, trolley, cable };
})();
