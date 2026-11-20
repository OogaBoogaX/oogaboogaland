(() => {
  "use strict";
  // The room's models, rules, cards and HUD are deferred on a hosted page and arrive in `prepare`; the themes stay
  // in the page, since the island's BIFROST window is tinted by them.
  const BL = window.BL, S = BL.scene, Themes = BL.pokerThemes;
  const presets = { entrance: { yaw: 0, pitch: 0.48, dist: 18, target: { x: 0, y: 1, z: 17 } } };
  const VIEW_NAMES = { entrance: "Overview" };
  let tableView = false;
  const renderOpts = { clear: [0.1, 0.12, 0.09], sky: [0.62, 0.57, 0.45], ground: [0.31, 0.36, 0.27],
    direct: [0.88, 0.77, 0.58], directStrength: 0.38, ambientFloor: 0.48, sun: { x: 0.2, y: 1, z: 0.3 },
    shadowCenter: { x: 0, y: 1.5, z: 0 }, shadowExtent: 35, bloomStrength: 0.24,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 13 };
  let root, camera, input, hud, panel, pilot, fx, people, avatar, room, mirror, game, world, session, go;
  let leaving = false, timer = 0, selected = 0, pendingStand = false, seatTable = -1, shownCountdown = -1;
  const targets = [], snapshots = new Array(10);
  let HERO = "local-player", connecting = false, unsubscribeAccount = null, remotes = null, footsteps = null;
  let visit = 0, pendingLive = null;
  // The visitor's Ooga sits in a chair: the crew's resident hook holds it there (no fall, no walk pose) while the rest move.
  let seated = false;
  // Which remote each of the 90 chairs is honoured for this frame and last (poker-presence.js), and the resolver's one
  // input, made in `enter`: a table whose chairs changed hands rebuilds its figures and the panel its faces.
  let owner = null, lastOwner = null, lastBody = null, presenceInput = null;
  const seatOf = (t, s) => snapshots[t].seats[s];
  // Table emotes (poker-emotes.js), made in `enter`: for each of the 90 chairs who sits there as last seen (the visitor's
  // Ooga or its remote record), the emoji showing and its time left, a count of the emotes it took (so a repeat restarts
  // the seat's pop), and the gesture playing and how far through it is; the panel's nine seats remember which chair's
  // emote they show. `heroChair` is the visitor's own chair, written in `sit`.
  let emoteBy = null, emoteEmoji = null, emoteTime = null, emoteCount = null, gestureKind = null, gestureT = null;
  let shownChair = null, shownCount = null, heroChair = -1, unsubscribeReactions = null;
  // A gesture dropped mid-run leaves no limb turned: the arms' y and a bowed head back to rest (the arms' x is the
  // sitting or standing pose's own, written every frame).
  const BOWS = ["armsUp", "headInHands", "shrug"];
  const settle = (cave, kind) => {
    const p = cave.parts;
    if (p.armL) p.armL.rotation.y = 0; if (p.armR) p.armR.rotation.y = 0;
    if (p.head && BOWS.includes(BL.pokerEmotes.GESTURES[kind])) p.head.rotation.x = 0;
  };
  const settleAt = k => {
    const by = emoteBy[k], kind = gestureKind[k];
    if (kind && by) { const cave = by === avatar ? avatar : remotes.body(by.id); if (cave) settle(cave, kind); }
  };
  const dropEmote = k => {
    settleAt(k);
    emoteEmoji[k] = ""; emoteTime[k] = 0; gestureKind[k] = 0; gestureT[k] = 0;
  };
  // A reaction from the room (id 0 is the visitor's own): it shows at the sender's chair, the visitor's while seated or
  // the one Level 1 matched that remote to, and plays its gesture there; a sender with no chair shows at none.
  const onReaction = (id, emoji) => {
    let k = -1;
    if (id === 0) { if (seated) k = heroChair; } else for (let c = 0; c < 90; c++) if (owner[c] && owner[c].id === id) { k = c; break; }
    if (k < 0) return;
    emoteEmoji[k] = emoji; emoteTime[k] = BL.pokerEmotes.SHOW_TIME; emoteCount[k]++;
    const e = BL.pokerEmotes.byEmoji(emoji);
    // A gesture cut short by a newer one is settled first, so a bowed head or a turned arm the new one never writes is not left so.
    if (e && e.gesture) { if (gestureKind[k]) settleAt(k); gestureKind[k] = e.gesture; gestureT[k] = 0; }
  };
  const emote = id => { const e = BL.pokerEmotes.EMOTES.find(x => x.id === id); return !!e && BL.net.sendReaction(e.emoji); };
  // Tells and fidgets (poker-tells.js), made in `enter`: one tell state a chair, and one public view a table, refreshed
  // in `syncTable` and the only thing the tells are ever handed (never a snapshot, a seat or a card); whether a table's
  // view changed since it was last stepped; whether the tells run (not while a live table is down); the visitor's
  // reduced-motion wish (`calm`, no fidgets). `LOOK_YAW[j * 9 + s]` turns seat j's head toward seat s; a sweat bead sits
  // `BROW` of a figure's height over its root, scaled with it. A practice bot facing a big bet holds `botWait` seconds
  // more before acting, granted once a turn (`botFor`, `botPot`: the hand and seat on turn, and the pot, it was granted at).
  let tells = null, tellViews = null, tellFresh = null, tellsOn = true, calm = false;
  const LOOK_YAW = new Float32Array(81), BROW = 0.844, botWait = new Float32Array(10), botFor = new Float64Array(10), botPot = new Float64Array(10);
  // A figure that stops being posed at a chair keeps its own arms' x (sitting or standing): only what a tell turned goes back.
  const unbend = cave => { const p = cave.parts; if (p.armL) p.armL.rotation.y = 0; if (p.armR) p.armR.rotation.y = 0; if (p.head) { p.head.rotation.x = 0; p.head.rotation.y = 0; } };
  // Whoever sits at table i's seat j as drawn: the visitor's Ooga, a signed-in player's own, else the bot or stand-in.
  const figureAt = (i, j) => { const k = i * 9 + j; if (seated && k === heroChair) return avatar; const r = owner[k], b = r ? remotes.body(r.id) : null; return b || room.tables[i].actors[j]; };
  const lookFor = k => {
    if (tells.fidget[k] !== BL.pokerTells.FIDGET.LOOK) return 0;
    const i = (k / 9) | 0, j = k - i * 9, turn = tellViews[i].turn;
    return turn < 0 || turn === j ? 0 : LOOK_YAW[j * 9 + turn];
  };
  // A seated figure's arms and head this frame, over the sitting pose: its chosen emote's gesture wins (a turn a tell
  // left on the head put back first), else its tell or fidget. A sitter the emote pass has not yet taken in at this chair
  // is left alone this frame, since the chair is reset for it first.
  const seatPose = (cave, k, by) => {
    if (emoteBy[k] !== by) return;
    if (gestureKind[k]) { if (tells.posed[k]) BL.pokerTells.settle(cave); BL.pokerEmotes.gesture(cave, gestureKind[k], gestureT[k]); }
    else BL.pokerTells.pose(cave, tells, k, lookFor(k));
  };
  // Table i's one tossed pair and one pushed stack, each placed for the seat whose toss or push started last (every toss,
  // and every push, runs the same time, so the smallest `t`), else hidden.
  const placeProps = i => {
    const T = BL.pokerTells, view = room.tables[i];
    let toss = -1, tossT = 2, push = -1, pushT = 2;
    for (let j = 0; j < 9; j++) {
      const k = i * 9 + j, kind = tells.kind[k];
      if (kind === T.TELL.TOSS && tells.t[k] < tossT) { toss = j; tossT = tells.t[k]; }
      else if (kind === T.TELL.PUSH && tells.t[k] < pushT) { push = j; pushT = tells.t[k]; }
    }
    if (toss >= 0) view.placeToss(toss, tossT); else view.hideToss();
    if (push >= 0) view.placePush(push, pushT); else view.hidePush();
  };
  // A chair's tell cleared at once, its bead and any prop it showed with it, so nothing lingers while the table is not
  // stepped (a paused practice game).
  const resetChair = k => {
    const i = (k / 9) | 0;
    BL.pokerTells.reset(tells, k); room.tables[i].setBeads(k - i * 9, 0); placeProps(i);
  };
  // A chair whose sitter changed: the one leaving, if a tell turned it and it is still here, is put back; the chair starts clean.
  const dropTell = k => {
    const old = emoteBy[k];
    if (old && tells.posed[k]) { const cave = old === avatar ? avatar : remotes.body(old.id); if (cave) unbend(cave); }
    resetChair(k);
  };
  // A table the page stops stepping (the session switched, a live table went down): its figures settle, its props hide,
  // and when it comes back its next step takes it in afresh, replaying nothing.
  const forgetTable = i => {
    const view = room.tables[i];
    for (let j = 0; j < 9; j++) { if (tells.posed[i * 9 + j]) { const f = figureAt(i, j); if (f) BL.pokerTells.settle(f); } view.setBeads(j, 0); }
    view.hideToss(); view.hidePush(); BL.pokerTells.forget(tells, i); tellFresh[i] = 0; botWait[i] = 0; botFor[i] = -1; botPot[i] = -1;
  };
  // Table i's tells for this frame, run only with a fresh view, someone on turn or a tell still running (a table with
  // nobody in a hand does nothing): its bots and stand-ins posed, each seat's sweat shown at the brow of the figure in
  // that chair (none over a chair whose sitter is out of it, as a visitor walking the floor while holding the seat), and
  // its props placed.
  const stepTells = (i, dt) => {
    const T = BL.pokerTells, v = tellViews[i];
    if (!snapshots[i] || !(tellFresh[i] || v.turn >= 0 || tells.busy[i] || tells.hand[i] === -1)) return;
    tellFresh[i] = 0;
    T.step(tells, i, v, dt, Math.random, calm);
    const view = room.tables[i];
    for (let j = 0; j < 9; j++) {
      const k = i * 9 + j, level = tells.sweat[k], f = level ? figureAt(i, j) : null;
      if (f) {
        view.setBeads(j, level);
        const bead = view.beadAt(j);
        if (bead) bead.position.y = f.root.position.y + f.root.scale.y * BROW * f.traits.height + 0.02;
      } else view.setBeads(j, 0);
      const actor = view.actors[j];
      if (actor) T.pose(actor, tells, k, lookFor(k));
    }
    placeProps(i);
  };
  // A practice bot whose turn faces a big bet holds once that turn, keyed by the hand, the seat on turn and the pot (a
  // seat's later turn in the same hand facing a new bet has a larger pot; a seat added or a refill changes none of the
  // three); the wait reads the table's public view alone.
  const botHolds = i => {
    const v = tellViews[i], key = v.hand * 16 + v.turn;
    if (botFor[i] === key && botPot[i] === v.pot) return false;
    botFor[i] = key; botPot[i] = v.pot;
    const hold = BL.pokerTells.botHold(v);
    if (hold > 0) botWait[i] = hold;
    return hold > 0;
  };
  // The held bot acts the moment its hold runs out, off the 0.8 s beat; returns whether the table changed.
  const botMove = i => {
    const t = session.tables[i], s = snapshots[i], player = s.seats[s.turn];
    try { if (player?.bot) BL.pokerRules.botAction(t, player.id); } catch (error) { session.autoDeal[i] = false; panel.notice(error.message); }
    if (t.version === room.tables[i].version) return false;
    syncTable(i); return true;
  };
  // The room's music and sound (poker-audio.js): where the visitor hears from, written in place each frame, the crowd's
  // footfalls handed on to it, and whether a table's result may dip the music (not on the visit's first refresh).
  let audio = null, cheers = false;
  const EAR = { x: 0, z: 0, fx: 0, fz: 1 }, onStep = (name, x, z) => audio.cue(name, x, z);
  // The crowd walking the floor (poker-crowd.js), as many as the renderer's tier carries, giving way to the bodies in
  // `crowdBodies`: the visitor's Ooga and the other players here, rewritten in place each frame.
  let crowd = null, renderer = null, crowdTimer = 0;
  const CROWD_CAP = { high: 16, medium: 10, low: 6 }, crowdBodies = [], ownBody = { x: 0, z: 0, radius: 0 };
  const crowdCap = () => renderer.kind === "canvas2d" ? 6 : CROWD_CAP[renderer.quality];
  const NO_ACTORS = [], CLEAR = { x: 0, z: 0 };
  let extraLights = new Float32Array(0);
  // On the Worker's page the island's driving rules hold in here too, and the Ooga driven is reported to the room
  // every frame, so signed-in players on the floor hear each other (voice needs a driven Ooga).
  const mayPossess = cave => BL.net.mayDrive(cave.traits.name, BL.contributors.stateFor(cave.contributor) === "working");
  const mayPick = c => !BL.net.mayDrive(c.name, BL.contributors.stateFor(c) === "working");
  const accountChanged = () => {
    if (!avatar) return;
    if (session?.live?.account && session.live.account !== String(BL.net.state.me?.id)) session.live.disconnect("Account changed. Reload and sign in to the original account to recover this game.");
    const released = BL.net.state.released;
    const denied = mayPossess(avatar) || (released && released.name === avatar.traits.name ? "That Ooga is no longer yours to drive" : null);
    BL.net.state.released = null;
    // Nobody walks the floor without an Ooga: one no longer theirs goes back out, where the island hands them their own.
    if (denied && people.player === avatar) { pilot.release(true); hud.toast(denied); leaveFloor(); }
  };
  // The crowd's whole view of table i, from what every player sees: the pot, the phase, the hand, its winner (the first
  // non-refund pot's first, once the hand has a result) and whether anyone still in it is all in. Never a seat's cards.
  const publicState = (i, out) => {
    const s = snapshots[i];
    out.pot = s.pot; out.phase = s.phase; out.hand = s.hand;
    let winner = -1, allIn = false;
    if (s.result) for (let k = 0; k < s.result.pots.length; k++) if (!s.result.pots[k].refund) { winner = s.result.pots[k].winners[0]; break; }
    for (let j = 0; j < s.seats.length; j++) { const p = s.seats[j]; if (p && p.inHand && p.stack === 0) allIn = true; }
    out.winner = winner; out.allIn = allIn;
    return out;
  };
  const nextHand = new Float64Array(10), completed = new Int32Array(10);
  let theme = Themes.get("gatsby");
  const clamp = BL.math.clamp;
  const clampTarget = p => { p.x = clamp(p.x, -22, 22); p.z = clamp(p.z, -34, 34); p.y = clamp(p.y, 0.5, 7); };
  const clampCamera = p => {
    const x = p.x, y = p.y, z = p.z;
    // Stay inside the wall finishes and columns, with clearance for the camera's near plane.
    p.x = clamp(x, -23, 23); p.z = clamp(z, -35.7, 35.7); p.y = clamp(y, 0.8, 8.5);
    return p.x !== x || p.y !== y || p.z !== z;
  };
  const keepCameraInside = () => {
    const p = camera.position, x = p.x, y = p.y, z = p.z;
    if (!clampCamera(p)) return;
    // Orbit/overhead views supply their own look direction; retain it when stopping at a wall.
    camera.target.x += p.x - x; camera.target.y += p.y - y; camera.target.z += p.z - z;
  };
  const activeTable = () => session.tables[selected];
  const setTheme = id => {
    theme = Themes.get(id); room.setTheme(theme.id); panel.setTheme(theme.id);
    session.theme = theme.id;
    renderOpts.sky = theme.sky; renderOpts.ground = theme.ground; renderOpts.direct = theme.direct; renderOpts.ambientFloor = theme.ambient; renderOpts.bloomStrength = theme.bloom ?? 0.24; renderOpts.directStrength = theme.directStrength ?? 0.38;
    // A theme's fittings may stand where a standing Ooga is: it steps to the nearest spot clear of them.
    BL.pokerModels.setFloor(theme.id);
    if (crowd) crowd.refloor(BL.pokerModels.spots(theme.id));
    audio.setTheme(theme.id);
    // A theme's own lights (Banana Club's bar, cage and fountain) follow the room's thirteen, in slots no tier keeps first.
    extraLights = BL.pokerModels.lights(theme.id); renderOpts.lightCount = 13 + extraLights.length / 8;
    const p = avatar && !seated ? avatar.root.position : null;
    if (p && !BL.pokerModels.walkable(p.x, p.z, p.x, p.z, 0, avatar.bodyHeight, avatar)) { BL.pokerModels.nearestClear(p.x, p.z, avatar, CLEAR); p.x = CLEAR.x; p.z = CLEAR.z; }
  };
  const leaveFloor = () => { if (leaving) return; if (session.live && seatTable >= 0) { panel.notice("Stand between hands before leaving. You can walk the floor while connected."); return; } if (go("bifrost", null, true)) leaving = true; };
  const setView = focused => {
    panel.setFocused(focused); pilot.controls.reset();
    BL.net.setPokerVoice(focused ? selected : null);
    pilot.setActive(!focused); audio.setSeated(focused);
  };
  const modeAction = name => !leaving && !panel.focused && (seatTable < 0 || pendingStand) && pilot.modeAction(name);
  const placeInAisle = () => {
    if (!avatar) return;
    // A tell cut short by standing settles before the standing pose takes the arms back, and the chair forgets it.
    if (seated && heroChair >= 0 && tells) { BL.pokerTells.settle(avatar); resetChair(heroChair); }
    BL.pokerModels.standPose(avatar);
    // Today's spot in the aisle beside the table, or the open floor nearest it (Banana Club's fountain fills the middle).
    const p = BL.pokerModels.nearestClear(0, BL.pokerModels.TABLES[selected].z, avatar, CLEAR);
    avatar.root.position.x = p.x; avatar.root.position.y = avatar.baseY; avatar.root.position.z = p.z;
    avatar.root.rotation.y = Math.PI; avatar.root.visible = true;
    pilot.setActive(true); pilot.controls.reset(); seated = false;
    document.body.removeAttribute("data-poker-seated");
  };
  // Banana Club's placards: a tap, or the act button within 2 m of a plinth off the tables, opens the one board at that
  // figure's page, and its arrows page through all eight.
  const openPlacard = i => { const board = BL.pokerStatues.board(); board.go(i); hud.openBoard(board); };
  const nearPlacard = () => {
    if (theme.id !== "gatsby" || seated || !avatar) return -1;
    const p = avatar.root.position, half = BL.pokerStatues.PLINTH.w / 2;
    let best = -1, bestD = 2;
    BL.pokerStatues.SLOTS.forEach((s, i) => { const d = Math.hypot(Math.max(0, Math.abs(p.x - s.x) - half), Math.max(0, Math.abs(p.z - s.z) - half)); if (d <= bestD) { bestD = d; best = i; } });
    return best;
  };
  const sit = index => {
    const p = BL.pokerModels.TABLES[selected], s = BL.pokerModels.SEATS[index];
    avatar.root.position.x = p.x + s.x; avatar.root.position.z = p.z + s.z;
    avatar.root.position.y = avatar.baseY + BL.pokerPresence.CHAIR_Y; avatar.root.rotation.y = s.yaw;
    pilot.controls.reset(); pilot.setActive(false); seated = true; heroChair = index >= 0 ? selected * 9 + index : -1;
    document.body.dataset.pokerSeated = "true";
  };
  const syncTable = i => {
    const t = session.tables[i], view = room.tables[i], s = t.snapshot(i === seatTable && !pendingStand ? HERO : null), was = snapshots[i];
    snapshots[i] = s; view.version = t.version; view.pulse = 0.7;
    BL.pokerTells.view(s, tellViews[i]); tellFresh[i] = 1;
    if (s.result && completed[i] !== s.hand) {
      completed[i] = s.hand; nextHand[i] = 5;
      // A hand ending at the table the visitor sits at or watches, won or lost, dips the music, only when this visit saw it played.
      if (cheers && was && (!was.result || was.hand !== s.hand) && (i === seatTable || panel.focused && i === selected)) audio.win();
    }
    seatFigures(i);
    for (let j = 0; j < 5; j++) { view.board[j].visible = j < s.board.length && Number.isInteger(s.board[j]); if (view.board[j].visible) view.board[j].geometry = BL.pokerModels.card(s.board[j]); }
    view.button.visible = s.dealer >= 0;
    if (s.dealer >= 0) { const p = BL.pokerModels.SEATS[s.dealer]; view.button.position.x = p.x * 0.72; view.button.position.z = p.z * 0.65; view.button.position.y = 1.4; }
  };
  // Table i's seated figures, card backs and chips from its last snapshot, run on a table event and when a chair's
  // remote changes (a live seat taken by its player's own Ooga keeps no stand-in).
  const seatFigures = i => {
    const s = snapshots[i], view = room.tables[i];
    for (let j = 0; j < BL.pokerModels.SEATS.length; j++) {
      const p = s.seats[j], slot = BL.pokerModels.SEATS[j];
      view.backs[j].visible = !!p && p.inHand && !p.folded && s.phase !== "showdown";
      view.chips[j].visible = !!p && p.stack > 0;
      view.chips[j].scale.y = p ? Math.min(12, Math.max(1, Math.ceil(p.stack / 200))) : 1;
      const visibleActor = !!p && (p.bot || !!session.live && p.id !== HERO && !owner[i * 9 + j]);
      // A computer opponent sits as its seat's cast member, a live player as the hashed stand-in, never a real
      // contributor; when the seat changes hands, empties or is the visitor's, the old figure leaves the table.
      const traits = visibleActor ? BL.pokerCrowdModels.seatFigure(i, j, p.bot) : null;
      // A figure leaving is never written again and one arriving starts in the plain sitting pose, so the chair's tell restarts.
      if (view.actors[j] && view.actors[j].traits !== traits) { S.removeChild(view.root, view.actors[j].root); view.actors[j] = null; resetChair(i * 9 + j); }
      if (visibleActor && !view.actors[j]) {
        resetChair(i * 9 + j);
        const actor = BL.models.caveman(traits);
        actor.root.position.x = slot.x; actor.root.position.z = slot.z; actor.root.position.y = 0.6;
        actor.root.rotation.y = slot.yaw; actor.root.scale.x = actor.root.scale.y = actor.root.scale.z = 0.82;
        // A cast member's item stays in hand (its dress hides the club when it carries none).
        if (actor.parts.club && !p.bot) actor.parts.club.visible = false;
        // Held a little up in the hand, clear of the seat it would rest in.
        else if (actor.parts.club?.visible) actor.parts.club.position.y += 0.11;
        if (actor.parts.gun) actor.parts.gun.visible = false;
        BL.pokerModels.sitPose(actor);
        view.actors[j] = actor; S.addChild(view.root, actor.root);
      }
    }
  };
  // The panel's face at each seat of the selected table, from one record a seat reused every update: the visitor's
  // own Ooga, else a live player's own Ooga when they sit there as themselves, else the figure seated there (a bot's
  // cast member, a live player's stand-in). The key changes only when the character does, so the panel paints only then.
  const faces = [];
  const faceFor = (i, p) => {
    if (!p) return null;
    const mine = p.id === HERO, rec = !mine && !p.bot ? owner[selected * 9 + i] : null, body = rec ? remotes.body(rec.id) : null;
    if (body) {
      const f = faces[i];
      if (f.cave !== body || f.tag !== rec) { f.cave = body; f.tag = rec; f.key = "remote:" + rec.id + ":" + rec.body; }
      return f;
    }
    const cave = mine ? avatar : room.tables[selected].actors[i];
    if (!cave) return null;
    const f = faces[i], tag = mine ? HERO : p.bot ? "" : p.id;
    if (f.cave !== cave || f.tag !== tag) { f.cave = cave; f.tag = tag; f.key = mine ? "me:" + cave.traits.name : p.bot ? "bot:" + cave.traits.name : "live:" + p.id; }
    return f;
  };
  const updatePanel = () => {
    hud.setPanelsHidden(seatTable >= 0 && session.tables[seatTable].playing);
    panel.setLive(session.live ? { ...(session.live.fairness || { phase: "connecting" }), connection: session.live.connection, busy: session.live.busy } : null);
    panel.update(selected, snapshots, seatTable >= 0 && (!pendingStand || session.live) ? HERO : null, session.live ? false : pendingStand, session.paused, session.autoDeal[selected]);
    shownCountdown = -1;
  };
  const refresh = (force = false) => {
    for (let i = 0; i < 10; i++) if (force || !snapshots[i] || room.tables[i].version !== session.tables[i].version) syncTable(i);
    updatePanel();
  };
  const select = i => {
    if (!Number.isInteger(i) || i < 0 || i >= 10) return;
    if (seatTable >= 0 && i !== seatTable) { panel.notice("Stand from your current table before switching tables."); return; }
    if (session.live && i !== selected) { try { session.live.action("watch", i); } catch (e) { panel.notice(e.message); return; } }
    selected = i;
    if (seatTable >= 0 && !pendingStand) sit(session.tables[i].snapshot().seats.findIndex(s => s?.id === HERO));
    updatePanel(); setView(true);
  };
  const connectLive = async (retry = false) => {
    if (connecting || session.live && !retry) return;
    if (!session.live && seatTable >= 0) throw new Error("Leave your practice seat before connecting");
    if (retry && session.live?.connection !== "failed") return;
    if (retry) session.live.dispose();
    const visitId = visit;
    connecting = true;
    panel.setConnecting(true); updatePanel();
    let restoring = true;
    const live = BL.pokerLive.create(() => {
      if (!panel || session?.live !== live) return;
      HERO = live.identity || "connecting";
      if (restoring && live.connected) { selected = live.table; restoring = false; if (panel.focused) BL.net.setPokerVoice(selected); }
      const previous = seatTable;
      seatTable = live.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
      if (seatTable >= 0 && previous < 0) { selected = seatTable; pendingStand = false; sit(live.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO)); setView(true); }
      if (previous >= 0 && seatTable < 0) { pendingStand = false; placeInAisle(); if (panel.focused) setView(false); }
      refresh(true);
    }, message => { if (panel && session?.live === live) panel.notice(message); });
    pendingLive = live;
    try {
      await live.connect(selected);
      if (visitId !== visit || !panel || leaving) { live.dispose(); return; }
      if (seatTable >= 0) placeInAisle();
      for (let i = 0; i < 10; i++) forgetTable(i);
      session = { tables: live.tables, live, selected, paused: false, pendingStand: false, autoDeal: new Array(10).fill(false), theme: theme.id };
      HERO = live.identity || "connecting"; seatTable = -1; pendingStand = false; snapshots.fill(null); refresh(true);
      if (scene.debug) scene.debug.poker.session = session;
    } catch (error) { live.dispose(); if (visitId === visit) throw error; }
    finally { if (visitId === visit) { pendingLive = null; connecting = false; if (panel) { panel.setConnecting(false); updatePanel(); } } }
  };
  const addBots = (table, count) => {
    const s = table.snapshot(); let added = 0;
    for (let i = 0; i < BL.pokerRules.SEATS && added < count; i++) if (!s.seats[i]) { table.join(`bot-${selected}-${i}`, `Bot ${i + 1}`, true, i); added++; }
  };
  const action = (name, value, expectedVersion) => {
    let table = activeTable();
    try {
      // A cosmetic switch must not reset turn timing, raise input or hand state.
      if (name === "theme") { setTheme(value); Themes.save(theme.id); return; }
      if (name === "connect") { connectLive().catch(error => panel?.notice(error.message)); return; }
      if (name === "reconnect") { connectLive(true).catch(error => panel?.notice(error.message)); return; }
      if (name === "return") { select(seatTable >= 0 ? seatTable : selected); return; }
      if (name === "walk") { if (seatTable >= 0) placeInAisle(); setView(false); return; }
      if (session.live) {
        if (name === "practice") {
          if (seatTable >= 0) throw new Error("Stand before returning to practice");
          for (let i = 0; i < 10; i++) forgetTable(i);
          session.live.dispose(); session = world.poker; HERO = "local-player"; pendingStand = false; selected = session.selected || 0;
          seatTable = session.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
          snapshots.fill(null); refresh(true); setView(false); if (scene.debug) scene.debug.poker.session = session; return;
        }
        if (name === "exit") { leaveFloor(); return; }
        if (name === "verify" || name === "export" || name === "verify-file") { session.live.action(name === "verify-file" ? "verify" : name, name === "verify-file" ? value : null); return; }
        const nickname = document.querySelector('[data-poker="nickname"]').value.trim() || "Ooga";
        session.live.action(name, name === "seat" ? { name: nickname, seat: value } : name === "join" ? { name: nickname } : value, expectedVersion); return;
      }
      if (name === "fold" || name === "call" || name === "raise") {
        if (session.paused || pendingStand) throw new Error("Resume your game before acting");
        if (expectedVersion !== undefined && expectedVersion !== table.version) { refresh(); throw new Error("The table changed. Please choose your action again."); }
      }
      if (name === "quick") {
        if (pendingStand) throw new Error("Your previous seat releases after the hand");
        if (seatTable < 0) {
          const available = t => !t.playing && t.snapshot().seats.some(s => !s);
          if (!available(table)) selected = session.tables.findIndex(available);
          if (selected < 0) { selected = 0; throw new Error("Every table is playing. Watch a table and join between hands."); }
          table = activeTable(); table.join(HERO, "You"); seatTable = selected;
        }
        session.paused = false;
        if (!table.playing) {
          const occupied = table.snapshot().seats.filter(Boolean).length;
          addBots(table, Math.max(0, 4 - occupied));
          for (const p of table.snapshot().seats) if (p?.bot && p.stack === 0) table.refill(p.id);
          table.refill(HERO); table.start();
        }
        sit(table.snapshot().seats.findIndex(p => p?.id === HERO)); setView(true);
      } else if (name === "join" || name === "seat") {
        if (seatTable >= 0) throw new Error("You already have a seat");
        const index = table.join(HERO, "You", false, name === "seat" ? value : -1);
        seatTable = selected; pendingStand = false; sit(index); setView(true);
      } else if (name === "bots") addBots(table, 3);
      else if (name === "start") table.start();
      else if (name === "refill") table.refill(HERO);
      else if (name === "stand") {
        if (seatTable >= 0 && !pendingStand) {
          if (table.playing) pendingStand = true;
          else { table.leave(HERO); seatTable = -1; }
          placeInAisle();
        }
        setView(false);
      } else if (name === "call") { const l = table.snapshot(HERO).legal; table.act(HERO, l?.check ? "check" : "call"); }
      else if (name === "fold" || name === "raise") table.act(HERO, name, value);
      else if (name === "auto") { session.autoDeal[selected] = !!value; if (value) nextHand[selected] = 5; }
      else if (name === "pause") session.paused = !session.paused;
      else if (name === "exit") { leaveFloor(); return; }
      timer = 0; refresh(name === "stand" || name === "walk");
    } catch (error) { panel.notice(error.message); }
  };
  const enter = ctx => {
    // The table views wait for the deferred models; nearly overhead, the dealer's side at the bottom, the eye below
    // the ceiling.
    if (!presets["table-1"]) for (let i = 0; i < BL.pokerModels.TABLES.length; i++) {
      const table = BL.pokerModels.TABLES[i], name = `table-${i + 1}`;
      presets[name] = { yaw: Math.PI, pitch: 1.48, dist: 7.1, target: { x: table.x, y: 1.41, z: table.z } };
      VIEW_NAMES[name] = `Table ${i + 1}`;
    }
    visit++; seated = false;
    tableView = false;
    owner = new Array(90).fill(null); lastOwner = new Array(90).fill(null); lastBody = new Array(90).fill(null);
    presenceInput = { tables: BL.pokerModels.TABLES, seats: BL.pokerModels.SEATS, remotes: BL.net.remotes, zone: null, live: false, heroId: null, seatOf };
    emoteBy = new Array(90).fill(null); emoteEmoji = new Array(90).fill(""); emoteTime = new Float32Array(90); emoteCount = new Int32Array(90);
    gestureKind = new Uint8Array(90); gestureT = new Float32Array(90); shownChair = new Int16Array(9).fill(-1); shownCount = new Int32Array(9); heroChair = -1;
    const chairs = BL.pokerModels.SEATS;
    tells = BL.pokerTells.create(BL.pokerModels.TABLES, chairs); tellViews = BL.pokerModels.TABLES.map(() => BL.pokerTells.makeView(chairs));
    tellFresh = new Uint8Array(BL.pokerModels.TABLES.length); tellsOn = true; botWait.fill(0); botFor.fill(-1); botPot.fill(-1);
    calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (let j = 0; j < 9; j++) for (let s = 0; s < 9; s++) { const a = Math.atan2(chairs[s].x - chairs[j].x, chairs[s].z - chairs[j].z) - chairs[j].yaw; LOOK_YAW[j * 9 + s] = Math.atan2(Math.sin(a), Math.cos(a)); }
    game = ctx.game; world = ctx.world; go = ctx.go; renderer = ctx.renderer; crowdTimer = 0; leaving = false; timer = 0; HERO = "local-player"; connecting = false;
    if (ctx.from === "bifrost") document.querySelector('[data-intro="poker"]').hidden = true;
    session = world.poker || (world.poker = { tables: Array.from({ length: 10 }, () => BL.pokerRules.create()), selected: 0, pendingStand: false });
    if (!session.autoDeal) session.autoDeal = new Array(10).fill(true);
    theme = Themes.get(session.theme || Themes.load());
    session.paused = !!session.paused; nextHand.fill(5); completed.fill(0); shownCountdown = -1;
    selected = session.selected; pendingStand = session.pendingStand;
    seatTable = session.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
    if (seatTable >= 0) selected = seatTable;
    root = S.createNode(); camera = S.createCamera({ fov: 55, near: 0.2, far: 110 });
    hud = BL.hud.create({ signal: ctx.signal, roster: BL.contributors.activeRoster });
    const hooks = {};
    input = BL.interact.create({ canvas: ctx.canvas, renderer: ctx.renderer, camera, hooks });
    pilot = BL.pilot.create({ renderer: ctx.renderer, canvas: ctx.canvas, camera, hud, presets, landing: "entrance", pitch: [-0.1, 1.3], dist: [3, 32],
      follow: { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] },
      clampTarget, clampCamera, observeOrbit: keepCameraInside, ceilingAt: () => 8.5, coarse: matchMedia("(pointer: coarse)").matches, mayPossess,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: () => 0 } });
    Object.assign(hooks, pilot.hooks, {
      onHover: (hit, p) => { if (hit?.owner.kind === "poker") hud.tooltip.show(`Table ${hit.owner.index + 1} · select to play or watch`, p.x, p.y); else if (hit?.owner.kind === "placard" && theme.id === "gatsby") hud.tooltip.show(BL.pokerStatues.tip(hit.owner.index), p.x, p.y); else hud.tooltip.hide(); },
      onTap: hit => { if (hit?.owner.kind === "poker") select(hit.owner.index); else if (hit?.owner.kind === "placard" && theme.id === "gatsby") openPlacard(hit.owner.index); else if (hit?.owner.kind === "poker-exit") leaveFloor(); }
    });
    hud.setDestinations(Object.keys(VIEW_NAMES), VIEW_NAMES);
    hud.setAreaLabel("Ember Den");
    hud.el.modeDestination.title = "Ember Den · choose a table";
    hud.el.modeDestinationLabel.textContent = "Ember Den views. Open Map to choose a table";
    const presetView = name => {
      if (leaving || panel.focused || seatTable >= 0 && !pendingStand || !VIEW_NAMES[name]) return false;
      tableView = name !== "entrance";
      pilot.goPreset(name); hud.setDetachedView(name, true);
      return true;
    };
    hud.onPreset(presetView);
    hud.onAction((a, v) => { if (a === "leave") leaveFloor(); else if (a === "reset-view") pilot.resetCamera(); else if (a === "act") pilot.action(); else if (a === "mode-preset") return presetView(v); else if (a.startsWith("mode-")) modeAction(a); });
    fx = BL.fx.create({ root, input, hooks, hud, game: ctx.game, world, renderer: ctx.renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 5, z: -34 } });
    // Canvas 2D paints every face on the CPU, so it gets Banana Club's lighter set of the same fittings.
    BL.pokerModels.setLite(ctx.renderer.kind === "canvas2d");
    room = BL.pokerModels.build(theme.id); S.addChild(root, room.root);
    for (let i = 0; i < 10; i++) { input.add(room.tables[i].top, { kind: "poker", index: i }); targets.push(room.tables[i].top); }
    for (const p of room.statues.plaques) { input.add(p.node, { kind: "placard", index: p.index }); targets.push(p.node); }
    // The return mirror is set into the far wall, facing down the central aisle.
    const BM = BL.bifrostModels, face = BM.mirror(4), portalZ = BL.pokerModels.PORTAL_Z;
    const frame = S.createNode({ position: { x: 0, y: 0, z: portalZ }, rotation: { x: 0, y: Math.PI, z: 0 } });
    const stone = S.createNode({ geometry: BM.archStone() });
    const glass = S.createNode({ geometry: face.glass, position: { x: 0, y: 0, z: -BM.MIRROR_Z }, sightHidden: true, rippleTint: [0.3, 0.62, 1] });
    const label = BL.factoryModels.label("BIFROST", "", { height: 1.1 });
    const board = S.createNode({ position: { x: 0, y: BM.WINDOW_TOP + BM.FRAME.band + 1.15, z: portalZ - BL.pokerModels.REAR_WALL_Z + 0.07 } });
    S.addChild(board, S.createNode({ geometry: label.back }), S.createNode({ geometry: label.face }));
    S.addChild(frame, stone, S.createNode({ geometry: BM.archGlow(), sightHidden: true }), S.createNode({ geometry: face.backing }), glass, board);
    S.addChild(root, frame);
    const opening = { minX: -BM.WINDOW.halfW, maxX: BM.WINDOW.halfW, floorY: 0, ceilingY: BM.WINDOW_TOP };
    const phase = BL.labPhase.create(frame, { x: 0, z: portalZ, ry: Math.PI, floorY: 0, room: { w: 2 * BM.WINDOW.halfW, h: BM.WINDOW_TOP, from: 0, to: 1 } }, opening, -BM.MIRROR_Z, [0.3, 0.62, 1]);
    phase.node.visible = false;
    glass.mirrorRipples = phase.ripples;
    mirror = { phase, glass, body: BL.mirrorBody.create(glass, new Map()) };
    input.add(stone, { kind: "poker-exit" }); targets.push(stone);
    const requested = new URLSearchParams(location.search).get("character");
    // The Ooga walked in with or asked for, else the visitor's own or assigned one (`preferredCharacter`).
    const name = [world.pilot, requested, BL.net.preferredCharacter()?.handle].find(n => BL.contributors.activeRoster.some(c => c.name === n && mayPick(c))) || (BL.contributors.activeRoster.find(mayPick) || BL.contributors.activeRoster[0]).name;
    world.pilot = null;
    const playerWorld = { level: 0, weapons: new Map(), magazine: { owned: false, count: 0, ammo: 0, carrier: null } };
    const shared = { root, input, hud, game: ctx.game, world: playerWorld, playerName: name, weaponsEnabled: false, fx, viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt: () => 0, walkable: BL.pokerModels.walkable, useNear: () => { const i = nearPlacard(); if (i >= 0) openPlacard(i); else select(selected); }, residentPose: cave => {
      if (!seated || cave !== avatar) return false;
      BL.pokerModels.sitPose(avatar);
      if (heroChair >= 0) seatPose(avatar, heroChair, avatar);
      return true;
    } };
    people = shared.crew = BL.crew.create(shared);
    for (const cave of people.cavemen.values()) {
      cave.weapon.primaryOwned = cave.weapon.secondaryOwned = false;
      people.selectWeapon(0, cave);
      cave.parts.club.visible = cave.parts.gun.visible = false;
    }
    pilot.bind(shared); avatar = people.cavemen.get(name);
    avatar.root.position.x = 0; avatar.root.position.y = avatar.baseY; avatar.root.position.z = 29;
    avatar.root.rotation.y = Math.PI; pilot.possess(avatar);
    // A reload of this tab stands where the Ooga stood on the floor (visit-spot.js), while it can walk on from there.
    const stood = ctx.from === null ? BL.visitSpot.take("poker", "") : null;
    BL.pokerModels.setFloor(theme.id);
    if (stood && Math.abs(stood.y) < 0.05 && BL.visitSpot.holds(stood, BL.pokerModels.walkable, avatar)) pilot.navigate({ position: stood, yaw: stood.yaw - Math.PI, pitch: 0.18, dist: 4 });
    else pilot.navigate({ position: { x: 0, y: 0, z: 29 }, yaw: 0, pitch: 0.18, dist: 4 });
    keepCameraInside();
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    // Other signed-in players on the floor, as the Oogas they drive: one at a chair it is honoured for sits there, one
    // at a chair someone else holds is hidden, one at no chair stands as the pool posed it.
    remotes = BL.remotePlayers.create({ root, crew: people, fx, posed: (cave, feetY, rec) => {
      cave.parts.club.visible = cave.parts.gun.visible = false;
      const state = BL.pokerPresence.stateOf(BL.pokerModels.TABLES, BL.pokerModels.SEATS, owner, rec);
      if (state === 1) {
        BL.pokerModels.sitPose(cave);
        const k = BL.pokerPresence.seatAt(BL.pokerModels.TABLES, BL.pokerModels.SEATS, rec.x, rec.y, rec.z);
        if (k >= 0) seatPose(cave, k, rec);
      } else if (state === 2) cave.root.visible = false;
    } });
    unsubscribeReactions = BL.net.subscribeReactions(onReaction);
    // The driven Ooga's own footsteps, heard by this page alone (footsteps.js).
    footsteps = BL.footsteps.create();
    audio = BL.pokerAudio.create(); cheers = false;
    mirror.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
    if (seatTable >= 0 && !pendingStand) sit(session.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO));
    while (faces.length < BL.pokerRules.SEATS) { const f = { key: "", cave: null, tag: null, paint: canvas => BL.hud.renderFaceIcon(canvas, f.cave, null, 96) }; faces.push(f); }
    panel = BL.pokerHud.create(action, select, faceFor, emote, hud); panel.setDealer(room.tables[0].agent); setTheme(theme.id); refresh(); cheers = true; setView(seatTable >= 0 && !pendingStand);
    // After the theme's floor is set, so the crowd's lattice is read once.
    crowd = BL.pokerCrowd.create({ root, fx, walkable: BL.pokerModels.walkable, spots: BL.pokerModels.spots(theme.id), publicState,
      others: () => crowdBodies, visitor: () => crowdBodies[0] === ownBody ? ownBody : null,
      day: Math.floor(Date.now() / 86400000), cap: crowdCap(), onStep });
    scene.root = root; scene.camera = camera; scene.input = input;
    scene.debug = { camera, pilot, hud, crew: people, cavemen: people.cavemen, controls: pilot.controls, poker: { session, room, action, select, snapshots, renderOpts, crowd, audio, react: onReaction, get selected() { return selected; },
      // The tells' state by chair and their public views by table, read only; `calm` stands in for the reduced-motion wish.
      get tells() { return tells; }, get tellViews() { return tellViews; }, get calm() { return calm; }, set calm(on) { calm = !!on; } } };
    if (new URLSearchParams(location.search).get("pokerLive") === "1") action("connect");
  };
  const update = (dt, elapsed) => {
    pilot.readInput(dt);
    people.update(dt, elapsed);
    pilot.update(dt);
    if (pilot.player) tableView = false;
    // Widen the table framing instead of backing the camera through the room's ceiling.
    if (tableView && !panel.focused) camera.fov = 2 * Math.atan(Math.tan(camera.fov / 2) * 1.4);
    // Clear the overhead sightline while keeping the tables illuminated.
    room.fixtures.visible = !tableView || panel.focused;
    // Restored views and possession blends can replace the ordinary solver's camera position.
    keepCameraInside();
    // The Ooga driven here goes to the room with where it stands and its health; other players here are shown.
    const drivenHere = people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) { const p = drivenHere.root.position; BL.net.sendPose(p.x, p.y - drivenHere.baseY, p.z, drivenHere.root.rotation.y, null, 0, 0, BL.crew.visualState(drivenHere)); BL.net.setHealth(drivenHere.health.value, drivenHere.health.stunned); }
    if (drivenHere && !leaving && seatTable < 0) BL.visitSpot.note("poker", "", drivenHere);
    // Which remote each chair is honoured for, before the pool poses them by it.
    presenceInput.zone = BL.net.state.zone; presenceInput.live = !!session.live; presenceInput.heroId = HERO;
    BL.pokerPresence.resolve(presenceInput, owner);
    remotes.update(dt);
    // A remote the pool draws no body for (its cap, the visitor's own Ooga, any other it hides) holds no chair: that
    // seat keeps its stand-in and face. `posed` never hides a chair's owner, so this settles the same way every frame.
    for (let k = 0; k < owner.length; k++) { const r = owner[k]; if (r) { const b = remotes.body(r.id); if (!b || !b.root.visible) owner[k] = null; } }
    // After the pool, so a newly seated remote's body is there for its face: a table whose chairs changed hands (or
    // whose seated remote changed Ooga) rebuilds its figures, and the panel follows once.
    let rehoused = false;
    for (let i = 0; i < 10; i++) {
      let changed = false;
      for (let k = i * 9; k < i * 9 + 9; k++) {
        const rec = owner[k], body = rec ? rec.body : null;
        // The chair's tell is dropped first, while `emoteBy` still names the remote leaving, so a turned arm is put back
        // before the rebuild below resets the chair.
        if (rec !== lastOwner[k] || body !== lastBody[k]) { changed = true; lastOwner[k] = rec; lastBody[k] = body; dropTell(k); }
      }
      if (changed) { seatFigures(i); rehoused = true; }
    }
    if (rehoused) updatePanel();
    // Emotes: a chair that changed hands or emptied (the visitor's own once they stand) drops its emote and gesture; the
    // rest count down, a gesture ending the frame after it was posed at its end. The selected table's seats show what is
    // left, at a seat the panel shows as occupied, written only when a seat's emote changes.
    for (let k = 0; k < 90; k++) {
      const by = seated && k === heroChair ? avatar : owner[k];
      if (emoteBy[k] !== by) { dropEmote(k); dropTell(k); emoteBy[k] = by; }
      if (emoteTime[k] > 0 && (emoteTime[k] -= dt) <= 0) { emoteTime[k] = 0; emoteEmoji[k] = ""; }
      if (gestureKind[k]) { if (gestureT[k] >= 1) gestureKind[k] = 0; else gestureT[k] += dt / BL.pokerEmotes.GESTURE_TIME; }
    }
    for (let i = 0; i < 9; i++) {
      const k = selected * 9 + i, want = emoteTime[k] > 0 && snapshots[selected]?.seats[i] ? k : -1, count = want < 0 ? 0 : emoteCount[k];
      if (want !== shownChair[i] || count !== shownCount[i]) { shownChair[i] = want; shownCount[i] = count; panel.showEmote(i, want < 0 ? "" : emoteEmoji[k]); }
    }
    panel.setEmoteAvailable(BL.net.state.reactions && BL.net.state.room === "live" && !!people.player);
    footsteps.update(drivenHere);
    // The room is heard from the Ooga driven here, else the visitor's own, facing the view's way on the floor; a view
    // straight down keeps the last facing.
    const heard = (drivenHere || avatar).root.position, lx = camera.target.x - camera.position.x, lz = camera.target.z - camera.position.z, fl = Math.hypot(lx, lz);
    EAR.x = heard.x; EAR.z = heard.z;
    if (fl > 1e-4) { EAR.fx = lx / fl; EAR.fz = lz / fl; }
    audio.update(dt, EAR);
    crowdBodies.length = 0;
    if (avatar.root.visible) { ownBody.x = avatar.root.position.x; ownBody.z = avatar.root.position.z; ownBody.radius = avatar.bodyRadius; crowdBodies.push(ownBody); }
    const remoteBodies = remotes.actors();
    for (let i = 0; i < remoteBodies.length; i++) crowdBodies.push(remoteBodies[i]);
    crowd.update(dt, elapsed);
    crowdTimer += dt;
    if (crowdTimer >= 1) { crowdTimer = 0; crowd.setCap(crowdCap()); }
    mirror.phase.update(dt, elapsed); mirror.body.update(dt); mirror.body.time = mirror.phase.ripples.time;
    if (pilot.player && (seatTable < 0 || pendingStand) && Math.abs(avatar.root.position.x) < BL.bifrostModels.WINDOW.halfW
      && avatar.root.position.z + avatar.bodyRadius > BL.pokerModels.EXIT_Z && !leaving) leaveFloor();
    // All ten table lights fit the lowest renderer tier; selected table goes first.
    const near = selected, lights = renderOpts.lights;
    for (let slot = 0; slot < 10; slot++) {
      const i = (near + slot) % 10, p = BL.pokerModels.TABLES[i], o = slot * 8;
      lights[o] = p.x; lights[o + 1] = theme.tableY ?? 5.1; lights[o + 2] = p.z; lights[o + 3] = theme.tableRange ?? 14;
      lights[o + 4] = theme.tableLight[0]; lights[o + 5] = theme.tableLight[1]; lights[o + 6] = theme.tableLight[2];
      const v = room.tables[i]; v.pulse = Math.max(0, v.pulse - dt);
      // Floating table names face the visitor and clear the overhead view with the fixtures.
      v.label.visible = room.fixtures.visible;
      if (v.label.visible) v.label.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      v.agent.parts.armL.rotation.x = -0.5 - Math.sin(v.pulse / 0.7 * Math.PI) * 0.75;
      v.agent.parts.armR.rotation.x = -0.45;
      v.dealCard.visible = v.pulse > 0 && snapshots[i].phase !== "waiting";
      v.dealCard.position.z = -2.4 + (1 - v.pulse / 0.7) * 2.1;
    }
    for (let i = 0; i < 3; i++) {
      const o = (10 + i) * 8;
      lights[o] = 0; lights[o + 1] = 6.15; lights[o + 2] = (i - 1) * 24; lights[o + 3] = 13;
      lights[o + 4] = theme.roomLight[0]; lights[o + 5] = theme.roomLight[1]; lights[o + 6] = theme.roomLight[2];
    }
    // The chandeliers' crystals glint, each ring on its own beat.
    for (let i = 0; i < room.sparkle.length; i++) { const n = room.sparkle[i]; n.glow = 0.7 + 0.3 * Math.sin(elapsed * 1.3 + n.ring * 1.1 + n.fixture * 2.1); }
    if (room.theme === "gatsby") room.fountain.update(dt, elapsed);
    hud.updateBoard(elapsed);
    for (let i = 0; i < extraLights.length; i++) lights[104 + i] = extraLights[i];
    if (!session.live && !session.paused) {
      timer += dt;
      for (let i = 0; i < 10; i++) if (session.autoDeal[i] && snapshots[i].result) nextHand[i] = Math.max(0, nextHand[i] - dt);
      let held = false;
      for (let i = 0; i < 10; i++) if (botWait[i] > 0 && (botWait[i] -= dt) <= 0) { botWait[i] = 0; if (botMove(i)) held = true; }
      if (held) updatePanel();
    }
    if (!session.live && timer >= 0.8) {
      timer %= 0.8;
      let changed = false;
      for (let i = 0; i < 10; i++) {
        const t = session.tables[i], s = snapshots[i], player = s.seats[s.turn];
        try {
          if (s.result && session.autoDeal[i] && nextHand[i] === 0) {
            const hero = s.seats.find(p => p?.id === HERO);
            if (hero && hero.stack === 0 && !pendingStand) session.autoDeal[i] = false;
            else {
              for (const p of s.seats) if (p?.bot && p.stack === 0) t.refill(p.id);
              if (t.snapshot().seats.filter(p => p && p.stack > 0).length >= 2) t.start();
              else session.autoDeal[i] = false;
            }
            changed = true;
          } else if (player?.bot) { if (!(botWait[i] > 0) && !botHolds(i)) BL.pokerRules.botAction(t, player.id); }
          else if (i === seatTable && pendingStand && player?.id === HERO) { const l = t.snapshot(HERO).legal; if (l) t.act(HERO, l.check ? "check" : "fold"); }
        } catch (error) { session.autoDeal[i] = false; panel.notice(error.message); }
        if (i === seatTable && pendingStand && !t.playing) { t.leave(HERO); seatTable = -1; pendingStand = false; }
        if (t.version !== room.tables[i].version) { syncTable(i); changed = true; }
      }
      if (changed) updatePanel();
    }
    // Tells: a live table that went down forgets its own; a paused practice game holds every tell where it stands.
    if (session.live && session.live.connection !== "live") { if (tellsOn) { tellsOn = false; for (let i = 0; i < 10; i++) forgetTable(i); } }
    else if (session.live || !session.paused) { tellsOn = true; for (let i = 0; i < 10; i++) stepTells(i, dt); }
    const seconds = session.live ? session.live.deadline === null ? -1 : Math.max(0, Math.ceil((session.live.deadline - BL.net.serverNow()) / 1000)) : Math.ceil(nextHand[selected]);
    if (shownCountdown !== seconds) { shownCountdown = seconds; panel.countdown(seconds, session.autoDeal[selected]); }
    S.stepTweens(dt); fx.update(dt, elapsed);
  };
  const extra = (c, project) => remotes.drawNames(c, project);
  const onKey = e => { if (BL.controls.matches(e, "view") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && modeAction("mode-toggle")) { e.preventDefault(); return true; } if (BL.controls.matches(e, "escape")) { if (panel.closeEmoteMenu()) return true; if (panel.focused) action("walk"); else if (seatTable >= 0 && !pendingStand) action("stand"); else if (!pilot.escape()) leaveFloor(); return true; } if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return pilot.resetCamera(); return false; };
  const leave = () => {
    visit++; pendingLive?.dispose(); pendingLive = null;
    session.selected = selected; session.pendingStand = pendingStand;
    if (session.live) session.live.dispose();
    BL.net.setPokerVoice(null);
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    unsubscribeAccount(); unsubscribeAccount = null; unsubscribeReactions(); unsubscribeReactions = null; BL.net.setBody(null);
    for (const t of room.tables) t.agent.dispose();
    hud.closeBoard(); room.fountain.dispose(); room.statues.dispose();
    BL.pokerModels.setFloor("gatsby"); BL.pokerModels.setLite(false);
    remotes.dispose(); remotes = null; footsteps.dispose(); footsteps = null;
    crowd.dispose(); crowd = null; crowdBodies.length = 0; renderer = null;
    // After the crowd, so no footfall reaches a closed context.
    audio.dispose(); audio = null; cheers = false;
    people.dispose(); fx.dispose(); pilot.dispose();
    for (const n of targets) input.remove(n); targets.length = 0;
    mirror.phase.dispose(); mirror.body.dispose(); mirror.glass.mirrorRipples = null;
    panel.dispose(); hud.dispose();
    while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount; input.dispose();
    document.body.removeAttribute("data-poker-seated");
    document.body.removeAttribute("data-poker-table-view");
    scene.input = scene.debug = null;
    hud = panel = pilot = fx = people = avatar = room = mirror = input = session = game = world = go = null;
    snapshots.fill(null);
    owner = lastOwner = lastBody = presenceInput = null;
    emoteBy = emoteEmoji = emoteTime = emoteCount = gestureKind = gestureT = shownChair = shownCount = null; heroChair = -1;
    tells = tellViews = tellFresh = null; tellsOn = true; botWait.fill(0); botFor.fill(-1); botPot.fill(-1);
    for (const f of faces) { f.cave = f.tag = null; f.key = ""; }
    return { targets: count };
  };
  const liveGeometry = set => { if (room) for (const t of room.tables) t.agent.liveGeometry(set); if (avatar) set.add(avatar.headOpen).add(avatar.headClosed); if (remotes) remotes.liveGeometry(set); if (crowd) crowd.liveGeometry(set);
    // Banana Club's fountain and statues stay on the GPU through a cave theme, so switching back uploads nothing.
    if (room) { const keep = n => { if (n.geometry) set.add(n.geometry); for (const c of n.children) keep(c); }; keep(room.fountain.root); keep(room.statues.root); } };
  const stats = () => { let allNodes = 0, visibleNodes = 0; const walk = n => { allNodes++; for (const c of n.children) walk(c); }; walk(root); S.traverseVisible(root, () => visibleNodes++); return { allNodes, visibleNodes, targets: input.targetCount, tweens: S.tweenCount(), ...fx.stats(), ...(remotes ? remotes.stats() : {}), ...(crowd ? crowd.stats() : {}) }; };
  // Voice zone: the Ember Den, a portal of its own off the Bifrost chamber.
  const scene = { id: "poker", voiceZone: "ember-den", micKey: true, enter, update, overlay: dt => fx.drawOverlay(dt, extra), onKey, leave, liveGeometry, stats, renderOpts,
    onDonation(donation, counted = null) {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
    }, root: null, camera: null, input: null, debug: null,
    agent: null, agentView: null, agentControls: null, agentHandoff: null, get inMotion() { return !!room; } };
  scene.prepare = () => { const loading = BL.deferred.load("poker"); return loading ? loading.then(() => null) : null; };
  scene.controlsHelp = touch => { const help = pilot.controlsHelp(touch); help.title = "The Ember Den · " + help.title; return help; };
  scene.controlsHelpHold = on => { pilot.controls.reset(); pilot.setMenuOpen(on, false); };
  BL.scenes.poker = scene;
})();
