(() => {
  "use strict";
  // The room's models, rules, cards and HUD are deferred on a hosted page and arrive in `prepare`; its preset stays
  // in the page, since the island's BIFROST window is tinted by it.
  const BL = window.BL, S = BL.scene, Themes = BL.pokerThemes;
  const presets = { entrance: { yaw: 0, pitch: 0.48, dist: 18, target: { x: 0, y: 1, z: 17 } } };
  const VIEW_NAMES = { entrance: "Overview" };
  let tableView = false;
  const renderOpts = { clear: [0.1, 0.12, 0.09], sky: [0.62, 0.57, 0.45], ground: [0.31, 0.36, 0.27],
    direct: [0.88, 0.77, 0.58], directStrength: 0.38, ambientFloor: 0.48, sun: { x: 0.2, y: 1, z: 0.3 },
    shadowCenter: { x: 0, y: 1.5, z: 0 }, shadowExtent: 35, bloomStrength: 0.24,
    lights: new Float32Array(BL.glRenderer.POINT_LIGHT_CAPACITY * 8), lightCount: 13 };
  let root, camera, input, hud, panel, pilot, fx, people, avatar, room, mirror, game, world, session, go;
  let leaving = false, timer = 0, selected = 0, pendingStand = false, seatTable = -1, shownCountdown = null;
  const targets = [], snapshots = new Array(10);
  let HERO = "local-player", connecting = false, unsubscribeAccount = null, remotes = null, footsteps = null;
  let visit = 0, pendingLive = null, quickWait = -1;
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
  let market = null, weather = null, sunrise = 0;
  let audio = null, cheers = false, gameCtx = null, unlistenBlock = null;
  let engineBlockAge = Infinity;
  const onDenBlock = (x,z) => {
    engineBlockAge = 0;
    audio.blockChime(x,z);
  };
  const EAR = { x: 0, z: 0, fx: 0, fz: 1 }, onStep = (name, x, z) => audio.cue(name, x, z);
  // The crowd walking the floor (poker-crowd.js), as many as the renderer's tier carries, giving way to the bodies in
  // `crowdBodies`: the visitor's Ooga and the other players here, rewritten in place each frame.
  let crowd = null, renderer = null, crowdTimer = 0;
  const CROWD_CAP = { high: 64, medium: 40, low: 24 }, CANVAS_CAP = 12, crowdBodies = [], ownBody = { x: 0, z: 0, radius: 0 };
  const crowdCap = () => renderer.kind === "canvas2d" ? CANVAS_CAP : CROWD_CAP[renderer.quality];
  // The seated opponents who smoke (`pokerCrowdModels.SMOKERS`): `SEAT_SMOKES` cigar smoke batches a visit, shared out
  // each frame to the smokers seated nearest the view.
  const SEAT_SMOKES = 3, seatSmoked = [null, null, null], seatSmokedD = new Float64Array(SEAT_SMOKES), seatSmokedT = new Int32Array(SEAT_SMOKES);
  let seatSmokes = null;
  const smokeSeats = elapsed => {
    let found = 0;
    for (let i = 0; i < room.tables.length; i++) {
      const view = room.tables[i];
      for (let j = 0; j < view.actors.length; j++) {
        const a = view.actors[j];
        if (!a || !a.parts.cigar || !a.root.visible) continue;
        const dx = view.root.position.x + a.root.position.x - camera.position.x, dz = view.root.position.z + a.root.position.z - camera.position.z, d = dx * dx + dz * dz;
        let k;
        if (found < SEAT_SMOKES) k = found++;
        else if (d < seatSmokedD[SEAT_SMOKES - 1]) k = SEAT_SMOKES - 1;
        else continue;
        while (k > 0 && seatSmokedD[k - 1] > d) { seatSmoked[k] = seatSmoked[k - 1]; seatSmokedD[k] = seatSmokedD[k - 1]; seatSmokedT[k] = seatSmokedT[k - 1]; k--; }
        seatSmoked[k] = a; seatSmokedD[k] = d; seatSmokedT[k] = i;
      }
    }
    for (let k = 0; k < SEAT_SMOKES; k++) {
      if (k >= found) { seatSmokes[k].hide(); seatSmoked[k] = null; continue; }
      seatSmokes[k].update(elapsed, seatSmoked[k].parts.cigar, camera, room.tables[seatSmokedT[k]].root);
    }
  };
  const NO_ACTORS = [], CLEAR = { x: 0, z: 0 };
  // The night over the glass vault (cosmos.js): one rig a visit, made in `enter` (the lighter sky on the low tier and
  // Canvas 2D) and hung as the preset's `night.cosmos` says, on the scene's root. The far plane also clears the offshore water from the opposite terrace.
  const FAR = 2100;
  let cosmos = null, hallLightCount = 0, highLightCount = 0;
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
  // Whether a human (the visitor or a live player) sits at each table, from its last snapshot: a table of computer
  // opponents alone deals itself from waiting too, every visit. The next hand there waits NEXT_FAR seconds instead of
  // five when the view is more than FAR_DEAL metres away, so the ten tables cost less while staying alive.
  const humanAt = new Uint8Array(10), FAR_DEAL = 25, NEXT_FAR = 9;
  const theme = Themes.club;
  // Cool skylight and weaker floor bounce leave shadow detail between the windows and hearth.
  const loungeFill={sky:[.39,.41,.45],ground:[.22,.21,.20],direct:[.74,.81,.96],
    bloomStrength:.27,fog:[.105,.105,.12],fogNear:32,fogFar:152};
  const hearthLight=(lights,off,pulse,power)=>{
    const r=BL.pokerSalons.ROOMS[0];
    lights[off]=r.x;lights[off+1]=2.08;lights[off+2]=r.z-r.d/2+2.78;lights[off+3]=16;
    const glow=(1+pulse)*power;
    lights[off+4]=1.83*glow;lights[off+5]=.92*glow;lights[off+6]=.37*glow;lights[off+7]=0;
  };
  const clamp = BL.math.clamp;
  // Only the first thirteen lights change with the action in the hall. The fixed lamps follow in tier order, put in on
  // `enter` and again on walking back from the lounge, whose shrine lights take slots past the thirteenth.
  const installHallLamps = () => {
    const models = BL.pokerModels, lights = renderOpts.lights;
    let offset = 13 * 8;
    lights.set(models.CLUB_LIGHTS, offset); offset += models.CLUB_LIGHTS.length;
    hallLightCount = offset / 8;
    for (const lamps of [models.COLONNADE, models.LOUNGE_LIGHTS, models.GAME_LIGHTS]) {
      lights.set(lamps, offset); offset += lamps.length;
    }
    highLightCount = offset / 8;
  };
  let salons = null, salon = -1, telescope = null, byScope = false, photo = null, terraceScope = null, updateWall = null, shownWins = null, nextMorningCheck = 0;
  let tablePrompt, tableQuestion, offeredTable = -1, passedTable = -1;
  let wantTerracePack = true;
  const onTerrace = (x, z) => salon < 0 && BL.pokerTerrace.contains(x, z);
  const terracePackAllowed = cave => cave === avatar && pilot.player === cave && !seated && !panel.focused && !leaving &&
    carry.phase === IDLE && onTerrace(cave.root.position.x, cave.root.position.z);
  const packState = { owned: false, equipped: false, fuel: 0, blocked: false };
  const jetpackStatus = cave => {
    packState.owned = !!cave?.jetpackOwned;
    packState.equipped = !!cave?.jet;
    packState.fuel = cave?.jetFuel ?? 0;
    return packState;
  };
  const updateTerracePack = () => {
    const allowed = terracePackAllowed(avatar);
    if (avatar.jetpackOwned !== allowed) people.setJetpackOwnership(avatar, allowed);
    if (allowed && wantTerracePack && !avatar.jet) people.wearJetpack(avatar, BL.hubModels.jetpack(), BL.hubModels.jetFlame());
  };
  const toggleTerracePack = () => {
    if (!avatar || !terracePackAllowed(avatar)) return false;
    wantTerracePack = !avatar.jet;
    if (wantTerracePack) updateTerracePack();
    else people.removeJetpack(avatar);
    return true;
  };
  const nearbyTable = () => {
    if (pilot.player !== avatar || panel.focused || seated || salon >= 0 || leaving || carry.phase !== IDLE || photo.active || telescope.active) return -1;
    const p = avatar.root.position, models = BL.pokerModels;
    if (Math.abs(p.y - avatar.baseY) > .18) return -1;
    // Allow half a metre of open floor between the walker's body and a chair's collision shell.
    const gap = avatar.bodyRadius + .55, reach = models.CHAIR_RADIUS + gap;
    for (let i = 0; i < models.TABLES.length; i++) {
      const t = models.TABLES[i], dx = p.x - t.x, dz = p.z - t.z;
      if ((seatTable >= 0 && i !== seatTable) || Math.abs(dx) > models.TABLE_HX + gap || Math.abs(dz) > models.TABLE_HZ + gap) continue;
      for (const chair of models.SEATS) if ((dx - chair.x) ** 2 + (dz - chair.z) ** 2 <= reach * reach) return i;
    }
    return -1;
  };
  const showTablePrompt = index => {
    if (index !== passedTable) passedTable = -1;
    const show = index === passedTable ? -1 : index;
    if (show === offeredTable) return;
    offeredTable = show;
    tablePrompt.hidden = show < 0;
    if (show >= 0) tableQuestion.textContent = `Open Table ${show + 1} · ${BL.pokerEraTables.names[show]}?`;
  };
  const pickFloorTable = index => {
    if (!pilot.player) { select(index); return; }
    if (nearbyTable() !== index) { hud.toast("Walk up to a chair to open this table."); return; }
    passedTable = -1;
    showTablePrompt(index);
  };
  const nearScope = () => {
    const mount=salon===2?salons.roofScope:terraceScope, p=avatar.root.position;
    return (salon===-1 || salon===2) && Math.hypot(p.x-mount.station.x,p.z-mount.station.z)<=2.65;
  };
  const useScope = () => {
    if (!pilot.player || seated || carry.phase !== IDLE || panel.focused || seatTable >= 0 || !nearScope()) {
      hud.toast("Walk up to the brass telescope on the terrace."); return;
    }
    telescope.open(salon===2?salons.roofScope:terraceScope);
  };
  const nearPhoto = () => {
    const at=BL.pokerClub.booth,p=avatar.root.position;
    return salon<0 && Math.hypot(p.x-at.x,p.z-at.z-3.52)<=2.9;
  };
  const usePhoto = () => {
    if(pilot.player && !seated && carry.phase===IDLE && !panel.focused && seatTable<0 && nearPhoto())photo.open();
    else hud.toast("Walk up to the brass portrait camera.");
  };
  const eastLimit = (p, inside) => Math.abs(p.z) < BL.pokerGlazing.OPEN || p.x > 25 && (Math.abs(p.z) <= BL.pokerTerrace.halfSpan || pilot?.player?.root.position.x > 25)
    ? BL.pokerTerrace.outer(p.z) - 0.2 : inside;
  const currentSalon = () => salon < 0 ? null : BL.pokerSalons.ROOMS[salon];
  const floorWalk = (ax,az,bx,bz,y,h,actor) => {
    if(actor===avatar){
      if(actor.jet && y>.18 && onTerrace(ax,az) && !onTerrace(bx,bz))return false;
      if(salon<0 && terraceScope && !terraceScope.guestsClear(ax,az,bx,bz,actor.bodyRadius))return false;
      if(salon<=0 && Math.min(az,bz)<-32) return BL.pokerSalons.loungeWalk(salons,ax,az,bx,bz,y,h,actor);
      if(salon>=0) return BL.pokerSalons.clear(salons.solids[salon],currentSalon(),ax,az,bx,bz,actor.bodyRadius);
    }
    return BL.pokerModels.walkable(ax,az,bx,bz,y,h,actor) && salons.shelf.clear(ax,az,bx,bz,actor?.bodyRadius || .4);
  };
  const sectionalReach=1.9,seatedReach=1.55;
  let loungeChair=null,bridgeTime=0,bridgeHeight=0;
  // The stained glass room names what Action will do on the act button, never over the cursor: the same order as
  // `useNear` tries it. Null hands the button back to the pilot's own label.
  // The act button shows only with touch sticks, so a desktop visitor reads the same action as a line: "Space: sit",
  // or "<heirloom> · Space: look". Written on a change only; `actTitle` names the heirloom the label is about.
  let actPrompt=false,actShown="",actTitle="";
  const ACT_WORDS={"SIT":"sit","LIE DOWN":"lie down","STAND UP!":"stand up","TAKE PASS":"take the founder’s pass","LOOK":"look",
    "BUILD":"build","TAKE APART":"take apart","WET THE STONES":"wet the stones","CHOOSE ART":"choose the art","OPEN DOORS":"open the doors","TO THE BAR":"back to the bar"};
  const showLoungeAct=act=>{
    const key=act?act+actTitle:"";
    if(key===actShown)return;
    actShown=key;
    const coarse=matchMedia("(pointer: coarse)").matches;
    if(!act){actPrompt=false;pilot.showAct();if(!coarse)hud.hideHint();return;}
    actPrompt=true;hud.setAct(act);
    if(!coarse)hud.hint(actTitle?`${actTitle} · Space: ${ACT_WORDS[act]}`:`Space: ${ACT_WORDS[act]}`,600000);
  };
  const loungeAct=()=>{
    actTitle="";
    if(salon!==0 || !pilot.player || exterior || salons.heirlooms?.modal || carry.phase!==IDLE || scripted())return null;
    if(loungeChair)return loungeChair.node.chaiseExtension?"LIE DOWN":"STAND UP!";
    if(onChaise())return null;
    const p=avatar.root.position,pass=salons.targets[6];
    if(pass.visible && Math.abs(p.x-pass.position.x)<.62 && Math.abs(p.z-pass.position.z)<1.65)return "TAKE PASS";
    const prop=salons.heirlooms.near(p,1.80);
    if(prop){actTitle=prop.title;return prop.actLabel?.()||(prop.use?(prop.built()?"TAKE APART":"BUILD"):"LOOK");}
    const chair=chairNear();
    if(chair)return fromFoot(chair)?"LIE DOWN":"SIT";
    const door=nearDoor();
    if(door===0)return BL.offlineLoungePack?"CHOOSE ART":"OPEN DOORS";
    if(door===3)return "TO THE BAR";
    if(door===6)return "TAKE PASS";
    return null;
  };
  const finishBridgePose=()=>{
    if(!bridgeTime)return;
    avatar.root.position.y=bridgeHeight;avatar.root.rotation.x=0;
    BL.pokerModels.standPose(avatar);bridgeTime=0;
  };
  const chaiseRotation=BL.math.quat.fromEuler(BL.math.quat.create(),-1.48,Math.PI,0);
  const chaiseRest=new Int16Array([0,2,255,0,0,0]),chaiseHead=new Float64Array(3);
  const onChaise=()=>avatar?.camp.seat?.kind==="chaise";
  const standLounge=()=>{
    if(onChaise()){people.standPlayer(avatar);return;}
    if(!loungeChair)return;
    const p=avatar.root.position;
    p.x=loungeChair.x;p.z=loungeChair.z;p.y=avatar.baseY;BL.pokerModels.standPose(avatar);loungeChair=null;
  };
  // In this room the foot of each chaise projects toward the hearth, along -z.
  const seatGap=(chair,p,r)=>Math.hypot(p.x-r.x-chair.position.x,
    Math.max(0,p.z-r.z-chair.position.z,r.z+chair.position.z-chair.chaiseExtension-p.z));
  const chairNear=()=>{
    if(salon!==0 || !pilot.player)return null;
    const r=currentSalon(),p=avatar.root.position;
    let best=null,d=sectionalReach;
    for(const n of salons.chairs){
      const gap=seatGap(n,p,r);
      if(gap<d){best=n;d=gap;}
    }
    return best;
  };
  const fromFoot=chair=>chair.chaiseExtension && currentSalon().z+chair.position.z-avatar.root.position.z>.80;
  const seatAction=chair=>{
    if(onChaise())return "Stand up";
    if(loungeChair)return chair===loungeChair.node && chair.chaiseExtension?"Lie down on the chaise":"Stand up";
    return fromFoot(chair)?"Lie down on the chaise":"Sit on the sectional";
  };
  const chaisePose=cave=>{
    cave.root.quaternion=chaiseRotation;
    BL.pokerModels.bendKnees(cave.parts,false);
    if(cave.sleepHead){
      const head=cave.parts.head.position,p=cave.root.position;
      BL.math.quat.rotateVec(chaiseHead,chaiseRotation,head.x,head.y+cave.traits.height*3.5/16,head.z);
      cave.sleepHead.x=p.x+chaiseHead[0];cave.sleepHead.y=p.y+chaiseHead[1];cave.sleepHead.z=p.z+chaiseHead[2];
    }
    cave.parts.legL.rotation.x=cave.parts.legR.rotation.x=-.09;
    cave.parts.armL.rotation.x=cave.parts.armR.rotation.x=-.15;
  };
  const heirloomInReach=prop=>{
    if(salon!==0 || !pilot.player)return false;
    if(prop.use && (loungeChair || onChaise()))return false;
    return salons.heirlooms.distance(avatar.root.position,prop)<=(prop.reach??(loungeChair || onChaise()?seatedReach:2.1));
  };
  const useHeirloom=prop=>{
    if(!pilot.player || salon!==0 || !prop)return;
    if(!heirloomInReach(prop)){hud.toast("Step closer to the "+prop.title.toLowerCase());return;}
    pilot.controls.reset();
    // A keepsake with its own action (`act`) says what happened; with nothing to do it is read instead.
    const said=prop.act?.();
    if(said){hud.toast(said);return;}
    if(prop.use){
      const r=currentSalon(),p=avatar.root.position,x=r.x+prop.node.position.x,z=r.z+prop.node.position.z;
      if(!prop.use(fitted=>{
        audio.cue("wood",x,z);hud.toast(fitted?"The lantern bridge fits together.":"The span is ready to build again.");
      }))return;
      finishBridgePose();bridgeHeight=p.y;bridgeTime=1.24;avatar.root.rotation.y=Math.atan2(x-p.x,z-p.z);return;
    }
    finishBridgePose();salons.heirlooms.open(prop,pilot);
  };
  const useLoungeItem=()=>{
    // The pass first: it goes once taken, and the wooden bridge reaches over its side of the table.
    const p=avatar.root.position,pass=salons.targets[6];
    if(pass.visible && Math.abs(p.x-pass.position.x)<.62 && Math.abs(p.z-pass.position.z)<1.65){useDoor(6);return true;}
    const prop=salons.heirlooms.near(p,1.80);
    if(prop){useHeirloom(prop);return true;}
    return false;
  };
  const sitLounge=chair=>{
    if(!chair || !pilot.player || salon!==0)return;
    if(onChaise() || loungeChair && (chair!==loungeChair.node || !chair.chaiseExtension)){standLounge();return;}
    const r=currentSalon(),p=avatar.root.position,x=r.x+chair.position.x,z=r.z+chair.position.z;
    if(seatGap(chair,p,r)>sectionalReach){hud.toast("Step closer to the sectional");return;}
    if(chair.chaiseExtension && (loungeChair || fromFoot(chair))){
      // The shared lying-seat controller uses the posed head for first person
      // and restores the approach position on movement, action, or release.
      if(loungeChair)standLounge();
      const h=avatar.traits.height,seat={kind:"chaise",lying:true,keepEquipment:true,
        x,y:BL.pokerModels.SEAT_TOP+.13*h,z:z-.99*h,ry:chair.rotation.y,
        floor:r.y,walkAt:{x:p.x,z:p.z}};
      if(people.sitPlayer(seat)){
        pilot.controls.reset();chaisePose(avatar);
        hud.toast("Lying on the chaise · move or use Action to stand");
      }
      return;
    }
    loungeChair={x:p.x,z:p.z,node:chair};
    p.x=x;p.z=z;p.y=BL.pokerModels.sitY(avatar.traits.height);avatar.root.rotation.y=chair.rotation.y;
    pilot.controls.reset();BL.pokerModels.sitPose(avatar);
    const tabletop=salons.heirlooms.near(p,seatedReach);
    if(tabletop){
      const v=tabletop.anchor || tabletop.node.position;
      pilot.turnToward(r.x+v.x,r.y+v.y+.15,r.z+v.z);
    }else pilot.turnToward(r.x,1.4,r.z-r.d/2+1);
    hud.toast(chair.chaiseExtension?"Use Action again to lie down · move to stand":"Move or use the sectional to stand");
  };
  const ground = (x, z, from, to, actor) => salon >= 0 && (!actor || actor === avatar) ? currentSalon().y : 0;
  const salonClamp = (p, r, margin) => {
    p.x = clamp(p.x, r.x - r.w / 2 + margin, r.x + r.w / 2 - margin);
    p.z = clamp(p.z, r.z - r.d / 2 + margin, r.z + r.d / 2 - margin);
    let ceiling = r.h - 0.3;
    if(salon===0)ceiling=BL.pokerLoungeStone.ceilingAt(r,p.x-r.x,p.z-r.z)-.30;
    if (salon === 1) {
      // Keep the camera inside the inscribed arch, including the lower folds at its sides.
      const radius = r.w / 2 - 0.85;
      p.x = clamp(p.x, r.x - radius + margin, r.x + radius - margin);
      const dx = (p.x - r.x) / radius;
      ceiling = (r.h - 0.77) * Math.sqrt(1 - dx * dx) - 0.22;
      p.z = clamp(p.z, r.z - r.d / 2 + 0.4, r.z + r.d / 2 - 0.4);
    }
    p.y = clamp(p.y, r.y + 0.55, r.y + ceiling);
  };
  const doorAvailable = i => salons.targets[i].visible && (i === 0
    ? salon <= 0 && !salons.shelf.opened : BL.pokerSalons.DOORS[i][0] === salon);
  const doorDistance=(i,p)=>{
    if(i===0 && salon===0){
      const r=currentSalon(),outside=Math.max(0,Math.abs(p.x-r.x)-BL.pokerLoungeDoor.half);
      return Math.hypot(outside,p.z-r.z-r.d/2);
    }
    const t=salons.targets[i].position;return Math.hypot(p.x-t.x,p.z-t.z);
  };
  const nearDoor = () => {
    if (seated || !avatar || !salons) return -1;
    const p = avatar.root.position;
    let best = -1, dist = 2.9;
    for (let i = 0; i < salons.targets.length; i++) {
      if (!doorAvailable(i)) continue;
      const d=doorDistance(i,p);
      if (d < dist) { best = i; dist = d; }
    }
    return best;
  };
  const doorHint = i => {
    const den = game.state.emberDen;
    if (i === 0 && BL.offlineLoungePack) return "Choose the offline lounge art pack";
    if (i === 0) return salon === 0 ? "Open the cathedral doors" : "Pull the Bitcoin book";
    if (i === 1 && !den.pass && !den.bigWin && den.visits < 21) return "Cold Storage · find the founder’s pass or win a 100-chip pot";
    if (i === 2 && !den.bigWin && den.visits < 21) return "21 Club · " + den.visits + "/21 visits, or win a 100-chip pot";
    if (i === 6) return den.pass ? "Founder’s pass · Cold Storage unlocked" : "Pick up the founder’s pass";
    return BL.pokerSalons.DOORS[i][6];
  };
  const useDoor = i => {
    if (!pilot.player || seated || carry.phase !== IDLE || panel.focused || seatTable >= 0) {
      hud.toast("Walk here with a free Ooga to use this door."); return;
    }
    const d = BL.pokerSalons.DOORS[i], p = avatar.root.position;
    if (!doorAvailable(i)) return;
    if (doorDistance(i,p) > 2.9) { hud.toast("Walk closer · " + doorHint(i)); return; }
    if (i === 6) { game.recordDen("pass"); salons.show(salon); hud.toast(doorHint(i)); return; }
    const den = game.state.emberDen;
    if ((i === 2 || i === 1 && !den.pass) && !den.bigWin && den.visits < 21) { hud.toast(doorHint(i)); return; }
    if (i === 0) {
      if(BL.offlineLoungePack){
        if(BL.offlineLoungePack.choosing)return;
        pilot.setActive(false);
        const activeVisit=visit;
        BL.offlineLoungePack.choose().then(loaded=>{
          if(activeVisit!==visit)return;
          pilot.setActive(true);
          if(loaded && doorDistance(0,avatar.root.position)<=2.9)useDoor(0);
        }).catch(()=>{
          if(activeVisit===visit){pilot.setActive(true);hud.toast("Choose the lounge.roompack supplied with this offline edition.");}
        });
        return;
      }
      if (salons.shelf.open()) {
        game.recordDen("lounge");
        salons.show(salon); hud.toast(salon===0?"The cathedral doors open":"The bookcase swings open");
      }
      return;
    }
    salon = d[1]; salons.show(salon); const r = currentSalon();
    // The vault is sealed in opaque ice and the camera stays inside its arch.
    // Cull the exterior branches together while their tables and live events keep time.
    room.root.visible = terraceScope.root.visible = cosmos.root.visible = mirror.glass.parent.visible = salon !== 1;
    const position = { x: d[4] + (r ? r.x : 0), y: r ? r.y : 0, z: d[5] + (r ? r.z : 0) };
    pilot.navigate({ position, yaw: salon < 0 || i === 2 ? Math.PI : 0, pitch: 0.2, dist: 3 });
    keepCameraInside(); hud.setAreaLabel(r ? r.name : "Ember Den"); hud.toast(r ? r.name : "Ember Den");
  };
  const byBookcase=(p,margin)=>{
    if(!salons || salon>0 || salon<0 && (!salons.shelf.opened || !avatar || Math.abs(avatar.root.position.x-BL.pokerSalons.ROOMS[0].x)>3 || avatar.root.position.z>-31))return false;
    const r=BL.pokerSalons.ROOMS[0],front=r.z+r.d/2, opening=Math.abs(p.x-r.x)<BL.pokerLoungeDoor.half-margin;
    if(p.z>=-34 && salons.shelf.opened || p.z>front-margin && !opening && salon<0)return false;
    if(!opening && salon===0 && p.z>front-margin)p.z=front-margin;
    if(p.z<front-margin){p.x=clamp(p.x,r.x-r.w/2+margin,r.x+r.w/2-margin);p.z=Math.max(p.z,r.z-r.d/2+margin);}
    if(salon===0 && Math.abs(p.x-r.x)+margin>salons.entry.gap)p.z=Math.min(p.z,front-margin);
    p.y=clamp(p.y,.55,(p.z>front-margin?BL.pokerLoungeDoor.crown(Math.abs(p.x-r.x)+margin):r.h)-margin);return true;
  };
  const clampTarget = p => { if(byBookcase(p,.20))return; if (salon > 0 || salon===0 && p.z < -34) { salonClamp(p, currentSalon(), 0.6); return; } p.x = clamp(p.x, -22, eastLimit(p, 22)); p.z = clamp(p.z, -34, 34); p.y = clamp(p.y, 0.5, onTerrace(p.x,p.z)?Infinity:7); };
  const clampCamera = p => {
    const x = p.x, y = p.y, z = p.z;
    // Stay inside the wall finishes and columns, with clearance for the camera's near plane.
    if(byBookcase(p,.16))return p.x!==x || p.y!==y || p.z!==z;
    if (salon > 0 || salon===0 && p.z < -34) { salonClamp(p, currentSalon(), 0.24); return p.x !== x || p.y !== y || p.z !== z; }
    p.x = clamp(x, -23, eastLimit(p, 23)); const edge = p.x > 25 ? BL.pokerTerrace.halfSpan - .2 : 35.7;
    p.z = clamp(z, -edge, edge); p.y = clamp(y, 0.8, onTerrace(p.x,p.z)?Infinity:8.5);
    return p.x !== x || p.y !== y || p.z !== z;
  };
  // At the final lounge zoom stop render the exterior with its own camera. The walk,
  // possession and seated camera continue to belong to the pilot inside the room.
  let exterior=null,wideZoom=false,exteriorYaw=.96,exteriorPitch=.28;
  const poseExterior=()=>{
    const r=currentSalon(),cam=exterior.camera;
    const aspect=innerWidth/Math.max(1,innerHeight);
    const distance=Math.max(84,84/aspect);
    cam.target.x=r.x;cam.target.y=r.y+5;cam.target.z=r.z;
    cam.position.x=r.x+distance*Math.cos(exteriorPitch)*Math.sin(exteriorYaw);
    cam.position.y=cam.target.y+distance*Math.sin(exteriorPitch);
    cam.position.z=r.z-distance*Math.cos(exteriorPitch)*Math.cos(exteriorYaw);
  };
  const enterExterior=()=>{
    const outside=salons.exteriorView(),cam=S.createCamera({fov:46,near:.35,far:FAR});
    exterior={root:outside,camera:cam};
    exteriorYaw=.85;exteriorPitch=.31;
    S.removeChild(root,cosmos.root);S.addChild(outside,cosmos.root);
    scene.root=outside;scene.camera=cam;
    scene.renderOpts={...renderOpts,sky:[.59,.66,.78],ground:[.31,.32,.33],direct:[.88,.83,.74],
      light:{x:.58,y:.7,z:-.42},ambientFloor:.45,directStrength:.60,fogNear:150,fogFar:480,
      lightCount:0,characterProjection:null};
    document.body.dataset.loungeExterior="";hud.tooltip.hide();poseExterior();
  };
  const exitExterior=()=>{
    wideZoom=false;
    if(!exterior)return;
    S.removeChild(exterior.root,cosmos.root);S.addChild(root,cosmos.root);
    scene.root=root;scene.camera=camera;scene.renderOpts=renderOpts;exterior=null;delete document.body.dataset.loungeExterior;
  };
  const keepCameraInside = () => {
    const p = camera.position, x = p.x, y = p.y, z = p.z;
    if (!clampCamera(p)) return;
    // Orbit/overhead views supply their own look direction; retain it when stopping at a wall.
    camera.target.x += p.x - x; camera.target.y += p.y - y; camera.target.z += p.z - z;
  };
  const activeTable = () => session.tables[selected];
  const leaveFloor = () => { if (leaving) return; if (session.live && seatTable >= 0) { panel.notice("Stand between hands before leaving. You can walk the floor while connected."); return; } if (go("bifrost", null, true)) leaving = true; };
  const setView = focused => {
    pilot.controls.reset(); pilot.setActive(!focused);
    panel.setFocused(focused);
    BL.net.setPokerVoice(focused ? selected : null); audio.setSeated(focused);
  };
  const modeAction = name => !leaving && !panel.focused && (seatTable < 0 || pendingStand) && pilot.modeAction(name);
  const placeInAisle = () => {
    if (!avatar) return;
    // A tell cut short by standing settles before the standing pose takes the arms back, and the chair forgets it.
    if (seated && heroChair >= 0 && tells) { BL.pokerTells.settle(avatar); resetChair(heroChair); }
    BL.pokerModels.standPose(avatar);
    // Today's spot in the aisle beside the table, or the open floor nearest it (the fountain fills the middle).
    const p = BL.pokerModels.nearestClear(0, BL.pokerModels.TABLES[selected].z, avatar, CLEAR);
    avatar.root.position.x = p.x; avatar.root.position.y = avatar.baseY; avatar.root.position.z = p.z;
    avatar.root.rotation.y = Math.PI; avatar.root.visible = true;
    pilot.setActive(true); pilot.controls.reset(); seated = false;
    document.body.removeAttribute("data-poker-seated");
  };
  // The statues' placards: a tap, or the act button within 2 m of a plinth off the tables, opens the one board at that
  // figure's page, and its arrows page through all eight.
  const openPlacard = i => { const board = BL.pokerStatues.board(); board.go(i); hud.openBoard(board); };
  const nearPlacard = () => {
    if (seated || !avatar) return -1;
    const p = avatar.root.position, half = BL.pokerStatues.PLINTH.w / 2;
    let best = -1, bestD = 2;
    BL.pokerStatues.SLOTS.forEach((s, i) => { const d = Math.hypot(Math.max(0, Math.abs(p.x - s.x) - half), Math.max(0, Math.abs(p.z - s.z) - half)); if (d <= bestD) { bestD = d; best = i; } });
    return best;
  };
  const sit = index => {
    const p = BL.pokerModels.TABLES[selected], s = BL.pokerModels.SEATS[index];
    avatar.root.position.x = p.x + s.hipX; avatar.root.position.z = p.z + s.hipZ;
    avatar.root.position.y = BL.pokerModels.sitY(avatar.traits.height); avatar.root.rotation.y = s.yaw;
    pilot.controls.reset(); pilot.setActive(false); seated = true; heroChair = index >= 0 ? selected * 9 + index : -1;
    document.body.dataset.pokerSeated = "true";
  };
  const syncTable = i => {
    const t = session.tables[i], view = room.tables[i], s = t.snapshot(i === seatTable && !pendingStand ? HERO : null), was = snapshots[i];
    snapshots[i] = s; view.version = t.version; view.pulse = 0.7;
    let human = 0;
    for (let j = 0; j < s.seats.length; j++) if (s.seats[j] && !s.seats[j].bot) human = 1;
    humanAt[i] = human;
    BL.pokerTells.view(s, tellViews[i]); tellFresh[i] = 1;
    if (s.result && completed[i] !== s.hand) {
      if(was && !was.result && was.hand===s.hand){
        // Awards include uncalled bets returned to their owner. Rank only play chips won.
        const won=s.result.awards.slice();
        for(const pot of s.result.pots)if(pot.refund)won[pot.winners[0]]-=pot.amount;
        won.forEach((amount,j)=>{
          const seat=was.seats[j];
          if(amount<100 || !seat || seat.bot)return;
          const name=s.result.names?.[j] || seat.name;
          game.recordDenWin(seat?.id===HERO ? avatar?.traits.display || name : name,amount,i);
          if(i===seatTable || panel.focused && i===selected)room.hall.bandstand.award(i);
        });
      }
      // A table of computer opponents more than FAR_DEAL metres from the view deals its next hand later.
      const p = BL.pokerModels.TABLES[i], far = !human && Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > FAR_DEAL;
      if (was && !was.result && was.hand === s.hand && seatTable === i && !game.state.emberDen.bigWin) {
        const chair = was.seats.findIndex(seat => seat && seat.id === HERO);
        if (chair >= 0 && s.result.pots.some(pot => !pot.refund && pot.amount >= 100 && pot.winners.includes(chair))) {
          game.recordDen("bigWin"); salons.refreshGate(); hud.toast("Cold Storage and the 21 Club are open to you.");
        }
      }
      completed[i] = s.hand; nextHand[i] = far ? NEXT_FAR : 5;
      // A hand ending at the table the visitor sits at or watches, won or lost, dips the music, only when this visit saw it played.
      if (cheers && was && (!was.result || was.hand !== s.hand) && (i === seatTable || panel.focused && i === selected)) audio.win();
    }
    seatFigures(i);
    for (let j = 0; j < 5; j++) { view.board[j].visible = j < s.board.length && Number.isInteger(s.board[j]); if (view.board[j].visible) view.board[j].geometry = BL.pokerModels.card(s.board[j]); }
    view.button.visible = s.dealer >= 0;
    if (s.dealer >= 0) { const p = BL.pokerModels.PLACES[s.dealer]; view.button.position.x = p.x * 0.72; view.button.position.z = p.z * 0.65; view.button.position.y = BL.pokerModels.FELT_Y + 0.02; }
  };
  // Table i's seated figures, card backs and chips from its last snapshot, run on a table event and when a chair's
  // remote changes (a live seat taken by its player's own Ooga keeps no stand-in).
  const seatFigures = i => {
    const s = snapshots[i], view = room.tables[i];
    for (let j = 0; j < BL.pokerModels.SEATS.length; j++) {
      const p = s.seats[j], slot = BL.pokerModels.SEATS[j];
      view.backs[j].visible = !!p && p.inHand && !p.folded && s.phase !== "showdown";
      view.chips[j].visible = !!p && p.stack > 0;
      view.chips[j].scale.y = BL.pokerModels.TABLE_K * (p ? Math.min(12, Math.max(1, Math.ceil(p.stack / 200))) : 1);
      // On a live table a seat no human holds may keep a seated guest (`liveFigure`): a figure only, no rule seat,
      // gone the moment a player sits there.
      const bot = !!p && p.bot, figure = !p && !!session.live && liveFigure(i, j);
      const visibleActor = bot || figure || !!p && !!session.live && p.id !== HERO && !owner[i * 9 + j];
      // A computer opponent sits as its seat's cast member, a live player as the hashed stand-in, never a real
      // contributor; when the seat changes hands, empties or is the visitor's, the old figure leaves the table.
      const traits = visibleActor ? BL.pokerCrowdModels.seatFigure(i, j, bot || figure) : null;
      // A figure leaving is never written again and one arriving starts in the plain sitting pose, so the chair's tell restarts.
      if (view.actors[j] && view.actors[j].traits !== traits) { S.removeChild(view.root, view.actors[j].root); view.actors[j] = null; resetChair(i * 9 + j); }
      if (visibleActor && !view.actors[j]) {
        resetChair(i * 9 + j);
        const actor = BL.models.caveman(traits);
        // At the game's scale 1, as every Ooga, its hip over the seat as the visitor's sits.
        actor.root.position.x = slot.hipX; actor.root.position.z = slot.hipZ; actor.root.position.y = BL.pokerModels.sitY(traits.height);
        actor.root.rotation.y = slot.yaw;
        // A cast member's item stays in hand (its dress hides the club when it carries none).
        if (actor.parts.club && !bot && !figure) actor.parts.club.visible = false;
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
    panel.update(selected, snapshots, seatTable >= 0 && (!pendingStand || session.live) ? HERO : null, pendingStand, session.paused, session.autoDeal[selected]);
    shownCountdown = null;
  };
  const refresh = (force = false) => {
    for (let i = 0; i < 10; i++) if (force || !snapshots[i] || room.tables[i].version !== session.tables[i].version) syncTable(i);
    updatePanel();
  };
  const select = i => {
    if (salon >= 0 || !Number.isInteger(i) || i < 0 || i >= 10) return;
    if (seatTable >= 0 && i !== seatTable) { panel.notice("Stand from your current table before switching tables."); return; }
    if (session.live && i !== selected) { try { session.live.action("watch", i); } catch (e) { panel.notice(e.message); return; } }
    // A table view while carrying puts the guest down; a walk to a chair stops; a seat saved elsewhere is let go.
    if (carry.npc && carry.phase >= LIFT && carry.phase <= WIND) putDown();
    else if (carry.phase === WALK) dropRequest();
    if (quickWait >= 0 && quickWait !== i) quickWait = -1;
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
      if (live.departing && seatTable >= 0 && !pendingStand) { pendingStand = true; placeInAisle(); setView(false); }
      if (previous >= 0 && seatTable < 0) { pendingStand = false; placeInAisle(); if (panel.focused) setView(false); }
      refresh(true);
    }, message => { if (panel && session?.live === live) panel.notice(message); });
    pendingLive = live;
    try {
      await live.connect(selected);
      if (visitId !== visit || !panel || leaving) { live.dispose(); return; }
      if (seatTable >= 0) placeInAisle();
      for (let i = 0; i < 10; i++) forgetTable(i);
      session = { tables: live.tables, live, selected, paused: false, pendingStand: false, autoDeal: new Array(10).fill(false) };
      HERO = live.identity || "connecting"; seatTable = -1; pendingStand = false; snapshots.fill(null); refresh(true);
      if (scene.debug) scene.debug.poker.session = session;
    } catch (error) { live.dispose(); if (visitId === visit) throw error; }
    finally { if (visitId === visit) { pendingLive = null; connecting = false; if (panel) { panel.setConnecting(false); updatePanel(); } } }
  };
  const action = (name, value, expectedVersion) => {
    if (salon >= 0) { hud.toast("Return to the gaming floor to use a table."); return; }
    if (name === "pass-table" || name === "open-nearby") {
      const index = offeredTable;
      if (index >= 0 && nearbyTable() === index) {
        passedTable = index;
        showTablePrompt(index);
        if (name === "open-nearby") select(index);
      }
      return;
    }
    let table = activeTable();
    try {
      if (name === "ask") { ask(value); return; }
      if (name === "throw") { throwNow(); return; }
      if (name === "put-down") { putDown(); return; }
      if (name === "credits") { openCredits(); return; }
      // Taking a seat or switching between practice and live puts a carried guest down and drops a waiting request.
      if (name === "quick" || name === "join" || name === "seat" || name === "practice" || name === "connect") { if (carry.npc) putDown(); else dropRequest(); }
      // A seat saved by Quick seat is let go by any other way to a seat, by standing and by a mode switch.
      if (name === "join" || name === "seat" || name === "stand" || name === "practice" || name === "connect") quickWait = -1;
      if (name === "connect") { connectLive().catch(error => panel?.notice(error.message)); return; }
      if (name === "reconnect") { connectLive(true).catch(error => panel?.notice(error.message)); return; }
      if (name === "return") { select(seatTable >= 0 ? seatTable : selected); return; }
      if (name === "depart") {
        if (seatTable < 0 || !panel.focused || seatTable !== selected) return;
        quickWait = -1;
        if (session.live) { session.live.action("depart"); return; }
        // Resolve this practice hand through its ordinary betting and side-pot rules before releasing the chair.
        while (table.playing) {
          const s = table.snapshot(), p = s.seats[s.turn];
          if (p.id === HERO) table.act(HERO, "fold");
          else BL.pokerRules.botAction(table, p.id);
        }
        syncTable(selected); table.leave(HERO); seatTable = -1; pendingStand = false;
        placeInAisle(); setView(false); refresh(true); return;
      }
      if (name === "walk") { quickWait = -1; if (seatTable >= 0) placeInAisle(); setView(false); return; }
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
          const wanted = selected;
          if (!available(table)) selected = session.tables.findIndex(available);
          // Every table mid-hand (the computer opponents keep them busy): the seat is kept at the table shown, and the
          // visitor sits down there the moment its hand ends.
          if (selected < 0) { selected = wanted; quickWait = wanted; updatePanel(); setView(true); throw new Error("Every table is mid-hand. You sit down at this table when its hand ends."); }
          table = activeTable(); table.join(HERO, "You"); seatTable = selected;
        }
        session.paused = false;
        if (!table.playing) {
          const occupied = table.snapshot().seats.filter(Boolean).length;
          BL.pokerCarry.addBots(table, selected, Math.max(0, 4 - occupied));
          for (const p of table.snapshot().seats) if (p?.bot && p.stack === 0) table.refill(p.id);
          table.refill(HERO); table.start();
        }
        sit(table.snapshot().seats.findIndex(p => p?.id === HERO)); setView(true);
      } else if (name === "join" || name === "seat") {
        if (seatTable >= 0) throw new Error("You already have a seat");
        const index = table.join(HERO, "You", false, name === "seat" ? value : -1);
        seatTable = selected; pendingStand = false; sit(index); setView(true);
      } else if (name === "bots") {
        if (!BL.pokerCarry.addBots(table, selected, 3) && !table.playing) throw new Error("Five computer opponents is the most a table seats, so four seats stay open for players.");
      }
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
  // ---- Ask Ooga To Move --------------------------------------------------------------------------------------------
  // A computer opponent's seat (or, on a live table, a seated guest's figure) offers Ask Ooga To Move in the table view.
  // Pressed during a hand it waits for the hand to end (the rules empty no seat mid-hand). Then the visitor's Ooga walks
  // to that chair, lifts the guest overhead (a practice bot's rule seat freed with the rules' own `leave` at that
  // moment; on a live table only the figure moves), and the visitor walks on carrying it, aiming with the camera at a
  // pane of the glass: the act button (or Throw) throws it through, the pane shatters where it crosses and heals, and the
  // guest tumbles away into space; Put down (or Escape) sets it on its feet to walk out through the mirror. Either way
  // a guest strolls back in through the mirror RETURN_AFTER seconds later. Everything here is this page's own: nothing
  // goes to the room but the carrier's own pose. One state, pose, spot, flight and aim a visit (made in `enter`), so
  // no frame allocates.
  const IDLE = 0, QUEUED = 1, WALK = 2, LIFT = 3, HOLD = 4, WIND = 5, RELEASE = 6;
  const WALK_SPEED = 2.4, OUT_SPEED = 1.3, CHAIR_BACK = 1.15, RETURN_AFTER = 60, RETURN_SLOTS = 4;
  const AIM_HINTS = { glass: "Ready: throw it through the window", frame: "Aim at a window", sill: "Aim at a window", vault: "Aim at a window", column: "Aim at a window",
    blocked: "Aim at a window", none: "Aim at a window", far: "Too far: walk closer to the glass", speed: "Too far: walk closer to the glass",
    near: "Too close: step back from the glass", low: "Aim higher", high: "Aim lower" };
  let carry = null, flyer = null, walker = null, returns = null, cleared = null, blockers = null, reticle = null, musicPlaque = null;
  let shownTrack = null, nowTime = 0;
  const NOW_SHOWN = 6;
  const DIR = { x: 0, y: 0, z: 0 }, CROSS = { x: 0, y: 0, z: 0 }, SPOT = { x: 0, z: 0 };
  // The reticle's two looks (a pane a throw would go through, and one it would not) and the twinkle's, made once a page.
  let markGeo = null;
  const marks = () => markGeo || (markGeo = {
    ok: BL.models.box({ w: 1, h: 1, d: 1, color: "#ffd65a", emissive: 1 }),
    no: BL.models.box({ w: 1, h: 1, d: 1, color: "#a9c2d6", emissive: 0.8 })
  });
  // A seated guest's figure on a live table: one of the table's pattern seats the visitor has not cleared this visit.
  const liveFigure = (t, j) => !cleared[t * 9 + j] && BL.pokerCarry.npcSeats[t].includes(j);
  // 1 where the seat holds a computer opponent (practice) or a guest's figure (live), 2 when that one is asked to move
  // after this hand, else 0. Reads only who sits where, never a seat's private hand.
  const npcAt = (t, j) => {
    const s = snapshots[t];
    if (!s || !carry) return 0;
    const p = s.seats[j], npc = session.live ? !p && liveFigure(t, j) && !!room.tables[t].actors[j] : !!p && p.bot;
    if (!npc) return 0;
    return carry.table === t && carry.seat === j && carry.phase === QUEUED ? 2 : 1;
  };
  const busy = t => { if (!session.live) return session.tables[t].playing; const ph = snapshots[t].phase; return ph !== "waiting" && ph !== "showdown"; };
  const scripted = () => !!carry && (carry.phase === WALK || carry.phase === LIFT || carry.phase === WIND || carry.phase === RELEASE);
  const legs = (cave, phase, swing) => {
    const p = cave.parts, k = Math.sin(phase) * swing;
    p.legL.rotation.x = k; p.legR.rotation.x = -k; p.armL.rotation.x = -0.2 - k * 0.5; p.armR.rotation.x = -0.2 + k * 0.5;
  };
  const scheduleReturn = () => { for (let k = 0; k < RETURN_SLOTS; k++) if (returns[k] === Infinity) { returns[k] = carry.elapsed + RETURN_AFTER; return; } };
  const dropNode = n => { if (n.root.parent) S.removeChild(n.root.parent, n.root); };
  const finishFlyer = () => { if (!flyer.npc) return; dropNode(flyer.npc); flyer.npc = null; scheduleReturn(); };
  const finishWalker = () => { if (!walker.npc) return; dropNode(walker.npc); walker.npc = null; scheduleReturn(); };
  const hideReticle = () => { for (const n of reticle) n.visible = false; };
  const standUp = cave => { BL.pokerCarry.settle(cave); BL.pokerModels.standPose(cave); cave.root.rotation.x = 0; };
  const ask = seat => {
    const t = selected;
    if (!npcAt(t, seat)) return;
    if (carry.phase >= LIFT) throw new Error("Your Ooga's hands are full. Throw or put down first.");
    if (session.live && seatTable >= 0) throw new Error("Leave your live seat between hands first, then ask.");
    if (carry.phase === WALK) BL.pokerModels.standPose(avatar);
    carry.table = t; carry.seat = seat; carry.live = !!session.live; carry.phase = QUEUED;
    if (busy(t)) panel.notice("Ooga moves when this hand ends: a seat cannot empty during a hand.");
    updatePanel();
  };
  // Drops a request not yet acted on (waiting for the hand or walking to the chair).
  const dropRequest = () => {
    if (carry.phase === WALK) BL.pokerModels.standPose(avatar);
    if (carry.phase === QUEUED || carry.phase === WALK) { carry.phase = IDLE; carry.table = carry.seat = -1; updatePanel(); }
  };
  // Between hands: the visitor stands (a practice seat given up, as Leave seat does between hands, so the next hand
  // cannot deal them in while they carry) and walks to just behind the chair.
  const begin = () => {
    const t = carry.table, T = BL.pokerModels.TABLES[t], chair = BL.pokerModels.SEATS[carry.seat];
    if (!session.live && seatTable >= 0 && !session.tables[seatTable].playing) { session.tables[seatTable].leave(HERO); seatTable = -1; pendingStand = false; }
    if (seated) placeInAisle();
    if (panel.focused) setView(false);
    if (pilot.player !== avatar) pilot.possess(avatar);
    const len = Math.hypot(chair.x, chair.z), p = BL.pokerModels.nearestClear(T.x + chair.x * (1 + CHAIR_BACK / len), T.z + chair.z * (1 + CHAIR_BACK / len), avatar, SPOT);
    const a = avatar.root.position;
    carry.n = crowd.find(a.x, a.z, p.x, p.z, carry.route); carry.i = 0;
    // No route: straight there only when that line is clear, else the request ends with a word.
    if (!carry.n) {
      if (!BL.pokerModels.walkable(a.x, a.z, p.x, p.z, 0, 2, avatar)) { dropRequest(); hud.toast("Your Ooga cannot reach that chair from here. Walk closer and ask again."); return; }
      carry.route[0] = p.x; carry.route[1] = p.z; carry.n = 1;
    }
    carry.phase = WALK; carry.walk = 0;
    refresh(true);
  };
  // At the chair: the guest's figure leaves the table for the room's root, its seat freed, and the lift begins.
  const startLift = () => {
    const t = carry.table, view = room.tables[t], actor = view.actors[carry.seat], T = BL.pokerModels.TABLES[t], chair = BL.pokerModels.SEATS[carry.seat];
    if (!actor) { dropRequest(); return; }
    if (carry.live ? !!snapshots[t].seats[carry.seat] : !BL.pokerCarry.isBot(session.tables[t], carry.seat)) { dropRequest(); return; }
    avatar.root.rotation.y = Math.atan2(T.x + chair.x - avatar.root.position.x, T.z + chair.z - avatar.root.position.z);
    // The carry owns the guest's limbs from here: a tell or fidget it was in settles, and the freed chair forgets it,
    // its bead and any toss or push it showed hidden with it.
    const k = t * 9 + carry.seat;
    if (tells.posed[k]) BL.pokerTells.settle(actor);
    view.actors[carry.seat] = null; S.removeChild(view.root, actor.root); resetChair(k);
    actor.root.position.x += T.x; actor.root.position.z += T.z; S.addChild(root, actor.root);
    cleared[t * 9 + carry.seat] = 1;
    if (!carry.live) BL.pokerCarry.freeSeat(session.tables[t], carry.seat);
    const q = carry.qSeat, yaw = chair.yaw;
    q[0] = 0; q[1] = Math.sin(yaw / 2); q[2] = 0; q[3] = Math.cos(yaw / 2);
    carry.seatX = actor.root.position.x; carry.seatY = actor.root.position.y; carry.seatZ = actor.root.position.z;
    actor.root.quaternion = carry.q;
    carry.npc = actor; carry.npcH = actor.traits.height; carry.seed = BL.math.fnv1a(actor.traits.name) % 9973;
    carry.phase = LIFT; carry.t = 0;
    refresh(true);
  };
  // The carried guest across the raised hands (`carriedAt`), its orientation the spot's.
  const follow = () => {
    const npc = carry.npc, spot = carry.spot;
    BL.pokerCarry.carriedAt(avatar, spot, carry.npcH);
    npc.root.position.x = spot.x; npc.root.position.y = spot.y; npc.root.position.z = spot.z;
    const q = carry.q; q[0] = spot.q[0]; q[1] = spot.q[1]; q[2] = spot.q[2]; q[3] = spot.q[3];
  };
  const applyPose = () => { avatar.root.position.y = avatar.baseY + carry.pose.dy; avatar.root.rotation.x = carry.pose.pitch; };
  // Put down: the guest stands in front of the carrier and walks out through the mirror (the walker); the carrier stands.
  const putDown = () => {
    if (carry.phase < LIFT || !carry.npc) { dropRequest(); return; }
    const npc = carry.npc, C = BL.pokerCarry, a = avatar.root;
    carry.npc = null; finishWalker();
    standUp(npc); npc.root.quaternion = null;
    const p = BL.pokerModels.nearestClear(a.position.x + Math.sin(a.rotation.y) * 0.9, a.position.z + Math.cos(a.rotation.y) * 0.9, avatar, SPOT);
    npc.root.position.x = p.x; npc.root.position.z = p.z; npc.root.position.y = C.LEG_SHARE * npc.traits.height;
    walker.npc = npc; walker.phase = 0;
    walker.n = crowd.find(p.x, p.z, 0, BL.pokerModels.EXIT_Z - 2.2, walker.route); walker.i = 0;
    if (!walker.n) finishWalker();
    standUp(avatar); a.position.y = avatar.baseY;
    carry.phase = IDLE; carry.table = carry.seat = -1; hideReticle(); panel.carry(null);
    updatePanel();
  };
  const throwNow = () => {
    if (carry.phase !== HOLD) return;
    // The aim planned again now, so the throw goes with what the view shows at the press.
    aimStep();
    if (!carry.ready || !carry.aim.ok) { hud.toast(carry.hint); return; }
    const a = carry.aim;
    carry.point.x = a.x; carry.point.y = a.y; carry.point.z = a.z; carry.pane = a.pane; carry.paneId = a.id;
    carry.phase = WIND; carry.t = 0; hideReticle(); panel.carry(null);
  };
  // The guest leaves the hands: the arc planned again from where they are now (else the one aimed), and it flies.
  const launch = () => {
    const C = BL.pokerCarry, rel = carry.rel, src = C.arcTo(carry.spot, carry.point, rel, carry.pane) ? rel : carry.aim;
    // Neither arc holds (the aim was refused after all): the guest is set down rather than dropped out of the hands.
    if (!src.ok) { carry.phase = HOLD; putDown(); return; }
    finishFlyer();
    DIR.x = src.dx; DIR.y = src.dy; DIR.z = src.dz;
    C.throwInit(flyer.flight, carry.spot, DIR, src.charge, carry.pane, carry.seed, BL.pokerGlazing.supportAt, carry.npc.traits.height);
    flyer.npc = carry.npc; flyer.id = carry.paneId; flyer.seed = carry.seed; flyer.shattered = false;
    flyer.npc.root.quaternion = flyer.flight.q;
    carry.npc = null;
  };
  // Every frame: the request, the walk, the lift, the carry, the throw, the flyer and the walker; the glass heals.
  const stepCarry = dt => {
    const C = BL.pokerCarry, pose = carry.pose, a = avatar.root.position;
    if (carry.phase === QUEUED && !leaving && !busy(carry.table)) begin();
    else if (carry.phase === WALK) {
      if (busy(carry.table)) { BL.pokerModels.standPose(avatar); carry.phase = QUEUED; updatePanel(); }
      else {
        const tx = carry.route[carry.i * 2], tz = carry.route[carry.i * 2 + 1], dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), step = WALK_SPEED * dt;
        if (d > 1e-4) avatar.root.rotation.y = Math.atan2(dx, dz);
        if (d <= step) { a.x = tx; a.z = tz; if (++carry.i >= carry.n) startLift(); }
        else { a.x += dx / d * step; a.z += dz / d * step; }
        a.y = avatar.baseY; carry.walk += dt * 9;
        if (carry.phase === WALK) legs(avatar, carry.walk, 0.55);
      }
    } else if (carry.phase === LIFT) {
      carry.t += dt;
      const k = Math.min(1, carry.t / C.LIFT_TIME), npc = carry.npc;
      C.lift(avatar, k, pose); applyPose();
      const c = pose.carry;
      C.rise(npc, c);
      C.carriedAt(avatar, carry.spot, carry.npcH);
      const sp = carry.spot, r = npc.root.position;
      r.x = carry.seatX + (sp.x - carry.seatX) * c; r.y = carry.seatY + (sp.y - carry.seatY) * c; r.z = carry.seatZ + (sp.z - carry.seatZ) * c;
      // The seat's yaw turned toward the spot's orientation, along the shorter way, kept unit.
      const q = carry.q, qs = carry.qSeat, sq = sp.q, sign = qs[0] * sq[0] + qs[1] * sq[1] + qs[2] * sq[2] + qs[3] * sq[3] < 0 ? -1 : 1;
      let n = 0;
      for (let k2 = 0; k2 < 4; k2++) { q[k2] = qs[k2] + (sign * sq[k2] - qs[k2]) * c; n += q[k2] * q[k2]; }
      n = Math.sqrt(n); for (let k2 = 0; k2 < 4; k2++) q[k2] /= n;
      if (k >= 1) { carry.phase = HOLD; carry.time = 0; avatar.root.rotation.x = 0; }
    } else if (carry.phase === HOLD) {
      // The crew walked the Ooga at its own speed: the carry keeps CARRY_SPEED_SHARE of the step.
      a.x = carry.fromX + (a.x - carry.fromX) * C.CARRY_SPEED_SHARE; a.z = carry.fromZ + (a.z - carry.fromZ) * C.CARRY_SPEED_SHARE;
      C.hold(avatar, avatar.act ? avatar.act.phase : 0, pose); a.y += pose.dy; avatar.root.rotation.x = pose.pitch;
      carry.time += dt; C.squirm(carry.npc, carry.time, carry.seed); follow();
    } else if (carry.phase === WIND || carry.phase === RELEASE) {
      carry.t += dt;
      const wind = carry.phase === WIND, k = Math.min(1, carry.t / (wind ? C.WIND_TIME : C.RELEASE_TIME));
      if (wind) C.wind(avatar, k, pose); else C.release(avatar, k, pose);
      applyPose();
      if (carry.npc) {
        carry.time += dt; C.squirm(carry.npc, carry.time, carry.seed); follow();
        if (!wind && k >= C.RELEASE_AT) launch();
      }
      if (k >= 1) {
        if (wind) { carry.phase = RELEASE; carry.t = 0; }
        else { standUp(avatar); a.y = avatar.baseY; carry.phase = IDLE; carry.table = carry.seat = -1; updatePanel(); }
      }
    }
    if (flyer.npc) {
      const f = flyer.flight, npc = flyer.npc;
      C.throwRun(f, dt);
      npc.root.position.x = f.x; npc.root.position.y = f.y; npc.root.position.z = f.z;
      C.flail(npc, f.time, flyer.seed, f);
      if (f.crossed && !flyer.shattered) {
        flyer.shattered = true;
        CROSS.x = f.cx; CROSS.y = f.cy; CROSS.z = f.cz; DIR.x = f.vx; DIR.y = f.vy; DIR.z = f.vz;
        room.glazing.shatter(flyer.id, CROSS, DIR, flyer.seed);
        audio.cue("glass", f.cx, f.cz);
      }
      if (f.done) finishFlyer();
    }
    if (walker.npc) {
      const r = walker.npc.root.position, tx = walker.route[walker.i * 2], tz = walker.route[walker.i * 2 + 1], dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz), step = OUT_SPEED * dt;
      if (d > 1e-4) walker.npc.root.rotation.y = Math.atan2(dx, dz);
      if (d <= step) { r.x = tx; r.z = tz; if (++walker.i >= walker.n) finishWalker(); }
      else { r.x += dx / d * step; r.z += dz / d * step; }
      if (walker.npc) { walker.phase += dt * 7; legs(walker.npc, walker.phase, 0.5); }
    }
    room.glazing.update(dt);
  };
  // While carrying, after the camera's frame: where a throw would go, shown on the pane, with the bar's hint.
  const aimStep = () => {
    const C = BL.pokerCarry, cp = camera.position, ct = camera.target, aim = carry.aim;
    let dx = ct.x - cp.x, dy = ct.y - cp.y, dz = ct.z - cp.z;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    DIR.x = dx / l; DIR.y = dy / l; DIR.z = dz / l;
    carry.ready = C.plan(room.glazing.panes(), cp, DIR, carry.spot, aim, blockers);
    carry.hint = AIM_HINTS[aim.reason] || AIM_HINTS.none;
    const pane = aim.pane, shown = !!pane && aim.reason !== "far" && aim.reason !== "blocked";
    if (shown) {
      const g = carry.ready ? marks().ok : marks().no, inX = -pane.nx * 0.08, inZ = -pane.nz * 0.08, T = 0.07, yaw = Math.atan2(-pane.uz, pane.ux);
      for (let k = 0; k < 4; k++) {
        const n = reticle[k], side = k < 2, sgn = k % 2 ? 1 : -1;
        n.visible = true; n.geometry = g; n.rotation.y = yaw;
        n.position.x = pane.cx + inX + (side ? 0 : pane.ux * pane.halfW * sgn); n.position.z = pane.cz + inZ + (side ? 0 : pane.uz * pane.halfW * sgn);
        n.position.y = pane.cy + (side ? pane.halfH * sgn : 0);
        n.scale.x = side ? 2 * pane.halfW : T; n.scale.y = side ? T : 2 * pane.halfH; n.scale.z = T;
      }
      const dot = reticle[4];
      dot.visible = true; dot.geometry = g; dot.rotation.y = yaw;
      dot.position.x = aim.x + inX; dot.position.y = aim.y; dot.position.z = aim.z + inZ;
      dot.scale.x = dot.scale.y = 0.22; dot.scale.z = 0.05;
    } else hideReticle();
    panel.carry(carry.hint, carry.keys, carry.ready);
  };
  // Leaving the room, or anything else that ends the visit mid-carry: nothing left posed, parented, flying or broken.
  const abortCarry = () => {
    if (carry.npc) { carry.npc.root.quaternion = null; dropNode(carry.npc); carry.npc = null; }
    if (scripted() || carry.phase === HOLD) standUp(avatar);
    carry.phase = IDLE; carry.table = carry.seat = -1;
    if (flyer.npc) { flyer.npc.root.quaternion = null; dropNode(flyer.npc); flyer.npc = null; }
    if (walker.npc) { dropNode(walker.npc); walker.npc = null; }
    room.glazing.reset();
  };
  // The lounge music's credits board, on the playing track's page.
  const openCredits = () => {
    const board = BL.pokerHud.creditsBoard(audio.credits), np = audio.nowPlaying, k = np ? BL.pokerAudio.TRACKS.findIndex(t => t.key === np.key) : 0;
    board.go(Math.max(0, k)); hud.openBoard(board);
  };
  // Whether the visitor's Ooga stands within 1.2 m of a gaming table's edge (they are for watching; the act button there
  // only says so).
  const nearGame = () => {
    if (seated || !avatar) return false;
    const p = avatar.root.position;
    for (const f of BL.pokerModels.FURNITURE) if (f.kind === "game" && Math.hypot(Math.max(0, Math.abs(p.x - f.x) - f.hx), Math.max(0, Math.abs(p.z - f.z) - f.hz)) <= 1.2) return true;
    return false;
  };
  const nearMusic = () => {
    if (seated || !avatar || !musicPlaque) return false;
    const p = avatar.root.position, m = musicPlaque.position;
    return Math.hypot(p.x - m.x, p.z - m.z) <= 2.2;
  };
  const enter = ctx => {
    // The table views wait for the deferred models; nearly overhead, the dealer's side at the bottom, the eye below
    // the ceiling.
    if (!presets["table-1"]) for (let i = 0; i < BL.pokerModels.TABLES.length; i++) {
      const table = BL.pokerModels.TABLES[i], name = `table-${i + 1}`;
      // The view's distance comes in with the table's plan (7.1 m over the full-size table), so the felt fills it as before.
      presets[name] = { yaw: Math.PI, pitch: 1.48, dist: 7.1 * BL.pokerModels.TABLE_K, target: { x: table.x, y: BL.pokerModels.FELT_Y + 0.03, z: table.z } };
      VIEW_NAMES[name] = `Table ${i + 1}`;
    }
    visit++; seated = false; salon = -1;
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
    if (ctx.from === "bifrost" || !game.state.emberDen.visits) game.recordDen("visit");
    const loungeStart = ctx.from === null && new URLSearchParams(location.search).get("room") === "lounge";
    if (ctx.from === "bifrost" || loungeStart) document.querySelector('[data-intro="poker"]').hidden = true;
    session = world.poker || (world.poker = { tables: Array.from({ length: 10 }, () => BL.pokerRules.create()), selected: 0, pendingStand: false });
    if (!session.autoDeal) session.autoDeal = new Array(10).fill(true);
    session.paused = !!session.paused; nextHand.fill(5); completed.fill(0); shownCountdown = null; humanAt.fill(0); quickWait = -1;
    // Every table nobody plays at is pre-seated with its computer opponents, between hands (a paused practice is left
    // as it was), and deals itself, the first deals a second and a half apart.
    if (!session.paused) for (let i = 0; i < 10; i++) {
      const t = session.tables[i];
      if (t.playing || t.snapshot().seats.some(p => p && !p.bot)) continue;
      BL.pokerCarry.preseat(t, i); session.autoDeal[i] = true; nextHand[i] = 5 + 1.5 * i;
    }
    const C = BL.pokerCarry;
    carry = { phase: IDLE, table: -1, seat: -1, live: false, npc: null, npcH: 0, seed: 0, t: 0, time: 0, walk: 0, elapsed: 0,
      route: new Float32Array(48), n: 0, i: 0, seatX: 0, seatY: 0, seatZ: 0, fromX: 0, fromZ: 0, qSeat: BL.math.quat.create(), q: BL.math.quat.create(),
      pose: C.createPose(), spot: C.createCarried(), aim: C.createAim(), rel: C.createAim(), point: { x: 0, y: 0, z: 0 }, pane: null, paneId: -1,
      ready: false, hint: "", keys: matchMedia("(pointer: coarse)").matches ? "Aim with the right stick. Throw, or Put down to let go." : "Aim with the camera · Space or Throw throws · Esc puts down" };
    flyer = { npc: null, flight: C.createFlight(), id: -1, seed: 0, shattered: false };
    walker = { npc: null, route: new Float32Array(48), n: 0, i: 0, phase: 0 };
    returns = new Float64Array(RETURN_SLOTS).fill(Infinity); cleared = new Uint8Array(90); shownTrack = null; nowTime = 0;
    selected = session.selected; pendingStand = session.pendingStand;
    seatTable = session.tables.findIndex(t => t.snapshot().seats.some(s => s?.id === HERO));
    if (seatTable >= 0) selected = seatTable;
    root = S.createNode(); camera = S.createCamera({ fov: 55, near: 0.2, far: FAR });
    hud = BL.hud.create({ signal: ctx.signal, roster: BL.contributors.activeRoster });
    tablePrompt=document.querySelector('[data-poker="approach"]');tablePrompt.hidden=true;
    tableQuestion=document.getElementById("poker-approach-title");offeredTable=passedTable=-1;wantTerracePack=true;
    const hooks = {};
    input = BL.interact.create({ canvas: ctx.canvas, renderer: ctx.renderer, camera, hooks });
    pilot = BL.pilot.create({ renderer: ctx.renderer, canvas: ctx.canvas, camera, hud, presets, landing: "entrance", pitch: [-0.1, 1.3], dist: [3, 32],
      follow: { y: 0.9, min: 3, max: 7, pitch: [0.25, 0.8] },
      clampTarget, clampCamera, observeOrbit: keepCameraInside, jetpackStatus, ceilingAt: (x,z) => onTerrace(x,z) ? Infinity : salon < 0 ? 8.5 : currentSalon().y + currentSalon().h - 0.2, coarse: matchMedia("(pointer: coarse)").matches, mayPossess,
      close: { eyeHeight: 1.1, eyeRatio: 0.95, eyeForward: 0.16, pitch: [-1.35, 1.35], trailingDist: 4, orbitDist: 5, maxStep: 0.6, groundAt: ground } });
    Object.assign(hooks, pilot.hooks, {
      onZoom:(factor,gesture,x,y)=>{
        if(exterior && factor>=1)return;
        if(exterior)exitExterior();
        pilot.hooks.onZoom(factor,gesture,x,y);
        wideZoom=salon===0 && factor>1 && !salons.heirlooms?.modal;
      },
      onOrbit:(dx,dy)=>{
        if(!exterior)return pilot.hooks.onOrbit(dx,dy);
        exteriorYaw-=dx*.004;exteriorPitch=clamp(exteriorPitch+dy*.003,-.31,1.08);
      },
      onHover: (hit, p) => { if(exterior)return; if(salon===0){hud.tooltip.hide();return;} if (hit?.owner.kind === "portrait") hud.tooltip.show("Take a moon portrait",p.x,p.y); else if (hit?.owner.kind === "telescope") hud.tooltip.show("Look through the telescope", p.x, p.y); else if (hit?.owner.kind === "salon" && doorAvailable(hit.owner.index)) hud.tooltip.show(doorHint(hit.owner.index), p.x, p.y); else if (salon >= 0) hud.tooltip.hide(); else if (hit?.owner.kind === "poker") hud.tooltip.show(`Table ${hit.owner.index + 1} · ${pilot.player ? "walk up to a chair" : "select to watch"}`, p.x, p.y); else if (hit?.owner.kind === "placard") hud.tooltip.show(BL.pokerStatues.tip(hit.owner.index), p.x, p.y); else if (hit?.owner.kind === "music") hud.tooltip.show("Lounge music · select for credits", p.x, p.y); else if (hit?.owner.kind === "game") hud.tooltip.show(BL.pokerGames.TOOLTIP[BL.pokerModels.GAMES[hit.owner.index].kind], p.x, p.y); else hud.tooltip.hide(); },
      onTap: hit => { if(exterior)return; if(hit?.owner.kind==="landscape" && salon===0) salons.heirlooms.open(hit.owner.prop,pilot); else if(hit?.owner.kind==="heirloom") useHeirloom(hit.owner.prop); else if(hit?.owner.kind==="loungeChair") sitLounge(hit.owner.chair); else if(hit?.owner.kind === "portrait") usePhoto(); else if (hit?.owner.kind === "telescope") useScope(); else if (hit?.owner.kind === "salon") useDoor(hit.owner.index); else if (salon >= 0) return; else if (hit?.owner.kind === "poker") pickFloorTable(hit.owner.index); else if (hit?.owner.kind === "placard") openPlacard(hit.owner.index); else if (hit?.owner.kind === "music") openCredits(); else if (hit?.owner.kind === "poker-exit") leaveFloor(); else if (hit?.owner.kind === "game") hud.toast(BL.pokerGames.WATCH_ONLY); }
    });
    hud.setDestinations(Object.keys(VIEW_NAMES), VIEW_NAMES);
    hud.setAreaLabel("Ember Den");
    hud.el.modeDestination.title = "Ember Den · choose a table";
    hud.el.modeDestinationLabel.textContent = "Ember Den views. Open Map to choose a table";
    const presetView = name => {
      if (salon >= 0 || leaving || panel.focused || seatTable >= 0 && !pendingStand || !VIEW_NAMES[name]) return false;
      tableView = name !== "entrance";
      pilot.goPreset(name); hud.setDetachedView(name, true);
      return true;
    };
    hud.onPreset(presetView);
    hud.onAction((a, v) => { if (a === "jetpack-toggle") toggleTerracePack(); else if (a === "leave") leaveFloor(); else if (a === "reset-view") pilot.resetCamera(); else if (a === "act") { if (carry.phase === HOLD) throwNow(); else if (!scripted()) pilot.action(); } else if (a === "mode-preset") return presetView(v); else if (a.startsWith("mode-")) modeAction(a); });
    fx = BL.fx.create({ root, input, hooks, hud, game: ctx.game, world, renderer: ctx.renderer, camera, overlay: ctx.overlay, tickerAt: { x: 0, y: 5, z: -34 } });
    // Canvas 2D paints every face on the CPU, so it gets a lighter set of the same fittings.
    BL.pokerModels.setLite(ctx.renderer.kind === "canvas2d");
    room = BL.pokerModels.build(); S.addChild(root, room.root);
    const registerLounge=(heirlooms,landscapes,chairs,entry)=>{
      // Tabletop objects within reach take precedence over the player’s body pick spheres (priority 1).
      heirlooms.items.forEach(prop=>{
        const owner={kind:"heirloom",prop,get priority(){return heirloomInReach(prop)?2:0;}};
        input.add(prop.node,owner);targets.push(prop.node);
        if(prop.extraTarget){input.add(prop.extraTarget,owner);targets.push(prop.extraTarget);}
      });
      for(const prop of landscapes){
        // An upward ray from the chaise starts inside its broad pick sphere.
        input.add(prop.node,{kind:"landscape",prop,priority:1.5,pickRay:ray=>salon===0?prop.pickRay(ray):Infinity});targets.push(prop.node);
      }
      chairs.forEach(chair=>{input.add(chair,{kind:"loungeChair",chair});targets.push(chair);});
      input.add(entry.target,{kind:"salon",index:0,pickRay:ray=>salon===0?entry.pickRay(ray):Infinity});targets.push(entry.target);
    };
    salons = BL.pokerSalons.build(ctx.renderer.kind === "canvas2d", room.hall.vaultDoor, game.state.emberDen,registerLounge); S.addChild(root, salons.root);
    salons.targets.forEach((n, index) => { input.add(n, { kind: "salon", index, pickRay: index === 0 ? salons.shelf.pickRay : undefined }); targets.push(n); });
    cosmos = Themes.hang({ canvas: ctx.renderer.kind === "canvas2d", sparse: ctx.renderer.kind === "canvas2d" || ctx.renderer.quality === "low" });
    const terrace = BL.pokerTerrace.build(ctx.renderer.kind === "canvas2d");
    terraceScope=terrace; S.addChild(root, terrace.root, room.hall.aquarium.root);
    weather=BL.pokerClub.weather(root,ctx.renderer.kind==="canvas2d");
    const portrait=BL.pokerClub.portraitCourt(terrace.root,ctx.renderer.kind==="canvas2d");
    input.add(portrait,{kind:"portrait"});targets.push(portrait);
    input.add(salons.roofScope.target,{kind:"telescope"});targets.push(salons.roofScope.target);
    photo=BL.pokerPhoto.create(camera,pilot,document.getElementById("scene"),portrait);
    updateWall=BL.pokerClub.fameWall(terrace.root);shownWins=null;nextMorningCheck=0;
    input.add(terrace.target, { kind: "telescope" }); targets.push(terrace.target);
    telescope = BL.pokerTelescope.create(camera, pilot, terrace, cosmos.parts.planets.find(p => p.key === "giant").node, cosmos.parts.blackHole);
    for (let i = 0; i < 10; i++) { input.add(room.tables[i].top, { kind: "poker", index: i }); targets.push(room.tables[i].top); }
    for (const p of room.statues.plaques) { input.add(p.node, { kind: "placard", index: p.index }); targets.push(p.node); }
    for (const t of room.games.tables) { input.add(t.body, { kind: "game", index: t.index }); targets.push(t.body); }
    // What a throw's line must clear besides the glass's own columns, mirror and sign: the bar's two wings and the cage.
    blockers = [...room.glazing.blockers(), ...BL.pokerModels.FURNITURE.filter(f => f.kind === "bar" || f.kind === "cage").map(f => Object.freeze(BL.pokerCarry.box(f.x - f.hx, f.x + f.hx, 0, 3.2, f.z - f.hz, f.z + f.hz)))];
    reticle = Array.from({ length: 5 }, () => { const n = S.createNode({ geometry: marks().ok, sightHidden: true }); n.visible = false; S.addChild(root, n); return n; });
    // The lounge music's brass plate on the front of the bar's left wing, by its inner end: a tap, or the act button
    // beside it, opens the credits. It stands inside the bar's walk block, so it blocks nobody.
    const bar = BL.pokerModels.FURNITURE.find(f => f.kind === "bar" && f.x < 0);
    musicPlaque = S.createNode({ geometry: BL.pokerStatues.wordPlate("Music"), position: { x: bar.x + bar.hx - 1.2, y: 0.62, z: bar.z + bar.hz + 0.02 } });
    S.addChild(root, musicPlaque); input.add(musicPlaque, { kind: "music" }); targets.push(musicPlaque);
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
    const shared = { root, input, hud, game: ctx.game, world: playerWorld, playerName: name, weaponsEnabled: false, fx, viewYaw: 0, outsideActors: () => remotes ? remotes.actors() : NO_ACTORS, outsideActorHeight: BL.remotePlayers.BODY_HEIGHT, groundAt: ground, walkable: floorWalk, jetpackAllowed:terracePackAllowed, useNear: () => { if (carry.phase === HOLD) { throwNow(); return true; } if (scripted()) return true; if(salons.heirlooms?.modal)return true; if(loungeChair){sitLounge(loungeChair.node);return true;} if(salon===0 && useLoungeItem())return true; const chair=chairNear(); if(chair){sitLounge(chair);return true;} if (avatar.jet && avatar.root.position.y - avatar.baseY > .18) return false; if (nearPhoto()) { usePhoto(); return true; } if (nearScope()) { useScope(); return true; } const door = nearDoor(); if (door >= 0) { useDoor(door); return true; } if (salon >= 0) return true; const i = nearPlacard(); if (i >= 0) openPlacard(i); else if (nearMusic()) openCredits(); else if (nearGame()) hud.toast(BL.pokerGames.WATCH_ONLY); else return false; return true; }, residentPose: cave => {
      // Walking to a chair, lifting, winding up and throwing, the scene poses the visitor's Ooga itself.
      if(cave===avatar && bridgeTime){
        const u=Math.min(1,(1.24-bridgeTime)/.30,bridgeTime/.28);
        const p=cave.parts;
        BL.pokerModels.bendKnees(p,u>.25);
        cave.root.position.y=bridgeHeight-.22*cave.traits.height*u;
        cave.root.rotation.x=.24*u;p.legL.rotation.x=-1.08*u;p.legR.rotation.x=-.33*u;
        p.armL.rotation.x=-.57*u;p.armR.rotation.x=-.96*u;return true;
      }
      if(cave===avatar && onChaise()){chaisePose(cave);return true;}
      if(cave===avatar && loungeChair){BL.pokerModels.sitPose(avatar);return true;}
      if (cave === avatar && scripted()) return true;
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
    room.statues.mirror.reflectedActor = avatar.root;
    avatar.root.position.x = 0; avatar.root.position.y = avatar.baseY; avatar.root.position.z = 29;
    avatar.root.rotation.y = Math.PI; pilot.possess(avatar);
    // A reload of this tab stands where the Ooga stood on the floor (visit-spot.js), while it can walk on from there.
    const stood = ctx.from === null ? BL.visitSpot.take("poker", "") : null;
    if (loungeStart && BL.offlineLoungePack) {
      const door=BL.pokerSalons.DOORS[0];
      pilot.navigate({position:{x:door[2],y:0,z:door[3]+2},yaw:0,pitch:.18,dist:3});
      hud.toast("Pull the Bitcoin book and choose lounge.roompack to enter.");
    } else if (loungeStart) {
      salon = 0; salons.show(salon);
      const r = currentSalon();
      pilot.navigate({ position: { x: r.x, y: r.y, z: r.z + 4.9 }, yaw: 0, pitch: .18, dist: 3 });
      hud.setAreaLabel(r.name);
    } else if (stood && Math.abs(stood.y) < 0.05 && BL.visitSpot.holds(stood, floorWalk, avatar)) pilot.navigate({ position: stood, yaw: stood.yaw - Math.PI, pitch: 0.18, dist: 4 });
    else pilot.navigate({ position: { x: 0, y: 0, z: 29 }, yaw: 0, pitch: 0.18, dist: 4 });
    keepCameraInside();
    unsubscribeAccount = BL.net.subscribe(accountChanged);
    // Other signed-in players on the floor, as the Oogas they drive: one at a chair it is honoured for sits there, one
    // at a chair someone else holds is hidden, one at no chair stands as the pool posed it.
    remotes = BL.remotePlayers.create({ root, crew: people, fx, posed: (cave, feetY, rec) => {
      cave.parts.club.visible = cave.parts.gun.visible = false;
      if(rec.rest?.[1]===2 && rec.z<BL.pokerSalons.DOORS[0][3]){
        chaisePose(cave);return;
      }
      if(cave.root.quaternion===chaiseRotation)cave.root.quaternion=null;
      const state = BL.pokerPresence.stateOf(BL.pokerModels.TABLES, BL.pokerModels.SEATS, owner, rec);
      if (state === 1) {
        BL.pokerModels.sitPose(cave);
        const k = BL.pokerPresence.seatAt(BL.pokerModels.TABLES, BL.pokerModels.SEATS, rec.x, rec.y, rec.z);
        if (k >= 0) {
          const table=BL.pokerModels.TABLES[Math.floor(k/9)], chair=BL.pokerModels.SEATS[k%9];
          cave.root.position.x=table.x+chair.hipX; cave.root.position.z=table.z+chair.hipZ;
          seatPose(cave,k,rec);
        }
      } else {
        BL.pokerModels.bendKnees(cave.parts,false);
        if(state===2) cave.root.visible=false;
      }
    } });
    unsubscribeReactions = BL.net.subscribeReactions(onReaction);
    // The driven Ooga's own footsteps, heard by this page alone (footsteps.js).
    footsteps = BL.footsteps.create();
    engineBlockAge = Infinity;
    audio = BL.pokerAudio.create(terrace.engines); cheers = false;
    sunrise=0;
    market=BL.pokerMarket.create(()=>{
      sunrise=14;audio.fanfare();hud.toast("A new BTC/USD high on Kraken.");
    });
    unlistenBlock = BL.mempool.subscribe(e => {
      if(e.type==="stats" && e.recent && !document.hidden)room.hall.observe(e.recent);
      if (e.type === "block" && !document.hidden) {
        room.hall.clock.block(e.height, onDenBlock);
        salons.heirlooms?.block(e.height,salon===0 && !calm);
      }
    });
    mirror.body.track(avatar.root, avatar.traits.height * 2, Math.max(avatar.headOpen.verts.length, avatar.headClosed.verts.length));
    if (seatTable >= 0 && !pendingStand) sit(session.tables[seatTable].snapshot().seats.findIndex(s => s?.id === HERO));
    while (faces.length < BL.pokerRules.SEATS) { const f = { key: "", cave: null, tag: null, paint: canvas => BL.hud.renderFaceIcon(canvas, f.cave, null, 96) }; faces.push(f); }
    panel = BL.pokerHud.create(action, select, faceFor, emote, hud, npcAt); panel.setDealer(room.tables[0].agent);
    Themes.light(renderOpts, renderer.kind);
    if (salon===0) Object.assign(renderOpts,loungeFill);
    installHallLamps();
    // The polished floor mirrors the room on WebGL: its gloss sheet stands on the scene's root, off the room's. The night
    // stands over the vault beside the room.
    if (room.floor.gloss && renderer.kind === "webgl2") S.addChild(root, room.floor.gloss);
    S.addChild(root, cosmos.root);
    refresh(); cheers = true; setView(seatTable >= 0 && !pendingStand);
    // What the gaming tables reach in the room: the crowd for their guests' cues, the room's sound for theirs.
    gameCtx = { crowd: null, cue: (name, x, z) => { if (audio) audio.cue(name, x, z); } };
    crowd = BL.pokerCrowd.create({ root: room.root, fx, walkable: BL.pokerModels.walkable, spots: BL.pokerModels.spots(), publicState,
      others: () => crowdBodies, visitor: () => crowdBodies[0] === ownBody ? ownBody : null,
      day: Math.floor(Date.now() / 86400000), cap: crowdCap(), onStep, lite: renderer.kind === "canvas2d" });
    gameCtx.crowd = crowd;
    seatSmokes = Array.from({ length: SEAT_SMOKES }, (_, i) => BL.pokerCrowd.smoke({ root: room.root, lite: renderer.kind === "canvas2d", seed: 7919 * (i + 1) }));
    scene.root = root; scene.camera = camera; scene.input = input;
    scene.debug = { camera, pilot, hud, crew: people, cavemen: people.cavemen, controls: pilot.controls, poker: { session, room, salons, get salon() { return salon; }, action, select, snapshots, renderOpts, crowd, audio, cosmos, games: room.games, react: onReaction, get selected() { return selected; }, get carry() { return carry; }, get flyer() { return flyer; }, get walker() { return walker; }, get returns() { return returns; }, get reticle() { return reticle; }, get musicPlaque() { return musicPlaque; }, openCredits, npcAt,
      // The tells' state by chair and their public views by table, read only; `calm` stands in for the reduced-motion wish.
      get tells() { return tells; }, get tellViews() { return tellViews; }, get calm() { return calm; }, set calm(on) { calm = !!on; } } };
    if (new URLSearchParams(location.search).get("pokerLive") === "1") action("connect");
  };
  const update = (dt, elapsed) => {
    const now=Date.now();
    weather(elapsed,calm,salon,pilot.player);salons.sighting(now,calm);market.update(now);
    sunrise=Math.max(0,sunrise-dt);
    const dawn=Math.sin(Math.PI*sunrise/14);
    const base=renderer.kind==="canvas2d"?theme.canvas:theme;
    renderOpts.ambientFloor=base.ambient+.12*dawn;
    renderOpts.directStrength=base.directStrength+.67*dawn;
    if(elapsed>=nextMorningCheck){game.expireDenWins();nextMorningCheck=elapsed+1;}
    if(shownWins!==game.state.emberDen.wins){shownWins=game.state.emberDen.wins;updateWall(shownWins);salons.roofWins(shownWins);}
    salons.approach(avatar.root.position,salon);
    const passageVisible=salons.shelf.opened;
    salons.shelf.update(dt,salon<=0?avatar:null,floorWalk);
    if(passageVisible && !salons.shelf.opened)salons.show(salon);
    salons.entry?.slide(salons.shelf.hinge.rotation.y/1.61);
    const hearthPulse=salons.hearth?.(elapsed,calm) ?? 0;
    renderOpts.windTime=calm && (salon===0 || salon<0 && salons.shelf.opened)?0:undefined;
    if(salon===0 || salon<0 && salons.shelf.opened)salons.wind(elapsed,calm,renderer.quality);
    if(salon===0)salons.heirlooms.update(dt,calm,renderer.quality,avatar.root.position,exterior?null:audio);
    pilot.readInput(dt);
    carry.elapsed = elapsed;
    if (carry.phase === HOLD) { carry.fromX = avatar.root.position.x; carry.fromZ = avatar.root.position.z; }
    if((loungeChair || onChaise()) && (!pilot.player || pilot.controls.axes.x || pilot.controls.axes.y)) standLounge();
    if(bridgeTime){
      if(bridgeTime<=dt || !pilot.player || pilot.controls.axes.x || pilot.controls.axes.y || loungeChair || onChaise())finishBridgePose();
      else bridgeTime-=dt;
    }
    people.update(dt, elapsed);
    if(salon<=0 && salons.shelf.opened){
      const next=avatar.root.position.z<BL.pokerSalons.DOORS[0][3]?0:-1;
      if(next!==salon){
        if(next!==0)salons.heirlooms.away();
        salon=next;salons.show(next);hud.setAreaLabel(next<0?"Ember Den":currentSalon().name);
        if(next===0) Object.assign(renderOpts,loungeFill);
        else {Themes.light(renderOpts,renderer.kind);installHallLamps();}
      }
    }
    stepCarry(dt);
    updateTerracePack();
    pilot.update(dt);
    if (pilot.player) tableView = false;
    // Widen the table framing instead of backing the camera through the room's ceiling.
    if (tableView && !panel.focused) camera.fov = 2 * Math.atan(Math.tan(camera.fov / 2) * 1.4);
    // Clear the overhead sightline while keeping the tables illuminated.
    room.fixtures.visible = !tableView || panel.focused;
    // Restored views and possession blends can replace the ordinary solver's camera position.
    if (photo.active) photo.pose(); else if (telescope.active) telescope.pose(); else keepCameraInside();
    if((wideZoom || exterior) && (salon!==0 || salons.heirlooms?.modal || pilot.controls.axes.x || pilot.controls.axes.y))exitExterior();
    else if(exterior)poseExterior();
    else if(wideZoom && (pilot.birdsEye?pilot.birdsEyeHeight:pilot.orbit.tDist)>=31.95){
      wideZoom=false;enterExterior();
    }
    if (carry.phase === HOLD) aimStep();
    // A guest thrown out or walked out comes back in through the mirror a while later.
    for (let k = 0; k < RETURN_SLOTS; k++) if (elapsed >= returns[k]) { returns[k] = Infinity; crowd.returnGuest(0, BL.pokerModels.EXIT_Z - 1.8, Math.PI, camera.position); }
    // The Ooga driven here goes to the room with where it stands and its health; other players here are shown.
    const drivenHere = people.player;
    BL.net.setBody(drivenHere ? drivenHere.traits.name : null);
    if (drivenHere) { const p = drivenHere.root.position; BL.net.sendPose(p.x, p.y - drivenHere.baseY, p.z, drivenHere.root.rotation.y, null, BL.crew.jetFlags(drivenHere), 0, BL.crew.visualState(drivenHere), onChaise()?chaiseRest:0); BL.net.setHealth(drivenHere.health.value, drivenHere.health.stunned); }
    if (drivenHere && salon < 0 && !leaving && seatTable < 0) BL.visitSpot.note("poker", "", drivenHere);
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
    const atScope = !!drivenHere && nearScope();
    if (atScope && !byScope && !telescope.active) hud.toast("Telescope · tap the brass tube or use Act to look through it.");
    byScope = atScope;
    footsteps.update(drivenHere);
    // The room is heard from the Ooga driven here, else the visitor's own, facing the view's way on the floor; a view
    // straight down keeps the last facing.
    const heard = (drivenHere || avatar).root.position, lx = camera.target.x - camera.position.x, lz = camera.target.z - camera.position.z, fl = Math.hypot(lx, lz);
    EAR.x = heard.x; EAR.z = heard.z;
    if (fl > 1e-4) { EAR.fx = lx / fl; EAR.fz = lz / fl; }
    engineBlockAge += dt;
    const left = room.hall.clock.update(dt, elapsed, BL.chain.snapshot, now, camera.position, onDenBlock);
    audio.update(dt, EAR, elapsed, engineBlockAge);
    audio.wingbeats(salon===0 && !exterior?salons.heirlooms.hummingbird:null,currentSalon(),heard.y+1.1);
    // A new track of the lounge playlist names itself for NOW_SHOWN seconds (the string built only on a change).
    const playing = audio.nowPlaying;
    if (playing !== shownTrack) { shownTrack = playing; if (playing) { panel.nowPlaying(`♪ "${playing.title}" · ${playing.by}`); nowTime = NOW_SHOWN; } }
    if (nowTime > 0 && (nowTime -= dt) <= 0) panel.nowPlaying(null);
    crowdBodies.length = 0;
    if (avatar.root.visible) { ownBody.x = avatar.root.position.x; ownBody.z = avatar.root.position.z; ownBody.radius = avatar.bodyRadius; crowdBodies.push(ownBody); }
    const remoteBodies = remotes.actors();
    for (let i = 0; i < remoteBodies.length; i++) crowdBodies.push(remoteBodies[i]);
    crowd.update(dt, elapsed, camera);
    // The gaming tables after the crowd, so their cues reach guests already posed this frame and their staff and dice
    // are drawn where this frame leaves them.
    room.games.update(dt, camera, gameCtx);
    if (room.root.visible) smokeSeats(elapsed);
    crowdTimer += dt;
    if (crowdTimer >= 1) { crowdTimer = 0; crowd.setCap(crowdCap()); }
    mirror.phase.update(dt, elapsed); mirror.body.update(dt); mirror.body.time = mirror.phase.ripples.time;
    if (pilot.player && (seatTable < 0 || pendingStand) && Math.abs(avatar.root.position.x) < BL.bifrostModels.WINDOW.halfW
      && avatar.root.position.z + avatar.bodyRadius > BL.pokerModels.EXIT_Z && !leaving) leaveFloor();
    // All ten table lights fit the lowest renderer tier; selected table goes first.
    const near = selected, lights = renderOpts.lights;
    if (room.root.visible) {
      terraceScope.updateService(elapsed,calm,salon<0?pilot.player:null,fx,engineBlockAge);
      room.updateInstruments(elapsed,calm,BL.chain.snapshot);
      room.statues.update(elapsed,calm);
    }
    const jubilee = room.hall.bandstand.update(dt,elapsed,calm,BL.chain.snapshot,now);
    const power = Math.min(1, left / 0.8), ease = power * power * (3 - 2 * power);
    for (let slot = 0; slot < 10; slot++) {
      const i = (near + slot) % 10, p = BL.pokerModels.TABLES[i], o = slot * 8;
      lights[o] = p.x; lights[o + 1] = theme.tableY; lights[o + 2] = p.z; lights[o + 3] = theme.tableRange;
      lights[o + 4] = theme.tableLight[0] + 0.20 * ease + .61 * jubilee;
      lights[o + 5] = theme.tableLight[1] - 0.14 * ease + .27 * jubilee; lights[o + 6] = theme.tableLight[2] - 0.2 * ease;
      const v = room.tables[i]; v.pulse = Math.max(0, v.pulse - dt);
      // The table signs clear the overhead view with the fixtures.
      v.label.visible = room.fixtures.visible;
      v.agent.parts.armL.rotation.x = -0.5 - Math.sin(v.pulse / 0.7 * Math.PI) * 0.75;
      v.agent.parts.armR.rotation.x = -0.45;
      v.dealCard.visible = v.pulse > 0 && snapshots[i].phase !== "waiting";
      v.dealCard.position.z = BL.pokerModels.DEAL_FROM + (1 - v.pulse / 0.7) * BL.pokerModels.DEAL_RUN;
    }
    for (let i = 0; i < 3; i++) {
      const o = (10 + i) * 8;
      lights[o] = 0; lights[o + 1] = BL.pokerModels.CHANDELIER_LIGHT_Y; lights[o + 2] = (i - 1) * 24; lights[o + 3] = theme.roomRange + 4 * ease;
      lights[o + 4] = theme.roomLight[0] + (2.5 - theme.roomLight[0]) * ease;
      lights[o + 5] = theme.roomLight[1] + (0.95 - theme.roomLight[1]) * ease;
      lights[o + 6] = theme.roomLight[2] + (0.18 - theme.roomLight[2]) * ease;
    }
    for (const n of room.sparkle) {
      n.geometry = left > 0 ? n.amber : n.prism;
      n.glow = 0.92 + 0.12 * Math.sin(elapsed * 0.78 + n.ring * 1.7 + n.fixture) + 0.15 * ease;
    }
    for (const n of room.rays) { n.visible = left > 0; n.smokeOpacity = ease; n.glow = ease; }
    salons.portalView(camera.position,salon);
    if (room.floor.gloss) room.floor.gloss.visible = salon < 0 || salon === 2;
    room.hall.aquarium.root.visible = salon < 0 || salon === 2;
    room.hall.update(dt, elapsed, calm, room.root.visible);
    cosmos.update(dt, elapsed, renderOpts);
    hud.updateBoard(elapsed);
    renderOpts.lightCount = renderer.kind === "webgl2" && renderer.quality === "high" ? highLightCount : hallLightCount;
    if (salon >= 0) {
      const r = currentSalon(), ice = salon === 1;
      if (ice) salons.glyph.rotation.y = (salons.glyph.rotation.y + dt * 0.6) % (Math.PI * 2);
      for (let k = 0; k < 2; k++) {
        const off = k * 8;
        lights[off] = r.x + (k ? 3 : -3); lights[off + 1] = r.y + 2.8; lights[off + 2] = r.z + (k ? 1 : -2);
        lights[off + 3] = 9; lights[off + 4] = ice ? 0.7 : 1.55; lights[off + 5] = ice ? 1.15 : 1.08; lights[off + 6] = ice ? 1.65 : 0.67;
      }
    }
    // The bar's opal counter lamp lights the jacket, shaker and garnish up close.
    if(salon<0 && Math.hypot(camera.position.x-BL.pokerTerrace.serviceX,camera.position.z+35)<8) {
      lights[0]=BL.pokerTerrace.serviceX-.6; lights[1]=2.45; lights[2]=-34.0; lights[3]=4.5;
      lights[4]=2.12; lights[5]=1.65; lights[6]=1.16;
    }
    const stage=BL.pokerBandstand.floor;
    if(salon<0 && Math.hypot(camera.position.x-stage.x,camera.position.z-stage.z)<10){
      // Take a distant table lamp when the player is close enough to see the copper instruments.
      const off=72;
      lights[off]=stage.x+2.03;lights[off+1]=2.67;lights[off+2]=stage.z;lights[off+3]=4.6;
      lights[off+4]=1.56;lights[off+5]=1.28;lights[off+6]=1.03;
    }
    if (photo.active) {
      const b=BL.pokerClub.booth;
      lights[0]=b.x-.9; lights[1]=2.55; lights[2]=b.z+2.65; lights[3]=5.6;
      lights[4]=2.7; lights[5]=2.18; lights[6]=1.68;
    }
    if (salon === 2) {
      const r=currentSalon();
      for(let k=0;k<2;k++){
        const o=k*8;
        lights[o]=r.x+(k?4.3:-4.3);lights[o+1]=r.y+1.1;lights[o+2]=r.z+1;
        lights[o+3]=8;lights[o+4]=2.37+.1*Math.sin(elapsed*3+k);lights[o+5]=1.31;lights[o+6]=.52;
      }
    }
    renderOpts.characterProjection=salon===0?salons.projector:null;
    if (salon === 0) {
      renderOpts.ambientFloor=renderer.kind==="canvas2d"?.28:.18;renderOpts.directStrength=.07;
      hearthLight(lights,0,hearthPulse,1);
      lights.set(salons.windowLights,8);
      const off=8+salons.windowLights.length,r=BL.pokerSalons.ROOMS[0];
      lights[off]=r.x-.32;lights[off+1]=r.y+2*(BL.pokerHearth.emblemY-.36);lights[off+2]=r.z-r.d/2+3.28;
      lights[off+3]=5.2;lights[off+4]=.94+hearthPulse;lights[off+5]=.36+hearthPulse*.58;
      lights[off+6]=.10+hearthPulse*.18;lights[off+7]=0;
      // The white flame in the floor casts a small pool of light on passing feet.
      const flame=off+8;
      lights[flame]=r.x;lights[flame+1]=r.y+.22;lights[flame+2]=r.z;lights[flame+3]=2.6;
      lights[flame+4]=lights[flame+5]=lights[flame+6]=.32;lights[flame+7]=0;
      lights.set(salons.heirlooms.hollowLights,flame+8);
      renderOpts.lightCount=(flame+8+salons.heirlooms.hollowLights.length)/8;
    } else if (salon < 0 && salons.shelf.hinge.rotation.y > 0) {
      const door = salons.shelf.target.position;
      // Replace the distant table lamp only while the viewer is at the reveal.
      const fade = clamp(1-Math.hypot(camera.position.x-door.x,camera.position.z-door.z)/9,0,1);
      if (fade > 0) {
        const off=9*8, amount=fade*salons.shelf.hinge.rotation.y/1.61;
        hearthLight(lights,off,hearthPulse,amount);
      }
    }
    if (salon < 0 && camera.position.x > 17 && Math.abs(camera.position.z) < 11) {
      // Borrow the two far-end table lamps for the brass lanterns while looking out from this bay.
      const fade = clamp((camera.position.x - 17) / 5, 0, 1) * clamp((11 - Math.abs(camera.position.z)) / 4, 0, 1);
      for (let slot = 0; slot < 10; slot++) {
        const i = (near + slot) % 10;
        if (i !== 0 && i !== 8) continue;
        const off = slot * 8, s = i === 0 ? 1 : -1;
        lights[off] += (28 - lights[off]) * fade; lights[off+1] += (1.7 - lights[off+1]) * fade;
        lights[off+2] += (s * 4.9 - lights[off+2]) * fade; lights[off+3] += (7.4 - lights[off+3]) * fade;
        lights[off+4] += (1.85 - lights[off+4]) * fade; lights[off+5] += (1.12 - lights[off+5]) * fade;
        lights[off+6] += (.65 - lights[off+6]) * fade;
      }
    }
    // The colonnade's candles flicker, each on its own beat.
    for (let i = 0; i < room.glazing.flames.length; i++) room.glazing.flames[i].glow = 0.84 + BL.blaze.flare(elapsed, i * 2.3) * 1.3;
    if (!session.live && !session.paused) {
      timer += dt;
      // A table of computer opponents alone counts down from waiting too; a table the visitor's Ooga is walking to for
      // Ask Ooga To Move holds its next hand until the guest is lifted.
      for (let i = 0; i < 10; i++) if (session.autoDeal[i] && (snapshots[i].result || !humanAt[i] && snapshots[i].phase === "waiting") && !(carry.phase === WALK && carry.table === i)) nextHand[i] = Math.max(0, nextHand[i] - dt);
      // A practice bot held facing a big bet acts the moment its hold runs out, off the 0.8 s beat.
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
          if ((s.result || !humanAt[i] && s.phase === "waiting") && session.autoDeal[i] && nextHand[i] === 0) {
            const hero = s.seats.find(p => p?.id === HERO);
            if (hero && hero.stack === 0 && !pendingStand) session.autoDeal[i] = false;
            else {
              for (const p of s.seats) if (p?.bot && p.stack === 0) t.refill(p.id);
              if (t.snapshot().seats.filter(p => p && p.stack > 0).length >= 2) t.start();
              // Too few at a table of computer opponents (a guest asked to move): it waits for players, dealing on.
              else if (!humanAt[i]) nextHand[i] = 5;
              else session.autoDeal[i] = false;
            }
            changed = true;
          } else if (player?.bot) { if (!(botWait[i] > 0) && !botHolds(i)) BL.pokerRules.botAction(t, player.id); }
          else if (i === seatTable && pendingStand && player?.id === HERO) { const l = t.snapshot(HERO).legal; if (l) t.act(HERO, l.check ? "check" : "fold"); }
        } catch (error) { session.autoDeal[i] = false; panel.notice(error.message); }
        if (i === seatTable && pendingStand && !t.playing) { t.leave(HERO); seatTable = -1; pendingStand = false; }
        // A seat saved by Quick seat while every table was mid-hand: taken the moment this table's hand ends.
        if (i === quickWait && !t.playing && seatTable < 0) { quickWait = -1; selected = i; action("quick"); }
        if (t.version !== room.tables[i].version) { syncTable(i); changed = true; }
      }
      if (changed) updatePanel();
    }
    // Tells: a live table that went down forgets its own; a paused practice game holds every tell where it stands.
    if (session.live && session.live.connection !== "live") { if (tellsOn) { tellsOn = false; for (let i = 0; i < 10; i++) forgetTable(i); } }
    else if (session.live || !session.paused) { tellsOn = true; for (let i = 0; i < 10; i++) stepTells(i, dt); }
    const seconds = session.live ? session.live.deadline === null ? -1 : Math.max(0, Math.ceil((session.live.deadline - BL.net.serverNow()) / 1000)) : Math.ceil(nextHand[selected]);
    if (shownCountdown !== seconds) { shownCountdown = seconds; panel.countdown(seconds, session.autoDeal[selected]); }
    showTablePrompt(nearbyTable());
    const act=loungeAct();
    if(act||actPrompt)showLoungeAct(act);
    S.stepTweens(dt); fx.update(dt, elapsed);
  };
  const extra = (c, project) => remotes.drawNames(c, project);
  const onKey = e => {
    if (offeredTable >= 0 && e.key.toLowerCase() === "y" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); action("open-nearby"); return true;
    }
    if(exterior){exitExterior();if(e.key==="Escape")return true;} if(salons?.heirlooms?.modal)return true; if(photo.active){if(e.key==="Escape")photo.close();return true;} if (telescope.active) { if (e.key === "Escape") telescope.close(); return true; } if (BL.controls.matches(e,"jetpack") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && toggleTerracePack()) {e.preventDefault();return true;} if (BL.controls.matches(e, "view") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && modeAction("mode-toggle")) { e.preventDefault(); return true; } if (BL.controls.matches(e, "escape")) { if (panel.closeEmoteMenu()) return true; if (carry.phase >= LIFT) { if (carry.npc) putDown(); return true; } if (carry.phase === WALK) { dropRequest(); return true; } if (panel.focused) panel.requestWalk(); else if (seatTable >= 0 && !pendingStand) action("stand"); else if (!pilot.escape()) leaveFloor(); return true; } if (BL.controls.matches(e, "resetView") && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) return pilot.resetCamera(); return false; };
  const leave = () => {
    exitExterior();
    visit++; pendingLive?.dispose(); pendingLive = null;
    abortCarry(); panel.nowPlaying(null);
    session.selected = selected; session.pendingStand = pendingStand;
    if (session.live) session.live.dispose();
    BL.net.setPokerVoice(null);
    world.pilot = pilot.player ? pilot.player.traits.name : null;
    unsubscribeAccount(); unsubscribeAccount = null; unsubscribeReactions(); unsubscribeReactions = null; BL.net.setBody(null);
    for (const t of room.tables) t.agent.dispose();
    room.games.dispose(); gameCtx.crowd = gameCtx.cue = null; gameCtx = null;
    market.dispose();market=null;weather=null;
    unlistenBlock(); unlistenBlock = null;
    finishBridgePose();salons.dispose();
    hud.closeBoard(); room.hall.dispose(); room.statues.dispose(); room.floor.dispose(); cosmos.dispose();
    BL.pokerModels.setLite(false);
    remotes.dispose(); remotes = null; footsteps.dispose(); footsteps = null;
    crowd.dispose(); crowd = null; crowdBodies.length = 0; renderer = null;
    for (const r of seatSmokes) r.dispose(); seatSmokes = null; seatSmoked.fill(null);
    // After the crowd, so no footfall reaches a closed context.
    audio.dispose(); audio = null; cheers = false;
    photo.dispose();photo=null;terraceScope=updateWall=shownWins=null;
    telescope.dispose(); telescope = null; byScope = false;
    people.dispose(); fx.dispose(); pilot.dispose();
    for (const n of targets) input.remove(n); targets.length = 0;
    mirror.phase.dispose(); mirror.body.dispose(); mirror.glass.mirrorRipples = null;
    panel.dispose(); hud.dispose();
    while (root.children.length) S.removeChild(root, root.children[root.children.length - 1]);
    const count = input.targetCount; input.dispose();
    document.body.removeAttribute("data-poker-seated");
    document.body.removeAttribute("data-poker-table-view");
    scene.input = scene.debug = null;
    hud = panel = pilot = fx = people = avatar = room = mirror = input = session = game = world = go = cosmos = null;
    carry = flyer = walker = returns = cleared = blockers = reticle = musicPlaque = shownTrack = null; quickWait = -1;
    tablePrompt.hidden=true;tablePrompt=tableQuestion=null;
    salons = null; salon = -1; loungeChair=null; actPrompt=false; actShown=""; actTitle="";
    snapshots.fill(null);
    owner = lastOwner = lastBody = presenceInput = null;
    emoteBy = emoteEmoji = emoteTime = emoteCount = gestureKind = gestureT = shownChair = shownCount = null; heroChair = -1;
    tells = tellViews = tellFresh = null; tellsOn = true; botWait.fill(0); botFor.fill(-1); botPot.fill(-1);
    for (const f of faces) { f.cave = f.tag = null; f.key = ""; }
    return { targets: count };
  };
  const liveGeometry = set => { if (room) { for (const t of room.tables) t.agent.liveGeometry(set); room.games.liveGeometry(set); } if (avatar) set.add(avatar.headOpen).add(avatar.headClosed); if (remotes) remotes.liveGeometry(set); if (crowd) crowd.liveGeometry(set);
    // The night's ship, its puffs and the shooting stars hidden between their runs.
    if (cosmos) cosmos.liveGeometry(set); };
  const stats = () => { let allNodes = 0, visibleNodes = 0; const walk = n => { allNodes++; for (const c of n.children) walk(c); }; walk(root); S.traverseVisible(root, () => visibleNodes++); return { allNodes, visibleNodes, targets: input.targetCount, tweens: S.tweenCount(), ...fx.stats(), ...(remotes ? remotes.stats() : {}), ...(crowd ? crowd.stats() : {}) }; };
  // Voice zone: the Ember Den, a portal of its own off the Bifrost chamber.
  const scene = BL.deferred.scene("poker", { id: "poker", voiceZone: "emberden", micKey: true, enter, update, overlay: dt => { photo.afterDraw(); if(!exterior)fx.drawOverlay(dt, extra); }, onKey, leave, liveGeometry, stats, renderOpts,
    onDonation(donation, counted = null) {
      game.recordDonation(donation, counted && counted.exact);
      world.level = Math.min(BL.pile.MAX_BANANAS, world.level + (counted ? counted.exact : BL.game.bananasFor(donation.sats)));
    }, root: null, camera: null, input: null, debug: null,
    agent: null, agentView: null, agentControls: null, agentHandoff: null, get inMotion() { return !!room; } });
  scene.controlsHelp = touch => { const help = pilot.controlsHelp(touch,["jetpack"]); help.title = "The Ember Den · " + help.title; return help; };
  scene.controlsHelpHold = on => { pilot.controls.reset(); pilot.setMenuOpen(on, false); };
})();
