// The dock's travelling arcade cloud and its solo descent. The hub owns island physics and visibility.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const RADIUS = 4.5, DEPTH = 2.5;
  const LIFT_SECONDS = 6, LIFT_VIEW_SECONDS = 1.5, DOCK_LENGTH = 4;
  const START_VIEW = { height: 6, distance: 18 };
  const BOOST_SPEED = 28, BOOST_RISE = 4, BOUNCE_RISE = 22, LAUNCH_CLEARANCE = 0.04;
  const RECOVERY_GRACE_SECONDS = 0.75, DOCK_MUSIC_LEVEL = 0.28, WARNING_THIN = 0.32;
  const GUIDE_KEY = "ooga-cloud-hopper-guide-v1";
  let guideSeen = false;
  const hasSeenGuide = () => {
    if (!guideSeen) {
      try { guideSeen = sessionStorage.getItem(GUIDE_KEY) === "1"; } catch (_) { /* The page-session flag still works without storage. */ }
    }
    return guideSeen;
  };
  // A warning thins its cloud in a dithered pulse that quickens from 2 to 6 a second as its time runs out.
  // It starts and ends at full opacity, and support stays whole throughout.
  const thinning = (progress, seconds) => WARNING_THIN * (0.5 - 0.5 * Math.cos(Math.PI * 2 * seconds * progress * (2 + 2 * progress)));
  // Page-session results survive hub visits, but never mix different signed-in players.
  // Each keeps per level its runs, ten best times, best ghost and last seed, and which level it played last; the
  // four players who played longest ago go first, which bounds the ghosts a page holds.
  const sessions = new Map(), SCORE_LIMIT = 10, SESSION_PLAYERS = 4, LEVELS = BL.cloudHopperLevels.LEVELS;
  const create = (ctx) => {
    const { root, dock, crew, pilot, hud, camera, game } = ctx;
    const ux = Math.cos(dock.rotation.y), uz = -Math.sin(dock.rotation.y);
    const home = { x: dock.position.x + ux * (DOCK_LENGTH + RADIUS - 0.25), y: dock.position.y, z: dock.position.z + uz * (DOCK_LENGTH + RADIUS - 0.25) };
    const length = Math.hypot(home.x, home.z), nx = home.x / length, nz = home.z / length;
    const start = { x: 0, y: 0, z: 0 };
    let level = LEVELS[0], player = "", farBefore = 0;
    const heading = Math.atan2(-nx, -nz), platform = createNode({ sightHidden: true });
    const cloud = BL.cloudHopperModels.cloud(RADIUS, RADIUS, DEPTH);
    const cabinet = BL.cloudHopperModels.cabinet();
    cabinet.position.x = nx * 1.5; cabinet.position.z = nz * 1.5; cabinet.rotation.y = heading;
    addChild(platform, cloud, cabinet); addChild(root, platform);
    Object.assign(platform.position, home);
    const routeRoot = createNode({ visible: false, sightHidden: true });
    addChild(root, routeRoot);
    const from = { x: 0, y: 0, z: 0 }, carry = { x: 0, y: 0, z: 0 };
    const liftGoal = { x: 0, y: 0, z: 0 }, ghostStart = { x: 0, y: 0, z: 0 };
    const targetScreen = { x: 0, y: 0, depth: 0 };
    let phase = "idle", actor = null, saved = null, course = null, age = 0, startedAt = 0, seconds = 0, displayTime = 0;
    let session = null, latest = null, run = 0, courseSeed = 0, courseDrift = 0;
    let unrecoverableAt = -1;
    let runnerName = "", dockMusicOn = false, scoreTicket = null, unwatchScores = null;
    // Rendering and player physics pause in a hidden tab. Keep the race's
    // wall clock on that same timeline while the soundtrack plays on.
    let hiddenAt = document.hidden ? performance.now() : -1, hiddenTime = 0;
    const raceNow = () => (hiddenAt < 0 ? performance.now() : hiddenAt) - hiddenTime;
    const onVisibility = () => {
      if (document.hidden) {
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
      onGuideDone: () => finishGuide(), onSelect: (id) => selectLevel(id), onNext: () => nextLevel(), letterSign: hud.letterSign });
    const ghost = BL.cloudHopperGhost.create({ root, renderer: ctx.renderer });
    const audio = BL.cloudHopperAudio.create();
    // Design review only: candidate looks on a debug page that asks for them (cloud-hopper-looks.js).
    const looks = BL.cloudHopperLooks ? BL.cloudHopperLooks.create({ root, camera, renderer: ctx.renderer }) : null;
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
      // Only this player's best on this level and course version races alongside.
      const best = played().best;
      ghost.play(best?.courseVersion === level.courseVersion ? best : null, ghostStart, heading);
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
      looks?.clear();
      course = null; routeRoot.visible = false;
    };
    const moveRider = () => {
      const p = platform.position;
      carry.x = p.x - nx * 1.25; carry.y = p.y; carry.z = p.z - nz * 1.25;
      ctx.move(carry, heading);
    };
    const turnLiftView = (mix) => {
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
      cabinet.visible = next === "idle" || next === "intro";
      pilot.setActive(!held());
      overlay.show(next, seconds, session && played().scores, latest);
      looks?.intro(next === "intro");
      audio.stage(next === "won" && latest?.run === played().scores[0]?.run ? "best" : next);
      audio.level(next === "intro" || next === "lifting" ? DOCK_MUSIC_LEVEL : 1, 0.8);
      if (next === "intro") audio.unlock();
    };
    const finishGuide = () => {
      if (phase !== "briefing") return;
      guideSeen = true;
      try { sessionStorage.setItem(GUIDE_KEY, "1"); } catch (_) { /* Keep completion for this page session. */ }
      // A key held while reading must not move the rider off the start cloud.
      pilot.controls.reset();
      setPhase("ready");
      // Close views regain their active camera solver after the held tips.
      if (pilot.view === "first-person" || pilot.view === "shoulder") turnLiftView(1);
      stageGhost();
    };
    const restoreEquipment = () => {
      if (!saved || !actor) return;
      crew.removeJetpack(actor);
      crew.setJetpackOwnership(actor, saved.jetOwned, actor.jetpackGeometry, actor.jetpackFlameGeometry);
      actor.jetFuel = saved.fuel; actor.jetRecovering = saved.recovering;
      if (saved.jetWorn) crew.wearJetpack(actor, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
      actor.weapon.primaryOwned = saved.primary; actor.weapon.secondaryOwned = saved.secondary;
      crew.selectWeapon(saved.slot, actor);
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
    const showLevels = () => overlay.setLevels({ selected: level.id, unlocked: opened(),
      bests: LEVELS.map((each) => game.cloudHopperBest(player, each.id)) });
    // The cards choose on the intro and on the result card's Level select; the run places its own start.
    const selectLevel = (id) => {
      if (phase !== "intro" && phase !== "won" && phase !== "dq") return;
      level = LEVELS[id - 1]; showLevels();
    };
    const nextLevel = () => {
      if (phase !== "won" || level.id >= opened()) return;
      level = LEVELS[level.id]; beginRun();
    };
    const launch = () => {
      if (active()) return false;
      const cave = pilot.player;
      if (!cave || cave !== crew.player) { hud.toast("Choose an Ooga and walk onto the Cloud Hopper cloud"); return false; }
      if (!near(cave.root.position.x, cave.root.position.y - cave.baseY + 1.1, cave.root.position.z)) return false;
      const refusal = ctx.refusal();
      if (refusal) { hud.toast(refusal); return false; }
      actor = cave;
      const login = BL.net.state.me?.login || "";
      runnerName = login || cave.traits.name; player = login.toLowerCase();
      session = sessions.get(login);
      if (!session) {
        session = { levels: LEVELS.map(() => ({ runs: 0, scores: [], best: null, lastSeed: null })), lastLevel: 0 };
        sessions.set(login, session);
        if (sessions.size > SESSION_PLAYERS) sessions.delete(sessions.keys().next().value);
      }
      level = LEVELS[pickLevel() - 1]; showLevels();
      seconds = 0; latest = null; placeStart();
      unwatchScores = BL.highscores?.watch("cloud-hopper", (board) => overlay.setHighscores(board)) || null;
      setPhase("intro"); pilot.freeCursor();
      return true;
    };
    const beginRun = () => {
      const replay = phase === "won" || phase === "dq";
      if (phase !== "intro" && !replay || level.id > opened()) return false;
      const cave = actor;
      if (!cave || pilot.player !== cave || crew.player !== cave) { cancel(); return false; }
      const refusal = ctx.refusal();
      if (refusal) { hud.toast(refusal); return false; }
      if (!saved) saved = { jetOwned: cave.jetpackOwned, jetWorn: !!cave.jet, fuel: cave.jetFuel, recovering: cave.jetRecovering,
        primary: cave.weapon.primaryOwned, secondary: cave.weapon.secondaryOwned, slot: cave.weapon.equipped ? 2 : cave.weapon.primaryEquipped ? 1 : 0 };
      crew.selectWeapon(0, cave); cave.weapon.primaryOwned = cave.weapon.secondaryOwned = false;
      crew.setJetpackOwnership(cave, false); cave.jetFuel = 0; cave.jetRecovering = false;
      crew.clearProjectiles();
      endFall();
      clearRoute(true);
      audio.unlock();
      Object.assign(from, platform.position);
      liftViewMix = 0;
      const record = played();
      seconds = startedAt = 0; latest = null; run = ++record.runs; session.lastLevel = level.id; showLevels();
      scoreTicket = BL.highscores?.begin("cloud-hopper") || null;
      // Each attempt gets fresh clouds; the ghost keeps its original route.
      courseSeed = BL.math.randomInt(4294967296);
      if (courseSeed === record.lastSeed) courseSeed = (courseSeed + 1) >>> 0;
      record.lastSeed = courseSeed;
      placeStart();
      // Far starts keep the island in view.
      if (!farBefore) farBefore = camera.far;
      camera.far = Math.max(farBefore, Math.hypot(start.x - liftGoal.x, start.y - liftGoal.y, start.z - liftGoal.z) + 150);
      course = BL.cloudHopperCourse.create({ start, finish: liftGoal, mainlandRadius: ctx.mainlandRadius, seed: courseSeed,
        layout: level.layout, timing: level.timing, runSpeed: BL.pilot.WALK.speed * BL.pilot.WALK.run, jumpSpeed: BL.crew.JUMP_SPEED });
      overlay.setGhost(record.best?.courseVersion === level.courseVersion ? record.best.duration : null);
      for (const c of course.clouds) {
        const node = BL.cloudHopperModels.cloud(c.rx, c.rz, c.depth, c.kind, c.yaw);
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
        const node = BL.cloudHopperModels.jetpackPickup();
        node.position.x = p.x; node.position.y = p.y; node.position.z = p.z;
        BL.cloudHopperModels.updateJetpackPickup(node, camera, displayTime + p.index * 2);
        pickupNodes.push(node); addChild(routeRoot, node);
      }
      routeRoot.visible = true;
      looks?.build(course, start, liftGoal, cave);
      if (replay) Object.assign(platform.position, start);
      setPhase(replay ? "ready" : "lifting");
      if (!replay) ctx.mode(true);
      moveRider();
      if (replay) { stageGhost(); pilot.controls.reset(); turnLiftView(1); }
      return true;
    };
    const near = (x, y, z) => !active() && Math.abs(y - 1.1 - platform.position.y) < 0.45
      && Math.hypot(x - platform.position.x, z - platform.position.z) < RADIUS - 0.4;
    const finish = (won) => {
      seconds = (raceNow() - startedAt) / 1000;
      if (won) {
        const record = played();
        if (!record.best || record.best.courseVersion !== level.courseVersion || seconds < record.best.duration) {
          const recording = ghost.finish(seconds, actor);
          if (recording) {
            recording.seed = courseSeed; recording.driftTime = courseDrift;
            recording.level = level.id; recording.courseVersion = level.courseVersion;
            record.best = recording;
          }
        }
        // Saved in this browser, signed in or out, online or not: the player's best and the next level.
        const saved = game.recordCloudHopper(player, level.id, Math.round(seconds * 1000), LEVELS.length);
        latest = { time: seconds, run, username: runnerName, personalBest: saved.best, unlocked: saved.unlocked };
        showLevels();
        BL.highscores?.submit(scoreTicket, "cloud-hopper-1", Math.round(seconds * 1000));
        const scores = record.scores;
        let at = 0;
        while (at < scores.length && scores[at].time <= seconds) at++;
        if (at < SCORE_LIMIT) {
          scores.splice(at, 0, latest);
          if (scores.length > SCORE_LIMIT) scores.length = SCORE_LIMIT;
        }
      }
      if (!won) {
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
      scoreTicket = null;
      setPhase(won ? "won" : "dq");
      pilot.freeCursor();
    };
    // Exits and scene changes park at the dock before the hub can release its actor.
    const cancel = (keepMusic = false) => {
      unwatchScores?.(); unwatchScores = null; scoreTicket = null;
      if (farBefore) { camera.far = farBefore; farBefore = 0; }
      if (!active()) {
        if (!keepMusic) { audio.stop(); dockMusicOn = false; }
        return;
      }
      const park = playing();
      endFall();
      pilot.releaseFrame(true);
      cabinet.visible = true;
      if (park) ctx.mode(false);
      clearRoute(keepMusic); phase = "idle";
      ghost.clear();
      if (park) {
        Object.assign(platform.position, home);
        if (pilot.player === actor && crew.player === actor) moveRider();
      }
      restoreEquipment(); actor = null; session = latest = null; runnerName = "";
      overlay.hide(); pilot.setActive(true); pilot.controls.reset();
    };
    const exit = () => {
      if (!active()) return false;
      cancel(true);
      audio.stage("dock"); audio.level(dockMusicLevel(), 0.8); dockMusicOn = true;
      return true;
    };
    const preUpdate = (dt) => {
      displayTime += dt;
      if (cabinet.visible) BL.cloudHopperModels.updateCabinet(cabinet, displayTime);
      if (!active()) { updateDockMusic(); return; }
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
      if (!course || phase === "won") return;
      Object.assign(beforeStep, actor.root.position); stepTime = dt;
      // Carry planted feet with the drifting, dissolving surface before ordinary gravity runs.
      let riding = null, oldTop = 0;
      const p = actor.root.position, feet = p.y - actor.baseY;
      if (!held() && actor.hop < 0.001 && actor.hopV <= 0 && !actor.jet?.thrust) {
        const contact = course.contactAt(p.x, p.z, feet);
        if (contact && Math.abs(feet - contact.top) < 0.06) { riding = contact; oldTop = contact.top; }
      }
      course.update(dt, phase === "running" ? (raceNow() - startedAt) / 1000 : undefined);
      // Lanes swing smoothly, so a planted rider rides the cloud's whole move however long the frame.
      if (riding) {
        p.x += riding.x - riding.previousX; p.z += riding.z - riding.previousZ;
        if (riding.top < oldTop) p.y += riding.top - oldTop;
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
        node.position.x += c.x - c.previousX; node.position.z += c.z - c.previousZ;
        node.smokeOpacity = opacity; node.visible = c.opacity > 0;
        const surface = boostNodes[i];
        if (surface) {
          surface.position.x = c.x; surface.position.y = c.y + 0.025; surface.position.z = c.z;
          surface.smokeOpacity = opacity; surface.visible = c.active;
          BL.cloudHopperModels.updateBoostSurface(surface, displayTime);
        }
        if (bounceNodes[i]) BL.cloudHopperModels.updateBounceMarker(bounceNodes[i], c, displayTime);
      }
      for (let i = 0; i < pickupNodes.length; i++) {
        const pickup = course.pickups[i], node = pickupNodes[i];
        node.visible = pickup.active && pickup.y > ctx.seaY;
        node.position.x = pickup.x; node.position.y = pickup.y; node.position.z = pickup.z;
        if (node.visible) BL.cloudHopperModels.updateJetpackPickup(node, camera, displayTime + i * 2);
      }
      looks?.update(dt, displayTime);
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
          pilot.controls.reset();
          if (hasSeenGuide()) { setPhase("ready"); stageGhost(); }
          else { setPhase("briefing"); pilot.freeCursor(); }
        }
        turnLiftView(view * view * (3 - 2 * view));
      }
    };
    const platformSupport = (x, z, y, rise, radius) => {
      const p = platform.position, r = RADIUS + radius;
      return (x - p.x) ** 2 + (z - p.z) ** 2 <= r * r && p.y <= y + rise + 1e-5 ? p.y : -Infinity;
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
      if (phase !== "ready" && phase !== "running") return;
      const p = actor.root.position, feet = p.y - actor.baseY;
      if (phase === "ready" && (actor.hop > 0.02 || actor.hopV > 0.02 || Math.abs(feet - platform.position.y) > 0.08
        || platformSupport(p.x, p.z, feet, 0.04, 0.3) === -Infinity)) {
        startedAt = raceNow(); courseDrift = course.start(); ghost.begin(actor, runnerName); setPhase("running");
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
      if ((!actor.jetpackOwned || actor.jetFuel < 1) && course.pickupAt(p.x, feet, p.z, actor.bodyHeight)) {
        const refill = actor.jetpackOwned;
        if (!refill) crew.setJetpackOwnership(actor, true, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
        actor.jetFuel = 1; actor.jetRecovering = false;
        pilot.showAct(); hud.toast(refill ? "Jetpack refilled" : "Jetpack collected · J to equip");
        for (let i = 0; i < pickupNodes.length; i++) if (!course.pickups[i].active) pickupNodes[i].visible = false;
      }
      if (actor.jetpackOwned && actor.jetFuel <= 0) {
        crew.setJetpackOwnership(actor, false); actor.jetRecovering = false;
        pilot.showAct(); hud.toast("Jetpack empty");
      }
      audio.jet(!!actor.jet?.thrust && actor.jet.power > 0 && actor.jetFuel > 0);
      if (phase === "running" && actor.hopV < 0) {
        const speed = BL.pilot.WALK.speed * BL.pilot.WALK.run + Math.hypot(actor.leap.vx, actor.leap.vz);
        const jump = actor.jumps < 2 ? BL.crew.JUMP_SPEED : 0;
        const tank = actor.traits.jetTank > 0 ? actor.traits.jetTank : 1;
        const jetSeconds = actor.jetpackOwned ? actor.jetFuel * BL.crew.JET_FUEL_SECONDS * tank : 0;
        if (course.canRecover(p.x, feet, p.z, actor.hopV, speed, jump, ctx.seaY,
          jetSeconds, BL.crew.JET_ACCEL, BL.crew.JET_RISE, actor.bodyHeight)) unrecoverableAt = -1;
        else {
          // Keep control briefly beyond the reach envelope. A recovered
          // trajectory starts a fresh grace period if it later becomes hopeless.
          if (unrecoverableAt < 0) unrecoverableAt = seconds;
          if (seconds - unrecoverableAt >= RECOVERY_GRACE_SECONDS) finish(false);
        }
      } else unrecoverableAt = -1;
    };
    const drawOverlay = (c2) => {
      ghost.drawName(c2);
      looks?.overlay(c2);
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
      cancel(); overlay.dispose(); ghost.dispose(); clearRoute(); looks?.dispose();
      audio.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      removeChild(root, routeRoot); removeChild(root, platform);
      phase = "idle"; actor = null;
    };
    const liveGeometry = (set) => {
      ghost.liveGeometry(set);
      looks?.liveGeometry(set);
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
    const pickupLights = (lights, offset, capacity) => {
      if (!routeRoot.visible || !course) return 0;
      let count = 0;
      for (const p of course.pickups) {
        if (count === capacity) break;
        if (!p.active || p.y <= ctx.seaY) continue;
        const at = (offset + count++) * 8, pulse = 0.92 + Math.sin((displayTime + p.index * 2) * 2.4) * 0.08;
        // Soft uplight grounds the pickup on its cloud; the pack's material
        // fill keeps the upper tanks readable without a blue hotspot.
        lights[at] = p.x; lights[at + 1] = p.y - 0.3; lights[at + 2] = p.z; lights[at + 3] = 2.4;
        lights[at + 4] = 0.55 * pulse; lights[at + 5] = 0.65 * pulse; lights[at + 6] = 0.75 * pulse; lights[at + 7] = 0;
      }
      return count;
    };
    return { platform, cabinet, action, launch, near, exit, cancel, preUpdate, postUpdate, onJump, fallView, supportAt, dispose, liveGeometry, pickupLightsWanted, pickupLights, drawOverlay,
      get active() { return active(); }, get playing() { return playing(); }, get held() { return held(); },
      get actor() { return actor; }, get phase() { return phase; }, get time() { return seconds; },
      get bestGhost() { return session ? played().best : null; },
      get course() { return course; }, get start() { return start; }, get level() { return level; }, looks,
      get bound() { return Math.hypot(start.x, start.z) + 80; } };
  };
  BL.cloudHopper = { create, LIFT_SECONDS };
})();
