// The Goldbug: an original cartoon caveman who trusts nothing but gold, in a navy suit and gold tie, with a pocket watch
// and pockets bulging with coins, his Ooga face, hair and bare feet his own. He stands for an argument, not a person: no real name, likeness or line. He is built on
// the shared caveman rig (models.caveman with dress hooks, as src/characters/ are), so any scene can borrow him: `create`
// returns fresh nodes over shared geometry, and the poses below drive only his own limbs and allocate nothing.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { box, bevelBox, lathe, tube, merge, cached } = BL.models;
  const { createNode, addChild } = BL.scene;
  const { fnv1a, mulberry32 } = BL.math;
  // "~" never appears in a GitHub handle, so this key can't meet a contributor's in the caveman cache.
  const NAME = "~goldbug", HEIGHT = 0.98;
  const NAVY = "#1f2d52", NAVY_DK = "#162039", NAVY_LT = "#2d3f6e", SHIRT = "#eeeae0";
  const GOLD = "#d9a92e", GOLD_LT = "#f4d26a", GOLD_DK = "#9a6e14";
  // The melt's colourway: every colour of his palette mapped by its brightness onto a gold ramp.
  const GOLD_RAMP = [[110, 72, 12], [214, 160, 42], [255, 222, 120]];
  const goldOf = (rgb) => {
    const l = Math.min(1, (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 200), t = l * 2, i = Math.min(1, Math.floor(t)), f = t - i;
    const a = GOLD_RAMP[i], b = GOLD_RAMP[i + 1];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
  };
  const goldHex = (hex) => {
    const n = parseInt(hex.slice(1), 16), g = goldOf([n >> 16 & 255, n >> 8 & 255, n & 255]);
    return "#" + ((1 << 24) | (g[0] << 16) | (g[1] << 8) | g[2]).toString(16).slice(1);
  };
  // A suit part outside the voxel bakes: built twice, as worn and in gold, so the melt turns it with the rest of him.
  // The node carries both; `swapGold` trades them as it trades the voxel twins.
  const suitNode = (build) => {
    const plain = build((hex) => hex), gold = build(goldHex);
    BL.models.characterGeometry(gold);
    return createNode({ geometry: plain, plainGeometry: plain, goldTwin: gold });
  };
  const dress = {
    torso(k, v) {
      // A navy jacket over chest and hips, lapels either side of a white collar, and a gold tie down the front.
      const navy = k.color(NAVY), dark = k.color(NAVY_DK), lapel = k.color(NAVY_LT), shirt = k.color(SHIRT), tie = k.color(GOLD), knot = k.color(GOLD_DK);
      v.fill(0, 8, 0, 2, 0, 5, navy);
      v.fill(1, 7, 3, 7, 1, 4, navy);
      v.fill(1, 7, 3, 3, 1, 4, dark);
      for (const y of [5, 6, 7]) { v.set(3, y, 4, lapel); v.set(5, y, 4, lapel); }
      v.set(4, 7, 4, shirt); v.set(3, 7, 4, shirt); v.set(5, 7, 4, shirt);
      v.set(4, 6, 4, knot);
      v.fill(4, 4, 3, 5, 4, 4, tie);
      k.loin = [navy, dark];
    },
    gear(k) {
      const u = k.u;
      // Navy sleeves from the shoulder to a white cuff (arm-local: the shoulder at 0, the hand from -9u down), and navy
      // trouser legs to the ankle (leg-local: the foot below -3u); the hands and bare feet stay his.
      for (const side of ["armR", "armL"]) addChild(k.parts[side], suitNode((c) => merge(
        box({ w: 5.3 * u, h: 3.3 * u, d: 5.3 * u, color: c(NAVY), offset: { x: 0, y: -1.5 * u, z: 0 } }),
        box({ w: 3.5 * u, h: 6.2 * u, d: 3.5 * u, color: c(NAVY), offset: { x: 0, y: -6.1 * u, z: 0 } }),
        box({ w: 3.7 * u, h: 0.7 * u, d: 3.7 * u, color: c(SHIRT), offset: { x: 0, y: -8.9 * u, z: 0 } }))));
      for (const side of ["legR", "legL"]) addChild(k.parts[side], suitNode((c) =>
        box({ w: 4.4 * u, h: 3.2 * u, d: 4.4 * u, color: c(NAVY_DK), offset: { x: 0, y: -1.4 * u, z: -0.5 * u } })));
    },
    extras(k) {
      const u = k.u;
      // Torso-local: the chest's front face is 2u out, the hips' 3u. Bulging hip pockets, each with a coin's edge
      // showing, and a watch on a chain at the jacket.
      const pocket = (c, side) => merge(
        bevelBox({ w: 2.6 * u, h: 2.2 * u, d: 1.2 * u, color: c(NAVY_DK), offset: { x: side * 3 * u, y: 1.5 * u, z: 3.1 * u } }),
        box({ w: 1.3 * u, h: 0.5 * u, d: 0.35 * u, color: c(GOLD_LT), emissive: 0.15, offset: { x: side * 3 * u, y: 2.7 * u, z: 3.1 * u } })
      );
      const watch = () => {
        const geo = lathe({ profile: [[0, -0.18 * u], [0.75 * u, -0.18 * u], [0.75 * u, 0.18 * u], [0, 0.18 * u]], segments: 10, color: GOLD, emissive: 0.1 });
        // A lathe turns about y; lay the watch's face forward by swapping its y and z.
        const v = geo.verts;
        for (let i = 0; i < v.length; i += 3) { const y = v[i + 1]; v[i] += -1.9 * u; v[i + 1] = v[i + 2] + 4.4 * u; v[i + 2] = y + 2.2 * u; }
        return geo;
      };
      const chain = () => tube({ rings: 8, segments: 4, radius: () => 0.12 * u, colorFn: () => GOLD_LT,
        path: (t) => ({ x: (-1.9 + t * 1.6) * u, y: (4.4 + Math.sin(t * Math.PI) * -0.9 + t * 1.2) * u, z: 2.2 * u }) });
      addChild(k.parts.torso, suitNode((c) => merge(pocket(c, -1), pocket(c, 1), watch(), chain())));
    },
    tint(k, palette) { return palette.map(goldOf); }
  };
  const traits = () => ({
    name: NAME, display: "the Goldbug", slim: false, wideEyes: true, eyeColor: GOLD_LT,
    skin: "#d0a074", hair: "#9b948a", fur: NAVY_DK, height: HEIGHT, belly: 1.22,
    rand: mulberry32(fnv1a(NAME + "/body")), dress
  });
  // A coin lies flat as it lands; the puddle is a low gold disc. Both cached per scene scope.
  const coinGeometry = cached(() => lathe({ profile: [[0, -0.012], [0.055, -0.012], [0.055, 0.012], [0, 0.012]], segments: 8, color: GOLD_LT, emissive: 0.35 }));
  const puddleGeometry = cached(() => lathe({ profile: [[0, 0.004], [0.5, 0.004], [0.44, 0.03], [0.22, 0.045], [0, 0.05]], segments: 14, color: GOLD, emissive: 0.2 }));
  const ARM_REST = -0.2;
  const create = () => {
    const rig = BL.models.caveman(traits());
    // He carries gold, not weapons: the rig's club and rifle stay put away.
    rig.parts.club.visible = rig.parts.gun.visible = false;
    return { root: rig.root, parts: rig.parts, tint: rig.tint, baseY: rig.root.position.y, height: HEIGHT, golden: false };
  };
  // Every pose writes the same limbs, so switching between them leaves nothing from the last.
  const stand = (g) => {
    const p = g.parts;
    p.legR.rotation.x = p.legL.rotation.x = 0;
    p.armR.rotation.x = p.armL.rotation.x = ARM_REST;
    p.armR.rotation.z = -0.12; p.armL.rotation.z = 0.12;
    p.head.rotation.x = p.head.rotation.y = 0;
    p.torso.rotation.x = 0;
    g.root.scale.x = g.root.scale.y = g.root.scale.z = 1;
  };
  // A waddling run: crew.js's walk with a longer stride and arms that pump.
  const walk = (g, phase, stride = 1) => {
    const p = g.parts, swing = Math.sin(phase);
    p.legR.rotation.x = swing * 0.55 * stride;
    p.legL.rotation.x = -swing * 0.55 * stride;
    p.armR.rotation.x = ARM_REST - swing * 0.45 * stride;
    p.armL.rotation.x = ARM_REST + swing * 0.45 * stride;
    p.torso.rotation.x = 0.08 * stride;
    return Math.abs(swing) * 0.05 * stride;
  };
  // t from 0 to 1: a glance away, a snap back to the glass, then arms up and a lean back in alarm.
  const doubleTake = (g, t) => {
    const p = g.parts;
    const away = t < 0.22 ? t / 0.22 : t < 0.36 ? 1 - (t - 0.22) / 0.14 : 0;
    const alarm = t < 0.36 ? 0 : t < 0.5 ? (t - 0.36) / 0.14 : 1 - Math.max(0, t - 0.85) / 0.15;
    p.head.rotation.y = away * 0.7;
    p.head.rotation.x = -0.25 * alarm;
    p.torso.rotation.x = -0.18 * alarm;
    p.armR.rotation.x = p.armL.rotation.x = ARM_REST - 1.9 * alarm;
    p.armR.rotation.z = -0.12 - 0.5 * alarm; p.armL.rotation.z = 0.12 + 0.5 * alarm;
    p.legR.rotation.x = p.legL.rotation.x = 0;
  };
  // t from 0 to 1: he sags and spreads into the ground. Returns how far the puddle has spread.
  const melt = (g, t) => {
    const p = g.parts, k = t * t * (3 - 2 * t);
    g.root.scale.y = Math.max(0.04, 1 - k);
    g.root.scale.x = g.root.scale.z = 1 + 0.8 * k;
    p.armR.rotation.x = p.armL.rotation.x = ARM_REST + 0.4 * k;
    p.armR.rotation.z = -0.12 - 1.1 * k; p.armL.rotation.z = 0.12 + 1.1 * k;
    p.head.rotation.x = 0.3 * k;
    return k;
  };
  // The gold colourway on or off; each voxel part is paired with its twin both ways, as crew.js's swapTint, and each
  // suit part with its own gold twin.
  const swapGold = (node, tint) => {
    let twin = node.geometry && tint.get(node.geometry);
    if (!twin && node.goldTwin) twin = node.geometry === node.goldTwin ? node.plainGeometry : node.goldTwin;
    if (twin) node.geometry = twin;
    for (let i = 0; i < node.children.length; i++) swapGold(node.children[i], tint);
  };
  const setGolden = (g, on) => {
    if (!g.tint || g.golden === on) return;
    swapGold(g.root, g.tint);
    g.golden = on;
  };
  BL.goldbugModels = { NAME, HEIGHT, create, stand, walk, doubleTake, melt, setGolden, coinGeometry, puddleGeometry, goldOf };
})();
