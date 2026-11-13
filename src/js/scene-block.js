// Block Frenzy: capture the flag, Bitcoin themed. Each side guards its Bitcoin block, a glowing cube in
// its team's colour on a stand in its fort; steal the other side's, carry it home and touch your own stand while your own block is
// home. Paint splats a rival for a moment (a carrier drops what they carry) and nobody dies. Two a side: the visitor
// and a teammate against two rivals, the three bots run by `block-sim.js`. First to three captures.
//
// Phases `board` (choose a side), `play` and `results`. The rules run in `blockSim.step` on a fixed step; this file
// draws them: the arena and stands built once a visit, the four Oogas posed from the sim each frame, the two blocks on
// their stands, at a carrier's back or lying where they fell, pooled crates, throws and splats, the weather (a
// sign, rain and lightning in a storm), and a chase camera behind the visitor's Ooga that a captured mouse, Q E, the
// arrows or the look stick turns. The keys follow the island's: W A S D move from where the Ooga faces, Shift
// sprints, Space jumps (again in the air) or uses what stands beside it (a zipline or catapult), a
// left click or Enter throws the chosen tool (1 to 7 pick one, G steps through them), X or a click captures the
// mouse, a right click aims (the scope with the sniper rifle out), Tab or T throws what is in hand, B drops a crate, F lifts, stacks and sets crates, K
// drops the block, C crouches while held, V switches views, P pauses, and Escape steps back one thing at a time
// (the mouse, the view, a pause, the board, the Arcade). On touch the act button jumps, `#block-paint` throws and the tool bar picks. A round
// opens with the sim's fortifying time. The intro card, the board (side and Ooga), the tool bar, the quiz card and the
// results are in `src/index.html` under `#block`.
//
// Quiz traps: stepping on a green pad closes a Matrix bubble round the Ooga (`block-sim.js`). For the visitor the
// scene opens `#block-quiz`, a Bitcoin question from `block-trivia.js` with its four answers shuffled; a right answer
// breaks the bubble (`blockSim.escape`), a wrong one locks the answers for `WRONG_LOCK_MS` and brings another
// question, and the bubble wears off by itself after the sim's `TRAP_MAX_S`. Keys 1 to 4 answer too.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, daylight, game: gameMod, pile: pileMod, hud: hudMod, interact: interactMod, controls: controlsMod, fx: fxMod } = BL;
  const SIM = BL.blockSim, BM = BL.blockModels, C = SIM.CONFIG;
  // An AK's round, as the island rifle's (crew.js `GUN_FLASH_TIME`, `GUN_KICK`): how long the flash shows, how long the
  // kick lasts, and where on the gun the muzzle is. `SHOT_IDLE` is the seconds-since-a-round of a gun not lately fired.
  const FLASH_S = 0.035, KICK_S = 0.045, SHOT_IDLE = 1, MUZZLE = { x: 0, y: 0.063, z: 1.02 };
  const gunKick = (since) => { const k = Math.max(0, 1 - since / KICK_S); return k * k; };
  const { clamp, damp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible, updateWorld, boundsOf } = BL.scene;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const TEAM_INDEX = { blue: 0, red: 1 };
  const WRONG_LOCK_MS = 2500, MAX_SPLATS = 40, CAM = { dist: 6.8, height: 1.8, pitch: [-0.75, 1.3], yawRate: 2.4 };
  const PAINT_BITS = { blue: ["#3a8dff", "#9cc8ff"].map((c) => models.particleGeometry(c, 0.1, 0.6)), red: ["#ff4a3a", "#ffb0a6"].map((c) => models.particleGeometry(c, 0.1, 0.6)) };
  const ORANGE_BITS = ["#f7931a", "#ffd27a", "#fff3d6"].map((c) => models.particleGeometry(c, 0.1, 1));
  const LINES = {
    pickup: ["Block mine! Run!", "Ooga got block!", "Shiny block. Go go!"],
    capture: ["Block home! Ooga rich!", "Mined it!", "Number go up!"],
    splat: ["Splat!", "Paint in eye!", "Ooga sticky!"],
    lost: ["Our block! Get it!", "Thief! Paint thief!"],
    win: ["Ooga win! All blocks!", "Stack sats!"],
    rescue: ["Mine again! Home!", "Ooga take it back!"],
    boom: ["Kaboom!", "Paint everywhere!"],
    net: ["Ooga tangled!", "Net?! Rude!"],
    bonk: ["Bonk!", "Ooga see stars!", "Who threw box?!"],
    trap: ["Quiz?! Ooga think…", "Hmm. Satoshi who?", "Big brain time."],
    free: ["Ooga know!", "Easy! Twenty-one million!", "Brain unlocked!"]
  };
  const QUIZ_BITS = ["#3dff7a", "#b8ffcf"].map((c) => models.particleGeometry(c, 0.09, 1));
  const NET_BITS = ["#7fe08a", "#c8ffd0"].map((c) => models.particleGeometry(c, 0.08, 0.6));
  const WOOD_BITS = ["#9a6a3a", "#5a3a22"].map((c) => models.particleGeometry(c, 0.1, 0));
  const LASER_BITS = ["#ff3a1a", "#ffd0a0"].map((c) => models.particleGeometry(c, 0.08, 1));
  const GHOST_BITS = ["#e8eefc", "#b9a8ff"].map((c) => models.particleGeometry(c, 0.1, 1));
  const SMOKE_BITS = ["#3d3d44", "#6a6a72"].map((c) => models.particleGeometry(c, 0.12, 0));
  const STAR_BITS = ["#ffe066", "#fff3d6"].map((c) => models.particleGeometry(c, 0.09, 1));
  const TOOL_KEYS = { 1: "paint", 2: "grenade", 3: "rocket", 4: "net", 5: "sniper", 6: "gold", 7: "ak", 8: "hook" };
  // Each tool's gun (`BM.gun` takes the gun's index times two plus the team's; the hook's is its launcher); Lift shows none.
  const GUN_OF = { paint: 0, grenade: 1, rocket: 2, net: 3, sniper: 4, gold: 5, ak: 6, crate: 0, grab: -1, hook: 7 };
  const WEATHER_WORDS = { clear: "Clear", storm: "Storm" };
  const RAIN = 140;
  const MAP_HOUR = { fort: 17.7, town: 12.5, jungle: 11, haunted: 0.8 }, MAP_CLOUDS = { fort: 0.3, town: 0.15, jungle: 0.85, haunted: 0.25 };
  // Sky, light and haze from the island's clock, as the drop's.
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, moonSun: { x: 0, y: -1, z: 0 }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, sunStrength: 1, moonStrength: 0, ambientFloor: 0.22, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002,
    time: 0, bloomStrength: 0.6, lights: new Float32Array(80), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 26, fog: null, fogNear: 60, fogFar: 260
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  RENDER_OPTS.fog = RENDER_OPTS.horizon;
  RENDER_OPTS.clouds = 0.35;
  // The sea far under the floating island, as far down as the hub's.
  RENDER_OPTS.sea = -70;
  const setVec = (v, x, y, z) => { v.x = x; v.y = y; v.z = z; };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pick = (list, i) => list[i % list.length];
  // Kept for the page's life: the side last chosen.
  // The side, the Ooga, the captures to win, the Oogas a side and the bots' skill the visitor picked on the board; the
  // last three are remembered in this browser (`PICKS_KEY`) for next time.
  const TARGETS = [1, 3, 5, 7], SIZES = [2, 3, 4, 5], PICKS_KEY = "oogaboogaland.blockPicks";
  // `rule` is the scoring rule: "home" (your own block must be home, classic) or "any" (it needn't be).
  const selection = { team: "blue", ooga: null, target: 3, size: 3, skill: "normal", map: "town", rule: "home" };
  const RULE_WORDS = { home: "block must be home (classic)", any: "block doesn't need to be home" };
  const loadPicks = () => {
    try {
      const p = JSON.parse(localStorage.getItem(PICKS_KEY) || "{}");
      if (TARGETS.includes(p.target)) selection.target = p.target;
      if (SIZES.includes(p.size)) selection.size = p.size;
      if (SIM.SKILLS[p.skill]) selection.skill = p.skill;
      if (SIM.ARENAS[p.map] && WIRE.playable(p.map)) selection.map = p.map;
      if (WIRE.RULES.includes(p.rule)) selection.rule = p.rule;
    } catch { /* nothing saved, or storage closed: the defaults stand */ }
  };
  const savePicks = () => {
    try { localStorage.setItem(PICKS_KEY, JSON.stringify({ target: selection.target, size: selection.size, skill: selection.skill, map: selection.map, rule: selection.rule })); } catch { /* the picks last this visit */ }
  };

  let home = "hub";
  let renderer, game, world, go, root, camera, hud, hooks, input, fx, controls, clock;
  let paused = false;
  // A round that is running and not held: every action that changes the round asks this first, whichever key, button,
  // touch or debug call reaches it, so nothing acts while paused. Resume, Board and Sound stay open while paused.
  const inRound = () => phase === "play" && !paused;
  let sim = null, phase = "board", sceneTime = 0, stateTimer = 0, hintTimer = 0, lineN = 0, result = null;
  let actors = null, blocks = null, shots = null, splats = null, splatNext = 0, ticks = null, pads = null, crates = null, rain = null, caches = null, fpGun = null, fpGunL = null, fpFlash = null, fpFlashL = null, zipNear = false, zipLights = null, zipLit = [-1, -1], trampNodes = null, trampSeen = false, powerNodes = null;
  let mapRoot = null, fireNode = null, dancers = null, burnSeen = false, peelNodes = null, catapults = null, catNear = false;
  const iceNodes = {};
  let tool = "paint", flash = 0, flashT = 0, audio = null, unfeed = null;
  // The live Bitcoin network's say: a busy mempool (next block's median fee at `STORM_FEE` sat/vB or more) brings a storm
  // over a map's own seeded weather, and a block found resets the pads and caches.
  const STORM_FEE = 25;
  const live = { fee: 0, block: 0 };
  const feeWeather = (fee) => fee >= STORM_FEE ? "storm" : null;
  const onFeed = (ev) => {
    if (ev.type === "fees" && ev.nextFee > 0) live.fee = ev.nextFee;
    else if (ev.type === "block") live.block = ev.height;
  };
  // The sniper scope: its zoom step (`ZOOMS`, degrees of view), and the view to go back to when the rifle is put away.
  const ZOOMS = [34, 20, 11, 6];
  // Holding the right button aims, as the island's precision aim: the view narrows to AIM_FOV degrees (turning slows
  // with it) until the button comes up.
  const AIM_FOV = 36;
  let aiming = false;
  const scope = { zoom: 0, first: false, island: false };
  // The quiz: the deck of question indices still to ask this visit, the one on the card and where its right answer sits.
  const quiz = { open: false, deck: [], index: -1, right: -1, locked: false, lockTimer: 0, asked: 0, solved: 0, relock: false };
  const placed = [];
  // `face` is where the visitor's Ooga faces and aims; `yaw` is the camera's, which follows it round.
  // `lift` is how far the chase camera has risen over something behind the Ooga, `dist` how far back it sits, `close`
  // when it is so near that the Ooga would fill the view.
  const cam = { yaw: Math.PI, face: Math.PI, pitch: 0.28, warm: false, first: false, lift: 0, dist: 6.8, close: false, island: false, orbit: Math.PI, zoom: 1, islandZoom: 1, zoomGesture: -1 };
  // Two-finger swipe (or the wheel) zooms the camera in and out, as on the island: the chase camera from close over
  // the shoulder to far back (all the way in, a fresh swipe steps into first person, and out of it again), the Island
  // view from near to high overhead.
  const ZOOM = { chase: [0.35, 2.4], island: [0.45, 2.2] };
  // The Island view, as Ooga Booga Land plays: the camera high and back, W A S D running the way the screen faces,
  // the Ooga turning to run, Q E or the arrow keys swinging the camera round, and a click throwing at the pointer.
  const ISLAND = { dist: 11, pitch: 0.72, height: 1.2 };
  // The visitor's view, kept between visits.
  const VIEW_KEY = "blockfrenzy-view";
  // Arrow keys held, read apart from A and D so the arrows turn while A and D step sideways.
  const arrows = { left: 0, right: 0 };
  const pointer = { x: 0, y: 0, seen: false };
  const EYE = { x: 0, y: 0, z: 0 };
  const move = { x: 0, z: 0, sprint: 0, jump: 0, jet: 0, crouch: 0, face: 0 };
  // The live round (block-live.js), present only signed in on a Worker that offers it. `you` is the actor events call
  // "me" (none on the watch deck); `liveCast` the round's names by actor; `kept` the solo picks a live round borrows.
  const WIRE = BL.blockWire;
  let deckZoom = 1, deckZoomTo = 1; const deckBoard = { blue: -1, red: -1, clock: "", goal: "" }, deckCaps = { total: -1 }, deckCapSeen = [], deckSteals = { was: [], count: [], home: { blue: false, red: false } };
  let chairsGreeted = false, chairsFull = false, watchVisit = false, deckLive = false, round = null, you = 0, liveCast = null, kept = null, arrival = true, deck = null, deckYaw = 0, deckPitch = 0;
  const onDeck = () => phase === "watch";
  // The scope's +/- keys, the wheel and a pinch all zoom the chairs' view: the game's own zoom controls, nothing new.
  const zoomDeck = (k) => { audio.unlock(); deckZoomTo = BL.blockViewer.zoomBy(deckZoomTo, k); };
  const SEA_LEVEL = RENDER_OPTS.sea, FOG_NEAR = RENDER_OPTS.fogNear, FOG_FAR = RENDER_OPTS.fogFar, BLOOM = RENDER_OPTS.bloomStrength;
  const undeckRender = () => { RENDER_OPTS.sea = SEA_LEVEL; RENDER_OPTS.fogNear = FOG_NEAR; RENDER_OPTS.fogFar = FOG_FAR; RENDER_OPTS.bloomStrength = BLOOM; };
  const liveRound = () => !!round && (round.role === "host" || round.role === "guest");
  const acts = (name, id, a, b, c) => onDeck() ? false : liveRound() ? round.act(name, id, a, b, c) : SIM[name](sim, id, a, b, c);
  let jumpWas = false, panelOpen = false;
  const el = {};
  const blockScene = {
    id: "block", voiceZone: BL.blockWire.ZONE, renderOpts: RENDER_OPTS, root: null, camera: null, input: null, debug: null, agent: null, agentControls: null,
    get inMotion() { return phase === "play" || fx.inMotion; },
    // A live session keeps stepping behind the controls panels: a host that stopped would freeze the round and lose its
    // seat, and a registered page would stop beating. Its Ooga stands idle meanwhile (`panelLive`).
    get runsBehindPanels() { return liveRound() || registered(); },
    controlsHelpHold(on) {
      panelOpen = on;
      if (on && panelLive()) { trigger = false; arrows.left = arrows.right = 0; move.crouch = 0; jumpWas = false; }
    }
  };

  const panelLive = () => panelOpen && blockScene.runsBehindPanels;
  const place = (node) => { addChild(root, node); placed.push(node); return node; };
  const roster = () => contributors.activeRoster.map((c) => c.name);
  // The four Oogas: the visitor's own when signed in, else the one a cabinet sent in, else the first; then three
  // others from the roster, in its order.
  const castNames = () => {
    if (liveCast) return liveCast;
    const names = roster(), own = BL.net.ownAmong(contributors.activeRoster);
    if (world.pilot && names.includes(world.pilot)) selection.ooga = world.pilot;
    world.pilot = null;
    if (!names.includes(selection.ooga)) selection.ooga = null;
    const first = own || selection.ooga || names[0] || null;
    const rest = names.filter((n) => n !== first), cast = [first];
    // A short roster repeats round so every place is filled.
    for (let i = 1; i < selection.size * 2; i++) cast.push(rest.length ? rest[(i - 1) % rest.length] : first);
    return cast;
  };
  const buildActors = (names) => {
    actors = names.map((name, i) => {
      const body = createNode();
      const cave = name ? models.caveman(contributors.traitsFor(name)) : null;
      if (cave) addChild(body, cave.root);
      const ring = createNode({ geometry: BM.ring(0) });
      const blob = createNode({ geometry: BM.splat(0), position: { x: 0, y: 1.9, z: 0 }, scale: { x: 0.8, y: 1, z: 0.8 }, visible: false });
      const bubble = createNode({ geometry: BM.bubble(), visible: false });
      const netted = createNode({ geometry: BM.draped(), visible: false });
      const held = createNode({ geometry: BM.crate(0), position: { x: 0, y: 1.95, z: 0.1 }, visible: false });
      const trolley = createNode({ geometry: BM.trolley(), position: { x: 0, y: C.ZIP_HANG + 0.15, z: 0 }, visible: false });
      // Keep the shared ride physics, but fit the hanging body and bar to this Ooga's shoulders and reach.
      const hip = cave ? cave.root.position.y : 0, armZ = cave ? cave.parts.armR.rotation.z : 0;
      const hang = cave ? { angle: Math.atan2(-cave.elbow.z, cave.elbow.y - cave.elbow.length),
        hip: C.ZIP_HANG - cave.parts.armR.position.y - Math.hypot(cave.elbow.y - cave.elbow.length, cave.elbow.z) * cave.armScale } : null;
      if (cave) trolley.scale.x = Math.max(1, (Math.abs(cave.parts.armR.position.x - cave.parts.armL.position.x) + 0.16) / 0.6);
      const chute = createNode({ geometry: BM.chute(0), visible: false });
      // The jetpack on the back, its flames lit while it thrusts.
      const jet = createNode({ geometry: BM.jetpack(0), position: { x: 0, y: 0.78, z: -0.3 } });
      const jetFlame = createNode({ geometry: BM.jetFlames(), visible: false });
      addChild(jet, jetFlame);
      // The monkeys at the hips, shown while the power-up lasts.
      const monkeys = [-1, 1].map((side) => createNode({ geometry: BM.monkey(), position: { x: side * 0.62, y: 0.82, z: 0.08 }, scale: { x: 0.9, y: 0.9, z: 0.9 }, visible: false }));
      // Laser eyes: the lit eyes on the face, and the beam, placed in the world each frame (`poseBeams`).
      const eyes = createNode({ geometry: BM.laserEyes(), position: { x: 0, y: 1.5, z: 0.24 }, visible: false });
      const beam = place(createNode({ geometry: BM.beam(), visible: false }));
      addChild(body, ring, blob, bubble, netted, held, trolley, chute, jet, eyes, ...monkeys);
      // The gun sits in the right hand, its muzzle along the arm; the caveman's own club stays home.
      let gun = null, gunL = null;
      const flash = createNode({ geometry: BM.muzzleFlash(), position: { ...MUZZLE }, visible: false }), flashL = createNode({ geometry: BM.muzzleFlash(), position: { ...MUZZLE }, visible: false });
      if (cave) {
        const h = cave.traits.height, size = h / 1.5 / cave.armScale;
        // The modelled body's fist follows its elbow, not the old straight arm's ten-unit endpoint.
        // Both weapons share the grip at the origin; offset its centre into the fist and undo the slim arm's scale.
        const heldGun = (side) => {
          const fore = cave.parts["forearm" + side], hand = cave.parts["fingers" + side];
          const node = createNode({ geometry: BM.gun(0), position: { x: 0, y: hand.position.y - 0.03 * size, z: 0.08 * size },
            rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: { x: size, y: size, z: size }, visible: false });
          addChild(fore, node);
          fore.rotation.x = -cave.elbow.rest;
          return node;
        };
        gun = heldGun("R");
        gunL = heldGun("L");
        addChild(gun, flash); addChild(gunL, flashL);
        if (cave.parts.club) cave.parts.club.visible = false;
      }
      place(body);
      if (cave) input.add(cave.parts.torso, { kind: "ooga", index: i, priority: 1 });
      // A companion a character file hangs on its Ooga (`parts.dog`) is let off the lead here: it is lifted off the
      // body into the arena and trots after its Ooga each frame (`poseCompanions`).
      let pet = null;
      if (cave && cave.parts.dog) {
        const node = cave.parts.dog;
        removeChild(cave.root, node);
        place(node);
        pet = { node, x: 0, y: 0, z: 0, heading: 0, step: 0, warm: false };
      }
      // The grappling hook's rope and head, hung in world space while it is out, and a coiled
      // hook on the hip while it is held.
      const rope = place(createNode({ geometry: BM.rope(), visible: false, sightHidden: true }));
      const hookHead = place(createNode({ geometry: BM.hookHead(), visible: false, sightHidden: true }));
      const hookHip = createNode({ geometry: BM.hookHead(), visible: false, position: { x: 0.3, y: 0.85, z: -0.18 }, rotation: { x: 1.2, y: 0, z: 0 }, scale: { x: 0.45, y: 0.45, z: 0.45 } });
      addChild(body, hookHip);
      return { body, cave, hip, armZ, hang, ring, blob, bubble, netted, held, trolley, chute, monkeys, jet, jetFlame, gun, gunL, flash, flashL, shot: SHOT_IDLE, kick: 0, pet, eyes, beam, rope, hookHead, hookHip, phase: 0, name };
    });
  };
  const disposeActors = () => {
    if (!actors) return;
    for (const a of actors) {
      if (a.cave) input.remove(a.cave.parts.torso);
      for (const node of a.pet ? [a.body, a.beam, a.rope, a.hookHead, a.pet.node] : [a.body, a.beam, a.rope, a.hookHead]) {
        removeChild(root, node);
        const i = placed.indexOf(node);
        if (i >= 0) placed.splice(i, 1);
      }
    }
    actors = null;
  };
  // Another Ooga for a visitor with none of their own (the board has no picker: a signed-in visitor plays their own
  // Ooga, anyone else the one they drove in or the roster's first; this stays for the debug handle): the cast is made
  // again round it.
  const chooseOoga = (name) => {
    if (BL.net.ownAmong(contributors.activeRoster)) return;
    selection.ooga = name;
    disposeActors();
    buildActors(castNames());
    for (let i = 0; i < actors.length; i++) sim.actors[i].name = actors[i].name;
    paintTeams();
    nameShowcase();
  };
  // Team colours go on once a side is chosen.
  const paintTeams = () => {
    for (let i = 0; i < actors.length; i++) {
      const t = sim.actors[i].team, a = actors[i];
      a.ring.geometry = BM.ring(TEAM_INDEX[t]);
      a.jet.geometry = BM.jetpack(TEAM_INDEX[t]);
      a.blob.geometry = BM.splat(TEAM_INDEX[SIM.other(t)] + 2 * (i % 3));
    }
  };
  const say = (i, list, dur = 1.6) => {
    const a = actors[i];
    if (a && a.cave) fx.say(a.cave, pick(list, lineN++), dur);
  };

  // A splat decal where a ball landed: flat on the ground, or stood against the face of the wall it hit.
  const stamp = (team, x, y, z) => {
    const node = splats[splatNext];
    splatNext = (splatNext + 1) % MAX_SPLATS;
    node.geometry = BM.splat(TEAM_INDEX[team] + 2 * (splatNext % 3));
    node.visible = true;
    const s = 0.7 + (splatNext % 4) * 0.12;
    setVec(node.scale, s, 1, s);
    if (y < 0.2) {
      setVec(node.position, x, 0.07 + (splatNext % 5) * 0.002, z);
      setVec(node.rotation, 0, splatNext * 1.3, 0);
      return;
    }
    // The nearest face of the block it went into, and the decal just outside it.
    let best = Infinity, nx = 0, nz = 0, px = x, pz = z;
    for (const b of SIM.ARENA.BLOCKS) {
      if (x < b[0] - 0.3 || x > b[1] + 0.3 || z < b[2] - 0.3 || z > b[3] + 0.3) continue;
      for (const [d, fx2, fz2, qx, qz] of [[Math.abs(x - b[0]), -1, 0, b[0], z], [Math.abs(b[1] - x), 1, 0, b[1], z], [Math.abs(z - b[2]), 0, -1, x, b[2]], [Math.abs(b[3] - z), 0, 1, x, b[3]]]) {
        if (d < best) { best = d; nx = fx2; nz = fz2; px = qx; pz = qz; }
      }
    }
    if (best === Infinity) {
      // The arena's rim or open air: drop it to the ground.
      setVec(node.position, x, 0.07, z);
      setVec(node.rotation, 0, splatNext * 1.3, 0);
      return;
    }
    setVec(node.position, px + nx * 0.03, y, pz + nz * 0.03);
    setVec(node.rotation, Math.PI / 2, Math.atan2(nx, nz), 0);
  };

  const T = BL.blockTrivia;
  const nextQuestion = () => {
    if (!quiz.deck.length) {
      for (let i = 0; i < T.length; i++) quiz.deck.push(i);
      for (let i = quiz.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = quiz.deck[i]; quiz.deck[i] = quiz.deck[j]; quiz.deck[j] = t; }
    }
    quiz.index = quiz.deck.pop();
    const item = T[quiz.index], order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
    el.quizQ.textContent = item.q;
    for (let k = 0; k < 4; k++) {
      const b = el.answers[k];
      b.textContent = `${k + 1}. ${item.answers[order[k]]}`;
      b.dataset.mark = "";
      b.disabled = false;
      if (order[k] === 0) quiz.right = k;
    }
    quiz.locked = false;
    quiz.asked++;
  };
  // The card frees the cursor so its answers can be clicked; the mouse is captured again as the bubble breaks if it was
  // captured when it closed round the Ooga (`quiz.relock`).
  const openQuiz = () => {
    quiz.open = true;
    quiz.relock = locked();
    if (quiz.relock) document.exitPointerLock();
    trigger = false;
    nextQuestion();
    el.quizNote.textContent = COARSE ? "Tap the right answer to break the bubble." : "Click or press 1 to 4. Right answer breaks the bubble.";
    el.quiz.hidden = false;
    hud.el.act.hidden = el.paintBtn.hidden = true;
  };
  const closeQuiz = () => {
    quiz.open = quiz.locked = quiz.relock = false;
    window.clearTimeout(quiz.lockTimer);
    if (el.quiz) el.quiz.hidden = true;
    if (phase === "play" && hud) hud.el.act.hidden = el.paintBtn.hidden = !COARSE;
  };
  const answer = (k) => {
    if (!quiz.open || quiz.locked || phase !== "play") return;
    const item = T[quiz.index];
    if (k === quiz.right) {
      el.answers[k].dataset.mark = "right";
      audio.cues.right();
      quiz.solved++;
      leaveQuiz();
      acts("escape", 0);
      center("FREE!", 900);
      notice(item.fact, 4500);
      return;
    }
    el.answers[k].dataset.mark = "wrong";
    audio.cues.wrong();
    el.answers[quiz.right].dataset.mark = "right";
    for (const b of el.answers) b.disabled = true;
    quiz.locked = true;
    el.quizNote.textContent = `Not quite. ${item.fact}`;
    quiz.lockTimer = window.setTimeout(() => {
      if (!quiz.open) return;
      nextQuestion();
      el.quizNote.textContent = "Try this one.";
    }, WRONG_LOCK_MS);
  };
  const leaveQuiz = () => { const back = quiz.relock; closeQuiz(); if (back && !paused) lockMouse(); };
  const onAnswer = (e) => { const k = Number(e.currentTarget.dataset.answer); e.currentTarget.blur(); answer(k); };

  // P, or Escape once the mouse is free and the view is back on the chase camera, holds the round: nothing moves until
  // P or a click on the view. Escape while held gives the round up for the board, as Escape in play always did.
  const setPaused = (on) => {
    if (phase !== "play" || paused === on) return;
    paused = on;
    // Nothing held carries across a pause either way: the trigger, aim, a jump or crouch, and every key, stick and pad
    // input the shared controls hold.
    trigger = aiming = false;
    move.jump = move.crouch = 0;
    controls.reset();
    if (on) {
      if (locked()) document.exitPointerLock();
      center(COARSE ? "PAUSED · Main menu for the board" : "PAUSED · P or click to play on · Escape for the board", 0);
    } else el.center.hidden = true;
  };
  const TIPS = ["Hold Space in the air to jetpack back to the island.", "Every block you mine wins a pair of Golden AKs, for you or a teammate.", "Hook the block on its stand from across the field.", "Grabbed by a gorilla? Mash Space to fill the meter before it drains.", "A netted carrier's block can be taken by a touch.", "Paint knocks a carrier flat and drops the block."];
  let tipK = 0;
  // The struggle meter, shown while a gorilla holds the visitor's Ooga. It repaints only when the bar moves a step or
  // the count of presses left changes.
  const STRUGGLE_STEPS = 60;
  let struggleStep = -1, struggleLeft = -1;
  const hideStruggle = () => { if (struggleStep >= 0) el.struggle.hidden = true; struggleStep = struggleLeft = -1; };
  const paintStruggle = () => {
    const a = sim ? sim.actors[0] : null;
    if (phase !== "play" || !a || !a.grabbed) { hideStruggle(); return; }
    const need = sim.bots.gorilla.need, n = clamp(Math.round(a.grabFill / need * STRUGGLE_STEPS), 0, STRUGGLE_STEPS), left = Math.max(1, Math.ceil(need - a.grabFill));
    if (struggleStep < 0) el.struggle.hidden = false;
    if (n !== struggleStep) { struggleStep = n; el.struggleFill.style.transform = `scaleX(${n / STRUGGLE_STEPS})`; el.struggleMeter.setAttribute("aria-valuenow", String(n)); }
    if (left !== struggleLeft) { struggleLeft = left; el.struggleLeft.textContent = String(left); }
  };
  // The grouped controls list (`CONTROL_GROUPS`), the same on the menu and in the in-play Help: each group whole, each
  // row its keys (each a key cap) and a short action, every one a binding this scene handles (`onKey`, the shared
  // controls for W A S D, Q E, the arrows, Shift and Space, and the pointer). `SUMMARY` is the board's one line.
  const CONTROL_GROUPS = [
    ["Move", [[["W", "A", "S", "D"], "Move"], [["Q", "E"], "Turn (or ← →)"], [["Shift"], "Sprint"], [["C"], "Crouch (hold)"], [["Space"], "Jump, double jump, jetpack, ride"],
      [["Space", "E"], "Break a gorilla's grip"], [["H"], "Climb on a teammate"], [["J"], "Call a teammate up"]]],
    ["Weapons", [[["1", "–", "8"], "Pick a weapon"], [["G"], "Next weapon"], [["Click"], "Fire (or Enter)"], [["Right click"], "Aim, sniper scope"], [["+", "−"], "Zoom the scope"]]],
    ["Hook", [[["R"], "Fire, or let go"], [["Space"], "Let go"], [["C"], "Swing (hold)"]]],
    ["Block and crates", [[["K"], "Drop the block"], [["Tab"], "Throw the block (or T)"], [["F"], "Lift or set a crate"], [["B"], "Place a crate"], [["Click"], "Throw a held crate"]]],
    ["View and game", [[["X"], "Capture the mouse"], [["V"], "Change view"], [["Wheel"], "Zoom"], [["0"], "Level the camera"], [["U"], "Hide the weapons bar"], [["N"], "Hide the map"],
      [["1", "–", "4"], "Answer a quiz"], [["?"], "Help"], [["P"], "Pause"], [["Esc"], "Step back"]]]
  ];
  const TOUCH_GROUPS = [["Controls", [[["Left stick"], "Move"], [["Right stick"], "Turn and aim"], [["Jump"], "Jump, jetpack"], [["Jump"], "Break a gorilla's grip (tap fast)"], [["Throw!"], "Fire"], [["Weapons bar"], "Pick a weapon"], [["Ride"], "Zipline, catapult"]]]];
  blockScene.controlsHelp = (touch) => ({ title: "Block Frenzy", rows: (touch ? TOUCH_GROUPS : CONTROL_GROUPS)
    .flatMap(([, rows]) => rows.map(([keys, what]) => BL.controlsHelp.row(touch ? [] : keys, what, touch ? keys.join(" / ") : ""))) });
  const SUMMARY = [[["W", "A", "S", "D"], "move"], [["Q", "E"], "turn"], [["Click"], "fires"], [["Space"], "jumps"], [["Tab"], "throws"], [["P"], "pauses"], [["Esc"], "steps back"]];
  // Key caps for `keys` ("–" between two is a range, drawn as plain text), then the words, into `row`.
  const keyCaps = (row, keys) => {
    const caps = document.createElement("span");
    caps.className = "block-key-caps";
    for (const key of keys) {
      if (key === "–") { const to = document.createElement("i"); to.textContent = "–"; caps.append(to); continue; }
      const k = document.createElement("kbd"); k.textContent = key; caps.append(k);
    }
    row.append(caps);
  };
  const paintControls = (box) => {
    box.replaceChildren();
    for (const [name, rows] of COARSE ? TOUCH_GROUPS : CONTROL_GROUPS) {
      const group = document.createElement("section"), head = document.createElement("h4");
      group.className = "block-key-group"; group.setAttribute("aria-label", name);
      head.textContent = name; group.append(head);
      for (const [keys, what] of rows) { const row = document.createElement("div"), s = document.createElement("span"); keyCaps(row, keys); s.textContent = what; row.append(s); group.append(row); }
      box.append(group);
    }
  };
  // The board's one line: a few keys and what they do, in the same key caps.
  const paintSummary = (box) => {
    box.replaceChildren();
    SUMMARY.forEach(([keys, what], i) => {
      const part = document.createElement("span");
      part.className = "block-key-part";
      keyCaps(part, keys);
      part.append(` ${what}`);
      box.append(part);
      if (i < SUMMARY.length - 1) box.append(" · ");
    });
  };
  const registered = () => !!round && !!round.match && round.match.reg.includes(BL.net.state.selfId);
  // Whoever picks the next round's map: not once its countdown has begun.
  const firstRegistered = () => !!round && !!round.match && round.match.reg[0] === BL.net.state.selfId && round.match.phase !== "countdown";
  const isReady = () => { const m = round.match, i = m.reg.indexOf(BL.net.state.selfId); return i >= 0 && m.ready[i] === 1; };
  const liveNames = (m, map) => {
    const taken = new Set(), names = new Array(m.size * 2), people = roster(), own = BL.net.ownAmong(contributors.activeRoster), self = BL.net.state.selfId;
    for (let s = 0; s < m.seats.length; s++) {
      const id = m.seats[s];
      if (!id) continue;
      const name = (id === self ? own || selection.ooga : BL.net.remotes.get(id)?.body) || people[0];
      names[map.toLocal[s]] = name; taken.add(name);
    }
    // Empty seats draw the same NPC on every page: a walk of the sorted roster from the round's seed.
    const spare = people.slice().sort(), step = spare.length ? (m.seed % spare.length) : 0;
    let walk = step;
    for (let s = 0; s < m.seats.length; s++) {
      if (m.seats[s]) continue;
      let name = spare[walk % spare.length], tries = 0;
      while (taken.has(name) && tries++ < spare.length) name = spare[++walk % spare.length];
      taken.add(name); walk++;
      names[map.toLocal[s]] = name;
    }
    return names;
  };
  // Borrows the board's picks for the round: `kept` restores them when the board comes back.
  const setupRound = (m, map) => {
    // The round's seat map, kept until the board shows again: a guest's results can come after the lobby message has
    // ended the round (`blockLive` drops its map then), and every page must count seats the same way.
    liveSeats = map;
    kept ||= { team: selection.team, size: selection.size, map: selection.map, target: selection.target, skill: selection.skill, rule: selection.rule };
    selection.team = map.team; selection.size = m.size; selection.map = WIRE.MAPS[m.map]; selection.target = C.CAPTURES; selection.skill = "normal"; selection.rule = WIRE.RULES[m.rule] || "home";
    liveCast = liveNames(m, map);
    const changed = sim.map !== selection.map;
    recast();
    if (changed) { buildMap(); mapBase = null; }
    round.bind(sim);
  };
  // Arriving during a round lands on the watch deck; someone already on the menu chooses to watch.
  const liveBegin = (m, role, map) => {
    if (role === "watch" && !watchVisit && (!arrival || phase === "play")) { renderLive(m); return; }
    arrival = false;
    if (role === "watch") { setupRound(m, map); joinDeckNow(m); return; }
    setupRound(m, map);
    start(m.seed);
    if (role === "guest") acts("wield", 0, SIM.WIELD.indexOf(tool));
    // The rule in force, the match's word on every page.
    notice(`Scoring: ${RULE_WORDS[selection.rule]}`, 5000);
  };
  const joinDeckNow = (m) => {
    SIM.reset(sim, m.seed);
    deckLive = true;
    showDeck();
    renderLive(m);
  };
  // The deck itself, round or no round: no actor, no input, nothing here reaches the play area.
  const showDeck = () => {
    const loading = BL.deferred.load("block-viewer");
    if (loading) { loading.then(() => { if (watchVisit || deckLive) seatViewer(); }).catch(() => {}); return; }
    seatViewer();
  };
  const seatViewer = () => {
    chairsFull = false;
    if (round) round.watchFeed(true);
    else if (el.watchLine) el.watchLine.textContent = "No round running.";
    el.watchReg.hidden = !round;
    you = -9;
    phase = "watch"; paused = false;
    deck ||= BL.blockViewer.buildChairs(createNode, addChild, place(createNode()), SIM.ARENA);
    BL.blockViewer.place(deck, SIM.ARENA);
    deckZoom = deckZoomTo = 1; deckYaw = deckPitch = 0;
    deckBoard.blue = -1; deckCaps.total = -1; deckCapSeen.length = 0; deckSteals.was.length = 0; deckSteals.count.length = 0; deckSteals.home.blue = deckSteals.home.red = false;
    el.viewerCaps.textContent = ""; el.viewerCaps.hidden = true;
    el.gameButtons(true);
    // A late arrival skips the title card: the chairs are the place they came to.
    document.querySelector('[data-intro="block"]:not([hidden]) [data-action="intro-go"]')?.click();
    audio.unlock();
    if (!chairsGreeted) { chairsGreeted = true; audio.cues.seat(); }
    el.viewerBoard.hidden = false;
    deck.visible = true;
    // Only the match below: no drifting clouds, campfire, weather or sounds of its own.
    for (const n of mapClouds) n.visible = false;
    for (const n of skyClouds) n.visible = false;
    if (fireNode) fireNode.visible = false;
    if (dancers) for (const d of dancers) d.visible = false;
    if (rain) rain.visible = false;
    if (boltRing) boltRing.visible = false;
    if (boltNode) boltNode.visible = false;
    el.board.hidden = el.results.hidden = el.toolBar.hidden = el.feed.hidden = true;
    el.watch.hidden = false; el.strip.hidden = true; el.center.hidden = el.notice.hidden = true;
    strip.shown = false; updateStrip();
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
  };
  const joinDeck = () => { if (round.match && round.match.phase === "play") { arrival = true; round.watchNow(); } };
  const paintStats = (rows) => {
    el.viewerCaps.textContent = "";
    el.viewerCaps.hidden = !rows.length;
    if (!rows.length) return;
    const line = (cells, side, tag) => { const tr = document.createElement("tr"); if (side) tr.dataset.side = side; for (const v of cells) { const c = document.createElement(tag); c.textContent = v; tr.append(c); } el.viewerCaps.append(tr); };
    line(["Player", "Mined", "Stolen", "Splats"], "", "th");
    for (const r of rows) line([nameOf(r.id), r.captures, r.stolen, r.hits], r.team, "td");
  };
  const hearCaptures = () => { for (let n = BL.blockViewer.newCaptures(sim, deckCaps, !!round && round.hasFrame); n > 0; n--) audio.cues.capture(); };
  const deckView = (dt) => {
    deckZoom = BL.blockViewer.easeZoom(deckZoom, deckZoomTo, dt, hookStill);
    BL.blockViewer.look(camera, SIM.ARENA, deckYaw, deckPitch, setVec, deckZoom);
    hearCaptures();
    BL.blockViewer.trackSteals(sim, deckSteals);
    const statRows = BL.blockViewer.statRows(sim, deckSteals, deckCapSeen);
    if (statRows) paintStats(statRows);
    if (BL.blockViewer.fillBoard(sim, deckBoard)) { el.viewerBlue.textContent = deckBoard.blue; el.viewerRed.textContent = deckBoard.red; el.viewerGoal.textContent = deckBoard.goal; el.viewerClock.textContent = deckBoard.clock; }
    BL.blockViewer.white(RENDER_OPTS);
    if (fpGun) fpGun.visible = fpGunL.visible = false;
  };
  // "2v2 on Ooga Town", as the board's own button names the map.
  // The size a round will run at: the size picked, grown to seat everyone who has joined (`blockWire.sizeFor`, as the
  // Worker does when it starts).
  const sizeOf = (m) => WIRE.plannedSize(m);
  const matchLine = (m) => `${sizeOf(m)}v${sizeOf(m)} on ${(el.maps.find((b) => b.dataset.map === WIRE.MAPS[m.map]) || { textContent: WIRE.MAPS[m.map] }).textContent} · ${RULE_WORDS[WIRE.RULES[m.rule] || "home"]}`;
  // The board's help line, for the rule and the captures in force.
  const helpLine = (lead, rule, target) => `${lead} Steal the rivals' Bitcoin block (their colour), carry it to your own stand${rule === "any" ? " (your own block doesn't need to be home)" : " while your block is home"}. First to ${target} capture${target === 1 ? "" : "s"} wins.`;
  // In a match, the board's solo picks don't apply: they show what the match will play and are muted, all but the map
  // for whoever chooses it (and Detail, which is this page's own). Leaving, they go back to the visitor's picks.
  let boardInMatch = false;
  const boardFollowsMatch = (m, inMatch, chooses) => {
    if (!inMatch && !boardInMatch) return;
    boardInMatch = inMatch;
    for (const b of [...el.sizes, ...el.targets, ...el.skills, ...el.teams]) b.disabled = inMatch;
    for (const b of el.maps) b.disabled = inMatch && !chooses;
    // The scoring rule is the match's: the first in picks it, everyone else's board shows it.
    const rule = inMatch ? WIRE.RULES[m.rule] || "home" : selection.rule;
    for (const b of el.rules) { b.disabled = inMatch && !chooses; b.setAttribute("aria-pressed", String(b.dataset.rule === rule)); }
    const size = inMatch ? sizeOf(m) : selection.size, target = inMatch ? C.CAPTURES : selection.target, skill = inMatch ? "normal" : selection.skill;
    for (const b of el.sizes) b.setAttribute("aria-pressed", String(Number(b.dataset.size) === size));
    for (const b of el.targets) b.setAttribute("aria-pressed", String(Number(b.dataset.target) === target));
    for (const b of el.skills) b.setAttribute("aria-pressed", String(b.dataset.skill === skill));
    for (const b of el.teams) b.setAttribute("aria-pressed", String(!inMatch && b.dataset.team === selection.team));
    const start = document.querySelector('#block-board [data-action="block-start"]');
    if (start) start.hidden = inMatch;
    el.boardHelp.textContent = helpLine(inMatch ? "Sides are dealt when the round starts." : "Pick a side.", rule, target);
  };
  const whoName = (id) => { const rec = BL.net.remotes.get(id); return rec ? (rec.display || rec.login || "an Ooga") : BL.net.state.selfId === id ? "You" : "an Ooga"; };
  const renderLive = (m) => {
    // A round's last frame lands just before the lobby message: hear its winning capture before anything resets.
    if (onDeck() && (!m || m.phase !== "play")) hearCaptures();
    if (!el.live) return;
    el.live.hidden = !round;
    if (!round) return;
    const self = BL.net.state.selfId, play = !!m && m.phase === "play", count = m ? m.reg.length : 0, me = !!m && m.reg.includes(self), mine = !!m && m.reg[0] === self;
    const seated = play && WIRE.seatOf(m, self) >= 0;
    if (!play) chairsFull = false;
    el.liveTitle.textContent = play ? "Round under way" : m && m.phase === "countdown" ? "Starting…" : "Multiplayer";
    const solo = !!m && m.phase === "lobby" && count === 1 && me, waiting = solo && isReady();
    el.liveStatus.textContent = chairsFull ? "The viewing chairs are full. You can register for the next round or go back."
      : !m || !count && !play ? "Play with whoever's here. The first to join picks the map, size and scoring. NPCs fill any empty seats."
      : waiting ? `You're first in · waiting for someone to join · ${matchLine(m)}. You can still change the size here and the map below.`
      : solo ? `You're first in, so you pick · ${matchLine(m)}. Pick the size here and the map below, then start now or wait for players.`
      : play ? (seated ? "You're in this round." : `${m.seats.filter(Boolean).length} playing. Join now for the next round.`)
      : m.phase === "countdown" ? `Starting in a moment · ${matchLine(m)}.`
      : !me ? `${count} waiting · ${matchLine(m)} · ${whoName(m.reg[0])} was first in and picks. Join them.`
      : `${count} of ${sizeOf(m) * 2} seats filled, NPCs take the rest · ${matchLine(m)}. ${mine ? "You were first in: pick the size here and the map below." : `${whoName(m.reg[0])} was first in and picks the size and map.`} The round starts when everyone is Ready.`;
    el.liveList.textContent = "";
    if (m) for (let i = 0; i < m.reg.length; i++) { const li = document.createElement("li"); li.textContent = `${m.ready[i] ? "✓ " : ""}${m.reg[i] === self ? "You" : whoName(m.reg[i])}${i === 0 ? " · first in" : ""}${m.ready[i] ? " · ready" : ""}`; el.liveList.append(li); }
    el.liveSizes.hidden = !(mine && m.phase === "lobby");
    if (m) for (const b of el.liveSizes.querySelectorAll("button")) b.setAttribute("aria-pressed", String(Number(b.dataset.liveSize) === sizeOf(m)));
    el.liveReg.textContent = me ? "Leave match" : play ? "Join next round" : "Join match";
    el.liveReg.classList.toggle("is-leave", me);
    el.liveReg.hidden = seated || !!m && m.reg.length >= WIRE.MAX_PLAYERS && !me;
    el.liveReady.hidden = !me || play || solo;
    el.liveAlone.hidden = !solo;
    el.liveWait.hidden = !solo || waiting;
    el.liveReady.textContent = me && isReady() ? "Not ready" : "Ready!";
    el.liveWatch.hidden = !(play && !seated && phase === "board");
    if (el.watch) {
      el.watchLine.textContent = !play ? (me ? "No round running. You've joined: open Main menu to ready up." : "No round running. Join here, or open the lobby from Main menu.") : me ? "You're registered for the next round. It opens when this one ends." : "Round under way · you're in the viewing chairs. You can't enter until it ends.";
      el.watchReg.textContent = me ? "Leave match" : "Join next round";
    }
    // The round over or gone: the deck, or a round whose host vanished, goes back to the shared menu.
    if (watchVisit && onDeck() && deckLive && !(play)) { deckLive = false; SIM.reset(sim, sim.seed); deckSteals.was.length = 0; deckSteals.count.length = 0; deckSteals.home.blue = deckSteals.home.red = false; }
    followMatchMap();
    boardFollowsMatch(m, me && !play, mine && !!m && m.phase === "lobby");
    if ((!m || m.phase === "lobby" || m.phase === "countdown") && (onDeck() && !watchVisit || kept && phase === "play" && !liveRound() && !sim.over)) showBoard();
  };
  const openRound = () => {
    round = BL.blockLive.create({ onMatch: (m) => { if (!m || m.phase !== "play") arrival = false; renderLive(m); }, onStart: liveBegin, onHost: () => notice("You're hosting this round now", 2400),
      onChairsFull: () => { chairsFull = true; if (onDeck()) showBoard(); else renderLive(round.match); } });
    arrival = true;
    round.hello();
    renderLive(null);
    if (watchVisit) showDeck();
  };
  // Every way of asking to play from a menu: nothing from the chairs, the shared menu after a live round, otherwise a
  // solo round, giving up any place in the lobby first.
  const beginFromMenu = () => {
    if (onDeck()) return false;
    if (phase === "results" && kept) { showBoard(); return true; }
    if (registered()) round.unregister();
    start();
    return true;
  };
  const showBoard = () => {
    liveSeats = null;
    el.tip.textContent = TIPS[tipK++ % TIPS.length];
    { const t = document.getElementById("block-intro-tip"); if (t) t.textContent = el.tip.textContent; }
    paused = aiming = false;
    closeQuiz();
    if (liveRound() && !sim.over) round.unregister();
    if (el.watch) el.watch.hidden = true;
    if (el.viewerBoard) el.viewerBoard.hidden = true;
    if (round && chairsFull) renderLive(round.match);
    undeckRender();
    if (el.gameButtons) el.gameButtons(false);
    if (deck) { deck.visible = false; for (const n of mapClouds) n.visible = true; if (fireNode) fireNode.visible = true; if (dancers) for (const d of dancers) d.visible = true; }
    if (onDeck() && round) round.watchFeed(false);
    you = 0; watchVisit = false; chairsGreeted = false;
    if (kept) { Object.assign(selection, kept); kept = null; liveCast = null; if (sim) { const was = sim.map; recast(); if (was !== selection.map) { buildMap(); mapBase = null; } } }
    // Back on the visitor's own picks, the Scoring buttons show their own rule again.
    if (el.rules && !boardInMatch) for (const b of el.rules) b.setAttribute("aria-pressed", String(b.dataset.rule === selection.rule));
    phase = "board";
    trophyEnd();
    followMatchMap();
    if (el.againBtn) el.againBtn.textContent = "Again";
    el.board.hidden = false;
    el.results.hidden = el.strip.hidden = el.center.hidden = el.notice.hidden = el.toolBar.hidden = el.map.hidden = el.feed.hidden = true;
    hud.el.act.hidden = el.paintBtn.hidden = el.cross.hidden = true;
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    for (const b of el.teams) b.setAttribute("aria-pressed", String(b.dataset.team === selection.team));
    el.best.textContent = game.state.block.best ? fmt(game.state.block.best) : "none yet";
    el.record.textContent = `${game.state.block.wins} won of ${game.state.block.games}`;
    // The visitor's own running tally, this browser's.
    { const b = game.state.block; el.recMined.textContent = String(b.mined); el.recHome.textContent = String(b.home); el.recSplats.textContent = String(b.splats); el.recSplatted.textContent = String(b.splatted); el.recMvps.textContent = String(b.mvps); }
  };
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const start = (seed = (Date.now() & 0x7fffffff) || 1) => {
    audio.unlock();
    paused = false;
    if (!actors || !actors[0].cave) return;
    sim.team = selection.team;
    sim.rival = SIM.other(selection.team);
    for (let i = 0; i < sim.actors.length; i++) sim.actors[i].team = i < sim.size ? sim.team : sim.rival;
    sim.target = selection.target;
    sim.skill = selection.skill;
    sim.bots = SIM.SKILLS[selection.skill];
    // The scoring rule is fixed here, as the round starts: the board's pick, which in a match is the match's.
    sim.anyTime = selection.rule === "any";
    SIM.reset(sim, seed);
    strip.shown = false;
    paintTeams();
    for (const s of splats) s.visible = false;
    phase = "play";
    result = null;
    trophyEnd();
    closeQuiz();
    el.board.hidden = el.results.hidden = true;
    try { mapHidden = localStorage.getItem(MAP_KEY) === "1"; } catch { mapHidden = false; }
    el.strip.hidden = el.toolBar.hidden = el.feed.hidden = false;
    // The bar's icons wear the visitor's team colours.
    { const c = BM.TEAM[sim.team]; el.toolBar.style.setProperty("--block-team", c.paint); el.toolBar.style.setProperty("--block-team-deep", c.deep); el.toolBar.style.setProperty("--block-team-light", c.light); }
    el.map.hidden = mapHidden;
    placeBar();
    // The chosen weapon's name stands over its slot from the round's start.
    showToolName(tool);
    for (const li of el.feedItems) { li.textContent = ""; delete li.dataset.team; }
    el.notice.hidden = false;
    hud.el.act.hidden = !COARSE;
    hud.setAct("Jump");
    el.paintBtn.hidden = !COARSE;
    el.cross.hidden = (COARSE && !cam.first) || cam.island;
    cam.yaw = cam.face = cam.orbit = sim.team === "blue" ? Math.PI : 0;
    cam.pitch = 0.28;
    cam.warm = false;
    cam.lift = 0; cam.close = false; cam.dist = CAM.dist;
    controls.reset();
    tool = "paint";
    updateTools();
    lockMouse();
    SIM.parachuteIn(sim);
    if (round && round.role === "host") for (let i = 1; i < sim.actors.length; i++) if (!sim.actors[i].bot) SIM.parachuteIn(sim, i);
    center(`BUILD ${Math.ceil(sim.prep)}`, 0);
    notice(COARSE ? "Fortify! Crate drops one · walk into crates to push" : "Fortify! B drops a crate · F lifts and stacks", 0);
    updateStrip();
  };
  const finish = () => {
    closeQuiz();
    phase = "results";
    const won = sim.winner === sim.team, ms = Math.round(sim.time * 1000);
    // The round's most valuable Ooga (the winners' best by the rules' word, `SIM.mvp`, so every page crowns the same one).
    const mvp = SIM.mvp(sim, seatOfActor);
    // A finished round, solo or live, joins the visitor's own record once (`SIM.tallyOf`: their counts in it; the fastest
    // win only for the usual first to three). Not from the viewing chairs: a round only watched adds nothing.
    const tally = onDeck() ? null : SIM.tallyOf(sim, 0, mvp), best = tally ? game.recordBlock(tally) : false;
    if (kept) el.againBtn.textContent = "New game?";
    result = { won, ms, best };
    el.strip.hidden = el.toolBar.hidden = el.map.hidden = el.feed.hidden = true;
    el.center.hidden = el.notice.hidden = true;
    hud.el.act.hidden = el.paintBtn.hidden = el.cross.hidden = true;
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    // The match's result is the sim's, so every page in a live round names the same winners; only "you" differs.
    const winner = sim.winner || sim.team;
    el.resultTitle.textContent = `${TEAM_NAME[winner]} wins!`;
    el.results.dataset.team = winner;
    el.results.dataset.won = String(won);
    (won ? audio.cues.win : audio.cues.lose)();
    audio.state.zip = 0;
    el.trophyTime.textContent = fmt(ms);
    el.summary.textContent = `${won ? "Your side mined it" : "The rivals mined it this time · here's to the next round"} · first to ${sim.target}${best ? " · fastest win yet!" : ""}`;
    const me = sim.actors[0];
    el.stats.innerHTML = "";
    // The round's highlights: its most valuable Ooga (it tops the podium), the sharpest shot, the longest sniper hit.
    const worth = SIM.worth;
    let shooter = 0, sniper = 0;
    for (let i = 1; i < sim.actors.length; i++) {
      const a = sim.actors[i];
      if (a.hits > sim.actors[shooter].hits) shooter = i;
      if (a.longShot > sim.actors[sniper].longShot) sniper = i;
    }
    // The MVP's line shows all three things its worth counts: blocks mined, blocks brought home and splats landed.
    const rows = [["Round MVP", `${nameOf(mvp)} · ${sim.actors[mvp].captures} mined · ${sim.actors[mvp].rescues} brought home · ${sim.actors[mvp].hits} splats`], ["Most splats", `${nameOf(shooter)} · ${sim.actors[shooter].hits}`]];
    if (sim.actors[sniper].longShot > 0) rows.push(["Longest sniper shot", `${nameOf(sniper)} · ${Math.round(sim.actors[sniper].longShot)} m`]);
    rows.push(["Your round", `${me.captures} mined · ${me.rescues} brought home · ${me.hits} splats · ${me.splats} splatted`], ["Fastest win", game.state.block.best ? fmt(game.state.block.best) : "—"], ["Your record", `${game.state.block.wins} won of ${game.state.block.games} · ${game.state.block.mined} mined · ${game.state.block.mvps} MVP`]);
    // Each highlight a medal: gold for the MVP, silver and bronze for the shots, the visitor's own in plain wood.
    const MEDALS = ["gold", "silver", "bronze"];
    for (let k = 0; k < rows.length; k++) {
      const [label, value] = rows[k], li = document.createElement("li"), span = document.createElement("span"), b = document.createElement("b");
      li.className = "block-badge";
      li.dataset.medal = k < rows.length - 3 ? MEDALS[Math.min(k, 2)] : "wood";
      span.textContent = label;
      b.textContent = String(value);
      li.append(span, b);
      el.stats.append(li);
    }
    // The sides, every Ooga and bot on each, best first: blocks mined, blocks brought home and splats; the visitor's row
    // and the MVP marked. A name keeps to one line (its whole in the title).
    for (const t of SIM.TEAMS) {
      const list = t === "blue" ? el.sideBlue : el.sideRed, ids = [];
      for (let i = 0; i < sim.actors.length; i++) if (sim.actors[i].team === t) ids.push(i);
      ids.sort((a, b) => worth(sim.actors[b]) - worth(sim.actors[a]) || seatOfActor(a) - seatOfActor(b));
      list.textContent = "";
      for (const i of ids) {
        const li = document.createElement("li"), name = document.createElement("span"), mined = document.createElement("b"), home = document.createElement("b"), hits = document.createElement("b");
        name.textContent = name.title = nameOf(i);
        mined.textContent = String(sim.actors[i].captures);
        home.textContent = String(sim.actors[i].rescues);
        hits.textContent = String(sim.actors[i].hits);
        li.classList.toggle("you", i === 0 && !onDeck());
        li.classList.toggle("mvp", i === mvp);
        li.append(name, mined, home, hits);
        list.append(li);
      }
      list.closest("[data-team]").classList.toggle("won", t === winner);
    }
    el.results.hidden = false;
    trophyShow(winner, worth, mvp);
  };

  // The trophy stage (`finish`): up in the board's sky on its cloud, the winners stand on a heap of mined blocks in their
  // colour round the best of them, who hoists the golden block; the sunburst turns behind them and confetti falls. The
  // camera frames it in the results card's open window (`#block-trophy-stage`), measured when the card shows and on a
  // resize, never per frame. `HEAP`: [x, tier, z] per block; `PODIUM`: [x, feet height, z, turn] per winner, the MVP first.
  // The frame takes in `TROPHY_H` by `TROPHY_W` round `TROPHY_FOCUS` above the cloud: the Oogas and the golden block, the
  // heap's foot running out under the banner.
  const TROPHY_K = 1.2, TROPHY_S = 0.62 * TROPHY_K, TROPHY_H = 3.4, TROPHY_W = 4.2, TROPHY_FOCUS = 3.45, TROPHY_COUNT_S = 0.9;
  const HEAP = [[-1.6, 0, 0.3], [-0.8, 0, 0.45], [0, 0, 0.5], [0.8, 0, 0.45], [1.6, 0, 0.3], [-1.2, 1, 0.1], [-0.4, 1, 0.2], [0.4, 1, 0.2], [1.2, 1, 0.1], [-0.4, 2, -0.1], [0.4, 2, -0.1]];
  const PODIUM = [[0, 3 * TROPHY_S, -0.1, 0], [-1.2, 2 * TROPHY_S, 0.1, 0.3], [1.2, 2 * TROPHY_S, 0.1, -0.3], [2.25, 0, 0.7, -0.5]];
  const DIGITS = Array.from({ length: 21 }, (_, n) => String(n));
  let trophy = null, trophyNodes = null;
  const buildTrophy = () => {
    const heap = HEAP.map(([x, tier, z], k) => place(createNode({ geometry: BM.block(0), position: { x, y: CLOUD_Y + (tier + 0.5) * TROPHY_S, z }, rotation: { x: 0, y: (k * 0.37) % 0.5 - 0.25, z: 0 }, scale: { x: TROPHY_K, y: TROPHY_K, z: TROPHY_K }, sightHidden: true, visible: false })));
    trophyNodes = { heap, gold: place(createNode({ geometry: BM.goldBlock(), scale: { x: 1.5, y: 1.5, z: 1.5 }, sightHidden: true, visible: false })),
      rays: place(createNode({ geometry: BM.trophyRays(0), position: { x: 0, y: CLOUD_Y + 2.9, z: -3.5 }, sightHidden: true, visible: false })) };
  };
  const trophyVisible = (on) => {
    if (!trophyNodes) return;
    for (const n of trophyNodes.heap) n.visible = on;
    trophyNodes.gold.visible = trophyNodes.rays.visible = on;
  };
  // The open window's place on the screen, as the camera needs it: its centre in normalized device coordinates and its
  // share of the view's height and width.
  const measureTrophy = () => {
    if (!trophy || !el.trophyStage) return;
    // The banner across the window's foot is left out, so it never covers the heap.
    const r = el.trophyStage.getBoundingClientRect(), c = el.canvas.getBoundingClientRect(), banner = el.resultTitle.offsetHeight + 10, h = r.height - banner;
    if (!c.width || !c.height || !r.width || h <= 0) return;
    trophy.nx = ((r.left + r.width / 2 - c.left) / c.width) * 2 - 1;
    trophy.ny = 1 - ((r.top + h / 2 - c.top) / c.height) * 2;
    trophy.fh = h / c.height; trophy.fw = r.width / c.width; trophy.aspect = c.width / c.height;
  };
  const onTrophyResize = () => measureTrophy();
  const trophyShow = (winner, worth, mvp) => {
    const order = [];
    for (let i = 0; i < sim.actors.length; i++) if (sim.actors[i].team === winner) order.push(i);
    // The MVP first, then by worth; a tie by seat, so every page of a live round stands them the same way.
    order.sort((a, b) => (b === mvp) - (a === mvp) || worth(sim.actors[b]) - worth(sim.actors[a]) || seatOfActor(a) - seatOfActor(b));
    order.length = Math.min(order.length, PODIUM.length);
    const spot = sim.actors.map(() => -1);
    for (let k = 0; k < order.length; k++) spot[order[k]] = k;
    trophy = { team: winner, order, spot, t: 0, burst: 0, count: 0, nx: 0, ny: 0.3, fh: 0.4, fw: 0.8, aspect: 16 / 9, score: [sim.score.blue, sim.score.red], shown: [-1, -1] };
    const ti = TEAM_INDEX[winner];
    for (const n of trophyNodes.heap) n.geometry = BM.block(ti);
    trophyNodes.rays.geometry = BM.trophyRays(ti);
    trophyVisible(true);
    if (fpGun) fpGun.visible = fpGunL.visible = false;
    measureTrophy();
    window.requestAnimationFrame(measureTrophy);
  };
  const trophyEnd = () => { trophy = null; trophyVisible(false); };
  const trophyView = () => {
    const T = trophy, fov = 38 * Math.PI / 180, tan = Math.tan(fov / 2);
    camera.fov = fov;
    // Back far enough that the group fills the window, then shifted so it stands in the window's middle, looking a
    // little up at it.
    const d = Math.max(TROPHY_H / (Math.max(0.15, T.fh) * 2 * tan), TROPHY_W / (Math.max(0.2, T.fw) * 2 * tan * T.aspect));
    const cy = CLOUD_Y + TROPHY_FOCUS, ox = -T.nx * d * tan * T.aspect, oy = -T.ny * d * tan;
    setVec(camera.position, ox, cy + oy - d * 0.17, d);
    setVec(camera.target, ox, cy + oy, 0);
  };
  const poseTrophy = (dt, elapsed) => {
    const T = trophy, base = CLOUD_Y, ti = TEAM_INDEX[T.team];
    T.t += dt;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i], k = T.spot[i];
      if (k < 0) { a.body.visible = false; continue; }
      const s = PODIUM[k], hop = k === 0 || CLOUD_CALM ? 0 : Math.abs(Math.sin(elapsed * 4.2 + k * 1.9)) * 0.5;
      a.body.visible = true;
      setVec(a.body.position, s[0], base + s[1] + hop, s[2]);
      a.body.rotation.x = 0; a.body.rotation.y = s[3]; a.body.scale.y = 1;
      a.ring.visible = a.blob.visible = a.chute.visible = a.bubble.visible = a.netted.visible = a.held.visible = a.trolley.visible = a.jetFlame.visible = a.rope.visible = a.hookHead.visible = false;
      // The two beside the MVP wave the Golden Dual AKs; the MVP's hands are full of the golden block.
      const dual = k === 1 || k === 2;
      a.gun.visible = a.gunL.visible = dual;
      if (dual) a.gun.geometry = a.gunL.geometry = BM.gun(GUN_OF.gold * 2 + ti);
      if (!a.cave) continue;
      const p = a.cave.parts, w = CLOUD_CALM ? 0 : Math.sin(elapsed * 6 + k * 2.3), kick = hop > 0.05 ? 0.55 : 0;
      a.cave.root.position.y = a.hip;
      p.armL.quaternion = null;
      p.armL.rotation.z = p.armR.rotation.z = 0;
      p.forearmL.rotation.x = p.forearmR.rotation.x = 0;
      if (k === 0) p.armL.rotation.x = p.armR.rotation.x = -Math.PI;
      else { p.armR.rotation.x = -2.7 + w * 0.35; p.armL.rotation.x = -2.3 - w * 0.35; }
      p.legL.rotation.x = kick; p.legR.rotation.x = -kick;
    }
    const top = PODIUM[0], cave = actors[T.order[0]].cave;
    // The block rests on the raised fists, using this Ooga's actual hip, shoulders and arm length.
    const handY = cave.root.position.y + cave.parts.armR.position.y + (cave.elbow.length - cave.elbow.y) * cave.armScale;
    setVec(trophyNodes.gold.position, top[0], base + top[1] + handY + 0.48, top[2] - cave.elbow.z * cave.armScale);
    trophyNodes.gold.rotation.y = CLOUD_CALM ? 0.6 : elapsed * 0.9;
    trophyNodes.rays.rotation.z = CLOUD_CALM ? 0 : elapsed * 0.12;
    // Confetti in the team's colours and gold, a burst every so often (once, for reduced motion).
    if (!CLOUD_CALM || T.count < 1) {
      T.burst -= dt;
      if (T.burst <= 0) {
        T.burst = T.count < 3 ? 0.18 : 0.5; T.count++;
        fx.burst(((T.count * 37) % 7 - 3) * 0.7, base + TROPHY_H, 0.6, T.count < 3 ? 40 : 18, T.count & 1 ? PAINT_BITS[T.team] : ORANGE_BITS, 2.8);
      }
    }
    // The final score counts up once.
    for (let s = 0; s < 2; s++) {
      const n = CLOUD_CALM ? T.score[s] : Math.min(T.score[s], Math.floor(T.score[s] * Math.min(1, T.t / TROPHY_COUNT_S) + 0.0001));
      if (n !== T.shown[s]) { T.shown[s] = n; (s ? el.finalRed : el.finalBlue).textContent = DIGITS[n] || String(n); }
    }
  };

  let centerTimer = 0, noticeTimer = 0;
  const center = (text, ms) => {
    el.center.textContent = text;
    el.center.hidden = false;
    window.clearTimeout(centerTimer);
    if (ms) centerTimer = window.setTimeout(() => { el.center.hidden = true; }, ms);
  };
  const notice = (text, ms) => {
    el.notice.textContent = text;
    el.notice.hidden = false;
    window.clearTimeout(noticeTimer);
    if (ms) noticeTimer = window.setTimeout(() => { el.notice.textContent = " "; }, ms);
  };
  const STATE_WORDS = { home: "home", carried: "taken", dropped: "dropped", flying: "in the air" };
  // What the strip last showed (`blockSim.stripChanged`): an unchanged frame returns before building or writing anything.
  const strip = SIM.stripView();
  const updateStrip = () => {
    if (!SIM.stripChanged(sim, strip)) return;
    const own = sim.flags[sim.team], theirs = sim.flags[sim.rival], me = sim.actors[0];
    el.scoreBlue.textContent = String(sim.score.blue);
    el.scoreRed.textContent = String(sim.score.red);
    el.own.textContent = STATE_WORDS[own.state] + (sim.anyTime && own.state !== "home" ? " · you can still score" : "");
    el.own.dataset.state = own.state;
    el.theirs.textContent = me.carrying ? "carrying!" : STATE_WORDS[theirs.state];
    el.theirs.dataset.state = me.carrying ? "carried" : theirs.state;
    el.time.textContent = fmt(sim.time * 1000);
    el.drop.disabled = !me.carrying;
    if (el.passBtn) el.passBtn.disabled = !me.carrying && !me.holding;
    // The power-ups in force for the visitor's side, each with its seconds left.
    const powers = [];
    if (me.boots > 0) powers.push(`Boots ${Math.ceil(me.boots)}`);
    if (me.laser > 0) powers.push(`Lasers ${Math.ceil(me.laser)}`);
    if (me.monkeys > 0) powers.push(`Monkeys ${Math.ceil(me.monkeys)}`);
    if (sim.halving[sim.team] > 0) powers.push(`Halving ${Math.ceil(sim.halving[sim.team])}`);
    if (sim.cold[sim.team] > 0) powers.push(`Cold ${Math.ceil(sim.cold[sim.team])}`);
    el.power.hidden = !powers.length;
    el.powerWord.textContent = powers.join(" · ");
  };

  // The sim's events since the last frame: splats, sayings, notices.
  // Each event's sound, quieter the further it happened from the visitor's Ooga; the visitor's own moments play full.
  const hear = (e, me, mine) => {
    const p = sim.actors[0], k = me ? 1 : clamp(1 - Math.hypot(e.x - p.x, e.z - p.z) / 32, 0.12, 1), c = audio.cues, t = e.type;
    if (t === "fire") c.fire(k);
    // An AK's round sounds and kicks as the island rifle's does (`shot` is how long since one, on each actor).
    else if (t === "gunfire") { c.gun(k); if (actors && e.actor >= 0 && actors[e.actor]) actors[e.actor].shot = 0; }
    else if (t === "throw") { const kind = e.actor >= 0 ? sim.actors[e.actor].lastKind : ""; if (kind === "sniper") c.sniper(k); else if (kind === "rocket") c.rocket(k); else if (kind === "net") c.hookThrow(k); else c.throw(k); }
    else if (t === "splat") c.splat(me ? 1 : k);
    else if (t === "miss" || t === "netmiss") c.miss(k);
    else if (t === "pop") c.pop(k);
    else if (t === "boom") c.boom(k);
    else if (t === "net") c.net(k);
    else if (t === "bonk") c.bonk(k);
    else if (t === "boing") c.boing(k);
    else if (t === "build" || t === "lift" || t === "set" || t === "smash") c.crate(k);
    else if (t === "pickup" && (me || mine)) c.pickup();
    else if (t === "rescue" && mine) c.rescue();
    else if (t === "knock" || t === "drop" || t === "edgedrop") c.drop(k);
    else if (t === "pass") c.pass(k);
    else if (t === "capture") (mine ? c.capture : c.theirCapture)();
    else if (t === "go") c.go();
    else if (t === "burn") c.burn(me ? 1 : k);
    else if (t === "slip") c.slip(me ? 1 : k);
    else if (t === "grab" || t === "thrown") c.roar(me ? 1 : k);
    else if (t === "boo") c.boo(me ? 1 : k);
    else if (t === "homers") c.rocket(0.45 * k);
    else if (t === "ghostpop") c.ghostPop(k);
    else if (t === "struggle" && me) c.grunt();
    else if (t === "breakfree" && me) c.free();
    else if (t === "gorillahit") c.yelp(k);
    else if (t === "hookthrow") c.hookThrow(k);
    else if (t === "hookbite") c.hookBite(k);
    else if (t === "hookrelease") c.hookOff(k);
    else if (t === "hookmiss") c.hookMiss(k);
    else if (me && t === "trap") c.trap();
    else if (me && (t === "refill" || t === "cache")) c.refill();
    else if (me && t === "zip") c.zipOn();
    else if (me && t === "unzip") c.zipOff();
    else if (me && (t === "jump" || t === "jump2")) c.jump();
  };
  // The name shown for Ooga i: "You" for the visitor, else its display name.
  const nameOf = (i) => {
    if (i === 0 && !onDeck()) return "You";
    const n = sim.actors[i].name;
    return n ? contributors.traitsFor(n).display || n : `${sim.actors[i].team === "blue" ? "Blue" : "Red"} ${i}`;
  };
  // The action feed: the newest line on top, four kept.
  const feed = (text, team) => {
    const items = el.feedItems;
    for (let i = items.length - 1; i > 0; i--) {
      items[i].textContent = items[i - 1].textContent;
      if (items[i - 1].dataset.team) items[i].dataset.team = items[i - 1].dataset.team; else delete items[i].dataset.team;
    }
    items[0].textContent = text;
    if (team) items[0].dataset.team = team; else delete items[0].dataset.team;
  };
  const TEAM_NAME = { blue: "Blue", red: "Red" };
  const log = (e) => {
    const t = e.type, who = e.actor >= 0 ? nameOf(e.actor) : "";
    if ((t === "splat" || t === "bonk") && e.by >= 0) feed(`${nameOf(e.by)} ${t === "bonk" ? "bonked" : "splatted"} ${who}`, sim.actors[e.by].team);
    else if (t === "pickup") feed(`${who} grabbed the ${TEAM_NAME[e.team]} block`, sim.actors[e.actor].team);
    else if (t === "rescue") feed(`${who} sent the ${TEAM_NAME[e.team]} block home`, e.team);
    else if (t === "capture") feed(`${who} mined a block! ${TEAM_NAME[e.team]} ${sim.score[e.team]}`, e.team);
    else if (t === "power") feed(`${who} got ${({ boots: "lightning boots", halving: "the halving", cold: "cold storage", laser: "laser eyes", monkeys: "the monkeys" })[SIM.POWERS[e.y]]}`, e.team);
    else if (t === "zip") feed(`${who} took the zipline`, e.team);
    else if (t === "trap") feed(`${who} is stuck in a quiz`, e.team);
    else if (t === "burn") feed(`${who} burnt their feet in the fire!`, e.team);
    else if (t === "slip") feed(`${who} slipped on a banana peel!`, e.team);
    else if (t === "hopon") feed(`${who} climbed on ${e.by === 0 ? "your" : `${nameOf(e.by)}'s`} back`, e.team);
    else if (t === "boo") feed(`A ghost spooked ${e.actor === 0 ? "you" : who}!`, e.team);
    else if (t === "ghostpop" && e.actor >= 0) feed(`${nameOf(e.actor)} popped a ghost`, sim.actors[e.actor].team);
    else if (t === "grab") feed(`A gorilla grabbed ${e.actor === 0 ? "you" : who}!`, e.team);
    else if (t === "breakfree") feed(`${who} wriggled free of a gorilla`, e.team);
    else if (t === "netsteal") feed(`${who} took the block off ${e.by === 0 ? "you" : nameOf(e.by)} in the net`, e.team);
    else if (t === "thrown") feed(`A gorilla threw ${e.actor === 0 ? "you" : who} off the island`, e.team);
    else if (t === "respawn") feed(`${who} fell off the island`, e.team);
    else if (t === "hookget") feed(`${who} found a grappling hook`, e.team);
    else if (t === "hooksteal") feed(`${who} shot ${e.by === 0 ? "your" : `${nameOf(e.by)}'s`} grappling hook away with the Golden AKs`, e.team);
    else if (t === "goldhook") feed(`${who} hooked ${e.by === 0 ? "your" : `${nameOf(e.by)}'s`} Golden Dual AKs away!`, e.team);
    else if (t === "yank") feed(`${nameOf(e.actor)} yanked the ${TEAM_NAME[e.team]} block away`, sim.actors[e.actor].team);
    else if (t === "gorillahooked") feed(`${nameOf(e.actor)} hooked a gorilla`, sim.actors[e.actor].team);
    else if (t === "edgedrop") feed(`The ${TEAM_NAME[e.team]} block dropped at the edge`, e.team);
    else if (t === "gorillahit" && e.actor >= 0) feed(`${nameOf(e.actor)} stunned a gorilla`, sim.actors[e.actor].team);
    else if (t === "gold") feed(e.by >= 0 && e.by !== e.actor ? `${nameOf(e.by)} mined a block: ${who} gets the Golden Dual AKs!` : `${who} won the Golden Dual AKs!`, e.team);
    else if (t === "ziptrap") feed(`${who} grabbed the rivals' zipline with ${e.actor === 0 ? "your" : "their"} own block gone · trap door! Into the water!`, sim.actors[e.actor].team);
    else if (t === "enemycat") feed(`${who} tried the enemy catapult and was flung off the island!`, sim.actors[e.actor].team);
    else if (t === "launch") feed(`${who} catapulted toward the ${TEAM_NAME[SIM.other(e.team)]} fort!`, e.team);
    else if (t === "goldsteal") feed(`A mined block: ${who} gets ${e.by === 0 ? "your" : `${nameOf(e.by)}'s`} Golden Dual AKs!`, e.team);
    else if (t === "mined") feed(e.x ? `Bitcoin block ${e.x} found!` : "A Bitcoin block was found!", null);
  };
  // The mini-map: the field turned so the rivals' fort is at the top, the forts and towers drawn once
  // (`mapBase`), then the blocks and every Ooga, ten times a second.
  let mapBase = null, mapT = 0;
  // The mini-map's scale: the field fills its 88 x 148 canvas, a bigger map drawn smaller.
  const mapK = () => Math.min(88 / (2 * SIM.ARENA.W), 148 / (2 * SIM.ARENA.L));
  const mapX = (x) => ((sim.team === "blue" ? x : -x) + SIM.ARENA.W) * mapK() + (88 - 2 * SIM.ARENA.W * mapK()) / 2;
  const mapY = (z) => ((sim.team === "blue" ? z : -z) + SIM.ARENA.L) * mapK() + (148 - 2 * SIM.ARENA.L * mapK()) / 2;
  const drawMapBase = () => {
    const c = document.createElement("canvas");
    c.width = el.map.width; c.height = el.map.height;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(20, 28, 40, 0.75)";
    g.fillRect(0, 0, c.width, c.height);
    // The island's outline.
    g.fillStyle = "#6b7d46";
    g.beginPath();
    g.ellipse(mapX(0), mapY(0), SIM.ARENA.W * mapK(), SIM.ARENA.L * mapK(), 0, 0, Math.PI * 2);
    g.fill();
    for (const b of SIM.ARENAS[sim.map].BLOCKS) {
      if (b[4] - (b[5] || 0) < 0.5 && (b[5] || 0) > 0.5) continue;
      const x0 = mapX(b[0]), x1 = mapX(b[1]), y0 = mapY(b[2]), y1 = mapY(b[3]);
      g.fillStyle = (b[5] || 0) > 1.5 ? "#6a5032" : "#4a4440";
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(1, Math.abs(x1 - x0)), Math.max(1, Math.abs(y1 - y0)));
    }
    if (SIM.ARENA.goals) for (const t of SIM.TEAMS) {
      const g = SIM.ARENA.goals[t], g2 = c.getContext("2d");
      g2.strokeStyle = BM.TEAM[t].light; g2.lineWidth = 2;
      g2.beginPath(); g2.arc(mapX(g.x), mapY(g.z), 4, 0, Math.PI * 2); g2.stroke();
    }
    for (const t of SIM.TEAMS) {
      const s = SIM.ARENA.stands[t];
      if (SIM.ARENA.hidden && t !== sim.team) continue;
      g.strokeStyle = BM.TEAM[t].paint;
      g.lineWidth = 2;
      g.strokeRect(mapX(s.x) - 4, mapY(s.z) - 4, 8, 8);
    }
    mapBase = c;
  };
  // The map can be hidden (N), remembered per device.
  const MAP_KEY = "ooga-block-map";
  const toggleMap = () => { el.map.hidden = !el.map.hidden; mapHidden = el.map.hidden; try { localStorage.setItem(MAP_KEY, mapHidden ? "1" : "0"); } catch { /* this visit only */ } };
  let mapHidden = false;
  const drawMap = (dt, elapsed) => {
    if (mapHidden) return;
    mapT -= dt;
    if (mapT > 0) return;
    mapT = 0.1;
    if (!mapBase || mapBase.key !== sim.team + sim.map) { drawMapBase(); mapBase.key = sim.team + sim.map; }
    const g = el.mapCtx;
    g.drawImage(mapBase, 0, 0);
    for (const t of SIM.TEAMS) {
      const f = sim.flags[t];
      if (f.state === "dropped" && Math.sin(elapsed * 10) < 0) continue;
      // A hidden block sitting on its stand isn't shown: it has to be found.
      if (SIM.ARENA.hidden && t !== sim.team && f.state === "home") continue;
      g.fillStyle = BM.ORANGE;
      g.fillRect(mapX(f.x) - 3, mapY(f.z) - 3, 6, 6);
      g.fillStyle = BM.TEAM[t].paint;
      g.fillRect(mapX(f.x) - 2, mapY(f.z) - 2, 4, 4);
    }
    g.fillStyle = "#3a2a1c";
    for (const go of sim.gorillas) g.fillRect(mapX(go.x) - 3, mapY(go.z) - 3, 6, 6);
    for (let i = sim.actors.length - 1; i >= 0; i--) {
      const a = sim.actors[i];
      g.fillStyle = a.gold ? "#f2c230" : i === 0 ? "#ffffff" : BM.TEAM[a.team].light;
      const r = i === 0 ? 3 : 2;
      g.fillRect(mapX(a.x) - r, mapY(a.z) - r, r * 2, r * 2);
    }
  };
  const readEvents = () => {
    try {
    for (let i = 0; i < sim.eventCount; i++) {
      const e = sim.events[i], mine = e.team === sim.team, me = e.actor === you;
      hear(e, me, mine);
      log(e);
      if (e.type === "miss") stamp(e.team, e.x, e.y, e.z);
      else if (e.type === "splat") {
        stamp(SIM.other(e.team), e.x, 0, e.z);
        fx.burst(e.x, e.y + 0.4, e.z, 10, PAINT_BITS[SIM.other(e.team)], 2.4);
        if (me) { center("SPLAT!", 900); notice("Paint in eye! Wait it out…", 2000); }
        if (e.actor >= 0) say(e.actor, LINES.splat, 1.2);
      } else if (e.type === "pickup") {
        fx.burst(e.x, 1.2, e.z, 14, ORANGE_BITS, 2);
        if (me) { center("GOT THE BLOCK!", 1100); notice(SIM.ARENA.goals ? "Run it to the glowing ring behind your house (or down to your block's spot in your cellar)" : COARSE ? "Run it home · Drop hands it off" : "Run it home to your stand · K drops it", 4000); }
        // The block's side is the event's team; whose side picked it up is the carrier's.
        else if (sim.actors[e.actor].team === sim.team) notice("Teammate has the block! Cover them!", 2500);
        else { notice("They took your block! Paint the carrier!", 2500); say(1, LINES.lost); }
        say(e.actor, LINES.pickup);
      } else if (e.type === "capture") {
        fx.burst(e.x, 1.4, e.z, 30, ORANGE_BITS, 3.2);
        center(mine ? "BLOCK MINED!" : "THEY MINED ONE", 1300);
        say(e.actor, LINES.capture);
      } else if (e.type === "return") {
        if (e.team === sim.team) notice("Your block is home", 1800);
        else notice("Their block is back on its stand", 1800);
      } else if (e.type === "rescue") {
        if (e.team === sim.team) notice(me ? "Got our block back! It's home again" : "Teammate sent our block home", 2500);
        else notice("They touched their block · it's back on its stand", 2500);
        say(e.actor, LINES.rescue);
      } else if (e.type === "knock" || e.type === "drop") {
        if (e.team === sim.team) notice("Our block is loose! Touch it to send it home", 2500);
        else notice(me ? "Block dropped · grab it again, or a teammate can" : "Their block is down! Grab it", 2500);
      } else if (e.type === "edgedrop") {
        notice(e.team === sim.team ? "Our block dropped at the edge · it goes home in a moment" : "Their block dropped at the edge · grab it before it goes home", 2500);
      } else if (e.type === "hookget") {
        fx.burst(e.x, e.y + 1, e.z, 14, ORANGE_BITS, 2);
        if (me) { center("GRAPPLING HOOK!", 1100); notice(COARSE ? "Hook · pick it on the tool bar, tap Throw at a rock or a carrier" : "Hook · R fires at the crosshair: pull yourself up, or yank a block off a carrier", 3200); updateTools(); }
      } else if (e.type === "hooksteal" || e.type === "goldhook") {
        // The two special weapons take each other out of a rival's hands: Golden AK fire takes a hook, a hook the AKs.
        const gold = e.type === "goldhook";
        fx.burst(e.x, e.y, e.z, 18, ORANGE_BITS, 2.6);
        if (me) { center(gold ? "HOOKED THE AKs!" : "SHOT THE HOOK AWAY!", 1000); notice(gold ? "Your hook took their Golden Dual AKs! They're yours (6)" : "Golden AK fire took their grappling hook! It's yours (8)", 3000); audio.cues.rescue(); if (gold) chooseTool("gold"); }
        else if (e.by === you) {
          center(gold ? "AKs HOOKED!" : "HOOK SHOT AWAY!", 1000);
          notice(gold ? "A hook took your Golden Dual AKs" : "Golden AK fire took your grappling hook", 2600);
          if (tool === (gold ? "gold" : "hook")) chooseTool("paint");
        }
        updateTools();
      } else if (e.type === "hookwarn") {
        if (e.actor === you) { center("HOOKED!", 700); notice("They've hooked your block!", 1200); }
      } else if (e.type === "yank") {
        fx.burst(e.x, e.y, e.z, 12, ORANGE_BITS, 2.4);
        if (e.by === you) notice("Your block was yanked away!", 1800);
        else if (e.actor === you) notice("Yanked it! Grab the block", 1800);
      } else if (e.type === "gorillahooked") {
        fx.burst(e.x, e.y, e.z, 10, STAR_BITS, 2);
      } else if (e.type === "hookmiss") {
        if (me) { notice("Missed", 700); updateTools(); }
      } else if (e.type === "respawn") {
        if (me) { center("BACK HOME", 1000); notice(COARSE ? "You fell off the island · hold Jump in the air to jetpack back next time" : "You fell off the island · hold Space in the air to jetpack back next time", 2600); }
      } else if (e.type === "go") {
        center("GO!", 900);
        notice(`First to ${sim.target} · steal the ${sim.rival} block · bring it home · ${COARSE ? "Pass" : "Tab"} throws it to a friend`, 4500);
      } else if (e.type === "build") {
        fx.burst(e.x, 0.6, e.z, 8, WOOD_BITS, 1.6);
        if (me) updateTools();
      } else if (e.type === "pop" || e.type === "boom") {
        const big = e.type === "boom";
        stamp(e.team, e.x, Math.min(e.y, 0.1), e.z);
        for (let k = 0; k < (big ? 5 : 3); k++) { const a = k * 2.1 + e.x, r = big ? 1.6 : 1.1; stamp(e.team, e.x + Math.sin(a) * r, Math.min(e.y, 0.1), e.z + Math.cos(a) * r); }
        fx.burst(e.x, e.y + 0.3, e.z, big ? 30 : 18, PAINT_BITS[e.team], big ? 4.2 : 3);
        if (big) say(e.actor, LINES.boom, 1.2);
      } else if (e.type === "net") {
        fx.burst(e.x, e.y, e.z, 10, NET_BITS, 1.8);
        if (me) { center("NETTED!", 900); notice("Tangled! Slow and no jumping for a few seconds", 2200); }
        say(e.actor, LINES.net, 1.4);
      } else if (e.type === "netmiss") fx.burst(e.x, e.y, e.z, 6, NET_BITS, 1.2);
      else if (e.type === "refill") { if (me) { notice("Refilled: grenades, rockets, nets and crates", 1600); updateTools(); } }
      else if (e.type === "throw") { if (e.actor === you) updateTools(); }
      else if (e.type === "gunfire") { if (me && tool === "ak") updateTools(); }
      else if (e.type === "boing") {
        fx.burst(e.x, 0.3, e.z, 6, ORANGE_BITS, 1.4);
        if (me && !trampSeen) { trampSeen = true; notice("BOING! Jump again at the top to go even higher", 2400); }
      } else if (e.type === "cache") { fx.burst(e.x, e.y + 0.5, e.z, 10, ORANGE_BITS, 1.6); if (me) { notice("Ammo cache! Grenades, rockets, nets and crates refilled", 1800); updateTools(); } }
      else if (e.type === "climbed") { if (me) updateTools(); }
      else if (e.type === "zip") { if (me) { center("ZIP!", 700); notice("Space lets go early", 1600); } }
      else if (e.type === "unzip") { if (me) updateTools(); }
      else if (e.type === "waiting") {
        if (me) { center("NOT YET!", 1200); notice("Your own block isn't home, so you can't score. Hold on here while your team brings it back, or go get it", 4000); }
        else if (mine) notice("Teammate is waiting at our stand · get our block home so they can score", 3000);
      } else if (e.type === "lift" || e.type === "set") {
        if (e.actor === you) updateTools();
        if (e.type === "set") fx.burst(e.x, e.y + 0.2, e.z, 6, WOOD_BITS, 1.2);
        if (e.type === "lift" && e.actor === you) notice("Crate up! Click throws it · F sets it down or stacks it", 2200);
      } else if (e.type === "smash") fx.burst(e.x, e.y + 0.4, e.z, 14, WOOD_BITS, 2.4);
      else if (e.type === "bonk") {
        fx.burst(e.x, e.y + 0.8, e.z, 14, STAR_BITS, 2.2);
        if (me) { center("BONK!", 900); notice("Crate to the head! Seeing stars…", 2000); }
        say(e.actor, LINES.bonk, 1.3);
      } else if (e.type === "pass") {
        if (me) notice("Block thrown! A teammate can catch it", 1500);
        else if (mine) notice("Pass! Catch it", 1500);
        else notice("They threw a block · intercept it!", 1500);
      } else if (e.type === "landed") fx.burst(e.x, e.y + 0.3, e.z, 8, e.team === "blue" ? PAINT_BITS.blue : PAINT_BITS.red, 1.4);
      else if (e.type === "winded") { if (me) notice("Out of breath! Sprint refills in a moment", 1400); }
      else if (e.type === "weather") {
        const w = sim.weather.kind, fee = sim.live === "storm" && w === "storm" ? ` · mempool fees ${Math.round(live.fee)} sat/vB` : "";
        notice((w === "storm" ? "A storm rolls in! Watch for lightning" : "The sky clears") + fee, 2800);
      } else if (e.type === "power") {
        const kind = SIM.POWERS[e.y], who = me ? "You" : mine ? "Teammate" : "They";
        fx.burst(e.x, 1.1, e.z, 16, kind === "laser" ? PAINT_BITS.red : kind === "cold" ? PAINT_BITS.blue : ORANGE_BITS, 2.6);
        if (me || mine) audio.cues.power();
        const words = {
          boots: me ? "LIGHTNING BOOTS! Run!" : `${who} grabbed lightning boots`,
          halving: mine ? "THE HALVING! Our splats last half as long" : "They halved their splats for a while",
          cold: mine ? "COLD STORAGE! Our block is frozen on its stand" : "Their block is in cold storage · it can't be taken for a bit",
          laser: me ? (COARSE ? "LASER EYES! Tap Paint! for one long beam from your eyes (3 s) · turn to sweep it" : "LASER EYES! Click for one long beam from your eyes (3 s) · turn to sweep it") : `${who} got laser eyes`,
          monkeys: me ? "MONKEYS! When you shoot, they fire heat-seeking missiles at the nearest rival" : `${who} got the monkeys`
        };
        if (me) center(kind === "boots" ? "⚡ BOOTS!" : kind === "laser" ? "LASER EYES!" : kind === "cold" ? "COLD STORAGE!" : kind === "monkeys" ? "MONKEYS!" : "HALVING!", 900);
        notice(words[kind], 2600);
        updateStrip();
      } else if (e.type === "enemycat") {
        for (const c of catapults) if (c.team === e.team) c.at = sceneTime;
        audio.cues.boing(1);
        if (me) { center("WRONG CATAPULT!", 1100); notice("Jetpack back (Space), hook the rim, or fall and respawn at home", 2600); }
      } else if (e.type === "ziptrap") {
        fx.burst(e.x, e.y + 0.4, e.z, 14, WOOD_BITS, 2.4);
        audio.cues.boing(1);
        if (me) { center("TRAP DOOR!", 1100); notice("Their zipline only carries you while your own block is home · jetpack back (Space), hook the rim, or fall", 3200); }
      } else if (e.type === "launch") {
        for (const c of catapults) if (c.team === e.team) c.at = sceneTime;
        fx.burst(e.x, 1, e.z, 14, WOOD_BITS, 2.4);
        audio.cues.boom(me ? 0.6 : 0.3);
        if (me) { center("LAUNCH!", 900); }
      } else if (e.type === "chute") {
        audio.cues.zipOn();
        if (me) notice("Parachute open · steer with W A S D · shoot on the way down", 2600);
      } else if (e.type === "touchdown") { if (me) notice("Touchdown in their fort!", 1400); }
      else if (e.type === "gold") {
        fx.burst(e.x, e.y + 1.4, e.z, 24, ORANGE_BITS, 3);
        audio.cues.power();
        if (me) {
          center("GOLDEN DUAL AKs!", 1200);
          notice(e.by >= 0 && e.by !== e.actor ? `${nameOf(e.by)} mined a block: the Golden Dual AKs are yours (6) · a hook can take them while they're out` : COARSE ? "One in each hand, full auto! Hold Paint · a hook can take them while they're out" : "One in each hand, full auto! Hold click (6) · a hook can take them while they're out", 4000);
          chooseTool("gold");
        } else notice(mine ? `${nameOf(e.actor)} has the Golden Dual AKs!` : "They won the Golden Dual AKs · hook them away, or mine a block", 2600);
        updateTools();
      } else if (e.type === "goldsteal") {
        fx.burst(e.x, e.y, e.z, 18, ORANGE_BITS, 2.6);
        if (me) { center("STOLEN!", 1000); notice("A mined block took their Golden Dual AKs! They're yours (6)", 3000); audio.cues.rescue(); chooseTool("gold"); }
        else if (e.by === you) { center("AKs STOLEN!", 1000); notice("They mined a block and took your Golden Dual AKs", 2600); if (tool === "gold") chooseTool("paint"); }
        else if (mine) notice(`${nameOf(e.actor)} has the Golden Dual AKs!`, 2200);
        updateTools();
      } else if (e.type === "reload") {
        if (me) { notice("Reloading…", 1000); audio.cues.crate(0.6); updateTools(); }
      } else if (e.type === "reloaded") {
        if (me) { audio.cues.rifle(); updateTools(); }
      } else if (e.type === "slip") {
        fx.burst(e.x, 0.3, e.z, 8, ORANGE_BITS, 1.6);
        if (me) { center("SLIP!", 900); notice("Banana peel! Spinning…", 1500); }
      } else if (e.type === "hopon") {
        audio.cues.jump(); audio.cues.pass(0.4);
        if (me) { center("PIGGYBACK!", 800); notice(`On ${nameOf(e.by)}'s back · aim and shoot · Space (or H) hops off`, 2600); }
        else if (e.by === you) { center("PIGGYBACK!", 800); notice(`${nameOf(e.actor)} is on your back, shooting for you · they stay on even if you're splatted`, 2600); }
        else say(e.actor, ["Giddy up!", "Onward!", "Hup!"], 1.2);
      } else if (e.type === "hopoff") { if (me) notice("Back on your feet", 900); }
      else if (e.type === "laseron") {
        audio.cues.laser(me ? 1 : 0.5);
        if (me) center("LASERS!", 800);
      } else if (e.type === "boo") {
        fx.burst(e.x, e.y, e.z, 14, GHOST_BITS, 2.2);
        if (me) { center("BOO!", 900); notice(sim.actors[0].carrying ? "Spooked stiff!" : "Spooked stiff! Shoot ghosts to pop them", 1600); }
        else say(e.actor, ["Eek!", "A g-g-ghost!", "Nope nope nope"], 1.3);
      } else if (e.type === "ghostpop") fx.burst(e.x, e.y, e.z, 16, GHOST_BITS, 2.6);
      else if (e.type === "grab") {
        fx.burst(e.x, 1.6, e.z, 12, WOOD_BITS, 2.2);
        gorillaPoke(e.actor);
        if (me) {
          center("GRABBED!", 1000);
          notice("A gorilla has you by the feet! Fill the meter to break free", 2200);
        } else say(e.actor, LINES.bonk, 1.3);
      } else if (e.type === "breakfree") { fx.burst(e.x, e.y + 0.8, e.z, 10, STAR_BITS, 2); if (me) { center("FREE!", 800); notice("Run before it grabs you again!", 1500); } }
      else if (e.type === "letgo") { if (me) notice("The gorilla got bored and dropped you", 1500); }
      else if (e.type === "boltwarn") { if (e.actor === you) { center("LIGHTNING!", 700); notice("Lightning coming · move!", 1300); } }
      else if (e.type === "bolt") {
        audio.cues.thunder();
        boltNode.visible = detail.full; setVec(boltNode.position, e.x, 0, e.z); flashSeen = sim.time + 0.16;
        if (detail.full && !hookStill) flash = 1;
        fx.burst(e.x, 0.6, e.z, 12, STAR_BITS, 2.2);
      }
      else if (e.type === "puddle") { if (me) notice("Slipped in a puddle!", 900); }
      else if (e.type === "windup") { if (me) notice("It's swinging you! Mash!", 900); }
      else if (e.type === "thrown") { if (me) { center("THROWN!", 1000); notice(COARSE ? "Hold Jump to jetpack back over the edge" : "Hold Space to jetpack back over the edge", 2800); } }
      else if (e.type === "gorillahit") fx.burst(e.x, e.y, e.z, 10, STAR_BITS, 2);
      else if (e.type === "steady") { if (me) notice("Back on your feet", 900); }
      else if (e.type === "burn") {
        fx.burst(e.x, 0.4, e.z, 14, ORANGE_BITS, 2.4);
        if (me) {
          center("HOT FEET!", 1000);
          notice(burnSeen ? "Hot feet! Jump 3 times to cool them" : "OUCH! You stepped in the fire · jump 3 times (Space) to cool your feet before you can run or throw", 3600);
          burnSeen = true;
        }
      } else if (e.type === "jump" && me && sim.actors[0].burnt > 0) notice(`Hop! ${sim.actors[0].burnt} more to cool off`, 900);
      else if (e.type === "cooled") { if (me) notice("Feet cooled · back in the game!", 1400); }
      else if (e.type === "mined") {
        center(e.x ? `BLOCK ${e.x}!` : "BLOCK FOUND!", 1500);
        notice("A real Bitcoin block was just mined: every quiz pad and ammo cache is ready again", 3200);
        audio.cues.block();
        for (const c of SIM.ARENAS[sim.map].caches) fx.burst(c[0], c[1] + 0.6, c[2], 10, ORANGE_BITS, 2);
      } else if (e.type === "trap") {
        fx.burst(e.x, 1, e.z, 12, QUIZ_BITS, 2);
        if (me) { center("QUIZ TRAP!", 1000); openQuiz(); }
        else say(e.actor, LINES.trap, 2);
      } else if (e.type === "escape") {
        fx.burst(e.x, 1.2, e.z, 14, QUIZ_BITS, 2.6);
        if (!me) say(e.actor, LINES.free, 1.4);
      } else if (e.type === "timeout") {
        fx.burst(e.x, 1.2, e.z, 10, QUIZ_BITS, 2);
        if (me) { leaveQuiz(); notice("The bubble wore off. Run!", 2200); }
      } else if (e.type === "win") say(e.actor, LINES.win, 2.4);
    }
    } finally { sim.eventCount = 0; }
  };

  // Space and the act button start a round from the board or the results; in play they fall through to the jump.
  // Space (or the touch act button) uses what stands beside the Ooga, as on the island: a catapult or
  // a tower's zipline; anywhere else it jumps. On the board and the results it starts a round.
  const act = () => {
    if (phase === "board" || phase === "results") return beginFromMenu();
    if (phase !== "play" || paused || quiz.open) return false;
    const a = sim.actors[0];
    if (!SIM.nearCatapult(sim, a) && !SIM.nearEnemyCatapult(sim, a) && !SIM.nearZip(sim, a)) return false;
    return zipNow();
  };
  // Paint along the camera's look, lobbed a little higher when the camera looks up.
  // In first person the ball goes where the eye looks, less the lob the throw adds.
  const lookUp = () => clamp(-(cam.pitch - 0.28) * 1.6, -1.4, 1.4);
  // Grenades lob higher; the chase camera's tilt still nudges every throw up or down.
  // Aiming: the crosshair is the middle of the view, so a throw goes from the Ooga toward wherever the camera's
  // centre ray meets something (or 30 m out), less the lift the throw adds itself; a grenade arcs higher.
  const AIM = { x: 0, y: 0, z: 0 };
  const aimPoint = () => {
    if (cam.island) return islandAim();
    const p = camera.position, t = camera.target;
    let fx = t.x - p.x, fy = t.y - p.y, fz = t.z - p.z;
    const l = Math.hypot(fx, fy, fz) || 1;
    fx /= l; fy /= l; fz /= l;
    // Start past the Ooga so the ray never stops on the Ooga's own spot.
    let d = cam.first ? 0.5 : cam.dist + 0.4;
    for (; d < 30; d += 0.4) if (SIM.solidAt(p.x + fx * d, p.y + fy * d, p.z + fz * d)) break;
    AIM.x = p.x + fx * d; AIM.y = p.y + fy * d; AIM.z = p.z + fz * d;
    return AIM;
  };
  // In the Island view a throw goes where the pointer is, on a level with the Ooga's chest (straight ahead on a touch
  // screen, or before the pointer has moved).
  const islandAim = () => {
    const me = sim.actors[0], y0 = me.y + C.SHOT_Y;
    const ahead = () => { AIM.x = me.x + Math.sin(cam.face) * 12; AIM.y = y0; AIM.z = me.z + Math.cos(cam.face) * 12; return AIM; };
    if (COARSE || !pointer.seen) return ahead();
    const p = camera.position, t = camera.target, r = el.canvas.getBoundingClientRect();
    let fx = t.x - p.x, fy = t.y - p.y, fz = t.z - p.z;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    // Right = forward × up, up = right × forward.
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const tan = Math.tan(camera.fov / 2), aspect = r.width / (r.height || 1);
    const nx = ((pointer.x - r.left) / (r.width || 1)) * 2 - 1, ny = 1 - ((pointer.y - r.top) / (r.height || 1)) * 2;
    const dx = fx + rx * nx * tan * aspect + ux * ny * tan, dy = fy + uy * ny * tan, dz = fz + rz * nx * tan * aspect + uz * ny * tan;
    if (dy > -0.01) return ahead();
    const k = (y0 - p.y) / dy;
    AIM.x = p.x + dx * k; AIM.y = y0; AIM.z = p.z + dz * k;
    // Too close to throw at (the Ooga itself): straight ahead instead.
    if (Math.hypot(AIM.x - me.x, AIM.z - me.z) < 1.2) return ahead();
    // In the Island view the Ooga turns to face its throw.
    cam.face = Math.atan2(AIM.x - me.x, AIM.z - me.z);
    return AIM;
  };
  const paint = () => {
    if (!inRound()) return false;
    // In a gorilla's hands a click or tap is a struggle press, like Space.
    if (sim.actors[0].grabbed) { move.jump = 1; return true; }
    if (sim.actors[0].flight === 2) return acts("cutChute", 0);
    // Laser eyes ready: whatever is in hand, the click lets them loose.
    { const me = sim.actors[0]; if (me.laser > 0 && me.beam <= 0 && !me.holding) return acts("fire", 0, cam.face, 0, "paint"); }
    const a = sim.actors[0], q = aimPoint(), oy = a.y + (a.crouch ? C.CROUCH_H - 0.25 : C.SHOT_Y);
    // With Lift chosen and empty hands, a click lifts the crate in front; holding a crate, a throw throws the crate.
    if (tool === "grab" && !a.holding) return grabCrate();
    if (tool === "hook" && !a.holding) return hookNow();
    if (a.holding) {
      const cdx = q.x - a.x, cdz = q.z - a.z, cflat = Math.hypot(cdx, cdz) || 1;
      const thrown = acts("fire", 0, Math.atan2(cdx, cdz), clamp(Math.atan2(q.y - a.y - 1.7, cflat) - 0.05, -0.6, 0.6), "crate");
      if (!thrown && a.splat > 0) notice(`Splatted · throwing again in ${Math.ceil(a.splat)} s`, 900);
      else if (thrown && tool !== "grab") notice(`Crate thrown · ${tool} ready`, 900);
      return thrown;
    }
    const dx = q.x - a.x, dz = q.z - a.z, flat = Math.hypot(dx, dz) || 1;
    const lob = tool === "grenade" ? 0.3 : tool === "rocket" || tool === "sniper" ? 0 : tool === "net" ? -0.02 : SIM.flatPitch(flat, SIM.TOOLS[tool]);
    const pitch = clamp(Math.atan2(q.y - oy, flat) + lob, -1.4, 1.4);
    const ok = acts("fire", 0, Math.atan2(dx, dz), pitch, tool);
    // Say why a throw didn't go, so the tools never seem locked: paint on you, a quiz bubble, or an empty tool.
    if (!ok && a.splat > 0) notice(`Splatted · throwing again in ${Math.ceil(a.splat)} s`, 900);
    else if (!ok && a.trapped > 0) notice("Answer the question to get out first", 1100);
    else if (!ok && tool === "gold" && !a.gold) notice("Mine a block to win the Golden Dual AKs, or hook them out of a rival's hands", 1800);
    else if (!ok && tool !== "paint" && a[tool] <= 0) notice(`Out of ${tool}s · refill on your stand or an ammo cache`, 1400);
    return ok;
  };
  // The grappling hook: at the crosshair, or, bitten or latched already, let go. R works whichever tool is in hand.
  const hookNow = () => {
    if (!inRound()) return false;
    const a = sim.actors[0];
    if (!a.hook) { notice("No hook yet · two hide in caves, on rocks and up trees, or shoot one away with the Golden AKs", 2000); return false; }
    const q = aimPoint(), oy = a.y + (a.crouch ? C.CROUCH_H - 0.25 : C.SHOT_Y), dx = q.x - a.x, dz = q.z - a.z, flat = Math.hypot(dx, dz) || 1;
    const ok = acts("grapple", 0, Math.atan2(dx, dz), clamp(Math.atan2(q.y - oy, flat), -1.45, 1.45));
    return ok;
  };
  const scoped = () => tool === "sniper" && !!sim && cam.first;
  const zoomScope = (dir) => {
    scope.zoom = clamp(scope.zoom + dir, 0, ZOOMS.length - 1);
    notice(`Scope ${scope.zoom + 1}×`, 600);
  };
  const TOOL_NAMES = { paint: "1 · Paint marker", grenade: "2 · Grenade launcher", rocket: "3 · Rocket launcher", net: "4 · Net launcher", sniper: "5 · Sniper rifle", gold: "6 · Golden Dual AKs", ak: "7 · Ooga AK", hook: "8 · Grappling hook", grab: "Lift" };
  // The chosen weapon's name stands over its slot for as long as it is chosen (over the bar's end when the slots are
  // hidden or it has none, as Lift). Measured only when the choice, the bar or the page's size changes, never per frame.
  const hideToolName = () => { el.toolName.dataset.show = "false"; };
  const placeToolName = () => {
    const n = el.toolName, b = bar.min ? null : el.tools.find((s) => s.dataset.tool === tool && s.parentNode.classList.contains("block-slots"));
    if (!b) { delete n.dataset.at; n.style.left = ""; return; }
    const half = n.offsetWidth / 2, x = clamp(b.offsetLeft + b.offsetWidth / 2, half, Math.max(half, el.toolBar.offsetWidth - half));
    n.dataset.at = "slot"; n.style.left = `${x}px`;
  };
  const showToolName = (k) => {
    if (!TOOL_NAMES[k]) return;
    el.toolName.textContent = TOOL_NAMES[k];
    el.toolName.dataset.show = "true";
    placeToolName();
  };
  const chooseTool = (k) => {
    // The rifle out starts at the scope's widest step; put away, the view goes back if the scope changed it.
    if (k === "sniper" && tool !== "sniper") scope.zoom = 0;
    else if (k !== "sniper" && tool === "sniper") {
      if (scope.on && !scope.first && cam.first) setMode(scope.island ? "island" : "chase", true);
      scope.on = false;
    }
    // Say the new weapon, whatever changed it, so it shows with the bar hidden too.
    tool = k;
    showToolName(k);
    // A guest tells the host what is in hand, only when it changes: it decides what a hook or Golden AK fire can take.
    if (round && round.role === "guest") acts("wield", 0, SIM.WIELD.indexOf(k));
    updateTools();
  };
  // The next tool along (or back), skipping any that are empty, then Lift for the crates; G steps through them.
  const ORDER = ["paint", "ak", "grenade", "rocket", "net", "gold", "sniper", "hook", "grab"];
  const cycleTool = (dir = 1) => {
    const a = sim.actors[0];
    let i = ORDER.indexOf(tool);
    for (let n = 0; n < ORDER.length; n++) {
      i = (i + dir + ORDER.length) % ORDER.length;
      if (ORDER[i] === "paint" || ORDER[i] === "ak" || ORDER[i] === "grab" || a[ORDER[i]] > 0) break;
    }
    chooseTool(ORDER[i]);
  };
  // Right click aims, as on the island: with the sniper rifle out it steps the scope in (round to its widest); in the Island view it
  // returns to the chase camera; otherwise holding it narrows the view to aim. G and the number keys switch weapons.
  const onRightDown = (e) => {
    if (e.button !== 2 || phase !== "play" || paused) return;
    e.preventDefault();
    if (scoped()) zoomScope(scope.zoom >= ZOOMS.length - 1 ? -(ZOOMS.length - 1) : 1);
    // With the rifle out, right click brings the scope up; putting the rifle away puts the view back.
    else if (tool === "sniper" && !cam.first) { scope.on = true; scope.first = false; scope.island = cam.island; scope.zoom = 0; setMode("first", true); }
    else if (cam.island) setMode("chase");
    else aiming = true;
  };
  const noMenu = (e) => { if (phase === "play") e.preventDefault(); };
  const buildCrate = () => {
    if (!inRound()) return false;
    if (acts("build", 0, cam.face)) {
      const n = sim.actors[0].crates;
      notice(`Crate down! ${n ? `${n} left` : "That was your last · your stand or a cache gives you more"}`, 1200);
      return true;
    }
    const a = sim.actors[0];
    const ownHalf = (a.team === "blue" ? a.z : -a.z) >= 2;
    notice(a.crates <= 0 ? "No crates left · your stand or an ammo cache gives you 3 more" : !a.grounded ? "Land first, then drop a crate" : !ownHalf ? "Crates only go down on your own half" : "No room there · face open ground and try again", 1600);
    return false;
  };
  let hookBusy = false;
  // The weapons bar: bottom right unless moved, minimized or not, remembered for this visitor. Touch keeps its safe
  // default spot (no dragging) so the bar never sits under the sticks.
  const BAR_KEY = "ooga-block-bar", bar = { x: null, y: null, min: false };
  const saveBar = () => { try { localStorage.setItem(BAR_KEY, JSON.stringify(bar)); } catch { /* kept this visit */ } };
  const placeBar = () => {
    const t = el.toolBar;
    t.dataset.min = String(bar.min);
    el.barMin.setAttribute("aria-pressed", String(bar.min));
    el.barMin.textContent = bar.min ? "+" : "–";
    if (COARSE || bar.x === null) { t.style.left = t.style.top = t.style.right = t.style.bottom = ""; if (el.toolName && el.toolName.dataset.show === "true") placeToolName(); return; }
    const box = t.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    bar.x = clamp(bar.x, 0, Math.max(0, W - box.width)); bar.y = clamp(bar.y, 0, Math.max(0, H - box.height));
    t.style.right = t.style.bottom = "auto"; t.style.left = `${bar.x}px`; t.style.top = `${bar.y}px`;
    if (el.toolName && el.toolName.dataset.show === "true") placeToolName();
  };
  const toggleBar = () => { bar.min = !bar.min; placeBar(); saveBar(); };
  const onBarDown = (e) => {
    if (COARSE || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = el.toolBar.getBoundingClientRect();
    el.barDrag = { id: e.pointerId, dx: e.clientX - box.left, dy: e.clientY - box.top };
  };
  const onBarMove = (e) => {
    if (!el.barDrag || e.pointerId !== el.barDrag.id) return;
    bar.x = e.clientX - el.barDrag.dx; bar.y = e.clientY - el.barDrag.dy;
    placeBar();
  };
  const onBarUp = (e) => { if (el.barDrag && e.pointerId === el.barDrag.id) { el.barDrag = null; saveBar(); } };
  const updateTools = () => {
    if (!sim || !el.tools) return;
    const a = sim.actors[0];
    for (const b of el.tools) {
      const k = b.dataset.tool;
      b.setAttribute("aria-pressed", String(k === tool));
      const n = b.querySelector("b");
      if (n) n.textContent = SIM.slotCount(a, k);
      // A weapon's slot says which it is: not yet yours (dim, no count), yours and out (a red 0), or ready.
      if (GUN_OF[k] >= 0 && k !== "crate") {
        const state = SIM.slotState(a, k);
        if (b.dataset.state !== state) b.dataset.state = state;
        if (k !== "paint" && k !== "sniper" && k !== "ak") b.disabled = state !== "ready";
      }
      if (k === "pass") b.disabled = !a.carrying && !a.holding;
      if (k === "zip") b.disabled = !SIM.nearZip(sim, a) && !SIM.nearCatapult(sim, a) && !SIM.nearEnemyCatapult(sim, a);
      if (k === "grab") b.setAttribute("aria-pressed", String(a.holding || tool === "grab"));
    }
  };
  const onArrow = (e) => {
    if (panelLive()) return;
    const down = e.type === "keydown" ? 1 : 0;
    if (e.key === "ArrowLeft") arrows.left = down;
    else if (e.key === "ArrowRight") arrows.right = down;
  };
  // Losing focus lets go of every key this scene reads itself (the shared controls clear their own).
  const onArrowBlur = () => { arrows.left = arrows.right = 0; move.crouch = 0; };
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ mode: cam.island ? "island" : cam.first ? "first" : "chase", zoom: cam.zoom, islandZoom: cam.islandZoom })); } catch { /* kept this visit */ } };
  // Three views, V going round them: the chase camera, first person, and the Island view.
  const setMode = (mode, quiet = false) => {
    const wasIsland = cam.island;
    cam.first = mode === "first";
    cam.island = mode === "island";
    cam.warm = false;
    if (cam.island && !wasIsland) cam.orbit = cam.face;
    if (!cam.island && wasIsland) cam.yaw = cam.face;
    el.cross.hidden = phase !== "play" || cam.island || (COARSE && !cam.first);
    el.viewBtn.setAttribute("aria-pressed", String(mode !== "chase"));
    if (cam.island && locked()) document.exitPointerLock();
    // Switching on from a key or a click is a gesture, so the mouse can lock straight away.
    if (cam.first) lockMouse();
    saveView();
    if (quiet) return;
    notice(cam.first ? (COARSE ? "First person · drag to aim" : "First person · move the mouse to aim · V for the Island view")
      : cam.island ? (COARSE ? "Island view · the stick runs where the screen faces" : "Island view · W A S D run where the screen faces · Q E or ← → turn the camera · click throws at the pointer · V for the chase camera")
      : (COARSE ? "Chase camera" : "Chase camera · W A S D move · X or a click captures the mouse to turn · V for first person"), 3200);
  };
  const setView = (first) => setMode(first ? "first" : "chase");
  const cycleView = () => setMode(cam.island ? "chase" : cam.first ? "island" : "first");
  // X captures the mouse for turning and aiming, or lets it go: the island's carry/combat switch.
  const toggleMouseLook = () => {
    if (locked()) { document.exitPointerLock(); return; }
    if (cam.island) { notice("The Island view keeps the pointer · V for the chase camera", 1400); return; }
    lockMouse();
  };
  // Mouse look, as a shooter has it: the first click on the view locks the mouse (and throws), then moving the mouse
  // or touchpad turns the view in either camera, the world swinging round the Ooga, which turns with it to face the
  // aim. Unlocked, a plain move still aims in first person; in the chase camera a drag turns it (the orbit hook).
  // Escape lets the mouse go.
  const locked = () => document.pointerLockElement === el.canvas;
  const onLockedMove = (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true;
    if (phase !== "play" || quiz.open || cam.island) return;
    if (!locked() && (!cam.first || e.buttons !== 0)) return;
    // Zoomed in, the same move turns the view less, so a far shot can be lined up.
    const k = camera.fov / (58 * Math.PI / 180);
    cam.face = wrap(cam.face - e.movementX * 2.6e-3 * k);
    cam.pitch = cam.first ? clamp(cam.pitch + e.movementY * 2.2e-3 * k, -0.7, 1.15) : clamp(cam.pitch + e.movementY * 2.2e-3, CAM.pitch[0], CAM.pitch[1]);
  };
  const lockMouse = () => {
    if (COARSE || locked() || !el.canvas.requestPointerLock || panelLive() || quiz.open) return;
    const lock = el.canvas.requestPointerLock();
    if (lock && lock.catch) lock.catch(() => { });
  };
  const onLockedDown = (e) => {
    audio.unlock();
    if (phase === "play" && paused && e.button === 0) { setPaused(false); return; }
    if (phase !== "play" || e.button !== 0 || quiz.open) return;
    trigger = true;
    paint();
    if (!cam.island) lockMouse();
  };
  // The trigger is held from the press until the button comes up anywhere; with the AK it fires on full auto.
  let trigger = false;
  const onTriggerUp = (e) => {
    if (e.button === 0 || e.type === "pointerup" || e.type === "pointercancel" || e.type === "blur") trigger = false;
    if (e.button === 2 || e.type === "pointercancel" || e.type === "blur") aiming = false;
  };
  // In a round Tab (or T, or the Pass button) throws what is in hand, wherever the focus is: caught first, before the
  // page's own key routing (which leaves Tab on a focused button to the browser) and before the browser moves the focus.
  // A game choice: on the island the first Tab frees a captured mouse; here Escape or X does.
  const onTabKey = (e) => {
    if (e.key !== "Tab" || phase !== "play" || quiz.open || paused || panelLive()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!e.repeat) passBlock();
  };
  // B places a crate. The page keeps B for itself outside debug (test bananas), so it is heard here directly.
  // Caught first, as Tab is: a menu control left focused (the Ooga picker, a button) would otherwise take the key, and
  // only a text field keeps it.
  const onBuildKey = (e) => {
    if ((e.key !== "b" && e.key !== "B" && e.code !== "KeyB") || !inRound() || quiz.open || e.metaKey || e.ctrlKey || e.altKey || panelLive()) return;
    const t = e.target;
    if (t && (t.isContentEditable || (t.closest && t.closest("input, textarea")))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!e.repeat) buildCrate();
  };
  // A number key picks its tool; one you don't have says where to get it instead.
  const keyTool = (k) => {
    const a = sim.actors[0];
    if (k === "hook") {
      if (!a.hook) { notice("No hook yet · two hide in caves, on rocks and up trees, or shoot one away with the Golden AKs", 2000); return; }
      chooseTool(k); return;
    }
    if (k === "gold" && !a.gold) { notice("No Golden Dual AKs yet · mine a block to win them, or hook them out of a rival's hands", 1800); return; }
    chooseTool(k);
  };
  const onCrouchKey = (e) => { if (!panelLive() && (e.key === "c" || e.key === "C")) move.crouch = e.type === "keydown" ? 1 : 0; };
  // Pick up the crate in front, or set the held one down (stacking it on a crate there).
  const grabCrate = () => {
    if (!inRound()) return false;
    if (acts("grab", 0, cam.face)) return true;
    const a = sim.actors[0];
    notice(a.holding ? "No room to set it there (stacks go three high)" : a.carrying ? "Hands full with the block" : "No crate in reach · face one and press F", 1200);
    return false;
  };
  // Throw whatever is in hand: a held crate toward the crosshair, or the carried block straight ahead
  // for a teammate to catch.
  const passBlock = () => {
    if (!inRound()) return false;
    if (sim.actors[0].holding) return paint();
    if (acts("pass", 0, cam.face)) return true;
    notice("Nothing to throw · pick up a block or a crate with F", 1100);
    return false;
  };
  // Ride your tower's zipline down into the rival fort, from the platform by its gap.
  const zipNow = () => {
    if (!inRound()) return false;
    // A guest's action is only a request, so it picks here what the host would have tried first.
    const a = sim.actors[0], guest = !!round && round.role === "guest";
    if ((!guest || SIM.nearCatapult(sim, a) || SIM.nearEnemyCatapult(sim, a)) && acts("launch", 0)) return true;
    if (acts("zip", 0, cam.face)) return true;
    if (cam.island) return false;
    notice(sim.prep > 0 ? "The zipline opens when the round starts" : a.holding ? "Put the crate down first (F)" : "Climb a tower's ladder and stand by the cable to ride", 1600);
    return false;
  };
  // Piggyback: H climbs on the nearest teammate's back (H again, or Space, gets down); J calls a bot teammate to
  // climb on yours.
  const piggyback = () => {
    if (!inRound()) return false;
    const me = sim.actors[0];
    if (me.ride) { move.jump = 1; return true; }
    if (acts("hopOn", 0)) return true;
    notice(me.rider ? "You've already got someone on your back" : "No teammate close enough to climb on · J calls one to ride on you", 1600);
    return false;
  };
  const callRider = () => {
    if (!inRound()) return false;
    if (acts("callRide", 0)) { notice("Calling a teammate to climb on your back…", 1600); return true; }
    return false;
  };
  const dropBlock = () => {
    if (!inRound()) return false;
    if ((!(round && round.role === "guest") || sim.actors[0].carrying) && acts("drop", 0)) return true;
    notice("Nothing to drop", 900);
    return false;
  };

  // Steering, as the island has it: W A S D (and the move stick) run the Ooga forward, back and sideways from where it
  // faces; a captured mouse, Q E, the arrows and the look stick turn it, the chase camera swinging round behind.
  const TURN = 2.7;
  const readInput = (dt) => {
    // A captive only struggles: E counts as a press there (`onKey`), so the keys and stick don't turn it as well.
    const a = controls.read(), held = sim.actors[0].grabbed > 0, turnKeys = held ? 0 : arrows.left - arrows.right, yawIn = held ? 0 : a.yaw;
    if (cam.island) {
      // Island view: the camera swings on Q E and the arrows; the stick or W A S D run the way the screen faces, and
      // the Ooga turns to face where it runs.
      const side = clamp(a.x + turnKeys, -1, 1);
      cam.orbit = wrap(cam.orbit + (yawIn + turnKeys) * TURN * 0.8 * dt);
      const ox = Math.sin(cam.orbit), oz = Math.cos(cam.orbit), rx = -Math.cos(cam.orbit), rz = Math.sin(cam.orbit);
      let mx = ox * a.y + rx * side, mz = oz * a.y + rz * side;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      move.x = mx; move.z = mz;
      if (l > 0.15) cam.face = Math.atan2(mx, mz);
    } else {
      cam.face = wrap(cam.face + (yawIn + turnKeys) * TURN * dt);
      const side = clamp(a.x + turnKeys, -1, 1), f = clamp(a.y, -1, 1);
      const fx2 = Math.sin(cam.face), fz = Math.cos(cam.face), rx = -Math.cos(cam.face), rz = Math.sin(cam.face);
      let mx = fx2 * f + rx * side, mz = fz * f + rz * side;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      move.x = mx; move.z = mz;
    }
    move.sprint = a.sprint;
    move.face = cam.face;
    if (quiz.open) move.crouch = 0;
    const up = a.up > 0;
    // A new press waits for the sim to use it (it clears `jump`), however many substeps this frame runs, even none.
    if (up && !jumpWas) move.jump = 1;
    // Space held is the jetpack's throttle.
    move.jet = up ? 1 : 0;
    jumpWas = up;
  };
  // Each pet heads for a spot a little behind and beside its Ooga, trots there at up to sprint pace with a hop in its
  // step, sits when it arrives, and jumps straight to its Ooga if it falls far behind (a roof, a double jump).
  const PET_BACK = 1.1, PET_SIDE = 0.6, PET_SPEED = 9.5;
  // Up in the air (jetting, flung, on a zipline or well over what's under it), the dog flies along on a little jetpack
  // of its own, as the island's adopted dogs do: behind its Ooga and a little below, then down onto open ground.
  const PET_FLY_BACK = 1.7, PET_FLY_DROP = 0.5, PET_FLY_SPEED = 16;
  const poseCompanions = (dt, elapsed) => {
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i], p = a.pet;
      if (!p) continue;
      const s = sim.actors[i], h = a.body.rotation.y;
      const under = SIM.groundAt(s.x, s.z, s.y + 0.1, 0.15);
      const flying = phase === "play" && !s.grounded && (s.jetting || s.flight || s.riding || s.y - under > 1.2);
      if (!p.jet) {
        p.jet = createNode({ geometry: BM.jetpack(TEAM_INDEX[s.team]), position: { x: 0, y: 0.32, z: -0.18 }, scale: { x: 0.55, y: 0.55, z: 0.55 }, visible: false });
        p.flame = createNode({ geometry: BM.jetFlames(), visible: false });
        addChild(p.jet, p.flame);
        addChild(p.node, p.jet);
      }
      if (flying || p.air) {
        // Flying: chase a point behind and below, then (its Ooga down) come straight down beside it.
        const tx = s.x - Math.sin(h) * (flying ? PET_FLY_BACK : PET_BACK) + Math.cos(h) * PET_SIDE;
        const tz = s.z - Math.cos(h) * (flying ? PET_FLY_BACK : PET_BACK) - Math.sin(h) * PET_SIDE;
        const ty = flying ? Math.max(SIM.groundAt(tx, tz, s.y, 0.15), s.y - PET_FLY_DROP) : SIM.groundAt(tx, tz, s.y + 0.1, 0.15);
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, d = Math.hypot(dx, dy, dz);
        const step = Math.min(d, PET_FLY_SPEED * dt * Math.min(1, d / 2 + 0.3));
        if (d > 0.01) { p.x += dx / d * step; p.y += dy / d * step; p.z += dz / d * step; }
        if (Math.hypot(dx, dz) > 0.2) p.heading = Math.atan2(dx, dz);
        p.air = flying || d > 0.15;
        p.warm = true;
        p.jet.visible = p.flame.visible = p.air;
        p.flame.scale.y = 0.8 + Math.random() * 0.4;
        setVec(p.node.position, p.x, p.y + (p.air ? Math.sin(elapsed * 7) * 0.05 : 0), p.z);
        p.node.rotation.y = p.heading;
        p.node.rotation.z = 0;
        if (p.node.legs) BL.crew.poseQuadruped(p.node, BL.crew.QUAD_GAIT.flyFront, BL.crew.QUAD_GAIT.flyHind, 0, 0, 0.35);
        p.node.visible = a.body.visible || i === 0;
        continue;
      }
      p.jet.visible = p.flame.visible = false;
      const tx = s.x - Math.sin(h) * PET_BACK + Math.cos(h) * PET_SIDE, tz = s.z - Math.cos(h) * PET_BACK - Math.sin(h) * PET_SIDE;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (!p.warm || d > 7) { p.x = tx; p.z = tz; p.warm = true; }
      else if (d > 0.15) {
        const step = Math.min(d, PET_SPEED * dt * Math.min(1, d / 1.2 + 0.25));
        p.x += dx / d * step; p.z += dz / d * step;
        p.heading = Math.atan2(dx, dz);
        p.step += step * (p.node.legs ? BL.crew.QUAD_GAIT.stride : 9);
      } else p.heading = h;
      const ground = SIM.groundAt(p.x, p.z, s.y + 0.1, 0.15);
      p.y = damp(p.y, ground, 18, dt);
      const moving = d > 0.15, gait = BL.crew.QUAD_GAIT;
      p.node.rotation.y = p.heading;
      if (p.node.legs) {
        // A four-legged companion walks as DSB's dogs do.
        setVec(p.node.position, p.x, p.y + (moving ? Math.abs(Math.cos(p.step)) * gait.bob : 0), p.z);
        p.node.rotation.z = 0;
        BL.crew.poseQuadruped(p.node, 0, 0, moving ? Math.sin(p.step) * gait.swing : 0, Math.sin(elapsed * 7) * 0.25, 0);
      } else {
        setVec(p.node.position, p.x, p.y + (moving ? Math.abs(Math.sin(p.step)) * 0.08 : 0), p.z);
        p.node.rotation.z = moving ? Math.sin(p.step) * 0.08 : 0;
      }
      p.node.visible = a.body.visible || i === 0;
    }
  };
  const poseActors = (dt, elapsed) => {
    for (let i = 0; i < actors.length; i++) {
      const s = sim.actors[i], a = actors[i];
      setVec(a.body.position, s.x, s.y, s.z);
      // Lightning boots leave a trail of sparks.
      if (s.boots > 0 && s.moving > 1 && Math.random() < dt * 14) fx.burst(s.x, s.y + 0.2, s.z, 2, ORANGE_BITS, 0.8);
      // On the board only the Ooga on show stands in view.
      a.body.visible = !(i === 0 && (cam.first || cam.close) && phase === "play") && !(phase === "board" && preview.wide && i > 0);
      a.body.scale.y = s.crouch && !s.riding ? 0.66 : 1;
      // Dragged by a gorilla: facing it, pitched over so the feet are in its hand and the head trails along the ground (as
      // wicked's hub capture holds an Ooga: `grabbedOogaPose`). Otherwise upright, turning to the heading.
      const dragged = s.grabbed ? sim.gorillas[s.grabbed - 1] : null;
      a.body.rotation.x = s.riding ? 0 : damp(a.body.rotation.x, dragged ? -1.25 : 0, dragged ? 18 : 12, dt);
      a.body.rotation.y = dragged ? dragged.heading : damp(a.body.rotation.y, a.body.rotation.y + wrap(s.heading - a.body.rotation.y), 14, dt);
      a.ring.visible = s.grounded;
      a.bubble.visible = s.trapped > 0;
      a.netted.visible = s.netted > 0;
      a.held.visible = s.holding && !(i === 0 && cam.first);
      if (s.holding) a.held.geometry = BM.crate(TEAM_INDEX[s.team]);
      a.trolley.visible = s.riding;
      // The hook on the hip while held; the rope and head while it flies, bites, or comes back.
      a.hookHip.visible = s.hook > 0 && !s.hk && !(i === 0 && (cam.first || tool === "hook"));
      a.rope.visible = a.hookHead.visible = s.hook > 0 && s.hk > 0;
      if (s.hk > 0) {
        const hx = s.x + Math.sin(s.heading) * 0.3, hy = s.y + 1.25, hz = s.z + Math.cos(s.heading) * 0.3, t = s.hookTip;
        const dx = t.x - hx, dy = t.y - hy, dz = t.z - hz, len = Math.hypot(dx, dy, dz) || 0.01;
        setVec(a.rope.position, hx, hy, hz);
        a.rope.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)); a.rope.rotation.y = Math.atan2(dx, dz);
        a.rope.scale.z = len;
        setVec(a.hookHead.position, t.x, t.y, t.z);
        a.hookHead.rotation.x = a.rope.rotation.x; a.hookHead.rotation.y = a.rope.rotation.y;
      }
      a.chute.visible = s.flight === 2;
      a.jetFlame.visible = s.jetting;
      if (s.jetting) {
        a.jetFlame.scale.y = 0.8 + Math.random() * 0.5;
        if (Math.random() < dt * 30) fx.burst(s.x, s.y + 0.3, s.z, 1, ORANGE_BITS, 0.8);
      }
      for (let m = 0; m < 2; m++) {
        a.monkeys[m].visible = s.monkeys > 0 && !(i === 0 && cam.first);
        if (s.monkeys > 0) a.monkeys[m].position.y = 0.82 + Math.abs(Math.sin(elapsed * 6 + m * 1.7)) * 0.08;
      }
      if (a.chute.visible) a.chute.geometry = BM.chute(TEAM_INDEX[s.team]);
      // The gun in hand: the visitor's chosen tool, a bot's last throw, the hook launcher while its hook is out; none
      // while carrying, lifting or riding.
      // Another Ooga shows what it has in hand (`blockSim.heldOf`, the frame's word on a guest), a special weapon only
      // while it still has one.
      const held = i === 0 ? tool : SIM.heldOf(s) || "paint", kind = held === "gold" && !s.gold || held === "hook" && !s.hook ? "paint" : held;
      const g = s.hook > 0 && (s.hk || kind === "hook") ? GUN_OF.hook : GUN_OF[kind];
      const armed = phase === "play" && g >= 0 && !s.carrying && !s.holding && !s.riding && !s.climbing && !s.flight && s.splat <= 0 && s.trapped <= 0 && s.burnt <= 0 && s.slip <= 0;
      if (a.gun) {
        a.gun.visible = armed;
        if (armed) a.gun.geometry = BM.gun(g * 2 + TEAM_INDEX[s.team]);
      }
      if (a.gunL) {
        a.gunL.visible = armed && g === GUN_OF.gold;
        if (a.gunL.visible) a.gunL.geometry = a.gun.geometry;
      }
      // Read before the frame's time is added, so a round fired just now always shows, at any frame rate.
      a.flash.visible = a.flashL.visible = armed && a.shot < FLASH_S;
      a.kick = gunKick(a.shot);
      a.shot = Math.min(SHOT_IDLE, a.shot + dt);
      // A crate to the head shows stars, not paint.
      a.blob.visible = s.splat > 0 && !s.bonked;
      if (s.trapped > 0) a.bubble.rotation.y = elapsed * 0.8;
      if (!a.cave) continue;
      const p = a.cave.parts;
      a.cave.root.position.y = s.riding ? a.hang.hip : a.hip;
      p.armL.quaternion = null;
      p.armR.rotation.z = s.riding ? 0 : a.armZ; p.armL.rotation.z = -p.armR.rotation.z;
      p.forearmL.rotation.x = p.forearmR.rotation.x = -a.cave.elbow.rest;
      if (s.riding) {
        p.forearmL.rotation.x = p.forearmR.rotation.x = 0;
        p.armL.rotation.x = p.armR.rotation.x = a.hang.angle;
        p.legL.rotation.x = 0.3; p.legR.rotation.x = -0.2;
        continue;
      }
      if (s.splat > 0) {
        // Splatted: arms up, wobbling, feet together.
        const w = Math.sin(elapsed * 9 + i) * 0.15;
        p.armL.rotation.x = p.armR.rotation.x = -2.6 + w;
        p.legL.rotation.x = p.legR.rotation.x = 0;
        a.blob.rotation.y += dt * 2;
        continue;
      }
      if (s.trapped > 0) {
        // Thinking: one hand on the chin, the other on the hip.
        p.armR.rotation.x = -2 + Math.sin(elapsed * 2 + i) * 0.1;
        p.armL.rotation.x = -0.3;
        p.legL.rotation.x = p.legR.rotation.x = 0;
        continue;
      }
      if (s.spooked > 0) {
        // Spooked stiff: arms straight up, knees locked, shaking.
        const w = Math.sin(elapsed * 40) * 0.06;
        p.armL.rotation.x = p.armR.rotation.x = -3 + w;
        p.legL.rotation.x = p.legR.rotation.x = 0;
        continue;
      }
      if (s.grabbed) {
        // Dragged by a leg, as wicked's hub capture holds an Ooga: legs straight, arms trailing and flailing.
        const w = Math.sin(elapsed * 16 + i);
        p.armL.rotation.x = -1.35 + w * 0.4; p.armR.rotation.x = -1.1 - w * 0.4;
        p.legL.rotation.x = p.legR.rotation.x = -0.1;
        p.head.rotation.x = 0.2;
        continue;
      }
      if (s.slip > 0) {
        // Slipping: arms flung out, one leg up.
        p.armL.rotation.x = p.armR.rotation.x = -1.6;
        p.legL.rotation.x = -1.1; p.legR.rotation.x = 0.3;
        continue;
      }
      if (s.burnt > 0) {
        // Hot feet: arms flapping, knees high.
        const w = Math.sin(elapsed * 14 + i);
        p.armL.rotation.x = -2.4 + w * 0.5; p.armR.rotation.x = -2.4 - w * 0.5;
        p.legL.rotation.x = -0.9 * Math.max(0, w); p.legR.rotation.x = -0.9 * Math.max(0, -w);
        continue;
      }
      if (s.flight === 1) {
        // Flung: tucked up, arms in.
        p.armL.rotation.x = p.armR.rotation.x = -0.6;
        p.legL.rotation.x = p.legR.rotation.x = -1.2;
        continue;
      }
      if (s.climbing || s.flight === 2) {
        // Under a parachute, or hand over hand up a ladder.
        const k = s.climbing ? Math.sin(elapsed * 9) * 0.4 : 0;
        p.armL.rotation.x = -2.9 + k; p.armR.rotation.x = -2.9 - k;
        p.legL.rotation.x = s.climbing ? -k : 0.3; p.legR.rotation.x = s.climbing ? k : -0.2;
        continue;
      }
      if (!s.grounded) {
        // In the air: knees up, arms out for balance.
        p.legR.rotation.x = -0.7; p.legL.rotation.x = 0.3;
        p.armL.rotation.x = p.armR.rotation.x = s.carrying ? -2.9 : -1.2;
        continue;
      }
      const sp = s.moving;
      a.phase += dt * sp * 2.1;
      const swing = Math.sin(a.phase) * Math.min(1, sp / 3);
      p.legR.rotation.x = swing * 0.6;
      p.legL.rotation.x = -swing * 0.6;
      p.legL.rotation.z = p.legR.rotation.z = 0;
      if (s.ride) {
        // Piggyback: knees up round the waist below, legs apart.
        p.legL.rotation.x = p.legR.rotation.x = -1.35;
        p.legL.rotation.z = 0.45; p.legR.rotation.z = -0.45;
      }
      if (s.carrying || s.holding) {
        // Both hands up holding the block (or a crate) overhead.
        p.armL.rotation.x = p.armR.rotation.x = -2.9;
      } else if (armed) {
        // The aimed gun follows the fist, as in crew.js; the free hand rests unless it holds the second AK.
        const kick = s.cooldown > (s.bot ? sim.bots.cool : SIM.TOOLS.paint.cool) - 0.12 ? 0.18 : 0;
        // One kick a round from an AK, gone before the next (crew.js's rifle).
        const round = a.kick;
        p.armR.rotation.x = (g === 2 ? -1.75 : -1.45) + a.cave.elbow.rest - kick - 0.11 * round;
        p.armL.rotation.x = g === GUN_OF.gold ? -1.45 + a.cave.elbow.rest - 0.11 * round : -0.2;
        if (g !== GUN_OF.gold) p.forearmL.rotation.x = -(a.cave.elbow.relaxed ?? a.cave.elbow.rest);
      } else if (s.ride) {
        // Riding with nothing in hand: arms round the shoulders in front.
        p.armL.rotation.x = p.armR.rotation.x = -1.5;
      } else if (s.rider) {
        // Carrying a rider: hands back under its knees.
        p.armL.rotation.x = p.armR.rotation.x = 0.55;
      } else {
        p.armR.rotation.x = s.cooldown > (s.bot ? sim.bots.cool : SIM.TOOLS.paint.cool) - 0.2 ? -1.5 : -0.2 - swing * 0.35;
        p.armL.rotation.x = -0.2 + swing * 0.35;
      }
      // Guard after a splat blinks the ring.
      if (s.guard > 0) a.ring.visible = Math.sin(elapsed * 20) > 0;
    }
  };
  const poseBlocks = (elapsed) => {
    for (const t of SIM.TEAMS) {
      const f = sim.flags[t], b = blocks[t];
      let y = 1.3 + Math.sin(elapsed * 2.2 + TEAM_INDEX[t]) * 0.08;
      let fx = f.x, fz = f.z;
      if (f.state === "carried") {
        const s = sim.actors[f.carrier];
        y = s.y + 2.45 + Math.sin(elapsed * 6) * 0.04;
        // On a zipline both hands are on the bar, so the block rides on the carrier's back.
        if (s.riding) { y = s.y + 1.15; fx = s.x - Math.sin(s.heading) * 0.5; fz = s.z - Math.cos(s.heading) * 0.5; }
      } else if (f.state === "dropped") y = f.y + 0.5 + Math.sin(elapsed * 3) * 0.06;
      else if (f.state === "flying") y = f.y;
      setVec(b.node.position, fx, y, fz);
      const onBack = f.state === "carried" && sim.actors[f.carrier].riding;
      b.node.rotation.y = onBack ? sim.actors[f.carrier].heading : elapsed * (f.state === "carried" ? 3 : f.state === "flying" ? 12 : 0.9);
      b.node.glow = f.state === "dropped" ? 0.7 + 0.3 * Math.sin(elapsed * 8) : 1;
      // The countdown ring under a dropped block, one tick for each part of its twenty seconds left.
      // The ring of ticks spins round a dropped block so it is easy to find; it stays until someone picks it up.
      const shown = f.state === "dropped" ? ticks[t].length : 0;
      b.tickRoot.rotation.y = elapsed * 1.5;
      setVec(b.tickRoot.position, f.x, f.y + 0.05, f.z);
      for (let k = 0; k < ticks[t].length; k++) ticks[t][k].visible = k < shown;
    }
  };
  const poseCrates = () => {
    // On the board the crates stand aside, so nothing hides the Ooga on show; they're back when the round starts.
    const showing = phase === "board" && preview.wide;
    for (let i = 0; i < crates.length; i++) {
      const c = sim.crates[i], n = crates[i];
      n.visible = c.live && !showing;
      if (!c.live) continue;
      setVec(n.position, c.x, c.y, c.z);
      n.geometry = BM.crate(TEAM_INDEX[c.team]);
    }
  };
  // The sky follows the weather: a storm darkens the light and thickens the cloud, rain falls
  // round the camera, and now and then lightning flashes.
  const poseWeather = (dt) => {
    const w = sim.weather, storm = w.kind === "storm" ? Math.min(1, w.strength) : 0;
    RENDER_OPTS.clouds = MAP_CLOUDS[SIM.ARENA.id] + 0.55 * storm;
    RENDER_OPTS.directStrength *= 1 - 0.55 * storm;
    RENDER_OPTS.sunStrength *= 1 - 0.55 * storm;
    flashT -= dt;
    // Lightning: a warned ring where it will strike, a brief column and a flash (no flash for reduced motion or Low detail).
    const showBolt = w.boltWarn > 0;
    boltRing.visible = showBolt;
    if (showBolt) { setVec(boltRing.position, w.boltX, 0.05, w.boltZ); boltRing.scale.x = boltRing.scale.z = 2.6 + (hookStill ? 0 : Math.sin(sim.time * 16) * 0.3); }
    if (boltNode.visible) { boltNode.visible = sim.time < flashSeen; }
    flash = Math.max(0, flash - dt * 5);
    RENDER_OPTS.ambientFloor = (SIM.ARENA.id === "haunted" ? 0.42 : 0.22) + flash * 0.8;
    RENDER_OPTS.bloomStrength = 0.6 + flash * 1.2;
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < RAIN; i++) {
      const r = rain[i];
      // Rain only on Full detail; Gorilla Jungle's is always falling, a storm brings it anywhere.
      const wet = SIM.ARENA.id === "jungle" ? Math.max(storm, 0.55) : storm;
      r.node.visible = detail.full && wet > 0.2 && i < RAIN * wet;
      if (!r.node.visible) continue;
      r.y -= dt * 14;
      if (r.y < 0 || Math.abs(r.x - cx) > 12 || Math.abs(r.z - cz) > 12) {
        r.x = cx + (Math.random() - 0.5) * 22; r.z = cz + (Math.random() - 0.5) * 22; r.y = 6 + Math.random() * 6;
      }
      setVec(r.node.position, r.x, r.y, r.z);
    }
    // The weather word, written only when it changes.
    if (w.kind !== el.weatherKind) { el.weatherKind = w.kind; el.weatherWord.textContent = WEATHER_WORDS[w.kind]; }
  };
  // The sprint gauge: full, draining while Shift is held, orange while it refills after running dry.
  const poseStamina = () => {
    const a = sim.actors[0], k = Math.round(a.stamina / C.SPRINT_S * 100), f = Math.round(a.fuel / C.JET_FUEL * 100);
    if (f !== el.fuelK) { el.fuelK = f; el.fuel.style.width = `${f}%`; }
    if (k === el.staminaK && a.tired === el.staminaTired) return;
    el.staminaK = k; el.staminaTired = a.tired;
    el.stamina.style.width = `${k}%`;
    el.stamina.dataset.tired = String(a.tired);
  };
  const posePads = (elapsed) => {
    for (let i = 0; i < pads.length; i++) {
      const t = sim.traps[i];
      pads[i].glow = t.dark > 0 ? 0.12 : 0.75 + 0.25 * Math.sin(elapsed * 3 + i);
    }
    if (quiz.open) el.quizFill.style.width = `${Math.max(0, sim.actors[0].trapped / C.TRAP_MAX_S * 100).toFixed(1)}%`;
    // Power-ups spin and bob while they wait; a frozen block wears its ice.
    for (let i = 0; i < powerNodes.length; i++) {
      const p = sim.powers[i], n = powerNodes[i];
      n.visible = p.dark <= 0;
      n.geometry = BM.power(p.kind);
      n.rotation.y = elapsed * 2 + i;
      n.position.y = Math.sin(elapsed * 2.5 + i) * 0.12;
    }
    for (const t of SIM.TEAMS) {
      const f = sim.flags[t], n = iceNodes[t];
      n.visible = sim.cold[t] > 0 && f.state === "home";
      if (n.visible) setVec(n.position, f.x, 1.3, f.z);
    }
    // An ammo cache glows while it's ready and goes grey while it rests.
    for (let i = 0; i < caches.length; i++) caches[i].geometry = BM.cache(sim.caches[i].dark > 0 ? 1 : 0);
    // The zipline lamps, repainted only when the visitor's own block comes or goes.
    for (let i = 0; i < zipLights.length; i++) { const lit = SIM.zipSprings(sim, sim.actors[0], SIM.TEAMS[i]) ? 1 : 0; if (lit !== zipLit[i]) { zipLit[i] = lit; zipLights[i].geometry = BM.zipLight(lit); } }
    // A catapult's arm whips over when it throws, then winds back down.
    for (const c of catapults) {
      const t = elapsed - c.at, up = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.4);
      c.arm.rotation.x = -0.25 + up * 1.9;
    }
    // The hook's slot shows while it is out; repainted only when that changes.
    { const m = sim.actors[0], busy = m.hook > 0 && m.hk > 0; if (busy !== hookBusy) { hookBusy = busy; updateTools(); } }
    // The other side's catapult warns you first: it throws you the wrong way.
    { const m = phase === "play" && SIM.nearEnemyCatapult(sim, sim.actors[0]); if (m !== enemyCatNear) { enemyCatNear = m; updateTools(); if (m) notice("Enemy catapult! It'll throw you off the back", 2400); } }
    const onPad = phase === "play" && SIM.nearCatapult(sim, sim.actors[0]);
    if (onPad !== catNear) {
      catNear = onPad;
      updateTools();
      if (onPad) notice(`${COARSE ? "Ride" : "Space"} fires the catapult · parachute into their fort`, 2400);
    }
    // The zipline button wakes as the visitor reaches the cable, with a word the first time.
    const near = phase === "play" && !!SIM.nearZip(sim, sim.actors[0]);
    if (near !== zipNear) {
      zipNear = near;
      updateTools();
      if (near) {
        const line = SIM.nearZip(sim, sim.actors[0]), home = line !== sim.team;
        notice(SIM.zipSprings(sim, sim.actors[0], line) ? "Trap door! Our block isn't home · their zipline would throw you off the island" : `${COARSE ? "Zip" : "Space"} rides the zipline ${home ? "home to our fort" : "into their fort"}`, 2200);
      }
    }
  };
  const poseShots = () => {
    for (let i = 0; i < sim.shots.length; i++) {
      const s = sim.shots[i], n = shots[i];
      n.visible = s.live;
      if (!s.live) continue;
      setVec(n.position, s.x, s.y, s.z);
      const t = TEAM_INDEX[s.team];
      const homer = s.kind === "homer";
      n.geometry = s.kind === "gold" ? BM.goldBall() : s.kind === "grenade" ? BM.grenade(t) : s.kind === "rocket" || homer ? BM.rocket(t) : s.kind === "net" ? BM.net() : s.kind === "crate" ? BM.crate(t) : BM.ball(t);
      // A net opens wide as it flies.
      const k = homer ? 0.55 : s.kind === "net" ? 0.7 + Math.min(1.8, s.t * 8) : 1;
      n.scale.x = n.scale.y = n.scale.z = k;
      n.rotation.y = Math.atan2(s.vx, s.vz);
      n.rotation.x = s.kind === "rocket" || homer ? -Math.atan2(s.vy, Math.hypot(s.vx, s.vz)) : s.kind === "net" ? 0 : s.t * 9;
      // A heat-seeker trails smoke.
      if (homer && Math.random() < 0.5) fx.burst(s.x, s.y, s.z, 1, SMOKE_BITS, 0.3);
    }
  };
  const updateCamera = (dt) => {
    const me = sim ? sim.actors[0] : null, x = me ? me.x : 0, y = me ? me.y : 0, z = me ? me.z : 0;
    // First person looks exactly where the Ooga faces; the chase camera swings round behind it within a few frames.
    const want = cam.island ? cam.orbit : cam.face;
    cam.yaw = cam.first || !cam.warm ? want : wrap(cam.yaw + wrap(want - cam.yaw) * Math.min(1, dt * (cam.island ? 9 : 7)));
    if (cam.first && me) {
      // The eye at the Ooga's eyes (lower when crouched), looking along the aim.
      const a = actors[0], eye = y + (a.cave.headOffset * 0.95 + (me.riding ? a.hang.hip - a.hip : 0)) * (me.crouch && !me.riding ? 0.66 : 1), up = lookUp(), c = Math.cos(up);
      cam.close = false;
      if (me.grabbed) {
        // Dragged by a leg: on the back, looking up at the sky.
        setVec(camera.position, x, y + 0.5, z);
        setVec(camera.target, x - Math.sin(cam.yaw) * 2.5, y + 14, z - Math.cos(cam.yaw) * 2.5);
      } else {
      setVec(camera.position, x + Math.sin(cam.yaw) * 0.25, eye, z + Math.cos(cam.yaw) * 0.25);
      setVec(camera.target, x + Math.sin(cam.yaw) * c * 10, eye + Math.sin(up) * 10, z + Math.cos(cam.yaw) * c * 10);
      }
      // The sniper's scope narrows the view; the gun in hand sits low and right of the eye.
      const scopedNow = tool === "sniper";
      camera.fov = damp(camera.fov, (scopedNow ? ZOOMS[scope.zoom] : aiming ? AIM_FOV : 58) * Math.PI / 180, 10, dt);
      const g = tool === "hook" && me.hook <= 0 ? -1 : GUN_OF[tool], showGun = g >= 0 && !scopedNow && !me.carrying && !me.holding && !me.riding && !me.climbing && me.splat <= 0 && me.trapped <= 0;
      fpGun.visible = showGun;
      if (showGun) {
        fpGun.geometry = BM.gun(g * 2 + TEAM_INDEX[me.team]);
        const fx2 = Math.sin(cam.yaw) * c, fz2 = Math.cos(cam.yaw) * c, fy2 = Math.sin(up), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
        // A round pulls the gun back and tips it up a touch, as the island rifle does at the eye.
        // The AKs are the island's full-size rifle, its stock almost at the eye: held smaller and further out.
        const rifle = g === GUN_OF.ak || g === GUN_OF.gold, size = rifle ? 0.6 : 1, round = actors[0].kick, reach = (rifle ? 0.68 : 0.55) - 0.04 * round;
        setVec(fpGun.scale, size, size, size); setVec(fpGunL.scale, size, size, size);
        setVec(fpGun.position, camera.position.x + fx2 * reach + rx * 0.24, eye + fy2 * reach - (g === 2 ? 0.12 : 0.22) - 0.02 * round, camera.position.z + fz2 * reach + rz * 0.24);
        fpGun.rotation.y = cam.yaw;
        fpGun.rotation.x = -up - 0.035 * round;
        fpFlash.visible = fpFlashL.visible = actors[0].flash.visible;
      }
      // With the golden pair, the second AK sits low and left.
      fpGunL.visible = showGun && tool === "gold";
      if (fpGunL.visible) {
        fpGunL.geometry = fpGun.geometry;
        const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
        setVec(fpGunL.position, fpGun.position.x - rx * 0.48, fpGun.position.y, fpGun.position.z - rz * 0.48);
        fpGunL.rotation.y = cam.yaw;
        fpGunL.rotation.x = fpGun.rotation.x;
      }
      setVec(RENDER_OPTS.shadowCenter, x, 0, z);
      return;
    }
    camera.fov = damp(camera.fov, (aiming && !cam.island ? AIM_FOV : 58) * Math.PI / 180, 10, dt);
    if (fpGun) fpGun.visible = fpGunL.visible = false;
    // The eye comes in front of any wall or leaves between it and the Ooga, so neither a fort's back wall nor a tree fills
    // the view. Backed up
    // against something, the camera rises over it to look down from above, and eases back once the way is clear.
    const by = y + (cam.island ? ISLAND.height : CAM.height), pitch = cam.island ? ISLAND.pitch : cam.pitch, far = cam.island ? ISLAND.dist * cam.islandZoom : CAM.dist * cam.zoom;
    let dist = clearBehind(x, by, z, pitch), lift = 0;
    if (dist < far * 0.6) {
      // Up over it first; under a floor overhead, down beneath it instead.
      for (let k = 1; k <= 8; k++) {
        const p = k <= 6 ? Math.min(1.3, pitch + k * 0.17) : Math.max(-0.25, pitch - (k - 6) * 0.2), d = clearBehind(x, by, z, p);
        if (d > dist + 0.5) { dist = d; lift = p - pitch; }
        if (d >= far * 0.8) break;
      }
    }
    cam.lift = damp(cam.lift, lift, lift > cam.lift ? 10 : 3, dt);
    dist = clearBehind(x, by, z, pitch + cam.lift);
    cam.dist = dist;
    // So close that the Ooga would fill the view: it steps out of the way (shown as the crosshair alone).
    cam.close = dist < 1.1;
    const ex = x + EYE.x * dist, ez = z + EYE.z * dist, ey = by + EYE.y * dist;
    if (!cam.warm) {
      setVec(camera.position, ex, ey, ez);
      cam.warm = true;
    } else {
      camera.position.x = damp(camera.position.x, ex, 12, dt);
      camera.position.y = damp(camera.position.y, ey, 12, dt);
      camera.position.z = damp(camera.position.z, ez, 12, dt);
    }
    if (cam.island) setVec(camera.target, x, y + 1.1, z);
    else setVec(camera.target, x + Math.sin(cam.yaw) * 2, y + 1.9, z + Math.cos(cam.yaw) * 2);
    setVec(RENDER_OPTS.shadowCenter, x, 0, z);
  };
  // How far back along `pitch` (and the camera's yaw) the eye can sit from (x, y, z) before a wall: the direction goes
  // in EYE.
  // Leaves block the view as walls do, so the camera comes in front of a canopy (or over or under it) too. The map's
  // canopies, listed once a map.
  let leavesOf = null, leaves = [];
  const leafAt = (px, py, pz) => {
    if (leavesOf !== SIM.ARENA) { leavesOf = SIM.ARENA; leaves = (SIM.ARENA.decor || []).filter((d) => d.kind === "canopy"); }
    for (let i = 0; i < leaves.length; i++) {
      const c = leaves[i], dx = px - c.x, dz = pz - c.z, r = c.r * 1.25;
      if (dx * dx + dz * dz < r * r && py > c.y - 0.3 && py < c.y + SIM.LEAF_TOP) return true;
    }
    return false;
  };
  const clearBehind = (x, y, z, pitch) => {
    const c = Math.cos(pitch);
    EYE.x = -Math.sin(cam.yaw) * c; EYE.z = -Math.cos(cam.yaw) * c; EYE.y = Math.sin(pitch);
    const far = cam.island ? ISLAND.dist * cam.islandZoom : CAM.dist * cam.zoom;
    for (let d = 0.5; d <= far; d += 0.25) {
      const px = x + EYE.x * d, py = y + EYE.y * d, pz = z + EYE.z * d;
      if (SIM.solidAt(px, py, pz) || leafAt(px, py, pz)) return Math.max(0.6, d - 0.4);
    }
    return far;
  };
  // The board shows the whole fort from above its gate, slowly turning.
  // On a wide screen the board sits on the left and the chosen Ooga stands on the right inside its fort's gate,
  // turning slowly all the way round (a drag turns it faster); on a narrow one the board fills the screen and the
  // view circles the fort.
  const preview = { spin: 0, wide: false };
  // A local actor's seat: in a live round every page numbers its actors its own way, and the seat is what they share.
  // The round's own seat map (`liveSeats`), kept to the results; solo, an actor's index.
  let liveSeats = null;
  const seatOfActor = (i) => liveSeats ? liveSeats.toSeat[i] : i;
  // The weapons preview beside it: each tool of the arsenal (`SIM.ARSENAL`) in turn, its held model turning over the
  // Ooga's head and its name and blurb on a card. It steps on by itself every `SHOW_S`; a press of the card's buttons
  // steps it and holds it there `SHOW_HOLD_S`. Reduced motion: no turning and no stepping by itself.
  // The weapon turns over the Ooga's head; where the card would cover it (a view less wide for its height), it is held
  // left of the card's edge instead: `SHOW_REACH` is the room its turn is given, and the card's edge is measured again
  // only when the page's size changes or the card comes back. Neither shows while the title card is up.
  const SHOW_S = 4.5, SHOW_HOLD_S = 12, SHOW_STILL = 2.4, SHOW_K = 0.85, SHOW_REACH = 0.75, SHOW_GAP = 8;
  const SHOW_AT = { x: 0, y: 0, depth: 0 }, SHOW_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 1 };
  const show = { i: 0, spin: 0, t: 0, hold: 0, shown: -1, node: null, w: 0, h: 0, left: 0, ch: 1 };
  const measureShow = () => {
    const v = el.weaponCard.getBoundingClientRect(), c = el.canvas.getBoundingClientRect();
    show.w = window.innerWidth; show.h = window.innerHeight; show.left = v.left - c.left; show.ch = c.height || 1;
  };
  const showWeapon = (i) => {
    const n = SIM.ARSENAL.length;
    show.i = ((i % n) + n) % n; show.t = 0;
    if (show.shown === show.i) return;
    show.shown = show.i;
    el.weaponName.textContent = SIM.ARSENAL[show.i][1];
    el.weaponBlurb.textContent = SIM.ARSENAL[show.i][2];
    el.weaponCount.textContent = `${show.i + 1} / ${n}`;
  };
  const onWeaponStep = (e) => { show.hold = SHOW_HOLD_S; showWeapon(show.i + Number(e.currentTarget.dataset.weaponStep)); };
  // The start menu's sky: the hub's voxel clouds drifting round the view, high over the map.
  const CLOUD_Y = 220, CLOUD_SPAN = 170, CLOUD_DRIFT = 2.2, CLOUD_CALM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let skyClouds = [], skyPerch = null, mapClouds = [];
  const buildSkyClouds = () => {
    const rand = BL.math.mulberry32(8801);
    skyClouds = [];
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, r = 46 + i * 7, k = 1.5 + rand() * 1.5;
      skyClouds.push(place(createNode({ geometry: BL.hubModels.cloud(i % 3), position: { x: Math.cos(a) * r, y: CLOUD_Y - 34 + rand() * 62, z: Math.sin(a) * r }, scale: { x: k, y: k, z: k }, sightHidden: true, visible: false })));
    }
    const perch = BL.hubModels.cloud(0), top = BL.scene.boundsOf(perch).max[1];
    skyPerch = place(createNode({ geometry: perch, position: { x: 0, y: CLOUD_Y - top * 0.6, z: 0 }, scale: { x: 0.6, y: 0.6, z: 0.6 }, sightHidden: true, visible: false }));
  };
  const PREVIEW_MIN_W = 760;
  const boardView = (elapsed, dt) => {
    const t = selection.team, s = SIM.ARENA.stands[t], sign = t === "blue" ? 1 : -1;
    camera.fov = 58 * Math.PI / 180;
    if (fpGun) fpGun.visible = fpGunL.visible = false;
    preview.wide = window.innerWidth >= PREVIEW_MIN_W;
    el.previewName.hidden = !preview.wide;
    // The weapons preview waits for the board itself: not while the title card is up.
    const showing = preview.wide && el.intro.hidden;
    if (el.weaponCard.hidden === showing) { el.weaponCard.hidden = !showing; show.w = 0; }
    if (show.node) show.node.visible = showing;
    // The Ooga's name is under the Ooga on show when there is one, else in the board.
    if (el.oogaSlot.hidden !== preview.wide) el.oogaSlot.hidden = preview.wide;
    // Up in the clouds, far above the map, whose island lies below the view.
    if (!preview.wide) {
      const a = elapsed * 0.12;
      setVec(camera.position, Math.sin(a) * 16, CLOUD_Y + 4, Math.cos(a) * 16);
      setVec(camera.target, 0, CLOUD_Y + 5, 0);
      return;
    }
    // The visitor's Ooga stood on a cloud in the middle of the sky, turning.
    const me = sim.actors[0], x = 0, z = 0;
    preview.spin = wrap(preview.spin + dt * 0.7);
    me.x = x; me.z = z; me.y = CLOUD_Y; me.grounded = true; me.flight = 0; me.moving = 0;
    me.carrying = null; me.holding = false; me.splat = me.trapped = me.burnt = me.slip = 0;
    me.heading = preview.spin;
    // The weapon on show, in the chosen side's colours, turning over the Ooga's head.
    if (!CLOUD_CALM && showing) {
      show.spin = wrap(show.spin + dt * 0.9);
      if (show.hold > 0) show.hold -= dt;
      else if ((show.t += dt) >= SHOW_S) showWeapon(show.i + 1);
    }
    if (show.node && showing) {
      show.node.geometry = BM.gun(BM.GUNS.indexOf(SIM.ARSENAL[show.i][0]) * 2 + TEAM_INDEX[t]);
      setVec(show.node.position, x, CLOUD_Y + 2.3, z);
      show.node.rotation.y = CLOUD_CALM ? SHOW_STILL * sign : show.spin;
      // Over the Ooga's head, unless its turn would pass behind the card: then as far left as clears the card's edge,
      // at the same height and distance (by the view's own ray through that point).
      if (show.w !== window.innerWidth || show.h !== window.innerHeight) measureShow();
      if (renderer.project(x, CLOUD_Y + 2.3, z, SHOW_AT)) {
        const reach = SHOW_REACH * show.ch / 2 / (-SHOW_AT.depth * Math.tan(camera.fov / 2)), edge = show.left - SHOW_GAP - reach;
        if (SHOW_AT.x > edge) {
          renderer.ray(edge, SHOW_AT.y, camera, SHOW_RAY);
          const far = Math.hypot(x - SHOW_RAY.ox, CLOUD_Y + 2.3 - SHOW_RAY.oy, z - SHOW_RAY.oz);
          setVec(show.node.position, SHOW_RAY.ox + SHOW_RAY.dx * far, SHOW_RAY.oy + SHOW_RAY.dy * far, SHOW_RAY.oz + SHOW_RAY.dz * far);
        }
      }
    }
    // The camera out past the gate at chest height, looking a little to the Ooga's left so it stands right of the board.
    setVec(camera.position, x, CLOUD_Y + 1.45, z - sign * 3.7);
    setVec(camera.target, x + sign * 1.25, CLOUD_Y + 1.0, z);
  };

  const update = (dt, elapsed) => {
    sceneTime = elapsed;
    const onTrophy = phase === "results" && !!trophy;
    if (skyPerch) skyPerch.visible = phase === "board" || onTrophy;
    if (show.node && phase !== "board") show.node.visible = false;
    for (let i = 0; i < skyClouds.length; i++) {
      const n = skyClouds[i];
      n.visible = phase === "board" || onTrophy;
      if (n.visible && !CLOUD_CALM && (n.position.x += dt * CLOUD_DRIFT) > CLOUD_SPAN) n.position.x -= 2 * CLOUD_SPAN;
    }
    // Each map's own time of day; Haunted Hollow is night and keeps its stars.
    const mapHour = MAP_HOUR[SIM.ARENA.id];
    // The start menu is up in the clouds at noon, whatever the map's own hour.
    // The trophy stands in warm light: a sunset sky behind Blue so the team's colour stands out, an afternoon one behind Red.
    daylight.sample(phase === "board" ? 12 : onTrophy ? (trophy.team === "blue" ? 17 : 15.5) : mapHour, RENDER_OPTS, clock.dayOfYear, daylight.ISLAND_LATITUDE_DEG, clock.continuousDay, clock.utcMs);
    RENDER_OPTS.time = elapsed;
    if (round === null && BL.net.state.blockLive) openRound();
    if (round) round.lobbyTick(dt);
    if (phase === "play" && paused && !liveRound()) controls.read();
    else if (phase === "play") {
      if (panelLive()) { controls.read(); move.x = move.z = move.sprint = move.jump = move.jet = move.crouch = 0; }
      else readInput(dt);
      // The rules ask what's in hand when an Ooga is splatted.
      if (!round || round.role !== "guest") sim.actors[0].wield = tool;
      // Full auto: with the AK or the golden pair and the trigger held, a round goes each time the shot clock allows.
      if (trigger && (tool === "ak" || (tool === "gold" && sim.actors[0].gold)) && !quiz.open && !sim.actors[0].grabbed && sim.actors[0].cooldown <= 0) paint();
      // The live feed, folded in before the step: fees to weather, a new block to its reset.
      const prepWas = sim.prep;
      if (round && round.role === "guest") round.after(dt, move);
      else {
        SIM.setLive(sim, feeWeather(live.fee));
        if (live.block) { SIM.newBlock(sim, live.block); live.block = 0; }
        if (round && round.role === "host") round.hostStep();
        SIM.step(sim, dt, move);
        if (round && round.role === "host") round.after(dt, move);
      }
      if (sim.prep > 0 && Math.ceil(sim.prep) !== Math.ceil(prepWas)) {
        center(`BUILD ${Math.ceil(sim.prep)}`, 0);
        if (sim.prep <= 3) audio.cues.count();
      }
      readEvents();
      updateStrip();
      if (sim.over) finish();
    } else if (onDeck()) { controls.read(); if (round) round.after(dt, move); sim.eventCount = 0; updateStrip(); }
    else controls.read();
    poseActors(dt, elapsed);
    poseBlocks(elapsed);
    poseCrates();
    if (!onDeck()) poseCompanions(dt, elapsed);
    poseStamina();
    posePads(elapsed);
    if (!onDeck()) poseFire(elapsed);
    poseGorillas(dt, elapsed);
    poseHooks(elapsed);
    paintStruggle();
    poseGhosts(elapsed);
    if (sim && actors) poseBeams(elapsed);
    poseShots();
    if (onTrophy) poseTrophy(dt, elapsed);
    if (phase === "board") boardView(elapsed, dt);
    else if (onDeck()) deckView(dt);
    else if (onTrophy) trophyView();
    else updateCamera(dt);
    if (!onDeck()) poseWeather(dt);
    if (phase === "play") drawMap(dt, elapsed);
    if (sim) {
      // The held sounds: rain in a storm, and the whir while the visitor rides a zipline.
      audio.state.rain = phase === "play" && sim.weather.kind === "storm" ? 1 : 0;
      audio.state.zip = phase === "play" && sim.actors[0].riding ? 1 : 0;
      audio.state.jet = phase === "play" && sim.actors[0].jetting ? 1 : 0;
    }
    audio.update();
    fx.update(dt);
    stepTweens(dt);
  };
  const NO_EXTRA = () => { };
  const overlay = (dt) => fx.drawOverlay(dt, NO_EXTRA);

  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    const bananas = gameMod.bananasFor(donation.sats), shown = counted ? counted.rounded : bananas;
    world.level = Math.min(pileMod.MAX_BANANAS, world.level + (counted ? counted.exact : bananas));
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${gameMod.formatLarge(shown)} banana${shown === 1 ? "" : "s"} · ${donation.handle ? `@${donation.handle}` : "anon"}`);
    hud.setStats(game.state);
  };
  const onKey = (e) => {
    if (panelLive()) return;
    audio.unlock();
    // Escape steps back one thing at a time, as on the island: the captured mouse, then the view, then a pause, then
    // the board, then the Arcade.
    if (e.key === "Escape") {
      // The quiz card holds Escape: it never leaves the round (or a live seat) from under the question.
      if (phase === "play" && quiz.open) { if (locked()) document.exitPointerLock(); return; }
      if (phase === "play" && locked()) document.exitPointerLock();
      else if (phase === "play" && !paused && (cam.first || cam.island)) setMode("chase");
      else if (phase === "play" && !paused && !quiz.open) setPaused(true);
      else if (phase === "play" || phase === "results") showBoard();
      else go(home);
      return;
    }
    if (onDeck()) { if (e.key === "+" || e.key === "=") zoomDeck(1.3); else if (e.key === "-" || e.key === "_") zoomDeck(1 / 1.3); return; }
    if (e.key === "Enter" && phase !== "play") beginFromMenu();
    else if (e.key === "Enter" && !e.repeat && !quiz.open && !paused) paint();
    if (phase !== "play" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "p" || e.key === "P") { if (!quiz.open) setPaused(!paused); return; }
    if (paused) return;
    if ((e.key === "e" || e.key === "E") && !quiz.open && sim.actors[0].grabbed) { move.jump = 1; return; }
    if (quiz.open) {
      if (e.key >= "1" && e.key <= "4") answer(Number(e.key) - 1);
      return;
    }
    if (TOOL_KEYS[e.key]) keyTool(TOOL_KEYS[e.key]);
    if (e.key === "t" || e.key === "T") passBlock();
    if (e.key === "r" || e.key === "R") hookNow();
    if (e.key === "u" || e.key === "U") toggleBar();
    if (e.key === "n" || e.key === "N") toggleMap();
    if (e.key === "/" || e.key === "?") el.helpBox.hidden = !el.helpBox.hidden;
    if (e.key === "h" || e.key === "H") piggyback();
    if (e.key === "j" || e.key === "J") callRider();
    if (e.key === "g" || e.key === "G") cycleTool(1);
    if (e.key === "f" || e.key === "F") grabCrate();
    if (e.key === "k" || e.key === "K") dropBlock();
    if ((e.key === "+" || e.key === "=") && scoped()) zoomScope(1);
    if ((e.key === "-" || e.key === "_") && scoped()) zoomScope(-1);
    if (e.key === "v" || e.key === "V") cycleView();
    if (e.key === "x" || e.key === "X") toggleMouseLook();
    if (e.key === "0") cam.pitch = 0.28;
  };
  const chooseTarget = (n) => {
    selection.target = n;
    for (const b of el.targets) b.setAttribute("aria-pressed", String(Number(b.dataset.target) === n));
    el.boardHelp.textContent = helpLine("Pick a side.", selection.rule, n);
    savePicks();
  };
  // The scoring rule: the visitor's own pick, remembered; in a match the first in's, sent to the match (everyone's
  // board, theirs too, then shows the match's word).
  const chooseRule = (k) => {
    // The first in sends it, in the lobby or waiting through a round, with the map their board shows, as the size
    // buttons and the map do.
    if (firstRegistered()) round.setOptions(round.match.size, WIRE.MAPS.indexOf(selection.map), WIRE.RULES.indexOf(k));
    if (boardInMatch) return;
    selection.rule = k;
    for (const b of el.rules) b.setAttribute("aria-pressed", String(b.dataset.rule === k));
    el.boardHelp.textContent = helpLine("Pick a side.", k, selection.target);
    savePicks();
  };
  // A new team size casts the round again: a fresh sim and a fresh set of Oogas.
  const chooseSize = (n) => {
    for (const b of el.sizes) b.setAttribute("aria-pressed", String(Number(b.dataset.size) === n));
    if (n === selection.size && sim && sim.size === n) return;
    selection.size = n;
    savePicks();
    if (sim) recast();
  };
  // A fresh sim and a fresh cast for the board's picks.
  const recast = () => {
    sim = SIM.create({ team: selection.team, seed: 1, size: selection.size, skill: selection.skill, target: selection.target, map: selection.map });
    disposeActors();
    buildActors(castNames());
    for (let i = 0; i < actors.length; i++) sim.actors[i].name = actors[i].name;
    paintTeams();
    nameShowcase();
  };
  // The map on show: its button, the pick and the scenery behind the board change together.
  const showMap = (id) => {
    for (const b of el.maps) b.setAttribute("aria-pressed", String(b.dataset.map === id));
    if (id === selection.map && sim && sim.map === id) return false;
    selection.map = id;
    if (sim) { recast(); buildMap(); mapBase = null; }
    return true;
  };
  const chooseMap = (id) => {
    // Registered behind someone else, the board shows the map they picked.
    // In a match, only the first in has the map buttons (`boardFollowsMatch`); this only guards a stray call.
    if (registered() && !firstRegistered()) return;
    if (showMap(id)) savePicks();
    if (firstRegistered()) round.setOptions(round.match.size, WIRE.MAPS.indexOf(id));
  };
  // Registered for a round about to run, the board shows the map it will play: the Worker's word, whoever picked it.
  const followMatchMap = () => {
    const m = round && round.match;
    if (phase === "board" && m && m.phase !== "play" && registered()) showMap(WIRE.MAPS[m.map]);
  };
  // Everything that belongs to the map, under one node so a new map replaces it whole: the ground and buildings, the
  // quiz pads, power-up spots, trampolines, ammo caches, and the campfire with its three dancing potato Oogas.
  // The extras (foliage, weather effects), all behind the Detail setting so they can be turned off or withdrawn.
  const detail = { full: true };
  const DETAIL_KEY = "ooga-block-detail";
  const loadDetail = () => { try { detail.full = localStorage.getItem(DETAIL_KEY) !== "low"; } catch { /* the default stands */ } };
  const chooseDetail = (full) => {
    if (full === detail.full) return;
    detail.full = full;
    try { localStorage.setItem(DETAIL_KEY, full ? "full" : "low"); } catch { /* this visit only */ }
    for (const b of el.details) b.setAttribute("aria-pressed", String((b.dataset.detail === "full") === full));
    if (sim) { buildMap(); mapBase = null; }
  };
  // A few themed plants and rocks round the island's outer ring: shared geometry, placed once a map, mirrored half
  // round. Haunted Hollow gets the Ghost Hunter's gargoyles and iron fence, when the arcade's models are loaded.
  const MAP_DECOR = { fort: ["rock", "bush", "tree"], town: ["tree", "bush", "bush"], jungle: ["tree", "tree", "bush"], haunted: ["rock", "rock", "bush"] };
  const buildDecor = (A, add) => {
    const kinds = MAP_DECOR[A.id], H = BL.hubModels;
    for (let k = 0; k < 18; k++) {
      const ang = k / 18 * Math.PI + 0.13 * (k % 5), n = 0.68 + 0.24 * ((k * 37 % 11) / 11), x = Math.sin(ang) * A.W * n, z = Math.cos(ang) * A.L * n;
      if (SIM.solidAt(x, 1, z) || SIM.solidAt(x, 3.8, z) || Math.abs(x) < A.fieldW + 1 && Math.abs(z) < A.fieldL + 1) continue;
      const kind = kinds[k % kinds.length], geo = kind === "tree" ? H.tree(k % 3) : kind === "bush" ? H.bush(k % 2) : H.rock(k % 3);
      for (const s of [1, -1]) add(createNode({ geometry: geo, sightHidden: true, position: { x: s * x, y: -0.02, z: s * z }, rotation: { x: 0, y: k * 2.1 * s, z: 0 } }));
    }
    const AM = BL.hauntModels;
    if (A.id === "haunted" && AM) {
      add(createNode({ geometry: BM.hauntDress(), sightHidden: true }));
      for (const [x0, x1, z0, z1] of A.graves) add(createNode({ geometry: BM.ghost(), sightHidden: true, position: { x: (x0 + x1) / 2, y: 0.1, z: (z0 + z1) / 2 }, scale: { x: 0.7, y: 0.7, z: 0.7 } }));
      for (const [x, y, z, turn] of [[-10, 3, 26, 0], [10, 3, 26, 0], [-14, 3.6, 32.1, 0.4], [14, 3.6, 32.1, -0.4]]) for (const s of [1, -1]) {
        add(createNode({ geometry: AM.gargoyle(), sightHidden: true, position: { x: s * x, y: y - 1.2, z: s * z }, rotation: { x: 0, y: turn + (s < 0 ? Math.PI : 0), z: 0 } }));
      }
      for (const z of [24.5, -24.5]) add(createNode({ geometry: AM.ironFence(), sightHidden: true, position: { x: 0, y: 0, z } }));
    }
  };
  let boltNode = null, boltRing = null, flashSeen = 0, enemyCatNear = false;
  const buildMap = () => {
    if (mapRoot) {
      removeChild(root, mapRoot);
      const i = placed.indexOf(mapRoot);
      if (i >= 0) placed.splice(i, 1);
    }
    const A = SIM.ARENAS[selection.map];
    mapRoot = place(createNode());
    mapClouds = [];
    const add = (node) => { addChild(mapRoot, node); return node; };
    add(createNode({ geometry: BM.arena(SIM.MAPS.indexOf(selection.map)) }));
    // The floating island it stands on (its rock, cliffs and terrain), and the hub's white clouds drifting under it.
    add(createNode({ geometry: BM.isle(SIM.MAPS.indexOf(selection.map)) }));
    add(createNode({ geometry: BM.keel(SIM.MAPS.indexOf(selection.map)) }));
    if (detail.full) buildDecor(A, add);
    for (const [x, z] of A.puddles || []) add(createNode({ geometry: BM.puddle(), position: { x, y: 0, z } }));
    boltNode = add(createNode({ geometry: BM.bolt(), visible: false, sightHidden: true }));
    boltRing = add(createNode({ geometry: BM.ring(0), visible: false, sightHidden: true, scale: { x: 3.2, y: 1, z: 3.2 } }));
    for (let k = 0; k < 12; k++) {
      const ang = k / 12 * Math.PI * 2 + 0.3, out = k % 3 === 0 ? 0.55 : 1.25, y = -9 - (k % 4) * 4.5;
      mapClouds.push(add(createNode({ geometry: BL.hubModels.cloud(k % 3), sightHidden: true, position: { x: Math.sin(ang) * (A.W * out + 6), y, z: Math.cos(ang) * (A.L * out + 6) }, rotation: { x: 0, y: ang, z: 0 } })));
    }
    // The hub's mossy boulders at the foot of each outcrop, half sunk into the rock.
    let boulders = 0;
    for (const b of A.rocks) {
      if (A.rockKind.get(b) !== "outcrop") continue;
      for (const [fx, fz] of [[0.05, 0], [0.95, 0.5], [0.4, 1]]) {
        const k = boulders++, sc = 0.85 + (k % 3) * 0.2;
        add(createNode({ geometry: BL.hubModels.rock(k % 3), sightHidden: true, position: { x: b[0] + (b[1] - b[0]) * fx, y: -0.08, z: b[2] + (b[3] - b[2]) * fz }, rotation: { x: 0, y: k * 1.9, z: 0 }, scale: { x: sc, y: sc, z: sc } }));
      }
    }
    // The stands, and the sniper towers' ladders, their rifle racks (dressing: the rifle is every Ooga's) and the ziplines, where this map has them.
    const mapIndex = SIM.MAPS.indexOf(selection.map);
    for (const t of SIM.TEAMS) {
      const st = A.stands[t], l = A.ladders[t], [x0, x1, z0, z1] = A.towers[t], i = TEAM_INDEX[t];
      add(createNode({ geometry: BM.stand(i), position: { x: st.x, y: 0, z: st.z } }));
      add(createNode({ geometry: BM.ladder(), position: { x: l.dx < 0 ? x1 + 0.05 : x0 - 0.05, y: 0, z: (l.zone[2] + l.zone[3]) / 2 } }));
      add(createNode({ geometry: BM.rack(i), position: { x: l.dx < 0 ? x0 + 0.7 : x1 - 0.7, y: C.TOWER_TOP, z: (z0 + z1) / 2 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } }));
      add(createNode({ geometry: BM.zipline(mapIndex * 2 + i) }));
    }
    // A lamp just over each zipline's handle: green when the visitor may take it, red when it would throw them off.
    zipLights = SIM.TEAMS.map((t) => { const z = A.zips[t]; return add(createNode({ geometry: BM.zipLight(0), position: { x: z.ax, y: z.ay + 0.3, z: z.az } })); });
    zipLit[0] = zipLit[1] = 0;
    pads = A.traps.map(([x, z]) => add(createNode({ geometry: BM.pad(), position: { x, y: 0, z } })));
    powerNodes = A.powers.map(([x, z]) => add(createNode({ geometry: BM.power(0), position: { x, y: 0, z } })));
    trampNodes = A.tramps.map(([x, z]) => add(createNode({ geometry: BM.tramp(), position: { x, y: 0, z } })));
    caches = A.caches.map(([x, y, z]) => add(createNode({ geometry: BM.cache(0), position: { x, y, z } })));
    // Each side's catapult, aimed at the other end; its arm swings when it throws.
    catapults = SIM.TEAMS.map((t) => {
      const [x, z] = A.catapults[t][0], [tx, tz] = A.drops[t], i = TEAM_INDEX[t], turn = Math.atan2(tx - x, tz - z);
      const node = add(createNode({ geometry: BM.catapult(i), position: { x: x + Math.sin(turn) * 1.6, y: 0, z: z + Math.cos(turn) * 1.6 }, rotation: { x: 0, y: turn, z: 0 } }));
      const arm = createNode({ geometry: BM.catapultArm(i), position: { x: 0, y: 0.45, z: 0.25 }, rotation: { x: -0.25, y: 0, z: 0 } });
      addChild(node, arm);
      return { team: t, arm, at: -10 };
    });
    const [fx, fz] = A.fire;
    add(createNode({ geometry: BM.firePit(), position: { x: fx, y: 0, z: fz } }));
    fireNode = add(createNode({ geometry: BM.flames(), position: { x: fx, y: 0.05, z: fz } }));
    // A heap of bananas by the fire, and each dancer with one in hand; the peels they've dropped round it.
    add(createNode({ geometry: BM.bananaPile(), position: { x: fx + 1.2, y: 0, z: fz + 0.2 } }));
    dancers = [0, 1, 2].map((k) => {
      const body = add(createNode({ geometry: BM.potato() }));
      const armL = createNode({ geometry: BM.potatoArm(), position: { x: -0.5, y: 0.78, z: 0 } });
      const armR = createNode({ geometry: BM.potatoArm(), position: { x: 0.5, y: 0.78, z: 0 } });
      addChild(armR, createNode({ geometry: BM.banana(), position: { x: 0, y: -0.36, z: 0.05 }, rotation: { x: 0, y: 0, z: Math.PI } }));
      addChild(body, armL, armR);
      return { body, armL, armR, k };
    });
    peelNodes = A.peels.map(([x, z], i) => add(createNode({ geometry: BM.peel(), position: { x, y: 0.01, z }, rotation: { x: 0, y: i * 1.7, z: 0 } })));
    // Gorilla Jungle: the cargo nets up to the tree forts, and the gorillas themselves.
    for (const n of A.nets || []) {
      const [x0, x1, z0, z1] = n.zone, w = n.dx ? z1 - z0 : x1 - x0;
      const key = `${Math.round(Math.max(w, 1.2) * 10)}:${Math.round(n.top * 10)}`;
      add(createNode({ geometry: BM.net2(key), position: { x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2 }, rotation: { x: 0.08, y: n.dx ? Math.PI / 2 : 0, z: 0 } }));
    }
    // The two grappling hooks, wherever they're hidden this round.
    hookStill = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    hookNodes = [];
    for (let i = 0; i < C.HOOKS; i++) hookNodes.push(add(createNode({ geometry: BM.hookHead(), visible: false, sightHidden: true, scale: { x: 1.4, y: 1.4, z: 1.4 } })));
    // Haunted Hollow's ghosts, one node each (the sim has the haunts both ways round).
    ghostNodes = [];
    for (let i = 0; i < (A.ghosts || []).length * 2; i++) ghostNodes.push(add(createNode({ geometry: BM.ghost(), visible: false, scale: { x: 1.1, y: 1.1, z: 1.1 } })));
    disposeGorillas();
    gorillaRigs = A.gorillas.map(([x, z]) => {
      const rig = BL.agent.create({ managed: true, groundAt: () => 0, x, z, scale: GORILLA_SCALE });
      add(rig.root);
      return rig;
    });
  };
  // The gorillas follow the sim: walking or charging, standing still holding an Ooga up, or dazed when painted.
  // Laser eyes: the eyes glow while the power waits or the beam runs; the beam runs from the eyes along the heading to
  // where it stops, sparks flying where it hits.
  const poseBeams = (elapsed) => {
    for (let i = 0; i < actors.length; i++) {
      const s = sim.actors[i], a = actors[i];
      if (!a.eyes) continue;
      a.eyes.visible = (s.laser > 0 || s.beam > 0) && !(i === 0 && cam.first);
      a.beam.visible = s.beam > 0 && s.beamLen > 0;
      if (!a.beam.visible) continue;
      const ey = s.y + (s.crouch ? C.CROUCH_H - 0.15 : 1.5), dx = Math.sin(s.heading), dz = Math.cos(s.heading);
      setVec(a.beam.position, s.x + dx * 0.25, ey, s.z + dz * 0.25);
      a.beam.rotation.y = s.heading;
      a.beam.scale.z = Math.max(0.1, s.beamLen - 0.25);
      a.beam.scale.x = a.beam.scale.y = 1 + Math.sin(elapsed * 60) * 0.15;
      if (Math.random() < 0.6) fx.burst(s.x + dx * s.beamLen, ey, s.z + dz * s.beamLen, 2, LASER_BITS, 1.6);
    }
  };
  let hookNodes = [], hookStill = false;
  // A hidden hook sits where it lies, turning slowly (dead still for a visitor who asks for reduced motion), until someone picks it up.
  const poseHooks = (elapsed) => {
    if (!sim || !hookNodes.length) return;
    for (let i = 0; i < hookNodes.length; i++) {
      const h = sim.hooks[i], n = hookNodes[i];
      n.visible = !!h && h.state === 0;
      if (!n.visible) continue;
      setVec(n.position, h.x, h.y + 0.55 + (hookStill ? 0 : Math.sin(elapsed * 2 + i) * 0.08), h.z);
      n.rotation.y = hookStill ? i : elapsed * 0.9 + i;
      // A soft golden glow and the odd sparkle so a hidden one catches the eye; still for reduced motion.
      n.glow = hookStill ? 0.8 : 0.7 + 0.5 * Math.sin(elapsed * 3 + i);
      if (!hookStill && Math.random() < 0.05) fx.burst(h.x, h.y + 0.8, h.z, 1, ORANGE_BITS, 0.5);
    }
  };
  let ghostNodes = [];
  // The ghosts drift, bob and sway, leaning into a chase; gone, they're hidden.
  const poseGhosts = (elapsed) => {
    if (!sim || !ghostNodes.length) return;
    for (let i = 0; i < ghostNodes.length; i++) {
      const g = sim.ghosts[i], n = ghostNodes[i];
      if (!g) { n.visible = false; continue; }
      n.visible = g.state !== 2;
      if (!n.visible) continue;
      setVec(n.position, g.x, g.y + 0.2, g.z);
      n.rotation.y = g.heading + Math.sin(elapsed * 1.7 + i) * 0.25;
      n.rotation.x = g.state === 1 ? 0.25 : 0.05 * Math.sin(elapsed * 2 + i);
      n.rotation.z = Math.sin(elapsed * 1.3 + i * 2) * 0.12;
    }
  };
  // The captive's right foot in the gorilla's left hand, its body pitched so the head trails near the ground: the hub's
  // `clankerGripAt`, `alignDraggedFoot` and `grabbedOogaPose` (private to its scene) cut down to a flat field.
  const GRIP_HAND = [0, 0, 0], GRIP_FOOT = [0, 0, 0];
  const holdByFoot = (rig, a, heading) => {
    const arm = rig.parts.armL, foot = a.cave.parts.legR, M4 = BL.math.mat4, p = a.body.position;
    updateWorld(rig.root, rig.root.parent.world);
    const hb = boundsOf(arm.geometry);
    M4.transformPoint(GRIP_HAND, arm.world, hb.center[0], hb.min[1] + 0.08, hb.center[2]);
    const reach = a.cave.traits.height * 0.9;
    a.body.rotation.x = -Math.acos(clamp((0.12 - GRIP_HAND[1]) / reach, -0.7, 0.3));
    a.body.rotation.y = heading; a.body.rotation.z = 0;
    setVec(p, GRIP_HAND[0], GRIP_HAND[1], GRIP_HAND[2]);
    updateWorld(a.body, a.body.parent.world);
    const fb = boundsOf(foot.geometry);
    M4.transformPoint(GRIP_FOOT, foot.world, fb.center[0], fb.min[1], fb.center[2]);
    p.x += GRIP_HAND[0] - GRIP_FOOT[0]; p.y += GRIP_HAND[1] - GRIP_FOOT[1]; p.z += GRIP_HAND[2] - GRIP_FOOT[2];
  };
  const GORILLA_SCALE = 1.35;
  const GORILLA_MOTION = [0, 1, 2, 3].map(() => ({ dragging: false, throwProgress: 0, walkGait: "" }));
  let gorillaRigs = [];
  const disposeGorillas = () => { for (const rig of gorillaRigs) rig.dispose(); gorillaRigs = []; };
  const gorillaPoke = (actor) => {
    if (!sim) return;
    const i = sim.gorillas.findIndex((g) => g.holding === actor), rig = gorillaRigs[i];
    if (rig && rig.pound) rig.pound(false, 1);
  };
  const poseGorillas = (dt, elapsed) => {
    if (!sim || !gorillaRigs.length) return;
    for (let i = 0; i < gorillaRigs.length; i++) {
      const g = sim.gorillas[i], rig = gorillaRigs[i];
      if (!g || !rig) continue;
      const stunned = g.state === 4, wob = stunned ? Math.sin(elapsed * 14) * 0.25 : 0, carry = g.state === 2 || g.state === 5, m = GORILLA_MOTION[i];
      // wicked's capture pose: the left hand on the Ooga's foot (`dragging`), swinging over on the throw (`throwProgress`).
      m.dragging = carry; m.throwProgress = g.state === 5 ? g.throwT : 0;
      m.walkGait = g.state === 1 || carry ? "gallop" : "";
      rig.poseManaged(dt, g.x, 0, g.z, g.heading + wob, stunned ? 0 : Math.hypot(g.vx, g.vz), false, false, "", m);
      if (carry && g.holding >= 0 && actors[g.holding] && actors[g.holding].cave) holdByFoot(rig, actors[g.holding], g.heading);
    }
  };
  // The fire flickers and spits embers; the potato Oogas dance round it, hopping and waving.
  const poseFire = (elapsed) => {
    const [cx, cz] = SIM.ARENAS[sim.map].fire;
    fireNode.scale.y = 1 + 0.18 * Math.sin(elapsed * 13) + 0.08 * Math.sin(elapsed * 31);
    fireNode.scale.x = fireNode.scale.z = 1 + 0.06 * Math.sin(elapsed * 17);
    fireNode.rotation.y = elapsed * 1.7;
    if (Math.random() < 0.12) fx.burst(cx + (Math.random() - 0.5) * 0.4, 1, cz + (Math.random() - 0.5) * 0.4, 1, ORANGE_BITS, 0.9);
    // A peel someone slipped on is kicked away; a dancer drops a fresh one after a while.
    for (let i = 0; i < peelNodes.length; i++) peelNodes[i].visible = sim.peels[i].dark <= 0;
    for (const d of dancers) {
      const a = elapsed * 0.7 + d.k * Math.PI * 2 / 3, x = cx + Math.sin(a) * 1.8, z = cz + Math.cos(a) * 1.8;
      setVec(d.body.position, x, Math.abs(Math.sin(elapsed * 5 + d.k * 1.3)) * 0.3, z);
      d.body.rotation.y = Math.atan2(cx - x, cz - z) + Math.sin(elapsed * 3 + d.k) * 0.4;
      d.body.rotation.z = Math.sin(elapsed * 5 + d.k * 1.3) * 0.12;
      d.armL.rotation.z = -2.2 + Math.sin(elapsed * 7 + d.k) * 0.7;
      d.armR.rotation.z = 2.2 - Math.sin(elapsed * 7 + d.k + 1) * 0.7;
    }
  };
  const chooseSkill = (k) => {
    selection.skill = k;
    for (const b of el.skills) b.setAttribute("aria-pressed", String(b.dataset.skill === k));
    savePicks();
  };
  const chooseTeam = (team) => {
    selection.team = team;
    for (const b of el.teams) b.setAttribute("aria-pressed", String(b.dataset.team === team));
    // The Ooga on show changes colour with its side.
    if (sim) {
      sim.team = team; sim.rival = SIM.other(team);
      for (let i = 0; i < sim.actors.length; i++) sim.actors[i].team = i < sim.size ? sim.team : sim.rival;
      paintTeams();
    }
  };
  // The name under the Ooga on show.
  const nameShowcase = () => {
    const n = actors && actors[0] ? actors[0].name : null;
    el.previewName.firstChild.textContent = el.oogaName.textContent = n ? contributors.traitsFor(n).display || n : "";
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go } = ctx);
    home = ctx.from === "arcade" ? "arcade" : "hub";
    watchVisit = ctx.place === WIRE.WATCH_DECK_PLACE;
    hudMod.leaveTo("block", home);
    camera = createCamera({ fov: 58, near: 0.3, far: 400 });
    audio = BL.blockAudio.create();
    live.fee = BL.mempool.state.nextFee || 0;
    live.block = 0;
    unfeed = BL.mempool.subscribe(onFeed);
    root = createNode();
    clock = daylight.createClock({ hour: hourParam, day: dayParam, now: new Date() });
    hud = hudMod.create({ roster: contributors.activeRoster });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    fx = fxMod.create({ root, renderer, camera, hud, overlay: ctx.overlay, tickerAt: { x: 0, y: 8, z: 0 } });
    for (const id of ["board", "results", "strip", "center", "struggle", "struggle-fill", "struggle-left", "struggle-meter", "struggle-word", "notice", "best", "record", "score-blue", "score-red", "own", "theirs", "time", "drop", "summary", "stats", "result-title", "rec-mined", "rec-home", "rec-splats", "rec-splatted", "rec-mvps", "trophy-stage", "final-blue", "final-red", "trophy-time", "side-blue", "side-red", "quiz", "quiz-q", "quiz-note", "quiz-fill"]) {
      el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(`block-${id}`);
    }
    el.struggleWord.textContent = COARSE ? "Tap fast!" : "Mash SPACE!";
    el.live = document.getElementById("block-live"); el.liveTitle = document.getElementById("block-live-title"); el.liveStatus = document.getElementById("block-live-status"); el.liveList = document.getElementById("block-live-list"); el.liveSizes = document.getElementById("block-live-sizes");
    el.liveReg = document.getElementById("block-live-reg"); el.liveReady = document.getElementById("block-live-ready"); el.liveWatch = document.getElementById("block-live-watch"); el.liveAlone = document.getElementById("block-live-alone"); el.liveWait = document.getElementById("block-live-wait");
    el.watch = document.getElementById("block-watch"); el.watchLine = document.getElementById("block-watch-line"); el.viewerBoard = document.getElementById("block-viewer-board"); el.viewerBlue = document.getElementById("block-viewer-blue"); el.viewerRed = document.getElementById("block-viewer-red"); el.viewerGoal = document.getElementById("block-viewer-goal"); el.viewerClock = document.getElementById("block-viewer-clock"); el.viewerCaps = document.getElementById("block-viewer-captures"); el.watchReg = document.getElementById("block-watch-reg");
    { const off = [document.getElementById("block-drop"), document.getElementById("block-view-btn")]; el.gameButtons = (viewing) => { for (const b of off) if (b) b.hidden = viewing; }; }
    el.againBtn = document.querySelector('#block-results [data-action="block-again"]');
    el.teams = [...document.querySelectorAll("#block-board [data-team]")];
    el.targets = [...document.querySelectorAll("#block-board [data-target]")];
    el.sizes = [...document.querySelectorAll("#block-board [data-size]")];
    el.maps = [...document.querySelectorAll("#block-board [data-map]")];
    el.onMap = (e) => { chooseMap(e.currentTarget.dataset.map); e.currentTarget.blur(); };
    for (const b of el.maps) b.addEventListener("click", el.onMap);
    el.skills = [...document.querySelectorAll("#block-board [data-skill]")];
    loadPicks();
    el.onSize = (e) => { chooseSize(Number(e.currentTarget.dataset.size)); e.currentTarget.blur(); };
    el.onSkill = (e) => { chooseSkill(e.currentTarget.dataset.skill); e.currentTarget.blur(); };
    for (const b of el.sizes) b.addEventListener("click", el.onSize);
    for (const b of el.skills) b.addEventListener("click", el.onSkill);
    for (const b of el.sizes) b.setAttribute("aria-pressed", String(Number(b.dataset.size) === selection.size));
    chooseSkill(selection.skill);
    for (const b of el.maps) b.setAttribute("aria-pressed", String(b.dataset.map === selection.map));
    el.boardHelp = document.getElementById("block-board-help");
    el.rules = [...document.querySelectorAll("#block-board [data-rule]")];
    el.onRule = (e) => { chooseRule(e.currentTarget.dataset.rule); e.currentTarget.blur(); };
    for (const b of el.rules) { b.addEventListener("click", el.onRule); b.setAttribute("aria-pressed", String(b.dataset.rule === selection.rule)); }
    el.onTarget = (e) => { chooseTarget(Number(e.currentTarget.dataset.target)); e.currentTarget.blur(); };
    for (const b of el.targets) b.addEventListener("click", el.onTarget);
    chooseTarget(selection.target);
    el.paintBtn = document.getElementById("block-paint");
    el.toolBar = document.getElementById("block-tools");
    el.toolName = document.getElementById("block-tool-name");
    el.weaponCard = document.getElementById("block-weapon-card");
    el.intro = document.getElementById("block-intro");
    el.weaponName = document.getElementById("block-weapon-name");
    el.weaponBlurb = document.getElementById("block-weapon-blurb");
    el.weaponCount = document.getElementById("block-weapon-count");
    el.weaponSteps = [...el.weaponCard.querySelectorAll("[data-weapon-step]")];
    for (const b of el.weaponSteps) b.addEventListener("click", onWeaponStep);
    show.shown = -1; show.hold = 0;
    showWeapon(0);
    loadDetail();
    el.details = [...document.querySelectorAll("#block-board [data-detail]")];
    el.onDetail = (e) => chooseDetail(e.currentTarget.dataset.detail === "full");
    for (const b of el.details) { b.addEventListener("click", el.onDetail); b.setAttribute("aria-pressed", String((b.dataset.detail === "full") === detail.full)); }
    el.tip = document.getElementById("block-tip");
    el.helpBox = document.getElementById("block-help-box");
    paintControls(document.getElementById("block-help-keys"));
    el.barMin = document.getElementById("block-bar-min");
    el.barGrip = document.getElementById("block-bar-grip");
    el.barDrag = null;
    try { const v = JSON.parse(localStorage.getItem(BAR_KEY) || "null"); if (v) { bar.min = !!v.min; bar.x = Number.isFinite(v.x) ? v.x : null; bar.y = Number.isFinite(v.y) ? v.y : null; } } catch { /* the defaults stand */ }
    el.barMin.addEventListener("click", toggleBar);
    el.barGrip.addEventListener("pointerdown", onBarDown);
    el.barGrip.addEventListener("pointermove", onBarMove);
    el.barGrip.addEventListener("pointerup", onBarUp);
    el.barGrip.addEventListener("pointercancel", onBarUp);
    window.addEventListener("resize", placeBar);
    window.addEventListener("resize", onTrophyResize);
    el.passBtn = document.querySelector('#block-tools [data-tool="pass"]');
    el.tools = [...el.toolBar.querySelectorAll("[data-tool]")];
    el.onTool = (e) => { const k = e.currentTarget.dataset.tool; e.currentTarget.blur(); if (!inRound()) return; if (k === "crate") buildCrate(); else if (k === "grab") grabCrate(); else if (k === "pass") passBlock(); else if (k === "zip") zipNow(); else chooseTool(k); };
    for (const b of el.tools) b.addEventListener("click", el.onTool);
    el.stamina = document.getElementById("block-stamina");
    el.fuel = document.getElementById("block-fuel");
    el.fuelK = -1;
    el.previewName = document.getElementById("block-preview-name");
    el.oogaSlot = document.getElementById("block-ooga-slot");
    el.oogaName = document.getElementById("block-ooga");
    el.previewName.hidden = true;
    el.map = document.getElementById("block-map");
    el.mapCtx = el.map.getContext("2d");
    el.feed = document.getElementById("block-feed");
    el.feedItems = [...el.feed.children];
    mapBase = null;
    el.power = document.getElementById("block-power");
    el.powerWord = document.getElementById("block-power-word");
    el.staminaK = -1;
    el.weatherWord = document.getElementById("block-weather-word");
    el.weatherKind = "";
    el.cross = document.getElementById("block-cross");
    el.viewBtn = document.getElementById("block-view-btn");
    el.soundBtn = document.getElementById("block-sound-btn");
    el.soundBtn.setAttribute("aria-pressed", String(!audio.muted));
    el.canvas = ctx.canvas;
    document.addEventListener("mousemove", onLockedMove);
    window.addEventListener("keydown", onArrow);
    window.addEventListener("keyup", onArrow);
    window.addEventListener("blur", onArrowBlur);
    // The view picked last time.
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
      if (v) {
        cam.island = v.mode === "island"; cam.first = v.mode === "first";
        if (v.zoom > 0) cam.zoom = clamp(v.zoom, ZOOM.chase[0], ZOOM.chase[1]);
        if (v.islandZoom > 0) cam.islandZoom = clamp(v.islandZoom, ZOOM.island[0], ZOOM.island[1]);
      }
    } catch { /* the defaults */ }
    el.canvas.addEventListener("mousedown", onLockedDown);
    el.canvas.addEventListener("mousedown", onRightDown);
    el.canvas.addEventListener("contextmenu", noMenu);
    window.addEventListener("keydown", onCrouchKey);
    window.addEventListener("keydown", onBuildKey, true);
    window.addEventListener("keydown", onTabKey, true);
    window.addEventListener("keyup", onCrouchKey);
    el.onPaint = (e) => { e.preventDefault(); if (inRound()) { trigger = true; paint(); } };
    window.addEventListener("mouseup", onTriggerUp);
    window.addEventListener("pointerup", onTriggerUp);
    window.addEventListener("pointercancel", onTriggerUp);
    window.addEventListener("blur", onTriggerUp);
    el.paintBtn.addEventListener("pointerdown", el.onPaint);
    el.answers = [...document.querySelectorAll("#block-quiz [data-answer]")];
    for (const b of el.answers) b.addEventListener("click", onAnswer);
    quiz.asked = quiz.solved = 0;
    const onTeam = (e) => { chooseTeam(e.currentTarget.dataset.team); e.currentTarget.blur(); };
    for (const b of el.teams) b.addEventListener("click", onTeam);
    el.onTeam = onTeam;
    blocks = {};
    ticks = {};
    for (const t of SIM.TEAMS) {
      const node = place(createNode({ geometry: BM.block(TEAM_INDEX[t]) }));
      const tickRoot = place(createNode());
      ticks[t] = [];
      for (let k = 0; k < 12; k++) {
        const n = createNode({ geometry: BM.tick(), rotation: { x: 0, y: k / 12 * Math.PI * 2, z: 0 }, visible: false });
        addChild(tickRoot, n);
        ticks[t].push(n);
      }
      blocks[t] = { node, tickRoot };
    }
    for (const t of SIM.TEAMS) iceNodes[t] = place(createNode({ geometry: BM.ice(), visible: false }));
    mapRoot = null;
    // The gun in view in first person.
    show.node = place(createNode({ geometry: BM.gun(0), visible: false, sightHidden: true, scale: { x: SHOW_K, y: SHOW_K, z: SHOW_K } }));
    show.w = 0;
    fpGun = place(createNode({ geometry: BM.gun(0), visible: false }));
    fpGunL = place(createNode({ geometry: BM.gun(0), visible: false }));
    fpFlash = createNode({ geometry: BM.muzzleFlash(), position: { ...MUZZLE }, visible: false }); fpFlashL = createNode({ geometry: BM.muzzleFlash(), position: { ...MUZZLE }, visible: false });
    addChild(fpGun, fpFlash); addChild(fpGunL, fpFlashL);
    shots = [];
    for (let i = 0; i < C.MAX_SHOTS; i++) shots.push(place(createNode({ geometry: BM.ball(0), visible: false })));
    crates = [];
    for (let i = 0; i < C.MAX_CRATES; i++) crates.push(place(createNode({ geometry: BM.crate(0), visible: false })));
    rain = [];
    for (let i = 0; i < RAIN; i++) rain.push({ node: place(createNode({ geometry: BM.streak(), visible: false })), x: 0, y: -1, z: 0 });
    splats = [];
    for (let i = 0; i < MAX_SPLATS; i++) splats.push(place(createNode({ geometry: BM.splat(0), visible: false, depthBias: 0.2 })));
    splatNext = 0;
    sim = SIM.create({ team: selection.team, seed: 1, size: selection.size, skill: selection.skill, target: selection.target, map: selection.map });
    buildMap();
    buildSkyClouds();
    buildTrophy();
    buildActors(castNames());
    for (let i = 0; i < actors.length; i++) sim.actors[i].name = actors[i].name;
    paintTeams();
    nameShowcase();
    // X is the mouse-look switch here, never a descent.
    controls = controlsMod.create({ move: document.getElementById("joy-move"), look: document.getElementById("joy-look"), boost: hud.el.act, onAction: act, pressActions: true, canDescend: () => false });
    blockScene.agentControls = controls;
    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit && hit.owner.kind === "ooga") hud.tooltip.show(actors[hit.owner.index].cave.traits.display, p.x, p.y, actors[hit.owner.index].cave);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => { if (hit && hit.owner.kind === "ooga") hud.tooltip.show(actors[hit.owner.index].cave.traits.display, p.x, p.y, actors[hit.owner.index].cave); },
      // A mouse throws on press (`onLockedDown`); a tap on a touch screen throws here.
      onTap: () => { if (phase === "play" && COARSE) paint(); },
      onOrbit: (dx, dy) => {
        // On the board a drag turns the Ooga on show.
        if (phase === "board") { preview.spin = wrap(preview.spin + dx * 8e-3); show.spin = wrap(show.spin + dx * 8e-3); return; }
        if (onDeck()) { audio.unlock(); deckYaw = clamp(deckYaw - dx * 5e-3, -1.1, 1.1); deckPitch = clamp(deckPitch + dy * 3e-3, -0.25, 0.5); return; }
        if (!inRound()) return;
        cam.face = wrap(cam.face - dx * 5e-3);
        cam.pitch = clamp(cam.pitch + dy * 3.5e-3, CAM.pitch[0], CAM.pitch[1]);
      },
      // The wheel or a two-finger swipe zooms the sniper's scope, and otherwise the camera.
      onZoom: (k, gesture) => {
        if (onDeck()) { zoomDeck(1 / k); return; }
        if (!inRound() || k === 1) return;
        if (scoped()) { if (gesture !== cam.zoomGesture) { cam.zoomGesture = gesture; zoomScope(k > 1 ? -1 : 1); } return; }
        if (cam.island) { cam.islandZoom = clamp(cam.islandZoom * k, ZOOM.island[0], ZOOM.island[1]); saveView(); return; }
        if (cam.first) {
          // Out of first person on a fresh swipe outward, close over the shoulder.
          if (k > 1 && gesture !== cam.zoomGesture) { cam.zoomGesture = gesture; cam.zoom = ZOOM.chase[0]; setMode("chase", true); }
          return;
        }
        const was = cam.zoom;
        cam.zoom = clamp(cam.zoom * k, ZOOM.chase[0], ZOOM.chase[1]);
        // Already all the way in when this swipe began: into first person.
        if (k < 1 && was <= ZOOM.chase[0] + 1e-6 && gesture !== cam.zoomGesture) { setMode("first", true); }
        cam.zoomGesture = gesture;
        saveView();
      }
    });
    hud.onAction((action) => {
      // Nothing in the chairs reaches the game: a viewer has no Ooga, tools or block.
      if (onDeck() && (action === "block-drop" || action === "act" || action === "block-view")) return;
      if (action === "block-start" || action === "block-again") beginFromMenu();
      else if (action === "block-live-reg") {
        if (!round) return;
        const own = BL.net.ownAmong(contributors.activeRoster);
        if (registered()) { round.unregister(); BL.net.setBody(null); }
        else if (own) { BL.net.setBody(own); BL.net.sendPose(0, 0, 0, 0); const pick = WIRE.MAPS.indexOf((kept || selection).map); round.register(pick < 0 ? undefined : pick); }
      }
      else if (action === "block-live-ready") round.setReady(!isReady());
      else if (action === "block-live-alone") round.startAlone();
      else if (action === "block-live-wait") round.setReady(true);
      else if (action.startsWith("block-live-size-")) round.setOptions(Number(action.slice(-1)), WIRE.MAPS.indexOf(selection.map));
      else if (action === "block-live-watch") joinDeck();
      else if (action === "block-board") showBoard();
      else if (action === "block-help") el.helpBox.hidden = !el.helpBox.hidden;
      else if (action === "block-drop") dropBlock();
      else if (action === "block-view") { if (!paused) cycleView(); }
      else if (action === "block-sound") {
        audio.unlock();
        audio.setMuted(!audio.muted);
        el.soundBtn.setAttribute("aria-pressed", String(!audio.muted));
        notice(audio.muted ? "Sound off" : "Sound on", 900);
      }
      else if (action === "leave") go(home);
      else if (action === "act") act();
    });
    hud.setStats(game.state);
    // The board has its own Ooga picker and the sheet's roster does not drive this scene, so the panels stay away for the
    // whole visit, without touching the visitor's saved panel choices.
    hud.setPanelsHidden(true);
    el.help = document.getElementById("block-help");
    el.controlsList = document.getElementById("block-controls-list");
    // The board keeps one short line; the whole list waits behind "All controls", so it never crowds the choices.
    if (COARSE) el.help.textContent = "Left stick moves · right stick turns · Throw! fires · View · Main menu";
    else paintSummary(el.help);
    paintControls(el.controlsList);
    showBoard();
    // The board the scene opens on clears a watch visit; one arriving for the chairs still wants them, at once, room or no room.
    watchVisit = ctx.place === WIRE.WATCH_DECK_PLACE;
    if (watchVisit) showDeck();
    stateTimer = window.setInterval(() => fx.trimPool(), 6e4);
    hintTimer = window.setTimeout(() => hud.hint(COARSE ? "Pick a side, then Play!" : "Pick a side, then Play! (Enter)"), 1200);
    Object.assign(blockScene, {
      root, camera, input,
      debug: {
        hud, camera, controls, cavemen: null, crates: null,
        block: {
          get phase() { return phase; },
          get paused() { return paused; },
          get sim() { return sim; },
          get actors() { return actors; },
          // Plays a live feed message as if it had arrived: { type: "fees", nextFee } or { type: "block", height }.
          feed: onFeed,
          get result() { return result; },
          get cam() { return cam; },
          get quiz() { return { open: quiz.open, right: quiz.right, locked: quiz.locked, asked: quiz.asked, solved: quiz.solved }; },
          get tool() { return tool; },
          selection, start, showBoard, paint, drop: dropBlock, build: buildCrate, chooseTool, chooseTeam, chooseOoga, answer,
          // Runs the round forward without frames, the visitor's Ooga on the sim's autopilot when `auto` is set.
          simulate: (seconds, auto = false) => {
            if (phase !== "play") return;
            sim.actors[0].bot = auto ? "auto" : false;
            const still = { x: 0, z: 0, sprint: 0, jump: 0 };
            for (let t = 0; t < seconds && !sim.over; t += C.STEP) {
              SIM.tick(sim, C.STEP, still);
              readEvents();
            }
            sim.actors[0].bot = false;
            updateStrip();
            if (sim.over) finish();
          }
        }
      }
    });
  };
  const leave = () => {
    // The board's own picks back, whatever match it was showing (it is shown again on the next visit).
    boardFollowsMatch(null, false, false);
    if (round) { round.dispose(); round = null; }
    if (el.live) el.live.hidden = true;
    if (el.watch) el.watch.hidden = true;
    if (el.viewerBoard) el.viewerBoard.hidden = true;
    undeckRender();
    chairsGreeted = false;
    deck = null; you = 0; kept = null; liveCast = null; watchVisit = false; panelOpen = false;
    BL.net.setBody(null);
    audio.dispose();
    audio = null;
    unfeed();
    unfeed = null;
    window.clearInterval(stateTimer);
    window.clearTimeout(hintTimer);
    window.clearTimeout(centerTimer);
    window.clearTimeout(noticeTimer);
    hideToolName();
    for (const b of el.teams) b.removeEventListener("click", el.onTeam);
    for (const b of el.targets) b.removeEventListener("click", el.onTarget);
    for (const b of el.rules) b.removeEventListener("click", el.onRule);
    for (const b of el.sizes) b.removeEventListener("click", el.onSize);
    for (const b of el.maps) b.removeEventListener("click", el.onMap);
    for (const b of el.skills) b.removeEventListener("click", el.onSkill);
    el.paintBtn.removeEventListener("pointerdown", el.onPaint);
    window.removeEventListener("mouseup", onTriggerUp);
    window.removeEventListener("pointerup", onTriggerUp);
    window.removeEventListener("pointercancel", onTriggerUp);
    window.removeEventListener("blur", onTriggerUp);
    trigger = false;
    el.toolBar.hidden = true;
    for (const b of el.tools) b.removeEventListener("click", el.onTool);
    for (const b of el.details) b.removeEventListener("click", el.onDetail);
    for (const b of el.weaponSteps) b.removeEventListener("click", onWeaponStep);
    el.weaponCard.hidden = true;
    show.node = null;
    el.barMin.removeEventListener("click", toggleBar);
    el.barGrip.removeEventListener("pointerdown", onBarDown);
    el.barGrip.removeEventListener("pointermove", onBarMove);
    el.barGrip.removeEventListener("pointerup", onBarUp);
    el.barGrip.removeEventListener("pointercancel", onBarUp);
    window.removeEventListener("resize", placeBar);
    window.removeEventListener("resize", onTrophyResize);
    document.removeEventListener("mousemove", onLockedMove);
    window.removeEventListener("keydown", onArrow);
    window.removeEventListener("keyup", onArrow);
    window.removeEventListener("blur", onArrowBlur);
    el.canvas.removeEventListener("mousedown", onLockedDown);
    el.canvas.removeEventListener("mousedown", onRightDown);
    el.canvas.removeEventListener("contextmenu", noMenu);
    window.removeEventListener("keydown", onCrouchKey);
    window.removeEventListener("keydown", onBuildKey, true);
    window.removeEventListener("keydown", onTabKey, true);
    window.removeEventListener("keyup", onCrouchKey);
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    el.cross.hidden = true;
    cam.first = cam.island = false;
    move.crouch = 0;
    el.paintBtn.hidden = true;
    for (const b of el.answers) b.removeEventListener("click", onAnswer);
    closeQuiz();
    disposeActors();
    disposeGorillas();
    fx.dispose();
    controls.dispose();
    hud.el.act.hidden = true;
    hideStruggle();
    hud.setAct("Ooga!");
    for (const node of placed) removeChild(root, node);
    placed.length = 0;
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    phase = "board";
    skyClouds = []; skyPerch = null; trophy = trophyNodes = null;
    sim = blocks = shots = splats = ticks = pads = crates = rain = caches = zipLights = fpGun = fpGunL = fpFlash = fpFlashL = trampNodes = powerNodes = result = null;
    mapRoot = fireNode = dancers = peelNodes = catapults = boltNode = boltRing = null;
    hookNodes = []; ghostNodes = [];
    catNear = false;
    for (const t of SIM.TEAMS) iceNodes[t] = null;
    zipNear = false;
    hud = hooks = input = fx = controls = clock = null;
    blockScene.input = blockScene.debug = blockScene.agentControls = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    if (actors) for (const a of actors) if (a.cave) set.add(a.cave.headOpen).add(a.cave.headClosed);
    for (let i = 0; i < 6; i++) set.add(BM.splat(i));
    set.add(BM.muzzleFlash());
    for (let i = 0; i < 2; i++) set.add(BM.ball(i)).add(BM.ring(i));
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), phase };
  };
  Object.assign(blockScene, { enter, update, overlay, onDonation, onKey, leave, stats, liveGeometry });
  BL.scenes = BL.scenes || {};
  BL.scenes.block = blockScene;
})();
