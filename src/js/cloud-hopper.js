// The dock's travelling arcade cloud and its solo descent. The hub owns island physics and visibility.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const RADIUS = 4.5, DEPTH = 2.5;
  // The ride up takes LIFT_SECONDS, turning the view to the island over its first LIFT_VIEW_SECONDS; at the top the
  // ride's framing eases into the player's own view over SETTLE_SECONDS.
  const LIFT_SECONDS = 6, LIFT_VIEW_SECONDS = 1.5, SETTLE_SECONDS = 1, DOCK_LENGTH = 4;
  const START_VIEW = { height: 6, distance: 18 };
  const BOOST_SPEED = 28, BOOST_RISE = 4, BOUNCE_RISE = 12, LAUNCH_CLEARANCE = 0.04;
  const RECOVERY_GRACE_SECONDS = 0.75, DOCK_MUSIC_LEVEL = 0.28, WARNING_THIN = 0.32, TAU = Math.PI * 2;
  // Power-ups (plan 3): X-ray's seconds and how far it reads clouds (further in a hazy level), and the sky feather's lift.
  // A guide card introduces each, bounce clouds and tornadoes the first time a browser session plays a level that has it.
  const XRAY_SECONDS = 30, XRAY_RADIUS = 60, XRAY_HAZE_RADIUS = 120, UPDRAFT_RISE = 13;
  // The grappling hook: how far it reaches from the Ooga's chest, how fast it flies out and reels back, how fast it
  // pulls, how near the bite it lets go by itself, and the longest pull.
  const HOOK_RANGE = 40, HOOK_FLY = 90, HOOK_REEL = 70, HOOK_PULL = 18, HOOK_ARRIVE = 1, HOOK_PULL_SECONDS = 4;
  const INTRODUCED = ["bounce", "gust", "tornado", "xray", "updraft", "hook"], GUIDE_KEY = "ooga-cloud-hopper-guide-v1", ITEMS_KEY = "ooga-cloud-hopper-items-v1";
  // Each pickup's light under it, by kind, in the tint of its glow.
  const PICKUP_LIGHT = { jetpack: [0.55, 0.65, 0.75], xray: [0.35, 0.78, 0.88], updraft: [0.45, 0.8, 0.6], hook: [0.88, 0.72, 0.4] };
  const PICKUP_TOAST = { xray: "X-ray goggles · every nearby cloud's time", updraft: "Sky feather · Space once both jumps are spent",
    hook: "Grappling hook · click a cloud and hold to swing to it" };
  // Where the hook is: in hand, flying out, biting a cloud, or reeling back in.
  const HAND = 0, OUT = 1, BIT = 2, REEL = 3, HOOK_NAMES = ["hand", "out", "bit", "reel"];
  // A tornado (Thunderhead's) takes an Ooga within `WHIRL_TAKE` of its side and lets it go past `WHIRL_LET_GO`: it is
  // drawn in toward it, carried round and lifted, harder the nearer it is (`WHIRL_PULL`, `WHIRL_SPIN` and `WHIRL_LIFT`
  // m/s at its side), on in through its wall, its grip on the Ooga's flight taking hold over time (`WHIRL_GRIP` a second
  // at its side at full strength, besides the air's own drag), so speed brought in (a boost cloud's) carries a rider on
  // through a young one. One wholly inside the funnel `SWEPT_DWELL` s on end is swept up (one through it quicker is still
  // whirled, and may yet steer out): drawn in to its axis over `SWEPT_DRAW` s and whirled up the core for `SWEPT_CLIMB` s, where it is kept
  // spinning round inside the funnel near its top (`SWEPT_SINK` m under it, `SWEPT_RING` m round its axis, `SWEPT_SPIN`
  // rad/s) until a replay or exit; `SWEPT_HOLD` s after it gets there the run is lost. The view draws back `SWEPT_OUT` m outside the
  // funnel's side and rises after the Ooga, `SWEPT_BEHIND` m under it and never nearer the top than `SWEPT_UNDER` m
  // under it, turning up to follow it. Its roar is heard within `WHIRL_HEARD` of its axis.
  // A gust (Aurora Heights') pushes an airborne Ooga across the course at up to GUST_PUSH m/s², a drift of about 15 m/s
  // against the air's own drag, faster than steering can lean into it. One standing on a cloud slides with it more
  // gently, easing toward GUST_SLIDE m/s at GUST_GRIP a second, enough to carry one that just stands there off the
  // cloud's edge but not one walking against it (7.75 m/s).
  const GUST_PUSH = 22, GUST_SLIDE = 6, GUST_GRIP = 3;
  const WHIRL_TAKE = 18, WHIRL_LET_GO = 22, WHIRL_PULL = 7, WHIRL_SPIN = 12, WHIRL_LIFT = 5, WHIRL_GRIP = 10, WHIRL_HEARD = 110;
  const SWEPT_DWELL = 0.15, SWEPT_DRAW = 0.5, SWEPT_CLIMB = 2.4, SWEPT_HOLD = 1.2;
  const SWEPT_SINK = 10, SWEPT_RING = 6, SWEPT_SPIN = 2.6;
  const SWEPT_OUT = 12, SWEPT_BEHIND = 6, SWEPT_UNDER = 4;
  let guideSeen = false, itemsSeen = null;
  const hasSeenGuide = () => {
    if (!guideSeen) {
      try { guideSeen = sessionStorage.getItem(GUIDE_KEY) === "1"; } catch (_) { /* The page-session flag still works without storage. */ }
    }
    return guideSeen;
  };
  const seenItems = () => {
    if (!itemsSeen) {
      itemsSeen = new Set();
      try { for (const kind of (sessionStorage.getItem(ITEMS_KEY) || "").split(",")) if (INTRODUCED.includes(kind)) itemsSeen.add(kind); }
      catch (_) { /* The page-session set still works without storage. */ }
    }
    return itemsSeen;
  };
  // X-ray's labels, made once so drawing allocates nothing: whole seconds, and the seconds until a cloud is back.
  const SECONDS = Array.from({ length: 100 }, (_, n) => String(n)), BACK = SECONDS.map((n) => `${n}s`);
  // The banana pile's distance beside its label, whole metres, made once so drawing allocates nothing.
  const METRES = Array.from({ length: 1600 }, (_, n) => `${n} m`);
  const RING_DASH = [3, 3], HAZE_DASH = [6, 5], NO_DASH = [];
  // A warning thins its cloud in a dithered pulse that quickens from 2 to 6 a second as its time runs out.
  // It starts and ends at full opacity, and support stays whole throughout.
  const thinning = (progress, seconds) => WARNING_THIN * (0.5 - 0.5 * Math.cos(Math.PI * 2 * seconds * progress * (2 + 2 * progress)));
  // Page-session results survive hub visits, but never mix different signed-in players.
  // Each keeps per level its runs, ten best times and last seed, and which level it played last; the
  // four players who played longest ago go first, which bounds the session scores a page holds.
  const sessions = new Map(), SCORE_LIMIT = 10, SESSION_PLAYERS = 4, LEVELS = BL.cloudHopperLevels.LEVELS;
  const create = (ctx) => {
    const { root, dock, crew, pilot, hud, camera, game } = ctx;
    const ux = Math.cos(dock.rotation.y), uz = -Math.sin(dock.rotation.y);
    const home = ctx.launchPoint || { x: dock.position.x + ux * (DOCK_LENGTH + RADIUS - 0.25), y: dock.position.y, z: dock.position.z + uz * (DOCK_LENGTH + RADIUS - 0.25) };
    const length = Math.hypot(home.x, home.z), nx = home.x / length, nz = home.z / length;
    const start = { x: 0, y: 0, z: 0 };
    let level = LEVELS[0], player = "", farBefore = 0, watched = "", boardStatus = "loading";
    const heading = Math.atan2(-nx, -nz), platform = createNode({ sightHidden: true });
    const cloud = BL.cloudHopperModels.cloud(RADIUS, RADIUS, DEPTH);
    const cabinet = ctx.arcade ? createNode({ visible: false }) : BL.cloudHopperModels.cabinet();
    cabinet.position.x = nx * 1.5; cabinet.position.z = nz * 1.5; cabinet.rotation.y = heading;
    addChild(platform, cloud, cabinet); addChild(root, platform);
    Object.assign(platform.position, home);
    platform.visible = !ctx.arcade;
    const routeRoot = createNode({ visible: false, sightHidden: true });
    addChild(root, routeRoot);
    const from = { x: 0, y: 0, z: 0 }, carry = { x: 0, y: 0, z: 0 };
    const liftGoal = { x: 0, y: 0, z: 0 }, ghostStart = { x: 0, y: 0, z: 0 };
    const targetScreen = { x: 0, y: 0, depth: 0 };
    let rideView = "shoulder";
    let phase = "idle", actor = null, saved = null, course = null, age = 0, startedAt = 0, seconds = 0, displayTime = 0;
    let session = null, latest = null, run = 0, courseSeed = 0, courseDrift = 0;
    let unrecoverableAt = -1;
    let runnerName = "", dockMusicOn = false, scoreTicket = null, unwatchScores = null;
    // The power-ups this attempt: when X-ray ends (race seconds, -1 off) and whether its end was cued, a feather held,
    // and when the feather's gust began (-1 none).
    let xrayUntil = -1, xrayWarned = false, feather = false, gustAt = -1;
    // The grappling hook: whether one is held, where it is (`HAND`, `OUT`, `BIT`, `REEL`), whether its button is down,
    // the cloud it flies to or bites (null on a miss), its bite in that cloud's frame (across, and down from its top),
    // its head and where a miss stops, and how long it has pulled.
    let hookHeld = false, hookAt = HAND, hookDown = false, hookCloud = null, hookPull = 0;
    const hookTip = { x: 0, y: 0, z: 0 }, hookEnd = { x: 0, y: 0, z: 0 }, hookBite = { x: 0, y: 0, z: 0 }, hookChest = { x: 0, y: 0, z: 0 };
    const aimRay = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 }, aimHit = { x: 0, y: 0, z: 0, t: 0, cloud: null };
    // Rendering and player physics pause in a hidden tab. Keep the race's
    // wall clock on that same timeline while the soundtrack plays on.
    let helpHeld = false, hiddenAt = document.hidden ? performance.now() : -1, hiddenTime = 0;
    const raceNow = () => (hiddenAt < 0 ? performance.now() : hiddenAt) - hiddenTime;
    const onVisibility = () => {
      if (document.hidden || helpHeld) {
        if (hiddenAt < 0) hiddenAt = performance.now();
      } else if (hiddenAt >= 0) {
        hiddenTime += performance.now() - hiddenAt;
        hiddenAt = -1;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const fallOrigin = { x: 0, y: 0, z: 0 }, fallVelocity = { x: 0, y: 0, z: 0 };
    const fallEye = { x: 0, y: 0, z: 0 }, fallTarget = { x: 0, y: 0, z: 0 }, beforeStep = { x: 0, y: 0, z: 0 };
    const launchContacts = new Uint8Array(BL.cloudHopperCourse.MAX_CLOUDS);
    const fallRight = { x: 1, y: 0, z: 0 }, fallUp = { x: 0, y: 1, z: 0 };
    let fallSavedUp = null, fallOrthoHeight = 0, fallVisible = true;
    const fallViewShift = BL.math.mat4.create();
    let fallTime = 0, fallDuration = 0, stepTime = 0, falling = false, liftViewMix = 0;
    const endFall = () => {
      if (!falling) return;
      actor.root.visible = fallVisible;
      // The fixed camera did not travel with the actor. Rebase the pilot's
      // retained anchors before the ordinary replay/exit relocation.
      Object.assign(camera.position, fallEye); Object.assign(camera.target, fallTarget);
      camera.up = fallSavedUp; camera.orthoHeight = fallOrthoHeight;
      BL.math.mat4.identity(fallViewShift);
      fallViewShift[12] = actor.root.position.x - fallOrigin.x;
      fallViewShift[13] = actor.root.position.y - fallOrigin.y;
      fallViewShift[14] = actor.root.position.z - fallOrigin.z;
      pilot.transformView(fallViewShift, 0);
      falling = false;
    };
    const fallView = () => {
      if (swept >= 0) {
        // Swept up: the view (`sweepStep` moves it) turns up after the Ooga, up the core and out of the top.
        const k = Math.min(1, stepTime * 20);
        sweptLook.x += (sweptAim.x - sweptLook.x) * k; sweptLook.y += (sweptAim.y - sweptLook.y) * k; sweptLook.z += (sweptAim.z - sweptLook.z) * k;
        Object.assign(camera.position, sweptEye); Object.assign(camera.target, sweptLook);
        return true;
      }
      if (!falling) return false;
      const p = actor.root.position;
      Object.assign(camera.position, fallEye);
      let dx = p.x - fallEye.x, dy = p.y - actor.baseY + actor.bodyHeight * 0.5 - fallEye.y, dz = p.z - fallEye.z;
      let length = Math.hypot(dx, dy, dz);
      if (length < 1e-7) {
        dx = fallTarget.x - fallEye.x; dy = fallTarget.y - fallEye.y; dz = fallTarget.z - fallEye.z;
        length = Math.hypot(dx, dy, dz);
        if (length < 1e-7) { dx = -nx; dy = -1; dz = -nz; length = Math.SQRT2; }
      }
      const x = dx / length, y = dy / length, z = dz / length;
      // Retain screen-right through a vertical fall instead of flipping at
      // the lookAt pole. Tilt above the torso to put it at 75% screen height.
      const dot = fallRight.x * x + fallRight.y * y + fallRight.z * z;
      let rx = fallRight.x - dot * x, ry = fallRight.y - dot * y, rz = fallRight.z - dot * z;
      let r = Math.hypot(rx, ry, rz);
      if (r < 1e-7) { rx = -z; ry = 0; rz = x; r = Math.hypot(rx, rz); }
      if (r < 1e-7) { rx = nz; rz = -nx; r = 1; }
      rx /= r; ry /= r; rz /= r;
      const ux = ry * z - rz * y, uy = rz * x - rx * z, uz = rx * y - ry * x;
      const tangent = Math.tan(camera.fov * 0.5), q = 0.5 * tangent;
      const ortho = fallOrthoHeight > 0 ? Math.max(0, Math.min(1, camera.orthoMix || 0)) : 0;
      // An unusually wide orthographic view may need a tighter scale to frame
      // a nearby torso below centre without moving the held camera position.
      if (ortho > 0) camera.orthoHeight = Math.min(fallOrthoHeight, 3 * length / ortho);
      const perspective = 1 - ortho, offset = ortho * (camera.orthoHeight || 0) / (2 * tangent);
      const a = 1 + q * q * perspective * perspective;
      const depth = (-q * q * perspective * offset + Math.sqrt(Math.max(0, length * length * a - q * q * offset * offset))) / a;
      const c = depth / length, s = q * (perspective * depth + offset) / length;
      camera.target.x = fallEye.x + (x * c + ux * s) * length;
      camera.target.y = fallEye.y + (y * c + uy * s) * length;
      camera.target.z = fallEye.z + (z * c + uz * s) * length;
      fallUp.x = ux * c - x * s; fallUp.y = uy * c - y * s; fallUp.z = uz * c - z * s;
      camera.up = fallUp;
      pilot.syncHeadVisibility(actor);
      return true;
    };
    const cloudNodes = [], boostNodes = [], bounceNodes = [], pickupNodes = [];
    const cloudFading = new Uint8Array(BL.cloudHopperCourse.MAX_CLOUDS), cloudWarning = new Uint8Array(BL.cloudHopperCourse.MAX_CLOUDS);
    const action = { kind: "cloud-hopper" };
    const active = () => phase !== "idle", playing = () => active() && phase !== "intro";
    const held = () => phase === "intro" || phase === "lifting" || phase === "briefing" || phase === "won" || phase === "dq";
    const overlay = BL.cloudHopperHud.create({ onStart: () => beginRun(), onReplay: () => beginRun(), onExit: () => exit(),
      onGuideDone: () => finishGuide(), onSelect: (id) => selectLevel(id), onNext: () => nextLevel(), onHook: (down) => hookAction(down),
      onGhost: () => replays?.toggle(),
      letterSign: hud.letterSign });
    const ghost = BL.cloudHopperGhost.create({ root, renderer: ctx.renderer });
    let ghostRecording = null;
    const replays = BL.cloudHopperReplays?.create({ onBoard: board => overlay.setHighscores(board),
      onState: state => overlay.setReplayState?.(state),
      onHide: () => { ghostRecording = null; ghost.hide(); },
      onPlay: recording => { ghostRecording = recording; stageGhost(); } });
    const audio = BL.cloudHopperAudio.create();
    const scenery = BL.cloudHopperSky.create({ root, renderer: ctx.renderer, seaY: ctx.seaY, onStrike: (distance) => audio.thunder(distance) });
    // Thunderhead's tornadoes, one a spot and any of them up at once, each writing its own whirl; `tornado` is the one
    // that matters now (the one that has the Ooga, else the nearest down, else the nearest brewing), whose whirl the
    // course takes. And whether one has the Ooga (and the height it took it at).
    const tornadoes = BL.cloudHopperTornado.SPOTS.map((spot, which) => BL.cloudHopperTornado.create({ root: routeRoot, renderer: ctx.renderer, which,
      onDrop: (x, y, z) => { if (actor) audio.tornadoForm(Math.hypot(x - actor.root.position.x, y - actor.root.position.y, z - actor.root.position.z)); },
      onStrike: (distance) => audio.thunder(distance) }));
    const whirls = tornadoes.map(() => ({ x: 0, z: 0, strength: 0, reach: 1, core: 1, speed: 0, draw: 0, rise: 0 }));
    // Aurora Heights' gusts of wind.
    const gust = BL.cloudHopperGust.create({ root: routeRoot, renderer: ctx.renderer });
    let slideX = 0, slideZ = 0;
    let tornado = tornadoes[0];
    // How long the Ooga has been wholly inside a tornado's funnel on end (s).
    let whirled = false, engulfed = 0;
    // Swept up inside one: how long since (-1 not), the angle round its axis, the height it was taken at, the side of
    // it the view drew back to and how far the view tilts up behind the DQ card, and the view: where it watches from,
    // what it eases toward looking at and what it looks at (with what the pilot had, given back after), and its axis
    // at the view's height; and its axis where the outline test samples it.
    let swept = -1, sweptAngle = 0, sweptFrom = 0, sweptR = 1, sweptSide = 0, sweptTilt = 0;
    const sweptEye = { x: 0, y: 0, z: 0 }, sweptAim = { x: 0, y: 0, z: 0 }, sweptLook = { x: 0, y: 0, z: 0 };
    const sweptAxis = { x: 0, z: 0 }, insideAxis = { x: 0, z: 0 };
    const sweptCamPos = { x: 0, y: 0, z: 0 }, sweptCamTarget = { x: 0, y: 0, z: 0 }, sweptOrigin = { x: 0, y: 0, z: 0 };
    const whirlAxis = { x: 0, z: 0 };
    // The hook's rope and head, and the feather's gust of leaves: built once, shown when used.
    const rope = createNode({ geometry: BL.cloudHopperModels.rope(), visible: false, sightHidden: true });
    const hookNode = createNode({ geometry: BL.cloudHopperModels.hookHead(), visible: false, sightHidden: true }), leaves = [];
    addChild(routeRoot, rope, hookNode);
    for (let i = 0; i < 12; i++) {
      const leaf = createNode({ geometry: BL.cloudHopperModels.leaf(), visible: false, sightHidden: true });
      leaves.push(leaf); addChild(routeRoot, leaf);
    }
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const nearIndex = new Int16Array(8), nearDistance = new Float32Array(8), drawnX = new Float32Array(8), drawnY = new Float32Array(8);
    const screen = { x: 0, y: 0, depth: 0 }, edge = { x: 0, y: 0, depth: 0 };
    const dockMusicLevel = () => {
      const cave = pilot.player;
      if (!cave || cave !== crew.player) return 0;
      const p = cave.root.position, feet = p.y - cave.baseY, radius = cave.bodyRadius || 0.3;
      const along = (p.x - dock.position.x) * ux + (p.z - dock.position.z) * uz;
      const across = Math.abs((p.x - dock.position.x) * -uz + (p.z - dock.position.z) * ux);
      const clamp = BL.math.clamp;
      let level = 0;
      // Fade along the shoreward half of the deck and at its sides. Height
      // checks keep the score off below the dock while allowing normal jumps.
      if (along >= 0 && along <= DOCK_LENGTH + radius && feet >= dock.position.y - 0.4 && feet <= dock.position.y + 3) {
        level = clamp(along / 2, 0, 1) * clamp((1 + radius - across) / 0.6, 0, 1);
      }
      const cloud = platform.position;
      if (feet >= cloud.y - 0.4 && feet <= cloud.y + 3) {
        level = Math.max(level, clamp((RADIUS + radius - Math.hypot(p.x - cloud.x, p.z - cloud.z)) / 0.8, 0, 1));
      }
      return level * DOCK_MUSIC_LEVEL;
    };
    const updateDockMusic = () => {
      const level = dockMusicLevel();
      if (level > 0) {
        if (!dockMusicOn) {
          // The dock plays the score of the level played last.
          audio.song(Math.max(1, game.state.cloudHopper.last) - 1);
          audio.stage("dock"); audio.level(level, 0.6); audio.unlock(); dockMusicOn = true;
        } else audio.level(level);
        audio.tick();
      } else if (dockMusicOn) {
        // The spatial fade reaches zero at the edge; leave no background
        // scheduler running after the visitor has left this part of the hub.
        audio.stop(); dockMusicOn = false;
      }
    };
    const onJump = (cave) => {
      if (cave === actor && (phase === "ready" || phase === "running")) audio.jump();
    };
    const stageGhost = () => {
      const p = platform.position, edge = RADIUS - 0.6;
      ghostStart.x = p.x - nx * edge; ghostStart.y = p.y; ghostStart.z = p.z - nz * edge;
      // The sole playback source is the opted-in shared winner, never this browser's personal best.
      ghost.play(ghostRecording, phase === "running" ? null : ghostStart, heading);
      if (phase === "running") ghost.update(seconds);
    };
    // X-ray's goggles on the Ooga's face while they last, the face anchor shown as it was before once they come off.
    let goggles = null, gogglesOn = null, faceShown = false;
    const wearGoggles = (on) => {
      if (on === !!goggles) return;
      if (on) { gogglesOn = actor.parts.face; faceShown = gogglesOn.visible; goggles = BL.cloudHopperModels.wornGoggles(actor); addChild(gogglesOn, goggles); gogglesOn.visible = true; }
      else { removeChild(gogglesOn, goggles); gogglesOn.visible = faceShown; goggles = gogglesOn = null; }
    };
    const clearRoute = (keepMusic = false) => {
      ghost.hide();
      if (!keepMusic) { audio.stop(); dockMusicOn = false; }
      cloudFading.fill(0); cloudWarning.fill(0);
      // Cloud meshes belong to the shared island kit and stay cached after a run.
      for (const node of cloudNodes) removeChild(routeRoot, node);
      for (const node of boostNodes) if (node) removeChild(routeRoot, node);
      for (const node of bounceNodes) if (node) removeChild(routeRoot, node);
      for (const node of pickupNodes) removeChild(routeRoot, node);
      cloudNodes.length = boostNodes.length = bounceNodes.length = pickupNodes.length = 0;
      launchContacts.fill(0); unrecoverableAt = -1;
      scenery.clear(); for (const t of tornadoes) t.clear(); whirled = false; audio.tornado(0);
      gust.clear(); slideX = slideZ = 0; overlay.setGust("calm", false); audio.gust(0); cloud.geometry = BL.cloudHopperModels.cloudMesh(0);
      xrayUntil = gustAt = -1; xrayWarned = feather = hookHeld = hookDown = false; hookAt = HAND; hookCloud = null;
      wearGoggles(false);
      rope.visible = hookNode.visible = false;
      for (const leaf of leaves) leaf.visible = false;
      overlay.setPowers(-1, false, -1);
      course = null; routeRoot.visible = false;
    };
    const moveRider = () => {
      const p = platform.position;
      carry.x = p.x - nx * 1.25; carry.y = p.y; carry.z = p.z - nz * 1.25;
      ctx.move(carry, heading);
    };
    // Control back at the top: the view framing the island eases into the one the player keeps (first person or the
    // shoulder, its own boom and height) instead of jumping there.
    // `holdView` takes the view as shown before control comes back (which already solves the player's own), and
    // `settleView` eases from it.
    const settlePose = {};
    const holdView = () => { pilot.cameraHandoff.capture(settlePose); };
    const settleView = () => { pilot.cameraHandoff.begin(settlePose, false, SETTLE_SECONDS); };
    const turnLiftView = (mix) => {
      if (ctx.arcade && phase === "lifting") {
        // Show the rider and cloud even when play uses first person. The retained play view returns at the top.
        pilot.framePoint(liftGoal, 0.4, 1, START_VIEW);
        return;
      }
      const blend = mix === 1 ? 1 : (mix - liftViewMix) / Math.max(1e-9, 1 - liftViewMix);
      const closeView = pilot.view === "first-person" || pilot.view === "shoulder";
      // Keep the selected view across rides and replays. Only orbit needs
      // the raised overview to see the island beyond the foreground cloud.
      if (closeView) pilot.releaseFrame(true);
      pilot.framePoint(liftGoal, overlay.frameY, blend, closeView ? null : START_VIEW);
      liftViewMix = mix;
    };
    const setPhase = (next) => {
      phase = next; age = 0;
      hud.setPanelsHidden(next === "lifting" || next === "briefing" || next === "ready" || next === "running");
      cabinet.visible = !ctx.arcade && (next === "idle" || next === "intro");
      pilot.setActive(!held());
      overlay.show(next, seconds, session && played().scores, latest);
      audio.stage(next === "won" && latest?.run === played().scores[0]?.run ? "best" : next);
      audio.level(next === "intro" || next === "lifting" ? DOCK_MUSIC_LEVEL : 1, 0.8);
      if (next === "intro") audio.unlock();
      // The run is played in combat; control back at the top takes mouse-look again (natively inside a gesture).
      if (next === "ready") pilot.focusAim(typeof navigator !== "undefined" && !!navigator.userActivation?.isActive);
    };
    // Whether this run carries each: bounce clouds by its course's own clouds, tornadoes by its level's sky, and gusts
    // and a power-up by its level's count.
    const carries = (kind) => kind === "bounce" ? course.clouds.some(c => c.kind === "bounce")
      : kind === "tornado" ? !!level.sky?.tornado : kind === "gust" ? level.layout.gusts > 0 : level.layout[kind] > 0;
    // What this run carries that this browser session has not been shown yet.
    const newItems = () => INTRODUCED.filter((kind) => carries(kind) && !seenItems().has(kind));
    const finishGuide = () => {
      if (phase !== "briefing") return;
      holdView();
      guideSeen = true;
      for (const kind of INTRODUCED) if (carries(kind)) seenItems().add(kind);
      try { sessionStorage.setItem(GUIDE_KEY, "1"); sessionStorage.setItem(ITEMS_KEY, [...seenItems()].join(",")); }
      catch (_) { /* Keep completion for this page session. */ }
      // A key held while reading must not move the rider off the start cloud.
      pilot.controls.reset();
      setPhase("ready");
      // Close views regain their active camera solver after the held tips.
      if (pilot.view === "first-person" || pilot.view === "shoulder") turnLiftView(1);
      settleView();
      stageGhost();
    };
    const prepareEquipment = cave => {
      if (!saved) saved = { jetOwned: cave.jetpackOwned, jetWorn: !!cave.jet, fuel: cave.jetFuel, recovering: cave.jetRecovering,
        primary: cave.weapon.primaryOwned, secondary: cave.weapon.secondaryOwned, slot: cave.weapon.equipped ? 2 : cave.weapon.primaryEquipped ? 1 : 0,
        aiming: cave.weapon.aiming };
      cave.weapon.primaryOwned = cave.weapon.secondaryOwned = false; crew.selectWeapon(0, cave);
      crew.setJetpackOwnership(cave, false); cave.jetFuel = 0; cave.jetRecovering = false;
      crew.clearProjectiles();
    };
    const restoreEquipment = () => {
      if (!saved || !actor) return;
      crew.removeJetpack(actor);
      crew.setJetpackOwnership(actor, saved.jetOwned, actor.jetpackGeometry, actor.jetpackFlameGeometry);
      actor.jetFuel = saved.fuel; actor.jetRecovering = saved.recovering;
      if (saved.jetWorn) crew.wearJetpack(actor, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      actor.weapon.primaryOwned = saved.primary; actor.weapon.secondaryOwned = saved.secondary;
      crew.selectWeapon(saved.slot, actor);
      // An Ooga that came in carrying goes back to carrying.
      if (!saved.aiming && actor.weapon.aiming && pilot.player === actor) pilot.modeAction("mode-toggle");
      saved = null; pilot.showAct();
    };
    // A level's start stands its route out from the final cloud, which is 12 m off the coast, and its slope
    // above that cloud, along the dock's heading.
    const placeStart = () => {
      Object.assign(liftGoal, ctx.finish());
      const radius = ctx.mainlandRadius + 12 + level.route;
      start.x = liftGoal.x + nx * radius; start.y = liftGoal.y + 18 + level.slope * level.route; start.z = liftGoal.z + nz * radius;
    };
    // Levels open in this browser; the session record of the level being played; and the level a visit starts on:
    // the one played last this visit, else the highest open one this player has not finished, else the highest.
    const opened = () => Math.min(LEVELS.length, game.state.cloudHopper.unlocked);
    const played = () => session.levels[level.id - 1];
    const pickLevel = () => {
      if (session.lastLevel) return session.lastLevel;
      for (let id = opened(); id > 1; id--) if (!game.cloudHopperBest(player, id)) return id;
      return game.cloudHopperBest(player, 1) ? opened() : 1;
    };
    // The selected level's personal best stays separate from its public shared board.
    const showLevels = () => overlay.setLevels({ selected: level.id, unlocked: opened(),
      bests: LEVELS.map((each) => game.cloudHopperBest(player, each.id)) });
    // The cards choose on the intro and on the result card's Level select; the run places its own start.
    const selectLevel = (id) => {
      if (phase !== "intro" && phase !== "won" && phase !== "dq") return;
      level = LEVELS[id - 1]; showLevels(); watchBoard(); audio.song(level.id - 1);
    };
    // Watch only the selected level, through its cards and active run; times never cross levels.
    const watchBoard = () => {
      unwatchScores?.();
      watched = level.board;
      boardStatus = "loading";
      overlay.setHighscores(null);
      ghost.clear();
      replays?.select(level.board, level.courseVersion);
      unwatchScores = BL.highscores?.watch(level.board, board => replays ? replays.update(board) : overlay.setHighscores(board),
        status => { boardStatus = status; overlay.setHighscoreStatus(status); },
        submissions => overlay.setSubmissions(submissions)) || null;
      if (!BL.highscores) overlay.setHighscoreStatus("unavailable");
    };
    // The next level rides up from beside the island to its own start, as a first run does.
    const nextLevel = () => {
      if (phase !== "won" || level.id >= opened()) return;
      level = LEVELS[level.id]; beginRun(true);
    };
    const launch = (fromArcade = false) => {
      if (active()) return false;
      const cave = pilot.player;
      if (!cave || cave !== crew.player) { hud.toast("Choose an Ooga and walk onto the Cloud Hopper cloud"); return false; }
      if (ctx.arcade ? !fromArcade : !near(cave.root.position.x, cave.root.position.y - cave.baseY + 1.1, cave.root.position.z)) return false;
      const refusal = ctx.refusal();
      if (refusal) { hud.toast(refusal); return false; }
      actor = cave; prepareEquipment(cave); platform.visible = true;
      if (ctx.arcade) { Object.assign(platform.position, home); moveRider(); }
      overlay.setRunner(cave);
      const login = BL.net.state.me?.login || "";
      runnerName = login || cave.traits.name; player = game.cloudHopperPlayer(BL.net.state.me);
      session = sessions.get(player);
      if (!session) {
        session = { levels: LEVELS.map(() => ({ runs: 0, scores: [], lastSeed: null })), lastLevel: 0 };
        sessions.set(player, session);
        if (sessions.size > SESSION_PLAYERS) sessions.delete(sessions.keys().next().value);
      }
      level = LEVELS[pickLevel() - 1]; showLevels(); audio.song(level.id - 1);
      seconds = 0; latest = null; placeStart();
      watchBoard();
      setPhase("intro"); pilot.freeCursor();
      return true;
    };
    const beginRun = (ride = false) => {
      const replay = phase === "won" || phase === "dq", climb = ctx.arcade || !replay || ride;
      if (phase !== "intro" && !replay || level.id > opened()) return false;
      const cave = actor;
      rideView = pilot.view;
      if (!cave || pilot.player !== cave || crew.player !== cave) { cancel(); return false; }
      const refusal = ctx.refusal();
      if (refusal) { hud.toast(refusal); return false; }
      prepareEquipment(cave);
      endFall(); endSweep();
      clearRoute(true);
      audio.unlock();
      if (climb) Object.assign(platform.position, home);
      Object.assign(from, platform.position);
      liftViewMix = 0;
      const record = played();
      seconds = startedAt = 0; latest = null; run = ++record.runs; session.lastLevel = level.id; showLevels();
      audio.song(level.id - 1); game.playCloudHopper(level.id);
      if (watched !== level.board) watchBoard();
      ghost.clear();
      replays?.start();
      overlay.setHighscoreStatus(boardStatus);
      scoreTicket = BL.highscores?.begin(level.board) || null;
      // Each attempt gets fresh clouds; the ghost keeps its original route.
      courseSeed = BL.math.randomInt(4294967296);
      if (courseSeed === record.lastSeed) courseSeed = (courseSeed + 1) >>> 0;
      record.lastSeed = courseSeed;
      placeStart();
      course = BL.cloudHopperCourse.create({ start, finish: liftGoal, mainlandRadius: ctx.mainlandRadius, seed: courseSeed,
        layout: level.layout, timing: level.timing, runSpeed: BL.pilot.WALK.speed * BL.pilot.WALK.run, jumpSpeed: BL.crew.JUMP_SPEED });
      // Far starts keep the island in view, and the level's scenery too.
      const reach = scenery.build(level, course, start, liftGoal);
      if (level.sky?.tornado) for (let i = 0; i < tornadoes.length; i++) tornadoes[i].start(courseSeed, course, liftGoal, i);
      gust.start(courseSeed, course, liftGoal, level.layout.gusts || 0);
      if (!farBefore) farBefore = camera.far;
      camera.far = Math.max(farBefore, Math.hypot(start.x - liftGoal.x, start.y - liftGoal.y, start.z - liftGoal.z) + 150, reach);
      // A night sky's clouds, the launch cloud among them, take the night fill.
      const dark = !!level.sky?.night;
      cloud.geometry = BL.cloudHopperModels.cloudMesh(0, "normal", dark);
      for (const c of course.clouds) {
        const node = BL.cloudHopperModels.cloud(c.rx, c.rz, c.depth, c.kind, c.yaw, dark);
        const surface = c.kind === "boost" ? BL.cloudHopperModels.boostSurface(c, node) : null;
        node.position.x += c.x; node.position.y += c.y; node.position.z += c.z;
        node.smokeOpacity = 1;
        cloudNodes.push(node); addChild(routeRoot, node);
        boostNodes.push(surface);
        if (surface) {
          surface.position.x = c.x; surface.position.y = c.y + 0.025; surface.position.z = c.z;
          surface.smokeOpacity = 1;
          addChild(routeRoot, surface);
        }
        const marker = c.kind === "bounce" ? BL.cloudHopperModels.bounceMarker() : null;
        bounceNodes.push(marker);
        if (marker) {
          BL.cloudHopperModels.updateBounceMarker(marker, c, displayTime);
          addChild(routeRoot, marker);
        }
      }
      for (const p of course.pickups) {
        const node = BL.cloudHopperModels.pickup(p.kind);
        node.position.x = p.x; node.position.y = p.y; node.position.z = p.z;
        BL.cloudHopperModels.updateJetpackPickup(node, camera, displayTime + p.index * 2, level.sky?.fog);
        pickupNodes.push(node); addChild(routeRoot, node);
      }
      routeRoot.visible = true;
      if (!climb) Object.assign(platform.position, start);
      // Every arcade attempt rides from beside the island; guidance waits until the cloud reaches the top.
      const items = climb ? null : newItems(), guide = !climb && !hasSeenGuide(), briefing = guide || !!items?.length;
      if (briefing) overlay.setGuide(guide, items);
      setPhase(climb ? "lifting" : briefing ? "briefing" : "ready");
      // No carry here: the run is played in combat, at the shoulder or in first person. The hub's `combatOnly` holds
      // it there from now on, and lets the pilot enter it while the ride holds the controls.
      if (!cave.weapon.aiming) pilot.modeAction("mode-toggle");
      if (!replay) ctx.mode(true);
      moveRider();
      if (climb && ctx.arcade) turnLiftView(0);
      if (!climb) {
        if (!briefing) stageGhost();
        pilot.controls.reset(); turnLiftView(1);
        if (briefing) pilot.freeCursor();
      }
      return true;
    };
    const near = (x, y, z) => !ctx.arcade && !active() && Math.abs(y - 1.1 - platform.position.y) < 0.45
      && Math.hypot(x - platform.position.x, z - platform.position.z) < RADIUS - 0.4;
    // `how` a run is lost: "water" (into the sea, or out of reach of every cloud) or "tornado" (swept up its core).
    const finish = (won, how = "water") => {
      seconds = (raceNow() - startedAt) / 1000;
      if (won) {
        const record = played();
        const recording = ghost.finish(seconds, actor);
        if (recording) {
          recording.seed = courseSeed; recording.driftTime = courseDrift;
          recording.courseVersion = level.courseVersion;
        }
        // Saved in this browser, signed in or out, online or not: the player's best and the next level.
        const saved = game.recordCloudHopper(player, level.id, Math.round(seconds * 1000), LEVELS.length);
        latest = { time: seconds, run, username: runnerName, personalBest: saved.best, unlocked: saved.unlocked };
        showLevels();
        BL.highscores?.submit(scoreTicket, level.board, Math.round(seconds * 1000), recording);
        const scores = record.scores;
        let at = 0;
        while (at < scores.length && scores[at].time <= seconds) at++;
        if (at < SCORE_LIMIT) {
          scores.splice(at, 0, latest);
          if (scores.length > SCORE_LIMIT) scores.length = SCORE_LIMIT;
        }
      }
      // Into the water the view holds and watches the fall; a tornado keeps the Ooga spinning at its top instead.
      else if (how !== "tornado") {
        const p = actor.root.position, gravity = BL.pilot.WALK.gravity;
        Object.assign(fallOrigin, p); Object.assign(fallEye, camera.position); Object.assign(fallTarget, camera.target);
        fallSavedUp = camera.up; fallOrthoHeight = camera.orthoHeight || 0;
        fallVisible = actor.root.visible;
        const ux = camera.up?.x || 0, uy = camera.up ? camera.up.y : 1, uz = camera.up?.z || 0;
        const dx = camera.target.x - camera.position.x, dy = camera.target.y - camera.position.y, dz = camera.target.z - camera.position.z;
        fallRight.x = dy * uz - dz * uy; fallRight.y = dz * ux - dx * uz; fallRight.z = dx * uy - dy * ux;
        const r = Math.hypot(fallRight.x, fallRight.y, fallRight.z);
        if (r > 1e-7) { fallRight.x /= r; fallRight.y /= r; fallRight.z /= r; }
        else { fallRight.x = nz; fallRight.y = 0; fallRight.z = -nx; }
        fallVelocity.x = stepTime > 0 ? (p.x - beforeStep.x) / stepTime : 0;
        fallVelocity.z = stepTime > 0 ? (p.z - beforeStep.z) / stepTime : 0;
        fallVelocity.y = Math.min(0, actor.hopV);
        const depth = p.y - actor.baseY - (ctx.seaY - actor.bodyHeight - 8);
        fallDuration = (fallVelocity.y + Math.sqrt(fallVelocity.y ** 2 + 2 * gravity * Math.max(0, depth))) / gravity;
        fallTime = 0; falling = true;
        // Crew simulation is held on the result screen, so clear its last
        // powered pose now instead of leaving a frozen flame on the falling pack.
        if (actor.jet) crew.cutJet(actor);
      }
      ghost.hide();
      // A tornado ends with the run and lets the clouds go, unless the run ended in it, when it goes on behind the card.
      replays?.end();
      if (how !== "tornado") { for (let i = 0; i < tornadoes.length; i++) tornadoes[i].clear(whirls[i]); course.whirl.strength = 0; audio.tornado(0); }
      gust.clear(); slideX = slideZ = 0; overlay.setGust("calm", false); audio.gust(0);
      whirled = false;
      overlay.setDq(how);
      // A hook out comes home with the run's end.
      hookAt = HAND; hookCloud = null; hookDown = false; rope.visible = hookNode.visible = false;
      scoreTicket = null;
      setPhase(won ? "won" : "dq");
      pilot.freeCursor();
    };
    // Exits and scene changes park at the dock before the hub can release its actor.
    const cancel = (keepMusic = false) => {
      unwatchScores?.(); unwatchScores = null; scoreTicket = null; watched = "";
      replays?.clear();
      if (farBefore) { camera.far = farBefore; farBefore = 0; }
      if (!active()) {
        if (!keepMusic) { audio.stop(); dockMusicOn = false; }
        return;
      }
      const park = playing();
      endFall(); endSweep();
      pilot.releaseFrame(true);
      cabinet.visible = !ctx.arcade;
      if (park) ctx.mode(false);
      clearRoute(keepMusic); phase = "idle";
      hud.setPanelsHidden(false);
      ghost.clear();
      if (park) {
        Object.assign(platform.position, home);
        if (pilot.player === actor && crew.player === actor) moveRider();
      }
      restoreEquipment();
      if (ctx.arcade) { platform.visible = false; ctx.park(); }
      actor = null; session = latest = null; runnerName = "";
      overlay.hide(); pilot.setActive(true); pilot.controls.reset();
    };
    const exit = () => {
      if (!active()) return false;
      if (ctx.arcade && ctx.cabinet?.()) { ctx.onExit(); return true; }
      cancel(!ctx.arcade);
      if (ctx.arcade) ctx.onExit();
      else { audio.stage("dock"); audio.level(dockMusicLevel(), 0.8); dockMusicOn = true; }
      return true;
    };
    const preUpdate = (dt) => {
      displayTime += dt;
      if (cabinet.visible) BL.cloudHopperModels.updateCabinet(cabinet, displayTime);
      if (!active()) { if (!ctx.arcade) updateDockMusic(); return; }
      if (pilot.player !== actor || crew.player !== actor) { cancel(); return; }
      audio.tick();
      if (falling) {
        // Results stop input and the race clock, not the visible fall. Integrate
        // through the sea surface and stop only once the whole body is submerged.
        fallTime = Math.min(fallDuration, fallTime + dt);
        const p = actor.root.position;
        p.x = fallOrigin.x + fallVelocity.x * fallTime;
        p.y = fallOrigin.y + fallVelocity.y * fallTime - BL.pilot.WALK.gravity * fallTime * fallTime * 0.5;
        p.z = fallOrigin.z + fallVelocity.z * fallTime;
        // The ocean is a painted background, so it cannot occlude the body.
        // Hide it after submersion, retaining the held camera until replay/exit.
        if (fallTime === fallDuration) actor.root.visible = false;
        return;
      }
      // A storm level's rain falls while the rider is up there.
      audio.rain(!!level.sky?.storm && (phase === "lifting" || phase === "briefing" || phase === "ready" || phase === "running"));
      if (!course || phase === "won") return;
      Object.assign(beforeStep, actor.root.position); stepTime = dt;
      // Carry planted feet with the drifting, dissolving surface before ordinary gravity runs.
      let riding = null, oldTop = 0;
      const p = actor.root.position, feet = p.y - actor.baseY;
      if (!held() && actor.hop < 0.001 && actor.hopV <= 0 && !actor.jet?.thrust) {
        const contact = course.contactAt(p.x, p.z, feet);
        if (contact && Math.abs(feet - contact.top) < 0.06) { riding = contact; oldTop = contact.top; }
      }
      // Each tornado on its own clock; the one that matters now turns the clouds near it as the course moves them.
      if ((phase === "running" || swept >= 0) && level.sky?.tornado) {
        let best = -1, nearest = Infinity;
        for (let i = 0; i < tornadoes.length; i++) {
          const t = tornadoes[i];
          t.update(dt, p.x, p.z, liftGoal, whirls[i], camera.position);
          if (!t.active) continue;
          t.axisAt(feet, whirlAxis);
          const rank = Math.hypot(p.x - whirlAxis.x, p.z - whirlAxis.z) + (t.down ? 0 : 1e6);
          if (rank < nearest) { nearest = rank; best = i; }
        }
        if (!whirled && swept < 0 && best >= 0) tornado = tornadoes[best];
        Object.assign(course.whirl, whirls[tornadoes.indexOf(tornado)]);
        tornado.axisAt(feet, whirlAxis);
        const near = Math.max(0, 1 - Math.max(0, Math.hypot(p.x - whirlAxis.x, p.z - whirlAxis.z) - 6) / WHIRL_HEARD);
        audio.tornado(near * Math.max(tornado.strength, tornado.forming * 0.35));
      }
      // A gust: warned of at the screen's edge it comes from (by the view's right) with a rising whoosh, then pushing an
      // airborne Ooga across the course and sliding one planted on a cloud, which leaves it at the slide's speed.
      if (phase === "running" && level.layout.gusts) {
        const was = gust.state;
        gust.update(dt, p.x, p.z, camera.position, camera.target);
        if (was === "calm" && gust.state === "warning") audio.gustWarn();
        const push = swept < 0 ? gust.strength : 0;
        if (riding) {
          const k = 1 - Math.exp(-GUST_GRIP * dt);
          slideX += (gust.pushX * GUST_SLIDE * push - slideX) * k; slideZ += (gust.pushZ * GUST_SLIDE * push - slideZ) * k;
          p.x += slideX * dt; p.z += slideZ * dt;
        } else {
          if (actor.hop > 0) {
            actor.leap.vx += slideX + gust.pushX * GUST_PUSH * push * dt; actor.leap.vz += slideZ + gust.pushZ * GUST_PUSH * push * dt;
          }
          slideX = slideZ = 0;
        }
        const fx = camera.target.x - camera.position.x, fz = camera.target.z - camera.position.z;
        overlay.setGust(gust.state, gust.pushX * -fz + gust.pushZ * fx > 0);
        audio.gust(gust.strength);
      }
      course.update(dt, phase === "running" ? (raceNow() - startedAt) / 1000 : undefined);
      // Lanes swing smoothly, so a planted rider rides the cloud's whole move however long the frame.
      if (riding) {
        p.x += riding.x - riding.previousX; p.z += riding.z - riding.previousZ;
        p.y += riding.top - oldTop;
      }
      for (let i = 0; i < cloudNodes.length; i++) {
        const c = course.clouds[i], node = cloudNodes[i];
        // A single cue at warning and at fade onset, measured from the rider in all three
        // dimensions. Distant events are discarded, never queued on approach.
        if (phase === "running" && (c.warning >= 0 && !cloudWarning[i] || c.fading && !cloudFading[i])) {
          const distance = Math.hypot(c.x - p.x, c.top - p.y, c.z - p.z);
          if (c.fading) audio.fade(distance); else audio.warn(distance);
        }
        cloudWarning[i] = c.warning >= 0 ? 1 : 0;
        cloudFading[i] = c.fading ? 1 : 0;
        const opacity = c.warning >= 0 ? c.opacity * (1 - thinning(c.warning, course.timing.warn)) : c.opacity;
        node.position.x += c.x - c.previousX; node.position.y += c.lift - c.previousLift; node.position.z += c.z - c.previousZ;
        node.smokeOpacity = opacity; node.visible = c.opacity > 0;
        const surface = boostNodes[i];
        if (surface) {
          surface.position.x = c.x; surface.position.y = c.y + c.lift + 0.025; surface.position.z = c.z;
          surface.smokeOpacity = opacity; surface.visible = c.active;
          BL.cloudHopperModels.updateBoostSurface(surface, displayTime);
        }
        if (bounceNodes[i]) BL.cloudHopperModels.updateBounceMarker(bounceNodes[i], c, displayTime);
      }
      for (let i = 0; i < pickupNodes.length; i++) {
        const pickup = course.pickups[i], node = pickupNodes[i];
        node.visible = pickup.active && pickup.y > ctx.seaY;
        node.position.x = pickup.x; node.position.y = pickup.y; node.position.z = pickup.z;
        if (node.visible) BL.cloudHopperModels.updateJetpackPickup(node, camera, displayTime + i * 2, level.sky?.fog);
      }
      if (hookHeld && (phase === "ready" || phase === "running")) updateHook(dt);
      whirlOoga();
      scenery.update(dt, camera);
      if (phase === "lifting") {
        age += dt;
        const t = Math.min(1, age / LIFT_SECONDS), k = t * t * (3 - 2 * t), p = platform.position;
        p.x = from.x + (start.x - from.x) * k;
        p.y = from.y + (start.y - from.y) * k;
        p.z = from.z + (start.z - from.z) * k;
        moveRider();
        // Follow the full eased climb in decibels so the early gain change
        // stays gentle. The audio layer smooths each frame's target.
        audio.level(DOCK_MUSIC_LEVEL ** (1 - k));
        const view = Math.min(1, age / LIFT_VIEW_SECONDS);
        if (t === 1) {
          holdView();
          if (ctx.arcade) {
            pilot.releaseFrame(true);
            pilot.enterClose();
            if (rideView !== "first-person") pilot.exitClose();
            if (!actor.weapon.aiming) pilot.modeAction("mode-toggle");
          }
          pilot.controls.reset();
          const items = newItems();
          if (hasSeenGuide() && !items.length) { setPhase("ready"); stageGhost(); }
          else { overlay.setGuide(!hasSeenGuide(), items); setPhase("briefing"); pilot.freeCursor(); }
        }
        turnLiftView(view * view * (3 - 2 * view));
        if (t === 1 && phase === "ready") settleView();
      }
    };
    const platformSupport = (x, z, y, rise, radius) => {
      const p = platform.position, r = RADIUS + radius;
      return platform.visible && (x - p.x) ** 2 + (z - p.z) ** 2 <= r * r && p.y <= y + rise + 1e-5 ? p.y : -Infinity;
    };
    const supportAt = (x, z, y, rise, radius = 0.3) => Math.max(platformSupport(x, z, y, rise, radius),
      course && !held() ? course.supportAt(x, z, y, rise, radius) : -Infinity);
    const launchFromCloud = () => {
      const p = actor.root.position, feet = p.y - actor.baseY, radius = actor.bodyRadius || 0.3;
      let cloud = null, first = Infinity;
      for (const candidate of course.clouds) {
        if (candidate.kind === "normal") continue;
        const held = launchContacts[candidate.index];
        launchContacts[candidate.index] = Number.isFinite(course.touchTime(candidate, p.x, p.z, feet, actor.bodyHeight, radius)) ? 1 : 0;
        if (held) continue;
        const time = course.touchTime(candidate, p.x, p.z, feet, actor.bodyHeight, radius,
          beforeStep.x, beforeStep.z, beforeStep.y - actor.baseY);
        if (time < first) { cloud = candidate; first = time; }
      }
      if (!cloud) return;
      const bounce = cloud.kind === "bounce";
      crew.elevate(0);
      p.y += LAUNCH_CLEARANCE; actor.hop += LAUNCH_CLEARANCE;
      actor.hopV = bounce ? BOUNCE_RISE : BOOST_RISE;
      actor.jumps = 1;
      actor.leap.vx = bounce ? 0 : cloud.boostX * BOOST_SPEED;
      actor.leap.vz = bounce ? 0 : cloud.boostZ * BOOST_SPEED;
      actor.leap.land = 0; actor.leap.thrown = actor.leap.rageThrown = false;
      audio.jump();
    };
    const postUpdate = () => {
      // Swept up by a tornado, the Ooga spins round over its top behind the DQ card too, until a replay or exit.
      if (swept >= 0) { sweepStep(); return; }
      if (phase !== "ready" && phase !== "running") return;
      const p = actor.root.position, feet = p.y - actor.baseY;
      if (phase === "ready" && (actor.hop > 0.02 || actor.hopV > 0.02 || Math.abs(feet - platform.position.y) > 0.08
        || platformSupport(p.x, p.z, feet, 0.04, 0.3) === -Infinity)) {
        startedAt = raceNow(); courseDrift = course.start();
        if (scoreTicket) ghost.begin(actor, runnerName);
        setPhase("running");
      }
      if (phase === "running") {
        seconds = (raceNow() - startedAt) / 1000; overlay.update(seconds);
        if (feet <= ctx.seaY) { finish(false); return; }
        if (actor.hop === 0 && actor.hopV <= 0) {
          const top = ctx.pileSurface(p.x, p.z, feet + 1e-6, 0, 0.3);
          if (Number.isFinite(top) && Math.abs(feet - top) < 1e-6) { finish(true); return; }
        }
        launchFromCloud();
        ghost.record(seconds, actor); ghost.update(seconds);
      }
      // Refill before retiring an empty pack, preserving its equipped state
      // even when the pickup arrives on the frame its last fuel was spent.
      const pickup = course.pickupAt(p.x, feet, p.z, actor.bodyHeight, wants);
      if (pickup) {
        if (pickup.kind === "jetpack") {
          const refill = actor.jetpackOwned;
          if (!refill) crew.setJetpackOwnership(actor, true, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
          actor.jetFuel = 1; actor.jetRecovering = false;
          pilot.showAct(); hud.toast(refill ? "Jetpack refilled" : "Jetpack collected · J to equip");
        } else {
          // Another X-ray goggles refresh it to full; a feather or a hook is taken only with none held.
          if (pickup.kind === "xray") { xrayUntil = seconds + XRAY_SECONDS; xrayWarned = false; wearGoggles(true); }
          else if (pickup.kind === "updraft") feather = true;
          else { hookHeld = true; hookAt = HAND; hookDown = false; }
          audio.power(pickup.kind); hud.toast(PICKUP_TOAST[pickup.kind]);
        }
        for (let i = 0; i < pickupNodes.length; i++) if (!course.pickups[i].active) pickupNodes[i].visible = false;
      }
      const xrayLeft = phase === "running" && xrayUntil > seconds ? xrayUntil - seconds : -1;
      if (!xrayWarned && xrayLeft >= 0 && xrayLeft <= 2) { audio.xrayEnding(); xrayWarned = true; }
      if (xrayLeft < 0 && goggles) wearGoggles(false);
      overlay.setPowers(xrayLeft >= 0 ? Math.ceil(xrayLeft) : -1, feather, hookHeld ? hookAt === HAND ? 0 : 1 : -1);
      updateGust(); placeHook();
      if (actor.jetpackOwned && actor.jetFuel <= 0) {
        crew.setJetpackOwnership(actor, false); actor.jetRecovering = false;
        pilot.showAct(); hud.toast("Jetpack empty");
      }
      audio.jet(!!actor.jet?.thrust && actor.jet.power > 0 && actor.jetFuel > 0);
      if (phase === "running" && actor.hopV < 0) {
        const speed = BL.pilot.WALK.speed * BL.pilot.WALK.run + Math.hypot(actor.leap.vx, actor.leap.vz);
        // A feather held is one more upward kick, counted with the air jump as one reset as tall as both.
        const jump = Math.hypot(actor.jumps < 2 ? BL.crew.JUMP_SPEED : 0, feather ? UPDRAFT_RISE : 0);
        const tank = actor.traits.jetTank > 0 ? actor.traits.jetTank : 1;
        const jetSeconds = actor.jetpackOwned ? actor.jetFuel * BL.crew.JET_FUEL_SECONDS * tank : 0;
        if (whirled || hookReach() || course.canRecover(p.x, feet, p.z, actor.hopV, speed, jump, ctx.seaY,
          jetSeconds, BL.crew.JET_ACCEL, BL.crew.JET_RISE, actor.bodyHeight)) unrecoverableAt = -1;
        else {
          // Keep control briefly beyond the reach envelope. A recovered
          // trajectory starts a fresh grace period if it later becomes hopeless.
          if (unrecoverableAt < 0) unrecoverableAt = seconds;
          if (seconds - unrecoverableAt >= RECOVERY_GRACE_SECONDS) finish(false);
        }
      } else unrecoverableAt = -1;
    };
    // Which pickups the rider takes now: a jetpack and X-ray always (a full tank or goggles worn just stay full), a
    // feather or a hook only with none held.
    const wants = (kind) => kind === "updraft" ? !feather : kind === "hook" ? !hookHeld : true;
    // The Ooga's chest, where the rope starts.
    const chest = () => {
      const p = actor.root.position;
      hookChest.x = p.x; hookChest.y = p.y - actor.baseY + actor.bodyHeight * 0.6; hookChest.z = p.z;
      return hookChest;
    };
    // Where the crosshair points, from the Ooga's chest on (so nothing behind it is aimed at): the cloud in the hook's
    // reach it lands on, in `aimHit`, or false.
    const aim = () => {
      const size = ctx.renderer.size, c = chest();
      ctx.renderer.ray(size.width / 2, size.height / 2, camera, aimRay);
      const along = Math.max(0, (c.x - aimRay.ox) * aimRay.dx + (c.y - aimRay.oy) * aimRay.dy + (c.z - aimRay.oz) * aimRay.dz);
      const ox = aimRay.ox + aimRay.dx * along, oy = aimRay.oy + aimRay.dy * along, oz = aimRay.oz + aimRay.dz * along;
      return course.hit(ox, oy, oz, aimRay.dx, aimRay.dy, aimRay.dz, HOOK_RANGE + 10, aimHit)
        && Math.hypot(aimHit.x - c.x, aimHit.y - c.y, aimHit.z - c.z) <= HOOK_RANGE;
    };
    // The hook's button (the mouse's left button in combat, a pad's RT, the touch chip): pressed, it throws the hook
    // at the cloud under the crosshair, or out to its full reach on a miss; let go, a biting hook lets go and reels in.
    // Every press during a run is the hook's, so the empty-handed Ooga never swings at the air.
    const hookAction = (down) => {
      if (!playing()) return false;
      if (phase !== "ready" && phase !== "running") return true;
      if (!down) {
        hookDown = false;
        if (hookHeld && hookAt === BIT) letGo();
        return true;
      }
      hookDown = true;
      if (!hookHeld || hookAt !== HAND) return true;
      const c = chest();
      Object.assign(hookTip, c);
      if (aim()) {
        hookCloud = aimHit.cloud;
        hookBite.x = aimHit.x - hookCloud.x; hookBite.y = hookCloud.top - aimHit.y; hookBite.z = aimHit.z - hookCloud.z;
      } else {
        hookCloud = null;
        const along = Math.max(0, (c.x - aimRay.ox) * aimRay.dx + (c.y - aimRay.oy) * aimRay.dy + (c.z - aimRay.oz) * aimRay.dz) + HOOK_RANGE;
        hookEnd.x = aimRay.ox + aimRay.dx * along; hookEnd.y = aimRay.oy + aimRay.dy * along; hookEnd.z = aimRay.oz + aimRay.dz * along;
      }
      hookAt = OUT; audio.hookThrow();
      return true;
    };
    const letGo = () => { hookAt = REEL; hookCloud = null; audio.hookRelease(); };
    // Moves the hook's head `step` metres toward a point; true once it is there.
    const hookToward = (x, y, z, step) => {
      const dx = x - hookTip.x, dy = y - hookTip.y, dz = z - hookTip.z, d = Math.hypot(dx, dy, dz);
      if (d <= step) { hookTip.x = x; hookTip.y = y; hookTip.z = z; return true; }
      hookTip.x += dx / d * step; hookTip.y += dy / d * step; hookTip.z += dz / d * step;
      return false;
    };
    // Before the crew moves: the hook flies, bites, pulls the Ooga toward its bite while the button is held, and
    // reels back once it lets go, the Ooga keeping its speed and the crew's air drag easing it.
    const updateHook = (dt) => {
      if (hookAt === HAND) return;
      if (hookAt === REEL) {
        const c = chest();
        if (hookToward(c.x, c.y, c.z, HOOK_REEL * dt)) hookAt = HAND;
        return;
      }
      if (hookCloud && !hookCloud.active) { letGo(); return; }
      if (hookAt === OUT) {
        if (!hookCloud) {
          if (hookToward(hookEnd.x, hookEnd.y, hookEnd.z, HOOK_FLY * dt)) {
            // A miss: the hook is gone.
            hookHeld = false; hookAt = HAND; audio.hookLost(); hud.toast("Hook lost");
          }
          return;
        }
        if (!hookToward(hookCloud.x + hookBite.x, hookCloud.top - hookBite.y, hookCloud.z + hookBite.z, HOOK_FLY * dt)) return;
        hookAt = BIT; hookPull = 0; audio.hookHit();
        // Let go before it bit: it lets go at once.
        if (!hookDown) { letGo(); return; }
        actor.jumps = 1;
      }
      hookTip.x = hookCloud.x + hookBite.x; hookTip.y = hookCloud.top - hookBite.y; hookTip.z = hookCloud.z + hookBite.z;
      // Pulled to stand just over the cloud's top at the bite, slowing over the last metres.
      const p = actor.root.position, feet = p.y - actor.baseY;
      const dx = hookTip.x - p.x, dy = hookCloud.top + 0.8 - feet, dz = hookTip.z - p.z, d = Math.hypot(dx, dy, dz);
      hookPull += dt;
      if (d < HOOK_ARRIVE || hookPull > HOOK_PULL_SECONDS) { letGo(); return; }
      const speed = Math.min(HOOK_PULL, d * 5) / d;
      if (actor.hop < 0.001) { crew.elevate(0); p.y += LAUNCH_CLEARANCE; actor.hop += LAUNCH_CLEARANCE; }
      actor.leap.vx = dx * speed; actor.leap.vz = dz * speed;
      actor.hopV = actor.hop <= LAUNCH_CLEARANCE ? Math.max(dy * speed, 4) : dy * speed;
      actor.leap.land = 0; actor.leap.thrown = actor.leap.rageThrown = false;
    };
    // After the crew moves: the rope from the chest to the hook's head, and the head pointing along it.
    const placeHook = () => {
      const out = hookHeld && hookAt !== HAND;
      rope.visible = hookNode.visible = out;
      if (!out) return;
      const c = chest(), dx = hookTip.x - c.x, dy = hookTip.y - c.y, dz = hookTip.z - c.z;
      const length = Math.hypot(dx, dy, dz), yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
      rope.position.x = c.x; rope.position.y = c.y; rope.position.z = c.z;
      rope.rotation.x = hookNode.rotation.x = pitch; rope.rotation.y = hookNode.rotation.y = yaw;
      rope.scale.z = Math.max(0.01, length);
      hookNode.position.x = hookTip.x; hookNode.position.y = hookTip.y; hookNode.position.z = hookTip.z;
    };
    // A tornado down near the Ooga takes it: lifted off whatever it stands on, drawn in, round and up, harder the nearer
    // it comes, all of it easing as the tornado dies, until it does or the Ooga steers out past `WHIRL_LET_GO`; it
    // keeps the speed it has when let go. Its grip eases the Ooga's flight toward the whirl's, so speed brought in
    // carries on a while. A hook biting a cloud holds it out of the whirl, and a run is never lost while it is whirled,
    // at its wall or through it, unless it is wholly inside the funnel `SWEPT_DWELL` s on end (`sweep`).
    const whirlOoga = () => {
      if (swept >= 0) return;
      if (!tornado.down || hookAt === BIT || phase !== "running") { whirled = false; engulfed = 0; return; }
      const p = actor.root.position, feet = p.y - actor.baseY;
      tornado.axisAt(feet, whirlAxis);
      const dx = p.x - whirlAxis.x, dz = p.z - whirlAxis.z, r = Math.max(0.1, Math.hypot(dx, dz)), side = tornado.radiusAt(feet);
      if (feet > tornado.top - 4 || feet < tornado.bottom || side <= 0 || r > side + (whirled ? WHIRL_LET_GO : WHIRL_TAKE)) { whirled = false; engulfed = 0; return; }
      const s = tornado.strength;
      engulfed = r + (actor.bodyRadius || 0.3) < side ? engulfed + stepTime : 0;
      if (engulfed >= SWEPT_DWELL) { engulfed = 0; sweep(dx, dz, r); return; }
      whirled = true;
      // Inside its wall the pull grows a little more toward the core while the spin holds at its wall's.
      const k = Math.max(0, 1 - (r - side) / WHIRL_TAKE), pull = WHIRL_PULL * s * Math.min(1.25, k) ** 2, spin = WHIRL_SPIN * s * (0.35 + 0.65 * Math.min(1, k));
      if (actor.hop < 0.001) { crew.elevate(0); p.y += LAUNCH_CLEARANCE; actor.hop += LAUNCH_CLEARANCE; }
      // Its grip, harder the nearer and stronger it is, eases the flight toward the whirl's. The crew's air drag eases it
      // toward rest afterwards, so the grip aims past the whirl's by as much and the two settle on it together.
      const grip = Math.max(0.05, WHIRL_GRIP * s * Math.min(1, k) ** 2), drag = BL.pilot.WALK.ledgeDrag;
      const hold = 1 - Math.exp(-grip * stepTime), aim = (grip + drag) / grip;
      actor.leap.vx += ((-dz / r * spin - dx / r * pull + tornado.vx * s) * aim - actor.leap.vx) * hold;
      actor.leap.vz += ((dx / r * spin - dz / r * pull + tornado.vz * s) * aim - actor.leap.vz) * hold;
      actor.hopV = Math.max(actor.hopV, WHIRL_LIFT * s * k);
      actor.jumps = 1; actor.leap.land = 0; actor.leap.thrown = actor.leap.rageThrown = false;
    };
    // Engulfed: the controls let go, a hook out lets go too, and the view starts from where it stood and draws back on
    // its own side of the funnel. `r` is how far the Ooga stood from the axis, from where it is drawn in.
    const sweep = (dx, dz, r) => {
      const p = actor.root.position;
      swept = 0; sweptAngle = Math.atan2(dz, dx); sweptFrom = p.y - actor.baseY; sweptR = r; sweptTilt = 0; whirled = true;
      sweptSide = Math.atan2(camera.position.z - whirlAxis.z, camera.position.x - whirlAxis.x);
      if (hookHeld && hookAt !== HAND) letGo();
      hookDown = false;
      pilot.setActive(false); pilot.controls.reset();
      Object.assign(sweptCamPos, camera.position); Object.assign(sweptCamTarget, camera.target); Object.assign(sweptOrigin, actor.root.position);
      Object.assign(sweptEye, camera.position); Object.assign(sweptLook, p); Object.assign(sweptAim, p);
      tornado.hold(true);
      audio.tornadoForm(0);
    };
    // Each frame swept up, after the crew moved (its moves are overwritten), on behind the DQ card: whirled up the core,
    // spinning, and widening near the top to circle round inside it, where it is kept spinning and tumbling, bobbing.
    const sweepStep = () => {
      const dt = stepTime, p = actor.root.position, top = tornado.top;
      swept += dt;
      actor.hop = 10; actor.hopV = 0; actor.leap.vx = actor.leap.vz = 0;
      const u = Math.min(1, swept / SWEPT_CLIMB), out = Math.max(0, Math.min(1, (u - 0.7) / 0.3)), ring = out * out * (3 - 2 * out);
      const feet = sweptFrom + (top - SWEPT_SINK - sweptFrom) * u * u * (3 - 2 * u) + Math.sin(swept * 2.2) * 0.4 * ring;
      // Drawn in from where it was engulfed to a metre off the axis, turning no faster there than the whirl carried it.
      const drawn = Math.min(1, swept / SWEPT_DRAW), base = sweptR + (1 - sweptR) * drawn * drawn * (3 - 2 * drawn);
      const radius = base + (SWEPT_RING - base) * ring, spin = (12 + (SWEPT_SPIN - 12) * ring) * Math.min(1, 1 / base);
      tornado.axisAt(feet, whirlAxis);
      sweptAngle += dt * spin;
      p.x = whirlAxis.x + Math.cos(sweptAngle) * radius; p.y = feet + actor.baseY; p.z = whirlAxis.z + Math.sin(sweptAngle) * radius;
      actor.root.rotation.y += dt * (20 - 6 * ring); actor.root.rotation.x = Math.sin(swept * 5) * 0.6; actor.root.rotation.z = Math.sin(swept * 9) * 0.5;
      // The view draws back out of the funnel on its own side and rises after the Ooga, never up to the top, so it
      // turns up to follow it up the core; once it circles the view holds on the middle of its ring.
      const eyeY = Math.min(feet - SWEPT_BEHIND, top - SWEPT_UNDER), away = tornado.radiusAt(eyeY) + SWEPT_OUT, k = Math.min(1, dt * 4);
      tornado.axisAt(eyeY, sweptAxis);
      sweptEye.x += (sweptAxis.x + Math.cos(sweptSide) * away - sweptEye.x) * k;
      sweptEye.y += (eyeY - sweptEye.y) * k;
      sweptEye.z += (sweptAxis.z + Math.sin(sweptSide) * away - sweptEye.z) * k;
      // Aimed a little over it, so it rides low in the frame, clear of the clock; behind the DQ card, which covers the
      // middle of the screen, tilted up further so it rides at 75% of the screen's height, as the fall into the water does.
      const tilt = Math.atan(0.5 * Math.tan(camera.fov * 0.5)), mix = sweptTilt / tilt;
      sweptTilt += ((phase === "running" ? 0 : tilt) - sweptTilt) * Math.min(1, dt * 3);
      const ax = p.x + (whirlAxis.x - p.x) * ring, az = p.z + (whirlAxis.z - p.z) * ring, reach = Math.hypot(ax - sweptEye.x, az - sweptEye.z);
      const ay = (p.y + 3) * (1 - mix) + (feet + actor.bodyHeight * 0.5) * mix;
      // Never so high that the frame's top edge looks over the funnel's near rim: the view sees tornado, not past it.
      tornado.axisAt(top, sweptAxis);
      const rim = Math.max(1, Math.hypot(sweptAxis.x - sweptEye.x, sweptAxis.z - sweptEye.z) - tornado.radiusAt(top) * 1.15);
      const pitch = Math.min(Math.atan2(ay - sweptEye.y, reach) + sweptTilt, Math.atan2(top - sweptEye.y, rim) - camera.fov * 0.5);
      sweptAim.x = ax; sweptAim.z = az;
      sweptAim.y = sweptEye.y + reach * Math.tan(pitch);
      if (phase === "running" && swept >= SWEPT_CLIMB + SWEPT_HOLD) finish(false, "tornado");
    };
    // Whether a tornado's funnel holds the Ooga or stands between it and the eye, where the hub shows its outline
    // through it: points from the Ooga's middle back along the sight line, short of the eye, tested against the funnel.
    const hiddenByTornado = () => {
      if (!actor || !level.sky?.tornado || !tornado.active) return false;
      const p = actor.root.position, e = camera.position, mid = p.y - actor.baseY + actor.bodyHeight * 0.5;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12 * 0.9, x = p.x + (e.x - p.x) * t, y = mid + (e.y - mid) * t, z = p.z + (e.z - p.z) * t;
        tornado.axisAt(y, insideAxis);
        // Its slabs' ragged rims reach a little past its radius.
        if (Math.hypot(x - insideAxis.x, z - insideAxis.z) < tornado.radiusAt(y) * 1.15) return true;
      }
      return false;
    };
    // Replay or exit after a sweep: the Ooga back as it was and the pilot's view rebased, as after a fall.
    const endSweep = () => {
      if (swept < 0) return;
      actor.root.visible = true; actor.root.rotation.x = actor.root.rotation.z = 0;
      tornado.hold(false);
      Object.assign(camera.position, sweptCamPos); Object.assign(camera.target, sweptCamTarget);
      BL.math.mat4.identity(fallViewShift);
      fallViewShift[12] = actor.root.position.x - sweptOrigin.x;
      fallViewShift[13] = actor.root.position.y - sweptOrigin.y;
      fallViewShift[14] = actor.root.position.z - sweptOrigin.z;
      pilot.transformView(fallViewShift, 0);
      swept = -1;
    };
    // A hook held saves a fall while any cloud stands in its reach, since its pull outruns gravity.
    const hookReach = () => {
      if (!hookHeld) return false;
      if (hookAt === BIT) return true;
      const c = chest();
      for (const cloud of course.clouds) {
        if (cloud.active && Math.hypot(cloud.x - c.x, cloud.top - c.y, cloud.z - c.z) <= HOOK_RANGE + Math.min(cloud.rx, cloud.rz)) return true;
      }
      return false;
    };
    // The sky feather, on a Space press with both jumps spent and no worn pack (the crew's `spentJump`): a gust
    // throws the Ooga up, keeping its speed across.
    const updraft = (cave) => {
      if (cave !== actor || phase !== "running" || !feather || actor.jet) return false;
      feather = false; actor.hopV = UPDRAFT_RISE; gustAt = displayTime;
      audio.updraft();
      return true;
    };
    // The gust's leaves spiral up round the Ooga for under a second.
    const updateGust = () => {
      if (gustAt < 0) return;
      const age = displayTime - gustAt, on = age < 0.9, p = actor.root.position, feet = p.y - actor.baseY;
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i], a = i / leaves.length * TAU + age * 7, r = 0.5 + age * 1.1, k = 0.2 + 1.4 * (1 - age / 0.9);
        leaf.visible = on;
        if (!on) continue;
        leaf.position.x = p.x + Math.cos(a) * r; leaf.position.y = feet - 0.6 + age * 3.2 + (i % 4) * 0.25; leaf.position.z = p.z + Math.sin(a) * r;
        leaf.rotation.y = -a; leaf.rotation.z = age * 9 + i; leaf.scale.x = leaf.scale.y = leaf.scale.z = k;
      }
      if (!on) gustAt = -1;
    };
    // A cloud's outline on the overlay: its top's rim projected at 16 points, dashed or not.
    const outline = (c2, c, dash) => {
      c2.beginPath();
      let drawn = 0;
      for (let k = 0; k <= 16; k++) {
        const a = k / 16 * TAU, lx = Math.cos(a) * (c.rx + 0.2), lz = Math.sin(a) * (c.rz + 0.2);
        const q = ctx.renderer.project(c.x + lx * c.cosYaw + lz * c.sinYaw, c.top + 0.05, c.z - lx * c.sinYaw + lz * c.cosYaw, edge);
        if (!q) continue;
        if (drawn++) c2.lineTo(q.x, q.y); else c2.moveTo(q.x, q.y);
      }
      c2.setLineDash(dash); c2.stroke(); c2.setLineDash(NO_DASH);
    };
    // X-ray (plan 3.3): for the nearest clouds in reach, their solid time read from the schedule itself, a ring
    // emptying over 20 s with whole seconds in it (red and pulsing while it warns), a gold ∞ diamond on one that
    // never fades, a dashed ring and the time until it is back for one gone, and in haze a dashed outline round one
    // past where the fog begins. A label that would overlap another is left out.
    const drawXray = (c2) => {
      const p = actor.root.position, haze = level.sky?.fog, radius = haze ? XRAY_HAZE_RADIUS : XRAY_RADIUS, size = ctx.renderer.size;
      const cap = coarse || size.width < 600 ? 5 : 8, clouds = course.clouds;
      let count = 0, drawn = 0;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i], d = Math.hypot(c.x - p.x, c.top - p.y, c.z - p.z);
        if (d > radius) continue;
        let at = Math.min(count, cap);
        while (at > 0 && nearDistance[at - 1] > d) {
          if (at < cap) { nearIndex[at] = nearIndex[at - 1]; nearDistance[at] = nearDistance[at - 1]; }
          at--;
        }
        if (at < cap) { nearIndex[at] = i; nearDistance[at] = d; if (count < cap) count++; }
      }
      c2.save();
      // A thin cyan edge says it is on.
      c2.fillStyle = "rgba(64, 220, 255, 0.18)";
      c2.fillRect(0, 0, size.width, 6); c2.fillRect(0, size.height - 6, size.width, 6); c2.fillRect(0, 0, 6, size.height); c2.fillRect(size.width - 6, 0, 6, size.height);
      c2.textAlign = "center"; c2.textBaseline = "middle"; c2.lineJoin = "round";
      const pulse = 0.55 + 0.45 * Math.sin(displayTime * 12);
      for (let n = 0; n < count; n++) {
        const c = clouds[nearIndex[n]], s = course.solidLeft(c);
        const warning = c.phase === BL.cloudHopperCourse.WARNING || c.phase === BL.cloudHopperCourse.FADING;
        const color = s === Infinity ? "#ffd54a" : s <= 0 ? "#8aa0b8" : warning ? "#ff5a45" : s < 8 ? "#ffb23e" : "#5fe08a";
        if (haze && nearDistance[n] > haze[0] + 20) { c2.strokeStyle = color; c2.lineWidth = 2; outline(c2, c, HAZE_DASH); }
        const q = ctx.renderer.project(c.x, c.top + 1.2, c.z, screen);
        if (!q || q.x < 0 || q.x > size.width || q.y < 0 || q.y > size.height) continue;
        const x = Math.round(q.x), y = Math.round(q.y);
        let clear = true;
        for (let k = 0; k < drawn && clear; k++) if (Math.abs(drawnX[k] - x) < 30 && Math.abs(drawnY[k] - y) < 30) clear = false;
        if (!clear) continue;
        drawnX[drawn] = x; drawnY[drawn] = y; drawn++;
        if (s === Infinity) {
          c2.beginPath(); c2.moveTo(x, y - 15); c2.lineTo(x + 15, y); c2.lineTo(x, y + 15); c2.lineTo(x - 15, y); c2.closePath();
          c2.fillStyle = "rgba(40, 28, 6, 0.8)"; c2.fill(); c2.strokeStyle = "#ffd54a"; c2.lineWidth = 3; c2.stroke();
          c2.font = "bold 16px ui-monospace, monospace"; c2.fillStyle = "#ffe27a"; c2.fillText("∞", x, y + 1);
          continue;
        }
        c2.beginPath(); c2.arc(x, y, 13, 0, TAU); c2.fillStyle = "rgba(8, 18, 30, 0.72)"; c2.fill();
        c2.lineWidth = 4; c2.strokeStyle = "rgba(255,255,255,0.18)"; c2.stroke();
        c2.globalAlpha = warning ? pulse : 1;
        if (s > 0) { c2.beginPath(); c2.arc(x, y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s / 20)); c2.strokeStyle = color; c2.stroke(); }
        else { c2.setLineDash(RING_DASH); c2.beginPath(); c2.arc(x, y, 13, 0, TAU); c2.strokeStyle = color; c2.lineWidth = 2; c2.stroke(); c2.setLineDash(NO_DASH); }
        c2.globalAlpha = 1;
        c2.font = "bold 11px ui-monospace, monospace"; c2.fillStyle = s <= 0 ? "#b9c6d6" : "#ffffff";
        c2.fillText(s <= 0 ? BACK[Math.min(99, Math.ceil(-s))] : s > 99 ? "99+" : SECONDS[Math.ceil(s)], x, y + 0.5);
      }
      c2.restore();
    };
    const drawOverlay = (c2) => {
      ghost.drawName(c2);
      if (phase === "running") {
        if (xrayUntil > seconds) drawXray(c2);
      }
      // A hook in hand rings the cloud in reach under the crosshair in gold where it would bite.
      if (hookHeld && hookAt === HAND && (phase === "ready" || phase === "running") && aim()) {
        const q = ctx.renderer.project(aimHit.x, aimHit.y, aimHit.z, screen);
        if (q) {
          c2.save(); c2.lineWidth = 3;
          c2.strokeStyle = "rgba(20, 14, 8, 0.85)"; c2.beginPath(); c2.arc(q.x, q.y, 11, 0, TAU); c2.stroke();
          c2.strokeStyle = "#ffd54a"; c2.lineWidth = 2; c2.stroke();
          c2.restore();
        }
      }
      if (phase !== "lifting" && phase !== "ready" && phase !== "running") return;
      // Keep the finish readable from the clouds, anchored to the live pile
      // rather than the course's fixed camera-framing point.
      const point = ctx.renderer.project(liftGoal.x, ctx.pileTop() + 0.35, liftGoal.z, targetScreen);
      const size = ctx.renderer.size;
      if (!point || point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height) return;
      const x = Math.round(point.x), y = Math.round(point.y);
      c2.save();
      c2.strokeStyle = "rgba(20, 14, 8, 0.9)"; c2.lineWidth = 3; c2.lineJoin = "round";
      c2.textAlign = "center"; c2.textBaseline = "middle";
      c2.font = "bold 13px ui-monospace, monospace"; c2.fillStyle = "#ffe49a";
      c2.strokeText("BANANA PILE", x, y - 48);
      c2.fillText("BANANA PILE", x, y - 48);
      // How far the rider is from it, live, centred over the label.
      const a = actor.root.position, metres = METRES[Math.min(METRES.length - 1, Math.round(Math.hypot(liftGoal.x - a.x, ctx.pileTop() - (a.y - actor.baseY), liftGoal.z - a.z)))];
      c2.fillStyle = "#ffffff";
      c2.strokeText(metres, x, y - 65);
      c2.fillText(metres, x, y - 65);
      c2.font = "bold 11px ui-monospace, monospace"; c2.fillStyle = "#fff5d8";
      c2.strokeText("TOUCH TO FINISH", x, y - 31);
      c2.fillText("TOUCH TO FINISH", x, y - 31);
      c2.beginPath(); c2.moveTo(x - 7, y - 12); c2.lineTo(x, y - 4); c2.lineTo(x + 7, y - 12);
      c2.lineJoin = "round"; c2.lineCap = "round";
      c2.strokeStyle = "rgba(20, 14, 8, 0.9)"; c2.lineWidth = 6; c2.stroke();
      c2.strokeStyle = "#ffd96a"; c2.lineWidth = 3; c2.stroke();
      c2.restore();
    };
    const dispose = () => {
      cancel(); overlay.dispose(); ghost.dispose(); clearRoute(); scenery.dispose(); for (const t of tornadoes) t.dispose(); gust.dispose();
      audio.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      removeChild(root, routeRoot); removeChild(root, platform);
      phase = "idle"; actor = null;
    };
    const liveGeometry = (set) => {
      ghost.liveGeometry(set);
      set.add(rope.geometry); set.add(hookNode.geometry); for (const t of tornadoes) t.liveGeometry(set); gust.liveGeometry(set);
      set.add(leaves[0].geometry);
      for (const surface of boostNodes) if (surface) set.add(surface.geometry);
      for (const marker of bounceNodes) if (marker) for (const part of marker.children) set.add(part.geometry);
      for (const node of pickupNodes) for (const part of node.children) set.add(part.geometry);
    };
    const pickupLightsWanted = () => {
      if (!routeRoot.visible || !course) return 0;
      let count = 0;
      for (const p of course.pickups) if (p.active && p.y > ctx.seaY) count++;
      return count;
    };
    // The hub lights at most a couple of pickups: the nearest to the view, so a pickup close by is never left dark.
    const litIndex = new Int16Array(4), litDistance = new Float32Array(4);
    const pickupLights = (lights, offset, capacity) => {
      if (!routeRoot.visible || !course) return 0;
      const eye = camera.position, cap = Math.min(capacity, litIndex.length);
      let count = 0;
      for (let i = 0; i < course.pickups.length; i++) {
        const p = course.pickups[i];
        if (!p.active || p.y <= ctx.seaY) continue;
        const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
        let at = Math.min(count, cap);
        while (at > 0 && litDistance[at - 1] > d) { if (at < cap) { litIndex[at] = litIndex[at - 1]; litDistance[at] = litDistance[at - 1]; } at--; }
        if (at < cap) { litIndex[at] = i; litDistance[at] = d; if (count < cap) count++; }
      }
      for (let n = 0; n < count; n++) {
        const p = course.pickups[litIndex[n]], at = (offset + n) * 8, pulse = 0.92 + Math.sin((displayTime + p.index * 2) * 2.4) * 0.08, tint = PICKUP_LIGHT[p.kind];
        // Soft uplight grounds the pickup on its cloud; the pack's material
        // fill keeps the upper tanks readable without a blue hotspot.
        lights[at] = p.x; lights[at + 1] = p.y - 0.3; lights[at + 2] = p.z; lights[at + 3] = 2.4;
        lights[at + 4] = tint[0] * pulse; lights[at + 5] = tint[1] * pulse; lights[at + 6] = tint[2] * pulse; lights[at + 7] = 0;
      }
      return count;
    };
    const controlsHelpHold = on => {
      helpHeld = on; onVisibility();
      if (hookDown) hookAction(false);
    };
    const controlsHelp = touch => {
      if (held()) return { title: "Cloud Hopper · " + (phase === "lifting" ? "Riding the lift" : "Waiting"), rows: [BL.controlsHelp.row(touch ? [] : BL.controls.shortcutKeys("escape"), "Exit Cloud Hopper", touch ? "Exit button" : "")] };
      const H = BL.controlsHelp, rows = [touch ? H.row([], "Move", "Left stick") : H.movement("Move")];
      if (!touch) rows.push(H.row(["shiftleft"], "Run"));
      rows.push(H.row(touch ? [] : [" "], "Jump / use a sky feather", touch ? "Jump button" : ""));
      if ((pilot.player?.jetpackOwned || pilot.player?.jet)) rows.push(H.row(touch ? [] : BL.controls.shortcutKeys("jetpack"), "Wear / remove collected jetpack; hold jump to climb", touch ? "Jetpack button" : ""));
      if (hookHeld) rows.push(H.row([], "Aim at a cloud and hold to reel in; release to fly on", touch ? "Hook button" : "Left mouse"));
      if (!touch && !held()) rows.push(H.row(BL.controls.shortcutKeys("resetView"), "Reset camera"));
      rows.push(H.row(touch ? [] : BL.controls.shortcutKeys("escape"), "Exit Cloud Hopper", touch ? "Exit button" : ""));
      return { title: "Cloud Hopper", rows };
    };
    return { controlsHelp, controlsHelpHold, platform, cabinet, action, launch, near, exit, cancel, preUpdate, postUpdate, onJump, updraft, hookAction, fallView, supportAt, dispose, liveGeometry, pickupLightsWanted, pickupLights, drawOverlay,
      get active() { return active(); }, get playing() { return playing(); }, get held() { return held(); },
      get actor() { return actor; }, get phase() { return phase; }, get time() { return seconds; },
      get course() { return course; }, get start() { return start; }, get level() { return level; },
      // The level's fixed sky, which the hub samples instead of its clock while a run plays, and its lightning now.
      get sky() { return level.sky; }, get flash() {
        if (!playing()) return 0;
        let flash = scenery.flash;
        for (const t of tornadoes) flash = Math.max(flash, t.flash);
        return flash;
      },
      // The power-ups held now, for debugging.
      get powers() { return { xray: Math.max(0, xrayUntil - seconds), feather, hook: hookHeld ? HOOK_NAMES[hookAt] : "" }; },
      // Thunderhead's tornado that matters now, all of them, and whether one has the Ooga, for debugging.
      get tornado() { return tornado; }, get tornadoes() { return tornadoes; }, get whirled() { return whirled; }, get swept() { return swept; }, get hiddenByTornado() { return hiddenByTornado(); },
      // Aurora Heights' gust and how fast it slides a planted Ooga, for debugging.
      get gust() { return gust; }, get slide() { return Math.hypot(slideX, slideZ); },
      get bound() { return Math.hypot(start.x, start.z) + 80; } };
  };
  BL.cloudHopper = { create, LIFT_SECONDS };
})();
