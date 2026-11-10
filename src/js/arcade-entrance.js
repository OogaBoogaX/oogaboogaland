// The cave in front of Ooga Arcade's hall (#554), under the 3 o'clock mouth's node on the island: the double doors at
// its back and the four most played cabinets, two a side, in the terrain's recesses near the mouth
// (`arcadeCabinets.slots`, chosen by `arcade-popular.js`). A cabinet here is the game's second machine: it plays with
// its own seat (`<id>@out`), beside the hall's, and shares its board. The doors are `arcade-doors.js`: a visitor hands
// over to the hall with them still shut, so what they open on is the hall itself. Built with the island; `bind` per
// visit; allocates nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, boundsOf } = BL.scene;
  const AM = BL.arcadeModels, AC = BL.arcadeCabinets;
  const DOOR_Z = -5.6, DOOR_ACTION = DOOR_Z + 0.9, DOOR_REACH = 1.9, REACH = 1.05, NEAR_SQ = 400;
  const gameOf = (c) => (c.game >= 0 ? AM.GAMES[c.game] : AM.RETRO[c.retro]);
  const cabinetOf = (id) => AM.CABINETS.find((c) => !c.service && gameOf(c).id === id);
  const framesOf = (c) => (c.game >= 0 ? AM.attractFrames(c.game) : AM.retroFrames ? AM.retroFrames(c.retro) : null);

  // One cabinet of the four, in the cave's frame: its nodes, showing no game yet.
  const entry = (parent, slot) => {
    const node = createNode({ position: { x: slot.lx, y: 0, z: slot.lz }, rotation: { x: 0, y: slot.turn, z: 0 } });
    const body = createNode({}), screen = createNode({ position: { x: 0, y: AM.SCREEN.y, z: AM.SCREEN.z }, rotation: { x: AM.SCREEN.lean, y: 0, z: 0 }, sightHidden: true, depthBias: -0.1 });
    const marquee = createNode({ position: { x: 0, y: AM.MARQUEE.y, z: AM.MARQUEE.z } });
    addChild(node, body, screen, marquee);
    addChild(parent, node);
    return { slot, node, body, screen, marquee, game: null, cabinet: null, frames: null, shown: -1,
      action: { kind: "arcade-cabinet", slot: slot.slot }, owner: { kind: "arcade-cabinet", slot: slot.slot, priority: 2, weaponType: "none" } };
  };
  // What one cabinet shows: its body, marquee and attract loop.
  const dress = (e, id) => {
    const c = cabinetOf(id), named = gameOf(c);
    e.game = id; e.cabinet = c; e.frames = framesOf(c); e.shown = -1;
    e.body.geometry = AM.cabinet(c.index);
    e.screen.visible = !!e.frames;
    if (e.frames) e.screen.geometry = e.frames[0];
    const sign = BL.hubModels.caveSign(named.title, named.icon), b = boundsOf(sign), k = AM.MARQUEE.w / (b.max[0] - b.min[0]);
    e.marquee.geometry = sign;
    e.marquee.scale = { x: k, y: k, z: k };
  };
  // The hall's copy of the four, past its doors: the same games the island is showing, nothing to walk into or press.
  const yard = (parent) => {
    const entries = AC.slots.map((slot) => entry(parent, slot));
    const show = (top) => { entries.forEach((e, i) => { if (e.game !== top[i]) dress(e, top[i]); }); };
    show(BL.arcadePopular.top());
    const off = BL.arcadePopular.subscribe(show);
    return { entries, dispose: off, update(elapsed) {
      const frame = Math.floor(elapsed * AM.FPS) % AM.FRAMES;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.frames && e.shown !== frame && frame < e.frames.length) { e.shown = frame; e.screen.geometry = e.frames[frame]; }
      }
    } };
  };

  const MIDDLE = new Float64Array(3);
  const build = ({ group, mouth: m, solids, addTarget, removeTarget, reachable, sightClear }) => {
    const sr = Math.sin(m.ry), cr = Math.cos(m.ry);
    addChild(group, createNode({ geometry: AM.caveFloor(0), sightHidden: true }));
    const door = BL.arcadeDoors.create({ parent: group, z: DOOR_Z, wall: true, solids });
    const frame = { x: m.x, z: m.z, sr, cr, ry: m.ry, plane: DOOR_Z, floor: m.floorY };
    const entries = AC.slots.map((slot) => entry(group, slot));
    const doorActions = { enter: { kind: "arcade-door", state: "enter" }, loading: { kind: "arcade-door", state: "loading" }, retry: { kind: "arcade-door", state: "retry" } };
    let visit = null, walk = null, off = null, barrier = false, prefetch = 0, request = 0, taken = false;

    // A cabinet's whole loop on the GPU at once, so the loop never hitches and a later visit holds nothing more.
    const warmFrames = (e) => { if (e.frames && visit) for (const f of e.frames) visit.renderer.prepareGeometry(f); };
    // One cabinet shows one game: its body, marquee and attract loop, and the footprint the walkers meet.
    const setGame = (e, id) => {
      if (e.game === id) return;
      const registered = e.game !== null;
      if (registered) solids.remove(e.body);
      dress(e, id);
      solids.add(e.body);
      warmFrames(e);
    };
    const show = (top) => { entries.forEach((e, i) => setGame(e, top[i])); };
    const setBarrier = (on) => {
      if (on === barrier) return;
      barrier = on;
      if (on) { solids.add(door.left); solids.add(door.right); } else { solids.remove(door.left); solids.remove(door.right); }
    };
    show(BL.arcadePopular.top());
    setBarrier(true);

    // The hall a visitor is about to walk into: its code and the shared models, built behind the shut doors while the
    // visitor keeps walking the cave. What the director builds for the switch is then already there.
    const prepare = () => {
      const scene = BL.scenes.arcade, models = BL.models, ctx = visit.ctx;
      const asked = models.withScope("arcade", () => scene.prepare ? scene.prepare(null, ctx, "arcade") : null);
      const built = () => {
        const steps = models.withScope("arcade", () => scene.buildSteps(ctx));
        return BL.buildTasks.run(steps, "arcade", ctx.signal);
      };
      return asked && asked.then ? asked.then(built) : built();
    };
    const refreshFrames = () => { for (const e of entries) if (!e.frames && (e.frames = framesOf(e.cabinet))) { e.shown = -1; e.screen.visible = true; e.screen.geometry = e.frames[0]; warmFrames(e); } };

    const onThrough = (crossing) => {
      const { pilot, world, go, hud, input, controls, player } = visit, o = pilot.orbit;
      world.arcadeCrossing = crossing;
      visit.grab();
      world.pilot = pilot.player.traits.name;
      pilot.controls.reset(); input.reset(); pilot.setActive(false); hud.tooltip.hide();
      visit.setEntering(true);
      if (!go("arcade", null, true)) { world.arcadeCrossing = null; visit.setEntering(false); pilot.setActive(true); return false; }
      return true;
    };

    const bind = (v) => {
      visit = v;
      request++; taken = false;
      walk = BL.arcadeDoors.walk({ door, frame, sign: -1, pilot: v.pilot, crew: v.crew, camera: v.camera, prepare, onThrough, onState: () => { v.refreshPrompt(); }, followMin: v.followMin, shut: true });
      door.set(false);
      setBarrier(true);
      for (const e of entries) addTarget(e.body, e.owner, { radius: 0.9 });
      off = BL.arcadePopular.subscribe(show);
      BL.arcadePopular.load();
      show(BL.arcadePopular.top());
      refreshFrames();
      entries.forEach(warmFrames);
    };
    const unbind = () => {
      if (!visit) return;
      if (off) off(); off = null;
      for (const e of entries) removeTarget(e.body);
      // A walk handed over to the hall ends here: the island may be kept for the way back, so its Ooga gets its head back.
      if (walk) walk.reset();
      // A seat granted after the island was left has no one to use it. A cabinet visit under way keeps its own.
      if (!visit.cabinet.active) BL.net.leaveCabinet();
      visit = walk = null;
    };

    const update = (dt, elapsed, player) => {
      if (!walk) return;
      walk.update(dt, player);
      setBarrier(door.k === 0);
      const near = player ? (player.root.position.x - m.x) ** 2 + (player.root.position.z - m.z) ** 2 < NEAR_SQ : false;
      if (near && elapsed >= prefetch) { prefetch = elapsed + 1; BL.deferred.prefetchScene("arcade"); refreshFrames(); }
      if (near) {
        const frame = Math.floor(elapsed * AM.FPS) % AM.FRAMES;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (e.frames && e.shown !== frame && frame < e.frames.length) { e.shown = frame; e.screen.geometry = e.frames[frame]; }
        }
      }
    };
    // Once the camera is final for the frame: the view through a door walk.
    const afterCamera = (camera, dt) => { if (walk) walk.view(dt); };

    const nearby = (x, y, z, player) => {
      if (!walk) return null;
      if (player && !walk.holding) {
        const p = player.root.position, yaw = player.root.rotation.y;
        for (let i = 0; i < entries.length; i++) {
          const e = entries[i], s = e.slot;
          if (Math.hypot(p.x - s.x, p.z - s.z) < REACH && Math.cos(yaw - s.yaw) > 0.5 && reachable(x, y, z, s.x, y, s.z)) return e.action;
        }
      }
      if (walk.holding) return null;
      const dx = x - (m.x + sr * DOOR_ACTION), dz = z - (m.z + cr * DOOR_ACTION);
      if (Math.hypot(dx, dz) >= DOOR_REACH || Math.abs(dx * cr - dz * sr) >= BL.arcadeDoors.WALK_HALF) return null;
      return walk.state.failed ? doorActions.retry : walk.state.busy ? doorActions.loading : doorActions.enter;
    };

    const tip = (o) => {
      const e = entries[o.slot], seat = BL.net.cabinetSeats.get(AC.outdoorSeat(e.game));
      return seat ? `${seat.name} is playing · cabinet occupied` : `${gameOf(e.cabinet).name} · ${visit && visit.coarse ? "tap" : "click"} to play`;
    };
    const use = (action) => {
      // Asked while the hall is still loading, the walk starts as soon as it is ready.
      if (action.kind === "arcade-door") { walk.ask(); return; }
      play(entries[action.slot]);
    };
    // A click finds a cabinet by a broad sphere: only one the view can see counts, or a press on the rock beside the mouth
    // or the hill over the cave would open a game. And never in the middle of a walk through the doors.
    const inSight = (e) => {
      const c = visit.camera.position, g = boundsOf(e.body.geometry).center;
      BL.math.mat4.transformPoint(MIDDLE, e.body.world, g[0], g[1], g[2]);
      return sightClear(c.x, c.y, c.z, MIDDLE[0], MIDDLE[1], MIDDLE[2]);
    };
    const tap = (o) => { const e = entries[o.slot]; if (!walk.holding && inSight(e)) play(e); };
    const prompt = (action, hud, coarse) => {
      if (action.kind === "arcade-cabinet") {
        const e = entries[action.slot], seat = BL.net.cabinetSeats.get(AC.outdoorSeat(e.game)), label = gameOf(e.cabinet).name;
        hud.hint(seat ? `${label} · ${seat.name} is playing` : `${coarse ? "PLAY" : "Space"}: ${label}`);
        hud.setAct("PLAY");
      } else if (action.state === "loading") { hud.hint("Opening Ooga Arcade…"); hud.setAct("WAIT"); }
      else if (action.state === "retry") { hud.hint(coarse ? "The doors stuck. Tap RETRY" : "The doors stuck. Press Space to try again"); hud.setAct("RETRY"); }
      else { hud.hint(coarse ? "Tap ENTER ARCADE to go in" : "Press Space to enter Ooga Arcade"); hud.setAct("ENTER ARCADE"); }
    };
    // Into a cabinet here: the seat is the game's outdoor one, held at this slot, and the same glass view as the hall's.
    const play = (e) => {
      const { pilot, world, cabinet, camera, hud } = visit, id = e.game, seat = AC.outdoorSeat(id);
      if (visit.entering()) return;
      const held = BL.net.cabinetSeats.get(seat);
      if (held && held.player !== BL.net.state.selfId) { hud.toast(`${held.name} is playing · cabinet occupied`); return; }
      const actor = pilot.player;
      if (!actor) { hud.toast("Choose your Ooga before opening a cabinet"); return; }
      const asked = ++request, at = e.slot;
      visit.setEntering(true);
      pilot.controls.reset();
      actor.root.position.x = at.x; actor.root.position.y = at.y + m.floorY + actor.baseY; actor.root.position.z = at.z;
      actor.root.rotation.y = at.yaw;
      BL.net.setBody(actor.traits.name); BL.net.setZone("outside");
      BL.net.sendPose(at.x, at.y, at.z, at.yaw);
      BL.net.takeCabinet(seat, at.slot).then((reason) => {
        if (asked !== request || !visit) return;
        if (reason) { visit.setEntering(false); hud.toast(reason); return; }
        taken = true;
        world.arcadeYard = { slot: at.slot, name: actor.traits.name };
        world.pilot = actor.traits.name;
        cabinet.begin(id, { x: m.x + cr * at.lx + sr * at.lz, y: m.floorY, z: m.z - sr * at.lx + cr * at.lz, turn: m.ry + at.turn, index: e.cabinet.index }, camera, e.screen, { home: "hub" });
      });
    };
    // A way back that was cancelled, or a seat refused: the cave is playable again.
    const stay = () => { taken = false; if (visit) visit.world.arcadeYard = null; if (walk && walk.holding) walk.reset(); };

    // Coming back out through the doors: the Ooga on past them, the view behind it, the doors standing open.
    // Coming back out through the doors: the Ooga and the view as they stood when the hall let go, both past the doors
    // already (the walk there brought the view through the doorway), walking on with the doors open behind them.
    const arrive = (crossing) => {
      const { pilot } = visit, player = pilot.player, along = DOOR_Z + crossing.past, across = crossing.across;
      pilot.navigate({ position: { x: m.x + sr * along + cr * across, y: m.floorY, z: m.z + cr * along - sr * across }, yaw: m.ry + Math.PI, pitch: crossing.pitch, dist: crossing.dist, framed: true });
      setBarrier(false);
      walk.arrive(crossing, player, m.ry + Math.PI);
    };
    // Back from a cabinet here: where it stood, as itself, the view behind it.
    const standAt = (slot) => {
      const { pilot } = visit, at = AC.slot(slot);
      pilot.navigate({ position: { x: at.x, y: m.floorY, z: at.z }, yaw: at.yaw + Math.PI, pitch: 0.18, dist: 4 });
    };
    const liveGeometry = (set) => { for (const e of entries) if (e.frames) for (const f of e.frames) set.add(f); };
    const dispose = unbind;
    return { door, entries, frame, bind, unbind, update, afterCamera, nearby, use, tap, tip, prompt, arrive, standAt, stay, liveGeometry, dispose, get walk() { return walk; }, get warming() { return !!walk && walk.state.busy; } };
  };
  BL.arcadeEntrance = { build, yard, DOOR_Z };
})();
