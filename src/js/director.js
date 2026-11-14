(async () => {
  "use strict";
  const { scene, models, donations, glRenderer, game: gameMod, pile: pileMod, router: routerMod, scenes, gamepad } = window.BL;
  // The optional build-time Oogatron snapshot loads before the director.
  // Activity uses each contributor's timestamp, never the snapshot build time.
  if (window.BL.jumbotronData) window.BL.contributors.applySnapshot(window.BL.jumbotronData);
  const { clearTweens, tweenCount } = scene;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  // Local play-tests can run the donation show without emitting a paid event or changing the tally.
  const TEST_DONATIONS = params.get("testdonations") === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  // A game still being built sets `wip: true` on its scene and stays unregistered, so nothing can enter it
  // and its cave seals, unless the page opts in: ?wip=<scene id> opens that game and lands in it, wip=1 opens
  // every one. No debug needed, so anyone can play a shared link. Its saves are left alone for the day it opens.
  const WIP = params.get("wip");
  // Rally stays closed to visitors; its retained suite explicitly opts into the maintenance scene.
  const RALLY_TEST = DEBUG && WIP === "race";
  for (const id of Object.keys(scenes)) if (scenes[id].wip && WIP !== "1" && WIP !== id) delete scenes[id];
  for (const slot of window.BL.caves.slots) if (slot.scene && !scenes[slot.scene]) Object.assign(slot, { scene: null, status: "dark" });
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
  // Choose before renderer creation so a memory-limited device never allocates high-tier targets.
  // The signal is approximate and optional; absent or invalid values leave the boot-time probe in charge.
  const DEVICE_MEMORY = navigator.deviceMemory;
  const MEMORY_LIMITED = Number.isFinite(DEVICE_MEMORY) && DEVICE_MEMORY > 0 && DEVICE_MEMORY <= 8;
  const INITIAL_QUALITY = COARSE || MEMORY_LIMITED ? "medium" : "high";
  const $ = (id) => document.getElementById(id);
  // One opt-in override makes both policies measurable. Memory reports are approximate and browser/version-dependent:
  // at least 8 GiB keeps the built island; exactly 8 still starts the renderer at medium (`MEMORY_LIMITED`, which
  // guards frame cost). A usable report below 8 releases it. Without one, a coarse pointer releases the island and
  // a fine pointer keeps it.
  const HUB_CACHE = params.get("hubcache") || "auto";
  const MEMORY_REPORTED = Number.isFinite(DEVICE_MEMORY) && DEVICE_MEMORY > 0;
  const KEEP_HUB = HUB_CACHE === "keep" || HUB_CACHE !== "release" && (MEMORY_REPORTED ? DEVICE_MEMORY >= 8 : !COARSE);
  // The island cache follows the same rule: a miss's fill runs a second island build in a Worker beside the page's, and
  // the cache is read only at boot, never for a released hub's rebuild. `?terrainworker=1` forces it, `=0` stops it.
  const TERRAIN_CACHE = params.get("terrainworker") === "1" || params.get("terrainworker") !== "0" && KEEP_HUB;
  const mark = (name) => performance.mark(`ooga:${name}`);
  mark("boot");
  let sceneCanvas = $("scene");
  const overlayCanvas = $("overlay");
  const overlayCtx = overlayCanvas.getContext("2d");
  // The overlay's CSS size, read on resize rather than in drawFade: a read there follows the HUD
  // writes of the scenes' overlays and forces a synchronous layout every faded frame (as in fx.js).
  let overlayCssW = overlayCanvas.clientWidth, overlayCssH = overlayCanvas.clientHeight;
  const overlayObserver = new ResizeObserver(() => {
    overlayCssW = overlayCanvas.clientWidth;
    overlayCssH = overlayCanvas.clientHeight;
  });
  overlayObserver.observe(overlayCanvas);
  const curtain = $("curtain");
  const worldBlock = $("world-block"), worldBlockHeight = $("world-block-height");
  const worldClock = $("world-clock"), soundButton = $("environment-sound");
  const sound = window.BL.sound;
  const showSound = () => {
    const label = sound.muted ? "Unmute environment sounds" : "Mute environment sounds";
    const voice = window.BL.voice.stats;
    soundButton.setAttribute("aria-label", label); soundButton.title = voice.enabled || voice.joining || voice.returning ? label : `${label} · M`;
    soundButton.setAttribute("aria-pressed", String(sound.muted));
  };
  let helpHeld = false;
  // Both panels pause the scene. A pad keeps working inside them: its Menus context reaches no scene while they show.
  const controlsHelp = BL.controlsHelp.create({ current: () => active, ready: () => !!active && !transition,
    hold: on => { helpHeld = on; rightShift = false; } });
  const padSettings = BL.padSettings.install(BL.padSettings.create({ current: () => active, ready: () => !!active && !transition,
    hold: on => { helpHeld = on; rightShift = false; BL.controls.resetAll(); } }));
  // The controller's own news: named the first time it is used, offered setup when the browser can't read it, and in
  // a game, losing it pauses the game. View and Menu together open its screen.
  let padNamed = "";
  const offPad = gamepad.subscribe((what) => {
    const hud = window.BL.hud, st = gamepad.state;
    if (what === "settings") padSettings.open();
    else if (what === "device" && st.connected && st.id !== padNamed) {
      padNamed = st.id;
      hud.toast(`${gamepad.nameOf(st.id)} ready · ${gamepad.glyph("view")} + ${gamepad.glyph("menu")} for controller settings`);
    } else if (what === "unknown") {
      hud.toast(`${gamepad.nameOf(st.unknown)} needs a one-time setup`);
      padSettings.open({ setup: true });
    } else if (what === "disconnected") {
      const pause = gamepad.CONTEXTS[gamepad.context]?.pauseKey;
      if (pause && active && !transition) gamepad.tap(pause);
      hud.toast("Controller disconnected");
    }
  });
  const offSound = sound.subscribe(showSound);
  soundButton.addEventListener("click", sound.toggle);
  showSound();
  // Reserve M before scene capture listeners and transition holds; editable fields keep it for typing.
  const onVoiceMuteKey = (e) => {
    const voice = window.BL.voice;
    if (e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey || !voice.stats.enabled && !voice.stats.joining && !voice.stats.returning) return;
    if (e.target && (e.target.isContentEditable || e.target.closest && e.target.closest("input, textarea, select"))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    // Back from an earlier session the microphone is still closed, so M opens it as Unmute does.
    if (voice.stats.returning) voice.toggle();
    else voice.setMuted(!voice.stats.muted);
  };
  window.addEventListener("keydown", onVoiceMuteKey, true);
  let renderer = null;
  if (!params.has("canvas2d")) {
    try {
      renderer = glRenderer.createRenderer(sceneCanvas, { quality: INITIAL_QUALITY });
    } catch (err) {
      console.warn("WebGL2 renderer failed, using Canvas 2D fallback", err);
      // A canvas that has held a WebGL context can never return a 2D one: replace the element.
      const fresh = sceneCanvas.cloneNode(false);
      sceneCanvas.replaceWith(fresh);
      sceneCanvas = fresh;
    }
  }
  if (!renderer) {
    try {
      const ready = window.BL.deferred.load("canvas");
      if (ready) await ready;
      renderer = window.BL.canvasRenderer.createRenderer(sceneCanvas);
    } catch {
      overlayObserver.disconnect();
      curtain.querySelector(".curtain-spinner").remove();
      const retry = document.createElement("button"), saying = $("curtain-saying");
      retry.type = "button"; retry.className = "link"; retry.textContent = "Try again";
      retry.addEventListener("click", () => location.reload(), { once: true });
      saying.textContent = "The island could not open. "; saying.appendChild(retry);
      return;
    }
  }
  mark("renderer");
  const game = gameMod.create();
  window.BL.donationPopup = window.BL.donationPopup.create(game, (donation) => {
    if (donations.real) return;
    deliverDonation(donation);
    window.BL.hud.setDonationStats(game.state);
  });
  window.BL.hud.setDonationStats(game.state);
  // world survives scene swaps: banana level, equipment ownership, and the Ooga handed from hub to scene.
  const world = { level: START_BANANAS, pilot: null };
  const debugMagazines = DEBUG ? (params.get("mag") === "2" ? 2 : params.get("mag") === "1" ? 1 : 0) : 0;
  world.magazine = { owned: debugMagazines > 0, count: debugMagazines, ammo: debugMagazines ? 30 : 0, carrier: null };

  let active = null, activeMeshRigs = false, visitController = null;
  // The first scene is the only arrival that can wait without an active donation receiver. Keep a bounded queue and
  // let the scene record each tip when it arrives, so a boot tip is both shown and counted exactly once.
  let bootPending = true;
  const bootDonations = [];
  const deliverDonation = (donation, bananas = null) => {
    if (active) active.onDonation(donation, bananas);
    else if (bootPending && bootDonations.length < 16) bootDonations.push({ donation, bananas });
    else game.recordDonation(donation, bananas && bananas.exact);
  };
  const finishBootDonations = () => {
    bootPending = false;
    while (bootDonations.length) { const pending = bootDonations.shift(); active.onDonation(pending.donation, pending.bananas); }
  };
  const failBootDonations = () => {
    bootPending = false;
    while (bootDonations.length) { const pending = bootDonations.shift(); game.recordDonation(pending.donation, pending.bananas && pending.bananas.exact); }
  };
  let sceneTime = 0;
  let transition = null;
  let fade = 0;
  const positionDebug = $("position-debug"), POSITION_DEBUG = DEBUG && params.get("pos") !== "0";
  let positionDebugNext = 0, positionDebugState = "";
  const positionText = p => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
  const updatePositionDebug = force => {
    if (!POSITION_DEBUG || !active || active.id === "hub" || !active.camera) return;
    const debug = active.debug, actor = debug?.pilot?.player || debug?.crew?.player;
    const actorPosition = actor?.root?.position;
    const room = debug?.dsb?.interiors?.active?.room?.id;
    const camera = active.camera;
    const state = `${active.id}${room ? ` · ${room}` : ""}${actor?.traits?.name ? ` · ${actor.traits.name}` : ""}`
      + (actorPosition ? `\npos=${positionText(actorPosition)}` : "")
      + `\ncamera=${positionText(camera.position)}\nlook=${positionText(camera.target)}`;
    if (!force && state === positionDebugState) return;
    positionDebugState = state;
    positionDebug.dataset.copied = "false";
    positionDebug.textContent = `${state}\nclick to copy debug snapshot`;
  };
  const copyPositionDebug = () => {
    updatePositionDebug(true);
    const url = new URL(location.href);
    url.searchParams.set("debug", "1");
    const value = `${positionDebugState}\nurl=${url.href}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(() => {});
    else {
      const field = document.createElement("textarea");
      field.value = value;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    positionDebug.dataset.copied = "true";
    positionDebug.blur();
  };
  const CLOCK_NS = "http://www.w3.org/2000/svg";
  const clockSvg = document.createElementNS(CLOCK_NS, "svg");
  const clockPath = document.createElementNS(CLOCK_NS, "path");
  const clockTime = DEBUG ? window.BL.daylight.parseTime(params.get("time")) : NaN;
  const clockDaylen = DEBUG ? Number(params.get("daylen")) : NaN;
  const clockStartDate = new Date();
  const clockZoneFormat = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" });
  const requestedClockHour = DEBUG && params.has("hour") ? Number(params.get("hour")) : NaN;
  const clockBaseHour = Number.isFinite(requestedClockHour) ? requestedClockHour : clockStartDate.getHours() + clockStartDate.getMinutes() / 60 + clockStartDate.getSeconds() / 3600;
  let clockNextUpdate = 0, clockMinute = -1;
  const CLOCK_DATE = new Date();
  clockSvg.setAttribute("viewBox", "0 0 30 6");
  clockSvg.setAttribute("class", "sign");
  clockSvg.setAttribute("role", "img");
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
    const zone = (clockZoneFormat.formatToParts(CLOCK_DATE).find(part => part.type === "timeZoneName")?.value || "UTC").toUpperCase().replaceAll("−", "-");
    const text = `${twelve}:${Math.floor(minutes / 10)}${minutes % 10} ${hours < 12 ? "AM" : "PM"} ${zone}`;
    let d = "", cursor = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        cursor += 2;
        continue;
      }
      const glyph = window.BL.hubModels.SIGN_GLYPHS[ch];
      if (!glyph) throw new Error(`No clock glyph for "${ch}"`);
      const sx = 3 / glyph[0].length, pixel = 0.82 * sx;
      for (let row = 0; row < glyph.length; row++) for (let col = 0; col < glyph[row].length; col++) if (glyph[row][col] === "1") d += `M${cursor + col * sx} ${row}h${pixel}v.82h-${pixel}z`;
      cursor += 4;
    }
    const cells = cursor - 1;
    clockSvg.setAttribute("viewBox", `0 0 ${cells} 6`);
    worldClock.style.width = `${cells / 6}em`;
    clockPath.setAttribute("d", d);
    worldClock.dateTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    clockSvg.setAttribute("aria-label", `${Number.isFinite(clockTime) || clockDaylen > 0 ? "Ooga Booga time" : "Local time"} ${text}`);
  };
  // A scene may `prepare(place, ctx)` before it is built (the Timechain Sphere's rooms: their code, deferred on a
  // hosted page, and whose visit it is). It answers null to go ahead, `{ scene, place }` to arrive there instead, or a
  // promise of either; the screen holds dark until it settles, and a rejection fades back in where the visitor was. The
  // scene there is told (`stay`) once the fade is done and a new transition can start, so it can put back what it set
  // up to leave; until then its departure still holds, and a press during the fade is refused rather than lost.
  const settle = (t, answer) => {
    if (answer && typeof answer.then === "function") {
      t.ready = false;
      answer.then((redirect) => {
        if (destroyed) { models.release(t.next.id, []); return; }
        t.redirect = redirect || null; t.ready = true;
      }, (error) => {
        if (destroyed) { models.release(t.next.id, []); return; }
        t.failed = error || new Error("Not ready"); t.ready = true;
      });
    } else t.redirect = answer || null;
  };
  let cabinetView = null;
  const go = (id, place = null, instant = false) => {
    if (cabinetView?.route(id, place)) return true;
    // Public game links take the same cabinet entrance; debug scene fixtures remain isolated.
    if (!DEBUG && !cabinetView?.active && BL.arcadeCabinets.get(id)) { place = `cabinet:${id}`; id = "arcade"; }
    if (id === "race" && !RALLY_TEST) { id = "arcade"; place = "rally-out-of-order"; }
    const next = scenes[id];
    if (!next) throw new Error(`Unknown scene "${id}"`);
    if (transition) return false;
    // Leaving a scene leaves the public outdoor scope at once, before the fade (outdoor-scope.js); the next scene reports.
    window.BL.outdoorScope.report(null, "scene");
    controlsHelp.close();
    transition = { next, place, out: true, t: 0, held: 0, instant, ready: true, redirect: null, failed: null, controller: new AbortController() };
    if (next.prepare) {
      try { settle(transition, models.withScope(next.id, () => next.prepare(place, { ...ctx, signal: transition.controller.signal }, next.id))); }
      catch (error) { transition.failed = error; }
    }
    return true;
  };
  const router = routerMod.create(scenes, window.BL.routes, go);
  // Any chunk found gone, a prefetch's or a picture's included, means every later one is too.
  window.BL.deferred.onStale(() => window.BL.hud.offerReload());
  window.BL.donationPopup.onClose(() => router.dismissPlace("hub", "donate"));
  // The logo is the site's home link: from any scene it goes back to the island, as a website's logo goes home.
  document.querySelector(".home-link").addEventListener("click", (e) => {
    e.preventDefault();
    e.currentTarget.blur();
    if (active && active.id !== "hub") go("hub");
  });
  const agentPlay = BL.agent.createPlay();
  const ctx = { renderer, canvas: sceneCanvas, overlay: overlayCanvas, game, world, go, testBananas: TEST_BANANAS, agentPlay, hubPolicy: KEEP_HUB ? "keep" : "release", from: null, place: null, signal: null };
  cabinetView = window.BL.arcadeView.create({ canvas: sceneCanvas, renderer, go });
  ctx.cabinet = cabinetView;
  const sceneSections = [...document.querySelectorAll("[data-scene]")];
  // The banner's line under its title says where the visitor is (zone-map.js `line`) in every place that carries
  // `data-zone-line`; a game keeps its own words. A line's own markup (the Arcade's abbreviation on a phone) stands
  // whenever it says the same thing.
  const zoneLines = new Map(Array.from(document.querySelectorAll("[data-zone-line]"), (el) => [el, el.cloneNode(true)]));
  let zoneLine = null, zoneLineFor = "";
  const showZoneLine = () => {
    const zone = window.BL.net.state.zone;
    if (!zoneLine || zone === zoneLineFor) return;
    zoneLineFor = zone;
    const text = window.BL.zoneMap.line(zone), home = zoneLines.get(zoneLine);
    if (text === home.textContent) zoneLine.replaceChildren(...home.cloneNode(true).childNodes);
    else zoneLine.textContent = text;
  };
  // The title cards of the games that have no phase of their own for one: shown on every arrival,
  // closed by their button, Enter, Space or Escape, and nothing else reaches the scene while one shows.
  const intros = [...document.querySelectorAll("[data-intro]")];
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) for (const n of document.querySelectorAll("[data-intro] [data-coarse]")) n.textContent = n.dataset.coarse;
  const openIntro = () => { for (const el of intros) if (!el.hidden) return el; return null; };
  const showMic = () => {
    const voice = window.BL.voice.stats;
    window.BL.hud.showMic(voice, voice.enabled || voice.joining || voice.returning);
    showSound();
  };
  // An arrival in three parts: `arriving` before the scene's own enter, the enter, then `arrived`. A scene with
  // `enterSteps` may run its enter in slices between them (see `swap`).
  const arcadeScenes = new Set([...window.BL.arcadeCabinets.entries.map(c => c.id), "race", "skee", "hoops", "shy", "claw", "hockey", "billiards", "darts", "pinball", "ride"]);
  const arriving = (next, place) => {
    const retainedTime = next.retained ? next.elapsed : 0;
    ctx.from = active ? active.id : null;
    ctx.place = place;
    positionDebug.removeEventListener("click", copyPositionDebug);
    for (const el of sceneSections) el.hidden = el.classList.contains("hub-presets") || el.dataset.scene !== next.id;
    zoneLine = sceneSections.find((el) => el.dataset.scene === next.id && zoneLines.has(el)) || null;
    zoneLineFor = "";
    // Off the zipline the sides board is the arrival: no title card first.
    for (const el of intros) el.hidden = el.dataset.intro !== next.id || place === "zipline" || place === BL.blockWire.WATCH_DECK_PLACE;
    // Arcade games share the hall's controls and start with folded social panels.
    document.body.dataset.activeScene = next.id;
    document.body.classList.toggle("arcade-game", arcadeScenes.has(next.id) || next.id === "hub" && place === "cloud-hopper");
    window.BL.net.setBody(null);
    window.BL.net.setBlend(null, 0);
    // The scene's own zone (`voiceZone`), else one of its own; the island and DSB Land report theirs as they go.
    window.BL.net.setZone(next.voiceZone || (next.id === "dsb" ? "dsb-outside" : `scene-${next.id}`));
    window.BL.models.setScope(next.id);
    visitController = new AbortController();
    ctx.signal = visitController.signal;
    return retainedTime;
  };
  const arrived = (next, place, retainedTime) => {
    activeMeshRigs = next.renderOpts?.meshRigs === true;
    active = next;
    gamepad.setContext(next.padContext || "foot");
    cabinetView.arrived(next);
    // Rasterize hidden render alternatives before the curtain lifts or the visitor can zoom out.
    renderer.prepareScene(liveGeometry());
    showMic();
    sceneTime = retainedTime;
    router.arrive(next.id, place, ctx.from === null);
    if (POSITION_DEBUG && next.id !== "hub") {
      positionDebug.hidden = false;
      positionDebug.setAttribute("aria-label", "Debug scene, character and camera state. Click to copy a debug snapshot.");
      positionDebugState = "";
      positionDebugNext = 0;
      positionDebug.addEventListener("click", copyPositionDebug, { signal: ctx.signal });
      updatePositionDebug(true);
    }
    holdInput(false);
  };
  const enter = (next, place = null) => {
    const retainedTime = arriving(next, place);
    try { next.enter(ctx); }
    catch (error) { visitController.abort(); throw error; }
    arrived(next, place, retainedTime);
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
    if (scenes.hub.retained) scenes.hub.cachedGeometry(live);
    return BL.models.addLods(live);
  };
  // The page's first AudioContext wakes the browser's audio, about 60 ms on the main thread; every later one costs well
  // under a millisecond, closed or not. Paid once here, behind the fade, so a scene's first sound never stalls a frame;
  // only after a gesture, as the scenes' own sound waits for one.
  let audioAwake = false;
  const wakeAudio = () => {
    if (audioAwake || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    audioAwake = true;
    new AudioContext().close().catch(() => {});
  };
  // The swap's last part: the arrived scene's live set decides what of the departed one stays.
  const releaseLeft = (leaving, next) => {
    // Scene-only builder caches go with the visit; only the keep policy preserves the inactive hub's owners.
    // Preserve only the retained hub's owners and the destination's explicit warm builders.
    const retained = liveGeometry(), keptScenes = KEEP_HUB ? ["hub", next.id, ...(next.keeps || [])] : [next.id, ...(next.keeps || [])];
    if (leaving.id !== "hub" || !KEEP_HUB) {
      models.release(leaving.id, keptScenes, retained);
      // What it kept warm for its own doors goes with it, so a door readied and never walked through pins nothing.
      for (const id of leaving.keeps || []) if (!keptScenes.includes(id)) { models.release(id, keptScenes, retained); window.BL.scenes[id]?.cachesReleased?.(); }
      if (DEBUG && leaving.id !== next.id && !keptScenes.includes(leaving.id)) models.assertReleased(leaving.id);
    }
    renderer.releaseUnused(retained);
    if (DEBUG && renderer.stats.records > live.size) throw new Error(`${next.id}: ${renderer.stats.records} GPU records for ${live.size} live geometries`);
  };
  // Registered once, before boot creates any scene's capture listeners. During enter even the HUD and bubbling
  // controls belong to a half-built visit; only its recovery notice may take input.
  const HELD_EVENTS = ["keydown", "keyup", "pointerdown", "pointermove", "pointerup", "pointercancel", "pointerleave", "mousedown", "mousemove", "mouseup", "click", "dblclick", "wheel", "contextmenu", "touchstart", "touchmove", "touchend", "touchcancel"];
  const heldHud = [...sceneSections, ...intros, ...document.querySelectorAll("#equipment-hud, .joysticks, #act")];
  let inputHeld = false;
  const holdSheets = () => {
    // A layout change must not release a venue modal's background isolation.
    if (inputHeld) for (const el of document.querySelectorAll(".sheet")) el.inert = true;
  };
  document.addEventListener("sheetchange", holdSheets);
  // Aiming can cancel pointerdown before its default focus transfer. Every
  // scene shares this canvas; routed virtual-cursor panel clicks keep UI focus.
  sceneCanvas.tabIndex = -1;
  const focusWorld = (e) => {
    if (e.target === sceneCanvas) sceneCanvas.focus({ preventScroll: true });
  };
  document.addEventListener("pointerdown", focusWorld, true);
  const heldEvent = (e) => {
    if (!inputHeld || e.target.closest && e.target.closest("#reload-notice, .cabinet-exit")) return;
    if (e.type === "keydown" && e.key === "Escape" && cabinetView.active) cabinetView.route("arcade");
    if (e.type !== "touchstart" && e.type !== "touchmove") e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of HELD_EVENTS) window.addEventListener(type, heldEvent, { capture: true, passive: type === "touchstart" || type === "touchmove" });
  const holdInput = (on) => {
    if (inputHeld === on) return;
    inputHeld = on;
    gamepad.hold(on);
    for (const el of heldHud) el.inert = on;
    for (const el of document.querySelectorAll(".sheet")) el.inert = on;
  };
  const entryFailed = (t, error) => {
    if (destroyed) return;
    // The previous visit has gone and leave cannot tear down a half-built one. Keep its controls held and offer
    // a way out, with honest wording: an entry error says nothing about whether the deployment changed.
    active = null;
    window.BL.net.leaveCabinet();
    if (t) t.entering = t.building = t.entryFailed = true;
    visitController?.abort();
    holdInput(true);
    window.BL.hud.offerReload("Ooga Booga Land could not be opened");
    $("reload-notice").querySelector("button").focus({ preventScroll: true });
    reportError(error);
  };
  // True once the next scene has entered. A scene with `enterSteps` (a released hub, rebuilding its island's whole
  // visit) enters in slices instead: the departed scene is gone, nothing updates, draws or takes a key, and the screen
  // holds (black, or an instant crossing's last frame) until the last slice, when `done` carries the transition on.
  // A first slice that finishes the enter (a kept hub resuming) completes in the same frame, as `enter` would.
  const swapScenes = (next, place, done) => {
    const leaving = active;
    wakeAudio();
    agentPlay.stop(true);
    let left;
    try { left = leaving.leave(); }
    finally { visitController.abort(); }
    if (DEBUG && leaving.root.children.length) throw new Error(`${leaving.id}.leave left ${leaving.root.children.length} nodes in its root`);
    if (DEBUG && left.targets) throw new Error(`${leaving.id}.leave left ${left.targets} input targets`);
    clearTweens();
    if (DEBUG && tweenCount()) throw new Error(`${tweenCount()} tweens survived clearTweens`);
    if (!next.enterSteps) {
      const t = transition;
      try { enter(next, place); }
      catch (error) { entryFailed(t, error); return false; }
      releaseLeft(leaving, next);
      return true;
    }
    holdInput(true);
    const retainedTime = arriving(next, place);
    const t = transition;
    const finish = () => { arrived(next, place, retainedTime); releaseLeft(leaving, next); };
    let steps, step;
    try {
      steps = models.withScope(next.id, () => next.enterSteps(ctx));
      step = window.BL.buildTasks.measure(() => models.withScope(next.id, () => steps.next()));
      if (step.done) { finish(); return true; }
    } catch (error) { entryFailed(t, error); return false; }
    active = null;
    t.entering = t.building = true;
    // The rest of the enter, then the meshes its first frame draws, so that frame does not build them all at once.
    const rest = (function* () {
      yield* steps;
      yield;
      yield* renderer.prepareSteps(next.root, next.renderOpts?.meshRigs === true, { until: performance.now() + window.BL.buildTasks.SLICE_MS / 2 });
    })();
    window.BL.buildTasks.run(rest, next.id, visitController.signal).then(() => {
      finish();
      t.entering = t.building = false;
      done();
    }).catch(error => entryFailed(t, error));
    return false;
  };
  const swap = (next, place, done) => {
    // Physical games keep their player and voice in the hall through both sides of the scene handoff.
    const arcade = !next.enterSteps && active.voiceZone === "arcade.hall" && next.voiceZone === "arcade.hall";
    return arcade ? window.BL.net.handoffBody(() => swapScenes(next, place, done)) : swapScenes(next, place, done);
  };
  // Where a settled transition lands: its own scene, or where its preparation redirected it.
  const landing = (t) => t.redirect ? { next: scenes[t.redirect.scene], place: t.redirect.place ?? null } : { next: t.next, place: t.place };
  // A chunk a deploy removed can never load: the HUD's reload offer replaces "try again" (see deferred.js).
  const abandon = () => {
    if (window.BL.deferred.stale) window.BL.hud.offerReload();
    else window.BL.hud.toast("That place could not be opened · try again");
    router.abandon();
  };
  // Pure model construction happens before leaving the complete old visit. Only a finished cache is published;
  // no partial HUD, input, crew, or network state belongs to a scene that has not been entered.
  const buildLanding = (t) => {
    if (t.failed || t.buildStarted) return t.ready;
    t.buildStarted = true;
    const { next, place } = landing(t);
    if (!next.buildSteps) return true;
    t.building = true;
    holdInput(true);
    t.ready = false;
    const buildCtx = { ...ctx, place, from: active.id, signal: t.controller.signal };
    let steps;
    try { steps = models.withScope(next.id, () => next.buildSteps(buildCtx)); }
    catch (error) { t.failed = error; t.ready = true; t.building = false; return true; }
    window.BL.buildTasks.run(steps, next.id, t.controller.signal).then(() => {
      t.ready = true;
      t.building = false;
    }, error => {
      t.failed = error;
      t.ready = true;
      t.building = false;
      if (destroyed) { models.release(next.id, []); return; }
      const keep = [active.id];
      if (scenes.hub.retained && active.id !== "hub") keep.push("hub");
      models.release(next.id, keep, liveGeometry());
    });
    return false;
  };
  const settled = () => {
    const failed = transition.failed;
    transition.controller.abort();
    transition = null;
    if (active) holdInput(false);
    if (failed) cabinetView.failed();
    if (failed && active && active.stay) active.stay();
    router.settled();
  };
  const stepTransition = (dt) => {
    // A scene entering in slices carries the transition on when its last slice is done (`swap`'s `done`).
    if (transition.entering) {
      if (fade === 1 || transition.instant) transition.held += dt;
      return;
    }
    // An instant crossing (a doorway seen from the Ooga's eyes, a mirror) never goes black: the scene left keeps
    // playing while it prepares, and its last frame holds while the next one builds.
    if (transition.instant) {
      if (!transition.ready || !buildLanding(transition)) { transition.held += dt; return; }
      const arrive = () => { settled(); fade = 0; };
      if (transition.failed) abandon();
      else { const { next, place } = landing(transition); if (!swap(next, place, arrive)) return; }
      arrive();
      return;
    }
    transition.t += dt;
    if (transition.out) {
      fade = Math.min(1, transition.t / FADE);
      if (fade === 1) transition.held += dt;
      if (fade < 1 || !transition.ready || !buildLanding(transition)) return;
      const t = transition, fadeIn = () => { t.out = false; t.t = 0; };
      if (transition.failed) abandon();
      else { const { next, place } = landing(transition); if (!swap(next, place, fadeIn)) return; }
      fadeIn();
      return;
    }
    fade = 1 - Math.min(1, transition.t / FADE);
    if (fade === 0) settled();
  };
  // Fills in CSS pixels (clientWidth/clientHeight, cached above), not backing-store pixels.
  // A second on black, or waiting for an instant crossing, turns on the boot curtain's spinner.
  const SPINNER_AFTER = 1, SPINNER_R = 13, SPINNER_ACCENT = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ffd27a";
  const drawFade = () => {
    overlayCtx.globalAlpha = fade;
    overlayCtx.fillStyle = "#000000";
    overlayCtx.fillRect(0, 0, overlayCssW, overlayCssH);
    overlayCtx.globalAlpha = 1;
    if (!transition || transition.held < SPINNER_AFTER
      || !(fade === 1 || transition.instant && (!transition.ready || transition.entering))) return;
    const x = overlayCssW / 2, y = overlayCssH / 2, turn = elapsed / 0.9 % 1 * Math.PI * 2;
    // A transparent hold never redraws the scene's overlay. Erase only the old spinner, including stroke fringes.
    const pad = SPINNER_R + 3;
    if (fade < 1) overlayCtx.clearRect(x - pad, y - pad, pad * 2, pad * 2);
    if (transition.entryFailed) return;
    overlayCtx.lineWidth = 3;
    overlayCtx.strokeStyle = "rgba(243, 239, 228, 0.18)";
    overlayCtx.beginPath(); overlayCtx.arc(x, y, SPINNER_R, 0, Math.PI * 2); overlayCtx.stroke();
    overlayCtx.strokeStyle = SPINNER_ACCENT;
    overlayCtx.beginPath(); overlayCtx.arc(x, y, SPINNER_R, turn - Math.PI * 0.75, turn - Math.PI * 0.25); overlayCtx.stroke();
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
    // An unfocused tab, a transition building the next scene and a scene readying one are not evidence that the tier is too expensive.
    if (!document.hasFocus() || transition || active?.warming) { perf.frames = perf.total = perf.bad = 0; perf.since = 0; return; }
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
  };
  // Boot time is a device probe no browser can refuse: Safari masks GPU strings, where thresholds matter most.
  // BOOT_MEDIUM / BOOT_LOW measure synchronous CPU across prepare, construction slices and enter, without await
  // delays. Recalibrated 2026-09-24 against the hub as it now is: an M4 Max builds it in about 2.35 s, so the old 2200 started every machine at medium. The same ratio to
  // that fast build is kept, and the frame-interval auto-tier still steps a slow device down while it plays.
  const BOOT_MEDIUM = 3600, BOOT_LOW = 5400;
  const tierFromBoot = (ms) => {
    if (renderer.kind !== "webgl2") return;
    const wanted = ms > BOOT_LOW ? "low" : ms > BOOT_MEDIUM || MEMORY_LIMITED ? "medium" : null;
    if (!wanted || QUALITY_ORDER.indexOf(wanted) <= QUALITY_ORDER.indexOf(renderer.quality)) return;
    renderer.setQuality(wanted);
  };

  // Full rate while focused; 30 fps only when another window is in front.
  const WARMUP = 8;
  const UNFOCUSED_INTERVAL = 1000 / 30;
  let lastRender = 0;
  let renderedFrames = 0;
  let firstDraw = false, firstPlayable = false;
  // A first visit opens the Bananas panel a beat after the curtain (0.9 s) has parted on the world (`sheet.welcome`),
  // unless the visitor chose a panel, left the scene or began a game meanwhile. Quiet `nosim` pages (the suite, the
  // cards) opt out unless `welcome=1` asks; `welcome=0` turns it off anywhere.
  const WELCOME_MS = 1800;
  const WELCOME = params.get("welcome") === "1" || params.get("welcome") !== "0" && !params.has("nosim");
  let welcomeTimer = 0;
  const openCurtain = () => {
    curtain.addEventListener("transitionend", (e) => {
      if (e.propertyName === "transform") curtain.remove();
    });
    curtain.dataset.open = "true";
  };
  const frameInterval = () => (elapsed > WARMUP && !document.hasFocus() && !(active && active.inMotion) ? UNFOCUSED_INTERVAL : 0);

  const housekeep = () => { if (active) renderer.releaseUnused(liveGeometry()); };

  let elapsed = 0;
  let lastTime = performance.now();
  let raf = 0;
  // Shared by the display loop and the debug `advance`, so a stepped frame is exactly a displayed one.
  const step = (dt, now) => {
    gamepad.poll();
    elapsed += dt;
    if (transition) stepTransition(dt);
    // Hold the fully black frame while resumable pure builders run; the old visit keeps its graph and controls.
    if (transition && transition.building) { drawFade(); return; }
    // The panels hold the scene, unless a live session needs it to keep stepping.
    const panelHolds = helpHeld && !active.runsBehindPanels;
    if (panelHolds) dt = 0;
    if (!transition) holdInput(!!cabinetView.held);
    const sceneDt = cabinetView.held ? 0 : dt;
    sceneTime += sceneDt;
    // In real mode the API owns the pile, so every browser shows the same one: its last count less what has been
    // eaten since it arrived, in whole bananas.
    if (pileFeed.at) world.level = Math.min(pileMod.MAX_BANANAS, Math.max(0, Math.floor(pileFeed.bananas - pileFeed.eatPerHour * (performance.now() - pileFeed.at) / 36e5)));
    if (!panelHolds) active.update(sceneDt, sceneTime);
    showZoneLine();
    cabinetView.update(dt, active, !!openIntro() || !!active.cabinetMenu, !!transition);
    if (POSITION_DEBUG && active.id !== "hub" && elapsed >= positionDebugNext) {
      positionDebugNext = elapsed + 0.1;
      updatePositionDebug(false);
    }
    if (!helpHeld) agentPlay.update(sceneDt);
    updateWorldClock(now);
    const drawn = renderer.render(active.root, active.camera, active.renderOpts, activeMeshRigs);
    if (drawn && !firstPlayable && !curtain.isConnected && !inputHeld && !transition) {
      firstPlayable = true;
      mark("first-playable");
    }
    if (drawn && !firstDraw) {
      firstDraw = true;
      mark("drawn");
      openCurtain();
      if (WELCOME) {
        const landed = active;
        welcomeTimer = window.setTimeout(() => {
          welcomeTimer = 0;
          if (!transition && active === landed) window.BL.sheet.welcome();
        }, WELCOME_MS);
      }
      if (params.get("signin") === "contributor-required") {
        window.BL.hud.toast("Sign-in is for contributors with their own Ooga. Keep exploring signed out.");
        params.delete("signin");
        const back = new URL(location.href); back.searchParams.delete("signin");
        history.replaceState(history.state, "", back.pathname + back.search + back.hash);
      }
    }
    if (!drawn && renderer.failure && !params.has("canvas2d")) {
      console.warn("WebGL2 programs failed, reloading with the Canvas 2D fallback", renderer.failure);
      params.set("canvas2d", "1");
      location.replace(`${location.pathname}?${params}${location.hash}`);
      return;
    }
    active.input.update();
    active.overlay(sceneDt);
    cabinetView.afterDraw();
    if (fade > 0 || transition && transition.instant && !transition.ready) drawFade();
  };
  const FRAME_ERRORS_MAX = 30;
  let frameErrors = 0;
  const frame = (now) => {
    raf = window.requestAnimationFrame(frame);
    const interval = frameInterval();
    if (interval && now - lastRender < interval - 1) return;
    const delivered = now - lastRender;
    lastRender = now;
    renderedFrames++;
    if (renderedFrames <= 3) mark(`frame${renderedFrames}`);
    // A frame's timestamp is when it began, which can come before the `performance.now()` that the debug
    // `advance` just wrote into lastTime: a negative step would run the scene backwards.
    const dt = Math.max(0, Math.min(0.1, (now - lastTime) / 1e3));
    lastTime = now;
    // Only a displayed frame carries a real interval; `advance` must not tier. A step resizes the canvas, which
    // clears it, so it comes before this frame's draw: after it, the browser presented one black frame.
    if (!interval) autoTier(delivered, now);
    // A throw every frame stops the picture while the panels, chat and voice carry on: report it once, and after a
    // moment offer the way out rather than leave the visitor with a frozen screen.
    try { step(dt, now); frameErrors = 0; }
    catch (error) {
      if (++frameErrors === 1) reportError(error);
      if (frameErrors === FRAME_ERRORS_MAX) window.BL.hud.offerReload("Ooga Booga Land hit a problem");
    }
  };

  let rightShift = false;
  const clearRightShift = (e) => {
    if (e.type === "blur" || e.key === "Shift" && (e.code === "ShiftRight" || e.location === 2)) rightShift = false;
  };
  const onKeyDown = (e) => {
    if (transition && transition.entering) { e.stopImmediatePropagation(); return; }
    if (!active) return;
    if (e.key === "Shift" && (e.code === "ShiftRight" || e.location === 2)) rightShift = true;
    if (e.repeat) return;
    if (window.BL.controls.uiKey(e)) return;
    const intro = openIntro();
    if (cabinetView.active && e.key === "Escape" && (intro || active.cabinetMenu)) {
      e.preventDefault(); e.stopImmediatePropagation(); go("arcade"); return;
    }
    if (intro) {
      // Registered at boot, before any scene's controls, so this keeps the key from them too.
      e.stopImmediatePropagation();
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        intro.hidden = true;
      }
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    konamiAt = key === KONAMI[konamiAt] ? konamiAt + 1 : key === KONAMI[0] ? 1 : 0;
    if (konamiAt === KONAMI.length) {
      konamiAt = 0;
      feedPanel.toggle();
    }
    if (TEST_DONATIONS && key === "l" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (transition) return;
      const shown = active.previewDonation && active.previewDonation();
      window.BL.hud.toast(shown ? "Test donation animation · real totals unchanged"
        : active.previewDonation ? "Waiting for the local donation backend" : "Enter the mainland or Lightning Factory to preview a donation");
      return;
    }
    // Game scenes can expose a dedicated Agent. Hub companions are selected
    // directly; Right Shift+A never creates another gorilla there. Left Shift+A runs left.
    if ((active.agent || active.summonAgent) && e.shiftKey && rightShift
      && !e.metaKey && !e.ctrlKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      if (transition) return;
      if (agentPlay.active) agentPlay.stop();
      else agentPlay.start(active);
      return;
    }
    if (e.shiftKey && rightShift
      && !e.metaKey && !e.ctrlKey && (e.key === "R" || e.key === "r")) {
      e.preventDefault();
      game.resetAll();
      location.reload();
      return;
    }
    // With voice off, M retains the environment shortcut outside focused UI.
    if (key === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      sound.toggle();
      return;
    }
    // L is the room's while one takes voice links (a demo tip is the scene's otherwise); H is the scene's first, for a
    // forklift's horn, and the raised hand's when the scene had no use for it. Shift still counts, since it is the run key.
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    if (key === "l" && plain && net.linkEveryone()) { e.preventDefault(); return; }
    // Every scene's B shortcut adds demo bananas; ordinary visits leave donations to the feed.
    if (key === "b" && !DEBUG) return;
    const used = active.onKey(e);
    if (key === "h" && plain && !used && window.BL.reactions.toggleHand()) e.preventDefault();
  };
  const onVisibility = () => {
    // A hidden tab holds no sockets; the chain's REST polls already skip themselves while hidden.
    mempool.setHidden(document.hidden);
    chain.setHidden(document.hidden);
    if (document.hidden) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf && (active || transition && transition.entering)) {
      // The time away is no frame interval: the first one back would close a tier window as slow on its own.
      lastTime = lastRender = performance.now();
      perf.frames = perf.total = perf.since = perf.bad = 0;
      raf = window.requestAnimationFrame(frame);
    }
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", clearRightShift);
  window.addEventListener("blur", clearRightShift);
  document.addEventListener("visibilitychange", onVisibility);
  if (params.has("nosim")) donations.config.simulate = false;
  // The live feeds stay off under nosim (the suite) and mempool=0 / oogatron=0 / chain=0;
  // checks drive the hub's weather through emit and apply, and the jumbotron through refreshData.
  const mempool = window.BL.mempool;
  const chain = window.BL.chain;
  let shownBlockHeight = -1;
  const showBlockHeight = (snapshot) => {
    const height = Number.isInteger(snapshot.height) && snapshot.height > 0 ? snapshot.height : 0;
    if (height === shownBlockHeight) return;
    shownBlockHeight = height;
    worldBlockHeight.textContent = height ? height.toLocaleString("en-US") : "\u2014";
    worldBlock.setAttribute("aria-label", height ? `Bitcoin block height ${height}` : "Bitcoin block height unavailable");
  };
  const unsubscribeBlockHeight = chain.subscribe(showBlockHeight);
  const unsubscribeBlockFeed = mempool.subscribe((event) => {
    if (event.type === "block") showBlockHeight(event);
  });
  showBlockHeight(chain.snapshot);
  if (!params.has("nosim") && params.get("mempool") !== "0") mempool.start();
  if (params.has("nosim") || params.get("rate") === "0") window.BL.donationRate.stop();
  // Contributor activity belongs to the page, including while the hub is suspended or absent.
  const unsubscribeOogatron = window.BL.oogatronLive.subscribe((event) => {
    if (event.type === "stats") window.BL.contributors.applySnapshot(event.stats);
  });
  if (!params.has("nosim") && params.get("oogatron") !== "0") window.BL.oogatronLive.start();
  // Merge Rock's merges: one request every few minutes for all its totems (repo-feed.js).
  if (!params.has("nosim") && params.get("repos") !== "0") window.BL.repoFeed.start();
  // `?chain=esplora` or `?chain=https://host/api` pins the provider; otherwise mempool.space leads
  // and three consecutive failures hand the session to Esplora on its own.
  if (!params.has("nosim") && params.get("chain") !== "0") chain.start({ source: params.get("chain") });
  // The account needs the Worker: without one /api/me finds nothing and the sheet shows no sign-in.
  const net = window.BL.net;
  const unsubscribeAccount = net.subscribe(window.BL.hud.showAccount);
  // A new room connection or account reopens no earlier outdoor grant (outdoor-scope.js `reset`).
  let scopeRoom = net.state.room, scopeMe = net.state.me?.id ?? 0;
  const unsubscribeScope = net.subscribe((state) => {
    const me = state.me?.id ?? 0;
    if (state.room === scopeRoom && me === scopeMe) return;
    scopeRoom = state.room;
    scopeMe = me;
    window.BL.outdoorScope.reset();
  });
  const unsubscribeVoice = window.BL.voice.subscribe(() => window.BL.hud.showAccount(net.state));
  // The roster's host dot and voice marks follow the room and voice, on whichever scene's roster is up.
  const unsubscribeRosterMarks = net.subscribeRoster(window.BL.hud.showVoices);
  const unsubscribeVoiceMarks = window.BL.voice.subscribe(window.BL.hud.showVoices);
  const unsubscribeMic = window.BL.voice.subscribe(showMic);
  const accountReady = !params.has("nosim") && params.get("net") !== "0" ? net.start() : Promise.resolve();
  // A tab opened in the background waits for its first look before it holds any socket.
  if (document.hidden) {
    mempool.setHidden(true);
    chain.setHidden(true);
  }
  // Each donation goes to the active scene with the API's banana count (null when simulated); in real mode the pile
  // follows the API's. The page's own Worker turns real mode on in the account's look at /api/me, so the subscription
  // waits for that look (bounded, as the boot's wait is) and a page about to go real never plays a simulated tip. A
  // donation pushed before the first scene is ready joins a bounded replay queue and counts once on arrival. An
  // on-chain tip the visitor left the kiosk waiting on says it was theirs, in whatever scene they are, in place of the scene's own toast.
  const pileFeed = { bananas: 0, eatPerHour: 0, at: 0 };
  let unsubscribeDonations = null;
  accountReady.then(() => {
    if (destroyed) return;
    if (net.state.donations) donations.useOrigin();
    // A Worker's page whose look went unanswered knows nothing of its API: no made-up tips under the visitor's own name.
    else if (net.state.started && !net.state.backend && document.documentElement.dataset.workerPage === "1") donations.config.simulate = false;
    unsubscribeDonations = donations.subscribe((donation, bananas) => {
      if (donations.receivedOwnInvoice(donation.id)) game.rememberHandle(donation.handle);
      window.BL.donationPopup.receive(donation, bananas);
      deliverDonation(donation, bananas);
      window.BL.hud.setDonationStats(game.state);
      if (donations.waited(donation.id)) {
        const n = bananas && bananas.rounded;
        window.BL.hud.toast(`Your on-chain tip confirmed · ${gameMod.formatLarge(donation.sats)} sats${n ? ` · ${gameMod.formatLarge(n)} banana${n === 1 ? "" : "s"}` : ""}`);
      }
    }, {
      identity: () => game.state,
      // An on-chain payment seen before its block: the active scene shows it where it can (the kiosk that made the
      // invoice), and otherwise one the visitor left the kiosk waiting on says it is on its way, or what is still owed.
      onSeen: (id, sats, due, left, pricing) => {
        if (window.BL.donationPopup.seen(id, sats, due, left, pricing)) return;
        if (active && active.onSeen && active.onSeen(id, sats, due, left, pricing)) return;
        if (donations.waitingOn(id)) window.BL.hud.toast(left ? `Your on-chain tip arrived short · send ${gameMod.formatLarge(left)} more sats to the same address` : "Your on-chain tip is on its way · waiting for a block");
      },
      onPile: ({ bananas, eatPerHour }) => Object.assign(pileFeed, { bananas, eatPerHour, at: performance.now() })
    });
  });
  // The feed panel: the Konami code toggles a page-wide readout of the socket, its counters and its last events.
  // It subscribes and ticks only while open, and its text nodes change only with their value.
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  const FEED_LOG = 24, FEED_TICK = 250;
  let konamiAt = 0;
  const feedPanel = (() => {
    const el = document.getElementById("feed-debug"), stateEl = document.getElementById("feed-debug-state"), logEl = document.getElementById("feed-debug-log");
    const log = new Array(FEED_LOG).fill("");
    let logNext = 0, logCount = 0, timer = 0, unsubscribe = null, dirty = false;
    const stamp = () => new Date().toTimeString().slice(0, 8);
    const push = (line) => {
      log[logNext] = `${stamp()}  ${line}`;
      logNext = (logNext + 1) % FEED_LOG;
      if (logCount < FEED_LOG) logCount++;
      dirty = true;
    };
    const describe = (e) => e.type === "stats" ? `stats  ${e.count} tx · ${e.vsize} vB · inflow ${e.inflow} vB/s`
      : e.type === "block" ? `block  ${e.height} · ${e.txCount} tx`
      : e.type === "fees" ? `fees   next block ${e.nextFee.toFixed(2)} sat/vB · ${e.blocks} projected`
      : `${e.type}`;
    const render = () => {
      // The rally exposes a `weather` of its own with no `state`; only the hub's answers this panel.
      const d = active && active.debug && active.debug.weather, w = d && d.state ? d : null, s = mempool.state, c = chain.snapshot;
      const link = !s.enabled ? "off (nosim or mempool=0)" : s.connected ? `connected · attempt ${s.attempts}` : `reconnecting · attempt ${s.attempts}`;
      const age = s.lastAt ? `${((Date.now() - s.lastAt) / 1000).toFixed(1)} s ago` : "none yet";
      const text = `socket    ${link}\nlast msg  ${age}${s.lastKeys ? ` · ${s.lastKeys}` : ""}\nmessages  ${s.messages} · ${(s.bytes / 1024).toFixed(0)} KB\nchain     height ${s.height} · next block ${s.nextFee.toFixed(2)} sat/vB · ${s.projectedBlocks} projected\nevents    ${s.stats} stats · ${s.blocks} blocks · inflow ${s.inflow} vB/s\npool      ${c.count} tx · ${c.deep.toFixed(1)} blocks deep · paying ${c.paying.toFixed(2)} MvB (avg ${c.payEma.toFixed(2)}) · floor ${c.floor.toFixed(2)} sat/vB · via ${c.source}${c.degraded ? " (fallback)" : ""}\nprice     ${c.priceUsd ? c.priceUsd.toFixed(2) : "-"} · via ${c.priceSource || "-"}\naxes      arriving ${c.gale.toFixed(2)} (weather) · paying ${c.soak.toFixed(2)} (data) · pace ${(c.pace / 60).toFixed(1)} min\nweather   ${w ? `${w.state.name} · arrivals ${w.state.arrivals} · storm ${w.state.storm.toFixed(2)} · ${w.state.drops}/${w.state.capacity} drops · wind ${w.state.wind.toFixed(1)} · cloud ${w.state.cloud.toFixed(2)} · ${w.state.strikes} strikes` : "no weather in this scene"}`;
      if (stateEl.textContent !== text) stateEl.textContent = text;
      if (!dirty) return;
      dirty = false;
      let lines = "";
      for (let i = 0; i < logCount; i++) lines += `${log[(logNext - logCount + i + FEED_LOG) % FEED_LOG]}\n`;
      logEl.textContent = lines || "no events yet";
    };
    const open = () => {
      el.hidden = false;
      dirty = true;
      render();
      unsubscribe = mempool.subscribe((e) => push(describe(e)));
      timer = window.setInterval(render, FEED_TICK);
    };
    const close = () => {
      el.hidden = true;
      window.clearInterval(timer);
      timer = 0;
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
    };
    const toggle = () => (el.hidden ? open() : close());
    document.getElementById("feed-debug-close").addEventListener("click", close);
    return { toggle, close, get open() { return !el.hidden; }, get logged() { return logCount; } };
  })();
  const housekeepTimer = window.setInterval(housekeep, 6e4);
  // EntropyLab currently lives in its island cave; retain the isolated scene for debug checks only.
  // The character studio (scene-studio.js) is a debug page too.
  const routed = router.current();
  const requestedScene = (routed && routed.scene) || params.get("scene") || (WIP !== "1" ? WIP : null);
  const sceneId = requestedScene === "race" && !RALLY_TEST ? "arcade" : (requestedScene === "lab" || requestedScene === "studio") && !DEBUG ? null : requestedScene;
  // Building the first scene holds the main thread with nothing painted yet.
  // Run boot from a task after the first frame so the leaf curtain is on screen, not the previous page.
  let destroyed = false;
  const bootBuildController = new AbortController();
  // On where `npm run site` packaged the terrain Worker and the device keeps the hub (`TERRAIN_CACHE`).
  const terrainController = TERRAIN_CACHE ? new AbortController() : null;
  // Its chunk downloads beside the account lookup and the first frame, not after them; boot's own load below takes
  // the same request, or retries a failed one.
  const ISLAND_FIRST = ["hub", "drop", "orbit"].includes(Object.hasOwn(scenes, sceneId) ? sceneId : Object.keys(scenes)[0]);
  if (terrainController && ISLAND_FIRST) window.BL.deferred.load("terrain-cache")?.catch(() => {});
  const boot = async () => {
    // A signed-in newcomer must join before crew construction, including direct routes.
    // net.start is bounded; an unavailable backend leaves the static island usable.
    await accountReady;
    if (destroyed) return;
    // Explicit debug fixtures retain their own cast and arrival; ordinary routes start with this visitor's Ooga.
    if (!DEBUG) world.pilot = net.prepareLocalCharacter().handle;
    const constructionCPU = window.BL.buildTasks.cpu;
    let first = Object.hasOwn(scenes, sceneId) ? scenes[sceneId] : scenes[Object.keys(scenes)[0]], place = routed && routed.place;
    if (!DEBUG && BL.arcadeCabinets.get(first.id)) { place = `cabinet:${first.id}`; first = scenes.arcade; }
    if (terrainController && ISLAND_FIRST) {
      try {
        const ready = window.BL.deferred.load("terrain-cache"); if (ready) await ready;
        const factory = first.id === "hub" && window.BL.caves.slots.find(slot => slot.status === "open" && slot.scene === "factory");
        const roofHole = factory ? { id: factory.id, ...window.BL.factoryModels.ROOF_TUBE } : null;
        const nook = first.id === "hub" ? first.libraryNook || null : null;
        await window.BL.terrainCache.prepare({ seed: 1, roofHole, nook }, first.id, terrainController.signal);
      } catch { /* A rejected opt-in build uses the ordinary path unless this page was destroyed. */ }
      if (destroyed) { models.release(first.id, []); return; }
    }
    if (first.prepare) {
      try {
        const redirect = await window.BL.buildTasks.measure(() => models.withScope(first.id, () => first.prepare(place, { ...ctx, signal: bootBuildController.signal }, first.id)));
        if (redirect) ({ next: first, place } = landing({ redirect }));
      } catch {
        models.release(first.id, []);
        if (destroyed) return;
        first = scenes[Object.keys(scenes)[0]];
        place = null;
        window.BL.hud.toast("That place could not be opened · here is the island");
      }
      if (destroyed) { models.release(first.id, []); return; }
    }
    // Nothing has drawn yet, so a failed boot lifts the curtain off the Reload notice entryFailed offers.
    const bootFailed = (error) => { failBootDonations(); entryFailed(null, error); openCurtain(); };
    if (first.buildSteps) {
      try {
        const steps = window.BL.buildTasks.measure(() => models.withScope(first.id, () => first.buildSteps({ ...ctx, place, signal: bootBuildController.signal })));
        await window.BL.buildTasks.run(steps, first.id, bootBuildController.signal);
      } catch (error) {
        models.release(first.id, []);
        if (destroyed) return;
        if (first.id === Object.keys(scenes)[0]) { bootFailed(error); return; }
        first = scenes[Object.keys(scenes)[0]];
        place = null;
        window.BL.hud.toast("That place could not be opened · here is the island");
      }
      if (destroyed) { models.release(first.id, []); return; }
    }
    let uploadCPU = 0;
    if (first.enterSteps) {
      // Boot gives the event loop the same responsive construction path as a scene swap. Scenes without steps keep
      // their ordinary enter; GPU upload timing stays out of the construction input used to choose the opening tier.
      try {
        holdInput(true);
        const retainedTime = arriving(first, place);
        const steps = models.withScope(first.id, () => first.enterSteps(ctx));
        const step = window.BL.buildTasks.measure(() => models.withScope(first.id, () => steps.next()));
        const finish = () => window.BL.buildTasks.measure(() => { arrived(first, place, retainedTime); finishBootDonations(); });
        if (step.done) finish();
        else {
          active = null;
          const rest = (function* () {
            yield* steps;
            yield;
            const beforeUpload = performance.now();
            yield* renderer.prepareSteps(first.root, first.renderOpts?.meshRigs === true, { until: beforeUpload + window.BL.buildTasks.SLICE_MS / 2 });
            uploadCPU = performance.now() - beforeUpload;
          })();
          await window.BL.buildTasks.run(rest, first.id, bootBuildController.signal);
          finish();
        }
      } catch (error) {
        if (destroyed) { models.release(first.id, []); return; }
        bootFailed(error); return;
      }
    } else {
      try { window.BL.buildTasks.measure(() => { enter(first, place); finishBootDonations(); }); }
      catch (error) {
        if (destroyed) { models.release(first.id, []); return; }
        bootFailed(error); return;
      }
    }
    mark("core-ready");
    mark("ready");
    // A restored island counts as the build it replaced, so the cache never starts a device a tier higher.
    tierFromBoot(window.BL.buildTasks.cpu - constructionCPU - uploadCPU + (window.BL.terrainCache?.stats.credit || 0));
    raf = window.requestAnimationFrame(frame);
    if (terrainController && window.BL.terrainCache?.stats.lastSource === "miss") fillTerrain();
  };
  // After a cache miss the island was built here as usual; at idle, never during a transition, the Worker builds the
  // snapshot and stores it for the next visit. Nothing waits on it, and nothing happens without a miss to fill.
  const fillTerrain = () => {
    const idle = typeof window.requestIdleCallback === "function";
    const start = () => {
      if (destroyed) return;
      if (transition) { schedule(); return; }
      window.BL.terrainCache.fill(terrainController.signal)?.catch(() => {});
    };
    const schedule = () => (idle ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 1000));
    schedule();
  };
  window.requestAnimationFrame(() => window.setTimeout(boot, 0));
  if (DEBUG) {
    const ooga = {
      game,
      cabinet: cabinetView,
      renderer,
      startLevel: START_BANANAS,
      hubPolicy: ctx.hubPolicy,
      testBananas: TEST_BANANAS,
      project: renderer.project,
      housekeep,
      go,
      mempool,
      feedPanel,
      // Whole frames at a fixed step without waiting on the display: a check runs seconds of play in little wall time.
      advance: (seconds, dt = 1 / 60) => {
        for (let n = Math.round(seconds / dt); n > 0; n--) {
          renderedFrames++;
          step(dt, performance.now());
        }
        lastTime = performance.now();
      },
      // Null while a scene enters in slices: the departed one has gone and the next has not arrived.
      get scene() {
        return active ? active.id : null;
      },
      get transitioning() {
        return transition !== null || !!cabinetView.held;
      },
      get fade() {
        return fade;
      },
      get input() {
        return active && active.input;
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
      stats: () => ({ ...(active ? active.stats() : {}), gl: renderer.stats || null, dom: document.getElementsByTagName("*").length }),
      get level() {
        return world.level;
      }
    };
    for (const key of ["slots", "drops", "core", "shell", "delivery", "spillEffect", "cavemen", "lab", "headquarters", "hud", "demoTip", "setPileLevel", "refreshStates", "trimPool", "shown", "island", "mouths", "labels", "camera", "cameraCave", "crew", "fx", "controls", "props", "altar", "path", "scenery", "jetpack", "magazine", "mirrorCave", "matrixCave", "matrixGate", "pilot", "renderOpts", "lamps", "lighting", "fireSeats", "critters", "storm", "daylight", "setHour", "track", "racers", "items", "race", "audio", "weather", "drop", "diver", "plane", "course", "jumbotron", "repoIsland", "fireworks", "fireworksPending", "orbit", "flight", "site", "agent", "poolIsland", "mine", "block", "dsb", "clankers", "clankerPlay", "factory", "hangar", "bifrost", "arcade", "carnival", "npcSync", "footsteps", "timechain", "studio", "halloween" /* HALLOWEEN */]) {
      Object.defineProperty(ooga, key, { get: () => active && active.debug && active.debug[key], enumerable: true });
    }
    window.__ooga = ooga;
  }
  const destroy = () => {
    cabinetView.dispose();
    controlsHelp.dispose();
    destroyed = true;
    bootBuildController.abort();
    transition?.controller.abort();
    // A scene entering in slices stops at its next slice; the page is going, so nothing of it is entered.
    if (transition && transition.entering) visitController.abort();
    terrainController?.abort();
    window.cancelAnimationFrame(raf);
    window.clearInterval(housekeepTimer);
    window.clearTimeout(welcomeTimer);
    overlayObserver.disconnect();
    if (unsubscribeDonations) unsubscribeDonations();
    unsubscribeBlockFeed();
    unsubscribeBlockHeight();
    feedPanel.close();
    window.BL.donationPopup.dispose();
    router.dispose();
    mempool.dispose();
    chain.dispose();
    unsubscribeOogatron();
    window.BL.oogatronLive.dispose();
    unsubscribeAccount();
    unsubscribeScope();
    unsubscribeVoice();
    unsubscribeRosterMarks();
    unsubscribeVoiceMarks();
    unsubscribeMic();
    window.BL.voice.dispose();
    window.BL.highscores.dispose();
    net.dispose();
    offSound(); soundButton.removeEventListener("click", sound.toggle);
    window.removeEventListener("keydown", onVoiceMuteKey, true);
    offPad();
    padSettings.dispose();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", clearRightShift);
    window.removeEventListener("blur", clearRightShift);
    for (const type of HELD_EVENTS) window.removeEventListener(type, heldEvent, true);
    document.removeEventListener("sheetchange", holdSheets);
    document.removeEventListener("pointerdown", focusWorld, true);
    document.removeEventListener("visibilitychange", onVisibility);
    positionDebug.removeEventListener("click", copyPositionDebug);
    try {
      if (active) active.leave(true);
      if (scenes.hub.retained) scenes.hub.leave(true);
    }
    finally { if (visitController) visitController.abort(); renderer.dispose(); }
  };
  window.addEventListener("pagehide", (e) => {
    if (!e.persisted) destroy();
  });
})();
