// Free Hardware Wallets: the little store behind the 9 o'clock mouth. Its vending machine stands at the back under
// the store's sign; one tap on it (or act beside it) opens the choice of the two devices it gives away, the ClownCard
// and the Rektdger, and Take puts the chosen one in the driven Ooga's hands (`wallet-bombs.js`). Carried, its name and
// countdown float over it and a line along the top says what to do: a tap on the floor walks the Ooga there and sets
// it down exactly where tapped, a tap on one on the floor picks it up again, and the Throw button or T throws it.
// Twenty-one seconds after it was taken it explodes wherever it is, which nothing in the store gives away beforehand;
// devices set down close together go off as one bigger blast. Escape, the Leave button and the doorway go back to the
// island.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { math, models, contributors, hud: hudMod, interact: interactMod, pilot: pilotMod, fx: fxMod } = BL;
  const { clamp } = math;
  const { createNode, addChild, removeChild, createCamera, stepTweens, tweenCount, traverseVisible, boundsOf } = BL.scene;
  const { LOOKS, FUSE } = BL.walletBombs;

  const COARSE = window.matchMedia("(pointer: coarse)").matches;
  // The room: x within HALF_W either side, z from BACK to FRONT, h high, with the doorway |x| < door in the front wall.
  const ROOM = { halfW: 5.5, back: -8.4, front: 4.6, h: 4.4, door: 1.25, doorH: 2.7 };
  const PITCH = [-0.2, 1.3], DIST = [3, 12];
  const FOLLOW = { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] };
  const FLY = { speed: 4, perDist: 0.4, climb: 3, yMax: ROOM.h - 0.6 };
  const view = (x, y, z, yaw, pitch, dist) => ({ yaw, pitch, dist, target: { x, y, z } });
  const PRESETS = { store: view(0, 1.4, -3.6, 0, 0.36, 7.2), machine: view(0, 1.6, -6, 0, 0.12, 4.2) };
  const RENDER_OPTS = {
    clear: [0.05, 0.04, 0.035], sky: [0.44, 0.38, 0.32], ground: [0.22, 0.18, 0.14],
    direct: [0.6, 0.52, 0.44], directStrength: 0.3, ambientFloor: 0.32,
    sun: { x: 0.2, y: 0.9, z: 0.4 }, shadowCenter: { x: 0, y: 1.5, z: -2 }, shadowExtent: 8,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 0, bloomStrength: 1,
    fog: [0.06, 0.05, 0.04], fogNear: 12, fogFar: 26
  };
  // The machine, the spot before it where act opens the choice, and how near that counts.
  const MACHINE = { x: 0, z: -7.3, front: -6.2, reach: 1.7 };
  // A walk to a tapped spot stops this short of it (the device goes down exactly there) and gives up when stuck.
  const SET_DOWN_REACH = 0.55, STUCK_SECONDS = 1.2;
  // What a tap on the room's things says: [tooltip, toast].
  const TIPS = {
    sign: ["Never trust a free hardware wallet.", "Small print: never trust a free hardware wallet. Ooga can not read."],
    crate: ["Crate of free wallets", "Something inside is ticking."],
    vendor: ["Free wallets · tap to choose one", null]
  };
  // The line over the room while a device is carried, for each look and second (no string is built per frame).
  const CARRY_LINES = LOOKS.map((look) => Array.from({ length: FUSE + 1 }, (_, s) => `Carrying ${look.name} · ${s} s · ${COARSE ? "Tap" : "Click"} the ground to place ·`));
  // On a desktop the keys are not on screen, so taking one says how to be rid of it; a phone has the Throw button.
  const TAKE_HINT = "Press T to throw · Click the ground to place";
  // Point lights: the machine's glow, the bulbs over the middle and the light in from the doorway; one more slot for
  // a blast's flash.
  const LAMPS = [[0, 2.6, -6.2, 7, 1.25, 0.9, 0.62], [0, 3.7, -2, 8.5, 1.15, 0.82, 0.55], [0, 2.4, ROOM.front - 0.6, 6, 1.1, 0.95, 0.75]];
  const FLASH = new Float32Array(8);
  // Picks are by sphere: a unit box gives a target its centre.
  const PICK = { verts: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5], faces: [], lines: [] };

  let renderer, game, world, go, root, camera, hud, hooks, input, pilot, fx, people = null, avatar = null, playerWorld = null;
  let walletBombs = null, blocks = null, shop = null, carry = null, remotes = null, unsubscribeAccount = null;
  let leaving = false, prompt = false, shownLine = null;
  const targets = [], NO_ACTORS = [];
  const walk = { on: false, x: 0, z: 0, slot: -1, stuck: 0, lastX: 0, lastZ: 0 };
  const tapAt = { x: 0, y: 0, z: 0 };

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

  // The store's furniture from the shared kit, baked once for the page: the machine at the back, crates of devices and
  // barrels along the walls, rubble in the corners and two strings of bulbs.
  const PIECES = [["walletVendor", MACHINE.x, MACHINE.z, 0, 0], ["deviceCrate", -4.7, -7.5, 0, 1], ["deviceCrate", -4.8, -6.4, 1, 2], ["deviceCrate", 4.7, -7.5, 0, 0],
    ["barrel", 4.8, -6.3, 0, 1], ["barrel", -4.8, 2.8, 0, 0], ["rubble", -4.9, 3.4, 0, 0], ["rubble", 4.9, 3.3, 1, 1]];
  const STANDING = { walletVendor: [0.8, 0.6], deviceCrate: [0.42, 0.42], barrel: [0.36, 0.36] };
  const dressing = models.cached(() => {
    const set = BL.dressing.set();
    for (const [kind, x, z, turns, variant] of PIECES) set.put(kind, x, 0, z, turns, variant);
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
  // The room's shell: a packed-earth floor, rock walls with the doorway in the front one and daylight beyond it.
  const build = () => {
    const { halfW, back, front, h, door, doorH } = ROOM, depth = front - back, rock = (w, hh) => models.panel({ w, h: hh, tilesX: Math.max(1, Math.round(w)), tilesY: 3, color: "#5d554d", altColor: "#564f48" });
    addChild(root, createNode({ position: { x: 0, y: 0, z: (front + back) / 2 }, rotation: { x: -Math.PI / 2, y: 0, z: 0 }, geometry: models.panel({ w: halfW * 2, h: depth, tilesX: 10, tilesY: 10, color: "#6b5a44", altColor: "#635340" }), depthBias: 1.2 }));
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
    // The store's name over the machine, and the small print beside it.
    addChild(root, signNode("FREE HARDWARE WALLETS", "wallet", 4.2, 0, 3.2, back + 0.25));
    const fine = signNode("Never trust a free hardware wallet.", null, 2.9, 2.75, 1.75, back + 0.2);
    addChild(root, fine);
    target(fine, { kind: "sign" }, 0.8);
    // Pick spheres for the machine and the crates, and the boxes the walkers keep out of.
    blocks = [];
    for (const [kind, x, z] of PIECES) {
      const size = STANDING[kind];
      if (!size) continue;
      blocks.push([x - size[0], x + size[0], z - size[1], z + size[1]]);
      if (kind === "barrel") continue;
      const pick = createNode({ position: { x, y: kind === "walletVendor" ? 1.3 : 0.5, z: z + (kind === "walletVendor" ? 0.55 : 0) }, geometry: PICK });
      BL.scene.updateWorld(pick);
      target(pick, { kind: kind === "walletVendor" ? "vendor" : "crate" }, kind === "walletVendor" ? 1 : 0.55);
    }
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
  // Whether (x, z) is open floor a device may be set down on.
  const openFloor = (x, z) => {
    if (wallDepth(x, z, 0.15) > 0 || z > ROOM.front - 0.3) return false;
    for (let i = 0; i < blocks.length; i++) if (into(blocks[i], x, z, 0.15) > 0) return false;
    return true;
  };

  const leaveCave = () => {
    if (leaving) return;
    leaving = true;
    go("hub");
  };
  // The choice: a portrait button for each device, the chosen one pressed; Take hands it to the driven Ooga, and
  // with nobody driven, to the Ooga who walked in.
  const choose = (look) => {
    shop.look = look;
    for (const b of shop.picks) b.setAttribute("aria-pressed", String(Number(b.dataset.wallet) === look));
  };
  const openShop = () => {
    if (leaving) return;
    walk.on = false;
    hud.tooltip.hide();
    choose(shop.look);
    if (!shop.dialog.open) shop.dialog.showModal();
  };
  // Focus left in the closed dialog would keep the director from passing keys on (T among them).
  const closeShop = () => {
    if (shop.dialog.open) shop.dialog.close();
    if (shop.dialog.contains(document.activeElement)) document.activeElement.blur();
  };
  const takeChosen = () => {
    if (avatar && people.player !== avatar) pilot.possess(avatar);
    const i = walletBombs.take(shop.look);
    closeShop();
    if (i >= 0) hud.toast(COARSE ? `A free ${LOOKS[shop.look].name}!` : TAKE_HINT);
    return i;
  };
  const onPick = (e) => {
    const b = e.target.closest(".wallet-pick");
    if (!b) return;
    b.blur();
    choose(Number(b.dataset.wallet));
  };
  // Walks the driven Ooga to (x, z): to set the carried device down there, or (slot >= 0) to pick that one up.
  const walkTo = (x, z, slot = -1) => {
    if (!avatar || people.player !== avatar) return false;
    walk.on = true; walk.x = x; walk.z = z; walk.slot = slot; walk.stuck = 0;
    walk.lastX = avatar.root.position.x; walk.lastZ = avatar.root.position.z;
    return true;
  };
  const arrive = () => {
    walk.on = false;
    people.steer(0, 0, 0, 0, 0);
    if (walk.slot >= 0) walletBombs.tap(walk.slot);
    else walletBombs.setDown(walk.x, walk.z);
  };
  const steerWalk = (dt) => {
    if (!walk.on) return;
    if (people.player !== avatar || pilot.moving) { walk.on = false; return; }
    const p = avatar.root.position, dx = walk.x - p.x, dz = walk.z - p.z, d = Math.hypot(dx, dz);
    if (d < (walk.slot >= 0 ? 1.2 : SET_DOWN_REACH)) { arrive(); return; }
    const moved = Math.hypot(p.x - walk.lastX, p.z - walk.lastZ);
    walk.lastX = p.x; walk.lastZ = p.z;
    walk.stuck = moved < 0.5 * dt ? walk.stuck + dt : 0;
    if (walk.stuck > STUCK_SECONDS) {
      walk.on = false;
      people.steer(0, 0, 0, 0, 0);
      hud.toast("Ooga can not get there. Tap somewhere else.");
      return;
    }
    people.steer(dx / d, dz / d, 0, 1, 0, 1);
  };
  const tipFor = (hit) => {
    const o = hit.owner;
    if (o.kind === "wallet") return walletBombs.tooltip(o.wallet);
    if (o.kind === "caveman") return o.cave.traits.display;
    return TIPS[o.kind] ? TIPS[o.kind][0] : "";
  };
  const onTap = (hit, p) => {
    // A tap on the floor while carrying (or on the carrying Ooga or the device it holds up, which stand in front of
    // it): walk there and set it down. Throwing is the Throw button's and T's alone, never a stray tap's.
    const held = walletBombs.held();
    if (!hit || held >= 0 && (hit.owner.kind === "caveman" && hit.owner.cave === people.player || hit.owner.kind === "wallet" && hit.owner.wallet === held)) {
      if (held < 0 || !input.groundPoint(p.x, p.y, 0, tapAt)) return;
      if (!openFloor(tapAt.x, tapAt.z)) hud.toast("No room there. Tap open floor.");
      else walkTo(tapAt.x, tapAt.z);
      return;
    }
    const o = hit.owner;
    if (o.kind === "vendor") openShop();
    else if (o.kind === "wallet") {
      if (!walletBombs.tap(o.wallet) && walletBombs.where(o.wallet, tapAt)) walkTo(tapAt.x, tapAt.z, o.wallet);
    } else if (o.kind === "caveman") people.pokeCave(o.cave);
    else if (TIPS[o.kind] && TIPS[o.kind][1]) hud.toast(TIPS[o.kind][1]);
  };
  const useNear = (x, z, reach) => {
    if (Math.hypot(x - MACHINE.x, z - MACHINE.front) > Math.max(reach, MACHINE.reach)) return false;
    openShop();
    return true;
  };
  const onKey = (e) => {
    if ((e.key === "t" || e.key === "T") && !e.repeat) {
      walletBombs.throwCarried();
      return true;
    }
    if (e.key === "Escape") {
      leaveCave();
      return true;
    }
    return false;
  };
  const onDonation = () => {};
  const onLootCleared = () => {};

  // The carry line: shown while the driven Ooga holds a device, its text from the prebuilt lines.
  const showCarry = () => {
    const i = walletBombs.held(), line = i < 0 ? null : CARRY_LINES[walletBombs.lookAt(i)][Math.min(FUSE, walletBombs.secondsLeft(i))];
    if (line === shownLine) return;
    shownLine = line;
    carry.bar.hidden = !line;
    if (line) carry.text.textContent = line;
  };
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
    steerWalk(dt);
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
    walletBombs.update(dt, elapsed);
    // A blast's flash takes the slot after the room's lamps for its moment.
    const flashing = walletBombs.flashLight(FLASH);
    if (flashing) RENDER_OPTS.lights.set(FLASH, LAMPS.length * 8);
    RENDER_OPTS.lightCount = LAMPS.length + (flashing ? 1 : 0);
    showCarry();
    if (avatar && !leaving) {
      const p = avatar.root.position, near = people.player === avatar && Math.hypot(p.x - MACHINE.x, p.z - MACHINE.front) < MACHINE.reach;
      if (near !== prompt) {
        prompt = near;
        if (near) {
          hud.hint(COARSE ? "Tap WALLETS to choose a free wallet" : "Space: choose a free wallet");
          hud.setAct("WALLETS");
        } else pilot.showAct();
      }
      if (p.z > ROOM.front + 0.6 && Math.abs(p.x) < ROOM.door) leaveCave();
    }
    stepTweens(dt);
    fx.update(dt, elapsed);
  };
  const drawExtra = (ctx2d, project, drawBubble) => {
    if (people) people.drawQuotes(ctx2d, project, drawBubble);
    walletBombs.drawOverlay(ctx2d, project);
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
      renderer, canvas: ctx.canvas, camera, hud, presets: PRESETS, landing: "store", pitch: PITCH, dist: DIST,
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
      else if (action === "reset-view") pilot.goPreset("store");
      else if (action === "act") pilot.action();
      else if (action === "mode-retake") pilot.modeAction(action);
      else if (action === "wallet-take") takeChosen();
      else if (action === "wallet-close") closeShop();
      else if (action === "wallet-throw") walletBombs.throwCarried();
    });
    fx = fxMod.create({ root, input, hooks, hud, game, world, renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 3.5, z: -5.5 } });
    build();
    const dialog = document.getElementById("wallet-shop");
    shop = { dialog, picks: [...dialog.querySelectorAll(".wallet-pick")], look: 1 };
    dialog.addEventListener("click", onPick);
    hud.dismissOutside(dialog, closeShop);
    carry = { bar: document.getElementById("wallet-carry"), text: document.getElementById("wallet-carry-text") };
    carry.bar.hidden = true;
    shownLine = null;
    // Whoever walked in from the island comes through the doorway; a page that opens here takes `character=` as the
    // island does, else the roster's default pick walks in, so the store always has someone to give a wallet to.
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
      // Empty-handed, as in Ooga Arcade: no rifle on the back and no aiming; the hands are for a wallet.
      avatar.weapon.secondaryOwned = false;
      people.selectWeapon(0, avatar);
      avatar.weapon.aiming = false;
      avatar.parts.gun.visible = false;
      hud.hint(COARSE ? "Walk to the machine and tap it" : "W A S D walk · tap the machine for a free wallet", 6000);
    } else pilot.goPreset("store");
    walletBombs = BL.walletBombs.create({ root, crew: people, fx, hud, groundAt: groundFor, addTarget: (node, owner, opts) => target(node, owner, opts.radius), pickGeometry: PICK });
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    remotes = BL.remotePlayers.create({ root, crew: people });
    lightUp();
    leaving = false;
    prompt = false;
    walk.on = false;
    walletsScene.root = root;
    walletsScene.camera = camera;
    walletsScene.input = input;
    walletsScene.debug = {
      hud, camera, controls: pilot.controls, pilot, crew: people, cavemen: people.cavemen,
      get walletBombs() { return walletBombs.debug; },
      store: { open: openShop, close: closeShop, choose, take: takeChosen, walkTo, openFloor, machine: MACHINE, room: ROOM,
        get walking() { return walk.on; }, get walkTarget() { return walk.on ? [walk.x, walk.z, walk.slot] : null; }, get shopOpen() { return shop.dialog.open; }, get carryLine() { return carry.bar.hidden ? null : carry.text.textContent; } }
    };
  };
  const leave = () => {
    // Whoever walked in goes back out to the island at this mouth as themselves.
    if (avatar) world.pilot = avatar.traits.name;
    unsubscribeAccount();
    unsubscribeAccount = null;
    BL.net.setBody(null);
    closeShop();
    shop.dialog.removeEventListener("click", onPick);
    carry.bar.hidden = true;
    walletBombs.dispose();
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
    hud = hooks = input = pilot = fx = people = avatar = playerWorld = walletBombs = blocks = shop = carry = shownLine = null;
    walk.on = false;
    walletsScene.input = walletsScene.debug = null;
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
    return { visibleNodes: nodes, allNodes: all(root), tweens: tweenCount(), targets: input.targetCount, ...fx.stats(), ...walletBombs.stats(), ...(remotes ? remotes.stats() : {}) };
  };

  const walletsScene = {
    // Voice zone: the store shares its mouth's group on the island (`cave-c9`).
    voiceZone: "cave-c9.hall",
    id: "wallets", enter, update, overlay, onDonation, onKey, onLootCleared, renderOpts: RENDER_OPTS, leave, stats, liveGeometry,
    root: null, camera: null, input: null, debug: null, agent: null, agentView: null, agentControls: null, agentHandoff: null,
    get inMotion() {
      return false;
    }
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.wallets = walletsScene;
})();
