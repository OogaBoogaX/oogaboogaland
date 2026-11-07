// The Lightning Jet Hangar's overhead crane at work: LJ-02 (`hangarModels.CRANE`, `crane`) moves its crate between the
// two laydown stands as an operator runs a crane, one motion at a time. From where it parks over the first stand, hook
// up, it brings its trolley and bridge over the crate and lowers the hook to just above it; the rigger hooks the sling
// on (`RIG`), and the hook rises slowly as the sling's legs draw tight; held taut a moment (`TAKE`), the crate is lifted
// off the stand at a creep (`CREEP` metres) and then to its carrying height. The trolley crosses the hall only at the
// door end, where nothing stands under it but the runway, and the bridge runs down the hall only over the crew's side,
// so the load never passes over the Jet. Over the other stand it waits for the load to stop swinging (`SETTLE` at most),
// lowers it and creeps it onto the stand, lowers the hook on until the sling lies slack, the sling is unhooked, and the
// hook goes back up and the crane comes home to park. A while later it fetches the crate back (`WAIT`, sooner the first
// time in a visit).
//
// Every motion speeds up and slows down smoothly (`SPEED`, `ACCEL`), and the load swings as a pendulum from the
// trolley's sheaves as the trolley and bridge speed up and slow down, damped, steadied by hand near the stand.
//
// While a job runs the warning beacons on the bridge's ends turn (`BEACON`), each flashing as its reflector passes the
// view, and its blue safety spot lights the floor under the hook (`SPOT`, `beam`: where it is and how bright, for the
// scene's spot light, and on Canvas 2D its `spot` picture on the floor, if it is given one). In a blackout (`powered`
// false) its brakes set at once and everything stops where it is (`BRAKE`), the load swinging on, the beacons and the
// spot dark, until the power is back and it carries on. And it never moves its load over anyone: while anything that
// walks the hall stands under the load, or where the load would come to rest if it stopped now, it stops
// and holds (`HOLD`), and carries on once they have been clear a moment. It sounds its horn before it sets off on a
// job and every few seconds while it holds for someone (`HORN`), and its travel alarm beeps while the bridge or the
// trolley moves (`sound.alarm`).
//
// `create({ C, nodes, root, cue, powered, under })` takes the crane's nodes (its bridge, trolley, the `pivot` the ropes
// and hook hang from, the ropes, the hook, the crate, and on it the taut sling and the slack one, its `beacons` and,
// where the renderer has no spot light to spare, the floor's `spot` picture), the scene's root, whether the hall has power (`powered()`), whether anything that walks stands within
// `reach` of the line from (ax, az) to (bx, bz) lower than `bottom` (`under(ax, az, bx, bz, reach, bottom)`) and where
// its sound's cues go (`cue(name, x, y, z)`: `brake` as a motion starts and stops,
// `rattle` as the sling is hooked on or off, `lift` as the ropes take the crate's weight, `land` as it is set down, `horn`
// as it warns), and
// returns `update(dt, eye)` (`eye` the view's position, for the beacons' flash), `sound` (where its trolley is and how
// fast its travel and its hoist run, 0 to 1, and whether its travel alarm sounds, kept current for
// `hangarAudio.watchCrane`), `beam` (its spot's place under the hook, `y` the crate's bottom while it hangs on the hook,
// else the rail's height, and its level, 0 to 1) and `debug`. Allocates nothing a
// frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { addChild, removeChild } = BL.scene;

  // How fast each motion runs at most (m/s): the hoist fast, slower while the sling draws tight or goes slack, and at a
  // creep over the last `CREEP` metres onto a stand and off it; how hard each speeds up and slows down (m/s²); how far
  // above the crate's top the hook's eye comes for the rigger (`REACH`); the pauses (s): hooking or unhooking the
  // sling, holding it taut before the lift, the longest wait for the load to settle, and the wait between jobs, the
  // first a visit sooner.
  const SPEED = { bridge: 0.8, trolley: 0.6, hoist: 0.4, slack: 0.15, creep: 0.06 };
  const ACCEL = { bridge: 0.2, trolley: 0.18, hoist: 0.35 };
  // How hard the brakes stop each motion when the power goes (m/s²).
  const BRAKE = { bridge: 1, trolley: 1, hoist: 1.5 };
  // Holding for someone under the load: how far from the hook's line a body's edge counts as under it (the crate's
  // corners and a margin, m), and how long they must have been clear before it carries on (s).
  const HOLD = { reach: 1.2, clear: 1.5 };
  // The horn: the pause after it before a job sets off, and how often it sounds while the crane holds (s).
  const HORN = { wait: 1.5, every: 3 };
  const CREEP = 0.4, REACH = 0.3, RIG = 3, TAKE = 1.5, SETTLE = 6, WAIT = [30, 60], FIRST = [6, 12];
  // The swing: gravity, its damping, and stronger damping within `STEADY` metres of the stand, where the riggers'
  // hands are on it; still enough to set down below `STILL` radians.
  const G = 9.81, DAMP = 0.2, STEADY = 1, STEADY_DAMP = 1.2, STILL = 0.004;
  // The beacons: their dome's glow at rest and turning, how bright and how narrow the flash as a reflector passes the
  // view, and how fast they turn (rad/s); the spot: how high over the floor it lies and how fast it comes on and goes off
  // (a second).
  const BEACON = { off: 0.2, on: 0.6, flash: 2.6, sharp: 8, rate: 7 };
  const SPOT = { y: 0.03, fade: 2.5 };
  // How long the hook block is from the ropes' ends to its eye.
  const BLOCK = 0.6;
  // A step's kinds.
  const BRIDGE = 1, TROLLEY = 2, HOIST = 3, PAUSE = 4, TIE = 5, LIFT = 6, LAND = 7, UNTIE = 8, CALM = 9, WAITING = 10, WARN = 11;
  const NAMES = ["", "bridge", "trolley", "hoist", "pause", "tie", "lift", "land", "untie", "settle", "wait", "horn"];

  const create = ({ C, nodes, root, cue, powered, under }) => {
    const { bridge, trolley, pivot, ropes, hook, sling, crate, slack, beacons, spot } = nodes;
    const ch = C.crate[1], lane = C.park.z;
    // The rope's length with the crate on a stand under it and its sling taut, with the hook just above the crate,
    // carrying, and with the hook up.
    const lowest = C.railY + C.ropeTop + C.eye - C.sling - ch - C.standTop, low = lowest + C.sling - REACH;
    const carried = C.railY + C.ropeTop + C.eye - C.sling - ch - C.carry, up = C.rope;
    const axes = { bridge: { p: C.park.z, v: 0, a: 0 }, trolley: { p: C.park.x, v: 0, a: 0 }, hoist: { p: up, v: 0, a: 0 } };
    const sway = { x: 0, wx: 0, z: 0, wz: 0 };
    const steps = Array.from({ length: 32 }, () => ({ kind: 0, to: 0, max: 0 }));
    const state = { n: 0, i: 0, t: 0, at: 0, tied: false, loaded: false, jobs: 0, began: false, live: true, stopped: false, held: false, clear: 0, holds: 0, horn: 0 };
    const sound = { x: 0, y: C.railY + 1, z: 0, travel: 0, hoist: 0, alarm: false };
    let count = 0, sweep = 0, lit = 0;
    const beam = { x: 0, y: 0, z: 0, level: 0 };
    const push = (kind, to = 0, max = 0) => { const s = steps[count++]; s.kind = kind; s.to = to; s.max = max; };
    // The way from (x, z) to (tx, tz): along the hall only over a stand's column, across it only at the door end.
    const route = (x, z, tx, tz) => {
      if (z !== lane && x !== tx) push(BRIDGE, lane);
      if (x !== tx) push(TROLLEY, tx);
      if ((x !== tx ? lane : z) !== tz) push(BRIDGE, tz);
    };
    // A job: the crate from the stand it is on to the other one, and home.
    const plan = () => {
      const from = C.stands[state.at], to = C.stands[1 - state.at];
      count = 0;
      push(WARN);
      push(PAUSE, HORN.wait);
      route(C.park.x, C.park.z, from[0], from[1]);
      push(CALM);
      push(HOIST, low, SPEED.hoist);
      push(PAUSE, RIG);
      push(TIE);
      push(HOIST, lowest, SPEED.slack);
      push(PAUSE, TAKE);
      push(LIFT);
      push(HOIST, lowest - CREEP, SPEED.creep);
      push(HOIST, carried, SPEED.hoist);
      route(from[0], from[1], to[0], to[1]);
      push(CALM);
      push(HOIST, lowest - CREEP, SPEED.hoist);
      push(HOIST, lowest, SPEED.creep);
      push(LAND);
      push(HOIST, low, SPEED.slack);
      push(PAUSE, RIG);
      push(UNTIE);
      push(HOIST, up, SPEED.hoist);
      route(to[0], to[1], C.park.x, C.park.z);
      push(WAITING, WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]));
      state.n = count;
      state.i = 0;
      state.t = 0;
    };
    // One axis toward `to` at no more than `max`, speeding up and slowing down by `acc`: true once it is there.
    const move = (m, to, max, acc, dt) => {
      const d = to - m.p;
      if (Math.abs(d) < 0.002 && Math.abs(m.v) < 0.03) { m.p = to; m.v = 0; return true; }
      const want = Math.sign(d) * Math.min(max, Math.sqrt(2 * acc * Math.abs(d)));
      const dv = Math.max(-acc * dt, Math.min(acc * dt, want - m.v));
      m.v += dv;
      m.a = dv / dt;
      m.p += m.v * dt;
      if ((to - m.p) * d <= 0) { m.p = to; m.v = 0; return true; }
      return false;
    };
    // Every motion brought to a stop at `rate`'s pace, where it is.
    const stop = (m, rate, dt) => {
      const dv = Math.max(-rate * dt, Math.min(rate * dt, -m.v));
      m.v += dv;
      m.a = dv / dt;
      m.p += m.v * dt;
    };
    const halt = (rate, dt) => {
      stop(axes.bridge, rate.bridge, dt);
      stop(axes.trolley, rate.trolley, dt);
      stop(axes.hoist, rate.hoist, dt);
    };
    // The crate on the stand under the hook, or on the hook.
    const standOn = (s) => {
      if (crate.parent) removeChild(crate.parent, crate);
      crate.position.x = s[0]; crate.position.y = C.standTop + ch + C.sling; crate.position.z = s[1] + 0.1;
      addChild(root, crate);
    };
    const onHook = () => {
      removeChild(crate.parent, crate);
      crate.position.x = 0; crate.position.y = C.eye; crate.position.z = 0.1;
      addChild(hook, crate);
    };
    const still = () => { sway.x = sway.wx = sway.z = sway.wz = 0; };
    // Where everything stands, from the axes and the swing; while the crate stands tied on a stand, its sling's legs
    // reach from the crate's top up to the hook's eye.
    const pose = () => {
      bridge.position.z = axes.bridge.p;
      trolley.position.x = axes.trolley.p - C.cx;
      ropes.scale.y = axes.hoist.p;
      hook.position.y = -axes.hoist.p;
      pivot.rotation.z = sway.x;
      pivot.rotation.x = -sway.z;
      const e = state.tied && !state.loaded ? lowest - axes.hoist.p : 0;
      sling.position.y = e;
      sling.scale.y = 1 + e / C.sling;
      sound.x = axes.trolley.p;
      sound.z = axes.bridge.p;
      sound.travel = state.live ? Math.max(Math.abs(axes.bridge.v) / SPEED.bridge, Math.abs(axes.trolley.v) / SPEED.trolley) : 0;
      sound.hoist = state.live ? Math.abs(axes.hoist.v) / SPEED.hoist : 0;
      sound.alarm = state.live && (Math.abs(axes.bridge.v) > 0.01 || Math.abs(axes.trolley.v) > 0.01);
    };
    // A cue where the trolley is, or down at the crate on the stand under it.
    const at = (name, low) => cue(name, axes.trolley.p, low ? C.standTop + ch : C.railY + 1, axes.bridge.p);
    const moving = (kind) => kind === BRIDGE || kind === TROLLEY || kind === HOIST;
    // A frame of step `s`: true once it is done.
    const run = (s, dt) => {
      const B = axes.bridge, T = axes.trolley, H = axes.hoist;
      if (s.kind === BRIDGE) return move(B, s.to, SPEED.bridge, ACCEL.bridge, dt);
      if (s.kind === TROLLEY) return move(T, s.to, SPEED.trolley, ACCEL.trolley, dt);
      if (s.kind === HOIST) return move(H, s.to, s.max, ACCEL.hoist, dt);
      if (s.kind === PAUSE || s.kind === WAITING) return (state.t += dt) >= s.to;
      if (s.kind === CALM) return (state.t += dt) >= SETTLE || Math.abs(sway.x) + Math.abs(sway.z) < STILL && Math.abs(sway.wx) + Math.abs(sway.wz) < STILL;
      if (s.kind === TIE) { state.tied = true; sling.visible = true; slack.visible = false; still(); at("rattle", true); }
      else if (s.kind === LIFT) { onHook(); state.loaded = true; still(); at("lift"); }
      else if (s.kind === LAND) { state.at = 1 - state.at; standOn(C.stands[state.at]); state.loaded = false; still(); at("land", true); }
      else if (s.kind === UNTIE) { state.tied = false; sling.visible = false; slack.visible = true; at("rattle", true); }
      else if (s.kind === WARN) at("horn");
      return true;
    };
    // The crate starts on the first stand, its sling slack, the crane parked over it with its hook up.
    standOn(C.stands[0]);
    sling.visible = false;
    slack.visible = true;
    count = 0;
    push(WAITING, FIRST[0] + Math.random() * (FIRST[1] - FIRST[0]));
    state.n = count;
    pose();
    if (spot) {
      spot.position.y = SPOT.y;
      spot.visible = false;
    }

    const update = (dt, eye) => {
      if (dt <= 0) return;
      const B = axes.bridge, T = axes.trolley, H = axes.hoist;
      B.a = T.a = H.a = 0;
      const s = steps[state.i];
      // The power gone, the brakes set on the motor that runs, and nothing goes on until it is back.
      const live = powered();
      if (live !== state.live) {
        state.live = live;
        if (!live && moving(s.kind) && state.began) { at("brake"); state.began = false; state.stopped = true; }
      }
      // Anyone under the load, where it hangs or where it would come to rest if it stopped now: it holds until they have
      // been clear a moment, its brakes set on the motor that ran.
      if (live && state.loaded && moving(s.kind)) {
        const x = T.p, z = B.p + 0.1, stopX = T.v * Math.abs(T.v) / (2 * ACCEL.trolley), stopZ = B.v * Math.abs(B.v) / (2 * ACCEL.bridge);
        if (under(x, z, x + stopX, z + stopZ, HOLD.reach, C.railY + C.ropeTop - H.p + C.eye - C.sling - ch)) {
          state.clear = 0;
          if (!state.held) { state.held = true; state.holds++; state.horn = 0; if (state.began) { at("brake"); state.began = false; state.stopped = true; } }
        } else if (state.held && (state.clear += dt) >= HOLD.clear) state.held = false;
      } else state.held = false;
      // Holding, the horn every few seconds, the first at once.
      if (state.held && (state.horn -= dt) <= 0) { state.horn = HORN.every; at("horn"); }
      let done = false;
      if (!live) halt(BRAKE, dt);
      else if (state.held) halt(ACCEL, dt);
      else {
        // The brake lets go as a motion starts, unless the same motor ran the step before and has not stopped since.
        if (!state.began) {
          state.began = true;
          if (moving(s.kind) && (state.stopped || state.i === 0 || steps[state.i - 1].kind !== s.kind)) at("brake");
          state.stopped = false;
        }
        done = run(s, dt);
      }
      if (done) {
        // The brake sets as a motion stops, unless the same motor runs the next step.
        if (moving(s.kind) && (state.i + 1 >= state.n || steps[state.i + 1].kind !== s.kind)) at("brake");
        state.t = 0;
        state.began = false;
        if (++state.i >= state.n) { plan(); state.jobs++; }
      }
      // The swing, a few substeps a frame: the trolley swings it across the hall, the bridge along it.
      const L = H.p + BLOCK + (state.loaded ? C.sling + ch / 2 : 0), k = G / L, damp = lowest - H.p < STEADY ? STEADY_DAMP : DAMP;
      const n = Math.ceil(dt * 120), h = dt / n;
      for (let i = 0; i < n; i++) {
        sway.wx += (-k * sway.x - T.a / L - damp * sway.wx) * h;
        sway.x += sway.wx * h;
        sway.wz += (-k * sway.z - B.a / L - damp * sway.wz) * h;
        sway.z += sway.wz * h;
      }
      pose();
      // The beacons and the spot while a job runs and the power is on.
      const working = live && steps[state.i].kind !== WAITING;
      if (working) sweep += BEACON.rate * dt;
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        b.rotation.y = sweep + i * Math.PI / 2;
        if (!working) { b.glow = live ? BEACON.off : 0; continue; }
        const m = b.world, vx = eye.x - m[12], vz = eye.z - m[14];
        const facing = Math.abs((m[0] * vx + m[2] * vz) / ((Math.hypot(m[0], m[2]) * Math.hypot(vx, vz)) || 1));
        b.glow = BEACON.on + BEACON.flash * facing ** BEACON.sharp;
      }
      lit = Math.max(0, Math.min(1, lit + (working ? dt : -dt) * SPOT.fade));
      beam.x = axes.trolley.p;
      beam.y = state.loaded ? C.railY + C.ropeTop - axes.hoist.p + C.eye - C.sling - ch : C.railY;
      beam.z = axes.bridge.p + 0.1;
      beam.level = lit;
      if (spot) {
        spot.visible = lit > 0;
        spot.smokeOpacity = lit;
        spot.position.x = beam.x;
        spot.position.z = beam.z;
      }
    };

    // `run()` starts the next job now if the crane is waiting.
    const debug = {
      get phase() { return NAMES[steps[state.i].kind]; },
      get step() { return state.i; },
      get jobs() { return state.jobs; },
      get loaded() { return state.loaded; },
      get tied() { return state.tied; },
      get at() { return state.at; },
      get bridge() { return axes.bridge.p; },
      get trolley() { return axes.trolley.p; },
      get rope() { return axes.hoist.p; },
      get sway() { return Math.hypot(sway.x, sway.z); },
      get spot() { return lit; },
      get live() { return state.live; },
      get held() { return state.held; },
      get holds() { return state.holds; },
      run() { if (steps[state.i].kind === WAITING) state.t = steps[state.i].to; }
    };
    return { update, sound, beam, debug };
  };

  BL.hangarCrane = { create, SPEED, ACCEL };
})();
