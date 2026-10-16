// Free Puppies Rescue: the kennel yard behind the 10 o'clock mouth. Puppies of six breeds wait round three dog houses
// (`dogs.js`); a tap on a dog house, the "Adopt a puppy" board or a puppy opens the adoption, which names a puppy for
// any Ooga still without a dog. The one adopted for the Ooga walked in follows it here and back out on the island;
// one adopted for an Ooga out on the island trots out of the door to find it. The island's goal hangs on the back
// wall with its count under it. Escape, the Leave button and the doorway go back to the island.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible, boundsOf } = BL.scene;

  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  // The room: x within HALF_W either side, z from BACK to FRONT, h high, with the doorway |x| < door in the front wall.
  const ROOM = { halfW: 5.5, back: -8.4, front: 4.6, h: 4.4, door: 1.25, doorH: 2.7 };
  const PITCH = [-0.2, 1.3], DIST = [3, 12];
  const FOLLOW = { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] };
  const FLY = { speed: 4, perDist: 0.4, climb: 3, yMax: ROOM.h - 0.6 };
  const view = (x, y, z, yaw, pitch, dist) => ({ yaw, pitch, dist, target: { x, y, z } });
  const PRESETS = { yard: view(0, 1.2, -3.8, 0, 0.42, 7.4), houses: view(0, 1.1, -6, 0, 0.2, 4.6) };
  const RENDER_OPTS = {
    clear: [0.05, 0.045, 0.035], sky: [0.46, 0.42, 0.34], ground: [0.24, 0.2, 0.14],
    direct: [0.62, 0.55, 0.45], directStrength: 0.32, ambientFloor: 0.34,
    sun: { x: 0.2, y: 0.9, z: 0.4 }, shadowCenter: { x: 0, y: 1.5, z: -2 }, shadowExtent: 8,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 0.9,
    fog: [0.06, 0.05, 0.04], fogNear: 12, fogFar: 26
  };
  // The dog houses along the back, the bowls before them, the board by the path; the spots the puppies wait on (one a
  // breed) facing the doorway; and the door a dog leaves by.
  const HOUSES = [[-3.5, -7.1, 0], [0, -7.3, 1], [3.5, -7.1, 2]];
  const BOWLS = [[-1.7, -4.9, 0], [1.8, -5, 1], [4.2, -3.2, 0]];
  const BOARD = { x: -3.4, z: -3.3, yaw: 0.45 };
  const YARD = { spots: [[-3.5, -5.7], [0, -5.9], [3.5, -5.7], [-2.2, -3.6], [2.6, -3.4], [0.3, -2.6]], wander: 1, centre: [0, -4.2], bed: 1.4 };
  const REACH = 1.8;
  // Point lights: over the dog houses, the middle of the yard and the light in from the doorway.
  const LAMPS = [[0, 3, -6.2, 8, 1.25, 0.92, 0.65], [0, 3.7, -2, 8.5, 1.15, 0.84, 0.58], [0, 2.4, ROOM.front - 0.6, 6, 1.1, 0.95, 0.75]];
  // Picks are by sphere: a unit box gives a target its centre.
  const PICK = { verts: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], faces: [], lines: [] };
  const TIPS = {
    kennel: ["Dog house · tap to adopt a puppy", null],
    board: ["Adopt a puppy", null],
    goal: ["The island's goal: every Ooga needs a dog", null],
    bowl: ["Food bowl · feed the hungriest dog", null]
  };

  let renderer, game, world, go, root, camera, hud, hooks, input, pilot, fx, people = null, avatar = null, playerWorld = null;
  let dogs = null, blocks = null, remotes = null, unsubscribeAccount = null, bananas = null;
  let leaving = false, prompt = false, goalCount = -1, goalText = "";
  const targets = [], NO_ACTORS = [];

  const mayPossess = (cave) => BL.net.mayDrive(cave.traits.name, contributors.stateFor(cave.contributor) === "working");
  // Who may walk in here: an Ooga the visitor may drive that the island has out. One away from the island could not
  // be handed back at the mouth on leaving, and the visitor would come out driving nobody.
  const mayPick = (c) => contributors.stateFor(c) !== "away" && !BL.net.mayDrive(c.name, contributors.stateFor(c) === "working");
  const accountChanged = () => {
    if (!avatar) return;
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    if (denied && people.player === avatar) {
      pilot.release(true);
      hud.toast(denied);
    }
  };

  // The yard's furniture from the shared kit, baked once for the page: the dog houses, the bowls, rubble in the
  // corners and two strings of bulbs.
  const dressing = models.cached(() => {
    const set = BL.dressing.set();
    for (const [x, z, v] of HOUSES) set.put("kennel", x, 0, z, 0, v);
    for (const [x, z, v] of BOWLS) set.put("foodBowl", x, 0, z, 0, v);
    set.put("barrel", -4.8, 0, 2.8, 0, 0); set.put("rubble", -4.9, 0, 3.4, 0, 0); set.put("rubble", 4.9, 0, 3.3, 1, 1);
    set.cable(-ROOM.halfW + 0.2, 4.1, -5.2, ROOM.halfW - 0.2, 4.1, -5.2, 0.3, [0.18, 0.82], "bulb", 0);
    set.cable(-ROOM.halfW + 0.2, 4.2, -0.6, ROOM.halfW - 0.2, 4.2, -0.6, 0.35, [0.22, 0.78], "bulb", 0);
    return set.build();
  });
  const signNode = (text, icon, width, x, y, z) => {
    const geo = BL.hubModels.caveSign(text, icon), b = boundsOf(geo), k = width / (b.max[0] - b.min[0]);
    return createNode({ position: { x, y, z }, scale: { x: k, y: k, z: k }, geometry: geo });
  };
  const target = (node, owner, radius) => {
    input.add(node, owner, { radius });
    targets.push(node);
  };
  const pickAt = (x, y, z, owner, radius) => {
    const pick = createNode({ position: { x, y, z }, geometry: PICK });
    BL.scene.updateWorld(pick);
    target(pick, owner, radius);
  };
  // The room's shell: a packed-earth floor, rock walls with the doorway in the front one and daylight beyond it.
  const build = () => {
    const { halfW, back, front, h, door, doorH } = ROOM, depth = front - back, rock = (w, hh) => models.panel({ w, h: hh, tilesX: Math.max(1, Math.round(w)), tilesY: 3, color: "#5d554d", altColor: "#564f48" });
    addChild(root, createNode({ position: { x: 0, y: 0, z: (front + back) / 2 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, geometry: models.panel({ w: halfW * 2, h: depth, tilesX: 10, tilesY: 10, color: "#6f6046", altColor: "#675942" }), depthBias: 1.2 }));
    const ceiling = models.panel({ w: halfW * 2, h: depth, tilesX: 5, tilesY: 5, color: "#2e2924", altColor: "#2a2520" });
    ceiling.castShadow = false;
    addChild(root, createNode({ position: { x: 0, y: h, z: (front + back) / 2 }, rotation: { x: Math.PI / 2, y: 0, z: 0 }, geometry: ceiling }));
    const wall = (w, hh, x, y, z, ry) => addChild(root, createNode({ position: { x, y, z }, rotation: { x: 0, y: ry, z: 0 }, geometry: rock(w, hh), depthBias: 1.1 }));
    wall(halfW * 2, h, 0, h / 2, back, 0);
    wall(depth, h, -halfW, h / 2, (front + back) / 2, Math.PI / 2);
    wall(depth, h, halfW, h / 2, (front + back) / 2, -Math.PI / 2);
    const side = halfW - door;
    wall(side, h, -door - side / 2, h / 2, front, Math.PI);
    wall(side, h, door + side / 2, h / 2, front, Math.PI);
    wall(door * 2, h - doorH, 0, (h + doorH) / 2, front, Math.PI);
    // Timber jambs and lintel round the doorway, and the island's daylight out beyond it.
    const timber = models.merge(
      models.box({ w: 0.24, h: doorH, d: 0.3, color: "#5c3a1e", offset: { x: -door - 0.06, y: doorH / 2 } }),
      models.box({ w: 0.24, h: doorH, d: 0.3, color: "#5c3a1e", offset: { x: door + 0.06, y: doorH / 2 } }),
      models.box({ w: door * 2 + 0.6, h: 0.26, d: 0.32, color: "#8a5a32", offset: { y: doorH + 0.1 } }));
    addChild(root, createNode({ position: { x: 0, y: 0, z: front - 0.1 }, geometry: timber }));
    const day = models.panel({ w: door * 2 + 1, h: doorH + 0.6, tilesX: 1, tilesY: 1, color: "#f4e6c2", emissive: 0.9 });
    day.castShadow = false;
    addChild(root, createNode({ position: { x: 0, y: (doorH + 0.6) / 2, z: front + 1.6 }, rotation: { x: 0, y: Math.PI, z: 0 }, geometry: day }));
    addChild(root, ...BL.dressing.nodes(dressing(), { glow: 1 }));
    // The island's goal over the dog houses (its count is drawn under it), and the adoption board by the path.
    addChild(root, signNode("EVERY OOGA NEEDS A DOG", "paw", 4.4, 0, 2.95, back + 0.25));
    pickAt(0, 2.8, back + 0.4, { kind: "goal" }, 1.4);
    addChild(root, createNode({ position: { x: BOARD.x, y: 0, z: BOARD.z }, rotation: { x: 0, y: BOARD.yaw, z: 0 }, geometry: BL.hubModels.postSign("Adopt a puppy", 0.62, 0.55) }));
    pickAt(BOARD.x, 1, BOARD.z, { kind: "board" }, 1.2);
    // Pick spheres for the dog houses and bowls, and the boxes the walkers keep out of.
    blocks = [];
    for (const [x, z] of HOUSES) {
      blocks.push([x - 0.62, x + 0.62, z - 0.62, z + 0.62]);
      pickAt(x, 0.7, z + 0.3, { kind: "kennel" }, 0.8);
    }
    for (const [x, z] of BOWLS) pickAt(x, 0.15, z, { kind: "bowl" }, 0.35);
    const c = Math.cos(BOARD.yaw), s = Math.sin(BOARD.yaw);
    for (const side of [-1, 1]) {
      const px = BOARD.x + c * side * 1.05, pz = BOARD.z - s * side * 1.05;
      blocks.push([px - 0.12, px + 0.12, pz - 0.12, pz + 0.12]);
    }
    blocks.push([-5, -4.6, 2.4, 3.2]);
  };

  const BODY = 0.4;
  // How far a body of half-width r at (x, z) reaches through the walls, negative when clear: the front wall stands
  // either side of the doorway.
  const wallDepth = (x, z, r) => Math.max(Math.abs(x) + r - ROOM.halfW, ROOM.back + r - z, Math.min(z + r - ROOM.front, Math.abs(x) + r - ROOM.door));
  const into = (b, x, z, r) => r - Math.max(b[0] - x, x - b[1], b[2] - z, z - b[3]);
  // A step may never take a body further into a wall or a box than it already is, so it can always walk away.
  const walkableFor = (ax, az, bx, bz, y, height, actor) => {
    const r = Math.min(actor.bodyRadius || BODY, BODY);
    if (bz > ROOM.front + 2) return false;
    if (wallDepth(bx, bz, r) > Math.max(0, wallDepth(ax, az, r)) + 1e-6) return false;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i], to = into(b, bx, bz, r);
      if (to > 1e-6 && to > into(b, ax, az, r) + 1e-6) return false;
    }
    return true;
  };
  const groundFor = () => 0;

  const leaveCave = () => {
    if (leaving) return;
    leaving = true;
    go("hub");
  };
  // The adoption: a puppy of each breed, the Oogas still without a dog (the one walked in first), a name.
  const openAdoption = (breed = -1) => {
    if (leaving) return;
    const owners = contributors.activeRoster.filter((c) => !dogs.hasDog(c.name)).map((c) => ({ name: c.name, display: c.display }));
    if (!owners.length) {
      hud.toast("Every Ooga on the island has a dog!");
      return;
    }
    hud.tooltip.hide();
    const mine = avatar && !dogs.hasDog(avatar.traits.name) ? avatar.traits.name : owners[0].name;
    hud.openAdopt({ breeds: BL.dogs.BREEDS, faces: BL.dogs.FACES, faceInk: BL.dogs.FACE_INK, breed: breed >= 0 ? breed : BL.dogs.breedFor(mine), owners, owner: mine, name: BL.dogs.nameFor(mine) });
  };
  const confirmAdoption = () => {
    const choice = hud.adoptChoice(), entry = dogs.adopt(choice.owner, choice.breed, choice.name);
    if (!entry) {
      hud.toast("That Ooga already has a dog.");
      return null;
    }
    hud.closeAdopt();
    const kind = BL.dogs.BREEDS[entry.breed].name, here = avatar && entry.owner === avatar.traits.name;
    const who = contributors.roster.find((c) => c.name === entry.owner);
    hud.toast(here ? `${entry.name} the ${kind} now follows ${avatar.traits.display}!` : `${entry.name} the ${kind} runs out to find ${who ? who.display : entry.owner} on the island!`);
    return entry;
  };
  const tipFor = (hit) => {
    const o = hit.owner;
    if (o.kind === "dog") return dogs.tooltip(o.dog);
    if (o.kind === "caveman") return o.cave.traits.display;
    return TIPS[o.kind] ? TIPS[o.kind][0] : "";
  };
  const onTap = (hit) => {
    if (!hit) return;
    const o = hit.owner;
    if (o.kind === "kennel" || o.kind === "board" || o.kind === "goal") openAdoption();
    else if (o.kind === "dog") {
      const breed = dogs.tap(o.dog);
      if (breed >= 0) openAdoption(breed);
    } else if (o.kind === "bowl") dogs.feedHungriest();
    else if (o.kind === "caveman") people.pokeCave(o.cave);
  };
  // Act beside a dog house or the board opens the adoption.
  const nearAdoption = (x, z, reach) => {
    if (Math.hypot(x - BOARD.x, z - BOARD.z) < reach) return true;
    for (const [hx, hz] of HOUSES) if (Math.hypot(x - hx, z - hz - 0.9) < reach) return true;
    return false;
  };
  const useNear = (x, z, reach) => {
    if (!nearAdoption(x, z, Math.max(reach, REACH))) return false;
    openAdoption();
    return true;
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      leaveCave();
      return true;
    }
    return false;
  };
  // A payment can arrive while the visitor is inside: counted and onto the pile like everywhere else.
  const onDonation = (donation, counted = null) => {
    game.recordDonation(donation, counted && counted.exact);
    world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
  };
  const onLootCleared = () => {};

  const lightUp = () => {
    const L = RENDER_OPTS.lights;
    LAMPS.forEach((lamp, k) => {
      L.set(lamp, k * 8);
      L[k * 8 + 7] = 0;
    });
    RENDER_OPTS.lightCount = LAMPS.length;
  };
  const update = (dt, elapsed) => {
    pilot.readInput(dt);
    if (people) people.update(dt, elapsed);
    pilot.update(dt);
    // The Ooga driven here goes to the room with where it stands and its health; other players here are shown.
    const drivenHere = people && people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) {
      const p = drivenHere.root.position;
      BL.net.sendPose(p.x, p.y - drivenHere.baseY, p.z, drivenHere.root.rotation.y);
      BL.net.setHealth(drivenHere.health.value, drivenHere.health.stunned);
    }
    remotes.update(dt);
    dogs.update(dt, elapsed);
    if (avatar && !leaving) {
      const p = avatar.root.position, near = people.player === avatar && nearAdoption(p.x, p.z, REACH);
      if (near !== prompt) {
        prompt = near;
        if (near) {
          hud.hint(COARSE ? "Tap ADOPT to adopt a puppy" : "Space: adopt a puppy");
          hud.setAct("ADOPT");
        } else pilot.showAct();
      }
      if (p.z > ROOM.front + 0.6 && Math.abs(p.x) < ROOM.door) leaveCave();
    }
    stepTweens(dt);
    fx.update(dt, elapsed);
  };
  // The goal's count under its sign, rebuilt only when an adoption changes it.
  const drawGoal = (ctx, project) => {
    const have = game.state.rescue.dogs.length;
    if (have !== goalCount) {
      goalCount = have;
      goalText = `${have} / ${contributors.activeRoster.length} Oogas have a dog`;
    }
    const pos = project(0, 2.3, ROOM.back + 0.3);
    if (!pos) return;
    ctx.font = "bold 17px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a0f08";
    ctx.fillStyle = "#ffd27a";
    ctx.strokeText(goalText, pos.x, pos.y);
    ctx.fillText(goalText, pos.x, pos.y);
    ctx.textAlign = "left";
  };
  const drawExtra = (ctx2d, project, drawBubble) => {
    if (people) people.drawQuotes(ctx2d, project, drawBubble);
    drawGoal(ctx2d, project);
    dogs.drawOverlay(ctx2d, project);
    remotes.drawNames(ctx2d, project);
  };
  const overlay = (dt) => fx.drawOverlay(dt, drawExtra);

  const enter = (ctx) => {
    ({ renderer, game, world, go } = ctx);
    camera = createCamera({ fov: 55, near: 0.2, far: 60 });
    root = createNode();
    hud = hudMod.create({ roster: contributors.activeRoster, catalog: models.SWAG, tierColors: models.TIER_COLORS, renderIcon: hudMod.renderIcon, lootEnabled: ctx.lootEnabled });
    if (window.matchMedia("(max-width: 720px), (max-height: 500px)").matches) hud.el.sheet.dataset.open = "false";
    hooks = {};
    input = interactMod.create({ canvas: ctx.canvas, renderer, camera, hooks });
    const clampTarget = (p) => {
      p.x = clamp(p.x, -ROOM.halfW + 1, ROOM.halfW - 1);
      p.y = clamp(p.y, 0.5, ROOM.h - 1);
      p.z = clamp(p.z, ROOM.back + 1, ROOM.front - 0.5);
    };
    const clampCamera = (p) => {
      p.x = clamp(p.x, -ROOM.halfW + 0.4, ROOM.halfW - 0.4);
      p.y = clamp(p.y, 0.5, ROOM.h - 0.4);
      p.z = clamp(p.z, ROOM.back + 0.4, ROOM.front - 0.4);
    };
    pilot = pilotMod.create({
      renderer, canvas: ctx.canvas, camera, hud, presets: PRESETS, landing: "yard", pitch: PITCH, dist: DIST,
      follow: FOLLOW, fly: FLY, clampTarget, clampCamera, ceilingAt: () => ROOM.h - 0.4, coarse: COARSE, mayPossess,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: groundFor }
    });
    Object.assign(hooks, {
      onHover: (hit, p) => {
        if (hit) hud.tooltip.show(tipFor(hit), p.x, p.y);
        else hud.tooltip.hide();
      },
      onHoverMove: (hit, p) => hud.tooltip.show(tipFor(hit), p.x, p.y),
      onTap,
      ...pilot.hooks
    });
    hud.onPreset(pilot.goPreset);
    hud.onAction((action) => {
      if (action === "leave") leaveCave();
      else if (action === "reset-view") pilot.goPreset("yard");
      else if (action === "act") pilot.action();
      else if (action === "mode-retake") pilot.modeAction(action);
      else if (action === "adopt-open") openAdoption();
      else if (action === "adopt-go") confirmAdoption();
    });
    fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 3.5, z: -5.5 } });
    build();
    // Whoever walked in from the island comes through the doorway; a page that opens here takes `character=` as the
    // island does, else the roster's default pick walks in.
    const asked = ctx.from === null ? new URLSearchParams(location.search).get("character")?.trim().toLowerCase() : null;
    const named = asked ? contributors.roster.find((c) => c.name.toLowerCase() === asked) : null;
    const wanted = named ? named.name : world.pilot;
    const wantedEntry = wanted && contributors.roster.find((c) => c.name === wanted);
    const playerName = wantedEntry && mayPick(wantedEntry) ? wanted : contributors.activeRoster.find(mayPick)?.name || null;
    world.pilot = null;
    playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    const shared = { root, input, hud, game, world: playerWorld, playerName, fx, viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt: groundFor, walkable: walkableFor, useNear };
    people = shared.crew = BL.crew.create(shared);
    pilot.bind(shared);
    avatar = playerName ? people.cavemen.get(playerName) : null;
    if (avatar) {
      Object.assign(avatar.root.position, { x: 0, y: avatar.baseY, z: -1 });
      avatar.root.rotation.y = Math.PI;
      pilot.possess(avatar);
      // Empty-handed, as in Ooga Arcade: no rifle on the back and no aiming.
      avatar.weapon.secondaryOwned = false;
      people.selectWeapon(0, avatar);
      avatar.weapon.aiming = false;
      avatar.parts.gun.visible = false;
      hud.hint(COARSE ? "Walk to a dog house and tap it" : "W A S D walk · tap a dog house to adopt a puppy", 6000);
    } else pilot.goPreset("yard");
    // Bananas for the dogs come off the island's pile, as out on the island.
    bananas = { eatFromPile: () => {
      if (world.level < 1) return false;
      world.level = Math.max(0, world.level - 1);
      return true;
    } };
    const spots = new Float32Array(YARD.spots.length * 3);
    YARD.spots.forEach(([x, z], k) => spots.set([x, z, 0], k * 3));
    dogs = BL.dogs.create({ root, game, crew: people, pile: bananas, fx, hud, island: false, total: contributors.activeRoster.length,
      yard: { x: YARD.centre[0], y: 0, z: YARD.centre[1], spots, wander: YARD.wander, bedRadius: YARD.bed, door: [0, ROOM.front + 0.8] },
      addTarget: (node, owner, opts) => target(node, owner, opts.radius), pickGeometry: PICK, groundAt: groundFor });
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    remotes = BL.remotePlayers.create({ root, crew: people });
    lightUp();
    leaving = false;
    prompt = false;
    goalCount = -1;
    rescueScene.root = root;
    rescueScene.camera = camera;
    rescueScene.input = input;
    rescueScene.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people.cavemen,
      get dogs() { return dogs.debug; },
      rescue: { open: openAdoption, confirm: confirmAdoption, houses: HOUSES, board: BOARD, room: ROOM, get goal() { return goalText; } }
    };
  };
  const leave = () => {
    // Whoever walked in goes back out to the island at this mouth as themselves, its dog with it.
    if (avatar) world.pilot = avatar.traits.name;
    unsubscribeAccount();
    unsubscribeAccount = null;
    BL.net.setBody(null);
    hud.closeAdopt();
    dogs.dispose();
    remotes.dispose();
    remotes = null;
    people.dispose();
    fx.dispose();
    pilot.dispose();
    for (const node of targets) input.remove(node);
    targets.length = 0;
    while (root.children.length) removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount;
    input.dispose();
    hud.dispose();
    hud = hooks = input = pilot = fx = people = avatar = playerWorld = dogs = blocks = bananas = null;
    rescueScene.input = rescueScene.debug = null;
    return { targets: count };
  };
  const liveGeometry = (set) => {
    if (avatar) set.add(avatar.headOpen).add(avatar.headClosed);
    if (remotes) remotes.liveGeometry(set);
  };
  const stats = () => {
    let nodes = 0;
    traverseVisible(root, () => nodes++);
    const all = (n) => 1 + n.children.reduce((sum, c) => sum + all(c), 0);
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...dogs.stats(), ...(remotes ? remotes.stats() : {}) };
  };

  const rescueScene = {
    // Voice zone: the yard shares its mouth's group on the island (`cave-c10`).
    voiceZone: "cave-c10.hall",
    id: "rescue", enter, update, overlay, onDonation, onKey, onLootCleared, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get inMotion() {
      return false;
    }
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.rescue = rescueScene;
})();
