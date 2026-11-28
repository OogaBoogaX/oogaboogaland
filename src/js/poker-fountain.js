// The Banana Club's centre fountain: a round marble basin with a raised rim, a pedestal in the pool, and on it a marble
// Ooga in a toga tipping an urn, whose water falls in a few strands of the lake's moving translucent material onto the
// pool's surface, where a fixed pool of droplets splashes. The figure is a clone of `models.caveman` under an invented
// name (`fountain/ember-den`, which no GitHub login can hold), dressed in a toga by its own hooks, posed by its parts'
// rotations and baked with the urn into one geometry whose every colour is turned to marble by its brightness, so it
// costs one draw. Built round the root's origin with y 0 at the floor; the figure faces +z turned by `FACING`, with its
// strands and droplets under the same turned node. The scene places the root at (`X`, `Z`) and keeps walkers outside
// `RADIUS`, the basin's outer rim.
(() => {
  "use strict";
  const BL = window.BL, M = BL.models, S = BL.scene, K = BL.pokerMarble, hexToRgb = BL.math.hexToRgb;
  const X = 0, Z = 0, RADIUS = 2.3;
  // The basin: its foot, wall and rim out to RADIUS, the rim's top at RIM_Y, the inner wall at INNER down to the floor
  // at FLOOR_Y, and the pool's surface at POOL_Y. The pedestal stands in the pool to PEDESTAL_Y, where the figure stands.
  const RIM_Y = 0.58, INNER = 2.02, FLOOR_Y = 0.16, POOL_Y = 0.46, PEDESTAL_Y = 1.2;
  // The figure's height (the caveman's `height` trait; its head's top stands about 0.4 of it over the pivot) and pose.
  // The Ember Den's old spelling, as the crowd's (poker-crowd-models.js `TAG`): its look is hashed from it.
  const FIGURE_H = 1.08, NAME = "fountain/ember-den";
  const TOGA = "#f4f1ea", FOLD = "#9e968a", SKIN = "#c9bfae", LAUREL = "#8d927a";
  // The urn's half height and tip (its mouth turned past level, forward and down), and the water leaving it.
  const URN_HALF = 0.24, TIP = 2.05, POUR_SPEED = 1.1, GRAVITY = 9.8;
  // Strands and droplets, each with its lite count.
  const STRANDS = 5, STRANDS_LITE = 3, DROPS = 12, DROPS_LITE = 6, FAN = 0.16, STRAND_GAP = 0.025;
  // The lake water's middle blue (`poolModels.WATER[1]`), as Cloud Hopper's falls use it.
  const GLASS = 0.64, WATER_HEX = "#4aa6ff", WATER = hexToRgb(WATER_HEX);
  const DROP_REACH = 0.42, DROP_HEIGHT = 0.28;
  // The figure and its water turn together by FACING about y, so from the room's +z end the figure stands in
  // three-quarter view beside its water instead of behind it; the basin, pedestal and pool stay square.
  const FACING = 0.9;
  const DEEP = hexToRgb(K.SHADE).map((v, i) => Math.round(v + (hexToRgb(K.VEIN)[i] - v) * 0.45)), WHITE_RGB = hexToRgb(K.WHITE);
  const cache = M.scopedMap();
  const once = (key, build) => {
    if (cache.has(key)) return cache.get(key);
    const value = build();
    cache.set(key, value);
    return value;
  };

  // ---- stone -----------------------------------------------------------------------------------------------------

  // The basin and the pedestal, one flat-shaded geometry: a darker foot, a white wall flaring to the rim, a gold line
  // under the lip, the rim's top, and SHADE inside; the pedestal a turned shaft with a gold band under its cap.
  const stone = (lite) => once("stone:" + lite, () => {
    const segments = lite ? 16 : 32, lathe = (profile, color) => M.lathe({ segments, color, profile });
    return M.merge(
      lathe([[RADIUS - 0.02, 0], [RADIUS - 0.02, 0.1], [RADIUS - 0.08, 0.12]], K.SHADE),
      lathe([[RADIUS - 0.08, 0.12], [RADIUS - 0.12, 0.42], [RADIUS - 0.06, 0.48]], K.WHITE),
      lathe([[RADIUS - 0.06, 0.48], [RADIUS - 0.03, 0.5]], K.GOLD),
      lathe([[RADIUS - 0.03, 0.5], [RADIUS, 0.54], [RADIUS, RIM_Y], [INNER, RIM_Y]], K.WHITE),
      lathe([[INNER, RIM_Y], [INNER, FLOOR_Y], [0, FLOOR_Y]], K.SHADE),
      lathe([[0.62, FLOOR_Y], [0.62, 0.3], [0.42, 0.38], [0.36, 0.5], [0.33, PEDESTAL_Y - 0.24]], K.WHITE),
      lathe([[0.33, PEDESTAL_Y - 0.24], [0.4, PEDESTAL_Y - 0.2], [0.4, PEDESTAL_Y - 0.16]], K.GOLD),
      lathe([[0.4, PEDESTAL_Y - 0.16], [0.5, PEDESTAL_Y - 0.1], [0.5, PEDESTAL_Y], [0, PEDESTAL_Y]], K.WHITE)
    );
  });

  // ---- the figure ------------------------------------------------------------------------------------------------

  const HIP = M.BODY.hip;
  // The toga: a white cloth over the left shoulder down to the right hip, its edge a fold, the right shoulder bare;
  // a skirt to the knee; a laurel round the bald head. The club stays hidden. Every colour turns to marble in the bake.
  const dress = {
    torso(k, v) {
      const cloth = k.color(TOGA), fold = k.color(FOLD), skin = k.P.skin;
      v.fill(0, 8, 0, 7, 0, 5, (x, y) => y <= 1 ? cloth : x === y ? fold : x > y ? cloth : skin);
      k.loin = [cloth, fold];
    },
    crown(k, v) {
      const leaf = k.color(LAUREL);
      // A ring of leaves round the head, every other cell, open over the brow.
      v.fill(-1, 7, 5, 5, -1, 6, (x, y, z) => (x === -1 || x === 7 || z === -1 || z === 6) && (x + z) % 2 === 0 && !(z === 6 && x >= 2 && x <= 4) ? leaf : undefined);
    },
    extras(k) {
      const h = k.h;
      k.parts.club.visible = false;
      S.addChild(k.root, S.createNode({ scale: { x: h, y: h, z: h }, geometry: M.lathe({ segments: 12, color: TOGA, profile: [[0, -HIP * 0.55], [0.29, -HIP * 0.55], [0.27, -0.04], [0.23, 0.1], [0, 0.1]] }) }));
    }
  };
  const traits = () => {
    const hashed = BL.contributors.traitsFor(NAME);
    return { ...hashed, display: "Fountain", height: FIGURE_H, skin: SKIN, hair: SKIN, fur: TOGA, dress, bald: true, cleanShaven: true, noPupils: true, noBrow: true };
  };
  // A colour turned to marble by its brightness: dark to a deep vein grey, bright to white.
  const marble = (c) => {
    const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255, t = Math.max(0, Math.min(1, (l - 0.25) / 0.6));
    return DEEP.map((v, i) => Math.round(v + (WHITE_RGB[i] - v) * t));
  };
  // Appends a node's geometry to `out`, its vertices through the node's world matrix and its colours in marble.
  const bakeInto = (out, node) => {
    const g = node.geometry, m = node.world, v = g.verts, shift = out.verts.length / 3;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      out.verts.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    }
    const compact = BL.compactGeometry, packed = compact?.storageOf(g);
    for (let n = 0, count = packed ? packed.count : g.faces.length; n < count; n++) {
      const f = packed ? compact.copyFace(g, n) : g.faces[n];
      // `visibility: false` marks render-only decoration: the renderers draw it, the outline registry skips it.
      const face = { i: f.i.map((i) => i + shift), color: marble(f.color), emissive: 0 };
      if (f.visibility === false) face.visibility = false;
      out.faces.push(face);
    }
  };
  const bakeTree = (out, node) => {
    if (!node.visible) return;
    if (node.geometry) bakeInto(out, node);
    for (let i = 0; i < node.children.length; i++) bakeTree(out, node.children[i]);
  };
  // The urn, built round +y about its middle: a foot, a round belly, a neck and a lip with a gold band.
  const urn = () => M.merge(
    M.lathe({ segments: 12, color: K.WHITE, profile: [[0, -URN_HALF], [0.09, -URN_HALF], [0.1, -0.2], [0.18, -0.1], [0.2, 0], [0.17, 0.09], [0.09, 0.16]] }),
    M.lathe({ segments: 12, color: K.GOLD, profile: [[0.09, 0.16], [0.1, 0.19]] }),
    M.lathe({ segments: 12, color: K.WHITE, profile: [[0.1, 0.19], [0.13, URN_HALF], [0.09, URN_HALF], [0.075, 0.16]] })
  );
  // The posed figure and its urn, baked; `lip` is where the water leaves the urn, `dir` the way it leaves (y, z).
  const figure = () => once("figure", () => {
    const cave = M.caveman(traits()), p = cave.parts;
    cave.root.position.y += PEDESTAL_Y;
    // Weight on the right leg, the left a little forward; both arms forward and in, elbows bent, holding the urn
    // before the chest; the head bowed to it.
    p.legR.rotation.x = 0.06; p.legL.rotation.x = -0.14; p.legL.rotation.z = 0.04;
    p.armR.rotation.x = -0.55; p.armR.rotation.z = 0.26;
    p.armL.rotation.x = -0.55; p.armL.rotation.z = -0.26;
    if (p.forearmR) p.forearmR.rotation.x = -1.3;
    if (p.forearmL) p.forearmL.rotation.x = -1.3;
    p.head.rotation.x = 0.22;
    S.updateWorld(cave.root, null);
    const out = M.geometry();
    bakeTree(out, cave.root);
    // The urn between the two fists, a little ahead of them, tipped forward about x.
    const r = p.fingersR.world, l = p.fingersL.world;
    const cx = (r[12] + l[12]) / 2, cy = (r[13] + l[13]) / 2 + 0.02, cz = (r[14] + l[14]) / 2 + 0.06;
    const u = M.moved(M.turnedX(urn(), TIP), cx, cy, cz);
    const shift = out.verts.length / 3;
    for (let i = 0; i < u.verts.length; i++) out.verts.push(u.verts[i]);
    for (const f of u.faces) out.faces.push({ i: f.i.map((i) => i + shift), color: f.color, emissive: 0 });
    const dy = Math.cos(TIP), dz = Math.sin(TIP);
    return { geometry: out, lip: [cx, cy + dy * URN_HALF, cz + dz * URN_HALF], dir: [dy, dz] };
  });

  // ---- water -----------------------------------------------------------------------------------------------------

  // How long the poured water takes from the lip to the pool's surface, and where it is at time t (y and z from the lip).
  const fallTime = (lipY, dy) => {
    const vy = dy * POUR_SPEED, drop = lipY - POOL_Y + 0.02;
    return (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
  };
  // One strand, from the lip (the origin) to just under the pool's surface: a square tube along the pour's arc,
  // widening as it falls, its faces the lake's water flowing down it.
  const strand = (lite) => once("strand:" + lite, () => {
    const f = figure(), [dy, dz] = f.dir, T = fallTime(f.lip[1], dy), rows = lite ? 6 : 10, g = M.geometry();
    const at = (t) => [-dy * POUR_SPEED * t + 0.5 * GRAVITY * t * t, dz * POUR_SPEED * t];
    let previous = null;
    for (let k = 0; k <= rows; k++) {
      const t = T * k / rows, [down, ahead] = at(t), vy = -dy * POUR_SPEED + GRAVITY * t, vz = dz * POUR_SPEED, len = Math.hypot(vy, vz);
      // The tube's depth across the arc, in the y-z plane, and its width along x.
      const ny = vz / len, nz = vy / len, w = 0.018 + 0.022 * k / rows, d = 0.012 + 0.01 * k / rows;
      const row = [[-w, -down + ny * d, ahead + nz * d], [w, -down + ny * d, ahead + nz * d], [w, -down - ny * d, ahead - nz * d], [-w, -down - ny * d, ahead - nz * d]]
        .map(([x, y, z]) => M.pushVert(g, x, y, z));
      if (previous) for (let s = 0; s < 4; s++) {
        const s2 = (s + 1) % 4;
        M.face(g, [previous[s], row[s], row[s2], previous[s2]], WATER, { emissive: 0.5 });
      }
      else M.face(g, row.slice(), WATER, { emissive: 0.5 });
      previous = row;
    }
    M.face(g, previous.slice().reverse(), WATER, { emissive: 0.5 });
    for (const face of g.faces) face.lake = true;
    g.glass = GLASS; g.castShadow = false;
    // The texture runs across the strand and down it. The renderers read `lakeFlow` in world axes, so the strand's
    // across axis is its local x turned by FACING (the fan's own few tenths of a radian are left out).
    g.lakeFlow = new Float32Array([Math.cos(FACING), 0, -Math.sin(FACING), 0, 0, -1, 0, 0]);
    const [down, ahead] = at(T);
    return { geometry: g, down, ahead };
  });
  // The pool's surface, a disc of the lake's water just inside the inner wall, facing up.
  const surface = (lite) => once("surface:" + lite, () => {
    const g = M.lathe({ segments: lite ? 16 : 32, color: WATER_HEX, emissive: 0.35, profile: [[INNER - 0.01, POOL_Y], [0, POOL_Y]] });
    for (const face of g.faces) face.lake = true;
    g.glass = GLASS; g.castShadow = false;
    return g;
  });
  // A droplet: a small cube of the same water.
  const droplet = M.cached(() => {
    const g = M.box({ w: 0.04, h: 0.04, d: 0.04, color: WATER_HEX, emissive: 0.6 });
    for (const face of g.faces) face.lake = true;
    g.glass = GLASS; g.castShadow = false;
    return g;
  });

  // ---- the fountain ----------------------------------------------------------------------------------------------

  const build = (lite = false) => {
    const root = S.createNode(), f = figure(), sh = strand(lite), nStrands = lite ? STRANDS_LITE : STRANDS, nDrops = lite ? DROPS_LITE : DROPS;
    const turned = S.createNode({ rotation: { x: 0, y: FACING, z: 0 } });
    S.addChild(root, S.createNode({ geometry: stone(lite) }), S.createNode({ geometry: surface(lite) }), turned);
    S.addChild(turned, S.createNode({ geometry: f.geometry }));
    // Each strand leaves the lip a little apart and fanned, so each lands at its own spot (`land`, x and z).
    let strands = [], drops = [];
    const land = new Float64Array(nStrands * 2);
    for (let j = 0; j < nStrands; j++) {
      const k = j - (nStrands - 1) / 2, yaw = k * FAN, x = f.lip[0] + k * STRAND_GAP;
      strands.push(S.createNode({ geometry: sh.geometry, position: { x, y: f.lip[1], z: f.lip[2] }, rotation: { x: 0, y: yaw, z: 0 } }));
      land[j * 2] = x + Math.sin(yaw) * sh.ahead;
      land[j * 2 + 1] = f.lip[2] + Math.cos(yaw) * sh.ahead;
    }
    // Each droplet keeps its strand, heading, reach, period and phase for good, all fixed here.
    const heading = new Float64Array(nDrops), reach = new Float64Array(nDrops), period = new Float64Array(nDrops), phase = new Float64Array(nDrops);
    for (let i = 0; i < nDrops; i++) {
      const golden = (i * 0.6180339887) % 1;
      heading[i] = i * 2.39996323;
      reach[i] = DROP_REACH * (0.55 + 0.45 * golden);
      period[i] = 0.62 + 0.3 * golden;
      phase[i] = i / nDrops;
      drops.push(S.createNode({ geometry: droplet(), position: { x: land[(i % nStrands) * 2], y: POOL_Y, z: land[(i % nStrands) * 2 + 1] } }));
    }
    S.addChild(turned, ...strands, ...drops);
    // Strands shimmer in width and brightness; droplets arc out from their strand's landing and fall back, shrinking.
    const update = (dt, time) => {
      const t = Number.isFinite(time) ? time : 0;
      for (let j = 0; j < strands.length; j++) {
        const s = strands[j];
        s.scale.x = 1 + 0.14 * Math.sin(t * 7.3 + j * 1.9);
        s.glow = 0.9 + 0.1 * Math.sin(t * 5.1 + j * 2.3);
      }
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i], u = (((t / period[i] + phase[i]) % 1) + 1) % 1, a = heading[i], r = reach[i] * u, j = (i % strands.length) * 2;
        d.position.x = land[j] + Math.cos(a) * r;
        d.position.z = land[j + 1] + Math.sin(a) * r;
        d.position.y = POOL_Y + DROP_HEIGHT * 4 * u * (1 - u) * (0.6 + 0.4 * reach[i] / DROP_REACH);
        d.scale.x = d.scale.y = d.scale.z = 1 - 0.6 * u;
        d.glow = 1.1 - 0.4 * u;
      }
    };
    const dispose = () => {
      while (turned.children.length) S.removeChild(turned, turned.children[turned.children.length - 1]);
      while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
      strands = []; drops = [];
    };
    return { root, update, dispose };
  };

  BL.pokerFountain = Object.freeze({ X, Z, RADIUS, build });
})();
