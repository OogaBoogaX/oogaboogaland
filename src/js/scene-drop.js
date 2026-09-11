// Ooga Drop: the skydiving scene launched from the plane on the rally cave roof
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, donations, qr, terrain, hubModels, dropModels, daylight, pile: pileMod, game: gameMod, hud: hudMod, interact: interactMod, controls: controlsMod, fx: fxMod, skydiver, dropHud, dropAudio } = BL;
  const { clamp, lerp, damp, quat, mulberry32 } = math;
  const { createNode, addChild, removeChild, createCamera, addTween, stepTweens, tweenCount, traverseVisible } = BL.scene;
  const { CONFETTI } = fxMod;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  const hourParam = DEBUG ? parseFloat(params.get("hour")) : NaN;
  const daylenParam = DEBUG ? parseFloat(params.get("daylen")) : NaN;
  const dayParam = DEBUG ? parseFloat(params.get("day")) : NaN;
  const latitudeParam = DEBUG ? parseFloat(params.get("latitude")) : NaN;
  const islandLatitude = Number.isFinite(latitudeParam) ? Math.max(-66, Math.min(66, latitudeParam)) : daylight.ISLAND_LATITUDE_DEG;
  const SEED = 1;
  const METER_CAPACITY = 60;
  const FIXED = 1 / 120, MAX_SUBSTEPS = 4;
  // The climb: a roll along the roof, then a helix round the island up to jump height, blended from the straight run
  const JUMP_ALT = 360, HELIX_R = 40, PLANE_SPEED = 20, HELIX_W = PLANE_SPEED / HELIX_R, ROLL_T = 1.3, CLIMB_T = 17, BLEND_T = 4, SKIP_SCALE = 4;
  // The jump window opens once a lap when the plane passes the course start, and stays open a moment once it has
  // The calls on the way round to the mark, in radians before it
  const JUMP_WINDOW = 0.42, JUMP_GRACE = 1.6, JUMP_GET_READY = 3, JUMP_SOON = 1.4;
  const NEXT_RING_PULSE = 0.1;
  // The course: rings from the top altitude down, radii shrinking, laid on the path of a diver steering for the target at
  // half stick, so the course is flyable by construction, with a little wander to keep the player honest
  const RING_COUNT = 8, RING_TOP = 300, RING_BOTTOM = 118, RING_STEP = (RING_TOP - RING_BOTTOM) / (RING_COUNT - 1), RING_R0 = 8, RING_R1 = 5, RING_WANDER = 3, TARGET_R = 11, AUTOPILOT = { pitch: 0.5, yaw: 1.5, settle: 30, dogleg: 24, doglegFrom: 250, doglegTo: 170 };
  // Off the island the fall is lost as soon as it drops past the rim; crashes and landings hold before the results
  const PULL_ALT = 90, LOST_Y = -8, LANDED_T = 1.9, LOST_T = 1.1;
  const SCORE = { ring: 100, land: 500, landRadius: 10, stand: 200, stumble: 50, banana: 300 };
  const STREAKS = 160, STREAK_BOX = 18, STREAK_MIN = 9;
  const CLOUD_HIGH = 36, CLOUD_LOW = 14;
  // Camera distances, default elevations in radians and look-ahead per phase
  // On the final approach to the mark the plane's eye rises and looks down ahead so the rings show below
  const CHASE = { climbDist: 12, climbElevation: 0.3, climbAhead: 7, markDist: 3, markLift: 0.35, markAhead: 5, markDrop: 8, freeDist: 6.5, freeElevation: 1.05, freeAhead: 4, canopyDist: 8.5, canopyElevation: 0.5, canopyAhead: 2.5, eyeRate: 7, targetRate: 12 };
  const FOV_BASE = 50 * Math.PI / 180, FOV_FAST = 72 * Math.PI / 180;
  const TICKER_AT = { x: 0, y: 14, z: 0 };
  const DUST = models.particleGeometry("#a3874f", 0.1, 0);
  const DIRT = models.particleGeometry("#3a2a18", 0.12, 0);
  const BANANA_BIT = models.particleGeometry("#f5c542", 0.08, 0.5);
  const CLOUD_PUFF = models.particleGeometry("#eef3f7", 0.14, 0.2);
  // Sky, light and haze, resampled from the island's clock every frame
  const RENDER_OPTS = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3), direct: new Float32Array(3),
    light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 }, moon: { x: 0, y: 1, z: 0 }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, sunStrength: 1, moonStrength: 0, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002,
    time: 0, bloomStrength: 0.5, lights: new Float32Array(80), lightCount: 0, shadowCenter: { x: 0, y: 0, z: 0 }, shadowExtent: 34, fog: null, fogNear: 240, fogFar: 760
  };
  RENDER_OPTS.starMatrix[0] = RENDER_OPTS.starMatrix[4] = RENDER_OPTS.starMatrix[8] = 1;
  RENDER_OPTS.fog = RENDER_OPTS.horizon;
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const smooth = (t) => {
    const k = clamp(t, 0, 1);
    return k * k * (3 - 2 * k);
  };
  const mark = (name) => {
    performance.clearMarks(`ooga:${name}`);
    performance.mark(`ooga:${name}`);
  };
  // The board remembers the last pick for the page's life
  const selection = { racer: contributors.roster[0].name };

  // One visit's state, made in enter and dropped in leave
  let renderer, game, world, go, lootEnabled, testBananas, root, camera, island, hud, dhud, hooks, input, fx, controls, audio, clock, diver, plane, streaks, mound, hole;
  let phase = "board", jumpOpenUntil = 0, callStage = 0, markNear = 0, accumulator = 0, sceneTime = 0, flightTime = 0, landedAt = 0, score = 0, ringsHit = 0, pulled = false, jumpOpen = false, result = null;
  let meterTimer = 0, stateTimer = 0, hintTimer = 0;
  const placed = [];
  const clouds = [];
  const rings = [];
  const roof = { x: 0, y: 0, z: 0, ry: 0, ax: 0, az: 1 };
  const landingSpot = { x: 0, z: 0, y: 0 };
  // A drag swings the eye any distance round the subject; left alone for a moment in flight it eases back behind
  const CAM_RETURN_AFTER = 1.5, CAM_RETURN_RATE = 4;
  const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, warm: false, offset: 0, tilt: 0, dragAt: -9, boardYaw: 0, boardLift: 0, shake: 0 };
  const EYE = { x: 0, y: 0, z: 0 };
  // Where the diver's head points across the ground, kept through a head-down dive so the view never swings
  const HEAD = { x: 0, z: 1 };
  const ctrl = { pitch: 0, roll: 0, yaw: 0, flare: false };
  const NO_INPUT = { pitch: 0, roll: 0, yaw: 0, flare: false };
  const AUTO = { pitch: 0, roll: 0, yaw: 0, flare: false };
  const PATH = { x: 0, y: 0, z: 0 }, PATH_AHEAD = { x: 0, y: 0, z: 0 }, SEAT = new Float32Array(3);
  const planeState = { t: 0, speed: 0, yaw: 0, pitch: 0, roll: 0, angle: 0, alt: 0, vx: 0, vy: 0, vz: 0 };
  let jumpAngle = 0;
  const jumpT = ROLL_T + CLIMB_T;
  const dropScene = {
    id: "drop", renderOpts: RENDER_OPTS, root: null, camera: null, input: null, debug: null,
    get inMotion() {
      return phase === "climb" || phase === "air" || phase === "down" || phase === "lost" || fx.inMotion;
    }
  };

  // ---------- the plane's path ----------
  // Position along the climb at time t, written into out
  const pathAt = (t, out) => {
    const roll = Math.min(t, ROLL_T), accel = PLANE_SPEED / ROLL_T;
    let along = 0.5 * accel * roll * roll;
    if (t > ROLL_T) along += PLANE_SPEED * (t - ROLL_T);
    const sx = roof.x + roof.ax * along, sz = roof.z + roof.az * along;
    const rise = (JUMP_ALT - roof.y) * smooth((t - ROLL_T) / CLIMB_T);
    const y = roof.y + rise;
    if (t <= ROLL_T) return setVec(out, sx, y, sz);
    const angle = planeAngle(t);
    const hx = Math.sin(angle) * HELIX_R, hz = -Math.cos(angle) * HELIX_R;
    const k = smooth((t - ROLL_T) / BLEND_T);
    return setVec(out, lerp(sx, hx, k), y, lerp(sz, hz, k));
  };
  const planeAngle = (t) => Math.atan2(roof.x, -roof.z) + Math.PI + HELIX_W * Math.max(0, t - ROLL_T);
  const flyPlane = (dt) => {
    const s = planeState;
    s.t += dt;
    pathAt(s.t, PATH);
    pathAt(s.t + 0.02, PATH_AHEAD);
    s.vx = (PATH_AHEAD.x - PATH.x) / 0.02;
    s.vy = (PATH_AHEAD.y - PATH.y) / 0.02;
    s.vz = (PATH_AHEAD.z - PATH.z) / 0.02;
    const h = Math.hypot(s.vx, s.vz);
    s.speed = Math.hypot(h, s.vy);
    const yaw = h > 0.01 ? Math.atan2(s.vx, s.vz) : s.yaw;
    const yawRate = dt > 0 ? wrap(yaw - s.yaw) / dt : 0;
    s.yaw = yaw;
    s.pitch = damp(s.pitch, h > 0.01 ? -Math.atan2(s.vy, h) : 0, 6, dt);
    s.roll = damp(s.roll, clamp(-yawRate * s.speed / 14, -0.7, 0.7), 4, dt);
    s.angle = planeAngle(s.t);
    s.alt = PATH.y;
    setVec(plane.node.position, PATH.x, PATH.y, PATH.z);
    quat.fromEuler(plane.node.quaternion, s.pitch, s.yaw, s.roll);
    plane.prop.rotation.z += dt * (8 + s.speed * 2);
  };
  const parkPlane = () => {
    const s = planeState;
    s.t = 0;
    s.speed = s.roll = 0;
    s.pitch = dropModels.PARK_PITCH;
    s.yaw = roof.ry;
    s.vx = s.vy = s.vz = 0;
    s.angle = planeAngle(0);
    s.alt = roof.y;
    setVec(plane.node.position, roof.x, roof.y, roof.z);
    quat.fromEuler(plane.node.quaternion, s.pitch, roof.ry, 0);
  };
  // The diver rides in the seat while the plane flies
  const seatDiver = () => {
    const seat = plane.seat;
    quat.rotateVec(SEAT, plane.node.quaternion, seat.x, seat.y + 0.12, seat.z);
    setVec(diver.state.p, plane.node.position.x + SEAT[0], plane.node.position.y + SEAT[1], plane.node.position.z + SEAT[2]);
    quat.copy(diver.state.q, plane.node.quaternion);
  };

  // ---------- the course ----------
  // Rings hang along the fall a hands-off diver would make from the jump, bending toward the target
  const layCourse = () => {
    const rand = mulberry32(SEED + 41);
    jumpAngle = planeAngle(jumpT);
    pathAt(jumpT, PATH);
    pathAt(jumpT + 0.02, PATH_AHEAD);
    const vx = (PATH_AHEAD.x - PATH.x) / 0.02, vy = (PATH_AHEAD.y - PATH.y) / 0.02, vz = (PATH_AHEAD.z - PATH.z) / 0.02;
    // The target sits on the meadow on the jump's side of the island
    setVec(landingSpot, Math.sin(jumpAngle) * TARGET_R, 0, -Math.cos(jumpAngle) * TARGET_R);
    landingSpot.y = island.heightAt(landingSpot.x, landingSpot.z);
    // Fly the reference fall without frames: the diver turns its head toward the target and tracks at half stick,
    // easing off as it arrives over it; each ring sits on that path at its height
    diver.place(PATH.x, PATH.y, PATH.z, Math.atan2(vx, vz));
    diver.jump(vx, vy, vz, Math.atan2(vx, vz));
    const s = diver.state;
    let head = Math.atan2(vx, vz);
    // High up the reference aims beside the target and slides its aim onto it through a band of altitude, so the
    // course doglegs gently before it lines up
    const legX = landingSpot.x + Math.cos(jumpAngle) * AUTOPILOT.dogleg, legZ = landingSpot.z + Math.sin(jumpAngle) * AUTOPILOT.dogleg;
    for (let i = 0, guard = 0; i < RING_COUNT && guard < 6000; guard++) {
      const k = smooth((AUTOPILOT.doglegFrom - s.p.y) / (AUTOPILOT.doglegFrom - AUTOPILOT.doglegTo));
      const dx = lerp(legX, landingSpot.x, k) - s.p.x, dz = lerp(legZ, landingSpot.z, k) - s.p.z, dist = Math.hypot(dx, dz);
      if (Math.hypot(s.up[0], s.up[2]) > 0.3) head = Math.atan2(s.up[0], s.up[2]);
      const diff = wrap(Math.atan2(dx, dz) - head);
      AUTO.yaw = clamp(diff * AUTOPILOT.yaw, -1, 1);
      AUTO.pitch = Math.abs(diff) < 0.6 ? AUTOPILOT.pitch * Math.min(1, dist / AUTOPILOT.settle) : 0;
      diver.substep(FIXED, AUTO);
      const y = RING_TOP - i * RING_STEP;
      if (s.p.y > y) continue;
      const ring = rings[i];
      const wander = RING_WANDER * i / (RING_COUNT - 1), a = rand() * Math.PI * 2;
      ring.x = s.p.x + Math.cos(a) * wander * rand();
      ring.z = s.p.z + Math.sin(a) * wander * rand();
      ring.y = y;
      ring.r = lerp(RING_R0, RING_R1, i / (RING_COUNT - 1));
      i++;
    }
    for (const ring of rings) {
      setVec(ring.node.position, ring.x, ring.y, ring.z);
      setVec(ring.node.scale, ring.r, ring.r, ring.r);
    }
    diver.hide();
  };
  const resetRings = () => {
    for (const ring of rings) {
      ring.hit = false;
      ring.node.glow = 1;
      setVec(ring.node.scale, ring.r, ring.r, ring.r);
    }
  };
  let ringIndex = 0;
  const hitRing = (ring, i) => {
    ring.hit = true;
    ring.node.glow = 0.2;
    ringsHit++;
    score += SCORE.ring;
    fx.burst(ring.x, ring.y, ring.z, 14, CONFETTI, 3);
    audio.cues.ring();
    dhud.center(`+${SCORE.ring}`, 700);
    dhud.notice(i === RING_COUNT - 1 ? "last ring!" : `ring ${ringsHit}`, 1200);
    cam.shake = Math.max(cam.shake, 0.25);
    addTween({
      dur: 0.5, ease: math.ease.outBack, update: (k) => {
        const s = ring.r * (1 + 0.18 * Math.sin(k * Math.PI));
        setVec(ring.node.scale, s, s, s);
      }
    });
  };
  // A substep's segment crossing a ring's plane inside its radius counts
  const checkRings = () => {
    const s = diver.state, p = s.p, pp = s.pp;
    while (ringIndex < RING_COUNT && rings[ringIndex].y > pp.y) ringIndex++;
    while (ringIndex < RING_COUNT && rings[ringIndex].y > p.y) {
      const ring = rings[ringIndex];
      const t = (pp.y - ring.y) / Math.max(1e-6, pp.y - p.y);
      const qx = pp.x + (p.x - pp.x) * t, qz = pp.z + (p.z - pp.z) * t;
      if ((qx - ring.x) ** 2 + (qz - ring.z) ** 2 < ring.r * ring.r) hitRing(ring, ringIndex);
      else {
        audio.cues.miss();
        setVec(ring.node.scale, ring.r, ring.r, ring.r);
      }
      ringIndex++;
    }
  };

  // ---------- ground ----------
  // The island's walkable surface, the mound of bananas at its middle, nothing off the edge
  const groundAt = (x, z) => {
    if (!island.onLand(x, z)) return -Infinity;
    const r = Math.hypot(x, z);
    if (r < mound.node.scale.x) return mound.y + mound.height * Math.max(0, 1 - (r / mound.node.scale.x) ** 2);
    if (r < mound.radius) return mound.y;
    return island.surfaceAt(x, z);
  };
  const onBanana = (x, z) => Math.hypot(x, z) < mound.radius;

  // ---------- flow ----------
  const toBoard = () => {
    phase = "board";
    parkPlane();
    diver.place(roof.x, roof.y, roof.z, roof.ry);
    seatDiver();
    resetRings();
    ringIndex = 0;
    score = ringsHit = 0;
    pulled = jumpOpen = false;
    callStage = markNear = 0;
    jumpOpenUntil = 0;
    result = null;
    flightTime = 0;
    streaks.node.instanceCount = 0;
    streaks.node.visible = false;
    hole.visible = false;
    cam.boardYaw = cam.boardLift = 0;
    cam.offset = cam.tilt = 0;
    cam.warm = false;
    dhud.show("board");
    hud.el.act.hidden = true;
    hud.setSubtitle("Ooga Drop · the roof");
    boardView();
  };
  const startFlight = () => {
    toBoard();
    phase = "climb";
    dhud.show("flight");
    dhud.setRings(0, RING_COUNT);
    dhud.setChute("pack");
    dhud.setTime(0);
    hud.el.act.hidden = !COARSE;
    hud.setAct("Jump!");
    hud.setSubtitle("Ooga Drop · climbing");
    window.clearTimeout(hintTimer);
    hud.hint("", 0);
    dhud.notice("hold Space to hurry the climb", 2600);
    fx.say(diver.cave, "Ooga fly!", 1.6);
  };
  const jump = () => {
    if (phase !== "climb" || !jumpOpen) return false;
    seatDiver();
    const s = planeState;
    diver.jump(s.vx, s.vy, s.vz, s.yaw);
    phase = "air";
    accumulator = 0;
    ringIndex = 0;
    flightTime = 0;
    dhud.center("", 0);
    dhud.notice("", 1);
    cam.offset = cam.tilt = 0;
    HEAD.x = Math.sin(s.yaw);
    HEAD.z = Math.cos(s.yaw);
    hud.setAct("Pull!");
    hud.setSubtitle("Ooga Drop · freefall");
    fx.say(diver.cave, "OOGA GERONIMO!", 1.8);
    audio.cues.jump();
    cam.warm = false;
    return true;
  };
  const deploy = () => {
    if (phase !== "air" || !diver.deploy()) return false;
    dhud.setChute("canopy");
    hud.setAct("Flare");
    hud.setSubtitle("Ooga Drop · under canopy");
    dhud.center("PULL", 700);
    dhud.notice("", 1);
    cam.offset = cam.tilt = 0;
    audio.cues.pull();
    audio.cues.open();
    cam.shake = Math.max(cam.shake, 0.4);
    fx.burst(diver.state.p.x, diver.state.p.y + 1.5, diver.state.p.z, 8, [CLOUD_PUFF], 2);
    return true;
  };
  const landingLabel = { stand: "Stood it up", stumble: "Stumbled", tumble: "Tumbled", hole: "Went through the ground", pancake: "Flattened", lost: "Lost in the clouds" };
  const CRASHES = { tumble: "Ooga rolled to a stop. The ground won.", hole: "Ooga went through the meadow. Ooga is a hole now.", pancake: "Ooga is a pancake now." };
  const crashed = (landing) => landing === "tumble" || landing === "hole" || landing === "pancake";
  const finish = (landing, dist) => {
    phase = "results";
    const accuracy = landing === "lost" || crashed(landing) ? 0 : Math.round(SCORE.land * clamp(1 - dist / SCORE.landRadius, 0, 1));
    const soft = landing === "stand" ? SCORE.stand : landing === "stumble" ? SCORE.stumble : 0;
    const banana = landing !== "lost" && !crashed(landing) && onBanana(diver.state.p.x, diver.state.p.z) ? SCORE.banana : 0;
    score += accuracy + soft + banana;
    const medal = dhud.medalFor(score);
    const improved = game.recordDrop({ score, rings: ringsHit, ringTotal: RING_COUNT, landing });
    result = { landing, dist, accuracy, soft, banana, score, medal, improved };
    const rows = [["Rings", `${ringsHit} × ${SCORE.ring} = ${ringsHit * SCORE.ring}`], ["Landing", landing === "lost" ? landingLabel.lost : `${landingLabel[landing]} · ${dist.toFixed(1)} from the target · ${accuracy}`], ["Touchdown", `${soft}`]];
    if (banana) rows.push(["Banana landing", `${banana}`]);
    rows.push(["Time", dhud.formatTime(flightTime * 1000)], ["Score", `${score}${medal ? ` · ${medal.toUpperCase()}` : ""}`]);
    dhud.results(rows, crashed(landing) ? CRASHES[landing] : landing === "lost" ? "The island went by. Try aiming at it." : `${medal ? `${medal.toUpperCase()} drop` : "A drop"}${improved ? " · new best" : ""}`);
    hud.el.act.hidden = true;
    hud.setSubtitle("Ooga Drop · landed");
    if (medal) audio.cues.finish();
    if (medal === "gold") fx.say(diver.cave, "OOGA CHAMPION!", 3);
    else if (landing === "stand") fx.say(diver.cave, "Ooga land good.", 2);
  };
  const touchdown = (groundY) => {
    const landing = diver.land(groundY);
    phase = "down";
    landedAt = sceneTime;
    const p = diver.state.p, crash = crashed(landing);
    fx.burst(p.x, groundY + 0.1, p.z, crash ? 14 : 6, [landing === "hole" ? DIRT : DUST], crash ? 2.4 : 1.2);
    if (landing === "hole") {
      setVec(hole.position, p.x, groundY + 0.01, p.z);
      hole.visible = true;
    }
    if (onBanana(p.x, p.z)) fx.burst(p.x, groundY + 0.3, p.z, 10, [BANANA_BIT], 2);
    dhud.center(landing === "stand" ? (onBanana(p.x, p.z) ? "GREAT" : "NICE") : landing === "hole" ? "THUD" : landing === "pancake" ? "SPLAT" : "CRASH", 1400);
    dhud.setChute("down");
    cam.shake = Math.max(cam.shake, crash ? 0.9 : 0.3);
    audio.cues[landing]();
    hud.el.act.hidden = true;
    if (crash) fx.say(diver.cave, landing === "hole" ? "Dark in here." : landing === "pancake" ? "Ooga flat." : "Ow. Ooga bones.", 2);
    else if (onBanana(p.x, p.z)) fx.say(diver.cave, "BANANA LANDING!", 2);
  };
  const lost = () => {
    phase = "lost";
    landedAt = sceneTime;
    dhud.center("LOST", 1400);
    audio.cues.lost();
    fx.say(diver.cave, "Where island go?", 2);
    hud.el.act.hidden = true;
  };
  // Space or the act button, by phase
  const act = () => {
    if (phase === "board") {
      startFlight();
      return true;
    }
    if (phase === "climb") {
      if (jump()) return true;
      dhud.notice("wait for the mark", 900);
      return false;
    }
    if (phase === "air") return deploy();
    if (phase === "results") {
      startFlight();
      return true;
    }
    return false;
  };

  // ---------- per frame ----------
  const readInput = () => {
    const a = controls.read();
    ctrl.pitch = clamp(a.y - (COARSE ? 0 : a.pitch), -1, 1);
    ctrl.roll = a.x;
    ctrl.yaw = a.yaw;
    ctrl.flare = a.up > 0;
    return a;
  };
  const simulate = (dt) => {
    accumulator = Math.min(accumulator + dt, FIXED * MAX_SUBSTEPS);
    while (accumulator >= FIXED && phase === "air") {
      accumulator -= FIXED;
      diver.substep(FIXED, ctrl);
      flightTime += FIXED;
      const p = diver.state.p;
      if (diver.state.phase === "free") checkRings();
      const ground = groundAt(p.x, p.z);
      if (p.y - diver.FOOT <= ground) touchdown(ground);
      else if (p.y < LOST_Y && ground === -Infinity) lost();
    }
  };
  // Air rushing past: lines fixed in the world inside a box round the diver, reseeded ahead as they fall behind
  const updateStreaks = () => {
    const s = diver.state, v = s.v, speed = s.speed, node = streaks.node;
    if (phase !== "air" || speed < STREAK_MIN) {
      node.instanceCount = 0;
      node.visible = false;
      return;
    }
    const p = s.p, data = node.instanceData;
    const dx = v.x / speed, dy = v.y / speed, dz = v.z / speed;
    // A perpendicular pair for the line's cross section
    const ax = Math.abs(dy) < 0.9 ? 0 : 1, ay = Math.abs(dy) < 0.9 ? 1 : 0;
    let px = ay * dz, py = -ax * dz, pz = ax * dy - ay * dx;
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl;
    py /= pl;
    pz /= pl;
    const qx = dy * pz - dz * py, qy = dz * px - dx * pz, qz = dx * py - dy * px;
    const len = clamp(speed * 0.09, 0.4, 3.2);
    for (let i = 0; i < STREAKS; i++) {
      let x = streaks.x[i] - p.x, y = streaks.y[i] - p.y, z = streaks.z[i] - p.z;
      // Behind the diver, or outside the box, the streak reappears ahead
      if (x * dx + y * dy + z * dz < -4 || Math.abs(x) > STREAK_BOX || Math.abs(y) > STREAK_BOX || Math.abs(z) > STREAK_BOX) {
        const ahead = 4 + Math.random() * (STREAK_BOX - 4), a = Math.random() * Math.PI * 2, r = Math.random() * 12;
        x = dx * ahead + (px * Math.cos(a) + qx * Math.sin(a)) * r;
        y = dy * ahead + (py * Math.cos(a) + qy * Math.sin(a)) * r;
        z = dz * ahead + (pz * Math.cos(a) + qz * Math.sin(a)) * r;
        streaks.x[i] = p.x + x;
        streaks.y[i] = p.y + y;
        streaks.z[i] = p.z + z;
      }
      const o = i * 20;
      data[o] = px; data[o + 1] = py; data[o + 2] = pz; data[o + 3] = 0;
      data[o + 4] = qx; data[o + 5] = qy; data[o + 6] = qz; data[o + 7] = 0;
      data[o + 8] = dx * len; data[o + 9] = dy * len; data[o + 10] = dz * len; data[o + 11] = 0;
      data[o + 12] = streaks.x[i]; data[o + 13] = streaks.y[i]; data[o + 14] = streaks.z[i]; data[o + 15] = 1;
      data[o + 16] = Math.min(1, (speed - STREAK_MIN) / 12); data[o + 17] = 0; data[o + 18] = 0; data[o + 19] = 0;
    }
    node.instanceCount = STREAKS;
    node.visible = true;
    node.instanceVersion++;
  };
  // The board view stands off the roof looking at the plane; a drag swings it round
  const boardView = () => {
    const c = Math.cos(roof.ry + cam.boardYaw), s = Math.sin(roof.ry + cam.boardYaw);
    cam.tx = roof.x;
    cam.ty = roof.y + 1.4;
    cam.tz = roof.z;
    cam.x = roof.x + s * 13 + c * 4;
    cam.z = roof.z + c * 13 - s * 4;
    cam.y = roof.y + 4.2 + cam.boardLift;
    setVec(camera.position, cam.x, cam.y, cam.z);
    setVec(camera.target, cam.tx, cam.ty, cam.tz);
    camera.fov = FOV_BASE;
  };
  // The eye sits behind the subject's heading at a distance and elevation; a drag swings it round both ways, 0 puts it back
  const orbitEye = (px, py, pz, fx, fz, dist, elevation) => {
    const yaw = Math.atan2(fx, fz) + Math.PI + cam.offset;
    const el = clamp(elevation + cam.tilt, -1.2, 1.5);
    EYE.x = px + Math.sin(yaw) * Math.cos(el) * dist;
    EYE.y = py + Math.sin(el) * dist;
    EYE.z = pz + Math.cos(yaw) * Math.cos(el) * dist;
    return EYE;
  };
  const updateCamera = (dt) => {
    const s = diver.state, p = s.p;
    let tx, ty, tz, fast = 0, eye = EYE;
    if (input.orbiting) cam.dragAt = sceneTime;
    if ((phase === "climb" || phase === "air") && sceneTime - cam.dragAt > CAM_RETURN_AFTER) {
      cam.offset = damp(cam.offset, 0, CAM_RETURN_RATE, dt);
      cam.tilt = damp(cam.tilt, 0, CAM_RETURN_RATE, dt);
    }
    if (phase === "climb") {
      const ps = planeState, pp = plane.node.position, h = Math.hypot(ps.vx, ps.vz);
      const fx0 = h > 0.5 ? ps.vx / h : roof.ax, fz0 = h > 0.5 ? ps.vz / h : roof.az;
      const near = markNear, ahead = CHASE.climbAhead + near * CHASE.markAhead;
      eye = orbitEye(pp.x, pp.y, pp.z, fx0, fz0, CHASE.climbDist + near * CHASE.markDist, CHASE.climbElevation + near * CHASE.markLift);
      tx = pp.x + fx0 * ahead;
      ty = pp.y + 0.6 - near * CHASE.markDrop;
      tz = pp.z + fz0 * ahead;
    } else if (phase === "air" && s.phase === "free") {
      // Behind the head and above; the head's ground direction steers the view, a slide only moves it
      const speed = Math.max(1, s.speed), hl = Math.hypot(s.up[0], s.up[2]);
      if (hl > 0.25) {
        HEAD.x = damp(HEAD.x, s.up[0] / hl, 6, dt);
        HEAD.z = damp(HEAD.z, s.up[2] / hl, 6, dt);
      }
      eye = orbitEye(p.x, p.y, p.z, HEAD.x, HEAD.z, CHASE.freeDist, CHASE.freeElevation);
      tx = p.x + s.v.x / speed * CHASE.freeAhead;
      ty = p.y + s.v.y / speed * CHASE.freeAhead;
      tz = p.z + s.v.z / speed * CHASE.freeAhead;
      fast = clamp((speed - 18) / 27, 0, 1);
    } else if (phase === "air" || phase === "lost") {
      const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
      eye = orbitEye(p.x, p.y, p.z, hx, hz, CHASE.canopyDist, CHASE.canopyElevation);
      tx = p.x + hx * CHASE.canopyAhead;
      ty = p.y - 0.6;
      tz = p.z + hz * CHASE.canopyAhead;
    } else {
      // Down or on the results the eye stays put and only watches
      EYE.x = cam.x;
      EYE.y = cam.y;
      EYE.z = cam.z;
      tx = p.x;
      ty = p.y;
      tz = p.z;
    }
    let ex = eye.x, ey = eye.y, ez = eye.z;
    if (island.onLand(ex, ez)) ey = Math.max(ey, island.surfaceAt(ex, ez) + 0.9);
    if (!cam.warm) {
      cam.x = ex;
      cam.y = ey;
      cam.z = ez;
      cam.tx = tx;
      cam.ty = ty;
      cam.tz = tz;
      cam.warm = true;
    } else {
      cam.x = damp(cam.x, ex, CHASE.eyeRate, dt);
      cam.y = damp(cam.y, ey, CHASE.eyeRate, dt);
      cam.z = damp(cam.z, ez, CHASE.eyeRate, dt);
      cam.tx = damp(cam.tx, tx, CHASE.targetRate, dt);
      cam.ty = damp(cam.ty, ty, CHASE.targetRate, dt);
      cam.tz = damp(cam.tz, tz, CHASE.targetRate, dt);
    }
    cam.shake = Math.max(0, cam.shake - dt * 3);
    const jolt = cam.shake * cam.shake * 0.35;
    setVec(camera.position, cam.x + Math.sin(sceneTime * 43) * jolt, cam.y + Math.sin(sceneTime * 37) * jolt, cam.z + Math.cos(sceneTime * 41) * jolt);
    setVec(camera.target, cam.tx, cam.ty, cam.tz);
    camera.fov = damp(camera.fov, lerp(FOV_BASE, FOV_FAST, fast), 5, dt);
  };
  const updateLighting = () => {
    const p = diver.state.p;
    const low = phase !== "board" && p.y < 60;
    setVec(RENDER_OPTS.shadowCenter, low ? p.x : 0, low ? Math.max(0, p.y - 4) : 0, low ? p.z : 0);
    RENDER_OPTS.time = sceneTime;
  };
  // The engine follows the plane and fades as it flies off; the wind follows the diver; everything is quiet on the boards
  let flaringWas = false;
  const updateAudio = (dt) => {
    if (phase === "board" || phase === "results") {
      audio.quiet();
      return;
    }
    const a = audio.state, s = diver.state, pp = plane.node.position;
    a.planeSpeed = planeState.speed;
    a.planeDistance = Math.hypot(pp.x - camera.position.x, pp.y - camera.position.y, pp.z - camera.position.z);
    a.speed = s.speed;
    a.falling = phase === "air" && s.phase === "free" || phase === "lost" ? 1 : 0;
    a.canopy = (phase === "air" || phase === "lost") && (s.phase === "open" || s.phase === "canopy") ? 1 : 0;
    a.flaring = s.flaring ? 1 : 0;
    if (s.flaring && !flaringWas) audio.cues.flare();
    flaringWas = s.flaring;
    audio.update(dt);
  };
  const toggleMute = () => {
    audio.setMuted(!audio.muted);
    dhud.el.mute.setAttribute("aria-pressed", String(audio.muted));
    hud.toast(audio.muted ? "Sound off" : "Sound on");
  };
  const onGesture = () => audio.unlock();
  const updateMeter = () => {
    hud.setMeter(world.level, METER_CAPACITY, phase === "air" ? `${ringsHit} of ${RING_COUNT} rings` : "stable");
  };
  const update = (dt, elapsed) => {
    sceneTime = elapsed;
    const hour = clock.read();
    daylight.sample(hour, RENDER_OPTS, clock.dayOfYear, islandLatitude, clock.continuousDay);
    const a = readInput();
    if (phase === "climb") {
      // Holding Space hurries the climb, never the circling at height
      const s = planeState;
      flyPlane(dt * (a.up > 0 && s.alt < JUMP_ALT - 1 && callStage === 0 ? SKIP_SCALE : 1));
      seatDiver();
      const toMark = wrap(jumpAngle - s.angle);
      // Radians left to the next mark: the first lap is still climbing to it, after that it is a lap round
      const left = s.t < jumpT ? (jumpT - s.t) * HELIX_W : (toMark + Math.PI * 2) % (Math.PI * 2);
      markNear = damp(markNear, left < JUMP_GET_READY ? 1 : 0, 1.5, dt);
      const atMark = s.alt >= JUMP_ALT - 1 && Math.abs(toMark) < JUMP_WINDOW;
      if (atMark && !jumpOpen) jumpOpenUntil = sceneTime + JUMP_GRACE;
      const open = atMark || sceneTime < jumpOpenUntil;
      // Two calls as the mark comes round, the call at the mark, and the way home when it passes
      if (!open && left > JUMP_WINDOW) {
        if (callStage < 1 && left < JUMP_GET_READY) {
          callStage = 1;
          dhud.center("GET READY!", 1300);
          dhud.notice("the mark is coming round", 0);
          fx.say(diver.cave, "Ooga ready!", 1.4);
        }
        if (callStage < 2 && left < JUMP_SOON) {
          callStage = 2;
          dhud.center("JUMP SOON!", 1300);
          dhud.notice("Be ready to jump soon! Almost at the mark!", 0);
        }
      }
      if (open && !jumpOpen) {
        dhud.center("JUMP", 0);
        dhud.notice("Space · jump", 0);
        audio.cues.mark();
        fx.say(diver.cave, "Now! Ooga now!", 1.4);
      } else if (!open && jumpOpen) {
        callStage = 0;
        dhud.center("", 0);
        dhud.notice("Flying back around, wait for the mark", 3000);
      }
      jumpOpen = open;
      // A Space still held from the hurry means go
      if (jumpOpen && a.up > 0) jump();
    } else if (phase === "air") {
      simulate(dt);
      const s = diver.state;
      if (!pulled && s.phase === "free" && s.p.y < PULL_ALT) {
        pulled = true;
        dhud.center("PULL", 0);
        dhud.notice("Space · chute", 0);
      }
      if (s.phase === "canopy") dhud.setChute(s.flaring ? "flare" : "canopy");
    } else if (phase === "down" || phase === "lost") {
      if (phase === "lost") {
        diver.substep(dt, NO_INPUT);
        flightTime += dt;
      }
      if (sceneTime - landedAt > (phase === "lost" ? LOST_T : LANDED_T)) {
        const p = diver.state.p;
        finish(phase === "lost" ? "lost" : diver.state.landing, Math.hypot(p.x - landingSpot.x, p.z - landingSpot.z));
      }
    }
    if (phase === "board") plane.prop.rotation.z += dt * 3;
    if (phase !== "climb" && phase !== "board" && planeState.t > 0) flyPlane(dt);
    diver.pose(dt, elapsed, ctrl);
    if (phase === "air" && diver.state.phase === "free" && ringIndex < RING_COUNT && !rings[ringIndex].hit) {
      const ring = rings[ringIndex], k = ring.r * (1 + NEXT_RING_PULSE * (0.5 + 0.5 * Math.sin(sceneTime * 5)));
      setVec(ring.node.scale, k, k, k);
    }
    updateStreaks();
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i], p = c.node.position;
      p.x += c.speed * dt;
      if (p.x > c.wrap) p.x -= c.wrap * 2;
    }
    if (phase === "board") boardView();
    else updateCamera(dt);
    updateLighting();
    updateAudio(dt);
    fx.update(dt);
    stepTweens(dt);
    if (phase === "air" || phase === "down" || phase === "lost") {
      const s = diver.state;
      const ground = groundAt(s.p.x, s.p.z);
      dhud.setAlt(s.p.y - diver.FOOT - (ground === -Infinity ? 0 : Math.max(0, ground)));
      dhud.setSpeed(Math.max(0, -s.v.y));
      dhud.setRings(ringsHit, RING_COUNT);
      dhud.setTime(flightTime * 1000);
    } else if (phase === "climb") {
      dhud.setAlt(planeState.alt);
      dhud.setSpeed(0);
    }
    meterTimer -= dt;
    if (meterTimer <= 0) {
      meterTimer = 0.25;
      updateMeter();
    }
  };
  const NO_EXTRA = () => { };
  const overlay = (dt) => fx.drawOverlay(dt, NO_EXTRA);

  // ---------- donations ----------
  const onDonation = (donation) => {
    game.recordDonation(donation);
    const bananas = gameMod.bananasFor(donation.sats);
    world.level = Math.min(pileMod.MAX_BANANAS, world.level + bananas);
    const who = donation.handle ? `@${donation.handle}` : "anon";
    const loot = lootEnabled ? game.lootFor(donation) : null;
    hud.toast(`+${gameMod.formatLarge(donation.sats)} sats · ${bananas} banana${bananas > 1 ? "s" : ""} · ${who}${loot ? ` · ${loot.tier} ${loot.item.name}` : ""}`);
    fx.showTicker(`THANKS ${donation.handle ? "@" + donation.handle.toUpperCase() : "ANON"} · ${bananas} BANANAS`, 4.5);
    const p = diver.state.p;
    if (diver.body.visible) fx.burst(p.x, p.y + 1.2, p.z, 20, CONFETTI, 2.2);
    if (loot) {
      game.addItem({ item: loot.item, tier: loot.tier, donationId: donation.id });
      renderLocker();
    }
    hud.setStats(game.state);
    meterTimer = 0;
  };
  const renderLocker = () => hud.renderInventory(game.state.inventory, game.assignedTo, () => null);

  // ---------- actions and keys ----------
  const onLootCleared = () => {
    if (!lootEnabled) return;
    renderLocker();
    hud.toast("Loot locker cleared");
  };
  const demoTip = (sats) => onDonation({ id: `demo-${Date.now()}`, sats, handle: game.state.handle, message: game.state.message, at: Date.now() });
  const onKey = (e) => {
    if (e.key === "Escape") {
      if (phase === "board") go("hub");
      else toBoard();
    }
    if (e.key === "Enter" && (phase === "board" || phase === "results")) startFlight();
    if (e.key === "0") cam.offset = cam.tilt = 0;
    if (e.key === "m" || e.key === "M") toggleMute();
    if (e.key === "b" || e.key === "B") {
      world.level = Math.min(pileMod.MAX_BANANAS, world.level + testBananas);
      hud.toast(`+${testBananas} test bananas`);
    }
    if (e.key === "l" || e.key === "L") demoTip(120000);
  };
  const tooltipFor = (hit) => hit.owner.kind === "diver" ? `${diver.cave.traits.name} · ${phase === "board" ? "ready to fly" : phase === "air" ? "falling" : "your Ooga"}` : "";
  const pickDiver = (name) => {
    selection.racer = name;
    buildDiver();
    toBoard();
  };
  // The diver is rebuilt for the picked contributor; its heads are the geometry kept live off the graph
  const buildDiver = () => {
    if (diver) {
      for (const key of ["torso", "head"]) input.remove(diver.cave.parts[key]);
      diver.dispose();
    }
    diver = skydiver.create({ root, traits: contributors.traitsFor(selection.racer) });
    for (const key of ["torso", "head"]) input.add(diver.cave.parts[key], { kind: "diver", priority: 1 });
  };

  // ---------- scene contract ----------
  const enter = (ctx) => {
    ({ renderer, game, world, go, lootEnabled, testBananas } = ctx);
    camera = createCamera({ fov: 50, near: 0.4, far: 820 });
    root = createNode();
    clock = daylight.createClock({ hour: hourParam, daylen: daylenParam, day: dayParam, now: new Date() });
    island = terrain.island({ seed: SEED });
    hud = hudMod.create({ roster: contributors.roster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled });
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    fx = fxMod.create({ root, renderer, overlay: ctx.overlay, tickerAt: TICKER_AT });
    // The island itself, resident from the hub, and the mound of bananas at its middle
    const place = (node) => {
      addChild(root, node);
      placed.push(node);
      return node;
    };
    place(createNode({ geometry: island.geometry }));
    const level = Math.floor(world.level), footprint = pileMod.footprintFor(level, 0.45);
    const growth = level <= pileMod.DISK_BANANAS ? pileMod.PACKING_HEIGHT * level / pileMod.DISK_BANANAS : pileMod.footprintFor(level, 1) * pileMod.PACKING_HEIGHT;
    const core = place(createNode({ position: { x: 0, y: 0.36, z: 0 }, scale: { x: footprint, y: 0.48 * growth, z: footprint }, geometry: models.bananaPileCoreGeometry(0.45 * 6, 0.48 * 6, 0.45), visible: level > 0 }));
    const slab = place(createNode({ geometry: hubModels.altarSlab(), depthBias: 0.15 }));
    setVec(slab.scale, footprint + 0.3, 0.34, footprint + 0.3);
    // Small piles still count a landing on the dais as a banana landing
    mound = { node: core, radius: Math.max(2.4, footprint + 0.2), height: 0.48 * growth * 0.88, y: 0.36 };
    // Clouds above the island and a floor of them far below
    const rand = mulberry32(SEED + 77);
    for (let i = 0; i < CLOUD_HIGH + CLOUD_LOW; i++) {
      const low = i >= CLOUD_HIGH;
      const wrapAt = low ? 160 : 150;
      const y = low ? -52 - rand() * 26 : 24 + rand() * 270;
      const s = low ? 3 + rand() * 2 : 1.1 + rand() * 1.2;
      const node = createNode({ position: { x: lerp(-wrapAt, wrapAt, rand()), y, z: low ? lerp(-140, 140, rand()) : (rand() < 0.5 ? -1 : 1) * lerp(38, 140, rand()) }, scale: { x: s, y: s, z: s }, geometry: hubModels.cloud(i % 3) });
      place(node);
      clouds.push({ node, speed: 0.3 + rand() * 0.5, wrap: wrapAt });
    }
    // The roof spot from the hub's own mouth, the plane parked on it, the windsock beside it
    const mouth = island.mouths.find((m) => m.id === "c9");
    dropModels.roofSpot(island, mouth, roof);
    plane = dropModels.plane();
    plane.node.quaternion = quat.create();
    place(plane.node);
    place(createNode({ position: { x: roof.x + Math.cos(roof.ry) * 3.2 + roof.ax * 0.6, y: roof.y, z: roof.z - Math.sin(roof.ry) * 3.2 + roof.az * 0.6 }, geometry: dropModels.windsock() }));
    const signX = mouth.x + roof.ax * dropModels.SIGN_AT.z + Math.cos(roof.ry) * dropModels.SIGN_AT.x, signZ = mouth.z + roof.az * dropModels.SIGN_AT.z - Math.sin(roof.ry) * dropModels.SIGN_AT.x;
    place(createNode({ position: { x: signX, y: island.surfaceAt(signX, signZ), z: signZ }, rotation: { x: 0, y: roof.ry, z: 0 }, geometry: dropModels.roofSign() }));
    // The course: ten hoops sharing one geometry, and the target on the meadow
    for (let i = 0; i < RING_COUNT; i++) {
      const node = place(createNode({ geometry: dropModels.hoop() }));
      rings.push({ node, x: 0, y: 0, z: 0, r: 1, hit: false });
    }
    const targetNode = place(createNode({ geometry: dropModels.target() }));
    hole = place(createNode({ geometry: dropModels.hole(), visible: false }));
    streaks = { node: place(createNode({ geometry: dropModels.streak(), instanceData: new Float32Array(STREAKS * 20), instanceCount: 0, instanceVersion: 0, fixedInstanceCapacity: true, visible: false })), x: new Float32Array(STREAKS), y: new Float32Array(STREAKS), z: new Float32Array(STREAKS) };
    mark("drop world");
    // An Ooga walked or tapped into the plane flies it
    if (world.pilot) {
      selection.racer = world.pilot;
      world.pilot = null;
    }
    buildDiver();
    layCourse();
    setVec(targetNode.position, landingSpot.x, landingSpot.y + 0.02, landingSpot.z);
    dhud = dropHud.create({ roster: contributors.roster, best: () => game.state.drop.best, onPick: pickDiver });
    dhud.selection.racer = selection.racer;
    dhud.buildBoard((name) => contributors.stateFor(contributors.roster.find((c) => c.name === name)));
    controls = controlsMod.create({ move: document.getElementById("joy-move"), look: document.getElementById("joy-look"), boost: hud.el.act, chord: ctx.canvas, onAction: act });
    audio = dropAudio.create();
    dhud.el.mute.setAttribute("aria-pressed", String(audio.muted));
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    const donationRequest = donations.createRequest(game.state);
    qr.drawTo(hud.el.qr, donationRequest.url, { quiet: 3, dark: "#000000", light: "#f3efe4" });
    hud.setDonationUrl(donationRequest.url);
    hud.setIdentity(game.state);
    hud.onIdentityChange(({ handle, message }) => {
      game.setIdentity({ handle: donations.sanitize(handle, donations.HANDLE_MAX), message: donations.sanitize(message, donations.MESSAGE_MAX) });
      hud.setIdentity(game.state);
    });
    hud.onAssign((entryId, name) => {
      if (game.assign(entryId, name)) renderLocker();
    });
    hud.onUnassign((name) => {
      game.unassign(name);
      renderLocker();
    });
    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit) hud.tooltip.show(tooltipFor(hit), p.x, p.y);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => hud.tooltip.show(tooltipFor(hit), p.x, p.y),
      onTap: (hit) => {
        if (hit && hit.owner.kind === "diver" && phase !== "board") fx.say(diver.cave, phase === "air" ? "Ooga busy falling!" : "Ooga!", 1.2);
      },
      onOrbit: (dx, dy) => {
        if (phase === "board") {
          cam.boardYaw = wrap(cam.boardYaw - dx * 5e-3);
          cam.boardLift = clamp(cam.boardLift + dy * 0.02, -2, 6);
        } else {
          cam.offset = wrap(cam.offset - dx * 4e-3);
          cam.tilt = clamp(cam.tilt + dy * 3.5e-3, -1.4, 1.4);
          cam.dragAt = sceneTime;
        }
      },
      onZoom: () => { }
    });
    hud.onAction((action) => {
      if (action === "drop-start" || action === "drop-again") startFlight();
      else if (action === "drop-board") toBoard();
      else if (action === "leave") go("hub");
      else if (action === "act") act();
      else if (action === "mute") toggleMute();
      else if (action === "tip") demoTip(1200);
      else if (action === "tip-legendary") demoTip(120000);
      else if (action === "clear-loot") {
        game.clearLoot();
        onLootCleared();
      } else if (action === "reset") {
        game.resetAll();
        location.reload();
      }
    });
    for (const c of contributors.roster) hud.setRosterRow(c.name, contributors.stateFor(c), contributors.ageLabel(c));
    if (lootEnabled) renderLocker();
    hud.setStats(game.state);
    hud.el.sheet.dataset.open = "false";
    dhud.el.help.textContent = COARSE ? "Left stick pitches and rolls · right stick turns · the button jumps, pulls and flares" : "W S pitch · A D roll · Q E turn · Space jumps, pulls the chute · S flares · drag to look";
    meterTimer = 0;
    toBoard();
    stateTimer = window.setInterval(() => fx.trimPool(), 6e4);
    hintTimer = window.setTimeout(() => hud.hint(COARSE ? "Pick an Ooga, then Fly!" : "Pick an Ooga, then Fly! (Enter)"), 1200);
    Object.assign(dropScene, {
      root, camera, input,
      debug: {
        hud, demoTip, trimPool: fx.trimPool, camera, controls, island, cavemen: null, crates: null,
        get audio() {
          return audio;
        },
        get diver() {
          return diver;
        },
        get plane() {
          return { node: plane.node, prop: plane.prop, state: planeState };
        },
        get course() {
          return { rings, target: landingSpot, jumpAngle };
        },
        get renderOpts() {
          return RENDER_OPTS;
        },
        drop: {
          get phase() {
            return phase;
          },
          get score() {
            return score;
          },
          get ringsHit() {
            return ringsHit;
          },
          get result() {
            return result;
          },
          get jumpOpen() {
            return jumpOpen;
          },
          get cam() {
            return cam;
          },
          get sceneTime() {
            return sceneTime;
          },
          get streaks() {
            return streaks.node.instanceCount;
          },
          selection, start: startFlight, toBoard, jump, deploy, finish,
          // Run the clock forward without frames: the climb, then substeps in the air
          simulate: (seconds) => {
            for (let t = 0; t < seconds; t += FIXED) {
              sceneTime += FIXED;
              if (phase === "climb") {
                flyPlane(FIXED);
                seatDiver();
                const s = planeState;
                jumpOpen = s.alt >= JUMP_ALT - 1 && Math.abs(wrap(s.angle - jumpAngle)) < JUMP_WINDOW;
              } else if (phase === "air") {
                accumulator = FIXED;
                simulate(0);
              } else if (phase === "down" || phase === "lost") {
                if (phase === "lost") diver.substep(FIXED, NO_INPUT);
                if (sceneTime - landedAt > (phase === "lost" ? LOST_T : LANDED_T)) finish(phase === "lost" ? "lost" : diver.state.landing, Math.hypot(diver.state.p.x - landingSpot.x, diver.state.p.z - landingSpot.z));
              }
            }
          },
          setInput: (pitch, roll, yaw, flare) => {
            ctrl.pitch = pitch;
            ctrl.roll = roll;
            ctrl.yaw = yaw;
            ctrl.flare = !!flare;
          },
          // Jump straight from the plane's course start, as the prompt would
          jumpNow: () => {
            if (phase !== "climb") startFlight();
            planeState.t = ROLL_T + CLIMB_T;
            flyPlane(0.001);
            seatDiver();
            jumpOpen = true;
            return jump();
          }
        }
      }
    });
  };
  const leave = () => {
    window.clearInterval(stateTimer);
    window.clearTimeout(hintTimer);
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
    audio.dispose();
    for (const key of ["torso", "head"]) input.remove(diver.cave.parts[key]);
    diver.dispose();
    fx.dispose();
    controls.dispose();
    hud.el.act.hidden = true;
    hud.setAct("Ooga!");
    for (const node of placed) removeChild(root, node);
    placed.length = clouds.length = rings.length = 0;
    const count = input.targetCount;
    input.dispose();
    dhud.dispose();
    hud.dispose();
    phase = "board";
    diver = plane = streaks = mound = hole = hud = dhud = hooks = input = fx = controls = audio = clock = island = null;
    dropScene.input = dropScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    set.add(diver.cave.headOpen).add(diver.cave.headClosed);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), phase, rings: ringsHit, streaks: streaks.node.instanceCount };
  };
  Object.assign(dropScene, { enter, update, overlay, onDonation, onKey, onLootCleared, leave, stats, liveGeometry });
  BL.scenes = BL.scenes || {};
  BL.scenes.drop = dropScene;
})();
