// DSB Land's reusable geometry. All moving props share cached meshes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const { box, lathe, merge } = BL.models;
  const geometries = new Map();
  const cached = (key, build) => { if (!geometries.has(key)) geometries.set(key, build()); return geometries.get(key); };
  const C = { ground: "#403054", stone: "#251c39", yellow: "#ffdf38", purple: "#a453ee", cyan: "#49ddd9", water: "#414dad", green: "#55b78d" };
  const cube = (color, emissive = 0) => cached(`dsb-cube-${color}-${emissive}`, () => box({ color, emissive }));
  const block = (parent, color, x, y, z, w, h, d, emissive = 0) => {
    const node = createNode({ geometry: cube(color, emissive), position: { x, y, z }, scale: { x: w, y: h, z: d } });
    addChild(parent, node);
    return node;
  };
  const text = (value, color = C.yellow) => cached(`dsb-text-${value}-${color}`, () => {
    const bits = [], cell = 0.16, width = (value.length * 4 - 1) * cell;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === " ") continue;
      const glyph = BL.hubModels.SIGN_GLYPHS[value[i]] || BL.hubModels.SIGN_GLYPHS[value[i].toLowerCase()];
      if (!glyph) throw new Error(`Missing DSB glyph ${value[i]}`);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (glyph[r][c] === "1") bits.push(box({ w: 0.135, h: 0.135, d: 0.12, color, emissive: 0.6, offset: { x: i * 4 * cell + c * cell - width / 2, y: (4 - r) * cell } }));
    }
    return merge(...bits);
  });
  const sign = (parent, value, x, y, z, scale = 1, color = C.yellow) => {
    const node = createNode({ geometry: text(value, color), position: { x, y, z }, scale: { x: scale, y: scale, z: scale } });
    addChild(parent, node);
    return node;
  };
  const disc = (r, depth, color) => cached(`dsb-disc-${r}-${depth}-${color}`, () => lathe({ profile: [[0, -depth], [r, -depth], [r, 0], [0, 0]], segments: 64, color }));
  const boat = () => {
    const root = createNode();
    block(root, C.yellow, 0, 0, 0, 2.2, 0.65, 4);
    block(root, C.stone, 0, 0.4, 0, 1.6, 0.3, 3.1);
    block(root, C.purple, 0, 0.75, 0.65, 1.7, 0.6, 0.6);
    for (const x of [-1, 1]) block(root, C.cyan, x, 0.5, 0, 0.15, 0.25, 3.8, 0.6);
    return root;
  };
  const coasterCar = () => {
    const root = createNode();
    block(root, C.purple, 0, 0.25, 0, 2.1, 0.5, 3.8);
    block(root, C.yellow, 0, 0.65, 1.5, 2, 0.8, 0.55);
    block(root, C.stone, 0, 0.7, -0.7, 1.6, 0.8, 0.45);
    block(root, C.cyan, 0, 1.1, 1.7, 2, 0.09, 0.09, 0.4);
    for (const x of [-1, 1]) { block(root, C.yellow, x, 0.75, 0, 0.14, 0.7, 3.5); for (const z of [-1.2, 1.2]) block(root, C.stone, x, -0.12, z, 0.3, 0.45, 0.45); }
    return root;
  };
  // The Shop/TV roots own placement. Their local +Z is the usable front.
  const landmark = (node, width, depth) => ({
    node, width, depth,
    point(x = 0, y = 0, z = 3.5, out = {}) {
      const c = Math.cos(node.rotation.y), s = Math.sin(node.rotation.y), p = node.position;
      out.x = p.x + c * x + s * z; out.y = p.y + y; out.z = p.z - s * x + c * z; return out;
    },
    clearAt(x, z, radius = 0) {
      const c = Math.cos(node.rotation.y), s = Math.sin(node.rotation.y), dx = x - node.position.x, dz = z - node.position.z;
      const lx = Math.abs(c * dx - s * dz), lz = Math.abs(s * dx + c * dz);
      if (lx < width && lz < depth) return false;
      return Math.hypot(Math.max(0, lx - width), Math.max(0, lz - depth)) >= radius;
    },
    near(p, range = 4) {
      const c = Math.cos(node.rotation.y), s = Math.sin(node.rotation.y), dx = p.x - node.position.x, dz = p.z - node.position.z;
      const x = c * dx - s * dz, z = s * dx + c * dz;
      return z >= depth && Math.hypot(x, z - 3.5) < range;
    }
  });
  const build = () => {
    const root = createNode(), terrain = createNode({ geometry: disc(36, 2.5, C.ground) });
    addChild(root, terrain);
    // Concentric shell tiers and scutes sit below the entire river, not just the plain.
    const turtle = createNode(); addChild(root, turtle);
    for (let i = 0; i < 5; i++) addChild(turtle, createNode({ geometry: disc(43 - i * 3.4, 1.6, i % 2 ? "#394d43" : "#526744"), position: { x: 0, y: -2.5 - i * 1.55, z: 0 } }));
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI / 10;
      const plate = block(turtle, i % 2 ? C.yellow : "#7a8451", Math.sin(a) * 36.5, -4.4, Math.cos(a) * 36.5, 5.4, 0.3, 8);
      plate.rotation.y = a;
    }
    block(turtle, C.green, 0, -7, 43, 10, 6, 13);
    block(turtle, "#88ba70", 0, -6.5, 51, 11, 5, 8);
    for (const x of [-3.5, 3.5]) {
      block(turtle, "#fff2a0", x, -3.5, 54.2, 1.8, 1.8, 1.8);
      block(turtle, C.stone, x, -3.4, 55.15, 0.8, 1.1, 0.2);
    }
    block(turtle, C.stone, 0, -7.4, 55.1, 7, 0.25, 0.2);
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const fin = block(turtle, C.green, x * 35, -8, z * 24, 22, 2.5, 8);
      fin.rotation.y = x * z * 0.6;
    }
    const tail = block(turtle, C.green, 0, -8, -41, 5, 2, 14); tail.rotation.x = -0.15;
    const water = createNode({ geometry: cached("dsb-water", () => lathe({ profile: [[44, -0.55], [36, -0.55]], segments: 96, color: C.water, emissive: 0.18 })) });
    addChild(root, water);
    const falls = [], spray = [];
    for (let i = 0; i < 64; i++) {
      const a = i * Math.PI / 32;
      const fall = block(root, i % 3 ? C.water : C.cyan, Math.sin(a) * 43.7, -4.5, Math.cos(a) * 43.7, 1.8, 8, 0.2, 0.12);
      fall.rotation.y = a; falls.push(fall);
      const drop = block(root, C.cyan, Math.sin(a) * 43.9, -1, Math.cos(a) * 43.9, 0.16, 1.4, 0.16, 0.35); spray.push(drop);
      if (i % 2 === 0) {
        const marker = block(root, C.yellow, Math.sin(a) * 35.8, 0.15, Math.cos(a) * 35.8, 1.4, 0.12, 0.22, 0.35);
        marker.rotation.y = a;
      }
    }
    // Raised central monument and radial paths.
    block(root, C.stone, 0, 0.45, 0, 16, 0.9, 4);
    block(root, C.yellow, 0, 0.96, 0, 16.4, 0.12, 4.4, 0.3);
    block(root, C.stone, 0, 2.25, -0.4, 15.5, 2.5, 0.8);
    sign(root, "Welcome to", 0, 2.9, 0.1, 0.8, C.cyan);
    sign(root, "DSB Land", 0, 1.55, 0.15, 2.1);
    for (let i = 0; i < 22; i++) block(root, i % 3 ? "#5a4568" : C.yellow, 0, 0.025, 5 + i * 1.35, 2.5, 0.05, 0.8, i % 3 ? 0 : 0.12);
    for (let i = 0; i < 12; i++) for (const side of [-1, 1]) block(root, "#5a4568", side * (3 + i * 1.4), 0.025, 7, 0.8, 0.05, 2);
    // Comedy stage: brick wall, suspended lights, and a microphone.
    const stage = createNode({ position: { x: -18, y: 0, z: -16 } }); addChild(root, stage);
    block(stage, C.stone, 0, 0.55, 0, 14, 1.1, 8);
    block(stage, C.yellow, 0, 1.12, 3.9, 14, 0.12, 0.15, 0.6);
    const bricks = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) bricks.push(box({ w: 1.32, h: 0.47, d: 0.5, color: (x + y) % 3 ? "#6a344d" : "#864661", offset: { x: (x - 4.5) * 1.4 + (y % 2) * 0.35, y: 1.4 + y * 0.53, z: -3.6 } }));
    addChild(stage, createNode({ geometry: merge(...bricks) }));
    sign(stage, "Open mic", 0, 4.6, -3.25, 1.6);
    block(stage, "#141322", 0, 1.18, 1.1, 0.7, 0.12, 0.7);
    block(stage, "#b7b9c6", 0, 2, 1.1, 0.1, 1.6, 0.1);
    const mic = block(stage, "#d4d4d9", 0, 2.88, 1.1, 0.25, 0.4, 0.25);
    for (const x of [-6.5, 6.5]) {
      block(stage, C.stone, x, 3.2, -2, 0.3, 6.4, 0.3);
      block(stage, C.purple, x, 5.9, 0, 0.7, 0.7, 0.9, 0.9);
      block(stage, C.stone, x, 1.85, 2, 1.2, 1.5, 1.1);
    }
    block(stage, C.stone, 0, 6.2, -2, 13, 0.3, 0.3);
    for (let row = 0; row < 3; row++) for (const x of [-22, -18, -14]) block(root, "#766049", x, 0.5, -8 + row * 2.8, 3, 1, 0.8);
    // Meme stand and an inviting dock on the south shore.
    const shop = createNode({ position: { x: -14, y: 0, z: 18 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } }); addChild(root, shop);
    block(shop, C.stone, 0, 1, 0, 7, 2, 3);
    for (const x of [-3.4, 3.4]) block(shop, C.purple, x, 2.4, 0, 0.3, 4.8, 0.3);
    block(shop, C.yellow, 0, 4.4, 0, 7.8, 0.4, 4.5);
    sign(shop, "DSB memes", 0, 3.2, 1.6, 1.15);
    block(shop, "#bc8644", -1.6, 2.2, 0.9, 1.6, 0.45, 0.8);
    const banana = BL.models.banana(); banana.position.x = 0; banana.position.y = 2.12; banana.position.z = 0.9; addChild(shop, banana);
    block(shop, "#f14b68", 1.5, 2.3, 0.9, 0.6, 0.6, 0.6);
    // The walnut CRT faces the Shop across the open Ooga Portal plaza.
    const tv = createNode({ position: { x: 14, y: 0, z: 18 }, rotation: { x: 0, y: -Math.PI / 2, z: 0 } }); addChild(root, tv);
    for (const x of [-2.7, 2.7]) block(tv, "#78543b", x, 0.7, 0, 0.45, 1.4, 1.5);
    block(tv, "#78543b", 0, 3.2, 0, 8, 4.4, 2.8);
    block(tv, C.yellow, 0, 3.2, 1.42, 7.7, 4.1, 0.12);
    block(tv, "#101b22", -0.55, 3.3, 1.53, 6.15, 3.35, 0.16);
    const tvScreen = createNode({ position: { x: -0.55, y: 3.3, z: 1.63 } }); addChild(tv, tvScreen);
    for (const y of [3.5, 4.4]) block(tv, C.stone, 3.2, y, 1.7, 0.55, 0.55, 0.3);
    for (let i = 0; i < 6; i++) block(tv, C.stone, 3.2, 1.85 + i * 0.16, 1.52, 0.65, 0.06, 0.1);
    for (const side of [-1, 1]) { const aerial = block(tv, "#a5b2bd", side * 0.7, 6.25, 0, 0.09, 2.1, 0.09); aerial.rotation.z = side * -0.65; }
    sign(tv, "DSB TV", -0.5, 1.22, 1.56, 0.4, C.cyan);
    const dock = block(root, "#8b7047", 0, -0.1, 37, 4.5, 0.3, 8);
    sign(root, "Boat station", 0, 3.2, 34.85, 0.8).rotation.y = Math.PI;
    for (const x of [-2.6, 2.6]) block(root, C.purple, x, 1.7, 35, 0.25, 3.4, 0.25);
    block(root, C.yellow, 0, 3.8, 35, 6, 0.2, 2);
    const boats = [boat(), boat(), boat()]; for (const b of boats) addChild(root, b);
    const station = createNode({ position: { x: 7, y: 0, z: 26 } }); addChild(root, station);
    block(station, C.stone, 0, -0.1, 0, 5, 0.2, 5);
    for (const x of [-2.3, 2.3]) { block(station, C.purple, x, 4.6, 0, 0.4, 9.2, 0.4); block(station, C.yellow, x, 2, -2.4, 0.25, 4, 0.25); }
    block(station, C.yellow, 0, 9.4, 1, 5.4, 0.4, 7);
    block(station, C.stone, 0, 0.9, -1.6, 2.5, 1.5, 0.7);
    sign(station, "Bitcoin coaster", 0, 4, -2.5, 0.75).rotation.y = Math.PI;
    sign(station, "Take a ride", 0, 2.6, -2.5, 0.65, C.cyan).rotation.y = Math.PI;
    // The boarding platform meets a level section of the perimeter track.
    for (let i = 0; i < 15; i++) block(station, "#78627d", 3.3, 0.3 + i * 0.6, -3.2 + i * 0.5, 1.6, 0.3, 0.55);
    const carts = [coasterCar(), coasterCar(), coasterCar()]; for (const car of carts) addChild(root, car); const cart = carts[0];
    const stars = [];
    for (let i = 0; i < 36; i++) {
      const a = i * 2.399963;
      const star = block(root, i % 3 ? C.cyan : C.yellow, Math.sin(a) * (45 + i % 7 * 3), 20 + i % 9 * 3, Math.cos(a) * (45 + i % 7 * 3), 0.35, 0.35, 0.35, 0.9);
      stars.push(star);
    }
    return { landmarks: { shop: landmark(shop, 4, 2), tv: landmark(tv, 4.4, 1.9) }, root, terrain, turtle, water, falls, spray, stage, mic, shop, tv, tvScreen, dock, boats, cart, carts, stars, station };
  };
  BL.dsbModels = { C, cube, block, text, sign, boat, build };
})();
