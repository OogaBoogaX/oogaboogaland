// HALLOWEEN: the ghost hunt on the island, OBL-Audio-lab's ghost invasion brought to the hub. A herald ghost drifts
// orange just off the ground round the pile; clicked, it cackles and shoots straight up out of sight, the land quakes
// as a black wall with a lit jack-o'-lantern rises across every open cave and bridge at once, and the island falls to
// a deep night. The Oogas nobody drives and the boxes and barrels are gone
// for the hunt, and every hunter's rifle never runs dry. Then six rounds of ghosts come over the outer bluff and float
// down after the players, the boss circles outside it spitting more, and when he burns (or every player is down)
// the dawn comes back, the walls sink away and everything returns.
//
// The hub loads this group after it is up (data-defer="halloween") and hands `create` one adapter (`ghostHub` in
// scene-hub.js); every hook the hub keeps for it is tagged HALLOWEEN, so the hunt comes out by deleting the group and
// those lines. The rules are ghost-sim.js; the room's host page runs them and sends the hunt to the others
// (ghost-sync.js); a page alone runs its own. Everything this file draws is pooled and built once a visit: the
// herald, MAX_GHOSTS ghosts, the boss, the walls, the drops, beams, soul streams and ice; `update` and `drawOverlay`
// allocate nothing past a cue's or a toast's string.
//
// While a hunt runs (`sealed`): every wall that has risen seals its cave or bridge one way (from the meadow in; anyone
// behind one walks out), NPCs keep out of the caves, jetpacks are grounded, the island's travel and cave doors are
// refused, the clock is held at night (`hour`), and the visitor's Ooga keeps the bar the ghosts take from: three
// segments, no healing between hits, down under a gravestone when it empties.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp, ease, fnv1a } = BL.math;
  const { createNode, addChild, removeChild } = BL.scene;
  const SIM = BL.ghostSim, ST = SIM.STATE, C = SIM.CONFIG, MODELS = BL.ghostModels, TIERS = MODELS.TIERS;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  // The rising (ms): the orange beam held on the herald, its vanishing straight up, when the walls start up together, how
  // long they grind up and how the land shakes meanwhile (`QUAKE` metres at its height), then a moment before the dusk's
  // countdown; how they sink at dawn.
  const HERALD_BEAM_MS = 1400, VANISH_MS = 900, RISE_AT = HERALD_BEAM_MS + 400, RISE_MS = 2200, SETTLE_MS = 700, QUAKE = 0.14, SINK_MS = 1200, SINK_STAGGER = 150;
  // The hunt's night: how deep it goes past the clock's own night (light and sky kept), and the boss's extra dark.
  const NIGHT_KEEP = 0.45, BOSS_KEEP = 0.7;
  // While a banner is up (a round coming, a round cleared, the boss, the end, a pause) the island goes darker still, to
  // `BANNER_KEEP` of the hunt's night, over `BANNER_IN_S`, and lifts again over `BANNER_OUT_S` for play.
  const BANNER_KEEP = 0.4, BANNER_IN_S = 0.6, BANNER_OUT_S = 0.9;
  const NIGHT_FADE_MS = 6000, NIGHT_HOUR = 23.25, COOLDOWN_MS = 30000, START_WAIT_MS = 4000, LOST_HOST_MS = 6000;
  const WALL_H = 3.3, MOUTH_W = 5.6, MOUTH_ALONG = 0.6;
  // Each bridge's wall stands up its steps where the rock rises well over head height at both sides, wide enough to bury
  // its ends in it, so there is no way round; `SINK` puts its foot a little into the tread it stands on.
  const BRIDGES = [
    { name: "bifrost", bearing: 0, r: 25.5, width: 7.6, height: 3.6, depth: 40 },
    { name: "mempool", bearing: BL.terrain.POOL_APPROACH.bearing, r: 22.5, width: 8.8, height: WALL_H, depth: 40 },
    { name: "timechain", bearing: BL.terrain.TIMECHAIN.bearing, r: 24.5, width: 8.8, height: WALL_H, depth: 40 }
  ];
  const SINK = 0.3;
  const MAX_BEAMS = 8, MAX_SOULS = 6, MAX_GRAVES = C.MAX_PLAYERS;
  const BOSS_Y = C.BOSS.y;
  // How tall each stands (m): a plain ghost, a general, a wraith; the boss and the herald.
  const HEIGHT = [1.3, 1.3 * C.BIG, 1.3 * C.BIG], BOSS_H = 5.2, HERALD_H = 1.7;
  const MAX_ORBS = 8 * 5, ORB_TURN_MS = 650, ORB_R = 0.42, ORB_Y = 0.55;
  // The herald's orange wisps, how many and their light.
  const HERALD_WISPS = 4, WISP = [255, 140, 30];
  // The herald's beam out of the sky when it is clicked: white-hot to orange.
  const HERALD_BEAM = { core: [255, 240, 205], mid: [255, 150, 40], edge: [255, 100, 10] };
  // A drop's light, the lab's (draw.js): its pulse, ring, beam and mist; a power-up's beam, flash, rings and sparks.
  const RING_MS = 1200, MIST_MS = 750, MISTS = 24, POWER_MS = 1300, POWER_LAND_MS = 220, POWERS = 2, BEAM_TOP = 30;
  const GREEN = { core: [230, 255, 235], mid: [60, 255, 110], edge: [40, 255, 90], ring: [90, 255, 130], spark: [120, 255, 150] };
  // A skeleton's beam: white.
  const WHITE = { core: [255, 255, 255], mid: [232, 238, 255], edge: [190, 205, 255] };
  const POWER_COLOURS = MODELS.DROPS.map((d, kind) => kind === 4 ? GREEN : { core: d.mist[0], mid: d.mist[1], edge: d.mist[2], ring: d.mist[1], spark: d.mist[1] });
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  const TIPS = ["Ghost · shoot it!", "Ghost general · beware its eye beam", "Wraith · it pulls at your soul"];
  const DROP_WORDS = ["Bomb! Every ghost burns", "Shield up for everyone", "Ice! The ghosts slow down", "Health banana! Everyone's bar is full", "Double points",
    "Tess joins you! She zaps any ghost that comes near", "Lightning Network! Bolts strike every enemy", "Monkeys! One at each side, shooting with you"];
  const DROP_CUES = ["boom", "shield", "ice", "health", "double", "tess", "thunder", "monkeys"];
  // The monkeys at a player's hips: how far out to each side (m), how high on the Ooga (a fraction of its height), how
  // tall they stand and how they bob; each shot of theirs, a rock from each aimed `MONKEY_AIM_SIDE` m to its own side
  // of theirs, in the air as long as a banana round is (`ROCK_FLIGHT_S`, the rifle's), a rifle round's damage
  // (`ROCK_DAMAGE`), as far as `ROCK_RANGE`.
  const MONKEY_OUT = 0.78, MONKEY_UP = 0.1, MONKEY_SIZE = 0.42, MONKEY_BOB = 0.04, MONKEY_AIM_SIDE = 1.2, ROCK_FLIGHT_S = 0.22, ROCK_DAMAGE = 2, ROCK_RANGE = 60;
  // The monkeys' shots: bursts of orange laser this long, each trailing a spark or two.
  const LASER_LEN = 1.1;
  const MAX_ROCKS = 16;
  // A player gone down: their grave rises out of the ground over `GRAVE_RISE_MS` (and sinks as quickly when they come
  // back), and this page's view pans round to stand `GRAVE_VIEW_BACK` m in front of its own, `GRAVE_VIEW_UP` m up.
  // Players glowing: everyone bright orange as a round starts and their health comes back, one purple as the monkeys
  // come down on them; how long each takes to fade, how big round the Ooga, and the colours.
  const HEAL_GLOW_MS = 1800, GIFT_GLOW_MS = 2600, GLOW_SIZE = 1.9, HEAL_GLOW = [255, 150, 40], GIFT_GLOW = [180, 100, 255];
  const GRAVE_RISE_MS = 700, GRAVE_VIEW_BACK = 3.4, GRAVE_VIEW_UP = 1.5, GRAVE_PAN = 2.4;
  // How fast a player who is down turns their view round their grave (radians a second at full tilt).
  const GRAVE_TURN = 1.8;
  // The elixirs' orange: their glow, the light round one taken and round a player brought back.
  const ELIXIR_GLOW = [255, 140, 30];
  // The lightning drop over the pile: how high over the pile's top it spins and how fast; each bolt it calls down, how
  // long it shows, how wide and tall; how far a struck enemy shakes.
  const BOLT_OVER = 1.5, BOLT_SPIN = 3, STRIKE_MS = 300, STRIKE_W = 4.5, STRIKE_H = 40, STRIKE_SHAKE = 0.12;
  // Tess at her player's side: how far out to their right (as the camera sees them) and up, how quickly she keeps up,
  // and how long her zap's beam shows.
  const TESS_SIDE = 0.9, TESS_UP = 1.9, TESS_FOLLOW = 7, ZAP_SHOW_S = 0.3;
  // The lab's debug keys, here with Shift held (the island's own keys take the bare ones): the drops, the next round,
  // a ghost, a general, a wraith, the boss, burn them all, thaw, ten kills.
  const DEBUG_KEYS = { Digit1: "drop", Digit2: "drop", Digit3: "drop", Digit4: "drop", Digit5: "drop", Digit6: "drop", Digit7: "drop", Digit8: "drop", KeyN: "next", KeyG: "ghost",
    KeyJ: "general", KeyX: "wraith", KeyY: "gorilla", KeyH: "skeleton", KeyE: "revive", KeyO: "boss", KeyB: "nuke", KeyU: "unfreeze", KeyK: "kills" };
  // The gorillas' arrival: a green beam from the sky (the double points' colours), the landing's flash and rings twice a
  // power-up's size, the land shaking under it for `LAND_SHAKE_S` at `LAND_SHAKE` of the quake; how much larger than the
  // island's gorillas it is, how tall it stands, and how far off its slam still shakes the view.
  const BRUTE_SCALE = 1.25, BRUTE_H = 1.5 * BRUTE_SCALE, BONES_H = 0.7, ARRIVAL = 2, ARRIVE_LAND_MS = 1100, SLAM_FELT = 14, LAND_SHAKE_S = 1, LAND_SHAKE = 0.6;
  // The skeleton's crawl (m, radians): its chest's pivot height and how far it leans up, the shoulders in the chest's
  // frame and how wide its arms splay, the upper arm and forearm-to-claw lengths; each hand's path in the body's frame
  // (from `front` to `back` planted at `plant` for `stance` of the cycle, then lifted `lift` forward again), how many
  // cycles a metre crawled, and where both hands lunge to strike.
  const CRAWL = { y: 0.36, pitch: 0.3, sx: 0.17, sy: -0.04, sz: 0.38, spread: 0.25, l1: 0.3, l2: 0.37,
    front: 0.85, back: 0.42, plant: 0.02, lift: 0.14, stance: 0.6, rate: 1.2, strikeY: 0.8, strikeZ: 1.0 };
  // Its lunge (ms, m, radians): how long, how far ahead and how high the body springs, how far the chest rears and
  // rises, its jaw's rest (open), widest and the point of the lunge (0..1) where it snaps shut.
  const LUNGE = { ms: 520, reach: 0.7, lift: 0.35, rear: 0.9, up: 0.12, open: 0.55, wide: 0.95, snap: 0.5 };
  // Lightning while the night is down: a strike every few seconds onto the bluff, its flash on the sky and its thunder.
  const STRIKE_GAP_MS = 5000, STRIKE_SPREAD_MS = 9000, BOLT_H = 46, BOLT_W = 9;
  const pg = (c, s, e = 1) => BL.models.particleGeometry(c, s, e);
  const ECTO = [pg("#7dffb0", 0.09), pg("#d8ffe8", 0.06)];
  const VAPOR = [pg("#78ff8c", 0.1), pg("#50dc6e", 0.08), pg("#3cc85a", 0.07)];
  const DIRT = [pg("#4a3a2a", 0.09, 0), pg("#2a2420", 0.08, 0), pg("#ff8a1f", 0.05)];
  const EMBERS = [pg("#ff9a2e", 0.06), pg("#ffcf6b", 0.05), pg("#ff6a10", 0.05)];
  const ZAPS = [pg("#ffffff", 0.06), pg("#9fd0ff", 0.05), pg("#4f9dff", 0.05)];
  const SPARKLE = [pg("#e2c8ff", 0.05), pg("#aa5aff", 0.05)];
  // A ghost bursting into pixels: its own colours, or the bomb's embers, a pumpkin's purple, a tagged ghost's pale blue.
  const PIXELS = {
    plain: [pg("#f4f7fb", 0.09), pg("#dfe5ef", 0.08), pg("#c3ccdb", 0.07), pg("#1a1c24", 0.07, 0)],
    general: [pg("#a9cbff", 0.1), pg("#6fa8ff", 0.09), pg("#3d7fe8", 0.08), pg("#e8f1ff", 0.07)],
    wraith: [pg("#2a2633", 0.1, 0.2), pg("#0b0a10", 0.09, 0), pg("#3a3548", 0.08, 0.2), pg("#eef2ff", 0.07)],
    burned: [pg("#ff8a1f", 0.09), pg("#ffd23f", 0.08), pg("#4a2a1a", 0.08, 0), pg("#f4f7fb", 0.07)],
    pumpkin: [pg("#b05cff", 0.1), pg("#ff8a1f", 0.09), pg("#f4f7fb", 0.07)],
    tagged: [pg("#cfe0ff", 0.09), pg("#96c8ff", 0.08), pg("#f4f7fb", 0.07)],
    zapped: [pg("#ffffff", 0.09), pg("#bfe0ff", 0.08), pg("#5aa8ff", 0.08), pg("#2a6cff", 0.07)],
    gorilla: [pg("#0f5a22", 0.12, 0.2), pg("#3dff66", 0.11), pg("#6dff8c", 0.1), pg("#093a15", 0.1, 0.1)],
    skeleton: [pg("#ece4cf", 0.09), pg("#b9ad90", 0.08), pg("#fff8e6", 0.07), pg("#ff3b2f", 0.06)],
    boss: [pg("#f4f7fb", 0.22), pg("#dfe5ef", 0.18), pg("#c3ccdb", 0.15), pg("#ff3b2f", 0.15)],
    herald: [pg("#ff9a2e", 0.1), pg("#ffcf6b", 0.09), pg("#ff6a10", 0.08)]
  };
  const SPARKS = POWER_COLOURS.map((c) => [pg(hex(c.spark), 0.06), pg(hex(c.core), 0.05)]);

  const create = (hub) => {
    const { root, renderer, fx, crew, island, npcSync } = hub;
    const net = BL.net, coarse = hub.coarse;
    const camera = hub.camera, guide = hub.guide;
    // `?skip=N` starts a hunt at round N, as the lab's did.
    const SKIP = Math.max(1, Math.min(SIM.ROUNDS.length, parseInt(hub.params.get("skip"), 10) || 1));
    MODELS.prepare();
    const group = createNode({ sightHidden: true });
    addChild(root, group);
    const audio = BL.ghostAudio.create(), hud = BL.ghostHud.create({ coarse: hub.coarse, onMusic: () => audio.toggleMusic(), onSkip: () => audio.skip(),
      onReady: () => readyUp(), onDecline: () => { declined = true; hud.lobby(null); }, onLobby: hub.lobbyOpen });
    // Every mesh the hunt has shown, kept on the GPU for the visit (`liveGeometry`): frames swap in and out.
    const used = [];
    const keep = (geometry) => {
      if (!geometry.ghostWorn) { geometry.ghostWorn = true; used.push(geometry); }
      return geometry;
    };
    const wear = (node, geometry) => {
      if (node.geometry !== geometry) node.geometry = keep(geometry);
    };
    // A sprite once its picture is ready; until then the node keeps what it showed.
    const show = (node, geometry) => { if (geometry) wear(node, geometry); };
    // Turns a sprite to the camera, upright.
    const billboard = (node) => { node.rotation.y = Math.atan2(camera.position.x - node.position.x, camera.position.z - node.position.z); };
    // A picture square to the view, tipping back as the view looks down so it shows from overhead too, its top toward
    // the top of the screen (the camera's `up` once the view looks straight down); it turns about its middle (`h` up from
    // its foot), so it stays where it stands.
    const face = (node, h) => {
      const p = node.position, fx = camera.target.x - camera.position.x, fy = camera.target.y - camera.position.y, fz = camera.target.z - camera.position.z;
      const across = Math.hypot(fx, fz), up = camera.up;
      node.rotation.y = across > 1e-4 * Math.abs(fy) || !up ? Math.atan2(-fx, -fz) : Math.atan2(-up.x, -up.z);
      const tip = -Math.atan2(-fy, across), s = Math.sin(tip), c = Math.cos(tip);
      node.rotation.x = tip;
      p.x -= h / 2 * Math.sin(node.rotation.y) * s; p.y += h / 2 * (1 - c); p.z -= h / 2 * Math.cos(node.rotation.y) * s;
    };
    const lieFlat = (node) => { node.rotation.x = -Math.PI / 2; node.rotation.y = 0; };
    // A velocity (vx, vz) as the camera sees it at (x, z): `sx` to the right, `sy` toward the camera.
    const SCREEN = { sx: 0, sy: 0 }, VIEW = [0, false, -1];
    const onScreen = (x, z, vx, vz) => {
      let dx = x - camera.position.x, dz = z - camera.position.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      SCREEN.sx = -vx * dz + vz * dx; SCREEN.sy = -(vx * dx + vz * dz);
      return SCREEN;
    };

    // ---------- the lap's stops, the walls and their seals ----------
    const stops = [];
    for (const m of hub.openMouths) {
      const nx = Math.sin(m.ry), nz = Math.cos(m.ry);
      stops.push({ name: m.id, bearing: (Math.atan2(m.x, -m.z) + TAU) % TAU, cx: m.x + nx * MOUTH_ALONG, cz: m.z + nz * MOUTH_ALONG, nx, nz,
        yaw: m.ry, width: MOUTH_W, height: WALL_H, base: m.floorY, depth: 9, mouth: m });
    }
    for (const b of BRIDGES) {
      const ux = Math.sin(b.bearing), uz = -Math.cos(b.bearing), cx = ux * b.r, cz = uz * b.r;
      stops.push({ name: b.name, bearing: b.bearing, cx, cz, nx: -ux, nz: -uz, yaw: Math.atan2(-ux, -uz), width: b.width, height: b.height + SINK,
        base: island.surfaceAt(cx, cz) - SINK, depth: b.depth, mouth: null });
    }
    stops.sort((a, b) => a.bearing - b.bearing);
    const walls = stops.map((s) => {
      const node = createNode({ geometry: keep(MODELS.wallGeometry(s.width, s.height)), position: { x: s.cx, y: s.base, z: s.cz }, rotation: { x: 0, y: s.yaw, z: 0 }, visible: false });
      addChild(group, node);
      const zone = s.mouth ? { active: false, x: s.mouth.x, z: s.mouth.z, floor: s.mouth.floorY, sr: s.nx, cr: s.nz, half: 2.73, front: MOUTH_ALONG + 0.26 } : null;
      // The zone joins the hub's closed caves only while its wall stands sealed (`drawWalls`), so a hunt merely loaded
      // changes nothing about where the island's NPCs may walk.
      return { stop: s, node, zone, up: 0, wisp: (fnv1a(s.name) % 100) / 100, sealed: false, half: s.width / 2 + C.PLAYER_RADIUS, y0: s.base - 1, y1: s.base + 6 };
    });
    // One way: a step from the meadow side of a raised wall to behind it, within its width, is refused at any height, and
    // so is a step into the ground behind it (its depth, its width, no higher than the wall, so a cave's roof stays free)
    // from anywhere outside that ground, so nobody slips round a wall's end between it and the rock. Anyone already
    // behind it may still walk out.
    let sealedCount = 0;
    const seal = (fromX, fromZ, toX, toZ, y) => {
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (!w.sealed || y < w.y0 || y > w.y1) continue;
        const s = w.stop, fx = fromX - s.cx, fz = fromZ - s.cz, tx = toX - s.cx, tz = toZ - s.cz;
        const a = fx * s.nx + fz * s.nz, b = tx * s.nx + tz * s.nz;
        if (y <= s.base + s.height && b <= 0 && b > -s.depth && Math.abs(tx * s.nz - tz * s.nx) < w.half
          && !(a <= 0 && a > -s.depth && Math.abs(fx * s.nz - fz * s.nx) < w.half)) return true;
        if (!(a > 0 && b <= 0)) continue;
        const k = a / (a - b), x = fx + (tx - fx) * k, z = fz + (tz - fz) * k;
        if (Math.abs(x * s.nz - z * s.nx) <= w.half) return true;
      }
      return false;
    };
    // Behind a wall (in its cave, on its bridge's stairs): no part of the hunt there.
    const sheltered = (x, z) => {
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i], s = w.stop, a = (x - s.cx) * s.nx + (z - s.cz) * s.nz;
        if (a < 0 && a > -s.depth && Math.abs((x - s.cx) * s.nz - (z - s.cz) * s.nx) < w.half + 0.5) return true;
      }
      return false;
    };

    // Every wall rises at once, RISE_AT after the click; the dusk starts with the click.
    const lapMs = RISE_AT + RISE_MS + SETTLE_MS, nightAt = 0;
    for (const s of stops) s.riseAt = RISE_AT;
    // The herald's idle drift: a slow wandering ring outside GAME MODE's wall (`HERALD_OUT` past it, give or take
    // `HERALD_SWAY`), just off the ground over the bluff, a function of the room's clock so every page has it in the
    // same place; a turn every two minutes or so.
    const HERALD_OUT = 2.5, HERALD_SWAY = 1, HERALD_TURN = 0.05;
    const HERALD_AT = { x: 0, y: 0, z: 0 };
    const idlePoint = (now) => {
      const T = now / 1000, a = T * HERALD_TURN, r = hub.ringRadius + HERALD_OUT + HERALD_SWAY * Math.sin(T * 0.37);
      HERALD_AT.x = Math.sin(a) * r; HERALD_AT.z = -Math.cos(a) * r;
      HERALD_AT.y = island.surfaceAt(HERALD_AT.x, HERALD_AT.z) + 0.22 + 0.06 * Math.sin(T * 1.7);
      return HERALD_AT;
    };

    // ---------- where ghosts come over the bluff ----------
    const away = [];
    for (const m of island.mouths) away.push((Math.atan2(m.x, -m.z) + TAU) % TAU, 9 * DEG);
    for (const b of BRIDGES) away.push(b.bearing, 11 * DEG);
    away.push(Math.PI, 8 * DEG);
    const spotList = [];
    for (let i = 0; i < 180; i++) {
      const a = i / 180 * TAU;
      let clear = true;
      for (let j = 0; j < away.length; j += 2) if (Math.abs(((a - away[j] + Math.PI * 3) % TAU) - Math.PI) < away[j + 1]) { clear = false; break; }
      if (!clear) continue;
      for (const r of [24.5, 26.5]) {
        const x = Math.sin(a) * r, z = -Math.cos(a) * r, y = island.surfaceAt(x, z);
        if (y >= 2.5 && spotList.length < 512) spotList.push(x, y + 1.2, z, a);
      }
    }
    const spots = Float64Array.from(spotList);
    // The banana pile, where the lightning drop hangs: reached within its platform and a step, as the platform grows.
    const PILE = { x: 0, z: 0, r: hub.pileRadius() + 0.9 };
    const sim = SIM.create({ seed: fnv1a("ooga ghosts"), spots, lapMs, pile: PILE, elixirs: hub.elixirSpots });
    const S = sim.state;

    // ---------- nodes ----------
    const pool = (n, geometry, extra) => Array.from({ length: n }, () => {
      const node = createNode({ visible: false, geometry, ...extra });
      addChild(group, node);
      return node;
    });
    const herald = createNode({ visible: true });
    addChild(group, herald);
    const owner = (role, slot) => ({
      kind: "halloween", role, slot, priority: role === "herald" ? 3 : 2, weaponType: role === "herald" ? "object" : "enemy", active: role === "herald",
      tooltip: () => role === "herald" ? S.state === ST.GATHER ? coarse ? "The restless ghost · tap it to ready up" : "The restless ghost · click it to ready up" : "A restless ghost · shoot it to start the ghost hunt"
        : role === "boss" ? "THE BOSS · shoot him down" : role === "brute" ? sim.brutes[slot].kind ? "Skeleton · it crawls after you" : "Gorilla · it leaps at you and slams the ground" : TIPS[sim.ghosts[slot].tier],
      // Clicking the herald only readies a player in its lobby; only a shot wakes it (`hit`).
      tap: () => { if (role === "herald" && S.state === ST.GATHER) tapHerald(); }
    });
    const heraldOwner = owner("herald", -1);
    hub.addTarget(herald, heraldOwner);
    const ghostNodes = [], ghostOwners = [];
    // Per slot: the id shown, its dying state, last hp, the flash's end, the sampled position and its velocity.
    const shown = new Float64Array(C.MAX_GHOSTS), dyingShown = new Float64Array(C.MAX_GHOSTS), hpShown = new Float64Array(C.MAX_GHOSTS);
    // `view` per slot: where it is drawn (x, y, z) and its sprite's foot with the bob (beams and bars start there).
    const flashUntil = new Float64Array(C.MAX_GHOSTS), sample = new Float64Array(C.MAX_GHOSTS * 7), view = new Float64Array(C.MAX_GHOSTS * 4);
    // Per slot, the drawing it shows (the lab's view and mirror, a general's sector) so it turns only when it moves.
    const viewShown = new Int8Array(C.MAX_GHOSTS), mirrorShown = new Uint8Array(C.MAX_GHOSTS), sectorShown = new Int8Array(C.MAX_GHOSTS).fill(-1);
    for (let i = 0; i < C.MAX_GHOSTS; i++) {
      const node = createNode({ visible: false });
      addChild(group, node);
      const o = owner("ghost", i);
      hub.addTarget(node, o);
      ghostNodes.push(node); ghostOwners.push(o);
    }
    const bossNode = createNode({ visible: false }), bossOwner = owner("boss", -1);
    addChild(group, bossNode);
    hub.addTarget(bossNode, bossOwner);
    // Each drop: the item, its aura, the halo and pulsing ring on the ground, the beam over it once landed, the streak
    // behind it while it falls, the scorch where it struck.
    const dropNodes = pool(C.MAX_DROPS, null), auras = pool(C.MAX_DROPS, null), halos = pool(C.MAX_DROPS, null), pulses = pool(C.MAX_DROPS, null);
    const dropBeams = pool(C.MAX_DROPS, null), streaks = pool(C.MAX_DROPS, null), scorches = pool(C.MAX_DROPS, null);
    // Each drop is called down by a thick beam of its own colour from the sky, as a gorilla is; and the shield is a
    // bubble round every player while it lasts.
    const dropColumns = pool(C.MAX_DROPS, null), bubbles = pool(C.MAX_PLAYERS, null);
    const dropShown = new Float64Array(C.MAX_DROPS), dropLanded = new Uint8Array(C.MAX_DROPS);
    // The mist bursting from a drop's foot as it strikes: puffs from a ring, each its start, place, heading and colour.
    const mists = pool(MISTS, null), mistAt = new Float64Array(MISTS).fill(-1e9), mistPlace = new Float64Array(MISTS * 6);
    let mistNext = 0;
    // A drop taken: its power-up on the one who took it, each its start, its taker and kind; a column, a flash, two rings.
    const powerColumns = pool(POWERS, null), powerFlashes = pool(POWERS, null), powerRings = pool(POWERS * 2, null);
    const powerAt = new Float64Array(POWERS).fill(-1e9), powerBy = new Float64Array(POWERS), powerKind = new Uint8Array(POWERS), powerSparked = new Uint8Array(POWERS);
    let powerNext = 0;
    const orbNodes = pool(MAX_ORBS, null);
    // The monkeys, two a player (left, right); the rocks they fire (from, to, and when, seconds on the page's clock);
    // where this page's own two stand (x, y, z each), to fire from.
    const monkeyNodes = pool(C.MAX_PLAYERS * 2, null);
    const rockNodes = pool(MAX_ROCKS, MODELS.laserBurst()), rockPath = new Float64Array(MAX_ROCKS * 6), rockAt = new Float64Array(MAX_ROCKS).fill(-1);
    const myMonkeys = new Float64Array(6);
    // Each player's glow (by their slot in the hunt), and when the monkeys last came to each.
    const playerGlows = pool(C.MAX_PLAYERS, null), giftAt = new Float64Array(C.MAX_PLAYERS).fill(-1e9);
    // Whether each player held monkeys last frame, so losing them to a hit can shriek.
    const monkeysHad = new Uint8Array(C.MAX_PLAYERS);
    let rockNext = 0, monkeysOn = false;
    // The graves: each player's gone down, the player it is for, where and which way it faces, when it rose and sank.
    const graveNodes = pool(MAX_GRAVES, MODELS.gravestone()), graveHeads = pool(MAX_GRAVES, null);
    const graveFor = new Float64Array(MAX_GRAVES), graveAt = new Float64Array(MAX_GRAVES * 3), graveRose = new Float64Array(MAX_GRAVES), graveSank = new Float64Array(MAX_GRAVES);
    // A copy of each character's head, made the first time one goes down (its parts' meshes, shared with the crew's).
    const heads = new Map();
    // The lightning drop's bolt, and the bolts it calls down: one a ghost, a gorilla and the boss.
    const STRIKES = C.MAX_GHOSTS + C.BRUTE.max + 1;
    const boltDrop = pool(1, MODELS.lightningBolt())[0], strikeNodes = pool(STRIKES, null), strikeGlows = pool(STRIKES, null);
    const strikeHeard = new Float64Array(STRIKES);
    const heraldWisps = pool(HERALD_WISPS, null), heraldBeam = pool(1, null)[0], heraldGlow = pool(1, null)[0];
    // The gorillas: the island's own gorilla rig in its glowing code green, one per slot, every part shootable; each
    // slot's arrival beam, ground glow, landing flash and two rings.
    const B = C.BRUTE, BP = SIM.BRUTE_PHASE;
    const rigs = [], bruteOwners = [];
    for (let i = 0; i < B.max; i++) {
      const rig = BL.agent.create({ managed: true, form: "code", groundAt: () => 0, scale: BRUTE_SCALE });
      rig.root.visible = false;
      rig.root.sightHidden = true;
      addChild(group, rig.root);
      const o = owner("brute", i);
      for (const name in rig.parts) { const part = rig.parts[name]; if (part && part.geometry) hub.addTarget(part, o); }
      rigs.push(rig); bruteOwners.push(o);
    }
    // The skeletons: a crawling upper body in each slot too (ghost-models.js `skeletonParts`), shown in place of the
    // gorilla when the slot's `kind` is 1, every bone shootable. The chest leans up from the hips, its tail dragging and
    // its arms pulling it along; `cycle` is the crawl's phase (0..1), the left arm half a cycle from the right.
    const skels = [];
    for (let i = 0; i < B.max; i++) {
      const P = MODELS.skeletonParts(), o = bruteOwners[i];
      const node = (geometry, x, y, z) => createNode({ geometry, position: { x, y, z } });
      const root = createNode({ visible: false, sightHidden: true });
      const torso = node(P.chest, 0, CRAWL.y, 0), tail = node(P.tail, 0, 0, -0.1), skull = node(P.skull, 0, 0.06, 0.5), jaw = node(P.jaw, 0, 0.03, 0);
      const shL = node(P.upper, CRAWL.sx, CRAWL.sy, CRAWL.sz), shR = node(P.upper, -CRAWL.sx, CRAWL.sy, CRAWL.sz);
      const foL = node(P.fore, 0, -CRAWL.l1, 0), foR = node(P.fore, 0, -CRAWL.l1, 0);
      addChild(skull, jaw);
      addChild(shL, foL);
      addChild(shR, foR);
      addChild(torso, tail, skull, shL, shR);
      addChild(root, torso);
      addChild(group, root);
      for (const n of [torso, tail, skull, jaw, shL, shR, foL, foR]) hub.addTarget(n, o);
      skels.push({ root, torso, tail, skull, jaw, shL, shR, foL, foR, cycle: 0 });
    }
    // The elixirs on the totems: each a sprite with its glow, and which were taken as last drawn.
    const elixirNodes = pool(C.ELIXIR.max, null), elixirGlows = pool(C.ELIXIR.max, null);
    let elixirsShown = 0, reviveShown = 0;
    // A player brought back glows the elixir's orange for REVIVE_GLOW_MS, as a drop does where it lies: an aura round
    // them and, on the ground at their feet, a pulsing glow with a ring rolling out of it.
    const reviveAura = pool(1, null)[0], reviveHalo = pool(1, null)[0], revivePulse = pool(1, null)[0];
    let reviveGlowFor = 0, reviveGlowAt = -1e9;
    const arriveBeams = pool(B.max, null), arriveGlows = pool(B.max, null), landFlashes = pool(B.max, null), landRings = pool(B.max * 2, null);
    const bruteShown = new Float64Array(B.max), brutePhase = new Int8Array(B.max), bruteLand = new Float64Array(B.max).fill(-1e9);
    const bruteSlam = new Float64Array(B.max), bruteX = new Float64Array(B.max), bruteZ = new Float64Array(B.max), bruteY = new Float64Array(B.max);
    const boltNode = pool(1, null)[0], boltGlow = pool(1, null)[0];
    const beams = pool(MAX_BEAMS, MODELS.beam()), souls = pool(MAX_SOULS, MODELS.soul(), { smokeOpacity: 0.85 });
    const ring = pool(1, MODELS.shockwave())[0], zapBeam = pool(1, MODELS.zap())[0];
    keep(MODELS.beam()); keep(MODELS.zap()); keep(MODELS.soul()); keep(MODELS.shockwave()); keep(MODELS.gravestone());
    keep(MODELS.orb(false)); keep(MODELS.orb(true)); keep(MODELS.rock()); keep(MODELS.laserBurst()); keep(MODELS.lightningBolt());

    // ---------- the hunt's place on this page ----------
    const sync = BL.ghostSync.create({
      npcSync,
      write: () => S.state !== ST.IDLE || clock() - idleAt < 3000 ? sim.snapshot() : null,
      onSnapshot: (snap) => {
        if (npcSync.role !== "follow" || !sim.load(snap)) return;
        heardAt = clock();
      },
      onMessage: (msg) => {
        if (msg.k === "pause") togglePause();
        else if (msg.k === "ready") sim.ready(msg.from);
        else if (msg.k === "start") {
          if (S.state === ST.IDLE && clock() - idleAt >= COOLDOWN_MS) sim.start(clock(), msg.from, SKIP);
          else if (S.state === ST.GATHER) sim.ready(msg.from);
        }
        else sim.hit(msg.g, msg.d, msg.from);
      }
    });
    let skew = 0, heardAt = 0, idleAt = -Infinity, startAskedAt = 0, prevState = ST.IDLE, lastRole = "";
    const clock = () => net.serverNow() + skew;
    // The hunt's own time: held where it stopped while paused (a follower's snapshots move its start on only 4 a second).
    const huntTime = () => S.paused ? S.now : clock() - S.epoch;
    const togglePause = () => { if (sim.pause(!S.paused, clock())) audio.play("thump"); };
    const myId = () => npcSync.role === "solo" ? 1 : net.state.selfId;

    // ---------- the island cleared for the hunt ----------
    // Every Ooga nobody drives goes away (as one a remote player drives does) and comes back where it was; the visitor's
    // own Ooga stays, and one picked during the hunt comes back for it (`release`).
    const overrides = new Map();
    const clearIsland = () => {
      const own = net.ownCharacter(), mine = own && crew.cavemen.get(own.handle);
      for (const cave of crew.list) {
        if (cave === crew.player || cave === mine || cave.remoteControlled || overrides.has(cave)) continue;
        if (cave.root.visible && cave.state !== "sleeping") { const p = cave.root.position; fx.burst(p.x, p.y + 0.8, p.z, 3, ECTO, 1.4); }
        overrides.set(cave, cave.override);
        cave.override = "away";
      }
      crew.refreshStates(false);
    };
    const restoreIsland = () => {
      if (!overrides.size) return;
      // An Ooga someone else took to drive meanwhile stays theirs: what it had before the hunt is what it goes back to
      // when they let go, not now.
      for (const [cave, was] of overrides) if (!(cave.remoteControlled && hub.remoteUnderlying(cave, was))) cave.override = was;
      overrides.clear();
      crew.refreshStates(true);
    };
    const release = (cave) => {
      if (!overrides.has(cave)) return;
      cave.override = overrides.get(cave);
      overrides.delete(cave);
      crew.refreshStates(true);
    };
    // Every hunter's rifle never runs dry; each one's own setting comes back with the dawn.
    const ammo = new Map();
    const armHunter = (cave) => {
      if (!cave || ammo.has(cave)) return;
      ammo.set(cave, cave.weapon.unlimited);
      cave.weapon.unlimited = true;
      if (cave === crew.player && !hub.gorillaActive()) hub.readyGun();
    };
    const disarmHunters = () => {
      for (const [cave, was] of ammo) cave.weapon.unlimited = was;
      ammo.clear();
    };

    // ---------- the herald, clicked ----------
    const pickOoga = () => {
      const own = net.ownCharacter(), mine = own && crew.cavemen.get(own.handle);
      if (mine && !hub.mayDriveOoga(mine) && !mine.remoteControlled) return mine;
      for (const cave of crew.list) {
        if (hub.mayDriveOoga(cave) || cave.remoteControlled || !cave.root.visible || crew.stateOf(cave) === "away") continue;
        if (cave.state === "working" || cave.state === "chilling") return cave;
      }
      return null;
    };
    // A hunter needs an Ooga: the visitor's own, or a free one; false (with a toast) when there is none to be had.
    const hunter = () => {
      if (hub.gorillaActive()) { hub.hud.toast("Ghost hunts are for Oogas · let go of the gorilla first"); return false; }
      if (crew.player) return true;
      const cave = pickOoga();
      if (!cave) { hub.hud.toast("Pick an Ooga Booga first, then wake the ghost"); return false; }
      return hub.selectOoga(cave);
    };
    // The lobby's Ready (the button, R, or the herald clicked again): this page's player is in.
    const readyUp = () => {
      if (S.state !== ST.GATHER || !hunter()) return;
      declined = false;
      audio.open();
      if (npcSync.role === "follow") sync.ready();
      else sim.ready(myId());
      // Take the aiming view inside the press; the rifle becomes available when the hunt enables combat.
      if (crew.player && !hub.gorillaActive()) hub.readyGun();
    };
    let declined = false;
    // ---------- the lobby and the waiting room ----------
    // The lobby's rows (one a player there, pooled) and the key its card was last drawn for.
    const LOBBY_ROWS = Array.from({ length: C.MAX_PLAYERS }, () => ({ id: 0, name: "", ready: false, host: false }));
    let lobbyShown = -1;
    const nameOf = (id) => {
      if (id === myId()) {
        const me = net.state.me;
        return me ? `${me.display || me.login} (you)` : "You";
      }
      const rec = net.remotes.get(id);
      return rec ? rec.display || rec.login || "A hunter" : "A hunter";
    };
    // While the lobby is open (and this visitor has not said "not this time"): who is there and who is ready, and the
    // seconds left; drawn again only when one of those changes.
    const drawLobby = (t) => {
      if (S.state !== ST.GATHER || declined) { lobbyShown = -1; hud.lobby(null); return; }
      const secs = Math.max(0, Math.ceil((S.endsAt - t) / 1000));
      let count = 0, readyBits = 0, ids = 0, meReady = false, hostReady = !S.startedBy;
      for (const q of sim.players) {
        if (!q.on || count >= LOBBY_ROWS.length) continue;
        LOBBY_ROWS[count].ready = !!q.ready; LOBBY_ROWS[count].id = q.id; LOBBY_ROWS[count].host = q.id === S.startedBy;
        if (q.id === S.startedBy && q.ready) hostReady = true;
        if (q.ready) readyBits += 1 << count;
        if (q.id === myId() && q.ready) meReady = true;
        ids += q.id * (count + 1);
        count++;
      }
      const signIn = !!net.state.backend && !net.state.me;
      // One number for all of it: seconds, how many, which (a sum of ids by place), who is ready, and the two flags.
      const key = secs * 1e14 + count * 1e12 + (ids % 10000) * 1e8 + readyBits * 8 + (hostReady ? 4 : 0) + (meReady ? 2 : 0) + (signIn ? 1 : 0);
      if (key === lobbyShown) return;
      lobbyShown = key;
      for (let i = 0; i < count; i++) LOBBY_ROWS[i].name = nameOf(LOBBY_ROWS[i].id);
      // Until the host is ready nothing starts: they are asked, and everyone else waits on them.
      const goal = !hostReady ? S.startedBy === myId() ? `Ready up to start the hunt · ${secs} s` : `Waiting for the host to ready up · ${secs} s`
        : `Gather by the banana pile and ready up · starts in ${secs} s`;
      hud.lobby(key, goal, LOBBY_ROWS, count, meReady, signIn);
    };
    // Waiting room: the walls are up and this visitor is not in the hunt (they did not ready, or came later). Their Ooga
    // is put away and they watch from the free camera until the hunt ends.
    const waiting = () => {
      if (S.state < ST.LAP || S.state > ST.DEFEAT) return false;
      const me = sim.playerById(myId());
      return !(me && me.inGame);
    };
    let spectating = false;
    const spectate = (on) => {
      if (on === spectating) return;
      spectating = on;
      if (on) {
        hub.spectate(true);
        const own = net.ownCharacter(), mine = own && crew.cavemen.get(own.handle);
        if (mine && !mine.remoteControlled && !overrides.has(mine)) { overrides.set(mine, mine.override); mine.override = "away"; crew.refreshStates(false); }
        hub.hud.toast("A hunt is on · you're in the waiting room until it ends");
      } else hub.spectate(false);
    };
    const tapHerald = () => {
      if (S.state === ST.GATHER) { readyUp(); return; }
      if (S.state !== ST.IDLE || !hunter()) return;
      audio.open();
      audio.play("ooga");
      if (npcSync.role === "follow") {
        sync.start();
        startAskedAt = clock();
        hub.hud.toast("The ghost stirs…");
      } else sim.start(clock(), myId(), SKIP);
    };

    // ---------- presence: who the ghosts can see ----------
    const PLAYER_AT = { x: 0, y: 0, z: 0 };
    // Where a hunting player stands now: this page's own Ooga live, another's as the room last had it.
    const playerAt = (id) => {
      const cave = crew.player;
      if (id === myId() && cave) {
        const p = cave.root.position;
        PLAYER_AT.x = p.x; PLAYER_AT.y = p.y - cave.baseY; PLAYER_AT.z = p.z;
        return PLAYER_AT;
      }
      const rec = net.remotes.get(id);
      if (rec) { PLAYER_AT.x = rec.x; PLAYER_AT.y = rec.y; PLAYER_AT.z = rec.z; return PLAYER_AT; }
      const p = sim.playerById(id);
      if (!p) return null;
      PLAYER_AT.x = p.x; PLAYER_AT.y = p.y; PLAYER_AT.z = p.z;
      return PLAYER_AT;
    };
    const inArena = (x, y, z) => y > -1.5 && Math.hypot(x, z) <= 30 && !sheltered(x, z);
    let localHere = false;
    const presentRemote = (rec) => {
      if (rec.bodyKind === "ooga" && rec.zone === "outside" && inArena(rec.x, rec.y, rec.z)) sim.present(rec.id, rec.x, rec.y, rec.z);
    };
    const gatherPlayers = () => {
      sim.beginPresence();
      const cave = crew.player;
      localHere = false;
      if (cave && !hub.gorillaActive()) {
        const p = cave.root.position, feet = p.y - cave.baseY;
        if (hub.zoneOf(cave) === "outside" && inArena(p.x, feet, p.z)) { sim.present(myId(), p.x, feet, p.z); localHere = true; }
      }
      if (npcSync.role === "host") net.remotes.forEach(presentRemote);
      // The debug stand-in (Shift+E) lies where it was laid until it is brought back (and a moment more), or the round ends.
      if (bot.on && (!(S.state === ST.ACTIVE || S.state === ST.BOSS) || bot.dropAt && huntTime() >= bot.dropAt)) { bot.on = false; sim.debug.dropBot(); }
      if (bot.on) sim.present(SIM.REVIVE_BOT, bot.x, bot.y, bot.z);
    };
    const bot = { on: false, x: 0, y: 0, z: 0, dropAt: 0, head: "" };

    // ---------- this page's own Ooga in the hunt ----------
    let segShown = -1, knockT = 0, knockX = 0, knockZ = 0, groundedToast = false;
    const followMe = (dt, t) => {
      const cave = crew.player, me = sim.playerById(myId());
      const hunting = S.state >= ST.COUNTDOWN && S.state <= ST.DEFEAT;
      if (!cave || !me || !hunting) { segShown = me ? me.seg : -1; return; }
      const health = cave.health;
      if (segShown >= 0 && me.seg < segShown) {
        crew.damage(cave, me.seg === 0 ? 25 : 25 / C.PLAYER_SEGMENTS * (segShown - me.seg), true);
        hud.flash("hurt");
        audio.play("hurt");
        const p = cave.root.position, dx = p.x - me.hitX, dz = p.z - me.hitZ, d = Math.hypot(dx, dz) || 1;
        knockT = 0.16; knockX = dx / d * 6; knockZ = dz / d * 6;
      } else if (segShown >= 0 && me.seg > segShown && !health.stunned) health.value = 100;
      segShown = me.seg;
      if (t < me.frozenUntil) {
        if (!health.stunned) crew.damage(cave, 25, false);
        health.value = 0;
      } else if (!health.stunned) health.delay = Math.max(health.delay, 0.5);
      if (knockT > 0) {
        knockT -= dt;
        hub.pull(cave, knockX * dt, knockZ * dt);
      }
    };

    // ---------- night ----------
    // Off: no hunt, or only its lobby. The walls, the night, the rocks and the closed island begin at LAP.
    const off = (st) => st === ST.IDLE || st === ST.GATHER;
    let nightK = 0, h0 = NaN, dim = 0;
    const nightOf = (t) => {
      const st = S.state;
      if (off(st)) return 0;
      // The night lifts over the whole dawn, which is quick after a defeat.
      if (st === ST.DAWN) return 1 - clamp((t - (S.endsAt - sim.dawnMs())) / sim.dawnMs(), 0, 1);
      return clamp((t - (S.lapAt + nightAt)) / NIGHT_FADE_MS, 0, 1);
    };
    const hour = (h) => {
      if (nightK <= 0) { h0 = NaN; return h; }
      if (Number.isNaN(h0)) h0 = h >= 20.5 || h < 4.5 ? -1 : h;
      if (h0 < 0) return h;
      if (S.state === ST.DAWN) {
        const d = ((h - NIGHT_HOUR + 36) % 24) - 12;
        return (NIGHT_HOUR + d * (1 - ease.inOutQuad(nightK)) + 24) % 24;
      }
      return (h0 + ((NIGHT_HOUR - h0 + 24) % 24) * ease.inOutQuad(nightK)) % 24;
    };
    // The hunt's night is darker than the clock's: light, sky and ground all held down, more so while the boss lives.
    const shade = (R) => {
      if (nightK <= 0 && dim <= 0 && hush <= 0 && flash <= 0 && strikeFlash <= 0) return;
      // A lightning flash lights the dark sky and ground for a moment.
      const k = (1 - (1 - NIGHT_KEEP) * ease.inOutQuad(nightK)) * (1 - (1 - BOSS_KEEP) * dim) * (1 - (1 - BANNER_KEEP) * ease.inOutQuad(hush))
        * (1 + 2.2 * Math.max(flash, strikeFlash));
      R.directStrength *= k;
      R.ambientFloor *= k;
      for (let i = 0; i < 3; i++) { R.sky[i] *= k; R.ground[i] *= k; R.clear[i] *= k; R.horizon[i] *= k; R.zenith[i] *= k; }
    };

    // ---------- HUD lines (rebuilt only when what they say changes) ----------
    let bannerKey = -1, bannerUp = false, hush = 0;
    const drawHud = (t) => {
      const st = S.state;
      hud.show(st !== ST.IDLE && st !== ST.GATHER);
      drawLobby(t);
      if (st === ST.IDLE) { bannerKey = -1; return; }
      const bossShow = st === ST.BOSS && S.bossOn;
      hud.boss(bossShow ? S.bossHp / Math.max(1, S.bossMax) : -1);
      const secs = st === ST.COUNTDOWN || st === ST.BREAK ? Math.max(0, Math.ceil((S.endsAt - t) / 1000)) : 0;
      const bossIntro = st === ST.BOSS && t - stateAt < 3500;
      const dawnWords = st === ST.DAWN && S.outcome === SIM.OUTCOME.ABANDON && t - stateAt < 4000;
      bannerUp = S.paused || st === ST.COUNTDOWN || st === ST.BREAK || bossIntro || st === ST.VICTORY || st === ST.DEFEAT || dawnWords;
      const bk = st * 1000 + secs * 10 + (bossIntro ? 1 : 0) + (dawnWords ? 2 : 0) + S.round * 1e5 + (S.paused ? 1e8 : 0);
      if (bk !== bannerKey) {
        bannerKey = bk;
        if (S.paused) hud.banner("Paused", "P to go on");
        else if (st === ST.COUNTDOWN) hud.banner(`Round ${S.round}`, secs >= 4 ? "get ready" : `${secs}`);
        else if (st === ST.BREAK) hud.banner(`Round ${S.round} cleared!`, `next round in ${secs}`);
        else if (bossIntro) hud.banner("THE BOSS is here", "he spits ghosts over the bluff");
        else if (st === ST.VICTORY) hud.banner("The island is safe!", `${S.kills} ghosts busted`);
        else if (st === ST.DEFEAT) hud.banner("The ghosts took the island", "every Ooga down");
        else if (dawnWords) hud.banner("The ghosts drift away", "nobody was left to haunt");
        else hud.banner(null);
      }
    };

    // ---------- cues from what changed ----------
    let stateAt = 0, pickShown = 0, bombShown = 0, spitShown = 0, ringT = -1, ringX = 0, ringZ = 0, cackled = false, bossShownHit = 0;
    const beamShown = new Float64Array(C.MAX_GHOSTS), soulShown = new Float64Array(C.MAX_GHOSTS);
    const onState = (st, prev, t) => {
      stateAt = t;
      // The hunt proper begins as the walls rise (straight from IDLE on a page that joins mid-hunt), not in its lobby.
      const wasOff = prev === ST.IDLE || prev === ST.GATHER;
      if (st === ST.GATHER) declined = false;
      if (wasOff && st !== ST.IDLE && st !== ST.GATHER) {
        guide.lend(driveTess);
        tessHolder = 0; tessGone = 0;
        clearIsland();
        // GAME MODE's ring round the meadow stands up once the walls have risen.
        hub.ringDelay((RISE_AT + RISE_MS) / 1000);
        hub.gameMode(true);
        cackled = beamed = rumbled = false;
        segShown = -1;
        // The hunt's playlist comes with the hunt, in a new random order (each track fetched as it comes up).
        audio.newPlaylist();
      }
      if (st === ST.DAWN) { restoreIsland(); hub.gameMode(false); disarmHunters(); audio.play("rumble", 1.6); }
      if (st === ST.COUNTDOWN) {
        audio.play("wave");
      }
      if (st === ST.BOSS) audio.play("scream", 1);
      if (st === ST.VICTORY) audio.play("health");
      if (st === ST.DEFEAT) audio.play("scream", 0.6);
      // A lobby that closed with nobody ready leaves the herald where it was, not resting.
      if (st === ST.IDLE) { idleAt = prev === ST.GATHER ? -Infinity : clock(); restoreIsland(); hub.gameMode(false); disarmHunters(); guide.lend(null); zapBeam.visible = false; }
    };
    const cueDrops = (t) => {
      for (let i = 0; i < C.MAX_DROPS; i++) {
        const d = sim.drops[i];
        if (d.on && d.id !== dropShown[i]) {
          dropShown[i] = d.id; dropLanded[i] = 0;
          if (d.kind === SIM.LIGHTNING_DROP) {
            dropLanded[i] = 1;
            audio.play("network");
            hub.hud.toast(coarse ? "Lightning Network over the banana pile · get to the pile!" : "Lightning Network over the banana pile · run to the pile!");
          } else audio.play("fall", C.FALL_MS / 1000);
        }
        if (d.on && !dropLanded[i] && t >= d.at + C.FALL_MS) {
          dropLanded[i] = 1;
          audio.play("thump");
          // Nine puffs of mist from round its foot, each a little apart.
          for (let k = 0; k < 9; k++) {
            const m = mistNext, a = d.id + k * 0.7, o = m * 6;
            mistNext = (mistNext + 1) % MISTS;
            mistAt[m] = d.at + C.FALL_MS;
            mistPlace[o] = d.x; mistPlace[o + 1] = d.z; mistPlace[o + 2] = Math.cos(a) * (0.4 + 0.6 * (k % 3) / 2); mistPlace[o + 3] = Math.sin(a) * (0.4 + 0.6 * (k % 3) / 2);
            mistPlace[o + 4] = d.kind; mistPlace[o + 5] = MODELS.DROPS[d.kind].h * 0.45;
          }
        }
        if (!d.on) dropShown[i] = 0;
      }
      if (S.pickAt && S.pickAt !== pickShown) {
        pickShown = S.pickAt;
        const p = powerNext;
        powerNext = (powerNext + 1) % POWERS;
        powerAt[p] = S.pickAt; powerBy[p] = S.pickBy; powerKind[p] = S.pickKind; powerSparked[p] = 0;
        if (S.pickKind === SIM.MONKEY_DROP) for (let i = 0; i < C.MAX_PLAYERS; i++) if (sim.players[i].on && sim.players[i].id === S.pickBy) giftAt[i] = S.pickAt;
        audio.play(DROP_CUES[S.pickKind]);
        hub.hud.toast(DROP_WORDS[S.pickKind]);
      }
      // A hit takes a player's monkeys away: the shriek. A slot reset (its `hitAt` back to 0) is no hit.
      for (let i = 0; i < C.MAX_PLAYERS; i++) {
        const q = sim.players[i], had = monkeysHad[i];
        monkeysHad[i] = q.on && q.monkeys ? 1 : 0;
        if (had && !monkeysHad[i] && q.on && q.hitAt) audio.play("shriek");
      }
      if (S.bombAt && S.bombAt !== bombShown) {
        bombShown = S.bombAt;
        const at = playerAt(S.pickBy);
        ringT = 0; ringX = at ? at.x : 0; ringZ = at ? at.z : 0;
      }
      if (S.spitAt && S.spitAt !== spitShown) {
        spitShown = S.spitAt;
        audio.play("launch");
        fx.burst(S.bossX, BOSS_Y + 4, S.bossZ, 6, VAPOR, 2.2);
      }
    };

    // ---------- drawing ----------
    // Bursts a ghost `height` tall standing at (x, y, z) into `count` pixels across its picture, flying out from its
    // middle and shrinking away (the particle pool's own fade).
    const explode = (x, y, z, height, set, count) => {
      const cx = camera.position.x - x, cz = camera.position.z - z, d = Math.hypot(cx, cz) || 1, rx = -cz / d, rz = cx / d;
      for (let k = 0; k < count; k++) {
        const u = Math.random() - 0.5, w = 0.1 + Math.random() * 0.85;
        const px = x + rx * u * height * 0.55, py = y + w * height, pz = z + rz * u * height * 0.55;
        const ox = px - x, oy = py - y - height * 0.5, oz = pz - z, len = Math.hypot(ox, oy, oz) || 1, speed = (2 + Math.random() * 2.6) * height / 1.3;
        fx.spawnParticle(set[k % set.length], px, py, pz, ox / len * speed + (Math.random() - 0.5), oy / len * speed + 1.4, oz / len * speed + (Math.random() - 0.5),
          0.5 + Math.random() * 0.45, 9, 2.6, -50);
      }
    };
    const deathFx = (g, x, y, z) => {
      const kind = g.dying, set = kind === SIM.DYING.ZAPPED ? PIXELS.zapped : kind === SIM.DYING.BURNED ? PIXELS.burned : kind === SIM.DYING.PUMPKIN ? PIXELS.pumpkin : kind === SIM.DYING.TAGGED ? PIXELS.tagged
        : g.tier === SIM.TIER.GENERAL ? PIXELS.general : g.tier === SIM.TIER.WRAITH ? PIXELS.wraith : PIXELS.plain;
      explode(x, y, z, HEIGHT[g.tier], set, g.tier === SIM.TIER.PLAIN ? 22 : 30);
    };
    const drawGhosts = (dt, t, now) => {
      const easeK = 1 - Math.exp(-14 * dt);
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const g = sim.ghosts[i], node = ghostNodes[i], o = ghostOwners[i], s = i * 7, v = i * 4;
        if (!g.on) {
          node.visible = false; o.active = false; shown[i] = 0;
          continue;
        }
        const height = HEIGHT[g.tier], big = g.tier !== SIM.TIER.PLAIN;
        if (g.id !== shown[i]) {
          shown[i] = g.id; dyingShown[i] = g.dying; hpShown[i] = g.hp; flashUntil[i] = 0;
          viewShown[i] = 0; mirrorShown[i] = 0; sectorShown[i] = -1;
          node.visible = false;
          sample[s] = g.x; sample[s + 1] = g.y; sample[s + 2] = g.z; sample[s + 3] = now; sample[s + 4] = sample[s + 5] = sample[s + 6] = 0;
          view[v] = g.x; view[v + 1] = g.y; view[v + 2] = g.z;
          view[v + 3] = g.y;
          if (t - g.spawnAt < C.DESCEND_MS) fx.burst(g.sx, g.sy, g.sz, 3, ECTO, 1.2);
        }
        // Sampled positions move in steps (a 20 Hz tick, a 4 Hz frame): carry them on by their own velocity a moment.
        if (g.x !== sample[s] || g.y !== sample[s + 1] || g.z !== sample[s + 2]) {
          const gap = Math.max(0.016, (now - sample[s + 3]) / 1000);
          sample[s + 4] = (g.x - sample[s]) / gap; sample[s + 5] = (g.y - sample[s + 1]) / gap; sample[s + 6] = (g.z - sample[s + 2]) / gap;
          sample[s] = g.x; sample[s + 1] = g.y; sample[s + 2] = g.z; sample[s + 3] = now;
        }
        const ahead = Math.min(0.3, (now - sample[s + 3]) / 1000), tx = sample[s] + sample[s + 4] * ahead, ty = sample[s + 1] + sample[s + 5] * ahead, tz = sample[s + 2] + sample[s + 6] * ahead;
        const far = Math.hypot(tx - view[v], tz - view[v + 2]) > 4;
        view[v] += (tx - view[v]) * (far ? 1 : easeK); view[v + 1] += (ty - view[v + 1]) * (far ? 1 : easeK); view[v + 2] += (tz - view[v + 2]) * (far ? 1 : easeK);
        // Which drawing, as the lab chose it: by how it moves across the camera's view, once it moves enough.
        if (Math.hypot(sample[s + 4], sample[s + 6]) > 0.17) {
          const sv = onScreen(view[v], view[v + 2], sample[s + 4], sample[s + 6]);
          MODELS.viewOf(big, sv.sx, sv.sy, sectorShown[i], VIEW);
          viewShown[i] = VIEW[0]; mirrorShown[i] = VIEW[1] ? 1 : 0; sectorShown[i] = VIEW[2];
        }
        if (g.hp < hpShown[i] && !g.dying) {
          if (t >= flashUntil[i]) audio.play("hit");
          flashUntil[i] = t + 80;
        }
        hpShown[i] = g.hp;
        // Dead, it bursts into pixels where it was drawn and is gone (the sim keeps it a moment for the other pages).
        if (g.dying) {
          if (!dyingShown[i] && node.visible) {
            deathFx(g, view[v], view[v + 3], view[v + 2]);
            if (g.dying === SIM.DYING.SHOT || g.dying === SIM.DYING.PUMPKIN) audio.play("hit");
          }
          dyingShown[i] = g.dying;
          node.visible = o.active = false;
          continue;
        }
        dyingShown[i] = 0;
        // It swells in as it comes over the crest; solid throughout, so its edge stays clean.
        const age = t - g.spawnAt, bob = Math.sin((now / 1000) * TAU * 0.6 + g.phase) * 0.065 * height;
        const grow = age < 600 ? 0.35 + 0.65 * ease.outBack(clamp(age / 600, 0, 1)) : 1;
        node.visible = o.active = true;
        // Struck by the lightning, it shakes and flickers white and blue until its zap is done.
        const zapped = g.struckAt > 0 && t >= g.struckAt, jx = zapped ? (Math.random() - 0.5) * 2 * STRIKE_SHAKE : 0, jz = zapped ? (Math.random() - 0.5) * 2 * STRIKE_SHAKE : 0;
        node.position.x = view[v] + jx; node.position.y = view[v + 1] + bob; node.position.z = view[v + 2] + jz;
        node.scale.x = node.scale.y = node.scale.z = height * grow;
        face(node, height * grow);
        const tier = g.tier === SIM.TIER.GENERAL ? TIERS.general : g.tier === SIM.TIER.WRAITH ? TIERS.wraith : TIERS.plain;
        const mode = zapped ? ((now / 55 | 0) % 2 ? MODELS.MODE.flash : MODELS.MODE.tagged)
          : t < flashUntil[i] ? MODELS.MODE.flash : t < S.slowUntil ? MODELS.MODE.iced : MODELS.MODE.normal;
        if (zapped && Math.random() < 0.3) fx.spawnParticle(ZAPS[Math.random() * 3 | 0], view[v] + (Math.random() - 0.5) * 0.6 * height, view[v + 1] + bob + Math.random() * height, view[v + 2] + (Math.random() - 0.5) * 0.6 * height,
          (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 4, 0, -50);
        show(node, MODELS.ghost(tier, viewShown[i], mirrorShown[i] === 1, mode));
        view[v + 3] = view[v + 1] + bob;
      }
    };
    // A general's or a wraith's five orbs, going round it (the first eight big ghosts).
    const drawOrbs = (now) => {
      let n = 0;
      for (let i = 0; i < C.MAX_GHOSTS && n + 5 <= MAX_ORBS; i++) {
        const g = sim.ghosts[i];
        if (!g.on || g.dying || g.tier === SIM.TIER.PLAIN || !ghostNodes[i].visible) continue;
        const v = i * 4, height = HEIGHT[g.tier], wraith = g.tier === SIM.TIER.WRAITH, turn = now / ORB_TURN_MS;
        for (let k = 0; k < 5; k++, n++) {
          const node = orbNodes[n], a = turn + k * TAU / 5;
          wear(node, MODELS.orb(wraith));
          node.visible = true;
          node.position.x = view[v] + Math.cos(a) * ORB_R * height;
          node.position.y = view[v + 3] + ORB_Y * height + Math.sin(a * 2) * 0.05 * height;
          node.position.z = view[v + 2] + Math.sin(a) * ORB_R * height;
          node.scale.x = node.scale.y = node.scale.z = height / 1.3;
        }
      }
      for (; n < MAX_ORBS; n++) orbNodes[n].visible = false;
    };
    let bossX = 0, bossZ = 0, bossView = 0, bossMirror = false;
    const drawBoss = (dt, t, now) => {
      const on = S.bossOn && (S.state === ST.BOSS || S.state === ST.VICTORY);
      // Beaten, he bursts into a storm of pixels at once.
      if (on && S.bossDyingAt && bossNode.visible) {
        explode(bossNode.position.x, bossNode.position.y, bossNode.position.z, BOSS_H, PIXELS.boss, 120);
        audio.play("scream", 1);
      }
      bossNode.visible = !!on && !S.bossDyingAt;
      bossOwner.active = bossNode.visible;
      if (!bossNode.visible) return;
      const k = 0;
      const bob = Math.sin(now / 1000 * TAU * 0.6) * 0.065 * BOSS_H * 3 / 4, size = BOSS_H;
      if (dt > 0 && Math.hypot(S.bossX - bossX, S.bossZ - bossZ) > 0.01) {
        const sv = onScreen(S.bossX, S.bossZ, (S.bossX - bossX) / dt, (S.bossZ - bossZ) / dt);
        MODELS.viewOf(false, sv.sx, sv.sy, -1, VIEW);
        bossView = VIEW[0]; bossMirror = VIEW[1];
      }
      bossX = S.bossX; bossZ = S.bossZ;
      const zapped = S.bossStruckAt > 0 && t >= S.bossStruckAt, shake = zapped ? STRIKE_SHAKE * 3 : 0;
      bossNode.position.x = S.bossX + (Math.random() - 0.5) * 2 * shake; bossNode.position.y = BOSS_Y + bob; bossNode.position.z = S.bossZ + (Math.random() - 0.5) * 2 * shake;
      bossNode.scale.x = bossNode.scale.y = bossNode.scale.z = Math.max(0.01, size);
      face(bossNode, Math.max(0.01, size));
      if (S.bossHitAt !== bossShownHit) { bossShownHit = S.bossHitAt; audio.play("hit"); }
      show(bossNode, MODELS.ghost(TIERS.boss, bossView, bossMirror, t - S.bossHitAt < 140 && !k ? MODELS.MODE.flash : MODELS.MODE.normal));
    };
    const sprite = (node, geometry, x, y, z, w, h, opacity, flat) => {
      show(node, geometry);
      node.visible = opacity > 0.01;
      if (!node.visible) return;
      node.position.x = x; node.position.y = y; node.position.z = z;
      if (flat) lieFlat(node); else { node.rotation.x = 0; billboard(node); }
      node.scale.x = w; node.scale.y = h; node.scale.z = 1;
      node.smokeOpacity = Math.min(1, opacity);
    };
    // The lab's drops: each comes down out of the sky, accelerating, a streak of air behind it; strikes, scorches the
    // ground and bursts mist; then glows where it lies (a halo, a ring swelling out, an aura and a beam of light), the
    // bomb and the banana floating up a little and breathing.
    // The lightning drop: a white bolt spinning over the top of the banana pile, held in a blue beam out of the sky until
    // someone reaches the pile.
    let boltOn = false;
    const drawBolt = (i, d, t, now) => {
      const spec = MODELS.DROPS[d.kind], mist = spec.mist, grow = clamp((t - d.at) / C.FALL_MS, 0, 1), pulse = 0.75 + 0.25 * Math.sin(now / 160);
      const y = hub.pileTop() + BOLT_OVER + 0.12 * Math.sin(now / 420), reach = Math.min(1, (t - d.at) / 250);
      dropNodes[i].visible = halos[i].visible = pulses[i].visible = dropBeams[i].visible = streaks[i].visible = scorches[i].visible = false;
      boltDrop.visible = grow > 0;
      boltDrop.position.x = d.x; boltDrop.position.y = y; boltDrop.position.z = d.z;
      boltDrop.rotation.y = now / 1000 * BOLT_SPIN;
      boltDrop.scale.x = boltDrop.scale.y = boltDrop.scale.z = spec.h * ease.outBack(grow);
      sprite(dropColumns[i], MODELS.beamOf(mist[1], mist[2], mist[2], false), d.x, y + BEAM_TOP * (1 - reach), d.z, 2.4, BEAM_TOP * reach, 0.6, false);
      sprite(auras[i], MODELS.glowDisc(mist[2]), d.x, y, d.z, 2.2, 2.2, 0.4 * pulse * grow, false);
      if (Math.random() < 0.25) fx.spawnParticle(ZAPS[Math.random() * 3 | 0], d.x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 1.1, d.z + (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.3, 4, 0, -50);
    };
    const drawDrops = (t, now) => {
      boltOn = false;
      for (let i = 0; i < C.MAX_DROPS; i++) {
        const d = sim.drops[i], node = dropNodes[i];
        if (!d.on) {
          node.visible = auras[i].visible = halos[i].visible = pulses[i].visible = dropBeams[i].visible = streaks[i].visible = scorches[i].visible = dropColumns[i].visible = false;
          continue;
        }
        const spec = MODELS.DROPS[d.kind], h = spec.h, r = h * 0.45, mist = spec.mist;
        if (spec.lightning) { drawBolt(i, d, t, now); boltOn = true; continue; }
        const ground = island.surfaceAt(d.x, d.z), ft = clamp((t - d.at) / C.FALL_MS, 0, 1), lift = 18 * (1 - ft * ft);
        const landed = ft >= 1, since = t - d.at - C.FALL_MS, pulse = 0.75 + 0.25 * Math.sin(now / 300 + d.id);
        let hover = 0;
        if (landed && spec.hover) {
          const u = clamp(since / 900, 0, 1);
          hover = u * u * (3 - 2 * u) * (0.6 + 0.2 * Math.sin(TAU * since / 2800 + d.id));
        }
        // Standing pictures dig their foot in a little once landed; floating ones do not.
        const foot = ground + lift + hover - (landed && !spec.hover ? 0.05 : 0), mid = foot + h * 0.5;
        if (spec.tess) node.visible = false;
        else { sprite(node, MODELS.drop(d.kind), d.x, foot, d.z, h, h, 1, false); face(node, h); }
        sprite(auras[i], MODELS.glowDisc(mist[1]), d.x, mid, d.z, h * 2.8, h * 2.8, 0.5 * pulse, false);
        sprite(halos[i], MODELS.glowDisc(mist[1]), d.x, ground + 0.03, d.z, r * 6.8, r * 6.8, 0.55 * pulse, true);
        const ring = (now / RING_MS + d.id * 0.37) % 1, ringR = r * (1.2 + 2.6 * ring);
        sprite(pulses[i], MODELS.ringOf(mist[1]), d.x, ground + 0.04, d.z, ringR * 2 / 0.9, ringR * 2 / 0.9, landed ? 0.7 * (1 - ring) : 0, true);
        sprite(dropBeams[i], MODELS.beamOf(mist[1], mist[1], mist[2], true), d.x, mid, d.z, r * 1.4 * 4, h * 5, landed ? 0.4 * pulse : 0, false);
        sprite(streaks[i], MODELS.beamOf(mist[0], mist[1], mist[2], true), d.x, foot + h, d.z, r * 4, h * 3, landed ? 0 : 0.5, false);
        sprite(scorches[i], MODELS.scorch(), d.x, ground + 0.02, d.z, r * 3, r * 3, landed ? 0.9 : 0, true);
        // The beam it comes down in: down from the sky in its first moment, held while it falls, gone soon after.
        const reach = Math.min(1, (t - d.at) / 250), column = landed ? Math.max(0, 1 - since / 600) : 1;
        sprite(dropColumns[i], MODELS.beamOf(mist[0], mist[1], mist[2], false), d.x, ground + BEAM_TOP * (1 - reach), d.z, 1.4 * 4, BEAM_TOP * reach, column, false);
      }
      for (let m = 0; m < MISTS; m++) {
        const k = (t - mistAt[m]) / MIST_MS, node = mists[m];
        if (k < 0 || k >= 1) { node.visible = false; continue; }
        const o = m * 6, r = mistPlace[o + 5], spread = r * (1 + 3.2 * k), x = mistPlace[o] + mistPlace[o + 2] * spread, z = mistPlace[o + 1] + mistPlace[o + 3] * spread;
        const size = r * 2 * (0.5 + 1.1 * k), y = island.surfaceAt(x, z) + 0.1 + r * 0.3 * k;
        sprite(node, MODELS.glowDisc(MODELS.DROPS[mistPlace[o + 4]].mist[0]), x, y + size / 2, z, size, size, 0.55 * (1 - k), false);
      }
    };
    // A drop taken: a beam of its colour slams down onto the one who took it, a flash at their feet, two rings roll out
    // along the ground and sparks spiral up off them (the lab's power-up).
    const drawPowers = (t) => {
      for (let p = 0; p < POWERS; p++) {
        const ms = t - powerAt[p], column = powerColumns[p], flash = powerFlashes[p], r0 = powerRings[p * 2], r1 = powerRings[p * 2 + 1];
        const at = ms >= 0 && ms < POWER_MS ? playerAt(powerBy[p]) : null;
        if (!at) { column.visible = flash.visible = r0.visible = r1.visible = false; continue; }
        const c = POWER_COLOURS[powerKind[p]], reach = Math.min(1, ms / POWER_LAND_MS);
        const fade = ms < POWER_LAND_MS ? 1 : Math.max(0, 1 - (ms - POWER_LAND_MS) / 700), body = 1.6;
        const width = body * (ms < POWER_LAND_MS ? 0.35 : 0.35 + 0.5 * (1 - fade)) * fade + 0.05;
        sprite(column, MODELS.beamOf(c.core, c.mid, c.edge, false), at.x, at.y + BEAM_TOP * (1 - reach), at.z, width * 4, BEAM_TOP * reach, fade, false);
        const lit = ms < POWER_LAND_MS ? reach : fade, glow = body * 2.6;
        sprite(flash, MODELS.glowDisc(c.core), at.x, at.y + body * 0.4, at.z, glow, glow, 0.9 * lit, false);
        for (let k = 0; k < 2; k++) {
          const u = (ms - POWER_LAND_MS - k * 120) / (k ? 800 : 650), node = k ? r1 : r0;
          const radius = body * (0.3 + 3.2 * (1 - (1 - u) * (1 - u)));
          sprite(node, MODELS.ringOf(c.ring), at.x, at.y + 0.05, at.z, radius * 2 / 0.9, radius * 2 / 0.9, u > 0 && u < 1 ? 0.9 * (1 - u) : 0, true);
        }
        if (!powerSparked[p] && ms >= POWER_LAND_MS) {
          powerSparked[p] = 1;
          for (let k = 0; k < 14; k++) {
            const a = k * 0.9, rad = body * (0.25 + 0.1 * (k % 5));
            fx.spawnParticle(SPARKS[powerKind[p]][k % 3 ? 0 : 1], at.x + Math.cos(a) * rad, at.y + 0.2 + (k % 5) * 0.1, at.z + Math.sin(a) * rad,
              -Math.sin(a) * 1.6, 1.4 + (k % 4) * 0.4, Math.cos(a) * 1.6, 1.0, 6, -1.6, -50);
          }
        }
      }
    };
    const aim = (node, x, y, z, tx, ty, tz, flicker) => {
      const dx = tx - x, dy = ty - y, dz = tz - z, len = Math.hypot(dx, dy, dz);
      node.visible = len > 0.1;
      node.position.x = x; node.position.y = y; node.position.z = z;
      node.rotation.y = Math.atan2(dx, dz);
      node.rotation.x = Math.atan2(-dy, Math.hypot(dx, dz));
      node.scale.x = node.scale.y = flicker;
      node.scale.z = len;
    };
    let soulOnMe = false;
    const drawBeams = (dt, t, now) => {
      let b = 0, w = 0;
      soulOnMe = false;
      const me = myId(), cave = crew.player;
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const g = sim.ghosts[i];
        if (!g.on || g.dying) { beamShown[i] = soulShown[i] = 0; continue; }
        const v = i * 4, height = HEIGHT[g.tier], ex = view[v], ey = view[v + 3] + 0.72 * height, ez = view[v + 2];
        if (g.beamTarget) {
          if (g.beamAt !== beamShown[i]) { beamShown[i] = g.beamAt; audio.play("laser", g.beamUntil - g.beamAt); }
          const at = playerAt(g.beamTarget);
          if (at && t >= g.beamAt + C.BEAM.windMs && t < g.beamUntil && b < MAX_BEAMS) aim(beams[b++], ex, ey, ez, at.x, at.y + 1.0, at.z, 1 + 0.3 * Math.sin(now * 0.04 + i));
        }
        if (g.soulTarget) {
          if (g.soulAt !== soulShown[i]) { soulShown[i] = g.soulAt; audio.play("screech"); }
          const at = playerAt(g.soulTarget);
          if (at && t < g.soulUntil && w < MAX_SOULS) aim(souls[w++], ex, ey - 0.15 * height, ez, at.x, at.y + 1.1, at.z, 1 + 0.4 * Math.sin(now * 0.02 + i));
          if (g.soulTarget === me && cave && t < g.soulUntil) {
            soulOnMe = true;
            const p = cave.root.position, dx = view[v] - p.x, dz = view[v + 2] - p.z, d = Math.hypot(dx, dz);
            if (d > 1.2 && !S.paused) hub.pull(cave, dx / d * 3.2 * dt, dz / d * 3.2 * dt);
          }
        }
      }
      for (; b < MAX_BEAMS; b++) beams[b].visible = false;
      for (; w < MAX_SOULS; w++) souls[w].visible = false;
      hud.soul(soulOnMe);
    };
    // The shield: a bubble round every player in the arena while it lasts, fading over its last second.
    const drawBubbles = (t, now) => {
      const left = S.shieldUntil - t, fade = Math.min(1, left / 1000), h = 2.1;
      let n = 0;
      if (left > 0) for (const p of sim.players) {
        if (!p.on || !p.here || n >= C.MAX_PLAYERS) continue;
        const at = playerAt(p.id);
        if (!at) continue;
        const wobble = 1 + 0.02 * Math.sin(now / 200 + n);
        sprite(bubbles[n++], MODELS.bubble(), at.x, at.y + h * 0.48, at.z, h * 1.24 * wobble, h * 1.28, fade, false);
      }
      for (; n < C.MAX_PLAYERS; n++) bubbles[n].visible = false;
    };
    const drawWalls = (dt, t, now) => {
      const st = S.state, quick = sim.dawnMs() < C.DAWN_MS, sinkMs = quick ? SINK_MS / 2 : SINK_MS, sinkGap = quick ? SINK_STAGGER / 2 : SINK_STAGGER;
      sealedCount = 0;
      for (let i = 0; i < walls.length; i++) {
        const w = walls[i], s = w.stop;
        let k = 0;
        if (st === ST.DAWN) k = 1 - clamp((t - (S.endsAt - sim.dawnMs()) - i * sinkGap) / sinkMs, 0, 1);
        else if (!off(st)) k = ease.inOutQuad(clamp((t - S.lapAt - s.riseAt) / RISE_MS, 0, 1));
        const rising = st !== ST.DAWN && k > 0 && k < 1;
        if (rising && w.up <= 0) fx.burst(s.cx, s.base + 0.3, s.cz, 6, DIRT, 2);
        // Earth and ecto spray off the foot of a wall still grinding up.
        if (rising && Math.random() < dt * 2.5) {
          const along = (Math.random() - 0.5) * s.width;
          fx.burst(s.cx + s.nz * along, s.base + 0.1, s.cz - s.nx * along, 2, DIRT, 1.8);
        }
        w.up = k;
        w.sealed = !off(st) && st !== ST.DAWN && k > 0;
        if (w.zone && w.zone.active !== w.sealed) {
          w.zone.active = w.sealed;
          const at = hub.closedZones.indexOf(w.zone);
          if (w.sealed && at < 0) hub.closedZones.push(w.zone);
          else if (!w.sealed && at >= 0) hub.closedZones.splice(at, 1);
        }
        if (w.sealed) sealedCount++;
        const node = w.node;
        node.visible = k > 0;
        if (!node.visible) continue;
        node.position.y = s.base - s.height * (1 - k) - 0.05 + (rising ? (Math.random() - 0.5) * 0.06 : 0);
        node.scale.x = 1 + 0.015 * Math.sin(now / 1000 * 2 + i);
        // An ember now and then, rising off the candle in the wall's jack-o'-lantern.
        w.wisp += dt * 1.2;
        if (w.wisp >= 1 && k >= 1) {
          w.wisp -= 1;
          const size = Math.min(0.62, s.height * 0.19, s.width * 0.14), out = 0.05 + size * 1.4;
          fx.spawnParticle(EMBERS[Math.random() * 3 | 0], s.cx + s.nx * out + (Math.random() - 0.5) * 0.3, s.base + s.height * 0.52 + size * 0.3, s.cz + s.nz * out + (Math.random() - 0.5) * 0.3,
            s.nx * 0.2, 0.6, s.nz * 0.2, 1.4, 2, -0.5, -50);
        }
      }
      hub.setSeal(sealedCount ? seal : null);
    };
    // How far up the herald has shot by the end of its vanishing (m).
    const LAUNCH_HEIGHT = 55;
    let heraldView = 0, heraldMirror = false, heraldX = 0, heraldZ = 0, beamed = false, rumbled = false;
    const drawHerald = (dt, t, now) => {
      const st = S.state, idle = st === ST.IDLE, since = t - S.lapAt;
      // The land quakes as the walls start up (joined during the rising, it still sounds; later they are simply up).
      if (st === ST.LAP && !rumbled && since >= RISE_AT) {
        rumbled = true;
        if (since < RISE_AT + RISE_MS) audio.play("rumble", (RISE_MS + 1000) / 1000);
      }
      const showIdle = idle && clock() - idleAt >= COOLDOWN_MS || st === ST.GATHER;
      // Clicked, an orange beam comes down out of the sky onto it; then it cackles and shoots straight up the beam out of
      // sight, sparks streaming behind it.
      const held = st === ST.LAP && since < HERALD_BEAM_MS;
      const vanishing = st === ST.LAP && since >= HERALD_BEAM_MS && since < HERALD_BEAM_MS + VANISH_MS;
      herald.visible = showIdle || held || vanishing;
      heraldOwner.active = showIdle;
      const at = idlePoint(held || vanishing ? S.epoch + S.lapAt : now), p = herald.position;
      const ground = held || vanishing ? island.surfaceAt(at.x, at.z) : 0;
      if (held && !beamed) { beamed = true; audio.play("arrive"); }
      const beamK = held ? 1 : vanishing ? Math.min(1, 2.5 * (1 - (since - HERALD_BEAM_MS) / VANISH_MS)) : 0, reach = held ? Math.min(1, since / 300) : 1;
      sprite(heraldBeam, MODELS.beamOf(HERALD_BEAM.core, HERALD_BEAM.mid, HERALD_BEAM.edge, false), at.x, ground + BEAM_TOP * (1 - reach), at.z, 1.4 * 3, BEAM_TOP * reach, beamK, false);
      sprite(heraldGlow, MODELS.glowDisc(HERALD_BEAM.mid), at.x, ground + 0.03, at.z, 3, 3, 0.7 * beamK * (0.8 + 0.2 * Math.sin(now / 90)), true);
      if (!herald.visible) { for (const n of heraldWisps) n.visible = false; return; }
      const size = HERALD_H;
      let rise = 0;
      if (held) {
        // In the beam: it trembles, and embers lift off it into the light.
        at.x += (Math.random() - 0.5) * 0.06; at.z += (Math.random() - 0.5) * 0.06;
        if (Math.random() < dt * 14) fx.spawnParticle(EMBERS[Math.random() * 3 | 0], at.x + (Math.random() - 0.5) * 0.8, at.y + Math.random() * size, at.z + (Math.random() - 0.5) * 0.8,
          0, 1.5 + Math.random() * 2, 0, 0.9, 3, 0.5, -50);
      } else if (vanishing) {
        const k = (since - HERALD_BEAM_MS) / VANISH_MS;
        if (!cackled) {
          cackled = true;
          audio.play("scream", 0.8);
          audio.play("launch");
          fx.sayAt(at.x, at.y + 3, at.z, "The night is ours…", 2.4);
          fx.burst(at.x, at.y + 0.3, at.z, 14, EMBERS, 3.2);
        }
        rise = LAUNCH_HEIGHT * k * k;
        for (let n = 0; n < 2; n++) fx.spawnParticle(EMBERS[Math.random() * 3 | 0], at.x + (Math.random() - 0.5) * 0.5, at.y + rise + Math.random() * 0.4, at.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.6, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.4, 5, 1, -50);
      } else {
        // It shows the drawing for how it drifts, as the ghosts do.
        if (dt > 0 && (at.x !== heraldX || at.z !== heraldZ)) {
          const sv = onScreen(at.x, at.z, (at.x - heraldX) / dt, (at.z - heraldZ) / dt);
          if (Math.hypot(sv.sx, sv.sy) > 0.17) { MODELS.viewOf(false, sv.sx, sv.sy, -1, VIEW); heraldView = VIEW[0]; heraldMirror = VIEW[1]; }
        }
        herald.rotation.z = 0;
        if (Math.random() < dt * 2.5) fx.spawnParticle(EMBERS[Math.random() * 3 | 0], at.x + (Math.random() - 0.5) * 0.6, at.y + 0.2, at.z + (Math.random() - 0.5) * 0.6, 0, 0.3, 0, 1.2, 1, -0.3, -50);
      }
      p.x = heraldX = at.x; p.y = at.y + rise; p.z = heraldZ = at.z;
      const foot = p.y;
      herald.scale.x = herald.scale.y = herald.scale.z = size;
      face(herald, size);
      show(herald, MODELS.ghost(TIERS.herald, heraldView, heraldMirror, MODELS.MODE.normal));
      // Its orange wisps go round it, rising and falling as they go, faster in the beam, each leaving a trail of embers.
      const turn = held || vanishing ? now / 260 : st === ST.GATHER ? now / 330 : now / ORB_TURN_MS;
      for (let k = 0; k < HERALD_WISPS; k++) {
        const a = turn + k * TAU / HERALD_WISPS, x = heraldX + Math.cos(a) * ORB_R * size * 1.15, z = heraldZ + Math.sin(a) * ORB_R * size * 1.15;
        const y = foot + (ORB_Y + 0.18 * Math.sin(a * 2 + k)) * size, glow = 0.8 + 0.2 * Math.sin(now / 130 + k * 2);
        sprite(heraldWisps[k], MODELS.glowDisc(WISP), x, y, z, 0.42 * glow, 0.42 * glow, 0.95, false);
        if (Math.random() < dt * 9) fx.spawnParticle(EMBERS[k % 3], x, y, z, 0, 0.15, 0, 0.6, 2, 0.2, -50);
      }
    };
    // The land shakes while the walls grind up (and a little as they sink at dawn): the camera is moved for the frame
    // (`shake`, after every view is set) and put back before the next one (`unshake`).
    const SHAKE = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
    let quake = 0;
    // A short jolt on top of the quake: a gorilla slamming someone down; and the seconds left of a gorilla's landing shake.
    let jolt = 0, landShake = 0;
    const quakeOf = (t) => {
      const st = S.state;
      if (st === ST.LAP) {
        const k = (t - S.lapAt - RISE_AT) / RISE_MS;
        return k <= 0 || k >= 1.15 ? 0 : Math.sin(Math.min(1, k / 0.15) * Math.PI / 2) * (k > 0.85 ? Math.max(0, (1.15 - k) / 0.3) : 1);
      }
      if (st === ST.DAWN) {
        const k = (t - (S.endsAt - sim.dawnMs())) / Math.min(sim.dawnMs(), SINK_MS + SINK_STAGGER * walls.length);
        return k <= 0 || k >= 1 ? 0 : 0.4 * Math.sin(k * Math.PI);
      }
      return 0;
    };
    const unshake = (camera) => {
      const p = camera.position, q = camera.target;
      p.x -= SHAKE.x; p.y -= SHAKE.y; p.z -= SHAKE.z;
      q.x -= SHAKE.tx; q.y -= SHAKE.ty; q.z -= SHAKE.tz;
      SHAKE.x = SHAKE.y = SHAKE.z = SHAKE.tx = SHAKE.ty = SHAKE.tz = 0;
    };
    const shake = (camera) => {
      if (quake <= 0) return;
      const a = QUAKE * quake, p = camera.position, q = camera.target;
      SHAKE.x = (Math.random() - 0.5) * 2 * a; SHAKE.y = (Math.random() - 0.5) * 2 * a; SHAKE.z = (Math.random() - 0.5) * 2 * a;
      SHAKE.tx = SHAKE.x * 0.4 + (Math.random() - 0.5) * a; SHAKE.ty = SHAKE.y * 0.4 + (Math.random() - 0.5) * a; SHAKE.tz = SHAKE.z * 0.4 + (Math.random() - 0.5) * a;
      p.x += SHAKE.x; p.y += SHAKE.y; p.z += SHAKE.z;
      q.x += SHAKE.tx; q.y += SHAKE.ty; q.z += SHAKE.tz;
    };
    // Tess, lent to the hunt (the hub's guide calls this in her place while it lasts): hidden until a drop brings her
    // down out of the sky, then at the side of whoever took her, zapping; sent away when a ghost gets them.
    const TESS_TO = { x: 0, y: 0, z: 0 };
    let tessHolder = 0, tessGone = 0, tessZap = 0, zapLeft = 0;
    const driveTess = (rig, dt) => {
      const t = huntTime(), now = clock(), p = rig.position, root = rig.root;
      let holder = null, drop = null;
      for (const q of sim.players) if (q.on && q.tess) { holder = q; break; }
      if (!holder) for (const d of sim.drops) if (d.on && d.kind === SIM.TESS_DROP) { drop = d; break; }
      if (holder && holder.id !== tessHolder) { rig.flare(); rig.nod(); rig.say("I've got your back! Ghosts, beware."); tessZap = holder.zapAt; }
      if (!holder && tessHolder) {
        rig.say("Eep! I'll be back.");
        tessGone = t;
        // Sent away by a ghost, she screams; let go as the hunt ends, she goes quietly.
        if (S.state >= ST.COUNTDOWN && S.state <= ST.BOSS) audio.play("tessGone");
      }
      tessHolder = holder ? holder.id : 0;
      let follow = TESS_FOLLOW;
      if (holder) {
        const at = playerAt(holder.id);
        if (at) {
          let dx = at.x - camera.position.x, dz = at.z - camera.position.z;
          const d = Math.hypot(dx, dz) || 1;
          dx /= d; dz /= d;
          TESS_TO.x = at.x - dz * TESS_SIDE; TESS_TO.z = at.z + dx * TESS_SIDE; TESS_TO.y = at.y + TESS_UP + 0.08 * Math.sin(now / 500);
        }
        rig.watching = !!at;
        if (at) { rig.watch.x = at.x; rig.watch.y = at.y + 1; rig.watch.z = at.z; }
      } else if (drop) {
        const ft = clamp((t - drop.at) / C.FALL_MS, 0, 1), ground = island.surfaceAt(drop.x, drop.z);
        TESS_TO.x = drop.x; TESS_TO.z = drop.z; TESS_TO.y = ground + 18 * (1 - ft * ft) + 0.7 + (ft >= 1 ? 0.12 * Math.sin(now / 500) : 0);
        // She comes down with the drop, from where it starts.
        if (!root.visible) { p.x = TESS_TO.x; p.y = TESS_TO.y; p.z = TESS_TO.z; }
        if (ft < 1) follow = 60;
        rig.watching = false;
      } else {
        // Nobody has her: she shoots off up into the night and waits out of sight.
        if (root.visible && t - tessGone < 1500) { TESS_TO.x = p.x; TESS_TO.z = p.z; TESS_TO.y = p.y + 12; follow = 3; }
        else { root.visible = false; zapBeam.visible = false; rig.mode = 0; return; }
        rig.watching = false;
      }
      root.visible = true;
      const k = 1 - Math.exp(-follow * dt), nx = p.x + (TESS_TO.x - p.x) * k, ny = p.y + (TESS_TO.y - p.y) * k, nz = p.z + (TESS_TO.z - p.z) * k;
      if (dt > 0) { rig.vel.x = (nx - p.x) / dt; rig.vel.y = (ny - p.y) / dt; rig.vel.z = (nz - p.z) / dt; }
      p.x = nx; p.y = ny; p.z = nz;
      // Her zap: the working beam onto the ghost she kills, our amber bolt with it, sparks and a crack.
      if (holder && holder.zapAt && holder.zapAt !== tessZap) {
        tessZap = holder.zapAt;
        zapLeft = ZAP_SHOW_S;
        rig.aim.x = holder.zapX; rig.aim.y = holder.zapY + 0.8; rig.aim.z = holder.zapZ;
        rig.flare();
        audio.play("zap");
        fx.burst(holder.zapX, holder.zapY + 0.8, holder.zapZ, 8, EMBERS, 3);
      }
      zapLeft = Math.max(0, zapLeft - dt);
      rig.mode = zapLeft > 0 ? 1 : 0;
      rig.steady = rig.calm = false;
      if (zapLeft > 0) aim(zapBeam, p.x, p.y, p.z, rig.aim.x, rig.aim.y, rig.aim.z, 1 + 0.3 * Math.sin(now * 0.05));
      else zapBeam.visible = false;
    };
    // ---------- the gorillas ----------
    const drawBrutes = (dt, t, now) => {
      const cave = crew.player;
      for (let i = 0; i < B.max; i++) {
        const b = sim.brutes[i], rig = rigs[i], o = bruteOwners[i], beam = arriveBeams[i], glow = arriveGlows[i], burst = landFlashes[i];
        if (!b.on) {
          rig.root.visible = skels[i].root.visible = o.active = false;
          beam.visible = glow.visible = burst.visible = landRings[i * 2].visible = landRings[i * 2 + 1].visible = false;
          bruteShown[i] = 0;
          continue;
        }
        if (b.id !== bruteShown[i]) {
          bruteShown[i] = b.id; brutePhase[i] = 0; bruteLand[i] = -1e9; bruteSlam[i] = b.slamAt;
          bruteX[i] = b.x; bruteZ[i] = b.z; bruteY[i] = b.y;
          if (b.phase === BP.BEAM) audio.play("arrive");
        }
        const ground = island.surfaceAt(b.x, b.z);
        // Dead, it bursts into green pixels (a skeleton into bone).
        if (b.dying) {
          const body = b.kind ? skels[i].root : rig.root;
          if (body.visible) { explode(body.position.x, body.position.y, body.position.z, b.kind ? BONES_H : BRUTE_H, b.kind ? PIXELS.skeleton : PIXELS.gorilla, 40); audio.play("hit"); }
          rig.root.visible = skels[i].root.visible = o.active = false;
          beam.visible = glow.visible = burst.visible = landRings[i * 2].visible = landRings[i * 2 + 1].visible = false;
          continue;
        }
        if (b.kind) { rig.root.visible = false; drawSkeleton(i, b, ground, dt, t, now); continue; }
        skels[i].root.visible = false;
        const since = t - b.phaseAt, pulse = 0.75 + 0.25 * Math.sin(now / 200);
        // The beam: down out of the sky to where it will land, held while it falls, gone soon after it lands.
        let column = 0, reach = 1;
        if (b.phase === BP.BEAM) { reach = Math.min(1, since / 300); column = 1; }
        else if (b.phase === BP.FALL) column = 1;
        else if (b.phase === BP.SHAKE) column = Math.max(0, 1 - since / 600);
        sprite(beam, MODELS.beamOf(GREEN.core, GREEN.mid, GREEN.edge, false), b.x, ground + BEAM_TOP * (1 - reach), b.z, 1.4 * 4, BEAM_TOP * reach, column, false);
        sprite(glow, MODELS.glowDisc(GREEN.mid), b.x, ground + 0.03, b.z, 3.5, 3.5, b.phase <= BP.FALL ? 0.6 * pulse : 0, true);
        // Dropping out of the beam it calls its "oogaa" on the way down.
        if (brutePhase[i] < BP.FALL && b.phase >= BP.FALL) audio.play("oogaa");
        // Landing: a double-points power-up twice the size, the land shaking under it.
        if (brutePhase[i] < BP.SHAKE && b.phase >= BP.SHAKE) {
          bruteLand[i] = t;
          audio.play("slam");
          landShake = LAND_SHAKE_S;
          rig.beat();
          for (let k = 0; k < 24; k++) {
            const a = k * 0.9, rad = 0.6 + 0.12 * (k % 5);
            fx.spawnParticle(SPARKS[4][k % 3 ? 0 : 1], b.x + Math.cos(a) * rad, ground + 0.2 + (k % 5) * 0.12, b.z + Math.sin(a) * rad, -Math.sin(a) * 2.4, 1.8 + (k % 4) * 0.5, Math.cos(a) * 2.4, 1.1, 6, -1.4, -50);
          }
          fx.burst(b.x, ground + 0.1, b.z, 10, DIRT, 3);
        }
        // Close enough, it springs: dust where it pushed off.
        if (brutePhase[i] !== BP.LEAP && b.phase === BP.LEAP) {
          audio.play("thump");
          fx.burst(b.fromX, ground + 0.1, b.fromZ, 8, DIRT, 2.5);
        }
        brutePhase[i] = b.phase;
        const ms = t - bruteLand[i];
        const lit = ms >= 0 && ms < ARRIVE_LAND_MS ? Math.max(0, 1 - ms / 700) : 0, size = 1.6 * 2.6 * ARRIVAL;
        sprite(burst, MODELS.glowDisc(GREEN.core), b.x, ground + 0.8, b.z, size, size, 0.9 * lit, false);
        for (let k = 0; k < 2; k++) {
          const u = (ms - k * 120) / (k ? 800 : 650), radius = 1.6 * ARRIVAL * (0.3 + 3.2 * (1 - (1 - u) * (1 - u)));
          sprite(landRings[i * 2 + k], MODELS.ringOf(GREEN.ring), b.x, ground + 0.05, b.z, radius * 2 / 0.9, radius * 2 / 0.9, u > 0 && u < 1 ? 0.9 * (1 - u) : 0, true);
        }
        // The gorilla: hidden while called down, falling, shaking where it landed, then on all fours after someone.
        const shown = b.phase >= BP.FALL;
        rig.root.visible = shown;
        o.active = shown;
        if (!shown) continue;
        const speed = dt > 0 ? Math.hypot(b.x - bruteX[i], b.z - bruteZ[i]) / dt : 0;
        bruteX[i] = b.x; bruteZ[i] = b.z;
        const zapped = b.struckAt > 0 && t >= b.struckAt, shake = zapped ? STRIKE_SHAKE * 2 : b.phase === BP.SHAKE ? 0.05 : 0;
        let heading = b.heading;
        const target = b.target ? playerAt(b.target) : null;
        if (target && b.phase === BP.RECOVER) heading = Math.atan2(target.x - b.x, target.z - b.z);
        // Falling it stands as high as the sim has it; leaping, it arcs over the ground; otherwise it is on it.
        const k = b.phase === BP.LEAP ? Math.min(1, since / B.leapMs) : 0;
        const lift = b.phase === BP.FALL ? Math.max(0, b.y) : B.leapH * 4 * k * (1 - k);
        rig.poseManaged(dt, b.x + (Math.random() - 0.5) * shake, ground + lift + (Math.random() - 0.5) * shake, b.z + (Math.random() - 0.5) * shake,
          heading, b.phase === BP.CHASE && !zapped ? Math.min(speed, 6) : 0, b.phase === BP.FALL || b.phase === BP.LEAP);
        if (zapped && Math.random() < 0.4) fx.spawnParticle(ZAPS[Math.random() * 3 | 0], b.x + (Math.random() - 0.5) * 1.2, ground + Math.random() * BRUTE_H * 1.3, b.z + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 4, 0, -50);
        // The slam: it lands with its fists into the ground beside them, the ground rings and shakes, and the dirt flies.
        if (b.slamAt && b.slamAt !== bruteSlam[i]) {
          bruteSlam[i] = b.slamAt;
          rig.pound(false, 1);
          audio.play("slam");
          audio.play("rumble", 0.9);
          fx.burst(b.x, ground + 0.1, b.z, 16, DIRT, 4);
          bruteLand[i] = t;
          if (cave) {
            const p = cave.root.position, felt = 1 - Math.hypot(p.x - b.x, p.z - b.z) / SLAM_FELT;
            if (felt > 0) jolt = Math.max(jolt, 0.4 + 0.6 * felt);
          }
        }
      }
    };

    // A skeleton: called down in a white beam, dropping with its arms flung up, landing in a puff of dust and crawling
    // on, its jaw hanging open; in reach it lunges up at its player, arms out, and its jaw snaps shut on the bite. Each arm reaches its hand (two-bone IK in the chest's frame) along a path
    // in the body's frame: planted and pulling back for `stance` of its cycle, lifted forward the rest.
    const reachArm = (sh, fo, side, ty, tz, pitch, chestY) => {
      const y = ty - chestY, c = Math.cos(pitch), s = Math.sin(pitch);
      const dy = y * c - tz * s - CRAWL.sy, dz = y * s + tz * c - CRAWL.sz, L1 = CRAWL.l1, L2 = CRAWL.l2;
      const d = clamp(Math.hypot(dy, dz), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
      const e = Math.acos((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2));
      sh.rotation.x = Math.atan2(-dz, -dy) - Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
      sh.rotation.z = side * CRAWL.spread;
      fo.rotation.x = e;
    };
    // Where a hand is `u` (0..1) through its cycle: HAND.y, HAND.z in the body's frame.
    const HAND = { y: 0, z: 0 };
    const handAt = (u) => {
      if (u < CRAWL.stance) { HAND.z = CRAWL.front + (CRAWL.back - CRAWL.front) * (u / CRAWL.stance); HAND.y = CRAWL.plant; }
      else { const k = (u - CRAWL.stance) / (1 - CRAWL.stance); HAND.z = CRAWL.back + (CRAWL.front - CRAWL.back) * k; HAND.y = CRAWL.plant + CRAWL.lift * Math.sin(Math.PI * k); }
      return HAND;
    };
    const drawSkeleton = (i, b, ground, dt, t, now) => {
      const k = skels[i], o = bruteOwners[i], since = t - b.phaseAt, pulse = 0.75 + 0.25 * Math.sin(now / 200);
      let column = 0, reach = 1;
      if (b.phase === BP.BEAM) { reach = Math.min(1, since / 300); column = 1; }
      else if (b.phase === BP.FALL) column = 1;
      else column = Math.max(0, 1 - (t - bruteLand[i]) / 600);
      sprite(arriveBeams[i], MODELS.beamOf(WHITE.core, WHITE.mid, WHITE.edge, false), b.x, ground + BEAM_TOP * (1 - reach), b.z, 1.4 * 3, BEAM_TOP * reach, column, false);
      sprite(arriveGlows[i], MODELS.glowDisc(WHITE.mid), b.x, ground + 0.03, b.z, 2.6, 2.6, b.phase <= BP.FALL ? 0.6 * pulse : 0, true);
      landFlashes[i].visible = landRings[i * 2].visible = landRings[i * 2 + 1].visible = false;
      if (brutePhase[i] <= BP.FALL && b.phase > BP.FALL) { bruteLand[i] = t; audio.play("thump"); fx.burst(b.x, ground + 0.1, b.z, 10, DIRT, 2.5); }
      brutePhase[i] = b.phase;
      const shown = b.phase >= BP.FALL;
      k.root.visible = o.active = shown;
      if (!shown) return;
      const speed = dt > 0 ? Math.hypot(b.x - bruteX[i], b.z - bruteZ[i]) / dt : 0;
      bruteX[i] = b.x; bruteZ[i] = b.z;
      if (b.slamAt && b.slamAt !== bruteSlam[i]) { bruteSlam[i] = b.slamAt; audio.play("bite"); }
      const zapped = b.struckAt > 0 && t >= b.struckAt, falling = b.phase === BP.FALL;
      const crawling = b.phase === BP.CHASE && !zapped ? Math.min(1, speed / 1.5) : 0;
      k.cycle = (k.cycle + Math.min(speed, 6) * dt * CRAWL.rate * (crawling > 0 ? 1 : 0)) % 1;
      // The lunge: up and forward over LUNGE.ms and back down (`strike` its arc, 0..1..0), the jaw wide on the way up and
      // snapping shut at the top.
      const since0 = b.slamAt ? t - b.slamAt : Infinity, lunging = since0 < LUNGE.ms, u = lunging ? since0 / LUNGE.ms : 1;
      const strike = lunging ? Math.sin(Math.PI * u) : 0, wave = Math.sin(k.cycle * Math.PI * 2);
      // The chest rears up to strike; it rolls and lurches a little with each pull, and breathes while it waits.
      const pitch = CRAWL.pitch + LUNGE.rear * strike, chestY = CRAWL.y + 0.025 * Math.abs(wave) * crawling + 0.012 * Math.sin(now / 420) * (1 - crawling) + LUNGE.up * strike;
      k.torso.position.y = chestY;
      k.torso.rotation.x = -pitch;
      k.torso.rotation.z = 0.07 * wave * crawling;
      k.tail.rotation.x = -0.35;
      k.tail.rotation.y = -0.3 * Math.sin(k.cycle * Math.PI * 2 + 0.7) * crawling;
      k.skull.rotation.x = pitch - 0.15;
      k.skull.rotation.y = zapped ? (Math.random() - 0.5) * 0.6 : 0.12 * wave * crawling;
      k.jaw.rotation.x = lunging ? (u < LUNGE.snap ? LUNGE.open + (LUNGE.wide - LUNGE.open) * u / LUNGE.snap : LUNGE.open * clamp((u - LUNGE.snap) / 0.3, 0, 1))
        : LUNGE.open + (zapped ? Math.random() * 0.4 : 0.1 * Math.max(0, Math.sin(now / 90)));
      if (falling) {
        // Flung up as it drops.
        k.shL.rotation.x = k.shR.rotation.x = -2.7; k.shL.rotation.z = CRAWL.spread; k.shR.rotation.z = -CRAWL.spread;
        k.foL.rotation.x = k.foR.rotation.x = 0.3;
      } else {
        const hl = handAt(k.cycle), ly = hl.y, lz = hl.z, hr = handAt((k.cycle + 0.5) % 1);
        reachArm(k.shL, k.foL, 1, ly + (CRAWL.strikeY - ly) * strike, lz + (CRAWL.strikeZ - lz) * strike, pitch, chestY);
        reachArm(k.shR, k.foR, -1, hr.y + (CRAWL.strikeY - hr.y) * strike, hr.z + (CRAWL.strikeZ - hr.z) * strike, pitch, chestY);
      }
      const jit = zapped ? STRIKE_SHAKE * 2 : 0, r = k.root;
      const ahead = LUNGE.reach * strike;
      r.position.x = b.x + Math.sin(b.heading) * ahead + (Math.random() - 0.5) * jit; r.position.z = b.z + Math.cos(b.heading) * ahead + (Math.random() - 0.5) * jit;
      r.position.y = ground + (falling ? Math.max(0, b.y) : LUNGE.lift * strike);
      r.rotation.y = b.heading;
      if (zapped && Math.random() < 0.4) fx.spawnParticle(ZAPS[Math.random() * 3 | 0], b.x + (Math.random() - 0.5) * 0.8, ground + Math.random() * BONES_H, b.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 4, 0, -50);
    };

    // ---------- the monkeys ----------
    // Where a player stands and faces, and how tall their Ooga is: this page's own as it stands, another's as the room
    // last had it (false when nowhere).
    const STANDS = { x: 0, y: 0, z: 0, yaw: 0, h: 1.5 };
    const standing = (id) => {
      const cave = crew.player;
      if (id === myId() && cave) {
        const p = cave.root.position;
        STANDS.x = p.x; STANDS.y = p.y - cave.baseY; STANDS.z = p.z; STANDS.yaw = cave.root.rotation.y; STANDS.h = cave.bodyHeight;
        return true;
      }
      // The debug stand-in (Shift+E) lies where it was laid.
      if (id === SIM.REVIVE_BOT && bot.on) {
        STANDS.x = bot.x; STANDS.y = bot.y; STANDS.z = bot.z; STANDS.yaw = 0; STANDS.h = 1.5;
        return true;
      }
      const rec = net.remotes.get(id), body = rec && crew.cavemen.get(rec.body);
      if (!rec) return false;
      STANDS.x = rec.x; STANDS.y = rec.y; STANDS.z = rec.z; STANDS.yaw = rec.yaw; STANDS.h = body ? body.bodyHeight : 1.5;
      return true;
    };
    // Each player glowing: orange as a round starts, purple as the monkeys come to them, fading out.
    const drawGlows = (t) => {
      for (let i = 0; i < C.MAX_PLAYERS; i++) {
        const q = sim.players[i], node = playerGlows[i];
        const heal = S.healAt ? clamp(1 - (t - S.healAt) / HEAL_GLOW_MS, 0, 1) : 0, gift = clamp(1 - (t - giftAt[i]) / GIFT_GLOW_MS, 0, 1);
        if (!q.on || heal <= 0 && gift <= 0 || down(q.id) || !standing(q.id)) { node.visible = false; continue; }
        const purple = gift > heal, k = purple ? gift : heal, size = GLOW_SIZE * STANDS.h, y = STANDS.y + STANDS.h * 0.5;
        sprite(node, MODELS.glowDisc(purple ? GIFT_GLOW : HEAL_GLOW), STANDS.x, y, STANDS.z, size, size, 0.95 * k, false);
        if (Math.random() < k * 0.5) fx.spawnParticle(purple ? SPARKLE[Math.random() * 2 | 0] : EMBERS[Math.random() * 3 | 0], STANDS.x + (Math.random() - 0.5) * 0.8,
          STANDS.y + Math.random() * STANDS.h, STANDS.z + (Math.random() - 0.5) * 0.8, 0, 0.8 + Math.random(), 0, 0.7, 3, 0.3, -50);
      }
    };
    // Each player's monkeys sit low at their sides, one each side (left of an Ooga facing +z is +x), bobbing, the lab's
    // drawing for the way the player faces as the camera sees it: the front coming, the back going, the
    // side across (its picture faces left; mirrored going right). This page's own are where its rocks leave from.
    const drawMonkeys = (now) => {
      let n = 0;
      monkeysOn = false;
      for (const q of sim.players) {
        if (!q.on || !q.monkeys || !(huntTime() >= q.frozenUntil) || n + 2 > monkeyNodes.length || !standing(q.id)) continue;
        const s = Math.sin(STANDS.yaw), c = Math.cos(STANDS.yaw), sv = onScreen(STANDS.x, STANDS.z, s, c);
        let view = 1, mirror = sv.sx > 0;
        if (Math.abs(sv.sy) > Math.abs(sv.sx)) { view = sv.sy > 0 ? 0 : 2; mirror = false; }
        const geometry = MODELS.monkey(view, mirror), mine = q.id === myId();
        for (let k = 0; k < 2; k++) {
          const side = k ? -1 : 1, node = monkeyNodes[n++], bob = Math.sin(now / 380 + q.id + k * 1.7) * MONKEY_BOB;
          const x = STANDS.x + side * MONKEY_OUT * c, y = STANDS.y + MONKEY_UP * STANDS.h + bob, z = STANDS.z - side * MONKEY_OUT * s;
          sprite(node, geometry, x, y, z, MONKEY_SIZE, MONKEY_SIZE, 1, false);
          face(node, MONKEY_SIZE);
          if (mine) { myMonkeys[k * 3] = x; myMonkeys[k * 3 + 1] = y + MONKEY_SIZE * 0.5; myMonkeys[k * 3 + 2] = z; }
        }
        if (mine) monkeysOn = true;
      }
      for (; n < monkeyNodes.length; n++) monkeyNodes[n].visible = false;
    };
    // The nearest ghost, gorilla or the boss along a rock's line, if any: its role, slot and where it is hit.
    const ROCK_HIT = { role: "", slot: -1, x: 0, y: 0, z: 0 };
    const rockHit = (x, y, z, dx, dy, dz) => {
      let best = ROCK_RANGE;
      ROCK_HIT.slot = -1;
      const test = (role, slot, cx, cy, cz, r) => {
        const ox = cx - x, oy = cy - y, oz = cz - z, along = ox * dx + oy * dy + oz * dz;
        if (along <= 0 || along >= best) return;
        const qx = ox - dx * along, qy = oy - dy * along, qz = oz - dz * along;
        if (qx * qx + qy * qy + qz * qz > r * r) return;
        best = along; ROCK_HIT.role = role; ROCK_HIT.slot = slot;
        ROCK_HIT.x = x + dx * along; ROCK_HIT.y = y + dy * along; ROCK_HIT.z = z + dz * along;
      };
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const g = sim.ghosts[i];
        if (!g.on || g.dying || !ghostNodes[i].visible) continue;
        const h = HEIGHT[g.tier];
        test("ghost", i, view[i * 4], view[i * 4 + 3] + h * 0.5, view[i * 4 + 2], h * 0.45);
      }
      for (let i = 0; i < B.max; i++) {
        const b = sim.brutes[i], r = b.kind ? skels[i].root : rigs[i].root, h = b.kind ? BONES_H : BRUTE_H;
        // A skeleton is long and low: its sphere sits a little ahead of its hips, round its chest and arms.
        const ahead = b.kind ? 0.25 : 0, x = r.position.x + Math.sin(b.heading) * ahead, z = r.position.z + Math.cos(b.heading) * ahead;
        if (b.on && !b.dying && r.visible) test("brute", i, x, r.position.y + h * 0.5, z, b.kind ? 0.6 : h * 0.55);
      }
      if (bossNode.visible) test("boss", -1, S.bossX, BOSS_Y + BOSS_H * 0.5, S.bossZ, BOSS_H * 0.4);
      return ROCK_HIT.slot >= 0 || ROCK_HIT.role === "boss" && best < ROCK_RANGE;
    };
    // This page's player fired from `from` toward `to`: each monkey fires a rock too, the left one toward a point to the
    // left of theirs and the right one to the right, and whatever each meets first takes a rifle round.
    const monkeyShot = (from, to) => {
      if (!monkeysOn || !(S.state === ST.ACTIVE || S.state === ST.BOSS)) return;
      let fx0 = to.x - from.x, fz0 = to.z - from.z;
      const flat = Math.hypot(fx0, fz0) || 1;
      fx0 /= flat; fz0 /= flat;
      for (let k = 0; k < 2; k++) {
        const side = k ? -1 : 1, ox = myMonkeys[k * 3], oy = myMonkeys[k * 3 + 1], oz = myMonkeys[k * 3 + 2];
        const ax = to.x + side * fz0 * MONKEY_AIM_SIDE, ay = to.y, az = to.z - side * fx0 * MONKEY_AIM_SIDE;
        let dx = ax - ox, dy = ay - oy, dz = az - oz;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len; dy /= len; dz /= len;
        ROCK_HIT.role = "";
        const struck = rockHit(ox, oy, oz, dx, dy, dz);
        const r = rockNext, o = r * 6;
        rockNext = (rockNext + 1) % MAX_ROCKS;
        rockPath[o] = ox; rockPath[o + 1] = oy; rockPath[o + 2] = oz;
        rockPath[o + 3] = struck ? ROCK_HIT.x : ax; rockPath[o + 4] = struck ? ROCK_HIT.y : ay; rockPath[o + 5] = struck ? ROCK_HIT.z : az;
        rockAt[r] = clock() / 1000;
        if (struck) hitAs(ROCK_HIT.role, ROCK_HIT.slot, ROCK_HIT.x, ROCK_HIT.y, ROCK_HIT.z, ROCK_DAMAGE);
      }
    };
    // The monkeys' laser bursts in the air, each along its line for as long as a banana round flies, sparks trailing.
    const drawRocks = () => {
      const s = clock() / 1000;
      for (let k = 0; k < MAX_ROCKS; k++) {
        const node = rockNodes[k], u = rockAt[k] < 0 ? 2 : (s - rockAt[k]) / ROCK_FLIGHT_S, o = k * 6;
        node.visible = u >= 0 && u <= 1;
        if (!node.visible) continue;
        const dx = rockPath[o + 3] - rockPath[o], dy = rockPath[o + 4] - rockPath[o + 1], dz = rockPath[o + 5] - rockPath[o + 2];
        node.position.x = rockPath[o] + dx * u;
        node.position.y = rockPath[o + 1] + dy * u;
        node.position.z = rockPath[o + 2] + dz * u;
        node.rotation.y = Math.atan2(dx, dz);
        node.rotation.x = Math.atan2(-dy, Math.hypot(dx, dz));
        node.scale.x = node.scale.y = 1; node.scale.z = LASER_LEN;
        if (Math.random() < 0.5) fx.spawnParticle(EMBERS[Math.random() * 3 | 0], node.position.x, node.position.y, node.position.z, 0, 0.2, 0, 0.25, 3, 0, -50);
      }
    };

    // ---------- graves ----------
    // A copy of a character's head as the crew built it (its own mesh and whatever it wears that shows), made once.
    const copyHead = (from) => {
      const node = createNode({ geometry: from.geometry, position: { x: 0, y: 0, z: 0 }, scale: { x: from.scale.x, y: from.scale.y, z: from.scale.z }, sightHidden: true });
      const add = (parent, src) => {
        for (const c of src.children || []) {
          if (!c.visible) continue;
          const copy = createNode({ geometry: c.geometry || null, position: { x: c.position.x, y: c.position.y, z: c.position.z },
            rotation: { x: c.rotation.x, y: c.rotation.y, z: c.rotation.z }, scale: { x: c.scale.x, y: c.scale.y, z: c.scale.z } });
          addChild(parent, copy);
          add(copy, c);
        }
      };
      add(node, from);
      return node;
    };
    const headOf = (id) => {
      const name = id === myId() && crew.player ? crew.player.traits.name : id === SIM.REVIVE_BOT ? bot.head : net.remotes.get(id)?.body;
      const cave = name && crew.cavemen.get(name);
      if (!cave || !cave.parts.head) return null;
      let head = heads.get(name);
      if (!head) heads.set(name, head = copyHead(cave.parts.head));
      return head;
    };
    // Whether player `id` is down (their grave stands): the hub hides another's body while it is, as this page does
    // its own.
    const down = (id) => {
      const p = sim.playerById(id);
      return !!p && S.state >= ST.COUNTDOWN && S.state <= ST.DEFEAT && huntTime() < p.frozenUntil;
    };
    let viewHeld = false, hidMine = null, downYaw = 0;
    // Gives the view and this page's Ooga back (a hunt ending, the island left).
    const letGo = () => {
      spectating = false;
      if (viewHeld) { viewHeld = false; hub.holdView(false); }
      if (hidMine) { hidMine.root.visible = true; hidMine = null; }
      downYaw = 0;
    };
    const drawGraves = (dt, t) => {
      for (let i = 0; i < MAX_GRAVES; i++) {
        const q = sim.players[i], grave = graveNodes[i], holder = graveHeads[i];
        const isDown = q.on && down(q.id);
        if (isDown && graveFor[i] !== q.id) {
          // Gone down: the grave rises where they fell, facing the island's middle, their head set on its top.
          if (!standing(q.id)) continue;
          graveFor[i] = q.id; graveRose[i] = t; graveSank[i] = 0;
          const o = i * 3, yaw = Math.hypot(STANDS.x, STANDS.z) > 0.5 ? Math.atan2(-STANDS.x, -STANDS.z) : 0;
          graveAt[o] = STANDS.x; graveAt[o + 1] = island.surfaceAt(STANDS.x, STANDS.z); graveAt[o + 2] = STANDS.z;
          grave.rotation.y = yaw;
          for (const c of holder.children.slice()) removeChild(holder, c);
          const head = headOf(q.id);
          if (head) { if (head.parent) removeChild(head.parent, head); addChild(holder, head); }
          audio.play("thump"); audio.play("rumble", 0.8); audio.play("down");
          fx.burst(STANDS.x, graveAt[o + 1] + 0.2, STANDS.z, 14, DIRT, 2.4);
        }
        if (!isDown && graveFor[i] && !graveSank[i]) graveSank[i] = t;
        if (!graveFor[i]) { grave.visible = holder.visible = false; continue; }
        const o = i * 3, rise = clamp((t - graveRose[i]) / GRAVE_RISE_MS, 0, 1), sink = graveSank[i] ? clamp((t - graveSank[i]) / GRAVE_RISE_MS, 0, 1) : 0;
        if (sink >= 1 || !q.on) { graveFor[i] = 0; grave.visible = holder.visible = false; continue; }
        const up = ease.outBack(rise) * (1 - ease.inOutQuad(sink)), y = graveAt[o + 1] - MODELS.GRAVE_TOP * (1 - up);
        grave.visible = holder.visible = true;
        grave.position.x = graveAt[o]; grave.position.y = y; grave.position.z = graveAt[o + 2];
        holder.position.x = graveAt[o]; holder.position.y = y + MODELS.GRAVE_TOP - 0.06; holder.position.z = graveAt[o + 2];
        holder.rotation.y = grave.rotation.y;
      }
      // This page's own: its Ooga gone from sight, and the view turned to stand before its grave until it is back.
      const me = sim.playerById(myId()), cave = crew.player, mine = me && cave && down(me.id);
      if (mine) { cave.root.visible = false; hidMine = cave; }
      else if (hidMine) { hidMine.root.visible = true; hidMine = null; }
      let slot = -1;
      if (mine) for (let i = 0; i < MAX_GRAVES; i++) if (graveFor[i] === me.id) slot = i;
      if (slot >= 0 && !viewHeld) { viewHeld = true; downYaw = 0; hub.holdView(true); }
      else if (slot < 0 && viewHeld) { viewHeld = false; hub.holdView(false); }
      if (slot >= 0) {
        // Down while others play on: the view stands before the grave, and the turn keys (or a stick) swing it round
        // the grave to watch the hunt on every side.
        downYaw += hub.heldTurn() * GRAVE_TURN * dt;
        const o = slot * 3, yaw = graveNodes[slot].rotation.y + downYaw, k = 1 - Math.exp(-GRAVE_PAN * dt);
        const ex = graveAt[o] + Math.sin(yaw) * GRAVE_VIEW_BACK, ey = graveAt[o + 1] + GRAVE_VIEW_UP, ez = graveAt[o + 2] + Math.cos(yaw) * GRAVE_VIEW_BACK;
        const p = camera.position, tg = camera.target;
        p.x += (ex - p.x) * k; p.y += (ey - p.y) * k; p.z += (ez - p.z) * k;
        tg.x += (graveAt[o] - tg.x) * k; tg.y += (graveAt[o + 1] + MODELS.GRAVE_TOP * 0.8 - tg.y) * k; tg.z += (graveAt[o + 2] - tg.z) * k;
      }
    };

    // ---------- the elixirs ----------
    // Each untaken one glows on its totem's front while a round is fought, bobbing; one taken bursts into embers where
    // it hung, and a player brought back stands up in a burst of its light.
    const drawElixirs = (now) => {
      const on = S.state === ST.ACTIVE || S.state === ST.BOSS, spots = hub.elixirSpots, gone = S.elixirsTaken & ~elixirsShown;
      for (let i = 0; i < elixirNodes.length; i++) {
        const at = spots[i];
        if (gone & (1 << i) && at) { fx.burst(at.x, at.y, at.z, 16, EMBERS, 2.2); audio.play("elixir"); }
        if (!on || !at || S.elixirsTaken & (1 << i)) { elixirNodes[i].visible = elixirGlows[i].visible = false; continue; }
        const bob = Math.sin(now / 520 + i * 1.9) * 0.06, pulse = 0.75 + 0.25 * Math.sin(now / 260 + i);
        sprite(elixirGlows[i], MODELS.glowDisc(ELIXIR_GLOW), at.x, at.y + bob - 0.45, at.z, 1.1 * pulse, 1.1 * pulse, 0.55 * pulse, false);
        sprite(elixirNodes[i], MODELS.elixir(), at.x, at.y + bob - 0.25, at.z, 0.5, 0.5, 1, false);
      }
      elixirsShown = S.elixirsTaken;
      if (S.reviveAt && S.reviveAt !== reviveShown) {
        reviveShown = S.reviveAt;
        const at = playerAt(S.reviveOf);
        audio.play("revived");
        reviveGlowFor = S.reviveOf; reviveGlowAt = now;
        if (S.reviveOf === SIM.REVIVE_BOT) bot.dropAt = huntTime() + REVIVE_GLOW_MS;
        if (at) fx.sayAt(at.x, at.y + 2.2, at.z, "I'm back!", 2);
      }
      drawReviveGlow(now);
    };
    const REVIVE_GLOW_MS = 3000;
    const drawReviveGlow = (now) => {
      const k = clamp(1 - (now - reviveGlowAt) / REVIVE_GLOW_MS, 0, 1);
      if (k <= 0 || !standing(reviveGlowFor)) { reviveAura.visible = reviveHalo.visible = revivePulse.visible = false; return; }
      // Full for its first two thirds, fading over the last.
      const fade = Math.min(1, k * 3), pulse = 0.75 + 0.25 * Math.sin(now / 160), size = GLOW_SIZE * STANDS.h * 1.15 * pulse;
      const ring = (now / RING_MS) % 1, ringR = 0.5 * (1.2 + 2.6 * ring), ground = STANDS.y;
      sprite(reviveAura, MODELS.glowDisc(ELIXIR_GLOW), STANDS.x, ground + STANDS.h * 0.5, STANDS.z, size, size, 0.95 * fade, false);
      sprite(reviveHalo, MODELS.glowDisc(ELIXIR_GLOW), STANDS.x, ground + 0.03, STANDS.z, 3.4 * pulse, 3.4 * pulse, 0.6 * fade, true);
      sprite(revivePulse, MODELS.ringOf(ELIXIR_GLOW), STANDS.x, ground + 0.04, STANDS.z, ringR * 2 / 0.9, ringR * 2 / 0.9, 0.75 * (1 - ring) * fade, true);
    };

    // ---------- the minimap ----------
    // An FPS radar, bottom left, turning with the view so where the camera looks is always up, centred on the visitor's
    // Ooga (the camera's target when there is none, or under a grave): the island from above (painted once from the
    // terrain), the game's wall, the pile, the untaken elixirs, a cone for the field of view, the other players (blue;
    // grey while down), the ghosts (red, bigger for a general or wraith), the gorillas (green), the skeletons (bone) and
    // the boss, with N E S W round the rim. Nothing it draws a frame allocates.
    const MAP = { range: 26, half: 30, size: 192 };
    const MAP_INK = { ring: "rgba(255,138,31,0.55)", pile: "#ffd23f", elixir: "#ff8a1f", player: "#4fa3ff", down: "#8a8f99", ghost: "#ff453a",
      gorilla: "#3dff66", bones: "#ece4cf", boss: "#ff2a1f", me: "#ffffff", edge: "rgba(0,0,0,0.75)", letter: "#f3e9d2", north: "#ff8a1f" };
    // The compass points: a letter and its way on the island (north is -z, the bearing's zero; east +x).
    const COMPASS = [["N", 0, -1], ["E", 1, 0], ["S", 0, 1], ["W", -1, 0]];
    let mapTerrain = null, mapCone = null, mapConeFor = 0;
    // The island from above, once: open sky dark, the meadow a dark moss, paths a pale earth, rock lighter as it rises.
    const terrainPicture = () => {
      const n = MAP.size, canvas = document.createElement("canvas");
      canvas.width = canvas.height = n;
      const g = canvas.getContext("2d"), img = g.createImageData(n, n), d = img.data;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = -MAP.half + (i + 0.5) / n * MAP.half * 2, z = -MAP.half + (j + 0.5) / n * MAP.half * 2, o = (j * n + i) * 4;
        if (!island.onLand(x, z)) { d[o + 3] = 0; continue; }
        const h = island.surfaceAt(x, z), k = clamp(h / 8, 0, 1);
        if (island.isPath(x, z)) { d[o] = 104; d[o + 1] = 96; d[o + 2] = 80; }
        else if (h < 0.3) { d[o] = 46; d[o + 1] = 60; d[o + 2] = 48; }
        else { d[o] = 72 + 90 * k; d[o + 1] = 74 + 88 * k; d[o + 2] = 76 + 84 * k; }
        d[o + 3] = 235;
      }
      g.putImageData(img, 0, 0);
      return canvas;
    };
    // Where (x, z) falls on the map: MAP_AT.x, MAP_AT.y in its pixels.
    const MAP_AT = { x: 0, y: 0 };
    let mapCx = 0, mapCz = 0, mapSin = 0, mapCos = 1, mapScale = 1, mapMid = 0;
    const mapAt = (x, z) => {
      const dx = x - mapCx, dz = z - mapCz;
      MAP_AT.x = mapMid + (-dx * mapCos + dz * mapSin) * mapScale;
      MAP_AT.y = mapMid - (dx * mapSin + dz * mapCos) * mapScale;
      return MAP_AT;
    };
    const dot = (g, x, z, r, ink) => {
      const p = mapAt(x, z), far = Math.hypot(p.x - mapMid, p.y - mapMid);
      if (far > mapMid - 2) return;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, TAU);
      g.fillStyle = ink;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = MAP_INK.edge;
      g.stroke();
    };
    const drawMinimap = (t) => {
      const map = hud.map, canvas = map.canvas;
      if (canvas.hidden || !canvas.width) return;
      if (!mapTerrain) mapTerrain = terrainPicture();
      const g = canvas.getContext("2d"), w = canvas.width, k = w / 180;
      const cave = crew.player, mine = cave && cave.root.visible;
      mapCx = mine ? cave.root.position.x : camera.target.x; mapCz = mine ? cave.root.position.z : camera.target.z;
      const yaw = Math.atan2(camera.target.x - camera.position.x, camera.target.z - camera.position.z);
      mapSin = Math.sin(yaw); mapCos = Math.cos(yaw); mapMid = w / 2; mapScale = mapMid / MAP.range;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, w);
      g.save();
      g.beginPath();
      g.arc(mapMid, mapMid, mapMid, 0, TAU);
      g.clip();
      // The island, the wall and the pile in the world's own frame, turned and scaled onto the map.
      const a = -mapCos * mapScale, b = -mapSin * mapScale, c = mapSin * mapScale, d = -mapCos * mapScale;
      g.setTransform(a, b, c, d, mapMid - (a * mapCx + c * mapCz), mapMid - (b * mapCx + d * mapCz));
      g.globalAlpha = 0.9;
      g.drawImage(mapTerrain, -MAP.half, -MAP.half, MAP.half * 2, MAP.half * 2);
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(0, 0, hub.ringRadius, 0, TAU);
      g.lineWidth = 2 / mapScale;
      g.strokeStyle = MAP_INK.ring;
      g.stroke();
      g.setTransform(1, 0, 0, 1, 0, 0);
      // The field of view: a cone up from the middle, as wide as the camera sees, fading out.
      const aspect = renderer.size.height ? renderer.size.width / renderer.size.height : 1, half = Math.atan(Math.tan(camera.fov / 2) * aspect);
      if (!mapCone || mapConeFor !== w) {
        mapCone = g.createRadialGradient(mapMid, mapMid, 0, mapMid, mapMid, mapMid);
        mapCone.addColorStop(0, "rgba(255,255,255,0.42)"); mapCone.addColorStop(1, "rgba(255,255,255,0)");
        mapConeFor = w;
      }
      g.beginPath();
      g.moveTo(mapMid, mapMid);
      g.arc(mapMid, mapMid, mapMid, -Math.PI / 2 - half, -Math.PI / 2 + half);
      g.closePath();
      g.fillStyle = mapCone;
      g.fill();
      dot(g, 0, 0, 3.5 * k, MAP_INK.pile);
      const fighting = S.state === ST.ACTIVE || S.state === ST.BOSS;
      if (fighting) for (let i = 0; i < hub.elixirSpots.length && i < C.ELIXIR.max; i++) if (!(S.elixirsTaken & (1 << i))) dot(g, hub.elixirSpots[i].x, hub.elixirSpots[i].z, 3 * k, MAP_INK.elixir);
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const q = sim.ghosts[i];
        if (q.on && !q.dying && ghostNodes[i].visible) dot(g, view[i * 4], view[i * 4 + 2], (q.tier === SIM.TIER.PLAIN ? 2.6 : 3.6) * k, MAP_INK.ghost);
      }
      for (let i = 0; i < B.max; i++) {
        const q = sim.brutes[i];
        if (q.on && !q.dying && q.phase >= BP.FALL) dot(g, q.x, q.z, (q.kind ? 3 : 4.2) * k, q.kind ? MAP_INK.bones : MAP_INK.gorilla);
      }
      if (S.bossOn && !S.bossDyingAt) dot(g, S.bossX, S.bossZ, 6 * k, MAP_INK.boss);
      const me = myId();
      for (const q of sim.players) {
        if (!q.on || q.id === me) continue;
        const at = playerAt(q.id);
        if (at) dot(g, at.x, at.z, 3.4 * k, t < q.frozenUntil ? MAP_INK.down : MAP_INK.player);
      }
      // The visitor: an arrow at the middle, pointing the way they look.
      g.beginPath();
      g.moveTo(mapMid, mapMid - 7 * k); g.lineTo(mapMid + 5 * k, mapMid + 5 * k); g.lineTo(mapMid, mapMid + 2.5 * k); g.lineTo(mapMid - 5 * k, mapMid + 5 * k);
      g.closePath();
      g.fillStyle = MAP_INK.me;
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = MAP_INK.edge;
      g.stroke();
      // The compass round the rim.
      g.font = map.font;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const rim = mapMid - 9 * k;
      for (let i = 0; i < COMPASS.length; i++) {
        const point = COMPASS[i], ex = point[1], ez = point[2], px = -ex * mapCos + ez * mapSin, py = -(ex * mapSin + ez * mapCos);
        g.fillStyle = i ? MAP_INK.letter : MAP_INK.north;
        g.fillText(point[0], mapMid + px * rim, mapMid + py * rim);
      }
      g.restore();
    };

    // ---------- the storm ----------
    let nextStrike = 0, boltT = -1, boltX = 0, boltY = 0, boltZ = 0, boltVariant = 0, flash = 0;
    // A strike's flash strobes twice and decays, as the island's own weather does.
    const flashAt = (s) => s < 0.08 ? 1 : s < 0.14 ? 0.25 : s < 0.22 ? 0.85 : 0.85 * Math.exp(-(s - 0.22) / 0.18);
    const strike = () => {
      const a = Math.random() * TAU, r = 24 + Math.random() * 5;
      boltX = Math.sin(a) * r; boltZ = -Math.cos(a) * r;
      const ground = island.surfaceAt(boltX, boltZ);
      boltY = ground > -100 ? ground : 0;
      boltT = 0;
      boltVariant = Math.random() * 4 | 0;
      const away = Math.hypot(boltX - camera.position.x, boltY - camera.position.y, boltZ - camera.position.z);
      audio.play("thunder", Math.min(2, 0.15 + away / 90));
      fx.burst(boltX, boltY + 0.3, boltZ, 8, EMBERS, 3);
    };
    const drawStorm = (dt, now) => {
      const storming = S.state >= ST.NIGHT && S.state <= ST.DEFEAT && nightK > 0.5 && !S.paused;
      if (!storming) nextStrike = 0;
      else if (!nextStrike) nextStrike = now + STRIKE_GAP_MS * 0.5 + Math.random() * STRIKE_SPREAD_MS;
      else if (now >= nextStrike) { strike(); nextStrike = now + STRIKE_GAP_MS + Math.random() * STRIKE_SPREAD_MS; }
      if (boltT < 0) { flash = 0; boltNode.visible = boltGlow.visible = false; return; }
      boltT += dt;
      flash = flashAt(boltT);
      if (boltT > 1.2) { boltT = -1; flash = 0; boltNode.visible = boltGlow.visible = false; return; }
      const shown = boltT < 0.3 ? flash : 0;
      sprite(boltNode, MODELS.bolt(boltVariant), boltX, boltY, boltZ, BOLT_W, BOLT_H, shown, false);
      sprite(boltGlow, MODELS.glowDisc([170, 205, 255]), boltX, boltY + 0.05, boltZ, 7, 7, 0.8 * flash, true);
    };
    // ---------- the lightning drop's bolts ----------
    // Each struck enemy's bolt out of the sky as its turn comes: a white flash over it, its crack (no more than one a
    // ninety milliseconds, however many fall together), sparks and the sky lit.
    let strikeFlash = 0, strikeSoundAt = -1e9;
    const strikeOne = (k, at, x, y, z, t, now) => {
      const node = strikeNodes[k], glow = strikeGlows[k], ms = at > 0 ? t - at : -1;
      if (ms < 0 || ms > STRIKE_MS) { node.visible = glow.visible = false; return; }
      if (strikeHeard[k] !== at) {
        strikeHeard[k] = at;
        if (now - strikeSoundAt > 90) { strikeSoundAt = now; audio.play("strike"); }
        strikeFlash = Math.max(strikeFlash, 0.8);
        fx.burst(x, y + 0.4, z, 8, ZAPS, 3.5);
      }
      const o = flashAt(ms / 1000);
      sprite(node, MODELS.bolt(k % 4), x, y, z, STRIKE_W, STRIKE_H, o, false);
      sprite(glow, MODELS.glowDisc([170, 205, 255]), x, y + 0.6, z, 3.5, 3.5, 0.9 * o, false);
    };
    const drawStrikes = (dt, t, now) => {
      strikeFlash = Math.max(0, strikeFlash - dt * 3);
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const g = sim.ghosts[i];
        strikeOne(i, g.on ? g.struckAt : 0, view[i * 4], view[i * 4 + 3], view[i * 4 + 2], t, now);
      }
      for (let i = 0; i < C.BRUTE.max; i++) {
        const b = sim.brutes[i], p = (b.kind ? skels[i] : rigs[i]).root.position;
        strikeOne(C.MAX_GHOSTS + i, b.on ? b.struckAt : 0, p.x, p.y, p.z, t, now);
      }
      strikeOne(STRIKES - 1, S.bossOn ? S.bossStruckAt : 0, S.bossX, BOSS_Y, S.bossZ, t, now);
    };
    const drawRing = (dt) => {
      if (ringT < 0) { ring.visible = false; return; }
      ringT += dt;
      const k = ringT / 0.5;
      if (k >= 1) { ringT = -1; ring.visible = false; return; }
      ring.visible = true;
      ring.position.x = ringX; ring.position.y = island.surfaceAt(ringX, ringZ) + 0.3; ring.position.z = ringZ;
      ring.scale.x = ring.scale.z = 1 + 22 * k; ring.scale.y = 1;
      ring.smokeOpacity = 1 - k;
    };

    // ---------- the frame ----------
    // What to paint ahead: every ghost's views (mirrored sides too) plain and flashed, the herald's, and the drops.
    const WARM = [];
    for (const tier of [TIERS.plain, TIERS.general, TIERS.wraith, TIERS.boss, TIERS.herald]) {
      const general = tier === TIERS.general || tier === TIERS.wraith, views = general ? 5 : 3;
      for (let view = 0; view < views; view++) for (const mirror of view === 2 ? [false, true] : [false]) {
        for (const mode of tier === TIERS.herald ? [MODELS.MODE.normal] : [MODELS.MODE.normal, MODELS.MODE.flash]) WARM.push([tier, view, mirror, mode]);
      }
    }
    for (let kind = 0; kind < MODELS.DROPS.length; kind++) if (!MODELS.DROPS[kind].tess && !MODELS.DROPS[kind].lightning) WARM.push([-1, kind]);
    let warm = 0;
    const update = (dt) => {
      const now = clock(), role = npcSync.role;
      PILE.r = hub.pileRadius() + 0.9;
      if (role !== "follow") {
        if (S.state !== ST.IDLE) gatherPlayers();
        sim.advance(now);
        if (startAskedAt) startAskedAt = 0;
      } else {
        localHere = false;
        const cave = crew.player;
        if (S.state !== ST.IDLE && cave && !hub.gorillaActive()) { const p = cave.root.position; localHere = hub.zoneOf(cave) === "outside" && inArena(p.x, p.y - cave.baseY, p.z); }
        // Just turned follower (a page come back to the island, the host elsewhere): the host's frames get a fair wait.
        if (role !== lastRole) heardAt = now;
        if (S.state !== ST.IDLE && now - heardAt > LOST_HOST_MS) { sim.clear(); hub.hud.toast("The ghosts drift away"); }
        if (startAskedAt && S.state === ST.IDLE && now - startAskedAt > START_WAIT_MS) { startAskedAt = 0; hub.hud.toast("The ghost slips away"); }
        else if (startAskedAt && S.state !== ST.IDLE) startAskedAt = 0;
      }
      lastRole = role;
      if (role === "follow") flushHits(now);
      const t = huntTime();
      if (S.state !== prevState) { onState(S.state, prevState, t); prevState = S.state; }
      spectate(waiting());
      nightK = nightOf(t);
      // The playlist runs from the herald's launch to the victory banner; the mini player shows it meanwhile.
      const musicTime = S.state >= ST.LAP && S.state <= ST.BOSS || S.state === ST.VICTORY;
      audio.music(musicTime);
      hud.player(musicTime ? audio.nowPlaying : null, audio.musicOn, audio.tracks > 1);
      jolt = Math.max(0, jolt - dt * 2.2);
      landShake = Math.max(0, landShake - dt);
      // The landing shake holds for its second, easing off over the last quarter of one.
      quake = Math.max(quakeOf(t), jolt, LAND_SHAKE * Math.min(1, landShake / 0.25));
      if (S.state >= ST.LAP && S.state <= ST.DEFEAT) armHunter(crew.player);
      dim += clamp((S.bossOn && S.state === ST.BOSS ? 1 : 0) - dim, -dt / 1.5, dt / 1.5);
      hush += clamp((bannerUp && S.state !== ST.IDLE ? 1 : 0) - hush, -dt / BANNER_OUT_S, dt / BANNER_IN_S);
      drawWalls(dt, t, now);
      drawHerald(dt, t, now);
      if (S.state !== ST.IDLE || sim.alive()) {
        cueDrops(t);
        drawGhosts(dt, t, now);
        drawBoss(dt, t, now);
        drawOrbs(now);
        drawDrops(t, now);
        if (!boltOn) boltDrop.visible = false;
        drawStrikes(dt, t, now);
        drawPowers(t);
        drawBeams(dt, t, now);
        drawGraves(dt, t);
        drawElixirs(now);
        drawBubbles(t, now);
        drawBrutes(dt, t, now);
        drawMonkeys(now);
        drawGlows(t);
        drawRocks();
        drawStorm(dt, now);
        followMe(dt, t);
      } else {
        for (const n of ghostNodes) n.visible = false;
        bossNode.visible = false;
        for (const list of [dropNodes, auras, halos, pulses, dropBeams, streaks, scorches, mists, powerColumns, powerFlashes, powerRings, orbNodes, arriveBeams, arriveGlows, landFlashes, landRings, dropColumns, bubbles, strikeNodes, strikeGlows, monkeyNodes, rockNodes, graveNodes, playerGlows, elixirNodes, elixirGlows]) for (const n of list) n.visible = false;
        reviveAura.visible = reviveHalo.visible = revivePulse.visible = false;
        rockAt.fill(-1); graveFor.fill(0); giftAt.fill(-1e9);
        letGo();
        boltDrop.visible = false; strikeFlash = 0;
        for (const rig of rigs) rig.root.visible = false;
        for (const k of skels) k.root.visible = false;
        boltNode.visible = boltGlow.visible = false;
        flash = 0;
        for (const n of beams) n.visible = false;
        for (const n of souls) n.visible = false;
        hud.soul(false);
        // Idle: paint the hunt's sprites one a frame, so the first round has nothing left to paint.
        if (warm < WARM.length) {
          const w = WARM[warm], geo = w[0] < 0 ? MODELS.drop(w[1]) : MODELS.ghost(w[0], w[1], w[2], w[3]);
          if (geo) { keep(geo); warm++; }
        }
      }
      drawRing(dt);
      drawHud(t);
      drawMinimap(t);
      const cave = crew.player;
      if (sealedCount && cave && cave.jet) {
        hub.dropJetpack(cave);
        if (!groundedToast) { groundedToast = true; hub.hud.toast("The ghosts grounded your jetpack"); }
      }
      if (!sealedCount) groundedToast = false;
      audio.update();
    };

    // ---------- the hub's hooks ----------
    const BAR = { x: 0, y: 0 };
    // The visitor's own health while a round is in play (a round, or the boss's fight): a cell a hit point on a little
    // plank sign held over their Ooga's head in the lobby card's wood, green, red at two or fewer, filling back a cell
    // at a time in an orange glow as a round starts. None for anyone not hunting with an Ooga, nor while down. An
    // elixir carried bobs beside it (a revive under way shows as a ring over the grave, `drawReviveRings`). In first
    // person, or with the head off screen, the same sign stays just below the crosshair.
    const HEALTH = { cell: 13, cellH: 7, gap: 3, pad: 5, lift: 0.45, glowMs: 1800, stepMs: 200 };
    const WOOD = { edge: "#4a3319", plank: "#a9773f", wood: "#8a6236", nail: "#3a2a18", empty: "rgba(0,0,0,0.5)", on: "#3ce65a", low: "#ff453a", glow: "#ff8a1f" };
    const drawHealth = (ctx2d, project) => {
      if (S.state !== ST.ACTIVE && S.state !== ST.BOSS) return;
      const me = sim.playerById(myId()), t = huntTime();
      if (me && t < me.frozenUntil) return;
      if (!me || !crew.player || waiting() || hub.gorillaActive() || !localHere || !standing(me.id)) return;
      const n = C.PLAYER_SEGMENTS, w = n * HEALTH.cell + (n - 1) * HEALTH.gap + HEALTH.pad * 2, h = HEALTH.cellH + HEALTH.pad * 2;
      const img = me.elixir ? MODELS.picture("elixir") : null, ih = h + 16, iw = img ? ih * img.naturalWidth / img.naturalHeight : 0;
      const p = crew.player.parts.head.cameraHidden ? null : project(STANDS.x, STANDS.y + STANDS.h + HEALTH.lift, STANDS.z);
      const size = renderer.size, extra = img ? iw + 5 : 0, vertical = img ? 10 : 0;
      const inView = p && p.x - w / 2 >= 12 && p.x + w / 2 + extra <= size.width - 12
        && p.y - h - vertical >= 12 && p.y + vertical <= size.height - 12;
      const x = Math.round((inView ? p.x : size.width / 2) - w / 2), y = Math.round(inView ? p.y - h : size.height / 2 + 48), half = Math.round(h / 2);
      const since = S.healAt ? t - S.healAt : Infinity, glow = clamp(1 - since / HEALTH.glowMs, 0, 1);
      if (glow > 0) {
        ctx2d.globalAlpha = glow;
        ctx2d.shadowColor = WOOD.glow;
        ctx2d.shadowBlur = 18 * glow;
        ctx2d.fillStyle = WOOD.glow;
        ctx2d.fillRect(x - 2, y - 2, w + 4, h + 4);
        ctx2d.shadowBlur = 0;
        ctx2d.globalAlpha = 1;
      }
      // The sign: an edge, two planks with a seam between, a nail in each corner.
      ctx2d.fillStyle = WOOD.edge;
      ctx2d.fillRect(x, y, w, h);
      ctx2d.fillStyle = WOOD.plank;
      ctx2d.fillRect(x + 2, y + 2, w - 4, half - 2);
      ctx2d.fillStyle = WOOD.wood;
      ctx2d.fillRect(x + 2, y + half + 1, w - 4, h - half - 3);
      ctx2d.fillStyle = WOOD.nail;
      ctx2d.fillRect(x + 3, y + 3, 2, 2); ctx2d.fillRect(x + w - 5, y + 3, 2, 2);
      ctx2d.fillRect(x + 3, y + h - 5, 2, 2); ctx2d.fillRect(x + w - 5, y + h - 5, 2, 2);
      const lit = me.seg <= 2 ? WOOD.low : WOOD.on;
      for (let i = 0; i < n; i++) {
        const on = i < me.seg && (glow <= 0 || since >= i * HEALTH.stepMs);
        ctx2d.fillStyle = on ? lit : WOOD.empty;
        ctx2d.fillRect(x + HEALTH.pad + i * (HEALTH.cell + HEALTH.gap), y + HEALTH.pad, HEALTH.cell, HEALTH.cellH);
      }
      if (img) {
        ctx2d.shadowColor = WOOD.glow;
        ctx2d.shadowBlur = 10;
        ctx2d.drawImage(img, x + w + 5, Math.round(y + h / 2 - ih / 2 + Math.sin(t / 300) * 2), iw, ih);
        ctx2d.shadowBlur = 0;
      }
    };
    // A revive under way, for everyone: over the grave of the one being brought back, a dark disc and an orange ring
    // filling clockwise from the top over ELIXIR.reviveMs, the whole seconds left in its middle.
    const COUNTDOWN = ["1", "2", "3", "4", "5", "6", "7", "8", "9"], RING_R = 18, RING_FONT = "700 15px sans-serif";
    const drawReviveRings = (ctx2d, project, t) => {
      for (const q of sim.players) {
        if (!q.on || !q.elixir || !q.reviveTarget) continue;
        let slot = -1;
        for (let i = 0; i < MAX_GRAVES; i++) if (graveFor[i] === q.reviveTarget) slot = i;
        if (slot < 0) continue;
        const o = slot * 3, p = project(graveAt[o], graveAt[o + 1] + MODELS.GRAVE_TOP + 0.75, graveAt[o + 2]);
        if (!p) continue;
        const k = clamp((t - q.reviveSince) / C.ELIXIR.reviveMs, 0, 1), x = Math.round(p.x), y = Math.round(p.y);
        const left = clamp(Math.ceil(C.ELIXIR.reviveMs * (1 - k) / 1000), 1, COUNTDOWN.length);
        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(x, y, RING_R + 5, 0, TAU);
        ctx2d.fillStyle = "rgba(20,12,4,0.72)";
        ctx2d.fill();
        ctx2d.lineWidth = 5;
        ctx2d.beginPath();
        ctx2d.arc(x, y, RING_R, 0, TAU);
        ctx2d.strokeStyle = "rgba(255,138,31,0.25)";
        ctx2d.stroke();
        if (k > 0) {
          ctx2d.lineCap = "round";
          ctx2d.shadowColor = WOOD.glow;
          ctx2d.shadowBlur = 10;
          ctx2d.beginPath();
          ctx2d.arc(x, y, RING_R, -Math.PI / 2, -Math.PI / 2 + TAU * k);
          ctx2d.strokeStyle = WOOD.glow;
          ctx2d.stroke();
          ctx2d.shadowBlur = 0;
        }
        ctx2d.font = RING_FONT;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillStyle = "#ffd9a8";
        ctx2d.fillText(COUNTDOWN[left - 1], x, y + 1);
        ctx2d.restore();
      }
    };
    const drawOverlay = (ctx2d, project) => {
      if (S.state === ST.IDLE) return;
      drawHealth(ctx2d, project);
      drawReviveRings(ctx2d, project, huntTime());
      for (let i = 0; i < C.MAX_GHOSTS; i++) {
        const g = sim.ghosts[i];
        if (!g.on || g.dying || g.hp >= C.HP[g.tier] || !ghostNodes[i].visible) continue;
        const v = i * 4, p = project(view[v], view[v + 3] + HEIGHT[g.tier] + 0.15, view[v + 2]);
        if (!p) continue;
        BAR.x = p.x; BAR.y = p.y;
        const w = g.tier !== SIM.TIER.PLAIN ? 48 : 30, frac = g.hp / C.HP[g.tier];
        ctx2d.globalAlpha = 0.85;
        ctx2d.fillStyle = "rgba(0,0,0,0.55)";
        ctx2d.fillRect(BAR.x - w / 2 - 1, BAR.y - 4, w + 2, 6);
        ctx2d.fillStyle = "#ff453a";
        ctx2d.fillRect(BAR.x - w / 2, BAR.y - 3, w * frac, 4);
        ctx2d.globalAlpha = 1;
      }
      for (let i = 0; i < B.max; i++) {
        const b = sim.brutes[i], root = b.kind ? skels[i].root : rigs[i].root, max = b.kind ? C.BONES.hp : B.hp;
        if (!b.on || b.dying || b.hp >= max || !root.visible) continue;
        const r = root.position, p = project(r.x, r.y + (b.kind ? BONES_H : BRUTE_H) + 0.3, r.z);
        if (!p) continue;
        const w = b.kind ? 30 : 48, frac = b.hp / max;
        ctx2d.globalAlpha = 0.85;
        ctx2d.fillStyle = "rgba(0,0,0,0.55)";
        ctx2d.fillRect(p.x - w / 2 - 1, p.y - 4, w + 2, 6);
        ctx2d.fillStyle = "#ff453a";
        ctx2d.fillRect(p.x - w / 2, p.y - 3, w * frac, 4);
        ctx2d.globalAlpha = 1;
      }
    };
    // A follower's hits go to the host as one report a tenth of a second (`HIT_BATCH_MS`), each target's damage summed,
    // so any mix of rifle and monkey fire, at any number of targets, stays at ten reports a second.
    const HIT_BATCH_MS = 100, HIT_SLOTS = 16, HIT_MAX = 60;
    const hitIds = new Float64Array(HIT_SLOTS), hitDamage = new Float64Array(HIT_SLOTS);
    let hitCount = 0, hitSentAt = 0;
    const flushHits = (now) => {
      if (!hitCount || now - hitSentAt < HIT_BATCH_MS) return;
      hitSentAt = now;
      for (let i = 0; i < hitCount; i++) hitDamage[i] = Math.min(HIT_MAX, hitDamage[i]);
      sync.hits(hitIds, hitDamage, hitCount);
      hitCount = 0;
    };
    const queueHit = (id, damage) => {
      for (let i = 0; i < hitCount; i++) if (hitIds[i] === id) { hitDamage[i] += damage; return; }
      if (hitCount === HIT_SLOTS) { hitSentAt = 0; flushHits(clock()); }
      hitIds[hitCount] = id; hitDamage[hitCount++] = damage;
    };
    /** A weapon landed on the herald, a ghost or the boss (the hub's weaponImpact); `shot` when a round did it. */
    const hit = (source, h, power, byPlayer, shot = false) => {
      const o = h.owner;
      if (!byPlayer) return;
      // Only a shot wakes the herald; the rest of a burst must not ready the visitor in the lobby it just opened.
      if (o.role === "herald") { if (shot && S.state === ST.IDLE) tapHerald(); return; }
      hitAs(o.role, o.slot, h.x, h.y, h.z, Math.max(1, Math.min(20, Math.round(power * 4))));
    };
    /** `damage` to the ghost or gorilla in `slot`, or the boss, landing at (x, y, z), for this page's player. */
    const hitAs = (role, slot, x, y, z, damage) => {
      let id;
      if (role === "boss") id = 0;
      else if (role === "brute") {
        const b = sim.brutes[slot];
        if (!b.on || b.dying) return;
        id = b.id;
      } else {
        const g = sim.ghosts[slot];
        if (!g.on || g.dying) return;
        id = g.id;
        flashUntil[slot] = huntTime() + 80;
      }
      fx.damageNumber(x, y + 0.25, z, damage);
      audio.play("hit");
      if (npcSync.role === "follow") queueHit(id, damage);
      else sim.hit(id, damage, myId());
    };
    /** The lab's debug keys, with Shift, on a `debug=1` page during a hunt; true when one was used. */
    const key = (e) => {
      if (S.state === ST.GATHER && !declined && (e.key === "r" || e.key === "R") && !e.shiftKey && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) { readyUp(); return true; }
      // P holds the hunt still and lets it go on, for everyone in it (a follower asks the host); on a debug page only.
      if (hub.debug && (e.key === "p" || e.key === "P") && !e.shiftKey && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && S.state >= ST.LAP && S.state <= ST.BOSS) {
        if (npcSync.role === "follow") sync.pause();
        else togglePause();
        return true;
      }
      if (!hub.debug || !e.shiftKey || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return false;
      const what = DEBUG_KEYS[e.code];
      if (!what || S.state === ST.IDLE) return false;
      if (npcSync.role === "follow") { hub.hud.toast("Ghost debug keys work on the host's page"); return true; }
      const me = myId();
      if (what === "drop") {
        // 1–6 the lab's six, 7 the monkeys, 8 the lightning.
        const kind = e.code === "Digit7" ? SIM.MONKEY_DROP : e.code === "Digit8" ? SIM.LIGHTNING_DROP : Number(e.code.slice(5)) - 1;
        hub.hud.toast(sim.debug.drop(kind) ? `Debug · ${SIM.DROP[kind]} drop` : `Debug · no ${SIM.DROP[kind]} drop now`);
      } else if (what === "next") { sim.debug.next(); hub.hud.toast("Debug · next round"); }
      else if (what === "ghost" || what === "general" || what === "wraith") {
        const tier = what === "ghost" ? SIM.TIER.PLAIN : what === "general" ? SIM.TIER.GENERAL : SIM.TIER.WRAITH;
        hub.hud.toast(sim.debug.ghost(tier) ? `Debug · a ${what === "ghost" ? "ghost" : what}` : "Debug · ghosts come only while a round runs");
      } else if (what === "boss") { sim.jump(ST.BOSS); hub.hud.toast("Debug · the boss"); }
      else if (what === "nuke") { sim.debug.nuke(); hub.hud.toast("Debug · every ghost burns"); }
      else if (what === "unfreeze") { sim.debug.unfreeze(me); hub.hud.toast("Debug · thawed"); }
      else if (what === "kills") { sim.debug.kills(me, 10); hub.hud.toast("Debug · +10 kills"); }
      else if (what === "gorilla") hub.hud.toast(sim.debug.gorilla(me) ? "Debug · a gorilla" : "Debug · gorillas come only while a round runs");
      else if (what === "skeleton") hub.hud.toast(sim.debug.skeleton(me) ? "Debug · a skeleton" : "Debug · skeletons come only while a round runs");
      else if (what === "revive") {
        // An elixir, and a stand-in hunter down a step in front of the visitor's Ooga: stand still to watch the revive.
        const cave = crew.player;
        if (cave) {
          const p = cave.root.position, h = cave.root.rotation.y;
          bot.x = p.x + Math.sin(h) * 1.4; bot.y = p.y - cave.baseY; bot.z = p.z + Math.cos(h) * 1.4;
        }
        bot.on = !!cave && sim.debug.revive(me, bot.x, bot.z);
        bot.dropAt = 0;
        // Its grave wears another Ooga's head from the roster (any but the visitor's own).
        if (bot.on && !bot.head) for (const name of crew.cavemen.keys()) if (name !== cave.traits.name) { bot.head = name; break; }
        // Toasts stand down in GAME MODE, so the answer is said in the world.
        if (bot.on) fx.sayAt(bot.x, bot.y + 2, bot.z, "Debug · down here! Stand by me with the elixir", 3);
        else if (cave) fx.sayAt(cave.root.position.x, cave.root.position.y + 2.2, cave.root.position.z, "Debug · revives only while a round runs", 2.5);
      }
      return true;
    };
    /** The visitor's own rifle fired, from `from` toward `to` (the hub's shot hook): its sound, and the monkeys' rocks. */
    const shot = (from, to) => {
      audio.play("shot");
      monkeyShot(from, to);
    };
    const busy = () => S.state !== ST.IDLE;
    const refuseTravel = () => !off(S.state) && S.state !== ST.DAWN ? "The ghost walls hold the island shut" : null;
    const liveGeometry = (set) => {
      for (let i = 0; i < used.length; i++) set.add(used[i]);
      for (const rig of rigs) rig.liveGeometry(set);
    };
    const dispose = () => {
      sync.dispose();
      for (const rig of rigs) rig.dispose();
      hub.setSeal(null);
      hub.gameMode(false);
      letGo();
      for (const w of walls) {
        if (!w.zone) continue;
        const at = hub.closedZones.indexOf(w.zone);
        if (at >= 0) hub.closedZones.splice(at, 1);
      }
      restoreIsland();
      disarmHunters();
      guide.lend(null);
      audio.dispose();
      hud.dispose();
      removeChild(root, group);
      for (const geo of used) geo.ghostWorn = false;
      used.length = 0;
    };

    // ---------- debug (`__ooga.halloween`) ----------
    const debug = {
      sim, walls, stops, spots, lapMs, herald, seal,
      get state() { return Object.keys(ST).find((k) => ST[k] === S.state); },
      get round() { return S.round; },
      get role() { return npcSync.role; },
      get sealed() { return sealedCount; },
      start: () => { if (npcSync.role === "follow") sync.start(); else sim.start(clock(), myId(), SKIP); },
      /** Straight to a state by name ("BOSS", "BREAK", ...), and a round for a countdown. */
      skip: (state, round) => sim.jump(ST[state], round),
      end: () => { if (S.state !== ST.IDLE) sim.jump(ST.DAWN); },
      /** Runs the hunt `seconds` on, frames of `dt`, without waiting for the clock. */
      simulate: (seconds, dt = 1 / 30) => {
        for (let t = 0; t < seconds; t += dt) { skew += dt * 1000; update(dt); }
      },
      tap: () => tapHerald()
    };

    return {
      update, drawOverlay, hit, shot, key, down, get waiting() { return spectating; }, rock: MODELS.rock(), hour, shade, shake, unshake, release, dispose, liveGeometry, refuseTravel, debug,
      get sealed() { return sealedCount > 0; },
      get hunting() { return !off(S.state); },
      get busy() { return busy(); },
      get quietSky() { return !off(S.state); },
      get inMotion() { return S.state !== ST.IDLE || sim.alive() > 0; },
      stats: () => ({ ghosts: sim.alive() + sim.brutesAlive() })
    };
  };

  BL.halloween = { create };
})();
