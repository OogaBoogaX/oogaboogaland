(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, donations, qr, terrain, hubModels, caves, daylight, game: gameMod, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod, crew: crewMod, pile: pileMod, crates: cratesMod, critters: crittersMod } = BL;
  const { lerp, ease, fnv1a, mulberry32 } = math;
  const { createNode, addChild, removeChild, createCamera, addTween, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { EAT_RATE } = crewMod;
  const { DROP_HEIGHT } = pileMod;
  const { CONFETTI } = fxMod;
  const params = new URLSearchParams(location.search);
  const METER_CAPACITY = 60;
  const SEED = 1;
  const DEG = Math.PI / 180;
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const yawParam = parseFloat(params.get("yaw"));
  // Debug clock: a pinned hour and a day length in seconds
  const DEBUG = params.has("debug");
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const daylenParam = DEBUG ? parseFloat(params.get("daylen")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const latitudeParam = DEBUG ? parseFloat(params.get("latitude")) : NaN;
  const islandLatitude = Number.isFinite(latitudeParam) ? Math.max(-66, Math.min(66, latitudeParam)) : daylight.ISLAND_LATITUDE_DEG;
  // Island measures, owned by terrain.js
  const MEADOW = 22, RADIUS = 30;
  const PITCH_MIN = 0.2, PITCH_MAX = 1.25, DIST_MIN = 3.5, DIST_MAX = 64;
  // Air the camera keeps over the rock
  const CLEARANCE = 1.5;
  // Landing view, close over the pile
  const PILE_VIEW = { yaw: Number.isFinite(yawParam) ? yawParam : 0, pitch: 0.62, dist: 24, target: { x: 0, y: 0.6, z: 0 } };
  // Gate view, its target y set at enter
  const GATE_VIEW = { yaw: 0, pitch: 0.32, dist: 18, target: { x: 0, y: 0, z: -(RADIUS - 2) } };
  // A mouth seen from in front, along its axis
  const mouthView = (m) => ({ yaw: m.ry, pitch: 0.3, dist: 18, target: { x: m.x, y: 1.5, z: m.z } });
  // Dolly onto a tapped mouth before the scene changes
  const ENTER_DIST = 10, ENTER_DUR = 0.45;
  // Free flight speeds and bounds
  const FLY = { speed: 6, perDist: 0.5, climb: 6, yMax: 30 }, FLY_BOUND = RADIUS + 14;
  // Third person follow height and distance
  const FOLLOW = { y: 0.9, min: 4, max: 10, pitch: [0.25, 0.8] };
  // Tallest step a caveman may climb
  const STEP_MAX = 0.6;
  // Props the jetpack may hide under
  const JETPACK_HIDERS = ["bush", "rock", "crate", "barrel", "flower"];
  const JETPACK_HOVER = 0.4, JETPACK_REACH = 1.3;
  const JETPACK_APPROACH = [1.8, 1.6, 2];
  const JETPACK_SAFE = { x: 0, z: 0 };
  // Pulse the hiding prop when the hunt stalls
  const HINT_AFTER = 120, HINT_EVERY = 12, HINT_PULSE = 1.6, HINT_MAX = 0.9;
  // Reach at which a caveman is inside a cave
  const TUNNEL_REACH = 2.2;
  const MATRIX_TYPES = 8, MATRIX_TOP = 3.62, MATRIX_RANGE = 3.45, MATRIX_GAP = 0.19, MATRIX_PRELOAD = 18;
  const MATRIX_SURFACE_PITCH = 0.12, MATRIX_SURFACE_GAP = 0.13, MATRIX_GLYPH_HZ = 10;
  const MATRIX_RAIN = 0, MATRIX_FLOOR = 1, MATRIX_CEILING = 2, MATRIX_BACK = 3, MATRIX_LEFT = 4, MATRIX_RIGHT = 5;
  const MATRIX_SURFACES = ["freeRain", "mainFloor", "vestibuleFloor", "mainCeiling", "vestibuleCeiling", "mainLeftWall", "mainRightWall", "vestibuleLeftWall", "vestibuleRightWall", "backWall", "transitionHeader", "doorwayLintel", "transitionReturns", "doorwayJambs", "rimUnderside"];
  const MATRIX_DENSITY = { high: 8, medium: 5, low: 3, canvas2d: 1 };
  const MATRIX_LAYOUT = {
    mainFloor: { plane: "horizontal", flow: "entrance-to-back", y: 0.035, minZ: -6.115, maxZ: -2.485 },
    vestibuleFloor: { plane: "horizontal", flow: "entrance-to-back", y: 0.035, minZ: -2.485, maxZ: 0.43 },
    mainCeiling: { plane: "horizontal", flow: "entrance-to-back", y: 3.735, minZ: -6.115, maxZ: -2.485 },
    vestibuleCeiling: { plane: "horizontal", flow: "entrance-to-back", y: 2.965, minZ: -2.485, maxZ: 0.42 },
    mainLeftWall: { plane: "vertical", flow: "down", x: -2.805, minZ: -6.115, maxZ: -2.485 },
    mainRightWall: { plane: "vertical", flow: "down", x: 2.805, minZ: -6.115, maxZ: -2.485 },
    vestibuleLeftWall: { plane: "vertical", flow: "down", x: -2.455, minZ: -2.485, maxZ: 0.44 },
    vestibuleRightWall: { plane: "vertical", flow: "down", x: 2.455, minZ: -2.485, maxZ: 0.44 },
    backWall: { plane: "vertical", flow: "down", z: -6.115 },
    transitionHeader: { plane: "vertical", flow: "down", z: -2.47, minY: 3.055, maxY: 3.845 },
    doorwayLintel: { plane: "vertical", flow: "down", z: 0.465, minY: 3.055, maxY: 3.845 },
    transitionReturns: { plane: "vertical", flow: "down", z: -2.47 },
    doorwayJambs: { plane: "vertical", flow: "down", z: 0.465 },
    rimUnderside: { plane: "horizontal", flow: "entrance-to-back", y: 2.975, minZ: 0.385, maxZ: 0.42 },
    floor: { plane: "horizontal", flow: "entrance-to-back", maxZ: 0.43 },
    ceiling: { plane: "horizontal", flow: "entrance-to-back" },
    leftWall: { plane: "vertical", flow: "down" },
    rightWall: { plane: "vertical", flow: "down" },
    doorway: { plane: "vertical", flow: "down", z: 0.465, minY: 3.055, portalMaxY: 2.98 }
  };
  const PORTAL_Z = 0.5, PORTAL_MIN_X = -2.48, PORTAL_MAX_X = 2.48, PORTAL_MIN_Y = -0.2, PORTAL_MAX_Y = 2.98;
  // Sky, light and lamps, resampled from the clock every frame
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, celestialPole: { x: 0, y: Math.sin(20 * DEG), z: -Math.cos(20 * DEG) }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", latitude: 20, dayOfYear: 172, continuousDay: 171.5, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0, sunriseHour: 6, sunsetHour: 18,
    time: 0, bloomStrength: 0.5, lights: new Float32Array(64), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 34
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  const DAYLIGHT_DEBUG = {
    sunDirection: RENDER_OPTS.sunDirection, moonDirection: RENDER_OPTS.moon, celestialPole: RENDER_OPTS.celestialPole,
    hour: 12, continuousDay: 171.5, phase: "noon", latitude: 20, dayOfYear: 172, solarDeclination: 0, siderealAngle: 0, sunAltitude: 90, sunAzimuth: 180, moonAltitude: -90, moonAzimuth: 0,
    daylightFactor: 1, twilightFactor: 0, starFactor: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, moonStrength: 0, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002, outdoorDarkestSurfaceEstimate: 0.34, activeLightSource: "sun", sunriseHour: 6, sunsetHour: 18
  };
  const PHASE_TOASTS = { dawn: "Dawn breaks over the island", morning: "Morning on the island", noon: "High noon", dusk: "Dusk settles over the island", night: "Night. The torches are lit.", midnight: "Midnight. The island sleeps." };
  // Lamp colours and reach; a lamp's flame reads through node.glow
  const LAMP = { torch: { r: 1.0, g: 0.62, b: 0.25, radius: 6, glow: 0.85, hide: false }, fire: { r: 1.0, g: 0.55, b: 0.2, radius: 9, glow: 0.9, hide: true }, lantern: { r: 1.0, g: 0.8, b: 0.45, radius: 4, glow: 0.9, hide: false } };
  const LIGHT_CAPACITY = 7;
  const LIGHTING_DEBUG = {
    registeredLampCount: 0, activeFullLightCount: 0, approximatedLightCount: 0,
    configuredLightCapacity: LIGHT_CAPACITY, selectedCount: 0, approximatedCount: 0,
    tier: "high", selectedIds: new Array(LIGHT_CAPACITY).fill(null), approximatedIds: new Array(LIGHT_CAPACITY).fill(null)
  };
  // Lamps light one after another through the dusk ramp
  const LAMP_STAGGER = 0.12, LAMP_RAMP = 0.4, LAMP_OFF = 0.12;
  const CAVE_TORCH_GAP = 0.12;
  const FIRE_DEGREES = [130, 125, 135, 120, 140, 115, 145], FIRE_RADIUS = 11.5, FIRE_SEATS = 6, FIRE_SEAT_RADIUS = 1.8;
  const NIGHT = 0.5, FIRE_SEAT_CHANCE = 0.5;
  // Clock angle to a meadow point
  const polar = (deg, r) => ({ x: Math.sin(deg * DEG) * r, z: -Math.cos(deg * DEG) * r });
  // Clock angles where the crew builds and sleeps
  const BUILD_DEGREES = [12, 40, 66, 80, 102, 165, 195, 212, 282, 297, 312, 340];
  const BUILD_RADIUS = 13;
  const BEDROLL_DEGREES = [100, 195, 252, 300, 345];
  const BEDROLL_RADIUS = 14, BEDROLL_INNER = 10;
  const NUDGES = [0, -2, 2, -4, 4, -6, 6, -8, 8];
  const VINES = ["c9", "c5"];
  const PILE_SCALE = 0.45;
  const SCENERY_CLEARANCE = 0.25;
  const MEADOW_INNER = 5, MEADOW_OUTER = MEADOW - 1.5, CLIFF_INNER = MEADOW + 1.5, CLIFF_OUTER = RADIUS - 1;
  const DOCK_DEG = 105, LADDER_Z = -3.6, LADDER_LEAN = 0.65;
  const CLOUD_COUNT = 30, CLOUD_WRAP = 60, CLOUD_NEAR = 36;
  // Where a strolling caveman may stop
  const WANDER_COUNT = 36, WANDER_INNER = 5.5;
  const ALTAR_HEIGHT = 0.34, ALTAR_BLOCK_WIDTH = 0.2, ALTAR_BLOCK_ARC = 0.3, ALTAR_RING_GAP = 0.02, ALTAR_MAX_BLOCKS = 512;
  // Ripen time and odds for a dropped banana
  const RIPEN = 25, TREE_CHANCE = 0.5, BUSH_CHANCE = 0.25;
  const PROP_TIPS = { tree: "Tree · shake it", bush: "Bush · rustle it", rock: "Rock · solid", crate: "Crate · locked", barrel: "Barrel · empty", flower: "Flowers", torch: "Torch · warm", firepit: "Fire pit", bedroll: "Somebody's bed", ladder: "Ladder · wobbly", dock: "Dock · creaky", jetpack: "Jetpack · walk an Ooga into it", gate: null };
  const BUSH_WORDS = ["Something rustles.", "A beetle. Ooga leaves it.", "Just a bush."];
  const LEAF = models.particleGeometry("#4a8530", 0.12, 0);
  const PETALS = ["#e04a3a", "#f2c94c", "#f3efe4"].map((c) => models.particleGeometry(c, 0.09, 0));
  const CHIP = models.particleGeometry("#6b625a", 0.1, 0);
  const SPARK = models.particleGeometry("#ffb13b", 0.08, 1);
  const DUST = models.particleGeometry("#a3874f", 0.1, 0);
  // Where eaters arrive from away
  const WALK_IN = { x: 0, z: -(MEADOW + 0.5) };
  // Where the thank-you ticker hangs
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

  // One visit's state, made in enter and dropped in leave
  let renderer, game, world, go, lootEnabled, testBananas, root, camera, island, pathNode, altar, hud, hooks, input, pilot, fx, pile, crew, crates, critters, clock, presets, entering, stash, jetpack, mirrorCave, matrixCave, fire;
  let hintAt = HINT_AFTER;
  let stateTimer = 0, hintTimer = 0, meterTimer = 0, pileEdgeNow = 0, now = 0, hour = 12;
  let phase = null;
  const placed = [];
  const targets = [];
  const claimed = [];
  const clouds = [];
  const lamps = [];
  const entranceLights = [];
  const fireSeats = [];
  const sleepers = [];
  const labels = [];
  const spots = [];
  const openMouths = [];
  const props = [];
  const scenery = [];
  const sceneryClaims = [];
  let sceneryVisible = 0, sceneryRadiusCulled = 0, sceneryPathCulled = 0, sceneryFixedCulled = 0, sceneryReflows = 0;
  const addTarget = (node, owner, opts) => {
    input.add(node, owner, opts);
    targets.push(node);
  };
  // Keep a dragged banana on the meadow
  const clampDrag = (p) => {
    const max = island.meadowRadius - 0.5, r = Math.hypot(p.x, p.z);
    if (r > max) {
      p.x *= max / r;
      p.z *= max / r;
    }
    return p;
  };

  // ---------- room behind the mirror ----------
  const buildMatrixRain = (group, room, rimLiner, mirrorNode, m) => {
    const streamCount = renderer.kind === "canvas2d" ? 32 : 96;
    const streamLength = renderer.kind === "canvas2d" ? 9 : 14;
    const entries = [], streams = [];
    const rand = mulberry32(0x0b00ba);
    const cycle = MATRIX_RANGE + (streamLength - 1) * MATRIX_GAP;
    const addStream = (x, z, angle) => {
      const stream = streams.length;
      streams.push({ speed: 0.72 + rand() * 1.05, phase: rand() * cycle, brightness: 0.62 + rand() * 0.32, trainLength: streamLength, gapLength: Math.max(2, Math.round(MATRIX_RANGE / MATRIX_GAP) - streamLength), direction: -1, flowMin: 0.13, flowMax: MATRIX_TOP, flowRange: cycle });
      for (let character = 0; character < streamLength; character++) {
        const tip = character === 0 ? 1 : character === 1 ? 0.55 : 0;
        entries.push({ kind: MATRIX_RAIN, surface: 0, stream, rank: 0, x, y: 0, z, angle, character, tip, start: 0, range: cycle });
      }
    };
    const freeCount = renderer.kind === "canvas2d" ? 18 : 48;
    const entranceCount = renderer.kind === "canvas2d" ? 12 : 32;
    const backCount = renderer.kind === "canvas2d" ? 8 : 24;
    const sideCount = (streamCount - freeCount - backCount) / 2;
    for (let i = 0; i < freeCount; i++) {
      const z = i < entranceCount ? -2.25 + rand() * 1.55 : -5.75 + rand() * 3.2;
      addStream(-2.5 + rand() * 5, z, (rand() - 0.5) * 0.18);
    }
    for (let i = 0; i < backCount; i++) addStream(-2.55 + (i + 0.5) / backCount * 5.1, -6.1, 0);
    for (let i = 0; i < sideCount; i++) {
      const z = -5.75 + (i + 0.5) / sideCount * 5.25;
      const x = z > -2.5 ? 2.38 : 2.79;
      addStream(-x, z, Math.PI / 2);
      addStream(x, z, -Math.PI / 2);
    }

    const surfaceCounts = new Int32Array(MATRIX_SURFACES.length);
    surfaceCounts[0] = entries.length;
    const surfaceStreams = new Int32Array(MATRIX_SURFACES.length);
    const surfaceEdgeMargins = new Float32Array(MATRIX_SURFACES.length);
    const surfaceRepresentativeStreams = new Int32Array(MATRIX_SURFACES.length);
    const surfaceDirections = new Int8Array(MATRIX_SURFACES.length);
    const surfaceFacings = new Int8Array(MATRIX_SURFACES.length);
    const surfaceMinLocalZ = new Float32Array(MATRIX_SURFACES.length);
    const surfaceMaxLocalZ = new Float32Array(MATRIX_SURFACES.length);
    const surfaceHeadPositions = new Float32Array(MATRIX_SURFACES.length);
    const surfaceGapPositions = new Float32Array(MATRIX_SURFACES.length);
    let glyphMinX = Infinity, glyphMaxX = -Infinity, glyphMinY = Infinity, glyphMaxY = -Infinity, glyphHalfZ = 0;
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const verts = hubModels.matrixGlyph(glyph).verts;
      for (let i = 0; i < verts.length; i += 3) {
        glyphMinX = Math.min(glyphMinX, verts[i]);
        glyphMaxX = Math.max(glyphMaxX, verts[i]);
        glyphMinY = Math.min(glyphMinY, verts[i + 1]);
        glyphMaxY = Math.max(glyphMaxY, verts[i + 1]);
        glyphHalfZ = Math.max(glyphHalfZ, Math.abs(verts[i + 2]));
      }
    }
    surfaceRepresentativeStreams.fill(-1);
    surfaceDirections.fill(-1);
    surfaceMinLocalZ.fill(Infinity);
    surfaceMaxLocalZ.fill(-Infinity);
    surfaceStreams[0] = streamCount;
    const addSurface = (surface, kind, crossMin, crossMax, flowMin, flowMax, fixed, facing = 1) => {
      const streamTotal = Math.max(1, Math.floor((crossMax - crossMin) / MATRIX_SURFACE_PITCH) + 1);
      const characters = Math.max(2, Math.floor((flowMax - flowMin) / MATRIX_SURFACE_GAP) + 1);
      const flowRange = flowMax - flowMin + MATRIX_SURFACE_GAP;
      surfaceStreams[surface] += streamTotal;
      if (surfaceFacings[surface] && surfaceFacings[surface] !== facing) throw new Error("Matrix surface facing mismatch");
      surfaceFacings[surface] = facing;
      let minLocalZ, maxLocalZ;
      if (kind === MATRIX_FLOOR) {
        minLocalZ = flowMin - glyphMaxY;
        maxLocalZ = flowMax - glyphMinY;
      } else if (kind === MATRIX_CEILING) {
        minLocalZ = flowMin + glyphMinY;
        maxLocalZ = flowMax + glyphMaxY;
      } else if (kind === MATRIX_BACK) {
        minLocalZ = fixed - glyphHalfZ;
        maxLocalZ = fixed + glyphHalfZ;
      } else {
        minLocalZ = crossMin - Math.max(Math.abs(glyphMinX), Math.abs(glyphMaxX));
        maxLocalZ = crossMax + Math.max(Math.abs(glyphMinX), Math.abs(glyphMaxX));
      }
      surfaceMinLocalZ[surface] = Math.min(surfaceMinLocalZ[surface], minLocalZ);
      surfaceMaxLocalZ[surface] = Math.max(surfaceMaxLocalZ[surface], maxLocalZ);
      const crossStep = streamTotal > 1 ? (crossMax - crossMin) / (streamTotal - 1) : 0;
      const flowStep = characters > 1 ? (flowMax - flowMin) / (characters - 1) : 0;
      surfaceEdgeMargins[surface] = Math.max(surfaceEdgeMargins[surface], Math.abs(crossMax - (crossMin + crossStep * (streamTotal - 1))), Math.abs(flowMax - (flowMin + flowStep * (characters - 1))));
      for (let localStream = 0; localStream < streamTotal; localStream++) {
        const cross = streamTotal === 1 ? (crossMin + crossMax) * 0.5 : crossMin + localStream / (streamTotal - 1) * (crossMax - crossMin);
        const stream = streams.length;
        const wantedTrain = 7 + Math.floor(rand() * 6), wantedGap = 2 + Math.floor(rand() * 5);
        const trainLength = Math.max(1, Math.min(wantedTrain, characters - 1)), gapLength = Math.max(1, Math.min(wantedGap, characters - trainLength));
        streams.push({ speed: 0.28 + rand() * 0.32, phase: rand() * flowRange, brightness: 0.58 + rand() * 0.36, trainLength, gapLength, direction: -1, flowMin, flowMax, flowRange });
        if (surfaceRepresentativeStreams[surface] < 0) surfaceRepresentativeStreams[surface] = stream;
        const rank = localStream & 7;
        for (let character = 0; character < characters; character++) {
          const entry = { kind, surface, stream, rank, x: 0, y: 0, z: 0, angle: 0, character, tip: 0, facing, start: flowMin, range: flowRange };
          if (kind === MATRIX_FLOOR || kind === MATRIX_CEILING) {
            entry.x = cross;
            entry.y = fixed;
          } else if (kind === MATRIX_BACK) {
            entry.x = cross;
            entry.z = fixed;
          } else {
            entry.x = fixed;
            entry.z = cross;
          }
          entries.push(entry);
          surfaceCounts[surface]++;
        }
      }
    };
    // Each registry section is anchored to the black panel it covers. Glyph centers stop
    // far enough behind the portal that their voxel extents cannot cross its plane.
    addSurface(1, MATRIX_FLOOR, -2.78, 2.78, -6.115, -2.485, 0.035);
    addSurface(2, MATRIX_FLOOR, -2.43, 2.43, -2.485, 0.43, 0.035);
    addSurface(3, MATRIX_CEILING, -2.78, 2.78, -6.115, -2.485, 3.735);
    addSurface(4, MATRIX_CEILING, -2.43, 2.43, -2.485, 0.42, 2.965);
    addSurface(5, MATRIX_LEFT, -6.115, -2.485, 0.075, 3.695, -2.805);
    addSurface(6, MATRIX_RIGHT, -6.115, -2.485, 0.075, 3.695, 2.805);
    addSurface(7, MATRIX_LEFT, -2.485, 0.44, 0.075, 2.925, -2.455);
    addSurface(8, MATRIX_RIGHT, -2.485, 0.44, 0.075, 2.925, 2.455);
    addSurface(9, MATRIX_BACK, -2.78, 2.78, 0.075, 3.695, -6.115);
    addSurface(10, MATRIX_BACK, -2.86, 2.86, 3.055, 3.845, -2.47, -1);
    addSurface(11, MATRIX_BACK, -2.86, 2.86, 3.055, 3.845, 0.465, -1);
    addSurface(12, MATRIX_BACK, -2.86, -2.52, 0.075, 2.925, -2.47, -1);
    addSurface(12, MATRIX_BACK, 2.52, 2.86, 0.075, 2.925, -2.47, -1);
    addSurface(13, MATRIX_BACK, -2.86, -2.52, 0.075, 2.925, 0.465, -1);
    addSurface(13, MATRIX_BACK, 2.52, 2.86, 0.075, 2.925, 0.465, -1);
    addSurface(14, MATRIX_CEILING, -2.43, 2.43, 0.385, 0.42, 2.975);
    // Mix spatial neighbours before forming balanced eight-glyph blocks. Each block
    // mutates on its own phase while retaining exactly one instance of every glyph.
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1)), swap = entries[i];
      entries[i] = entries[j];
      entries[j] = swap;
    }
    let registryHash = 2166136261;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const stream = streams[entry.stream];
      registryHash = Math.imul(registryHash ^ entry.kind ^ (entry.surface << 4) ^ (entry.rank << 8), 16777619) >>> 0;
      registryHash = Math.imul(registryHash ^ Math.round((entry.x + entry.y + entry.z) * 1000), 16777619) >>> 0;
      registryHash = Math.imul(registryHash ^ Math.round(stream.brightness * 1000) ^ (stream.trainLength << 12) ^ (stream.gapLength << 20), 16777619) >>> 0;
    }

    const nodes = [], cr = Math.cos(m.ry), sr = Math.sin(m.ry);
    const perGlyphCapacity = Math.ceil(entries.length / MATRIX_TYPES);
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const node = createNode({ geometry: hubModels.matrixGlyph(glyph), instanceData: new Float32Array(perGlyphCapacity * 20), instanceCount: 0, instanceVersion: 0 });
      node.fixedInstanceCapacity = true;
      node.drawInstanceCount = 0;
      addChild(root, node);
      placed.push(node);
      nodes.push(node);
    }
    const portal = {
      inside: false, previousValid: false, previousX: 0, previousY: 0, previousZ: 0,
      lastCrossingDirection: "none",
      plane: { center: { x: m.x + sr * PORTAL_Z, y: m.floorY + 1.5, z: m.z + cr * PORTAL_Z }, normal: { x: sr, y: 0, z: cr } },
      opening: { minX: PORTAL_MIN_X, maxX: PORTAL_MAX_X, minY: PORTAL_MIN_Y, maxY: PORTAL_MAX_Y, planeZ: PORTAL_Z },
      rejected: { above: 0, below: 0, beside: 0 }
    };
    const bufferBytes = perGlyphCapacity * MATRIX_TYPES * 20 * Float32Array.BYTES_PER_ELEMENT;
    let minBrightness = Infinity, maxBrightness = -Infinity, minTrainLength = Infinity, maxTrainLength = 0, minGapLength = Infinity, maxGapLength = 0;
    for (let i = 0; i < streams.length; i++) {
      const stream = streams[i];
      minBrightness = Math.min(minBrightness, stream.brightness);
      maxBrightness = Math.max(maxBrightness, stream.brightness);
      minTrainLength = Math.min(minTrainLength, stream.trainLength);
      maxTrainLength = Math.max(maxTrainLength, stream.trainLength);
      minGapLength = Math.min(minGapLength, stream.gapLength);
      maxGapLength = Math.max(maxGapLength, stream.gapLength);
    }
    let maxLocalZ = -Infinity;
    for (let surface = 1; surface < MATRIX_SURFACES.length; surface++) maxLocalZ = Math.max(maxLocalZ, surfaceMaxLocalZ[surface]);
    return {
      group, room, rimLiner, mirrorNode, mouth: m, nodes, entries, streams, cr, sr, cycle, portal,
      streamCount, hangingStreamCount: freeCount, entranceStreamCount: entranceCount, wallStreamCount: streamCount - freeCount, streamLength,
      rainGlyphCount: streamCount * streamLength, surfaceCounts, surfaceStreams, surfaceEdgeMargins, surfaceRepresentativeStreams, surfaceDirections, surfaceFacings, surfaceMinLocalZ, surfaceMaxLocalZ, surfaceHeadPositions, surfaceGapPositions, surfaceActiveCounts: new Int32Array(MATRIX_SURFACES.length),
      glyphCount: entries.length, activeGlyphCount: 0, brightTipCount: 0, capacity: perGlyphCapacity * MATRIX_TYPES,
      perGlyphCapacity, bufferBytes, registryBytes: entries.length * 64 + streams.length * 40, registryHash: registryHash.toString(16).padStart(8, "0"), quality: renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality,
      densityRankLimit: renderer.kind === "canvas2d" ? MATRIX_DENSITY.canvas2d : MATRIX_DENSITY[renderer.quality],
      glyphVersion: -1, previousGlyphVersion: -1, mutationHash: 0, updates: 0, prewarmCount: 0,
      allocationCount: MATRIX_TYPES, rebuildCount: 1, preloaded: false, prewarmed: false, visible: false, drawEnabled: false, drawnGlyphCount: 0, firstGlyphY: 0,
      minBrightness, maxBrightness, minTrainLength, maxTrainLength, minGapLength, maxGapLength,
      maxLocalZ, portalClearance: PORTAL_Z - maxLocalZ, movingGapCount: 0, representativeHeadPhase: 0
    };
  };
  const updateMatrixPortal = (x, y, z) => {
    const portal = matrixCave.portal;
    if (portal.previousValid) {
      const from = portal.previousZ - PORTAL_Z, to = z - PORTAL_Z;
      const inward = from > 0 && to <= 0;
      const outward = from < 0 && to >= 0;
      if (inward || outward) {
        const t = from / (from - to);
        const crossX = portal.previousX + (x - portal.previousX) * t;
        const crossY = portal.previousY + (y - portal.previousY) * t;
        if (crossY > PORTAL_MAX_Y) portal.rejected.above = Math.min(0x7fffffff, portal.rejected.above + 1);
        else if (crossY < PORTAL_MIN_Y) portal.rejected.below = Math.min(0x7fffffff, portal.rejected.below + 1);
        else if (crossX < PORTAL_MIN_X || crossX > PORTAL_MAX_X) portal.rejected.beside = Math.min(0x7fffffff, portal.rejected.beside + 1);
        else {
          portal.inside = inward;
          portal.lastCrossingDirection = inward ? "in" : "out";
          matrixCave.mirrorNode.mirrorPortal = portal.inside;
        }
      }
    }
    portal.previousX = x;
    portal.previousY = y;
    portal.previousZ = z;
    portal.previousValid = true;
  };
  const matrixModulo = (value, range) => value - Math.floor(value / range) * range;
  const writeMatrixGlyph = (data, offset, entry, x, y, z, scale, cr, sr, m, glow, tip) => {
    let ax = 1, ay = 0, az = 0, bx = 0, by = 1, bz = 0, cx = 0, cy = 0, cz = 1;
    if (entry.kind === MATRIX_RAIN) {
      const c = Math.cos(entry.angle), s = Math.sin(entry.angle);
      ax = c; az = -s; cx = s; cz = c;
    } else if (entry.kind === MATRIX_FLOOR) {
      bx = 0; by = 0; bz = -1; cx = 0; cy = 1; cz = 0;
    } else if (entry.kind === MATRIX_CEILING) {
      bx = 0; by = 0; bz = 1; cx = 0; cy = -1; cz = 0;
    } else if (entry.kind === MATRIX_LEFT) {
      ax = 0; az = -1; cx = 1; cz = 0;
    } else if (entry.kind === MATRIX_RIGHT) {
      ax = 0; az = 1; cx = -1; cz = 0;
    }
    data[offset] = (cr * ax + sr * az) * scale;
    data[offset + 1] = ay * scale;
    data[offset + 2] = (-sr * ax + cr * az) * scale;
    data[offset + 3] = 0;
    data[offset + 4] = (cr * bx + sr * bz) * scale;
    data[offset + 5] = by * scale;
    data[offset + 6] = (-sr * bx + cr * bz) * scale;
    data[offset + 7] = 0;
    data[offset + 8] = (cr * cx + sr * cz) * scale;
    data[offset + 9] = cy * scale;
    data[offset + 10] = (-sr * cx + cr * cz) * scale;
    data[offset + 11] = 0;
    data[offset + 12] = m.x + cr * x + sr * z;
    data[offset + 13] = m.floorY + y;
    data[offset + 14] = m.z - sr * x + cr * z;
    data[offset + 15] = 1;
    data[offset + 16] = glow;
    data[offset + 17] = 0;
    data[offset + 18] = tip;
    data[offset + 19] = entry.facing || 0;
  };
  const updateMatrixRain = (elapsed) => {
    if (!matrixCave) return;
    const m = matrixCave.mouth, dx = camera.position.x - m.x, dz = camera.position.z - m.z;
    const localX = matrixCave.cr * dx - matrixCave.sr * dz;
    const localZ = matrixCave.sr * dx + matrixCave.cr * dz;
    updateMatrixPortal(localX, camera.position.y - m.floorY, localZ);
    const distance = Math.hypot(dx, dz);
    const preloaded = distance < MATRIX_PRELOAD || matrixCave.portal.inside;
    const visible = matrixCave.portal.inside;
    const wasPreloaded = matrixCave.preloaded;
    if (preloaded !== matrixCave.preloaded) {
      matrixCave.preloaded = preloaded;
      const scale = preloaded ? 1 : 0;
      setVec(matrixCave.room.scale, scale, scale, scale);
    }
    matrixCave.visible = visible;
    matrixCave.drawEnabled = visible;
    matrixCave.rimLiner.visible = visible;
    if (!preloaded && !wasPreloaded) {
      matrixCave.drawnGlyphCount = 0;
      for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) matrixCave.nodes[glyph].drawInstanceCount = 0;
      return;
    }
    const cr = matrixCave.cr, sr = matrixCave.sr;
    const quality = renderer.kind === "canvas2d" ? "canvas2d" : renderer.quality;
    const densityRankLimit = MATRIX_DENSITY[quality] || MATRIX_DENSITY.high;
    const glyphVersion = Math.floor(elapsed * MATRIX_GLYPH_HZ);
    const counts = matrixCave.surfaceActiveCounts;
    counts.fill(0);
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) matrixCave.nodes[glyph].instanceCount = 0;
    let active = 0, bright = 0, movingGaps = 0, first = true, mutationHash = 2166136261;
    for (let i = 0; i < matrixCave.entries.length; i++) {
      const entry = matrixCave.entries[i];
      if (entry.surface !== 0 && entry.rank >= densityRankLimit) continue;
      const stream = matrixCave.streams[entry.stream];
      let x = entry.x, y = entry.y, z = entry.z, shown = preloaded;
      let tip = entry.tip, glow = stream.brightness;
      if (entry.kind === MATRIX_RAIN) {
        y = MATRIX_TOP - matrixModulo(elapsed * stream.speed + stream.phase, matrixCave.cycle) + entry.character * MATRIX_GAP;
        shown = shown && y >= 0.13 && y <= MATRIX_TOP;
        glow *= 0.48 + (1 - entry.character / stream.trainLength) * 0.52;
      } else {
        const sequence = stream.trainLength + stream.gapLength;
        const trainPosition = entry.character % sequence;
        const travel = elapsed * stream.speed + stream.phase;
        const flow = stream.direction < 0
          ? stream.flowMax - matrixModulo(travel - entry.character * MATRIX_SURFACE_GAP, stream.flowRange)
          : stream.flowMin + matrixModulo(travel - entry.character * MATRIX_SURFACE_GAP, stream.flowRange);
        if (trainPosition >= stream.trainLength) movingGaps++;
        shown = shown && trainPosition < stream.trainLength;
        if (shown) {
          const trail = 1 - trainPosition / stream.trainLength;
          tip = trainPosition === 0 ? 1 : trainPosition === 1 ? 0.55 : 0;
          glow *= 0.48 + trail * 0.52;
        }
        if (entry.kind === MATRIX_FLOOR || entry.kind === MATRIX_CEILING) z = flow;
        else y = flow;
      }
      if (!shown) continue;
      const block = i >> 3;
      const phasedVersion = Math.floor(elapsed * MATRIX_GLYPH_HZ + ((block * 13) & 15) / 16);
      const glyph = ((i & 7) + phasedVersion + ((block * 5) & 7)) & 7;
      const node = matrixCave.nodes[glyph], slot = node.instanceCount++;
      if (slot >= matrixCave.perGlyphCapacity) throw new Error("Matrix glyph instance capacity exceeded");
      writeMatrixGlyph(node.instanceData, slot * 20, entry, x, y, z, 1, cr, sr, m, glow, tip);
      mutationHash = Math.imul(mutationHash ^ glyph ^ Math.imul(i + 1, 16777619), 16777619) >>> 0;
      counts[entry.surface]++;
      active++;
      if (tip > 0) bright++;
      if (first && entry.kind === MATRIX_RAIN) {
        matrixCave.firstGlyphY = m.floorY + y;
        first = false;
      }
    }
    for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) {
      const node = matrixCave.nodes[glyph];
      node.drawInstanceCount = visible ? node.instanceCount : 0;
      node.instanceVersion++;
    }
    matrixCave.previousGlyphVersion = matrixCave.glyphVersion;
    matrixCave.glyphVersion = glyphVersion;
    matrixCave.mutationHash = mutationHash;
    matrixCave.quality = quality;
    matrixCave.densityRankLimit = densityRankLimit;
    matrixCave.activeGlyphCount = active;
    matrixCave.brightTipCount = bright;
    matrixCave.movingGapCount = preloaded ? movingGaps : 0;
    matrixCave.drawnGlyphCount = visible ? active : 0;
    for (let surface = 1; surface < MATRIX_SURFACES.length; surface++) {
      const streamIndex = matrixCave.surfaceRepresentativeStreams[surface];
      if (streamIndex < 0) continue;
      const stream = matrixCave.streams[streamIndex];
      const travel = elapsed * stream.speed + stream.phase;
      matrixCave.surfaceHeadPositions[surface] = stream.direction < 0
        ? stream.flowMax - matrixModulo(travel, stream.flowRange)
        : stream.flowMin + matrixModulo(travel, stream.flowRange);
      matrixCave.surfaceGapPositions[surface] = stream.direction < 0
        ? stream.flowMax - matrixModulo(travel - stream.trainLength * MATRIX_SURFACE_GAP, stream.flowRange)
        : stream.flowMin + matrixModulo(travel - stream.trainLength * MATRIX_SURFACE_GAP, stream.flowRange);
      if (surface === 1) matrixCave.representativeHeadPhase = matrixModulo(travel, stream.flowRange);
    }
    if (preloaded) {
      matrixCave.updates++;
      if (!matrixCave.prewarmed) matrixCave.prewarmCount++;
      matrixCave.prewarmed = true;
    }
  };
  const inMatrixCave = () => {
    return !!matrixCave && matrixCave.portal.inside;
  };
  const matrixOverlayVisible = (x, y, z) => {
    if (!matrixCave || !matrixCave.visible) return true;
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
    return Math.abs(ix) <= 2.48 && iy >= -0.2 && iy <= 2.98;
  };
  const viewInsideMatrix = (lookOut = false) => {
    const m = matrixCave.mouth, targetZ = lookOut ? 0.45 : -5.45;
    const target = { x: m.x + matrixCave.sr * targetZ, y: m.floorY + 1.75, z: m.z + matrixCave.cr * targetZ };
    const orbit = pilot.orbit, yaw = m.ry + (lookOut ? Math.PI : 0);
    if (!matrixCave.portal.inside) {
      matrixCave.portal.previousX = 0;
      matrixCave.portal.previousY = 1.75;
      matrixCave.portal.previousZ = PORTAL_Z + 0.01;
      matrixCave.portal.previousValid = true;
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

  // ---------- island ----------
  // A prop with a kind answers taps and Space
  const addProp = (kind, node, x, z, radius) => {
    const owner = { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: radius, active: true };
    addTarget(node, owner, { radius });
    props.push(owner);
    return owner;
  };
  const place = (geometry, x, z, ry = 0, y = island.heightAt(x, z), kind = null, radius = 0) => {
    const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 }, geometry });
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
    for (const c of claimed) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
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
  const spotAt = (deg, r, margin) => {
    for (const off of NUDGES) {
      const p = polar(deg + off, r);
      if (!nearPath(p.x, p.z, margin) && island.surfaceAt(p.x, p.z) === 0) return p;
    }
    return polar(deg, r);
  };
  // A flame that lights with the night; lit lamps also feed the point lights
  const addLamp = (node, kind, x, y, z, light = true, order = lamps.length, id = `lamp:${lamps.length}`) => {
    node.glow = LAMP_OFF;
    node.flare = 0;
    const lamp = { node, kind, x, y, z, light, order, id, k: 0, lit: false, selected: false, approximated: false, debug: null };
    lamps.push(lamp);
    return lamp;
  };
  // Light the lamps in order as the dusk ramp climbs, spark when one catches
  const updateLamps = (dt, elapsed, spark) => {
    const lights = RENDER_OPTS.lights;
    const webgl = renderer.kind === "webgl2";
    const limit = webgl ? LIGHT_CAPACITY : 0;
    let count = 0, approximated = 0;
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i], node = l.node;
      const k = Math.min(1, Math.max(0, (RENDER_OPTS.torch - l.order * LAMP_STAGGER) / LAMP_RAMP));
      const lit = k > 0.05;
      if (lit && !l.lit && spark) fx.burst(l.x, l.y, l.z, 5, [SPARK], 1.3);
      l.lit = lit;
      l.k = k;
      const flicker = Math.sin(elapsed * 11 + i * 2.3) * 0.15;
      node.glow = LAMP_OFF + k * (l.kind.glow + flicker) + node.flare * 1.5;
      if (node.flare > 0) node.flare = Math.max(0, node.flare - dt * 2);
      // A cold fire shows no flame at all
      if (l.kind.hide) node.visible = lit;
      l.selected = false;
      l.approximated = false;
      if (l.debug) {
        l.debug.factor = k;
        l.debug.lit = lit;
        l.debug.selected = false;
        l.debug.approximated = false;
      }
    }
    // Registration order is spatially stable: camera movement never swaps lamp profiles.
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      if (!l.lit || !l.light) continue;
      if (count < limit) {
        l.selected = true;
        if (l.debug) l.debug.selected = true;
        LIGHTING_DEBUG.selectedIds[count] = l.id;
        const o = count++ * 8;
        lights[o] = l.x;
        lights[o + 1] = l.y;
        lights[o + 2] = l.z;
        lights[o + 3] = l.kind.radius;
        lights[o + 4] = l.kind.r * l.k;
        lights[o + 5] = l.kind.g * l.k;
        lights[o + 6] = l.kind.b * l.k;
      } else {
        l.approximated = true;
        if (l.debug) l.debug.approximated = true;
        LIGHTING_DEBUG.approximatedIds[approximated++] = l.id;
      }
    }
    for (let i = count; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = null;
    for (let i = approximated; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.approximatedIds[i] = null;
    RENDER_OPTS.lightCount = count;
    LIGHTING_DEBUG.registeredLampCount = lamps.length;
    LIGHTING_DEBUG.activeFullLightCount = count;
    LIGHTING_DEBUG.approximatedLightCount = approximated;
    LIGHTING_DEBUG.configuredLightCapacity = limit;
    LIGHTING_DEBUG.selectedCount = count;
    LIGHTING_DEBUG.approximatedCount = approximated;
    LIGHTING_DEBUG.tier = webgl ? renderer.quality : "canvas2d";
  };
  // A fire pit off the paths inside the bedroll ring, with seats around it
  const buildFire = () => {
    let p = null;
    for (const deg of FIRE_DEGREES) {
      const c = polar(deg, FIRE_RADIUS);
      if (island.heightAt(c.x, c.z) === 0 && free(c.x, c.z, 1.6) && !nearPath(c.x, c.z, 1.8)) {
        p = c;
        break;
      }
    }
    if (!p) throw new Error("No clear spot for the fire pit");
    const pit = place(hubModels.firepit(), p.x, p.z, 0, 0, "firepit", 1.2);
    const flame = createNode({ geometry: hubModels.fireFlame() });
    addChild(pit, flame);
    addLamp(flame, LAMP.fire, p.x, 0.6, p.z, true, 3, "firepit");
    claim(p.x, p.z, 1.4);
    for (let i = 0; i < FIRE_SEATS; i++) {
      const a = (i + 0.5) / FIRE_SEATS * Math.PI * 2;
      const x = p.x + Math.cos(a) * FIRE_SEAT_RADIUS, z = p.z + Math.sin(a) * FIRE_SEAT_RADIUS;
      fireSeats.push({ x, z, ry: Math.atan2(p.x - x, p.z - z) });
    }
    return p;
  };
  // Build a mouth from its slot status, +z leading out
  const buildMouth = (slot, m) => {
    const ax = Math.sin(m.ry), az = Math.cos(m.ry);
    const group = createNode({ position: { x: m.x, y: m.floorY, z: m.z }, rotation: { x: 0, y: m.ry, z: 0 } });
    const rim = createNode({ position: { x: 0, y: 0, z: 0.5 }, geometry: hubModels.caveMouthRim() });
    addChild(group, rim);
    if (slot.status === "open") {
      for (const x of [-1.3, 1.3]) addChild(group, createNode({ position: { x, y: 0, z: -3.5 }, geometry: hubModels.caveShelves() }));
    } else if (slot.status === "mirror") {
      // Sit inside the rim so the cave floor ends behind the reflection.
      const node = createNode({ position: { x: 0, y: 1.5, z: 0.5 }, geometry: hubModels.mirrorPanel(), mirror: true, mirrorWalkThrough: true });
      const room = createNode({ geometry: hubModels.matrixChamber(), scale: { x: 0, y: 0, z: 0 } });
      const rimLiner = createNode({ geometry: hubModels.matrixRimLiner(), visible: false });
      addChild(room, rimLiner);
      addChild(group, room, node);
      matrixCave = buildMatrixRain(group, room, rimLiner, node, m);
      mirrorCave = { slot, mouth: m, group, rim, room, rimLiner, node, sign: null };
    } else if (slot.status === "sleeping") {
      // Bedrolls lie along +x, as the sleep pose assumes
      addChild(group, createNode({ position: { x: 0, y: 0.05, z: -4.5 }, rotation: { x: 0, y: -m.ry, z: 0 }, geometry: hubModels.bedroll(), depthBias: 0.3 }));
      sleepers.push({ x: m.x + ax * 0.8, y: 4.4, z: m.z + az * 0.8, timer: sleepers.length * 0.7 });
    }
    if (slot.status === "open" || slot.status === "mirror") {
      const torchGeometry = hubModels.torch();
      const torchZ = rim.position.z + rim.geometry.frontZ - torchGeometry.backZ + CAVE_TORCH_GAP;
      for (let i = 0; i < 2; i++) {
        const side = i ? "right" : "left", localX = (i ? 1 : -1) * rim.geometry.jambCenterX;
        const torch = createNode({ position: { x: localX, y: 0, z: torchZ }, geometry: torchGeometry, flare: 0 });
        addChild(group, torch);
        const tx = m.x + ax * torchZ + Math.cos(m.ry) * localX;
        const ty = m.floorY + torchGeometry.flameY;
        const tz = m.z + az * torchZ - Math.sin(m.ry) * localX;
        const id = `${slot.id}:torch:${side}`;
        const lamp = addLamp(torch, LAMP.torch, tx, ty, tz, true, i, id);
        const debug = { id, caveId: slot.id, kind: "torch", side, localPosition: [localX, torchGeometry.flameY, torchZ], worldPosition: [tx, ty, tz], registered: true, factor: 0, lit: false, selected: false, approximated: false, rimFront: rim.position.z + rim.geometry.frontZ, fixtureBack: torchZ + torchGeometry.backZ, gap: CAVE_TORCH_GAP };
        lamp.debug = debug;
        entranceLights.push(debug);
        claim(tx, tz, 0.5);
        addProp("torch", torch, tx, tz, 0.7);
      }
      const sign = createNode({ position: { x: 0, y: 4.5, z: 0.52 }, geometry: hubModels.caveSign(slot.name) });
      addChild(group, sign);
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
      // A lantern hangs off the sign bracket and matches the entrance torches' dusk fade.
      const lantern = createNode({ position: { x: halfW + 0.1, y: sign.position.y + halfH + 0.14, z: 0.52 }, geometry: hubModels.lantern() });
      addChild(group, lantern);
      const lx = lantern.position.x, ly = lantern.position.y - 0.27, lz = lantern.position.z;
      const wx = m.x + Math.cos(m.ry) * lx + ax * lz;
      const wy = m.floorY + ly;
      const wz = m.z - Math.sin(m.ry) * lx + az * lz;
      const id = `${slot.id}:lantern:right`;
      const lamp = addLamp(lantern, LAMP.lantern, wx, wy, wz, true, 2, id);
      const debug = { id, caveId: slot.id, kind: "lantern", side: "right", localPosition: [lx, ly, lz], worldPosition: [wx, wy, wz], registered: true, factor: 0, lit: false, selected: false, approximated: false, rimFront: null, fixtureBack: null, gap: null };
      lamp.debug = debug;
      entranceLights.push(debug);
    }
    if (VINES.includes(slot.id)) for (const x of [-1.1, 1.1]) addChild(group, createNode({ position: { x, y: 3.45, z: 0.95 }, geometry: hubModels.vine() }));
    addChild(root, group);
    placed.push(group);
    return rim;
  };
  // Dock over the drop and ladder on the bluff
  const buildRim = () => {
    const d = polar(DOCK_DEG, CLIFF_OUTER);
    place(hubModels.dock(), d.x, d.z, Math.PI / 2 - DOCK_DEG * DEG, island.heightAt(d.x, d.z), "dock", 2.2);
    claim(d.x, d.z, 2.5);
    let faceX = MEADOW - 1;
    while (island.heightAt(faceX + island.unit / 2, LADDER_Z) < 3) faceX += island.unit;
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
  // Scatter props by rejection, keeping off paths and mouths
  const scatter = () => {
    const rand = mulberry32(SEED);
    const candidateFree = (x, z, radius) => {
      for (let i = 0; i < sceneryClaims.length; i++) {
        const c = sceneryClaims[i];
        if (Math.hypot(c.x - x, c.z - z) < c.r + radius) return false;
      }
      return true;
    };
    // Grass is dressing: it reflows with the rest but answers no tap or Space
    const addScenery = (geometry, x, z, ry, y, kind, footprint) => {
      const reservation = claim(x, z, footprint);
      sceneryClaims.push(reservation);
      const quiet = kind === "grass";
      const node = place(geometry, x, z, ry, y, quiet ? null : kind, footprint + 0.3);
      const owner = quiet ? { kind: "prop", prop: kind, node, x, z, ripe: 0, pickRadius: 0, active: true } : props[props.length - 1];
      owner.footprint = footprint;
      owner.scenery = true;
      reservation.scenery = owner;
      scenery.push(owner);
      return node;
    };
    const meadow = (count, radius, kind, geometryAt, square = false) => {
      for (let n = 0, tries = 0; n < count && tries < 1500; tries++) {
        const { x, z } = polar(rand() * 360, Math.sqrt(lerp(MEADOW_INNER * MEADOW_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
        if (island.heightAt(x, z) > 0 || nearMouth(x, z, 3.5) || !candidateFree(x, z, radius)) continue;
        addScenery(geometryAt(n), x, z, square ? Math.floor(rand() * 4) * Math.PI / 2 + (rand() - 0.5) * 0.4 : rand() * Math.PI * 2, 0, kind, radius);
        n++;
      }
    };
    const cliff = (count, radius, minHeight, kind, geometryAt) => {
      for (let n = 0, tries = 0; n < count && tries < 1200; tries++) {
        const { x, z } = polar(rand() * 360, lerp(CLIFF_INNER, CLIFF_OUTER, rand()));
        const h = island.heightAt(x, z);
        if (h < minHeight || !free(x, z, radius)) continue;
        let clear = true;
        for (let i = 0; i < 4 && clear; i++) {
          const a = (i + 0.5) * Math.PI / 2;
          if (island.heightAt(x + Math.cos(a) * 1.2, z + Math.sin(a) * 1.2) > h + 1.5) clear = false;
        }
        if (!clear || nearMouth(x, z, 4) || !candidateFree(x, z, radius)) continue;
        addScenery(geometryAt(n), x, z, rand() * Math.PI * 2, h, kind, radius);
        n++;
      }
    };
    cliff(40, 1.4, 3, "tree", (n) => hubModels.tree(n % 4 === 3 ? 3 : n % 3));
    cliff(60, 1, 0.5, "bush", (n) => hubModels.bush(n % 3));
    meadow(60, 0.7, "bush", (n) => hubModels.bush(n % 3));
    meadow(8, 0.9, "rock", () => hubModels.rock(0));
    meadow(10, 0.7, "crate", () => hubModels.woodCrate(), true);
    meadow(8, 0.6, "barrel", () => hubModels.barrel());
    meadow(50, 0.35, "flower", () => hubModels.flowerTuft());
    meadow(150, 0.3, "grass", () => hubModels.grass());
  };
  const sceneryReason = (o) => {
    const clearance = island.path.debug.ringOuterRadius + SCENERY_CLEARANCE;
    if (Math.hypot(o.x, o.z) - o.footprint < clearance - 1e-9) return 1;
    if (island.path.overlaps(o.x, o.z, o.footprint)) return 2;
    for (let i = 0; i < claimed.length; i++) {
      const c = claimed[i];
      if (!c.scenery && Math.hypot(c.x - o.x, c.z - o.z) < c.r + o.footprint) return 3;
    }
    return 0;
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
      if (!reason) visible++;
      else if (reason === 1) radiusCulled++;
      else if (reason === 2) pathCulled++;
      else fixedCulled++;
    }
    sceneryVisible = visible;
    sceneryRadiusCulled = radiusCulled;
    sceneryPathCulled = pathCulled;
    sceneryFixedCulled = fixedCulled;
    sceneryReflows++;
    if (stash && !stash.active) rehomeJetpack(stash);
    if (jetpack && (Math.hypot(jetpack.x, jetpack.z) - 1 < island.path.debug.ringOuterRadius + SCENERY_CLEARANCE || island.path.overlaps(jetpack.x, jetpack.z, 1))) moveJetpackSafe();
  };
  // Hide the island's one jetpack under a visible, approachable scenery prop.
  const approachableHider = (o) => {
    for (let r = 0; r < JETPACK_APPROACH.length; r++) {
      const radius = JETPACK_APPROACH[r];
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * Math.PI * 2;
        const x = o.x + Math.cos(angle) * radius, z = o.z + Math.sin(angle) * radius;
        if (!island.onLand(x, z)) continue;
        let nearest = true;
        for (let j = 0; j < props.length; j++) {
          const other = props[j];
          if (other !== o && other.active && Math.hypot(other.x - x, other.z - z) < radius) {
            nearest = false;
            break;
          }
        }
        if (nearest) return true;
      }
    }
    return false;
  };
  const eligibleHider = (o) => o.active && JETPACK_HIDERS.includes(o.prop) && island.heightAt(o.x, o.z) === 0 && approachableHider(o);
  const hideJetpack = () => {
    const hiders = scenery.filter(eligibleHider);
    stash = hiders.length ? hiders[Math.floor(Math.random() * hiders.length)] : null;
    hintAt = HINT_AFTER;
  };
  const safeJetpackSpot = () => {
    const firstRadius = Math.max(MEADOW_INNER, island.path.debug.ringOuterRadius + SCENERY_CLEARANCE + 1);
    for (let radius = firstRadius; radius <= MEADOW_OUTER; radius += 0.5) {
      for (let i = 0; i < 64; i++) {
        const angle = (i * 137.5 + SEED * 17) * DEG;
        const x = Math.sin(angle) * radius, z = -Math.cos(angle) * radius;
        if (!island.onLand(x, z) || island.heightAt(x, z) !== 0 || island.path.overlaps(x, z, 1)) continue;
        let clear = true;
        for (let j = 0; j < claimed.length && clear; j++) {
          const c = claimed[j];
          if (!c.scenery && Math.hypot(c.x - x, c.z - z) < c.r + 1) clear = false;
        }
        for (let j = 0; j < scenery.length && clear; j++) {
          const o = scenery[j];
          if (o.active && Math.hypot(o.x - x, o.z - z) < o.footprint + 1) clear = false;
        }
        if (!clear) continue;
        JETPACK_SAFE.x = x;
        JETPACK_SAFE.z = z;
        return true;
      }
    }
    return false;
  };
  const moveJetpackSafe = () => {
    if (!safeJetpackSpot()) throw new Error("No safe meadow location for the jetpack");
    jetpack.x = jetpack.owner.x = jetpack.node.position.x = JETPACK_SAFE.x;
    jetpack.z = jetpack.owner.z = jetpack.node.position.z = JETPACK_SAFE.z;
  };
  const revealJetpackSafe = () => {
    if (!safeJetpackSpot()) throw new Error("No safe meadow location for the jetpack");
    const node = place(hubModels.jetpack(), JETPACK_SAFE.x, JETPACK_SAFE.z, 0, JETPACK_HOVER, "jetpack", 1);
    jetpack = { node, x: JETPACK_SAFE.x, z: JETPACK_SAFE.z, owner: props[props.length - 1] };
  };
  const rehomeJetpack = (old) => {
    old.node.highlight = 0;
    const start = scenery.indexOf(old);
    stash = null;
    for (let offset = 1; offset <= scenery.length; offset++) {
      const candidate = scenery[(start + offset) % scenery.length];
      if (!eligibleHider(candidate)) continue;
      stash = candidate;
      hintAt = now + HINT_AFTER;
      return;
    }
    revealJetpackSafe();
  };
  const dropJetpack = (o) => {
    o.node.highlight = 0;
    stash = null;
    const node = place(hubModels.jetpack(), o.x, o.z, 0, JETPACK_HOVER, "jetpack", 1);
    jetpack = { node, x: o.x, z: o.z, owner: props[props.length - 1] };
    fx.burst(o.x, JETPACK_HOVER + 0.3, o.z, 12, [DUST, SPARK], 1.8);
    hud.toast(`A jetpack was under the ${o.prop}!`);
    hud.hint("Walk an Ooga into it to put it on.", 5000);
  };
  const drop = (list, value) => {
    const i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1);
  };
  const equipJetpack = (cave) => {
    if (!crew.wearJetpack(cave, hubModels.jetpack(), hubModels.jetFlame())) return;
    pilot.showAct();
    const p = cave.root.position;
    fx.burst(p.x, p.y + 0.7, p.z, 14, [SPARK, DUST], 2.2);
    fx.say(cave, "OOGA FLY!", 2);
    hud.toast("Jetpack!");
    hud.hint(COARSE ? "Hold Blast off to climb · stick to fly" : "Hold Space to climb · WASD to fly", 5000);
  };
  const collectJetpack = (cave) => {
    const { node, owner } = jetpack;
    input.remove(node);
    removeChild(root, node);
    drop(targets, node);
    drop(placed, node);
    drop(props, owner);
    jetpack = null;
    equipJetpack(cave);
  };
  // Spots the crew strolls to
  const buildSpots = () => {
    spots.push({ x: 0, z: -(MEADOW + 2.5), ry: Math.PI });
    for (const m of island.mouths) spots.push({ x: m.apron.x, z: m.apron.z, ry: Math.atan2(m.x - m.apron.x, m.z - m.apron.z) });
    const rand = mulberry32(SEED + 5);
    for (let n = 0, tries = 0; n < WANDER_COUNT && tries < 1500; tries++) {
      const { x, z } = polar(rand() * 360, Math.sqrt(lerp(WANDER_INNER * WANDER_INNER, MEADOW_OUTER * MEADOW_OUTER, rand())));
      if (island.heightAt(x, z) !== 0 || nearMouth(x, z, 3) || !free(x, z, 0.9)) continue;
      spots.push({ x, z, ry: NaN });
      n++;
    }
  };
  // A seat nobody is heading for or sitting on
  const seatTaken = (s) => {
    for (const cave of crew.cavemen.values()) {
      const a = cave.act;
      if ((a.kind === "wander" || a.kind === "idle") && a.spot.x === s.x && a.spot.z === s.z) return true;
    }
    return false;
  };
  const freeSeat = () => {
    const start = Math.floor(Math.random() * fireSeats.length);
    for (let i = 0; i < fireSeats.length; i++) {
      const s = fireSeats[(start + i) % fireSeats.length];
      if (!seatTaken(s)) return s;
    }
    return null;
  };
  // By the fire at night, else anywhere on the meadow
  const wanderSpot = (out) => {
    let s = RENDER_OPTS.stars > NIGHT && Math.random() < FIRE_SEAT_CHANCE ? freeSeat() : null;
    if (!s) {
      s = spots[Math.floor(Math.random() * spots.length)];
      if (s.x === out.x && s.z === out.z) s = spots[(spots.indexOf(s) + 1) % spots.length];
    }
    out.x = s.x;
    out.z = s.z;
    out.ry = s.ry;
  };
  // Over a cave the rock has two layers, the tunnel floor and the roof above it
  const supportAt = (x, z, y = -Infinity) => {
    const roof = island.surfaceAt(x, z);
    return y >= roof - STEP_MAX ? roof : island.heightAt(x, z);
  };
  // A driven step stays on rock, off the heap, and on its own layer
  const walkable = (fromX, fromZ, toX, toZ, y) => {
    if (!island.onLand(toX, toZ) || Math.hypot(toX, toZ) <= pileEdgeNow + 0.4) return false;
    if (y >= island.surfaceAt(toX, toZ) - STEP_MAX) return true;
    return Math.abs(island.heightAt(toX, toZ) - y) <= STEP_MAX;
  };
  // Flying, only the rim stops him
  const flyable = (fromX, fromZ, toX, toZ) => island.onLand(toX, toZ);
  // Clouds ring the island without crossing it
  const buildClouds = () => {
    const rand = mulberry32(SEED + 77);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const beside = i % 2 === 0;
      const out = (rand() < 0.5 ? -1 : 1) * lerp(CLOUD_NEAR, CLOUD_WRAP, rand());
      const span = lerp(-CLOUD_WRAP, CLOUD_WRAP, rand());
      const y = beside ? lerp(-4, 6, rand()) : lerp(2, 8, rand());
      const node = createNode({ position: { x: beside ? out : span, y, z: beside ? span : -Math.abs(out) }, geometry: hubModels.cloud(Math.min(2, i % 4)) });
      addChild(root, node);
      placed.push(node);
      clouds.push({ node, speed: 0.4 + rand() * 0.4, beside });
    }
  };
  // A low stone dais and its flush, one block-wide perimeter grow continuously with the pile.
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

  // ---------- donations ----------
  const celebrate = (donation, bananas) => {
    for (const cave of crew.workingCavemen()) {
      if (cave.build) continue;
      cave.cheer = 1.6;
      fx.say(cave, ["OOGA!", "BOOGA!", "BANANA!"][fnv1a(`${donation.id}/${cave.traits.name}`) % 3], 1.8);
    }
    fx.burst(0, DROP_HEIGHT - 0.2, 0, 26, CONFETTI, 2.2);
    fx.showTicker(`THANKS ${donation.handle ? "@" + donation.handle.toUpperCase() : "ANON"} · ${bananas} BANANAS`, 4.5);
  };
  const onDonation = (donation) => {
    game.recordDonation(donation);
    const bananas = gameMod.bananasFor(donation.sats);
    pile.deliverBananas(bananas);
    celebrate(donation, bananas);
    const loot = lootEnabled ? game.lootFor(donation) : null;
    const who = donation.handle ? `@${donation.handle}` : "anon";
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${bananas} banana${bananas > 1 ? "s" : ""} · ${who}${loot ? ` · ${loot.tier} crate!` : ""}`);
    if (loot) crates.spawnCrate(donation, loot, 0.9 + Math.min(1.5, bananas / pileMod.DROP_RATE));
    hud.setStats(game.state);
  };

  // ---------- caves ----------
  const tooltipFor = (hit) => {
    const o = hit.owner;
    switch (o.kind) {
      case "caveman": {
        const c = o.cave;
        const worn = crew.wornBy(c.traits.name);
        return `${c.traits.name} · ${hudMod.STATE_LABELS[c.state]} · last commit ${contributors.ageLabel(c.contributor)}${worn ? ` · ${worn}` : ""}${c === pilot.player ? " · yours" : c.state === "working" ? " · double-tap to drive" : ""}`;
      }
      case "crate":
        return `${o.crate.loot.tier} crate · tap to open`;
      case "cave":
        return o.slot.status === "open" ? `${o.slot.name} · tap to enter` : o.slot.status === "mirror" ? `${o.slot.name} · mirror` : o.slot.status === "sleeping" ? "A project sleeps here · zzz" : "An empty cave";
      case "gate":
        return `${caves.gate.name} · leads nowhere yet`;
      case "prop":
        return PROP_TIPS[o.prop] || "";
      default:
        return "";
    }
  };
  // ---------- props ----------
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
  // Drop a banana from a tree or bush
  const dropBanana = (o, chance) => {
    if (now < o.ripe || Math.random() > chance) return false;
    o.ripe = now + RIPEN;
    pile.deliverBananas(1);
    hud.toast("A banana fell out and rolled to the pile!");
    return true;
  };
  const reactProp = (o) => {
    const w = o.node.world;
    const x = w[12], z = w[14];
    switch (o.prop) {
      case "tree":
        if (!wobble(o.node, 0.1)) return;
        fx.burst(x, 2.6, z, 10, [LEAF], 1.6);
        if (RENDER_OPTS.stars > NIGHT) critters.burst(x, z);
        if (!dropBanana(o, TREE_CHANCE)) hud.toast("Leaves. Just leaves.");
        break;
      case "bush":
        if (!wobble(o.node, 0.25)) return;
        fx.burst(x, w[13] + 0.7, z, 6, [LEAF], 1.2);
        if (!dropBanana(o, BUSH_CHANCE)) hud.toast(BUSH_WORDS[fnv1a(`${o.x}/${o.z}/${Math.floor(now)}`) % BUSH_WORDS.length]);
        break;
      case "rock":
        fx.burst(x, 0.6, z, 6, [CHIP], 1.4);
        hud.toast("Solid rock. Ow.");
        break;
      case "crate":
        if (!wobble(o.node, 0.12)) return;
        fx.burst(x, 0.9, z, 5, [DUST], 1);
        hud.toast("Locked. Ooga knows the code.");
        break;
      case "barrel":
        if (!wobble(o.node, 0.3)) return;
        hud.toast("Empty. Ooga drank it.");
        break;
      case "flower":
        if (!wobble(o.node, 0.4)) return;
        fx.burst(x, 0.35, z, 8, PETALS, 1.1);
        break;
      case "torch":
        o.node.flare = 1;
        fx.burst(x, w[13] + 1.4, z, 8, [SPARK], 1.3);
        break;
      case "firepit":
        if (RENDER_OPTS.torch < 0.5) {
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
      case "jetpack":
        if (pilot.player) collectJetpack(pilot.player);
        else hud.toast("Double-tap an Ooga, then walk them into it.");
        break;
      case "gate":
        hud.toast(`${caves.gate.name} · leads nowhere yet`);
        break;
      default:
        break;
    }
  };
  // Any use of the hiding prop frees the jetpack
  const useProp = (o) => {
    if (!o.active) return;
    reactProp(o);
    if (stash === o) dropJetpack(o);
  };
  // Nearest prop within reach, if any
  const useNear = (x, z, reach) => {
    let best = null, bestD = reach;
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (!o.active) continue;
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return false;
    useProp(best);
    return true;
  };
  // Dolly onto the mouth, then enter the cave
  const enterCave = (slot) => {
    if (entering) return;
    entering = true;
    pilot.release(true);
    hud.tooltip.hide();
    const view = presets[slot.scene];
    const orbit = pilot.orbit;
    const from = { x: orbit.tx, y: orbit.ty, z: orbit.tz, dist: orbit.dist, yaw: orbit.yaw };
    const turn = Math.atan2(Math.sin(view.yaw - from.yaw), Math.cos(view.yaw - from.yaw));
    orbit.target = view.target;
    orbit.tYaw = from.yaw + turn;
    orbit.tPitch = view.pitch;
    orbit.tDist = ENTER_DIST;
    addTween({
      dur: ENTER_DUR, ease: ease.inOutQuad, update: (k) => {
        orbit.tx = lerp(from.x, view.target.x, k);
        orbit.ty = lerp(from.y, view.target.y, k);
        orbit.tz = lerp(from.z, view.target.z, k);
        orbit.dist = lerp(from.dist, ENTER_DIST, k);
        orbit.yaw = from.yaw + turn * k;
      }, done: () => go(slot.scene)
    });
  };
  const onTap = (hit) => {
    if (!hit) return;
    const o = hit.owner;
    switch (o.kind) {
      case "caveman":
        crew.pokeCave(o.cave);
        break;
      case "crate":
        crates.openCrate(o.crate);
        break;
      case "cave":
        if (o.slot.status === "open") enterCave(o.slot);
        else hud.toast(tooltipFor(hit));
        break;
      case "gate":
        hud.toast(tooltipFor(hit));
        break;
      case "prop":
        useProp(o);
        break;
      default:
        break;
    }
  };

  // ---------- camera bounds ----------
  // Keep flight in a drum and the eye above rock
  const clampTarget = (t) => {
    const r = Math.hypot(t.x, t.z);
    if (r > FLY_BOUND) {
      t.x *= FLY_BOUND / r;
      t.z *= FLY_BOUND / r;
    }
  };
  const clampCamera = (p) => {
    if (inMatrixCave(p.x, p.z)) p.y = Math.min(matrixCave.mouth.floorY + 3.55, Math.max(p.y, matrixCave.mouth.floorY + 0.55));
    else p.y = Math.max(p.y, island.surfaceAt(p.x, p.z) + CLEARANCE);
  };

  // ---------- per frame ----------
  const updateMeter = () => {
    const seconds = game.forecast(world.level, crew.eatingCavemen().length, EAT_RATE);
    hud.setMeter(world.level, METER_CAPACITY, Number.isFinite(seconds) ? `≈ ${game.formatDuration(seconds)} left` : "stable");
  };
  // The clock drives the sky, the lamps and who is out
  const setPhase = (next) => {
    const first = phase === null;
    phase = next;
    hud.setSubtitle(`an island of caves · ${next}`);
    if (!first) hud.toast(PHASE_TOASTS[next]);
  };
  const update = (dt, elapsed) => {
    now = elapsed;
    hour = clock.read();
    daylight.sample(hour, RENDER_OPTS, clock.dayOfYear, islandLatitude, clock.continuousDay);
    RENDER_OPTS.time = elapsed;
    updateLamps(dt, elapsed, phase !== null);
    const next = daylight.phaseAt(hour);
    if (next !== phase) setPhase(next);
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
    DAYLIGHT_DEBUG.ambientFloor = RENDER_OPTS.ambientFloor;
    DAYLIGHT_DEBUG.diffuseFloor = RENDER_OPTS.diffuseFloor;
    DAYLIGHT_DEBUG.shadowStrength = RENDER_OPTS.shadowStrength;
    DAYLIGHT_DEBUG.shadowFloor = RENDER_OPTS.shadowFloor;
    DAYLIGHT_DEBUG.shadowBias = RENDER_OPTS.shadowBias;
    DAYLIGHT_DEBUG.outdoorDarkestSurfaceEstimate = RENDER_OPTS.outdoorDarkestSurfaceEstimate;
    DAYLIGHT_DEBUG.activeLightSource = RENDER_OPTS.activeLightSource;
    DAYLIGHT_DEBUG.sunriseHour = RENDER_OPTS.sunriseHour;
    DAYLIGHT_DEBUG.sunsetHour = RENDER_OPTS.sunsetHour;
    critters.update(dt, elapsed, RENDER_OPTS.day, RENDER_OPTS.stars, fire.k);
    pileEdgeNow = pile.pileEdge();
    pilot.readInput(dt);
    crew.update(dt, elapsed);
    pile.update(dt);
    const player = pilot.player;
    // Pulse the prop if it still hides the jetpack
    if (stash) {
      const t = now - hintAt;
      const pulse = t > 0 ? t % HINT_EVERY : HINT_PULSE;
      stash.node.highlight = pulse < HINT_PULSE ? Math.sin(pulse / HINT_PULSE * Math.PI) * HINT_MAX : 0;
    }
    // Turn and bob the dropped pickup
    if (jetpack) {
      jetpack.node.rotation.y += dt * 0.9;
      jetpack.node.position.y = JETPACK_HOVER + Math.sin(elapsed * 2) * 0.09;
      if (player && !player.jet && Math.hypot(player.root.position.x - jetpack.x, player.root.position.z - jetpack.z) < JETPACK_REACH) collectJetpack(player);
    }
    // Walking into an open cave enters it, flying or standing on its roof does not
    if (player && !entering && player.hop < 1) {
      const p = player.root.position;
      const y = p.y - player.baseY;
      for (let i = 0; i < openMouths.length; i++) {
        const { slot, m } = openMouths[i];
        if (Math.abs(y - m.floorY) < 1 && Math.hypot(p.x - m.inside.x, p.z - m.inside.z) < TUNNEL_REACH) enterCave(slot);
      }
    }
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i], p = c.node.position;
      if (c.beside) {
        p.z += c.speed * dt;
        if (p.z > CLOUD_WRAP) p.z -= CLOUD_WRAP * 2;
      } else {
        p.x += c.speed * dt;
        if (p.x > CLOUD_WRAP) p.x -= CLOUD_WRAP * 2;
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
    pilot.update(dt);
    updateMatrixRain(elapsed);
    meterTimer -= dt;
    if (meterTimer <= 0) {
      meterTimer = 0.25;
      updateMeter();
    }
  };
  // Build quotes over the depth-tested scene
  const drawExtra = (ctx2d, project, drawBubble) => {
    crew.drawQuotes(ctx2d, project, drawBubble);
  };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);

  // ---------- actions and keys ----------
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
  const demoTip = (sats) => onDonation({ id: `demo-${Date.now()}`, sats, handle: game.state.handle, message: game.state.message, at: Date.now() });
  const addTestBananas = (amount) => {
    pile.deliverBananas(amount);
    hud.toast(`+${amount} test bananas`);
  };
  const resetDemo = () => {
    game.resetAll();
    location.reload();
  };
  const onKey = (e) => {
    if (e.key === "Escape") pilot.release();
    if (e.key === "0") pilot.goPreset("pile");
    if (e.key === "b" || e.key === "B") addTestBananas(testBananas);
    if (e.key === "l" || e.key === "L") demoTip(120000);
    if (e.key === "p" || e.key === "P") {
      world.level = Math.max(world.level, pile.slots.length);
      pile.syncPile(true);
    }
    // J straps a jetpack on whoever is being driven
    if (e.key === "j" || e.key === "J") {
      const cave = crew.player;
      if (cave && !cave.jet) {
        if (stash) {
          stash.node.highlight = 0;
          stash = null;
        }
        if (jetpack) collectJetpack(cave);
        else equipJetpack(cave);
      }
    }
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

  // ---------- scene contract ----------
  const enter = (ctx) => {
    ({ renderer, game, world, go, lootEnabled, testBananas } = ctx);
    camera = createCamera({ fov: 48, near: 0.5, far: 140 });
    root = createNode();
    clock = daylight.createClock({ hour: hourParam, daylen: daylenParam, day: dayParam, now: new Date() });
    phase = null;
    island = terrain.island({ seed: SEED });
    mark("island");
    hud = hudMod.create({ roster: contributors.roster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    presets = { pile: PILE_VIEW, gate: GATE_VIEW };
    pilot = pilotMod.create({ renderer, canvas: ctx.canvas, camera, hud, presets, landing: "pile", pitch: [PITCH_MIN, PITCH_MAX], dist: [DIST_MIN, DIST_MAX], follow: FOLLOW, fly: FLY, clampTarget, clampCamera, coarse: COARSE });
    place(island.geometry, 0, 0, 0, 0);
    pathNode = createNode({ geometry: island.path.geometry, instanceData: island.path.instanceData, instanceCount: 0, instanceVersion: 0, depthBias: 0.05 });
    addChild(root, pathNode);
    placed.push(pathNode);
    altar = buildAltar();
    const layoutPile = (radius) => {
      altar.setRadius(radius);
      const changed = island.path.setRadius(altar.platformRadius);
      island.path.apply(pathNode);
      if (changed) reflowScenery();
    };
    layoutPile(pileMod.visualFootprintFor(world.level, PILE_SCALE));
    const gate = place(hubModels.gate(), island.gate.x, island.gate.z, island.gate.ry);
    addTarget(gate, { kind: "gate" }, { radius: 3 });
    props.push({ kind: "prop", prop: "gate", node: gate, x: gate.position.x, z: gate.position.z, ripe: 0, active: true });
    claim(gate.position.x, gate.position.z, 3);
    TICKER_AT.y = gate.position.y + 6;
    GATE_VIEW.target.y = gate.position.y + 2.5;
    const bedrolls = [];
    for (const slot of caves.slots) {
      const m = island.mouths.find((mouth) => mouth.id === slot.id);
      addTarget(buildMouth(slot, m), { kind: "cave", slot, priority: 1 }, { radius: 2.6 });
      claim(m.x, m.z, 3.5);
      if (slot.scene) {
        presets[slot.scene] = mouthView(m);
        openMouths.push({ slot, m });
      }
      if (slot.status === "sleeping") bedrolls.push(m.inside);
    }
    for (const deg of BEDROLL_DEGREES) {
      const p = spotAt(deg, BEDROLL_RADIUS, 1.4);
      place(hubModels.bedroll(), p.x, p.z, 0, 0.05, "bedroll", 1.1).depthBias = 0.3;
      claim(p.x, p.z, 1.2);
      bedrolls.push(p);
    }
    // An inner ring of beds for the rest
    const extra = contributors.roster.length - bedrolls.length;
    for (let k = 0; k < extra; k++) {
      const p = spotAt(20 + k * 360 / extra, BEDROLL_INNER, 1.4);
      place(hubModels.bedroll(), p.x, p.z, 0, 0.05, "bedroll", 1.1).depthBias = 0.3;
      claim(p.x, p.z, 1.2);
      bedrolls.push(p);
    }
    const buildSpotsList = BUILD_DEGREES.map((deg) => {
      const { x, z } = spotAt(deg, BUILD_RADIUS, 1);
      claim(x, z, 0.9);
      return { x, z, ry: Math.atan2(-x, -z) };
    });
    buildRim();
    const firePos = buildFire();
    fire = lamps[lamps.length - 1];
    scatter();
    reflowScenery();
    buildSpots();
    buildClouds();
    hideJetpack();
    critters = crittersMod.create({ root, renderer, flowers: scenery.filter((o) => o.prop === "flower" && o.active), fire: firePos, meadowRadius: MEADOW, heightAt: island.heightAt });
    mark("props");
    const shared = { root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, overlayVisible: matrixOverlayVisible, tickerAt: TICKER_AT, buildSpots: buildSpotsList, walkIn: WALK_IN, clampDrag, viewYaw: PILE_VIEW.yaw, bedrolls, pileScale: PILE_SCALE, pileY: ALTAR_HEIGHT + 0.02, onLayout: layoutPile, onShown: () => { meterTimer = 0; }, crateRadius: () => Math.max(4.4, altar.platformRadius + 0.8), groundAt: supportAt, wanderSpot, walkable, flyable, useNear, phase: () => phase };
    fx = shared.fx = fxMod.create(shared);
    pile = shared.pile = pileMod.create(shared);
    mark("pile");
    crew = shared.crew = crewMod.create(shared);
    mark("cavemen");
    crates = shared.crates = cratesMod.create(shared);
    pilot.bind(shared);

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
    const donationRequest = donations.createRequest(game.state);
    qr.drawTo(hud.el.qr, donationRequest.url, { quiet: 3, dark: "#000000", light: "#f3efe4" });
    mark("qr");
    hud.setDonationUrl(donationRequest.url);
    hud.setIdentity(game.state);
    hud.onIdentityChange(({ handle, message }) => {
      game.setIdentity({ handle: donations.sanitize(handle, donations.HANDLE_MAX), message: donations.sanitize(message, donations.MESSAGE_MAX) });
      hud.setIdentity(game.state);
    });

    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit) hud.tooltip.show(tooltipFor(hit), p.x, p.y);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => hud.tooltip.show(tooltipFor(hit), p.x, p.y),
      onTap,
      ...pilot.hooks
    });
    // Every visit starts on the landing view
    entering = false;
    pileEdgeNow = 0;
    now = 0;
    hud.onPreset(pilot.goPreset);
    hud.onAction((action) => {
      if (action === "tip") demoTip(1200);
      else if (action === "tip-legendary") demoTip(120000);
      else if (action === "clear-loot") clearLoot();
      else if (action === "reset") resetDemo();
      else if (action === "act") pilot.action();
      else if (action === "reset-view") pilot.goPreset("pile");
    });
    meterTimer = 0;
    crew.refreshStates(true);
    // Once a minute, refresh states and trim the pool
    stateTimer = window.setInterval(() => {
      crew.refreshStates();
      fx.trimPool();
    }, 6e4);
    for (const cave of crew.cavemen.values()) crew.refreshRosterRow(cave);
    if (lootEnabled) {
      crew.applyAllSwag();
      crew.renderLocker();
    }
    hud.setStats(game.state);
    pile.syncPile(true);
    updateMeter();
    if (window.matchMedia("(max-width: 720px), (max-height: 500px)").matches) hud.el.sheet.dataset.open = "false";
    hintTimer = window.setTimeout(() => hud.hint(COARSE ? "Drag to look · pinch to zoom · sticks to fly · tap a cave" : "Drag to orbit · scroll to zoom · WASD to fly · tap a cave to enter"), 1200);
    Object.assign(hubScene, {
      root, camera, input,
      debug: {
        slots: pile.slots, drops: pile.drops, core: pile.core, shell: pile.shell, delivery: pile.delivery, cavemen: crew.cavemen, crates: crates.list, lab: null, hud, applyAllSwag: crew.applyAllSwag, renderLocker: crew.renderLocker, demoTip, setPileLevel: pile.setLevel, refreshStates: crew.refreshStates, trimPool: fx.trimPool,
        get shown() {
          return pile.shown;
        },
        island, mouths: island.mouths, labels, camera, crew, controls: pilot.controls, props, altar, path: island.path.debug,
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
        matrixCave: {
          get streamCount() { return matrixCave.streamCount; },
          get hangingStreamCount() { return matrixCave.hangingStreamCount; },
          get entranceStreamCount() { return matrixCave.entranceStreamCount; },
          get wallStreamCount() { return matrixCave.wallStreamCount; },
          get streamLength() { return matrixCave.streamLength; },
          get glyphCount() { return matrixCave.glyphCount; },
          get rainGlyphCount() { return matrixCave.rainGlyphCount; },
          get surfaceGlyphCount() { return matrixCave.glyphCount - matrixCave.rainGlyphCount; },
          get activeGlyphCount() { return matrixCave.activeGlyphCount; },
          get brightTipCount() { return matrixCave.brightTipCount; },
          get capacity() { return matrixCave.capacity; },
          get glyphVersion() { return matrixCave.glyphVersion; },
          get previousGlyphVersion() { return matrixCave.previousGlyphVersion; },
          get mutationHash() { return matrixCave.mutationHash; },
          get glyphCadenceHz() { return MATRIX_GLYPH_HZ; },
          get bufferCount() { return MATRIX_TYPES; },
          get bufferBytes() { return matrixCave.bufferBytes; },
          get registryBytes() { return matrixCave.registryBytes; },
          get registryHash() { return matrixCave.registryHash; },
          get allocationCount() { return matrixCave.allocationCount; },
          get rebuildCount() { return matrixCave.rebuildCount; },
          get quality() { return matrixCave.quality; },
          get qualityDensity() { return matrixCave.densityRankLimit / 8; },
          get surfacePitch() { return MATRIX_SURFACE_PITCH; },
          get surfaceGap() { return MATRIX_SURFACE_GAP; },
          surfaceLayout: MATRIX_LAYOUT,
          surfaceCounts: {
            get freeRain() { return matrixCave.surfaceCounts[0]; },
            get floor() { return matrixCave.surfaceCounts[1] + matrixCave.surfaceCounts[2]; },
            get ceiling() { return matrixCave.surfaceCounts[3] + matrixCave.surfaceCounts[4]; },
            get leftWall() { return matrixCave.surfaceCounts[5] + matrixCave.surfaceCounts[7]; },
            get rightWall() { return matrixCave.surfaceCounts[6] + matrixCave.surfaceCounts[8]; },
            get backWall() { return matrixCave.surfaceCounts[9]; },
            get doorway() { return matrixCave.surfaceCounts[10] + matrixCave.surfaceCounts[11] + matrixCave.surfaceCounts[12] + matrixCave.surfaceCounts[13] + matrixCave.surfaceCounts[14]; },
            get mainFloor() { return matrixCave.surfaceCounts[1]; },
            get vestibuleFloor() { return matrixCave.surfaceCounts[2]; },
            get mainCeiling() { return matrixCave.surfaceCounts[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceCounts[4]; },
            get mainLeftWall() { return matrixCave.surfaceCounts[5]; },
            get mainRightWall() { return matrixCave.surfaceCounts[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceCounts[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceCounts[8]; },
            get transitionHeader() { return matrixCave.surfaceCounts[10]; },
            get doorwayLintel() { return matrixCave.surfaceCounts[11]; },
            get transitionReturns() { return matrixCave.surfaceCounts[12]; },
            get doorwayJambs() { return matrixCave.surfaceCounts[13]; },
            get rimUnderside() { return matrixCave.surfaceCounts[14]; }
          },
          activeSurfaceCounts: {
            get freeRain() { return matrixCave.surfaceActiveCounts[0]; },
            get floor() { return matrixCave.surfaceActiveCounts[1] + matrixCave.surfaceActiveCounts[2]; },
            get ceiling() { return matrixCave.surfaceActiveCounts[3] + matrixCave.surfaceActiveCounts[4]; },
            get leftWall() { return matrixCave.surfaceActiveCounts[5] + matrixCave.surfaceActiveCounts[7]; },
            get rightWall() { return matrixCave.surfaceActiveCounts[6] + matrixCave.surfaceActiveCounts[8]; },
            get backWall() { return matrixCave.surfaceActiveCounts[9]; },
            get doorway() { return matrixCave.surfaceActiveCounts[10] + matrixCave.surfaceActiveCounts[11] + matrixCave.surfaceActiveCounts[12] + matrixCave.surfaceActiveCounts[13] + matrixCave.surfaceActiveCounts[14]; },
            get mainFloor() { return matrixCave.surfaceActiveCounts[1]; },
            get vestibuleFloor() { return matrixCave.surfaceActiveCounts[2]; },
            get mainCeiling() { return matrixCave.surfaceActiveCounts[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceActiveCounts[4]; },
            get mainLeftWall() { return matrixCave.surfaceActiveCounts[5]; },
            get mainRightWall() { return matrixCave.surfaceActiveCounts[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceActiveCounts[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceActiveCounts[8]; },
            get transitionHeader() { return matrixCave.surfaceActiveCounts[10]; },
            get doorwayLintel() { return matrixCave.surfaceActiveCounts[11]; },
            get transitionReturns() { return matrixCave.surfaceActiveCounts[12]; },
            get doorwayJambs() { return matrixCave.surfaceActiveCounts[13]; },
            get rimUnderside() { return matrixCave.surfaceActiveCounts[14]; }
          },
          surfaceStreams: {
            get freeRain() { return matrixCave.surfaceStreams[0]; },
            get floor() { return matrixCave.surfaceStreams[1] + matrixCave.surfaceStreams[2]; },
            get ceiling() { return matrixCave.surfaceStreams[3] + matrixCave.surfaceStreams[4]; },
            get leftWall() { return matrixCave.surfaceStreams[5] + matrixCave.surfaceStreams[7]; },
            get rightWall() { return matrixCave.surfaceStreams[6] + matrixCave.surfaceStreams[8]; },
            get backWall() { return matrixCave.surfaceStreams[9]; },
            get doorway() { return matrixCave.surfaceStreams[10] + matrixCave.surfaceStreams[11] + matrixCave.surfaceStreams[12] + matrixCave.surfaceStreams[13] + matrixCave.surfaceStreams[14]; },
            get mainFloor() { return matrixCave.surfaceStreams[1]; },
            get vestibuleFloor() { return matrixCave.surfaceStreams[2]; },
            get mainCeiling() { return matrixCave.surfaceStreams[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceStreams[4]; },
            get mainLeftWall() { return matrixCave.surfaceStreams[5]; },
            get mainRightWall() { return matrixCave.surfaceStreams[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceStreams[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceStreams[8]; },
            get transitionHeader() { return matrixCave.surfaceStreams[10]; },
            get doorwayLintel() { return matrixCave.surfaceStreams[11]; },
            get transitionReturns() { return matrixCave.surfaceStreams[12]; },
            get doorwayJambs() { return matrixCave.surfaceStreams[13]; },
            get rimUnderside() { return matrixCave.surfaceStreams[14]; }
          },
          surfaceEdgeMargins: {
            get mainFloor() { return matrixCave.surfaceEdgeMargins[1]; },
            get vestibuleFloor() { return matrixCave.surfaceEdgeMargins[2]; },
            get mainCeiling() { return matrixCave.surfaceEdgeMargins[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceEdgeMargins[4]; },
            get mainLeftWall() { return matrixCave.surfaceEdgeMargins[5]; },
            get mainRightWall() { return matrixCave.surfaceEdgeMargins[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceEdgeMargins[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceEdgeMargins[8]; },
            get backWall() { return matrixCave.surfaceEdgeMargins[9]; },
            get transitionHeader() { return matrixCave.surfaceEdgeMargins[10]; },
            get doorwayLintel() { return matrixCave.surfaceEdgeMargins[11]; },
            get transitionReturns() { return matrixCave.surfaceEdgeMargins[12]; },
            get doorwayJambs() { return matrixCave.surfaceEdgeMargins[13]; },
            get rimUnderside() { return matrixCave.surfaceEdgeMargins[14]; }
          },
          get minBrightness() { return matrixCave.minBrightness; },
          get maxBrightness() { return matrixCave.maxBrightness; },
          get minTrainLength() { return matrixCave.minTrainLength; },
          get maxTrainLength() { return matrixCave.maxTrainLength; },
          get minGapLength() { return matrixCave.minGapLength; },
          get maxGapLength() { return matrixCave.maxGapLength; },
          get leadingTipCount() { return matrixCave.brightTipCount; },
          get movingGapCount() { return matrixCave.movingGapCount; },
          get representativeHeadPhase() { return matrixCave.representativeHeadPhase; },
          get maxLocalZ() { return matrixCave.maxLocalZ; },
          get portalClearance() { return matrixCave.portalClearance; },
          surfaceDirections: {
            freeRain: -1, mainFloor: -1, vestibuleFloor: -1, mainCeiling: -1, vestibuleCeiling: -1,
            mainLeftWall: -1, mainRightWall: -1, vestibuleLeftWall: -1, vestibuleRightWall: -1,
            backWall: -1, transitionHeader: -1, doorwayLintel: -1, transitionReturns: -1, doorwayJambs: -1, rimUnderside: -1
          },
          surfaceFacings: {
            get mainFloor() { return matrixCave.surfaceFacings[1]; },
            get vestibuleFloor() { return matrixCave.surfaceFacings[2]; },
            get mainCeiling() { return matrixCave.surfaceFacings[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceFacings[4]; },
            get mainLeftWall() { return matrixCave.surfaceFacings[5]; },
            get mainRightWall() { return matrixCave.surfaceFacings[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceFacings[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceFacings[8]; },
            get backWall() { return matrixCave.surfaceFacings[9]; },
            get transitionHeader() { return matrixCave.surfaceFacings[10]; },
            get doorwayLintel() { return matrixCave.surfaceFacings[11]; },
            get transitionReturns() { return matrixCave.surfaceFacings[12]; },
            get doorwayJambs() { return matrixCave.surfaceFacings[13]; },
            get rimUnderside() { return matrixCave.surfaceFacings[14]; }
          },
          surfaceMaxLocalZ: {
            get mainFloor() { return matrixCave.surfaceMaxLocalZ[1]; },
            get vestibuleFloor() { return matrixCave.surfaceMaxLocalZ[2]; },
            get mainCeiling() { return matrixCave.surfaceMaxLocalZ[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceMaxLocalZ[4]; },
            get mainLeftWall() { return matrixCave.surfaceMaxLocalZ[5]; },
            get mainRightWall() { return matrixCave.surfaceMaxLocalZ[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceMaxLocalZ[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceMaxLocalZ[8]; },
            get backWall() { return matrixCave.surfaceMaxLocalZ[9]; },
            get transitionHeader() { return matrixCave.surfaceMaxLocalZ[10]; },
            get doorwayLintel() { return matrixCave.surfaceMaxLocalZ[11]; },
            get transitionReturns() { return matrixCave.surfaceMaxLocalZ[12]; },
            get doorwayJambs() { return matrixCave.surfaceMaxLocalZ[13]; },
            get rimUnderside() { return matrixCave.surfaceMaxLocalZ[14]; }
          },
          surfaceHeadPositions: {
            get mainFloor() { return matrixCave.surfaceHeadPositions[1]; },
            get vestibuleFloor() { return matrixCave.surfaceHeadPositions[2]; },
            get mainCeiling() { return matrixCave.surfaceHeadPositions[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceHeadPositions[4]; },
            get mainLeftWall() { return matrixCave.surfaceHeadPositions[5]; },
            get mainRightWall() { return matrixCave.surfaceHeadPositions[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceHeadPositions[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceHeadPositions[8]; },
            get backWall() { return matrixCave.surfaceHeadPositions[9]; },
            get transitionHeader() { return matrixCave.surfaceHeadPositions[10]; },
            get doorwayLintel() { return matrixCave.surfaceHeadPositions[11]; },
            get transitionReturns() { return matrixCave.surfaceHeadPositions[12]; },
            get doorwayJambs() { return matrixCave.surfaceHeadPositions[13]; },
            get rimUnderside() { return matrixCave.surfaceHeadPositions[14]; }
          },
          surfaceGapPositions: {
            get mainFloor() { return matrixCave.surfaceGapPositions[1]; },
            get vestibuleFloor() { return matrixCave.surfaceGapPositions[2]; },
            get mainCeiling() { return matrixCave.surfaceGapPositions[3]; },
            get vestibuleCeiling() { return matrixCave.surfaceGapPositions[4]; },
            get mainLeftWall() { return matrixCave.surfaceGapPositions[5]; },
            get mainRightWall() { return matrixCave.surfaceGapPositions[6]; },
            get vestibuleLeftWall() { return matrixCave.surfaceGapPositions[7]; },
            get vestibuleRightWall() { return matrixCave.surfaceGapPositions[8]; },
            get backWall() { return matrixCave.surfaceGapPositions[9]; },
            get transitionHeader() { return matrixCave.surfaceGapPositions[10]; },
            get doorwayLintel() { return matrixCave.surfaceGapPositions[11]; },
            get transitionReturns() { return matrixCave.surfaceGapPositions[12]; },
            get doorwayJambs() { return matrixCave.surfaceGapPositions[13]; },
            get rimUnderside() { return matrixCave.surfaceGapPositions[14]; }
          },
          representativeStream: {
            get speed() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].speed; },
            get direction() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].direction; },
            get trainLength() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].trainLength; },
            get gapLength() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].gapLength; },
            get flowMin() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].flowMin; },
            get flowMax() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].flowMax; },
            get flowRange() { return matrixCave.streams[matrixCave.surfaceRepresentativeStreams[1]].flowRange; }
          },
          sampleMotion: (surfaceName) => {
            const surface = MATRIX_SURFACES.indexOf(surfaceName);
            if (surface < 1) return null;
            const streamIndex = matrixCave.surfaceRepresentativeStreams[surface];
            if (streamIndex < 0) return null;
            const stream = matrixCave.streams[streamIndex];
            return {
              surface: MATRIX_SURFACES[surface], direction: stream.direction, speed: stream.speed,
              head: matrixCave.surfaceHeadPositions[surface], gap: matrixCave.surfaceGapPositions[surface],
              flowMin: stream.flowMin, flowMax: stream.flowMax, flowRange: stream.flowRange,
              trainLength: stream.trainLength, gapLength: stream.gapLength,
              leadingGlow: stream.brightness,
              secondGlow: stream.brightness * (0.48 + 0.52 * (1 - 1 / stream.trainLength)),
              trailingGlow: stream.brightness * (0.48 + 0.52 / stream.trainLength)
            };
          },
          get updates() { return matrixCave.updates; },
          get prewarmCount() { return matrixCave.prewarmCount; },
          get preloaded() { return matrixCave.preloaded; },
          get drawEnabled() { return matrixCave.drawEnabled; },
          get drawnGlyphCount() { return matrixCave.drawnGlyphCount; },
          get batchDrawCount() {
            let count = 0;
            for (let glyph = 0; glyph < MATRIX_TYPES; glyph++) count += matrixCave.nodes[glyph].drawInstanceCount;
            return count;
          },
          get preloadDistance() { return MATRIX_PRELOAD; },
          get roomScale() { return matrixCave.room.scale.x; },
          get visible() { return matrixCave.visible; },
          get inside() { return matrixCave.portal.inside; },
          get firstGlyphY() { return matrixCave.firstGlyphY; },
          portal: {
            get inside() { return matrixCave.portal.inside; },
            get lastCrossingDirection() { return matrixCave.portal.lastCrossingDirection; },
            plane: matrixCave.portal.plane,
            opening: matrixCave.portal.opening,
            rejected: matrixCave.portal.rejected
          },
          contains: inMatrixCave,
          overlayVisible: matrixOverlayVisible,
          viewApproach: viewMatrixApproach,
          viewInside: viewInsideMatrix
        },
        pilot,
        renderOpts: RENDER_OPTS,
        lamps,
        entranceLights,
        lighting: LIGHTING_DEBUG,
        fireSeats,
        get critters() {
          return critters.stats();
        },
        get daylight() {
          return DAYLIGHT_DEBUG;
        },
        setHour: (h, daylen = NaN, day = clock.dayOfYear) => {
          clock = daylight.createClock({ hour: h, daylen, day });
        },
        get jetpack() {
          return {
            stash, pickup: jetpack, hintAt,
            hintNow: () => (hintAt = now),
            forceHost: (o) => {
              if (!o.scenery || !o.active) throw new Error("Jetpack test host must be active scenery");
              if (stash) stash.node.highlight = 0;
              stash = o;
              hintAt = now + HINT_AFTER;
            }
          };
        }
      }
    });
  };
  const leave = () => {
    window.clearInterval(stateTimer);
    window.clearTimeout(hintTimer);
    crates.dispose();
    pile.dispose();
    crew.dispose();
    critters.dispose();
    fx.dispose();
    pilot.dispose();
    for (const node of targets) input.remove(node);
    for (const node of placed) removeChild(root, node);
    targets.length = placed.length = claimed.length = scenery.length = sceneryClaims.length = clouds.length = lamps.length = entranceLights.length = fireSeats.length = sleepers.length = labels.length = spots.length = openMouths.length = props.length = 0;
    RENDER_OPTS.lightCount = 0;
    LIGHTING_DEBUG.registeredLampCount = LIGHTING_DEBUG.activeFullLightCount = LIGHTING_DEBUG.approximatedLightCount = LIGHTING_DEBUG.selectedCount = LIGHTING_DEBUG.approximatedCount = 0;
    for (let i = 0; i < LIGHT_CAPACITY; i++) LIGHTING_DEBUG.selectedIds[i] = LIGHTING_DEBUG.approximatedIds[i] = null;
    sceneryVisible = sceneryRadiusCulled = sceneryPathCulled = sceneryFixedCulled = sceneryReflows = 0;
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    // Drop everything but the cached island
    pathNode = altar = hud = hooks = input = pilot = fx = pile = crew = crates = critters = clock = presets = stash = jetpack = mirrorCave = matrixCave = fire = null;
    hubScene.input = hubScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    for (const cave of crew.cavemen.values()) set.add(cave.headOpen).add(cave.headClosed);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...crates.stats(), ...crew.stats(), ...pile.stats(), ...critters.stats() };
  };
  const hubScene = {
    id: "hub", enter, update, overlay, onDonation, onKey, onLootCleared, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null,
    get inMotion() {
      return pile.inMotion || fx.inMotion;
    }
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.hub = hubScene;
})();
