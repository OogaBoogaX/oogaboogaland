// Other signed-in visitors on the island, as the Oogas or gorillas they drive. Each one in `BL.net.remotes` with a
// body gets a caveman built from that Ooga's traits or a managed gorilla rig,
// eased toward the room's 15 Hz poses with a walk cycle while it moves, and a nameplate. The crew's own
// copy of that Ooga is sent `away` while someone else drives it, so no Ooga stands twice, and comes back
// when they let go; meanwhile its roster row shows the driver online (`remoteControlled`, the green dot). A scene
// passing `ghost` (the hub) keeps that copy on its own track as a ghost instead (npc-ghosts.js).
// The crew turns its shoulders through remote players without routing around them.
// Who is shown is the scene's `visible(rec)`: the island shows everyone in the main world (`onIsland` lists the
// island's places), every other scene those in its zone (`sameZone`). The crew is optional, for a scene that
// has none until the visitor drives, and `hide(name, on)` lets a scene hide its own decor copy of an Ooga
// someone drives. A nameplate sits over the top of the head exactly as an NPC's name tooltip does (hud.js
// `.tooltip--name`): the same type, box and head anchor, the green online dot left of the name and, for a player in
// voice, the speaker right of it: green while speaking, red with a cross when they muted their microphone. Games can
// opt into the room's `hp` bar, under the name.
// With the scene's `fx`, a line of Ooga Chat is said in a bubble over its speaker's nameplate, the visitor's own
// line over the actor they drive (`player`, or `crew.player` when no callback is supplied).
// Reactions (reactions.js, through `net.subscribeReactions`): an emoji a player sent pops up over their nameplate, or
// over the visitor's own head for their own (id 0), rises a little and fades over REACT_TIME, the newest replacing the
// one before; a raised hand (`rec.hand`, `net.state.hand` for the visitor's own) stands there until it is lowered, never
// moving: a reaction pops up in front of it and rises on over it, and a chat bubble stands over it, never under it.
// Under Calm a reaction only fades. Drawn on the overlay as text, nothing built or kept.
// `pick` finds the nearest live body along a sight line, mesh by mesh, through a weapon-target list of the pool's own
// (never the scene's input targets, so a live player is seen by a view's crosshair without being tapped, possessed,
// struck or shot); a body that is not shown (another zone, the visitor's own name) is never found, and the scene's
// optional `clear` refuses one behind its rock.
// One pool per scene visit: `create` in enter, `dispose` in leave, before the crew's.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { addChild, removeChild, boundsOf } = BL.scene;
  const { quat } = BL.math;
  // A remote strike's arm swing, raised then brought down, in seconds; and the scratch the gun hold works in.
  const SWING_TIME = 0.35;
  const MAX = 32;
  const EASE = 10;
  const SNAP = 8;
  const WALK_SPEED = 0.35;
  // Preserve the existing Ooga footprint; an Ooga stands as tall as its own head (the crew's `bodyHeightOf`) and
  // gorillas expose their posed envelope. BODY_HEIGHT is the scenes' `outsideActorHeight` for a body without one.
  const BODY_RADIUS = 0.3, BODY_HEIGHT = 2.2;
  // Nameplate parts, in CSS pixels, the NPC name tooltip's (`.tooltip--name` in style.css, placed by hud.js): the page's
  // monospace (--mono) at NAME_SIZE bold with NAME_SPACING, a NAME_LINE line in a box padded NAME_PAD_X by NAME_PAD_Y
  // whose bottom stands NAME_BOTTOM over the head's top, centred across the head; the DOT_D online dot DOT_GAP left of
  // the name, both centred on its line; the health bar under the name (HEALTH_ROW more box, as the tooltip's row); the
  // 9-pixel speaker ICON_GAP right of the name. A chat bubble stands over the box as over an NPC's tooltip (SPEECH_GAP).
  const NAME_SIZE = 13, NAME_LINE = NAME_SIZE * 1.3, NAME_SPACING = "0.39px", NAME_PAD_X = 5, NAME_PAD_Y = 3, NAME_BOTTOM = 2;
  const DOT_D = 8, DOT_GAP = 6, SPEECH_GAP = 6, EDGE = 8;
  // With health the tooltip grows a second grid row: the row gap, then the 4-pixel bar with -2 and +1 margins.
  const BAR_W = 72, BAR_H = 4, BAR_ROW = DOT_GAP - 2, HEALTH_ROW = DOT_GAP + BAR_H - 2 + 1, ICON_GAP = 4;
  const NAME_BOX = Math.round(NAME_PAD_Y * 2 + NAME_LINE), NAME_BOX_HEALTH = Math.round(NAME_PAD_Y * 2 + NAME_LINE + HEALTH_ROW);
  // The font, and where its baseline falls in the name's line as the tooltip's CSS lays it out: read once.
  let nameFont = "", nameBaseline = 0;
  const NAME_STROKE = "rgba(20, 14, 8, 0.85)", NAME_FILL = "#f3efe4", BAR_TRACK = "rgba(0, 0, 0, 0.55)", ONLINE = "#22c55e";
  // A reaction's emoji and the raised hand, in CSS pixels over the nameplate's box (or the head's top): how long a
  // reaction shows, how far it rises (further from a raised hand, to clear it), its pop and fade.
  const EMOJI_FONT = "26px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  const HAND_FONT = "20px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  const REACT_TIME = 2.6, REACT_LIFT = 16, REACT_RISE = 22, REACT_OVER = 14, REACT_POP = 0.18, REACT_FADE = 0.7;
  // A chat bubble over a raised hand stands this much higher, its tail clear over the hand.
  const HAND_ROOM = 26;
  const CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The pool of the scene that updated last: only the active scene's pool updates.
  let activePool = null;
  const BAR_FILL = "#d8892b", BAR_KO = "#e5533d", ICON_IDLE = "#a6a6a2", ICON_SPEAKING = "#22c55e", ICON_MUTED = "#e5533d";
  // A chat line stays up this long once said through.
  const CHAT_SAY = 4;
  // A sight test stops this short of a picked body's surface, so the body itself never blocks it.
  const PICK_MARGIN = 0.035;
  // An unused pick slot: no geometry, so the picker passes it over before reading anything else.
  const IDLE_PICK = { geometry: null, visible: false }, IDLE_OWNER = { kind: "none", weaponType: "none" };
  // x, y, w, h runs on the speaker's 9x9 grid, as the roster's voice mark draws it.
  const SPEAKER = [0, 3, 2, 3, 2, 2, 1, 5, 3, 1, 1, 7];
  const WAVES = [5, 3, 1, 3, 7, 2, 1, 5];
  const CROSS = [5, 3, 1, 1, 7, 3, 1, 1, 6, 4, 1, 1, 5, 5, 1, 1, 7, 5, 1, 1];
  const runs = (ctx, cells, x, y) => {
    for (let i = 0; i < cells.length; i += 4) ctx.fillRect(x + cells[i], y + cells[i + 1], cells[i + 2], cells[i + 3]);
  };

  // The zones the hub itself reports, which share its coordinates: the main world (voice-blend.js), and the cave
  // entrances' own names, still sent by a page loaded before they became the island's (`cave-<id>` for a mouth with no
  // name of its own). Never a separate scene's zone, such as the Ember Den.
  const OLD_CAVES = new Set(["lab", "bca", "factory", "arcade", "mirror"]);
  const onIsland = (zone) => BL.voiceBlend.world(zone) || OLD_CAVES.has(zone) || typeof zone === "string" && zone.startsWith("cave-");
  const sameZone = (rec) => rec.zone === BL.net.state.zone;

  // `posed(cave, feetY)` lets the scene finish a body's pose once it stands where the room says: the hub sets a
  // swimmer's arms by it, from the position the pose transport already carries, with no simulation of its own.
  // A hub supplies its companion's style and hides its local copy through the gorilla hooks; other scenes
  // use a basic managed rig. Both bodies share the room pose, nameplate and collision actor lifecycle.
  // A scene with `ghost(cave, on)` (the hub, npc-ghosts.js) keeps the crew's copy on its own track instead: never
  // sent away nor marked `remoteControlled`, only drawn as a ghost while the remote body stands beside it.
  // `unarmed` is a place with no weapons: however a body's last pose reads, it shows neither club nor gun there.
  const create = ({ root, crew = null, fx = null, player = null, posed = null, visible = sameZone, hide = null, createGorilla = null, hideGorilla = null, ghost = null, unarmed = false }) => {
    const net = BL.net;
    const bodies = new Map();
    const pets = crew?.pets || BL.crew.createPets({}, root);
    // The chat subscription, taken on the first update and again after a kept hub's suspend disposed it; the
    // shot and strike subscriptions the same way.
    let unheard = null, unshot = null, unswung = null, unreacted = null;
    // `dx`, `dz` and `dy` are what the body's feet and top did in the last update, which a player on its head rides.
    const actorPool = Array.from({ length: MAX }, () => ({ id: null, player: true, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, radius: BODY_RADIUS, height: BODY_HEIGHT }));
    const actorList = [];
    // Every shown mesh under each body, for `pick` alone, gathered afresh from the bodies' graphs at each pick: gear put
    // on after a body was built (a jetpack, a gun, a magazine, anything nested under them) counts at once, and a part
    // taken off, moved under another node or replaced drops out, since only what hangs under a body standing in this
    // scene is gathered. Slots are reused in place; every slot past the last gathered holds `IDLE_PICK`, so the list
    // keeps no old part alive and never shrinks or reallocates once it has grown to the most meshes the bodies have shown.
    const pickTargets = [], picker = BL.weaponTargets.create(pickTargets);
    let pickCount = 0;
    const gatherPicks = (node, owner) => {
      if (!node.visible) return;
      // Instanced batches (breath puffs) are effects, not the body.
      if (node.geometry && !node.instanceData) {
        if (pickCount === pickTargets.length) pickTargets.push({ node, owner, radius: 0 });
        else { const slot = pickTargets[pickCount]; slot.node = node; slot.owner = owner; }
        pickCount++;
      }
      for (const child of node.children) gatherPicks(child, owner);
    };
    const idlePicks = (from) => {
      for (let i = from; i < pickTargets.length; i++) { const slot = pickTargets[i]; slot.node = IDLE_PICK; slot.owner = IDLE_OWNER; }
    };
    const syncPicks = () => {
      pickCount = 0;
      for (const entry of bodies.values()) if (entry.cave.root.parent === root) gatherPicks(entry.cave.root, entry.pickOwner);
      idlePicks(pickCount);
    };

    // The crew's Ooga of this name goes away while a remote drives it; its own override comes back after.
    const hideLocal = (entry) => {
      if (entry.gorilla) {
        if (hideGorilla) hideGorilla(entry.name, true);
        return;
      }
      if (hide) hide(entry.name, true);
      if (!crew) return;
      const cave = crew.cavemen.get(entry.name);
      if (!cave || cave === crew.player || cave.localBody) return;
      if (ghost) {
        entry.ghosted = cave;
        ghost(cave, true);
        return;
      }
      entry.hidden = cave;
      entry.hiddenOverride = cave.override;
      cave.override = "away";
      cave.remoteControlled = true;
      crew.refreshStates();
    };
    const restoreLocal = (entry) => {
      if (entry.gorilla) {
        if (hideGorilla) hideGorilla(entry.name, false);
        return;
      }
      if (hide) hide(entry.name, false);
      if (entry.ghosted) {
        // Solid again where its track has it; nothing else about it changed.
        const ghosted = entry.ghosted;
        entry.ghosted = null;
        ghost(ghosted, false);
        return;
      }
      const cave = entry.hidden;
      if (!cave) return;
      entry.hidden = null;
      cave.override = entry.hiddenOverride;
      cave.remoteControlled = false;
      // Settled in place: a walk back in from away assumes a work slot, and a chilling Ooga has none.
      crew.refreshStates(true);
    };

    const build = (rec) => {
      const gorilla = rec.bodyKind === "gorilla" || rec.body.startsWith("gorilla:");
      const decoded = rec.bodyName || (gorilla ? rec.body.slice(8) : rec.body);
      // Claims are case-insensitive; scene maps use the contributor's canonical handle.
      const owner = gorilla && BL.characters.get(decoded), name = owner ? owner.handle : decoded;
      const cave = gorilla
        ? (createGorilla && createGorilla(name, rec)) || BL.agent.create({ managed: true, groundAt: () => rec.y, x: rec.x, z: rec.z, heading: rec.yaw })
        : BL.models.caveman(BL.contributors.traitsFor(name));
      if (!gorilla) {
        BL.crew.preparePresentation(cave);
        const parts = cave.parts;
        for (const key of ["snack", "gun", "jetpack", "jetFlame"]) if (parts[key]) parts[key].visible = false;
      }
      // Remote rigs arrive after the hub's outline registry is built. Like Tess, their attached UI uses
      // the overlay's exact visibility test instead of requiring an entry in that static registry.
      cave.root.sightHidden = true;
      // Measured as built, before it is placed: feet at the root's own height, as the crew measures its Oogas.
      const height = gorilla ? 0 : BL.crew.bodyHeightOf(cave);
      addChild(root, cave.root);
      const motion = gorilla ? { walkPhase: NaN, walkGait: "knuckle", climb: 0, climbStride: 0, climbDirection: 0, climbSide: 0, swim: 0, lab: false, labRunIn: false, office: false, officeRise: 0 } : null;
      if (!gorilla) {
        cave.baseY = cave.root.position.y; cave.jetFuel = 1; cave.hopV = 0;
        if (cave.parts.dog) {
          // The shared terrain queries read the owner's standing envelope and passenger origin.
          cave.bodyHeight = height; cave.bodyRadius = BL.crew.bodyRadiusOf(cave); cave.hop = 0;
          cave.riding = { support: null, outside: null, x: rec.x, y: rec.y + cave.baseY, z: rec.z };
          cave.sleepParts = { headX: cave.parts.head.position.x, headZ: cave.parts.head.position.z };
          pets.attach(cave);
          // Detached from the sightHidden root, and as late to the outline registry as the body it follows.
          cave.pet.node.sightHidden = true;
        }
      }
      const entry = { id: rec.id, body: rec.body, name, gorilla, cave, motion, baseY: gorilla ? 0 : cave.root.position.y, height, top: NaN, dTop: 0, jetNode: null, jetFlame: null, swing: 0, shotAt: -Infinity, lastHeld: 0, lastMode: 0, lastMelee: 0, sampleAt: 0, sampleMelee: 0, sampleFlags: 0, sampleSwap: 0, sampleSwapIndex: 0, x: rec.x, y: rec.y, z: rec.z, yaw: rec.yaw, phase: 0, hidden: null, hiddenOverride: null, ghosted: null, label: "", labelW: 0,
        react: "", reactT: 0, screenX: NaN, plateLeft: NaN, plateTop: NaN, plateW: 0, plateH: 0, plateTextX: NaN, plateBaseline: NaN, plateBarLeft: NaN, plateBarTop: NaN, pickOwner: { kind: "player", id: rec.id, cave, weaponType: "none" } };
      bodies.set(rec.id, entry);
      hideLocal(entry);
      return entry;
    };

    const drop = (entry) => {
      if (entry.cave.restEquipment) entry.cave.restEquipment.release(entry.cave);
      // Its slots let go of its parts now, not at the next pick.
      idlePicks(0);
      pickCount = 0;
      if (fx) fx.hush(entry.cave);
      if (entry.gorilla) entry.cave.dispose();
      else {
        removeChild(root, entry.cave.root);
        if (entry.cave.pet) removeChild(entry.cave.pet.node.parent, entry.cave.pet.node);
      }
      restoreLocal(entry);
      bodies.delete(entry.id);
    };

    const pose = (entry, dt) => {
      const { cave } = entry;
      const parts = cave.parts;
      parts.armL.rotation.y = parts.armR.rotation.y = 0;
      parts.armL.rotation.z = 0.12; parts.armR.rotation.z = -0.12;
      const moved = Math.hypot(entry.dx, entry.dz) / Math.max(dt, 1e-3);
      if (moved > WALK_SPEED) {
        entry.phase += dt * 10;
        const swing = Math.sin(entry.phase);
        parts.legL.rotation.x = swing * 0.55;
        parts.legR.rotation.x = -swing * 0.55;
        parts.armL.rotation.x = -0.2 - swing * 0.3;
        parts.armR.rotation.x = -0.2 + swing * 0.3;
      } else {
        entry.phase = 0;
        parts.legL.rotation.x = parts.legR.rotation.x = 0;
        parts.armL.rotation.x = parts.armR.rotation.x = -0.2;
      }
      cave.root.position.x = entry.x;
      cave.root.position.y = entry.y + entry.baseY + Math.abs(Math.sin(entry.phase)) * 0.04;
      cave.root.position.z = entry.z;
      cave.root.rotation.y = entry.yaw;
    };

    const poseGorilla = (entry, rec, dt) => {
      const g = rec.g, sleeping = !!(g && g[0] & 64), flags = sleeping ? 0 : g ? g[0] : 0, motion = entry.motion;
      motion.walkGait = flags & 8 ? "gallop" : "knuckle";
      motion.climb = flags & 4 ? 1 : 0;
      motion.climbStride = g ? g[2] : 0;
      motion.climbDirection = g ? g[3] : 0;
      motion.climbSide = g ? g[4] : 0;
      motion.swim = g && !sleeping ? g[5] : 0;
      motion.lab = !!(flags & 16);
      // The lab normally forces an upright pose; preserve the sender's explicit biped bit on its approach.
      motion.labRunIn = !(flags & 2);
      motion.office = !!(flags & 32);
      motion.officeRise = flags & 2 ? 1 : 0;
      const speed = sleeping ? 0 : g ? g[1] : Math.hypot(entry.dx, entry.dz) / Math.max(dt, 1e-3);
      const lounge = sleeping ? g[3] < -0.5 ? "left" : g[3] > 0.5 ? "right" : "back" : "";
      entry.cave.poseManaged(dt, entry.x, entry.y, entry.z, entry.yaw, speed, !!(flags & 1), !!(flags & 2), lounge, motion);
    };

    // The visitor's own reaction over their head, and the body whose chat bubble their raised hand lifts.
    let selfReact = "", selfReactT = 0, lifted = null;
    // Their jetpack from the room's `jet` (net.js): the character's built-in one, or the hub's model, put on as the
    // crew puts one on (`crew.jetpackNode`) the first time it shows. The flame flickers as the crew's does.
    let jetClock = 0;
    const showJet = (entry, rec) => {
      const jet = rec.jet, owned = rec.visual && (rec.visual[3] & 4);
      const cave = entry.cave, parts = cave.parts;
      if (!entry.jetNode) {
        if (!jet && !owned) return;
        entry.jetNode = parts.jetpack || BL.crew.jetpackNode(cave.root, cave.traits.height, 0, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
        entry.jetFlame = parts.jetpack ? parts.jetFlame : entry.jetNode.children[0];
        cave.presentationJet = { node: entry.jetNode, flame: entry.jetFlame, power: 0 };
      }
      const power = jet >> 1, flame = entry.jetFlame;
      cave.presentationJet.power = power;
      cave.jet = jet & 1 ? cave.presentationJet : null;
      entry.jetNode.visible = (jet & 1) === 1;
      flame.visible = entry.jetNode.visible && power > 0;
      if (flame.visible) flame.scale.y = (0.7 + Math.sin(jetClock * 40 + entry.id) * 0.3) * power / 2;
    };
    // The same third-person grip, sling, recoil and reload poses as the local crew. Timers are sampled
    // state, aged on the room's clock; a late join never starts an obsolete action from its beginning.
    const showWeapon = (entry, rec, dt) => {
      const cave = entry.cave, parts = cave.parts, w = cave.weapon, weapon = rec.weapon | 0;
      const held = weapon & 3, mode = weapon & 4, v = rec.visual, now = net.serverNow();
      const age = v ? Math.max(0, (now - rec.visualAt) / 1000) : 0, fresh = age < 0.5;
      if (held !== entry.lastHeld || mode !== entry.lastMode) { entry.shotAt = -Infinity; entry.swing = 0; }
      entry.lastHeld = held; entry.lastMode = mode;
      const flags = v ? v[3] : 1 | (held === 2 ? 2 : 0);
      w.primaryOwned = !!(flags & 1); w.secondaryOwned = !!(flags & 2); cave.jetpackOwned = !!(flags & 4);
      w.equipped = held === 2; w.primaryEquipped = held === 1; w.aiming = !!mode;
      w.ammo = weapon >> 3;
      parts.head.quaternion = null;
      parts.head.rotation.x += ((v ? v[0] / 100 : 0) - parts.head.rotation.x) * (1 - Math.exp(-EASE * dt));
      w.aimPitch = v ? v[1] / 100 : parts.head.rotation.x;
      w.aimYaw = v ? v[2] / 100 : 0;
      w.recoil = held === 2 ? Math.max(v ? v[4] / 1000 - age : 0, 0.24 - (now - entry.shotAt) / 1000, 0) : 0;
      w.reloading = held === 2 && fresh && !!(flags & 8);
      w.reloadSpare = fresh && !!(flags & 16);
      w.spareAmmo.length = v ? v[16] ? 2 : v[15] ? 1 : 0 : 0;
      if (w.spareAmmo.length > 0) w.spareAmmo[0] = v[15] - 1;
      if (w.spareAmmo.length > 1) w.spareAmmo[1] = v[16] - 1;
      w.reloadMagazine = flags & 2048 ? 1 : 0; w.swapMagazine = flags & 4096 ? 1 : 0;
      const handoff = flags >> 8 & 3;
      w.reloadHandoffTime = v ? Math.max(0, v[6] / 1000 - age) : 0;
      w.reloadHandoff = held === 2 && w.reloadHandoffTime > 0 ? handoff === 1 ? -1 : handoff === 2 ? 1 : handoff === 3 ? 2 : 0 : 0;
      w.swapTime = held === 2 && v ? Math.max(0, v[7] / 1000 - age) : 0;
      if (v && rec.visualAt !== entry.sampleAt && w.swapTime > 0 && (v[7] > entry.sampleSwap + 30 || w.swapMagazine !== entry.sampleSwapIndex)) {
        const i = w.swapMagazine;
        if (i < w.spareAmmo.length) {
          const model = cave.magazineModels[i] || (cave.magazineModels[i] = BL.crew.createMagazineModel());
          if (parts.armL.quaternion) model.armStart.set(parts.armL.quaternion);
          else quat.fromEuler(model.armStart, parts.armL.rotation.x, parts.armL.rotation.y, parts.armL.rotation.z);
        }
      }
      entry.sampleSwap = v ? v[7] : 0; entry.sampleSwapIndex = w.swapMagazine;
      const melee = held === 1 && v ? Math.max(0, v[8] / 1000 - age * (cave.traits.nunchaku ? 1.9 : 1)) : 0;
      if (held === 1 && v && rec.visualAt !== entry.sampleAt && (v[8] > entry.sampleMelee + 30 || (flags & 128) !== (entry.sampleFlags & 128) || flags & 32 && !w.meleeHeld)) {
        BL.crew.captureMeleePose(cave);
      }
      entry.lastMelee = melee;
      entry.sampleAt = rec.visualAt; entry.sampleMelee = v ? v[8] : 0; entry.sampleFlags = flags;
      w.meleeTime = melee;
      w.meleeHeld = held === 1 && fresh && !!(flags & 32);
      if (w.meleeHeld) w.meleeTime = Math.max(0.24, w.meleeTime);
      w.meleeQuick = !!(flags & 64); w.meleeSide = flags & 128 ? -1 : 1;
      w.meleeHeldTime = v ? Math.min(1.24, v[9] / 1000 + (w.meleeHeld ? age : 0)) : 0;
      w.meleeCharge = v ? v[10] / 100 : 0;
      w.meleeStrikeTime = w.meleeQuick ? 0.09 : 0.128 * (1 + w.meleeCharge * 0.5);
      w.meleeReadyTime = v ? Math.max(0, v[11] / 1000 - age) : 0;
      w.axeIdle = v ? v[12] / 1000 : 1.3;
      w.bashTime = held === 2 && v ? Math.max(0, v[13] / 1000 - age) : 0;
      cave.twirlUntil = v ? now / 1000 + Math.max(0, v[14] / 1000 - age) : 0;
      cave.twirlHand = flags & 1024 ? 1 : 0;
      parts.snack.visible = false;
      if (w.reloading && !w.reloadHandoff) BL.crew.poseReload(cave, ((v[5] / 1000 + age) % BL.crew.RELOAD_PERIOD) / BL.crew.RELOAD_PERIOD, false);
      // Older pages still send the original strike event; new pages reconcile the action's actual phase.
      if (entry.swing > 0) entry.swing = Math.max(0, entry.swing - dt);
      if (!v && entry.swing > 0) {
        w.primaryEquipped = true; w.meleeTime = entry.swing;
      }
      BL.crew.poseEquipment(cave, true, now / 1000);
      if (parts.chuk) {
        cave.chukAngle += ((parts.club.parent === parts.armR && w.primaryEquipped ? 0 : 2.4) - cave.chukAngle) * (1 - Math.exp(-12 * dt));
        parts.chuk.rotation.x = cave.chukAngle;
      }
    };
    // Another player's banana flies as the crew's replayed shots do, with no hits; their strike swings the arm.
    const shotHeard = (id, a) => {
      const entry = bodies.get(id);
      if (entry && !entry.gorilla) entry.shotAt = net.serverNow();
      if (entry && !entry.gorilla && entry.cave.root.visible && crew && crew.showShot) crew.showShot(null, a[0], a[1], a[2], a[3], a[4], a[5]);
    };
    const swingHeard = (id) => {
      const entry = bodies.get(id);
      if (entry && !entry.gorilla) entry.swing = SWING_TIME;
    };

    const update = (dt) => {
      jetClock += dt;
      activePool = pool;
      if (selfReactT > 0) selfReactT = Math.max(0, selfReactT - dt);
      if (fx && !unheard) unheard = net.subscribeChat(heard);
      if (!unreacted && net.subscribeReactions) unreacted = net.subscribeReactions(reacted);
      if (!unshot && net.subscribeShots) { unshot = net.subscribeShots(shotHeard); unswung = net.subscribeSwings(swingHeard); }
      for (const entry of bodies.values()) {
        const rec = net.remotes.get(entry.id);
        if (!rec || rec.body !== entry.body) drop(entry);
      }
      const k = 1 - Math.exp(-EASE * dt);
      let n = 0;
      for (const rec of net.remotes.values()) {
        if (!rec.body) continue;
        let entry = bodies.get(rec.id);
        if (!entry) {
          if (bodies.size >= MAX) continue;
          entry = build(rec);
        }
        // A copy this page drove when the body arrived (another tab's takeover) becomes its ghost once let go.
        if (ghost && crew && !entry.gorilla && !entry.ghosted) {
          const cave = crew.cavemen.get(entry.name);
          if (cave && cave !== crew.player && !cave.localBody) { entry.ghosted = cave; ghost(cave, true); }
        }
        const restPhase = rec.rest ? rec.rest[1] : 0;
        if (!entry.gorilla && entry.restPhase === 2 && restPhase !== 2) {
          // Settled rest is reported at a canonical seat, but rendered at the body's cloth offset.
          // Start exit/interruption from that visible body, rather than jumping back to the seat.
          entry.x = entry.cave.root.position.x; entry.y = entry.cave.root.position.y - entry.baseY; entry.z = entry.cave.root.position.z;
        }
        entry.restPhase = restPhase;
        const far = Math.hypot(rec.x - entry.x, rec.y - entry.y, rec.z - entry.z) > SNAP;
        const t = far ? 1 : k;
        entry.dx = (rec.x - entry.x) * t;
        entry.dz = (rec.z - entry.z) * t;
        entry.x += entry.dx;
        entry.cave.hopV = far || !(dt > 0) ? 0 : (rec.y - entry.y) * t / dt;
        entry.y += (rec.y - entry.y) * t;
        entry.z += entry.dz;
        entry.yaw += Math.atan2(Math.sin(rec.yaw - entry.yaw), Math.cos(rec.yaw - entry.yaw)) * t;
        if (far) entry.dx = entry.dz = 0;
        if (entry.reactT > 0) entry.reactT = Math.max(0, entry.reactT - dt);
        entry.cave.root.visible = visible(rec) && !(!entry.gorilla && crew && crew.player && crew.player.traits.name === entry.name);
        if (entry.gorilla) poseGorilla(entry, rec, dt);
        else {
          pose(entry, dt);
          showJet(entry, rec);
          showWeapon(entry, rec, dt);
          if (unarmed) {
            const { club, gun } = entry.cave.parts;
            if (club) club.visible = false;
            if (gun) gun.visible = false;
          }
          if (posed) posed(entry.cave, entry.cave.root.position.y - entry.baseY, rec, dt);
          if (entry.cave.pet) {
            const p = entry.cave.root.position, riding = entry.cave.riding;
            riding.x = p.x; riding.y = p.y; riding.z = p.z;
            pets.update(entry.cave, dt, !!entry.cave.hammockRest && (!rec.rest || rec.rest[1] === 2));
          }
        }
        // The top's move carries a player standing on it; a snap carries nobody.
        const height = entry.gorilla ? entry.cave.bodyHeight : entry.height, top = entry.y + height;
        entry.dTop = far || Number.isNaN(entry.top) ? 0 : top - entry.top;
        entry.top = top;
        if (!entry.cave.root.visible) continue;
        const actor = actorPool[n++];
        actor.id = entry.id;
        actor.x = entry.x; actor.y = entry.y; actor.z = entry.z;
        actor.dx = entry.dx; actor.dy = entry.dTop; actor.dz = entry.dz;
        actor.radius = entry.gorilla ? entry.cave.bodyRadius : BODY_RADIUS;
        actor.height = height;
      }
      actorList.length = 0;
      for (let i = 0; i < n; i++) actorList.push(actorPool[i]);
    };

    const actors = () => actorList;

    // The nearest shown live body along the ray within `maxDistance` (`out` as a weapon-target hit, its owner's `kind`
    // "player", `id` and `cave`), or false. With `clear(x, y, z, toX, toY, toZ)` a body is found only when the line to
    // just short of its surface is clear.
    // A miss leaves nothing behind in `out`: no node or body to outlive the pool.
    const missed = (out) => {
      out.node = out.owner = null; out.type = "none"; out.distance = Infinity;
      return false;
    };
    const pick = (out, ox, oy, oz, dx, dy, dz, maxDistance, clear = null) => {
      syncPicks();
      if (!pickCount || !picker.ray(out, ox, oy, oz, dx, dy, dz, maxDistance, null, null, true)) return missed(out);
      if (clear) {
        const near = Math.max(0, out.distance - PICK_MARGIN) / Math.hypot(dx, dy, dz);
        if (!clear(ox, oy, oz, ox + dx * near, oy + dy * near, oz + dz * near)) return missed(out);
      }
      return true;
    };

    // The head's top on screen and its middle across, from the corners of every visible mesh under the head as the
    // last frame drew them, through the scene's `project` (which may refuse a hidden point); false when none projects.
    let headMinX = Infinity, headMaxX = -Infinity, headTop = Infinity;
    const projectHead = (node, project) => {
      if (!node.visible) return;
      if (node.geometry) {
        const b = boundsOf(node.geometry), m = node.world;
        for (let i = 0; i < 8; i++) {
          const x = i & 1 ? b.max[0] : b.min[0], y = i & 2 ? b.max[1] : b.min[1], z = i & 4 ? b.max[2] : b.min[2];
          const pos = project(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (!pos) continue;
          headMinX = Math.min(headMinX, pos.x); headMaxX = Math.max(headMaxX, pos.x); headTop = Math.min(headTop, pos.y);
        }
      }
      for (const child of node.children) projectHead(child, project);
    };
    // A shown head's nameplate stands where an NPC's name does (character-visibility.js's anchor): over the top of its
    // own vertices, every one of every visible mesh, centred between the outermost, projected as drawn.
    const anchorHead = (node, project) => {
      if (!node.visible || node.cameraHidden) return;
      const v = node.geometry && node.geometry.verts;
      if (v) {
        const m = node.world;
        for (let i = 0; i + 2 < v.length; i += 3) {
          const x = v[i], y = v[i + 1], z = v[i + 2];
          const pos = project(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
          if (!pos) continue;
          headMinX = Math.min(headMinX, pos.x); headMaxX = Math.max(headMaxX, pos.x); headTop = Math.min(headTop, pos.y);
        }
      }
      for (const child of node.children) anchorHead(child, project);
    };

    // Nameplates on the overlay, just over each head, in the order the room sent them: the online dot, the name and,
    // in voice, the speaker in one row, with the health bar under the name when the game shows it.
    // A reaction `emoji` `left` seconds before it goes, and the raised hand, over the point (x, y). The hand never moves;
    // a reaction starts on it, drawn after it so in front, and rises clear of it. Emoji stand centred with no letter
    // spacing, in a state of their own, so a nameplate's type around them is left as it was.
    const drawReaction = (ctx, x, y, emoji, left, hand) => {
      ctx.save();
      ctx.letterSpacing = "0px";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (hand) {
        ctx.font = HAND_FONT;
        ctx.fillText(hand, x, y - REACT_LIFT);
      }
      if (left > 0) {
        const age = REACT_TIME - left, calm = CALM.matches, k = 1 - age / REACT_TIME;
        const pop = calm ? 1 : Math.min(1, age / REACT_POP), scale = calm ? 1 : 0.4 + 0.6 * (1 - (1 - pop) * (1 - pop)) + 0.12 * Math.sin(Math.PI * pop);
        // From a raised hand it starts on the hand and goes further; under Calm it stands clear of the hand from the start.
        const start = hand ? 0 : 4, reach = hand ? REACT_RISE + REACT_OVER : REACT_RISE;
        const rise = calm ? (hand ? reach : 0) : reach * (1 - k * k);
        ctx.globalAlpha = Math.min(1, left / REACT_FADE);
        ctx.font = EMOJI_FONT;
        ctx.translate(x, y - REACT_LIFT - start - rise);
        ctx.scale(scale, scale);
        ctx.fillText(emoji, 0, 0);
      }
      ctx.restore();
    };
    const drawNames = (ctx, project, showHealth = false) => {
      const ownHand = net.state && net.state.hand ? BL.reactionPolicy.HANDS[net.state.handTone] : "";
      // The visitor's own line stands over their raised hand, on whichever body they drive now.
      const own = player ? player() : crew && crew.player, speaker = ownHand && own || null;
      if (lifted !== speaker) {
        if (lifted) lifted.speechLift = 0;
        lifted = speaker;
        if (lifted) lifted.speechLift = HAND_ROOM;
      }
      if (!bodies.size && selfReactT <= 0 && !ownHand) return;
      ctx.save();
      if (selfReactT > 0 || ownHand) {
        const rig = own && (own.parts ? own : own.gorilla);
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        if (rig && rig.parts && rig.parts.head && rig.root.visible) projectHead(rig.parts.head, project);
        if (headTop !== Infinity) {
          const x = Math.round((headMinX + headMaxX) / 2), y = Math.round(headTop);
          if (selfReactT > 0 || ownHand) drawReaction(ctx, x, y, selfReact, selfReactT, ownHand);
        }
      }
      if (!nameFont) {
        const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "ui-monospace, monospace";
        nameFont = `bold ${NAME_SIZE}px ${mono}`;
        // Measured on a hidden copy of the tooltip itself, once: a zero-size inline block stands on the line's baseline.
        const box = document.createElement("div"), text = document.createElement("span"), probe = document.createElement("span");
        box.className = "tooltip tooltip--name"; box.style.visibility = "hidden";
        probe.style.cssText = "display:inline-block;width:0;height:0";
        text.textContent = "Mg"; text.appendChild(probe); box.appendChild(text); document.body.appendChild(box);
        nameBaseline = probe.getBoundingClientRect().bottom - text.getBoundingClientRect().top;
        box.remove();
        if (!(nameBaseline > 0 && nameBaseline < NAME_LINE)) {
          ctx.font = nameFont;
          const metrics = ctx.measureText("Mg");
          nameBaseline = (NAME_LINE - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2 + metrics.fontBoundingBoxAscent;
        }
      }
      ctx.font = nameFont;
      ctx.letterSpacing = NAME_SPACING;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      const boxH = showHealth ? NAME_BOX_HEALTH : NAME_BOX, exact = fx && fx.projectRaw || project, viewW = window.innerWidth;
      for (const entry of bodies.values()) {
        // Until laid out again, a body has no plate to report.
        entry.plateLeft = NaN;
        const rec = net.remotes.get(entry.id);
        if (!rec || !entry.cave.root.visible) continue;
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        projectHead(entry.cave.parts.head, project);
        if (headTop === Infinity) continue;
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        anchorHead(entry.cave.parts.head, exact);
        if (headTop === Infinity) continue;
        // Over the box as over an NPC's name tooltip (hud.js speechSpace), and over a raised hand.
        entry.cave.speechLift = boxH + SPEECH_GAP + (rec.hand ? HAND_ROOM : 0);
        // Measured once a name: measureText allocates.
        if (entry.label !== rec.display) { entry.label = rec.display; entry.labelW = ctx.measureText(rec.display).width; }
        // The tooltip's box, rounded as its offset size and translate are, centred across the head and standing on it,
        // kept EDGE inside the view's sides and top as hud.js keeps it. A health bar wider than the dot and name widens it.
        const inner = Math.max(DOT_D + DOT_GAP + entry.labelW, showHealth ? BAR_W : 0), boxW = Math.round(NAME_PAD_X * 2 + inner);
        const mid = (headMinX + headMaxX) / 2;
        const left = Math.round(Math.max(EDGE, Math.min(viewW - boxW - EDGE, mid - boxW / 2)));
        const top = Math.round(Math.max(EDGE, headTop - NAME_BOTTOM - boxH)), line = top + NAME_PAD_Y;
        const textX = left + NAME_PAD_X + DOT_D + DOT_GAP, lineMid = line + NAME_LINE / 2;
        entry.screenX = mid; entry.plateLeft = left; entry.plateTop = top; entry.plateW = boxW; entry.plateH = boxH;
        entry.plateTextX = textX; entry.plateBaseline = line + nameBaseline;
        // A reaction and the raised hand over the plate's box, centred on it (clamped with it at the view's edge).
        if (entry.reactT > 0 || rec.hand) drawReaction(ctx, left + boxW / 2, top, entry.react, entry.reactT, rec.hand ? BL.reactionPolicy.HANDS[rec.handTone] : "");
        ctx.strokeStyle = NAME_STROKE;
        ctx.fillStyle = NAME_FILL;
        ctx.strokeText(rec.display, textX, line + nameBaseline);
        ctx.fillText(rec.display, textX, line + nameBaseline);
        ctx.beginPath();
        ctx.arc(left + NAME_PAD_X + DOT_D / 2, lineMid, DOT_D / 2, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.fillStyle = ONLINE;
        ctx.fill();
        if (showHealth) {
          // The tooltip's second row: centred under the name's row, after the row gap less the bar's top margin.
          const left = Math.round(textX - DOT_D - DOT_GAP + (inner - BAR_W) / 2), top = Math.round(line + NAME_LINE + BAR_ROW);
          entry.plateBarLeft = left; entry.plateBarTop = top;
          ctx.fillStyle = NAME_STROKE;
          ctx.fillRect(left - 1, top - 1, BAR_W + 2, BAR_H + 2);
          ctx.fillStyle = BAR_TRACK;
          ctx.fillRect(left, top, BAR_W, BAR_H);
          ctx.fillStyle = rec.ko ? BAR_KO : BAR_FILL;
          ctx.fillRect(left, top, Math.round(BAR_W * Math.max(0, Math.min(100, rec.hp)) / 100), BAR_H);
        }
        if (!rec.voice) continue;
        const ix = Math.round(textX + entry.labelW + ICON_GAP), iy = Math.round(lineMid - 4.5);
        ctx.fillStyle = rec.muted ? ICON_MUTED : BL.voice.speaking(rec.id) ? ICON_SPEAKING : ICON_IDLE;
        runs(ctx, SPEAKER, ix, iy);
        runs(ctx, rec.muted ? CROSS : WAVES, ix, iy);
      }
      ctx.restore();
    };

    // A line of Ooga Chat as it is said (never the history a join brings), over its speaker if they are here.
    const heard = (lines, joined) => {
      if (joined) return;
      for (const line of lines) {
        const me = net.state.me;
        if (me && line.login === me.login) {
          const speaker = player ? player() : crew && crew.player;
          if (speaker) fx.say(speaker, line.text, CHAT_SAY);
          continue;
        }
        for (const entry of bodies.values()) {
          const rec = net.remotes.get(entry.id);
          if (rec && rec.login === line.login) { fx.say(entry.cave, line.text, CHAT_SAY); break; }
        }
      }
    };

    // A reaction from player `id`, or 0 for the visitor's own, over that body while it shows.
    const reacted = (id, emoji) => {
      if (id === 0) { selfReact = emoji; selfReactT = REACT_TIME; return; }
      const entry = bodies.get(id);
      if (entry) { entry.react = emoji; entry.reactT = REACT_TIME; }
    };

    const liveGeometry = (set) => {
      for (const entry of bodies.values()) {
        if (entry.gorilla) entry.cave.liveGeometry(set);
        else set.add(entry.cave.headOpen).add(entry.cave.headClosed);
      }
    };

    const stats = () => ({ remotePlayers: actorList.length, reservedPlayers: bodies.size });

    const dispose = () => {
      if (activePool === pool) activePool = null;
      if (unheard) unheard();
      if (unshot) { unshot(); unswung(); }
      if (unreacted) unreacted();
      unheard = unshot = unswung = unreacted = null;
      selfReact = ""; selfReactT = 0;
      if (lifted) { lifted.speechLift = 0; lifted = null; }
      for (const entry of [...bodies.values()]) drop(entry);
      actorList.length = 0;
    };

    // The override an Ooga hidden for its remote driver goes back to when they let go, for a scene that changed it
    // meanwhile; false when nobody remote holds it.
    const setUnderlying = (cave, override) => {
      for (const entry of bodies.values()) if (entry.hidden === cave) { entry.hiddenOverride = override; return true; }
      return false;
    };

    // Where a body's nameplate was last laid out, in CSS pixels, and its type: for a check, never a frame.
    const nameplate = (id) => {
      const entry = bodies.get(id);
      return entry && Number.isFinite(entry.plateLeft) ? { left: entry.plateLeft, top: entry.plateTop, width: entry.plateW, height: entry.plateH,
        textX: entry.plateTextX, baseline: entry.plateBaseline, barLeft: entry.plateBarLeft, barTop: entry.plateBarTop, barWidth: BAR_W,
        headX: entry.screenX, textWidth: entry.labelW, font: nameFont, spacing: NAME_SPACING } : null;
    };
    const pool = { update, actors, pick, drawNames, liveGeometry, stats, setUnderlying, nameplate, dispose, body: id => bodies.get(id)?.cave || null };
    return pool;
  };

  const nameplate = (id) => activePool ? activePool.nameplate(id) : null;
  const body = (id) => activePool ? activePool.body(id) : null;
  BL.remotePlayers = { create, nameplate, body, onIsland, sameZone, MAX, BODY_HEIGHT };
})();
