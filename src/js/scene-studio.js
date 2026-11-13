// The character studio: one Ooga alone on a bare pad, for a player and their agent to look at a character they are
// making (docs/make-your-ooga.md). `npm run character:studio -- <handle>` serves the source tree and opens it; any
// debug page reaches it at ?debug=1&scene=studio&character=<handle>, and no other page does. A handle with no file in
// src/characters is drawn as the hashed Ooga a new contributor gets, `build=slim` its female build.
//
// The pad holds what an Ooga does with its body in the game, each through the game's own system, so what shows here
// is what the island will show: a chair to sit on and places on the ground round the fire, as the island's Oogas sit
// by theirs (crew.js `sitPlayer`, a `ground` seat propping the free arm), a mattress to sleep on (`sleepPlayer`, the
// movement keys turning the sleeper over), a hammock between two posts (hub-hammock.js, a legged pet lying down
// beside it) and the island's fire (blaze.js). The rifle comes out with 2 or its button in the
// banner, which slings what the hand held onto the back, the jetpack goes on with J or its button, and the views are
// the pilot's. The studio's own buttons run down the left side (`.studio-side`): they put the Ooga in each place
// without the walk (`studio-<place>`) and choose the view (the first person, the third person from behind and a
// little above, or in combat over its shoulder, and a free camera flown anywhere over the ground), the night and,
// for an Ooga with no file, its build; Speak says its voice lines in turn. Beside the controls button a list of every Ooga by name (`#studio-pick`)
// shows another in the same place, gear and view. Down the right side the This Ooga panel (`#studio-features`) lists
// what the Ooga's file gives it and how much of the intake's 32,768 bytes it takes. The title reads OBL, and the Bananas and Oogas panels, the sound
// button, the clock and the block height are left out: there is one Ooga here, nobody to feed and no island to tell
// the time on. `__ooga.studio` does the same for a script (`place(id)`, `toggle(name)` with the rifle and the jetpack
// too, `show(handle)`, `state`).
//
// Opened by the studio command (`watch=1`) the page asks its server once a second whether a character file changed,
// and reloads when one has, coming back to the same place, gear and view. Those are kept for each Ooga, and for the
// next session too (localStorage `ooga-studio`, checked on load), as is the panel's fold and width. A file that no longer parses is reported in a toast and the Ooga on screen stays as it was.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, hubModels, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod, crew: crewMod } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const params = new URLSearchParams(location.search);
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const WATCH = params.get("watch") === "1", STORE = "ooga-studio", STAND_IN = "studio-stand-in";
  // The pad: a round lawn in metre rings, `WALL` how far out feet go. Its furniture keeps to the middle; the outer
  // half is open ground to walk and run on.
  const PAD = 18, WALL = 17.3;
  const VIEW = { yaw: 0, pitch: 0.2, dist: 5.2 };
  const HOME = { x: 0, z: 1.2 };
  // The fire's places to sit on the ground: the island's ring of six (scene-hub.js `FIRE_SEATS`, `FIRE_SEAT_RADIUS`).
  const CHAIR = { x: 4.7, z: -1.4, top: 0.5 }, FIRE = { x: 3.3, z: 3.5, r: 0.85, seats: 6, out: 1.8 };
  const BED = { x: -4.9, z: 0.6 }, HAMMOCK = { z: -5, half: 2.7, post: 0.13, tall: 3.5, wide: 0.575, reach: 0.3 };
  const DAY = 13, NIGHT = 22.5, DAY_OF_YEAR = 80;
  const PLACES = ["stand", "chair", "bed", "hammock", "fire"];
  const TOGGLES = ["rifle", "jetpack", "eyes", "third", "combat", "free", "night"];
  // The third person while carrying: combat's shoulder distance (pilot.js `SHOULDER_DISTANCE`), looking a little down.
  const THIRD = { dist: 3.6, pitch: 0.4 };
  // The free camera: how fast its point flies (faster the further out it looks from), climbs and turns by the keys,
  // how near and far it looks from, and the least height of its eye, which never goes under the ground.
  const FREE = { speed: 3, perDist: 0.45, climb: 2.6, turn: 1.7, near: 0.5, far: 26, floor: 0.2, low: -1.45, high: 1.5, out: PAD + 6, top: 12 };
  const NO_ACTORS = [];
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, moonSun: { x: 0, y: -1, z: 0 }, celestialPole: { x: 0, y: 0.34, z: -0.94 }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0, moonIllumination: 1, moonPhase: 0.5, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002,
    time: 0, bloomStrength: 0.5, lights: new Float32Array(8), lightCount: 1, shadowCenter: { x: 0, y: 1, z: 0 }, shadowExtent: 13
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  const JETPACK = { owned: true, equipped: false, fuel: 1, blocked: false };
  const MOON = { set: false, at: { x: 0, y: 1, z: 0 }, sun: { x: 0, y: -1, z: 0 } };

  // ---- the pad's furniture, each built once a page ----
  const TIMBER = "#8a5a32", TIMBER_DK = "#5c3a1e", TIMBER_LT = "#a8703e";
  const GRASS = [[104, 148, 66], [96, 140, 60]], EARTH = [[122, 92, 60], [98, 72, 46], [74, 54, 36]];
  // A lawn in metre rings over a keel of earth, so sizes read at a glance and the pad stands in the sky as the island does.
  const pad = models.cached(() => {
    const profile = [[0, -9], [5, -7], [12.5, -3.4], [PAD, -0.7], [PAD, 0]], segments = 72;
    for (let r = PAD - 1; r >= 0; r--) profile.push([r, 0]);
    const geo = models.lathe({ profile, segments, color: "#000000" });
    geo.faces.forEach((f, k) => { const band = Math.floor(k / segments); f.color = band < 3 ? EARTH[2 - band] : band === 3 ? EARTH[0] : GRASS[band % 2]; });
    return geo;
  });
  // A chunky timber chair, built facing +z with its seat's top at CHAIR.top.
  const chair = models.cached(() => {
    const parts = [models.bevelBox({ w: 0.54, h: 0.08, d: 0.52, color: TIMBER_LT, offset: { y: CHAIR.top - 0.04 } })];
    for (const x of [-0.22, 0.22]) {
      parts.push(models.box({ w: 0.08, h: CHAIR.top - 0.08, d: 0.08, color: TIMBER_DK, offset: { x, y: (CHAIR.top - 0.08) / 2, z: 0.2 } }));
      parts.push(models.box({ w: 0.08, h: 1.12, d: 0.08, color: TIMBER_DK, offset: { x, y: 0.56, z: -0.22 } }));
    }
    for (const y of [0.78, 1]) parts.push(models.bevelBox({ w: 0.5, h: 0.11, d: 0.05, color: TIMBER, offset: { y, z: -0.22 } }));
    return models.merge(...parts);
  });
  const posts = models.cached(() => models.shaded([-1, 1].map((s) => hubModels.log(s * HAMMOCK.half, 0, HAMMOCK.z, s * HAMMOCK.half, HAMMOCK.tall, HAMMOCK.z, HAMMOCK.post, TIMBER_DK))));

  // One visit's state: made in enter(), dropped in leave().
  let renderer, game, go, root, camera, hud, hooks, input, pilot, fx, crew, footsteps, cave, entry, hammock, bed, fire, embers, seats, blocks, buttons;
  // Who is wanted on the pad: the address's Ooga as the page loads, then whoever the list or a script asks for.
  let asked = (params.get("character") || "").trim();
  let night = false, combatShown = null, nearKey = "", spoken = 0, watchTimer = 0, watchVersion = null, watchError = "", broken = "", homeLink = null, homeTitle = "", homeWords = "", pick = null, titled = false;

  // What stands in a walker's way: the chair, the fire and the hammock's posts, each a circle.
  const blocked = (x, z, r) => {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i], dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz < (b.r + r) * (b.r + r)) return true;
    }
    return false;
  };
  // The hammock's bed is a wall to walk into, as an occupied one is on the island (hub-hammock.js `blocks`, with the
  // island's own reach): whoever is within it already may move, so a pet reaches its spot close beside the cloth.
  const onCloth = (x, z) => Math.abs(x - hammock.plan.x) < hammock.plan.swing.body.half + HAMMOCK.reach && Math.abs(z - hammock.plan.z) < HAMMOCK.wide + HAMMOCK.reach;
  const walkable = (fromX, fromZ, toX, toZ, y, height, actor) => toX * toX + toZ * toZ < WALL * WALL && !blocked(toX, toZ, actor ? actor.bodyRadius : 0.35)
    && (!onCloth(toX, toZ) || onCloth(fromX, fromZ));
  // The lawn, or the mattress under feet that have stepped up onto it, as in the headquarters.
  const onBed = (x, z) => Math.abs(x - BED.x) < bed.width / 2 && Math.abs(z - BED.z) < bed.depth / 2;
  const groundAt = (x, z) => bed && onBed(x, z) ? bed.sleep.surface : 0;
  const clampTarget = (t) => {
    const r = Math.hypot(t.x, t.z);
    if (r > WALL) { t.x *= WALL / r; t.z *= WALL / r; }
  };
  const clampCamera = (p) => {
    const r = Math.hypot(p.x, p.z), far = PAD + 9;
    if (r > far) { p.x *= far / r; p.z *= far / r; }
    p.y = clamp(p.y, r < PAD ? 0.25 : -4, 14);
  };

  // The sky and its light for the hour, sampled when it changes; the fire lights the pad at night.
  const light = () => {
    // The moon keeps its place in the sky by day and by night: the night's, which lights the pad then.
    if (!MOON.set) {
      BL.daylight.sample(NIGHT, RENDER_OPTS, DAY_OF_YEAR);
      Object.assign(MOON.at, RENDER_OPTS.moon); Object.assign(MOON.sun, RENDER_OPTS.moonSun);
      MOON.set = true;
    }
    BL.daylight.sample(night ? NIGHT : DAY, RENDER_OPTS, DAY_OF_YEAR);
    Object.assign(RENDER_OPTS.moon, MOON.at); Object.assign(RENDER_OPTS.moonSun, MOON.sun);
    // Its button says which it is now, and a press brings the other.
    buttons.night.textContent = night ? "Night" : "Day";
    buttons.night.title = night ? "It is night: press for day" : "It is day: press for night";
  };
  // A switch's button, lit while on; written only when it changes.
  const press = (name, on) => {
    const b = buttons[name];
    if (!b || b.lit === !!on) return;
    b.lit = !!on;
    b.setAttribute("aria-pressed", on ? "true" : "false");
  };

  // ---- places ----
  const seatNear = (x, z, feet) => {
    if (feet > 0.3) return null;
    let best = null, reach = 1.3;
    for (const seat of seats) {
      const d = Math.hypot(seat.x - x, seat.z - z);
      if (!seat.sitter && d < reach) { best = seat; reach = d; }
    }
    return best;
  };
  const bedNear = (x, z, feet) => feet < bed.sleep.surface + 0.1 && Math.abs(x - BED.x) < bed.width / 2 + 0.75 && Math.abs(z - BED.z) < bed.depth / 2 + 0.75;
  const HAMMOCK_FROM = { x: 0, z: 0 };
  const hammockNear = (x, z, feet) => {
    if (!hammock.reachable(x, feet, z, 1.15)) return null;
    HAMMOCK_FROM.x = x; HAMMOCK_FROM.z = z;
    return hammock.free(HAMMOCK_FROM);
  };
  // What Space does where the Ooga stands: "sit", "sleep" or "rest" beside a place, "up" from one, else "".
  const nearby = () => {
    if (cave.camp.seat || crew.sleeping) return "up";
    if (cave.hop > 0.03 || pilot.moving) return "";
    const p = cave.root.position, feet = p.y - cave.baseY;
    return seatNear(p.x, p.z, feet) ? "sit" : hammockNear(p.x, p.z, feet) ? "rest" : bedNear(p.x, p.z, feet) ? "sleep" : "";
  };
  const useNear = (x, z, reach, feet) => {
    const seat = seatNear(x, z, feet);
    if (seat) return crew.sitPlayer(seat);
    const rest = hammockNear(x, z, feet);
    if (rest) return hammock.enter(cave, rest, crew.sitPlayer);
    return bedNear(x, z, feet) && crew.sleepPlayer(bed);
  };
  // Up from whatever holds the Ooga, at once.
  const getUp = () => {
    if (crew.sleeping) crew.wakePlayer();
    if (cave.camp.seat) crew.standPlayer(cave);
  };
  // Stood at a spot facing `heading`, the view `turn` round from its front.
  const stand = (x, z, heading, turn = 0, pitch = VIEW.pitch, dist = VIEW.dist) => {
    getUp();
    pilot.navigate({ position: { x, y: groundAt(x, z), z }, yaw: heading + turn, pitch, dist });
    cave.root.rotation.y = heading;
  };
  // Puts the Ooga in a place without the walk, seen from the pad's side of it. True when it got there.
  const place = (id) => {
    if (!PLACES.includes(id)) throw new Error(`studio: no place ${id}`);
    let ok = true;
    if (id === "stand") stand(HOME.x, HOME.z, 0);
    else if (id === "bed") { stand(bed.walkAt.x, bed.walkAt.z, Math.PI / 2, -0.55, 0.5, 5.6); ok = crew.sleepPlayer(bed); }
    else if (id === "hammock") {
      const seat = hammock.seats[0];
      stand(seat.walkAt.x, seat.walkAt.z, 0, 0.5, 0.38, 6.2);
      ok = hammock.enter(cave, seat, crew.sitPlayer);
    } else {
      const seat = seats[id === "chair" ? 0 : 1];
      stand(seat.walkAt.x, seat.walkAt.z, seat.ry, id === "chair" ? 0.6 : -0.75, 0.32, 5);
      ok = crew.sitPlayer(seat);
    }
    if (free.on) aimFree();
    remember();
    return ok;
  };

  // ---- the free camera ----
  // A camera of the visitor's own, apart from the Ooga, which keeps whatever it is doing: it looks at a point from
  // `dist` away, the movement keys fly that point over the pad (Space up, X down), a drag or the look keys turn it,
  // and the wheel moves it in and out. The pilot keeps the Ooga and is held meanwhile (`setExternalControl`, as a
  // tour holds it), and the eye is kept over the ground.
  const free = { on: false, x: 0, y: 1, z: 0, yaw: 0, pitch: 0.2, dist: 5 };
  // Its point on the Ooga where it is now, the view's angle and reach kept.
  const aimFree = () => {
    const p = cave.sleepHead && (crew.sleeping || cave.camp.seat && cave.camp.seat.lying) ? cave.sleepHead : cave.root.position;
    free.x = p.x; free.z = p.z; free.y = p === cave.root.position ? p.y - cave.baseY + cave.traits.height * 0.55 : p.y;
  };
  let freeMode = false;
  const setFree = (on) => {
    on = !!on;
    if (on === free.on) return;
    free.on = on;
    if (on) {
      const eyes = pilot.view === "first-person";
      if (eyes) pilot.exitClose(false);
      // From the view as it stands, or, out of the Ooga's own eyes, from in front of it.
      const p = camera.position, t = camera.target, dx = p.x - t.x, dy = p.y - t.y, dz = p.z - t.z;
      if (eyes) { aimFree(); free.yaw = cave.root.rotation.y; free.pitch = VIEW.pitch; free.dist = 4; }
      else {
        free.x = t.x; free.y = t.y; free.z = t.z;
        free.yaw = Math.atan2(dx, dz); free.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), FREE.low, FREE.high);
        free.dist = clamp(Math.hypot(dx, dy, dz), FREE.near, FREE.far);
      }
      pilot.setActive(false);
      pilot.setExternalControl(true);
      // The weapon buttons and the mode's switch still work for the Ooga meanwhile.
      pilot.setButtonsHeld(true);
      freeMode = !!cave.weapon.aiming;
      hud.setAct("UP");
      say(COARSE ? "Free camera · the left stick flies it, the right stick turns it, UP lifts it" : "Free camera · W A S D fly it, Space up, X down, drag to turn, wheel in and out");
    } else {
      pilot.setButtonsHeld(false);
      pilot.setExternalControl(false);
      pilot.setActive(true);
      // Changed from carry to combat or back under it, the view becomes that mode's own now.
      if (!!cave.weapon.aiming !== freeMode) thirdPerson();
      pilot.showAct();
      nearKey = "";
    }
    press("free", on);
  };
  const flyFree = (dt) => {
    const a = pilot.controls.read(), sy = Math.sin(free.yaw), cy = Math.cos(free.yaw);
    const speed = (FREE.speed + free.dist * FREE.perDist) * (a.sprint ? 2 : 1) * dt;
    free.x += (-sy * a.y + cy * a.x) * speed;
    free.z += (-cy * a.y - sy * a.x) * speed;
    free.y = clamp(free.y + a.up * FREE.climb * dt, 0, FREE.top);
    free.yaw += a.yaw * FREE.turn * dt;
    free.pitch = clamp(free.pitch + a.pitch * FREE.turn * dt, FREE.low, FREE.high);
    const r = Math.hypot(free.x, free.z);
    if (r > FREE.out) { free.x *= FREE.out / r; free.z *= FREE.out / r; }
    const cp = Math.cos(free.pitch), p = camera.position, t = camera.target;
    t.x = free.x; t.y = free.y; t.z = free.z;
    p.x = free.x + Math.sin(free.yaw) * cp * free.dist;
    p.z = free.z + Math.cos(free.yaw) * cp * free.dist;
    // Never under the ground: the eye stops a hand over it, still looking at its point.
    p.y = Math.max(FREE.floor + groundAt(p.x, p.z), free.y + Math.sin(free.pitch) * free.dist);
    camera.up = null;
    // The head shows unless the eye is inside it.
    pilot.syncHeadVisibility(cave);
  };

  // ---- gear, view and look ----
  const state = { name: "", place: "stand", x: HOME.x, z: HOME.z, heading: 0, rifle: false, held: 0, jetpack: false, eyes: false, night: false, yaw: VIEW.yaw, pitch: VIEW.pitch, dist: VIEW.dist, view: null, free: null };
  // The most Oogas whose last place, gear and view are kept.
  const KEPT = 24;
  // Where the Ooga is as it stands now (walked there or put there), its gear and the view, kept for the next load.
  const remember = (as = asked) => {
    if (!pilot) return;
    const seat = cave.camp.seat, p = cave.root.position;
    state.place = crew.sleeping ? "bed" : !seat ? "stand" : seat.kind === "hammock" ? "hammock" : seat === seats[0] ? "chair" : "fire";
    state.x = p.x; state.z = p.z; state.heading = cave.root.rotation.y;
    state.rifle = !!cave.weapon.equipped; state.held = cave.weapon.equipped ? 2 : cave.weapon.primaryEquipped ? 1 : 0;
    state.jetpack = !!cave.jet; state.eyes = pilot.view === "first-person"; state.night = night;
    state.yaw = pilot.orbit.yaw; state.pitch = pilot.orbit.pitch; state.dist = pilot.orbit.dist;
    // The view and its mode as the pilot keeps them (carry or combat, the camera's angles): under the free camera,
    // the one it gives back to.
    state.view = pilot.viewState();
    state.free = free.on ? [free.x, free.y, free.z, free.yaw, free.pitch, free.dist] : null;
    try {
      // Kept under the Ooga it is for (`as`, the one taking this one's place in a swap), the most recent KEPT of them.
      let kept = JSON.parse(localStorage.getItem(STORE));
      if (!kept || typeof kept !== "object" || Array.isArray(kept)) kept = {};
      kept[as] = { ...state, name: as, at: Date.now() };
      const names = Object.keys(kept).sort((a, b) => (kept[b].at || 0) - (kept[a].at || 0));
      for (const name of names.slice(KEPT)) delete kept[name];
      localStorage.setItem(STORE, JSON.stringify(kept));
    } catch { /* A private window keeps nothing; the studio works without it. */ }
  };
  // The last visit's place, gear and view for this Ooga, each piece checked; null when there is none.
  const remembered = () => {
    let saved = null;
    try { saved = (JSON.parse(localStorage.getItem(STORE)) || {})[state.name]; } catch { return null; }
    if (!saved || typeof saved !== "object" || saved.name !== state.name || !PLACES.includes(saved.place)) return null;
    const number = (value, low, high, fallback) => Number.isFinite(value) ? clamp(value, low, high) : fallback;
    return { place: saved.place, x: number(saved.x, -WALL, WALL, HOME.x), z: number(saved.z, -WALL, WALL, HOME.z), heading: number(saved.heading, -1e3, 1e3, 0),
      rifle: saved.rifle === true, held: [0, 1, 2].includes(saved.held) ? saved.held : saved.rifle === true ? 2 : 0, jetpack: saved.jetpack === true, eyes: saved.eyes === true, night: saved.night === true,
      yaw: number(saved.yaw, -1e3, 1e3, VIEW.yaw), pitch: number(saved.pitch, -1.2, 1.3, VIEW.pitch), dist: number(saved.dist, 1.5, 14, VIEW.dist),
      view: saved.view && typeof saved.view === "object" && typeof saved.view.view === "string" ? { view: saved.view.view, combat: saved.view.combat === true,
        relYaw: number(saved.view.relYaw, -1e3, 1e3, Math.PI), pitch: number(saved.view.pitch, -1.6, 1.6, VIEW.pitch), distance: number(saved.view.distance, 0, 60, VIEW.dist),
        height: number(saved.view.height, -20, 80, 1), side: saved.view.side === -1 ? -1 : 1 } : null,
      free: Array.isArray(saved.free) && saved.free.length === 6 && saved.free.every(Number.isFinite) ? saved.free : null };
  };
  const toggle = (name, on) => {
    if (!TOGGLES.includes(name)) throw new Error(`studio: no toggle ${name}`);
    if (name === "night") { night = on === undefined ? !night : !!on; light(); }
    else if (name === "rifle") {
      const want = on === undefined ? !cave.weapon.equipped : !!on;
      if (want !== !!cave.weapon.equipped && !(want ? pilot.weaponMode(2) && cave.weapon.equipped : crew.selectWeapon(0, cave))) hud.toast("Stand up to change what is in hand");
    } else if (name === "jetpack") {
      const want = on === undefined ? !cave.jet : !!on;
      if (want && !cave.jet && !crew.wearJetpack(cave, hubModels.jetpack(), hubModels.jetFlame())) hud.toast("Stand up to put the jetpack on");
      else if (!want && cave.jet) crew.removeJetpack(cave);
      pilot.showAct();
    } else if (name === "free") setFree(on === undefined ? !free.on : on);
    else if (name === "combat") {
      // Carry or combat, as X changes it. Under the free camera the Ooga changes mode and the camera stays where it is:
      // the mode's own view comes when the free camera is let go.
      if (on === undefined || !!on !== !!cave.weapon.aiming) pilot.modeAction("mode-toggle", free.on);
    } else if (name === "eyes" && (on === undefined ? free.on || pilot.view !== "first-person" : on)) {
      // The Ooga's own eyes are the pilot's view, so the free camera lets go first.
      setFree(false);
      pilot.enterClose();
    } else {
      // The third person, which leaving the first person comes back to as well. In combat it is combat's own, over
      // the shoulder. Carrying, it is the view from behind and a little above, as far off as that one, the Ooga in
      // the middle of it.
      setFree(false);
      thirdPerson();
    }
    remember();
  };
  const thirdPerson = () => {
    const view = pilot.viewState(), combat = !!cave.weapon.aiming;
    if (view) pilot.adopt({ view: combat ? "shoulder" : "orbit", combat, relYaw: Math.PI, pitch: THIRD.pitch, distance: THIRD.dist, height: view.height, side: view.side });
  };
  // Its voice, a line a press: the poke line, then each idle line in turn.
  const speak = () => {
    const voice = contributors.voiceFor(cave.traits.name), lines = voice ? [voice.poke, ...voice.idle] : ["Ooga?"];
    fx.say(cave, lines[spoken++ % lines.length], 3.5);
  };
  // Another Ooga on the pad, with no reload: the studio is left and entered again for it (the director's own swap,
  // which holds the last frame meanwhile), and the new one stands in this one's place, gear and view.
  const show = (name) => {
    if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) throw new Error(`studio: no Ooga ${name}`);
    if (name.toLowerCase() === state.name.toLowerCase()) return false;
    asked = name;
    if (go("studio", null, true)) return true;
    // A swap already under way keeps the pad as it is.
    asked = state.name;
    return false;
  };
  // A file-less Ooga's build is read as its model is first made, so the other build is a reload.
  const rebuild = () => {
    remember();
    const url = new URL(location.href);
    if (params.get("build") === "slim") url.searchParams.delete("build"); else url.searchParams.set("build", "slim");
    location.assign(url);
  };
  // The address names the studio and the Ooga on the pad, so a reload (a saved file's, or the visitor's own) comes
  // back to this one. The director has just named the place in the address its own way; this follows it.
  // On the studio's own server that is the whole of it: its first script writes the rest in again as the page loads
  // (scripts/character-studio.mjs), so the flags the page runs under stay out of sight.
  const address = () => {
    const url = new URL(location.href), had = url.search + url.hash, build = url.searchParams.get("build");
    if (WATCH) url.search = "";
    url.searchParams.set("scene", "studio");
    url.searchParams.set("character", state.name);
    if (build === "slim" && (BL.characters.get(state.name) || {}).studio) url.searchParams.set("build", "slim"); else url.searchParams.delete("build");
    url.hash = "";
    if (url.search + url.hash !== had) history.replaceState(history.state, "", url);
  };
  // The list beside the controls button: every Ooga with a file by the name the game shows, A to Z, and first the one
  // on the pad when it has no file. Letting go of it gives the keys back to the Ooga.
  const fillPick = () => {
    const rows = BL.characters.all().filter((c) => !c.studio).map((c) => ({ handle: c.handle, label: c.display || c.handle }));
    rows.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
    if (!rows.some((row) => row.handle.toLowerCase() === state.name.toLowerCase())) rows.unshift({ handle: state.name, label: `${state.name} (no file)` });
    pick.replaceChildren(...rows.map((row) => {
      const option = document.createElement("option");
      option.value = row.handle; option.textContent = row.label;
      option.selected = row.handle.toLowerCase() === state.name.toLowerCase();
      return option;
    }));
  };
  const picked = () => {
    const name = pick.value;
    pick.blur();
    if (!show(name)) fillPick();
  };
  const letGo = (e) => { if (e.target !== pick && document.activeElement === pick) pick.blur(); };
  // A sign's words, lettered as the banner's are (hud.js).
  const letter = (el, words) => { el.setAttribute("aria-label", words); el.replaceChildren(hudMod.signLettering(words)); };

  // ---- the This Ooga panel ----
  // What the file of the Ooga on the pad gives it (`#studio-features`, down the right side): its look and voice, which
  // are plain data; each hook in its `dress`, which is custom code, with the bytes of that hook's own source; and the
  // parts its build carries. Over them, from the studio's server (`/__studio/reading`), the whole file's bytes of the
  // intake's limit and the lane it lands in. Filled as a visit enters, so a saved file (which reloads the page) and
  // another Ooga from the list are each read afresh. Code a file's hooks share is counted with its look and voice.
  const LIMIT = 32768; // the intake's (scripts/character-safety.mjs SOURCE_LIMIT), until the server names it
  const PANEL_STORE = "ooga-studio-panel";
  const HOOKS = {
    torso: "Paints the chest, belt and hips", gear: "Paints the arms, legs and feet", club: "The weapon it holds first, drawn by its club hook",
    skull: "Its own head shape", crown: "Hair, or a crown", eyes: "Eyes of its own", mark: "Marks on the face",
    hatY: "Does nothing: it placed the loot crates' hats, which are gone", headgear: "A hat or a helmet", extras: "Pieces of its own: a pet, a bag, a pack",
    tint: "A second colourway, changing with the day's price", model: "A modelled body of its own", refine: "Fine detail painted on the body"
  };
  // A hook whose name in the file would mislead a player is shown by what the game calls it: `club` draws whatever the
  // Ooga holds as its first weapon (an axe, a staff, a bouquet), the slot the controls call the primary.
  const HOOK_NAMES = { club: "Primary weapon" };
  const COLOURS = { skin: "Skin", hair: "Hair", fur: "Fur", eyeColor: "Eyes" };
  const FLAGS = {
    bald: "Bald", hairless: "Hairless", cleanShaven: "Clean-shaven", noBrow: "No brow", wideEyes: "Wide eyes", noPupils: "No pupils",
    cigarette: "Smokes", gasMask: "Breathes through a gas mask", stoneAxe: "Holds its weapon as an axe", skater: "Rides its board at a run",
    pumpkin: "A pumpkin head", nunchaku: "Swings a nunchaku", petRidesHat: "Its pet rides its hat", footRockets: "Rockets in its soles",
    noFlaps: "No loincloth flaps", snout: "A pig's snout", noTeeth: "A beard with no teeth", recipe: "Hands out the Add an Ooga prompt"
  };
  // `hatY` placed the loot crates' hats, which are gone; a file that still sets it shows nothing for it.
  const LOOK_KEYS = new Set(["build", "height", "face", "eyeGlow", "hatY", "portrait", ...Object.keys(COLOURS), ...Object.keys(FLAGS)]);
  const BUILDS = [["dog", "A pet"], ["jetpack", "A jetpack of its own, always on"], ["board", "A board to ride"], ["shield", "A shield"], ["chuk", "A nunchaku"]];
  let panel = null, panelFill = 0;
  const keepFold = () => { try { localStorage.setItem(PANEL_STORE, panel.root.dataset.folded); } catch { /* A private window keeps nothing. */ } };
  // Its width, dragged by the grip on its left edge (or, from the keyboard, a press of the grip widening it a step and
  // going back to the narrowest past the widest), kept for the tab. `gap` is the room left for the studio's buttons,
  // as the stylesheet's max-width leaves it.
  const WIDTH_STORE = "ooga-studio-panel-width", WIDTH = { min: 200, step: 70, gap: 140 };
  let resizing = null;
  const widest = () => Math.max(WIDTH.min, window.innerWidth - WIDTH.gap);
  const setWidth = (width, keep) => {
    const px = Math.round(clamp(width, WIDTH.min, widest()));
    panel.root.style.width = `${px}px`;
    if (keep) try { localStorage.setItem(WIDTH_STORE, String(px)); } catch { /* A private window keeps nothing. */ }
  };
  const gripDown = (e) => {
    if (e.button !== 0 || resizing) return;
    e.preventDefault();
    panel.grip.setPointerCapture(e.pointerId);
    resizing = { id: e.pointerId, x: e.clientX, width: panel.root.getBoundingClientRect().width };
    panel.root.dataset.resizing = "true";
  };
  const gripMove = (e) => { if (resizing && e.pointerId === resizing.id) setWidth(resizing.width + resizing.x - e.clientX, false); };
  const gripUp = (e) => {
    if (!resizing || e.pointerId !== resizing.id) return;
    setWidth(resizing.width + resizing.x - e.clientX, true);
    resizing = null;
    delete panel.root.dataset.resizing;
  };
  // A click from a pointer is the end of a drag; only the keyboard's press steps it.
  const gripPress = (e) => {
    if (e.detail !== 0) return;
    const width = panel.root.getBoundingClientRect().width;
    setWidth(width + 1 >= widest() ? WIDTH.min : width + WIDTH.step, true);
  };
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const sizeBar = (part, whole) => {
    const bar = make("div", "studio-bar"), fill = make("span");
    fill.style.width = `${clamp(part / whole * 100, 0, 100).toFixed(1)}%`;
    if (part > whole) bar.dataset.state = "full";
    bar.append(fill);
    return bar;
  };
  const bytes = (n) => `${n.toLocaleString("en")} byte${n === 1 ? "" : "s"}`;
  // A row: a small label over its value, and anything else under them. A row with no label is its value alone; `aside`
  // stands at the end of the label's line (a hook's bytes).
  const item = (key, value, aside, ...more) => {
    const li = make("li");
    if (key) {
      const head = make("span", "studio-head");
      head.append(make("span", "studio-key", key));
      if (aside) head.append(make("span", "studio-note", aside));
      li.append(head);
    }
    if (value !== undefined) li.append(value instanceof Node ? value : make("span", "studio-value", String(value)));
    li.append(...more);
    return li;
  };
  // A hook's row: its name, with what that hook does as the name's tooltip, its bytes, and anything under them.
  const hookItem = (name, tip, aside, ...more) => {
    const li = item(name, undefined, aside, ...more);
    li.querySelector(".studio-key").title = tip;
    return li;
  };
  // A colour chip copies its value, which is also its tooltip: through the clipboard, or, where a browser refuses that
  // (an embedded one may deny the permission), the older copy command on a field kept out of sight.
  const copyOld = (text) => {
    const field = make("textarea", "studio-copy");
    field.value = text;
    field.readOnly = true;
    document.body.append(field);
    field.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    field.remove();
    return ok;
  };
  const copyColour = (e) => {
    const chip = e.currentTarget, value = chip.dataset.colour;
    chip.blur();
    const said = (ok) => hudMod.toast(ok ? `Copied ${value}` : `Could not copy ${value} here`);
    if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => said(true), () => said(copyOld(value)));
    else said(copyOld(value));
  };
  // The look's colours in one row, each a chip named for what it colours.
  const swatches = (look) => {
    const value = make("span", "studio-value studio-colours");
    for (const key of Object.keys(COLOURS)) {
      if (look[key] === undefined) continue;
      const one = make("button", "studio-chip", COLOURS[key]), chip = make("i", "studio-swatch");
      one.type = "button";
      one.dataset.colour = String(look[key]);
      one.title = String(look[key]);
      one.addEventListener("click", copyColour);
      chip.style.background = String(look[key]);
      one.prepend(chip);
      value.append(one);
    }
    return value.childNodes.length ? value : null;
  };
  const group = (title, rows) => {
    if (!rows.length) return [];
    const list = make("ul", "studio-list");
    list.append(...rows);
    return [make("h3", "section-head", title), list];
  };
  // The file's size and lane, as the server read it, with how much of it the hooks take.
  const showSize = (r, hooked) => {
    if (!r || r.file !== true || !Number.isFinite(r.bytes)) {
      panel.size.textContent = "No file yet";
      panel.note.textContent = "This is the Ooga this login gets by default. Plain data merges on its own the next day.";
      return;
    }
    const limit = Number.isFinite(r.limit) && r.limit > 0 ? r.limit : LIMIT;
    panel.fill.style.width = `${clamp(r.bytes / limit * 100, 0, 100).toFixed(1)}%`;
    if (r.bytes > limit) panel.bar.dataset.state = "full"; else delete panel.bar.dataset.state;
    panel.size.textContent = `${bytes(r.bytes)} of ${limit.toLocaleString("en")} · ${Math.round(r.bytes / limit * 100)}%`;
    // A file with hooks says nothing more here; why one without is custom code is news: a plain-data field it got wrong.
    const why = typeof r.why === "string" ? r.why : "", at = r.finding && Number.isInteger(r.finding.line) ? ` (line ${r.finding.line}: "${r.finding.text}")` : "";
    panel.note.textContent = r.refused ? `The intake would refuse it: ${why}${at}` : r.lane === "daily" ? "Plain data: it merges on its own with the next daily bundle."
      : hooked ? "" : why;
    panel.note.hidden = !panel.note.textContent;
    if (r.refused) panel.note.dataset.state = "bad"; else delete panel.note.dataset.state;
    if (hooked) panel.parts.replaceChildren(item("Appearance & equipment code", undefined, bytes(hooked)), item("Settings, dialog, & other code", undefined, bytes(Math.max(0, r.bytes - hooked))));
  };
  const fillPanel = (name, built, signal) => {
    const fill = ++panelFill, row = BL.characters.get(name) || {}, look = row.look || {}, dress = row.dress || {};
    panel.who.textContent = row.studio ? `${name} · no file yet` : `${row.display || name} · src/characters/${name}.js`;
    panel.fill.style.width = "0%";
    panel.size.textContent = "";
    panel.note.textContent = "";
    panel.note.hidden = false;
    delete panel.note.dataset.state;
    panel.parts.replaceChildren();
    // Plain data: the look and the voice.
    const looks = [];
    if (row.display) looks.push(item("Name shown", row.display));
    if (look.build) looks.push(item("Build", look.build === "slim" ? "Female (slim)" : "Male"));
    const colours = swatches(look);
    if (colours) looks.push(item("Colours", colours));
    if (look.eyeGlow !== undefined) looks.push(item("Eye glow", look.eyeGlow));
    if (look.height !== undefined) looks.push(item("Height", `${look.height} m`));
    if (look.face !== undefined) looks.push(item("Face", look.face));
    if (look.portrait) looks.push(item("Portrait", "Framed by hand"));
    const flags = Object.keys(look).filter((key) => key in FLAGS && look[key]).map((key) => FLAGS[key]);
    if (flags.length) looks.push(item("Also", flags.join(" · ")));
    for (const key of Object.keys(look)) if (!LOOK_KEYS.has(key)) looks.push(item(key, JSON.stringify(look[key])));
    if (!looks.length) looks.push(item("", "Hashed from its login: nothing set by hand"));
    const voice = row.voice;
    const lines = voice ? [item("Poked", voice.poke), item("Idle lines", voice.idle.length)] : [item("", "The default lines")];
    // Custom code: each hook, with the bytes of its own source. Hooks that are one function count it once.
    const encoder = new TextEncoder(), counted = new Map();
    let hooked = 0;
    const hooks = Object.keys(dress).map((key) => {
      const hook = dress[key], same = counted.get(hook), name = HOOK_NAMES[key] || key;
      if (typeof hook !== "function") return hookItem(name, HOOKS[key] || "A value of its own");
      if (same) return hookItem(name, HOOKS[key] || "A hook of its own", `the same code as ${HOOK_NAMES[same] || same}`);
      const size = encoder.encode(String(hook)).length;
      counted.set(hook, key);
      hooked += size;
      return hookItem(name, HOOKS[key] || "A hook of its own", bytes(size), sizeBar(size, LIMIT));
    });
    // What its build carries, as the game builds it.
    const builds = [];
    if (built) {
      for (const [part, words] of BUILDS) if (built.parts[part]) builds.push(item("", part === "dog" && built.parts.dog.legs ? "A pet that walks on four legs" : words));
    } else builds.push(item("", "Its build threw: the foot of the page says where"));
    panel.groups.replaceChildren(...group("Look", looks), ...group("Voice", lines), ...group("Custom code", hooks), ...group("Builds", builds));
    if (row.studio) { showSize(null, 0); return; }
    if (!WATCH) {
      panel.size.textContent = "Size unknown here";
      panel.note.textContent = `npm run character:studio -- ${name} shows how much of the ${LIMIT.toLocaleString("en")} bytes the file takes.`;
      return;
    }
    fetch(`/__studio/reading?character=${encodeURIComponent(name)}`, { cache: "no-store", signal })
      .then((reply) => reply.json())
      .then((reply) => { if (!signal.aborted && fill === panelFill) showSize(reply, hooked); })
      .catch(() => { if (!signal.aborted && fill === panelFill) panel.size.textContent = "The studio's server did not answer"; });
  };

  // ---- reload on save ----
  const watch = async (signal) => {
    let reply = null;
    try { reply = await (await fetch("/__studio/version", { cache: "no-store", signal })).json(); } catch { reply = null; }
    if (signal.aborted) return;
    if (!reply || typeof reply.version !== "string") {
      window.clearInterval(watchTimer);
      hudMod.toast("The studio's server has stopped: this page no longer follows your file");
      return;
    }
    const error = typeof reply.error === "string" ? reply.error : "";
    if (error !== watchError) { watchError = error; if (error) hudMod.toast(`Not reloaded · ${error}`); }
    if (watchVersion === null) {
      // The first answer of a page's life: what the intake's screen makes of the file, and whether the whole cast loaded.
      watchVersion = reply.version;
      const loaded = BL.characters.all().filter((c) => !c.temporary).length;
      if (Number.isInteger(reply.count) && loaded < reply.count) hudMod.toast(`${reply.count - loaded} character file${reply.count - loaded === 1 ? "" : "s"} did not load: a file threw as the page read it (see the browser's console)`);
      else if (typeof reply.note === "string" && reply.note.toLowerCase().startsWith(`${state.name.toLowerCase()}.js:`)) hudMod.toast(reply.note);
    } else if (reply.version !== watchVersion && !error) { remember(); location.reload(); }
  };

  const stayHome = (e) => {
    if (!e.target.closest || !e.target.closest(".home-link")) return;
    e.preventDefault();
    e.stopPropagation();
    homeLink.blur();
    place("stand");
  };
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    hud.toast(`+${BL.game.formatLarge(donation.sats)} sats`);
  };
  const onKey = (e) => {
    // The free camera has the movement keys; Escape gives the view back to the Ooga.
    if (free.on) { if (BL.controls.matches(e, "escape")) toggle("free", false); return; }
    if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { pilot.resetCamera(); return; }
    if (BL.controls.matches(e, "view") && !e.repeat && pilot.modeAction("mode-toggle")) return;
    if (BL.controls.matches(e, "weapon") && pilot.weaponMode(Number(e.key))) return;
    if (BL.controls.matches(e, "escape")) { pilot.escape(); return; }
    if (BL.controls.matches(e, "twirl") && !e.repeat && crew.twirl()) return;
    if (BL.controls.matches(e, "tint") && !e.repeat && crew.toggleTint(crew.player)) return;
    if (BL.controls.matches(e, "jetpack") && !e.repeat) { toggle("jetpack"); return; }
    if (BL.controls.matches(e, "swapWeapon")) pilot.weaponAction("weapon-toggle");
    if (BL.controls.matches(e, "attack")) pilot.weaponAction("weapon-fire");
  };

  const enter = (ctx) => {
    ({ renderer, game, go } = ctx);
    // Asked first, so a file that stops this visit from being built still reloads the page once it is mended.
    watchVersion = null; watchError = "";
    if (WATCH) watchTimer = window.setInterval(() => watch(ctx.signal), 1000);
    // Who is on the pad: the handle asked for, with a file or without, else the roster's first.
    const valid = /^[A-Za-z0-9-]{1,39}$/.test(asked);
    const find = (name) => contributors.roster.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (valid && !find(asked)) {
      // No file yet: the Ooga this login gets by default, in the build asked for.
      if (!BL.characters.get(asked)) BL.characters.add({ handle: asked, joined: Math.floor(Date.now() / 1000), lastCommit: Math.floor(Date.now() / 1000), temporary: true, studio: true, look: params.get("build") === "slim" ? { build: "slim" } : {} });
      contributors.addLocal(asked);
    }
    entry = valid && find(asked) || contributors.roster[0];
    state.name = asked = entry.name;
    // A file whose hooks throw as its Ooga is built cannot be shown: say what threw, and stand the default Ooga in
    // until the file is mended.
    broken = "";
    let built = null;
    try { built = models.caveman(contributors.traitsFor(entry.name)); } catch (error) {
      const hook = /at (?:Object\.)?(\w+) \(/.exec(String(error.stack || ""));
      broken = `${entry.name}.js threw as its Ooga was built${hook ? `, in ${hook[1]}` : ""}: ${error.message}`;
      console.error(error);
      if (!BL.characters.get(STAND_IN)) BL.characters.add({ handle: STAND_IN, joined: 1, lastCommit: 1, temporary: true, studio: true });
      entry = contributors.addLocal(STAND_IN);
    }
    camera = createCamera({ fov: 42, near: 0.1, far: 120 });
    root = createNode();
    addChild(root, createNode({ geometry: pad() }));
    hud = hudMod.create({ signal: ctx.signal, roster: [entry] });
    hud.setAreaLabel("Studio");
    // The studio stands alone: the title's link, which goes back to the island from every other place, stays here and
    // stands the Ooga at home, and the tab says where this is.
    homeLink = document.querySelector(".home-link");
    homeTitle = homeLink.title;
    homeLink.title = "Studio";
    homeWords = homeLink.querySelector("[data-sign]").getAttribute("aria-label");
    letter(homeLink.querySelector("[data-sign]"), "OBL");
    document.addEventListener("click", stayHome, { capture: true, signal: ctx.signal });
    // Kept as the page goes, however it goes (a reload, the tab closed, the studio's server stopped).
    window.addEventListener("pagehide", () => remember(), { signal: ctx.signal });
    titled = false;
    // One Ooga and nobody to feed: the Bananas and Oogas panels stay away.
    hud.setPanelsHidden(true);
    buttons = {};
    for (const b of document.querySelectorAll('.studio-side [data-action^="studio-"]')) { buttons[b.dataset.action.slice(7)] = b; b.lit = null; }
    combatShown = null;
    // The build is a file's own to say: the switch is for an Ooga with no file.
    buttons.build.hidden = !(BL.characters.get(state.name) || {}).studio;
    press("build", params.get("build") === "slim");
    pick = document.getElementById("studio-pick");
    fillPick();
    pick.addEventListener("change", picked, { signal: ctx.signal });
    document.addEventListener("pointerdown", letGo, { capture: true, signal: ctx.signal });
    const $ = (id) => document.getElementById(id);
    panel = { root: $("studio-features"), grip: $("studio-resize"), who: $("studio-who"), bar: $("studio-size-bar"), fill: $("studio-size-fill"), size: $("studio-size"), note: $("studio-size-note"), parts: $("studio-size-parts"), groups: $("studio-groups") };
    // As wide as the visitor last dragged it in this tab, else the stylesheet's width.
    let width = NaN;
    try { width = Number(localStorage.getItem(WIDTH_STORE) || NaN); } catch { /* A private window keeps nothing. */ }
    if (Number.isFinite(width)) setWidth(width, false); else panel.root.style.width = "";
    panel.grip.addEventListener("pointerdown", gripDown, { signal: ctx.signal });
    panel.grip.addEventListener("pointermove", gripMove, { signal: ctx.signal });
    panel.grip.addEventListener("pointerup", gripUp, { signal: ctx.signal });
    panel.grip.addEventListener("pointercancel", gripUp, { signal: ctx.signal });
    panel.grip.addEventListener("click", gripPress, { signal: ctx.signal });
    // The panel is folded or open as the visitor last left it in this tab; at first, open, but folded on a touch
    // screen, where the sticks need the room. The hud's own fold handler has run by the time this one keeps it.
    let folded = null;
    try { folded = localStorage.getItem(PANEL_STORE); } catch { /* A private window keeps nothing; the panel opens. */ }
    panel.root.dataset.folded = String(folded === null ? COARSE : folded === "true");
    for (const b of document.querySelectorAll('[data-fold="studio-features"]')) b.addEventListener("click", keepFold, { signal: ctx.signal });
    fillPanel(state.name, built, ctx.signal);
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    pilot = pilotMod.create({ renderer, canvas: ctx.canvas, camera, hud, presets: { studio: { ...VIEW, target: { x: HOME.x, y: 1, z: HOME.z } } }, landing: "studio", pitch: [-0.1, 1.3], dist: [1.5, 14],
      follow: { y: 0.9, min: 1.5, max: 10, pitch: [0.05, 0.9] }, clampTarget, clampCamera, ceilingAt: () => 14, coarse: COARSE,
      jetpackStatus: (who) => { JETPACK.equipped = !!(who && who.jet); JETPACK.fuel = who ? who.jetFuel : 1; return JETPACK; },
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt } });

    // The chair, and a log either side of the fire: seats the crew sits its player on.
    seats = [];
    blocks = [];
    const seat = (x, z, y, ry, back, ground) => {
      const s = { kind: "bench", x, y, z, floor: 0, ry, ground, sitter: null, walkAt: { x: x + Math.sin(ry) * back, z: z + Math.cos(ry) * back } };
      seats.push(s);
      return s;
    };
    const chairRy = Math.atan2(-CHAIR.x, -CHAIR.z);
    addChild(root, createNode({ geometry: chair(), position: { x: CHAIR.x, y: 0, z: CHAIR.z }, rotation: { x: 0, y: chairRy, z: 0 } }));
    // Its stand-up spot is clear of it for the roster's widest body.
    seat(CHAIR.x + Math.sin(chairRy) * 0.04, CHAIR.z + Math.cos(chairRy) * 0.04, CHAIR.top, chairRy, 1.1, false);
    blocks.push({ x: CHAIR.x, z: CHAIR.z, r: 0.3 });
    const pit = createNode({ geometry: hubModels.firepit(), position: { x: FIRE.x, y: 0, z: FIRE.z } });
    addChild(root, pit);
    blocks.push({ x: FIRE.x, z: FIRE.z, r: FIRE.r });
    // Round the fire, places on the ground facing it, as the island's Oogas sit: the first on the pad's side of it.
    const toward = Math.atan2(-FIRE.x, -FIRE.z);
    for (let i = 0; i < FIRE.seats; i++) {
      const a = toward + i / FIRE.seats * Math.PI * 2, x = FIRE.x + Math.sin(a) * FIRE.out, z = FIRE.z + Math.cos(a) * FIRE.out;
      seat(x, z, 0, a + Math.PI, -0.7, true);
    }
    // The headquarters' mattress, as `sleepPlayer` reads one: its pillow toward -z.
    const M = BL.headquartersModels.MATTRESS, mattress = BL.headquartersModels.mattress({ x: BED.x, floor: 0, z: BED.z, index: 40 });
    const bedNode = createNode({ geometry: mattress, position: { x: BED.x, y: 0, z: BED.z } });
    addChild(root, bedNode);
    bed = { node: bedNode, ...mattress.mattress, x: BED.x, y: 0, z: BED.z, sr: 0, cr: 1, sleeper: null, sleep: M,
      collisionBoxes: new Float64Array([-M.width / 2, 0, -M.depth / 2, M.width / 2, M.surface, M.depth / 2, -0.45, M.surface, M.pillowZ - 0.25, 0.45, M.pillowTop, M.pillowZ + 0.25]),
      walkAt: { x: BED.x + M.width / 2 + 0.7, y: 0, z: BED.z } };

    fx = fxMod.create({ root, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 3.2, z: 0 }, hud });
    // The island's fire: its block flame, and the few embers it breathes from the island's own batch (critters.js),
    // whose butterflies and fireflies are never called for here.
    fire = BL.blaze.createVoxelRig({ scale: 1 });
    addChild(pit, fire.root);
    embers = BL.critters.create({ root, renderer, flowers: [FIRE], fire: { x: FIRE.x, y: 0, z: FIRE.z }, meadowRadius: PAD, heightAt: () => 0 });

    // The hammock between its posts, on the side of them that faces the pad.
    addChild(root, createNode({ geometry: posts() }));
    for (const s of [-1, 1]) blocks.push({ x: s * HAMMOCK.half, z: HAMMOCK.z, r: HAMMOCK.post + 0.05 });
    const plan = BL.hubHammock.plan({ a: { x: -HAMMOCK.half, z: HAMMOCK.z, ground: 0 }, b: { x: HAMMOCK.half, z: HAMMOCK.z, ground: 0 }, clear: () => true, surfaceAt: () => 0 });
    hammock = BL.hubHammock.create({ plan, root, solids: { add() {}, remove() {} }, ra: HAMMOCK.post, rb: HAMMOCK.post, seed: 1, bumpSlots: 1 });

    // A world of the studio's own, so nothing here changes what the page's Oogas carry: rounds without end.
    const world = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    const shared = { root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, fx, playerName: entry.name, viewYaw: VIEW.yaw, weaponsEnabled: true, groundAt, walkable, useNear,
      outsideActors: () => NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, jetpackAllowed: () => true, reticleTarget: () => "object",
      reloadPolicy: { near: () => false, available: () => false, consume() {} },
      fireReachable: (x, y, z, toX, toY, toZ) => toX * toX + toZ * toZ < (PAD + 6) * (PAD + 6) && toY > 0 && toY < 14,
      petLanding: (x, z, lying) => hammock.landing(x, z, lying) };
    crew = shared.crew = crewMod.create(shared);
    footsteps = BL.footsteps.create();
    pilot.bind(shared);
    cave = crew.cavemen.get(entry.name);
    crew.configureWeapon(cave, 0, "unlimited");
    crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    Object.assign(hooks, {
      onHover: (hit, p) => { if (hit) hud.tooltip.show(tip(hit), p.x, p.y, hit.owner.cave); else hud.tooltip.hide(); },
      onHoverMove: (hit, p) => hud.tooltip.show(tip(hit), p.x, p.y, hit.owner.cave),
      onTap: (hit) => { if (hit && hit.owner.kind === "caveman") crew.pokeCave(hit.owner.cave); },
      ...pilot.hooks,
      // A drag and the wheel are the free camera's while it is out.
      onOrbit: (dx, dy) => {
        if (!free.on) { pilot.hooks.onOrbit(dx, dy); return; }
        free.yaw -= dx * 0.004;
        free.pitch = clamp(free.pitch + dy * 0.0035, FREE.low, FREE.high);
      },
      onZoom: (factor, gesture, px, py) => {
        if (!free.on) { pilot.hooks.onZoom(factor, gesture, px, py); return; }
        free.dist = clamp(free.dist * factor, FREE.near, FREE.far);
      }
    });
    hud.onAction((action) => {
      if (action === "act") pilot.action();
      else if (action === "studio-speak") speak();
      else if (action === "studio-build") rebuild();
      else if (action.startsWith("studio-")) { const id = action.slice(7); if (PLACES.includes(id)) place(id); else toggle(id); }
      else if (action === "jetpack-toggle") toggle("jetpack");
      else if (action.startsWith("mode-")) pilot.modeAction(action, free.on);
      else if (action.startsWith("weapon-") || action === "magazine-swap") pilot.weaponAction(action);
      else if (action === "reset-view") pilot.resetCamera();
    });
    crew.refreshRosterRow(cave);
    pilot.possess(cave);
    BL.net.setBody(null);
    // Back as the last load left it, when the page was reloaded for a saved file, or as the Ooga before this one
    // stood, when the list swapped them; else standing at home.
    const saved = ctx.from === null || ctx.from === "studio" ? remembered() : null;
    night = !!(saved && saved.night);
    light();
    // Restore the held weapon while standing: the crew refuses weapon changes once in bed or a hammock.
    if (saved && saved.held) pilot.weaponMode(saved.held);
    // On its feet it stands where it stood, if that spot is still clear.
    if (saved && saved.place === "stand" && walkable(saved.x, saved.z, saved.x, saved.z, 0, cave.bodyHeight, cave)) stand(saved.x, saved.z, saved.heading);
    else place(saved ? saved.place : "stand");
    if (saved) {
      if (saved.jetpack) toggle("jetpack", true);
      Object.assign(pilot.orbit, { yaw: saved.yaw, tYaw: saved.yaw, pitch: saved.pitch, tPitch: saved.pitch, dist: saved.dist, tDist: saved.dist });
      // The view and its mode, as kept; a record from before views were kept has only the first person to say.
      if (saved.view) pilot.adopt(saved.view);
      else if (saved.eyes) toggle("eyes", true);
      if (saved.free) { setFree(true); [free.x, free.y, free.z, free.yaw, free.pitch, free.dist] = saved.free; }
    }
    nearKey = ""; spoken = 0;
    if (broken) hud.hint(broken, 36e5);
    Object.assign(studioScene, { root, camera, input, debug: { camera, crew, fx, pilot, hud, controls: pilot.controls, cavemen: crew.cavemen, studio: { place, toggle, speak, show, state, free, get hammock() { return hammock; }, get bed() { return bed; }, get seats() { return seats; }, get cave() { return cave; } } } });
    pilot.update(0);
  };
  const drawExtra = () => {};
  // A hint, unless the foot of the screen is saying why the file could not be shown.
  const say = (text) => { if (!broken) hud.hint(text); };
  const tip = (hit) => hit.owner.kind === "caveman" ? `${hit.owner.cave.traits.display || hit.owner.cave.traits.name} · tap to poke` : "";

  const update = (dt, elapsed) => {
    // The director names the tab and the address as a visit arrives; the studio's own follow it, once.
    if (!titled) { titled = true; document.title = `Studio · ${state.name}`; address(); }
    pilot.readInput(dt);
    crew.update(dt, elapsed);
    hammock.update(dt, elapsed, false, 0);
    // The bed poses after the crew; a pet riding its Ooga stays on this frame's body.
    for (const seat of hammock.seats) if (seat.sitter && seat.sitter.pet && seat.sitter.pet.ride) crew.pets.update(seat.sitter, 0);
    footsteps.update(crew.player);
    // Shadows are cast round the Ooga, wherever on the pad it stands.
    RENDER_OPTS.shadowCenter.x = cave.root.position.x; RENDER_OPTS.shadowCenter.z = cave.root.position.z;
    fire.update(dt, elapsed);
    embers.update(dt, elapsed, 0, 0, 1);
    const L = RENDER_OPTS.lights, glow = fire.light * (night ? 1.5 : 0.5);
    L[0] = FIRE.x; L[1] = 0.8; L[2] = FIRE.z; L[3] = 9; L[4] = glow; L[5] = glow * 0.55; L[6] = glow * 0.2;
    RENDER_OPTS.time = elapsed;
    const near = free.on ? nearKey : nearby();
    if (near !== nearKey) {
      nearKey = near;
      if (near === "sit") { hud.setAct("SIT"); say(COARSE ? "Tap SIT to sit down" : "Space · Sit"); }
      else if (near === "sleep") { hud.setAct("SLEEP"); say(COARSE ? "Tap SLEEP to lie down" : "Space · Sleep · then move to turn over"); }
      else if (near === "rest") { hud.setAct("REST"); say(COARSE ? "Tap REST to lie back in the hammock" : "Space · Rest in the hammock"); }
      else pilot.showAct();
    }
    // One of the three views is lit: its own eyes, the third person, or the free camera.
    press("eyes", !free.on && pilot.view === "first-person");
    press("third", !free.on && pilot.view !== "first-person");
    // The mode's button says which the Ooga is in now, and a press brings the other.
    if (combatShown !== !!cave.weapon.aiming) {
      combatShown = !!cave.weapon.aiming;
      buttons.combat.textContent = combatShown ? "Combat" : "Carry";
      buttons.combat.title = combatShown ? "In combat: press for carry" : "In carry: press for combat";
    }
    fx.update(dt, elapsed);
    stepTweens(dt);
    pilot.update(dt);
    if (free.on) flyFree(dt);
  };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);

  const leave = () => {
    window.clearInterval(watchTimer);
    watchTimer = 0;
    homeLink.title = homeTitle;
    letter(homeLink.querySelector("[data-sign]"), homeWords);
    pick.replaceChildren();
    panel.groups.replaceChildren();
    panel.parts.replaceChildren();
    delete panel.root.dataset.resizing;
    resizing = null;
    panelFill++;
    homeLink = pick = panel = null;
    remember();
    free.on = false;
    getUp();
    embers.dispose();
    hammock.dispose();
    footsteps.dispose();
    crew.dispose();
    fx.dispose();
    pilot.dispose();
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    hud = hooks = input = pilot = fx = crew = footsteps = cave = entry = hammock = bed = fire = embers = seats = blocks = buttons = null;
    studioScene.input = studioScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    for (const who of crew.cavemen.values()) set.add(who.headOpen).add(who.headClosed);
    set.add(hubModels.jetpack()).add(hubModels.jetFlame());
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...crew.stats() };
  };
  const studioScene = BL.deferred.scene("studio", {
    // Nobody else is ever here: the studio reports no body and shares no voice.
    voiceZone: "none",
    id: "studio", enter, update, overlay, onDonation, onKey, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null,
    get inMotion() { return !!fx && fx.inMotion; }
  });
  studioScene.controlsHelp = (touch) => {
    const help = pilot.controlsHelp(touch, ["weapon", "attack", "swapWeapon", "jetpack"]);
    help.title = "Studio · " + help.title;
    return help;
  };
  studioScene.controlsHelpHold = (on) => { pilot.controls.reset(); pilot.setMenuOpen(on, false); };
})();
