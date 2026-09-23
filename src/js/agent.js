// The Agent: a voxel gorilla in little black shades. Outside the Matrix it is a
// plain dark ape; inside the Matrix and in the games its true nature shows, one
// voxel map drawn in glowing code green. It knuckle-walks, gallops on all fours
// and sometimes walks hunched on its hind legs.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { makeVox, voxelGeometry, cached } = BL.models;
  const { createNode, addChild, removeChild } = BL.scene;
  const { damp, clamp, mulberry32, fnv1a } = BL.math;
  const U = 0.086;
  // Hip height, torso length, the shoulder on the chest, and the arm: the knuckles
  // reach the ground when the chest leans QUAD forward (8 + 11 cos 1.0 = 13.9 ≈ 14).
  const HIP = 8 * U, SHOULDER_Y = 11 * U, SHOULDER_X = 6 * U, NECK_Y = 10.5 * U;
  const QUAD = 1.0, HUNCH = 0.5, REAR = 0.12;
  // Palette slots, shared by both forms
  const C = { body: 0, bodyDk: 1, hide: 2, hideDk: 3, pad: 4, groove: 5, dash: 6, shades: 7, eye: 8, silver: 9, nostril: 10, brow: 11 };
  const APE = ["#2b2724", "#1d1a18", "#56504b", "#46403c", "#3d3834", "#161412", "#2b2724", "#070707", "#2a1a0e", "#8b8681", "#0e0d0c", "#3a3531"];
  const CODE = ["#0f5a22", "#093a15", "#6dff8c", "#48d864", "#a4ffb4", "#08300f", "#3dff66", "#070707", "#e6ffea", "#5cf07c", "#062a0d", "#86ffa0"];
  const CODE_GLOW = { [C.body]: 0.12, [C.bodyDk]: 0.05, [C.hide]: 0.6, [C.hideDk]: 0.45, [C.pad]: 0.85, [C.dash]: 1, [C.eye]: 1, [C.silver]: 0.55, [C.brow]: 0.6 };
  // Per gait: chest lean, limb swing, then a roaming and a driven pair of ground
  // speed (m/s) and stride per cycle (m). Driven it keeps up with an Ooga
  // (pilot.WALK.speed) and the gallop outruns one; roaming it ambles.
  const WALK_SPEED = BL.pilot.WALK.speed;
  const GAITS = {
    idle: { pitch: QUAD, speed: 0, stride: 1, drive: 0, driveStride: 1, legs: 0, arms: 0 },
    knuckle: { pitch: QUAD, speed: 0.9, stride: 0.9, drive: WALK_SPEED, driveStride: 2.4, legs: 0.45, arms: 0.4 },
    gallop: { pitch: 0.95, speed: 3.4, stride: 1.6, drive: WALK_SPEED * 1.5, driveStride: 3.6, legs: 0.75, arms: 0.7 },
    hunch: { pitch: HUNCH, speed: 0.75, stride: 0.7, drive: WALK_SPEED, driveStride: 2.2, legs: 0.5, arms: 0.35 },
    beat: { pitch: REAR, speed: 0, stride: 1, drive: 0, driveStride: 1, legs: 0, arms: 0 }
  };
  // Cycle offsets: a four-beat walk, a bound (pairs half a cycle apart), a biped walk
  const OFFSETS = {
    knuckle: { legL: 0, armL: 0.25, legR: 0.5, armR: 0.75 },
    gallop: { legL: 0, legR: 0.08, armL: 0.5, armR: 0.58 },
    hunch: { legL: 0, armR: 0, legR: 0.5, armL: 0.5 }
  };
  const LIMBS = [{ leg: "legL", arm: "armL", side: -1 }, { leg: "legR", arm: "armR", side: 1 }];
  const BEAT_TIME = 1.6;
  const TAU = Math.PI * 2;

  const jitter = (rand, base, dark, p) => () => rand() < p ? dark : base;
  // Columns of lit code run down the fur: every fourth column, two cells on, one off.
  const codeDashes = (v) => {
    for (const [key, c] of v.map) {
      if (c !== C.body && c !== C.bodyDk) continue;
      const [x, y, z] = key.split(",").map(Number);
      const hash = (Math.imul(x + 64, 73856093) ^ Math.imul(z + 64, 19349663)) >>> 0;
      if (hash % 4 === 0 && (y + hash % 3) % 3 !== 0) v.map.set(key, C.dash);
    }
    return v;
  };
  const legVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 3, 2, 7, 0, 3, fur);
    v.fill(-1, 4, 5, 7, -1, 4, fur);
    // A lit foot pad split into toes on its front
    v.fill(0, 3, 0, 1, 0, 5, C.pad);
    for (const x of [1, 3]) v.fill(x, x, 0, 1, 5, 5, C.groove);
    return codeDashes(v);
  };
  const armVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 3, 8, 13, 0, 3, fur);
    // Heavy forearms over knuckle pads with dark grooves between the fingers
    v.fill(-1, 4, 2, 7, -1, 4, fur);
    v.fill(-1, 4, 0, 1, 0, 4, C.pad);
    for (const x of [0, 2]) v.fill(x, x, 0, 1, 4, 4, C.groove);
    v.fill(-1, 4, 2, 2, 4, 4, C.hideDk);
    return codeDashes(v);
  };
  const torsoVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(1, 8, 0, 2, 1, 5, fur);
    v.fill(0, 9, 3, 11, 0, 6, fur);
    // The pale chest plate on the front, the silver back and shoulder mounds on top
    v.fill(2, 7, 3, 9, 6, 6, jitter(rand, C.hide, C.hideDk, 0.25));
    v.fill(3, 6, 2, 2, 5, 5, C.hideDk);
    v.fill(1, 8, 10, 11, 0, 2, C.silver);
    for (const [x0, x1] of [[-2, 1], [8, 11]]) {
      v.fill(x0, x1, 8, 12, 1, 5, fur);
      v.fill(x0, x1, 12, 12, 1, 5, C.silver);
      v.fill(x0, x1, 10, 11, 5, 5, C.silver);
    }
    return codeDashes(v);
  };
  const headVox = (rand) => {
    const v = makeVox(), fur = jitter(rand, C.body, C.bodyDk, 0.2);
    v.fill(0, 6, 0, 6, 0, 5, fur);
    // The sagittal crest, ears and a heavy brow
    v.fill(2, 4, 7, 8, 0, 3, fur);
    v.fill(3, 3, 9, 9, 1, 2, C.silver);
    v.set(-1, 4, 2, C.body);
    v.set(7, 4, 2, C.body);
    v.fill(0, 6, 5, 5, 6, 6, C.brow);
    // Face, muzzle and nostrils
    v.fill(1, 5, 0, 4, 5, 5, C.hide);
    v.fill(1, 5, 0, 2, 6, 7, jitter(rand, C.hide, C.hideDk, 0.2));
    v.set(2, 2, 7, C.nostril);
    v.set(4, 2, 7, C.nostril);
    // Eyes just above the little black shades
    for (const x of [1, 2, 4, 5]) v.set(x, 4, 5, C.eye);
    v.fill(0, 6, 3, 3, 6, 6, C.shades);
    v.set(0, 3, 5, C.shades);
    v.set(6, 3, 5, C.shades);
    return v;
  };
  // One voxel map per part, two palettes: ape and code.
  const geometries = cached(() => {
    const part = (name, build, origin) => {
      const v = build(mulberry32(fnv1a(`agent/${name}`)));
      return {
        ape: voxelGeometry(v, { unit: U, palette: APE, origin }),
        code: voxelGeometry(v, { unit: U, palette: CODE, origin, emissive: CODE_GLOW })
      };
    };
    return {
      legL: part("legL", legVox, { x: -2 * U, y: -8 * U, z: -2 * U }),
      legR: part("legR", legVox, { x: -2 * U, y: -8 * U, z: -2 * U }),
      armL: part("armL", armVox, { x: -2 * U, y: -14 * U, z: -2 * U }),
      armR: part("armR", armVox, { x: -2 * U, y: -14 * U, z: -2 * U }),
      torso: part("torso", torsoVox, { x: -5 * U, y: 0, z: -3.5 * U }),
      head: part("head", headVox, { x: -3.5 * U, y: 0, z: -2 * U })
    };
  });
  const PART_NAMES = ["legL", "legR", "torso", "armL", "armR", "head"];

  // A step may climb at most STEP_UP and drop at most STEP_DOWN, so walls and
  // cliff edges stop the Agent instead of lifting it or dropping it off the island.
  // BODY is what it needs overhead, so it is barred by the same rock and props an Ooga is.
  const STEP_UP = 0.6, STEP_DOWN = 1.2, BODY = 13 * U;
  const GRAVITY = 9.8, JUMP_SPEED = 4.4, REVEAL_TIME = 9;
  // A click this soon after taking the Agent was the third of a triple: a look, not a drive.
  const TRIPLE_MS = 500;
  // groundAt(x, z) is the walking surface; walkable(fromX, fromZ, toX, toZ, y, height),
  // when given, is the scene's own swept test, the one its Oogas walk by, and bounds
  // every step the Agent takes. A walk is a list of { x, z } waypoints.
  const create = ({ groundAt, walkable = null, form = "ape", x = 0, z = 0, heading = 0 }) => {
    const geos = geometries();
    const root = createNode({ position: { x, y: groundAt(x, z), z }, rotation: { x: 0, y: heading, z: 0 } });
    // The renderers draw the Agent's own palette inside the Matrix instead of repainting it.
    root.matrixNative = true;
    const hips = createNode({ position: { x: 0, y: HIP, z: 0 } });
    const chest = createNode({ rotation: { x: QUAD, y: 0, z: 0 } });
    const parts = {
      legL: createNode({ position: { x: -3 * U, y: 0, z: 0 } }),
      legR: createNode({ position: { x: 3 * U, y: 0, z: 0 } }),
      torso: chest,
      armL: createNode({ position: { x: -SHOULDER_X, y: SHOULDER_Y, z: 0.5 * U } }),
      armR: createNode({ position: { x: SHOULDER_X, y: SHOULDER_Y, z: 0.5 * U } }),
      head: createNode({ position: { x: 0, y: NECK_Y, z: 1.5 * U } })
    };
    addChild(chest, parts.armL, parts.armR, parts.head);
    addChild(hips, parts.legL, parts.legR, chest);
    addChild(root, hips);
    const state = {
      form: null, gait: "idle", walkGait: "knuckle", phase: 0, speed: 0, pitch: QUAD, heading,
      route: null, routeIndex: 0, idleFor: 1 + Math.random() * 2, gaitFor: 0, beat: 0,
      pace: null, driven: false, walkStyle: "knuckle", inX: 0, inZ: 0, inRun: false,
      vy: 0, air: false, revealFor: 0
    };
    const setForm = (next) => {
      if (state.form === next) return;
      state.form = next;
      for (const name of PART_NAMES) parts[name].geometry = geos[name][next];
    };
    setForm(form);
    const setGait = (gait) => {
      if (!GAITS[gait]) throw new Error(`agent: unknown gait ${gait}`);
      state.gait = gait;
      if (gait === "knuckle" || gait === "gallop" || gait === "hunch") state.walkGait = gait;
    };
    // A walk along waypoints; gallop for long trips, otherwise knuckle or hunch, re-rolled as it goes.
    const walk = (route, long = false) => {
      state.route = route;
      state.routeIndex = 0;
      state.walkGait = long && Math.random() < 0.4 ? "gallop" : Math.random() < 0.55 ? "knuckle" : "hunch";
      state.gaitFor = 5 + Math.random() * 4;
      state.gait = state.walkGait;
    };
    // Games: stay near a spot, idling and making short runs within the radius.
    const PACE_TARGET = [{ x: 0, z: 0 }];
    const pace = (cx, cz, radius) => {
      state.pace = { x: cx, z: cz, radius };
    };
    const nextPace = () => {
      const p = state.pace, a = Math.random() * TAU, r = p.radius * Math.sqrt(Math.random());
      PACE_TARGET[0].x = p.x + Math.cos(a) * r;
      PACE_TARGET[0].z = p.z + Math.sin(a) * r;
      walk(PACE_TARGET, Math.hypot(PACE_TARGET[0].x - root.position.x, PACE_TARGET[0].z - root.position.z) > p.radius * 0.8);
    };
    const place = (px, pz, facing) => {
      root.position.x = px;
      root.position.z = pz;
      root.position.y = groundAt(px, pz);
      state.heading = facing;
      state.route = null;
      state.gait = "idle";
      state.idleFor = 1 + Math.random() * 2;
    };
    // Player control: a world-space direction (length up to 1) and whether to run.
    const setDriven = (on) => {
      state.driven = on;
      state.route = null;
      state.beat = 0;
      state.gait = "idle";
      state.inX = state.inZ = 0;
      if (!on) state.idleFor = 1 + Math.random() * 2;
    };
    const drive = (dirX, dirZ, run) => {
      state.inX = dirX;
      state.inZ = dirZ;
      state.inRun = run;
    };
    const toggleStyle = () => {
      state.walkStyle = state.walkStyle === "knuckle" ? "hunch" : "knuckle";
    };
    // A step has to clear the ground limits and the scene's own sweep, so the
    // Agent stops at what stops an Ooga instead of walking through it.
    const stepTo = (nx, nz) => {
      const p = root.position, ground = groundAt(p.x, p.z), ny = groundAt(nx, nz);
      if (ny <= ground - STEP_DOWN || ny >= p.y + STEP_UP) return false;
      if (walkable && !walkable(p.x, p.z, nx, nz, p.y, BODY)) return false;
      p.x = nx;
      p.z = nz;
      return true;
    };
    // Blocked head on, try each axis alone, the way a walking Ooga slides along a wall.
    const slideTo = (nx, nz) => {
      const p = root.position;
      return stepTo(nx, nz) || nx !== p.x && stepTo(nx, p.z) || nz !== p.z && stepTo(p.x, nz);
    };
    const driven = (dt) => {
      const m = Math.hypot(state.inX, state.inZ);
      if (m < 0.1) {
        state.gait = "idle";
        return;
      }
      state.gait = state.inRun ? "gallop" : state.walkStyle;
      const want = Math.atan2(state.inX, state.inZ), turn = Math.atan2(Math.sin(want - state.heading), Math.cos(want - state.heading));
      state.heading += turn * (1 - Math.exp(-8 * dt));
      const p = root.position, step = state.speed * dt * Math.min(1, m) * Math.max(0, Math.cos(turn));
      slideTo(p.x + Math.sin(state.heading) * step, p.z + Math.cos(state.heading) * step);
    };
    const jump = () => {
      if (state.air) return;
      state.air = true;
      state.vy = JUMP_SPEED;
    };
    // Its true colours outside the Matrix, for a while
    const reveal = () => {
      state.revealFor = REVEAL_TIME;
    };
    const poke = () => {
      state.beat = BEAT_TIME;
      state.gait = "beat";
    };
    // Called with no route while idle; returns once a new walk is wanted.
    let onIdle = null;
    const steer = (dt) => {
      const target = state.route[state.routeIndex];
      const p = root.position, dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.3) {
        state.routeIndex++;
        if (state.routeIndex >= state.route.length) {
          state.route = null;
          state.gait = "idle";
          state.idleFor = 1.5 + Math.random() * 3;
        }
        return;
      }
      const want = Math.atan2(dx, dz), turn = Math.atan2(Math.sin(want - state.heading), Math.cos(want - state.heading));
      state.heading += turn * (1 - Math.exp(-6 * dt));
      state.gaitFor -= dt;
      if (state.gaitFor <= 0 && state.walkGait !== "gallop") {
        state.walkGait = Math.random() < 0.55 ? "knuckle" : "hunch";
        state.gait = state.walkGait;
        state.gaitFor = 5 + Math.random() * 4;
      }
      // Slow while facing away, so it turns before it runs on
      const step = Math.min(distance, state.speed * dt * Math.max(0, Math.cos(turn)));
      // Walled in: drop the route and idle, and onIdle picks somewhere else to go.
      if (!slideTo(p.x + Math.sin(state.heading) * step, p.z + Math.cos(state.heading) * step)) {
        state.route = null;
        state.gait = "idle";
        state.idleFor = 0.4 + Math.random() * 0.8;
      }
    };
    const limb = (node, angle, dt) => {
      node.rotation.x = damp(node.rotation.x, angle, 18, dt);
    };
    const update = (dt) => {
      // The first displayed frame after a debug advance can carry a negative
      // interval; a fast damp would amplify it instead of settling.
      if (!(dt > 0)) return;
      if (state.revealFor > 0) state.revealFor -= dt;
      if (state.beat > 0) {
        state.beat -= dt;
        if (state.beat <= 0) state.gait = state.route ? state.walkGait : "idle";
      } else if (state.driven) driven(dt);
      else if (state.route) steer(dt);
      else if ((state.idleFor -= dt) <= 0) {
        if (state.pace) nextPace();
        else if (onIdle) onIdle();
        else state.idleFor = 2;
      }
      const g = GAITS[state.gait], top = state.driven ? g.drive : g.speed, stride = state.driven ? g.driveStride : g.stride;
      state.speed = damp(state.speed, top, 6, dt);
      state.phase = (state.phase + dt * state.speed / stride) % 1;
      const moving = top > 0 ? clamp(state.speed / top, 0, 1) : 0;
      const wave = (o) => Math.sin(TAU * (state.phase + o));
      let pitch = g.pitch, bob = 0;
      if (state.gait === "gallop") {
        pitch += 0.12 * wave(0.25) * moving;
        bob = 0.08 * Math.max(0, wave(0.25)) * moving;
      } else if (moving > 0) bob = 0.02 * Math.abs(wave(0)) * moving;
      state.pitch = damp(state.pitch, pitch, 6, dt);
      chest.rotation.x = state.pitch;
      const o = OFFSETS[state.gait];
      // Arms hang straight down in the world whatever the chest's lean; the swing reaches forward and back.
      for (let i = 0; i < LIMBS.length; i++) {
        const l = LIMBS[i], arm = parts[l.arm];
        limb(parts[l.leg], o ? -g.legs * moving * wave(o[l.leg]) : 0, dt);
        if (state.gait === "beat") {
          // Alternate fists on the chest, easing in and out of the pose
          const k = Math.min(1, (BEAT_TIME - state.beat) * 4) * Math.min(1, state.beat * 4);
          arm.rotation.x = damp(arm.rotation.x, -state.pitch - (1.25 + 0.3 * Math.sin((BEAT_TIME - state.beat) * 16 + (l.side < 0 ? 0 : Math.PI))) * k, 18, dt);
          arm.rotation.z = damp(arm.rotation.z, -l.side * 0.45 * k, 12, dt);
        } else {
          limb(arm, -state.pitch - (o ? g.arms * moving * wave(o[l.arm]) : 0), dt);
          arm.rotation.z = damp(arm.rotation.z, state.gait === "hunch" ? l.side * 0.12 : 0, 8, dt);
        }
      }
      // The head keeps the face forward, looking up when it rears
      parts.head.rotation.x = -state.pitch * (state.gait === "beat" ? 1.15 : 0.85);
      hips.position.y = HIP + bob;
      root.rotation.y = state.heading;
      const ground = groundAt(root.position.x, root.position.z);
      if (state.air) {
        state.vy -= GRAVITY * dt;
        root.position.y += state.vy * dt;
        if (root.position.y <= ground) {
          root.position.y = ground;
          state.air = false;
          state.vy = 0;
        }
      } else root.position.y = ground;
    };
    // Only the form on show: the other set is released, so no scene keeps another
    // scene's Agent geometry resident. A swap re-uploads six small voxel parts.
    const liveGeometry = (set) => {
      for (const name of PART_NAMES) set.add(geos[name][state.form]);
    };
    const dispose = () => {
      if (root.parent) removeChild(root.parent, root);
      state.route = null;
      state.pace = null;
      onIdle = null;
    };
    const agent = {
      root, parts, hips, chest, update, setForm, setGait, walk, pace, place, poke, jump, reveal, setDriven, drive, toggleStyle, liveGeometry, dispose,
      get revealed() { return state.revealFor > 0; },
      get airborne() { return state.air; },
      groundAt,
      get heading() { return state.heading; },
      get driven() { return state.driven; },
      get form() { return state.form; },
      set onIdle(fn) { onIdle = fn; },
      get walking() { return !!state.route; },
      debug: {
        get form() { return state.form; },
        get gait() { return state.gait; },
        get pitch() { return state.pitch; },
        get speed() { return state.speed; },
        get phase() { return state.phase; },
        get driven() { return state.driven; },
        get walkStyle() { return state.walkStyle; },
        get revealed() { return state.revealFor > 0; },
        get airborne() { return state.air; },
        jump,
        reveal,
        setGait,
        setForm,
        poke,
        place,
        pace,
        parts,
        root
      }
    };
    return agent;
  };
  // Shift+A in any scene, or a double-click on the Agent in the hub and the lab: the
  // director hands the active scene's Agent to the player until Escape, Shift+A or a
  // double-click on the ground, and it wanders off again. Key-downs are taken in the
  // capture phase, so the scene's own controls never see them meanwhile. A scene may
  // provide agentView (the pilot's orbit, so drag and scroll work as with an Ooga),
  // agentControls (its sticks) and agentHandoff (release a controlled Ooga first).
  const PLAY_KEYS = { w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right", shift: "run", q: "turnLeft", e: "turnRight" };
  const CAMERA_DIST = 4.2, CAMERA_PITCH = 0.42, CAMERA_TURN = 1.8, SUMMON_DIST = 3.5;
  const createPlay = () => {
    const held = { forward: 0, back: 0, left: 0, right: 0, run: 0, turnLeft: 0, turnRight: 0 };
    let scene = null, agent = null, yaw = 0, startedAt = -Infinity;
    const typing = (e) => e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || (e.target.closest && e.target.closest("dialog")));
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const key = e.key.toLowerCase();
      // Shift+A reaches the director, which lets go.
      if (e.shiftKey && key === "a") return;
      if (key === "escape") stop();
      else if (PLAY_KEYS[key]) held[PLAY_KEYS[key]] = 1;
      else if (key === " ") {
        if (!e.repeat) agent.jump();
      } else if (key === "c") {
        if (!e.repeat) agent.poke();
      } else if (key === "h") {
        if (!e.repeat) agent.toggleStyle();
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // Key-ups pass on: the scene's controls saw the A of Shift+A go down before play began, and a
    // swallowed key-up left it held there, walking the next driven Ooga left on its own.
    const onKeyUp = (e) => {
      const name = PLAY_KEYS[e.key.toLowerCase()];
      if (name) held[name] = 0;
    };
    const onBlur = () => {
      for (const name in held) held[name] = 0;
    };
    const toast = (text) => {
      if (scene.debug && scene.debug.hud) scene.debug.hud.toast(text);
    };
    // summon: bring it in front of the camera (Shift+A); a double-click takes it where it stands.
    const start = (next, summon = true) => {
      if (next.agentHandoff) next.agentHandoff();
      scene = next;
      // A scene may build its Agent only when one is called for (the lab).
      agent = next.agent || (next.summonAgent ? next.summonAgent() : null);
      if (!agent) return;
      startedAt = performance.now();
      const c = next.camera, dx = c.target.x - c.position.x, dz = c.target.z - c.position.z, l = Math.hypot(dx, dz) || 1;
      if (summon) {
        const x = c.position.x + dx / l * SUMMON_DIST, z = c.position.z + dz / l * SUMMON_DIST, y = agent.groundAt(x, z);
        // Wherever there is ground to stand on in front of the camera, facing away
        if (Number.isFinite(y) && Math.abs(y - c.position.y) < 30) agent.place(x, z, Math.atan2(dx, dz));
      }
      agent.root.visible = true;
      agent.setDriven(true);
      yaw = Math.atan2(-dx, -dz);
      if (next.agentView) next.agentView.tYaw = next.agentView.yaw = yaw;
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", onBlur);
      toast("You are the Agent · WASD walk, Shift gallop, Space jump, H hunch, C beat chest · Esc or double-click the ground to let go");
    };
    function stop(quiet = false) {
      if (!agent) return;
      agent.setDriven(false);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      onBlur();
      // The free camera stays where the chase camera left it
      const view = scene.agentView, p = agent.root.position;
      if (view) {
        view.target.x = view.tx = p.x;
        view.target.y = view.ty = p.y + 0.9;
        view.target.z = view.tz = p.z;
      }
      if (!quiet) toast("The Agent wanders off");
      agent = scene = null;
    }
    // After the scene's update: steer relative to the camera, then place the chase camera.
    const update = (dt) => {
      if (!agent) return;
      const view = scene.agentView, turn = (held.turnLeft - held.turnRight) * CAMERA_TURN * dt;
      if (view) {
        view.tYaw += turn;
        yaw = view.yaw;
      } else yaw += turn;
      const stick = scene.agentControls ? scene.agentControls.read() : null;
      let ix = held.right - held.left + (stick ? stick.x : 0), iy = held.forward - held.back + (stick ? stick.y : 0);
      // The camera looks along -(sin yaw, cos yaw); screen right is (cos yaw, -sin yaw)
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let mx = fx * iy - fz * ix, mz = fz * iy + fx * ix;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      agent.drive(mx, mz, held.run > 0);
      const p = agent.root.position, c = scene.camera;
      const pitch = view ? view.pitch : CAMERA_PITCH, dist = view ? view.dist : CAMERA_DIST, cp = Math.cos(pitch);
      c.position.x = p.x + Math.sin(yaw) * cp * dist;
      c.position.y = p.y + 0.9 + Math.sin(pitch) * dist;
      c.position.z = p.z + Math.cos(yaw) * cp * dist;
      c.target.x = p.x;
      c.target.y = p.y + 0.9;
      c.target.z = p.z;
    };
    return { start, stop, update, get active() { return !!agent; }, get agent() { return agent; }, get startedAt() { return startedAt; } };
  };
  BL.agent = { create, createPlay, GAITS, TRIPLE_MS, QUAD, HUNCH, BODY };
})();
