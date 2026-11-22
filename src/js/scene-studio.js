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
  const CHAIR = { x: 4.7, z: -1.4, top: 0.5, ry: Math.atan2(-4.7, 1.4) }, FIRE = { x: 3.3, z: 3.5, r: 0.85, seats: 6, out: 1.8 };
  const BED = { x: -4.9, z: 0.6 }, HAMMOCK = { z: -5, half: 2.7, post: 0.13, tall: 3.5, wide: 0.575, reach: 0.3 };
  const DAY = 13, NIGHT = 22.5, DAY_OF_YEAR = 80;
  const PLACES = ["stand", "chair", "bed", "hammock", "fire", "physics", "pond"];
  // The pond: a raised stone basin `r` across its water, its rim `rim` wide and `top` high (a step up), its water's surface
  // at `surface` over the pad. The surface is a wave field on an N by N grid (`wave`, `C` its speed, `DAMP` and `PULL`
  // calming it), drawn as a mesh rewritten each frame; splashes, wading and rounds into it set it moving, and what floats
  // on it (physics.js `water`) bobs on it. `stand` is where the Pond button stands the Ooga, facing it.
  const POND = { x: 8, z: 9, r: 3, rim: 0.35, top: 0.55, surface: 0.48, N: 28, C: 2.2, DAMP: 0.9, PULL: 3, stand: { x: 8, z: 4.4 } };
  // The physics area on the pad's open ground (physics.js): a crate pyramid, a tower of dice, barrels stood as
  // bowling pins and a few dice about, each `[kind, variant, x, z, layer, yaw]`, a layer a crate's or die's height up.
  // `stand` is where the Physics button stands the Ooga, facing them.
  const PLAY = { x: -4, z: 9.5, stand: { x: -4, z: 5 } };
  const PROPS = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) PROPS.push(["crate", 0, -6.6 + (i + row / 2) * 0.8, 10.2, row, 0]);
  for (let i = 0; i < 6; i++) PROPS.push(["die", i % 6, -1.4, 9.4, i, i * 0.35]);
  for (const [i, j] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2]]) PROPS.push(["barrel", 0, -3.6 + i * 0.45, 12.4 + j * 0.75, 0, 0]);
  for (const [x, z, v] of [[-4.6, 8.4, 1], [-3.2, 8.9, 2], [-2.4, 7.8, 3]]) PROPS.push(["die", v, x, z, 0, x]);
  // Afloat in the pond, rest a little sunk at its surface (their seventh field, the height of their foot).
  for (const [kind, x, z, yaw] of [["barrel", 7.2, 8.4, 0], ["barrel", 9.1, 9.8, 1], ["crate", 8.4, 10.6, 0.4], ["crate", 6.9, 9.9, 1.1], ["die", 9.2, 8.1, 0.7]])
    PROPS.push([kind, 0, x, z, 0, yaw, POND.surface - 0.3]);
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
  const PROP_DUST = models.particleGeometry("#a3874f", 0.1, 0);
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
  let renderer, game, go, root, camera, hud, hooks, input, pilot, fx, crew, footsteps, cave, entry, hammock, bed, fire, embers, seats, blocks, buttons, physics;
  // Who is wanted on the pad: the address's Ooga as the page loads, then whoever the list or a script asks for.
  let asked = (params.get("character") || "").trim();
  let night = false, combatShown = null, nearKey = "", spoken = 0, watchTimer = 0, watchVersion = null, watchError = "", broken = "", homeLink = null, homeTitle = "", homeWords = "", pick = null, titled = false;
  let wardrobe = null;

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
  // The pond's rim is a step up; inside it the floor is the pad.
  const pondDistance = (x, z) => Math.hypot(x - POND.x, z - POND.z);
  const padAt = (x, z) => {
    if (bed && onBed(x, z)) return bed.sleep.surface;
    const d = pondDistance(x, z);
    return d >= POND.r && d <= POND.r + POND.rim ? POND.top : 0;
  };
  // Where the studio's own Ooga stands: the pad, or a loose prop's top it has climbed onto (physics.js `supportAt`).
  const groundAt = (x, z, y, previous, who) => {
    const floor = padAt(x, z);
    return physics && who === cave && Number.isFinite(y) ? Math.max(floor, physics.supportAt(x, z, Math.max(y, previous ?? y), 0.6)) : floor;
  };
  // The loose props' world: the pad, nothing past its edge, and the furniture's circles in the way.
  const propGround = (x, z) => x * x + z * z < PAD * PAD ? padAt(x, z) : -Infinity;
  // The pond's rim holds what floats in it in, and keeps what slides along the pad out, below its top.
  const propClear = (x, feet, z, toX, toY, toZ, radius) => {
    if (blocked(toX, toZ, radius)) return false;
    if (feet > POND.top + 0.2) return true;
    const d0 = pondDistance(x, z), d1 = pondDistance(toX, toZ), outer = POND.r + POND.rim;
    if (d0 < POND.r) return d1 + radius <= POND.r || d1 < d0;
    return !(d0 > outer && d1 - radius < outer && d1 < d0);
  };
  const PROP_HIT = { body: -1, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  // ---- the pond's water ----
  const SPLASH = [models.particleGeometry("#9fd8ff", 0.09, 0.25), models.particleGeometry("#e8f7ff", 0.07, 0.35), models.particleGeometry("#5fb4e6", 0.08, 0.15)];
  const WATER = BL.math.hexToRgb("#2f86c4");
  let wave = null, pondFeet = NaN, pondNoise = 0;
  // The rim, a ring of stone round the water.
  const rim = models.cached(() => models.lathe({ profile: [[POND.r + POND.rim, 0], [POND.r + POND.rim, POND.top], [POND.r, POND.top], [POND.r, 0]], segments: 48, color: "#8d8a80" }));
  const buildPond = () => {
    const N = POND.N, n = (N + 1) * (N + 1), h = 2 * POND.r / N, verts = new Array(n * 3 + 6).fill(0), faces = [], inside = new Uint8Array(n);
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const k = i * (N + 1) + j, x = -POND.r + i * h, z = -POND.r + j * h;
      verts[3 * k] = x; verts[3 * k + 2] = z;
      inside[k] = Math.hypot(x, z) < POND.r - h * 0.5 ? 1 : 0;
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const cx = -POND.r + (i + 0.5) * h, cz = -POND.r + (j + 0.5) * h;
      if (Math.hypot(cx, cz) > POND.r + h * 0.3) continue;
      const a = i * (N + 1) + j, b = a + N + 1;
      faces.push({ i: [a, a + 1, b + 1, b], color: WATER, emissive: 0.08 });
    }
    // Two corners of a box round any wave, no face's, so the bounds stay fixed.
    verts[n * 3] = -POND.r; verts[n * 3 + 1] = -1; verts[n * 3 + 2] = -POND.r;
    verts[n * 3 + 3] = POND.r; verts[n * 3 + 4] = 1; verts[n * 3 + 5] = POND.r;
    const geometry = { verts, faces, lines: [], smooth: true, dynamic: true, revision: 0 };
    addChild(root, createNode({ geometry: rim(), position: { x: POND.x, y: 0, z: POND.z } }));
    addChild(root, createNode({ geometry, position: { x: POND.x, y: POND.surface, z: POND.z } }));
    wave = { N, n, h, H: new Float32Array(n), V: new Float32Array(n), inside, geometry, time: 0 };
  };
  // The wave's height at (x, z) on the pad, between its grid's points.
  const waveAt = (x, z) => {
    const N = wave.N, fx = (x - POND.x + POND.r) / wave.h, fz = (z - POND.z + POND.r) / wave.h;
    const i = Math.max(0, Math.min(N - 1, Math.floor(fx))), j = Math.max(0, Math.min(N - 1, Math.floor(fz))), u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const H = wave.H, k = i * (N + 1) + j;
    return (H[k] * (1 - u) + H[k + N + 1] * u) * (1 - v) + (H[k + 1] * (1 - u) + H[k + N + 2] * u) * v;
  };
  const waterAt = (x, z) => wave && pondDistance(x, z) < POND.r ? POND.surface + waveAt(x, z) : -Infinity;
  // A push to the water at (x, z): its points within `radius` thrown down by `speed` (m/s), most at the middle.
  const disturb = (x, z, speed, radius) => {
    const N = wave.N, h = wave.h, ci = (x - POND.x + POND.r) / h, cj = (z - POND.z + POND.r) / h, reach = Math.ceil(radius / h);
    for (let i = Math.max(0, Math.floor(ci) - reach); i <= Math.min(N, Math.ceil(ci) + reach); i++)
      for (let j = Math.max(0, Math.floor(cj) - reach); j <= Math.min(N, Math.ceil(cj) + reach); j++) {
        const k = i * (N + 1) + j, d = Math.hypot(i - ci, j - cj) * h / radius;
        if (d < 1 && wave.inside[k]) wave.V[k] -= speed * (1 - d * d);
      }
  };
  // Something coming down into the water at `speed`: a ring of waves and a burst of spray, bigger the faster.
  const splash = (x, z, speed) => {
    if (pondDistance(x, z) >= POND.r) return;
    disturb(x, z, Math.min(6, speed * 0.7), 0.45 + Math.min(0.6, speed * 0.06));
    fx.burst(x, POND.surface + 0.05, z, Math.min(24, 6 + Math.round(speed * 3)), SPLASH, 1.2 + speed * 0.35);
  };
  // A round from `from` to `to` that reaches the water first stops on it, splashing.
  const shotWater = (from, to) => {
    if (from.y <= POND.surface || to.y >= POND.surface) return;
    const t = (from.y - POND.surface) / (from.y - to.y), x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
    if (pondDistance(x, z) >= POND.r) return;
    to.x = x; to.y = POND.surface; to.z = z;
    splash(x, z, 4);
  };
  const stepPond = (dt) => {
    const N = wave.N, H = wave.H, V = wave.V, inside = wave.inside, k2 = POND.C * POND.C / (wave.h * wave.h);
    // A breath of wind now and then keeps the surface alive.
    if ((pondNoise -= dt) <= 0) {
      pondNoise = 0.15 + Math.random() * 0.3;
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * POND.r * 0.8;
      disturb(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r, 0.25, 0.5);
    }
    wave.time = Math.min(wave.time + dt, 4 / 60);
    for (; wave.time >= 1 / 120; wave.time -= 1 / 120) {
      const h = 1 / 120;
      for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
        const k = i * (N + 1) + j;
        if (!inside[k]) continue;
        const lap = H[k - 1] + H[k + 1] + H[k - N - 1] + H[k + N + 1] - 4 * H[k];
        V[k] += (k2 * lap - POND.PULL * H[k] - POND.DAMP * V[k]) * h;
      }
      for (let k = 0; k < wave.n; k++) H[k] = inside[k] ? Math.max(-0.25, Math.min(0.25, H[k] + V[k] * h)) : 0;
    }
    const v = wave.geometry.verts;
    for (let k = 0; k < wave.n; k++) v[3 * k + 1] = H[k];
    wave.geometry.revision++;
  };
  // The Ooga in the pond: a splash coming down into it, a wake wading through it.
  const pondOoga = (dt, vx, vz) => {
    const p = cave.root.position, feet = p.y - cave.baseY, inside = pondDistance(p.x, p.z) < POND.r - 0.2;
    if (inside && !Number.isNaN(pondFeet) && pondFeet > POND.surface && feet <= POND.surface) splash(p.x, p.z, Math.max(2, (pondFeet - feet) / Math.max(dt, 1e-3)));
    else if (inside && feet < POND.surface) {
      const speed = Math.hypot(vx, vz);
      if (speed > 0.3) disturb(p.x, p.z, speed * 0.35 * dt * 60 * 0.05, 0.45);
    }
    pondFeet = feet;
  };
  let propX = NaN, propZ = NaN, chairBody = -1;
  // A prop out of place goes home 15 s after anything last hit or pushed it.
  const PROP_HOME_AFTER = 15;
  const puff = (i) => {
    const at = physics.position(i, PROP_HIT);
    fx.burst(at.x, at.y, at.z, 6, [PROP_DUST], 1.1);
  };
  const chairBounds = models.cached(() => {
    const v = chair().verts, b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], v[i + k]); b[k + 3] = Math.max(b[k + 3], v[i + k]); }
    return b;
  });
  const propTargets = [];
  const propTarget = (node, kind, body) => { propTargets.push(node); input.add(node, { kind: "prop", piece: kind, body,
    pickRay: (ray) => physics && physics.raycast(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, camera.far, PROP_HIT) && PROP_HIT.body === body ? PROP_HIT.t : NaN },
    { radius: Math.max(0.35, physics.radius(body)) }); };
  // The chair stands where it belongs again (Chair, or sitting down in it after it was knocked over).
  const chairHome = () => {
    if (!physics.displaced(chairBody)) return;
    puff(chairBody);
    physics.home(chairBody);
    physics.sync();
  };
  // The physics area's props, each its own node and body, still a target to hover and tap.
  const buildProps = () => {
    buildPond();
    physics = BL.physics.create({ ground: propGround, clear: propClear, water: waterAt, onSplash: (x, y, z, speed) => splash(x, z, speed) });
    const chairNode = createNode({ geometry: chair(), quaternion: BL.math.quat.create() });
    addChild(root, chairNode);
    chairBody = physics.addPiece({ node: chairNode, bounds: chairBounds(), x: CHAIR.x, y: 0, z: CHAIR.z, yaw: CHAIR.ry, density: 30, tag: "chair" });
    propTarget(chairNode, "chair", chairBody);
    for (const [kind, variant, x, z, layer, yaw, foot] of PROPS) {
      const baked = BL.dressing.loosePiece(kind, variant), b = baked.bounds, node = createNode({ quaternion: BL.math.quat.create(), sightHidden: true });
      const parts = BL.dressing.nodes(baked, { glow: 1 });
      for (const part of parts) addChild(node, part);
      addChild(root, node);
      propTarget(parts[0], kind, physics.addPiece({ node, bounds: b, x, y: foot ?? layer * (b[4] - b[1]), z, yaw, tag: kind }));
    }
    physics.sync();
  };
  const PROP_NAMES = { crate: "Crate", die: "Die", barrel: "Barrel", chair: "Chair" };
  // The Ooga pushes what it walks into (never what it sits or lies in); then the props move a step, and those left
  // alone long enough go home. A chair knocked out from under its sitter stands them up.
  const updateProps = (dt) => {
    physics.clearActors();
    const p = cave.root.position;
    if (cave.root.visible && dt > 0 && !cave.camp.seat && !crew.sleeping) {
      const vx = Number.isNaN(propX) ? 0 : (p.x - propX) / dt, vz = Number.isNaN(propZ) ? 0 : (p.z - propZ) / dt;
      physics.actor(p.x, p.y - cave.baseY, p.z, cave.bodyRadius || 0.3, cave.bodyHeight, Math.abs(vx) < 20 ? vx : 0, Math.abs(vz) < 20 ? vz : 0);
      // Walking into the hammock pushes it, as on the island (scene-hub.js `rockHammock`).
      if (!Number.isNaN(propX) && hammock.bump(0, p.x, p.y - cave.baseY, p.z, vx, vz) > 0) crew.pushPose(cave);
      pondOoga(dt, vx, vz);
    } else pondFeet = NaN;
    propX = p.x; propZ = p.z;
    if (dt > 0) stepPond(dt);
    physics.step(dt);
    physics.settle(dt, PROP_HOME_AFTER, puff);
    if (seats[0].sitter && physics.displaced(chairBody)) crew.standPlayer(seats[0].sitter);
  };
  const resetProps = () => physics.reset(puff);
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
      if (!seat.sitter && d < reach && !(seat === seats[0] && physics.displaced(chairBody))) { best = seat; reach = d; }
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
    else if (id === "physics") stand(PLAY.stand.x, PLAY.stand.z, Math.PI, 0, 0.32, 6.5);
    else if (id === "pond") stand(POND.stand.x, POND.stand.z, Math.PI, 0, 0.4, 7);
    else if (id === "bed") { stand(bed.walkAt.x, bed.walkAt.z, Math.PI / 2, -0.55, 0.5, 5.6); ok = crew.sleepPlayer(bed); }
    else if (id === "hammock") {
      const seat = hammock.seats[0];
      stand(seat.walkAt.x, seat.walkAt.z, 0, 0.5, 0.38, 6.2);
      ok = hammock.enter(cave, seat, crew.sitPlayer);
    } else {
      if (id === "chair") chairHome();
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
  // The wardrobe: a row for each slot (equipment-wardrobe.js `SLOTS`), folded to its name and what is worn there, which
  // opens on a list of everything that slot can wear and, for the hat and the mask, a size. Choosing previews it on
  // the Ooga on the pad; Save keeps the whole look for the visitor's own Ooga (equipment.js), hat and all.
  const startWardrobe = (signal) => {
    const $ = (id) => document.getElementById(id), equipment = BL.equipment, hats = BL.equipmentHats, W = BL.equipmentWardrobe;
    const view = wardrobe = { slots: $("studio-slots"), save: $("studio-hat-save"), own: $("studio-hat-own"), status: $("studio-hat-status"), link: $("studio-hat-link"),
      editors: $("studio-editors"), changes: $("studio-changes"), discard: $("studio-discard"), selection: null, size: 100, worn: null, dirty: false, ticket: 0, stop: null, open: "hat" };
    const owns = () => BL.net.ownCharacter()?.handle.toLowerCase() === state.name.toLowerCase();
    const hatKey = (s) => s ? s.item === "none" ? "none" : `${s.item}@${s.version}` : "authored";
    const pieceKey = (c) => c ? c.item === "none" ? "none" : c.item === "custom" ? "custom:" + c.color : c.version : "original";
    const nameOf = (handle) => BL.characters.get(handle)?.display || handle;
    const credits = (creators) => {
      if (!creators.length) return "";
      const names = creators.map((c) => c === "OogaBoogaX" ? "the stock Ooga" : nameOf(c));
      return "By " + (names.length > 4 ? names.slice(0, 3).join(", ") + ` and ${names.length - 3} more` : names.join(", "));
    };
    const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
    // Each slot's mark on its tile: a ten-by-ten pixel silhouette in the tile's own ink.
    const ICONS = {
      body: ["....##....", "....##....", "..######..", ".#.####.#.", ".#.####.#.", "...####...", "...#..#...", "..##..##.."],
      hat: ["...####...", "..######..", "..######..", "..######..", "..######..", "##########", "##########"],
      hair: ["..######..", ".########.", "##########", "###....###", "##......##", "##......##", "##......##", "#........#"],
      eyes: ["####..####", "#..#..#..#", "#.##..#.##", "####..####"],
      glasses: ["####..####", "#..####..#", "#..#..#..#", "####..####"],
      mask: ["..######..", ".#......#.", "#..#..#..#", "#.##..##.#", "#........#", ".#..##..#.", "..#.##.#..", "...####..."],
      mouth: ["#........#", ".#......#.", "..######.."],
      beard: ["#........#", "#........#", "##.####.##", "##########", "##########", ".########.", "..######..", "...####..."],
      shirt: ["..##..##..", "###....###", "##########", "##########", "..######..", "..######..", "..######..", "..######.."],
      gloves: ["....##....", "...####.#.", "...######.", "...#####..", "...####...", "..######..", "..######.."],
      belt: ["####..####", "###.##.###", "###.##.###", "####..####"],
      pants: ["##########", "##########", "####..####", "###....###", "###....###", "###....###", "###....###"],
      shoes: ["..###.....", "..###.....", "..###.....", "..######..", ".########.", "##########", "##########"],
      back: ["#........#", "##......##", "###.##.###", "##########", ".########.", ".###..###.", "..#....#.."],
      weapon: ["......###.", ".....####.", "....####..", "...##.....", "..##......", ".##.......", "##........", "#........."]
    };
    const icon = (id) => {
      const rows = ICONS[id], svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      let d = "";
      const top = Math.floor((10 - rows.length) / 2);
      rows.forEach((row, y) => { for (let x = 0; x < row.length;) { if (row[x] !== "#") { x++; continue; } let w = 0; while (row[x + w] === "#") w++; d += `M${x} ${y + top}h${w}v1h-${w}z`; x += w; } });
      svg.setAttribute("viewBox", "0 0 10 10"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("studio-tile-icon");
      path.setAttribute("d", d); path.setAttribute("fill", "currentColor"); svg.append(path);
      return svg;
    };
    // One slot: its tile in the grid (its mark and its name) and its editor under the grid, shown while the tile is
    // chosen. A colour slot has no tile: its editor is part of another's (`COLOUR_IN`: the skin's under the body, the
    // hair's and the eyes' under theirs), headed by what it wears. Its options are kept as data beside the list:
    // `{ label, creators, pick }`, where `pick` gives what choosing it wears (the hat's selection, or a slot's choice).
    const editors = view.editors, COLOUR_IN = { skin: "body", hairColor: "hair", eyeColor: "eyes" };
    const makeRow = (slot) => {
      const colour = !!COLOUR_IN[slot.id];
      const body = element("div", colour ? "studio-editor studio-colour" : "studio-editor"), heading = element("p", "studio-editor-name", slot.id === "skin" ? "Skin color" : slot.label);
      const select = element("select"), credit = element("p", "studio-slot-credit"), note = element("p", "studio-note"), value = colour ? element("span", "studio-colour-name") : null;
      body.id = `studio-editor-${slot.id}`; body.dataset.slot = slot.id; body.hidden = !colour;
      select.id = slot.id === "hat" ? "studio-hat-choices" : `studio-slot-${slot.id}`;
      select.setAttribute("aria-label", slot.label);
      select.hidden = colour;
      note.hidden = true;
      if (value) heading.append(value);
      body.append(heading, select, credit);
      let tile = null;
      if (!colour) {
        tile = element("button", "studio-tile");
        tile.type = "button"; tile.dataset.slot = slot.id; tile.setAttribute("aria-pressed", "false"); tile.setAttribute("aria-controls", `studio-editor-${slot.id}`);
        if (slot.id === "hat") tile.id = "studio-hat";
        tile.append(icon(slot.id), element("span", "studio-tile-name", slot.id === "weapon" ? "Weapon" : slot.label));
        view.slots.append(tile);
      }
      const row = { slot, tile, details: tile || body, body, value, select, credit, note, options: [], range: null, output: null, reset: null };
      if (slot.sized) {
        const id = slot.id === "hat" ? "studio-hat-size" : `studio-slot-${slot.id}-size`, line = element("div", "studio-size-line"), label = element("label", "roster-sort-label studio-hat-size-label", "Size ");
        label.htmlFor = id;
        row.output = element("output", null, "100%"); row.output.id = id + "-value"; row.output.htmlFor = id;
        label.append(row.output);
        row.range = element("input"); Object.assign(row.range, { type: "range", id, min: "80", max: "120", step: "1", value: "100", disabled: true });
        row.range.setAttribute("aria-valuetext", "100%");
        row.reset = element("button", "link", "Reset size"); row.reset.type = "button"; row.reset.id = slot.id === "hat" ? "studio-hat-size-reset" : `studio-slot-${slot.id}-reset`; row.reset.disabled = true;
        row.reset.title = "Back to the reviewed fit, 100%";
        line.append(label, row.reset);
        body.append(line, row.range);
      }
      body.append(note);
      editors.append(body);
      return row;
    };
    // The chosen tile and the one editor it opens, across the grid under the chosen tile's row.
    const choose = (row) => {
      view.open = row.slot.id;
      const last = tiled[Math.min(tiled.indexOf(row) | 1, tiled.length - 1)].tile;
      if (last.nextSibling !== editors) last.after(editors);
      for (const other of tiled) {
        const on = other === row;
        other.tile.setAttribute("aria-pressed", String(on));
        other.body.hidden = !on;
      }
    };
    const add = (row, label, creators, pick, depth = 0, extra = null) => {
      const option = element("option", null, (depth ? " ".repeat(depth) + "↳ " : "") + label);
      option.value = String(row.options.length);
      if (creators.length) option.title = credits(creators);
      row.select.append(option);
      const entry = { option, label, creators, pick, ...extra };
      // What choosing it wears, as the page names it: the hat's `item@version`, `none` or `authored`; a slot's piece's
      // version, `none` or `original`.
      option.dataset.value = row === hatRow ? hatKey(extra?.choice ? extra.choice.selection : pick()) : pieceKey(pick());
      if (extra?.choice) option.dataset.hatKey = extra.choice.key;
      row.options.push(entry);
      return entry;
    };
    const rows = W.SLOTS.map(makeRow), hatRow = rows.find((row) => row.slot.id === "hat"), tiled = rows.filter((row) => row.tile);
    for (const row of rows) if (COLOUR_IN[row.slot.id]) { const host = rows.find((r) => r.slot.id === COLOUR_IN[row.slot.id]); host.body.insertBefore(row.body, host.note); }
    for (const row of tiled) row.tile.addEventListener("click", () => choose(row), { signal });
    choose(tiled.find((row) => row.slot.id === view.open) || hatRow);
    // The hat's list: the character's own, none, then each shared choice with its variants under it.
    add(hatRow, "Original character look", [], () => null);
    add(hatRow, "No hat", [], () => ({ item: "none", version: null }), 0, { selection: { item: "none", version: null } });
    const grouped = new Map(), saved = new Map();
    const family = (choice, depth) => {
      grouped.set(choice.key, add(hatRow, choice.label, choice.creators, () => hats.selectionFor(choice, owns() ? equipment.state.record.selection : null), depth, { choice }));
      for (const child of choice.children) family(child, depth + 1);
    };
    for (const choice of hats.groups()) family(choice, 0);
    for (const row of rows.filter((row) => row !== hatRow)) {
      add(row, "Original look", [], () => null);
      if (row.slot.none) add(row, row.slot.none, [], () => ({ item: "none", version: null }));
      for (const item of W.slotItems(row.slot.id)) add(row, item.label, item.creators, () => ({ item: item.id, version: item.version }), 0, { item });
      // A colour the player mixed: the picker's, or one typed as a hex.
      if (COLOUR_IN[row.slot.id]) row.custom = add(row, "Custom", [], () => ({ item: "custom", version: null, color: row.mixed }));
    }
    // The Ooga's own colours choose from swatches over the list: its own colour first, then the palette. Their colours
    // are the pieces' own, so they are painted once the pieces' chunk is here (equipment.js `loadWardrobe`).
    const TONES = { skin: "skin", hairColor: "hair", eyeColor: "eyeColor" }, OWN_EYES = "#f4f0e6";
    const ownTone = (id) => (cave.template?.traits || cave.traits)[TONES[id]] || (id === "eyeColor" ? OWN_EYES : "#888888");
    const toneOf = (row, entry) => entry === row.options[0] ? ownTone(row.slot.id) : entry === row.custom ? view.worn?.[row.slot.id]?.color || row.mixed || null
      : W.content(entry.item?.version)?.color || null;
    const swatched = rows.filter((row) => TONES[row.slot.id]);
    // Wearing a mixed colour builds the Ooga again, so a drag across the picker is worn once it rests (`MIX_REST`).
    const MIX_REST = 350, HEX_IN = /^#?([0-9a-f]{6})$/i;
    const wearMixed = (row, hex) => {
      row.mixed = hex;
      if (view.worn?.[row.slot.id]?.color === hex) return;
      row.select.value = row.custom.option.value; row.select.dispatchEvent(new Event("change"));
    };
    for (const row of swatched) {
      const box = element("div", "studio-swatches");
      box.setAttribute("role", "group"); box.setAttribute("aria-label", `${row.slot.label} swatches`);
      row.swatches = row.options.filter((entry) => entry !== row.custom).map((entry) => {
        const swatch = element("button", "studio-swatch");
        swatch.type = "button"; swatch.title = entry.label; swatch.setAttribute("aria-label", entry.label); swatch.setAttribute("aria-pressed", "false");
        if (entry === row.options[0]) swatch.dataset.own = "true";
        swatch.entry = entry;
        swatch.addEventListener("click", () => { row.select.value = entry.option.value; row.select.dispatchEvent(new Event("change")); }, { signal });
        box.append(swatch);
        return swatch;
      });
      // The last cell is the colour wheel; the hex field under the grid says, and takes, the colour worn.
      const wheel = element("input", "studio-swatch studio-wheel"), mix = element("label", "studio-hex"), hex = element("input");
      Object.assign(wheel, { type: "color", value: "#888888", title: "Pick any color" });
      wheel.setAttribute("aria-label", `Pick any ${row.slot.id === "skin" ? "skin color" : row.slot.label.toLowerCase()}`);
      Object.assign(hex, { type: "text", maxLength: 7, spellcheck: false, autocomplete: "off", placeholder: "#rrggbb", id: `studio-slot-${row.slot.id}-hex` });
      hex.setAttribute("aria-label", `${row.slot.id === "skin" ? "Skin color" : row.slot.label} hex`);
      mix.append("Hex", hex);
      box.append(wheel);
      row.wheel = wheel; row.hex = hex;
      let rest = 0;
      const timers = () => { clearTimeout(rest); rest = 0; };
      signal.addEventListener("abort", timers);
      wheel.addEventListener("input", () => {
        hex.value = wheel.value; wheel.dataset.mixed = "true"; wheel.style.backgroundColor = wheel.value;
        timers(); rest = setTimeout(() => { rest = 0; wearMixed(row, wheel.value.toLowerCase()); }, MIX_REST);
      }, { signal });
      wheel.addEventListener("change", () => { timers(); wearMixed(row, wheel.value.toLowerCase()); }, { signal });
      const typed = () => {
        const m = HEX_IN.exec(hex.value.trim());
        hex.toggleAttribute("aria-invalid", !m);
        if (m) wearMixed(row, "#" + m[1].toLowerCase());
      };
      hex.addEventListener("change", typed, { signal });
      hex.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); typed(); } }, { signal });
      row.select.before(box, mix);
    }
    // Painted now where the pieces are already here (the portable page, a second visit), else once they arrive.
    const paintSwatches = () => {
      for (const row of swatched) for (const swatch of row.swatches) { const tone = toneOf(row, swatch.entry); if (tone) swatch.style.background = tone; }
    };
    paintSwatches();
    const ready = equipment.loadWardrobe();
    if (ready) ready.then(() => { if (wardrobe === view && !signal.aborted) { paintSwatches(); display(); } }, () => {});
    // The option showing what a row wears: the hat's grouped choice for its pin, or a slot's item. A pin no longer
    // listed (an old hat version, a retired piece) gets an option of its own while it is saved or previewed.
    const optionFor = (row, worn) => {
      if (row === hatRow) {
        if (!worn) return hatRow.options[0];
        if (worn.item === "none") return hatRow.options[1];
        const choice = hats.choiceFor(worn);
        if (choice && grouped.has(choice.key)) return grouped.get(choice.key);
        return saved.get(row.slot.id + hatKey(worn)) || null;
      }
      if (!worn) return row.options[0];
      if (worn.item === "custom") { row.mixed = worn.color; return row.custom; }
      return row.options.find((o) => worn.item === "none" ? !o.item && o.pick()?.item === "none" : o.item?.version === worn.version)
        || saved.get(row.slot.id + pieceKey(worn)) || null;
    };
    const keep = (row, worn) => {
      const key = row.slot.id + (row === hatRow ? hatKey(worn) : pieceKey(worn));
      if (saved.has(key)) return saved.get(key);
      const item = row === hatRow ? hats.get(worn.item, worn.version) || hats.get(worn.item) : W.get(worn.item);
      const creators = row === hatRow ? item?.creator ? [item.creator] : [] : item?.creators || [];
      const entry = add(row, `${item?.label || "My " + row.slot.label.toLowerCase()} · saved version`, creators, () => ({ ...worn }), 0, { item: row === hatRow ? null : item });
      entry.option.dataset.savedVersion = "true";
      saved.set(key, entry);
      return entry;
    };
    const wornIn = (row) => row === hatRow ? view.selection : view.worn?.[row.slot.id] || null;
    const savedIn = (row) => {
      const s = equipment.state, own = owns() && s.supported;
      return !own ? null : row === hatRow ? s.record.selection : s.record.wardrobe?.[row.slot.id] || null;
    };
    const supported = (row) => row === hatRow ? BL.characterEquipment.supports(cave) : BL.characterWardrobe.supports(cave, row.slot.id);
    const display = () => {
      let changes = 0;
      for (const row of rows) {
        const worn = wornIn(row), entry = optionFor(row, worn) || keep(row, worn), base = savedIn(row);
        row.select.value = entry.option.value;
        // A body or an Ooga's own colour is the game's, credited to nobody.
        row.credit.textContent = row.slot.id === "body" || row.swatches ? "" : credits(entry.creators);
        if (row.swatches) {
          const tone = toneOf(row, entry), mixed = entry === row.custom;
          row.value.textContent = entry === row.options[0] ? "Original" : mixed ? tone.toUpperCase() : entry.label;
          for (const swatch of row.swatches) swatch.setAttribute("aria-pressed", String(swatch.entry === entry));
          row.wheel.setAttribute("aria-pressed", String(mixed));
          row.wheel.toggleAttribute("data-mixed", mixed);
          row.wheel.style.backgroundColor = mixed ? tone : "";
          if (tone) row.wheel.value = tone;
          if (document.activeElement !== row.hex) { row.hex.value = tone ? tone.toUpperCase() : ""; row.hex.removeAttribute("aria-invalid"); }
        }
        const same = row === hatRow ? hatKey(worn) === hatKey(base) && (!worn || worn.item === "none" || view.size === equipment.state.record.size)
          : pieceKey(worn) === pieceKey(base) && (worn?.size || 100) === (base?.size || 100);
        row.details.toggleAttribute("data-changed", view.dirty && !same);
        row.details.toggleAttribute("data-worn", !!worn);
        if (view.dirty && !same) changes++;
        const ok = supported(row);
        row.details.toggleAttribute("data-unsupported", !ok);
        row.select.disabled = !ok;
        if (row.swatches) for (const control of [...row.swatches, row.wheel, row.hex]) control.disabled = !ok;
        row.note.hidden = ok;
        if (!ok) row.note.textContent = row === hatRow ? "This character needs a hat fitting before it can wear shared hats."
          : `This Ooga's own design keeps its ${row.slot.label.toLowerCase()}.`;
        if (row.range) {
          const size = row === hatRow ? view.size : worn?.size || 100, minimum = row === hatRow ? BL.characterEquipment.minimumSize(cave, view.selection) : 80;
          row.range.min = String(minimum);
          row.range.value = String(size);
          row.range.setAttribute("aria-valuetext", `${size}%`);
          row.output.value = `${size}%`;
          row.range.disabled = !ok || !worn || worn.item === "none";
          row.reset.disabled = row.range.disabled || size === 100;
        }
      }
      // A colour's change and wear show on the tile whose editor holds it.
      for (const row of rows) if (COLOUR_IN[row.slot.id]) {
        const host = rows.find((r) => r.slot.id === COLOUR_IN[row.slot.id]).tile;
        for (const flag of ["data-changed", "data-worn"]) if (row.body.hasAttribute(flag)) host.setAttribute(flag, "");
      }
      view.changes.textContent = changes === 1 ? "1 change" : `${changes} changes`;
      view.changes.parentElement.hidden = !changes;
    };
    const draw = async () => {
      const ticket = ++view.ticket, chosen = view.selection, size = view.size, worn = view.worn;
      const stale = () => signal.aborted || wardrobe !== view || ticket !== view.ticket;
      try {
        if (chosen && chosen.item !== "none" && !hats.loaded(chosen.item, chosen.version)) await hats.load(chosen.item, chosen.version);
        if (worn && !equipment.wardrobeReady(worn)) await equipment.loadWardrobe();
        if (stale()) return;
        const dressed = BL.characterWardrobe.apply(cave, worn);
        if (!BL.characterEquipment.apply(cave, chosen, size)) view.status.textContent = "This character needs a hat fitting before it can wear this selection.";
        else if (!dressed) view.status.textContent = "These pieces could not be put on this Ooga. Try again.";
        // What the editors allow follows the build now worn (a female face takes no beard).
        display();
      } catch { if (!stale()) view.status.textContent = "This look could not be loaded. Try again."; }
    };
    const changed = () => {
      if (wardrobe !== view) return;
      const own = owns(), s = equipment.state;
      if (!view.dirty) {
        view.selection = own && s.supported ? s.record.selection : null;
        view.size = view.selection && view.selection.item !== "none" ? s.record.size : 100;
        view.worn = own && s.supported ? s.record.wardrobe : null;
      }
      view.size = Math.max(BL.characterEquipment.minimumSize(cave, view.selection), view.size);
      display();
      if (!view.dirty) draw();
      view.save.disabled = !own || !s.supported || s.busy;
      view.own.hidden = !BL.net.state.me || own;
      $("studio-hat-signin").hidden = !BL.net.state.backend || !!BL.net.state.me;
      const minimum = BL.characterEquipment.minimumSize(cave, view.selection);
      view.status.textContent = s.error || (s.busy ? "Saving…"
        : !s.supported ? "Preview only here. Use the hosted studio while signed in to save your look."
        : !BL.net.state.me ? "Sign in to save a look for your Ooga." : !own ? "Preview any Ooga. Switch to your own to save a look." : view.dirty ? "Previewing. Save to wear this in the world." : "Your saved look follows you into the world.");
      if (supported(hatRow) && view.selection && view.selection.item !== "none" && minimum > 80) view.status.textContent += ` Minimum hat size for this Ooga: ${minimum}%.`;
      view.link.hidden = s.supported || document.documentElement.dataset.workerPage === "1";
      view.link.href = `https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev/?scene=studio&character=${encodeURIComponent(state.name)}`;
    };
    for (const row of rows) {
      row.select.addEventListener("change", () => {
        const entry = row.options[Number(row.select.value)];
        if (!entry) return;
        const picked = entry.pick();
        if (row === hatRow) {
          view.selection = picked;
          view.size = owns() && picked && picked.item !== "none" && hatKey(picked) === hatKey(equipment.state.record.selection) ? equipment.state.record.size : 100;
        } else {
          const base = savedIn(row), next = { ...(view.worn || null) };
          if (picked) next[row.slot.id] = row.slot.sized && picked.item !== "none" && base && pieceKey(base) === pieceKey(picked) && base.size ? { ...picked, size: base.size } : picked;
          else delete next[row.slot.id];
          view.worn = Object.keys(next).length ? next : null;
        }
        view.dirty = true; changed(); draw();
      }, { signal });
      if (!row.range) continue;
      const resize = (size) => {
        if (row.range.disabled || !Number.isInteger(size) || size < Number(row.range.min) || size > 120) return;
        if (row === hatRow) { if (size === view.size) return; view.size = size; }
        else {
          const worn = view.worn?.[row.slot.id];
          if (!worn || (worn.size || 100) === size) return;
          const next = { ...worn };
          if (size === 100) delete next.size; else next.size = size;
          view.worn = { ...view.worn, [row.slot.id]: next };
        }
        view.dirty = true; changed(); draw();
      };
      row.range.addEventListener("input", () => resize(Number(row.range.value)), { signal });
      row.reset.addEventListener("click", () => resize(100), { signal });
    }
    view.save.addEventListener("click", async () => {
      if (!owns()) return;
      const submitted = hatKey(view.selection) + W.key(view.worn), size = view.size;
      if (await equipment.save(view.selection, view.selection && view.selection.item !== "none" ? size : undefined, view.worn)
        && !signal.aborted && wardrobe === view && hatKey(view.selection) + W.key(view.worn) === submitted && view.size === size) { view.dirty = false; changed(); }
    }, { signal });
    view.own.addEventListener("click", () => { const own = BL.net.ownCharacter(); if (own) show(own.handle); }, { signal });
    // Reset leaves the previews and puts the saved look back on.
    view.discard.addEventListener("click", () => { if (!view.dirty) return; view.dirty = false; changed(); }, { signal });
    view.stop = equipment.subscribe(changed);
    changed();
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
    hatY: "Does nothing: it placed the loot crates' hats, which are gone", headgear: "Head details", hat: "A shareable hat", hatNodes: "Details on a shareable hat", extras: "Pieces of its own: a pet, a bag, a pack",
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
    if (!asked && BL.net.ownCharacter()) asked = BL.net.ownCharacter().handle;
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
    // The chair itself is a loose prop (buildProps), sat in only while it stands where it belongs.
    const chairRy = CHAIR.ry;
    // Its stand-up spot is clear of it for the roster's widest body.
    seat(CHAIR.x + Math.sin(chairRy) * 0.04, CHAIR.z + Math.cos(chairRy) * 0.04, CHAIR.top, chairRy, 1.1, false);
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
      // Rounds stop on a loose prop and knock it; blows knock what stands in front.
      clipProjectileTarget: (from, to) => { physics.shot(from, to); shotWater(from, to); return false; },
      onSwing: (who, charge) => { if (who === cave) physics.blow(who.root.position.x, who.root.position.y - who.baseY, who.root.position.z, who.bodyHeight, who.root.rotation.y, charge); },
      petLanding: (x, z, lying) => hammock.landing(x, z, lying) };
    crew = shared.crew = crewMod.create(shared);
    buildProps();
    footsteps = BL.footsteps.create();
    pilot.bind(shared);
    cave = crew.cavemen.get(entry.name);
    crew.configureWeapon(cave, 0, "unlimited");
    crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    Object.assign(hooks, {
      onHover: (hit, p) => { if (hit) hud.tooltip.show(tip(hit), p.x, p.y, hit.owner.cave); else hud.tooltip.hide(); },
      onHoverMove: (hit, p) => hud.tooltip.show(tip(hit), p.x, p.y, hit.owner.cave),
      onTap: (hit) => {
        if (hit && hit.owner.kind === "caveman") crew.pokeCave(hit.owner.cave);
        else if (hit && hit.owner.kind === "prop") physics.knock(hit.owner.body, camera.position.x, camera.position.z, hit.owner.piece === "die" ? 40 : 20);
      },
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
      else if (action === "studio-props") resetProps();
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
    startWardrobe(ctx.signal);
    if (broken) hud.hint(broken, 36e5);
    Object.assign(studioScene, { root, camera, input, debug: { camera, crew, fx, pilot, hud, controls: pilot.controls, cavemen: crew.cavemen, physics, studio: { place, toggle, speak, show, state, free, resetProps, get hammock() { return hammock; }, get bed() { return bed; }, get seats() { return seats; }, get cave() { return cave; } } } });
    pilot.update(0);
  };
  const drawExtra = () => {};
  // A hint, unless the foot of the screen is saying why the file could not be shown.
  const say = (text) => { if (!broken) hud.hint(text); };
  const tip = (hit) => hit.owner.kind === "caveman" ? `${hit.owner.cave.traits.display || hit.owner.cave.traits.name} · tap to poke`
    : hit.owner.kind === "prop" ? `${PROP_NAMES[hit.owner.piece]} · tap to knock` : "";

  const update = (dt, elapsed) => {
    // The director names the tab and the address as a visit arrives; the studio's own follow it, once.
    if (!titled) { titled = true; document.title = `Studio · ${state.name}`; address(); }
    pilot.readInput(dt);
    crew.update(dt, elapsed);
    updateProps(dt);
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
    if (wardrobe) { wardrobe.stop(); wardrobe.editors.replaceChildren(); wardrobe.slots.after(wardrobe.editors); wardrobe.slots.replaceChildren(); wardrobe = null; }
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
    physics.dispose();
    propX = propZ = NaN; chairBody = -1; wave = null; pondFeet = NaN;
    hammock.dispose();
    footsteps.dispose();
    crew.dispose();
    fx.dispose();
    pilot.dispose();
    for (const node of propTargets) input.remove(node);
    propTargets.length = 0;
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    hud = hooks = input = pilot = fx = crew = footsteps = cave = entry = hammock = bed = fire = embers = seats = blocks = buttons = physics = null;
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
