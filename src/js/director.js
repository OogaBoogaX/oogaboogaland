(() => {
  "use strict";
  const { scene, models, donations, glRenderer, canvasRenderer, game: gameMod, pile: pileMod, scenes } = window.BL;
  // The optional build-time Oogatron snapshot loads before the director.
  // Activity uses each contributor's timestamp, never the snapshot build time.
  if (window.BL.jumbotronData) window.BL.contributors.applySnapshot(window.BL.jumbotronData);
  const { clearTweens, tweenCount } = scene;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  if (DEBUG) window.BL.contributors.seedDebugActivity();
  // Loot crates, locker tab and worn swag; the suite turns them on with ?debug=1&loot=1
  const LOOT_DEFAULT = false;
  const LOOT_ENABLED = DEBUG && params.has("loot") ? params.get("loot") === "1" : LOOT_DEFAULT;
  const requestedBananas = Number(params.get("bananas"));
  const START_BANANAS = DEBUG && params.has("bananas") && Number.isFinite(requestedBananas) && requestedBananas >= 0
    ? Math.min(pileMod.MAX_BANANAS, Math.floor(requestedBananas))
    : 1000;
  const requestedTestBananas = Number(params.get("b"));
  const TEST_BANANAS = DEBUG && params.has("b") && Number.isFinite(requestedTestBananas) && requestedTestBananas >= 0
    ? Math.min(pileMod.MAX_BANANAS, Math.floor(requestedTestBananas))
    : 100;
  const FADE = 0.25;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const $ = (id) => document.getElementById(id);
  const mark = (name) => performance.mark(`ooga:${name}`);
  mark("boot");
  let sceneCanvas = $("scene");
  const overlayCanvas = $("overlay");
  const overlayCtx = overlayCanvas.getContext("2d");
  const qualityLabel = $("quality");
  const curtain = $("curtain");
  const SAYINGS = [
    "growing the island…", "counting the bananas…", "waking the Oogas…", "polishing the rocks…", "herding the clouds…",
    "lighting the torches…", "packing the leaf chutes…", "lashing sticks into a rocket…", "filling barrels with banana mash…",
    "warming up the Fire Pot…", "sweeping the rope bridge…", "feeding the fireflies…", "teaching cavemen to drive…",
    "hiding the jetpack…", "tightening the Vine Knots…", "fluffing the leaf beds…"
  ];
  $("curtain-saying").textContent = SAYINGS[Math.floor(Math.random() * SAYINGS.length)];
  const worldClock = $("world-clock");
  let renderer = null;
  if (!params.has("canvas2d")) {
    try {
      renderer = glRenderer.createRenderer(sceneCanvas, { quality: COARSE ? "medium" : "high" });
    } catch (err) {
      console.warn("WebGL2 renderer failed, using Canvas 2D fallback", err);
      // A canvas that has held a WebGL context can never return a 2D one: replace the element.
      const fresh = sceneCanvas.cloneNode(false);
      sceneCanvas.replaceWith(fresh);
      sceneCanvas = fresh;
    }
  }
  if (!renderer) renderer = canvasRenderer.createRenderer(sceneCanvas);
  mark("renderer");
  const showQuality = () => {
    qualityLabel.textContent = `${renderer.kind} · ${renderer.quality}`;
  };
  showQuality();
  const game = gameMod.create({ catalog: models.SWAG });
  // world survives scene swaps: banana level, equipment ownership, and the Ooga handed from hub to scene.
  const world = { level: START_BANANAS, pilot: null, jetpack: { owned: false, fuel: 1 }, mirrorBroken: false };
  const debugMagazines = DEBUG ? (params.get("mag") === "2" ? 2 : params.get("mag") === "1" ? 1 : 0) : 0;
  world.magazine = { owned: debugMagazines > 0, count: debugMagazines, ammo: debugMagazines ? 30 : 0, carrier: null };

  let active = null;
  let sceneTime = 0;
  let transition = null;
  let fade = 0;
  const CLOCK_NS = "http://www.w3.org/2000/svg";
  const clockSvg = document.createElementNS(CLOCK_NS, "svg");
  const clockPath = document.createElementNS(CLOCK_NS, "path");
  const clockTime = DEBUG ? window.BL.daylight.parseTime(params.get("time")) : NaN;
  const clockDaylen = DEBUG ? Number(params.get("daylen")) : NaN;
  const clockStartDate = new Date();
  const requestedClockHour = DEBUG && params.has("hour") ? Number(params.get("hour")) : NaN;
  const clockBaseHour = Number.isFinite(requestedClockHour) ? requestedClockHour : clockStartDate.getHours() + clockStartDate.getMinutes() / 60 + clockStartDate.getSeconds() / 3600;
  let clockNextUpdate = 0, clockMinute = -1;
  const CLOCK_DATE = new Date();
  clockSvg.setAttribute("viewBox", "0 0 30 6");
  clockSvg.setAttribute("class", "sign");
  clockSvg.setAttribute("aria-hidden", "true");
  clockPath.setAttribute("fill", "currentColor");
  clockSvg.append(clockPath);
  worldClock.replaceChildren(clockSvg);
  const updateWorldClock = (now) => {
    if (now < clockNextUpdate) return;
    clockNextUpdate = now + 100;
    let hours, minutes;
    if (Number.isFinite(clockTime)) {
      const total = Math.round(clockTime * 60);
      hours = Math.floor(total / 60);
      minutes = total % 60;
    } else if (clockDaylen > 0) {
      const sceneDaylight = active && active.debug && active.debug.daylight;
      const relative = sceneDaylight && Number.isFinite(sceneDaylight.hour) ? sceneDaylight.hour : clockBaseHour + elapsed * 24 / clockDaylen;
      const total = Math.floor(((relative % 24 + 24) % 24) * 60) % 1440;
      hours = Math.floor(total / 60);
      minutes = total % 60;
    } else {
      CLOCK_DATE.setTime(Date.now());
      hours = CLOCK_DATE.getHours();
      minutes = CLOCK_DATE.getMinutes();
    }
    const minute = hours * 60 + minutes;
    if (minute === clockMinute) return;
    clockMinute = minute;
    const twelve = hours % 12 || 12;
    const text = `${twelve < 10 ? " " : Math.floor(twelve / 10)}${twelve % 10}:${Math.floor(minutes / 10)}${minutes % 10} ${hours < 12 ? "AM" : "PM"}`;
    let d = "", cursor = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        cursor += i === 0 ? 4 : 2;
        continue;
      }
      const glyph = window.BL.hubModels.SIGN_GLYPHS[ch];
      for (let row = 0; row < glyph.length; row++) for (let col = 0; col < glyph[row].length; col++) if (glyph[row][col] === "1") d += `M${cursor + col} ${row}h.82v.82h-.82z`;
      cursor += 4;
    }
    const label = text.trimStart();
    clockPath.setAttribute("d", d);
    worldClock.dateTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    worldClock.setAttribute("aria-label", `${Number.isFinite(clockTime) || clockDaylen > 0 ? "Ooga Booga time" : "Local time"} ${label}`);
  };
  const go = (id) => {
    const next = scenes[id];
    if (!next) throw new Error(`Unknown scene "${id}"`);
    if (transition) return;
    transition = { next, out: true, t: 0 };
  };
  const ctx = { renderer, canvas: sceneCanvas, overlay: overlayCanvas, game, world, go, lootEnabled: LOOT_ENABLED, testBananas: TEST_BANANAS, from: null };
  const sceneSections = [...document.querySelectorAll("[data-scene]")];
  const enter = (next) => {
    ctx.from = active ? active.id : null;
    for (const el of sceneSections) el.hidden = el.dataset.scene !== next.id;
    next.enter(ctx);
    active = next;
    sceneTime = 0;
  };
  const live = new Set();
  const visit = (node) => {
    if (node.geometry) live.add(node.geometry);
    for (const child of node.children) visit(child);
  };
  const liveGeometry = () => {
    live.clear();
    visit(active.root);
    active.liveGeometry(live);
    return live;
  };
  const swap = (next) => {
    const leaving = active;
    const left = leaving.leave();
    if (DEBUG && leaving.root.children.length) throw new Error(`${leaving.id}.leave left ${leaving.root.children.length} nodes in its root`);
    if (DEBUG && left.targets) throw new Error(`${leaving.id}.leave left ${left.targets} input targets`);
    clearTweens();
    if (DEBUG && tweenCount()) throw new Error(`${tweenCount()} tweens survived clearTweens`);
    enter(next);
    renderer.releaseUnused(liveGeometry());
    if (DEBUG && renderer.stats.records > live.size) throw new Error(`${next.id}: ${renderer.stats.records} GPU records for ${live.size} live geometries`);
  };
  const stepTransition = (dt) => {
    transition.t += dt;
    if (transition.out) {
      fade = Math.min(1, transition.t / FADE);
      if (fade < 1) return;
      swap(transition.next);
      transition.out = false;
      transition.t = 0;
      return;
    }
    fade = 1 - Math.min(1, transition.t / FADE);
    if (fade === 0) transition = null;
  };
  // Fills in CSS pixels (clientWidth/clientHeight), not backing-store pixels.
  const drawFade = () => {
    overlayCtx.globalAlpha = fade;
    overlayCtx.fillStyle = "#000000";
    overlayCtx.fillRect(0, 0, overlayCanvas.clientWidth, overlayCanvas.clientHeight);
    overlayCtx.globalAlpha = 1;
  };

  // Sampled from delivered frame intervals, never from the cost of issuing a frame.
  // GL calls return long before the GPU draws, so a GPU-bound machine reports cheap frames and never steps down.
  const perf = { frames: 0, total: 0, since: 0, bad: 0 };
  const QUALITY_ORDER = ["high", "medium", "low"];
  // Window ends on frames or ms, whichever comes first: at 8 fps that steps down in about a second.
  const TIER_FRAMES = 45, TIER_MS = 900, TIER_INTERVAL = 19, TIER_WARMUP = 12;
  const autoTier = (intervalMs, now) => {
    if (renderer.kind !== "webgl2" || renderedFrames <= TIER_WARMUP) return;
    const idx = QUALITY_ORDER.indexOf(renderer.quality);
    // Stepping is one-way and stops at the bottom tier, so quality cannot oscillate.
    if (idx < 0 || idx >= QUALITY_ORDER.length - 1) return;
    // An unfocused tab and a transition building the next scene are not evidence that the tier is too expensive.
    if (!document.hasFocus() || transition) { perf.frames = perf.total = 0; perf.since = 0; return; }
    if (!perf.since) perf.since = now;
    perf.frames++;
    perf.total += intervalMs;
    if (perf.frames < TIER_FRAMES && now - perf.since < TIER_MS) return;
    const avg = perf.total / perf.frames;
    perf.frames = 0;
    perf.total = 0;
    perf.since = now;
    // Two bad windows required: one slow window can be another program, and a step down lasts the session.
    // A genuinely slow machine still drops a tier inside two seconds.
    if (avg <= TIER_INTERVAL) { perf.bad = 0; return; }
    if (++perf.bad < 2) return;
    perf.bad = 0;
    renderer.setQuality(QUALITY_ORDER[idx + 1]);
    showQuality();
  };
  // Boot time is a device probe no browser can refuse: Safari masks GPU strings, where thresholds matter most.
  // BOOT_MEDIUM 2200 / BOOT_LOW 3400 measure building the first scene.
  const BOOT_MEDIUM = 2200, BOOT_LOW = 3400;
  const tierFromBoot = (ms) => {
    if (renderer.kind !== "webgl2") return;
    const wanted = ms > BOOT_LOW ? "low" : ms > BOOT_MEDIUM ? "medium" : null;
    if (!wanted || QUALITY_ORDER.indexOf(wanted) <= QUALITY_ORDER.indexOf(renderer.quality)) return;
    renderer.setQuality(wanted);
    showQuality();
  };

  // Full rate while focused; 30 fps only when another window is in front.
  const WARMUP = 8;
  const UNFOCUSED_INTERVAL = 1000 / 30;
  let lastRender = 0;
  let renderedFrames = 0;
  let firstDraw = false;
  const openCurtain = () => {
    curtain.addEventListener("transitionend", (e) => {
      if (e.propertyName === "transform") curtain.remove();
    });
    curtain.dataset.open = "true";
  };
  const frameInterval = () => (elapsed > WARMUP && !document.hasFocus() && !active.inMotion ? UNFOCUSED_INTERVAL : 0);

  const housekeep = () => renderer.releaseUnused(liveGeometry());

  let elapsed = 0;
  let lastTime = performance.now();
  let raf = 0;
  // Shared by the display loop and the debug `advance`, so a stepped frame is exactly a displayed one.
  const step = (dt, now) => {
    elapsed += dt;
    if (transition) stepTransition(dt);
    sceneTime += dt;
    active.update(dt, sceneTime);
    updateWorldClock(now);
    const drawn = renderer.render(active.root, active.camera, active.renderOpts);
    if (drawn && !firstDraw) {
      firstDraw = true;
      mark("drawn");
      openCurtain();
    }
    if (!drawn && renderer.failure && !params.has("canvas2d")) {
      console.warn("WebGL2 programs failed, reloading with the Canvas 2D fallback", renderer.failure);
      params.set("canvas2d", "1");
      location.replace(`${location.pathname}?${params}`);
      return;
    }
    active.input.update();
    active.overlay(dt);
    if (fade > 0) drawFade();
  };
  const frame = (now) => {
    raf = window.requestAnimationFrame(frame);
    const interval = frameInterval();
    if (interval && now - lastRender < interval - 1) return;
    const delivered = now - lastRender;
    lastRender = now;
    renderedFrames++;
    if (renderedFrames <= 3) mark(`frame${renderedFrames}`);
    // A queued RAF may predate debug advance(); simulation time must never rewind.
    const dt = Math.max(0, Math.min(0.1, (now - lastTime) / 1e3));
    lastTime = now;
    step(dt, now);
    // Only a displayed frame carries a real interval; `advance` must not tier.
    if (!interval) autoTier(delivered, now);
  };

  const onKeyDown = (e) => {
    if (e.repeat) return;
    const typing = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (typing || (e.target && e.target.closest && e.target.closest("dialog"))) return;
    if (LOOT_ENABLED && e.shiftKey && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      game.clearLoot();
      active.onLootCleared();
      return;
    }
    if (e.shiftKey && !e.metaKey && !e.ctrlKey && (e.key === "R" || e.key === "r")) {
      e.preventDefault();
      game.resetAll();
      location.reload();
      return;
    }
    active.onKey(e);
  };
  const onVisibility = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && active) {
      lastTime = performance.now();
      raf = window.requestAnimationFrame(frame);
    }
  };
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("visibilitychange", onVisibility);
  if (params.has("nosim")) donations.config.simulate = false;
  const unsubscribeDonations = donations.subscribe((donation) => active.onDonation(donation), { identity: () => game.state });
  const housekeepTimer = window.setInterval(housekeep, 6e4);
  const sceneId = params.get("scene");
  // Building the first scene holds the main thread with nothing painted yet.
  // Run boot from a task after the first frame so the leaf curtain is on screen, not the previous page.
  const boot = () => {
    const built = performance.now();
    enter(Object.hasOwn(scenes, sceneId) ? scenes[sceneId] : scenes[Object.keys(scenes)[0]]);
    mark("ready");
    tierFromBoot(performance.now() - built);
    raf = window.requestAnimationFrame(frame);
  };
  window.requestAnimationFrame(() => window.setTimeout(boot, 0));
  if (DEBUG) {
    const ooga = {
      game,
      renderer,
      startLevel: START_BANANAS,
      lootEnabled: LOOT_ENABLED,
      testBananas: TEST_BANANAS,
      project: renderer.project,
      housekeep,
      go,
      // Whole frames at a fixed step without waiting on the display: a check runs seconds of play in little wall time.
      advance: (seconds, dt = 1 / 60) => {
        for (let n = Math.round(seconds / dt); n > 0; n--) {
          renderedFrames++;
          step(dt, performance.now());
        }
        lastTime = performance.now();
      },
      get scene() {
        return active.id;
      },
      get transitioning() {
        return transition !== null;
      },
      get input() {
        return active.input;
      },
      get renderedFrames() {
        return renderedFrames;
      },
      get frameInterval() {
        return frameInterval();
      },
      get mirror() {
        return renderer.mirror;
      },
      get timing() {
        return Object.fromEntries(performance.getEntriesByType("mark").filter((m) => m.name.startsWith("ooga:")).map((m) => [m.name.slice(5), Math.round(m.startTime)]));
      },
      stats: () => ({ ...active.stats(), gl: renderer.stats || null, dom: document.getElementsByTagName("*").length }),
      get level() {
        return world.level;
      }
    };
    for (const key of ["slots", "drops", "core", "shell", "delivery", "spillEffect", "cavemen", "crates", "lab", "headquarters", "hud", "applyAllSwag", "renderLocker", "demoTip", "setPileLevel", "refreshStates", "trimPool", "shown", "island", "mouths", "labels", "camera", "cameraCave", "crew", "controls", "props", "altar", "path", "scenery", "jetpack", "magazine", "mirrorCave", "matrixCave", "matrixGate", "pilot", "renderOpts", "lamps", "entranceLights", "lighting", "fireSeats", "critters", "daylight", "setHour", "track", "racers", "items", "race", "audio", "weather", "launchers", "drop", "diver", "plane", "course", "jumbotron", "orbit", "flight", "site", "dsb"]) {
      Object.defineProperty(ooga, key, { get: () => active.debug && active.debug[key], enumerable: true });
    }
    window.__ooga = ooga;
  }
  const destroy = () => {
    window.cancelAnimationFrame(raf);
    window.clearInterval(housekeepTimer);
    unsubscribeDonations();
    window.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("visibilitychange", onVisibility);
    active.leave();
    renderer.dispose();
  };
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) destroy();
  });
})();
