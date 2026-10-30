(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, donations, terrain, hubModels, headquartersModels, poolModels, caves, daylight, game: gameMod, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod, crew: crewMod, pile: pileMod, crates: cratesMod, critters: crittersMod, weather: weatherMod, chain, mempool, oogatronLive } = BL;
  const { clamp, lerp, ease, fnv1a, mulberry32 } = math;
  const { createNode, addChild, removeChild, updateWorld, createCamera, addTween, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { JET_SPEED, JET_RISE, JET_FUEL_SECONDS, JET_MOVE_SECONDS } = crewMod;
  const { DROP_HEIGHT } = pileMod;
  const params = new URLSearchParams(location.search);
  const LAZY_BEDDING = params.get("lazyhub") === "1";
  const SEED = 1;
  const DEG = Math.PI / 180;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const yawParam = parseFloat(params.get("yaw"));
  // Debug-only clock params: hour pins the hour, daylen is the day length in seconds.
  const DEBUG = params.has("debug");
  const DEBUG_POOL_BLOCK = DEBUG && params.get("poolblock") === "1";
  const DEBUG_TOTEM_GLOW = DEBUG && params.get("totemglow") === "1";
  const DEBUG_GORILLA_MOVE = DEBUG && (params.get("gorillamove") === "1" || params.get("climbers") === "1");
  const DEBUG_GORILLA_RAGE = DEBUG && params.get("gorillarage") === "1";
  // HALLOWEEN: the ghost hunt comes with the island unless a page opts out (`halloween=0`); the suite's quiet pages
  // (`nosim`) leave it out unless they ask for it (`halloween=1`).
  const GHOSTS_WANTED = params.get("halloween") === "1" || params.get("halloween") !== "0" && !params.has("nosim");
  const timeParam = DEBUG ? params.get("time") : null;
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const daylenParam = DEBUG ? parseFloat(params.get("daylen")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const latitudeParam = DEBUG ? parseFloat(params.get("latitude")) : NaN;
  const requestedView = DEBUG ? params.get("view") : null;
  const preloadedView = requestedView === "hq" ? "underground" : requestedView === "bsmt" ? "basement" : requestedView === "pile" || requestedView === "lab" || requestedView === "mirror" || requestedView === "timechain" || requestedView === "bifrost" || requestedView === "mempool" || requestedView === "bca" ? requestedView : null;
  const preloadedPose = DEBUG ? readPositionPose(params.get("pose")) : null;
  const preloadedMode = DEBUG ? params.get("mode") || preloadedPose?.mode : null;
  const preloadedFirstPerson = DEBUG && (params.get("firstperson") === "1" || preloadedMode === "first-person" || preloadedMode === "eye-level");
  const preloadedSelection = DEBUG ? (params.get("character") || preloadedPose?.character)?.trim().toLowerCase() : null;
  const preloadedGorilla = !!preloadedSelection && /^(?:gorilla|clanker)-/.test(preloadedSelection);
  const preloadedCharacter = preloadedGorilla ? preloadedSelection.slice(preloadedSelection.indexOf("-") + 1) : preloadedSelection;
  const preloadedWeapon = DEBUG ? Number(params.get("weapon")) : 0;
  const preloadedAmmo = DEBUG ? params.get("ammo") : null;
  const preloadedEquipment = preloadedWeapon === 1 || preloadedWeapon === 2 || preloadedAmmo === "unlimited"
    || preloadedAmmo !== null && preloadedAmmo.trim() !== "" && Number.isFinite(Number(preloadedAmmo));
  const preloadedJetpack = DEBUG && (params.get("jetpack") === "1" || !!preloadedPose?.character && preloadedPose.jetpack);
  const preloadedJetpackWear = preloadedJetpack && preloadedView !== "underground" && preloadedView !== "basement";
  const POSITION_DEBUG = DEBUG && params.get("pos") !== "0";
  const islandLatitude = Number.isFinite(latitudeParam) ? Math.max(-90, Math.min(90, latitudeParam)) : daylight.ISLAND_LATITUDE_DEG;
  // MEADOW/RADIUS are island measures owned by terrain.js; keep them in sync.
  const MEADOW = 22, RADIUS = 30;
  const PITCH_MIN = 0.2, PITCH_MAX = 1.25, DIST_MIN = 3.5, DIST_MAX = 64, BIRDS_EYE_MIN = 21, GORILLA_BIRDS_EYE_MIN = 8;
  const CLEARANCE = 1.5;
  const PILE_VIEW = { yaw: Number.isFinite(yawParam) ? yawParam : 0, pitch: 0.62, dist: 24, target: { x: 0, y: 0.6, z: 0 } };
  // GATE_VIEW.target.y is a placeholder; the real height is set at enter.
  const GATE_VIEW = { yaw: 0, pitch: 0.32, dist: 18, target: { x: 0, y: 0, z: -(RADIUS - 2) } };
  const mouthView = (m) => ({ yaw: m.ry, pitch: 0.3, dist: 18, target: { x: m.x, y: 1.5, z: m.z } });
  const NAVIGATION = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, dist: 6 };
  const PILE_ARRIVAL_SEARCH = { next: 0, angle: 0 };
  const NAVIGATION_OFFSETS = [0, -0.75, 0.75, -1.5, 1.5];
  const NAVIGATION_SIDES = [0, -0.75, 0.75, -1.5, 1.5, -2.25, 2.25, -3, 3];
  const NAVIGATION_DEPTHS = [0, 1.5, -1.5, 3, -3, 4.5, -4.5], NAVIGATION_SAME_DEPTH = [0];
  const AREA_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const ENTER_DIST = 10, ENTER_DUR = 0.45;
  const FLY = { speed: 6, perDist: 0.5, climb: 6, yMin: -8, yMax: JET_RISE * JET_FUEL_SECONDS + 16 }, FLY_BOUND = RADIUS + JET_SPEED * JET_MOVE_SECONDS + 8;
  // ABYSS_FLOOR is an unseen support that keeps hop integration finite until the visible abyss fall ends.
  const ABYSS_FLOOR = -120, ABYSS_RESPAWN_Y = -60;
  // `view` is where a driven Ooga's camera arrives at the pile (signing in, a respawn) and where a reset puts it:
  // high and far enough to read the ground all round the Ooga, the top of the view just reaching the horizon.
  const FOLLOW = { y: 0.9, min: 4, max: 10, pitch: [0.25, 0.8], view: { pitch: 0.42, dist: 9 } };
  // Close view sits at an average Ooga eye; first person sits at the face surface.
  // Looking down then clears the hidden head. Portal ownership stays with the Ooga, not this offset.
  const CLOSE_VIEW = { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 6, orbitDist: 6 };
  const STEP_MAX = pilotMod.WALK.step;
  const MAGAZINE_REACH = 0.7, MAGAZINE_SCALE = 2.4;
  // Space at Ooga Arcade's mouth works from MOUTH_REACH of a point MOUTH_ACTION_Z inside its doorway.
  const MOUTH_REACH = 3.2, MOUTH_ACTION_Z = -3.6;
  const MATRIX_TYPES = 8;
  const MATRIX_GATE_HIDDEN_Y = 3.2, MATRIX_BUTTON_REACH = 3.4, MATRIX_BUTTON_USE_REACH = 2.2;
  const MIRROR_GATE_Z = 0.28;
  const MIRROR_GATE_CLOSED = true;
  const PORTAL_Z = 0.5, PORTAL_MIN_X = -2.48, PORTAL_MAX_X = 2.48, PORTAL_MIN_Y = 0, PORTAL_MAX_Y = 2.98;
  const RIM_SEAM_DROP = 0.015;
  // The sign's back reaches 0.07 m behind its origin; the Arcade's flat wall sits behind the projecting rim.
  const CAVE_SIGN_Y = 3.5 - RIM_SEAM_DROP + hubModels.CAVE_SIGN_HEIGHT * 0.5 + 0.32;
  const CAVE_SIGN_Z = PORTAL_Z + 0.055;
  const CAVE_LIGHT_Z = 0.52;
  // RENDER_OPTS sky, light and lamp values are resampled from the clock only when an input drifts past a
  // sun-angle budget: 6e-4 of an hour turns the sun about 0.009 degrees, under a pixel at any view. DAY_STASH
  // holds the sampled fields that weather and the Mempool shelter then shade in place later in the frame,
  // so a reused sample restores them before those run; every other sampled field simply holds.
  const DAY_RESAMPLE_HOUR = 6e-4, DAY_RESAMPLE_DAY = DAY_RESAMPLE_HOUR / 24, DAY_RESAMPLE_MS = DAY_RESAMPLE_HOUR * 3600000;
  const DAY_STASH = { directStrength: 0, ambientFloor: 0, clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), direct: new Float32Array(3) };
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, moonSun: { x: 0, y: -1, z: 0 }, celestialPole: { x: 0, y: Math.sin(20 * DEG), z: -Math.cos(20 * DEG) }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0, moonIllumination: 1, moonPhase: 0.5, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", latitude: 20, dayOfYear: 172, continuousDay: 171.5, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0, sunriseHour: 6, sunsetHour: 18,
    time: 0, bloomStrength: 0.5, lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 34, sea: -70, cutawayMaxY: 1e6, birdsEyeCutaway: false, cutawayFade: 0, cutawayRockMix: 0, cutawayRegions: [], cutawayRegionCount: 0, cutawayCloudY: 0, cutawayCloudMix: 0
  };
  let viewPoseActor = null;
  RENDER_OPTS.beforeView = () => {
    const cave = pilot?.player;
    if (!cave || !crew || !cave.weapon.equipped || !cave.weapon.aiming || cave.gunSightMix <= 0) return null;
    viewPoseActor = cave;
    crew.poseWeapon(cave, camera, cave.gunSightMix);
    return cave;
  };
  RENDER_OPTS.afterView = () => {
    if (!viewPoseActor) return;
    crew.poseWeapon(viewPoseActor);
    viewPoseActor = null;
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  const DAYLIGHT_DEBUG = {
    sunDirection: RENDER_OPTS.sunDirection, moonDirection: RENDER_OPTS.moon, celestialPole: RENDER_OPTS.celestialPole,
    hour: 12, continuousDay: 171.5, phase: "noon", latitude: 20, dayOfYear: 172, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0,
    daylightFactor: 1, twilightFactor: 0, starFactor: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, moonStrength: 0, moonIllumination: 1, moonPhase: 0.5, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", sunriseHour: 6, sunsetHour: 18
  };
  // Mirrored out of RENDER_OPTS for __ooga only, so it stays off the shipped frame path.
  const syncDaylightDebug = (hour) => {
    DAYLIGHT_DEBUG.hour = hour;
    DAYLIGHT_DEBUG.continuousDay = RENDER_OPTS.continuousDay;
    DAYLIGHT_DEBUG.phase = phase;
    DAYLIGHT_DEBUG.latitude = RENDER_OPTS.latitude;
    DAYLIGHT_DEBUG.dayOfYear = RENDER_OPTS.dayOfYear;
    DAYLIGHT_DEBUG.solarDeclination = RENDER_OPTS.solarDeclination;
    DAYLIGHT_DEBUG.siderealAngle = RENDER_OPTS.siderealAngle;
    DAYLIGHT_DEBUG.sunAltitude = RENDER_OPTS.sunAltitude;
    DAYLIGHT_DEBUG.sunAzimuth = RENDER_OPTS.sunAzimuth;
    DAYLIGHT_DEBUG.moonAltitude = RENDER_OPTS.moonAltitude;
    DAYLIGHT_DEBUG.moonAzimuth = RENDER_OPTS.moonAzimuth;
    DAYLIGHT_DEBUG.daylightFactor = RENDER_OPTS.day;
    DAYLIGHT_DEBUG.twilightFactor = RENDER_OPTS.twilight;
    DAYLIGHT_DEBUG.starFactor = RENDER_OPTS.stars;
    DAYLIGHT_DEBUG.lampFactor = RENDER_OPTS.lampFactor;
    DAYLIGHT_DEBUG.directStrength = RENDER_OPTS.directStrength;
    DAYLIGHT_DEBUG.directionalLightStrength = RENDER_OPTS.directionalLightStrength;
    DAYLIGHT_DEBUG.moonStrength = RENDER_OPTS.moonStrength;
    DAYLIGHT_DEBUG.moonIllumination = RENDER_OPTS.moonIllumination;
    DAYLIGHT_DEBUG.moonPhase = RENDER_OPTS.moonPhase;
    DAYLIGHT_DEBUG.ambientFloor = RENDER_OPTS.ambientFloor;
    DAYLIGHT_DEBUG.diffuseFloor = RENDER_OPTS.diffuseFloor;
    DAYLIGHT_DEBUG.shadowStrength = RENDER_OPTS.shadowStrength;
    DAYLIGHT_DEBUG.shadowFloor = RENDER_OPTS.shadowFloor;
    DAYLIGHT_DEBUG.shadowBias = RENDER_OPTS.shadowBias;
    DAYLIGHT_DEBUG.outdoorDarkestSurfaceEstimate = RENDER_OPTS.outdoorDarkestSurfaceEstimate;
    DAYLIGHT_DEBUG.activeLightSource = RENDER_OPTS.activeLightSource;
    DAYLIGHT_DEBUG.sunriseHour = RENDER_OPTS.sunriseHour;
    DAYLIGHT_DEBUG.sunsetHour = RENDER_OPTS.sunsetHour;
  };
  const PHASE_TOASTS = { dawn: "Dawn breaks over the island", morning: "Morning on the island", noon: "High noon", dusk: "Dusk settles over the island", night: "Night. The torches are lit.", midnight: "Midnight. The island sleeps." };
  // Lamp colours and reach; a lamp's flame reads through node.glow.
  const LAMP = { torch: { r: 1.0, g: 0.62, b: 0.25, radius: 6, glow: 0.85, hide: false }, fire: { r: 1.0, g: 0.55, b: 0.2, radius: 9, glow: 0.9, hide: true }, lantern: { r: 1.0, g: 0.8, b: 0.45, radius: 4, glow: 0.9, hide: false }, arch: { r: 1.0, g: 0.62, b: 0.3, radius: 8, glow: 0.9, hide: false } };
  const LIGHT_CAPACITY = BL.glRenderer.POINT_LIGHT_CAPACITY;
  const LIGHTING_DEBUG = {
    registeredLampCount: 0, activeFullLightCount: 0, approximatedLightCount: 0,
    configuredLightCapacity: LIGHT_CAPACITY, selectedCount: 0, approximatedCount: 0,
    tier: "high", selectedIds: new Array(LIGHT_CAPACITY).fill(null), approximatedIds: new Array(LIGHT_CAPACITY).fill(null)
  };
  const LAMP_STAGGER = 0.12, LAMP_RAMP = 0.4, LAMP_OFF = 0.12;
  const FIRE_DEGREES = [130, 125, 135, 120, 140, 115, 145], FIRE_RADIUS = 11.5, FIRE_SEATS = 6, FIRE_SEAT_RADIUS = 1.8;
  const FIRE_CONTACT_RADIUS = 0.65, FIRE_AVOID_RADIUS = 1.25, FIRE_BOTTOM = 0.12, FIRE_TOP = 0.85;
  const NIGHT = 0.5, FIRE_SEAT_CHANCE = 0.5;
  // Clock-face degrees to a meadow point: 0 is -z (far), 90 is +x (right).
  const polar = (deg, r) => ({ x: Math.sin(deg * DEG) * r, z: -Math.cos(deg * DEG) * r });
  const BUILD_DEGREES = [12, 40, 66, 80, 102, 165, 195, 212, 282, 297, 312, 340];
  const BUILD_RADIUS = 13;
  const NUDGES = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const PATH_GEOMETRY = new WeakMap();
  const TIMECHAIN_OUTER_PERIOD = 180;
  const DRESSED = new WeakMap();
  const DRESSING_LAMPS = BL.dressing.LIGHT_RGB.map(([r, g, b]) => ({ r, g, b, radius: 5.5, glow: 0.9, hide: false }));
  const dressingLights = [];
  const PILE_POST_DEGREES = [315, 78, 195], pilePosts = [];
  const PILE_POST_NIGHT_BOOST = 0.25, PILE_POST_NIGHT_REACH = 2;
  const PILE_SCALE = 0.45;
  // How tall a remote visitor's Ooga stands for the crew's walkers (`outsideActorHeight`).
  const REMOTE_BODY_HEIGHT = 2.2;
  const SCENERY_CLEARANCE = 0.25;
  const MEADOW_INNER = 5, MEADOW_OUTER = MEADOW - 1.5, CLIFF_INNER = MEADOW + 1.5, CLIFF_OUTER = RADIUS - 1;
  const DOCK_DEG = 75, LADDER_Z = -3.6, LADDER_LEAN = 0.65;
  // Two disjoint annuli keep sparse clouds around the horizon, passing below and above the bridges.
  // Nine clouds per ring leave room for the widest mesh; each ring keeps its angular spacing.
  const CLOUDS_PER_TRACK = 9;
  const CLOUD_TRACKS = [
    { radius: 36, speed: 0.48, phase: 0.1, baseY: -4, waveY: 1.5 },
    { radius: 40, speed: 0.56, phase: 0.6, baseY: 11, waveY: -2.25 }
  ];
  const WANDER_COUNT = 36, WANDER_INNER = 5.5;
  const ALTAR_HEIGHT = 0.34, ALTAR_BLOCK_WIDTH = 0.2, ALTAR_BLOCK_ARC = 0.3, ALTAR_RING_GAP = 0.02, ALTAR_MAX_BLOCKS = 512;
  const RIPEN = 25, TREE_CHANCE = 0.5, BUSH_CHANCE = 0.25;
  const PROP_TIPS = { tree: "Tree · shake it", bush: "Bush · rustle it", flower: "Flowers", torch: "Torch · warm", firepit: "Fire pit", bedroll: "Somebody's bed", ladder: "Ladder · wobbly", dock: "Dock · creaky", magazine: "Spare magazine · walk into it to collect", poolbridge: "Vine bridge · to the Mempool island", poolsign: "Mempool Rainforest · the way down is through the hill", poolpainting: "Wall painting · tap to read it closely", chainsign: "The chain, at a glance · tap to read it", weathersign: "Reading the weather · tap for the key", poolrock: "Mossy rock", poolfern: "Fern · rustle it", poollog: "Fallen log · something lives in it", jaguar: "Jaguar · do not poke", monkey: "Monkey · it watches you", toucan: "Toucan · big beak", canopy: "Rainforest tree · shake it", jumbotron: "Oogatron · OogaBoogaX on the big screen · tap the screen for a close-up", palm: "Palm · shake it", bifrostbridge: "Bifröst · the bridge to ₿IFRÖST", bifrostgate: "₿IFRÖST · walk an Ooga through the field", heimdall: "Heimdall · keeper of the bridge", gate: null };
  const RETICLE_PROPS = new Set(["tree", "bush", "flower", "torch", "firepit", "totem", "ladder", "poolsign", "poolpainting", "chainsign", "weathersign", "poolfern", "poollog", "jaguar", "monkey", "toucan", "canopy", "jumbotron", "palm", "timechainentrance", "timechainkeypad", "bifrostgate", "heimdall"]);
  const workCave = (slot) => slot.repo && (slot.status === "open" || slot.status === "mirror");
  const MATRIX_LIVING_PROPS = new Set(["tree"]);
  const SCREEN_CULL_PROPS = new Set(["tree", "bush", "rock", "crate", "barrel", "flower", "grass", "palm", "poolrock", "poolfern", "poollog", "canopy", "magazine"]);
  const SOLID_PROPS = new Set(["tree", "firepit", "dock", "jumbotron", "totem", "poolbridge", "poolrock", "canopy"]);
  const CLANKER_STEP_PROPS = new Set(["poolrock"]);
  const BUSH_WORDS = ["Something rustles.", "A beetle. Ooga leaves it.", "Just a bush."];
  const PALM_WORDS = ["Coconuts. Ooga wanted bananas.", "A coconut thuds down. Ooga dodges.", "The fronds swish."];
  const LEAF = models.particleGeometry("#4a8530", 0.12, 0);
  const PETALS = ["#e04a3a", "#f2c94c", "#f3efe4"].map((c) => models.particleGeometry(c, 0.09, 0));
  const CHIP = models.particleGeometry("#6b625a", 0.1, 0);
  const SPARK = models.particleGeometry("#ffb13b", 0.08, 1);
  const DUST = models.particleGeometry("#a3874f", 0.1, 0);
  const FIRE_VIEW = { coverage: 0, ember: 0, soot: 0 };
  const FIRE_SPECKS = new Float32Array(96 * 4);
  {
    const random = mulberry32(fnv1a("first-person-fire"));
    for (let i = 0; i < FIRE_SPECKS.length; i += 4) {
      FIRE_SPECKS[i] = random();
      FIRE_SPECKS[i + 1] = random();
      FIRE_SPECKS[i + 2] = 0.0025 + random() * 0.009;
      FIRE_SPECKS[i + 3] = 0.35 + random() * 0.65;
    }
  }
  // Where eaters arrive from away
  const WALK_IN = { x: 0, z: -(MEADOW + 0.5) };
  const TICKER_AT = { x: 0, y: 0, z: -(RADIUS - 2) };
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const mark = (name) => {
    performance.clearMarks(`ooga:${name}`);
    performance.mark(`ooga:${name}`);
  };

  // One visit's state: created in enter, dropped in leave.
  let oogatronUnsub, renderer, game, world, go, lootEnabled, testBananas, root, camera, overlayCanvas, island, terrainRampRoof, pathNode, altar, hud, hooks, input, pilot, fx, cameraCover, bananaCover, solids, rockGuides, objectGuides, sightGuides, bananaGuides, pileGuides, platformGuides, mirrorGuides, pile, crew, crates, critters, clock, presets, entering, mirrorCave, matrixCave, matrixControl, gateRain, fireRigs, firePitRig, fire, headquarters, dockStairs, jumbotron, positionDebug, remotes, npcSync;
  // GAME MODE (`setGameMode`): an island event holds the island still for play while it runs.
  let gameMode = false, gameCombatOnly = false;
  // GAME MODE's ring (`updateGameRing`): the group holding its veils, how far it has risen (0 to 1) and the seconds left
  // before it starts up; the veils themselves, each with its ripples.
  let gameRing = null, gameRingK = 0, gameRingWait = 0;
  const ringPanels = [];
  // Its floating lanterns (one node each over one geometry), and whether they showed last frame.
  const ringLanterns = [];
  let ringLanternsShown = false;
  // HALLOWEEN: the lightweight herald, the hunt once a player starts or joins, and its walls' seal.
  let ghosts = null, ghostEntry = null, ghostSeal = null;
  let magazine, magazineState, clankers, clankerPlay, clankerMeshes, clankerPartOwners, grabSupportEntry = null, entropyLab, chalkboard, factoryMouth = null, arcadeMouth = null, bcaMouth = null, glCanvas = null;
  const dragHand = new Float64Array(3), dragFoot = new Float64Array(3);
  const THROW_SWING_TIME = 0.28, THROW_SETTLE_TIME = 0.2, THROW_CARRY_SPEED_MAX = 8;
  const clankerCaptures = [];
  let debugSelectedGorilla = null, debugMovementTerrain = null;
  const debugGorillaHighlights = [];
  const DEBUG_MOVE_HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0, normal: { x: 0, y: 0, z: 0 } };
  const DEBUG_GORILLA_HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0 };
  const debugGorillaTarget = owner => owner.kind === "clanker";
  const DEBUG_MOVE_LABELS = { planning: "Planning route", walking: "Walking", climbing: "Climbing", arrived: "Arrived", blocked: "Route blocked" };
  const clankerEquipment = [];
  const terrainSections = [], caveSections = [];
  // Above the island and its cave roofs; never interpolate from the renderer's
  // infinite/no-cut sentinel or the scan would happen only in its last frame.
  const CUTAWAY_TOP = 16, CUTAWAY_REGION_CAP = 8;
  const CUTAWAY_RAMP_START = 0.12, CUTAWAY_RAMP_END = 0.88;
  const CUTAWAY_FLOOR_RATE = 56, CUTAWAY_FLOOR_DEADBAND = 0.015;
  let cutawayHeight = NaN, cutawayFeet = 0, cutawayPlayer = null, cutawayHandoffPlayer = null;
  let cutawayX = 0, cutawayZ = 0, cutawayHeadY = 0, cutawayHill = false, cutawayPool = 0;
  let cutawayProgress = NaN, cutawayLevel = 0, cutawayHillMix = 0;
  let cutawayTravelRamp = null, cutawayTravelChannel = -1, cutawayTravelStation = 0;
  const CUTAWAY_PATH_STATE = { lo: new Uint16Array(4), hi: new Uint16Array(4), mix: new Float32Array(4), windowMix: new Float32Array(2), active: 0, version: 1 };
  const cutawayHiddenNodes = [];
  let cutawayPathBounds = null;
  const addTerrainSection = (source, parent, worldY = 0, region = null, sections = region ? caveSections : terrainSections) => {
    const cap = BL.terrainCutaway.create(source, renderer.releaseGeometry);
    addChild(parent, cap.node);
    const entry = { cap, worldY, region, targetY: region ? region.y : 0, paths: !region && !!source.cutawayPaths };
    sections.push(entry);
    return entry;
  };
  const cutawayHeightAt = (x, z) => {
    let y = RENDER_OPTS.cutawayMaxY;
    for (let i = 0; i < Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount); i++) {
      const r = RENDER_OPTS.cutawayRegions[i], dx = x - r.x, dz = z - r.z;
      if (Math.abs(dx * r.cos - dz * r.sin) < r.halfWidth && Math.abs(dx * r.sin + dz * r.cos) < r.halfDepth) y = Math.min(y, r.y);
    }
    const paths = island?.cutawayPaths;
    if (paths) {
      const gx = Math.floor((x - paths.origin.x) / paths.unit), gz = Math.floor((z - paths.origin.z) / paths.unit);
      if (gx >= 0 && gz >= 0 && gx < paths.width && gz < paths.height) {
        const cell = gx * paths.height + gz, key = paths.keys[cell];
        for (let channel = 0; channel < 4; channel++) {
          const station = key >>> (channel * 8) & 255, mix = CUTAWAY_PATH_STATE.mix[channel];
          if (station && mix > 0 && station >= CUTAWAY_PATH_STATE.lo[channel] && station <= CUTAWAY_PATH_STATE.hi[channel]) {
            y = Math.min(y, lerp(CUTAWAY_TOP, paths.bottoms[cell], mix));
          }
        }
      }
    }
    return y;
  };
  const cutawayPathsActive = () => CUTAWAY_PATH_STATE.mix[0] > 0 || CUTAWAY_PATH_STATE.mix[1] > 0
    || CUTAWAY_PATH_STATE.mix[2] > 0 || CUTAWAY_PATH_STATE.mix[3] > 0;
  const buildCutawayPathBounds = (paths) => {
    if (!paths) return null;
    const bounds = new Float64Array(4 * 5);
    for (let channel = 0; channel < 4; channel++) {
      const at = channel * 5;
      bounds[at] = bounds[at + 1] = bounds[at + 4] = Infinity;
      bounds[at + 2] = bounds[at + 3] = -Infinity;
    }
    for (let cell = 0; cell < paths.keys.length; cell++) {
      const key = paths.keys[cell]; if (!key) continue;
      const x = paths.origin.x + Math.floor(cell / paths.height) * paths.unit;
      const z = paths.origin.z + (cell % paths.height) * paths.unit;
      for (let channel = 0; channel < 4; channel++) {
        if (!(key >>> (channel * 8) & 255)) continue;
        const at = channel * 5;
        bounds[at] = Math.min(bounds[at], x); bounds[at + 1] = Math.min(bounds[at + 1], z);
        bounds[at + 2] = Math.max(bounds[at + 2], x + paths.unit); bounds[at + 3] = Math.max(bounds[at + 3], z + paths.unit);
        bounds[at + 4] = Math.min(bounds[at + 4], paths.bottoms[cell]);
      }
    }
    return bounds;
  };
  const cutawayPathMayCross = (cx, cy, cz, rx, ry, rz) => {
    if (!cutawayPathBounds) return false;
    for (let channel = 0; channel < 4; channel++) {
      const mix = CUTAWAY_PATH_STATE.mix[channel], at = channel * 5;
      if (mix <= 0 || CUTAWAY_PATH_STATE.lo[channel] > CUTAWAY_PATH_STATE.hi[channel]) continue;
      // Whole-channel cell bounds deliberately overestimate the live station
      // window. The exact vertex pass still decides every possible crossing.
      if (cy + ry + 1e-6 <= lerp(CUTAWAY_TOP, cutawayPathBounds[at + 4], mix)) continue;
      if (cx + rx >= cutawayPathBounds[at] - 1e-6 && cx - rx <= cutawayPathBounds[at + 2] + 1e-6
        && cz + rz >= cutawayPathBounds[at + 1] - 1e-6 && cz - rz <= cutawayPathBounds[at + 3] + 1e-6) return true;
    }
    return false;
  };
  const cutawayActorY = (region, y) => {
    const dx = cutawayX - region.x, dz = cutawayZ - region.z;
    return Math.abs(dx * region.cos - dz * region.sin) < region.halfWidth + PLAYER_RADIUS && Math.abs(dx * region.sin + dz * region.cos) < region.halfDepth + PLAYER_RADIUS
      ? Math.max(y, cutawayHeadY) : y;
  };
  const clearCutawayHidden = () => {
    for (let i = 0; i < cutawayHiddenNodes.length; i++) {
      const node = cutawayHiddenNodes[i];
      node.cameraHidden = node.cutawayCameraHidden;
      node.cutawayWholeHidden = false;
    }
    cutawayHiddenNodes.length = 0;
  };
  const hideForCutaway = (node) => {
    if (node.cutawayWholeHidden) return;
    node.cutawayCameraHidden = node.cameraHidden;
    node.cutawayWholeHidden = true;
    node.cameraHidden = true;
    cutawayHiddenNodes.push(node);
  };
  const nodeCrossesCutaway = (node) => {
    if (!node.visible) return false;
    const geometry = node.geometry, w = node.world;
    if (geometry && !geometry.cutawayPreserve) {
      const bounds = BL.scene.boundsOf(geometry), low = bounds.min, high = bounds.max;
      const lx = (low[0] + high[0]) * 0.5, ly = (low[1] + high[1]) * 0.5, lz = (low[2] + high[2]) * 0.5;
      const hx = (high[0] - low[0]) * 0.5, hy = (high[1] - low[1]) * 0.5, hz = (high[2] - low[2]) * 0.5;
      const cx = w[0] * lx + w[4] * ly + w[8] * lz + w[12], cz = w[2] * lx + w[6] * ly + w[10] * lz + w[14];
      const rx = Math.abs(w[0]) * hx + Math.abs(w[4]) * hy + Math.abs(w[8]) * hz;
      const rz = Math.abs(w[2]) * hx + Math.abs(w[6]) * hy + Math.abs(w[10]) * hz;
      const cy = w[1] * lx + w[5] * ly + w[9] * lz + w[13];
      const ry = Math.abs(w[1]) * hx + Math.abs(w[5]) * hy + Math.abs(w[9]) * hz;
      let mayCross = cy + ry > RENDER_OPTS.cutawayMaxY + 1e-6 || cutawayPathMayCross(cx, cy, cz, rx, ry, rz);
      for (let i = 0; !mayCross && i < Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount); i++) {
        const r = RENDER_OPTS.cutawayRegions[i], dx = cx - r.x, dz = cz - r.z;
        const across = dx * r.cos - dz * r.sin, along = dx * r.sin + dz * r.cos;
        const acrossReach = Math.abs(r.cos) * rx + Math.abs(r.sin) * rz;
        const alongReach = Math.abs(r.sin) * rx + Math.abs(r.cos) * rz;
        mayCross = cy + ry > r.y + 1e-6 && Math.abs(across) < r.halfWidth + acrossReach && Math.abs(along) < r.halfDepth + alongReach;
      }
      if (!mayCross) {
        for (let i = 0; i < node.children.length; i++) if (nodeCrossesCutaway(node.children[i])) return true;
        return false;
      }
      const vertices = geometry.verts;
      for (let i = 0; i < vertices.length; i += 3) {
        const x = w[0] * vertices[i] + w[4] * vertices[i + 1] + w[8] * vertices[i + 2] + w[12];
        const y = w[1] * vertices[i] + w[5] * vertices[i + 1] + w[9] * vertices[i + 2] + w[13];
        const z = w[2] * vertices[i] + w[6] * vertices[i + 1] + w[10] * vertices[i + 2] + w[14];
        if (y > cutawayHeightAt(x, z) + 1e-6) return true;
      }
    }
    for (let i = 0; i < node.children.length; i++) if (nodeCrossesCutaway(node.children[i])) return true;
    return false;
  };
  const hideNodeIfCut = (node) => {
    updateWorld(node, node.parent?.world || null);
    if (nodeCrossesCutaway(node)) hideForCutaway(node);
  };
  const updateCutawayWholeVisibility = () => {
    // Props and actors disappear as one object on the first frame that either
    // the global floor scan or a local aperture would remove their top.
    if (!RENDER_OPTS.birdsEyeCutaway || RENDER_OPTS.cutawayMaxY >= 1e5 && !RENDER_OPTS.cutawayRegionCount && !cutawayPathsActive()) return;
    for (let i = 0; i < crew.list.length; i++) hideNodeIfCut(crew.list[i].root);
    for (let i = 0; i < props.length; i++) hideNodeIfCut(props[i].node);
    for (let i = 0; i < crates.list.length; i++) hideNodeIfCut(crates.list[i].node);
    for (let i = 0; i < clankers.list.length; i++) hideNodeIfCut(clankers.list[i].root);
    for (let i = 0; i < clankerEquipment.length; i++) hideNodeIfCut(clankerEquipment[i].node);
    for (let i = 0; i < headquarters.mattresses.length; i++) hideNodeIfCut(headquarters.mattresses[i].node);
    for (let i = 0; i < headquarters.roomSigns.length; i++) hideNodeIfCut(headquarters.roomSigns[i].node);
    hideNodeIfCut(headquarters.firepit);
    for (let i = 0; i < crew.list.length; i++) {
      const drops = crew.list[i].stunGear.drops;
      for (let j = 0; j < drops.length; j++) if (drops[j].active && drops[j].node) hideNodeIfCut(drops[j].node);
    }
    if (magazine?.node) hideNodeIfCut(magazine.node);
  };
  const CLANKER_FIRE = [models.particleGeometry("#ff8a2a", 0.18, 1), models.particleGeometry("#ffc148", 0.16, 1)];
  const CLANKER_SMOKE = models.particleGeometry("#70685f", 0.2, 0);
  const CLANKER_HIT = { node: null, owner: null, type: "none", distance: Infinity, x: 0, y: 0, z: 0 };
  const CLANKER_CAVITY = { floor: 0, ceiling: 0, caveIndex: 0 };
  const JETPACK_HUD_STATE = { owned: false, equipped: false, fuel: 1, blocked: false };
  let enteringTween = null, factoryDeparting = false, bifrostDeparting = false, factoryHeld = false;
  // The walk through the Lightning Factory's shield (factoryGlide): which way, the Ooga it walks, how long it has
  // walked, where the Ooga stood the frame before, whether it is through, and the shield's light over the view.
  // Coming back out, the Ooga walks on until it is OUT_WALK metres out of the mouth.
  const FACTORY_WALK_IN = 1, FACTORY_WALK_OUT = 2, OUT_WALK = 2;
  // Once a walk is done the Ooga stands (`settle`) until the visitor lets go of moving, since the view has turned round
  // behind it and a key still held may now mean the other way.
  // Across the switch, `grab` takes the island's last frame as it hands the Ooga over, and `still` is the Factory's last
  // frame over the island's first (`hold` seconds full, then dissolving); `beat` is how long the Ooga still stands in
  // the shield before a slow switch.
  const factoryWalk = { phase: 0, cave: null, t: 0, x: 0, z: 0, seen: false, through: false, beat: 0, grab: false, still: 0, hold: 0, settle: false };
  // Tess, the island's guide, for the visit (`hub-guide.js`).
  let islandGuide = null;
  let reuseHub = false, heldHub = false, heldDebug = null;
  let stateTimer = 0, hintTimer = 0, now = 0, hour = 12, unsubscribeActivity = null, unsubscribeAccount = null, ownOogaClaimed = false;
  // The daylight inputs as last sampled; sampledDay starts at a never-true 0 so the first frame always samples.
  let sampledHour = 0, sampledDay = 0, sampledLatitude = NaN, sampledContinuousDay = 0, sampledUtcMs = 0;
  // How far under the Mempool island's ground the view is, 0 to 1: its sun and its storm stay outside.
  let poolShade = 0, poolUnder = 0;
  // Wake before the bridge; a wider sleep radius keeps its effects steady near the boundary.
  const POOL_EFFECTS_NEAR = 44, POOL_EFFECTS_FAR = 52;
  let poolEffectsActive = false, poolEffectsTime = 0;
  // The driven Ooga's own footsteps, heard by this page alone (footsteps.js).
  let footsteps = null;
  let weather = null, unsubscribeMempool = null, unsubscribeChain = null, mempoolIsland = null, timechainIsland = null, bifrostIsle = null;
  // Decorative motion follows the view or the driven character, with room between waking and resting.
  const effectPointNear = (p, x, y, z, radius2) => (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 <= radius2;
  const effectsActiveAt = (x, y, z, active, near, far) => {
    const radius = active ? far : near, radius2 = radius * radius;
    if (effectPointNear(camera.position, x, y, z, radius2) || effectPointNear(camera.target, x, y, z, radius2)) return true;
    const player = clankerPlay?.player || pilot?.player;
    return !!player && effectPointNear(player.root.position, x, y, z, radius2);
  };
  const updatePortalEffects = (phase, dt) => {
    const w = phase.node.world;
    phase.pause(!effectsActiveAt(w[12], w[13] + 1.5, w[14], !phase.paused, 24, 32));
    if (phase.paused) return false;
    phase.update(dt, phase.ripples.time + dt);
    return true;
  };
  const absorbCaveVeil = (ax, ay, az, point, dt) => {
    for (const veil of caveVeils) if (veil.phase.absorb(ax, ay, az, point, dt)) return true;
    return false;
  };
  // The two boards across the hole from the vine bridge, one reading the chain and one reading the
  // weather. Each holds its canvas, its panel node and the reading it last drew, so a snapshot saying
  // nothing new replaces no geometry.
  let chainSign = null;
  // The rainforest animals, by node, so a poke finds the one that was tapped.
  const beasts = new Map();
  const BEAST_CRIES = {
    jaguar: ["RRAAWR!", "*low growl*", "GRRR..."],
    monkey: ["OOK OOK!", "EEE EEE!", "*chatters*"],
    toucan: ["SQUAWK!", "KRRK-KRRK!", "*clacks beak*"]
  };
  let positionDebugNext = 0, positionDebugJSON = "", positionDebugState = "";
  function createPositionPose() {
    return {
      version: 1, character: "", mode: "detached", closeWanted: false, combat: false, birdsEyeNorthUp: false, position: [0, 0, 0], target: [0, 0, -1], direction: [0, 0, -1], up: [0, 1, 0], fov: 48 * Math.PI / 180,
      actor: [0, 0, 0], body: [0, 0, 0], head: [0, 0, 0], bodyQuaternion: [0, 0, 0, 1], headQuaternion: [0, 0, 0, 1], bodyRolled: false, headRolled: false,
      orbit: [0, 0.62, 6, 0, 0, 0], headOffset: [0, 0, 0], headOrbit: false, shoulderSide: 0.6, closeMix: 0, ads: 0,
      selectedSlot: 1, ammo: 30, unlimited: false, magazines: [0, 0], magazineCount: 0, aimYaw: 0, aimPitch: 0, jetpack: false, fuel: 1, hop: 0, hopV: 0, lift: 0
    };
  }
  function readPositionPose(value) {
    if (!value || value.length > 8192) return null;
    let data;
    try { data = JSON.parse(value); } catch { return null; }
    if (!data || data.version !== 1 || !["carry", "shoulder", "first-person", "orbit", "birds-eye", "detached", "eye-level"].includes(data.mode)) return null;
    if (data.closeWanted === undefined) data.closeWanted = data.mode === "first-person" || data.mode === "eye-level" || data.mode === "detached" && data.closeMix >= 0.5;
    // Replay URLs written before combat/birds-eye remain readable at this boundary.
    if (data.combat === undefined) data.combat = data.battle ?? (data.mode === "shoulder" || data.mode === "first-person" || data.mode === "birds-eye");
    if (data.birdsEyeNorthUp === undefined) data.birdsEyeNorthUp = false;
    const pose = createPositionPose();
    for (const key of Object.keys(pose)) {
      const supplied = data[key], target = pose[key];
      if (Array.isArray(target)) {
        if (!Array.isArray(supplied) || supplied.length !== target.length || !supplied.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100000)) return null;
        for (let i = 0; i < target.length; i++) target[i] = supplied[i];
      } else if (typeof target === "number") {
        if (!Number.isFinite(supplied) || Math.abs(supplied) > 100000) return null;
        pose[key] = supplied;
      } else if (typeof supplied !== typeof target) return null;
      else pose[key] = supplied;
    }
    // Projection fields are optional for older replay URLs.
    if (data.orthoMix !== undefined) {
      if (!Number.isFinite(data.orthoMix)) return null;
      pose.orthoMix = clamp(data.orthoMix, 0, 1);
    }
    if (data.orthoHeight !== undefined) {
      if (!Number.isFinite(data.orthoHeight) || data.orthoHeight < 0 || data.orthoHeight > 1000) return null;
      pose.orthoHeight = data.orthoHeight;
    }
    if (pose.character.length > 80 || pose.fov <= 0.05 || pose.fov >= Math.PI || pose.orbit[2] <= 0 || pose.orbit[2] > 200) return null;
    if (Math.hypot(...pose.up) < 0.001 || Math.hypot(...pose.bodyQuaternion) < 0.001 || Math.hypot(...pose.headQuaternion) < 0.001) return null;
    const dx = pose.target[0] - pose.position[0], dy = pose.target[1] - pose.position[1], dz = pose.target[2] - pose.position[2];
    if (Math.hypot(dx, dy, dz) < 0.001 || Math.hypot(dy * pose.up[2] - dz * pose.up[1], dz * pose.up[0] - dx * pose.up[2], dx * pose.up[1] - dy * pose.up[0]) < 1e-6) return null;
    for (const rotation of [pose.bodyQuaternion, pose.headQuaternion]) { const length = Math.hypot(...rotation); for (let i = 0; i < 4; i++) rotation[i] /= length; }
    pose.closeMix = clamp(pose.closeMix, 0, 1); pose.ads = clamp(pose.ads, 0, 1); pose.fuel = clamp(pose.fuel, 0, 1);
    pose.ammo = clamp(Math.floor(pose.ammo), 0, 30); pose.magazineCount = clamp(Math.floor(pose.magazineCount), 0, 2);
    return pose;
  }
  const POSITION_POSE = createPositionPose();
  const positionVector = key => {
    const value = params.get(key);
    if (!value || value.length > 100) return null;
    const parts = value.split(",");
    if (parts.length !== 3 || parts.some(part => !part.trim())) return null;
    const numbers = parts.map(Number);
    return numbers.every(n => Number.isFinite(n) && Math.abs(n) <= 10000) ? numbers : null;
  };
  const positionText = value => value.map(n => n.toFixed(5)).join(",");
  let phase = null;
  const updatePositionDebug = (force = false) => {
    if (!positionDebug || !camera || !pilot) return;
    pilot.capturePose(POSITION_POSE);
    const p = camera.position, t = camera.target, up = camera.up;
    const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
    const inverseLength = 1 / Math.max(1e-12, Math.hypot(dx, dy, dz));
    POSITION_POSE.position[0] = p.x; POSITION_POSE.position[1] = p.y; POSITION_POSE.position[2] = p.z;
    POSITION_POSE.target[0] = t.x; POSITION_POSE.target[1] = t.y; POSITION_POSE.target[2] = t.z;
    POSITION_POSE.direction[0] = dx * inverseLength; POSITION_POSE.direction[1] = dy * inverseLength; POSITION_POSE.direction[2] = dz * inverseLength;
    POSITION_POSE.up[0] = up ? up.x : 0; POSITION_POSE.up[1] = up ? up.y : 1; POSITION_POSE.up[2] = up ? up.z : 0;
    POSITION_POSE.fov = camera.fov;
    const json = JSON.stringify(POSITION_POSE);
    const gorilla = clankerPlay && clankerPlay.player, g = gorilla && gorilla.root.position;
    const state = gorilla ? `${json}|${gorilla.owner.traits.name}|${clankerPlay.view}|${clankerPlay.combat}|${g.x},${g.y},${g.z},${gorilla.heading}` : json;
    if (!force && state === positionDebugState) return;
    positionDebugState = state;
    positionDebugJSON = json;
    positionDebug.dataset.pose = json;
    positionDebug.dataset.copied = "false";
    if (gorilla) {
      positionDebug.textContent = `gorilla-${gorilla.owner.traits.name} · mode=${clankerPlay.view} · ${clankerPlay.combat ? "combat" : "carry"}`
        + `\npos=${g.x.toFixed(5)},${g.y.toFixed(5)},${g.z.toFixed(5)}  heading=${gorilla.heading.toFixed(5)} (rad)`
        + `\ncamera=${positionText(POSITION_POSE.position)}`
        + `\nlook=${positionText(POSITION_POSE.target)}  dir=${positionText(POSITION_POSE.direction)}`
        + `\nclick to copy gorilla position URL`;
      positionDebug.setAttribute("aria-label", "Debug gorilla and camera state. Click to copy a gorilla position URL.");
      return;
    }
    positionDebug.setAttribute("aria-label", "Debug character and camera state. Click to copy an exact replay URL.");
    const pose = POSITION_POSE, first = pose.mode === "first-person";
    positionDebug.textContent = `${pose.character || "free camera"} · mode=${pose.mode}${pose.character ? ` · ${pose.combat ? "combat" : "carry"} · weapon=${pose.selectedSlot} ammo=${pose.unlimited ? "unlimited" : pose.ammo}` : ""}`
      + (pose.character ? `\npos=${positionText(pose.actor)}\nbody=${positionText(pose.body)}  head=${positionText(pose.head)} (rad)` : "")
      + (first ? "" : `\ncamera=${positionText(pose.position)}`)
      + `\nlook=${positionText(pose.target)}  dir=${positionText(pose.direction)}`
      + `\n${pilot.poseHeld ? "Restored pose · move/look to resume · " : ""}click to copy exact replay URL`;
  };
  const copyPositionDebug = () => {
    updatePositionDebug(true);
    const url = new URL(location.href);
    for (const key of ["pos", "body", "head", "camera", "look", "mode", "combat", "battle", "firstperson", "weapon", "ammo", "view", "jetpack", "mag"]) url.searchParams.delete(key);
    url.searchParams.set("debug", "1");
    const gorilla = clankerPlay && clankerPlay.player;
    if (gorilla) {
      url.searchParams.set("character", `gorilla-${gorilla.owner.traits.name}`);
      const p = gorilla.root.position;
      url.searchParams.set("pos", `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`);
      url.searchParams.delete("pose");
    } else {
      if (POSITION_POSE.character) url.searchParams.set("character", POSITION_POSE.character);
      else url.searchParams.delete("character");
      url.searchParams.set("pose", positionDebugJSON);
    }
    const value = url.href;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).catch(() => { });
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
  const restorePositionDebug = () => {
    if (!DEBUG) return;
    const position = positionVector("pos"), body = positionVector("body"), head = positionVector("head");
    let eye = positionVector("camera"), look = positionVector("look");
    const mode = ["carry", "shoulder", "first-person", "orbit", "birds-eye", "detached", "eye-level"].includes(preloadedMode) ? preloadedMode : null;
    if (!preloadedPose && !position && !body && !head && !eye && !look && !mode && !params.has("combat") && !params.has("battle")) return;
    const pose = preloadedPose || pilot.capturePose(createPositionPose()), cave = pilot.player;
    const combatParam = params.get("combat") ?? params.get("battle");
    if (combatParam !== null) pose.combat = combatParam !== "0" && combatParam !== "false";
    if (preloadedPose && cave) {
      crew.configureWeapon(cave, pose.selectedSlot, pose.ammo, pose.unlimited);
      crew.removeMagazines(cave);
      for (let i = 0; i < pose.magazineCount; i++) crew.collectMagazine(cave);
      for (let i = 0; i < pose.magazineCount; i++) cave.weapon.spareAmmo[i] = clamp(Math.floor(pose.magazines[i]), 0, 30);
      if (cave.jet) cave.jetFuel = pose.fuel;
    }
    if (position && cave) {
      for (let i = 0; i < 3; i++) { const delta = position[i] - pose.actor[i]; pose.position[i] += delta; pose.target[i] += delta; pose.orbit[i + 3] += delta; pose.actor[i] = position[i]; }
    }
    if (body) { pose.body = body; pose.bodyRolled = false; }
    if (head) { pose.head = head; pose.headRolled = false; }
    const candidateEye = eye || pose.position, candidateLook = look || pose.target;
    const dx = candidateLook[0] - candidateEye[0], dy = candidateLook[1] - candidateEye[1], dz = candidateLook[2] - candidateEye[2];
    if (Math.hypot(dx, dy, dz) < 0.001) eye = look = null;
    else if (Math.hypot(dy * pose.up[2] - dz * pose.up[1], dz * pose.up[0] - dx * pose.up[2], dx * pose.up[1] - dy * pose.up[0]) < 1e-6) {
      // A manually requested vertical debug view needs a horizontal up axis.
      pose.up[0] = 0; pose.up[1] = Math.abs(dy) < Math.hypot(dx, dy, dz) * 0.9 ? 1 : 0; pose.up[2] = pose.up[1] ? 0 : 1;
    }
    if (eye) pose.position = eye;
    if (look && Math.hypot(look[0] - pose.position[0], look[1] - pose.position[1], look[2] - pose.position[2]) > 0.001) pose.target = look;
    if (mode) {
      pose.mode = mode;
      if (params.has("mode")) pose.closeWanted = mode === "first-person" || mode === "eye-level";
      if (mode === "birds-eye") {
        pose.combat = true;
        if (!preloadedPose && !eye && !look) pose.orbit[2] = BIRDS_EYE_MIN;
      }
    }
    if (!cave && (pose.mode === "carry" || pose.mode === "shoulder" || pose.mode === "first-person" || pose.mode === "birds-eye")) pose.mode = pose.mode === "first-person" ? "eye-level" : "detached";
    if (!preloadedPose) {
      pose.closeMix = pose.closeWanted ? 1 : 0;
      if (eye || look) {
        const dx = pose.position[0] - pose.target[0], dy = pose.position[1] - pose.target[1], dz = pose.position[2] - pose.target[2];
        pose.orbit[0] = Math.atan2(dx, dz); pose.orbit[1] = Math.atan2(dy, Math.hypot(dx, dz));
        pose.orbit[2] = Math.max(0.1, Math.hypot(dx, dy, dz));
        for (let i = 0; i < 3; i++) pose.orbit[i + 3] = pose.target[i];
      } else if (body || head) {
        pose.orbit[0] = pose.body[1] + pose.head[1] + Math.PI;
        if (pose.mode === "first-person" || pose.mode === "shoulder") pose.orbit[1] = pose.head[0];
      }
    }
    if (!preloadedPose || params.has("mode")) {
      pose.orthoMix = (pose.mode === "birds-eye" || pose.mode === "orbit" && pose.combat) ? 1 : 0;
      pose.orthoHeight = 2 * Math.tan(pose.fov / 2) * pose.orbit[2];
    }
    pilot.restorePose(pose, !!preloadedPose || !!eye || !!look);
    updatePositionDebug(true);
  };
  const placed = [];
  const targets = [];
  const claimed = [];
  const clouds = [];
  const lamps = [];
  // updateLamps' selection and light array are a pure function of these inputs; an exact hit reuses
  // last frame's written LIGHT_CAPACITY entries. Position joins target because the headquarters
  // basement reads both. Invalidated in leave; NaN fields never compare equal.
  const LAMP_SEL_KEY = { tx: NaN, ty: NaN, tz: NaN, px: NaN, py: NaN, pz: NaN, torch: NaN, lampFactor: NaN, poolShade: NaN, poolUnder: NaN, lanternsOn: false, coilActive: false, cave: 0, limit: -1 };
  let lampSelValid = false;
  const fireSeats = [];
  const fireHazards = [];
  let clankerFireReachable = null;
  const workZones = [];
  // Every open cave's doorway, { x, z, sr, cr }, kept clear of the meadow's props (`entranceClear`).
  const entranceZones = [];
  const closedCaveZones = [];
  const sleepers = [];
  const labels = [];
  const signDetails = [];
  const spots = [];
  const chillSpots = [];
  const headquartersRimLintels = [];
  const climbMasonry = [];
  const props = [];
  const scenery = [];
  const sceneryClaims = [];
  const matrixGates = [];
  const sealedCaves = [];
  // Mouths without a specialized portal share the lab's transparent contact veil.
  const caveVeils = [], ARCADE_VEIL_TINT = [1, 0.16, 0.12];
  let sceneryVisible = 0, sceneryRadiusCulled = 0, sceneryPathCulled = 0, sceneryFixedCulled = 0, sceneryReflows = 0;
  const addTarget = (node, owner, opts) => {
    input.add(node, owner, opts);
    targets.push(node);
  };
  const removeTarget = (node) => { input.remove(node); drop(targets, node); };
  // Poking the set dressing. Every piece a baked set placed (`baked.picks`) gets a pick sphere on a node kept off
  // the scene graph, over one shared faceless geometry: never drawn, never baked into outlines or the GPU, and
  // released with the visit's other targets. `toWorld` maps a piece's set coordinates to the island, or null to
  // leave it out (the furniture inside a mouth belongs to the cave, not the facade).
  const PICK_GEOMETRY = { verts: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], faces: [], lines: [] };
  const addPieceTargets = (picks, toWorld) => {
    for (let i = 0; i < picks.length; i += 6) {
      const at = toWorld(picks[i + 2], picks[i + 3], picks[i + 4], picks[i]);
      if (!at) continue;
      const node = createNode({ position: at, geometry: PICK_GEOMETRY });
      BL.scene.updateWorld(node);
      addTarget(node, { kind: "piece", piece: picks[i], variant: picks[i + 1], node, x: at.x, y: at.y, z: at.z, next: 0, weaponType: "none" }, { radius: Math.max(0.35, picks[i + 5]) });
    }
  };
  // What each piece says when poked: its tooltip, the particles it throws and the lines it answers with.
  const PIECES = {
    lanternPost: ["Lantern post", "spark", ["The lantern swings. Ooga squints.", "Warm glass. Ooga licks a finger."]],
    crate: ["Crate", "dust", ["Nailed shut. Ooga knocks anyway.", "Something rattles inside."]],
    coalCrate: ["Coal crate", "dust", ["Coal for the Lightning Factory.", "Ooga gets coal on its nose."]],
    barrel: ["Barrel", "dust", ["Sloshes. Ooga drank half.", "Smells like banana brew."]],
    cart: ["Ore cart", "chip", ["The wheels squeak.", "Full of shiny rocks."]],
    banner: ["Banner", "dust", ["The banner flaps.", "Ooga salutes the banner."]],
    die: ["Big die · roll it", "dust", null],
    flaskBench: ["Flasks", "spark", ["Bubbles. Ooga does not drink it.", "It fizzes. Science!"]],
    terminal: ["Terminal", "spark", ["beep boop", "It prints random numbers. Ooga approves."]],
    chalkboard: ["Chalkboard · write or erase", "dust", null],
    monolith: ["Monolith", "spark", ["The glyphs hum.", "Cold stone. It watches back."]],
    runeStone: ["Rune stone", "spark", ["The rune glows at Ooga."]],
    coil: ["Coil · zap", "spark", ["ZAP!", "Ooga's fur stands on end."]],
    gauge: ["Gauge", "spark", ["The needle twitches.", "Pressure high. Ooga fine."]],
    rubble: ["Rubble", "chip", ["Loose rocks.", "Ooga kicks a pebble."]],
    bench: ["Log bench", "dust", ["A good log for sitting."]],
    cabinet: ["Arcade cabinet", "spark", ["PRESS START. Ooga presses everything.", "The games are inside. Ooga points."]],
    vine: ["Vines", "leaf", ["The vines swing.", "Rustle rustle."]],
    boards: ["Boarded up · coming soon", "dust", ["Boarded up. Coming soon.", "Ooga peeks through a gap. Dark."]],
    abacus: ["Abacus", "dust", ["Clack clack. Ooga counts to banana.", "The beads slide. Every banana counted."]],
    ledger: ["Ledger · keep receipts", "dust", ["Every banana in, every banana out.", "Ooga signs the receipt with a thumb."]]
  };
  const PIECE_BURST = { spark: SPARK, dust: DUST, chip: CHIP, leaf: LEAF };
  const pokePiece = (o) => {
    if (now < o.next) return;
    o.next = now + 0.6;
    const words = PIECES[o.piece];
    if (!words) return;
    fx.burst(o.x, o.y, o.z, words[1] === "spark" ? 10 : 7, [PIECE_BURST[words[1]]], 1.3);
    // A throwaway roll: nothing rides on it, so Math.random is fine here.
    hud.toast(words[2] ? words[2][fnv1a(`${o.piece}/${Math.floor(now * 2)}`) % words[2].length] : `Ooga rolls the big die: ${1 + Math.floor(Math.random() * 6)}!`);
  };
  const clampDrag = (p) => {
    const max = island.meadowRadius - 0.5, r = Math.hypot(p.x, p.z);
    if (r > max) {
      p.x *= max / r;
      p.z *= max / r;
    }
    return p;
  };

  const buildMatrixPortal = (m) => {
    const cr = Math.cos(m.ry), sr = Math.sin(m.ry);
    return {
      inside: false, previousValid: false, previousX: 0, previousY: 0, previousZ: 0,
      lastCrossingDirection: "none",
      plane: { center: { x: m.x + sr * PORTAL_Z, y: m.floorY + 1.5, z: m.z + cr * PORTAL_Z }, normal: { x: sr, y: 0, z: cr } },
      opening: { minX: PORTAL_MIN_X, maxX: PORTAL_MAX_X, minY: PORTAL_MIN_Y, maxY: PORTAL_MAX_Y, planeZ: PORTAL_Z },
      rejected: { above: 0, below: 0, beside: 0 }
    };
  };
  // Camera ramp ownership still needs these faces after retiring the glyph layouts.
  const islandFaceIndex = () => {
    if (island.faceIndex) return island.faceIndex;
    const ramps = island.geometry.faces.filter(face => face.headquartersRamp || face.headquartersBasementRamp);
    return island.faceIndex = { ramps };
  };
  const MATRIX_CAMERA_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const cameraInsideMirror = () => {
    if (!matrixCave) return false;
    const eye = camera.position, m = matrixCave.mouth;
    if ((eye.x - m.x) * matrixCave.sr + (eye.z - m.z) * matrixCave.cr >= PORTAL_Z) return false;
    return island.cavityAt(eye.x, eye.z, MATRIX_CAMERA_COLUMN, matrixCave.caveIndex, eye.y)
      && MATRIX_CAMERA_COLUMN.caveIndex === matrixCave.caveIndex
      && eye.y >= MATRIX_CAMERA_COLUMN.floor && eye.y < MATRIX_CAMERA_COLUMN.ceiling;
  };
  const inMatrixCave = () => {
    return !!matrixCave && matrixCave.portal.inside;
  };
  const matrixOverlayVisible = (x, y, z) => {
    if (RENDER_OPTS.birdsEyeCutaway) return y <= cutawayHeightAt(x, z);
    if (!matrixCave || !matrixCave.portal.inside) return true;
    const m = matrixCave.mouth;
    const cdx = camera.position.x - m.x, cdz = camera.position.z - m.z;
    const tdx = x - m.x, tdz = z - m.z;
    const cx = matrixCave.cr * cdx - matrixCave.sr * cdz;
    const cz = matrixCave.sr * cdx + matrixCave.cr * cdz;
    const tx = matrixCave.cr * tdx - matrixCave.sr * tdz;
    const tz = matrixCave.sr * tdx + matrixCave.cr * tdz;
    if (tz <= 0.5) return true;
    const amount = (0.5 - cz) / (tz - cz);
    if (amount <= 0 || amount >= 1) return false;
    const ix = cx + (tx - cx) * amount;
    const iy = camera.position.y - m.floorY + (y - camera.position.y) * amount;
    return ix >= PORTAL_MIN_X && ix <= PORTAL_MAX_X && iy >= PORTAL_MIN_Y && iy <= PORTAL_MAX_Y;
  };
  const SLEEP_SCREEN = { x: 0, y: 0, depth: 0 };
  let sleepSightFrame = 0, sleepSightSince = Infinity;
  const SLEEP_SIGHT_VIEW = new Float64Array(12);
  let sleepSightMode = null, sleepSightGorilla = false;
  const advanceSleepSight = (dt) => {
    sleepSightSince += Math.max(0, dt);
    const p = camera.position, t = camera.target, view = SLEEP_SIGHT_VIEW;
    const changed = pilot.mode !== sleepSightMode || !!clankerPlay.active !== sleepSightGorilla
      || camera.near !== view[6] || camera.fov !== view[7] || renderer.size.width !== view[8] || renderer.size.height !== view[9]
      || +RENDER_OPTS.birdsEyeCutaway !== view[10] || +matrixCave.portal.inside !== view[11]
      || Math.hypot(p.x - view[0], p.y - view[1], p.z - view[2]) > 1
      || Math.hypot(t.x - view[3], t.y - view[4], t.z - view[5]) > 1;
    if (dt !== 0 && !changed && sleepSightSince < 1 / SIGHT_RECOMPUTE_HZ) return;
    sleepSightFrame++; sleepSightSince = 0; sleepSightMode = pilot.mode; sleepSightGorilla = !!clankerPlay.active;
    view[0] = p.x; view[1] = p.y; view[2] = p.z; view[3] = t.x; view[4] = t.y; view[5] = t.z;
    view[6] = camera.near; view[7] = camera.fov; view[8] = renderer.size.width; view[9] = renderer.size.height;
    view[10] = +RENDER_OPTS.birdsEyeCutaway; view[11] = +matrixCave.portal.inside;
  };
  const sleepSightAt = (x, y, z) => {
    if (!matrixOverlayVisible(x, y, z)) return false;
    const screen = renderer.project(x, y, z, SLEEP_SCREEN);
    if (!screen || screen.x < 0 || screen.y < 0 || screen.x > renderer.size.width || screen.y > renderer.size.height) return false;
    const eye = camera.position, dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
    if (!entranceSegmentClear(eye.x, eye.y, eye.z, x, y, z, 0.002) || !bedSegmentClear(eye.x, eye.y, eye.z, x, y, z, 0.002, 0.004)) return false;
    // Short exact sweeps keep long sight rays from scanning an island-sized box.
    // The point checks also include the continuous ramp surfaces.
    const distance = Math.hypot(dx, dy, dz);
    const outside = Math.max(0, Math.hypot(eye.x, eye.y, eye.z) - Math.hypot(island.radius, island.undersideDepth, terrain.MAX_HEIGHT) - island.unit);
    const start = Math.min(1, outside / Math.max(distance, 1e-7));
    // The pieces are walked from the sleeper back toward the eye: a mark indoors is usually blocked near it, and the
    // answer is the same in either order.
    const steps = Math.max(1, Math.ceil(distance * (1 - start) / (island.unit * 0.5)));
    const last = start + (1 - start) * steps / steps;
    let nx = eye.x + dx * last, ny = eye.y + dy * last, nz = eye.z + dz * last;
    for (let i = steps - 1; i >= 0; i--) {
      const k = start + (1 - start) * i / steps, px = eye.x + dx * k, py = eye.y + dy * k, pz = eye.z + dz * k;
      if (!island.clearAt(nx, ny, nz, 0.002, 0.004) || !island.voxelSegmentClearAt(px, py, pz, nx, ny, nz, 0.002, 0.004)) return false;
      nx = px; ny = py; nz = pz;
    }
    return true;
  };
  const sleepOpeningVisible = (x, y, z, cr, sr, halfWidth, halfHeight) => {
    if (sleepSightAt(x, y, z)) return true;
    for (let i = 0; i < 4; i++) {
      const across = (i & 1 ? 1 : -1) * halfWidth, lift = (i & 2 ? 1 : -1) * halfHeight;
      if (sleepSightAt(x + cr * across, y + lift, z + sr * across)) return true;
    }
    return false;
  };
  const sleepMarksVisible = (cave, x, y, z, mark = null) => {
    // Nobody's sleep is seen through the Mempool island's rock: not from the tunnels and the chamber inside it,
    // and not a gorilla's in its nest from under the island or beyond its cliffs.
    if (poolShade > 0.5) return false;
    if (mempoolIsland?.billboardOccludes(camera.position.x, camera.position.y, camera.position.z, x, y, z)) return false;
    if (!cave) {
      if (mark && mark.sightFrame === sleepSightFrame) return mark.sightVisible;
      const visible = sleepSightAt(x, y, z) && mempoolIsland.sightClear(camera.position.x, camera.position.y, camera.position.z, x, y, z);
      if (mark) { mark.sightFrame = sleepSightFrame; mark.sightVisible = visible; }
      return visible;
    }
    const bed = cave.bedroll;
    if (cave.state !== "sleeping" || cave.bedTravel.mode !== "rest" || !bed || bed.sleeper !== cave) return false;
    if (bed.sightFrame === sleepSightFrame && bed.sightActor === cave.index) return bed.sightVisible;
    bed.sightFrame = sleepSightFrame; bed.sightActor = cave.index;
    const head = cave.sleepHead, body = cave.root.position, room = bed.room, window = bed.window;
    bed.sightVisible = sleepSightAt(head.x, head.y, head.z) || sleepSightAt(body.x, body.y, body.z)
      || !bed.outdoor && sleepOpeningVisible(room.entrance.x, room.floor + 1.8, room.entrance.z, bed.cr, -bed.sr, (room.corridorWidth ?? room.width - 1.3) * 0.35, 1.1)
      || !!window && sleepOpeningVisible(window.x, window.y, window.z, Math.cos(window.angle), Math.sin(window.angle), window.width * 0.35, window.height * 0.35);
    return bed.sightVisible;
  };
  const viewInsideMatrix = (lookOut = false) => {
    const m = matrixCave.mouth, targetZ = lookOut ? 0.45 : -5.45;
    const target = { x: m.x + matrixCave.sr * targetZ, y: m.floorY + 1.75, z: m.z + matrixCave.cr * targetZ };
    const orbit = pilot.orbit, yaw = m.ry + (lookOut ? Math.PI : 0);
    if (!matrixCave.portal.inside) {
      setCameraCave(0);
      setVec(CAMERA_PREVIOUS, m.x + matrixCave.sr * (PORTAL_Z + 0.01), m.floorY + 1.75, m.z + matrixCave.cr * (PORTAL_Z + 0.01));
      cameraPreviousValid = true;
    }
    orbit.target = target;
    orbit.tx = target.x;
    orbit.ty = target.y;
    orbit.tz = target.z;
    orbit.yaw = orbit.tYaw = yaw;
    orbit.pitch = orbit.tPitch = 0.08;
    orbit.dist = orbit.tDist = 3.5;
    pilot.update(0.1);
  };
  const viewMatrixApproach = () => {
    const m = matrixCave.mouth;
    const target = { x: m.x + matrixCave.sr * 0.5, y: m.floorY + 1.5, z: m.z + matrixCave.cr * 0.5 };
    const orbit = pilot.orbit;
    orbit.target = target;
    orbit.tx = target.x;
    orbit.ty = target.y;
    orbit.tz = target.z;
    orbit.yaw = orbit.tYaw = m.ry;
    orbit.pitch = orbit.tPitch = 0.08;
    orbit.dist = orbit.tDist = 12;
    pilot.update(0.1);
  };

  const addProp = (kind, node, x, z, radius) => {
    const owner = { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: radius, active: true };
    if (SCREEN_CULL_PROPS.has(kind)) node.screenCull = true;
    if (kind === "tree" || kind === "bush" || kind === "flower" || kind === "grass" || kind === "palm") owner.weaponType = "none";
    if (kind === "tree" || kind === "palm") node.npcTreeSupport = true;
    if (kind === "tree" || kind === "palm" || kind === "canopy") node.ragePass = true;
    addTarget(node, owner, { radius });
    props.push(owner);
    if (CLANKER_STEP_PROPS.has(kind)) {
      const bounds = BL.scene.boundsOf(node.geometry.collisionGeometry || node.geometry);
      if (bounds.max[1] - bounds.min[1] <= BL.clankers.PROP_STEP) {
        node.gorillaSteps = [[bounds.min[0], bounds.min[1], bounds.min[2], bounds.max[0], bounds.max[1], bounds.max[2]]];
        node.gorillaStepAll = true;
      }
    }
    if (SOLID_PROPS.has(kind)) solids.add(node);
    return owner;
  };
  const place = (geometry, x, z, ry = 0, y = island.surfaceAt(x, z), kind = null, radius = 0) => {
    const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 }, geometry, matrixLiving: MATRIX_LIVING_PROPS.has(kind) });
    addChild(root, node);
    placed.push(node);
    if (kind) addProp(kind, node, x, z, radius);
    return node;
  };
  const claim = (x, z, r) => {
    const value = { x, z, r, scenery: null };
    claimed.push(value);
    return value;
  };
  const free = (x, z, r) => {
    for (const c of claimed) {
      const dx = c.x - x, dz = c.z - z, reach = c.r + r;
      // Rejection sampling checks thousands of distant footprints. Keep the
      // original circular predicate for nearby and boundary candidates.
      if (Number.isFinite(reach) && reach >= 0
        && (Math.abs(dx) > reach + 1e-12 || Math.abs(dz) > reach + 1e-12)) continue;
      if (Math.hypot(dx, dz) < reach) return false;
    }
    return true;
  };
  const nearPath = (x, z, d) => {
    if (island.isPath(x, z)) return true;
    for (let i = 0; i < 16; i++) {
      const c = Math.cos(i / 16 * Math.PI * 2), s = Math.sin(i / 16 * Math.PI * 2);
      if (island.isPath(x + c * d, z + s * d) || island.isPath(x + c * d / 2, z + s * d / 2)) return true;
    }
    return false;
  };
  const nearMouth = (x, z, d) => {
    for (const m of island.mouths) if (Math.hypot(m.x - x, m.z - z) < d) return true;
    return false;
  };
  // A repository's crowd fills a fan of firing rows four abreast (`position` in the work sites: rows from 4.8 m out,
  // 1.35 m apart, each side set back by 0.32 of its distance from the axis, out to 4.15 m). Keep the first
  // WORK_CLEAR_ROWS of them clear of scenery, as the pile grows; a bigger crowd takes the next free
  // places among the props, and `entranceClear` keeps the doorway itself open. Reserving every row the whole roster
  // could fill (twelve for 46 Oogas) and a walking detour round them emptied the north of the meadow.
  const WORK_CLEAR_ROWS = 2;
  const workSceneryClear = (x, z, radius) => {
    const row = Math.max(0, Math.min(WORK_CLEAR_ROWS, Math.ceil(contributors.activeRoster.length / 4)) - 1);
    const front = 4.8 + row * 1.35 + 4.15 * 0.32, margin = radius + PLAYER_RADIUS;
    for (let i = 0; i < workZones.length; i++) {
      const zone = workZones[i], dx = x - zone.x, dz = z - zone.z;
      const across = Math.abs(dx * zone.cr - dz * zone.sr), along = dx * zone.sr + dz * zone.cr;
      if (across < 4.15 + margin && along > 2.8 - margin && along < front + margin) return false;
    }
    return true;
  };
  // Bushes stand back from every open cave's doorway, the arcade's included:
  // ENTRANCE_HALF either side of its axis and ENTRANCE_DEPTH out from its mouth.
  const ENTRANCE_HALF = 4, ENTRANCE_DEPTH = 7;
  const entranceClear = (x, z, radius) => {
    for (let i = 0; i < entranceZones.length; i++) {
      const zone = entranceZones[i], dx = x - zone.x, dz = z - zone.z;
      if (Math.abs(dx * zone.cr - dz * zone.sr) < ENTRANCE_HALF + radius && dx * zone.sr + dz * zone.cr < ENTRANCE_DEPTH + radius) return false;
    }
    return true;
  };
  // Keep fixed stores and constructed equipment out of the three lamps' full travel corridors.
  // Foliage yields to their current claims when the pile grows or shrinks.
  const pilePostCorridorClear = (x, z, radius) => {
    for (const degrees of PILE_POST_DEGREES) {
      const s = Math.sin(degrees * DEG), c = Math.cos(degrees * DEG);
      if (x * s - z * c > 0 && Math.abs(x * c + z * s) < radius + 0.7) return false;
    }
    return true;
  };
  const spotAt = (deg, r, margin) => {
    for (const off of NUDGES) {
      const p = polar(deg + off, r);
      if (!nearPath(p.x, p.z, margin) && island.surfaceAt(p.x, p.z) === 0
        && pilePostCorridorClear(p.x, p.z, margin) && free(p.x, p.z, margin)) return p;
    }
    return null;
  };
  // How many point-light slots the lamps took when last chosen (the selection is cached; the hunt's lanterns follow).
  let lampLights = 0;
  const addLamp = (node, kind, x, y, z, light = true, order = lamps.length, id = `lamp:${lamps.length}`) => {
    node.glow = LAMP_OFF;
    node.flare = 0;
    const lamp = { node, kind, x, y, z, light, order, id, k: 0, lit: false, selected: false, approximated: false, debug: null, reach: 0, fade: 1, fromX: x, fromY: y, fromZ: z, gain: 1, far: false, slot: 0 };
    lamps.push(lamp);
    return lamp;
  };
  const updateLamps = (dt, elapsed, spark) => {
    const lights = RENDER_OPTS.lights;
    const webgl = renderer.kind === "webgl2";
    // HALLOWEEN: through the hunt's night a few slots are kept back for the hunters' lanterns (a quarter of the tier's
    // at most), filled after the lamps; a change in how many is a new key, so the lamps are chosen again.
    const tierLimit = webgl ? BL.glRenderer.QUALITY[renderer.quality].lights : 6;
    const reserved = ghosts ? Math.min(ghosts.lanternsWanted(), Math.floor(tierLimit / 4)) : 0, limit = tierLimit - reserved;
    const phaseNow = daylight.phaseAt(hour);
    const lanternsOn = phaseNow === "dusk" || phaseNow === "night" || phaseNow === "midnight";
    const coilLamp = coilCharge && coilCharge.lamp, coilActive = !!coilLamp && coilCharge.level > 0.02;
    // The pits' lights follow their flames: the plaza lamp's gain and the HQ hearth's colour pulse with the flicker.
    const plazaRig = firePitRig, hearthRig = headquarters && headquarters.hearth && headquarters.hearth.rig;
    const plazaLamp = plazaRig ? plazaRig.lamp : null;
    const plazaPulse = plazaRig ? 1 + (plazaRig.light - 1) * 1.5 : 1;
    const hearthK = hearthRig ? 1 + (hearthRig.light - 1) * 1.2 : 1;
    let count = 0, approximated = 0, registered = 0;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i], node = l.node;
      if (l.light) registered++;
      // GAME MODE puts the meadow's fire pit out: no flame, no light, nothing to catch fire from.
      const k = l === coilLamp ? (coilActive ? 1 : 0) : l === fire && gameMode ? 0 : l.always ? 1 : l.nightOnly ? (lanternsOn ? 1 : 0)
        : Math.min(1, Math.max(0, (RENDER_OPTS.torch - l.order * LAMP_STAGGER) / LAMP_RAMP));
      const lit = k > 0.05;
      if (lit && !l.lit && spark) fx.burst(l.x, l.y, l.z, 5, [SPARK], 1.3);
      l.lit = lit;
      l.k = k;
      const steady = l.nightOnly ? 0 : LAMP_OFF;
      const kindGlow = l.kind.glow * (1 + (l.pileProfile ? RENDER_OPTS.lampFactor * PILE_POST_NIGHT_BOOST * 0.25 : 0));
      let baseGlow;
      if (k === 0 && node.flare <= 0) {
        // k times a finite factor is exactly 0, so the glow is this constant; skip the flicker sample.
        baseGlow = steady;
        if (node.glow !== baseGlow) node.glow = baseGlow;
      } else {
        const flicker = Math.sin(elapsed * 11 + i * 2.3) * 0.15;
        baseGlow = steady + k * (kindGlow + flicker);
        node.glow = baseGlow + node.flare * 1.5;
      }
      // A fire rig's root carries no geometry, so a glow written on it goes nowhere. Hand the lamp's
      // lit glow and its click flare to the rig, which writes them onto the flame's blocks.
      if (node.lampRig) {
        node.lampK = k;
        node.lampGlow = baseGlow;
        node.lampBase = steady + kindGlow;
      }
      if (node.flare > 0) node.flare = Math.max(0, node.flare - dt * 2);
      // kind.hide: the node is hidden while unlit, so a cold fire shows no flame at all.
      if (l.kind.hide) node.visible = lit;
      // A lamp with a reach lights a place shut in under the Mempool island's rock, and every light costs every
      // pixel. It counts while the view is under that ground (`poolShade`) or follows a walker who is, the roof
      // cut open over them (`poolUnder`), and fades out over `fade` metres as the view leaves its reach, measured
      // from the lamp or from the middle of the room it lights. The lamps of the open air fade out under the ground.
      if (l.reach > 0) {
        const away = Math.hypot(l.fromX - camera.target.x, l.fromY - camera.target.y, l.fromZ - camera.target.z);
        l.gain = Math.max(poolShade, poolUnder) * Math.min(1, Math.max(0, (l.reach - away) / l.fade));
      } else l.gain = (1 - poolShade) * (l === plazaLamp ? plazaPulse : 1);
      l.far = l.gain < 0.02;
      if (l.debug) {
        l.debug.factor = k;
        l.debug.lit = lit;
      }
    }
    // The selection below is a pure function of the key: an exact hit reuses the written array, and
    // the lamps' selected/approximated flags keep describing it. Twilight moves torch and lampFactor
    // every frame, so day/night transitions are misses, as is a quality tier's new limit.
    const key = LAMP_SEL_KEY;
    const keyHit = lampSelValid
      && key.tx === camera.target.x && key.ty === camera.target.y && key.tz === camera.target.z
      && key.px === camera.position.x && key.py === camera.position.y && key.pz === camera.position.z
      && key.torch === RENDER_OPTS.torch && key.lampFactor === RENDER_OPTS.lampFactor
      && key.poolShade === poolShade && key.poolUnder === poolUnder
      && key.lanternsOn === lanternsOn && key.coilActive === coilActive && key.cave === cameraCaveIndex && key.limit === limit;
    if (!keyHit) {
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        l.selected = false;
        l.approximated = false;
        if (l.debug) { l.debug.selected = false; l.debug.approximated = false; }
      }
      // Keep the lit central pile posts in every tier; fill the remaining slots
      // with the lamps nearest the view.
      for (; count < limit; count++) {
        let nearest = null, distance = Infinity;
        for (let i = 0; i < lamps.length; i++) {
          const l = lamps[i];
          if (!l.lit || !l.light || l.selected || l.far) continue;
          const dx = l.x - camera.target.x, dy = l.y - camera.target.y, dz = l.z - camera.target.z;
          const score = l.pileProfile ? -32 : dx * dx + dy * dy + dz * dz - (l.centerLight ? 16 : 0);
          if (score < distance) { nearest = l; distance = score; }
        }
        if (!nearest) break;
        const l = nearest, kind = l.kind, boost = 1 + (l.pileProfile ? RENDER_OPTS.lampFactor * PILE_POST_NIGHT_BOOST : 0);
        l.selected = true;
        l.slot = count;
        if (l.debug) l.debug.selected = true;
        LIGHTING_DEBUG.selectedIds[count] = l.id;
        const o = count * 8;
        lights[o] = l.x;
        lights[o + 1] = l.y;
        lights[o + 2] = l.z;
        lights[o + 3] = kind.radius + (l.pileProfile ? RENDER_OPTS.lampFactor * PILE_POST_NIGHT_REACH : 0);
        lights[o + 4] = kind.r * l.k * boost * l.gain;
        lights[o + 5] = kind.g * l.k * boost * l.gain;
        lights[o + 6] = kind.b * l.k * boost * l.gain;
        lights[o + 7] = l.pileProfile ? 1 : 0;
      }
      for (let i = 0; i < lamps.length; i++) {
        const l = lamps[i];
        if (!l.lit || !l.light || l.selected || l.far) continue;
        l.approximated = true;
        if (l.debug) l.debug.approximated = true;
        if (approximated < LIGHT_CAPACITY) LIGHTING_DEBUG.approximatedIds[approximated] = l.id;
        approximated++;
      }
      for (let i = count; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = null;
      for (let i = approximated; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.approximatedIds[i] = null;
      RENDER_OPTS.lightCount = lampLights = count;
      LIGHTING_DEBUG.registeredLampCount = registered;
      LIGHTING_DEBUG.activeFullLightCount = count;
      LIGHTING_DEBUG.approximatedLightCount = approximated;
      LIGHTING_DEBUG.configuredLightCapacity = limit;
      LIGHTING_DEBUG.selectedCount = count;
      LIGHTING_DEBUG.approximatedCount = approximated;
      LIGHTING_DEBUG.tier = webgl ? renderer.quality : "canvas2d";
    }
    // The coil's lamp follows its charge every frame, so a held selection still repaints its slot.
    if (coilLamp && coilLamp.selected) {
      const o = coilLamp.slot * 8, s = coilLamp.k * coilLamp.gain * coilCharge.level;
      lights[o + 4] = coilLamp.kind.r * s; lights[o + 5] = coilLamp.kind.g * s; lights[o + 6] = coilLamp.kind.b * s;
    }
    if (plazaLamp && plazaLamp.selected) {
      const o = plazaLamp.slot * 8, s = plazaLamp.k * plazaLamp.gain;
      lights[o + 4] = plazaLamp.kind.r * s; lights[o + 5] = plazaLamp.kind.g * s; lights[o + 6] = plazaLamp.kind.b * s;
    }
    if (!keyHit && headquarters && camera.position.y < -1 && cameraCaveIndex && CAMERA_OPENINGS[cameraCaveIndex - 1].headquarters) {
      const underground = headquarters.sources;
      // The upper hearth cannot cast through the rock into the basement.
      const below = camera.position.y < island.headquarters.floor;
      const total = below ? 0 : Math.min(limit, underground.length);
      for (let i = 0; i < underground.length; i++) underground[i].selected = false;
      for (let i = 0; i < total; i++) {
        let nearest = null, distance = Infinity;
        for (let n = 0; n < underground.length; n++) {
          const l = underground[n];
          const d = (l.x - camera.position.x) ** 2 + (l.y - camera.position.y) ** 2 + (l.z - camera.position.z) ** 2;
          if (!l.selected && d < distance) { nearest = l; distance = d; }
        }
        const l = nearest, o = i * 8, sky = l.daylight ? 0.12 + RENDER_OPTS.day * 0.88 : 1;
        const kk = l.rig ? hearthK : 1;
        l.selected = true;
        l.slot = i;
        lights[o] = l.x;
        lights[o + 1] = l.y;
        lights[o + 2] = l.z;
        lights[o + 3] = l.daylight ? 11 : 9;
        lights[o + 4] = (l.daylight ? 0.8 : 1) * sky * kk;
        lights[o + 5] = (l.daylight ? 0.88 : 0.65) * sky * kk;
        lights[o + 6] = (l.daylight ? 1 : 0.3) * sky * kk;
        lights[o + 7] = 0;
        LIGHTING_DEBUG.selectedIds[i] = l.id;
      }
      for (let i = total; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = null;
      RENDER_OPTS.lightCount = lampLights = LIGHTING_DEBUG.activeFullLightCount = LIGHTING_DEBUG.selectedCount = total;
    }
    const hearth = headquarters && headquarters.hearth;
    if (hearth?.selected && camera.position.y < -1 && cameraCaveIndex && CAMERA_OPENINGS[cameraCaveIndex - 1].headquarters) {
      const o = hearth.slot * 8;
      lights[o + 4] = hearthK; lights[o + 5] = 0.65 * hearthK; lights[o + 6] = 0.3 * hearthK;
    }
    if (!keyHit) {
      key.tx = camera.target.x; key.ty = camera.target.y; key.tz = camera.target.z;
      key.px = camera.position.x; key.py = camera.position.y; key.pz = camera.position.z;
      key.torch = RENDER_OPTS.torch; key.lampFactor = RENDER_OPTS.lampFactor;
      key.poolShade = poolShade; key.poolUnder = poolUnder;
      key.lanternsOn = lanternsOn; key.coilActive = coilActive; key.cave = cameraCaveIndex; key.limit = limit;
      lampSelValid = true;
    }
    RENDER_OPTS.lightCount = lampLights + (reserved ? ghosts.lanterns(lights, lampLights, reserved) : 0); // HALLOWEEN
  };
  const buildFire = () => {
    let p = null;
    for (const deg of FIRE_DEGREES) {
      const c = polar(deg, FIRE_RADIUS);
      if (island.surfaceAt(c.x, c.z) === 0 && free(c.x, c.z, 1.6) && !nearPath(c.x, c.z, 1.8)) {
        p = c;
        break;
      }
    }
    if (!p) throw new Error("No clear spot for the fire pit");
    const pit = place(hubModels.firepit(), p.x, p.z, 0, 0, "firepit", 1.2);
    // The island's voxel flame: a stream of glowing blocks pouring up off the pit's coals. The pit's embers are
    // the hub's own critter ember batch drawn for the fire at `firePos`, the same style as the HQ hearth's.
    const rig = BL.blaze.createVoxelRig({ scale: 1, sightHidden: true });
    addChild(pit, rig.root);
    rig.lamp = addLamp(rig.root, LAMP.fire, p.x, 0.6, p.z, true, 3, "firepit");
    rig.lamp.always = true;
    // The lamp's glow and flare land on this geometry-less root; the rig reads them for its blocks.
    rig.root.lampRig = rig;
    fireRigs.push(rig);
    firePitRig = rig;
    fireHazards.push({ node: rig.root, boxes: rig.boxes, pit, x: p.x, y: pit.position.y, z: p.z, avoidRadius: FIRE_AVOID_RADIUS });
    claim(p.x, p.z, 1.4);
    // Spare concentric rings let the whole chilling roster arrive together.
    // Keep the original six seats first; ordinary strolls still use that ring.
    for (let ring = 1; fireSeats.length < Math.max(FIRE_SEATS, contributors.activeRoster.length * 3); ring++) {
      const count = FIRE_SEATS * ring, radius = FIRE_SEAT_RADIUS * ring;
      for (let i = 0; i < count; i++) {
        const a = (i + 0.5) / count * Math.PI * 2;
        const x = p.x + Math.cos(a) * radius, z = p.z + Math.sin(a) * radius;
        fireSeats.push({ x, z, ry: Math.atan2(p.x - x, p.z - z), sit: true });
      }
    }
    return p;
  };
  // Mouth local frame: +z leads out of the cave.
  const sealedCaveVariant = (id) => id === "c3" ? 1 : id === "c10" ? 2 : 0;
  // Every cave wears its own facade from the shared voxel kit: two lantern posts with a banner behind each, a string over the lintel,
  // vines off the rim, and the theme's own things either side of the path (lab dice and flasks, the mirror's glyph
  // monoliths, the Lightning Factory's coil and coal, Ooga Arcade's two cabinets, hard against the left of its
  // door and facing the island's centre: the Mempool stairs start at the right jamb and the Lightning Factory's right side fills the ground further left). A slot without a theme wears none: the sealed caves, and the
  // Headquarters ramps that run down a cutting rather than into a cliff. Each mouth bakes to one solid, one hanging and one glowing mesh, memoised per island
  // so a revisit only places nodes. Pieces are [kind, x, z, quarter turns, variant, lift] in the mouth's frame.
  // A `ceiling` run is two cables into the room, [left x, right x, from z, to z, height, lamp places, lamp kind], the kind a
  // hanging lantern unless named (EntropyLab's white strip lights).
  const THEMES = {
    lab: { glass: 4, icon: "die", banners: [[-1, 1], [1, 1]], string: ["bulb", 4], ceiling: [[-1.6, 1.6, -1.5, -5.6, 3.0, [0.3, 0.72], "tube"]], pieces: [["flaskBench", -5.3, 1.1], ["die", -4.1, 2.8, 0, 1], ["die", -3.5, 3.6, 1, 3], ["die", -4.1, 2.8, 1, 4, 0.5], ["terminal", 5.2, 1.0], ["die", 4.3, 3.2, 1, 2]] },
    matrix: { glass: 2, icon: "glyph", banners: [[1, 2], [-1, 2]], string: ["bulb", 2], pieces: [["monolith", -5.0, 0.9, 0, 0], ["monolith", 5.0, 0.9, 0, 1], ["runeStone", -4.2, 2.8, 0, 0], ["runeStone", 4.4, 2.9, 0, 1]] },
    lightning: { glass: 0, icon: "bolt", banners: [[-1, 0], [1, 0]], string: ["hanging", 0, [0.3, 0.7]], boards: true, pieces: [["gauge", 5.0, 0.9], ["cart", 5.7, 2.4, 1], ["coil", 3.8, 3.4]] },
    arcade: { glass: 3, icon: "invader", banners: [[-1, 3], [1, 3]], string: ["hanging", 3, [0.12, 0.5, 0.88]], ceiling: [[-2.35, 2.35, -1.5, -5.8, 3.0, [0.35, 0.8]]], pieces: [["cabinet", -3.6, 1.0, 0, 0], ["cabinet", -2.9, 2.2, 0, 1]] },
    bca: { glass: 0, icon: "abacus", banners: [[-1, 4], [1, 4]], string: ["hanging", 0, [0.2, 0.5, 0.8]], ceiling: [[-1.6, 1.6, -2.2, -5.6, 3.1, [0.5]]], pieces: [["abacus", -5.0, 1.0], ["ledger", 5.0, 1.0, 2]] }
  };
  // Themes choose only [side, variant]. The whole standard stays behind and outside the lanterns,
  // on its own cave's rock shoulder. These extents include the kit's crossbar and foot, not just its pole.
  const CAVE_LANTERN_X = 4.4, CAVE_LANTERN_Z = 1.6;
  const CAVE_BANNER_X = 5.25, CAVE_BANNER_Z = -2;
  const BANNER_HALF_X = 9 / 16, BANNER_HALF_Z = 3 / 16, BANNER_GAP = 1 / 16;
  const checkCaveBanner = (mouth, side) => {
    const u = BL.dressing.U;
    const lx = Math.round(side * CAVE_BANNER_X / u) * u, lz = Math.round(CAVE_BANNER_Z / u) * u;
    const postX = Math.round(CAVE_LANTERN_X / u) * u, postZ = Math.round(CAVE_LANTERN_Z / u) * u;
    if (Math.abs(side) !== 1 || Math.abs(lx) - BANNER_HALF_X < postX + 4 * u + BANNER_GAP
      || lz + BANNER_HALF_Z > postZ - 4 * u - BANNER_GAP)
      throw new Error(`${mouth.id}: banner must stay behind and outside the lanterns`);
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
    // Squared-distance differences are affine: checking every corner covers the entire footprint.
    // Closed mouths participate too; their future facade already owns its side of the gap.
    for (const dx of [-BANNER_HALF_X, BANNER_HALF_X]) for (const dz of [-BANNER_HALF_Z, BANNER_HALF_Z]) {
      const bx = lx + dx, bz = lz + dz, own = bx * bx + bz * bz;
      const x = mouth.x + cr * bx + sr * bz, z = mouth.z - sr * bx + cr * bz;
      for (const other of island.mouths) {
        if (other === mouth) continue;
        const ox = x - other.x, oz = z - other.z;
        if (ox * ox + oz * oz <= own) throw new Error(`${mouth.id}: banner crosses into ${other.id}'s frontage`);
      }
    }
  };
  const THEME_ICON = (slot) => slot.id === "c1" ? "favicon" : THEMES[slot.theme]?.icon || null;
  const trackCaveSign = (node, slot, mouth) => {
    signDetails.push({
      node, solid: node.geometry, pixels: hubModels.caveSign(slot.name, THEME_ICON(slot), true, true),
      x: mouth.x + Math.sin(mouth.ry) * node.position.z, y: mouth.floorY + node.position.y,
      z: mouth.z + Math.cos(mouth.ry) * node.position.z
    });
  };
  const addCaveSignTarget = (node, slot, mouth) => {
    const repo = slot.repo || slot.link;
    if (!repo) return;
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry), front = node.position.z + BL.scene.boundsOf(node.geometry).max[2];
    const x = mouth.x + sr * front, y = mouth.floorY + node.position.y, z = mouth.z + cr * front;
    const owner = { kind: "cave-sign", slot, repo, priority: 2, weaponType: "none" };
    owner.pickRay = (ray) => {
      const facing = ray.dx * sr + ray.dz * cr;
      if (facing >= -1e-6) return Infinity;
      const t = ((x - ray.ox) * sr + (z - ray.oz) * cr) / facing;
      const side = (ray.ox + ray.dx * t - x) * cr - (ray.oz + ray.dz * t - z) * sr;
      return t > 0 && Math.abs(side) <= node.geometry.signWidth * 0.5
        && Math.abs(ray.oy + ray.dy * t - y) <= node.geometry.signHeight * 0.5 ? t : Infinity;
    };
    addTarget(node, owner);
  };
  const mouthDressing = (slot, m) => {
    let byIsland = DRESSED.get(island);
    if (!byIsland) DRESSED.set(island, byIsland = new Map());
    let baked = byIsland.get(slot.id);
    if (baked) return baked;
    const theme = THEMES[slot.theme];
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const set = BL.dressing.set(), ground = [], rig = {};
    // Floor props stay on the apron; banners stand on the raised rock shoulders behind the lamps.
    const stand = (kind, lx, lz, turns = 0, variant = 0, lift = 0) => {
      const x = m.x + cr * lx + sr * lz, z = m.z - sr * lx + cr * lz;
      if ((kind === "barrel" || kind === "bench") && island.overlapsStairs(x, z, 1.7)) return;
      const y = island.surfaceAt(x, z) - m.floorY;
      if (Math.abs(y) > 0.9 && kind !== "banner") return;
      set.put(kind, lx, y + lift, lz, turns, variant);
      // The coil and its gauge charge on a loop of their own (`coilCharge`).
      if (kind === "coil" || kind === "gauge") rig[kind] = [lx, y + lift, lz, turns];
      if (!lift) ground.push(lx, lz);
    };
    stand("lanternPost", -CAVE_LANTERN_X, CAVE_LANTERN_Z, 0, theme.glass);
    stand("lanternPost", CAVE_LANTERN_X, CAVE_LANTERN_Z, 2, theme.glass);
    for (const piece of theme.pieces) {
      if (piece[0] === "banner") throw new Error(`${m.id}: use theme.banners for cave standards`);
      stand(...piece);
    }
    for (const [side, variant] of theme.banners || []) {
      checkCaveBanner(m, side);
      stand("banner", side * CAVE_BANNER_X, CAVE_BANNER_Z, 0, variant);
    }
    const [lamp, variant, at] = theme.string;
    set.cable(-3.05, 3.42, CAVE_LIGHT_Z, 3.05, 3.42, CAVE_LIGHT_Z, 0.3, at || [0.1, 0.24, 0.38, 0.5, 0.62, 0.76, 0.9], lamp, variant);
    set.cable(-3.65, 3.18, -0.22, -3.05, 3.42, CAVE_LIGHT_Z, 0.08);
    set.cable(3.65, 3.18, -0.22, 3.05, 3.42, CAVE_LIGHT_Z, 0.08);
    set.put("vine", -3.0, 3.5, CAVE_LIGHT_Z, 0, 0);
    set.put("vine", 2.6, 3.5, CAVE_LIGHT_Z, 0, 1);
    // A dark cave's rock stands flush with the rim's face, so the planks go on in front of both.
    if (theme.boards && slot.status === "dark") set.put("boards", 0, 0.2, 1.06);
    // Inside the mouth the floor is the cave's own, level with the doorway.
    for (const [kind, lx, lz, turns = 0, variant = 0, lift = 0] of theme.inside || []) set.put(kind, lx, lift, lz, turns, variant);
    for (const [ax, bx, az, bz, y, lamps, lamp = "hanging"] of theme.ceiling || []) {
      set.cable(ax, y, az, ax, y, bz, 0.15, lamps, lamp, theme.glass);
      set.cable(bx, y, az, bx, y, bz, 0.15, lamps, lamp, theme.glass);
    }
    baked = { ...set.build(), ground, rig };
    byIsland.set(slot.id, baked);
    return baked;
  };
  // A baked set's nodes under `parent`: the solid collides, the glowing layers breathe with the lamps.
  const addDressing = (baked, parent, x, y, z, id, track) => {
    for (const node of BL.dressing.nodes(baked, { living: true })) {
      addChild(parent, node);
      if (track) placed.push(node);
      if (node.geometry === baked.solid) solids.add(node);
      else if (node.geometry === baked.glow || node.geometry === baked.swingGlow) addLamp(node, LAMP.lantern, x, y, z, false, 0, `${id}:${lamps.length}`).always = true;
      else if (node.geometry === baked.lampGlow || node.geometry === baked.swingLampGlow) addLamp(node, LAMP.lantern, x, y, z, false, 0, `${id}:${lamps.length}`).nightOnly = true;
    }
  };
  // The Lightning Factory's coil charges in runs of its own, timed by scene time alone: its copper bands light from
  // the foot up while the gauge's needle climbs from green into the red, the crown spits long arcs, the charge goes
  // out and the needle falls back, and the coil stands dark, cooling, for one to three runs' length (picked afresh
  // each time) before the next. Only these nodes move; the mouth's baked meshes stay as they are. Times in seconds
  // (`lead` the dark before a visit's first run, `crackle` each set of arcs' turn); the dial runs 0 (green) to 1 (red).
  const COIL = { lead: 2.1, charge: 18.6, hold: 1.8, burst: 4.05, fall: 2.1, crackle: 0.45, low: 0.06, high: 0.92 };
  const COIL_RUN = COIL.charge + COIL.hold + COIL.burst + COIL.fall;
  const COIL_SPARKS = [SPARK];
  let coilCharge = null;
  const buildCoilCharge = (group, rig, m) => {
    const parts = BL.dressing.coilRig(), U = BL.dressing.U;
    // A piece's own frame, on the kit's grid where the set put it.
    const frame = ([x, y, z, turns]) => {
      const node = createNode({ position: { x: Math.round(x / U) * U, y: Math.round(y / U) * U, z: Math.round(z / U) * U }, rotation: { x: 0, y: turns * Math.PI / 2, z: 0 } });
      addChild(group, node);
      return node;
    };
    const part = (parent, geometry, x, y, z, lit) => {
      const node = createNode({ geometry, position: { x, y, z }, sightHidden: true, matrixEmissiveLiving: lit, visible: !lit });
      addChild(parent, node);
      return node;
    };
    // Each glow sits a little proud of the copper it lights, so neither fights the other's faces.
    const coil = frame(rig.coil);
    const bands = parts.bands.map((y) => {
      const node = part(coil, parts.band, 0, (y + 0.5) * U, 0, true);
      node.scale.x = node.scale.z = 1.12;
      node.scale.y = 1.3;
      return node;
    });
    const crown = part(coil, parts.crown, 0, parts.crownY * U, 0, true);
    crown.scale.x = crown.scale.y = crown.scale.z = 1.06;
    const arcs = parts.arcs.map((geometry) => part(coil, geometry, 0, 0, 0, true));
    const needle = rig.gauge ? part(frame(rig.gauge), parts.needle, parts.pivot[0] * U, parts.pivot[1] * U, parts.pivot[2] * U, false) : null;
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry), p = coil.position;
    coilCharge = {
      bands, crown, arcs, needle, lamp: null, level: 0, fired: false, start: COIL.lead, cool: COIL_RUN * (1 + 2 * Math.random()),
      x: m.x + cr * p.x + sr * p.z, y: m.floorY + p.y + parts.crownY * U, z: m.z - sr * p.x + cr * p.z
    };
  };
  const updateCoilCharge = (elapsed) => {
    const c = coilCharge;
    // A run and its cooldown over, the next run starts and draws its own cooldown.
    while (elapsed - c.start >= COIL_RUN + c.cool) {
      c.start += COIL_RUN + c.cool;
      c.cool = COIL_RUN * (1 + 2 * Math.random());
    }
    const t = elapsed - c.start, held = COIL.charge, burst = held + COIL.hold, done = burst + COIL.burst;
    // climb: how far up the coil the charge has lit, 0 to 1; dial: the needle's place; level: the lamp's.
    let climb = 0, dial = COIL.low, level = 0, flash = false;
    if (t >= 0 && t < held) {
      climb = t / COIL.charge;
      dial = COIL.low + (COIL.high - COIL.low) * climb;
      level = 0.15 + 0.55 * climb;
    } else if (t >= held && t < burst) {
      climb = 1;
      dial = COIL.high + Math.sin(elapsed * 16) * 0.02;
      level = 0.75 + Math.sin(elapsed * 10) * 0.1;
    } else if (t >= burst && t < done) {
      flash = true;
      dial = 0.97;
    } else if (t >= done && t < COIL_RUN) {
      const k = Math.min(1, (t - done) / COIL.fall);
      dial = 0.97 - (0.97 - COIL.low) * (1 - (1 - k) * (1 - k));
    }
    const n = c.bands.length;
    for (let i = 0; i < n; i++) {
      const band = c.bands[i];
      band.visible = climb >= (i + 0.5) / (n + 1);
      band.glow = flash ? 1.3 : 0.55 + 0.45 * climb + Math.sin(elapsed * 3 + i * 1.7) * 0.12;
    }
    c.crown.visible = climb >= (n + 0.5) / (n + 1);
    c.crown.glow = flash ? 1.3 : 0.8 + Math.sin(elapsed * 8) * 0.2;
    // The arcs crackle between their two sets.
    const side = Math.floor(elapsed / COIL.crackle) & 1;
    c.arcs[0].visible = flash && side === 0;
    c.arcs[1].visible = flash && side === 1;
    if (flash && !c.fired) fx.burst(c.x, c.y, c.z, 6, COIL_SPARKS, 1.6);
    c.fired = flash;
    if (c.needle) c.needle.rotation.z = Math.PI / 2 - dial * Math.PI;
    c.level = level;
  };
  const CHALKBOARD_X = 6.75, CHALKBOARD_Z = 2.15, CHALKBOARD_YAW = -0.57;
  let chalkboardDressing = null, chalkboardClearance = null;
  const placeChalkboard = (m, group) => {
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const wx = m.x + cr * CHALKBOARD_X + sr * CHALKBOARD_Z;
    const wz = m.z - sr * CHALKBOARD_X + cr * CHALKBOARD_Z;
    const y = island.surfaceAt(wx, wz) - m.floorY;
    if (Math.abs(y) > 0.9) return;
    if (!chalkboardDressing) {
      const set = BL.dressing.set();
      set.put("chalkboard", 0, 0, 0);
      chalkboardDressing = set.build();
    }
    const boardGroup = createNode({ position: { x: CHALKBOARD_X, y, z: CHALKBOARD_Z }, rotation: { x: 0, y: CHALKBOARD_YAW, z: 0 } });
    addChild(group, boardGroup);
    const facing = m.ry + CHALKBOARD_YAW;
    chalkboardClearance = { x: wx, z: wz, rightX: Math.cos(facing), rightZ: -Math.sin(facing), frontX: Math.sin(facing), frontZ: Math.cos(facing) };
    addDressing(chalkboardDressing, boardGroup, wx, m.floorY + y, wz, `${m.id}:chalkboard`, false);
    const sa = Math.sin(CHALKBOARD_YAW), ca = Math.cos(CHALKBOARD_YAW);
    addPieceTargets(chalkboardDressing.picks, (px, py, pz) => {
      const lx = CHALKBOARD_X + ca * px + sa * pz;
      const lz = CHALKBOARD_Z - sa * px + ca * pz;
      return { x: m.x + cr * lx + sr * lz, y: m.floorY + y + py, z: m.z - sr * lx + cr * lz };
    });
    chalkboard.attach(boardGroup, 0, 0, 0);
    claim(wx, wz, 0.8);
  };
  const dressMouth = (slot, m, group) => {
    // The Canvas 2D fallback keeps the plain island, but the writable board remains available.
    if (renderer.kind === "canvas2d" && slot.theme === "lab") {
      placeChalkboard(m, group);
      return;
    }
    if (renderer.kind === "canvas2d" || !THEMES[slot.theme]) return;
    const baked = mouthDressing(slot, m);
    addDressing(baked, group, m.x, m.floorY + 2.4, m.z, `${slot.id}:dressing`, false);
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry), g = baked.ground, lit = baked.lights;
    for (let i = 0; i < lit.length; i += 4) dressingLights.push(m.x + cr * lit[i] + sr * lit[i + 2], m.floorY + lit[i + 1], m.z - sr * lit[i] + cr * lit[i + 2], lit[i + 3]);
    addPieceTargets(baked.picks, (lx, ly, lz, kind) => lz < 0.3 && kind !== "banner" ? null : { x: m.x + cr * lx + sr * lz, y: m.floorY + ly, z: m.z - sr * lx + cr * lz });
    if (baked.rig.coil) buildCoilCharge(group, baked.rig, m);
    if (slot.theme === "lab") placeChalkboard(m, group);
    // Headquarters and a sealed cave that is coming soon still hang their name over the door.
    if (slot.status !== "open" && slot.status !== "mirror" && slot.name) {
      const sign = createNode({ position: { x: 0, y: CAVE_SIGN_Y, z: CAVE_SIGN_Z }, geometry: hubModels.caveSign(slot.name, THEME_ICON(slot), false, true) });
      addChild(group, sign);
      trackCaveSign(sign, slot, m);
    }
    for (let i = 0; i < g.length; i += 2) claim(m.x + cr * g[i] + sr * g[i + 1], m.z - sr * g[i] + cr * g[i + 1], 0.8);
  };
  const movePilePosts = () => {
    if (!pilePosts.length) return;
    // The posts' light positions change even while the camera and daylight stay fixed.
    lampSelValid = false;
    // A shared radius keeps the same three angles as the ring changes. Check the actual half-metre
    // post bases against the rasterized road, not the broad NPC work-area reservations.
    let radius = island.path.debug.ringOuterRadius + 0.8;
    for (; radius < MEADOW - 0.7; radius += island.pathUnit) {
      let clear = true;
      for (const post of pilePosts) {
        const p = polar(post.degrees, radius);
        if (!island.isGrassAt(p.x, p.z) || island.path.overlaps(p.x, p.z, 0.36)) { clear = false; break; }
      }
      if (clear) break;
    }
    for (const post of pilePosts) {
      const spot = polar(post.degrees, radius);
      post.node.visible = post.pick.node.visible = post.lamp.light = true;
      const y = island.surfaceAt(spot.x, spot.z);
      post.node.position.x = post.claim.x = spot.x;
      post.node.position.y = y;
      post.node.position.z = post.claim.z = spot.z;
      // The lantern hangs from local +x; turn its arm toward the pile.
      const yaw = -Math.atan2(spot.x, -spot.z) - Math.PI / 2;
      const cr = Math.cos(yaw), sr = Math.sin(yaw);
      post.node.rotation.y = yaw;
      post.lamp.x = spot.x + cr * post.light[0] + sr * post.light[2];
      post.lamp.y = y + post.light[1];
      post.lamp.z = spot.z - sr * post.light[0] + cr * post.light[2];
      post.pick.node.position.x = post.pick.owner.x = spot.x + cr * post.pick.offset[0] + sr * post.pick.offset[2];
      post.pick.node.position.y = post.pick.owner.y = y + post.pick.offset[1];
      post.pick.node.position.z = post.pick.owner.z = spot.z - sr * post.pick.offset[0] + cr * post.pick.offset[2];
      BL.scene.updateWorld(post.pick.node);
    }
  };
  // Cave dressing lamps follow the torches and fire in the renderer's light budget.
  const addDressingLights = () => {
    for (let i = 0; i < dressingLights.length; i += 4) {
      const lamp = addLamp({ glow: 0, flare: 0, visible: true }, DRESSING_LAMPS[dressingLights[i + 3]], dressingLights[i], dressingLights[i + 1], dressingLights[i + 2], true, (i / 4) % 5, `dressing:${i / 4}`);
      lamp.nightOnly = dressingLights[i + 3] !== BL.dressing.COIL_LIGHT;
      if (!lamp.nightOnly && coilCharge) coilCharge.lamp = lamp;
    }
    dressingLights.length = 0;
  };
  // Keep all three posts in both renderers.
  const buildPilePosts = () => {
    let byIsland = DRESSED.get(island);
    if (!byIsland) DRESSED.set(island, byIsland = new Map());
    // These three meadow lanterns stand at the grass edge beside the growing pile path.
    for (let i = 0; i < PILE_POST_DEGREES.length; i++) {
      const degrees = PILE_POST_DEGREES[i];
      let postDressing = byIsland.get("pilePost");
      if (!postDressing) {
        const set = BL.dressing.set();
        set.put("lanternPost", 0, 0, 0);
        byIsland.set("pilePost", postDressing = set.build());
      }
      const node = createNode();
      addChild(root, node);
      placed.push(node);
      let glow = null;
      for (const part of BL.dressing.nodes(postDressing, { living: true })) {
        addChild(node, part);
        if (part.geometry === postDressing.solid) solids.add(part);
        if (part.geometry === postDressing.lampGlow || part.geometry === postDressing.swingLampGlow) glow = part;
      }
      const light = postDressing.lights, pick = postDressing.picks;
      const lamp = addLamp(glow, DRESSING_LAMPS[light[3]], 0, 0, 0, true, 0, `pile-post:${i}`);
      lamp.nightOnly = true;
      lamp.centerLight = true;
      lamp.pileProfile = true;
      const pickNode = createNode({ geometry: PICK_GEOMETRY });
      const owner = { kind: "piece", piece: "lanternPost", variant: 0, node: pickNode, x: 0, y: 0, z: 0, next: 0, weaponType: "none" };
      addTarget(pickNode, owner, { radius: Math.max(0.35, pick[5]) });
      pilePosts.push({
        degrees, node, claim: claim(Infinity, Infinity, 0.7), lamp,
        light: [light[0], light[1], light[2]], pick: { node: pickNode, owner, offset: [pick[2], pick[3], pick[4]] }
      });
    }
    movePilePosts();
  };
  // The lawn: swaying tufts in small clumps across the meadow's grass as one fixed instanced batch, a single
  // draw. Clumps with bare grass between them read as tufts, not a carpet of blades. It follows the painted
  // paths, so it is laid again whenever the island's paths change.
  const LAWN_CAP = 300;
  // Every tuft owns its slot: it keeps a tuft's width off the roads, off anything claimed on the island (props,
  // dressing, palms, scenery) and a cell apart from every other tuft, checked through a grid of the tufts
  // already laid (tuft index + 1 per cell). The grid is allocated once a page and cleared on each relay.
  const LAWN_CELL = 0.45, LAWN_SPAN = Math.ceil(2 * MEADOW_OUTER / LAWN_CELL) + 5;
  let lawn = null, lawnGrid = null;
  const lawnCell = (v) => Math.floor((v + MEADOW_OUTER) / LAWN_CELL) + 2;
  const layLawn = () => {
    const data = lawn.node.instanceData, rand = mulberry32(fnv1a("lawn"));
    const inner = Math.max(MEADOW_INNER, island.path.debug.ringOuterRadius + 0.6);
    if (lawnGrid) lawnGrid.fill(0);
    else lawnGrid = new Int16Array(LAWN_SPAN * LAWN_SPAN);
    const tuftClear = (x, z) => {
      const cx = lawnCell(x), cz = lawnCell(z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const t = lawnGrid[(cz + dz) * LAWN_SPAN + cx + dx];
        if (t && Math.hypot(data[(t - 1) * 20 + 12] - x, data[(t - 1) * 20 + 14] - z) < LAWN_CELL) return false;
      }
      return true;
    };
    let n = 0;
    for (let tries = 0; n < LAWN_CAP && tries < LAWN_CAP * 3; tries++) {
      const p = polar(rand() * 360, Math.sqrt(lerp(inner * inner, MEADOW_OUTER * MEADOW_OUTER, rand())));
      for (let k = 1 + Math.floor(rand() * 3); k > 0 && n < LAWN_CAP; k--) {
        const x = p.x + (rand() - 0.5) * 1.1, z = p.z + (rand() - 0.5) * 1.1;
        const yaw = rand() * Math.PI * 2, s = 0.75 + rand() * 0.5;
        if (!island.isGrassAt(x, z) || island.path.overlaps(x, z, 0.3) || !free(x, z, 0.2) || !tuftClear(x, z)) continue;
        lawnGrid[lawnCell(z) * LAWN_SPAN + lawnCell(x)] = n + 1;
        const c = Math.cos(yaw) * s, sn = Math.sin(yaw) * s, o = n++ * 20;
        data[o] = c; data[o + 1] = 0; data[o + 2] = -sn; data[o + 3] = 0;
        data[o + 4] = 0; data[o + 5] = s; data[o + 6] = 0; data[o + 7] = 0;
        data[o + 8] = sn; data[o + 9] = 0; data[o + 10] = c; data[o + 11] = 0;
        data[o + 12] = x; data[o + 13] = island.surfaceAt(x, z); data[o + 14] = z; data[o + 15] = 1;
        data[o + 16] = data[o + 17] = data[o + 18] = data[o + 19] = 0;
      }
    }
    lawn.node.instanceCount = n;
    lawn.node.instanceVersion++;
    lawn.version = island.path.version;
  };
  // Palms: single palms spread evenly across the meadow, from beside the pile's ring out to the cliffs, and groves
  // of one to three on the cliff tops. Each is its own node on one of three shared geometries, so the wind bends
  // every crown on its own phase for three draws; each claims its own slot, so nothing else stands in its trunk or
  // crown. The meadow's keep out of every open cave's doorway, off every gorilla's run between caves (the straight
  // line one walks from a work cave's doorway to another's apron), off the foot of the Mempool island's stair, where
  // every bedtime walk ends, and out of the south, where the totems and the Oogatron face the pile; the first frame
  // the north pass, one each side where it fits. A trunk stands PALM_PATH off every path; one the pile's ring path
  // grows to is removed.
  const PALM_COUNT = 8, PALM_CANDIDATES = 400, PALM_GAP = 5, PALM_INNER = 6, PALM_OUTER = MEADOW_OUTER - 2.5;
  const PALM_RUN_CLEAR = 3, PALM_STAIR_CLEAR = 6, PALM_SOUTH = 45 * DEG, PALM_PATH = 0.9;
  // The visit's meadow palms, { owner, reservation }, for the ring to take back.
  const meadowPalms = [];
  const plantPalms = () => {
    if (renderer.kind === "canvas2d") return;
    const rand = mulberry32(fnv1a("palms"));
    let n = 0;
    // Level ground off the paths and stairs, with nothing else claimed where the trunk would stand.
    const stands = (x, z) => {
      const y = island.surfaceAt(x, z);
      if (nearPath(x, z, PALM_PATH) || island.overlapsStairs(x, z, 2) || !free(x, z, 1.2)) return false;
      // Level ground only: every side within a quarter metre of the foot.
      for (let i = 0; i < 4; i++) if (Math.abs(island.surfaceAt(x + Math.cos(i * 1.571) * 0.6, z + Math.sin(i * 1.571) * 0.6) - y) > 0.26) return false;
      return true;
    };
    const plant = (x, z) => {
      if (!stands(x, z)) return null;
      const y = island.surfaceAt(x, z);
      const node = createNode({ geometry: BL.dressing.palm(n++ % 3), position: { x, y, z }, rotation: { x: 0, y: rand() * Math.PI * 2, z: 0 }, sightHidden: true });
      addChild(root, node);
      placed.push(node);
      const owner = addProp("palm", node, x, z, 1.6);
      solids.add(node);
      return { owner, reservation: claim(x, z, 1.2) };
    };
    // A grove: up to `size` palms round a centre a trunk-and-crown apart (2.9 m), each standing only where it fits.
    const grove = (cx, cz, size, fits) => {
      if (size === 1) return fits(cx, cz) && plant(cx, cz) ? 1 : 0;
      let planted = 0;
      const a0 = rand() * Math.PI * 2, r = size === 2 ? 1.45 : 1.68;
      for (let k = 0; k < size; k++) {
        const a = a0 + k * Math.PI * 2 / size, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (fits(x, z) && plant(x, z)) planted++;
      }
      return planted;
    };
    const groveSize = () => {
      const r = rand();
      return r < 0.25 ? 1 : r < 0.65 ? 2 : 3;
    };
    // The gorillas' runs join every pair of work caves, from either cave's doorway step or apron (2.6 m and 5.5 m
    // out, where clankers.js walks a gorilla out and in) to either of the other's.
    const ends = caves.slots.filter(workCave).map((slot) => {
      const m = island.mouths.find((entry) => entry.id === slot.id), sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      return [2.6, 5.5].map((d) => ({ x: m.x + sr * d, z: m.z + cr * d }));
    });
    // Where a bed trip leaves the meadow (clankerBeds' first point).
    const foot = poolModels.SITE.approachFrom - 0.8, footX = poolModels.DIR.x * foot, footZ = poolModels.DIR.z * foot;
    const runs = [];
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++)
      for (const a of ends[i]) for (const b of ends[j]) runs.push(a, b);
    const offRuns = (x, z) => {
      for (let i = 0; i < runs.length; i += 2) {
        const a = runs[i], dx = runs[i + 1].x - a.x, dz = runs[i + 1].z - a.z;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < PALM_RUN_CLEAR) return false;
      }
      return true;
    };
    // Nothing within PALM_SOUTH of due south, the meadow between the Headquarters mouths: the clearing before the
    // totems and the Oogatron's board.
    const meadowFits = (x, z) => island.surfaceAt(x, z) === 0 && !nearMouth(x, z, 6) && entranceClear(x, z, 1.2) && offRuns(x, z)
      && Math.hypot(x - footX, z - footZ) >= PALM_STAIR_CLEAR && Math.atan2(Math.abs(x), z) >= PALM_SOUTH && stands(x, z);
    // The north end: a palm either side of the pass, from the meadow's edge, the only ground there beyond the runs.
    const northPalm = (side) => {
      for (let deg = 14; deg >= 6; deg--) for (let r = MEADOW_OUTER; r >= MEADOW_OUTER - 1.5; r -= 0.25) {
        const p = polar(side * deg, r);
        if (meadowFits(p.x, p.z)) { meadowPalms.push(plant(p.x, p.z)); return; }
      }
    };
    northPalm(-1);
    northPalm(1);
    // Best candidate: of PALM_CANDIDATES seeded spots each time, the fitting one farthest from the palms already
    // standing, so they spread evenly at every distance from the pile, none nearer another than PALM_GAP. The radius
    // is drawn uniformly, not by area, so the inner meadow holds its share.
    for (let k = meadowPalms.length; k < PALM_COUNT; k++) {
      let x = 0, z = 0, best = PALM_GAP;
      for (let c = 0; c < PALM_CANDIDATES; c++) {
        const p = polar(rand() * 360, lerp(PALM_INNER, PALM_OUTER, rand()));
        let gap = Infinity;
        for (const { owner } of meadowPalms) gap = Math.min(gap, Math.hypot(owner.x - p.x, owner.z - p.z));
        if (gap > best && meadowFits(p.x, p.z)) { best = gap; x = p.x; z = p.z; }
      }
      if (best === PALM_GAP) break;
      meadowPalms.push(plant(x, z));
    }
    // Along the cliff tops, where they break the skyline.
    const cliffTop = (x, z) => island.surfaceAt(x, z) > 2.5 && !nearMouth(x, z, 5);
    for (let deg = 11, placedTop = 0; deg < 360 && placedTop < 16; deg += 34) {
      const size = groveSize();
      for (let k = 0; k < 5; k++) {
        const p = polar(deg + (rand() - 0.5) * 14, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        const planted = grove(p.x, p.z, size, cliffTop);
        if (planted) { placedTop += planted; break; }
      }
    }
  };
  // The pile's ring path widens as the pile grows: a meadow palm it comes within PALM_PATH of is removed for the
  // rest of the visit, its pick, prop, solid and claim with it. The next visit plants only where the ring leaves room.
  const clearRingPalms = () => {
    const reach = island.path.debug.ringOuterRadius + PALM_PATH;
    let removed = false;
    for (let i = meadowPalms.length - 1; i >= 0; i--) {
      const { owner, reservation } = meadowPalms[i];
      if (Math.hypot(owner.x, owner.z) >= reach) continue;
      meadowPalms.splice(i, 1);
      input.remove(owner.node); drop(targets, owner.node); drop(props, owner); drop(claimed, reservation);
      solids.remove(owner.node); removeChild(root, owner.node); drop(placed, owner.node);
      removed = true;
    }
    if (removed && clankers) clankers.supportRemoved();
  };
  // The sea far below and the islands on it, standing well out past the clouds.
  const SEA_Y = -70;
  const raiseIslets = () => {
    if (renderer.kind === "canvas2d") return;
    const spots = [[25, 260], [95, 330], [160, 240], [215, 300], [290, 280], [340, 360]];
    spots.forEach(([deg, r], i) => {
      const p = polar(deg, r);
      // Scenery on the horizon: no outlines, sight tests or cover ever need it.
      const node = createNode({ geometry: BL.dressing.islet(i % 3), position: { x: p.x, y: SEA_Y - 2, z: p.z }, rotation: { x: 0, y: deg * 0.7, z: 0 }, sightHidden: true });
      addChild(root, node);
      placed.push(node);
    });
  };
  // Life over the sea: gulls wheeling round the island and sails out on the water. Keep these moving at
  // every distance: their silhouettes are visible from the hub long before the camera gets close.
  let life = null;
  const buildLife = () => {
    if (renderer.kind === "canvas2d") return;
    const gulls = BL.dressing.flock({ count: 22, radius: [28, 70], height: [8, 30], seed: 3 });
    const shore = BL.dressing.flock({ count: 10, radius: [90, 150], height: [SEA_Y + 6, SEA_Y + 20], seed: 8, scale: 3 });
    // Keep the full hulls between the main island's outlying islets and the sea stacks starting at r240.
    const boats = BL.dressing.fleet({ sea: SEA_Y, spots: [[140, 0.4, 5.6], [160, 2.2, 6.8], [125, 3.9, 6.2], [150, 5.1, 5.3], [170, 1.3, 7.3]] });
    for (const node of [gulls.node, shore.node, ...boats.nodes]) {
      addChild(root, node);
      placed.push(node);
    }
    life = { gulls, shore, boats };
  };
  const buildLawn = () => {
    if (renderer.kind === "canvas2d") return;
    const node = createNode({ geometry: hubModels.lawnTuft(), screenCull: true, instanceData: new Float32Array(LAWN_CAP * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true });
    addChild(root, node);
    placed.push(node);
    lawn = { node, version: -1 };
    layLawn();
  };
  const registerClimbMasonry = (node, mouth) => {
    node.climbMasonry = true;
    const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry), y = mouth.floorY + node.position.y;
    const slabs = node.geometry.climbBoxes, boxes = [];
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let at = 0; at < slabs.length; at += 6) {
      const box = new Float64Array(24);
      for (let corner = 0; corner < 8; corner++) {
        const x = slabs[at + (corner & 1 ? 3 : 0)], z = slabs[at + (corner & 4 ? 5 : 2)] + node.position.z;
        const wx = mouth.x + cr * x + sr * z, wy = y + slabs[at + (corner & 2 ? 4 : 1)], wz = mouth.z - sr * x + cr * z;
        box[corner * 3] = wx; box[corner * 3 + 1] = wy; box[corner * 3 + 2] = wz;
        minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz);
        maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz);
      }
      boxes.push(box);
    }
    climbMasonry.push({
      node, x: mouth.x, y, z: mouth.z, sr, cr, offsetZ: node.position.z,
      boxes, minX, minY, minZ, maxX, maxY, maxZ
    });
  };
  const buildMouth = (slot, m) => {
    const ax = Math.sin(m.ry), az = Math.cos(m.ry);
    const caveIndex = island.mouths.indexOf(m) + 1;
    const group = createNode({ position: { x: m.x, y: m.floorY, z: m.z }, rotation: { x: 0, y: m.ry, z: 0 } });
    const rim = createNode({ position: { x: 0, y: slot.status === "headquarters" ? 0 : -RIM_SEAM_DROP, z: PORTAL_Z }, geometry: hubModels.caveMouthRim(slot.status === "headquarters" ? 1 : 0), sightSolid: true });
    addChild(group, rim);
    solids.add(rim);
    registerClimbMasonry(rim, m);
    if (slot.status === "headquarters") {
      const lintel = createNode({ position: { x: 0, y: -RIM_SEAM_DROP, z: PORTAL_Z }, geometry: hubModels.caveMouthRim(2), sightSolid: true });
      addChild(group, lintel);
      solids.add(lintel);
      registerClimbMasonry(lintel, m);
      headquartersRimLintels.push(lintel);
    }
    if (slot.status === "dark") {
      const geometry = hubModels.sealedCaveFace(sealedCaveVariant(slot.id));
      const seal = createNode({ position: { x: 0, y: 0, z: 0.52 }, geometry, matrixExterior: true, sightSolid: true });
      addChild(group, seal);
      solids.add(seal);
      registerClimbMasonry(seal, m);
      sealedCaves.push({ caveIndex, mouth: m, node: seal, sr: ax, cr: az, stopZ: seal.position.z + geometry.frontZ + 0.01 });
      closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: seal.position.z + geometry.frontZ + 0.26 });
    } else if (slot.status === "mirror") {
      const opening = rim.geometry.openingBounds;
      const geometry = { ...hubModels.matrixPrisonBars(), matrixCave: caveIndex, clipMinY: m.floorY + opening.floorY, clipMaxY: m.floorY + opening.ceilingY };
      const bars = createNode({ position: { x: 0, y: MATRIX_GATE_HIDDEN_Y, z: 0.78 }, geometry, visible: false, matrixExterior: true });
      addChild(group, bars);
      const bounds = BL.scene.boundsOf(geometry);
      matrixGates.push({ kind: "matrix-gate", caveIndex, mouth: m, node: bars, sr: ax, cr: az, open: false, localOpen: false, locked: false, raising: false, held: false, floor: opening.floorY, ceiling: opening.ceilingY, bottom: bounds.min[1], top: bounds.max[1], minX: bounds.min[0], maxX: bounds.max[0], minZ: bars.position.z + bounds.min[2], maxZ: bars.position.z + bounds.max[2] });
    }
    if (slot.status === "headquarters") {
      addChild(group, createNode({ position: { x: 0, y: 0, z: 0 }, geometry: headquartersModels.entranceRamp(), depthBias: 0.25 }));
    } else if (slot.status === "open" && slot.scene === "arcade") {
      // Ooga Arcade's mouth: two cabinets glowing in the dark inside, each showing its loop's first frame.
      const AM = BL.arcadeModels;
      for (const [c, x, turn] of [[AM.CABINETS[0], -1.3, 0.25], [AM.CABINETS[3], 1.3, -0.25]]) {
        const cabinet = createNode({ position: { x, y: 0, z: -4.4 }, rotation: { x: 0, y: turn, z: 0 }, geometry: AM.cabinet(c.index) });
        addChild(cabinet, createNode({ position: { x: 0, y: AM.SCREEN.y, z: AM.SCREEN.z }, rotation: { x: AM.SCREEN.lean, y: 0, z: 0 }, geometry: AM.attractFrames(c.game)[0], sightHidden: true }));
        addChild(group, cabinet);
        solids.add(cabinet);
      }
      arcadeMouth = { slot, x: m.x + ax * MOUTH_ACTION_Z, y: m.floorY + 1.1, z: m.z + az * MOUTH_ACTION_Z };
    } else if (slot.status === "open" && slot.scene === "lab") {
      const lab = hubModels.entropyLab(m.room, m.floorY);
      addChild(group, lab.node);
      for (const node of lab.solids) solids.add(node);
      for (const display of lab.displays) if (display.node.geometry.imageSurface) {
        addTarget(display.node, { kind: "lab-link", priority: 2, weaponType: "none" });
      }
      const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const stations = lab.stations.map((station) => ({
        ...station,
        x: m.x + cr * station.x + sr * station.z, y: m.floorY + (station.y || 0),
        z: m.z - sr * station.x + cr * station.z, heading: m.ry + station.heading
      }));
      for (const item of lab.equipment) {
        const p = item.pickup, x = p.x, z = p.z;
        p.x = m.x + cr * x + sr * z; p.y += m.floorY; p.z = m.z - sr * x + cr * z;
        item.holder = null;
      }
      entropyLab = { ...lab, group, mouth: m, opening: rim.geometry.openingBounds, stations, phase: null };
    } else if (slot.status === "open" && slot.scene === "factory") {
      // The Lightning Factory's tunnel: timber sets and lamps down to a phase shield like the lab's, set further in.
      const tunnel = BL.factoryModels.hubTunnel();
      addChild(group, createNode({ geometry: tunnel.timber }), createNode({ geometry: tunnel.glow, sightHidden: true }));
      const tube = BL.factoryModels.ROOF_TUBE, sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const tx = m.x + cr * tube.x + sr * tube.z, tz = m.z - sr * tube.x + cr * tube.z;
      const base = island.surfaceAt(tx, tz) - 0.35;
      const outlet = createNode({ position: { x: tube.x, y: base - m.floorY, z: tube.z }, geometry: BL.factoryModels.bananaOutlet() });
      addChild(group, outlet);
      solids.add(outlet);
      if (island.roofOpening) {
        const shaft = createNode({ position: { x: tube.x, y: base - m.floorY, z: tube.z }, geometry: BL.factoryModels.outletShaft(base - island.roofOpening.bottom) });
        addChild(group, shaft); solids.add(shaft);
      }
      factoryMouth = {
        slot, mouth: m, group, opening: rim.geometry.openingBounds, phase: null,
        deliverySource: { x: tx, y: base + tube.height, z: tz }
      };
    } else if (slot.status === "open" && slot.place === "bca") {
      // B.C.A.'s office behind its veil: two desks, their chairs, abacuses and screens, shelves and the firm's plaque.
      const office = BL.bcaModels.office(m);
      addChild(group, office.node);
      for (const node of office.solids) solids.add(node);
      bcaMouth = { slot, mouth: m, group, opening: rim.geometry.openingBounds, phase: null, office };
    } else if (slot.status === "open") {
      const geometry = hubModels.caveShelves(), back = -6.5 - BL.scene.boundsOf(geometry).min[2];
      for (const x of [-1.3, 1.3]) {
        const shelves = createNode({ position: { x, y: 0, z: back }, geometry });
        addChild(group, shelves); solids.add(shelves);
      }
    } else if (slot.status === "mirror") {
      // Sit inside the rim so the cave floor ends behind the reflection.
      const node = createNode({ position: { x: 0, y: 1.5, z: 0.5 }, geometry: hubModels.mirrorPanel(), mirror: true, mirrorWalkThrough: true, mirrorReveal: 0 });
      addChild(group, node);
      mirrorCave = { slot, mouth: m, group, rim, node, sign: null };
      addTarget(node, { kind: "cave", slot, priority: 1 });
      // Keep the room empty; this state only caches the shared action prompt.
      matrixControl = { promptPlayer: null, promptAction: null, promptJet: false, promptRecovering: false };
    } else if (slot.status === "sleeping") {
      // Bedrolls lie along +x, as the sleep pose assumes.
      addChild(group, createNode({ position: { x: 0, y: 0.05, z: -4.5 }, rotation: { x: 0, y: -m.ry, z: 0 }, geometry: hubModels.bedroll(), depthBias: 0.3 }));
      sleepers.push({ x: m.x + ax * 0.8, y: 4.4, z: m.z + az * 0.8, timer: sleepers.length * 0.7 });
    }
    if (slot.status === "open" || slot.status === "mirror") {
      const signZ = slot.scene === "arcade" ? 0.055 : CAVE_SIGN_Z;
      const sign = createNode({ position: { x: 0, y: CAVE_SIGN_Y, z: signZ }, geometry: hubModels.caveSign(slot.name, THEME_ICON(slot), false, true), matrixEmissiveLiving: true, sightHidden: slot.scene === "lab" });
      addChild(group, sign);
      trackCaveSign(sign, slot, m);
      addCaveSignTarget(sign, slot, m);
      const halfW = sign.geometry.signWidth * 0.5, halfH = sign.geometry.signHeight * 0.5;
      const x = m.x + ax * sign.position.z, y = m.floorY + sign.position.y, z = m.z + az * sign.position.z;
      const tx = Math.cos(m.ry), tz = -Math.sin(m.ry);
      labels.push({
        x, y, z, ax, az, text: slot.name, node: sign,
        world: [
          { x: x - tx * halfW, y: y + halfH, z: z - tz * halfW },
          { x: x + tx * halfW, y: y + halfH, z: z + tz * halfW },
          { x: x + tx * halfW, y: y - halfH, z: z + tz * halfW },
          { x: x - tx * halfW, y: y - halfH, z: z - tz * halfW }
        ]
      });
      if (mirrorCave && mirrorCave.slot === slot) mirrorCave.sign = sign;
    }
    if (slot.status !== "mirror" && slot.scene !== "lab" && slot.scene !== "factory" && slot.place !== "bca") {
      const seal = slot.status === "dark" ? sealedCaves[sealedCaves.length - 1] : null;
      caveVeils.push({ mouth: m, group, opening: rim.geometry.openingBounds,
        plane: seal ? seal.stopZ + 0.02 : PORTAL_Z, tint: slot.scene === "arcade" ? ARCADE_VEIL_TINT : null, phase: null });
    }
    dressMouth(slot, m, group);
    addChild(root, group);
    placed.push(group);
    if (slot.status === "mirror") {
      matrixCave = { mouth: m, caveIndex, sr: ax, cr: az, portal: buildMatrixPortal(m) };
      const gate = matrixGates.find((candidate) => candidate.caveIndex === matrixCave.caveIndex);
      mirrorCave.gate = gate;
      const gateShift = MIRROR_GATE_Z - gate.node.position.z;
      gate.node.position.z = MIRROR_GATE_Z;
      gate.minZ += gateShift;
      gate.maxZ += gateShift;
      gate.locked = MIRROR_GATE_CLOSED;
      if (gate.locked) {
        gate.node.position.y = gate.floor;
        gate.node.visible = true;
        closedCaveZones.push({ active: true, x: m.x, z: m.z, floor: m.floorY, sr: ax, cr: az, half: PORTAL_MAX_X + 0.25, front: PORTAL_Z + 0.25 });
      }
    }
    return rim;
  };
  const buildHeadquarters = () => {
    const floor = island.headquarters.floor, basement = island.headquarters.basement;
    const room = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: headquartersModels.room() });
    addChild(root, room);
    placed.push(room);
    solids.add(room);
    const benches = [];
    for (const x of [-2.6, 2.6]) for (const z of [-0.55, 0.55]) benches.push({ kind: "bench", x, y: floor + 0.58, z, floor, ry: Math.atan2(-x, -z), sitter: null, walkAt: { x: x - Math.sign(x) * 0.85, z } });
    const entrances = [], lights = [], mattresses = [], roomSigns = [], rampMarkers = [], lazyBeds = [];
    FLY.yMin = basement.floor - 1;
    const addEntrance = (node, roomIndex, lower, ramp = false) => {
      node.sightSolid = true;
      addChild(root, node);
      placed.push(node);
      solids.add(node, true);
      const bounds = BL.scene.boundsOf(node.geometry);
      entrances.push({ roomIndex, node, basement: lower, ramp, sr: Math.sin(node.rotation.y), cr: Math.cos(node.rotation.y), radius: Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * node.scale.x, Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))), minY: node.position.y + bounds.min[1], maxY: node.position.y + bounds.max[1] });
    };
    const torchAt = (x, y, z) => {
      const node = createNode({ position: { x, y, z }, geometry: hubModels.torch(), glow: 0.85, matrixEmissiveLiving: true });
      addChild(root, node);
      placed.push(node);
      lights.push({ id: `headquarters:${lights.length}`, node, x, y: y + 1.6, z });
    };
    for (const level of [island.headquarters, basement]) for (const cave of level.rooms) {
      const i = cave.index, angle = cave.angle;
      const entrance = createNode({ position: { x: cave.entrance.x, y: cave.floor, z: cave.entrance.z }, rotation: { x: 0, y: -angle, z: 0 }, scale: { x: (cave.corridorWidth ?? cave.width - 1.3) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.roomEntrance(i) });
      addEntrance(entrance, i, level === basement);
      const dimensions = headquartersModels.MATTRESS, across = -(cave.width / 2 - dimensions.wallInset - dimensions.width / 2), along = cave.depth / 2 - dimensions.wallInset - dimensions.depth / 2;
      const sx = Math.sin(angle), cx = Math.cos(angle), geometry = LAZY_BEDDING ? headquartersModels.mattressPlaceholder(cave) : headquartersModels.mattress(cave);
      const sign = createNode({ position: { x: cave.entrance.x - sx * 0.28, y: cave.floor + 3.78, z: cave.entrance.z + cx * 0.28 }, rotation: { x: 0, y: -angle, z: 0 }, geometry: headquartersModels.roomSign(cave, LAZY_BEDDING), matrixSignLiving: true });
      addChild(root, sign);
      placed.push(sign);
      const hanging = { roomIndex: i, basement: level === basement, room: cave, node: sign, sr: -sx, cr: cx, velocity: 0, hits: 0, contacts: 0 };
      roomSigns.push(hanging);
      addTarget(sign, { kind: "room-sign", roomSign: hanging });
      const node = createNode({ position: { x: cave.x + cx * across + sx * along, y: cave.floor, z: cave.z + sx * across - cx * along }, rotation: { x: 0, y: -angle, z: 0 }, geometry });
      addChild(root, node);
      placed.push(node);
      const side = dimensions.width / 2 + 0.5;
      mattresses.push({
        roomIndex: i, basement: level === basement, corner: "rear-left", room: cave, node, ...geometry.mattress,
        x: node.position.x, y: cave.floor, z: node.position.z, sr: -sx, cr: cx, sleeper: null, sleep: dimensions,
        window: island.headquarters.windows.find((window) => window.kind === "room" && window.roomIndex === i && window.basement === (level === basement)), sightFrame: -1, sightVisible: false,
        collisionBoxes: new Float64Array([-dimensions.width / 2, 0, -dimensions.depth / 2, dimensions.width / 2, dimensions.surface, dimensions.depth / 2,
        -0.45, dimensions.surface, dimensions.pillowZ - 0.25, 0.45, dimensions.pillowTop, dimensions.pillowZ + 0.25]),
        walkAt: { x: node.position.x + cx * side, y: cave.floor, z: node.position.z + sx * side }
      });
      if (LAZY_BEDDING) lazyBeds.push({ bed: mattresses[mattresses.length - 1], ready: false, failed: false });
    }
    for (const ramp of basement.ramps) {
      const p = ramp.entrance;
      // Scale so the model's inner opening, including the voxel edge, clears the tunnel.
      const entrance = createNode({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: -ramp.angle, z: 0 }, scale: { x: (ramp.width + island.unit * Math.SQRT2) / 3.86, y: 1, z: 1 }, geometry: headquartersModels.rampEntrance(ramp.index) });
      addEntrance(entrance, ramp.index, false, true);
    }
    const addRampMarker = (ramp, label, floor, channel) => {
      const first = ramp.samples[0], ahead = ramp.samples[Math.min(3, ramp.samples.length - 1)];
      const dx = ahead.x - first.x, dz = ahead.z - first.z, length = Math.hypot(dx, dz) || 1;
      const direction = { x: dx / length, z: dz / length };
      const at = (distance) => {
        let i = 1; while (i < ramp.samples.length - 1 && ramp.samples[i].s < distance) i++;
        const from = ramp.samples[i - 1], to = ramp.samples[i], k = (distance - from.s) / (to.s - from.s);
        return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k };
      };
      // Both smaller marks sit inside the opening and follow the real ramp
      // pitch. The label comes first; its arrow continues farther downhill.
      const fitted = (distance, geometry) => {
        const half = Math.min(0.35, distance * 0.3), point = at(distance), from = at(distance - half), to = at(distance + half);
        const tx = to.x - from.x, ty = to.y - from.y, tz = to.z - from.z, horizontal = Math.hypot(tx, tz) || 1;
        return {
          point, node: createNode({
            position: { x: point.x, y: point.y + 0.035, z: point.z }, rotation: { x: Math.atan2(-ty, horizontal), y: Math.atan2(tx, tz), z: 0 },
            scale: { x: 0.72, y: 0.72, z: 0.72 }, geometry, visible: false, depthBias: 0.35
          })
        };
      };
      const labelDistance = Math.min(0.85, ramp.length * 0.12), arrowDistance = Math.min(1.85, ramp.length * 0.24);
      const labelMark = fitted(labelDistance, null);
      const arrowMark = fitted(arrowDistance, headquartersModels.rampMarkerArrow());
      const frame = labelMark.node, arrow = arrowMark.node, labelPoint = labelMark.point, arrowPoint = arrowMark.point;
      const node = createNode({ geometry: headquartersModels.rampMarkerLabel(label), depthBias: 0.35 });
      const yaw = frame.rotation.y, pitch = frame.rotation.x;
      const across = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
      const downhill = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      addChild(frame, node);
      addChild(root, frame, arrow);
      placed.push(frame, arrow);
      rampMarkers.push({ node, frame, arrow, label, across, downhill, channel, ramp, direction, labelDistance, arrowDistance, labelPoint, arrowPoint });
    };
    for (let i = 0; i < island.headquarters.ramps.length; i++) addRampMarker(island.headquarters.ramps[i], "HQ", 0, i);
    for (let i = 0; i < basement.ramps.length; i++) addRampMarker(basement.ramps[i], "B1", floor, i + 2);
    for (const ramp of island.headquarters.ramps) {
      const p = ramp.samples[30], angle = Math.atan2(p.x, -p.z), radius = Math.hypot(p.x, p.z) - 1.6;
      torchAt(Math.sin(angle) * radius, p.y + 0.6, -Math.cos(angle) * radius);
    }
    const firepit = createNode({ position: { x: 0, y: floor, z: 0 }, geometry: hubModels.firepit() });
    solids.add(firepit);
    // The island's voxel flame burns in the HQ hearth too; its embers are the hub's critter batch at the hearth.
    const rig = BL.blaze.createVoxelRig({ scale: 1, sightHidden: true });
    addChild(firepit, rig.root);
    fireRigs.push(rig);
    fireHazards.push({ node: rig.root, boxes: rig.boxes, pit: firepit, x: 0, y: floor, z: 0, avoidRadius: FIRE_AVOID_RADIUS });
    addChild(root, firepit);
    placed.push(firepit);
    const hearth = { id: "headquarters:hearth", node: rig.root, rig, x: 0, y: floor + 0.6, z: 0, phase: 23 };
    lights.push(hearth);
    // The hearth is the only shared HQ point light.
    // Windows and ramp torches stay physical/emissive; no camera-proximity light spills into an unclaimed room.
    const sources = [hearth];
    return { node: room, entrances, mattresses, roomSigns, rampMarkers, lazyBeds, benches, fireHazards, lights, sources, hearth, firepit, rooms: island.headquarters.rooms, windows: island.headquarters.windows, ramps: island.headquarters.ramps, openFloor: island.headquarters.room, basement, sleepMarksVisible };
  };
  // An invisible one-way staircase continues from the dock into the sky. It
  // only arms from a grounded step off the outer deck: arriving from the air,
  // or jumping once on it, leaves every tread intangible until the visitor
  // returns to the dock. A fixed glyph pool reveals nearby treads after each
  // foot contact, without adding collision meshes or per-frame allocations.
  const buildDockStairs = (dock) => {
    const START = 4.25, RUN = 0.62, RISE = 0.5, HALF_WIDTH = 0.78, EFFECT_TIME = 2.8;
    const REVEAL_RADIUS = 3, GLYPH_POOL = 40;
    const base = dock.position.y, count = Math.ceil((FLY.yMax - base) / RISE), end = START + count * RUN;
    const ry = dock.rotation.y, ux = Math.cos(ry), uz = -Math.sin(ry), vx = Math.sin(ry), vz = Math.cos(ry);
    const glyphs = [];
    for (let i = 0; i < GLYPH_POOL; i++) {
      const node = createNode({ visible: false, rotation: { x: -Math.PI / 2, y: ry, z: 0 }, geometry: hubModels.matrixGlyph(i % MATRIX_TYPES), glow: 1 });
      node.dockLife = 0;
      node.dockStep = 0;
      addChild(root, node);
      placed.push(node);
      glyphs.push(node);
    }
    let active = false, owner = null, lastStep = 0, nextGlyph = 0, contacts = 0, jumpRejects = 0;
    const alongAt = (x, z) => (x - dock.position.x) * ux + (z - dock.position.z) * uz;
    const acrossAt = (x, z) => (x - dock.position.x) * vx + (z - dock.position.z) * vz;
    const indexAt = (along, across, radius = PLAYER_RADIUS) => {
      if (Math.abs(across) > HALF_WIDTH + radius || along < START - radius || along > end + radius) return 0;
      return Math.min(count, Math.max(1, Math.floor((along + radius - START) / RUN) + 1));
    };
    const floorAt = (index) => Math.min(FLY.yMax, base + index * RISE);
    const groundedOnDock = (actor) => {
      if (!actor || actor !== pilot?.player || actor.hop !== 0 || actor.hopV > 0 || actor.jet?.thrust) return false;
      const p = actor.root.position, feet = p.y - actor.baseY, along = alongAt(p.x, p.z), across = acrossAt(p.x, p.z);
      return along >= 3 - PLAYER_RADIUS && along <= START + 0.1 && Math.abs(across) <= 1 + PLAYER_RADIUS && Math.abs(feet - base) < 0.08;
    };
    const reset = (jumped = false) => {
      if (jumped && active) jumpRejects++;
      active = false; owner = null; lastStep = 0;
    };
    const supportAt = (x, z, y, maxStep, actor, entering) => {
      if (actor !== pilot?.player) return -Infinity;
      if (active && (actor !== owner || actor.hop > 1e-7 || actor.hopV > 0 || actor.jet?.thrust)) reset(true);
      const along = alongAt(x, z), across = acrossAt(x, z), index = indexAt(along, across);
      if (!active) {
        // Only a real walking destination may arm the first tread. Camera,
        // spawn and ordinary ground probes pass entering=false.
        if (!entering || index !== 1 || !groundedOnDock(actor)) return -Infinity;
        active = true; owner = actor; lastStep = 0;
      }
      if (!index) return -Infinity;
      const floor = floorAt(index);
      return floor <= y + maxStep + 1e-7 ? floor : -Infinity;
    };
    const reveal = (index, distance) => {
      if (index < 1 || index > count) return;
      let node = null;
      for (let i = 0; i < glyphs.length; i++) {
        if (glyphs[i].dockLife > 0 && glyphs[i].dockStep === index) { node = glyphs[i]; break; }
      }
      if (!node) {
        node = glyphs[nextGlyph];
        nextGlyph = (nextGlyph + 1) % glyphs.length;
      }
      const along = START + (index - 0.5) * RUN;
      node.position.x = dock.position.x + ux * along;
      node.position.y = floorAt(index) + 0.018;
      node.position.z = dock.position.z + uz * along;
      node.scale.x = node.scale.y = 4.4;
      node.scale.z = 1;
      node.glow = 1;
      node.dockStep = index;
      node.dockLife = Math.max(node.dockLife, EFFECT_TIME - distance * 0.18);
      node.visible = true;
    };
    const emit = (index) => {
      for (let offset = -REVEAL_RADIUS; offset <= REVEAL_RADIUS; offset++) reveal(index + offset, Math.abs(offset));
      contacts++;
    };
    const update = (dt, actor) => {
      for (let i = 0; i < glyphs.length; i++) {
        const node = glyphs[i];
        if (node.dockLife <= 0) continue;
        node.dockLife = Math.max(0, node.dockLife - dt);
        const k = node.dockLife / EFFECT_TIME;
        node.scale.x = node.scale.y = 3.5 + k * 0.9;
        node.glow = 0.35 + k * 0.65;
        if (!node.dockLife) node.visible = false;
      }
      if (!active || actor !== owner) return;
      if (actor.hop > 1e-7 || actor.hopV > 0 || actor.jet?.thrust) { reset(true); return; }
      const p = actor.root.position, along = alongAt(p.x, p.z), across = acrossAt(p.x, p.z), index = indexAt(along, across);
      if (!index) {
        if (along <= START && Math.abs(across) <= 1 + PLAYER_RADIUS) reset(false);
        return;
      }
      const feet = p.y - actor.baseY;
      if (Math.abs(feet - floorAt(index)) < 0.08 && index !== lastStep) {
        lastStep = index;
        emit(index);
      }
    };
    return {
      supportAt, update, reset, alongAt, acrossAt, indexAt, floorAt,
      base, start: START, run: RUN, rise: RISE, halfWidth: HALF_WIDTH, count, end, top: FLY.yMax, glyphs,
      get active() { return active; }, get lastStep() { return lastStep; }, get contacts() { return contacts; }, get jumpRejects() { return jumpRejects; }
    };
  };
  // A poked animal cries out from the shared bubble pool and startles: its own brain decides what that means
  // (the jaguar bolts, the monkey makes for a tree, the toucan takes off, a sleeper wakes).
  const pokeBeast = (node, kind) => {
    const beast = beasts.get(node);
    if (!beast) return;
    const cries = BEAST_CRIES[kind];
    fx.sayAt(beast.wx, beast.wy + (kind === "toucan" ? 0.9 : 1.1), beast.wz, cries[fnv1a(`${kind}/${Math.floor(now * 3)}`) % cries.length], 1.8);
    mempoolIsland.wildlife.startle(beast);
  };
  // The Mempool island off the east rim: a rainforest round a lake, a vine bridge, and the tunnels and chamber
  // under the lake. Everything solid, so an Ooga walks across, in and all the way down without a scene change.
  // `pool-layout.js` says where everything is; the scatter is claimed off the crossing.
  const buildMempoolIsland = function* (slice) {
    const P = poolModels, S = P.SITE, DIR = P.DIR, L = BL.poolLayout;
    // How much ground an animal keeps to itself, measured against each plant's own footprint.
    const BEAST_CLEAR = 1.3;
    const place = P.spot(island, {});
    const site = P.build(place);
    // The group is turned by `place.ry`, so a local point reaches world through that same rotation:
    // local +x runs to (cos ry, -sin ry) and local +z to (sin ry, cos ry).
    const cos = Math.cos(place.ry), sin = Math.sin(place.ry);
    const worldX = (lx, lz) => place.x + lx * cos + lz * sin;
    const worldZ = (lx, lz) => place.z - lx * sin + lz * cos;
    const localX = (wx, wz) => (wx - place.x) * cos - (wz - place.z) * sin;
    const localZ = (wx, wz) => (wx - place.x) * sin + (wz - place.z) * cos;
    // Sleeping anchors use the planted scenery's original collision transforms, even while a tapped tree shakes.
    const sleepSolids = BL.solidProps.create();
    const atNode = (kind, node, radius) => {
      const owner = addProp(kind, node, worldX(node.position.x, node.position.z), worldZ(node.position.x, node.position.z), radius);
      if (SOLID_PROPS.has(kind)) sleepSolids.add(node);
      return owner;
    };
    addChild(root, site.node);
    placed.push(site.node);
    // Capped in a cut view only when the walker the view follows is on this island or about to be.
    addTerrainSection(site.ground.geometry.cutawaySource, site.node, place.y).when = () => Math.hypot(cutawayX - place.x, cutawayZ - place.z) < S.reach + 40;
    // The body, the smooth floors laid over its steps, the lake's membrane and the plank crossings are all walked on.
    for (const node of [site.ground, site.floor, site.membrane, ...site.crossings]) { solids.add(node); sleepSolids.add(node); }
    site.floor.sightHidden = true;
    for (const node of site.crossings) node.sightHidden = true;
    addProp("poolbridge", site.bridge, worldX(0, place.bridgeLocalZ + S.span / 2), worldZ(0, place.bridgeLocalZ + S.span / 2), S.width);
    sleepSolids.add(site.bridge);
    addLamp(site.bridge, LAMP.lantern, worldX(0, place.bridgeLocalZ), place.y + 3.4, worldZ(0, place.bridgeLocalZ), false, 0, "poolbridge:lanterns").nightOnly = true;
    atNode("poolsign", site.sign, site.sign.geometry.signWidth * 0.55);
    signDetails.push({
      node: site.sign, solid: site.sign.geometry, pixels: hubModels.caveSign("Mempool Rainforest", null, true),
      x: worldX(site.sign.position.x, site.sign.position.z), y: place.y + site.sign.position.y,
      z: worldZ(site.sign.position.x, site.sign.position.z)
    });
    // Centre the board across the pool on the bridge's axis, facing the crossing with trees behind it.
    // Its face and lettering stay curved around the pool's centre at this same radius.
    const B = P.CHAIN_BOARD, boardBearing = Math.PI;
    const boardNode = createNode({ position: { x: Math.sin(boardBearing) * B.r, y: L.LEVEL.shore, z: Math.cos(boardBearing) * B.r }, rotation: { x: 0, y: boardBearing + Math.PI, z: 0 }, geometry: P.chainBoard() });
    const panelNode = createNode();
    const boardLegs = createNode({ geometry: { ...P.chainBoardLegs() } });
    addChild(boardNode, panelNode, boardLegs);
    site.boardLegs = boardLegs;
    addChild(site.node, boardNode);
    // The visible slate is a circular arc. Test that arc instead of its broad pick sphere, so a gorilla
    // behind the board cannot win a tap, while one standing in front of it still can.
    const boardRadius = B.r - B.d / 2 - 0.02, boardHalfTangent = Math.tan((B.w + 0.57) / (2 * B.r));
    const boardBottom = place.y + L.LEVEL.shore + B.y - 0.3, boardTop = place.y + L.LEVEL.shore + B.y + B.h + 0.5;
    const billboardRay = (ox, oy, oz, dx, dy, dz, limit = Infinity) => {
      if (!site.node.visible || site.node.cameraHidden || !boardNode.visible || boardNode.cameraHidden) return Infinity;
      const vx = ox - place.x, vz = oz - place.z, a = dx * dx + dz * dz;
      if (a < 1e-10) return Infinity;
      const b = vx * dx + vz * dz, discriminant = b * b - a * (vx * vx + vz * vz - boardRadius * boardRadius);
      if (discriminant < 0) return Infinity;
      const root = Math.sqrt(discriminant);
      for (let side = -1; side <= 1; side += 2) {
        const t = (-b + side * root) / a;
        if (t <= 0 || t >= limit) continue;
        const y = oy + dy * t;
        if (y < boardBottom || y > boardTop) continue;
        const lx = localX(ox + dx * t, oz + dz * t), lz = localZ(ox + dx * t, oz + dz * t);
        if (-lz > 0 && Math.abs(lx) <= -lz * boardHalfTangent) return t;
      }
      return Infinity;
    };
    const boardOwner = atNode("chainsign", boardNode, B.w * 0.55);
    boardOwner.priority = 2;
    boardOwner.pickRay = ray => billboardRay(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz);
    const billboardOccludes = (ax, ay, az, bx, by, bz) => {
      const dx = bx - ax, dy = by - ay, dz = bz - az, distance = Math.hypot(dx, dy, dz);
      return distance > 0.02 && billboardRay(ax, ay, az, dx / distance, dy / distance, dz / distance, distance - 0.02) < Infinity;
    };
    // The weather key sits to the right when entering from the bridge, just past the curved frame.
    const infoBearing = boardBearing - (B.w / 2 + P.INFO_SIGN.w / 2 + 0.8) / B.r;
    const infoNode = createNode({ position: { x: Math.sin(infoBearing) * B.r, y: L.LEVEL.shore, z: Math.cos(infoBearing) * B.r }, rotation: { x: 0, y: infoBearing + Math.PI, z: 0 }, geometry: P.infoSign() });
    const infoLeg = createNode({ geometry: { ...P.infoSignLeg() } });
    addChild(infoNode, infoLeg);
    site.infoLeg = infoLeg;
    addChild(site.node, infoNode);
    atNode("weathersign", infoNode, 1).priority = 2;
    {
      const canvas = document.createElement("canvas");
      canvas.width = CHAIN_PANEL_W;
      canvas.height = CHAIN_PANEL_H;
      // Transparent pixels leave the curved slate visible between the retained surface's letters.
      chainSign = { node: panelNode, ctx2d: canvas.getContext("2d"), printed: "", index: 0, switchAt: NaN, nextRefresh: 0 };
    }
    // Fire: the two torches of the court either side of the mouth, then one down each stretch of the descent on the
    // wall clear of its waterfalls, and four round the chamber between the paintings. The ones under the ground burn
    // always; all of them join the lamps, so whichever are nearest the view cast the light a tier allows.
    for (const torch of site.torches) {
      atNode("torch", torch, 0.5);
      addLamp(torch, LAMP.torch, worldX(torch.position.x, torch.position.z), place.y + torch.position.y + 1.75, worldZ(torch.position.x, torch.position.z), true, 0, `pool:court:${lamps.length}`);
    }
    const fitting = (geometry, x, y, z, ry) => {
      const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 }, geometry, sightHidden: true });
      addChild(site.node, node);
      return node;
    };
    // Under the ground a torch has a tunnel or the chamber to light by itself, so it reaches further than one
    // outdoors; and the lake lights the chamber from above, blue through its membrane.
    // They burn always, and each counts as a light only for a view under this ground or following someone who
    // is: from the home island the thirteen of them cost every pixel on screen and lit nothing in sight. A
    // tunnel torch counts within LAMP_REACH past its own radius. The chamber's four and the lake's light are one
    // room's: they count together for a view anywhere in the room, fading as it backs out through the junction.
    const TUNNEL_TORCH = { ...LAMP.torch, radius: 10 }, CHAMBER_TORCH = { ...LAMP.torch, radius: 13 }, LAKE_LIGHT = { r: 0.3, g: 0.55, b: 1, radius: 15, glow: 0, hide: false }, LAMP_REACH = 6;
    const ROOM = { x: place.x, y: place.y + L.FLOOR + 2, z: place.z, reach: L.CHAMBER_R + 4.5, fade: 4 };
    const shutIn = (lamp, room = null) => {
      lamp.always = true;
      if (room) { lamp.fromX = room.x; lamp.fromY = room.y; lamp.fromZ = room.z; lamp.reach = room.reach; lamp.fade = room.fade; }
      else { lamp.reach = lamp.kind.radius + LAMP_REACH; lamp.fade = LAMP_REACH; }
    };
    const wallTorch = (x, y, z, ry, id, kind) => {
      const node = fitting(P.wallTorch(), x, y, z, ry);
      node.matrixEmissiveLiving = true;
      // The flame stands 0.46 out from the wall and 0.92 up its bracket.
      shutIn(addLamp(node, kind, worldX(x + Math.sin(ry) * 0.46, z + Math.cos(ry) * 0.46), place.y + y + 0.92, worldZ(x + Math.sin(ry) * 0.46, z + Math.cos(ry) * 0.46), true, 0, id), kind === CHAMBER_TORCH ? ROOM : null);
    };
    shutIn(addLamp({ glow: 0, flare: 0, visible: true }, LAKE_LIGHT, place.x, place.y - L.MEMBRANE_DEPTH - 1.6, place.z, true, 0, "pool:lake"), ROOM);
    {
      const point = {};
      for (let s = 14.5, n = 0; s < L.RAMP.length - 3; s += 11, n++) {
        // Inner wall where a link has opened the outer one.
        const side = n % 2 || L.linkAt(s / L.RAMP.r) ? -1 : 1;
        let at = s;
        // Leave room for the full culvert opening, the falling strands and the torch's bracket.
        if (side < 0) for (const channel of L.CHANNELS) if (channel.inner) {
          const wallR = L.RAMP.r - L.rampHalf(at / L.RAMP.r), clearance = L.CHANNEL.low + 0.75;
          const delta = L.turn(L.RAMP.start + at / L.RAMP.r, channel.bearing);
          if (Math.abs(delta) * wallR < clearance) at = (channel.bearing - L.RAMP.start + (delta < 0 ? -1 : 1) * clearance / wallR) * L.RAMP.r;
        }
        L.rampPoint(at, side * (L.rampHalf(at / L.RAMP.r) - 0.02), point);
        wallTorch(point.x, point.y + 1.55, point.z, point.bearing + (side > 0 ? Math.PI : 0), `pool:ramp:${n}`, TUNNEL_TORCH);
      }
      for (let k = 0; k < 4; k++) {
        const bearing = Math.PI / 4 + k * Math.PI / 2, r = L.CHAMBER_R - 0.05;
        wallTorch(Math.sin(bearing) * r, L.FLOOR + 1.9, Math.cos(bearing) * r, bearing + Math.PI, `pool:chamber:${k}`, CHAMBER_TORCH);
      }
      // Roots hang through the roof just inside the mouth and inside each door.
      L.rampPoint(2.4, 0, point);
      fitting(P.roots(), point.x, point.y + L.RAMP.head - 0.05, point.z, point.bearing);
      for (const door of L.DOORS) {
        L.rampPoint(door.at * L.RAMP.length, L.RAMP.bay + 1.2, point);
        fitting(P.roots(), point.x, point.y + L.DOOR.height - 0.05, point.z, point.bearing);
      }
    }
    // Where an animal may stand and walk: the forest floor and the ring path, never a nest, a channel, the court,
    // the shore or the ledge.
    const beastGround = (x, z) => {
      const r = Math.hypot(x, z);
      return r < L.LAKE_R ? L.membraneY(r) : L.groundAt(x, z);
    };
    const beastSpot = (x, z) => {
      if (L.groundAt(x, z) !== L.LEVEL.ground || Math.hypot(x, z) < L.RING.lowland + 0.4) return false;
      const d = L.turn(Math.atan2(x, z), 0);
      return !(d > L.COURT.from - 0.2 && d < L.RAMP.start + 0.2 && Math.hypot(x, z) > L.RING.path - 0.5);
    };
    // The animals' starting spots are claimed before the scatter, so no plant is seeded where one stands; they
    // come alive once the forest is placed (`pool-wildlife.js`), since they walk round its trunks and climb them.
    const beastRand = mulberry32(4343), ANIMALS = [];
    for (const kind of ["jaguar", "jaguar", "monkey", "monkey", "toucan", "toucan"]) {
      for (let n = 0; n < 200; n++) {
        const a = beastRand() * Math.PI * 2, r = L.RING.lowland + 1 + beastRand() * (S.isletR - L.RING.lowland - 2), x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (!beastSpot(x, z) || L.keptClear(x, z, -0.2) && r > L.RING.path || ANIMALS.some((b) => Math.hypot(x - b[1], z - b[2]) < 6)) continue;
        ANIMALS.push([kind, x, z, beastRand() * Math.PI * 2]);
        break;
      }
    }
    const claimed = ANIMALS.map(([, x, z]) => ({ x, z, r: BEAST_CLEAR }));
    // What the animals keep off, in the island group's frame: the boards, then every trunk, rock and log the
    // scatter places. The entrance name is overhead, so it does not block the gateway.
    const obstacles = [
      { x: boardNode.position.x, z: boardNode.position.z, r: B.w / 2 }, { x: infoNode.position.x, z: infoNode.position.z, r: 0.7 }
    ];
    const trees = [], logs = [];
    // Rainforest: three canopy heights, ferns and shrubs under them, each species one shared geometry
    // and one prop kind, so every plant answers a tap the way the home island's own scatter does.
    // `r` is both the footprint it claims and the radius a pointer picks it by; `clear` is how far it
    // keeps off the paths, the nests, the channels and the court, so only its crown ever reaches over them.
    // `most` caps each kind: the crowns make the forest, and every fern and shrub is a thousand faces or two,
    // so the undergrowth is kept to what frames the paths rather than carpeting the floor.
    const SCATTER = [
      { upTo: 0.36, kind: "canopy", r: 0.6, clear: 0.55, most: 44 },
      { upTo: 0.54, kind: "bush", r: 0.55, clear: 0.35, most: 26 },
      { upTo: 0.76, kind: "poolfern", r: 0.5, clear: 0.2, most: 38 },
      { upTo: 0.88, kind: "flower", r: 0.6, clear: 0.3, most: 36 },
      { upTo: 0.95, kind: "poolrock", r: 0.7, clear: 0.7, most: 14 },
      { upTo: 2, kind: "poollog", r: 1.7, clear: 1.6, most: 8 }
    ];
    const grown = { canopy: 0, bush: 0, poolfern: 0, flower: 0, poolrock: 0, poollog: 0 };
    const rand = mulberry32(4242);
    const geometryFor = (kind) => kind === "canopy" ? P.CANOPY[(rand() * P.CANOPY.length) | 0]()
      : kind === "bush" ? P.shrub() : kind === "poolfern" ? P.fern() : kind === "flower" ? P.flowers()
        : kind === "poolrock" ? P.mossRock() : P.log();
    const inner = L.RING.lowland * L.RING.lowland, outer = (S.isletR + 0.8) * (S.isletR + 0.8), trunks = [];
    const level = (x, z, reach, ground) => L.groundAt(x + reach, z) === ground && L.groundAt(x - reach, z) === ground && L.groundAt(x, z + reach) === ground && L.groundAt(x, z - reach) === ground;
    // Planted, not scattered: trees at the back corners of every nest and behind it, so each clearing lies under
    // crowns of its own. A trunk stands clear of the beds; only its crown reaches over them.
    const planted = [];
    for (const nest of L.NESTS) for (const [across, out] of [[-L.NEST.halfT - 0.35, L.NEST.halfR - 0.3], [L.NEST.halfT + 0.35, L.NEST.halfR - 0.3], [0.3, L.NEST.halfR + 0.75], [-L.NEST.halfT - 0.5, -0.6], [L.NEST.halfT + 0.5, 0.4]]) {
      const ux = Math.sin(nest.bearing), uz = Math.cos(nest.bearing), x = ux * (L.NEST.r + out) + uz * across, z = uz * (L.NEST.r + out) - ux * across;
      const ground = L.groundAt(x, z), r = Math.hypot(x, z);
      if (!(ground >= L.LEVEL.lowland) || r + 0.5 > L.edgeAt(Math.atan2(x, z)) - 0.4 || !level(x, z, 0.3, ground)) continue;
      if (L.CHANNELS.some((channel) => r <= channel.to + 0.6 && Math.abs(L.turn(Math.atan2(x, z), channel.bearing)) * r < L.CHANNEL.low + 0.6)) continue;
      planted.push({ x, z, ground });
      trunks.push({ x, z, r: 0.6 });
    }
    // Trees rooted in the bowl's shallows, between outlets, with smaller crowns over the water.
    for (const deg of [61.5, 97.5, 133.5, 169.5, 205.5, 241.5, 277.5, 313.5]) {
      const bearing = deg * Math.PI / 180, r = L.LAKE_R;
      const x = Math.sin(bearing) * r, z = Math.cos(bearing) * r;
      planted.push({ x, z, ground: L.membraneY(r), pool: true });
      trunks.push({ x, z, r: 0.6 });
    }
    yield* pause(slice);
    for (let i = 0; i < 3600 + planted.length; i++) {
      const fixed = i < planted.length ? planted[i] : null;
      const a = rand() * Math.PI * 2, r = Math.sqrt(inner + rand() * (outer - inner)), roll = rand();
      const x = fixed ? fixed.x : Math.sin(a) * r, z = fixed ? fixed.z : Math.cos(a) * r;
      const pick = fixed ? SCATTER[0] : SCATTER.find((e) => roll < e.upTo), ground = fixed ? fixed.ground : L.groundAt(x, z);
      if (grown[pick.kind] >= pick.most) continue;
      if (!fixed) {
        // Undergrowth takes the lowland's damp ground too; everything else wants the dry forest floor or the ridge.
        const soft = pick.kind === "poolfern" || pick.kind === "bush" || pick.kind === "flower";
        // Clear of everything that is walked, slept on or flooded, and off the rim.
        if (!(ground >= (soft ? L.LEVEL.lowland : L.LEVEL.ground)) || Math.hypot(x, z) < L.RING.path + pick.clear || L.keptClear(x, z, soft ? Math.min(pick.clear, 0.15) : pick.clear) && !(soft && ground === L.LEVEL.lowland && Math.hypot(x, z) > L.RING.path + 0.3) || r + pick.r > L.edgeAt(a) - 0.5) continue;
        // Level ground under the whole footprint: nothing stands half over a terrace's step.
        if (!level(x, z, pick.r * 0.6, ground)) continue;
        // Nothing grows through an animal, and trunks keep a body's width apart. Plants still crowd each other,
        // which is what makes it jungle.
        if (claimed.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pick.r)) continue;
        if (pick.kind === "canopy" || pick.kind === "poolrock" || pick.kind === "poollog") {
          if (trunks.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pick.r + 0.7)) continue;
          trunks.push({ x, z, r: pick.r });
        }
      }
      grown[pick.kind]++;
      const geometry = geometryFor(pick.kind);
      // A little scale and turn per copy: free variety, since every copy shares one cached build.
      const k = (0.82 + rand() * 0.45) * (fixed && fixed.pool ? 0.72 : 1);
      const node = createNode({ position: { x, y: ground, z }, rotation: { x: 0, y: rand() * Math.PI * 2, z: 0 }, scale: { x: k, y: (0.9 + rand() * 0.3) * (fixed && fixed.pool ? 0.85 : 1), z: k }, geometry });
      // Undergrowth stays out of the outline registry, as the home scatter's bushes and flowers do.
      if (pick.kind === "bush" || pick.kind === "poolfern" || pick.kind === "flower") node.sightHidden = true;
      addChild(site.node, node);
      atNode(pick.kind, node, pick.r * k);
      const feature = { x, y: ground, z, ry: node.rotation.y, k, sy: node.scale.y, geometry };
      if (pick.kind === "canopy") { trees.push(feature); obstacles.push({ x, z, r: 0.45 * k }); }
      else if (pick.kind === "poolrock") obstacles.push({ x, z, r: 0.75 * k });
      else if (pick.kind === "poollog") {
        logs.push(feature);
        const ax = Math.cos(feature.ry), az = -Math.sin(feature.ry);
        for (const t of [-1.2, 0, 1.2]) obstacles.push({ x: x + ax * t * k, z: z + az * t * k, r: 0.4 * k });
      }
    }
    yield* pause(slice);
    // Broad leaves, fern fans and flowering thickets form a middle storey beneath the trees. A separate
    // seed leaves the established trunks, animal perches and small forest scatter where they were.
    const foliageRand = mulberry32(6417), undergrowth = P.UNDERGROWTH.map((build) => build()), thickets = [];
    const plantThicket = (geometry, x, ground, z, width, height, turn) => {
      const node = createNode({
        position: { x, y: ground, z }, rotation: { x: 0, y: turn, z: 0 },
        scale: { x: width, y: height, z: width }, geometry, sightHidden: true
      });
      addChild(site.node, node);
      atNode("bush", node, geometry.plantRadius * width);
      thickets.push({ x, y: ground, z, r: geometry.plantRadius * width, h: geometry.plantHeight * height });
    };
    // Five larger pockets behind the shoreline trees, on their path side in the flooded shallows.
    // Leaves can reach back over the water; their outer edge and sway stop before the walking path.
    let foliageIndex = 0;
    for (const [degrees, count] of [[61.5, 2], [133.5, 3], [205.5, 2], [241.5, 3], [313.5, 2]]) {
      for (let j = 0; j < count; j++) {
        const geometry = undergrowth[foliageIndex++ % undergrowth.length];
        const width = Math.min((j ? 1.04 : 1.32) + foliageRand() * 0.28, 1.78 / geometry.plantRadius);
        const radius = geometry.plantRadius * width + 0.14;
        const r = Math.min(L.LAKE_R + 0.6 + foliageRand() * 0.25, L.RING.lowland - 0.12 - radius);
        const spread = Math.max(0, 18 * DEG - Math.asin((radius + L.CHANNEL.low + 0.03) / r));
        const bearing = degrees * DEG + (j ? (j & 1 ? 1 : -1) : foliageRand() - 0.5) * spread * 0.9;
        const x = Math.sin(bearing) * r, z = Math.cos(bearing) * r;
        plantThicket(geometry, x, Math.max(L.LEVEL.shore, L.groundAt(x, z)), z,
          width, (j ? 1.35 : 1.6) + foliageRand() * 0.3, bearing + (foliageRand() - 0.5) * 1.8);
      }
    }
    // Start on the raised jungle's outer shoulders, then gather patches around trees and in forest gaps.
    // Full leaf footprints keep paths, nests and channels open; only the roots need level footing.
    const poolThickets = thickets.length, shoulders = [55, 75, 95, 115, 135, 145];
    for (let attempt = 0; attempt < 1200 && thickets.length < poolThickets + 24; attempt++) {
      const shoulder = attempt < shoulders.length * 12;
      const geometry = undergrowth[(thickets.length - poolThickets) % undergrowth.length];
      const width = Math.min(1.02 + foliageRand() * 0.3, (shoulder ? 1.42 : 1.7) / geometry.plantRadius);
      const radius = geometry.plantRadius * width + 0.12;
      const angle = shoulder ? (shoulders[(attempt / 12) | 0] + (foliageRand() - 0.5) * 9) * DEG : foliageRand() * Math.PI * 2;
      const radial = shoulder ? 18.91 + foliageRand() * 0.09
        : L.RING.path + radius + foliageRand() * (L.edgeAt(angle) - L.RING.path - 2 * radius - 0.3);
      let x = Math.sin(angle) * radial, z = Math.cos(angle) * radial;
      if (!shoulder && attempt % 3) {
        const tree = trees[(foliageRand() * trees.length) | 0];
        if (Math.hypot(tree.x, tree.z) <= L.LAKE_R + 0.1) continue;
        const offset = 1.3 + foliageRand() * 1.8;
        x = tree.x + Math.sin(angle) * offset; z = tree.z + Math.cos(angle) * offset;
      }
      const ground = L.groundAt(x, z), r = Math.hypot(x, z), bearing = Math.atan2(x, z);
      if (ground < L.LEVEL.ground || L.keptClear(x, z, radius) || r + radius > L.edgeAt(bearing) - 0.3
        || !level(x, z, 0.24 * width, ground)) continue;
      let supported = true;
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, px = x + Math.sin(a) * radius, pz = z + Math.cos(a) * radius;
        if (L.groundAt(px, pz) > ground + L.UNIT || !L.onIsland(px, pz, 0.25)) { supported = false; break; }
      }
      if (!supported) continue;
      if (claimed.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + radius)
        || obstacles.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + radius * 0.55)
        || thickets.some((c) => Math.hypot(x - c.x, z - c.z) < (c.r + radius) * 0.62)) continue;
      plantThicket(geometry, x, ground, z, width, 1.15 + foliageRand() * 0.4, angle);
    }
    // What the rain lands on above the ground: the dense middle of every crown, a dome over its cells of the
    // layout's grid. A crown's ragged edge lets the drops through, so the forest floor still sees rain between
    // the trees.
    const CROWN_CORE = 0.8, crownTop = new Float32Array(L.SX * L.SZ).fill(-Infinity);
    for (const tree of trees) {
      const c = Math.cos(tree.ry), s = Math.sin(tree.ry);
      for (const [cx, cy, cz, rx, ry] of tree.geometry.climb.crowns) {
        const x = tree.x + (cx * c + cz * s) * tree.k, z = tree.z + (cz * c - cx * s) * tree.k, r = rx * tree.k;
        const i1 = Math.min(L.SX - 1, Math.floor((x + r - L.ORIGIN.x) / L.UNIT)), k1 = Math.min(L.SZ - 1, Math.floor((z + r - L.ORIGIN.z) / L.UNIT));
        for (let i = Math.max(0, Math.floor((x - r - L.ORIGIN.x) / L.UNIT)); i <= i1; i++) for (let k = Math.max(0, Math.floor((z - r - L.ORIGIN.z) / L.UNIT)); k <= k1; k++) {
          const dx = L.ORIGIN.x + (i + 0.5) * L.UNIT - x, dz = L.ORIGIN.z + (k + 0.5) * L.UNIT - z, d = (dx * dx + dz * dz) / (r * r);
          if (d < CROWN_CORE * CROWN_CORE) crownTop[i * L.SZ + k] = Math.max(crownTop[i * L.SZ + k], tree.y + (cy + ry * 0.85 * Math.sqrt(1 - d)) * tree.sy);
        }
      }
    }
    // Dense undergrowth catches rain too; use its central mass, letting drops through the ragged leaves.
    for (const plant of thickets) {
      const r = plant.r * 0.55;
      const i1 = Math.min(L.SX - 1, Math.floor((plant.x + r - L.ORIGIN.x) / L.UNIT)), k1 = Math.min(L.SZ - 1, Math.floor((plant.z + r - L.ORIGIN.z) / L.UNIT));
      for (let i = Math.max(0, Math.floor((plant.x - r - L.ORIGIN.x) / L.UNIT)); i <= i1; i++) for (let k = Math.max(0, Math.floor((plant.z - r - L.ORIGIN.z) / L.UNIT)); k <= k1; k++) {
        const dx = L.ORIGIN.x + (i + 0.5) * L.UNIT - plant.x, dz = L.ORIGIN.z + (k + 0.5) * L.UNIT - plant.z, d = (dx * dx + dz * dz) / (r * r);
        if (d < 1) crownTop[i * L.SZ + k] = Math.max(crownTop[i * L.SZ + k], plant.y + plant.h * (0.68 + 0.2 * Math.sqrt(1 - d)));
      }
    }
    const WORLD_AT = (lx, lz, out) => { out.x = worldX(lx, lz); out.z = worldZ(lx, lz); return out; };
    const wildlife = BL.poolWildlife.create({
      parent: site.node, obstacles, trees, logs, baseY: place.y, toWorld: WORLD_AT, groundAt: beastGround, spotOk: beastSpot,
      waterAt: (x, z) => water.levelAt(x, z), terrainClear: L.boxClear,
      animals: ANIMALS.map(([kind, x, z, heading]) => ({ kind, x, z, heading })),
      sleepy: () => phase === "night" || phase === "midnight"
    });
    // Each animal answers a tap through its body part, and its pick owner follows it about the island.
    for (const beast of wildlife.list) {
      beast.wx = worldX(beast.x, beast.z); beast.wy = place.y + beast.base; beast.wz = worldZ(beast.x, beast.z);
      beast.owner = addProp(beast.kind, beast.node, beast.wx, beast.wz, 0.7);
      beasts.set(beast.node, beast);
    }
    yield* pause(slice);
    // The water, and the paintings on the chamber's wall, each a pick target that opens the board behind it.
    const water = BL.poolWater.create({ site, renderer, seaY: SEA_Y - place.y });
    yield* pause(slice);
    for (const owner of water.picks) { owner.weaponType = "none"; addTarget(owner.node, owner); }
    const fillParam = DEBUG ? params.get("poolfill") : null;
    if (fillParam !== null && fillParam.trim() !== "" && Number.isFinite(Number(fillParam))) water.previewFill(Number(fillParam));
    const rainHit = (x, y, z, size, wet) => water.rain(localX(x, z), y - place.y, localZ(x, z), size, wet);
    const wake = (key, x, feet, z, height, radius) => water.wake(key, localX(x, z), feet - place.y, localZ(x, z), height, radius);
    const paintings = BL.poolPaintings.create({ site, renderer });
    for (const stop of paintings.stops) {
      stop.owner = addProp("poolpainting", stop.node, worldX(stop.x, stop.z), worldZ(stop.x, stop.z), 2.6);
      stop.owner.stop = stop;
      stop.owner.pickRay = ray => {
        const m = stop.node.world;
        const facing = ray.dx * m[8] + ray.dy * m[9] + ray.dz * m[10];
        if (facing >= -1e-6) return -1;
        const t = ((m[12] - ray.ox) * m[8] + (m[13] - ray.oy) * m[9] + (m[14] - ray.oz) * m[10]) / facing;
        if (t <= 0) return -1;
        const x = ray.ox + ray.dx * t, y = ray.oy + ray.dy * t, z = ray.oz + ray.dz * t;
        const dx = x - m[12], dy = y - m[13], dz = z - m[14];
        const across = dx * m[0] + dy * m[1] + dz * m[2];
        const up = dx * m[4] + dy * m[5] + dz * m[6];
        if (across < 0 || across > stop.width || up < 0 || up > stop.height) return -1;
        return guideSegmentClear(ray.ox, ray.oy, ray.oz, x, y, z)
          && mempoolIsland.sightClear(ray.ox, ray.oy, ray.oz, x, y, z) ? t : -1;
      };
    }
    // The islet and the rim-to-bridge-head walk are claimed after the home scatter, not before it.
    // Claiming first made the scatter's seeded retries draw different numbers, reshuffling trees all
    // over the island; claiming after leaves the scatter exactly as it is without this island, and
    // reflow then hides only what actually stands on the walk.
    const claimGround = () => {
      claim(place.x, place.z, S.reach);
      for (let r = S.approachFrom; r <= place.rimRadius; r += 1.5) claim(DIR.x * r, DIR.z * r, S.width / 2 + 2.1);
    };
    // The weather stands over this island: its centre, its top datum, and what the rain lands on, which is the
    // ground's own terraces, the water wherever it stands, and the home island under the near end of the cell.
    // Past all of those a drop has nothing to land on and falls out of sight.
    const centre = { x: place.x, y: place.y, z: place.z };
    const groundAt = (gx, gz) => {
      const lx = localX(gx, gz), lz = localZ(gx, gz), r = Math.hypot(lx, lz);
      if (r < S.reach) {
        const ground = r < L.LAKE_R ? L.membraneY(r) : L.groundAt(lx, lz);
        if (ground > -Infinity) return place.y + Math.max(ground, water.levelAt(lx, lz));
      }
      return island.onLand(gx, gz) ? island.surfaceAt(gx, gz) : -Infinity;
    };
    // Where a raindrop lands: on a crown where one stands over the ground, else on the ground or the water.
    const rainAt = (gx, gz) => {
      const ground = groundAt(gx, gz), i = Math.floor((localX(gx, gz) - L.ORIGIN.x) / L.UNIT), k = Math.floor((localZ(gx, gz) - L.ORIGIN.z) / L.UNIT);
      return i < 0 || k < 0 || i >= L.SX || k >= L.SZ ? ground : Math.max(ground, place.y + crownTop[i * L.SZ + k]);
    };
    // Whether a world point is over the island, and whether rock or the lake stands over it: the tunnels, the
    // chamber and its shaft. Height decides it, so someone under the forest is not standing in the forest.
    const overAt = (wx, wz, margin = 0) => {
      const dx = wx - place.x, dz = wz - place.z;
      return dx * dx + dz * dz < S.reach * S.reach && L.onIsland(localX(wx, wz), localZ(wx, wz), margin);
    };
    const coveredAt = (wx, wy, wz) => {
      const dx = wx - place.x, dz = wz - place.z;
      return dx * dx + dz * dz < S.reach * S.reach && L.covered(localX(wx, wz), wy - place.y, localZ(wx, wz));
    };
    // Where the water carries a body whose feet are at `y`: `draught` under the surface, wherever that is clear
    // of the bed. Only for someone in the water itself, so a walker in the chamber under the lake stays on its
    // floor; and never more than `rise` above standing feet in one step, so rising water lifts a body, never throws it.
    const floatAt = (wx, wz, y, rise, draught) => {
      const dx = wx - place.x, dz = wz - place.z;
      if (dx * dx + dz * dz > S.reach * S.reach) return -Infinity;
      const lx = localX(wx, wz), lz = localZ(wx, wz), level = water.levelAt(lx, lz);
      if (level === -Infinity) return -Infinity;
      const r = Math.hypot(lx, lz), feet = y - place.y;
      // A shore cell whose centre lies inside the lake reports the chamber floor. That lower room is
      // not part of the water volume: use the shore/channel bed as its minimum outside the curved bowl.
      const bed = r < L.LAKE_R ? L.membraneY(r)
        : Math.max(r < L.RING.shore ? L.LEVEL.shore : L.LEVEL.bed, L.groundAt(lx, lz));
      if (feet < bed - STEP_MAX || level - draught <= bed) return -Infinity;
      // A body standing deeper than a step under where it would float is lifted a step at a time; one falling
      // in lands at its float.
      const up = level - draught;
      return place.y + (rise > 0 && up > feet + rise ? feet + rise : up);
    };
    // Whether a point of the water's surface is over someone: for the pose, not the footing.
    const afloat = (wx, wz, y, draught) => {
      const dx = wx - place.x, dz = wz - place.z;
      if (dx * dx + dz * dz > S.reach * S.reach) return false;
      const level = water.levelAt(localX(wx, wz), localZ(wx, wz));
      return level > -Infinity && Math.abs(y - place.y - (level - draught)) < 0.12;
    };
    // Previews for the maintainer, reached under debug as `__ooga.poolIsland.preview`: the lake at a backlog in
    // MvB (null hands it back to the feed), a block's bolt and cube, and an Ooga put to sleep or woken by name.
    const preview = {
      lake: (mvb) => water.preview(mvb === null || mvb === undefined ? null : mvb * 1e6),
      fill: (value) => { water.previewFill(value); if (value === null) water.apply(chain.snapshot); },
      block: () => { weather.strike({ x: place.x, y: place.y + water.state.shown, z: place.z }); water.block(); },
      sleep: (name, asleep = true) => {
        const cave = crew.list.find((c) => c.traits.name === name);
        if (!cave) return false;
        cave.override = asleep ? "sleeping" : "chilling";
        crew.refreshStates(true);
        return true;
      }
    };
    // What the outlines ask of this island's rock, in the world: whether nothing of it stands between two points,
    // whether a point is in it, and whether a box is all rock or all open. The layout's grid answers exactly. A
    // world box is asked as the island-frame box that holds it, so "all rock" and "all open" both stay proofs.
    const sightClear = (ax, ay, az, bx, by, bz) => L.sightClear(localX(ax, az), ay - place.y, localZ(ax, az), localX(bx, bz), by - place.y, localZ(bx, bz));
    const solidAt = (wx, wy, wz) => L.solidAt(localX(wx, wz), wy - place.y, localZ(wx, wz));
    // The camera's near-plane rock fill uses the same voxels and palette as the visible island shell.
    const rockSource = site.ground.geometry.cutawaySource;
    const rockMaterialAt = (wx, wy, wz) => {
      const i = Math.floor((localX(wx, wz) - L.ORIGIN.x) / L.UNIT);
      const j = Math.floor((wy - place.y - L.ORIGIN.y) / L.UNIT);
      const k = Math.floor((localZ(wx, wz) - L.ORIGIN.z) / L.UNIT);
      return i < 0 || j < 0 || k < 0 || i >= L.SX || j >= L.SY || k >= L.SZ ? null
        : rockSource.palette[rockSource.data[(i * L.SY + j) * L.SZ + k]] || null;
    };
    const turned = Math.abs(cos), across = Math.abs(sin);
    const boxIn = (test) => (minX, minY, minZ, maxX, maxY, maxZ) => {
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, hx = (maxX - minX) / 2, hz = (maxZ - minZ) / 2;
      const lx = localX(cx, cz), lz = localZ(cx, cz), rx = turned * hx + across * hz, rz = across * hx + turned * hz;
      return test(lx - rx, minY - place.y, lz - rz, lx + rx, maxY - place.y, lz + rz);
    };
    const boxSolid = boxIn(L.boxSolid), boxClear = boxIn(L.boxClear);
    // What is walked on here rather than walked round: the bridge and the island's own ground in all its pieces.
    const walked = new Set([site.bridge, site.ground, site.floor, site.membrane, ...site.crossings]);
    // Sync once; later searches must not observe visitors, tree animations or this visit's visibility changes.
    sleepSolids.sync();
    const sleepClear = (x, y, z) => sleepSolids.segmentClear(x, y, z, x, y, z, 0.15, 1.5);
    return { site, place, centre, groundAt, rainAt, rainHit, wake, worldX, worldZ, localX, localZ, cos, sin, claimGround, wildlife, water, paintings, overAt, coveredAt, billboardOccludes, sightClear, solidAt, rockMaterialAt, boxSolid, boxClear, floatAt, afloat, walked, sleepClear, layout: L, preview,
      get effectsActive() { return poolEffectsActive; } };
  };
  const nearPoolEffects = (p, radius) => {
    const dx = p.x - mempoolIsland.place.x, dz = p.z - mempoolIsland.place.z;
    return dx * dx + dz * dz <= radius * radius;
  };
  // Only local poses may run less often. A host's limb transforms are the poses every following page receives.
  const animationInterval = (actor) => {
    const net = BL.net.state;
    if (gameMode || actor.controlled || actor.remoteControlled || actor === crew?.player
      || net.room === "live" && net.hostId === net.selfId && net.followers > 0) return 0;
    const p = actor.root.position, eye = camera.position, target = camera.target;
    let distance2 = Math.min((p.x - eye.x) ** 2 + (p.y - eye.y) ** 2 + (p.z - eye.z) ** 2,
      (p.x - target.x) ** 2 + (p.y - target.y) ** 2 + (p.z - target.z) ** 2);
    const player = clankerPlay?.player || crew?.player;
    if (player) {
      const q = player.root.position;
      distance2 = Math.min(distance2, (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2);
    }
    return distance2 <= 20 * 20 ? 0 : distance2 <= 40 * 40 ? 0.1 : 0.2;
  };
  const updatePoolEffectsActivity = () => {
    const radius = poolEffectsActive ? POOL_EFFECTS_FAR : POOL_EFFECTS_NEAR;
    const player = clankerPlay?.player || pilot?.player;
    const active = !gameMode && (nearPoolEffects(camera.position, radius) || nearPoolEffects(camera.target, radius)
      || !!player && nearPoolEffects(player.root.position, radius));
    if (active === poolEffectsActive) return;
    poolEffectsActive = active;
    weather.pause(!active);
    if (active) {
      // The feed stays live while the geometry rests; paint only its latest reading on return.
      mempoolIsland.water.resume();
      mempoolIsland.paintings.refresh(chain.snapshot);
      refreshChainSign();
    }
  };
  // Where the gorillas sleep while their Oogas do: the banana-leaf beds of the Mempool island's nests, and the dry
  // way to each from the home island, as x, z pairs: up the approach stair, over the bridge, across the court,
  // west round the lake on the ring path (the way the nests lie, and never past the ridge), and in at its nest.
  const clankerBeds = () => {
    const M = mempoolIsland, L = M.layout, D = poolModels.DIR, ring = (L.RING.lowland + L.RING.path) / 2, ARC = 18 * DEG;
    const slots = L.SLOTS.map((slot) => ({
      x: M.worldX(slot.x, slot.z), y: M.place.y + slot.y, z: M.worldZ(slot.x, slot.z), heading: slot.heading + M.place.ry, nest: slot.nest, bearing: L.NESTS[slot.nest].bearing
    }));
    const path = (index, out) => {
      const bed = slots[index], to = bed.bearing - Math.PI * 2;
      let n = 0;
      const local = (lx, lz) => { out[n * 2] = M.worldX(lx, lz); out[n * 2 + 1] = M.worldZ(lx, lz); n++; };
      out[0] = D.x * (poolModels.SITE.approachFrom - 0.8); out[1] = D.z * (poolModels.SITE.approachFrom - 0.8);
      out[2] = D.x * (M.place.rimRadius - 0.3); out[3] = D.z * (M.place.rimRadius - 0.3);
      n = 2;
      local(0, L.R - 1.6); local(0, 15.4); local(0, ring);
      for (let b = -ARC; b > to + 0.05; b -= ARC) local(Math.sin(b) * ring, Math.cos(b) * ring);
      local(Math.sin(to) * ring, Math.cos(to) * ring);
      out[n * 2] = bed.x; out[n * 2 + 1] = bed.z;
      return n + 1;
    };
    // A mark of sleep is the Oogas' own, shown wherever it can be seen: it belongs to no Ooga's bed.
    return { slots, path, mark: (x, y, z) => fx.zzzAt(x, y, z, null) };
  };
  // The Timechain Sphere off the southwest rim: the ball, its bridge and its doorway, whose keypad and crossing
  // (timechain-gate.js) open its nine rooms, a scene of their own. Only the outside is the island's.
  const buildTimechainIsland = function* (slice) {
    const T = BL.timechainModels, site = T.build(island), p = site.place;
    yield* pause(slice);
    const cos = Math.cos(p.ry), sin = Math.sin(p.ry), worldX = (x, z) => p.x + x * cos + z * sin, worldZ = (x, z) => p.z - x * sin + z * cos;
    addChild(root, site.node);
    placed.push(site.node);
    yield* pause(slice);
    for (const node of [site.shell, site.entrance, site.bridge, site.plug]) solids.add(node);
    yield* pause(slice);
    // Match the visible grass tiles, not the bounding sphere around the cliff.
    for (const [kind, node, radius] of [["timechainentrance", site.entrance, 3], ["timechainbridge", site.bridge, T.SITE.width / 2 + 0.2], ["timechainkeypad", site.keypad, 0.6]]) {
      const x = node.position.x, z = node.position.z;
      addProp(kind, node, worldX(x, z), worldZ(x, z), radius);
    }
    for (const key of site.keys) addTarget(key.node, { kind: "sphere-key", key: key.key, priority: 2 }, { radius: key.key.length === 1 ? 0.055 : 0.09 });
    // From the bridge, square to the doors with the keypad in view.
    presets.timechain = { yaw: p.ry, pitch: 0.1, dist: 9, target: { x: worldX(0.6, 13.2), y: p.y + 2.2, z: worldZ(0.6, 13.2) } };
    const claimGround = () => {
      claim(p.x, p.z, T.SITE.radius + 1);
      for (let r = p.approachFrom - 1; r <= p.rim; r += 1) claim(T.DIR.x * r, T.DIR.z * r, T.SITE.width / 2 + 0.9);
    };
    return { site, place: p, cos, sin, worldX, worldZ, claimGround, show: T.show(site), gate: null, residentInside: false };
  };
  // ₿IFRÖST's arch dressed where its stone stands as the gate, off the outlines: its gold, vines and banners' rods and
  // marks, the banners' cloth, its lit name, runes and crystals, and its lanterns' glass, which comes back with the
  // world's points its dusk sparks fly from and its warm light pools from, for the lamps. The name, the gold and the
  // banners' marks stand a hand proud of faces metres wide, so on Canvas 2D they sort forward to stay in front of them.
  const dressArch = (gate, arch) => {
    const nodes = [arch.trims, arch.banners, arch.light, arch.glow, arch.bannerMarks].map((geometry) => createNode({ geometry, position: { x: gate.position.x, y: gate.position.y, z: gate.position.z }, rotation: { x: 0, y: gate.rotation.y, z: 0 }, sightHidden: true, depthBias: geometry === arch.light ? -0.6 : geometry === arch.trims || geometry === arch.bannerMarks ? -0.3 : 0 }));
    addChild(root, ...nodes);
    placed.push(...nodes);
    const P = gate.position, cos = Math.cos(gate.rotation.y), sin = Math.sin(gate.rotation.y);
    const world = ([x, y, z]) => ({ x: P.x + x * cos + z * sin, y: P.y + y, z: P.z + z * cos - x * sin });
    return { node: nodes[3], spark: world(arch.spark), pool: world(arch.pool) };
  };
  // ₿IFRÖST's islet off the north rim, while its chamber is open (a `wip` scene is unregistered unless the page opts in):
  // the crystal bridge out from ₿IFRÖST's arch at the top of the north pass, the islet and its gate, whose field takes a
  // played Ooga into the chamber, and their lamps with the arch's. The bridge and its head, the rock and the gate are
  // solid; the field, the deck's light and the dressing are not. The field and its window hang in their own group straight
  // under the root, in the portal's frame, as the factory's do.
  const buildBifrostIsle = function* (archLamp, slice) {
    const I = BL.bifrostIsle, site = I.site(I.spot(island)), p = site.portal;
    for (const node of site.roots) addChild(root, node);
    placed.push(...site.roots);
    addTerrainSection(site.islet.geometry.cutawaySource, site.node, site.node.position.y);
    yield* pause(slice);
    // Architecture, as the cave rims are: a walker climbs its stairs rather than shouldering past them as a tall prop.
    for (const node of site.solids) {
      node.sightSolid = true;
      solids.add(node);
    }
    addProp("bifrostbridge", site.bridge, (site.cloud.head.x + site.cloud.end.x) / 2, (site.cloud.head.z + site.cloud.end.z) / 2, site.cloud.width);
    addProp("bifrostgate", site.gatehouse, p.x, p.z, p.halfW + 1);
    // Early in the dusk ramp, as the mouths' lanterns are, or registered this late they would never come on; each where its
    // lights come on, for the sparks: the gate, the court's lanterns and fires, the bridge's lanterns and the landing's.
    // The arch at the head of Bifröst comes on right after the gate, its sparks at a tower's lantern; its light is its own
    // lamp, ranked after the fire's.
    const c = site.cloud, court = site.arrival, at = [[p.x, p.floorY + 2, p.z], [court.x, court.y + 1.5, court.z], [court.x, court.y + 1.5, court.z],
    [(c.head.x + c.end.x) / 2, c.y + 1.6, (c.head.z + c.end.z) / 2], [c.head.x, c.y + 1.6, c.head.z]];
    site.lamps.forEach((node, i) => {
      const lamp = addLamp(node, LAMP.lantern, at[i][0], at[i][1], at[i][2], false, i);
      if (i === 1 || i === 3 || i === 4) lamp.nightOnly = true;
      if (!i) addLamp(archLamp.node, LAMP.lantern, archLamp.spark.x, archLamp.spark.y, archLamp.spark.z, false, 1).nightOnly = true;
    });
    const group = createNode({ position: { x: p.x, y: p.floorY, z: p.z }, rotation: { x: 0, y: p.ry, z: 0 } });
    addChild(root, group);
    placed.push(group);
    presets.bifrost = site.view;
    // After the home scatter, as the other islets claim theirs: the pass's end and the bridge head.
    const claimGround = () => {
      for (const [x, z, r] of site.claims) claim(x, z, r);
    };
    BL.bifrostIsle.update(site, 0, 0, NaN, NaN, NaN);
    return { site, group, claimGround, phase: null, window: null, heimdall: null, hum: 0, effectsActive: false, effectsTime: 0 };
  };
  // Sleeping or away, Sani lives in the Sphere's rooms rather than HQ. Active, he joins the mainland crew.
  // Possessing him inside the ball brings him out onto the bridge before its doors.
  const timechainResidentPose = (cave) => {
    if (!timechainIsland || cave.traits.name !== "SaniExp") return false;
    const T = timechainIsland;
    if (cave.state === "working" || cave.state === "chilling" || cave === pilot?.player || cave.remoteControlled) {
      if (T.residentInside) {
        T.residentInside = false;
        if (cave === pilot?.player) {
          const W = BL.timechainModels.SPOTS.WAIT;
          cave.root.position.x = T.worldX(W.x, W.z + 1.2); cave.root.position.z = T.worldZ(W.x, W.z + 1.2);
          cave.root.position.y = T.place.y + cave.baseY;
          cave.root.rotation.y = T.place.ry + Math.PI;
          cave.root.visible = true;
        }
      }
      return false;
    }
    T.residentInside = true;
    cave.walk = null; cave.hop = cave.hopV = cave.cheer = cave.catchT = 0;
    cave.act.kind = "idle"; cave.act.until = Infinity;
    cave.root.visible = false;
    cave.root.position.x = T.place.x; cave.root.position.z = T.place.z; cave.root.position.y = T.place.y + cave.baseY;
    return true;
  };
  // Dock over the drop and ladder on the bluff
  const buildRim = () => {
    const d = polar(DOCK_DEG, CLIFF_OUTER);
    const dock = place(hubModels.dock(), d.x, d.z, Math.PI / 2 - DOCK_DEG * DEG, island.surfaceAt(d.x, d.z) + 0.05, "dock", 2.2);
    dockStairs = buildDockStairs(dock);
    headquarters.dockStairs = dockStairs;
    claim(d.x, d.z, 2.5);
    let faceX = MEADOW - 1;
    while (island.surfaceAt(faceX + island.unit / 2, LADDER_Z) < 3) faceX += island.unit;
    const foot = faceX - LADDER_LEAN - 0.06;
    const lean = createNode({ position: { x: foot, y: 0, z: LADDER_Z }, rotation: { x: 0, y: 0, z: -Math.asin(LADDER_LEAN / 4) } });
    const rungs = createNode({ rotation: { x: 0, y: Math.PI / 2, z: 0 }, geometry: hubModels.ladder() });
    addChild(lean, rungs);
    addChild(root, lean);
    placed.push(lean);
    claim(foot, LADDER_Z, 1);
    addProp("ladder", rungs, foot, LADDER_Z, 1.2).lean = lean;
    spots.push({ x: foot - 1.1, z: LADDER_Z, ry: Math.PI / 2 });
  };
  // Rejection sampling: scatter props, keeping off paths and mouths.
  const SPREAD_CANDIDATES = 40, SPREAD_TRIES = 1500;
  const scatter = function* (slice) {
    const rand = mulberry32(SEED);
    const routeOverlaps = (x, z, radius) => island.path.overlaps(x, z, radius) || island.overlapsStairs(x, z, radius);
    const treeGroundClear = (geometry, x, z, y) => {
      // Scan every voxel column touched by the solid crown and a walking body's
      // radius. Four corner samples miss narrow, higher steps on cave roofs.
      const reach = geometry.treeSolidRadius + PLAYER_RADIUS, unit = island.unit, half = unit / 2;
      if (island.overlapsStairs(x, z, reach)) return false;
      // Reserve a full voxel above two units for the tallest helmeted head-look envelope.
      const rootRadius = Math.hypot(0.5, 0.25), ceiling = y + geometry.treeSolidCanopyFloor - 2.25;
      const grid = island.sightGrid, minX = Math.floor((x - reach - grid[1]) / unit), maxX = Math.floor((x + reach - grid[1]) / unit);
      const minZ = Math.floor((z - reach - grid[3]) / unit), maxZ = Math.floor((z + reach - grid[3]) / unit);
      for (let gx = minX; gx <= maxX; gx++) for (let gz = minZ; gz <= maxZ; gz++) {
        const px = grid[1] + (gx + 0.5) * unit, pz = grid[3] + (gz + 0.5) * unit;
        const distance = Math.hypot(Math.max(0, Math.abs(px - x) - half), Math.max(0, Math.abs(pz - z) - half));
        if (distance > reach) continue;
        const floor = island.surfaceAt(px, pz);
        if (floor > ceiling || distance < rootRadius && floor > y) return false;
      }
      return true;
    };
    const candidateFree = (x, z, radius) => {
      for (let i = 0; i < sceneryClaims.length; i++) {
        const c = sceneryClaims[i];
        if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return false;
      }
      return true;
    };
    // Grass is dressing: it reflows with the rest but answers no tap or Space.
    const addScenery = (geometry, x, z, ry, y, kind, footprint) => {
      const reservation = claim(x, z, footprint);
      sceneryClaims.push(reservation);
      const quiet = kind === "grass";
      const pickRadius = kind === "tree" ? BL.scene.boundsOf(geometry).radius : footprint + 0.3;
      const node = place(geometry, x, z, ry, y, quiet ? null : kind, pickRadius);
      if (quiet) node.screenCull = true;
      if (quiet || kind === "flower" || kind === "bush") node.sightHidden = true;
      if (MATRIX_LIVING_PROPS.has(kind)) node.matrixLiving = true;
      const owner = quiet ? { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: 0, active: true } : props[props.length - 1];
      owner.footprint = footprint;
      owner.scenery = true;
      owner.reservation = reservation;
      reservation.scenery = owner;
      scenery.push(owner);
      return node;
    };
    const meadowAt = () => polar(rand() * 360, Math.sqrt(lerp(MEADOW_INNER * MEADOW_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
    const meadowSpot = (x, z, radius) => island.surfaceAt(x, z) <= 0 && !nearMouth(x, z, 3.5) && workSceneryClear(x, z, radius)
      && candidateFree(x, z, radius) && free(x, z, radius) && !routeOverlaps(x, z, radius);
    const meadowTurn = (square) => square ? Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.4 : rand() * Math.PI * 2;
    const meadow = (count, radius, kind, geometryAt, square = false) => {
      for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
        const { x, z } = meadowAt();
        if (!meadowSpot(x, z, radius)) continue;
        addScenery(geometryAt(n), x, z, meadowTurn(square), 0, kind, radius);
        n++;
      }
    };
    // Best candidate: each prop takes, of SPREAD_CANDIDATES seeded spots, the fitting one farthest from those already
    // standing, clear of every open cave's doorway, drawing on to SPREAD_TRIES while none fits. The kinds are dealt
    // in turn by their share, the one furthest behind next, so each spreads as evenly as the whole.
    const spread = (kinds) => {
      const spots = [];
      let left = 0;
      for (const k of kinds) { k.n = 0; left += k.count; }
      for (; left > 0; left--) {
        let next = null;
        for (const k of kinds) if (k.n < k.count && (!next || (k.n + 0.5) / k.count < (next.n + 0.5) / next.count)) next = k;
        let x = 0, z = 0, best = -1;
        for (let c = 0; c < SPREAD_TRIES && (c < SPREAD_CANDIDATES || best < 0); c++) {
          const p = meadowAt();
          let gap = Infinity;
          for (let i = 0; i < spots.length; i += 2) gap = Math.min(gap, Math.hypot(spots[i] - p.x, spots[i + 1] - p.z));
          if (gap > best && entranceClear(p.x, p.z, next.radius) && meadowSpot(p.x, p.z, next.radius)) { best = gap; x = p.x; z = p.z; }
        }
        if (best >= 0) {
          addScenery(next.geometryAt(next.n), x, z, meadowTurn(next.square), 0, next.kind, next.radius);
          spots.push(x, z);
        }
        next.n++;
      }
    };
    const cliff = (count, radius, minHeight, kind, geometryAt, grove = false) => {
      // Safe root ledges are rarer than decorative bush sites (48000 tree tries vs 1200).
      // Bounds the seeded search while retaining the full grove on the cliffs.
      let n = 0;
      const tryAt = (x, z) => {
        const h = island.surfaceAt(x, z);
        if (h < minHeight || !free(x, z, radius) || routeOverlaps(x, z, radius)) return false;
        let clear = true;
        for (let i = 0; i < 4 && clear; i++) {
          const a = (i + 0.5) * Math.PI / 2;
          if (island.surfaceAt(x + Math.cos(a) * 1.2, z + Math.sin(a) * 1.2) > h + 1.5) clear = false;
        }
        if (!clear || nearMouth(x, z, 4) || !candidateFree(x, z, radius)) return false;
        let geometry = geometryAt(n);
        if (kind === "tree" && !treeGroundClear(geometry, x, z, h)) {
          // A narrower crown can fit a ledge that cannot clear the next variant.
          // Try each cached shape once rather than exhaust the search on that tree.
          let fits = false;
          for (let variant = 0; variant < 4 && !fits; variant++) {
            const alternate = hubModels.tree(variant);
            if (alternate === geometry) continue;
            if (treeGroundClear(alternate, x, z, h)) { geometry = alternate; fits = true; }
          }
          if (!fits) return false;
        }
        addScenery(geometry, x, z, rand() * Math.PI * 2, h, kind, radius);
        n++;
        return true;
      };
      for (let tries = 0; n < count && tries < (kind === "tree" ? 48000 : 1200); tries++) {
        const { x, z } = polar(rand() * 360, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        if (!tryAt(x, z) || !grove) continue;
        // Copses: most trees take one or two neighbours just over a footprint apart, so the cliffs read as
        // groves rather than a ring of singles. A neighbour that does not fit its ledge is simply skipped.
        const r = rand(), extra = r < 0.25 ? 0 : r < 0.65 ? 1 : 2, a0 = rand() * Math.PI * 2;
        for (let k = 0; k < extra && n < count; k++) {
          const a = a0 + k * 2.1 + (rand() - 0.5) * 0.5, d = radius * 2 + 0.2 + rand() * 0.6;
          tryAt(x + Math.cos(a) * d, z + Math.sin(a) * d);
        }
      }
    };
    yield* pause(slice);
    cliff(40, 1.4, 3, "tree", (n) => hubModels.tree(n % 4 === 3 ? 3 : n % 3), true);
    yield* pause(slice);
    cliff(30, 1, 0.5, "bush", (n) => hubModels.bush(n % 3));
    spread([
      { kind: "bush", count: 30, radius: 0.7, geometryAt: (n) => hubModels.bush(n % 3) }
    ]);
    meadow(50, 0.35, "flower", () => hubModels.flowerTuft());
    meadow(18, 0.3, "grass", () => hubModels.grass());
  };
  const sceneryReason = (o) => {
    const clearance = island.path.debug.ringOuterRadius + SCENERY_CLEARANCE;
    if (o.node.position.y < 2 && !workSceneryClear(o.x, o.z, o.footprint)) return 3;
    if (o.prop === "bush" && chalkboardClearance) {
      const board = chalkboardClearance, dx = o.x - board.x, dz = o.z - board.z;
      const across = dx * board.rightX + dz * board.rightZ, front = dx * board.frontX + dz * board.frontZ;
      // Keep the board's face and both edges clear without moving the seeded meadow scatter.
      if (Math.abs(across) < 1.8 + o.footprint && front > 0 && front < 2.4 + o.footprint) return 3;
    }
    if (Math.hypot(o.x, o.z) - o.footprint < clearance - 1e-9) return 1;
    if (island.path.overlaps(o.x, o.z, o.footprint) || island.overlapsStairs(o.x, o.z, o.footprint)) return 2;
    for (let i = 0; i < claimed.length; i++) {
      const c = claimed[i];
      if (!c.scenery && Math.hypot(c.x - o.x, c.z - o.z) < c.r + o.footprint) return 3;
    }
    return 0;
  };
  // Remove the bush beside the fire after scattering, keeping every other seeded prop in place.
  const clearFireBush = (firePos) => {
    let nearest = null, distance = Infinity;
    for (const o of scenery) {
      if (o.prop !== "bush" || o.node.position.y !== 0 || sceneryReason(o)) continue;
      const d = (o.x - firePos.x) ** 2 + (o.z - firePos.z) ** 2;
      if (d < distance) { nearest = o; distance = d; }
    }
    if (!nearest) return;
    removeTarget(nearest.node);
    removeChild(root, nearest.node);
    drop(placed, nearest.node); drop(props, nearest); drop(scenery, nearest);
    drop(claimed, nearest.reservation); drop(sceneryClaims, nearest.reservation);
  };
  const setSceneryActive = (o, active) => {
    if (o.active === active) return;
    o.active = active;
    o.node.visible = active;
    if (!o.pickRadius) return;
    if (active) input.add(o.node, o, { radius: o.pickRadius });
    else input.remove(o.node);
  };
  const reflowScenery = () => {
    if (!scenery.length) return;
    let visible = 0, radiusCulled = 0, pathCulled = 0, fixedCulled = 0;
    for (let i = 0; i < scenery.length; i++) {
      const o = scenery[i], reason = sceneryReason(o);
      setSceneryActive(o, reason === 0);
      if (!reason) { if (o.active) visible++; }
      else if (reason === 1) radiusCulled++;
      else if (reason === 2) pathCulled++;
      else fixedCulled++;
    }
    sceneryVisible = visible;
    sceneryRadiusCulled = radiusCulled;
    sceneryPathCulled = pathCulled;
    sceneryFixedCulled = fixedCulled;
    sceneryReflows++;
    if (magazine && !magazine.revealed && !magazine.host.active) attachMagazineHost();
  };
  const isPlayerAttack = source => !!source && (source === crew.player || source.controlled && source.actionControlled);
  const weaponImpact = (source, hit, dx, dy, dz, power = 1, projectile = null) => {
    // Waking the herald opens a game; it is an interaction before combat exists.
    if (hit.owner.kind === "halloween" && hit.owner.role === "herald") {
      if (ghosts) ghosts.hit(source, hit, power, isPlayerAttack(source), !!projectile);
      else if (ghostEntry) ghostEntry.hit(isPlayerAttack(source), !!projectile);
      return;
    }
    if (hit.node === mirrorCave.node) {
      // Ordinary HUB melee reports its contact without the combat-only sweep effect.
      if (!gameMode && !projectile) mirrorCave.ripples.cross(hit.x - dx * 0.02, hit.y - dy * 0.02, hit.z - dz * 0.02,
        hit.x + dx * 0.02, hit.y + dy * 0.02, hit.z + dz * 0.02, 0);
      return;
    }
    if (!gameMode) return;
    if (source && source.controlled && source.actionControlled && source.combat && !source.combat.powerSpent) {
      const combat = source.combat;
      source.poundPower *= 0.25 + 0.75 * clamp((now - combat.lastHitAt - 0.1) / 0.1, 0, 1);
      combat.lastHitAt = now; combat.powerSpent = true;
      power = source.poundPower;
    }
    if (hit.owner.kind === "caveman") {
      crew.damage(hit.owner.cave, power, isPlayerAttack(source));
      return;
    }
    if (hit.owner.kind === "clanker") {
      if (clankers.damage(hit.owner.entry, power) && isPlayerAttack(source)) fx.damageNumber(hit.x, hit.y + 0.25, hit.z, power * 4);
      if (projectile && !projectile.tomato && !projectile.workShot && !projectile.visual)
        clankers.bananaHit(hit.owner.entry, source, projectile.serial);
      return;
    }
    if (hit.owner.kind === "halloween") { ghosts.hit(source, hit, power, isPlayerAttack(source), !!projectile); return; } // HALLOWEEN
    hitRoomSign(source, hit, dx, dy, dz);
  };
  const drop = (list, value) => {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
  };
  const jetpackHudStatus = (cave) => {
    JETPACK_HUD_STATE.owned = !!(cave && cave.jetpackOwned);
    JETPACK_HUD_STATE.equipped = !!(cave && cave.jet);
    JETPACK_HUD_STATE.fuel = JETPACK_HUD_STATE.owned ? cave.jetFuel : 1;
    JETPACK_HUD_STATE.blocked = JETPACK_HUD_STATE.owned && (cave ? !jetpackAllowed(cave) : cameraCaveIndex !== 0);
    return JETPACK_HUD_STATE;
  };
  const equipJetpack = (cave) => {
    if (!cave || !cave.jetpackOwned) return false;
    if (cave.jet) return true;
    if (!crew.wearJetpack(cave, hubModels.jetpack(), hubModels.jetFlame())) return false;
    pilot.showAct();
    const p = cave.root.position;
    fx.burst(p.x, p.y + 0.7, p.z, 14, [SPARK, DUST], 2.2);
    fx.say(cave, "OOGA FLY!", 2);
    hud.toast("Jetpack!");
    hud.hint(cave.jetRecovering ? "Fuel recovering · jump until the gauge is above 20%" : COARSE ? "Hold Blast off to climb · stick to fly" : "Hold Space to climb · WASD to fly", 5000);
    return true;
  };
  const grantJetpack = (cave, wear = false) => {
    if (!cave) return false;
    crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    pilot.showAct();
    return !wear || equipJetpack(cave);
  };
  const toggleJetpack = () => {
    const cave = crew.player;
    if (cave?.grabbedBy) return false;
    if (!cave) {
      hud.toast("Double-tap an Ooga Booga first");
      return false;
    }
    if (cave.jet) {
      crew.removeJetpack(cave);
      pilot.showAct();
      hud.toast("Jetpack off");
      return true;
    }
    if (!jetpackAllowed(cave)) {
      hud.toast(ghosts && ghosts.sealed ? "No jetpacks while the ghosts are out" : "No jetpacks under ground"); // HALLOWEEN: ghosts
      return false;
    }
    return equipJetpack(cave);
  };
  const attachMagazineHost = () => {
    let host = null, best = Infinity;
    for (const o of scenery) {
      if (!o.active || o.prop !== "bush" && o.prop !== "tree") continue;
      // Meadow bushes can be walked through. Keep the hidden spare reachable
      // without needing the other pickup, even when the pile resizes scenery.
      const score = (o.prop === "bush" ? 0 : 1000000) + Math.abs(o.node.position.y) * 100 + fnv1a(`${o.x}/${o.z}/magazine`) / 4294967296;
      if (score < best) { host = o; best = score; }
    }
    if (!host) throw new Error("No scenery can hide the spare magazine");
    magazine.host = host;
    const p = magazine.node.position, bounds = BL.scene.boundsOf(host.node.geometry);
    p.x = host.x; p.z = host.z;
    p.y = magazine.y = host.node.position.y + bounds.max[1] * host.node.scale.y + 0.4;
  };
  const spawnMagazinePickup = () => {
    if (magazine) return;
    const visual = models.spareMagazine(), node = visual.node;
    node.visible = false;
    node.scale.x = node.scale.y = node.scale.z = MAGAZINE_SCALE;
    addChild(root, node); placed.push(node);
    magazine = { node, model: visual, host: null, owner: null, revealed: false, y: 0, ammo: 30 };
    attachMagazineHost();
    trackMirrorObject(node, 1);
  };
  const revealMagazine = (host = magazine && magazine.host) => {
    if (!magazine || magazine.revealed || host !== magazine.host || !host.active) return false;
    const node = magazine.node;
    magazine.revealed = node.visible = true;
    magazine.owner = addProp("magazine", node, node.position.x, node.position.z, 0.2);
    refreshObjectGuides();
    hud.toast("A full spare magazine!");
    hud.hint(pilot.player ? "Walk into the magazine to collect it." : "Double-tap an Ooga, then walk into the magazine.", 5000);
    return true;
  };
  const removeMagazinePickup = () => {
    if (!magazine) return;
    const { node, owner } = magazine;
    untrackMirrorObject(node);
    if (owner) { input.remove(node); drop(targets, node); drop(props, owner); }
    removeChild(root, node); drop(placed, node);
    magazine = null;
    refreshObjectGuides();
  };
  const grantMagazine = (cave = pilot.player) => {
    // Debug grants still create a full spare after the hidden pickup is gone.
    if (!magazine) return crew.collectMagazine(cave);
    const available = magazine.ammo;
    const remaining = crew.collectGroundMagazine(available, cave);
    if (remaining === available) return false;
    const added = available - remaining;
    if (remaining) {
      magazine.ammo = remaining;
      magazine.model.setAmmo(remaining);
    } else removeMagazinePickup();
    pilot.showAct();
    return added;
  };
  const loseAbyssAmmo = (cave = pilot.player) => {
    if (!cave) return false;
    const hadMagazines = crew.hasMagazine(cave), hadAmmo = cave.weapon.ammo > 0;
    if (!hadMagazines && !hadAmmo) return false;
    crew.stopBurst(cave);
    crew.stopReload(cave, true);
    if (hadMagazines) {
      crew.removeMagazines(cave);
      spawnMagazinePickup();
    }
    cave.weapon.ammo = 0;
    pilot.showAct();
    hud.toast(hadMagazines && hadAmmo ? "Spare magazines and loaded AK-47 ammo lost to the abyss"
      : hadMagazines ? "Spare magazines lost to the abyss" : "Loaded AK-47 ammo lost to the abyss");
    return true;
  };
  const buildSpots = () => {
    // Sit beside the ramp approaches, leaving the entrance and its walking lane clear.
    for (const ramp of island.headquarters.ramps) {
      for (let along = 4; along <= 8; along += 2) for (let side = -1; side <= 1; side += 2) for (let across = 3.25; across <= 4.75; across += 1.5) {
        const x = ramp.from.x - ramp.axis.x * along + ramp.axis.z * side * across;
        const z = ramp.from.z - ramp.axis.z * along - ramp.axis.x * side * across;
        if (island.surfaceAt(x, z) !== 0 || !island.isGrassAt(x, z) || island.path.overlaps(x, z, 0.8)
          || Math.hypot(x, z) < island.path.debug.ringOuterRadius + 1.5 || !free(x, z, 0.9)) continue;
        chillSpots.push({ x, z, ry: Math.atan2(-x, -z), sit: true });
      }
    }
    spots.push({ x: 0, z: -(MEADOW + 2.5), ry: Math.PI });
    for (const m of island.mouths) {
      // Empty caves are sealed rock, not places for the crew to visit.
      const slot = caves.slots.find((slot) => slot.id === m.id);
      if (slot.status === "dark" || slot.status === "mirror" && MIRROR_GATE_CLOSED) continue;
      spots.push({ x: m.apron.x, z: m.apron.z, ry: Math.atan2(m.x - m.apron.x, m.z - m.apron.z) });
    }
    // Leave spare destinations when the roster outgrows the original meadow pool.
    const rand = mulberry32(SEED + 5), count = Math.max(WANDER_COUNT, contributors.activeRoster.length * 2);
    for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
      const { x, z } = polar(rand() * 360, Math.sqrt(lerp(WANDER_INNER * WANDER_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
      if (island.surfaceAt(x, z) !== 0 || nearMouth(x, z, 3) || npcClosedCaveAt(x, z) || !free(x, z, 0.9)) continue;
      spots.push({ x, z, ry: NaN });
      n++;
    }
  };
  const seatTaken = (s) => {
    for (let caveIndex = 0; caveIndex < crew.list.length; caveIndex++) {
      const cave = crew.list[caveIndex];
      const a = cave.act;
      if ((a.kind === "wander" || a.kind === "idle") && a.spot.x === s.x && a.spot.z === s.z) return true;
    }
    return false;
  };
  const freeSeat = () => {
    const start = Math.floor(Math.random() * FIRE_SEATS);
    for (let i = 0; i < FIRE_SEATS; i++) {
      const s = fireSeats[(start + i) % FIRE_SEATS];
      if (!seatTaken(s)) return s;
    }
    return null;
  };
  const npcWanderPointClear = (s, cave) => {
    const feet = island.surfaceAt(s.x, s.z), height = cave ? cave.bodyHeight : 1.5;
    return !npcRampRoofAt(s.x, feet, s.z) && !npcClosedCaveAt(s.x, s.z, feet, height) && !npcPileAt(s.x, feet, s.z, height) && !npcWorkZoneAt(cave, s.x, feet, s.z) && npcFireClear(s.x, feet, s.z, s.x, feet, s.z, height) && walkable(s.x, s.z, s.x, s.z, feet, height, cave);
  };
  const settleFireSeat = (cave) => {
    const radius = Math.max(PLAYER_RADIUS, cave.bodyRadius), height = cave.bodyHeight;
    const outside = remotes?.actors();
    seats: for (const s of fireSeats) {
      // Idle chillers leave the pile's work ring; never seat them where they must immediately move.
      if (Math.hypot(s.x, s.z) < island.path.debug.ringOuterRadius + 1.5
        || island.surfaceAt(s.x, s.z) !== 0 || seatTaken(s) || !npcWanderPointClear(s, cave)
        || !physicalClearAt(s.x, 1e-5, s.z, radius, height, cave)
        || !propSegmentClear(s.x, 1e-5, s.z, s.x, 1e-5, s.z, radius, height, cave)) continue;
      for (const other of crew.list) {
        if (other === cave) continue;
        // Workers later in roster order already own their loading slots.
        if (other.state === "away" && other.slot && crew.stateOf(other) === "working"
          && Math.hypot(s.x - other.slot.x, s.z - other.slot.z) < radius + other.bodyRadius + 0.15) continue seats;
        if (!other.root.visible) continue;
        const p = other.root.position, feet = p.y - other.baseY;
        if (feet < height && feet + other.bodyHeight > 0
          && Math.hypot(s.x - p.x, s.z - p.z) < radius + other.bodyRadius + 0.15) continue seats;
      }
      if (outside) for (const p of outside) {
        if (p.y < height && p.y + p.height > 0
          && Math.hypot(s.x - p.x, s.z - p.z) < radius + p.radius + 0.15) continue seats;
      }
      return s;
    }
    return null;
  };
  const wanderSpot = (out, cave = null, settle = false) => {
    const chilling = cave?.state === "chilling";
    let s = settle && chilling ? settleFireSeat(cave)
      : (chilling && Math.random() < 0.6 || RENDER_OPTS.stars > NIGHT && Math.random() < FIRE_SEAT_CHANCE) ? freeSeat() : null;
    if (s && !npcWanderPointClear(s, cave)) s = null;
    if (!s && chilling) {
      const start = Math.floor(Math.random() * chillSpots.length);
      for (let i = 0; i < chillSpots.length; i++) {
        const candidate = chillSpots[(start + i) % chillSpots.length];
        if (candidate.x === out.x && candidate.z === out.z || seatTaken(candidate) || !npcWanderPointClear(candidate, cave)) continue;
        s = candidate; break;
      }
      if (!s) {
        s = freeSeat();
        if (s && !npcWanderPointClear(s, cave)) s = null;
      }
    }
    if (!s) {
      const start = Math.floor(Math.random() * spots.length);
      for (let i = 0; i < spots.length; i++) {
        const candidate = spots[(start + i) % spots.length];
        if (candidate.x === out.x && candidate.z === out.z
          || seatTaken(candidate)
          || chilling && Math.hypot(candidate.x, candidate.z) < island.path.debug.ringOuterRadius + 1.5
          || !npcWanderPointClear(candidate, cave)) continue;
        s = candidate; break;
      }
    }
    if (!s) return false;
    out.x = s.x;
    out.z = s.z;
    out.ry = chilling && Number.isNaN(s.ry) ? Math.atan2(-s.x, -s.z) : s.ry;
    out.sit = !!s.sit;
    return true;
  };
  const npcRecoverySpot = (cave, out) => {
    const p = cave.root.position;
    let nearest = Infinity;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i], distance = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (distance >= nearest || seatTaken(s) || !npcWanderPointClear(s, cave)) continue;
      const feet = island.surfaceAt(s.x, s.z);
      let occupied = false;
      for (let j = 0; j < crew.list.length; j++) {
        const other = crew.list[j], q = other.root.position, otherFeet = q.y - other.baseY;
        if (other !== cave && other.root.visible && feet < otherFeet + other.bodyHeight && feet + cave.bodyHeight > otherFeet
          && Math.hypot(s.x - q.x, s.z - q.z) < cave.bodyRadius + other.bodyRadius) { occupied = true; break; }
      }
      if (occupied) continue;
      nearest = distance; out.x = s.x; out.y = feet; out.z = s.z;
    }
    return Number.isFinite(nearest);
  };
  const pileRespawnSpot = (cave, out, initial = false, search = null) => {
    const inner = Math.max(5, altar.platformRadius + 1.3), outer = inner + 3;
    const radius = Math.max(PLAYER_RADIUS, cave?.bodyRadius || 0), height = cave?.bodyHeight || 1.6;
    const start = search ? search.angle : initial ? 0 : Math.random() * Math.PI * 2;
    const outside = remotes?.actors();
    // Fresh random arrivals, then a bounded scan of three rings if crowded. Initial workers fill
    // deterministic rings from the inside out, with three more rings for the whole roster.
    // Never fall back to a cave, work slot or the Ooga's old wandering point.
    candidates: for (let attempt = search ? search.next : 0; attempt < (initial ? 288 : 192); attempt++) {
      const scan = initial ? attempt : attempt - 48;
      const angle = scan < 0 ? Math.random() * Math.PI * 2 : start + (scan % 48) * Math.PI / 24;
      const distance = scan < 0 ? Math.sqrt(lerp(inner * inner, outer * outer, Math.random()))
        : inner + 0.5 + Math.floor(scan / 48);
      const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance;
      if (island.surfaceAt(x, z) !== 0 || !physicalClearAt(x, 1e-5, z, radius, height, null)
        || !npcFireClear(x, 0, z, x, 0, z, height)) continue;
      for (let i = 0; i < crew.list.length; i++) {
        const other = crew.list[i], p = other.root.position, feet = p.y - other.baseY;
        if (other !== cave && other.root.visible && feet < height && feet + other.bodyHeight > 0
          && Math.hypot(p.x - x, p.z - z) < radius + other.bodyRadius + 0.15) continue candidates;
      }
      if (outside) for (let i = 0; i < outside.length; i++) {
        const p = outside[i];
        if (p.y < height && p.y + p.height > 0
          && Math.hypot(p.x - x, p.z - z) < radius + p.radius + 0.15) continue candidates;
      }
      // A welcome or pose can arrive before the displayed remote pool updates.
      // Reserve the room's current positions as well as the interpolated bodies.
      if (BL.net.remotes) for (const p of BL.net.remotes.values()) {
        if (!p.body || !BL.remotePlayers.onIsland(p.zone)) continue;
        const owner = crew.cavemen.get(p.bodyName || BL.net.bodyName(p.body)), gorilla = p.bodyKind === "gorilla";
        const rig = gorilla && owner && clankers?.list[owner.index]?.gorilla;
        const peerRadius = gorilla ? Math.max(BL.clankers.WALK_RADIUS, rig ? rig.bodyRadius + 0.1 : 0) : owner?.bodyRadius || PLAYER_RADIUS;
        const peerHeight = gorilla ? Math.max(BL.clankers.WALK_HEIGHT, rig ? rig.bodyHeight : 0) : owner?.bodyHeight || REMOTE_BODY_HEIGHT;
        if (p.y < height && p.y + peerHeight > 0
          && Math.hypot(p.x - x, p.z - z) < radius + peerRadius + 0.15) continue candidates;
      }
      if (clankers) for (let i = 0; i < clankers.list.length; i++) {
        const entry = clankers.list[i];
        if (entry.active && !clankerBodySegmentClear(entry, x, 1e-5, z, x, 1e-5, z, radius, height)) continue candidates;
      }
      out.x = x; out.y = 0; out.z = z;
      if (search) search.next = attempt + 1;
      return true;
    }
    return false;
  };
  // Surface caves and the headquarters can share a column below the same roof.
  const supportAt = (x, z, y = Infinity) => island.supportAt(x, z, y, STEP_MAX);
  // How far under the surface the Mempool island's water carries each kind of body, so its head stays above:
  // an Ooga to its neck, by its own height, and a gorilla on all fours to its chest.
  const OOGA_DRAUGHT = 0.55, GORILLA_DRAUGHT = 0.9;
  // Afloat in the Mempool island's water a body treads it: arms out and sculling, nothing more. The same pose
  // for the visitor's Ooga, the crew's and another player's, from where each already stands.
  const floatPose = (cave, feet, height, phase, time) => {
    const p = cave.root.position;
    if (cave.grabbedBy) return;
    if (!mempoolIsland || !mempoolIsland.afloat(p.x, p.z, feet, height * OOGA_DRAUGHT)) {
      if (cave.poolSwimming) {
        cave.poolSwimming = false;
        cave.parts.armL.rotation.z = 0.12;
        cave.parts.armR.rotation.z = -0.12;
      }
      return;
    }
    cave.poolSwimming = true;
    const parts = cave.parts, s = Math.sin(time * 2.4 + phase), c = Math.cos(time * 2.4 + phase);
    parts.armL.rotation.z = 1.15 + s * 0.16; parts.armR.rotation.z = -1.15 - s * 0.16;
    parts.armL.rotation.x = parts.armR.rotation.x = -0.25 + c * 0.22;
    parts.legL.rotation.x = c * 0.3; parts.legR.rotation.x = -c * 0.3;
  };
  const waterSupportAt = (x, z, y, rise, player) => mempoolIsland ? mempoolIsland.floatAt(x, z, y, rise, player ? player.bodyHeight * OOGA_DRAUGHT : CLOSE_VIEW.eyeHeight * OOGA_DRAUGHT) : -Infinity;
  const rageThrown = actor => !!(actor?.leap?.thrown && actor.leap.rageThrown);
  const playerSupportAt = (x, z, y = 0, previousY = y, player = pilot?.player, dockEntry = false, ignoreClanker = false, passTraffic = false) => {
    passTraffic = passTraffic || rageThrown(player);
    const step = player ? player.hop === 0 && player.hopV <= 0 : !pilot.freeFalling;
    const from = Math.max(y, previousY), rise = step ? STEP_MAX : 0;
    return Math.max(island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS), bedSupportAt(x, z, from, STEP_MAX, PLAYER_RADIUS), propSupportAt(x, z, from, rise, player, ignoreClanker, passTraffic), waterSupportAt(x, z, from, rise, player), dockStairs ? dockStairs.supportAt(x, z, from, rise, player, dockEntry) : -Infinity);
  };
  const abyssAt = (x, z, y, actor = pilot?.player) => playerSupportAt(x, z, y, y, actor) === ABYSS_FLOOR;
  const visualSupportAt = (x, z, y) => {
    const floor = Math.max(bedSupportAt(x, z, y, STEP_MAX, PLAYER_RADIUS), propSupportAt(x, z, y, STEP_MAX, pilot.player), waterSupportAt(x, z, y, STEP_MAX, pilot.player), dockStairs ? dockStairs.supportAt(x, z, y, STEP_MAX, pilot.player, false) : -Infinity);
    return floor > -Infinity && floor > island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, PLAYER_RADIUS) ? floor : island.smoothSupportAt(x, z, y, STEP_MAX, PLAYER_RADIUS);
  };
  const PLAYER_RADIUS = 0.3;
  const BODY_RADIUS = 0.38;
  const BODY_PARTS_SOLID = ["torso", "head", "armR", "armL", "legR", "legL"];
  const BODY_BOUNDS = new Float64Array(6);
  // A swept circle restricted to the time the body overlaps the solid's height.
  // Also catches a fast move across a thin post or another Ooga.
  const cylinderSegmentClear = (x, y, z, toX, toY, toZ, radius, height, cx, cz, bottom, top, solidRadius) => {
    const dy = toY - y;
    let lo = 0, hi = 1;
    if (dy) {
      const a = (bottom - height + 1e-7 - y) / dy, b = (top - 1e-7 - y) / dy;
      lo = Math.max(0, Math.min(a, b)); hi = Math.min(1, Math.max(a, b));
      if (hi < lo) return true;
    } else if (y >= top - 1e-7 || y + height <= bottom + 1e-7) return true;
    const dx = toX - x, dz = toZ - z, length = dx * dx + dz * dz;
    // Actors can arrive at a shared spawn or be placed by a pointer.
    // Let an existing overlap separate, while still rejecting any move farther in.
    const startDistance = (x - cx) ** 2 + (z - cz) ** 2, endDistance = (toX - cx) ** 2 + (toZ - cz) ** 2;
    if (y < top - 1e-7 && y + height > bottom + 1e-7
      && startDistance < (radius + solidRadius) ** 2 && endDistance > startDistance + 1e-9 && (x - cx) * dx + (z - cz) * dz >= 0) return true;
    const t = length ? Math.max(lo, Math.min(hi, ((cx - x) * dx + (cz - z) * dz) / length)) : lo;
    const ox = x + dx * t - cx, oz = z + dz * t - cz, reach = radius + solidRadius;
    return ox * ox + oz * oz >= reach * reach - 1e-8;
  };
  const actorBounds = (cave) => {
    const p = cave.root.position;
    if (cave.root.quaternion && cave.solidBounds) return cave.solidBounds;
    BODY_BOUNDS[0] = p.x - BODY_RADIUS; BODY_BOUNDS[2] = p.z - BODY_RADIUS;
    BODY_BOUNDS[3] = p.x + BODY_RADIUS; BODY_BOUNDS[5] = p.z + BODY_RADIUS;
    BODY_BOUNDS[1] = p.y - cave.baseY; BODY_BOUNDS[4] = BODY_BOUNDS[1] + cave.bodyHeight;
    return BODY_BOUNDS;
  };
  const updateSleepingSolids = () => {
    for (let index = 0; index < crew.list.length; index++) {
      const cave = crew.list[index];
      if (!cave.root.visible || !cave.root.quaternion) continue;
      const out = cave.solidBounds;
      out[0] = out[1] = out[2] = Infinity; out[3] = out[4] = out[5] = -Infinity;
      BL.scene.updateWorld(cave.root);
      for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
        const part = cave.parts[BODY_PARTS_SOLID[i]];
        if (!part?.geometry || !part.visible) continue;
        const b = BL.scene.boundsOf(part.geometry), m = part.world;
        for (let k = 0; k < 8; k++) {
          const x = k & 1 ? b.max[0] : b.min[0], y = k & 2 ? b.max[1] : b.min[1], z = k & 4 ? b.max[2] : b.min[2];
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
          out[0] = Math.min(out[0], wx); out[1] = Math.min(out[1], wy); out[2] = Math.min(out[2], wz);
          out[3] = Math.max(out[3], wx); out[4] = Math.max(out[4], wy); out[5] = Math.max(out[5], wz);
        }
      }
    }
  };
  const bodyOverlaps = (cave, b, x, z, radius) => {
    if (!cave.root.quaternion) { const p = cave.root.position; return (p.x - x) ** 2 + (p.z - z) ** 2 < (radius + BODY_RADIUS) ** 2 - 1e-8; }
    const dx = Math.max(b[0] - x, 0, x - b[3]), dz = Math.max(b[2] - z, 0, z - b[5]);
    return dx * dx + dz * dz < radius * radius - 1e-8;
  };
  const uprightCharacter = (cave) => cave.root.visible && cave.state !== "sleeping" && !cave.grabbedBy && !cave.root.quaternion && !cave.camp.seat && !cave.camp.rolling;
  const standingPassenger = (cave) => uprightCharacter(cave) && cave.hop <= 1e-7 && cave.hopV <= 0 && !cave.jet?.thrust;
  const passengerOf = (cave, support) => {
    if (!support || !cave.riding.support || !uprightCharacter(support)) return false;
    // Links exist only during the crew's ordered update.
    // Bound chains by the roster in case two bodies were placed into an invalid shared position.
    for (let n = 0; cave && n < crew.cavemen.size; n++) {
      if (!standingPassenger(cave)) return false;
      cave = cave.riding.support;
      if (cave === support) return true;
    }
    return false;
  };
  const characterSupportAt = (cave) => {
    if (!standingPassenger(cave)) return null;
    const p = cave.root.position, feet = p.y - cave.baseY;
    let support = null, distance = Infinity;
    for (let otherIndex = 0; otherIndex < crew.list.length; otherIndex++) {
      const other = crew.list[otherIndex];
      if (other === cave || !uprightCharacter(other)) continue;
      const b = actorBounds(other);
      if (Math.abs(b[4] - feet) > 1e-6 || !bodyOverlaps(other, b, p.x, p.z, PLAYER_RADIUS)) continue;
      const q = other.root.position, d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
      if (d < distance) { support = other; distance = d; }
    }
    return support && Math.abs(playerSupportAt(p.x, p.z, feet, feet, cave) - feet) <= 1e-6 ? support : null;
  };
  let clankerSupportActor = null;
  const npcYieldAhead = (cave, fx, fz) => {
    if (!clankers || cave.humanControlled || cave.remoteControlled) return false;
    const p = cave.root.position, feet = p.y - cave.baseY, shape = BL.agent.torso;
    for (const entry of clankers.list) {
      if (!entry.active || !entry.root.visible || entry.controlled || entry.remoteControlled
        || Math.abs(entry.speed) <= 0.1 && !entry.drive.airborne && !entry.jump.active) continue;
      const q = entry.root.position;
      // A passenger or an Ooga on a different floor keeps its ordinary support.
      if (feet > q.y + STEP_MAX || feet + cave.bodyHeight <= q.y + 0.1
        || (p.x - q.x) ** 2 + (p.z - q.z) ** 2 > 16) continue;
      const sine = Math.sin(entry.heading), cosine = Math.cos(entry.heading);
      const width = shape.radius(entry) + cave.bodyRadius, reach = width + (cave.traffic.yielding ? 0.85 : 0.6);
      for (let i = 0; i < shape.count(entry); i++) {
        const offset = shape.offset(entry, i), dx = q.x + sine * offset - p.x, dz = q.z + cosine * offset - p.z;
        const along = dx * fx + dz * fz;
        if (along > 0 && along < reach && Math.abs(dx * fz - dz * fx) < width) return true;
      }
    }
    return false;
  };
  const characterClankerSupportAllowed = (node, y) => {
    const entry = clankerPartOwners.get(node), rage = entry.rage;
    // A held grab wins over stepping onto its hunter. An Ooga moving into
    // the gorilla during the crew update stays reachable for the next grab.
    if (clankerSupportActor && rage?.active && rage.grabHeld
      && (rage.debug || rage.agitators[crew.list.indexOf(clankerSupportActor)])
      && rageCaptureEligible(entry, clankerSupportActor)) return false;
    // A gorilla on another floor or hanging overhead is not a step below us.
    return entry.active && entry.root.position.y <= y + STEP_MAX + 1e-7;
  };
  const characterClankerSupportAt = (x, z, y, rise, actor) => {
    if (!clankerMeshes) return -Infinity;
    // Grounded Oogas walk over the live mesh without a body/side barrier.
    // Airborne Oogas still land only on surfaces below their world feet.
    const step = actor && actor.hop === 0 && actor.hopV <= 0 && !actor.ladder?.plane
      ? Math.max(rise, BL.clankers.WALK_HEIGHT) : rise;
    clankerSupportActor = actor;
    const floor = clankerMeshes.supportAt(x, z, y, step, PLAYER_RADIUS, null, null, false, characterClankerSupportAllowed);
    clankerSupportActor = null;
    return floor;
  };
  const riderSupportAllowed = (node) => clankerPartOwners.get(node) === grabSupportEntry;
  const clankerGripAt = (entry) => {
    const arm = entry.gorilla.parts.armL;
    BL.scene.updateWorld(entry.root, entry.root.parent.world);
    const bounds = BL.scene.boundsOf(arm.geometry);
    BL.math.mat4.transformPoint(dragHand, arm.world, bounds.center[0], bounds.min[1] + 0.08, bounds.center[2]);
    return dragHand;
  };
  const rageCaptive = (entry) => entry?.capture?.cave || null;
  const rageCaptureEligible = (entry, cave) => !!entry && !!cave && uprightCharacter(cave)
    && !cave.health.stunned && !cave.remoteControlled && !cave.puppet && !cave.camp.burning
    && !cave.jet?.thrust && !cave.ladder?.plane && !cave.bedTravel.mode && !cave.leap.thrown
    && (cave.state === "working" || cave.state === "chilling");
  // Rage ignores decorative uprights, including the hand's approach before a
  // capture. Carrying also passes Ooga traffic and short props. Terrain,
  // buildings and gorillas remain solid; standing release uses strict sweeps.
  const captureSegmentClear = (entry, cave, x, y, z, toX, toY, toZ, radius, height, toRadius = radius, toHeight = height,
    passTraffic = BL.clankers.rageCarrying(entry), passRageProps = !!entry?.rage?.active) => {
    const reach = Math.max(radius, toRadius), tall = Math.max(height, toHeight);
    if (crossesSealedCave(x, z, toX, toZ, Math.min(y, toY))
      || !island.clearAt(toX, toY, toZ, toRadius, toHeight)
      || !island.voxelSegmentClearAt(x, y, z, toX, toY, toZ, reach, tall)
      || !propSegmentClear(x, y, z, toX, toY, toZ, radius, height, cave, false, false, toRadius, toHeight, passTraffic, passRageProps)
      || !bedSegmentClear(x, y, z, toX, toY, toZ, reach, tall)
      || !matrixGateSegmentClear(x, y, z, toX, toY, toZ, reach, tall)
      || !mirrorActorSegmentClear(x, y, z, toX, toY, toZ, tall, cave)) return false;
    if (!passTraffic) for (let i = 0; i < clankerCaptures.length; i++) {
      const rec = clankerCaptures[i], other = rec.cave;
      if (!other || other === cave || !rec.posed) continue;
      for (let j = 0; j < BODY_PARTS_SOLID.length; j++) {
        const n = j * 6, b = rec.bounds;
        if (!terrain.segmentBoxClear(x, y, z, toX - x, toY - y, toZ - z, reach, tall,
          b[n], b[n + 1], b[n + 2], b[n + 3], b[n + 4], b[n + 5])) return false;
      }
    }
    if (clankers) for (const other of clankers.list) {
      if (other !== entry && other.active && !clankerBodySegmentClear(other, x, y, z, toX, toY, toZ, reach, tall)) return false;
    }
    return true;
  };
  const captureBounds = (cave, out) => {
    BL.scene.updateWorld(cave.root, cave.root.parent.world);
    for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
      const node = cave.parts[BODY_PARTS_SOLID[i]], b = BL.scene.boundsOf(node.geometry), m = node.world, n = i * 6;
      out[n] = out[n + 1] = out[n + 2] = Infinity;
      out[n + 3] = out[n + 4] = out[n + 5] = -Infinity;
      for (let k = 0; k < 8; k++) {
        const x = k & 1 ? b.max[0] : b.min[0], y = k & 2 ? b.max[1] : b.min[1], z = k & 4 ? b.max[2] : b.min[2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        out[n] = Math.min(out[n], wx); out[n + 1] = Math.min(out[n + 1], wy); out[n + 2] = Math.min(out[n + 2], wz);
        out[n + 3] = Math.max(out[n + 3], wx); out[n + 4] = Math.max(out[n + 4], wy); out[n + 5] = Math.max(out[n + 5], wz);
      }
    }
  };
  const beginClankerCapture = (entry, cave, autonomous) => {
    if (!gameMode) return false;
    const rec = entry.capture;
    if (!rec || rec.cave || cave.grabbedBy) return false;
    rec.cave = cave; rec.autonomous = autonomous; rec.throwing = rec.posed = false;
    rec.time = rec.charge = 0;
    const p = cave.root.position;
    rec.safeX = p.x; rec.safeY = p.y - cave.baseY + cave.restLower; rec.safeZ = p.z;
    rec.player = cave === pilot.player;
    captureBounds(cave, rec.bounds);
    cave.grabbedBy = entry; entry.motion.dragging = true; entry.motion.throwProgress = 0;
    // A blocked first grip must not cancel the target's movement or weapon.
    // Prove its physical pose before preparing the accepted capture.
    if (autonomous && !capturedPosePreview(entry, true)) {
      rec.cave = null; cave.grabbedBy = null; entry.motion.dragging = false;
      return false;
    }
    crew.prepareDragged(cave);
    if (autonomous) captureFlightEnvelope(cave, rec);
    return true;
  };
  const grabClankerRider = (entry) => {
    if (!gameMode || !entry || rageCaptive(entry) || !clankerMeshes || !crew) return false;
    grabSupportEntry = entry;
    let nearest = Infinity, rider = null;
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i], p = cave.root.position;
      if (cave === pilot?.player || !uprightCharacter(cave) || cave.health.stunned || cave.hop > 0.7
        || cave.state !== "working" && cave.state !== "chilling") continue;
      const distance = (p.x - entry.root.position.x) ** 2 + (p.z - entry.root.position.z) ** 2;
      if (distance > 9 || distance >= nearest) continue;
      const feet = p.y - cave.baseY;
      if (feet < entry.root.position.y + 0.6) continue;
      const support = clankerMeshes.supportAt(p.x, p.z, feet, 0.15, PLAYER_RADIUS, null, null, false, riderSupportAllowed);
      if (Math.abs(support - feet) > 0.7) continue;
      if (distance < nearest) { nearest = distance; rider = cave; }
    }
    grabSupportEntry = null;
    return !!rider && beginClankerCapture(entry, rider, false);
  };
  const rageApproach = (entry, cave, out) => {
    if (!rageCaptureEligible(entry, cave)) return false;
    const p = entry.root.position, target = cave.root.position;
    const dx = target.x - p.x, dz = target.z - p.z;
    // The grab is held during pursuit. Aim the trunk into body contact;
    // a galloping palm changes position each frame and is not a stable goal.
    const r = entry.rage;
    const heading = r.approachAttempt
      ? r.approachBearing + (r.approachAttempt === 1 ? Math.PI / 3 : -Math.PI / 3)
      : Math.hypot(dx, dz) > 1e-7 ? Math.atan2(dx, dz) : entry.heading;
    const sx = Math.sin(heading), sz = Math.cos(heading);
    const standoff = Math.max(1.05, 1.65 - (entry.rage.approachInset || 0)) * entry.root.scale.x;
    out.x = target.x - sx * standoff;
    out.y = target.y - cave.baseY + cave.restLower;
    out.z = target.z - sz * standoff;
    out.heading = heading;
    return true;
  };
  const rageGrab = (entry, cave) => {
    if (!BL.clankerRage.signedOut() || !entry?.rage?.active || entry.controlled || !rageCaptureEligible(entry, cave) || rageCaptive(entry)) return false;
    const p = cave.root.position, q = entry.root.position, feet = p.y - cave.baseY + cave.restLower;
    // A held G takes effect on the first clear body contact, even when the
    // planted hand is behind its shoulder in the gallop cycle.
    if (Math.hypot(p.x - q.x, p.z - q.z) > entry.radius + BODY_RADIUS) return false;
    if (Math.abs(feet - q.y) > 0.7) { entry.capture.blocked = "height"; return false; }
    const hand = clankerGripAt(entry);
    // The hand-to-body sweep still must be free of walls and other captives.
    const y = clamp(hand[1], feet + 0.12, feet + cave.bodyHeight - 0.12);
    if (!captureSegmentClear(entry, cave, hand[0], hand[1], hand[2], p.x, y, p.z, 0.08, 0.08)) {
      entry.capture.blocked = "hand"; return false;
    }
    if (!beginClankerCapture(entry, cave, true)) return false;
    grabbedOogaPose(cave);
    return cave.grabbedBy === entry;
  };
  const RAGE_WARP_BORDER = 18.5;
  const RAGE_WARP_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const rageWarpRequired = (entry, cave) => {
    if (!cave) return false;
    const p = cave.root.position, feet = p.y - cave.baseY + cave.restLower;
    if (!island.onLand(p.x, p.z) || Math.hypot(p.x, p.z) <= RAGE_WARP_BORDER || feet <= BL.clankers.PROP_STEP) return false;
    // Exterior ledges and roofs qualify, but a cave's raised floor does not.
    // Query the actual height: the highest surface hides lower open ledges.
    const y = feet + 0.08, column = RAGE_WARP_COLUMN, hq = island.headquarters.caveIndex;
    if (island.cavityAt(p.x, p.z, column, hq, y) && column.caveIndex === hq
      && y >= column.floor - STEP_MAX && y < column.ceiling) return false;
    return !(island.cavityAt(p.x, p.z, column, 0, y) && y >= column.floor - STEP_MAX && y < column.ceiling);
  };
  const RAGE_WARP_MOTION = {
    lab: false, rage: true, workExit: true, supportOffset: 0, supportEntry: null,
    dragging: true, throwProgress: 0, walkGait: "gallop", walkPhase: NaN,
    groundRects: { flat: {}, angled: {} }
  };
  let rageWarpInitial = false, rageWarpGripChecked = false, rageWarpGripClear = false;
  const rageWarpTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    if (!clankerWalkTransitionClear(entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight)) return false;
    if (!rageWarpGripChecked) {
      rageWarpGripChecked = true;
      rageWarpGripClear = capturedPosePreview(entry, rageWarpInitial, true);
    }
    return rageWarpGripClear;
  };
  const rageWarpSpotClear = (entry, cave, spot, initial) => {
    const rec = entry.capture, motion = entry.motion, heading = entry.heading;
    const parked = entry.parked, biped = entry.biped, planningLab = entry.planningLab;
    const climbing = entry.climb.active, jumping = entry.jump.active, airborne = entry.drive.airborne;
    const passiveFall = entry.drive.passiveFall, autonomous = rec.autonomous, held = rec.cave;
    const grabbedBy = cave.grabbedBy;
    const facing = Math.atan2(spot.dx, spot.dz);
    RAGE_WARP_MOTION.supportEntry = entry;
    entry.motion = RAGE_WARP_MOTION; entry.heading = facing;
    entry.parked = entry.biped = entry.planningLab = false;
    entry.climb.active = entry.jump.active = entry.drive.airborne = entry.drive.passiveFall = false;
    rec.autonomous = true; rec.cave = cave; cave.grabbedBy = entry;
    rageWarpInitial = initial; rageWarpGripChecked = rageWarpGripClear = false;
    try {
      rec.blocked = "warp-support";
      if (Math.abs(clankerSupportAt(entry, spot.x, spot.z, spot.y, BL.clankers.PROP_STEP, facing) - spot.y) >= 0.025) return false;
      // Keep a real standing cancellation point at the returned footing,
      // including props that the held pair may otherwise pass through.
      rec.blocked = "warp-release";
      if (!captureSegmentClear(entry, cave, spot.x, spot.y + 0.025, spot.z, spot.x, spot.y + 0.025, spot.z,
        PLAYER_RADIUS, cave.bodyHeight, PLAYER_RADIUS, cave.bodyHeight, false, false)) return false;
      rec.blocked = "warp-center";
      if (!clankerCenterClear(entry, spot.x, spot.y, spot.z, spot.x, spot.y, spot.z, false, facing, facing)) return false;
      rec.blocked = "warp-rig";
      // Live carrying never hull-tests the gorilla's own planted limbs: a
      // supporting knuckle rests a little inside flat ground. Keep the
      // per-vertex terrain test, the limb sweeps and the captive's grip.
      const clear = entry.gorilla.climbPoseClear(2, spot.x, spot.y, spot.z, facing, RAGE_WARP_MOTION,
        clankerWalkSolidAt, rageWarpTransitionClear, entry, 0, true, "", "");
      if (!clear) { if (!rec.blocked) rec.blocked = "warp-rig"; return false; }
      if (!rageWarpGripChecked || !rageWarpGripClear) { rec.blocked = "warp-grip"; return false; }
      rec.blocked = "";
      return true;
    } finally {
      entry.motion = motion; entry.heading = heading; entry.parked = parked; entry.biped = biped; entry.planningLab = planningLab;
      entry.climb.active = climbing; entry.jump.active = jumping; entry.drive.airborne = airborne; entry.drive.passiveFall = passiveFall;
      rec.autonomous = autonomous; rec.cave = held; cave.grabbedBy = grabbedBy;
      RAGE_WARP_MOTION.supportEntry = null;
    }
  };
  const rageWarpHomeSpot = (entry, cave, initial) => {
    if (!rageThrowMap.ready) return -1;
    const p = entry.root.position, spots = rageThrowMap.spots, r = entry.rage;
    // Fixed shared pads, at most four live endpoint fits per retry. There is
    // no cliff route, takeoff search or full-flight search in this operation.
    for (let attempt = 0; attempt < 4; attempt++) {
      let nearest = Infinity, chosen = -1;
      for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        if (!spot.valid || spot.land !== 1 || r.edgeRejected[spot.ray] & 1 << spot.inset) continue;
        const d = (spot.x - p.x) ** 2 + (spot.z - p.z) ** 2;
        if (d < nearest) { nearest = d; chosen = i; }
      }
      if (chosen < 0) { r.edgeRejected.fill(0); return -1; }
      const spot = spots[chosen];
      if (rageWarpSpotClear(entry, cave, spot, initial)) return chosen;
      r.edgeRejected[spot.ray] |= 1 << spot.inset;
    }
    return -1;
  };
  const rageWarpTarget = (entry, cave) => {
    if (!gameMode || !BL.clankerRage.signedOut() || !entry?.rage?.active || entry.controlled
      || !rageCaptureEligible(entry, cave) || rageCaptive(entry) || !rageWarpRequired(entry, cave)) return false;
    const spotIndex = rageWarpHomeSpot(entry, cave, true);
    if (spotIndex < 0) return false;
    // Save the visible ankle before stopping the target's movement. The
    // brief wall visit pins the palm here without fitting either body to rock.
    const p = cave.root.position, q = entry.root.position, rec = entry.capture;
    rec.warpFromX = q.x; rec.warpFromY = q.y; rec.warpFromZ = q.z; rec.warpFromHeading = entry.heading;
    captureBounds(cave, rec.bounds);
    const foot = cave.parts.legR, bounds = BL.scene.boundsOf(foot.geometry);
    BL.math.mat4.transformPoint(dragFoot, foot.world, bounds.center[0], bounds.min[1], bounds.center[2]);
    rec.warpAnkleX = dragFoot[0]; rec.warpAnkleY = dragFoot[1]; rec.warpAnkleZ = dragFoot[2];
    q.x = p.x; q.y = p.y - cave.baseY + cave.restLower; q.z = p.z;
    entry.heading = Math.atan2(-p.x, -p.z);
    rec.warpSpot = spotIndex; rec.warpVisit = true; rec.cave = cave; rec.autonomous = true; rec.throwing = rec.posed = false;
    rec.time = rec.charge = 0; rec.safeX = p.x; rec.safeY = q.y; rec.safeZ = p.z;
    rec.player = cave === pilot.player;
    cave.grabbedBy = entry; entry.motion.dragging = true; entry.motion.throwProgress = 0;
    crew.prepareDragged(cave);
    captureFlightEnvelope(cave, rec);
    return true;
  };
  const rageWarpPose = (entry) => {
    const rec = entry.capture, cave = rec.cave, p = entry.root.position, motion = entry.motion;
    // Animation-only airborne pose: no planted-hand fitting against the wall
    // and no actual jump controller. The manager holds this pose until return.
    entry.gorilla.poseManaged(2, p.x, p.y, p.z, entry.heading, 0, true, false, "", motion);
    entry.gorilla.poseManaged(2, p.x, p.y, p.z, entry.heading, 0, true, false, "", motion);
    const hand = clankerGripAt(entry);
    p.x += rec.warpAnkleX - hand[0]; p.y += rec.warpAnkleY - hand[1]; p.z += rec.warpAnkleZ - hand[2];
    grabbedOogaPose(cave);
  };
  const rageWarpHome = (entry) => {
    const rec = entry.capture, cave = rec?.cave;
    if (!rec?.autonomous || !cave || cave.grabbedBy !== entry) return false;
    let index = rec.warpSpot, spot = rageThrowMap.spots[index];
    if (!rageThrowMap.ready) return false;
    if (!spot?.valid || spot.land !== 1 || !rageWarpSpotClear(entry, cave, spot, false)) {
      index = rageWarpHomeSpot(entry, cave, false);
      if (index < 0) return false;
      spot = rageThrowMap.spots[index];
    }
    const p = entry.root.position, motion = entry.motion;
    p.x = spot.x; p.y = spot.y; p.z = spot.z; entry.heading = Math.atan2(spot.dx, spot.dz);
    const workExit = motion.workExit;
    motion.workExit = true;
    entry.gorilla.poseManaged(2, p.x, p.y, p.z, entry.heading, 0, false, false, "", motion);
    entry.gorilla.poseManaged(2, p.x, p.y, p.z, entry.heading, 0, false, false, "", motion);
    motion.workExit = workExit;
    // Rebase both the carry hull and the safe cancellation point. A later
    // drop must not restore the old cliff position after a successful return.
    rec.safeX = p.x; rec.safeY = p.y; rec.safeZ = p.z;
    rec.warpSpot = -1;
    if (!grabbedOogaPose(cave, false, true)) return false;
    rec.warpVisit = false;
    return true;
  };
  const captureFlightEnvelope = (cave, rec) => {
    // Measure the released flying limbs once per capture. The walking
    // cylinder misses hands and feet beside a hill on the outgoing arc.
    const parts = cave.parts, right = parts.armR.rotation, left = parts.armL.rotation;
    const rightX = right.x, rightZ = right.z, leftX = left.x, leftZ = left.z;
    const legR = parts.legR.rotation.x, legL = parts.legL.rotation.x;
    const rightQuat = parts.armR.quaternion, leftQuat = parts.armL.quaternion;
    const rootX = cave.root.rotation.x, rootZ = cave.root.rotation.z;
    parts.armR.quaternion = parts.armL.quaternion = null;
    cave.root.rotation.x = cave.root.rotation.z = 0;
    right.x = left.x = -1.1; right.z = -0.12; left.z = 0.12;
    parts.legR.rotation.x = -0.5; parts.legL.rotation.x = -0.3;
    captureBounds(cave, rec.nextBounds);
    const p = cave.root.position, bounds = rec.nextBounds, feet = p.y - cave.baseY;
    let radius = Math.max(PLAYER_RADIUS, cave.bodyRadius), bottom = 0, top = cave.bodyHeight;
    for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
      const n = i * 6;
      const dx = Math.max(Math.abs(bounds[n] - p.x), Math.abs(bounds[n + 3] - p.x));
      const dz = Math.max(Math.abs(bounds[n + 2] - p.z), Math.abs(bounds[n + 5] - p.z));
      radius = Math.max(radius, Math.hypot(dx, dz));
      bottom = Math.min(bottom, bounds[n + 1] - feet);
      top = Math.max(top, bounds[n + 4] - feet);
    }
    rec.flightRadius = radius; rec.flightBottom = bottom; rec.flightTop = top;
    right.x = rightX; right.z = rightZ; left.x = leftX; left.z = leftZ;
    parts.legR.rotation.x = legR; parts.legL.rotation.x = legL;
    parts.armR.quaternion = rightQuat; parts.armL.quaternion = leftQuat;
    cave.root.rotation.x = rootX; cave.root.rotation.z = rootZ;
    BL.scene.updateWorld(cave.root, cave.root.parent.world);
  };
  const captureLaunchClear = (entry, cave, x, y, z, vx, vy, vz, releasing = false) => {
    rageThrowMap.liveProofs++;
    const passTraffic = BL.clankers.rageCarrying(entry);
    const rec = entry.capture, radius = rec.flightRadius, bottom = rec.flightBottom;
    let px = x, py = y + bottom, pz = z, outside = rageLandAt(x, z) === 0;
    for (let i = 1; i <= 200; i++) {
      const t = i * 0.04, gravity = BL.pilot.WALK.gravity;
      // The crew applies gravity before moving. At release, sweep the whole
      // height band down to its worst 0.1 s frame, not just the ideal parabola.
      const fall = releasing ? gravity * 0.1 * t / 2 : 0;
      const nx = x + vx * t, ny = y + bottom + vy * t - gravity * t * t / 2 - fall, nz = z + vz * t;
      const height = rec.flightTop - bottom + fall;
      // The measured limbs need hill clearance. Keep prop admission on the
      // airborne controller's body cylinder: a full-width cylinder down to
      // the lowest foot invents solid space between the outstretched limbs.
      if (!island.voxelSegmentClearAt(px, py, pz, nx, ny, nz, radius, height)
        || !captureSegmentClear(entry, cave, px, py - bottom, pz, nx, ny - bottom, nz,
          PLAYER_RADIUS, cave.bodyHeight + fall, PLAYER_RADIUS, cave.bodyHeight + fall, passTraffic)) return false;
      if (rageLandAt(nx, nz)) { if (outside) return false; }
      else outside = true;
      if (ny + height < SEA_Y) return outside;
      px = nx; py = ny; pz = nz;
    }
    return false;
  };
  const finishClankerRider = (entry, throwing, charge = 0, aim = null, carryX = 0, carryZ = 0) => {
    throwing = throwing && gameMode;
    const rec = entry?.capture, cave = rec?.cave;
    if (!cave) return false;
    if (cave.grabbedBy !== entry) return false;
    if (throwing && rec.warpVisit) return false;
    const p = cave.root.position, hand = clankerGripAt(entry), handY = hand[1];
    // Rage aims a direction; moving the hand through the swing must not
    // change its 45-degree release. Only close combat throws aim at a point;
    // carry and bird's-eye throw forward at 45 degrees from the release hand.
    const fixed = rec.autonomous && aim;
    const tx = fixed ? aim.dx : aim ? aim.ox + aim.dx * 24 - hand[0] : Math.sin(entry.heading);
    const ty = fixed ? aim.dy : aim ? aim.oy + aim.dy * 24 - handY : 1;
    const tz = fixed ? aim.dz : aim ? aim.oz + aim.dz * 24 - hand[2] : Math.cos(entry.heading);
    const launch = 6 + 12 * clamp(charge, 0, 1), distance = Math.hypot(tx, ty, tz) || 1;
    // Inherited running speed must not flatten or turn a fixed-angle throw.
    const carry = !rec.autonomous && !!aim;
    const vx = tx / distance * launch + (carry ? carryX : 0), vy = ty / distance * launch;
    const vz = tz / distance * launch + (carry ? carryZ : 0);
    if (throwing && rec.autonomous && rageMappedLand(entry.rage.edgeLand) && !rageThrowMap.ready) return false;
    if (throwing && rec.autonomous && !(rageMappedLand(entry.rage.edgeLand)
      ? rageMappedLaunchClear(entry, cave, p.x, handY, p.z, vx, vy, vz)
      : captureLaunchClear(entry, cave, p.x, handY, p.z, vx, vy, vz, true))) {
      // Let the damped arm finish rising before abandoning this stance.
      // If it still cannot clear, retain G and try the next viable stance.
      if (rec.time < THROW_SWING_TIME + THROW_SETTLE_TIME) return false;
      const r = entry.rage;
      if (r.edgeIndex >= 0) r.edgeRejected[r.edgeIndex] |= 1 << r.edgeInset;
      r.edgeReady = false; r.edgeWaiting = true;
      rec.throwing = false; rec.time = 0; entry.motion.throwProgress = 0;
      return false;
    }
    const heldHeight = rec.autonomous && !throwing ? rec.safeY : handY;
    // A free arm can swing above a low roof. Find headroom from the
    // carrier's floor side of that roof before standing the captive upright.
    const ceiling = throwing ? ceilingAt(p.x, p.z, Math.min(heldHeight, entry.root.position.y + 0.025), cave) : Infinity;
    const height = throwing ? Math.min(heldHeight, ceiling - cave.bodyHeight - Math.max(0, cave.viewLift)) : heldHeight;
    // Keep the roof outside the support query's step allowance.
    const supportY = Math.min(heldHeight, ceiling - STEP_MAX - 1e-6);
    // Query support before lowering the release. An upright body that cannot
    // fit here stays held, rather than querying through this floor to a lower level.
    if (throwing && height < playerSupportAt(p.x, p.z, supportY, supportY, cave, false, true, rec.autonomous)) {
      rec.throwing = false; rec.time = 0; entry.motion.throwProgress = 0;
      return false;
    }
    rec.cave = null; rec.throwing = false; rec.posed = false;
    entry.motion.dragging = false; entry.motion.throwProgress = 0;
    if (rec.warpVisit) {
      // Cancelling at the wall restores the hunter's starting point, never
      // leaves an unheld gorilla embedded beneath the temporary ankle grip.
      const q = entry.root.position;
      q.x = rec.warpFromX; q.y = rec.warpFromY; q.z = rec.warpFromZ; entry.heading = rec.warpFromHeading;
    }
    rec.warpVisit = false; rec.warpSpot = -1;
    cave.grabbedBy = null;
    crew.recoverDragged(cave);
    crew.poseWeapon(cave);
    // Retain the latest clear standing point through a drag, jump or swing;
    // cancellation returns there even while the held body is off the floor.
    if (rec.autonomous && !throwing) { p.x = rec.safeX; p.y = rec.safeY + cave.baseY; p.z = rec.safeZ; }
    // The held body is horizontal; standing it up at the same ankle height
    // can put its head through a low roof. Fit it below that ceiling before
    // asking for support, or the voxel query can choose the roof as its floor.
    cave.leap.rageThrown = throwing && rec.autonomous;
    const floor = playerSupportAt(p.x, p.z, height, height, cave, false, true, cave.leap.rageThrown);
    cave.hop = Math.max(0, height - floor);
    p.y = floor + cave.baseY + cave.hop;
    if (throwing) {
      cave.hopV = vy; cave.leap.vx = vx; cave.leap.vz = vz;
      cave.leap.thrown = true;
      cave.hop = Math.max(cave.hop, 0.05);
    } else { cave.hopV = 0; cave.leap.vx = cave.leap.vz = 0; cave.leap.thrown = cave.leap.rageThrown = false; }
    cave.leap.land = 0.25;
    return true;
  };
  const releaseClankerRider = (entry, throwing, charge = 0, aim = null) => {
    const rec = entry?.capture;
    if (!rec?.cave) return false;
    if (!throwing || !gameMode) return finishClankerRider(entry, false);
    if (rec.throwing || rec.warpVisit) return false;
    rec.throwing = true; rec.time = 0; rec.charge = charge;
    rec.aimed = !!aim;
    if (!aim) return true;
    const target = rec.aim;
    target.ox = aim.ox; target.oy = aim.oy; target.oz = aim.oz;
    target.dx = aim.dx; target.dy = aim.dy; target.dz = aim.dz;
    return true;
  };
  const rageRelease = (entry) => finishClankerRider(entry, false);
  const rageThrow = (entry, dx, dz, charge) => {
    const rec = entry?.capture;
    if (!BL.clankerRage.signedOut() || !entry?.rage?.active || !rec?.autonomous || !rec.cave || rec.throwing || rec.warpVisit) return false;
    const length = Math.hypot(dx, dz);
    if (!(length > 0)) return false;
    const hand = clankerGripAt(entry), aim = rec.aim;
    const speed = (6 + 12 * clamp(charge, 0, 1)) / Math.SQRT2, p = rec.cave.root.position;
    if (rageMappedLand(entry.rage.edgeLand)) {
      const r = entry.rage, spot = rageThrowMap.spots[r.edgeIndex * RAGE_HOME_RADII.length + r.edgeInset];
      if (charge < 1 || !r.edgeReady || !rageThrowMap.ready || !spot?.valid || spot.land !== r.edgeLand) return false;
    } else if (!captureLaunchClear(entry, rec.cave, p.x, hand[1], p.z,
      dx / length * speed, speed, dz / length * speed)) return false;
    aim.ox = hand[0]; aim.oy = hand[1]; aim.oz = hand[2];
    aim.dx = dx / length; aim.dy = 1; aim.dz = dz / length;
    return releaseClankerRider(entry, true, charge, aim);
  };
  const rageDragClear = (entry, x, y, z, toX, toY, toZ, heading = entry.heading, fromHeading = entry.heading) => {
    const rec = entry.capture, cave = rec?.cave;
    // A local sidestep must not undo the dry route chosen around the lake,
    // and a hunt must not wade in: swimming suspends rage movement and
    // releases a held Ooga, which would leave the gorilla floating idle.
    if (entry.rage?.active && !entry.controlled && mempoolIsland.afloat(toX, toZ, toY, GORILLA_DRAUGHT)
      && !mempoolIsland.afloat(x, z, y, GORILLA_DRAUGHT)) return false;
    if (!cave || !rec.autonomous) return true;
    if (rec.posed && !rec.throwing && !entry.drive.airborne && !entry.jump.active && !entry.climb.active && !entry.rageTraversal)
      return rageCarryClear(entry, x, y, z, toX, toY, toZ, fromHeading, heading);
    const turn = Math.atan2(Math.sin(heading - fromHeading), Math.cos(heading - fromHeading));
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - x, toY - y, toZ - z) / 0.35), Math.ceil(Math.abs(turn) / 0.15));
    if (steps > 64) return false;
    const reach = cave.traits.height * 0.9, side = rec.side, behind = rec.behind;
    for (let part = 0; part < 3; part++) {
      let ax = 0, ay = 0, az = 0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, angle = fromHeading + turn * t, sx = Math.sin(angle), sz = Math.cos(angle);
        const cx = x + (toX - x) * t + sz * side + sx * (behind - reach * part / 2);
        const cz = z + (toZ - z) * t - sx * side + sz * (behind - reach * part / 2);
        const floor = playerSupportAt(cx, cz, y + (toY - y) * t + 0.35, y + (toY - y) * t + 0.35, cave, false, true, BL.clankers.rageCarrying(entry));
        if (floor === ABYSS_FLOOR || Math.abs(floor - (y + (toY - y) * t)) > 0.6) return false;
        const cy = floor + 0.035;
        if (!captureSegmentClear(entry, cave, i ? ax : cx, i ? ay : cy, i ? az : cz, cx, cy, cz, BODY_RADIUS, cave.bodyHeight)) return false;
        ax = cx; ay = cy; az = cz;
      }
    }
    return true;
  };
  const rageCarryFloors = new Float64Array(65);
  const rageCarryClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading) => {
    const rec = entry.capture, cave = rec?.cave;
    if (!cave || !rec.autonomous || !rec.posed) return true;
    const p = entry.root.position, a = rec.bounds;
    const fromS = Math.sin(entry.heading), fromC = Math.cos(entry.heading);
    const grounded = !rec.throwing && !entry.drive.airborne && !entry.jump.active && !entry.climb.active && !entry.rageTraversal;
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - x, toY - y, toZ - z) / 0.35), Math.ceil(Math.abs(turn) / 0.15));
    if (steps > 64) return false;
    if (grounded) {
      const handHeight = clankerGripAt(entry)[1] - p.y;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, angle = fromHeading + turn * t, sx = Math.sin(angle), sz = Math.cos(angle);
        const cx = x + (toX - x) * t + sz * rec.side + sx * rec.behind;
        const cz = z + (toZ - z) * t - sx * rec.side + sz * rec.behind;
        const queryY = y + (toY - y) * t + handHeight;
        const floor = playerSupportAt(cx, cz, queryY, queryY, cave, false, true, BL.clankers.rageCarrying(entry));
        if (!Number.isFinite(floor)) return false;
        // Route estimates may carry the body above a lower floor. Dropping
        // the whole shell at the prop or bridge edge would sweep it through the side;
        // the final hand/limb preview checks when it can actually descend.
        rageCarryFloors[i] = Math.max(rec.safeY, floor);
      }
    }
    for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
      const n = i * 6, bx = (a[n] + a[n + 3]) * 0.5 - p.x, bz = (a[n + 2] + a[n + 5]) * 0.5 - p.z;
      const side = bx * fromC - bz * fromS, behind = bx * fromS + bz * fromC;
      const radius = Math.hypot(a[n + 3] - a[n], a[n + 5] - a[n + 2]) * 0.5;
      // A dragging body is fitted to its own floor. Lowering the gorilla's
      // blended prop support must not push that already fitted shell below it.
      // The final animated hand/body preview still admits each actual move.
      const height = a[n + 4] - a[n + 1] - 0.025, low = a[n + 1] - (grounded ? rec.safeY : p.y) + 0.025;
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps, angle = fromHeading + turn * t, sx = Math.sin(angle), sz = Math.cos(angle);
        const cx = x + (toX - x) * t + sz * side + sx * behind;
        const cy = (grounded ? rageCarryFloors[j] : y + (toY - y) * t) + low;
        const cz = z + (toZ - z) * t - sx * side + sz * behind;
        if (!captureSegmentClear(entry, cave, j ? ax : cx, j ? ay : cy, j ? az : cz, cx, cy, cz, radius, height)) return false;
        ax = cx; ay = cy; az = cz;
      }
    }
    return true;
  };
  const capturePoseClear = (entry, cave, rec, endpointOnly = false) => {
    captureBounds(cave, rec.nextBounds);
    // A teleport certifies its destination, never the space between islands
    // or between a cliff and the meadow. Ordinary carrying keeps its sweep.
    const a = endpointOnly ? rec.nextBounds : rec.bounds, b = rec.nextBounds;
    rec.blockedPart = rec.blockedStage = "";
    for (let i = 0; i < BODY_PARTS_SOLID.length; i++) {
      const n = i * 6, x = (a[n] + a[n + 3]) * 0.5, z = (a[n + 2] + a[n + 5]) * 0.5;
      const toX = (b[n] + b[n + 3]) * 0.5, toZ = (b[n + 2] + b[n + 5]) * 0.5;
      const radius = Math.hypot(a[n + 3] - a[n], a[n + 5] - a[n + 2]) * 0.5;
      const toRadius = Math.hypot(b[n + 3] - b[n], b[n + 5] - b[n + 2]) * 0.5;
      const y = a[n + 1] + 0.025, toY = b[n + 1] + 0.025;
      const height = a[n + 4] - y, toHeight = b[n + 4] - toY;
      // A leg rotating off a prop widens while shortening. Sweep the hull
      // of its real end cylinders instead of giving its source the final width.
      if (!captureSegmentClear(entry, cave, x, y, z, toX, toY, toZ, radius, height, toRadius, toHeight)) {
        rec.blockedPart = BODY_PARTS_SOLID[i];
        rec.blockedStage = !captureSegmentClear(entry, cave, x, y, z, x, y, z, radius, height) ? "source"
          : !captureSegmentClear(entry, cave, toX, toY, toZ, toX, toY, toZ, toRadius, toHeight) ? "destination" : "sweep";
        return false;
      }
    }
    return true;
  };
  const alignDraggedFoot = (cave, hand) => {
    const p = cave.root.position, foot = cave.parts.legR, bounds = BL.scene.boundsOf(foot.geometry);
    p.x = hand[0]; p.y = hand[1]; p.z = hand[2];
    BL.scene.updateWorld(cave.root, cave.root.parent.world);
    BL.math.mat4.transformPoint(dragFoot, foot.world, bounds.center[0], bounds.min[1], bounds.center[2]);
    p.x += hand[0] - dragFoot[0]; p.y += hand[1] - dragFoot[1]; p.z += hand[2] - dragFoot[2];
  };
  const draggedFloorClear = (cave, rec, floor) => {
    captureBounds(cave, rec.nextBounds);
    for (let i = 0; i < BODY_PARTS_SOLID.length; i++) if (rec.nextBounds[i * 6 + 1] < floor + 0.025) return false;
    return true;
  };
  const acceptCapturedPose = (entry, cave, rec, handY, preview, endpointOnly = false) => {
    const p = cave.root.position;
    const releaseFloor = playerSupportAt(p.x, p.z, handY, handY, cave, false, true, BL.clankers.rageCarrying(entry));
    const standingClear = Number.isFinite(releaseFloor) && releaseFloor !== ABYSS_FLOOR && captureSegmentClear(entry, cave,
      p.x, Math.max(handY, releaseFloor) + 0.025, p.z, p.x, releaseFloor + 0.025, p.z,
      PLAYER_RADIUS, cave.bodyHeight, PLAYER_RADIUS, cave.bodyHeight, false, false);
    // Carry off a prop before lowering to the next floor. Until that drop is
    // clear, keep the old safe point and prove a return above the prop's side.
    const returnY = Math.max(rec.safeY, handY) + 0.025;
    // Autonomous carrying keeps the last proved cancellation point. Sliding
    // past a trunk or jumping a hill only needs the actual held limbs to fit,
    // not an upright body along a hypothetical return corridor as well.
    const releaseClear = rec.autonomous || standingClear || (rec.throwing ? captureSegmentClear(entry, cave,
      rec.safeX, rec.safeY + 0.025, rec.safeZ, p.x, handY + 0.025, p.z, PLAYER_RADIUS, cave.bodyHeight)
      : captureSegmentClear(entry, cave, rec.safeX, rec.safeY + 0.025, rec.safeZ,
        rec.safeX, returnY, rec.safeZ, PLAYER_RADIUS, cave.bodyHeight) && captureSegmentClear(entry, cave,
          rec.safeX, returnY, rec.safeZ, p.x, returnY, p.z, PLAYER_RADIUS, cave.bodyHeight));
    if (!capturePoseClear(entry, cave, rec, endpointOnly)) { rec.blocked = "body"; return false; }
    if (!releaseClear) { rec.blocked = "return"; return false; }
    rec.blocked = "";
    if (preview) return true;
    if (standingClear) { rec.safeX = p.x; rec.safeY = releaseFloor; rec.safeZ = p.z; }
    rec.bounds.set(rec.nextBounds); rec.posed = true;
    return true;
  };
  const grabbedOogaPose = (cave, preview = false, endpointOnly = false) => {
    const entry = cave.grabbedBy;
    if (!entry) return false;
    const rec = entry.capture, parts = cave.parts, p = cave.root.position, hand = clankerGripAt(entry);
    const oldX = p.x, oldY = p.y, oldZ = p.z;
    cave.root.quaternion = null;
    if (rec.warpVisit && !endpointOnly) {
      // Keep the target above its held ankle during the visible visit. Rock
      // overlap is intentional here; the ground return uses normal pose checks.
      cave.root.rotation.x = cave.root.rotation.z = 0; cave.root.rotation.y = entry.heading;
      parts.legR.rotation.x = 0; parts.legL.rotation.x = 0.25;
      alignDraggedFoot(cave, hand);
      if (!preview) { captureBounds(cave, rec.bounds); rec.posed = true; rec.blocked = ""; }
      return true;
    }
    const headReach = cave.traits.height * 0.9, sx = Math.sin(entry.heading), sz = Math.cos(entry.heading);
    const floor = playerSupportAt(hand[0] - sx * headReach, hand[2] - sz * headReach, hand[1], hand[1], cave, false, true, BL.clankers.rageCarrying(entry));
    cave.root.rotation.x = -Math.acos(clamp((floor + 0.12 - hand[1]) / headReach, -0.7, 0.3));
    cave.root.rotation.y = entry.heading; cave.root.rotation.z = 0;
    p.x = hand[0]; p.y = hand[1]; p.z = hand[2];
    // Keep the free foot level with the held ankle at a low ground grip.
    parts.legL.rotation.x = parts.legR.rotation.x = -0.1;
    if (cave.weapon.carry !== "hands") {
      parts.armR.quaternion = parts.armL.quaternion = null;
      parts.armR.rotation.x = -1.1; parts.armL.rotation.x = -1.35;
    }
    parts.head.rotation.x = 0.2;
    alignDraggedFoot(cave, hand);
    if (rec.autonomous) {
      // The rider pose estimates head clearance, but a ground capture starts
      // at a lower hand and the head's thickness matters. Fit the real limbs
      // to the floor without moving the held ankle or enlarging any reach.
      if (floor !== ABYSS_FLOOR && !draggedFloorClear(cave, rec, floor)) {
        let low = cave.root.rotation.x, high = 0;
        cave.root.rotation.x = high; alignDraggedFoot(cave, hand);
        if (draggedFloorClear(cave, rec, floor)) {
          for (let i = 0; i < 6; i++) {
            const angle = (low + high) * 0.5;
            cave.root.rotation.x = angle; alignDraggedFoot(cave, hand);
            if (draggedFloorClear(cave, rec, floor)) high = angle; else low = angle;
          }
        }
        cave.root.rotation.x = high; alignDraggedFoot(cave, hand);
      }
      let clear = acceptCapturedPose(entry, cave, rec, hand[1], preview, endpointOnly);
      // Beside a crate the head's floor alone cannot describe the whole body.
      // Keep the ankle attached and raise the body only through checked poses
      // until its limbs clear the prop; lower it again as the route opens up.
      if (!clear) {
        const angle = cave.root.rotation.x;
        for (let i = 1; i <= 6 && !clear; i++) {
          cave.root.rotation.x = angle * (1 - i / 6); alignDraggedFoot(cave, hand);
          clear = acceptCapturedPose(entry, cave, rec, hand[1], preview, endpointOnly);
        }
      }
      if (!clear) {
        if (preview) return false;
        p.x = oldX; p.y = oldY; p.z = oldZ;
        finishClankerRider(entry, false);
        return false;
      }
      if (preview) return true;
      const dx = p.x - entry.root.position.x, dz = p.z - entry.root.position.z;
      rec.side = dx * sz - dz * sx; rec.behind = dx * sx + dz * sz;
    } else { captureBounds(cave, rec.bounds); rec.posed = true; }
    return true;
  };
  // The final animated palm must admit its captive before the gorilla moves.
  // Share bounded scratch with all captures; previews run sequentially.
  const capturePreviewTransforms = new Float64Array((BODY_PARTS_SOLID.length + 1) * 7);
  const capturePreviewQuaternions = new Array(BODY_PARTS_SOLID.length + 1).fill(null);
  const capturedPosePreview = (entry, initial = false, endpointOnly = false) => {
    const rec = entry.capture, cave = rec?.cave;
    if (!cave || !rec.autonomous) return true;
    const hop = cave.hop, hopV = cave.hopV;
    for (let i = 0; i <= BODY_PARTS_SOLID.length; i++) {
      const node = i ? cave.parts[BODY_PARTS_SOLID[i - 1]] : cave.root, n = i * 7;
      capturePreviewTransforms[n] = node.position.x; capturePreviewTransforms[n + 1] = node.position.y; capturePreviewTransforms[n + 2] = node.position.z;
      capturePreviewTransforms[n + 3] = node.rotation.x; capturePreviewTransforms[n + 4] = node.rotation.y; capturePreviewTransforms[n + 5] = node.rotation.z;
      capturePreviewTransforms[n + 6] = node.poseYaw;
      capturePreviewQuaternions[i] = node.quaternion;
      if (initial && i) node.poseYaw = 0;
    }
    if (initial) {
      // Match prepareDragged's body transforms without interrupting an
      // unaccepted target's movement, reload or held weapon action.
      const parts = cave.parts, w = cave.weapon, head = parts.head;
      if (head.quaternion === cave.headLookRotation) {
        head.quaternion = null;
        setVec(head.position, cave.headLookPosition.x, cave.headLookPosition.y, cave.headLookPosition.z);
      }
      parts.armL.quaternion = null;
      parts.legR.rotation.x = parts.legL.rotation.x = 0;
      parts.legR.rotation.z = parts.legL.rotation.z = 0;
      parts.armR.rotation.x = parts.armL.rotation.x = -0.2;
      parts.torso.rotation.x = parts.torso.rotation.z = 0;
      parts.armR.position.x -= w.meleeOffsetX; parts.armR.position.y -= w.meleeOffsetY;
      parts.armR.position.z -= w.bashOffset + w.meleeOffsetZ; parts.armL.position.z -= w.bashOffset;
      cave.hop = cave.hopV = 0;
    }
    const clear = grabbedOogaPose(cave, true, endpointOnly);
    for (let i = 0; i <= BODY_PARTS_SOLID.length; i++) {
      const node = i ? cave.parts[BODY_PARTS_SOLID[i - 1]] : cave.root, n = i * 7;
      node.position.x = capturePreviewTransforms[n]; node.position.y = capturePreviewTransforms[n + 1]; node.position.z = capturePreviewTransforms[n + 2];
      node.rotation.x = capturePreviewTransforms[n + 3]; node.rotation.y = capturePreviewTransforms[n + 4]; node.rotation.z = capturePreviewTransforms[n + 5];
      node.poseYaw = capturePreviewTransforms[n + 6];
      node.quaternion = capturePreviewQuaternions[i]; capturePreviewQuaternions[i] = null;
    }
    cave.hop = hop; cave.hopV = hopV;
    BL.scene.updateWorld(cave.root, cave.root.parent.world);
    return clear;
  };
  const captureValid = (rec) => {
    const entry = rec.entry, cave = rec.cave;
    return cave && cave.grabbedBy === entry && entry.active && cave.root.visible && !cave.health.stunned
      && (rec.autonomous ? BL.clankerRage.signedOut() && entry.rage?.active && !entry.controlled && !cave.camp.burning
        && !cave.puppet && !cave.remoteControlled && rec.player === (cave === pilot.player)
        && (cave.state === "working" || cave.state === "chilling") : clankerPlay.player === entry);
  };
  // Tree tops are landing surfaces for the visitor, not resting floors for wandering Oogas.
  const npcTreeSupportAllowed = (node) => !node.npcTreeSupport;
  const propSupportAt = (x, z, y, rise, actor, ignoreClanker = false, passTraffic = false) => {
    const npc = actor?.contributor && actor !== pilot?.player;
    let floor = solids ? solids.supportAt(x, z, y, rise, PLAYER_RADIUS, null, null, passTraffic, npc ? npcTreeSupportAllowed : null, passTraffic) : -Infinity;
    if (!ignoreClanker) floor = Math.max(floor, characterClankerSupportAt(x, z, y, rise, actor));
    if (altar && ALTAR_HEIGHT <= y + rise + 1e-7 && Math.hypot(x, z) < altar.platformRadius + PLAYER_RADIUS - 1e-7) floor = Math.max(floor, ALTAR_HEIGHT);
    if (crew && !passTraffic) for (let i = 0; i < crew.list.length; i++) {
      const other = crew.list[i];
      if (other === actor || !other.root.visible || other.grabbedBy) continue;
      const b = actorBounds(other);
      if (b[4] > floor && b[4] <= y + rise + 1e-7 && bodyOverlaps(other, b, x, z, PLAYER_RADIUS)) floor = b[4];
    }
    return floor;
  };
  const propCeilingAt = (x, z, y, radius, actor) => {
    const passTraffic = rageThrown(actor);
    let ceiling = solids ? solids.ceilingAt(x, z, y, radius, null, passTraffic, passTraffic) : Infinity;
    if (altar && y < ALTAR_HEIGHT - 1e-7 && Math.hypot(x, z) < altar.platformRadius + radius - 1e-7) ceiling = Math.min(ceiling, 0);
    if (crew && !passTraffic) for (let i = 0; i < crew.list.length; i++) {
      const other = crew.list[i];
      if (other === actor || !other.root.visible || other.grabbedBy || passengerOf(other, actor)) continue;
      const b = actorBounds(other);
      if (b[1] > y + 1e-7 && y < b[4] - 1e-7 && bodyOverlaps(other, b, x, z, radius)) ceiling = Math.min(ceiling, b[1]);
    }
    return ceiling;
  };
  const clankerBodySegmentClear = (other, x, y, z, toX, toY, toZ, radius, height) => {
    const shape = BL.agent.footprint, p = other.root.position;
    if (Math.min(y, toY) > p.y + other.height || Math.max(y, toY) + height < p.y) return true;
    const count = shape.count(other), size = shape.radius(other), first = shape.offset(other, 0);
    const last = count > 1 ? shape.offset(other, count - 1) : first;
    // The ordered capsule centres all lie between the first and last offsets.
    // Reject a distant sweep before evaluating each capsule, retaining the exact
    // overlap/escape tests whenever the enclosing boxes can touch.
    const reach = radius + size + Math.max(Math.abs(first), Math.abs(last)) + 1e-7;
    if (Math.min(x, toX) > p.x + reach || Math.max(x, toX) < p.x - reach
      || Math.min(z, toZ) > p.z + reach || Math.max(z, toZ) < p.z - reach) return true;
    const sine = Math.sin(other.heading), cosine = Math.cos(other.heading);
    for (let part = 0; part < count; part++) {
      const offset = part === 0 ? first : part === count - 1 ? last : shape.offset(other, part);
      if (!cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height,
        p.x + sine * offset, p.z + cosine * offset, p.y, p.y + other.height, size)) return false;
    }
    return true;
  };
  const propSegmentClear = (x, y, z, toX, toY, toZ, radius, height, actor, carrying = false, escaping = false, toRadius = radius, toHeight = height,
    passTraffic = rageThrown(actor), passRageProps = passTraffic) => {
    if (solids && !(escaping ? solids.segmentClear(x, y, z, toX, toY, toZ, radius, height, null, radius, height, false, false, true, passRageProps)
      : solids.segmentClear(x, y, z, toX, toY, toZ, radius, height, null, toRadius, toHeight, passTraffic, false, false, passRageProps))) return false;
    radius = Math.max(radius, toRadius); height = Math.max(height, toHeight);
    if (altar && !cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height, 0, 0, 0, ALTAR_HEIGHT, altar.platformRadius)) return false;
    if (crew && !passTraffic) for (let otherIndex = 0; otherIndex < crew.list.length; otherIndex++) {
      const other = crew.list[otherIndex];
      if (other === actor || !other.root.visible || other.grabbedBy || passengerOf(other, actor) || carrying && passengerOf(actor, other)) continue;
      const b = actorBounds(other), p = other.root.position;
      if (other.root.quaternion) {
        if (!terrain.segmentBoxClear(x, y, z, toX - x, toY - y, toZ - z, radius, height, b[0], b[1], b[2], b[3], b[4], b[5])) return false;
      } else if (!cylinderSegmentClear(x, y, z, toX, toY, toZ, radius, height, p.x, p.z, b[1], b[4], BODY_RADIUS)) return false;
    }
    return true;
  };
  const bedSupportAt = (x, z, y, maxStep, radius) => {
    let floor = -Infinity;
    if (!headquarters) return floor;
    for (const bed of headquarters.mattresses) {
      if (y + maxStep < bed.y || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        const top = bed.y + boxes[i + 4];
        if (top <= floor || top > y + maxStep + 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) floor = top;
      }
    }
    return floor;
  };
  const bedCeilingAt = (x, z, y, radius) => {
    let ceiling = Infinity;
    if (!headquarters) return ceiling;
    for (const bed of headquarters.mattresses) {
      if (y >= bed.y + bed.sleep.pillowTop - 1e-7 || !bed.node.visible || bed.node.parent !== root) continue;
      const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      for (let i = 0; i < boxes.length; i += 6) {
        if (y >= bed.y + boxes[i + 4] - 1e-7) continue;
        const ox = Math.max(boxes[i] - lx, 0, lx - boxes[i + 3]), oz = Math.max(boxes[i + 2] - lz, 0, lz - boxes[i + 5]);
        if (radius ? ox * ox + oz * oz < radius * radius - 1e-9 : ox === 0 && oz === 0) ceiling = Math.min(ceiling, bed.y + boxes[i + 1]);
      }
    }
    return ceiling;
  };
  const BED_SWEEP = new Float64Array(14);
  const bedSegmentClear = (x, y, z, toX, toY, toZ, radius, height, all = false) => {
    if (!headquarters) return true;
    const dx = toX - x, dy = toY - y, dz = toZ - z;
    for (const bed of headquarters.mattresses) {
      if (Math.min(y, toY) >= bed.y + bed.sleep.pillowTop - 1e-7 || Math.max(y, toY) + height <= bed.y
        || !all && (!bed.node.visible || bed.node.parent !== root)) continue;
      const lx = (x - bed.x) * bed.cr - (z - bed.z) * bed.sr, lz = (x - bed.x) * bed.sr + (z - bed.z) * bed.cr;
      const vx = dx * bed.cr - dz * bed.sr, vz = dx * bed.sr + dz * bed.cr, boxes = bed.collisionBoxes;
      const q = BED_SWEEP;
      q[0] = lx; q[1] = y - bed.y; q[2] = lz; q[3] = vx; q[4] = dy; q[5] = vz; q[6] = radius; q[7] = height;
      for (let i = 0; i < boxes.length; i += 6) {
        for (let j = 0; j < 6; j++) q[j + 8] = boxes[i + j];
        if (!terrain.segmentBoxQueryClear(q)) return false;
      }
    }
    return true;
  };
  // Stone frames are rendered boxes, separate from the carved terrain.
  // Rotate the cylinder into each fixed arch's axes; its footprint stays round.
  const entranceCeilingAt = (x, z, y, radius) => {
    let ceiling = Infinity;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      const dx = x - node.position.x, dz = z - node.position.z, reach = entry.radius + radius;
      if (y >= entry.maxY - 1e-7 || dx * dx + dz * dz > reach * reach) continue;
      const lx = dx * entry.cr - dz * entry.sr, lz = dx * entry.sr + dz * entry.cr, scale = node.scale.x, boxes = node.geometry.collisionBoxes;
      for (let j = 0; j < boxes.length; j += 6) {
        if (y >= node.position.y + boxes[j + 4] - 1e-7) continue;
        const ox = Math.max(boxes[j] * scale - lx, 0, lx - boxes[j + 3] * scale), oz = Math.max(boxes[j + 2] - lz, 0, lz - boxes[j + 5]);
        if (ox * ox + oz * oz < radius * radius - 1e-9) ceiling = Math.min(ceiling, node.position.y + boxes[j + 1]);
      }
    }
    return ceiling;
  };
  const ROOM_SIGN_LIMIT = 1.35, ROOM_SIGN_HEAD_RADIUS = 0.22;
  const swingRoomSign = (sign, direction, velocity, additive = false) => {
    const impulse = direction * velocity;
    sign.velocity = additive ? clamp(sign.velocity + impulse, -7, 7) : impulse;
    sign.hits++;
  };
  // Sweep the head through the board's rotated coordinates.
  // These light hanging props yield to the body; the stone frame still owns collision.
  const roomSignHeadClear = (sign, x, y, z, dx, dy, dz) => {
    const a = sign.node.rotation.x, c = Math.cos(a), s = Math.sin(a), b = sign.node.geometry.roomLifehashSign.board, r = ROOM_SIGN_HEAD_RADIUS;
    return terrain.segmentBoxClear(x, y * c + z * s - r, z * c - y * s, dx, dy * c + dz * s, dz * c - dy * s, r, r * 2, b[0], b[1], b[2], b[3], b[4], b[5]);
  };
  const moveRoomSigns = (cave, x, y, z, dt) => {
    const p = cave.root.position, dx = p.x - x, dy = p.y - y, dz = p.z - z, bit = 1 << cave.index;
    const continuous = Math.hypot(dx, dz) <= (JET_SPEED + pilotMod.WALK.speed) * dt + 1e-5 && Math.abs(dy) <= Math.abs(cave.hopV) * dt + STEP_MAX + 1e-5;
    for (const sign of headquarters.roomSigns) {
      const ox = x - sign.node.position.x, oz = z - sign.node.position.z;
      const lx = ox * sign.cr - oz * sign.sr, lz = ox * sign.sr + oz * sign.cr;
      const ly = y - cave.baseY + cave.bodyHeight + cave.viewLift - ROOM_SIGN_HEAD_RADIUS - sign.node.position.y;
      const vx = dx * sign.cr - dz * sign.sr, vz = dx * sign.sr + dz * sign.cr;
      if (!sign.node.visible || !continuous || Math.abs(lx + vx) > sign.node.geometry.roomLifehashSign.width / 2 + ROOM_SIGN_HEAD_RADIUS
        || Math.abs(lz + vz) > 1.1 || ly + dy < -1.1 || ly + dy > 0.3) { sign.contacts &= ~bit; continue; }
      if (roomSignHeadClear(sign, lx, ly, lz, vx, dy, vz)) continue;
      const direction = sign.contacts & bit ? Math.sign(sign.node.rotation.x || sign.velocity) : Math.abs(vz) > 1e-6 ? -Math.sign(vz) : lz >= 0.07 ? 1 : -1;
      if (!(sign.contacts & bit)) {
        swingRoomSign(sign, direction, Math.min(7, 2 + Math.hypot(dx, dy, dz) / dt * 0.65));
        sign.contacts |= bit;
      }
      // Resolve overlap by moving the board, preserving the jump's velocity.
      // The bounded angular steps let the head push it farther as it passes.
      for (let n = 0; n < 68 && !roomSignHeadClear(sign, lx + vx, ly + dy, lz + vz, 0, 0, 0); n++) {
        const angle = clamp(sign.node.rotation.x + direction * 0.04, -ROOM_SIGN_LIMIT, ROOM_SIGN_LIMIT);
        if (angle === sign.node.rotation.x) break;
        sign.node.rotation.x = angle;
      }
    }
  };
  const updateRoomSigns = (dt) => {
    for (const sign of headquarters.roomSigns) {
      if (!sign.velocity && !sign.node.rotation.x) continue;
      let remaining = Math.min(dt, 0.1);
      while (remaining > 1e-7) {
        const step = Math.min(remaining, 1 / 120);
        sign.velocity += (-18 * sign.node.rotation.x - 4 * sign.velocity) * step;
        sign.node.rotation.x += sign.velocity * step;
        if (Math.abs(sign.node.rotation.x) > ROOM_SIGN_LIMIT) { sign.node.rotation.x = clamp(sign.node.rotation.x, -ROOM_SIGN_LIMIT, ROOM_SIGN_LIMIT); sign.velocity *= -0.2; }
        remaining -= step;
      }
      if (Math.abs(sign.velocity) < 0.001 && Math.abs(sign.node.rotation.x) < 0.001) sign.velocity = sign.node.rotation.x = 0;
    }
  };
  const hitRoomSign = (_source, hit, dx, dy, dz) => {
    const sign = hit.owner && hit.owner.roomSign;
    if (!sign || !sign.node.visible) return;
    const localZ = dx * sign.sr + dz * sign.cr;
    const ox = hit.x - sign.node.position.x, oz = hit.z - sign.node.position.z;
    const hitZ = ox * sign.sr + oz * sign.cr;
    const direction = Math.abs(localZ) > 1e-6 ? -Math.sign(localZ) : hitZ >= 0 ? 1 : -1;
    swingRoomSign(sign, direction, 3.5, true);
  };
  const legacyCopy = (value) => {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed"; field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) { }
    field.remove();
    return copied;
  };
  const tapRoomSign = (sign) => {
    if (!sign || !sign.node.visible) return;
    const meta = sign.node.geometry.roomLifehashSign;
    const dx = camera.position.x - sign.node.position.x, dz = camera.position.z - sign.node.position.z;
    const localZ = dx * sign.sr + dz * sign.cr;
    const direction = Math.abs(localZ) > 1e-6 ? -Math.sign(localZ) : sign.hits & 1 ? -1 : 1;
    swingRoomSign(sign, direction, 3.5, true);
    const copied = () => { if (hud) hud.toast(`Room hash ${meta.lines[0]} copied to clipboard`); };
    const fallback = () => legacyCopy(meta.lines[0]) ? copied() : hud && hud.toast("Could not copy the room hash");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(meta.lines[0]).then(copied, fallback);
    else fallback();
  };
  const moveCampBody = (cave, x, y, z, dt) => {
    moveRoomSigns(cave, x, y, z, dt);
    if (cave.camp.burning || cave.camp.rolling || cave.camp.cooldown > 0) return;
    const p = cave.root.position, dx = p.x - x, dz = p.z - z, distance = dx * dx + dz * dz;
    for (const hazard of fireHazards) {
      if (!hazard.node.visible) continue;
      const t = distance ? clamp(((hazard.x - x) * dx + (hazard.z - z) * dz) / distance, 0, 1) : 0;
      const feet = y + (p.y - y) * t - cave.baseY;
      if (feet < hazard.y + FIRE_TOP && feet + cave.bodyHeight > hazard.y + FIRE_BOTTOM
        && (x + dx * t - hazard.x) ** 2 + (z + dz * t - hazard.z) ** 2 < FIRE_CONTACT_RADIUS ** 2) { crew.ignite(cave); break; }
    }
  };
  // Flames are traversable by the visitor, but voluntary NPC steps keep a
  // margin around the entire pit: ash, logs and stone enclosure included.
  // The pit stays excluded when its flame is off, while the vertical sweep
  // still lets another storey or a safely high jump pass over it.
  const npcFireClear = (x, y, z, toX, toY, toZ, height) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z, length = dx * dx + dz * dz;
    for (const hazard of fireHazards) {
      if (!hazard.pit.visible) continue;
      const low = hazard.y + FIRE_BOTTOM - height, high = hazard.y + FIRE_TOP;
      let enter = 0, exit = 1;
      if (dy) {
        const a = (low - y) / dy, b = (high - y) / dy;
        enter = Math.max(0, Math.min(a, b)); exit = Math.min(1, Math.max(a, b));
        if (enter >= exit) continue;
      } else if (y <= low || y >= high) continue;
      const ox = x - hazard.x, oz = z - hazard.z, before = ox * ox + oz * oz;
      // A fire can light beneath a walker: let them move outward, never deeper in.
      // A stationary point inside is still an unsafe goal.
      if (y > low && y < high && before < hazard.avoidRadius ** 2 && length > 0
        && ox * dx + oz * dz >= 0 && (ox + dx) ** 2 + (oz + dz) ** 2 > before) continue;
      const t = length ? clamp(-(ox * dx + oz * dz) / length, enter, exit) : enter;
      if ((ox + dx * t) ** 2 + (oz + dz * t) ** 2 < hazard.avoidRadius ** 2) return false;
    }
    return true;
  };
  const physicalClearAt = (x, y, z, radius, height, actor = pilot?.player) => island.clearAt(x, y, z, radius, height) && y + height <= Math.min(entranceCeilingAt(x, z, y, radius), bedCeilingAt(x, z, y, radius), propCeilingAt(x, z, y, radius, actor)) + 1e-7
    && (!solids || solids.segmentClear(x, y, z, x, y, z, radius, height, null, radius, height, rageThrown(actor), false, false, rageThrown(actor)));
  const JETPACK_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const jetpackAllowed = (cave) => {
    if (ghosts && ghosts.sealed) return false; // HALLOWEEN
    const p = cave.root.position, feet = p.y - cave.baseY;
    const basement = island.headquarters.basement, hole = basement.hole;
    // Keep thrust through the open shaft and its bevel until the whole body clears the lip.
    // The basement ceiling still separates it from HQ above.
    if (feet < basement.ceiling && Math.hypot(p.x - hole.x, p.z - hole.z) <= hole.mouthRadius + PLAYER_RADIUS) return true;
    return !island.cavityAt(p.x, p.z, JETPACK_COLUMN, island.headquarters.caveIndex, feet) || feet < JETPACK_COLUMN.floor - 1e-6 || feet >= JETPACK_COLUMN.ceiling;
  };
  // Interaction reach follows clear air, including stacked rooms.
  // Sweep solid walls and frames exactly; substeps also check the rendered ramp slopes.
  const actionReachable = (x, y, z, toX, toY, toZ, margin = 0.025) => {
    if (crossesSealedCave(x, z, toX, toZ, y) || !island.voxelSegmentClearAt(x, y - margin, z, toX, toY - margin, toZ, margin, margin * 2) || !entranceSegmentClear(x, y, z, toX, toY, toZ, margin)) return false;
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - x, toY - y, toZ - z) / 0.12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!island.clearAt(lerp(x, toX, t), lerp(y, toY, t) - margin, lerp(z, toZ, t), margin, margin * 2)) return false;
    }
    return true;
  };
  const actionWithinReach = (x, y, z, toX, toY, toZ, reach) => Math.hypot(toX - x, toY - y, toZ - z) < reach && actionReachable(x, y, z, toX, toY, toZ);
  const MIRROR_ACTOR_RADII = new WeakMap();
  const mirrorPartReach = (geometry, m, x, y, z) => {
    const b = BL.scene.boundsOf(geometry);
    let reach = 0;
    for (let corner = 0; corner < 8; corner++) {
      const px = corner & 1 ? b.max[0] : b.min[0], py = corner & 2 ? b.max[1] : b.min[1], pz = corner & 4 ? b.max[2] : b.min[2];
      reach = Math.max(reach, Math.hypot(m[0] * px + m[4] * py + m[8] * pz + m[12] - x,
        m[1] * px + m[5] * py + m[9] * pz + m[13] - y,
        m[2] * px + m[6] * py + m[10] * pz + m[14] - z));
    }
    return reach;
  };
  const mirrorHeadReach = (node, x, y, z) => {
    if (!node.visible) return 0;
    let reach = node.geometry ? mirrorPartReach(node.geometry, node.world, x, y, z) : 0;
    for (let i = 0; i < node.children.length; i++) reach = Math.max(reach, mirrorHeadReach(node.children[i], x, y, z));
    return reach;
  };
  const mirrorActorRadius = (actor) => {
    let radius = MIRROR_ACTOR_RADII.get(actor);
    if (radius !== undefined) return radius;
    BL.scene.updateWorld(actor.root, actor.root.parent?.world);
    // Away actors still need current accessory transforms when gear changes.
    BL.scene.updateWorld(actor.parts.head, actor.root.world);
    const head = actor.parts.head, m = head.world;
    const reach = Math.max(mirrorHeadReach(head, m[12], m[13], m[14]), mirrorPartReach(actor.headClosed, m, m[12], m[13], m[14]));
    // A sphere about the head pivot contains every yaw/pitch, including hats
    // and masks. Held weapons stay outside this physical clearance envelope.
    // The close view uses a 0.1 m near plane; reserve its oblique corners too.
    radius = Math.max(PLAYER_RADIUS, actor.bodyRadius, Math.hypot(actor.sleepParts.headX, actor.sleepParts.headZ) + reach, CLOSE_VIEW.eyeForward + 0.2) + 0.015;
    MIRROR_ACTOR_RADII.set(actor, radius);
    return radius;
  };
  const mirrorActorSegmentClear = (x, y, z, toX, toY, toZ, height, actor, fixedRadius = 0) => {
    if (!fixedRadius && !actor) return true;
    const m = mirrorCave.mouth, sr = matrixCave.sr, cr = matrixCave.cr;
    const bounds = BL.scene.boundsOf(mirrorCave.node.geometry), radius = fixedRadius || mirrorActorRadius(actor);
    const bottom = mirrorCave.node.position.y + bounds.min[1], top = mirrorCave.node.position.y + bounds.max[1];
    if (Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) return true;
    const lx = (x - m.x) * cr - (z - m.z) * sr, lz = (x - m.x) * sr + (z - m.z) * cr;
    const dx = (toX - x) * cr - (toZ - z) * sr, dz = (toX - x) * sr + (toZ - z) * cr;
    if (Math.min(lz, lz + dz) > PORTAL_Z + radius || Math.max(lz, lz + dz) < PORTAL_Z - radius) return true;
    // The intact glass keeps the complete actor outside, including headwear.
    return terrain.segmentBoxClear(lx, y - m.floorY, lz, dx, toY - y, dz, radius, height,
      bounds.min[0], bottom, PORTAL_Z, bounds.max[0], top, PORTAL_Z);
  };
  // The mirror gate is one barrier including the gaps between its bars; sweep the full cylinder.
  // Keep separate from camera/terrain clearance: free eyes still pass it.
  const matrixGateSegmentClear = (x, y, z, toX, toY, toZ, radius, height, clankerPass = false, closed = false) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], m = gate.mouth;
      if (clankerPass && m === mirrorCave.mouth) continue;
      const bottom = closed ? gate.floor : Math.max(gate.floor, gate.node.position.y + gate.bottom);
      const top = closed ? gate.ceiling : Math.min(gate.ceiling, gate.node.position.y + gate.top);
      if (bottom >= top || Math.min(y, toY) >= m.floorY + top || Math.max(y, toY) + height <= m.floorY + bottom) continue;
      const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
      if (!terrain.segmentBoxClear(lx, y - m.floorY, lz, dx * gate.cr - dz * gate.sr, dy, dx * gate.sr + dz * gate.cr, radius, height, gate.minX, bottom, gate.minZ, gate.maxX, top, gate.maxZ)) return false;
    }
    return true;
  };
  const matrixGateCeilingAt = (x, z, y) => {
    let ceiling = Infinity;
    for (let i = 0; i < matrixGates.length; i++) {
      const gate = matrixGates[i], m = gate.mouth;
      const bottom = Math.max(gate.floor, gate.node.position.y + gate.bottom), top = Math.min(gate.ceiling, gate.node.position.y + gate.top);
      if (bottom >= top || y >= m.floorY + top - 1e-7) continue;
      const lx = (x - m.x) * gate.cr - (z - m.z) * gate.sr, lz = (x - m.x) * gate.sr + (z - m.z) * gate.cr;
      const ox = Math.max(gate.minX - lx, 0, lx - gate.maxX), oz = Math.max(gate.minZ - lz, 0, lz - gate.maxZ);
      if (ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9) ceiling = Math.min(ceiling, m.floorY + bottom);
    }
    return ceiling;
  };
  const ceilingAt = (x, z, y, actor = pilot?.player, passengers = true, props = true) => {
    let ceiling = Math.min(island.ceilingAt(x, y, z, PLAYER_RADIUS), entranceCeilingAt(x, z, y, PLAYER_RADIUS), bedCeilingAt(x, z, y, PLAYER_RADIUS), matrixGateCeilingAt(x, z, y), props ? propCeilingAt(x, z, y, PLAYER_RADIUS, actor) : Infinity);
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], m = entry.mouth, rim = entry.rim;
      const dx = x - m.x, dz = z - m.z, along = dx * entry.sr + dz * entry.cr, across = dx * entry.cr - dz * entry.sr;
      if (y < m.floorY - STEP_MAX || y > m.floorY + rim.ceilingY || along < rim.minZ + PORTAL_Z - PLAYER_RADIUS || along > rim.maxZ + PORTAL_Z + PLAYER_RADIUS || across < rim.minX - PLAYER_RADIUS || across > rim.maxX + PLAYER_RADIUS) continue;
      ceiling = Math.min(ceiling, m.floorY + rim.ceilingY);
    }
    if (passengers && actor && !rageThrown(actor) && crew && (actor.hopV > 0 || y > actor.riding.y - actor.baseY + 1e-7)) for (let riderIndex = 0; riderIndex < crew.list.length; riderIndex++) {
      const rider = crew.list[riderIndex];
      if (rider === actor || !passengerOf(rider, actor)) continue;
      const from = actor.riding, riding = rider.riding;
      const offset = riding.y - rider.baseY - from.y + actor.baseY;
      const roof = ceilingAt(x + riding.x - from.x, z + riding.z - from.z, y + offset, rider, false, props);
      // Convert each passenger's headroom into a limit for the lower body.
      // Upward motion cannot push it through a roof; level travel may leave a passenger at a wall.
      ceiling = Math.min(ceiling, roof - offset - rider.bodyHeight - Math.max(0, rider.viewLift) + actor.bodyHeight + Math.max(0, actor.viewLift));
    }
    return ceiling;
  };
  const birdsEyeCeiling = (cave, gorilla = false) => {
    const p = cave.root.position, feet = p.y - (gorilla ? 0 : cave.baseY);
    const height = gorilla ? cave.gorilla.bodyHeight : cave.bodyHeight, lift = gorilla ? 0 : Math.max(0, cave.viewLift);
    // Clip architectural roofs, not the floor the actor is standing on. Outdoors
    // the taller cut also preserves nearby gorillas and carried equipment.
    const roof = Math.min(island.ceilingAt(p.x, feet + 0.02, p.z, PLAYER_RADIUS), entranceCeilingAt(p.x, p.z, feet + 0.02, PLAYER_RADIUS),
      mempoolIsland.overAt(p.x, p.z, -1) ? solids.ceilingAt(p.x, p.z, feet + 0.02, PLAYER_RADIUS) : Infinity);
    return Math.max(feet + height + lift + 0.08,
      Math.min(feet + Math.max(4, height + 0.35), roof - 0.06));
  };
  const cutawayBlend = (progress, from, to) => {
    const t = clamp((progress - from) / (to - from), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const cutawayLinear = (progress, from, to) => clamp((progress - from) / (to - from), 0, 1);
  const updateCutawayTravelRamp = () => {
    let bestRamp = null, bestChannel = -1, bestDistance = Infinity, bestStation = 0;
    const ramps = island.cutawayPaths.ramps;
    for (let channel = 0; channel < ramps.length; channel++) {
      const ramp = ramps[channel], samples = ramp.samples;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dz = b.z - a.z;
        const length2 = dx * dx + dz * dz, t = clamp(((cutawayX - a.x) * dx + (cutawayZ - a.z) * dz) / (length2 || 1), 0, 1);
        const x = a.x + dx * t, y = a.y + (b.y - a.y) * t, z = a.z + dz * t;
        const ox = cutawayX - x, oz = cutawayZ - z, distance = ox * ox + oz * oz;
        const reach = ramp.width / 2 + PLAYER_RADIUS + 0.18;
        if (distance <= reach * reach && Math.abs(cutawayFeet - y) <= STEP_MAX + 0.4 && distance < bestDistance) {
          bestRamp = ramp; bestChannel = channel; bestDistance = distance;
          bestStation = a.s + (b.s - a.s) * t;
        }
      }
    }
    cutawayTravelRamp = bestRamp;
    cutawayTravelChannel = bestChannel;
    cutawayTravelStation = bestStation;
    return bestChannel >= 0;
  };
  const resetCutawayPaths = () => {
    let changed = CUTAWAY_PATH_STATE.active !== 0;
    CUTAWAY_PATH_STATE.active = 0;
    for (let channel = 0; channel < 4; channel++) {
      if (CUTAWAY_PATH_STATE.mix[channel] > 0) changed = true;
      CUTAWAY_PATH_STATE.mix[channel] = 0;
    }
    CUTAWAY_PATH_STATE.windowMix.fill(0);
    if (changed) CUTAWAY_PATH_STATE.version++;
    terrainRampRoof?.update(CUTAWAY_PATH_STATE);
  };
  const updateCutawayPaths = (sliceY, slicing, rockMix) => {
    const paths = island.cutawayPaths;
    updateCutawayTravelRamp();
    // The initial basement entrances open as the scan reaches HQ; travel and
    // floor progress extend those openings farther down the routes.
    const lowerLevelMix = Number.isFinite(cutawayProgress) ? cutawayLinear(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END) : 0;
    const lowerCoverDepth = (island.headquarters.ceiling - 0.06) - sliceY;
    const lowerCoverMix = slicing ? cutawayLinear(lowerCoverDepth, paths.unit, paths.unit * 2) : 0;
    const lowerEntranceMix = slicing ? cutawayLinear(lowerCoverDepth, -paths.unit, 0) : 0;
    const terrainMix = 1 - cutawayBlend(cutawayHillMix, 0, 1);
    let changed = CUTAWAY_PATH_STATE.active !== 1;
    CUTAWAY_PATH_STATE.active = 1;
    CUTAWAY_PATH_STATE.windowMix[0] = rockMix * terrainMix * cutawayBlend(cutawayProgress, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
    CUTAWAY_PATH_STATE.windowMix[1] = rockMix * terrainMix * cutawayBlend(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
    for (let channel = 0; channel < 4; channel++) {
      let lo = 1;
      if (slicing) for (let station = 1; station <= 255; station++) {
        const bottom = paths.bottomByStation[channel * 256 + station];
        if (Number.isFinite(bottom) && bottom >= sliceY - 0.01) lo = station + 1;
      }
      const initial = paths.initial[channel];
      // Once a floor transition has consumed part of a ramp, leaving its
      // narrow travel corridor must not put that roof back. Height progress is
      // the stable baseline; proximity may only reveal farther ahead.
      const levelProgress = clamp(cutawayProgress - (channel >= 2 ? 1 : 0), 0, 1);
      let hi = Math.max(initial, 1 + Math.round(levelProgress * 254));
      // Before the global scan reaches below HQ, only the travelled lower
      // route may extend. Height progress must not open the other route early.
      if (channel >= 2 && lowerCoverDepth <= paths.unit) hi = initial;
      if (channel === cutawayTravelChannel && lo <= 255) {
        const station = 1 + Math.round(clamp(cutawayTravelStation / paths.lengths[channel], 0, 1) * 254);
        // The globally scanned prefix remains visibly open behind the player.
        // Match that full distance ahead, while the authored entrance length is
        // a hard minimum, so stepping onto a ramp can never make it contract.
        hi = Math.min(255, Math.max(hi, station + Math.max(0, station - 1)));
      }
      let lowerPathMix = Math.max(lowerEntranceMix, lowerLevelMix * lowerCoverMix);
      if (channel >= 2 && channel === cutawayTravelChannel && lo <= 255) {
        // The globally scanned prefix has no roof left over the actor. Fade the
        // active lower route completely before their leading edge reaches the
        // first roof cell below the settled HQ cut. The fixed boundary also
        // prevents the roof from returning midway down as the global scan
        // consumes progressively deeper cells.
        let firstCoveredStation = 1;
        while (firstCoveredStation <= 255 && paths.bottomByStation[channel * 256 + firstCoveredStation] >= island.headquarters.ceiling - 0.07) firstCoveredStation++;
        const firstCovered = (firstCoveredStation - 1) / 254 * paths.lengths[channel];
        const clearBy = Math.max(paths.unit, firstCovered - PLAYER_RADIUS - paths.unit);
        lowerPathMix = Math.max(lowerPathMix, cutawayBlend(cutawayTravelStation, 0, clearBy));
      }
      const nextMix = rockMix * terrainMix * (channel < 2 ? 1 : lowerPathMix);
      if (CUTAWAY_PATH_STATE.lo[channel] !== lo || CUTAWAY_PATH_STATE.hi[channel] !== hi
        || (CUTAWAY_PATH_STATE.mix[channel] > 0) !== (nextMix > 0)) changed = true;
      CUTAWAY_PATH_STATE.lo[channel] = lo;
      CUTAWAY_PATH_STATE.hi[channel] = hi;
      CUTAWAY_PATH_STATE.mix[channel] = nextMix;
    }
    if (changed) CUTAWAY_PATH_STATE.version++;
    terrainRampRoof.update(CUTAWAY_PATH_STATE);
  };
  const updateBirdsEyeCutaway = (dt) => {
    clearCutawayHidden();
    const gorilla = clankerPlay && clankerPlay.active, player = gorilla ? clankerPlay.player : pilot.player;
    // Projection can still blend after X or release. Only combat owns the
    // island slice; carry and detached views restore all cover immediately.
    const combat = !!player && (gorilla ? clankerPlay.combat : pilot.aiming);
    const cameraMix = combat ? gorilla ? clankerPlay.birdsEyeMix : pilot.birdsEyeMix : 0;
    const overhead = combat && (gorilla ? clankerPlay.birdsEye : pilot.birdsEye);
    // Under the Mempool island's ground counts by its own rock, not by height: its upper tunnels stand above
    // the home island's surface and its forest floor is never "under" anything. 0 elsewhere, 1 on it, 2 under it.
    const actorFeet = player ? player.root.position.y - (gorilla ? 0 : player.baseY) : 0;
    cutawayPool = !player || !mempoolIsland.overAt(player.root.position.x, player.root.position.z, -1) ? 0
      : mempoolIsland.coveredAt(player.root.position.x, actorFeet + 0.5, player.root.position.z) ? 2 : 1;
    const subterranean = player && (cutawayPool ? cutawayPool === 2 : actorFeet < -STEP_MAX);
    if (overhead) cutawayHandoffPlayer = player;
    else if (combat && subterranean && (cutawayHandoffPlayer || pilot.cameraHandoff.active || cameraMix > 0)) {
      cutawayHandoffPlayer = combatCameraReady(player, gorilla) ? null : player;
    } else cutawayHandoffPlayer = null;
    // Keep an overhead exit or actor handoff open until the displayed eye has
    // reached clear air connected to the actor. Recheck throughout the swoop:
    // a briefly clear frame can be followed by another ceiling contact.
    // After the handoff, an ordinary close view never reopens the island just
    // because a wall blocks its camera.
    const active = combat && (overhead || (subterranean ? cutawayHandoffPlayer === player : cameraMix > 0));
    const mix = active ? cameraMix : 0;
    const showRampMarkers = active && cameraMix > 0.5;
    for (const lintel of headquartersRimLintels) lintel.visible = !showRampMarkers;
    for (const marker of headquarters.rampMarkers) {
      marker.node.visible = marker.frame.visible = marker.arrow.visible = showRampMarkers;
      if (!showRampMarkers) continue;
      // Turn the whole inscription in its fitted floor plane. Its baseline
      // stays horizontal on screen, with +x reading right and -z reading up;
      // the separate arrow remains fixed to the downhill route.
      const up = camera.up, across = marker.across, downhill = marker.downhill;
      const x = up.x * across.x + up.y * across.y + up.z * across.z;
      const z = up.x * downhill.x + up.y * downhill.y + up.z * downhill.z;
      marker.node.rotation.y = Math.atan2(-x, -z);
    }
    // Floor/ramp progress continues to follow the character during the dolly.
    const rockMix = active && subterranean ? 1 : mix;
    RENDER_OPTS.birdsEyeCutaway = active;
    RENDER_OPTS.cutawayFade = rockMix;
    // Keep the authored cloud lanes clear of structures even when the island is cut away below them.
    RENDER_OPTS.cutawayCloudMix = 0;
    RENDER_OPTS.cutawayRockMix = rockMix;
    RENDER_OPTS.cutawayRegionCount = 0;
    if (!active) {
      RENDER_OPTS.cutawayMaxY = 1e6; cutawayHeight = cutawayProgress = NaN;
      cutawayTravelRamp = null; cutawayTravelChannel = -1; cutawayTravelStation = 0;
      resetCutawayPaths();
      for (const entry of terrainSections) entry.cap.node.visible = false;
      for (const entry of caveSections) entry.cap.node.visible = false;
      return;
    }
    const hq = island.headquarters;
    if (player) {
      const p = player.root.position, fresh = player !== cutawayPlayer || !Number.isFinite(cutawayProgress);
      // Hop is relative to the next supporting floor, including the abyss
      // sentinel. Only world-space feet describe the level actually on screen.
      cutawayFeet = p.y - (gorilla ? 0 : player.baseY);
      cutawayX = p.x; cutawayZ = p.z;
      cutawayHeadY = cutawayFeet + (gorilla ? player.gorilla.bodyHeight : player.bodyHeight + Math.max(0, player.viewLift)) + 0.08;
      const surface = island.surfaceAt(p.x, p.z);
      const elevation = cutawayFeet - Math.max(STEP_MAX, surface - STEP_MAX);
      cutawayHill = elevation > (fresh ? 0 : cutawayHill ? -0.12 : 0.12);
      if (fresh) cutawayHillMix = cutawayHill ? 1 : 0;
      else cutawayHillMix += clamp((cutawayHill ? 1 : 0) - cutawayHillMix, -dt / 0.3, dt / 0.3);
      // Progress uses actual height between floors, not the support underneath
      // a jump or the long flat tail at the end of a ramp. A small deadband
      // retains the approach direction through stops and tiny reversals.
      const progress = cutawayFeet >= hq.floor ? clamp(cutawayFeet / hq.floor, 0, 1)
        : 1 + clamp((hq.floor - cutawayFeet) / (hq.floor - hq.basement.floor), 0, 1);
      // Settle exactly on authored floors. The motion deadband belongs only to
      // a ramp reversal; retaining its last in-band value at a landing left a
      // few terminal roof cells dependent on the actor's lateral position.
      cutawayProgress = fresh || Math.abs(progress - Math.round(progress)) < 1e-6
        ? progress : clamp(cutawayProgress, progress - CUTAWAY_FLOOR_DEADBAND, progress + CUTAWAY_FLOOR_DEADBAND);
      cutawayLevel = cutawayBlend(cutawayProgress, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END)
        + cutawayBlend(cutawayProgress - 1, CUTAWAY_RAMP_START, CUTAWAY_RAMP_END);
      cutawayPlayer = player;
    }
    const feet = cutawayFeet;
    // Scan between floor ceilings across the ramp's travel so upper levels
    // peel away progressively instead of switching in a narrow midpoint band.
    // Head clearance remains authoritative during a jump, jet flight or fall.
    if (player) {
      let target = cutawayLevel <= 1 ? lerp(CUTAWAY_TOP, hq.ceiling - 0.06, cutawayLevel)
        : lerp(hq.ceiling - 0.06, hq.basement.ceiling - 0.06, cutawayLevel - 1);
      if (feet < hq.basement.floor - STEP_MAX) target = Math.min(target, birdsEyeCeiling(player, gorilla));
      // The home island's floors mean nothing over there: cut at the roof over the walker, or not at all.
      if (cutawayPool) target = cutawayPool === 2 ? birdsEyeCeiling(player, gorilla) : CUTAWAY_TOP;
      if (!Number.isFinite(cutawayHeight)) cutawayHeight = target;
      else cutawayHeight += clamp(target - cutawayHeight, -CUTAWAY_FLOOR_RATE * dt, CUTAWAY_FLOOR_RATE * dt);
      cutawayHeight = Math.max(cutawayHeight, cutawayHeadY);
    }
    const slicing = cutawayHeight < CUTAWAY_TOP - 0.01;
    const sliceY = Math.max(cutawayHeadY, lerp(CUTAWAY_TOP, cutawayHeight, rockMix));
    RENDER_OPTS.cutawayMaxY = slicing ? sliceY : 1e6;
    updateCutawayPaths(sliceY, slicing, rockMix);
    for (const entry of terrainSections) {
      // A section with a `when` is capped only while it can be on screen: its cross-section is rebuilt at every
      // half metre the cut moves through, which is wasted on an island the view is nowhere near.
      if (slicing && (!entry.when || entry.when())) entry.cap.update(sliceY - entry.worldY, null, entry.paths ? CUTAWAY_PATH_STATE : null);
      else entry.cap.node.visible = false;
    }
    const caveRoofMix = 1 - cutawayBlend(cutawayHillMix, 0, 1);
    for (const entry of caveSections) {
      const r = entry.region;
      r.y = cutawayActorY(r, lerp(CUTAWAY_TOP, entry.targetY, rockMix));
      r.mix = caveRoofMix;
      // Hills and jet flight restore cave roofs at the same character-relative
      // height as ramp cover. Keep the aperture alive through the fade, then
      // drop it only after the roof is fully opaque again.
      const reveal = caveRoofMix > 0 && (!slicing || r.y < sliceY);
      entry.cap.node.visible = reveal;
      if (reveal) {
        RENDER_OPTS.cutawayRegions[RENDER_OPTS.cutawayRegionCount++] = r;
        entry.cap.update(r.y, r);
        for (let i = 0; i < entry.cap.node.children.length; i++) entry.cap.node.children[i].smokeOpacity = caveRoofMix;
      }
    }
    RENDER_OPTS.cutawayRegionCount = Math.min(CUTAWAY_REGION_CAP, RENDER_OPTS.cutawayRegionCount);
    updateCutawayWholeVisibility();
  };
  const crossesSealedCave = (fromX, fromZ, toX, toZ, y = 0) => {
    if (ghostSeal !== null && ghostSeal(fromX, fromZ, toX, toZ, y)) return true; // HALLOWEEN: the ghost walls
    if (crossesGameRing(fromX, fromZ, toX, toZ, y)) return true;
    for (let i = 0; i < sealedCaves.length; i++) {
      const sealed = sealedCaves[i], m = sealed.mouth, sr = sealed.sr, cr = sealed.cr;
      if (y < m.floorY - STEP_MAX || y > m.floorY + PORTAL_MAX_Y) continue;
      const a = (fromX - m.x) * sr + (fromZ - m.z) * cr - sealed.stopZ;
      const b = (toX - m.x) * sr + (toZ - m.z) * cr - sealed.stopZ;
      if (a * b > 0 || a === b) continue;
      const k = a / (a - b), x = lerp(fromX, toX, k), z = lerp(fromZ, toZ, k);
      const across = (x - m.x) * cr - (z - m.z) * sr;
      if (across >= PORTAL_MIN_X && across <= PORTAL_MAX_X) return true;
    }
    return false;
  };
  // Bananas are passable; the visitor must jump onto their stone platform.
  const playerEscapeClear = (fromX, fromZ, toX, toZ, y, height, actor, step) => {
    if (!actor || actor !== pilot.player || fromX === toX && fromZ === toZ) return false;
    // Endpoint-only head/body checks cannot free a pre-existing mesh overlap. The recovery sweep checks
    // every touched face instead, while terrain, beds, gates and mirrors retain their ordinary rules.
    return y + height <= ceilingAt(toX, toZ, y, actor, true, false) + 1e-7
      && island.clearAt(toX, y + step, toZ, PLAYER_RADIUS, Math.max(0, height - step))
      && island.voxelSegmentClearAt(fromX, y + step, fromZ, toX, y + step, toZ, PLAYER_RADIUS, Math.max(0, height - step))
      && propSegmentClear(fromX, y + step, fromZ, toX, y + step, toZ, PLAYER_RADIUS, Math.max(0, height - step), actor, false, true)
      && bedSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height)
      && matrixGateSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height)
      && mirrorActorSegmentClear(fromX, y, fromZ, toX, y, toZ, height, actor);
  };
  const walkable = (fromX, fromZ, toX, toZ, y, height = 1.5, actor = pilot?.player) => {
    if (Math.hypot(toX, toZ) > FLY_BOUND || crossesSealedCave(fromX, fromZ, toX, toZ, y)) return false;
    // Sweep the feet before ordinary step assistance lifts them. Once above
    // the rim, jumping, landing and walking off keep their normal clearance.
    if (altar && actor && actor === pilot.player && !cylinderSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height, 0, 0, 0, ALTAR_HEIGHT, altar.platformRadius)) return false;
    const floor = playerSupportAt(toX, toZ, y, y, actor, true), feet = Math.max(y, floor);
    if (floor - y > STEP_MAX && floor !== characterClankerSupportAt(toX, toZ, y, STEP_MAX, actor)) return false;
    // Feet may mount an ordinary voxel step.
    // Torso and head must fit across their whole footprint at the destination's actual elevation.
    return feet + height <= ceilingAt(toX, toZ, feet, actor) + 1e-7 && physicalClearAt(toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && propSegmentClear(fromX, feet + STEP_MAX, fromZ, toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX), actor) && matrixGateSegmentClear(fromX, y, fromZ, toX, feet, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, feet, toZ, height, actor)
      || feet === y && playerEscapeClear(fromX, fromZ, toX, toZ, y, height, actor, STEP_MAX);
  };
  const flyable = (fromX, fromZ, toX, toZ, y = 0, height = 1.5, actor = pilot?.player) => (Math.hypot(toX, toZ) <= FLY_BOUND || actor?.leap?.thrown) && !crossesSealedCave(fromX, fromZ, toX, toZ, y)
    && (y + height <= ceilingAt(toX, toZ, y, actor) + 1e-7 && physicalClearAt(toX, y, toZ, PLAYER_RADIUS, height, actor) && propSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height, actor) && bedSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && matrixGateSegmentClear(fromX, y, fromZ, toX, y, toZ, PLAYER_RADIUS, height) && mirrorActorSegmentClear(fromX, y, fromZ, toX, y, toZ, height, actor)
      || playerEscapeClear(fromX, fromZ, toX, toZ, y, height, actor, 0));
  const characterCarryClear = (cave, x, y, z, toX, toY, toZ) => {
    const height = cave.bodyHeight + Math.max(0, cave.viewLift), feet = y + 1e-7, toFeet = toY + 1e-7;
    return Math.hypot(toX, toZ) <= FLY_BOUND && !crossesSealedCave(x, z, toX, toZ, Math.min(y, toY))
      && toY + height <= ceilingAt(toX, toZ, toY, cave) + 1e-7
      && physicalClearAt(toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7, cave)
      && island.voxelSegmentClearAt(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && propSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7, cave, true)
      && bedSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && matrixGateSegmentClear(x, feet, z, toX, toFeet, toZ, PLAYER_RADIUS, height - 1e-7)
      && mirrorActorSegmentClear(x, feet, z, toX, toFeet, toZ, height - 1e-7, cave);
  };
  const carryCharacter = (cave, dx, dy, dz) => {
    if (!standingPassenger(cave) || !cave.riding.support || !uprightCharacter(cave.riding.support)) return;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-9) return;
    const p = cave.root.position, steps = Math.max(1, Math.ceil(distance / 0.125));
    dx /= steps; dy /= steps; dz /= steps;
    for (let n = 0; n < steps; n++) {
      const feet = p.y - cave.baseY;
      if (characterCarryClear(cave, p.x, feet, p.z, p.x + dx, feet + dy, p.z + dz)) {
        p.x += dx; p.y += dy; p.z += dz;
        continue;
      }
      // Preserve contact with the obstacle instead of crossing it or losing a frame of safe movement near a wall.
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const t = (lo + hi) / 2;
        if (characterCarryClear(cave, p.x, feet, p.z, p.x + dx * t, feet + dy * t, p.z + dz * t)) lo = t;
        else hi = t;
      }
      p.x += dx * lo; p.y += dy * lo; p.z += dz * lo;
      break;
    }
  };
  const inBananas = (cave, x = cave.root.position.x, z = cave.root.position.z) => bananaCover.intersectsBody(x, cave.root.position.y - (cave.gorilla ? 0 : cave.baseY), z, cave.gorilla ? cave.gorilla.bodyHeight : cave.bodyHeight);
  const npcPileAt = (x, feet, z, height) => feet <= ALTAR_HEIGHT + STEP_MAX && feet + height > 0 && Math.hypot(x, z) < altar.platformRadius + PLAYER_RADIUS
    || bananaCover.intersectsBody(x, feet, z, height);
  const workZoneTraveler = (cave) => cave && cave !== crew?.player && (cave.state !== "working" || cave.bedTravel.mode);
  const refreshWorkZones = () => {
    for (const zone of workZones) { zone.active = false; zone.half = 3.4; zone.front = 5.8; }
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i];
      if (!cave.root.visible || cave === crew.player || cave.state !== "working" || !cave.work.phase) continue;
      const zone = workZones[cave.work.site], p = cave.work.position;
      if (!zone) continue;
      zone.active = true;
      if (cave.work.phase !== "outbound" && cave.work.phase !== "station" && cave.work.phase !== "shoot") continue;
      const dx = p.x - zone.x, dz = p.z - zone.z;
      zone.half = Math.max(zone.half, Math.abs(dx * zone.cr - dz * zone.sr) + 0.8);
      zone.front = Math.max(zone.front, dx * zone.sr + dz * zone.cr + 0.8);
    }
  };
  const workZoneContains = (zone, x, y, z, height) => {
    if (!zone.active || y + height <= zone.floor || y >= zone.floor + 3.5) return false;
    const dx = x - zone.x, dz = z - zone.z, across = dx * zone.cr - dz * zone.sr, along = dx * zone.sr + dz * zone.cr;
    const ox = Math.max(Math.abs(across) - zone.half, 0), oz = Math.max(-7 - along, 0, along - zone.front);
    return ox * ox + oz * oz < PLAYER_RADIUS * PLAYER_RADIUS - 1e-9;
  };
  const workZoneSegmentClear = (zone, x, y, z, toX, toY, toZ, height) => {
    const dx = x - zone.x, dz = z - zone.z, vx = toX - x, vz = toZ - z;
    return terrain.segmentBoxClear(dx * zone.cr - dz * zone.sr, y, dx * zone.sr + dz * zone.cr,
      vx * zone.cr - vz * zone.sr, toY - y, vx * zone.sr + vz * zone.cr, PLAYER_RADIUS, height,
      -zone.half, zone.floor, -7, zone.half, zone.floor + 3.5, zone.front);
  };
  const npcClosedCaveAt = (x, z, y = null, height = 1.5) => {
    for (const zone of closedCaveZones) if (workZoneContains(zone, x, y === null ? zone.floor : y, z, height)) return true;
    return false;
  };
  // Cave-mouth frames are narrow structural ledges, not NPC destinations.
  // Recovery may otherwise jump onto the top bar and find no legal walking
  // step back down to the apron. Only reject that exposed ceiling band:
  // the continuous meadow above a deeply buried HQ ramp remains walkable.
  const NPC_RAMP_ROOF_COLUMN = { floor: 0, ceiling: 0 };
  const npcRampRoofAt = (x, y, z, radius = PLAYER_RADIUS) => {
    for (let i = 0; i < 5; i++) {
      const px = i === 1 ? x - radius : i === 2 ? x + radius : x;
      const pz = i === 3 ? z - radius : i === 4 ? z + radius : z;
      if (island.rampColumnAt(px, pz, false, NPC_RAMP_ROOF_COLUMN)
        && Math.abs(y - NPC_RAMP_ROOF_COLUMN.ceiling) <= 0.55) return true;
    }
    return false;
  };
  const npcCaveRimAt = (x, y, z) => {
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], m = entry.mouth;
      if (y <= m.floorY + STEP_MAX) continue;
      const dx = x - m.x, dz = z - m.z;
      const across = dx * entry.cr - dz * entry.sr, along = dx * entry.sr + dz * entry.cr;
      if (Math.abs(across) <= 3 + PLAYER_RADIUS && along >= -PLAYER_RADIUS && along <= 1 + PLAYER_RADIUS) return true;
    }
    return false;
  };
  const npcCaveRoofAt = (x, y, z) => {
    if (npcRampRoofAt(x, y, z)) return true;
    const surface = island.surfaceAt(x, z);
    if (y < surface - 0.15 || y > surface + STEP_MAX || surface <= STEP_MAX) return false;
    for (let i = 0; i < island.mouths.length; i++) {
      const m = island.mouths[i], sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const dx = x - m.x, dz = z - m.z;
      const across = dx * cr - dz * sr, along = dx * sr + dz * cr;
      if (Math.abs(across) <= m.room.w / 2 + PLAYER_RADIUS
        && along >= -m.room.to - 1 && along <= 1 + PLAYER_RADIUS) return true;
    }
    return false;
  };
  const npcClosedCaveClear = (x, y, z, toX, toY, toZ, height) => {
    for (const zone of closedCaveZones) {
      // A released player may already be beside the boards. Keep the way out open.
      if (workZoneContains(zone, x, y, z, height)) {
        const dx = x - zone.x, dz = z - zone.z, tx = toX - zone.x, tz = toZ - zone.z;
        const across = Math.abs(dx * zone.cr - dz * zone.sr), toAcross = Math.abs(tx * zone.cr - tz * zone.sr);
        const along = dx * zone.sr + dz * zone.cr, toAlong = tx * zone.sr + tz * zone.cr;
        if (toAlong >= along - 1e-7 || toAcross > across + 1e-7) continue;
        return false;
      }
      if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, height)) return false;
    }
    return true;
  };
  const npcWorkZoneAt = (cave, x, y, z) => {
    if (!workZoneTraveler(cave)) return false;
    for (const zone of workZones) if (workZoneContains(zone, x, y, z, cave.bodyHeight)) return true;
    return false;
  };
  // Where an NPC may land, for the crew and for a rider jumping off a clanker.
  const npcLandingAllowed = (x, y, z, height, cave) => !npcRampRoofAt(x, y, z) && !npcCaveRimAt(x, y, z) && !npcClosedCaveAt(x, z, y, height) && !npcPileAt(x, y, z, height) && !npcWorkZoneAt(cave, x, y, z) && npcFireClear(x, y, z, x, y, z, height);
  const npcWorkZoneClear = (cave, x, y, z, toX, toY, toZ) => {
    if (!workZoneTraveler(cave)) return true;
    const p = cave.root.position, feet = p.y - cave.baseY;
    for (const zone of workZones) {
      // A shift may start around someone. Their exit remains open.
      if (!zone.active || workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight)) continue;
      if (!workZoneSegmentClear(zone, x, y, z, toX, toY, toZ, cave.bodyHeight)) return false;
    }
    return true;
  };
  const npcWorkDetour = (cave, tx, tz, targetY = cave.root.position.y - cave.baseY) => {
    const out = cave.avoidance.detour, p = cave.root.position, feet = p.y - cave.baseY;
    if (!workZoneTraveler(cave)) { out.site = -1; return false; }
    if (out.goalX !== tx || out.goalZ !== tz) { out.site = -1; out.goalX = tx; out.goalZ = tz; }
    if (out.site < 0) {
      for (let i = 0; i < workZones.length; i++) {
        const zone = workZones[i];
        if (!zone.active) continue;
        const inside = workZoneContains(zone, p.x, feet, p.z, cave.bodyHeight);
        const path = cave.pathing;
        if (!inside && workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)
          && (path.tx !== tx || path.tz !== tz || workZoneSegmentClear(zone, p.x, feet, p.z, path.targetX, targetY, path.targetZ, cave.bodyHeight))) continue;
        const localX = (p.x - zone.x) * zone.cr - (p.z - zone.z) * zone.sr;
        out.site = i; out.phase = 0; out.entryX = inside ? localX : (localX < 0 ? -1 : 1) * (zone.half + 0.9);
        out.side = (tx - zone.x) * zone.cr - (tz - zone.z) * zone.sr < 0 ? -1 : 1;
        cave.avoidance.navigation.mode = 0; cave.avoidance.tx = NaN;
        break;
      }
      if (out.site < 0) return false;
    }
    const zone = workZones[out.site];
    if (!zone.active) { out.site = -1; cave.pathing.tx = NaN; return false; }
    // Two front corners avoid both the line of fire and the occupied fan.
    // Keep this direct detour until its original goal, so painted-path hints
    // cannot pull the walker back toward an intermediate point inside it.
    if (out.phase === 0) {
      out.x = zone.x + zone.cr * out.entryX + zone.sr * (zone.front + 0.9);
      out.z = zone.z - zone.sr * out.entryX + zone.cr * (zone.front + 0.9);
      if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 1;
    }
    if (out.phase === 1) {
      if (workZoneSegmentClear(zone, p.x, feet, p.z, tx, targetY, tz, cave.bodyHeight)) out.phase = 2;
      else {
        const x = out.side * (zone.half + 0.9), z = zone.front + 0.9;
        out.x = zone.x + zone.cr * x + zone.sr * z; out.z = zone.z - zone.sr * x + zone.cr * z;
        if (Math.hypot(out.x - p.x, out.z - p.z) < 0.12) out.phase = 2;
      }
    }
    if (out.phase === 2) { out.x = tx; out.z = tz; }
    cave.pathing.tx = NaN; cave.pathing.index = cave.pathing.count;
    cave.pathing.targetX = out.x; cave.pathing.targetZ = out.z;
    return true;
  };
  const npcDestinationBlocked = (cave, x, z) => {
    // Stroll destinations are on the surface. Evaluate their own floor,
    // not the walker's current elevation at the bottom of a staircase.
    const onTimechain = timechainIsland && Math.hypot(x - timechainIsland.place.x, z - timechainIsland.place.z) < BL.timechainModels.SITE.radius - 1;
    const feet = onTimechain ? playerSupportAt(x, z, Infinity, Infinity, cave) : island.surfaceAt(x, z);
    return npcRampRoofAt(x, feet, z) || npcClosedCaveAt(x, z, feet, cave.bodyHeight) || npcPileAt(x, feet, z, cave.bodyHeight) || npcWorkZoneAt(cave, x, feet, z) || !npcFireClear(x, feet, z, x, feet, z, cave.bodyHeight) || !walkable(x, z, x, z, feet, cave.bodyHeight, cave);
  };
  const npcWalkable = (fromX, fromZ, toX, toZ, y, height, actor) => {
    if (!walkable(fromX, fromZ, toX, toZ, y, height, actor)) return false;
    // Sweep to the actual downhill support too.
    // Checking at the previous, higher floor can clear a move whose lowered torso intersects the wall.
    const feet = playerSupportAt(toX, toZ, y, y, actor);
    if (npcRampRoofAt(toX, feet, toZ) && !npcRampRoofAt(fromX, y, fromZ)) return false;
    if (!npcClosedCaveClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
    if (!npcWorkZoneClear(actor, fromX, y, fromZ, toX, feet, toZ)) return false;
    if (!npcFireClear(fromX, y, fromZ, toX, feet, toZ, height)) return false;
    // Voluntary walkers go around fruit, but a growing pile or a landing may put one inside.
    // Keep their way out passable rather than trapping them.
    if (!npcPileAt(fromX, y, fromZ, height)) {
      const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / 0.15));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (npcPileAt(lerp(fromX, toX, t), lerp(y, feet, t), lerp(fromZ, toZ, t), height)) return false;
      }
    }
    // Supported ascent lifts onto a tread before moving across it. A diagonal
    // torso sweep from the old floor would falsely hit a legal half-metre
    // riser at its outer corner. Descents still sweep the actual falling edge.
    const sweepY = Math.max(y, feet);
    return island.clearAt(toX, feet + 1e-5, toZ, 0, 0.01) && island.clearAt(toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3)
      && (feet <= y || island.clearAt(fromX, sweepY + 0.3, fromZ, PLAYER_RADIUS, height - 0.3))
      && island.voxelSegmentClearAt(fromX, sweepY + 0.3, fromZ, toX, feet + 0.3, toZ, PLAYER_RADIUS, height - 0.3);
  };
  // The route graph describes connected architecture only.
  // Scenery and other walkers are avoided by the same swept steps used during the actual walk.
  const sleepRouteClear = (fromX, fromZ, toX, toZ, y, height) => {
    const feet = Math.max(y, supportAt(toX, toZ, y), bedSupportAt(toX, toZ, y, STEP_MAX, PLAYER_RADIUS));
    return !crossesSealedCave(fromX, fromZ, toX, toZ, y) && feet - y <= STEP_MAX && feet + height <= Math.min(island.ceilingAt(toX, feet, toZ, PLAYER_RADIUS), entranceCeilingAt(toX, toZ, feet, PLAYER_RADIUS), bedCeilingAt(toX, toZ, feet, PLAYER_RADIUS)) + 1e-7 && island.clearAt(toX, feet + STEP_MAX, toZ, PLAYER_RADIUS, Math.max(0, height - STEP_MAX));
  };
  // Upward thrust follows the outside of the spherical underside; slide out beneath its notches before rising.
  // Same full-body clearance as flight; interior ceilings and unsupported idle falls stay put.
  const glideJetCeiling = (cave, dt) => {
    const p = cave.root.position, feet = p.y - cave.baseY, height = cave.bodyHeight + Math.max(0, cave.viewLift);
    if (feet >= 0 || !abyssAt(p.x, p.z, feet)) return false;
    const ceiling = ceilingAt(p.x, p.z, feet), radius = Math.hypot(p.x, p.z);
    if (!radius || ceiling - feet - height > 0.15) return false;
    const distance = JET_SPEED * dt, x = p.x + p.x / radius * distance, z = p.z + p.z / radius * distance;
    if (!flyable(p.x, p.z, x, z, feet, height, cave) || !island.voxelSegmentClearAt(p.x, feet, p.z, x, feet, z, PLAYER_RADIUS, height)) return false;
    p.x = x; p.z = z;
    return true;
  };
  // Every cloud keeps its track and full size for the visit. Its long X axis lies along the circle, level with
  // the horizon. Clouds on a lane share a speed and keep their spacing; nothing queries or plans movement.
  const placeCloud = (cloud) => {
    const p = cloud.node.position;
    p.x = Math.cos(cloud.angle) * cloud.radius; p.z = Math.sin(cloud.angle) * cloud.radius;
    // The inner lane dips below the bridges (-4..2m); the outer lane crests above them (2..11m).
    // Broad crossing shoulders keep the full meshes clear, with continuous position and slope each lap.
    const wave = 1 - Math.sin(cloud.angle * 3);
    p.y = cloud.baseY + cloud.waveY * wave * wave;
    cloud.node.rotation.y = -cloud.angle - Math.PI / 2;
  };
  const buildClouds = () => {
    for (const track of CLOUD_TRACKS) for (let i = 0; i < CLOUDS_PER_TRACK; i++) {
      const node = createNode({ geometry: hubModels.cloud(Math.min(2, clouds.length % 4)), matrixCloud: true, sightHidden: true });
      const cloud = { node, speed: track.speed, angle: track.phase + i * Math.PI * 2 / CLOUDS_PER_TRACK,
        radius: track.radius, baseY: track.baseY, waveY: track.waveY };
      placeCloud(cloud);
      addChild(root, node);
      placed.push(node);
      clouds.push(cloud);
    }
  };
  const updateClouds = (dt) => {
    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      cloud.angle = (cloud.angle + cloud.speed * dt / cloud.radius) % (Math.PI * 2);
      placeCloud(cloud);
    }
  };
  // The dais and its flush, one block-wide perimeter grow continuously with the pile.
  const buildAltar = () => {
    const node = createNode();
    const slab = createNode({ geometry: hubModels.altarSlab(), depthBias: 0.15 });
    const rings = [];
    addChild(node, slab);
    for (let i = 0; i < 3; i++) {
      const ring = createNode({ geometry: hubModels.altarBlock(i), instanceData: new Float32Array(Math.ceil(ALTAR_MAX_BLOCKS / 3) * 20), instanceCount: 0, instanceVersion: 0, depthBias: 0.2 });
      rings.push(ring);
      addChild(node, ring);
    }
    addChild(root, node);
    placed.push(node);
    const result = { node, slab, rings, radius: 0, platformRadius: 0, outerRingRadius: 0, outerRingInnerRadius: 0, height: ALTAR_HEIGHT, ringCount: 1, blockCount: 0, setRadius: null };
    result.setRadius = (radius) => {
      result.radius = radius;
      const halfWidth = ALTAR_BLOCK_WIDTH * 0.5;
      const outer = radius + ALTAR_RING_GAP + halfWidth;
      const wanted = Math.min(ALTAR_MAX_BLOCKS, Math.max(8, Math.round(outer * Math.PI * 2 / ALTAR_BLOCK_ARC)));
      const arc = outer * Math.PI * 2 / wanted * 0.88;
      result.blockCount = wanted;
      result.outerRingRadius = outer;
      result.outerRingInnerRadius = outer - halfWidth;
      result.platformRadius = outer + halfWidth;
      setVec(slab.scale, result.outerRingInnerRadius, ALTAR_HEIGHT, result.outerRingInnerRadius);
      for (let i = 0; i < rings.length; i++) rings[i].instanceCount = 0;
      for (let i = 0; i < wanted; i++) {
        const angle = i / wanted * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const ring = rings[i % rings.length];
        const offset = ring.instanceCount++ * 20;
        const data = ring.instanceData;
        data[offset] = cos * ALTAR_BLOCK_WIDTH;
        data[offset + 1] = 0;
        data[offset + 2] = sin * ALTAR_BLOCK_WIDTH;
        data[offset + 3] = 0;
        data[offset + 4] = 0;
        data[offset + 5] = ALTAR_HEIGHT;
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        data[offset + 8] = -sin * arc;
        data[offset + 9] = 0;
        data[offset + 10] = cos * arc;
        data[offset + 11] = 0;
        data[offset + 12] = cos * outer;
        data[offset + 13] = 0;
        data[offset + 14] = sin * outer;
        data[offset + 15] = 1;
        data[offset + 16] = 1;
        data[offset + 17] = 0;
        data[offset + 18] = 0;
        data[offset + 19] = 0;
      }
      for (let i = 0; i < rings.length; i++) rings[i].instanceVersion++;
    };
    result.setRadius(PILE_SCALE);
    return result;
  };

  const celebrate = (donation, bananas) => {
    // GAME MODE: hold the crew's cheer while an island event runs; the thanks still shows.
    if (!gameMode) {
      for (const cave of crew.workingCavemen()) {
        if (cave.build) continue;
        cave.cheer = 1.6;
        fx.say(cave, ["OOGA!", "BOOGA!", "BANANA!"][fnv1a(`${donation.id}/${cave.traits.name}`) % 3], 1.8);
      }
    }
    fx.showTicker(`THANKS ${donation.handle ? "@" + donation.handle.toUpperCase() : "ANON"} · ${gameMod.formatLarge(bananas)} BANANAS`, 4.5);
  };
  // The Bitcoin feed: a block strikes the lake and sends light through its collector.
  const onMempool = (event) => {
    if (event.type === "block") {
      // Distant blocks still update the chain and its notice, without queuing a show for the next visit.
      if (poolEffectsActive) {
        weather.strike({ x: mempoolIsland.place.x, y: mempoolIsland.place.y + mempoolIsland.water.state.shown, z: mempoolIsland.place.z });
        // A cube takes nothing with it: the backlog says what is left.
        mempoolIsland.water.block(event.height);
      }
      hud.toast(`Block ${event.height} mined${event.txCount ? ` · ${event.txCount} transactions` : ""}`);
    }
  };
  // The chain board's four readings, set in the jumbotron's 5x7 font and run-length merged into quads,
  // exactly as the cave sets its wall panels. Its overview and four detail panes rebuild only when their
  // visible readings change, so a board left standing all day holds its size.
  const CHAIN_PANEL_W = 230, CHAIN_PANEL_H = 72, CHAIN_PANEL_BG = [42, 39, 36];
  // A board that has stopped being fed says so by going grey. Holding the last reading out in its
  // usual colours would be the one genuinely misleading thing this island could do.
  const STALE_INK = "#7d766a";
  const arrivalsLive = (s) => s.socketAt > 0 && Date.now() - s.socketAt < weatherMod.ARRIVALS_FRESH_MS;
  const rateText = (vbs) => `${gameMod.formatThree(vbs, true)} VB/S`;
  const backlogText = (vsize) => `${gameMod.formatThree(vsize / 1e6)} MVB`;
  const backlogDetails = (count, countKnown = true) => countKnown ? `${gameMod.formatThree(count, true)} TX WAITING` : "TX COUNT UNKNOWN";
  // Units stay half-height; popup units use the doubled canvas grid so their small letters remain legible.
  const UNIT_WORDS = new Set(["VB/S", "MVB", "SAT/VB", "TX"]);
  const metricUnit = (word, previous) => (word === "WEATHER" && !previous)
    || (UNIT_WORDS.has(word) && (previous === "-" || /[0-9KMB]$/.test(previous)));
  const unitWidth = (word, scale, fine = false) => fine ? (word.length * 3 - 0.5) * scale : BL.jumbotron.text.measureText(word, scale / 2);
  const metricWidth = (value, scale, fine = false) => {
    const text = BL.jumbotron.text, words = value.split(" ");
    let width = 0, previous = "";
    for (const word of words) {
      const unit = metricUnit(word, previous);
      if (previous) width += (unit ? 4 : 7) * scale;
      width += unit ? unitWidth(word, scale, fine) : text.measureText(word, scale);
      previous = word;
    }
    return width;
  };
  const drawMetric = (c2, value, anchor, y, color, scale, right = false, fine = false) => {
    const text = BL.jumbotron.text, words = value.split(" ");
    const width = metricWidth(value, scale, fine);
    let x = anchor - (right ? width : Math.round(width / 2));
    let previous = "";
    for (const word of words) {
      const unit = metricUnit(word, previous);
      if (previous) x += (unit ? 4 : 7) * scale;
      if (!unit) {
        text.drawText(c2, word, x, y, color, scale);
        x += text.measureText(word, scale);
      } else if (fine) {
        c2.save();
        c2.fillStyle = color;
        c2.font = `bold ${scale * 4.5}px monospace`;
        c2.textBaseline = "alphabetic";
        for (const ch of word) {
          c2.fillText(ch, x, y + 7 * scale);
          x += 3 * scale;
        }
        c2.restore();
      } else {
        text.drawText(c2, word, x, y + 7 * scale / 2, color, scale / 2);
        x += unitWidth(word, scale);
      }
      previous = word;
    }
  };
  const chainRows = (s) => {
    const ink = (live) => s.live ? live : STALE_INK;
    return [
      ["BLOCK", s.height ? String(s.height) : "-", ink("#e8c14a")],
      ["INCOMING", arrivalsLive(s) ? rateText(s.inflow) : "- VB/S", arrivalsLive(s) ? "#8fc3ff" : STALE_INK],
      ["MEMPOOL", s.backlogAt ? backlogText(s.vsize) : "-", s.backlogAt && Date.now() - s.backlogAt < BL.poolWater.HYDRO.FRESH_MS ? "#7cc8ff" : STALE_INK],
      ["FAST FEE", s.fastestFee ? `${gameMod.formatFeeRate(s.fastestFee)} SAT/VB` : "-", ink("#ff9a2a")]
    ];
  };
  const chainDetail = [
    [(s) => s.lastTxCount && s.lastWeight ? `${gameMod.formatThree(s.lastTxCount, true)} TX · ${gameMod.formatThree(s.lastWeight / 4e6)} MVB` : "", "BLOCK HEIGHT"],
    [(s) => arrivalsLive(s) ? `WEATHER ${weatherMod.STEPS[weather.state.step].name.toUpperCase()}` : "WEATHER UNAVAILABLE", "INCOMING DATA"],
    [(s) => backlogDetails(s.count, !!s.backlogAt), "MEMPOOL"],
    [(s) => s.hourFee ? `HOUR ${gameMod.formatFeeRate(s.hourFee)} SAT/VB` : "", "FAST FEE RATE"]
  ];
  const refreshChainSign = () => {
    if (!chainSign) return;
    const snapshot = chain.snapshot, rows = chainRows(snapshot), index = chainSign.index;
    const under = index ? chainDetail[index - 1][0](snapshot) : "";
    const printed = index ? `${index}|${rows[index - 1].join("|")}|${under}`
      : `0|${rows.map((r) => r.join("|")).join("|")}`;
    if (printed === chainSign.printed) return;
    chainSign.printed = printed;
    const c2 = chainSign.ctx2d, text = BL.jumbotron.text;
    c2.clearRect(0, 0, CHAIN_PANEL_W, CHAIN_PANEL_H);
    if (!index) {
      let y = 4;
      for (const [label, value, color] of rows) {
        text.drawText(c2, label, 2, y, "#9b8f7a", 2);
        drawMetric(c2, value, CHAIN_PANEL_W - 2, y, color, 2, true);
        y += 16;
      }
    } else {
      const [label, value, color] = rows[index - 1];
      const title = chainDetail[index - 1][1] || label;
      text.drawText(c2, title, Math.round((CHAIN_PANEL_W - text.measureText(title, 2)) / 2), 4, "#9b8f7a", 2);
      const scale = metricWidth(value, 4) <= CHAIN_PANEL_W - 8 ? 4 : 3;
      drawMetric(c2, value, CHAIN_PANEL_W / 2, 23, color, scale);
      if (under) drawMetric(c2, under, CHAIN_PANEL_W / 2, 54, "#9b8f7a", 2);
    }
    const node = chainSign.node;
    node.geometry = poolModels.chainPanel(c2, CHAIN_PANEL_W, CHAIN_PANEL_H, CHAIN_PANEL_BG, node.geometry);
  };
  const updateChainSign = (elapsed) => {
    if (!chainSign) return;
    if (!Number.isFinite(chainSign.switchAt)) chainSign.switchAt = elapsed;
    const cycle = jumbotron?.cycleSeconds ?? 8;
    if (cycle > 0 && elapsed - chainSign.switchAt >= cycle) {
      chainSign.index = (chainSign.index + 1) % (chainDetail.length + 1);
      chainSign.switchAt = elapsed;
      chainSign.nextRefresh = elapsed + 1;
      refreshChainSign();
    } else if (elapsed >= chainSign.nextRefresh) {
      chainSign.nextRefresh = elapsed + 1;
      refreshChainSign();
    }
  };
  // The Mempool island's two boards in the shared board dialog. Each is a list of pages, every page a caption, a
  // note and a drawing in the jumbotron's 5x7 font on the board's own small canvas; `refresh` redraws the shown
  // page and moves `version`, which is all the dialog watches.
  const POOL_BOARD_W = 512, POOL_BOARD_H = 192, POOL_BOARD_BG = "#0f110f", POOL_DIM = "#9b8f7a";
  const poolBoard = (title, pages, hideCaption = false) => {
    const canvas = document.createElement("canvas");
    canvas.width = POOL_BOARD_W;
    canvas.height = POOL_BOARD_H;
    const c2 = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    let nextRefresh = 0, lastElapsed = 0, switchAt = NaN, paused = false;
    const board = {
      title, help: "", captionAbove: true, hideCaption, carousel: true, canvas, count: pages.length, index: 0, version: 0, caption: "", note: "",
      get paused() { return paused; },
      setPaused(value) { paused = value; switchAt = lastElapsed; },
      begin() { lastElapsed = switchAt = NaN; },
      go(i) {
        board.index = i;
        switchAt = lastElapsed;
        board.refresh();
      },
      update(elapsed) {
        // Freshness and the weather can change even when no feed event arrives.
        if (!Number.isFinite(elapsed)) return;
        lastElapsed = elapsed;
        if (!Number.isFinite(switchAt)) switchAt = elapsed;
        const cycle = jumbotron?.cycleSeconds ?? 8;
        if (!paused && cycle > 0 && elapsed - switchAt >= cycle) {
          board.go((board.index + 1) % board.count);
          nextRefresh = elapsed + 1;
          return;
        }
        if (elapsed < nextRefresh) return;
        nextRefresh = elapsed + 1;
        board.refresh();
      },
      refresh() {
        const page = pages[board.index];
        c2.fillStyle = POOL_BOARD_BG;
        c2.fillRect(0, 0, POOL_BOARD_W, POOL_BOARD_H);
        page.draw(c2, chain.snapshot);
        board.caption = page.caption;
        board.note = page.note(chain.snapshot);
        board.version++;
      }
    };
    return board;
  };
  // A reading: its label small at the top, its value as large as fits, one or two detail lines and an optional gauge.
  const reading = (c2, label, value, color, under, gauge = -1, gaugeColor = color) => {
    const text = BL.jumbotron.text, centre = (t, y, ink, scale) => text.drawText(c2, t, Math.round((POOL_BOARD_W - text.measureText(t, scale)) / 2), y, ink, scale);
    centre(label, 16, POOL_DIM, 4);
    const scale = metricWidth(value, 8, true) <= POOL_BOARD_W - 32 ? 8 : 4;
    drawMetric(c2, value, POOL_BOARD_W / 2, scale === 8 ? 60 : 76, color, scale, false, true);
    if (Array.isArray(under)) {
      for (let i = 0; i < under.length; i++) drawMetric(c2, under[i], POOL_BOARD_W / 2, 128 + i * 32, POOL_DIM, 4, false, true);
    } else if (under) drawMetric(c2, under, POOL_BOARD_W / 2, 136, POOL_DIM, 4, false, true);
    if (gauge < 0) return;
    c2.fillStyle = "#2a2724";
    c2.fillRect(56, 172, POOL_BOARD_W - 112, 12);
    c2.fillStyle = gaugeColor;
    c2.fillRect(56, 172, Math.round((POOL_BOARD_W - 112) * clamp(gauge, 0, 1)), 12);
  };
  const chainStatus = (s) => {
    const age = s.at ? Math.round((Date.now() - s.at) / 1000) : 0;
    return !s.height ? "Waiting for Bitcoin data."
      : s.live ? `Block ${s.height} is the latest. Rain follows new transactions arriving in vB/s; the mempool holds the transactions still waiting, in MvB. A new block can shrink that queue after the next backlog update. Fees affect which transactions are likely to get in first.`
        : `Last updated ${age > 90 ? `${Math.round(age / 60)} minutes` : `${age} seconds`} ago. These numbers may be out of date until the feed responds again.`;
  };
  const rowPage = (i, caption, under, note, detailLabel = null) => ({
    caption,
    draw: (c2, s) => {
      const [label, value, color] = chainRows(s)[i];
      reading(c2, detailLabel || label, value, color, under(s));
    },
    note: () => note
  });
  const chainBoard = poolBoard("The chain", [
    {
      caption: "At a glance",
      draw: (c2, s) => {
        const text = BL.jumbotron.text;
        let y = 20;
        for (const [label, value, color] of chainRows(s)) {
          text.drawText(c2, label, 32, y, POOL_DIM, 4);
          drawMetric(c2, value, POOL_BOARD_W - 32, y, color, 4, true, true);
          y += 40;
        }
      },
      note: chainStatus
    },
    rowPage(0, "Block height", chainDetail[0][0], "A block's height is its number in the Bitcoin chain. The third line shows that block's transaction count and virtual size. When a new block arrives, lightning strikes and a water cube drops through the chamber; the next mempool reading determines how much waiting data remains in the lake.", chainDetail[0][1]),
    rowPage(1, "Incoming data", chainDetail[1][0], "The large number is new transaction data arriving each second, in virtual bytes (vB/s). Rain strength follows a roughly 30-second average of this rate. Arrivals add to the mempool; blocks confirm transactions and can reduce it.", chainDetail[1][1]),
    rowPage(2, "Mempool", chainDetail[2][0], "The mempool is the data still waiting for a block, measured in millions of virtual bytes (MvB). The smaller figure counts waiting transactions. Rain shows new arrivals; a mined block can clear some of this queue."),
    rowPage(3, "Next-block fee", chainDetail[3][0], "This fee estimate helps a transaction compete for space in the next block, in satoshis per virtual byte (sat/vB). The smaller figure estimates a fee for confirmation within an hour; neither time is guaranteed. Fees affect queue order, while arrivals set the rain and total waiting data fills the lake.", chainDetail[3][1])
  ], true);
  // The key to the island: what arrives makes the weather, what waits fills the lake, and a block is a bolt and a
  // cube. A reading that has stopped being fed goes grey and says so; it is never drawn as a calm zero.
  const weatherBoard = poolBoard("Reading the weather", [
    {
      caption: "Rain",
      draw: (c2, s) => {
        const live = arrivalsLive(s), step = poolEffectsActive ? weather.state.step : weatherMod.stepFor(s.gale);
        reading(c2, "ARRIVALS", live ? rateText(s.inflow) : "- VB/S", live ? "#8fc3ff" : STALE_INK,
          [live ? weatherMod.STEPS[step].name.toUpperCase() : "RAIN UNAVAILABLE", s.backlogAt ? `QUEUE ${backlogText(s.vsize)}` : "QUEUE UNAVAILABLE"]);
      },
      note: () => "The large number is new transaction data arriving per second (vB/s). Rain follows a roughly 30-second average, so the weather changes smoothly. The queue below is data still waiting in the mempool (MvB): arrivals can grow it, while new blocks can reduce it. If arrival updates stop for 90 seconds, rain fades and the rate becomes unavailable; that does not mean zero arrivals."
    },
    {
      caption: "Lake",
      draw: (c2, s) => {
        const water = mempoolIsland.water.state;
        const known = water.status !== "unavailable" || water.observedAt > 0 || water.preview !== null;
        const live = water.preview !== null || water.debugFill !== null || water.observedAt > 0 && Date.now() - water.observedAt < BL.poolWater.HYDRO.FRESH_MS;
        reading(c2, "MEMPOOL", known ? backlogText(water.vsize) : "NO READING", live ? "#7cc8ff" : STALE_INK,
          backlogDetails(s.count, known && water.preview === null && !!s.backlogAt));
      },
      note: () => {
        const water = mempoolIsland.water.state;
        const override = water.debugFill !== null ? ` The poolfill=${water.debugFill} setting overrides the lake height, but not these backlog figures.` : "";
        const preview = water.preview !== null ? " A test backlog is active, so the transaction count is unavailable." : "";
        return `MvB means millions of virtual bytes still waiting for a block. The smaller figure counts waiting transactions. Fees affect which transactions fit first. Incoming data drives the rain and can grow this queue; blocks confirm transactions and can shrink it. Around ${BL.poolWater.HYDRO.OVERFLOW_VB / 1e6} MvB, the lake reaches the rim and spills over. That is this island's visual scale, not a Bitcoin limit.${override}${preview}`;
      }
    },
    {
      caption: "Lightning",
      draw: (c2, s) => reading(c2, "LAST BLOCK", s.height ? String(s.height) : "-",
        s.heightAt > 0 && Date.now() - s.heightAt < 180000 ? "#ffe066" : STALE_INK, "A BOLT AND A CUBE"),
      note: () => `A newly mined block strikes the lake. Light runs down the ramp and splits around the chamber trench; when the two fronts meet, the formed water cube falls. Confirmed transactions leave the mempool, so its next reading may be smaller, though new arrivals can keep it growing. The cube marks the block and does not directly drain the lake.${DEBUG_POOL_BLOCK ? " With poolblock enabled, press P to trigger a test block." : ""}`
    }
  ]);
  const openPoolBoard = (board) => {
    board.begin();
    board.refresh();
    hud.openBoard(board);
  };
  // The standing chain snapshot: how full the pool is, how fast blocks land, how hard they arrive.
  const onChain = (snapshot) => {
    weather.apply(snapshot);
    mempoolIsland.water.apply(snapshot);
    if (poolEffectsActive || hud.el.board.open) mempoolIsland.paintings.refresh(snapshot);
    if (poolEffectsActive) refreshChainSign();
    // The boards' canvases only feed the dialog, and openPoolBoard repaints on open.
    if (hud.el.board.open) {
      chainBoard.refresh();
      weatherBoard.refresh();
    }
  };
  // In real mode `counted` is the API's `{ exact, rounded }`: the tally counts the exact bananas and the toasts the
  // rounded ones, while the show keeps the game's one to twelve (the pile itself follows the API's).
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    const bananas = gameMod.bananasFor(donation.sats), shown = counted ? counted.rounded : bananas;
    pile.deliverBananas(bananas);
    celebrate(donation, shown);
    const loot = lootEnabled ? game.lootFor(donation) : null;
    const who = donation.handle ? `@${donation.handle}` : "anon";
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${gameMod.formatLarge(shown)} banana${shown === 1 ? "" : "s"} · ${who}${loot ? ` · ${loot.tier} crate!` : ""}`);
    if (loot) crates.spawnCrate(donation, loot, 0.9 + Math.min(1.5, bananas / pileMod.DROP_RATE));
    hud.setStats(game.state);
  };

  const tooltipFor = (hit) => {
    const o = hit.owner;
    switch (o.kind) {
      case "tess":
        return COARSE ? `${BL.hubGuide.NAME} the guide · tap for a tour` : `${BL.hubGuide.NAME} the guide · click for a tour`;
      case "halloween": // HALLOWEEN
        return o.tooltip();
      case "caveman":
        return o.cave.traits.display;
      case "clanker":
        return `🦍 ${o.entry.owner.traits.display}`;
      case "crate":
        return `${o.crate.loot.tier} crate · tap to open`;
      case "cave":
        return o.slot.status === "open" ? o.slot.scene === "lab" ? `${o.slot.name} · island workshop` : o.slot.title ? `${o.slot.name} · ${o.slot.title}` : `${o.slot.name} · tap to enter` : o.slot.status === "headquarters" ? "Headquarters · walk down the ramp" : o.slot.status === "mirror" ? `${o.slot.name} · mirror` : o.slot.status === "sleeping" ? "A project sleeps here · zzz" : o.slot.soon ? `${o.slot.name} · coming soon` : "An empty cave";
      case "cave-sign":
        return `${o.slot.name} · open GitHub repo in a new tab`;
      case "gate":
        return bifrostIsle ? "₿IFRÖST · Bifröst starts here" : `${caves.gate.name} · leads nowhere yet`;
      case "room-sign":
        return "Room sign · tap to copy hash";
      case "sphere-key":
        return o.key === "back" ? "Back · return to room choice" : o.key === "enter" ? "Enter · open selected room" : `Room ${o.key} · select`;
      case "lab-link":
        return "EntropyLab · open website in a new tab";
      case "prop":
        if (o.prop === "timechainentrance") return "Timechain Sphere · nine rooms, chosen at the keypad";
        if (o.prop === "timechainbridge") return "Wooden bridge · to Timechain Sphere";
        if (o.prop === "timechainkeypad") return COARSE ? "Room keypad · walk up and tap to choose a room" : "Room keypad · walk up and press Space to choose a room";
        if (o.prop === "totem") return totemTip(o.totem);
        return PROP_TIPS[o.prop] || "";
      case "piece":
        return PIECES[o.piece] ? PIECES[o.piece][0] : "";
      default:
        return "";
    }
  };
  const PILE_SCREEN = { x: 0, y: 0, depth: 0 };
  let pileHovered = false, pileTopY = 0, pileTipValue = "", pileTipText = "";
  const showPileTooltip = () => {
    if (!pile.core.visible) { hud.setPileValueVisible(false); hud.tooltip.hide(); return; }
    const top = pile.core.position.y + pile.core.scale.y * pileTopY + 0.3;
    const screen = renderer.project(0, top, 0, PILE_SCREEN);
    if (!screen) { hud.setPileValueVisible(false); hud.tooltip.hide(); return; }
    hud.setPileValueVisible(true);
    const value = hudMod.donationValueText();
    if (value !== pileTipValue) {
      pileTipValue = value;
      pileTipText = `🍌 ${value}`;
    }
    hud.tooltip.show(pileTipText, screen.x, screen.y, null, false, true);
  };
  const POOL_BLOCK_SCREEN = { x: 0, y: 0, depth: 0 }, POOL_BLOCK_POINTER = { x: 0, y: 0 };
  const POOL_BLOCK_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
  const POOL_BLOCK_HIT = { node: null, owner: null, distance: Infinity, x: 0, y: 0, z: 0 };
  const POOL_BLOCK_VERTEX = new Float32Array(3);
  let poolBlockHovered = null, poolBlockHoverIgnore = null;
  const poolBlockHoverTarget = owner => !poolBlockHoverIgnore || owner.cave !== poolBlockHoverIgnore;
  const showPoolBlockTooltip = () => {
    const owner = poolBlockHovered, node = owner.node;
    if (!owner.sequence.active || !node.visible || node.smokeOpacity === 0) {
      poolBlockHovered = null; hud.tooltip.hide(); return;
    }
    // The suspended block moves even when the pointer does not. Keep the label only while its visible
    // body is still under the pointer, with the same precise target ordering as ordinary hover.
    renderer.ray(POOL_BLOCK_POINTER.x, POOL_BLOCK_POINTER.y, camera, POOL_BLOCK_RAY);
    const ray = POOL_BLOCK_RAY, hit = POOL_BLOCK_HIT;
    poolBlockHoverIgnore = hooks.hoverIgnore();
    if (!input.weaponTargets.ray(hit, ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz,
      camera.far, null, poolBlockHoverTarget, true) || hit.owner !== owner
      || !guideSegmentClear(ray.ox, ray.oy, ray.oz, hit.x, hit.y, hit.z)
      || !mempoolIsland.sightClear(ray.ox, ray.oy, ray.oz, hit.x, hit.y, hit.z)) {
      poolBlockHovered = null; hud.tooltip.hide(); return;
    }
    const geometry = node.geometry, verts = geometry.verts, body = geometry.lakeBody, m = node.world;
    let top = -Infinity;
    // The last two vertices only bound every possible deformation; they are not part of the water.
    // Follow the actual animated body's top rather than that deliberately oversized culling box.
    for (let i = 0; i < verts.length - 6; i += 3) {
      BL.poolWater.sampleBody(POOL_BLOCK_VERTEX, verts[i], verts[i + 1], verts[i + 2], body);
      top = Math.max(top, m[1] * POOL_BLOCK_VERTEX[0] + m[5] * POOL_BLOCK_VERTEX[1] + m[9] * POOL_BLOCK_VERTEX[2] + m[13]);
    }
    const screen = renderer.project(m[12], top + 0.15, m[14], POOL_BLOCK_SCREEN);
    if (!screen) { hud.tooltip.hide(); return; }
    hud.tooltip.show(owner.sequence.label, screen.x, screen.y, null, false, true);
  };
  const showHoverTooltip = (hit, p) => {
    if (hit && (hit.owner.kind === "cave" || hit.owner.kind === "cave-sign")) BL.deferred.prefetchScene(hit.owner.slot.scene);
    pileHovered = hit?.owner.kind === "pile";
    if (!pileHovered) hud.setPileValueVisible(false);
    poolBlockHovered = hit?.owner.kind === "poolblock" ? hit.owner : null;
    if (poolBlockHovered) {
      POOL_BLOCK_POINTER.x = p.x; POOL_BLOCK_POINTER.y = p.y;
      showPoolBlockTooltip();
    } else if (pileHovered) showPileTooltip();
    else if (hit) hud.tooltip.show(tooltipFor(hit), p.x, p.y, hit.owner.cave, hit.owner.kind === "clanker");
    else hud.tooltip.hide();
  };
  const reticleTarget = (hit) => {
    const o = hit.owner;
    if (hit.node === mirrorCave.node || o.kind === "cave-sign" || o.kind === "room-sign" || o.kind === "sphere-key"
      || o.kind === "lab-link" || o.kind === "piece" || o.kind === "halloween" && o.role === "herald") return "object"; // HALLOWEEN: halloween
    if (o.kind === "cave") return o.slot.status === "open" ? "object" : "none";
    if (o.kind === "prop" && RETICLE_PROPS.has(o.prop)) return "object";
    return "none";
  };
  const wobble = (node, amp) => {
    if (node.busy) return false;
    node.busy = true;
    const z0 = node.rotation.z;
    addTween({
      dur: 0.6, update: (k) => {
        node.rotation.z = z0 + Math.sin(k * Math.PI * 3) * (1 - k) * amp;
      }, done: () => {
        node.rotation.z = z0;
        node.busy = false;
      }
    });
    return true;
  };
  const dropBanana = (o, chance) => {
    if (now < o.ripe || Math.random() > chance) return false;
    o.ripe = now + RIPEN;
    pile.deliverBananas(1);
    hud.toast("A banana fell out and rolled to the pile!");
    return true;
  };
  const reactProp = (o, p) => {
    const w = o.node.world;
    const x = w[12], z = w[14];
    const foundMagazine = (o.prop === "tree" || o.prop === "bush") && revealMagazine(o);
    switch (o.prop) {
      case "tree":
        if (!wobble(o.node, 0.1)) return;
        fx.burst(x, 2.6, z, 10, [LEAF], 1.6);
        if (RENDER_OPTS.stars > NIGHT) critters.burst(x, z);
        if (!foundMagazine && !dropBanana(o, TREE_CHANCE)) hud.toast("Leaves. Just leaves.");
        break;
      case "bush":
        if (!wobble(o.node, 0.25)) return;
        fx.burst(x, w[13] + 0.7, z, 6, [LEAF], 1.2);
        if (!foundMagazine && !dropBanana(o, BUSH_CHANCE)) hud.toast(BUSH_WORDS[fnv1a(`${o.x}/${o.z}/${Math.floor(now)}`) % BUSH_WORDS.length]);
        break;
      case "totem":
        pokeTotem(o);
        break;
      case "palm":
        if (!wobble(o.node, 0.05)) return;
        fx.burst(x, w[13] + 3.6, z, 12, [LEAF], 1.6);
        if (!dropBanana(o, TREE_CHANCE)) hud.toast(PALM_WORDS[fnv1a(`${o.x}/${o.z}/${Math.floor(now)}`) % PALM_WORDS.length]);
        break;
      case "jumbotron":
        // Resolve the tap onto the cabinet: the side arrows and the dot strip page the board where
        // it stands, and the screen itself opens the close-up, readable from anywhere on the island.
        if (jumbotron) {
          if (p) {
            renderer.ray(p.x, p.y, camera, TAP_RAY);
            if (jumbotron.tapAt(TAP_RAY) === "screen") openJumbotron();
          } else openJumbotron();
        }
        break;
      case "flower":
        if (!wobble(o.node, 0.4)) return;
        fx.burst(x, mempoolIsland.overAt(x, z) ? w[13] + 0.35 : 0.35, z, 8, PETALS, 1.1);
        break;
      case "torch":
        o.node.flare = 1;
        fx.burst(x, w[13] + 1.4, z, 8, [SPARK], 1.3);
        break;
      case "firepit":
        // The voxel flame burns by day and night, so the click flares it whenever the lamp is lit.
        if (!fire || !fire.lit) {
          hud.toast("Cold ashes. Ooga waits for night.");
          break;
        }
        fire.node.flare = 1;
        fx.burst(x, 0.9, z, 10, [SPARK], 1.6);
        hud.toast("Warm. Ooga likes.");
        break;
      case "bedroll":
        hud.toast("Somebody's bed. Ooga leaves it.");
        break;
      case "ladder":
        if (!wobble(o.lean, 0.05)) return;
        hud.toast("Wobbly. Ooga does not climb.");
        break;
      case "dock":
        hud.toast("The planks creak over the drop.");
        break;
      case "magazine":
        hud.toast(pilot.player ? "Walk into it to collect it." : "Double-tap an Ooga, then walk into it.");
        break;
      case "gate":
        hud.toast(bifrostIsle ? "₿IFRÖST · Bifröst starts here" : `${caves.gate.name} · leads nowhere yet`);
        break;
      case "poolsign":
        hud.toast("The Mempool is under the lake. Walk in through the hill.");
        break;
      case "poolpainting":
        mempoolIsland.paintings.refresh(chain.snapshot);
        o.stop.board.index = 0;
        hud.openBoard(o.stop.board);
        break;
      case "poolbridge":
        hud.toast("Vines and planks. The Mempool is across.");
        break;
      case "timechainentrance":
        navigate("timechain");
        break;
      case "timechainbridge":
        hud.toast("Timechain Island · walk across the wooden bridge to the Sphere's doors.");
        break;
      case "timechainkeypad": {
        const gate = timechainIsland.gate, player = pilot.player, at = player && player.root.position;
        if (gate.busy) break;
        if (!player) hud.toast("Only an Ooga can go in. Double-tap one, then walk it up to the keypad.");
        else if (!gate.nearKeypad(at.x, at.y - player.baseY + 1.1, at.z)) hud.toast("Walk up to the keypad beside the doors.");
        else gate.engage();
        break;
      }
      case "bifrostbridge":
        hud.toast("Bifröst hums underfoot. ₿IFRÖST is across.");
        break;
      case "bifrostgate":
        hud.toast(pilot.player ? "Walk through the field to cross into ₿IFRÖST." : "Only an Ooga may pass. Double-tap one, then walk it through the field.");
        break;
      case "heimdall":
        bifrostIsle.heimdall.poke();
        break;
      case "weathersign":
        openPoolBoard(weatherBoard);
        break;
      case "chainsign":
        openPoolBoard(chainBoard);
        break;
      case "poolrock":
        hud.toast("Moss grows thick on the Mempool island.");
        break;
      case "canopy":
        if (!wobble(o.node, 0.08)) return;
        fx.burst(x, w[13] + 4.2, z, 10, [LEAF], 1.7);
        if (RENDER_OPTS.stars > NIGHT) critters.burst(x, z);
        if (!dropBanana(o, TREE_CHANCE)) hud.toast("Leaves and lianas.");
        break;
      case "poolfern":
        if (!wobble(o.node, 0.3)) return;
        fx.burst(x, w[13] + 0.5, z, 6, [LEAF], 1.1);
        if (!dropBanana(o, BUSH_CHANCE)) hud.toast("Fronds. Ooga finds nothing.");
        break;
      case "poollog":
        if (!wobble(o.node, 0.1)) return;
        fx.burst(x, w[13] + 0.5, z, 6, [DUST], 1.1);
        hud.toast("Rotten through. Ooga hears something inside.");
        break;
      case "jaguar":
      case "monkey":
      case "toucan":
        pokeBeast(o.node, o.prop);
        break;
      default:
        break;
    }
  };
  const useProp = (o, p) => {
    if (!o.active) return;
    reactProp(o, p);
  };
  const WAKE_ACTION = { kind: "wake" }, ROLL_ACTION = { kind: "roll" }, STAND_ACTION = { kind: "stand" };
  const TAP_RAY = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
  const nearbyAction = (x, y, z, reach) => {
    const player = pilot.player;
    if (player && player.camp.burning) return ROLL_ACTION;
    if (player && player.camp.seat) return STAND_ACTION;
    if (player && crew.sleeping) return WAKE_ACTION;
    if (player && pilot.moving) return null;
    if (player && player.hop < 0.03 && player.hopV <= 0 && headquarters) {
      const feet = player.root.position.y - player.baseY;
      const floor = bedSupportAt(x, z, feet + 0.04, 0, PLAYER_RADIUS);
      if (Math.abs(feet - floor) < 0.08) for (const bed of headquarters.mattresses) {
        if (bed.sleeper && bed.sleeper !== player || !bed.node.visible || bed.node.parent !== root) continue;
        const dx = x - bed.x, dz = z - bed.z, lx = dx * bed.cr - dz * bed.sr, lz = dx * bed.sr + dz * bed.cr;
        if (Math.abs(lx) < bed.width / 2 && Math.abs(lz) < bed.depth / 2 && Math.abs(floor - bed.y - bed.sleep.surface) < bed.sleep.pillowTop) return bed;
      }
    }
    if (player && player.hop < 0.03 && player.hopV <= 0 && headquarters) {
      let nearest = null, distance = Math.min(reach, 1.5) ** 2;
      for (const seat of headquarters.benches) {
        const d = (x - seat.x) ** 2 + (z - seat.z) ** 2;
        if (!seat.sitter && d < distance && Math.abs(y - 1.1 - seat.floor) < 0.7) { nearest = seat; distance = d; }
      }
      if (nearest) return nearest;
    }
    if (arcadeMouth && actionWithinReach(x, y, z, arcadeMouth.x, arcadeMouth.y, arcadeMouth.z, MOUTH_REACH)) return arcadeMouth;
    if (player && timechainIsland.gate && timechainIsland.gate.nearKeypad(x, y, z)) return timechainIsland.gate.action;
    return null;
  };
  const useNearbyAction = (action) => {
    if (action === WAKE_ACTION) crew.wakePlayer();
    else if (action === ROLL_ACTION) crew.dropRoll();
    else if (action === STAND_ACTION) crew.standPlayer();
    else if (action.kind === "bench") crew.sitPlayer(action);
    else if (action.sleep) crew.sleepPlayer(action);
    else if (action === timechainIsland.gate.action) timechainIsland.gate.engage();
    else enterCave(action.slot);
  };
  const freeAction = () => {
    const action = nearbyAction(camera.position.x, camera.position.y, camera.position.z, MATRIX_BUTTON_REACH);
    if (!action) return false;
    useNearbyAction(action);
    return true;
  };
  // Stationary functional controls take priority over a jump or jetpack thrust.
  const useNear = (x, z, reach, feetY) => {
    const action = nearbyAction(x, feetY + 1.1, z, reach);
    if (!action) return false;
    useNearbyAction(action);
    return true;
  };
  const releaseForScene = id => {
    if (id === "factory" && factoryMouth) factoryMouth.snap = true;
    pilot.release(true);
    hud.tooltip.hide();
  };
  const enterScene = (view, id) => {
    if (entering) return;
    // A game still being built is unregistered unless the page opted in (director.js, `wip`).
    if (!BL.scenes[id]) return hud.toast("Not open yet. Ooga still building it.");
    entering = true;
    releaseForScene(id);
    const orbit = pilot.orbit;
    const from = { x: orbit.tx, y: orbit.ty, z: orbit.tz, dist: orbit.dist, yaw: orbit.yaw };
    const turn = Math.atan2(Math.sin(view.yaw - from.yaw), Math.cos(view.yaw - from.yaw));
    orbit.target = view.target;
    orbit.tYaw = from.yaw + turn;
    orbit.tPitch = view.pitch;
    orbit.tDist = ENTER_DIST;
    enteringTween = addTween({
      dur: ENTER_DUR, ease: ease.inOutQuad, update: (k) => {
        orbit.tx = lerp(from.x, view.target.x, k);
        orbit.ty = lerp(from.y, view.target.y, k);
        orbit.tz = lerp(from.z, view.target.z, k);
        orbit.dist = lerp(from.dist, ENTER_DIST, k);
        orbit.yaw = from.yaw + turn * k;
      }, done: () => { enteringTween = null; go(id); }
    });
  };
  // The Lightning Factory's shield: the lab's phase plane set further down the tunnel. Nothing works at this
  // mouth to keep it rippling as the lab's crew does, so it hums on its own, a glyph wave every fraction of a
  // second somewhere on it, and bodies crossing it leave their outline. The factory's node runs on behind it, so the
  // show seen through it is the one inside. The played Ooga walking through it goes in, with a full ripple where it
  // crossed and no dolly back out to the mouth.
  const factoryShield = (dt, elapsed) => {
    const f = factoryMouth, m = f.mouth, o = f.opening, player = pilot.player;
    if (updatePortalEffects(f.phase, dt)) {
      f.phase.body.update(dt);
      f.phase.body.time = f.phase.ripples.time;
      f.hum -= dt;
      if (f.hum <= 0) {
        f.hum = 0.1 + Math.random() * 0.22;
        f.phase.ripples.pulse(o.minX + Math.random() * (o.maxX - o.minX), o.floorY + Math.random() * (o.ceilingY - o.floorY), 0);
      }
    }
    f.node.tick(dt);
    const w = factoryWalk, G = BL.factoryWindow.GLIDE;
    // The Factory's last frame dissolves away once the island has taken over.
    if (w.still > 0 && (w.hold -= dt) <= 0) w.still = Math.max(0, w.still - dt / G.dissolve);
    if (!player || entering || !BL.scenes.factory) { w.phase = 0; w.seen = false; w.settle = false; return; }
    if (w.settle) {
      const a = pilot.controls.read();
      if (player === w.cave && (a.x || a.y)) crew.steer(0, 0, 0, 0, 0);
      else w.settle = false;
    }
    const p = player.root.position, sr = Math.sin(m.ry), cr = Math.cos(m.ry), shield = BL.factoryModels.SHIELD_Z;
    const along = (p.x - m.x) * sr + (p.z - m.z) * cr, across = (p.x - m.x) * cr - (p.z - m.z) * sr;
    const feet = p.y - player.baseY - m.floorY;
    if (factoryHeld) {
      if (along > shield || along < shield - 2 || Math.abs(across) > 2.4 || feet < o.floorY - 0.12 || feet >= o.ceilingY) factoryHeld = false;
      return;
    }
    if (w.phase) return factoryGlide(dt, player, along, across, feet);
    // Heading in on its feet down the tunnel's last stretch, the walk takes the Ooga through; a jump (a view preset,
    // a respawn), further than a sprint goes in the frame, is no walk.
    const stepped = Math.hypot(p.x - w.x, p.z - w.z), inward = w.seen && stepped < Math.max(0.5, dt * 12) ? ((w.x - p.x) * sr + (w.z - p.z) * cr) / Math.max(dt, 1e-3) : 0;
    w.x = p.x; w.z = p.z; w.seen = true;
    if (along < shield + G.reach && along > shield && Math.abs(across) < o.maxX && Math.abs(feet - o.floorY) < 0.3 && inward > G.moving) {
      Object.assign(w, { phase: FACTORY_WALK_IN, cave: player, t: 0, through: false });
      pilot.controls.reset(); input.reset(); hud.tooltip.hide();
      return factoryGlide(dt, player, along, across, feet);
    }
    if (along > shield || along < shield - 2 || Math.abs(across) > 2.4 || feet < o.floorY - 0.12 || feet >= o.ceilingY) return;
    f.phase.ripples.pulse(across, p.y - m.floorY + 1, 0);
    // Through: still played, so the crew never stands it up and turns it back out to work, and it and the camera hold
    // where it crossed (the update stops after this) while the ripple spreads and the screen goes dark.
    entering = factoryDeparting = true;
    world.pilot = player.traits.name;
    f.snap = true;
    pilot.controls.reset(); input.reset(); pilot.setActive(false); hud.tooltip.hide();
    go("factory");
  };
  // The walk through the Factory's shield, in the third person, as the Timechain Sphere's doorway walks its visitor
  // through: after the pilot has read the visitor's input, the Ooga's steering is set aside for the walk's own, so it
  // walks itself down the tunnel's middle at an even pace while the view follows as always, swinging round behind it.
  // Going in, a step through the shield the factory takes over with an instant switch, the island's last frame held
  // over its first and dissolving away, with the same Ooga as far past its own shield and the view's pitch and distance
  // (`world.factoryCrossing`); on a page's first walk in, whose switch builds the whole hall, the Ooga stands a beat in
  // the shield first, so the switch lands on a still frame. Coming out (`arriveFromFactory`) the Ooga walks on out of
  // the mouth while the Factory's last frame dissolves. Anything else moving the Ooga, or a walk that runs long, lets go.
  const factoryGlide = (dt, player, along, across, feet) => {
    const w = factoryWalk, G = BL.factoryWindow.GLIDE, m = factoryMouth.mouth, p = player.root.position, o = pilot.orbit;
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry), shield = BL.factoryModels.SHIELD_Z, going = w.phase === FACTORY_WALK_IN;
    w.t += dt;
    const moved = Math.hypot(p.x - w.x, p.z - w.z);
    if (player !== w.cave || moved > 1.2 || w.t > G.limit || !going && along > OUT_WALK) {
      w.phase = 0; w.through = false; w.seen = false; w.settle = player === w.cave;
      crew.steer(0, 0, 0, 0, 0);
      return;
    }
    w.x = p.x; w.z = p.z;
    const to = along + (going ? -G.ahead : G.ahead), side = across * 0.4;
    const dx = m.x + sr * to + cr * side - p.x, dz = m.z + cr * to - sr * side - p.z, d = Math.hypot(dx, dz) || 1;
    crew.steer(dx / d, dz / d, 0, 1, 0, G.speed);
    const behind = going ? m.ry : m.ry + Math.PI;
    o.tYaw = o.yaw + Math.atan2(Math.sin(behind - o.yaw), Math.cos(behind - o.yaw));
    if (!going) return;
    if (!w.through && along <= shield) {
      w.through = true;
      factoryMouth.phase.ripples.pulse(across, feet + 1, 0);
      w.beat = world.factoryKeep ? 0 : G.beat;
    }
    // On a step past the shield, or as far as it gets.
    if (!w.through || along > shield - G.through && moved > 0.005) return;
    if (w.beat > 0) {
      w.beat -= dt;
      crew.steer(0, 0, 0, 0, 0);
      return;
    }
    // Through: still played, so the crew never stands it up and turns it back out to work. The island's meshes stay on
    // the GPU while the visit lasts (`world.islandKeep`), so walking back out uploads nothing, and this frame, once
    // drawn, is held over the factory's first (`grab`).
    world.factoryCrossing = { across, past: shield - along, pitch: o.pitch, dist: o.dist };
    world.islandKeep = islandMeshes();
    w.phase = 0;
    w.grab = true;
    crew.steer(0, 0, 0, 0, 0);
    entering = factoryDeparting = true;
    world.pilot = player.traits.name;
    factoryMouth.snap = true;
    pilot.controls.reset(); input.reset(); pilot.setActive(false); hud.tooltip.hide();
    // A switch the director refuses (another under way) puts it all back.
    if (!go("factory", null, true)) { world.factoryCrossing = world.islandKeep = null; stay(); }
  };
  // Back out of the Factory's shield: the Ooga at the mouth's rim facing out, as far across as it left, the view behind
  // it in the tunnel looking out, the Factory's last frame dissolving off it, and the walk on out of the mouth.
  const arriveFromFactory = (c) => {
    const m = factoryMouth.mouth, sr = Math.sin(m.ry), cr = Math.cos(m.ry), G = BL.factoryWindow.GLIDE, player = pilot.player;
    const pitch = clamp(c.pitch, FOLLOW.pitch[0], FOLLOW.pitch[1]), along = BL.factoryModels.SHIELD_Z + Math.max(c.past, FOLLOW.min * Math.cos(pitch) + 0.4);
    const across = clamp(c.across, -1.2, 1.2), x = m.x + sr * along + cr * across, z = m.z + cr * along - sr * across;
    pilot.navigate({ position: { x, y: m.floorY, z }, yaw: m.ry + Math.PI, pitch, dist: FOLLOW.min });
    const p = player.root.position;
    Object.assign(factoryWalk, { phase: FACTORY_WALK_OUT, cave: player, t: 0, x: p.x, z: p.z, seen: true, through: false, still: 1, hold: G.still });
  };
  // B.C.A.'s veil, in a banker's lamp amber, where the lab's stands, so the gorillas' suits show from where they cross.
  const BCA_TINT = [1, 0.78, 0.4], BCA_VEIL_Z = 0.5;
  const bcaVeil = (dt, elapsed) => {
    updatePortalEffects(bcaMouth.phase, dt);
    bcaMouth.office.update(dt);
  };
  // What the gorillas work B.C.A. by: the office's desks and wait spots, with the aisle the way in from its veil.
  const bcaOffice = () => {
    const o = bcaMouth.office;
    return { mouth: bcaMouth.mouth, stations: o.stations, waits: o.waits, entry: o.entry, entryAlong: o.entryAlong, aisleHalf: o.aisleHalf, walkway: o.walkway };
  };
  // ₿IFRÖST's field, in the chamber's blue.
  const BIFROST_TINT = [0.3, 0.62, 1];
  // ₿IFRÖST's field hums on its own as the factory's does, light runs along the bridge's deck and down the falls, and
  // Heimdall watches whoever comes: the played Ooga, else the view. The played Ooga walking through the field crosses into the chamber,
  // held where it crossed through the fade as at the factory.
  const bifrostGate = (dt, elapsed) => {
    const b = bifrostIsle, p = b.site.portal, o = p.opening, player = pilot.player;
    if (updatePortalEffects(b.phase, dt)) {
      b.phase.body.update(dt);
      b.phase.body.time = b.phase.ripples.time;
      b.hum -= dt;
      if (b.hum <= 0) {
        b.hum = 0.1 + Math.random() * 0.22;
        b.phase.ripples.pulse(o.minX + Math.random() * (o.maxX - o.minX), o.floorY + Math.random() * (o.ceilingY - o.floorY), 0);
      }
    }
    const at = player ? player.root.position : null, orbit = pilot.orbit;
    // The bridge glows under the played Ooga's feet.
    const head = b.site.cloud.head;
    b.effectsActive = !b.phase.paused || effectsActiveAt(head.x, b.site.walk.y, head.z, b.effectsActive, 24, 32);
    if (b.effectsActive) {
      b.effectsTime += dt;
      if (at) BL.bifrostIsle.update(b.site, dt, b.effectsTime, at.x, at.y - player.baseY, at.z);
      else BL.bifrostIsle.update(b.site, dt, b.effectsTime, NaN, NaN, NaN);
    }
    b.heimdall.update(dt, elapsed, at ? at.x : orbit.tx, at ? at.y - player.baseY : orbit.ty, at ? at.z : orbit.tz, !!player);
    if (!player || entering) return;
    const sr = Math.sin(p.ry), cr = Math.cos(p.ry);
    const along = (at.x - p.x) * sr + (at.z - p.z) * cr, across = (at.x - p.x) * cr - (at.z - p.z) * sr;
    const feet = at.y - player.baseY - p.floorY;
    if (along > p.fieldZ || along < p.fieldZ - 2 || Math.abs(across) > p.halfW || feet < o.floorY - 0.12 || feet >= o.ceilingY) return;
    b.phase.ripples.pulse(across, feet + 1, 0);
    entering = bifrostDeparting = true;
    world.pilot = player.traits.name;
    b.snap = true;
    pilot.controls.reset(); input.reset(); pilot.setActive(false); hud.tooltip.hide();
    go("bifrost");
  };
  // The Lightning Factory looks back out through its own end of this tunnel, so on the way in the island is
  // photographed once from the shield, looking out, while the screen is dark: the mouth's own dressing is hidden,
  // since the factory builds the tunnel and its lamps itself, and so is the Ooga walking in. What the factory can
  // see through its rim is cropped out, halved down to a small copy that its display blurs as it enlarges it, given
  // back the saturation the page's grade will add again, and misted a little, as seen through the shield.
  const FACTORY_VIEW = { width: 320, eye: 1.7, across: 0.82, up: 0.46, down: 0.5, colour: 0.83, mist: 0.12, haze: [206, 228, 238] };
  // ₿IFRÖST's chamber looks back out through its own field the same way, at a picture taken from the portal as the
  // Ooga walks in: the landing, Heimdall, the bridge and the island past it, misted in the field's blue.
  // The window into the chamber follows the eye, so it moves once the camera is final for the frame. It is built on the
  // first such frame the view could see it: within the window's reach (FAR) of the field's middle, measured here from
  // the portal's foot, which lies that much farther again from the field's middle.
  const updateBifrostWindow = (dt) => {
    const b = bifrostIsle, p = b.site.portal;
    if (!b.window && renderer.kind === "webgl2") {
      const W = BL.bifrostWindow, c = camera.position, dx = c.x - p.x, dy = c.y - p.floorY, dz = c.z - p.z, reach = W.FAR + Math.hypot(W.MIDDLE, p.fieldZ);
      if (dx * dx + dy * dy + dz * dz < reach * reach) b.window = W.create({ group: b.group, portal: p });
    }
    if (b.window) b.window.update(dt, camera, RENDER_OPTS, !b.phase.paused);
  };
  const BIFROST_VIEW = { ...FACTORY_VIEW, haze: [188, 208, 255] };
  const snapFactoryView = () => {
    const view = snapFromShield(factoryMouth.group, factoryMouth.mouth, BL.factoryModels.SHIELD_Z, FACTORY_VIEW);
    if (view) world.factoryView = view;
  };
  const snapBifrostView = () => {
    const view = snapFromShield(bifrostIsle.group, bifrostIsle.site.portal, bifrostIsle.site.portal.fieldZ, BIFROST_VIEW);
    if (view) world.bifrostView = view;
  };
  // A picture from a shield in `group` at `from` along its mouth's axis `m`, looking out, with the group and the Ooga
  // walking in hidden, cropped to `V` and graded: the record a scene hangs past its own end of the tunnel.
  const snapFromShield = (group, m, from, V) => {
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    const W = glCanvas.width, H = glCanvas.height, aspect = W / H, t = Math.max(V.up, V.down, V.across / aspect);
    const view = createCamera({ fov: 2 * Math.atan(t) * 180 / Math.PI, near: 0.2, far: camera.far });
    Object.assign(view.position, { x: m.x + sr * from, y: m.floorY + V.eye, z: m.z + cr * from });
    Object.assign(view.target, { x: view.position.x + sr, y: view.position.y, z: view.position.z + cr });
    const me = world.pilot ? crew.cavemen.get(world.pilot) : null, shown = !!me && me.root.visible;
    group.visible = false;
    if (me) me.root.visible = false;
    const drawn = renderer.render(root, view, { ...RENDER_OPTS, birdsEyeCutaway: false, cutawayFade: 0, cutawayMaxY: 1e6, cutawayRegionCount: 0 });
    group.visible = true;
    if (me) me.root.visible = shown;
    if (!drawn) return null;
    let src = glCanvas, sx = W / 2 * (1 - V.across / (t * aspect)), sy = H / 2 * (1 - V.up / t), sw = W - 2 * sx, sh = H / 2 * (V.up + V.down) / t;
    const w = V.width, h = Math.round(w * (V.up + V.down) / (2 * V.across));
    while (sw > w * 2) {
      const half = document.createElement("canvas");
      half.width = Math.ceil(sw / 2); half.height = Math.ceil(sh / 2);
      half.getContext("2d").drawImage(src, sx, sy, sw, sh, 0, 0, half.width, half.height);
      src = half; sx = sy = 0; sw = half.width; sh = half.height;
    }
    const out = document.createElement("canvas"), g = out.getContext("2d", { willReadFrequently: true });
    out.width = w; out.height = h;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const pixels = g.getImageData(0, 0, w, h), d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      for (let k = 0; k < 3; k++) d[i + k] = (l + (d[i + k] - l) * V.colour) * (1 - V.mist) + V.haze[k] * V.mist;
    }
    g.putImageData(pixels, 0, 0);
    const image = new Image();
    image.src = out.toDataURL("image/jpeg", 0.9);
    return { width: w, height: h, load: () => image, eye: V.eye, from, across: V.across, up: V.up, down: V.down };
  };
  // Whoever the visitor is playing goes in with them, as world.pilot; a scene that has a use for it
  // takes it on the way in.
  const enterCave = (slot) => {
    if (slot.scene === "lab") return;
    if (ghosts && ghosts.sealed) { hud.toast("The ghost walls hold every cave shut"); return; } // HALLOWEEN
    if (!slot.scene) { if (slot.place) navigate(slot.place); return; }
    if (entering) return;
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    enterScene(presets[slot.scene], slot.scene);
  };
  const selectDebugGorilla = (entry) => {
    if (entry && !DEBUG_GORILLA_MOVE && !DEBUG_GORILLA_RAGE) return false;
    if (DEBUG_GORILLA_RAGE && entry && !clankers.debugRage(entry)) return false;
    if (DEBUG_GORILLA_RAGE && debugSelectedGorilla && debugSelectedGorilla !== entry)
      clankers.debugRage(debugSelectedGorilla, false);
    if (debugSelectedGorilla) for (let i = 0; i < debugGorillaHighlights.length; i++) {
      debugSelectedGorilla.renderParts[i].highlight = debugGorillaHighlights[i];
    }
    debugGorillaHighlights.length = 0;
    debugSelectedGorilla = entry;
    if (entry && !DEBUG_GORILLA_RAGE) for (const part of entry.renderParts) {
      debugGorillaHighlights.push(part.highlight);
      part.highlight = 1;
    }
    return true;
  };
  const debugMovementPoint = (p) => {
    // Build only when a destination is clicked. Terrain partitions mutate
    // their face lists, so give those queries a fresh geometry snapshot.
    const picks = [], seen = new Set();
    const add = (node, terrain, mutable = false) => {
      if (!node.geometry?.faces.length || node.instanceData || node.cameraHidden || node.smokeOpacity === 0 || seen.has(node)) return;
      for (let parent = node.parent; parent; parent = parent.parent) if (parent.smokeOpacity === 0) return;
      seen.add(node);
      const pickNode = mutable ? createNode({
        parent: node,
        geometry: { ...node.geometry, faces: node.geometry.faces.slice() }
      }) : node;
      picks.push({ node: pickNode, owner: { terrain }, radius: 0 });
    };
    add(debugMovementTerrain, true);
    traverseVisible(terrainRampRoof.node, node => add(node, true, true));
    for (const section of terrainSections) traverseVisible(section.cap.node, node => add(node, true));
    for (const section of caveSections) traverseVisible(section.cap.node, node => add(node, true));
    traverseVisible(root, node => { if (solids.isActive(node)) add(node, false); });
    const picker = BL.weaponTargets.create(picks);
    renderer.ray(p.x, p.y, camera, TAP_RAY);
    let distance = 0;
    for (let i = 0; i < 64 && distance < camera.far; i++) {
      if (!picker.ray(DEBUG_MOVE_HIT, TAP_RAY.ox + TAP_RAY.dx * distance,
        TAP_RAY.oy + TAP_RAY.dy * distance, TAP_RAY.oz + TAP_RAY.dz * distance,
        TAP_RAY.dx, TAP_RAY.dy, TAP_RAY.dz, camera.far - distance)) return false;
      const geometry = DEBUG_MOVE_HIT.node.geometry;
      const ceiling = Math.min(geometry.clipMaxY ?? Infinity,
        geometry.cutawayPreserve ? Infinity : cutawayHeightAt(DEBUG_MOVE_HIT.x, DEBUG_MOVE_HIT.z));
      if (DEBUG_MOVE_HIT.y >= (geometry.clipMinY ?? -Infinity) - 0.03 && DEBUG_MOVE_HIT.y <= ceiling + 0.03) {
        DEBUG_MOVE_HIT.distance += distance;
        return true;
      }
      distance += DEBUG_MOVE_HIT.distance + 0.01;
    }
    return false;
  };
  const debugMovementTap = (hit, p) => {
    if ((!DEBUG_GORILLA_MOVE && !DEBUG_GORILLA_RAGE) || pilot.player || clankerPlay.active) return false;
    if (!debugSelectedGorilla && hit?.owner.kind !== "clanker") return false;
    const worldHit = debugMovementPoint(p);
    if (hit?.owner.kind === "clanker" && input.weaponTargets.ray(DEBUG_GORILLA_HIT,
      TAP_RAY.ox, TAP_RAY.oy, TAP_RAY.oz, TAP_RAY.dx, TAP_RAY.dy, TAP_RAY.dz,
      camera.far, null, debugGorillaTarget, true)
      && (!worldHit || DEBUG_GORILLA_HIT.distance < DEBUG_MOVE_HIT.distance + 0.02)) {
      const selected = selectDebugGorilla(DEBUG_GORILLA_HIT.owner.entry);
      hud.tooltip.hide();
      hud.toast(!selected ? "Gorilla cannot rage right now" : DEBUG_GORILLA_RAGE
        ? "Continuous rage · nearby Oogas targeted · Esc to stop"
        : "Gorilla selected · click a destination · Esc to deselect");
      return true;
    }
    if (!debugSelectedGorilla) return true;
    if (DEBUG_GORILLA_RAGE) return true;
    if (!worldHit) hud.toast("Click the ground, a ledge, or a wall");
    else if (clankers.debugMove(debugSelectedGorilla, DEBUG_MOVE_HIT.x, DEBUG_MOVE_HIT.y, DEBUG_MOVE_HIT.z, DEBUG_MOVE_HIT.normal)) hud.toast("Destination set");
    else hud.toast("Gorilla cannot take a movement order right now");
    return true;
  };
  const gorillaBehindBillboard = (hit, p) => {
    if (hit?.owner.kind !== "clanker" || !p || !mempoolIsland) return false;
    renderer.ray(p.x, p.y, camera, TAP_RAY);
    const part = hit.node.world;
    const depth = (part[12] - TAP_RAY.ox) * TAP_RAY.dx + (part[13] - TAP_RAY.oy) * TAP_RAY.dy + (part[14] - TAP_RAY.oz) * TAP_RAY.dz;
    return depth > 0 && mempoolIsland.billboardOccludes(TAP_RAY.ox, TAP_RAY.oy, TAP_RAY.oz,
      TAP_RAY.ox + TAP_RAY.dx * depth, TAP_RAY.oy + TAP_RAY.dy * depth, TAP_RAY.oz + TAP_RAY.dz * depth);
  };
  const onTap = (hit, p) => {
    if (factoryDeparting || bifrostDeparting || islandGuide.holding) return;
    if (gorillaBehindBillboard(hit, p)) return;
    if (debugMovementTap(hit, p)) return;
    if (!hit) return;
    const o = hit.owner;
    switch (o.kind) {
      case "tess":
        islandGuide.tap();
        break;
      case "halloween": // HALLOWEEN
        o.tap();
        break;
      case "caveman":
        crew.pokeCave(o.cave);
        break;
      case "piece":
        if (o.piece === "chalkboard") {
          const bounds = document.getElementById("scene").getBoundingClientRect();
          chalkboard.open({ x: bounds.left + p.x, y: bounds.top + p.y });
        }
        else pokePiece(o);
        break;
      case "clanker":
        hud.toast(tooltipFor(hit));
        break;
      case "crate":
        crates.openCrate(o.crate);
        break;
      case "cave":
        if (o.slot.status === "open") enterCave(o.slot);
        else hud.toast(tooltipFor(hit));
        break;
      case "cave-sign":
        window.open(`https://github.com/${o.repo}`, "_blank", "noopener,noreferrer");
        break;
      case "gate":
        hud.toast(tooltipFor(hit));
        break;
      case "room-sign":
        tapRoomSign(o.roomSign);
        break;
      case "sphere-key": {
        const gate = timechainIsland.gate, player = pilot.player, at = player && player.root.position;
        if (!player) hud.toast("Only an Ooga can go in. Double-tap one, then walk it up to the keypad.");
        else if (!gate.busy && !gate.nearKeypad(at.x, at.y - player.baseY + 1.1, at.z)) hud.toast("Walk up to the keypad beside the doors.");
        else {
          if (!gate.busy) gate.engage();
          gate.press(o.key);
        }
        break;
      }
      case "lab-link":
        window.open("https://entropylab.online", "_blank", "noopener,noreferrer");
        break;
      case "prop":
        useProp(o, p);
        break;
      default:
        break;
    }
  };

  const CAMERA_RADIUS = 0.3, CAMERA_FLOOR = 0.55, CAMERA_STEP_FLOOR = CAMERA_RADIUS + 0.02, CAMERA_VERTICAL_RATE = 3.2, CAMERA_HORIZONTAL_RATE = 8;
  const CAMERA_RECOVERY_SPEED = 16, CAMERA_TRAIL_CAPACITY = 96;
  const CAMERA_PREVIOUS = { x: 0, y: 0, z: 0 };
  const CAMERA_REQUESTED = { x: 0, y: 0, z: 0 };
  const CAMERA_FROM = { x: 0, y: 0, z: 0 };
  const CAMERA_VOLUME_FROM = { x: 0, y: 0, z: 0 };
  const COMBAT_CAMERA_HEAD = { x: 0, y: 0, z: 0 };
  const COMBAT_CAMERA_POINT = new Float64Array(3);
  const CAMERA_RECOVERY = { x: 0, y: 0, z: 0 };
  const CAMERA_MANUAL_VIEW = { x: 0, y: 0, z: 0 }, CAMERA_MANUAL_BODY = { x: 0, y: 0, z: 0 };
  const CAMERA_TRAIL = new Float64Array(CAMERA_TRAIL_CAPACITY * 3);
  let cameraTrailPlayer = null, cameraTrailCount = 0, cameraTrailNext = 0, cameraTrailSleeping = false, cameraManualContact = false;
  let cameraUnrestricted = false, cameraReentering = false;
  const PLAYER_PREVIOUS = { x: 0, y: 0, z: 0 }, PLAYER_POSITION = { x: 0, y: 0, z: 0 };
  const CAMERA_SPACE = { floor: 0, ceiling: 0 }, CAMERA_COLUMN = { caveIndex: 0, floor: 0, ceiling: 0 };
  const CAMERA_CROSSING = { direction: 0, valid: false, reason: null, amount: 0 };
  const CAMERA_OPENINGS = [];
  const CAMERA_RAMP_CELLS = new Map();
  const buildCameraRamps = () => {
    CAMERA_RAMP_CELLS.clear();
    const v = island.geometry.verts, unit = island.unit;
    const rampFaces = islandFaceIndex().ramps;
    for (let n = 0; n < rampFaces.length; n++) {
      const face = rampFaces[n];
      const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
      const key = Math.floor((v[a] + v[b] + v[c]) / (3 * unit)) * 512 + Math.floor((v[a + 2] + v[b + 2] + v[c + 2]) / (3 * unit));
      let faces = CAMERA_RAMP_CELLS.get(key);
      if (!faces) CAMERA_RAMP_CELLS.set(key, faces = []);
      faces.push(face);
    }
  };
  const playerOnAccessRamp = (player) => {
    if (!player || crew.sleeping) return false;
    const p = player.root.position, feet = p.y - player.baseY, v = island.geometry.verts, unit = island.unit, radius = PLAYER_RADIUS;
    for (let x = Math.floor((p.x - radius) / unit); x <= Math.floor((p.x + radius) / unit); x++) for (let z = Math.floor((p.z - radius) / unit); z <= Math.floor((p.z + radius) / unit); z++) {
      const faces = CAMERA_RAMP_CELLS.get(x * 512 + z);
      if (!faces) continue;
      for (const face of faces) {
        const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
        const ux = v[b] - v[a], uz = v[b + 2] - v[a + 2], vx = v[c] - v[a], vz = v[c + 2] - v[a + 2], det = ux * vz - uz * vx;
        let tx = p.x, tz = p.z;
        const u = ((tx - v[a]) * vz - (tz - v[a + 2]) * vx) / det, w = (ux * (tz - v[a + 2]) - uz * (tx - v[a])) / det;
        if (u < 0 || w < 0 || u + w > 1) {
          let distance = Infinity;
          for (let edge = 0; edge < 3; edge++) {
            const i = face.i[edge] * 3, j = face.i[(edge + 1) % 3] * 3, dx = v[j] - v[i], dz = v[j + 2] - v[i + 2];
            const t = Math.max(0, Math.min(1, ((p.x - v[i]) * dx + (p.z - v[i + 2]) * dz) / (dx * dx + dz * dz)));
            const ex = v[i] + dx * t, ez = v[i + 2] + dz * t, d = (p.x - ex) ** 2 + (p.z - ez) ** 2;
            if (d < distance) { distance = d; tx = ex; tz = ez; }
          }
          if (distance > radius * radius) continue;
        }
        const s = ((tx - v[a]) * vz - (tz - v[a + 2]) * vx) / det, t = (ux * (tz - v[a + 2]) - uz * (tx - v[a])) / det;
        const floor = v[a + 1] + s * (v[b + 1] - v[a + 1]) + t * (v[c + 1] - v[a + 1]);
        if (feet >= floor - STEP_MAX && feet + player.bodyHeight <= Math.min(floor + island.headquarters.ceiling - island.headquarters.floor, island.ceilingAt(p.x, floor + 1e-5, p.z, PLAYER_RADIUS)) + 1e-7) return true;
      }
    }
    // Basement access galleries become level before joining the common area.
    // Their flat floor is voxel-meshed, so it has no slope triangles.
    const basement = island.headquarters.basement;
    if (Math.hypot(p.x, p.z) > basement.room.radius && Math.abs(feet - basement.floor) <= STEP_MAX) for (const ramp of basement.ramps) {
      for (let i = 1; i < ramp.samples.length; i++) {
        const a = ramp.samples[i - 1], b = ramp.samples[i];
        if (a.y !== basement.floor || b.y !== basement.floor) continue;
        const dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        if (Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) > ramp.width / 2 + radius) continue;
        if (Math.abs(island.supportAt(p.x, p.z, feet, STEP_MAX, ABYSS_FLOOR, radius) - basement.floor) < 1e-6 && island.ceilingAt(p.x, feet, p.z, radius) >= feet + player.bodyHeight) return true;
      }
    }
    return false;
  };
  let cameraCaveIndex = 0, cameraEntranceIndex = 0, cameraPreviousValid = false, cameraTerrainY = 0, cameraTerrainX = 0, cameraTerrainZ = 0, cameraTerrainValid = false, cameraTerrainRecovering = false, cameraTerrainEntranceIndex = 0;
  let caveEntryPlayer = null, playerCaveIndex = 0;
  const cameraCrossing = (from, to, opening, grounded = false) => {
    const m = opening.mouth, sr = opening.sr, cr = opening.cr;
    const a = (from.x - m.x) * sr + (from.z - m.z) * cr - opening.planeZ;
    const b = (to.x - m.x) * sr + (to.z - m.z) * cr - opening.planeZ;
    const direction = a >= -1e-7 && b < -1e-7 ? 1 : a <= 1e-7 && b > 1e-7 ? -1 : 0;
    CAMERA_CROSSING.direction = direction;
    CAMERA_CROSSING.valid = false;
    CAMERA_CROSSING.reason = null;
    if (!direction) return CAMERA_CROSSING;
    const t = Math.max(0, Math.min(1, a / (a - b))), x = lerp(from.x, to.x, t), y = lerp(from.y, to.y, t) - m.floorY, z = lerp(from.z, to.z, t);
    const across = (x - m.x) * cr - (z - m.z) * sr;
    const floor = opening.headquarters && island.cavityAt(x, z, CAMERA_COLUMN, island.headquarters.caveIndex, y + m.floorY) ? CAMERA_COLUMN.floor - m.floorY - 1e-6 : opening.minY;
    // Feet follow the bend from the flat apron onto the slope.
    // Their straight frame-to-frame sweep cuts just below that bend even while fully supported.
    const followsRamp = grounded && opening.headquarters && Math.abs(from.y - supportAt(from.x, from.z, from.y)) < 1e-6 && Math.abs(to.y - supportAt(to.x, to.z, to.y)) < 1e-6;
    CAMERA_CROSSING.amount = t;
    if (y < floor && !followsRamp) CAMERA_CROSSING.reason = "below";
    else if (y > opening.maxY) CAMERA_CROSSING.reason = "above";
    else if (across < opening.minX || across > opening.maxX) CAMERA_CROSSING.reason = "beside";
    else if (opening.blocked) CAMERA_CROSSING.reason = "sealed";
    else if (caveColumnAt(x - sr * 0.05, z - cr * 0.05, opening, y + m.floorY)) CAMERA_CROSSING.valid = true;
    return CAMERA_CROSSING;
  };
  const setMatrixInside = (inside) => {
    if (!matrixCave) return;
    const portal = matrixCave.portal;
    if (portal.inside === inside) return;
    portal.inside = inside;
    portal.lastCrossingDirection = inside ? "in" : "out";
  };
  const respawnAtPile = () => {
    setMatrixInside(false);
    navigate("pile", true);
  };
  const updateMatrixControl = (dt, player) => {
    if (!matrixControl) return;
    const subject = player ? player.root.position : camera.position;
    const action = nearbyAction(subject.x, subject.y + (player ? 1.1 - player.baseY : 0), subject.z, player ? MATRIX_BUTTON_USE_REACH : MATRIX_BUTTON_REACH);
    const equipped = !!(player && player.jet);
    const recovering = !!(player && player.jetRecovering);
    if (action === matrixControl.promptAction && player === matrixControl.promptPlayer && equipped === matrixControl.promptJet && recovering === matrixControl.promptRecovering) return;
    const hadPlayerPrompt = matrixControl.promptAction && matrixControl.promptPlayer;
    matrixControl.promptAction = action;
    matrixControl.promptPlayer = player;
    matrixControl.promptJet = equipped;
    matrixControl.promptRecovering = recovering;
    if (action) {
      if (action === WAKE_ACTION) {
        hud.hint(COARSE ? "Tap WAKE UP! to get up" : "Space wakes up · WASD changes sleeping pose");
        hud.setAct("WAKE UP!");
      } else if (action === ROLL_ACTION) {
        hud.hint(COARSE ? "Tap DROP & ROLL! to put the fire out" : "Press Space to drop and roll until the fire goes out");
        hud.setAct("DROP & ROLL!");
      } else if (action === STAND_ACTION) {
        hud.hint(COARSE ? "Move or tap STAND UP! to get up" : "Move or press Space to stand up");
        hud.setAct("STAND UP!");
      } else if (action.kind === "bench") {
        hud.hint(COARSE ? "Tap SIT to sit facing the fire" : "Press Space to sit facing the fire");
        hud.setAct("SIT");
      } else if (action.sleep) {
        hud.hint(COARSE ? "Tap SLEEP to lie down" : "Press Space to sleep");
        hud.setAct("SLEEP");
      } else if (action === timechainIsland.gate.action) {
        hud.hint(COARSE ? "Tap USE KEYPAD to choose a room" : "Space · Use keypad to choose a room");
        hud.setAct("USE KEYPAD");
      } else {
        hud.hint(COARSE ? "Tap ENTER ARCADE to go in" : "Press Space to enter Ooga Arcade");
        if (player) hud.setAct("ENTER ARCADE");
      }
    } else if (hadPlayerPrompt || player) pilot.showAct();
  };
  const syncMatrixInside = (player) => {
    if (!matrixCave) return;
    if (clankerPlay?.active) {
      const p = clankerPlay.player.root.position, m = matrixCave.mouth;
      const dx = p.x - m.x, dz = p.z - m.z;
      const along = dx * matrixCave.sr + dz * matrixCave.cr;
      setMatrixInside(along < PORTAL_Z && p.y + 0.4 < m.floorY + PORTAL_MAX_Y
        && island.cavityAt(p.x, p.z, CLANKER_CAVITY, matrixCave.caveIndex, p.y + 0.4)
        && CLANKER_CAVITY.caveIndex === matrixCave.caveIndex
        && p.y + 0.4 >= CLANKER_CAVITY.floor && p.y + 0.4 < CLANKER_CAVITY.ceiling);
      return;
    }
    // A controlled Ooga owns the portal in both camera modes.
    // The first-person eye follows head-look and must not open/close the mirror while the body is still.
    if (player) {
      setMatrixInside(playerCaveIndex === matrixCave.caveIndex);
      return;
    }
    // The detached camera can keep a cave admission while orbiting above or
    // outside its mouth. Only its actual eye inside the room owns the portal.
    const eye = camera.position, m = matrixCave.mouth;
    const along = (eye.x - m.x) * matrixCave.sr + (eye.z - m.z) * matrixCave.cr;
    setMatrixInside(cameraCaveIndex === matrixCave.caveIndex && along < PORTAL_Z
      && eye.y < m.floorY + PORTAL_MAX_Y
      && island.cavityAt(eye.x, eye.z, MATRIX_CAMERA_COLUMN, matrixCave.caveIndex, eye.y)
      && MATRIX_CAMERA_COLUMN.caveIndex === matrixCave.caveIndex
      && eye.y >= MATRIX_CAMERA_COLUMN.floor && eye.y < MATRIX_CAMERA_COLUMN.ceiling
      && island.clearAt(eye.x, eye.y, eye.z, 1e-5, 2e-5));
  };
  const setCameraCave = (index) => {
    if (cameraCaveIndex === index) return;
    cameraCaveIndex = index;
    // Free-camera crossings have no character owner: commit portal state as soon as the crossing changes caves.
    // Character views sync after pilot.update, when the active eye or Ooga position is final.
    if (!pilot || !pilot.player) syncMatrixInside(null);
  };
  const caveColumnAt = (x, z, opening, y) => {
    const dx = x - opening.mouth.x, dz = z - opening.mouth.z;
    const along = dx * opening.sr + dz * opening.cr, across = dx * opening.cr - dz * opening.sr;
    const caveIndex = opening.headquarters ? island.headquarters.caveIndex : opening.caveIndex;
    if (!island.cavityAt(x, z, CAMERA_COLUMN, caveIndex, y) || CAMERA_COLUMN.caveIndex !== caveIndex) {
      // Rotated voxel columns straddle the doorway plane.
      // Uncarved, open-air apron cells there are still traversable; solid cliff columns are not.
      const ground = island.surfaceAt(x, z);
      if (along < opening.planeZ - island.unit * Math.SQRT2 || along > 3 || across < opening.minX || across > opening.maxX || ground !== opening.mouth.floorY) return false;
      CAMERA_COLUMN.floor = ground;
      CAMERA_COLUMN.ceiling = Infinity;
    }
    // A window can continue below an upper ramp after its room metadata ends.
    // A solid roof between the eye and that ramp makes it a different volume.
    if (opening.headquarters && y < CAMERA_COLUMN.floor && island.ceilingAt(x, y, z) <= CAMERA_COLUMN.floor) return false;
    // Ordinary cave frames have a soffit even where the carved voxel column
    // is open sky. HQ ramp mouths deliberately keep only their side jambs.
    const rim = opening.rim;
    if (along >= rim.minZ + PORTAL_Z && along <= rim.maxZ + PORTAL_Z && (!opening.headquarters || CAMERA_COLUMN.ceiling > opening.mouth.floorY)) {
      if (across < rim.minX || across > rim.maxX) return false;
      if (!opening.headquarters || along >= opening.planeZ) CAMERA_COLUMN.floor = Math.max(CAMERA_COLUMN.floor, opening.mouth.floorY + rim.floorY);
      if (!opening.headquarters) CAMERA_COLUMN.ceiling = Math.min(CAMERA_COLUMN.ceiling, opening.mouth.floorY + rim.ceilingY);
    }
    CAMERA_COLUMN.caveIndex = opening.caveIndex;
    return true;
  };
  // Sample the real quarter-unit cavity around the eye, including the open apron.
  // Bounds ignore Matrix state and cliff-top height; eye height separates a lowered room from the ramp.
  const cameraSpaceAt = (x, z, opening, y) => {
    let floor = -Infinity, ceiling = Infinity;
    for (let i = 0; i < 25; i++) {
      const ox = (i % 5 - 2) * CAMERA_RADIUS * 0.5, oz = (Math.floor(i / 5) - 2) * CAMERA_RADIUS * 0.5;
      if (ox * ox + oz * oz > CAMERA_RADIUS * CAMERA_RADIUS + 1e-7) continue;
      const sx = x + ox, sz = z + oz;
      if (!caveColumnAt(sx, sz, opening, y)) return false;
      floor = Math.max(floor, CAMERA_COLUMN.floor);
      ceiling = Math.min(ceiling, CAMERA_COLUMN.ceiling);
    }
    CAMERA_SPACE.floor = floor + (pilot && pilot.player ? lerp(CAMERA_RADIUS, CAMERA_FLOOR, pilot.closeMix) : CAMERA_FLOOR);
    // Clearance samples can miss a voxel corner: match the full collision footprint so a roof lowers the eye first.
    // An open shaft has no floor: look above the eye, not at rock in the island's underside.
    const base = (Number.isFinite(CAMERA_SPACE.floor) ? CAMERA_SPACE.floor : y) - CAMERA_RADIUS;
    CAMERA_SPACE.ceiling = Math.min(ceiling, island.ceilingAt(x, base, z, CAMERA_RADIUS), entranceCeilingAt(x, z, base, CAMERA_RADIUS)) - CAMERA_RADIUS;
    return CAMERA_SPACE.floor <= CAMERA_SPACE.ceiling;
  };
  const CAMERA_CAVE_DEBUG = {
    get index() { return cameraCaveIndex; },
    get playerIndex() { return playerCaveIndex; },
    get entranceIndex() { return cameraEntranceIndex; },
    get accessRamp() { return playerOnAccessRamp(pilot && pilot.player); },
    get rampAssist() { return false; },
    get transitioning() { return cameraReentering; },
    get constraint() { return cameraCaveIndex ? "interior" : cameraEntranceIndex ? "entrance" : "exterior"; },
    get id() { return cameraCaveIndex ? CAMERA_OPENINGS[cameraCaveIndex - 1].id : null; },
    openings: CAMERA_OPENINGS,
    contains(x, y, z) {
      return !!cameraCaveIndex && caveColumnAt(x, z, CAMERA_OPENINGS[cameraCaveIndex - 1], y) && y >= CAMERA_COLUMN.floor && y < CAMERA_COLUMN.ceiling;
    }
  };
  // The common HQ room belongs to both ramps.
  // Once a body or eye reaches a ramp, bind it to that ramp's entrance, not the seeding arrival's.
  const headquartersOpeningAt = (x, z, clearance) => {
    if (Math.hypot(x, z) < island.headquarters.room.radius - 1.25) return null;
    let nearest = null, nearestDistance = Infinity;
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const opening = CAMERA_OPENINGS[i];
      if (!opening.ramp) continue;
      const samples = opening.ramp.samples;
      for (let n = 0; n < samples.length; n++) {
        const dx = x - samples[n].x, dz = z - samples[n].z, distance = dx * dx + dz * dz;
        if (distance < nearestDistance) { nearestDistance = distance; nearest = opening; }
      }
    }
    return nearest && nearestDistance <= (nearest.ramp.width / 2 + clearance) ** 2 ? nearest : null;
  };
  const updatePlayerCave = (player) => {
    if (!player) {
      caveEntryPlayer = null;
      playerCaveIndex = 0;
      return;
    }
    const p = player.root.position;
    setVec(PLAYER_POSITION, p.x, p.y - player.baseY, p.z);
    if (caveEntryPlayer !== player) {
      caveEntryPlayer = player;
      playerCaveIndex = 0;
    } else {
      if (playerCaveIndex && CAMERA_OPENINGS[playerCaveIndex - 1].headquarters) {
        const rampOpening = headquartersOpeningAt(p.x, p.z, PLAYER_RADIUS);
        if (rampOpening) playerCaveIndex = rampOpening.caveIndex;
      }
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const opening = CAMERA_OPENINGS[i], crossing = cameraCrossing(PLAYER_PREVIOUS, PLAYER_POSITION, opening, player.hop === 0);
        if (!crossing.valid) continue;
        if (!playerCaveIndex && crossing.direction > 0) playerCaveIndex = opening.caveIndex;
        else if (playerCaveIndex && crossing.direction < 0 && (playerCaveIndex === opening.caveIndex || CAMERA_OPENINGS[playerCaveIndex - 1].headquarters && opening.headquarters)) playerCaveIndex = 0;
      }
      if (playerCaveIndex && (!caveColumnAt(p.x, p.z, CAMERA_OPENINGS[playerCaveIndex - 1], PLAYER_POSITION.y) || PLAYER_POSITION.y < CAMERA_COLUMN.floor - 1e-6 || PLAYER_POSITION.y >= CAMERA_COLUMN.ceiling)) playerCaveIndex = 0;
    }
    // Exterior windows are physical entrances too.
    // Movement already checked the body against rock; bind its layer without a main-ramp doorway crossing.
    if (!playerCaveIndex && island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, PLAYER_POSITION.y) && PLAYER_POSITION.y >= CAMERA_COLUMN.floor - 1e-6 && PLAYER_POSITION.y + player.bodyHeight <= CAMERA_COLUMN.ceiling && physicalClearAt(p.x, PLAYER_POSITION.y + 1e-5, p.z, PLAYER_RADIUS, player.bodyHeight - 1e-5)) {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) if (CAMERA_OPENINGS[i].headquarters) {
        playerCaveIndex = CAMERA_OPENINGS[i].caveIndex;
        break;
      }
    }
    // An Ooga taken over where it already stands in a cave never crossed the mouth: bind it by the carved column
    // under its feet, once it is behind that cave's doorway plane (the mouth's columns reach out onto the apron).
    if (!playerCaveIndex && island.cavityAt(p.x, p.z, CAMERA_COLUMN, 0, PLAYER_POSITION.y) && CAMERA_COLUMN.caveIndex !== island.headquarters.caveIndex && PLAYER_POSITION.y >= CAMERA_COLUMN.floor - 1e-6 && PLAYER_POSITION.y + player.bodyHeight <= CAMERA_COLUMN.ceiling) {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const opening = CAMERA_OPENINGS[i];
        if (opening.caveIndex !== CAMERA_COLUMN.caveIndex) continue;
        if (!opening.blocked && !opening.headquarters && (p.x - opening.mouth.x) * opening.sr + (p.z - opening.mouth.z) * opening.cr - opening.planeZ < -PLAYER_RADIUS) playerCaveIndex = opening.caveIndex;
        break;
      }
    }
    setVec(PLAYER_PREVIOUS, PLAYER_POSITION.x, PLAYER_POSITION.y, PLAYER_POSITION.z);
  };
  // Destination placement is explicit travel, not a sweep across the island in between.
  // Validate the arrival volumes, then seed that location's own history.
  const navigationClearAt = (x, y, z, radius, height) => {
    if (!physicalClearAt(x, y, z, radius, height)) return false;
    for (const prop of props) {
      if (!prop.active || prop.prop === "gate" || prop.prop === "bifrostgate" || prop.prop === "bifrostbridge" || prop.prop === "timechainbridge" || !prop.node.geometry) continue;
      const b = BL.scene.boundsOf(prop.node.geometry), m = prop.node.world;
      const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      const hx = (b.max[0] - b.min[0]) / 2, hy = (b.max[1] - b.min[1]) / 2, hz = (b.max[2] - b.min[2]) / 2;
      const wx = m[0] * cx + m[4] * cy + m[8] * cz + m[12], wy = m[1] * cx + m[5] * cy + m[9] * cz + m[13], wz = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
      const ex = Math.abs(m[0]) * hx + Math.abs(m[4]) * hy + Math.abs(m[8]) * hz, ey = Math.abs(m[1]) * hx + Math.abs(m[5]) * hy + Math.abs(m[9]) * hz, ez = Math.abs(m[2]) * hx + Math.abs(m[6]) * hy + Math.abs(m[10]) * hz;
      if (y >= wy + ey || y + height <= wy - ey) continue;
      const dx = Math.max(0, Math.abs(x - wx) - ex), dz = Math.max(0, Math.abs(z - wz) - ez);
      if (dx * dx + dz * dz < radius * radius) return false;
    }
    return true;
  };
  const navigate = (name, respawn = false, preserveActor = !respawn) => {
    const destination = NAVIGATION, p = destination.position, target = destination.target;
    const gorilla = preserveActor && clankerPlay.active ? clankerPlay.player : null, ooga = pilot.player, player = gorilla || ooga;
    const travel = preserveActor && !!player, controller = gorilla ? clankerPlay : pilot;
    const close = gorilla ? clankerPlay.firstPerson : pilot.closeWanted, basement = name === "basement", underground = name === "underground" || basement;
    if (travel) {
      const refusal = controller.travelRefusal() || name !== "pile" && ghosts && ghosts.refuseTravel(); // HALLOWEEN: ghosts
      if (refusal) { hud.toast(refusal); return refusal; }
    }
    const randomPile = respawn && name === "pile";
    let x = 0, z = 0, yaw = 0, pitch = 0.18, dist = player ? 6 : 8;
    if (name === "pile") {
      z = Math.max(5, altar.platformRadius + 1.3);
      setVec(target, 0, ALTAR_HEIGHT + Math.max(0.4, pile.pileEdge() * 0.3), 0);
      pitch = player ? FOLLOW.view.pitch : 0.28;
      dist = player ? FOLLOW.view.dist : Math.max(10, z + 4);
    } else if (name === "gate") {
      // Eye-level arrivals view the arch from the foot of the steps; a trailing camera pulls back from the landing.
      // Neither arrival puts a standing body across the narrow stair treads.
      x = island.gate.x; z = island.gate.z + (close ? 6.75 : 0.75);
      setVec(target, island.gate.x, GATE_VIEW.target.y, island.gate.z);
      pitch = player ? 0 : 0.2;
      dist = player ? 10 : 12;
    } else if (name === "lab" || name === "mirror" || name === "factory" || name === "arcade" || name === "bca") {
      const id = name === "lab" ? "c11" : name === "factory" ? "c2" : name === "arcade" ? "c3" : name === "bca" ? "c10" : "c1", m = island.mouths.find((mouth) => mouth.id === id);
      yaw = m.ry;
      // Leave enough distance to frame the sign above the mouth, including
      // arrivals viewed from the controlled character's first-person eye.
      const approach = close ? 10 : 8;
      x = m.x + Math.sin(yaw) * approach; z = m.z + Math.cos(yaw) * approach;
      setVec(target, m.x, m.floorY + (close ? 2.5 : 2.1), m.z);
      pitch = player ? 0.06 : 0.16;
      dist = player ? 8 : 12;
    } else if (name === "timechain" && timechainIsland) {
      // On the bridge, square to the closed doors with the keypad in reach; a free view looks at them from further out.
      const T = timechainIsland, site = T.place;
      yaw = site.ry;
      x = T.worldX(0.4, 15.4); z = T.worldZ(0.4, 15.4);
      setVec(target, T.worldX(0.4, 12.7), site.y + 2.1, T.worldZ(0.4, 12.7));
      pitch = player ? 0.1 : 0.06;
      dist = player ? 5 : 9;
    } else if (name === "bifrost" && bifrostIsle) {
      // Down the stairs from ₿IFRÖST's gate: an Ooga walks on out toward the bridge and the island, seen from over the
      // gate's flight behind it (far enough back that the view keeps its pitch and clears the terraces); a free view looks
      // back at the gate.
      const a = bifrostIsle.site.arrival, q = bifrostIsle.site.portal, out = player ? 10 : 0;
      x = a.x; z = a.z; yaw = a.yaw;
      setVec(target, (player ? a.x : q.x) + Math.sin(a.yaw) * out, player ? a.y + 1.4 : q.floorY + 2.2, (player ? a.z : q.z) + Math.cos(a.yaw) * out);
      pitch = player ? 0.28 : 0.12;
      dist = player ? 6 : 11;
    } else if (name === "mempool" && mempoolIsland) {
      // The chamber under the lake: on its floor before the first painting, the shaft and the membrane behind.
      const M = mempoolIsland, floor = M.place.y + M.layout.FLOOR;
      yaw = M.place.ry + Math.PI;
      x = M.worldX(0, 7.4); z = M.worldZ(0, 7.4);
      setVec(target, M.worldX(0, M.layout.CHAMBER_R - 0.1), floor + 2.3, M.worldZ(0, M.layout.CHAMBER_R - 0.1));
      pitch = player ? 0.1 : 0.06;
      dist = player ? 5 : 7.5;
    } else if (underground) {
      z = 6;
      setVec(target, 0, (basement ? island.headquarters.basement.floor : island.headquarters.floor) + 0.8, 0);
      pitch = player ? 0.4 : 0.15;
      dist = player ? 6 : 8;
    } else { hud.toast("That destination is unavailable."); return "That destination is unavailable."; }
    BL.scene.updateWorld(root);
    let found = false;
    // Mouth approaches and the Bifrost stair foot need room on both axes:
    // a wide body can overlap the whole arrival row but fit farther forward.
    const depths = name === "lab" || name === "mirror" || name === "factory" || name === "bca" || name === "bifrost" ? NAVIGATION_DEPTHS : NAVIGATION_SAME_DEPTH;
    if (randomPile) { PILE_ARRIVAL_SEARCH.next = 0; PILE_ARRIVAL_SEARCH.angle = Math.random() * Math.PI * 2; }
    const arrivals = randomPile ? 192 : depths.length * NAVIGATION_SIDES.length;
    for (let arrival = 0; arrival < arrivals; arrival++) {
      const depth = randomPile ? 0 : depths[Math.floor(arrival / NAVIGATION_SIDES.length)], offset = NAVIGATION_SIDES[arrival % NAVIGATION_SIDES.length];
      // Keep searching when a clear body point has a blocked camera: each pile candidate is tried
      // once, through the whole bounded ring scan, instead of restarting a few random samples.
      if (randomPile) { if (!pileRespawnSpot(player, p, false, PILE_ARRIVAL_SEARCH)) break; }
      else {
        p.x = x + Math.cos(yaw) * offset + Math.sin(yaw) * depth;
        p.z = z - Math.sin(yaw) * offset + Math.cos(yaw) * depth;
        p.y = name === "timechain" ? timechainIsland.place.y + BL.timechainModels.SITE.bridgeFloor : name === "mempool" ? mempoolIsland.place.y + mempoolIsland.layout.FLOOR : name === "bifrost" ? bifrostIsle.site.arrival.y : underground ? (basement ? island.headquarters.basement.floor : island.headquarters.floor) : island.surfaceAt(p.x, p.z);
      }
      if (name !== "timechain" && name !== "bifrost" && name !== "mempool" && !island.onLand(p.x, p.z)) continue;
      if (player) {
        const floor = gorilla ? clankerSupportAt(gorilla, p.x, p.z, p.y, STEP_MAX) : playerSupportAt(p.x, p.z, p.y, p.y, player);
        if (!Number.isFinite(floor) || Math.abs(floor - p.y) > STEP_MAX) continue;
        p.y = floor;
      }
      const radius = gorilla ? Math.max(BL.clankers.WALK_RADIUS, gorilla.gorilla.bodyRadius + 0.1) : Math.max(PLAYER_RADIUS, player?.bodyRadius || 0);
      const height = gorilla ? Math.max(BL.agent.LAB_HEIGHT, BL.clankers.WALK_HEIGHT, gorilla.gorilla.bodyHeight + 0.04) : player ? player.bodyHeight : 1.6;
      if (!navigationClearAt(p.x, p.y + 1e-5, p.z, radius, height)) continue;
      if (gorilla && !clankerCylinderClear(p.x, p.y, p.z, p.x, p.y, p.z, radius, height, gorilla)) continue;
      if (travel) {
        let occupied = false;
        for (const other of crew.list) {
          if (other === player || !other.root.visible) continue;
          const q = other.root.position, feet = q.y - other.baseY;
          if (p.y < feet + other.bodyHeight && p.y + height > feet && Math.hypot(p.x - q.x, p.z - q.z) < radius + other.bodyRadius) { occupied = true; break; }
        }
        if (occupied) continue;
        if (!gorilla && clankers) for (const entry of clankers.list) {
          if (entry.active && !clankerBodySegmentClear(entry, p.x, p.y + 1e-5, p.z, p.x, p.y + 1e-5, p.z, radius, height)) { occupied = true; break; }
        }
        if (occupied) continue;
        const outside = remotes?.actors();
        if (outside) for (const q of outside) {
          if (p.y < q.y + q.height && p.y + height > q.y && Math.hypot(p.x - q.x, p.z - q.z) < radius + q.radius) { occupied = true; break; }
        }
        if (occupied) continue;
      }
      destination.yaw = Math.atan2(p.x - target.x, p.z - target.z);
      destination.pitch = !travel && close ? Math.atan2(p.y + (player ? player.headOffset * CLOSE_VIEW.eyeRatio : CLOSE_VIEW.eyeHeight) - target.y, Math.hypot(p.x - target.x, p.z - target.z)) : pitch;
      const arrivalDist = dist + depth;
      destination.dist = arrivalDist;
      let eyeX, eyeY, eyeZ;
      if (travel) {
        const from = player.root.position;
        eyeX = camera.position.x + p.x - from.x;
        eyeY = camera.position.y + p.y - from.y + (gorilla ? 0 : player.baseY);
        eyeZ = camera.position.z + p.z - from.z;
      } else if (close) {
        eyeX = p.x - (player ? Math.sin(destination.yaw) * CLOSE_VIEW.eyeForward : 0);
        eyeY = p.y + (player ? player.headOffset * CLOSE_VIEW.eyeRatio : CLOSE_VIEW.eyeHeight);
        eyeZ = p.z - (player ? Math.cos(destination.yaw) * CLOSE_VIEW.eyeForward : 0);
      } else {
        let viewPitch = pitch;
        if (player) { const t = Math.max(0, Math.min(1, (CLOSE_VIEW.trailingDist - arrivalDist) / (CLOSE_VIEW.trailingDist - DIST_MIN))); viewPitch *= 1 - t * t * (3 - 2 * t); }
        eyeX = (player ? p.x : target.x) + Math.sin(destination.yaw) * Math.cos(viewPitch) * arrivalDist;
        eyeY = (player ? p.y + FOLLOW.y : target.y) + Math.sin(viewPitch) * arrivalDist;
        eyeZ = (player ? p.z : target.z) + Math.cos(destination.yaw) * Math.cos(viewPitch) * arrivalDist;
      }
      if (!navigationClearAt(eyeX, eyeY - CAMERA_RADIUS, eyeZ, CAMERA_RADIUS, CAMERA_RADIUS * 2)) continue;
      setVec(CAMERA_PREVIOUS, eyeX, eyeY, eyeZ);
      if (!travel) setVec(camera.position, eyeX, eyeY, eyeZ);
      found = true;
      break;
    }
    if (!found) {
      const refusal = "That arrival is blocked. Choose another destination.";
      if (!randomPile) hud.toast(refusal);
      return refusal;
    }
    if (travel && !controller.travel(p)) return "That character cannot travel right now.";
    if (!travel && clankerPlay.active) clankerPlay.release();
    if (enteringTween) { enteringTween.alive = false; enteringTween = null; }
    entering = false;
    cameraPreviousValid = cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = cameraEntranceIndex = cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = ooga;
    const index = underground ? CAMERA_OPENINGS.find((opening) => opening.headquarters).caveIndex : 0;
    playerCaveIndex = ooga ? index : 0;
    setCameraCave(index);
    setVec(PLAYER_PREVIOUS, p.x, p.y, p.z);
    setVec(PLAYER_POSITION, p.x, p.y, p.z);
    if (!travel) pilot.navigate(destination);
    if (ooga && ooga.jet && !jetpackAllowed(ooga)) {
      crew.removeJetpack(ooga);
      pilot.showAct();
    }
    syncMatrixInside(ooga);
    hud.setDetachedView(name, true, player ? player.root.position : close ? camera.position : pilot.orbit.target);
    hud.tooltip.hide();
    return true;
  };
  const updateAreaLabel = () => {
    const gorilla = clankerPlay.active ? clankerPlay.player : null, player = gorilla || pilot.player;
    const p = player ? player.root.position : pilot.closeWanted ? camera.position : pilot.orbit.target;
    const feet = p.y - (gorilla ? 0 : player ? player.baseY : pilot.closeWanted ? CLOSE_VIEW.eyeHeight : 0);
    let area = "HUB";
    if (timechainIsland && onSphere(p.x, p.z)) area = "SPHERE";
    else if (mempoolIsland && mempoolIsland.overAt(p.x, p.z)) area = mempoolIsland.coveredAt(p.x, feet + 0.5, p.z) ? "MEMPOOL" : "RAINFOREST";
    else {
      const hq = island.headquarters, y = feet + 0.08;
      if (island.cavityAt(p.x, p.z, AREA_COLUMN, hq.caveIndex, y) && AREA_COLUMN.caveIndex === hq.caveIndex
        && y >= AREA_COLUMN.floor - STEP_MAX && y < AREA_COLUMN.ceiling) area = feet < (hq.floor + hq.basement.floor) / 2 ? "B1" : "HQ";
      else if (island.cavityAt(p.x, p.z, AREA_COLUMN, 0, y) && y >= AREA_COLUMN.floor - STEP_MAX && y < AREA_COLUMN.ceiling) {
        const id = CAMERA_OPENINGS[AREA_COLUMN.caveIndex - 1]?.id;
        if (id === "c2") area = "LF";
        else if (id === "c11") area = "LAB";
        else if (id === "c10") area = "BCA";
      }
    }
    hud.setAreaLabel(area, p);
  };
  // Keep navigation within the world's horizontal extent.
  // An orbit's focal point may pass through the island, independently of its displayed eye.
  const clampTarget = (t) => {
    const r = Math.hypot(t.x, t.z);
    if (r > FLY_BOUND) {
      t.x *= FLY_BOUND / r;
      t.z *= FLY_BOUND / r;
    }
  };
  let exteriorEntranceIndex = 0, exteriorCeiling = Infinity;
  const exteriorCameraFloorAt = (x, y, z, clearance, smoothStep, closeMix, undergroundAir = false) => {
    const physicalFloor = island.surfaceAt(x, z);
    let floor = (smoothStep ? lerp(island.smoothSupportAt(x, z, physicalFloor, STEP_MAX), physicalFloor, closeMix) : physicalFloor) + clearance;
    exteriorEntranceIndex = 0;
    exteriorCeiling = Infinity;
    const player = pilot.player;
    // A jumping face can extend past the ledge while its feet are still over land.
    // Clearance is measured from the abyss there; keep the body-anchored eye and let swept rock constrain it.
    if (player && closeMix > 0.5 && (player.hop > 1e-5 || Math.abs(player.hopV) > 1e-5)) return -Infinity;
    if (player && (abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY) || !playerCaveIndex && player.root.position.y - player.baseY < island.surfaceAt(player.root.position.x, player.root.position.z) - STEP_MAX)) return -Infinity;
    if (!player && pilot.freeFalling && abyssAt(x, z, y - CLOSE_VIEW.eyeHeight)) return -Infinity;
    if (undergroundAir && y < physicalFloor && cameraClearAt(x, y, z)) {
      exteriorCeiling = island.ceilingAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS) - CAMERA_RADIUS;
      return island.onLand(x, z) ? island.supportAt(x, z, y - CAMERA_RADIUS, 0, ABYSS_FLOOR) + CAMERA_RADIUS : -Infinity;
    }
    for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
      const entry = CAMERA_OPENINGS[i], dx = x - entry.mouth.x, dz = z - entry.mouth.z;
      if (entry.blocked) continue;
      const along = dx * entry.sr + dz * entry.cr, across = dx * entry.cr - dz * entry.sr;
      if (along < entry.planeZ - 1e-7 || along > 3 || across < entry.minX + CAMERA_RADIUS || across > entry.maxX - CAMERA_RADIUS || y < entry.mouth.floorY || y > entry.mouth.floorY + entry.maxY) continue;
      const k = (along - entry.planeZ) / (3 - entry.planeZ);
      exteriorEntranceIndex = entry.caveIndex;
      // The lower headquarters can lie beneath the outdoor apron.
      // Only the threshold-height tunnel may constrain an eye approaching from outside.
      const entranceColumn = caveColumnAt(x, z, entry, y) && CAMERA_COLUMN.ceiling > entry.mouth.floorY;
      floor = (entranceColumn ? CAMERA_COLUMN.floor : physicalFloor) + CAMERA_FLOOR + (clearance - CAMERA_FLOOR) * k * k * (3 - 2 * k);
      if (entranceColumn && cameraSpaceAt(x, z, entry, y)) exteriorCeiling = CAMERA_SPACE.ceiling;
      break;
    }
    return floor;
  };
  const cameraClearAt = (x, y, z) => physicalClearAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS, CAMERA_RADIUS * 2);
  // The carved throat can extend beyond room-ownership columns; it is still HQ while rock encloses it.
  // Match the whole eye footprint at the sloping edge of an exterior window floor.
  const headquartersWindowAirAt = (x, y, z) => y < -CAMERA_RADIUS && cameraClearAt(x, y, z) && island.ceilingAt(x, y - CAMERA_RADIUS, z, CAMERA_RADIUS) < Infinity && island.supportAt(x, z, y - CAMERA_RADIUS, 0, ABYSS_FLOOR, CAMERA_RADIUS) > ABYSS_FLOOR;
  // Exact frame contacts can occur between the ordinary terrain substeps.
  const ENTRANCE_SWEEP = new Float64Array(14);
  const entranceSegmentClear = (x, y, z, toX, toY, toZ, radius = CAMERA_RADIUS) => {
    const dx = toX - x, dy = toY - y, dz = toZ - z, span2 = dx * dx + dz * dz;
    for (let i = 0; i < headquarters.entrances.length; i++) {
      const entry = headquarters.entrances[i], node = entry.node;
      if (Math.min(y, toY) - radius >= entry.maxY || Math.max(y, toY) + radius <= entry.minY) continue;
      const k = span2 ? Math.max(0, Math.min(1, ((node.position.x - x) * dx + (node.position.z - z) * dz) / span2)) : 0;
      const ox = x + dx * k - node.position.x, oz = z + dz * k - node.position.z, reach = entry.radius + radius;
      if (ox * ox + oz * oz > reach * reach) continue;
      const lx = (x - node.position.x) * entry.cr - (z - node.position.z) * entry.sr, lz = (x - node.position.x) * entry.sr + (z - node.position.z) * entry.cr;
      const vx = dx * entry.cr - dz * entry.sr, vz = dx * entry.sr + dz * entry.cr, boxes = node.geometry.collisionBoxes, scale = node.scale.x;
      const q = ENTRANCE_SWEEP;
      q[0] = lx; q[1] = y - node.position.y - radius; q[2] = lz; q[3] = vx; q[4] = dy; q[5] = vz; q[6] = radius; q[7] = radius * 2;
      for (let j = 0; j < boxes.length; j += 6) {
        q[8] = boxes[j] * scale; q[9] = boxes[j + 1]; q[10] = boxes[j + 2];
        q[11] = boxes[j + 3] * scale; q[12] = boxes[j + 4]; q[13] = boxes[j + 5];
        if (!terrain.segmentBoxQueryClear(q)) return false;
      }
    }
    return true;
  };
  const cameraSegmentClear = (x, y, z, toX, toY, toZ) => cameraClearAt(toX, toY, toZ) && island.voxelSegmentClearAt(x, y - CAMERA_RADIUS, z, toX, toY - CAMERA_RADIUS, toZ, CAMERA_RADIUS, CAMERA_RADIUS * 2) && entranceSegmentClear(x, y, z, toX, toY, toZ) && bedSegmentClear(x, y - CAMERA_RADIUS, z, toX, toY - CAMERA_RADIUS, toZ, CAMERA_RADIUS, CAMERA_RADIUS * 2);
  const sleepEyeFloorAt = (player) => player.bedroll.y + (player.bedroll.sleep?.pillowTop || 0) + CAMERA_RADIUS;
  const cameraHeadAt = (out, player) => {
    if (crew.sleeping) {
      const head = player.sleepHead;
      // A resting head replaces the upright boom anchor.
      // Keep the eye volume above the actual pillow while the face rolls toward the sheet.
      setVec(out, head.x, Math.max(head.y, sleepEyeFloorAt(player)), head.z);
    } else {
      const p = player.root.position;
      setVec(out, p.x, p.y - player.baseY + player.headOffset * CLOSE_VIEW.eyeRatio, p.z);
    }
  };
  const combatCameraUnderground = (player, gorilla) => {
    const p = player.root.position, feet = p.y - (gorilla ? 0 : player.baseY);
    return mempoolIsland.overAt(p.x, p.z, -1) ? mempoolIsland.coveredAt(p.x, feet + 0.5, p.z) : feet < -STEP_MAX;
  };
  const combatCameraSegmentClear = (a, x, y, z) => {
    if (!cameraSegmentClear(a.x, a.y, a.z, x, y, z)
      || !solids.segmentClear(a.x, a.y - CAMERA_RADIUS, a.z, x, y - CAMERA_RADIUS, z, CAMERA_RADIUS, CAMERA_RADIUS * 2)) return false;
    // The voxel sweep excludes rendered ramp prisms. Sample their actual
    // camera volume as the ordinary close-camera sweep does.
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.hypot(x - a.x, y - a.y, z - a.z) / (island.unit * 0.5))));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!island.clearAt(lerp(a.x, x, t), lerp(a.y, y, t) - CAMERA_RADIUS, lerp(a.z, z, t), CAMERA_RADIUS, CAMERA_RADIUS * 2)) return false;
    }
    return true;
  };
  const combatCameraAnchor = (player, gorilla) => {
    const p = player.root.position, a = COMBAT_CAMERA_HEAD, feet = p.y - (gorilla ? 0 : player.baseY);
    if (gorilla) {
      const head = player.gorilla.parts.head, bounds = BL.scene.boundsOf(head.geometry);
      updateWorld(player.root, player.root.parent.world);
      math.mat4.transformPoint(COMBAT_CAMERA_POINT, head.world, bounds.center[0], bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.65, bounds.max[2] + 0.01);
      setVec(a, COMBAT_CAMERA_POINT[0], COMBAT_CAMERA_POINT[1], COMBAT_CAMERA_POINT[2]);
    } else setVec(a, p.x, feet + player.headOffset * 0.95 + player.viewLift, p.z);
    if (combatCameraSegmentClear(a, a.x, a.y, a.z)) return true;
    // A posed head can press against a roof. Search only the actor's standing
    // volume, never bisect from an origin already embedded in stone.
    const top = a.y;
    for (let i = 1; i <= 4; i++) {
      setVec(a, p.x, lerp(top, feet + CAMERA_RADIUS + 0.05, i / 4), p.z);
      if (combatCameraSegmentClear(a, a.x, a.y, a.z)) return true;
    }
    return false;
  };
  const combatCameraReady = (player, gorilla) => combatCameraAnchor(player, gorilla)
    && combatCameraSegmentClear(COMBAT_CAMERA_HEAD, camera.position.x, camera.position.y, camera.position.z);
  const constrainCombatCamera = (player, eye, progress, gorilla = false, target = null, aimPoint = null) => {
    if (!combatCameraUnderground(player, gorilla)) return false;
    if (!combatCameraAnchor(player, gorilla)) return true;
    const head = COMBAT_CAMERA_HEAD;
    if (combatCameraSegmentClear(head, eye.x, eye.y, eye.z)) return true;
    // A clear shoulder target preserves the gorilla's selected aim ray while
    // shortening its boom. Otherwise approach the safe body anchor.
    const from = target && combatCameraSegmentClear(head, target.x, target.y, target.z) ? target : head;
    const dx = eye.x - from.x, dy = eye.y - from.y, dz = eye.z - from.z;
    let low = 0, high = 1;
    for (let i = 0; i < 10; i++) {
      const t = (low + high) * 0.5, x = from.x + dx * t, y = from.y + dy * t, z = from.z + dz * t;
      if (combatCameraSegmentClear(from, x, y, z) && combatCameraSegmentClear(head, x, y, z)) low = t;
      else high = t;
    }
    // The existing entry blend keeps the descending camera continuous. Once
    // it settles, its eye is wholly inside the proven clear prefix.
    const t = progress >= 1 ? low : 1 - Math.max(0, progress) * (1 - low);
    setVec(eye, from.x + dx * t, from.y + dy * t, from.z + dz * t);
    if (target && from === head && aimPoint) setVec(target, aimPoint.x, aimPoint.y, aimPoint.z);
    return true;
  };
  const enterFreeCameraView = (eye) => {
    if (cameraClearAt(eye.x, eye.y, eye.z)) return false;
    // A low orbit focus may overlap a walkable prop or the ground: lift the eye over that support first.
    // A pile focus must not recover to HQ just because its platform became solid.
    const floor = playerSupportAt(eye.x, eye.z, eye.y), raisedY = floor + CLOSE_VIEW.eyeHeight;
    if (floor <= eye.y && raisedY > eye.y && cameraClearAt(eye.x, raisedY, eye.z)) {
      eye.y = raisedY;
      return false;
    }
    // A free orbit can be inside stone: enter walking view from the nearest clear authored circulation point.
    // Then approach the requested eye as far as its real floor and swept camera volume permit.
    const points = headquarters.sleepNavigation.points;
    let best = Infinity, found = false;
    for (const point of points) {
      const y = playerSupportAt(point.x, point.z, point.y) + CLOSE_VIEW.eyeHeight;
      const distance = (point.x - eye.x) ** 2 + (y - eye.y) ** 2 + (point.z - eye.z) ** 2;
      if (distance >= best || !cameraClearAt(point.x, y, point.z)) continue;
      best = distance; found = true;
      setVec(CAMERA_RECOVERY, point.x, y, point.z);
    }
    if (!found) throw new Error("No clear free-camera entry");
    const x = CAMERA_RECOVERY.x, y = CAMERA_RECOVERY.y, z = CAMERA_RECOVERY.z;
    const count = Math.max(1, Math.min(1024, Math.ceil(Math.sqrt(best) / (island.unit * 0.5))));
    for (let i = 1; i <= count; i++) {
      const t = i / count, nx = lerp(x, eye.x, t), nz = lerp(z, eye.z, t), requestedY = lerp(y, eye.y, t);
      const ny = Math.max(requestedY, playerSupportAt(nx, nz, requestedY - CLOSE_VIEW.eyeHeight) + CLOSE_VIEW.eyeHeight);
      if (!cameraSegmentClear(CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z, nx, ny, nz)) break;
      setVec(CAMERA_RECOVERY, nx, ny, nz);
    }
    setVec(eye, CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z);
    setVec(CAMERA_PREVIOUS, eye.x, eye.y, eye.z);
    setVec(CAMERA_REQUESTED, eye.x, eye.y, eye.z);
    let index = 0;
    if (island.cavityAt(eye.x, eye.z, CAMERA_COLUMN, island.headquarters.caveIndex, eye.y) && eye.y >= CAMERA_COLUMN.floor && eye.y <= CAMERA_COLUMN.ceiling) {
      index = CAMERA_COLUMN.caveIndex;
      if (index === island.headquarters.caveIndex) for (const opening of CAMERA_OPENINGS) if (opening.headquarters) { index = opening.caveIndex; break; }
    }
    setCameraCave(index);
    cameraPreviousValid = true;
    cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    return true;
  };
  const releaseCameraView = (player, eye) => {
    if (cameraClearAt(eye.x, eye.y, eye.z)) return false;
    const p = player.root.position, feet = p.y - player.baseY;
    const floor = playerSupportAt(p.x, p.z, feet), roof = ceilingAt(p.x, p.z, Math.max(floor, feet) + 1e-5) - CAMERA_RADIUS;
    setVec(eye, p.x, Math.min(roof, Math.max(feet + player.headOffset * 0.95, floor + CLOSE_VIEW.eyeHeight)), p.z);
    setVec(CAMERA_PREVIOUS, eye.x, eye.y, eye.z);
    setVec(CAMERA_REQUESTED, eye.x, eye.y, eye.z);
    setCameraCave(playerCaveIndex);
    cameraPreviousValid = true;
    cameraTerrainValid = cameraTerrainRecovering = cameraManualContact = false;
    cameraUnrestricted = cameraReentering = false;
    return true;
  };
  const sweepCameraVolume = (from, p, slide) => {
    const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
    const steps = Math.max(1, Math.min(1024, Math.ceil(Math.hypot(dx, dy, dz) / (island.unit * 0.5))));
    let x = from.x, y = from.y, z = from.z, slid = false;
    for (let i = 0; i < steps; i++) {
      const sx = x + dx / steps, sy = y + dy / steps, sz = z + dz / steps;
      if (cameraSegmentClear(x, y, z, sx, sy, sz)) { x = sx; y = sy; z = sz; continue; }
      if (!slide) {
        let lo = 0, hi = 1;
        for (let n = 0; n < 10; n++) {
          const k = (lo + hi) / 2;
          if (cameraSegmentClear(x, y, z, x + dx / steps * k, y + dy / steps * k, z + dz / steps * k)) lo = k;
          else hi = k;
        }
        x += dx / steps * lo; y += dy / steps * lo; z += dz / steps * lo;
        break;
      }
      slid = true;
      if (dy && cameraSegmentClear(x, y, z, x, sy, z)) y = sy;
      if (cameraSegmentClear(x, y, z, sx, y, sz)) { x = sx; z = sz; }
      else {
        if (dx && cameraSegmentClear(x, y, z, sx, y, z)) x = sx;
        if (dz && cameraSegmentClear(x, y, z, x, y, sz)) z = sz;
      }
    }
    setVec(p, x, y, z);
    if (slid) {
      // A bent slide can leave a clear endpoint whose displayed diagonal cuts the stone.
      // Lower before entering a lintel; leave it before rising.
      sweepCameraVolume(from, p, false);
      if (Math.abs(y - from.y) > 1e-7 && Math.hypot(p.x - x, p.y - y, p.z - z) > 1e-5) {
        const rising = y > from.y;
        setVec(p, rising ? x : from.x, rising ? from.y : y, rising ? z : from.z);
        sweepCameraVolume(from, p, false);
        if (Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z) < 1e-5) {
          setVec(p, rising ? from.x : x, rising ? y : from.y, rising ? from.z : z);
          sweepCameraVolume(from, p, false);
        }
      }
    }
  };
  const followCameraMotion = (p, player, dt, directView, smoothStep, closeMix, requestedStep, falling = false) => {
    cameraHeadAt(CAMERA_VOLUME_FROM, player);
    const body = CAMERA_VOLUME_FROM, y = body.y;
    const previous = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1) % CAMERA_TRAIL_CAPACITY * 3;
    const moved = cameraTrailCount ? Math.hypot(body.x - CAMERA_TRAIL[previous], y - CAMERA_TRAIL[previous + 1], body.z - CAMERA_TRAIL[previous + 2]) : Infinity;
    // A fast fall can travel farther than one unit in a frame.
    // Only reset for travel beyond the body's actual speed, so low-rate falls still sweep.
    const sleeping = crew.sleeping;
    // Standing changes the head anchor without teleporting the Ooga.
    // Retain the last eye and sweep that transition around nearby room corners.
    const reset = player !== cameraTrailPlayer || sleeping === cameraTrailSleeping && moved > Math.max(1, (Math.abs(player.hopV) + pilotMod.WALK.speed) * dt + 0.5);
    cameraTrailSleeping = sleeping;
    if (reset) { cameraTrailPlayer = player; cameraTrailCount = cameraTrailNext = 0; }
    if (reset || moved >= 0.125) {
      const at = cameraTrailNext * 3;
      CAMERA_TRAIL[at] = body.x; CAMERA_TRAIL[at + 1] = y; CAMERA_TRAIL[at + 2] = body.z;
      cameraTrailNext = (cameraTrailNext + 1) % CAMERA_TRAIL_CAPACITY;
      cameraTrailCount = Math.min(CAMERA_TRAIL_CAPACITY, cameraTrailCount + 1);
    }
    if (reset || !cameraPreviousValid) return;
    const distance = Math.hypot(p.x - CAMERA_PREVIOUS.x, p.y - CAMERA_PREVIOUS.y, p.z - CAMERA_PREVIOUS.z);
    // Preserve the authored close-view blend and first-person pose; ease the extra correction once the eye clears.
    // Clamp height separately so it never eats the horizontal follow budget, then sweep the full segment.
    const travel = Math.max(CAMERA_RECOVERY_SPEED * dt, closeMix > 0 ? requestedStep : 0);
    const amount = directView ? 1 : Math.min(1, travel / Math.max(distance, 1e-7));
    p.x = lerp(CAMERA_PREVIOUS.x, p.x, amount);
    // Falling follows the body's speed while a newly exposed boom eases its remaining correction.
    // A cliff contact must not release a height snap.
    const verticalTravel = Math.max(CAMERA_RECOVERY_SPEED, Math.abs(player.hopV)) * dt;
    p.y = falling && !directView ? Math.max(CAMERA_PREVIOUS.y - verticalTravel, Math.min(CAMERA_PREVIOUS.y + verticalTravel, p.y)) : lerp(CAMERA_PREVIOUS.y, p.y, amount);
    p.z = lerp(CAMERA_PREVIOUS.z, p.z, amount);
    if (smoothStep && !directView) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, p.y));
    if (cameraReentering) {
      // A room view may begin inside solid rock: ease it into the corridor.
      // Only then does a sweep have a physically clear starting volume.
      if (cameraClearAt(p.x, p.y, p.z) && cameraSegmentClear(body.x, body.y, body.z, p.x, p.y, p.z)) cameraReentering = false;
      return;
    }
    const wantedX = p.x, wantedY = p.y, wantedZ = p.z;
    sweepCameraVolume(CAMERA_PREVIOUS, p, true);
    if (Math.hypot(p.x - wantedX, p.y - wantedY, p.z - wantedZ) < 1e-4) return;
    // Dragging an exterior view into rock is not an Ooga rounding a corner.
    // Keep that wall contact instead of following its trail into the cave.
    if (directView) return true;
    // The last clear boom can bend around a doorway as its Ooga turns.
    // Follow the newest visible trail point rather than cutting the wall or re-pushing the same corner.
    let reached = cameraTrailCount;
    for (let i = 0; i < cameraTrailCount; i++) {
      const at = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1 - i) % CAMERA_TRAIL_CAPACITY * 3;
      setVec(CAMERA_RECOVERY, CAMERA_TRAIL[at], CAMERA_TRAIL[at + 1], CAMERA_TRAIL[at + 2]);
      sweepCameraVolume(CAMERA_PREVIOUS, CAMERA_RECOVERY, false);
      if (Math.hypot(CAMERA_RECOVERY.x - CAMERA_TRAIL[at], CAMERA_RECOVERY.y - CAMERA_TRAIL[at + 1], CAMERA_RECOVERY.z - CAMERA_TRAIL[at + 2]) > 1e-4) continue;
      reached = i;
      const span = Math.hypot(CAMERA_RECOVERY.x - CAMERA_PREVIOUS.x, CAMERA_RECOVERY.y - CAMERA_PREVIOUS.y, CAMERA_RECOVERY.z - CAMERA_PREVIOUS.z);
      if (span < 1e-5) break;
      const k = Math.min(1, CAMERA_RECOVERY_SPEED * dt / Math.max(span, 1e-7));
      p.x = lerp(CAMERA_PREVIOUS.x, CAMERA_RECOVERY.x, k);
      p.y = lerp(CAMERA_PREVIOUS.y, CAMERA_RECOVERY.y, k);
      p.z = lerp(CAMERA_PREVIOUS.z, CAMERA_RECOVERY.z, k);
      if (smoothStep) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, p.y));
      sweepCameraVolume(CAMERA_PREVIOUS, p, true);
      if (Math.hypot(p.x - CAMERA_PREVIOUS.x, p.y - CAMERA_PREVIOUS.y, p.z - CAMERA_PREVIOUS.z) > 1e-5) return;
      break;
    }
    // A boom can enter a side passage the Ooga never walked: slide a short, fully swept step along the trail.
    // Revisiting older points after reaching a corner would make the eye walk backward.
    for (let i = reached - 1; i >= 0; i--) {
      const at = (cameraTrailNext + CAMERA_TRAIL_CAPACITY - 1 - i) % CAMERA_TRAIL_CAPACITY * 3;
      const dx = CAMERA_TRAIL[at] - CAMERA_PREVIOUS.x, dy = CAMERA_TRAIL[at + 1] - CAMERA_PREVIOUS.y, dz = CAMERA_TRAIL[at + 2] - CAMERA_PREVIOUS.z;
      const span = Math.hypot(dx, dy, dz), k = Math.min(1, CAMERA_RECOVERY_SPEED * dt / Math.max(span, 1e-7));
      setVec(CAMERA_RECOVERY, CAMERA_PREVIOUS.x + dx * k, CAMERA_PREVIOUS.y + dy * k, CAMERA_PREVIOUS.z + dz * k);
      if (smoothStep) CAMERA_RECOVERY.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * dt, Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * dt, CAMERA_RECOVERY.y));
      sweepCameraVolume(CAMERA_PREVIOUS, CAMERA_RECOVERY, true);
      if (Math.hypot(CAMERA_TRAIL[at] - CAMERA_RECOVERY.x, CAMERA_TRAIL[at + 1] - CAMERA_RECOVERY.y, CAMERA_TRAIL[at + 2] - CAMERA_RECOVERY.z) >= span - 1e-4) continue;
      setVec(p, CAMERA_RECOVERY.x, CAMERA_RECOVERY.y, CAMERA_RECOVERY.z);
      return;
    }
  };
  // Below the home island's surface: flying under it, or down in its rooms. The Mempool island's tunnels and
  // chamber lie lower than the home island's ground too, and are neither: its own rock encloses the view there.
  const belowHome = (player) => {
    const p = player.root.position, feet = p.y - player.baseY;
    return feet < island.surfaceAt(p.x, p.z) - STEP_MAX && !mempoolIsland.coveredAt(p.x, feet + 0.5, p.z);
  };
  const clampCamera = (p, closeMix = 0, closeClearance = CLEARANCE, smoothStep = false, dt = 0, resetSmooth = false, directView = false, freeMove = false, preserveExitAngle = false) => {
    const requestedX = p.x, requestedY = p.y, requestedZ = p.z;
    const player = pilot && pilot.player;
    const combatClose = player && pilot.aiming && !pilot.birdsEye
      && constrainCombatCamera(player, p, pilot.shoulderEntryMix);
    if (!combatClose && cameraUnrestricted && player && closeMix > 0 && !preserveExitAngle && !(pilot.birdsEyeMix > 0)) {
      cameraHeadAt(CAMERA_VOLUME_FROM, player);
      cameraReentering = !cameraClearAt(CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z) || !cameraSegmentClear(CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z, CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z);
      cameraUnrestricted = false;
      CAMERA_TRAIL[0] = CAMERA_VOLUME_FROM.x; CAMERA_TRAIL[1] = CAMERA_VOLUME_FROM.y; CAMERA_TRAIL[2] = CAMERA_VOLUME_FROM.z;
      cameraTrailPlayer = player; cameraTrailCount = cameraTrailNext = 1; cameraTrailSleeping = crew.sleeping;
    }
    // Orbit views retain their chosen pose everywhere.
    // A close-view dolly starting in rock keeps its authored path to the final head position.
    if (combatClose || pilot?.birdsEyeMix > 0 || preserveExitAngle || closeMix === 0 || cameraReentering && closeMix < 1) {
      if (pilot?.birdsEyeMix > 0 || preserveExitAngle || closeMix === 0) { cameraUnrestricted = true; cameraReentering = false; }
      cameraManualContact = false;
      let index = 0;
      const owner = player ? playerCaveIndex : cameraCaveIndex;
      const preferred = owner && CAMERA_OPENINGS[owner - 1].headquarters ? island.headquarters.caveIndex : owner;
      if (island.cavityAt(p.x, p.z, CAMERA_COLUMN, preferred, p.y) && p.y >= CAMERA_COLUMN.floor && p.y < CAMERA_COLUMN.ceiling) {
        if (CAMERA_COLUMN.caveIndex === island.headquarters.caveIndex) {
          for (const opening of CAMERA_OPENINGS) if (opening.headquarters && (!index || opening.caveIndex === playerCaveIndex)) index = opening.caveIndex;
        } else index = CAMERA_COLUMN.caveIndex;
      }
      setCameraCave(index); cameraEntranceIndex = 0;
      cameraTerrainValid = cameraTerrainRecovering = false;
      camera.near = 0.1;
      setVec(CAMERA_PREVIOUS, p.x, p.y, p.z);
      setVec(CAMERA_REQUESTED, requestedX, requestedY, requestedZ);
      cameraPreviousValid = true;
      return false;
    }
    cameraReentering = false;
    if (!player) cameraUnrestricted = false;
    const exteriorFlight = player && (abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY) || !playerCaveIndex && belowHome(player));
    if (exteriorFlight) smoothStep = false;
    if (cameraManualContact && player === cameraTrailPlayer && cameraPreviousValid && !directView && closeMix === 0) {
      const body = player.root.position;
      if (Math.hypot(body.x - CAMERA_MANUAL_BODY.x, body.y - CAMERA_MANUAL_BODY.y, body.z - CAMERA_MANUAL_BODY.z) < 1e-7 && Math.hypot(pilot.orbit.yaw - CAMERA_MANUAL_VIEW.x, pilot.orbit.pitch - CAMERA_MANUAL_VIEW.y, pilot.orbit.dist - CAMERA_MANUAL_VIEW.z) < 1e-7) {
        // Hold the selected view when input and body movement have stopped.
        // Includes an exterior orbit whose Ooga is inside the doorway.
        setVec(p, CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z);
        return true;
      }
    }
    cameraManualContact = false;
    const requestedStep = Math.hypot(p.x - CAMERA_REQUESTED.x, p.y - CAMERA_REQUESTED.y, p.z - CAMERA_REQUESTED.z);
    setVec(CAMERA_REQUESTED, requestedX, requestedY, requestedZ);
    if (cameraCaveIndex && CAMERA_OPENINGS[cameraCaveIndex - 1].headquarters) {
      const rampOpening = headquartersOpeningAt(p.x, p.z, CAMERA_RADIUS);
      if (rampOpening) setCameraCave(rampOpening.caveIndex);
    }
    const previousCaveIndex = cameraCaveIndex;
    const undergroundAir = (freeMove || player && belowHome(player)) && (CAMERA_PREVIOUS.y < -CAMERA_RADIUS || previousCaveIndex && CAMERA_OPENINGS[previousCaveIndex - 1].headquarters);
    const clearance = lerp(player ? CAMERA_RADIUS : CLEARANCE, Math.max(smoothStep ? CAMERA_STEP_FLOOR : CAMERA_FLOOR, closeClearance), closeMix);
    let opening = cameraCaveIndex ? CAMERA_OPENINGS[cameraCaveIndex - 1] : null, start = 0, exit = false;
    setVec(CAMERA_FROM, CAMERA_PREVIOUS.x, CAMERA_PREVIOUS.y, CAMERA_PREVIOUS.z);
    // Physical first-person placement follows the character's actual layer.
    const followOpening = playerCaveIndex ? CAMERA_OPENINGS[playerCaveIndex - 1] : null;
    const followBoom = player && closeMix > 0;
    if (followBoom) {
      opening = followOpening;
      cameraHeadAt(CAMERA_FROM, player);
      if (opening && cameraSpaceAt(CAMERA_FROM.x, CAMERA_FROM.z, opening, CAMERA_FROM.y)) CAMERA_FROM.y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, CAMERA_FROM.y));
    }
    if (cameraPreviousValid) {
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const candidate = CAMERA_OPENINGS[i], crossing = cameraCrossing(CAMERA_FROM, p, candidate);
        if (matrixCave && candidate.caveIndex === matrixCave.caveIndex && crossing.reason) {
          const rejected = matrixCave.portal.rejected, reason = crossing.reason;
          rejected[reason] = Math.min(0x7fffffff, rejected[reason] + 1);
        }
        if (crossing.reason === "sealed" && crossing.direction > 0) {
          const fromAlong = (CAMERA_FROM.x - candidate.mouth.x) * candidate.sr + (CAMERA_FROM.z - candidate.mouth.z) * candidate.cr;
          const toAlong = (p.x - candidate.mouth.x) * candidate.sr + (p.z - candidate.mouth.z) * candidate.cr;
          const k = Math.max(0, Math.min(1, (fromAlong - candidate.stopZ) / (fromAlong - toAlong)));
          p.x = lerp(CAMERA_FROM.x, p.x, k);
          p.y = lerp(CAMERA_FROM.y, p.y, k);
          p.z = lerp(CAMERA_FROM.z, p.z, k);
        }
        if (!crossing.valid) continue;
        if (!opening && crossing.direction > 0) {
          opening = candidate;
          start = crossing.amount;
        } else if (opening && crossing.direction < 0 && (opening === candidate || opening.headquarters && candidate.headquarters)) {
          opening = candidate;
          exit = true;
        }
      }
    }
    if (opening) {
      const fromX = lerp(CAMERA_FROM.x, p.x, start), fromY = lerp(CAMERA_FROM.y, p.y, start), fromZ = lerp(CAMERA_FROM.z, p.z, start);
      const dx = p.x - fromX, dy = p.y - fromY, dz = p.z - fromZ;
      const steps = Math.max(1, Math.min(768, Math.ceil(Math.hypot(dx, dz) / (island.unit * 0.5))));
      let x = CAMERA_FROM.x, y = CAMERA_FROM.y, z = CAMERA_FROM.z, outside = false, accepted = false;
      for (let i = 0; i <= steps; i++) {
        const k = i / steps, sx = i ? x + dx / steps : fromX, sz = i ? z + dz / steps : fromZ;
        const along = (sx - opening.mouth.x) * opening.sr + (sz - opening.mouth.z) * opening.cr;
        if (cameraCaveIndex && along > opening.planeZ + 1e-7 && (!opening.headquarters || exit)) {
          if (exit) outside = true;
          break;
        }
        if (!cameraSpaceAt(sx, sz, opening, y)) {
          // Windows are real openings through the island shell.
          // Their clear air need not have room-ownership metadata to be traversable.
          if ((freeMove || player) && opening.headquarters && cameraClearAt(sx, fromY + dy * k, sz)) {
            x = sx; y = fromY + dy * k; z = sz;
            accepted = true;
            continue;
          }
          // Project blocked free movement onto each remaining axis; the accepted point keeps shallow wall tangents.
          // A follow boom stops at its first obstruction to keep line of sight.
          if (!i || followBoom || !freeMove && !player) break;
          if (cameraSpaceAt(sx, z, opening, y)) {
            x = sx;
            y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
          }
          if (cameraSpaceAt(x, sz, opening, y)) {
            z = sz;
            y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
          }
          continue;
        }
        if (cameraCaveIndex && opening.headquarters && along > opening.planeZ + 1e-7 && CAMERA_SPACE.ceiling > opening.mouth.floorY) break;
        accepted = true;
        x = sx; z = sz;
        y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, fromY + dy * k));
      }
      if (outside) setCameraCave(0);
      else {
        p.x = x; p.y = y; p.z = z;
        const along = (x - opening.mouth.x) * opening.sr + (z - opening.mouth.z) * opening.cr;
        if (accepted) {
          if ((freeMove || player) && opening.headquarters && (!island.cavityAt(x, z, CAMERA_COLUMN, island.headquarters.caveIndex, y) || y < CAMERA_COLUMN.floor + CAMERA_RADIUS || y > CAMERA_COLUMN.ceiling - CAMERA_RADIUS) && !headquartersWindowAirAt(x, y, z)) setCameraCave(0);
          else if (along < opening.planeZ - 1e-7) setCameraCave(opening.caveIndex);
        }
      }
    }
    let caveView = !!cameraCaveIndex;
    if (freeMove && closeMix > 0.5) {
      // Resolve eye-level support at the accepted horizontal position.
      // A requested point inside a wall must not lift the eye to that wall's top.
      const floor = playerSupportAt(p.x, p.z, CAMERA_PREVIOUS.y - CLOSE_VIEW.eyeHeight);
      const eye = floor + CLOSE_VIEW.eyeHeight;
      if (opening && cameraSpaceAt(p.x, p.z, opening, p.y)) p.y = Math.max(CAMERA_SPACE.floor, Math.min(CAMERA_SPACE.ceiling, pilot.freeFalling ? Math.max(p.y, eye) : eye));
    }
    cameraEntranceIndex = 0;
    if (!cameraCaveIndex) {
      const floor = exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix, undergroundAir);
      cameraEntranceIndex = exteriorEntranceIndex;
      p.y = Math.min(p.y, exteriorCeiling);
      p.y = Math.max(p.y, floor);
    }
    // Walking smooths terrain steps, but entering first person already has an authored blend.
    // Rate-limiting its first half stores an error released as a visible jump halfway through.
    if (smoothStep && closeMix === 0 && !caveView) {
      const moved = Math.hypot(p.x - cameraTerrainX, p.z - cameraTerrainZ);
      const verticalStep = CAMERA_VERTICAL_RATE * Math.min(dt, 0.05);
      const horizontalStep = CAMERA_HORIZONTAL_RATE * Math.min(dt, 0.05);
      if (!cameraTerrainValid || resetSmooth || directView) {
        cameraTerrainY = p.y;
        cameraTerrainRecovering = false;
      } else {
        const targetY = p.y;
        if (targetY > cameraTerrainY + verticalStep) {
          cameraTerrainY += verticalStep;
          cameraTerrainRecovering = true;
        } else if (targetY < cameraTerrainY) cameraTerrainY = Math.max(targetY, cameraTerrainY - verticalStep);
        else cameraTerrainY = targetY;
        if ((cameraEntranceIndex || cameraTerrainEntranceIndex) && moved > horizontalStep) cameraTerrainRecovering = true;
        if (cameraTerrainRecovering && moved > horizontalStep) {
          const k = horizontalStep / moved, x = lerp(cameraTerrainX, p.x, k), z = lerp(cameraTerrainZ, p.z, k);
          if (exteriorCameraFloorAt(x, cameraTerrainY, z, clearance, smoothStep, closeMix) <= cameraTerrainY + 1e-7) {
            p.x = x;
            p.z = z;
          } else {
            p.x = cameraTerrainX;
            p.z = cameraTerrainZ;
          }
        }
        if (cameraTerrainRecovering && moved <= horizontalStep && Math.abs(cameraTerrainY - targetY) <= 1e-7) cameraTerrainRecovering = false;
      }
      p.y = cameraTerrainY;
      exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix);
      cameraEntranceIndex = exteriorEntranceIndex;
      p.y = Math.min(p.y, exteriorCeiling);
      cameraTerrainX = p.x;
      cameraTerrainZ = p.z;
      cameraTerrainEntranceIndex = cameraEntranceIndex;
      cameraTerrainValid = true;
    } else {
      cameraTerrainValid = false;
      cameraTerrainRecovering = false;
      cameraTerrainEntranceIndex = 0;
    }
    if (cameraPreviousValid && freeMove) {
      // Raising clearance over a cliff must not jump the eye through its side.
      // Sweep the whole eye volume, incl. outdoor voxel corners; let the blocked horizontal slide while rising.
      if (!caveView) p.y = Math.min(p.y, Math.max(requestedY, CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * Math.min(dt, 0.05)));
      if (caveView && closeMix <= 0.5 && p.y < requestedY) p.y = Math.max(p.y, CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * Math.min(dt, 0.05));
      if (closeMix > 0.5 && !pilot.freeFalling) p.y = Math.max(CAMERA_PREVIOUS.y - CAMERA_VERTICAL_RATE * Math.min(dt, 0.05), Math.min(CAMERA_PREVIOUS.y + CAMERA_VERTICAL_RATE * Math.min(dt, 0.05), p.y));
      sweepCameraVolume(CAMERA_PREVIOUS, p, true);
      if (previousCaveIndex) {
        const previousOpening = CAMERA_OPENINGS[previousCaveIndex - 1];
        const along = (p.x - previousOpening.mouth.x) * previousOpening.sr + (p.z - previousOpening.mouth.z) * previousOpening.cr;
        if (along < previousOpening.planeZ && caveColumnAt(p.x, p.z, previousOpening, p.y) && p.y < CAMERA_COLUMN.ceiling) setCameraCave(previousCaveIndex);
      }
    } else if (player && followBoom && (!directView || previousCaveIndex)) {
      cameraHeadAt(CAMERA_VOLUME_FROM, player);
      if (cameraClearAt(CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z)) sweepCameraVolume(CAMERA_VOLUME_FROM, p, false);
    }
    if (player) {
      // Keep the exterior eye smooth through a doorway. Once it enters HQ,
      // the full swept follow rate keeps up with the continuous descents.
      // At the settled first-person endpoint the camera belongs to the head.
      // Do not tether it to an old eye position on the far side of a prop as
      // the character walks around that prop; only the short head-to-eye
      // segment must be clear.
      const fixedFirstPerson = followBoom && closeMix === 1 && cameraClearAt(p.x, p.y, p.z)
        && cameraSegmentClear(CAMERA_VOLUME_FROM.x, CAMERA_VOLUME_FROM.y, CAMERA_VOLUME_FROM.z, p.x, p.y, p.z);
      cameraManualContact = fixedFirstPerson ? false : followCameraMotion(p, player, dt, directView, smoothStep && closeMix === 0, closeMix, requestedStep, exteriorFlight) === true;
      if (fixedFirstPerson) {
        cameraTrailPlayer = player;
        cameraTrailCount = cameraTrailNext = 1;
        CAMERA_TRAIL[0] = p.x; CAMERA_TRAIL[1] = p.y; CAMERA_TRAIL[2] = p.z;
      }
      // Admission belongs to the resolved eye path. Boom clipping can leave
      // the eye inside even when the originally requested view was outside.
      let index = previousCaveIndex;
      if (cameraPreviousValid) for (let i = 0; i < CAMERA_OPENINGS.length; i++) {
        const entry = CAMERA_OPENINGS[i], crossing = cameraCrossing(CAMERA_PREVIOUS, p, entry);
        if (!crossing.valid) continue;
        if (!index && crossing.direction > 0) index = entry.caveIndex;
        else if (index && crossing.direction < 0 && (index === entry.caveIndex || CAMERA_OPENINGS[index - 1].headquarters && entry.headquarters)) index = 0;
      }
      if (index && CAMERA_OPENINGS[index - 1].headquarters && (!island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, p.y) || p.y < CAMERA_COLUMN.floor + CAMERA_RADIUS || p.y > CAMERA_COLUMN.ceiling - CAMERA_RADIUS) && !headquartersWindowAirAt(p.x, p.y, p.z)) index = 0;
      setCameraCave(index);
      if (directView && !index) cameraManualContact = true;
      if (cameraManualContact) {
        setVec(CAMERA_MANUAL_VIEW, pilot.orbit.yaw, pilot.orbit.pitch, pilot.orbit.dist);
        const body = player.root.position;
        setVec(CAMERA_MANUAL_BODY, body.x, body.y, body.z);
      }
    } else {
      cameraTrailPlayer = null;
      cameraTrailCount = cameraTrailNext = 0;
    }
    const headquartersEye = player && followOpening && followOpening.headquarters && (p.y < -CAMERA_RADIUS || (p.x - followOpening.mouth.x) * followOpening.sr + (p.z - followOpening.mouth.z) * followOpening.cr < followOpening.planeZ - 1e-7);
    if ((undergroundAir && p.y < -CAMERA_RADIUS || headquartersEye) && !cameraCaveIndex && island.cavityAt(p.x, p.z, CAMERA_COLUMN, island.headquarters.caveIndex, p.y) && p.y >= CAMERA_COLUMN.floor + CAMERA_RADIUS && p.y < CAMERA_COLUMN.ceiling && cameraClearAt(p.x, p.y, p.z)) {
      // A swept eye can enter an open throat or window after its Ooga; the center identifies its layer.
      // The full cylinder checks rock at open column edges. The Mirror Cave still needs its own crossing.
      for (let i = 0; i < CAMERA_OPENINGS.length; i++) if (CAMERA_OPENINGS[i].headquarters) {
        setCameraCave(CAMERA_OPENINGS[i].caveIndex);
        break;
      }
    }
    caveView = !!cameraCaveIndex;
    if (!caveView) {
      exteriorCameraFloorAt(p.x, p.y, p.z, clearance, smoothStep, closeMix, undergroundAir);
      cameraEntranceIndex = exteriorEntranceIndex;
    }
    const collided = Math.abs(p.x - requestedX) > 1e-7 || Math.abs(p.z - requestedZ) > 1e-7 || (freeMove || !!opening) && Math.abs(p.y - requestedY) > 1e-7;
    // The outdoor near plane is wider than the cave eye clearance.
    // Shorten it at low entrances/interiors so nearby jagged rock is not sliced away.
    camera.near = caveView || cameraEntranceIndex || closeMix > 0.5 || undergroundAir ? 0.1 : 0.5;
    setVec(CAMERA_PREVIOUS, p.x, p.y, p.z);
    cameraPreviousValid = true;
    if (matrixCave) {
      const portal = matrixCave.portal, m = matrixCave.mouth, dx = p.x - m.x, dz = p.z - m.z;
      portal.previousX = matrixCave.cr * dx - matrixCave.sr * dz;
      portal.previousY = p.y - m.floorY;
      portal.previousZ = matrixCave.sr * dx + matrixCave.cr * dz;
      portal.previousValid = true;
    }
    return collided;
  };

  const setPhase = (next) => {
    const first = phase === null;
    phase = next;
    if (first) hud.setSubtitle("an island of caves");
    if (!first && !(ghosts && ghosts.quietSky)) hud.toast(PHASE_TOASTS[next]); // HALLOWEEN: quietSky
  };
  // The jumbotron's close-up in the shared board dialog, read straight off the board as it pages and repaints.
  const jumbotronBoard = {
    title: "Oogatron", help: "OogaBoogaX on the big screen. Arrow keys flip the boards.", note: "", floating: true,
    get canvas() { return jumbotron.canvas; }, get count() { return jumbotron.count; }, get index() { return jumbotron.index; },
    get caption() { return jumbotron.caption; }, get version() { return jumbotron.version; },
    get paused() { return jumbotron.paused; }, setPaused: (paused) => jumbotron.setPaused(paused),
    createReader: (state) => jumbotron.createReader(state),
    go: (i) => jumbotron.goToView(i)
  };
  const openJumbotron = () => hud.openBoard(jumbotronBoard);
  // The four repository totems stand in two pairs beside the jumbotron approach, each with its faces toward the
  // pile. Fire burns in their eyes, each flame a node on the arcade's one `blaze` geometry. For a day after a PR
  // merges into main or master (`totemFeed`, `totemGlow.RECENT`), the repository's own pattern moves over the runes
  // cut into TOTEM_SLICE m slices up the pole and the eyes at their heights, waning to 60% by the day's end; light
  // circles the carved bands between heads, and painted details pulse softly. A merge seen during the visit flares
  // them brightest for TOTEM_FLARE seconds. Outside that day the eyes and all glow go out.
  // Each also casts a soft warm light from its middle that follows them, its own lamp kind so the tiers'
  // nearest-first choice treats it like any other lamp.
  // Each stands as tall and wide as its repository's importance (`totemModels.layout`); TOTEM_ROOM past its reach
  // keeps the scattered props off its stones and name board. Fixed feet keep both pairs in their meadow clearings.
  const TOTEM_SPOTS = [[7.8, 18.5], [-8.1, 18.6], [-4.7, 19.5], [4.1, 19.9]], TOTEM_ROOM = 2.4;
  const TOTEM_SLICE = 0.3, TOTEM_FLARE = 6, TOTEM_CHEER = 14;
  const totems = [];
  let totemUnsub = null;
  const totemAge = (i) => {
    const changed = BL.totemFeed.state.repos[i].changedAt;
    if (!changed) return "";
    const minutes = Math.max(0, Math.round((Date.now() - changed) / 60000));
    return minutes < 60 ? `${minutes} min ago` : minutes < 2880 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
  };
  // A merge landing during the visit: the eyes and runes flare, the Oogas awake within TOTEM_CHEER cheer
  // and show its word in speech bubbles (never the one being driven), and one notice names the repository.
  const flareTotem = (i) => {
    const o = totems[i], p = o.owner.node.position, repo = BL.totemFeed.REPOS[i];
    o.flare = 1;
    for (const cave of crew.cavemen.values()) {
      if (cave === pilot.player || cave.build || cave.state === "sleeping") continue;
      const c = cave.root.position;
      if (Math.hypot(c.x - p.x, c.z - p.z) > TOTEM_CHEER) continue;
      cave.cheer = 1.6;
      fx.say(cave, fnv1a(`${repo.word}/${cave.traits.name}`) % 2 ? `${repo.word}!` : "OOGA!", 1.8);
    }
    hud.toast(`${repo.name} just merged · the ${repo.word} totem blazes`);
  };
  const buildTotems = () => {
    const M = BL.totemModels, feed = BL.totemFeed;
    TOTEM_SPOTS.forEach(([x, z], i) => {
      const L = M.layout(i), spot = { x, z };
      const ry = Math.atan2(-spot.x, -spot.z);
      claim(spot.x, spot.z, L.reach + TOTEM_ROOM);
      const node = place(M.body(i), spot.x, spot.z, ry);
      // A pattern runs over u from the lowest lit thing on the pole (a slice of runes or an eye) to the highest.
      const slices = BL.totemGlow.bands(M.glyphs(i), TOTEM_SLICE);
      let lo = Infinity, hi = -Infinity;
      for (const { y } of slices) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      for (const [, y] of L.eyes) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
      const u = (y) => (y - lo) / (hi - lo);
      const runes = slices.map(({ geometry, y }) => {
        const band = createNode({ geometry, glow: 0, sightHidden: true });
        addChild(node, band);
        return { node: band, u: u(y) };
      });
      const features = createNode({ geometry: M.featureHighlights(i), glow: 0, visible: false, sightHidden: true });
      addChild(node, features);
      const rings = [];
      L.rings.forEach((y, level) => {
        for (let k = 0; k < M.RING_SEGMENTS; k++) {
          const arc = createNode({ geometry: M.ringSector(i), position: { x: 0, y, z: 0 }, rotation: { x: 0, y: -k / M.RING_SEGMENTS * Math.PI * 2, z: 0 }, glow: 0, visible: false, sightHidden: true });
          addChild(node, arc);
          // Start at the front (+z); keep the geometry aligned to the painted band's existing facets.
          rings.push({ node: arc, a: ((k - M.RING_SEGMENTS / 4 + M.RING_SEGMENTS) % M.RING_SEGMENTS + 0.5) / M.RING_SEGMENTS, level });
        }
      });
      const flames = L.eyes.map(([x, y, z, size]) => {
        const flame = createNode({ position: { x, y, z }, scale: { x: size, y: size, z: size }, geometry: BL.arcadeModels.blaze(), visible: false, sightHidden: true });
        addChild(node, flame);
        return { node: flame, size, u: u(y) };
      });
      const owner = addProp("totem", node, spot.x, spot.z, 0);
      // The broad sphere would take in half the meadow; a tap counts only on the stones, the pole or the wings.
      const P = node.position, cos = Math.cos(ry), sin = Math.sin(ry);
      owner.totem = i;
      owner.pickRay = (ray) => {
        const ox = ray.ox - P.x, oz = ray.oz - P.z;
        return M.hit(i, ox * cos - oz * sin, ray.oy - P.y, ox * sin + oz * cos, ray.dx * cos - ray.dz * sin, ray.dy, ray.dx * sin + ray.dz * cos);
      };
      const light = { r: 0, g: 0, b: 0, radius: 0, glow: 0, hide: false };
      const lamp = addLamp({ glow: 0, flare: 0, visible: true }, light, spot.x, L.apex * 0.35, spot.z, true, Infinity, `totem:${i}`);
      totems.push({ owner, runes, rings, features, flames, light, lamp, flare: 0, live: 0, pattern: BL.totemGlow.pattern(feed.REPOS[i].word), eyeTop: Math.max(...L.eyes.map((e) => e[1])) });
    });
  };
  const updateTotems = (dt, elapsed) => {
    const at = Date.now(), repos = BL.totemFeed.state.repos;
    for (let i = 0; i < totems.length; i++) {
      const o = totems[i], age = at - repos[i].changedAt;
      const live = DEBUG_TOTEM_GLOW ? 1 : repos[i].changedAt && age >= 0 && age < BL.totemGlow.RECENT ? 1 - 0.4 * age / BL.totemGlow.RECENT : 0;
      o.live = live ? o.live + (live - o.live) * Math.min(1, dt * 1.5) : 0;
      if (o.live < 0.002) o.live = 0;
      o.flare = live ? Math.max(0, o.flare - dt / TOTEM_FLARE) : 0;
      const glowPower = Math.max(o.live, o.flare);
      const breath = 0.5 + 0.5 * Math.sin(elapsed * 1.8 + i * 1.7), t = elapsed + i * 3.1;
      // Each slice of runes lights where the pattern stands at its height. Highlight past 2.4 would carry the warm
      // tint beyond its colour, so the flare tops out there.
      let sum = 0;
      for (let k = 0; k < o.runes.length; k++) {
        const r = o.runes[k], v = o.live ? o.pattern(r.u, t, i) : 0, lit = Math.max(o.live * (0.25 + 0.75 * v), o.flare);
        sum += v;
        r.node.glow = (0.45 + 0.55 * lit) * glowPower;
        r.node.highlight = (0.45 + 1.6 * lit + 0.35 * o.flare) * glowPower;
      }
      // Let the painted details breathe gently, leaving their carved colors and shapes readable at the peak.
      const featurePulse = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + i * 1.7);
      const featureGlow = glowPower * 0.38 * featurePulse * featurePulse;
      o.features.visible = featureGlow > 0.02;
      o.features.glow = featureGlow;
      o.features.highlight = 0.55 * featureGlow;
      // A bright front and fading wake now circle every separating band without stopping.
      const ringPower = glowPower;
      for (let k = 0; k < o.rings.length; k++) {
        const r = o.rings[k], lit = ringPower ? ringPower * BL.totemGlow.ring(r.a, t, r.level) : 0;
        r.node.visible = lit > 0.01;
        r.node.glow = lit;
        r.node.highlight = lit * 2.2;
      }
      const lit = Math.max(o.live * (0.3 + 0.7 * sum / o.runes.length), o.flare), power = (0.45 + 0.1 * breath + 0.8 * lit) * glowPower;
      const always = glowPower > 0, radius = always ? 4 + 2.5 * glowPower : 0;
      // Animated light inputs can change under a stationary camera, including when a merge's glow expires.
      if (o.lamp.always !== always || o.light.radius !== radius || o.light.r !== power) lampSelValid = false;
      o.lamp.always = always;
      o.light.radius = radius;
      o.light.r = power; o.light.g = 0.62 * power; o.light.b = 0.3 * power;
      // The eye fires leap as the pattern passes their height, taller still in a flare; they go out between merges.
      for (let k = 0; k < o.flames.length; k++) {
        const f = o.flames[k], flick = Math.sin(elapsed * 11 + k * 2.3 + i) * 0.08 + Math.sin(elapsed * 17.3 + k * 1.1) * 0.05;
        const fire = o.live * (0.75 + 0.75 * o.pattern(f.u, t, i)) + 0.3 * o.flare;
        f.node.visible = o.lamp.always;
        f.node.scale.x = f.node.scale.z = f.size * fire;
        f.node.scale.y = f.size * fire * (1 + flick);
      }
    }
  };
  const totemTip = (i) => {
    const age = totemAge(i), repo = BL.totemFeed.REPOS[i];
    return age ? `${repo.name} totem · merged ${age} · tap to see the PR` : `${repo.name} totem · tap to see its PRs`;
  };
  // A tap opens the repository's latest recent merge on GitHub in a new tab, as the lab's link opens its site.
  const pokeTotem = (o) => {
    const p = o.node.position;
    fx.burst(p.x, p.y + 1.6, p.z, 8, [DUST], 1.2);
    // Straight to the latest recent merge once GitHub has answered, the repository's PRs until then.
    const repo = BL.totemFeed.REPOS[o.totem], url = BL.totemFeed.state.repos[o.totem].url;
    window.open(url || `https://github.com/${repo.repo}/pulls?q=is%3Apr+is%3Amerged`, "_blank", "noopener,noreferrer");
  };
  let prefetchAt = 0;
  let lazyBedJob = null;
  const stopLazyBedding = () => {
    const job = lazyBedJob;
    lazyBedJob = null;
    if (!job) return;
    job.controller.abort();
    if (job.handle) {
      if (job.idle) cancelIdleCallback(job.handle);
      else clearTimeout(job.handle);
      job.handle = 0;
    }
  };
  const updateLazyBedding = () => {
    if (!LAZY_BEDDING || lazyBedJob || !headquarters) return;
    const p = pilot.player ? pilot.player.root.position : camera.position;
    let selected = null, distance = 18 * 18;
    for (const item of headquarters.lazyBeds) {
      if (item.ready || item.failed) continue;
      const bed = item.bed, dx = p.x - bed.x, dy = p.y - bed.y, dz = p.z - bed.z, d = dx * dx + dy * dy + dz * dz;
      if (d < distance) { selected = item; distance = d; }
    }
    if (!selected) return;
    const job = lazyBedJob = { item: selected, controller: new AbortController(), owner: headquarters, handle: 0, idle: typeof requestIdleCallback === "function" };
    const start = () => {
      job.handle = 0;
      if (lazyBedJob !== job || job.controller.signal.aborted) return;
      const steps = headquartersModels.mattressSteps(selected.bed.room, { until: 0, budget: 8, work: 0 });
      BL.buildTasks.run(steps, "hub", job.controller.signal).then(geometry => {
        if (lazyBedJob !== job || job.controller.signal.aborted || headquarters !== job.owner) return;
        const bed = selected.bed, old = bed.node.geometry;
        bed.node.geometry = geometry;
        Object.assign(bed, geometry.mattress);
        selected.ready = true;
        try { refreshObjectGuides(); }
        finally { renderer.releaseGeometry(old); }
      }).catch(() => { if (!job.controller.signal.aborted) selected.failed = true; }).finally(() => {
        if (lazyBedJob === job) lazyBedJob = null;
      });
    };
    job.handle = job.idle ? requestIdleCallback(start, { timeout: 250 }) : setTimeout(start, 0);
  };
  const update = (dt, elapsed) => {
    if (ghosts) ghosts.unshake(camera); // HALLOWEEN: last frame's quake comes off before anything reads the camera
    // Four cheap proximity reads a second, without building a visit or changing its actor/account state.
    if (elapsed >= prefetchAt) {
      prefetchAt = elapsed + 0.25;
      const p = pilot.player ? pilot.player.root.position : camera.position;
      for (let i = 0; i < caves.slots.length; i++) {
        const slot = caves.slots[i];
        if (!slot.scene || slot.status !== "open") continue;
        for (let j = 0; j < island.mouths.length; j++) {
          const mouth = island.mouths[j];
          if (mouth.id !== slot.id) continue;
          const dx = p.x - mouth.x, dy = p.y - mouth.floorY, dz = p.z - mouth.z;
          if (dx * dx + dy * dy + dz * dz <= 225) BL.deferred.prefetchScene(slot.scene);
          break;
        }
      }
    }
    if (lawn && lawn.version !== island.path.version) layLawn();
    if (life) { life.gulls.update(elapsed); life.shore.update(elapsed); life.boats.update(elapsed); }
    now = elapsed;
    hour = clock.read();
    if (ghosts) hour = ghosts.hour(hour); // HALLOWEEN: night falls for the hunt
    // The ephemeris turns the sun 0.0042 deg/s of island time (a 6e-4-hour budget is 2.16 s and misses no
    // pixel), so it resamples only when an input drifts; a fast debug clock misses the budget every frame,
    // a frozen one hits from the second frame on.
    if (clock.dayOfYear !== sampledDay || islandLatitude !== sampledLatitude || Math.abs(hour - sampledHour) >= DAY_RESAMPLE_HOUR
      || Math.abs(clock.continuousDay - sampledContinuousDay) >= DAY_RESAMPLE_DAY || Math.abs(clock.utcMs - sampledUtcMs) >= DAY_RESAMPLE_MS) {
      daylight.sample(hour, RENDER_OPTS, clock.dayOfYear, islandLatitude, clock.continuousDay, clock.utcMs);
      sampledHour = hour; sampledDay = clock.dayOfYear; sampledLatitude = islandLatitude; sampledContinuousDay = clock.continuousDay; sampledUtcMs = clock.utcMs;
      DAY_STASH.directStrength = RENDER_OPTS.directStrength; DAY_STASH.ambientFloor = RENDER_OPTS.ambientFloor;
      for (let i = 0; i < 3; i++) {
        DAY_STASH.clear[i] = RENDER_OPTS.clear[i]; DAY_STASH.horizon[i] = RENDER_OPTS.horizon[i]; DAY_STASH.zenith[i] = RENDER_OPTS.zenith[i];
        DAY_STASH.sky[i] = RENDER_OPTS.sky[i]; DAY_STASH.ground[i] = RENDER_OPTS.ground[i]; DAY_STASH.direct[i] = RENDER_OPTS.direct[i];
      }
    } else {
      // Weather and the shelter below shade the sampled colours in place; a held sample restores them.
      RENDER_OPTS.directStrength = DAY_STASH.directStrength; RENDER_OPTS.ambientFloor = DAY_STASH.ambientFloor;
      for (let i = 0; i < 3; i++) {
        RENDER_OPTS.clear[i] = DAY_STASH.clear[i]; RENDER_OPTS.horizon[i] = DAY_STASH.horizon[i]; RENDER_OPTS.zenith[i] = DAY_STASH.zenith[i];
        RENDER_OPTS.sky[i] = DAY_STASH.sky[i]; RENDER_OPTS.ground[i] = DAY_STASH.ground[i]; RENDER_OPTS.direct[i] = DAY_STASH.direct[i];
      }
    }
    RENDER_OPTS.time = elapsed;
    updatePoolEffectsActivity();
    if (poolEffectsActive) poolEffectsTime += dt;
    // Under the Mempool island's ground the storm is muffled and the daylight shut out: no shadow reaches that
    // island, so its tunnels would otherwise stand in full sun. The fires and the water light them instead.
    // By where the eye is, not what it looks at: a view from outside aimed into the rock is still outdoors.
    const sheltered = mempoolIsland.coveredAt(camera.position.x, camera.position.y, camera.position.z) ? 1 : 0;
    poolShade += clamp(sheltered - poolShade, -dt * 1.6, dt * 1.6);
    poolUnder += clamp((cutawayPool === 2 ? 1 : 0) - poolUnder, -dt * 1.6, dt * 1.6);
    if (gameMode) RENDER_OPTS.clouds = 0;
    else weather.update(dt, RENDER_OPTS, poolShade);
    if (poolShade > 0) {
      const keep = 1 - 0.4 * poolShade;
      RENDER_OPTS.directStrength *= 1 - 0.92 * poolShade;
      for (let i = 0; i < 3; i++) { RENDER_OPTS.sky[i] *= keep; RENDER_OPTS.ground[i] *= keep; }
    }
    if (ghosts) ghosts.shade(RENDER_OPTS); // HALLOWEEN: the boss dims the sky
    if (poolEffectsActive) {
      mempoolIsland.water.update(dt, poolEffectsTime, Date.now());
      mempoolIsland.paintings.update(dt);
    }
    updateTotems(dt, elapsed);
    if (coilCharge) updateCoilCharge(elapsed);
    // A fire rig pauses with the view: its own clock advances only while its pit is near, so a distant pit
    // freezes its flame and resumes without a catch-up jump.
    for (let i = 0; i < fireRigs.length; i++) {
      const rig = fireRigs[i], w = rig.root.world;
      const near = effectsActiveAt(w[12], w[13] + 1, w[14], rig.near, 24, 32);
      rig.near = near;
      if (!near) continue;
      rig.time = (rig.time || 0) + dt;
      rig.update(dt, rig.time);
    }
    updateLamps(dt, elapsed, phase !== null);
    if (jumbotron) {
      jumbotron.update(elapsed, renderer);
    }
    if (poolEffectsActive) updateChainSign(poolEffectsTime);
    hud.updateBoard(elapsed);
    const next = daylight.phaseAt(hour);
    if (next !== phase) setPhase(next);
    if (DEBUG) syncDaylightDebug(hour);
    critters.update(dt, elapsed, RENDER_OPTS.day, RENDER_OPTS.stars, fire.k, 1);
    if (!gameMode) updateClouds(dt);
    updateGameRing(dt, elapsed);
    solids.sync();
    if (gameMode) updateRageThrowMap();
    updateSleepingSolids();
    if (!chalkboard.openNow) {
      if (clankerPlay.active) clankerPlay.readInput(dt);
      else pilot.readInput(dt);
    }
    mirrorCave.ripples.update(dt, elapsed);
    updatePortalEffects(entropyLab.phase, dt);
    for (const veil of caveVeils) updatePortalEffects(veil.phase, dt);
    if (factoryMouth) factoryShield(dt, elapsed);
    if (bifrostIsle) bifrostGate(dt, elapsed);
    if (bcaMouth) bcaVeil(dt, elapsed);
    if (factoryDeparting || bifrostDeparting) return; // The Ooga through a shield and its camera hold through the director fade.
    if (gameMode) prepareClankerStrike();
    for (let i = 0; gameMode && i < clankerCaptures.length; i++) {
      const rec = clankerCaptures[i];
      if (!rec.cave) continue;
      if (!captureValid(rec)) { finishClankerRider(rec.entry, false); continue; }
      if (!rec.throwing) continue;
      const p = rec.entry.root.position;
      rec.x = p.x; rec.z = p.z;
      rec.time = Math.min(THROW_SWING_TIME + THROW_SETTLE_TIME, rec.time + dt);
      rec.entry.motion.throwProgress = Math.min(1, rec.time / THROW_SWING_TIME);
    }
    clankers.update(dt);
    for (let i = 0; gameMode && i < clankerCaptures.length; i++) {
      const rec = clankerCaptures[i], entry = rec.entry, cave = rec.cave;
      if (!cave) continue;
      if (!captureValid(rec)) { finishClankerRider(entry, false); continue; }
      if (rec.throwing && rec.time >= THROW_SWING_TIME) {
        if (!grabbedOogaPose(cave)) continue;
        const p = entry.root.position;
        let carryX = dt > 0 ? (p.x - rec.x) / dt : entry.drive.vx;
        let carryZ = dt > 0 ? (p.z - rec.z) / dt : entry.drive.vz;
        // Climb corrections are not launch momentum. Bound the inherited
        // speed before the Ooga's ordinary collision/airborne integration.
        const carrySpeed = Math.hypot(carryX, carryZ);
        if (!Number.isFinite(carrySpeed)) { carryX = carryZ = 0; }
        else if (carrySpeed > THROW_CARRY_SPEED_MAX) {
          const scale = THROW_CARRY_SPEED_MAX / carrySpeed;
          carryX *= scale; carryZ *= scale;
        }
        finishClankerRider(entry, true, rec.charge, rec.aimed ? rec.aim : null, carryX, carryZ);
      }
    }
    for (let i = 0; i < clankers.list.length; i++) {
      const entry = clankers.list[i], p = entry.root.position;
      // Afloat in the Mempool island's water a gorilla paddles: the rig poses it, this only says so.
      entry.motion.swim = entry.active && mempoolIsland.afloat(p.x, p.z, p.y, GORILLA_DRAUGHT) ? 1 : 0;
      if (!entry.active || p.y >= ABYSS_RESPAWN_Y || island.supportAt(p.x, p.z, p.y, 0, ABYSS_FLOOR) !== ABYSS_FLOOR) continue;
      if (!entry.controlled) { clankers.respawn(entry); continue; }
      // Use the character's pile arrival and abyss threshold. Keep possession
      // and translate the camera with the body instead of trailing its fall.
      const oldX = p.x, oldY = p.y, oldZ = p.z, z = Math.max(5, altar.platformRadius + 1.3);
      let found = false;
      for (let j = 0; j < NAVIGATION_OFFSETS.length; j++) {
        const x = NAVIGATION_OFFSETS[j], y = island.surfaceAt(x, z);
        if (!clankerCenterClear(entry, x, y, z, x, y, z)) continue;
        clankers.respawn(entry, x, y, z);
        clankerPlay.respawn(p.x - oldX, p.y - oldY, p.z - oldZ);
        found = true; break;
      }
      if (!found) throw new Error("No clear gorilla respawn at pile");
    }
    if (gameMode && dt > 0) updateClankerFireContacts(clankerFireReachable);
    if (debugSelectedGorilla && (!debugSelectedGorilla.active || !debugSelectedGorilla.root.visible || !DEBUG_GORILLA_RAGE && pilot.player || clankerPlay.active
      || DEBUG_GORILLA_RAGE && !debugSelectedGorilla.rage.debug)) selectDebugGorilla(null);
    updateLabEquipment(dt);
    clankerMeshes.sync();
    if (gameMode) updateClankerEffects(dt);
    if (timechainIsland) {
      if (!gameMode) timechainIsland.site.turn((elapsed % TIMECHAIN_OUTER_PERIOD) * Math.PI * 2 / TIMECHAIN_OUTER_PERIOD);
      timechainIsland.show(dt);
      // The doorway's walks steer the Ooga before the crew moves it.
      timechainIsland.gate.update(dt);
    }
    crew.update(dt, elapsed);
    for (let i = 0; i < crew.list.length; i++) {
      const cave = crew.list[i];
      if (cave.root.visible) floatPose(cave, cave.root.position.y - cave.baseY, cave.bodyHeight, cave.phase, elapsed);
    }
    footsteps.update(crew.player);
    npcSync.update(dt);
    shareDrivenActor(dt);
    remotes.update(dt);
    if (ghosts) ghosts.update(dt); // HALLOWEEN
    else if (ghostEntry) ghostEntry.update(dt); // HALLOWEEN
    if (poolEffectsActive) {
      mempoolIsland.wildlife.update(dt, poolEffectsTime);
      for (const cave of crew.list) if (cave.root.visible) {
        const p = cave.root.position;
        mempoolIsland.wake(cave.root, p.x, p.y - cave.baseY, p.z, cave.bodyHeight, 0.35);
      }
      for (const entry of clankers.list) if (entry.active && entry.root.visible) {
        const p = entry.root.position;
        mempoolIsland.wake(entry.root, p.x, p.y, p.z, entry.height, 0.65);
      }
      for (const animal of mempoolIsland.wildlife.list) if (animal.root.visible) {
        const p = animal.root.position, radius = animal.cfg.radius;
        mempoolIsland.water.wake(animal.root, p.x, p.y, p.z, radius * 2, radius);
      }
    }
    dockStairs.update(dt, pilot.player);
    updateRoomSigns(dt);
    updateLazyBedding();
    pile.update(dt);
    const player = pilot.player;
    if (player && !pilot.poseHeld && player.root.position.y - player.baseY < ABYSS_RESPAWN_Y && abyssAt(player.root.position.x, player.root.position.z, player.root.position.y - player.baseY)) {
      loseAbyssAmmo(player);
      respawnAtPile();
    }
    else if (!player && !pilot.poseHeld && pilot.freeFalling && camera.position.y - CLOSE_VIEW.eyeHeight < ABYSS_RESPAWN_Y && abyssAt(camera.position.x, camera.position.z, camera.position.y - CLOSE_VIEW.eyeHeight)) respawnAtPile();
    updatePlayerCave(player);
    if (player && player.jet && !jetpackAllowed(player)) {
      crew.removeJetpack(player);
      pilot.showAct();
      hud.toast("No jetpacks under ground");
    }
    if (magazine && magazine.revealed) {
      const node = magazine.node;
      node.rotation.y += dt * 0.9;
      node.position.y = magazine.y + Math.sin(elapsed * 2) * 0.08;
      if (player && player.root.visible && player.state !== "sleeping") {
        const p = player.root.position, feet = p.y - player.baseY;
        const dx = p.x - node.position.x, dz = p.z - node.position.z;
        if (dx * dx + dz * dz < MAGAZINE_REACH * MAGAZINE_REACH
          && feet < node.position.y + 0.28 && feet + player.bodyHeight > node.position.y - 0.28) {
          const added = grantMagazine(player);
          if (added) {
            hud.toast(magazine ? `+${added} ammo · ${magazine.ammo} left` : "Spare magazine collected");
            if (!magazine) hud.hint("R selects the fullest spare · Space reloads near the pile", 5000);
          }
        }
      }
    }
    for (let i = 0; i < sleepers.length; i++) {
      const s = sleepers[i];
      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = 1.6;
        fx.zzzAt(s.x, s.y, s.z);
      }
    }
    crates.update(dt, elapsed);
    fx.update(dt);
    stepTweens(dt);
    if (chalkboard.openNow) { /* Keep the exact camera and controlled actor pose until the board closes. */ }
    else if (clankerPlay.active) clankerPlay.update(dt);
    else pilot.update(dt);
    // The doorway's views (the keypad's, the swoop into the eyes and back out) take over from the pilot's.
    timechainIsland.gate.view(dt);
    // Tess moves after the view is set, so a tour's glide has the last word on it.
    islandGuide.update(dt, elapsed);
    timechainIsland.site.view(camera.position);
    for (let i = 0; i < signDetails.length; i++) {
      const sign = signDetails[i], dx = camera.position.x - sign.x, dy = camera.position.y - sign.y, dz = camera.position.z - sign.z;
      const limit = sign.node.geometry === sign.pixels ? 20 : 16;
      sign.node.geometry = dx * dx + dy * dy + dz * dz < limit * limit ? sign.pixels : sign.solid;
    }
    updateBirdsEyeCutaway(dt);
    updateAreaLabel();
    if (POSITION_DEBUG && elapsed >= positionDebugNext) {
      positionDebugNext = elapsed + 0.1;
      updatePositionDebug();
    }
    // clampCamera resolves the eye's entrance crossing inside pilot.update.
    // Commit portal and Matrix state after that, before rendering, so mirror and interior never disagree.
    syncMatrixInside(player);
    // The factory's window follows the eye, so it moves once the camera is final for the frame.
    if (factoryMouth && factoryMouth.hall) factoryMouth.hall.update(dt, camera, RENDER_OPTS, !factoryMouth.phase.paused);
    if (factoryMouth && factoryMouth.roofWindow) {
      const r = island.roofOpening;
      factoryMouth.roofEffectsActive = effectsActiveAt(r.x, r.y, r.z, factoryMouth.roofEffectsActive, 24, 32);
      factoryMouth.roofWindow.update(dt, camera, RENDER_OPTS, factoryMouth.roofEffectsActive);
    }
    if (bifrostIsle) updateBifrostWindow(dt);
    updateMatrixControl(dt, player);
    mirrorCave.body.update(dt);
    entropyLab.phase.body.update(dt);
    entropyLab.phase.body.time = entropyLab.phase.ripples.time;
    for (const veil of caveVeils) {
      veil.phase.body.update(dt);
      veil.phase.body.time = veil.phase.ripples.time;
    }
    if (bcaMouth) {
      bcaMouth.phase.body.update(dt);
      bcaMouth.phase.body.time = bcaMouth.phase.ripples.time;
    }
    if (ghosts) ghosts.shake(camera); // HALLOWEEN: the land shakes as the ghost walls rise
  };
  // Every visitor controls only their assigned Ooga and its companion.
  const mayDriveOoga = (cave) => {
    if (ghosts && ghosts.waiting) return "You're in the waiting room until this hunt ends"; // HALLOWEEN: the hunt's waiting room
    return BL.net.mayDrive(cave.traits.name);
  };
  const actorTransition = {};
  // Validate a new Ooga before giving up the current actor or its camera.
  const selectOoga = (cave) => {
    if (!cave || crew.cavemen.get(cave.traits.name) !== cave) { hud.toast("That Ooga is not available here"); return false; }
    if (cave === pilot.player) return true;
    // The Timechain Sphere's doorway holds its Ooga from the keypad until it is through.
    if (timechainIsland.gate && timechainIsland.gate.busy) { hud.toast("Finish at the Timechain Sphere's doors first"); return false; }
    const refusal = mayDriveOoga(cave);
    if (refusal) { hud.toast(refusal); return false; }
    if (cave.remoteControlled) { hud.toast(`Someone is already driving ${cave.traits.display}`); return false; }
    if (ghosts) ghosts.release(cave); // HALLOWEEN: an Ooga cleared away for the hunt comes back to be driven
    if (crew.stateOf(cave) === "away" || cave.state !== "working" && cave.state !== "chilling" && cave.state !== "sleeping") {
      hud.toast(`${cave.traits.display} is in another place`);
      return false;
    }
    if (clankerPlay.active) {
      clankerPlay.captureControl(actorTransition);
      clankerPlay.release();
      pilot.possess(cave, actorTransition);
    } else pilot.possess(cave);
    return pilot.player === cave;
  };
  const selectGorilla = (entry) => {
    if (!entry || !clankers.list.includes(entry) || !entry.active || !entry.root.visible) {
      hud.toast("That gorilla is not available here"); return false;
    }
    if (clankerPlay.player === entry) return true;
    const refusal = BL.net.mayDriveGorilla(entry.owner.traits.name);
    if (refusal) { hud.toast(refusal); return false; }
    if (entry.remoteControlled) { hud.toast("Someone is already driving that gorilla"); return false; }
    return clankerPlay.possess(entry);
  };
  const RELEASE_WORDS = { "owner-here": "Its owner arrived and took their Ooga back", taken: "Someone else is already driving that Ooga", "not-yours": "Contributors drive only their own Ooga" };
  // The account or the room changed: an Ooga driven here that is no longer this visitor's to drive is let go.
  const onAccountChange = () => {
    const driven = crew.player, released = BL.net.state.released;
    const gorilla = clankerPlay && clankerPlay.player;
    if (gorilla) {
      let refusal = BL.net.mayDriveGorilla(gorilla.owner.traits.name);
      if (!refusal && released && released.name === gorilla.netBody) refusal = "That gorilla is no longer yours to drive";
      BL.net.state.released = null;
      if (refusal) { clankerPlay.release(); hud.toast(refusal); }
      claimOwnOoga();
      return;
    }
    if (!driven) { claimOwnOoga(); return; }
    crew.refreshRosterRow(driven);
    let refusal = BL.net.mayDrive(driven.traits.name, false);
    if (!refusal && released && released.name === driven.traits.name) refusal = RELEASE_WORDS[released.reason] || "That Ooga is not yours to drive";
    BL.net.state.released = null;
    if (!refusal) { claimOwnOoga(); return; }
    pilot.release(true);
    hud.toast(refusal);
    claimOwnOoga();
  };
  // The visitor arrives awake beside the pile: their authenticated Ooga, remembered local likeness, or Ooga.
  // Claim once per arrival. Returning actors keep their exit; letting go stays detached.
  const claimOwnOoga = () => {
    const me = BL.net.state.me;
    if (ownOogaClaimed) return false;
    const character = BL.net.ownCharacter() || (!DEBUG && BL.net.preferredCharacter());
    const cave = character && crew.cavemen.get(character.handle);
    if (!cave) return false;
    if (pilot.player && pilot.player !== cave || clankerPlay && clankerPlay.active) {
      ownOogaClaimed = true;
      return false;
    }
    // Another tab of this account drives it: its remote copy has sent this one away.
    if (cave.remoteControlled || mayDriveOoga(cave)) return false;
    // An account retry can identify the Ooga already held at the Sphere's keypad.
    // Keep that doorway interaction and its view; a fresh sign-in has no held actor.
    if (pilot.player === cave && timechainIsland?.gate?.busy) {
      ownOogaClaimed = true;
      return true;
    }
    const previousOverride = pilot.player === cave ? cave.controlOverride : cave.override;
    if (crew.stateOf(cave) === "away") {
      cave.override = "chilling";
      crew.refreshStates(true);
    }
    if (!pilot.possess(cave)) {
      cave.override = previousOverride;
      crew.refreshStates(true);
      return false;
    }
    cave.controlOverride = previousOverride;
    // Respawn navigation also releases a sleeper's bed, clears motion and resets a saved underground eye.
    if (navigate("pile", true, false) !== true) {
      pilot.release(true);
      return false;
    }
    ownOogaClaimed = true;
    if (me) hud.toast(`Welcome back, ${BL.characters.displayOf(character.handle)}: this Ooga is yours`);
    return true;
  };
  // GAME MODE: an island event (the ghost hunt today, others to come) clears the island for play and holds the
  // scenery still while it runs: every gorilla nobody drives goes away (clankers' `setAway`), the trees stop swaying
  // (the renderer's `windTime` held where it stood), the meadow's fire pit goes out (`updateLamps`),
  // the Timechain Sphere stops turning, the island's clouds and the Mempool island's weather go (`weather.hold`), and
  // the Mempool island itself is hidden and left unrun. All of it comes back when the event lets go, and in `leave`.
  // The ring stands up `ringDelay` seconds after the event begins (the ghost hunt waits for its gates) and sinks as
  // it ends.
  const setGameMode = (on, combatOnly = false) => {
    on = !!on;
    combatOnly = on && !!combatOnly;
    if (on === gameMode && combatOnly === gameCombatOnly) return;
    gameMode = on;
    if (!on) gameRingWait = 0;
    gameCombatOnly = combatOnly;
    if (!on) for (const rec of clankerCaptures) if (rec.cave) finishClankerRider(rec.entry, false);
    crew.setCombatEnabled(on);
    clankers.setCombatEnabled(on);
    pilot.refreshCombat();
    clankerPlay.refreshCombat();
    resetRageThrowMap(on);
    if (!on) updateClankerEffects(0);
    clankers.setAway(on);
    RENDER_OPTS.windTime = on ? performance.now() * 0.001 % 3600 : NaN;
    // The act button and the hint pill under the play area (JUMP!, the controls' reminders) stand down too.
    document.body.classList.toggle("game-mode", on);
    hud.setPanelsHidden(on);
    for (const cloud of clouds) cloud.node.visible = !on;
    weather.hold(on);
    updatePoolEffectsActivity();
    mempoolIsland.site.node.visible = !on;
  };
  // GAME MODE's ring: a wall round the meadow well inside the foot of the bluff (the ground starts up it about 19.5 m
  // from the middle), so nobody playing climbs the cliffs and a shoulder camera behind someone at the wall stays out of
  // the rock; the furthest totem's elixir (19.5 m) is still in reach from inside. It stands up over `riseS` (the lanterns along its top
  // rising with it) and sinks over `sinkS`, and while it stands it refuses a step out across it at or above the
  // meadow; anyone outside it (in a cave mouth, up the bluff) may still walk in. The wall itself is unseen:
  // `RING_PANELS` flat veils of B.C.A.'s kind, tangent to the ring, each its own geometry so the renderer draws each
  // one's own ripples and outlines, glowing in glyphs where a body touches them (`ringBodies`, `touchGameRing`).
  const GAME_RING = { r: 18.5, height: 8, riseS: 1.5, sinkS: 1 };
  const GAME_RING_R2 = GAME_RING.r * GAME_RING.r;
  const RING_PANELS = 32, RING_STEP = Math.PI * 2 / RING_PANELS;
  const ringPanelGeometries = models.cached(() => {
    const half = GAME_RING.r * Math.tan(RING_STEP / 2), top = GAME_RING.height, list = [];
    for (let i = 0; i < RING_PANELS; i++) {
      const color = [0, 0, 0];
      list.push({
        verts: [-half, -0.5, 0, half, -0.5, 0, half, top, 0, -half, top, 0],
        faces: [{ i: [0, 1, 2, 3], color }, { i: [3, 2, 1, 0], color }],
        lines: [], castShadow: false, mirrorRippleOnly: true
      });
    }
    return list;
  });
  // The veil a body at (x, z), feet at `feet`, touches from either side at the meadow's level, or -1.
  const RING_PULSE_S = 0.14, RING_TOUCH = 0.08;
  let ringPulseWait = 0;
  const ringPanelAt = (x, z, feet, radius) => {
    const d = Math.hypot(x, z);
    if (d + radius < GAME_RING.r - RING_TOUCH || d - radius > GAME_RING.r || feet < -1 || feet > GAME_RING.height) return -1;
    return (Math.round(Math.atan2(x, -z) / RING_STEP) % RING_PANELS + RING_PANELS) % RING_PANELS;
  };
  // The driven Ooga touching a veil shows its outline there in glyphs, with waves rolling off it, as anyone crossing
  // B.C.A.'s veil does (mirror-body.js, over every Ooga of the crew). Each section's atlas is made the first time
  // someone comes to it or to either side of it, a body at a seam meeting both: taken off the ring while it is made, so
  // reading its veil's place walks no more than the veil (the ring's group and the island's root stand unmoved).
  const ringBodies = (i) => {
    for (let k = -1; k <= 1; k++) {
      const node = ringPanels[(i + k + RING_PANELS) % RING_PANELS];
      if (node.mirrorBody) continue;
      removeChild(gameRing, node);
      BL.mirrorBody.create(node, crew.cavemen);
      addChild(gameRing, node);
    }
  };
  // Another player against the wall (shown here by the remote pool, which no veil outlines) sends glyph ripples up it
  // where they touch, every `RING_PULSE_S` while they stay.
  const touchGameRing = (x, z, feet, radius) => {
    const i = ringPanelAt(x, z, feet, radius);
    if (i < 0) return;
    const at = i * RING_STEP, k = GAME_RING.r / Math.max(Math.hypot(x, z), 1e-6);
    ringPanels[i].mirrorRipples.pulse((x * Math.cos(at) + z * Math.sin(at)) * k, feet + 0.6 + Math.random() * 0.8, 0);
  };
  // Paper lanterns floating over the ring's top as it stands, lit, each bobbing and turning slowly on its own beat.
  const RING_LANTERNS = 36, LANTERN_LIFT = 0.7, LANTERN_BOB = 0.18;
  const ringLanternGeometry = models.cached(() => models.noShadow(models.merge(
    models.lathe({ profile: [[0.12, 0], [0.2, 0.08], [0.22, 0.22], [0.18, 0.36], [0.1, 0.42]], segments: 8, color: "#ff9a3c", emissive: 1 }),
    models.lathe({ profile: [[0.11, 0.42], [0.12, 0.46], [0.02, 0.48]], segments: 8, color: "#3a2a18" }),
    models.lathe({ profile: [[0.02, -0.03], [0.13, -0.02], [0.12, 0]], segments: 8, color: "#3a2a18" }))));
  const crossesGameRing = (fromX, fromZ, toX, toZ, y) => gameMode && gameRingK > 0 && y > -1
    && fromX * fromX + fromZ * fromZ < GAME_RING_R2 && toX * toX + toZ * toZ >= GAME_RING_R2;
  // As the ring starts up, the visitor's own Ooga outside it (up the bluff, in a cave mouth, out on a bridge or the
  // Mempool island) is brought in to the pile, as a fall off the island is, so nobody begins an event shut out.
  const bringInsideRing = () => {
    const ooga = pilot.player;
    if (ooga && Math.hypot(ooga.root.position.x, ooga.root.position.z) >= GAME_RING.r - 0.3) navigate("pile", true, true);
  };
  const updateGameRing = (dt, elapsed) => {
    if (gameMode && gameRingWait > 0) gameRingWait -= dt;
    const target = gameMode && gameRingWait <= 0 ? 1 : 0;
    if (gameRingK !== target) {
      if (gameRingK === 0 && target) bringInsideRing();
      gameRingK = target ? Math.min(1, gameRingK + dt / GAME_RING.riseS) : Math.max(0, gameRingK - dt / GAME_RING.sinkS);
      gameRing.visible = gameRingK > 0;
    }
    const shown = gameRingK > 0;
    // A veil's outlines clear themselves once the ring is down (mirror-body.js stops sampling a hidden veil).
    for (let i = 0; i < ringPanels.length; i++) {
      const node = ringPanels[i], body = node.mirrorBody;
      if (shown) node.mirrorRipples.update(dt);
      if (body) { body.update(dt); body.time = node.mirrorRipples.time; }
    }
    if (shown) {
      const own = pilot.player;
      if (own) {
        const p = own.root.position, i = ringPanelAt(p.x, p.z, p.y - own.baseY, own.bodyRadius);
        if (i >= 0) ringBodies(i);
      }
      ringPulseWait -= dt;
      if (ringPulseWait <= 0) {
        ringPulseWait = RING_PULSE_S;
        const outside = remotes?.actors();
        if (outside) for (const body of outside) touchGameRing(body.x, body.z, body.y, body.radius);
      }
    }
    // The lanterns ride up and down with the wall's top.
    if (!shown && !ringLanternsShown) return;
    ringLanternsShown = shown;
    const top = GAME_RING.height * ease.inOutQuad(gameRingK) + LANTERN_LIFT;
    for (let i = 0; i < ringLanterns.length; i++) {
      const node = ringLanterns[i];
      node.visible = shown;
      node.position.y = top + Math.sin(elapsed * 0.9 + i * 1.7) * LANTERN_BOB;
      node.rotation.y = elapsed * 0.3 + i;
    }
  };
  const delayGameRing = seconds => { gameRingWait = Math.max(0, seconds); };
  // HALLOWEEN: the entry owns its pending load and discovery subscriptions for this visit alone.
  const createGhostEntry = () => {
    if (!GHOSTS_WANTED) return;
    ghostEntry = BL.ghostEntry.create({ root, camera, island, npcSync, addTarget, removeTarget, hud, fx,
      attach: () => (ghosts = BL.halloween.create(ghostHub())) });
  };
  const ghostHub = () => ({
    root, camera, renderer, fx, hud, crew, island, npcSync, coarse: COARSE, closedZones: closedCaveZones, debug: DEBUG, params, guide: islandGuide,
    openMouths: island.mouths.filter((m) => !sealedCaves.some((sealed) => sealed.mouth === m)),
    addTarget, removeTarget, selectOoga, mayDriveOoga, zoneOf, heraldGeometry: ghostEntry && ghostEntry.herald.geometry,
    gorillaActive: () => !!(clankerPlay && clankerPlay.active),
    gameMode: on => setGameMode(on, true),
    // Keep ring timing separate from the event's combat policy.
    ringDelay: delayGameRing,
    lobbyOpen: (on, restore) => {
      hud.setPanelsHidden(on || gameMode);
      pilot.setMenuOpen(on, restore);
    },
    // The waiting room: the driven Ooga let go of (the free camera to watch from), and at the end the visitor's own
    // Ooga given back.
    spectate: (on) => {
      if (on) { if (pilot.player) pilot.modeAction("mode-release"); return; }
      const own = BL.net.ownCharacter(), cave = own && crew.cavemen.get(own.handle);
      if (cave && !pilot.player && !cave.remoteControlled) selectOoga(cave);
    },
    remoteUnderlying: (cave, override) => remotes.setUnderlying(cave, override),
    // The driven Ooga's rifle out and the view in combat, as 2 and X would have it.
    readyGun: () => {
      if (!pilot.aiming) pilot.modeAction("mode-toggle");
      pilot.weaponMode(2);
    },
    // The view held while a player's Ooga lies under its grave: the pilot let go of, as Tess's tour does, and given back.
    holdView: (on) => {
      pilot.setActive(!on); pilot.controls.reset(); input.reset();
      pilot.setExternalControl(on);
    },
    // While the view is held, how the visitor is steering it, read straight from the pilot's controls since the pilot
    // itself is let go of: `x` and `y` A D and W S (or the move stick), `yaw` and `orbitYaw` Q E and the arrows
    // (positive to the left), `pitch` the look stick or arrows (positive down), `sprint` the run key.
    heldAxes: () => pilot.controls.read(),
    // GAME MODE's ring wall's radius, for the minimap.
    ringRadius: GAME_RING.r,
    // Where each totem's elixir hangs: on its pole's front, facing the pile, at chest height.
    elixirSpots: TOTEM_SPOTS.map(([x, z], i) => {
      const d = Math.hypot(x, z), out = BL.totemModels.layout(i).reach + 0.12;
      return { x: x - x / d * out, y: island.surfaceAt(x, z) + 1.35, z: z - z / d * out };
    }),
    // The banana pile at the island's middle: its platform's reach and the top of the pile as it stands now.
    pileRadius: () => altar.platformRadius,
    pileTop: () => pile.core.position.y + pile.core.scale.y * pileTopY,
    setSeal: (fn) => { ghostSeal = fn; },
    dropJetpack: (cave) => { crew.removeJetpack(cave); pilot.showAct(); },
    // Nudges the driven Ooga along the ground (a ghost's knock, a wraith's pull) where it could walk.
    pull: (cave, dx, dz) => {
      const p = cave.root.position, feet = p.y - cave.baseY;
      if (cave.health.stunned || !walkable(p.x, p.z, p.x + dx, p.z + dz, feet, cave.bodyHeight, cave)) return;
      p.x += dx; p.z += dz;
    }
  });
  const cycleOwnActor = () => {
    const character = BL.net.ownCharacter();
    if (!character) { hud.toast("Sign in as a contributor to switch between your Ooga and gorilla"); return; }
    const cave = crew.cavemen.get(character.handle);
    if (!cave) { hud.toast("Your Ooga is not available here"); return; }
    if (pilot.player === cave) {
      const gorilla = clankers.list.find(entry => entry.owner === cave);
      if (!gorilla || !gorilla.active || !gorilla.root.visible) { hud.toast("Your gorilla is not available here yet"); return; }
      selectGorilla(gorilla);
    } else selectOoga(cave);
  };
  // Where the driven Ooga is, as the room names it for voice and for who is shown (docs/auth-and-presence.md):
  // a cave by its mouth (EntropyLab, the Factory's tunnel and the Arcade's mouth share their halls' groups, HQ
  // is one place whichever entrance), a bridged land from the foot of its bridge (the Timechain Sphere, the
  // Mempool rainforest with its chamber and tunnels, the Bifrost isle), the island itself (`outside`), or
  // nowhere past its edge: flying or falling off it. Allocation-free; a cave is named once.
  const CAVE_ZONES = { c11: "lab", c10: "bca", c2: "factory", c3: "arcade", c1: "mirror" };
  const ZONE_HOLD = 0.25;
  const zoneNames = [];
  const zoneName = (index) => {
    if (!zoneNames[index]) {
      const opening = CAMERA_OPENINGS[index - 1];
      zoneNames[index] = opening.headquarters ? "hq" : CAVE_ZONES[opening.id] || `cave-${String(opening.id).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 27)}`;
    }
    return zoneNames[index];
  };
  const onSphere = (x, z) => {
    if (!timechainIsland) return false;
    const p = timechainIsland.place, s = BL.timechainModels.SITE, dx = x - p.x, dz = z - p.z;
    const across = dx * timechainIsland.cos - dz * timechainIsland.sin, along = dx * timechainIsland.sin + dz * timechainIsland.cos;
    return Math.abs(across) <= s.width / 2 && along >= p.bridgeZ && along <= p.bridgeZ + s.span + 0.5 || dx * dx + dz * dz < s.radius * s.radius;
  };
  const inRainforest = (x, feet, z) => {
    if (!mempoolIsland) return false;
    if (mempoolIsland.overAt(x, z) || mempoolIsland.coveredAt(x, feet + 0.5, z)) return true;
    const p = mempoolIsland.place, s = poolModels.SITE, dx = x - p.x, dz = z - p.z;
    const across = dx * mempoolIsland.cos - dz * mempoolIsland.sin, along = dx * mempoolIsland.sin + dz * mempoolIsland.cos;
    return Math.abs(across) < s.width / 2 && along >= p.bridgeLocalZ + s.deckStart && along <= p.bridgeLocalZ + s.span;
  };
  // The isle's ground is -Infinity off it; on it, a body up to 3 m under the top (on the bridge's head) counts.
  const onBifrostIsle = (x, feet, z) => {
    if (!bifrostIsle) return false;
    const ground = bifrostIsle.site.groundAt(x, z);
    return ground > -Infinity && feet > ground - 3;
  };
  const zoneOf = (cave, gorilla = false) => {
    const p = cave.root.position, feet = p.y - (gorilla ? 0 : cave.baseY);
    if (!gorilla && playerCaveIndex) return zoneName(playerCaveIndex);
    if (gorilla && island.cavityAt(p.x, p.z, CAMERA_COLUMN, 0, feet)
      && feet >= CAMERA_COLUMN.floor - 1e-6 && feet < CAMERA_COLUMN.ceiling) {
      const index = CAMERA_COLUMN.caveIndex;
      for (const opening of CAMERA_OPENINGS) {
        if (opening.headquarters ? index === island.headquarters.caveIndex : opening.caveIndex === index
          && !opening.blocked && (p.x - opening.mouth.x) * opening.sr + (p.z - opening.mouth.z) * opening.cr < opening.planeZ) return zoneName(opening.caveIndex);
      }
    }
    if (onSphere(p.x, p.z)) return "sphere";
    if (inRainforest(p.x, feet, p.z)) return "rainforest";
    if (onBifrostIsle(p.x, feet, p.z)) return "bifrost";
    return island.onLand(p.x, p.z) ? "outside" : "none";
  };
  // A new zone holds ZONE_HOLD seconds before it is reported, so a bridge's foot does not flicker voice.
  let zoneHeld = null, zoneHeldFor = 0;
  // Both body kinds share position, health and zone transport. Gorilla locomotion
  // reuses six numbers so climbing, swimming and running survive the handoff.
  const shareDrivenActor = (dt) => {
    const gorilla = clankerPlay && clankerPlay.player, driven = gorilla || crew.player;
    BL.net.setBody(gorilla ? gorilla.netBody : driven ? driven.traits.name : null);
    if (!driven) return;
    const zone = zoneOf(driven, !!gorilla);
    if (zone === BL.net.state.zone) zoneHeld = null;
    else if (zone !== zoneHeld) {
      zoneHeld = zone;
      zoneHeldFor = 0;
    } else if ((zoneHeldFor += dt) >= ZONE_HOLD) BL.net.setZone(zone);
    const p = driven.root.position;
    if (gorilla) {
      const g = gorilla.netMotion, m = gorilla.motion, d = gorilla.drive;
      g[0] = (gorilla.jump.active || d.airborne && !d.passiveFall ? 1 : 0) | (gorilla.biped ? 2 : 0)
        | (gorilla.climb.active ? 4 : 0) | (d.run ? 8 : 0) | (m.lab ? 16 : 0) | (m.office ? 32 : 0)
        | (gorilla.sleep.stage === "asleep" ? 64 : 0);
      g[1] = gorilla.speed; g[2] = m.climbStride; g[3] = m.climbDirection; g[4] = m.climbSide; g[5] = m.swim;
      if (g[0] & 64) g[3] = gorilla.sleep.pose === "left" ? -1 : gorilla.sleep.pose === "right" ? 1 : 0;
      BL.net.sendPose(p.x, p.y, p.z, gorilla.heading, g);
      BL.net.setHealth(gorilla.health.value / gorilla.health.max * 100, gorilla.health.value <= 0);
    } else {
      BL.net.sendPose(p.x, p.y - driven.baseY, p.z, driven.root.rotation.y);
      BL.net.setHealth(driven.health.value, driven.health.stunned);
    }
  };
  // Signed-in players are shown where this one is: the same zone while driving, every place on the island
  // while looking round free (no zone, no voice).
  const remoteShown = (rec) => {
    if (ghosts && ghosts.down(rec.id)) return false; // HALLOWEEN: a player gone down lies under their grave
    const net = BL.net.state;
    if (net.body) return rec.zone === net.zone;
    return BL.remotePlayers.onIsland(rec.zone);
  };
  const drawExtra = (ctx2d, project) => {
    crew.drawDrops(ctx2d, project);
    remotes.drawNames(ctx2d, project, gameMode);
    if (ghosts) ghosts.drawOverlay(ctx2d, project); // HALLOWEEN
    if (debugSelectedGorilla) {
      const entry = debugSelectedGorilla, move = entry.debugMove, p = entry.root.position;
      ctx2d.save();
      ctx2d.strokeStyle = "#b7ef73"; ctx2d.lineWidth = 2;
      const center = project(p.x, p.y + 1.25, p.z);
      if (center) {
        const x = center.x, y = center.y;
        ctx2d.beginPath();
        ctx2d.moveTo(x - 20, y - 18); ctx2d.lineTo(x - 26, y - 18); ctx2d.lineTo(x - 26, y + 18); ctx2d.lineTo(x - 20, y + 18);
        ctx2d.moveTo(x + 20, y - 18); ctx2d.lineTo(x + 26, y - 18); ctx2d.lineTo(x + 26, y + 18); ctx2d.lineTo(x + 20, y + 18);
        ctx2d.stroke();
      }
      if (!DEBUG_GORILLA_RAGE && move?.status && move.status !== "idle") {
        const point = project(move.target.x, move.target.y + 0.05, move.target.z);
        if (point) {
          const x = point.x, y = point.y;
          if (move.status === "blocked") ctx2d.strokeStyle = "#ffb45e";
          ctx2d.beginPath(); ctx2d.arc(x, y, 9, 0, Math.PI * 2);
          ctx2d.moveTo(x - 13, y); ctx2d.lineTo(x + 13, y);
          ctx2d.moveTo(x, y - 13); ctx2d.lineTo(x, y + 13); ctx2d.stroke();
        }
      }
      const label = DEBUG_GORILLA_RAGE ? entry.rage.phase === "throw" ? "Rage · throwing" : entry.rage.phase === "edge"
        ? "Rage · dragging and charging" : "Rage · chasing nearby Oogas" : DEBUG_MOVE_LABELS[move?.status] || "Click a destination";
      const x = renderer.size.width / 2, y = renderer.size.height - 82;
      ctx2d.font = "12px monospace"; ctx2d.textAlign = "center"; ctx2d.textBaseline = "middle";
      const width = 286;
      ctx2d.fillStyle = "rgba(13, 26, 15, 0.9)"; ctx2d.fillRect(x - width / 2, y - 22, width, 44);
      ctx2d.fillStyle = "#b7ef73"; ctx2d.fillText(label, x, y - 8);
      ctx2d.fillStyle = "#e1e5d9"; ctx2d.fillText(DEBUG_GORILLA_RAGE
        ? "Continuous rage · Esc to stop" : "Click to redirect · Esc to deselect", x, y + 9);
      ctx2d.restore();
    }
    // Over everything: the Factory's last frame, dissolving off the island's first; and the island's own, taken once
    // drawn as the Ooga walks into the Factory.
    BL.factoryWindow.still(ctx2d, factoryWalk.still);
    if (factoryWalk.grab) { factoryWalk.grab = false; BL.factoryWindow.grab(glCanvas); }
  };
  const cameraPlatformAt = (x, y, z) => y >= 0 && y <= ALTAR_HEIGHT && Math.abs(x) <= altar.platformRadius && Math.abs(z) <= altar.platformRadius && Math.hypot(x, z) <= altar.platformRadius;
  // One solid mask spans both islands, the dais and fruit contact. A cheap extent check keeps the
  // Mempool grid out of the HUB's per-pixel rock texture pass.
  const cameraPoolNear = (x, z) => {
    const dx = x - mempoolIsland.place.x, dz = z - mempoolIsland.place.z, reach = poolModels.SITE.reach + 1;
    return dx * dx + dz * dz < reach * reach;
  };
  const cameraRockAt = (x, y, z) => cameraPlatformAt(x, y, z) || bananaCover.contains(x, y, z)
    || cameraPoolNear(x, z) && mempoolIsland.solidAt(x, y, z) || island.solidAt(x, y, z)
    || !island.clearAt(x, y, z, 1e-5, 2e-5) || !entranceSegmentClear(x, y, z, x, y, z, 1e-5);
  const cameraRockMaterialAt = (x, y, z) => cameraPlatformAt(x, y, z) ? altar.slab.geometry.faces[0].color
    : cameraPoolNear(x, z) ? mempoolIsland.rockMaterialAt(x, y, z) || island.rockMaterialAt(x, y, z) : island.rockMaterialAt(x, y, z);
  const cameraCutRockAt = (x, y, z) => y <= RENDER_OPTS.cutawayMaxY && mempoolIsland.solidAt(x, y, z);
  const bananaLightVisibleAt = (x, y, z, lx, ly, lz) => {
    const reach = RENDER_OPTS.shadowExtent * 3, toX = x + lx * reach, toY = y + ly * reach, toZ = z + lz * reach;
    return island.sightClearAt(x, y, z, toX, toY, toZ) && solids.segmentClear(x, y, z, toX, toY, toZ, 0, 1e-5)
      && bananaCover.segmentClear(x, y, z, toX, toY, toZ);
  };
  const guideWitness = new Int32Array([-1]);
  const guideSegmentClear = (x, y, z, toX, toY, toZ) => {
    const previous = guideWitness[0];
    const clear = island.sightClearAt(x, y, z, toX, toY, toZ, guideWitness);
    // Clear rays must not evict a useful blocker. The terrain rechecks this voxel's
    // current occupancy and intersection with every segment before using it.
    if (clear) guideWitness[0] = previous;
    return clear;
  };
  guideSegmentClear.boxClear = (minX, minY, minZ, maxX, maxY, maxZ) => island.sightBoxClearAt(minX, minY, minZ, maxX, maxY, maxZ);
  guideSegmentClear.boxSolid = (minX, minY, minZ, maxX, maxY, maxZ) => island.sightBoxSolidAt(minX, minY, minZ, maxX, maxY, maxZ);
  // Sight for someone on or under the Mempool island, asked only for the walker's own rim: both islands' rock
  // answers, and only the rock a roof cut leaves standing. The outline registry remembers its answer by which
  // seam asked, so there are two alike and the one in use changes whenever the cut's height does.
  const poolSeamOf = () => {
    const seam = (x, y, z, toX, toY, toZ) => island.sightClearAt(x, y, z, toX, toY, toZ) && mempoolIsland.sightClear(x, y, z, toX, toY, toZ);
    seam.boxSolid = (minX, minY, minZ, maxX, maxY, maxZ) => maxY <= RENDER_OPTS.cutawayMaxY
      && (island.sightBoxSolidAt(minX, minY, minZ, maxX, maxY, maxZ) || mempoolIsland.boxSolid(minX, minY, minZ, maxX, maxY, maxZ));
    return seam;
  };
  const POOL_SEAMS = [poolSeamOf(), poolSeamOf()];
  let poolSeamIndex = 0, poolSeamCut = NaN;
  const poolSeam = () => {
    if (RENDER_OPTS.cutawayMaxY !== poolSeamCut) { poolSeamCut = RENDER_OPTS.cutawayMaxY; poolSeamIndex ^= 1; }
    return POOL_SEAMS[poolSeamIndex];
  };
  const GUIDE_RAMP_COLUMN = { floor: 0, ceiling: 0 }, GUIDE_EYE = new Float64Array(3);
  const controlledGuideActor = () => clankerPlay.active ? clankerPlay.player : crew.player;
  const exteriorRampGuides = (player) => {
    const eye = camera.position, p = player.root.position, feet = p.y - (player.gorilla ? 0 : player.baseY);
    // The exception is for the descent, not the flat entrance corridor or an eye in another room/window.
    if (feet >= -0.1) return false;
    const outside = !island.onLand(eye.x, eye.z)
      || eye.y < -Math.ceil(island.undersideDepthAt(Math.hypot(eye.x, eye.z)) / island.unit) * island.unit;
    if (!outside) return false;
    for (let layer = 0; layer < 2; layer++) if (island.rampColumnAt(p.x, p.z, !!layer, GUIDE_RAMP_COLUMN)
      && feet >= GUIDE_RAMP_COLUMN.floor - 0.3 && feet < GUIDE_RAMP_COLUMN.ceiling) return true;
    return false;
  };
  const guideEyeAt = (player, out) => {
    if (player.gorilla) {
      const head = player.gorilla.parts.head, bounds = BL.scene.boundsOf(head.geometry);
      // The overlay follows rendering, so this is the current posed head,
      // including the low walking stance and a head resting on its pillow.
      math.mat4.transformPoint(GUIDE_EYE, head.world, bounds.center[0], bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.65, bounds.max[2] + 0.01);
      setVec(out, GUIDE_EYE[0], GUIDE_EYE[1], GUIDE_EYE[2]);
      return;
    }
    // A full turn uses one stable eye anchor, independent of current head yaw.
    // A resting head keeps the same pillow clearance as first person.
    cameraHeadAt(out, player);
    if (!crew.sleeping) out.y += player.viewLift;
  };
  const GUIDE_ACTOR_FORWARD = new Float64Array(3);
  const guideActorVisibleAt = (x, y, z) => {
    const p = camera.position, dx = x - p.x, dy = y - p.y, dz = z - p.z;
    const depth = dx * GUIDE_ACTOR_FORWARD[0] + dy * GUIDE_ACTOR_FORWARD[1] + dz * GUIDE_ACTOR_FORWARD[2];
    const start = camera.near / depth, end = 1 - 0.018 / Math.hypot(dx, dy, dz);
    if (end <= start) return false;
    const ax = p.x + dx * start, ay = p.y + dy * start, az = p.z + dz * start, bx = p.x + dx * end, by = p.y + dy * end, bz = p.z + dz * end;
    const player = controlledGuideActor();
    return guideSegmentClear(ax, ay, az, bx, by, bz) && objectGuides.cameraClear(ax, ay, az, bx, by, bz, player, player.root);
  };
  // Built with the visit; deferring past first paint was tried and reverted.
  // The build blocks the main thread ~0.5 s with no paint: the curtain jumps and camera easing loses that time.
  const ensureRockGuides = () => rockGuides
    || (rockGuides = BL.rockGuides.create({ island, sealed: sealedCaves }));
  const trackMirrorObject = (node, radius, vertexCapacity) => {
    entropyLab?.phase?.body?.track(node, radius, vertexCapacity);
    for (const veil of caveVeils) veil.phase?.body.track(node, radius, vertexCapacity);
    return mirrorCave?.body?.track(node, radius, vertexCapacity);
  };
  const untrackMirrorObject = (node) => {
    entropyLab?.phase?.body?.untrack(node);
    for (const veil of caveVeils) veil.phase?.body.untrack(node);
    return mirrorCave?.body?.untrack(node);
  };
  const refreshMirrorObject = (node) => {
    mirrorCave?.body?.refresh(node);
    entropyLab?.phase?.body?.refresh(node);
    for (const veil of caveVeils) veil.phase?.body.refresh(node);
    if (crew) for (let i = 0; i < crew.list.length; i++) {
      const actor = crew.list[i];
      if (actor.root !== node) continue;
      MIRROR_ACTOR_RADII.delete(actor);
      mirrorActorRadius(actor);
      break;
    }
  };
  // Surface movement uses the gorilla centre; lab and climbing transitions
  // still check their posed geometry.
  let clankerPassingEntry = null;
  const clankerEntering = entry => !!entry && !entry.rage.active && (entry.planningEntry || !entry.controlled && entry.mode === "working"
    && entry.phase === "travel" && (entry.route === "apron" || entry.route === "enter"));
  const clankerLabWorker = entry => !!entry && !entry.rage.active && !entry.controlled && entry.mode === "working"
    && (entry.route === "exit" && clankers?.sites[entry.fromSite]?.mouth === entropyLab.mouth
      || clankers?.sites[entry.site]?.mouth === entropyLab.mouth && (entry.motion.lab || entry.planningLab));
  const clankerPassingPeer = (entry, other) => !!entry
    && (entry === clankerPassingEntry || clankerEntering(entry) || clankerLabWorker(entry)) && other !== entry;
  const clankerSatelliteLandAt = (x, y, z, radius) => {
    // The rounded underside's balconies extend past the surface land mask.
    // Admit their actual footing so a window landing can continue walking.
    const terrainFloor = island.supportAt(x, z, y, STEP_MAX, -Infinity, radius);
    if (Number.isFinite(terrainFloor) && Math.abs(terrainFloor - y) <= STEP_MAX) return true;
    let admitted = false;
    if (mempoolIsland) {
      const p = mempoolIsland.place, s = poolModels.SITE, dx = x - p.x, dz = z - p.z;
      const cos = mempoolIsland.cos, sin = mempoolIsland.sin;
      const across = dx * cos - dz * sin, along = dx * sin + dz * cos;
      const reach = radius;
      const bridge = Math.abs(across) + reach < s.width / 2
        && along >= p.bridgeLocalZ + s.deckStart - reach && along <= p.bridgeLocalZ + s.span + reach;
      admitted = bridge || mempoolIsland.layout.onIsland(across, along, reach);
    }
    // These floors are solid-prop meshes outside the main terrain's domain.
    // Use the queried footprint circle, not the complete body's bounding
    // radius: its three aligned circles fit the narrow wooden crossings.
    if (!admitted && timechainIsland) {
      const p = timechainIsland.place, s = BL.timechainModels.SITE, dx = x - p.x, dz = z - p.z;
      const cos = timechainIsland.cos, sin = timechainIsland.sin;
      const across = dx * cos - dz * sin, along = dx * sin + dz * cos;
      const bridge = Math.abs(across) + radius <= s.width / 2 + 1e-7
        && along >= p.bridgeZ - radius && along <= p.bridgeZ + s.span + 0.5 + radius;
      admitted = bridge || Math.hypot(dx, dz) + radius < s.radius;
    }
    if (!admitted && bifrostIsle) admitted = bifrostIsle.site.groundAt(x, z) > -Infinity;
    if (!admitted) return false;
    const support = solids.supportAt(x, z, y, STEP_MAX, radius);
    return support > -Infinity && support <= y + STEP_MAX && support >= y - 3.5;
  };
  const clankerPeersClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading, strictEnd = false) => {
    if (!clankers || clankerEntering(entry) || clankerLabWorker(entry)) return true;
    for (const other of clankers.list) {
      if (other === entry || !other.active) continue;
      const p = other.root.position, shape = BL.agent.torso;
      // A pose preview has already installed the destination trunk. Do not
      // mistake its expansion into a neighbour for escaping an old overlap.
      if (strictEnd && shape.overlaps(entry, toX, toY, toZ, toHeading,
        other, p.x, p.y, p.z, other.heading, 0.03)) return false;
      if (!shape.separates(entry, x, y, z, fromHeading, toX, toY, toZ, toHeading,
        other, p.x, p.y, p.z, other.heading, 0.03)) return false;
    }
    return true;
  };
  const clankerCylinderClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null, climbing = false, actors = true, checkTerrain = true, toRadius = radius, toHeight = height, skipClimbMasonry = false) => {
    const fromRadius = radius, fromHeight = height;
    radius = Math.max(radius, toRadius); height = Math.max(height, toHeight);
    const floor = y + 0.002, toFloor = toY + 0.002, body = height - 0.002;
    if (!climbing && !island.onLand(toX, toZ) && !clankerSatelliteLandAt(toX, toY, toZ, radius) || crossesSealedCave(x, z, toX, toZ, y)
      || checkTerrain && (!island.clearAt(toX, toFloor, toZ, radius, body)
        || !island.voxelSegmentClearAt(x, floor, z, toX, toFloor, toZ, radius, body))
      || !solids.segmentClear(x, floor, z, toX, toFloor, toZ, fromRadius, fromHeight - 0.002, ignore, toRadius, toHeight - 0.002, !!entry && !climbing, skipClimbMasonry, false, !!entry?.rage?.active)
      || !matrixGateSegmentClear(x, floor, z, toX, toFloor, toZ, radius, body, true)) return false;
    if ((!entry || !entry.controlled) && !npcFireClear(x, y, z, toX, toY, toZ, height)) return false;
    if (!actors) return true;
    if (clankers) for (let i = 0; i < clankers.list.length; i++) {
      const other = clankers.list[i];
      if (other !== entry && other !== ignore && other.active && !clankerPassingPeer(entry, other)
        && !clankerBodySegmentClear(other, x, floor, z, toX, toFloor, toZ, radius, body)) return false;
    }
    return true;
  };
  const clankerFireDistance = (x, z, heading, hazard, forward, halfForward, halfSide) => {
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    const dx = hazard.x - x - sine * forward, dz = hazard.z - z - cosine * forward;
    const along = Math.max(0, Math.abs(dx * sine + dz * cosine) - halfForward);
    const across = Math.max(0, Math.abs(dx * cosine - dz * sine) - halfSide);
    return along * along + across * across;
  };
  const clankerFireClear = (entry, x, y, z, toX, toY, toZ, fromHeading = entry.heading, toHeading = fromHeading) => {
    if (entry.controlled) return true;
    // Prop-height blending can leave the rendered feet below their support
    // position. Keep that lower body inside the pit's avoidance height band.
    const offset = Math.min(0, entry.motion.supportOffset);
    y += offset; toY += offset;
    const rect = clankerRectangleAt(entry, CLANKER_RECTANGLE);
    const forward = rect.centerForward, halfForward = rect.halfForward + 0.1, halfSide = rect.halfSide + 0.1;
    const dx = toX - x, dz = toZ - z;
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    for (const hazard of fireHazards) {
      if (!hazard.pit.visible || Math.max(y, toY) + entry.height <= hazard.y + FIRE_BOTTOM
        || Math.min(y, toY) >= hazard.y + FIRE_TOP) continue;
      const reach = hazard.avoidRadius + Math.max(Math.abs(forward) + halfForward, halfSide);
      const hx = x - hazard.x, hz = z - hazard.z;
      const t = dx * dx + dz * dz ? clamp(-(hx * dx + hz * dz) / (dx * dx + dz * dz), 0, 1) : 0;
      if ((hx + dx * t) ** 2 + (hz + dz * t) ** 2 >= reach * reach) continue;
      const radius2 = hazard.avoidRadius ** 2;
      // A gorilla already inside the margin may walk out instead of being trapped there.
      if (clankerFireDistance(x, z, fromHeading, hazard, forward, halfForward, halfSide) < radius2
        && (hx + dx) ** 2 + (hz + dz) ** 2 > hx * hx + hz * hz
        && hx * dx + hz * dz >= 0) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25), Math.ceil(Math.abs(turn) / 0.15));
      for (let i = 0; i <= steps; i++) {
        const a = i / steps;
        if (clankerFireDistance(x + dx * a, z + dz * a, fromHeading + turn * a,
          hazard, forward, halfForward, halfSide) < radius2) return false;
      }
    }
    return true;
  };
  const CLANKER_CORE_RADIUS = 0.025;
  const clankerCenterClear = (entry, x, y, z, toX, toY, toZ, allowOffLand = false,
    fromHeading = entry.heading, toHeading = fromHeading) => {
    const radius = CLANKER_CORE_RADIUS, centerY = 0.65, height = 0.12;
    const from = y + centerY, to = toY + centerY;
    // A center brushing a step behind it may move away; new or inward contact still blocks.
    if (!allowOffLand && !island.onLand(toX, toZ) && !clankerSatelliteLandAt(toX, toY, toZ, radius)
      || crossesSealedCave(x, z, toX, toZ, y)
      || !island.clearAt(toX, to, toZ, radius, height)
      || !island.voxelSegmentClearAt(x, from, z, toX, to, toZ, radius, height)
      || !solids.segmentClear(x, from, z, toX, to, toZ, radius, height, null, radius, height, true, false, !entry.drive.airborne && !entry.jump.active, entry.rage.active)
      || !matrixGateSegmentClear(x, from, z, toX, to, toZ, radius, height, true)) return false;
    return clankerFireClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading);
  };
  const CLANKER_CORE_FROM = { x: 0, y: 0, z: 0 }, CLANKER_CORE_TO = { x: 0, y: 0, z: 0 };
  const clankerWalkCoreAt = (entry, x, y, z, heading, out) => {
    const scale = entry.root.scale.x, hip = entry.gorilla.hips.position.y * scale;
    let forward = (entry.parked || entry.biped ? 0.19 : 0.7) * scale, lift = 0.85 * scale, side = 0;
    if (clankerGroundPlaneAt(x, y, z, heading, CLANKER_WALK_PLANE)) {
      // Rotate around the rig's hip, matching its pitch and roll. An unbounded
      // slope * forward offset puts the trunk below its feet when descending.
      const along = CLANKER_WALK_PLANE.groundZ, norm = Math.hypot(1, along);
      const across = CLANKER_WALK_PLANE.groundX / norm, rollNorm = Math.hypot(1, across);
      const relative = (lift - hip) / rollNorm;
      side = -(lift - hip) * across / rollNorm;
      lift = hip + (relative + along * forward) / norm;
      forward = (forward - along * relative) / norm;
      // Downhill pitch must not put the trunk core below the lower contact
      // ray, where a legal tread would be mistaken for a blocking wall.
      lift = Math.max(lift, 0.65 * scale);
    }
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    out.x = x + sine * forward + cosine * side;
    out.y = y + lift; out.z = z + cosine * forward - sine * side;
  };
  // Ground-plane fitting can widen a trunk after its center step was admitted.
  // Reuse the pose preview near peers, retaining the old shape for overlap escape.
  const CLANKER_PEER_FROM = { root: { scale: { x: 1 } }, gorilla: { torsoSitCompact: false, torsoLabCompact: false, torsoStandCompact: false, torsoQuadCompact: false, torsoRadius: 0 }, height: 0, x: 0, y: 0, z: 0, heading: 0 };
  let clankerPeerPoseChecked = false, clankerPeerPoseClear = true;
  const clankerPeerEmptyStone = () => false;
  // The callback checks peers and the captive; no gorilla terrain sample is needed.
  clankerPeerEmptyStone.emptySolid = true;
  let clankerCarryPoseChecked = false, clankerCarryPoseClear = true;
  const clankerCarryPoseTransition = entry => {
    if (!clankerCarryPoseChecked) {
      clankerCarryPoseChecked = true;
      clankerCarryPoseClear = capturedPosePreview(entry);
    }
    return clankerCarryPoseClear;
  };
  const rageJumpPoseClear = (entry, dt, x, y, z, speed, airborne) => {
    clankerCarryPoseChecked = false; clankerCarryPoseClear = true;
    // Check the animated hand and held limbs before committing jump progress.
    // The jump's own sweep already proves the gorilla's arc against scenery.
    const motion = entry.motion, supportOffset = motion.supportOffset;
    motion.supportOffset = damp(supportOffset, 0, 10, dt);
    try {
      return entry.gorilla.climbPoseClear(dt, x, y, z, entry.heading,
        motion, clankerPeerEmptyStone, clankerCarryPoseTransition, entry, speed,
        false, "", null, 0, null, null, null, entry.biped, airborne);
    } finally { motion.supportOffset = supportOffset; }
  };
  const clankerPeerPoseTransition = entry => {
    if (clankerPeerPoseChecked) return clankerPeerPoseClear;
    clankerPeerPoseChecked = true;
    const shape = BL.agent.torso, p = entry.root.position, from = CLANKER_PEER_FROM;
    for (const other of clankers.list) {
      if (other === entry || !other.active) continue;
      const q = other.root.position;
      if (shape.overlaps(entry, p.x, p.y, p.z, entry.root.rotation.y,
        other, q.x, q.y, q.z, other.heading, 0.03)
        && !shape.overlaps(from, from.x, from.y, from.z, from.heading,
          other, q.x, q.y, q.z, other.heading, 0.03)) return clankerPeerPoseClear = false;
      if (!shape.separates(entry, from.x, from.y, from.z, from.heading,
        p.x, p.y, p.z, entry.root.rotation.y, other, q.x, q.y, q.z, other.heading, 0.03))
        return clankerPeerPoseClear = false;
    }
    return clankerPeerPoseClear = capturedPosePreview(entry);
  };
  const clankerWalkingPeersClear = (entry, dt, x, y, z) => {
    const p = entry.root.position, nx = p.x, ny = p.y, nz = p.z, heading = entry.root.rotation.y, nextHeading = entry.heading;
    if (!clankers || entry.controlled || entry.planningRoam || entry.drive.airborne
      || entry.fire.rolling || clankerEntering(entry) || clankerLabWorker(entry)) return true;
    let near = false;
    for (const other of clankers.list) if (other !== entry && other.active
      && Math.hypot(other.root.position.x - nx, other.root.position.z - nz)
      < 2 * (entry.root.scale.x + other.root.scale.x) + Math.hypot(nx - x, nz - z)) { near = true; break; }
    if (!near && !(entry.capture?.cave && entry.capture.autonomous)) return true;
    const from = CLANKER_PEER_FROM, g = entry.gorilla, copy = from.gorilla;
    from.x = x; from.y = y; from.z = z; from.heading = heading;
    from.height = entry.height; from.root.scale.x = entry.root.scale.x;
    copy.torsoSitCompact = g.torsoSitCompact; copy.torsoLabCompact = g.torsoLabCompact;
    copy.torsoStandCompact = g.torsoStandCompact; copy.torsoQuadCompact = g.torsoQuadCompact;
    copy.torsoRadius = g.torsoRadius;
    clankerPeerPoseChecked = false; clankerPeerPoseClear = true;
    // Standing coworkers keep the same stance in this preview and the live pose.
    return g.climbPoseClear(dt, nx, ny, nz, nextHeading,
      entry.motion, clankerPeerEmptyStone, clankerPeerPoseTransition, entry, entry.speed,
      false, "", null, 0, null, null, null, entry.biped);
  };
  const clankerWalkCoreClear = (entry, x, y, z, toX, toY, toZ, fromHeading, toHeading) => {
    // Protect the trunk near the middle of the support rectangle, not just
    // the pelvis point behind it. This extra core applies to island stone;
    // props keep their existing center clearance and blended support.
    // A planted turn remains available to face away from a contacted wall.
    if (x === toX && z === toZ || entry.drive.airborne || entry.fire.rolling) return true;
    const scale = entry.root.scale.x, radius = 0.34 * scale, height = 0.12 * scale;
    const turn = Math.atan2(Math.sin(toHeading - fromHeading), Math.cos(toHeading - fromHeading));
    const steps = Math.max(1, Math.ceil(Math.abs(turn) / 0.15));
    const from = CLANKER_CORE_FROM, to = CLANKER_CORE_TO;
    clankerWalkCoreAt(entry, x, y, z, fromHeading, from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, heading = fromHeading + turn * t;
      clankerWalkCoreAt(entry, x + (toX - x) * t, y + (toY - y) * t, z + (toZ - z) * t, heading, to);
      if (!island.clearAt(to.x, to.y, to.z, radius, height)
        || !island.voxelSegmentClearAt(from.x, from.y, from.z, to.x, to.y, to.z, radius, height)) return false;
      from.x = to.x; from.y = to.y; from.z = to.z;
    }
    return true;
  };
  const clankerOpeningClear = (entry, x, y, z, toX, toY, toZ) => {
    // An upright climber can swing its feet through a window before the
    // broader walking rectangle follows. Check the actual foot path as well
    // as the trunk core; a stone sill or a prop must remain solid.
    const radius = 0.025, from = y + 0.08, to = toY + 0.08;
    return clankerCenterClear(entry, x, y, z, toX, toY, toZ, true)
      && island.clearAt(toX, to, toZ, radius, 0.12)
      && island.voxelSegmentClearAt(x, from, z, toX, to, toZ, radius, 0.12)
      && solids.segmentClear(x, from, z, toX, to, toZ, radius, 0.12, null, radius, 0.12, true, false, false, entry.rage.active);
  };
  const clankerPlatformEntryAt = (x, y, z, out) => {
    const hq = island.headquarters, radius = Math.hypot(x, z), angle = Math.atan2(x, -z);
    for (let level = 0; level < 2; level++) {
      const balconies = level ? hq.basement.balconies : hq.balconies;
      for (let i = 0; i < balconies.length; i++) {
        const platform = balconies[i];
        if (angle <= platform.startAngle || angle >= platform.endAngle
          || y < platform.floor - 0.1 || y > platform.ceiling + 2.4
          || radius < Math.min(platform.radius, platform.openingRadius) - 4
          || radius > Math.max(platform.radius, platform.openingRadius) + 2.5) continue;
        // The root trails the front of the walking rectangle. Capture it
        // before the projecting lip blocks its descent, and place its feet
        // well inside the opening rather than at the outer floor edge.
        const landingRadius = Math.min(platform.radius, platform.openingRadius) - 2.6;
        out.x = x * landingRadius / radius; out.z = z * landingRadius / radius;
        out.y = platform.floor; out.heading = Math.atan2(-x, -z);
        out.radius = Math.max(platform.radius, platform.openingRadius) + 0.75;
        return true;
      }
    }
    return false;
  };
  const clankerRigClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading) => {
    // Only a complete companion uses its posed rig for this sweep.
    if (!entry || ignore || radius !== entry.radius || height !== entry.height) {
      return clankerCylinderClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore);
    }
    // The climbing handoff places the feet on the inner floor before the
    // quadruped body clears the window. Keep its certified center/foot sweep
    // through the throat, then restore the ordinary walking envelope.
    const exit = entry.climb;
    if (exit.openingExit && !exit.active) {
      const sx = Math.sin(exit.openingExitHeading), sz = Math.cos(exit.openingExitHeading);
      const from = (x - exit.openingExitX) * sx + (z - exit.openingExitZ) * sz;
      const to = (toX - exit.openingExitX) * sx + (toZ - exit.openingExitZ) * sz;
      const side = (toX - exit.openingExitX) * sz - (toZ - exit.openingExitZ) * sx;
      if (from >= -0.05 && to >= -0.05 && to < 2.4 && Math.abs(side) < 1.1)
        return clankerOpeningClear(entry, x, y, z, toX, toY, toZ);
    }
    // Rage keeps the same quadruped and capture sweeps through cave mouths;
    // crossing the lab threshold never reserves an upright worker pose.
    if ((entry.rage.active || !entry.motion.lab && !entry.planningLab && !entropyLab.phase.inside(toX, toY, toZ))
      && !entry.climb.active)
      return clankerCenterClear(entry, x, y, z, toX, toY, toZ,
        entry.drive.airborne && !entry.drive.passiveFall, fromHeading, toHeading)
        && clankerWalkCoreClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading);
    // The outdoor footprint catches lab benches during a vertical jump;
    // check the same upright rig that already fits between them on foot.
    const labPose = !entry.rage.active && (entry.planningLab || entropyLab.phase.inside(toX, toY, toZ)
      && (entry.controlled && entry.motion.lab && entry.drive.airborne
        || !entry.gorilla.motionActive && !entry.pound && !entry.beat && !entry.climb.active));
    if (labPose) return entry.gorilla.labPoseClear(entry.planningLab ? 2 : entry.motion.labDt || 1 / 60,
      toX, toY, toZ, toHeading, entry.speed, entry.planningLab ? entry.planningLabWork : entry.motion.labWork,
      entry.motion.labPhase, entry.planningLab ? entry.planningLabSide : entry.motion.labSide,
      island.solidAt, clankerClimbTransitionClear, entry, entry.planningLab || !entry.motion.lab);
    // Crossing the entrance changes the rig immediately. Reserve the outside
    // quadruped before leaving, while the current upright body is still narrow.
    if (!entry.rage.active && entry.motion.lab && !entry.gorilla.motionActive && !entry.climb.active) {
      clankerExitBodyPending = true;
      if (!entry.gorilla.labPoseClear(2, toX, toY, toZ, toHeading, entry.speed, "", 0, 1,
        island.solidAt, clankerExitTransitionClear, entry, true, false)) return false;
    }
    // A controlled smash moves on the ordinary walking footprint. Its raised
    // fists still animate and hit, but cannot halt travel on a terrain tread.
    if (!(entry.controlled && entry.actionControlled) && (!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (entry.planningRoam || entry.footprintMode === "walk")
      && (clankerGroundPlaneAt(x, y, z, fromHeading, CLANKER_WALK_PLANE)
        || clankerGroundPlaneAt(toX, toY, toZ, toHeading, CLANKER_WALK_PLANE))) {
      const p = entry.root.position;
      const planning = entry.planningRoam || Math.hypot(x - p.x, y - p.y, z - p.z) > 0.001;
      entry.walkPoseChecked = true;
      return entry.gorilla.walkPoseClear(x, y, z, toX, toY, toZ, fromHeading, toHeading,
        entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, island.hullClearAt,
        entry, planning ? 1 / 30 : entry.motion.labDt || 1 / 60, planning ? 0 : entry.speed, planning);
    }
    if (!(entry.controlled && entry.actionControlled) && (!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (entry.planningRoam || entry.footprintMode === "walk")
      && (entry.motion.supportOffset < -0.001 || clankerTerraceAt(x, y, z, fromHeading)
        || clankerTerraceAt(toX, toY, toZ, toHeading))) {
      const p = entry.root.position;
      const planning = entry.planningRoam || Math.hypot(x - p.x, y - p.y, z - p.z) > 0.001;
      entry.walkPoseChecked = true;
      const dt = planning ? 1 / 30 : entry.motion.labDt || 1 / 60, offset = entry.motion.supportOffset;
      const dx = toX - x, dz = toZ - z;
      const speed = planning ? 0 : Math.hypot(dx, dz) / dt
        * (dx * Math.sin(toHeading) + dz * Math.cos(toHeading) < 0 ? -1 : 1);
      entry.motion.supportOffset = planning ? 0 : Math.max(-1.02, Math.min(1.02,
        offset + (entry.drive.passiveFall ? 0 : y - toY))) * Math.exp(-12 * dt);
      let clear;
      try {
        clear = entry.gorilla.walkPoseClear(x, y, z, toX, toY, toZ, fromHeading, toHeading,
          entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, island.hullClearAt,
          entry, dt, speed, planning);
        if (clear) {
          entry.motion.supportOffset = 0;
          clear = entry.gorilla.walkPoseClear(toX, toY, toZ, toX, toY, toZ, toHeading, toHeading,
            entry.motion, clankerWalkSolidAt, clankerWalkTransitionClear, island.hullClearAt,
            entry, 2, 0, true);
        }
      } finally { entry.motion.supportOffset = offset; }
      return clear;
    }
    return BL.agent.footprint.sweep(entry, x, y, z, toX, toY, toZ, radius, height,
      fromHeading, toHeading, clankerCylinderClear, ignore);
  };
  const CLANKER_WALK_PLANE = { groundX: 0, groundY: 0, groundZ: 0 };
  const clankerWalkSolidAt = (x, y, z) => !island.clearAt(x, y, z, 0, 0);
  const clankerWalkTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height,
    actors, riders, toRadius, toHeight) => clankerCylinderClear(x, y, z, nx, ny, nz,
      radius, height, entry, null, false, actors, false, toRadius, toHeight);
  const CLANKER_REST_FOOTING = { lab: false, supportOffset: 0 };
  const clankerPointFootingAt = (x, z, y, skipRageProps = false) => Math.max(
    island.supportAt(x, z, y, 0.02, ABYSS_FLOOR), solids.supportAt(x, z, y, 0.02, 0, null, null, false, null, skipRageProps));
  const clankerRestFootingClear = (entry, x, y, z, heading) => {
    if (entry.rage.active || !entropyLab.phase.inside(x, y, z))
      return clankerCenterClear(entry, x, y, z, x, y, z, false, heading, heading)
        && Math.abs(clankerPointFootingAt(x, z, y, entry.rage.active) - y) < 0.1;
    CLANKER_REST_FOOTING.lab = entropyLab.phase.inside(x, y, z);
    return entry.gorilla.walkPoseClear(x, y, z, x, y, z, heading, heading,
      CLANKER_REST_FOOTING, clankerWalkSolidAt, clankerWalkTransitionClear,
      island.hullClearAt, entry, 2, 0, true, clankerPointFootingAt);
  };
  const clankerClear = (x, y, z, toX, toY, toZ, radius, height, entry = null, ignore = null,
    fromHeading = entry ? entry.heading : 0, toHeading = fromHeading) => {
    if (entry) entry.walkPoseChecked = false;
    const previousEntry = clankerPassingEntry;
    // A lab crowd overlap must not trap an airborne gorilla at its current XZ.
    // Keep peer checks on every step with horizontal travel.
    const verticalLabJump = entry && entry.controlled && entry.motion.lab && entry.drive.airborne
      && x === toX && z === toZ;
    clankerPassingEntry = verticalLabJump ? entry : null;
    try {
      if (entry && !ignore && clankers && radius === entry.radius && height === entry.height && !entry.climb.active) {
        clankerPassingEntry = entry;
        // Surface NPCs sweep their trunks against peers too. The old centre
        // check admitted torso pileups that the climbing checks could not clear.
        // Human controls retain the permissive surface movement.
        if (!verticalLabJump && !entry.planningLabTraffic && !entry.planningRoam && (entry.motion.lab || !entry.controlled)
          && !clankerPeersClear(entry, x, y, z, toX, toY, toZ, fromHeading, toHeading)) return false;
      }
      return clankerRigClear(x, y, z, toX, toY, toZ, radius, height, entry, ignore, fromHeading, toHeading);
    } finally {
      clankerPassingEntry = previousEntry;
    }
  };
  const clankerClimbClear = (entry, x, y, z, nx, ny, nz, radius, height, riders = true, actors = true, peers = true, terrain = true) => {
    const previous = clankerPassingEntry;
    if (!peers) clankerPassingEntry = entry;
    try {
      return clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, null, true, actors, terrain,
        radius, height, !terrain);
    } finally { clankerPassingEntry = previous; }
  };
  // At a lip the bent rig fits where a tall cylinder cannot. The controller
  // checks that exact terrain pose; scenery and other gorillas stay solid.
  const clankerClimbTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors = true, riders = true, toRadius = radius, toHeight = height, peers = true, part = null, hull = null) => {
    const previous = clankerPassingEntry;
    if (!peers) clankerPassingEntry = entry;
    const bench = (entry.motion.lab || entry.planningLab) && part === entry.gorilla.parts.armL ? entry.gorilla.labPickupBench : null;
    const station = entropyLab.stations[entry.planningLabStation >= 0 ? entry.planningLabStation : entry.lab.station];
    // Only the assigned touchscreen's working arm may contact its screen.
    // The torso, other arm, benches and cave walls retain their full collision.
    const screen = (entry.motion.lab || entry.planningLab) && station?.kind === "touch"
      && part === (station.side < 0 ? entry.gorilla.parts.armR : entry.gorilla.parts.armL) ? station.contact : null;
    const contact = bench || screen;
    try {
      if (clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, contact, true, actors, false, toRadius, toHeight)) return true;
      if (!hull || contact) return false;
      // Circular arm slices include empty corners beside a real masonry grip.
      // The complete, uninset swept part box must clear every slab of one rim
      // before that same slice may omit it; every other blocker stays checked.
      const reach = Math.max(radius, toRadius);
      for (let i = 0; i < climbMasonry.length; i++) {
        const row = climbMasonry[i];
        if (Math.max(x, nx) + reach < row.minX || Math.min(x, nx) - reach > row.maxX
          || Math.max(z, nz) + reach < row.minZ || Math.min(z, nz) - reach > row.maxZ
          || Math.max(y + height, ny + toHeight) < row.minY || Math.min(y, ny) > row.maxY
          || !solids.isActive(row.node)) continue;
        let clear = true;
        for (let j = 0; j < row.boxes.length; j++) if (BL.convex.hullsOverlap(hull, row.boxes[j])) { clear = false; break; }
        if (clear && clankerCylinderClear(x, y, z, nx, ny, nz, radius, height, entry, row.node, true, actors, false, toRadius, toHeight)) return true;
      }
      return false;
    } finally { clankerPassingEntry = previous; }
  };
  clankerClimbTransitionClear.needsHull = true;
  const clankerRestTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    const c = entry.climb;
    if (c.peerCheck) {
      c.peerCheck = false;
      const p = entry.root.position;
      if (!clankerPeersClear(entry, c.peerX, c.peerY, c.peerZ, p.x, p.y, p.z,
        c.peerHeading, entry.root.rotation.y, true)) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz,
      radius, height, actors, riders, toRadius, toHeight, false);
  };
  const clankerRestPoseClear = (entry, dt, lounge, staticPose = false,
    x = entry.root.position.x, y = entry.root.position.y, z = entry.root.position.z, heading = entry.heading, fromLounge = null, sequenceStep = 0) => {
    const p = entry.root.position, c = entry.climb;
    const sx = staticPose ? x : p.x, sy = staticPose ? y : p.y, sz = staticPose ? z : p.z;
    const fromHeading = staticPose ? heading : entry.heading;
    if (!entry.motion.lab && !clankerCenterClear(entry, sx, sy, sz, x, y, z, false, fromHeading, heading)) return false;
    c.peerX = sx; c.peerY = sy; c.peerZ = sz; c.peerHeading = fromHeading; c.peerCheck = true;
    try {
      return entry.gorilla.climbPoseClear(dt, x, y, z, heading, entry.motion,
        island.solidAt, clankerRestTransitionClear, entry, 0, staticPose, lounge, fromLounge, sequenceStep);
    } finally { c.peerCheck = false; }
  };
  clankerRestTransitionClear.beginPose = entry => { entry.climb.peerCheck = true; };
  let clankerExitBodyPending = false;
  const clankerExitTransitionClear = (entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight) => {
    if (clankerExitBodyPending) {
      clankerExitBodyPending = false;
      const mode = entry.footprintMode, compact = entry.compact, previousRadius = entry.radius, previousHeight = entry.height, p = entry.root.position;
      // The rig is temporarily in its real future pose here. Reserve the same
      // walking envelope the controller will use immediately outside the lab.
      entry.footprintMode = "pound"; entry.compact = entry.gorilla.poundCompact;
      entry.radius = Math.max(BL.clankers.WALK_RADIUS, entry.gorilla.bodyRadius + 0.1);
      entry.height = Math.max(BL.clankers.WALK_HEIGHT, entry.gorilla.bodyHeight + 0.04);
      let clear = true;
      // NPC lab departures retain their coworker passing policy while the
      // body opens outside. A queued upright trunk cannot veto that handoff.
      if (!clankerLabWorker(entry) && !clankerEntering(entry)) for (const other of clankers.list) {
        if (other === entry || !other.active) continue;
        const q = other.root.position;
        const shape = clankerPassingPeer(entry, other) ? BL.agent.torso : BL.agent.footprint;
        if (shape.overlaps(entry, p.x, p.y, p.z, entry.root.rotation.y,
          other, q.x, q.y, q.z, other.heading, 0.03)) { clear = false; break; }
      }
      entry.footprintMode = mode; entry.compact = compact;
      entry.radius = previousRadius; entry.height = previousHeight;
      if (!clear) return false;
    }
    return clankerClimbTransitionClear(entry, x, y, z, nx, ny, nz, radius, height, actors, riders, toRadius, toHeight);
  };
  const clankerGroomClear = (entry, partner) => {
    const p = entry.root.position, sine = Math.sin(entry.heading), cosine = Math.cos(entry.heading), side = entry.motion.groomSide;
    const x = p.x + cosine * side * 0.7 + sine * 0.3, z = p.z - sine * side * 0.7 + cosine * 0.3;
    const nx = p.x + cosine * side * 1.55 + sine * 0.55, nz = p.z - sine * side * 1.55 + cosine * 0.55;
    return clankerCylinderClear(x, p.y + 1.1, z, nx, p.y + 1.1, nz, 0.22, 0.5, entry, partner);
  };
  const FIRE_BODY_PARTS = ["torso", "head", "jaw", "armR", "armL", "legR", "legL"];
  const FIRE_PART_ROT = new Float64Array(9);
  const FIRE_PART_ABS = new Float64Array(9), FIRE_PART_EXTENT = new Float64Array(3);
  const FIRE_PART_TRANSLATION = new Float64Array(3), FIRE_PART_LOCAL = new Float64Array(3);
  const fireBoxTouchesPart = (part, fx, fy, fz, hx, hy, hz, dx, dy, dz) => {
    const b = BL.scene.boundsOf(part.geometry), m = part.world;
    const cx = m[0] * b.center[0] + m[4] * b.center[1] + m[8] * b.center[2] + m[12] + dx;
    const cy = m[1] * b.center[0] + m[5] * b.center[1] + m[9] * b.center[2] + m[13] + dy;
    const cz = m[2] * b.center[0] + m[6] * b.center[1] + m[10] * b.center[2] + m[14] + dz;
    const t = FIRE_PART_TRANSLATION, local = FIRE_PART_LOCAL, extent = FIRE_PART_EXTENT;
    const rotation = FIRE_PART_ROT, absolute = FIRE_PART_ABS;
    t[0] = fx - cx; t[1] = fy - cy; t[2] = fz - cz;
    for (let i = 0; i < 3; i++) {
      const col = i * 4, row = i * 3;
      const length = Math.hypot(m[col], m[col + 1], m[col + 2]);
      extent[i] = (b.max[i] - b.min[i]) * length * 0.5;
      for (let j = 0; j < 3; j++) {
        const axis = m[col + j] / length;
        rotation[row + j] = axis;
        absolute[row + j] = Math.abs(axis);
      }
      local[i] = t[0] * rotation[row] + t[1] * rotation[row + 1] + t[2] * rotation[row + 2];
    }
    const half = FIRE_FLAME_HALF;
    half[0] = hx; half[1] = hy; half[2] = hz;
    for (let i = 0; i < 3; i++) {
      const row = i * 3;
      if (Math.abs(local[i]) > extent[i] + half[0] * absolute[row] + half[1] * absolute[row + 1] + half[2] * absolute[row + 2]) return false;
      if (Math.abs(t[i]) > half[i] + extent[0] * absolute[i] + extent[1] * absolute[3 + i] + extent[2] * absolute[6 + i]) return false;
    }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const a = (i + 1) % 3, b = (i + 2) % 3, c = (j + 1) % 3, d = (j + 2) % 3;
      if (Math.abs(local[b] * rotation[a * 3 + j] - local[a] * rotation[b * 3 + j])
        > extent[a] * absolute[b * 3 + j] + extent[b] * absolute[a * 3 + j]
        + half[c] * absolute[i * 3 + d] + half[d] * absolute[i * 3 + c]) return false;
    }
    return true;
  };
  const FIRE_FLAME_HALF = new Float64Array(3);
  const clankerFireContact = (entry, fromX, fromY, fromZ) => {
    if (entry.fire.burning || entry.fire.cooldown > 0) return false;
    const p = entry.root.position, parts = entry.gorilla.parts;
    const samples = Math.min(8, Math.max(1, Math.ceil(Math.hypot(p.x - fromX, p.y - fromY, p.z - fromZ) / 0.2)));
    let posed = false;
    for (let i = 0; i < fireHazards.length; i++) {
      const hazard = fireHazards[i];
      if (!hazard.node.visible) continue;
      const boxes = hazard.boxes;
      const reach = entry.gorilla.bodyRadius + 0.5;
      for (let s = 0; s <= samples; s++) {
        const k = s / samples, x = lerp(fromX, p.x, k), y = lerp(fromY, p.y, k), z = lerp(fromZ, p.z, k);
        if (Math.hypot(x - hazard.x, z - hazard.z) > reach) continue;
        if (!posed) { BL.scene.updateWorld(entry.root, root.world); posed = true; }
        for (let partIndex = 0; partIndex < FIRE_BODY_PARTS.length; partIndex++) {
          const part = parts[FIRE_BODY_PARTS[partIndex]];
          if (!part?.visible || !part.geometry) continue;
          for (let box = 0; box < boxes.length; box += 6) {
            if (fireBoxTouchesPart(part, hazard.x + boxes[box], hazard.y + boxes[box + 1], hazard.z + boxes[box + 2],
              boxes[box + 3], boxes[box + 4], boxes[box + 5], x - p.x, y - p.y, z - p.z)) return true;
          }
        }
      }
    }
    return false;
  };
  const updateClankerFireContacts = (reachable) => {
    const entries = clankers.list;
    // Snapshot the sources so a new contact cannot ignite a whole crowd in one frame.
    for (let i = 0; i < entries.length; i++) entries[i].fire.contactBurning = entries[i].fire.burning;
    for (let i = 0; i < entries.length; i++) {
      const source = entries[i];
      if (!source.active || !source.root.visible || !source.fire.contactBurning) continue;
      const p = source.root.position;
      for (let j = 0; j < entries.length; j++) {
        const target = entries[j];
        if (target === source || !target.active || !target.root.visible || target.fire.burning || target.fire.cooldown > 0) continue;
        const q = target.root.position;
        if (!BL.agent.footprint.overlaps(source, p.x, p.y, p.z, source.heading,
          target, q.x, q.y, q.z, target.heading, 0.06)) continue;
        const y = Math.max(p.y, q.y) + Math.min(source.height, target.height) * 0.5;
        if (reachable(p.x, y, p.z, q.x, y, q.z)) clankers.ignite(target);
      }
      for (let j = 0; j < crew.list.length; j++) {
        const cave = crew.list[j], q = cave.root.position, floor = q.y - cave.baseY;
        if (!cave.root.visible || cave.state === "away" || cave.camp.burning || cave.camp.cooldown > 0) continue;
        if (!BL.agent.footprint.circleOverlaps(source, p.x, p.y, p.z, source.heading,
          q.x, floor, q.z, 0.38, cave.bodyHeight, 0.06)) continue;
        const y = Math.max(p.y, floor) + Math.min(source.height, cave.bodyHeight) * 0.5;
        if (reachable(p.x, y, p.z, q.x, y, q.z)) crew.ignite(cave);
      }
    }
  };
  const canClankerSmash = (entry) => {
    const p = entry.root.position;
    // Keep the torso planted; the striking arms must be allowed to contact a
    // target. Their swept mesh supplies the hit instead of a radial damage area.
    return clankerCylinderClear(p.x, p.y, p.z, p.x, p.y, p.z, 0.8, 2.7, entry);
  };
  const clankerRectangleAt = (entry, out, climbingTop = false) => {
    const scale = entry.root.scale.x, upright = !climbingTop && (entry.parked || entry.biped);
    out.halfForward = (upright ? 0.825 : 1.5) * scale;
    out.halfSide = (upright ? 0.825 : 0.85) * scale;
    out.centerForward = (upright ? 0.19 : 0.7) * scale;
    return out;
  };
  const CLANKER_RECTANGLE = { halfForward: 0, halfSide: 0, centerForward: 0 };
  const CLANKER_TERRAIN_RAMP = { groundX: 0, groundZ: 0, uneven: 0 };
  const clankerSupportAt = (entry, x, z, y, step, heading = entry.heading, props = true) => {
    // Tree tops are landing surfaces for the driven gorilla, not floors for a roaming one (as for Oogas).
    const accept = entry.controlled ? null : npcTreeSupportAllowed;
    const padSupportAt = entry.rage.active ? clankerRagePadSupportAt : clankerPadSupportAt;
    if (!entry.motion.lab && !entry.planningLab) {
      const terrainStep = step >= STEP_MAX && BL.wallPanels.rampAt(island.surfaceAt, x, y, z, heading, CLANKER_TERRAIN_RAMP)
        ? Math.min(step, BL.wallPanels.RAMP_STEP) : Math.min(step, STEP_MAX);
      let floor = island.supportAt(x, z, y, terrainStep, ABYSS_FLOOR, 0);
      if (props) {
        // The supporting top must last until the same core that collides
        // with its side has cleared it. A point support dropped the root
        // while its trailing radius still overlapped an intact box, so both
        // the diagonal step and the horizontal-then-down proof rejected it.
        floor = Math.max(floor, solids.supportAt(x, z, y, step, CLANKER_CORE_RADIUS, null, null, true, accept, entry.rage.active));
        if (mempoolIsland) floor = Math.max(floor, mempoolIsland.floatAt(x, z, y, step, GORILLA_DRAUGHT));
        if (ALTAR_HEIGHT <= y + step + 1e-7
          && x * x + z * z < altar.platformRadius * altar.platformRadius) floor = Math.max(floor, ALTAR_HEIGHT);
        // Only the body's support area holds it up; reaching limbs must not
        // keep the root suspended past a short step or platform edge.
        floor = Math.max(floor, solids.gorillaStepAt(x, z, y, step));
      }
      return floor;
    }
    // Upright scientists stand on their feet. An arm reaching a keyboard is
    // not a foot landing on that desk, even though it belongs to the body sweep.
    // Keep that foot support in upright flight too: a descending arm cannot
    // land the jumping body on a neighbouring bench before its feet get there.
    if (entry.motion.lab && (!entry.drive.airborne && !entry.gorilla.motionActive
      || entry.drive.airborne && !entry.drive.passiveFall)) {
      const floor = island.supportAt(x, z, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, 0.45);
      return props ? Math.max(floor, solids.supportAt(x, z, y, step, 0.45, null, null, true, accept, entry.rage.active), solids.gorillaStepAt(x, z, y, step)) : floor;
    }
    // Pitching a walking rig on the tunnel ramp can leave the flat-ground
    // compact envelope. Its broad bounding circle then reaches the tunnel's
    // side ledges, although the feet remain on the ramp. Keep the walking
    // support footprint here; the complete posed hull still checks collision.
    const compact = entry.compact, planning = entry.planningRoam;
    if ((!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active
      && (planning || entry.footprintMode === "walk")
      && clankerGroundPlaneAt(x, y, z, heading, CLANKER_SUPPORT_PLANE)) {
      entry.compact = true; entry.planningRoam = true;
    }
    // Terrain and tall platforms use the body footprint. Short props use the
    // centre alone, so a reaching arm cannot force an early rise or sidestep.
    const shape = BL.agent.footprint, radius = shape.radius(entry);
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    const platformReach = altar.platformRadius + radius - 1e-7;
    let floor = ABYSS_FLOOR;
    for (let part = 0; part < shape.count(entry); part++) {
      const offset = shape.offset(entry, part), px = x + sine * offset, pz = z + cosine * offset;
      floor = Math.max(floor, island.supportAt(px, pz, y, Math.min(step, STEP_MAX), ABYSS_FLOOR, radius));
      if (props) floor = Math.max(floor, solids.supportAt(px, pz, y, step, radius, null, null, true, accept, entry.rage.active));
      // Keep the dais under a released gorilla until it has walked back off.
      if (props && ALTAR_HEIGHT <= y + step + 1e-7
        && px * px + pz * pz < platformReach * platformReach) floor = Math.max(floor, ALTAR_HEIGHT);
    }
    if (props) floor = Math.max(floor, solids.gorillaStepAt(x, z, y, step));
    entry.compact = compact; entry.planningRoam = planning;
    if ((!entry.drive.airborne || entry.drive.passiveFall) && !entry.jump.active && !entry.climb.active && !entry.gorilla.motionActive
      && (planning || entry.footprintMode === "walk")
      && !clankerGroundPlaneAt(x, y, z, heading, CLANKER_SUPPORT_PLANE)) {
      const center = padSupportAt(x, z, y, step, props);
      if (floor > center + 0.2) {
        const pads = entry.gorilla.walkSupportAt(x, z, y, heading, step, props, padSupportAt);
        if (Number.isFinite(pads) && pads < floor - 0.02) floor = pads;
      }
    }
    return floor;
  };
  const clankerPadSupportAt = (x, z, y, step, props, skipRageProps = false) => {
    const floor = island.supportAt(x, z, y, Math.min(step, STEP_MAX), ABYSS_FLOOR);
    if (!props) return floor;
    const radius = altar.platformRadius - 1e-7;
    return Math.max(floor, solids.supportAt(x, z, y, step, 0, null, null, true, null, skipRageProps), solids.gorillaStepAt(x, z, y, step),
      mempoolIsland ? mempoolIsland.floatAt(x, z, y, step, GORILLA_DRAUGHT) : ABYSS_FLOOR,
      ALTAR_HEIGHT <= y + step + 1e-7 && x * x + z * z < radius * radius ? ALTAR_HEIGHT : ABYSS_FLOOR);
  };
  const clankerRagePadSupportAt = (x, z, y, step, props) => clankerPadSupportAt(x, z, y, step, props, true);
  const clankerTerraceAt = (x, y, z, heading) => {
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    for (let i = 0; i < 3; i++) {
      const offset = i === 0 ? 0.05 : i === 1 ? 0.7 : 1.35;
      // Detect the stone beside the whole walking body, including a riser too
      // high to count as a legal step. This selects exact collision proof; it
      // does not raise the controller's permitted step height.
      if (island.supportAt(x + sine * offset, z + cosine * offset, y, BL.clankers.WALK_HEIGHT, ABYSS_FLOOR, 0.85) > y + 0.02) return true;
    }
    return false;
  };
  const CLANKER_SUPPORT_PLANE = { groundX: 0, groundY: 0, groundZ: 0 };
  // Compare support using the same footprint so a terrain tread beneath a
  // leading limb cannot be mistaken for standing on a raised prop.
  const clankerTerrainSupportAt = (entry, x, z, y, step, heading = entry.heading) =>
    clankerSupportAt(entry, x, z, y, step, heading, false);
  const CLANKER_RAMP_COLUMN = { floor: 0, ceiling: 0 };
  const clankerGroundPlaneAt = (x, y, z, heading, out, motion = null) => {
    const column = CLANKER_RAMP_COLUMN, sine = Math.sin(heading), cosine = Math.cos(heading);
    let ramp = false;
    // Retain the dedicated HQ ramp fit; its tunnel sides are deliberately
    // outside the terrain rectangle used on the open island.
    for (let i = 0; i < 3 && !ramp; i++) {
      const along = i === 0 ? 0 : i === 1 ? 2.4 : -0.9;
      const px = x + sine * along, pz = z + cosine * along;
      ramp = !!(island.rampColumnAt(px, pz, false, column) && y < column.ceiling
        || island.rampColumnAt(px, pz, true, column) && y < column.ceiling);
    }
    const entry = motion && motion.supportEntry;
    if (entry) { motion.groundRects.angled.steep = false; motion.groundRects.angled.walkable = false; }
    if (!ramp && (!entry || !motion.lab)
      && BL.wallPanels.rampAt(island.surfaceAt, x, y, z, heading, CLANKER_TERRAIN_RAMP)) {
      const floor = island.supportAt(x, z, y, BL.wallPanels.RAMP_STEP, ABYSS_FLOOR, 0);
      if (floor > ABYSS_FLOOR + STEP_MAX && y >= floor - 0.2 && y <= floor + 1.2) {
        const across = CLANKER_TERRAIN_RAMP.groundX, along = CLANKER_TERRAIN_RAMP.groundZ;
        if (entry) {
          const flat = motion.groundRects.flat, angled = motion.groundRects.angled;
          clankerRectangleAt(entry, flat);
          flat.x = angled.x = x; flat.z = angled.z = z; flat.y = angled.y = floor;
          flat.heading = angled.heading = heading;
          angled.halfForward = flat.halfForward; angled.halfSide = flat.halfSide;
          angled.centerForward = flat.centerForward;
          angled.groundX = across; angled.groundZ = along;
          angled.uneven = CLANKER_TERRAIN_RAMP.uneven;
          angled.walkable = true; angled.steep = false;
        }
        out.groundX = across; out.groundZ = along; out.groundY = floor - y;
        return true;
      }
    }
    if (entry && !motion.lab && !ramp) {
      const rects = motion.groundRects, flat = rects.flat, angled = rects.angled;
      const rect = clankerRectangleAt(entry, flat);
      const halfForward = rect.halfForward, halfSide = rect.halfSide, centerForward = rect.centerForward;
      const cx = x + sine * centerForward, cz = z + cosine * centerForward;
      const floor = clankerSupportAt(entry, x, z, y, STEP_MAX, heading);
      flat.x = angled.x = x; flat.z = angled.z = z;
      flat.heading = angled.heading = heading;
      flat.halfForward = angled.halfForward = halfForward;
      flat.halfSide = angled.halfSide = halfSide;
      flat.centerForward = angled.centerForward = centerForward;
      angled.y = floor; angled.walkable = false; angled.steep = false;
      angled.uneven = Infinity;
      if (!Number.isFinite(floor) || floor <= ABYSS_FLOOR + STEP_MAX) { flat.y = ABYSS_FLOOR; return false; }
      const sampleY = Math.max(y, floor);
      // Most frames have terrain alone beneath the rectangle. Only ask the
      // prop BVH for four more samples when the live centre is on scenery.
      flat.y = island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR, 0);
      const onProp = floor > flat.y + 0.02;
      const bx = cx - sine * halfForward, bz = cz - cosine * halfForward;
      const fx = cx + sine * halfForward, fz = cz + cosine * halfForward;
      const lx = cx - cosine * halfSide, lz = cz + sine * halfSide;
      const rx = cx + cosine * halfSide, rz = cz - sine * halfSide;
      // Sample actual contact beneath each edge. Reapplying the whole blended
      // rectangle at every edge made a small prop behave like a much wider one.
      const back = onProp ? clankerPadSupportAt(bx, bz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(bx, bz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const front = onProp ? clankerPadSupportAt(fx, fz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(fx, fz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const left = onProp ? clankerPadSupportAt(lx, lz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(lx, lz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      const right = onProp ? clankerPadSupportAt(rx, rz, sampleY, STEP_MAX, true, entry.rage.active)
        : island.supportAt(rx, rz, sampleY, STEP_MAX, ABYSS_FLOOR, 0);
      if (!Number.isFinite(back) || !Number.isFinite(front) || !Number.isFinite(left) || !Number.isFinite(right)
        || Math.min(back, front, left, right) <= ABYSS_FLOOR + STEP_MAX) return false;
      const across = (right - left) / (2 * halfSide), along = (front - back) / (2 * halfForward);
      angled.groundX = across; angled.groundZ = along;
      angled.uneven = Math.max(Math.abs(left + right - floor * 2), Math.abs(front + back - floor * 2));
      angled.steep = Math.hypot(across, along) > 0.65;
      // A blended short prop can lift the centre before both edges touch it.
      // Its real edge heights should still pitch the walking body; unevenness
      // remains available to reject a stationary resting pose.
      angled.walkable = !angled.steep && (onProp || Math.abs(left + right - floor * 2) <= 0.42);
      if (!angled.walkable || y < floor - 0.2 || y > floor + 0.9) return false;
      out.groundX = across; out.groundZ = along; out.groundY = floor - y;
      return Math.abs(across) + Math.abs(along) > 0.01;
    }
    if (!ramp) return false;
    const floor = island.supportAt(x, z, y, STEP_MAX, ABYSS_FLOOR);
    if (y < floor - 0.2 || y > floor + 0.9) return false;
    const back = island.supportAt(x - sine * 0.35, z - cosine * 0.35, floor, STEP_MAX, ABYSS_FLOOR);
    const front = island.supportAt(x + sine * 1.35, z + cosine * 1.35, floor, 0.9, ABYSS_FLOOR);
    const left = island.supportAt(x - cosine * 0.5, z + sine * 0.5, floor, STEP_MAX, ABYSS_FLOOR);
    const right = island.supportAt(x + cosine * 0.5, z - sine * 0.5, floor, STEP_MAX, ABYSS_FLOOR);
    const across = right - left, along = (front - back) / 1.7;
    if (Math.abs(left + right - floor * 2) > 0.12 || Math.hypot(across, along) > 0.65) return false;
    if (entry) {
      const flat = motion.groundRects.flat, angled = motion.groundRects.angled;
      flat.x = angled.x = x; flat.z = angled.z = z;
      flat.y = angled.y = floor; flat.heading = angled.heading = heading;
      angled.groundX = across; angled.groundZ = along;
      angled.uneven = Math.max(Math.abs(left + right - floor * 2), Math.abs(front + back - floor * 2));
      angled.steep = false; angled.walkable = true;
    }
    out.groundX = across; out.groundZ = along; out.groundY = floor - y;
    return true;
  };
  // Props remain live blockers throughout a climb, but never become a cached
  // wall-route endpoint. A spawned rock beneath a dismount therefore blocks or
  // reverses that route; destroying it reopens the terrain landing immediately.
  // Keep the exposed entrance lip clear, but the deeper HQ tunnel roofs can host resting gorillas.
  const clankerRestSurfaceClear = (x, y, z, foot) => {
    if (!npcRampRoofAt(x, y, z, foot)) return true;
    let nearest = Infinity, along = 0;
    for (const ramp of island.headquarters.ramps) {
      const dx = x - ramp.from.x, dz = z - ramp.from.z, distance = dx * dx + dz * dz;
      if (distance < nearest) { nearest = distance; along = dx * ramp.axis.x + dz * ramp.axis.z; }
    }
    return along >= 3.25;
  };
  const CLANKER_REST_SLOPE = {
    supportEntry: null, lab: false,
    groundRects: { flat: {}, angled: { walkable: false, uneven: Infinity, groundX: 0, groundZ: 0 } }
  };
  const clankerRestSiteClear = (entry, x, y, z, heading) => {
    if (!clankerFireClear(entry, x, y, z, x, y, z, heading, heading)) return false;
    const slope = CLANKER_REST_SLOPE, angled = slope.groundRects.angled;
    slope.supportEntry = entry;
    try { clankerGroundPlaneAt(x, y, z, heading, slope, slope); }
    finally { slope.supportEntry = null; }
    if (!angled.walkable || Math.hypot(angled.groundX, angled.groundZ) > 0.2 || angled.uneven > 0.3) return false;
    // Walking uses centre clearance; a settled body must also leave its rear,
    // middle and front clear of props, interactive items and other actors.
    const sine = Math.sin(heading), cosine = Math.cos(heading);
    for (let i = 0; i < 3; i++) {
      const offset = i * 0.7, px = x + sine * offset, pz = z + cosine * offset;
      if (!clankerCylinderClear(px, y, pz, px, y, pz, 0.85, 2.7, entry, null, false, false, false)) return false;
    }
    return true;
  };
  const clankerClimbTorsoClear = (vertices) => {
    if (!island.hullClearAt(vertices)) return false;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      minX = Math.min(minX, vertices[i]); maxX = Math.max(maxX, vertices[i]);
      minY = Math.min(minY, vertices[i + 1]); maxY = Math.max(maxY, vertices[i + 1]);
      minZ = Math.min(minZ, vertices[i + 2]); maxZ = Math.max(maxZ, vertices[i + 2]);
    }
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i];
      if (maxX < row.minX || minX > row.maxX || maxY < row.minY || minY > row.maxY
        || maxZ < row.minZ || minZ > row.maxZ || !solids.isActive(row.node)) continue;
      for (let j = 0; j < row.boxes.length; j++) if (BL.convex.hullsOverlap(vertices, row.boxes[j])) return false;
    }
    return true;
  };
  const clankerClimbAreaAt = (x, y, z) => {
    // Climb geometry belongs to the mainland's cliff belt and underground
    // walls. The meadow, authored stairs and satellite mesh paths are walks.
    // This broad phase only admits a search; contact still proves a real wall.
    const radius2 = x * x + z * z, outer = island.radius + 4, inner = island.meadowRadius - 4;
    return radius2 <= outer * outer && (y < -0.5 || radius2 >= inner * inner) && !island.stairAt(x, y, z);
  };
  const clankerClimbSolidAt = (x, y, z) => {
    if (island.solidAt(x, y, z)) return true;
    // The cave's visible masonry projects beyond the voxel cliff. Grips and
    // wall routes must see that same stone before ordinary props collision
    // rejects a route through its jambs. Scenery stays on its existing mesh.
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i], boxes = row.node.geometry.climbBoxes, ly = y - row.y;
      if (ly < 0 || ly > 3.5 || Math.abs(x - row.x) > 4 || Math.abs(z - row.z) > 4
        || !solids.isActive(row.node)) continue;
      const dx = x - row.x, dz = z - row.z, lx = dx * row.cr - dz * row.sr;
      const lz = dx * row.sr + dz * row.cr - row.offsetZ;
      for (let at = 0; at < boxes.length; at += 6) if (lx >= boxes[at] && lx <= boxes[at + 3]
        && ly >= boxes[at + 1] && ly <= boxes[at + 4] && lz >= boxes[at + 2] && lz <= boxes[at + 5]) return true;
    }
    return false;
  };
  const clankerClimbSurfaceAt = (x, z) => {
    let height = island.surfaceAt(x, z);
    // The stair/cliff probe must see the same projecting masonry as the
    // contact probe. Walking support still comes from the live solid mesh.
    for (let i = 0; i < climbMasonry.length; i++) {
      const row = climbMasonry[i];
      if (Math.abs(x - row.x) > 4 || Math.abs(z - row.z) > 4 || !solids.isActive(row.node)) continue;
      const dx = x - row.x, dz = z - row.z, lx = dx * row.cr - dz * row.sr;
      const lz = dx * row.sr + dz * row.cr - row.offsetZ, boxes = row.node.geometry.climbBoxes;
      for (let at = 0; at < boxes.length; at += 6) if (lx >= boxes[at] && lx <= boxes[at + 3]
        && lz >= boxes[at + 2] && lz <= boxes[at + 5]) height = Math.max(height, row.y + boxes[at + 4]);
    }
    return height;
  };
  const LAB_ITEM_INVERSE = math.mat4.create(), LAB_ITEM_LOCAL = math.mat4.create();
  const placeLabDie = (item) => {
    const n = item.node, r = item.roll;
    BL.scene.updateLocal(n);
    // The original die geometry has its base at zero. Rotate around its centre
    // so tipping onto another face never drives a corner through the table.
    const m = n.local, rx = 0.13 * (Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]));
    const ry = 0.13 * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
    const rz = 0.13 * (Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]));
    const table = item.table;
    if (r.cx < table.minX + rx || r.cx > table.maxX - rx) { r.cx = clamp(r.cx, table.minX + rx, table.maxX - rx); r.vx *= -0.35; }
    if (r.cz < table.minZ + rz || r.cz > table.maxZ - rz) { r.cz = clamp(r.cz, table.minZ + rz, table.maxZ - rz); r.vz *= -0.35; }
    if (r.cy < table.y + ry + 0.001) {
      r.cy = table.y + ry + 0.001;
      if (r.vy < -0.2) { r.bounces++; r.vy *= -0.32; r.vx *= 0.72; r.vz *= 0.72; r.wx *= 0.58; r.wy *= 0.58; r.wz *= 0.58; }
      else r.vy = 0;
    }
    setVec(n.position, r.cx - m[4] * 0.13, r.cy - m[5] * 0.13, r.cz - m[6] * 0.13);
  };
  const settleLabDie = (item) => {
    const n = item.node, r = item.roll;
    setVec(n.rotation, r.tx, r.ty, r.tz);
    r.cy = item.table.y + 0.131; r.vx = r.vy = r.vz = 0;
    placeLabDie(item);
    setVec(item.home, n.position.x, n.position.y, n.position.z);
    setVec(item.homeRotation, n.rotation.x, n.rotation.y, n.rotation.z);
    const m = item.parent.world, y = r.cy + 0.13;
    setVec(item.pickup, m[0] * r.cx + m[4] * y + m[8] * r.cz + m[12],
      m[1] * r.cx + m[5] * y + m[9] * r.cz + m[13], m[2] * r.cx + m[6] * y + m[10] * r.cz + m[14]);
    item.rolling = false;
  };
  const rollLabEquipment = (entry, index) => {
    const item = entropyLab.equipment[index];
    if (!item || item.kind !== "die" || item.holder !== entry || entry.gorilla.labItem !== item.node) return false;
    const n = item.node, r = item.roll;
    BL.scene.updateWorld(entry.root, entry.root.parent.world);
    math.mat4.invert(LAB_ITEM_INVERSE, item.parent.world);
    math.mat4.multiply(LAB_ITEM_LOCAL, LAB_ITEM_INVERSE, n.world);
    const m = LAB_ITEM_LOCAL;
    r.cx = m[12] + m[4] * 0.13; r.cy = m[13] + m[5] * 0.13; r.cz = m[14] + m[6] * 0.13;
    entry.gorilla.releaseLabItem(); addChild(item.parent, n);
    refreshMirrorObject(entry.root);
    setVec(n.scale, 1, 1, 1);
    setVec(n.rotation, Math.asin(clamp(-m[9], -1, 1)), Math.atan2(m[8], m[10]), Math.atan2(m[1], m[5]));
    r.time = 0; r.bounces = 0;
    r.vx = (entry.random() - 0.5) * 0.22; r.vy = 0.9 + entry.random() * 0.4;
    r.vz = -0.22 - entry.random() * 0.2;
    r.wx = 5 + entry.random() * 4; r.wy = 4 + entry.random() * 3; r.wz = 3 + entry.random() * 5;
    // Land on one of the original die's six faces; the object stays where it
    // settled, becoming the next pickup point instead of snapping back home.
    const face = Math.floor(entry.random() * 6), quarter = Math.PI / 2;
    r.tx = (face < 4 ? face : 0) * quarter; r.tz = face < 4 ? 0 : (face === 4 ? 1 : -1) * quarter;
    r.ty = Math.floor(entry.random() * 4) * quarter;
    item.rolling = true;
    return true;
  };
  const updateLabEquipment = (dt) => {
    let screens = 0, claims = 0;
    for (const e of clankers.list) if (e.active && e.motion.lab && e.lab.station >= 0) {
      claims |= 1 << e.lab.station;
      if (e.motion.labWork === "type" || e.motion.labWork === "touch") screens |= 1 << e.lab.station;
    }
    entropyLab.updateScreens(dt, screens, claims);
    for (const item of entropyLab.equipment) {
      if (!item.rolling) continue;
      const r = item.roll, rotation = item.node.rotation;
      let remaining = Math.min(dt, 0.25);
      while (remaining > 1e-8) {
        const step = Math.min(remaining, 1 / 120); remaining -= step; r.time += step;
        r.vy -= 7 * step; r.cx += r.vx * step; r.cy += r.vy * step; r.cz += r.vz * step;
        if (r.time < 0.9) { rotation.x += r.wx * step; rotation.y += r.wy * step; rotation.z += r.wz * step; }
        else {
          const blend = 1 - Math.exp(-12 * step), drag = Math.exp(-8 * step);
          rotation.x += Math.atan2(Math.sin(r.tx - rotation.x), Math.cos(r.tx - rotation.x)) * blend;
          rotation.y += Math.atan2(Math.sin(r.ty - rotation.y), Math.cos(r.ty - rotation.y)) * blend;
          rotation.z += Math.atan2(Math.sin(r.tz - rotation.z), Math.cos(r.tz - rotation.z)) * blend;
          r.vx *= drag; r.vz *= drag;
        }
        placeLabDie(item);
      }
      if (r.time >= 1.8) settleLabDie(item);
    }
  };
  const returnLabEquipment = (entry) => {
    for (const item of entropyLab.equipment) {
      if (item.holder !== entry) continue;
      if (item.kind === "die" && item.node.parent === item.parent) {
        if (item.rolling) settleLabDie(item);
        item.holder = null;
        return true;
      }
      entry.gorilla.releaseLabItem();
      addChild(item.parent, item.node);
      refreshMirrorObject(entry.root);
      setVec(item.node.position, item.home.x, item.home.y, item.home.z);
      setVec(item.node.rotation, item.homeRotation.x, item.homeRotation.y, item.homeRotation.z);
      setVec(item.node.scale, item.homeScale.x, item.homeScale.y, item.homeScale.z);
      item.node.quaternion = null; item.node.visible = true; item.holder = null; item.rolling = false;
      return true;
    }
    return false;
  };
  const pickUpLabEquipment = (entry, index) => {
    const item = entropyLab.equipment[index], p = entry.root.position;
    if (!item || item.holder || entry.gorilla.labItem || !entry.motion.lab
      || Math.hypot(p.x - item.pickup.x, p.z - item.pickup.z) > 2.1
      || Math.abs(p.y - entropyLab.mouth.floorY) > 0.2) return false;
    entry.gorilla.holdLabItem(item.node);
    refreshMirrorObject(entry.root);
    item.holder = entry;
    return true;
  };
  const clankerCameraClear = (x, y, z, toX, toY, toZ) =>
    island.voxelSegmentClearAt(x, y, z, toX, toY, toZ, 0.1, 0.15)
    && solids.segmentClear(x, y, z, toX, toY, toZ, 0.1, 0.15);
  const constrainClankerCamera = (entry, view, hold = false, previousEye = null, firstPerson = false, birdsEye = false, aimPoint = null) => {
    const a = view.target, b = view.position;
    if (clankerPlay.combat && !birdsEye && (!hold || cutawayHandoffPlayer === entry)) {
      const x = b.x, y = b.y, z = b.z;
      if (constrainCombatCamera(entry, b, 1 - (view.orthoMix || 0), true, firstPerson ? null : a, aimPoint)) {
        if (firstPerson) { a.x += b.x - x; a.y += b.y - y; a.z += b.z - z; }
        return;
      }
    }
    if (clankerPlay.view === "shoulder") return;
    if (clankerPlay.view === "orbit") {
      // Match the Ooga carry orbit: keep its chosen boom through stone and
      // track the cave at the eye without changing the camera position.
      clampCamera(b, 0);
      return;
    }
    if (hold || firstPerson) {
      // Mounts keep the displayed camera anchor. Looking remains possible,
      // with the eye swept from its previous position instead of rebasing
      // the view onto the gorilla as it crosses a ledge.
      if (clankerCameraClear(previousEye.x, previousEye.y, previousEye.z, b.x, b.y, b.z)) return;
      const dx = b.x - previousEye.x, dy = b.y - previousEye.y, dz = b.z - previousEye.z;
      let low = 0, high = 1;
      for (let i = 0; i < 9; i++) {
        const k = (low + high) * 0.5;
        if (clankerCameraClear(previousEye.x, previousEye.y, previousEye.z,
          previousEye.x + dx * k, previousEye.y + dy * k, previousEye.z + dz * k)) low = k;
        else high = k;
      }
      if (!hold) {
        // First person follows the corrected eye without changing its look.
        a.x += previousEye.x + dx * low - b.x;
        a.y += previousEye.y + dy * low - b.y;
        a.z += previousEye.z + dz * low - b.z;
      }
      b.x = previousEye.x + dx * low; b.y = previousEye.y + dy * low; b.z = previousEye.z + dz * low;
      return;
    }
    // The overhead cutaway reveals the actor through roofs. Its boom must be
    // allowed to cross the same stone that the view deliberately cuts away.
    if (birdsEye) return;
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    let low = 0, high = 1;
    if (clankerCameraClear(a.x, a.y, a.z, b.x, b.y, b.z)) return;
    // A lagging target can cut a corner through stone. Start the boom at the
    // actual body before shortening it, so a blocked origin cannot erase the
    // camera's look direction by collapsing the eye onto its target.
    if (!clankerCameraClear(a.x, a.y, a.z, a.x, a.y, a.z)) {
      const p = entry.root.position;
      a.x = p.x; a.z = p.z;
      if (!clankerCameraClear(a.x, a.y, a.z, a.x, a.y, a.z)) a.y = p.y + (entry.fire.rolling ? 0.7 : 1.25);
      b.x = a.x + dx; b.y = a.y + dy; b.z = a.z + dz;
    }
    if (Math.hypot(dx, dy, dz) < 0.01) {
      dx = -Math.sin(entry.heading) * 0.1; dy = 0.04; dz = -Math.cos(entry.heading) * 0.1;
    }
    for (let i = 0; i < 9; i++) {
      const k = (low + high) * 0.5, x = a.x + dx * k, y = a.y + dy * k, z = a.z + dz * k;
      if (clankerCameraClear(a.x, a.y, a.z, x, y, z)) low = k;
      else high = k;
    }
    low = Math.max(low, Math.min(1, 0.01 / Math.hypot(dx, dy, dz)));
    b.x = a.x + dx * low; b.y = a.y + dy * low; b.z = a.z + dz * low;
  };
  const prepareClankerStrike = () => {
    const entry = clankers.player;
    if (!entry) return;
    const combat = entry.combat;
    if (combat.serial !== entry.smashSerial) {
      combat.hit = combat.powerSpent = false;
      combat.serial = entry.smashSerial;
    }
    if (!entry.pound) { combat.hit = false; return; }
    BL.scene.updateWorld(entry.root, root.world);
    combat.right.set(entry.gorilla.parts.armR.world);
    combat.left.set(entry.gorilla.parts.armL.world);
  };
  const CLANKER_BURN_PARTS = ["legR", "legL", "armR", "armL", "torso", "head"];
  // Coast selection uses each island's actual exterior footprint. Route steps
  // may still cross a physically supported bridge between those footprints.
  const rageLandAt = (x, z) => {
    if (island.onLand(x, z)) return 1;
    if (mempoolIsland.overAt(x, z)) return 2;
    if (timechainIsland && Math.hypot(x - timechainIsland.place.x, z - timechainIsland.place.z) < BL.timechainModels.SITE.radius) return 3;
    if (bifrostIsle) {
      const site = bifrostIsle.site, c = site.cloud;
      if (Math.hypot(x - c.x, z - c.z) < c.r && Number.isFinite(site.groundAt(x, z))) return 4;
    }
    return 0;
  };
  // A bridge is a supported capture region, but remains open water in a
  // flight's coastline test. Height keeps swimmers beneath it out of this set.
  const rageCaptureLandAt = (x, y, z) => {
    const M = mempoolIsland, S = poolModels.SITE;
    const across = M.localX(x, z), along = M.localZ(x, z) - M.place.bridgeLocalZ;
    if (Math.abs(across) <= S.width / 2 && along >= S.deckStart && along <= S.span
      && Math.abs(y - M.place.y - poolModels.deckY(along / S.span)) <= 1.2) return 5;
    return rageLandAt(x, z);
  };
  const rageMappedLand = land => land === 1 || land === 2 || land === 5;
  const rageExteriorFloor = (land, x, z) => land === 1 ? island.surfaceAt(x, z)
    : land === 2 ? mempoolIsland.place.y + mempoolIsland.layout.groundAt(mempoolIsland.localX(x, z), mempoolIsland.localZ(x, z))
      : land === 3 ? timechainIsland.place.y : land === 4 ? bifrostIsle.site.groundAt(x, z) : -Infinity;
  const RAGE_EDGE_RAYS = 48, RAGE_EDGE_NEAR = 1.2;
  const RAGE_EDGE_INSETS = [4.5, 8, 12, 16];
  const RAGE_HOME_RADII = [14, 12, 10, 8];
  const RAGE_POOL_RADII = [14, 16, 18, 20];
  const RAGE_MAP_RAYS = 24, RAGE_MAP_BUDGET = 24, RAGE_MAP_NEAR = 0.15;
  const RAGE_MAP_OFFSET = 1.8, RAGE_MAP_RADIUS = 2.25, RAGE_MAP_PROP_RADIUS = 1.25;
  const RAGE_MAP_BOTTOM = 0.75, RAGE_MAP_TOP = 5.5;
  // Fixed meadow, rainforest and bridge launch pads. Clearance is baked once
  // per visit, in shared slices, before any gorilla chooses its nearest pad.
  const rageThrowMap = {
    spots: [], ready: false, cursor: 0, step: 0, validCount: 0,
    frameChecks: 0, maxFrameChecks: 0, liveProofs: 0, x: 0, y: 0, z: 0, outside: false
  };
  const resetRageThrowMap = (build = true) => {
    const map = rageThrowMap;
    map.spots.length = 0; map.ready = !build; map.cursor = map.step = map.validCount = 0;
    map.frameChecks = map.maxFrameChecks = map.liveProofs = 0;
    if (!build) return;
    for (let ray = 0; ray < RAGE_MAP_RAYS; ray++) {
      const angle = ray * Math.PI * 2 / RAGE_MAP_RAYS, dx = Math.sin(angle), dz = Math.cos(angle);
      for (let inset = 0; inset < RAGE_HOME_RADII.length; inset++) {
        const radius = RAGE_HOME_RADII[inset];
        map.spots.push({
          ray, inset, land: 1, x: dx * radius, y: 0, z: dz * radius, dx, dz,
          bottom: RAGE_MAP_BOTTOM,
          edgeX: 0, edgeZ: 0, valid: false
        });
      }
    }
    const M = mempoolIsland, S = poolModels.SITE;
    for (let ray = 0; ray < 12; ray++) {
      const angle = ray * Math.PI / 6, sx = Math.sin(angle), sz = Math.cos(angle);
      const dx = sx * M.cos + sz * M.sin, dz = -sx * M.sin + sz * M.cos;
      for (let inset = 0; inset < RAGE_POOL_RADII.length; inset++) {
        const radius = RAGE_POOL_RADII[inset], lx = sx * radius, lz = sz * radius;
        map.spots.push({
          ray: RAGE_MAP_RAYS + ray, inset, land: 2,
          x: M.worldX(lx, lz), y: M.place.y + M.layout.groundAt(lx, lz), z: M.worldZ(lx, lz), dx, dz,
          bottom: RAGE_MAP_BOTTOM, edgeX: 0, edgeZ: 0, valid: false
        });
      }
    }
    for (let side = 0; side < 2; side++) {
      const sign = side ? -1 : 1;
      for (let inset = 0; inset < 4; inset++) {
        const along = S.span * (inset + 1) / 5, lz = M.place.bridgeLocalZ + along;
        const x = M.worldX(0, lz), z = M.worldZ(0, lz);
        // The sagged deck rises within the stance footprint. Use its highest
        // supporting plank so the bake does not reject the floor itself.
        const y = solids.supportAt(x, z, M.place.y + 0.15, 0, BL.clankers.WALK_RADIUS);
        map.spots.push({
          ray: RAGE_MAP_RAYS + 12 + side, inset, land: 5, x, y, z,
          dx: sign * M.cos, dz: -sign * M.sin, bottom: 1.15, edgeX: 0, edgeZ: 0, valid: false
        });
      }
    }
  };
  const invalidateRageThrowMap = () => {
    const map = rageThrowMap;
    if (!map.spots.length) return;
    map.ready = false; map.cursor = map.step = map.validCount = 0;
    for (let i = 0; i < map.spots.length; i++) map.spots[i].valid = false;
  };
  const updateRageThrowMap = () => {
    const map = rageThrowMap;
    map.frameChecks = 0;
    if (map.ready) return;
    const speed = 18 / Math.SQRT2, gravity = BL.pilot.WALK.gravity;
    while (map.cursor < map.spots.length && map.frameChecks < RAGE_MAP_BUDGET) {
      const spot = map.spots[map.cursor];
      map.frameChecks++;
      if (!map.step) {
        // Short props, Oogas and rage-pass scenery do not invalidate a pad.
        // Structural props still need room around the fixed footing.
        if (!Number.isFinite(spot.y) || rageCaptureLandAt(spot.x, spot.y, spot.z) !== spot.land
          || spot.land === 1 && island.surfaceAt(spot.x, spot.z) !== 0
          || !island.clearAt(spot.x, spot.y + 0.025, spot.z, BL.clankers.WALK_RADIUS, BL.clankers.WALK_HEIGHT)
          || !solids.segmentClear(spot.x, spot.y + 0.025, spot.z, spot.x, spot.y + 0.025, spot.z,
            BL.clankers.WALK_RADIUS, BL.clankers.WALK_HEIGHT, null, BL.clankers.WALK_RADIUS, BL.clankers.WALK_HEIGHT, true, false, false, true)) {
          map.cursor++; continue;
        }
        map.x = spot.x + spot.dx * RAGE_MAP_OFFSET; map.y = spot.y + spot.bottom;
        map.z = spot.z + spot.dz * RAGE_MAP_OFFSET; map.outside = !rageLandAt(map.x, map.z); map.step = 1;
        if (map.outside) { spot.edgeX = map.x; spot.edgeZ = map.z; }
        continue;
      }
      const t = map.step * 0.04, fall = gravity * 0.1 * t / 2;
      const x = spot.x + spot.dx * (RAGE_MAP_OFFSET + speed * t);
      const y = spot.y + spot.bottom + speed * t - gravity * t * t / 2 - fall;
      const z = spot.z + spot.dz * (RAGE_MAP_OFFSET + speed * t);
      const height = RAGE_MAP_TOP - spot.bottom + fall, land = rageLandAt(x, z);
      // The terrain envelope includes flying limbs. Props use the narrower
      // swept body plus release-position allowance, as ordinary flight does.
      const clear = !(land && (land !== spot.land || map.outside))
        && !crossesSealedCave(map.x, map.z, x, z, Math.min(map.y, y))
        && island.clearAt(map.x, map.y, map.z, RAGE_MAP_RADIUS, height)
        && island.clearAt(x, y, z, RAGE_MAP_RADIUS, height)
        && island.voxelSegmentClearAt(map.x, map.y, map.z, x, y, z, RAGE_MAP_RADIUS, height)
        && mempoolIsland.boxClear(Math.min(map.x, x) - RAGE_MAP_RADIUS, Math.min(map.y, y), Math.min(map.z, z) - RAGE_MAP_RADIUS,
          Math.max(map.x, x) + RAGE_MAP_RADIUS, Math.max(map.y, y) + height, Math.max(map.z, z) + RAGE_MAP_RADIUS)
        && propSegmentClear(map.x, map.y, map.z, x, y, z, RAGE_MAP_PROP_RADIUS, height,
          null, false, false, RAGE_MAP_PROP_RADIUS, height, true)
        // Certify doors, glass and beds in their solid state so opening or
        // hiding them cannot make this cached map depend on the bake frame.
        && bedSegmentClear(map.x, map.y, map.z, x, y, z, RAGE_MAP_PROP_RADIUS, height, true)
        && matrixGateSegmentClear(map.x, map.y, map.z, x, y, z, RAGE_MAP_PROP_RADIUS, height, false, true)
        && mirrorActorSegmentClear(map.x, map.y, map.z, x, y, z, height, null, RAGE_MAP_RADIUS);
      if (!clear) { map.cursor++; map.step = 0; continue; }
      if (!land && !map.outside) {
        spot.edgeX = x; spot.edgeZ = z; map.outside = true;
      }
      if (y + height < SEA_Y || map.step === 200) {
        spot.valid = map.outside && y + height < SEA_Y;
        if (spot.valid) map.validCount++;
        map.cursor++; map.step = 0; continue;
      }
      map.x = x; map.y = y; map.z = z; map.step++;
    }
    map.maxFrameChecks = Math.max(map.maxFrameChecks, map.frameChecks);
    map.ready = map.cursor === map.spots.length;
  };
  const rageMapRouteClear = (entry, spot) => {
    const p = entry.root.position;
    if (spot.land === 1) return true;
    if (spot.land === 5) return rageCaptureLandAt(p.x, p.y, p.z) === 5;
    if (spot.land !== 2) return false;
    const M = mempoolIsland, L = M.layout;
    if (M.coveredAt(p.x, p.y + 0.5, p.z)) return false;
    const ax = M.localX(p.x, p.z), az = M.localZ(p.x, p.z);
    const bx = M.localX(spot.x, spot.z), bz = M.localZ(spot.x, spot.z);
    const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
    const near = length2 ? clamp(-(ax * dx + az * dz) / length2, 0, 1) : 0;
    const startRadius = Math.hypot(ax, az), clearance = Math.min(startRadius, L.RING.shore + 0.5);
    if (startRadius < L.LAKE_R + PLAYER_RADIUS || Math.hypot(ax + dx * near, az + dz * near) < clearance - 1e-7) return false;
    // No graph search while carrying: admit a direct dry segment on this
    // side of the lake. Live steps retain terrain and structure collision.
    const steps = Math.max(1, Math.ceil(Math.sqrt(length2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, lx = ax + dx * t, lz = az + dz * t;
      const floor = L.groundAt(lx, lz);
      if (!L.onIsland(lx, lz) || !Number.isFinite(floor) || floor < M.water.levelAt(lx, lz)) return false;
    }
    return true;
  };
  const rageMapGoal = (entry, out, land) => {
    const map = rageThrowMap, r = entry.rage, p = entry.root.position;
    if (!map.ready) { r.edgeRejectReason = "map-building"; return false; }
    if (now < r.edgeRetryAt) { r.edgeRejectReason = "map-retry"; return false; }
    let nearest = Infinity, chosen = null;
    for (let i = 0; i < map.spots.length; i++) {
      const spot = map.spots[i];
      if (!spot.valid || spot.land !== land || r.edgeRejected[spot.ray] & 1 << spot.inset
        || !rageMapRouteClear(entry, spot)) continue;
      const distance = (spot.x - p.x) ** 2 + (spot.y - p.y) ** 2 + (spot.z - p.z) ** 2;
      if (distance < nearest) { nearest = distance; chosen = spot; }
    }
    if (!chosen) {
      r.edgeRejectReason = "no-map-spot";
      // A transient obstruction may clear, but never rescan an exhausted
      // set continuously while holding a captive.
      r.edgeRetryAt = now + 3; r.edgeRejected.fill(0); return false;
    }
    out.goalX = chosen.x; out.goalY = chosen.y; out.goalZ = chosen.z;
    r.edgeX = chosen.edgeX; r.edgeZ = chosen.edgeZ; r.edgeDx = chosen.dx; r.edgeDz = chosen.dz;
    r.edgeLand = chosen.land; r.edgeIndex = chosen.ray; r.edgeInset = chosen.inset;
    r.edgeReady = true; r.edgeWaiting = false; r.edgeRejectReason = "ready";
    return true;
  };
  const rageMappedLaunchClear = (entry, cave, x, y, z, vx, vy, vz) => {
    const r = entry.rage, rec = entry.capture;
    const spot = rageThrowMap.spots[r.edgeIndex * RAGE_HOME_RADII.length + r.edgeInset];
    if (!rageThrowMap.ready || !spot?.valid || !r.edgeReady || spot.land !== r.edgeLand) return false;
    const speed = 18 / Math.SQRT2;
    if (Math.abs(vx - spot.dx * speed) > 1e-6 || Math.abs(vy - speed) > 1e-6
      || Math.abs(vz - spot.dz * speed) > 1e-6) return false;
    const offset = Math.hypot(x - spot.x - spot.dx * RAGE_MAP_OFFSET, z - spot.z - spot.dz * RAGE_MAP_OFFSET);
    // The actual release must fit the prevalidated swept envelope. This is
    // a constant-time bounds check; no new trajectory is searched at arrival.
    return offset + rec.flightRadius <= RAGE_MAP_RADIUS && offset + PLAYER_RADIUS <= RAGE_MAP_PROP_RADIUS
      && y + rec.flightBottom >= spot.y + spot.bottom && y + Math.max(rec.flightTop, cave.bodyHeight) <= spot.y + RAGE_MAP_TOP;
  };
  // Plans run sequentially; reuse candidate storage rather than allocating
  // coastline nodes for every gorilla or every replan.
  const rageEdgeCandidates = new Float64Array(RAGE_EDGE_RAYS * RAGE_EDGE_INSETS.length * 7);
  const rageEdgeLaunchClear = (entry, x, y, z, sx, sz) => {
    const cave = rageCaptive(entry), rec = entry.capture, hand = clankerGripAt(entry);
    if (!cave) return false;
    const speed = 18 / Math.SQRT2;
    const startX = x + sz * rec.side + sx * rec.behind;
    const startZ = z - sx * rec.side + sz * rec.behind;
    const startY = y + hand[1] - entry.root.position.y;
    return captureLaunchClear(entry, cave, startX, startY, startZ, sx * speed, speed, sz * speed);
  };
  const rageEdgeGoal = (entry, out) => {
    const r = entry.rage, p = entry.root.position;
    const captureX = Number.isFinite(r.edgeOriginX) ? r.edgeOriginX : p.x;
    const captureY = Number.isFinite(r.edgeOriginY) ? r.edgeOriginY : p.y;
    const captureZ = Number.isFinite(r.edgeOriginZ) ? r.edgeOriginZ : p.z;
    const land = rageCaptureLandAt(captureX, captureY, captureZ), originX = captureX, originZ = captureZ;
    r.edgeReady = false; r.edgeWaiting = true; r.edgeIndex = -1;
    r.edgeProbes = 0; r.edgeRejectReason = "no-stance";
    out.goalX = p.x; out.goalY = p.y; out.goalZ = p.z;
    if (!land || !rageCaptive(entry)) { r.edgeRejectReason = !land ? "no-land" : "no-captive"; return false; }
    if (rageMappedLand(land)) return rageMapGoal(entry, out, land);
    const candidates = rageEdgeCandidates, insets = RAGE_EDGE_INSETS.length;
    candidates.fill(Infinity);
    for (let i = 0; i < RAGE_EDGE_RAYS; i++) {
      const angle = i * Math.PI * 2 / RAGE_EDGE_RAYS, sx = Math.sin(angle), sz = Math.cos(angle);
      if (r.edgeRejected[i] === (1 << insets) - 1) continue;
      let low = 0, high = 0;
      for (let distance = 1; distance <= 112; distance++) {
        const nextLand = rageLandAt(originX + sx * distance, originZ + sz * distance);
        if (!nextLand) { high = distance; break; }
        if (nextLand !== land) break;
        low = distance;
      }
      if (!high) continue;
      for (let j = 0; j < 6; j++) {
        const mid = (low + high) * 0.5;
        if (rageLandAt(originX + sx * mid, originZ + sz * mid) === land) low = mid;
        else high = mid;
      }
      const edgeX = originX + sx * low, edgeZ = originZ + sz * low;
      const coast = Math.hypot(edgeX - p.x, edgeZ - p.z);
      for (let inset = 0; inset < insets; inset++) {
        if (r.edgeRejected[i] & 1 << inset) continue;
        const n = (i * insets + inset) * 7, distance = low - RAGE_EDGE_INSETS[inset];
        const x = originX + sx * distance, z = originZ + sz * distance;
        if (rageLandAt(x, z) !== land) continue;
        const exterior = rageExteriorFloor(land, x, z);
        if (!Number.isFinite(exterior)) continue;
        const y = clankerSupportAt(entry, x, z, Math.max(exterior, p.y), BL.clankers.PROP_STEP, angle);
        if (!Number.isFinite(y) || y === ABYSS_FLOOR) continue;
        candidates[n] = Math.hypot(x - p.x, y - p.y, z - p.z);
        candidates[n + 1] = x; candidates[n + 2] = y; candidates[n + 3] = z;
        candidates[n + 4] = edgeX; candidates[n + 5] = edgeZ;
        candidates[n + 6] = coast;
      }
    }
    // Other islands retain their bounded coast search. Home, rainforest and
    // bridge captures return above using their shared fixed launch stances.
    const count = RAGE_EDGE_RAYS * insets;
    for (let attempt = 0; attempt < count; attempt++) {
      let coast = Infinity, stance = Infinity, chosen = -1;
      for (let i = 0; i < count; i++) {
        const n = i * 7;
        if (candidates[n + 6] < coast || candidates[n + 6] === coast && candidates[n] < stance) {
          coast = candidates[n + 6]; stance = candidates[n]; chosen = i;
        }
      }
      if (chosen < 0) {
        // Dynamic blockers may have moved when the next bounded plan starts.
        r.edgeRejected.fill(0);
        return false;
      }
      const ray = Math.floor(chosen / insets), inset = chosen % insets;
      const n = chosen * 7, angle = ray * Math.PI * 2 / RAGE_EDGE_RAYS, sx = Math.sin(angle), sz = Math.cos(angle);
      const x = candidates[n + 1], y = candidates[n + 2], z = candidates[n + 3];
      candidates[n] = candidates[n + 6] = Infinity;
      if (!clankerClear(x, y, z, x, y, z, entry.radius, entry.height, entry, null, angle, angle)) {
        r.edgeRejected[ray] |= 1 << inset; r.edgeRejectReason = "blocked-stance"; continue;
      }
      // Limit expensive full-flight mesh proofs independently of the cheap
      // coast probes. Failed candidates stay rejected for the next slice.
      if (r.edgeProbes === 2) { r.edgeRejectReason = "proof-budget"; return false; }
      r.edgeProbes++;
      if (!rageEdgeLaunchClear(entry, x, y, z, sx, sz)) {
        r.edgeRejected[ray] |= 1 << inset; r.edgeRejectReason = "blocked-flight"; continue;
      }
      out.goalX = x; out.goalY = y; out.goalZ = z;
      r.edgeX = candidates[n + 4]; r.edgeZ = candidates[n + 5]; r.edgeDx = sx; r.edgeDz = sz;
      r.edgeLand = land; r.edgeIndex = ray; r.edgeInset = inset; r.edgeReady = true; r.edgeWaiting = false; r.edgeRejectReason = "ready";
      return true;
    }
    return false;
  };
  const rageEdgeHeading = (entry, out) => {
    const p = entry.root.position, r = entry.rage;
    let dx = r.goalX - p.x, dz = r.goalZ - p.z;
    let length = Math.hypot(dx, dz);
    if (length < 1e-6) { dx = r.edgeDx; dz = r.edgeDz; length = 1; }
    out.dx = dx / length; out.dz = dz / length;
  };
  const rageEdgeAt = (entry, x, y, z, out, fromHeading = entry.heading) => {
    const cave = rageCaptive(entry), r = entry.rage;
    out.dx = r.edgeDx; out.dz = r.edgeDz;
    if (rageMappedLand(r.edgeLand) && !rageThrowMap.ready) return false;
    if (!cave || !r.edgeReady || Math.hypot(x - r.goalX, z - r.goalZ) > (rageMappedLand(r.edgeLand) ? RAGE_MAP_NEAR : RAGE_EDGE_NEAR)
      || r.edgeLand === 1 && Math.hypot(x, z) > RAGE_HOME_RADII[0] + 1e-7
      || rageCaptureLandAt(x, y, z) !== r.edgeLand) return false;
    const sx = r.edgeDx, sz = r.edgeDz;
    // A mapped pad's flight was proven by the bake, even 1.8 m from the coast.
    if (!rageMappedLand(r.edgeLand) && (r.edgeX - x) * sx + (r.edgeZ - z) * sz < 3) return false;
    const angle = Math.atan2(sx, sz);
    if (Math.abs(clankerSupportAt(entry, x, z, y, 0.15, angle) - y) > 0.15) return false;
    if (!rageDragClear(entry, x, y, z, x, y, z, angle, fromHeading)
      || !clankerClear(x, y, z, x, y, z, entry.radius, entry.height, entry, null, angle, angle)) return false;
    // Arrival checks only the live stance and grip. The mapped flight is
    // already baked; its actual release must fit that envelope after swing.
    out.dx = sx; out.dz = sz; return true;
  };
  const updateClankerEffects = (dt) => {
    for (let i = 0; i < clankers.list.length; i++) {
      const entry = clankers.list[i];
      BL.clankerRage.effects(entry);
      if (!entry.active) continue;
      const f = entry.fire, parts = entry.renderParts, fireFX = entry.fireFX, spread = fireFX.spread;
      if (f.burning && !fireFX.burning) {
        if (f.soot === 0) spread.fill(0);
        fireFX.next = 0;
      }
      fireFX.burning = f.burning;
      if (f.burning && !f.rolling) {
        const limb = clamp(0.12 + f.age * 0.88, 0, 1);
        const torso = clamp((f.age - 0.35) * 0.72, 0, 1);
        const head = clamp((f.age - 1.1) * 0.8, 0, 1);
        for (let j = 0; j < 4; j++) spread[j] = Math.max(spread[j], limb);
        spread[4] = Math.max(spread[4], torso);
        spread[5] = Math.max(spread[5], head);
      }
      const heat = f.burning ? f.heat * (f.rolling ? Math.max(0, 1 - f.rollTime / 3) : 1) : 0;
      for (let j = 0; j < parts.length; j++) { parts[j].ember = 0; parts[j].scorch = 0; }
      for (let j = 0; j < CLANKER_BURN_PARTS.length; j++) {
        const part = entry.gorilla.parts[CLANKER_BURN_PARTS[j]];
        part.ember = spread[j] * heat;
        part.scorch = spread[j] * f.soot;
        for (let k = 0; k < part.children.length; k++) {
          const child = part.children[k];
          if (child === entry.gorilla.labFlask || !child.geometry) continue;
          child.ember = part.ember;
          child.scorch = part.scorch;
        }
      }
      if (f.burning || f.soot > 0.7) {
        fireFX.next -= dt;
        if (fireFX.next <= 0) {
          fireFX.next = f.burning ? 0.08 : 0.2;
          BL.scene.updateWorld(entry.root, root.world);
          let total = 0;
          for (let j = 0; j < spread.length; j++) total += spread[j];
          if (total > 0) {
            let pick = Math.random() * total, index = spread.length - 1;
            for (let j = 0; j < spread.length; j++) {
              pick -= spread[j];
              if (pick < 0) { index = j; break; }
            }
            const part = entry.gorilla.parts[CLANKER_BURN_PARTS[index]], b = BL.scene.boundsOf(part.geometry), m = part.world;
            const x = lerp(b.min[0], b.max[0], Math.random()), y = lerp(b.min[1], b.max[1], Math.random() * spread[index]), z = b.max[2];
            fx.spawnParticle(f.burning ? CLANKER_FIRE[i % 2] : CLANKER_SMOKE,
              m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14],
              0, 0.8, 0, 0.65, 2, -0.2, -Infinity);
          }
        }
      }
      if (!entry.controlled || !entry.actionControlled || entry.pound > 0.43 || entry.pound < 0.17) continue;
      const combat = entry.combat;
      BL.scene.updateWorld(entry.root, root.world);
      for (let hand = 0; hand < 2; hand++) {
        const part = hand ? entry.gorilla.parts.armL : entry.gorilla.parts.armR, previous = hand ? combat.left : combat.right;
        mirrorCave.ripples.strike(previous, part.world, part.geometry, dt);
        if (!combat.hit && input.weaponTargets.strike(CLANKER_HIT, previous, part.world, part.geometry, entry)) {
          combat.hit = true;
          weaponImpact(entry, CLANKER_HIT, Math.sin(entry.heading), -1, Math.cos(entry.heading), entry.poundPower);
        }
      }
    }
  };
  const registerClanker = (entry) => {
    entry.capture = {
      entry, cave: null, autonomous: false, player: false, throwing: false, posed: false, aimed: false,
      blocked: "", blockedPart: "", blockedStage: "", warpSpot: -1, warpVisit: false,
      warpAnkleX: 0, warpAnkleY: 0, warpAnkleZ: 0, warpFromX: 0, warpFromY: 0, warpFromZ: 0, warpFromHeading: 0,
      flightRadius: PLAYER_RADIUS, flightBottom: 0, flightTop: 0,
      time: 0, charge: 0, x: 0, z: 0, safeX: 0, safeY: 0, safeZ: 0, side: 0, behind: 0,
      aim: { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 },
      bounds: new Float64Array(BODY_PARTS_SOLID.length * 6), nextBounds: new Float64Array(BODY_PARTS_SOLID.length * 6)
    };
    clankerCaptures.push(entry.capture);
    entry.renderParts = [];
    entry.fireFX.spread = new Float32Array(CLANKER_BURN_PARTS.length);
    entry.fireFX.burning = false;
    entry.combat = {
      left: math.mat4.create(), right: math.mat4.create(), hit: false,
      serial: -1, lastHitAt: -Infinity, powerSpent: false
    };
    const visit = (node, region = "body") => {
      if (node === entry.gorilla.parts.head) region = "head";
      if (node.geometry) {
        entry.renderParts.push(node);
        addTarget(node, { kind: "clanker", entry, cave: entry, priority: 2, weaponType: "enemy", hitRegion: region });
        clankerPartOwners.set(node, entry);
      }
      for (const child of node.children) visit(child, region);
    };
    visit(entry.root);
    clankerMeshes.add(entry.root);
  };
  const CLANKER_TALL_OBSTACLE = {
    node: null, minAlong: 0, maxAlong: 0, minAcross: 0, maxAcross: 0,
    minContactAcross: 0, maxContactAcross: 0
  };
  const clankerTallObstacleAhead = (entry, dx, dz) => {
    const p = entry.root.position, step = BL.clankers.PROP_STEP, aboveStep = p.y + step + 0.02;
    return solids.shoulderAt(p.x, aboveStep, p.z, dx, dz, 0.025,
      Math.max(0, entry.height - step), 1.4, CLANKER_TALL_OBSTACLE, aboveStep, entry.rage.active);
  };
  const poundClankerEquipment = (entry) => {
    const p = entry.root.position;
    let nearest = null, distance = Infinity;
    for (let i = 0; i < clankerEquipment.length; i++) {
      const item = clankerEquipment[i], q = item.node.position;
      if (item.site !== entry.site || item.progress >= 1) continue;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d > 3.5 || d >= distance || !clankerClear(q.x, q.y, q.z, q.x, q.y, q.z, item.radius, item.height, null, item.node)) continue;
      nearest = item; distance = d;
    }
    if (!nearest) return;
    nearest.progress = Math.min(1, nearest.progress + 0.2);
    nearest.node.visible = true;
    nearest.node.scale.y = nearest.progress * 0.65;
    solids.sync();
  };
  const createClankerEquipment = (sites) => {
    for (let site = 0; site < sites.length; site++) for (let side = 0; side < 2; side++) {
      const place = sites[site];
      // EntropyLab supplies authored equipment and the mirror room is meant to
      // stay open for its running clanker. Generic build props in either room
      // become unexplained bright blocks under their local effects.
      if (place.mouth === entropyLab.mouth || place.mirrorRoom || bcaMouth && place.mouth === bcaMouth.mouth) continue;
      const geometry = models.buildableGeos[(site + side) % models.buildableGeos.length]();
      const bounds = BL.scene.boundsOf(geometry);
      const radius = Math.hypot(Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])), Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2]))) * 0.65;
      // Side-wall pockets leave the doorway and rear shelves free. A build
      // grows only while its complete footprint is clear of the companions.
      const x = (side ? 1 : -1) * 2.25, z = -4.7;
      const node = createNode({
        geometry, visible: false, matrixLiving: true, position: {
          x: place.mouth.x + place.cr * x + place.sr * z,
          y: place.mouth.floorY, z: place.mouth.z - place.sr * x + place.cr * z
        }, rotation: { x: 0, y: place.mouth.ry, z: 0 }, scale: { x: 0.65, y: 0.01, z: 0.65 }
      });
      addChild(root, node); solids.add(node);
      trackMirrorObject(node, 1.2);
      clankerEquipment.push({ node, site, radius, height: bounds.max[1] * 0.65, progress: 0 });
    }
  };
  const refreshObjectGuides = () => {
    // Model changes also happen during scene construction, before the cache.
    if (objectGuides) {
      objectGuides.refresh();
      sightGuides.reserve(objectGuides.result, null);
      bananaGuides.reserve(objectGuides.result, null);
    }
  };
  let uiGuideObjects = null, uiGuidesReady = false, preparingGuideActor = null;
  const collectViewObjects = () => {
    const player = controlledGuideActor(), p = player ? player.root.position : camera.target;
    return objectGuides.collect(player, p.x, p.y, p.z, camera, renderer.size.width / Math.max(1, renderer.size.height), sightGuides.state.retainedOwners, sightGuides.state.retainedCount, true);
  };
  const characterUiOccluded = (cave) => {
    if (cave.root.cameraHidden) return true;
    // A speaker the outline registry walks past (Tess, who moves every frame) is left to the overlay's own test.
    if (cave.root.sightHidden) return false;
    if (RENDER_OPTS.birdsEyeCutaway) return cave.root.position.y - cave.baseY >= cutawayHeightAt(cave.root.position.x, cave.root.position.z);
    // Input-time tooltips may run before this frame's transforms are rendered.
    // Use rock certificates only during the overlay, after updating providers;
    // all other callers keep the exact visibility query.
    if (!uiGuidesReady) return false;
    if (!uiGuideObjects) uiGuideObjects = collectViewObjects();
    return !objectGuides.actorVisible(cave, guideSegmentClear);
  };
  const prepareCoveredView = function* (overlayCanvas, slice) {
    const actor = crew.list.find((cave) => cave.root.visible);
    if (!actor) return;
    // Exercise the first covered-view paths behind the loading curtain. The
    // real camera, bodies and controls stay untouched; only presentation
    // caches and their bounded canvases are prepared for later navigation.
    BL.scene.updateWorld(root);
    const p = actor.root.position, aspect = renderer.size.width / Math.max(1, renderer.size.height);
    const view = createCamera();
    view.fov = camera.fov; view.near = camera.near; view.far = camera.far;
    setVec(view.target, p.x, p.y + 0.8, p.z);
    setVec(view.position, p.x, p.y + 8, p.z + 50);
    try {
      preparingGuideActor = actor;
      const objects = objectGuides.collect(actor, p.x, p.y, p.z, view, aspect, null, 0, true);
      while (objects.bakeNext()) yield* pause(slice);
      objects.ensureContours();
      yield* pause(slice);
      const guides = sightGuides.update(actor, null, objects, view, aspect, 0.25, true);
      const observer = guides.observer;
      guides.structure = rockGuides.select(p.x, p.y - actor.baseY, p.z, view.position.x, view.position.y, view.position.z);
      guides.structures = rockGuides.updateSurfaces(observer[19], observer[20], observer[21], view, 0.25, actor, objectGuides.perceptionClear, objects.occlusionVersion, objects.perceptionVersion);
      cameraCover.draw(view, actor.root, false, true, cameraRockAt, cameraRockMaterialAt, guides, 0.25);
      yield* pause(slice);
    } finally {
      preparingGuideActor = null;
      const guides = sightGuides.update(null, null, null, camera, aspect, 0, false);
      guides.structure = guides.structures = null;
      rockGuides.resetSurface();
      cameraCover.draw(camera, null, false, false, cameraRockAt, cameraRockMaterialAt, guides, 0);
      collectViewObjects();
      const context = overlayCanvas.getContext("2d");
      context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); context.restore();
    }
  };
  const drawFirstPersonFire = (player) => {
    if (!player || !pilot.closeWanted || pilot.closeMix < 0.98) return;
    crew.fireView(player, FIRE_VIEW);
    const coverage = FIRE_VIEW.coverage, ember = FIRE_VIEW.ember, soot = FIRE_VIEW.soot;
    if (coverage <= 0 && soot <= 0) return;
    const context = overlayCanvas.getContext("2d"), width = overlayCanvas.width, height = overlayCanvas.height;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (coverage > 0) {
      // Heat closes in as the fire reaches more body parts. Full body coverage
      // is opaque, while the second layer brightens as those embers heat up.
      context.globalAlpha = coverage;
      context.fillStyle = "#8f260b";
      context.fillRect(0, 0, width, height);
      context.globalAlpha = ember;
      context.fillStyle = "#ff6d16";
      context.fillRect(0, 0, width, height);
      const count = Math.ceil(FIRE_SPECKS.length / 4 * Math.sqrt(coverage));
      context.fillStyle = "#ffe176";
      context.globalAlpha = Math.min(1, 0.3 + ember * 0.7);
      for (let i = 0; i < count; i++) {
        const at = i * 4, size = FIRE_SPECKS[at + 2] * Math.min(width, height) * (0.7 + ember * 1.3);
        const x = FIRE_SPECKS[at] * width;
        const y = ((FIRE_SPECKS[at + 1] - now * (0.05 + FIRE_SPECKS[at + 3] * 0.08)) % 1 + 1) % 1 * height;
        context.fillRect(x - size * 0.5, y - size * 0.5, size, size);
      }
    }
    if (soot > 0) {
      // The roll replaces heat with the actual accumulated char coverage;
      // that same coverage then recedes with the body's soot fade.
      context.globalAlpha = soot;
      context.fillStyle = "#090807";
      context.fillRect(0, 0, width, height);
    }
    context.restore();
  };
  // Walking recomputes the sight guides at most this often in game time. The lines are world-anchored, so a few
  // frames of lag only show as an outline catching up. Behind cave rock at 1920x1080 and DPR 2, 15 Hz is a 25 ms
  // frame becoming 19 ms; 30 Hz spent about 19 ms on every other frame.
  const SIGHT_RECOMPUTE_HZ = 15;
  const overlay = (dt) => {
    // The eye owns this blackout, including detached and trailing cameras.
    // Cover all world overlays so no names or outlines reveal the empty room.
    if (cameraInsideMirror()) {
      const context = overlayCanvas.getContext("2d");
      context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1; context.globalCompositeOperation = "source-over";
      context.fillStyle = "#000"; context.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      context.restore();
      return;
    }
    if (poolBlockHovered) showPoolBlockTooltip();
    else if (pileHovered) showPileTooltip();
    // World-anchored sleeping marks share the guide visibility cadence; their particles still move every frame.
    advanceSleepSight(dt);
    const gorilla = clankerPlay.active, player = controlledGuideActor();
    const closeWanted = gorilla ? clankerPlay.firstPerson : pilot.closeWanted, closeMix = gorilla ? (closeWanted ? 1 : 0) : pilot.closeMix;
    const combatBirdsEye = gorilla ? clankerPlay.combat && clankerPlay.birdsEye : !!player && pilot.aiming && pilot.birdsEye;
    if (combatBirdsEye || RENDER_OPTS.birdsEyeCutaway) {
      // The actual scene is visible through its roof cut. Rock silhouettes and
      // near-camera caps would cover it again using the unchanged solid world.
      // Gate combat bird's-eye directly as well as by cutaway mix so no wall
      // outline can flash on its first or last camera-transition frame.
      uiGuideObjects = null; uiGuidesReady = true;
      try { fx.drawOverlay(dt, drawExtra); } finally { uiGuidesReady = false; }
      sightGuides.update(null, null, null, camera, 1, dt);
      bananaGuides.update(null, null, null, camera, 1, dt, false, true);
      sightGuides.state.structure = sightGuides.state.structures = null;
      bananaGuides.state.structure = bananaGuides.state.structures = null;
      if (rockGuides) rockGuides.resetSurface();
      // Under the Mempool island the cut takes the roof and leaves the tunnel's walls, which from a low view still
      // hide the walker: then the walker's rim is drawn through them, and nothing else. Not from an eye that is
      // itself inside that rock, whose back faces are not drawn, so the walker is already in plain sight.
      const eye = camera.position;
      const buried = !combatBirdsEye && cutawayPool === 2 && !!player && !closeWanted && closeMix < 1
        && (eye.y > RENDER_OPTS.cutawayMaxY || !mempoolIsland.solidAt(eye.x, eye.y, eye.z))
        && (collectViewObjects(), !objectGuides.actorVisible(player, poolSeam()));
      const near = camera.near * Math.sqrt(1 + Math.tan(camera.fov / 2) ** 2 * (1 + (renderer.size.width / Math.max(1, renderer.size.height)) ** 2));
      const cutTop = Math.min(eye.y + near, RENDER_OPTS.cutawayMaxY);
      const touchesPoolRock = !combatBirdsEye && cutawayPool === 2 && cutTop >= eye.y - near
        && !mempoolIsland.boxClear(eye.x - near, eye.y - near, eye.z - near, eye.x + near, cutTop, eye.z + near);
      cameraCover.state.opacity = 0.22 * (1 - closeMix);
      cameraCover.draw(camera, buried ? player.root : null, touchesPoolRock, buried, cameraCutRockAt, cameraRockMaterialAt, null, dt);
      return;
    }
    const insideMirror = gorilla ? matrixCave.portal.inside : !!player && playerCaveIndex === matrixCave.caveIndex;
    mirrorGuides.update(insideMirror);
    const bananaActor = bananaCover.prepare(camera, player, player ? player.root.position.y - (gorilla ? 0 : player.baseY) : 0, gorilla ? player.gorilla.bodyHeight : player?.bodyHeight);
    uiGuideObjects = null; uiGuidesReady = true;
    try { fx.drawOverlay(dt, drawExtra); } finally { uiGuidesReady = false; }
    let touchesRock = false, occluded = false, guides = null, exteriorRamp = false;
    if (closeMix < 1) {
      const eye = camera.position, tangent = Math.tan(camera.fov / 2), aspect = renderer.size.width / Math.max(1, renderer.size.height);
      const radius = camera.near * Math.sqrt(1 + tangent * tangent * (1 + aspect * aspect));
      // A cheap enclosing-volume check avoids sampling an entirely clear view.
      // The cover then caps only solid rock intersecting the actual near plane.
      touchesRock = island.solidAt(eye.x, eye.y, eye.z)
        || eye.y + radius >= 0 && eye.y - radius <= ALTAR_HEIGHT && Math.hypot(eye.x, eye.z) <= altar.platformRadius + radius
        || !island.clearAt(eye.x, eye.y - radius, eye.z, radius, radius * 2)
        || !entranceSegmentClear(eye.x, eye.y, eye.z, eye.x, eye.y, eye.z, radius)
        || cameraPoolNear(eye.x, eye.z)
        && !mempoolIsland.boxClear(eye.x - radius, eye.y - radius, eye.z - radius, eye.x + radius, eye.y + radius, eye.z + radius);
    }
    if (player) {
      const p = player.root.position, aspect = renderer.size.width / Math.max(1, renderer.size.height);
      const objects = uiGuideObjects || collectViewObjects();
      exteriorRamp = !closeWanted && closeMix < 1 && exteriorRampGuides(player);
      const viewEligible = !closeWanted && closeMix < 1;
      // On the Mempool island only the walker's own rim is drawn through its rock: the whole island is one owner
      // in the outline registry, crowns and all, and the full pass over it is not paid for there.
      // Nor is a rim drawn from an eye inside this rock, which sees the walker through its own undrawn back faces.
      const actorVisible = viewEligible && (cutawayPool ? mempoolIsland.solidAt(camera.position.x, camera.position.y, camera.position.z) || objectGuides.actorVisible(player, poolSeam())
        : objectGuides.actorVisible(player, guideSegmentClear));
      const rockSection = viewEligible && !cutawayPool && touchesRock && actorVisible && !exteriorRamp;
      const objectsEnabled = viewEligible && !cutawayPool && (exteriorRamp || rockSection || !actorVisible);
      const bananaEnabled = bananaCover.state.cameraInPile;
      occluded = cutawayPool ? viewEligible && !actorVisible : objectsEnabled;
      const contourUpdates = sightGuides.state.updates;
      guides = sightGuides.update(player, null, objects, camera, aspect, dt, objectsEnabled, rockSection, SIGHT_RECOMPUTE_HZ);
      // Keep a separate cap pass so split objects stay legible in fruit.
      // It must not change the visibility rules in the clear part of the view.
      const fruitGuides = bananaGuides.update(bananaEnabled ? player : null, null, objects, camera, aspect, dt, bananaEnabled, true, SIGHT_RECOMPUTE_HZ);
      if (objectsEnabled || bananaEnabled) {
        const structure = ensureRockGuides().select(p.x, p.y - (gorilla ? 0 : player.baseY), p.z, camera.position.x, camera.position.y, camera.position.z), observer = guides.observer;
        // Keep wall derivation off a frame that just rebuilt object contours.
        const surfaces = rockGuides.updateSurfaces(observer[19], observer[20], observer[21], camera, dt, player, objectGuides.perceptionClear, objects.occlusionVersion, objects.perceptionVersion, SIGHT_RECOMPUTE_HZ, guides.updates !== contourUpdates);
        guides.structures = objectsEnabled ? surfaces : null; guides.structure = objectsEnabled ? structure : null;
        fruitGuides.structures = bananaEnabled ? surfaces : null; fruitGuides.structure = bananaEnabled ? structure : null;
      } else { guides.structure = fruitGuides.structure = null; guides.structures = fruitGuides.structures = null; if (rockGuides) rockGuides.resetSurface(); }
    } else {
      sightGuides.update(null, null, null, camera, 1, dt);
      bananaGuides.update(null, null, null, camera, 1, dt, false, true);
      sightGuides.state.structure = null;
      sightGuides.state.structures = null;
      bananaGuides.state.structure = bananaGuides.state.structures = null;
      if (rockGuides) rockGuides.resetSurface();
    }
    if (exteriorRamp || bananaActor) {
      const p = camera.position, t = camera.target, length = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      GUIDE_ACTOR_FORWARD[0] = (t.x - p.x) / length; GUIDE_ACTOR_FORWARD[1] = (t.y - p.y) / length; GUIDE_ACTOR_FORWARD[2] = (t.z - p.z) / length;
    }
    cameraCover.state.opacity = 0.22 * (1 - closeMix);
    cameraCover.draw(camera, bananaActor ? null : player?.root, touchesRock, occluded, cameraRockAt, cameraRockMaterialAt, cutawayPool && player ? null : guides, dt, 0, null, exteriorRamp ? guideActorVisibleAt : null);
    bananaCover.draw(camera, player, dt, guideActorVisibleAt, bananaGuides.state, null);
    drawFirstPersonFire(crew.player);
  };

  const onLootCleared = () => {
    if (!lootEnabled) return;
    crew.applyAllSwag();
    crew.renderLocker();
    hud.toast("Loot locker cleared");
  };
  const clearLoot = () => {
    game.clearLoot();
    onLootCleared();
  };
  // A demo tip is the simulation's alone: in real mode it would count a tip nobody paid.
  const demoTip = (sats) => {
    if (!donations.real) onDonation({ id: `demo-${Date.now()}`, sats, handle: game.state.handle, message: game.state.message, at: Date.now() });
  };
  const previewDonation = () => {
    if (!donations.real) return false;
    pile.deliverBananas(12);
    return true;
  };
  const addTestBananas = (amount) => {
    pile.deliverBananas(amount);
    hud.toast(`+${amount} test bananas`);
  };
  const resetDemo = () => {
    game.resetAll();
    location.reload();
  };
  const onKey = (e) => {
    if (factoryDeparting || bifrostDeparting) return;
    if (DEBUG_POOL_BLOCK && (e.key === "p" || e.key === "P")) {
      if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        mempoolIsland.preview.block();
      }
      return;
    }
    if (ghosts && ghosts.key(e)) { e.preventDefault(); return; } // HALLOWEEN: the ghost hunt's debug keys
    if (e.key === "Escape" && islandGuide.escape()) { e.preventDefault(); return; }
    // While Tess's tour holds the view the island's keys wait, actor switches (T) among them; Enter and → are hers.
    if (islandGuide.holding) return;
    if (e.key === "Escape" && debugSelectedGorilla) { selectDebugGorilla(null); e.preventDefault(); return; }
    if (e.key === "Escape") {
      if (!e.repeat) { if (clankerPlay.active) clankerPlay.escape(); else pilot.escape(); }
      e.preventDefault();
      return;
    }
    if ((e.key === "t" || e.key === "T") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); cycleOwnActor(); return;
    }
    if (e.key === "0" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); (clankerPlay.active ? clankerPlay : pilot).resetCamera(); return;
    }
    if (clankerPlay.active) return;
    if ((e.key === "x" || e.key === "X") && !e.repeat && pilot.modeAction("mode-toggle")) return;
    if ((e.key === "1" || e.key === "2") && pilot.weaponMode(Number(e.key))) return;
    if (e.key === "b" || e.key === "B") addTestBananas(testBananas);
    if (e.key === "l" || e.key === "L") demoTip(120000);
    if (e.key === "p" || e.key === "P") {
      world.level = Math.max(world.level, pile.slots.length);
      pile.syncPile(true);
    }
    // J mirrors the carried jetpack button without changing its fuel.
    if ((e.key === "j" || e.key === "J") && !e.repeat) toggleJetpack();
    // N spins a driven Ooga's nunchaku, C changes the colourway of one built with two.
    if ((e.key === "n" || e.key === "N") && !e.repeat && crew.twirl()) return;
    if ((e.key === "c" || e.key === "C") && !e.repeat && crew.toggleTint(crew.player)) return;
    if (e.key === "g" || e.key === "G") pilot.weaponAction("weapon-toggle");
    if (e.key === "v" || e.key === "V") pilot.weaponAction("weapon-fire");
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) {
      const contributor = contributors.roster[digit - 1];
      const cave = contributor && crew.cavemen.get(contributor.name);
      if (cave && crew.stateOf(cave) !== "working") {
        cave.override = "working";
        crew.refreshStates();
      }
    }
  };

  const onOogatron = (event) => {
    if (event.type === "stats") {
      if (jumbotron) jumbotron.refreshData(event.stats);
      contributors.applySnapshot(event.stats);
    }
  };
  const onTotem = (event) => { if (event.fresh) flareTotem(event.index); };
  const suspendHub = () => {
    stopLazyBedding();
    // A kept island ends its hunt and its game as a full leave does, and lowers the ring at once.
    if (ghostEntry) { ghostEntry.dispose(); ghostEntry = null; }
    if (ghosts) { ghosts.dispose(); ghosts = null; }
    ghostSeal = null;
    setGameMode(false);
    gameRingK = gameRingWait = ringPulseWait = 0; gameRing.visible = false;
    // The veils' waves and glyph outlines end with the visit as leave ends them; an outline is made again where a body
    // next touches its veil (`ringBodies`).
    for (const node of ringPanels) {
      const ripples = node.mirrorRipples;
      ripples.waves.fill(0); ripples.active = 0; ripples.time = 0;
      if (node.mirrorBody) node.mirrorBody.dispose();
    }
    for (const node of ringLanterns) node.visible = false;
    ringLanternsShown = false;
    actorTransition.sourceRoot = actorTransition.sourceHead = null;
    if (factoryMouth && factoryMouth.snap) snapFactoryView();
    if (bifrostIsle && bifrostIsle.snap) snapBifrostView();
    if (factoryMouth) factoryMouth.snap = false;
    if (bifrostIsle) bifrostIsle.snap = false;
    // Heimdall's horn closes its sound as a full leave does; his next blast opens it again.
    if (bifrostIsle) bifrostIsle.heimdall.dispose();
    if (enteringTween) enteringTween.alive = false;
    enteringTween = null;
    // The director clears every tween after leave without running its `done`. The pile's fruit in the air goes back
    // to its queue; the island's other tweens (a prop's wobble, a crate opening, a build coming down) finish now, so
    // nothing is left tilted, busy or half-shrunk for the next visit.
    pile.suspend();
    for (let pass = 0; pass < 8 && tweenCount(); pass++) stepTweens(1e3);
    clearCutawayHidden();
    selectDebugGorilla(null);
    window.clearInterval(stateTimer); stateTimer = 0;
    window.clearTimeout(hintTimer); hintTimer = 0;
    unsubscribeActivity(); unsubscribeActivity = null;
    unsubscribeAccount(); unsubscribeAccount = null;
    unsubscribeMempool(); unsubscribeMempool = null;
    unsubscribeChain(); unsubscribeChain = null;
    if (oogatronUnsub) oogatronUnsub(); oogatronUnsub = null;
    if (totemUnsub) totemUnsub(); totemUnsub = null;
    if (positionDebug) {
      positionDebug.removeEventListener("click", copyPositionDebug);
      positionDebug.hidden = true;
    }
    for (let i = 0; i < clankerCaptures.length; i++) finishClankerRider(clankerCaptures[i].entry, false);
    clankerCaptures.length = 0;
    timechainIsland.gate.dispose();
    islandGuide.suspend();
    chalkboard.suspend();
    clankerPlay.dispose();
    remotes.dispose();
    npcSync.dispose();
    pilot.suspend();
    input.suspend();
    crew.pause();
    weather.dispose();
    footsteps.dispose();
    fx.reset();
    if (factoryMouth?.hall) factoryMouth.hall.suspend();
    if (factoryMouth?.roofWindow) factoryMouth.roofWindow.suspend();
    hud.dispose();
    BL.net.setBody(null); BL.net.setHub(false); zoneHeld = null;
    CLANKER_REST_SLOPE.supportEntry = RAGE_WARP_MOTION.supportEntry = null;
    sleepSightSince = Infinity; sleepSightMode = null; sleepSightGorilla = false; sleepSightFrame++;
    CLANKER_HIT.node = CLANKER_HIT.owner = POOL_BLOCK_HIT.node = POOL_BLOCK_HIT.owner = null;
    DEBUG_MOVE_HIT.node = DEBUG_MOVE_HIT.owner = DEBUG_GORILLA_HIT.node = DEBUG_GORILLA_HIT.owner = null;
    viewPoseActor = grabSupportEntry = clankerSupportActor = clankerPassingEntry = preparingGuideActor = null;
    poolBlockHovered = poolBlockHoverIgnore = null;
    glCanvas = overlayCanvas = null;
    heldDebug = hubScene.debug;
    heldHub = true;
    // The active graph is empty; the retained graph has a separate, explicit geometry owner.
    hubScene.root = createNode(); hubScene.input = hubScene.debug = null;
    return { targets: input.targetCount };
  };
  const resumeHub = (ctx) => {
    ({ renderer, game, world, go, lootEnabled, testBananas } = ctx);
    glCanvas = ctx.canvas; overlayCanvas = ctx.overlay;
    heldHub = false;
    factoryDeparting = bifrostDeparting = factoryHeld = entering = false;
    Object.assign(factoryWalk, { phase: 0, cave: null, seen: false, through: false, beat: 0, grab: false, still: 0, hold: 0, settle: false });
    world.islandKeep = null;
    if (factoryMouth) factoryMouth.snap = false;
    if (bifrostIsle) bifrostIsle.snap = false;
    hubScene.root = root; hubScene.camera = camera; hubScene.input = input; hubScene.debug = heldDebug;
    heldDebug = null;
    hud.renew(ctx.signal);
    hud.restoreBoards(jumbotronBoard);
    hud.setDestinations(["pile", "lab", "mirror", "underground", "basement", "mempool", "factory", "arcade", "bca", "gate", "bifrost", "timechain"]);
    input.resume(); pilot.resume(); clankerPlay.resume(); chalkboard.resume();
    islandGuide.resume();
    if (timechainIsland.gate.resume()) hud.toast(`Room ${timechainIsland.gate.preselected} is chosen at the keypad · walk up to it and press Enter to go in`);
    if (factoryMouth?.hall) factoryMouth.hall.resume();
    if (factoryMouth?.roofWindow) factoryMouth.roofWindow.resume();
    weather = weatherMod.create({ root, renderer, camera, heightAt: mempoolIsland.rainAt, fx, onRain: mempoolIsland.rainHit, centre: mempoolIsland.centre });
    footsteps = BL.footsteps.create();
    hubScene.debug.weather = weather;
    weather.apply(chain.snapshot); mempoolIsland.water.apply(chain.snapshot);
    mempoolIsland.paintings.refresh(chain.snapshot); refreshChainSign();
    // As enter does: the distant island rests until the first proximity check below wakes it.
    poolEffectsActive = false; poolEffectsTime = 0;
    if (factoryMouth) factoryMouth.roofEffectsActive = false;
    weather.update(0, null);
    weather.pause(true);
    unsubscribeChain = chain.subscribe(onChain);
    unsubscribeMempool = mempool.subscribe(onMempool);
    oogatronUnsub = oogatronLive.subscribe(onOogatron);
    totemUnsub = BL.totemFeed.subscribe(onTotem);
    BL.net.setHub(true);
    crew.refreshStates(true);
    const handsBack = ctx.from === "dsb" || ctx.from === "factory" || ctx.from === "bifrost" || ctx.from === "arcade" || ctx.from === "lab" || ctx.from === "timechain";
    const returningCharacter = handsBack ? world.pilot : null;
    if (handsBack) world.pilot = null;
    if (returningCharacter) {
      const cave = crew.cavemen.get(returningCharacter);
      if (!contributors.debugState && !contributors.debugRoster && crew.stateOf(cave) !== "working") {
        cave.override = "working"; crew.refreshStates(true);
      }
      pilot.possess(cave);
      if (ctx.from === "factory") crew.selectWeapon(cave.weapon.selectedSlot, cave);
    }
    ownOogaClaimed = !!world.pilotDetached || !!(returningCharacter && BL.net.state.me) || !BL.net.state.me && ctx.from !== null; world.pilotDetached = false;
    claimOwnOoga();
    unsubscribeActivity = contributors.subscribe(() => crew.refreshStates());
    unsubscribeAccount = BL.net.subscribe(onAccountChange);
    const donate = ctx.place === "donate", routedPlace = donate ? null : ctx.place;
    const sphereExit = ctx.from === "timechain" ? world.sphereExit : null;
    world.sphereExit = null;
    const factoryCrossing = ctx.from === "factory" ? world.factoryCrossing : null;
    world.factoryCrossing = null;
    if (returningCharacter && sphereExit && pilot.player) timechainIsland.gate.arrive(sphereExit);
    else if (returningCharacter && factoryCrossing && pilot.player && factoryMouth) arriveFromFactory(factoryCrossing);
    else if (returningCharacter) navigate(ctx.from === "factory" || ctx.from === "bifrost" || ctx.from === "arcade" ? ctx.from : ctx.from === "timechain" ? "timechain" : "pile", false, false);
    else navigate(routedPlace || (ctx.from === "bifrost" ? "bifrost" : "pile"), false, false);
    if (donate) hud.openFeed();
    clankers.sync(); clankerMeshes.sync();
    for (let i = 0; i < crew.list.length; i++) crew.refreshRosterRow(crew.list[i]);
    if (lootEnabled) { crew.applyAllSwag(); crew.renderLocker(); }
    hud.setStats(game.state); pile.syncPile(true);
    stateTimer = window.setInterval(() => { crew.refreshStates(); fx.trimPool(); }, 6e4);
    lampSelValid = false; sampledDay = 0;
    cameraPreviousValid = false; cameraTrailPlayer = caveEntryPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    pilot.update(0);
    if (POSITION_DEBUG) {
      positionDebug.hidden = false;
      positionDebug.addEventListener("click", copyPositionDebug, { signal: ctx.signal });
      updatePositionDebug(true);
    }
    updatePoolEffectsActivity();
    createGhostEntry();
  };
  // Prepare only raw character rigs: the published crew, its stable roster order, input, health and NPC/remote
  // registration are still created together by enter. No partly populated actor registry reaches a live scene.
  const preparedCharacters = models.scopedMap(), characterLocations = new Map();
  const rememberCharacterLocations = () => {
    if (!crew) return;
    characterLocations.clear();
    for (const cave of crew.list) {
      const p = cave.root.position;
      characterLocations.set(cave.traits.name, { x: p.x, y: p.y, z: p.z });
    }
  };
  // A released hub comes back to an island its departure dropped, and to every hub-scoped model cache with it. The pure
  // builds run here in slices behind the fade, not in the swap frame (seconds on a phone): the island, the Mempool
  // island's meshes, the rock guides' walls (BL.rockGuides.prepareSteps) and every Ooga's rig. What is left for enter
  // is placing the props, the crew and the outline registry. A kept hub skips it; boot takes the same sliced path.
  const prepareHubSteps = function* (ctx) {
    if (heldHub || ctx.from === "hub") return null;
    preparedCharacters.clear();
    const factory = caves.slots.find(slot => slot.status === "open" && slot.scene === "factory");
    const options = { seed: SEED, roofHole: factory ? { id: factory.id, ...BL.factoryModels.ROOF_TUBE } : null };
    const slice = { until: 0, budget: BL.buildTasks.SLICE_MS, work: 0 };
    if (!terrain.hasIsland(options)) yield* terrain.islandSteps(options, slice);
    yield* poolModels.prepareSteps();
    yield* BL.rockGuides.prepareSteps(terrain.island(options), slice);
    // The Mempool island's walked meshes' collision trees, and ₿IFRÖST's islet, each a task of its own.
    for (const geometry of [poolModels.islet(), poolModels.rampFloor(), poolModels.membrane(), poolModels.crossing(), poolModels.bridge()]) {
      yield;
      BL.solidProps.prepare(geometry);
    }
    if (BL.scenes.bifrost) yield* BL.bifrostIsle.prepareSteps();
    const roster = contributors.activeRoster, point = camera ? camera.position : PILE_VIEW.target;
    const requested = ctx.world.pilot || params.get("character")?.trim().toLowerCase();
    const distance = contributor => {
      if (requested && contributor.name.toLowerCase() === requested.toLowerCase()) return -Infinity;
      const p = characterLocations.get(contributor.name);
      return p ? (p.x - point.x) ** 2 + (p.y - point.y) ** 2 + (p.z - point.z) ** 2 : Infinity;
    };
    // Last-visit positions give an exact nearest-first priority on a rebuild. Cold boot has no placed actors yet;
    // its requested driver leads, then stable roster order. A cold spatial spawn planner remains a separate step.
    const nearest = roster.map((contributor, index) => ({ contributor, index, distance: distance(contributor) }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index).slice(0, 10).map(row => row.contributor);
    const first = new Set(nearest), ordered = nearest.concat(roster.filter(contributor => !first.has(contributor)));
    for (const contributor of ordered) {
      preparedCharacters.set(contributor.name, models.caveman(contributors.traitsFor(contributor.name)));
      yield;
    }
    return null;
  };
  const takePreparedCharacter = (name) => {
    const cave = preparedCharacters.get(name);
    preparedCharacters.delete(name);
    return cave || models.caveman(contributors.traitsFor(name));
  };
  // Half the construction slice: an enter's steps are coarser than a builder's, and a slice runs to its next pause.
  const ENTER_SLICE_MS = 20;
  const pause = function* (slice) {
    if (performance.now() < slice.until) return;
    yield;
    slice.until = performance.now() + ENTER_SLICE_MS;
  };
  // The island's whole visit, built in slices when the director lets it (`enterSteps`: cold boot and a released
  // hub's return) and in one go otherwise (`enter`: a kept hub's resume, which never pauses). `pause` gives the
  // event loop back once a slice has run its budget; between slices nothing of the visit runs, and input stays held.
  const enterSteps = function* (ctx) {
    const slice = { until: performance.now() + ENTER_SLICE_MS };
    prefetchAt = 0;
    reuseHub = ctx.hubPolicy === "keep";
    if (heldHub) { resumeHub(ctx); return; }
    ({ renderer, game, world, go, lootEnabled, testBananas } = ctx);
    poolEffectsActive = false; poolEffectsTime = 0;
    glCanvas = ctx.canvas;
    factoryDeparting = bifrostDeparting = factoryHeld = false;
    Object.assign(factoryWalk, { phase: 0, cave: null, seen: false, through: false, beat: 0, grab: false, still: 0, hold: 0, settle: false });
    world.islandKeep = null;
    overlayCanvas = ctx.overlay;
    magazineState = {
      get owned() { return !!crew && crew.hasMagazine(crew.player); },
      get ammo() { return crew ? crew.magazineAmmo(crew.player) : 0; },
      get count() { return crew ? crew.magazineCount(crew.player) : 0; },
      get carrier() { return crew && crew.hasMagazine(crew.player) ? crew.player.traits.name : null; }
    };
    magazine = null;
    camera = createCamera({ fov: 48, near: 0.5, far: 900 });
    root = createNode();
    positionDebug = document.getElementById("position-debug");
    positionDebug.hidden = !POSITION_DEBUG;
    positionDebugNext = 0;
    positionDebugJSON = "";
    positionDebugState = "";
    if (POSITION_DEBUG) positionDebug.addEventListener("click", copyPositionDebug, { signal: ctx.signal });
    solids = BL.solidProps.create();
    clock = daylight.createClock({ hour: hourParam, daylen: daylenParam, day: dayParam, time: timeParam, now: new Date() });
    phase = null;
    const factorySlot = caves.slots.find(slot => slot.status === "open" && slot.scene === "factory");
    island = terrain.island({ seed: SEED, roofHole: factorySlot ? { id: factorySlot.id, ...BL.factoryModels.ROOF_TUBE } : null });
    guideWitness[0] = -1;
    cutawayPathBounds = buildCutawayPathBounds(island.cutawayPaths);
    guideSegmentClear.boxGrid = POOL_SEAMS[0].boxGrid = POOL_SEAMS[1].boxGrid = island.sightGrid;
    buildCameraRamps();
    cameraCaveIndex = 0;
    cameraEntranceIndex = 0;
    cameraPreviousValid = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    cameraTrailSleeping = false;
    cameraManualContact = false;
    cameraTerrainValid = false;
    cameraTerrainRecovering = false;
    cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = null;
    playerCaveIndex = 0;
    CAMERA_OPENINGS.length = 0;
    for (let i = 0; i < island.mouths.length; i++) {
      const m = island.mouths[i], sr = Math.sin(m.ry), cr = Math.cos(m.ry);
      const slot = caves.slots.find((candidate) => candidate.id === m.id);
      const blocked = slot.status === "dark";
      CAMERA_OPENINGS.push({ id: m.id, caveIndex: i + 1, mouth: m, sr, cr, minX: PORTAL_MIN_X, maxX: PORTAL_MAX_X, minY: PORTAL_MIN_Y, maxY: PORTAL_MAX_Y, planeZ: PORTAL_Z, blocked, headquarters: slot.status === "headquarters", ramp: slot.status === "headquarters" ? island.headquarters.ramps.find((entry) => entry.id === m.id) : null, stopZ: blocked ? 0.53 + hubModels.sealedCaveFace(sealedCaveVariant(slot.id)).frontZ : PORTAL_Z, rim: hubModels.caveMouthRim().openingBounds });
    }
    mark("island");
    hud = hudMod.create({ signal: ctx.signal, roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks, preciseHover: true });
    presets = { pile: PILE_VIEW, gate: GATE_VIEW };
    pilot = pilotMod.create({ renderer, canvas: ctx.canvas, camera, hud, presets, landing: "pile", pitch: [PITCH_MIN, PITCH_MAX], dist: [DIST_MIN, DIST_MAX], follow: FOLLOW, fly: FLY, clampTarget, clampCamera, observeOrbit: position => clampCamera(position, 0), ceilingAt, birdsEyeMin: BIRDS_EYE_MIN, birdsEyeCeiling, releaseView: releaseCameraView, enterFreeView: enterFreeCameraView, coarse: COARSE, onFreeAction: freeAction, jetpackStatus: jetpackHudStatus, mayPossess: mayDriveOoga, combatOnly: () => gameCombatOnly, close: { ...CLOSE_VIEW, maxStep: STEP_MAX, groundAt: playerSupportAt, visualGroundAt: visualSupportAt, sleepEyeFloorAt, zone: () => playerCaveIndex } });
    chalkboard = BL.chalkboard.create({
      renderer,
      onOpen: () => { pilot.setActive(false); pilot.controls.reset(); input.reset(); hud.tooltip.hide(); },
      onClose: () => { pilot.setActive(true); pilot.controls.reset(); input.reset(); }
    });
    yield* pause(slice);
    terrainRampRoof = BL.terrainCutaway.createRampRoof(island.cutawaySource, island.geometry, renderer.releaseGeometry);
    yield* pause(slice);
    debugMovementTerrain = place(terrainRampRoof.baseGeometry, 0, 0, 0, 0);
    addChild(root, terrainRampRoof.node);
    placed.push(terrainRampRoof.node);
    addTerrainSection(island.cutawaySource, root);
    for (const mouth of island.mouths) {
      const slot = caves.slots.find(candidate => candidate.id === mouth.id);
      if (slot.status !== "open" && slot.status !== "mirror") continue;
      const cos = Math.cos(mouth.ry), sin = Math.sin(mouth.ry), room = mouth.room;
      // Cave local -z points into the mountain. Include the entrance lintel
      // and a wall thickness around the authored room, leaving adjacent hills.
      const back = -room.to - 0.45, front = 1.15, center = (back + front) / 2;
      const region = {
        id: mouth.id, x: mouth.x + sin * center, z: mouth.z + cos * center, cos, sin,
        halfWidth: Math.max(room.w / 2, 2.5) + 0.45, halfDepth: (front - back) / 2, y: mouth.floorY + 2.85
      };
      addTerrainSection(island.cutawaySource, root, 0, region);
    }
    // The path geometry never changes after the island builds; reuse its tagged copy on every visit.
    let pathGeometry = PATH_GEOMETRY.get(island.path.geometry);
    if (!pathGeometry) PATH_GEOMETRY.set(island.path.geometry, pathGeometry = { ...island.path.geometry, faces: island.path.geometry.faces.map(face => ({ ...face, matrixPermanentFallback: true, road: true })) });
    pathNode = createNode({ geometry: pathGeometry, instanceData: island.path.instanceData, instanceCount: 0, instanceVersion: 0, depthBias: 0.05 });
    addChild(root, pathNode);
    placed.push(pathNode);
    altar = buildAltar();
    const layoutPile = (radius) => {
      altar.setRadius(radius);
      const changed = island.path.setRadius(altar.platformRadius);
      island.path.apply(pathNode);
      if (changed) { movePilePosts(); clearRingPalms(); reflowScenery(); invalidateRageThrowMap(); }
    };
    layoutPile(pileMod.visualFootprintFor(world.level, PILE_SCALE));
    // While ₿IFRÖST is open its arch stands over the pass in the old gate's place, at the head of Bifröst; its stone is
    // the gate, and its gold, banners, lanterns and lit name dress it off the outlines.
    const arch = BL.scenes.bifrost ? BL.bifrostGate.landmark() : null;
    yield* pause(slice);
    const gate = place(arch ? arch.stone : hubModels.gate(), island.gate.x, island.gate.z, island.gate.ry);
    if (arch) gate.depthBias = -0.05; // Canvas also favours the dressed stone where it meets the ridge.
    solids.add(gate);
    // The arch's pick sphere is its stone's own bounds (radius 0), which reach its crystals and lanterns too, and a ray
    // counts only where it meets the arch's shell, so a tap through the opening reaches the bridge and the islet beyond.
    // Where it does meet the stone the arch ranks with the cave mouths, above props' broad spheres (the jumbotron's
    // takes in the whole middle of the arch), while an Ooga before it is still nearer.
    const gateOwner = { kind: "gate" };
    if (arch) {
      const P = gate.position, cos = Math.cos(gate.rotation.y), sin = Math.sin(gate.rotation.y);
      gateOwner.priority = 1;
      gateOwner.pickRay = (ray) => {
        const ox = ray.ox - P.x, oz = ray.oz - P.z;
        return arch.pick(ox * cos - oz * sin, ray.oy - P.y, ox * sin + oz * cos, ray.dx * cos - ray.dz * sin, ray.dy, ray.dx * sin + ray.dz * cos);
      };
    }
    addTarget(gate, gateOwner, { radius: arch ? 0 : 3 });
    props.push({ kind: "prop", prop: "gate", node: gate, x: gate.position.x, z: gate.position.z, ripe: 0, active: true });
    claim(gate.position.x, gate.position.z, arch ? arch.reach : 3);
    TICKER_AT.y = gate.position.y + (arch ? arch.top + 1 : 6);
    GATE_VIEW.target.y = gate.position.y + (arch ? arch.middle : 2.5);
    const archLamp = arch ? dressArch(gate, arch) : null;
    fireRigs = [];
    firePitRig = null;
    yield* pause(slice);
    headquarters = buildHeadquarters();
    yield* pause(slice);
    const bedrolls = headquarters.mattresses;
    headquarters.sleepAnchors = bedrolls;
    yield* pause(slice);
    for (const slot of caves.slots) {
      const m = island.mouths.find((mouth) => mouth.id === slot.id);
      addTarget(buildMouth(slot, m), { kind: "cave", slot, priority: 1 }, { radius: 2.6 });
      yield* pause(slice);
      claim(m.x, m.z, 3.5);
      if (workCave(slot)) {
        workZones.push({ x: m.x, z: m.z, floor: m.floorY, sr: Math.sin(m.ry), cr: Math.cos(m.ry), active: false, half: 3.4, front: 5.8 });
      }
      if (slot.status === "open" || slot.status === "mirror" || slot.status === "headquarters") entranceZones.push({ x: m.x, z: m.z, sr: Math.sin(m.ry), cr: Math.cos(m.ry) });

      if (slot.scene) presets[slot.scene] = mouthView(m);
      else if (slot.place) presets[slot.place] = mouthView(m);
    }
    const buildSpotsList = BUILD_DEGREES.map((deg) => {
      const spot = spotAt(deg, BUILD_RADIUS, 1);
      if (!spot) return null;
      const { x, z } = spot;
      claim(x, z, 0.9);
      return { x, z, ry: Math.atan2(-x, -z) };
    }).filter(Boolean);
    buildRim();
    mempoolIsland = yield* buildMempoolIsland(slice);
    yield* pause(slice);
    timechainIsland = yield* buildTimechainIsland(slice);
    bifrostIsle = BL.scenes.bifrost ? yield* buildBifrostIsle(archLamp, slice) : null;
    const firePos = buildFire();
    yield* pause(slice);
    fire = lamps[lamps.length - 1];
    fire.centerLight = true;
    // The arch's lanterns pool warm light on its stone, ranked right after the fire so every tier keeps the fires first;
    // its glass glows with the islet's lamps.
    if (archLamp) addLamp({ glow: 0, flare: 0, visible: true }, LAMP.arch, archLamp.pool.x, archLamp.pool.y, archLamp.pool.z, true, 1, "bifrost:arch");
    // The Oogatron arches gently over the path at the top of the south stairs.
    {
      const jx = 0, jz = 28.5, jScale = 2.6;
      const jry = Math.atan2(-jx, -jz);
      claim(jx, jz, 3.8);
      // Lift the cabinet clear of the path while the posts remain buried beside it.
      const legDrop = BL.jumbotron.DROP, jSink = 0.06, jLift = 1.62;
      jumbotron = BL.jumbotron.create({
        data: BL.jumbotronData,
        position: { x: jx, y: island.surfaceAt(jx, jz) + (legDrop - jSink) * jScale + jLift, z: jz },
        ry: jry,
        scale: jScale,
        curved: true
      });
      addChild(root, jumbotron.node);
      placed.push(jumbotron.node);
      addProp("jumbotron", jumbotron.node, jx, jz, 3.8).pickRay = ray => jumbotron.pickRay(ray);
      hud.restoreBoards(jumbotronBoard);
      // Live stats land on the board and on the roster: fresh last-seen
      // times flow through contributors -> crew.refreshStates, which wakes a
      // sleeper into a walk out of the HQ (and the 60s state interval later
      // walks idled Oogas down to bed).
      oogatronUnsub = oogatronLive.subscribe(onOogatron);
    }
    yield* pause(slice);
    buildTotems();
    yield* pause(slice);
    addDressingLights();
    buildPilePosts();
    plantPalms();
    raiseIslets();
    yield* pause(slice);
    buildLife();
    yield* pause(slice);
    yield* scatter(slice);
    mempoolIsland.claimGround();
    timechainIsland.claimGround();
    if (bifrostIsle) bifrostIsle.claimGround();
    clearFireBush(firePos);
    buildLawn();
    reflowScenery();
    buildSpots();
    buildClouds();
    // The ring's veils are laid in a group of their own before it joins the island, so each one's ripples, which read
    // their veil's place once, walk only the group to find it.
    gameRing = createNode({ visible: false, sightHidden: true });
    ringPanelGeometries().forEach((geometry, i) => {
      const a = i * RING_STEP;
      const node = createNode({ geometry, position: { x: Math.sin(a) * GAME_RING.r, y: 0, z: -Math.cos(a) * GAME_RING.r }, rotation: { x: 0, y: -a, z: 0 },
        mirrorRippleOnly: true, matrixNative: true, sightHidden: true, rippleTint: BCA_TINT });
      addChild(gameRing, node);
      BL.mirrorRipples.create(node);
      ringPanels.push(node);
    });
    addChild(root, gameRing);
    placed.push(gameRing);
    for (let i = 0; i < RING_LANTERNS; i++) {
      const a = i / RING_LANTERNS * Math.PI * 2;
      const node = createNode({ geometry: ringLanternGeometry(), position: { x: Math.sin(a) * GAME_RING.r, y: 0, z: -Math.cos(a) * GAME_RING.r }, visible: false, sightHidden: true });
      addChild(root, node);
      placed.push(node);
      ringLanterns.push(node);
    }
    spawnMagazinePickup();
    critters = crittersMod.create({ root, renderer, flowers: scenery.filter((o) => o.prop === "flower" && o.active), fire: firePos, secondaryFire: { x: 0, y: island.headquarters.floor, z: 0 }, meadowRadius: MEADOW, heightAt: island.surfaceAt, activeAt: effectsActiveAt });
    mark("props");
    const shared = { root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, overlayVisible: matrixOverlayVisible, zzzVisible: sleepMarksVisible, tickerAt: TICKER_AT, buildSpots: buildSpotsList, walkIn: WALK_IN, clampDrag, viewYaw: PILE_VIEW.yaw, bedrolls, pileScale: PILE_SCALE, pileY: ALTAR_HEIGHT + 0.02, matrixLivingPile: true, onLayout: layoutPile, crateRadius: () => Math.max(4.4, altar.platformRadius + 0.8), groundAt: playerSupportAt, ceilingAt, wanderSpot, walkable, flyable, glideJetCeiling, useNear, abyssAt, abyssRespawnY: ABYSS_RESPAWN_Y, seaY: SEA_Y, jetpackAllowed, reticleTarget, phase: () => phase };
    shared.weaponsEnabled = true;
    shared.animationInterval = animationInterval;
    shared.deliverySource = factoryMouth ? factoryMouth.deliverySource : null;
    shared.reloadSlotRadius = () => island.path.debug.ringLoadingRadius;
    shared.reloadRadius = () => island.path.debug.ringCenterRadius;
    shared.reloadHeight = ALTAR_HEIGHT;
    shared.onAbyssRespawn = loseAbyssAmmo;
    shared.underHome = (x, z) => x * x + z * z < (RADIUS + 2) * (RADIUS + 2);
    shared.characterOccluded = characterUiOccluded;
    shared.renderOpts = RENDER_OPTS;
    fx = shared.fx = fxMod.create(shared);
    weather = weatherMod.create({ root, renderer, camera, heightAt: mempoolIsland.rainAt, fx, onRain: mempoolIsland.rainHit, centre: mempoolIsland.centre });
    footsteps = BL.footsteps.create();
    // The snapshot outlives the visit, so a re-entered hub opens in the weather it left.
    weather.apply(chain.snapshot);
    mempoolIsland.water.apply(chain.snapshot);
    // Give the distant island its standing lake and cloud deck before its first proximity check.
    mempoolIsland.water.update(0, 0);
    weather.update(0, null);
    weather.pause(true);
    mempoolIsland.paintings.refresh(chain.snapshot);
    refreshChainSign();
    unsubscribeChain = chain.subscribe(onChain);
    unsubscribeMempool = mempool.subscribe(onMempool);
    shared.characterSupportAt = characterSupportAt;
    shared.standingOnGorilla = (cave, feet) => {
      const p = cave.root.position;
      return Math.abs(characterClankerSupportAt(p.x, p.z, feet, 0, cave) - feet) <= 1e-6;
    };
    shared.carryCharacter = carryCharacter;
    shared.npcWalkable = npcWalkable;
    shared.npcYieldAhead = npcYieldAhead;
    shared.prepareNpcRoutes = refreshWorkZones;
    shared.npcDetour = npcWorkDetour;
    shared.npcRouteBlocked = (cave, x, y, z) => npcClosedCaveAt(x, z, y, cave.bodyHeight) || npcWorkZoneAt(cave, x, y, z)
      || npcRampRoofAt(x, y, z) || cave.state === "chilling" && Math.hypot(x, z) < island.path.debug.ringOuterRadius + 1.5;
    shared.npcStrandedAt = (cave, x, y, z) => npcRampRoofAt(x, y, z);
    shared.npcCaveRoofAt = npcCaveRoofAt;
    shared.npcRecoverySpot = npcRecoverySpot;
    shared.respawnSpot = pileRespawnSpot;
    shared.initialWorkSpot = (cave, out) => pileRespawnSpot(cave, out, true) || npcRecoverySpot(cave, out);
    shared.shoulderObstacleActive = solids.isActive;
    shared.shoulderObstacle = (cave, fx, fz, reach, out) => {
      const p = cave.root.position;
      if (!solids.shoulderAt(p.x, p.y - cave.baseY + STEP_MAX, p.z, fx, fz, PLAYER_RADIUS, Math.max(0, cave.bodyHeight - STEP_MAX), reach, out, p.y - cave.baseY + 1e-7)) return false;
      if (!out.node.sightSolid && !mempoolIsland.walked.has(out.node)) return true;
      // A level probe can hit later stair treads, a bridge deck above the current feet, or the Mempool island's
      // own ground rising ahead: a terrace, the lake's bowl, a ramp. That ground is walked on, never passed round.
      // Follow ordinary support in short swept steps before treating the
      // whole staircase as a tall prop that must be passed sideways.
      const steps = Math.max(1, Math.ceil(reach / 0.125));
      let x = p.x, z = p.z, feet = p.y - cave.baseY;
      for (let i = 1; i <= steps; i++) {
        const nx = p.x + fx * reach * i / steps, nz = p.z + fz * reach * i / steps;
        const floor = playerSupportAt(nx, nz, feet, feet, cave);
        if (floor < feet - STEP_MAX - 1e-7 || !walkable(x, z, nx, nz, feet, cave.bodyHeight, cave)) return true;
        x = nx; z = nz; feet = floor;
      }
      return false;
    };
    // Once a tall prop causes a shoulder pass, stay beside its lower tiers.
    // Mounting one would interrupt the return to the walking line.
    shared.shoulderPropClear = (cave, x, z) => {
      const p = cave.root.position, feet = p.y - cave.baseY + 1e-5;
      // A bridge pass may have started before its next tread was reachable. Use the same raised-foot
      // clearance as walking to release that pass, rather than sweeping feet straight into the deck edge.
      if (mempoolIsland.walked.has(cave.shoulder.obstacle.node)) return walkable(p.x, p.z, x, z, p.y - cave.baseY, cave.bodyHeight, cave);
      return (cave === pilot.player ? solids.escapeSegmentClear : solids.segmentClear)(p.x, feet, p.z, x, feet, z, PLAYER_RADIUS, cave.bodyHeight - 1e-5);
    };
    shared.onBodyMove = moveCampBody;
    mirrorCave.ripples = BL.mirrorRipples.create(mirrorCave.node);
    entropyLab.phase = BL.labPhase.create(entropyLab.group, entropyLab.mouth, entropyLab.opening);
    yield* pause(slice);
    for (const veil of caveVeils) {
      veil.phase = BL.labPhase.create(veil.group, veil.mouth, veil.opening, veil.plane, veil.tint);
      veil.phase.pause(true);
      yield* pause(slice);
    }
    // The factory's shield crests in its emitters' cyan, and on WebGL its window into the hall, which shows the page's
    // one factory node: the island ticks it while it is here, as the hall does.
    if (factoryMouth) {
      Object.assign(factoryMouth, { phase: BL.labPhase.create(factoryMouth.group, factoryMouth.mouth, factoryMouth.opening, BL.factoryModels.SHIELD_Z, BL.factoryWindow.TINT), hum: 0, node: BL.factoryFeed.node(world) });
      factoryMouth.roofEffectsActive = false;
      factoryMouth.hall = renderer.kind === "webgl2" ? BL.factoryWindow.create({ group: factoryMouth.group, mouth: factoryMouth.mouth, node: factoryMouth.node }) : null;
      if (factoryMouth.hall && island.roofOpening) {
        const roof = island.roofOpening;
        const group = createNode({ position: { x: roof.x, y: roof.y - BL.factoryWindow.AXIS, z: roof.z }, rotation: { x: -Math.PI / 2, y: factoryMouth.mouth.ry, z: 0 } });
        addChild(root, group); placed.push(group);
        factoryMouth.roofWindow = BL.factoryWindow.create({ group, mouth: factoryMouth.mouth, node: factoryMouth.node, roof });
        factoryMouth.hall.debug.roof = factoryMouth.roofWindow.debug;
      }
    }
    yield* pause(slice);
    // B.C.A.'s veil glows warm, a lamp's amber, over the office the gorillas suit up behind.
    if (bcaMouth) bcaMouth.phase = BL.labPhase.create(bcaMouth.group, bcaMouth.mouth, bcaMouth.opening, BCA_VEIL_Z, BCA_TINT);
    // ₿IFRÖST's field crests in the chamber's blue, and on WebGL shows the chamber through it; Heimdall keeps the bridge.
    if (bifrostIsle) {
      const b = bifrostIsle, p = b.site.portal, h = b.site.heimdall;
      b.phase = BL.labPhase.create(b.group, p, p.opening, p.fieldZ, BIFROST_TINT);
      b.heimdall = BL.bifrostHeimdall.create({ parent: root, x: h.x, y: h.y, z: h.z, heading: h.heading, fx });
      placed.push(b.heimdall.root, b.heimdall.plinth);
      solids.add(b.heimdall.plinth);
      addProp("heimdall", b.heimdall.pick, h.x, h.z, 1.2).weaponType = "none";
    }
    headquarters.entropyLab = entropyLab;
    entropyLab.updateEquipment = updateLabEquipment;
    shared.clipProjectileTarget = entropyLab.phase.clipTarget;
    shared.absorbProjectile = (ax, ay, az, point, dt, source, workShot) => entropyLab.phase.absorb(ax, ay, az, point, dt)
      || !!(factoryMouth && factoryMouth.phase.absorb(ax, ay, az, point, dt))
      || !!(bcaMouth && bcaMouth.phase.absorb(ax, ay, az, point, dt))
      || !!(bifrostIsle && bifrostIsle.phase.absorb(ax, ay, az, point, dt))
      || absorbCaveVeil(ax, ay, az, point, dt)
      || !!(workShot && source && shared.workSites[source.work.site]?.mirrorRoom
        && mirrorCave.ripples.absorb(ax, ay, az, point));
    shared.onProjectileMove = (ax, ay, az, bx, by, bz, dt) => mirrorCave.ripples.cross(ax, ay, az, bx, by, bz, dt);
    shared.weaponInteraction = (owner, node) => node === mirrorCave.node
      || (!ghosts && !!ghostEntry || !!ghosts && !ghosts.busy) && owner.kind === "halloween" && owner.role === "herald" && owner.active;
    shared.onWeaponImpact = weaponImpact;
    shared.onMeleeStrike = mirrorCave.ripples.strike;
    shared.aimSurface = mirrorCave.ripples.aimAt;
    shared.continueShot = mirrorCave.ripples.continueShot;
    shared.fireReachable = (x, y, z, toX, toY, toZ, ignoreNode = null, precise = false) => actionReachable(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.025)
      && solids.segmentClear(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.01, precise ? 2e-6 : 0.02, ignoreNode)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, precise ? 1e-6 : 0.01, precise ? 2e-6 : 0.02);
    clankerFireReachable = shared.fireReachable;
    shared.workShotClear = (x, y, z, toX, toY, toZ) => actionReachable(x, y, z, toX, toY, toZ, 0.01)
      && solids.segmentClear(x, y, z, toX, toY, toZ, 0.01, 0.02)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, 0.01, 0.02, true);
    // Cursor selection needs a surface point, not the projectile's clearance
    // margin: that small vertical gap becomes a large miss along a distant floor.
    shared.cursorReachable = (x, y, z, toX, toY, toZ) => actionReachable(x, y, z, toX, toY, toZ, 0.001)
      && solids.segmentClear(x, y, z, toX, toY, toZ, 0.001, 0.002)
      && matrixGateSegmentClear(x, y, z, toX, toY, toZ, 0.001, 0.002);
    shared.inBananas = inBananas;
    shared.npcDestinationBlocked = npcDestinationBlocked;
    shared.npcLandingAllowed = npcLandingAllowed;
    shared.npcRecoveryDrop = (x, y, z) => npcCaveRimAt(x, y, z);
    shared.npcHazardClear = (x, y, z, toX, toY, toZ, height, cave) => npcClosedCaveClear(x, y, z, toX, toY, toZ, height) && npcFireClear(x, y, z, toX, toY, toZ, height) && npcWorkZoneClear(cave, x, y, z, toX, toY, toZ);
    shared.onModelChange = refreshObjectGuides;
    shared.trackMirrorObject = trackMirrorObject;
    shared.untrackMirrorObject = untrackMirrorObject;
    shared.refreshMirrorObject = refreshMirrorObject;
    cameraCover = BL.cameraCover.create(ctx.overlay);
    headquarters.cameraCover = cameraCover.state;
    yield* pause(slice);
    ensureRockGuides();
    yield* pause(slice);
    // Reading the cue builds it, so any view or inspector needing one gets it without waiting on the timer.
    Object.defineProperty(headquarters, "rockGuides", { configurable: true, get: ensureRockGuides });
    mark("rockGuides");
    pile = shared.pile = pileMod.create(shared);
    pileHovered = false;
    poolBlockHovered = poolBlockHoverIgnore = null;
    POOL_BLOCK_HIT.node = POOL_BLOCK_HIT.owner = null;
    pileTipValue = "";
    pileTopY = BL.scene.boundsOf(pile.core.geometry).max[1];
    addTarget(pile.core, { kind: "pile", weaponType: "none" });
    bananaCover = BL.bananaCover.create({ overlay: ctx.overlay, pile, renderOpts: RENDER_OPTS, renderer, floor: ALTAR_HEIGHT, lightVisibleAt: bananaLightVisibleAt });
    headquarters.bananaCover = bananaCover;
    solids.sync();
    shared.npcPaths = headquarters.npcPaths = BL.npcPaths.create({
      island, walkable: npcWalkable, pointAllowed: (x, z) => !npcClosedCaveAt(x, z) && !npcRampRoofAt(x, island.surfaceAt(x, z), z),
      surfaceAt: (x, z, y) => island.supportAt(x, z, y, 1e-6, null, PLAYER_RADIUS)
    });
    yield* pause(slice);
    const sleepNavigation = headquarters.sleepNavigation = BL.headquartersSleep.create({ island, beds: bedrolls, walkable: sleepRouteClear, surfaceRoute: shared.npcPaths.route });
    yield* pause(slice);
    // Overflow sleepers take the rainforest's fixed anchors in order, searched once a page and only as far as needed.
    // Only scenery belongs in this cached search: a passing Ooga must not permanently change the anchor order.
    const forest = BL.headquartersSleep.outdoor(mempoolIsland,
      (x, y, z) => island.clearAt(x, y, z, 0.15, 1.5) && mempoolIsland.sleepClear(x, y, z), island);
    shared.outdoorBedrolls = headquarters.outdoorBeds = forest.beds;
    shared.moreOutdoorBedrolls = forest.more;
    const sleepRouteFrom = { x: 0, y: 0, z: 0 };
    // An Ooga stood up on its mattress plans from the floor under it: the planner joins a start to its graph along the
    // island's floor both ways, and that floor never climbs back onto a bed, so a start on one would never join.
    const planFeet = (cave) => {
      const p = cave.root.position, feet = p.y - cave.baseY;
      return Math.abs(bedSupportAt(p.x, p.z, feet, 1e-4, 0) - feet) < 1e-4 ? island.supportAt(p.x, p.z, feet, STEP_MAX, -120, sleepNavigation.radius) : feet;
    };
    shared.bedRoute = (cave, bed, toBed) => {
      const home = cave.slot || WALK_IN;
      return sleepNavigation.route(cave.root.position.x, planFeet(cave), cave.root.position.z, bed, toBed, home.x, home.z, !toBed && cave.state === "chilling");
    };
    shared.bedPlan = (cave, bed, toBed) => {
      const home = cave.slot || WALK_IN;
      return sleepNavigation.plan(cave.root.position.x, planFeet(cave), cave.root.position.z, bed, toBed, home.x, home.z, !toBed && cave.state === "chilling");
    };
    shared.bedRouteClear = (cave, to) => {
      const p = cave.root.position;
      sleepRouteFrom.x = p.x; sleepRouteFrom.y = p.y - cave.baseY; sleepRouteFrom.z = p.z;
      return sleepNavigation.clearSegment(sleepRouteFrom, to, false, 0.3);
    };
    shared.workSites = caves.slots.filter(workCave).map((slot) => {
      const mouth = island.mouths.find((entry) => entry.id === slot.id), sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);

      const aimX = mouth.x + sr * 5.8, aimZ = mouth.z + cr * 5.8, approach = { x: aimX, z: aimZ };
      let nearest = Infinity;
      // Rejoin the painted trail itself, rather than an off-path mouth-axis
      // marker that makes every worker step sideways and retrace their steps.
      for (const line of island.path.centerlines) for (let n = 1; n < line.length; n++) {
        const a = line[n - 1], b = line[n], dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
        const t = length2 ? clamp(((aimX - a.x) * dx + (aimZ - a.z) * dz) / length2, 0, 1) : 0;
        const x = a.x + dx * t, z = a.z + dz * t, distance = (x - aimX) ** 2 + (z - aimZ) ** 2;
        if (distance < nearest) { nearest = distance; approach.x = x; approach.z = z; }
      }
      return {
        repo: slot.repo,
        additionalRepo: slot.additionalRepo,
        mouth, sr, cr,
        mirrorRoom: slot.status === "mirror",
        // The namesake cave adopts fresh contributors whose repo has no cave.
        fallback: slot.id === "c1",
        route: [approach],
        approachDistance: 2.5,
        target: (cave, out) => setVec(out, mouth.x, mouth.floorY + 1.5, mouth.z),
        position: (cave, out, retry = false) => {
          // Reserve the first free place in the fan. Leave the central path
          // open for reload traffic and stagger each extra row behind it.
          const count = crew.cavemen.size * 4 + 16;
          for (let attempt = 0; attempt < count; attempt++) {
            const place = (attempt + (retry ? cave.work.place + 1 : 0)) % count;
            const row = Math.floor(place / 4), side = place & 1 ? 1 : -1;
            // Leave a full-arm companion lane between the inner shooters.
            const x = side * (2.2 + Math.floor(place % 4 / 2) * 1.35 + (row & 1) * 0.6);
            // A wide fan too close to the rim fires diagonally into its stone
            // jambs. Back each row away enough to see across the opening.
            const z = 4.8 + row * 1.35 + Math.abs(x) * 0.32;
            const px = mouth.x + cr * x + sr * z, pz = mouth.z - sr * x + cr * z;
            let occupied = crew.spotOccupied(cave, px, mouth.floorY, pz);
            for (let i = 0; !occupied && i < crew.list.length; i++) {
              const other = crew.list[i];
              if (other === cave) continue;
              if (other === crew.player || other.state !== "working"
                || other.work.phase !== "outbound" && other.work.phase !== "station" && other.work.phase !== "shoot"
                || shared.workSites[other.work.site]?.repo !== slot.repo) continue;
              if (Math.hypot(other.work.position.x - px, other.work.position.z - pz) < 0.9) { occupied = true; break; }
            }
            if (occupied || Math.abs(island.supportAt(px, pz, mouth.floorY, 0.05, ABYSS_FLOOR, PLAYER_RADIUS) - mouth.floorY) > 0.05
              || !island.clearAt(px, mouth.floorY + 0.03, pz, PLAYER_RADIUS, cave.traits.height)
              || !solids.segmentClear(px, mouth.floorY + 0.03, pz, px, mouth.floorY + 0.03, pz, PLAYER_RADIUS, cave.traits.height)) continue;
            let clear = true;
            // Cover either gun shoulder and both sides of the usable doorway,
            // not just a center-to-center ray that misses an obstructed muzzle.
            for (let shoulder = -1; shoulder <= 1 && clear; shoulder += 2) for (let edge = -1; edge <= 1; edge++) {
              const ax = px + cr * shoulder * 0.65 - sr, az = pz - sr * shoulder * 0.65 - cr;
              const bx = mouth.x + cr * edge * 1.65 + sr * 0.5, bz = mouth.z - sr * edge * 1.65 + cr * 0.5;
              if (!shared.workShotClear(ax, mouth.floorY + 1.25, az, bx, mouth.floorY + 1.5, bz)) { clear = false; break; }
            }
            if (!clear) continue;
            out.x = px; out.y = mouth.floorY; out.z = pz;
            cave.work.place = place;
            return true;
          }
          return false;
        }
      };
    });
    shared.workTarget = (cave, out, sample) => clankers && clankers.target(cave, out, sample);
    shared.workCompanionTarget = (cave, out) => clankers && clankers.companionTarget(cave, out);
    shared.workHit = (cave) => clankers && clankers.hit(cave);
    shared.workPlanned = (cave, site) => clankers && clankers.plan(cave, site);
    mark("pile");
    shared.residentName = "SaniExp";
    shared.residentPose = (cave, dt) => grabbedOogaPose(cave) || timechainResidentPose(cave, dt);
    shared.releaseGrabbed = (cave) => cave.grabbedBy && finishClankerRider(cave.grabbedBy, false);
    // Signed-in visitors elsewhere, as the Oogas they drive; the crew walks round them.
    shared.outsideActors = () => remotes.actors();
    shared.outsideActorHeight = REMOTE_BODY_HEIGHT;
    shared.characterModel = takePreparedCharacter;
    yield* pause(slice);
    crew = shared.crew = crewMod.create(shared);
    remotes = BL.remotePlayers.create({
      root, crew, fx, player: controlledGuideActor, visible: remoteShown,
      createGorilla: (name, rec) => clankers.createRemote(name, rec),
      hideGorilla: (name, on) => {
        if (on && clankerPlay && clankerPlay.player?.owner.traits.name === name) clankerPlay.release();
        clankers.setRemote(name, on);
      }, posed: (cave, feet) => {
        const p = cave.root.position, height = cave.bodyHeight || 1.4;
        floatPose(cave, feet, height, 0, now);
        if (poolEffectsActive) mempoolIsland.wake(cave.root, p.x, feet, p.z, height, 0.35);
      }
    });
    // Signed-in pages keep the crew in step: one runs it for everyone, the others follow its frames. The
    // crew's effects, shots and work hooks pass through the sync, which notes them while this page hosts;
    // a following page replays them into the same effects and gorillas.
    npcSync = BL.npcSync.create({
      crew, fx, animationInterval,
      onPlan: (cave, site) => clankers && clankers.plan(cave, site),
      onHit: (cave) => clankers && clankers.hit(cave),
      onModelChange: (cave) => {
        refreshMirrorObject(cave.root);
        refreshObjectGuides();
      },
    });
    shared.fx = npcSync.fx;
    const workPlanned = shared.workPlanned, workHit = shared.workHit;
    shared.workPlanned = (cave, site) => {
      npcSync.recordPlan(cave, site);
      return workPlanned(cave, site);
    };
    shared.workHit = (cave) => {
      npcSync.recordHit(cave);
      return workHit(cave);
    };
    shared.onShot = (cave, from, to) => {
      npcSync.recordShot(cave, from, to);
      if (ghosts && cave === crew.player) ghosts.shot(from, to); // HALLOWEEN: the visitor's banana rounds sound, and the orb fires with them
    };
    shared.shotGeometry = () => ghosts && ghosts.hunting ? ghosts.shotGeometry() : null; // HALLOWEEN: rifles fire rocks, then lasers, through the hunt
    BL.net.setHub(true);
    for (const cave of crew.list) crew.setJetpackOwnership(cave, true, hubModels.jetpack(), hubModels.jetFlame());
    mirrorCave.body = BL.mirrorBody.create(mirrorCave.node, crew.cavemen);
    yield* pause(slice);
    for (const cave of crew.list) entropyLab.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    if (factoryMouth) for (const cave of crew.list) factoryMouth.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    if (bcaMouth) for (const cave of crew.list) bcaMouth.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    if (bifrostIsle) for (const cave of crew.list) bifrostIsle.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    for (const veil of caveVeils) for (const cave of crew.list) veil.phase.body.track(cave.root, cave.traits.height * 2,
      Math.max(cave.headOpen.verts.length, cave.headClosed.verts.length));
    if (magazine) trackMirrorObject(magazine.node, 1);
    for (let caveIndex = 0; caveIndex < crew.list.length; caveIndex++) {
      const cave = crew.list[caveIndex];
      cave.root.matrixLiving = true;
      cave.solidBounds = new Float64Array(6);
      mirrorActorRadius(cave);
    }
    headquarters.solids = { props: solids, supportAt: playerSupportAt, walkable, npcWalkable, npcDestinationBlocked, flyable, ceilingAt, inBananas };
    headquarters.firingZones = workZones;
    headquarters.firingZoneAt = npcWorkZoneAt;
    shared.addSolid = solids.add;
    shared.removeSolid = solids.remove;
    mark("cavemen");
    crates = shared.crates = cratesMod.create(shared);
    pilot.bind(shared);
    // The doorway draws the island once from inside the passage for the way back out (`renderView`), sets the
    // sphere's heartbeat going while a room readies slowly (`show`), and hands a crossing the island's own meshes to
    // keep on the GPU while the visit lasts (`keep`). A released island must not stay pinned by a departing visit.
    const keepGeometry = islandMeshes;
    timechainIsland.gate = BL.timechainGate.create({ site: timechainIsland.site, place: timechainIsland.place, pilot, crew, hud, camera, renderer, canvas: glCanvas, world, go, equipJetpack,
      show: timechainIsland.show, renderView: (view) => {
        timechainIsland.site.view(view.position);
        const rendered = renderer.render(root, view, RENDER_OPTS);
        timechainIsland.site.view(camera.position);
        return rendered;
      }, keep: keepGeometry });
    // A room's address opened signed in, with no visit of this tab's own to repeat, comes here with the room chosen.
    if (timechainIsland.gate.preselected) hud.toast(`Room ${timechainIsland.gate.preselected} is chosen at the keypad · walk up to it and press Enter to go in`);
    clankerMeshes = BL.solidProps.create();
    clankerPartOwners = new WeakMap();
    headquarters.solids.companions = clankerMeshes;
    const loungeRoofs = [], loungeAreas = [], climbRoofs = [], chillZones = [], descentWalls = [];
    for (const mouth of island.mouths) {
      const slot = caves.slots.find(slot => slot.id === mouth.id);
      const site = shared.workSites.find(site => site.mouth === mouth), room = site?.room || mouth.room;
      const sr = Math.sin(mouth.ry), cr = Math.cos(mouth.ry);
      // Reserve cave interiors at every lower level, leaving the roof above
      // the room ceiling available. Working and controlled gorillas bypass it.
      chillZones.push({
        x: mouth.x, z: mouth.z, sr, cr, half: room.w / 2 + 0.6,
        from: -room.to - 0.6, to: 0.5, top: mouth.floorY + room.h - 0.1
      });
      if (slot.status !== "dark") chillZones.push({
        x: mouth.x, z: mouth.z, sr, cr,
        half: 3.5, from: -0.5, to: 6.5, top: mouth.floorY + 2.6
      });
      const x = mouth.x - Math.sin(mouth.ry) * 4.8, z = mouth.z - Math.cos(mouth.ry) * 4.8;
      const y = island.surfaceAt(x, z);
      if (!Number.isFinite(y)) continue;
      const roof = { x, y, z, angle: mouth.ry };
      climbRoofs.push(roof);
      if (slot.status === "open" || slot.status === "mirror") descentWalls.push({
        x: mouth.x, z: mouth.z, sr, cr, half: room.w / 2 + 2,
        floor: mouth.floorY, middle: (y + mouth.floorY) * 0.5
      });
      if (slot.status === "dark" || slot.status === "headquarters") loungeRoofs.push(roof);
      if (slot.status === "dark") {
        loungeAreas.push({ x: mouth.x + sr * 6, z: mouth.z + cr * 6, radius: 9 });
      }
    }
    // The dressed gaps between neighbouring active caves are working space,
    // not chill routes. The same swept zones allow a former worker to leave.
    for (let i = 0; i < island.mouths.length; i++) {
      const a = island.mouths[i], b = island.mouths[(i + 1) % island.mouths.length];
      const active = m => { const status = caves.slots.find(slot => slot.id === m.id).status; return status === "open" || status === "mirror"; };
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      if (!active(a) || !active(b) || distance > 16) continue;
      const x = (a.x + b.x) * 0.5, z = (a.z + b.z) * 0.5, radius = Math.hypot(x, z);
      chillZones.push({
        x, z, sr: -x / radius, cr: -z / radius,
        half: distance * 0.5 + 1.5, from: -2, to: 9, top: Infinity
      });
    }
    const labSiteIndex = shared.workSites.findIndex(site => site.mouth === entropyLab.mouth);
    yield* pause(slice);
    clankers = BL.clankers.create({
      root, crew, animationInterval, sites: shared.workSites, loungeRoofs, loungeAreas, climbRoofs, chillZones, descentWalls,
      rageLandAt, rageEdgeAt, rageEdgeHeading, rageEdgeGoal, rageApproach, rageWarpRequired, rageWarpTarget, rageWarpPose, rageWarpHome, rageGrab, rageCaptive, rageRelease, rageThrow, rageDragClear, rageCarryClear, rageCaptureEligible, rageJumpPoseClear,
      rageHuntRange: entry => entry.radius + BODY_RADIUS + 0.35,
      sleep: clankerBeds(),
      walkingPeersClear: clankerWalkingPeersClear,
      debugMovement: DEBUG_GORILLA_MOVE, debugRage: DEBUG_GORILLA_RAGE, debugMinY: ABYSS_RESPAWN_Y,
      labSite: labSiteIndex,
      labInside: entropyLab.phase.inside, labStations: entropyLab.stations,
      offices: bcaMouth ? [bcaOffice()] : [],
      labEquipment: entropyLab.equipment, labPickup: pickUpLabEquipment, labReturn: returnLabEquipment, labRoll: rollLabEquipment,
      solidAt: island.solidAt, climbAreaAt: clankerClimbAreaAt, climbSolidAt: clankerClimbSolidAt, climbSurfaceAt: clankerClimbSurfaceAt, climbTorsoClear: clankerClimbTorsoClear,
      climbClear: clankerClimbClear, climbOpeningClear: clankerOpeningClear, platformEntryAt: clankerPlatformEntryAt,
      climbTransitionClear: clankerClimbTransitionClear, climbPeersClear: clankerPeersClear,
      restPoseClear: clankerRestPoseClear, restFootingClear: clankerRestFootingClear,
      groomClear: clankerGroomClear, restSiteClear: clankerRestSiteClear,
      groundAt: (x, z, y) => island.supportAt(x, z, y, 0.52), groundPlaneAt: clankerGroundPlaneAt, rectangleAt: clankerRectangleAt, surfaceAt: island.surfaceAt, stairAt: island.stairAt,
      pointSupportAt: (x, z, y, entry = null) => Math.max(island.supportAt(x, z, y, 0.02, -Infinity),
        solids.supportAt(x, z, y, 0.02, 0, null, null, false, null, !!entry?.rage?.active)),
      isGrass: island.isGrassAt, restSurfaceClear: clankerRestSurfaceClear, onLand: island.onLand,
      roamRadius: island.radius, meadowRadius: island.meadowRadius,
      clear: clankerClear, tallObstacleAhead: clankerTallObstacleAhead,
      onPound: poundClankerEquipment,
      fireContact: clankerFireContact, fireReachable: shared.fireReachable, fireClear: clankerFireClear,
      canSmash: canClankerSmash, supportAt: clankerSupportAt, terrainSupportAt: clankerTerrainSupportAt,
      track: (entry) => trackMirrorObject(entry.root, 3.6, 4248), untrack: (entry) => untrackMirrorObject(entry.root)
    });
    yield* pause(slice);
    shared.fireThreats = () => clankers.list;
    for (const entry of clankers.list) {
      entry.netBody = BL.net.gorillaBody(entry.owner.traits.name);
      entry.netMotion = new Float64Array(6);
      registerClanker(entry);
    }
    resetRageThrowMap(false);
    clankerPlay = BL.clankerPlay.create({
      canvas: ctx.canvas, camera, pilot, hud, clankers, input, renderer, reticleTarget,
      grabOoga: grabClankerRider, releaseOoga: releaseClankerRider,
      mayPossess: entry => BL.net.mayDriveGorilla(entry.owner.traits.name),
      combatOnly: () => gameCombatOnly,
      sightClear: shared.fireReachable, aimCeiling: entry => birdsEyeCeiling(entry, true), constrainCamera: constrainClankerCamera,
      groundAt: (x, z, y) => {
        // Sample below shoulder height in this layer, not a cave's roof or a
        // whole gorilla footprint. Over empty space, use the actor's feet plane.
        const floor = Math.max(island.supportAt(x, z, y, 0, ABYSS_FLOOR), solids.supportAt(x, z, y, 0, 0),
          mempoolIsland ? mempoolIsland.floatAt(x, z, y, 0, 0) : ABYSS_FLOOR);
        return floor > ABYSS_FLOOR ? floor : NaN;
      },
      birdsEyeMin: GORILLA_BIRDS_EYE_MIN, maxDistance: DIST_MAX
    });
    createClankerEquipment(shared.workSites);
    clankers.equipment = clankerEquipment;
    clankers.sites = shared.workSites;
    clankers.clear = clankerClear;
    if (DEBUG) { clankers.supportAt = clankerSupportAt; clankers.restFootingClear = clankerRestFootingClear; }

    hud.onAssign((entryId, name) => {
      if (game.assign(entryId, name)) {
        crew.applyAllSwag();
        crew.renderLocker();
        const cave = crew.cavemen.get(name);
        const item = game.itemOf(entryId);
        if (cave && item) {
          fx.say(cave, `Ooga! ${item.name}!`);
          hud.toast(`${item.name} → ${name}`);
        }
      }
    });
    hud.onUnassign((name) => {
      game.unassign(name);
      crew.applyAllSwag();
      crew.renderLocker();
    });

    Object.assign(hooks, {
      onHover: showHoverTooltip,
      onHoverMove: showHoverTooltip,
      onTap,
      ...pilot.hooks,
      hoverIgnore: () => clankerPlay.firstPerson ? clankerPlay.player : pilot.hooks.hoverIgnore(),
      onOrbit: (dx, dy) => {
        if (islandGuide.holding) return;
        if (clankerPlay.active) clankerPlay.orbit(dx, dy);
        else pilot.hooks.onOrbit(dx, dy);
      },
      onZoom: (factor, gesture, px, py) => {
        if (islandGuide.holding) return;
        if (clankerPlay.active) clankerPlay.zoom(factor, gesture);
        else pilot.hooks.onZoom(factor, gesture, px, py);
      },
      onDoubleTap: (hit, p) => {
        if (factoryDeparting || bifrostDeparting || islandGuide.holding) return;
        if (gorillaBehindBillboard(hit, p)) return;
        if (hit && hit.owner.kind === "clanker") {
          if (selectGorilla(hit.owner.entry)) selectDebugGorilla(null);
          return;
        }
        if (debugMovementTap(hit, p)) return;
        if (hit && hit.owner.kind === "caveman") { selectOoga(hit.owner.cave); return; }
        pilot.hooks.onDoubleTap(hit, p);
      }
    });
    entering = false;
    enteringTween = null;
    now = 0;
    hud.onPreset(name => { if (!factoryDeparting && !bifrostDeparting && !islandGuide.holding) navigate(name); });
    hud.setDetachedView("pile");
    hud.setDestinations(["pile", "lab", "mirror", "underground", "basement", "mempool", "factory", "arcade", "bca", "gate", "bifrost", "timechain"]);
    hud.onAction((action, value) => {
      if (factoryDeparting || bifrostDeparting || islandGuide.holding) return false;
      if (action === "mode-retake") {
        if (pilot.player || clankerPlay.active) return;
        const last = hud.retakeActor;
        if (!last) hud.toast("Select an Ooga or gorilla first");
        else if (last.gorilla) selectGorilla(last.actor);
        else selectOoga(last.actor);
        return;
      }
      if (clankerPlay.active && clankerPlay.action(action)) return;
      if (action === "clear-loot") clearLoot();
      else if (action === "reset") resetDemo();
      else if (action === "act") pilot.action();
      else if (action === "mode-preset") {
        (clankerPlay.active ? clankerPlay : pilot).freeCursor();
        return navigate(value);
      }
      else if (action.startsWith("mode-")) pilot.modeAction(action);
      else if (action === "jetpack-toggle") toggleJetpack();
      else if (action.startsWith("weapon-") || action === "magazine-swap") pilot.weaponAction(action);
      else if (action === "reset-view") return (clankerPlay.active ? clankerPlay : pilot).resetCamera();
    });
    yield* pause(slice);
    crew.refreshStates(true);
    yield* pause(slice);
    unsubscribeActivity = contributors.subscribe(() => crew.refreshStates());
    // Sign-in returns to the bare page; a routed hub place (a shared link, the Sphere's keypad) is still honoured.
    const signedInArrival = ctx.from === null && (!ctx.place || ctx.place === "donate") && !!BL.net.ownCharacter();
    let initialCharacter = ctx.from === null && !signedInArrival && !pilot.loginViewRestored && preloadedCharacter ? contributors.activeRoster.find((entry) => entry.name.toLowerCase() === preloadedCharacter) : null;
    if (ctx.from === null && !signedInArrival && !pilot.loginViewRestored && (preloadedJetpackWear || preloadedEquipment) && !params.has("character") && !initialCharacter) initialCharacter = contributors.activeRoster.find((entry) => crew.stateOf(crew.cavemen.get(entry.name)) === "working") || contributors.activeRoster[0];
    const initialGorilla = initialCharacter && preloadedGorilla ? crew.cavemen.get(initialCharacter.name) : null;
    // The Ooga that went into DSB, the Lightning Factory, ₿IFRÖST or Ooga Arcade comes back out as the one played.
    const handsBack = ctx.from === "dsb" || ctx.from === "factory" || ctx.from === "bifrost" || ctx.from === "arcade" || ctx.from === "lab" || ctx.from === "timechain";
    const returningCharacter = handsBack ? world.pilot : null;
    if (handsBack) world.pilot = null;
    if (initialGorilla) {
      // A sleeping contributor has no active companion. Wake only the named
      // owner so the normal sync builds its gorilla at a supported home.
      if (crew.stateOf(initialGorilla) === "sleeping") {
        initialGorilla.override = "chilling";
        crew.refreshStates(true);
      }
    } else if (initialCharacter || returningCharacter) {
      const cave = crew.cavemen.get(returningCharacter || initialCharacter.name);
      if (!contributors.debugState && !contributors.debugRoster && crew.stateOf(cave) !== "working") {
        cave.override = "working";
        crew.refreshStates(true);
      }
      pilot.possess(cave);
      if (returningCharacter && ctx.from === "factory") crew.selectWeapon(cave.weapon.selectedSlot, cave);
      if (initialCharacter) crew.configureWeapon(cave, preloadedWeapon, preloadedAmmo);
    }
    ownOogaClaimed = !!world.pilotDetached || !!(returningCharacter && BL.net.state.me) || !BL.net.state.me && ctx.from !== null;
    world.pilotDetached = false;
    claimOwnOoga();
    unsubscribeAccount = BL.net.subscribe(onAccountChange);
    const initialFirstPerson = ctx.from === null && preloadedFirstPerson && !initialGorilla && !pilot.loginViewRestored;
    if (initialFirstPerson) pilot.enterClose(true);
    // The /donate route: the island's own view with the donation popup open. As a routed place it keeps Tess from
    // greeting over the dialog.
    const donate = ctx.place === "donate", routedPlace = donate ? null : ctx.place;
    // Out of a Timechain room: behind the Sphere's curtain, to walk out through its doors.
    const sphereExit = ctx.from === "timechain" ? world.sphereExit : null;
    world.sphereExit = null;
    // Out of the Lightning Factory's shield on foot: in its light, walking on out of the mouth.
    const factoryCrossing = ctx.from === "factory" ? world.factoryCrossing : null;
    world.factoryCrossing = null;
    if (returningCharacter && sphereExit && pilot.player) timechainIsland.gate.arrive(sphereExit);
    else if (returningCharacter && factoryCrossing && pilot.player && factoryMouth) arriveFromFactory(factoryCrossing);
    else if (returningCharacter) navigate(ctx.from === "factory" || ctx.from === "bifrost" || ctx.from === "arcade" ? ctx.from : ctx.from === "timechain" ? "timechain" : "pile", false, false);
    else if (ctx.from === "bifrost" && !routedPlace) navigate("bifrost", false, false);
    else if (!signedInArrival && !pilot.loginViewRestored && !crew.sleeping && !initialGorilla && (routedPlace || preloadedView || initialCharacter || initialFirstPerson)) navigate(routedPlace || preloadedView || "pile", false, false);
    if (donate) hud.openFeed();
    if (initialCharacter && !initialGorilla && preloadedJetpack) {
      grantJetpack(pilot.player, preloadedJetpackWear);
    }
    clankers.sync();
    clankerMeshes.sync();
    stateTimer = window.setInterval(() => {
      crew.refreshStates();
      fx.trimPool();
    }, 6e4);
    for (let i = 0; i < crew.list.length; i++) crew.refreshRosterRow(crew.list[i]);
    if (lootEnabled) {
      crew.applyAllSwag();
      crew.renderLocker();
    }
    hud.setStats(game.state);
    pile.syncPile(true);
    pileGuides = headquarters.pileGuides = BL.pileGuides.create({
      pile, altar,
      cameraClear: (ax, ay, az, bx, by, bz) => guideSegmentClear(ax, ay, az, bx, by, bz) && objectGuides.cameraClear(ax, ay, az, bx, by, bz, preparingGuideActor || controlledGuideActor(), pile.core),
      cameraBoundsState: (minX, minY, minZ, maxX, maxY, maxZ, propsOnly) => objectGuides.cameraBoundsState(minX, minY, minZ, maxX, maxY, maxZ, preparingGuideActor || controlledGuideActor(), pile.core, guideSegmentClear, propsOnly),
      occlusionVersion: () => objectGuides.result.occlusionVersion
    });
    platformGuides = headquarters.platformGuides = BL.pileGuides.create({ pile, altar, platform: true });
    mirrorGuides = mirrorCave.guides = BL.mirrorGuides.create({ mirror: mirrorCave });
    yield* pause(slice);
    // Scenery may receive outlines, but only island rock activates the hidden character view.
    // Banana interiors keep their separate covered-view pass.
    objectGuides = headquarters.objectGuides = BL.objectGuides.create({ roots: root.children, crew, actorRoots: clankers.list.map((entry) => entry.root), exclude: [...terrainRampRoof.geometries, pathNode.geometry, mempoolIsland.site.ground.geometry], providers: [pileGuides, platformGuides, mirrorGuides], propsBlockActor: false, perceptionThrough: (actor) => inBananas(actor) ? pile.core : null });
    yield* pause(slice);
    const guideOptions = { segmentClear: guideSegmentClear, objectClear: objectGuides.cameraClear, actorClear: objectGuides.perceptionClear, eyeAt: guideEyeAt, ownerBoundary: objectGuides.ownerBoundaryAt, ownerPerceived: objectGuides.perceived, ownerConcealed: objectGuides.concealed, ownerDistance: objectGuides.distance, ownerInView: objectGuides.inView, ownerClear: objectGuides.ownerClear, getProvider: objectGuides.getProvider };
    sightGuides = BL.sightGuides.create(guideOptions);
    bananaGuides = BL.sightGuides.create(guideOptions);
    sightGuides.reserve(objectGuides.result, null);
    bananaGuides.reserve(objectGuides.result, null);
    headquarters.sightGuides = sightGuides.state;
    headquarters.bananaGuides = bananaGuides.state;
    mark("guides");
    Object.assign(hubScene, {
      root, camera, input,
      debug: {
        setGameMode, delayGameRing, animationInterval,
        get gameMode() { return gameMode; },
        selectDebugGorilla,
        get timechainIsland() { return timechainIsland; },
        get factory() { return factoryMouth && factoryMouth.hall ? factoryMouth.hall.debug : null; },
        get bifrost() { return bifrostIsle; },
        get footsteps() { return footsteps; },
        slots: pile.slots, drops: pile.drops, core: pile.core, shell: pile.shell, delivery: pile.delivery, spillEffect: pile.spillEffect, cavemen: crew.cavemen, crates: crates.list, lab: null, hud, applyAllSwag: crew.applyAllSwag, renderLocker: crew.renderLocker, demoTip, setPileLevel: pile.setLevel, refreshStates: crew.refreshStates, trimPool: fx.trimPool,
        get shown() {
          return pile.shown;
        },
        terrainSections, caveSections, cutawayPaths: CUTAWAY_PATH_STATE, terrainRampRoof, get cutawayTravelRamp() { return cutawayTravelRamp; }, get cutawayTravelChannel() { return cutawayTravelChannel; }, get cutawayTravelStation() { return cutawayTravelStation; }, island, mouths: island.mouths, labels, camera, weather, chain, beasts, pokeBeast, useProp, refreshChainSign, get chainSign() { return chainSign; }, get poolIsland() { return mempoolIsland; }, cameraPose: POSITION_POSE, crew, fx, controls: pilot.controls, props, altar, path: island.path.debug, headquarters, jumbotron, totems: { list: totems, flare: flareTotem }, get npcSync() { return npcSync; }, clankers, clankerPlay, rageThrowMap, rageEdgeGoal, rageLandAt, rageCaptureLandAt, rageMapRouteClear, rageCaptureEligible, rageApproach, rageWarpRequired, rageGrab, rageCaptive, rageRelease, rageThrow, rageDragClear,
        scenery: {
          get candidateCount() { return scenery.length; },
          get visibleCount() { return sceneryVisible; },
          get radiusCulledCount() { return sceneryRadiusCulled; },
          get pathCulledCount() { return sceneryPathCulled; },
          get fixedCulledCount() { return sceneryFixedCulled; },
          get visibilityReflowCount() { return sceneryReflows; },
          get clearanceRadius() { return island.path.debug.ringOuterRadius + SCENERY_CLEARANCE; }
        },
        mirrorCave,
        matrixGate: {
          gates: matrixGates,
          sealed: sealedCaves,
          segmentClear: matrixGateSegmentClear,
          ceilingAt: matrixGateCeilingAt,
        },
        cameraCave: CAMERA_CAVE_DEBUG,
        matrixCave: {
          get clouds() { return clouds; },
          advanceClouds: updateClouds,
          portal: matrixCave.portal,
          contains: inMatrixCave,
          cameraInside: cameraInsideMirror,
          overlayVisible: matrixOverlayVisible,
          viewApproach: viewMatrixApproach,
          viewInside: viewInsideMatrix
        },
        pilot,
        renderOpts: RENDER_OPTS,
        lamps,
        lighting: LIGHTING_DEBUG,
        fireSeats,
        get critters() {
          return critters.stats();
        },
        get daylight() {
          if (!DEBUG) syncDaylightDebug(hour);
          return DAYLIGHT_DEBUG;
        },
        setHour: (h, daylen = NaN, day = clock.dayOfYear) => {
          clock = daylight.createClock({ hour: h, daylen, day, time: timeParam });
        },
        magazine: { state: magazineState, get pickup() { return magazine; }, reveal: revealMagazine, grant: grantMagazine },
        get jetpack() {
          return {
            pickup: null,
            state: null,
            get owned() { return crew.list.length > 0 && crew.list.every(cave => cave.jetpackOwned); },
            get carrier() { return crew.player; },
            get wearer() { return crew.player?.jet ? crew.player : null; },
            grant: (cave = crew.player, wear = false) => cave ? grantJetpack(cave, wear) : false,
            toggle: toggleJetpack,
            dropHost: () => false,
            forceHostWrap: () => false
          };
        }
      }
    });
    pilot.update(0);
    if (ctx.from === null && !signedInArrival && !initialGorilla && !pilot.loginViewRestored) restorePositionDebug();
    if (initialGorilla) {
      const entry = clankers.list.find(entry => entry.owner === initialGorilla);
      if (clankerPlay.possess(entry, true)) {
        const position = positionVector("pos");
        if (position) {
          const p = entry.root.position, dx = position[0] - p.x, dy = position[1] - p.y, dz = position[2] - p.z;
          clankers.respawn(entry, position[0], position[1], position[2]);
          clankerPlay.respawn(dx, dy, dz);
        }
        clankerPlay.update(0);
      }
    }
    if (ctx.from === null && pilot.mode === "first-person") pilot.focusAim();
    if (POSITION_DEBUG) updatePositionDebug(true);
    updatePoolEffectsActivity();
    if (DEBUG_POOL_BLOCK) mempoolIsland.preview.block();
    yield* pause(slice);
    // Tess greets a newcomer once a page and shows them round; nothing she does starts while the island is busy. She
    // greets only a visit that lands on the island's own view, not one sent to a place or walked back out of a cave.
    islandGuide = BL.hubGuide.create({
      parent: root, input, fx, camera, pilot, visitor: () => crew.player, world, hud, coarse: COARSE,
      landing: !ctx.place && !preloadedView && !returningCharacter && ctx.from !== "bifrost",
      quality: () => renderer.quality, busy: () => chalkboard.openNow || clankerPlay.active || factoryDeparting || bifrostDeparting || !!(ghosts && ghosts.busy), // HALLOWEEN: ghosts
      // What her beam sweeps across on the totems' line: their eyes, west to east.
      targets: { totems: totems.map((t) => { const p = t.owner.node.position; return { x: p.x, y: p.y + t.eyeTop, z: p.z }; }).sort((a, b) => a.x - b.x) }
    });
    yield* pause(slice);
    hubScene.debug.tess = islandGuide;
    // Tess wears every tier of her detail in her first frames, so each is on the GPU before she comes close: build
    // them here, a mesh a slice, rather than in her first frame.
    const tessTiers = new Set();
    islandGuide.liveGeometry(tessTiers);
    for (const geometry of tessTiers) { renderer.prepareGeometry(geometry); yield* pause(slice); }
    Object.defineProperty(hubScene.debug, "halloween", { get: () => ghosts ? ghosts.debug : ghostEntry && ghostEntry.debug, enumerable: true }); // HALLOWEEN
    mark("visibility-start");
    fx.warmVisibility(crew);
    fx.warmBlockers();
    mark("visibility");
    mark("covered-view-start");
    yield* prepareCoveredView(ctx.overlay, slice);
    mark("covered-view");
    // Remote hunt callbacks may attach the full game; subscribe only once every construction slice is complete.
    createGhostEntry();
    totemUnsub = BL.totemFeed.subscribe(onTotem);
    hintTimer = window.setTimeout(() => {
      if (!pilot.player && !clankerPlay.active && !matrixControl.promptAction) hud.hint(COARSE ? "Drag to look · pinch to eye level · sticks to fly · tap a cave" : "Drag to look · scroll to eye level · WASD to fly · tap a cave to enter");
    }, 1200);
    if (DEBUG_GORILLA_MOVE) hud.toast("Gorilla movement debug · click a gorilla, then a destination");
  };
  const enter = (ctx) => { const steps = enterSteps(ctx); while (!steps.next().done); };
  // The scene a departure was heading for could not be prepared (its deferred code did not arrive): the visitor stays on
  // the island, driving again, and nothing is photographed for a crossing that did not happen.
  const stay = () => {
    factoryHeld = factoryDeparting;
    entering = factoryDeparting = bifrostDeparting = false;
    factoryWalk.phase = 0; factoryWalk.seen = factoryWalk.through = factoryWalk.grab = false; factoryWalk.still = factoryWalk.hold = 0;
    world.factoryCrossing = world.islandKeep = null;
    if (factoryMouth) factoryMouth.snap = false;
    if (bifrostIsle) bifrostIsle.snap = false;
    pilot.controls.reset(); input.reset(); pilot.setActive(true);
  };
  const leave = (destroy = false) => {
    rememberCharacterLocations();
    stopLazyBedding();
    if (reuseHub && !destroy) return suspendHub();
    heldHub = false; heldDebug = null;
    actorTransition.sourceRoot = actorTransition.sourceHead = null;
    factoryWalk.cave = null;
    resetRageThrowMap(false);
    if (factoryMouth && factoryMouth.snap) snapFactoryView();
    if (bifrostIsle && bifrostIsle.snap) snapBifrostView();
    glCanvas = null;
    poolBlockHovered = poolBlockHoverIgnore = null;
    POOL_BLOCK_HIT.node = POOL_BLOCK_HIT.owner = null;
    selectDebugGorilla(null);
    islandGuide.dispose();
    islandGuide = null;
    // HALLOWEEN: the entry cancels its handoff before the hunt and the crew, fx and targets they use leave.
    if (ghostEntry) { ghostEntry.dispose(); ghostEntry = null; }
    if (ghosts) { ghosts.dispose(); ghosts = null; }
    ghostSeal = null;
    // GAME MODE ends with the visit; the island comes back built afresh.
    gameMode = gameCombatOnly = false;
    for (const node of ringPanels) { node.mirrorRipples.dispose(); if (node.mirrorBody) node.mirrorBody.dispose(); }
    gameRing = null;
    gameRingK = gameRingWait = ringLanterns.length = ringPanels.length = ringPulseWait = 0;
    ringLanternsShown = false;
    document.body.classList.remove("game-mode");
    RENDER_OPTS.windTime = NaN;
    debugMovementTerrain = DEBUG_MOVE_HIT.node = DEBUG_MOVE_HIT.owner = null;
    DEBUG_GORILLA_HIT.node = DEBUG_GORILLA_HIT.owner = null;
    chalkboard.dispose();
    chalkboard = null;
    clearCutawayHidden();
    uiGuideObjects = null; uiGuidesReady = false;
    if (enteringTween) enteringTween.alive = false;
    enteringTween = null;
    window.clearInterval(stateTimer);
    if (unsubscribeActivity) unsubscribeActivity();
    unsubscribeActivity = null;
    if (unsubscribeAccount) unsubscribeAccount();
    unsubscribeAccount = null;
    if (unsubscribeMempool) unsubscribeMempool();
    unsubscribeMempool = null;
    if (unsubscribeChain) unsubscribeChain();
    unsubscribeChain = null;
    timechainIsland.gate.dispose();
    hud.closeBoard(true);
    if (chainSign && chainSign.node.geometry) renderer.releaseGeometry(chainSign.node.geometry);
    chainSign = null;
    weather.dispose();
    footsteps.dispose();
    mempoolIsland.water.dispose();
    mempoolIsland.paintings.dispose();
    mempoolIsland.wildlife.dispose();
    for (const entry of terrainSections) { entry.cap.dispose(); removeChild(entry.cap.node.parent, entry.cap.node); }
    for (const entry of caveSections) { entry.cap.dispose(); removeChild(entry.cap.node.parent, entry.cap.node); }
    terrainSections.length = caveSections.length = 0;
    terrainRampRoof.dispose();
    RENDER_OPTS.cutawayRegionCount = 0;
    RENDER_OPTS.cutawayRegions.length = 0;
    RENDER_OPTS.birdsEyeCutaway = false;
    RENDER_OPTS.cutawayFade = RENDER_OPTS.cutawayCloudMix = RENDER_OPTS.cutawayRockMix = 0;
    cutawayHeight = NaN;
    cutawayProgress = NaN;
    cutawayLevel = cutawayHillMix = 0;
    cutawayFeet = 0;
    cutawayX = cutawayZ = cutawayHeadY = 0;
    cutawayHill = false;
    cutawayPool = 0; poolShade = poolUnder = 0;
    poolEffectsActive = false; poolEffectsTime = 0;
    cutawayPlayer = cutawayHandoffPlayer = null;
    cutawayPathBounds = null;
    cutawayTravelRamp = null; cutawayTravelChannel = -1; cutawayTravelStation = 0;
    CUTAWAY_PATH_STATE.lo.fill(0); CUTAWAY_PATH_STATE.hi.fill(0); CUTAWAY_PATH_STATE.mix.fill(0); CUTAWAY_PATH_STATE.windowMix.fill(0); CUTAWAY_PATH_STATE.active = 0; CUTAWAY_PATH_STATE.version++;
    window.clearTimeout(hintTimer);
    if (positionDebug) {
      positionDebug.removeEventListener("click", copyPositionDebug);
      positionDebug.hidden = true;
      positionDebug.removeAttribute("data-pose");
      positionDebug.removeAttribute("data-copied");
    }
    for (let i = 0; i < clankerCaptures.length; i++) finishClankerRider(clankerCaptures[i].entry, false);
    clankerCaptures.length = 0;
    clankerPlay.dispose();
    remotes.dispose();
    crates.dispose();
    pile.dispose();
    for (const entry of clankers.list) returnLabEquipment(entry);
    clankers.dispose();
    clankerMeshes.dispose();
    clankerMeshes = clankerPartOwners = null;
    for (const item of clankerEquipment) {
      untrackMirrorObject(item.node); solids.remove(item.node); removeChild(root, item.node);
    }
    clankerEquipment.length = 0;
    BL.net.setBody(null);
    zoneHeld = null;
    BL.net.setHub(false);
    npcSync.dispose();
    remotes = npcSync = null;
    crew.dispose();
    critters.dispose();
    fx.dispose();
    cameraCover.dispose();
    bananaCover.dispose();
    solids.dispose();
    if (rockGuides) rockGuides.dispose();
    delete headquarters.rockGuides;
    sightGuides.dispose();
    bananaGuides.dispose();
    objectGuides.dispose();
    pileGuides.dispose();
    platformGuides.dispose();
    mirrorGuides.dispose();
    mirrorCave.ripples.dispose();
    entropyLab.phase.dispose();
    entropyLab = null;
    for (const veil of caveVeils) veil.phase.dispose();
    caveVeils.length = 0;
    if (factoryMouth) {
      if (factoryMouth.hall) factoryMouth.hall.dispose();
      if (factoryMouth.roofWindow) factoryMouth.roofWindow.dispose();
      factoryMouth.phase.dispose();
    }
    if (bcaMouth) bcaMouth.phase.dispose();
    factoryMouth = arcadeMouth = bcaMouth = coilCharge = null;
    if (bifrostIsle) {
      if (bifrostIsle.window) bifrostIsle.window.dispose();
      bifrostIsle.phase.dispose();
      bifrostIsle.heimdall.dispose();
    }
    bifrostIsle = null;
    mirrorCave.body.dispose();
    pilot.dispose();
    if (oogatronUnsub) {
      oogatronUnsub();
      oogatronUnsub = null;
    }
    if (totemUnsub) {
      totemUnsub();
      totemUnsub = null;
    }
    totems.length = 0;
    if (jumbotron) {
      jumbotron.dispose(renderer);
      jumbotron = null;
    }
    for (const node of targets) input.remove(node);
    for (const node of placed) removeChild(root, node);
    targets.length = placed.length = claimed.length = scenery.length = sceneryClaims.length = matrixGates.length = sealedCaves.length = clouds.length = lamps.length = pilePosts.length = fireSeats.length = sleepers.length = labels.length = signDetails.length = spots.length = chillSpots.length = headquartersRimLintels.length = climbMasonry.length = props.length = meadowPalms.length = 0;
    fireHazards.length = 0;
    fireRigs = null;
    firePitRig = null;
    clankerFireReachable = null;
    workZones.length = entranceZones.length = 0;
    closedCaveZones.length = 0;
    RENDER_OPTS.lightCount = lampLights = 0;
    // The next visit's first frame rebuilds the lamp selection and resamples the clock.
    lampSelValid = false;
    sampledDay = 0;
    RENDER_OPTS.cutawayMaxY = 1e6;
    cameraCaveIndex = 0;
    cameraEntranceIndex = 0;
    cameraPreviousValid = false;
    cameraUnrestricted = cameraReentering = false;
    cameraTrailPlayer = null;
    cameraTrailCount = cameraTrailNext = 0;
    cameraTrailSleeping = false;
    cameraManualContact = false;
    cameraTerrainValid = false;
    cameraTerrainRecovering = false;
    cameraTerrainEntranceIndex = 0;
    caveEntryPlayer = null;
    playerCaveIndex = 0;
    CAMERA_OPENINGS.length = 0;
    LIGHTING_DEBUG.registeredLampCount = LIGHTING_DEBUG.activeFullLightCount = LIGHTING_DEBUG.approximatedLightCount = LIGHTING_DEBUG.selectedCount = LIGHTING_DEBUG.approximatedCount = 0;
    CAMERA_RAMP_CELLS.clear();
    for (let i = 0; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = LIGHTING_DEBUG.approximatedIds[i] = null;
    sceneryVisible = sceneryRadiusCulled = sceneryPathCulled = sceneryFixedCulled = sceneryReflows = 0;
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    // Shared query scratch must not keep an actor (and its groundAt closure) alive past this visit.
    CLANKER_REST_SLOPE.supportEntry = RAGE_WARP_MOTION.supportEntry = null;
    sleepSightSince = Infinity; sleepSightMode = null; sleepSightGorilla = false; sleepSightFrame++;
    CLANKER_HIT.node = CLANKER_HIT.owner = null;
    viewPoseActor = grabSupportEntry = clankerSupportActor = clankerPassingEntry = preparingGuideActor = null;
    // Drop every per-visit ref but the cached island.
    terrainRampRoof = pathNode = altar = lawn = life = hud = hooks = input = pilot = fx = cameraCover = bananaCover = solids = rockGuides = objectGuides = sightGuides = bananaGuides = pileGuides = platformGuides = mirrorGuides = pile = crew = crates = critters = clock = presets = mirrorCave = matrixCave = matrixControl = fire = headquarters = positionDebug = dockStairs = overlayCanvas = null;
    beasts.clear();
    magazine = magazineState = weather = footsteps = mempoolIsland = timechainIsland = clankers = clankerPlay = null;
    hubScene.input = hubScene.debug = null;
    island = chalkboardDressing = chalkboardClearance = null;
    guideSegmentClear.boxGrid = POOL_SEAMS[0].boxGrid = POOL_SEAMS[1].boxGrid = null;
    return { targets: count };
  };
  // Every mesh the island draws, for a scene it walks into to keep on the GPU while the visit lasts: only the island's
  // own, so the Factory's kept meshes never ride along from one visit to the next.
  const islandMeshes = () => {
    if (!reuseHub) return null;
    const kept = new Set(), walk = (node) => { if (node.geometry) kept.add(node.geometry); for (const child of node.children) walk(child); };
    walk(root);
    hubScene.islandGeometry(kept);
    if (world.factoryKeep) for (const geometry of world.factoryKeep) kept.delete(geometry);
    return kept;
  };
  const liveGeometry = (set) => {
    // The Lightning Factory's meshes stay on the GPU while the island runs, so walking back in uploads nothing.
    if (world && world.factoryKeep) for (const geometry of world.factoryKeep) set.add(geometry);
    hubScene.islandGeometry(set);
  };
  const islandGeometry = (set) => {
    if (islandGuide) islandGuide.liveGeometry(set);
    if (ghosts) ghosts.liveGeometry(set); // HALLOWEEN
    else if (ghostEntry) ghostEntry.liveGeometry(set); // HALLOWEEN
    mempoolIsland.water.liveGeometry(set);
    pile.liveGeometry(set);
    clankers.liveGeometry(set);
    entropyLab.phase.liveGeometry(set);
    for (const veil of caveVeils) veil.phase.liveGeometry(set);
    if (factoryMouth) factoryMouth.phase.liveGeometry(set);
    if (bcaMouth) bcaMouth.phase.liveGeometry(set);
    if (bifrostIsle) bifrostIsle.phase.liveGeometry(set);
    for (const item of clankerEquipment) set.add(item.node.geometry);
    for (const cave of crew.cavemen.values()) set.add(cave.headOpen).add(cave.headClosed);
    remotes.liveGeometry(set);
    if (timechainIsland && timechainIsland.gate) timechainIsland.gate.liveGeometry(set);
  };
  const cachedGeometry = (set) => {
    if (!heldHub) return;
    const visit = (node) => { if (node.geometry) set.add(node.geometry); for (const child of node.children) visit(child); };
    visit(root); liveGeometry(set);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...crates.stats(), ...crew.stats(), ...pile.stats(), ...critters.stats(), ...mempoolIsland.water.stats(), ...weather.stats(), ...remotes.stats(), ghosts: ghosts ? ghosts.stats().ghosts : 0 /* HALLOWEEN */ };
  };
  const hubScene = {
    // The island reports its own zone as soon as an Ooga is driven (see `zoneOf`); until then it is nowhere.
    voiceZone: "none",
    micKey: true,
    id: "hub", enter, enterSteps, update, overlay, onDonation, previewDonation, onKey, onLootCleared, renderOpts: RENDER_OPTS, stay, leave, stats, liveGeometry, cachedGeometry, islandGeometry,
    get retained() { return heldHub; }, get elapsed() { return now; },
    get retainedRoot() { return heldHub ? root : null; },
    // The Lightning Factory's builders stay warm while the island runs, since its shield walks straight in.
    keeps: ["factory"],
    root: null, camera: null, input: null, debug: null,
    get inMotion() {
      // A crossing through the Timechain Sphere's doors keeps full rate, so its walk and swoop finish smoothly, and so
      // does a walk through the Factory's shield and its dissolve.
      if (timechainIsland && timechainIsland.gate.busy) return true;
      if (factoryWalk.phase || factoryWalk.still > 0) return true;
      if (ghosts && ghosts.inMotion) return true; // HALLOWEEN
      if (pile.inMotion || fx.inMotion || poolEffectsActive && (weather.active || mempoolIsland.water.active) || magazine && magazine.revealed || mirrorCave.ripples.active || mirrorCave.body.active) return true;
      if (!entropyLab.phase.paused && (entropyLab.phase.ripples.active || entropyLab.phase.body.contacts || entropyLab.phase.body.active)) return true;
      for (const veil of caveVeils) {
        const phase = veil.phase;
        if (!phase.paused && (phase.ripples.active || phase.body.contacts || phase.body.active)) return true;
      }
      if (bcaMouth && !bcaMouth.phase.paused && (bcaMouth.phase.ripples.active || bcaMouth.phase.body.contacts || bcaMouth.phase.body.active)) return true;
      for (const sign of headquarters.roomSigns) if (sign.velocity || sign.node.rotation.x) return true;
      return false;
    }
  };
  BL.scenes = BL.scenes || {};
  hubScene.buildSteps = prepareHubSteps;
  BL.scenes.hub = hubScene;
})();
