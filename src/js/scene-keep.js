// The Byzantine Keep: a land of its own behind ₿IFRÖST's west window, always under the same dark night. A traveller
// steps out of the arch on a small islet and walks down to its dock, where a rowboat waits with a lantern hung from its
// bow; sitting in it, they paddle themselves across the water, a quarter of a minute, to the quay under the castle
// island's sea cliff (where it waits for the way back), and climb the stair up to the court, read FACE
// TO FACE cut into it, rotates the two knights there (both facing whoever walks in) until they face each other,
// and crosses the drawbridge that comes down for it, under the portcullis drawn up after it, into the yard as far as
// the keep's great door into its halls. The land is an island in a dark sea, and a jetpack flies over all of it: the
// castle's air stays closed to fliers until the knights have met. The way back is the same arch.
//
// None of this is on the page until someone walks through that window: the land's code is one deferred group
// (`keep-scene`) the window's crossing fetches, and its state lives in a Durable Object of its own (the Worker's kind
// "keep", worker/src/games/keep.js), which this scene joins only in `enter` and leaves in `leave`. That object runs
// the quest's rules (keep-rules.js) for everyone signed in, so a puzzle solved by one opens its passage for all who
// are there; signed out, or with no backend, the page runs the same rules by itself. Presence and voice ride the
// island's room as in every scene, under the zone `byzantine-keep`.
(() => {
  "use strict";
  const BL = window.BL;
  if (BL.scenes && BL.scenes.keep && typeof BL.scenes.keep.enter === "function") return;
  const { math } = BL, L = BL.keepLayout, KM = BL.keepModels, RULES = BL.keepRules;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { clamp } = math;
  const { CZ, CASTLE, KEEP, MOAT, GATE, YARD, TOWER_DOORS, LEAF, ABUTMENT, COURT, STAIRS, QUAY, DOCK, ISLET, FERRY, ARCH, ARRIVE, STATUES, BOUNDS } = L, BOAT = KM.BOAT;

  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const PITCH = [-0.25, 1.3], DIST = [3.5, 30];
  const FOLLOW = { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] };
  const view = (x, y, z, yaw, pitch, dist) => ({ yaw, pitch, dist, target: { x, y, z } });
  const VIEW_NAMES = { arrival: "The islet", ferry: "The ferry", stairs: "The sea stair", court: "Sentinels", castle: "The Keep" };
  const PRESETS = {
    arrival: view(0, 2.4, ISLET.z + 4, 0, 0.14, 11),
    ferry: view(FERRY.islet.x, -4.5, FERRY.islet.z, 0.6, 0.25, 12),
    stairs: view(0, -2.5, 24, 0.5, 0.15, 18),
    court: view(0, 2.6, -2, 0, 0.2, 15),
    castle: view(0, 16, -58, 0, -0.08, 58)
  };
  // A dark night under heavy cloud. The moon stands low over the castle's left shoulder when the cloud lets it through,
  // so its towers are lit down one side, its front is in shade behind its own lamps, and the water between carries its
  // light back to whoever walks in.
  const MOON = [-0.52, 0.42, -0.74].map((v, i, a) => v / Math.hypot(...a));
  const RENDER_OPTS = {
    clear: [0.008, 0.011, 0.026], sky: [0.13, 0.165, 0.27], ground: [0.04, 0.045, 0.062],
    horizon: [0.075, 0.092, 0.155], zenith: [0.012, 0.016, 0.036], stars: 0.5, moon: { x: MOON[0], y: MOON[1], z: MOON[2] }, moonSun: { x: -MOON[0] + 0.25, y: -MOON[1], z: -MOON[2] },
    starMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    light: { x: MOON[0], y: MOON[1], z: MOON[2] }, sun: [0.06, 0.07, 0.11], direct: [0.42, 0.5, 0.74], directStrength: 0.5, ambientFloor: 0.27,
    shadowCenter: { x: 0, y: 2, z: 60 }, shadowExtent: 52, clouds: 0.62,
    fog: [0.04, 0.05, 0.088], fogNear: 34, fogFar: 362, sea: L.SEA, seaFog: true, hazeDrop: 0,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.9
  };
  // A lantern's flame, the ₿IFRÖST field's blue and the light behind the keep's door: colour and reach.
  const FLAME = [1.35, 0.82, 0.36], FIELD = [0.3, 0.55, 1.1], HEARTH = [1.2, 0.74, 0.34], ICE = [0.45, 0.75, 1.25], AMETHYST = [0.95, 0.45, 1.35];
  // The land is being built: a debug page plays this Ooga unless it names another, and `castle=1` on one lands it on
  // the castle island's quay instead of the islet.
  const TEST_PLAYER = "rules-without-rulers";
  const LANTERN_REACH = 9, WAKE = 10.5, WAKE_EASE = 1.6, UNLIT = 0.05, TORCH = 0.75, HANG = 0.55, BONFIRE = 4;
  // The drawbridge: how fast it comes down and goes up (radians a second, eased at both ends), and how near level
  // counts as down.
  const LEAF_SPEED = 0.2, LEAF_DOWN = 0.02, CHAIN_LINKS = 44;
  // The portcullis: how high it is drawn up into the gatehouse, how fast, and how far up lets a walker under.
  const GATE_LIFT = GATE.spring + GATE.passage * 1.74 + 0.4, GATE_SPEED = 1.1, GATE_CLEAR = 0.6;
  const CROWS = 26, CROW_POSES = [0, 1, 2, 1];
  const TURN_EASE = 5, REACH = 2.6, FIREFLIES = 34;
  // The knights stand twice life size on plinths twice theirs (keep-layout.js `KNIGHT`).
  const KS = L.KNIGHT.scale;
  // How long the orange beam stands on each knight as the two first face each other (`drawBeam`, the crystal's own).
  const BEAM_FOR = 3.2;
  // How long after coming through the portal onto the small island "Run to the boat!" stands across the view.
  const RUN_AFTER = 0.9;
  // A visitor's first time in Valhodl (localStorage `ooga-keep-visited`, set as they first get into a boat): Portal
  // Island keeps no skeletons, the land's name stands across the view `NAME_AFTER` s after arriving (and "Run to the
  // boat!" after it, `RUN_LATER`), and a beam stands on the rowboat at its dock until they get in.
  const VISITED_KEY = "ooga-keep-visited", NAME_AFTER = 0.6, RUN_LATER = 4.4, GUIDE = { lift: 0.3, height: 3 };
  const firstVisit = () => { try { return localStorage.getItem(VISITED_KEY) !== "1"; } catch { return false; } };
  const markVisited = () => { try { localStorage.setItem(VISITED_KEY, "1"); } catch { /* A browser without storage asks again next visit. */ } };
  // The dust round each knight: how many motes, in two rings turning against each other; and the knights' own light, red
  // until they face each other and orange once the drawbridge comes down.
  const MOTES = 34, RED = [0.62, 0.1, 0.07], ORANGE = [0.7, 0.34, 0.07];
  // The fairy dust rising round each knight: a mote every `MOTE_EVERY` s, somewhere within `MOTE_RING` of its feet,
  // while the view is within `MOTE_NEAR` (the page's particles are a shared pool).
  const MOTE_EVERY = 0.045, MOTE_RING = [1.2, 3.4], MOTE_NEAR = 60;
  // How far off Outpost Island its stone is drawn at all; the haze has it well before.
  const OUTPOST_SEEN = 520;
  // The purple and pink dust rising off Shards' crystal clusters: a mote every `every` seconds off one of them, for a
  // view within `near` of the island's middle.
  const SHARD_DUST = { every: 0.03, near: 95, bits: ["#c77dff", "#ff6ad5", "#e0aaff", "#ff9de6", "#9d4edd"].map((c) => BL.models.particleGeometry(c, 0.09, 1)) };
  const KNIGHT_DUST = [["#ff5a4a", "#ff2a1f", "#ffb0a0", "#ff7a60"], ["#ffb04a", "#ff8a1e", "#ffe0a0", "#ffc070"]].map((tones) => tones.map((c) => BL.models.particleGeometry(c, 0.1, 1)));
  const NO_ACTORS = [];
  // How long a body stands in the water before the shore takes it back, and how often the castle's ward says so.
  const WET_FOR = 0.6, WARD_TOLD = 4;
  // The boat: a stroke of its oars at full pace (seconds), how near its seat a visitor must stand on the dock to sit in
  // it, how many boats carry other players over (drawn under them while they are out on the water), and what it says.
  const STROKE = 1.1, BOARD_REACH = 3, OTHER_BOATS = 4;
  // Where a paddler may step out: dry ground or a deck within this reach of the boat's middle, no higher over the sea
  // than `STEP_UP`.
  const LAND_REACH = [1.3, 2.0, 2.8, 3.6, 4.4], STEP_UP = 3.4;
  const LINES = {
    paddle: "W and S to paddle, A and D to steer. Space beside a dock or a shore to step out.",
    paddleTouch: "The stick paddles and steers. BOARD beside a dock or a shore to step out.",
    lane: "Keep between the candles to reach the castle island.",
    away: "Paddle up beside a dock or a shore to step out."
  };
  const JETPACK_HUD = { owned: false, equipped: false, fuel: 1, blocked: false };

  let renderer, canvas, game, world, go, root, camera, hud, hooks, input, pilot, fx;
  let people = null, avatar = null, playerWorld = null, scene = null, leaving = false, unsubscribeAccount = null, remotes = null, footsteps = null;
  let rules = null, link = null, wasOpen = false, actPrompt = false, audio = null, clock = 0;
  const targets = [];

  const mayPossess = (cave) => BL.net.mayDrive(cave.traits.name);
  const leaveKeep = () => {
    if (leaving) return;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    leaving = go("bifrost");
  };
  const accountChanged = () => {
    if (!avatar) return;
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    // Nobody walks the land without an Ooga: one no longer theirs goes back to the island, which hands them their own.
    if (denied && people.player === avatar) {
      pilot.release(true);
      hud.toast(denied);
      leaveKeep();
    }
  };

  // ---------- the quest ----------
  const bridgeDown = () => !!scene && scene.leafAngle <= LEAF_DOWN;
  const gateUp = () => !!scene && scene.gateLift >= GATE_LIFT * GATE_CLEAR;
  // The rules moved (here, or in the land's object): the knights turn to where they now stand, and an opened
  // passage is told once.
  const stateChanged = (quiet = false) => {
    const at = rules.partsOf("statues"), open = rules.open("drawbridge");
    for (let i = 0; i < scene.statues.length; i++) {
      const s = scene.statues[i], want = at[i] * Math.PI / 2, was = s.aim;
      s.aim = s.shown + ((want - s.shown) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      // A knight that turns grinds round on its plinth, whoever turned it.
      if (!quiet && Math.abs(s.aim - was) > 0.05) audio.turn(STATUES[i].x, 2, STATUES[i].z);
      if (quiet) s.shown = s.body.rotation.y = s.aim;
    }
    if (open && !wasOpen && !quiet) {
      scene.beamAt = clock;
      audio.quest();
      hud.toast("The knights stand face to face. The drawbridge comes down and the portcullis rises.");
      BL.gamepad.rumble(0.5, 0.3, 500);
    }
    if (quiet) { scene.leafAngle = open ? 0 : LEAF.raised; scene.gateLift = open ? GATE_LIFT : 0; }
    wasOpen = open;
  };
  const turnStatue = (i) => {
    if (leaving) return;
    if (rules.solved("statues")) { hud.toast("The knights have met. They will not turn again."); return; }
    if (link && link.state === "refused") { BL.keepLink.drop(); link = null; }
    if (!link) { if (rules.act("statues", i)) stateChanged(); return; }
    if (!link.send({ t: "act", id: "statues", part: i })) hud.toast("The Keep is still waking. Try again in a moment.");
  };
  const nearStatue = (x, z, reach) => {
    for (let i = 0; i < STATUES.length; i++) if (Math.hypot(x - STATUES[i].x, z - STATUES[i].z) <= L.STATUE_R + reach) return i;
    return -1;
  };

  // ---------- the land for a visit ----------
  const lamp = (list, x, y, z, reach, tint, wake = false, glass = null) => {
    const l = { x, y, z, reach, tint, level: wake ? UNLIT : 1, want: wake ? 0 : 1, wake, glass, phase: list.length * 1.7, key: 0, parent: null, lx: 0, ly: 0, lz: 0 };
    list.push(l);
    return l;
  };
  const build = () => {
    const s = { safe: null, wet: 0, archZ: 0, beamAt: -Infinity, lamps: [], order: null, statues: [], leaf: null, leafAngle: LEAF.raised, leafDrawn: NaN, hung: [], chains: [], flies: [], crows: [], motes: [], lane: false, shardDust: 0, lit: -1, runAt: -1, area: null, hinted: -Infinity, near: false, portcullis: null, gateLift: 0, told: {} };
    const tall = renderer.kind !== "canvas2d";
    // The castle: the land, the curtain between its six towers, the gatehouse in the front wall and the keep across the
    // yard.
    s.crowns = []; s.drums = []; s.ladders = []; s.towers = []; s.cbdcDrums = []; s.storjDrums = [];
    const outpostTowers = [];
    // Outpost Island's stone in a group of its own, hidden from a view far off it (`OUTPOST_SEEN`).
    s.outpost = createNode({});
    addChild(root, s.outpost);
    for (const p of KM.castleParts(tall)) {
      // The shipyard is stood by `buildShipyard`, part by part.
      if (p.tag === "shipyard") continue;
      const node = createNode({ geometry: p.geometry, position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: p.ry, z: 0 }, scale: { x: p.scale, y: p.scale, z: p.scale }, sightHidden: p.hidden });
      // A turret's merlons, its drum and its ladder, in `L.TURRETS`' order: whoever mans its cannon looks out without
      // the merlons, and in their own eyes without the turret at all.
      if (p.tag === "turret-crown") s.crowns.push(node);
      else if (p.tag === "turret") s.drums.push(node);
      else if (p.tag === "turret-ladder") s.ladders.push(node);
      // A curtain tower, in `L.GALLERIES`' order, hidden from its gallery's gunner's own eyes.
      else if (p.tag === "castle-tower") s.towers.push(node);
      // A turret of CBDC's wall, in `L.VOLCANO.wall.turrets`' order.
      else if (p.tag === "cbdc-turret") s.cbdcDrums.push(node);
      // A tower of Cold Storj's fjord, in `L.STORJ.turrets`' order.
      else if (p.tag === "storj-tower") s.storjDrums.push(node);
      // Outpost Island's towers, set aside to follow the castle's own in `L.GALLERIES`' order (`castleParts` lays
      // them first).
      else if (p.tag === "outpost-tower") outpostTowers.push(node);
      addChild(p.tag === "outpost" || p.tag === "outpost-tower" ? s.outpost : root, node);
    }
    s.towers.push(...outpostTowers);
    // A flag on the tip of every spire.
    s.flags = [];
    flags.plant(root, root, 0, s.flags);
    s.portcullis = createNode({ geometry: KM.portcullis(), position: { x: 0, y: 0, z: GATE.portcullis } });
    addChild(root, s.portcullis);
    // The west gate's, across its passage through the curtain, drawn up with the main gate's.
    s.westBars = createNode({ geometry: KM.westPortcullis(), position: { x: L.WEST.bars, y: 0, z: L.WEST.z }, rotation: { x: 0, y: Math.PI / 2, z: 0 } });
    // And the east gate's, its mirror.
    s.eastBars = createNode({ geometry: KM.westPortcullis(), position: { x: -L.WEST.bars, y: 0, z: L.WEST.z }, rotation: { x: 0, y: Math.PI / 2, z: 0 } });
    // And the back gate's, across the back curtain.
    s.backBars = createNode({ geometry: KM.westPortcullis(), position: { x: 0, y: 0, z: L.BACK.bars } });
    addChild(root, s.westBars, s.eastBars, s.backBars);
    // The ghost arena's gargoyles, crouched out of the gatehouse over the gate and high on the keep.
    const beast = KM.gargoyle(), GS = 1.7;
    for (const sx of [-1, 1]) {
      const g = { x: sx * 4.6, y: 13.2, z: GATE.front + 0.1 };
      addChild(root, createNode({ geometry: beast, position: g, scale: { x: GS, y: GS, z: GS } }),
        createNode({ geometry: beast, position: { x: KEEP.x + Math.cos(Math.PI / 2 - sx * 0.62) * (L.BALCONY.outer + 0.1), y: KEEP.roof - L.BALCONY.deck - 2.2, z: KEEP.z + Math.sin(Math.PI / 2 - sx * 0.62) * (L.BALCONY.outer + 0.1) }, rotation: { x: 0, y: sx * 0.62, z: 0 }, scale: { x: 2.1, y: 2.1, z: 2.1 } }));
    }
    // Cold Storj: its snowy pines, the two stone knights on the fjord's headlands with their cold eyes and a cold light
    // at each one's feet, and a faint blue light at each sealed cave's ice.
    if (tall) for (const [x, y, z, kind, turnBy, size] of KM.storjForest()) addChild(root, createNode({ geometry: KM.snowPine(kind), position: { x, y, z }, rotation: { x: 0, y: turnBy, z: 0 }, scale: { x: size, y: size, z: size }, sightHidden: true }));
    {
      const stone = KM.stoneKnight(), plinth = KM.storjPlinth();
      for (const st of L.STORJ.statues) {
        addChild(root, createNode({ geometry: plinth, position: { x: st.x, y: st.y, z: st.z }, rotation: { x: 0, y: st.yaw, z: 0 } }));
        const body = createNode({ geometry: stone.body, position: { x: st.x, y: st.y, z: st.z }, rotation: { x: 0, y: st.yaw, z: 0 }, scale: { x: st.scale, y: st.scale, z: st.scale } });
        addChild(body, createNode({ geometry: stone.eyes, sightHidden: true }));
        addChild(root, body);
        lamp(s.lamps, st.x + 9, st.y + 3, st.z, 18, ICE);
      }
      for (const c of L.STORJ.caveAt) lamp(s.lamps, c.x + Math.sin(c.yaw) * 1.6, c.y + 2.2, c.z + Math.cos(c.yaw) * 1.6, 7, ICE);
    }
    // Shards' crystal, where the renderer draws glass (keep-models.js `shardsCrystals`), and its glow lighting the
    // ground round the trench and out across the island.
    if (renderer.kind === "webgl2") { const c = KM.shardsCrystals(); addChild(root, createNode({ geometry: c.clusters, sightHidden: true }), createNode({ geometry: c.carpet, sightHidden: true })); }
    { const S = L.SHARDS; for (const [x, z, reach] of [[S.x - 8, S.z + 14, 20], [S.x + 12, S.z - 16, 20], [S.x + 22, S.z + 18, 18], [S.x - 30, S.z - 20, 16]]) lamp(s.lamps, x, L.terrainTop(x, z) + 2.5, z, reach, AMETHYST); }
    // The forest.
    if (tall) for (const [x, y, z, kind, turnBy, size] of KM.forest()) addChild(root, createNode({ geometry: L.playDist(x, z) < 16 ? KM.pine(kind) : KM.farPine(kind), position: { x, y, z }, rotation: { x: 0, y: turnBy, z: 0 }, scale: { x: size, y: size, z: size }, sightHidden: true }));

    // The way home: ₿IFRÖST's own arch against the ruin, its field inside it, facing the castle.
    const BM = BL.bifrostModels, field = BM.entryField();
    const arch = createNode({ position: { x: ARCH.x, y: 0, z: ARCH.z }, rotation: { x: 0, y: Math.PI, z: 0 } });
    s.archStone = createNode({ geometry: BM.archStone() });
    addChild(arch, s.archStone, createNode({ geometry: BM.archGlow(), sightHidden: true }),
      createNode({ geometry: field.sheet, position: { x: 0, y: 0, z: 0.25 }, sightHidden: true }), createNode({ geometry: field.sparkles, position: { x: 0, y: 0, z: 0.3 }, sightHidden: true }));
    addChild(root, arch);
    input.add(s.archStone, { kind: "keep-arch" }, { radius: 3 });
    targets.push(s.archStone);
    lamp(s.lamps, ARCH.x, 2.3, ARCH.z - 1.4, 9, FIELD);

    // The lanterns by the way: a post's wakes as the traveller first comes near, the rest burn from the start.
    const post = KM.lanternPost(), stand = KM.standLantern(), hang = KM.hangLantern();
    for (const [x, z, kind, turnBy, base] of L.LANTERNS) {
      const part = kind === "pier" ? stand : post, y = base + (kind === "pier" ? KM.PIER_H : 0);
      const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: turnBy, z: 0 }, geometry: part.frame });
      const glass = createNode({ geometry: part.glass, sightHidden: true });
      addChild(node, glass);
      addChild(root, node);
      lamp(s.lamps, x + Math.sin(turnBy) * part.light.z, y + part.light.y, z + Math.cos(turnBy) * part.light.z, LANTERN_REACH, FLAME, kind === "post", glass);
    }
    // The gatehouse's own: one on a bracket either side of the arch, one hung in the passage, and the light that
    // spills from the keep's door across the yard.
    const hook = (x, y, z) => {
      const node = createNode({ position: { x, y, z }, geometry: hang.frame }), glass = createNode({ geometry: hang.glass, sightHidden: true });
      addChild(node, glass);
      addChild(root, node);
      return lamp(s.lamps, x, y + hang.light.y, z, LANTERN_REACH + 1, FLAME, false, glass);
    };
    for (const sx of [-1, 1]) {
      addChild(root, createNode({ geometry: KM.wallBracket(), position: { x: sx * 3.45, y: 4.1, z: GATE.front } }));
      hook(sx * 3.45, 4.1, GATE.front + KM.BRACKET);
    }
    hook(0, 6.4, GATE.front - 2.2);
    // The keep's door: a lantern on a bracket either side, and the light that spills from behind it across the yard.
    for (const sx of [-1, 1]) {
      // On the round of the keep's face, turned out from its middle.
      const a = Math.PI / 2 - sx * 0.24, bx = KEEP.x + Math.cos(a) * KEEP.r, bz = KEEP.z + Math.sin(a) * KEEP.r, turnBy = Math.atan2(Math.cos(a), Math.sin(a));
      addChild(root, createNode({ geometry: KM.wallBracket(), position: { x: bx, y: 3.9, z: bz }, rotation: { x: 0, y: turnBy, z: 0 } }));
      hook(bx + Math.cos(a) * KM.BRACKET, 3.9, bz + Math.sin(a) * KM.BRACKET);
    }
    lamp(s.lamps, KEEP.x, 3.2, KEEP.front + 2.4, 13, HEARTH);
    // The firepit's glow in the keep's open top level, seen through its arches.
    lamp(s.lamps, KEEP.x, KEEP.roof + 2, KEEP.z, 22, HEARTH);
    // The great door stands open, a leaf swung back against each side of its doorway.
    for (const sx of [-1, 1]) addChild(root, createNode({ geometry: KM.doorLeaf(), position: { x: KEEP.x + sx * 1.32, y: 0, z: KEEP.front - KEEP.wall + 0.15 } }));
    // A lantern hung on its chain from under each balcony's edge.
    s.swingers = [];
    lanterns.hang(root, s.swingers, (x, y, z, glass) => lamp(s.lamps, x, y, z, LANTERN_REACH * 1.6, FLAME, false, glass), false);
    // A torch burning on each pier round the keep's balconies.
    s.torches = [];
    const blaze = BL.blaze.smooth();
    // Outpost Island's keep's top level, open: the castle keep's rooftop firepit in its middle, burning.
    {
      const F = L.OUTPOST.fire, HM = BL.keepHallsModels;
      addChild(s.outpost, createNode({ geometry: HM.prop({ k: "firepit", x: 0, z: 0 }), position: { x: F.x, y: KEEP.roof, z: F.z } }));
      const node = createNode({ geometry: BL.blaze.smooth(), position: { x: F.x, y: KEEP.roof + 0.35, z: F.z }, scale: { x: 3, y: 3, z: 3 }, sightHidden: true });
      addChild(s.outpost, node);
      s.torches.push({ node, phase: 0.7, size: 3 / TORCH });
      lamp(s.lamps, F.x, KEEP.roof + 2, F.z, 20, HEARTH);
    }
    for (const [x, y, z] of [...L.TORCHES, ...L.OUTPOST.torches]) {
      const node = createNode({ geometry: blaze, position: { x, y: y + 0.08, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, y + 0.7, z, LANTERN_REACH, FLAME);
    }
    // The islet's torches, standing round its plateau and down its path, their fires burning as the balconies' do.
    const standing = KM.groundTorch();
    for (const [x, z, base] of L.ISLET_TORCHES) {
      addChild(root, createNode({ geometry: standing, position: { x, y: base, z } }));
      const node = createNode({ geometry: blaze, position: { x, y: base + KM.TORCH_FLAME, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, base + KM.TORCH_FLAME + 0.6, z, LANTERN_REACH, FLAME);
    }
    // The arena's columns, a bonfire burning on each.
    const column = KM.arenaColumn();
    for (const [x, z, base] of L.ARENA_COLUMNS) {
      addChild(root, createNode({ geometry: column, position: { x, y: base, z } }));
      const node = createNode({ geometry: blaze, position: { x, y: base + KM.COLUMN_FIRE, z }, scale: { x: TORCH * BONFIRE, y: TORCH * BONFIRE, z: TORCH * BONFIRE }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3, size: BONFIRE });
      lamp(s.lamps, x, base + KM.COLUMN_FIRE + 1.2, z, LANTERN_REACH * 1.8, FLAME);
    }
    // A fire in the cresset on each of the west and east bridges' pillars (the east's the west's mirror).
    for (const sx of [1, -1]) for (const [cx, y, z] of L.WEST_BRIDGE.cressets) {
      const x = sx * cx;
      const node = createNode({ geometry: blaze, position: { x, y: y + 0.5, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, y + 1.1, z, LANTERN_REACH * 1.5, FLAME);
    }
    // And on the pillars of CBDC's wall.
    for (const [x, y, z] of L.VOLCANO.wall.cressets) {
      const node = createNode({ geometry: blaze, position: { x, y: y + 0.5, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, y + 1.1, z, LANTERN_REACH * 1.5, FLAME);
    }
    // And on the high bridge's, out of the back gate.
    for (const [x, y, z] of L.BACK_BRIDGE.cressets) {
      const node = createNode({ geometry: blaze, position: { x, y: y + 0.5, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, y + 1.1, z, LANTERN_REACH * 1.5, FLAME);
    }
    // A door in each curtain tower's face toward the yard, a lantern on a bracket on each of its pilasters.
    const porch = KM.porch(), PL = KM.PORCH.lamp;
    for (const d of TOWER_DOORS) {
      const turnBy = Math.atan2(d.dx, d.dz), R = CASTLE.tower, Y = d.y || 0;
      addChild(root, createNode({ geometry: porch, position: { x: d.cx + d.dx * R, y: Y, z: d.cz + d.dz * R }, rotation: { x: 0, y: turnBy, z: 0 } }));
      for (const side of [-1, 1]) {
        const ax = d.dz * side * PL.x, az = -d.dx * side * PL.x;
        addChild(root, createNode({ geometry: KM.wallBracket(), position: { x: d.cx + d.dx * (R + PL.z) + ax, y: Y + PL.y, z: d.cz + d.dz * (R + PL.z) + az }, rotation: { x: 0, y: turnBy, z: 0 } }));
        hook(d.cx + d.dx * (R + PL.z + KM.BRACKET) + ax, Y + PL.y, d.cz + d.dz * (R + PL.z + KM.BRACKET) + az);
      }
      // Its sign on the plain wall between the arch and the cornice.
      addChild(root, createNode({ geometry: KM.wordSign("TOWER", 0.5), position: { x: d.cx + d.dx * (R + 0.875), y: Y + KM.PORCH.sign, z: d.cz + d.dz * (R + 0.875) }, rotation: { x: 0, y: turnBy, z: 0 } }));
    }
    // The keep's sign over its great door, on the round of its face.
    addChild(root, createNode({ geometry: KM.wordSign("THE KEEP", 0.8), position: { x: KEEP.x, y: 6.6, z: KEEP.front + 0.12 } }));

    // The knights on their plinths, the glow behind each visor, a low light at each one's feet and the dust that
    // circles it.
    s.capes = [];
    const knight = KM.knight();
    STATUES.forEach((at, i) => {
      // In the armory's merchant's black plate, standing on the court's floor itself.
      // In the knights' own bone-white plate, their orange kept.
      const body = createNode({ geometry: knight.body, position: { x: at.x, y: 0, z: at.z }, scale: { x: KS, y: KS, z: KS } });
      const eyes = knight.eyes.map((geometry, k) => createNode({ geometry, visible: k === 0, sightHidden: true }));
      addChild(body, ...eyes);
      capes.hang(body, s.capes);
      addChild(root, body);
      input.add(body, { kind: "keep-statue", index: i }, { radius: 2.4 * KS });
      targets.push(body);
      const glow = (geometry) => { const node = createNode({ geometry, visible: false, sightHidden: true }); addChild(root, node); return node; };
      s.statues.push({ body, eyes, shown: 0, aim: 0, light: lamp(s.lamps, at.x, 0.5, at.z + 2.6, 5.5, RED),
        beam: glow(KM.glowBeam()), aura: glow(KM.glowDisc()), ring: glow(KM.glowRing()) });
      s.motes.push({ x: at.x, z: at.z, next: 0 });
    });

    // The drawbridge: its leaf on the hinge, a lantern on each of its four hooks that hangs plumb however it stands,
    // and the two chains up to the gatehouse.
    const leaf = KM.leaf();
    s.leaf = createNode({ geometry: leaf.deck, position: { x: 0, y: 0, z: LEAF.hinge } });
    for (const h of leaf.hooks) {
      const node = createNode({ position: { x: h.x, y: h.y, z: h.z }, geometry: hang.frame }), glass = createNode({ geometry: hang.glass, sightHidden: true });
      addChild(node, glass);
      addChild(s.leaf, node);
      const l = lamp(s.lamps, 0, 0, 0, LANTERN_REACH, FLAME, false, glass);
      l.lx = h.x; l.ly = h.y; l.lz = h.z;
      s.hung.push({ node, lamp: l });
    }
    addChild(root, s.leaf);
    for (const sx of [-1, 1]) {
      const links = [];
      for (let k = 0; k < CHAIN_LINKS; k++) {
        const node = createNode({ geometry: KM.chainLink(), rotation: { x: 0, y: 0, z: k % 2 ? Math.PI / 4 : 0 }, sightHidden: true });
        addChild(root, node);
        links.push(node);
      }
      s.chains.push({ x: sx * leaf.chain.x, y: leaf.chain.y, z: leaf.chain.z, links });
    }

    // Fireflies over the islet's hummocks and the slopes either side of the court.
    if (tall) for (let k = 0; k < FIREFLIES; k++) {
      const a = L.hash2(k, 3) * Math.PI * 2, d = k % 2 ? 10 + L.hash2(k, 5) * 10 : 13 + L.hash2(k, 5) * 12;
      const x = k % 2 ? ISLET.x + Math.cos(a) * d : (k % 4 ? 1 : -1) * d, z = k % 2 ? ISLET.z + Math.sin(a) * d : COURT.z - 6 + Math.sin(a) * 10;
      const node = createNode({ geometry: KM.firefly(), position: { x, y: 1, z }, sightHidden: true });
      addChild(root, node);
      s.flies.push({ node, x, z, phase: L.hash2(k, 17) * 40, lift: Math.max(0, L.heightAt(x, z)) });
    }
    // Crows wheeling round the keep's spires.
    if (tall) for (let k = 0; k < CROWS; k++) {
      const node = createNode({ geometry: KM.crow(1), sightHidden: true, scale: { x: 1.3, y: 1.3, z: 1.3 } });
      addChild(root, node);
      s.crows.push({ node, r: 24 + L.hash2(k, 3) * 22, y: KEEP.roof + 6 + L.hash2(k, 7) * 40, speed: (0.16 + L.hash2(k, 11) * 0.2) * (k % 3 ? 1 : -1), phase: L.hash2(k, 13) * 40, cx: KEEP.x + (L.hash2(k, 21) - 0.5) * 16, cz: KEEP.z + (L.hash2(k, 23) - 0.5) * 16 });
    }
    // The boat, moored where this page last left it: its hull, its oars and the lantern on its bow; and the boats that
    // carry other players over, put away until someone is out on the water.
    const boatRig = (light) => {
      const boat = createNode({ geometry: KM.boat() });
      const oars = [0, 1].map((side) => { const n = createNode({ geometry: KM.oar(side), position: { x: (side ? -1 : 1) * BOAT.oarlock.x, y: BOAT.oarlock.y, z: BOAT.oarlock.z } }); addChild(boat, n); return n; });
      const lantern = createNode({ geometry: hang.frame, position: { x: BOAT.hook.x, y: BOAT.hook.y, z: BOAT.hook.z } }), glass = createNode({ geometry: hang.glass, sightHidden: true });
      addChild(lantern, glass);
      addChild(boat, lantern);
      addChild(root, boat);
      // The fires a red tower's hits leave burning aboard, one for each of the first two.
      const fires = light ? HULL.fires.map(([x, y, z]) => { const n = createNode({ geometry: KM.arrowFlame(), position: { x, y, z }, visible: false, sightHidden: true }); addChild(boat, n); return n; }) : [];
      return { boat, oars, lantern, fires, lamp: light ? lamp(s.lamps, 0, 0, 0, LANTERN_REACH + 2, FLAME, false, glass) : null };
    };
    // Four boats, one waiting at each dock to begin with (the islet's, the castle's quay and Cold Storj's two); where
    // they were left on this page's last visit, after.
    const kept = Array.isArray(world.keepFerry) && world.keepFerry.length === BOAT_HOMES.length ? world.keepFerry : BOAT_HOMES.map((home) => home());
    s.ferries = kept.map((left) => {
      const f = { ...boatRig(true), state: "moored", t: 0, x: left.x, y: L.SEA, z: left.z, yaw: left.yaw, stroke: 0, v: 0, w: 0, swing: null, hits: 0, sink: 0,
        seat: { kind: "boat", x: 0, y: 0, z: 0, floor: 0, ry: 0, ground: false, sitter: null, walkAt: { x: 0, z: 0 }, lockMovement: false, keepEquipment: true, act: () => boatAct(f) } };
      placeSeat(f);
      return f;
    });
    s.ferry = s.ferries[0];
    // The viking at the top of the sea stair, and the shipyard's barkeep and shipwright.
    s.guards = [];
    for (const at of L.GUARDS) {
      const node = createNode({ geometry: KM[at.kind](), position: { x: at.x, y: at.y || 0, z: at.z }, rotation: { x: 0, y: at.yaw, z: 0 } });
      addChild(root, node);
      input.add(node, { kind: "keep-guard", who: at.kind }, { radius: 1.5 });
      targets.push(node);
      s.guards.push({ node, at, phase: s.guards.length * 2.1, line: 0, marks: null });
    }
    buildMarks(s);
    // The sign by the keep's great door naming its levels (keep-halls-models.js `levelSign`).
    addChild(root, createNode({ geometry: BL.keepHallsModels.prop({ k: "levelSign" }), position: { x: L.LEVEL_SIGN.x, y: 0, z: L.LEVEL_SIGN.z }, rotation: { x: 0, y: L.LEVEL_SIGN.yaw, z: 0 } }));
    // Eryk's crystal on the small island's far beach, shown while his quest waits on it.
    s.crystal = createNode({ geometry: KM.questCrystal(), position: { x: L.CRYSTAL.x, y: L.terrainTop(L.CRYSTAL.x, L.CRYSTAL.z), z: L.CRYSTAL.z }, visible: false });
    s.crystalY = s.crystal.position.y;
    s.crystal.scale.x = s.crystal.scale.y = s.crystal.scale.z = 1.6;
    addChild(root, s.crystal);
    input.add(s.crystal, { kind: "keep-crystal" }, { radius: 1.2 });
    targets.push(s.crystal);
    // The orange beam that lights up whoever takes it, the knights' own beam, aura and ring, hidden until then.
    const pickGlow = (geometry) => { const node = createNode({ geometry, visible: false, sightHidden: true }); addChild(root, node); return node; };
    s.pick = { at: -Infinity, beam: pickGlow(KM.glowBeam()), aura: pickGlow(KM.glowDisc()), ring: pickGlow(KM.glowRing()) };
    // And the same beam standing on the rowboat on a first visit, until the visitor gets in.
    s.guide = { beam: pickGlow(KM.glowBeam()), aura: pickGlow(KM.glowDisc()), ring: pickGlow(KM.glowRing()) };
    // And over each quest's next step (`questBeamUpdate`).
    // Cold Storj's snow (`snowUpdate`): a fixed pool of flakes, hidden until the view comes near the island.
    s.snow = [];
    const flake = BL.models.noShadow(BL.models.box({ w: 0.07, h: 0.07, d: 0.07, color: "#f4f8ff", emissive: 0.7 }));
    for (let i = 0; i < SNOW.count; i++) {
      const node = createNode({ geometry: flake, visible: false, sightHidden: true });
      addChild(root, node);
      s.snow.push({ node, vx: 0, vz: 0, fall: 1, phase: i * 1.7 });
    }
    s.questBeams = { slots: [], spots: [] };
    for (let i = 0; i < 3; i++) {
      s.questBeams.slots.push({ beam: pickGlow(KM.glowBeam()), aura: pickGlow(KM.glowDisc()), ring: pickGlow(KM.glowRing()), key: "", at: 0, k: 0 });
      s.questBeams.spots.push({ x: 0, feet: 0, z: 0, key: "" });
    }
    // The longships, each the warship's own build at its size, waiting at home, their fires lit; and the galleon at
    // the shipyard's quay.
    const ship = KM.warship();
    s.ships = L.SHIPS.map((at, i) => {
      at.x = at.home.x; at.z = at.home.z; at.yaw = at.home.yaw;
      const big = at.kind === "galleon";
      // A raider flies a black sail under a skull and crossbones; a ship of CBDC's a red one that reads CBDC.
      const raider = at.role === "raider", cbdc = !!at.cbdc, node = big ? galleon(at.x, at.z, at.yaw) : longship(ship, at.scale, at.x, at.z, at.yaw, cbdc ? ship.cbdcSail : at.quest ? ship.redSail : raider ? ship.blackSail : ship.sail, raider && !cbdc ? ship.raiderHull : ship.hull);
      // A longship's deck guns, two a side on a small one and four on a great one (the galleon's are in its model).
      if (!big) addChild(node, createNode({ geometry: KM.longshipGuns(at.guns.length / 2) }));
      // A flag at each masthead, streaming aft: the Ooga Booga logo's, or a raider's skull and crossbones.
      { const F = cbdc ? KM.cbdcFlag() : at.role === "raider" ? KM.raiderFlag() : KM.spireFlag(), m = at.scale, k = big ? 1.8 : clamp(at.scale * 2.8, 0.42, 1.3);
        for (const [mz, top] of big ? MASTS.galleon : MASTS.longship) flags.fly(node, F, 0, top - 0.5 * k / m, mz, k / m, Math.PI / 2, s.flags, i * 1.9 + mz); }
      return { at, node, heel: 0, heelV: 0, boom: -1, boomN: 0, burn: at.hull ? shipFires(node, at, big) : null, lights: shipLights(s, at.scale, big ? KM.GALLEON_LIGHTS : KM.WARSHIP_LIGHTS), vx: 0, vz: 0, ttx: at.x, ttz: at.z, side: at.side || 0, spin: 0, spinT: 0, phase: i * 2.3 };
    });
    s.escorts = s.ships.filter((w) => w.at.role === "escort");
    buildFleet(s);
    s.raiders = s.ships.filter((w) => w.at.role === "raider");
    // Red Sails' three, and which of them this page has sunk while the quest hunts them (`world.keepRedSunk`).
    s.redShips = s.raiders.filter((w) => w.at.quest === "sails");
    if (!Array.isArray(world.keepRedSunk) || quests.stage("sails") !== "hunt") world.keepRedSunk = [];
    s.cannonShips = s.raiders.filter((w) => w.at.quest === "cannon").sort((a, b) => a.at.wave - b.at.wave);
    s.cannon = null;
    for (const w of s.raiders) w.raid = { C: w.at.scale < 0.2 ? RAID.small : RAID.large, v: 0, hp: w.at.hull, sink: -1, hunting: false, leg: 1, rip: -1, ripSide: 0, ripT: 0, from: { ship: true }, guns: w.at.guns.map(([a, c, y, size]) => ({ a, c, y, size, side: c > 0 ? 1 : -1, wait: 0 })) };
    s.repair = { w: null, t: 0, knock: 0, told: -1, mallet: null };
    for (const w of s.ships) buildDrips(w);
    s.dir = 1;
    buildShipyard(s, blaze);
    buildBanners(s);
    buildCandles(s);
    buildCannons(s);
    buildTowers(s);
    buildVolcano(s);
    buildSkyStrike(s);
    s.foes = foeWorld({
      root, input, targets, fx, renderer, audio: () => audio, crew: () => people, leaving: () => leaving, step: L.STEP,
      impact: (x, y, z, size, quiet) => { BURST.x = x; BURST.y = y; BURST.z = z; ballBlast(BURST, size, quiet); },
      // On the volcano's cone, above the terrain's cap, they climb its metre blocks as they would a step.
      walk: (ax, az, bx, bz, feet, r) => (L.walkClear(ax, az, bx, bz, feet, r, bridgeDown(), gateUp()) || coneClimb(bx, bz, feet, r)) && !L.lavaAt(bx, bz, feet),
      ground: (x, z, feet) => L.supportAt(x, z, feet, bridgeDown(), gateUp()),
      air: (ax, az, bx, bz, y) => L.flyClear(ax, az, bx, bz, y, 0.1, bridgeDown(), gateUp(), rules ? rules.open("drawbridge") : false),
      chase: (k, p, feet) => {
        if (k.S.chase === "islet") return L.isletDist(p.x, p.z) > -1.5 || (Math.abs(p.x) < 4.5 && p.z > DOCK.z0 - 1 && p.z < DOCK.z1 + 2);
        // Cold Storj's ogres keep their posts and leave visitors be: the island is friendly for now.
        if (k.S.chase === "storj") return false;
        // The arena's: whoever stands on its rock, on foot or in the air over it.
        if (k.S.chase === "arena") return L.arenaDist(p.x, p.z) > 1 && feet > L.ARENA_ISLE.y - 2;
        // The forest's: once the visitor comes near it follows until they are far from its post or behind the walls.
        // Never onto either bridge or out past its far end to the shipyard or the Armory & Forge.
        const S = k.S, open = Math.hypot(p.x - S.post.x, p.z - S.post.z) < FOREST.leash && !L.inWard(p.x, p.z) && !L.westAt(p.x, p.z, 1) && !L.backAt(p.x, p.z, 1) && Math.abs(p.x) < -L.WEST_BRIDGE.x1 && feet < L.LOW && Math.abs(feet - k.y) < 4;
        return open && (k.hunting || Math.hypot(p.x - k.x, p.z - k.z) < FOREST.aggro);
      },
      // Down on the dock and the path up from it, and to or from them, along their middle, so none steps off the
      // dock's side onto the sand below it.
      route: (k, tx, tz, out) => {
        if (k.S.chase !== "islet" || !(k.z < LANE_TOP || tz < LANE_TOP) || Math.abs(tz - k.z) <= 2) return;
        out.x = ISLET.x; out.z = k.z >= LANE_TOP ? LANE_TOP - 1 : k.z + Math.sign(tz - k.z) * 3.5;
      },
      // Struck down: back on the islet before the arch, whole.
      down: (cave, k) => {
        const p = cave.root.position;
        // Off whatever they sit in, a ship's helm included; a seat that will not let them stand where it meant is let
        // go of, since they are carried back to the islet anyway.
        if (scene && scene.sail && scene.sail.sail.seat.sitter === cave) helmDropped(scene.sail);
        if (cave.camp.seat) { const st = cave.camp.seat; st.lockMovement = false; if (!people.standPlayer(cave)) { st.sitter = null; cave.camp.seat = null; } }
        Object.assign(p, { x: ARRIVE.x, y: cave.baseY + L.supportAt(ARRIVE.x, ARRIVE.z, 4, bridgeDown(), gateUp()), z: ARRIVE.z });
        cave.root.rotation.y = ARRIVE.yaw; cave.hop = 0; cave.hopV = 0;
        s.safe.x = p.x; s.safe.y = p.y - cave.baseY; s.safe.z = p.z; s.wet = 0;
        health.fill();
        resetBoats(s);
        hud.toast(k.S.name + " struck you down. You wake on the islet.");
      }
    });
    s.first = firstVisit();
    if (!s.first) SKEL_POSTS.forEach((post) => s.foes.add({ ...SKEL, post }));
    L.STORJ.ogres.forEach((post) => s.foes.add({ ...STORJ_OGRE, post }));
    // The arena behind the castle: two ogres, two red trolls, four green skeletons and ten white ones.
    { const F = L.ARENA_FOES, of = (S, tip) => ({ ...S, chase: "arena", lazy: true, tip });
      F.ogres.forEach((post) => s.foes.add({ ...of(OGRE, "An ogre of the arena · keep clear of its axe"), post })); F.trolls.forEach((post) => s.foes.add({ ...of(TROLL, "A red troll of the arena · sidestep its cannon's fire"), post }));
      F.greens.forEach((post) => s.foes.add({ ...of(GREEN_SKEL, "A green skeleton of the arena · twice as hard to bring down"), post })); F.skeletons.forEach((post) => s.foes.add({ ...of(SKEL, "A skeleton of the arena · keep clear of its sword"), post })); }
    // The castle island keeps no skeletons in its forest now (`FOREST.n`).
    s.ferries.forEach((f, i) => { input.add(f.boat, { kind: "keep-ferry", index: i }, { radius: 3 }); targets.push(f.boat); });
    s.others = [];
    if (tall) for (let i = 0; i < OTHER_BOATS; i++) { const o = boatRig(false); o.boat.visible = false; s.others.push(o); }
    buildWakes(s);
    s.order = new Int16Array(s.lamps.length);
    for (let i = 0; i < s.order.length; i++) s.order[i] = i;
    return s;
  };

  // The shipyard at the west bridge's far end (keep-layout.js `SHIPYARD`, `HALLS`) and the Armory & Forge at the east
  // bridge's (`ARMORY`): their quays and timber, their dressing, the four halls with what stands in them, a fire by
  // each door, on the mead hall's hearth and in the forge's furnace, a green light over each of the alchemist's
  // cauldrons with its bubbles (`s.brew`), and the seats. A hall's roof and each of its walls is a node of its own
  // (`s.halls`), so `hallsUpdate` can take them out of the view's way.
  const BREW = { per: 4, rise: 0.35, life: 1.6 }, GREEN = [0.35, 1.2, 0.6];
  const buildShipyard = (s, blaze) => {
    const Y = L.SHIPYARD, H = L.HALL, yard = KM.shipyard(), forge = KM.armoryDock(), house = KM.longhouse(), PM = BL.keepHallsModels;
    addChild(root, createNode({ geometry: yard.stone }), createNode({ geometry: yard.timber }), createNode({ geometry: forge.stone }), createNode({ geometry: forge.timber }));
    s.brew = [];
    const stand = (p) => {
      const geometry = p.k === "half" ? KM.yardProp("ribs") : KM.yardProp(p.k) || PM.prop(p.k === "chandelier" ? { k: p.k, r: 1.1 } : { k: p.k, index: p.index, fire: p.fire });
      if (!geometry) return;
      const k = p.scale || 1;
      addChild(root, createNode({ geometry, position: { x: p.x, y: Y.y + (p.up || 0), z: p.z }, rotation: { x: 0, y: p.ry, z: 0 }, scale: { x: k, y: k, z: k } }));
      pieceTargets(p.k, p.x, Y.y + (p.up || 0), p.z, p.ry, k);
    };
    const fire = (x, y, z, reach, tint) => {
      const node = createNode({ geometry: blaze, position: { x, y, z }, scale: { x: TORCH, y: TORCH, z: TORCH }, sightHidden: true });
      addChild(root, node);
      s.torches.push({ node, phase: s.torches.length * 1.3 });
      lamp(s.lamps, x, y + 0.6, z, reach, tint);
    };
    for (const p of Y.props) stand(p);
    for (const p of L.ARMORY.props) stand(p);
    s.halls = [];
    for (const h of L.HALLS) {
      // The model's door is on its +z side: turned about for a hall whose door is on its `z0` side.
      const turnBy = h.door > 0 ? 0 : Math.PI, f = h.door, hz = house.size.hz;
      const node = createNode({ position: { x: h.dx, y: Y.y, z: h.mz }, rotation: { x: 0, y: turnBy, z: 0 } }), roof = createNode({ geometry: house.roof });
      const walls = house.walls.map((geometry, i) => { const w = createNode({ geometry }); addChild(node, w); return { node: w, nx: (i === 2 ? 1 : i === 3 ? -1 : 0) * f, nz: (i === 0 ? 1 : i === 1 ? -1 : 0) * f, half: i < 2 ? hz : house.size.hx }; });
      addChild(node, createNode({ geometry: house.frame }), roof);
      addChild(root, node);
      addChild(root, createNode({ geometry: KM.yardProp(h.sign), position: { x: h.dx, y: Y.y + H.doorTall + 1.15, z: h.mz + f * (hz + 0.3) }, rotation: { x: 0, y: turnBy, z: 0 } }));
      for (const sx of [-1, 1]) fire(h.dx + sx * (H.door + 0.25), Y.y + 2.82, h.mz + f * (hz + 0.75), LANTERN_REACH, FLAME);
      for (const p of h.inside) {
        stand(p);
        if (p.k === "hearth") fire(p.x, Y.y + 0.3, p.z, 12, HEARTH);
        else if (p.k === "chandelier") lamp(s.lamps, p.x, Y.y + p.up - 0.3, p.z, 12, FLAME);
        else if (p.k === "furnace") { const F = KM.FURNACE.fire; fire(p.x + Math.sin(p.ry) * F.z, Y.y + F.y, p.z + Math.cos(p.ry) * F.z, 13, HEARTH); }
        else if (p.k === "cauldron") {
          lamp(s.lamps, p.x, Y.y + 1.4, p.z, 8, GREEN);
          for (let k = 0; k < BREW.per; k++) {
            const n = createNode({ geometry: KM.brewBubble(), visible: false, sightHidden: true });
            addChild(root, n);
            s.brew.push({ n, x: p.x, y: Y.y + 0.66, z: p.z, phase: k / BREW.per + p.x * 0.37, spread: 0.32 });
          }
        }
      }
      s.halls.push({ at: h, roof, walls });
    }
    // Aras-Son in his stall: the court's knights in black plate, his eyes orange, a little under life size, and the
    // light of the stall's lanterns on its counter.
    {
      const M = L.ARMORY.merchant, k = M.knight, knight = KM.knight(), body = createNode({ geometry: knight.dark, position: { x: M.x - Math.sin(M.turn) * 0.35, y: L.ARMORY.y + 0.14, z: M.z - Math.cos(M.turn) * 0.35 }, rotation: { x: 0, y: M.turn, z: 0 }, scale: { x: k, y: k, z: k } });
      addChild(body, createNode({ geometry: knight.eyes[1], sightHidden: true }));
      BL.keepCapes.hang(body, s.capes);
      addChild(root, body);
      input.add(body, { kind: "keep-merchant" }, { radius: 2.4 });
      targets.push(body);
      s.merchant = body;
      lamp(s.lamps, M.x + Math.sin(M.turn) * 1.6, L.ARMORY.y + 2.6, M.z + Math.cos(M.turn) * 1.6, 9, FLAME);
      // WEAPONS on the board hung over its counter.
      addChild(root, createNode({ geometry: KM.wordSign("WEAPONS", 0.55), position: { x: M.x + Math.sin(M.turn) * 1.7, y: L.ARMORY.y + 2.86, z: M.z + Math.cos(M.turn) * 1.7 }, rotation: { x: 0, y: M.turn, z: 0 } }));
    }
    // The seats, as the crew sits its player in one.
    s.seats = L.SEATS.map((q) => ({ kind: "chair", x: q.x, y: q.y, z: q.z, floor: q.floor, ry: q.ry, ground: false, sitter: null, walkAt: q.walk }));
  };
  // The alchemist's brew: bubbles welling up over each cauldron and bursting, each on its own clock, only while the
  // view is near enough to see them.
  const brewUpdate = (s, elapsed) => {
    const near = camera.position.x > L.ARMORY.area;
    for (let i = 0; i < s.brew.length; i++) {
      const b = s.brew[i], n = b.n;
      n.visible = near;
      if (!near) continue;
      const t = elapsed / BREW.life + b.phase, k = t - Math.floor(t), a = Math.floor(t) * 2.399 + i, size = 0.05 + 0.07 * Math.sin(k * Math.PI);
      n.position.x = b.x + Math.cos(a) * b.spread; n.position.z = b.z + Math.sin(a) * b.spread; n.position.y = b.y + k * BREW.rise;
      n.scale.x = n.scale.z = size; n.scale.y = size * 0.8;
    }
  };
  // A hall's roof is out of sight while whoever walks stands on its floor or the view is under it, and so is a wall
  // the view has backed out through.
  const hallsUpdate = (s, who, feet) => {
    const p = camera.position;
    for (let i = 0; i < s.halls.length; i++) {
      const hall = s.halls[i], h = hall.at;
      const inside = !!who && who.x > h.x0 && who.x < h.x1 && who.z > h.z0 && who.z < h.z1 && feet < L.SHIPYARD.y + L.HALL.eaves;
      const under = p.x > h.x0 - 0.3 && p.x < h.x1 + 0.3 && p.z > h.z0 - 0.3 && p.z < h.z1 + 0.3 && p.y < L.hallRoof(h, p.x, p.z);
      hall.roof.visible = !(inside || under);
      for (let k = 0; k < hall.walls.length; k++) { const w = hall.walls[k]; w.node.visible = !(inside && (p.x - h.dx) * w.nx + (p.z - h.mz) * w.nz > w.half - 0.3); }
    }
  };
  // The free seat a body at (x, z) with its feet at `feet` stands beside, or null.
  const SEAT_REACH = 1.3;
  const seatNear = (x, z, feet) => {
    let best = null, reach = SEAT_REACH;
    if (!scene || x > L.SHIPYARD.area) return null;
    for (const seat of scene.seats) {
      const d = Math.hypot(seat.x - x, seat.z - z);
      if (!seat.sitter && Math.abs(feet - seat.floor) < 0.4 && d < reach) { best = seat; reach = d; }
    }
    return best;
  };
  // The galleon (keep-models.js `galleon`), afloat at (x, z) turned `yaw`: its hull, rig, sails and guns.
  const galleon = (x, z, yaw) => {
    const parts = KM.galleon(), k = L.GALLEON.scale, node = createNode({ geometry: parts.hull, position: { x, y: L.SEA, z }, rotation: { x: 0, y: yaw, z: 0 }, scale: { x: k, y: k, z: k } });
    addChild(node, createNode({ geometry: parts.rig }), createNode({ geometry: parts.sails }), createNode({ geometry: parts.guns }));
    addChild(root, node);
    return node;
  };
  // Where each ship's mastheads stand in its model's frame ([along, height]), for its flags; and what burns on a ship
  // that has taken hits (`shipFires`, `burnUpdate`): under `FIRE.hull` of its hull gone, black smoke smolders off it;
  // from there its hull burns in several places; past `FIRE.sails` its sails burn too. Each fire is a flame of the
  // torches' own, in the ship's frame, `size` across on the galleon (less on a smaller ship).
  const MASTS = { galleon: [[19, 31], [2, 39], [-15.5, 28]], longship: [[2, 52]] };
  const FIRE = { hull: 0.3, sails: 0.6, size: 2.6, every: 0.11 };
  const SMOKE_BITS = ["#141416", "#1d1c1f", "#26252a"].map((c) => BL.models.particleGeometry(c, 0.55, 0));
  const shipFires = (node, at, big) => {
    const m = at.scale, G = L.GALLEON, deck = (big ? G.deck : L.LONGSHIP.deck) * at.scale, size = FIRE.size * (big ? 1.2 : clamp(at.scale * 2.2, 0.34, 0.8)), blaze = BL.blaze.smooth();
    const half = (a) => L.shipHalf(at, a), B = at.bow;
    // On the hull: about the deck fore, aft and amidships. On the sails: up each mast's canvas.
    const hull = [[0.3 * B, 0.35 * half(0.3 * B), deck], [-0.28 * B, -0.4 * half(-0.28 * B), deck], [0.58 * B, 0, big ? G.fore.top * m : deck], [-0.5 * B, 0.3 * half(-0.5 * B), big ? G.quarter.top * m : deck], [0.05 * B, -0.45 * half(0), deck]];
    const sails = (big ? [[19.6, 0, 17], [2.6, 4, 16], [2.6, -3, 30], [-15, 0, 18]] : [[2.5, 6, 20], [2.5, -7, 30], [2.5, 0, 40]]).map(([a, c, y]) => [a * at.scale, c * at.scale, y * at.scale]);
    const light = (list, k) => list.map(([a, c, y], i) => { const n = createNode({ geometry: blaze, position: { x: c / m, y: y / m, z: a / m }, visible: false, sightHidden: true }); addChild(node, n); return { n, base: size * k / m, phase: i * 1.7 + a }; });
    return { hull: light(hull, 1), sails: light(sails, 1.5), spots: hull, smoke: 0 };
  };
  // How much of a ship's hull is gone (0 whole to 1), for a ship that can be hurt.
  const hurtOf = (w) => w.sail ? 1 - w.sail.hp / w.at.hull : w.raid ? 1 - w.raid.hp / w.at.hull : 0;
  const burnUpdate = (s, dt, elapsed) => {
    for (let i = 0; i < s.ships.length; i++) {
      const w = s.ships[i], F = w.burn;
      if (!F) continue;
      const gone = w.raid && w.raid.sink >= 0 || w.sail && w.sail.sink >= 0, d = gone ? 0 : hurtOf(w), onHull = d >= FIRE.hull, onSails = d > FIRE.sails;
      for (let k = 0; k < F.hull.length; k++) { const f = F.hull[k]; f.n.visible = onHull; if (onHull) { const z = f.base * (1 + BL.blaze.flare(elapsed, f.phase)); f.n.scale.x = f.n.scale.z = z; f.n.scale.y = z * (1.05 + Math.sin(elapsed * 7 + f.phase) * 0.06); f.n.glow = 1; } }
      for (let k = 0; k < F.sails.length; k++) { const f = F.sails[k]; f.n.visible = onSails; if (onSails) { const z = f.base * (1 + BL.blaze.flare(elapsed, f.phase)); f.n.scale.x = f.n.scale.z = z; f.n.scale.y = z * (1.1 + Math.sin(elapsed * 6 + f.phase) * 0.08); f.n.glow = 1; } }
      // Black smoke off it while it is hurt at all, thicker the worse it is.
      if (d <= 0 || (F.smoke -= dt) > 0) continue;
      F.smoke = FIRE.every * (onSails ? 0.5 : onHull ? 0.75 : 1.4);
      const g = w.at, sp = F.spots[(Math.random() * F.spots.length) | 0], sn = Math.sin(g.yaw), cs = Math.cos(g.yaw);
      const p = fx.spawnParticle(SMOKE_BITS[(Math.random() * SMOKE_BITS.length) | 0], g.x + sn * sp[0] + cs * sp[1], w.node.position.y + sp[2] + 0.5, g.z + cs * sp[0] - sn * sp[1], (Math.random() - 0.5) * 0.9, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.9, 2.2 + Math.random() * 1.4, 1.6, -0.6, -100);
      if (p) p.smoke = true;
    }
  };
  // A ship going down blows up: great bursts along her hull one after another (`SINK_BOOM`: when each goes off after
  // she starts to sink, how far along her it is and how big, a galleon's; a smaller ship's are smaller), each the
  // cannons' own burst with more fire thrown up out of it.
  // Half again as big as they were, with two more late ones; each also throws up a column of water, splinters of her
  // timbers and a second roll of smoke, and shakes the view of whoever is near.
  const SINK_BOOM = [[0, 0, 4.2], [0.3, 0.45, 3], [0.7, -0.45, 3], [1.2, 0.12, 3.75], [1.8, -0.2, 2.7], [2.3, 0.3, 3.2], [2.8, -0.05, 4]];
  const sinkBooms = (w, dt) => {
    const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), k = clamp(g.bow / 37, 0.4, 1);
    w.boom += dt;
    while (w.boomN < SINK_BOOM.length && w.boom >= SINK_BOOM[w.boomN][0]) {
      const [, along, size] = SINK_BOOM[w.boomN++], a = along * g.bow, c = (Math.random() - 0.5) * g.beam;
      BOMB_AT.x = g.x + sn * a + cs * c; BOMB_AT.z = g.z + cs * a - sn * c; BOMB_AT.y = Math.max(L.SEA + 0.3, w.node.position.y + g.helm.y * 0.6);
      ballBlast(BOMB_AT, size * k);
      for (let i = 0, n = Math.round(22 * k); i < n; i++) { const d = Math.random() * Math.PI * 2, sp = (1 + Math.random() * 5) * k; fx.spawnParticle(WATER_BITS[i % WATER_BITS.length], BOMB_AT.x, L.SEA + 0.2, BOMB_AT.z, Math.cos(d) * sp, (10 + Math.random() * 14) * k, Math.sin(d) * sp, 1.2 + Math.random() * 0.8, 10, 4, -100); }
      for (let i = 0, n = Math.round(16 * k), R = KM.smash().rocks; i < n; i++) { const d = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 10) * k; fx.spawnParticle(R[i % R.length], BOMB_AT.x, BOMB_AT.y + 0.6, BOMB_AT.z, Math.cos(d) * sp, (6 + Math.random() * 10) * k, Math.sin(d) * sp, 1.6 + Math.random() * 1.2, 9, 14, L.SEA - 0.5); }
      for (let i = 0; i < 6; i++) { const p = fx.spawnParticle(SMOKE_BITS[i % SMOKE_BITS.length], BOMB_AT.x + (Math.random() - 0.5) * 6 * k, BOMB_AT.y + 3, BOMB_AT.z + (Math.random() - 0.5) * 6 * k, (Math.random() - 0.5) * 2.5, 4 + Math.random() * 3, (Math.random() - 0.5) * 2.5, 3.2 + Math.random() * 1.6, 3.4, -0.6, -100); if (p) p.smoke = true; }
      if (scene && Math.hypot(camera.position.x - BOMB_AT.x, camera.position.z - BOMB_AT.z) < 140) scene.foes.rumble(0.5 * k);
      for (let i = 0, n = Math.round(39 * k); i < n; i++) { const d = Math.random() * Math.PI * 2, sp = (3 + Math.random() * 9) * k; fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], BOMB_AT.x, BOMB_AT.y + 0.5, BOMB_AT.z, Math.cos(d) * sp, (9 + Math.random() * 12) * k, Math.sin(d) * sp, 0.9 + Math.random() * 0.8, 10, 10, -100); }
      for (let i = 0; i < 6; i++) { const p = fx.spawnParticle(SMOKE_BITS[i % SMOKE_BITS.length], BOMB_AT.x + (Math.random() - 0.5) * 3 * k, BOMB_AT.y + 1, BOMB_AT.z + (Math.random() - 0.5) * 3 * k, (Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 1.5, 2.6 + Math.random() * 1.6, 2.4, -0.6, -100); if (p) p.smoke = true; }
    }
    if (w.boomN >= SINK_BOOM.length) { w.boom = -1; w.boomN = 0; }
  };
  // A ball bursting on a ship rolls it away from the blow, and it comes back upright (`w.heel`, `HEEL`: the kick, in
  // radians a second for the galleon and more for a lighter ship, and the spring and damping that right it).
  const HEEL = { kick: 0.9, spring: 26, damp: 5 };
  const heelShip = (w, x, z) => {
    const g = w.at, across = (x - g.x) * Math.cos(g.yaw) - (z - g.z) * Math.sin(g.yaw);
    w.heelV += (across >= 0 ? 1 : -1) * HEEL.kick * (g.kind === "galleon" ? 1 : g.scale < 0.2 ? 2.2 : 1.5);
  };
  // A dragon longship (keep-models.js `warship`) at `scale`, afloat at (x, z) turned `yaw`; a raider's carries a stone
  // gargoyle at its stem in the dragon's place (`raiderHull`).
  const longship = (parts, scale, x, z, yaw, sail = parts.sail, hull = parts.hull) => {
    const node = createNode({ geometry: hull, position: { x, y: L.SEA, z }, rotation: { x: 0, y: yaw, z: 0 }, scale: { x: scale, y: scale, z: scale } });
    addChild(node, createNode({ geometry: parts.rig }), createNode({ geometry: sail }), createNode({ geometry: parts.shields }));
    addChild(root, node);
    return node;
  };
  // Molten fire dripping from each dragon's jaws into the sea, now and then in a little run: a fixed pool of glowing
  // bits a ship, in the ship's own frame (so each falls at the ship's own size), each let go at a random place between
  // the jaws and falling under gravity until it meets the water.
  const DRIP = { n: 10, gap: [0.12, 0.7], burst: 0.25, mouth: { y: 22.3, z0: 60.5, z1: 64.5, half: 0.7 }, g: 9.8, life: 3 };
  const buildDrips = (w) => {
    w.drips = [];
    w.dripAt = Math.random() * DRIP.gap[1];
    // The galleon's dragon only glows, and a raider's gargoyle breathes no fire.
    if (w.at.kind === "galleon" || w.at.role === "raider") return;
    for (let i = 0; i < DRIP.n; i++) {
      const node = createNode({ geometry: KM.drip(i & 1), visible: false, sightHidden: true });
      addChild(w.node, node);
      w.drips.push({ node, vx: 0, vy: 0, vz: 0, t: 0, live: false });
    }
  };
  const dripUpdate = (s, dt) => {
    for (let i = 0; i < s.ships.length; i++) {
      const w = s.ships[i], sc = w.at.scale, M = DRIP.mouth;
      w.dripAt -= dt;
      if (w.dripAt <= 0) {
        w.dripAt = Math.random() < DRIP.burst ? DRIP.gap[0] * 0.5 : DRIP.gap[0] + Math.random() * (DRIP.gap[1] - DRIP.gap[0]);
        for (let k = 0; k < w.drips.length; k++) {
          const d = w.drips[k];
          if (d.live) continue;
          d.live = true; d.t = 0; d.node.visible = true;
          d.node.position.x = (Math.random() - 0.5) * 2 * M.half; d.node.position.y = M.y; d.node.position.z = M.z0 + Math.random() * (M.z1 - M.z0);
          d.vx = (Math.random() - 0.5) * 0.6 / sc; d.vy = -Math.random() * 0.8 / sc; d.vz = Math.random() * 0.7 / sc;
          break;
        }
      }
      for (let k = 0; k < w.drips.length; k++) {
        const d = w.drips[k];
        if (!d.live) continue;
        d.t += dt; d.vy -= DRIP.g / sc * dt;
        const p = d.node.position;
        p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
        const k1 = Math.max(0.35, 1 - d.t / DRIP.life * 0.7);
        d.node.scale.x = d.node.scale.y = d.node.scale.z = k1; d.node.glow = 0.6 + 0.4 * Math.sin(d.t * 23 + k);
        if (p.y < 0 || d.t > DRIP.life) { d.live = false; d.node.visible = false; }
      }
    }
  };
  // The standing banners (at the top of the islet's path and before the castle's front wall), each cloth a chain of strips stirring in the wind.
  const buildBanners = (s) => {
    const parts = KM.banner(), B = KM.BANNER;
    s.banners = [];
    for (const b of L.BANNERS) {
      const k = b.scale || 1, node = createNode({ geometry: parts.pole, position: { x: b.x, y: b.y, z: b.z }, rotation: { x: 0, y: b.yaw, z: 0 }, scale: { x: k, y: k, z: k } });
      let parent = createNode({ position: { x: B.out, y: B.top, z: 0 } });
      addChild(node, parent);
      const strips = [];
      for (let k = 0; k < parts.strips.length; k++) {
        const strip = createNode({ geometry: parts.strips[k], position: { x: 0, y: k ? -parts.strip : 0, z: 0 } });
        addChild(parent, strip);
        strips.push(strip);
        parent = strip;
      }
      addChild(root, node);
      s.banners.push({ strips, phase: b.phase });
    }
  };
  // The land's health: ten hit points a visitor, kept on `world.keepHealth` across the yard and the halls, shown as a
  // circle filled like a pie as far as they go, with the count in it, in the left column (`#keep-health`, written only
  // on a change) and sent to the room as the driven
  // Ooga's health, which other pages draw under its name. At none the yard stands the visitor back on the islet, whole.
  const HEALTH = 10, REGEN = 60;
  // The land's bananas, its own and nothing to do with the island's: none to begin with, kept with what has been
  // bought of the merchant in localStorage `ooga-keep-shop` (checked on load), and shown under the health.
  // Each weapon but the dagger also has a level, 1 to `LEVEL_MAX`, raised at the same stall (`upgrade`).
  const PURSE_KEY = "ooga-keep-shop", PURSE_MAX = 1e9, WARE_IDS = ["dagger", "sword", "staff", "wand", "axe"], LEVELLED = ["sword", "axe", "wand", "staff"], LEVEL_MAX = 4;
  // For now every levelled weapon is at its highest level, whatever has been bought. The levels kept, their prices,
  // upgrades and moves all stand as they are, so turning this off sends everyone back to build up from level 1.
  const ALL_LEVELS = true;
  // `keeptest=1` on a debug page: the purse never holds fewer than `TEST_BANANAS`, and the merchant's menu offers to
  // take a weapon back down a level, for trying the upgrades over.
  const TEST = (() => { const q = new URLSearchParams(location.search); return q.get("debug") === "1" && q.get("keeptest") === "1"; })(), TEST_BANANAS = 10000;
  const purse = (() => {
    let save = null, count = null;
    const load = () => {
      const out = { bananas: 0, owned: [], active: null, levels: {}, use: {} };
      try {
        const raw = JSON.parse(localStorage.getItem(PURSE_KEY) || "null");
        if (raw && Number.isInteger(raw.bananas) && raw.bananas >= 0 && raw.bananas <= PURSE_MAX) out.bananas = raw.bananas;
        if (raw && Array.isArray(raw.owned)) for (const id of WARE_IDS) if (raw.owned.includes(id)) out.owned.push(id);
        if (raw && out.owned.includes(raw.active)) out.active = raw.active;
        if (raw && raw.levels && typeof raw.levels === "object") for (const id of LEVELLED) { const n = raw.levels[id]; if (out.owned.includes(id) && Number.isInteger(n) && n > 1 && n <= LEVEL_MAX) out.levels[id] = n; }
        // The level each is used at, where a lower one than its top was chosen.
        if (raw && raw.use && typeof raw.use === "object") for (const id of LEVELLED) { const n = raw.use[id], top = ALL_LEVELS ? LEVEL_MAX : out.levels[id] || 1; if (out.owned.includes(id) && Number.isInteger(n) && n >= 1 && n < top) out.use[id] = n; }
      } catch { /* A browser without storage keeps them for the page. */ }
      if (TEST) out.bananas = Math.max(out.bananas, TEST_BANANAS);
      return out;
    };
    const state = () => save || (save = load());
    const store = () => { try { localStorage.setItem(PURSE_KEY, JSON.stringify(save)); } catch { /* as above */ } };
    const topOf = (id) => ALL_LEVELS && LEVELLED.includes(id) ? LEVEL_MAX : state().levels[id] || 1;
    const levelOf = (id) => { const top = topOf(id), n = state().use[id]; return n && n < top ? n : top; };
    const draw = () => { if (count) { count.textContent = BL.game.formatLarge(state().bananas); document.getElementById("keep-bananas").setAttribute("aria-label", `${state().bananas} bananas`); } };
    return {
      show() { const box = document.getElementById("keep-bananas"); count = document.getElementById("keep-bananas-count"); draw(); },
      get bananas() { return state().bananas; },
      // Where the stash is on the screen, for a banana flying in; and a bump as one lands.
      target() { const box = count && count.parentNode.getBoundingClientRect(); return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: innerWidth / 2, y: innerHeight - 30 }; },
      pulse() { const box = count && count.parentNode; if (box) { box.removeAttribute("data-pulse"); void box.offsetWidth; box.dataset.pulse = "1"; } },
      owns: (id) => state().owned.includes(id),
      get owned() { return state().owned; },
      get active() { return state().active; },
      setActive(id) { if (!state().owned.includes(id)) return false; state().active = id; store(); return true; },
      add(n) { state().bananas = Math.min(PURSE_MAX, state().bananas + Math.max(0, Math.floor(n))); store(); draw(); },
      // Takes `id` back (a quest reset on a debug page): the weapon in hand falls to the last other one owned, or none.
      forget(id) {
        const st = state(), i = st.owned.indexOf(id);
        if (i < 0) return false;
        st.owned.splice(i, 1); delete st.levels[id]; delete st.use[id];
        if (st.active === id) st.active = st.owned.length ? st.owned[st.owned.length - 1] : null;
        store(); draw(); return true;
      },
      /** The highest level of `id` owned: 1 for one not raised, unowned or the dagger. */
      top: topOf,
      /** The level `id` is used at: its top, or a lower one chosen at the merchant's (`setLevel`). */
      level: levelOf,
      // Uses owned `id` at level `n`, up to its top (at its top it follows any later upgrade): true when it changed.
      setLevel(id, n) {
        const st = state(), top = topOf(id);
        if (!LEVELLED.includes(id) || !st.owned.includes(id) || !Number.isInteger(n) || n < 1 || n > top || n === levelOf(id)) return false;
        if (n === top) delete st.use[id]; else st.use[id] = n;
        store(); return true;
      },
      // Raises owned `id` a level for `price`, from its top, and uses it at the new one: true when it did.
      upgrade(id, price) {
        const st = state(), at = st.levels[id] || 1;
        if (ALL_LEVELS || !LEVELLED.includes(id) || !st.owned.includes(id) || at >= LEVEL_MAX || st.bananas < price) return false;
        st.bananas -= price; st.levels[id] = at + 1; delete st.use[id]; store(); draw(); return true;
      },
      // Takes owned `id` down a level (the test flag's Downgrade), its price not given back: true when it did.
      downgrade(id) {
        const st = state(), at = st.levels[id] || 1;
        if (ALL_LEVELS || at <= 1) return false;
        if (at === 2) delete st.levels[id]; else st.levels[id] = at - 1;
        if (st.use[id] && st.use[id] >= at - 1) delete st.use[id];
        store(); return true;
      },
      // Every weapon back to level 1 (the quest log's reset, on a debug page): true when one was raised or used lower.
      resetLevels() { const st = state(), had = Object.keys(st.levels).length > 0 || Object.keys(st.use).length > 0; st.levels = {}; st.use = {}; store(); return had; },
      // Buys `id` for `price`: true when it did.
      buy(id, price) { const st = state(); if (!WARE_IDS.includes(id) || st.owned.includes(id) || st.bananas < price) return false; st.bananas -= price; st.owned.push(id); st.active = id; store(); draw(); return true; }
    };
  })();
  BL.keepPurse = purse;
  // The land's weapons: what each is, the damage a blow of it does and its price in bananas (the armory's merchant
  // sells them, scene-keep-halls.js `shop`), and the one in hand. A weapon bought is in hand at once, held and swung as
  // an Ooga's club is (crew.js `setClub` in the primary's place); the ones owned stand down the left of the screen
  // (`#keep-arms`), the one in hand lit, a press on another taking it in hand. Each scene `bind`s its driven Ooga and
  // `release`s it before it gives back what it parked.
  // The dagger is not sold: Aras-Son gives it for Eryk's crystal (its `quest`, at that quest's `reward` step), and a
  // cut of it does half a hit point, so two take one.
  // `about` is the line the new-weapon notice gives it.
  const WARES = [
    { id: "dagger", name: "Dagger", damage: 0.5, price: 0, quest: "crystal", about: "A short, quick blade, Aras-Son's gift for Eryk's crystal. A swing and a slash, each throwing a swoosh; two cuts take a hit point." },
    { id: "sword", name: "Sword", damage: 2, price: 50, levels: true, upgrades: [
      ["Honed edge", "Aras-Son grinds the blade keen: every cut bites twice as deep, and a third cut follows, the spinning sweep."],
      ["Tempered steel", "Quenched again in the forge's trough, hard as the anvil: four times a new blade's bite, and the leaping slam ends the chain."],
      ["Rune-forged", "Thorvald's runes burn orange down the blade: eight times a new blade's damage."]], about: "A long orange blade swung in four cuts, the last a leap and a slam into the ground that throws back all around." },
    { id: "axe", name: "Maul", damage: 4, price: 100, levels: true, upgrades: [
      ["Iron-banded head", "The drum is bound in heavy iron: every blow lands twice as hard, and a third swing follows, the spinning sweep."],
      ["Longer spikes", "Its spikes drawn out long and sharp: four times a new maul's blow, and the leaping slam ends the chain."],
      ["Giant's maul", "Weighted with lead at its heart: eight times a new maul's damage."]], about: "A great spiked drum on a long haft, the heaviest blow in the Keep, swung in four cuts." },
    { id: "wand", name: "Wand", damage: 3, price: 1000, levels: true, upgrades: [
      ["Recut gem", "Ylva recuts the gem to a finer point: its fire burns twice as hot, and a slash follows the fireball."],
      ["Dragon-glass core", "A sliver of dragon glass set in the gem: four times a new wand's burn, and a backhand sweep follows the slash."],
      ["Star-fire", "Starlight caught in the gem: eight times the damage, and the chain ends in the charged blast that darkens the land."]], about: "A slender black wand with a glowing orange gem: a ball of fire, two cuts, then a charged blast that darkens the land." },
    { id: "staff", name: "Staff", damage: 3, price: 5000, levels: true, upgrades: [
      ["Bound crystal", "The carved hand closes tight round its crystal: every blow strikes twice as hard, and a backhand sweep follows the first."],
      ["Awakened crystal", "The crystal wakes and glows brighter: four times a new staff's blow, and the spinning sweep follows."],
      ["Elder staff", "Old magic seeps up the haft: eight times a new staff's damage, and the leaping slam ends the chain."]], about: "A tall dark staff with a glowing crystal held in a carved hand, swung in the sword's four cuts." }
  ];
  const HOLD = { rest: { x: 0.95, z: 0 }, carry: { x: 0.95, z: 0 }, swing: "back" };
  // How each is swung: the dagger, the sword and the rest in their combo of cuts by turns (crew.js `COMBO`), the wand
  // as a spell (crew.js `SPELL`).
  const SWINGS = { dagger: "combo", sword: "combo", staff: "staff", wand: "spell", axe: "combo" };
  // How many moves of its chain a weapon swings at level 1 (the sword and the maul their swing and slash, the staff
  // its first cut, the wand its cast); each level after opens the next, up to the whole chain of four (crew.js `steps`).
  // The dagger, which has no levels, keeps the level 1 sword's swing and slash.
  const FIRST_MOVES = { dagger: 2, sword: 2, axe: 2, staff: 1, wand: 1 };
  // At level 1 the chain, once done, waits this many seconds before it can be swung again.
  const LEVEL1_PAUSE = 1;
  const movesOf = (id) => FIRST_MOVES[id] ? Math.min(4, FIRST_MOVES[id] + purse.level(id) - 1) : 0;
  // A damage as the land writes it: the dagger's half as ½.
  const damageText = (d) => d === 0.5 ? "½" : String(d);
  // A weapon's levels (`levels` on a ware, kept by the purse): each blow of it does `power` times its damage at each
  // level, and raising it from a level costs `cost` times its price. Each level also opens the next move of its chain (`movesOf`).
  const LEVELS = { max: LEVEL_MAX, power: [1, 2, 4, 8], cost: [1, 2, 3] };
  // The model a weapon wears: the sword at its highest level is the frost blade (keep-models.js `keepWeapon("sword4")`),
  // in the hand, on the selector and in the merchant's menu, with flames off its edge and fire for its swoosh.
  const skinOf = (id) => id === "sword" && purse.level("sword") >= LEVELS.max ? "sword4" : id;
  /** The damage a blow of ware `w` does at the level it stands at. */
  const damageOf = (w) => w.damage * (w.levels ? LEVELS.power[purse.level(w.id) - 1] : 1);
  /** What raising ware `w` a level costs, or 0 when it has none or is at its top. */
  const upgradePrice = (w) => { const at = purse.top(w.id); return w.levels && at < LEVELS.max ? w.price * LEVELS.cost[at - 1] : 0; };
  /** Level `n` of ware `w`: its name, what it cost (the ware itself at level 1, its upgrade after) and its damage. */
  const levelName = (w, n) => n > 1 ? w.upgrades[n - 2][0] : "Level 1";
  const levelPrice = (w, n) => n > 1 ? w.price * LEVELS.cost[n - 2] : w.price;
  const levelDamage = (w, n) => w.damage * LEVELS.power[n - 1];
  // A weapon's level as pips, filled to it (`.keep-level`, the dagger none): made once a holder and set by `data-level`.
  const levelPips = (holder, w) => {
    let el = holder.querySelector(".keep-level");
    if (!w.levels) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("span"); el.className = "keep-level"; el.setAttribute("aria-hidden", "true"); for (let i = 0; i < LEVELS.max; i++) el.append(document.createElement("i")); holder.append(el); }
    el.dataset.level = String(purse.level(w.id));
  };
  const levelText = (w) => w.levels ? ` · level ${purse.level(w.id)}` : "";
  const PICTURES = new Map();
  // A weapon's picture `px` across, drawn once a size and copied onto each canvas that shows it: laid across the
  // frame on its diagonal and turned a little to show its side, then fitted by its own outline as the view sees it so
  // it fills `PICTURE_FILL` of the frame whatever its shape, and centred.
  const PICTURE_PX = 128, PICTURE_FILL = 0.86, PICTURE_TURN = -Math.PI / 2 + 0.25, PICTURE_TILT = -0.75, PICTURE_DIST = 3, PICTURE_FOV = 32;
  // A weapon with art of its own (keep-icon-data.js) shows that, on its own round stone frame, at every level; the
  // rest are drawn from their models.
  const ICONS = BL.keepIcons || {}, FITS = BL.keepIconFits || {};
  // A picture laid in its box so its round frame fills as much of the box as the heart's does, its middle on the box's,
  // whatever reaches out past the frame (a hilt, a haft) standing out over the box's edge.
  const FRAME = FITS.health ? 2 * FITS.health[2] : 1;
  const fitIcon = (img, id) => {
    const f = FITS[id];
    if (!f) return img;
    const w = FRAME / (2 * f[2]), h = w * f[3];
    img.style.setProperty("position", "absolute"); img.style.setProperty("max-width", "none");
    img.style.setProperty("width", `${(w * 100).toFixed(2)}%`); img.style.setProperty("height", `${(h * 100).toFixed(2)}%`);
    img.style.setProperty("left", `${((0.5 - f[0] * w) * 100).toFixed(2)}%`); img.style.setProperty("top", `${((0.5 - f[1] * h) * 100).toFixed(2)}%`);
    return img;
  };
  const picture = (id, px) => {
    if (ICONS[id]) {
      const box = document.createElement("span"), img = document.createElement("img");
      box.className = "keep-arm-picture keep-arm-icon"; box.setAttribute("aria-hidden", "true");
      img.src = ICONS[id]; img.alt = ""; img.draggable = false;
      box.append(fitIcon(img, id));
      return box;
    }
    const model = skinOf(id), key = model + "|" + px;
    let source = PICTURES.get(key);
    if (!source) {
      source = document.createElement("canvas");
      const draw = BL.iconRenderer.createRenderer(source, { width: px, height: px, transparent: true }), geometry = KM.keepWeapon(model, 1), v = geometry.verts;
      // Its outline in the view: every vertex turned as the picture turns it, the extent across and up.
      const c1 = Math.cos(PICTURE_TURN), s1 = Math.sin(PICTURE_TURN), c2 = Math.cos(PICTURE_TILT), s2 = Math.sin(PICTURE_TILT);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < v.length; i += 3) {
        const xa = v[i] * c1 + v[i + 2] * s1, ya = v[i + 1], xb = xa * c2 - ya * s2, yb = xa * s2 + ya * c2;
        if (xb < x0) x0 = xb; if (xb > x1) x1 = xb; if (yb < y0) y0 = yb; if (yb > y1) y1 = yb;
      }
      const half = Math.tan(PICTURE_FOV * Math.PI / 360) * PICTURE_DIST, fit = PICTURE_FILL * 2 * half / Math.max(x1 - x0, y1 - y0, 0.05);
      const top = createNode({ position: { x: -(x0 + x1) / 2 * fit, y: -(y0 + y1) / 2 * fit, z: 0 } }), pivot = createNode(), face = createNode(), item = createNode({ geometry });
      face.scale.x = face.scale.y = face.scale.z = fit;
      face.rotation.y = PICTURE_TURN; pivot.rotation.z = PICTURE_TILT;
      addChild(top, pivot); addChild(pivot, face); addChild(face, item);
      const cam = createCamera({ fov: PICTURE_FOV, near: 0.1, far: 20 });
      cam.position.x = 0.35; cam.position.y = 0.3; cam.position.z = PICTURE_DIST; cam.target.x = cam.target.y = cam.target.z = 0;
      draw.render(top, cam); draw.dispose();
      PICTURES.set(key, source);
    }
    const out = document.createElement("canvas");
    // The renderer draws at the screen's pixel density: copied whole at the picture's own size.
    out.width = out.height = px; out.className = "keep-arm-picture"; out.setAttribute("aria-hidden", "true");
    out.getContext("2d").drawImage(source, 0, 0, px, px);
    return out;
  };
  // The weapon selector at the head of the left column (`#keep-arms`): one button showing the weapon in hand, which a
  // press opens into the weapons owned laid out on an arc beside it (`#keep-arms-fan`, `FAN`), in the merchant's order;
  // a press on one takes it and folds the arc away, as does a press anywhere else. Each press clicks and the pointer
  // coming over a button ticks more softly (keep-audio.js `click`).
  // The arc's middle is `ox` right of and `oy` below the selector's, so it stands clear of the screen's edge and low.
  const FAN = { r: 172, step: 0.6, spread: 2.4, ox: 97, oy: 70, coarse: { r: 124, step: 0.66, spread: 2.0, ox: 40, oy: 40 } };
  // Each weapon's key, as a hotbar's (1 the dagger to 5 the staff, in the merchant's order), in a badge on its button.
  const keyBadge = (w) => { const b = document.createElement("b"); b.className = "keep-arm-key"; b.textContent = String(WARES.indexOf(w) + 1); b.setAttribute("aria-hidden", "true"); return b; };
  const arms = (() => {
    let crew = null, cave = null, refresh = null, bar = null, opener = null, fan = null, sound = null, shownActive = null;
    const tick = (soft) => { const a = sound && sound(); if (a) a.click(soft); };
    const isOpen = () => !!fan && fan.dataset.open === "true";
    const lay = () => {
      const items = fan.children, n = items.length, F = COARSE ? FAN.coarse : FAN, step = Math.min(F.step, n > 1 ? F.spread / (n - 1) : 0), r = F.r, a0 = -step * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + step * i, el = items[i];
        el.style.setProperty("--fx", `${(Math.cos(a) * r + F.ox).toFixed(1)}px`); el.style.setProperty("--fy", `${(Math.sin(a) * r + F.oy).toFixed(1)}px`); el.style.setProperty("--fd", `${i * 35}ms`);
      }
    };
    const outside = (e) => { if (isOpen() && !bar.contains(e.target)) { if (wheelOpen) wheelClose(); else fold(); } };
    const unfold = () => {
      if (!fan || isOpen() || !fan.children.length) return;
      lay(); fan.inert = false; fan.dataset.open = "true"; opener.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
    };
    const fold = () => {
      if (!fan) return;
      delete fan.dataset.open; fan.inert = true; opener.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", outside, true);
    };
    const click = (e) => {
      const b = e.target.closest("button");
      if (!b || !bar.contains(b)) return;
      tick(false);
      if (b === opener) { if (isOpen()) { if (wheelOpen) wheelClose(); else fold(); } else unfold(); }
      else if (b.dataset.arm) { choose(b.dataset.arm); if (wheelOpen) wheelClose(); else fold(); }
      b.blur();
    };
    const hover = (e) => {
      if (e.pointerType !== "mouse") return;
      const b = e.target.closest("button");
      if (!b || !bar.contains(b) || (e.relatedTarget && b.contains(e.relatedTarget))) return;
      if (b === opener || isOpen()) tick(true);
    };
    // The weapon wheel from the keyboard (`wheel`, Tab, pilot.js `tabKey`), the mouse left captured: the arc unfolds
    // with the focus on the weapon in hand, and W A S D or the arrows move along it, each weapon highlighted taken in
    // hand at once; the arc folds itself away `WHEEL_LINGER` seconds after the last of them, back to the fight, or at
    // once on Enter, Space, E, Tab again, a weapon's number or Escape. While it is open the selector is a dialog, so
    // the movement keys reach it and not the Ooga (controls.js `uiKey`).
    const WHEEL_LINGER = 0.8;
    let wheelOpen = false, wheelTimer = 0;
    const choices = () => Array.from(fan.children);
    const wheelMove = (step) => {
      const list = choices(), at = Math.max(0, list.indexOf(document.activeElement)), b = list[(at + step + list.length) % list.length];
      b.focus({ preventScroll: true });
      tick(true);
      if (b.dataset.arm && b.dataset.arm !== purse.active) choose(b.dataset.arm);
      clearTimeout(wheelTimer); wheelTimer = setTimeout(wheelClose, WHEEL_LINGER * 1000);
    };
    const wheelClose = () => {
      clearTimeout(wheelTimer); wheelTimer = 0;
      if (!wheelOpen) return;
      wheelOpen = false;
      bar.removeAttribute("role"); bar.removeAttribute("aria-label");
      bar.removeEventListener("keydown", wheelKey);
      if (bar.contains(document.activeElement)) document.activeElement.blur();
      fold();
    };
    const wheelTake = (b) => { if (b && b.dataset.arm) { tick(false); choose(b.dataset.arm); } wheelClose(); };
    const wheelKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab") return;
      const k = e.code;
      if (k === "KeyW" || k === "KeyA" || k === "ArrowUp" || k === "ArrowLeft") wheelMove(-1);
      else if (k === "KeyS" || k === "KeyD" || k === "ArrowDown" || k === "ArrowRight") wheelMove(1);
      else if (k === "Enter" || k === "Space" || k === "KeyE") wheelTake(document.activeElement);
      else if (k === "Escape") wheelClose();
      else if (/^Digit[1-5]$/.test(k)) { key(+k.slice(5)); wheelClose(); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const wheel = () => {
      if (!bar || bar.hidden) return false;
      if (wheelOpen) { wheelTake(document.activeElement); return true; }
      if (!fan.children.length) return false;
      unfold();
      wheelOpen = true;
      bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Choose a weapon");
      bar.addEventListener("keydown", wheelKey);
      const list = choices();
      (list.find((b) => b.dataset.arm === purse.active) || list[0]).focus({ preventScroll: true });
      tick(false);
      return true;
    };
    // A weapon's number (1 to 5): in hand at once if owned, else where to get it.
    const key = (n) => {
      const w = WARES[n - 1];
      if (!w || !bar) return false;
      if (purse.owns(w.id)) { if (purse.active !== w.id) { tick(false); choose(w.id); } }
      else if (hudToast) hudToast(w.quest ? `The ${w.name.toLowerCase()} is Aras-Son's reward for Eryk's crystal` : `Buy the ${w.name.toLowerCase()} from Aras-Son at the Armory & Forge`);
      return true;
    };
    let hudToast = null;
    const draw = () => {
      if (!bar) return;
      const owned = purse.owned, active = purse.active;
      bar.hidden = !owned.length;
      if (!owned.length) fold();
      // The button: the weapon in hand.
      if (active !== shownActive) {
        shownActive = active;
        const w = active && WARES.find((q) => q.id === active);
        opener.replaceChildren();
        if (w) {
          const name = document.createElement("span"); name.textContent = w.name;
          opener.append(picture(w.id, PICTURE_PX), name, keyBadge(w));
        }
      }
      const held = active && WARES.find((q) => q.id === active);
      if (held) {
        levelPips(opener, held);
        opener.title = `${held.name}${levelText(held)} · damage ${damageText(damageOf(held))} · choose a weapon`; opener.setAttribute("aria-label", `Weapon in hand: ${held.name}${levelText(held)}. Choose a weapon`);
      }
      // The arc: in the merchant's order, whatever order they were had in.
      let at = 0;
      for (const w of WARES) {
        let b = fan.querySelector(`button[data-arm="${w.id}"]`);
        if (!owned.includes(w.id)) { if (b) b.remove(); continue; }
        if (!b) {
          b = document.createElement("button"); b.type = "button"; b.className = "keep-arm keep-arm-choice"; b.dataset.arm = w.id;
          const name = document.createElement("span"); name.textContent = w.name;
          b.append(picture(w.id, PICTURE_PX), name, keyBadge(w));
        }
        if (fan.children[at] !== b) fan.insertBefore(b, fan.children[at] || null);
        at++;
        const on = w.id === active;
        levelPips(b, w);
        b.dataset.active = String(on); b.setAttribute("aria-pressed", String(on)); b.title = `${w.name}${levelText(w)} · damage ${damageText(damageOf(w))}${on ? " · in hand" : ""}`;
        b.setAttribute("aria-label", `${w.name}${levelText(w)}`);
      }
      if (isOpen()) lay();
    };
    // The weapon in hand, in the primary's place, drawn; none puts the character's own club back and parks it.
    const arm = () => {
      if (!crew || !cave) return;
      const id = purse.active, w = cave.weapon;
      if (id) {
        crew.setClub(cave, { geometry: KM.keepWeapon(skinOf(id), cave.traits.height), rest: HOLD.rest, carry: HOLD.carry, swing: skinOf(id) === "sword4" ? "frost" : SWINGS[id] || HOLD.swing, steps: movesOf(id), pause: FIRST_MOVES[id] && purse.level(id) === 1 ? LEVEL1_PAUSE : 0 });
        w.primaryOwned = true;
        crew.selectWeapon(1, cave);
      }
      if (refresh) refresh();
    };
    const choose = (id) => { if (purse.setActive(id)) { arm(); draw(); } };
    // What is owned changed under the Ooga (a weapon taken back): the one in hand now, or the character's own club put
    // back and parked when none is left.
    const rearm = () => {
      if (crew && cave && !purse.active) { crew.selectWeapon(0, cave); crew.setClub(cave, null); cave.weapon.primaryOwned = false; if (refresh) refresh(); }
      else arm();
      draw();
    };
    return {
      WARES, LEVELS, picture, skin: () => purse.active ? skinOf(purse.active) : null, choose, damageText, damageOf, upgradePrice, levelName, levelPrice, levelDamage, rearm, redraw: () => draw(), wheel, key,
      ware: (id) => WARES.find((w) => w.id === id) || null,
      get active() { return purse.active; },
      // `audio` gives the scene's sound for the clicks.
      bind(people, driven, onChange, audio = null, toast = null) {
        crew = people; cave = driven; refresh = onChange; sound = audio; hudToast = toast;
        bar = document.getElementById("keep-arms"); opener = document.getElementById("keep-arms-open"); fan = document.getElementById("keep-arms-fan");
        fan.inert = true; shownActive = undefined;
        bar.addEventListener("click", click); bar.addEventListener("pointerover", hover);
        arm(); draw();
      },
      fold,
      // Back to the character's own club, unowned, before the scene gives back what it parked.
      release() {
        if (crew && cave) { crew.selectWeapon(0, cave); crew.setClub(cave, null); cave.weapon.primaryOwned = false; }
        wheelClose();
        if (bar) { fold(); bar.removeEventListener("click", click); bar.removeEventListener("pointerover", hover); bar.hidden = true; }
        crew = cave = refresh = bar = opener = fan = sound = hudToast = null;
      }
    };
  })();
  BL.keepArms = arms;
  const health = (() => {
    let el = null, bar = null, side = null, flash = null, count = null, shown = -1, world = null, wardUntil = 0;
    const draw = () => {
      const hp = world.keepHealth;
      if (hp === shown) return;
      shown = hp;
      el.style.setProperty("--hp", String(hp / HEALTH)); el.dataset.low = String(hp <= 3); count.textContent = String(hp);
      el.setAttribute("aria-valuenow", String(hp)); el.setAttribute("aria-valuetext", `${hp} of ${HEALTH}`);
    };
    return {
      MAX: HEALTH,
      show(w) {
        world = w;
        if (!Number.isInteger(world.keepHealth) || world.keepHealth < 1 || world.keepHealth > HEALTH) world.keepHealth = HEALTH;
        bar = document.getElementById("keep-status"); side = document.getElementById("keep-side"); el = document.getElementById("keep-health"); count = document.getElementById("keep-health-count"); flash = document.getElementById("keep-hurt");
        // The column's icons, from the land's art (keep-icon-data.js), set once.
        for (const img of side.querySelectorAll("img[data-keep-icon]")) if (!img.src) { img.src = ICONS[img.dataset.keepIcon]; fitIcon(img, img.dataset.keepIcon); }
        flash.hidden = false; shown = -1; bar.hidden = side.hidden = false; draw(); purse.show();
      },
      hide() { if (el) { bar.hidden = side.hidden = flash.hidden = true; el.removeAttribute("data-hit"); flash.removeAttribute("data-hit"); } el = bar = side = flash = count = world = null; },
      get value() { return world ? world.keepHealth : HEALTH; },
      // `n` hit points off (one unless said); true when that was the last.
      // A while nothing can hurt the visitor (the staff's rune): `ward(s)`, and `warded` while it lasts.
      ward(seconds) { wardUntil = performance.now() + seconds * 1000; },
      get warded() { return performance.now() < wardUntil; },
      hit(n = 1) {
        if (performance.now() < wardUntil) return false;
        world.keepHealth = Math.max(0, world.keepHealth - n); draw();
        for (const n of [el, flash]) { n.removeAttribute("data-hit"); void n.offsetWidth; n.dataset.hit = "1"; }
        return world.keepHealth === 0;
      },
      fill() { world.keepHealth = HEALTH; world.keepRegen = 0; draw(); },
      // A hit point back for every `REGEN` seconds spent short of full, in either of the land's scenes.
      tick(dt) {
        if (!world || world.keepHealth >= HEALTH) { if (world) world.keepRegen = 0; return; }
        world.keepRegen = (world.keepRegen || 0) + dt;
        if (world.keepRegen >= REGEN) { world.keepRegen -= REGEN; world.keepHealth += 1; draw(); }
      },
      report() { BL.net.setHealth(world.keepHealth * 100 / HEALTH, false); },
    };
  })();
  BL.keepHealth = health;
  // The land's quests, each the visitor's own: a line of steps taken in order, kept in localStorage `ooga-keep-quests`
  // (checked on load), as the land's bananas are. A quest not yet accepted has no step. The first, Eryk's Crystal: Eryk
  // at the top of the sea stair asks for the orange crystal on the small island's far beach, and for it sends the
  // visitor to Aras-Son at the Armory & Forge, who gives them a dagger (`WARES`, its `quest`).
  const QUEST_KEY = "ooga-keep-quests";
  const QUESTS = [{
    id: "crystal", title: "Eryk's Crystal", giver: "Eryk", steps: ["active", "carrying", "reward", "done"],
    text: {
      active: "Fetch the orange crystal from the back of the small island, behind the portal, and bring it to Eryk at the top of the sea stair.",
      carrying: "You have the crystal. Bring it to Eryk at the top of the sea stair.",
      reward: "Turn the two knights in the court to face each other to open the drawbridge, then cross the courtyard and go out by the east gate to Aras-Son's stall at the Armory & Forge. Tell him Eryk sent you.",
      done: "Aras-Son gave you a dagger. Earn bananas from the small island's skeletons to buy better arms."
    }
  }, {
    // Cannon Basics: Leif's first, which Red Sails waits on. The visitor rows out to Outpost Island and climbs one of
    // its towers to the cannon at the top, and three raiders come for that tower one at a time (`TOWER_QUEST`); the
    // other towers hold their fire on them. Sink all three to finish; the tower brought down, it fails and Leif hauls
    // the visitor back to the shipyard to try again.
    id: "cannon", title: "Cannon Basics", giver: "Leif", steps: ["tower", "battle", "report", "done"],
    text: {
      tower: "Take the rowboat moored along the shipyard's quay and row to Outpost Island, north of Cold Storj, with Leif's longships as your escort. Climb one of its eight towers to the cannon at the top.",
      battle: "Raiders are coming for your tower, one at a time. Man the cannon (press Space Bar beside it), aim with the mouse and click to fire. Sink all three before they bring the tower down.",
      report: "All three raiders are sunk. Go back to Leif at the shipyard.",
      done: "Leif trusts you with a cannon. He has more work for you at sea."
    }
  }, {
    // Red Sails: Leif's second, once Cannon Basics is done. Leif, the fleet's captain on the shipyard's quay, teaches the small longship and sends the visitor out
    // to sea after three raiders under red sails. The great longships and the galleon are not to be had yet
    // (`greatShips`): only the small longships.
    id: "sails", title: "Red Sails", giver: "Leif", steps: ["helm", "hunt", "report", "done"],
    text: {
      helm: "Take the small longship's wheel. She lies along the north side of the pier behind Leif at the shipyard: walk out along the pier to the wheel on her deck and press Space (HELM).",
      hunt: "Sail west, out to sea, and find the three ships with red sails (RED SAILS stands in the sky over each). W and S sail, A and D steer. Point the mouse at the water beside her and click or press Space to fire that side's guns. 1 full sail, 2 quick repair, 3 smoke screen, 4 ram. Sink all three.",
      report: "All three red-sailed ships are sunk. Sail back to the shipyard and tell Leif.",
      done: "Leif trusts you at a helm: any small longship's wheel is yours to take. The great longships and the galleon are not yours yet."
    }
  }];
  const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));
  const quests = (() => {
    let save = null;
    const subs = new Set();
    const load = () => {
      const out = {};
      try {
        const raw = JSON.parse(localStorage.getItem(QUEST_KEY) || "null");
        if (raw && typeof raw === "object") for (const q of QUESTS) if (q.steps.includes(raw[q.id])) out[q.id] = raw[q.id];
      } catch { /* A browser without storage keeps them for the page. */ }
      return out;
    };
    const state = () => save || (save = load());
    const changed = () => {
      try { localStorage.setItem(QUEST_KEY, JSON.stringify(save)); } catch { /* as above */ }
      for (const fn of subs) fn();
    };
    return {
      QUESTS,
      /** The quest's step, or null before it is accepted. */
      stage: (id) => state()[id] || null,
      /** Takes quest `id` on at its first step; true when it did. */
      accept(id) { const q = QUEST_BY_ID.get(id); if (!q || state()[id]) return false; state()[id] = q.steps[0]; changed(); return true; },
      /** Moves quest `id` on to step `to`, only from the step before it; true when it did. */
      advance(id, to) {
        const q = QUEST_BY_ID.get(id), at = state()[id];
        if (!q || !at || q.steps.indexOf(to) !== q.steps.indexOf(at) + 1) return false;
        state()[id] = to; changed(); return true;
      },
      /** Puts quest `id` back to an earlier step (a failed or abandoned try); true when it did. */
      set(id, to) {
        const q = QUEST_BY_ID.get(id), at = state()[id];
        if (!q || !at || q.steps.indexOf(to) < 0 || q.steps.indexOf(to) >= q.steps.indexOf(at)) return false;
        state()[id] = to; changed(); return true;
      },
      /** Every quest back to not yet accepted (the quest log's reset, on a debug page). */
      reset() { save = {}; changed(); },
      /** Whether any accepted quest is still under way. */
      get active() { return QUESTS.some((q) => { const at = state()[q.id]; return !!at && at !== q.steps[q.steps.length - 1]; }); },
      subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
    };
  })();
  // A conversation in a window (`#keep-talk`): the speaker's name over a line on a slab, a page at a time, Next between
  // them and on the last either Close or the choices it offers. A choice answers `pick(value)` once the window has
  // closed; ✕, Escape or a press outside it closes with no answer. `onClose` hears every close, to let the Ooga go.
  const talk = (() => {
    let dialog = null, who = null, line = null, row = null, close = null, pages = null, at = 0, pick = null, onClose = null;
    const button = (label, value, main) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = label; b.dataset.value = value;
      if (main) b.dataset.main = "1";
      return b;
    };
    const draw = () => {
      const p = pages[at], last = at === pages.length - 1;
      line.textContent = p.text;
      row.replaceChildren();
      if (last && p.choices) for (const c of p.choices) row.append(button(c.label, c.value, c.main));
      else row.append(button(last ? "Close" : "Next", last ? "close" : "next", true));
      row.firstChild.focus();
    };
    const click = (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      if (b.dataset.value === "next") { at++; draw(); return; }
      const fn = pick, value = b.dataset.value;
      pick = null; shut();
      if (fn && value !== "close") fn(value);
    };
    const shut = () => { if (dialog && dialog.open) dialog.close(); };
    const closed = () => {
      dialog.removeEventListener("close", closed); dialog.removeEventListener("click", outside); row.removeEventListener("click", click); close.removeEventListener("click", shut);
      pages = pick = null;
      const fn = onClose; onClose = null;
      if (fn) fn();
    };
    const outside = (e) => { if (e.target === dialog) shut(); };
    return {
      get open() { return !!(dialog && dialog.open); },
      /** Opens the window on `pages` ({ text, choices? }) spoken by `name`. */
      show(name, list, answer, after) {
        if (dialog && dialog.open) return false;
        dialog = document.getElementById("keep-talk"); who = document.getElementById("keep-talk-name"); line = document.getElementById("keep-talk-line"); row = document.getElementById("keep-talk-actions"); close = document.getElementById("keep-talk-close");
        pages = list; at = 0; pick = answer; onClose = after;
        who.textContent = name;
        row.addEventListener("click", click); close.addEventListener("click", shut); dialog.addEventListener("close", closed); dialog.addEventListener("click", outside);
        dialog.showModal(); draw();
        return true;
      },
      shut
    };
  })();
  // The quest log: the Quests button beside the health and bananas (`#keep-quests-open`, a dot on it while a quest is
  // under way) opens `#keep-quests`, each accepted quest with whether it is under way or done and what to do now.
  // Shown and hidden with the status by each of the land's scenes, which hand it `hold` to stop the Ooga while it is open.
  // On a debug page its Reset quests (`#keep-quests-reset`) starts every quest over while the land is built: none
  // accepted, the crystal back on its beach, and whatever a quest gave (the dagger) taken back.
  const questBook = (() => {
    let opener = null, dialog = null, list = null, close = null, hold = null, unsubscribe = null, reset = null, note = null;
    const DEBUG = new URLSearchParams(location.search).get("debug") === "1";
    const resetAll = () => {
      if (scene) scene.cannon = null;
      world.keepRedSunk = [];
      quests.reset();
      let took = false;
      for (const w of WARES) if (w.quest && purse.forget(w.id)) took = true;
      if (purse.resetLevels()) took = true;
      if (took) arms.rearm();
      note.textContent = "Quests reset. Talk to Eryk to start again.";
      reset.blur();
    };
    const mark = () => { if (opener) opener.dataset.active = String(quests.active); };
    const draw = () => {
      if (!dialog || !dialog.open) return;
      list.replaceChildren();
      for (const q of QUESTS) {
        const at = quests.stage(q.id);
        if (!at) continue;
        const done = at === q.steps[q.steps.length - 1];
        const item = document.createElement("li"), head = document.createElement("div"), title = document.createElement("span"), chip = document.createElement("span"), text = document.createElement("p");
        head.className = "keep-quest-head"; title.className = "keep-quest-title"; title.textContent = q.title;
        chip.className = "keep-quest-chip"; chip.dataset.done = String(done); chip.textContent = done ? "Complete" : "Active";
        text.className = "keep-quest-text"; text.textContent = q.text[at];
        head.append(title, chip); item.append(head, text); list.append(item);
      }
      if (!list.children.length) {
        const item = document.createElement("li");
        item.className = "keep-quest-none"; item.textContent = "No quests yet. Talk to Eryk at the top of the sea stair.";
        list.append(item);
      }
    };
    const shut = () => { if (dialog && dialog.open) dialog.close(); };
    const closed = () => { if (hold) hold(false); };
    const outside = (e) => { if (e.target === dialog) shut(); };
    const openBook = () => {
      opener.blur();
      if (dialog.open) return;
      note.textContent = "";
      if (hold) hold(true);
      dialog.showModal(); draw();
      close.focus();
    };
    const changed = () => { mark(); draw(); };
    return {
      show(onHold) {
        opener = document.getElementById("keep-quests-open"); dialog = document.getElementById("keep-quests"); list = document.getElementById("keep-quests-list"); close = document.getElementById("keep-quests-close");
        hold = onHold;
        reset = document.getElementById("keep-quests-reset"); note = document.getElementById("keep-quests-note");
        reset.hidden = !DEBUG;
        if (DEBUG) reset.addEventListener("click", resetAll);
        opener.addEventListener("click", openBook); close.addEventListener("click", shut); dialog.addEventListener("close", closed); dialog.addEventListener("click", outside);
        unsubscribe = quests.subscribe(changed);
        mark();
      },
      hide() {
        if (!opener) return;
        opener.removeEventListener("click", openBook); close.removeEventListener("click", shut); dialog.removeEventListener("click", outside); reset.removeEventListener("click", resetAll);
        shut();
        dialog.removeEventListener("close", closed);
        unsubscribe();
        opener = dialog = list = close = hold = unsubscribe = reset = note = null;
      }
    };
  })();
  quests.book = questBook;
  BL.keepQuests = quests;
  // A weapon newly gained, announced once the armory's menu has closed (scene-keep-halls.js `shop`): "New weapon", its
  // name, its picture and its line (`WARES`' `about`) in the middle of the view, swelling in, holding and fading away,
  // with the quest's chime (keep-audio.js `quest`); several gained at once are shown one after another. `stop` in each
  // scene's `leave`.
  const REVEAL_MS = 4600;
  const weaponReveal = (() => {
    let queue = [], timer = 0, audio = null;
    const next = () => {
      const el = document.getElementById("keep-weapon-reveal");
      timer = 0;
      el.removeAttribute("data-show");
      const item = queue.shift();
      if (!item) { el.hidden = true; return; }
      // An id is a weapon gained; `{ id, level }` one raised to that level.
      const id = typeof item === "string" ? item : item.id, up = typeof item === "string" ? 0 : item.level, w = arms.ware(id);
      document.getElementById("keep-weapon-reveal-kicker").textContent = up ? "Weapon upgraded" : "New weapon";
      document.getElementById("keep-weapon-reveal-name").textContent = w.name;
      document.getElementById("keep-weapon-reveal-about").textContent = up ? `Every blow of it now does ${LEVELS.power[up - 1]} times its base damage.` : w.about;
      document.getElementById("keep-weapon-reveal-damage").textContent = up ? `Level ${up} · Damage ${damageText(w.damage * LEVELS.power[up - 1])}` : `Damage ${damageText(damageOf(w))}`;
      document.getElementById("keep-weapon-reveal-picture").replaceChildren(picture(id, 160));
      el.hidden = false; void el.offsetWidth; el.dataset.show = "1";
      if (audio) audio.quest();
      timer = setTimeout(next, REVEAL_MS);
    };
    return {
      /** Announces each of `ids` (a weapon's id gained, or `{ id, level }` raised) in turn, heard through the scene's `sound` (BL.keepAudio.create). */
      show(ids, sound) {
        if (!ids.length) return;
        audio = sound; queue.push(...ids);
        if (!timer) next();
      },
      stop() {
        clearTimeout(timer); timer = 0; queue = []; audio = null;
        const el = document.getElementById("keep-weapon-reveal");
        el.hidden = true; el.removeAttribute("data-show");
      }
    };
  })();
  BL.keepWeaponReveal = weaponReveal;
  // The islet's enemies, each a jointed rig of parts hung on nodes joint from joint (keep-models.js `skeleton`, `ogre`)
  // under one set of rules, a spec apiece (`SKEL`, `OGRE`): it comes after whoever this page drives while they are on
  // the islet or its dock, running when they are far with its arms pumping against its legs, and within reach pulls its
  // weapon back and strikes forward, each blow that lands taking a hit point (`health`); back to its post when they are
  // away, and it leaves someone just stood back on the islet alone for `grace` seconds. Each page has its own.
  // `hold`, `raised` and `struck` are the weapon arm's shoulder and elbow and the weapon's own angle from straight up
  // (toward its front positive), standing, drawn back and struck.
  const SKEL = { kind: "keep-skeleton", name: "The skeleton", tip: "The islet's skeleton · keep clear of its sword", model: () => KM.skeleton(), dims: () => KM.SKELETON, hp: 3, bounty: 3, respawn: 20, bones: true, sprint: true, chase: "islet",
    walk: 2.3, run: 5.6, near: 1.7, far: 6, accel: 9, turn: 6, r: 0.38, stride: 3.1, swing: 0.9, every: [0.7, 1.3], reach: 2.3, arc: 0.9, at: 0.5, grace: 5, tall: 2, pick: 1.1,
    hold: [-0.2, -1.35, -0.08], raised: [0.95, -1.7, -0.85], struck: [-1.15, -0.1, 1.85], post: { x: 3.6, z: ARRIVE.z - 2, yaw: Math.PI } };
  const OGRE = { kind: "keep-ogre", name: "The ogre", tip: "The ogre of the keep's dungeon · keep clear of its axe", model: () => KM.ogre(), dims: () => KM.OGRE, hp: 10, bounty: 10, respawn: 30, chase: "dungeon",
    walk: 2.2, run: 5.2, near: 3.1, far: 10, accel: 6, turn: 3.6, r: 1.1, stride: 1.45, swing: 1.3, every: [0.9, 1.7], reach: 4.6, arc: 0.8, at: 0.5, grace: 6, tall: 4, pick: 2.4,
    hold: [-0.3, -1.3, -0.4], raised: [0.85, -1.7, -1.15], struck: [-0.9, -0.15, 2.45], smash: { at: 0.56, ahead: 2.9, rocks: 12, dust: 10 },
    // He runs at whoever he follows until they are within `leap.from`, then jumps on them (`leapStart`), no nearer
    // than `least` and no further above or below than `tall`, and not again for `every` s.
    leap: { from: 10, least: 4, tall: 9, wind: 0.3, time: 0.8, rise: 4.2, hit: 3, stun: 2, every: [4.5, 7] }, post: null };
  // The red troll of the arena (keep-models.js `troll`): the ogre's rig with a cannon on his shoulder
  // instead of an axe. He runs at whoever he follows until they are within `reach`, and with them before him and in
  // plain sight he braces and fires (`shot`): the wand's own fireball as one held drawn up is (`BOLT`: its look, its
  // speed, its trail, its whoosh), from the cannon's muzzle straight at where they stand as it leaves; it bursts as
  // the wand's does on the first thing it meets, `hit` wide, and past `range` where it has got to. With no clear
  // line he comes on to `close`. His swing is the brace and the recoil (`kick`).
  const TROLL = { ...OGRE, kind: "keep-troll", name: "The red troll", tip: "A red troll · sidestep its cannon's fire", model: () => KM.troll(), dims: () => KM.TROLL, hp: 8, bounty: 12, respawn: 60, chase: "arena",
    walk: 2, run: 4.2, near: 7.5, far: 10, turn: 2.6, swing: 1.5, every: [1.7, 3], reach: 10.3, arc: 0.3, at: 0.44, blow: 2, smash: null, leap: null,
    hold: [-1.2, -1.5, 0], raised: [-1.32, -1.6, 0], struck: [-0.95, -1.25, 0], shot: { range: 60, hit: 0.3, close: 4, kick: 0.22 } };
  const STORJ_OGRE = { ...OGRE, chase: "storj", tip: "An ogre of Cold Storj · its axe takes two hit points", blow: 2, respawn: 60 };
  // The green skeleton: the skeleton half again as large, in green with a glowing green sword, twice as hard to kill.
  const G = KM.GREEN_SKELETON.hip / KM.SKELETON.hip;
  const GREEN_SKEL = { ...SKEL, kind: "keep-skeleton-green", name: "The green skeleton", tip: "A green skeleton · twice as hard to bring down", model: () => KM.skeleton(true), dims: () => KM.GREEN_SKELETON,
    hp: 6, bounty: 6, near: SKEL.near * G, far: SKEL.far * G, r: SKEL.r * G, stride: SKEL.stride * 0.5, reach: SKEL.reach * G, tall: SKEL.tall * G, pick: SKEL.pick * G, run: SKEL.run * 1.1,
    // Its legs at half the white one's pace, and a small green pulse off the ground where its sword strikes it.
    pulse: { at: 0.56, ahead: 0.62, size: 6, life: 0.45 } };
  // The skeletons' posts round the islet's top, four of them, all white (the islet's green one keeps the keep's
  // dungeon now, scene-keep-halls.js, with its ogre).
  const SKEL_POSTS = [SKEL.post, { x: -3.5, z: ISLET.z - 1.5, yaw: Math.PI }];
  // How a skeleton of the castle island's forest chases (`chase: "forest"`): after the visitor once they come within
  // `aggro` of it, until they are `leash` from its post or go in at the castle's walls. The forest keeps none now.
  const FOREST = { n: 20, aggro: 14, leash: 42, gap: 9, respawn: 60 };
  // The land's enemies and what they leave (`foes`): one world of them a scene, made with what that scene answers
  // (`env`: its root, input targets, particles, sound, renderer, crew and `leaving`; `walk(ax, az, bx, bz, feet, r,
  // tall)` and `ground(x, z, feet)` over its own floor, `step`; `chase(k, p, feet)`, whether the enemy `k` comes after
  // the visitor standing at `p`; optional `route(k, tx, tz, out)`, the point it heads for on its way; and `down(cave,
  // k)`, the visitor struck down to no health). `add(spec)` stands one at its spec's `post`; `update`, `swung` (the
  // crew's `onSwing`) and `drawFlights` (the overlay) run it. The yard keeps the islet's and the forest's, the halls
  // the ogre in the basement.
  const WAY = { x: 0, z: 0 }, LANE_TOP = L.ISLET_PATH.z1 + 1.5;
  // The frost blade's lightning (`lightningStart` in each foe world, below).
  // It goes on striking for `span` s, an enemy within `reach` picked at random every `every` s (the wand's rain's
  // pace), every enemy within reach held where it stands meanwhile (a foe's `held`, as the rain holds them).
  const LIGHTNING = { span: 5, every: 0.22, freeze: 1, count: 5, reach: 10, life: 0.6, hard: 2, wide: [0.6, 0.9], flicker: 0.05, burst: 0.55, sparks: 26, quake: 0.8, variants: 4 };
  const foeWorld = (env) => {
  const st = { rumble: 0, foes: [], hurt: 0, hurtOn: null, smoke: null, smokeGrey: null, smokeT: -1, pulses: null, beam: null, beamCave: null, beamT: 0, beamBurst: -1, beamFeet: 0, eyeX: 0, eyeY: 0, eyeZ: 0, swooshes: null, rings: null, quake: 0, quakeAmp: 1, blows: [{ t: 0, charge: 0, cave: null, cut: null }, { t: 0, charge: 0, cave: null, cut: null }, { t: 0, charge: 0, cave: null, cut: null }], drops: null, flights: null, bolts: null, shots: null, pickT: 0, spellCave: null, spellT: -1, spellLead: 2, spellMote: 0, dark: 0, flash: 0, orb: null, beamWide: 7, lines: null, lineAt: 0, heldFor: 0, holdHeard: false, heldLast: 0, sky: null, skyLevel: 0, ball: null };
  const BONES_LIE = 2.2, BONES_SINK = 1.6;
  const FLASH = 0.45;
  const add = (S) => {
    const P = S.model(), D = S.dims(), node = (geometry, x, y, z) => createNode({ geometry, position: { x, y, z } });
    const k = { frozen: 0, held: 0, S, D, root: createNode({ position: { x: S.post.x, y: 0, z: S.post.z } }), x: S.post.x, z: S.post.z, y: 0, yaw: S.post.yaw, v: 0, phase: 0, swing: -1, next: 1, struck: false, stuck: 0, grace: S.grace, hp: S.hp, dead: -1, flash: 0, stagger: 0, leapT: -1, leapNext: 2, lift: 0, liftV: 0, lx0: 0, lz0: 0, ly0: 0, lx1: 0, lz1: 0, ly1: 0, shove: 0, shoveX: 0, shoveZ: 0, legs: [], knees: [], cape: null };
    k.y = env.ground(k.x, k.z, S.post.y === undefined ? 4 : S.post.y + 0.5); k.root.position.y = k.y; k.root.rotation.y = k.yaw;
    k.body = node(P.torso, 0, D.hip, 0); k.head = node(P.head, 0, D.neck, 0);
    addChild(k.body, k.head);
    if (P.cape) { k.cape = node(P.cape, 0, D.neck, -0.24); addChild(k.body, k.cape); }
    for (const sx of [-1, 1]) {
      const arm = node(P.upperArm, sx * D.shoulderX, D.shoulderY, 0), fore = node(sx > 0 && P.forearmL || P.forearm, 0, -D.elbow, 0), leg = node(P.thigh, sx * D.hipX, D.hip, 0), knee = node(P.shin, 0, -D.knee, 0);
      addChild(arm, fore); addChild(k.body, arm); addChild(leg, knee); addChild(k.root, leg);
      k.legs.push(leg); k.knees.push(knee);
      if (sx < 0) { k.armR = arm; k.foreR = fore; if (P.sword) { k.sword = createNode({ geometry: P.sword, position: { x: 0, y: -D.grip, z: D.gripZ || 0.06 }, rotation: { x: 0, y: 0, z: 0 } }); addChild(fore, k.sword); } }
      else { k.armL = arm; k.foreL = fore; }
    }
    // A troll's cannon, lying on his shoulder.
    if (P.shoulder) { k.gun = node(P.shoulder, D.cannon.x, D.cannon.y, D.cannon.z); addChild(k.body, k.gun); }
    addChild(k.root, k.body);
    addChild(env.root, k.root);
    // A skeleton falls apart: a bone of its own for each part, hidden until then.
    if (S.bones) {
      k.parts = [k.head, k.body, k.armR, k.foreR, k.armL, k.foreL, k.legs[0], k.knees[0], k.legs[1], k.knees[1], k.sword];
      if (k.cape) k.parts.push(k.cape);
      k.bones = k.parts.map((part) => {
        const n = createNode({ geometry: part.geometry, visible: false });
        addChild(env.root, n);
        return { n, vx: 0, vy: 0, vz: 0, sx: 0, sz: 0, rest: 0, ground: 0, down: false };
      });
    }
    env.input.add(k.body, { kind: S.kind }, { radius: S.pick });
    env.targets.push(k.body);
    st.foes.push(k);
  };
  const foeHome = (k) => {
    const S = k.S;
    k.x = S.post.x; k.z = S.post.z; k.y = env.ground(k.x, k.z, S.post.y === undefined ? 4 : S.post.y + 0.5); k.root.position.y = k.y; k.yaw = S.post.yaw; k.v = 0; k.swing = -1; k.struck = false; k.grace = S.grace; k.next = 1;
    k.hp = S.hp; k.dead = -1; k.stagger = 0; k.blind = false; k.leapT = -1; k.leapNext = 2; k.lift = 0; k.liftV = 0; k.root.visible = true; k.root.rotation.x = 0;
    if (k.ash) { k.ash = false; char(k.root, 0); }
    if (k.bones) for (let i = 0; i < k.bones.length; i++) k.bones[i].n.visible = false;
  };
  // A blow landed: a hit point off, the struck Ooga glowing red, and with none left the visitor stands back on the
  // islet, whole, every enemy back at its post.
  const redden = (node, v) => { node.ember = v; for (let i = 0; i < node.children.length; i++) redden(node.children[i], v); };
  const foeHit = (k, cave) => {
    // Warded (the staff's rune): no blow lands.
    if (health.warded) return;
    const p = cave.root.position;
    env.audio().cut(p.x, p.y, p.z);
    st.hurt = FLASH; st.hurtOn = cave;
    if (!health.hit(k.S.blow || 1)) return;
    for (let i = 0; i < st.foes.length; i++) if (st.foes[i].dead < 0) foeHome(st.foes[i]);
    env.down(cave, k);
  };
  // The ogre's axe on the ground: the smash heard, chunks of rock thrown up and out and dust rolling out to both
  // sides of the blow, low over the ground, from the scene's particles.
  // A green skeleton's sword meeting the ground: a small green ring shot out over it from where the blade struck
  // (`S.pulse`, its place ahead of the skeleton as a share of its reach). A fixed pool, the oldest reused.
  const PULSES = 6;
  const foePulse = (k) => {
    const M = k.S.pulse;
    if (!st.pulses) {
      st.pulses = [];
      for (let i = 0; i < PULSES; i++) { const n = createNode({ geometry: KM.greenRing(), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }); addChild(env.root, n); st.pulses.push({ n, t: 1, life: 1, size: 1 }); }
    }
    let w = st.pulses[0];
    for (let i = 0; i < st.pulses.length; i++) if (st.pulses[i].t / st.pulses[i].life > w.t / w.life) w = st.pulses[i];
    const x = k.x + Math.sin(k.yaw) * k.S.reach * M.ahead, z = k.z + Math.cos(k.yaw) * k.S.reach * M.ahead;
    w.n.position.x = x; w.n.position.y = env.ground(x, z, k.y + 1) + 0.07; w.n.position.z = z;
    w.t = 0; w.life = M.life; w.size = M.size;
  };
  const pulsesUpdate = (dt) => {
    if (!st.pulses) return;
    for (let i = 0; i < st.pulses.length; i++) {
      const w = st.pulses[i];
      if (w.t >= w.life) { w.n.visible = false; continue; }
      w.t += dt;
      const k = Math.min(1, w.t / w.life), s = 0.4 + w.size * (1 - (1 - k) * (1 - k));
      w.n.visible = k < 1; w.n.scale.x = w.n.scale.y = s; w.n.smokeOpacity = 0.85 * (1 - k);
    }
  };
  const foeSmash = (k) => {
    const M = k.S.smash, fx0 = Math.sin(k.yaw), fz0 = Math.cos(k.yaw), x = k.x + fx0 * M.ahead, z = k.z + fz0 * M.ahead, y = env.ground(x, z, k.y + 2), G = KM.smash();
    env.audio().smash(x, y, z);
    for (let i = 0; i < M.rocks; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4.5;
      env.fx.spawnParticle(G.rocks[i % G.rocks.length], x + Math.cos(a) * 0.4, y + 0.15, z + Math.sin(a) * 0.4, Math.cos(a) * sp, 3 + Math.random() * 4.5, Math.sin(a) * sp, 0.9 + Math.random() * 0.6, 9, 14, y + 0.05);
    }
    for (let i = 0; i < M.dust; i++) {
      // Out to the left and the right of the blow, a few along it.
      const side = i % 2 ? 1 : -1, along = (Math.random() - 0.5) * 2.2, sp = (3 + Math.random() * 4) * side;
      const p = env.fx.spawnParticle(G.dust[i % G.dust.length], x + fx0 * along * 0.3, y + 0.25 + Math.random() * 0.3, z + fz0 * along * 0.3, fz0 * sp + fx0 * along, 0.5 + Math.random() * 0.9, -fx0 * sp + fz0 * along, 0.7 + Math.random() * 0.5, 1.2);
      if (p) p.smoke = true;
    }
  };
  // The visitor's own blows (crew.js `onSwing`): a moment after the swing starts, as its blade comes round, every
  // enemy before the driven Ooga within its weapon's reach takes the weapon's damage, more for a charged blow.
  // A sword's three cuts (crew.js `COMBO`, the step the crew names) each land their own way: the cross slash as any
  // blow, the backhand sweep wide to both sides, the overhead cut later, further out, twice as hard and knocking back.
  const HIT_AFTER = 0.16, HIT_ARC = 1.05;
  const CUTS = [
    { after: 0.15, arc: 1.05, reach: 0, hard: 1, push: 1, tilt: -0.75 },
    { after: 0.16, arc: 1.75, reach: 0, hard: 1, push: 1, tilt: 0.12 },
    { after: 0.4, arc: 4, reach: 0.2, hard: 2, push: 2.2, tilt: 0, spin: Math.PI * 2, life: 1, lead: 0.16 },
    { after: 0.88, arc: 0, reach: 0, hard: 2, push: 0, tilt: Math.PI / 2, slam: true },
  ];
  // The slam (the fourth cut) as the blade meets the ground: the view shaken, every enemy within SLAM.reach of the
  // Ooga struck and thrown SLAM.throw further out, rock and dust flung up and white rings rolling out over the ground
  // at once (as a ghost hunt's drop's do). Fixed pools.
  const SLAM = { reach: 2, throw: 4.5, speed: 26, fling: 7, quake: 0.7, settle: 0.6, rings: 3, every: 0.05, life: 0.55, size: 10, ring: 0.42, disc: 0.3, rocks: 30, dust: 0, smoke: 24, sparks: 40, spark: 7, from: 0.5, out: 4.5, rise: 0.35, start: 0.55, swell: 1.8, smokeLife: 0.55, fade: 0.6 };
  // The smoke's balls: the island's cartoon puff in pale greys, one geometry, a fixed pool.
  // A white orb of light that explodes outward from the Ooga as the slam lands (`slamDown`) and fades quickly, turned
  // to face the view (the eye `shake` is handed each frame). Nothing shows through the jump.
  const BEAM = { size: 1.6, burst: 0.28, wide: 7, flare: 1.7, chest: 0.55 };
  const beamOn = (cave) => {
    if (!st.beam) { st.beam = createNode({ geometry: KM.whiteOrb(), visible: false, sightHidden: true }); addChild(env.root, st.beam); }
    st.beam.geometry = fxOf().orb();
    st.beamCave = cave; st.beamT = 0; st.beamBurst = -1; st.beamWide = BEAM.wide;
  };
  const beamUpdate = (dt) => {
    const b = st.beam, cave = st.beamCave;
    if (!b || !cave) return;
    st.beamT += dt;
    if (st.beamBurst >= 0) st.beamBurst += dt;
    const k = st.beamBurst >= 0 ? st.beamBurst / BEAM.burst : 0;
    if (k >= 1 || st.beamT > 3) { b.visible = false; st.beamCave = null; return; }
    if (st.beamBurst < 0) { b.visible = false; return; }
    const p = cave.root.position, feet = st.beamBurst >= 0 ? st.beamFeet : p.y - cave.baseY, out = 1 - (1 - k) * (1 - k) * (1 - k);
    const y = feet + cave.traits.height * BEAM.chest, size = BEAM.size * (1 + (st.beamWide - 1) * out);
    b.visible = true;
    b.position.x = p.x; b.position.y = y; b.position.z = p.z;
    const dx = st.eyeX - p.x, dy = st.eyeY - y, dz = st.eyeZ - p.z;
    b.rotation.y = Math.atan2(dx, dz); b.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
    b.scale.x = b.scale.y = size; b.scale.z = 1;
    // Brightest the instant it lands, then fading fast as it spreads.
    b.smokeOpacity = BEAM.flare * (1 - k) * (1 - k);
  };
  // The slam's smoke, pale grey.
  const puffOf = (tones, glow) => {
    const g = { verts: [], faces: [], lines: [], castShadow: false };
    BL.hubModels.puff(g, 0, 0, 0, 0.56, 0.48, 0.56, tones.map(BL.math.hexToRgb), BL.math.mulberry32(11));
    // Lit a little from within, so it reads as smoke and not stone under the night sky.
    for (let i = 0; i < g.faces.length; i++) g.faces[i].emissive = Math.max(g.faces[i].emissive || 0, glow);
    return g;
  };
  // Every weapon's effects alike: white swooshes, the slam's white ground rings, glow and orb, and pale grey smoke.
  const FX = { swoosh: KM.swoosh, orb: KM.whiteOrb, ring: KM.whiteRing, disc: KM.whiteDisc, smoke: "smokeGrey" };
  // The frost blade's cuts sweep fire: its swoosh a sheet of flame, with flames lit along its arc as it goes.
  const FIRE_FX = { ...FX, swoosh: KM.fireSwoosh, fire: true };
  // The frost blade's and the maul's swooshes are fire.
  const fxOf = () => arms.skin() === "sword4" || arms.active === "axe" ? FIRE_FX : FX;
  const buildSmoke = () => {
    st.smokeGrey = puffOf(["#9d9891", "#b8b3ab", "#d2cdc5", "#e8e4de"], 0.18);
    const g = st.smokeGrey;
    st.smoke = [];
    for (let i = 0; i < SLAM.smoke; i++) { const n = createNode({ geometry: g, visible: false, sightHidden: true }); addChild(env.root, n); st.smoke.push({ n, cx: 0, cz: 0, y: 0, ux: 0, uz: 0, out: 0, size: 1, spin: 0 }); }
  };
  const buildRings = () => {
    st.rings = [];
    for (let i = 0; i < SLAM.rings + 1; i++) {
      const n = createNode({ geometry: i < SLAM.rings ? KM.whiteRing() : KM.whiteDisc(), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } });
      addChild(env.root, n); st.rings.push({ n, t: -1 });
    }
  };
  // The slam's debris: small cubes of the ground's rock, smaller than the ogre's smash throws up.
  const SLAM_ROCKS = [["#2f2c2a", 0.12], ["#45413d", 0.09], ["#1f1d1c", 0.07], ["#5a554f", 0.1], ["#3a3633", 0.06]].map(([color, w]) => BL.models.box({ w, h: w, d: w, color }));
  const slamDown = (cave, b) => {
    const people = env.crew(), w = arms.ware(arms.active), p = cave.root.position, yaw = cave.root.rotation.y;
    const x = p.x + Math.sin(yaw) * 0.6, z = p.z + Math.cos(yaw) * 0.6, y = env.ground(x, z, p.y - cave.baseY + 1);
    env.audio().slam(x, y, z);
    // The maul's slam also lets the staff's pulse go from where it lands (`pulseStart`), heard as its own.
    if (arms.active === "axe") pulseStart(cave, true);
    // The orb explodes outward from where the Ooga landed.
    if (st.beamCave === cave) { st.beamBurst = 0; st.beamFeet = y; }
    // A ring of thick smoke pushed out over the ground from where the Ooga landed.
    if (!st.smoke) buildSmoke();
    st.smokeT = 0;
    const tone = st[fxOf().smoke];
    for (let i = 0; i < st.smoke.length; i++) {
      const m = st.smoke[i], a = (i + (Math.random() - 0.5) * 0.6) / st.smoke.length * Math.PI * 2;
      m.cx = p.x; m.cz = p.z; m.y = y + 0.25 + Math.random() * 0.15; m.ux = Math.cos(a); m.uz = Math.sin(a);
      m.out = SLAM.out * (0.85 + Math.random() * 0.3); m.size = SLAM.start * (0.8 + Math.random() * 0.4); m.spin = (Math.random() - 0.5) * 2.4;
      m.n.rotation.x = Math.random() * 6; m.n.rotation.y = Math.random() * 6; m.n.visible = true; m.n.geometry = tone;
    }
    env.audio().sword(x, y + 1, z);
    // Sword and maul alike shake the view hard as they slam.
    st.quake = SLAM.settle; st.quakeAmp = 1;
    // Every slam throws fire out every way.
    for (let i = 0; i < SLAM.sparks; i++) {
      const a = i / SLAM.sparks * Math.PI * 2 + Math.random() * 0.2, sp = SLAM.spark * (0.7 + Math.random() * 0.6);
      env.fx.spawnParticle(BOLT_BITS[i % BOLT_BITS.length], p.x, y + 0.9 + Math.random() * 0.6, p.z, Math.cos(a) * sp, 1 + Math.random() * 3, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, 8, 2, y);
    }
    if (!st.rings) buildRings();
    const tint = fxOf();
    for (let i = 0; i < st.rings.length; i++) { const r = st.rings[i]; r.n.geometry = i < SLAM.rings ? tint.ring() : tint.disc(); r.t = -i * SLAM.every; r.n.position.x = p.x; r.n.position.y = y + 0.06 + i * 0.01; r.n.position.z = p.z; }
    const G = KM.smash();
    // Rocks thrown up and out of the ground where the blade went in, every way.
    for (let i = 0; i < SLAM.rocks; i++) {
      const a = (i + Math.random() * 0.8) / SLAM.rocks * Math.PI * 2, sp = 1.5 + Math.random() * 3;
      env.fx.spawnParticle(SLAM_ROCKS[i % SLAM_ROCKS.length], x + Math.cos(a) * 0.15, y + 0.1, z + Math.sin(a) * 0.15, Math.cos(a) * sp, 7 + Math.random() * 5, Math.sin(a) * sp, 1.4 + Math.random() * 0.6, 12, 16, y + 0.05);
    }
    for (let i = 0; i < SLAM.dust; i++) {
      const a = i / SLAM.dust * Math.PI * 2, sp = 3 + Math.random() * 3;
      const d = env.fx.spawnParticle(G.dust[i % G.dust.length], p.x + Math.cos(a) * 0.5, y + 0.2, p.z + Math.sin(a) * 0.5, Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp, 0.7 + Math.random() * 0.4, 1.2);
      if (d) d.smoke = true;
    }
    if (!w || !people || cave !== people.player) return;
    const feet = p.y - cave.baseY;
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0) continue;
      const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz);
      if (d - k.S.r > SLAM.reach || feet < k.y - 1 || feet > k.y + k.S.tall) continue;
      const ux = d > 1e-3 ? dx / d : Math.sin(yaw), uz = d > 1e-3 ? dz / d : Math.cos(yaw);
      foeHurt(k, damageOf(w) * b.cut.hard * (1 + b.charge), ux, uz, 0);
      // Thrown back fast along the ground, stopped by whatever it meets (`foeUpdate`), standing or fallen; a skeleton
      // the blow broke apart has its bones flung out that way instead.
      k.shove = SLAM.throw; k.shoveX = ux; k.shoveZ = uz; k.stagger = Math.max(k.stagger, 0.8);
      if (k.dead >= 0 && k.bones) {
        k.shove = 0;
        for (let j = 0; j < k.bones.length; j++) { const bone = k.bones[j]; bone.vx += ux * SLAM.fling; bone.vz += uz * SLAM.fling; bone.vy += 0.5; }
      }
    }
  };
  const slamUpdate = (dt) => {
    if (st.quake > 0) st.quake = Math.max(0, st.quake - dt);
    if (st.rumble > 0) st.rumble = Math.max(0, st.rumble - dt);
    if (st.smokeT >= 0) {
      st.smokeT += dt;
      const k = Math.min(1, st.smokeT / SLAM.smokeLife), go = 1 - (1 - k) * (1 - k) * (1 - k), shrink = k < 1 - SLAM.fade ? 1 : (1 - k) / SLAM.fade;
      for (let i = 0; i < st.smoke.length; i++) {
        const m = st.smoke[i], n = m.n, r = SLAM.from + (m.out - SLAM.from) * go, s = m.size * (1 + (SLAM.swell - 1) * go) * shrink;
        n.position.x = m.cx + m.ux * r; n.position.y = m.y + SLAM.rise * go; n.position.z = m.cz + m.uz * r;
        n.rotation.y += m.spin * dt; n.rotation.x += m.spin * 0.6 * dt;
        n.scale.x = n.scale.y = n.scale.z = s; n.visible = k < 1;
      }
      if (k >= 1) st.smokeT = -1;
    }
    if (!st.rings) return;
    for (let i = 0; i < st.rings.length; i++) {
      const r = st.rings[i];
      if (r.t >= SLAM.life || r.t === -1) { r.n.visible = false; continue; }
      r.t += dt;
      const k = r.t / SLAM.life, disc = i === st.rings.length - 1;
      r.n.visible = r.t > 0 && k < 1;
      if (!r.n.visible) { if (k >= 1) r.t = SLAM.life; continue; }
      const size = disc ? 2.2 + 2.5 * k : 1 + SLAM.size * (1 - (1 - k) * (1 - k));
      // Soft: faint, and fading in as well as out.
      r.n.scale.x = r.n.scale.y = size; r.n.smokeOpacity = (disc ? SLAM.disc * (1 - k) * (1 - k) : SLAM.ring * Math.min(1, k * 20) * (1 - k) * (1 - k));
    }
  };
  // The view shaken while the slam settles: put on after the camera is placed (`shake`), taken off before it moves
  // again (`unshake`).
  const QUAKE = { on: false, x: 0, y: 0, z: 0 };
  const shake = (camera) => {
    st.eyeX = camera.position.x; st.eyeY = camera.position.y; st.eyeZ = camera.position.z;
    if (QUAKE.on || (st.quake <= 0 && st.rumble <= 0)) return;
    // The slam's jolt, and the long rumble of the staff's rune (`RUNE.shake`), easing off over its last second.
    const a = (st.quake > 0 ? SLAM.quake * st.quakeAmp * (st.quake / SLAM.settle) ** 2 : 0) + (st.rumble > 0 ? RUNE.amp * Math.min(1, st.rumble) : 0);
    QUAKE.x = (Math.random() - 0.5) * 2 * a; QUAKE.y = (Math.random() - 0.5) * 2 * a; QUAKE.z = (Math.random() - 0.5) * 2 * a;
    camera.position.x += QUAKE.x; camera.position.y += QUAKE.y; camera.position.z += QUAKE.z;
    camera.target.x += QUAKE.x * 0.6; camera.target.y += QUAKE.y * 0.6; camera.target.z += QUAKE.z * 0.6;
    QUAKE.on = true;
  };
  const unshake = (camera) => {
    if (!QUAKE.on) return;
    QUAKE.on = false;
    camera.position.x -= QUAKE.x; camera.position.y -= QUAKE.y; camera.position.z -= QUAKE.z;
    camera.target.x -= QUAKE.x * 0.6; camera.target.y -= QUAKE.y * 0.6; camera.target.z -= QUAKE.z * 0.6;
  };
  // Each cut throws a white swoosh of light out just past the blade's reach, in the plane the blade cut through, and
  // the blow lands as far out as it goes. A fixed pool of three.
  const SWOOSH = { reach: 0.6, life: 0.24, grow: 0.35 };
  const SW_FLAT = BL.math.quat.create(), SW_TILT = BL.math.quat.create(), SW_YAW = BL.math.quat.create();
  BL.math.quat.fromAxisAngle(SW_FLAT, 1, 0, 0, Math.PI / 2);
  const buildSwooshes = () => {
    st.swooshes = [];
    for (let i = 0; i < 3; i++) { const n = createNode({ geometry: KM.swoosh(), visible: false, sightHidden: true }); n.quaternion = BL.math.quat.create(); addChild(env.root, n);
      // Its other face, since a picture shows from one side only.
      const back = createNode({ geometry: KM.swoosh(), sightHidden: true, rotation: { x: 0, y: Math.PI, z: 0 } }); addChild(n, back);
      st.swooshes.push({ n, back, t: 0, size: 1, yaw: 0, spin: 0, cave: null, life: SWOOSH.life, plane: BL.math.quat.create(), fire: false, from: 1, lit: 0 });
    }
  };
  const swooshOut = (cave, cut, reach) => {
    if (!st.swooshes) buildSwooshes();
    let w = st.swooshes[0];
    for (let i = 0; i < st.swooshes.length; i++) { if (st.swooshes[i].t <= 0) { w = st.swooshes[i]; break; } }
    const p = cave.root.position, q = BL.math.quat;
    // The frost blade's swoosh is fire, every other weapon's white.
    const look = fxOf();
    w.n.geometry = w.back.geometry = look.swoosh();
    w.fire = !!look.fire; w.from = cut === CUTS[1] ? 1 : -1; w.lit = 0;
    q.fromAxisAngle(SW_TILT, 0, 0, 1, cut.tilt);
    q.multiply(w.plane, SW_TILT, SW_FLAT);
    w.yaw = cave.root.rotation.y - (cut.spin ? 1.3 : 0); w.spin = cut.spin || 0; w.cave = cave; w.life = cut.life || (w.fire ? SWEEP.life : SWOOSH.life);
    q.fromAxisAngle(SW_YAW, 0, 1, 0, w.yaw);
    q.multiply(w.n.quaternion, SW_YAW, w.plane);
    w.n.position.x = p.x; w.n.position.y = p.y + 0.3 * cave.traits.height; w.n.position.z = p.z;
    w.size = reach / 0.9; w.t = w.life;
  };
  // A fire swoosh's sweep: while it shows, flames are lit along its arc from one horn to the other (a spinning cut's
  // all round as it goes), each a bit of fire from the scene's particles thrown out along the arc and rising as it
  // dies. `rate` flames a second, the arc swept in the first `over` of the swoosh's life.
  const SWEEP = { life: 0.34, rate: 150, over: 0.55, arc: Math.PI / 3, life0: 0.22, life1: 0.3, out: 2.6, rise: 2.2 };
  const SWEEP_BITS = [["#ff7a1a", 0.13], ["#ffb347", 0.1], ["#ffe9a0", 0.07], ["#ff4d12", 0.12], ["#ffd070", 0.09]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const SWEEP_AT = [0, 0, 0];
  const turned = (out, q, x, y, z) => {
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3], tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    out[0] = x + qw * tx + qy * tz - qz * ty; out[1] = y + qw * ty + qz * tx - qx * tz; out[2] = z + qw * tz + qx * ty - qy * tx;
    return out;
  };
  const sweepFire = (w, k, size, dt) => {
    w.lit += SWEEP.rate * dt;
    const head = Math.min(1, k / SWEEP.over), P = w.n.position;
    while (w.lit >= 1) {
      w.lit -= 1;
      // Where along the arc: at the sweep's head, or anywhere behind it once it has gone by.
      const along = w.spin ? Math.random() : Math.max(0, head - Math.random() * 0.22), a = w.from * (along * 2 - 1) * SWEEP.arc, r = (0.72 + Math.random() * 0.24) * size;
      turned(SWEEP_AT, w.n.quaternion, Math.sin(a) * r, Math.cos(a) * r, 0);
      const ux = SWEEP_AT[0] / r, uy = SWEEP_AT[1] / r, uz = SWEEP_AT[2] / r, sp = SWEEP.out * (0.4 + Math.random() * 0.8);
      env.fx.spawnParticle(SWEEP_BITS[(Math.random() * SWEEP_BITS.length) | 0], P.x + SWEEP_AT[0], P.y + SWEEP_AT[1], P.z + SWEEP_AT[2], ux * sp, uy * sp + SWEEP.rise * Math.random(), uz * sp, SWEEP.life0 + Math.random() * SWEEP.life1, 9, -1.5, -1e3);
    }
  };
  // The frost blade in the visitor's hand burns: small flames stand off both its edges, flickering, each a node on
  // the blade itself (`KM.FROST.flames`), and embers lift off it into the air from the scene's particles. Only while
  // it is drawn.
  const BLADE = { ember: 0.06, rise: 0.9, drift: 0.35, life: 0.45 };
  const BLADE_BITS = [["#ff7a1a", 0.05], ["#ffb347", 0.04], ["#ffe9a0", 0.03]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const blade = { cave: null, flames: [], due: 0 };
  const bladeWide = KM.FROST.wide;
  // Where along each the embers lift off it, as shares of its length up from the grip, and how far either side.
  // `axe` the maul's head, at its fourth level only.
  const DUSTED = { dagger: [0.3, 1, 0.12], wand: [0.1, 1, 0.08], staff: [0.55, 1, 0.3], axe: [0.72, 1, 0.22] };
  const dustOff = (dt, cave, club, D) => {
    blade.due -= dt;
    if (blade.due > 0) return;
    blade.due = BLADE.ember * (0.6 + Math.random() * 0.8);
    const top = BL.scene.boundsOf(club.geometry).max[1], y = top * (D[0] + Math.random() * (D[1] - D[0])), side = cave.traits.height * D[2] * (Math.random() * 2 - 1);
    BL.math.mat4.transformPoint(SWEEP_AT, club.world, 0, y, side);
    env.fx.spawnParticle(BLADE_BITS[(Math.random() * BLADE_BITS.length) | 0], SWEEP_AT[0], SWEEP_AT[1], SWEEP_AT[2], (Math.random() - 0.5) * BLADE.drift, BLADE.rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * BLADE.drift, BLADE.life * (0.6 + Math.random() * 0.8), 8, -0.6, -1e3);
  };
  const bladeUpdate = (dt, elapsed) => {
    const people = env.crew(), cave = people && people.player, club = cave && cave.parts.club;
    const skin = arms.skin(), drawn = !!club && cave.weapon.primaryEquipped && cave.root.visible !== false;
    // The dagger, the wand and the staff carry the same dust of embers off them, without the blade's flames.
    if (drawn && DUSTED[skin] && (skin !== "axe" || purse.level("axe") === LEVEL_MAX)) { for (let i = 0; i < blade.flames.length; i++) blade.flames[i].visible = false; dustOff(dt, cave, club, DUSTED[skin]); return; }
    const on = drawn && skin === "sword4";
    if (!on) { for (let i = 0; i < blade.flames.length; i++) blade.flames[i].visible = false; return; }
    const F = KM.FROST, u = cave.traits.height / 16 * F.cell, Y0 = F.blade[0], span = F.blade[1] - Y0;
    if (blade.cave !== cave) {
      // Another Ooga's blade (a new visit): the flames go onto its club; the last one's went with it.
      blade.cave = cave; blade.flames.length = 0;
      for (let i = 0; i < F.flames.length; i++) { const n = createNode({ geometry: KM.bladeFlame(), sightHidden: true }); addChild(club, n); blade.flames.push(n); }
    }
    for (let i = 0; i < blade.flames.length; i++) {
      const n = blade.flames[i], [f, edge, big] = F.flames[i], lick = 0.75 + 0.3 * Math.sin(elapsed * (11 + i * 1.7) + i * 2.1) + 0.12 * Math.sin(elapsed * 23 + i);
      n.visible = true;
      n.position.x = 0; n.position.y = (Y0 + f * span) * u; n.position.z = edge * bladeWide(f) * u;
      // Leaning out from its edge and a little up the blade.
      n.rotation.x = Math.sign(edge) * (0.95 + 0.2 * Math.sin(elapsed * 7 + i * 1.3));
      const size = big * cave.traits.height * 0.75;
      n.scale.x = n.scale.z = size * (0.85 + 0.15 * lick); n.scale.y = size * lick;
    }
    blade.due -= dt;
    if (blade.due > 0) return;
    blade.due = BLADE.ember * (0.6 + Math.random() * 0.8);
    const f = Math.random(), z = (Math.random() * 2 - 1) * bladeWide(f) * u;
    BL.math.mat4.transformPoint(SWEEP_AT, club.world, 0, (Y0 + f * span) * u, z);
    env.fx.spawnParticle(BLADE_BITS[(Math.random() * BLADE_BITS.length) | 0], SWEEP_AT[0], SWEEP_AT[1], SWEEP_AT[2], (Math.random() - 0.5) * BLADE.drift, BLADE.rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * BLADE.drift, BLADE.life * (0.6 + Math.random() * 0.8), 8, -0.6, -1e3);
  };
  const swooshUpdate = (dt) => {
    if (!st.swooshes) return;
    for (let i = 0; i < st.swooshes.length; i++) {
      const w = st.swooshes[i];
      if (w.t <= 0) continue;
      w.t -= dt;
      const k = 1 - Math.max(0, w.t) / w.life;
      // A spinning cut's swoosh goes round with the blade, as far as the body has spun.
      if (w.spin) { BL.math.quat.fromAxisAngle(SW_YAW, 0, 1, 0, w.yaw + w.cave.comboSpin); BL.math.quat.multiply(w.n.quaternion, SW_YAW, w.plane); }
      const size = w.size * (1 - SWOOSH.grow + SWOOSH.grow * k);
      // A spinning cut's swoosh shows only while the body unwinds.
      const stroke = w.spin ? w.cave.comboStroke : 0;
      w.n.visible = w.t > 0 && (!w.spin || stroke > 0 && stroke < 1);
      if (w.fire && w.n.visible) sweepFire(w, w.spin ? stroke : k, size, dt);
      w.n.scale.x = w.n.scale.y = w.n.scale.z = size; w.n.smokeOpacity = w.back.smokeOpacity = w.spin ? Math.min(1, stroke * 6, (1 - stroke) * 3) : (1 - k) * (1 - k);
    }
  };
  // The wand's fireball (crew.js `CAST`, the crew's `onCast`): a ball of orange fire off the wand's tip, flying where
  // the crosshair points (the pilot's `aimTarget`, as a rifle's round does; straight ahead, level, where the view looks
  // back at the Ooga or there is none), and onto an enemy within `far` m that lies within `assist` rad of that line or
  // its own width past it, the nearest to the line, trailing sparks, bursting on the first enemy it meets (the wand's damage, more for a charged cast) or on whatever
  // stands in its way (the scene's `air`), and past `range` where it has got to. An enemy it meets is thrown back `throw` m along
  // its flight (a skeleton it breaks apart has its bones flung that way). Its whoosh, burst and sparks are at `level`
  // of the cannon's. A fixed pool.
  const BOLT = { pool: 16, v: 0.32, tap: 0.5, level: 0.5, speed: 44, step: 0.35, range: 70, far: 60, assist: 0.06, size: 0.95, chest: 0.6, ahead: 0.75, side: 0.12, hit: 0.3, push: 0.7, throw: 3, fling: 5, trail: 0.022, sparks: 14 };
  const BOLT_BITS = [["#ff7a1a", 0.09], ["#ffb347", 0.07], ["#ffe9a0", 0.05], ["#d9480f", 0.08]].map(([color, w]) => BL.models.box({ w, h: w, d: w, color, emissive: 1 }));
  const bolts = () => {
    if (!st.bolts) {
      st.bolts = [];
      for (let i = 0; i < BOLT.pool; i++) {
        const n = createNode({ geometry: KM.fireball(), visible: false, sightHidden: true, scale: { x: BOLT.size, y: BOLT.size, z: BOLT.size } });
        addChild(env.root, n);
        st.bolts.push({ n, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gone: 0, trail: 0, damage: 0, burst: 1, live: false });
      }
    }
    return st.bolts;
  };
  const AIM_AT = { x: 0, y: 0, z: 0 };
  const cast = (cave, charge, aimAt) => {
    const w = arms.ware(arms.active), people = env.crew();
    if (!w || !people || cave !== people.player) return;
    const p = cave.root.position, yaw = cave.root.rotation.y + (cave.weapon.aiming ? cave.weapon.aimYaw : 0), feet = p.y - cave.baseY, h = cave.traits.height;
    const fx0 = Math.sin(yaw), fz0 = Math.cos(yaw);
    // Off the wand's tip: before the right shoulder, at the chest.
    const x = p.x + fx0 * BOLT.ahead - fz0 * BOLT.side, y = feet + h * BOLT.chest, z = p.z + fz0 * BOLT.ahead + fx0 * BOLT.side;
    let dx = fx0, dy = 0, dz = fz0;
    if (aimAt) {
      aimAt(AIM_AT);
      const ax = AIM_AT.x - x, ay = AIM_AT.y - y, az = AIM_AT.z - z, l = Math.hypot(ax, ay, az);
      if (l > 0.5 && ax * fx0 + az * fz0 > 0.2 * Math.hypot(ax, az)) { dx = ax / l; dy = ay / l; dz = az / l; }
    }
    let best = Infinity, tx = dx, ty = dy, tz = dz;
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0) continue;
      const ex = k.x - x, ey = k.y + k.D.hip * 1.1 - y, ez = k.z - z, d = Math.hypot(ex, ey, ez);
      if (d > BOLT.far || d < 0.01) continue;
      const off = Math.acos(Math.max(-1, Math.min(1, (ex * dx + ey * dy + ez * dz) / d)));
      if (off < best && off < Math.max(BOLT.assist, Math.atan2(k.S.r + BOLT.hit, d))) { best = off; tx = ex / d; ty = ey / d; tz = ez / d; }
    }
    dx = tx; dy = ty; dz = tz;
    // The staff's cast held drawn up lets its pulse go instead (`pulseStart`); a tap throws its purple spell.
    const spirit = arms.active === "staff";
    if (st.heldLast >= (spirit ? PULSE.hold : RAIN.at)) { st.heldLast = 0; return; }
    const list = bolts();
    let b = list[0];
    for (let i = 0; i < list.length; i++) { if (!list[i].live) { b = list[i]; break; } if (list[i].gone > b.gone) b = list[i]; }
    b.live = true; b.x = x; b.y = y; b.z = z; b.vx = dx * BOLT.speed; b.vy = dy * BOLT.speed; b.vz = dz * BOLT.speed; b.gone = 0; b.trail = 0; b.sp = 0;
    b.damage = damageOf(w) * (1 + charge);
    // One let go without being held drawn up bursts at `tap` of the size and loudness of one that was.
    b.burst = (st.heldLast >= DRAW_IN.heard ? 1 : BOLT.tap) * BOLT.level; st.heldLast = 0;
    b.spirit = spirit; b.struck = null; b.n.geometry = spirit ? KM.spiritBall() : KM.fireball();
    b.n.visible = true; b.n.position.x = x; b.n.position.y = y; b.n.position.z = z; b.n.scale.x = b.n.scale.y = b.n.scale.z = BOLT.size;
    // The staff's second cast throws two more balls out either side of the first, in a V.
    if (spirit && cave.weapon.spellStep === 1) {
      for (let s = -1; s <= 1; s += 2) {
        let o = list[0];
        for (let i = 0; i < list.length; i++) { if (!list[i].live) { o = list[i]; break; } if (list[i].gone > o.gone) o = list[i]; }
        const c = Math.cos(s * BOLT.v), n = Math.sin(s * BOLT.v), vx = dx * c + dz * n, vz = dz * c - dx * n;
        o.live = true; o.x = x; o.y = y; o.z = z; o.vx = vx * BOLT.speed; o.vy = dy * BOLT.speed; o.vz = vz * BOLT.speed; o.gone = 0; o.trail = 0; o.sp = 0;
        o.damage = b.damage; o.burst = b.burst; o.spirit = true; o.struck = null; o.n.geometry = b.n.geometry;
        o.n.visible = true; o.n.scale.x = o.n.scale.y = o.n.scale.z = BOLT.size; o.n.position.x = x; o.n.position.y = y; o.n.position.z = z;
      }
    }
    env.audio().fireball(x, y, z, BOLT.level);
  };
  // Where a place has the cannons' burst (`env.impact`, the yard's) the fireball bursts as a cannon's ball does, on
  // the ground under it when that is near; otherwise in a shower of sparks.
  const boltBurst = (b) => {
    b.live = false; b.n.visible = false;
    if (b.spirit) { spiritBurst(b, b.struck); return; }
    if (env.impact) { const g = env.ground(b.x, b.z, b.y + 0.3); env.impact(b.x, g > b.y - 2.5 ? Math.min(g, b.y) : b.y, b.z, b.burst); return; }
    env.audio().fireHit(b.x, b.y, b.z);
    for (let i = 0, n = Math.round(BOLT.sparks * BOLT.level); i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4;
      env.fx.spawnParticle(BOLT_BITS[i % BOLT_BITS.length], b.x, b.y, b.z, Math.cos(a) * sp, 1 + Math.random() * 3.5, Math.sin(a) * sp, 0.35 + Math.random() * 0.35, 8, 4, b.y - 2);
    }
  };
  // The staff's spell bursting: a purple explosion where it meets something, heard as the wand's ball bursting is,
  // its flash swelling to `size` m and gone in `life` s, a ring rolling out over the ground, purple sparkles flung out,
  // and every enemy within `reach` m of it (but the one it struck) struck the ball's damage and thrown back.
  const POP = { pool: 6, size: 4.5, life: 0.45, ring: 7, sparks: 34, reach: 4, throw: 2.5, fling: 4 };
  const POP_DUST = [["#ffffff", 0.07], ["#d7b8ff", 0.07], ["#a066ff", 0.08], ["#7a3dff", 0.06]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const pops = [];
  const spiritBurst = (b, struck) => {
    if (!pops.length || pops[0].orb.parent !== env.root) {
      pops.length = 0;
      for (let i = 0; i < POP.pool; i++) {
        const orb = createNode({ geometry: KM.purpleOrb(), visible: false, sightHidden: true }), ring = createNode({ geometry: KM.pulseWave(1), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } });
        addChild(env.root, orb); addChild(env.root, ring); pops.push({ orb, ring, t: -1, x: 0, y: 0, z: 0, g: 0 });
      }
    }
    let p = pops[0];
    for (let i = 0; i < pops.length; i++) { if (pops[i].t < 0) { p = pops[i]; break; } if (pops[i].t > p.t) p = pops[i]; }
    const g = env.ground(b.x, b.z, b.y + 0.3);
    p.t = 0; p.x = b.x; p.y = b.y; p.z = b.z; p.g = g > b.y - 2.5 ? Math.min(g, b.y) : b.y;
    // Heard as the wand's ball is: a cannon's burst where the place has them, else its fire hit.
    if (env.impact) env.audio().blast(b.x, b.y, b.z, b.burst); else env.audio().fireHit(b.x, b.y, b.z);
    for (let i = 0; i < POP.sparks; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, sp = 3 + Math.random() * 6; env.fx.spawnParticle(POP_DUST[i % POP_DUST.length], b.x, b.y, b.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1.5, Math.sin(a) * Math.cos(e) * sp, 0.4 + Math.random() * 0.4, 8, 4, p.g); }
    for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e === struck || e.dead >= 0 || Math.abs(e.y - p.g) > 4) continue;
      const dx = e.x - b.x, dz = e.z - b.z;
      if (Math.hypot(dx, dz) - e.S.r > POP.reach) continue;
      foeHurt(e, b.damage, dx, dz, 0.5); thrown(e, dx, dz, POP.throw, POP.fling);
    }
  };
  const popUpdate = (dt) => {
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i];
      if (p.t < 0) continue;
      p.t += dt;
      const k = p.t / POP.life;
      if (k >= 1) { p.t = -1; p.orb.visible = p.ring.visible = false; continue; }
      const o = p.orb, ox = st.eyeX - p.x, oz = st.eyeZ - p.z, s = POP.size * BL.math.ease.outQuad(Math.min(1, k * 1.6));
      o.visible = true; o.position.x = p.x; o.position.y = p.y; o.position.z = p.z; o.scale.x = o.scale.y = o.scale.z = Math.max(0.01, s);
      o.rotation.y = Math.atan2(ox, oz); o.rotation.x = -Math.atan2(st.eyeY - p.y, Math.hypot(ox, oz)); o.smokeOpacity = (1 - k) * (1 - k);
      const r = p.ring;
      r.visible = true; r.position.x = p.x; r.position.y = p.g + 0.06; r.position.z = p.z; r.scale.x = r.scale.y = POP.ring * BL.math.ease.outQuad(k) + 0.3; r.smokeOpacity = 1 - k;
    }
  };
  // Thrown back along (dx, dz) `far` m by a blow, standing or fallen, stopped by whatever it meets (`shoved`); a
  // skeleton the blow broke apart has its bones flung that way at `fling` instead.
  const thrown = (k, dx, dz, far, fling) => {
    const d = Math.hypot(dx, dz) || 1;
    k.shove = far; k.shoveX = dx / d; k.shoveZ = dz / d; k.stagger = Math.max(k.stagger, 0.8);
    if (k.dead < 0 || !k.bones) return;
    k.shove = 0;
    for (let j = 0; j < k.bones.length; j++) { const bone = k.bones[j]; bone.vx += k.shoveX * fling; bone.vz += k.shoveZ * fling; bone.vy += 0.5; }
  };
  // The wand's cast held `at` s: its rune laid round the Ooga's feet at once, heard as keep-audio.js `wandRain`, every
  // enemy within `hold` m held where it stands until it is over, and `drop` s later fire raining from the sky for as
  // long again as it is held, up to `time` s, a fireball every `every` s on an enemy within `far` m picked at random, each the wand's own (its look, sparks,
  // whoosh, burst and damage) let go `high` m over it and `off` m to one side and falling at `speed` m/s so it is seen
  // coming. Meanwhile a thin yellow beam comes down from the sky on the Ooga and the rune (the staff's, in orange) is
  // `r` m round, with its curtains of light and fairy dust (`RUNE`'s, scaled to it).
  // Under a roof (the halls, where there is no `env.impact`) they come from just under it (`low`, `near`).
  const RAIN = { at: 0.5, drop: 0.5, hold: 10, time: 5, every: 0.22, far: 20, high: 18, off: 7, speed: 28, low: 4, near: 0.8 };
  // Its dust: small red orbs.
  const RAIN_DUST = [["#ff2a1a", 0.035], ["#ff4a2a", 0.03], ["#e01810", 0.035], ["#ff6a40", 0.028]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  // An aura under the Ooga (the wand's rain's, and in white at half its size the frost blade's lightning's): the rune
  // flat round its feet `r` m round (`disc`, its two variants of keep-models.js `runeCircle`), a thin beam down on it
  // from the sky (`beam`, `beamWide` across and `sky` tall), curtains of light standing up off it (`beams` of
  // `curtain(i)`, `tall` and `wide`) and dust shooting up all over it (`dust` a second of `bits`), coming up over
  // `grow` s and fading over `fade` s once let go, following the Ooga.
  const auraOf = (look) => {
    const A = { on: false, t: 0, out: 0, cave: null, disc: null, glow: null, beam: null, beams: [], spin: 0, dust: 0 };
    const start = (cave) => {
      if (!A.disc || A.disc.parent !== env.root) {
        const flat = (geometry) => { const n = createNode({ geometry, visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }); addChild(env.root, n); return n; };
        A.disc = flat(KM.runeCircle(look.disc[0])); A.glow = flat(KM.runeCircle(look.disc[1]));
        A.beam = createNode({ geometry: look.beam(), visible: false, sightHidden: true }); addChild(env.root, A.beam);
        A.beams = [];
        for (let i = 0; i < look.beams; i++) { const n = createNode({ geometry: look.curtain(i), visible: false, sightHidden: true }); addChild(env.root, n); A.beams.push({ n, a: 0, d: 0, tall: 1, wide: 1, delay: 0, phase: 0 }); }
      }
      for (let i = 0; i < A.beams.length; i++) {
        const b = A.beams[i];
        b.a = Math.random() * Math.PI * 2; b.d = i < look.beams * 0.7 ? look.r * (0.78 + Math.random() * 0.2) : look.r * Math.random() * 0.6;
        b.tall = look.tall[0] + Math.random() * (look.tall[1] - look.tall[0]); b.wide = look.wide[0] + Math.random() * (look.wide[1] - look.wide[0]);
        b.delay = Math.random() * 0.4; b.phase = Math.random() * 10;
      }
      A.on = true; A.t = 0; A.out = 0; A.cave = cave; A.spin = Math.random() * Math.PI * 2; A.dust = 0;
    };
    const stop = () => { if (A.on) { A.on = false; A.out = look.fade; } };
    const update = (dt) => {
      if (!A.disc || A.disc.parent !== env.root) return;
      const cave = A.cave;
      if (A.on) A.t += dt; else if (A.out > 0) A.out = Math.max(0, A.out - dt);
      const level = Math.min(1, A.t / look.grow) * (A.on ? 1 : A.out / look.fade);
      if (level <= 0 || !cave) { A.disc.visible = A.glow.visible = A.beam.visible = false; for (const b of A.beams) b.n.visible = false; if (!A.on) A.cave = null; return; }
      const p = cave.root.position, feet = p.y - cave.baseY, t = A.t, D = 2 * look.r, up = Math.min(1, t / look.grow);
      for (const [n, size, op] of [[A.disc, D * (0.6 + 0.4 * BL.math.ease.outQuad(up)), level], [A.glow, D * (0.62 + 0.42 * BL.math.ease.outQuad(up)), level * (0.55 + 0.25 * Math.sin(t * 7))]]) {
        n.visible = true; n.position.x = p.x; n.position.y = feet + (n === A.glow ? 0.07 : 0.05); n.position.z = p.z;
        n.rotation.z = A.spin + t * RUNE.spin * 3; n.scale.x = n.scale.y = size; n.smokeOpacity = op;
      }
      // The thin beam down on the Ooga, turned to the view.
      const bm = A.beam;
      bm.visible = true; bm.position.x = p.x; bm.position.y = feet; bm.position.z = p.z;
      bm.rotation.y = Math.atan2(st.eyeX - p.x, st.eyeZ - p.z);
      bm.scale.x = look.beamWide * (0.85 + 0.15 * Math.sin(t * 11)); bm.scale.y = look.sky; bm.scale.z = 1; bm.smokeOpacity = level;
      for (let i = 0; i < A.beams.length; i++) {
        const b = A.beams[i], n = b.n, k = Math.max(0, Math.min(1, (t - b.delay) / 0.5));
        n.visible = k > 0;
        if (!n.visible) continue;
        const bx = p.x + Math.cos(b.a) * b.d + Math.sin(t * 1.7 + b.phase) * 0.12 * look.r / 3, bz = p.z + Math.sin(b.a) * b.d;
        n.position.x = bx; n.position.y = feet; n.position.z = bz;
        n.rotation.y = Math.atan2(st.eyeX - bx, st.eyeZ - bz);
        n.scale.x = b.wide * (0.8 + 0.25 * Math.sin(t * 2.3 + b.phase)); n.scale.y = b.tall * BL.math.ease.outQuad(k) * (0.9 + 0.1 * Math.sin(t * 3.1 + b.phase)); n.scale.z = 1;
        n.smokeOpacity = level * (0.55 + 0.45 * Math.sin(t * 4 + b.phase * 2) ** 2);
      }
      A.dust += look.dust * level * dt;
      while (A.dust >= 1) {
        A.dust -= 1;
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * look.r;
        env.fx.spawnParticle(look.bits[(Math.random() * look.bits.length) | 0], p.x + Math.cos(a) * d, feet + 0.1, p.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.4, (3 + Math.random() * 4) * look.lift, (Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.6, 6, -1.5, -1e3);
      }
    };
    return { start, stop, update, get on() { return A.on; } };
  };
  const rainAura = auraOf({ r: 3, disc: [2, 3], beam: KM.sunBeam, beamWide: 0.55, sky: 40, beams: 8, curtain: (i) => KM.auroraBeam(1 + (i % 2)), tall: [3.5, 7], wide: [0.6, 1.1], dust: 60, bits: RAIN_DUST, lift: 1, grow: 0.35, fade: 0.6 });
  // The frost blade's: the same in white, half the size.
  const STORM_DUST = [["#ffffff", 0.03], ["#f2f6ff", 0.026], ["#e6eeff", 0.03]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const stormAura = auraOf({ r: 1.5, disc: [0, 1], beam: KM.whiteBeam, beamWide: 0.28, sky: 40, beams: 8, curtain: () => KM.auroraBeam(3), tall: [1.75, 3.5], wide: [0.3, 0.55], dust: 45, bits: STORM_DUST, lift: 0.6, grow: 0.35, fade: 0.6 });
  // The knights met: the frost blade's own under each of them, at a knight's size and with no dust (`knightAura`).
  const KNIGHT_AURA = { r: 3.4, disc: [0, 1], beam: KM.whiteBeam, beamWide: 0.6, sky: 40, beams: 8, curtain: () => KM.auroraBeam(3), tall: [4, 7.5], wide: [0.6, 1.1], dust: 0, bits: STORM_DUST, lift: 0.6, grow: 0.35, fade: 0.9 };
  const knightAuras = [];
  const knightAura = (i, x, z, on) => {
    if (!knightAuras[i]) knightAuras[i] = { aura: auraOf(KNIGHT_AURA), at: { root: { position: { x, y: 0, z } }, baseY: 0 } };
    const k = knightAuras[i];
    if (on && !k.aura.on) k.aura.start(k.at); else if (!on && k.aura.on) k.aura.stop();
  };
  const rain = { on: false, t: 0, next: 0, cave: null };
  const rainStart = (cave) => {
    rain.on = true; rain.t = 0; rain.next = 0; rain.cave = cave;
    rainAura.start(cave);
    const p = cave.root.position;
    env.audio().spellHoldStop(); env.audio().wandRain(p.x, p.y, p.z);
  };
  const rainStop = () => {
    if (!rain.on) return;
    rain.on = false; rainAura.stop();
    env.audio().wandRainStop();
  };
  // One fireball let go over an enemy within reach, picked at random.
  const rainDrop = (cave) => {
    const w = arms.ware(arms.active);
    if (!w) return;
    const p = cave.root.position, feet = p.y - cave.baseY;
    let count = 0, e = null;
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0 || Math.abs(k.y - feet) > 8 || Math.hypot(k.x - p.x, k.z - p.z) - k.S.r > RAIN.far) continue;
      // Each in reach as likely as any other (reservoir sampling, no list made).
      if (Math.random() * ++count < 1) e = k;
    }
    if (!e) return;
    const list = bolts();
    let b = list[0];
    for (let j = 0; j < list.length; j++) { if (!list[j].live) { b = list[j]; break; } if (list[j].gone > b.gone) b = list[j]; }
    const a = Math.random() * Math.PI * 2, tx = e.x, ty = e.y + e.D.hip, tz = e.z;
    const sky = !!env.impact, off = sky ? RAIN.off : RAIN.near;
    const x = tx + Math.cos(a) * off, y = ty + (sky ? RAIN.high : RAIN.low), z = tz + Math.sin(a) * off, l = Math.hypot(tx - x, ty - y, tz - z);
    b.live = true; b.x = x; b.y = y; b.z = z; b.sp = RAIN.speed; b.vx = (tx - x) / l * b.sp; b.vy = (ty - y) / l * b.sp; b.vz = (tz - z) / l * b.sp; b.gone = 0; b.trail = 0;
    b.damage = damageOf(w); b.burst = BOLT.tap * BOLT.level; b.spirit = false; b.struck = null; b.n.geometry = KM.fireball();
    b.n.visible = true; b.n.position.x = x; b.n.position.y = y; b.n.position.z = z; b.n.scale.x = b.n.scale.y = b.n.scale.z = BOLT.size;
    env.audio().fireball(x, y, z, BOLT.level);
  };
  const rainUpdate = (dt) => {
    rainAura.update(dt); stormAura.update(dt);
    for (let i = 0; i < knightAuras.length; i++) knightAuras[i].aura.update(dt);
    if (!rain.on) return;
    const cave = rain.cave;
    rain.t += dt;
    if (rain.t >= RAIN.drop + RAIN.time) { rainStop(); return; }
    if (rain.t >= RAIN.drop && (rain.next -= dt) <= 0) { rain.next += RAIN.every; rainDrop(cave); }
    // Every enemy near held where it stands (not one in the air, which comes down first).
    const p = cave.root.position;
    for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e.dead < 0 && e.leapT < 0 && Math.hypot(e.x - p.x, e.z - p.z) - e.S.r < RAIN.hold) e.held = 0.15;
    }
  };
  const boltUpdate = (dt) => {
    if (!st.bolts) return;
    for (let i = 0; i < st.bolts.length; i++) {
      const b = st.bolts[i];
      if (!b.live) continue;
      // In steps of at most `step` m, so a ball this fast never passes through an enemy between frames.
      const sp = b.sp || BOLT.speed, steps = Math.max(1, Math.ceil(sp * dt / BOLT.step)), h = dt / steps;
      for (let sub = 0; sub < steps && b.live; sub++) {
        const ax = b.x, az = b.z;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.gone += sp * h;
        let hit = null;
        for (let j = 0; j < st.foes.length; j++) {
          const k = st.foes[j];
          if (k.dead >= 0) continue;
          if (Math.hypot(k.x - b.x, k.z - b.z) < k.S.r + BOLT.hit && b.y > k.y - 0.2 && b.y < k.y + k.S.tall + 0.2) { hit = k; break; }
        }
        if (hit) { foeHurt(hit, b.damage, b.vx, b.vz, BOLT.push); thrown(hit, b.vx, b.vz, BOLT.throw, BOLT.fling); b.struck = hit; boltBurst(b); break; }
        if (b.gone > BOLT.range || env.ground(b.x, b.z, b.y) > b.y || env.air && !env.air(ax, az, b.x, b.z, b.y)) { boltBurst(b); break; }
      }
      if (!b.live) continue;
      b.n.position.x = b.x; b.n.position.y = b.y; b.n.position.z = b.z;
      b.n.rotation.y += dt * 9; b.n.rotation.x += dt * 6;
      // Its trail: sparks shed as it goes, drifting up and out; the staff's, fairy dust streaming behind it.
      if (b.spirit && (b.trail -= dt) <= 0) {
        b.trail = BOLT.trail * 0.4;
        for (let j = 0; j < 2; j++) env.fx.spawnParticle(POP_DUST[(Math.random() * POP_DUST.length) | 0], b.x + (Math.random() - 0.5) * 0.25, b.y + (Math.random() - 0.5) * 0.25, b.z + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5, 0.45 + Math.random() * 0.35, 6, -0.4, -1e3);
      } else if (!b.spirit && (b.trail -= dt) <= 0) {
        b.trail = BOLT.trail;
        env.fx.spawnParticle(BOLT_BITS[(Math.random() * BOLT_BITS.length) | 0], b.x, b.y, b.z, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.2, 6, -1.2, b.y - 3);
      }
    }
  };
  // The wand's charge (crew.js `CHARGE`, the crew's `onSpell`): a ball of fire swelling on the wand's gem (`orb`, up
  // to `size`) as sparks are drawn into it from round about, while the land darkens over the charge's `lead` seconds to
  // `dark` of its light (`darken`, `undarken`); then, as the wand is thrust forward, its path of destruction (`RIPPLE`)
  // and a flash of light as the dark lifts over `lift` s. A charge never answered fades on its own after `lead` + `late` s.
  const SPELL = { dark: 0.8, lift: 0.7, late: 0.6, flash: 1.2, flashFor: 0.25, size: 0.75, gem: 0.92, motes: 0.025, from: 1.6 };
  // The path of destruction: a front rippling out along the ground ahead of the Ooga from `from` to `length` m over
  // `time` s, widening as a cone (`cone`, its half angle, past `waist` m wide either side at its start): fire rising
  // from the ground across its width as it passes (`flames` of a fixed pool, `burst` a step, each growing to `tall` and
  // dying over `burn` s), and the ground heaving, rock and dust thrown up every `every` s (`across` places, each
  // `rocks`, `sparks` and `dust`); every enemy it reaches is struck once, `hard` times the wand's damage, thrown on
  // `throw` m along it. Every `beamEvery` steps a curtain of red or orange light (`beams` of a fixed pool, `beamTall`
  // and `beamWide`) stands up out of the fire behind the front, as the rain's do round the Ooga, and dies with it.
  // The maul's slam's pulse heard this long after the slam sets out.
  const MAUL_BOOM = 0.5;
  const RIPPLE = { from: 0.6, length: 20, time: 1.6, cone: 0.5, waist: 0.35, every: 0.05, across: 3, rocks: 1, sparks: 1, dust: 1, hard: 2, throw: 3.5, quake: 1, flames: 120, burst: 3, beams: 16, beamEvery: 2, beamTall: [3, 6], beamWide: [0.8, 1.4], tall: [0.8, 1.3], wide: [1.1, 1.6], pool: [1.5, 2.3], burn: [2.7, 3.1], fade: 0.8, cool: 1.2, embers: 0.8, smoke: 0.5 };
  const LAVA_BITS = [["#ffcf5a", 0.05], ["#ff8a1a", 0.06], ["#ff5a10", 0.05]].map(([color, w]) => BL.models.box({ w, h: w, d: w, color, emissive: 1 }));
  const LAVA_SMOKE = ["#2b2420", "#3b322c"].map((c) => BL.models.particleGeometry(c, 0.18, 0));
  const FLAMES = [];
  const flamePool = () => {
    if (!FLAMES.length || FLAMES[0].n.parent !== env.root) {
      FLAMES.length = 0;
      for (let i = 0; i < RIPPLE.flames; i++) {
        const n = createNode({ geometry: KM.lavaFlame(i % 3), visible: false, sightHidden: true }), pool = createNode({ geometry: KM.lavaPool(), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } });
        addChild(env.root, pool); addChild(env.root, n);
        FLAMES.push({ n, pool, t: 0, life: 1, size: 1, wide: 1, spread: 1, x: 0, y: 0, z: 0, phase: 0, ember: 0, smoke: 0 });
      }
    }
    return FLAMES;
  };
  const flameUp = (x, y, z) => {
    const list = flamePool();
    let f = list[0];
    for (let i = 0; i < list.length; i++) { if (list[i].t <= 0) { f = list[i]; break; } if (list[i].t < f.t) f = list[i]; }
    f.life = f.t = RIPPLE.burn[0] + Math.random() * (RIPPLE.burn[1] - RIPPLE.burn[0]);
    f.size = RIPPLE.tall[0] + Math.random() * (RIPPLE.tall[1] - RIPPLE.tall[0]); f.wide = RIPPLE.wide[0] + Math.random() * (RIPPLE.wide[1] - RIPPLE.wide[0]);
    f.spread = RIPPLE.pool[0] + Math.random() * (RIPPLE.pool[1] - RIPPLE.pool[0]); f.x = x; f.y = y; f.z = z; f.phase = Math.random() * 40;
    f.ember = Math.random() * RIPPLE.embers; f.smoke = Math.random() * RIPPLE.smoke;
    f.n.position.x = x; f.n.position.y = y; f.n.position.z = z; f.n.rotation.y = Math.random() * 6; f.n.visible = true; f.n.glow = 1;
    f.pool.position.x = x; f.pool.position.y = y + 0.03 + Math.random() * 0.02; f.pool.position.z = z; f.pool.rotation.z = Math.random() * 6; f.pool.visible = true;
  };
  const flamesUpdate = (dt, elapsed) => {
    for (let i = 0; i < FLAMES.length; i++) {
      const f = FLAMES[i];
      if (f.t <= 0) continue;
      f.t -= dt;
      if (f.t <= 0) { f.n.visible = false; f.pool.visible = false; continue; }
      // Burning low over the ground like lava: a molten pool spreading out under it and glowing, slowly pulsing, the
      // squat flame over it licking up and flickering as a fire does, sparks rising off it and a wisp of smoke now and
      // then; over its last `fade` s the flame sinks into the pool and the pool cools to crust over `cool` s.
      const age = f.life - f.t, k = age / f.life, grow = Math.min(1, age * 4), fade = Math.min(1, f.t / RIPPLE.fade), q = elapsed + f.phase, n = f.n;
      const flick = 1 + BL.blaze.flare(elapsed, f.phase) * 1.5 + 0.06 * Math.sin(q * 5.3);
      const sz = f.size * grow * fade * flick;
      n.scale.x = n.scale.z = f.wide * grow * (0.6 + 0.4 * fade) * (1 + 0.04 * Math.sin(q * 3.1)); n.scale.y = sz;
      n.glow = 0.9 + 0.12 * Math.sin(q * 9) * Math.sin(q * 3.7);
      const p = f.pool, cool = Math.min(1, f.t / RIPPLE.cool), spread = f.spread * Math.min(1, age * 2.5);
      p.scale.x = p.scale.y = spread; p.smokeOpacity = cool * (0.85 + 0.15 * Math.sin(q * 1.7));
      if (fade > 0.4 && (f.ember -= dt) <= 0) {
        f.ember = RIPPLE.embers * (0.5 + Math.random());
        env.fx.spawnParticle(LAVA_BITS[(Math.random() * LAVA_BITS.length) | 0], f.x + (Math.random() - 0.5) * f.wide * 0.4, f.y + sz * 0.3, f.z + (Math.random() - 0.5) * f.wide * 0.4, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, 4, -0.8, f.y - 1);
      }
      if ((f.smoke -= dt) <= 0) {
        f.smoke = RIPPLE.smoke * (2 + Math.random() * 3);
        const d = env.fx.spawnParticle(LAVA_SMOKE[(Math.random() * LAVA_SMOKE.length) | 0], f.x, f.y + sz * 0.7, f.z, (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, 1 + Math.random() * 0.6, 1);
        if (d) d.smoke = true;
      }
    }
  };
  const ripple = { on: false, t: 0, x: 0, z: 0, fx: 0, fz: 0, feet: 0, at: 0, id: 0, step: 0, burst: -1 };
  const FIRE_BEAMS = [];
  const fireBeamUp = (x, y, z) => {
    if (!FIRE_BEAMS.length || FIRE_BEAMS[0].n.parent !== env.root) {
      FIRE_BEAMS.length = 0;
      for (let i = 0; i < RIPPLE.beams; i++) { const n = createNode({ geometry: KM.auroraBeam(1 + (i % 2)), visible: false, sightHidden: true }); addChild(env.root, n); FIRE_BEAMS.push({ n, t: 0, life: 1, tall: 1, wide: 1, phase: 0, x: 0, z: 0 }); }
    }
    let b = FIRE_BEAMS[0];
    for (let i = 0; i < FIRE_BEAMS.length; i++) { if (FIRE_BEAMS[i].t <= 0) { b = FIRE_BEAMS[i]; break; } if (FIRE_BEAMS[i].t < b.t) b = FIRE_BEAMS[i]; }
    b.life = b.t = RIPPLE.burn[0] + Math.random() * (RIPPLE.burn[1] - RIPPLE.burn[0]);
    b.tall = RIPPLE.beamTall[0] + Math.random() * (RIPPLE.beamTall[1] - RIPPLE.beamTall[0]); b.wide = RIPPLE.beamWide[0] + Math.random() * (RIPPLE.beamWide[1] - RIPPLE.beamWide[0]);
    b.phase = Math.random() * 10; b.x = x; b.z = z; b.n.position.y = y;
  };
  const fireBeamsUpdate = (dt, elapsed) => {
    for (let i = 0; i < FIRE_BEAMS.length; i++) {
      const b = FIRE_BEAMS[i], n = b.n;
      if (b.t <= 0) continue;
      b.t -= dt;
      if (b.t <= 0) { n.visible = false; continue; }
      const age = b.life - b.t, k = Math.min(1, age / 0.5), fade = Math.min(1, b.t / RIPPLE.fade), q = elapsed + b.phase;
      n.visible = true; n.position.x = b.x + Math.sin(q * 1.7) * 0.12; n.position.z = b.z;
      n.rotation.y = Math.atan2(st.eyeX - b.x, st.eyeZ - b.z);
      n.scale.x = b.wide * (0.8 + 0.25 * Math.sin(q * 2.3)); n.scale.y = b.tall * BL.math.ease.outQuad(k) * (0.9 + 0.1 * Math.sin(q * 3.1)); n.scale.z = 1;
      n.smokeOpacity = fade * (0.55 + 0.45 * Math.sin(q * 4) ** 2);
    }
  };
  const rippleStart = (cave) => {
    const p = cave.root.position, yaw = cave.root.rotation.y + (cave.weapon.aiming ? cave.weapon.aimYaw : 0);
    ripple.on = true; ripple.t = 0; ripple.at = 0; ripple.id++;
    ripple.x = p.x; ripple.z = p.z; ripple.fx = Math.sin(yaw); ripple.fz = Math.cos(yaw); ripple.feet = p.y - cave.baseY;
    env.audio().fireHit(p.x + ripple.fx, ripple.feet + 1, p.z + ripple.fz);
    st.quake = SLAM.settle; st.quakeAmp = RIPPLE.quake;
  };
  const rippleUpdate = (dt, elapsed) => {
    flamesUpdate(dt, elapsed); fireBeamsUpdate(dt, elapsed);
    if (!ripple.on) return;
    ripple.t += dt;
    const k = Math.min(1, ripple.t / RIPPLE.time), front = RIPPLE.from + (RIPPLE.length - RIPPLE.from) * (1 - (1 - k) * (1 - k)), spread = Math.tan(RIPPLE.cone);
    const fx = ripple.fx, fz = ripple.fz, G = KM.smash();
    // The ground torn up across the front's width as it goes.
    if ((ripple.at -= dt) <= 0) {
      ripple.at = RIPPLE.every; ripple.step++;
      const half = RIPPLE.waist + front * spread;
      for (let j = 0; j < RIPPLE.across; j++) {
        const side = ((j + Math.random()) / RIPPLE.across * 2 - 1) * half, x = ripple.x + fx * front - fz * side, z = ripple.z + fz * front + fx * side;
        const y = env.ground(x, z, ripple.feet + 1.5);
        if (y < ripple.feet - 3 || y > ripple.feet + 3) continue;
        for (let i = 0; i < RIPPLE.rocks; i++) env.fx.spawnParticle(SLAM_ROCKS[(Math.random() * SLAM_ROCKS.length) | 0], x, y + 0.1, z, fx * 1.5 + (Math.random() - 0.5) * 2, 5 + Math.random() * 5, fz * 1.5 + (Math.random() - 0.5) * 2, 1 + Math.random() * 0.5, 12, 16, y + 0.05);
        for (let i = 0; i < RIPPLE.sparks; i++) env.fx.spawnParticle(BOLT_BITS[(Math.random() * BOLT_BITS.length) | 0], x, y + 0.2, z, fx * 2.5 + (Math.random() - 0.5) * 2.5, 2 + Math.random() * 4.5, fz * 2.5 + (Math.random() - 0.5) * 2.5, 0.45 + Math.random() * 0.35, 8, 3, y);
        for (let i = 0; i < RIPPLE.dust; i++) { const d = env.fx.spawnParticle(G.dust[(Math.random() * G.dust.length) | 0], x, y + 0.25, z, fx * 1.2, 0.5 + Math.random() * 0.8, fz * 1.2, 0.7 + Math.random() * 0.4, 1.2); if (d) d.smoke = true; }
      }
    }
    // Fire rising out of the ground the front has just passed over.
    if (ripple.burst !== ripple.step) {
      ripple.burst = ripple.step;
      const half = RIPPLE.waist + front * spread;
      for (let j = 0; j < RIPPLE.burst; j++) {
        const back = Math.random() * 0.8, side = (Math.random() * 2 - 1) * half, d = Math.max(RIPPLE.from, front - back), x = ripple.x + fx * d - fz * side, z = ripple.z + fz * d + fx * side;
        const y = env.ground(x, z, ripple.feet + 1.5);
        if (y > ripple.feet - 3 && y < ripple.feet + 3) { flameUp(x, y, z); if (j === 0 && ripple.step % RIPPLE.beamEvery === 0) fireBeamUp(x, y, z); }
      }
    }
    // Every enemy the front has reached inside the cone, struck once.
    const w = arms.ware(arms.active);
    if (w) for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e.dead >= 0 || e.rippled === ripple.id || ripple.feet < e.y - 1.5 || ripple.feet > e.y + e.S.tall) continue;
      const dx = e.x - ripple.x, dz = e.z - ripple.z, along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
      if (along < -e.S.r || along - e.S.r > front || across - e.S.r > RIPPLE.waist + Math.max(0, along) * spread) continue;
      e.rippled = ripple.id;
      foeHurt(e, damageOf(w) * RIPPLE.hard, fx, fz, 0, false, true);
      // Thrown on along it at the front's touch, one it kills charring to ash as it goes (`ASH`).
      thrown(e, fx, fz, RIPPLE.throw, 0);
    }
    if (k >= 1) ripple.on = false;
  };
  // The frost blade's fourth step (`lightningStart`, as the wand's charge is thrust): bolts of lightning out of the sky
  // onto enemies within `reach` m (`stormUpdate`: one every `every` s for `span` s, up to `count` at once), each standing `life` s and
  // flickering between its variants, the ground under it bursting in sparks and fire (the scene's `impact`, as a
  // cannon ball's burst) and the enemy struck `hard` times the sword's damage, heard (keep-audio.js `lightningHit`), one
  // it kills charred to ash and one that lives standing frozen in place, glowing white, for `freeze` s.
  const strikes = [];
  const lightningStart = (cave) => {
    if (!strikes.length || strikes[0].n.parent !== env.root) {
      strikes.length = 0;
      for (let i = 0; i < LIGHTNING.count; i++) { const n = createNode({ geometry: KM.lightning(i % LIGHTNING.variants), visible: false, sightHidden: true }); addChild(env.root, n); strikes.push({ n, foe: null, wait: 0, t: 0, flick: 0 }); }
    }
    for (let i = 0; i < strikes.length; i++) { const s = strikes[i]; s.foe = null; s.t = 0; s.n.visible = false; }
    storm.t = 0; storm.next = 0; storm.cave = cave; stormAura.start(cave);
    st.quake = SLAM.settle; st.quakeAmp = LIGHTNING.quake;
  };
  const storm = { t: -1, next: 0, cave: null };
  const stormUpdate = (dt) => {
    if (storm.t < 0) return;
    storm.t += dt;
    if (storm.t >= LIGHTNING.span || !storm.cave) { storm.t = -1; storm.cave = null; stormAura.stop(); return; }
    const p = storm.cave.root.position, feet = p.y - storm.cave.baseY;
    let count = 0, pick = null;
    for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e.dead >= 0 || Math.abs(e.y - feet) > 12 || Math.hypot(e.x - p.x, e.z - p.z) - e.S.r > LIGHTNING.reach) continue;
      if (e.leapT < 0) e.held = 0.15;
      if (Math.random() * ++count < 1) pick = e;
    }
    if ((storm.next -= dt) > 0 || !pick) return;
    storm.next += LIGHTNING.every;
    for (let i = 0; i < strikes.length; i++) { const s = strikes[i]; if (s.foe) continue; s.foe = pick; s.wait = 0; s.t = 0; return; }
  };
  const lightningUpdate = (dt) => {
    stormUpdate(dt);
    for (let i = 0; i < strikes.length; i++) {
      const s = strikes[i], e = s.foe;
      if (!e) continue;
      if (s.wait > 0) { s.wait -= dt; continue; }
      if (s.t === 0) {
        // It lands: the enemy struck where it stands now, the ground burst under it.
        const w = arms.ware(arms.active), dx = e.x - (env.crew().player ? env.crew().player.root.position.x : e.x), dz = e.z - (env.crew().player ? env.crew().player.root.position.z : e.z);
        if (w && e.dead < 0) {
          // Struck where it stands, not knocked back; one that lives through it stands frozen and white (`freeze`).
          foeHurt(e, damageOf(w) * LIGHTNING.hard, dx, dz, 0, false, true);
          if (e.dead < 0) e.frozen = LIGHTNING.freeze;
        }
        env.audio().lightningHit(e.x, e.y + 1, e.z);
        const y = env.ground(e.x, e.z, e.y + 1.5), at = y > e.y - 3 && y < e.y + 3 ? y : e.y;
        // The ground's burst is seen, not heard: the strike's own thunder is its sound.
        if (env.impact) env.impact(e.x, at, e.z, LIGHTNING.burst, true);
        for (let j = 0; j < LIGHTNING.sparks; j++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6; env.fx.spawnParticle(BOLT_BITS[j % BOLT_BITS.length], e.x, at + 0.3, e.z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 0.35 + Math.random() * 0.35, 8, 6, at); }
        s.bx = e.x; s.by = at; s.bz = e.z;
      }
      s.t += dt;
      const n = s.n;
      if (s.t >= LIGHTNING.life) { n.visible = false; s.foe = null; continue; }
      if ((s.flick -= dt) <= 0) { s.flick = LIGHTNING.flicker; n.geometry = KM.lightning((Math.random() * LIGHTNING.variants) | 0); n.rotation.y = Math.random() * Math.PI * 2; }
      const fade = 1 - s.t / LIGHTNING.life, wide = (LIGHTNING.wide[0] + Math.random() * (LIGHTNING.wide[1] - LIGHTNING.wide[0])) * (0.5 + 0.5 * fade);
      n.visible = true; n.position.x = s.bx; n.position.y = s.by; n.position.z = s.bz;
      n.scale.x = n.scale.z = wide; n.scale.y = 1;
    }
  };
  // The level 4 staff's fourth step (`runeStart`, as the charge is thrust): its rune laid flat on the ground, its middle
  // `ahead` m before the Ooga so its near edge is at their feet, the visitor warded from every blow while it lasts, `r` m round, glowing white, with curtains of northern light (`beams`) standing up off it round its
  // rim and here and there inside, rising, wavering and fading, and fairy dust shooting up from the ground all over it;
  // every enemy inside struck `hard` times the staff's damage as it lands and `pulse` times again at each of `pulses`
  // s, and the view rumbling `shake` s (`st.rumble`, `RUNE.amp`). It lasts `life` s, coming up over `grow` and fading
  // over its last `fade`.
  const RUNE = { ahead: 10, r: 10, life: 4.6, grow: 0.35, fade: 0.9, spin: 0.08, beams: 16, tall: [8, 17], wide: [1.4, 2.6], hard: 2, pulse: 1, pulses: [1, 2, 3], shake: 4, amp: 0.22, dust: 140 };
  const RUNE_DUST = [["#ffffff", 0.08], ["#dff6ff", 0.07], ["#b8ffe0", 0.06], ["#d8c8ff", 0.06]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const rune = { on: false, t: 0, x: 0, y: 0, z: 0, hit: 0, dust: 0, disc: null, glow: null, beams: [] };
  const runeStart = (cave) => {
    if (!rune.disc || rune.disc.parent !== env.root) {
      const flat = (geometry) => { const n = createNode({ geometry, visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }); addChild(env.root, n); return n; };
      rune.disc = flat(KM.runeCircle(0)); rune.glow = flat(KM.runeCircle(1));
      rune.beams = [];
      for (let i = 0; i < RUNE.beams; i++) { const n = createNode({ geometry: KM.auroraBeam(), visible: false, sightHidden: true }); addChild(env.root, n); rune.beams.push({ n, x: 0, z: 0, tall: 1, wide: 1, delay: 0, phase: 0 }); }
    }
    const p = cave.root.position, yaw = cave.root.rotation.y + (cave.weapon.aiming ? cave.weapon.aimYaw : 0), feet = p.y - cave.baseY;
    rune.x = p.x + Math.sin(yaw) * RUNE.ahead; rune.z = p.z + Math.cos(yaw) * RUNE.ahead;
    const g = env.ground(rune.x, rune.z, feet + 2);
    rune.y = g > feet - 4 && g < feet + 4 ? g : feet;
    rune.on = true; rune.t = 0; rune.hit = 0; rune.dust = 0; rune.spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < rune.beams.length; i++) {
      const b = rune.beams[i], a = Math.random() * Math.PI * 2, d = i < RUNE.beams * 0.7 ? RUNE.r * (0.78 + Math.random() * 0.2) : RUNE.r * Math.random() * 0.6;
      b.x = rune.x + Math.cos(a) * d; b.z = rune.z + Math.sin(a) * d; b.tall = RUNE.tall[0] + Math.random() * (RUNE.tall[1] - RUNE.tall[0]); b.wide = RUNE.wide[0] + Math.random() * (RUNE.wide[1] - RUNE.wide[0]);
      b.delay = Math.random() * 0.6; b.phase = Math.random() * 10;
    }
    st.rumble = RUNE.shake;
    // Nothing hurts the visitor while it stands.
    health.ward(RUNE.life);
    runeStrike(RUNE.hard);
  };
  const runeStrike = (hard) => {
    const w = arms.ware(arms.active);
    if (!w) return;
    for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e.dead >= 0 || Math.abs(e.y - rune.y) > 4) continue;
      const dx = e.x - rune.x, dz = e.z - rune.z;
      if (Math.hypot(dx, dz) - e.S.r > RUNE.r) continue;
      foeHurt(e, damageOf(w) * hard, dx, dz, 0.4);
    }
  };
  const runeUpdate = (dt) => {
    if (!rune.on) return;
    rune.t += dt;
    const t = rune.t, life = RUNE.life;
    if (t >= life) { rune.on = false; rune.disc.visible = rune.glow.visible = false; for (const b of rune.beams) b.n.visible = false; return; }
    // Each pulse strikes again whoever stands in it.
    while (rune.hit < RUNE.pulses.length && t >= RUNE.pulses[rune.hit]) { rune.hit++; runeStrike(RUNE.pulse); }
    const up = Math.min(1, t / RUNE.grow), fade = Math.min(1, (life - t) / RUNE.fade), level = up * fade, D = 2 * RUNE.r;
    for (const [n, size, op] of [[rune.disc, D * (0.6 + 0.4 * BL.math.ease.outQuad(up)), level], [rune.glow, D * (0.62 + 0.42 * BL.math.ease.outQuad(up)), level * (0.55 + 0.25 * Math.sin(t * 7))]]) {
      n.visible = true; n.position.x = rune.x; n.position.y = rune.y + (n === rune.glow ? 0.07 : 0.05); n.position.z = rune.z;
      n.rotation.z = rune.spin + t * RUNE.spin; n.scale.x = n.scale.y = size; n.smokeOpacity = op;
    }
    for (let i = 0; i < rune.beams.length; i++) {
      const b = rune.beams[i], n = b.n, k = Math.max(0, Math.min(1, (t - b.delay) / 0.5));
      n.visible = k > 0;
      if (!n.visible) continue;
      const sway = Math.sin(t * 1.7 + b.phase) * 0.35;
      n.position.x = b.x + sway; n.position.y = rune.y; n.position.z = b.z;
      n.rotation.y = Math.atan2(st.eyeX - b.x, st.eyeZ - b.z);
      n.scale.x = b.wide * (0.8 + 0.25 * Math.sin(t * 2.3 + b.phase)); n.scale.y = b.tall * BL.math.ease.outQuad(k) * (0.9 + 0.1 * Math.sin(t * 3.1 + b.phase)); n.scale.z = 1;
      n.smokeOpacity = fade * (0.55 + 0.45 * Math.sin(t * 4 + b.phase * 2) ** 2);
    }
    // Fairy dust shooting up from all over it.
    rune.dust += RUNE.dust * fade * dt;
    while (rune.dust >= 1) {
      rune.dust -= 1;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * RUNE.r;
      env.fx.spawnParticle(RUNE_DUST[(Math.random() * RUNE_DUST.length) | 0], rune.x + Math.cos(a) * d, rune.y + 0.1, rune.z + Math.sin(a) * d, (Math.random() - 0.5) * 0.6, 4 + Math.random() * 7, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.8, 6, -1.5, -1e3);
    }
  };
  // The staff's held strike let go after drawing it up `hold` s or more (`DRAW_IN`, as the wand's cast is, in its blue, white and
  // purple): a thick white pulse bursting out from the Ooga over the ground in every direction to `r` m over `time` s,
  // a white ball swelling out from them with it, a disc clear at its middle and thick white at its edge, a white wave
  // and a purple one rolling out, each enemy it reaches struck `hard` times the staff's damage
  // and thrown `throw` m out, the view jolted, heard as keep-audio.js `staffPulse`.
  const PULSE = { r: 20, time: 0.7, life: 1.1, hard: 1, throw: 6, fling: 6, rings: 2, every: 0.12, orb: 0.5, quake: 0.7, hold: 3, maulRings: 3 };
  const pulse = { on: false, t: 0, x: 0, y: 0, z: 0, r: 0, count: 0, id: 0, disc: null, orb: null, rings: [] };
  // `maul`: the maul's slam's, its white wave followed by `maulRings` orange ones and its disc orange, its sound
  // already heard as the slam set out (`swung`).
  const pulseStart = (cave, maul = false) => {
    if (!pulse.disc || pulse.disc.parent !== env.root) {
      const flat = (geometry) => { const n = createNode({ geometry, visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }); addChild(env.root, n); return n; };
      pulse.disc = flat(KM.pulseDisc(0)); pulse.rings = [];
      for (let i = 0; i < Math.max(PULSE.rings, PULSE.maulRings + 1); i++) pulse.rings.push(flat(KM.pulseWave(0)));
      pulse.orb = createNode({ geometry: KM.whiteOrb(), visible: false, sightHidden: true }); addChild(env.root, pulse.orb);
    }
    const p = cave.root.position;
    pulse.on = true; pulse.t = 0; pulse.id++; pulse.x = p.x; pulse.z = p.z; pulse.y = p.y - cave.baseY; pulse.r = PULSE.r;
    // The first wave thick and white, the rest purple (the maul's orange).
    pulse.count = maul ? PULSE.maulRings + 1 : PULSE.rings;
    pulse.disc.geometry = KM.pulseDisc(maul ? 1 : 0);
    for (let i = 0; i < pulse.rings.length; i++) { pulse.rings[i].geometry = KM.pulseWave(i ? (maul ? 2 : 1) : 0); pulse.rings[i].visible = false; }
    st.quake = SLAM.settle; st.quakeAmp = PULSE.quake;
    if (!maul) env.audio().staffPulse(p.x, p.y, p.z);
  };
  const pulseUpdate = (dt) => {
    if (!pulse.on) return;
    pulse.t += dt;
    const t = pulse.t;
    if (t >= PULSE.life) { pulse.on = false; pulse.disc.visible = pulse.orb.visible = false; for (const r of pulse.rings) r.visible = false; return; }
    const k = Math.min(1, t / PULSE.time), front = pulse.r * BL.math.ease.outQuad(k), fade = 1 - Math.max(0, (t - PULSE.time * 0.5) / (PULSE.life - PULSE.time * 0.5));
    const d = pulse.disc;
    d.visible = true; d.position.x = pulse.x; d.position.y = pulse.y + 0.06; d.position.z = pulse.z; d.scale.x = d.scale.y = 2 * front + 0.5; d.smokeOpacity = 0.8 * fade;
    for (let i = 0; i < pulse.count; i++) {
      const r = pulse.rings[i], ki = Math.max(0, Math.min(1, (t - i * PULSE.every) / PULSE.time));
      r.visible = ki > 0; if (!r.visible) continue;
      r.position.x = pulse.x; r.position.y = pulse.y + 0.08 + i * 0.01; r.position.z = pulse.z;
      r.scale.x = r.scale.y = 2 * pulse.r * BL.math.ease.outQuad(ki) + 0.5; r.smokeOpacity = (1 - ki * 0.6) * fade;
    }
    // A white ball swelling out from the Ooga with the front, its whole size, fading as it grows.
    const o = pulse.orb, os = 2 * Math.max(0.6, front), oy = pulse.y + 1, ox = st.eyeX - pulse.x, oz = st.eyeZ - pulse.z;
    o.visible = true; o.position.x = pulse.x; o.position.y = oy; o.position.z = pulse.z; o.scale.x = o.scale.y = o.scale.z = os;
    o.rotation.y = Math.atan2(ox, oz); o.rotation.x = -Math.atan2(st.eyeY - oy, Math.hypot(ox, oz)); o.smokeOpacity = PULSE.orb * (1 - k) * (1 - k) * fade;
    // Each enemy the front reaches, struck and thrown out, once.
    const w = arms.ware(arms.active);
    for (let i = 0; i < st.foes.length; i++) {
      const e = st.foes[i];
      if (e.dead >= 0 || e.pulsed === pulse.id || Math.abs(e.y - pulse.y) > 5) continue;
      const dx = e.x - pulse.x, dz = e.z - pulse.z;
      if (Math.hypot(dx, dz) - e.S.r > front) continue;
      e.pulsed = pulse.id;
      if (w) foeHurt(e, damageOf(w) * PULSE.hard, dx, dz, 0.6);
      thrown(e, dx, dz, PULSE.throw, PULSE.fling);
    }
  };
  // While the frost blade is raised, sparks drawn in to its tip as they are to the wand's gem.
  const frostMotes = (dt, cave, k) => {
    if ((st.spellMote -= dt) > 0) return;
    st.spellMote = SPELL.motes * (1.6 - k);
    const t = wandTip(cave), a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2, r = SPELL.from * (0.7 + Math.random() * 0.6), life = 0.35 + Math.random() * 0.15;
    const ox = Math.cos(a) * Math.cos(e) * r, oy = Math.sin(e) * r, oz = Math.sin(a) * Math.cos(e) * r;
    env.fx.spawnParticle(BOLT_BITS[(Math.random() * BOLT_BITS.length) | 0], t.x + ox, t.y + oy, t.z + oz, -ox / life, -oy / life, -oz / life, life, 6, 0, -1e3);
  };
  const DARK = { arrays: ["clear", "sky", "ground", "horizon", "zenith", "sun", "direct", "fog"], scalars: ["directStrength", "ambientFloor", "stars"], saved: new Float64Array(40), lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), bodies: new Float32Array(BL.glRenderer.RELIT_MAX * 5), count: 0, on: false, near: 30 };
  const TIP = { x: 0, y: 0, z: 0 };
  const wandTip = (cave) => {
    const club = cave.parts.club, m = club.world, up = BL.scene.boundsOf(club.geometry).max[1] * SPELL.gem;
    TIP.x = m[12] + m[4] * up; TIP.y = m[13] + m[5] * up; TIP.z = m[14] + m[6] * up;
    return TIP;
  };
  const spell = (cave, phase, lead) => {
    const people = env.crew();
    if (!people || cave !== people.player) return;
    // The frost blade pulls lightning out of the sky onto the nearest enemies; the level 4 staff pulls it down the same
    // way and lays its rune on the ground before the Ooga (`runeStart`).
    const rune = arms.active === "staff", frost = rune || arms.skin() === "sword4";
    if (phase === "charge") { st.spellCave = cave; st.spellT = 0; st.spellLead = lead; st.spellMote = 0; st.spellFrost = frost; st.spellRune = rune; const p = cave.root.position; if (rune) env.audio().staffRune(p.x, p.y, p.z); else if (frost) env.audio().swordRaise(p.x, p.y, p.z); else env.audio().spellCharge(p.x, p.y, p.z); return; }
    const was = st.spellCave;
    st.spellCave = null; st.spellT = -1;
    if (phase === "blast" && was === cave) { if (rune) runeStart(cave); else if (frost) lightningStart(cave); else rippleStart(cave); st.flash = SPELL.flashFor; }
  };
  // While the cast is held drawn up (crew.js `CAST`'s `wind`), lines of orange energy are drawn in to the Ooga from
  // round about: a fixed pool of `lines`, each one a streak that sets out `from` m off at its own height, flies in to
  // the chest over `life` s and shrinks to nothing as it arrives, a new one every `every` s.
  const DRAW_IN = { heard: 0.18, lines: 18, from: [1.6, 2.6], life: [0.28, 0.42], every: 0.03, chest: 0.62, rise: [-0.35, 0.75], length: 0.7, width: 0.035 };
  const DRAW_LINES = [["#ff8a1f", 1], ["#ffc24a", 1], ["#ffe6a8", 1]].map(([color]) => BL.models.box({ w: DRAW_IN.width, h: DRAW_IN.width, d: 1, color, emissive: 1 }));
  // The staff's draw-in, blue, white and purple.
  const STAFF_LINES = [["#6fb4ff", 1], ["#ffffff", 1], ["#b07cff", 1]].map(([color]) => BL.models.box({ w: DRAW_IN.width, h: DRAW_IN.width, d: 1, color, emissive: 1 }));
  const drawLines = () => {
    if (!st.lines) {
      st.lines = [];
      for (let i = 0; i < DRAW_IN.lines; i++) {
        const n = createNode({ geometry: DRAW_LINES[i % DRAW_LINES.length], visible: false, sightHidden: true });
        addChild(env.root, n);
        st.lines.push({ n, t: 0, life: 1, a: 0, r: 0, y: 0 });
      }
    }
    return st.lines;
  };
  // And on the wand's gem a ball of streaks swirling round it, each on an orbit of its own about a tilted axis, the
  // ball growing to `size` m across over `grow` s of the hold and gone the moment it is let go.
  // The ball drawn up on the wand's gem (or the staff's): crescents of light (keep-models.js `swooshTint`, the sword's
  // swooshes in the spell's colours) each going round the gem in a plane of its own.
  const BALL = { streaks: 14, size: 1, grow: 1.1, start: 0.12, speed: [7, 13] };
  const WAND_SWOOSH = [3, 4, 5], STAFF_SWOOSH = [6, 0, 1];
  const BQ = BL.math.quat.create();
  const ballPool = () => {
    if (!st.ball) {
      st.ball = [];
      for (let i = 0; i < BALL.streaks; i++) {
        const look = KM.swooshTint(WAND_SWOOSH[i % 3]);
        const n = createNode({ geometry: look, visible: false, sightHidden: true }); n.quaternion = BL.math.quat.create(); addChild(env.root, n);
        const back = createNode({ geometry: look, sightHidden: true, rotation: { x: 0, y: Math.PI, z: 0 } }); addChild(n, back);
        // The orbit's plane: the picture's own turned about a random axis.
        const ax = Math.random() * 2 - 1, ay = Math.random() * 2 - 1, az = Math.random() * 2 - 1, al = Math.hypot(ax, ay, az) || 1, plane = BL.math.quat.create();
        BL.math.quat.fromAxisAngle(plane, ax / al, ay / al, az / al, Math.random() * Math.PI * 2);
        st.ball.push({ n, back, plane, a: Math.random() * Math.PI * 2, w: (Math.random() < 0.5 ? -1 : 1) * (BALL.speed[0] + Math.random() * (BALL.speed[1] - BALL.speed[0])), r: 0.75 + Math.random() * 0.25 });
      }
    }
    return st.ball;
  };
  // The wand's draws no ball: tiny white and yellow orbs are pulled down into its tip from above (`MOTES`, `rate` a
  // second, each let go `from` m over it within `spread` of straight up and taking `life` s to arrive) until its rain
  // is over.
  const MOTES = { rate: 45, from: [1.4, 2.8], spread: 0.7, life: [0.35, 0.6] };
  const MOTE_LOOK = [["#ffffff", 0.03], ["#fff6c8", 0.026], ["#ffe14a", 0.03], ["#ffd21a", 0.024]].map(([color, w]) => BL.models.particleGeometry(color, w, 1));
  const motesUpdate = (dt, me) => {
    st.moteAt = (st.moteAt || 0) + MOTES.rate * dt;
    const t = wandTip(me);
    while (st.moteAt >= 1) {
      st.moteAt -= 1;
      const a = Math.random() * Math.PI * 2, tip = Math.random() * MOTES.spread, r = MOTES.from[0] + Math.random() * (MOTES.from[1] - MOTES.from[0]), life = MOTES.life[0] + Math.random() * (MOTES.life[1] - MOTES.life[0]);
      const ox = Math.cos(a) * Math.sin(tip) * r, oy = Math.cos(tip) * r, oz = Math.sin(a) * Math.sin(tip) * r;
      env.fx.spawnParticle(MOTE_LOOK[(Math.random() * MOTE_LOOK.length) | 0], t.x + ox, t.y + oy, t.z + oz, -ox / life, -oy / life, -oz / life, life, 0, 0, -1e3);
    }
  };
  const ballUpdate = (dt, holding, me) => {
    const wand = holding && st.drawLook !== STAFF_LINES;
    if (wand && (rain.on || st.heldFor < RAIN.at)) motesUpdate(dt, me);
    if (!holding && !st.ball) return;
    const list = ballPool(), on = holding && !wand && st.heldFor > BALL.start;
    if (!on) { for (let i = 0; i < list.length; i++) list[i].n.visible = false; return; }
    const t = wandTip(me), k = Math.min(1, (st.heldFor - BALL.start) / BALL.grow), R = BALL.size / 2 * (0.15 + 0.85 * BL.math.ease.outQuad(k));
    for (let i = 0; i < list.length; i++) {
      const s = list[i], n = s.n;
      s.a += s.w * dt;
      BL.math.quat.fromAxisAngle(BQ, 0, 0, 1, s.a); BL.math.quat.multiply(n.quaternion, s.plane, BQ);
      n.position.x = t.x; n.position.y = t.y; n.position.z = t.z;
      n.scale.x = n.scale.y = n.scale.z = R * s.r / 0.9;
      n.visible = true; n.geometry = s.back.geometry = KM.swooshTint((st.drawLook === STAFF_LINES ? STAFF_SWOOSH : WAND_SWOOSH)[i % 3]);
      n.smokeOpacity = s.back.smokeOpacity = Math.min(1, 0.4 + k);
    }
  };
  const drawInUpdate = (dt) => {
    const people = env.crew(), me = people && people.player;
    // The wand's cast held drawn up, or the staff's strike: the same draw-in, the staff's in its own colours.
    const staff = arms.active === "staff", holding = !!me && me.weapon.meleeHeld && (arms.active === "wand" && me.clubSwing === "cast" || staff && me.clubSwing === "cast");
    if (holding) st.holdStaff = staff;
    // The staff's let go after drawing it up: its pulse bursts out.
    if (!holding && st.heldFor >= PULSE.hold && st.holdStaff && me) pulseStart(me);
    // The wand's held that long rains fire from the sky until it is let go (`RAIN`).
    if (holding && !staff && !rain.on && st.heldFor + dt >= RAIN.at && st.heldFor < RAIN.at) rainStart(me);
    if (!holding && rain.on) rainStop();
    if (!holding) st.holdStaff = false;
    st.drawLook = holding && staff ? STAFF_LINES : DRAW_LINES;
    ballUpdate(dt, holding, me);
    // Held past a tap, the cast's draw-in is heard (`spellHold`) until it is let go, when the fireball's own sound
    // takes over; a quick press and release has only the fireball.
    if (!holding && st.heldFor > 0) st.heldLast = st.heldFor;
    st.heldFor = holding ? st.heldFor + dt : 0;
    if (holding && staff && st.heldFor >= DRAW_IN.heard && !st.holdHeard) { st.holdHeard = true; const p = me.root.position; env.audio().spellHold(p.x, p.y, p.z); }
    else if (!holding && st.holdHeard) { st.holdHeard = false; env.audio().spellHoldStop(); }
    if (!holding && !st.lines) return;
    const list = drawLines();
    // The wand draws in no lines (its orbs come down from above instead, `motesUpdate`).
    if (holding && staff && (st.lineAt -= dt) <= 0) {
      st.lineAt = DRAW_IN.every;
      for (let i = 0; i < list.length; i++) {
        const l = list[i];
        if (l.t > 0) continue;
        l.life = DRAW_IN.life[0] + Math.random() * (DRAW_IN.life[1] - DRAW_IN.life[0]); l.t = l.life;
        l.a = Math.random() * Math.PI * 2; l.r = DRAW_IN.from[0] + Math.random() * (DRAW_IN.from[1] - DRAW_IN.from[0]);
        l.y = DRAW_IN.rise[0] + Math.random() * (DRAW_IN.rise[1] - DRAW_IN.rise[0]);
        break;
      }
    }
    const p = me ? me.root.position : null, h = me ? me.traits.height : 1, cy = p ? p.y - me.baseY + h * DRAW_IN.chest : 0;
    for (let i = 0; i < list.length; i++) {
      const l = list[i], n = l.n;
      if (l.t > 0) l.t -= dt;
      // Let go of the cast and every line still on its way is gone with it.
      if (l.t <= 0 || !p) { l.t = 0; n.visible = false; continue; }
      const k = 1 - l.t / l.life, go = k * k, r = l.r * (1 - go), ox = Math.cos(l.a) * r, oz = Math.sin(l.a) * r, oy = l.y * h * (1 - go);
      n.visible = holding; n.geometry = st.drawLook[i % 3];
      n.position.x = p.x + ox; n.position.y = cy + oy; n.position.z = p.z + oz;
      // Along its way in, the tail streaming out behind it.
      n.rotation.y = Math.atan2(ox, oz); n.rotation.x = -Math.atan2(oy, Math.hypot(ox, oz));
      n.scale.z = Math.max(0.01, DRAW_IN.length * Math.min(1, k * 4) * (1 - go));
    }
  };
  // The wand raised for its fourth step: a white beam standing up off its gem into the sky, two crossed sheets turning
  // slowly, shooting up in `grow` s and gone in `gone` s once the wand is thrust.
  const SKY_BEAM = { tall: 40, wide: 3.2, grow: 0.25, gone: 0.08, spin: 0.8 };
  // The frost blade's beam is a thin bolt of white lightning from its tip into the sky (keep-models.js
  // `lightning`), its path flickering between its variants every `flicker` s.
  const SKY_BOLT = { flicker: 0.055, wide: [0.6, 0.9] };
  const skyBeamUpdate = (dt, cave, k) => {
    if (!st.sky) {
      st.sky = [0, 1].map(() => { const n = createNode({ geometry: KM.whiteBeam(), visible: false, sightHidden: true }); addChild(env.root, n); return n; });
      st.skyLevel = 0;
      st.skyBolt = createNode({ geometry: KM.lightning(0), visible: false, sightHidden: true }); addChild(env.root, st.skyBolt); st.skyFlick = 0;
    }
    if (st.spellFrost) {
      st.sky[0].visible = st.sky[1].visible = false;
      const raised = !!cave && st.spellT >= 0 && st.spellT < st.spellLead, b = st.skyBolt;
      st.skyLevel = raised ? Math.min(1, st.spellT / SKY_BEAM.grow) : Math.max(0, st.skyLevel - dt / SKY_BEAM.gone);
      b.visible = st.skyLevel > 0 && !!cave;
      if (!b.visible) return;
      if ((st.skyFlick -= dt) <= 0) { st.skyFlick = SKY_BOLT.flicker; b.geometry = KM.lightning((Math.random() * LIGHTNING.variants) | 0); b.rotation.y = Math.random() * Math.PI * 2; }
      const t = wandTip(cave), w = SKY_BOLT.wide[0] + Math.random() * (SKY_BOLT.wide[1] - SKY_BOLT.wide[0]);
      b.position.x = t.x; b.position.y = t.y; b.position.z = t.z;
      b.scale.x = b.scale.z = w * (0.6 + 0.4 * k); b.scale.y = BL.math.ease.outQuad(st.skyLevel);
      return;
    }
    if (st.skyBolt) st.skyBolt.visible = false;
    const raised = !!cave && st.spellT >= 0 && st.spellT < st.spellLead;
    st.skyLevel = raised ? Math.min(1, st.spellT / SKY_BEAM.grow) : Math.max(0, st.skyLevel - dt / SKY_BEAM.gone);
    const on = st.skyLevel > 0 && !!cave;
    st.sky[0].visible = st.sky[1].visible = on;
    if (!on) return;
    const t = wandTip(cave), reach = BL.math.ease.outQuad(st.skyLevel), flicker = 0.9 + 0.1 * Math.sin(st.spellT * 41);
    for (let i = 0; i < 2; i++) {
      const n = st.sky[i];
      n.position.x = t.x; n.position.y = t.y; n.position.z = t.z;
      n.rotation.y = st.spellT * SKY_BEAM.spin + i * Math.PI / 2;
      n.scale.x = SKY_BEAM.wide * (0.5 + 0.5 * k) * flicker; n.scale.y = SKY_BEAM.tall * reach; n.scale.z = 1;
      n.smokeOpacity = st.skyLevel;
    }
  };
  // The ball of fire a charge gathers at the tip (the wand's gem, the frost blade's point): three of the swirling
  // sprite (keep-models.js `fireSwirl`) turned to the view, each spun at its own rate, one way or the other, so its
  // flames swirl, the last a hot glow laid over them; it grows from a spark to `SWIRL.size` m across as the charge
  // builds, breathing as it does.
  const SWIRL = { size: 1.25, frost: 1.5, spin: [2.2, -3.1, 1.4], scale: [1, 0.86, 0.6], opacity: [1, 0.65, 0.4] };
  const swirlUpdate = (cave, k) => {
    if (!st.swirl) st.swirl = [0, 1, 2].map((i) => { const n = createNode({ geometry: KM.fireSwirl(i), visible: false, sightHidden: true }); addChild(env.root, n); return n; });
    // The staff's raise pulls the lightning down alone, with no fire gathering.
    const on = !!st.spellCave && !!cave && !st.spellRune;
    for (let i = 0; i < 3; i++) st.swirl[i].visible = on;
    if (!on) return;
    const t = wandTip(cave), T = st.spellT, grow = BL.math.ease.outQuad(Math.min(1, k)), s = (st.spellFrost ? SWIRL.frost : SWIRL.size) * (0.12 + 0.88 * grow) * (1 + 0.06 * Math.sin(T * 9) + 0.03 * Math.sin(T * 23));
    const dx = st.eyeX - t.x, dy = st.eyeY - t.y, dz = st.eyeZ - t.z, yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    for (let i = 0; i < 3; i++) {
      const n = st.swirl[i], size = s * SWIRL.scale[i];
      n.position.x = t.x; n.position.y = t.y; n.position.z = t.z;
      n.rotation.y = yaw; n.rotation.x = pitch; n.rotation.z = T * SWIRL.spin[i];
      // The middle one mirrored, so its flames turn against the first's.
      n.scale.x = (i === 1 ? -1 : 1) * size; n.scale.y = size; n.scale.z = 1;
      n.smokeOpacity = SWIRL.opacity[i] * Math.min(1, T * 6);
    }
  };
  const spellUpdate = (dt, elapsed) => {
    drawInUpdate(dt);
    rippleUpdate(dt, elapsed);
    lightningUpdate(dt);
    runeUpdate(dt);
    pulseUpdate(dt);
    popUpdate(dt); whirlUpdate(dt); rainUpdate(dt);
    const cave = st.spellCave;
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt);
    if (cave && st.spellT >= 0) {
      st.spellT += dt;
      if (st.spellT > st.spellLead + SPELL.late) { st.spellCave = null; st.spellT = -1; }
    }
    const k = st.spellT >= 0 ? Math.min(1, st.spellT / st.spellLead) : 0;
    st.dark = st.spellT >= 0 ? SPELL.dark * k * k : Math.max(0, st.dark - dt * SPELL.dark / SPELL.lift);
    skyBeamUpdate(dt, cave, k);
    swirlUpdate(cave, k);
    if (st.spellCave && st.spellFrost) { frostMotes(dt, cave, k); return; }
    const o = st.swirl[0];
    if (!o.visible) return;
    const t = wandTip(cave);
    // Sparks drawn in to the gem from round about, quicker as the charge builds.
    if ((st.spellMote -= dt) <= 0) {
      st.spellMote = SPELL.motes * (1.6 - k);
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2, r = SPELL.from * (0.7 + Math.random() * 0.6), life = 0.35 + Math.random() * 0.15;
      const ox = Math.cos(a) * Math.cos(e) * r, oy = Math.sin(e) * r, oz = Math.sin(a) * Math.cos(e) * r;
      env.fx.spawnParticle(BOLT_BITS[(Math.random() * BOLT_BITS.length) | 0], t.x + ox, t.y + oy, t.z + oz, -ox / life, -oy / life, -oz / life, life, 6, 0, -1e3);
    }
  };
  // The land's light taken down while the charge builds (and up for the pulse's flash): put on once the scene has set
  // its light for the frame, and taken off again before it sets it the next.
  const darken = (R) => {
    if (DARK.on) return;
    const f = (1 - st.dark) * (1 + SPELL.flash * st.flash / SPELL.flashFor);
    if (f === 1) return;
    let j = 0;
    for (let i = 0; i < DARK.arrays.length; i++) { const a = R[DARK.arrays[i]]; if (!a) continue; for (let c = 0; c < 3; c++) { DARK.saved[j++] = a[c]; a[c] *= f; } }
    for (let i = 0; i < DARK.scalars.length; i++) { const key = DARK.scalars[i]; if (R[key] === undefined) continue; DARK.saved[j++] = R[key]; R[key] *= f; }
    const L8 = R.lights, n = (R.lightCount || 0) * 8;
    for (let i = 0; i < n; i++) DARK.lights[i] = L8[i];
    for (let i = 0; i < n; i += 8) { L8[i + 4] *= f; L8[i + 5] *= f; L8[i + 6] *= f; }
    DARK.count = n; DARK.on = true;
    // The Ooga and the enemies near it keep their light: the renderers give it back inside their bodies (`relit`).
    if (st.dark > 0) {
      const B = DARK.bodies, people = env.crew(), me = people && people.player;
      let c = 0;
      if (me) {
        const p = me.root.position, h = me.traits.height, feet = p.y - me.baseY;
        B[0] = p.x; B[1] = p.z; B[2] = 0.35 * h + 0.25; B[3] = feet + 0.04; B[4] = feet + 2.2 * h; c = 1;
      }
      const mx = me ? me.root.position.x : 0, mz = me ? me.root.position.z : 0;
      for (let i = 0; i < st.foes.length && c < BL.glRenderer.RELIT_MAX; i++) {
        const k = st.foes[i];
        if (k.dead >= 0 || Math.abs(k.x - mx) > DARK.near || Math.abs(k.z - mz) > DARK.near) continue;
        const o = c++ * 5;
        B[o] = k.x; B[o + 1] = k.z; B[o + 2] = k.S.r + 0.35; B[o + 3] = k.y + 0.04; B[o + 4] = k.y + k.S.tall * 1.35 + 0.4;
      }
      R.relit = 1 / (1 - st.dark); R.relitBodies = B; R.relitCount = c;
    }
  };
  const undarken = (R) => {
    if (!DARK.on) return;
    let j = 0;
    for (let i = 0; i < DARK.arrays.length; i++) { const a = R[DARK.arrays[i]]; if (!a) continue; for (let c = 0; c < 3; c++) a[c] = DARK.saved[j++]; }
    for (let i = 0; i < DARK.scalars.length; i++) { const key = DARK.scalars[i]; if (R[key] === undefined) continue; R[key] = DARK.saved[j++]; }
    const L8 = R.lights;
    for (let i = 0; i < DARK.count; i++) L8[i] = DARK.lights[i];
    R.relit = 1; R.relitCount = 0;
    DARK.on = false;
  };
  // The staff's whirl (its third step, crew.js `WHIRL_SPIN`): the Ooga spinning fast inside a tornado of purple,
  // green and white swooshes (the sword's crescents, keep-models.js `swooshTint`) circling it, each tipped a little,
  // a funnel widening from `r0` at its feet to `r1` at `tall` m, turning `spin` rad a second, for `life` s; its blows
  // land all round as it goes (`cuts`, `hard` the staff's damage each).
  const WHIRL = { streaks: 18, life: 1.05, tall: 3.2, r0: 0.6, r1: 1.7, spin: 13, rise: 1.4, grow: 0.15, fade: 0.35, tip: 0.35, cuts: [0.2, 0.48, 0.76] };
  const WHIRL_TINTS = [1, 2, 0, 1, 2, 1];
  const WQ = BL.math.quat.create(), WQ_TIP = BL.math.quat.create();
  const WHIRL_CUTS = WHIRL.cuts.map((after) => ({ after, arc: 4, reach: 0.9, hard: 1, push: 1.6, tilt: 0, whirl: true }));
  const whirl = { t: 0, cave: null, streaks: null };
  const whirlOut = (cave) => {
    if (!whirl.streaks || whirl.streaks[0].n.parent !== env.root) {
      whirl.streaks = [];
      for (let i = 0; i < WHIRL.streaks; i++) {
        const look = KM.swooshTint(WHIRL_TINTS[i % WHIRL_TINTS.length]);
        const n = createNode({ geometry: look, visible: false, sightHidden: true }); n.quaternion = BL.math.quat.create(); addChild(env.root, n);
        const back = createNode({ geometry: look, sightHidden: true, rotation: { x: 0, y: Math.PI, z: 0 } }); addChild(n, back);
        whirl.streaks.push({ n, back, a: 0, u: 0, sp: 1, at: 0, tip: 0 });
      }
    }
    for (let i = 0; i < whirl.streaks.length; i++) {
      const k = whirl.streaks[i];
      k.a = Math.random() * Math.PI * 2; k.u = Math.random(); k.sp = 0.8 + Math.random() * 0.5; k.at = Math.random() * 0.25; k.tip = (Math.random() * 2 - 1) * WHIRL.tip;
    }
    whirl.t = WHIRL.life; whirl.cave = cave;
    const p = cave.root.position;
    env.audio().sword(p.x, p.y + 1, p.z); env.audio().fireball(p.x, p.y, p.z, BOLT.level);
    let c = 0;
    for (let i = 0; i < st.blows.length && c < WHIRL_CUTS.length; i++) {
      const b = st.blows[i];
      if (b.t > 0) continue;
      b.cut = WHIRL_CUTS[c]; b.t = b.cut.after; b.charge = 0; b.cave = cave; c++;
    }
  };
  const whirlUpdate = (dt) => {
    if (!whirl.streaks || whirl.t <= 0 || whirl.streaks[0].n.parent !== env.root) return;
    whirl.t -= dt;
    const done = whirl.t <= 0, cave = whirl.cave, age = WHIRL.life - whirl.t;
    const p = cave.root.position, feet = p.y - cave.baseY;
    for (let i = 0; i < whirl.streaks.length; i++) {
      const k = whirl.streaks[i], n = k.n, life = age - k.at;
      if (done || life <= 0) { n.visible = false; continue; }
      // Each streak climbs the funnel as it circles, widening with it.
      const u = (k.u + life * WHIRL.rise / WHIRL.tall) % 1, r = WHIRL.r0 + (WHIRL.r1 - WHIRL.r0) * u;
      const a = k.a + life * WHIRL.spin * k.sp, q = BL.math.quat;
      const env0 = Math.min(1, life / WHIRL.grow) * Math.min(1, whirl.t / WHIRL.fade);
      // A crescent about the Ooga's axis, laid flat as a sword's is, tipped and turned round with the spin.
      q.fromAxisAngle(WQ_TIP, 0, 0, 1, k.tip); q.multiply(WQ, WQ_TIP, SW_FLAT);
      q.fromAxisAngle(SW_YAW, 0, 1, 0, a); q.multiply(n.quaternion, SW_YAW, WQ);
      n.visible = true;
      n.position.x = p.x; n.position.y = feet + 0.1 + u * WHIRL.tall; n.position.z = p.z;
      n.scale.x = n.scale.y = n.scale.z = r / 0.9;
      n.smokeOpacity = k.back.smokeOpacity = env0;
    }
    if (done) whirl.cave = null;
  };
  const BLOW = { after: HIT_AFTER, arc: HIT_ARC, reach: 0, hard: 1, push: 1 };
  const swung = (cave, charge, step) => {
    if (charge < 0 || !arms.active) return;
    // The wand's cast is its fireball, as the throw lets it go (`cast`); its two cuts strike as the sword's do.
    if ((SWINGS[arms.active] === "spell" || SWINGS[arms.active] === "staff") && step === undefined) return;
    // The staff's third step, its whirl: a tornado round the Ooga and its blows all round as it spins.
    if (step === 2 && cave.weapon.whirl) { whirlOut(cave); return; }
    // The sword heard as it goes, each strike the next of its recorded swings; the slam's as it meets the ground.
    if (!(step !== undefined && CUTS[step].slam)) { const p = cave.root.position; env.audio().sword(p.x, p.y + 1, p.z); }
    // The slam's orb of light round the Ooga from the moment it jumps.
    if (step !== undefined && CUTS[step].slam) beamOn(cave);
    // The maul's slam's pulse heard as it sets out, so its boom comes in as it lands.
    if (step !== undefined && CUTS[step].slam && arms.active === "axe") { const p = cave.root.position; env.audio().staffPulse(p.x, p.y, p.z, MAUL_BOOM); }
    // Up to three blows on their way at once, so quick cuts each land.
    for (let i = 0; i < st.blows.length; i++) {
      const b = st.blows[i];
      if (b.t > 0) continue;
      b.cut = step === undefined ? BLOW : CUTS[step]; b.t = b.cut.after; b.charge = charge; b.cave = cave;
      // A spinning cut's swoosh sets out with the spin, not as the blow lands.
      if (b.cut.lead) swooshOut(cave, b.cut, env.crew().meleeReach(cave) + 0.45 + b.cut.reach + SWOOSH.reach);
      return;
    }
  };
  const blowLands = (b) => {
    const cave = b.cave, cut = b.cut, w = arms.ware(arms.active), people = env.crew();
    b.cave = null;
    if (!w || !people || cave !== people.player || !cave.weapon.primaryEquipped) return;
    const plain = cut === BLOW;
    const p = cave.root.position, feet = p.y - cave.baseY - (cave.hop || 0), reach = people.meleeReach(cave) + 0.45 + cut.reach + (plain ? 0 : SWOOSH.reach), yaw = cave.root.rotation.y;
    if (!plain && !cut.lead && !cut.whirl) swooshOut(cave, cut, reach);
    if (cut.slam) { slamDown(cave, b); return; }
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0) continue;
      const dx = k.x - p.x, dz = k.z - p.z, d = Math.hypot(dx, dz) - k.S.r;
      let off = Math.atan2(dx, dz) - yaw; off = Math.atan2(Math.sin(off), Math.cos(off));
      if (d < reach && (Math.abs(off) < cut.arc || d < 0.4) && feet > k.y - 1 && feet < k.y + k.S.tall) {
        foeHurt(k, damageOf(w) * cut.hard * (1 + b.charge), dx, dz, cut.push);
      }
    }
  };
  // An enemy struck: the hit heard and glowing red on it, knocked back a little and its own swing cut short; at no
  // health left it falls, pays its bounty into the land's bananas and is back at its post a while later.
  const foeHurt = (k, damage, dx, dz, hard = 1, quiet = false, ash = false) => {
    const S = k.S, d = Math.hypot(dx, dz) || 1, push = 0.5 * hard * KM.SKELETON.hip / k.D.hip;
    if (!quiet) env.audio().cut(k.x, k.y + k.D.hip, k.z);
    k.hp -= damage; k.flash = FLASH; k.swing = -1; k.struck = false; k.stagger = 0.35; k.v = 0;
    if (env.walk(k.x, k.z, k.x + dx / d * push, k.z + dz / d * push, k.y, S.r, S.tall)) { k.x += dx / d * push; k.z += dz / d * push; }
    if (k.hp > 0) return;
    k.dead = 0; k.hp = 0; k.landed = false; k.ash = ash;
    dropBananas(k.x, k.y, k.z, S.bounty);
    if (ash) { k.flash = 0; redden(k.root, 0); k.crumbled = false; return; }
    if (!k.bones) env.audio().ogreDie(k.x, k.y + k.D.neck, k.z);
    if (k.bones) breakApart(k);
  };
  // Killed by the wand's fourth-step fire: frozen where it stands mid-stride, charred to ash black over `char` s, its glow
  // dying with it, then at `crumble` s it falls to `bits` tiny blocks of ash that tumble down and lie a while, a puff of
  // ash smoke rising off them (the fx pool's own particles, so they need no pool of their own).
  const ASH = { char: 0.45, crumble: 1.05, bits: 44, size: 0.065, lie: [1.4, 2.2], smoke: 6 };
  const ASH_BITS = ["#141210", "#221f1c", "#2e2a26", "#3c3732", "#0b0a09"].map((color) => BL.models.box({ w: ASH.size, h: ASH.size, d: ASH.size, color }));
  const ASH_SMOKE = ["#2a2724", "#3a3632", "#1c1a18"].map((c) => BL.models.particleGeometry(c, 0.16, 0));
  const char = (node, v) => { node.scorch = v; node.glow = 1 - v; for (let i = 0; i < node.children.length; i++) char(node.children[i], v); };
  const ashUpdate = (k) => {
    if (k.crumbled) return;
    const v = Math.min(1, k.dead / ASH.char);
    char(k.root, v);
    // Frozen: a tremor as it chars, nothing else moving.
    k.root.position.x = k.x + (v < 1 ? (Math.random() - 0.5) * 0.03 * v : 0); k.root.position.z = k.z;
    if (k.dead < ASH.crumble) return;
    k.crumbled = true; k.root.visible = false;
    const S = k.S, ground = env.ground(k.x, k.z, k.y + 0.5);
    for (let i = 0; i < ASH.bits; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S.r * 0.85, up = Math.random() * S.tall * 0.95;
      const x = k.x + Math.cos(a) * r, z = k.z + Math.sin(a) * r, out = 0.3 + Math.random() * 1.1;
      env.fx.spawnParticle(ASH_BITS[i % ASH_BITS.length], x, k.y + up, z, Math.cos(a) * out, Math.random() * 0.8, Math.sin(a) * out, ASH.lie[0] + Math.random() * (ASH.lie[1] - ASH.lie[0]), 4, 9, ground + ASH.size / 2);
    }
    for (let i = 0; i < ASH.smoke; i++) {
      const d = env.fx.spawnParticle(ASH_SMOKE[i % ASH_SMOKE.length], k.x + (Math.random() - 0.5) * S.r, k.y + Math.random() * S.tall * 0.7, k.z + (Math.random() - 0.5) * S.r, (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 0.6, 1);
      if (d) d.smoke = true;
    }
    env.audio().bones(k.x, k.y + 0.6, k.z);
  };
  // Its bones come apart where it stood: each part from where it was, flung well out and up every way, tumbling,
  // bouncing once where it comes down and scattered over the ground (`SCATTER`); the clatter heard.
  const SCATTER = { out: [2.2, 5.2], up: [2.8, 6.2], spin: 16, bounce: 0.38, slide: 0.55, gravity: 14 };
  const breakApart = (k) => {
    BL.scene.updateWorld(k.root);
    for (let i = 0; i < k.parts.length; i++) {
      const part = k.parts[i], b = k.bones[i], m = part.world, a = Math.random() * Math.PI * 2, out = SCATTER.out[0] + Math.random() * (SCATTER.out[1] - SCATTER.out[0]);
      b.n.position.x = m[12]; b.n.position.y = m[13]; b.n.position.z = m[14];
      b.n.rotation.x = 0; b.n.rotation.y = k.yaw + (Math.random() - 0.5); b.n.rotation.z = 0;
      b.vx = Math.cos(a) * out; b.vz = Math.sin(a) * out; b.vy = SCATTER.up[0] + Math.random() * (SCATTER.up[1] - SCATTER.up[0]);
      b.sx = (Math.random() - 0.5) * SCATTER.spin; b.sz = (Math.random() - 0.5) * SCATTER.spin; b.bounced = false;
      // The skull sits upright on the pile; every other bone lies along the ground.
      b.rest = part === k.head ? 0 : (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2;
      b.lift = part === k.head ? 0 : 0.06; b.ground = env.ground(m[12], m[14], k.y + 0.5) + b.lift;
      b.down = false; b.n.visible = true;
    }
    k.root.visible = false;
    env.audio().bones(k.x, k.y + 0.6, k.z);
  };
  const bonesUpdate = (k, dt) => {
    for (let i = 0; i < k.bones.length; i++) {
      const b = k.bones[i], n = b.n, p = n.position;
      if (!n.visible) continue;
      if (!b.down) {
        b.vy -= SCATTER.gravity * dt;
        // Knocked back off a wall or anything else standing in its way.
        const nx = p.x + b.vx * dt, nz = p.z + b.vz * dt;
        if (!env.air || env.air(p.x, p.z, nx, nz, p.y)) { p.x = nx; p.z = nz; } else { b.vx *= -0.3; b.vz *= -0.3; }
        p.y += b.vy * dt;
        n.rotation.x += b.sx * dt; n.rotation.z += b.sz * dt;
        // The ground under it where it has flown to, not where it set out.
        if (b.vy < 0) b.ground = env.ground(p.x, p.z, p.y + 0.5) + b.lift;
        if (p.y <= b.ground && b.vy < 0) {
          p.y = b.ground;
          if (!b.bounced) { b.bounced = true; b.vy *= -SCATTER.bounce; b.vx *= SCATTER.slide; b.vz *= SCATTER.slide; b.sx *= 0.5; b.sz *= 0.5; }
          else { b.down = true; b.vx = b.vz = 0; }
        }
      } else {
        n.rotation.x += (b.rest - n.rotation.x) * Math.min(1, dt * 14); n.rotation.z += (0 - n.rotation.z) * Math.min(1, dt * 14);
      }
    }
  };
  // The bananas an enemy leaves where it fell, hovering and turning there for the visitor to walk into; taken, each
  // flies from where it hung to the stash at the foot of the screen (`#keep-bananas`), counted in and heard as it
  // lands (`flights`, drawn on the overlay). Fixed pools, nothing allocated a frame.
  // A banana left lying `DROP_LIFE` seconds is lost: it blinks its last `DROP_BLINK` seconds and vanishes in a puff.
  const DROPS = 48, FLIGHTS = 48, PICK = 1.7, FLY = 0.6, STAGGER = 0.09, DUST_EVERY = 0.09, DROP_LIFE = 120, DROP_BLINK = 8;
  const DUST = ["#fff3a0", "#ffd84a", "#fffbe6", "#ffe27a"].map((c) => BL.models.particleGeometry(c, 0.05, 1));
  const buildDrops = () => {
    const g = KM.dropBanana(), s = st;
    s.drops = [];
    for (let i = 0; i < DROPS; i++) { const n = createNode({ geometry: g, visible: false, sightHidden: true, scale: { x: 0.85, y: 0.85, z: 0.85 } }); addChild(env.root, n); s.drops.push({ n, x: 0, y: 0, z: 0, phase: 0, on: false, dust: 0, age: 0 }); }
    s.flights = [];
    for (let i = 0; i < FLIGHTS; i++) s.flights.push({ on: false, x: 0, y: 0, z: 0, t: 0, sx: 0, sy: 0 });
    s.pickT = 0;
  };
  const dropBananas = (x, y, z, n) => {
    const s = st;
    let left = n;
    for (let i = 0; i < s.drops.length && left > 0; i++) {
      const d = s.drops[i];
      if (d.on) continue;
      const a = (n - left) / n * Math.PI * 2 + Math.random() * 0.4, r = n > 1 ? 0.35 + n * 0.04 : 0;
      d.on = true; d.x = x + Math.cos(a) * r; d.z = z + Math.sin(a) * r; d.y = y; d.phase = Math.random() * 6; d.n.visible = true; d.age = 0;
      left--;
    }
    // A full pool pays the rest straight in.
    if (left > 0) purse.add(left);
  };
  const SCREEN = { x: 0, y: 0, depth: 0 };
  const dropsUpdate = (dt, elapsed) => {
    const s = st, people = env.crew(), cave = people && people.player, p = cave && cave.root.position, feet = p ? p.y - cave.baseY : 0;
    let stagger = 0;
    for (let i = 0; i < s.drops.length; i++) {
      const d = s.drops[i];
      if (!d.on) continue;
      const n = d.n, t = elapsed * 2.2 + d.phase;
      d.age += dt;
      if (d.age >= DROP_LIFE) {
        d.on = false; n.visible = false;
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; env.fx.spawnParticle(DUST[k % DUST.length], d.x, d.y + 0.95, d.z, Math.cos(a) * 0.9, 0.4 + Math.random() * 0.4, Math.sin(a) * 0.9, 0.6, 3, -0.6, -100); }
        continue;
      }
      n.visible = d.age < DROP_LIFE - DROP_BLINK || Math.floor(d.age * (d.age > DROP_LIFE - 3 ? 8 : 4)) % 2 === 0;
      n.position.x = d.x; n.position.z = d.z; n.position.y = d.y + 0.95 + Math.sin(t) * 0.12; n.rotation.y = elapsed * 2 + d.phase; n.rotation.z = 0.35; n.glow = 0.75 + 0.25 * Math.sin(t * 1.9);
      // Fairy dust drifting up off it, a mote every so often.
      d.dust -= dt;
      if (d.dust <= 0) {
        d.dust = DUST_EVERY * (0.6 + Math.random() * 0.8);
        const a = Math.random() * Math.PI * 2, r = 0.15 + Math.random() * 0.35;
        env.fx.spawnParticle(DUST[(Math.random() * DUST.length) | 0], d.x + Math.cos(a) * r, n.position.y - 0.2 + Math.random() * 0.4, d.z + Math.sin(a) * r, Math.cos(a) * 0.15, 0.5 + Math.random() * 0.5, Math.sin(a) * 0.15, 0.9 + Math.random() * 0.7, 3, -0.6, -100);
      }
      if (p && !env.leaving() && Math.hypot(p.x - d.x, p.z - d.z) < PICK && Math.abs(feet - d.y) < 2.4) {
        d.on = false; n.visible = false;
        const f = s.flights.find((q) => !q.on);
        if (!f) { purse.add(1); continue; }
        f.on = true; f.x = n.position.x; f.y = n.position.y; f.z = n.position.z; f.t = -stagger; stagger += STAGGER;
        const at = env.renderer.project(f.x, f.y, f.z, SCREEN); f.sx = at ? SCREEN.x : innerWidth / 2; f.sy = at ? SCREEN.y : innerHeight / 2;
      }
    }
    for (let i = 0; i < s.flights.length; i++) {
      const f = s.flights[i];
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= FLY) { f.on = false; purse.add(1); purse.pulse(); env.audio().pling(s.pickT); s.pickT = (s.pickT + 1) % 8; }
    }
  };
  // Each banana in flight on the overlay: from where it hung (followed while the view moves) along an arc to the
  // stash, shrinking as it goes.
  // Each enemy's health over its head: a section for each of its hit points, lit while it has it, nearer ones larger,
  // none past BAR.far or for one fallen.
  const BAR = { far: 32, cell: 8, gap: 2, tall: 7, pad: 2, above: 0.35 };
  const drawBars = (ctx2d) => {
    const people = env.crew(), cave = people && people.player;
    if (!cave) return;
    const p = cave.root.position;
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0 || !k.root.visible) continue;
      const d = Math.hypot(k.x - p.x, k.z - p.z);
      if (d > BAR.far || !env.renderer.project(k.x, k.y + k.D.height + BAR.above, k.z, SCREEN)) continue;
      const n = k.S.hp, left = Math.max(0, Math.ceil(k.hp)), z = Math.max(0.6, Math.min(1.2, 9 / Math.max(1, d)));
      const cw = BAR.cell * z, gap = BAR.gap * z, h = BAR.tall * z, pad = BAR.pad * z, w = n * cw + (n - 1) * gap, x0 = SCREEN.x - w / 2, y0 = SCREEN.y - h;
      ctx2d.fillStyle = "rgba(12,10,9,0.78)";
      ctx2d.fillRect(x0 - pad, y0 - pad, w + pad * 2, h + pad * 2);
      for (let j = 0; j < n; j++) {
        ctx2d.fillStyle = j < left ? (k.flash > 0 ? "#ffe0d0" : "#e5432f") : "rgba(255,255,255,0.14)";
        ctx2d.fillRect(x0 + j * (cw + gap), y0, cw, h);
      }
    }
  };
  const drawFlights = (ctx2d) => {
    const s = st;
    drawBars(ctx2d);
    let tx = 0, ty = 0, any = false;
    for (let i = 0; i < s.flights.length; i++) {
      const f = s.flights[i];
      if (!f.on || f.t < 0) continue;
      if (!any) { const r = purse.target(); tx = r.x; ty = r.y; any = true; }
      if (env.renderer.project(f.x, f.y, f.z, SCREEN)) { f.sx = SCREEN.x; f.sy = SCREEN.y; }
      const k = f.t / FLY, e = k * k * (3 - 2 * k), x = f.sx + (tx - f.sx) * e, y = f.sy + (ty - f.sy) * e - Math.sin(k * Math.PI) * 90, size = 28 - 14 * e;
      ctx2d.save();
      ctx2d.translate(x, y); ctx2d.rotate(k * 5);
      ctx2d.fillStyle = "#ffe53a"; ctx2d.strokeStyle = "#6a4a0a"; ctx2d.lineWidth = 2; ctx2d.shadowColor = "#fff2a0"; ctx2d.shadowBlur = 10;
      ctx2d.beginPath(); ctx2d.arc(0, -size * 0.35, size * 0.75, 0.35, Math.PI - 0.35); ctx2d.arc(0, -size * 0.85, size * 0.95, Math.PI - 0.55, 0.55, true); ctx2d.closePath();
      ctx2d.fill(); ctx2d.stroke();
      ctx2d.restore();
    }
  };
  const update = (dt, elapsed) => {
    const s = st;
    for (let i = 0; i < s.blows.length; i++) { const b = s.blows[i]; if (b.t > 0 && (b.t -= dt) <= 0) blowLands(b); }
    // Whoever was just struck glows red, fading.
    if (s.hurt > 0) { s.hurt = Math.max(0, s.hurt - dt); if (s.hurtOn.root) redden(s.hurtOn.root, 0.75 * s.hurt / FLASH); if (s.hurt === 0) s.hurtOn = null; }
    for (let i = 0; i < s.foes.length; i++) foeUpdate(s.foes[i], dt, elapsed);
    // They keep apart, each shouldered out of another's way half the overlap, where it may step.
    for (let i = 0; i < s.foes.length; i++) for (let j = i + 1; j < s.foes.length; j++) {
      const a = s.foes[i], b = s.foes[j];
      if (a.dead >= 0 || b.dead >= 0) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue;
      const d = Math.hypot(dx, dz), gap = a.S.r + b.S.r + 0.1 - d;
      if (gap <= 0 || d < 1e-4) continue;
      const ux = dx / d * gap / 2, uz = dz / d * gap / 2;
      if (env.walk(a.x, a.z, a.x - ux, a.z - uz, a.y, a.S.r, a.S.tall)) { a.x -= ux; a.z -= uz; }
      if (env.walk(b.x, b.z, b.x + ux, b.z + uz, b.y, b.S.r, b.S.tall)) { b.x += ux; b.z += uz; }
    }
    dropsUpdate(dt, elapsed);
    swooshUpdate(dt);
    bladeUpdate(dt, elapsed);
    boltUpdate(dt);
    shotsUpdate(dt);
    spellUpdate(dt, elapsed);
    slamUpdate(dt);
    beamUpdate(dt);
    pulsesUpdate(dt);
  };
  // Thrown by a slam: slid out along the ground, fast then slowing, until it has gone its distance or meets something.
  const shoved = (k, dt) => {
    if (k.shove <= 0) return;
    const S = k.S, step = Math.min(k.shove, (3 + SLAM.speed * k.shove / SLAM.throw) * dt), nx = k.x + k.shoveX * step, nz = k.z + k.shoveZ * step;
    if (env.walk(k.x, k.z, nx, nz, k.y, S.r, S.tall)) { k.x = nx; k.z = nz; k.shove -= step; } else k.shove = 0;
  };
  // A burst among them (a cannon's ball): every enemy within `r` of it takes `damage` and is flung into the air,
  // `up` m/s, and away from it; one it breaks apart has its bones thrown up too.
  const blast = (x, y, z, r, damage, up) => {
    for (let i = 0; i < st.foes.length; i++) {
      const k = st.foes[i];
      if (k.dead >= 0) continue;
      const dx = k.x - x, dz = k.z - z, d = Math.hypot(dx, dz);
      if (d > r + k.S.r || Math.abs(k.y + k.D.hip - y) > r + 2) continue;
      const ox = d > 0.05 ? dx : Math.random() - 0.5, oz = d > 0.05 ? dz : Math.random() - 0.5;
      foeHurt(k, damage, ox, oz, 1.5, true);
      thrown(k, ox, oz, 5, 7);
      k.liftV = up * (0.8 + Math.random() * 0.4);
      if (k.dead >= 0 && k.bones) for (let j = 0; j < k.bones.length; j++) k.bones[j].vy += up * 0.7;
    }
  };
  // A shooter's fire (a spec's `shot`): where the cannon on `k`'s shoulder ends, into `o`; whether a straight line
  // from it to the chest of `cave` is clear of the ground and of whatever stands in the air's way; the shot itself,
  // one of a fixed pool, flown straight in short steps so it never passes through anyone, hurting the visitor it
  // meets as a blow does (`foeHit`) and bursting in sparks on whatever else it meets.
  const SHOTS = 8, MUZZLE = { x: 0, y: 0, z: 0 };
  const muzzleOf = (k, o) => {
    const M = k.D.muzzle, sn = Math.sin(k.yaw), cs = Math.cos(k.yaw);
    o.x = k.x + sn * M.z + cs * M.x; o.y = k.y + k.D.hip + M.y; o.z = k.z + cs * M.z - sn * M.x;
  };
  const sighted = (k, cave) => {
    muzzleOf(k, MUZZLE);
    const p = cave.root.position, ty = p.y - cave.baseY + cave.traits.height * 0.55, dx = p.x - MUZZLE.x, dy = ty - MUZZLE.y, dz = p.z - MUZZLE.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 0.9));
    for (let i = 1; i < n; i++) {
      const x = MUZZLE.x + dx * i / n, y = MUZZLE.y + dy * i / n, z = MUZZLE.z + dz * i / n;
      if (env.ground(x, z, y) > y || env.air && !env.air(x, z, x, z, y)) return false;
    }
    return true;
  };
  const shots = () => {
    if (!st.shots) {
      st.shots = [];
      for (let i = 0; i < SHOTS; i++) {
        const n = createNode({ geometry: KM.fireball(), visible: false, sightHidden: true });
        addChild(env.root, n);
        st.shots.push({ n, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gone: 0, trail: 0, live: false, by: null });
      }
    }
    return st.shots;
  };
  const shoot = (k, cave) => {
    const F = k.S.shot, list = shots(), p = cave.root.position;
    let b = list[0];
    for (let i = 0; i < list.length; i++) { if (!list[i].live) { b = list[i]; break; } if (list[i].gone > b.gone) b = list[i]; }
    muzzleOf(k, MUZZLE);
    const dx = p.x - MUZZLE.x, dy = p.y - cave.baseY + cave.traits.height * 0.55 - MUZZLE.y, dz = p.z - MUZZLE.z, l = Math.hypot(dx, dy, dz) || 1;
    b.live = true; b.by = k; b.x = MUZZLE.x; b.y = MUZZLE.y; b.z = MUZZLE.z; b.vx = dx / l * BOLT.speed; b.vy = dy / l * BOLT.speed; b.vz = dz / l * BOLT.speed; b.gone = 0; b.trail = 0;
    // It bursts as a fireball held drawn up does.
    b.burst = BOLT.level;
    b.n.visible = true; b.n.scale.x = b.n.scale.y = b.n.scale.z = BOLT.size; b.n.position.x = b.x; b.n.position.y = b.y; b.n.position.z = b.z;
    env.audio().fireball(b.x, b.y, b.z, BOLT.level);
    for (let i = 0; i < 6; i++) env.fx.spawnParticle(BOLT_BITS[i % BOLT_BITS.length], b.x, b.y, b.z, b.vx * 0.15 + (Math.random() - 0.5) * 3, b.vy * 0.15 + (Math.random() - 0.5) * 3, b.vz * 0.15 + (Math.random() - 0.5) * 3, 0.2 + Math.random() * 0.2, 6, 2, b.y - 3);
  };
  const shotsUpdate = (dt) => {
    if (!st.shots) return;
    const people = env.crew(), cave = people && people.player, p = cave ? cave.root.position : null;
    for (let i = 0; i < st.shots.length; i++) {
      const b = st.shots[i];
      if (!b.live) continue;
      const F = b.by.S.shot, steps = Math.max(1, Math.ceil(BOLT.speed * dt / BOLT.step)), h = dt / steps;
      for (let sub = 0; sub < steps && b.live; sub++) {
        const ax = b.x, az = b.z;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.gone += BOLT.speed * h;
        if (p && !env.leaving()) {
          const feet = p.y - cave.baseY;
          if (Math.hypot(p.x - b.x, p.z - b.z) < (cave.bodyRadius || 0.4) + F.hit && b.y > feet - 0.15 && b.y < feet + cave.traits.height + 0.2) { boltBurst(b); foeHit(b.by, cave); break; }
        }
        if (b.gone > F.range || env.ground(b.x, b.z, b.y) > b.y || env.air && !env.air(ax, az, b.x, b.z, b.y)) { boltBurst(b); break; }
      }
      if (!b.live) continue;
      b.n.position.x = b.x; b.n.position.y = b.y; b.n.position.z = b.z;
      b.n.rotation.y += dt * 9; b.n.rotation.x += dt * 6;
      if ((b.trail -= dt) <= 0) {
        b.trail = BOLT.trail;
        env.fx.spawnParticle(BOLT_BITS[(Math.random() * BOLT_BITS.length) | 0], b.x, b.y, b.z, (Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.2, 6, -1.2, b.y - 3);
      }
    }
  };
  // An ogre's leap (a spec's `leap`): he crouches `wind` s, then springs `time` s through the air, `rise` high at the
  // top, onto where whoever he follows stood as he left the ground. Where he lands the ground bursts as a fireball
  // held drawn up does (`env.impact`; without it his axe's smash and a shower of sparks) and shakes, and whoever is
  // within `hit` of it takes his blow and is stunned `stun` s (the crew's `stun`).
  const leapStart = (k, cave) => {
    const p = cave.root.position;
    k.leapT = 0; k.lx0 = k.x; k.lz0 = k.z; k.ly0 = k.y; k.lx1 = p.x; k.lz1 = p.z; k.ly1 = env.ground(p.x, p.z, p.y - cave.baseY + 0.5); k.v = 0;
    k.yaw = Math.atan2(k.lx1 - k.x, k.lz1 - k.z);
    env.audio().swish(k.x, k.y + k.D.hip * 1.8, k.z);
  };
  const leapStep = (k, dt, cave) => {
    const J = k.S.leap;
    k.leapT += dt;
    const u = (k.leapT - J.wind) / J.time;
    if (u < 0) return;
    if (u < 1) { k.x = k.lx0 + (k.lx1 - k.lx0) * u; k.z = k.lz0 + (k.lz1 - k.lz0) * u; k.y = k.ly0 + (k.ly1 - k.ly0) * u + J.rise * 4 * u * (1 - u); return; }
    k.x = k.lx1; k.z = k.lz1; k.y = env.ground(k.x, k.z, k.ly1 + 0.5);
    k.leapT = -1; k.leapNext = J.every[0] + Math.random() * (J.every[1] - J.every[0]); k.next = 0.9; k.stagger = Math.max(k.stagger, 0.45);
    st.quake = SLAM.settle; st.quakeAmp = 1;
    if (env.impact) env.impact(k.x, k.y, k.z, BOLT.level);
    else {
      env.audio().smash(k.x, k.y, k.z); env.audio().fireHit(k.x, k.y + 0.5, k.z);
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6; env.fx.spawnParticle(BOLT_BITS[i % BOLT_BITS.length], k.x, k.y + 0.3, k.z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, 8, 6, k.y - 1); }
    }
    if (!cave || env.leaving()) return;
    const p = cave.root.position, people = env.crew();
    if (Math.hypot(p.x - k.x, p.z - k.z) > J.hit || Math.abs(p.y - cave.baseY - k.y) > 3.5) return;
    foeHit(k, cave);
    if (health.value > 0 && people && people.stun) people.stun(cave, J.stun);
  };
  const foeUpdate = (k, dt, elapsed) => {
    const S = k.S, D = k.D, people = env.crew(), cave = people && people.player, p = cave ? cave.root.position : null, big = D.hip / 0.78;
    shoved(k, dt);
    // Flung into the air (`blast`), it comes down again.
    if (k.liftV !== 0 || k.lift > 0) { k.liftV -= 22 * dt; k.lift += k.liftV * dt; if (k.lift <= 0) { k.lift = 0; k.liftV = 0; } }
    if (k.flash > 0) { k.flash = Math.max(0, k.flash - dt); redden(k.root, 0.8 * k.flash / FLASH); }
    // Fallen: it topples back and sinks away, and comes back at its post.
    if (k.dead >= 0) {
      // Brought down in the air, he comes to the ground where he is.
      if (k.leapT >= 0) { k.leapT = -1; k.y = env.ground(k.x, k.z, k.y); }
      k.dead += dt;
      if (k.ash) ashUpdate(k);
      else if (k.bones) {
        // The pile lies a moment, then sinks into the earth and is gone.
        bonesUpdate(k, dt);
        const sink = Math.max(0, k.dead - BONES_LIE);
        if (sink > 0) for (let i = 0; i < k.bones.length; i++) { const b = k.bones[i]; if (!b.n.visible) continue; b.n.position.y = b.ground - sink * sink * 0.35; if (sink > BONES_SINK) b.n.visible = false; }
      } else {
        k.root.position.x = k.x; k.root.position.z = k.z;
        const fall = Math.min(1, k.dead / 0.7), sink = Math.max(0, k.dead - 1.6);
        // Its body hits the ground as it finishes toppling.
        if (fall >= 1 && !k.landed) { k.landed = true; env.audio().ogreFall(k.x, k.y + 0.5, k.z); }
        k.root.rotation.x = -fall * fall * 1.45; k.root.position.y = k.y + k.lift - sink * 0.9 * big;
        k.root.visible = sink < 1.6;
      }
      if (k.dead > S.respawn) foeHome(k);
      return;
    }
    // Struck by the frost blade's lightning: it stands where it is, in the pose it was struck in, glowing white.
    if (k.frozen > 0) {
      k.frozen -= dt; k.v = 0; k.swing = -1;
      redden(k.root, k.frozen > 0 ? 1 : 0);
      if (k.frozen > 0) return;
      k.flash = 0;
    }
    // Held by the wand's rain: where it stands, doing nothing.
    if (k.held > 0) { k.held -= dt; k.v = 0; k.swing = -1; return; }
    if (k.stagger > 0) { k.stagger -= dt; k.v = 0; }

    // Whom it walks to: the visitor while they are on the islet or its dock, else its post.
    k.grace = Math.max(0, k.grace - dt);
    const here = !!p && k.grace <= 0 && !env.leaving() && env.chase(k, p, p.y - cave.baseY);
    k.hunting = here;
    // One that keeps a far post (`lazy`), standing at it with nobody near, does nothing at all.
    if (!here && S.lazy && k.v === 0 && k.swing < 0 && k.flash === 0 && Math.hypot(k.x - S.post.x, k.z - S.post.z) < 0.6) return;
    const tx = here ? p.x : S.post.x, tz = here ? p.z : S.post.z, dx = tx - k.x, dz = tz - k.z, d = Math.hypot(dx, dz);
    // An ogre near enough jumps on them; in the air he neither walks, turns nor swings.
    const J = S.leap;
    if (J && k.leapT < 0) {
      k.leapNext = Math.max(0, k.leapNext - dt);
      if (here && k.stagger <= 0 && k.swing < 0 && k.leapNext <= 0 && d < J.from && d > J.least && Math.abs(p.y - cave.baseY - k.y) < J.tall) leapStart(k, cave);
    }
    if (k.leapT >= 0) leapStep(k, dt, cave);
    const air = k.leapT >= 0;
    if (air) k.v = 0;
    const near = S.shot && k.blind ? S.shot.close : S.near;
    const want = k.stagger > 0 || air ? 0 : here && S.sprint ? (d > near ? S.run : 0) : here ? (d > S.far ? S.run : d > near ? Math.min(S.walk, (d - near) * 3 + 0.9) : 0) : d > 0.5 ? S.walk : 0;
    k.v += clamp(want - k.v, -S.accel * dt, S.accel * dt);
    // The way it heads: straight at its target on the islet's top, but down on the dock and the path up from it, and
    // to or from them, along their middle (`lane`), so it never steps off the dock's side onto the sand below it.
    WAY.x = tx; WAY.z = tz;
    if (env.route) env.route(k, tx, tz, WAY);
    const aim = !here && d <= 0.5 ? S.post.yaw : Math.atan2(WAY.x - k.x, WAY.z - k.z);
    if (!air && (d > 0.3 || !here)) { let gap = aim - k.yaw; gap = Math.atan2(Math.sin(gap), Math.cos(gap)); k.yaw += clamp(gap, -S.turn * dt, S.turn * dt); }
    if (k.v > 0.01) {
      const sx = Math.sin(k.yaw) * k.v * dt, sz = Math.cos(k.yaw) * k.v * dt;
      // Held up a moment (a ledge it came off, a bank too high), it scrambles: up a ledge twice a step's height.
      const lift = k.stuck > 0.6 ? env.step : 0;
      if (env.walk(k.x, k.z, k.x + sx, k.z + sz, k.y + lift, S.r, S.tall)) { k.x += sx; k.z += sz; k.stuck = 0; }
      else if (env.walk(k.x, k.z, k.x + sx, k.z, k.y + lift, S.r, S.tall)) { k.x += sx; k.stuck += dt * 0.5; }
      else if (env.walk(k.x, k.z, k.x, k.z + sz, k.y + lift, S.r, S.tall)) { k.z += sz; k.stuck += dt * 0.5; }
      else { k.v = 0; k.stuck += dt; }
      k.y = env.ground(k.x, k.z, k.y + 0.3 + lift);
    } else k.stuck = 0;
    k.phase += k.v * dt * S.stride;
    // Within reach it swings, and the blow lands as the weapon comes forward if they are still there before it.
    if (k.swing >= 0) {
      const was = k.swing;
      k.swing += dt / S.swing;
      if (was <= 0 && !S.shot) env.audio().swish(k.x, k.y + D.hip * 1.8, k.z);
      if (S.smash && was < S.smash.at && k.swing >= S.smash.at) foeSmash(k);
      if (S.pulse && was < S.pulse.at && k.swing >= S.pulse.at) foePulse(k);
      if (S.shot) { if (was < S.at && k.swing >= S.at && here) shoot(k, cave); }
      else if (was < S.at && k.swing >= S.at && here && !k.struck) {
        let off = Math.atan2(dx, dz) - k.yaw; off = Math.atan2(Math.sin(off), Math.cos(off));
        if (d < S.reach && Math.abs(off) < S.arc && Math.abs(p.y - cave.baseY - k.y) < S.tall) { k.struck = true; foeHit(k, cave); }
      }
      if (k.swing >= 1) { k.swing = -1; k.struck = false; k.next = S.every[0] + Math.random() * (S.every[1] - S.every[0]); }
    } else if (here && !air && k.stagger <= 0 && d < S.reach - 0.3) {
      k.next -= dt;
      if (k.next <= 0) {
        if (!S.shot) k.swing = 0;
        else {
          // A shooter fires only square on to whoever he follows and with a clear line to them; without one he
          // looks again in a moment and meanwhile comes on.
          let off = Math.atan2(dx, dz) - k.yaw; off = Math.atan2(Math.sin(off), Math.cos(off));
          if (Math.abs(off) < S.arc) { k.blind = !sighted(k, cave); if (k.blind) k.next = 0.4; else k.swing = 0; }
        }
      }
    } else if (S.shot) k.blind = false;
    // The pose. Legs swing with the stride and bend behind, the body leans into a run and turns a little against the
    // legs, and both arms pump against them, each opposite its own leg, elbows bent the more the faster it goes.
    const run = clamp((k.v - S.walk) / (S.run - S.walk), 0, 1), amp = Math.min(1, k.v / 1.6) * (0.55 + 0.4 * run), sn = Math.sin(k.phase), cs = Math.cos(k.phase), t = elapsed;
    const r = k.root;
    r.position.x = k.x; r.position.z = k.z; r.position.y += (k.y + k.lift + Math.abs(cs) * 0.035 * big * amp - r.position.y) * Math.min(1, dt * 14); r.rotation.y = k.yaw;
    // A turn about x swings what hangs down backward and tips what stands up forward.
    k.legs[0].rotation.x = sn * amp; k.legs[1].rotation.x = -sn * amp;
    k.knees[0].rotation.x = Math.max(0, cs) * amp * 1.5; k.knees[1].rotation.x = Math.max(0, -cs) * amp * 1.5;
    k.body.rotation.x = run * 0.24 + Math.sin(t * 1.7) * 0.012; k.body.position.y = D.hip + Math.sin(t * 1.7) * 0.006 * big;
    const pump = amp * (0.45 + 0.6 * run);
    k.armL.rotation.x = sn * pump; k.foreL.rotation.x = -(0.2 + run * 1.15 + Math.max(0, -sn) * amp * 0.45);
    // The weapon arm: standing, the fist before the right hip and the weapon upright; in a swing the arm is pulled back
    // behind the shoulder with the weapon tipped back, then both come forward at whoever stands before it, and back.
    const H = S.hold, R = S.raised, K = S.struck;
    let shoulder = H[0] * (1 - 0.6 * run) - sn * pump * 0.8, elbow = H[1] - Math.max(0, sn) * amp * 0.3, blade = H[2] - run * 0.25, twist = sn * amp * 0.12;
    if (k.swing >= 0) {
      const w = k.swing, up = w < 0.4 ? w / 0.4 : 1, lift = up * up * (3 - 2 * up), down = w < 0.4 ? 0 : Math.min(1, (w - 0.4) / 0.16), fall = down * down, back = w < 0.72 ? 0 : (w - 0.72) / 0.28, home = back * back * (3 - 2 * back);
      const s0 = shoulder, e0 = elbow, b0 = blade;
      shoulder += (R[0] - s0) * lift + (K[0] - R[0]) * fall + (s0 - K[0]) * home;
      elbow += (R[1] - e0) * lift + (K[1] - R[1]) * fall + (e0 - K[1]) * home;
      blade += (R[2] - b0) * lift + (K[2] - R[2]) * fall + (b0 - K[2]) * home;
      twist += (-0.5 * lift + 0.95 * fall) * (1 - home);
    }
    k.armR.rotation.x = shoulder; k.foreR.rotation.x = elbow; k.body.rotation.y = twist;
    if (k.sword) k.sword.rotation.x = blade - (k.body.rotation.x + shoulder + elbow);
    // A shooter stands square behind his cannon, rocked back by its kick.
    if (S.shot) {
      const w = k.swing, kick = w < S.at ? 0 : Math.max(0, 1 - (w - S.at) / 0.3);
      k.body.rotation.y = sn * amp * 0.12; k.body.rotation.x -= kick * kick * 0.16 - (w >= 0 && w < S.at ? w / S.at * 0.05 : 0);
      k.gun.position.z = D.cannon.z - kick * kick * S.shot.kick;
    }
    if (k.cape) k.cape.rotation.x = 0.1 + run * 0.55 + amp * 0.15 + Math.sin(t * 2.1) * 0.05;
    // Leaping: crouched as he gathers, then through the air with his knees drawn up and his axe raised over his head.
    if (air) {
      const u = (k.leapT - S.leap.wind) / S.leap.time, crouch = u < 0 ? 1 + u * S.leap.time / S.leap.wind : 0, tuck = u < 0 ? crouch * 0.6 : Math.sin(Math.PI * Math.min(1, u));
      r.position.y = k.y - crouch * 0.35 * big;
      k.legs[0].rotation.x = k.legs[1].rotation.x = -0.85 * tuck; k.knees[0].rotation.x = k.knees[1].rotation.x = 1.5 * tuck;
      k.body.rotation.x = 0.3 * tuck; k.armR.rotation.x = R[0] + (K[0] - R[0]) * Math.max(0, u * u * u); k.foreR.rotation.x = R[1]; k.armL.rotation.x = -1.6 * tuck;
      if (k.sword) k.sword.rotation.x = R[2] - (k.body.rotation.x + k.armR.rotation.x + R[1]);
    }
    // Its head turns to whoever it follows while it stands.
    let look = 0;
    if (p && here) { look = Math.atan2(p.x - k.x, p.z - k.z) - k.yaw - twist; look = clamp(Math.atan2(Math.sin(look), Math.cos(look)), -1, 1); }
    k.head.rotation.y += (look - k.head.rotation.y) * Math.min(1, dt * 5); k.head.rotation.x = Math.sin(t * 0.9) * 0.03 - run * 0.15;
  };
  buildDrops();
  return { add, update, swung, cast, spell, darken, undarken, drawFlights, knightAura, get strikes() { return strikes; }, get bolts() { return st.bolts; }, get rain() { return rain; },
    // The ground shaken from outside (the volcano), `amp` of a slam's; and a blow from something that is no enemy
    // (`k`: `{ S: { blow, name } }`), with everything a blow does.
    rumble: (amp) => { st.quake = SLAM.settle; st.quakeAmp = amp; }, strike: (k, cave) => foeHit(k, cave), blast, homeAll: () => { for (let i = 0; i < st.foes.length; i++) if (st.foes[i].dead < 0) foeHome(st.foes[i]); }, get foes() { return st.foes; }, get drops() { return st.drops; }, get swooshes() { return st.swooshes; }, get smoke() { return st.smoke; }, get beam() { return st.beam; }, get pulses() { return st.pulses; }, shake, unshake, get quake() { return st.quake; }, get flights() { return st.flights; } };
  };
  BL.keepFoes = { LIGHTNING, create: foeWorld, OGRE, SKEL, GREEN_SKEL, TROLL };

  // The lanterns under the keep's balconies, three times a lantern's size on their chains, each hung from a pivot
  // under the deck's edge and swinging slowly about it (`swing`); `light(x, y, z, glass)` lights each where it hangs.
  const BIG_LANTERN = 3;
  const lanterns = {
    hang(parent, list, light, hidden) {
      const hang = KM.hangLantern();
      L.HUNG.forEach(([x, y, z], i) => {
        const pivot = createNode({ position: { x, y, z }, scale: { x: BIG_LANTERN, y: BIG_LANTERN, z: BIG_LANTERN } }), node = createNode({ position: { x: 0, y: -HANG, z: 0 }, geometry: hang.frame, sightHidden: hidden });
        const glass = createNode({ geometry: hang.glass, sightHidden: true });
        glass.glow = 1;
        addChild(node, glass, createNode({ geometry: KM.hangChain(), position: { x: 0, y: HANG / 2, z: 0 }, sightHidden: hidden }));
        addChild(pivot, node); addChild(parent, pivot);
        pivot.phase = i * 1.37;
        list.push(pivot);
        light(x, y - BIG_LANTERN * (HANG - hang.light.y), z, glass);
      });
    },
    swing(list, t) { for (let i = 0; i < list.length; i++) { const n = list[i]; n.rotation.z = Math.sin(t * 0.8 + n.phase) * 0.14; n.rotation.x = Math.sin(t * 0.55 + n.phase * 1.7) * 0.09; } }
  };
  BL.keepLanterns = lanterns;
  // Every knight's cape (keep-models.js `knightCape`): hung from the back of its shoulders as a banner's cloth is, a
  // chain of strips each from the one over it (`hang(body)`, the knight's own node at whatever scale), and blown out
  // behind it in the wind, a ripple running down to its tattered foot (`stir(list, t)`).
  const capes = {
    hang(body, list) {
      const C = KM.KNIGHT_CAPE, parts = KM.knightCape();
      let parent = createNode({ position: { x: 0, y: C.at.y, z: C.at.z } });
      addChild(body, parent);
      const strips = [];
      for (let k = 0; k < parts.strips.length; k++) {
        const strip = createNode({ geometry: parts.strips[k], position: { x: 0, y: k ? -parts.strip : 0, z: 0 } });
        addChild(parent, strip); strips.push(strip); parent = strip;
      }
      list.push({ strips, phase: list.length * 1.91 });
    },
    stir(list, t) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i], u = t + c.phase, gust = 0.65 + 0.35 * Math.sin(u * 0.41) * Math.sin(u * 0.27 + 0.9);
        for (let k = 0; k < c.strips.length; k++) {
          const n = c.strips[k];
          n.rotation.x = (k ? 0.07 : 0.16) * gust + 0.06 * gust * Math.sin(u * 2.1 - k * 0.7);
          n.rotation.z = 0.02 * Math.sin(u * 1.3 - k * 0.55 + 0.6);
        }
      }
    }
  };
  BL.keepCapes = capes;
  // A flag on the tip of every spire (keep-models.js `spireFlag`): each of the curtain's towers, the gatehouse's two
  // turrets, the keep's great spire and its four bartizans, all flying the same way in the wind, a ripple running out
  // along each to its fly (`stir`). `plant(around, keep, shift, list)`: the towers' and turrets' flags under `around`,
  // the keep's under `keep` `shift` along z (the halls stand the yard's castle so from their rooftop).
  // Each pole is sunk `FLAG_TIP` into its spire's point, measured off the castle's own meshes.
  const FLAG_WIND = 0.6, FLAG_TIP = 0.7;
  const SPIRES = (() => {
    const C = L.CASTLE, G = L.GATE, K = L.KEEP, UK = 0.1875, U = 0.125, out = [];
    // A curtain tower's spire stands on its cannon gallery's ceiling (keep-models.js `tower`), the gallery and the ceiling
    // in the tower's own voxels.
    const GAL = (Math.round(L.GALLERY.height / UK) + Math.round(L.GALLERY.ceil / UK)) * UK;
    for (const [x, z, t] of C.towers) out.push({ x, z, y: Math.round(C.towerWalk[t] / UK) * UK + GAL + 62 * UK - 0.35, k: 1.2, keep: false });
    // Outpost Island's towers, on their docks, and its keep.
    for (const t of L.OUTPOST.towers) out.push({ x: t.x, z: t.z, y: t.ground + Math.round(C.towerWalk[t.tall] / UK) * UK + GAL + 62 * UK - 0.35, k: 1.2, keep: false });
    out.push({ x: L.OUTPOST.x, z: L.OUTPOST.z, y: K.roof + K.arcade + K.spire - 0.9, k: 2.2, keep: true });
    for (const a of K.bartizans) out.push({ x: L.OUTPOST.x + Math.cos(a) * K.bartizan, z: L.OUTPOST.z + Math.sin(a) * K.bartizan, y: K.bartizanTop - 0.45, k: 0.9, keep: true });
    for (const sx of [-1, 1]) out.push({ x: sx * G.turretX, z: G.turretZ, y: G.turretHeight + 84 * U, k: 1, keep: false });
    out.push({ x: K.x, z: K.z, y: K.roof + K.arcade + K.spire - 0.9, k: 2.2, keep: true });
    for (const a of K.bartizans) out.push({ x: K.x + Math.cos(a) * K.bartizan, z: K.z + Math.sin(a) * K.bartizan, y: K.bartizanTop - 0.45, k: 0.9, keep: true });
    return out;
  })();
  const flags = {
    // One flag `F` (keep-models.js `flagOf`) flown under `under`, its pole's foot at (x, y, z) there, `k` times its
    // size and turned `turn`, into `list` for `stir`.
    fly(under, F, x, y, z, k, turn, list, phase) {
      const node = createNode({ geometry: F.pole, position: { x, y, z }, rotation: { x: 0, y: turn, z: 0 }, scale: { x: k, y: k, z: k } });
      let parent = createNode({ position: { x: 0.05, y: KM.SPIRE_FLAG.top, z: 0 } });
      addChild(node, parent);
      const cols = [];
      for (let i = 0; i < F.cols.length; i++) {
        const col = createNode({ geometry: F.cols[i], position: { x: i ? F.col : 0, y: 0, z: 0 } });
        addChild(parent, col); cols.push(col); parent = col;
      }
      addChild(under, node);
      list.push({ cols, phase });
    },
    plant(around, keep, shift, list) {
      const F = KM.spireFlag();
      SPIRES.forEach((p, i) => flags.fly(p.keep ? keep : around, F, p.x, p.y - FLAG_TIP, p.z + (p.keep ? shift : 0), p.k, FLAG_WIND, list, i * 0.83));
    },
    stir(list, t) {
      for (let i = 0; i < list.length; i++) {
        const f = list[i], u = t + f.phase, gust = 0.7 + 0.3 * Math.sin(u * 0.33) * Math.sin(u * 0.21 + 1.3);
        for (let k = 0; k < f.cols.length; k++) {
          const n = f.cols[k];
          n.rotation.y = 0.11 * gust * Math.sin(u * 2.4 - k * 0.75);
          n.rotation.x = 0.035 * gust * Math.sin(u * 1.6 - k * 0.6 + 0.4);
        }
      }
    }
  };
  BL.keepFlags = flags;
  // The floating candles marking the rowboat's channel, each bobbing on the swell and its flame flickering.
  const buildCandles = (s) => {
    const candle = KM.waterCandle(), flame = BL.blaze.smooth();
    s.candles = [];
    for (const [x, z] of L.CANDLES) {
      const node = createNode({ geometry: candle, position: { x, y: L.SEA, z }, sightHidden: true }), f = createNode({ geometry: flame, position: { x: 0, y: KM.CANDLE.wick, z: 0 }, scale: { x: 0.2, y: 0.2, z: 0.2 }, sightHidden: true });
      addChild(node, f);
      addChild(root, node);
      s.candles.push({ node, flame: f, phase: L.hash2(Math.round(x * 3), Math.round(z)) * 40 });
    }
  };
  const bobCandles = (s, elapsed) => {
    for (let i = 0; i < s.candles.length; i++) {
      const c = s.candles[i], t = elapsed + c.phase, k = 0.2 * (1 + 0.6 * BL.blaze.flare(elapsed, c.phase));
      c.node.position.y = L.SEA + 0.04 + Math.sin(t * 0.9) * 0.05;
      c.node.rotation.x = Math.sin(t * 0.7) * 0.08; c.node.rotation.z = Math.sin(t * 0.83 + 1) * 0.08;
      c.flame.scale.x = c.flame.scale.z = k; c.flame.scale.y = k * (1.1 + Math.sin(t * 9) * 0.1); c.flame.glow = 1;
    }
  };
  // A soft wind through the banners: a slow lean out from the pole's side and a ripple running down each cloth.
  const stirBanners = (s, elapsed) => {
    for (let i = 0; i < s.banners.length; i++) {
      const b = s.banners[i], t = elapsed + b.phase, gust = 0.6 + 0.4 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1.1);
      for (let k = 0; k < b.strips.length; k++) {
        const n = b.strips[k];
        n.rotation.x = (k ? 0.035 : 0.06) * gust + 0.045 * gust * Math.sin(t * 1.7 - k * 0.62);
        n.rotation.z = 0.012 * Math.sin(t * 1.1 - k * 0.5 + 0.8);
      }
    }
  };
  // Its fires' lights, where they burn on a ship at `scale` (each frame's update carries them with it).
  const shipLights = (s, scale, lights) => lights.map(([lx, ly, lz, reach]) => {
    const l = lamp(s.lamps, 0, 0, 0, Math.max(8, reach * scale), HEARTH);
    l.lx = lx * scale; l.ly = ly * scale; l.lz = lz * scale;
    return l;
  });

  // ---------- the cannons ----------
  // A cannon on each turret's deck (keep-layout.js `TURRETS`, keep-models.js `cannon`), manned from the gunner's stool
  // behind it as the boat is sat in (a seat that holds its sitter, `lockMovement`): it aims where the gunner's view
  // looks, as a gun does in combat (the mouse, a stick or a drag), up to a quarter turn either side of straight out to
  // sea and through its lift, its turret's merlons out of sight meanwhile, and a click or Space (the seat's `act`)
  // fires a ball of fire along it, one every `wait` seconds; X or the Leave cannon button steps back off it. A ball flies
  // under gravity, trailing fire, and plunges where it meets the sea or bursts on whatever else it meets: a ship, a
  // dock, the castle's stone, a turret or the ground. A pool of `balls`, each page its own, nothing harmed.
  const GUN = { turn: 2.6, lift: 1.6, ease: 9, over: 0.25, elev: [-0.22, 0.79], speed: 46, gravity: 12, wait: 1.2, reach: 2.7, balls: 20, kick: 0.4, life: 10, trail: 0.03, ahead: 1.3 };
  // The aim: the shot's path ahead of it as a line of small glowing dots `step` seconds of flight apart, and a ring
  // where it would come down.
  const AIM = { dots: 90, step: 0.07, size: 0.24, face: 0.6 };
  const FIRE_TINT = [1.7, 0.8, 0.25];
  const FIRE_BITS = ["#ff8a1e", "#ffb347", "#ff5a1a", "#ffe08a"].map((c) => BL.models.particleGeometry(c, 0.16, 1));
  const WATER_BITS = ["#d8ecff", "#8fc0e6", "#ffffff"].map((c) => BL.models.particleGeometry(c, 0.14, 0.25));
  const placeGunner = (c) => {
    const st = c.seat, yaw = c.t.yaw + c.yaw, sn = Math.sin(yaw), cs = Math.cos(yaw), Z = KM.CANNON.stool.z;
    st.x = c.px + sn * Z; st.z = c.pz + cs * Z; st.y = c.t.top + KM.CANNON.stool.y; st.ry = yaw;
    if (st.sitter) { const p = st.sitter.root.position; p.x = st.x; p.z = st.z; p.y = st.y + st.sitter.traits.height * 0.08; st.sitter.root.rotation.y = st.ry; }
  };
  const buildCannons = (s) => {
    const G = KM.cannon(), C = KM.CANNON, ball = KM.fireball();
    // On each turret on the front shore, then in each curtain tower's gallery, looking out of its opening.
    s.cannons = [...L.TURRETS, ...L.GALLERIES].map((t, i) => {
      const ahead = t.ahead ?? GUN.ahead, px = t.x + Math.sin(t.yaw) * ahead, pz = t.z + Math.cos(t.yaw) * ahead;
      if (t.gallery) { lamp(s.lamps, t.x, t.floor + 2.9, t.z, 10, FLAME); const w = 0.6 - t.inner; lamp(s.lamps, t.x + Math.sin(t.yaw) * w, t.floor + 1.2, t.z + Math.cos(t.yaw) * w, 8, FLAME); }
      const pivot = createNode({ position: { x: px, y: t.top, z: pz }, rotation: { x: 0, y: t.yaw, z: 0 } }), carriage = createNode({ geometry: G.carriage }), barrel = createNode({ geometry: G.barrel, position: { x: 0, y: C.y, z: 0.25 } });
      addChild(pivot, carriage, barrel); addChild(root, pivot);
      input.add(carriage, { kind: "keep-cannon", index: i }, { radius: 1.8 });
      targets.push(carriage);
      const c = { t, px, pz, pivot, barrel, yaw: 0, elev: 0.3, wait: 0, kick: 0, seat: null };
      c.seat = { kind: "cannon", x: 0, y: 0, z: 0, floor: t.top, ry: 0, ground: false, sitter: null, walkAt: { x: px - Math.sin(t.yaw) * 2.3, z: pz - Math.cos(t.yaw) * 2.3 }, lockMovement: false, keepEquipment: true, allowWeapons: true, act: () => { fireCannon(s, c); return true; } };
      placeGunner(c);
      return c;
    });
    s.balls = [];
    for (let i = 0; i < GUN.balls; i++) {
      const node = createNode({ geometry: ball, visible: false, sightHidden: true }), light = lamp(s.lamps, 0, -100, 0, 18, FIRE_TINT);
      light.want = light.level = 0;
      addChild(root, node);
      s.balls.push({ node, light, on: false, flash: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, trail: 0, from: null, hostile: false });
    }
    // The impacts' own pools, so a burst never takes the slam's: each an orb, rings, a ring of smoke and a fire.
    const smoke = impactSmoke(), blaze = BL.blaze.smooth();
    s.impacts = [];
    for (let i = 0; i < IMPACT.n; i++) {
      const orb = createNode({ geometry: KM.whiteOrb(), visible: false, sightHidden: true });
      const rings = [];
      for (let k = 0; k < IMPACT.rings + 1; k++) rings.push(createNode({ geometry: k < IMPACT.rings ? KM.whiteRing() : KM.whiteDisc(), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } }));
      const puffs = [];
      for (let k = 0; k < IMPACT.smoke; k++) puffs.push({ n: createNode({ geometry: smoke, visible: false, sightHidden: true }), ux: 0, uz: 0, out: 0, size: 1, spin: 0, y: 0 });
      const flames = [];
      for (let k = 0; k < IMPACT.flames; k++) flames.push({ n: createNode({ geometry: blaze, visible: false, sightHidden: true }), dx: 0, dz: 0, size: 1, phase: k * 1.9 });
      addChild(root, orb, ...rings, ...puffs.map((q) => q.n), ...flames.map((q) => q.n));
      const light = lamp(s.lamps, 0, -100, 0, 14, FIRE_TINT);
      light.want = light.level = 0;
      s.impacts.push({ t: -1, x: 0, y: 0, z: 0, size: 1, ship: null, sx: 0, sz: 0, orb, rings, puffs, flames, light });
    }
    s.manned = null;
    s.aimDots = [];
    const dot = KM.aimDot();
    for (let i = 0; i < AIM.dots; i++) { const n = createNode({ geometry: dot, visible: false, sightHidden: true }); addChild(root, n); s.aimDots.push(n); }
    s.aimRing = createNode({ geometry: KM.glowRing(), visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } });
    // And the ring for a shot that would strike the face of something: green, standing up against it.
    s.aimFace = createNode({ geometry: KM.greenRing(), visible: false, sightHidden: true });
    addChild(root, s.aimFace);
    addChild(root, s.aimRing);
  };
  // The cannon a body at (x, z) with its feet at `feet` stands beside on its turret's deck, free to be manned.
  const nearCannon = (x, z, feet) => {
    if (!scene || !scene.cannons) return null;
    for (let i = 0; i < scene.cannons.length; i++) { const c = scene.cannons[i]; if (!c.seat.sitter && Math.abs(feet - c.t.top) < 0.5 && Math.hypot(x - c.px, z - c.pz) < GUN.reach) return c; }
    return null;
  };
  const cannonLeave = () => document.getElementById("keep-cannon-leave");
  const manCannon = (c) => {
    if (!people || !people.sitPlayer(c.seat)) return false;
    c.seat.lockMovement = true;
    scene.manned = c;
    // The view along the barrel, and the mouse turning it as it aims a gun: into combat's look if the gunner came
    // carrying (given back on leaving).
    c.carried = !c.seat.sitter.weapon.aiming;
    if (c.carried) pilot.modeAction("mode-toggle");
    pilot.orbit.yaw = pilot.orbit.tYaw = c.t.yaw + c.yaw + Math.PI;
    pilot.orbit.pitch = pilot.orbit.tPitch = 0.05;
    pilot.focusAim(true);
    cannonLeave().hidden = false;
    hud.hint(COARSE ? "Look to aim the cannon. FIRE to shoot. Leave cannon to step off." : "Mouse: aim the cannon · Click or Space: fire · X: leave", 6000);
    return true;
  };
  const leaveCannon = () => {
    const c = scene && scene.manned;
    if (!c) return false;
    c.seat.lockMovement = false;
    const cave = c.seat.sitter;
    if (cave && people) people.standPlayer(cave);
    if (c.carried && cave && cave.weapon.aiming) pilot.modeAction("mode-toggle");
    if (cave && people) people.poseWeapon(cave);
    c.carried = false;
    scene.manned = null;
    cannonLeave().hidden = true;
    return true;
  };
  // Whoever mans a cannon has their weapon out of sight meanwhile, after the pilot has posed it for the frame
  // (`leaveCannon` puts it back).
  const hideGunnerWeapon = (s) => {
    const helm = s.sail && s.sail.sail.seat.sitter, cave = (s.manned && s.manned.seat.sitter) || helm;
    if (!cave) return;
    const P = cave.parts;
    P.club.visible = P.gun.visible = false;
    if (P.chuk) P.chuk.visible = false;
    // At a ship's helm, both hands out on the wheel, working it as the rudder goes over.
    if (helm) for (const [arm, side] of [[P.armL, 1], [P.armR, -1]]) if (arm) { arm.rotation.x = -1.2 + side * s.sail.sail.w / s.sail.sail.C.turn * 0.35; arm.rotation.z = side * 0.14; }
  };
  const fireCannon = (s, c) => {
    if (c.wait > 0 || leaving) return;
    const b = s.balls.find((q) => !q.on && q.flash <= 0);
    if (!b) return;
    b.on = true; b.t = 0; b.trail = 0; b.from = c.t; b.hostile = false;
    muzzle(c, b);
    b.node.visible = true;
    c.wait = GUN.wait; c.kick = GUN.kick;
    audio.cannon(b.x, b.y, b.z);
    // The muzzle's flash and smoke.
    for (let i = 0; i < 8; i++) fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
    for (let i = 0; i < 5; i++) { const p = fx.spawnParticle(KM.smash().dust[i % 3], b.x, b.y, b.z, b.vx * 0.05 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), b.vz * 0.05 + (Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 0.6, 1.2); if (p) p.smoke = true; }
  };
  // Where the cannon `c` sends its shot from and how fast, into `o` (x, y, z and vx, vy, vz).
  const muzzle = (c, o, speed = GUN.speed) => {
    const C = KM.CANNON, yaw = c.t.yaw + c.yaw, sn = Math.sin(yaw), cs = Math.cos(yaw), ce = Math.cos(c.elev), se = Math.sin(c.elev), out = 0.25 - c.kick * c.kick * 1.6 + ce * C.muzzle;
    o.x = c.px + sn * out; o.y = c.t.top + C.y + se * C.muzzle; o.z = c.pz + cs * out;
    o.vx = sn * ce * speed; o.vy = se * speed; o.vz = cs * ce * speed;
  };
  // The towers that fire on boats (CBDC's wall turrets; Cold Storj's are friendly for now): each turns its cannon after a rowboat someone
  // paddles within `range` of it (never nearer than `near`), no faster than `turn`, and fires every `wait` seconds or
  // so, the towers out of step with each other, at where the boat will be when the ball comes down, give or take
  // `spread` m at 100 m; its balls fly at `speed` on the cannons' own flight. A ball that comes down on the boat
  // (within `hit` of its hull) holes it: the `HULL` takes `hits` of them, riding `low` lower and burning (`fires`,
  // in the boat's frame) for each, and the last sinks it over `sink` s, tipping `tip` and going `deep` under, its
  // paddler carried back to the last dry ground they stood on.
  // A tower stands `hp` of an Ooga's cannon balls (any ball a visitor fires); the last brings it down to a stump
  // `stump` of its height, its cannon gone and its fire out, and it stands again `respawn` s later.
  // An Ooga's cannon ball bursting among the enemy: who it reaches, what it takes off them and how hard it throws them up.
  const SHELL = { r: 5, damage: 6, up: 11 };
  const TOWER = { range: 118, near: 9, speed: 40, wait: [4.2, 7], spread: 3.4, turn: 1.3, arc: 2, hit: 0.5, hp: 3, respawn: 180, stump: 0.16 };
  const HULL = { hits: 3, low: 0.11, sink: 2.6, deep: 2.4, tip: 0.9, flame: 1.5, fires: [[0.25, 0.42, 1.25], [-0.28, 0.42, -1.05]] };
  // Whether an enemy with its feet at `feet` may step to (bx, bz) on the volcano's cone, where a block is a metre.
  const CONE_STEP = 1.25, CONE_DROP = 3;
  const coneClimb = (bx, bz, feet, r) => {
    const top = L.landTop(bx, bz);
    return (top >= BOUNDS.high || feet >= BOUNDS.high) && L.inBounds(bx, bz) && top <= feet + CONE_STEP && top >= feet - CONE_DROP && L.mouthArch(bx, bz) === Infinity && !L.turretAt(bx, bz, r);
  };
  // CBDC's volcano (keep-layout.js `VOLCANO`). It erupts at random, `every` seconds or so apart (`first` on a visit):
  // the ground growls for `warn` s, then for `time` s fire fountains from the crater (`blobs` of light thrown up `up`
  // m/s and `out` m/s outward, falling back down the cone's flanks to `fall` m under its top), ash rolls up off it
  // (`puffs`, each swelling to `swell` m as it climbs), the crater's light flares and the ground shakes for whoever is
  // within `feel` of the cone. It throws nothing down on the island. Standing in lava costs a hit point every `lava` s.
  const ERUPT = { every: [60, 170], first: [20, 75], warn: 2.6, time: 12, feel: 110, quake: 0.3, blobs: 44, up: [15, 27], out: [3, 12], fall: 26, puffs: 18, swell: 43, lava: 0.8, glow: 50 };
  const LAVA_TINT = [1.9, 0.62, 0.16], LAVA_K = { S: { blow: 1, name: "The lava" } }, BOMB_AT = { x: 0, y: 0, z: 0 };
  const between = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const faceView = (n) => { const dx = camera.position.x - n.position.x, dy = camera.position.y - n.position.y, dz = camera.position.z - n.position.z; n.rotation.y = Math.atan2(dx, dz); n.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)); };
  const buildVolcano = (s) => {
    const V = L.VOLCANO, C = V.cone, top = L.landTop(C.x, C.z) + 8, glow = KM.fireGlow(), sprite = (geometry) => { const n = createNode({ geometry, visible: false, sightHidden: true }); addChild(root, n); return n; };
    const E = s.erupt = { next: between(ERUPT.first), t: -1, roared: false, level: 0, quake: 0, blob: 0, puff: 0, lava: 0, top, x: C.x, z: C.z, blobs: [], puffs: [] };
    // The crater's own light and the cave mouth's.
    E.lamp = lamp(s.lamps, C.x, top, C.z, 55, LAVA_TINT);
    lamp(s.lamps, V.mouth.x1 - 3, V.court.y + 3, V.z, 15, LAVA_TINT);
    // The glow that hangs over the crater always, flaring in an eruption.
    E.glow = sprite(glow); E.glow.visible = true; E.glow.position.x = C.x; E.glow.position.y = top + 2; E.glow.position.z = C.z;
    for (let i = 0; i < ERUPT.blobs; i++) E.blobs.push({ n: sprite(glow), t: -1, life: 1, size: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    for (let i = 0; i < ERUPT.puffs; i++) E.puffs.push({ n: sprite(KM.ashPuff()), t: -1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 });
  };
  const volcanoFace = (s) => {
    const E = s.erupt;
    faceView(E.glow);
    for (let i = 0; i < E.blobs.length; i++) if (E.blobs[i].n.visible) faceView(E.blobs[i].n);
    for (let i = 0; i < E.puffs.length; i++) if (E.puffs[i].n.visible) { const n = E.puffs[i].n, roll = n.rotation.z; faceView(n); n.rotation.z = roll; }
  };
  const volcanoUpdate = (s, dt, elapsed) => {
    const E = s.erupt, cave = people && people.player, who = cave ? cave.root.position : pilot.orbit.target, far = Math.hypot(who.x - E.x, who.z - E.z);
    if (E.t < 0) { if ((E.next -= dt) <= 0) { E.t = 0; E.roared = false; audio.rumble(E.x, E.top, E.z); } }
    else {
      E.t += dt;
      if (!E.roared && E.t >= ERUPT.warn) { E.roared = true; audio.erupt(E.x, E.top, E.z, ERUPT.time); }
      if (E.t > ERUPT.warn + ERUPT.time + 2) { E.t = -1; E.next = between(ERUPT.every); }
    }
    const live = E.t >= ERUPT.warn && E.t < ERUPT.warn + ERUPT.time;
    E.level += ((live ? 1 : 0) - E.level) * Math.min(1, dt * (live ? 3 : 0.8));
    // The ground shaking under whoever is near, growing through the warning.
    if (E.t >= 0 && far < ERUPT.feel && (E.quake -= dt) <= 0) { E.quake = 0.25; s.foes.rumble(ERUPT.quake * (1 - far / ERUPT.feel) * (live ? 1 : Math.min(1, E.t / ERUPT.warn) * 0.6 * (E.t < ERUPT.warn ? 1 : 0))); }
    const flick = 1 + Math.sin(elapsed * 9.3) * 0.08 + Math.sin(elapsed * 23) * 0.05;
    E.lamp.level = E.lamp.want = (0.55 + E.level * 1.6) * flick;
    const g = E.glow, size = ERUPT.glow * (0.45 + E.level * 0.75) * flick;
    g.scale.x = g.scale.y = size; g.smokeOpacity = 0.35 + E.level * 0.6; faceView(g);
    if (live) {
      // The fountain: blobs of fire thrown up out of the crater.
      if ((E.blob -= dt) <= 0) {
        E.blob = 0.045;
        const b = E.blobs.find((q) => q.t < 0);
        if (b) { const a = Math.random() * Math.PI * 2, out = between(ERUPT.out); b.t = 0; b.life = 3.5 + Math.random() * 2.5; b.size = 5 + Math.random() * 7; b.x = E.x + Math.cos(a) * 3; b.y = E.top - 6; b.z = E.z + Math.sin(a) * 3; b.vx = Math.cos(a) * out; b.vz = Math.sin(a) * out; b.vy = between(ERUPT.up); }
      }
      // The ash rolling up off it.
      if ((E.puff -= dt) <= 0) {
        E.puff = 0.4;
        const q = E.puffs.find((c) => c.t < 0);
        if (q) { const a = Math.random() * Math.PI * 2; q.t = 0; q.life = 9 + Math.random() * 5; q.x = E.x + Math.cos(a) * 5; q.y = E.top + 4; q.z = E.z + Math.sin(a) * 5; q.vx = 2.4 + Math.cos(a) * 3; q.vz = Math.sin(a) * 3 - 1.2; q.vy = 8 + Math.random() * 5; q.spin = (Math.random() - 0.5) * 0.8; }
      }
    }
    for (let i = 0; i < E.blobs.length; i++) {
      const b = E.blobs[i];
      if (b.t < 0) continue;
      b.t += dt; b.vy -= 13 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const k = b.t / b.life, n = b.n;
      if (k >= 1 || b.y < E.top - ERUPT.fall) { b.t = -1; n.visible = false; continue; }
      n.visible = true; n.position.x = b.x; n.position.y = b.y; n.position.z = b.z; n.scale.x = n.scale.y = b.size * (1 - k * 0.5); n.smokeOpacity = Math.min(1, k * 8) * (1 - k * k); faceView(n);
    }
    for (let i = 0; i < E.puffs.length; i++) {
      const q = E.puffs[i];
      if (q.t < 0) continue;
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy *= 1 - 0.12 * dt;
      const k = q.t / q.life, n = q.n;
      if (k >= 1) { q.t = -1; n.visible = false; continue; }
      n.visible = true; n.position.x = q.x; n.position.y = q.y; n.position.z = q.z; n.scale.x = n.scale.y = 12 + (ERUPT.swell - 12) * Math.sqrt(k); n.smokeOpacity = Math.min(1, k * 6) * (1 - k) * 0.85; faceView(n); n.rotation.z = q.spin * q.t;
    }
    // Standing in lava.
    if (cave && !leaving && !cave.camp.seat && L.lavaAt(cave.root.position.x, cave.root.position.z, cave.root.position.y - cave.baseY)) {
      if ((E.lava -= dt) <= 0) {
        E.lava = ERUPT.lava;
        const p = cave.root.position;
        for (let k = 0; k < 8; k++) fx.spawnParticle(FIRE_BITS[k % FIRE_BITS.length], p.x + (Math.random() - 0.5) * 0.6, p.y - cave.baseY + 0.2, p.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.3, 6, 6, -100);
        s.foes.strike(LAVA_K, cave);
      }
    } else E.lava = 0.12;
  };
  // The hull's pips beside the health (`#keep-boat`), shown while the visitor sits in a boat, written on a change.
  let hullEl = null, hullShown = -2;
  const hullShow = (s) => {
    // A rowboat's three, or a ship's own number, for whoever sits in the one or at the helm of the other.
    // Or, while Cannon Basics' raiders come, the tower's.
    const cave = people && people.player, f = s.ferry, ship = s.sail || s.repair.w, tower = !!s.cannon;
    const of = tower ? TOWER_QUEST.hp : ship ? ship.at.hull : HULL.hits, n = tower ? s.cannon.hp : ship ? ship.sail.hp : cave && f.seat.sitter === cave ? HULL.hits - f.hits : -1, key = n < 0 ? -1 : (tower ? 1e4 : 0) + of * 100 + n;
    if (key === hullShown) return;
    hullShown = key;
    if (!hullEl) hullEl = document.getElementById("keep-boat");
    hullEl.hidden = n < 0;
    if (n < 0) return;
    hullEl.setAttribute("aria-label", tower ? "Tower" : "Boat hull");
    hullEl.querySelector("svg").hidden = tower;
    hullEl.setAttribute("aria-valuemax", of); hullEl.setAttribute("aria-valuenow", n);
    let pips = hullEl.querySelectorAll("i");
    for (let i = pips.length; i < of; i++) hullEl.appendChild(document.createElement("i"));
    pips = hullEl.querySelectorAll("i");
    for (let i = 0; i < pips.length; i++) { pips[i].hidden = i >= of; pips[i].dataset.on = i < n; }
  };
  const hullHide = () => { if (hullEl) hullEl.hidden = true; hullShown = -2; };
  const buildTowers = (s) => {
    const G = KM.cannon(), C = KM.CANNON;
    // CBDC's wall turrets and Cold Storj's fjord towers, each with its own drum and height (`t.rise`); a roofed
    // turret's cannon comes out of its drum under the eaves (`low` under its top).
    const drums = [...s.cbdcDrums, ...s.storjDrums];
    s.reds = [...L.VOLCANO.wall.turrets, ...L.STORJ.turrets].map((t, i) => {
      const ahead = t.roofed ? t.r + 0.2 : GUN.ahead, low = t.roofed ? 2.2 : 0, px = t.x + Math.sin(t.yaw) * ahead, pz = t.z + Math.cos(t.yaw) * ahead;
      const pivot = createNode({ position: { x: px, y: t.top - low, z: pz }, rotation: { x: 0, y: t.yaw, z: 0 } }), carriage = createNode({ geometry: G.carriage }), barrel = createNode({ geometry: G.barrel, position: { x: 0, y: C.y, z: 0.25 } });
      addChild(pivot, carriage, barrel); addChild(root, pivot);
      // The layout's tower as it stands (a visit before may have left it a stump).
      t.top = t.y + t.rise;
      return { t, px, pz, low, pivot, barrel, light: lamp(s.lamps, t.x, t.top - 1.3, t.z, 12, t.storj ? ICE : FIRE_TINT), drum: drums[i], yaw: 0, elev: 0.3, wait: 2 + i * 1.3, kick: 0, hp: TOWER.hp, dead: -1 };
    });
  };
  // A visitor's cannon ball on the red tower `t`: a hit off it, and with none left it comes down (the layout's tower
  // with it, so nothing meets a wall that is not there) in a great burst, to stand again later.
  const towerHit = (s, t, b) => {
    const c = s.reds.find((q) => q.t === t);
    if (!c || c.dead >= 0 || --c.hp > 0) return;
    c.dead = 0; c.pivot.visible = false; c.light.want = c.light.level = 0;
    c.drum.scale.y = TOWER.stump; t.top = t.y + t.rise * TOWER.stump;
    BOMB_AT.x = t.x; BOMB_AT.y = t.y + 3; BOMB_AT.z = t.z;
    ballBlast(BOMB_AT, 1.6);
    for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7, p = fx.spawnParticle(KM.smash().rocks[i % KM.smash().rocks.length], t.x, t.y + 1 + Math.random() * 7, t.z, Math.cos(a) * sp, 2 + Math.random() * 6, Math.sin(a) * sp, 1.4 + Math.random() * 0.8, 9, 14, t.y - 0.5); if (p && i % 3 === 0) p.smoke = true; }
    hud.toast(t.storj ? "A tower of Cold Storj is down!" : "A turret of CBDC is down!");
  };
  const towerRaise = (c) => { c.dead = -1; c.hp = TOWER.hp; c.pivot.visible = true; c.light.want = c.light.level = 1; c.drum.scale.y = 1; c.t.top = c.t.y + c.t.rise; };
  // The barrel's lift that lands a ball `flat` m off and `rise` m up at the towers' speed, on the low arc; NaN out of reach.
  const towerLift = (flat, rise) => {
    const v2 = TOWER.speed * TOWER.speed, g = GUN.gravity, root2 = v2 * v2 - g * (g * flat * flat + 2 * rise * v2);
    return root2 < 0 ? NaN : Math.atan2(v2 - Math.sqrt(root2), g * flat);
  };
  // Whom the towers and the raiders fire on (`TOWER_AT`, `on` while there is anyone): a ship of the fleet someone
  // sails, else a rowboat someone paddles.
  const prey = (s) => {
    const f = TOWER_AT, ship = s.sail && s.sail.sail.sink < 0 ? s.sail : null;
    if (ship) { f.x = ship.at.x; f.z = ship.at.z; f.yaw = ship.at.yaw; f.v = ship.sail.v; f.y = L.SEA + ship.at.helm.y * 0.5; }
    else { f.x = s.ferry.x; f.z = s.ferry.z; f.yaw = s.ferry.yaw; f.v = s.ferry.v; f.y = s.ferry.y; }
    f.on = (!!ship || s.ferry.state === "paddling") && !leaving;
    return f;
  };
  const towersUpdate = (s, dt) => {
    // Behind a smoke screen they cannot see to fire.
    const f = prey(s), C = KM.CANNON, rowing = f.on && s.screen.t <= 0;
    for (let i = 0; i < s.reds.length; i++) {
      const c = s.reds[i], t = c.t;
      // Down: it does nothing, and stands again in its time.
      if (c.dead >= 0) { if ((c.dead += dt) > TOWER.respawn) towerRaise(c); continue; }
      // Cold Storj's towers are friendly for now: they keep their guns trained out over the channel and fire on no one.
      if (t.storj) continue;
      c.wait = Math.max(0, c.wait - dt); c.kick = Math.max(0, c.kick - dt * 1.2);
      const d = Math.hypot(f.x - c.px, f.z - c.pz);
      if (rowing && d < TOWER.range && d > TOWER.near) {
        // Where the boat will be when the ball lands: its flight time taken from where it is now.
        const gy = t.top - c.low, lift0 = towerLift(d, f.y - gy - C.y), time = Number.isNaN(lift0) ? 0 : d / (TOWER.speed * Math.cos(lift0));
        const tx = f.x + Math.sin(f.yaw) * f.v * time, tz = f.z + Math.cos(f.yaw) * f.v * time, flat = Math.hypot(tx - c.px, tz - c.pz), lift = towerLift(flat, f.y + 0.4 - gy - C.y);
        let want = Math.atan2(tx - c.px, tz - c.pz) - t.yaw;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        const inArc = Math.abs(want) < TOWER.arc && !Number.isNaN(lift);
        if (inArc) {
          c.yaw += clamp(want - c.yaw, -TOWER.turn * dt, TOWER.turn * dt); c.elev += clamp(lift - c.elev, -TOWER.turn * dt, TOWER.turn * dt);
          if (c.wait <= 0 && Math.abs(want - c.yaw) < 0.04 && Math.abs(lift - c.elev) < 0.03) {
            const b = s.balls.find((q) => !q.on && q.flash <= 0);
            if (b) {
              // Give or take a little: the aim thrown off by up to `spread` at 100 m.
              const off = TOWER.spread * flat / 100, keepYaw = c.yaw, keepElev = c.elev, a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * off;
              c.yaw += Math.sin(a) * m / flat; c.elev = towerLift(Math.max(4, flat + Math.cos(a) * m), f.y + 0.4 - gy - C.y) || c.elev;
              b.on = true; b.t = 0; b.trail = 0; b.from = t; b.hostile = true;
              muzzle(c, b, TOWER.speed);
              c.yaw = keepYaw; c.elev = keepElev;
              b.node.visible = true;
              c.wait = TOWER.wait[0] + Math.random() * (TOWER.wait[1] - TOWER.wait[0]); c.kick = GUN.kick;
              audio.cannon(b.x, b.y, b.z);
              for (let k = 0; k < 8; k++) fx.spawnParticle(FIRE_BITS[k % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
            }
          }
        }
      }
      c.pivot.rotation.y = t.yaw + c.yaw; c.barrel.rotation.x = -c.elev; c.barrel.position.z = 0.25 - c.kick * c.kick * 1.6;
    }
  };
  // Outpost Island's towers' cannons (keep-layout.js `OUTPOST.towers`, their galleries `defend`), friendly: unmanned, each takes the nearest raider within
  // the towers' range for its mark, leads it by its way through the water as the towers lead a boat, and fires the
  // Oogas' own ball on it (never hostile, so it harms nobody of ours), holding fire while that raider is within
  // `clear` of a boat or ship of ours.
  const DEFEND = { clear: 15 };
  const defendUpdate = (s, c, dt) => {
    const t = c.t, C = KM.CANNON, f = prey(s);
    let mark = null, best = TOWER.range;
    for (let i = 0; i < s.raiders.length; i++) {
      const r = s.raiders[i], d = Math.hypot(r.at.x - c.px, r.at.z - c.pz);
      if (r.raid.sink < 0 && r.at.quest !== "cannon" && d < best && d > TOWER.near) { best = d; mark = r; }
    }
    if (!mark || (f.on && Math.hypot(f.x - mark.at.x, f.z - mark.at.z) < DEFEND.clear)) return;
    const g = mark.at, v = mark.raid.v, gy = t.top + C.y, aimY = L.SEA + 1.2, lift0 = towerLift(best, aimY - gy), time = Number.isNaN(lift0) ? 0 : best / (TOWER.speed * Math.cos(lift0));
    const tx = g.x + Math.sin(g.yaw) * v * time, tz = g.z + Math.cos(g.yaw) * v * time, flat = Math.hypot(tx - c.px, tz - c.pz), lift = towerLift(flat, aimY - gy);
    let want = Math.atan2(tx - c.px, tz - c.pz) - t.yaw;
    want = Math.atan2(Math.sin(want), Math.cos(want));
    if (Math.abs(want) > L.TURRET.arc || Number.isNaN(lift)) return;
    c.yaw += clamp(want - c.yaw, -TOWER.turn * dt, TOWER.turn * dt); c.elev += clamp(lift - c.elev, -TOWER.turn * dt, TOWER.turn * dt);
    if (c.wait > 0 || Math.abs(want - c.yaw) > 0.04 || Math.abs(lift - c.elev) > 0.03 || leaving) return;
    const b = s.balls.find((q) => !q.on && q.flash <= 0);
    if (!b) return;
    // Give or take a little, as the towers' aim is.
    const off = TOWER.spread * flat / 100, keepYaw = c.yaw, keepElev = c.elev, a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * off;
    c.yaw += Math.sin(a) * m / flat; c.elev = towerLift(Math.max(4, flat + Math.cos(a) * m), aimY - gy) || c.elev;
    b.on = true; b.t = 0; b.trail = 0; b.from = t; b.hostile = false;
    muzzle(c, b, TOWER.speed);
    c.yaw = keepYaw; c.elev = keepElev;
    b.node.visible = true;
    c.wait = TOWER.wait[0] + Math.random() * (TOWER.wait[1] - TOWER.wait[0]); c.kick = GUN.kick;
    audio.cannon(b.x, b.y, b.z);
    for (let k = 0; k < 8; k++) fx.spawnParticle(FIRE_BITS[k % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
  };
  // Whether a tower's ball at (x, y, z) has come down on the rowboat `f`: over its hull and no higher than its gunwale.
  const onBoat = (f, x, y, z) => {
    if (f.state !== "paddling" || y > f.y + 1.1) return false;
    const dx = x - f.x, dz = z - f.z, sn = Math.sin(f.yaw), cs = Math.cos(f.yaw), along = dx * sn + dz * cs, across = dx * cs - dz * sn;
    return Math.abs(along) < 2.4 + TOWER.hit && Math.abs(across) < 0.9 + TOWER.hit;
  };
  // A tower's ball home on the boat: it bursts there and holes it, and the last hit the hull can take sinks it, its
  // paddler into the water and back on the last dry ground they stood on.
  const holeBoat = (s, f, b) => {
    f.hits++;
    audio.blast(b.x, b.y, b.z, 0.6); audio.hull(b.x, b.y, b.z);
    for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6; fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y + 0.3, b.z, Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp, 0.5 + Math.random() * 0.5, 9, 9, -100); }
    for (let i = 0; i < 8; i++) { const p = fx.spawnParticle(KM.smash().dust[i % 3], b.x, b.y + 0.3, b.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 1 + Math.random() * 0.6, 1.4); if (p) p.smoke = true; }
    if (f.hits < HULL.hits) { hud.toast(f.hits === HULL.hits - 1 ? "The boat is holed and burning. One more hit will sink it." : "The boat is hit!"); return; }
    const cave = f.seat.sitter;
    f.state = "sinking"; f.sink = 0; f.v = f.w = 0; f.swing = null; f.seat.lockMovement = false;
    audio.plunge(f.x, L.SEA, f.z);
    // The rowboat goes up too, in a burst of its own size.
    BOMB_AT.x = f.x; BOMB_AT.y = L.SEA + 0.4; BOMB_AT.z = f.z;
    ballBlast(BOMB_AT, 1.3);
    if (cave) {
      f.seat.walkAt.x = f.x; f.seat.walkAt.z = f.z; f.seat.floor = L.SEA - 1;
      people.standPlayer(cave);
      if (s.safe) { Object.assign(cave.root.position, { x: s.safe.x, y: cave.baseY + s.safe.y, z: s.safe.z }); cave.hop = 0; cave.hopV = 0; }
      hud.toast("The boat is sunk! The water carries you back to shore.");
    }
  };
  // What a shot at (x, y, z), `t` seconds out of the turret `from`, meets: 0 nothing yet, 1 something it bursts on (a
  // ship, a dock, the castle's stone, a turret, the ground), 2 water, its surface then in `MEET.level`.
  const MEET = { level: 0 };
  const meets = (x, y, z, t, from, down, gate) => {
    const ship = L.shipTop(x, z, 0.3), turret = L.turretAt(x, z, 0.3), deck = L.deckAt(x, z);
    if ((ship !== null && y <= ship + 2.5 && !(from && from.ship && t < 0.5)) || (turret && (turret !== from || t > 0.25) && y <= turret.top + 1.2) || (deck !== null && y <= deck) || (L.inWard(x, z, 0.3) && y <= L.wardTop(x, z, 0.3) && !L.galleryAir(x, y, z) && !(from && from.gallery && Math.hypot(x - from.x, z - from.z) < from.r + 0.8)) || L.westHit(x, y, z)) return 1;
    const water = L.waterAt(x, z, down, gate);
    if (water !== null) { if (y <= water) { MEET.level = water; return 2; } return 0; }
    if (L.inBounds(x, z) && y <= L.landTop(x, z)) return 1;
    if (y <= L.SEA) { MEET.level = L.SEA; return 2; }
    return 0;
  };
  // The manned cannon's aim: its shot's path flown ahead (the same flight as a ball's) as a line of dots, smaller the
  // further out, and the ring where it comes down; hidden while nobody mans one.
  const AIM_SHOT = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const aimUpdate = (s, elapsed, down, gate) => {
    const c = s.manned || s.aimGun;
    let shown = 0;
    if (c && !leaving) {
      const o = AIM_SHOT, dt = AIM.step;
      if (c.gun) gunShot(c.ship, c.gun, o); else muzzle(c, o);
      let hit = 0;
      for (let i = 0; i < s.aimDots.length && !hit; i++) {
        // A few small steps a dot, so the path stops where the shot would.
        for (let k = 0; k < 3 && !hit; k++) {
          o.vy -= GUN.gravity * dt / 3; o.x += o.vx * dt / 3; o.y += o.vy * dt / 3; o.z += o.vz * dt / 3;
          hit = meets(o.x, o.y, o.z, (i * 3 + k) * dt / 3, c.t, down, gate);
        }
        if (hit) break;
        const n = s.aimDots[i], k = i / s.aimDots.length, pulse = 0.85 + 0.15 * Math.sin(elapsed * 6 - i * 0.5);
        n.visible = true; n.position.x = o.x; n.position.y = o.y; n.position.z = o.z;
        n.scale.x = n.scale.y = n.scale.z = AIM.size * (1 - 0.55 * k) * pulse / 0.1;
        shown = i + 1;
      }
      // Where it comes down: a ring lying on the water or the ground; or, where it would strike the face of something
      // (a hull's side, a tower, a wall: its top stands `AIM.face` or more over the shot there), a green ring standing
      // up against that face, turned back the way the shot came.
      const r = s.aimRing, f = s.aimFace, face = hit === 1 && groundFor(o.x, o.z, 400) - o.y > AIM.face, size = 5 + Math.sin(elapsed * 4) * 0.4;
      r.visible = !!hit && !face; f.visible = face;
      if (face) {
        const v = Math.hypot(o.vx, o.vz) || 1;
        f.position.x = o.x - o.vx / v * 0.35; f.position.y = o.y; f.position.z = o.z - o.vz / v * 0.35; f.rotation.y = Math.atan2(-o.vx, -o.vz);
        f.scale.x = f.scale.y = size; f.smokeOpacity = 0.9;
      } else if (hit) { r.position.x = o.x; r.position.y = (hit === 2 ? MEET.level : o.y) + 0.08; r.position.z = o.z; r.scale.x = r.scale.y = size; r.smokeOpacity = 0.6; }
    } else { s.aimRing.visible = false; s.aimFace.visible = false; }
    for (let i = shown; i < s.aimDots.length; i++) s.aimDots[i].visible = false;
  };
  // Where a ball bursts: the melee slam's own look, bigger (a white orb exploding outward, white rings rolling over the
  // ground and a ring of pale smoke pushed out), and a fire left burning there for `burn` seconds (dying down over its last `die`), riding a ship it
  // struck. A pool of `n`, the oldest reused.
  const IMPACT = { n: 8, rings: 3, every: 0.05, ringLife: 0.7, ringSize: 16, smoke: 18, smokeLife: 0.8, out: 6.5, rise: 0.6, start: 0.9, swell: 2, orb: 2.4, orbWide: 9, orbLife: 0.32, flare: 1.8, flames: 7, burn: 10, die: 1.2, spread: 1.6, flame: 1.7 };
  let impactPuff = null;
  const impactSmoke = () => {
    if (impactPuff) return impactPuff;
    const g = { verts: [], faces: [], lines: [], castShadow: false };
    BL.hubModels.puff(g, 0, 0, 0, 0.56, 0.48, 0.56, ["#9d9891", "#b8b3ab", "#d2cdc5", "#e8e4de"].map(BL.math.hexToRgb), BL.math.mulberry32(11));
    for (let i = 0; i < g.faces.length; i++) g.faces[i].emissive = Math.max(g.faces[i].emissive || 0, 0.18);
    return (impactPuff = g);
  };
  // The ship a burst at (x, z) struck, if any.
  // The ship whose own hull (grown by `pad`) is under (x, z), or null: each tested in her own frame, so a burst on one
  // of two lying side by side is never put down to the other.
  const shipAt = (s, x, z, pad = 0.6) => {
    for (let i = 0; i < s.ships.length; i++) {
      const g = s.ships[i].at, dx = x - g.x, dz = z - g.z;
      if (dx * dx + dz * dz > (g.bow + pad) * (g.bow + pad)) continue;
      const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = dx * sn + dz * cs, c = dx * cs - dz * sn;
      if (Math.abs(a) <= g.bow + pad && Math.abs(c) <= L.shipHalf(g, clamp(a, -g.bow * 0.98, g.bow * 0.98)) + pad) return s.ships[i];
    }
    return null;
  };
  const impactAt = (s, x, y, z, size = 1, quiet = false) => {
    let m = s.impacts[0];
    for (let i = 1; i < s.impacts.length; i++) if (s.impacts[i].t < 0 || m.t >= 0 && s.impacts[i].t > m.t) m = s.impacts[i];
    m.t = 0; m.x = x; m.y = y; m.z = z; m.size = size; m.quiet = quiet;
    m.ship = shipAt(s, x, z);
    if (m.ship) { const g = m.ship.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), dx = x - g.x, dz = z - g.z; m.sx = dx * cs - dz * sn; m.sz = dx * sn + dz * cs; }
    for (let i = 0; i < m.puffs.length; i++) {
      const q = m.puffs[i], a = (i + (Math.random() - 0.5) * 0.6) / m.puffs.length * Math.PI * 2;
      q.ux = Math.cos(a); q.uz = Math.sin(a); q.out = IMPACT.out * size * (0.85 + Math.random() * 0.3); q.size = IMPACT.start * size * (0.8 + Math.random() * 0.4);
      q.spin = (Math.random() - 0.5) * 2.4; q.y = 0.25 + Math.random() * 0.2; q.n.rotation.x = Math.random() * 6; q.n.rotation.y = Math.random() * 6;
    }
    for (let i = 0; i < m.flames.length; i++) {
      const f = m.flames[i], a = Math.random() * Math.PI * 2, r = i ? IMPACT.spread * size * (0.4 + Math.random() * 0.6) : 0;
      f.dx = Math.cos(a) * r; f.dz = Math.sin(a) * r; f.size = IMPACT.flame * size * (i ? 0.6 + Math.random() * 0.5 : 1.3);
    }
  };
  const impactsUpdate = (s, dt, elapsed) => {
    for (let i = 0; i < s.impacts.length; i++) {
      const m = s.impacts[i];
      if (m.t < 0) continue;
      m.t += dt;
      // Riding the ship it struck.
      if (m.ship) { const g = m.ship.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw); m.x = g.x + m.sx * cs + m.sz * sn; m.z = g.z - m.sx * sn + m.sz * cs; }
      // The orb, turned to the view, exploding outward and fading fast.
      const ko = m.t / IMPACT.orbLife, o = m.orb;
      o.visible = ko < 1;
      if (o.visible) {
        const out = 1 - (1 - ko) * (1 - ko) * (1 - ko), oy = m.y + 0.8, dx = camera.position.x - m.x, dy = camera.position.y - oy, dz = camera.position.z - m.z;
        o.position.x = m.x; o.position.y = oy; o.position.z = m.z;
        o.rotation.y = Math.atan2(dx, dz); o.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz));
        o.scale.x = o.scale.y = IMPACT.orb * m.size * (1 + (IMPACT.orbWide - 1) * out); o.scale.z = 1;
        o.smokeOpacity = IMPACT.flare * (1 - ko) * (1 - ko);
      }
      // The rings rolling out over the ground, the last a soft disc.
      for (let k = 0; k < m.rings.length; k++) {
        const r = m.rings[k], rt = m.t - k * IMPACT.every, kk = rt / IMPACT.ringLife, disc = k === m.rings.length - 1;
        r.visible = rt > 0 && kk < 1;
        if (!r.visible) continue;
        r.position.x = m.x; r.position.y = m.y + 0.06 + k * 0.01; r.position.z = m.z;
        r.scale.x = r.scale.y = m.size * (disc ? 3 + 4 * kk : 1.5 + IMPACT.ringSize * (1 - (1 - kk) * (1 - kk)));
        r.smokeOpacity = disc ? 0.4 * (1 - kk) * (1 - kk) : 0.5 * Math.min(1, kk * 20) * (1 - kk) * (1 - kk);
      }
      // The smoke pushed out, rising and swelling, then shrinking away.
      const ks = Math.min(1, m.t / IMPACT.smokeLife), go = 1 - (1 - ks) * (1 - ks) * (1 - ks), shrink = ks < 0.4 ? 1 : (1 - ks) / 0.6;
      for (let k = 0; k < m.puffs.length; k++) {
        const q = m.puffs[k], n = q.n, r = 0.6 * m.size + (q.out - 0.6 * m.size) * go;
        n.visible = ks < 1;
        if (!n.visible) continue;
        n.position.x = m.x + q.ux * r; n.position.y = m.y + q.y + IMPACT.rise * go; n.position.z = m.z + q.uz * r;
        n.rotation.y += q.spin * dt; n.rotation.x += q.spin * 0.6 * dt;
        n.scale.x = n.scale.y = n.scale.z = q.size * (1 + (IMPACT.swell - 1) * go) * shrink;
      }
      // The fire left burning, flickering, dying down at the end, with its light and crackle, and
      // sparks and smoke off it now and then.
      const life = m.t / IMPACT.burn, left = IMPACT.burn - m.t, fade = left > IMPACT.die ? Math.min(1, m.t * 6) : Math.max(0, left / IMPACT.die);
      for (let k = 0; k < m.flames.length; k++) {
        const f = m.flames[k], n = f.n;
        n.visible = life < 1;
        if (!n.visible) continue;
        const sz = f.size * fade * (1 + BL.blaze.flare(elapsed, f.phase));
        n.position.x = m.x + f.dx; n.position.y = m.y; n.position.z = m.z + f.dz;
        n.scale.x = n.scale.z = sz; n.scale.y = sz * (1.1 + Math.sin(elapsed * 7 + f.phase) * 0.1); n.glow = 1;
      }
      const l = m.light;
      l.x = m.x; l.y = m.y + 1; l.z = m.z; l.level = l.want = life < 1 ? (m.t < 0.3 ? 2.2 : 1.3) * fade * m.size : 0;
      if (life < 1) {
        if (!m.quiet) audio.burn(fade * m.size, m.x, m.y, m.z);
        if (Math.random() < dt * 10) fx.spawnParticle(FIRE_BITS[(Math.random() * FIRE_BITS.length) | 0], m.x + (Math.random() - 0.5) * 1.6, m.y + 0.6, m.z + (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.8, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.4, 5, -1, -100);
      } else m.t = -1;
    }
  };
  // A ball bursting on something: the blast heard, fire and sparks, rock thrown up and smoke rolling off it.
  const BURST = { x: 0, y: 0, z: 0 };
  // `size` scales all of it, its loudness too (the wand's fireball let go unheld bursts at half).
  const ballBlast = (b, size = 1, quiet = false) => {
    const G = KM.smash();
    if (!quiet) audio.blast(b.x, b.y, b.z, size);
    impactAt(scene, b.x, b.y, b.z, size, quiet);
    for (let i = 0, n = Math.round(28 * size); i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (3 + Math.random() * 10) * size; fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y + 0.3, b.z, Math.cos(a) * sp, (3 + Math.random() * 10) * size, Math.sin(a) * sp, 0.6 + Math.random() * 0.7, 9, 9, -100); }
    for (let i = 0, n = Math.round(16 * size); i < n; i++) { const a = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 6) * size; fx.spawnParticle(G.rocks[i % G.rocks.length], b.x, b.y + 0.2, b.z, Math.cos(a) * sp, (6 + Math.random() * 6) * size, Math.sin(a) * sp, 1.2 + Math.random() * 0.7, 9, 14, b.y - 0.1); }
  };
  // A ball into the water: the plunge heard, a column of water thrown up, a ring of spray and steam where its fire
  // is quenched.
  const ballPlunge = (b, level) => {
    b.y = level;
    audio.plunge(b.x, b.y, b.z);
    for (let i = 0; i < 16; i++) fx.spawnParticle(WATER_BITS[i % WATER_BITS.length], b.x + (Math.random() - 0.5) * 0.6, level + 0.1, b.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2.2, 6 + Math.random() * 7, (Math.random() - 0.5) * 2.2, 1.1 + Math.random() * 0.7, 5, 15, level);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, sp = 3 + Math.random() * 2.5; fx.spawnParticle(WATER_BITS[i % WATER_BITS.length], b.x, level + 0.1, b.z, Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp, 0.7 + Math.random() * 0.4, 5, 12, level); }
    for (let i = 0; i < 6; i++) { const p = fx.spawnParticle(KM.smash().dust[1], b.x + (Math.random() - 0.5), level + 0.3, b.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.8, 1 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 0.8, 1.2); if (p) p.smoke = true; }
  };
  const cannonsUpdate = (s, dt, elapsed) => {
    const cave = people && people.player;
    for (let i = 0; i < s.cannons.length; i++) {
      const c = s.cannons[i];
      c.wait = Math.max(0, c.wait - dt); c.kick = Math.max(0, c.kick - dt * 1.2);
      if (cave && c.seat.sitter === cave && !leaving) {
        // The barrel follows where the view looks (the mouse, a stick or a drag turns the view, as aiming a gun does),
        // eased, no faster than the gun swings, within its arc and its lift.
        const fx0 = camera.target.x - camera.position.x, fy0 = camera.target.y - camera.position.y, fz0 = camera.target.z - camera.position.z, flat = Math.hypot(fx0, fz0);
        if (flat > 1e-4) {
          let want = Math.atan2(fx0, fz0) - c.t.yaw;
          const arc = c.t.arc ?? L.TURRET.arc;
          want = clamp(Math.atan2(Math.sin(want), Math.cos(want)), -arc, arc);
          const lift = clamp(Math.atan2(fy0, flat) + GUN.over, GUN.elev[0], GUN.elev[1]), k = 1 - Math.exp(-GUN.ease * dt);
          c.yaw += clamp((want - c.yaw) * k, -GUN.turn * dt, GUN.turn * dt); c.elev += clamp((lift - c.elev) * k, -GUN.lift * dt, GUN.lift * dt);
        }
      } else if (s.manned === c) { s.manned = null; c.seat.lockMovement = false; cannonLeave().hidden = true; }
      if (c.t.defend && !c.seat.sitter && s.manned !== c) defendUpdate(s, c, dt);
      // In the gunner's own eyes only the aim's dots show: no cannon, no turret under it.
      const eyes = s.manned === c && pilot.view === "first-person";
      c.pivot.visible = !eyes;
      // A front turret's merlons hidden while it is manned, and the whole turret in the gunner's own eyes.
      if (s.crowns[i]) { s.crowns[i].visible = s.manned !== c; s.drums[i].visible = s.ladders[i].visible = !eyes; }
      else if (c.t.gallery) s.towers[c.t.i].visible = !eyes;
      c.pivot.rotation.y = c.t.yaw + c.yaw; c.barrel.rotation.x = -c.elev; c.barrel.position.z = 0.25 - c.kick * c.kick * 1.6;
      placeGunner(c);
    }
    const down = bridgeDown(), gate = gateUp();
    towersUpdate(s, dt);
    sailGuns(s, dt);
    shipActs(s, dt);
    aimUpdate(s, elapsed, down, gate);
    impactsUpdate(s, dt, elapsed);
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i], l = b.light;
      if (!b.on) {
        // The burst's flash dies away on the ball's own light.
        if (b.flash > 0) { b.flash = Math.max(0, b.flash - dt); l.level = l.want = b.flash / 0.35 * 1.6; }
        continue;
      }
      b.t += dt; b.vy -= GUN.gravity * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const n = b.node;
      n.position.x = b.x; n.position.y = b.y; n.position.z = b.z; n.rotation.x = b.t * 9; n.rotation.z = b.t * 6;
      n.scale.x = n.scale.y = n.scale.z = 1 + Math.sin(b.t * 31) * 0.12;
      l.x = b.x; l.y = b.y; l.z = b.z; l.level = l.want = 1;
      if ((b.trail -= dt) <= 0) {
        b.trail = GUN.trail;
        fx.spawnParticle(FIRE_BITS[(Math.random() * FIRE_BITS.length) | 0], b.x, b.y, b.z, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.3, 6, -0.5, -100);
      }
      // What it meets: stone, timber, a ship or the ground bursts it; water takes it.
      const holed = b.hostile && onBoat(s.ferry, b.x, b.y, b.z), met = holed ? 3 : meets(b.x, b.y, b.z, b.t, b.from, down, gate), hit = met === 1;
      let done = met !== 0;
      if (holed) holeBoat(s, s.ferry, b);
      else if (hit) {
        ballBlast(b);
        // A visitor's ball on a red tower.
        const struck = b.hostile ? null : L.turretAt(b.x, b.z, 0.6);
        if (struck && struck.red) towerHit(s, struck, b);
        // A raider's ball on the tower held in Cannon Basics.
        if (b.hostile && s.cannon) { const g = s.cannon.g; if (Math.hypot(b.x - g.x, b.z - g.z) < g.r + 1.5 && b.y > g.ground - 1 && b.y < g.floor + L.GALLERY.height + 4) cannonHit(s, b); }
        // A tower's or a raider's ball on a ship of the fleet; a visitor's on a raider, and among the enemy, who are
        // hurt and flung into the air by it.
        const on = shipAt(s, b.x, b.z);
        if (on) heelShip(on, b.x, b.z);
        if (on && b.hostile && on.sail) hullHit(s, on, b);
        else if (on && !b.hostile && on.raid) raidHit(s, on, b);
        if (!b.hostile) s.foes.blast(b.x, b.y, b.z, SHELL.r, SHELL.damage, SHELL.up);
      }
      else if (met === 2) ballPlunge(b, MEET.level);
      if (!done && (b.t > GUN.life || !L.inBounds(b.x, b.z) && b.y <= L.SEA)) { if (b.y <= L.SEA + 0.5) ballPlunge(b, L.SEA); done = true; }
      if (done) { b.on = false; n.visible = false; b.flash = hit ? 0.35 : 0; if (!hit) l.level = l.want = 0; }
    }
  };

  // ---------- the boat ----------
  // Where the boat waits on a first visit: at the islet's dock, its bow toward the castle.
  const berth = () => ({ x: FERRY.islet.x, z: FERRY.islet.z, yaw: Math.atan2(FERRY.quay.x - FERRY.islet.x, FERRY.quay.z - FERRY.islet.z) });
  // And the castle's quay's, its bow toward the islet.
  const quayBerth = () => ({ x: FERRY.quay.x, z: FERRY.quay.z, yaw: Math.atan2(FERRY.islet.x - FERRY.quay.x, FERRY.islet.z - FERRY.quay.z) });
  // And Cold Storj's two, alongside each quay's face, bow along the channel to the east (`swingBoat`'s `zFace`).
  const storjBerth = (i) => () => { const C = i ? FERRY.storjS : FERRY.storjN; return { x: C.x, z: C.z, yaw: Math.PI / 2 }; };
  // And Shards', along its quay's seaward face north of the pier, bow to the north as CBDC's moors.
  const shardsBerth = () => ({ x: FERRY.shards.x, z: FERRY.shards.z, yaw: 0 });
  // And Outpost Island's, along its east pier's north side, bow out along the pier.
  const outpostBerth = () => ({ x: FERRY.outpost.x, z: FERRY.outpost.z, yaw: Math.PI / 2 });
  // And the Armory & Forge's, along its quay's seaward face, bow to the north.
  const armoryBerth = () => ({ x: FERRY.armory.x, z: FERRY.armory.z, yaw: 0 });
  // Each boat's own dock, in the order `s.ferries` keeps them: where it waits to begin with, and goes back to sunk.
  const shipyardBerth = () => ({ x: FERRY.shipyard.x, z: FERRY.shipyard.z, yaw: 0 });
  const volcanoBerth = () => ({ x: FERRY.volcano.x, z: FERRY.volcano.z, yaw: 0 });
  const BOAT_HOMES = [berth, quayBerth, storjBerth(0), storjBerth(1), shardsBerth, outpostBerth, armoryBerth, shipyardBerth, volcanoBerth];
  const keptBoats = () => scene.ferries.map((f) => ({ x: f.x, z: f.z, yaw: f.yaw }));
  // Both boats back where they wait to begin with, one moored at each dock (the visitor struck down).
  const resetBoats = (s) => {
    const at = BOAT_HOMES.map((home) => home());
    s.ferries.forEach((f, i) => {
      if (f.seat.sitter) people.standPlayer(f.seat.sitter);
      Object.assign(f, { x: at[i].x, z: at[i].z, yaw: at[i].yaw, state: "moored", v: 0, w: 0, stroke: 0, swing: null, hits: 0, sink: 0 });
      f.seat.lockMovement = false;
      placeSeat(f);
    });
    s.ferry = s.ferries[0];
    world.keepFerry = keptBoats();
    resetFleet(s);
  };
  // The seat on its middle bench, facing the bow, where the boat now lies; its paddler sat on it.
  const placeSeat = (f) => {
    const st = f.seat, sn = Math.sin(f.yaw), cs = Math.cos(f.yaw);
    st.x = f.x + sn * BOAT.rower.z; st.z = f.z + cs * BOAT.rower.z; st.y = f.y + BOAT.rower.y; st.ry = f.yaw;
    if (st.sitter) { const p = st.sitter.root.position; p.x = st.x; p.z = st.z; p.y = st.y + st.sitter.traits.height * 0.08; st.sitter.root.rotation.y = st.ry; }
  };
  // How many of the hull's points (keep-layout.js `FERRY.hull`) would stand out of deep water with the boat at (x, z)
  // turned `yaw`: a move may never add one, so the boat stops at a shore, a deck or a ship and backs away again.
  const aground = (x, z, yaw) => {
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    let n = 0;
    for (const [c, a] of FERRY.hull) { const px = x + c * cs + a * sn, pz = z - c * sn + a * cs; if (!L.navigable(px, pz)) n++; }
    return n;
  };
  // How many of the hull's points stand outside the candles' channel (keep-layout.js `LANE`) with the boat at (x, z)
  // turned `yaw`. On a first visit (`scene.lane`, from the first boarding until the visitor steps ashore by the castle
  // island's quay) a move may never add one, so the first crossing keeps between the candles.
  const outLane = (x, z, yaw) => {
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    let n = 0;
    for (const [c, a] of FERRY.hull) if (!L.inLane(x + c * cs + a * sn, z - c * sn + a * cs)) n++;
    return n;
  };
  // Where its paddler steps out: the nearest dry ground or deck beside the boat a body can stand on, or null.
  const landing = (f, cave) => {
    for (const d of LAND_REACH) for (let k = 0; k < 16; k++) {
      const a = f.yaw + Math.PI / 2 + (k % 2 ? -1 : 1) * Math.floor((k + 1) / 2) * Math.PI / 8, x = f.x + Math.sin(a) * d, z = f.z + Math.cos(a) * d;
      if (L.waterAt(x, z, bridgeDown(), gateUp()) !== null || L.inWard(x, z)) continue;
      const g = L.supportAt(x, z, L.SEA + STEP_UP, bridgeDown(), gateUp());
      if (g < L.SEA + 0.2 || g > L.SEA + STEP_UP || !walkableFor(x, z, x, z, g, cave.bodyHeight, cave)) continue;
      return { x, z, g };
    }
    return null;
  };
  // Space in the boat: beside a dock or a shore it stands its paddler up there, as any seat does (the crew stands them
  // at `walkAt`); out on the water it says where to go.
  // The ship of the Oogas' whose hull the rowboat `f` lies within `GRAB` of, nobody at her helm, or null.
  const GRAB = 9;
  const shipBeside = (f) => {
    for (let i = 0; i < scene.fleet.length; i++) {
      const w = scene.fleet[i], g = w.at, dx = f.x - g.x, dz = f.z - g.z, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = dx * sn + dz * cs, c = dx * cs - dz * sn, ca = clamp(a, -g.bow, g.bow);
      if (w.sail.sink < 0 && !w.sail.seat.sitter && Math.hypot(a - ca, Math.max(0, Math.abs(c) - L.shipHalf(g, ca))) < GRAB) return w;
    }
    return null;
  };
  const boatAct = (f) => {
    const cave = f && f.seat.sitter;
    if (!cave) return false;
    const spot = landing(f, cave);
    if (!spot) {
      // Alongside one of the Oogas' ships: aboard her, beside her wheel.
      const w = shipBeside(f);
      if (!w) { if (hud) hud.toast(LINES.away); return true; }
      const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = g.helm.a + KM.HELM.z * w.sail.hs, c = 1.1 * w.sail.hs;
      f.seat.walkAt.x = g.x + sn * a + cs * c; f.seat.walkAt.z = g.z + cs * a - sn * c; f.seat.floor = L.SEA + g.helm.y; f.seat.lockMovement = false;
      // An escort climbed aboard leaves its duty there and then, as one whose helm is taken does, so it is not sent
      // home from under its new crew when the rowing stops (`escortSnap`).
      if (w.at.role === "escort") w.sail.away = true;
      hud.toast("You climb aboard. Take her wheel to sail her.");
      return false;
    }
    f.seat.walkAt.x = spot.x; f.seat.walkAt.z = spot.z; f.seat.floor = spot.g; f.seat.lockMovement = false;
    return false;
  };
  const board = (f) => {
    if (!f) return false;
    scene.ferry = f;
    if (f.state !== "moored" || !people || !people.sitPlayer(f.seat)) return false;
    f.state = "paddling"; f.t = 0; f.v = 0; f.w = 0; f.stroke = 0; f.swing = null;
    f.seat.lockMovement = true;
    if (scene.first) { scene.first = false; scene.lane = true; markVisited(); if (!COARSE) showKeys(); }
    hud.hint(COARSE ? LINES.paddleTouch : LINES.paddle, 5000);
    return true;
  };
  // The free boat moored beside a body at (x, z) with its feet at `feet`, or null.
  const nearBoat = (x, z, feet) => {
    if (!scene || !scene.ferries || feet <= L.SEA - 0.5 || feet >= L.SEA + STEP_UP) return null;
    for (const f of scene.ferries) if (f.state === "moored" && !f.seat.sitter && Math.hypot(x - f.seat.x, z - f.seat.z) <= BOARD_REACH) return f;
    return null;
  };
  // A stroke of the oars at `k` (0 to 1 round its cycle) at `pull` (0 at rest): swept from the catch, blades in, to the
  // finish, then lifted clear and carried back.
  const row = (r, k, pull) => {
    const drive = k < 0.55, u = drive ? k / 0.55 : (k - 0.55) / 0.45, sweep = (drive ? 0.55 - 1.1 * u : -0.55 + 1.1 * u) * pull, lift = drive ? -0.16 * pull : 0.1 * pull + (1 - pull) * 0.18;
    r.oars[0].rotation.y = sweep; r.oars[0].rotation.z = lift;
    r.oars[1].rotation.y = -sweep; r.oars[1].rotation.z = -lift;
  };
  // The paddler's arms with the oars, once the crew has posed them sitting: reaching forward to the handles and
  // pushing them through each stroke.
  const paddleArms = (f) => {
    const cave = f.seat.sitter;
    if (!cave || f.state !== "paddling") return;
    const k = f.stroke, drive = k < 0.55, u = drive ? k / 0.55 : (k - 0.55) / 0.45, reach = drive ? u : 1 - u, pull = Math.min(1, (Math.abs(f.v) + Math.abs(f.w) * 3) / FERRY.speed + 0.25);
    for (const [arm, side] of [[cave.parts.armL, 1], [cave.parts.armR, -1]]) {
      if (!arm) continue;
      arm.rotation.x = -1.05 - 0.45 * reach * pull; arm.rotation.z = side * 0.18;
    }
  };
  // The boat where it is this frame, bobbing on the water, its lantern swaying under its hook.
  const poseBoat = (r, x, y, z, yaw, t) => {
    r.boat.position.x = x; r.boat.position.y = y + Math.sin(t * 1.3) * 0.04; r.boat.position.z = z;
    r.boat.rotation.y = yaw; r.boat.rotation.x = Math.sin(t * 1.1) * 0.014; r.boat.rotation.z = Math.sin(t * 0.83) * 0.02;
    r.lantern.rotation.x = Math.sin(t * 1.7) * 0.09; r.lantern.rotation.z = Math.sin(t * 1.3) * 0.07;
    if (r.lamp) {
      const sn = Math.sin(yaw), cs = Math.cos(yaw);
      r.lamp.x = x + sn * BOAT.hook.z; r.lamp.y = y + BOAT.hook.y - 0.45; r.lamp.z = z + cs * BOAT.hook.z;
    }
  };
  // Paddled along the channel between the docks: W and S pull it ahead and back, A and D turn it (on the spot too, as
  // oars do), the view turning with it, anywhere on the water inside the candles round the land's edge; its hull never
  // goes into shallows, a deck or a ship. Left, it lies where it is.
  // The boat mooring itself once it is left near a dock: it draws out clear of the deck, runs along to its berth
  // beside the dock while it turns to face the other island, and comes in alongside, where it can be boarded again
  // from the deck. Nobody is aboard, so it goes where it is put.
  const SWING = { near: 14, turn: 0.9, out: 1.7, pace: 1.6 };
  const swingBoat = (f, dt) => {
    const w = f.swing, step = SWING.pace * dt, toward = (v, t) => v + clamp(t - v, -step, step);
    let gap = w.yaw - f.yaw;
    gap = Math.atan2(Math.sin(gap), Math.cos(gap));
    // Out from the face (along x, or along z for a quay facing north or south, `zFace`), along it, and back in.
    const out = w.zFace ? "z" : "x", along = w.zFace ? "x" : "z";
    if (w.phase === 0) { f[out] = toward(f[out], w[out] + w.out); if (Math.abs(f[out] - w[out] - w.out) < 0.01) w.phase = 1; }
    else if (w.phase === 1) {
      f[along] = toward(f[along], w[along]); f.yaw += clamp(gap, -SWING.turn * dt, SWING.turn * dt);
      if (Math.abs(f[along] - w[along]) < 0.01 && Math.abs(gap) < 0.01) w.phase = 2;
    } else { f[out] = toward(f[out], w[out]); if (Math.abs(f[out] - w[out]) < 0.01) f.swing = null; }
    // Moored at a berth, it is mended.
    if (!f.swing) { f.hits = 0; world.keepFerry = keptBoats(); }
  };
  // The boat that counts this frame (`s.ferry`: the one the escorts keep pace with, the castle looses at and whose
  // water and music are heard): the one the visitor sits in, else the one nearest them.
  const pickFerry = (s) => {
    const cave = people && people.player;
    let best = s.ferry, d = Infinity;
    for (const f of s.ferries) {
      if (cave && f.seat.sitter === cave) { s.ferry = f; return; }
      const p = cave ? cave.root.position : pilot.orbit.target, e = Math.hypot(f.x - p.x, f.z - p.z);
      if (e < d) { d = e; best = f; }
    }
    s.ferry = best;
  };
  // A boat waiting at each dock whenever it can be: a dock left with none gets one moved over to it, a boat nobody
  // sits in from wherever it lies (one of two at the other dock first), and only while the visitor stands well away
  // from both the boat and that dock, so none is seen to go.
  const DOCK_NEAR = 16, UNSEEN = 45;
  const DOCKS = [[FERRY.islet, FERRY.quay, berth], [FERRY.quay, FERRY.islet, quayBerth]];
  const atDock = (f, d) => f.state === "moored" && Math.hypot(f.x - d.x, f.z - d.z) < DOCK_NEAR;
  const keepDocked = (s) => {
    const cave = people && people.player, p = cave ? cave.root.position : pilot.orbit.target, F = s.ferries;
    for (let k = 0; k < DOCKS.length; k++) {
      const [dock, other, put] = DOCKS[k];
      let here = 0, there = 0, rowing = false;
      for (let i = 0; i < F.length; i++) { if (atDock(F[i], dock)) here++; if (atDock(F[i], other)) there++; if (F[i].seat.sitter) rowing = true; }
      if (here || rowing || Math.hypot(p.x - dock.x, p.z - dock.z) < UNSEEN) continue;
      // The boat to move: one of two at the other dock, else one lying anywhere else; never the only one at a dock.
      let spare = null;
      for (let i = 0; i < F.length; i++) {
        const f = F[i];
        // Nor one left at the volcano island's dock, Shards', Outpost Island's, the Armory & Forge's or Cold Storj's, each its visitor's only way back.
        if (f.state !== "moored" || f.seat.sitter || Math.hypot(p.x - f.x, p.z - f.z) < UNSEEN || (atDock(f, other) && there < 2) || atDock(f, FERRY.volcano) || atDock(f, FERRY.shards) || atDock(f, FERRY.outpost) || atDock(f, FERRY.armory) || atDock(f, FERRY.shipyard) || atDock(f, FERRY.storjN) || atDock(f, FERRY.storjS)) continue;
        if (!spare || atDock(f, other)) spare = f;
      }
      if (!spare) continue;
      const b = put();
      spare.x = b.x; spare.z = b.z; spare.yaw = b.yaw; spare.swing = null; spare.v = spare.w = 0;
      placeSeat(spare);
      world.keepFerry = keptBoats();
    }
  };
  const ferryUpdate = (s, f, dt, elapsed) => {
    const cave = people && people.player, me = cave && f.seat.sitter === cave, active = f === s.ferry;
    f.t += dt;
    if (f.state === "paddling" && !me) {
      f.state = "moored"; f.v = f.w = 0; f.seat.lockMovement = false; world.keepFerry = keptBoats();
      // Stepped out by the castle island's quay, the first crossing is over and the boat goes where it likes.
      if (s.lane && Math.hypot(f.x - FERRY.quay.x, f.z - FERRY.quay.z) < 15) s.lane = false;
      // Left near a dock, it moors itself at its berth beside that dock, facing the other island.
      for (const [here, there] of [[FERRY.quay, FERRY.islet], [FERRY.islet, FERRY.quay]]) {
        if (Math.hypot(f.x - here.x, f.z - here.z) < SWING.near) f.swing = { yaw: there.z > here.z ? 0 : Math.PI, x: here.x, z: here.z, out: SWING.out, phase: 0 };
      }
      // And at the volcano island's dock or Shards', along its quay's seaward face: out to the west, and from the
      // pier's far side out past the pier's end first.
      for (const [V, P] of [[FERRY.volcano, L.VOLCANO.dock.pier], [FERRY.shards, L.SHARDS.dock.pier]]) {
        if (Math.hypot(f.x - V.x, f.z - V.z) < SWING.near + 4) f.swing = { yaw: 0, x: V.x, z: V.z, out: f.z < P.z1 + 1.3 ? P.x0 - 3.2 - V.x : -SWING.out, phase: 0 };
      }
      // And at Outpost Island's, along its east pier's north side: out to the north, along, and in.
      { const V = FERRY.outpost; if (Math.hypot(f.x - V.x, f.z - V.z) < SWING.near + 4) f.swing = { yaw: Math.PI / 2, x: V.x, z: V.z, zFace: true, out: SWING.out, phase: 0 }; }
      // And at the Armory & Forge's, along its quay's seaward face: out to the east, along, and in.
      { const V = FERRY.armory; if (Math.hypot(f.x - V.x, f.z - V.z) < SWING.near + 4) f.swing = { yaw: 0, x: V.x, z: V.z, out: SWING.out, phase: 0 }; }
      // And at the shipyard's, along its quay's seaward face: out to the west, along, and in.
      { const V = FERRY.shipyard; if (Math.hypot(f.x - V.x, f.z - V.z) < SWING.near + 4) f.swing = { yaw: 0, x: V.x, z: V.z, out: -SWING.out, phase: 0 }; }
      // And at either of Cold Storj's, along its quay's face to the channel east of its pier: out into the channel,
      // past the pier's end first from its far side.
      L.STORJ.docks.forEach((d, i) => {
        const C = i ? FERRY.storjS : FERRY.storjN, P = d.pier, past = d.face > 0 ? P.z1 + 3.2 - C.z : P.z0 - 3.2 - C.z;
        if (Math.hypot(f.x - C.x, f.z - C.z) < SWING.near + 4) f.swing = { yaw: Math.PI / 2, x: C.x, z: C.z, zFace: true, out: f.x < P.x1 + 1.3 ? past : d.face * SWING.out, phase: 0 };
      });
    }
    if (f.state === "moored" && f.swing) swingBoat(f, dt);
    // Sunk by the red towers: it goes under, and is back at its own dock whole.
    if (f.state === "sinking" && (f.sink += dt) > HULL.sink) {
      const home = BOAT_HOMES[s.ferries.indexOf(f)]();
      Object.assign(f, { x: home.x, z: home.z, yaw: home.yaw, state: "moored", v: 0, w: 0, stroke: 0, swing: null, hits: 0, sink: 0 });
      world.keepFerry = keptBoats();
    }
    if (f.state === "paddling") {
      const axes = pilot.controls.axes, throttle = leaving ? 0 : clamp(axes.y, -1, 1), steer = leaving ? 0 : clamp(axes.x, -1, 1);
      f.v += clamp(throttle * FERRY.speed - f.v, -FERRY.speed / FERRY.ease * dt, FERRY.speed / FERRY.ease * dt);
      const pace = Math.abs(f.v) / FERRY.speed, wantW = -steer * FERRY.turn * (0.45 + 0.55 * Math.min(1, pace));
      f.w += clamp(wantW - f.w, -FERRY.turn * 2.5 * dt, FERRY.turn * 2.5 * dt);
      const ny = f.yaw + f.w * dt, nx = f.x + Math.sin(ny) * f.v * dt;
      const nz = f.z + Math.cos(ny) * f.v * dt, was = aground(f.x, f.z, f.yaw), lane = s.lane && me, out = lane ? outLane(f.x, f.z, f.yaw) : 0;
      let turned = 0, kept = false;
      if (aground(nx, nz, ny) <= was && !(kept = lane && outLane(nx, nz, ny) > out)) { turned = ny - f.yaw; f.x = nx; f.z = nz; f.yaw = ny; }
      else if (aground(f.x, f.z, ny) <= was && !(lane && outLane(f.x, f.z, ny) > out)) { turned = ny - f.yaw; f.yaw = ny; f.v = 0; }
      else { f.v = 0; f.w = 0; }
      if (kept && elapsed - s.hinted > 4) { s.hinted = elapsed; hud.hint(LINES.lane, 3200); }
      if (turned) { pilot.orbit.yaw += turned; pilot.orbit.tYaw += turned; }
      const work = Math.max(pace, Math.abs(f.w) / FERRY.turn * 0.7), prev = f.stroke;
      if (work > 0.02) {
        f.stroke = (f.stroke + dt / STROKE * (0.4 + 0.6 * work) * (f.v < -0.05 ? -1 : 1)) % 1;
        if (f.stroke < 0) f.stroke += 1;
        if (prev < 0.02 && f.stroke >= 0.02) audio.wash(f.x, f.y, f.z);
      }
      row(f, f.stroke, work > 0.02 ? Math.max(0.3, work) : 0);
      if (active) audio.wake(pace, f.x, f.y, f.z);
    } else { row(f, 0, 0); if (active) audio.wake(0, f.x, f.y, f.z); }
    // The rowing music while the visitor sits in the boat, faded out as they get out or leave.
    if (active) audio.rowing((f.state === "paddling" || !!s.sail) && !leaving, s.lane);
    // Holed, it rides lower for each hit and burns; sinking, it tips and goes under.
    const under = f.sink / HULL.sink;
    poseBoat(f, f.x, f.y - f.hits * HULL.low - under * under * HULL.deep, f.z, f.yaw, elapsed);
    if (f.sink > 0) { f.boat.rotation.z += under * HULL.tip; f.boat.rotation.x += under * 0.3; }
    for (let i = 0; i < f.fires.length; i++) {
      const n = f.fires[i];
      n.visible = f.hits > i && under < 0.6;
      if (n.visible) n.scale.x = n.scale.y = n.scale.z = HULL.flame * (1 + Math.sin(elapsed * 23 + i * 2.1) * 0.14 + Math.sin(elapsed * 41 + i) * 0.08);
    }
    placeSeat(f);
  };
  // The stair's guards stand their watch, breathing, each turning a little to look about.
  const GUARD_LINES = {
    captain: ["A ship is only as good as the hand on her wheel.", "Red sails in the west. I don't like it.", "Mind the pier. She bites."],
    viking: ["Hah! Another one up the stair.", "The beard keeps the sea wind off.", "Mind the knights. They only like each other.", "Row back any time. I'll watch your boat."],
    barkeep: ["Come in out of the wind!", "The mead's cold and the hearth's warm.", "Mind the step. And the shipwright."],
    shipwright: ["Mind the wet tar.", "She'll swim when she's ready, not before.", "Oak, iron and patience."],
    smith: ["Mind the sparks.", "Hot iron doesn't wait.", "A blade is only as good as its quench."],
    alchemist: ["Don't touch the green one.", "Every star has its herb.", "Mind the fumes, dear."]
  };
  // What the shipyard's two say across the bar and the bench, in the same window: nothing to sell yet.
  const YARD_TALK = {
    barkeep: [
      { text: "Welcome to the Mead Hall! I'm Inga. Sit yourself down: a stool at the bar, a bench by the table, or the settle by the fire." },
      { text: "The longships' crews drink here when the fleet is in, and the galleon's gunners when they dare. Loud nights, those." },
      { text: "My casks are still settling from the crossing, so I've nothing to pour you yet. Come back when they're tapped, and the first horn is yours." }
    ],
    shipwright: [
      { text: "Hm? Oh, a visitor. I'm Bjorn. Every keel in this yard has had my mallet on it." },
      { text: "The small longship by the pier is yours to try: take her wheel and look out over a side to bring her guns to bear. The great longship and the galleon are the pride of the yard, and nobody sails them yet." },
      { text: "The one on the slip is not for sale, and neither is anything else just yet. When I've timber to spare, we'll talk about a boat of your own." }
    ],
    // The Armory & Forge's two, the same: nothing to sell yet.
    smith: [
      { text: "Stand clear of the anvil! Ah, a customer. I'm Thorvald. Every blade on these racks came off this anvil." },
      { text: "Steel wants a hot fire, a heavy hammer and a cold trough, and patience between them. Most folk only bring the hammer." },
      { text: "My racks are spoken for until the furnace has had a few more days of coal. Come back then, and we'll talk about a blade of your own." }
    ],
    alchemist: [
      { text: "Welcome, welcome. I'm Ylva. Mind the cauldron: it bites if you lean too close." },
      { text: "Herbs from the islet, crystals from under the keep, and a little starlight for the rest. Everything on these shelves does something." },
      { text: "None of it is ready to sell yet. The brew wants another moon. Come back when it's settled, and I'll find you something that glows." }
    ]
  };
  // What each says of themselves as the pointer passes over them.
  const GUARD_TIPS = {
    captain: "Leif, the fleet's captain · talk to him", viking: "Eryk, the viking of the sea stair · talk to him", barkeep: "Inga, who keeps the Mead Hall · talk to her", shipwright: "Bjorn, the shipwright · talk to him",
    smith: "Thorvald, the swordsmith · talk to him", alchemist: "Ylva, the alchemist · talk to her"
  };
  // Eryk's quest: talked to on foot from within his `talk`, in the window (`talk`), by where his quest stands.
  const nearGuard = (x, z, feet) => {
    if (!scene) return null;
    for (const g of scene.guards) if (Math.hypot(x - g.at.x, z - g.at.z) < g.at.talk && Math.abs(feet - (g.at.y || 0)) < 1.5) return g;
    return null;
  };
  const ERYK = {
    ask: [
      { text: "Hah! A new face up the stair. I'm Eryk. I've kept this stair since the old fleet went down." },
      { text: "I lost something dear on the small island where you came in: an orange crystal, glowing like an ember. It lies on the back of the small island, past the portal you came through." },
      { text: "Bring it back to me and I'll tell you how to arm yourself. Will you go?", choices: [{ label: "Accept", value: "accept", main: true }, { label: "Decline", value: "decline" }] }
    ],
    active: [{ text: "The crystal lies on the back of the small island, behind the portal. Row back over and bring it to me. Mind the skeletons." }],
    carrying: [
      { text: "My crystal! You found it. You have my thanks, friend." },
      { text: "Now, the castle. The two knights in the court only like each other: walk up to each one and turn it until they stand face to face, and the drawbridge will come down." },
      { text: "Inside, cross the courtyard and go out by the east gate, down to the Armory & Forge. Aras-Son, the merchant, keeps his stall on the dock there. Tell him Eryk sent you, and he'll give you a dagger." }
    ],
    reward: [{ text: "Aras-Son keeps his stall on the dock at the Armory & Forge, out through the courtyard's east gate. Turn the knights face to face if the drawbridge is still up. Tell him Eryk sent you." }],
    done: [{ text: "That dagger suits you. The skeletons on the small island pay in bananas, and Aras-Son sells better blades for them." }]
  };
  // Leif's first quest, Cannon Basics: talked to on the quay by where it stands, as Eryk is.
  const LEIF_CANNON = {
    ask: [
      { text: "You've the look of someone who wants a deck under their feet. I'm Leif. These ships are mine to give or to keep." },
      { text: "But nobody sails with me who can't work a gun. Take the rowboat moored along this quay, just south of the pier, and row out to Outpost Island, north of Cold Storj." },
      { text: "You won't go alone: two of my longships will sail as your escort, one on each side of you, and fire on any raider that comes for you on the way." },
      { text: "Climb one of its towers to the cannon at the top. Pressing Space Bar beside it mans it, the mouse aims it and a click fires. Raiders will come for that tower, one at a time." },
      { text: "Sink three of them before they bring the tower down, and come back and tell me. Will you go?", choices: [{ label: "Accept", value: "accept", main: true }, { label: "Decline", value: "decline" }] }
    ],
    tower: [{ text: "Outpost Island lies out to the north of Cold Storj. Row there, climb any of its eight towers to the cannon at the top, and the raiders will come." }],
    battle: [{ text: "What are you doing here? Your tower is under attack!" }],
    report: [
      { text: "Three raiders on the bottom! I heard the guns from here. You can work a cannon." },
      { text: "Come and talk to me again. I've a ship for you to try." }
    ],
    done: [{ text: "You can work a gun. Now let's see you sail." }]
  };
  // Leif's second, Red Sails, once Cannon Basics is done.
  const LEIF = {
    ask: [
      { text: "You held that tower. Now let's see what you do with a deck under you." },
      { text: "Start small. The little longship along the north side of this pier is yours to try: walk out to the wheel on her deck and take it. W and S sail her, A and D steer." },
      { text: "Her guns follow your mouse: point at the water off either side and click, and that side fires, one gun after another. Keys 1 to 4 are her full sail, a quick repair, a smoke screen and her ram." },
      { text: "There are three raiders out to sea in the west, under red sails. Sink all three, come back and tell me, and any small longship is yours to sail. Will you go?", choices: [{ label: "Accept", value: "accept", main: true }, { label: "Decline", value: "decline" }] }
    ],
    helm: [{ text: "The small longship lies along the north side of the pier behind me. Walk out to the wheel on her deck and take it: Space, or HELM." }],
    hunt: [
      { text: "West, out to sea. You'll see RED SAILS written in the sky over each of the three. W and S sail, A and D steer; point the mouse at the water beside one and click to fire that side." },
      { text: "If she holes you, 2 mends half your hull at once, or leave the wheel and mend at a glowing ring on deck. 1 is full sail, 3 a smoke screen, 4 the ram." }
    ],
    report: [
      { text: "All three sunk! I saw the smoke from here. You can handle a ship." },
      { text: "Any small longship is yours to sail now. The great ones, and the galleon, will have to wait." }
    ],
    done: [{ text: "Fair winds. Any small longship answers to you now. The great ones will have to wait." }]
  };
  // Whether the visitor may sail the great longships and the galleon: not yet, by anyone.
  const greatShips = () => false;
  // Whether Leif's raider is wanted on the water: from the quest's taking until she is sunk.
  const redWanted = () => { const at = quests.stage("sails"); return at === "helm" || at === "hunt"; };
  const talkLeif = (g) => {
    // Cannon Basics comes first: until it is done he talks of nothing else.
    const gun = quests.stage("cannon");
    if (gun !== "done") {
      if (gun === "report" && quests.advance("cannon", "done")) { banner("Quest complete", "Cannon Basics"); if (audio) audio.quest(); }
      pilot.setMenuOpen(true);
      return talk.show(g.at.name, LEIF_CANNON[gun === "report" ? "report" : gun || "ask"], (answer) => {
        if (answer === "accept" && quests.accept("cannon")) { questStarted("cannon"); hud.hint("Take a rowboat out to Outpost Island, north of Cold Storj, and climb a tower", 7000); }
        else if (answer === "decline") fx.sayAt(g.at.x, (g.at.y || 0) + 2.5, g.at.z, "The sea will wait. So will I.", 2.6);
      }, () => { if (pilot) pilot.setMenuOpen(false); });
    }
    const at = quests.stage("sails");
    // Told of the sinking, the quest is done.
    if (at === "report" && quests.advance("sails", "done")) { banner("Quest complete", "Red Sails"); if (audio) audio.quest(); }
    pilot.setMenuOpen(true);
    return talk.show(g.at.name, LEIF[at || "ask"], (answer) => {
      if (answer === "accept" && quests.accept("sails")) { questStarted("sails"); hud.hint("Walk out along the pier to the small longship's wheel and take it", 7000); }
      else if (answer === "decline") fx.sayAt(g.at.x, (g.at.y || 0) + 2.5, g.at.z, "The sea will wait. So will I.", 2.6);
    }, () => { if (pilot) pilot.setMenuOpen(false); });
  };
  // The mark over a quest giver's head: "!" while they have a quest to give, "?" while they wait to hear it is done,
  // nothing otherwise; bobbing, turned to the view (`questMarks`, after the view is final).
  const MARKS = { viking: { quest: () => "crystal", ready: "carrying", lift: 3.2 }, captain: { quest: () => quests.stage("cannon") === "done" ? "sails" : "cannon", ready: "report", lift: 3.2 } };
  const buildMarks = (s) => {
    for (const g of s.guards) {
      const M = MARKS[g.at.kind];
      if (!M) continue;
      g.marks = ["!", "?"].map((glyph) => { const n = createNode({ geometry: KM.questMark(glyph), visible: false, sightHidden: true, scale: { x: 1.25, y: 1.25, z: 1 } }); addChild(root, n); return n; });
    }
  };
  const questMarks = (s, elapsed) => {
    for (let i = 0; i < s.guards.length; i++) {
      const g = s.guards[i], M = MARKS[g.at.kind];
      if (!M) continue;
      const at = quests.stage(M.quest()), show = at === null ? 0 : at === M.ready ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const n = g.marks[k];
        n.visible = k === show;
        if (!n.visible) continue;
        n.position.x = g.at.x; n.position.y = (g.at.y || 0) + M.lift + Math.sin(elapsed * 2.4 + i) * 0.12; n.position.z = g.at.z;
        faceView(n);
      }
    }
  };
  // A quest just taken on: its name large across the view (`#keep-quest-banner`, which hides itself once its animation
  // is over) and its chime.
  // Large words across the middle of the view (`#keep-quest-banner`, which hides itself once its animation is over):
  // `kicker` small over `text`, or `text` alone; a land's name (`land`) in the island names' white with a black glow,
  // half again as large.
  const banner = (kicker, text, land = false) => {
    const el = document.getElementById("keep-quest-banner"), over = document.getElementById("keep-quest-banner-kicker");
    el.dataset.land = String(land);
    over.textContent = kicker; over.hidden = !kicker;
    document.getElementById("keep-quest-banner-name").textContent = text;
    el.removeAttribute("data-show"); el.hidden = false; void el.offsetWidth; el.dataset.show = "1";
    el.addEventListener("animationend", () => { el.hidden = true; el.removeAttribute("data-show"); }, { once: true });
  };
  // The first time a visitor gets into a boat: the keys that paddle it, each with the way it goes, for `KEYS_FOR`
  // seconds (`#keep-keys`, which hides itself once its animation is over).
  const KEYS_FOR = 5;
  const showKeys = () => {
    const el = document.getElementById("keep-keys");
    el.style.setProperty("--for", `${KEYS_FOR}s`);
    el.removeAttribute("data-show"); el.hidden = false; void el.offsetWidth; el.dataset.show = "1";
    el.addEventListener("animationend", () => { el.hidden = true; el.removeAttribute("data-show"); }, { once: true });
  };
  const questStarted = (id) => {
    banner("New quest", QUEST_BY_ID.get(id).title);
    if (audio) audio.quest();
  };
  // Aras-Son's stall on the Armory & Forge's quay, and his wares: what each is, the damage a blow of it does and its price in the land's own bananas
  // (scene-keep.js `BL.keepPurse`, which keeps them and what has been bought). A ware with a `quest` is not sold: it is
  // his to give once that quest reaches its `reward` step (Eryk's crystal, for the dagger), which claiming it completes.
  const shop = (() => {
    // What was gained while the menu was open, announced once it closes (scene-keep.js `BL.keepWeaponReveal`).
    let dialog = null, list = null, purse = null, close = null, onClose = null, gained = [];
    // A levelled weapon's Levels toggle and, while it is open, a line for each level owned (its pips, name, cost and
    // damage) with a button to use it at that level; rebuilt only when what it shows changes.
    const levelList = (row, w, owned, at, top) => {
      const toggle = row.querySelector("button[data-levels]"), ol = row.querySelector(".keep-shop-levels"), open = owned && row.dataset.open === "true";
      toggle.hidden = !owned;
      toggle.textContent = open ? "Levels ▾" : "Levels ▸";
      toggle.setAttribute("aria-expanded", String(open));
      ol.hidden = !open;
      const key = open ? `${top}:${at}` : "";
      if (ol.dataset.key === key) return;
      ol.dataset.key = key;
      ol.replaceChildren();
      if (!open) return;
      const A = BL.keepArms, i = row.dataset.ware;
      for (let n = 1; n <= top; n++) {
        const li = document.createElement("li"), head = document.createElement("span"), name = document.createElement("span"), cost = document.createElement("span"), damage = document.createElement("span"), use = document.createElement("button");
        li.dataset.current = String(n === at);
        head.className = "keep-shop-level-head"; name.className = "keep-shop-level-name"; name.textContent = A.levelName(w, n);
        const pips = document.createElement("span"); pips.className = "keep-level"; pips.dataset.level = String(n);
        for (let k = 0; k < LEVELS.max; k++) pips.append(document.createElement("i"));
        head.append(pips, name);
        cost.className = "keep-shop-level-cost"; cost.textContent = `Cost ${A.levelPrice(w, n)} bananas`;
        damage.className = "keep-shop-level-damage"; damage.textContent = `Damage ${A.damageText(A.levelDamage(w, n))}`;
        use.type = "button"; use.dataset.useLevel = `${i}:${n}`; use.disabled = n === at; use.textContent = n === at ? "In use" : "Use";
        li.append(head, cost, damage, use);
        ol.append(li);
      }
    };
    const draw = () => {
      const have = BL.keepPurse.bananas, A = BL.keepArms;
      purse.textContent = `You have ${BL.game.formatLarge(have)} banana${have === 1 ? "" : "s"}`;
      for (const row of list.children) {
        const w = WARES[+row.dataset.ware], owned = BL.keepPurse.owns(w.id), button = row.querySelector("button[data-buy]"), at = BL.keepPurse.level(w.id), top = BL.keepPurse.top(w.id);
        const price = row.querySelector(".keep-shop-price"), next = row.querySelector(".keep-shop-next"), down = row.querySelector("button[data-down]");
        // Its damage, and the name of the upgrade it has had, if any.
        row.querySelector(".keep-shop-damage").textContent = `Damage ${A.damageText(owned ? A.damageOf(w) : w.damage)}${owned && w.upgrades && at > 1 ? ` · ${w.upgrades[at - 2][0]}` : ""}`;
        levelPips(row.querySelector(".keep-shop-title"), w);
        next.textContent = "";
        if (down) down.hidden = !(TEST && !ALL_LEVELS && owned && w.levels && top > 1);
        if (w.levels) levelList(row, w, owned, at, top);
        if (w.quest) {
          const due = BL.keepQuests.stage(w.quest) === "reward";
          button.disabled = owned || !due;
          button.textContent = owned ? "Owned" : due ? "Claim" : "Help Eryk first";
          price.textContent = "Quest reward";
        } else if (!owned) {
          button.disabled = have < w.price;
          button.textContent = have < w.price ? `Need ${w.price - have} more` : "Buy";
          price.textContent = `${w.price} bananas`;
        } else if (top < LEVELS.max) {
          const cost = A.upgradePrice(w);
          button.disabled = have < cost;
          button.textContent = have < cost ? `Need ${cost - have} more` : "Upgrade";
          price.textContent = `${cost} bananas`;
          const [title, what] = w.upgrades[top - 1];
          next.textContent = `Next, level ${top + 1}: ${title}. ${what} Damage ${A.damageText(w.damage * LEVELS.power[top])}.`;
        } else {
          button.disabled = true; button.textContent = "Max level"; price.textContent = "";
        }
        row.dataset.owned = String(owned);
      }
    };
    const buy = (e) => {
      // A weapon's Levels opened or shut.
      const fold = e.target.closest("button[data-levels]");
      if (fold) { const row = fold.closest("li[data-ware]"); row.dataset.open = String(row.dataset.open !== "true"); draw(); fold.blur(); return; }
      // One of its levels put in use.
      const pick = e.target.closest("button[data-use-level]");
      if (pick) {
        const [i, n] = pick.dataset.useLevel.split(":").map(Number), w = WARES[i];
        if (BL.keepPurse.setLevel(w.id, n)) {
          BL.keepArms.rearm(); draw();
          hud.toast(`${w.name} set to level ${n}: ${BL.keepArms.levelName(w, n)}.`);
          if (audio) audio.click(false);
        }
        pick.blur();
        return;
      }
      // The test flag's Downgrade: the weapon back down a level, at once.
      const back = e.target.closest("button[data-down]");
      if (back) {
        const w = WARES[+back.dataset.down];
        if (BL.keepPurse.downgrade(w.id)) { BL.keepArms.rearm(); draw(); hud.toast(`${w.name} taken back to level ${BL.keepPurse.level(w.id)}.`); }
        back.blur();
        return;
      }
      const button = e.target.closest("button[data-buy]");
      if (!button) return;
      const w = WARES[+button.dataset.buy];
      // Owned and raisable: a level up, announced once the menu closes.
      if (w.levels && BL.keepPurse.owns(w.id)) {
        const cost = BL.keepArms.upgradePrice(w);
        if (!cost || !BL.keepPurse.upgrade(w.id, cost)) return;
        const level = BL.keepPurse.level(w.id);
        gained.push({ id: w.id, level });
        BL.keepArms.rearm();
        draw();
        hud.toast(`${w.name} raised to level ${level} for ${cost} bananas.`);
        if (audio) audio.click(false);
        button.blur();
        return;
      }
      if (w.quest) {
        if (BL.keepQuests.stage(w.quest) !== "reward" || !BL.keepPurse.buy(w.id, 0)) return;
        BL.keepQuests.advance(w.quest, "done");
        BL.keepArms.choose(w.id);
        gained.push(w.id);
        draw();
        hud.toast(`Aras-Son hands you a ${w.name.toLowerCase()}. It is in your hand.`);
        button.blur();
        return;
      }
      if (!BL.keepPurse.buy(w.id, w.price)) return;
      BL.keepArms.choose(w.id);
      gained.push(w.id);
      draw();
      hud.toast(`${w.name} bought for ${w.price} bananas. It is in your hand.`);
      button.blur();
    };
    const shut = () => { if (dialog && dialog.open) dialog.close(); };
    const closed = () => {
      if (onClose) onClose();
      if (gained.length) { BL.keepWeaponReveal.show(gained, audio); gained = []; }
    };
    const outside = (e) => { if (e.target === dialog) shut(); };
    return {
      open(after) {
        if (dialog && dialog.open) return;
        dialog = document.getElementById("keep-shop"); list = document.getElementById("keep-shop-list"); purse = document.getElementById("keep-shop-purse"); close = document.getElementById("keep-shop-close");
        if (!list.children.length) WARES.forEach((w, i) => {
          const row = document.createElement("li"), info = document.createElement("div"), title = document.createElement("div"), name = document.createElement("span"), damage = document.createElement("span"), next = document.createElement("span"), price = document.createElement("span"), button = document.createElement("button");
          row.dataset.ware = String(i); info.className = "keep-shop-info"; title.className = "keep-shop-title"; name.className = "keep-shop-name"; name.textContent = w.name;
          damage.className = "keep-shop-damage"; next.className = "keep-shop-next"; price.className = "keep-shop-price"; button.type = "button"; button.dataset.buy = String(i);
          title.append(name); info.append(title, damage, next);
          if (w.levels) {
            const down = document.createElement("button"); down.type = "button"; down.className = "keep-shop-down"; down.dataset.down = String(i); down.textContent = "Downgrade"; down.hidden = true; info.append(down);
            const fold = document.createElement("button"); fold.type = "button"; fold.className = "keep-shop-down keep-shop-fold"; fold.dataset.levels = String(i); fold.hidden = true; info.append(fold);
          }
          row.append(BL.keepArms.picture(w.id, 128), info, price, button);
          if (w.levels) { const ol = document.createElement("ol"); ol.className = "keep-shop-levels"; ol.hidden = true; row.append(ol); }
          list.append(row);
        });
        onClose = after;
        // On the test flag the purse is topped back up each time the menu opens.
        if (TEST && BL.keepPurse.bananas < TEST_BANANAS) BL.keepPurse.add(TEST_BANANAS - BL.keepPurse.bananas);
        list.addEventListener("click", buy); close.addEventListener("click", shut); dialog.addEventListener("close", closed); dialog.addEventListener("click", outside);
        draw(); dialog.showModal();
      },
      dispose() {
        if (!dialog) return;
        list.removeEventListener("click", buy); close.removeEventListener("click", shut); dialog.removeEventListener("close", closed); dialog.removeEventListener("click", outside);
        shut(); dialog = list = purse = close = onClose = null; gained = [];
      }
    };
  })();
  // Whether a body at (x, z) with its feet at `feet` stands before the merchant's counter.
  const atMerchant = (x, z, feet) => Math.abs(feet - L.ARMORY.y) < 0.6 && Math.hypot(x - L.ARMORY.merchant.at.x, z - L.ARMORY.merchant.at.z) < L.ARMORY.merchant.reach;
  const trade = () => { pilot.setMenuOpen(true); shop.open(() => { if (pilot) pilot.setMenuOpen(false); }); return true; };
  const talkTo = (g) => {
    if (!pilot || talk.open) return false;
    if (g.at.kind === "captain") return talkLeif(g);
    if (YARD_TALK[g.at.kind]) {
      pilot.setMenuOpen(true);
      return talk.show(g.at.name, YARD_TALK[g.at.kind], null, () => { if (pilot) pilot.setMenuOpen(false); });
    }
    const at = quests.stage("crystal");
    // The crystal is his the moment he sees it.
    if (at === "carrying") { quests.advance("crystal", "reward"); hud.toast("Quest updated: Eryk's Crystal"); }
    pilot.setMenuOpen(true);
    return talk.show(g.at.name, ERYK[at || "ask"], (answer) => {
      if (answer === "accept" && quests.accept("crystal")) questStarted("crystal");
      else if (answer === "decline") fx.sayAt(g.at.x, 2.5, g.at.z, "Suit yourself. I'll be here.", 2.6);
    }, () => { if (pilot) pilot.setMenuOpen(false); });
  };
  // The crystal, while his quest waits on it: turning slowly and bobbing on its beach, taken by walking into it or with
  // Space beside it.
  const crystalWaits = () => quests.stage("crystal") === "active";
  const takeCrystal = () => {
    if (!crystalWaits() || !quests.advance("crystal", "carrying")) return false;
    audio.item();
    scene.pick.at = clock;
    hud.toast("You found the orange crystal. Bring it to Eryk.");
    return true;
  };
  // The island being come to, named under the header (`#keep-area`) as the visitor comes within `near` of its shore
  // (an arrival too), and gone from it only past `far`, so a walk along the beach shows it once.
  // The shipyard and the Armory & Forge are named from the head of the stair down to each.
  const AREAS = { near: 12, far: 18, portal: "Portal Island", castle: "Castle Island", shipyard: "The Shipyard", forge: "The Armory & Forge", volcano: "CBDC", storj: "Cold Storj", arena: "The Arena", shards: "Shards Island", outpost: "Outpost Island" };
  // The castle island's waters, the shipyard's and the Armory & Forge's among them: a box round it (`CASTLE_WATERS`,
  // `hold` more to leave it), all of it Castle Island to anyone afloat; ashore, the shipyard and the Armory & Forge
  // are named apart, from the head of each one's stair down.
  const CASTLE_WATERS = { half: 230, z0: -240, z1: 70, hold: 12 };
  const inCastleWaters = (x, z, pad = 0) => Math.abs(x) < CASTLE_WATERS.half + pad && z > CASTLE_WATERS.z0 - pad && z < CASTLE_WATERS.z1 + pad;
  const areaOf = (x, z, was, afloat = false) => {
    // East past the Armory & Forge's water, the volcano's island and nothing else.
    if (x > L.VOLCANO.x - L.VOLCANO.r - 60) { const v = L.volcanoDist(x, z); return v > -AREAS.near || (was === "volcano" && v > -AREAS.far) ? "volcano" : null; }
    // Out north of Cold Storj, Outpost Island and its docks.
    { const O = L.OUTPOST, v = Math.max(Math.abs(x - O.x), Math.abs(z - O.z)); if (v < O.half + 14 || (was === "outpost" && v < O.half + 20) || L.nearOutpost(x, z) && was === "outpost") return "outpost"; }
    // West past the shipyard's water, Cold Storj (its fjord inside its shore).
    if (x < L.STORJ.east + 60) { const v = L.storjCoast(x, z); return v > -AREAS.near || (was === "storj" && v > -AREAS.far) ? "storj" : null; }
    // Out between the islet and CBDC, Shards.
    { const v = L.shardsDist(x, z); if (v > -AREAS.near || (was === "shards" && v > -AREAS.far)) return "shards"; }
    // North behind the castle island, the arena on its rock.
    { const a = L.arenaDist(x, z); if (a > -AREAS.near || (was === "arena" && a > -AREAS.far)) return "arena"; }
    if (afloat && inCastleWaters(x, z, was === "castle" ? CASTLE_WATERS.hold : 0)) return "castle";
    if (inCastleWaters(x, z) && x < L.SHIPYARD.area + (was === "shipyard" ? 6 : 0)) return "shipyard";
    if (inCastleWaters(x, z) && x > L.ARMORY.area - (was === "forge" ? 6 : 0)) return "forge";
    const i = L.isletDist(x, z), c = L.coastDist(x, z);
    if (i > -AREAS.near) return "portal";
    if (c > -AREAS.near) return "castle";
    // Between the two: still the one last named until well out from its shore.
    if (was === "portal" && i > -AREAS.far) return "portal";
    if (was === "castle" && c > -AREAS.far) return "castle";
    return null;
  };
  // Come to by sea, in a boat or at a ship's helm, the island's name stands large across the view instead.
  const areaUpdate = (s, x, z) => {
    const cave = people && people.player, afloat = !!s.sail || (!!cave && s.ferries.some((f) => f.seat.sitter === cave));
    const area = areaOf(x, z, s.area, afloat);
    if (area === s.area) return;
    s.area = world.keepArea = area;
    if (!area) return;
    if (afloat) banner("", AREAS[area], true); else areaShow(AREAS[area]);
  };
  // A place's name slid in under the header and faded away (`#keep-area`): an island here, a level of the keep in the
  // halls (scene-keep-halls.js).
  const areaShow = (name) => {
    const el = document.getElementById("keep-area");
    el.textContent = name;
    el.removeAttribute("data-show"); el.hidden = false; void el.offsetWidth; el.dataset.show = "1";
  };
  BL.keepArea = { show: areaShow, hide: () => { const el = document.getElementById("keep-area"); el.hidden = true; el.removeAttribute("data-show"); } };
  // The orange beam that comes down on someone or something (the crystal taken, the knights met): out of the sky and
  // down onto it in `grow` seconds, an aura round it and a ring rolling out from its feet, following it and fading
  // over `life` seconds. `g` holds its beam, aura and ring nodes; `h` is how tall it stands, the look scaled from an
  // Ooga's (`BEAM_LOOK.height`) to it, and `sky`, when given, how high the beam itself reaches, for one seen from afar, widening with distance
  // (`far` of it) so it never thins to a thread.
  const BEAM_LOOK = { grow: 0.25, top: 9, wide: 2.2, ring: 0.9, height: 1.8, far: 0.045 };
  const drawBeam = (g, x, feet, z, h, since, life, t, sky = 0) => {
    const k = since / life, on = k >= 0 && k < 1;
    g.beam.visible = g.aura.visible = g.ring.visible = on;
    if (!on) return;
    const S = h / BEAM_LOOK.height, top = sky || BEAM_LOOK.top * S, face = Math.atan2(camera.position.x - x, camera.position.z - z);
    const reach = Math.min(1, since / BEAM_LOOK.grow), fade = Math.min(1, (1 - k) * 2.2), pulse = 0.85 + 0.15 * Math.sin(t * 7), ring = (since / BEAM_LOOK.ring) % 1;
    const b = g.beam, a = g.aura, r = g.ring;
    b.position.x = x; b.position.y = feet + top * (1 - reach); b.position.z = z; b.rotation.y = face;
    b.scale.x = (sky ? Math.max(BEAM_LOOK.wide * S, Math.hypot(camera.position.x - x, camera.position.z - z) * BEAM_LOOK.far) : BEAM_LOOK.wide * S) * pulse; b.scale.y = top * reach; b.scale.z = 1; b.smokeOpacity = 0.85 * fade;
    a.position.x = x; a.position.y = feet + h * 0.55; a.position.z = z; a.rotation.y = face;
    a.scale.x = a.scale.y = h * 1.4 * pulse; a.smokeOpacity = 0.9 * fade * reach;
    r.position.x = x; r.position.y = feet + 0.06; r.position.z = z; r.rotation.x = -Math.PI / 2;
    r.scale.x = r.scale.y = (1 + 4 * ring) * S; r.smokeOpacity = 0.75 * (1 - ring) * fade * reach;
  };
  // The crystal taken: the beam on the Ooga that took it, for `PICK.for` seconds.
  const PICK = { for: 2.6 };
  const pickUpdate = (s, t) => {
    const g = s.pick;
    if (!avatar) { g.beam.visible = g.aura.visible = g.ring.visible = false; return; }
    const p = avatar.root.position;
    drawBeam(g, p.x, p.y - avatar.baseY, p.z, avatar.traits.height, t - g.at, PICK.for, t);
  };
  // On a first visit, the beam on whichever rowboat lies nearest where the portal lets visitors out.
  const guideUpdate = (s, t) => {
    const g = s.guide;
    let f = null, best = Infinity;
    if (s.first) for (const q of s.ferries) { const d = Math.hypot(q.x - ARRIVE.x, q.z - ARRIVE.z); if (q.state === "moored" && d < best) { best = d; f = q; } }
    if (!f) { g.beam.visible = g.aura.visible = g.ring.visible = false; return; }
    drawBeam(g, f.x, f.y + GUIDE.lift, f.z, GUIDE.height, t, Infinity, t);
  };
  // Snow falling round the view while it is on or near Cold Storj (within `near` of its middle): each flake drifting down
  // in a box `box` round the eye, swaying a little, put back over the eye as it falls out of the box; none away from it.
  const SNOW = { count: 260, near: 60, box: 26, high: 14, low: 10, fall: [0.9, 1.7], sway: 0.35 };
  const snowUpdate = (s, dt, t) => {
    const eye = camera.position, on = eye.x < L.STORJ.east + SNOW.near && L.storjCoast(eye.x, eye.z) > -SNOW.near;
    for (let i = 0; i < s.snow.length; i++) {
      const f = s.snow[i], p = f.node.position;
      if (!on) { f.node.visible = false; continue; }
      if (!f.node.visible || p.y < eye.y - SNOW.low || Math.abs(p.x - eye.x) > SNOW.box || Math.abs(p.z - eye.z) > SNOW.box) {
        // One that fell through the box comes back over the eye; one new or left behind is scattered through it.
        const fell = f.node.visible && p.y < eye.y - SNOW.low;
        f.node.visible = true;
        p.x = eye.x + (Math.random() * 2 - 1) * SNOW.box; p.z = eye.z + (Math.random() * 2 - 1) * SNOW.box;
        p.y = fell ? eye.y + SNOW.high : eye.y - SNOW.low + Math.random() * (SNOW.high + SNOW.low);
        f.fall = SNOW.fall[0] + Math.random() * (SNOW.fall[1] - SNOW.fall[0]); f.vx = (Math.random() - 0.5) * 0.4; f.vz = (Math.random() - 0.5) * 0.4;
      }
      p.y -= f.fall * dt;
      p.x += (f.vx + Math.sin(t * 1.3 + f.phase) * SNOW.sway) * dt; p.z += (f.vz + Math.cos(t * 1.1 + f.phase) * SNOW.sway) * dt;
    }
  };
  // While a quest is under way, the same beam standing up into the sky over where its next step is, `QUEST_BEAM.sky`
  // metres tall so it is seen from the other islands, one a place (`questSpots`: both knights while they still have to
  // meet), fading out as the visitor comes within `near` of it and back as they leave. The first visit's beam on the
  // rowboat comes first, and none stands while the visitor is at a ship's helm hunting the raider but over her.
  const QUEST_BEAM = { sky: 90, height: 3, near: 5, ease: 3, max: 3, draw: 440 };
  const questSpots = (s, out) => {
    let n = 0;
    const put = (x, feet, z, key) => { if (n >= QUEST_BEAM.max) return; const o = out[n++]; o.x = x; o.feet = feet; o.z = z; o.key = key; };
    const guard = (kind) => s.guards.find((g) => g.at.kind === kind);
    const crystal = quests.stage("crystal"), sails = quests.stage("sails");
    if (crystal === "active") put(L.CRYSTAL.x, s.crystalY, L.CRYSTAL.z, "crystal");
    else if (crystal === "carrying") { const g = guard("viking"); if (g) put(g.at.x, g.at.y || 0, g.at.z, "eryk"); }
    else if (crystal === "reward") {
      if (!rules.open("drawbridge")) for (let i = 0; i < STATUES.length; i++) put(STATUES[i].x, 0, STATUES[i].z, i ? "knight1" : "knight0");
      else { const M = L.ARMORY.merchant; put(M.x, L.ARMORY.y, M.z, "merchant"); }
    }
    const gun = quests.stage("cannon");
    if (gun === "tower") {
      // A tutorial: first over the nearest free rowboat, then, once the visitor is afloat or on Outpost Island, over its
      // tower nearest them.
      const p = avatar && avatar.root.position, O = L.OUTPOST;
      const afloat = !!s.sail || s.ferries.some((f) => f.seat.sitter === avatar), there = p && Math.hypot(p.x - O.x, p.z - O.z) < O.half + 70;
      if (p && !afloat && !there) {
        let boat = null, bd = Infinity;
        for (const f of s.ferries) if (f.state === "moored" && !f.seat.sitter) { const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < bd) { bd = d; boat = f; } }
        if (boat) put(boat.x, L.SEA, boat.z, "boat");
      } else {
        let best = null, bd = Infinity;
        for (const g of L.GALLERIES) if (g.outpost) { const d = p ? Math.hypot(p.x - g.x, p.z - g.z) : 0; if (d < bd) { bd = d; best = g; } }
        if (best) put(best.x, best.floor, best.z, "outpost");
      }
    } else if (gun === "battle") {
      if (s.cannon && s.cannon.live) for (const w of s.cannon.ships) if (w.at.wave === s.cannon.wave && w.raid.sink < 0 && w.at.z < 4000) put(w.at.x, L.SEA, w.at.z, "wave" + w.at.quest + s.cannon.ships.indexOf(w));
    } else if (gun === "report") { const g = guard("captain"); if (g) put(g.at.x, g.at.y || 0, g.at.z, "leif"); }
    if (sails === "helm") {
      const w = s.fleet.find((f) => f.at.drive && f.at.scale < 0.2);
      if (w && !w.sail.seat.sitter) put(w.sail.seat.x, L.SEA + w.at.helm.y, w.sail.seat.z, "helm");
    } else if (sails === "hunt") {
      s.redShips.forEach((red, i) => { if (red.raid.sink < 0 && red.at.z < 4000) put(red.at.x, L.SEA, red.at.z, "red" + i); });
    } else if (sails === "report") { const g = guard("captain"); if (g) put(g.at.x, g.at.y || 0, g.at.z, "leif"); }
    return n;
  };
  const questBeamUpdate = (s, t, dt) => {
    const B = s.questBeams, n = s.first ? 0 : questSpots(s, B.spots), p = avatar && avatar.root.position, feet = p ? p.y - avatar.baseY : 0;
    for (let i = 0; i < B.slots.length; i++) {
      const g = B.slots[i], o = B.spots[i];
      if (i >= n) { g.key = ""; g.k = 0; g.beam.visible = g.aura.visible = g.ring.visible = false; continue; }
      if (g.key !== o.key) { g.key = o.key; g.at = t; g.k = 1; }
      const near = p && Math.hypot(p.x - o.x, p.z - o.z) < QUEST_BEAM.near && Math.abs(feet - o.feet) < 4;
      g.k = clamp(g.k + (near ? -dt : dt) * QUEST_BEAM.ease, 0, 1);
      // Further off than the view draws, it is drawn nearer along the same line and as much smaller, so it looks the
      // same and shows from anywhere in the land however far the next step is.
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, cd = Math.hypot(o.x - cx, o.z - cz), k = cd > QUEST_BEAM.draw ? QUEST_BEAM.draw / cd : 1;
      drawBeam(g, cx + (o.x - cx) * k, cy + (o.feet - cy) * k, cz + (o.z - cz) * k, QUEST_BEAM.height * k, t - g.at, Infinity, t, QUEST_BEAM.sky * k);
      if (g.k < 0.02) { g.beam.visible = g.aura.visible = g.ring.visible = false; continue; }
      g.beam.smokeOpacity *= g.k; g.aura.smokeOpacity *= g.k; g.ring.smokeOpacity *= g.k;
    }
  };
  const crystalUpdate = (s, elapsed, dt) => {
    pickUpdate(s, elapsed);
    guideUpdate(s, elapsed);
    questBeamUpdate(s, elapsed, dt);
    const n = s.crystal;
    n.visible = crystalWaits();
    if (!n.visible) return;
    n.rotation.y = elapsed * 0.6;
    n.position.y = s.crystalY + 0.08 + Math.sin(elapsed * 1.7) * 0.06;
  };
  const guardUpdate = (s, elapsed) => {
    for (const g of s.guards) {
      const t = elapsed + g.phase;
      g.node.scale.y = 1 + Math.sin(t * 1.5) * 0.008;
      g.node.rotation.y = g.at.yaw + Math.sin(t * 0.31) * 0.09 + Math.sin(t * 0.83) * 0.03;
    }
  };
  const guardSpeak = (who) => {
    const g = scene && scene.guards.find((k) => k.at.kind === who);
    if (!g) return;
    const lines = GUARD_LINES[who];
    fx.sayAt(g.at.x, (g.at.y || 0) + 2.5, g.at.z, lines[g.line++ % lines.length], 2.6);
  };
  // ---------- the ships ----------
  // How far a ship at (x, z) turned `yaw` would stand in what it must keep off, along its hull's circles: water too
  // shallow for its keel (more the shallower), another ship (by how far their hulls would overlap) and the rowboat (by how
  // near it would come): a move may never add to it, so a ship stops at a shore, another ship or the boat and works
  // its way off again.
  const SHIP_CIRCLES = [-0.8, -0.4, 0, 0.4, 0.8];
  const shipFoul = (w, x, z, yaw, s) => {
    const g = w.at, f = s.ferry, sn = Math.sin(yaw), cs = Math.cos(yaw), r = g.beam * 1.05, low = L.SEA - g.keel - 0.4;
    let foul = 0;
    for (let i = 0; i < SHIP_CIRCLES.length; i++) {
      const a = SHIP_CIRCLES[i] * g.bow, px = x + sn * a, pz = z + cs * a;
      const ground = L.heightAt(px, pz);
      if (ground > low) foul += 1 + ground - low;
      const boat = Math.hypot(px - f.x, pz - f.z) - r - 2.5;
      if (boat < 0) foul -= boat;
      for (let k = 0; k < s.ships.length; k++) {
        const o = s.ships[k].at;
        if (o === g) continue;
        const osn = Math.sin(o.yaw), ocs = Math.cos(o.yaw), or = o.beam * 1.05;
        for (let j = 0; j < SHIP_CIRCLES.length; j++) {
          const b = SHIP_CIRCLES[j] * o.bow, gap = Math.hypot(px - o.x - osn * b, pz - o.z - ocs * b) - r - or - 1;
          if (gap < 0) foul -= gap;
        }
      }
    }
    return foul;
  };
  // How the escorts move: their top speed, how fast they gather way, and how fast they turn going home and while they
  // keep pace with the boat (`follow`). Called out while they are further than `catchFrom` from their place by a rowing
  // boat (setting out from the castle island, their homes by the islet), they come on at `catch` speed, gathering way at
  // `catchAccel` and turning at `catchTurn`, then keep pace as ever once they are near it.
  // How fast the escorts' heading follows the boat's (rad/s), and how far they must have passed each other to change sides.
  const FORM_TURN = 0.5, FORM_SWAP = 4;
  // ---------- sailing ----------
  // The shipyard's fleet (keep-layout.js `SHIPS`' `drive`): the galleon, a great longship and a small one, each sailed
  // from a wheel on its deck (`helm`). By size (`small`, `large`, `galleon`, the galleon the slowest and heaviest on
  // her helm, the great longship quicker and handier, the small one quicker and handier again): how fast it sails ahead (`speed`) and
  // astern (`back`), how quickly it gathers way (`accel`) and loses it with no hand on the wheel (`drag`), how fast it
  // turns with way on (`turn`, `still` of that lying still), and how long each of its guns takes to load (`cool`).
  // Its helm is taken within `reach` of the wheel. The side its helmsman looks out over fires: no guns bear within
  // `bear` (a sine) of dead ahead or astern; the guns train `train` fore and aft with the view and lift with its
  // pitch as a manned cannon's do; one action fires every loaded gun of that side in turn from the bow aft, `ripple`
  // apart. A red tower's ball takes a point off its hull, each sitting it `low` of its draught lower; at none it goes
  // under over `sink` s, whoever is aboard stands on the shipyard's quay, and it is back at its mooring whole. Left
  // within `home` of its mooring it eases back onto it (`berth` m/s) and is mended; one that lies against a quay is
  // warped off it sideways at `warp` m/s as its helm is taken there.
  const SAIL = { small: { speed: 8.8, back: 4, accel: 2.8, drag: 2.2, turn: 0.72, cool: 3 }, large: { speed: 6.4, back: 3, accel: 1.7, drag: 1.4, turn: 0.45, cool: 4 }, galleon: { speed: 12.15, back: 3.75, accel: 2.4, drag: 1, turn: 0.3, cool: 5 },
    still: 0.35, reach: 2.6, bear: 0.35, train: 0.3, ripple: 0.2, low: 0.12, sink: 3.2, home: 30, berth: 1.6, warp: 2.4, idle: 120 };
  // The helm's view from further off: scrolling out from the helmsman's shoulder draws the view back to circle the
  // whole ship (`start` of its length off to begin with, between `min` and `max`), as the rowboat's circles the boat:
  // looking about turns it round the ship and tilts it, from low over the water astern (`low`) to nearly straight down
  // (`high`), so the side that bears and the aim stay as they were; scrolling in under `min` comes back to the
  // shoulder. It is laid over the pilot's own view after the pilot has set it and taken off again before the next
  // frame reads it (`helmView`, `helmUnview`), so the pilot never knows.
  const HELM_VIEW = { min: 14, max: 150, start: 1.9, low: 0.1, high: 1.48, ease: 5, quiet: 0.35 };
  const helmZoom = (factor) => {
    const s = scene, V = s && s.helmCam;
    if (!V || !s.sail) return false;
    if (V.quiet > 0) return true;
    if (V.on) {
      V.h *= factor;
      if (V.h < HELM_VIEW.min) { V.on = false; V.quiet = HELM_VIEW.quiet; }
      V.h = clamp(V.h, HELM_VIEW.min, HELM_VIEW.max);
      return true;
    }
    if (factor <= 1 || pilot.view === "first-person") return false;
    V.on = true; V.ship = s.sail; V.h = clamp(s.sail.at.bow * HELM_VIEW.start, HELM_VIEW.min, HELM_VIEW.max); V.quiet = HELM_VIEW.quiet * 0.5;
    return true;
  };
  const helmView = (s, dt) => {
    const V = s.helmCam;
    V.quiet = Math.max(0, V.quiet - dt);
    if (!s.sail) V.on = false;
    V.mix += ((V.on ? 1 : 0) - V.mix) * Math.min(1, dt * HELM_VIEW.ease);
    if (V.mix < 0.003 || !V.ship) { V.mix = V.on ? V.mix : 0; return; }
    V.show += (V.h - V.show) * Math.min(1, dt * 8);
    const g = V.ship.at, k = V.mix * V.mix * (3 - 2 * V.mix), P = camera.position, T = camera.target, yaw = pilot.orbit.yaw, ty = L.SEA + g.helm.y;
    const tilt = clamp(pilot.orbit.pitch, HELM_VIEW.low, HELM_VIEW.high), flat = Math.cos(tilt) * V.show;
    V.px = P.x; V.py = P.y; V.pz = P.z; V.tx = T.x; V.ty = T.y; V.tz = T.z; V.held = true;
    P.x += (g.x + Math.sin(yaw) * flat - P.x) * k; P.y += (ty + Math.sin(tilt) * V.show - P.y) * k; P.z += (g.z + Math.cos(yaw) * flat - P.z) * k;
    T.x += (g.x - T.x) * k; T.y += (ty - T.y) * k; T.z += (g.z - T.z) * k;
  };
  const helmUnview = (s) => {
    const V = s.helmCam;
    if (!V.held) return;
    V.held = false;
    camera.position.x = V.px; camera.position.y = V.py; camera.position.z = V.pz; camera.target.x = V.tx; camera.target.y = V.ty; camera.target.z = V.tz;
  };
  const SAIL_SHOT = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, AIM_GUN = { ship: null, gun: null, t: null }, TOWER_AT = { x: 0, y: 0, z: 0, yaw: 0, v: 0, on: false };
  const helmLeave = () => document.getElementById("keep-cannon-leave");
  // The wheel's stool where the ship now lies, and its helmsman sat on it.
  const placeHelm = (w) => {
    const g = w.at, S = w.sail, st = S.seat, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = g.helm.a + KM.HELM.z * S.hs;
    st.x = g.x + sn * a; st.z = g.z + cs * a; st.y = w.node.position.y + g.helm.y + KM.HELM.y * S.hs; st.ry = g.yaw;
    if (st.sitter) { const p = st.sitter.root.position; p.x = st.x; p.z = st.z; p.y = st.y + st.sitter.traits.height * 0.08; st.sitter.root.rotation.y = st.ry; }
  };
  const buildFleet = (s) => {
    s.sail = null; s.aimGun = null;
    // The smoke screen's plumes, one set for the fleet (`layScreen`).
    s.screen = { t: -3, puffs: Array.from({ length: SHIP_ACTS[2].puffs }, () => { const n = createNode({ geometry: KM.ashPuff(), visible: false, sightHidden: true }); addChild(root, n); return { n, x: 0, y: 0, z: 0, t: 0, spin: 0, rise: 0 }; }) };
    s.helmCam = { on: false, ship: null, h: 30, show: 30, mix: 0, quiet: 0, held: false, px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };
    // Every ship of the Oogas' is one a visitor may sail: the shipyard's three, and the castle's guards and the
    // rowboat's escorts, which leave their duty while someone has them (`away`).
    s.fleet = s.ships.filter((w) => w.at.role !== "raider");
    const kept = Array.isArray(world.keepFleet) && world.keepFleet.length === s.fleet.length ? world.keepFleet : null;
    s.fleet.forEach((w, i) => {
      const g = w.at, big = g.kind === "galleon", C = big ? SAIL.galleon : g.scale < 0.2 ? SAIL.small : SAIL.large, m = g.scale, hs = big ? 1.2 : clamp(g.scale * 2.4, 0.45, 0.9), k = kept && kept[i];
      const ok = !!k && Number.isFinite(k.x) && Number.isFinite(k.z) && Number.isFinite(k.yaw) && Number.isFinite(k.hp);
      // A ship of the shipyard lies where it was left; a guard or an escort only while it is away from its duty.
      const away = ok && (g.role === "docked" || !!k.away);
      if (away) { g.x = k.x; g.z = k.z; g.yaw = k.yaw; }
      const wheel = createNode({ geometry: KM.helm(), position: { x: 0, y: g.helm.y / m, z: g.helm.a / m }, scale: { x: hs / m, y: hs / m, z: hs / m } });
      addChild(w.node, wheel);
      input.add(wheel, { kind: "keep-helm", index: i }, { radius: 1.3 });
      targets.push(wheel);
      w.sail = { C, hs, away: away && g.role !== "docked", v: 0, w: 0, hp: ok ? clamp(Math.round(k.hp), 1, g.hull) : g.hull, sink: -1, cast: 0, side: 0, train: 0, elev: 0.15, tx: 0, tz: 0, aimed: false, ashore: false, shoreAt: -1, acts: SHIP_ACTS.map(() => ({ on: 0, wait: 0 })), rip: -1, ripSide: 0, ripT: 0, carried: false, from: { ship: true },
        guns: g.guns.map(([a, c, y, size]) => ({ a, c, y, size, side: c > 0 ? 1 : -1, wait: 0 })),
        seat: { kind: "helm", x: 0, y: 0, z: 0, floor: 0, ry: 0, ground: false, sitter: null, walkAt: { x: 0, z: 0 }, lockMovement: false, keepEquipment: true, act: () => { if (w.sail.ashore) { leaveHelm(); return true; } fireSide(s, w); return true; } } };
      // Where she is mended (keep-layout.js `ship.mend`): at each place a ring glowing on the deck, a soft light
      // standing up out of it and a mallet turning over it, all shown only while she is hurt.
      w.sail.mend = g.mend.map(([a, c, y], n) => {
        const at = createNode({ position: { x: c / m, y: (y + 0.07) / m, z: a / m }, scale: { x: hs / m, y: hs / m, z: hs / m }, visible: false });
        const ring = createNode({ geometry: KM.glowRing(), rotation: { x: -Math.PI / 2, y: 0, z: 0 }, sightHidden: true }), disc = createNode({ geometry: KM.whiteDisc(), rotation: { x: -Math.PI / 2, y: 0, z: 0 }, scale: { x: REPAIR.ring, y: REPAIR.ring, z: 1 }, sightHidden: true });
        const beam = createNode({ geometry: KM.whiteBeam(), scale: { x: 1.1, y: 3.4, z: 1.1 }, sightHidden: true }), tool = createNode({ geometry: KM.mallet(), position: { x: 0, y: 1.9, z: 0 }, rotation: { x: 0, y: 0, z: 0.5 }, scale: { x: 1.8, y: 1.8, z: 1.8 }, sightHidden: true });
        disc.smokeOpacity = 0.35; beam.smokeOpacity = 0.4;
        addChild(at, disc, ring, beam, tool); addChild(w.node, at);
        return { a, c, y, at, ring, beam, tool, phase: n * 1.3 };
      });
      placeHelm(w);
    });
  };
  const keptFleet = () => scene.fleet.map((w) => ({ x: w.at.x, z: w.at.z, yaw: w.at.yaw, hp: w.sail.hp, away: w.sail.away }));
  // The ship whose free helm a body at (x, z) with its feet at `feet` stands by, or null.
  const nearHelm = (x, z, feet) => {
    if (!scene || !scene.fleet || scene.sail) return null;
    for (let i = 0; i < scene.fleet.length; i++) {
      const w = scene.fleet[i], S = w.sail;
      if (!S.seat.sitter && S.sink < 0 && Math.hypot(x - S.seat.x, z - S.seat.z) < SAIL.reach && Math.abs(feet - L.SEA - w.at.helm.y) < 1.7) return w;
    }
    return null;
  };
  // The helm's panel beside the health (`#keep-helm`): a pip a gun down each side, written only on a change.
  let helmEl = null, helmShown = "";
  const helmPanel = (w) => {
    if (!helmEl) {
      helmEl = { root: document.getElementById("keep-helm"), port: document.getElementById("keep-helm-port"), star: document.getElementById("keep-helm-star") };
      helmEl.port.addEventListener("click", () => { lookAbeam(1); helmEl.port.blur(); });
      helmEl.star.addEventListener("click", () => { lookAbeam(-1); helmEl.star.blur(); });
    }
    helmEl.root.hidden = !w;
    helmShown = "";
    if (!w) return;
    for (const [el, side] of [[helmEl.port, 1], [helmEl.star, -1]]) {
      const row = el.querySelector("b");
      row.textContent = "";
      for (const gun of w.sail.guns) if (gun.side === side) row.appendChild(document.createElement("i"));
    }
  };
  const helmPaint = (S) => {
    let key = S.side > 0 ? "p" : S.side < 0 ? "s" : "-";
    for (let i = 0; i < S.guns.length; i++) key += S.guns[i].wait > 0 ? "0" : "1";
    if (key === helmShown) return;
    helmShown = key;
    helmEl.port.dataset.on = S.side > 0; helmEl.star.dataset.on = S.side < 0;
    const pips = [helmEl.port.querySelectorAll("i"), helmEl.star.querySelectorAll("i")];
    let p = 0, q = 0;
    for (let i = 0; i < S.guns.length; i++) { const gun = S.guns[i]; (gun.side > 0 ? pips[0][p++] : pips[1][q++]).dataset.on = gun.wait <= 0; }
  };
  // The view turned to look out over a side (`side`: 1 port, -1 starboard), from the panel's buttons.
  const lookAbeam = (side) => {
    const w = scene && scene.sail;
    if (!w || !pilot) return;
    pilot.orbit.yaw = pilot.orbit.tYaw = w.at.yaw + side * Math.PI / 2 + Math.PI;
    pilot.orbit.pitch = pilot.orbit.tPitch = 0.1;
  };
  const takeHelm = (w) => {
    const cave = people && people.player, S = w.sail;
    if (!cave || scene.sail || S.sink >= 0) return false;
    // Only the small longships are to be had for now: the great longships and the galleon wait (`greatShips`).
    if ((w.at.kind === "galleon" || w.at.scale >= 0.2) && !greatShips()) {
      hud.toast("Only the small longships are yours to sail for now. The great longships and the galleon will have to wait.");
      return false;
    }
    // Stood up again where they are, until the helm is left somewhere else.
    S.seat.walkAt.x = cave.root.position.x; S.seat.walkAt.z = cave.root.position.z; S.seat.floor = cave.root.position.y - cave.baseY;
    placeHelm(w);
    if (!people.sitPlayer(S.seat)) return false;
    S.seat.lockMovement = true;
    scene.sail = w; S.away = true;
    // Taken at its mooring, a ship that lies against a quay is warped off it first (keep-layout.js `cast`).
    S.cast = w.at.cast && Math.hypot(w.at.x - w.at.home.x, w.at.z - w.at.home.z) < 2 ? Math.abs(w.at.cast) : 0;
    // The helm is worked with the pointer free, as the rowboat is: whoever came aiming leaves combat's look for it
    // (given back as they step off), so the mouse lays the guns and a drag turns the view.
    S.carried = !!cave.weapon.aiming;
    if (S.carried) pilot.modeAction("mode-toggle");
    pilot.orbit.yaw = pilot.orbit.tYaw = w.at.yaw + Math.PI;
    pilot.orbit.pitch = pilot.orbit.tPitch = 0.4;
    const out = helmLeave();
    out.textContent = "Leave helm"; out.hidden = false;
    helmPanel(w);
    shipBar(w);
    // Leif's quest: at a small longship's wheel, out after the red sails.
    if (w.at.scale < 0.2 && quests.stage("sails") === "helm" && quests.advance("sails", "hunt")) hud.toast("Quest updated: sail west and find the three ships with red sails");
    hud.hint(COARSE ? "The stick sails and steers. Tap the water to fire at it. Drag to look, pinch out for the view from further off. Leave helm to step off." : "W S: sail · A D: steer · Mouse: lay the guns · Click or Space: fire · Drag: look · Scroll: nearer or further · X: leave", 10000);
    return true;
  };
  // Where the helmsman steps off: a dock or a shore within reach at about the deck's height, else the deck beside the
  // wheel.
  // `shoreSpot` writes the dock or shore spot into the seat and answers whether there is one.
  const shoreSpot = (w, cave) => {
    const g = w.at, st = w.sail.seat, deck = L.SEA + g.helm.y;
    for (const d of LAND_REACH) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = st.x + Math.sin(a) * d, z = st.z + Math.cos(a) * d;
      if (L.shipTop(x, z, 0.3) !== null || L.waterAt(x, z, bridgeDown(), gateUp()) !== null || L.inWard(x, z)) continue;
      const top = L.supportAt(x, z, deck + 1.5, bridgeDown(), gateUp());
      if (Math.abs(top - deck) > 1.5 || !walkableFor(x, z, x, z, top, cave.bodyHeight, cave)) continue;
      st.walkAt.x = x; st.walkAt.z = z; st.floor = top;
      return true;
    }
    return false;
  };
  const helmLanding = (w, cave) => {
    if (shoreSpot(w, cave)) return;
    const g = w.at, st = w.sail.seat, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = g.helm.a + KM.HELM.z * w.sail.hs, c = 1.1 * w.sail.hs;
    st.walkAt.x = g.x + sn * a + cs * c; st.walkAt.z = g.z + cs * a - sn * c; st.floor = L.SEA + g.helm.y;
  };
  // The helm let go of: its helmsman's own view back, the panel and the button put away.
  const helmDropped = (w) => {
    const S = w.sail, cave = people && people.player;
    if (S.seat.sitter) standOff(w, S.seat.sitter);
    S.seat.lockMovement = false; S.rip = -1; S.ashore = false; S.shoreAt = -1;
    if (S.carried && cave && !cave.weapon.aiming) pilot.modeAction("mode-toggle");
    if (cave && people) people.poseWeapon(cave);
    S.carried = false;
    scene.sail = null; scene.aimGun = null;
    const out = helmLeave();
    out.hidden = true; out.textContent = "Leave cannon";
    helmPanel(null);
    shipBar(null);
  };
  // Stands whoever sits at a ship's helm up off it, whatever has become of where they meant to step off: at
  // `helmLanding`'s spot, else on the deck beside the wheel or either side of it, else where they sit, so nobody is
  // ever left on a stool with the helm let go of.
  const standOff = (w, cave) => {
    const st = w.sail.seat;
    st.lockMovement = false;
    if (!cave || !people || cave.camp.seat !== st) return;
    helmLanding(w, cave);
    if (people.standPlayer(cave)) return;
    const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), deck = L.SEA + g.helm.y;
    for (const [a, c] of [[0, 1.1], [0, -1.1], [-1.4, 0], [1.4, 0.6], [1.4, -0.6]]) {
      const along = g.helm.a + a * w.sail.hs, across = c * w.sail.hs;
      st.walkAt.x = g.x + sn * along + cs * across; st.walkAt.z = g.z + cs * along - sn * across; st.floor = deck;
      if (people.standPlayer(cave)) return;
    }
    // Nowhere fit to stand: up where they sit.
    st.walkAt.x = cave.root.position.x; st.walkAt.z = cave.root.position.z; st.floor = deck;
    if (!people.standPlayer(cave)) { st.sitter = null; cave.camp.seat = null; cave.root.position.y = deck + cave.baseY; }
  };
  const leaveHelm = () => {
    const w = scene && scene.sail;
    if (!w) return false;
    standOff(w, w.sail.seat.sitter);
    helmDropped(w);
    world.keepFleet = keptFleet();
    return true;
  };
  // How much of the hull would lie where it may not, with the ship at (x, z) turned `yaw`: `shipFoul`'s shallows,
  // ships and rowboat, and every point of its outline over something built or outside the land's bounds.
  const sailFoul = (w, x, z, yaw, s) => {
    const g = w.at, sn = Math.sin(yaw), cs = Math.cos(yaw);
    let foul = shipFoul(w, x, z, yaw, s);
    for (let k = -5; k <= 5; k++) {
      const a = k / 5 * g.bow, half = L.shipHalf(g, a * 0.98), px = x + sn * a, pz = z + cs * a;
      if (!L.hullClear(px, pz)) foul++;
      if (half > 0.3 && !L.hullClear(px + cs * half, pz - sn * half)) foul++;
      if (half > 0.3 && !L.hullClear(px - cs * half, pz + sn * half)) foul++;
    }
    return foul;
  };
  // Back on its mooring, whole.
  const moorShip = (w) => {
    const g = w.at, S = w.sail;
    g.x = g.home.x; g.z = g.home.z; g.yaw = g.home.yaw;
    S.v = S.w = 0; S.hp = g.hull; S.sink = -1; S.rip = -1; S.cast = 0; S.away = false; w.vx = w.vz = 0; w.placed = false;
    for (let i = 0; i < S.guns.length; i++) S.guns[i].wait = 0;
  };
  // Every ship back at the shipyard (the visitor struck down), whoever was at a helm already stood up.
  const resetFleet = (s) => {
    if (s.sail) helmDropped(s.sail);
    for (const w of s.fleet) { w.sail.seat.lockMovement = false; moorShip(w); }
    world.keepFleet = keptFleet();
  };
  // A sailed ship's move for the frame: the helmsman's throttle and rudder, the hull kept off whatever it may not
  // lie over (a move may never foul more than it already does, so a ship works its way off a berth it starts
  // against), the view and whoever stands on its deck carried round with it; left near its mooring, it eases home.
  const sailStep = (s, w, dt) => {
    const g = w.at, S = w.sail, C = S.C, cave = people && people.player, me = !!cave && S.seat.sitter === cave && !leaving;
    if (S.sink >= 0) {
      if ((S.sink += dt) > SAIL.sink) { moorShip(w); world.keepFleet = keptFleet(); }
      return;
    }
    // Warping off its quay, sideways, before its helmsman has the wheel.
    if (S.cast > 0) {
      const step = Math.min(S.cast, SAIL.warp * dt), side = Math.sign(g.cast);
      g.x += Math.cos(g.yaw) * side * step; g.z -= Math.sin(g.yaw) * side * step; S.cast = me ? S.cast - step : 0;
      return;
    }
    // Left away from where she came from for `SAIL.idle` seconds with nobody at her helm, she is sent back there (to
    // her mooring, or for a guard or an escort to its duty), once the visitor stands well away from both, so she is
    // never seen to go.
    const H0 = g.home, out = S.away || Math.hypot(H0.x - g.x, H0.z - g.z) > 1;
    S.idle = me || !out ? 0 : (S.idle || 0) + dt;
    if (S.idle > SAIL.idle && S.sink < 0) {
      const p = cave ? cave.root.position : pilot.orbit.target;
      if (Math.hypot(p.x - g.x, p.z - g.z) > UNSEEN + g.bow && Math.hypot(p.x - H0.x, p.z - H0.z) > UNSEEN + g.bow) { moorShip(w); S.idle = 0; world.keepFleet = keptFleet(); return; }
    }
    const axes = pilot.controls.axes, throttle = me ? clamp(axes.y, -1, 1) : 0, steer = me ? clamp(axes.x, -1, 1) : 0;
    // Under full sail she is faster and gathers way sooner; ramming, she drives full ahead, faster again, her helm stiff.
    const ram = S.acts[3].on > 0, full = S.acts[0].on > 0, gain = (ram ? SHIP_ACTS[3].gain : 1) * (full ? SHIP_ACTS[0].gain : 1), haste = ram ? SHIP_ACTS[3].haste : full ? SHIP_ACTS[0].haste : 1, go = ram ? 1 : throttle;
    const want = go > 0 ? go * C.speed * gain : go * C.back, rate = (go ? C.accel * haste : C.drag) * dt;
    S.v += clamp(want - S.v, -rate, rate);
    const pace = Math.abs(S.v) / C.speed, wantW = -steer * C.turn * (ram ? SHIP_ACTS[3].stiff : 1) * (SAIL.still + (1 - SAIL.still) * Math.min(1, pace));
    S.w += clamp(wantW - S.w, -C.turn * 2 * dt, C.turn * 2 * dt);
    // Nobody at the wheel and lying near its mooring: back onto it, and mended there.
    if (!me && Math.abs(S.v) < 0.05) {
      S.v = 0; S.w = 0;
      const H = g.home, d = Math.hypot(H.x - g.x, H.z - g.z);
      if (d > 1e-3 && d < SAIL.home) {
        const step = Math.min(d, SAIL.berth * dt);
        let gap = H.yaw - g.yaw; gap = Math.atan2(Math.sin(gap), Math.cos(gap));
        g.x += (H.x - g.x) / d * step; g.z += (H.z - g.z) / d * step; g.yaw += clamp(gap, -0.4 * dt, 0.4 * dt);
      } else if (d <= 1e-3) { g.x = H.x; g.z = H.z; let gap = H.yaw - g.yaw; gap = Math.atan2(Math.sin(gap), Math.cos(gap)); g.yaw += clamp(gap, -0.4 * dt, 0.4 * dt); if (Math.abs(gap) < 0.01 && (S.hp < g.hull || S.away)) { S.hp = g.hull; S.away = false; w.vx = w.vz = 0; w.placed = false; world.keepFleet = keptFleet(); } }
      return;
    }
    if (S.v === 0 && S.w === 0) return;
    const ox = g.x, oz = g.z, oyaw = g.yaw, ny = g.yaw + S.w * dt, nx = g.x + Math.sin(ny) * S.v * dt, nz = g.z + Math.cos(ny) * S.v * dt, was = sailFoul(w, g.x, g.z, g.yaw, s) + 1e-6;
    const v0 = Math.abs(S.v);
    S.bump = Math.max(0, (S.bump || 0) - dt);
    if (sailFoul(w, nx, nz, ny, s) <= was) { g.x = nx; g.z = nz; g.yaw = ny; }
    else {
      // Run into another ship (not a shore or a dock) at any pace: her timbers crunch, once a meeting, and she rolls.
      if (v0 > 1.2 && S.bump <= 0 && !(ram && S.acts[3].on > 0) && shipFoul(w, nx, nz, ny, s) > shipFoul(w, g.x, g.z, g.yaw, s)) {
        S.bump = 1.5; audio.crash(g.x + Math.sin(g.yaw) * g.bow, L.SEA + 1, g.z + Math.cos(g.yaw) * g.bow, clamp(v0 / 8, 0.4, 1));
        w.heelV += (Math.random() < 0.5 ? -1 : 1) * HEEL.kick * 0.6;
      }
      if (sailFoul(w, nx, nz, g.yaw, s) <= was) { g.x = nx; g.z = nz; S.w = 0; }
      else if (sailFoul(w, g.x, g.z, ny, s) <= was) { g.yaw = ny; S.v *= Math.max(0, 1 - 4 * dt); }
      else { S.v = 0; S.w = 0; }
    }
    const turned = g.yaw - oyaw;
    if (ram) ramCheck(s, w);
    if (me && turned) { pilot.orbit.yaw += turned; pilot.orbit.tYaw += turned; }
    // Whoever stands on its deck goes with it.
    if (cave && !cave.camp.seat && (g.x !== ox || g.z !== oz || turned)) {
      const p = cave.root.position, dx = p.x - ox, dz = p.z - oz, sn = Math.sin(oyaw), cs = Math.cos(oyaw), a = dx * sn + dz * cs, c = dx * cs - dz * sn;
      if (Math.abs(a) < g.bow && Math.abs(c) < L.shipHalf(g, a) + 0.2 && Math.abs(p.y - cave.baseY - L.SEA - g.helm.y) < 9) {
        const s1 = Math.sin(g.yaw), c1 = Math.cos(g.yaw);
        p.x = g.x + s1 * a + c1 * c; p.z = g.z + c1 * a - s1 * c; cave.root.rotation.y += turned;
        pilot.orbit.yaw += turned; pilot.orbit.tYaw += turned;
      }
    }
  };
  // Where gun `gun` of the ship `w` sends its shot from and how fast, into `o` (as `muzzle` does a turret's): out
  // over its own side, trained and lifted as the helmsman looks.
  const gunShot = (w, gun, o) => {
    const g = w.at, S = w.sail, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), gx = g.x + sn * gun.a + cs * gun.c, gz = g.z + cs * gun.a - sn * gun.c, gy = w.node.position.y + gun.y;
    // Laid on the helmsman's mark (`S.tx`, `S.tz`): turned to it and lifted to land a ball on it, or as far toward
    // it as a ball will carry.
    const tx = S.tx - gx, tz = S.tz - gz, flat = Math.hypot(tx, tz) || 1, dx = tx / flat, dz = tz / flat, lift = gunLift(flat, L.SEA + 0.3 - gy), ce = Math.cos(lift), se = Math.sin(lift), out = KM.CANNON.muzzle * gun.size;
    o.x = gx + dx * ce * out; o.y = gy + se * out; o.z = gz + dz * ce * out;
    o.vx = dx * ce * GUN.speed; o.vy = se * GUN.speed; o.vz = dz * ce * GUN.speed;
  };
  // The lift that lands an Ooga's ball `flat` m off and `rise` m up, on the low arc; out of reach, the lift that
  // carries furthest.
  const gunLift = (flat, rise) => {
    const v2 = GUN.speed * GUN.speed, g = GUN.gravity, root2 = v2 * v2 - g * (g * flat * flat + 2 * rise * v2);
    return root2 < 0 ? Math.PI / 4 : Math.max(-0.4, Math.atan2(v2 - Math.sqrt(root2), g * flat));
  };
  // The helmsman's mark from the pointer: where the mouse (or a finger) lies over the sea is where the guns are laid,
  // the side it lies off the side that fires, all the way round from bow to stern on each. Taken with the view as it
  // is shown (after `helmView`). With no pointer to go by (a controller, or the pointer held by the view) the mark
  // is left to the view (`sailGuns`).
  const MOUSE = { x: 0, y: 0, seen: false, downX: 0, downY: 0, downAt: 0 }, AIM_VIEW = BL.math.mat4.create(), AIM_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 }, AIM_UP = { x: 0, y: 1, z: 0 };
  const helmMark = (s) => {
    const w = s.sail;
    if (!w) return;
    const S = w.sail, g = w.at;
    S.aimed = MOUSE.seen && document.pointerLockElement !== canvas;
    if (!S.aimed) return;
    BL.math.mat4.lookAt(AIM_VIEW, camera.position, camera.target, camera.up || AIM_UP);
    BL.math.mat4.rayFromView(AIM_RAY, AIM_VIEW, renderer.size.width, renderer.size.height, camera.fov, camera.position, MOUSE.x, MOUSE.y, camera.orthoMix, camera.orthoHeight);
    const R = AIM_RAY, flat = Math.hypot(R.dx, R.dz) || 1, far = R.dy > -0.02 ? 400 : Math.min(400, (L.SEA - R.oy) / R.dy * flat);
    S.tx = R.ox + R.dx / flat * far; S.tz = R.oz + R.dz / flat * far;
    const dx = S.tx - g.x, dz = S.tz - g.z, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = dx * sn + dz * cs, c = dx * cs - dz * sn;
    // Over the ship herself no guns bear.
    S.side = Math.abs(a) < g.bow && Math.abs(c) < L.shipHalf(g, a) + 0.6 ? 0 : c >= 0 ? 1 : -1;
  };
  const helmPointer = (e, down) => {
    const r = canvas.getBoundingClientRect();
    MOUSE.x = (e.clientX - r.left) * renderer.size.width / (r.width || 1); MOUSE.y = (e.clientY - r.top) * renderer.size.height / (r.height || 1); MOUSE.seen = true;
    if (down) { MOUSE.downX = e.clientX; MOUSE.downY = e.clientY; MOUSE.downAt = performance.now(); }
  };
  // A click or a tap on the water (not a drag of the view) fires at where it lies.
  const helmClick = (e) => {
    if (!scene || !scene.sail || leaving || e.button !== 0 || performance.now() - MOUSE.downAt > 350 || Math.hypot(e.clientX - MOUSE.downX, e.clientY - MOUSE.downY) > 6) return;
    helmPointer(e, false);
    helmMark(scene);
    fireSide(scene, scene.sail);
  };
  const fireGun = (s, w, gun) => {
    const b = s.balls.find((q) => !q.on && q.flash <= 0);
    if (!b) return;
    b.on = true; b.t = 0; b.trail = 0; b.from = w.sail.from; b.hostile = false;
    gunShot(w, gun, b);
    b.node.visible = true;
    gun.wait = w.sail.C.cool;
    audio.cannon(b.x, b.y, b.z);
    for (let i = 0; i < 8; i++) fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
    for (let i = 0; i < 4; i++) { const p = fx.spawnParticle(KM.smash().dust[i % 3], b.x, b.y, b.z, b.vx * 0.05 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), b.vz * 0.05 + (Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 0.6, 1.2); if (p) p.smoke = true; }
  };
  // The broadside: every loaded gun of the side looked out over, one after another from the bow aft.
  const fireSide = (s, w) => {
    const S = w.sail;
    if (leaving || S.rip >= 0) return;
    if (!S.side) { hud.hint(S.aimed ? "Point at the water off either side to lay the guns" : "Look out over a side to bring its guns to bear", 2400); return; }
    S.rip = 0; S.ripSide = S.side; S.ripT = 0;
  };
  // The sailed ship's guns for the frame: loading, the side its helmsman looks out over, their train and lift after
  // the view, the broadside running down the side, the gun the aim is drawn from, and the panel.
  const sailGuns = (s, dt) => {
    for (let k = 0; k < s.fleet.length; k++) { const guns = s.fleet[k].sail.guns; for (let i = 0; i < guns.length; i++) if (guns[i].wait > 0) guns[i].wait = Math.max(0, guns[i].wait - dt); }
    s.aimGun = null;
    // The helm left some way of its own (its helmsman stood up by something else): let go of.
    if (s.sail && s.sail.sail.seat.sitter !== (people && people.player)) helmDropped(s.sail);
    const w = s.sail;
    if (!w) return;
    const S = w.sail, g = w.at, fx0 = camera.target.x - camera.position.x, fy0 = camera.target.y - camera.position.y, fz0 = camera.target.z - camera.position.z, flat = Math.hypot(fx0, fz0);
    // With no pointer to go by, the mark is set by the view: out over the side looked over, as far as the look's
    // pitch would throw a ball.
    if (!S.aimed && flat > 1e-4) {
      let rel = Math.atan2(fx0, fz0) - g.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      S.side = Math.abs(Math.sin(rel)) < SAIL.bear ? 0 : rel > 0 ? 1 : -1;
      const k = 1 - Math.exp(-GUN.ease * dt), lift = clamp(Math.atan2(fy0, flat) + GUN.over, GUN.elev[0], GUN.elev[1]);
      let off = rel - S.side * Math.PI / 2; off = Math.atan2(Math.sin(off), Math.cos(off));
      S.train += ((S.side ? clamp(off, -SAIL.train, SAIL.train) : 0) - S.train) * k; S.elev += (lift - S.elev) * k;
      const yaw = g.yaw + S.side * Math.PI / 2 + S.train, reach = Math.max(8, GUN.speed * GUN.speed * Math.sin(2 * Math.max(0.03, S.elev)) / GUN.gravity);
      S.tx = g.x + Math.sin(yaw) * reach; S.tz = g.z + Math.cos(yaw) * reach;
    }
    if (S.rip >= 0) {
      S.ripT -= dt;
      while (S.ripT <= 0 && S.rip < S.guns.length) {
        const gun = S.guns[S.rip++];
        if (gun.side !== S.ripSide || gun.wait > 0) continue;
        fireGun(s, w, gun); S.ripT += SAIL.ripple;
      }
      if (S.rip >= S.guns.length) S.rip = -1;
    }
    // The aim is drawn from the middle gun of the side that bears.
    if (S.side && !leaving) {
      const half = S.guns.length / 2, gun = S.guns[(S.side > 0 ? 0 : half) + (half >> 1)];
      AIM_GUN.ship = w; AIM_GUN.gun = gun; AIM_GUN.t = S.from; s.aimGun = AIM_GUN;
    }
    helmPaint(S);
  };
  // A red tower's ball on a ship of the fleet: a point off its hull, and with none left it sinks, whoever is aboard
  // stood on the shipyard's quay.
  const hullHit = (s, w, b) => {
    const S = w.sail;
    if (S.sink >= 0) return;
    audio.hull(b.x, b.y, b.z);
    if (--S.hp > 0) { if (s.sail === w) hud.toast(S.hp === 1 ? "The hull is failing. One more hit will sink her." : "The ship is hit! Mend her at a glowing ring on her deck."); return; }
    S.hp = 0; S.sink = 0; S.v = S.w = 0; w.boom = 0; w.boomN = 0;
    audio.plunge(w.at.x, L.SEA, w.at.z);
    const cave = people && people.player, Q = L.SHIPYARD.quay;
    if (!cave) return;
    const p = cave.root.position, sn = Math.sin(w.at.yaw), cs = Math.cos(w.at.yaw), dx = p.x - w.at.x, dz = p.z - w.at.z, a = dx * sn + dz * cs, c = dx * cs - dz * sn;
    const helmed = S.seat.sitter === cave, aboard = helmed || (!cave.camp.seat && Math.abs(a) < w.at.bow && Math.abs(c) < L.shipHalf(w.at, a) + 0.3);
    if (!aboard) return;
    if (helmed) { S.seat.walkAt.x = Q.x1 - 3; S.seat.walkAt.z = L.WEST.z; S.seat.floor = L.SHIPYARD.y; S.seat.lockMovement = false; people.standPlayer(cave); helmDropped(w); }
    Object.assign(p, { x: Q.x1 - 3, y: cave.baseY + L.SHIPYARD.y, z: L.WEST.z }); cave.hop = 0; cave.hopV = 0;
    hud.toast("Your ship is sunk! You wash ashore at the shipyard.");
  };
  // The raiders (keep-layout.js `SHIPS`' `raider`). One comes out when whoever the towers would fire
  // on (`prey`) is within `wake` of its mooring and hunts them until they are `lose` from it: it closes to `near`,
  // then runs along beside them, and whenever they lie within `range` and `abeam` of square off one of its sides it
  // fires that side's loaded guns one after another (`ripple` apart, each `cool` s to load) at where they will be,
  // give or take `spread` m at 100 m, on the towers' own flight. By size (`large`, `small`): its `speed`, `accel`
  // and `turn`, the same as the Oogas' own ship of that size (`SAIL`), so neither outsails the other but by full sail.
  // A visitor's ball takes a point off its hull; at none it goes under over `sink` s and is back at its
  // mooring `respawn` s later. Nobody to hunt, it goes home.
  const RAID = { roam: 0.55, wake: 150, lose: 240, near: 34, range: 80, abeam: 0.5, ripple: 0.35, spread: 5, sink: 3.2, respawn: 180,
    large: { speed: SAIL.large.speed, accel: SAIL.large.accel, turn: SAIL.large.turn, cool: 6.5 }, small: { speed: SAIL.small.speed, accel: SAIL.small.accel, turn: SAIL.small.turn, cool: 5 } };
  // Cannon Basics (`QUESTS`' `cannon`): the visitor reaching the gallery of one of Outpost Island's towers starts it.
  // Its raiders (keep-layout.js `SHIPS`' `quest: "cannon"`) come in waves (their `wave`: three, one at a time), the
  // next `gap` s after the last of a wave is sunk, each put out at sea `spawn` m from the tower along the way its
  // gallery looks (a wave's two, were there two, `apart` across it), at `pace` of their usual speed. They never close on the tower: each comes in slantwise, turning
  // broadside on as it nears `stand`, keeping within `cone` of the gallery's way out, and fires each side as it bears within `range` (`abeam` of square), sailing on
  // all the while, and sheers off again if it comes nearer, turning the other way whenever the shore holds it. The
  // other towers hold their fire on them (`defendUpdate`). The tower takes `hp` of their balls: the last brings it
  // down, the quest goes back to its first step and the visitor is set down beside Leif. Out of the gallery for `away`
  // s, or the yard left, and the try is called off. While the quest wants the rowboat, taking one puts the two
  // escorts out beside it at once (`escortSnap`), and once it is done they are put back at their stations.
  const TOWER_QUEST = { pace: 0.55, hp: 12, spawn: 240, gap: 6, away: 4, apart: 50, stand: 85, range: 120, abeam: 0.7, cone: 0.55 };
  const CANNON_AT = { x: 0, z: 0, y: 0, yaw: 0, v: 0, on: true };
  const cannonTick = (s, dt) => {
    const cave = people && people.player, at = quests.stage("cannon");
    if (!cave || leaving) return;
    escortSnap(s, cave, at);
    const p = cave.root.position, here = L.galleryAt(p.x, p.z, p.y - cave.baseY);
    if (!s.cannon) {
      // A battle left over from a visit that ended mid-way starts over.
      if (at === "battle") quests.set("cannon", "tower");
      if (quests.stage("cannon") !== "tower" || !here || !here.outpost || !quests.advance("cannon", "battle")) return;
      s.cannon = { g: here, wave: 0, waves: 1 + Math.max(...s.cannonShips.map((w) => w.at.wave)), left: 0, hp: TOWER_QUEST.hp, next: 3, away: 0, live: false, ships: s.cannonShips };
      banner("Defend the tower", "Cannon Basics");
      if (audio) audio.quest();
      hud.toast("Raiders are coming for this tower! Man the cannon: press Space Bar beside it.");
      return;
    }
    const Q = s.cannon;
    if (here === Q.g || (s.manned && s.manned.t === Q.g)) Q.away = 0;
    else if ((Q.away += dt) > TOWER_QUEST.away) { s.cannon = null; quests.set("cannon", "tower"); hud.toast("You left the tower, and the raiders turn back. Climb an Outpost tower to try again."); return; }
    if (!Q.live && Q.next > 0 && (Q.next -= dt) <= 0) cannonSpawn(s);
  };
  // The escorts with the rowboat only while it is out on the water: once it is `start` from every dock they are put
  // out beside it at once (`L.dockDist`), and once it comes within `stop` of one they are put back at their stations.
  const ESCORT_DOCK = { start: 20, stop: 10 };
  const escortSnap = (s, cave, at) => {
    const f = s.ferry, rowing = f.state === "paddling" && f.seat.sitter === cave, wants = at === "tower" || at === "battle";
    const d = rowing ? L.dockDist(f.x, f.z) : 0, on = rowing && (s.escorting ? d > ESCORT_DOCK.stop : d >= ESCORT_DOCK.start);
    if (on && !s.escorting) {
      s.escorting = true;
      const hx = Math.sin(f.yaw), hz = Math.cos(f.yaw), px = hz, pz = -hx;
      s.escorts.forEach((w, i) => {
        const g = w.at;
        if (w.sail && (w.sail.away || w.sail.seat.sitter)) return;
        if (Math.hypot(g.x - f.x, g.z - f.z) < 60) return;
        const side = (i ? -1 : 1);
        for (const k of [1, 1.4, 1.9, 2.5]) {
          const x = f.x + hx * L.SHIP.ahead + px * side * L.SHIP.side * k, z = f.z + hz * L.SHIP.ahead + pz * side * L.SHIP.side * k;
          if (shipFoul(w, x, z, f.yaw, s) > 0) continue;
          g.x = x; g.z = z; g.yaw = f.yaw; w.vx = w.vz = 0; w.ttx = x; w.ttz = z; w.slot = side;
          BOMB_AT.x = x; BOMB_AT.y = L.SEA; BOMB_AT.z = z;
          ballPlunge(BOMB_AT, L.SEA);
          break;
        }
      });
      if (wants) hud.toast("Leif's escorts are with you. They'll fire on any raider that comes for you.");
    } else if (!on && s.escorting) {
      s.escorting = false;
      for (const w of s.escorts) { if (w.sail && (w.sail.away || w.sail.seat.sitter)) continue; const g = w.at; g.x = g.home.x; g.z = g.home.z; g.yaw = g.home.yaw; w.vx = w.vz = 0; w.ttx = g.x; w.ttz = g.z; }
    }
  };
  // The next wave out at sea off the tower, turned toward it, whole.
  const cannonSpawn = (s) => {
    const Q = s.cannon, wave = Q.ships.filter((w) => w.at.wave === Q.wave), sn = Math.sin(Q.g.yaw), cs = Math.cos(Q.g.yaw);
    wave.forEach((w, k) => {
      const g = w.at, R = w.raid, off = (k - (wave.length - 1) / 2) * TOWER_QUEST.apart;
      let d = TOWER_QUEST.spawn, x = 0, z = 0;
      for (; d > 80; d -= 10) { x = Q.g.x + sn * d + cs * off; z = Q.g.z + cs * d - sn * off; if (L.navigable(x, z)) break; }
      g.x = x; g.z = z; g.yaw = Math.atan2(Q.g.x - x, Q.g.z - z);
      R.sink = -1; R.hp = g.hull; R.v = 0; R.rip = -1; R.hunting = true; R.side = wave.length > 1 ? (k ? -1 : 1) : Math.random() < 0.5 ? -1 : 1; R.stuck = 0;
      for (const gun of R.guns) gun.wait = 0;
    });
    Q.live = true; Q.left = wave.length;
    hud.toast(wave.length > 1 ? `Wave ${Q.wave + 1} of ${Q.waves}: ${wave.length} raiders are coming!` : `Wave ${Q.wave + 1} of ${Q.waves}: a raider is coming!`);
  };
  const cannonSunk = (s) => {
    const Q = s && s.cannon;
    if (!Q) return;
    if (--Q.left > 0) { hud.toast("A raider is sunk! One more in this wave."); return; }
    Q.live = false; Q.wave++;
    if (Q.wave < Q.waves) { Q.next = TOWER_QUEST.gap; hud.toast(`Wave ${Q.wave} of ${Q.waves} sunk! More are coming.`); return; }
    s.cannon = null;
    if (quests.advance("cannon", "report")) { banner("Quest updated", "Every raider sunk"); if (audio) audio.quest(); hud.toast("Every raider is sunk! Go back to Leif at the shipyard."); }
  };
  // A raider's ball on the held tower; with none left it falls, and the try with it.
  const cannonHit = (s, b) => {
    const Q = s.cannon;
    if (--Q.hp > 0) { hud.toast(Q.hp <= 3 ? "The tower can't take much more!" : "Your tower is hit!"); return; }
    BOMB_AT.x = Q.g.x; BOMB_AT.y = Q.g.floor + 2; BOMB_AT.z = Q.g.z;
    ballBlast(BOMB_AT, 1.8);
    s.cannon = null;
    quests.set("cannon", "tower");
    leaveCannon();
    const cave = people && people.player, leif = L.GUARDS.find((q) => q.kind === "captain");
    if (cave && leif) {
      const x = leif.x + Math.sin(leif.yaw) * 2.2, z = leif.z + Math.cos(leif.yaw) * 2.2, p = cave.root.position;
      Object.assign(p, { x, y: cave.baseY + L.supportAt(x, z, leif.y + 2, bridgeDown(), gateUp()), z });
      cave.root.rotation.y = leif.yaw + Math.PI; cave.hop = 0; cave.hopV = 0;
      s.safe.x = p.x; s.safe.y = p.y - cave.baseY; s.safe.z = p.z; s.wet = 0;
    }
    banner("Quest failed", "The tower fell");
    hud.toast("Leif hauled you back to the shipyard. Row to Outpost and climb a tower to try again.");
  };
  const raidFire = (s, w, gun, T) => {
    const b = s.balls.find((q) => !q.on && q.flash <= 0);
    if (!b) return;
    const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), gx = g.x + sn * gun.a + cs * gun.c, gz = g.z + cs * gun.a - sn * gun.c, gy = w.node.position.y + gun.y;
    // Where they will be when the ball lands, thrown off a little.
    const d0 = Math.hypot(T.x - gx, T.z - gz), lift0 = towerLift(d0, T.y - gy), time = Number.isNaN(lift0) ? 0 : d0 / (TOWER.speed * Math.cos(lift0));
    const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * RAID.spread * d0 / 100;
    const tx = T.x + Math.sin(T.yaw) * T.v * time + Math.cos(a) * m, tz = T.z + Math.cos(T.yaw) * T.v * time + Math.sin(a) * m, flat = Math.hypot(tx - gx, tz - gz), lift = towerLift(Math.max(4, flat), T.y + 0.4 - gy);
    if (Number.isNaN(lift)) return;
    const dx = (tx - gx) / (flat || 1), dz = (tz - gz) / (flat || 1), ce = Math.cos(lift), se = Math.sin(lift), out = KM.CANNON.muzzle * gun.size;
    b.on = true; b.t = 0; b.trail = 0; b.from = w.raid.from; b.hostile = true;
    b.x = gx + dx * ce * out; b.y = gy + se * out; b.z = gz + dz * ce * out; b.vx = dx * ce * TOWER.speed; b.vy = se * TOWER.speed; b.vz = dz * ce * TOWER.speed;
    b.node.visible = true;
    gun.wait = w.raid.C.cool;
    audio.cannon(b.x, b.y, b.z);
    for (let i = 0; i < 8; i++) fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
  };
  // The rowboat's escorts in its defence (`shipUpdate`): each raider that has the rowboat for its mark (hunting it
  // while it is rowed and no ship of ours is sailed) draws them off their places to lie `stand` off its side toward the
  // boat, a ship's length apart, and fire on it each gun on the side it lies off in turn within `range`, a gun loading
  // `cool` s, the Oogas' own ball (never hostile, so it harms nobody of ours).
  const DEFEND_ESCORT = { range: 90, stand: 24, apart: 14, cool: 5, ripple: 0.35 };
  /** The raider attacking the rowboat nearest (x, z), or null. */
  const attackerNear = (s, x, z) => {
    let best = null, bd = Infinity;
    for (let i = 0; i < s.raiders.length; i++) {
      const r = s.raiders[i], R = r.raid;
      if (R.sink >= 0 || !R.hunting) continue;
      const d = Math.hypot(r.at.x - x, r.at.z - z);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  const ESCORT_FROM = { ship: true };
  /** An escort `w`'s guns on the side the raider `m` lies off, fired one after another when loaded and in range. */
  const escortGuns = (s, w, m, dt) => {
    const g = w.at;
    if (!w.eguns) w.eguns = g.guns.map(([a, c, y, size]) => ({ a, c, y, size, side: c > 0 ? 1 : -1, wait: Math.random() * DEFEND_ESCORT.cool }));
    for (let i = 0; i < w.eguns.length; i++) if (w.eguns[i].wait > 0) w.eguns[i].wait = Math.max(0, w.eguns[i].wait - dt);
    if (!m) return;
    const sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), dx = m.at.x - g.x, dz = m.at.z - g.z, d = Math.hypot(dx, dz);
    if (d > DEFEND_ESCORT.range) return;
    const side = dx * cs - dz * sn > 0 ? 1 : -1;
    if ((w.eripT = (w.eripT || 0) - dt) > 0) return;
    const T = TOWER_AT2;
    T.x = m.at.x; T.z = m.at.z; T.yaw = m.at.yaw; T.v = m.raid.v; T.y = L.SEA + 1.2;
    for (let i = 0; i < w.eguns.length; i++) {
      const gun = w.eguns[i];
      if (gun.side !== side || gun.wait > 0) continue;
      escortFire(s, w, gun, T);
      w.eripT = DEFEND_ESCORT.ripple;
      return;
    }
  };
  const TOWER_AT2 = { x: 0, y: 0, z: 0, yaw: 0, v: 0 };
  const escortFire = (s, w, gun, T) => {
    const b = s.balls.find((q) => !q.on && q.flash <= 0);
    if (!b) return;
    const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), gx = g.x + sn * gun.a + cs * gun.c, gz = g.z + cs * gun.a - sn * gun.c, gy = w.node.position.y + gun.y;
    const d0 = Math.hypot(T.x - gx, T.z - gz), lift0 = towerLift(d0, T.y - gy), time = Number.isNaN(lift0) ? 0 : d0 / (TOWER.speed * Math.cos(lift0));
    const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * RAID.spread * d0 / 100;
    const tx = T.x + Math.sin(T.yaw) * T.v * time + Math.cos(a) * m, tz = T.z + Math.cos(T.yaw) * T.v * time + Math.sin(a) * m, flat = Math.hypot(tx - gx, tz - gz), lift = towerLift(Math.max(4, flat), T.y - gy);
    if (Number.isNaN(lift)) return;
    const dx = (tx - gx) / (flat || 1), dz = (tz - gz) / (flat || 1), ce = Math.cos(lift), se = Math.sin(lift), out = KM.CANNON.muzzle * gun.size;
    b.on = true; b.t = 0; b.trail = 0; b.from = ESCORT_FROM; b.hostile = false;
    b.x = gx + dx * ce * out; b.y = gy + se * out; b.z = gz + dz * ce * out; b.vx = dx * ce * TOWER.speed; b.vy = se * TOWER.speed; b.vz = dz * ce * TOWER.speed;
    b.node.visible = true;
    gun.wait = DEFEND_ESCORT.cool;
    audio.cannon(b.x, b.y, b.z);
    for (let i = 0; i < 8; i++) fx.spawnParticle(FIRE_BITS[i % FIRE_BITS.length], b.x, b.y, b.z, b.vx * 0.12 + (Math.random() - 0.5) * 3, b.vy * 0.12 + (Math.random() - 0.5) * 3, b.vz * 0.12 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, 6, 2, -100);
  };
  // A wandering raider's next point: somewhere in its box of water deep enough for it, clear of everything built, and
  // never between the portal's islet and the castle island; given up for another after `WANDER.give` s.
  const WANDER = { tries: 24, deep: 4, give: 75, clear: 40 };
  const wanderTo = (g, R) => {
    const W = g.wander;
    R.goalFor = WANDER.give;
    for (let i = 0; i < WANDER.tries; i++) {
      const x = W.x0 + Math.random() * (W.x1 - W.x0), z = W.z0 + Math.random() * (W.z1 - W.z0);
      if (L.wanderOut(x, z) || L.heightAt(x, z) > L.SEA - WANDER.deep || !L.hullClear(x, z) || Math.hypot(x - g.x, z - g.z) < WANDER.clear) continue;
      R.goal = [x, z]; return;
    }
    R.goal = [g.roam[0][0], g.roam[0][1]];
  };
  const raidStep = (s, w, dt) => {
    const g = w.at, R = w.raid, C = R.C, H = g.home;
    let T = prey(s);
    // Cannon Basics' raiders: on the water only while their own wave is under way, and then for the tower the visitor
    // holds, whoever else is about (`cannonSpawn` puts each out at sea).
    if (g.quest === "cannon") {
      const Q = s.cannon, live = !!Q && Q.live && Q.wave === g.wave;
      if (!live && R.sink < 0) { R.sink = RAID.sink + 1; g.x = H.x; g.z = 5000; R.v = 0; R.rip = -1; R.hunting = false; }
      if (live) { const A = CANNON_AT; A.x = Q.g.x; A.z = Q.g.z; A.y = Q.g.floor + 1.5; A.yaw = 0; A.v = 0; A.on = true; T = A; }
    }
    // A quest's raider is on the water only while that quest wants her: gone otherwise, and whole at her station when
    // it does.
    else if (g.quest) {
      const wanted = redWanted() && !world.keepRedSunk.includes(s.redShips.indexOf(w));
      if (!wanted && R.sink < 0) { R.sink = RAID.sink + 1; g.x = H.x; g.z = 5000; R.v = 0; R.rip = -1; R.hunting = false; }
      else if (wanted && R.sink > RAID.sink) { g.x = H.x; g.z = H.z; g.yaw = H.yaw; R.sink = -1; R.hp = g.hull; R.v = 0; R.hunting = false; }
    }
    // Sunk: under, then gone from the water, then back at its mooring.
    if (R.sink >= 0) {
      R.sink += dt;
      if (R.sink > RAID.sink && g.z < 4000) { g.x = H.x; g.z = 5000; }
      if (!g.quest && R.sink > RAID.sink + RAID.respawn) { g.x = H.x; g.z = H.z; g.yaw = H.yaw; R.sink = -1; R.hp = g.hull; R.v = 0; R.hunting = false; R.leg = 1; }
      return;
    }
    for (let i = 0; i < R.guns.length; i++) if (R.guns[i].wait > 0) R.guns[i].wait = Math.max(0, R.guns[i].wait - dt);
    // A roamer comes for whoever sails near where it is now, a moored one for whoever nears its mooring.
    const from = g.roam ? g : H;
    R.hunting = g.quest === "cannon" || T.on && Math.hypot(T.x - from.x, T.z - from.z) < (R.hunting ? RAID.lose : g.wake || RAID.wake);
    const dx = T.x - g.x, dz = T.z - g.z, d = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
    let rel = bearing - g.yaw; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    let wantYaw = H.yaw, speed = 0;
    if (R.hunting && g.quest === "cannon") {
      // Standing off the tower: slantwise in, broadside on near `stand`, sheering off nearer than that, the other way
      // round whenever the shore holds it.
      // It keeps within `cone` of the way the gallery looks out, where the tower's cannon can bear on it: past half
      // of that it turns back toward the middle, and outside it altogether it makes straight for the middle line.
      const Q = TOWER_QUEST, G = s.cannon.g, a = L.galleryAngle(G, g.x, g.z), off = d > Q.stand ? Math.PI / 2 * clamp(1 - (d - Q.stand) / 150, 0.35, 1) : Math.PI / 2 + clamp((Q.stand - d) / 30, 0, 0.7);
      if (Math.abs(a) > Q.cone) {
        const mx = G.x + Math.sin(G.yaw) * Q.stand, mz = G.z + Math.cos(G.yaw) * Q.stand;
        wantYaw = Math.atan2(mx - g.x, mz - g.z);
      } else {
        if (Math.abs(a) > Q.cone * 0.5) {
          // The side whose way along takes it back toward the middle.
          const y = bearing - off;
          R.side = Math.abs(L.galleryAngle(G, g.x + Math.sin(y) * 10, g.z + Math.cos(y) * 10)) < Math.abs(a) ? 1 : -1;
          R.stuck = 0;
        }
        wantYaw = bearing - R.side * off;
      }
      speed = C.speed * Q.pace;
    } else if (R.hunting) {
      // Closing, then running along beside them on whichever side they already lie.
      wantYaw = d > RAID.near ? bearing : bearing - (rel > 0 ? 1 : -1) * Math.PI / 2; speed = d > RAID.near ? C.speed : C.speed * 0.6;
    } else if (g.wander) {
      // Wandering: on to a point picked at random in its water, and another once there, or after a while, as when
      // something stands in its way.
      if (!R.goal || (R.goalFor -= dt) <= 0 || Math.hypot(R.goal[0] - g.x, R.goal[1] - g.z) < 16) wanderTo(g, R);
      wantYaw = Math.atan2(R.goal[0] - g.x, R.goal[1] - g.z); speed = C.speed * RAID.roam;
    } else if (g.roam) {
      // Its round, a point at a time, at an easy pace.
      const P = g.roam[R.leg % g.roam.length], pd = Math.hypot(P[0] - g.x, P[1] - g.z);
      if (pd < 16) R.leg = (R.leg + 1) % g.roam.length;
      wantYaw = Math.atan2(P[0] - g.x, P[1] - g.z); speed = C.speed * RAID.roam;
    } else {
      const hd = Math.hypot(H.x - g.x, H.z - g.z);
      if (hd > 4) { wantYaw = Math.atan2(H.x - g.x, H.z - g.z); speed = Math.min(C.speed * 0.7, hd * 0.4 + 0.6); }
    }
    let gap = wantYaw - g.yaw; gap = Math.atan2(Math.sin(gap), Math.cos(gap));
    const goal = speed * Math.max(0.25, Math.cos(gap));
    R.v += clamp(goal - R.v, -C.accel * dt, C.accel * dt);
    const turn = clamp(gap * 1.5, -C.turn, C.turn) * (0.4 + 0.6 * Math.min(1, Math.abs(R.v) / C.speed));
    const wasX = g.x, wasZ = g.z;
    if (R.v !== 0 || turn !== 0) {
      const ny = g.yaw + turn * dt, nx = g.x + Math.sin(ny) * R.v * dt, nz = g.z + Math.cos(ny) * R.v * dt, was = sailFoul(w, g.x, g.z, g.yaw, s) + 1e-6;
      if (sailFoul(w, nx, nz, ny, s) <= was) { g.x = nx; g.z = nz; g.yaw = ny; }
      else if (sailFoul(w, nx, nz, g.yaw, s) <= was) { g.x = nx; g.z = nz; }
      else if (sailFoul(w, g.x, g.z, ny, s) <= was) { g.yaw = ny; R.v *= Math.max(0, 1 - 3 * dt); }
      else R.v *= Math.max(0, 1 - 3 * dt);
    }
    // Held up against the shore while standing off the tower: it turns the other way round.
    if (g.quest === "cannon" && R.hunting) { R.stuck = Math.hypot(g.x - wasX, g.z - wasZ) < C.speed * 0.15 * dt ? (R.stuck || 0) + dt : 0; if (R.stuck > 1.5) { R.side = -R.side; R.stuck = 0; } }
    // A broadside from the side they lie off, one gun after another.
    const reach = g.quest === "cannon" ? TOWER_QUEST.range : RAID.range, abeam = g.quest === "cannon" ? TOWER_QUEST.abeam : RAID.abeam;
    if (R.rip < 0 && R.hunting && s.screen.t <= 0 && d < reach && Math.abs(Math.abs(rel) - Math.PI / 2) < abeam) {
      const side = rel > 0 ? 1 : -1;
      for (let i = 0; i < R.guns.length; i++) if (R.guns[i].side === side && R.guns[i].wait <= 0) { R.rip = 0; R.ripSide = side; R.ripT = 0; break; }
    }
    if (R.rip >= 0) {
      R.ripT -= dt;
      while (R.ripT <= 0 && R.rip < R.guns.length) {
        const gun = R.guns[R.rip++];
        if (gun.side !== R.ripSide || gun.wait > 0) continue;
        if (R.hunting) raidFire(s, w, gun, T);
        R.ripT += RAID.ripple;
      }
      if (R.rip >= R.guns.length) R.rip = -1;
    }
  };
  // A visitor's ball on a raider: a point off its hull, and with none left it sinks.
  const raidHit = (s, w, b) => { if (w.raid.sink < 0) { audio.hull(b.x, b.y, b.z); raidDamage(w, 1); } };
  // `n` points off a raider's hull, however they are taken; with none left it sinks.
  const raidDamage = (w, n) => {
    const R = w.raid;
    if (R.sink >= 0) return;
    R.hp -= n;
    if (R.hp > 0.01) { hud.toast(R.hp <= 1 ? "The raider is nearly done for!" : "A hit on the raider!"); return; }
    R.hp = 0; R.sink = 0; R.v = 0; R.rip = -1; w.boom = 0; w.boomN = 0;
    audio.plunge(w.at.x, L.SEA, w.at.z);
    if (w.at.quest === "cannon") { cannonSunk(scene); return; }
    // Leif's raider: her sinking is what his quest asks.
    if (w.at.quest === "sails" && scene) {
      if (quests.stage("sails") === "helm") quests.advance("sails", "hunt");
      const i = scene.redShips.indexOf(w);
      if (quests.stage("sails") === "hunt" && !world.keepRedSunk.includes(i)) world.keepRedSunk.push(i);
      const left = scene.redShips.length - world.keepRedSunk.length;
      if (left > 0) { hud.toast(`A red-sailed ship is sunk! ${left} more to go.`); return; }
      if (quests.advance("sails", "report")) { world.keepRedSunk = []; banner("Quest updated", "Red Sails are sunk"); if (audio) audio.quest(); hud.toast("All three red-sailed ships are sunk! Sail back to the shipyard and tell Leif."); return; }
    }
    hud.toast("The raider is sunk!");
  };
  // A ship's own four, in place of her helmsman's weapons down the left of the screen (`#keep-ship`, keys 1 to 4),
  // each working `time` s (0: at once) and then not to be had again for `cool` s, counted down on its button:
  // full sail (`gain` times her speed, gathered `haste` times as fast); a quick repair (`part` of her hull back at
  // once, never past whole); a smoke screen (`puffs` plumes of black smoke laid `wide` either way across the line to
  // the nearest enemy, a raider before a red tower, `off` of the way to it and no nearer than `near` nor further than
  // `far`, each swelling from `size[0]` to `size[1]` m; while it hangs neither the raiders nor the towers fire); and
  // ramming (full ahead at `gain` times her speed, her helm stiff, until her bow comes within `touch` of a raider's
  // hull, which takes `part` of its hull off it and rolls it, or the time runs out).
  const SHIP_ACTS = [
    { id: "sail", time: 7, cool: 30, gain: 1.7, haste: 2.5 },
    { id: "mend", time: 0, cool: 180, part: 0.5 },
    { id: "smoke", time: 7, cool: 120, puffs: 14, wide: 30, off: 0.4, near: 16, far: 38, size: [9, 24] },
    { id: "ram", time: 3.5, cool: 30, gain: 2.3, haste: 4, touch: 3.6, part: 0.2, stiff: 0.35 }
  ];
  let shipEl = null;
  const SHIP_ICONS = ["sail", "repair", "smoke", "ram"];
  const shipBar = (w) => {
    if (!shipEl) {
      shipEl = { root: document.getElementById("keep-ship"), arms: document.getElementById("keep-arms"), acts: [...document.querySelectorAll("#keep-ship .keep-ship-act")], shown: [] };
      shipEl.root.addEventListener("click", (e) => { const b = e.target.closest(".keep-ship-act"); if (b && scene && scene.sail) { shipAct(scene, scene.sail, +b.dataset.act); b.blur(); } });
      // The ship's four in the land's art (keep-icon-data.js), in place of their drawn pictures, laid as every icon is.
      shipEl.acts.forEach((b, i) => { const id = SHIP_ICONS[i], old = b.querySelector(".keep-arm-picture"); if (old && BL.keepIcons && BL.keepIcons[id]) old.replaceWith(picture(id, 70)); });
      // Over each icon's circle, a pie of the time left: orange while it works, dark while it cannot be used again.
      shipEl.pies = shipEl.acts.map((b) => { const pie = document.createElement("i"); pie.className = "keep-ship-pie"; pie.setAttribute("aria-hidden", "true"); b.querySelector(".keep-arm-picture").append(pie); return pie; });
      shipEl.pieShown = [];
    }
    shipEl.root.hidden = !w;
    if (w) { shipEl.arms.dataset.helm = "true"; arms.fold(); } else delete shipEl.arms.dataset.helm;
    // At a helm the column is the ship's: the bananas and the player's health stand aside until they leave it.
    document.getElementById("keep-bananas").hidden = document.getElementById("keep-health").hidden = !!w;
    shipEl.shown.length = 0; shipEl.pieShown.length = 0;
  };
  // Each button's state and count, and its pie of the time left (`--left`, 0 to 1, in 200ths), written only when what it
  // reads changes.
  const shipPaint = (S) => {
    for (let i = 0; i < SHIP_ACTS.length; i++) {
      const a = S.acts[i], A = SHIP_ACTS[i], left = a.on > 0 ? a.on / A.time : a.wait > 0 ? a.wait / A.cool : 0, q = Math.ceil(left * 200);
      if (shipEl.pieShown[i] !== q) { shipEl.pieShown[i] = q; shipEl.pies[i].style.setProperty("--left", String(q / 200)); }
      const key = a.on > 0 ? -1 : Math.ceil(a.wait);
      if (shipEl.shown[i] === key) continue;
      shipEl.shown[i] = key;
      const el = shipEl.acts[i];
      el.dataset.state = key < 0 ? "on" : key > 0 ? "wait" : "ready";
      el.querySelector("b").textContent = key > 0 ? (key >= 60 ? `${Math.floor(key / 60)}:${String(key % 60).padStart(2, "0")}` : String(key)) : "";
    }
  };
  const shipAct = (s, w, i) => {
    const S = w.sail, A = SHIP_ACTS[i], a = S.acts[i], g = w.at;
    if (!A || leaving || S.sink >= 0 || S.cast > 0) return;
    if (a.on > 0) return;
    if (a.wait > 0) { hud.hint(`Not yet: ${Math.ceil(a.wait)} s`, 1600); return; }
    if (A.id === "mend") {
      if (S.hp >= g.hull) { hud.hint("Her hull is whole", 1800); return; }
      S.hp = Math.min(g.hull, S.hp + Math.ceil(g.hull * A.part)); world.keepFleet = keptFleet();
      audio.hammer(g.x, L.SEA + g.helm.y, g.z);
      hud.toast(`Quick repair: hull ${S.hp} of ${g.hull}`);
      a.wait = A.cool;
      return;
    }
    if (A.id === "smoke") layScreen(s, w);
    else if (A.id === "sail") hud.toast("Full sail!");
    else hud.toast("Ramming speed!");
    a.on = A.time;
  };
  // The fleet's four counted down each frame, whoever is at a helm: what works runs out and then waits.
  const shipActs = (s, dt) => {
    for (let k = 0; k < s.fleet.length; k++) {
      const acts = s.fleet[k].sail.acts;
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        if (a.on > 0) { a.on -= dt; if (a.on <= 0) { a.on = 0; a.wait = SHIP_ACTS[i].cool; } }
        else if (a.wait > 0) a.wait = Math.max(0, a.wait - dt);
      }
    }
    if (s.sail) shipPaint(s.sail.sail);
  };
  // The smoke screen laid from the ship `w`: across the line to the nearest enemy, part of the way to it.
  const layScreen = (s, w) => {
    const A = SHIP_ACTS[2], g = w.at, Sc = s.screen;
    let ex = w.sail.tx, ez = w.sail.tz, best = 320;
    for (const r of s.raiders) { const d = Math.hypot(r.at.x - g.x, r.at.z - g.z); if (r.raid.sink < 0 && d < best) { best = d; ex = r.at.x; ez = r.at.z; } }
    if (best >= 320) { best = 240; for (const c of s.reds) { const d = Math.hypot(c.t.x - g.x, c.t.z - g.z); if (c.dead < 0 && d < best) { best = d; ex = c.t.x; ez = c.t.z; } } }
    const dx = ex - g.x, dz = ez - g.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, off = clamp(d * A.off, A.near, A.far) + g.beam, cx = g.x + ux * off, cz = g.z + uz * off;
    Sc.t = A.time;
    Sc.puffs.forEach((q, i) => {
      const along = (i / (Sc.puffs.length - 1) - 0.5) * 2 * (A.wide + g.bow * 0.4) + (Math.random() - 0.5) * 5, out = (Math.random() - 0.5) * 7;
      q.x = cx - uz * along + ux * out; q.z = cz + ux * along + uz * out; q.y = L.SEA + 4 + Math.random() * 6; q.t = -Math.random() * 0.5; q.spin = (Math.random() - 0.5) * 0.5; q.rise = 0.5 + Math.random() * 0.8;
    });
    audio.plunge(cx, L.SEA, cz);
    hud.toast("Smoke screen! They cannot see to fire.");
  };
  // The screen's plumes: swelling fast, hanging while it lasts, thinning away after.
  const screenUpdate = (s, dt) => {
    const Sc = s.screen, A = SHIP_ACTS[2];
    if (Sc.t <= -3) return;
    Sc.t -= dt;
    for (let i = 0; i < Sc.puffs.length; i++) {
      const q = Sc.puffs[i], n = q.n;
      q.t += dt;
      if (q.t < 0 || Sc.t <= -3) { n.visible = false; continue; }
      const grow = 1 - Math.exp(-q.t * 1.6), fade = Sc.t > 0 ? 1 : Math.max(0, 1 + Sc.t / 3), size = A.size[0] + (A.size[1] - A.size[0]) * grow;
      n.visible = fade > 0; n.position.x = q.x; n.position.y = q.y + q.rise * q.t; n.position.z = q.z; n.scale.x = n.scale.y = size; n.smokeOpacity = Math.min(1, q.t * 3) * fade;
      faceView(n); n.rotation.z = q.spin * q.t;
    }
  };
  // Ramming: her bow against a raider's hull.
  const RAM_PART = 0.25;
  const ramCheck = (s, w) => {
    const S = w.sail, a = S.acts[3], A = SHIP_ACTS[3], g = w.at;
    if (a.on <= 0) return;
    const bx = g.x + Math.sin(g.yaw) * g.bow, bz = g.z + Math.cos(g.yaw) * g.bow;
    for (const r of s.raiders) {
      const o = r.at;
      if (r.raid.sink >= 0) continue;
      const dx = bx - o.x, dz = bz - o.z, sn = Math.sin(o.yaw), cs = Math.cos(o.yaw), along = dx * sn + dz * cs, across = dx * cs - dz * sn;
      if (Math.abs(along) > o.bow + A.touch || Math.abs(across) > L.shipHalf(o, clamp(along, -o.bow * 0.98, o.bow * 0.98)) + A.touch) continue;
      a.on = 0; a.wait = A.cool;
      S.v *= 0.25;
      r.heelV += (across >= 0 ? -1 : 1) * HEEL.kick * 3; r.raid.v *= 0.3; w.heelV += (Math.random() < 0.5 ? -1 : 1) * HEEL.kick * 0.8;
      audio.ram(bx, L.SEA + 1, bz); audio.blast(bx, L.SEA + 1, bz, 0.7);
      s.foes.rumble(0.7);
      for (let i = 0; i < 22; i++) { const d = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 7; fx.spawnParticle(KM.smash().rocks[i % KM.smash().rocks.length], bx, L.SEA + 1.2, bz, Math.cos(d) * sp, 3 + Math.random() * 6, Math.sin(d) * sp, 1 + Math.random() * 0.6, 8, 14, L.SEA); }
      for (let i = 0; i < 14; i++) { const d = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4; fx.spawnParticle(WATER_BITS[i % WATER_BITS.length], bx, L.SEA + 0.2, bz, Math.cos(d) * sp, 4 + Math.random() * 5, Math.sin(d) * sp, 0.9 + Math.random() * 0.5, 5, 14, L.SEA); }
      // A quarter of a hull her own size: more off a smaller ship, less off a greater one.
      raidDamage(r, g.hull * RAM_PART);
      return;
    }
  };
  // Mending a ship of the fleet: stood on her deck, away from the wheel, a visitor works on her hull, a point back
  // every `each` s, until she is whole, they walk off or take a seat, or she goes under.
  // Rings glow about the deck of a ship that wants mending (keep-layout.js `ship.mend`), a light standing up out of
  // each and a mallet turning over it, and the work is done standing within `reach` of any one of them, a mallet in
  // hand.
  const REPAIR = { each: 5, knock: 0.5, reach: 1.9, ring: 2.4 };
  // The ship of the fleet whose deck a body at (x, z) with its feet at `feet` stands on, or null.
  const deckOf = (s, x, z, feet) => {
    for (let i = 0; i < s.fleet.length; i++) {
      const w = s.fleet[i], g = w.at, dx = x - g.x, dz = z - g.z, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), a = dx * sn + dz * cs, c = dx * cs - dz * sn;
      if (Math.abs(a) < g.bow && Math.abs(c) < L.shipHalf(g, a) && Math.abs(feet - L.SEA - g.helm.y) < 6) return w;
    }
    return null;
  };
  // The mending place of the ship `w` nearest (x, z) with feet at `feet`, where it lies now into `RING_AT`; false
  // when none is within reach.
  const RING_AT = { x: 0, z: 0 };
  const ringAt = (w, x, z, feet) => {
    const g = w.at, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw), reach = REPAIR.reach * Math.max(0.6, w.sail.hs);
    let best = reach;
    for (let i = 0; i < w.sail.mend.length; i++) {
      const q = w.sail.mend[i], rx = g.x + sn * q.a + cs * q.c, rz = g.z + cs * q.a - sn * q.c, d = Math.hypot(x - rx, z - rz);
      if (d < best && Math.abs(feet - L.SEA - q.y) < 1.5) { best = d; RING_AT.x = rx; RING_AT.z = rz; }
    }
    return best < reach;
  };
  const nearRepair = (x, z, feet) => {
    if (!scene || !scene.fleet) return null;
    const w = deckOf(scene, x, z, feet);
    if (!w || w.sail.hp >= w.at.hull || w.sail.sink >= 0) return null;
    return ringAt(w, x, z, feet) ? w : null;
  };
  const toggleRepair = (w) => {
    const R = scene.repair;
    if (R.w) { R.w = null; hud.toast("You leave the hull as it is."); return true; }
    R.w = w; R.t = 0; R.knock = 0; R.told = -1;
    return true;
  };
  const repairUpdate = (s, dt, elapsed) => {
    const R = s.repair, w = R.w, cave = people && people.player;
    if (!w) return;
    const p = cave && cave.root.position, axes = pilot.controls.axes;
    if (!cave || leaving || cave.camp.seat || w.sail.sink >= 0 || Math.hypot(axes.x, axes.y) > 0.25 || deckOf(s, p.x, p.z, p.y - cave.baseY) !== w) { R.w = null; return; }
    // Turned to the ring while they work.
    if (ringAt(w, p.x, p.z, p.y - cave.baseY)) { const dx = RING_AT.x - p.x, dz = RING_AT.z - p.z; if (Math.hypot(dx, dz) > 0.25) { let gap = Math.atan2(dx, dz) - cave.root.rotation.y; gap = Math.atan2(Math.sin(gap), Math.cos(gap)); cave.root.rotation.y += clamp(gap, -4 * dt, 4 * dt); } }
    R.t += dt;
    if ((R.knock -= dt) <= 0) {
      R.knock = REPAIR.knock;
      audio.hammer(p.x, p.y, p.z);
      fx.spawnParticle(KM.smash().dust[0], p.x + Math.sin(cave.root.rotation.y) * 0.6, p.y - cave.baseY + 0.4, p.z + Math.cos(cave.root.rotation.y) * 0.6, (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8, 0.5, 2.5, 3, -100);
    }
    const left = Math.ceil(REPAIR.each - R.t);
    if (left !== R.told) { R.told = left; hud.hint(`Mending the hull: ${left} s to the next point (${w.sail.hp} of ${w.at.hull})`, 1500); }
    if (R.t < REPAIR.each) return;
    R.t = 0; w.sail.hp++; world.keepFleet = keptFleet();
    if (w.sail.hp >= w.at.hull) { R.w = null; hud.toast("The hull is whole again."); }
    else hud.toast(`Hull mended: ${w.sail.hp} of ${w.at.hull}`);
  };
  // Whoever mends a hull swings a mallet arm, after the pilot has posed them for the frame.
  const repairPose = (s, elapsed) => {
    const R = s.repair, cave = R.w && people && people.player, P = cave && cave.parts;
    if (R.mallet) R.mallet.visible = !!cave;
    // The mending places: on every ship that is hurt, each ring beating, its light breathing and its mallet turning.
    for (let i = 0; i < s.fleet.length; i++) {
      const w = s.fleet[i], want = w.sail.hp < w.at.hull && w.sail.sink < 0;
      for (let k = 0; k < w.sail.mend.length; k++) {
        const q = w.sail.mend[k];
        q.at.visible = want;
        if (!want) continue;
        const u = elapsed * 3.2 + q.phase, size = REPAIR.ring + Math.sin(u) * 0.2;
        q.ring.scale.x = q.ring.scale.y = size; q.ring.smokeOpacity = 0.85 + Math.sin(u) * 0.15;
        q.beam.smokeOpacity = 0.32 + Math.sin(u * 0.7) * 0.1; q.beam.rotation.y = elapsed * 0.6 + q.phase;
        q.tool.rotation.y = elapsed * 1.6 + q.phase; q.tool.position.y = 1.9 + Math.sin(u * 0.8) * 0.12;
      }
    }
    if (!cave || !P.armR) return;
    // Bent over the work, the mallet raised and brought down on each knock; the weapon they carry is out of sight.
    const beat = (elapsed % REPAIR.knock) / REPAIR.knock, swing = beat < 0.7 ? beat / 0.7 : 1 - (beat - 0.7) / 0.3;
    P.armR.rotation.x = -0.55 - swing * 1.25;
    if (P.forearmR) P.forearmR.rotation.x = -0.5 - swing * 0.5;
    if (P.torso) P.torso.rotation.x = 0.32;
    P.club.visible = P.gun.visible = false;
    if (P.chuk) P.chuk.visible = false;
    if (!R.mallet) R.mallet = createNode({ geometry: KM.mallet(), sightHidden: true });
    const hand = P.forearmR || P.armR;
    if (R.mallet.parent !== hand) { if (R.mallet.parent) removeChild(R.mallet.parent, R.mallet); addChild(hand, R.mallet); R.mallet.position.y = -cave.traits.height * (P.forearmR ? 0.2 : 0.36); R.mallet.rotation.x = Math.PI / 2; }
    R.mallet.visible = true;
  };
  const ESCORT_BACK = { after: 5, time: 3, speed: 3, slow: 0.4 };
  const ESCORT = { speed: 8, accel: 3, turn: 0.8, follow: 0.7, catch: 24, catchAccel: 8, catchTurn: 1.5, catchFrom: 20, hold: Math.PI / 4 };
  // How the great ships back out to their anchorage and come forward again: at most `speed`, gathering and losing way
  // at `accel`, so each eases out and in.
  const GUARD = { speed: 2.8, accel: 0.7 };
  // The great ships lie out toward the way in and back out to their anchorage as the rowboat comes. While someone
  // rows, the two small ones keep their places a little ahead of the rowboat the way it is going, each on its own side
  // of the channel (the one from the islet's left on the left), so when the boat turns about they come about where
  // they are and never cross; they come no nearer the quay than `SHIP.stop`, nor nearer the islet than its dock, and
  // once nobody rows they turn about and go home. Each steers for where it is going (turning to face its way before it gathers
  // way, and near there to the heading wanted), keeps pace with a place that moves, and heaves and rolls a little as
  // it goes, its fires with it.
  const shipUpdate = (s, dt, elapsed) => {
    // The escorts keep with the rowboat only while it is out on the water (`escortSnap`).
    const f = s.ferry, rowing = f.state === "paddling" && !!s.escorting;
    // Which way the boat is going (its bow, or its stern while it backs), changed only once it is truly under way the
    // other way, and the escorts' heading, eased round after it so a boat turning on the spot does not swing them
    // about; standing, they take its heading at once.
    if (Math.abs(f.v) > 0.8) s.dir = f.v > 0 ? 1 : -1;
    const travel = f.yaw + (s.dir < 0 ? Math.PI : 0);
    if (!rowing || s.formYaw === undefined) s.formYaw = travel;
    else { let gap = travel - s.formYaw; gap = Math.atan2(Math.sin(gap), Math.cos(gap)); s.formYaw += clamp(gap, -FORM_TURN * dt, FORM_TURN * dt); }
    const hx = Math.sin(s.formYaw), hz = Math.cos(s.formYaw), px = hz, pz = -hx;
    // The rowboat turning hard (its way more than `ESCORT.hold` off the escorts' heading): they stop going ahead and only
    // come round, until it is going their way again.
    let turnGap = travel - s.formYaw;
    turnGap = Math.atan2(Math.sin(turnGap), Math.cos(turnGap));
    const hold = rowing && Math.abs(turnGap) > ESCORT.hold;
    // A raider attacking the rowboat: the escorts go to defend it.
    const defending = rowing && !s.sail;
    // One on each side of it: each keeps the side it is on, the two changing sides only once they have truly passed
    // each other, so they never cross under the boat's bow as it turns about.
    if (s.escorts.length === 2) {
      const [a, b] = s.escorts, oa = (a.at.x - f.x) * px + (a.at.z - f.z) * pz, ob = (b.at.x - f.x) * px + (b.at.z - f.z) * pz;
      if (!a.slot) { a.slot = oa >= ob ? 1 : -1; b.slot = -a.slot; }
      else if ((oa - ob) * a.slot < -FORM_SWAP) { a.slot = -a.slot; b.slot = -b.slot; }
    }
    for (const w of s.ships) {
      const g = w.at, M = ESCORT;
      // A ship someone has taken, or left away from its duty, is sailed (`sailStep`), not about its duty.
      if (w.sail && (g.role === "docked" || w.sail.away)) sailStep(s, w, dt);
      else if (g.role === "escort") {
        let tx, tz, tyaw;
        const mark = defending ? attackerNear(s, f.x, f.z) : null;
        escortGuns(s, w, mark, dt);
        if (mark) {
          // Off the raider's side toward the boat, the two a ship's length apart, broadside on to it.
          const rx = f.x - mark.at.x, rz = f.z - mark.at.z, rd = Math.hypot(rx, rz) || 1, ux = rx / rd, uz = rz / rd, side = (w.slot || Math.sign(g.home.x)) * DEFEND_ESCORT.apart / 2;
          tx = mark.at.x + ux * DEFEND_ESCORT.stand - uz * side; tz = mark.at.z + uz * DEFEND_ESCORT.stand + ux * side; tyaw = Math.atan2(-uz, ux);
        } else if (rowing) {
          // A little ahead of it the way it is going and abreast of it, wherever it goes; a shore, a dock or a ship
          // holds it off (`shipFoul`) and it comes on again once the way is clear.
          const side = (w.slot || Math.sign(g.home.x)) * L.SHIP.side;
          tx = f.x + hx * L.SHIP.ahead + px * side; tz = f.z + hz * L.SHIP.ahead + pz * side; tyaw = s.formYaw;
        } else { tx = g.home.x; tz = g.home.z; tyaw = g.home.yaw; }
        // The place's own way, which the ship keeps up with (never more than its top speed, so a place that jumps, as
        // the rowing starts or stops, is only steered for).
        let tvx = dt > 0 ? (tx - w.ttx) / dt : 0, tvz = dt > 0 ? (tz - w.ttz) / dt : 0;
        const tv = Math.hypot(tvx, tvz);
        if (tv > M.speed) { tvx *= M.speed / tv; tvz *= M.speed / tv; }
        w.ttx = tx; w.ttz = tz;
        const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz), catching = rowing && d > M.catchFrom && !(hold && !mark), top = catching ? M.catch : M.speed;
        const k = Math.min(top, d * 0.5) / (d || 1);
        let wx = tvx + dx * k, wz = tvz + dz * k;
        // Steered round the rowboat rather than at it, as its place lies past the boat, and kept off the other escort.
        const bx = g.x - f.x, bz = g.z - f.z, bd = Math.hypot(bx, bz), clear = g.beam + 9;
        if (bd < clear && bd > 0.01) { const push = (clear - bd) * 0.7 / bd; wx += bx * push; wz += bz * push; }
        for (const o of s.escorts) {
          if (o === w) continue;
          const ox = g.x - o.at.x, oz = g.z - o.at.z, od = Math.hypot(ox, oz), apart = g.bow * 1.1;
          if (od < apart && od > 0.01) { const push = (apart - od) * 0.6 / od; wx += ox * push; wz += oz * push; }
        }
        const wv = Math.hypot(wx, wz);
        if (wv > top) { wx *= top / wv; wz *= top / wv; }
        // Far off it faces the way it goes, turning about before it gathers way (never going stern first); keeping its
        // place by the boat it holds the boat's heading, and going home it holds its own way in until it is there.
        // Held while the rowboat turns hard: no way ahead, only coming round to its heading.
        const still = hold && !mark;
        if (still) wx = wz = 0;
        const far = d > (rowing ? 6 : 1.5);
        let gap = (far && !still ? Math.atan2(wx, wz) : tyaw) - g.yaw;
        gap = Math.atan2(Math.sin(gap), Math.cos(gap));
        if (far && wv > 0.5) { const m = Math.max(0, Math.cos(gap)); wx *= m; wz *= m; }
        // Close by its place, little more than drifting into it, and never much stern first.
        else if (wv > 0.5) { let back = Math.atan2(wx, wz) - g.yaw; back = Math.atan2(Math.sin(back), Math.cos(back)); const m = Math.max(0.25, Math.cos(back)); wx *= m; wz *= m; }
        // Home, it comes to rest there before it turns to face the castle island.
        if (!far && !rowing) wx = wz = 0;
        // Backing off (`ESCORT_BACK`), it gathers no way ahead: the astern below has the helm alone.
        const accel = catching ? M.catchAccel : M.accel;
        if (!(w.backT > 0)) { w.vx += clamp(wx - w.vx, -accel * dt, accel * dt); w.vz += clamp(wz - w.vz, -accel * dt, accel * dt); }
        // Turning the short way round would swing its bow or stern onto something (a shore, most often): it comes round
        // the long way instead, and keeps at it until the short way and the long way agree. A turn it cannot make leaves
        // it free to move on as it heads.
        if (w.spin) { w.spinT -= dt; if (w.spinT <= 0 || Math.sign(gap) === w.spin) w.spin = 0; }
        const rate = catching ? M.catchTurn : rowing ? M.follow : M.turn, turn = w.spin ? w.spin * rate * dt : clamp(gap, -rate * dt, rate * dt), nx = g.x + w.vx * dt, nz = g.z + w.vz * dt, ny = g.yaw + turn;
        const was = shipFoul(w, g.x, g.z, g.yaw, s) + 1e-6, damp = Math.max(0, 1 - 3 * dt), fromX = g.x, fromZ = g.z;
        if (w.backT > 0) {
          // Backing off after being held up: astern, her bow coming round toward where she is going, then on again.
          w.backT -= dt;
          const bvx = -Math.sin(g.yaw) * ESCORT_BACK.speed, bvz = -Math.cos(g.yaw) * ESCORT_BACK.speed, bt = clamp(gap, -M.turn * dt, M.turn * dt);
          w.vx += clamp(bvx - w.vx, -M.accel * dt, M.accel * dt); w.vz += clamp(bvz - w.vz, -M.accel * dt, M.accel * dt);
          const bx = g.x + w.vx * dt, bz = g.z + w.vz * dt;
          if (shipFoul(w, bx, bz, g.yaw + bt, s) <= was) { g.x = bx; g.z = bz; g.yaw += bt; }
          else if (shipFoul(w, bx, bz, g.yaw, s) <= was) { g.x = bx; g.z = bz; }
          else if (shipFoul(w, g.x, g.z, g.yaw + bt, s) <= was) { g.yaw += bt; w.vx *= damp; w.vz *= damp; }
          else { w.vx *= damp; w.vz *= damp; w.backT = 0; }
        }
        else if (shipFoul(w, nx, nz, ny, s) <= was) { g.x = nx; g.z = nz; g.yaw = ny; }
        else if (shipFoul(w, nx, nz, g.yaw, s) <= was) { g.x = nx; g.z = nz; }
        else if (shipFoul(w, g.x, g.z, ny, s) <= was) { g.yaw = ny; w.vx *= damp; w.vz *= damp; }
        else if (turn !== 0 && shipFoul(w, g.x, g.z, g.yaw - Math.sign(turn) * rate * dt, s) <= was) {
          g.yaw -= Math.sign(turn) * rate * dt; w.spin = -Math.sign(turn); w.spinT = 4; w.vx *= damp; w.vz *= damp;
        } else { w.vx *= damp; w.vz *= damp; }
        // Held up `ESCORT_BACK.after` s on her way somewhere (making less than `slow` of way), she backs off for
        // `time` s and tries again.
        if (!(w.backT > 0)) {
          const going = far && !still && wv > 0.5;
          w.stuckT = going && Math.hypot(g.x - fromX, g.z - fromZ) < ESCORT_BACK.slow * dt ? (w.stuckT || 0) + dt : 0;
          if (w.stuckT > ESCORT_BACK.after) { w.stuckT = 0; w.backT = ESCORT_BACK.time; w.spin = 0; }
        }
      }
      else if (g.role === "raider") raidStep(s, w, dt);
      else if (g.role === "guard") {
        // Out toward the way in while the rowboat is further off than its own reach of the ship's line, backed out to its
        // anchorage once it comes nearer, and out again once it is away; a page that opens with the boat already near
        // finds it there. It draws back for a ship someone sails as it does for the rowboat.
        const tx = (s.sail ? s.sail.at.z : f.z) < g.home.z + g.reach ? g.home.x : g.fore;
        if (!w.placed) { g.x = tx; w.placed = true; }
        w.vx += clamp(clamp((tx - g.x) * 0.3, -GUARD.speed, GUARD.speed) - w.vx, -GUARD.accel * dt, GUARD.accel * dt);
        g.x += w.vx * dt;
      }
      const n = w.node, t = elapsed + w.phase, sn = Math.sin(g.yaw), cs = Math.cos(g.yaw);
      n.position.x = g.x; n.position.z = g.z; n.position.y = L.SEA + Math.sin(t * 0.4) * 0.16;
      n.rotation.y = g.yaw; n.rotation.z = Math.sin(t * 0.29) * 0.02; n.rotation.x = Math.sin(t * 0.23) * 0.009;
      // Going down, she blows up along her hull.
      if (w.boom >= 0) sinkBooms(w, dt);
      // Rolled by a blow, it rights itself.
      if (w.heel !== 0 || w.heelV !== 0) {
        w.heelV -= (w.heel * HEEL.spring + w.heelV * HEEL.damp) * dt; w.heel += w.heelV * dt;
        if (Math.abs(w.heel) < 1e-4 && Math.abs(w.heelV) < 1e-3) w.heel = w.heelV = 0;
        n.rotation.z += w.heel;
      }
      // A ship of the fleet sits lower for each hit its hull has taken, and sinking tips and goes under.
      if (w.sail) {
        const S = w.sail, under = S.sink < 0 ? 0 : S.sink / SAIL.sink;
        n.position.y -= (g.hull - S.hp) / g.hull * g.keel * SAIL.low * 3 + under * under * (g.keel + g.helm.y + 3);
        n.rotation.z += under * 0.6; n.rotation.x += under * 0.2;
        placeHelm(w);
      }
      // A raider sunk tips and goes under, and is gone until it comes back.
      if (w.raid && w.raid.sink >= 0) {
        const under = Math.min(1, w.raid.sink / RAID.sink);
        n.position.y -= under * under * (g.keel + g.helm.y + 4); n.rotation.z += under * 0.6; n.rotation.x += under * 0.2;
      }
      n.visible = !(w.raid && w.raid.sink > RAID.sink);
      for (const l of w.lights) { l.x = g.x + l.lx * cs + l.lz * sn; l.y = n.position.y + l.ly; l.z = g.z - l.lx * sn + l.lz * cs; }
    }
  };
  // The other players out on the water, each in a boat of their own under them (each page paddles its own): a player
  // whose Ooga sits low over deep water is paddling.
  const otherBoats = (s, elapsed) => {
    if (!s.others.length) return;
    let n = 0;
    for (const rec of BL.net.remotes.values()) {
      if (n >= s.others.length) break;
      // Anyone in the yard, whichever of its areas they report from (zone-map.js `offsetOf`, added back).
      if (!rec.body || !yardZone(rec.zone) || rec.poseZone !== rec.zone || !(rec.y < L.SEA + 2)) continue;
      const at = ZM.offsetOf(rec.zone), x = rec.x + at.x, z = rec.z + at.z;
      if (!L.seaAt(x, z) || L.shipTop(x, z) !== null || L.deckAt(x, z) !== null) continue;
      const o = s.others[n++], sn = Math.sin(rec.yaw), cs = Math.cos(rec.yaw);
      o.boat.visible = true;
      poseBoat(o, x - sn * BOAT.rower.z, L.SEA, z - cs * BOAT.rower.z, rec.yaw, elapsed + n * 1.7);
      row(o, (elapsed / STROKE + n * 0.3) % 1, 1);
    }
    for (let i = n; i < s.others.length; i++) s.others[i].boat.visible = false;
  };

  // Wakes: every boat under way (the rowboats, other players' boats and the ships) lays a trail of pale foam astern,
  // a puff every `trail` of its half beam travelled, each `size` of its half beam across growing to `spread` and fading
  // over `life` s plus `lifeBeam` s a metre of half beam, and throws a bow wave ahead: a puff either side of its stem
  // every `bow` of its half beam, pushed outward at `out` of its speed and fading over `bowLife` s, so the two lines
  // open into a V behind it. Each is as strong as its speed is to `full` m/s plus its half beam. Read from each boat's
  // node as it was posed this frame (its way along its heading), so whatever moves it, the wake follows. A fixed pool,
  // the oldest puff taken when all are out.
  const FOAM = { pool: 256, y: 0.12, min: 0.35, jump: 6, trail: 0.85, size: 2.2, spread: 4.5, life: 2.4, lifeBeam: 1.4, alpha: 0.5,
    bow: 0.6, bowSize: 0.9, bowSpread: 2.4, bowLife: 1.1, bowLifeBeam: 0.5, bowAlpha: 0.65, out: 0.45, drag: 1.3, full: 1.5 };
  const buildWakes = (s) => {
    const G = KM.foam();
    s.puffs = [];
    for (let i = 0; i < FOAM.pool; i++) {
      const n = createNode({ geometry: G, visible: false, sightHidden: true, rotation: { x: -Math.PI / 2, y: 0, z: 0 } });
      addChild(root, n);
      s.puffs.push({ n, t: 0, life: 0, x: 0, z: 0, vx: 0, vz: 0, s0: 0, s1: 0, a: 0 });
    }
    s.puffAt = 0;
    const from = (node, bow, stern, half) => ({ node, bow, stern, half, px: node.position.x, pz: node.position.z, trail: 0, head: 0 });
    s.wakes = [
      ...s.ferries.map((f) => from(f.boat, FERRY.hull[0][1], -FERRY.hull[1][1], FERRY.hull[2][0])),
      ...s.others.map((o) => from(o.boat, FERRY.hull[0][1], -FERRY.hull[1][1], FERRY.hull[2][0])),
      ...s.ships.filter((w) => w.at.role !== "docked" || w.at.drive).map((w) => from(w.node, w.at.bow, w.at.bow, L.shipHalf(w.at, 0)))
    ];
  };
  const foamPuff = (s, x, z, vx, vz, s0, s1, life, a) => {
    const p = s.puffs[s.puffAt];
    s.puffAt = (s.puffAt + 1) % s.puffs.length;
    p.t = 0; p.life = life; p.x = x; p.z = z; p.vx = vx; p.vz = vz; p.s0 = s0; p.s1 = s1; p.a = a;
    p.n.visible = true; p.n.position.y = L.SEA + FOAM.y;
  };
  const wakesUpdate = (s, dt) => {
    if (!s.puffs || dt <= 0) return;
    for (let i = 0; i < s.wakes.length; i++) {
      const e = s.wakes[i], n = e.node, x = n.position.x, z = n.position.z, dx = x - e.px, dz = z - e.pz;
      e.px = x; e.pz = z;
      if (!n.visible || Math.abs(dx) + Math.abs(dz) > FOAM.jump) { e.trail = e.head = 0; continue; }
      const yaw = n.rotation.y, hx = Math.sin(yaw), hz = Math.cos(yaw), way = dx * hx + dz * hz, v = way / dt, speed = Math.abs(v);
      if (speed < FOAM.min) continue;
      const d = v > 0 ? 1 : -1, h = e.half, k = Math.min(1, speed / (FOAM.full + h)), go = Math.abs(way);
      // Astern: foam where the boat has just been.
      e.trail += go;
      if (e.trail >= FOAM.trail * h) {
        e.trail = 0;
        const back = d > 0 ? -e.stern : e.bow, jit = (Math.random() - 0.5) * h * 0.4;
        foamPuff(s, x + hx * back + hz * jit, z + hz * back - hx * jit, 0, 0, FOAM.size * h, FOAM.spread * h, FOAM.life + FOAM.lifeBeam * h, FOAM.alpha * k);
      }
      // Ahead: a wave thrown off either side of the stem.
      e.head += go;
      if (e.head >= FOAM.bow * h) {
        e.head = 0;
        const fore = d > 0 ? e.bow : -e.stern, cx = x + hx * fore, cz = z + hz * fore, push = speed * FOAM.out + 0.3, life = FOAM.bowLife + FOAM.bowLifeBeam * h;
        for (const side of [-1, 1]) {
          const ox = hz * side, oz = -hx * side;
          foamPuff(s, cx + ox * h * 0.5, cz + oz * h * 0.5, ox * push, oz * push, FOAM.bowSize * h, FOAM.bowSpread * h, life, FOAM.bowAlpha * k);
        }
      }
    }
    const drag = Math.exp(-FOAM.drag * dt);
    for (let i = 0; i < s.puffs.length; i++) {
      const p = s.puffs[i];
      if (!p.n.visible) continue;
      p.t += dt;
      if (p.t >= p.life) { p.n.visible = false; continue; }
      p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= drag; p.vz *= drag;
      const k = p.t / p.life, size = p.s0 + (p.s1 - p.s0) * (1 - (1 - k) * (1 - k));
      p.n.position.x = p.x; p.n.position.z = p.z; p.n.scale.x = p.n.scale.y = size;
      p.n.smokeOpacity = p.a * Math.min(1, p.t * 6) * (1 - k) * (1 - k);
    }
  };

  // The leaf at its angle: its lanterns plumb, its chains drawn up to the gatehouse, the slack let out of sight.
  const poseLeaf = (s) => {
    const a = s.leafAngle;
    if (a === s.leafDrawn) return;
    s.leafDrawn = a;
    const c = Math.cos(a), sn = Math.sin(a);
    s.leaf.rotation.x = -a;
    for (let i = 0; i < s.hung.length; i++) {
      const h = s.hung[i], l = h.lamp;
      h.node.rotation.x = a;
      l.x = l.lx; l.y = l.ly * c + l.lz * sn - 0.4; l.z = LEAF.hinge + l.lz * c - l.ly * sn;
    }
    const ay = 7.15, az = GATE.front + 0.12;
    for (let k = 0; k < s.chains.length; k++) {
      const ch = s.chains[k], by = ch.y * c + ch.z * sn, bz = LEAF.hinge + ch.z * c - ch.y * sn, dy = ay - by, dz = az - bz, len = Math.hypot(dy, dz) || 1, pitch = Math.atan2(-dy, dz);
      for (let i = 0; i < ch.links.length; i++) {
        const node = ch.links[i], d = i * KM.CHAIN_LINK;
        node.visible = d < len - 0.1;
        if (!node.visible) continue;
        node.position.x = ch.x; node.position.y = by + dy / len * d; node.position.z = bz + dz / len * d;
        node.rotation.x = pitch;
      }
    }
  };

  // The lights this frame: every lamp at its level, the nearest to whoever walks first, so each tier keeps those.
  const lightUp = (s, dt, elapsed, fx0, fz0, fy0 = 0) => {
    const lamps = s.lamps, order = s.order, L8 = RENDER_OPTS.lights;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i], d = Math.hypot(l.x - fx0, (l.y - 1.5 - fy0) * 1.5, l.z - fz0);
      if (l.wake && d < WAKE) l.want = 1;
      l.level += (l.want - l.level) * Math.min(1, dt * WAKE_EASE);
      if (l.glass) l.glass.glow = l.wake ? UNLIT + (1 - UNLIT) * l.level : 1;
      l.key = l.level > 0.08 ? d : 1e9;
    }
    for (let i = 1; i < order.length; i++) {
      const v = order[i], key = lamps[v].key;
      let j = i - 1;
      while (j >= 0 && lamps[order[j]].key > key) { order[j + 1] = order[j]; j--; }
      order[j + 1] = v;
    }
    let n = 0;
    for (let i = 0; i < order.length && n < BL.glRenderer.POINT_LIGHT_CAPACITY; i++) {
      const l = lamps[order[i]];
      if (l.key >= 1e9) break;
      const k = l.level * (0.9 + Math.sin(elapsed * 9.3 + l.phase) * 0.06 + Math.sin(elapsed * 23.7 + l.phase * 3.1) * 0.04), o = n++ * 8;
      L8[o] = l.x; L8[o + 1] = l.y; L8[o + 2] = l.z; L8[o + 3] = l.reach; L8[o + 4] = l.tint[0] * k; L8[o + 5] = l.tint[1] * k; L8[o + 6] = l.tint[2] * k; L8[o + 7] = 0;
    }
    RENDER_OPTS.lightCount = n;
  };

  const groundFor = (x, z, feet = 0) => L.supportAt(x, z, feet, bridgeDown(), gateUp());
  const walkableFor = (ax, az, bx, bz, y, height, actor) => L.walkClear(ax, az, bx, bz, y, actor.bodyRadius || 0.35, bridgeDown(), gateUp());
  // In the air: over everything, the castle's stone by its tops, its air only once the knights have opened it.
  let wardToldAt = -Infinity;
  const flyableFor = (ax, az, bx, bz, y, height, actor) => {
    const r = actor.bodyRadius || 0.35, open = !!rules && rules.open("drawbridge");
    if (L.flyClear(ax, az, bx, bz, y, r, bridgeDown(), gateUp(), open)) return true;
    if (!open && actor === avatar && hud && L.inWard(bx, bz, r) && !L.inWard(ax, az, r) && performance.now() - wardToldAt > WARD_TOLD * 1000) {
      wardToldAt = performance.now();
      hud.toast("The castle's walls are warded. Turn the knights face to face to open them.");
    }
    return false;
  };
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
  // Where a traveller stands on arriving: out of ₿IFRÖST's arch, out of the keep's great door, or out of a tower's.
  const arrivalFor = (place, r, boot = false) => {
    if (boot) {
      const q = new URLSearchParams(location.search);
      if (q.get("debug") === "1" && q.get("castle") === "arena") return { x: 0, y: L.backY(-262), z: -262, yaw: Math.PI };
      if (q.get("debug") === "1" && q.get("castle") === "bridge") return { x: 0, y: L.backY(-224), z: -224, yaw: Math.PI };
      if (q.get("debug") === "1" && q.get("castle") === "back") return { x: 0, y: 0, z: CZ - CASTLE.halfZ - 6, yaw: Math.PI };
      if (q.get("debug") === "1" && q.get("castle") === "shipyard") return { x: L.SHIPYARD.quay.x1 - 3, y: L.SHIPYARD.y, z: L.WEST.z, yaw: -Math.PI / 2 };
      if (q.get("debug") === "1" && q.get("castle") === "forge") return { x: L.ARMORY.quay.x0 + 3, y: L.ARMORY.y, z: L.WEST.z, yaw: Math.PI / 2 };
      if (q.get("debug") === "1" && q.get("castle") === "storj") { const d = L.STORJ.docks[0]; return { x: L.STORJ.x + 4, y: d.y, z: d.bank - d.face * 2.5, yaw: d.face > 0 ? 0 : Math.PI }; }
      if (q.get("debug") === "1" && q.get("castle") === "outpost") { const P = L.OUTPOST.arms[1].pier; return { x: P.x1 - 2, y: L.OUTPOST.dock.y, z: (P.z0 + P.z1) / 2, yaw: -Math.PI / 2 }; }
      if (q.get("debug") === "1" && q.get("castle") === "shards") return { x: L.SHARDS.dock.quay.x0 + 2.5, y: L.SHARDS.dock.y, z: L.SHARDS.z - 4, yaw: Math.PI / 2 };
      if (q.get("debug") === "1" && (q.get("castle") === "volcano" || q.get("castle") === "cbdc")) return { x: L.VOLCANO.dock.quay.x0 + 2.5, y: L.VOLCANO.dock.y, z: L.VOLCANO.z - 4, yaw: Math.PI / 2 };
      if (q.get("debug") === "1" && q.has("castle") && q.get("castle") !== "0") return { x: 0, y: QUAY.y, z: (QUAY.z0 + QUAY.z1) / 2, yaw: Math.PI };
    }
    if (place === "door") return { x: YARD.door.x, z: YARD.door.z + 3.0, yaw: 0 };
    // Back out of the volcano's cave, at its mouth, looking out over the court.
    if (place === "cave") return { x: L.VOLCANO.mouth.enter - 3.6, y: L.VOLCANO.court.y, z: L.VOLCANO.z, yaw: -Math.PI / 2 };
    // Back up out of Shards' cave, in the court before its mouth, looking up the trench.
    if (place === "shards") return { x: L.SHARDS.trench.court.x0 + 1.2, y: L.SHARDS.trench.floor, z: L.SHARDS.z, yaw: -Math.PI / 2 };
    // Fallen off the halls' rooftop: on into the yard from where it went over, still in the air.
    if (place === "drop" && world.keepDrop) { const d = world.keepDrop; world.keepDrop = null; return d; }
    // Up the tower's stair into its gallery: on the stair head coming up through its floor, looking up it at the
    // cannon and out of the opening.
    const up = /^gallery-(\d+)$/.exec(place || ""), g = up && L.GALLERIES[+up[1]];
    if (g) {
      const W = L.GALLERY.well, along = W.arrive - g.inner, x = g.x + Math.sin(g.yaw) * along, z = g.z + Math.cos(g.yaw) * along;
      // The view close behind and over the climber's head, looking up the steps at the cannon.
      return { x, y: L.wellAt(x, z, g.floor - 1), z, yaw: g.yaw, pitch: 0.3, dist: 3.5 };
    }
    const m = /^tower-(\d+)$/.exec(place || ""), d = m && TOWER_DOORS[+m[1]];
    if (d) { const out = d.front + r + 2.4; return { x: d.cx + d.dx * out, y: d.y || 0, z: d.cz + d.dz * out, yaw: Math.atan2(d.dx, d.dz) }; }
    return ARRIVE;
  };
  // Which door into the halls a body `r` across at (x, z) has walked into: the keep's great door or a tower's.
  const doorAt = (x, z, r, feet = 0) => {
    // The great door, from just before it; never from behind the keep, where the back gate and its bridge run.
    if (z - r < KEEP.front + 1.0 && z > KEEP.front - 3 && Math.abs(x - YARD.door.x) < 1.4) return "door";
    for (const d of TOWER_DOORS) {
      const ox = x - d.cx, oz = z - d.cz, out = ox * d.dx + oz * d.dz;
      if (out > 0 && out < d.front + 0.4 + r && Math.abs(ox * d.dz - oz * d.dx) < d.half && Math.abs(feet - (d.y || 0)) < 1) return `tower-${d.i}`;
    }
    return null;
  };
  // The view keeps over the ground and the water, inside the land, and out of the castle's stone: following someone on
  // the ground, inside the yard or in front of the gatehouse's face unless it is in the passage; and never inside a
  // wall, a tower or the keep.
  const clampTarget = (p) => {
    p.x = clamp(p.x, BOUNDS.x0 + 8, BOUNDS.x - 8); p.z = clamp(p.z, BOUNDS.z0 + 8, BOUNDS.z1 - 8); p.y = clamp(p.y, L.SEA + 0.5, 85);
  };
  const clampCamera = (p) => {
    p.x = clamp(p.x, BOUNDS.x0 + 4, BOUNDS.x - 4); p.z = clamp(p.z, BOUNDS.z0 + 4, BOUNDS.z1 - 4);
    // In the main gate's passage, or under the west or east gate's arch.
    const inPassage = (Math.abs(p.x) < GATE.passage - 0.5 && p.y < GATE.spring + 2.2) || (p.z < CZ - YARD.halfZ + 1 && p.z > CZ - CASTLE.halfZ - 1 && p.y < L.westArchTop(p.x * 1.1) - 0.2) || (Math.abs(p.x) > YARD.half - 1 && Math.abs(p.x) < CASTLE.half + 1 && p.y < L.westArchTop((p.z - L.WEST.z) * 1.1) - 0.2);
    const who = avatar ? avatar.root.position : null, low = !!who && who.y - avatar.baseY < 6;
    if (who && low && L.inYard(who.x, who.z, -1)) {
      // Following someone in the yard, it stays inside the curtain and out of the keep's stone.
      p.x = clamp(p.x, -YARD.half + 0.5, YARD.half - 0.5); p.z = Math.max(p.z, CZ - YARD.halfZ + 0.5);
      if (!inPassage) p.z = Math.min(p.z, GATE.back - 0.6);
      const kx = p.x - KEEP.x, kz = p.z - KEEP.z, kd = Math.hypot(kx, kz), out = KEEP.r + 0.7;
      if (kd < out && p.y < KEEP.roof + KEEP.arcade + 6) { const k = out / (kd || 1); p.x = KEEP.x + kx * k; p.z = KEEP.z + (kd ? kz : 1) * k; }
    } else if (who && low && who.z > GATE.front && Math.abs(who.x) < CASTLE.half + 8 && p.z < GATE.front + 0.7 && Math.abs(p.x) < CASTLE.half + 8 && p.y < 60 && !inPassage) p.z = GATE.front + 0.7;
    // Following someone up on the keep's balconies or flying round it, the view stays out of the keep's stone rather
    // than rising over its spire.
    const kx = p.x - KEEP.x, kz = p.z - KEEP.z, kd = Math.hypot(kx, kz), balcony = who && who.y - avatar.baseY > L.BALCONY.floors[0] - 1 && kd < L.BALCONY.outer + 3 && p.y < KEEP.roof + KEEP.arcade;
    if (balcony && kd < KEEP.r + 0.7) { const k = (KEEP.r + 0.7) / (kd || 1); p.x = KEEP.x + kx * k; p.z = KEEP.z + (kd ? kz : 1) * k; }
    // Following someone in a tower's gallery, the view stays inside its wall and under its ceiling, or out through its
    // opening.
    const g = who && (L.galleryAt(who.x, who.z, who.y - avatar.baseY) || L.galleryAir(who.x, who.y - avatar.baseY + 0.1, who.z));
    if (g) {
      const gx = p.x - g.x, gz = p.z - g.z, gd = Math.hypot(gx, gz), lim = g.inner - 0.35;
      if (gd > lim && Math.abs(L.galleryAngle(g, p.x, p.z)) >= L.GALLERY.open - 0.1) { const k = lim / gd; p.x = g.x + gx * k; p.z = g.z + gz * k; }
      // On the stair head coming up through the floor, the view stands over the floor behind, looking over the climber.
      const low = who.y - avatar.baseY < g.floor - 0.2;
      if (gd <= g.r + 0.3 || Math.abs(L.galleryAngle(g, p.x, p.z)) < L.GALLERY.open) p.y = clamp(p.y, g.floor + (low ? 1.3 : 0.4), g.floor + L.GALLERY.height - 0.35);
    }
    const top = !L.inWard(p.x, p.z, 0.3) ? 0 : balcony ? L.wardTop(p.x, p.z, 0.3, false) : L.wardTop(p.x, p.z, 0.3);
    if (top > 0 && p.y < top + 0.4 && !inPassage && !L.galleryAir(p.x, p.y, p.z)) p.y = top + 0.4;
    // Over the west or east bridge and its stair the view keeps above the deck; following someone under one of its
    // arches, it keeps under the soffit instead.
    const B = L.WEST_BRIDGE, bx = L.fold(p.x);
    let way = -1e9;
    if (bx <= B.x0 && bx >= L.WEST_STAIR.x1 && Math.abs(p.z - B.z) <= B.halfW + 0.3) {
      const under = L.bridgeSoffit(bx), deck = L.wayY(bx);
      if (who && who.y - avatar.baseY < deck - B.thick && p.y < under) p.y = Math.min(p.y, under - 0.35);
      else way = deck;
    }
    // And over the high bridge out of the back gate, or under its arches.
    const K = L.BACK_BRIDGE;
    if (p.z <= K.z0 && p.z >= K.z1 && Math.abs(p.x - K.x) <= K.halfW + 0.3) {
      const under = L.backSoffit(p.z), deck = L.backY(p.z);
      if (who && who.y - avatar.baseY < deck - K.thick && p.y < under) p.y = Math.min(p.y, under - 0.35);
      else way = deck;
    }
    // And over CBDC's wall and its stairs, or under its gate's soffit.
    const ring = L.cbdcWalkY(p.x, p.z);
    if (ring !== null) {
      const under = L.cbdcSoffit(p.x, p.z);
      if (who && who.y - avatar.baseY < ring - 2 && p.y < under) p.y = Math.min(p.y, under - 0.35);
      else way = ring;
    }
    const floor = Math.max(L.landTop(p.x, p.z), L.moatDist(p.x, p.z) < 0 ? MOAT.water : -1e9, Math.hypot(p.x - COURT.x, p.z - COURT.z) < COURT.r || L.inYard(p.x, p.z, 0) ? 0 : -1e9,
      L.stairsAt(p.x, p.z) ?? -1e9, L.deckAt(p.x, p.z) ?? -1e9, L.ruinTop(p.x, p.z, 0.3) || -1e9, way);
    p.y = clamp(p.y, floor + 0.45, 90);
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go } = ctx);
    canvas = ctx.canvas;
    rules = RULES.create();
    // A page alone keeps what it opened for the page life (in a room, the land's object says).
    if (world.keepState) rules.load(world.keepState);
    camera = createCamera({ fov: 55, near: 0.3, far: 520 });
    root = createNode();
    hud = BL.hud.create({ signal: ctx.signal, roster: BL.contributors.activeRoster });
    health.show(world);
    questBook.show((on) => { if (pilot) pilot.setMenuOpen(on); });
    hooks = {};
    input = BL.interact.create({ canvas, renderer, camera, hooks });
    pilot = BL.pilot.create({
      carry: true,
      // Tab opens the weapon wheel, the mouse left captured (`BL.keepArms.wheel`), unless at a ship's helm.
      tabKey: () => !(scene && (scene.sail || scene.manned)) && arms.wheel(),
      renderer, canvas, camera, hud, presets: PRESETS, landing: "arrival", pitch: PITCH, dist: DIST,
      follow: FOLLOW, clampTarget, clampCamera, ceilingAt: () => 90, coarse: COARSE, mayPossess, jetpackStatus,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: groundFor },
      // The left button fires the cannon while one is manned.
      primaryAction: (down) => {
        if (scene && scene.sail) { if (down) fireSide(scene, scene.sail); return true; }
        if (!scene || !scene.manned) return false;
        if (down) fireCannon(scene, scene.manned);
        return true;
      }
    });
    const tipFor = (hit) => {
      const o = hit.owner;
      if (o.kind === "keep-statue") return rules.solved("statues") ? "A knight of the Keep, at rest" : "A knight of the Keep · rotate it";
      if (o.kind === "keep-guard") return GUARD_TIPS[o.who];
      if (o.kind === "keep-crystal") return "Eryk's orange crystal · take it";
      if (o.kind === "keep-merchant") return "Aras-Son, the merchant · weapons for bananas";
      if (o.kind === SKEL.kind) return SKEL.tip;
      if (o.kind === GREEN_SKEL.kind) return GREEN_SKEL.tip;
      if (o.kind === OGRE.kind) return OGRE.tip;
      if (o.kind === TROLL.kind) return TROLL.tip;
      if (o.kind === "keep-piece") return PIECE_LINES[o.piece] ? PIECE_LINES[o.piece][0] : "";
      if (o.kind === "keep-cannon") return "A cannon · man it from its turret's deck";
      if (o.kind === "keep-helm") return "A ship's helm · take it to sail her and fire her guns";
      if (o.kind === "keep-ferry") return scene && scene.ferries[o.index].state === "moored" ? "A boat · sit in it and paddle wherever you like" : "A boat";
      return o.kind === "keep-arch" ? "₿IFRÖST · the way back" : "";
    };
    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit && tipFor(hit)) hud.tooltip.show(tipFor(hit), p.x, p.y);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => { if (tipFor(hit)) hud.tooltip.show(tipFor(hit), p.x, p.y); },
      onTap: (hit) => {
        if (!hit) return;
        const o = hit.owner;
        if (o.kind === "keep-arch") return hud.toast("Walk through the arch to go back to ₿IFRÖST");
        if (o.kind === "keep-piece") { const lines = PIECE_LINES[o.piece]; if (lines) hud.toast(lines[1][o.next++ % lines[1].length]); return; }
        if (o.kind === "keep-helm") {
          const w = scene.fleet[o.index], p = pilot.player && pilot.player.root.position;
          if (scene.sail === w) fireSide(scene, w);
          else if (p && nearHelm(p.x, p.z, p.y - pilot.player.baseY) === w) takeHelm(w);
          else hud.toast("Walk up to the wheel to take the helm");
          return;
        }
        if (o.kind === "keep-cannon") {
          const cave = pilot.player, p = cave && cave.root.position, c = scene.cannons[o.index];
          if (scene.manned === c) fireCannon(scene, c);
          else if (p && nearCannon(p.x, p.z, p.y - cave.baseY) === c) manCannon(c);
          else hud.toast("Climb the turret's ladder to man its cannon");
          return;
        }
        if (o.kind === "keep-ferry") {
          const p = pilot.player && pilot.player.root.position;
          const f = scene.ferries[o.index], near = p && nearBoat(p.x, p.z, p.y - pilot.player.baseY);
          if (near === f) board(f);
          else if (f.state === "moored") hud.toast("Walk up beside the boat to board it");
          return;
        }
        if (o.kind === "keep-guard") {
          const p = pilot.player && pilot.player.root.position, g = p && nearGuard(p.x, p.z, p.y - pilot.player.baseY);
          return g ? talkTo(g) : guardSpeak(o.who);
        }
        if (o.kind === "keep-merchant") {
          const p = pilot.player && pilot.player.root.position;
          if (p && atMerchant(p.x, p.z, p.y - pilot.player.baseY)) trade(); else hud.toast("Walk up to the merchant's counter to trade");
          return;
        }
        if (o.kind === "keep-crystal") {
          const p = pilot.player && pilot.player.root.position;
          if (p && Math.hypot(p.x - L.CRYSTAL.x, p.z - L.CRYSTAL.z) < L.CRYSTAL.reach) takeCrystal();
          else hud.toast("Walk up to the crystal to take it");
          return;
        }
        if (o.kind === SKEL.kind || o.kind === GREEN_SKEL.kind || o.kind === OGRE.kind || o.kind === TROLL.kind) return;
        if (o.kind !== "keep-statue") return;
        const p = pilot.player && pilot.player.root.position, at = STATUES[o.index];
        if (p && Math.hypot(p.x - at.x, p.z - at.z) <= L.STATUE_R + REACH) turnStatue(o.index);
        else hud.toast("Walk up to the knight to rotate it");
      },
      ...pilot.hooks,
      // At a ship's helm, scrolling out from the shoulder goes up into the view from above (`helmZoom`).
      onZoom: (factor, ...rest) => { if (!helmZoom(factor)) pilot.hooks.onZoom(factor, ...rest); }
    });
    hud.setDestinations(Object.keys(VIEW_NAMES), VIEW_NAMES);
    hud.setAreaLabel("Valhodl");
    hud.el.modeDestination.title = "Valhodl · choose a viewpoint";
    hud.el.modeDestinationLabel.textContent = "Valhodl views. Open Map to choose a viewpoint";
    const presetView = (name) => {
      if (leaving || !VIEW_NAMES[name]) return false;
      pilot.goPreset(name);
      hud.setDetachedView(name, true);
      return true;
    };
    hud.onPreset(presetView);
    hud.onAction((action, value) => {
      if (action === "leave") leaveKeep();
      else if (action === "reset-view") pilot.resetCamera();
      else if (action === "act") pilot.action();
      else if (action === "jetpack-toggle") toggleJetpack();
      else if (action === "mode-preset") return presetView(value);
      else if (!leaving && action.startsWith("mode-")) pilot.modeAction(action);
    });
    fx = BL.fx.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 7, z: 20 } });
    scene = build();
    // Back out of the keep, the island already named stays named; any other arrival names where it lands.
    scene.area = ctx.from === "keephalls" ? world.keepArea || null : null;
    cannonLeave().addEventListener("click", () => { if (!leaveHelm()) leaveCannon(); cannonLeave().blur(); }, { signal: ctx.signal });
    // The pointer over the view, for a ship's helm (`helmMark`): where it lies, and a click or tap that is no drag.
    MOUSE.seen = false;
    canvas.addEventListener("pointermove", (e) => helmPointer(e, false), { signal: ctx.signal });
    canvas.addEventListener("pointerdown", (e) => helmPointer(e, true), { signal: ctx.signal });
    canvas.addEventListener("pointerup", helmClick, { signal: ctx.signal });

    // The visitor's Ooga: `character=` on a page that opens here, else the one handed over, else their own.
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
      const shared = { root, input, hud, game, world: playerWorld, playerName, weaponsEnabled: true, fx, onSwing: (cave, charge, step) => scene && scene.foes.swung(cave, charge, step), onCast: (cave, charge) => scene && scene.foes.cast(cave, charge, shared.aimTarget), onSpell: (cave, phase, lead) => scene && scene.foes && scene.foes.spell(cave, phase, lead), viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT,
        groundAt: groundFor, walkable: walkableFor, flyable: flyableFor, ceilingAt: () => 90, jetpackAllowed: () => true,
        ladders: L.LADDERS,
        useNear: (x, z, reach, feet = 0) => {
          const guard = feet < L.LOW ? nearGuard(x, z, feet) : null;
          if (guard) return talkTo(guard);
          if (atMerchant(x, z, feet)) return trade();
          if (feet < L.LOW && scene && scene.crystal.visible && Math.hypot(x - L.CRYSTAL.x, z - L.CRYSTAL.z) < L.CRYSTAL.reach) return takeCrystal();
          const boat = nearBoat(x, z, feet);
          if (boat) return board(boat);
          const gun = nearCannon(x, z, feet);
          if (gun) return manCannon(gun);
          const wheel = nearHelm(x, z, feet);
          if (wheel) return takeHelm(wheel);
          const mend = nearRepair(x, z, feet);
          if (mend || (scene && scene.repair.w)) return toggleRepair(mend);
          const seat = seatNear(x, z, feet);
          if (seat) return people.sitPlayer(seat);
          const i = feet < L.LOW ? nearStatue(x, z, reach) : -1;
          if (i < 0) return false;
          turnStatue(i);
          return true;
        } };
      people = shared.crew = BL.crew.create(shared);
      world.weapons = playerWorld.weapons;
      world.magazine = playerWorld.magazine;
      pilot.bind(shared);
      avatar = people.cavemen.get(playerName);
      const at = arrivalFor(ctx.place, avatar.bodyRadius || 0.4, ctx.from === null);
      // Come through the portal onto the small island (not woken there after a fall): told to run for the boat.
      const portal = ctx.place !== "islet" && Math.hypot(at.x - ARRIVE.x, at.z - ARRIVE.z) < 3;
      scene.nameAt = scene.first ? NAME_AFTER : -1;
      scene.runAt = portal ? (scene.first ? RUN_LATER : RUN_AFTER) : -1;
      Object.assign(avatar.root.position, { x: at.x, y: avatar.baseY + (at.y || 0), z: at.z });
      // The whole island is open to a jetpack, worn from the moment of arriving.
      people.setJetpackOwnership(avatar, true, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      people.wearJetpack(avatar, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      avatar.root.rotation.y = at.yaw;
      // In as it left ₿IFRÖST: view and combat (pilot.js `arrive`). What it came in with waits parked until it
      // leaves; the land's own weapons, bought of the armory's merchant, are its only ones (`arms`).
      pilot.arrive(avatar);
      people.parkWeapons(avatar);
      arms.bind(people, avatar, () => pilot && pilot.refreshCombat(), () => audio, (m) => hud && hud.toast(m));
      pilot.refreshCombat();
      // A page that opens here (a reload too) starts on the islet before the arch, never where the tab last stood.
      pilot.navigate({ position: { x: at.x, y: at.y || 0, z: at.z }, yaw: at.yaw - Math.PI, pitch: at.pitch ?? 0.2, dist: at.dist ?? 5.5 });
    }
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    remotes = BL.remotePlayers.create({ root, crew: people, fx, unarmed: true, visible: (rec) => yardZone(rec.zone) });
    footsteps = BL.footsteps.create();
    audio = BL.keepAudio.create();
    clock = 0;
    // The land's own object, joined only now: its state comes at once, and again whenever anyone moves it.
    wasOpen = false;
    stateChanged(true);
    link = BL.keepLink.open((msg) => { if (scene && rules.load(msg.s)) stateChanged(!scene.heard); if (scene) scene.heard = true; });
    poseLeaf(scene);
    lightUp(scene, 0, 0, ARRIVE.x, ARRIVE.z);
    if (avatar) { const p = avatar.root.position; scene.safe = { x: p.x, y: p.y - avatar.baseY, z: p.z }; scene.archZ = p.z; }
    leaving = false;
    actPrompt = false;

    keepScene.root = root;
    keepScene.camera = camera;
    keepScene.input = input;
    keepScene.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people ? people.cavemen : null,
      keep: { get scene() { return scene; }, get avatar() { return avatar; }, get rules() { return rules; }, get link() { return link; }, get audio() { return audio; }, get ferry() { return scene && scene.ferry; }, get ships() { return scene && scene.ships; }, foul: (i, x, z, yaw) => shipFoul(scene.ships[i], x, z, yaw, scene), board, trade, turn: turnStatue, strike: () => skyStrike(scene), get down() { return bridgeDown(); } }
    };
  };

  // The knights met (`beamAt` the moment they first faced each other): the frost blade's rune, curtains of light and
  // beam (the level 4 sword's, `knightAura` in the foe world) under each knight, for `BEAM_FOR` seconds.
  const beamUp = (s, t) => {
    const since = t - s.beamAt, on = since >= 0 && since < BEAM_FOR;
    for (let i = 0; i < s.statues.length; i++) if (s.foes) s.foes.knightAura(i, STATUES[i].x, STATUES[i].z, on);
  };
  // Lightning in the sky over the land now and then, silent: a bolt far off over the sea and the whole night lit for a
  // moment, flickering twice, somewhere within `ahead` rad of where the view looks. One every `every` s at random (five to fifteen minutes), counted on the page's clock
  // across the yard's visits (`world.keepSkyStrike`, the moment of the next), so going in and out of the keep does not
  // put it off. The bolt stands `far` m off the view in a random direction, `tall` m from the sea up into the clouds;
  // the flash lifts the sky, the haze and the light by `lift` at its height, `flash` s in all. On a debug page
  // `skybolt=N` strikes every N s instead.
  // The land's object (worker/src/games/keep.js) over game-net.js, one socket for the page's whole time in Valhodl,
  // its yard and its halls alike: each scene `open`s it with what it does with the state it is sent, `here(dt)` once a
  // frame tells the object this page is still in the land once a minute (which keeps what has been opened), `handoff()`
  // as one Valhodl scene goes to the other keeps it open across the switch, and `leave()` in each scene's `leave` closes
  // it unless a handoff is under way or the next scene, Valhodl's other, opens it again in the same task (the director
  // leaves one scene and enters the next together, so the close waits a microtask for that). `drop()` lets go of one
  // the object refused.
  BL.keepLink = (() => {
    let net = null, onState = null, handing = false, since = 0, closing = false;
    const open = (fn) => {
      onState = fn; handing = false; closing = false;
      if (!net && BL.gameNet.offers("keep")) { net = BL.gameNet.open("keep", "keep", { state: (msg) => { if (onState) onState(msg); } }); since = 0; }
      return net;
    };
    const here = (dt) => { if (!net || net.state !== "live" || (since += dt) < 60) return; since = 0; net.send({ t: "here" }); };
    const drop = () => { if (net) net.close(); net = null; };
    const handoff = () => { if (net) handing = true; };
    const leave = () => {
      onState = null;
      if (handing || !net) return;
      closing = true;
      queueMicrotask(() => { if (closing) { closing = false; drop(); } });
    };
    return { open, here, drop, handoff, leave, get net() { return net; } };
  })();
  // The kit's pieces among the props (keep-models.js `kit`: crates and barrels), each a poke target at its pick sphere,
  // the cluster placed at (x, y, z) turned `ry` and `k` times its size; what each says when poked (`PIECE_LINES`).
  const PIECE_LINES = { crate: ["Crate", ["Nailed shut. Ooga knocks anyway.", "Something rattles inside."]], barrel: ["Barrel", ["Sloshes. Mead, by the smell.", "Full to the bung."]] };
  const pieceTargets = (kind, x, y, z, ry, k = 1) => {
    const c = KM.kit(kind);
    if (!c) return;
    const P = c.picks, cs = Math.cos(ry), sn = Math.sin(ry);
    for (let i = 0; i < P.length; i += 6) {
      const lx = P[i + 2] * k, lz = P[i + 4] * k, node = createNode({ position: { x: x + lx * cs + lz * sn, y: y + P[i + 3] * k, z: z - lx * sn + lz * cs } });
      BL.scene.updateWorld(node);
      input.add(node, { kind: "keep-piece", piece: P[i], next: 0 }, { radius: Math.max(0.35, P[i + 5] * k) });
      targets.push(node);
    }
  };
  // The yard's zones: its own, and each of its areas' (zone-map.js `FRAME_SETS`).
  const ZM = BL.zoneMap, yardZone = (zone) => zone === "byzantine-keep" || ZM.keepPlace(zone) === "byzantine-keep";
  const SKY_STRIKE = { every: [300, 900], far: [110, 200], tall: [120, 170], flash: 0.7, lift: { sky: 3.2, light: 1.1 }, ahead: 1.1,
    beats: [[0, 0.11, 1], [0.11, 0.19, 0.15], [0.19, 0.3, 0.75], [0.3, 0.7, 0.35]] };
  const SKY_TEST = (() => { const q = new URLSearchParams(location.search), n = Number(q.get("skybolt")); return q.get("debug") === "1" && n > 0 ? [n, n] : null; })();
  const FLASH = { on: false, arrays: ["horizon", "zenith", "fog", "sky", "ground", "sun", "direct"], skyish: 3, saved: new Float32Array(32), floor: 0 };
  let skyBolts = null;
  const buildSkyStrike = (s) => {
    // The land's lightning bolts, each a copy of the sword's that pierces the haze, laid once a page.
    if (!skyBolts) skyBolts = [0, 1, 2].map((i) => Object.assign({}, KM.lightning(i), { fogPierce: 0.85 }));
    s.skyBolt = createNode({ geometry: skyBolts[0], visible: false, sightHidden: true });
    addChild(root, s.skyBolt);
    s.skyT = -1;
    const now = performance.now() / 1000;
    if (!(world.keepSkyStrike > now) || SKY_TEST) world.keepSkyStrike = now + between(SKY_TEST || SKY_STRIKE.every);
  };
  /** Takes the flash off the render options again, at the top of the frame. */
  const unflash = (R) => {
    if (!FLASH.on) return;
    let j = 0;
    for (let n = 0; n < FLASH.arrays.length; n++) { const a = R[FLASH.arrays[n]]; if (!a) continue; for (let c = 0; c < 3; c++) a[c] = FLASH.saved[j++]; }
    R.ambientFloor = FLASH.floor;
    FLASH.on = false;
  };
  /** Strikes now (also the debug handle's `strike`). */
  const skyStrike = (s) => {
    const look = Math.atan2(camera.target.x - camera.position.x, camera.target.z - camera.position.z), a = look + (Math.random() * 2 - 1) * SKY_STRIKE.ahead;
    const d = between(SKY_STRIKE.far), b = s.skyBolt, tall = between(SKY_STRIKE.tall);
    b.geometry = skyBolts[(Math.random() * skyBolts.length) | 0];
    b.position.x = camera.position.x + Math.sin(a) * d; b.position.z = camera.position.z + Math.cos(a) * d; b.position.y = L.SEA;
    b.rotation.y = Math.random() * Math.PI * 2;
    b.scale.x = b.scale.y = b.scale.z = tall / KM.LIGHTNING_LEN;
    s.skyT = 0;
  };
  const skyStrikeUpdate = (s, dt) => {
    const now = performance.now() / 1000;
    if (s.skyT < 0 && now >= world.keepSkyStrike) { world.keepSkyStrike = now + between(SKY_TEST || SKY_STRIKE.every); skyStrike(s); }
    if (s.skyT < 0) return;
    s.skyT += dt;
    const t = s.skyT, B = SKY_STRIKE.beats;
    let k = 0;
    for (let i = 0; i < B.length; i++) if (t >= B[i][0] && t < B[i][1]) { k = B[i][2] * (i === B.length - 1 ? 1 - (t - B[i][0]) / (B[i][1] - B[i][0]) : 1); break; }
    s.skyBolt.visible = t < B[2][1] && k > 0.2;
    if (t >= SKY_STRIKE.flash) { s.skyT = -1; s.skyBolt.visible = false; return; }
    if (k <= 0) return;
    // The night lit: the sky and the haze most, the light on everything less.
    const R = RENDER_OPTS;
    let j = 0;
    for (let n = 0; n < FLASH.arrays.length; n++) { const a = R[FLASH.arrays[n]]; if (!a) continue; const f = 1 + k * (n < FLASH.skyish ? SKY_STRIKE.lift.sky : SKY_STRIKE.lift.light); for (let c = 0; c < 3; c++) { FLASH.saved[j++] = a[c]; a[c] *= f; } }
    FLASH.floor = R.ambientFloor; R.ambientFloor *= 1 + k * SKY_STRIKE.lift.light;
    FLASH.on = true;
  };
  const update = (dt, elapsed) => {
    const s = scene;
    clock = elapsed;
    s.outpost.visible = Math.hypot(camera.position.x - L.OUTPOST.x, camera.position.z - L.OUTPOST.z) < OUTPOST_SEEN;
    if (s.foes) s.foes.unshake(camera);
    helmUnview(s);
    unflash(RENDER_OPTS);
    if (s.foes) s.foes.undarken(RENDER_OPTS);
    pilot.readInput(dt);
    pickFerry(s);
    for (let i = 0; i < s.ferries.length; i++) ferryUpdate(s, s.ferries[i], dt, elapsed);
    keepDocked(s);
    hullShow(s);
    shipUpdate(s, dt, elapsed);
    dripUpdate(s, dt);
    guardUpdate(s, elapsed);
    crystalUpdate(s, elapsed, dt);
    snowUpdate(s, dt, elapsed);
    if (people) people.update(dt, elapsed);
    s.foes.update(dt, elapsed);
    cannonsUpdate(s, dt, elapsed);
    volcanoUpdate(s, dt, elapsed);
    repairUpdate(s, dt, elapsed);
    burnUpdate(s, dt, elapsed);
    health.tick(dt);
    paddleArms(s.ferry);
    pilot.update(dt);
    hideGunnerWeapon(s);
    repairPose(s, elapsed);
    helmView(s, dt);
    helmMark(s);
    // What turns to face the view does so now the view is final: the smoke screen, and the eruption's fire and ash.
    screenUpdate(s, dt);
    volcanoFace(s);
    questMarks(s, elapsed);
    cannonTick(s, dt);
    s.foes.shake(camera);
    const drivenHere = people && people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) {
      // The yard is far bigger than the room's bounds on a position: each is reported from the middle of the area it
      // is in, under that area's zone (zone-map.js `frameZone`), and other pages add the middle back.
      const p = drivenHere.root.position, zone = ZM.frameZone("keep-yard", p.x, p.z, BL.net.state.zone), at = ZM.originOf(zone);
      BL.net.setZone(zone);
      BL.net.sendPose(p.x - at.x, p.y - drivenHere.baseY, p.z - at.z, drivenHere.root.rotation.y, null, 0, BL.crew.weaponFlags(drivenHere), BL.crew.visualState(drivenHere));
      health.report();
    }
    remotes.update(dt);
    footsteps.update(drivenHere);
    // The land's object hears this page is still here once a minute, which also keeps what has been opened.
    BL.keepLink.here(dt);

    // The knights turn to where the rules have them. Their visors, their lights and their dust burn red until
    // both have come round to face each other, and orange from then on.
    let settled = true;
    for (let i = 0; i < s.statues.length; i++) {
      const st = s.statues[i];
      st.shown += (st.aim - st.shown) * Math.min(1, dt * TURN_EASE);
      st.body.rotation.y = st.shown;
      if (Math.abs(st.aim - st.shown) > 0.05) settled = false;
    }
    const lit = rules.solved("statues") && settled ? 1 : 0;
    if (lit !== s.lit) {
      s.lit = lit;
      // Met, their glow goes out: no light behind their visors and none on the ground.
      for (let i = 0; i < s.statues.length; i++) { const st = s.statues[i]; st.eyes[0].visible = !lit; st.eyes[1].visible = false; st.light.tint = RED; st.light.want = lit ? 0 : 1; }
    }
    // Purple and pink dust rising off Shards' crystal clusters.
    {
      const S = L.SHARDS;
      if (Math.hypot(camera.position.x - S.x, camera.position.z - S.z) < SHARD_DUST.near && (s.shardDust -= dt) <= 0) {
        s.shardDust = SHARD_DUST.every * (0.5 + Math.random());
        const c = S.clusters[(Math.random() * S.clusters.length) | 0], a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.5 * c.size, cs = Math.cos(a), sn = Math.sin(a);
        fx.spawnParticle(SHARD_DUST.bits[(Math.random() * SHARD_DUST.bits.length) | 0], c.x + cs * r, c.base + Math.random() * c.tall * 0.8, c.z + sn * r, cs * 0.1, 0.5 + Math.random() * 0.6, sn * 0.1, 1.6 + Math.random() * 1.2, 3, -0.4, -100);
      }
    }
    // Fairy dust rising round each knight's feet, as off a fallen enemy's bananas: red, and orange once they have met.
    for (let i = 0; i < s.motes.length; i++) {
      const m = s.motes[i];
      if (s.lit > 0 || (m.next -= dt) > 0 || Math.hypot(camera.position.x - m.x, camera.position.z - m.z) > MOTE_NEAR) continue;
      m.next = MOTE_EVERY * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2, r = MOTE_RING[0] + Math.random() * (MOTE_RING[1] - MOTE_RING[0]), tones = KNIGHT_DUST[s.lit > 0 ? 1 : 0];
      fx.spawnParticle(tones[(Math.random() * tones.length) | 0], m.x + Math.cos(a) * r, 0.15 + Math.random() * 0.5, m.z + Math.sin(a) * r, Math.cos(a) * 0.12, 0.6 + Math.random() * 0.7, Math.sin(a) * 0.12, 1.3 + Math.random() * 0.9, 3, -0.6, -100);
    }
    // The drawbridge follows its passage: down while it stands open, up otherwise, eased at both ends.
    const want = rules.open("drawbridge") ? 0 : LEAF.raised, gap = want - s.leafAngle;
    let working = gap !== 0;
    if (gap !== 0) {
      const ease = 0.25 + 0.75 * Math.min(1, Math.min(Math.abs(gap), LEAF.raised - Math.abs(gap) + 0.05) / 0.3), step = LEAF_SPEED * ease * dt;
      s.leafAngle = Math.abs(gap) <= step ? want : s.leafAngle + Math.sign(gap) * step;
      // The leaf booms down on the abutment.
      if (s.leafAngle === 0) audio.land(0, 0, ABUTMENT.z0);
    }
    poseLeaf(s);
    // The portcullis goes up once the bridge is down, and comes down before the bridge goes up.
    const lift = rules.open("drawbridge") && s.leafAngle <= LEAF_DOWN ? GATE_LIFT : 0;
    if (s.gateLift !== lift) { s.gateLift = Math.abs(lift - s.gateLift) <= GATE_SPEED * dt ? lift : s.gateLift + Math.sign(lift - s.gateLift) * GATE_SPEED * dt; working = true; }
    // The recorded drawbridge, its chains and timbers, while the leaf or the portcullis moves.
    audio.drawbridge(working, 0, 6, GATE.front + 1);
    s.portcullis.position.y = s.gateLift;
    s.westBars.position.y = s.eastBars.position.y = s.backBars.position.y = s.gateLift / GATE_LIFT * L.WEST.lift;
    for (let i = 0; i < s.crows.length; i++) {
      const c = s.crows[i], t = elapsed + c.phase, a = t * c.speed, p = c.node.position, pose = KM.crow(CROW_POSES[Math.floor(t * 5.5) & 3]);
      p.x = c.cx + Math.cos(a) * c.r; p.z = c.cz + Math.sin(a) * c.r; p.y = c.y + Math.sin(t * 0.43) * 2.2;
      c.node.rotation.y = Math.atan2(-Math.sin(a) * c.speed, Math.cos(a) * c.speed);
      if (c.node.geometry !== pose) c.node.geometry = pose;
    }

    otherBoats(s, elapsed);
    wakesUpdate(s, dt);
    stirBanners(s, elapsed);
    capes.stir(s.capes, elapsed);
    flags.stir(s.flags, elapsed);
    bobCandles(s, elapsed);
    lanterns.swing(s.swingers, elapsed);
    const who = drivenHere ? drivenHere.root.position : pilot.orbit.target;
    audio.listen(who.x, who.y, who.z);
    // The land's playlist wherever the visitor goes on foot, none while they row or sail (the sailing music has it);
    // held as it is while they leave (the halls carry it on).
    if (!leaving) BL.keepAudio.music.play(s.ferry.state === "paddling" || s.sail ? null : "land");
    beamUp(s, elapsed);
    if (s.nameAt >= 0 && elapsed >= s.nameAt) { s.nameAt = -1; banner("Welcome to", "Valhodl", true); }
    if (s.runAt >= 0 && elapsed >= s.runAt) { s.runAt = -1; banner("", "Run to the boat!"); }
    lightUp(s, dt, elapsed, who.x, who.z, drivenHere ? who.y - drivenHere.baseY : who.y);
    // The wand's charge darkens the land over everything the frame has lit.
    s.foes.darken(RENDER_OPTS);
    skyStrikeUpdate(s, dt, who);
    for (let i = 0; i < s.torches.length; i++) { const f = s.torches[i], k = TORCH * (f.size || 1) * (1 + BL.blaze.flare(elapsed, f.phase)); f.node.scale.x = f.node.scale.z = k; f.node.scale.y = k * (1.05 + Math.sin(elapsed * 7 + f.phase) * 0.06); f.node.glow = 1; }
    // The shadows keep about the castle's front, and go with whoever walks out along a bridge to the shipyard or the
    // Armory & Forge.
    const away = clamp((Math.abs(who.x) - 40) / 40, 0, 1);
    RENDER_OPTS.shadowCenter.x = who.x * (0.7 + 0.3 * away); RENDER_OPTS.shadowCenter.z = who.z + (CZ + CASTLE.halfZ - who.z) * 0.22 * (1 - away);
    hallsUpdate(s, drivenHere ? who : null, drivenHere ? who.y - drivenHere.baseY : 0);
    brewUpdate(s, elapsed);
    for (let i = 0; i < s.flies.length; i++) {
      const f = s.flies[i], t = elapsed + f.phase, p = f.node.position;
      p.x = f.x + Math.sin(t * 0.37) * 1.9 + Math.sin(t * 0.91) * 0.5; p.z = f.z + Math.cos(t * 0.31) * 1.9; p.y = f.lift + 0.7 + (Math.sin(t * 0.53) + 1) * 0.9;
      f.node.glow = Math.max(0, Math.sin(t * 1.3)) ** 2;
    }

    if (drivenHere && !leaving) {
      const p = drivenHere.root.position, feet = p.y - drivenHere.baseY, r = drivenHere.bodyRadius || 0.4, ground = groundFor(p.x, p.z, feet);
      const seated = !!drivenHere.camp.seat, grounded = !seated && feet - ground < 0.3 && feet < L.LOW, wet = seated ? null : L.waterAt(p.x, p.z, bridgeDown(), gateUp());
      // Down in the sea or the moat, the water carries the Ooga back to the last dry ground it stood on.
      if (wet !== null && feet < wet + 0.2) {
        s.wet += dt;
        if (s.wet > WET_FOR && s.safe) {
          s.wet = 0;
          Object.assign(p, { x: s.safe.x, y: drivenHere.baseY + s.safe.y, z: s.safe.z });
          drivenHere.hop = 0; drivenHere.hopV = 0;
          hud.toast("The water carries you back to shore.");
        }
      } else {
        s.wet = 0;
        if (!seated && feet - ground < 0.05 && wet === null && !L.lavaAt(p.x, p.z, feet) && L.shipTop(p.x, p.z) === null) { s.safe.x = p.x; s.safe.y = ground; s.safe.z = p.z; }
      }
      // Beside a knight that can still be turned: the act button reads ROTATE, and a popup says how.
      const near = grounded && nearStatue(p.x, p.z, REACH) >= 0 && !rules.solved("statues"), boat = grounded && nearBoat(p.x, p.z, feet), gun = !seated && !!nearCannon(p.x, p.z, feet), wheel = !seated && !!nearHelm(p.x, p.z, feet), mend = !seated && (!!s.repair.w || !!nearRepair(p.x, p.z, feet));
      areaUpdate(s, p.x, p.z);
      const guard = grounded && nearGuard(p.x, p.z, feet), crystal = grounded && s.crystal.visible ? Math.hypot(p.x - L.CRYSTAL.x, p.z - L.CRYSTAL.z) : Infinity;
      const stall = grounded && !guard && atMerchant(p.x, p.z, feet), seat = grounded && !guard && !stall && seatNear(p.x, p.z, feet);
      // Walked into, the crystal is taken.
      if (crystal < L.CRYSTAL.take) takeCrystal();
      // At a ship's helm alongside a dock or a shore, Space steps off onto it (`shoreSpot`, asked a few times a second).
      if (s.sail) {
        const S = s.sail.sail;
        if (elapsed - S.shoreAt > 0.2) { S.shoreAt = elapsed; S.ashore = !!pilot.player && shoreSpot(s.sail, pilot.player); }
        hud.setAct(S.ashore ? "STEP OFF" : "FIRE"); actPrompt = true;
        if (S.ashore && elapsed - s.hinted > 4) { s.hinted = elapsed; hud.hint(COARSE ? "Tap STEP OFF to go ashore" : "Space: step off onto the dock", 3200); }
      } else if (s.manned) { hud.setAct("FIRE"); actPrompt = true; }
      else if (gun) { hud.setAct("CANNON"); actPrompt = true; }
      else if (wheel) {
        hud.setAct("HELM"); actPrompt = true;
        if (elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? "Tap HELM to take the ship's wheel" : "Space: take the helm", 3200); }
      } else if (mend) {
        hud.setAct(s.repair.w ? "STOP" : "REPAIR"); actPrompt = true;
        if (!s.repair.w && elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? "Tap REPAIR at a glowing ring to mend the ship's hull" : "Space at a glowing ring: mend the ship's hull", 3200); }
      }
      else if (guard) {
        hud.setAct("TALK"); actPrompt = true;
        if (elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? `Tap TALK to talk to ${guard.at.name}` : `Space: talk to ${guard.at.name}`, 3200); }
      } else if (crystal < L.CRYSTAL.reach) { hud.setAct("TAKE"); actPrompt = true; }
      else if (stall) {
        hud.setAct("TRADE"); actPrompt = true;
        if (elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? "Tap TRADE to see Aras-Son's weapons" : "Space: trade with Aras-Son", 3200); }
      }
      else if (seat) { hud.setAct("SIT"); actPrompt = true; }
      else if (near) {
        hud.setAct("ROTATE"); actPrompt = true;
        if (elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? "Tap ROTATE to rotate the knight" : "Space: rotate the knight", 3200); }
      } else if (boat) {
        hud.setAct("BOARD"); actPrompt = true;
        if (elapsed - s.hinted > 2.5) { s.hinted = elapsed; hud.hint(COARSE ? "Tap BOARD to sit in the boat" : "Space: sit in the boat", 3200); }
      } else {
        if (actPrompt) { actPrompt = false; pilot.showAct(); }
        if (s.near) { hud.hideHint(); s.hinted = -Infinity; }
      }
      s.near = near || boat || !!guard || !!stall || wheel || (mend && !s.repair.w);
      // The merchant breathes.
      s.merchant.position.y = L.ARMORY.y + 0.14 + Math.sin(elapsed * 1.6) * 0.012;
      // Into the halls through the great door or a tower's, walked into.
      const below = !seated && feet - ground < 0.3 && L.galleryExit(p.x, p.z, feet), inside = below ? `towertop-${below.i}` : grounded && doorAt(p.x, p.z, drivenHere.bodyRadius || 0.4, feet);
      if (inside) { world.pilot = drivenHere.traits.name; BL.keepAudio.music.handoff(); leaving = go("keephalls", inside); if (leaving) BL.keepLink.handoff(); }
      // In under the volcano's arch or Shards' lintel: underground, into its cave.
      else if (grounded && L.caveAt(p.x, p.z)) { world.pilot = drivenHere.traits.name; BL.keepAudio.music.handoff(); leaving = go("keephalls", L.caveAt(p.x, p.z)); if (leaving) BL.keepLink.handoff(); }
      // Flown in through one of the keep's arches: on into the halls' level where it came in, still in the air.
      else if (!leaving && L.arcadeAt(feet) && Math.hypot(p.x - KEEP.x, p.z - KEEP.z) < KEEP.r - 0.8) {
        world.pilot = drivenHere.traits.name;
        world.keepDrop = { x: p.x, y: Math.max(L.arcadeAt(feet).floor, feet), z: p.z + (0.4 - KEEP.front), yaw: drivenHere.root.rotation.y };
        BL.keepAudio.music.handoff();
        leaving = go("keephalls", "drop");
        if (leaving) BL.keepLink.handoff();
      }
      // Home through the arch, walked or flown into from its front.
      if (feet < L.LOW && p.z + r > ARCH.plane && s.archZ + r <= ARCH.plane && Math.abs(p.x) < ARCH.halfW) leaveKeep();
      s.archZ = p.z;
    }
    stepTweens(dt);
    fx.update(dt, elapsed);
  };
  // Each island's name in the sky over it, for finding the way: small and half see-through (`alpha`), shown from
  // `from` m off and whole by `full`, on the overlay so the haze never hides it; RED SAILS over Leif's raider is
  // larger (`red`).
  const SKY_NAMES = { from: 70, full: 120, font: "400 14px 'Uncial Antiqua', Georgia, serif", red: "400 28px 'Uncial Antiqua', Georgia, serif", spacing: "1.5px", alpha: 0.5, at: [
    { name: "PORTAL ISLAND", x: ISLET.x, y: 34, z: ISLET.z }, { name: "CASTLE ISLAND", x: KEEP.x, y: 96, z: KEEP.z }, { name: "CBDC", x: L.VOLCANO.cone.x, y: 62, z: L.VOLCANO.cone.z }, { name: "COLD STORJ", x: L.STORJ.x, y: 84, z: L.STORJ.z }, { name: "THE ARENA", x: L.ARENA_ISLE.x, y: 46, z: L.ARENA_ISLE.z }, { name: "SHARDS ISLAND", x: L.SHARDS.x, y: 30, z: L.SHARDS.z }, { name: "OUTPOST ISLAND", x: L.OUTPOST.x, y: 92, z: L.OUTPOST.z }] };
  const SKY_AT = { x: 0, y: 0, depth: 0 };
  const drawSkyNames = (ctx2d) => {
    const eye = camera.position;
    ctx2d.save();
    ctx2d.font = SKY_NAMES.font; ctx2d.textAlign = "center"; ctx2d.textBaseline = "middle"; ctx2d.letterSpacing = SKY_NAMES.spacing; ctx2d.lineWidth = 2; ctx2d.lineJoin = "round"; ctx2d.strokeStyle = "rgba(6,8,16,0.85)"; ctx2d.fillStyle = "#f3efe4";
    for (let i = 0; i < SKY_NAMES.at.length; i++) {
      const n = SKY_NAMES.at[i], k = clamp((Math.hypot(n.x - eye.x, n.z - eye.z) - SKY_NAMES.from) / (SKY_NAMES.full - SKY_NAMES.from), 0, 1);
      if (k <= 0 || !renderer.project(n.x, n.y, n.z, SKY_AT)) continue;
      ctx2d.globalAlpha = k * SKY_NAMES.alpha;
      ctx2d.strokeText(n.name, SKY_AT.x, SKY_AT.y); ctx2d.fillText(n.name, SKY_AT.x, SKY_AT.y);
    }
    // And over Leif's raider while his quest wants her found, from nearer to: RED SAILS, in red.
    if (redWanted()) for (const red of scene.redShips) {
      if (red.raid.sink >= 0 || red.at.z > 4000) continue;
      const k = clamp((Math.hypot(red.at.x - eye.x, red.at.z - eye.z) - 30) / 30, 0, 1);
      if (k > 0 && renderer.project(red.at.x, L.SEA + 16, red.at.z, SKY_AT)) { ctx2d.font = SKY_NAMES.red; ctx2d.letterSpacing = "3px"; ctx2d.lineWidth = 4; ctx2d.globalAlpha = k * 0.95; ctx2d.fillStyle = "#ff6a5a"; ctx2d.strokeText("RED SAILS", SKY_AT.x, SKY_AT.y); ctx2d.fillText("RED SAILS", SKY_AT.x, SKY_AT.y); }
    }
    ctx2d.restore();
  };
  const drawExtra = (ctx2d, project) => { if (scene && !leaving) drawSkyNames(ctx2d); remotes.drawNames(ctx2d, project, true); if (scene) scene.foes.drawFlights(ctx2d); };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);
  const onKey = (e) => {
    if (scene && scene.sail && e.code === "KeyX" && !e.repeat) { leaveHelm(); return true; }
    // At a helm 1 to 4 are the ship's own four.
    if (scene && scene.sail && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && /^Digit[1-4]$/.test(e.code)) { shipAct(scene, scene.sail, +e.code.slice(5) - 1); return true; }
    if (scene && scene.manned && e.code === "KeyX" && !e.repeat) { leaveCannon(); return true; }
    if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving) return pilot.resetCamera();
    if (BL.controls.matches(e, "view") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving) {
      if (pilot.modeAction("mode-toggle")) { e.preventDefault(); return true; }
    }
    if (BL.controls.matches(e, "jetpack") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return toggleJetpack();
    // 1 to 5 take a weapon in hand as a hotbar's keys do.
    if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && !leaving && /^Digit[1-5]$/.test(e.code)) return arms.key(+e.code.slice(5));
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
  // A way out that was refused: the visitor stays, the Ooga theirs again.
  const stay = () => { leaving = false; };

  const leave = () => {
    if (scene && scene.cannon) { scene.cannon = null; quests.set("cannon", "tower"); }
    unflash(RENDER_OPTS);
    if (scene && scene.foes) scene.foes.undarken(RENDER_OPTS);
    world.keepState = rules.snapshot();
    if (scene && scene.ferries) world.keepFerry = keptBoats();
    if (scene && scene.fleet) { if (scene.sail) helmDropped(scene.sail); world.keepFleet = keptFleet(); }
    // The red towers stand whole in the layout again for the next visit.
    if (scene && scene.reds) for (const c of scene.reds) c.t.top = c.t.y + c.t.rise;
    BL.keepLink.leave();
    link = null;
    if (!leaving) world.pilot = pilot.player ? pilot.player.traits.name : null;
    unsubscribeAccount();
    unsubscribeAccount = null;
    BL.net.setBody(null);
    remotes.dispose();
    remotes = null;
    footsteps.dispose();
    footsteps = null;
    audio.dispose();
    BL.keepAudio.music.leave();
    audio = null;
    cannonLeave().hidden = true;
    arms.release();
    if (avatar) people.unparkWeapons(avatar);
    if (people) people.dispose();
    fx.dispose();
    pilot.dispose();
    for (const node of targets) input.remove(node);
    targets.length = 0;
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    talk.shut();
    questBook.hide();
    shop.dispose();
    weaponReveal.stop();
    for (const id of ["keep-quest-banner", "keep-area", "keep-keys"]) { const el = document.getElementById(id); el.hidden = true; el.removeAttribute("data-show"); }
    health.hide();
    hullHide();
    hud.dispose();
    scene = hud = hooks = input = pilot = fx = people = avatar = playerWorld = canvas = rules = null;
    keepScene.input = keepScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
    if (remotes) remotes.liveGeometry(set);
    // A crow swaps through its wingbeat, so every pose stays on the GPU; so do both colours of the knights' glow.
    if (scene && scene.crows.length) for (let i = 0; i < 3; i++) set.add(KM.crow(i));
    if (scene) { const k = KM.knight(); set.add(KM.glowBeam()).add(KM.glowDisc()).add(KM.glowRing()).add(KM.dust(0)).add(KM.dust(1)).add(k.eyes[0]).add(k.eyes[1]); }
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...(remotes ? remotes.stats() : {}) };
  };

  const keepScene = BL.deferred.scene("keep", {
    // Unfinished: only the approach is built. `?wip=keep` opens it (AGENTS.md, Unfinished games).
    wip: true,
    // Voice zone: a land of its own, reached from the ₿IFRÖST chamber.
    voiceZone: "byzantine-keep",
    // The halls' builders stay warm while the yard runs, and the yard's while the halls do.
    keeps: ["keephalls"],
    micKey: true,
    controlsHelp: (touch) => { const help = pilot.controlsHelp(touch, ["jetpack"]); help.title = "Valhodl · " + help.title; help.rows.push(BL.controlsHelp.row(["1", "5"], "Choose a weapon (1 to 5)"), BL.controlsHelp.row(["tab"], "Weapon wheel · W A S D switch weapons")); return help; },
    controlsHelpHold: (on) => { pilot.controls.reset(); pilot.setMenuOpen(on, false); },
    id: "keep", buildSteps: () => KM.buildSteps(), enter, update, overlay, onDonation, onKey, renderOpts: RENDER_OPTS, stay, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get inMotion() {
      return !!scene;
    }
  });
})();
