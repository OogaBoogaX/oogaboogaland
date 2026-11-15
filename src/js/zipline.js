// Ziplines: a cable slung from a high top down to a drop-off, ridden by the Ooga a page drives. The island (hub-zipline.js
// places it, from a Mempool rainforest treetop back over the water to the Headquarters ramp) and DSB Land (from the summit's Portara
// down into the Chora) each build one; the geometry is zipline-models.js.
//
// `line(a, b, sag, stopX, stopZ)` is the cable between its two eyes, sagging `sag` at its middle (`cableAt` reads it,
// the parameter running along the level chord), the ride ending above (stopX, stopZ). `survey(line, grabS, q)` walks it
// every `SAMPLE` metres with the scene's queries (`support(x, z, y)` the floor under a point, `clear(x, y, z, r, h)`
// room for a body there, `landable(x, y, z)` the scene's word on a floor): `blocked` counts samples where the tallest
// Ooga hanging from the bar would touch anything, `safe` marks the ground that may be dropped onto (checked, level,
// clear up to the hands and at most `DROP_MAX` below the feet), and the ride ends at the last safe sample. Nothing in a
// survey touches the scene: it claims no ground and draws no random number, so seeded placements never move for it.
//
// `create(opts)` stands it in a scene: its top, bottom, cable and trolley nodes under `root`, and the rider. At the top
// the visitor gets `actionFor`'s GRAB (Space, or the act button on a touch screen, through `use`); the Ooga jumps up
// to the bar, hangs from it and rides down, easing up to speed and braking into the end, where it drops onto the
// surveyed floor and stands there as `crew.relocatePlayer` leaves it. Riding, LETGO drops it where it is if that ground
// is safe, else HOLD says to hold on. The crew calls `pose` every frame for every Ooga (the scenes' `residentPose`),
// which takes over the rider alone. The room hears nothing new: other pages see the body ride through its ordinary
// pose, and `poseRemote` hangs their copy from the bar when it is on the line. `setGameMode` puts the whole line
// away (the island hides the Mempool island for an event, and its top with it) and refuses rides, setting a rider
// down at the end. Reduced motion rides slower at a steady speed, without the
// legs swinging. Frame work allocates nothing.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild, removeChild } = BL.scene;
  const { clamp } = BL.math;
  // Metres and seconds. REACH is the hands over the feet, arms straight up, in body heights, up to HANG_MAX: a taller
  // Ooga tucks its legs up instead. PLAN_HANG and PLAN_R are the body a survey keeps clear; GRAB_R and GRAB_RISE how
  // near the parked bar the feet must be.
  const SAMPLE = 0.5, REACH = 0.98, HANG_MAX = 1.75, PLAN_HANG = 1.8, PLAN_R = 0.4, CLEAR_FROM = 1.2;
  // Anywhere on the top's footing (`DRESSES[...].footing`, local metres) with the feet within GRAB_LOW below to
  // GRAB_RISE above its foot is at the bar: jetpack on or off, standing or a hop off the boards.
  const GRAB_LOW = 0.3, GRAB_RISE = 0.8, LIFT_S = 0.3, LET_GO_FROM = 1.5;
  const SPEED = 12, EASE_S = 1.6, BRAKE = 5, ARRIVE = 1.2;
  const CALM = { speed: 5, ease: 0.3, brake: 3 };
  const DROP_MAX = 4.5, GRAVITY = 14;
  const IDLE = 0, LIFT = 1, RIDE = 2, FALL = 3, PHASES = { IDLE, LIFT, RIDE, FALL };
  const TROLLEY = () => BL.ziplineModels.TROLLEY;

  const line = (a, b, sag, stopX, stopZ) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    return { ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, sag, len, ux, uz, yaw: Math.atan2(ux, uz),
      stop: (stopX - a.x) * ux + (stopZ - a.z) * uz };
  };
  // The cable's point at `t` (0 at a, 1 at b) along the level chord, into `out`.
  const cableAt = (l, t, out) => {
    out.x = l.ax + (l.bx - l.ax) * t;
    out.y = l.ay + (l.by - l.ay) * t - l.sag * 4 * t * (1 - t);
    out.z = l.az + (l.bz - l.az) * t;
    return out;
  };
  const AT = { x: 0, y: 0, z: 0 };
  const survey = (l, grabS, q) => {
    const n = Math.floor((l.stop - grabS) / SAMPLE) + 1, floor = new Float32Array(n), safe = new Uint8Array(n);
    let blocked = 0, end = -1;
    for (let i = 0; i < n; i++) {
      const s = grabS + i * SAMPLE;
      cableAt(l, s / l.len, AT);
      const feet = AT.y - TROLLEY() - PLAN_HANG;
      if (s >= grabS + CLEAR_FROM && !q.clear(AT.x, feet, AT.z, PLAN_R, PLAN_HANG)) blocked++;
      const f = floor[i] = q.support(AT.x, AT.z, feet);
      safe[i] = s >= grabS + LET_GO_FROM && Number.isFinite(f) && feet - f > -0.05 && feet - f <= DROP_MAX
        && q.clear(AT.x, f + 0.05, AT.z, PLAN_R, AT.y - TROLLEY() - f) && q.landable(AT.x, f, AT.z) ? 1 : 0;
      if (safe[i]) end = i;
    }
    const s = grabS + Math.max(end, 0) * SAMPLE;
    cableAt(l, s / l.len, AT);
    // The ride ends at the line's own stop: a survey whose last sample cannot be dropped onto is not ok.
    return { n, floor, safe, blocked, end, ok: blocked === 0 && end === n - 1, landing: { x: AT.x, y: end >= 0 ? floor[end] : NaN, z: AT.z } };
  };
  // A local offset (x, z) turned by `yaw` as a node's rotation.y turns it.
  const turn = (x, z, yaw, out) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    out.x = x * c + z * s; out.z = -x * s + z * c;
    return out;
  };
  // The top's foot at `top`, the drop-off at (stopX, stopZ) and, unless `bottomEye` is given (an eye in rock), the
  // bottom standing `bottomGap` past the drop-off: the line, where the visitor stands to grab and where the parts go.
  const layout = (dressName, top, stopX, stopZ, sag, { bottomEye = null, bottomGap = 1, bottomGround = null } = {}) => {
    const dress = BL.ziplineModels.DRESSES[dressName], yaw = Math.atan2(stopX - top.x, stopZ - top.z), o = { x: 0, z: 0 };
    turn(dress.topEye.x, dress.topEye.z, yaw, o);
    const a = { x: top.x + o.x, y: top.y + dress.topEye.y, z: top.z + o.z };
    let b = bottomEye, bottomFoot;
    if (!b) {
      const ux = Math.sin(yaw), uz = Math.cos(yaw), fx = stopX + ux * bottomGap, fz = stopZ + uz * bottomGap;
      bottomFoot = { x: fx, y: bottomGround(fx, fz), z: fz };
      turn(dress.bottomEye.x, dress.bottomEye.z, yaw, o);
      b = { x: fx + o.x, y: bottomFoot.y + dress.bottomEye.y, z: fz + o.z };
    } else {
      turn(dress.bottomEye.x, dress.bottomEye.z, yaw, o);
      bottomFoot = { x: b.x - o.x, y: b.y - dress.bottomEye.y, z: b.z - o.z };
    }
    const l = line(a, b, sag, stopX, stopZ);
    turn(dress.grab.x, dress.grab.z, yaw, o);
    const stand = { x: top.x + o.x, z: top.z + o.z };
    return { dress: dressName, line: l, top, bottomFoot, stand, grabS: (stand.x - a.x) * l.ux + (stand.z - a.z) * l.uz };
  };
  // Frame code hands numbers on through scratch objects rather than as arguments, so nothing is boxed per frame.
  const SWING = { v: 0 };
  const armsUp = (cave) => {
    const p = cave.parts, swing = SWING.v, tuck = clamp((cave.bodyHeight * REACH - HANG_MAX) / 0.4, 0, 1) * -1.1;
    p.armL.quaternion = p.armR.quaternion = null;
    p.armL.rotation.x = p.armR.rotation.x = -2.95;
    p.armL.rotation.y = p.armR.rotation.y = 0;
    p.armL.rotation.z = -0.12; p.armR.rotation.z = 0.12;
    p.legL.rotation.x = 0.25 + swing + tuck; p.legR.rotation.x = -0.1 - swing + tuck;
    p.legL.rotation.z = p.legR.rotation.z = 0;
  };
  // `plan` is a `layout`; the scene surveys it through the returned `survey` once its collision holds the parts.
  // `landYaw` turns the Ooga to face a way of the scene's at the drop-off (the island's, down the ramp).
  // `speed` and `brake` (m/s, m/s²) tune a long line's thrill; reduced motion keeps its own slow steady pair.
  const create = ({ root, plan, crew, calm = false, landYaw = null, speed = SPEED, brake = BRAKE }) => {
    const dress = BL.ziplineModels.DRESSES[plan.dress], l = plan.line, models = BL.ziplineModels;
    const group = createNode({ sightHidden: true });
    const deck = dress.deck ? createNode({ geometry: dress.deck(), position: { x: plan.top.x, y: plan.top.y, z: plan.top.z }, rotation: { x: 0, y: l.yaw, z: 0 }, sightHidden: true }) : null;
    const top = createNode({ geometry: dress.top(), position: { x: plan.top.x, y: plan.top.y, z: plan.top.z }, rotation: { x: 0, y: l.yaw, z: 0 }, sightHidden: true });
    const bottom = createNode({ geometry: dress.bottom(), position: { x: plan.bottomFoot.x, y: plan.bottomFoot.y, z: plan.bottomFoot.z }, rotation: { x: 0, y: l.yaw, z: 0 }, sightHidden: true });
    const cable = createNode({ geometry: models.cable(l, plan.dress), sightHidden: true });
    const trolley = createNode({ geometry: models.trolley(plan.dress), rotation: { x: 0, y: l.yaw, z: 0 }, sightHidden: true });
    if (deck) addChild(group, deck);
    addChild(group, top); addChild(group, bottom); addChild(group, cable); addChild(group, trolley);
    addChild(root, group);
    const tune = calm ? CALM : { speed, ease: EASE_S, brake };
    const GRAB = { kind: "zipline", use: "grab" }, LETGO = { kind: "zipline", use: "letGo" }, HOLD = { kind: "zipline", use: "hold" };
    let surveyed = null, rider = null, gameMode = false;
    // The ride's numbers, written in place every frame: chord distance `s` and speed `v` along the line, the lift's
    // `timer`, the rider's `hang` (hands to feet), `feet`, the feet it jumped from, the fall's speed and floor.
    const R = { phase: IDLE, s: plan.grabS, v: 0, timer: 0, hang: 0, feet: 0, fromFeet: 0, fallV: 0, floor: 0, swingT: 0, endS: plan.grabS, standFloor: 0 };
    // `at` is the cable's point at chord distance `at.d` (`onCable`); `body` where the rider's feet go.
    const at = { d: 0, x: 0, y: 0, z: 0 }, spot = { d: 0, x: 0, y: 0, z: 0 }, remote = { d: 0, x: 0, y: 0, z: 0 }, body = { x: 0, y: 0, z: 0 };
    const onCable = (out) => {
      const t = out.d / l.len;
      out.x = l.ax + (l.bx - l.ax) * t;
      out.y = l.ay + (l.by - l.ay) * t - l.sag * 4 * t * (1 - t);
      out.z = l.az + (l.bz - l.az) * t;
    };
    const trolleyAt = () => {
      onCable(at);
      trolley.position.x = at.x; trolley.position.y = at.y; trolley.position.z = at.z;
    };
    at.d = plan.grabS; trolleyAt();
    const safeAt = (d) => {
      const i = Math.round((d - plan.grabS) / SAMPLE);
      return !!surveyed && i >= 0 && i < surveyed.n && surveyed.safe[i] === 1;
    };
    // Down onto the surveyed floor at sample `i`: the fall goes straight down from where the body hangs.
    const drop = (i) => {
      spot.d = plan.grabS + i * SAMPLE; onCable(spot);
      R.floor = surveyed.floor[i];
      R.fallV = 0; R.phase = FALL;
    };
    const land = () => {
      const cave = rider;
      rider = null; R.phase = IDLE; R.v = 0;
      if (cave === crew.player) crew.relocatePlayer({ x: spot.x, y: R.floor, z: spot.z }, landYaw === null ? l.yaw : landYaw);
      else {
        cave.root.position.x = spot.x; cave.root.position.y = R.floor + cave.baseY; cave.root.position.z = spot.z;
        cave.hop = cave.hopV = 0;
      }
      at.d = plan.grabS; trolleyAt();
    };
    // Straight to the end's floor: GAME MODE starting, the visit suspending or ending.
    const landNow = () => {
      if (!rider) return;
      spot.d = R.endS; onCable(spot);
      R.floor = surveyed.floor[surveyed.end];
      land();
    };
    const grab = (cave) => {
      if (rider || gameMode || !surveyed) return false;
      // From wherever on the footing, the Ooga steps to the bar first and jumps up to it from there.
      R.fromFeet = R.standFloor;
      if (cave === crew.player) crew.relocatePlayer({ x: plan.stand.x, y: R.standFloor, z: plan.stand.z }, l.yaw);
      else { cave.root.position.x = plan.stand.x; cave.root.position.y = R.standFloor + cave.baseY; cave.root.position.z = plan.stand.z; }
      spot.x = plan.stand.x; spot.z = plan.stand.z;
      rider = cave; R.phase = LIFT; R.timer = 0; R.s = plan.grabS; R.v = 0;
      R.hang = Math.min(HANG_MAX, cave.bodyHeight * REACH);
      return true;
    };
    const letGo = () => {
      if (R.phase !== RIDE || !safeAt(R.s)) return false;
      drop(Math.round((R.s - plan.grabS) / SAMPLE));
      return true;
    };
    const place = (cave) => {
      const r = cave.root;
      r.position.x = body.x; r.position.y = body.y + cave.baseY; r.position.z = body.z;
      r.rotation.x = r.rotation.z = 0; r.rotation.y = l.yaw;
      armsUp(cave);
      cave.parts.head.rotation.x = 0.15;
    };
    // The crew's per-Ooga hook: true while it holds `cave`, which then skips its walk, weapons and AI this frame.
    const pose = (cave, dt) => {
      if (cave !== rider) return false;
      if (R.phase === LIFT) {
        R.timer += dt;
        const u = Math.min(1, R.timer / LIFT_S), k = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        at.d = R.s; onCable(at);
        R.feet = R.fromFeet + (at.y - TROLLEY() - R.hang - R.fromFeet) * k;
        body.x = spot.x + (at.x - spot.x) * k; body.y = R.feet; body.z = spot.z + (at.z - spot.z) * k; SWING.v = 0;
        place(cave);
        if (k >= 1) R.phase = RIDE;
      } else if (R.phase === RIDE) {
        // Brisk eases up to speed; reduced motion ramps straight to its slow speed and holds it.
        R.v = calm ? Math.min(tune.speed, R.v + tune.speed * dt / tune.ease) : R.v + (tune.speed - R.v) * (1 - Math.exp(-dt / tune.ease));
        R.v = Math.min(R.v, Math.sqrt(ARRIVE * ARRIVE + 2 * tune.brake * Math.max(0, R.endS - R.s)));
        R.s = Math.min(R.endS, R.s + R.v * dt);
        at.d = R.s; onCable(at);
        R.feet = at.y - TROLLEY() - R.hang;
        R.swingT += dt * 3;
        body.x = at.x; body.y = R.feet; body.z = at.z; SWING.v = calm ? 0 : Math.sin(R.swingT) * 0.18 * R.v / tune.speed;
        place(cave);
        if (R.s >= R.endS) drop(surveyed.end);
      } else {
        R.fallV += GRAVITY * dt;
        R.feet = Math.max(R.floor, R.feet - R.fallV * dt);
        body.x = spot.x; body.y = R.feet; body.z = spot.z; SWING.v = 0;
        place(cave);
        cave.parts.legL.rotation.x = -0.5; cave.parts.legR.rotation.x = 0.35;
        if (R.feet <= R.floor) { land(); return true; }
      }
      at.d = R.s; trolleyAt();
      return true;
    };
    // Another page's Ooga on this line, by its ordinary pose: hanging from the bar where the room puts it.
    const poseRemote = (cave, feetY) => {
      const p = cave.root.position, dx = p.x - l.ax, dz = p.z - l.az;
      remote.d = dx * l.ux + dz * l.uz;
      if (remote.d < plan.grabS - 0.3 || remote.d > R.endS + 0.3 || Math.abs(dx * l.uz - dz * l.ux) > 0.45) return false;
      onCable(remote);
      if (Math.abs(remote.y - TROLLEY() - Math.min(HANG_MAX, cave.bodyHeight * REACH) - feetY) > 0.6) return false;
      SWING.v = 0;
      armsUp(cave);
      return true;
    };
    const footing = dress.footing, yc = Math.cos(l.yaw), ys = Math.sin(l.yaw);
    const near = (x, y, z) => {
      const dx = x - plan.top.x, dz = z - plan.top.z, lx = dx * yc - dz * ys, lz = dx * ys + dz * yc;
      return Math.abs(lx) <= footing.x && lz >= footing.z0 && lz <= footing.z1 && y >= plan.top.y - GRAB_LOW && y <= plan.top.y + GRAB_RISE;
    };
    return {
      group, deck, top, bottom, cable, trolley, plan, GRAB, LETGO, HOLD,
      get riding() { return rider; },
      get phase() { return R.phase; },
      get s() { return R.s; },
      get speed() { return R.v; },
      get endS() { return R.endS; },
      get standFloor() { return R.standFloor; },
      get surveyed() { return surveyed; },
      // The scene's queries, after its collision holds the top and bottom: false if the line may not be ridden.
      survey: (q) => {
        surveyed = survey(l, plan.grabS, q);
        R.endS = plan.grabS + Math.max(surveyed.end, 0) * SAMPLE;
        R.standFloor = q.support(plan.stand.x, plan.stand.z, plan.top.y + 1.5);
        if (!surveyed.ok) surveyed = null;
        return !!surveyed;
      },
      // What Space would do for `player` with its feet at (x, feet, z), or null.
      actionFor: (player, x, feetY, z) => {
        if (!player) return null;
        // A rider taken off the scene mid-ride (its body dropped) frees the line.
        if (rider && !rider.root.parent) { rider = null; R.phase = IDLE; at.d = plan.grabS; trolleyAt(); }
        if (rider === player) return R.phase === RIDE && safeAt(R.s) ? LETGO : HOLD;
        if (rider || gameMode || !surveyed) return null;
        return near(x, feetY, z) ? GRAB : null;
      },
      use: (action, player) => action === GRAB ? grab(player) : action === LETGO ? letGo() : false,
      label: (action) => action === GRAB ? "ZIP!" : action === LETGO ? "LET GO" : "HOLD ON",
      hint: (action, coarse, to) => action === GRAB ? (coarse ? `Tap ZIP! to ride the zipline ${to}` : `Press Space to ride the zipline ${to}`)
        : action === LETGO ? (coarse ? "Tap LET GO to drop here, or hold on to the end" : "Space lets go here · or hold on to the end")
          : "Hold on · nowhere safe to drop here",
      pose, poseRemote, safeAt,
      setGameMode: (on) => {
        gameMode = !!on;
        group.visible = !gameMode;
        if (gameMode) landNow();
      },
      suspend: landNow,
      dispose: () => {
        landNow();
        removeChild(root, group);
      }
    };
  };
  // DSB Land's survey queries over its geography and its one collision set: the floor is the terrain or a solid's top
  // within a step, room is above the terrain under the body and clear of every solid, and a drop-off is dry, off every
  // building and level.
  const dsbQueries = (land, solids, step) => {
    const support = (x, z, y) => Math.max(land.groundAt(x, z), solids.supportAt(x, z, y, step, PLAN_R));
    const above = (x, y, z, r) => land.groundAt(x, z) <= y + 0.02 && land.groundAt(x + r, z) <= y + 0.02 && land.groundAt(x - r, z) <= y + 0.02
      && land.groundAt(x, z + r) <= y + 0.02 && land.groundAt(x, z - r) <= y + 0.02;
    return {
      support,
      clear: (x, y, z, r, h) => above(x, y, z, r) && solids.clearAt(x, y, z, r, h),
      landable: (x, y, z) => {
        // Dry, off every building, on the ground or a harbour deck itself (never a solid's top, such as stage gear).
        if (y < BL.dsbCoast.LEVEL + 0.3 || !land.clearAt(x, z, 0.6) || Math.abs(land.groundAt(x, z) - y) > 0.05) return false;
        for (let k = 0; k < 8; k++) if (Math.abs(support(x + Math.sin(k * Math.PI / 4) * 0.5, z + Math.cos(k * Math.PI / 4) * 0.5, y + 0.3) - y) > 0.12) return false;
        return true;
      }
    };
  };
  // DSB Land's line, long and steep (76 m, 35 m down): from a launch post on the summit's south lip, off the Portara's
  // arrival, the dialer and the trail, straight down the mountain's face to the waterfront in front of the Noderunner,
  // its bollard off the road (checked in Node). It rides faster and brakes harder than the island's.
  const DSB = { top: { x: -44, z: -34 }, drop: { x: -55, z: 39 }, sag: 0.8, gap: 3, speed: 16, brake: 8, to: "down to the Noderunner" };
  BL.zipline = { DSB, PHASES, SAMPLE, REACH, HANG_MAX, PLAN_HANG, DROP_MAX, line, cableAt, survey, layout, create, dsbQueries };
})();
