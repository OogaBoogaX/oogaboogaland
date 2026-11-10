// The double doors between the island and Ooga Arcade's hall (#554), one rig in each scene's copy of the same doorway,
// in the door's frame with +z out of the hall: the leaves swing by themselves, on their own nodes, away from whoever is
// walking through. A door's `walk` takes a visitor through as the Timechain Sphere's doorway does: it keeps the doors shut
// while what lies beyond readies, with the visitor still driving outside them, swoops the view into the Ooga's own eyes
// and hands over to the other scene from that same eye, whose own rig walks the Ooga on and closes the doors behind it
// before gliding the view back out. Going in from the island it hands over with the doors still shut (`shut`), so the
// hall opens them itself and all that comes into view through them is the real hall. Allocates nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const { clamp } = BL.math;
  const AM = BL.arcadeModels;
  // The walk: how far past the doors an Ooga goes on the far side before the controls come back, how far past they keep
  // open for the view (`VIEW_CLEAR`, the doors' swing), how far short of them the eye hands over, the swoop's seconds and
  // how long a walk may run before it lets go.
  const OPEN = 1.55, OPEN_S = 0.85, FAR = 3.4, TOUCH = 1.25, GRACE = 0.5, ARRIVE = 2.4, SPEED = 0.55, AHEAD = 1.6, LIMIT = 9, VIEW_CLEAR = 1.2, HAND = 0.15, GLIDE = 0.45, LET_GO_PITCH = 0.12, CLEAR_BACK = 0.7;
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
  const smooth = (t) => t * t * (3 - 2 * t);
  // How far off the middle a walk may start: inside the doorway, the widest Ooga's shoulders clear of its posts.
  const WALK_HALF = AM.DOOR.half - 0.4;

  // A door rig under `parent`, at (x, y, z) turned `turn` there: the frame, the wall (`wall` for a cave with no rock
  // of its own round it) and the two leaves.
  const create = ({ parent, x = 0, y = 0, z = 0, turn = 0, wall = false, solids = null }) => {
    const parts = AM.doorParts(), D = AM.DOOR;
    const node = createNode({ position: { x, y, z }, rotation: { x: 0, y: turn, z: 0 } });
    const frame = createNode({ geometry: parts.frame }), left = createNode({ position: { x: -D.half, y: 0, z: 0 }, geometry: parts.leaf });
    const right = createNode({ position: { x: D.half, y: 0, z: 0 }, rotation: { x: 0, y: Math.PI, z: 0 }, geometry: parts.leaf });
    addChild(node, frame, left, right);
    addChild(parent, node);
    if (wall) { const stone = createNode({ geometry: parts.wall }); addChild(node, stone); solids?.add(stone); }
    if (solids) solids.add(frame);
    let k = 0, opening = false, swing = 1;
    const pose = () => {
      const e = smooth(k) * swing;
      left.rotation.y = -OPEN * e;
      right.rotation.y = Math.PI + OPEN * e;
    };
    // Which way they open next, for someone heading along +z (1) or -z (-1): only shut can they change.
    const away = (heading) => { if (k === 0) swing = heading; };
    const update = (dt, open) => {
      opening = open;
      const was = k;
      k = clamp(k + (open ? dt : -dt) / OPEN_S, 0, 1);
      if (k !== was) pose();
    };
    const set = (open) => { opening = open; k = open ? 1 : 0; pose(); };
    return { node, frame, left, right, update, set, away, get k() { return k; }, get open() { return k > 0.65; }, get opening() { return opening; } };
  };

  // Taking a visitor through, as the Timechain Sphere's doorway does: as the doors open the view swoops into the Ooga's
  // own eyes (`view`, once the camera is final for the frame) and stays there through the doorway, so the other scene
  // takes over from that same eye as it reaches the doors, and goes on from it until the Ooga has walked `ARRIVE` metres
  // past them, when the doors close behind it and the view glides back out to the visitor's own. `frame` is the door's
  // in the world (x, z, sr, cr of its turn, and `plane`, how far along it the door's plane stands from there); `sign` is
  // the way through (-1 going in along -z, +1 going out); `prepare()` readies what lies beyond (a promise or null) and
  // `onThrough(crossing)` is the switch to the other scene. With `shut` that switch comes as soon as the view is in the
  // Ooga's eyes, these doors never opening: the other scene needs its own copy of this side of them.
  const walk = ({ door, frame: F, sign, pilot, crew, camera, prepare, onThrough, onState = () => {}, followMin = 3, shut = false }) => {
    const state = { phase: "idle", wanted: false, x: 0, z: 0, seen: false, t: 0, cave: null, ready: false, failed: false, busy: false, settle: false, yaw: 0, dist: 4.5,
      lens: null, glide: 1, heading: 0, focused: false, from: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, to: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, fromFov: 0, pitch: 0, head: null };
    const set = (phase) => { if (state.phase !== phase) { state.phase = phase; onState(phase); } };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // The eye as the pilot's first person places it, looking straight down the way through, so the view held here and
    // the one the other scene takes over are the same view whichever way the Ooga was still turning.
    const eyePose = (cave, out) => {
      const p = cave.root.position, heading = state.heading, ahead = 0.16 * cave.traits.height * Math.cos(state.pitch);
      out.x = p.x + Math.sin(heading) * ahead; out.z = p.z + Math.cos(heading) * ahead;
      out.y = p.y - cave.baseY + cave.headOffset * 0.95 + cave.viewLift;
      out.yaw = heading; out.pitch = state.pitch;
    };
    const readPose = (out) => {
      const p = camera.position, t = camera.target, dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;
      out.x = p.x; out.y = p.y; out.z = p.z; out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    };
    const putPose = (a, b, k) => {
      const e = smooth(k), yaw = a.yaw + wrap(b.yaw - a.yaw) * e, pitch = a.pitch + (b.pitch - a.pitch) * e, cp = Math.cos(pitch), p = camera.position, t = camera.target;
      p.x = a.x + (b.x - a.x) * e; p.y = a.y + (b.y - a.y) * e; p.z = a.z + (b.z - a.z) * e;
      t.x = p.x + Math.sin(yaw) * cp; t.y = p.y + Math.sin(pitch); t.z = p.z + Math.cos(yaw) * cp;
      camera.up = null;
      return e;
    };
    const hideHead = (cave, on) => {
      if (on && !state.head) { state.head = { node: cave.parts.head, was: cave.parts.head.cameraHidden }; cave.parts.head.cameraHidden = true; }
      else if (!on && state.head) { state.head.node.cameraHidden = state.head.was; state.head = null; }
    };
    const lens = (name) => { readPose(state.from); state.fromFov = camera.fov; state.lens = name; state.glide = REDUCED.matches ? 1 : 0; };
    // Lets the Ooga go: the controls back, and the view gliding out from the eyes to the visitor's own.
    const letGo = (cave) => {
      crew.steer(0, 0, 0, 0, 0);
      hideHead(cave, false);
      pilot.setExternalControl(false);
      lens("back");
      const p = cave.root.position;
      pilot.navigate({ position: { x: p.x, y: p.y - cave.baseY, z: p.z }, yaw: cave.root.rotation.y + Math.PI, pitch: LET_GO_PITCH, dist: followMin });
      // Mouse-look, if the walk took it away.
      if (state.focused) pilot.focusAim();
      state.focused = false;
    };
    // Called once the camera is final for the frame.
    const view = (dt) => {
      const cave = state.cave;
      if (state.lens === "eyes" && cave) {
        state.glide = Math.min(1, state.glide + dt / GLIDE);
        eyePose(cave, state.to);
        const e = putPose(state.from, state.to, state.glide), fov = pilot.eyeFov();
        camera.fov = state.fromFov ? state.fromFov + (fov - state.fromFov) * e : fov;
        if (state.glide > 0.5) hideHead(cave, true);
      } else if (state.lens === "back") {
        state.glide = Math.min(1, state.glide + dt / GLIDE);
        readPose(state.to);
        const fov = camera.fov, e = putPose(state.from, state.to, state.glide);
        camera.fov = state.fromFov + (fov - state.fromFov) * e;
        if (state.glide >= 1) state.lens = null;
      }
    };
    // The switch to the other scene; the crossing says where the Ooga stands to these doors and how it left them.
    const handOver = (player, across, d) => {
      crew.steer(0, 0, 0, 0, 0);
      set("through");
      if (onThrough({ across, past: -d, pitch: state.pitch, dist: state.dist, shut, focused: state.focused }) === false) { letGo(player); set("idle"); state.wanted = false; }
    };
    const load = () => {
      if (state.ready || state.busy) return;
      state.busy = true; state.failed = false;
      set("loading");
      let loading;
      try { loading = prepare(); }
      catch (error) { state.busy = false; state.failed = true; set("failed"); return; }
      const finish = () => { state.busy = false; state.ready = true; if (state.phase === "loading") set("idle"); };
      if (loading && loading.then) loading.then(finish, () => { state.busy = false; state.failed = true; set("failed"); });
      else finish();
    };
    // Space at the doors, or a retry after a failed load.
    const ask = () => { state.wanted = true; if (!state.ready && !state.busy) load(); };
    const update = (dt, player) => {
      if (!player) { state.seen = false; if (state.phase !== "idle" && state.phase !== "loading" && state.phase !== "failed") set("idle"); return; }
      const p = player.root.position, along = (p.x - F.x) * F.sr + (p.z - F.z) * F.cr - F.plane, across = (p.x - F.x) * F.cr - (p.z - F.z) * F.sr, d = -sign * along;
      const eye = camera.position, eyeAlong = (eye.x - F.x) * F.sr + (eye.z - F.z) * F.cr - F.plane;
      if (state.phase === "arriving") {
        state.t += dt;
        // The doors stay open until the view has come through them, and the walk until it has too. Handed over with
        // them shut, the Ooga waits at them until they have begun to part.
        const viewPast = -sign * eyeAlong;
        door.update(dt, viewPast < VIEW_CLEAR);
        if (door.k < GRACE && d < 0 && d > -TOUCH) { crew.steer(0, 0, 0, 0, 0); return; }
        const to = -sign * (state.stopAt + AHEAD) + F.plane;
        const dx = F.x + F.sr * to + F.cr * across * 0.5 - p.x, dz = F.z + F.cr * to - F.sr * across * 0.5 - p.z, m = Math.hypot(dx, dz) || 1;
        crew.steer(dx / m, dz / m, 0, 1, 0, SPEED);
        if (d >= state.stopAt && viewPast >= VIEW_CLEAR || state.t > LIMIT) { letGo(player); state.settle = true; set("idle"); }
        return;
      }
      if (state.settle) {
        const a = pilot.controls.read();
        if (a.x || a.y) crew.steer(0, 0, 0, 0, 0);
        else state.settle = false;
        door.update(dt, false);
        return;
      }
      if (state.phase === "opening" || state.phase === "walking") {
        state.t += dt;
        const moved = Math.hypot(p.x - state.x, p.z - state.z);
        if (player !== state.cave || moved > 1.2 || state.t > LIMIT) { letGo(state.cave || player); set("idle"); state.wanted = false; door.update(dt, false); return; }
        state.x = p.x; state.z = p.z;
        door.update(dt, !shut);
        if (shut && state.glide >= 1) { handOver(player, across, d); return; }
        // It walks up from wherever it stands while the doors open, stopping only if it reaches them still shut.
        if (state.phase === "opening") {
          if (door.k < GRACE && d < TOUCH) { crew.steer(0, 0, 0, 0, 0); return; }
          if (door.k >= GRACE) set("walking");
        }
        const to = F.plane + sign * AHEAD + along, side = across * 0.4;
        const dx = F.x + F.sr * to + F.cr * side - p.x, dz = F.z + F.cr * to - F.sr * side - p.z, m = Math.hypot(dx, dz) || 1;
        crew.steer(dx / m, dz / m, 0, 1, 0, SPEED);
        // The other scene takes over from this eye just before it reaches the doors.
        if (state.glide >= 1 && -sign * eyeAlong <= HAND) handOver(player, across, d);
        return;
      }
      if (state.phase === "through") { door.update(dt, !shut); return; }
      const near = d > -0.4 && d < FAR && Math.abs(across) < AM.DOOR.half + 0.7;
      const moved = state.seen ? Math.hypot(p.x - state.x, p.z - state.z) : 0, inward = state.seen && moved < Math.max(0.5, dt * 12) ? ((-sign * ((state.x - F.x) * F.sr + (state.z - F.z) * F.cr - F.plane)) - d) / Math.max(dt, 1e-3) : 0;
      state.x = p.x; state.z = p.z; state.seen = true;
      if (near && !state.ready && !state.busy && !state.failed) load();
      const atDoor = near && d < TOUCH;
      // Walking into doors still readying is asking to go through: stopped against them nothing else would say so.
      if (state.busy && atDoor && inward > 0.2) state.wanted = true;
      if (state.ready && near && Math.abs(across) < WALK_HALF && (state.wanted || atDoor && inward > 0.2) && Math.abs(p.y - player.baseY - (F.floor || 0)) < 0.3) {
        state.wanted = false;
        state.t = 0; state.cave = player; state.dist = pilot.orbit.dist; state.pitch = 0; state.heading = Math.atan2(sign * F.sr, sign * F.cr);
        state.focused = pilot.captureControl({}).focused;
        door.away(sign);
        pilot.setExternalControl(true);
        lens("eyes");
        set("opening");
      } else if (!near) state.wanted = state.failed = false;
      door.update(dt, false);
    };
    // Coming in on the far side: at the eye the other scene left off from, and on from there.
    const arrive = (crossing, player, yaw) => {
      player.root.rotation.y = yaw + Math.PI;
      // Far enough on that the view handed back, at its nearest behind the Ooga, stands clear of the doors.
      Object.assign(state, { t: 0, cave: player, yaw, heading: yaw + Math.PI, focused: !!crossing.focused, ready: true, seen: false, dist: crossing.dist, pitch: crossing.pitch, lens: "eyes", glide: 1, fromFov: 0, stopAt: Math.max(ARRIVE, followMin * Math.cos(LET_GO_PITCH) + CLEAR_BACK) });
      door.set(false);
      door.away(-sign);
      if (!crossing.shut) door.set(true);
      pilot.setExternalControl(true);
      hideHead(player, true);
      set("arriving");
    };
    const reset = () => {
      state.wanted = state.seen = state.settle = false; state.busy = false; state.lens = null;
      if (state.cave) { hideHead(state.cave, false); pilot.setExternalControl(false); }
      set("idle");
    };
    return { state, update, view, ask, arrive, reset, load, get phase() { return state.phase; }, get holding() { return state.phase === "opening" || state.phase === "walking" || state.phase === "through" || state.phase === "arriving"; } };
  };

  BL.arcadeDoors = { create, walk, ARRIVE, WALK_HALF };
})();
