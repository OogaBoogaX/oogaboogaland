// Other signed-in visitors on the island, as the Oogas or gorillas they drive. Each one in `BL.net.remotes` with a
// body gets a caveman built from that Ooga's traits or a managed gorilla rig,
// eased toward the room's 15 Hz poses with a walk cycle while it moves, and a nameplate. The crew's own
// copy of that Ooga is sent `away` while someone else drives it, so no Ooga stands twice, and comes back
// when they let go; meanwhile its roster row shows the driver online (`remoteControlled`, the green dot).
// The crew walks round remote bodies through `actors`, its `outsideActors`.
// Who is shown is the scene's `visible(rec)`: the island shows players in its own zone (`onIsland` lists the
// island's places), every other scene those in its zone (`sameZone`). The crew is optional, for a scene that
// has none until the visitor drives, and `hide(name, on)` lets a scene hide its own decor copy of an Ooga
// someone drives. A nameplate sits a few pixels over the top of the head, whatever the Ooga's height: the green
// online dot left of the name and, for a player in voice, the speaker right of it: green while speaking, red with a
// cross when they muted their microphone. Games can opt into the room's `hp` bar, between the name and the head.
// With the scene's `fx`, a line of Ooga Chat is said in a bubble over its speaker's nameplate, the visitor's own
// line over the actor they drive (`player`, or `crew.player` when no callback is supplied).
// One pool per scene visit: `create` in enter, `dispose` in leave, before the crew's.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { addChild, removeChild, boundsOf } = BL.scene;
  const MAX = 32;
  const EASE = 10;
  const SNAP = 8;
  const WALK_SPEED = 0.35;
  const NAME_FONT = "bold 11px ui-monospace, monospace";
  // Preserve the existing Ooga footprint; gorillas expose their posed envelope.
  const BODY_RADIUS = 0.3, BODY_HEIGHT = 2.2;
  // Nameplate parts, in CSS pixels: the name's baseline NAME_LIFT over the head's top, the health bar under the name,
  // the online dot left of it and the 9-pixel speaker right of it, both centred on the name's letters (NAME_MID over
  // the baseline). A chat bubble stands SPEECH_LIFT over the head, clear of the name.
  const NAME_LIFT = 4, NAME_MID = 4, SPEECH_LIFT = 18, DOT_R = 3, BAR_W = 32, BAR_H = 4, BAR_GAP = 3, ICON_GAP = 4;
  const BAR_LIFT = BAR_GAP + BAR_H + 1;
  const NAME_STROKE = "rgba(20, 14, 8, 0.85)", NAME_FILL = "#f3efe4", BAR_TRACK = "rgba(0, 0, 0, 0.55)", ONLINE = "#22c55e";
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
    // The chat subscription, taken on the first update and again after a kept hub's suspend disposed it.
    let unheard = null;
    const actorPool = Array.from({ length: MAX }, () => ({ id: null, x: 0, y: 0, z: 0, radius: BODY_RADIUS, height: BODY_HEIGHT }));
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
      addChild(root, cave.root);
      const motion = gorilla ? { walkPhase: NaN, walkGait: "knuckle", climb: 0, climbStride: 0, climbDirection: 0, climbSide: 0, swim: 0, lab: false, labRunIn: false, office: false, officeRise: 0 } : null;
      const entry = { id: rec.id, body: rec.body, name, gorilla, cave, motion, baseY: gorilla ? 0 : cave.root.position.y, x: rec.x, y: rec.y, z: rec.z, yaw: rec.yaw, phase: 0, hidden: null, hiddenOverride: null, label: "", labelW: 0 };
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

    const update = (dt) => {
      if (fx && !unheard) unheard = net.subscribeChat(heard);
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
        if (entry.gorilla) poseGorilla(entry, rec, dt);
        else {
          pose(entry, dt);
          if (posed) posed(entry.cave, entry.cave.root.position.y - entry.baseY);
        }
        entry.cave.root.visible = visible(rec) && !(!entry.gorilla && crew && crew.player && crew.player.traits.name === entry.name);
        if (!entry.cave.root.visible) continue;
        const actor = actorPool[n++];
        actor.id = entry.id;
        actor.x = entry.x; actor.y = entry.y; actor.z = entry.z;
        actor.radius = entry.gorilla ? entry.cave.bodyRadius : BODY_RADIUS;
        actor.height = entry.gorilla ? entry.cave.bodyHeight : BODY_HEIGHT;
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
    const drawNames = (ctx, project, showHealth = false) => {
      if (!bodies.size) return;
      ctx.save();
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

    const liveGeometry = (set) => {
      for (const entry of bodies.values()) {
        if (entry.gorilla) entry.cave.liveGeometry(set);
        else set.add(entry.cave.headOpen).add(entry.cave.headClosed);
      }
    };

    const stats = () => ({ remotePlayers: actorList.length, reservedPlayers: bodies.size });

    const dispose = () => {
      if (unheard) unheard();
      unheard = null;
      for (const entry of [...bodies.values()]) drop(entry);
      actorList.length = 0;
    };

    // The override an Ooga hidden for its remote driver goes back to when they let go, for a scene that changed it
    // meanwhile (HALLOWEEN: the hunt gives back what it cleared); false when nobody remote holds it.
    const setUnderlying = (cave, override) => {
      for (const entry of bodies.values()) if (entry.hidden === cave) { entry.hiddenOverride = override; return true; }
      return false;
    };

    return { update, actors, drawNames, liveGeometry, stats, setUnderlying, dispose };
  };

  BL.remotePlayers = { create, onIsland, sameZone, MAX, BODY_HEIGHT };
})();
