(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors } = BL;
  const { clamp, lerp, damp, ease, randomInt } = math;
  const { createNode, addChild, removeChild, addTween } = BL.scene;
  const EAT_RATE = 1 / 20;
  const CHEW_PERIOD = 3.2;
  const BODY_PARTS = ["torso", "head", "legL", "legR", "armL", "armR"];
  const SWAG_ANCHORS = ["hat", "face"];
  const FAN_STANDOFF = 1.1;
  const FAN_ARC = 2.2;
  // The widest the fan opens, so the near side stays clear however many eat
  const FAN_SPREAD = 4.2;
  const POKES = ["Ooga?", "Booga!", "No poke.", "Hmm banana?", "Ooga booga booga."];
  const SLEEP_POKES = ["zzz... grr", "five more minutes", "zzz"];
  const BUILD_QUOTES = ["Ooga Booga!", "Ooga Booga BUILD!", "Ooga Booga MORE TOOLS!"];
  const IDLE_QUOTES = ["Ooga.", "Hmm.", "Nice rock.", "Booga?", "Where banana?", "Ooga booga.", "Sky big.", "Good cave."];
  const PHASE_QUOTES = {
    dawn: ["Sun come.", "Big yawn.", "Cold rock.", "Bird loud.", "Sky pink.", "Ooga wake."],
    morning: ["Good day for banana.", "Ooga work.", "Sun warm.", "Rock dry now.", "Big day.", "Booga hungry."],
    noon: ["Hot rock.", "Sun high.", "Shade good.", "Ooga sweat.", "Banana warm.", "Too bright."],
    dusk: ["Sky orange. Pretty.", "Fire soon.", "Sun go down.", "Long shadow.", "Ooga tired.", "Bug sing."],
    night: ["Stars many.", "Fire warm.", "Moon big.", "Dark out there.", "Ooga count star.", "Owl."],
    midnight: ["Ooga not sleepy.", "Owl says hoo.", "Very dark. Very quiet.", "Rock cold.", "Booga snore.", "Moon watch."]
  };
  const SHOUTS = ["OOGA BOOGA!", "OOGA!", "BOOGA!"];
  // Meal and idle timings for a working caveman
  const EAT_MIN = 14, EAT_SPREAD = 20, HUNGRY_LINGER = 4, IDLE_MIN = 3, IDLE_SPREAD = 6, TRIPS_MAX = 3;
  const WANDER_SPEED = 1.3, RUSH_SPEED = 2.8, PLAYER_SPEED = 3.2;
  // Jetpack thrust, ceiling, capped fall and speed
  const JET_ACCEL = 20, JET_RISE = 7, JET_FALL = 7, JET_CEILING = 16, JET_SPEED = 6.4, JET_PUFF = 0.05;
  const JET_SPARKS = [models.particleGeometry("#ffb13b", 0.09, 1), models.particleGeometry("#f3efe4", 0.07, 0.6)];
  const LAND_DUST = [models.particleGeometry("#a3874f", 0.1, 0)];
  // A drop deeper than a step, mirroring the hub's STEP_MAX
  const STEP = 0.6;
  const YAWN_DUR = 2.4;
  const REACH = 1.6;
  const MUZZLE = new Float32Array(3);
  const setVec = (v, x, y, z) => {
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
  };
  const popNode = (node) => {
    const target = { ...node.scale };
    Object.assign(node.scale, { x: 0.01, y: 0.01, z: 0.01 });
    addTween({
      dur: 0.5, ease: ease.outBack, update: (k) => {
        node.scale.x = target.x * k;
        node.scale.y = target.y * k;
        node.scale.z = target.z * k;
      }
    });
  };
  // The cavemen of one scene
  const create = (ctx) => {
    const { root, input, hud, game, world, bedrolls, viewYaw, buildSpots, walkIn, wanderSpot } = ctx;
    // Ground under a point, given how high the caveman already is
    const groundAt = ctx.groundAt || (() => 0);
    const walkable = ctx.walkable || (() => true);
    // Where a flying caveman may go
    const flyable = ctx.flyable || walkable;
    const cavemen = new Map();
    contributors.roster.forEach((contributor, i) => {
      const cave = models.caveman(contributors.traitsFor(contributor.name));
      Object.assign(cave, {
        slot: null,
        index: i,
        bedroll: null,
        phase: i * 1.37,
        baseY: cave.root.position.y,
        state: "away",
        contributor,
        zzzTimer: 0,
        build: null,
        walk: null,
        hop: 0,
        hopV: 0,
        cheer: 0,
        catchT: 0,
        yawn: 0,
        yawnAt: 12 + i * 4.3 + Math.random() * 20,
        leap: { vx: 0, vz: 0, land: 0 },
        highlightTarget: 0,
        highlight: 0,
        nextBuildAt: 8 + i * 2.5 + Math.random() * 6,
        jet: null,
        act: { kind: "eat", until: 0, trips: 0, sayAt: 0, said: true, phase: 0, spot: { x: 0, z: 0, ry: NaN } },
        swagNodes: []
      });
      cave.root.visible = false;
      addChild(root, cave.root);
      for (const key of BODY_PARTS) input.add(cave.parts[key], { kind: "caveman", cave, priority: 1 });
      cavemen.set(contributor.name, cave);
    });
    const stateOf = (cave) => cave.override || contributors.stateFor(cave.contributor);
    const groundY = (cave) => {
      const p = cave.root.position;
      return cave.baseY + groundAt(p.x, p.z, p.y - cave.baseY);
    };
    const atPile = (cave) => cave.act.kind === "eat" || cave.act.kind === "rush";
    // Take the first free bed, else share by roster
    const claimBedroll = (cave) => {
      if (cave.bedroll) return;
      cave.bedroll = bedrolls.find((bed) => !bed.sleeper) || bedrolls[cave.index % bedrolls.length];
      if (!cave.bedroll.sleeper) cave.bedroll.sleeper = cave;
    };
    const releaseBedroll = (cave) => {
      if (cave.bedroll && cave.bedroll.sleeper === cave) cave.bedroll.sleeper = null;
      cave.bedroll = null;
    };
    const stateCounts = () => {
      const counts = { working: 0, sleeping: 0, away: 0 };
      for (const cave of cavemen.values()) counts[cave.state]++;
      return counts;
    };
    const workingCavemen = () => [...cavemen.values()].filter((c) => c.state === "working" && !c.walk);
    const eatingCavemen = () => [...cavemen.values()].filter((c) => c.state === "working" && !c.walk && !c.build && atPile(c));
    const feedableCavemen = () => [...cavemen.values()].filter((c) => c.root.visible && (c.state === "working" || c.state === "sleeping"));
    const releaseBuild = (cave) => {
      if (!cave.build) return;
      if (!cave.build.built) buildSpots.push(cave.build.spot);
      cave.build = null;
    };
    const resetPose = (cave) => {
      Object.assign(cave.root.rotation, { x: 0, y: 0, z: 0 });
      Object.assign(cave.root.scale, { x: 1, y: 1, z: 1 });
      Object.assign(cave.parts.armL.rotation, { x: -0.2, y: 0, z: -0.12 });
      Object.assign(cave.parts.armR.rotation, { x: -0.2, y: 0, z: 0.12 });
      cave.parts.legL.rotation.x = 0;
      cave.parts.legR.rotation.x = 0;
      cave.parts.head.rotation.x = 0;
      cave.parts.head.rotation.y = 0;
      cave.parts.snack.visible = false;
      cave.parts.gun.visible = false;
      cave.yawn = 0;
    };
    const refreshRosterRow = (cave) => {
      hud.setRosterRow(cave.traits.name, cave.state, contributors.ageLabel(cave.contributor));
    };
    let player = null;
    // World-space drive vector
    const steer = { x: 0, z: 0 };
    const applyState = (cave, state) => {
      if (cave.state === state) {
        // Re-seat a moved eater, interrupt nothing else
        if (state === "working") walkToSlot(cave);
        return;
      }
      if (state === "working" && cave.walk) {
        cave.walk.tx = cave.slot.x;
        cave.walk.tz = cave.slot.z;
        cave.walk.to = "slot";
        return;
      }
      if (cave === player) release();
      cave.state = state;
      cave.parts.head.geometry = state === "sleeping" ? cave.headClosed : cave.headOpen;
      resetPose(cave);
      releaseBuild(cave);
      if (state === "sleeping") claimBedroll(cave);
      else releaseBedroll(cave);
      const r = cave.root;
      if (state === "working") {
        r.visible = true;
        standAtSlot(cave);
        startMeal(cave);
        popNode(r);
      } else if (state === "sleeping") {
        r.visible = true;
        Object.assign(r.position, { x: cave.bedroll.x, y: 0.42, z: cave.bedroll.z });
        Object.assign(r.rotation, { x: 0, y: 0, z: -Math.PI / 2 });
        cave.parts.armL.rotation.x = -1.5;
        cave.parts.armR.rotation.x = -1.5;
        popNode(r);
      } else {
        r.visible = false;
      }
      refreshRosterRow(cave);
    };
    const beginWalk = (cave) => {
      const from = cave.state === "sleeping" ? { x: cave.bedroll.x, z: cave.bedroll.z } : walkIn;
      const fresh = cave.state !== "sleeping";
      cave.state = "working";
      releaseBedroll(cave);
      cave.parts.head.geometry = cave.headOpen;
      cave.walk = { tx: cave.slot.x, tz: cave.slot.z, speed: 2, phase: 0, heading: Math.atan2(cave.slot.x - from.x, cave.slot.z - from.z), to: "slot" };
      resetPose(cave);
      releaseBuild(cave);
      cave.act.kind = "eat";
      const r = cave.root;
      r.visible = true;
      Object.assign(r.position, { x: from.x, y: cave.baseY + groundAt(from.x, from.z), z: from.z });
      r.rotation.y = cave.walk.heading;
      if (fresh) popNode(r);
      refreshRosterRow(cave);
    };
    // Eaters gather on the far side of the view
    const FAN_CENTER = Math.atan2(Math.cos(viewYaw), Math.sin(viewYaw)) + Math.PI;
    const wantedFanRadius = () => Math.max(ctx.pile.footprintEdge, ctx.pile.pileEdge()) + FAN_STANDOFF;
    let fanRadius = wantedFanRadius();
    const assignFanSlots = (entries, isWorking) => {
      const farSide = FAN_CENTER;
      const eaters = entries.filter(isWorking);
      // Neighbours stand FAN_ARC apart at any radius, closer only when the fan would wrap
      const angleStep = Math.min(clamp(FAN_ARC / fanRadius, 0.5, 1.1), FAN_SPREAD / Math.max(1, eaters.length - 1));
      // Nobody stands between the camera and the pile
      eaters.forEach((cave, i) => {
        const angle = farSide + (i - (eaters.length - 1) / 2) * angleStep;
        cave.slot = { x: Math.cos(angle) * fanRadius, z: Math.sin(angle) * fanRadius };
      });
    };
    const standAtSlot = (cave) => {
      setVec(cave.root.position, cave.slot.x, cave.baseY + groundAt(cave.slot.x, cave.slot.z), cave.slot.z);
      cave.root.rotation.y = Math.atan2(-cave.slot.x, -cave.slot.z);
    };
    let elapsed = 0;
    // Start a meal and time it
    const startMeal = (cave) => {
      cave.act.kind = "eat";
      cave.act.until = elapsed + EAT_MIN + Math.random() * EAT_SPREAD;
      cave.act.trips = 0;
    };
    // Walk an eater to its slot
    const walkToSlot = (cave, force = false) => {
      if (cave.state !== "working" || cave.build) return;
      if (!force && !atPile(cave)) return;
      if (cave.walk) {
        cave.walk.tx = cave.slot.x;
        cave.walk.tz = cave.slot.z;
        cave.walk.to = "slot";
        if (force) cave.walk.speed = RUSH_SPEED;
        return;
      }
      const { x, z } = cave.root.position;
      if (Math.hypot(cave.slot.x - x, cave.slot.z - z) < 0.15) return;
      cave.walk = { tx: cave.slot.x, tz: cave.slot.z, speed: force ? RUSH_SPEED : 1.6, phase: 0, heading: cave.root.rotation.y, to: "slot" };
      cave.parts.snack.visible = false;
      cave.parts.head.rotation.x = 0;
      cave.parts.head.rotation.y = 0;
    };
    const updateFan = () => {
      const wanted = wantedFanRadius();
      if (Math.abs(wanted - fanRadius) < 0.08) return;
      fanRadius = wanted;
      const entries = [...cavemen.values()];
      assignFanSlots(entries, (cave) => cave.state === "working");
      for (const cave of entries) walkToSlot(cave);
    };
    const refreshStates = (settle = false) => {
      const entries = [...cavemen.values()];
      const next = new Map(entries.map((cave) => [cave, stateOf(cave)]));
      fanRadius = wantedFanRadius();
      assignFanSlots(entries, (cave) => next.get(cave) === "working");
      for (const cave of entries) {
        const target = next.get(cave);
        if (!settle && target === "working" && cave.state !== "working") beginWalk(cave);
        else applyState(cave, target);
      }
    };
    // Everyone awake and free runs to the pile
    const rush = () => {
      if (!wanderSpot) return;
      for (const cave of cavemen.values()) {
        if (cave.state !== "working" || cave.build || cave === player) continue;
        cave.act.kind = "rush";
        cave.act.until = elapsed + EAT_MIN + Math.random() * EAT_SPREAD;
        cave.act.trips = 0;
        walkToSlot(cave, true);
        if (!cave.walk) cave.act.kind = "eat";
      }
    };
    // Send a caveman off to a spot
    const startWander = (cave) => {
      const spot = cave.act.spot;
      wanderSpot(spot);
      cave.act.kind = "wander";
      cave.act.trips++;
      cave.walk = { tx: spot.x, tz: spot.z, speed: WANDER_SPEED + Math.random() * 0.5, phase: 0, heading: cave.root.rotation.y, to: "spot" };
      cave.parts.snack.visible = false;
      cave.parts.head.rotation.x = 0;
      cave.parts.head.rotation.y = 0;
    };
    const arriveAtSpot = (cave) => {
      const a = cave.act;
      if (!Number.isNaN(a.spot.ry)) cave.root.rotation.y = a.spot.ry;
      a.kind = "idle";
      a.until = elapsed + IDLE_MIN + Math.random() * IDLE_SPREAD;
      a.sayAt = elapsed + 0.8 + Math.random() * 2;
      a.said = false;
    };
    const headWorldOf = (cave) => ({ x: cave.root.position.x, y: cave.state === "sleeping" ? 0.5 : cave.root.position.y - cave.baseY + cave.headOffset * 0.95, z: cave.root.position.z });
    const bulletPool = Array.from({ length: 12 }, () => {
      const node = createNode({ geometry: models.bananaGeometry(), scale: { x: models.BANANA_AMMO_SCALE, y: models.BANANA_AMMO_SCALE, z: models.BANANA_AMMO_SCALE }, visible: false });
      addChild(root, node);
      return node;
    });
    let bulletIdx = 0;
    const flash = createNode({ geometry: models.box({ w: 0.3, h: 0.3, d: 0.3, color: "#ffd94a", emissive: 1 }), visible: false });
    addChild(root, flash);
    const fireBullet = (cave, spot) => {
      const node = bulletPool[bulletIdx++ % bulletPool.length];
      const h = cave.traits.height;
      // Muzzle at z = 0.64h in gun-local space
      math.mat4.transformPoint(MUZZLE, cave.parts.gun.world, 0, 0.03 * h, 0.64 * h);
      const from = { x: MUZZLE[0], y: MUZZLE[1], z: MUZZLE[2] };
      const to = { x: spot.x + (Math.random() - 0.5) * 0.4, y: 0.5 + Math.random() * 0.5, z: spot.z + (Math.random() - 0.5) * 0.2 };
      const dx = to.x - from.x, dz = to.z - from.z;
      Object.assign(node.rotation, { x: 0, y: Math.atan2(dx, dz), z: 0.6 });
      node.visible = true;
      addTween({
        dur: 0.22, update: (k) => {
          setVec(node.position, lerp(from.x, to.x, k), lerp(from.y, to.y, k), lerp(from.z, to.z, k));
          node.rotation.x += 0.5;
        }, done: () => {
          node.visible = false;
          Object.assign(flash.position, to);
          flash.visible = true;
          addTween({
            dur: 0.18, update: (k) => {
              const s = 0.2 + k * 1.1;
              setVec(flash.scale, s, s, s);
            }, done: () => {
              flash.visible = false;
            }
          });
        }
      });
    };
    const builtEquipment = [];
    const dismantling = [];
    const spawnEquipment = (spot) => {
      const geometry = models.buildableGeos[Math.floor(Math.random() * models.buildableGeos.length)]();
      const node = createNode({ position: { x: spot.x, y: groundAt(spot.x, spot.z), z: spot.z }, rotation: { x: 0, y: spot.ry, z: 0 }, geometry });
      addChild(root, node);
      builtEquipment.push({ node, spot });
      popNode(node);
    };
    const startBuild = (cave) => {
      if (!buildSpots.length) {
        const oldest = builtEquipment.shift();
        if (!oldest) {
          cave.nextBuildAt = elapsed + 20;
          return;
        }
        dismantling.push(oldest.node);
        addTween({
          dur: 0.4, ease: ease.inQuad, update: (k) => {
            const s = Math.max(0.01, 1 - k);
            setVec(oldest.node.scale, s, s, s);
          }, done: () => {
            removeChild(root, oldest.node);
            const i = dismantling.indexOf(oldest.node);
            if (i >= 0) dismantling.splice(i, 1);
          }
        });
        buildSpots.push(oldest.spot);
      }
      const spot = buildSpots.splice(Math.floor(Math.random() * buildSpots.length), 1)[0];
      cave.build = {
        spot,
        phase: "turn",
        t: 0,
        age: 0,
        shots: 0,
        shotTimer: 0,
        built: false,
        quote: BUILD_QUOTES[Math.floor(Math.random() * BUILD_QUOTES.length)],
        startYaw: cave.root.rotation.y,
        targetYaw: Math.atan2(spot.x - cave.slot.x, spot.z - cave.slot.z)
      };
      cave.parts.snack.visible = false;
      cave.parts.head.rotation.x = 0;
    };
    const runBuild = (cave, dt) => {
      const b = cave.build, parts = cave.parts;
      b.t += dt;
      b.age += dt;
      if (b.phase === "turn") {
        const k = Math.min(1, b.t / 0.35);
        cave.root.rotation.y = lerp(b.startYaw, b.targetYaw, k);
        parts.armR.rotation.x = lerp(-0.2, -1.55, k);
        parts.armL.rotation.x = lerp(-0.2, -1.1, k);
        parts.gun.visible = true;
        parts.snack.visible = false;
        if (k >= 1) {
          b.phase = "shoot";
          b.t = 0;
        }
      } else if (b.phase === "shoot") {
        parts.armR.rotation.x = -1.55 + Math.sin(b.t * 45) * 0.06;
        b.shotTimer -= dt;
        if (b.shotTimer <= 0 && b.shots < 5) {
          b.shotTimer = 0.16;
          b.shots++;
          fireBullet(cave, b.spot);
        }
        if (b.shots >= 5 && b.t > 1.15) {
          b.phase = "reveal";
          b.t = 0;
        }
      } else if (b.phase === "reveal") {
        if (!b.built) {
          b.built = true;
          spawnEquipment(b.spot);
        }
        if (b.t > 0.45) {
          b.phase = "return";
          b.t = 0;
        }
      } else if (b.phase === "return") {
        const k = Math.min(1, b.t / 0.35);
        cave.root.rotation.y = lerp(b.targetYaw, Math.atan2(-cave.slot.x, -cave.slot.z), k);
        parts.armR.rotation.x = lerp(-1.55, -0.2, k);
        parts.armL.rotation.x = lerp(-1.1, -0.2, k);
        if (k >= 1) {
          parts.gun.visible = false;
          cave.build = null;
          cave.nextBuildAt = elapsed + 14 + Math.random() * 22;
        }
      }
    };
    // Swinging limbs and bobbing feet
    const walkPose = (cave, phase) => {
      const parts = cave.parts;
      const swing = Math.sin(phase);
      parts.legL.rotation.x = swing * 0.55;
      parts.legR.rotation.x = -swing * 0.55;
      parts.armL.rotation.x = -0.2 - swing * 0.3;
      parts.armR.rotation.x = -0.2 + swing * 0.3;
      cave.root.position.y = groundY(cave) + Math.abs(Math.sin(phase)) * 0.04;
    };
    const standPose = (cave) => {
      const parts = cave.parts;
      parts.legL.rotation.x = parts.legR.rotation.x = 0;
      parts.armL.rotation.x = parts.armR.rotation.x = -0.2;
    };
    // Flying pose, legs trailing and arms out
    const flyPose = (cave) => {
      const parts = cave.parts;
      parts.legL.rotation.x = -0.5;
      parts.legR.rotation.x = -0.3;
      parts.armL.rotation.x = parts.armR.rotation.x = -1.1;
    };
    const runWalk = (cave, dt) => {
      const w = cave.walk;
      const dx = w.tx - cave.root.position.x, dz = w.tz - cave.root.position.z;
      const dist = Math.hypot(dx, dz);
      const step = w.speed * dt;
      if (step >= dist) {
        if (w.to === "spot") {
          cave.root.position.x = w.tx;
          cave.root.position.z = w.tz;
          cave.root.position.y = groundY(cave);
          arriveAtSpot(cave);
        } else {
          standAtSlot(cave);
          if (cave !== player) startMeal(cave);
        }
        standPose(cave);
        cave.walk = null;
        return;
      }
      cave.root.position.x += dx / dist * step;
      cave.root.position.z += dz / dist * step;
      w.heading = damp(w.heading, Math.atan2(dx, dz), 8, dt);
      cave.root.rotation.y = w.heading;
      w.phase += dt * 9;
      walkPose(cave, w.phase);
    };
    const quoteFor = () => {
      const table = ctx.phase ? PHASE_QUOTES[ctx.phase()] : IDLE_QUOTES;
      return table[Math.floor(Math.random() * table.length)];
    };
    // A midnight yawn, arms up and head back, settling like a cheer
    const runYawn = (cave) => {
      // Re-armed in every phase so the stagger holds when midnight arrives mid-visit
      if (ctx.phase && elapsed > cave.yawnAt) {
        cave.yawnAt = elapsed + 25 + Math.random() * 30;
        if (ctx.phase() === "midnight") cave.yawn = YAWN_DUR;
      }
      if (cave.yawn <= 0) return false;
      const parts = cave.parts;
      const k = Math.sin((1 - cave.yawn / YAWN_DUR) * Math.PI);
      parts.armL.rotation.x = parts.armR.rotation.x = -0.2 - 2.2 * k;
      parts.head.rotation.x = -0.25 * k;
      parts.snack.visible = false;
      return true;
    };
    // Standing about, with the odd scratch and remark
    const runIdle = (cave, dt) => {
      const parts = cave.parts, a = cave.act;
      cave.root.position.y = groundY(cave) + cave.hop;
      parts.torso.scale.y = 1 + Math.sin(elapsed * 2.2 + cave.phase) * 0.015;
      if (cave.cheer > 0) {
        const wave = Math.sin(elapsed * 14 + cave.phase) * 0.35;
        parts.armL.rotation.x = -2.6 + wave;
        parts.armR.rotation.x = -2.6 - wave;
        parts.head.rotation.x = -0.15;
        if (cave.hop === 0 && cave.hopV <= 0) cave.hopV = 2.2;
        return;
      }
      if (cave.catchT > 0) {
        const k = cave.catchT;
        parts.armL.rotation.x = -0.2 - k * 1.6;
        parts.armR.rotation.x = -0.2 - k * 1.6;
        parts.head.rotation.x = -k * 0.2;
        return;
      }
      if (runYawn(cave)) return;
      parts.head.rotation.y = Math.sin(elapsed * 0.9 + cave.phase) * 0.55;
      parts.head.rotation.x = 0.08 + Math.sin(elapsed * 0.5 + cave.phase) * 0.1;
      const scratch = Math.max(0, Math.sin(elapsed * 1.7 + cave.phase * 2) - 0.6) * 2.5;
      parts.armR.rotation.x = -0.2 - scratch * 1.6;
      parts.armL.rotation.x = damp(parts.armL.rotation.x, -0.2, 10, dt);
      if (!a.said && elapsed > a.sayAt) {
        a.said = true;
        if (Math.random() < 0.6) ctx.fx.say(cave, quoteFor(), 2);
      }
      if (elapsed < a.until) return;
      parts.head.rotation.y = 0;
      parts.head.rotation.x = 0;
      if (!wanderSpot || (world.level >= 1 && (a.trips >= TRIPS_MAX || Math.random() < 0.45))) {
        a.kind = "eat";
        walkToSlot(cave, true);
        if (cave.walk) cave.walk.speed = 1.6;
      } else {
        startWander(cave);
      }
    };
    // Thrust against gravity, with a ceiling and capped fall
    const runJet = (cave, dt) => {
      const jet = cave.jet;
      if (jet.thrust) {
        cave.hopV = Math.min(cave.hopV + JET_ACCEL * dt, JET_RISE);
        if (cave.hop >= JET_CEILING) cave.hopV = Math.min(cave.hopV, 0);
        jet.puff -= dt;
        if (jet.puff <= 0) {
          jet.puff = JET_PUFF;
          const p = cave.root.position;
          ctx.fx.burst(p.x, p.y + 0.12, p.z, 2, JET_SPARKS, 1.1);
        }
      } else if (cave.hopV < -JET_FALL) cave.hopV = -JET_FALL;
      jet.flame.visible = jet.thrust;
      if (jet.thrust) jet.flame.scale.y = 0.7 + Math.sin(elapsed * 40 + cave.phase) * 0.3;
    };
    // Flying also stops at rock standing above him
    const canStep = (cave, flying, fromX, fromZ, toX, toZ) => {
      const y = cave.root.position.y - cave.baseY;
      return flying
        ? flyable(fromX, fromZ, toX, toZ) && groundAt(toX, toZ, y) <= y
        : walkable(fromX, fromZ, toX, toZ, y);
    };
    // Move the visitor's caveman
    const runPlayer = (cave, dt) => {
      const p = cave.root.position, leap = cave.leap;
      const wasGround = groundY(cave);
      if (cave.jet) runJet(cave, dt);
      const flying = !!cave.jet && (cave.jet.thrust || cave.hop > 0.05);
      const len = Math.hypot(steer.x, steer.z);
      if (len > 0.05) {
        const k = Math.min(1, len) * (flying ? JET_SPEED : PLAYER_SPEED) * dt;
        const dx = steer.x / len * k, dz = steer.z / len * k;
        if (canStep(cave, flying, p.x, p.z, p.x + dx, p.z + dz)) {
          p.x += dx;
          p.z += dz;
        } else if (canStep(cave, flying, p.x, p.z, p.x + dx, p.z)) p.x += dx;
        else if (canStep(cave, flying, p.x, p.z, p.x, p.z + dz)) p.z += dz;
        const heading = Math.atan2(steer.x, steer.z);
        cave.root.rotation.y += Math.atan2(Math.sin(heading - cave.root.rotation.y), Math.cos(heading - cave.root.rotation.y)) * Math.min(1, 12 * dt);
        cave.act.phase += dt * 10;
        walkPose(cave, cave.act.phase);
        cave.parts.snack.visible = false;
      } else {
        cave.act.phase = 0;
        standPose(cave);
        cave.parts.torso.scale.y = 1 + Math.sin(elapsed * 2.2 + cave.phase) * 0.015;
      }
      // Airborne after a ledge the leap carries him on, fading, legs tucked
      if (cave.hop > 0 && (leap.vx || leap.vz)) {
        const dx = leap.vx * dt, dz = leap.vz * dt;
        if (canStep(cave, flying, p.x, p.z, p.x + dx, p.z + dz)) {
          p.x += dx;
          p.z += dz;
        }
        leap.vx = damp(leap.vx, 0, 1.5, dt);
        leap.vz = damp(leap.vz, 0, 1.5, dt);
        flyPose(cave);
      }
      if (flying) flyPose(cave);
      // Airborne he holds a world height, so ground steps never lift him
      if (flying || cave.hop > 0) cave.hop = Math.max(0, cave.hop + wasGround - groundY(cave));
      else {
        // Off a ledge, support at the new spot is the lower layer (walkable lets any drop
        // through) and the height line below would snap him down in one frame; carry the
        // drop in hop instead so he leaves at his old height and falls forward
        const drop = wasGround - groundY(cave);
        if (drop > STEP) {
          cave.hop += drop;
          cave.hopV = Math.max(cave.hopV, 2.4);
          leap.vx = Math.sin(cave.root.rotation.y) * 3;
          leap.vz = Math.cos(cave.root.rotation.y) * 3;
        }
      }
      // One place sets the height, so nothing compounds
      cave.root.position.y = groundY(cave) + cave.hop;
      if (cave.hop === 0 && (leap.vx || leap.vz)) {
        leap.vx = leap.vz = 0;
        leap.land = 0.25;
        ctx.fx.burst(p.x, p.y + 0.05, p.z, 6, LAND_DUST, 1.2);
      }
      if (leap.land > 0) {
        leap.land = Math.max(0, leap.land - dt);
        cave.parts.torso.scale.y = 1 - leap.land * 0.6;
      }
      if (cave.catchT > 0) {
        const k = cave.catchT;
        cave.parts.armL.rotation.x = -0.2 - k * 1.6;
        cave.parts.armR.rotation.x = -0.2 - k * 1.6;
        cave.parts.head.rotation.x = -k * 0.2;
      } else cave.parts.head.rotation.x = 0;
    };
    const updateCaveman = (cave, dt) => {
      const parts = cave.parts;
      cave.highlight = damp(cave.highlight, cave.highlightTarget, 12, dt);
      for (const key of BODY_PARTS) parts[key].highlight = cave.highlight;
      if (cave.hopV > 0 || cave.hop > 0) {
        cave.hopV -= 9.8 * dt;
        cave.hop = Math.max(0, cave.hop + cave.hopV * dt);
        if (cave.hop === 0 && cave.hopV < 0) cave.hopV = 0;
      }
      if (cave.cheer > 0) cave.cheer -= dt;
      if (cave.yawn > 0) cave.yawn -= dt;
      if (cave.catchT > 0) cave.catchT = Math.max(0, cave.catchT - dt * 1.6);
      for (const node of cave.swagNodes) {
        if (node.swag.float) node.position.y = (node.swag.offset ? node.swag.offset.y : 0) + Math.sin(elapsed * 2.5 + cave.phase) * 0.04;
        for (const child of node.children) if (child.spin) child.rotation.y += dt * 9;
      }
      if (cave.state !== "working") {
        if (cave.state === "sleeping") {
          parts.torso.scale.y = 1 + Math.sin(elapsed * 1.4 + cave.phase) * 0.03;
          cave.zzzTimer -= dt;
          if (cave.zzzTimer <= 0) {
            cave.zzzTimer = 1.6;
            ctx.fx.zzzAt(cave.bedroll.x + 0.6, 0.55, cave.bedroll.z);
          }
        }
        return;
      }
      if (cave === player) {
        runPlayer(cave, dt);
        return;
      }
      if (cave.walk) {
        runWalk(cave, dt);
        return;
      }
      if (cave.build) {
        runBuild(cave, dt);
        cave.root.position.y = groundY(cave) + cave.hop;
        return;
      }
      if (cave.act.kind === "idle") {
        runIdle(cave, dt);
        return;
      }
      // Idle breathing scales the torso, not the root
      cave.root.position.y = groundY(cave) + cave.hop;
      parts.torso.scale.y = 1 + Math.sin(elapsed * 2.2 + cave.phase) * 0.015;
      const fed = world.level >= 1;
      if (cave.cheer > 0) {
        const wave = Math.sin(elapsed * 14 + cave.phase) * 0.35;
        parts.armL.rotation.x = -2.6 + wave;
        parts.armR.rotation.x = -2.6 - wave;
        parts.head.rotation.x = -0.15;
        parts.snack.visible = false;
        if (cave.hop === 0 && cave.hopV <= 0) cave.hopV = 2.2;
        return;
      }
      if (cave.catchT > 0) {
        const k = cave.catchT;
        parts.armL.rotation.x = -0.2 - k * 1.6;
        parts.armR.rotation.x = -0.2 - k * 1.6;
        parts.head.rotation.x = -k * 0.2;
        return;
      }
      if (runYawn(cave)) return;
      // Settle the club arm back to rest
      parts.armL.rotation.x = damp(parts.armL.rotation.x, -0.2, 10, dt);
      if (wanderSpot) {
        if (!fed && cave.act.until > elapsed + HUNGRY_LINGER) cave.act.until = elapsed + HUNGRY_LINGER;
        if (elapsed > cave.act.until) {
          startWander(cave);
          return;
        }
      }
      if (fed) {
        if (elapsed > cave.nextBuildAt && (buildSpots.length || builtEquipment.length)) {
          startBuild(cave);
          return;
        }
        world.level = Math.max(0, world.level - EAT_RATE * dt);
        const chew = (elapsed + cave.phase) % CHEW_PERIOD / CHEW_PERIOD;
        if (chew < 0.18) parts.armR.rotation.x = lerp(-0.2, -1.05, chew / 0.18);
        else if (chew < 0.42) parts.armR.rotation.x = lerp(-1.05, -2.3, (chew - 0.18) / 0.24);
        else if (chew < 0.58) parts.armR.rotation.x = lerp(-2.3, -0.2, (chew - 0.42) / 0.16);
        else parts.armR.rotation.x = -0.2;
        parts.head.rotation.x = chew > 0.34 && chew < 0.54 ? Math.sin((chew - 0.34) / 0.2 * Math.PI) * 0.22 : 0;
        parts.snack.visible = chew >= 0.18 && chew < 0.42;
        parts.snack.scale.x = parts.snack.scale.y = parts.snack.scale.z = models.BANANA_AMMO_SCALE;
      } else {
        parts.armR.rotation.x = -0.1;
        parts.snack.visible = false;
        parts.head.rotation.x = 0.35;
      }
    };
    // ---------- the jetpack ----------
    // Put the jetpack on a caveman's back
    const wearJetpack = (cave, geometry, flameGeometry) => {
      if (cave.jet) return null;
      const h = cave.traits.height;
      const node = createNode({ position: { x: 0, y: 0.06 * h, z: -0.18 * h }, scale: { x: h, y: h, z: h }, geometry });
      const flame = createNode({ geometry: flameGeometry, visible: false });
      addChild(node, flame);
      addChild(cave.root, node);
      cave.jet = { node, flame, thrust: false, puff: 0 };
      return node;
    };
    const thrust = (on) => {
      if (player && player.jet) player.jet.thrust = !!on;
    };

    // ---------- the visitor's caveman ----------
    const control = (cave) => {
      if (cave.state !== "working" || cave === player) return false;
      release();
      player = cave;
      releaseBuild(cave);
      cave.walk = null;
      cave.act.kind = "player";
      cave.act.phase = 0;
      cave.parts.gun.visible = false;
      cave.parts.snack.visible = false;
      cave.parts.head.rotation.x = 0;
      cave.parts.head.rotation.y = 0;
      standPose(cave);
      cave.root.position.y = groundY(cave);
      return true;
    };
    const release = () => {
      if (!player) return;
      const cave = player;
      player = null;
      steer.x = steer.z = 0;
      cave.leap.vx = cave.leap.vz = cave.leap.land = 0;
      if (cave.jet) {
        cave.jet.thrust = false;
        cave.jet.flame.visible = false;
      }
      standPose(cave);
      cave.root.position.y = groundY(cave);
      cave.act.kind = "idle";
      cave.act.until = elapsed + 1.5;
      cave.act.said = true;
      cave.act.trips = 0;
    };
    const steerPlayer = (x, z) => {
      steer.x = x;
      steer.z = z;
    };
    // Space eats, opens, pokes, uses props or shouts
    const playerAction = () => {
      if (!player) return false;
      const p = player.root.position;
      if (world.level >= 1 && Math.hypot(p.x, p.z) < ctx.pile.pileEdge() + REACH && ctx.pile.eatFromPile(player)) {
        ctx.fx.say(player, "Nom nom.", 1.6);
        return true;
      }
      if (ctx.crates) {
        for (const crate of ctx.crates.list) {
          if (crate.opened || !crate.node.visible || Math.abs(crate.node.position.y) > 0.05) continue;
          if (Math.hypot(crate.node.position.x - p.x, crate.node.position.z - p.z) < REACH) {
            ctx.crates.openCrate(crate);
            return true;
          }
        }
      }
      for (const other of cavemen.values()) {
        if (other === player || !other.root.visible) continue;
        if (Math.hypot(other.root.position.x - p.x, other.root.position.z - p.z) < REACH) {
          pokeCave(other);
          return true;
        }
      }
      if (ctx.useNear && ctx.useNear(p.x, p.z, REACH + 0.6)) return true;
      hopCave(player, 3);
      ctx.fx.say(player, SHOUTS[randomInt(SHOUTS.length)], 1.6);
      return true;
    };
    const applySwag = (cave) => {
      for (const anchorKey of SWAG_ANCHORS) {
        const anchor = cave.parts[anchorKey];
        for (const child of anchor.children.slice()) removeChild(anchor, child);
        anchor.visible = false;
      }
      cave.swagNodes.length = 0;
      cave.parts.club.geometry = cave.skins.club.default;
      cave.parts.gunBody.geometry = cave.skins.gun.default;
      const entryId = game.state.assignments[cave.traits.name];
      const item = entryId ? game.itemOf(entryId) : null;
      if (!item) return;
      if (item.skin) {
        // Weapon items reskin the club or rifle
        const target = item.skin === "club" ? cave.parts.club : cave.parts.gunBody;
        target.geometry = cave.skins[item.skin].gold;
        return;
      }
      const anchor = item.slot === "face" ? cave.parts.face : cave.parts.hat;
      const node = item.buildNode();
      if (item.offset) Object.assign(node.position, item.offset);
      if (item.rotation) Object.assign(node.rotation, item.rotation);
      node.swag = item;
      addChild(anchor, node);
      anchor.visible = true;
      cave.swagNodes.push(node);
    };
    const applyAllSwag = () => {
      for (const cave of cavemen.values()) applySwag(cave);
    };
    const wornBy = (name) => {
      const item = game.itemOf(game.state.assignments[name] || "");
      return item ? item.name : null;
    };
    const renderLocker = () => hud.renderInventory(game.state.inventory, game.assignedTo, wornBy);
    const hopCave = (cave, strength = 2.6) => {
      if (cave.state === "sleeping") return;
      cave.hopV = Math.max(cave.hopV, strength);
    };
    const pokeCave = (cave) => {
      if (cave.state === "sleeping") {
        ctx.fx.say(cave, SLEEP_POKES[randomInt(SLEEP_POKES.length)], 1.8);
        return;
      }
      hopCave(cave);
      ctx.fx.say(cave, POKES[randomInt(POKES.length)], 1.8);
    };
    // Build quotes, drawn by fx.drawOverlay
    const drawQuotes = (ctx2d, project, drawBubble) => {
      for (const cave of cavemen.values()) {
        const b = cave.build;
        if (!b || b.phase === "return") continue;
        const pos = project(cave.root.position.x, cave.root.position.y - cave.baseY + cave.headOffset + 0.45, cave.root.position.z);
        if (pos) drawBubble(ctx2d, b.quote, pos.x, pos.y, Math.min(1, (b.age || 0) / 0.25));
      }
    };
    const update = (dt, now) => {
      elapsed = now;
      for (const cave of cavemen.values()) updateCaveman(cave, dt);
    };
    const dispose = () => {
      player = null;
      for (const cave of cavemen.values()) {
        releaseBedroll(cave);
        for (const key of BODY_PARTS) input.remove(cave.parts[key]);
        removeChild(root, cave.root);
      }
      cavemen.clear();
      for (const node of bulletPool) removeChild(root, node);
      bulletPool.length = 0;
      removeChild(root, flash);
      for (const built of builtEquipment) removeChild(root, built.node);
      builtEquipment.length = 0;
      for (const node of dismantling) removeChild(root, node);
      dismantling.length = 0;
    };
    const stats = () => ({ built: builtEquipment.length });
    return {
      cavemen, stateOf, stateCounts, workingCavemen, eatingCavemen, feedableCavemen, refreshStates, refreshRosterRow, updateFan, rush, headWorldOf, applyAllSwag, wornBy, renderLocker, pokeCave, drawQuotes,
      control, release, steer: steerPlayer, playerAction, wearJetpack, thrust, update, dispose, stats,
      get player() {
        return player;
      }
    };
  };
  BL.crew = { create, EAT_RATE };
})();
