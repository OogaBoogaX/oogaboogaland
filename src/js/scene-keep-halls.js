// The Byzantine Keep's halls: the keep behind its great door, four storeys of it (the dungeon and its twelve cells, the
// great lounge, the alchemy room and the rooftop), and the six curtain towers' insides, each a spiral stair up to its
// room at the top, all in one scene (keep-halls-layout.js holds its frame). Walked into from the yard through the great
// door or a tower's door, and left by the same door back into the yard; the crown chamber's portal goes straight back
// to ₿IFRÖST. Its code is in the Keep's own deferred group, so nothing of it loads before the Keep does.
//
// The lounge's four armchairs and the rooftop's eight chairs are seats (Space beside one). Light is torches, candles
// and fires, the nearest ones in the room the visitor stands in first, so every tier keeps those; on the rooftop and up
// a tower the moon's light comes in, and from the rooftop the castle and its land stand all round as the yard has
// them (keep-models.js `castleParts`). Presence and voice ride the island's room under `byzantine-keep.halls`.
(() => {
  "use strict";
  // The halls' zones: the keep's own inside and each tower's and the cave's (zone-map.js `FRAME_SETS`).
  const ZM = window.BL.zoneMap;
  // The land is being built: a debug page plays this Ooga unless it names another (scene-keep.js's too).
  const TEST_PLAYER = "rules-without-rulers";
  const BL = window.BL;
  if (BL.scenes && BL.scenes.keephalls && typeof BL.scenes.keephalls.enter === "function") return;
  const L = BL.keepHallsLayout, HM = BL.keepHallsModels, KM = BL.keepModels;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { clamp } = BL.math;
  const TAU = Math.PI * 2;

  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const PITCH = [-0.35, 1.3], DIST = [2.2, 9];
  const FOLLOW = { y: 0.9, min: 2.6, max: 6, pitch: [0.2, 0.75] };
  const view = (x, y, z, yaw, pitch, dist) => ({ yaw, pitch, dist, target: { x, y, z } });
  const UPF = L.ROOM.alchemy.floor, ARF = L.ROOM.armory.floor, DNF = L.LEVELS.under.floor;
  const VIEW_NAMES = { lounge: "Great Lounge", alchemy: "Alchemy Room", armory: "Training", dungeon: "Dungeon", roof: "Founders Hall" };
  const KC = L.KC;
  const PRESETS = {
    lounge: view(KC.x, 2.4, KC.z - 3, 0, 0.18, 9),
    alchemy: view(KC.x, UPF + 2.0, KC.z, 0, 0.3, 7.5),
    armory: view(KC.x, ARF + 2.0, KC.z, 0, 0.2, 8),
    dungeon: view(KC.x, DNF + 2, KC.z, Math.PI / 2, 0.25, 6),
    roof: view(KC.x, L.ROOF + 2, KC.z, 0, 0.45, 9)
  };
  // The candles floating in a ring over the lounge: how many, how far out, how high, how fast the ring turns.
  const CANDLES = { n: 32, r: 5.2, y: L.ROOF + 7.4, at: { x: KC.x, z: KC.z }, turn: 0.05 };
  const SEAT_REACH = 1.3;
  // The night outside, seen only through the towers' windows: the Keep's own sky. Inside the halls the moon reaches
  // nothing (`INDOOR`); up a tower its light comes in at the windows (`TOWER`).
  const MOON = [-0.52, 0.42, -0.74].map((v, i, a) => v / Math.hypot(...a));
  const RENDER_OPTS = {
    clear: [0.006, 0.008, 0.018], sky: [0.12, 0.13, 0.17], ground: [0.05, 0.045, 0.05],
    horizon: [0.075, 0.092, 0.155], zenith: [0.012, 0.016, 0.036], stars: 0.5, moon: { x: MOON[0], y: MOON[1], z: MOON[2] }, moonSun: { x: -MOON[0] + 0.25, y: -MOON[1], z: -MOON[2] },
    starMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), clouds: 0.62,
    light: { x: MOON[0], y: MOON[1], z: MOON[2] }, sun: [0.05, 0.05, 0.08], direct: [0.42, 0.5, 0.74], directStrength: 0.05, ambientFloor: 0.34,
    shadowCenter: { x: 0, y: 2, z: -16 }, shadowExtent: 34,
    fog: [0.02, 0.022, 0.03], fogNear: 26, fogFar: 80,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.95
  };
  // The cave's light: its lava's, and each path's rockfall's; and what lava does to whoever stands in it, every `LAVA_S`.
  const SHARD_TINT = [0.95, 0.45, 1.35], LAVA_TINT = [1.9, 0.62, 0.16], PATH_TINTS = [[1.7, 0.7, 0.2], [0.3, 1.3, 1.15], [1.0, 0.55, 1.6]], LAVA_K = { S: { blow: 1, name: "The lava" } }, LAVA_S = 0.8;
  const LAVA_BITS = ["#ff8a1e", "#ffb347", "#ff5a1a"].map((c) => BL.models.particleGeometry(c, 0.16, 1));
  const INDOOR = { direct: 0.05, ambient: 0.4 }, TOWER = { direct: 0.45, ambient: 0.3 }, ROOFTOP = { direct: 0.5, ambient: 0.32 }, TORCH = 0.75;
  // The halls stand about the great door's wall line; the yard's castle stands this far along z from it.
  const YARD_SHIFT = -(BL.keepLayout.KEEP.front - 0.4);
  const NO_ACTORS = [];
  // How far a lamp in another room is held back behind the ones in the visitor's own.
  const ELSEWHERE = 14;

  let renderer, canvas, game, world, go, root, camera, hud, hooks, input, pilot, fx;
  let people = null, avatar = null, playerWorld = null, scene = null, leaving = false, unsubscribeAccount = null, remotes = null, footsteps = null;
  let here = null, shown = null, audio = null;
  const targets = [];

  const mayPossess = (cave) => BL.net.mayDrive(cave.traits.name);
  // Where the dungeon's ogre stands guard: its middle, facing the stair's foot.
  const OGRE_POST = { x: KC.x + 1.5, z: KC.z + 2.5, y: L.LEVELS.under.floor, yaw: L.STAIR.start + Math.PI / 2 };
  // The green skeleton keeps the dungeon with the ogre, across the floor from it, facing the stair's foot as it does.
  const GREEN_POST = { x: KC.x - 3, z: KC.z + 1, y: L.LEVELS.under.floor, yaw: L.STAIR.start + Math.PI / 2 };
  const GREEN_TIP = "The dungeon's green skeleton · twice as hard to bring down";
  const leaveTo = (id, place) => {
    if (leaving) return;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    if (id === "keep") BL.keepAudio.music.handoff();
    leaving = go(id, place);
    if (leaving && id === "keep") BL.keepLink.handoff();
  };
  const accountChanged = () => {
    if (!avatar) return;
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    if (denied && people.player === avatar) { pilot.release(true); hud.toast(denied); leaveTo("keep", "door"); }
  };

  // The rune wheel's picture on a quad facing +z, a metre across, its outside cut away round it; made once a page.
  // The wheel keeps inside the stair, so the way up through each ceiling stays open.
  const WHEEL = 2 * (L.STAIR.r0 - 0.5), WHEEL_TURN = 0.045;
  // The hearth's fire: a clump of flames of their own sizes, each flickering on its own, and sparks flying up off it.
  const HEARTH_FIRE = [[0, 0.15, 0, 1.55], [-0.45, 0.05, 0.1, 1.05], [0.5, 0.05, -0.05, 1.1], [-0.15, 0.3, -0.2, 0.85], [0.2, 0, 0.25, 0.8], [0.75, 0, 0.15, 0.55], [-0.8, 0, -0.05, 0.6]];
  // The purple and pink dust rising off the crystal in Shards' chamber and caves, a mote every `every` seconds.
  const SHARD_DUST = { every: 0.06, bits: ["#c77dff", "#ff6ad5", "#e0aaff", "#ff9de6", "#9d4edd"].map((c) => BL.models.particleGeometry(c, 0.07, 1)) };
  const BREW_DUST = ["#ffb347", "#ff8a1e", "#ffd27a", "#ff9d3a"].map((c) => BL.models.particleGeometry(c, 0.05, 1));
  let wheelGeometry = null;
  const runeWheel = () => {
    if (wheelGeometry) return wheelGeometry;
    const art = BL.keepArt.vegvisir, image = new Image();
    image.src = art.src;
    const g = BL.models.panel({ tilesX: 1, tilesY: 1, color: "#000000" });
    g.castShadow = false;
    g.imageSurface = { asset: { width: art.width, height: art.height, load: () => image }, rect: [-0.5, -0.5, 1, 1], cutout: true, bright: 0.35 };
    return wheelGeometry = g;
  };
  // The cauldron's brew: its bubbles (`BUBBLES`, `brewLife`), about its rim `RIM` out.
  const BUBBLES = 14, RIM = 1.5, BREW_Y = 0.92;
  const brewLife = (s, dt) => {
    for (let i = 0; i < s.bubbles.length; i++) {
      const b = s.bubbles[i], n = b.n;
      b.t += dt;
      if (b.t >= b.life) {
        // A fresh one wells up somewhere on the brew.
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (RIM - 0.25);
        b.x = KC.x + Math.cos(a) * r; b.z = KC.z + Math.sin(a) * r; b.t = 0; b.life = 0.35 + Math.random() * 0.6; b.size = 0.06 + Math.random() * 0.12;
      }
      const k = b.t / b.life, grow = b.size * (0.3 + 0.9 * k);
      n.visible = k < 0.96; n.position.x = b.x; n.position.z = b.z; n.position.y = UPF + BREW_Y + grow * 0.35;
      n.scale.x = n.scale.z = grow; n.scale.y = grow * 0.7;
    }
  };
  const swingLanterns = (list, t) => { for (let i = 0; i < list.length; i++) { const n = list[i]; n.rotation.z = Math.sin(t * 0.8 + n.phase) * 0.14; n.rotation.x = Math.sin(t * 0.55 + n.phase * 1.7) * 0.09; } };

  // ---------- the halls for a visit ----------
  const build = () => {
    const s = { lamps: [], order: null, flames: [], crows: [], pendulums: [], wheels: [], swingers: [], foes: null, beam: null, lava: 0, brewDust: 0, shardDust: 0, sparkAt: 0, bubbles: [], portal: null, seats: [], candles: null, candleNodes: [], outside: null };
    addChild(root, createNode({ geometry: HM.halls() }), createNode({ geometry: HM.liner() }), createNode({ geometry: HM.floors() }));
    // Outpost Island's towers' insides are drawn only while the visitor is in one (`s.outposts`).
    s.outposts = [];
    for (const t of L.TOWERS) {
      const inside = createNode({ geometry: HM.towerInside(t.tall ? 1 : 0)(), position: { x: t.x, y: 0, z: t.z } }), liner = createNode({ geometry: HM.towerLiner(t.tall ? 1 : 0), position: { x: t.x, y: 0, z: t.z } });
      addChild(root, inside, liner);
      if (t.outpost) s.outposts.push({ t, nodes: [inside, liner] });
    }
    // The volcano's cave: its rock, the night at its mouth, and the light of its lava, of the fire in the cracks of
    // its way in, and of whatever lies past each path's rockfall.
    {
      const C = L.CAVE, P = C.path, far = P.from + P.len - 1.6;
      addChild(root, createNode({ geometry: HM.cave() }), createNode({ geometry: BL.models.box({ w: 0.1, h: 8, d: 11, color: "#0b1226", emissive: 0.5 }), position: { x: C.x + C.grid.x0 + 0.7, y: 3.2, z: C.z }, sightHidden: true }));
      lamp(s, C.x + C.lava.at, -C.entry.drop + 1.6, C.z + C.lava.z, 24, LAVA_TINT);
      lamp(s, C.x + C.lava.at - 5, -C.entry.drop + 1.2, C.z + C.lava.z - 1, 14, LAVA_TINT);
      lamp(s, C.x + 12, -2.5, C.z, 13, LAVA_TINT);
      lamp(s, C.x + 1.5, 3, C.z, 10, [0.35, 0.45, 0.8]);
      C.paths.forEach((a, i) => lamp(s, C.x + C.chamber.at + Math.cos(a) * far, -C.entry.drop + 2.4, C.z + Math.sin(a) * far, 10, PATH_TINTS[i]));
    }
    // Shards' caves: their amethyst, the night at their mouth, the crystal standing in the chamber and in each cave
    // where the renderer draws glass, and its glow; the torches down each tunnel are lamps (keep-halls-models.js).
    {
      const C = L.SHARDS_CAVE, H = C.chamber, deep = -C.entry.drop, far = H.r + C.tunnel.len + C.room.r - 1;
      addChild(root, createNode({ geometry: HM.shardsCave() }), createNode({ geometry: BL.models.box({ w: 0.1, h: 8, d: 7, color: "#0b1226", emissive: 0.5 }), position: { x: C.x + C.grid.x0 + 0.7, y: 3, z: C.z }, sightHidden: true }));
      if (renderer.kind === "webgl2") addChild(root, createNode({ geometry: HM.shardsCaveCrystals(), sightHidden: true }));
      lamp(s, C.x + H.at, deep + 3, C.z, 14, SHARD_TINT);
      s.shardSites = [[C.x + H.at, C.z], ...C.tunnels.map((a) => [C.x + H.at + Math.cos(a) * far, C.z + Math.sin(a) * far])];
      C.tunnels.forEach((a) => lamp(s, C.x + H.at + Math.cos(a) * far, deep + 2.5, C.z + Math.sin(a) * far, 9, SHARD_TINT));
    }
    // What each door shows of the yard outside.
    addChild(root, createNode({ geometry: HM.glimpse(4), position: { x: 0, y: 0, z: 2.2 }, rotation: { x: 0, y: Math.PI, z: 0 }, sightHidden: true }));
    for (const t of L.TOWERS) addChild(root, createNode({ geometry: HM.glimpse(3), position: { x: t.x, y: 0, z: t.z + L.RO + 1.8 }, rotation: { x: 0, y: Math.PI, z: 0 }, sightHidden: true }));
    // The furniture.
    for (const p of L.PROPS) {
      const g = HM.prop(p);
      if (g) addChild(root, createNode({ geometry: g, position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: p.turn, z: 0 } }));
      // The kit's barrels (keep-models.js `kit`) are poked as the yard's are.
      const c = KM.kit(p.k);
      if (c) for (let i = 0, P = c.picks, cs = Math.cos(p.turn), sn = Math.sin(p.turn); i < P.length; i += 6) {
        const node = createNode({ position: { x: p.x + P[i + 2] * cs + P[i + 4] * sn, y: p.y + P[i + 3], z: p.z - P[i + 2] * sn + P[i + 4] * cs } });
        BL.scene.updateWorld(node);
        input.add(node, { kind: "keep-piece", piece: P[i], next: 0 }, { radius: Math.max(0.35, P[i + 5]) });
        targets.push(node);
      }
    }
    // The top level's guardians, the yard's knights at life size on the floor itself, the glow behind their visors
    // orange; and the armory's suits of the same plate, smaller and empty, each on its base.
    const knight = KM.knight();
    s.capes = [];
    for (const p of L.PROPS) if (p.k === "guardian" || p.k === "armorStand") {
      const k = p.s || 1, body = createNode({ geometry: knight.body, position: { x: p.x, y: p.y + (p.s ? 0.12 : 0), z: p.z }, rotation: { x: 0, y: p.turn, z: 0 }, scale: { x: k, y: k, z: k } });
      if (p.k === "guardian") addChild(body, createNode({ geometry: knight.eyes[1], sightHidden: true }));
      BL.keepCapes.hang(body, s.capes);
      addChild(root, body);
    }
    // The seats, as the crew sits its player in one: the stand-up spot a pace in front of each.
    for (const q of L.SEATS) s.seats.push({ kind: "chair", x: q.x, y: q.y, z: q.z, floor: q.floor, ry: q.ry, ground: false, sitter: null, walkAt: q.walk || { x: q.x + Math.sin(q.ry) * 1.0, z: q.z + Math.cos(q.ry) * 1.0 } });
    // The candles floating in a ring over the lounge, each at its own height and bob.
    s.candles = createNode({ position: { x: CANDLES.at.x, y: CANDLES.y, z: CANDLES.at.z } });
    for (let k = 0; k < CANDLES.n; k++) {
      const a = k / CANDLES.n * TAU, node = createNode({ geometry: HM.floatCandle(), position: { x: Math.sin(a) * CANDLES.r, y: 0, z: Math.cos(a) * CANDLES.r }, sightHidden: true });
      addChild(s.candles, node);
      s.candleNodes.push({ node, lift: Math.sin(k * 2.7) * 0.35, phase: k * 1.37 });
    }
    addChild(root, s.candles);
    // Over the great door on the lounge's side, the sign for the way out to the yard (keep-models.js `wordSign`).
    addChild(root, createNode({ geometry: KM.wordSign("COURTYARD", 0.8), position: { x: KC.x, y: 6.2, z: KC.z + L.R - 0.12 }, rotation: { x: 0, y: Math.PI, z: 0 } }));
    // From the rooftop, the castle all round it and its land, as the yard stands them; the keep's top half is the
    // rooftop's own parapet and corner spires.
    s.outside = createNode({ position: { x: 0, y: 0, z: YARD_SHIFT }, visible: false });
    for (const p of KM.castleParts(renderer.kind !== "canvas2d")) {
      if (p.tag === "keep-body" || p.tag === "outpost" || p.tag === "outpost-tower") continue;
      const node = createNode({ geometry: p.geometry, position: { x: p.x, y: p.y, z: p.z + (p.tag === "keep-top" ? YARD_SHIFT : 0) }, rotation: { x: 0, y: p.ry, z: 0 }, sightHidden: true });
      if (p.scale) node.scale.x = node.scale.y = node.scale.z = p.scale;
      addChild(p.tag === "keep-top" ? root : s.outside, node);
    }
    addChild(root, s.outside);
    // The spires' flags, as the yard flies them.
    s.flags = [];
    BL.keepFlags.plant(s.outside, root, YARD_SHIFT, s.flags);
    // The lanterns hung under the keep's balconies, and the torches round them, out past its arches.
    // Over the cauldron a faint green beam stands from the brew to the ceiling, two crossed sheets of light turning.
    s.beam = createNode({ position: { x: KC.x, y: UPF + 0.98, z: KC.z } });
    for (const ry of [0, Math.PI / 2]) {
      const sheet = createNode({ geometry: KM.greenBeam(), rotation: { x: 0, y: ry, z: 0 }, scale: { x: 6.5, y: L.ROOM.alchemy.ceil - UPF - 1, z: 1 }, sightHidden: true });
      sheet.smokeOpacity = 0.4;
      addChild(s.beam, sheet);
    }
    addChild(root, s.beam);
    s.brewDust = 0;
    // The brew bubbling: bubbles welling up out of it, swelling and bursting, each a node of a fixed pool.
    s.bubbles = [];
    for (let i = 0; i < BUBBLES; i++) { const n = createNode({ geometry: KM.brewBubble(), visible: false, sightHidden: true }); addChild(root, n); s.bubbles.push({ n, x: 0, z: 0, t: 1, life: 1, size: 1 }); }
    s.swingers = [];
    BL.keepLanterns.hang(s.outside, s.swingers, (x, y, z) => lamp(s, x, y, z + YARD_SHIFT, 12, [1.35, 0.82, 0.36]), true);
    // The rune wheel (keep-art-data.js `vegvisir`) across the whole ceiling of every level, the top one's too, turning
    // slowly.
    s.wheels = [];
    const wheel = runeWheel();
    for (const id of ["dungeon", "lounge", "armory", "alchemy", "roof"]) {
      const r = L.ROOM[id], pivot = createNode({ position: { x: KC.x, y: r.ceil - 0.04, z: KC.z } });
      addChild(pivot, createNode({ geometry: wheel, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: { x: WHEEL, y: WHEEL, z: WHEEL }, sightHidden: true }));
      addChild(root, pivot);
      s.wheels.push(pivot);
    }
    const blaze = BL.blaze.smooth();
    for (const [x, y, z] of BL.keepLayout.TORCHES) {
      const node = createNode({ geometry: blaze, position: { x, y: y + 0.08, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(s.outside, node);
      s.flames.push({ node, base: TORCH, phase: s.flames.length * 1.3 });
      lamp(s, x, y + 0.7, z + YARD_SHIFT, 9, [1.35, 0.82, 0.36]);
    }
    // The towers' rooms.
    for (const t of L.TOWERS) for (const [k, x, z, turnBy] of t.props) {
      const at = { x: t.x + x, y: t.top, z: t.z + z };
      if (k === "portal") {
        const BM = BL.bifrostModels, S = 0.6, field = BM.entryField(), node = createNode({ position: at, rotation: { x: 0, y: turnBy, z: 0 }, scale: { x: S, y: S, z: S } });
        addChild(node, createNode({ geometry: BM.archStone() }), createNode({ geometry: BM.archGlow(), sightHidden: true }),
          createNode({ geometry: field.sheet, position: { x: 0, y: 0, z: 0.25 }, sightHidden: true }), createNode({ geometry: field.sparkles, position: { x: 0, y: 0, z: 0.3 }, sightHidden: true }));
        addChild(root, node);
        input.add(node.children[0], { kind: "keep-portal" }, { radius: 2.4 });
        targets.push(node.children[0]);
        s.portal = { x: at.x, z: at.z, turn: turnBy, y: t.top };
        lamp(s, at.x - Math.sin(turnBy) * 1.2, at.y + 1.6, at.z - Math.cos(turnBy) * 1.2, 7, [0.3, 0.55, 1.1], null);
        continue;
      }
      addChild(root, createNode({ geometry: HM.prop({ k, x, z, turn: turnBy }), position: at, rotation: { x: 0, y: turnBy, z: 0 } }));
      if (k === "perch") for (const [ox, oy] of [[-0.5, 1.95], [0.45, 1.95], [0.1, 1.35]]) {
        const node = createNode({ geometry: KM.crow(0), position: { x: at.x + Math.cos(turnBy) * ox, y: at.y + oy + 0.07, z: at.z - Math.sin(turnBy) * ox }, rotation: { x: 0, y: turnBy + ox * 2, z: 0 }, scale: { x: 0.75, y: 0.75, z: 0.75 }, sightHidden: true });
        addChild(root, node);
        s.crows.push({ node, phase: s.crows.length * 2.7 });
      }
      if (k === "clockFace") {
        const pend = createNode({ geometry: HM.prop({ k: "pendulum", x: 0, z: 0 }), position: { x: at.x - Math.sin(turnBy) * 0.1, y: at.y + 1.35, z: at.z - Math.cos(turnBy) * 0.1 }, rotation: { x: 0, y: turnBy, z: 0 } });
        addChild(root, pend);
        s.pendulums.push(pend);
      }
    }
    // The lamps: a torch on its wall, a hearth's or a brazier's fire, or a light already in its furniture.
    const flameGeometry = BL.blaze.smooth();
    for (const [x, y, z, reach, tint, turnBy, holder] of HM.lamps()) {
      if (holder === "torch") {
        const node = createNode({ geometry: HM.torch(), position: { x, y: y - HM.FLAME.y, z }, rotation: { x: 0, y: turnBy, z: 0 } });
        const flame = createNode({ geometry: flameGeometry, position: { x: HM.FLAME.x, y: HM.FLAME.y, z: HM.FLAME.z }, scale: { x: HM.FLAME.s, y: HM.FLAME.s, z: HM.FLAME.s }, sightHidden: true });
        addChild(node, flame);
        addChild(root, node);
        s.flames.push({ node: flame, base: HM.FLAME.s, phase: s.flames.length * 1.3 });
        const fx0 = x + Math.sin(turnBy) * HM.FLAME.z, fz0 = z + Math.cos(turnBy) * HM.FLAME.z;
        lamp(s, fx0, y + 0.2, fz0, reach, tint, null);
      } else lamp(s, x, y, z, reach, tint, null);
    }
    // The hearth's fire, the alchemy cauldron's and the rooftop's firepit.
    for (const [x, y, z, k] of [...HEARTH_FIRE.map(([dx, dy, dz, k]) => [dx, 0.1 + dy, L.HEARTH_AT.z + 0.4 + dz, k]), [KC.x, UPF + 0.05, KC.z, 1.4], [L.FIRE_AT.x, L.ROOF + 0.35, L.FIRE_AT.z, 3.0]]) addFlame(s, flameGeometry, x, y, z, k);
    const guard = L.TOWERS.find((t) => t.id === "battlements");
    addFlame(s, flameGeometry, guard.x, guard.top + 1.0, guard.z, 1.1);
    s.order = new Int16Array(s.lamps.length);
    for (let i = 0; i < s.order.length; i++) s.order[i] = i;
    return s;
  };
  const addFlame = (s, geometry, x, y, z, k) => {
    const node = createNode({ geometry, position: { x, y, z }, scale: { x: k, y: k, z: k }, sightHidden: true });
    addChild(root, node);
    s.flames.push({ node, base: k, phase: s.flames.length * 1.3 });
  };
  const lamp = (s, x, y, z, reach, tint) => {
    s.lamps.push({ x, y, z, reach, tint, place: L.placeAt(x, z, y - 2), key: 0, phase: s.lamps.length * 1.7 });
  };

  // The lights this frame: the visitor's own room's first, then the nearest elsewhere, as many as the tier draws.
  const lightUp = (s, elapsed, px, py, pz) => {
    const lamps = s.lamps, order = s.order, L8 = RENDER_OPTS.lights;
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i]; l.key = Math.hypot(l.x - px, (l.y - py) * 1.5, l.z - pz) + (l.place === here ? 0 : ELSEWHERE); }
    for (let i = 1; i < order.length; i++) {
      const v = order[i], key = lamps[v].key;
      let j = i - 1;
      while (j >= 0 && lamps[order[j]].key > key) { order[j + 1] = order[j]; j--; }
      order[j + 1] = v;
    }
    let n = 0;
    for (let i = 0; i < order.length && n < BL.glRenderer.POINT_LIGHT_CAPACITY; i++) {
      const l = lamps[order[i]];
      if (l.key > 60) break;
      const k = 0.9 + Math.sin(elapsed * 9.3 + l.phase) * 0.06 + Math.sin(elapsed * 23.7 + l.phase * 3.1) * 0.04, o = n++ * 8;
      L8[o] = l.x; L8[o + 1] = l.y; L8[o + 2] = l.z; L8[o + 3] = l.reach; L8[o + 4] = l.tint[0] * k; L8[o + 5] = l.tint[1] * k; L8[o + 6] = l.tint[2] * k; L8[o + 7] = 0;
    }
    RENDER_OPTS.lightCount = n;
  };

  // The free seat a body at (x, z) with its feet at `feet` stands beside, or null.
  let actPrompt = "";
  const seatNear = (x, z, feet) => {
    let best = null, reach = SEAT_REACH;
    for (const seat of scene.seats) {
      const d = Math.hypot(seat.x - x, seat.z - z);
      if (!seat.sitter && Math.abs(feet - seat.floor) < 0.4 && d < reach) { best = seat; reach = d; }
    }
    return best;
  };
  const useNear = (x, z, reach, feet) => { const seat = seatNear(x, z, feet); return !!seat && people.sitPlayer(seat); };
  const groundFor = (x, z, feet) => L.supportAt(x, z, feet);
  const walkableFor = (ax, az, bx, bz, y, height, actor) => {
    const r = actor.bodyRadius || 0.35, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, f = L.supportAt(x, z, y);
      if (f < y - L.STEP || !L.clearAt(x, z, f, r, height)) return false;
    }
    return true;
  };
  const flyableFor = (ax, az, bx, bz, y, height, actor) => {
    const r = actor.bodyRadius || 0.35, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
    for (let i = 1; i <= n; i++) if (!L.clearAt(ax + (bx - ax) * i / n, az + (bz - az) * i / n, y, r, height, true)) return false;
    return true;
  };
  const ceilingFor = (x, z, feet) => L.ceilingAt(x, z, feet);
  // The camera keeps to the air: from the Ooga's head toward where the view would have it, it stops short of the first
  // stone it meets.
  const HEAD = { x: 0, y: 0, z: 0 };
  const clampTarget = (p) => { p.y = clamp(p.y, -14, 60); };
  const clampCamera = (p) => {
    const a = avatar && avatar.root.position;
    if (!a) return false;
    HEAD.x = a.x; HEAD.y = a.y - avatar.baseY + avatar.bodyHeight * 0.85; HEAD.z = a.z;
    if (!L.airAt(HEAD.x, HEAD.y, HEAD.z)) return false;
    const dx = p.x - HEAD.x, dy = p.y - HEAD.y, dz = p.z - HEAD.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-6) return false;
    const steps = Math.ceil(d / 0.1);
    let free = d;
    for (let i = 1; i <= steps; i++) {
      const t = Math.min(d, i * 0.1);
      if (!L.airAt(HEAD.x + dx / d * t, HEAD.y + dy / d * t, HEAD.z + dz / d * t)) { free = Math.max(0, t - 0.3); break; }
    }
    if (free >= d - 1e-6) return false;
    p.x = HEAD.x + dx / d * free; p.y = HEAD.y + dy / d * free; p.z = HEAD.z + dz / d * free;
    return true;
  };
  const stoodAt = (ctx) => {
    const spot = ctx.from === null && !ctx.place ? BL.visitSpot.take("keephalls", "") : null;
    return spot && Math.abs(L.supportAt(spot.x, spot.z, spot.y) - spot.y) < 0.05 && BL.visitSpot.holds(spot, walkableFor, avatar) ? spot : null;
  };
  // The jetpack, owned and worn everywhere in the Keep, J taking it off and putting it on.
  const JETPACK_HUD = { owned: false, equipped: false, fuel: 1, blocked: false };
  const jetpackStatus = (cave) => {
    JETPACK_HUD.owned = !!cave?.jetpackOwned; JETPACK_HUD.equipped = !!cave?.jet; JETPACK_HUD.fuel = cave?.jetFuel ?? 1; JETPACK_HUD.blocked = false;
    return JETPACK_HUD;
  };
  const toggleJetpack = () => {
    const cave = people && people.player;
    if (!cave || !cave.jetpackOwned || leaving) return false;
    if (cave.jet) { people.removeJetpack(cave); hud.toast("Jetpack off"); }
    else if (people.wearJetpack(cave, BL.hubModels.jetpack(), BL.hubModels.jetFlame())) hud.toast("Jetpack!");
    else return false;
    pilot.showAct();
    return true;
  };
  const arrivalFor = (place) => {
    // Flown onto the rooftop from the yard: there, as it came down.
    if (place === "drop" && world.keepDrop) { const d = world.keepDrop; world.keepDrop = null; return d; }
    // In at the volcano's cave mouth.
    if (place === "cave") return { ...L.CAVE.arrive, y: L.supportAt(L.CAVE.arrive.x, L.CAVE.arrive.z, 1) };
    // Down the trench into Shards' caves.
    if (place === "shards") return { ...L.SHARDS_CAVE.arrive, y: L.supportAt(L.SHARDS_CAVE.arrive.x, L.SHARDS_CAVE.arrive.z, 1) };
    const top = /^towertop-(\d+)$/.exec(place || "");
    if (top && L.TOWERS[+top[1]]) return L.towerTopArrive(L.TOWERS[+top[1]]);
    const m = /^tower-(\d+)$/.exec(place || "");
    return m && L.TOWERS[+m[1]] ? L.towerArrive(L.TOWERS[+m[1]]) : L.ARRIVE;
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go } = ctx);
    canvas = ctx.canvas;
    camera = createCamera({ fov: 58, near: 0.15, far: 140 });
    root = createNode();
    hud = BL.hud.create({ signal: ctx.signal, roster: BL.contributors.activeRoster });
    BL.keepHealth.show(world);
    // The land's object stays connected inside the keep and is told the page is here (scene-keep.js `keepLink`), so
    // what has been opened outside is kept; the state it sends is kept for the yard to load on the way back out.
    BL.keepLink.open((msg) => { world.keepState = msg.s; });
    BL.keepQuests.book.show((on) => { if (pilot) pilot.setMenuOpen(on); });
    hooks = {};
    input = BL.interact.create({ canvas, renderer, camera, hooks });
    pilot = BL.pilot.create({
      carry: true,
      // Tab opens the weapon wheel, the mouse left captured (scene-keep.js `BL.keepArms.wheel`).
      tabKey: () => BL.keepArms.wheel(),
      renderer, canvas, camera, hud, presets: PRESETS, landing: "lounge", pitch: PITCH, dist: DIST,
      follow: FOLLOW, clampTarget, clampCamera, ceilingAt: () => 60, coarse: COARSE, mayPossess, jetpackStatus,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 3.5, orbitDist: 4.5, maxStep: 0.6, groundAt: groundFor }
    });
    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit && hit.owner.kind === "keep-portal") hud.tooltip.show("₿IFRÖST · the way back", p.x, p.y);
        else if (hit && hit.owner.kind === BL.keepFoes.OGRE.kind) hud.tooltip.show(BL.keepFoes.OGRE.tip, p.x, p.y);
        else if (hit && hit.owner.kind === BL.keepFoes.GREEN_SKEL.kind) hud.tooltip.show(GREEN_TIP, p.x, p.y);
        else if (hit && hit.owner.kind === "keep-piece") hud.tooltip.show(hit.owner.piece === "crate" ? "Crate" : "Barrel", p.x, p.y);
        else hud.tooltip.hide();
      },
      onTap: (hit) => {
        if (hit && hit.owner.kind === "keep-portal") hud.toast("Walk into the portal to go back to ₿IFRÖST");
        else if (hit && hit.owner.kind === "keep-piece") hud.toast(["Sloshes. Something strong, by the smell.", "Full to the bung."][hit.owner.next++ % 2]);
      },
      ...pilot.hooks
    });
    hud.setDestinations(Object.keys(VIEW_NAMES), VIEW_NAMES);
    hud.setAreaLabel("Valhodl");
    hud.el.modeDestination.title = "Valhodl · choose a room in the keep";
    hud.el.modeDestinationLabel.textContent = "The keep's rooms in Valhodl. Open Map to choose a view";
    const presetView = (name) => {
      if (leaving || !VIEW_NAMES[name]) return false;
      pilot.goPreset(name);
      hud.setDetachedView(name, true);
      return true;
    };
    hud.onPreset(presetView);
    hud.onAction((action, value) => {
      if (action === "leave") leaveTo("keep", "door");
      else if (action === "reset-view") pilot.resetCamera();
      else if (action === "act") pilot.action();
      else if (action === "jetpack-toggle") toggleJetpack();
      else if (action === "mode-preset") return presetView(value);
      else if (!leaving && action.startsWith("mode-")) pilot.modeAction(action);
    });
    fx = BL.fx.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 4, z: -10 } });
    scene = build();

    const roster = BL.contributors.roster;
    const asked = ctx.from === null ? new URLSearchParams(location.search).get("character")?.trim().toLowerCase() : null;
    const named = asked ? roster.find((c) => c.name.toLowerCase() === asked) : null, assigned = BL.net.preferredCharacter();
    // While the land is being built, a debug page with no `character=` plays rules-without-rulers (`TEST_PLAYER`).
    const testing = ctx.from === null && new URLSearchParams(location.search).get("debug") === "1" ? roster.find((c) => c.name === TEST_PLAYER) : null;
    const picked = named || world.pilot && roster.find((c) => c.name === world.pilot) || testing || assigned && roster.find((c) => c.name === assigned.handle) || null;
    const playerName = picked && !BL.net.mayDrive(picked.name) ? picked.name : null;
    world.pilot = null;
    if (playerName) {
      playerWorld = { level: 0, weapons: world.weapons, magazine: world.magazine };
      const shared = { root, input, hud, game, world: playerWorld, playerName, weaponsEnabled: true, fx, onSwing: (cave, charge, step) => scene && scene.foes && scene.foes.swung(cave, charge, step), onCast: (cave, charge) => scene && scene.foes && scene.foes.cast(cave, charge, shared.aimTarget), onSpell: (cave, phase, lead) => scene && scene.foes && scene.foes.spell(cave, phase, lead), viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT,
        groundAt: groundFor, walkable: walkableFor, flyable: flyableFor, ceilingAt: ceilingFor, jetpackAllowed: () => true, useNear };
      people = shared.crew = BL.crew.create(shared);
      world.weapons = playerWorld.weapons;
      world.magazine = playerWorld.magazine;
      pilot.bind(shared);
      avatar = people.cavemen.get(playerName);
      const at = arrivalFor(ctx.place);
      Object.assign(avatar.root.position, { x: at.x, y: avatar.baseY + (at.y || 0), z: at.z });
      avatar.root.rotation.y = at.yaw;
      people.setJetpackOwnership(avatar, true, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      people.wearJetpack(avatar, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      pilot.arrive(avatar);
      people.parkWeapons(avatar);
      BL.keepArms.bind(people, avatar, () => pilot && pilot.refreshCombat(), () => audio, (m) => hud && hud.toast(m));
      pilot.refreshCombat();
      const stood = stoodAt(ctx);
      if (stood) pilot.navigate({ position: stood, yaw: stood.yaw - Math.PI, pitch: 0.2, dist: 4.5 });
      else pilot.navigate({ position: { x: at.x, y: at.y || 0, z: at.z }, yaw: at.yaw - Math.PI, pitch: 0.2, dist: 4.5 });
    }
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    remotes = BL.remotePlayers.create({ root, crew: people, fx, unarmed: true, visible: (rec) => ZM.keepPlace(rec.zone) === "byzantine-keep.halls" });
    footsteps = BL.footsteps.create();
    // The ogre in the dungeon (scene-keep.js `BL.keepFoes`), after whoever comes down to it, and back by its post when
    // they go up again. Struck down to no health, the visitor wakes on the islet.
    audio = BL.keepAudio.create();
    scene.foes = BL.keepFoes.create({
      root, input, targets, fx, renderer, audio: () => audio, crew: () => people, leaving: () => leaving, step: L.STEP,
      walk: (ax, az, bx, bz, feet, r, tall) => {
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.2));
        for (let i = 1; i <= n; i++) {
          const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n, f = L.supportAt(x, z, feet);
          if (f > feet + L.STEP || f < feet - 1.3 || !L.clearAt(x, z, f, r, tall)) return false;
        }
        return true;
      },
      ground: (x, z, feet) => L.supportAt(x, z, feet),
      air: (ax, az, bx, bz, y) => L.airAt(bx, y, bz),
      chase: (k, p, feet) => !(here && here.n) && feet < L.LEVELS.ground.floor - 1.5 && Math.hypot(p.x - KC.x, p.z - KC.z) < L.R,
      down: (cave, k) => { BL.keepHealth.fill(); world.keepFerry = null; hud.toast(k.S.name + " struck you down. You wake on the islet."); leaveTo("keep", "islet"); }
    });
    scene.foes.add({ ...BL.keepFoes.OGRE, post: OGRE_POST });
    scene.foes.add({ ...BL.keepFoes.GREEN_SKEL, chase: "dungeon", tip: GREEN_TIP, post: GREEN_POST });
    here = shown = null;
    leaving = false; actPrompt = "";
    lightUp(scene, 0, 0, 0, -4);

    hallsScene.root = root;
    hallsScene.camera = camera;
    hallsScene.input = input;
    hallsScene.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null,
      halls: { get scene() { return scene; }, get avatar() { return avatar; }, get here() { return here; }, layout: L }
    };
  };

  const update = (dt, elapsed) => {
    const s = scene;
    // The walls' music, carried on from the yard (keep-audio.js `music`), all through the keep.
    if (!leaving) BL.keepAudio.music.play(here && here.cave ? null : "land");
    if (s.foes) s.foes.unshake(camera);
    if (s.foes) s.foes.undarken(RENDER_OPTS);
    BL.keepLink.here(dt);
    pilot.readInput(dt);
    if (people) people.update(dt, elapsed);
    pilot.update(dt);
    const drivenHere = people && people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) {
      // The towers' and the cave's insides lie far past the room's bounds on a position: each is reported from the
      // middle of its own area, under that area's zone (zone-map.js `frameZone`), and other pages add the middle back.
      const p = drivenHere.root.position, zone = ZM.frameZone("keep-halls", p.x, p.z, BL.net.state.zone), at = ZM.originOf(zone);
      BL.net.setZone(zone);
      BL.net.sendPose(p.x - at.x, p.y - drivenHere.baseY, p.z - at.z, drivenHere.root.rotation.y, null, 0, BL.crew.weaponFlags(drivenHere), BL.crew.visualState(drivenHere));
      BL.keepHealth.report();
      BL.keepHealth.tick(dt);
      if (!leaving) BL.visitSpot.note("keephalls", "", drivenHere);
    }
    remotes.update(dt);
    footsteps.update(drivenHere);

    const who = drivenHere ? drivenHere.root.position : pilot.orbit.target, feet = drivenHere ? who.y - drivenHere.baseY : who.y;
    here = L.placeAt(who.x, who.z, feet);
    for (let i = 0; i < s.outposts.length; i++) { const o = s.outposts[i], on = here === o.t; if (o.nodes[0].visible !== on) o.nodes[0].visible = o.nodes[1].visible = on; }
    // Each level's name as the visitor comes to it, under the header where the islands are named (scene-keep.js
    // `BL.keepArea`); a tower's room as a hint.
    if (here !== shown) {
      shown = here;
      if (here && here.name && !here.n) BL.keepArea.show(here.name);
      else if (here && here.name) hud.hint(here.name, 2200);
    }
    // On the rooftop the moon is overhead and the castle stands all round; up a tower its light comes in at the windows;
    // inside the keep it reaches nothing.
    const inTower = !!(here && here.n), inCave = !!(here && here.cave), onRoof = !!(here && here.id === "roof"), want = onRoof || !here ? ROOFTOP : inTower ? TOWER : INDOOR;
    RENDER_OPTS.directStrength += (want.direct - RENDER_OPTS.directStrength) * Math.min(1, dt * 3);
    RENDER_OPTS.ambientFloor += (want.ambient - RENDER_OPTS.ambientFloor) * Math.min(1, dt * 3);
    // The yard is seen from the rooftop and through the lounge's and the alchemy room's open windows.
    s.outside.visible = !inTower && !inCave && feet > L.LEVELS.ground.floor - 1;
    RENDER_OPTS.shadowCenter.x = inTower ? here.x : inCave ? who.x : 0; RENDER_OPTS.shadowCenter.y = inTower ? here.top : onRoof ? L.ROOF : feet + 2; RENDER_OPTS.shadowCenter.z = inTower ? here.z : inCave ? who.z : KC.z;
    RENDER_OPTS.shadowExtent = onRoof ? 40 : 34;
    // The candles over the lounge turn slowly in their ring, each bobbing on its own.
    s.candles.rotation.y = elapsed * CANDLES.turn;
    for (let i = 0; i < s.candleNodes.length; i++) { const c = s.candleNodes[i]; c.node.position.y = c.lift + Math.sin(elapsed * 0.9 + c.phase) * 0.18; c.node.glow = 0.85 + Math.sin(elapsed * 11 + c.phase * 3) * 0.15; }
    lightUp(s, elapsed, who.x, feet + 1.5, who.z);
    for (let i = 0; i < s.flames.length; i++) { const f = s.flames[i], k = f.base * (1 + BL.blaze.flare(elapsed, f.phase)); f.node.scale.x = f.node.scale.z = k; f.node.scale.y = k * (1.05 + Math.sin(elapsed * 7 + f.phase) * 0.06); f.node.glow = 1; }
    for (let i = 0; i < s.pendulums.length; i++) s.pendulums[i].rotation.z = Math.sin(elapsed * 2.2) * 0.32;
    // The rune wheels turning slowly on the ceilings, and the balconies' lanterns swinging on their chains.
    for (let i = 0; i < s.wheels.length; i++) s.wheels[i].rotation.y = elapsed * WHEEL_TURN * (i & 1 ? -1 : 1);
    swingLanterns(s.swingers, elapsed);
    BL.keepCapes.stir(s.capes, elapsed);
    BL.keepFlags.stir(s.flags, elapsed);
    s.beam.rotation.y = elapsed * 0.25;
    for (let i = 0; i < s.beam.children.length; i++) s.beam.children[i].smokeOpacity = 0.32 + 0.08 * Math.sin(elapsed * 1.3 + i);
    if (Math.abs(feet - UPF) < 8) brewLife(s, dt);
    if (Math.abs(feet) < 8 && (s.sparkAt -= dt) <= 0) {
      s.sparkAt = 0.07 + Math.random() * 0.12;
      fx.spawnParticle(BREW_DUST[(Math.random() * BREW_DUST.length) | 0], (Math.random() - 0.5) * 1.4, 0.5 + Math.random() * 0.6, L.HEARTH_AT.z + 0.4 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.4, (Math.random() - 0.3) * 0.4, 0.7 + Math.random() * 0.8, 6, -0.3, -100);
    }
    // Purple and pink dust rising off the crystal in Shards' chamber and in each of its caves.
    if (here && (here === L.SHARDS_CAVE || L.SHARDS_CAVE.caves.includes(here)) && (s.shardDust -= dt) <= 0) {
      s.shardDust = SHARD_DUST.every * (0.5 + Math.random());
      const [cx, cz] = s.shardSites[(Math.random() * s.shardSites.length) | 0], a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.6, cs = Math.cos(a), sn = Math.sin(a);
      fx.spawnParticle(SHARD_DUST.bits[(Math.random() * SHARD_DUST.bits.length) | 0], cx + cs * r, -L.SHARDS_CAVE.entry.drop + Math.random() * 3, cz + sn * r, cs * 0.1, 0.5 + Math.random() * 0.5, sn * 0.1, 1.6 + Math.random() * 1.2, 3, -0.4, -100);
    }
    // Orange fairy dust rising off the brew, near enough to see it.
    if (Math.abs(feet - UPF) < 8 && (s.brewDust -= dt) <= 0) {
      s.brewDust = 0.05 + Math.random() * 0.05;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.25;
      fx.spawnParticle(BREW_DUST[(Math.random() * BREW_DUST.length) | 0], KC.x + Math.cos(a) * r, UPF + 0.98, KC.z + Math.sin(a) * r, Math.cos(a) * 0.12, 0.6 + Math.random() * 0.6, Math.sin(a) * 0.12, 1.6 + Math.random() * 1.2, 3, -0.4, -100);
    }
    if (s.foes) s.foes.update(dt, elapsed);
    // Standing in the cave's lava.
    if (drivenHere && !leaving && s.foes && L.lavaAt(who.x, who.z, feet)) {
      if ((s.lava -= dt) <= 0) {
        s.lava = LAVA_S;
        for (let k = 0; k < 8; k++) fx.spawnParticle(LAVA_BITS[k % LAVA_BITS.length], who.x + (Math.random() - 0.5) * 0.6, feet + 0.2, who.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.3, 6, 6, -100);
        s.foes.strike(LAVA_K, drivenHere);
      }
    } else s.lava = 0.12;
    if (s.foes) s.foes.shake(camera);
    if (s.foes) s.foes.darken(RENDER_OPTS);
    if (audio) audio.listen(who.x, who.y, who.z);
    for (let i = 0; i < s.crows.length; i++) { const c = s.crows[i], t = elapsed + c.phase, flap = (t % 9) < 0.9, pose = KM.crow(flap ? (Math.floor(t * 10) & 1 ? 0 : 2) : 1); if (c.node.geometry !== pose) c.node.geometry = pose; }

    // Beside a free seat the act button reads SIT.
    if (drivenHere) {
      const dp = drivenHere.root.position, near = !drivenHere.camp.seat && seatNear(dp.x, dp.z, feet);
      const want = near ? "SIT" : "";
      if (want !== actPrompt) { actPrompt = want; if (want) hud.setAct(want); else pilot.showAct(); }
    }
    if (drivenHere && !leaving) {
      const p = drivenHere.root.position, out = L.exitAt(p.x, p.z, feet);
      // Out past the balconies, or under the lowest, and below the top level's floor: falling into the yard, handed
      // over where it falls. Out on a balcony it is still the halls'.
      const kr = Math.hypot(p.x - KC.x, p.z - KC.z), balcony = kr < BL.keepLayout.BALCONY.outer + 0.3 && feet > BL.keepLayout.BALCONY.floors[0] - 0.6;
      const outside = !(here && (here.n || here.cave)) && kr > L.RW + 0.3 && !balcony && feet < L.ROOF - 0.5 && feet > 0.5;
      if (outside) { world.keepDrop = { x: p.x, y: feet, z: p.z - YARD_SHIFT, yaw: drivenHere.root.rotation.y }; leaveTo("keep", "drop"); }
      else if (out) leaveTo("keep", out);
      else if (s.portal && Math.abs(feet - s.portal.y) < 0.5) {
        // Into the crown chamber's portal: within a metre in front of its field, inside its arch.
        const dx = p.x - s.portal.x, dz = p.z - s.portal.z, front = dx * Math.sin(s.portal.turn) + dz * Math.cos(s.portal.turn), across = dx * Math.cos(s.portal.turn) - dz * Math.sin(s.portal.turn);
        if (front < 1 && front > -0.7 && Math.abs(across) < 1.0) leaveTo("bifrost", null);
      }
      // Nothing should let a body out of the stone, but one that does fall clear is put back where it came in.
      if (feet < DNF - 6) {
        const at = here && here.n ? L.towerArrive(here) : here && here.cave ? here.arrive : L.ARRIVE;
        p.x = at.x; p.z = at.z; p.y = drivenHere.baseY;
      }
    }
    stepTweens(dt);
    fx.update(dt, elapsed);
  };
  const drawExtra = (ctx2d, project) => { remotes.drawNames(ctx2d, project, true); if (scene && scene.foes) scene.foes.drawFlights(ctx2d); };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);
  const onKey = (e) => {
    if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving) return pilot.resetCamera();
    if (BL.controls.matches(e, "view") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving) {
      if (pilot.modeAction("mode-toggle")) { e.preventDefault(); return true; }
    }
    if (BL.controls.matches(e, "jetpack") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return toggleJetpack();
    // 1 to 5 take a weapon in hand as a hotbar's keys do (scene-keep.js).
    if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving && /^Digit[1-5]$/.test(e.code)) return BL.keepArms.key(+e.code.slice(5));
    if (BL.controls.matches(e, "escape")) {
      // Escape frees the cursor or ends a look, never leaves the land or the room: the way out is walking it.
      pilot.escape();
      return true;
    }
    return false;
  };
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
  };
  const stay = () => { leaving = false; };

  const leave = () => {
    if (scene && scene.foes) scene.foes.undarken(RENDER_OPTS);
    if (!leaving) world.pilot = pilot.player ? pilot.player.traits.name : null;
    BL.keepLink.leave();
    unsubscribeAccount();
    unsubscribeAccount = null;
    BL.keepAudio.music.leave();
    BL.net.setBody(null);
    remotes.dispose();
    remotes = null;
    footsteps.dispose();
    footsteps = null;
    BL.keepArms.release();
    if (audio) audio.dispose();
    audio = null;
    if (avatar) people.unparkWeapons(avatar);
    if (people) people.dispose();
    fx.dispose();
    pilot.dispose();
    for (const node of targets) input.remove(node);
    targets.length = 0;
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    BL.keepQuests.book.hide();
    BL.keepWeaponReveal.stop();
    BL.keepArea.hide();
    BL.keepHealth.hide();
    hud.dispose();
    scene = hud = hooks = input = pilot = fx = people = avatar = playerWorld = canvas = here = shown = null;
    hallsScene.input = hallsScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
    if (remotes) remotes.liveGeometry(set);
    if (scene && scene.crows.length) for (let i = 0; i < 3; i++) set.add(KM.crow(i));
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...(remotes ? remotes.stats() : {}) };
  };

  const hallsScene = BL.deferred.scene("keephalls", {
    wipOf: "keep",
    // The yard's scene keeps these builders warm, and these the yard's, so walking in and out builds nothing again.
    keeps: ["keep"],
    voiceZone: "byzantine-keep.halls",
    micKey: true,
    controlsHelp: (touch) => { const help = pilot.controlsHelp(touch, ["jetpack"]); help.title = "Valhodl · " + help.title; help.rows.push(BL.controlsHelp.row(["1", "5"], "Choose a weapon (1 to 5)"), BL.controlsHelp.row(["tab"], "Weapon wheel · W A S D switch weapons")); return help; },
    controlsHelpHold: (on) => { pilot.controls.reset(); pilot.setMenuOpen(on, false); },
    id: "keephalls", buildSteps: () => HM.buildSteps(), enter, update, overlay, onDonation, onKey, renderOpts: RENDER_OPTS, stay, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get inMotion() {
      return !!scene;
    }
  });
})();
