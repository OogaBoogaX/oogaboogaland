// Other signed-in visitors on the island, as the Oogas or gorillas they drive. Each one in `BL.net.remotes` with a
// body gets a caveman built from that Ooga's traits or a managed gorilla rig,
// eased toward the room's 15 Hz poses with a walk cycle while it moves, and a nameplate. The crew's own
// copy of that Ooga is sent `away` while someone else drives it, so no Ooga stands twice, and comes back
// when they let go; meanwhile its roster row shows the driver online (`remoteControlled`, the green dot).
// The crew turns its shoulders through remote players without routing around them.
// Who is shown is the scene's `visible(rec)`: the island shows players in its own zone (`onIsland` lists the
// island's places), every other scene those in its zone (`sameZone`). The crew is optional, for a scene that
// has none until the visitor drives, and `hide(name, on)` lets a scene hide its own decor copy of an Ooga
// someone drives. A nameplate sits a few pixels over the top of the head, whatever the Ooga's height: the green
// online dot left of the name and, for a player in voice, the speaker right of it: green while speaking, red with a
// cross when they muted their microphone. Games can opt into the room's `hp` bar, between the name and the head.
// With the scene's `fx`, a line of Ooga Chat is said in a bubble over its speaker's nameplate, the visitor's own
// line over the actor they drive (`player`, or `crew.player` when no callback is supplied).
// An Ooga thump (thump.js) reaches the active scene's pool through `thumped(id)` (0 for the visitor's own body): a still
// remote Ooga taps its club once (`BL.crew.thumpArm`), a remote gorilla beats its chest when its rig allows, the
// visitor's own Ooga taps through `crew.thump`; any other body (moving, seated, climbing, carried, holding a tool, a
// driven gorilla, or under Calm) gets a small mallet over its head for a moment instead. Only arms move; nothing
// physical changes. It answers a stereo pan from where that body was last drawn, 0 when it was not. `clearThumps` ends
// every mallet and tap at once when the visitor's voice group changes: the visitor's own club tap (`crew.cancelThump`)
// and a chest beat only while a thump started it (`beatOwned`), through the rig's own interrupt (`motion.workExit`).
// A beat begun by anything else is left alone.
// One pool per scene visit: `create` in enter, `dispose` in leave, before the crew's.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { addChild, removeChild, boundsOf } = BL.scene;
  const { quat } = BL.math;
  // A remote strike's arm swing, raised then brought down, in seconds; and the scratch the gun hold works in.
  const SWING_TIME = 0.35;
  const GUN_ARM = quat.create(), GUN_GRIP = quat.create(), GUN_HAND = quat.create(), GUN_AT = new Float64Array(3);
  const MAX = 32;
  const EASE = 10;
  const SNAP = 8;
  const WALK_SPEED = 0.35;
  const NAME_FONT = "bold 11px ui-monospace, monospace";
  // Preserve the existing Ooga footprint; an Ooga stands as tall as its own head (the crew's `bodyHeightOf`) and
  // gorillas expose their posed envelope. BODY_HEIGHT is the scenes' `outsideActorHeight` for a body without one.
  const BODY_RADIUS = 0.3, BODY_HEIGHT = 2.2;
  // Nameplate parts, in CSS pixels: the name's baseline NAME_LIFT over the head's top, the health bar under the name,
  // the online dot left of it and the 9-pixel speaker right of it, both centred on the name's letters (NAME_MID over
  // the baseline). A chat bubble stands SPEECH_LIFT over the head, clear of the name.
  const NAME_LIFT = 4, NAME_MID = 4, SPEECH_LIFT = 18, DOT_R = 3, BAR_W = 32, BAR_H = 4, BAR_GAP = 3, ICON_GAP = 4;
  const BAR_LIFT = BAR_GAP + BAR_H + 1;
  const NAME_STROKE = "rgba(20, 14, 8, 0.85)", NAME_FILL = "#f3efe4", BAR_TRACK = "rgba(0, 0, 0, 0.55)", ONLINE = "#22c55e";
  // The thump's fallback mallet, on the same 9x9 grid: x, y, w, h runs, drawn ICON_LIFT over the nameplate or head.
  const MALLET = [1, 1, 7, 3, 4, 4, 1, 5], MALLET_FILL = "#d8892b", ICON_TIME = 1.2, ICON_LIFT = 12;
  // Gorilla flags a chest beat must not interrupt: airborne, climbing, the lab's and the office's stances, asleep.
  const BEAT_BLOCKED = 1 | 4 | 16 | 32 | 64;
  const CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The pool of the scene that updated last: only the active scene's pool updates.
  let activePool = null;
  const BAR_FILL = "#d8892b", BAR_KO = "#e5533d", ICON_IDLE = "#a6a6a2", ICON_SPEAKING = "#22c55e", ICON_MUTED = "#e5533d";
  // A chat line stays up this long once said through.
  const CHAT_SAY = 4;
  // x, y, w, h runs on the speaker's 9x9 grid, as the roster's voice mark draws it.
  const SPEAKER = [0, 3, 2, 3, 2, 2, 1, 5, 3, 1, 1, 7];
  const WAVES = [5, 3, 1, 3, 7, 2, 1, 5];
  const CROSS = [5, 3, 1, 1, 7, 3, 1, 1, 6, 4, 1, 1, 5, 5, 1, 1, 7, 5, 1, 1];
  const runs = (ctx, cells, x, y) => {
    for (let i = 0; i < cells.length; i += 4) ctx.fillRect(x + cells[i], y + cells[i + 1], cells[i + 2], cells[i + 3]);
  };

  // The zones the hub itself reports, which share its coordinates: the island, its bridged lands and its caves
  // (`cave-<id>` for a mouth with no name of its own). Never a separate scene's zone, such as the Ember Den.
  const ISLAND_ZONES = new Set(["outside", "sphere", "rainforest", "bifrost", "lab", "bca", "factory", "arcade", "mirror", "hq"]);
  const onIsland = (zone) => ISLAND_ZONES.has(zone) || typeof zone === "string" && zone.startsWith("cave-");
  const sameZone = (rec) => rec.zone === BL.net.state.zone;

  // `posed(cave, feetY)` lets the scene finish a body's pose once it stands where the room says: the hub sets a
  // swimmer's arms by it, from the position the pose transport already carries, with no simulation of its own.
  // A hub supplies its companion's style and hides its local copy through the gorilla hooks; other scenes
  // use a basic managed rig. Both bodies share the room pose, nameplate and collision actor lifecycle.
  const create = ({ root, crew = null, fx = null, player = null, posed = null, visible = sameZone, hide = null, createGorilla = null, hideGorilla = null }) => {
    const net = BL.net;
    const bodies = new Map();
    // The chat subscription, taken on the first update and again after a kept hub's suspend disposed it; the
    // shot and strike subscriptions the same way.
    let unheard = null, unshot = null, unswung = null;
    // `dx`, `dz` and `dy` are what the body's feet and top did in the last update, which a player on its head rides.
    const actorPool = Array.from({ length: MAX }, () => ({ id: null, player: true, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, radius: BODY_RADIUS, height: BODY_HEIGHT }));
    const actorList = [];

    // The crew's Ooga of this name goes away while a remote drives it; its own override comes back after.
    const hideLocal = (entry) => {
      if (entry.gorilla) {
        if (hideGorilla) hideGorilla(entry.name, true);
        return;
      }
      if (hide) hide(entry.name, true);
      if (!crew) return;
      const cave = crew.cavemen.get(entry.name);
      if (!cave || cave === crew.player) return;
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
        const parts = cave.parts;
        for (const key of ["snack", "gun", "jetpack", "jetFlame"]) if (parts[key]) parts[key].visible = false;
      }
      // Remote rigs arrive after the hub's outline registry is built. Like Tess, their attached UI uses
      // the overlay's exact visibility test instead of requiring an entry in that static registry.
      cave.root.sightHidden = true;
      // Measured as built, before it is placed: feet at the root's own height, as the crew measures its Oogas.
      const height = gorilla ? 0 : BL.crew.bodyHeightOf(cave);
      addChild(root, cave.root);
      const motion = gorilla ? { walkPhase: NaN, walkGait: "knuckle", climb: 0, climbStride: 0, climbDirection: 0, climbSide: 0, swim: 0, lab: false, labRunIn: false, office: false, officeRise: 0, workExit: false } : null;
      const entry = { id: rec.id, body: rec.body, name, gorilla, cave, motion, baseY: gorilla ? 0 : cave.root.position.y, height, top: NaN, dTop: 0, jetNode: null, jetFlame: null, swing: 0, x: rec.x, y: rec.y, z: rec.z, yaw: rec.yaw, phase: 0, hidden: null, hiddenOverride: null, label: "", labelW: 0,
        still: false, thumpT: 0, icon: 0, screenX: NaN, beatOwned: false };
      bodies.set(rec.id, entry);
      hideLocal(entry);
      return entry;
    };

    const drop = (entry) => {
      if (fx) fx.hush(entry.cave);
      if (entry.gorilla) entry.cave.dispose();
      else removeChild(root, entry.cave.root);
      restoreLocal(entry);
      bodies.delete(entry.id);
    };

    const pose = (entry, dt) => {
      const { cave } = entry;
      const parts = cave.parts;
      const moved = Math.hypot(entry.dx, entry.dz) / Math.max(dt, 1e-3);
      entry.still = moved <= WALK_SPEED;
      // A walk, a strike or a gun out (`showWeapon` hides the club) ends a tap at once.
      if (!entry.still || entry.swing > 0 || !parts.club.visible) entry.thumpT = 0;
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
        if (entry.thumpT > 0) {
          entry.thumpT = Math.max(0, entry.thumpT - dt);
          parts.armR.rotation.x = BL.crew.thumpArm(1 - entry.thumpT / BL.crew.THUMP_TIME);
        }
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
      // A thump's beat is the thump's only while it lasts; the interrupt is asked for one pose.
      motion.workExit = false;
      if (entry.beatOwned && !entry.cave.beating) entry.beatOwned = false;
    };

    // The visitor's own body's fallback mallet, and the overlay last drawn on, for a thump's pan.
    let selfIcon = 0, selfBody = null, overlay = null;
    // Their jetpack from the room's `jet` (net.js): the character's built-in one, or the hub's model, put on as the
    // crew puts one on (`crew.jetpackNode`) the first time it shows. The flame flickers as the crew's does.
    let jetClock = 0;
    const showJet = (entry, jet) => {
      const cave = entry.cave, parts = cave.parts;
      if (!entry.jetNode) {
        if (!jet) return;
        entry.jetNode = parts.jetpack || BL.crew.jetpackNode(cave.root, cave.traits.height, 0, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
        entry.jetFlame = parts.jetpack ? parts.jetFlame : entry.jetNode.children[0];
      }
      const power = jet >> 1, flame = entry.jetFlame;
      entry.jetNode.visible = (jet & 1) === 1;
      flame.visible = entry.jetNode.visible && power > 0;
      if (flame.visible) flame.scale.y = (0.7 + Math.sin(jetClock * 40 + entry.id) * 0.3) * power / 2;
    };
    // Their weapons from the room's `weapon` (net.js), drawn in simple poses rather than the crew's own: the gun in
    // place of the club while it is out (the club as their model carries it otherwise, as before, slung or drawn),
    // the gun's bananas by the crew's rule, the gun in the right palm as the crew holds it to aim, the arm raised
    // while they aim, and a strike's swing.
    const showWeapon = (entry, weapon, dt) => {
      const cave = entry.cave, parts = cave.parts, arm = parts.armR, gun = parts.gun, held = weapon & 3, h = cave.traits.height;
      parts.club.visible = held !== 2;
      gun.visible = held === 2;
      if (entry.swing > 0) entry.swing = Math.max(0, entry.swing - dt);
      if (entry.swing > 0) {
        const t = 1 - entry.swing / SWING_TIME;
        arm.rotation.x = t < 0.35 ? -0.2 - 2.4 * t / 0.35 : -2.6 + 3.2 * (t - 0.35) / 0.65;
      } else if (held === 2 && weapon & 4) arm.rotation.x = -Math.PI / 2;
      if (held !== 2) return;
      const rounds = weapon >> 3;
      for (let i = 0; i < parts.gunBananas.length; i++) parts.gunBananas[i].visible = rounds > (i + 1) * BL.crew.BURST_ROUNDS;
      // The crew's aim hold (poseWeapon): the palm at the end of the turned arm, the rifle pivoting round its grip.
      quat.fromEuler(GUN_ARM, arm.rotation.x, arm.rotation.y, 0);
      quat.fromEuler(GUN_GRIP, 0, Math.PI / 2, 0);
      quat.multiply(GUN_HAND, GUN_ARM, GUN_GRIP);
      quat.rotateVec(GUN_AT, GUN_HAND, 0, -0.625 * h, 0.15 * h);
      const palmX = arm.position.x + GUN_AT[0], palmY = arm.position.y + GUN_AT[1], palmZ = arm.position.z + GUN_AT[2];
      quat.fromEuler(GUN_GRIP, Math.PI / 2, 0, 0);
      quat.multiply(gun.quaternion, GUN_ARM, GUN_GRIP);
      quat.rotateVec(GUN_AT, gun.quaternion, 0, -0.14 * h, -0.184 * h);
      gun.position.x = palmX - GUN_AT[0]; gun.position.y = palmY - GUN_AT[1]; gun.position.z = palmZ - GUN_AT[2];
    };
    // Another player's banana flies as the crew's replayed shots do, with no hits; their strike swings the arm.
    const shotHeard = (id, a) => {
      const entry = bodies.get(id);
      if (entry && !entry.gorilla && entry.cave.root.visible && crew && crew.showShot) crew.showShot(null, a[0], a[1], a[2], a[3], a[4], a[5]);
    };
    const swingHeard = (id) => {
      const entry = bodies.get(id);
      if (entry && !entry.gorilla) entry.swing = SWING_TIME;
    };

    const update = (dt) => {
      jetClock += dt;
      activePool = pool;
      if (selfIcon > 0) selfIcon = Math.max(0, selfIcon - dt);
      if (fx && !unheard) unheard = net.subscribeChat(heard);
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
        const far = Math.hypot(rec.x - entry.x, rec.y - entry.y, rec.z - entry.z) > SNAP;
        const t = far ? 1 : k;
        entry.dx = (rec.x - entry.x) * t;
        entry.dz = (rec.z - entry.z) * t;
        entry.x += entry.dx;
        entry.y += (rec.y - entry.y) * t;
        entry.z += entry.dz;
        entry.yaw += Math.atan2(Math.sin(rec.yaw - entry.yaw), Math.cos(rec.yaw - entry.yaw)) * t;
        if (far) entry.dx = entry.dz = 0;
        if (entry.icon > 0) entry.icon = Math.max(0, entry.icon - dt);
        if (entry.gorilla) poseGorilla(entry, rec, dt);
        else {
          pose(entry, dt);
          showJet(entry, rec.jet);
          showWeapon(entry, rec.weapon | 0, dt);
          if (posed) posed(entry.cave, entry.cave.root.position.y - entry.baseY);
        }
        // The top's move carries a player standing on it; a snap carries nobody.
        const height = entry.gorilla ? entry.cave.bodyHeight : entry.height, top = entry.y + height;
        entry.dTop = far || Number.isNaN(entry.top) ? 0 : top - entry.top;
        entry.top = top;
        entry.cave.root.visible = visible(rec) && !(!entry.gorilla && crew && crew.player && crew.player.traits.name === entry.name);
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

    // The head's top on screen and its middle across, from the corners of every visible mesh under the head as the
    // last frame drew them; false when none projects.
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

    // Nameplates on the overlay, just over each head, in the order the room sent them: the online dot, the name and,
    // in voice, the speaker in one row, with the health bar under the name when the game shows it.
    const mallet = (ctx, x, y) => {
      ctx.fillStyle = NAME_STROKE;
      for (let i = 0; i < MALLET.length; i += 4) ctx.fillRect(x + MALLET[i] - 1, y + MALLET[i + 1] - 1, MALLET[i + 2] + 2, MALLET[i + 3] + 2);
      ctx.fillStyle = MALLET_FILL;
      runs(ctx, MALLET, x, y);
    };
    const drawNames = (ctx, project, showHealth = false) => {
      overlay = ctx.canvas;
      if (!bodies.size && selfIcon <= 0) return;
      ctx.save();
      if (selfIcon > 0) {
        const rig = selfBody && (selfBody.parts ? selfBody : selfBody.gorilla);
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        if (rig && rig.parts && rig.parts.head && rig.root.visible) projectHead(rig.parts.head, project);
        if (headTop !== Infinity) mallet(ctx, Math.round((headMinX + headMaxX) / 2) - 4, Math.round(headTop) - ICON_LIFT - 9);
      }
      ctx.font = NAME_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      const lift = NAME_LIFT + (showHealth ? BAR_LIFT : 0);
      for (const entry of bodies.values()) {
        const rec = net.remotes.get(entry.id);
        if (!rec || !entry.cave.root.visible) continue;
        headMinX = Infinity; headMaxX = -Infinity; headTop = Infinity;
        projectHead(entry.cave.parts.head, project);
        if (headTop === Infinity) continue;
        entry.cave.speechLift = SPEECH_LIFT + lift - NAME_LIFT;
        // Measured once a name: measureText allocates.
        if (entry.label !== rec.display) { entry.label = rec.display; entry.labelW = ctx.measureText(rec.display).width; }
        const x = Math.round((headMinX + headMaxX) / 2), y = Math.round(headTop) - lift, half = entry.labelW / 2;
        entry.screenX = x;
        if (entry.icon > 0) mallet(ctx, x - 4, y - ICON_LIFT - 9);
        ctx.strokeStyle = NAME_STROKE;
        ctx.fillStyle = NAME_FILL;
        ctx.strokeText(rec.display, x, y);
        ctx.fillText(rec.display, x, y);
        ctx.beginPath();
        ctx.arc(x - half - ICON_GAP - DOT_R, y - NAME_MID, DOT_R, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.fillStyle = ONLINE;
        ctx.fill();
        if (showHealth) {
          const left = x - BAR_W / 2, top = y + BAR_GAP;
          ctx.fillStyle = NAME_STROKE;
          ctx.fillRect(left - 1, top - 1, BAR_W + 2, BAR_H + 2);
          ctx.fillStyle = BAR_TRACK;
          ctx.fillRect(left, top, BAR_W, BAR_H);
          ctx.fillStyle = rec.ko ? BAR_KO : BAR_FILL;
          ctx.fillRect(left, top, Math.round(BAR_W * Math.max(0, Math.min(100, rec.hp)) / 100), BAR_H);
        }
        if (!rec.voice) continue;
        const ix = Math.round(x + half + ICON_GAP), iy = y - NAME_MID - 4;
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

    // A thump from player `id`, or 0 for the visitor's own: the body's one-off, or its mallet; the pan, or null with no body.
    const thumped = (id) => {
      const calm = CALM.matches;
      if (id === 0) {
        const body = player ? player() : crew && crew.player;
        if (!body) return null;
        if (calm || !crew || body !== crew.player || !crew.thump(body)) { selfIcon = ICON_TIME; selfBody = body; }
        return 0;
      }
      const entry = bodies.get(id), rec = net.remotes.get(id);
      if (!entry || !rec || !entry.cave.root.visible) return null;
      let tapped = false;
      if (!calm && entry.gorilla) {
        const g = rec.g;
        tapped = !(g && (g[0] & BEAT_BLOCKED || g[5] > 0)) && entry.cave.beat();
        // Only a beat this thump started becomes the thump's; one that could not start leaves ownership as it was.
        if (tapped) entry.beatOwned = true;
      } else if (!calm && entry.still && !(entry.swing > 0) && entry.cave.parts.club.visible) {
        entry.thumpT = BL.crew.THUMP_TIME;
        tapped = true;
      }
      if (!tapped) entry.icon = ICON_TIME;
      const w = overlay ? overlay.clientWidth : 0;
      return w > 0 && Number.isFinite(entry.screenX) ? Math.max(-1, Math.min(1, entry.screenX / w * 2 - 1)) : 0;
    };

    // The visitor's voice group changed (thump.js): every mallet and club tap from the one before goes now.
    const clearThumps = () => {
      selfIcon = 0;
      if (crew) crew.cancelThump();
      for (const entry of bodies.values()) {
        entry.icon = entry.thumpT = 0;
        if (entry.beatOwned) { entry.beatOwned = false; entry.motion.workExit = true; }
      }
    };

    const liveGeometry = (set) => {
      for (const entry of bodies.values()) {
        if (entry.gorilla) entry.cave.liveGeometry(set);
        else set.add(entry.cave.headOpen).add(entry.cave.headClosed);
      }
    };

    const stats = () => ({ remotePlayers: actorList.length, reservedPlayers: bodies.size, thumpIcons: (selfIcon > 0 ? 1 : 0) + [...bodies.values()].filter((e) => e.icon > 0).length,
      thumpTaps: [...bodies.values()].filter((e) => e.thumpT > 0).length, thumpBeats: [...bodies.values()].filter((e) => e.gorilla && e.cave.beating).length });

    const dispose = () => {
      if (activePool === pool) activePool = null;
      selfBody = overlay = null;
      if (unheard) unheard();
      if (unshot) { unshot(); unswung(); }
      unheard = unshot = unswung = null;
      for (const entry of [...bodies.values()]) drop(entry);
      actorList.length = 0;
    };

    // The override an Ooga hidden for its remote driver goes back to when they let go, for a scene that changed it
    // meanwhile; false when nobody remote holds it.
    const setUnderlying = (cave, override) => {
      for (const entry of bodies.values()) if (entry.hidden === cave) { entry.hiddenOverride = override; return true; }
      return false;
    };

    const pool = { update, actors, drawNames, liveGeometry, stats, setUnderlying, thumped, clearThumps, dispose, body: id => bodies.get(id)?.cave || null };
    return pool;
  };
  const thumped = (id) => activePool ? activePool.thumped(id) : null;
  const clearThumps = () => { if (activePool) activePool.clearThumps(); };

  BL.remotePlayers = { create, thumped, clearThumps, onIsland, sameZone, MAX, BODY_HEIGHT };
})();
