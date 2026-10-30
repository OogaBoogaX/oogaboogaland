// Block Frenzy: capture the flag on Fort Chaos, Bitcoin themed. Each side guards its Bitcoin block, a glowing cube in
// its team's colour on a stand in its fort; steal the other side's, carry it home and touch your own stand while your own block is
// home. Paint splats a rival for a moment (a carrier drops what they carry) and nobody dies. Two a side: the visitor
// and a teammate against two rivals, the three bots run by `block-sim.js`. First to three captures.
//
// Phases `board` (choose a side), `play` and `results`. The rules run in `blockSim.step` on a fixed step; this file
// draws them: the arena and stands built once a visit, the four Oogas posed from the sim each frame, the two blocks on
// their stands, at a carrier's back or lying where they fell, pooled crates, throws and splats, the weather (a wind
// sign, rain and lightning in a storm), and a chase camera behind the visitor's Ooga that the mouse drag, Q E or the
// look stick turns. W A S D run toward where the camera looks, Shift sprints, Space jumps and jumps again in the air,
// a left click or Enter throws the chosen tool (1 paint, 2 grenade, 3 rocket, 4 net; R, a right click or the wheel
// step through them), B drops a crate, F lifts, stacks and sets crates, G drops the
// block, C crouches while held, V switches between the chase camera and first person (a click there locks the mouse
// for aiming; Escape lets it go). On touch the act button jumps, `#block-paint` throws and the tool bar picks. A round
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
  const { clamp, damp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const TEAM_INDEX = { blue: 0, red: 1 };
  const WRONG_LOCK_MS = 2500, MAX_SPLATS = 40, CAM = { dist: 6.8, height: 1.8, pitch: [-0.15, 0.9], yawRate: 2.4 };
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
  const BLAST_BITS = ["#ff8a1f", "#ffd66b", "#3d3d44", "#efe6cc"].map((c, i) => models.particleGeometry(c, 0.09, i < 2 ? 1 : 0));
  const STAR_BITS = ["#ffe066", "#fff3d6"].map((c) => models.particleGeometry(c, 0.09, 1));
  const TOOL_KEYS = { 1: "paint", 2: "grenade", 3: "rocket", 4: "net", 5: "sniper", 6: "gold", 7: "ak" };
  // Each tool's gun (`BM.gun` takes the gun's index times two plus the team's); Lift shows none.
  const GUN_OF = { paint: 0, grenade: 1, rocket: 2, net: 3, sniper: 4, gold: 5, ak: 6, crate: 0, grab: -1 };
  const WEATHER_WORDS = { clear: "Clear", breeze: "Windy", storm: "Storm" };
  const RAIN = 140;
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
  RENDER_OPTS.sea = -30;
  const setVec = (v, x, y, z) => { v.x = x; v.y = y; v.z = z; };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const pick = (list, i) => list[i % list.length];
  // Kept for the page's life: the side last chosen.
  // The side, the Ooga, the captures to win, the Oogas a side and the bots' skill the visitor picked on the board; the
  // last three are remembered in this browser (`PICKS_KEY`) for next time.
  const TARGETS = [1, 3, 5, 7], SIZES = [2, 3, 4, 5], PICKS_KEY = "oogaboogaland.blockPicks";
  const selection = { team: "blue", ooga: null, target: 3, size: 3, skill: "normal", map: "fort" };
  const loadPicks = () => {
    try {
      const p = JSON.parse(localStorage.getItem(PICKS_KEY) || "{}");
      if (TARGETS.includes(p.target)) selection.target = p.target;
      if (SIZES.includes(p.size)) selection.size = p.size;
      if (SIM.SKILLS[p.skill]) selection.skill = p.skill;
      if (SIM.ARENAS[p.map]) selection.map = p.map;
    } catch { /* nothing saved, or storage closed: the defaults stand */ }
  };
  const savePicks = () => {
    try { localStorage.setItem(PICKS_KEY, JSON.stringify({ target: selection.target, size: selection.size, skill: selection.skill, map: selection.map })); } catch { /* the picks last this visit */ }
  };

  let home = "hub";
  let renderer, game, world, go, root, camera, hud, hooks, input, fx, controls, clock;
  let sim = null, phase = "board", sceneTime = 0, stateTimer = 0, hintTimer = 0, lineN = 0, result = null;
  let actors = null, blocks = null, shots = null, splats = null, splatNext = 0, ticks = null, pads = null, crates = null, rain = null, caches = null, fpGun = null, fpGunL = null, walletNodes = null, vendNodes = null, zipNear = false, trampNodes = null, trampSeen = false, powerNodes = null;
  let mapRoot = null, fireNode = null, dancers = null, burnSeen = false, peelNodes = null, catapults = null, catNear = false;
  const iceNodes = {};
  let tool = "paint", flash = 0, flashT = 0, audio = null, unfeed = null;
  // The live Bitcoin network's say: the next block's median fee sets the weather (a busy mempool is a storm), and a
  // block found resets the pads and caches. `FEE_WEATHER` is sat/vB: below the first clear, below the second breezy.
  const FEE_WEATHER = [6, 25];
  const live = { fee: 0, block: 0 };
  const feeWeather = (fee) => fee <= 0 ? null : fee < FEE_WEATHER[0] ? "clear" : fee < FEE_WEATHER[1] ? "breeze" : "storm";
  const onFeed = (ev) => {
    if (ev.type === "fees" && ev.nextFee > 0) live.fee = ev.nextFee;
    else if (ev.type === "block") live.block = ev.height;
  };
  // The sniper scope: its zoom step (`ZOOMS`, degrees of view), and the tool and view to go back to off the tower.
  const ZOOMS = [34, 20, 11];
  const scope = { zoom: 0, tool: "paint", first: false, island: false };
  // The quiz: the deck of question indices still to ask this visit, the one on the card and where its right answer sits.
  const quiz = { open: false, deck: [], index: -1, right: -1, locked: false, lockTimer: 0, asked: 0, solved: 0 };
  const placed = [];
  // `face` is where the visitor's Ooga faces and aims; `yaw` is the camera's, which follows it round.
  // `lift` is how far the chase camera has risen over something behind the Ooga, `dist` how far back it sits, `close`
  // when it is so near that the Ooga would fill the view.
  const cam = { yaw: Math.PI, face: Math.PI, pitch: 0.28, warm: false, first: false, lift: 0, dist: 6.8, close: false, island: false, orbit: Math.PI, shuffle: false, zoom: 1, islandZoom: 1, zoomGesture: -1 };
  // Two-finger swipe (or the wheel) zooms the camera in and out, as on the island: the chase camera from close over
  // the shoulder to far back (all the way in, a fresh swipe steps into first person, and out of it again), the Island
  // view from near to high overhead.
  const ZOOM = { chase: [0.35, 2.4], island: [0.45, 2.2] };
  // The Island view, as Ooga Booga Land plays: the camera high and back, W A S D running the way the screen faces,
  // the Ooga turning to run, Q E or the arrow keys swinging the camera round, and a click throwing at the pointer.
  const ISLAND = { dist: 11, pitch: 0.72, height: 1.2 };
  // The visitor's view and side-step choice, kept between visits.
  const VIEW_KEY = "blockfrenzy-view";
  // Arrow keys held, read apart from A and D so side-step mode can turn on the arrows while A and D step.
  const arrows = { left: 0, right: 0 };
  const pointer = { x: 0, y: 0, seen: false };
  const EYE = { x: 0, y: 0, z: 0 };
  const move = { x: 0, z: 0, sprint: 0, jump: 0, jet: 0, crouch: 0, face: 0 };
  let jumpWas = false;
  const el = {};
  const blockScene = {
    id: "block", renderOpts: RENDER_OPTS, root: null, camera: null, input: null, debug: null, agent: null, agentControls: null,
    get inMotion() { return phase === "play" || fx.inMotion; }
  };

  const place = (node) => { addChild(root, node); placed.push(node); return node; };
  const roster = () => contributors.activeRoster.map((c) => c.name);
  // The four Oogas: the visitor's own when signed in, else the one a cabinet sent in, else the first; then three
  // others from the roster, in its order.
  const castNames = () => {
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
      if (cave) {
        const h = cave.headOffset / 1.1, u = h / 16;
        gun = createNode({ geometry: BM.gun(0), position: { x: 0, y: -10 * u, z: 0.03 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: { x: h / 1.5, y: h / 1.5, z: h / 1.5 }, visible: false });
        addChild(cave.parts.armR, gun);
        // The left hand's golden AK, shown only with the pair.
        gunL = createNode({ geometry: BM.gun(0), position: { x: 0, y: -10 * u, z: 0.03 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, scale: { x: h / 1.5, y: h / 1.5, z: h / 1.5 }, visible: false });
        addChild(cave.parts.armL, gunL);
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
      return { body, cave, ring, blob, bubble, netted, held, trolley, chute, monkeys, jet, jetFlame, gun, gunL, pet, eyes, beam, phase: 0, name };
    });
  };
  const disposeActors = () => {
    if (!actors) return;
    for (const a of actors) {
      if (a.cave) input.remove(a.cave.parts.torso);
      for (const node of a.pet ? [a.body, a.beam, a.pet.node] : [a.body, a.beam]) {
        removeChild(root, node);
        const i = placed.indexOf(node);
        if (i >= 0) placed.splice(i, 1);
      }
    }
    actors = null;
  };
  // A new Ooga picked on the board: the four are cast again round it.
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
  const openQuiz = () => {
    quiz.open = true;
    nextQuestion();
    el.quizNote.textContent = COARSE ? "Tap the right answer to break the bubble." : "Click or press 1 to 4. Right answer breaks the bubble.";
    el.quiz.hidden = false;
    hud.el.act.hidden = el.paintBtn.hidden = true;
  };
  const closeQuiz = () => {
    quiz.open = quiz.locked = false;
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
      closeQuiz();
      SIM.escape(sim, 0);
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
  const onAnswer = (e) => { const k = Number(e.currentTarget.dataset.answer); e.currentTarget.blur(); answer(k); };

  const showBoard = () => {
    closeQuiz();
    phase = "board";
    el.board.hidden = false;
    el.results.hidden = el.strip.hidden = el.center.hidden = el.notice.hidden = el.toolBar.hidden = el.map.hidden = el.feed.hidden = true;
    hud.el.act.hidden = el.paintBtn.hidden = el.cross.hidden = true;
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    for (const b of el.teams) b.setAttribute("aria-pressed", String(b.dataset.team === selection.team));
    el.best.textContent = game.state.block.best ? fmt(game.state.block.best) : "none yet";
    el.record.textContent = `${game.state.block.wins} won of ${game.state.block.games}`;
  };
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const start = () => {
    audio.unlock();
    if (!actors || !actors[0].cave) return;
    sim.team = selection.team;
    sim.rival = SIM.other(selection.team);
    for (let i = 0; i < sim.actors.length; i++) sim.actors[i].team = i < sim.size ? sim.team : sim.rival;
    sim.target = selection.target;
    sim.skill = selection.skill;
    sim.bots = SIM.SKILLS[selection.skill];
    SIM.reset(sim, (Date.now() & 0x7fffffff) || 1);
    paintTeams();
    for (const s of splats) s.visible = false;
    phase = "play";
    result = null;
    closeQuiz();
    el.board.hidden = el.results.hidden = true;
    el.strip.hidden = el.toolBar.hidden = el.map.hidden = el.feed.hidden = false;
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
    center(`BUILD ${Math.ceil(sim.prep)}`, 0);
    notice(COARSE ? "Fortify! Crate drops one · walk into crates to push" : "Fortify! B drops a crate · F lifts and stacks", 0);
    updateStrip();
  };
  const finish = () => {
    closeQuiz();
    phase = "results";
    const won = sim.winner === sim.team, ms = Math.round(sim.time * 1000);
    // The fastest win is kept for the usual first to three; every round still counts.
    const best = game.recordBlock({ won, ms: sim.target === C.CAPTURES ? ms : 0 });
    result = { won, ms, best };
    el.strip.hidden = el.toolBar.hidden = el.map.hidden = el.feed.hidden = true;
    el.center.hidden = el.notice.hidden = true;
    hud.el.act.hidden = el.paintBtn.hidden = el.cross.hidden = true;
    if (document.pointerLockElement === el.canvas) document.exitPointerLock();
    el.resultTitle.textContent = won ? "Blocks mined!" : "Rivals mined it";
    (won ? audio.cues.win : audio.cues.lose)();
    audio.state.zip = 0;
    el.summary.textContent = `${sim.score[sim.team]} to ${sim.score[sim.rival]} in ${fmt(ms)} · first to ${sim.target}${best ? " · fastest win yet!" : ""}`;
    const me = sim.actors[0];
    el.stats.innerHTML = "";
    // The round's highlights: its most valuable Ooga, the sharpest shot, the longest sniper hit.
    let mvp = 0, shooter = 0, sniper = 0;
    const worth = (a) => a.captures * 3 + a.rescues * 2 + a.hits;
    for (let i = 1; i < sim.actors.length; i++) {
      const a = sim.actors[i];
      if (worth(a) > worth(sim.actors[mvp])) mvp = i;
      if (a.hits > sim.actors[shooter].hits) shooter = i;
      if (a.longShot > sim.actors[sniper].longShot) sniper = i;
    }
    const rows = [["Round MVP", `${nameOf(mvp)} · ${sim.actors[mvp].captures} mined, ${sim.actors[mvp].hits} splats`], ["Most splats", `${nameOf(shooter)} · ${sim.actors[shooter].hits}`]];
    if (sim.actors[sniper].longShot > 0) rows.push(["Longest sniper shot", `${nameOf(sniper)} · ${Math.round(sim.actors[sniper].longShot)} m`]);
    rows.push(["Your captures", me.captures], ["Your splats", me.hits], ["Times splatted", me.splats], ["Fastest win", game.state.block.best ? fmt(game.state.block.best) : "—"], ["Rounds won", `${game.state.block.wins} of ${game.state.block.games}`]);
    for (const [label, value] of rows) {
      const li = document.createElement("li"), span = document.createElement("span"), b = document.createElement("b");
      span.textContent = label;
      b.textContent = String(value);
      li.append(span, b);
      el.stats.append(li);
    }
    el.results.hidden = false;
    if (won) for (const a of actors.slice(0, 2)) if (a.cave) fx.burst(a.body.position.x, 1.5, a.body.position.z, 24, ORANGE_BITS, 3);
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
  let stripKey = "";
  const updateStrip = () => {
    const own = sim.flags[sim.team], theirs = sim.flags[sim.rival], me = sim.actors[0];
    const key = `${sim.score.blue}${sim.score.red}${own.state}${theirs.state}${me.carrying}${me.holding}${me.splat > 0}${Math.ceil(sim.time)}`;
    if (key === stripKey) return;
    stripKey = key;
    el.scoreBlue.textContent = String(sim.score.blue);
    el.scoreRed.textContent = String(sim.score.red);
    el.own.textContent = STATE_WORDS[own.state];
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
    else if (t === "throw") { const kind = e.actor >= 0 ? sim.actors[e.actor].lastKind : ""; if (kind === "sniper") c.sniper(k); else if (kind === "rocket") c.rocket(k); else c.throw(k); }
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
    else if (t === "knock" || t === "drop") c.drop(k);
    else if (t === "pass") c.pass(k);
    else if (t === "capture") (mine ? c.capture : c.theirCapture)();
    else if (t === "go") c.go();
    else if (t === "burn") c.burn(me ? 1 : k);
    else if (t === "slip") c.slip(me ? 1 : k);
    else if (t === "grab") c.roar(me ? 1 : k);
    else if (t === "boo") c.boo(me ? 1 : k);
    else if (t === "homers") c.rocket(0.45 * k);
    else if (t === "ghostpop") c.ghostPop(k);
    else if (t === "struggle" && me) c.grunt();
    else if (t === "breakfree" && me) c.free();
    else if (t === "gorillahit") c.yelp(k);
    else if (me && t === "trap") c.trap();
    else if (me && (t === "refill" || t === "cache")) c.refill();
    else if (me && t === "rifle") c.rifle();
    else if (me && t === "zip") c.zipOn();
    else if (me && t === "unzip") c.zipOff();
    else if (me && (t === "jump" || t === "jump2")) c.jump();
  };
  // The name shown for Ooga i: "You" for the visitor, else its display name.
  const nameOf = (i) => {
    if (i === 0) return "You";
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
    else if (t === "boo") feed(`A ghost spooked ${e.actor === 0 ? "you" : who}!`, e.team);
    else if (t === "ghostpop" && e.actor >= 0) feed(`${nameOf(e.actor)} popped a ghost`, sim.actors[e.actor].team);
    else if (t === "rekt") feed(e.by >= 0 && e.by !== e.actor ? `${nameOf(e.by)}'s wallet rekt ${who}` : `${who} got rekt by a free wallet`, e.by >= 0 ? sim.actors[e.by].team : e.team);
    else if (t === "grab") feed(`A gorilla grabbed ${e.actor === 0 ? "you" : who}!`, e.team);
    else if (t === "breakfree") feed(`${who} wriggled free of a gorilla`, e.team);
    else if (t === "gorillahit" && e.actor >= 0) feed(`${nameOf(e.actor)} stunned a gorilla`, sim.actors[e.actor].team);
    else if (t === "gold") feed(`${who} won the Golden Dual AKs!`, e.team);
    else if (t === "launch") feed(`${who} catapulted toward the ${TEAM_NAME[SIM.other(e.team)]} fort!`, e.team);
    else if (t === "goldsteal") feed(`${who} wallet-bombed ${nameOf(e.by)} and stole the Golden Dual AKs!`, e.team);
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
    g.fillStyle = "#8a7550";
    g.fillRect(0, 0, c.width, c.height);
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
  const drawMap = (dt, elapsed) => {
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
    g.fillStyle = "#e0262c";
    for (const v of sim.vends) g.fillRect(mapX(v.x) - 2, mapY(v.z) - 2, 4, 4);
    g.fillStyle = "#ff8a1f";
    for (const w of sim.wallets) if (w.live && w.state) g.fillRect(mapX(w.x) - 1, mapY(w.z) - 1, 3, 3);
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
    for (let i = 0; i < sim.eventCount; i++) {
      const e = sim.events[i], mine = e.team === sim.team, me = e.actor === 0;
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
        if (me) { center("GOT THE BLOCK!", 1100); notice(SIM.ARENA.goals ? "Run it to the glowing ring at the foot of your house's front steps (or down to your block's spot in your cellar)" : COARSE ? "Run it home · Drop hands it off" : "Run it home to your stand · G drops it", 4000); }
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
      else if (e.type === "throw") { if (e.actor === 0) updateTools(); }
      else if (e.type === "fire") { if (me && tool === "ak") updateTools(); }
      else if (e.type === "rifle") {
        if (me) {
          // Up the tower: the rifle comes up in a scope view.
          scope.tool = tool === "sniper" ? "paint" : tool; scope.first = cam.first; scope.zoom = 0;
          if (sim.actors[0].carrying) {
            // Up their tower with a block: the way home is the zipline, so the rifle waits on 5.
            notice(COARSE ? "Zip rides their line straight into our fort!" : "E rides their zipline straight home! (5 for the sniper rifle)", 3600);
            updateTools();
          } else {
            chooseTool("sniper");
            scope.island = cam.island;
            if (!cam.first) setMode("first", true);
            center("SNIPER RIFLE!", 1000);
            notice(COARSE ? "Drag to aim · Paint! fires · tap View to look round" : "Click fires · wheel, two-finger swipe or + − zooms · R puts it down · E rides the zipline", 4200);
          }
        }
      } else if (e.type === "unrifle") {
        if (me) {
          // Off the tower the rifle stays on its rack, and the view goes back to how it was.
          if (tool === "sniper") chooseTool(scope.tool);
          if (!scope.first && cam.first) setMode(scope.island ? "island" : "chase", true);
          updateTools();
        }
      }
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
        if (e.actor === 0) updateTools();
        if (e.type === "set") fx.burst(e.x, e.y + 0.2, e.z, 6, WOOD_BITS, 1.2);
        if (e.type === "lift" && e.actor === 0) notice("Crate up! Click throws it · F sets it down or stacks it", 2200);
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
        const w = sim.weather.kind, fee = sim.live ? ` · mempool fees ${Math.round(live.fee)} sat/vB` : "";
        notice((w === "storm" ? "A storm rolls in! Hold on to something" : w === "breeze" ? "The wind picks up · throws drift" : "The sky clears") + fee, 2800);
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
          notice(COARSE ? "One in each hand, full auto! Hold Paint · a wallet bomb stuck on you takes them" : "One in each hand, full auto! Hold click (6) · a wallet bomb stuck on you takes them", 4000);
          chooseTool("gold");
        } else notice(mine ? "Teammate won the Golden Dual AKs!" : "They won the Golden Dual AKs · stick a wallet bomb on them to steal them", 2600);
        updateTools();
      } else if (e.type === "goldsteal") {
        fx.burst(e.x, e.y, e.z, 18, ORANGE_BITS, 2.6);
        if (me) { center("STOLEN!", 1000); notice("Your wallet bomb took the Golden Dual AKs! They're yours (6)", 3000); audio.cues.rescue(); chooseTool("gold"); }
        else if (e.by === 0) { center("AKs STOLEN!", 1000); notice("A wallet bomb went off on you · they took your Golden Dual AKs", 2600); if (tool === "gold") chooseTool("paint"); }
        updateTools();
      } else if (e.type === "reload") {
        if (me) { notice("Reloading…", 1000); audio.cues.crate(0.6); updateTools(); }
      } else if (e.type === "reloaded") {
        if (me) { audio.cues.rifle(); updateTools(); }
      } else if (e.type === "slip") {
        fx.burst(e.x, 0.3, e.z, 8, ORANGE_BITS, 1.6);
        if (me) { center("SLIP!", 900); notice("Banana peel! Spinning…", 1500); }
      } else if (e.type === "wallet") {
        fx.burst(e.x, 2.2, e.z, 8, ORANGE_BITS, 1.4);
        audio.cues.refill();
        if (me) { center(`${SIM.WALLETS[e.y].toUpperCase()}!`, 900); notice(`A free ${SIM.WALLETS[e.y]}! Throw it at a rival (${COARSE ? "Paint!" : "click or Y"}): it sticks on their back and they won't know · it goes off ${C.WALLET_FUSE} s after you throw it`, 3600); updateTools(); }
      } else if (e.type === "wthrow") { audio.cues.throw(me ? 1 : 0.4); if (me) updateTools(); }
      else if (e.type === "wbounce") audio.cues.crate(0.25);
      else if (e.type === "stuck") {
        // Only the thrower hears of it; the one wearing it doesn't.
        if (e.by === 0) {
          center("STUCK!", 900);
          notice(sim.actors[e.actor].gold && !sim.actors[0].gold ? `Stuck it on ${nameOf(e.actor)}! When it goes off, the Golden Dual AKs are yours` : `Stuck it on ${nameOf(e.actor)}! ${C.WALLET_FUSE} s…`, 2400);
          audio.cues.net(0.6);
        }
      }
      else if (e.type === "blast") {
        const n = e.by, k = Math.sqrt(Math.min(n, 8));
        fx.burst(e.x, e.y + 0.4, e.z, 26 * k, BLAST_BITS, 4.5 * k);
        fx.burst(e.x, e.y + 0.8, e.z, 14 * k, SMOKE_BITS, 2.2 * k);
        const d = Math.hypot(e.x - sim.actors[0].x, e.z - sim.actors[0].z);
        audio.cues.boom(clamp(1.2 - d / 30, 0.2, 1));
        if (n > 1 && d < 25) notice(`Chain reaction! ${n} wallets went off`, 1800);
      } else if (e.type === "rekt") {
        if (me) { center("REKT!", 1100); notice("Wallet blast! Knocked back and sooted", 1600); }
        say(e.actor, ["Rekt", "Not your keys!", "Trust me bro?"], 1.4);
      } else if (e.type === "laseron") {
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
          notice(COARSE ? "A gorilla has you! Tap Jump 5 times to wriggle free" : "A gorilla has you! Mash Space 5 times to wriggle free", 3000);
        } else say(e.actor, LINES.bonk, 1.3);
      } else if (e.type === "struggle") { if (me) notice(`Wriggle! ${sim.actors[0].grabHits} more`, 700); }
      else if (e.type === "breakfree") { fx.burst(e.x, e.y + 0.8, e.z, 10, STAR_BITS, 2); if (me) { center("FREE!", 800); notice("Run before it grabs you again!", 1500); } }
      else if (e.type === "letgo") { if (me) notice("The gorilla got bored and dropped you", 1500); }
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
        if (me) { closeQuiz(); notice("The bubble wore off. Run!", 2200); }
      } else if (e.type === "win") say(e.actor, LINES.win, 2.4);
    }
    sim.eventCount = 0;
  };

  // Space and the act button start a round from the board or the results; in play they fall through to the jump.
  const act = () => {
    if (phase === "board" || phase === "results") { start(); return true; }
    return false;
  };
  // Paint along the camera's look, lobbed a little higher when the camera looks up.
  // In first person the ball goes where the eye looks, less the lob the throw adds.
  const lookUp = () => clamp(-(cam.pitch - 0.28) * 1.6, -0.9, 0.9);
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
  // Lob the device over your head toward the crosshair.
  const throwWallet = () => {
    if (phase !== "play" || sim.actors[0].wallet < 0) return false;
    const a = sim.actors[0], q = aimPoint(), dx = q.x - a.x, dz = q.z - a.z;
    const flat = Math.hypot(dx, dz) || 1;
    return SIM.throwWallet(sim, 0, Math.atan2(dx, dz), clamp(Math.atan2(q.y - a.y - 1.9, flat) + 0.12, -0.3, 0.9));
  };
  const paint = () => {
    if (sim.actors[0].wallet >= 0) return throwWallet();
    // Laser eyes ready: whatever is in hand, the click lets them loose.
    { const me = sim.actors[0]; if (me.laser > 0 && me.beam <= 0 && !me.holding) return SIM.fire(sim, 0, cam.face, 0, "paint"); }
    const a = sim.actors[0], q = aimPoint(), oy = a.y + (a.crouch ? C.CROUCH_H - 0.25 : C.SHOT_Y);
    // With Lift chosen and empty hands, a click lifts the crate in front; holding a crate, a throw throws the crate.
    if (tool === "grab" && !a.holding) return grabCrate();
    if (a.holding) {
      const cdx = q.x - a.x, cdz = q.z - a.z, cflat = Math.hypot(cdx, cdz) || 1;
      const thrown = SIM.fire(sim, 0, Math.atan2(cdx, cdz), clamp(Math.atan2(q.y - a.y - 1.7, cflat) - 0.05, -0.6, 0.6), "crate");
      if (!thrown && a.splat > 0) notice(`Splatted · throwing again in ${Math.ceil(a.splat)} s`, 900);
      else if (thrown && tool !== "grab") notice(`Crate thrown · ${tool} ready`, 900);
      return thrown;
    }
    const dx = q.x - a.x, dz = q.z - a.z, flat = Math.hypot(dx, dz) || 1;
    const lob = tool === "grenade" ? 0.3 : tool === "rocket" || tool === "sniper" ? 0 : tool === "net" ? -0.12 : tool === "gold" || tool === "ak" ? -0.06 : -0.09;
    const pitch = clamp(Math.atan2(q.y - oy, flat) + lob, -0.9, 0.9);
    const ok = SIM.fire(sim, 0, Math.atan2(dx, dz), pitch, tool);
    // Say why a throw didn't go, so the tools never seem locked: paint on you, a quiz bubble, or an empty tool.
    if (!ok && a.splat > 0) notice(`Splatted · throwing again in ${Math.ceil(a.splat)} s`, 900);
    else if (!ok && a.trapped > 0) notice("Answer the question to get out first", 1100);
    else if (!ok && tool === "gold" && !a.gold) notice("Mine a block to win the Golden Dual AKs, or stick a wallet bomb on whoever has them", 1800);
    else if (!ok && tool === "sniper" && a.sniper <= 0) notice("The sniper rifle stays in the towers · climb one to use it", 1600);
    else if (!ok && tool !== "paint" && a[tool] <= 0) notice(`Out of ${tool}s · refill on your stand or an ammo cache`, 1400);
    return ok;
  };
  const scoped = () => tool === "sniper" && sim && sim.actors[0].sniper > 0 && cam.first;
  const zoomScope = (dir) => {
    scope.zoom = clamp(scope.zoom + dir, 0, ZOOMS.length - 1);
    notice(`Scope ${scope.zoom + 1}×`, 600);
  };
  const chooseTool = (k) => {
    tool = k;
    updateTools();
  };
  // The next tool along (or back), skipping any that are empty, then Lift for the crates; a right click or R steps
  // through them.
  const ORDER = ["paint", "ak", "grenade", "rocket", "net", "gold", "sniper", "grab"];
  const cycleTool = (dir = 1) => {
    const a = sim.actors[0];
    let i = ORDER.indexOf(tool);
    for (let n = 0; n < ORDER.length; n++) {
      i = (i + dir + ORDER.length) % ORDER.length;
      if (ORDER[i] === "paint" || ORDER[i] === "ak" || ORDER[i] === "grab" || a[ORDER[i]] > 0) break;
    }
    chooseTool(ORDER[i]);
    if (ORDER[i] === "grab") notice("Lift · click lifts a crate, click or Tab throws it, F sets it down", 1400);
    else if (ORDER[i] === "gold") notice("Golden Dual AKs", 900);
    else if (ORDER[i] === "ak") notice("Ooga AK · hold to fire on full auto", 900);
    else notice(`${ORDER[i][0].toUpperCase()}${ORDER[i].slice(1)}${ORDER[i] === "paint" || ORDER[i] === "sniper" ? "" : ` · ${a[ORDER[i]]} left`}`, 900);
  };
  const onRightDown = (e) => {
    if (e.button !== 2 || phase !== "play") return;
    e.preventDefault();
    cycleTool(1);
  };
  const noMenu = (e) => { if (phase === "play") e.preventDefault(); };
  const buildCrate = () => {
    if (phase !== "play") return false;
    if (SIM.build(sim, 0, cam.face)) {
      const n = sim.actors[0].crates;
      notice(`Crate down! ${n ? `${n} left` : "That was your last · your stand or a cache gives you more"}`, 1200);
      return true;
    }
    const a = sim.actors[0];
    const ownHalf = (a.team === "blue" ? a.z : -a.z) >= 2;
    notice(a.crates <= 0 ? "No crates left · your stand or an ammo cache gives you 3 more" : !a.grounded ? "Land first, then drop a crate" : !ownHalf ? "Crates only go down on your own half" : "No room there · face open ground and try again", 1600);
    return false;
  };
  const updateTools = () => {
    if (!sim || !el.tools) return;
    const a = sim.actors[0];
    for (const b of el.tools) {
      const k = b.dataset.tool;
      b.setAttribute("aria-pressed", String(k === tool));
      const n = b.querySelector("b");
      if (n) n.textContent = k === "paint" ? "∞" : k === "sniper" ? (a.sniper ? "∞" : "tower") : k === "gold" ? (a.gold ? "∞" : "—") : k === "ak" ? (a.akReload > 0 ? "…" : String(a.akMag)) : k === "crate" ? String(a.crates) : String(a[k]);
      if (k === "gold") b.disabled = !a.gold;
      if (k === "pass") b.disabled = !a.carrying && !a.holding;
      if (k === "zip") b.disabled = !SIM.nearZip(sim, a) && !SIM.nearCatapult(sim, a) && !SIM.nearVend(sim, a);
      if (k === "grab") b.setAttribute("aria-pressed", String(a.holding || tool === "grab"));
    }
  };
  const onArrow = (e) => {
    const down = e.type === "keydown" ? 1 : 0;
    if (e.key === "ArrowLeft") arrows.left = down;
    else if (e.key === "ArrowRight") arrows.right = down;
  };
  const onArrowBlur = () => { arrows.left = arrows.right = 0; };
  const saveView = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ mode: cam.island ? "island" : cam.first ? "first" : "chase", shuffle: cam.shuffle, zoom: cam.zoom, islandZoom: cam.islandZoom })); } catch { /* kept this visit */ } };
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
      : (COARSE ? "Chase camera" : `Chase camera · move the mouse to turn · V for first person${cam.shuffle ? "" : " · X to side-step with A D"}`), 3200);
  };
  const setView = (first) => setMode(first ? "first" : "chase");
  const cycleView = () => setMode(cam.island ? "chase" : cam.first ? "island" : "first");
  // Side-step: A and D step sideways while the Ooga keeps facing ahead; the mouse and the arrow keys turn.
  const setShuffle = (on) => {
    cam.shuffle = on;
    saveView();
    notice(on ? "Side-step ON · A D step sideways, facing ahead · mouse or ← → turns · X turns it off" : "Side-step OFF · A D turn again", 2600);
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
    cam.pitch = cam.first ? clamp(cam.pitch + e.movementY * 2.2e-3 * k, -0.3, 0.86) : clamp(cam.pitch + e.movementY * 2.2e-3, CAM.pitch[0], CAM.pitch[1]);
  };
  const lockMouse = () => {
    if (COARSE || locked() || !el.canvas.requestPointerLock) return;
    const lock = el.canvas.requestPointerLock();
    if (lock && lock.catch) lock.catch(() => { });
  };
  const onLockedDown = (e) => {
    audio.unlock();
    if (phase !== "play" || e.button !== 0 || quiz.open) return;
    trigger = true;
    paint();
    if (!cam.island) lockMouse();
  };
  // The trigger is held from the press until the button comes up anywhere; with the AK it fires on full auto.
  let trigger = false;
  const onTriggerUp = (e) => { if (e.button === 0 || e.type === "pointerup" || e.type === "pointercancel" || e.type === "blur") trigger = false; };
  // Tab passes in play, wherever the focus is: caught first, before the page's own key routing (which leaves Tab on a
  // focused button to the browser) and before the browser moves the focus.
  const onTabKey = (e) => {
    if (e.key !== "Tab" || phase !== "play" || quiz.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!e.repeat) passBlock();
  };
  // B places a crate. The page keeps B for itself outside debug (test bananas), so it is heard here directly.
  // Caught first, as Tab is: a menu control left focused (the Ooga picker, a button) would otherwise take the key, and
  // only a text field keeps it.
  const onBuildKey = (e) => {
    if ((e.key !== "b" && e.key !== "B" && e.code !== "KeyB") || phase !== "play" || quiz.open || e.metaKey || e.ctrlKey || e.altKey) return;
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
    if (k === "gold" && !a.gold) { notice("No Golden Dual AKs yet · mine a block to win them, or stick a wallet bomb on whoever has them", 1800); return; }
    if (k === "sniper" && !a.sniper) { notice("The sniper rifle stays up the towers · climb a ladder", 1600); return; }
    chooseTool(k);
    const max = SIM.TOOLS[k].max;
    notice(k === "gold" ? "Golden Dual AKs" : `${k[0].toUpperCase()}${k.slice(1)}${max ? (a[k] > 0 ? ` · ${a[k]} left` : " · empty · refill on your stand or an ammo cache") : ""}`, 900);
  };
  const onCrouchKey = (e) => { if (e.key === "c" || e.key === "C") move.crouch = e.type === "keydown" ? 1 : 0; };
  // Pick up the crate in front, or set the held one down (stacking it on a crate there).
  const grabCrate = () => {
    if (phase !== "play") return false;
    if (SIM.grab(sim, 0, cam.face)) return true;
    const a = sim.actors[0];
    notice(a.holding ? "No room to set it there (stacks go three high)" : a.carrying ? "Hands full with the block" : "No crate in reach · face one and press F", 1200);
    return false;
  };
  // Throw whatever is in hand: a held crate toward the crosshair, or the carried block straight ahead for a teammate
  // to catch.
  const passBlock = () => {
    if (phase !== "play") return false;
    if (sim.actors[0].holding) return paint();
    if (SIM.pass(sim, 0, cam.face)) return true;
    notice("Nothing to throw · pick up a block, or a crate with F", 1100);
    return false;
  };
  // Ride your tower's zipline down into the rival fort, from the platform by its gap.
  const zipNow = () => {
    if (phase !== "play") return false;
    if (SIM.takeWallet(sim, 0)) return true;
    if (SIM.launch(sim, 0)) return true;
    if (SIM.zip(sim, 0, cam.face)) return true;
    const a = sim.actors[0];
    if (cam.island) return false;
    notice(sim.prep > 0 ? "The zipline opens when the round starts" : a.holding ? "Put the crate down first (F)" : "Climb a sniper tower's ladder and stand by the cable to ride", 1600);
    return false;
  };
  const dropBlock = () => {
    if (phase !== "play") return false;
    if (SIM.drop(sim, 0)) return true;
    // No block in hand: G sets a held wallet down, ticking.
    if (SIM.dropWallet(sim, 0)) { notice(`Wallet set down · it goes off in ${C.WALLET_FUSE} s · get clear!`, 1800); return true; }
    notice("Nothing to drop", 900);
    return false;
  };

  // Steering, as Mario 64 has it: A and D (the stick's sideways push, and Q E) turn the Ooga, W and S run it forward
  // and back along where it faces, and the chase camera swings round behind it by itself (`updateCamera`), so the
  // world turns, not the Ooga on screen. A locked mouse turns it too.
  const TURN = 2.7;
  const readInput = (dt) => {
    const a = controls.read(), turnKeys = arrows.left - arrows.right;
    if (cam.island) {
      // Island view: the camera swings on Q E and the arrows; the stick or W A S D run the way the screen faces, and
      // the Ooga turns to face where it runs.
      const side = clamp(a.x + turnKeys, -1, 1);
      cam.orbit = wrap(cam.orbit + (a.yaw + turnKeys) * TURN * 0.8 * dt);
      const ox = Math.sin(cam.orbit), oz = Math.cos(cam.orbit), rx = -Math.cos(cam.orbit), rz = Math.sin(cam.orbit);
      let mx = ox * a.y + rx * side, mz = oz * a.y + rz * side;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      move.x = mx; move.z = mz;
      if (l > 0.15) cam.face = Math.atan2(mx, mz);
    } else if (cam.shuffle) {
      // Side-step: A and D (not the arrows) step sideways, facing ahead; the mouse, Q E and the arrows turn.
      cam.face = wrap(cam.face + (a.yaw + turnKeys) * TURN * dt);
      const side = clamp(a.x + turnKeys, -1, 1), f = clamp(a.y, -1, 1);
      const fx2 = Math.sin(cam.face), fz = Math.cos(cam.face), rx = -Math.cos(cam.face), rz = Math.sin(cam.face);
      let mx = fx2 * f + rx * side, mz = fz * f + rz * side;
      const l = Math.hypot(mx, mz);
      if (l > 1) { mx /= l; mz /= l; }
      move.x = mx; move.z = mz;
    } else {
      cam.face = wrap(cam.face + (a.yaw - a.x) * TURN * dt);
      const fx2 = Math.sin(cam.face), fz = Math.cos(cam.face), f = clamp(a.y, -1, 1);
      move.x = fx2 * f;
      move.z = fz * f;
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
        p.step += step * 9;
      } else p.heading = h;
      const ground = SIM.groundAt(p.x, p.z, s.y + 0.1, 0.15);
      p.y = damp(p.y, ground, 18, dt);
      const moving = d > 0.15;
      setVec(p.node.position, p.x, p.y + (moving ? Math.abs(Math.sin(p.step)) * 0.08 : 0), p.z);
      p.node.rotation.y = p.heading;
      p.node.rotation.z = moving ? Math.sin(p.step) * 0.08 : 0;
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
      a.body.scale.y = s.crouch ? 0.66 : 1;
      a.body.rotation.y = damp(a.body.rotation.y, a.body.rotation.y + wrap(s.heading - a.body.rotation.y), 14, dt);
      a.ring.visible = s.grounded;
      a.bubble.visible = s.trapped > 0;
      a.netted.visible = s.netted > 0;
      a.held.visible = s.holding && !(i === 0 && cam.first);
      if (s.holding) a.held.geometry = BM.crate(TEAM_INDEX[s.team]);
      a.trolley.visible = s.riding;
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
      // The gun in hand: the visitor's chosen tool, a bot's last throw; none while carrying, lifting or riding.
      const g = GUN_OF[i === 0 ? tool : s.lastKind || "paint"];
      const armed = phase === "play" && g >= 0 && !s.carrying && !s.holding && !s.riding && !s.climbing && !s.flight && s.splat <= 0 && s.trapped <= 0 && s.burnt <= 0 && s.slip <= 0;
      if (a.gun) {
        a.gun.visible = armed;
        if (armed) a.gun.geometry = BM.gun(g * 2 + TEAM_INDEX[s.team]);
      }
      if (a.gunL) {
        a.gunL.visible = armed && g === GUN_OF.gold;
        if (a.gunL.visible) a.gunL.geometry = a.gun.geometry;
      }
      // A crate to the head shows stars, not paint.
      a.blob.visible = s.splat > 0 && !s.bonked;
      if (s.trapped > 0) a.bubble.rotation.y = elapsed * 0.8;
      if (!a.cave) continue;
      const p = a.cave.parts;
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
        // Held up by a gorilla: kicking and flailing.
        const w = Math.sin(elapsed * 16 + i);
        p.armL.rotation.x = -2.6 + w * 0.6; p.armR.rotation.x = -2.6 - w * 0.6;
        p.legL.rotation.x = -0.7 * w; p.legR.rotation.x = 0.7 * w;
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
      if (s.riding || s.climbing || s.flight === 2) {
        // Hanging from the trolley, or hand over hand up a ladder.
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
      if (s.carrying || s.holding) {
        // Both hands up holding the block (or a crate) overhead.
        p.armL.rotation.x = p.armR.rotation.x = -2.9;
      } else if (s.wallet >= 0) {
        // A wallet up in the left hand; the right keeps the gun.
        p.armL.rotation.x = -2.5;
        p.armR.rotation.x = armed ? -1.45 : -0.2 - swing * 0.35;
      } else if (armed) {
        // Gun up and forward, the other hand under it; a big launcher sits higher, on the shoulder.
        const kick = s.cooldown > (s.bot ? sim.bots.cool : SIM.TOOLS.paint.cool) - 0.12 ? 0.18 : 0;
        p.armR.rotation.x = (g === 2 ? -1.75 : -1.45) - kick;
        p.armL.rotation.x = g === 2 ? -1.9 : -1.25;
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
  // The sky follows the weather: a storm darkens the light and thickens the cloud, rain falls slanted by the wind
  // round the camera, and now and then lightning flashes.
  const poseWeather = (dt) => {
    const w = sim.weather, storm = w.kind === "storm" ? Math.min(1, w.strength / C.WIND.storm) : 0;
    RENDER_OPTS.clouds = 0.35 + 0.55 * storm;
    RENDER_OPTS.directStrength *= 1 - 0.55 * storm;
    RENDER_OPTS.sunStrength *= 1 - 0.55 * storm;
    flashT -= dt;
    if (storm > 0.6 && flashT <= 0 && Math.random() < dt * 0.25) { flash = 1; flashT = 3; audio.cues.thunder(); }
    flash = Math.max(0, flash - dt * 5);
    RENDER_OPTS.ambientFloor = 0.22 + flash * 0.8;
    RENDER_OPTS.bloomStrength = 0.6 + flash * 1.2;
    const cx = camera.position.x, cz = camera.position.z, lean = 0.12;
    for (let i = 0; i < RAIN; i++) {
      const r = rain[i];
      r.node.visible = storm > 0.2 && i < RAIN * storm;
      if (!r.node.visible) continue;
      r.y -= dt * 14;
      r.x += w.x * dt * 0.8; r.z += w.z * dt * 0.8;
      if (r.y < 0 || Math.abs(r.x - cx) > 12 || Math.abs(r.z - cz) > 12) {
        r.x = cx + (Math.random() - 0.5) * 22; r.z = cz + (Math.random() - 0.5) * 22; r.y = 6 + Math.random() * 6;
      }
      setVec(r.node.position, r.x, r.y, r.z);
      r.node.rotation.x = w.z * lean; r.node.rotation.z = -w.x * lean;
    }
    // The wind sign: its strength, and an arrow turned to show where it blows relative to the camera.
    const key = `${w.kind}${Math.round(w.strength * 2)}${Math.round(wrap(Math.atan2(w.x, w.z) - cam.yaw) * 4)}`;
    if (key !== el.windKey) {
      el.windKey = key;
      el.windWord.textContent = WEATHER_WORDS[w.kind];
      el.windArrow.style.transform = `rotate(${(-wrap(Math.atan2(w.x, w.z) - cam.yaw)).toFixed(2)}rad)`;
      el.windArrow.style.opacity = String(Math.min(1, 0.25 + w.strength / C.WIND.storm));
    }
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
    // A catapult's arm whips over when it throws, then winds back down.
    for (const c of catapults) {
      const t = elapsed - c.at, up = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.4);
      c.arm.rotation.x = -0.25 + up * 1.9;
    }
    const onPad = phase === "play" && SIM.nearCatapult(sim, sim.actors[0]);
    if (onPad !== catNear) {
      catNear = onPad;
      updateTools();
      if (onPad) notice(`${COARSE ? "Ride" : "E"} fires the catapult · parachute into their fort`, 2400);
    }
    // The zipline button wakes as the visitor reaches the cable, with a word the first time.
    const near = phase === "play" && !!SIM.nearZip(sim, sim.actors[0]);
    if (near !== zipNear) {
      zipNear = near;
      updateTools();
      if (near) {
        const home = SIM.nearZip(sim, sim.actors[0]) !== sim.team;
        notice(`${COARSE ? "Zip" : "E"} rides the zipline ${home ? "home to our fort" : "into their fort"}`, 2200);
      }
    }
  };
  // The wallets: over a head, in the air turning, or lying where they stopped; the fuse light blinks once a second,
  // then three times, then all but steady, with a beep each blink near the visitor, louder and higher as it runs out.
  let walletHeld = 0;
  const poseWallets = (elapsed) => {
    if (!walletNodes) return;
    const me = sim.actors[0];
    // Holding one a while: a reminder of how to be rid of it.
    if (me.wallet >= 0 && phase === "play") {
      if (!walletHeld) walletHeld = elapsed;
      else if (elapsed - walletHeld > 12) { walletHeld = elapsed; notice(COARSE ? "Still holding a wallet · Paint! throws it · Drop sets it down" : "Still holding a wallet · click or Y throws it · G sets it down", 2600); }
    } else walletHeld = 0;
    for (let i = 0; i < walletNodes.length; i++) {
      const w = sim.wallets[i], n = walletNodes[i];
      // Stuck on the visitor's own back, it stays a secret: not shown, not heard.
      const secret = w.live && w.state === 3 && w.stuck === 0;
      n.node.visible = w.live && !secret;
      if (!w.live || secret) { n.sec = -1; continue; }
      n.node.geometry = BM.walletDevice(w.look);
      setVec(n.node.position, w.x, w.y + (w.state === 2 ? 0.25 : 0), w.z);
      n.node.rotation.y = w.state === 1 ? w.spin : w.state === 0 ? sim.actors[w.owner].heading : w.state === 3 ? sim.actors[w.stuck].heading + Math.PI : 0.6 * i;
      n.node.rotation.x = w.state === 1 ? w.spin * 0.7 : 0;
      // Held, it's not ticking yet: the light stays dark.
      if (w.state === 0) { n.light.visible = false; n.sec = -1; continue; }
      const rate = w.fuse > 3 ? 1 : w.fuse > 1.5 ? 3 : 8, on = (elapsed * rate) % 1 < 0.5;
      n.light.visible = on;
      const sec = Math.ceil(w.fuse * rate);
      if (sec !== n.sec) {
        n.sec = sec;
        const d = Math.hypot(w.x - me.x, w.z - me.z);
        if (d < 16) audio.cues.beep(clamp(1 - d / 16, 0.15, 1) * (w.fuse > 3 ? 0.5 : w.fuse > 1.5 ? 0.75 : 1), w.fuse > 3 ? 0 : w.fuse > 1.5 ? 1 : 2);
        // One the visitor stuck on someone: the countdown in the notice line.
        if (w.state === 3 && w.owner === 0 && rate === 1) notice(`${SIM.WALLETS[w.look]} on ${nameOf(w.stuck)} · ${Math.ceil(w.fuse)} s`, 1100);
      }
    }
    // A sooted Ooga puffs smoke now and then.
    for (const a of sim.actors) if (a.soot > 0 && Math.random() < 0.08) fx.burst(a.x, a.y + 1.4, a.z, 2, SMOKE_BITS, 0.8);
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
      const k = homer ? 0.55 : 1;
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
      const eye = y + (me.crouch ? 0.9 : 1.55), up = lookUp(), c = Math.cos(up);
      cam.close = false;
      setVec(camera.position, x + Math.sin(cam.yaw) * 0.25, eye, z + Math.cos(cam.yaw) * 0.25);
      setVec(camera.target, x + Math.sin(cam.yaw) * c * 10, eye + Math.sin(up) * 10, z + Math.cos(cam.yaw) * c * 10);
      // The sniper's scope narrows the view; the gun in hand sits low and right of the eye.
      const scopedNow = tool === "sniper" && me.sniper > 0;
      camera.fov = damp(camera.fov, (scopedNow ? ZOOMS[scope.zoom] : 58) * Math.PI / 180, 10, dt);
      const g = GUN_OF[tool], showGun = g >= 0 && !scopedNow && !me.carrying && !me.holding && !me.riding && !me.climbing && me.splat <= 0 && me.trapped <= 0;
      fpGun.visible = showGun;
      if (showGun) {
        fpGun.geometry = BM.gun(g * 2 + TEAM_INDEX[me.team]);
        const fx2 = Math.sin(cam.yaw) * c, fz2 = Math.cos(cam.yaw) * c, fy2 = Math.sin(up), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
        setVec(fpGun.position, camera.position.x + fx2 * 0.55 + rx * 0.24, eye + fy2 * 0.55 - (g === 2 ? 0.12 : 0.22), camera.position.z + fz2 * 0.55 + rz * 0.24);
        fpGun.rotation.y = cam.yaw;
        fpGun.rotation.x = -up;
      }
      // With the golden pair, the second AK sits low and left.
      fpGunL.visible = showGun && tool === "gold";
      if (fpGunL.visible) {
        fpGunL.geometry = fpGun.geometry;
        const rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
        setVec(fpGunL.position, fpGun.position.x - rx * 0.48, fpGun.position.y, fpGun.position.z - rz * 0.48);
        fpGunL.rotation.y = cam.yaw;
        fpGunL.rotation.x = -up;
      }
      setVec(RENDER_OPTS.shadowCenter, x, 0, z);
      return;
    }
    camera.fov = damp(camera.fov, 58 * Math.PI / 180, 10, dt);
    if (fpGun) fpGun.visible = fpGunL.visible = false;
    // The eye comes in front of any wall between it and the Ooga, so a fort's back wall never fills the view. Backed up
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
  const clearBehind = (x, y, z, pitch) => {
    const c = Math.cos(pitch);
    EYE.x = -Math.sin(cam.yaw) * c; EYE.z = -Math.cos(cam.yaw) * c; EYE.y = Math.sin(pitch);
    const far = cam.island ? ISLAND.dist * cam.islandZoom : CAM.dist * cam.zoom;
    for (let d = 0.5; d <= far; d += 0.25) if (SIM.solidAt(x + EYE.x * d, y + EYE.y * d, z + EYE.z * d)) return Math.max(0.6, d - 0.4);
    return far;
  };
  // The board shows the whole fort from above its gate, slowly turning.
  // On a wide screen the board sits on the left and the chosen Ooga stands on the right inside its fort's gate,
  // turning slowly all the way round (a drag turns it faster); on a narrow one the board fills the screen and the
  // view circles the fort.
  const preview = { spin: 0, wide: false };
  const PREVIEW_MIN_W = 760;
  const boardView = (elapsed, dt) => {
    const t = selection.team, s = SIM.ARENA.stands[t], sign = t === "blue" ? 1 : -1;
    camera.fov = 58 * Math.PI / 180;
    if (fpGun) fpGun.visible = fpGunL.visible = false;
    preview.wide = window.innerWidth >= PREVIEW_MIN_W;
    el.previewName.hidden = !preview.wide;
    // The Ooga picker sits under the Ooga on show when there is one, else in the board.
    const home = preview.wide ? el.previewPick : el.oogaSlot;
    if (el.oogaPick.parentNode !== home) {
      home.append(el.oogaPick);
      el.oogaHead.hidden = preview.wide;
    }
    if (!preview.wide) {
      const a = elapsed * 0.12;
      setVec(camera.position, s.x + Math.sin(a) * 16, 11, s.z * 0.55 + Math.cos(a) * 16);
      setVec(camera.target, s.x, 1, s.z * 0.8);
      return;
    }
    // The visitor's Ooga on its showcase spot, a step inside the gate, turning.
    const show = SIM.ARENA.showcase ? SIM.ARENA.showcase[t] : null;
    const me = sim.actors[0], x = show ? show.x : s.x, z = show ? show.z : s.z - sign * 2.5;
    preview.spin = wrap(preview.spin + dt * 0.7);
    me.x = x; me.z = z; me.y = 0; me.grounded = true; me.moving = 0;
    me.carrying = null; me.holding = false; me.splat = me.trapped = me.burnt = me.slip = 0;
    me.heading = preview.spin;
    // The camera out past the gate at chest height, looking a little to the Ooga's left so it stands right of the board.
    setVec(camera.position, x, 1.45, z - sign * 3.7);
    setVec(camera.target, x + sign * 1.25, 1.0, z);
  };

  const update = (dt, elapsed) => {
    sceneTime = elapsed;
    daylight.sample(clock.read(), RENDER_OPTS, clock.dayOfYear, daylight.ISLAND_LATITUDE_DEG, clock.continuousDay, clock.utcMs);
    RENDER_OPTS.time = elapsed;
    if (phase === "play") {
      readInput(dt);
      // Full auto: with the AK or the golden pair and the trigger held, a round goes each time the shot clock allows.
      if (trigger && (tool === "ak" || (tool === "gold" && sim.actors[0].gold)) && !quiz.open && sim.actors[0].cooldown <= 0) paint();
      // The live feed, folded in before the step: fees to weather, a new block to its reset.
      SIM.setLive(sim, feeWeather(live.fee));
      if (live.block) { SIM.newBlock(sim, live.block); live.block = 0; }
      const prepWas = sim.prep;
      SIM.step(sim, dt, move);
      if (sim.prep > 0 && Math.ceil(sim.prep) !== Math.ceil(prepWas)) {
        center(`BUILD ${Math.ceil(sim.prep)}`, 0);
        if (sim.prep <= 3) audio.cues.count();
      }
      readEvents();
      updateStrip();
      if (sim.over) finish();
    } else controls.read();
    poseActors(dt, elapsed);
    poseBlocks(elapsed);
    poseCrates();
    poseCompanions(dt, elapsed);
    poseStamina();
    posePads(elapsed);
    poseFire(elapsed);
    poseGorillas(dt, elapsed);
    poseGhosts(elapsed);
    if (sim && actors) poseBeams(elapsed);
    poseShots();
    poseWallets(elapsed);
    if (phase === "board") boardView(elapsed, dt);
    else updateCamera(dt);
    poseWeather(dt);
    if (phase === "play") drawMap(dt, elapsed);
    if (sim) {
      // The held sounds: the wind's strength, rain in a storm, and the whir while the visitor rides a zipline.
      audio.state.wind = phase === "play" ? sim.weather.strength / C.WIND.storm : 0;
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
    audio.unlock();
    if (e.key === "Escape") {
      if (phase === "play" && locked()) document.exitPointerLock();
      else if (phase === "play" && (cam.first || cam.island)) setMode("chase");
      else if (phase === "play" || phase === "results") showBoard();
      else go(home);
      return;
    }
    if (e.key === "Enter" && phase !== "play") start();
    else if (e.key === "Enter" && !e.repeat && !quiz.open) paint();
    if (phase !== "play" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (quiz.open) {
      if (e.key >= "1" && e.key <= "4") answer(Number(e.key) - 1);
      return;
    }
    if (TOOL_KEYS[e.key]) keyTool(TOOL_KEYS[e.key]);
    if (e.key === "t" || e.key === "T") passBlock();
    if (e.key === "y" || e.key === "Y") throwWallet();
    if (e.key === "r" || e.key === "R") cycleTool(1);
    if (e.key === "f" || e.key === "F") grabCrate();
    if (e.key === "g" || e.key === "G") dropBlock();
    if (e.key === "e" || e.key === "E") zipNow();
    if ((e.key === "+" || e.key === "=") && scoped()) zoomScope(1);
    if ((e.key === "-" || e.key === "_") && scoped()) zoomScope(-1);
    if (e.key === "v" || e.key === "V") cycleView();
    if (e.key === "x" || e.key === "X") setShuffle(!cam.shuffle);
    if (e.key === "0") cam.pitch = 0.28;
  };
  const chooseTarget = (n) => {
    selection.target = n;
    for (const b of el.targets) b.setAttribute("aria-pressed", String(Number(b.dataset.target) === n));
    el.boardHelp.textContent = `Pick a side. Steal the rivals' Bitcoin block (their colour), carry it to your own stand while your block is home. First to ${n} capture${n === 1 ? "" : "s"} wins.`;
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
  const chooseMap = (id) => {
    for (const b of el.maps) b.setAttribute("aria-pressed", String(b.dataset.map === id));
    if (id === selection.map && sim && sim.map === id) return;
    selection.map = id;
    savePicks();
    if (!sim) return;
    recast();
    buildMap();
    mapBase = null;
  };
  // Everything that belongs to the map, under one node so a new map replaces it whole: the ground and buildings, the
  // quiz pads, power-up spots, trampolines, ammo caches, and the campfire with its three dancing potato Oogas.
  const buildMap = () => {
    if (mapRoot) {
      removeChild(root, mapRoot);
      const i = placed.indexOf(mapRoot);
      if (i >= 0) placed.splice(i, 1);
    }
    const A = SIM.ARENAS[selection.map];
    mapRoot = place(createNode());
    const add = (node) => { addChild(mapRoot, node); return node; };
    add(createNode({ geometry: BM.arena(SIM.MAPS.indexOf(selection.map)) }));
    // The stands, and the sniper towers' ladders and rifle racks and the ziplines, where this map has them.
    const mapIndex = SIM.MAPS.indexOf(selection.map);
    for (const t of SIM.TEAMS) {
      const st = A.stands[t], l = A.ladders[t], [x0, x1, z0, z1] = A.towers[t], i = TEAM_INDEX[t];
      add(createNode({ geometry: BM.stand(i), position: { x: st.x, y: 0, z: st.z } }));
      add(createNode({ geometry: BM.ladder(), position: { x: l.dx < 0 ? x1 + 0.05 : x0 - 0.05, y: 0, z: (l.zone[2] + l.zone[3]) / 2 } }));
      add(createNode({ geometry: BM.rack(i), position: { x: l.dx < 0 ? x0 + 0.7 : x1 - 0.7, y: C.TOWER_TOP, z: (z0 + z1) / 2 }, rotation: { x: 0, y: Math.PI / 2, z: 0 } }));
      add(createNode({ geometry: BM.zipline(mapIndex * 2 + i) }));
    }
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
    // The FREE WALLETS machines, facing the middle of the field.
    vendNodes = A.vends.map(([x, z]) => add(createNode({ geometry: BM.vend(), position: { x, y: 0, z }, rotation: { x: 0, y: x < 0 ? Math.PI / 2 : -Math.PI / 2, z: 0 } })));
    // Gorilla Jungle: the cargo nets up to the tree forts, and the gorillas themselves.
    for (const n of A.nets || []) {
      const [x0, x1, z0, z1] = n.zone, w = n.dx ? z1 - z0 : x1 - x0;
      const key = `${Math.round(Math.max(w, 1.2) * 10)}:${Math.round(n.top * 10)}`;
      add(createNode({ geometry: BM.net2(key), position: { x: (x0 + x1) / 2, y: 0, z: (z0 + z1) / 2 }, rotation: { x: 0.08, y: n.dx ? Math.PI / 2 : 0, z: 0 } }));
    }
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
  const GORILLA_SCALE = 1.35;
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
      const stunned = g.state === 4, wob = stunned ? Math.sin(elapsed * 14) * 0.25 : 0;
      rig.poseManaged(dt, g.x, 0, g.z, g.heading + wob, stunned ? 0 : Math.hypot(g.vx, g.vz), false);
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
    el.previewName.firstChild.textContent = n ? contributors.traitsFor(n).display || n : "";
  };

  const enter = (ctx) => {
    ({ renderer, game, world, go } = ctx);
    home = ctx.from === "arcade" ? "arcade" : "hub";
    hudMod.leaveTo("block", home);
    camera = createCamera({ fov: 58, near: 0.3, far: 400 });
    audio = BL.blockAudio.create();
    live.fee = BL.mempool.state.nextFee || 0;
    live.block = 0;
    unfeed = BL.mempool.subscribe(onFeed);
    root = createNode();
    clock = daylight.createClock({ hour: hourParam, day: dayParam, now: new Date() });
    hud = hudMod.create({ roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled: false });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    fx = fxMod.create({ root, renderer, camera, hud, overlay: ctx.overlay, tickerAt: { x: 0, y: 8, z: 0 } });
    for (const id of ["board", "results", "strip", "center", "notice", "best", "record", "score-blue", "score-red", "own", "theirs", "time", "drop", "summary", "stats", "result-title", "quiz", "quiz-q", "quiz-note", "quiz-fill"]) {
      el[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(`block-${id}`);
    }
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
    el.onTarget = (e) => { chooseTarget(Number(e.currentTarget.dataset.target)); e.currentTarget.blur(); };
    for (const b of el.targets) b.addEventListener("click", el.onTarget);
    chooseTarget(selection.target);
    el.paintBtn = document.getElementById("block-paint");
    el.toolBar = document.getElementById("block-tools");
    el.passBtn = document.querySelector('#block-tools [data-tool="pass"]');
    el.tools = [...el.toolBar.querySelectorAll("[data-tool]")];
    el.onTool = (e) => { const k = e.currentTarget.dataset.tool; e.currentTarget.blur(); if (k === "crate") buildCrate(); else if (k === "grab") grabCrate(); else if (k === "pass") passBlock(); else if (k === "zip") zipNow(); else chooseTool(k); };
    for (const b of el.tools) b.addEventListener("click", el.onTool);
    el.stamina = document.getElementById("block-stamina");
    el.fuel = document.getElementById("block-fuel");
    el.fuelK = -1;
    el.previewName = document.getElementById("block-preview-name");
    el.previewPick = document.getElementById("block-preview-pick");
    el.oogaSlot = document.getElementById("block-ooga-slot");
    el.oogaHead = el.oogaSlot.querySelector("h3");
    el.previewName.hidden = true;
    el.map = document.getElementById("block-map");
    el.mapCtx = el.map.getContext("2d");
    el.feed = document.getElementById("block-feed");
    el.feedItems = [...el.feed.children];
    mapBase = null;
    el.power = document.getElementById("block-power");
    el.powerWord = document.getElementById("block-power-word");
    el.staminaK = -1;
    el.windWord = document.getElementById("block-wind-word");
    el.windArrow = document.getElementById("block-wind-arrow");
    el.windKey = "";
    el.cross = document.getElementById("block-cross");
    el.viewBtn = document.getElementById("block-view-btn");
    el.soundBtn = document.getElementById("block-sound-btn");
    el.soundBtn.setAttribute("aria-pressed", String(!audio.muted));
    el.canvas = ctx.canvas;
    document.addEventListener("mousemove", onLockedMove);
    window.addEventListener("keydown", onArrow);
    window.addEventListener("keyup", onArrow);
    window.addEventListener("blur", onArrowBlur);
    // The view and side-step picked last time.
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
      if (v) {
        cam.shuffle = !!v.shuffle; cam.island = v.mode === "island"; cam.first = v.mode === "first";
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
    el.onPaint = (e) => { e.preventDefault(); if (phase === "play") { trigger = true; paint(); } };
    window.addEventListener("mouseup", onTriggerUp);
    window.addEventListener("pointerup", onTriggerUp);
    window.addEventListener("pointercancel", onTriggerUp);
    window.addEventListener("blur", onTriggerUp);
    el.paintBtn.addEventListener("pointerdown", el.onPaint);
    el.oogaPick = document.getElementById("block-ooga");
    el.onOoga = () => { chooseOoga(el.oogaPick.value); el.oogaPick.blur(); };
    el.oogaPick.addEventListener("change", el.onOoga);
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
    fpGun = place(createNode({ geometry: BM.gun(0), visible: false }));
    fpGunL = place(createNode({ geometry: BM.gun(0), visible: false }));
    walletNodes = [];
    for (let i = 0; i < C.WALLET_CAP; i++) {
      const node = place(createNode({ geometry: BM.walletDevice(0), visible: false, scale: { x: 1.6, y: 1.6, z: 1.6 } }));
      const light = createNode({ geometry: BM.walletLight(), position: { x: 0, y: 0.2, z: 0 } });
      addChild(node, light);
      walletNodes.push({ node, light, sec: -1 });
    }
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
    buildActors(castNames());
    for (let i = 0; i < actors.length; i++) sim.actors[i].name = actors[i].name;
    paintTeams();
    nameShowcase();
    // The board's Ooga picker: the roster by the name shown, held to their own Ooga for a signed-in visitor.
    el.oogaPick.textContent = "";
    // In alphabetical order by the name shown, so anyone can find theirs in a long roster.
    const names = contributors.activeRoster.map((c) => [c.name, contributors.traitsFor(c.name).display || c.name]);
    names.sort((p, q) => p[1].localeCompare(q[1], undefined, { sensitivity: "base" }));
    for (const [name, shown] of names) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = shown;
      el.oogaPick.append(o);
    }
    el.oogaPick.value = actors[0].name || "";
    el.oogaPick.disabled = !!BL.net.ownAmong(contributors.activeRoster);
    controls = controlsMod.create({ move: document.getElementById("joy-move"), look: document.getElementById("joy-look"), boost: hud.el.act, onAction: act, pressActions: true });
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
        if (phase === "board") { preview.spin = wrap(preview.spin + dx * 8e-3); return; }
        if (phase !== "play") return;
        cam.face = wrap(cam.face - dx * 5e-3);
        cam.pitch = clamp(cam.pitch + dy * 3.5e-3, CAM.pitch[0], CAM.pitch[1]);
      },
      // The wheel or a two-finger swipe zooms the sniper's scope, and otherwise the camera.
      onZoom: (k, gesture) => {
        if (phase !== "play" || k === 1) return;
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
      if (action === "block-start" || action === "block-again") start();
      else if (action === "block-board") showBoard();
      else if (action === "block-drop") dropBlock();
      else if (action === "block-view") cycleView();
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
    hud.el.sheet.dataset.open = "false";
    el.help = document.getElementById("block-help");
    el.help.textContent = COARSE ? "Left stick runs · right stick turns · Jump twice to climb · Paint! throws the tool you pick · View for first person" : "W S run · A D turn · Shift sprints · Space jumps, twice to climb · click fires · R or right click switches weapon · V changes view (chase, first person, Island) · two-finger swipe or the wheel zooms · X side-step (A D step sideways) · 5 sniper (from a tower) · 6 Golden Dual AKs (hold to fire) · 7 AK (hold to fire) · hold Space in the air for the jetpack · mash Space to escape a gorilla · E at a FREE WALLETS machine takes one, click or Y throws it: it sticks to a rival, who won't know, and goes off 5 s later · W into a ladder climbs · E zipline or catapult · Tab throws what you hold · F lifts crates · B new crate · C crouch";
    showBoard();
    stateTimer = window.setInterval(() => fx.trimPool(), 6e4);
    hintTimer = window.setTimeout(() => hud.hint(COARSE ? "Pick a side, then Play!" : "Pick a side, then Play! (Enter)"), 1200);
    Object.assign(blockScene, {
      root, camera, input,
      debug: {
        hud, camera, controls, cavemen: null, crates: null,
        block: {
          get phase() { return phase; },
          get sim() { return sim; },
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
    audio.dispose();
    audio = null;
    unfeed();
    unfeed = null;
    window.clearInterval(stateTimer);
    window.clearTimeout(hintTimer);
    window.clearTimeout(centerTimer);
    window.clearTimeout(noticeTimer);
    for (const b of el.teams) b.removeEventListener("click", el.onTeam);
    for (const b of el.targets) b.removeEventListener("click", el.onTarget);
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
    el.oogaPick.removeEventListener("change", el.onOoga);
    el.paintBtn.hidden = true;
    for (const b of el.answers) b.removeEventListener("click", onAnswer);
    closeQuiz();
    disposeActors();
    disposeGorillas();
    fx.dispose();
    controls.dispose();
    hud.el.act.hidden = true;
    hud.setAct("Ooga!");
    for (const node of placed) removeChild(root, node);
    placed.length = 0;
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    phase = "board";
    sim = blocks = shots = splats = ticks = pads = crates = rain = caches = fpGun = fpGunL = trampNodes = powerNodes = result = null;
    mapRoot = fireNode = dancers = peelNodes = catapults = null;
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
    for (let i = 0; i < 2; i++) set.add(BM.ball(i)).add(BM.ring(i));
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), phase };
  };
  Object.assign(blockScene, { enter, update, overlay, onDonation, onKey, leave, stats, liveGeometry, onLootCleared: () => { } });
  BL.scenes = BL.scenes || {};
  BL.scenes.block = blockScene;
})();
